# Playtest-54 / worker-monsters2 — 12 wave-2/trickster monster fights

Harness: node headless, full `src/js/*.js` eval per the template (window stubbed for load,
deleted before play). Each scenario: `Game.init()` → `Game.debugScenario(name)` →
`Game.startCombat(id)` → player teleported adjacent → played with scenario-specific
counterplay strategy, every action in try/catch. Follow-up probes in
`probe2-monsters.js`, `probe3-static.js`, `probe4-turtle.js`. Red tests in `tests/`.

## reviewdrone (Performance Review)
Verdict: PLAYABLE
Setup: review_drone, midday, spear kit, 3 tiles east.
Played: struck 4 rounds; sidestepped perpendicular when the 3-windup beam telegraphed (probe).
Found: Telegraph exposes line cells + `threatenedPlayer`. Sidestep → "You're not where it landed. Clean dodge." / "DODGE EFFICIENCY: 49% — CLEAN DODGE." The drone then adapts: "DODGE PATTERN RECOGNIZED. ADJUSTING AIM. The projected line slides sideways — toward where you went last time." Killed in 4 strikes (~25/strike vs armor 6). The counterplay works AND the monster counter-plays — delightful.
Fix: none.

## influencer (Paparazzo)
Verdict: PLAYABLE
Setup: paparazzo, midday, "Flashbulbs, three tiles east."
Played: struck 3 rounds; killed before prediction hit 4/4.
Found: Flash → freeze 1 turn + prediction counter ("Prediction 2/4 — it learns your dodge."), "Standing still makes it learn you FASTER." Killed in 3 strikes (~28/strike). The money-shot path (prediction 4 → EXCLUSIVE, unavoidable re-centered flash) and the LOS counterplay were not observed live (died too fast) but are mechanically implemented — verified in code: `pzLosFizzle` via `canSee()` at game.js:19589, flash dies in cover, prediction resets to 1, phase drops back to tracking (game.js:19571-19600). Death burst ("It erupts!", 14) on kill.
Fix: none. Minor text nit: "⚔ A SINGLE EYE IN THE DARK. IT HAS BEEN WATCHING FOR A WHILE.!" — double punctuation (see systemic nit below).

## customerservice (Understudy)
Verdict: PLAYABLE
Setup: understudy, night, "It has been watching how you fight."
Played: struck 5 rounds straight.
Found: watching → rehearsing → performing arc fired: "It is doing the thing you do before you do it." → "Your Fire-hardened spear — it has seen that one 3 times." → OPENING STEAL ("anticipated — half damage. Switch weapons.") → "It answers with YOUR Fire-hardened spear" for 27. Winnable in 5 strikes. The switch-weapons counterplay is mechanically real: observations are keyed per weapon name (`usSeen[wname]`, game.js:16606-16610), so a fresh weapon has count 0 and isn't anticipated. Scenario only issues one weapon so the switch itself wasn't exercised live.
Fix: none. Minor: "watching. learning.'s stolen Fire-hardened spear" — possessive after a period (systemic nit).

## inspiration (Bright Idea)
Verdict: NEEDS WORK
Setup: bright_idea, NIGHT (dayPart 3), spear kit.
Played: backed off whenever it brightened (per the telegraph coaching "BACK OFF. Radius 2"). Fight never ended in 30 acts — the monster cycled glow→detonate→ember forever while the player could only safely strike in the shrinking ember windows.
Found:
- Counterplay (back off) works: standing adjacent through a detonation = 23-29 + blind 2 (probe: player died). Backing off = 0 damage. Mechanically sound.
- Kill math doesn't work with the given kit: 75% physical resist (monsters.json) → ~7/strike vs 63-80 HP ≈ 9-12 strikes needed. Ember safe windows shrink per cycle (`biEmber = max(0, 3-biCycles)`, game.js:20566) → 2, 1, then 0 safe strikes. Total safe strikes ≈ 3. Killing it requires deliberately tanking detonations, which directly contradicts the telegraph coaching.
- The documented "daylight disperses it (fears daylight)" counterplay IS implemented (game.js:20591-20596: at day it flees) but the scenario runs at night, withholding it.
Fix (pick one): (a) run the scenario at dawn/day so the daylight counterplay is available; (b) make the ember phase a punish window (e.g. ember takes double physical — "strike the dying ember"); (c) lower physical resist 0.75 → 0.5. Red test: `tests/test-inspiration-20261007.js` (currently FAILs: scenario is night).

## speedbump (Speedbump Turtle)
Verdict: PLAYABLE
Setup: speedbump_turtle, midday.
Played: first stood adjacent and traded (died — 26-30 snap vs ~6/strike through armor 15 + 50% resist); then probed at spear range 2.
Found: Snap Decision is a radius-1 ambush — at distance 2 the turtle NEVER snapped (8 rounds, 0 damage taken, monster ground down 52→5). Below half HP it bunkers (chip damage only, verified: a 1-damage strike mid-fight). It never moves (speed 1, follows: false). The intended play — don't stand next to it, poke from range, wait out the bunker — works mechanically. The main-run death was correct fiction punishment for standing adjacent.
Fix: none. Note: "flip it (good luck)" weakness has no mechanic — flavor only (no flip action in game.js). Acceptable as a joke, but it's listed alongside real weaknesses.

## ducksinarow (Ducks in a Row)
Verdict: PLAYABLE
Setup: ducks_in_a_row, midday. 14 segments spawn (by data).
Played: killed tail-forward (safe, one strike per 8-12 HP segment); then probed a middle-segment kill.
Found: middle kill → "🦆 The line breaks! Now there are TWO snakes — and both are coming for you." Fragments renumber and rejoin ("The line reforms — head to tail, perfect order"). Nip chip 6-8/round when in the train's path. Tail-forward is the safe grind (14 strikes); the middle split is the trap. Both halves of the fiction are mechanically real. (Main-run bot died standing in the train's path — fair.)
Fix: none.

## static (Voice Mimic Radio)
Verdict: NEEDS WORK
Setup: voice_mimic_radio, night.
Played: (a) waited without approaching → the act broke ("It's a radio. It was always a radio.") → no-telegraph rush, died; (b) intended play — 2 waits then strike every round — 3 trials.
Found: the signature trick is fully implemented and narratively excellent, and the exposed-punish (+50% vs revealed, game.js:17242) exists. BUT the reveal transition round double-dips: the pending Distress Call resolves AND the rush fires in the same monster turn (16+22 observed). All 3 intended-play trials ended in MUTUAL KILL (player dies the same round the radio dies: ~40 breaking the act + ~20-23/round rush vs 100 HP). The codex's "Back off then" doesn't work either — the rush closes up to 6 tiles/turn (3 pre-move + 3 rush), so it can't be outrun on a 9x9 grid.
Fix: on the reveal transition, defer the rush one round (set `m.vmRushCd` when the act breaks at game.js:20209-20214) so the reveal beat is a breath, not a double hit — then the +50% punish window makes the intended play winnable. Red test: `tests/test-static-20261007.js` (currently FAILs: 2 damaging attacks on the reveal round).

## griefcounselor (Mirror Stag)
Verdict: PLAYABLE
Setup: mirror_stag, midday.
Played: sidestepped perpendicular whenever the charge telegraphed; struck otherwise.
Found: 6-tile charge telegraphed ("It's going to charge — in a straight line. MOVE SIDWAYS."), sidestep → "It slams through!" with no damage. THE WHEEL fired: "It wheels on a hoof — no windup this time. The mirror is already on you. MOVE." Took 2 charges (24-25) when the sidestep stayed on the line (bot error), killed it in 5 strikes ending at 51 HP. Pattern is visible, dodgeable, winnable.
Fix: none.

## motivationalspeaker (Heckler)
Verdict: PLAYABLE
Setup: heckler, dusk.
Played: struck; WAITed whenever compelled.
Found: shame stacks per jibe ("SHAME 2: -2 damage"), 3+ → HEADLINER ("answer back next turn or act and take +2"), WAIT → "You answer back — it costs the turn, but the words lose their weight. (-3 SHAME)", psychic chip ("the mockery cuts", 7-8), PILE-ON doubling. The dignity-vs-speed choice is mechanically real. Killed in 4 strikes ending at 74 HP.
Fix: none. Minor: "laughing at you specifically.'s You Call That A Swing?" — possessive after period (systemic nit).

## termsconditions (Landlord)
Verdict: PLAYABLE
Setup: landlord, midday.
Played: struck + moved every turn (never intentionally ending on claimed ground).
Found: claimed tiles, "RENT'S DUE." escalating (2 → 3), Eviction Notice direct (18-26), addenda mechanic in code (game.js:21721+). Killed in 5 strikes. The keep-moving counterplay is the fight's core and it fires.
Fix: none. Minor: "hammering signs into the dirt.'s the attack" (systemic nit).

## middlemanager (Union Rep)
Verdict: NEEDS WORK
Setup: union_rep, midday. NOTE: the "solo" scenario is never solo — the PICKET LINE summon fires DURING startCombat; the ally is in the fight from turn 0.
Played: struck the rep twice (56 → 33 HP), it summoned a gallowdeer (153 HP), hit half HP → WALKOUT (untargetable behind the picket line), deer beam one-shot the player (77 + 8 walkout buff = 85).
Found:
- The weakness "isolate it from other monsters" is inverted: isolating (allies < 2) GUARANTEES the conjure (`if (allies.length < 2 && !m.urSummoned)`, game.js:22044). The summon pool includes the apex gallowdeer (150-170 HP).
- "Kill it first" is impossible: the summon is immediate (turn 0), and WALKOUT makes it untargetable at half HP until all allies die — i.e. until you solo a buffed 150+ HP apex whose beam does 55-85/round.
- The 85 one-shot: deer's dwell multiplier (up to 3.5× of 22-32, game.js:15795) + 8 walkout buff, vs a player given no warning in this scenario.
Fix (pick one): (a) exclude apex-tier (gallowdeer) from the summon pool; (b) don't conjure when truly isolated — make "isolate it" actually work (the picket line needs a line); (c) give the debug scenario starting allies so no summon fires. Red test: `tests/test-middlemanager-20261007.js` (currently FAILs: forced pick summons gallowdeer, maxHp 152).

## nostalgia (Memory Projector)
Verdict: PLAYABLE
Setup: memory_projector, dusk.
Played: (a) aggressive — killed in 3 strikes before it beamed (it spent early turns in `watch`); (b) passive probe — moved 1 tile/turn, took beams 17-24.
Found: watch → spell → static phases; spell-pull drags still targets closer ("You take a step closer without deciding to."); moving 2+ tiles in a turn breaks the spell outright and cancels the telegraph (`mpSpellPull`, game.js:18822-18840; player speed is 3 so this is feasible). The 1-tile moves in the probe correctly did NOT break it. "It watches first — leave during the curious phase" and "it fears movement" are both mechanically honored.
Fix: none.

## Systemic text nit (all monsters)
Knowledge-gated descriptors ending in "." get "'s" appended raw: "watching. learning.'s", "laughing at you specifically.'s", "hammering signs into the dirt.'s". Also "WATCHING FOR A WHILE.!" (uppercase descriptor + "!"). Fix: strip trailing "." before possessive/plural suffixing in the name-composition helper (grep "'s " composition near encShortLabel/encTheName).

## Red tests (all currently FAIL = bug present, PASS when fixed)
- `hidden_files/playtest-54/tests/test-static-20261007.js` — reveal round deals 2 damaging attacks (Distress Call resolve + rush); expects ≤ 1.
- `hidden_files/playtest-54/tests/test-middlemanager-20261007.js` — forced summon pick lands on gallowdeer (maxHp 152 ≥ 140); expects no apex-tier conjure.
- `hidden_files/playtest-54/tests/test-inspiration-20261007.js` — scenario runs at night (dayPart 3), disabling the documented daylight counterplay; expects non-night.

## Verdict tally
PLAYABLE (9): reviewdrone, influencer, customerservice, speedbump, ducksinarow, griefcounselor, motivationalspeaker, termsconditions, nostalgia.
NEEDS WORK (3): inspiration (kill math vs 75% resist + withheld daylight counterplay), static (reveal-round double-dip → mutual kill), middlemanager (solo scenario auto-summons apex; "isolate it" inverted; 85 one-shot).
BROKEN (0): every fight resolved (ended in kill or player death); no hangs, no exceptions in game code (one harness-side null-read after fight end in probe4, not a game bug).
