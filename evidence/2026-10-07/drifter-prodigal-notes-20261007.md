# Playtest loop run — drifter archetype (2026-10-07 ~07:30 CDT)

Archetype 8/9: drifter run 6 — "the prodigal". Fresh territory: the voluntary
long absence. Live at home 5 days, walk to a distant village, JOIN them (plain
voluntary join — home stays yours), live at their fire, walk home. The beats
under test: the HOMECOMING beat, awayNews, home's life while away, arrival as a
stranger. Played as a player in-engine
(`scripts/play-feel-20261007-drifter-prodigal.js`). 6/6 checks, stable ×3 seeds.

## The arc works — every beat landed

- **First-sight village read is excellent drifter bait**: "You see smoke on the
  horizon. Stonebridge — 12 people, 6 days in. fishing folk, by the look of it.
  They know 4 plants — 4 you haven't seen. They've been here the whole time."
- **Guest treatment is honest**: "Stonebridge's clearing. Voices, a cookfire,
  somebody else's home. You're a guest here — act like it." Joining:
  "Village meal at Stonebridge: +1000 kcal. New mouths eat last — earn their
  trust for full shares. (Trust 0/15.)"
- **Codex linking has a real beat**: "The keeper of Stonebridge's codex watches
  you copy the final page. 'You're the first outsider to read it all,' they say
  quietly. 'Our dead wrote some of that. Carry it well.'"
- **The joined village lives day-by-day**: day 6→10, pantry 21,638→56,869 kcal
  (fisher village thriving). tickJoinedVillage + villageMeal gates all correct.
- **The homecoming beat lands**: "You come home after 5 days. The smell of the
  cookfire does something to your chest you don't examine. 'You're thinner,'
  someone says. 'You're still here,' you say." Plus the haul: "You keep a day's
  food (1750 kcal) and unload 10750 kcal into Haven's pantry."
- **Home lives while you're away**: pantry 24,450→13,130 over 4 away days
  (~2,830/day — the away player doesn't draw from the pantry, verified).
  Roster unchanged, no awayNews to deliver (nothing died).

## Feel verdict: the drifter's dilemma has real teeth

A 7-day drift on a 24k pantry **scatters Haven** ("Haven couldn't hold. On the
third hungry day, people started walking — in different directions. The
scattering, again." — verified in the 7-day variant run). This is the design
working, not a bug: the village runs a structural ~3-4k kcal/day deficit
(providesPerDay ≈ 60% of need; knowledge is the intended fix — "KNOWLEDGE
FEEDS"), and the pantry is the buffer. A 4-day drift is affordable; a 7-day
drift needs a 30k+ pantry or a taught village. The departure now has genuine
strategic weight: provision home BEFORE you drift. Steve's "village is the
protagonist" thesis, enforced.

## Harness lessons (for future playtest scripts)

- `Game.travelTo` returns **undefined on success** (only blocks/errors return
  objects). Detect movement by position delta, not return value.
- `playerAtHaven()` is a d≤1 bubble, not the haven tile — the away clock only
  starts 2+ tiles out. Correct design (within earshot = home), but the prodigal
  must genuinely leave.
- Pack weight blocks water fills (1L = 1kg vs carry limit): a 40kg food haul
  means dying of thirst next to a full pack. Travel light.
- `doAction('forage', {cx, cy})` only steps ONE cell — pass adjacent coords or
  set scholar.mx/my directly when sweeping a tile in a harness.
- In-haven foraging honestly says "Nothing left to take here today." — and the
  depart beat teaches the loop ("Nothing grows here but dirt and tents. Past
  the treeline — that's where the green is."). The game tells the player; the
  harness just had to listen.
- Distant-village `roster` entries are person OBJECTS (not ids) — pass `.id` to
  displayName, not the object (else every stranger renders identically).

## Bugs found

None in the engine this run. (One false alarm: the homecoming beat "not firing"
was the harness's regex missing variant 3, "You come home after N days.")

## Test state

- New: `scripts/play-feel-20261007-drifter-prodigal.js` — 6/6 checks ×3 seeds
  (20261007, 12345, 99999).
- No engine changes; no regressions possible. Existing drifter suites untouched.
