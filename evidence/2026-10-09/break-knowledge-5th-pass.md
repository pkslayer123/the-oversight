# BREAK-IT: knowledge system (target #2) — FIFTH PASS, 2026-10-09

Hostile-player pass over the knowledge system, deliberately avoiding all 21
prior kills (breaks 1–15 in evidence/2026-10-08/break-knowledge.md, 16–21 in
break-knowledge-4th-pass.md). Found **3 new breaks** (1 exploit, 1
honesty/softlock compound, 1 dead-state/honesty), all fixed and proven.
2 new proof suites, each RED on unfixed code, GREEN after (multiple seeds).
All prior knowledge suites re-run green (6 knowledge4 suites, grant engine,
exploit sweep, softlock, fireside-wrong, wrongwipe, tradeecon, deadcode,
gating, journal, codex-sections). Ontology 50/50.

## BREAK 22 — wrongAs never cleared on grant-path truth (HONESTY + SOFTLOCK)
**File:** `src/js/game.js` — new `resolveWrongName(pid, how)`, wired into
`_grantPlant`, `tradeKnowledge`, `combineKnowledge`, both tasting L2→L3 sites.
The false-name flag (`wrongAs`) was cleared ONLY by the harvest-familiarity
L1→L2 path. Every other truth-learning path raised the level while the lie
stayed stuck — and learning the truth at L3 (village codex, trade) made it
stuck FOREVER, because the harvest path requires `level === 1`. Consequences
of the stuck flag: the codex card kept leading with the false name +
"⚠ Taught wrong… You haven't verified it yourself" (a lie — you verified at
L3); the plant stayed excluded from trade currency (break-16 filter); the
conversation and betrayal teach flows kept speaking the false name you now
knew was false.
**Fix:** `resolveWrongName(pid, how)` clears the false label on every genuine
learning level-up, narrates the correction ("The record corrects itself…"),
and marks the disagreement contested (unresolved) so the player still gets
the one callout beat. The deliberate-liar flag is looked up from
`wrongAbout` instead of hardcoded `false` (sibling honesty fix, incl. the
harvest path which also hardcoded it).
**Sibling sweep:** all direct plant-level writers audited — `_grantPlant`,
tradeKnowledge direct write, combineKnowledge, eat()/eatOne() tasting sites
all wired; harvest L1→L2 already handled; harvest L3→L4 unreachable with
wrongAs post-fix.
**Proof:** `scripts/test-break-knowledge5-wrongas-clear.js` — 13 checks × 3
seeds (grant/combine/taste/bulk/deliberate/control). RED pre-fix (8 fails/
seed: sticky wrongAs, blocked trade currency, no contested marker),
GREEN post-fix.

## BREAK 23 — contested→callOut was an infinite trust farm (EXPLOIT)
**File:** `src/js/game.js` — `callOutTeaching` now clears
`wrongAbout[vid][pid]` on resolution.
`wrongTeaching()` minted a FRESH contested marker on every call (overwriting
resolved ones) and the teacher's wrongness was never cleared, so the same
lie could be re-taught and re-corrected forever via repeatable triggers
(haul lessons, fireside, gratitude): +2 trust per quiet callout (progressive
but uncapped below 100), witness trust bumps per public callout,
`calloutsDone` climbing. Copy-vs-engine too: the quiet-liar branch promises
"they don't lie to you again" — but they did, every teach.
**Fix:** resolution clears the teacher's wrongness for that plant — one
correction per wrongness, the farm is dead, and the copy is now true.
**Proof:** `scripts/test-break-knowledge5-callout-farm.js` — pre-fix
`w1=contested w2=contested` (farm re-fires); post-fix `w2=null`. 11 checks ×
3 seeds, RED pre-fix (4 fails/seed), GREEN post-fix.

## BREAK 24 — `distrusted` was a dead write behind an honest-sounding promise (DEAD + HONESTY)
**File:** `src/js/game.js` — `spreadPlantKnowledge` now skips distrusted
villagers as rumor teachers.
The public callout set `village.distrusted[vid] = true` ("the village now
discounts their word") but NOTHING ever read it — the village discounted
nothing. Now an exposed liar's word carries no weight: they are never chosen
as the rumor teacher, so their "teachings" don't spread. Small, legible,
exactly what the copy promises.
**Proof:** same suite — distrusted sole-knower stalls the rumor; control
(non-distrusted) spreads it. RED pre-fix, GREEN post-fix.

## HELD (attacked, survived — documented, not fixed)
- **Forage→familiarity→camp-sort loop:** encounters accumulate toward a
  threshold "click," but it's time-costed (3 ticks/teach, 8-tick sort ritual,
  threshold 2–4 field handlings) — the intended learning-by-doing, not a farm.
- **`integrate()` (neural depth → ability slots):** capped at 100, every
  caller is a one-shot event or a gated achievement — no farm found.
- **`villagerLearnsPlant`:** flat dedup'd "knows" list, no levels tracked
  for villagers — cannot record unearned depth.
- **Trade repeat farm (break 13):** re-verified — one-shot lesson, 'known'
  early-return, no re-charge. Holds.
- **Journal entry beats:** all wraps check return values or diff
  before/after — no "learned" lines on failed grants. Holds.
- **Monster pattern gating:** `tbLearnPattern` writes only on lived-through
  attacks; `tbPatternKnown` gates every display site. Holds.
- **Animal codex section:** entries only exist at granted level ≥ 1, so the
  always-true `encAnimalKnown` fallback leaks nothing (vestigial, noted).
- **Save/load:** full-state serialization carries wrongAbout/contested/
  encounters — no knowledge duplication found (persistence rounds covered
  the mechanics).
- **Contested markers vs dead claimants:** unresolved markers only gate the
  optional callout choice; nothing blocks on them — no softlock.
- **Conversation teach labels:** voiced dialogue lines, no cost claims —
  nothing to be dishonest about.

## Minor dead-code notes (not fixed — harmless, recorded)
- `scholar.calloutsDone`: incremented, never read. Write-only counter;
  left in place (may feed future stats), not wired to avoid gold-plating.
- `Game.encAnimalKnown`: referenced (guarded) in abilityActions.js/app.js
  but never defined — always falls back to "known." Honest only because
  animal entries are level-gated at creation.

## Proof-test result counts (this pass)
- test-break-knowledge5-wrongas-clear.js: 13/13 × 3 seeds (RED pre: 8 fails/seed)
- test-break-knowledge5-callout-farm.js: 11/11 × 3 seeds (RED pre: 4 fails/seed)
- Regressions: 6 knowledge4 suites + grant-engine (34) + exploit-sweep +
  softlock + fireside-wrong + wrongwipe + tradeecon + deadcode + gating +
  journal (52) + codex-sections — all green. Ontology 50/50.
