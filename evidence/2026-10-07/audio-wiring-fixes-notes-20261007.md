# Audio wiring fixes (2026-10-07, ~16:20 CDT)

Three known-broken items from the audio wiring backlog (run note 1548 +
audio-reverify-notes-20261007.md), all fixed and proof-green. Static proof
KNOWN_GAPS zeroed.

## Fix 1 — Drama.audioFor dead call (was game.js:14462, now ~14479)

**Before:** `D.audioFor(kind, args[0])` called a method that did not exist on
Drama; a `try/catch` silently swallowed the TypeError every drama visual.
The E1 comment described a mapping table ("map to null in D.audioFor") that
also didn't exist — doubly stale.

**After:** `Drama.audioFor(kind, arg)` implemented in src/js/drama.js, backed
by a `DRAMA_AUDIO_MATES` table (game.js drama kind → Game.audio voice, null
when the moment stays quiet). The stale E1 comment was rewritten to document
the real mapping, and the dead inner try/catch was removed (the dispatcher's
outer catch remains as backstop).

**Mate mapping (double-fire audit):** every voiced kind was checked against
existing `audioEvent` sites — adjacent-fire kinds map to null:
- voiced: secret→knowledgeReveal, ambush→ambushSnap (arming beat; the FIRE
  beat snaps on its own), wild→animalRustle, levelUp(ability)→levelup,
  synergyShimmer→synergyDiscovered (2nd tease; unlock fanfares separately),
  phaseShift→patternWindup, codexLinked→paperRustle, plantIdentified→
  knowledgeReveal
- quiet (own site already fires): hit, wisp, lootSparkle, critHit, enrage,
  npcAlert, contest, techniqueLearned, ahaMoment, skillGained, integration,
  playerDeath (→defeat on combat loss; ledger death moment stays quiet)
- quiet (pure-visual primitives): text/flash/shake/hero/exclaim/abilityBurst/
  signature/social/commentary/weather/trail/teaseFaint/villageBirth/
  villageDeath/newLife/systemCommentary

## Fix 2 — hummice aggroAudio (monsters.json)

**Before:** hummice was the ONLY monster declaring `aggroAudio` at the top
level (`"aggroAudio": "humRise"`). Every consumer reads
`(mdef.encounter || {}).aggroAudio`, so the declare was dead data and the
hummice fell back to deerAggro — a deer bellow for a mouse swarm.

**After:** moved into `hummice.encounter` as `"aggroAudio": "humRise"`.
`humRise` is a real registry voice (the swarm-hum synth, stacks-aware), so
the hummice now have their own voice at aggro, warn-escalation, and declare.
Static proof: deerAggro-fallback census 7 → 6.

## Fix 3 — antlerThrash double-run (game.js tbMonsterTurn)

**Before:** the preTurnHooks dispatch (monsterBehaviors.js `antlerThrash`
hook) fired `tbAntlerThrash` once, returned false, and the leftover inline
`if (isDeer && m.beamPhase !== 'firing')` branch fired it a second time —
two thrashes per turn. The monsterBehaviors.json migration docs say step (3)
is "remove the inline branch"; it was never removed.

**After:** inline branch removed; the hook is the single-fire path. Behavior
identical otherwise (same condition, same tbEndCheck handling).

## Proof results

- scripts/test-audio-wiring-fixes-20261007.js — **PASS (exit 0)**:
  - Part A: all 38 `D.*` call sites in game.js resolve to real Drama methods;
    DRAMA_AUDIO_MATES voices 8 kinds.
  - Part B: hummice `encounter.aggroAudio='humRise'` declared + in registry;
    no top-level-only `*Audio` declares remain in monsters.json.
  - Part C: node harness (full src/js eval, window stubbed for load then
    deleted for sync combat) runs the REAL tbMonsterTurn + REAL
    mbRunPreTurn dispatch against a lone gallowdeer — tbAntlerThrash fires
    exactly 1× with beamPhase='aim', 0× with beamPhase='firing'.
- scripts/test-audio-hooks-static-20261007.js — **PASS (exit 0)**:
  KNOWN_GAPS zeroed (all 6 resolved: statusApplied/statusCured +
  kiteUnfold/nevermoreUnfold/nightcourtTurn/nightcourtDive). 377 call sites,
  209 defined voices, 0 fired-but-undefined. DRAMA_AUDIO_MATES voices now
  counted as fired (a typo in the table fails the proof). Drama.audioFor:
  EXISTS.

## Tree-safety notes

- Worktree src/js/game.js, src/js/drama.js, src/data/monsters.json were
  byte-identical to HEAD at start (the MM dirtiness was all in the sibling's
  staged index — untouched). Fixes applied to pristine HEAD copies.
- **Revert hazard hit mid-run:** a sibling process rewrote all three files
  at ~16:18 CDT, reverting the first game.js edit (drama.js/monsters.json
  edits survived). Re-applied game.js edits and committed immediately —
  the commit is the only protection on this tree.
- Backups at /tmp/game-backup-audio.js, /tmp/drama-backup-audio.js,
  /tmp/monsters-backup-audio.json (all == HEAD); worktree restored after
  commit.
- Committed via scripts/safe-commit.sh (private index); no push.
