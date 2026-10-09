# Bear Rework — build evidence (2026-10-09)

Steve's six design corrections + three follow-ups, built in worktree `bear-rework`.
Commit: (see safe-commit hash in report). **Not merged to master** — coordinator lands it.

## What changed (by Steve's direction)

1. **Fierce, honest bear fight** (`src/js/encounters.js`, `src/data/animals.json`)
   - Black bear is a real animal, not a monster — but a non-monster monster fight.
   - Method order now `["bow","spear",...]`: bow > spear > knife > bare hands, enforced in the maul.
   - New maul hook: striking a bear at distance ≤ 2 triggers a maul — 8–17 damage,
     halved when the hunter holds a spear (reach), kill-chance ×0.85 bow / ×0.6 spear / ×0.4 otherwise.
   - The bear never bolts on a miss — it advances and mauls. Fierce but fair.

2. **Meat chunking — no more 30k lump** (`src/js/food.js` cleanCarcass + specialist path, `encButcherHonesty`)
   - Portion law, engine-wide: portions cap at ~500 kcal (`units = round(net/500)`).
     A 30,000-kcal bear becomes ~24 honest portions, never one slab.
   - `encButcherHonesty` was hardcoding "× 4 raw portions" — fixed to compute real portions.

3. **Gutted the ungated reveals** (`src/data/animals.json`)
   - Bear killText: was "Render the fat FIRST (it's liquid gold). Cook all meat thoroughly..."
     Now: "About {kcal} kcal on the bone. A serious animal — this was a fight. Gut it fast."
   - Knowledge-gating law honored: "If you don't know, it doesn't show."

4. **Knowledge split** (animals.json knowledgeLevels, `encAnimalLevel`, vectorLevel gating)
   - L1 stays honest: "Black bear. Strong, smart, fast. Don't corner it."
   - Trichinosis, fat rendering, pemmican → L4 (earned via codex depth, books, teaching, or getting sick).
   - New rule: obscure zoonotic names (trichinosis, trichinella, tularemia, brucellosis,
     CWD, leptospirosis, lung fluke) gate at vectorLevel 4. Common ones
     (salmonella, rabies, ticks/Lyme, giardia, roundworm, plague) stay L1 — widely known names.
   - L4 masterTechnique grant in game.js; new book "Tallow & Keeping" teaches `render` + bear L4.
   - Blind render penalty softened 0.45 → 0.65 (matches other blind penalties); one attempt teaches.

5. **Fat rendering + pemmican** (`src/js/food.js`, `src/js/app.js`, books.json)
   - `renderFat()`: raw fat → rendered tallow over fire. 12 ticks, 0.90× known / 0.65× blind, 90-day shelf.
   - `makePemmican()` / `pemmicanSets()`: 2 preserved meat + 1 rendered fat + 2 berries → 3 bars
     (600 kcal each, 120-day shelf, 20 ticks). Gated on knowing `render`.
   - Wired into pack panel + fire actions. Render button on raw fat items.
   - **Known gap**: village stash (prepStash) has no render/pemmican actions yet — pack + fire covered.

6. **Preservation tiers are real** — longer road, better payoff.

## The ladder (exact numbers, known technique, per portion unless noted)

| Tier | kcal | Shelf | Time | Risk | Notes |
|---|---|---|---|---|---|
| Cleaned raw | 500 | 2 d | (butchering) | risky | disease risk, spoils fast |
| Cooked | ~708 | 5 d | 32 ticks | safe | real gain: 0.6→0.85 efficiency |
| Smoked | 475 (0.95×) | 30 d | **8 ticks** | safe | blind: 0.80×, 15 d |
| Rendered fat | 900/slab (0.90×) | 90 d | 12 ticks | safe | blind: 0.65×, teaches the craft |
| Pemmican | 1800/set (3×600) | **120 d** | 20 ticks | safe | ~93% kcal retention, portable |

Calorie audit (Steve 06:00): no processing path destroys calories senselessly.
Cook is a real gain; smoke costs 5% for 30 days; render costs 10% for 90 days;
pemmican keeps ~93% for 120 days. The player never feels stupid for cooking.
Smoking tuned 16→8 ticks per Steve's pacing note (06:03) — a spare-moment action,
not a commitment; "low and slow" copy replaced with quick game-pace language.

## Fat: animal-specific, not universal (Steve 06:02 reality check)

| Animal | Fat slabs | Basis |
|---|---|---|
| Black bear | 6 | huge subcutaneous fat layer, fall hyperphagia |
| Wild boar | 3 | pig-type, moderate fat |
| Javelina | 2 | small peccary, pig-type |
| Deer / elk / moose / bison | 0 | lean game — meat/bone/hide only |
| Rabbit / turkey / squirrel | 0 | lean — no separable fat |
| Raccoon | 0 | "in fall (small)" needs a season system that doesn't exist — not invented here |

## Sibling sweep (full pattern family)

**Pattern 1 — kcal lumps:** portion law is engine-wide (cleanCarcass + specialist path),
so deer/elk/moose/bison chunk identically. No other lumps found.

**Pattern 2 — killText/butcher knowledge dumps:**
- skunk: "The musk glands are the whole job: cut wide around them, never nick" → removed
  (the craft already lives at skunk L4 — the dump was redundant).
- javelina: "Cut out the musk gland FIRST (on the back) or the meat is ruined" → removed
  (already at javelina L2).
- bison: "butcher, dry, smoke, render" → "butcher, dry, smoke" (named a technique the player may not know; bison has no fat to render).

**Pattern 3 — deep knowledge too early (vectorLevel 4 gating):**
- tularemia ×7: cottontail_rabbit, muskrat, groundhog, north_american_beaver, nutria, snowshoe_hare, american_mink
- brucellosis ×2: bison, javelina
- CWD ×2: roosevelt_elk, moose
- lung fluke ×1: crayfish
- trichinella ×2: black_bear, wild_boar (bear done earlier, boar here)
- Left alone: toxoplasma/leprosy (widely known names, no technique leaked — naming ≠ teaching).

**Pattern 4 — fat not separated:** only the three pig/bear animals yield fat; everything else
meat/bone/hide. No universal-fat code path remains (`(by.fat || 0) > 0` gates it).

## Proof

`scripts/test-bear-rework-20261009.js` — full harness (mulberry32 seeded before eval,
full module list minus DOM-only + drama.js). **ALL GREEN × 3 seeds** (20261009, 7, 424242).
Covers: chunking (24×~500, max portion ≤550), fat specificity (bear 6 / boar 3 / javelina 2 /
deer 0 / rabbit 0), killText gutting, L1/L4 gating via encButcherHonesty, all 15 vector gates,
render blind/known math, pemmican recipe + gating + retention, ladder tiers, smoke 8-tick pacing,
bear method order + maul constants, render book.

`node scripts/validate-ontology.js` → "✓ All 50 systems validated. Release permitted."

## Known gaps / follow-ups for the coordinator

- Maul fight-feel needs a live playtest (unit test asserts data + hook presence only).
- Village stash (prepStash) lacks render/pemmican actions — pack + fire actions ship; stash wiring is a follow-up.
- Raccoon fall fat: skipped — no season system exists; don't invent one silently.
