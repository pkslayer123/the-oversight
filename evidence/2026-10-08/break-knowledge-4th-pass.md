# BREAK-IT: knowledge system (target #2) — FOURTH PASS, 2026-10-08 (night run)

Hostile-player pass over the knowledge system, deliberately avoiding the
morning/afternoon/evening attack surfaces (grant squash, forage crash+leak,
codex sections, L0 codex leak, wrong-wipe, trade payment, fireside wrongness,
journal wiring, teach-flow L0, naming convergence, trade repeat farm, trade
refusals, flowVillageKnowledge narration). Found **6 new breaks** (1 exploit,
2 honesty/exploit, 2 honesty, 1 dead-code+honesty), all fixed and proven.
6 new proof suites, each RED on unfixed code, GREEN after (multiple seeds).
All 17 prior knowledge suites re-run green (the 8 pre-existing
managerCircle/managerCharge/managerDebrief/managerFear audio failures in
test-knowledge-gate-20261008 reproduce identically — unrelated, unchanged).

## BREAK 16 — tradeKnowledge accepted counterfeit currency (EXPLOIT + HONESTY)
**File:** `src/js/game.js` — `tradeKnowledge` knowledge-price branch.
`yourPlants` filtered only on `plantKnown` (L1+). A plant the player knows
only WRONGLY (wrongAs) is L1, so it counted as payment. The trade line then
printed the plant's TRUE name — "Trade: you teach X about `<TRUE NAME>`" — a
name the player never learned, and `villagerLearnsPlant` recorded the TRUE
pid for the trader: the player's false lesson was laundered into correct
knowledge while the player received real L3 knowledge in return.
**Fix:** wrongAs entries are excluded from payment currency; when the
player's only known plants are wrongly-known, the refusal names the real
reason ("real knowledge, things you're sure of... Sort the wrong ones out
first") instead of printing the true name.
**Proof:** `scripts/test-break-knowledge4-trade-wrong.js` — RED pre-fix
(res=ok, true name in line, trader learned it), GREEN post-fix × 4 seeds
(20261008, 7, 424242, 987654321).

## BREAK 17 — conversation teach spoke the true name of a wrong-known plant (HONESTY)
**File:** `src/js/conversation.js` — `teach` handler. The player teaches a
plant they believe is called W; the narration said "You show them `<TRUE
NAME>`" — a true name spoken by a mouth that never learned it. The learner
also recorded no wrongAbout, so the false name didn't travel (unlike the
fireside wrong-branch, break 8's fix).
**Fix:** narration uses the player's known name (`wrongAs || true name`);
the learner's `wrongAbout[vid][pid] = { wrongPid, deliberate: false }` is
recorded, so the wrongness travels like fireside.
**Sibling sweep:** `villageTalk` (betrayal.js) had the same class — "In
return you show them `<TRUE NAME>`" when teaching another village a
wrongly-known plant. Fixed with the same rule.
**Proof:** `scripts/test-break-knowledge4-teach-wrong.js` — RED pre-fix
(true name spoken, no wrongness travel), GREEN post-fix × 3 seeds.

## BREAK 18 — gratitude teach skipped the bad-knowledge beat (HONESTY/FUNCTION)
**File:** `src/js/game.js` — `villagerInitiative` grateful branch. The NPC
gratitude teach called `identifyPlant(pid, first)` directly — no
`wrongTeaching()` check. Every other player-facing teaching path (teachPlant,
firesideTeaching, tradeKnowledge, conversation teach) runs the bad-knowledge
beat. A grateful teacher who was wrong about the plant handed the TRUE name
for free, bypassing wrongAs/contested entirely.
**Fix:** the branch runs `wrongTeaching(rid, pid, 'gratitude')` first; a
wrong teacher teaches wrong (or gets contested), like everywhere else.
**Proof:** `scripts/test-break-knowledge4-gratitude-wrong.js` — drives the
real `villagerInitiative()` with a seeded grateful mood: RED pre-fix
(level 1, no wrongAs), GREEN post-fix (wrongAs lands) × 3 seeds.

## BREAK 19 — Union Rep picket-line spoke a true monster name (HONESTY)
**File:** `src/js/game.js` — `tbMonsterTurn` union_rep picket branch.
`"PICKET LINE!" A ${pick.name} lumbers in...` used the raw data true name
("Hushpuppy", "Flashbulb Moth", "Speedbump", "White Noise", "Glasswing
Darter" seen across seeds) while the summoned fighter itself was named
through the gated `monsterDisplayName`. Pre-System/pre-naming this is a
true-name leak for any wave-1 monster.
**Fix:** the line uses `this.monsterNoun(pick.id)` — descriptor until the
village names it.
**Sibling sweep:** all other monster say-lines route through
monsterDisplayName/monsterNoun or gated fighter names; attack names are
codex-gated (tbPatternKnown); monsterBehaviors/fieldFights/encounters have
no raw-def-name leaks.
**Proof:** `scripts/test-break-knowledge4-picket-name.js` — drives the real
`tbMonsterTurn` with a fabricated union-rep fighter: RED pre-fix (5/5 seeds
leaked a true name), GREEN post-fix (descriptors) × 5 seeds.

## BREAK 20 — studyVillageCodex was dead code behind a dangling UI promise (DEAD CODE + HONESTY)
**Files:** `src/js/game.js` (engine), `src/js/betrayal.js` (villageCard),
`src/js/hierarchy.js` (wrapper).
`studyVillageCodex` is the ONLY path that links codices and grows
`systemIntegrationLevel` — and the HUD literally promises "study 1 more
village codex → L1". But no UI surface ever called it: villageCard actions
were petition/talk/sharefood only; villageCardAction had no 'study' route.
The entire integration system was unreachable at runtime (Alien Players
class), and the promise dangled.
**Fix:** villageCard offers "📚 Study their codex" when you're AT the village
(face-to-face, like talk) and they know your face (trust 10+, the same bar
villageTalk uses for real teaching); `villageCardAction` routes 'study' to
`studyVillageCodex`. The engine function, time cost, one-shot link, and
hierarchy opinion wrapper were already correct — they just needed a door.
**Proof:** `scripts/test-break-knowledge4-study-codex.js` — static assertion
(no UI wired the function) + driving the real `villageCardAction(vid,
'study')`: RED pre-fix (no card action, null route, nothing linked), GREEN
post-fix (action offered, study summary returned, codex linked) × 3 seeds.

## BREAK 21 — examine lookalike notes leaked true species names (HONESTY)
**File:** `src/js/examine.js` — `examineDescription` Q3. The scrub only
replaced the examined plant's FULL name, but the rendered note is the first
sentence, and these leaked:
- american_ginseng: "young hickory sprouts" → "Hickory" (of "Hickory Nuts")
- greenbrier: "Thorns + tendrils = greenbrier" → own first word
- hickory_nut: "Shagbark hickory is the sweet one" → own first word
All violate examine.js's own documented rule ("examine_never_names: examine
output never contains the species name unless plantKnown").
**Fix:** the scrub also replaces the examined plant's first name-word (≥6
chars) with 'it', and any OTHER unknown species' full name / first name-word
with 'a lookalike'. Species the player KNOWS keep their names (earned
knowledge isn't censored). Caution meaning preserved ("young a lookalike
sprouts fool beginners").
**Proof:** `scripts/test-break-knowledge4-lookalike-names.js` — RED pre-fix
(3 leaks), GREEN post-fix × 3 seeds; control (known species keep names) holds.

## HELD (attacked, survived — documented, not fixed)
- **Grid/UI name gating:** villagers render through `displayName` (names
  pre-System only if earned socially); monster/animal grid sprites carry no
  names; plant/bush/tree cell glyphs gate on `plantKnown`/`treeLevel`; the
  9×9 grid labels show `Game.state.systemArrived || Game.nameKnown(rid)` for
  villagers. perceive.js hints all gated (monster desc, person displayName,
  tree species, animal descriptor).
- **Exile/new-haven fork:** `_forkNewHaven` is a real hard reset (fresh
  village object, fresh sharedKnowledge/taught/gossip; scholar codex + pack
  cross over by design). No codex duplication; the new haven gets no village
  codex object, but nothing reads it unguarded (`studyVillageCodex` only
  touches otherVillages, which get codices from genVillageProfile).
- **Codex breadth / arc triggers:** `codexBreadth()` requires level ≥ 1 for
  plants/monsters (L0 entries don't count — break 5's fix holds), all keys
  for recipes (entries only exist once learned), level ≥ 2 for skills.
  `ensureMonsterEntry` sets no level, so mere sightings don't inflate
  breadth. One blind bite can't force arc triggers.
- **Gossip knowledge transfer:** `spreadPlantKnowledge` stays slow
  (0.35/part, one learner); no gossip/rumor path grants player codex
  entries for free. Monster news travels as descriptors via the naming
  proposals, never true names.
- **New code since pass 3:** scout map marks (c3783c7) render 'shared' tiles
  as biome color only — no detail, no plant names; `observePerson` (aa651ad)
  tells reference only the CLAIMED trade's verb, never the true trade
  (gating documented in-code); convo-beats has no plant-name references;
  `apCodexEntry` gating held post-wiring (title/species/disposition gated on
  `ap.known`; the ALIENS codex section prints fields verbatim and never
  consults apPersona); `apVillageGossip` only gossips known pilots.
- **Dead-code re-sweep:** no new knowledge methods were added since pass 3 —
  aa651ad modified observePerson (called from the conversation 'observe'
  handler), c3783c7 modified the scout branch (called from
  resolveOneAssignment). Nothing new to sweep.
- **Softlock probes:** naming debate converges (pass-3 suite green);
  contested claims resolve via callOutTeaching; `pendingTrade` consumed/reset;
  `studyVillageCodex` is time-costed per call with one-shot linking (no farm).

## Proof-test result counts (this pass)
- test-break-knowledge4-trade-wrong.js: 4/4 seeds (RED pre: 16 checks failed)
- test-break-knowledge4-teach-wrong.js: 3/3 seeds (RED pre: 9 checks failed)
- test-break-knowledge4-gratitude-wrong.js: 3/3 seeds (RED pre: 6 checks failed)
- test-break-knowledge4-picket-name.js: 5/5 seeds (RED pre: 5/5 leaked)
- test-break-knowledge4-study-codex.js: 3/3 seeds + static (RED pre: 10 checks failed)
- test-break-knowledge4-lookalike-names.js: 3/3 seeds (RED pre: 9 checks failed)
- Prior 17 knowledge suites: all green, no regressions.

## Notes
- The picket-line true name "ducks in a row" (lowercase joke name) is also a
  data true name — fixed by the same gate, not special-cased.
- Break 20's fix intentionally does NOT add a study cooldown: each study
  spends a day part and teaches nothing new once exhausted; the link is
  one-shot per village. Time is the throttle.
