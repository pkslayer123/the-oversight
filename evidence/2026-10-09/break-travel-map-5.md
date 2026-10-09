# Break-it: travel & map, round 5 — explorer attacks (2026-10-09)

Hostile-player attack on travel/map/examine, round 5. Rounds 1–4 closed
travel-spam, fog render leaks, codex MAPS gating, mid-combat engine guards,
pit-death, cost-label lies, and the teleport audit. The 2026-10-09 morning
explorer run held 9/9 on: eagle_eye modifiers, tree-species gating, bush
chain-reveal, contest-grab mid-combat, water-lock stranding, examine tick
honesty, walk kcal accounting, whisper silencing, travelTargets flags.
This round attacked NEW surfaces: examine knowledge-farm pacing,
post-death engine actions, and monster-alias staleness across node travel.

Verdict: **BROKE + FIXED — 3 real breaks** (1 knowledge-pacing exploit,
1 post-death phantom action, 1 fog/phantom hint). Examine cost honesty and
the species-study hint promise held.

## BREAK 1 — EXPLOIT: same-cell examine spam farmed skills (FIXED)

**Attack:** `feedKnowledge` (carexplore.js `examineCell`) fed encounters on
EVERY examine with no per-cell cap. Four stares at one tree = 4 track_read
encounters = `learnSkill('track_read')` — 8 ticks, 0 kcal, 0 movement. The
documented pattern ("4 encounters = learnSkill") counts distinct encounters;
same-cell spam collapsed it to one tree.

**Measured (pre-fix, seeded):** 4 examines of one tree → encounters=4,
learned=true, cost 8 ticks.

**Fix:** per-cell per-skill cap of 2 encounters' worth in `feedKnowledge`
(the surface look + the first deep study). Distinct ground still teaches:
4 different cells × 1 look → learned (guard test E1b). Species study is a
separate counter, unaffected. Observant characters keep their +2 feeds
within the same cap — the cap is per cell, not per trait.

**Design call (Steve-overridable):** "one cell, two lessons' worth." Staring
longer still drives species study and narrative; it just stops minting
encounters.

**Proof:** `scripts/test-explorer-attack-20261009.js` E1 — BEFORE:
encounters=4, learned; AFTER: encounters=2, not learned. E1b (distinct-cell
guard): learned=true both before and after. ×3 seeds.

## BREAK 2 — SOFTLOCK/HONESTY: examine after death (FIXED)

**Attack:** `Game.examineCell` had no `this.over` guard (travelTo has one).
Calling it dead: full narration, `tickAction(2)` advanced the world
(npcBatchTurn + monsterTurn ran for a corpse), and `this.save()` fired.

**Measured (pre-fix):** `over=true` → examineCell returned truthy, 80 chars
narrated, dayTicks +2.

**Fix:** `if (this.over) return null;` at the top of `examineCell`
(travelTo's precedent — silent refusal; the UI is the death screen).

**Proof:** S1 — AFTER: ret=null, 0 log chars, dayTicks delta 0. ×3 seeds.

## BREAK 3 — FOG/HONESTY: phantom monster hint after node travel (FIXED)

**Attack:** a non-following world monster (e.g. gallowdeer, follows=false)
stays on the OLD tile when you leave (continuity — correct), but
`travelTo` never re-synced `scholar.monster`. `perceive.js` read the stale
alias directly and reported the old tile's monster as "nearby" on the new
tile — a phantom danger hint (and a fog leak: presence revealed for ground
you're not on).

**Measured (pre-fix, seeded):** gallowdeer at old-tile (1,4), travel east,
enter at (0,4) → "Something moves nearby — …" fires; alias tx/ty ≠ player
tile (aliasStale=true).

**Fix (two levels, both follow existing patterns):**
- `game.js` `travelTo`: `this.syncMonsterAlias()` after the position update —
  honors the alias contract ("scholar.monster always mirrors the
  player-tile monster").
- `perceive.js`: danger branch reads via `playerMonster()` when available
  (the pattern app.js already uses everywhere) — correct even for teleports
  that bypass travelTo (returnToVillage PIN, exile pins, debug).

**Proof:** H1 — AFTER: phantomAfter=false, aliasStale=false. ×3 seeds.

## HELD (attacked, resisted)

- **Examine cost honesty (H2):** "2 ticks, time-only" — measured exactly
  2 ticks, 0 kcal. tickAction is time-only; the label is a promise kept.
- **Species-study hint promise (H3):** "One more careful look should do
  it" at study 2 → the next deep examine teaches the species name. The
  E1 cap doesn't touch the species-study counter (verified no interference).
- **Follow mechanic re-entry:** monsters with `follows` move WITH the player
  (object identity preserved, tx/ty updated) — the alias stays valid; only
  non-followers went stale.
- **Ontology gate:** `scripts/validate-ontology.js` 50/50, release permitted
  (two new rules needed single-line `(code:)` citations — the validator
  rejects multi-line rule entries).

## Regression notes (pre-existing, not mine)

- `scripts/test-perceive.js`: 2 failures ("known monster named",
  "stash hint lists contents") reproduce identically at HEAD — stale test
  expectations (identifyMonster naming flow; haven coordinate assumption),
  unrelated to this run.
- `scripts/test-movement-actions.js`: flaky by construction (unseeded
  Math.random; 1–7 fails across runs at HEAD too). Never calls travelTo —
  mechanistically unrelated to this run's changes.
- `scripts/test-tree-examine-grammar.js`: 1 failure at HEAD too (unseeded
  description RNG).

## Files changed

- `src/js/carexplore.js` — feedKnowledge per-cell cap (2/cell/skill);
  examineCell `this.over` guard; ontology rules (examine_farm_cap,
  no_post_death_examine)
- `src/js/game.js` — travelTo syncMonsterAlias() on arrival; ontology rule
  (monster_alias_resyncs_on_travel)
- `src/js/perceive.js` — danger hint via playerMonster(); ontology rule
  (danger_hint_derives_from_tile)
- `docs/ONTOLOGY.md` — regenerated by validate-ontology.js
- `scripts/test-explorer-attack-20261009.js` — new proof test (E1/E1b/S1/H1/H2/H3)
- `evidence/2026-10-09/break-travel-map-5.md` — this file

## Verification

- `node --check` on game.js, carexplore.js, perceive.js: OK
- `scripts/validate-ontology.js`: 50/50 validated, release permitted
- New proof test: BEFORE 3/6 broke (E1, S1, H1), AFTER 6/6 held —
  seeds 20261009, 7, 999
- Regressions: test-travel-breakit 13/13, test-travel-fog4 32/32,
  test-continuous-travel 21/21, test-blocked-travel-feedback 13/13,
  break-travel-animal 5/5, clamps 4/4, sib-clamps pass, spam 5/5,
  barrierblock 7/7, doublecharge 2/2, pitdeath 4/4,
  attack-explorer-20261009 (morning run) 9/9 held,
  test-movement 48/48, test-examine-unit 28/28, test-examine-recognition
  22/22, test-tree-examine-gating 4/4

## Design flags (not changed)

- The per-cell cap is 2 encounters regardless of trait — an observant
  character still learns track_read from 2 distinct cells (2×+2). If Steve
  wants observant to learn from a single deep study, the cap becomes
  per-trait; flagging, not fixing.
- `test-movement-actions.js` and `test-tree-examine-grammar.js` are flaky
  by unseeded-RNG construction (AGENTS.md PROOF-TEST RNG STABILITY lesson);
  fixing them means seeding the tests, not the game — left for a test-hygiene
  pass.
