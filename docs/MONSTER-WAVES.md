# Monster Waves

The System escalates. Each major progression milestone deploys a new wave of
fauna. Earlier waves never leave — the ecosystem only gets richer and more
dangerous.

## Wave 1: Calibration Fauna (day 1+)

The System's first draft. Twisted Earth animals — a boar that charges, a deer
with headlights, a moth that flashes. The System was calibrating cameras and
didn't know what would be entertaining yet.

15 monsters: Bulldozer, Hushpuppy, Highbeam Deer, Flashbulb Moth, Choir Toad,
Lockpick, White Noise, Hummice, Speedbump, Nightlight, Ducks in a Row,
Glasswing Darter, Sunbasker — plus the wave-1 flyers (Steve 2026-10-06):
Nevermore (crow; strafing 3-lane dive, speaks with the voices of the dead)
and Night Court (great horned owl; silent double-dive — the second hearing
re-aims at where you moved).

## Wave 2: Advanced Fauna (System arrival, day 7+)

The audience had NOTES. The System got creative — less "earth animal with a
twist," more purpose-built entertainment predator. These are designed around
what the System learned about humans in week 1: we run toward crying, we
stare at our reflections, we fear performance reviews.

15 monsters (13 entertainment predators + 2 disease vectors), tougher across
the board (HP 30-170, damage 8-48 post-2026-10-09 hardening, vs wave 1's
10-170 / 4-32 — the averages tell the story: wave-2 mean HP ~89 vs ~54,
mean damage ~25 vs ~16). Players have abilities by now; the game should
feel it.

| Monster | Concept | Pattern | Activity |
|---|---|---|---|
| Static 📻 | Voice-mimic radio, cries like your friends | direct (range 3) | nocturnal |
| Grief Counselor 🪞 | Mirror-faced deer, shows you yourself | charge (6x1, windup 2) | diurnal |
| Performance Review 📊 | Drone that grades your dodges aloud | beam (6, windup 3) | diurnal |
| Inspiration 🔆 | Glowing detonation predator, greed as a targeting laser | burst (r2, windup 2) | nocturnal |
| Nostalgia 📼 | Memory projector, shows you home | beam (5, windup 2) | crepuscular |
| Extended Warranty 📱 | The call you cannot hang up on, dials stationary targets | rush | both |
| The Understudy 🎭 | Your own build, turned around — learns your favorite move | direct (windup 2) | nocturnal |
| The Landlord 🏚️ | The ground is the monster — leased tiles tax stillness | direct (windup 2) | diurnal |
| The Heckler 🗣️ | Morale damage — shame stacks, the swing is incidental | direct (windup 2) | nocturnal |
| The Paparazzo 📷 | Four shots to the money shot — flash builds over two beats | burst (r2, windup 2) | nocturnal |
| The Union Rep 📋 | It does not fight, it organizes — the picket line is the damage | direct (windup 2) | diurnal |
| The Moderator 🔨 | Wave-2 apex: content enforcement — muting and shadowban before removal | direct (range 4) | nocturnal |
| The Static Kite 🪁 | System surveillance kite, marks 3x3 scan-zones then dips to transmit (the dip is the melee window) | burst (r1, windup 2) | both |
| mosquito | Giant freakish mosquito — plainly called "mosquito" (the shock is that it's just a mosquito). Alien-disease vector: bite can land Eurika virus or East Nile virus (see docs/DISEASES.md) | rush | crepuscular |
| tick | Giant freakish tick — plainly called "tick". Latches on; vector for Lemons disease (alien pool, see docs/DISEASES.md) | single | both |

## Wave 3: Reserved (day 25 + 8 wave-2 kills)

The System's final draft. Gating logic lives in `unlockedWave()` (game.js):
wave 3 unlocks at day 25+ AND 8 wave-2 kills (village-wide). (An older plan
gated it on integration 80+ — superseded; the kill-gated schedule is the
live gate.) No wave-3 monsters designed yet. When they are, they should feel
like the System has stopped pretending these are animals at all.
(Break-it monsters r11 2026-10-09: the old text promised an integration-80
gate the engine never checks — doc now matches the code.)

## Implementation

- `wave` field on each monster in `src/data/monsters.json` (schema allows it).
- `Game.monsterWavePool()` in game.js: filters by `unlockedWave()`
  (day 8 + 4 wave-1 kills for wave 2; day 25 + 8 wave-2 kills for wave 3;
  day 50 + 5 wave-3 kills for wave 4). Earlier waves never leave the pool.
- `checkEncounter()` uses the pool. The wanderer casts via `castMonster()`, which is wave-gated on `unlockedWave()` (day 8 + 4 wave-1 kills for wave 2) — never over-leveled, never stuck on wave 1.
- Wave-2 announcement woven into `checkSystemArrival()` dialogue.
- Tests: `scripts/test-wave2.js` (gating, integrity, combat smoke), `scripts/test-wave2-harden-20261009.js` (post-hardening ranges).
- Content gate: `node scripts/validate-data.js` (monster count now 30).
