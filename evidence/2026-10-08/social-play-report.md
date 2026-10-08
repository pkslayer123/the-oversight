# Social scenarios — played as a player (2026-10-08)

Second full play of the social scenario suite (round 1: `scripts/play-feel-20261007-social.js`).
This run took **different paths on fresh seeds** and **chained acts that round 1 didn't chain**
(ambush → the target calls their own moot). Engine READ-ONLY throughout.

- Harness: `scripts/test-social-play-20261008.js` — full `src/js/*.js` eval in index.html
  order minus DOM-only (`app.js`, `sprites.js`, `tile-scenes.js`, `move-anim.js`) and minus
  `drama.js`; `global.window` stubbed for eval then deleted before play (sync combat);
  mulberry32, default seed 20261008.
- **Green across 3 seeds: 20261008 (81/81), 7 (76/76), 42 (80/80).** Assertions are
  legality assertions (outcome ∈ known set, terminal states), never specific RNG outcomes.

## ACT 1 — MOOT, ACCUSED (theft + assault on the books)

**Verdict: playable, tense, meaningful. No stuck states.**

Played the defense window hard: speak ×2 (second lands flatter — diminishing returns are
*visible*), alibi ("Nobody meets your eyes. That silence is its own testimony." — honest
silence, not a dead end), then the dirty subplot: the accuser bought a vote, I followed
the food (first dig whiffed at the honest 20% — "Nothing you can prove. Yet." — second
dig found it), exposed at the moot. Pressed the accuser in conversation. The clock ran
the count on its own — 3 days, the fire got built, no manual push needed.

Verdict this seed: GUILTY 11/11 → weregild ("You pay. And stay — this time.").
Other seeds: NOT GUILTY 3/7, NOT GUILTY 1/11 — the trial is genuinely undecided, evidence matters.

- **Fun:** the bribery subplot is the highlight — planting, finding, exposing is a real
  investigation loop with a payoff line at the fire ("Nobody likes being bought — least
  of all the ones who weren't.").
- **Friction:** a single investigate can whiff. The "Yet." hints at retrying; a brand-new
  player might read it as a dead end rather than "dig again." Minor.

## ACT 2 — MOOT, JUROR (ambush-plot case)

**Verdict: playable, meaningful. The vote has teeth.**

Worked the case: examined the site ("The earth keeps better records than people."),
named witnesses, pressed accomplices to exhaustion (8 presses, the well runs dry honestly),
offered the weakest leniency (they couldn't take it — "I can't." — a real character beat,
not a failed roll). Called the moot, voted guilty 2-vs-4-needed… acquitted 3-4.

The acquittal stung *correctly*: "Not guilty — this time." And the room remembered:
`moot_vote` in village memory, and "Your 'guilty' lands in the count, out loud, in front
of everyone. The accused hear exactly who said it." Voting is public and priced.

## ACT 3 — AMBUSH → MOOT CHAIN (the walk turns, then the fire)

**Verdict: playable, tense. Best player arc of the five.**

TALK path, three rounds: "The plan is leaking." → the accomplice crying → "The person
in their 30s drops their hands. 'Stop. Just — stop.'" The leader's opener was generated
from who she was to me (Grace — the one villager whose name I knew; everyone else still
"A person, maybe 40s" — knowledge-gating doing its job mid-crisis). Aftermath:
"You walk back to Haven with all of them, at a distance, in silence. Alive — and
nobody's hands are clean, least of all theirs."

Then I called the moot **on my own ambushers** as the target. Trial ran, acquitted 0-7,
and the aftermath line is perfect cold war: "They walk. The story stands — theirs.
You'll be watching your back for a long while." No stuck state, no dangling flags.

- **Friction:** the player vote is only *asked* 90% of the time (`conductTrial`:
  `playerVoter = … && R() < 0.9`), even when the player convened the moot. The code
  comment says "the player's role: always at the moot unless they're the one accused."
  Convening the fire and then spectating 1-in-10 feels wrong. Recommend: always ask
  when the player called the moot.
- **Bug (real, with repro):** the talked_down resolution ends with the wrong line.
  `ambushAftermath` returns no `line`, so `convoTurn` falls back to
  `res.line || 'You get out. Breathing hard, alive.'` — rendered via `sayLine` as the
  *leader's dialogue*, immediately after "You walk back to Haven with all of them, at
  a distance, in silence." A player who talked them down reads the leader saying
  "You get out. Breathing hard, alive." — an escape line on a talk-down resolution.
  Repro: `Game.debugScenario('ambush')`, TALK ×3 → talked_down, read the last beat.
  Fix direction: `ambushAftermath` should return a per-outcome closing line, or the
  fallback must not be sayLine'd as the leader's speech.

## ACT 4 — LIAR'S DEN

**Verdict: playable. The knowledge gate is airtight; the den feels like people.**

Five villagers, five borrowed coats (Brain surgeon, Navy SEAL, Senator, Michelin chef,
Fighter pilot). Claims hold the cover; tells name the *claim* and the behavior, never
the truth. Confrontations across the den hit both `confessed` ("✓ You figured it out —
Nadia: confessed: programmer (was claiming Brain surgeon)") and `deflected` branches.
Post-confession they speak the truth — earned, not leaked.

Knowledge-gate audit: scanned **every spoken line** at four stages (claims, tells,
confrontations, a week of decay) for any unconfessed truth — **zero leaks**.
A week of endDays grew open doubts 6 → 12 (slips happen; lies decay). The `attacked`
branch didn't land this run (RNG), but the outcome set is asserted legal.

- **Unique-person law:** five distinct gated descriptions → five distinct real names
  (Nadia, Yuki, Ibrahim, Lillian, Eduardo) revealed through talk, five distinct true
  pasts (programmer, musician, truck driver…). They read as people, not a cast.
- **Friction:** 8 watches sometimes earns no tell — an honest miss, and the scenario
  text signposts watching, so it's fair. A player who never watches has no path in;
  that's the design (observation is work).

## ACT 5 — EXILE (the walk)

**Verdict: playable, meaningful. The founding arc is the emotional core.**

Exiled → footsteps-receding audio, journal in-fiction, pack/codex cross the fire.
The pantry refusal is *spoken* ("You're exiled. They watch you from the fire, hands on
whatever's sharp. Take nothing.") — not a silent disabled button. Founding: claim
("You mark it with a cairn and a cut branch."), 4 timber trips, lean-to → hut,
cache to 12,000 kcal, 7 solo days, foundhaven → **Dawnrest**. Hard reset verified:
new village object, old Haven archived in `pastVillages` and continuing, trust/gossip
wiped, codex notes and pack intact, haven tile on the claimed site.

Petition variant: Emberhold listened, argued, voted — **accepted on probation**:
"You can stay. Probation. Fourteen days to prove you're not what they said… You eat
half shares, you work full days, and at the end they vote again." The gift is never
silently swallowed. This is the standout social beat of the run.

## Bugs / friction for a later run (src untouched — read-only run)

1. **Talked-down ambush ends with an escape line spoken by the leader** (above, ACT 3).
   Repro: `debugScenario('ambush')` → TALK until `talked_down`.
2. **Player not asked to vote at a moot they convened** (10% skip contradicts the
   "always at the moot" comment). Repro: ambush → `callMoot(caseId, villagerId)` as
   target; ~1 in 10 trials skip the vote.
3. Minor: single bribery investigate can whiff (by design, p=0.8); "Nothing you can
   prove. Yet." may read as a dead end to a new player rather than "dig again."

## Stuck states

None found. Every act resolves terminally: trial → resolved/acquitted with sentence
spoken; ambush → resolved with a known outcome + case opened; confrontations →
confessed/deflected/cleared; exile → founded or petitioned (accepted/rejected both
honest). No dangling `awaitingPlayerVote`, no unresolved plot left in `confront`.

## Regression tests

`scripts/test-social-play-20261008.js` — 76–81 assertions, green on seeds 20261008, 7, 42.
Covers: accused defense window + bribery subplot + clock-driven moot; juror evidence
work + public vote with memory/grievance teeth; ambush TALK→talked_down→player-called
moot chain; liar den (claims/tells/confronts/decay, zero-leak audit); exile founding
+ hard-reset law + petition both outcomes. Run: `node scripts/test-social-play-20261008.js`
(`SEED=…` to override).
