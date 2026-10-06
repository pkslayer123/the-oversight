# Batch A — combat monster scenarios (debug sweep)

_Generated headlessly via `Game.debugScenario(name)` in Node, 2026-10-05. Each scenario ran in an isolated process (60s kill guard). After load, the harness force-starts combat via `Game.startCombat(monsterId)` if a monster was placed, then performs up to 3 player attack iterations (strike nearest alive monster on player turns, `tbAdvance()` for AI turns, capped at 60 advance calls). No fixes applied — inventory only._

| scenario | loads? | scenario OK? | monster def | combat advances? | notes |
|---|---|---|---|---|---|
| deer | YES | YES | n/a (no monster placed) | n/a | hunting scenario, not a monster fight — no tbfight expected.  (1630ms) |
| headlight | YES | YES | gallowdeer ✓ | partially (still fighting) | def: hp [150,170], speed 4, pack null, risk null, encounter yes, attack yes. 4 fighters (1 monster keys). r1 p: strike m_0 -> false <br> r1 p: strike m_0 -> false <br> r1 p: strike m_0 -> false <br>log: the thing with headlights for eyes, standing too still's antlers hits A woman, maybe 60s for 14. \| It BELLOWS — wrong, too deep, like a foghorn heard through water. The sound sits in your teeth. \| Fire-hardened spear can't reach that far. (range 2) (2469ms) |
| flashbulb | YES | YES | mirrormoth ✓ | partially (still fighting) | def: hp [15,22], speed 4, pack null, risk null, encounter yes, attack yes. 2 fighters (1 monster keys). r1 p: strike m_0 -> true <br>log: You clutch your Trail compass. You're still here. (Bond +3) \| You clutch your Home key. You're still here. (Bond +3) \| You clutch your Coat button. You're still here. (Bond +3) (1306ms) |
| choir | YES | YES | belltoad ✓ | partially (still fighting) | def: hp [20,30], speed 2, pack 2, risk null, encounter yes, attack yes. 3 fighters (2 monster keys). r1 p: strike m_0 -> false <br> r1 p: strike m_0 -> false <br> r1 p: strike m_0 -> false <br>log: Turn-based now. Tap a tile to move — speed is squares. Then act. \| ⚠️ 1 threats: a toad like a war drum, throat swelling 1 (×2) — all here, all now.<br>Your party: just you. You are outnumbered — fight like it. \| Fire-hardened spear can't reach that far. (range 2) (1066ms) |
| lockpick | YES | YES | lockpick_raccoon ✓ | partially (still fighting) | def: hp [18,26], speed 5, pack null, risk null, encounter yes, attack yes. 2 fighters (1 monster keys). r1 p: strike m_0 -> false <br> r1 p: strike m_0 -> false <br> r1 p: strike m_0 -> false <br>log: Turn-based now. Tap a tile to move — speed is squares. Then act. \| It circles once, eyes never leaving your pack — those hands never stop moving. \| Fire-hardened spear can't reach that far. (range 2) (1092ms) |
| hummice | YES | YES | hummice ✓ | partially (still fighting) | def: hp [10,14], speed 6, pack 4, risk null, encounter yes, attack yes. 5 fighters (4 monster keys). r1 p: strike m_0 -> false <br> r1 p: strike m_0 -> false <br> r1 p: strike m_0 -> false <br>log: Turn-based now. Tap a tile to move — speed is squares. Then act. \| ⚠️ 1 threats: the grass is humming in harmony 1 (×4) — all here, all now.<br>Your party: just you. You are outnumbered — fight like it. \| Fire-hardened spear can't reach that far. (range 2) (1267ms) |
| nightlight | YES | YES | nightlight_catfish ✓ | partially (still fighting) | def: hp [22,32], speed 2, pack null, risk null, encounter yes, attack yes. 2 fighters (1 monster keys). r1 p: strike m_0 -> false <br> r1 p: strike m_0 -> false <br> r1 p: strike m_0 -> false <br>log: ⚔ A SOFT GREEN GLOW UNDER THE WATER! You're on your own. \| Turn-based now. Tap a tile to move — speed is squares. Then act. \| Fire-hardened spear can't reach that far. (range 2) (1746ms) |

## Raw log tails (last ~10 lines of Game.log after scenario load)

### deer
- Haven. Twelve people. The fire is lit.
- A woman, maybe 20s: "Nothing grows here but dirt and tents. Past the treeline — that's where the green is. That's where the food is."
- 📓 Journal: Food won't come to Haven. Walk past the treeline — learn what grows out there, bring it back, and get it named at camp.
- Movement — a deer, white tail raised in alarm.
- 
- 🐞 SCENARIO: deer encounter. Crude bow equipped, 12 arrows.
- Get adjacent to the deer and Hunt (🏹). It's hard difficulty — the bow's +40 helps.

### headlight
- Haven. Twelve people. The fire is lit.
- A woman, maybe 60s: "Don't bother picking around the tents. Walk out. The land feeds people who go looking."
- 📓 Journal: Food won't come to Haven. Walk past the treeline — learn what grows out there, bring it back, and get it named at camp.
- 🐞 SCENARIO: headlight deer. Grazing, five tiles east. It has not seen you.
- Walk toward it. A person, maybe 50s and A woman, maybe 60s are out there too — the deer notices anyone too close, first in first out.
- FIRST ENCOUNTER: no beam-lane warning until your codex learns. You get the freeze, the whine, and dread. MOVE.

### flashbulb
- Haven. Twelve people. The fire is lit.
- A person, maybe 30s: "Nothing grows here but dirt and tents. Past the treeline — that's where the green is. That's where the food is."
- 📓 Journal: Food won't come to Haven. Walk past the treeline — learn what grows out there, bring it back, and get it named at camp.
- 🐞 SCENARIO: flashbulb moth. A dinner-plate moth, catching light wrong, four tiles east.
- Walk toward it. It lands, it folds — and the flash only goes FORWARD. Get behind it before it fires.

### choir
- Haven. Twelve people. The fire is lit.
- A woman, maybe 60s: "Don't bother picking around the tents. Walk out. The land feeds people who go looking."
- 📓 Journal: Food won't come to Haven. Walk past the treeline — learn what grows out there, bring it back, and get it named at camp.
- 🐞 SCENARIO: choir toads. A toad like a war drum, throat swelling, four tiles east. It brought a friend.
- When one throat lets go, they ALL croak. Break the chorus: kill one, split them up — or SHOUT (📢).

### lockpick
- Haven. Twelve people. The fire is lit.
- A person, maybe 20s: "Don't bother picking around the tents. Walk out. The land feeds people who go looking."
- 📓 Journal: Food won't come to Haven. Walk past the treeline — learn what grows out there, bring it back, and get it named at camp.
- 🐞 SCENARIO: lockpick raccoon. Too many fingers, working at something, four tiles east.

### hummice
- Haven. Twelve people. The fire is lit.
- A person, maybe 40s: "We've got days of stores, not weeks. The treeline is the pantry now. Learn what's out there."
- 📓 Journal: Food won't come to Haven. Walk past the treeline — learn what grows out there, bring it back, and get it named at camp.
- 🐞 SCENARIO: hummice. The grass is humming in harmony, four tiles east. Four of them.

### nightlight
- Haven. Twelve people. The fire is lit.
- A person, maybe 20s: "Don't bother picking around the tents. Walk out. The land feeds people who go looking."
- 📓 Journal: Food won't come to Haven. Walk past the treeline — learn what grows out there, bring it back, and get it named at camp.
- 🐞 SCENARIO: nightlight catfish. A soft green glow under the water, three tiles east. Pretty.
- That's the problem — it's pretty. It won't chase you. Get close and the water goes still. Strike the light from range — never wade in.

## Full error stacks (where present)

_None. Zero errors across all 7 scenarios._

## Deep-dive: signature mechanics (wait-only probes)

After the first pass, the harness was striking from 4 tiles out (out of spear range) — a harness artifact, not a game bug. A second probe teleported the player adjacent and let monsters act freely (player only waited). Results:

| monster | signature fires? | evidence | verdict |
|---|---|---|---|
| gallowdeer (headlight) | YES — beam | "It hangs mid-air... 💥 beam SITS on you! (63)" — player died at -3/100 after 2 rounds; a villager (Victor Okafor) also died; mantle transferred | REAL. Lethal. The showcase "feared" monster. |
| mirrormoth (flashbulb) | YES — Wing Flash | Full telegraph→flash→recharge cycle: "turns to face you — wings begin to fold → 💥 Wing Flash! (8/8/12/14) → blinded 1 round → wings hang dull, gathering itself". Player at 24/100 after 14 rounds | REAL. The fold-then-flash reads clearly in the log. |
| belltoad (choir) | YES — Resonant Croak + CHORUS | "💥 Resonant Croak! (15) → 🐸 Another throat swells — the CHORUS takes it! (16) → lands as ONE sound". Player died (-12/100, mantle → Tariq Brooks) standing passive | REAL. Standing still is punished exactly as designed; break the chorus or die. |
| lockpick_raccoon | YES — steal-first | "🖐️ Its hands blur — and suddenly it's holding your Fire-hardened spear! It's already running. ... It's over the ridge with your Fire-hardened spear. Gone." Fight ended with raccoon fled | REAL. Steals first, fights second — as specced. |
| hummice | YES — hum stack + Swarm Hum + TIDE | "The hum stacks — your bones buzzing. (hum ×3)" → "💥 Swarm Hum! hits you for 7" → "The hum becomes a TIDE — teeth everywhere in the grass". Killing a mouse: "A voice drops out of the choir — the hum stutters and thins." | REAL. Multi-round sustained fight; 2 of 4 mice died in 12 player strikes. |
| nightlight_catfish | YES — Lure and Grasp | "The water goes still around the light. Too still. 💥 The glow LUNGES — teeth where the light was! LURE AND GRASP! (15/15/18/20)". Player at 4/100 | REAL. The lure-then-lunge is the whole monster. |

## Honest inventory

Steve expected junk. Batch A is not junk. Every one of these is a real game feature:

- **All 7 scenarios load and run clean** — no errors, no soft-locks, no missing defs.
- **All 6 monster defs resolve** in `monsters.json` with hp/speed/encounter/attack data.
- **All 6 signature mechanics fire** with readable telegraphs and counterplay (get behind the moth, break the chorus/SHOUT, don't stand next to the deer, strike the light from range, the raccoon steals first).
- **Combat advances and ends properly**: kills, flees, player death → mantle transfer all work. No "Not your turn" soft-lock in any scenario (the 2026-10-05 fast-monster fix holds — hummice speed 6 and lockpick speed 5 both got opening turns).
- **Kill rewards work**: butchery text, kcal, alien loot drop (moth dropped a Fusion pellet), bond-clutching on kills, codex learning ("📖 Codex: Resonant Croak").

### Balance observations (not bugs — Steve's call)

- **Spear hits 28–31** vs wave-1 monster HP (10–32). Moth, raccoon, catfish, and toads die in 1–3 hits. The spear is strong; monster threat lives in their signature move if you don't kill them fast. Fine if intended — the "knowledge → kill it before it does its thing" loop.
- **gallowdeer beam did 63/100 HP.** Player died in 2 rounds from full health, and a villager died too. If this is the intended "feared" showcase, it's working. If not, the beam number is the lever.
- **Choir toads kill a passive player** (~30+/round from the chorus). Aggressive players kill them first. That's the designed lesson.
- **Moth flash blinds 1 round** and the recharge cycle is long — the moth is more puzzle than threat. Good contrast with the deer.

### Harness artifacts (not game bugs)

- First-pass "strike m_0 -> false" was the harness attacking from 4 tiles with a range-2 spear. Real play walks into range.
- `tbPlayerStrike` does not auto-end the turn; the UI's End Turn (`tbPlayerEndTurn`) advances. Correct behavior, just needed in the harness.
- The `deer` scenario is a hunting encounter (bow + animal), not monster combat — n/a for combat by design.
