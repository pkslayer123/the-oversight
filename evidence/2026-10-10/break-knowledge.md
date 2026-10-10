# Break-it: knowledge system — 2026-10-10

Target: the knowledge system (index 2). Canon read first: docs/CANON.md, docs/CONVERSATIONS.md,
docs/PERCEPTION.md, plus DESIGN.md knowledge sections. No dedicated knowledge canon doc exists —
per the brief, no canon was invented; all fixes honor documented rules
("If you don't know, it doesn't show", canShow aspect map, per-item knowledge levels).

## Verdict: BROKE + FIXED (4 catch classes, 14 proof assertions)

Proof: `scripts/test-break-knowledge-20261010.js` — **14 FAIL on HEAD, 28/28 green after
(seeds 20261010/7/42)**. Prior suites still green: test-break-food-20261010 (16/16),
test-break-food-20261010b (19/19), test-break-knowledge-wrongwipe-20261008 (pass),
test-break-monsters-r2 (32/32). Ontology 52/52. Pre-existing failures unchanged
(lumped-unknowns 4, food-reality 6, perceive 2 — identical on pristine HEAD;
forager-loop is nondeterministic on HEAD too).

## K1. HONESTY — true-name leaks on food/sort/haven surfaces (FIXED)

Pre-System, villagers are stranger descriptors, not names — "Every user-facing
reference to a person goes through displayName()". Five surfaces printed TRUE names:

- `whoKnowsLump()` returned `{name: p.name}` → app.js rendered "Ask Dominic Kamara"
  (sort-bag knower button). Now `this.displayName(p.id)`.
- `sortBag()` narration used `person.name` ("Dominic Kamara spreads the bag…").
  Now `this.displayName(vid)`.
- `specialistsHere()` returned `{name: p.name}` → "Ask …" buttons for cook /
  preserver / butcher / builder. Now `this.displayName(p.id)`.
- `villageRoster()` (haven panel source) returned true names for all 12 villagers —
  the haven overview was true-scanning the whole village pre-System. Now gated
  (player keeps their own name — you know your own name).
- `villageEats` → `lastContrib` ("who's pulling weight") printed true first names.
  Now `this.displayName(rid)`.

Sibling sweep, same class: specialist narration printed **unearned occupations**
(`(${spec.occupation})` — "better hands (chef)" for a stranger). Occupation is
earned knowledge per the OCCUPATION GATE (Steve 2026-10-06). New `specOccLabel()`
helper funnels through `occupationLabel()`; applied to 6 sites (askSpecialist
refusal/clean/cook/smoke says, whoOptions butcher + cook/preserver details).

## K2. HONESTY — plantCalledName() was an unguarded footgun (FIXED)

`plantCalledName(pid)` returned `e.wrongAs || p.name` — the TRUE name with no
knowledge check. All 6 call sites happened to guard with `plantKnown`, but the
next caller would have leaked. Now: wrongAs wins (believed name), else descriptor
for unknown plants, true name only at L1+. Zero behavior change at current call
sites; future leaks structurally impossible.

## K3. HONESTY — preparation text granted at L1, bypassing the prep ladder (FIXED)

The codex L1 card withholds prep ("Prep: unknown — eat it or reach L2 to learn")
and kcal until the prepKnown track (first bite) or L2. But THREE item-construction
paths printed `p.preparation` (full processing knowledge) at identification:

- `foodForageItem(plant, isKnown=true)` — fresh forage of an L1 plant
- `splitLumpOut()` — the sort-bag split (runs BEFORE identifyPlant, so even
  pre-knowledge items were born with full prep)
- `refreshItemNames` wrapper flip + the game.js base (which also wrote prep
  unconditionally — would have undone the gate on every identify)

Fix: new `itemPrepFor(pid)` (food.js) returns the honest placeholder
("Identified — preparation unknown. Eat it or reach L2 to learn.") at L1, full
text once prepKnown/L2. New `refreshItemPrep(pid)` rewrites placeholder-prep
items when prepKnown is earned — wired at all three earning sites: first bite
(eat), 5-harvest L2, deep `_grantPlant` L2+. It only touches placeholder items
(cautious-test verdicts, cooking results left alone) and preserves must-cook
risk suffixes. Risk warnings ("Risky raw — cook it") stay visible — safety, not
prep mastery.

Deliberate non-change: L1 items remain edible with full kcalEach (the original
food-reality design: every identification source is a food context — sorting a
food bag, cautious testing, being taught). The `canShow('plant',·,'edibility')=L2`
aspect has ZERO callers — documented below as dead/aspirational; reconciling it
with the engine is a Steve-level design call, not a break-it fix.

## K4. DEAD CODE — grantKnowledge 'tree'/'monster' domains never wired (FIXED)

`grantKnowledge('tree'|…)` and `grantKnowledge('monster'|…)` had zero callers —
`_grantTree`/`_grantMonster` were fully-built but unreachable (the Alien Players
lesson). Tree knowledge actually flows through carexplore.js/game.js background
seeding; monster knowledge through ensureMonsterEntry + combat stage transitions.
Removed both branches and methods, tightened the domain doc. Dispatcher now
honestly refuses unknown domains (returns false).

## HELD (attacked, resisted)

- **Trade-knowledge flow**: counterfeit-currency guard (wrongly-known plants can't
  pay), one-shot-lesson (no re-charge at L3+), trader's-belief naming — all held.
- **Conversation teach**: L1+ filter, wrong-name honesty (teaches the believed
  name) — held.
- **askSystemAbout**: names via scientific name, explicitly never feeds — held.
- **Monster village-naming**: proposal → majority → villageName → refreshMeatNames;
  stages advance via combat (observed/slain) — no softlock found.
- **combineKnowledge**: requires L1; hint uses believed name — held.
- **kcal display gating** (`canShow('plant',·,'kcal')`) on pack/corpse/pantry — held.
- **Transfer paths** (pantry/cache/loot/take-back): prior food runs' full-field
  contract carries prep/edible/hiddenKcal — verified no knowledge-field laundering.
- **All knowledge modules loaded** in index.html (journal, codex-people, examine,
  perceive); testMonsterMeat/testCautiously/teachPlant all wired to UI.

## Noted tensions (not changed — Steve calls)

1. `canShow('plant',·,'edibility')` documents L2 but nothing enforces it; the
   engine grants edibility at L1 (original food-reality design). Reconciling =
   redesign of the L1→L2 loop.
2. Haven panel still shows villager HEALTH numbers pre-System ("no stats" in the
   strangers canon) — names fixed, stats left for a design call.
3. Death/gossip/combat narration uses true first names in places (game.js
   resolveWildMonsterEncounter etc.) — social/death system territory, flagged
   for the social break-it run, not changed here.

## Files

- `src/js/food.js` — name gates, occupation gates, prep ladder (itemPrepFor,
  refreshItemPrep, PREP_UNKNOWN, specOccLabel)
- `src/js/game.js` — villageRoster/lastContrib gates, plantCalledName hardening,
  refreshItemPrep wiring (3 sites), dead branch/method removal
- `scripts/test-break-knowledge-20261010.js` — 28 assertions, 14 fail on HEAD
