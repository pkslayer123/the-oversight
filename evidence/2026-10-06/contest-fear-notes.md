# Contest fear/fun playtest — run 2 (2026-10-06)

Played 3 contests END-TO-END as a player via `scripts/play-contest-fear-2.js`
(full transcripts, rigged RNG both to survive and to die). Run 1 covered
pit, maw, riddle, confession, honey, secrets. This run: GAUNTLET, HIDE (watch),
OATH. All 31 play asserts + 27 regression asserts green.

## Verdicts

### GAUNTLET (extreme, grabbed player) — FEARED ✓ / FUN ✓
- Intro: "Almost nobody walks away from this one." Arena visual, System trash-talk.
- Three waves escalate (fast/stupid → bigger → wrong). A max-roll survive run
  ended at **1 HP** — barely surviving feels earned, not scripted.
- Best fear beat in the system: before the closer, the System DISPLAYS your
  wound-scaled death odds (~39% stand / ~29% run at 52 damage). Television +
  readable danger. This is the Highbeam Deer bar for contest fear.
- "Beg the crowd" (humiliating, maybe works) is a great third option —
  humiliation as a mechanic with a real weapon drop.
- Death mid-wave works; run ends. Damage is real.

### HIDE (extreme, villager taken → WATCH) — FEARED ✓ / watchable, not yet great
- The grab of a named villager lands: "Aaron has been chosen. The village
  holds its breath." Watch phases name them; "The Death Reel will be tasteful.
  It won't be." is a proper dread line. Extreme verdict killed Moshe on camera
  (20%) with a contest-specific FOUND YOU sting — the village says the name.
- **Design gap (not fixed, needs content not code):** the 3 watch phases are
  GENERIC — identical across all 27 contests. Watching hide-and-seek should
  feel like watching hide-and-seek (the count, the seeker), not "it's going
  badly. Or well." Small fix this run: mid/late watch phases now name the
  contest (`Hide and Seek — it's over.`). The real fix is contest-specific
  watch beats; that's a content expansion for a future worker.
- Watcher choices (cheer / shout advice / look away) are flavor-only — they
  don't touch the verdict. Honest as "watching," but a future pass could let
  cheering nudge win odds slightly (earned, televised, social).

### OATH (high, choice → participate) — FEARED ✓ / FUN ✓
- The three oaths are genuinely creepy: never lie to cameras; the System takes
  one memory ("It takes the summer afternoon. You remember remembering it.
  The shape of it is gone."); when the System calls, come. Win cost 24 trauma.
- The fear here is binding, not damage — good variety vs Gauntlet's meat.
- Choice→participate path resolves cleanly through all phases (no phase-0 loop).

## Eligibility / unavoidability signaling — all verified
- `contestEligible()` locked pre-day-14 with a reason naming day 14; day 15+
  returns the eligible list with id/name/notability/notes; Oversight panel
  (codex) renders it; pending-contest countdown row in the HUD.
- Grab announced **a day early** by contest name + chosen name + arena visual,
  1-day countdown visible in HUD. Next dawn: modal interruption, "you're
  grabbed. No choice." No skip path; refusal (where offered) is a played
  sequence, not a skip.
- **Out of my area (app.js):** the pending-contest HUD row shows the raw
  contest id (`📺 CONTEST: gauntlet — YOU in 1d`) instead of the contest name.
  The announcement sysSay uses the name. Recommend parent fixes the row to use
  the name (knowledge-gating is fine — the name was announced — it's just ugly).

## Changes this run (src/js/contests.js only)
- `_contestWatchPhases` phases 2–3 now name the contest (watchability).
- Harness: `hookSay` re-entrancy guard (say/sysSay cross-call triple-printed
  transcripts); `fresh()` hooks before depart so arrival text is captured quietly.

## Bug-class / sibling check
- No new bug class found. Checked for dependents on watch-phase text — none
  outside contests.js. Ran run-1 fear script + all contest suites: all green
  (74 + 15 + 812 + 48 + 52 + 143 asserts).
