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

## Wave 3: The Final Draft (day 25 + 5 wave-2 LEDGER points — kills only)

The System stops pretending these are animals at all. The horror: it was
never an animal. Gating logic lives in `unlockedWave()` (game.js): day 25+
AND the wave-2 ledger reaches 5 points (kills only — 1 point per kill, 2 per
counter-kill, 2-point per-type cap). Levers in `src/data/wave-ledger.json`;
see docs/PROGRESSION.md section 12.
(HISTORY: an older plan gated it on integration 80+ — superseded. The
bal-waves engagement lanes (2026-10-10, facing/fleeing counts as "faced")
were REVERSED 2026-10-10 (Steve): engagements feed the endgame deed bars
only — they never unlock waves. Day/scale floors unchanged.)

9 monsters: The Redactor (censorship made flesh — redacts your weapon, your
footing, your last turn), Gavel (holds trials from your event log; bound by
procedure), The Focus Group (5-7 floating heads rate your actions; be boring
and they leave), Spool (replays your last 3 turns AT you; feed it a heal),
Chorus Line (synchronized AoE on a 4/4 beat — dance or eat the kick), The
Terms of Service (adds clauses mid-fight; READ IT — the loophole dismisses
it), The Callback (wears a dead villager's face; the funeral beat resolves
it), Buffering (exists 3 seconds in the past; stand still), Ad Break (pauses
the fight for an ad; patience, inattention, or murder the sponsor).

Bands (anchored — see Implementation): damage 20-70, HP 240-420, pierce
0-0.25. Wave-3 monsters are a mid-build fight (4-6 rounds at ~64
dmg/round); godhood builds stomp them — correctly.

### Signature mechanics (Wave 3, batch B)

Three wave-3 monsters got their signature mechanics built properly (2026-10-10;
telegraph honesty is law — every cue describes what the mechanic actually does):

- **Spool** — RECORD first: it harmlessly watches and tapes your first 3 turns
  (strikes, heals, moves, waits — classified from what you actually did). Then
  REPLAY: the reels visibly show what's loaded, and the tape plays your turns
  back AT you — your strike comes back as a strike, your heal comes back as a
  heal. Feed it heals and waits during the record phase and the replay is
  medicine and silence. Examine the reel to read exact numbers.
- **Chorus Line** — a visible 4/4 beat with an audio cue; beats 1–3 count down
  (the line faces a direction, re-aiming until beat 3, then frozen — it can't
  turn fast) and the downbeat kicks everything in front of it. Move on the beat
  and the kick catches air; dance and you're untouchable (but dancing is your
  whole turn); attack from the flank where the kick isn't aimed; throw gravel
  to break the count for a round. Deafness hides the beat count but not the kick.
- **The Terms of Service** — mid-fight it adds legible glowing clauses. Each is
  a real choice: OBJECT now at a small cost (an item, kcal, HP) or ACCEPT and
  pay a bigger cost rounds later; ignored clauses auto-accept as the scroll
  unrolls toward you. Reading the fine print is the defense — read three
  clauses and the §0 TERMINATION loophole surfaces; cite it and the Scroll
  dismisses itself, no blood.


## Wave 4: The Mirror Draft (4 wave-3 LEDGER points + scaleRank >= 'regional')

Steve 2026-10-10: identity is "The Mirror Draft" (not "The Audience
Draft"). The System has watched long enough to build monsters out of *us* —
our fears, faiths, formats, institutions, weaponized. The horror: it's made
of you. Gate is ledger points + scale, never pure calendar: 4 wave-3 ledger
points (kills only, village-wide) AND scale rank >= 'regional'
(`scaleAtLeast()` in game.js; reads `scaleRank()` defensively — works with
and without hierarchy.js). (The 8730921c engagement lanes were reversed
2026-10-10 — see Wave 3's history note.)

9 monsters: The Congregation (faith as a weapon — genuine absolution at the
price of obedience; heresy is the counter), The Strike (a house-sized
inflatable rat; it doesn't attack, it shuts the grid down — negotiate or
scab), The Influencer (turns the audience against you; ratio it or cancel
it), The Audit (audits your build on a schedule; deliberate jank is the
counter), The Reunion (the village you failed, given teeth — knows every
tactic you've used; novelty is the weapon), The Suburb (comfort as a trap —
you don't kill it, you ESCAPE it), The Eulogy (narrates your death before it
happens — interrupt the story), The Algorithm (the recommender, embodied —
be unpredictable, or tank on purpose), **THE EATER** (Steve's monster: the
aliens watched humans eat, thought it looked like fun, and let a monster try
it — consumes plants and animals above all else, grows stronger with the
calories it consumes, including people; the Living Garden's predator and the
dark mirror of the food thesis).

Bands (anchored): damage 35-95, HP 850-1500, pierce 0.2-0.5. A 4-6 round
fight for a godhood build (~220 dmg/round).

## Wave 5: The Producers (3 wave-4 LEDGER points + scaleRank >= 'national')

Steve 2026-10-10: identity is "The Producers" (not "Oversight Fauna"). You
are strong enough to threaten the narrative. The narrative sends its immune
system: censors, editors, cancellers. The horror: the show is fighting back.
Gate: 3 wave-4 ledger points (kills only, village-wide) AND scale rank >=
'national'.

8 monsters: The Cancellation (fights your existence in the show — un-teaches
abilities; go off-script or spend favor), The Editor (cuts your last turn,
your position, your ally — retrieve them from the cutting-room floor), The
Rerun (every 5 rounds the fight restarts — leave yourself messages, or win
fast), The Spoiler (truthful announcements that gain weight — ask binding
questions, or fulfill prophecies cheaply), The Timeslot (reschedules you to
worse venues — own the venue or get bumped), The Nielsen (ratings embodied —
FIGHT BORING), The Finale (once per fight, a 3-round countdown to an
unavoidable [150,200] strike — feed it a sacrifice, or end it first), The
Network Note (gives the System notes live — kill it first, or feed it bad
notes).

Bands (anchored): damage 50-130, HP 1000-2200, pierce 0.25-0.75. The apex
(Cancellation, Editor, Finale) is a 7-10 round fight for a godhood build;
the Finale's strike takes ~70 through god armor — the wall holds.

### Doom-countdown ruling (Steve 2026-10-10)

Eulogy/Finale doom deaths trigger `phoenix_clause` / `second_wind` the same
as any death — "unkillable means unkillable." `maybeCheatDeath()` is the
single death choke point; no bypass exists. A random villager burns in the
ash-death; the villager pool is the cap.

## Implementation

- `wave` field on each monster in `src/data/monsters.json` (schema allows it;
  `pierce` added to the schema 2026-10-10 — the armor-pierce hook's first real
  assignments).
- `Game.monsterWavePool()` in game.js: filters by `unlockedWave()` — the WAVE
  LEDGER (2026-10-10, Steve's reversal of 8730921c): day 8 + 5 wave-1 ledger
  points (kills only) for wave 2; day 25 + 5 wave-2 ledger points for wave 3;
  4 wave-3 ledger points + scaleRank >= 'regional' for wave 4;
  3 wave-4 ledger points + scaleRank >= 'national' for wave 5. Levers:
  `src/data/wave-ledger.json`; docs/PROGRESSION.md section 12.
  Earlier waves never leave the pool. Engagements (distinct monsters fought
  blow-by-blow — fled or won — via the deed feed's wavesFaced) feed the
  ENDGAME deed gate only; they score nothing on the ledger.
  VILLAGER XP LAW (Steve 2026-10-10, ledger update): a villager's real
  blow-by-blow fight feeds the deed bars exactly like the player's — and
  villager KILLS score the ledger exactly like the player's. The village is
  the protagonist. Deed-feed dedupe is keyed by monster type (dedupe:
  villager + player facing the same type = one count); the LEDGER instead
  caps points per type (perTypeCap=2). vDie records nothing (the dead
  told no tale); evade and alreadyDead record nothing. (Pre-fix, the
  fieldFight deed wrap never attached — an arrow-function `this` bug — so
  villager fights fed nothing at all; fixed 2026-10-10.)
- `Game.scaleAtLeast(rank, need)`: village -> local -> regional -> national ->
  global ladder; unknown ranks treated as 'regional' (defensive — scaleRank()
  is built in parallel in hierarchy.js).
- `Game.spawnWaveTarget()`: 60%-newest ratios extended (w4: 60/20/15/5;
  w5: 55/20/12/8/5).
- `Game.waveUnlockBeat(wave)`: woven System-voice beats on unlock (The Final
  Draft / The Mirror Draft / The Producers) — reactive, never scripted.
- Endgame deed gate (Steve 2026-10-10, retuned for the ~100-day target):
  the table requires progressing through EVERY wave, blow-by-blow —
  `deedGateReady()` in progression.js needs 5/5/4/3/2 DISTINCT monsters
  fought per wave 1-5 (fed by real startCombat/recordWaveKill/fieldFight,
  never unlocked-only), plus 3+ contests survived, scaleRank >= 'national',
  3+ crises, sentimentTaught + feastSurgeUsed + stage >= 3. Knowledge never
  gates. Pacing audit (`scripts/sim-wave-pacing-20261010.js`): a strong run
  (a real fight every ~2 days) unlocks w5 ~day 77-93 and faces 2+ distinct
  Producers ~day 83-99 — the bars complete inside a ~100-day game; slower
  runs slip later, reactively. The day floors in the unlock gates (day 8,
  day 25) were already floors, never scripts, and stay.
- `checkEncounter()` uses the pool. The wanderer casts via `castMonster()`, which is wave-gated on `unlockedWave()` (day 8 + 5 wave-1 ledger points for wave 2) — never over-leveled, never stuck on wave 1.
- Wave-2 announcement woven into `checkSystemArrival()` dialogue.
- Tests: `scripts/test-wave2.js` (gating, integrity, combat smoke), `scripts/test-wave2-harden-20261009.js` (post-hardening ranges),
  `scripts/test-wave3-5-20261010.js` (211 checks x 3 seeds: schema-clean roster,
  kills+scale gating incl. defensive no-scaleRank path, combat smoke per
  monster, anchored bands, unlock beats, doom ruling, knowledge gates).
- Sim anchor: `scripts/sim-dps-anchor-20261010.js` (seeds 1-3). Measured:
  godhood brawler (One-Person Army kit, worldbreaker_maul, alien armor P=138)
  ~220 dmg/round; godhood hunter (Apex Predator kit, apex_bow) ~230/round;
  mid build (hunter kit lvl 2, fire-hardened spear, P=64) ~64/round.
  Wave-5 damage bands validated (8-21/round through P=138, matching the
  draft's max-build math); HP bands set from measured DPS x target fight
  length (w5 apex 7-10 rounds, w5 rest 5-7, w4 4-6, w3 4-6 at mid DPS).
- Content gate: `node scripts/validate-data.js` (monster count now 56).
  NOTE 2026-10-10: the validator crashes pre-existing on events.json (line
  157, `get(...).forEach is not a function`) before validating anything —
  wave-3/4/5 entries were validated by `scripts/schema-check-wave35-20261010.py`
  (mirrors the validator's logic) instead.
