# Events pool expansion — design notes (2026-10-07)

Worker run: flesh-out loop, "add content to small pools." The events pool at HEAD
(`git show 9fb9729:src/data/events.json`) holds **4** entries, not 3 as the brief
stated: first_hunt (d8), stranger (d9), hushwolf_pack (d10), system_task (d12).
Six new events were designed, bringing the pool to 10.

## Context that shaped the design

- Event engine at HEAD (`game.js` ~14579-14671): `scheduleSystemEvents()` copies
  every entry with a `scheduledDay` into `state.scholar.timedEvents`;
  `checkTimedEvents()` fires each when `day >= scheduledDay`; `triggerEvent()`
  honors `once`/`repeatable`+`cooldownDays` and dispatches to the named
  `ev*` handler. `scheduledDay` is the ONLY trigger mechanism at HEAD, so all
  six are `once:true` scheduled events on fresh days (14/16/18/21/24/27) — no
  clumping with the existing 8/9/10/12.
- System voice per docs/DESIGN.md: "earnest alien, cheerful game-show host,
  technically-right-spiritually-wrong." Descriptions are written in that voice
  or in the telegraph register of the existing entries.
- `scripts/validate-data.js` at HEAD **crashes on events.json**
  (`TypeError: get(...).forEach is not a function` at line 157 — the file is a
  `{_comment,_schema,events}` wrapper object, not an array). Pre-existing
  breakage, unrelated to this expansion; the proof test therefore asserts every
  schema field the loader actually reads instead (allowed by the task spec).
- Fragment style: compact single-line objects, alphabetical key order
  (`cooldownDays,description,handler,id,name,once,repeatable,scheduledDay,type`),
  ASCII-only descriptions (no emoji — the handlers add flair at merge time),
  matching the existing file byte-for-byte in convention.
- Merge workflow (per the file's own `_comment`): splice the six objects into
  the `events` array after `system_task`, then implement the six `ev*`
  handlers in game.js. **DO NOT merge while the tree is hot:**
  `src/data/events.json` is currently staged-deleted by a sibling (confirmed
  stale-base revert hazard). The fragment waits in
  `~/workspace/goals/the-scattering-roguelite-survival-game/hidden_files/events-expansion-20261007.json`.

## Design rationale, per event

**fan_package (day 14, drama).** The broadcast layer (DESIGN.md: "fan care
packages — wacky, never dinner") finally shows up in the event stream. Player
moment: a genuine laugh — a rubber duck and hair ties dropped from orbit, with
the System earnestly certifying "it is not dinner." Knowledge thread: teaches
the audience/favor economy by feel — the parenthetical "the fans are watching"
tells the player this is a social performance, not loot. Cost named: a
day-part to open it properly. Social consequence, zero mechanics: what you do
with a duck in front of an audience is a story, not a stat.

**quiet_woods (day 16, monster).** The hushwolf's true telegraph is the silence
itself (birds going quiet — established in the telegraph work). Player moment:
dread without a jumpscare; the woods holding their breath is scarier than a
stat block. Knowledge thread: this is the cue-teaching beat — after this, the
player who investigates learns the silence = predator pattern, which is exactly
how the monster codex is supposed to be earned (observed, not told). Cost
named: investigating costs a day-part; barring the door teaches nothing. The
choice IS the knowledge gate.

**cooking_lesson (day 18, quest).** The System, which "forgot the survival
basics," tries to teach cooking and gets it alien-wrong ("apply heat until food
stops being food?"). Player moment: the teacher becomes the student — you
demonstrate a cooked meal start to finish while the System takes notes. This is
the fiction's thesis in miniature: the aliens are genuinely trying their best
and are genuinely clueless. Knowledge thread: teaches the food-reality system
(raw = fewer kcal + disease risk; processing changes net calories) through a
story instead of a tutorial panel. Cost named: a day-part and 300 kcal of
tubers sacrificed to the demonstration. Social consequence: the village
watches the System be embarrassed — relationship beat, not a buff.

**river_trader (day 21, drama).** Villages are independent sims and news
arrives "delayed, possibly wrong" (DESIGN.md). Player moment: the first face
from outside Haven — a practiced smile, heavy pack, news you can't fully
trust. Knowledge thread: teaches the news-not-omniscience rule by making the
player live it; also the standing-ladder idea (how you treat a guest is
visible). Cost named: ~600 kcal to feed a guest, a day-part to trade, and the
warning that "rudeness is free, but the river remembers" — consequences social,
not mechanical.

**trial_offer (day 24, challenge).** Abilities are earned via trials, "pick 1 of
3," customized to the student (DESIGN.md). Player moment: the System presents
something designed JUST for you based on "extensive and flattering"
observations — equal parts exciting and unnerving. Knowledge thread: teaches
the ability economy (trials as the earned path, the 6-slot cap looming behind
it). Cost named: a full day-part, and you end drained — the price is legible
before you accept.

**storm_front (day 27, drama).** Weather as a knowledge-gated decision, not a
random tax. Player moment: the bruised sky, the old-timers tying things down —
do you shelter or risk the dusk window? Knowledge thread: weather-sign reading
is foreshadowed as learnable (the old-timers know; you can learn). Cost named
both ways: sheltering costs the dusk foraging window (400-800 kcal haul);
getting caught costs more. Honest stakes, player's call.

## Validator / proof-test output

`validate-data.js` from the HEAD extract (pre-existing crash, unchanged by this work):

```
TypeError: get(...).forEach is not a function
    at main (/tmp/head-evt/scripts/validate-data.js:157:22)
```

Proof test (`scripts/test-events-expansion-20261007.js`, scratch-merge of the
fragment onto HEAD's events.json in /tmp): ALL GREEN — 10/10 events valid JSON
with the exact loader field set, alphabetical keys, evCamelCase handlers,
ASCII-only cost-naming descriptions, unique ids and scheduled days; simulated
days 1-30 dispatch every event exactly once on its scheduled day with no
exceptions; once-semantics hold on re-check; unknown/null triggers ignored
defensively; firedEvents bookkeeping complete.

## Files

- Fragment (merge-ready, awaiting a cool tree):
  `~/workspace/goals/the-scattering-roguelite-survival-game/hidden_files/events-expansion-20261007.json`
- Proof test: `scripts/test-events-expansion-20261007.js` (repo, new file)
- This note: `evidence/2026-10-07/events-expansion-notes-20261007.md` (repo, new file)

Nothing in `src/`, `docs/`, or any existing file was touched. Committed via
safe-commit.sh (private index); not pushed.
