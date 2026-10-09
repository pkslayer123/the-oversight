# CONTESTS & SHOWS — design (Steve 2026-10-05)

The aliens' flagship is **OVERSIGHT**. Contests are its teeth. TV shows are its
gossip. Both interrupt your life. Neither asks permission.

## Unlock

Contests begin once the player survives the first couple of weeks: village
established, leaderboard has signal (~day 14–21). The first challenge is a
**pilot episode** — diegetic excuse for jank, and the System says so out loud.

No contest before then. The early game is survival; the show arrives when
you're worth watching.

## Eligibility — visible, legible

The player must always be able to answer "who can go, and why." Eligibility
is computed from legible factors and SHOWN (leaderboard screen):

- **Viewership rank** (the leaderboard): the primary gate. Top ~20% per
  challenge, varies by event. Your deeds move your viewership — big plays
  get watched.
- **Notability**: specific deeds flag you (killed a wave-2 monster, survived
  a moot, pulled off a heist). Notability can qualify you below the rank cut.
- **The System's whim**: occasionally the aliens pick someone for no
  legible reason ("the audience finds you *interesting*"). Rare, and the
  game admits it's arbitrary. This is a feature — it keeps everyone nervous.
- **Ineligibility**: the gravely wounded, the very young/old, and anyone
  currently exiled. Death disqualifies you permanently (obviously).

The village can see the eligibility list change. Being near the cut is its
own dread — coveted and feared, per the design.

## Scheduling — the 2/week budget

Contests and TV-show pulls share ONE budget: **max ~2 per week combined**.
More than that and it gets tiring; the interruption must stay an event.

- Contest events fire on timed intervals (the System announces a window,
  then a countdown). Only if qualified people exist.
- TV shows fill the gaps — but the budget is shared. A week with a contest
  gets at most one show pull. A quiet week might get two small pulls.
- The player never controls the schedule. They can see "the show is
  restless" as a pull approaches (gossip, System teasers), never the date.

## Contest events — the pool

A HUGE pool. Events are data, not code — each is a template with: name,
format, participant count, risk tier, prize table, arena flavor. Categories:

**Blood (combat):** vs monsters (released into an arena, or you into theirs),
vs humans (duels, gauntlets), last-team-standing. These are the feared ones.

**Endurance (survival):** dropped somewhere with nothing, first back eats;
starvation gauntlets; the System removes something you need and watches.

**Moot (social):** televised trials, lie-detection games, trust competitions.
Non-fighters level fully here — gossip is a progression track, not a
consolation prize. Winning a moot can be as lucrative as winning a duel.

**Weird (the unhinged spins):** the aliens' idea of entertainment. Cooking
with ingredients that fight back. Hide-and-seek where the seeker is a wave-2
predator. "Bring us the most interesting thing within a mile" — judged by
an audience that has never touched grass.

New events enter the pool as the show "renews for another season" — the
pool grows with progression, and old events retire when they've stopped
being interesting to the audience.

## The fear design

Contests are something to FEAR, not a quest board:

- **Countdown dread.** System warning + countdown. You see it coming and
  cannot stop it. The village reacts — people avoid the eligible, or cling
  to them.
- **Mandatory teleport.** When it fires, you go — no matter what you were
  doing. (Sometimes you're offered a choice to decline. Sometimes not.
  The System is clear about which.)
- **Death is on the table.** Contests can kill. The village watches its
  people go, and sometimes they don't come back. Corpses, funerals, gossip.
- **Companions.** Sometimes the chosen can bring friends. Who you bring
  into a deadly game — and who you leave — is its own drama, and the
  village watches that too.
- **Aftermath is content.** Winners come home changed (prizes, trauma,
  fans). Losers who live come home with stories. The village treats
  contestants differently afterward.

## TV shows — the in-between

Separate from contests. Not about winning — about being watched. The aliens
are as fascinated by gossip as combat. People get pulled away for all sorts
of silly reasons:

- **WHY DO THEY EAT?** — food bafflement. Contestants cook; the aliens are
  horrified.
- **The Moot** — televised trials and debates.
- **Break Room** — gossip show. Your drama, aired.
- **Mouth Race** — cooking competition.
- **Ask a Human** — call-in. Deeply uncomfortable.
- **The Death Reel** — highlights. Yes, including yours.

Show pulls are lower-stakes than contests but higher-embarrassment. A
villager pulled onto *Ask a Human* comes home with fans or with shame —
sometimes both. Shows are also how the audience meets non-fighters: the
gossip lane has its own celebrities.

## Ratings summons (implemented 2026-10-09; canon: OVERSIGHT design, Steve 2026-10-04)

When the numbers go soft, the System doesn't just schedule harder — it
summons YOU for a promo stunt. "Ratings summons (promos/stunts, small gifts,
ties to care packages)" is from the 2026-10-04 OVERSIGHT design; this
section records the implemented behavior (code: `contestTick`,
`fireRatingsSummons`, `ratingsSummonsPhases` in contests.js).

**Trigger.** Inside the normal TV scheduling (`contestTick`, day 14+): the
System schedules television like a producer — base 0.25/day, +0.15 when
viewership is declining week-over-week, −0.10 when ratings are high and
rising, +0.10 after a recent death or fracture (clamped 0.05–0.60). When
ratings are dipping and the scheduling roll passes, there is a 20% chance
the slot becomes a ratings summons instead of a contest or show pull.

**Budget.** The summons counts against the same 2/week combined
contests+shows budget — it replaces a slot, it doesn't add one.

**The three played choices** (a promo stunt, live, sixty seconds):

- **Do the stunt** — full commitment. Costs 200 kcal and 4 trauma. Wins:
  the numbers tick up while you're still moving, and it shakes a fan care
  package loose (`prize: true` → `_showEnd` WIN path).
- **Phone it in** — minimum viable effort. Costs 2 trauma. The chat clocks
  it instantly; lands as a loss.
- **Refuse on camera** — the no is the content. No resource cost. Refusing
  is itself a played sequence with consequences (lands as `refused`).

Like all TV, the summons rides the show phase engine: it lands in fans and
shame, never the contest prize/death paths. TV doesn't kill.

## Prizes — every lane

Prizes feed EVERY progression lane, never just combat:

- Item evolution assists, ability unlocks, synergy hints, knowledge dumps,
  supplies, fan care packages (wacky, never dinner).
- Social prizes: reputation, fan growth, audience boons (the audience can
  vote small favors).
- Fan clubs: audience segments per lane that send care packages, vote, and
  grow with highlights. Whatever you do, there's a club for it.

Prizes must be worth the fear. A contest you survive should change your
game — that's the high-risk/high-reward contract.

## Implementation notes

- Exists: `viewershipBoard()` in ledger.js (per-village viewership, trends).
  Comments mark it as the API future challenges read.
- Needed: eligibility computation + UI, event pool data + scheduler,
  countdown/teleport flow, arena resolution, prize tables, show-pull
  system, fan clubs.
- The leaderboard screen (app.js CONTEST section) is a stub — eligibility
  display goes here.
- Loot tie-in: contest prizes and monster loot share the alien-item pool
  (see monster loot economy work, 2026-10-05).
