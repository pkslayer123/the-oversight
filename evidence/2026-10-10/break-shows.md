# Break-it: shows & broadcast (target 13) — 2026-10-10

**Verdict: HELD.** 21 attack assertions (50 checks, 150/150 across 3 seeds:
20261010, 7, 424242) — every exploit resisted, no softlocks, every honesty
promise kept, nothing dead. This is the third break-it pass over this system
(2026-10-08 alien lesson, 2026-10-09 audit-shows + contest r10) and it shows:
the scar tissue from those runs IS the attack surface now, and it held.

Proof: `scripts/test-show-break-20261010.js` — full-engine node harness
(all src/js/*.js in index.html order minus DOM-only modules, seeded RNG
before eval), 50 checks/run × 3 seeds.

## Attacks attempted

### EXPLOIT
- **E1 care-package farm**: 5 same-day direct `apCarePackage()` calls → exactly
  1 grant (favor≥20 + 1-per-4-days gates both live).
- **E2 summons-win on gated day**: `_showEnd` whiffs and SAYS SO ("The fans
  aren't organized enough yet — no care package this time").
- **E3 contestChoose double-fire**: second call returns null — `_showEnd`
  clears `activeContest` synchronously; kcal/trauma/prize apply exactly once.
- **E4 reqKcal evasion**: 0-kcal stunt choice refused OUT LOUD, no advance, no
  cost, no prize — the prize is not free on an empty tank.
- **E5 nap-wars free-heal loop**: real (+5 HP, zero cost) but not farmable —
  2/week shared budget caps it, the show pick (1/30) and notability-first cast
  are uncontrollable by the player, and sleeping to force dawn rolls costs
  full days + starvation. Documented, not a bug.

### SOFTLOCK
- **S1** fireShow twice: second modal overwrites cleanly; choosing lands.
- **S2** player death mid-show: Mouth Race `dmg:[0,4]` at 3 HP with forced max
  roll → 1 HP, never 0 (show/summons dmg clamped to health−1 in contestChoose).
  Trauma clamps at 100, never kills. **TV doesn't kill — engine-enforced.**
- **S3** broadcast frame: `broadcastEnd` on every show/summons end path;
  `state.broadcast` null after; idempotent re-end doesn't throw.
- **S4** countdown blocks re-fire: `contestTick` returns null while
  `pendingContest` exists.

### HONESTY (canon promises from docs/CONTESTS.md)
- **2/week shared budget**: forced-fire yields exactly 2 events per 7-day
  window; ratings summons consume the same slot; week rollover resets.
- **tiny_door prize**: one real usable curio (alien, tier≤1, no kcalEach,
  `class`≠food — the BEANS dinner can is filtered), said out loud.
- **summons refuse**: lands `show_refused`, grants NOTHING, −2 showbiz favor,
  said out loud. Zero-cost upside refusal doesn't exist.
- **summons phone-it-in**: +2 trauma, no prize, +1 favor, said out loud.
- Eligibility UI: `app.js` 15643+ renders `contestEligible()` (names + why);
  contest countdown renders ("The grab comes at dawn. One more day.").

### DEAD CODE
- `contestTick`, `fireShow`, `fireRatingsSummons` all called from game.js's
  dawn branch (day≥14 gate, `__summons`/`contestPool`/show routing).
- All 6 canon shows (WHY DO THEY EAT?, The Moot, Break Room, Mouth Race, Ask
  a Human, The Death Reel) in the 30-show pool; every pool show has an
  authored beat in SHOW_BEATS; `_showGenericBeat` fallback exists and is
  playable; summons phase declares `beat:'showDeclare'`.
- `viewershipBoard()` is READ — via `ledger.contestStandings()`, which fires
  in the WORD TRAVELS standings beat. Not dead.
- Castability: dead/health-0/exiled scholar cannot be summoned (tick falls
  through unconsumed; direct call refuses out loud, no modal left behind).

## Catches: none.

## Notes for future runs
- The one standing design tension: Nap Wars' free +5 heal. If Steve ever asks
  why players sleep-spam dawns, this is the pressure point — but current caps
  keep it a feature, not an exploit.
- `E1`'s favor≥20 gate is earnable through showbiz favor alone (+3/stunt);
  a player COULD grind shows to favor 20 in ~2 weeks, but the 4-day package
  gate is the real ceiling (~1.75 packages/week max, 30–70 kcal each — a
  taste, not a meal). Numbers are sane.
