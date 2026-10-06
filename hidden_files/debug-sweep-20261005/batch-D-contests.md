# Batch D — contest/show debug scenarios (2026-10-05)

Headless Node sweep. Each scenario run in its own child process with a 60s wall-clock guard.
**IMPORTANT: this run was NOT committed and does not touch git. Nothing was fixed.**

## Design context (Steve 2026-10-05)
Contests are UNAVOIDABLE interruptions: they grab you (or rarely offer a choice),
you go through the sequence even to refuse, and non-participants watch. The old
dice-roll `resolveContest` was just replaced by `contestInterruption()`, which
announces the interruption and sets `state.activeContest`. Playable contest
mechanics per contest type are the next build and are NOT expected to exist here.

## Results

| scenario | loads? | error (if any) | interruption fires? | notes |
|---|---|---|---|---|
| contestPit | yes | — | yes (phase=intro) | returned=true<br>pending={"contestId":"pit","participant":"player","firesDay":16,"variant":null}<br>active={"contestId":"pit","participant":"player","phase":"intro","variant":null}<br>log tail:<br>Haven. Twelve people. The fire is lit.<br>A woman, maybe 40s: "Don't bother picking around the tents. Walk out. The land feeds people who go looking."<br>📓 Journal: Food won't come to Haven. Walk past the treeline — learn what grows out there, bring it back, and get it named at camp.<br>🐞 SCENARIO: contest — The Pit. Day 15, you're eligible.<br>The System should pick a contest soon. Check eligibility via the leaderboard. |
| contestHide | yes | — | yes (phase=intro) | returned=true<br>pending={"contestId":"hide","participant":"player","firesDay":21,"variant":null}<br>active={"contestId":"hide","participant":"player","phase":"intro","variant":null}<br>log tail:<br>Haven. Twelve people. The fire is lit.<br>A person, maybe 50s: "Nothing grows here but dirt and tents. Past the treeline — that's where the green is. That's where the food is."<br>📓 Journal: Food won't come to Haven. Walk past the treeline — learn what grows out there, bring it back, and get it named at camp.<br>🐞 SCENARIO: contest — Hide and Seek. Extreme risk.<br>The seeker is a wave-2 predator. Test with different loadouts. |
| contestForage | yes | — | yes (phase=intro) | returned=true<br>pending={"contestId":"calorie_run","participant":"player","firesDay":19,"variant":null}<br>active={"contestId":"calorie_run","participant":"player","phase":"intro","variant":null}<br>log tail:<br>Haven. Twelve people. The fire is lit.<br>A person, maybe 30s: "Don't bother picking around the tents. Walk out. The land feeds people who go looking."<br>📓 Journal: Food won't come to Haven. Walk past the treeline — learn what grows out there, bring it back, and get it named at camp.<br>🐞 SCENARIO: contest — Calorie Run. Foraging competition.<br>Whoever collects the most calorie-dense materials wins. |
| showWhyEat | yes | — | n/a — no pendingContest to resolve | returned=true<br>no pendingContest after scenario — nothing to resolve.<br>log tail:<br>Haven. Twelve people. The fire is lit.<br>A woman, maybe 30s: "Don't bother picking around the tents. Walk out. The land feeds people who go looking."<br>📓 Journal: Food won't come to Haven. Walk past the treeline — learn what grows out there, bring it back, and get it named at camp.<br>🐞 SCENARIO: TV show — WHY DO THEY EAT?<br>The aliens are horrified by cooking. The audience is delighted. |
| contestEligible | yes | — | n/a — no pendingContest to resolve | returned=true<br>no pendingContest after scenario — nothing to resolve.<br>log tail:<br>Haven. Twelve people. The fire is lit.<br>A person, maybe 30s: "Nothing grows here but dirt and tents. Past the treeline — that's where the green is. That's where the food is."<br>📓 Journal: Food won't come to Haven. Walk past the treeline — learn what grows out there, bring it back, and get it named at camp.<br>🐞 SCENARIO: contest eligibility. Day 15, you slew a wave-2 beast.<br>Check the leaderboard — you should be eligible with notability.<br>🐞 Eligible: 1 (You) |

## Findings (beyond the table)

### The interruption announcement is silent in the debug scenarios — real bug
`Game.sysSay` (game.js:13026) only writes when `state.systemArrived` is true:

```js
sysSay(text) {
  if (this.state.systemArrived) this.say(`📺 SYSTEM: "${text}"`);
},
```

`contestInterruption()` announces the whole interruption **only via `sysSay`**.
The debug scenarios start a fresh game where `systemArrived` is `undefined`, and
none of them set it — so **every interruption line is silently swallowed**.
In the batch run above, `resolveContest` "fired" and set `activeContest`, but the
log tail contains zero 📺 lines for all three contests (compare the log tails in
the table: nothing after the scenario intro text). Same for `showWhyEat` — its
single `sysSay` show announcement is also silent. A real day-15 game would have
the System arrived, but the debug scenarios don't replicate that, so testing
them shows a blank. Fix direction (Steve's call): either the scenarios set
`Game.state.systemArrived = true` at day 14+, or the contest-interruption
announcement should not be gated on System arrival.

### The watching path exists but is unreachable in these scenarios
Villager eligibility requires `state.village.positions[rid]` (contests.js
`contestEligible`). The fresh debug game sets no villager positions, so
`contestEligible()` returns **only the player** in all five scenarios — the
"you watch" path can never trigger through the normal flow. Supplementary probe:
manually gave villager `Darius` a position and set `systemArrived = true`, then
called `Game.contestInterruption(pitContest, 'darius-id')` directly → worked,
phase `watching`, log lines correct:
- `📺 SYSTEM: "📺 ═══ CONTEST INTERRUPTION ═══"`
- `📺 SYSTEM: "📺 The Pit. Thrown into an arena..."`
- `📺 SYSTEM: "📺 Arena: [ascii arena]"`
- `📺 SYSTEM: "📺 Darius has been chosen. The village holds its breath."`
- `📺 SYSTEM: "📺 You watch. The cameras love this part."`

So the watching-path code is wired and runs clean; it just can't be reached from
the current debug scenarios.

### Choice UI is a TODO, not implemented
`contestInterruption` has `givesChoice = contest.givesChoice || Math.random() < 0.3`
but both branches currently print "you're grabbed" — the refusal/choice sequence
is a `// TODO: actual choice UI` comment. Steve's design ("sometimes you get a
choice... even saying no is a sequence") is not yet built.

### Beyond the announcement: nothing playable (expected)
`state.activeContest` sits at phase `intro` (player) or `watching` (villager)
with no handler, no arena transition, no per-contest mechanics, no resolution
path. This is the known next build, not a regression.

## Readout

- **What actually works:** scenarios that load, `fireContest` sets `pendingContest`,
  `resolveContest` routes into `contestInterruption` without throwing, and
  `state.activeContest` records phase `intro` (player picked) or `watching` (villager picked).
- **What is still missing (expected):** beyond the interruption announcement there is no
  playable contest gameplay — no arena, no choices UI, no watch-mode feed, no per-contest
  mechanics. The phase sits at `intro`/`watching` with nowhere to go.
- **Bugs vs junk:** see Findings above. The two real issues: (1) interruption/show
  announcements are completely silent in these debug scenarios because
  `sysSay` is gated on `state.systemArrived`, which the scenarios never set;
  (2) villager eligibility needs `village.positions`, which the fresh debug game
  never sets, so only the player can ever be picked — the watching path is
  unreachable through the normal flow (though the code itself works when probed
  directly). Everything else in the table is the expected "next build" gap.
