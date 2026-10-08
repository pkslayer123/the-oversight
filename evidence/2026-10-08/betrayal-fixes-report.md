# betrayal-fixes worker — evidence note (2026-10-08, ~00:41–01:00 CDT)

Worktree: `~/workspace/worktrees/betrayal-fixes`, base `cae8cb7`.
Owned: `src/js/betrayal.js` only (read-only elsewhere).
Findings from social-animals worker (evidence/2026-10-08/social-animals-report.md) — both confirmed real.

## F1. Talked-down escape beat spoke as the LEADER (fixed)
`betrayalTurn`'s `finish()` always called `this.sayLine(vid, line)`, so the
aftermath fallback "You get out. Breathing hard, alive." rendered as the
ambush leader's dialogue — fiction incoherence (they tried to kill you; they
don't narrate your escape). `ambushAftermath` returns no `line` on this path,
so the fallback was always the beat in question.

Fix: `finish` takes a `narr` flag; the aftermath branch
(`res.aftermath || plot.outcome`) passes `true`. Narration goes through
`this.say` and the transcript is tagged `{ who: 'narr' }` (existing transcript
convention, also used in game.js; rendered as system-narr in app.js). All
other branches unchanged — mid-conversation beats still speak as the leader.

## F2. Player vote only 90% even when the player convened the moot (fixed)
- `callMoot` now sets `c.playerConvened = true` when the caller is the player
  (`byId || this.villagerId` — covers the player-convene choice site and any
  player-driven demandMoot path; the NPC accuser-clock call site is unaffected).
- `tallyVotes`: `const playerVoter = !accused.includes(player) &&
  (c.playerConvened ? true : R() < 0.9)` — unconditional when convened, 90%
  preserved for NPC-convened moots. Comment updated to match reality.
- Accused player still never votes, even with the flag set (guard clause is
  on the accused check, not the flag).

## Tests
`scripts/test-betrayal-fixes-20261008.js` — 12/12 PASS on SEED=20261008 and
SEED=99. Full index.html script order eval'd (minus DOM-only
app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js); window stubbed for
eval, deleted before play; RNG seeded (mulberry32).
- F1: real ambush armed → startConvo → springAmbush → three real
  `betrayalTurn('betrayal:talk')` calls; talk-down (p=0.7/third talk) reached
  by bounded reseed. Asserts: beat line is the fallback; never appears in
  sayLine-attributed output; appears in narration; transcript entry is
  `who:'narr'`; no leader-name prefix.
- F2a: real `openCase` + real `callMoot(caseId)` (player convenes): flag set;
  200/200 seeded tallyVotes runs include the player vote.
- F2b: flag false → 2000 seeded runs give 0.90±0.03 vote rate; accused-player
  case with flag set → 0/50 votes.

## Played-as-player feel judgment
- Talk-down escape now lands as a breath of narration after the crack beats —
  the leader stops talking at exactly the moment they should.
- Player-convened moot: "The moot turns to you. Your vote matters here" now
  fires every time you call the fire — convening feels like power, as it should.
