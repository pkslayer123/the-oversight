# RNG vs Real audit — 2026-10-08

Steve's question: "Where else do we just assign RNG to where we need to be treating each day, encounter and individual as real?"

Read-only sweep of `src/js`. Not re-auditing `resolveWildMonsterEncounter` (real-fights worker is replacing it) or the tent encounter (already corrected).

Legend: **SUSPECT** = RNG resolves an outcome that should be a real process. **LEGIT** = RNG hides world state the player genuinely can't see (what's in the bush, whether a traveler passed through) — that's fog of war, not a cheat.

---

## HIGH — fix these next

### 1. Expedition monster encounters are the dice table Steve already killed — `src/js/villager-agency.js:286-341` (expeditionMonster)

This is the same bug class as `resolveWildMonsterEncounter`, in a *separate* function the real-fights worker may not touch. A villager on expedition meets a monster and the code does:

```js
var r = R();
var deathP = dist >= 2 ? 0.006 * Math.min(3, dist / 2) : 0;
var hurtP = 0.04 + dist * 0.006;
if (r < deathP) return this.expedDeath(vid, mName, nm, playerAtHaven);
if (r < deathP + hurtP) return this.expedHurt(vid, mName, nm);
var evade = 0.55 + Math.min(0.25, brave * 0.03) + (st.potential[vid] ? 0.08 : 0);
var r2 = R();
if (r2 < evade) { /* "saw it, gave it room, lived" */ }
if (wave <= 1 && r2 < evade + (1 - evade) * 0.5) { /* "fought and killed something small. A real deed." */ }
```

A monster is picked from the wave pool but **only `m.wave` is ever read** — its HP, attack, and behaviors never enter the resolution. Flat death chance per leg, flat hurt chance, flat evade, flat kill. A villager can "kill" anything wave-1 on a roll. **SUSPECT.** The real process: route through the same blow-by-blow fight resolver being built now — real villager stats vs the monster's real attacks — and spawn a real monster entity at the villager's node rather than narrating one into existence.

### 2. Contest outcomes are a coin flip — `src/js/contests.js:3174,3185` (resolveContest)

Each participant: `if (dieBase > 0 && Math.random() < dieBase)` (flat death chance by risk tier: low 0 / medium 3% / high 10% / extreme 20%), else `const won = Math.random() < winOdds` (winBase 70/55/40/25% + cheer + alien mods). Contestant strength, skills, bravery, and the contest's own category (Blood, Endurance, Moot, Weird, Puzzle, Detective, Forage, Chance) never enter it. The code admits it: `"Simplified for now: contest fires, participant chosen, outcome rolled. Full arena combat comes later."` (contests.js:364-365). The biggest televised event in the game — the thing villagers fear — and a strong villager has the same odds as a weak one. **SUSPECT.** The real process: each contest category tests the stats it names; Moot tests social stats, Blood tests combat, Forage tests foraging knowledge. Cheer/alien interference bends it, not replaces it.

### 3. Contest casting ignores notability — `src/js/contests.js:378-390` (fireContest)

After the player, additional contestants are picked **uniform random** from eligible: `picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])`. `contestEligible()` computes per-person notability notes ("slew a wave-2 beast", "won a contest") — and then selection ignores them. The System is written as ratings-obsessed ("the System finds this hilarious"), and it casts nobodies at random. **SUSPECT.** The real process: the System wants who the audience wants — weight picks by notability, with the 10% "whim" override kept as its caprice.

---

## MEDIUM — felt, worth fixing after HIGH

### 4. Contest scheduling is a daily dice roll — `src/js/contests.js:181` (contestTick)

`if (Math.random() > 0.3) return null;` — 30% per day, capped 2/week. The show's schedule doesn't respond to anything: not ratings, not notability events, not village drama. A scandal should summon the cameras; a quiet week should bore them. **SUSPECT.** The real process: schedule driven by world state (a deed spikes ratings → the System comes calling).

### 5. Weather has no memory — `src/js/game.js:18118` (endDay)

```js
const wr = Math.random();
this.state.weather = wr < 0.7 ? 'clear' : wr < 0.9 ? 'rain' : 'cold';
```

Flat 70/20/10 every dawn. Rain never comes in fronts, cold never lingers, seasons don't exist. Weather drives real mechanics (rain_dancer water, cold_blooded food budgeting, expedition danger assessment). **SUSPECT.** The real process: fronts with persistence (rain follows rain), seasonal drift. Hidden-state generation is fine; a memoryless sky isn't.

### 6. Villager disease contraction is a flat daily roll — `src/js/game.js:18026-18033` (villageSicknessTick)

Exposure gating is real (hp<40 wounds, no clean water, forager/explorer profile) but contraction is `Math.random() < 0.15 / 0.10 / 0.03` per villager per day. Drinking dirty water for a week is no worse than one bad day; one wound is the same as ten. **SUSPECT.** The real process: dose accumulation — track days of exposure, wounds count — with contraction rising as exposure mounts. (Player's own vectors are event-driven per-bite; the villager model should accumulate the same way.)

### 7. Alien loot drops don't measure the violence — `src/js/game.js:25812` (rollAlienLoot)

`if (Math.random() >= loot.chance) return null;` — flat per-kill chance, tier gated by difficulty (real). But the code's own fiction says "The System leaves confused gifts for **impressive violence**" — and nothing about the fight (rounds, damage taken, style) enters the roll. A flawless kill and a near-death brawl pay the same. **SUSPECT.** Borderline: alien caprice is legit RNG, but the stated trigger is measurable. The real process: weight the drop by fight impressiveness (damage taken, rounds, underdog factor), keep the tier gates.

### 8. Show casting is random — `src/js/contests.js:346` (fireShow)

`if (roster.length && Math.random() < 0.7) { pulled = roster[Math.floor(Math.random() * roster.length)]; }` — "picks a villager for a silly reason." Same notability-blindness as #3, smaller stakes (it's a silly pull-away, not a blood contest). **SUSPECT.** The real process: same fix as #3 — notability-weighted, silly reasons attached to real traits.

---

## MEDIUM-LOW — defensible today, real-process would be better

### 9. Cache theft has no discoverer — `src/js/storage.js:492` (dailyCacheCheck)

One theft roll per cache per day, distance-gated (`cacheTheftChance`), culprit drawn from the nearest village's real roster. The distance model and the culprit are real; the *discovery* is a roll — nobody actually walked near the cache. **SUSPECT-leaning.** A real process would be villager expeditions/foragers passing near the node noticing disturbed earth. Tolerable: discovery-by-stumbling is genuinely stochastic.

### 10. Traps roll the "stepped in it" moment — `src/js/game.js:2536` (checkTraps)

40%/day roll — but only species *actually present on the tile* (simEcology populations), each catch depletes the population, empty woods say so honestly. The ecology coupling is real; the daily roll stands in for prey movement through the tile while you sleep. **SUSPECT-leaning.** A real process would move prey across tiles off-screen. Expensive; the current version is honest about what's there.

### 11. Betrayal re-check bypasses the score model — `src/js/party.js:429` (reevaluateBetrayal)

`if (!bs.intent && pantryLow && Math.random() < 0.15)` — flat 15% per companion per check when the pantry is low. The main betrayal model is a rich score (hunger, fear, dark traits — trust deliberately excluded). This re-check is a flat roll that ignores it. **SUSPECT.** The real process: feed desperation into the existing score, not around it.

---

## LEGIT — leave alone

- **Forage** (`src/js/engine/forage.js`): biome table is hidden world state; targeted forage returns what's actually there; knowledge gates names. Fog of war done right.
- **Prey spawns** (`src/js/encounters.js:987`): 30% awareness roll, but animals come from the tile's real ecology population and then behave for real (graze → wary → bolt → winded).
- **Player wild monster spawns** (`src/js/game.js:13790`): tile-entry roll with pity system and wave-gated pool — then a *real world monster* with stances, line of sight, and hunting behavior exists in the grid. The roll answers "is something in these woods"; the monster is real after.
- **Gossip distortion** (`src/js/game.js:9851`): 45% mutation after 2+ retellings along real social lines. Distortion *is* noise — the process is the retelling chain.
- **Confrontation/confession** (`src/js/truth.js:989,1105`): rolls weighted by motive, temperament, trust, evidence count, prior deflections. The weights are the model; the roll is the unknowable part of a person's choice.
- **Trial wild day** (`src/js/betrayal.js:1240`): 10% flat "the village woke up wrong" — explicitly Steve-approved ("this is the gamble Steve wants").
- **Care packages** (`src/js/alienPlayers.js:1010`): 25% daily check, favor ≥ 20 gated, max 1/4 days, quality scales with favor. Alien fans are capricious by design.
- **Combat resists / fear fizzle** (`src/js/statusEffects.js:118,305`): in-fight noise on real mechanics. Fine.
- **posthumousReveal** (`src/js/codex-people.js:255`): 35% to find the hidden note — on a real body, gated by trust/witness/party. Searching is the process.
- **justicePickConfronter** (`src/js/justice.js:201`): `s += Math.random()` is a tiebreak on a real score (temperament, leadership goal). Fine.
- **Villager food-poisoning contraction** (`src/js/game.js:17852+`): exposure is what's actually in the pot; per-person chance mirrors the player's per-bite model. Parity, not a cheat.
- **Expedition encounter *type* roll** (`src/js/villager-agency.js:277-282`): what's out there (monster/cach
...[truncated 1189 chars]
