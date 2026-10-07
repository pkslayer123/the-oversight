# Conversation depth — evidence notes (2026-10-07)

Worker: flesh-out loop, queue #2 (social scenarios / dialogue coherence).
Scope: `src/js/conversation.js` ONLY. convo-*.js scenario files are sibling-owned
and dirty — untouched. game.js / app.js untouched.

## What was built (commit: conversation depth)

**1. Topic ledger** (`village.topicLog[vid]`)
- Every NPC beat is recorded against the current thread — via `sayLine`
  (the one choke point the dialogue layer's `dlg:` turns speak through) and
  the base `convoTurn` tail, with consecutive-duplicate collapse.
- Leaving mid-thread (`endConvo 'left'`) or changing the subject plants an
  open thread (`{tid, label, day, why, snippet}`, cap 4, 14-day lapse).
- Next conversation can open with a resume: "We never finished talking about
  X — we got cut off last time." Never ahead of a talk request, never twice
  running, trust ≥ 15. Discussing the thread resolves it.
- Wiring for scenario files: `Game.convoNoteTopic / convoThreadOpen /
  convoThreadResolve / convoOpenThreads / convoResumeOpener` (dlg: turns
  bypass the base turn hook, so scenario code should call these directly).

**2. Drift** — `Game.convoDrift(vid)` → `{grief, bitterness, wariness, warmth,
hardness}` 0..3, recomputed at most once/day from village memory +
lifeseed `lived[]` events + live needs. Stored on the char (stable within a
day). `convoDriftedTemper()` bends the read (grief→withdrawn,
bitterness→prickly, wariness→cautious, hardness→intense, warmth→warm);
`npcTemper()` stays authoritative for sibling systems. Drift states
(haunted/embittered/guarded/softened/hardened) feed `voiceMods` through the
new `convoVoiceState()` merge (data states first, drift table in code — no
data-file edits).

**3. Speech DNA** — `convoSpeechDNA(vid)` from the lifeseed: register, pace,
humor, address term, skill origins, home, kin, drifted temper.
`convoSpeechMarkers()` produces discourse markers merged into `voiceLine`'s
pools under the existing one-marker-per-line restraint. Plus
`convoSkillOriginLine(vid, skill)` — "who taught them," wiring point for
teach/learn scenario code.

**4. Recap verb** — `convoRecapChoice(vid)` (`'recap'` branch in base
`convoTurn`) re-anchors long exchanges from the per-conversation thread log:
"We started on X, then got onto Y." Menu insertion is the sibling's lane.

Ontology header updated (provides/rules/consumes);
`node scripts/validate-ontology.js` → 41 systems validated, release permitted.

## Proof test

`scripts/test-conversation-depth-20261007.js` — seeded mulberry32
(default 20261007, `SEED` env override), full production script list.
38 assertions across 5 sections; green on seeds 20261007, 42, 7, 1234,
999, 31337.

Caught two real bugs during development:
- `convoPlantOpenThread` planted the open thread then `convoNoteTopic`
  immediately resolved it (discussed ⇒ resolved). Fixed by noting first,
  planting second.
- Proof-test regex `/learned/` missed "learning"; register pair test was
  RNG-fragile → assert on whatever registers the roster draws.

## Regression checks

- Sibling convo suites all green with these changes:
  test-convo-depth-20261007 (74/74), test-convo-coherence-fixes-20261007
  (46/46), test-convo-beats-20261006 (41/41), test-npc-age-voice (83/83),
  test-player-voice (17/17), test-social-voice-hooks (ALL PASS),
  test-npc-voice (23/23 on rerun; one flaky run failed 2 — unseeded RNG).
- test-convo-mood.js is flaky on HEAD too (unseeded Math.random):
  HEAD 3–6 fails / mine 3–4 fails across 3 runs each, overlapping failure
  universe (mood-value assertions in dirty sibling convo-mood.js; my code
  never touches c.mood). Not a regression.

## Notes for the parent / next worker

- `docs/ONTOLOGY.md` was regenerated as a side effect of the required
  validator runs (it was already sibling-dirty; the regeneration reflects
  current code). NOT included in this commit — left for the release flow.
- The want-seed system (convo-wants.js) takes opener precedence over the
  topic-resume by wrapping `startConvo` outside the base: when a want seed
  fires, the seed opener wins and the resume stays queued. Documented in the
  proof test; coherent division (seeds = wants, ledger = topics).
- `dlg:` turns never reach the base `convoTurn` — the ledger sees them only
  via `sayLine`. If a future scenario speaks NPC beats without `sayLine`,
  it must call `Game.convoNoteTopic` / `Game.convoNoteBeat` itself.
