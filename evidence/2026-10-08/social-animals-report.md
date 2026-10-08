# social-animals worker — evidence note (2026-10-08, ~00:30–01:10 CDT)

Worktree: `~/workspace/worktrees/social-animals`, base `5b266b2`.
Owned files: `src/js/encounters.js`, `src/js/truth.js`, `src/data/animals.json`.
Changed: `src/js/encounters.js` only (+ new test script + this note). `truth.js` and
`animals.json` needed no changes.

## Fixes shipped (all in src/js/encounters.js)

### 3. 12 animal behaviors lacked encAnimalCue coaching
Verified exactly 12 behaviors in `animals.json` had no CUES entry: `aerial, ambush,
burrowing, cautious, pack, patient, semiaquatic, social, stealthy, still,
unpredictable, wading`. Added distinct, fiction-true coaching lines for each
(e.g. stealthy/panther: "The birds going silent is your only warning...";
cautious/bear: "It's not scared — it's DECIDING."). Contract unchanged: cue fires
only when the animal is known (3 encounters or a kill), null otherwise.

### 4. Winded turns were silent
`animalTurn` had `if (a.pstate === 'winded') return; // spent. your move.` — a fully
silent turn. Now says: "[Animal] stands spent — sides heaving, head low. It's not
running any more. Your move." Pant audio is NOT re-fired (it already fired on the
winded transition); the line fires every winded turn.

### 5. Slow-behavior strike-miss said "bolts"
Box turtle huntText: "It doesn't care." Gila monster huntText: "It doesn't flee."
But the clean-miss feedback said "bolts", the near-miss said "jinks at the last
breath", and `encMissReact` set `pstate='bolt'`. Fixed per behavior:
- new `encSlowMissVerb(a)`: turtle → "draws into its shell — the slowest dodge in
  history, and it worked. It doesn't flee; it barely even hurries."; gila →
  "holds its ground — beaded head turning toward you, slowly, mouth open wider.
  It doesn't flee. It never was going to."
- clean-miss chain routes `slow` through it (before the generic "bolts").
- near-miss text for slow: "Not even close — [turtle] doesn't jink. It doesn't
  move at all. You miss with your hands anyway. A stationary turtle. Feel the shame."
- `encMissReact`: `slow` now stays (`a.aware = 1; return false;`) — no more
  fiction-incoherent bolt state. ('slow' deliberately NOT added to encNeverBolt,
  whose "doesn't even flinch" line would be less vivid than the tuck/hold-ground
  verbs.)

### 6. fleeDifficulty was dead data — DECISION: wired in, not deleted
`schemas.json` validated the enum (`trivial/easy/medium/hard/very_hard/dangerous`)
but nothing in `src/` read the field. Decision: wire it into flee resolution via
`encPreyCfg`. For species WITHOUT hand-tuned `ENC_PREY` table entries (the
2026-10-07 expansion animals — panther, bear, bison, mink, etc.), `fleeDifficulty`
now drives the chase tuning: `[notice, awareRate, stamina]` =
trivial [2,0.25,1], easy [3,0.35,2], medium [4,0.50,3], hard [4,0.65,4],
very_hard [5,0.80,5], dangerous [5,0.85,4] (dangerous = it can hurt you → notices
fast). Hand-tuned `ENC_PREY` table entries ALWAYS win (e.g. deer keeps
notice 4 / awareRate 0.50 / stamina 3 even though its fleeDifficulty is 'hard').
Rationale: deleting would throw away per-animal hunt-difficulty data the content
workers curated; wiring it as the default layer keeps hand-tuned values sacred
and gives data-only animals real chase differentiation.

## Tests
`scripts/test-social-animals-20261008.js` — 27/27 PASS on SEED=20261008 and
SEED=99. Full index.html script order eval'd (minus DOM-only
app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js); window stubbed for eval,
deleted before play; RNG seeded (mulberry32).
Covers: cue coverage for all 38 behaviors (known→present+distinct, unknown→null);
fleeDifficulty mapping incl. table-precedence; winded-turn narration (two
consecutive turns); slow miss verb/unit/near-miss/clean-miss paths (forced RNG
into both miss bands); played-as-player feel (panther cue after learning, deer
run to winded).

## FINDINGS — in betrayal.js, NOT my file (reported, not fixed)
Per the worktree partition I must not touch `src/js/betrayal.js`. Both audit
items verified real; left for the worker that owns betrayal.js:

**F1. talked_down ambush escape beat speaks as the LEADER** (`src/js/betrayal.js`
~line 2993–3003): in the ambush conversation handler, when the exchange resolves
(`res.aftermath || plot.outcome`), `finish(res.line || 'You get out. Breathing
hard, alive.', …)` calls `this.sayLine(vid, line)` where `vid` is the ambush
leader — so the escape narration renders as the leader's dialogue. Fiction
incoherence: they just tried to kill you; they don't narrate your escape.
Recommended: emit the aftermath line via narration (`this.say`) instead of
`sayLine` on that path.

**F2. conductTrial asks for the player vote only 90% even when the player convened**
(`src/js/betrayal.js:1120`): `tallyVotes` has
`const playerVoter = !c.accused.includes(this.villagerId) && R() < 0.9;`
while its own comment says "the player's role: always at the moot unless they're
the one accused". Also, the case object carries NO convened-by-player flag
(grepped: no `convened` field anywhere; `demandMoot` at :3428 is the
player-as-accused demanding trial, where the player doesn't vote anyway — the
"convened by player" case is player-as-accuser/bystander and needs a flag added
at the convene call site(s)). Recommended: add `c.playerConvened = true` where
the player brings/convenes the moot, and make `playerVoter` unconditional when
it's set (or honor the existing comment and drop the 0.9).

## Played-as-player feel judgment
- Deer chased to winded: the spent line lands right — the hunt's payoff beat
  now reads instead of going quiet.
- Turtle miss: "the slowest dodge in history, and it worked" is funny and true;
  the near-miss "Feel the shame" is the right tone for missing a stationary turtle.
- Panther cue after learning: "The birds going silent is your only warning" —
  distinct, earned, actionable.
