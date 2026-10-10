# Break-it r14 — MONSTERS (2026-10-10)

Run: oversight-flesh-out-loop r14. Target: monsters (index 5). Attack surface: the
four fresh 2026-10-10 monster commits, never break-it attacked:
`bc6f9273` (wave 3-5: 26 new monsters as data), `2619d244` (partyTactics.js),
`acd2be87` (deed gate retune), `73bc07b4` (bal-waves reachability).
Canon read first: docs/CANON.md, docs/MONSTER-WAVES.md, docs/SCALE.md,
docs/DISEASES.md (vectors). No canon invented.

## VERDICT: BROKE + FIXED (1), BROKE + PROPOSED (1), rest HELD

---

## CATCH 1 — FIXED: `mdef.pierce` was caller-disconnected (honesty + balance)

**The break.** `tbDamage` (game.js) reads attacker pierce from its 4th arg
(`sourceKey`): `atk.mdef.pierce`. The armor hook exists in the player block,
the villager block, and fieldFights. But the GENERIC burst/beam/line/charge
resolve inside `tbMonsterTurn` — the path every non-direct attack of all 26
wave 3-5 monsters takes — never passed `sourceKey`. Neither did the sweep-beam
tick (`tbBeamSweepTick`) nor ~12 bespoke monster-attack branches. Result: all
26 new monsters' pierce (0.1–0.75) silently read **0** on every non-direct
attack. Only the generic *direct* resolve passed `m.key`.

**Why it matters.** `sim-dps-anchor-20261010.js` validated the wave-5 bands
WITH pierce (its placeholders used `direct` patterns → the one path that
passed the key): "The Finale's strike takes ~70 through god armor — the wall
holds." In the live engine, burst/beam/line attackers (focus_group,
chorus_line, timeslot, congregation, finale, editor) dealt pierce-0 damage —
the engine under-delivered the validated design. The finale's 0.75 pierce,
the entire point of its threat vs god armor, did nothing on its beam.

**Proof (real code, both directions).** Armed-telegraph drive through
`tbMonsterTurn` vs P=138 armor, fixed 100 damage:
- BEFORE (HEAD `game.js` restored via `git checkout HEAD --`): finale beam
  lands **13** (pierce ignored). Direct lands 37 (already worked).
- AFTER (fix): finale beam lands **37** = hand-computed pierce-0.75 math
  (`effP=34.5, r=0.633, absorb=63`). Direct unchanged at 37.
- Hit-1 clamp verified intact under pierce: 2-damage chip lands exactly 1.
- Honesty: the "Armor absorbs 63" line states the true post-pierce number.

**The fix** (src/js/game.js, 15 call sites — every monster-sourced `tbDamage`
now passes the attacker's fighter key):
- generic burst/beam/line/charge resolve (the critical one), sweep-beam tick
- bespoke: breather paw lash, melee lash, antler thrash, belltoad Resonant
  Croak, catfish Lure and Grasp, mosquito Drink/Blunder/Feeding/Latch,
  voice-mimic reveal rush, warranty slap, turtle snap, hushwolf rush
- stale comment ("no monster has pierce yet") corrected.
Zero behavior change for wave 1-2 (all pierce 0) — the fix only activates the
field the data already assigned. Deliberately UNCHANGED: landlord rent
collection (a tax, not a strike — design call noted), sourceless terrain
hazards (paper cuts/leased ground — by design), player/villager-sourced hits
(pierce is monster-only), alien-player strikes (different system, no pierce
in data).

**Proof:** `scripts/test-monsters-break-r14-20261010.js` — **116/116 × 3 seeds**
(SEED=1,2,3). Regressions green: `test-wave3-5-20261010.js` 211/211,
`test-party-tactics-20261010.js` 47/47.

---

## CATCH 2 — REPORTED, NOT FIXED: 26 signature mechanics are copy-only (honesty)

**The break.** Every new monster's `attack.telegraph` (shown verbatim on
windup via `tbTelegraphCue`) and codex promise a SIGNATURE mechanic. None has
any engine code — 25 of 26 have no `monsterBehaviors.json` entry at all
(only `reunion` does, for pack tactics); no `*Is()` bespoke branches exist
for any of them. They all run through the generic encounter interpreter as
plain direct/burst/beam attackers. Examples of promised-but-absent mechanics:
- **The Finale**: "Once per fight it declares a finale: a 3-round countdown
  to a massive UNAVOIDABLE strike [150,200]... You feed it: sacrifice a thing
  — an item, an ability charge, a memory — and it passes." The windup text
  describes this EVERY beam attack. It never fires. (MONSTER-WAVES.md also
  records Steve's ruling that doom deaths trigger phoenix_clause — the code
  has the ruling comment and the `maybeCheatDeath` choke, but no doom to
  trigger it.)
- **The Eulogy**: "It's a doom counter that gains weight each round. When the
  story finishes, you die."
- **The Rerun**: "Every 5 rounds the fight RESTARTS: HP resets both sides."
- **The Editor**: "cuts things OUT: your last turn (redo it), your position,
  your ally ('left on the cutting-room floor' for 3 rounds)."
- **THE EATER**: "grows stronger with every thousand calories (+15 damage per
  2000 kcal consumed)" — no growth code; the eater never eats.
- The Redactor (redacts weapon/footing/last turn), The Congregation (geas),
  The Strike (dead turns), The Influencer (fan-creatures), The Audit
  (inefficiency tax), The Suburb (rest-for-memory), The Algorithm
  (rearranges the fight), The Cancellation (un-teaches abilities), The Spoiler
  (announced outcomes gain weight), The Timeslot (worse venues), The Nielsen
  (viewer counter), The Network Note (buffs it reads aloud), Ad Break
  (skip-ad beat), Terms of Service (the loophole dismisses it).

**Why not fixed here.** Each mechanic is a design workstream (what does the
sacrifice cost? how is the rerun telegraphed fairly? what does the editor's
cutting-room floor do to an ally for 3 rounds?). Per Steve's current posture
(critique → proposed build plan, not a launched build), this needs his word
on mechanisms before implementation.

**Proposed build plan** (for Steve's pick):
- P0 (honesty, small): trim the telegraph copy that promises specific absent
  mechanics, OR mark them as "the System hasn't finished building this one"
  (diegetic: the wave is new, the monster is a draft — actually fits "The
  Final Draft" fiction!). The fiction already says these are drafts — a
  "this one's still rendering" beat is honest AND on-theme.
- P1 (one mechanic to prove the pattern): the Finale doom countdown +
  sacrifice. Trigger: finale below 50% HP, once per fight. 3-round
  diegetic countdown ("previously on..." beats), then unavoidable [150,200]
  (pierce 0.75, undodgeable — NOW the pierce fix matters). Counterplay: a
  mid-fight choice to feed it an item (from pack, player picks, real loss),
  an ability charge, or a memory (codex entry dims?) — WHAT you feed it is
  the painful choice Steve's design demands. Doom death → `maybeCheatDeath`
  (already the choke point).
- P2+: the rest, one workstream each, in wave order.

---

## HELD GROUND (attacked, resisted — with why)

- **Kill credit exactly-once.** `recordWaveKill` fires only from `tbEnd('won')`
  (lineage-deduped: snake segments share one `tbSnakeLineageKey`, pack
  monsters count individually — separate creatures, by design) and villager
  patrol kills. `tbDamage`'s death path does NOT record — no double-count.
  `tbEnd('fled')` records zero kills; flee still counts as *faced* (canon:
  Steve accepted facing/fleeing for the deed bars). Deed feed
  `recordDeedFight` is distinct-by-monster-id (same species twice = 1).
  Proven in the proof script.
- **Monster-on-monster farming via group punishers.** The burst resolve
  (`if (!S.combat.isFoe(m, o)) continue`) and turtle snap both exclude
  non-foes — bright_idea's drift-burst and chorus_line's density-aim can only
  ever hit player-side fighters. No kill farming. (Packmates also excluded
  from flank targeting.)
- **Eviction wall softlock.** Rises with a shove (nobody entombed — verified
  zero fighters on wall cells), always leaves the service-entrance gap
  (nearest the centroid), expires on the round clock (`f.round >= expires`)
  even if the landlord dies mid-lease (expiry checked in the round wrap, not
  on the landlord's turn). Terraform is fight-scoped — dies with the fight.
  Proven: raise → shove/gap → advance 3 rounds → cleared, terraform empty.
- **Static lure softlock.** Lure breaks three ways, all proven: player moves
  adjacent (hand on shoulder), 2-round wear-off, radio dies/flees (the voice
  dies with it). Once per fight (`vmCallOutUsed`). Never permanent.
- **Fight termination, all 26.** Godhood-brawler slayer policy: every new
  monster's fight terminates (won) within 200 rounds, zero exceptions, zero
  stalls, 3 seeds. "Acted" signal (telegraph observed at turn end, or
  monster-sourced damage landed — ambush snaps never telegraph by design)
  confirmed wherever the fight ran ≥3 rounds. No untargetable-forever or
  never-acting states. (One false alarm investigated: buffering "silent" was
  my test's broken acted-detection — post-fight `tbFighter('p')` is null and
  ambush snaps set no telegraph; direct observation showed 28 snaps landing.)
- **partyTactics.js dead-code check.** Loaded in index.html (line 61, AFTER
  monsterBehaviors.js so `MonsterBehaviorHooks` exists), IIFE guard passes
  (`Scattering.Game` defined — game.js loads at line 29), all 16 methods
  attach via `Object.assign(G, methods)`, all 3 hooks registered, call sites
  live in game.js (startCombat pack spawn, flank at damage time ×2,
  tbTacticalFoe in generic foe selection, tbIdeaDrift in brighten phase,
  lure in ally turns, wall expiry in round wrap). Pack spawn honest:
  hushwolf 2/4, heckler 1/3, reunion mirrors party capped at 3 — all
  data-driven, all party-gated at ≥3 (solo scouts keep fair duels).
- **Scale-gate bypass.** `scaleAtLeast` defensive default (unknown → regional)
  blocks wave 5 (needs national) — verified. Wave 4's kills-alone path is the
  documented defensive posture until hierarchy.js shipped (it HAS shipped —
  `scaleRank()` is live, so the real path is kills + real regional). Faking
  regional requires the actual polity machinery (attacked in r4, held).
  `unlockedWave` never unlocks on calendar alone (day 200 + nothing → wave 1).
- **Wave unlock beats.** `waveUnlockBeat(3/4/5)` names THE FINAL DRAFT / THE
  MIRROR DRAFT / THE PRODUCERS; fired reactively at the unlock (32345), never
  on a timer. Wave-5 pool holds all 56.
- **Deed gate (acd2be87).** `deedGateReady()` breakdown honest: 5/5/4/3/2
  distinct bars read `wavesFaced` (fed only by real startCombat/fieldFight/
  recordWaveKill wraps — never UI or calendar). Verified waves=true with the
  full bars and ok=false on a fresh game (contests/crises missing), and
  waves=false when short (w1=4/5).
- **Party-size gaming.** `partyN = 1 + min(candidates, 4)` — gaming it means
  dismissing allies pre-fight, which is a real social cost in the party
  system, not a free toggle. Noted, not exploited further (party system is
  another loop's target).

## Sibling sweep (same bug class: monster damage that can't reach armor properly)
- fieldFights.js pierce read: already correct (reads attacker's `mdef.pierce`
  from data directly). No other armor-absorption sites exist (only tbDamage
  player/villager blocks + fieldFights).
- Deliberately unchanged: landlord rent (economic, not a strike), sourceless
  terrain hazards (paper cuts/leased ground — by design), player/villager
  sources (pierce is monster-only), alien-player strikes (no pierce in data;
  different loop's system).

## REGRESSION NOTE: r13 test's 6 new lines are attribution artifacts, not regressions

`scripts/test-monsters-break-20261010.js` (yesterday's run; stale — expects 30
monsters, fails 134 lines on clean HEAD) gained 6 failure lines with this fix:
3× belltoad + 3× gallowdeer "telegraph honest ... hits outside telegraph".
Verified NOT a behavior change (both are wave-1, pierce 0 — damage identical):
the fix's `sourceKey` made the test's attacker-attribution succeed where its
name-match fallback previously failed, so previously-skipped events became
countable. The events are two DESIGNED, narrated mechanics the test's strict
"every hit inside the attacker's current telegraph cells" standard can't model:
- gallowdeer antler thrash: deliberately untelegraphed ("Closing in is risky
  EVERY turn... You get in, you hit, you get OUT"), narrated before damage
  ("getting close has a price").
- belltoad chorus-join: joining toads burst around themselves with no personal
  telegraph, but the join is announced ("Another throat swells — the CHORUS
  takes it!") and the counterplay is documented ("Break the pack, break the
  chorus").
Both narrate honestly per the no-silent-actions rule; neither is a committed
telegraphed attack. Game behavior identical HEAD vs fixed. The valid
regression suites (`test-wave3-5-20261010.js` 211/211, `test-party-tactics-
20261010.js` 47/47) are green with the fix.

## Files
- Fix: `src/js/game.js` (15 call sites + stale comment)
- Player-facing note: `src/data/build-notes.json` (prepended, pruned to 15)
- Proof: `scripts/test-monsters-break-r14-20261010.js` — 116/116 × 3 seeds
- Evidence: this file

## Commit
- Landed as a dedup: the engine fix (15 sourceKey call sites in game.js) was
  independently found and landed by the brawler loop as 446dd0bb (20 sites,
  strict superset incl. encounters.js/party.js) while this run was in flight.
  The game.js hunk is therefore NOT re-landed here — this commit lands the
  r14 evidence file, the proof/regression suite
  (scripts/test-monsters-break-r14-20261010.js, kept as the live-wiring
  guard), and the player-facing build-notes entry. Proof suite re-verified
  green against the live (brawler-fixed) engine: 116/116 x3 seeds.
