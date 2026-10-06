# Detective playtest — 2026-10-05 (evening run)

Archetype: detective — lies, doubts, gossip cross-reference, confrontation.
Rotation index was 6; advanced to 7 (next: drifter).

## What ran
- `node scripts/playtest-detective.js --seed 11/22/33` (5-day runs, 11 villagers each).
- `node scripts/test-truth.js` — 42 passed, 0 failed (incl. 2 new regression tests).
- `node scripts/validate-ontology.js` — all 26 systems validated; release permitted.
- Committed 25e6b7f, bumped, committed 1ae63ac, pushed; live version.json
  verified serving `25e6b7f-20261005-214009`.

## Bug found and fixed
Goal-lie confessions and contradiction doubts rendered RAW goal ids in spoken
dialogue. Seed transcript, actual output:
> "I don't actually want belong. I want survive."
Fix: added `Game.goalWantText(id)` in src/js/truth.js (maps id → characterGen
`want` phrase, falls back to the id), used in the confrontation confession
line and the contradiction doubt journal text. Post-fix transcript:
> "I don't actually want to belong somewhere. I want to survive, whatever it
> takes. I wasn't protecting myself. I was protecting someone else."
Tests 21–22 in scripts/test-truth.js lock this in.

## System health (across 3 seeds × 5 days)
- Natural liars: 1–6 of 11 villagers per game; plausible covers, motive-driven.
- Doubts fire through all five channels: gossip cross-ref, slips (ambient +
  mid-conversation), observation, contradiction, behavior.
- Confrontations resolve ~40–60% via confession; the rest deflect or attack.
  `already-confessed` stale-doubt path works (no double confessions).
- No crashes, no duplicate doubts, journal notes surface as ❓ entries.

## Feel verdict
The loop produces genuinely good story beats — the confession + motive speech
combo lands emotionally ("You don't know what it's like, being the only
nobody in a camp of somebodies"). Detection channels fire at a good cadence:
enough that an active detective finds threads, few enough that most villagers
are just people. Paranoia stays earned.

Friction (not fixed this run — UI work, flagged):
- Contradiction doubts form almost silently in the moment: the only
  in-the-moment signal is a generic 📓 "jotted down what they said" tick; the
  actual ❓ doubt text lives in the journal PEOPLE section. The player must
  read their journal to be a detective — arguably by design, but a first-time
  player may never discover the doubt system exists. docs/TRUTH.md already
  notes `Game.doubtsHTML()` is ready but unwired in app.js — that dedicated
  section is the natural fix. Deferred: another agent is actively reworking
  conversation UI (2026-10-05 directive: Pokémon-style dialogue box,
  transcript cap 200).

## Shared-tree notes
- `src/js/food.js` was already modified before this run; `contests.js` /
  `debug-scenarios.js` were touched and restored by a sibling mid-run. None
  were committed or touched by this run (only truth.js + test-truth.js).
- A sibling's version bump (a276275-20261005-213949) went live just before
  this run's bump.
- New untracked `hidden_files/` and `tools/` dirs in repo root belong to
  other agents; left alone.
