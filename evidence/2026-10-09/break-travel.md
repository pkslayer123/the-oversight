# Break-it: travel & map — round 5 (2026-10-09)

Target: travel & map system (index 9). Hostile-player attacks across exploit /
softlock / honesty / dead-code. Worktree: `break-travel`.

## CATCHES (fixed)

### V1 — FOG LEAK: world-map tap handler revealed undiscovered villages by name
- **Attack:** fog violation — tap fogged tiles on the world map.
- **Break:** the main-screen minimap tap handler (`app.js`) called
  `Game.villageCard(otherV.id)` for ANY generated village on the tapped tile
  with no `seenTiles` gate. Tapping dark tiles leaked the village's NAME,
  population, and focus ("fishing folk") — the exact class Steve ruled a fog
  leak on 2026-10-06 ("another village I never visited"). `renderMap` already
  gated the 🏘️ icon on seen; the card bypassed it.
- **Fix (defense in depth):**
  - `betrayal.js` `villageCard()`: returns `null` when the village's tile is
    not in `mapSeen` (visited or shared) — the engine holds the fog line, so
    every current and future caller complies.
  - `app.js` tap handler: explicit `_seenTile` gate before the `otherV` lookup;
    unseen tiles fall through to the "Unexplored" card.
- **Proof:** `scripts/test-travel-village5.js` V1 — BEFORE: card leaks
  name/population/focus on fogged tile; AFTER: `null`, and the card still
  reads once the tile is seen.

### V2 — EXPLOIT: remote petition — join a village you never walked to
- **Attack:** blocked-travel bypass — exile taps a distant (seen) village tile,
  hits "Approach & petition".
- **Break:** `petitionVillage` had NO proximity gate. Judgment ran and
  `joinVillageReal` set `joinedVillage` from 8 tiles away: no travel, no
  danger — and the probation clock only ticks at their fire
  (`probationTick`: `d > 1` → "the clock waits"), so you'd be "in" while
  standing miles away. **Sibling sweep:** `villageTalk`, `villageShareFood`
  (both `dist > 1` refuse) and `studyVillageCodex` (`dist > 2` refuse) all
  gate on proximity — petition was the lone outlier in the same bug class.
- **Fix:** `betrayal.js` `petitionVillage()`: refuses with
  "You're not at ${name} yet — walk to their fire first. Petition happens
  face to face." when Manhattan distance > 1. `joinVillageReal` has no other
  callers, so the gate covers the whole join path.
- **Proof:** V2 — BEFORE: remote petition proceeds to judgment; AFTER:
  refused, not joined, refusal names the walk. V3 (adjacent): card offers
  petition at their fire and the engine proceeds.

### V3 — HONESTY: "Approach & petition" button offered from across the map
- **Attack:** label-vs-engine — the exile card offered the petition button at
  any distance while the (now-fixed) engine refuses from afar.
- **Fix:** `villageCard()` computes proximity once (`atFire`) and only adds
  petition actions at their fire; from afar the card hints
  "petition happens face to face" (same pattern the non-exile branch already
  used for talk/study/sharefood).
- **Proof:** V3 — BEFORE: petition action present from 8 tiles away; AFTER:
  withheld with honest hint; present when adjacent.

### V4 — HONESTY: `tryNodeExit` reported a crossing that never happened
- **Attack:** softlock/honesty — `tryNodeExit` returned `{moved: true}`
  unconditionally after `travelTo`, but `travelTo` can refuse (`this.over`).
- **Fix:** `game.js` `tryNodeExit()`: `return { moved: res !== null, ... }`.
- **Proof:** V5 — BEFORE: `moved:true` while dead; AFTER: `moved:false`.

### V5 — HONESTY: swim charged 20 kcal + announced the crossing before traveling
- **Attack:** cost honesty — the blockage card's swim button spent the 20 kcal
  and said "You swim across, cold and grinning." BEFORE `travelTo(x, y, true)`.
  If travel refused (dead with the card open), the kcal was spent and the log
  lied.
- **Fix:** `app.js` swim handler: travel first; on `null` (refused) bail with
  no charge and no announcement; charge + narration only after the crossing.
  (Mid-fight is already guarded above in the same handler.)

## SIBLING SWEEP (same bug classes, related surfaces)
- **Proximity class:** `villageTalk`, `villageShareFood`, `studyVillageCodex`
  already gate — verified still refusing from afar (V4 regression block in the
  proof test). `joinVillageReal` only reachable via gated `petitionVillage`.
- **Fog class:** overlay tap handler already gated on seen; `renderMap`
  (round 4); codex MAPS via `villageMapKnown` (round 4). `tl.village` read in
  `renderMap`'s haven-icon branch is dead (never assigned anywhere) — noted,
  not changed.
- **Gray area (documented, NOT changed — Steve's call):** the haven diplomacy
  panel's propose-link candidate list names ungenerated (never-approached)
  villages. Name only, no location; engine declines cold proposals
  (`judgeLink` base 38 < 45). Left as the village-as-collective's grapevine.

## SYSTEMS THAT HELD (attacked, resisted)
- **Node ping-pong synergy farming** (`travelTo` logs `cold_blooded` +
  `hollow_bones` every crossing → `efficient_machine` sustained 3-day streak):
  held as designed — costs 3 in-game days of real time, no infinite loop;
  min-maxing, not an exploit (Steve: only true infinite exploits prevented).
  Same verdict for `noteTrailUse` relic-bond pacing.
- **travelTimeStep anti-spam gate** (round 4): still holds — world batch only
  advances on real `dayTicks` movement; verified no regression (round-4 suite
  32/32).
- **Fog depth:** `reveal()` (travel flag) vs `seenTiles` (fog flag) separation
  intact; `travelTargets` only exposes adjacent-into-fog; map overlay shows
  nothing travelable from fog.
- **DEAD CODE sweep:** every travel function
  (`travelTargets`, `findWalkableEntry`, `edgeExit`, `tryNodeExit`,
  `walkCost`, `beginPathWalk`, `pathStep`, `travelTimeStep`,
  `travelBlockage`, `clearBlockage`, `buildBridge`, `smashBridge`,
  `exitBuilding`, `enterBuilding`, `returnToVillage`, `returnToOldVillage`,
  `reveal`, `markSeen`, `mapSeen`, `compareMaps`, `villageMapKnown`,
  `seedVillagerMaps`, `backfillSeen`) has live callers. No dead travel code
  found. (`tl.village` is a dead READ, not dead code with behavior.)
- **Softlock sweep:** no stuck states found — every node has adjacent-fog
  travel targets; blockages always offer cut/clear/bridge/swim/go-around;
  committed walks revalidate per step; combat guards on
  travelTo/microMove/beginPathWalk/pathStep/tryNodeExit/clearBlockage/
  buildBridge all hold.

## PROOF RESULTS
- `scripts/test-travel-village5.js`: BEFORE (HEAD code) 10/10 red —
  all three breaks + both honesty warts reproduce. AFTER 13/13 × 3 seeds
  (7, 999, 4242).
- Regressions: `test-travel-fog4.js` 32/32, `test-travel-breakit.js` 13/13,
  `test-movement.js` 48/48, ontology 50/50.
- `test-movement-actions.js` 2/7 pass — PRE-EXISTING stale (2026-10-05,
  asserts the round-2-fixed double-charge; identical 2/7 on pristine HEAD,
  flaky 2–3 passes). Not touched by this run.
