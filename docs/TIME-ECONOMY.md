# Time Economy: The Action Clock

How the world moves when you do. All tunables live in `Game.TIME` (src/js/game.js).

## The model: one clock

There is **one clock**. Every thing you do moves it forward. No separate
clocks, no free actions, no way to pace between two tiles forever without
time passing.

- **1 tick** ≈ a moment: a step, a glance, a sip, a bite, a handoff.
- **32 ticks = 1 chunk** ≈ half an hour of sustained work.
- `TICKS_PER_BATCH = 32` — every 32 ticks, NPCs take a **batch turn** (they act:
  wander at their own speed, pursue initiative, wants grow).
- `TICKS_PER_PART = 128` — every 128 ticks the **day-part turns** (needs tick,
  assignments resolve, −5 energy, photosynthesis, wanderer moves).
- `TICKS_PER_DAY = 512` — the day has a **fixed budget**. When it's used,
  the day advances (`endDay()`).
- `TRAVEL_TICKS = 32` — node travel is a "bigger tick" on the same clock.

The part structure (dawn/midday/dusk/night) **derives from ticks** — it is not
a separate currency. `tickAction(n)` is the single choke point; `advancePart()`
is called only from its boundary crossings. Turn-based combat has its own
strict turns and suppresses the clock (`tbfight`).

The day's budget is visible in the UI: a thin bar under the day header shows
ticks remaining.

## Three separate costs

Every action is priced in up to three currencies:

1. **Time (ticks).** Everything takes time. Brief UI-only moments (check pack,
   browse codex, open/close panels) are free — they cost nothing because they
   accomplish nothing in the world.
2. **Metabolic calories (background burn).** Just being alive costs ~2200
   kcal/day, deducted in `endDay()` via `S.calories.resolveDay`. This is the
   body idling, separate from anything you do.
3. **Effort calories (exertion).** Physical work costs extra, on top of time.

### The matrix

| Action | Ticks | Effort | Why |
|---|---|---|---|
| Check pack / codex (UI) | 0 | 0 | Accomplishes nothing; free |
| Step (`microMove`) | 1 | 0 | Strolling is time-only |
| Examine a tile (`cellInteract`) | 1 | 0 | A glance is time-only |
| Drink / eat / handoff (`giveFood`) | 1 | 0 | Moments, not labor |
| Open a conversation (`startConvo`) | 1 | 10 kcal | Small talk is quick and cheap |
| Deep conversational beat (`ask:`, `theorize`, `ans:`, …) | +1 | 0 | Real exchanges take a real moment |
| Small talk (`agree`, `joke`, `silence`) | 0 | 0 | You're already standing there |
| Teach in conversation | 3 total | 0 | A real lesson takes real time |
| Confront a doubt | 1 | 0 | A hard question takes a moment |
| Social verbs (deal, comfort, …) | 2 | 0–varies | Substantive social moves |
| Read a book | 2 | 0 | Time-only — minds, not muscles |
| Activate an ability | 2 | varies | Focus takes a moment; powers have their own prices |
| Delegate a task (`assignTask`) | 2 | 0 | A social move; they're engaged |
| Teach (`teachPlant`) | 3 | 0 | A real lesson takes real time |
| Fill a water bottle | 1 | 0 | Quick |
| Committed walk (`movePath`) | 1/square | 10 kcal/sq | Purposeful walking is work |
| Clear brush / clear blockage | 32 (1 chunk) | 40–60 kcal | Light labor |
| Boil water (`treat`) | 32 (1 chunk) | 50 kcal | Half an hour, a fire, effort |
| Craft a tool | 32 (1 chunk) | 0 | Hand work, not heavy labor |
| Cook a meal | 32 (1 chunk) | 0 | Tending the fire |
| Node travel (`travelTo`) | 32 (1 chunk) | 30 kcal × distance | The "bigger tick" |
| Forage | 32–64 (1–2 chunks) | 120 kcal | Rich tiles take longer — more to gather. Snappy, not a time-skip |
| Fell a tree (`cutTree`) | 96 (3 chunks) | 80 kcal | Felling a tree is serious work |
| Build a bridge | 96 (3 chunks) | 60 kcal | Construction is work |
| Search a ruin (scavenge) | 64 (2 chunks) | 100 kcal | Tossing a house takes time |
| Rest | 96 (3 chunks) | 40 kcal | Real rest takes real time |
| Wait | to next part boundary | 0 | Skipping time *is* spending time |
| `time_skip` (ability) | 128 (full part) | — | You skip; the world doesn't |

Abilities use the same three-cost model: activation time (usually 2 ticks),
effort kcal where fictionally physical, and **metabolic upkeep** for passives
(`metabolicDaily()` — power is a trade, not a tax; 25–300 kcal/day per gift).

## Engagement: no fleeing mid-conversation

`village.engaged[vid] = batches` marks an NPC as in conversation. Set when you
start talking (`startConvo`, 2 batches), when you teach (2), via any social
verb (`socialTick`, 2), and when an NPC initiates contact with you
(`villagerInitiative`'s `done()`, 2). `npcBatchTurn` skips engaged NPCs when
wandering, and engagement decrements once per batch. People you're talking
with stay put; the moment lapses naturally if you walk away.

## Exploit audit (2026-10-04)

Every action was checked for spam-for-free-benefit:

- **Talk/social spam:** 1 tick + 10 kcal to open; +1 tick per deep beat;
  small talk free. A full 6-exchange deep conversation runs ~5 ticks +
  10 kcal — affordable. Trust caps at 40 via talk alone; rep gains are
  one-shot or diminishing; promises create obligations. Talking to 10
  people/day is legitimate play, not an exploit.
- **Drink/eat:** hydration and kcal-target caps; no benefit past full.
- **Examine spam:** secrets are one-time reveals; re-examining is just 1 tick.
- **Give food:** the food itself is the cost; trust is capped.
- **Pacing between tiles:** now costs 1 tick/step — 512 paces spends the whole
  day, and each 32-tick batch makes NPCs hungrier. The degenerate case the
  clock was built for is closed.
- **Wait:** advances time for zero benefit — self-punishing by design.
- **Forage/chop:** tile stock and tree counts are the limiters, not just time.
- **Rest:** 96 ticks + 40 kcal for +30 energy (capped 100) — a real tradeoff.
- **Blood magic:** −HP for +500 kcal; HP is finite. Self-limiting.
- **UI-only actions** (pack, codex): free, and accomplish nothing — nothing to farm.

The governing rule: **cost ∝ fictional weight × benefit**. Time is the
universal brake (512 ticks/day is a hard budget); effort kcal is the physical
brake; caps and depletion are the systemic brakes.

## NPC speed is a real stat

`npcSpeed(vid)` returns 0.5–1.5 relative to your 1.0:
- Age: <30 → +0.2, >55 → −0.25, >45 → −0.1
- Temperament: bold/intense → +0.15, cautious/withdrawn → −0.15
- (See `npcSpeed` in game.js for the full table.)

Faster NPCs wander more squares per batch. You can SEE who's fast.

## Tuning notes

- If small actions feel too "expensive," the knob is individual tick costs,
  not the clock — the clock is structural.
- If big actions feel off, adjust chunks (32-tick units), keeping the
  2–3 chunk band for forage/chop.
- `TICKS_PER_DAY = 512` with 4 derived parts preserves the playtested
  day structure while making every moment cost something.
- Sims: `node scripts/simulate.js [runs] [policy]`; clock unit tests:
  `node scripts/test-action-clock.js`.
