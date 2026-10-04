# Synergy Discovery — Critical Playtest
**Date:** 2026-10-04
**Build:** `5c051df` (synergy active discovery)
**Method:** Code audit + empirical Node harness extracting the REAL `noteAbilityUse`/`checkSynergyDiscovery`/`synergyTease`/`unlockSynergy` methods from `src/js/game.js` and driving them through 12 scenarios (25 checks, all passing — the bugs below are in the game, not the tests).

## TL;DR

**2 of 12 synergies work as Steve designed. 2 are mathematically impossible to discover. 5 discover themselves with zero player agency. 1 requires dying three times. The hint system Steve asked for — the thing that makes synergies "guessable" — exists in the data but is never shown to the player.**

The tease *writing* is excellent. The *machinery* underneath it is broken.

## What's actually working (2/12)

**Apex Sense** (echo_location → tracker, sequential) and **Closed Loop** (camp_cook → compost_king, sequential) are the only two synergies that implement the vision: two deliberate player actions, in a guessable order, three times, with teases in between. Echo-locate (a real button you press, 1/day), then hunt. Cook, then bury the scraps. A clever player reads the ability descriptions and thinks "what if I try these together?" — exactly the puzzle loop Steve described.

These two prove the system *can* work. Everything else is evidence it currently doesn't.

## Dead content: impossible synergies (2/12)

**Perfect Chrysalis** (chitin_skin + molt, sustained) requires both abilities used on the same day for **3 consecutive days**. Molt is gated to **once per week** (`s.moltWeek = week`, game.js:4511). Three consecutive days is mathematically impossible. My harness confirmed: 21 days of simulated optimal play, streak never exceeds 1. This synergy — +25 max HP, one of the strongest rewards in the set — can never be discovered by anyone, ever.

**Refuses Death** (phoenix_clause → second_wind, sequential) requires the sequence 3 times. Phoenix Clause fires **once per run** (`s.phoenixUsed = true`, game.js:4543). The attempt counter is permanently stuck at 1. Confirmed in harness: 30 simulated days, `synergyAttempts['refuses_death'] === 1` forever. The other strongest reward in the set (death cheats recharge 2×) is equally unreachable.

The cruelest irony: the two most powerful synergies are the two impossible ones.

## Auto-discovery: the puzzle that solves itself (5/12)

Five synergies trigger from **a single game action that auto-logs both abilities**. The player presses one button; the game logs two "uses"; the "combination" the player is supposed to discover never involves any combining:

| Synergy | What the player does | What the game logs |
|---|---|---|
| **Stormcaller** | Press "Dowse" 3× in rain | dowsing + rain_dancer auto-logged together (game.js:3297) |
| **Sees the Weave** | Forage 3 days | third_eye + pattern_recognition auto-logged on every forage (3684–3685) |
| **Delver** | Loot 3 ruin items | scrounger + grave_robber auto-logged on every loot (3527–3529) |
| **Efficient Machine** | Travel 3 days | cold_blooded + hollow_bones auto-logged on every travel (1849–1850) |
| **Sun Eater's Garden** | Forage 3 daylight days | green_thumb + photosynthesis auto-logged on every forage (3681–3683) |

The player experiences the teases as pleasant random flavor text — "Your hands tingled in the sun today" — not as feedback on something they attempted. There is no "whoa, what did I just do?" moment because they didn't *do* anything. They foraged. The game handed them a synergy for existing.

This isn't a puzzle. It's a surprise dispenser. Surprises are nice, but Steve explicitly asked for the opposite: *"we don't want to reward quick one off attempts... require it be done a few times so people aren't just stumbling upon these."* These five are pure stumbling.

## Perverse and half-broken (3/12)

**Undying Fury** (rage + second_wind, simultaneous) unlocks after **dying three times** while having rage equipped. Worse: the "rage use" is a lie. `wasRaging = this.hasAbility('rage')` (game.js:4534) — the game logs a rage *use* for merely *possessing* the ability. You never raged. You just owned the ability and died. The hint says "Refuse to fall while refusing to calm down," but no calming or refusing is involved. Dying is already punished; making it the *intended* discovery path for a synergy is perverse design.

**Peacemaker's Voice** (diplomat → mediator, sequential) is half-RNG. Diplomat fires when you talk (deliberate). Mediator fires automatically during drama *events* (game.js:3415, the 'stranger' event) — the player can't choose when to mediate. You can talk all you want; the second half of the sequence arrives on the event scheduler's timetable, not yours.

**Crimson Circuit** (blood_magic → leech, sequential) is the most *convoluted-but-possible*: deliberately activate Blood Price, then get into a situation where you take damage for a villager (leech auto-fires, game.js:3911). Doable, plannable, but the second step's timing isn't really in player hands. Closest to working after the big two.

## The hint system is dead data

This is the big one. Steve asked for synergies to be *guessable*: "synergy methods should generally be known ways to apply the two skills." The data has 12 carefully written hints — "Echo first. Then hunt. Let your ears guide your eyes." / "Cook, then return the scraps to the earth. Nothing wasted."

**None of them are ever shown to the player.** `synergyTease` (game.js:4080) checks `if (n === 2 && dm.hint)` but only uses it as a *condition* — the actual hint text is never rendered. The attempt-2 message is a generic "Something wants to happen when you do... whatever you just did. (2/3)". I grepped both game.js and app.js: `dm.hint` appears exactly once, as that unused condition.

So the discoverability mechanism doesn't exist. Players get vibes ("the world had edges made of sound") with no logical thread to pull. The teases hint at the *nature* of the power beautifully, but there's no path from "that's weird" to "I should try X then Y." The puzzle has atmosphere but no puzzle.

## Smaller cuts

- **Wrong order is silent.** Try tracker → echo_location (hunt, then listen — arguably the intuitive order) three days running: zero feedback, zero progress, zero teases. The player can't course-correct because the game never tells them order matters. A single "that felt backwards somehow" would fix this.
- **Attempt double-counting collapses pacing.** Sequential/simultaneous have no per-day attempt cap. Echo → tracker → tracker on day 1 = 2 attempts (confirmed in harness). Tease 1 and tease 2 can fire minutes apart, then unlock the next day. The "savor over days" pacing Steve wants doesn't exist for non-sustained types.
- **The (n/3) counter spoils the mechanic.** "Something wants to happen... (2/3)" tells the player there's a 3-step progress bar. It also reads oddly for deliberate discoveries — the player *knows* what they just did; being told "whatever you just did" is the game winking at itself instead of respecting the player's intent.
- **Sustained streak-break is harsh and silent.** Miss one day (or one daylight forage, or one travel) and the counter resets to 1 with no warning. For auto-fire synergies this is just a timer; if any sustained synergy ever requires deliberate action, this will feel terrible.
- **The 40-entry use log** is probably fine, but sequential only checks "same day" — a player who echoes at dawn Monday and hunts at night Monday gets credit, which is generous and good.

## Are the rewards worth it?

For the two working synergies, yes: Apex Sense (+15% find, +10% hunt success) and Closed Loop (cook ×1.15, forage ×1.1) are meaningful, build-defining bonuses for 2–3 days of deliberate play. Good ratio.

For the auto-discovery five, the rewards arrive unearned — which cheapens them. Sun Eater's Garden (forage ×1.25) is one of the strongest economy effects in the game and it falls out of normal foraging.

For the impossible two, the rewards might as well not exist.

**Is 3 the right number?** For deliberate discovery, yes — 3 is "prove it wasn't an accident" without becoming a grind. The problem was never the number; it's that 5 synergies require zero intent and 2 require infinite luck.

## Puzzle or chore?

Currently **neither** — it's a slot machine. Five synergies pay out for normal play (pleasant but meaningless), two are real micro-puzzles (good!), two are unwinnable (frustrating if anyone ever figures out they exist), one pays out for dying (perverse), two are RNG-gated.

The two working ones *feel* like puzzles in the harness: attempt 1 tease ("edges made of sound") → attempt 2 tease ("almost see it... so close") → unlock. That arc is exactly right. It just needs the hint thread so players can actually find the door.

## Recommended fixes, in order

1. **Show the hints.** The data already exists. Surface `dm.hint` somewhere — attempt-2 tease, ability inspection screen, or a "Resonances" journal page that fills in as you get teased. This is the single highest-leverage fix; it turns atmosphere into a puzzle.
2. **Fix or cut the impossible two.** Perfect Chrysalis: change molt's gate or change the synergy to sequential (shed *then* harden in one near-death — actually dramatic). Refuses Death: change to "die with both equipped 3 times" or make phoenix re-armable. Don't ship unwinnable content.
3. **Give the auto-fire five real discovery methods.** Stormcaller is the template: instead of auto-logging rain_dancer when dowsing in rain, make rain_dancer a deliberate action (dance in the rain = a button) and require dowsing + dancing as a real sequence. Same pattern for the rest: if both halves aren't player-chosen actions, it's not a discovery.
4. **Wrong-order feedback.** One line — "that felt backwards" — when the pair is used in the wrong sequence.
5. **One attempt per day for sequential/simultaneous** (or keep spamming but gate teases to one per day). Protect the pacing.
6. **Fix the rage lie** (`wasRaging` should mean actually raging) or redesign Undying Fury around deliberate rage activation + near-death.

## Verdict

The vision is sound and the two working synergies prove the loop is fun. But as shipped, the system is 17% puzzle, 42% participation trophy, 17% impossible, and 25% perverse-or-RNG. The writing deserves better machinery. Fix the hints, fix the impossible two, and make the auto-fire five earnable — then this becomes the discovery system Steve described.
