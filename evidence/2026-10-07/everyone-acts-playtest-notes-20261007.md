# Everyone Acts — playtest notes (Worker B, 2026-10-07)

**HEAD under test:** `c45afd73cea733d98cf9400d1fee40f7ff3d70ad`
**Script:** `scripts/play-feel-20261007-everyone-acts.js` (seed 20261007, mulberry32; SEED env override)
**Engine source:** full production script list loaded from HEAD via `git show HEAD:…`
(state, modifiers, calories, day, forage, combat, game, encounters, conversation,
convo-mood, convoTopics, convo-wants, convo-dialogue, convo-beats, examine,
equipment, journal, party, party-formal, truth, contests, storage, perceive,
carexplore, justice, food, betrayal, corpses, lifeseed, progression, ledger,
villager-agency, codex-people, membership, hierarchy, debug-scenarios).
DOM-only files excluded (app, sprites, tile-scenes, move-anim). `window` stubbed
for eval, deleted before play (sync combat path). Data files also read from HEAD.

**Method:** new game → 55 player turns in/around the haven (days 1–5: wandering on
interior tiles, foraging, waiting, resting; one mid-run conversation; one endDay).
`Game.npcTakeAction` instrumented: after every player action each villager's
intent (from needs), outcome (position/need deltas) and say lines were logged.
Full run log: `/tmp/ea-run1.log` (ephemeral; key excerpts below).

## FEEL verdict (as a player)

The village feels alive — but honestly, most of the aliveness I *felt* came from
the agency/initiative lines ("heads out to forage", "is back from the north",
overheard arguments, "Can we talk?"), not from Everyone Acts itself. The
per-turn NPC economy underneath is quiet and well-behaved: people drift around
the grid, pair off to talk, eat from the pantry when hungry, and never spam the
log (0.24 announcements/turn against a 1/turn budget — the chatter budget works).
Nobody ever blocked my movement. Turn time is a non-issue (avg 2.6ms, max 27ms).

The honest friction: the idle drift reads as Brownian motion, not purposeful
life. Villagers ping-pong between adjacent tiles ((5,2)→(4,2)→(5,2)) and about a
quarter of all "actions" produce no visible change at all (social intent with
nobody in reach and a blocked step; idle meander rolling 0,0). You don't *see*
the no-ops, so it doesn't hurt — but "everyone acts" often means "everyone
shifts one tile at random." The needs-driven beats that DO land — two villagers
stopping to talk, someone eating from the pantry, the both-ways trust warming —
are good and legible. The system needs more *legible purpose* in the idle band,
not more actions.

Second: after 55 turns living in the haven I knew exactly ONE villager's name
(Emma, from the one conversation I had). Knowledge-gating is working as designed,
but the village reads as eleven anonymous descriptors for a long time, which
makes the turn log — and the social world — hard to attach to. Pacing note, not
a bug.

## Bugs

### 1. Fresh game: villagers don't act (or appear) until your first step [HEADLINE]
**Repro:** new game → `depart()` → `doAction('wait')` × N (no steps).
`v.positions` is `{}` after depart; `ensureVillagerPositions()` is only called
from `travelTo`/`movePath`/`pathStep`/`microMove`/`checkSystemArrival` — never
from `doAction` or `villagerTurn` itself. So `villagerTurn()`'s filter
(`v.positions[rid]` falsy) drops every villager: **0 NPC actions and 0 villagers
on the grid** until the player's first microMove. Verified by probe: waits →
0 `npcTakeAction` calls; one step → positions populate → next wait → 8 calls.
In the playtest, turns 1–4 (wait/wait/wait/step) showed `npcs=0` three times.
**Player impact:** if your first actions are wait/rest/forage, the village opens
dead — nobody moving, nobody on the grid. First-impression bug.
**Suggested fix (not applied — read-only mandate):** call
`ensureVillagerPositions()` at the top of `villagerTurn()` (cheap, idempotent),
or in `depart()`/`newGame`.

### 2. (Minor) `endDay` doesn't run the villager economy
T46 `endDay`: `npcs=0` — day rollover bypasses `villagerTurn`. Day-boundary is
its own beat, but NPCs neither eat nor reposition across it; the overnight
pantry burn is handled elsewhere. Noting, not claiming broken.

## 319a947 smoke test — PASS
- Started convo with nearest villager (Emma), 2 exchanges, `endConvo(vid,'left')`.
- `isEngaged` went true → **false** (the frozen-after-convo bug is fixed).
- Emma acted every turn after (T31–T55: 27 moves, 2 pantry meals, 0 frozen turns).
- Both-ways trust: 11 NPC–NPC talks observed; talker Δ and listener Δ both ≥ 0
  in every case (typically +1/+1, one +1/+2). The ambient repair path works.

## Observations (not bugs)
- **Pantry shortcut starves the shared-world half of the design.** Pantry sat at
  ~35–47k kcal all run; hungry NPCs ate from it (`hunger −30`) instead of
  foraging. `regrow` (world cells depleted by NPCs) stayed **0 for all 55 turns**
  — no villager ever visibly picked the world clean. The "same cells you use"
  depletion is real code but dormant while the pantry is stocked. If Steve wants
  villagers to compete for forage, the `pantryKcal > 200` bypass is too eager.
- **NPCs do feed the village:** `stockPantry` fired from the world (+100, +380,
  +894 kcal lines) and from expeditions (+1374). The loop "they eat some, bring
  some home" is visible in the ledger.
- **Night:** on-node NPC count drops (4 vs 8–10 by day) — people go off-grid
  (sleep/away). Night fire-drift branch exists; fire-gathering wasn't distinctly
  observed in the log (moves at night, no announcements). Unobserved, not broken.
- **Social talk cadence feels right:** 11 talks / 55 turns, spread across the
  cast; nobody spammed, nobody was frozen (every villager had non-idle actions).
- **No knowledge leaks observed.** Announcements stay generic ("forages the
  bushes", "eats from the pantry", "talks with X"). Overheard lines reference
  the creek / snare line / pantry jars — world-grounded, nothing a villager
  shouldn't know. (Caveat: zero NPC world-forage announcements fired, so that
  leak surface is untested by this run.)
- **Initiative lines carry the scene.** "A man, maybe 40s, with a limp settles
  near you, not too close… 'Can we talk?'" / "A woman, maybe 60s is back from
  far past the south (+1374 kcal, 4 stories)" — these do more for "alive" than
  the 1-step drifts. Everyone Acts is the floor; initiative is the ceiling.

## Aggregates
- 55 player turns, days 1→5, game never over; player ended kcal 1902 / hp 78.
- villagerTurn wall: total 142ms, avg 2.58ms/turn, max 27ms. No slowdown.
- NPC announcements: 13 / 55 turns (0.24/turn). NPC–NPC talks: 11.
- Blocked player moves: 0. Frozen villagers: none.
- Per-villager action mix dominated by `moved` (drift) and `talked`; `fed`
  1–3 each; `no visible change` ~15–40% per villager.
- Final needs all bounded (hunger 31–56, energy ~100, social 29–100, fear 0).
  No spirals.
