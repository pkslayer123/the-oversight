# Break-it: DISEASE system — 2026-10-10

Target: diseases (index 11). Canon read first: docs/CANON.md + docs/DISEASES.md.
Worktree: ~/workspace/worktrees/break-disease. Commit: 9b791347 (+ evidence commit).

## Verdict: BROKE 3, fixed 3 (+1 sibling). The rest held.

### CATCH 1 — Tick-escalation lie (HONESTY) — FIXED
The ambient-tick fever roll is documented (DISEASES.md, def description, UI copy)
as escalating: 3% → 15% per day attached, capped, never guaranteed. The engine
stamped `te.lastRollDay` but never `te.day`, so `daysOn` was always 1 and the
roll sat at 3% forever. "The fever risk climbs" was false.
Fix (game.js diseaseVectorTick): stamp `te.day` on the first roll, then escalate.
Proof: seeded hostile RNG 0.14 — day 1 no contraction (3%), day 5 contraction
(15%); 0.99 never fires at cap (never guaranteed).

### CATCH 2 — Legacy mirror desync (PHANTOM / HONESTY) — FIXED
`seRemove` used `shift()` (position, not identity): two overlapping diseases with
out-of-order expiry dropped the WRONG mirror entry. `cureStatus` blanket-cleared
`s.diseases`/`s.poisons`: curing gutrot while trichinosis remained wiped the
survivor's mirror — engine still sick, but the herbal_remedy button (which reads
the mirror) said "Not sick" and vanished. Journal badge lied the same way.
Fix (statusEffects.js): every engine entry gets a session-unique `_seq`, stamped
onto its mirror entry; new `seDropMirror()` removes by identity (pre-seq saves
fall back to shift()). Proof: cure-one-of-two keeps exactly the survivor's
mirror; out-of-order expiry drops the right one; natural expiry leaves no ghost.

### CATCH 3 — Rattlesnake venom was a phantom (SIBLING SWEEP) — FIXED
encounters.js (2 sites: defensive strike + butcher-bite) pushed
`{name:'rattlesnake venom'}` straight to the `s.poisons` mirror, bypassing
applyStatus — violating the engine's own single-entry rule. Result: a phantom
poison — zero tick damage, never expired, and purify burned its once-per-day use
curing nothing while the mirror (and journal badge) stayed forever.
Fix: both sites route through `this.applyStatus('scholar','poison',{name:'rattlesnake venom',...})`.
Now: real 3 HP/part tick, 6-dayPart expiry, purify actually cures.
[needs-eyes]: this ADDS a DoT where the bite previously did strike damage only.

### Dead code removed
- `def.chronic` block in tickStatuses (no def ever defined `chronic`; lemons
  never expires anyway) — misleading comment claimed a lemons aftermath.
- `m.tickRolled` write-never-read ×3 in tbTickTurn.

### Held (attacked, resisted — documented)
- EXPLOIT: contractDisease refuses all 9 alien ids; every mundane-medicine path
  (treatDisease, useMedicine, folkRemedy, sickRestTick, villagerTreatTick,
  treatVillager) iterates sickDiseases() = mundane-only. Trembles: 'no' at every
  cure tier (Fever's End/triageL3 only upgrade ease/support, never 'no'); no
  generic clear-all; expiry kills via playerDeath (mantle passes), death-cheats
  hold at the threshold per canon.
- EXPLOIT: mosquitoBiteVirus 50/50 among unheld (200 bites: 120/80), one virus
  per landed bite, held never re-rolled; alien-tick latch 50% once per latch,
  hasStatus-guarded; meat-quirks re-roll-guarded; no stacking (maxStacks 1);
  permanent viruses have no duration to reset. Save-farming: combat persists
  mid-fight but the bite roll is synchronous inside the monster's turn — no save
  point between damage and roll.
- HONESTY: alien drawbacks/abilities all wired and firing — engorge +20% (both
  eat paths), blood-sense +2 vs bleeding, gristlefit +25% + 15% lash-out,
  witness_maw -2 trust at onset + night light halved, eurika ambush warning +
  1 HP/part, east_nile crow directional warning + 2 HP/part, lemons 1 HP/part +
  energy x0.85, howlbelly night howl + detection, croakbelly/shellgut stealth
  penalties, shellgut -25% kcal + ingested immunity, flockmind quack + duck kin.
  Ambient mosquito/tick/deer-hide vectors all narrated, never silent.
- DEAD-CODE: tbMosquitoTurn/tbTickTurn wired in tbMonsterTurn; giant_mosquito +
  alien_tick are wave-2 defs in monsters.json; all 15 disease defs loadable with
  pool fields; tick_removal teachable (villagerTickTeachTick on the daily block);
  mosquitoBiteVirus reachable via landed drink.
- Pre-existing (not mine): legacy test test-disease-expiry-legacy-20261007 was
  already red on base — 27 untreated parts let the ambient wound vector inject
  lockjaw / kill the bearer (mantle pass), which the test never isolated.
  Fixed the TEST (heal each part + clear ambient between sections; assertions
  untouched): 15/15 × seeds 1–5.

### Proof
`node scripts/test-disease-break-20261010.js` — 53/53, seeds 20261010, 7, 42.
Regression: pools 66/66, rework 53/53, status-effects 51/51, expiry-legacy 15/15
(seeds 1–5), disease-breaks-20261009 26/26, parity 5/5, monster-diseases ALL.
Ontology: 52/52 validated.

### Open observation (no fix — would be inventing canon/display)
Alien chips show true names (Lemons/Eurika/…) with zero knowledge — no
symptomLabel exists for alien defs. Code comment says phenomena show names;
DISEASES.md doesn't specify. Left as-is; Steve's call if it should change.
