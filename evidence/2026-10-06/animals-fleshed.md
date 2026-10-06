# Animals fleshed — 2026-10-06

Worker: animals flesh-out (hunting mechanics, flee behaviors, butchering, audio hooks).
Scope: `src/data/animals.json` + animal blocks in `src/js/game.js` + `src/js/app.js` audio hooks. Did NOT touch `encounters.js`/`food.js` (other workers' files).

## What was already deep (verified, not changed)

A full probe of all 26 species (approach walk-up, 6 turns each, fixed seed) plus
played hunts (turkey, deer, opossum, rabbit, fox, bullfrog-on-creek) confirms the
loop is genuinely playable: spot → stalk → strike → carcass → clean → cook →
eat, with knowledge gating throughout ("if you don't know, it doesn't show").

Per-species approach behaviors (all working, in `encounters.js` animalTurn override):
- **cottontail_rabbit** (skittish): freezes → bolts at a shadow (aware 0.75) → zigzag bolt → winded chase
- **gray_squirrel** (arboreal): wary chatter → bolt → spirals up trunk if on a tree tile (gone) + chatter audio
- **white_tailed_deer** (wary): head-snap tell → white tail up, early bolt (aware 0.7) + snort audio
- **creek_chub** (aquatic): holds in current → dives to water when bolted; hiding state is unhittable ("wait it out")
- **wild_turkey** (flock): heads-jerk tell → flock explosion, may drop a lagging straggler
- **opossum** (plays_dead): flops on approach AND on strike; striking the "corpse" resolves the trick (25% wake-bite)
- **bullfrog** (aquatic_ambush): croak cuts off → dives on a real creek tile (verified on water-column grid)
- **box_turtle** (slow): walks, never bolts; free pickup
- **gray_fox** (cunning): freezes → jukes sideways → holds at range, taunting
- **crayfish** (aquatic_defensive): freezes claws-raised → pinch audio on grab
- **raccoon** (curious): watches, ambles closer, STEALS your lightest food and bolts
- **snapping_turtle** (aggressive): hisses/lunges, snaps for damage, NEVER flees
- **timber_rattlesnake** (defensive): rattle warning → strike + venom if pressed; never bolts
- **striped_skunk** (unbothered): sprays at dist≤1 (blinded, scent lasts days, notice range +2) → ambles off; never bolts
- **muskrat** (architect): dives early near water at aware 0.6; stays down (hiding)
- **wild_boar** (charger): pawing warning → CHARGES at you on approach or strike → winded after (catchable)
- **porcupine** (quilled): quill-rattle warning → barehanded grab lodges quills (damage + halved strike chance); never bolts
- **groundhog** (alarmed): whistle (woods on edge for the day) → 2-tile sprint to burrow, one edge turn = gone
- **canada_goose** (territorial): honk → ADVANCES on you; wing/beak damage at dist≤1; never bolts
- **woodcock** (camouflaged): notice range 1 → EXPLODES from under your boots
- **beaver** (sentinel): tail rises at aware 0.7 → CRACK tail-slap, dives, woods on edge
- **bobcat** (stalker): the hunt inverts — pads closer, chases if you run, melts away if you hold ground 3 turns, claws at dist≤1
- **armadillo** (armored): hunks (strike chance ×0.6), unhunks when you leave
- **crow** (sentinel_mob): cawing mob call at aware 0.5 → lifts to branch, woods on edge
- **bluegill** (bedding): guards bed, darts to center and hides when pressed — grabbable
- **rat_snake** (constrictor): freezes → may pour into brush before your strike lands; bite, no venom

Butchering (food.js, verified): carcass (inedible, kcalEach 0) → clean with knife
(30% yield messy / 40% known, 4 portions, raw disease risk, spoils ~2 days) →
materials (hide/bone/feather/antler/shell/quill/tusk per animals.json) →
cook needs fire → preserve needs fire + knowledge. Turkey 3000 kcal →
900 raw cleaned (messy) — the kill text's "about 3000 kcal" is the gross on the
bone; the clean math is honest about gutting loss. Deer 20000 → 6000/8000.
Energy weapons char meat (10%, no butchering). All sound.

Audio audit: all 21 fired `animal*` hooks resolve to deep multi-layer synths in
app.js (read animalBolt/Chatter/Flop/Kill/Butcher/Hiss/Snort/Rustle/Pant/Pinch/
Bite/Splash bodies) — no silent stubs, no generic single-blips. animals.json
has zero data holes (all 26 species carry behavior/behaviorDesc/fleeDifficulty/
huntText/killText/tell/butcher/knowledgeLevels 1–4/method/difficulty/emoji/
unknown/description).

## What was broken → what changed

1. **The Stalk verb fired no audio.** Every other beat in the hunt had a bespoke
   synth (bolt, snort, rustle, pant, flop…) but the player's own careful step —
   the core skill action — was silent.
   → Added `animalStalk()` synth (app.js): the quietest beat in the hunt, quiet
   BY DESIGN — two soft footfalls, a held breath, your heartbeat slightly too
   fast (the hunter's nerves), one leaf-shift that almost gives you away.
   Registered in `Game.audio`, documented in the HOOK CONTRACT, fired from BOTH
   Stalk dispatches (context-bar `doContextAction` + the tap-animal popup).

2. **Animal knowledge dead-ended at L2.** All 26 species ship knowledgeLevels[3]
   (uses) and [4] (mastery) text in animals.json, but no code path ever surfaced
   them — eating your tenth turkey taught you nothing new.
   → Extended the deepening chain in game.js `eatOne` (meat branch):
   parts at 3 tastings (existed) → **uses at 6** (knowledgeLevels[3] + nourished)
   → **mastery at 10** (knowledgeLevels[4] + nourished + +5 health every eat,
   stacking with parts' +5). Mirrors the plant system.

3. **Knowledge leak in the old L2 line.** It said the true species name
   unconditionally — eating gifted meat of a species you'd never identified
   taught you its name for free.
   → The whole deepening chain is now gated on `encAnimalKnown`. Tastings bank
   while unknown; the moment the name is learned, the banked tastings unlock
   everything at once ("your tongue knew — the name was the missing key").

## Playtest feel judgment (played as a player, node)

- Turkey naive walk-up: reacted (wary → bolt → winded), chase-able. Stalk play:
  misses cost kcal, awareness punishes the shot, winded prey is hittable. Kill →
  carcass → clean (6 feathers, 2 bones) → 4×225 kcal raw with 0.35 disease risk
  → cook honestly needs fire. Eating raw teaches kcal/portion.
- Deer: white-tail tell → early bolt, 4 strikes to run it down, 20000 kcal
  carcass → 2 hides, 4 bones, 2 antlers, 4×1500 raw.
- Opossum: flop on approach, strike-the-corpse, carcass. Rabbit: zigzag chase.
  Fox: juke + taunt. Bullfrog on creek: dive, gone.
- Stalk audio: can't hear it in node (no AudioContext), but the dispatch
  contract is tested (stubbed Game.audio receives the call; errors swallowed).
- Proof: `scripts/test-animals-hunt-20261006.js` — 22/22 pass. Before/after via
  `git show HEAD:` for both fixes + regression guards on approach behaviors.

## Remaining thin spots (out of scope — for the encounters worker)

- **box_turtle approach is completely silent**: the `slow` branch returns before
  the wary text, so its `tell` ("pulls its head in a fraction") never shows.
  One-line fix in encounters.js animalTurn.
- **game.js's animalTurn/checkAnimals/huntAnimal are dead code**, shadowed by
  the encounters.js overrides (encounters loads later). The @ontology header /
  docs may still claim game.js owns them.
