# Break-it 4th pass: alien players (2026-10-09 ~00:30 CDT)

Target: `src/js/alienPlayers.js` + `src/data/alienPlayers.json` + wires into
`encounters.js`, `contests.js`, `game.js`. Fourth adversarial pass — 17 breaks
fixed across passes 1–3 (see `evidence/2026-10-08/break-alien-players.md` and
`break-alien-players-3rd.md`). This pass attacked the deep surface the earlier
passes never touched: package-item usability, raid/burn reality, favor-tier
gating, group-cooldown honesty, Wren's reachability, feed copy, and the
post-contest-engine (7ef1946) coherence.

**Verdict: BROKE in 10 places. All fixed, all proven (326 new asserts).**

Harness: full `src/js/*.js` eval in index.html order (minus DOM-only),
one shared resettable RNG installed BEFORE eval, window stubbed for eval then
deleted. New proof tests: `scripts/test-alien4-packages.js` (45),
`test-alien4-raid.js` (60), `test-alien4-copy.js` (57),
`test-alien4-systems.js` (137), `test-alien4-lifeline4.js` (27).
Seeds 20261009/777/4242 per block. Before-proofs captured red on the pre-fix
code for every break (via `git stash` of the fix where needed).

## What broke (10 catches, all fixed)

### 1. Package gifts were unusable bricks — useItem CRASHED (exploit/honesty)
Pass 2 "fixed" the care-package gift by pushing it to the live inventory — as
a bare `{itemId, id}` entry with no `name` and no `units`. The sadistic
persona package's "beautiful alien medkit" had the same shape. Before-proof:
`useItem` on the medkit threw `TypeError: Cannot read properties of undefined
(reading 'toLowerCase')` — the promised medkit crashed the game when used.
Even past the crash, `item.units--` on `undefined` went `NaN`, so the item
could never be consumed (infinite-use brick). Fix: new `apGrantItem(itemId)`
helper builds a real entry (name/units/kg from the item def, unique instance
id); both package paths use it. Sibling sweep: `useItem` in game.js now
defensively guards `(item.name || '')` and the heal message falls back to the
def name — no malformed entry can throw again. After-proof: medkit heals
(40 → 90), is consumed on use, gifts carry names/units. 45/45.

### 2. Favor tiers gated NOTHING — all 18 alien items were tier 1 (honesty)
`apCarePackage` promises "package quality scales with favor" (tiers at
favor 20/40/70) and filters `(it.tier || 1) <= tier` — but no alien item had
a `tier` field, so every tier rolled the same 18-item pool. Before-proof:
pools identical at favor 25/50/85. Fix: `tier` set on all 18 alien goods,
mirroring their existing `lootTier` (the same scale the 5 alien armor pieces
already used). After-proof: favor 25 → 5 items, 50 → 10, 85 → 14 (strict
subset growth); tier-4 apex never leaks via packages (Steve's rule: apex is
earned on its own terms). 45/45.

### 3. Pantry raid was a silent no-op (honesty)
`apPlaygroundRaid`'s pantry branch read `v.pantry.kcal` — but the pantry is
a LIST of food items (game.js), so `steal` was always 0 and the raid never
took anything. Before-proof: raid "fired", pantry unchanged. Fix: the raid
takes real pieces off the pile (newest-first, partial units — a 12000-kcal
slab doesn't vanish whole), bounded near the 500–1000 design, and the copy
names the actual stolen amount. After-proof: pantry 52250 → ~51500, theft
≤1500. 60/60.

### 4. Fire sabotage never touched a fire (honesty)
The branch wrote write-only `s.fireSabotaged` (zero readers) and announced
"Your fire is out" even with no fire lit. Before-proof: flag set, fire kept
burning; message fired with no fire present. Fix: new `apDousePlayerFire()`
douses the nearest lit fire for real (grid cell → dirt, tracked `state.fires`
entry removed, so `hasCampfireNearby`/cooking/`fireLastsTillDawn` all agree);
the branch only runs when a fire exists, otherwise falls through to trust
sabotage instead of lying. After-proof: cell 'fire' → 'dirt', tracked entry
gone, no message without a fire. 60/60.

### 5. Burns never manifested — burnedTiles was write-only (honesty)
`apPlaygroundBurn` pushed to `s.burnedTiles` ("the next time the player
visits, tiles are ash") and nothing ever read it. Fix: the burn scorches the
current node's grid for real — 3–5 tiles become `rubble` (scavengeable ash,
a real interaction), skipping Haven (arsonists torch the wild), the player's
own cell, and tents. The 7-day cooldown now records only when the burn
actually lands. After-proof: grid delta 3–5 new rubble tiles. 60/60.

### 6. Group cooldown burned at ROLL time (exploit)
`apRollGroupEncounter` set `lastGroupDay` when returning a group — if
`apStartGroupEncounter` then refused (fight already active), the 14-day
cooldown was wasted with no fight. Pass 3's sweep claimed all cooldowns were
"set when the action fires"; it missed this one. Before-proof: refused start
left `lastGroupDay` burned. Fix: cooldown recorded in
`apStartGroupEncounter` on success only; group banter also moved to play for
a fight that actually begins. Sibling sweep found the same class in
`apEventFeed`: it burned the shared `lastFeedDay` even when it had nothing to
say (early game), starving `apFeedMessage` — now records only when a message
goes out. After-proof: refused start leaves cooldown at -999; successful
start records it. 137/137. (`test-break-alien-after-20261008` B1 updated to
the honest behavior; 66/66.)

### 7. Wren could never become known — 60% of her data was dead (dead code)
Wren (non-combat) had no encounters and the feed slip is sadistic-only, so
`apKnowsAlien('wren')` was forever false and her introLines/signature
("eventually Wren risks direct contact") were unreachable. Fix: dead drops
track `wrenDrops`; after 3+ drops there's a 25% chance you spot her at the
cache — her intro line plays and `apRevealAlien('wren', 'you spotted her
leaving a cache')` fires. Her dead drops (200–500 kcal, helpLines) and feed
whisper were already real. After-proof: reveal path works end-to-end.
137/137.

### 8. specimen_scanner still promised phantom mechanics (honesty)
Pass 2 claimed this desc was "reworded to non-promissory flavor" — but
"Fenwick adapts — the longer you fight one way, the better he reads you"
survived verbatim, with zero adaptation mechanics anywhere. Before-proof:
copy test red. Fix: reworded to pure flavor ("For the collection, he says.
Probably.") in BOTH `alienPlayers.json` and the fallback table.
Also reworded `crystal_lattice` ("the more scared you are, the harder she
hits" — engine is binary fear +8) to binary-honest: "Her strikes land harder
on an Afraid target — fear in, damage out." 57/57.

### 9. Stale "odds" copy survived the contest-engine sibling sweep (honesty)
7ef1946 reworded 4 odds lines to performance language but missed two in
alienPlayers.js: `apFeedMessage`'s "The odds on your next fight just shifted"
(a mechanical claim about the played path, where no odds exist) and
`apEventFeed`'s "The odds just got interesting." Fix: performance/broadcast
language matching the 7ef1946 register. Copy test asserts zero player-facing
"odds" lines remain. 57/57.

### 10. Duel coherence post-contest-engine (verified, held + documented)
`apPlaygroundDuel` is untouched by 7ef1946 (that pass changed contest
`duelFight` for played villager duels — a separate system). Verified: duel
is reachable via `apPlaygroundTick`, picks exactly 2 distinct aliens (1v1),
the loser may genuinely leave the game (`delete` on the live `ap.active`
object — real rival-pool effect), `lastDuelDay` gates 1 per 10 days, and no
duel is possible with <2 active aliens. 137/137.

## What held (attacked, resisted — documented, not failures)

- **B. Interference effects are real**: sadistic rig returns `winMod -0.12`
  → `_contestVerdict` wires it to `cheerLift = apRig*20` → measured -2.4
  case-score penalty via `_cxCaseScore`; fan favor +0.08 symmetric. forPlayer
  calls skip both (verdict-only fiction), lifeline only. 137/137.
- **C. Contact warning**: fires once a contact exists (day 20+, 0.3/day,
  4-day cooldown); copy is dream-framed ("Dreamed again..."), not a
  mechanical promise — held as diegetic flavor. Contact establishment path
  verified.
- **D. apPilotAffinity**: NOT dead code — deliberately removed by Steve's
  2026-10-07 "impersonate HUMANS, not monsters" rework; zero references in
  src/js, and a test explicitly asserts its removal. The stale
  `test-alien-players-20261007.js` crash is pre-existing (all 3 passes).
- **H. Group rate**: measured 3.45% over 2000 forced rolls (design 3%);
  `apGroupEligible` gates (day 40+, 2+ rivals at 2+ encounters, 14-day
  cooldown) all verified.
- **J. Knowledge paths enumerated**: `ap.known[pid]` has exactly ONE writer
  (`apRevealAlien`) called from exactly TWO sites — 3rd encounter (proven
  end-to-end: 2 → 3 encounters reveals) and the sadistic feed slip (proven).
  Plus the new Wren dead-drop path (§7). No forever-locked personas remain.
- **L. Feeding gates**: Old Tam's benevolent package 400–700 kcal through
  `kcalCap`, 6-day gate blocks farming; dead drop 3-day, feed 1/day — all
  enforced. 137/137.
- **M. Save/load**: favor/met/known/all cooldowns/active roster survive a
  JSON round-trip; a mid-encounter fighter snapshot serializes (no circular
  refs — save-during-a-hunt won't nuke the save). 137/137.
- **N. Lifeline re-green**: verdict call 0/200 deathSave + 0/200 cooldown
  burns; forPlayer fires at ~40% with bond ≥ 2 and 7-day cooldown; arena
  path still consults the lifeline forPlayer, restores 10% HP (min 1),
  clears arena routing, ends 'lost'. 27/27. Pass-3 suites re-green:
  lifeline 7/7, groupchain2 20/20, honesty 13/13.
- **I. Kill/trust/fear were already real**: villager kill → `registerDeath`
  with a real corpse; trust sabotage cuts exactly 15; `apVillagerFear`
  moves real npcNeeds fear + gossip. Re-asserted, 60/60.

## Sibling sweep

- Bare-`{itemId,id}` inventory pushes: no other sites (all others carry
  name+units); `useItem` hardened anyway (game.js).
- `pantry.kcal` scalar reads: none elsewhere.
- Cooldown-at-roll class: audited every `last*Day` write in alienPlayers.js —
  all others record on success; fixed `apEventFeed` sharing `lastFeedDay`
  with `apFeedMessage` (empty event feed no longer eats the day's feed slot).
- `items.json` tier additions: only consumers are the care-package filter
  and betrayal's `tier_lie` scam (which now reads true tiers — more honest);
  no monster drop table reads item `.tier`.

## Pre-existing failures (verified identical on pristine tree, NOT this pass)

- `test-alien-break-economy.js` 8/10: the 90-day sim starts scholar kcal at
  3000, above the 2400 `kcalCap`, so the first grant clamps to -600 net and
  the `total > 0` sanity assert fails. Fails identically with my changes
  stashed. The bound assert (the real security property) still passes.
- `test-alien-players-integration-20261008.js` 47/54: asserts the
  pre-7ef1946 verdict mechanics (`winOdds`, `apDeathSave` death branch,
  "odds bend") that the contest-engine pass deliberately removed. Stale,
  fails identically with my changes stashed.
- `test-alien-players-20261007.js`: crashes on `apPilotAffinity` (removed
  by Steve 2026-10-07; stale since pass 1). `test-alien-pool-20261007.js`
  asserts the removal — the removal itself is verified.
- `test-contest-break-2.js` / `test-break-contests.js`: pre-existing
  failures per pass 3, untouched by this pass.

## Proof tests (this pass)

test-alien4-packages 45 · test-alien4-raid 60 · test-alien4-copy 57 ·
test-alien4-systems 137 · test-alien4-lifeline4 27 → **326 green**,
seeds 20261009/777/4242. Prior suites re-green: break-20261008 52 ·
break-after-20261008 66 · carepackage 21 · tech 42 · groupchain 28 · beam 12 ·
ap-encounter 55 · alien3-lifeline 7 · alien3-groupchain2 20 · alien3-honesty 13 ·
armor 25 · playground 46 · contest-engine 1–4 (8/12/16/7). Ontology 50/50.

## Files changed

- `src/js/alienPlayers.js` — `apGrantItem` + both package paths; pantry raid
  steals real items (partial units); `apDousePlayerFire` + honest fire
  sabotage; burn scorches real tiles (cooldown on success); group cooldown
  on successful start; Wren dead-drop reveal; `apEventFeed` cooldown honesty;
  specimen_scanner/crystal_lattice rewords; 2 feed "odds" lines reworded;
  ontology provides/rules updated
- `src/js/game.js` — `useItem` nameless-entry guard + heal-message fallback
- `src/data/items.json` — `tier` (= lootTier) on all 18 alien goods
- `src/data/alienPlayers.json` — specimen_scanner/crystal_lattice rewords
- `docs/ONTOLOGY.md` — regenerated by validator
- `scripts/test-alien4-*.js` (5 new), `scripts/test-break-alien-after-20261008.js`
  (B1 updated to honest cooldown behavior)
- `evidence/2026-10-09/break-alien-players-4th.md` (this file)
