# Break-it: contest ENGINE (`src/js/contestEngine.js`) (2026-10-08)

Hostile-player audit of the NEW contest engine (commit e657deb, "contests
playable: real engine replaces RNG"). Both prior contest runs
(`break-contests.md`, `break-contests-2.md`) audited the OLD system before
this engine existed — their attacks were not repeated; their proof scripts
were re-run for regressions (see below).

Harness: full `src/js/*.js` eval in index.html order (minus DOM-only
app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js), `global.window =
global` during eval then deleted before play, Math.random seeded BEFORE
eval (mulberry32, SEED env override).

## Verdict: BROKE 4 times (1 live bug, 1 false-documented guarantee, 2 logic
holes), all fixed with before/after proofs. Sibling sweep caught 4 more
stale-odds copy lies in contests.js/alienPlayers.js, fixed.

## CATCH 1 — DETERMINISM LIE + SAVE-SCUM VECTOR (honesty/exploit, fixed)
The @ontology header claimed: "deterministic: same villager + same contest
= same fate. No hidden rolls." FALSE on both counts:
- `roll()` preferred `Scattering.combat.roll(range)` — `Math.random()`-backed.
- `duelFight` drew initiative/damage from a stateful module RNG (`R()`).
- `hide` drew spot checks from `R()`.
- `fieldFight` used `Math.random` captured at load + `combat.roll`.
Proof (scripts/test-contest-engine-break-1.js): a counting wrapper on
`combat.roll` saw **9 hidden rolls** during one pit + one duel resolution
pre-fix. Same-state double resolutions diverged (pit hp aftermath, duel
rounds 10 vs 9, duel damage). The save-scum vector was open: save before
dawn resolution, reload after a bad fate, `Math.random` reseeds, fate
changes — the engine's own anti-save-scum guarantee did not hold.
Fix: determinism ENFORCED, not aspirational. Every top-level resolution
reseeds a private stream from stable save-persistent state —
`_cxSeed(pids, contest)` = FNV-1a hash of (day, contest id, sorted pids,
per-pid stat snapshot) — via `_cxWithSeed`, which also sets `_det` so
`roll()` bypasses `combat.roll`. `fieldFight` accepts `opts.rng` and draws
every roll (damage, initiative, hp, awareness) from it; without `opts.rng`
the live path is byte-identical (verified: game.js and villager-agency.js
callers pass no `rng`). Reloading now replays the identical fate —
save-scum closed by construction. Seeds include stats, so training still
matters (seed varies with hp — asserted).
Proof: 8/8 post-fix (was 3/8 with 5 red pre-fix + crash on the missing
seed API).

## CATCH 2 — GROUP BLOOD RESOLVED AS A COOKFIGHT (live bug, fixed)
`contestResolveGroup` had no blood branch: any non-duel blood contest fell
through to `_cxOther`'s generic "making" resolution. Watch-mode Pit (and
Gauntlet/Siege/Tithe — all participants:1 in data) resolved as a cookfight:
pre-fix detail was literally `"0.0 vs 30"` with log "makes something the
aliens have never felt" — for a PIT FIGHT. Reachable on the live path:
`_contestVerdict` routes every watch-mode contest through
`contestResolveGroup`.
Fix: blood branch maps `_cxBlood` per participant (real fights). Lone-duel
(<2 pids) now returns 'lost'/'duel needs a partner' matching the single
path, instead of cookfight.
Proof: scripts/test-contest-engine-break-2.js sections A/B/E — 12/12
post-fix (7 red pre-fix).

## CATCH 3 — DUEL DEATH/DOUBLE-YIELD APPLIED NO DAMAGE (logic hole, fixed)
The duel branch of `contestResolveGroup` called `hurtVillager` only on
aWon/bWon. On aDied/bDied the survivor walked away UNWOUNDED from a fatal
duel; on doubleYield, 15 logged rounds of strikes left zero wounds in
village state — "fights are fought with real stats and real costs" violated.
Fix: both sides' taken damage applied in EVERY duel ending (matches the
established `_cxBlood` pattern where lethal `hurtVillager` precedes the
caller's kill handling).
Proof: canned-rec tests C/D — hp 100/100 → 0/75 (fatal), 88/91
(double-yield). 12/12 post-fix.

## CATCH 4 — CHEER NEVER REACHED DUELS (logic hole, fixed)
`contestResolveGroup` called `this.duelFight(pids[0], pids[1])` without
opts — watcher's cheer AND alien rigging (braveryBonus) silently did
nothing in duels, though the fiction says cheer "steadies the arm in
blood" and duel is blood. Fix: `duelFight(a, b, opts)`; braveryBonus
added to both duelists' bravery in the morale-break computation
(negative rigging breaks them sooner — honest).
Proof: opts-capture spy — `seen=undefined` pre-fix, `15` post-fix.

## CATCH 5/6 — DEAD CODE: unreachable fiction arms (fixed)
- `_cxBlood` had an `id === 'price'` altar-bleeding arm. Price is a
  **moot**-cat contest per data ("The System names a price: one villager,
  for the season. The village chooses who") — cat-dispatch never routed it
  to `_cxBlood`, and the bleeding fiction contradicted the data fiction.
  Removed.
- `_cxEndurance` had an `id === 'fetch'` race-legs arm. Fetch is a
  **weird**-cat contest per data ("Bring Us Something Interesting") —
  cat-dispatch routes it to `_cxOther`'s generic block; the race fiction
  contradicted the data fiction. Removed.
Proof: source assertions in test-3 section C (red pre-fix, green post-fix).
Note: fetch-as-weird now resolves via the generic "making" block
(survival/2 + nota*2 + clever vs difficulty) — stat mix is defensible for
"bring something interesting"; left as designed.

## SIBLING SWEEP — stale "odds" copy (honesty, fixed)
e657deb replaced win-ODDS with real PERFORMANCE, but four player-facing
lines still promised the odds model:
- sadistic rigging note: "The odds just shifted." → "Your people just felt
  the room turn against them." (alienPlayers.js)
- fan favor: "(+8% — the people love you)" → "(the people love you — it
  steadies them)"; disfavor "(-8% — the crowd wants blood)" → "(the crowd
  wants blood — it shakes them)" — the mechanic is now ±8 bravery, not ±8%.
- cheer feedback log: "cheer +5% win odds" → "cheer +5 — they heard you"
  (contests.js).
- Three code comments saying "moves/bends the win odds" updated to
  performance language.
Checked and HELD (not bugs): `apContestInterference`'s `Math.random() <
0.35/0.4` rolls are alien-AGENT behavior (a rival deciding to rig, an ally
deciding to intervene) — declared inputs (winMod/deathSave) to the verdict,
not hidden fate rolls; RNG-as-hidden-world-state, legitimate per doctrine.
`fieldFight`'s live callers (game.js tent encounters, villager-agency.js
meetings) pass no `opts.rng` — live behavior untouched.
Proof: scripts/test-contest-engine-break-4.js — 7/7 post-fix (4 red
pre-fix, quoting the stale copy verbatim).

## Attacks that HELD (solid notes)
- **Softlock sweep**: all 44 pool contests resolve single AND group — no
  throw, no hang (per-call wall-clock guard), every outcome in
  {won, lost, died}. duelFight terminates under adversarial stats (1hp vs
  100hp, round cap 15). fieldFight terminates (MAX_ROUNDS=15); monster
  disengagement rule holds — mFlee means "driven off, the System sends
  another" (gauntlet continues), vFlee/standoff means lost; no purposeless
  disengagement anywhere in the pit/gauntlet/siege path. (test-3 A/B)
- **Cheer cap**: genuinely capped — `Math.min(0.15, ac.cheer)` at verdict
  (and at accumulate, per run 1); engine sees at most cheerBonus 15 /
  cheerLift 3 from cheer. Alien winMod (±0.12/±0.08) applies AFTER the cap
  as its own declared meddling. Verified end-to-end through
  `_contestVerdict` with cheer 0.9 → bonus exactly 15. (test-3 D)
- **contestBeastFor**: returns a pool member, closest average-HP to target,
  deterministic; wave-scoping comes from `monsterWavePool()` (unlocked
  waves only), escalation from the caller's targetHp scaling — the
  misleading "escalate by wave" comment on the unused `wave` param fixed.
  Monster/loot tiers never conflated (selection is by HP proximity only).
  (test-3 E)
- **Dead-code sweep**: contestEngine.js in index.html (line 45, after
  contests.js); all 4 ontology provides exist AND are reachable —
  `contestResolveVillager` via `_contestResolveOthers`,
  `contestResolveGroup` via `_contestVerdict`, `duelFight` via group,
  `contestBeastFor` internally. (test-3 F) — note: `contestResolveGroup`
  was missing from the ontology provides list; added.
- **Determinism is state-sensitive, not constant**: seeds vary with hp —
  training/healing still change fates. (test-1 E)
- **Duel death threshold honesty**: "death only on massive overkill (≥60%
  of maxHp in one strike)" — with the tactical formula (4+wb..8+wb) this
  needs wb ≥ 52, i.e. endgame-grade weaponry; "accidents happen" stays
  rare and honest. aDied/bDied branches handled in group resolution.

## Regressions
- test-contests-playable-20261008.js (engine's own): 29/29
- test-contest-beats-20261008.js: 1117/1117
- test-contest-fear-20261008.js: 19/19
- test-contest-play-20261008.js: 550/550
- test-contest-break-1.js (run 2): 5/5
- test-contest-break-2.js (run 2): lifeline still converts death→loss with
  bonded ally; control still dies
- validate-ontology.js: 50/50, docs/ONTOLOGY.md regenerated

## Pre-existing failures (NOT mine — identical on pristine HEAD, noted for
the record, out of this target's scope)
- scripts/test-break-contests.js: 61/63 — "MOOT_JUDGE unknown terminal"
  (a sibling added the moot rework after run 1; MOOT_JUDGE IS handled at
  contestChoose:2610 — the old proof's allowlist is stale) and "verdict
  adds cheer to winOdds" (asserts the pre-e657deb odds model).
- scripts/test-alien-players-integration-20261008.js: 47/54, 7 failed —
  all assert the pre-e657deb odds model ("applies apWinMod to winOdds",
  "honors apDeathSave on the death branch", "favor beats favor 0 over
  identical rolls (odds bend)"). Stale proofs vs the new engine; the
  alien-players system gets its own break-it run (target index 7).

## Files
- scripts/test-contest-engine-break-1.js (determinism: 8 asserts)
- scripts/test-contest-engine-break-2.js (wrong resolver/damage/cheer: 12)
- scripts/test-contest-engine-break-3.js (softlock/dead-code/cap/beast: 16)
- scripts/test-contest-engine-break-4.js (stale-odds copy: 7)
- src/js/contestEngine.js (seed machinery, blood group branch, duel damage,
  cheer-to-duel, dead-arm removal, ontology header)
- src/js/fieldFights.js (opts.rng determinism hook, ontology note)
- src/js/contests.js (cheer feedback copy, 3 stale comments)
- src/js/alienPlayers.js (3 stale-odds notes, 2 stale comments)
- docs/ONTOLOGY.md (regenerated by validator)
