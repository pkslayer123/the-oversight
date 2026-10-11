# Signature mechanics, Wave 3 batch B — spool / chorus_line / terms_of_service

Date: 2026-10-10. Worker: oversight-signature-build (worktree sig-w3b).
Steve's directive: build the 26 wave-3/4/5 signature mechanics properly, in wave order; telegraph honesty is law.

## What was built

**Module:** `src/js/sigW3b.js` (~700 lines). Hooks (`spoolWatch`, `chorusBeat`, `tosClauses`)
registered into the global `MonsterBehaviorHooks` dict; `monsterBehaviors.json` declares the
`preTurnHooks` per monster id. Player actions as `Game.tb*` methods + combat-panel buttons via
`Game.sigW3bCombatButtons()` (one insertion point in app.js's combat strip + one wiring block in
`wireCombatPanel`). Villager field fights get the core loop through `Game.sigW3bFieldMonster()`
(one guarded call in fieldFights.js's monster phase). New `deaf` combat status in
statusEffects.json; new `gravel` item in items.json.

### 1. SPOOL — record 3 turns, then replay them at you
- RECORD (first 3 player turns): harmless, narrated (`🎞 REC ● (n/3)`). Classification priority:
  strike > heal > move > wait (acted + no moves left) > other-act > idle, measured from state
  deltas on the spool's own turn. If the player wins initiative, the first turn is recovered
  retroactively from maxHp/position deltas.
- REPLAY: cycles the tape; strikes come back at ~recorded damage (±10%), heals HEAL the player,
  moves tug the player one tile, acts/wait do nothing (harmless mimicry / held still).
- Counterplay proven: feed it a heal → the replay heals you; feed it 3 waits → the replay is
  useless forever and you kill it at leisure. Examine-reel action reads exact numbers/order.
- The replay IS its attack (hook consumes the turn); the generic attack never fires for spool.

### 2. CHORUS LINE — visible 4/4 beat, the downbeat kicks
- Beats 1–3: count narrated (`♪ BEAT n/4 — the line faces X`), audio cue `chorusBeat` fires,
  the line shuffles a step closer (positioning pressure, no damage). Facing re-aims on beats
  1–2, FROZEN on beat 3 + downbeat (it can't turn fast).
- Downbeat: AoE kick (attack range [30,48]) aimed where the line is facing. Moved since last
  beat → ×0.25 ("moving ON the beat"); flank/rear of facing → ×0.5; dancing → 0, narrated.
- Dance costs the whole turn (real tradeoff); implemented as a per-monster consumption token
  (round-stamps proved turn-order-fragile). Gravel (consumed item) stumbles the line: no beat,
  no kick that turn.
- Deafness: `deaf` status hides the beat count but the kick still lands. The kick itself can
  deafen (25% on a full landing) — the line doesn't care that you can't hear it.
- DESIGN FIX mid-build: the generic "Downbeat" attack was firing (and narrating "Downbeat!")
  on beats 1–3 — a telegraph lie. The hook now owns all chorus turns; the kick ONLY lands on
  the downbeat.

### 3. TERMS OF SERVICE — legible clauses, object/accept/read, §0 loophole
- Every ~3 monster turns (writing consumes the turn) the scroll adds a clause from a fixed
  pool (§3 arbitration, §7 late fees, §12 harvest, §21 recording consent), shown as legible
  glowing text. Reading (a turn) reveals exact fine-print terms and counts toward the loophole.
- OBJECT now: small real cost (top pack item / 60 kcal / 40 kcal-or-food / 12 HP). ACCEPT:
  bigger cost scheduled N rounds later (scroll +40 HP & player −10 maxHP / −15% kcal /
  −20% kcal / +25 studied strike & +30 HP). IGNORE: auto-accept after 3 ignored monster turns
  ("the scroll unrolls toward you"), interval ratchets 3→2 (floored at 2 — every-turn clauses
  would be a paperwork death spiral).
- Read 3 clauses → §0 TERMINATION surfaces ("There is no fine print. That's the loophole.");
  invoking it dismisses the monster (fled → 'routed', no meat, no trophy). Non-violent, earned.

## Design calls Steve could overrule
1. Spool record = exactly 3 turns; wait-detection heuristic (acted + moveLeft 0) misfiles
   "full-move then study" as wait — both replays harmless, documented in code.
2. Chorus facing freezes on beat 3 (not just the downbeat) — the flank window is one full beat.
3. ToS ignore window 3 rounds (was 2 in first draft — too tight to read+answer); ratchet floor 2.
4. The kick can deafen — self-inflicted telegraph break, intentional.
5. §0 dismissal = fled/'routed' (counts as faced, not a kill, for wave gates).

## Proof results (all green ×3 seeds; RED with MECHANIC=off)
- `scripts/test-sig-spool-20261010.js`: 22/22 (seeds 1,2,3). Before: gate red (hook+action unregistered).
- `scripts/test-sig-chorus-line-20261010.js`: 27/27 (seeds 1,2,3). Before: gate red.
- `scripts/test-sig-terms-of-service-20261010.js`: 30/30 (seeds 1,2,3). Before: gate red.
- Regressions on the branch: `test-wave3-5-20261010.js` 211/211; `test-monsters-break-r14-20261010.js` 116/116.
- Field fights: spool record-then-replay, chorus count-then-downbeat, ToS clause/auto-accept/
  penalty all verified through `sigW3bFieldMonster` (direct hook drives + live fieldFight logs).

## Exploit / softlock checks
- Feed-it-a-heal: replay heals are fight-bounded (die when the spool dies); the heal costs a
  real item/turn to record. Not infinite.
- Boring tape (3 waits): spool never attacks; player kills it at leisure — fight terminates
  (proven: won within 200 rounds).
- Dance: untouchable but zero offense; token consumed per monster per phase — can't bank it.
- Gravel: costs an item per throw; disruption lasts exactly one monster turn.
- Loophole: requires 3 reads (3+ player turns) + the §0 turn; the scroll still attacks/clauses
  meanwhile. No shortcut.
- All proof fights terminated within the 200-round guard (wins or dismissal). No infinite loops:
  replay cycles are bounded by the spool's HP; clause interval floored at 2; beat counter is
  modular.

## Files changed
- `src/js/sigW3b.js` (new) — the module.
- `src/data/monsterBehaviors.json` — 3 behavior entries (spool/chorus_line/terms_of_service).
- `src/data/statusEffects.json` — `deaf` combat status.
- `src/data/items.json` — `gravel` item (cheap, findable).
- `src/js/fieldFights.js` — one guarded `sigW3bFieldMonster` call in the monster phase.
- `src/js/app.js` — combat-strip button slot + `data-sigw3b` wiring in wireCombatPanel.
- `index.html` — script tag after statusEffects.js.
- `docs/ONTOLOGY.md` — regenerated by validate-ontology.js (58 systems).
- `docs/MONSTER-WAVES.md` — "Signature mechanics (Wave 3, batch B)" block.
- `src/data/build-notes.json` — one player-facing entry prepended.
- `scripts/test-sig-{spool,chorus-line,terms-of-service}-20261010.js` — proofs.
