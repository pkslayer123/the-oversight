# Animals butchering deepening — 2026-10-06

Worker: animals deepening (encounters.js). Scope: `src/js/encounters.js` ONLY
(animals.json audited — no changes needed). Did NOT touch food.js/app.js/game.js.

## What changed (encounters.js)

1. **Kill-line yield honesty** (`encKillLine` + new `encButcherHonesty`).
   The kill used to promise the gross on the bone ("About 20000 kcal") with no
   word on what you actually eat. Now every kill appends a butcher-honesty
   footer: cleaned yield math (40% known / 30% learning, 4 raw portions),
   raw-disease gamble named (~1-in-3 sickens, fever by nightfall, logged as
   disease — matches food.js RISK.rawMeat), processing order
   (clean→knife, cook→fire, smoke→fire+know-how), carcass spoil clock (~2 days),
   and an honest-blind knife gate (no cutting tool → "knap a Stone knife
   (stone + vine, Craft in your pack) or this stays a carcass" — same
   hasCuttingTool() predicate cleanCarcass uses, so the line and the action
   can never disagree).

2. **animalPanic was silently dead — now resolves** (new `encAudio` + fallback
   map). The cornered-prey detonation fired `animalPanic` 4× but CombatAudio
   (app.js) has no such synth — Game.audioEvent silently no-ops on unmapped
   names, so the cornered scream was silence. encAudio keeps the hook-name
   contract (a real app.js animalPanic synth wins automatically when it ships)
   and until then composes the panic from registered freaks (bolt-thrash +
   brush-rustle, plus the bite-snap the cornered branch already fires).
   Zero silent hunt beats now — verified by registry audit in the proof test.

3. **Box turtle tell fixed** (thin spot from animals-fleshed.md): the `slow`
   branch returned before the wary text, so "pulls its head in a fraction"
   never showed. Now shown once on approach (honest perception, ungated).
   The turtle notices you too — it just doesn't care.

## animals.json audit (no changes)
All 26 species complete (behavior/behaviorDesc/fleeDifficulty/huntText/
killText/tell/butcher/knowledgeLevels 1–4/method/difficulty/emoji/unknown/
description). killTexts are gross-on-the-bone honest; butcher materials match
the killText promises (turkey 6 feathers/2 bones, deer 2 hides/4 bones/
2 antlers, porcupine 12 quills…). No data holes found.

## Playtest feel (played as a player, node — Part B of proof test)
Turkey arc: noisy walk-up → flock explodes → flutter/regroup rhythm
("Your window") → first bird melts into the treeline at the edge (flee
barrier working) → second bird run down → 5 strikes, 400 kcal, 10 turns →
kill line with the new honesty footer → messy blind clean (30%, 225×4 raw,
disease risk attached, "hack at it clumsily" + technique learned, 6 feathers
+ 2 bones) → cook over fire (disease risk drops) → smoke one portion
→ eat cooked (+638 kcal, no sickness). Haul has real weight (8.5 kg).
Fun: the chase reads like a real hunt; the honesty footer turns the gross
into an eating plan. Friction: the arc crosses three UI surfaces
(grid → pack clean → fire cook); the kill line now names all three.

## Second pass — disease law (Steve 2026-10-06, same run)

4. **Disease modeling sharpened to the disease law.** `animals.json` now
   carries a per-species `diseaseVector` (all 26, real-world: deer ticks →
   Lyme, boar → trichinella, rabbit/muskrat/groundhog → tularemia, raccoon →
   roundworm, armadillo → leprosy, bobcat → toxoplasma, reptiles → salmonella,
   crayfish → lung fluke, fox/skunk → rabies vector...). The kill-line footer
   names the vector **knowledge-gated** (unknown animal → generic "raw is a
   gamble"; known → the specific vector), and names treatment honestly:
   "Herbal Remedy cures it (plant knowledge, once a day) — no remedy, no
   cure" (matches game.js: herbal_remedy, sick-only, once/day).
   Deliberate boundary: multi-stat degradation ("not just HP") and distinct
   lethal conditions are food.js/game.js systems — off-limits here. The kill
   line claims only what the code does today (fever by nightfall, logged as
   disease); the full degradation pass needs the owner of those files.

## Proof
`scripts/test-animals-butcher-20261006.js` — 60/60 pass (Part A seeded
audio/kill-line/data audits + Part B played arc, real randomness).
Ontology validator: 35 systems validated, release permitted.

## Deliberately left undone
- app.js has no real `animalPanic` synth yet — the fallback (bolt+rustle)
  reads fine, but a dedicated freaky synth belongs to whoever touches app.js.
- game.js's animalTurn/checkAnimals/huntAnimal are dead code shadowed by the
  encounters.js overrides (noted in animals-fleshed.md) — game.js is
  off-limits for this worker; the ontology header/docs may still claim
  game.js owns them.
- Disease severity (RISK.rawMeat p=0.35/dmg=12, HP-only + disease log) is
  food.js/game.js territory — the kill line is honest about what the code
  does today; the new disease design law (feared, degrading) needs a
  cross-file pass by someone who owns those files.
- NOTE: running `node scripts/validate-ontology.js` regenerated
  docs/ONTOLOGY.md in the worktree (adds the new encounters provides line).
  That file was already dirty from a sibling — left uncommitted, not mine.
