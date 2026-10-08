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

13 monsters, tougher across the board (HP 30-170, damage 12-34 vs wave 1's
12-70 / 6-30). Players have abilities by now; the game should feel it.

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

## Wave 3: Reserved (integration 80+)

The System's final draft. Gating logic exists in `monsterWavePool()` —
wave 3+ monsters spawn only after System arrival AND deep integration (80+).
No wave-3 monsters designed yet. When they are, they should feel like the
System has stopped pretending these are animals at all.

## Implementation

- `wave` field on each monster in `src/data/monsters.json` (schema allows it).
- `Game.monsterWavePool()` in game.js: filters by `state.systemArrived` and
  `scholar.integration`.
- `checkEncounter()` uses the pool. The wanderer is hardcoded wave-1.
- Wave-2 announcement woven into `checkSystemArrival()` dialogue.
- Tests: `scripts/test-wave2.js` (148 checks: gating, integrity, combat smoke).
- Content gate: `node scripts/validate-data.js` (monster count now 28).
