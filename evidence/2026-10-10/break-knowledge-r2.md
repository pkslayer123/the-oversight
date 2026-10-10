# Break-it: knowledge system, depth pass r2 — 2026-10-10

Target: the knowledge system (index 2), r2. Canon read first: docs/CANON.md,
docs/CONVERSATIONS.md, docs/PERCEPTION.md, docs/PEOPLE-JOURNAL.md. Prior run
(break-knowledge.md, this morning) fixed true-name leaks, the plantCalledName
footgun, the prep-ladder bypass, and dead grantKnowledge tree/monster branches —
all re-verified green (28/28). Its "noted tensions" are Steve-level design
calls and were NOT touched. This pass attacked the REST of the knowledge system.

## Verdict: BROKE + FIXED (4 catch classes, 9 proof assertions fail on HEAD)

Proof: `scripts/test-break-knowledge-r2-20261010.js` — **9 FAIL on HEAD,
40/40 green after (seeds 20261010/7/42)**. Prior suites still green:
test-break-knowledge-20261010 (28/28), test-journal-knowledge-20261007 (52/52).
Ontology 52/52. test-perceive.js 24 pass / 2 fail — pre-existing on pristine
HEAD (documented in the morning run; neither file touched here).

## K1. HONESTY — deliberate liars read as honest mistakes on the harvest path (FIXED)

The harvest-handling wrong-name resolution (game.js, forage sweep depth block)
marked every resolved liar `contested.deliberate=false`. Root cause: the line
read `(wb2[pid] || {}).deliberate`, but `pid` is NOT in scope inside the
`for (const h of harvested)` loop (only `h.plantId` is — the `const pid` at
the sweep above belongs to a different loop). ReferenceError → swallowed by
the surrounding try/catch → `wasDeliberate` stayed false. The 2026-10-09
break-it fix for this ("was hardcoded false") NEVER FIRED — a claimed fix that
silently didn't. This changes play: `callOutTeaching` treats liars differently
(public humiliation marks them `distrusted`, different trust penalties and
copy) — every liar got the gentle honest-mistake treatment instead.
Fix: `wb2[pid]` → `wb2[h.plantId]`. Sibling sweep of the same class: the other
two `deliberate` reads are correct (`wrongTeaching` uses the `wrong` object;
`resolveWrongName` takes `pid` as a real parameter). Proof: deliberate liar →
contested.deliberate=true after one resolving sweep; honest-mistake control →
false.

## K2. EXPLOIT — harvest double-counting (HELD)

Attacked the per-sweep pacing: rigged a 9-cell same-species sweep. harvests
went 0 → 1, not 9; no instant L2. The 2026-10-09 per-sweep fix holds — the
L1→L2 (5) and L3→L4 (15) ladders are field VISITS, not cell touches. Nothing
to fix.

## K3. EXPLOIT — teach-loop trust farming (HELD)

30 consecutive bad-education `teachPlant` lessons: trust capped at 40 ("words
only go so far"), no identification ever fired, encounters ticked (progress,
not free), and every lesson cost real time (`actionClock` advanced 3 ticks
each). The trust-cap fix from the earlier knowledge/social runs holds. The
exploit surface is the encounter counter, but each +1 costs 3 ticks of a
finite day — priced, not free. Nothing to fix.

## K4. HONESTY — ambient rumor paths minted silent player knowledge (FIXED)

`spreadPlantKnowledge` and the fireside true-path wrote the PLAYER into
`village.taught[]` without `identifyPlant`. The player's codex never learned
the plant, but taught[] credited it — silent knowledge-factor bookkeeping for
plants "you don't know," violating the invariant stated at identifyPlant:
"Your own taught[] syncs with your codex." Notably, the fireside
WRONG-teaching branch already excluded the player (`if (rid === this.villagerId)
continue`) — the true path was the inconsistency. Fix: the player is no
longer a learner in `spreadPlantKnowledge` (they can still TEACH the fire —
`knows()` unchanged) and is skipped in the fireside ambient loop; their
listening path is the presence-gated 0.6 `identifyPlant` roll, which syncs
taught[] itself. Villager-to-villager spread is untouched (verified: villagers
still learn at the fire). Proof: after 30 rumor rounds + a forced-miss
fireside, taught[me] ⊆ codex-known holds.

## K5. HONESTY — journal diary printed the true name for wrongly-named plants (FIXED)

The journal is the player's hand — a false label is still their label until
corrected. `learnPart`'s say-line already used the believed name
(`_calledName`), but the diary entry it wrote used `p.name` (the TRUE name);
`thickenKnowledge`'s "Confirmed: …" line did the same in both say and diary.
For a wrongAs plant, the diary recorded a name the player doesn't believe
yet — a true-name leak in the most personal surface. Fix: both use
`_calledName(pid)`. Proof: diary for a wrongly-taught dandelion now reads the
believed name and never prints the true name.

## K6. HONESTY — System arrival (HELD, by design)

Day-7 arrival labels EVERYONE (`knownNames` for the whole roster) — this is
the documented diegetic beat ("It feels invasive next to the names you earned
by talking and listening"), not a leak. Verified it grants ZERO plant
knowledge: codex.plants unchanged by arrival itself; village knowledge flows
only through the later daily briefings (`flowVillageKnowledge`, post-arrival).
Held.

## K7. HONESTY — phantom "XP halved" promise (FIXED)

betrayal.js's other-village codex-teaching promised "(XP to next level is
halved)" — no plant-XP mechanic exists anywhere, and `sharedHeadStart` is a
write-only flag nothing reads. A future worker building on that comment would
inherit a lie. The player-facing say-line was already honest ("knowledge L2,
learned from X"); fixed the comment to match the engine and documented the
flag as write-only.

## DEAD CODE — knowledge modules (HELD)

Audited all four: examine.js (9 exports — observePlant, observationOf,
observedPlant, examineQuality, examineDescription, resolveCellSpecies,
examinePlantCell, recognitionBeat, plantVisualDepth) — every one called at
runtime (game.js/app.js/food.js + internal). perceive.js —
`Game.perceptionHints` consumed by app.js:13529. codex-people.js — all wraps
chain properly (capture-then-wrap; no clobbering of journal.js's earlier
wraps). journal.js — the "unused-looking" methods (plantPartsList, learnPart,
recordThinKnowledge, thickenKnowledge, writePlantEntry, journalPlantEntries,
plantJournalEntry, marginaliaFor, recordPlantMark, plantMarks, recordLifeMark,
lifeMarks, mantleRecord) are all called internally via the wrapper layer and
the codexEntries wrap; `journalOpening` IS wired in app.js:15755 (fixed the
stale "UNWIRED as of 2026-10-08" comment). No dead knowledge modules.

## Noted but not changed

- `sharedHeadStart` remains a write-only flag (harmless; documented in the
  comment rather than removed — a future mechanic may read it).
- The betrayal direct-write (`mine[pid] = {...}` bypassing identifyPlant's
  village-spread/drama beats) is a design tension, not a break — the say-line
  is honest; rerouting through grantKnowledge would change the drifter
  homecoming beat. Left alone.
- Examine button ('🔍 Examine') doesn't quote its 15 kcal / 8 tick cost, but
  the repo's cost-honesty convention targets misleading/expensive actions
  (Boil, Walk) — 15 kcal is below that bar and the button promises nothing
  about cost. Held.

## Files

- `src/js/game.js` — wb2[h.plantId] deliberate fix; player excluded from
  ambient taught[] learning (spreadPlantKnowledge, firesideTeaching)
- `src/js/journal.js` — diary believed-name (_calledName) in learnPart +
  thickenKnowledge; stale UNWIRED comment corrected
- `src/js/betrayal.js` — phantom "XP halved" comment corrected
- `scripts/test-break-knowledge-r2-20261010.js` — 40 assertions, 9 fail on HEAD
