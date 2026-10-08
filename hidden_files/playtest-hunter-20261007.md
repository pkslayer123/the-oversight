# Hunter Archetype Playtest — 2026-10-07

Played as a player via node harness (full production script list, sync combat path).
Scenarios: trap trapline (3 dawns), deer stalk (`deer`), night hushpuppy pack (`hushpuppy`, `night`), tracking/perceive, knife-gate.

## Feel verdict: GOOD, with two friction points

The hunter loop is the most complete-feeling archetype loop I played: set traps → sleep → dawn catch with a location ("Your Snare **here** caught a Gray Squirrel!"); stalk prey with a real aware/stamina state machine; night is genuinely scary. The knowledge-gating is excellent throughout (prey described as "a large brown quadruped, white tail raised in alarm" until you hold the body, then "Got it — White-tailed Deer!").

## What delights

1. **The stalk is a real game.** Deer `aware 0→1`, `pstate graze→bolt→winded→graze` across 8 attempts. Misses cost 100 kcal, the animal bolts, tires, and the game coaches you: *"It saw you coming — a calm animal is a hittable animal. Stalk it close while it grazes, or run it down until it tires."* 20,000 kcal reward ("this feeds people for days") vs ~550 kcal spent stalking. Great risk/reward ratio.
2. **Night hushwolf pack is terrifying — and fair.** Telegraph sequence: *"The birds went quiet. Something is circling, three tiles east."* → *"It moves."* → *"a dog-shaped silence at the treeline"* → *"⚔ A DOG-SHAPED SILENCE AT THE TREELINE! (3 of them!) You're on your own."* → *"The woods go silent — not quiet. Silent."* → Codex entry for Silent Rush after first hit. The no-rush-indicator design (telegraph is the silence itself) works.
3. **Honest coaching everywhere.** Wrong tool: *"Wrong tool for this — a snare or running it down would work better. Your Sling is a compromise."* No knife: *"You need a knife to clean game — knap a Stone knife (stone + vine) from Craft in your pack."* (points at the exact recipe). Bite risk at grabbing range: *"It bites! Teeth in your hand — Wild things have teeth."*
4. **Trapline works while you sleep elsewhere** — the fantasy of passive income is real: 2 catches in 3 dawns at 40% each.
5. **Death/mantle transfer fired correctly** when the pack killed me — village reacts, journal passes, new face. The roguelite loop holds under hunter death.

## Friction points

1. **Trap catch news gets buried in dawn noise.** A dawn log had ~8 messages (membership applications, gossip, village meal, starving warnings, mending sounds); the catch (*"Your Snare here caught a Gray Squirrel!"*) sits mid-list. The code comment says "the dawn message says where, so the catch never arrives silently" — it doesn't arrive silently, it arrives *buried*. On mobile one-screen this is the difference between checking the trap and missing dinner. Suggest: trap catches (and rot warnings) get visual priority in the dawn log.
2. **Trapped small game rots in one day.** Catch at dawn Day 2 → *"Overnight, Gray Squirrel (trapped) went bad — beyond saving"* at dawn Day 3 if not cleaned. The game does teach this (*"Fresh food keeps days, not weeks. Smoke it over a fire"* and *"clean it quickly (knife)"*), and a daily-checking player is fine — my harness just didn't clean. Verdict: working as designed, but the one-day window is tight enough that a player who checks traps every *other* day loses everything. Worth a Steve call, not a bug.
3. **The deer scenario hunter can't butcher the deer.** `deer` scenario equips a crude bow but no knife; `cleanCarcass` → *"You need a knife to clean game."* The fix path is honest (stone + vine → stone knife, message names it), but a first-time hunter killing their first deer and hitting a crafting errand is a feel speedbump. Suggest: either the scenario grants a stone knife, or the "clean it quickly" catch message already assumes one. (Not a bug — tool-gating is Steve's design — but the scenario is the onboarding for hunting.)
4. **Night pack lethality vs. a lone hunter.** 3 hushwolves focus-firing ~15/hit killed a 500-HP-set player in 2 rounds (combat HP is separate and much lower). Counterplay exists (the *"3 of them! You're on your own"* warning precedes the fight; grid edges are flee exits), and "violence desperate and traumatic" is the design — but 2 rounds with zero player actions landing is on the edge of "unfair" vs "scary." Flagging for the wave-1 tuning pass, not asserting a bug.
5. **`perceive()` returned null with a rabbit adjacent** (1 tile away). The animal is grid-visible so the player *can* see it, but the proximity-perception text doesn't call out nearby prey. For the hunter fantasy ("read the sign"), a perched rabbit one tile away surfacing in perceive would help. Minor.

## Bugs found

**None blocking.** Two harness-side notes (not game bugs):
- `Game.debugScenario('deer')` spawns a detail-grid animal (`s.animal`), not a `tbfight` monster — my first harness wrongly expected turn-based combat. Animals are hunted via `huntAnimal()`, not fought. Working as designed.
- `hasItem('stone_knife')` false after crafting is a harness check error — `hasCuttingTool()` matches on name `/knife/i` across inventory+tools, and the crafted "Stone knife" satisfies `cleanCarcass`. Verified via code path.

## Tracking

- No dedicated `track*` function exists on Game; tracking is expressed through: the `tracker` ability (L1 +30% / L2 +50% hunt success — fresh hunter-background characters start with L1), `game_sense` knowledge, `hunt.find_chance` modifier, and binoculars (+15% trap catch: *"sometimes it's dinner. You spot game trails"*). It works, but it's all invisible math — the player never *sees* tracking happen. The stalk's aware/pstate feedback carries the fantasy instead. Acceptable, but a future "you read the sign" beat would strengthen it.

## Night play

- Text telegraphs carry the tension (verified above). Actual detail-grid night lighting at 390×844 was **not** verified in this pass (headless Chromium hangs in this VM; render-grid.js is a substitute renderer). Left as open verification, consistent with the existing night-lighting backlog item.
