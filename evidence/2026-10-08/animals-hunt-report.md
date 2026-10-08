# Animals audit — hunting / flee / butchering / audio (2026-10-08)

Worker: animals-hunt worktree. Scope: `src/data/animals.json` ONLY (no js edits).
Proof: `scripts/test-animals-hunt-20261008.js` — seeded (mulberry32, default 20261008, SEED override), full production module list in index.html order, green on 4 seeds (20261008: 29/29, 7: 30/30, 99: 26/26, 1234: 30/30).

## Per-system verdicts

**Hunting flow (stalk → detect → kill → corpse → butcher → yield): WORKS, feels tense.**
Played end-to-end as a player: stalk closes distance with awareness feedback, wrong-tool honesty ("a snare or running it down would work better — your spear is a compromise"), strike → kill → carcass → 8-tick butcher → 4 portions + materials. A winded rabbit at spear range (dist 2, out of teeth reach) is the earned kill; striking at dist 1 costs you a bite ("Wild things have teeth") that can wreck the shot — the game teaches spacing. Rabbit: 800 cal → ~60 kcal × 4 raw portions (30% blind). Meaningful, not trivial, against the 2000 kcal/day target. Deer-class hauls (20k–60k) remain village events.

**Flee behaviors: trigger correctly, species-distinct.**
Miss → bolt with species chase lines (rabbit zigzag "never the same hop twice", groundhog low sprint for the burrow, deer white-tail burst). Whistle (groundhog, animalWhistle), corner-panic detonation (animalPanic, HP damage, shove-past-you), winded → catchable. Got fled-from honestly on seed 99 (rabbit cornered → panicked → broke through → gone).

**Butchering yields: FIXED gaps, economy sane.**
9 animals had no `butcher` at all (roadrunner, gila monster, spotted owl, nutria, cottonmouth, pronghorn, prairie dog, snowshoe hare, florida panther) → added yields consistent with sister entries (birds→feather, cats→hide+bone, etc.). Great horned owl's `"feathers": 2` (plural) never matched the schema/food.js `feather` key → fixed to `"feather"`. Venomous cal-0 animals (gila, cottonmouth) butcher to hide only — honest: not food, still useful. Removed black bear's `"fat": 3` (see judgment calls).

**Audio hooks: all wired, none silent.**
Verified fired in-harness: animalStalk (app.js Stalk dispatch), animalBolt, animalKill, animalButcher, animalPanic (real 4-layer synth in app.js wins over the bolt+rustle fallback), animalWhistle, animalPant, animalBite, animalSnort. Cornered-prey detonation is never silent.

**Knowledge gating: intact.**
Flee text vivid-vs-plain via encAnimalKnown; diseaseVector (now on all 48) shows only once the animal is known.

## What I changed (data only)

1. **Added `butcher`** to the 9 animals missing it (values above).
2. **Added `diseaseVector`** to all 15 animals missing it (incl. burmese_python, caught by the proof).
3. **Removed `'avoid'` from 7 `method` arrays** (gila_monster, cottonmouth → `[]`; bear/moose/panther → `["bow"]`; alligator/python → `["trap"]`). It was never a real method — js fell through to `return true` and leaked into the UI as "a bow or avoid would work better." The "don't hunt this" intent lives in huntText/killText ("You don't eat gila monsters. Leave it be.").
4. **Fixed owl `"feathers"` → `"feather"`** (was yielding generically-named items).
5. **Removed bear `"fat": 3`** — yielded 0-kcal inert "fat" items with no recipe or rendering path anywhere in data or js, contradicting nothing but promising "liquid gold."

## Feel judgment

Hunting is tense and rewarding, not tedious: the stalk→aware→bolt→chase→winded arc reads clearly, every hot beat narrates, species behave distinctly, and the bite/fumble price keeps even a spent rabbit dangerous. Butchering is quick and honest. Two soft spots (js-side, reported not fixed): a chase can run long against zigzaggers, and winded turns go silent if you don't strike immediately.

## JS gaps found — NOT fixed (no js edits allowed), reported with repro

1. **`fleeDifficulty` is dead data.** Present on all 48 animals, read by zero js. Repro: `grep -rn fleeDifficulty src/js/` → no hits. Presumably meant to drive flee odds; currently cosmetic.
2. **No knownCue coaching for 12 behaviors.** `encAnimalCue` CUES lacks: unpredictable, ambush, cautious, still, patient, social, stealthy, semiaquatic, aerial, wading, burrowing, pack → 14 animals (bison, moose, python, both owls, bear, alligator, prairie dog, panther, mink, bat, heron, chipmunk, coyote) get no Highbeam-Deer-style "you know this one's trick" coaching. Repro: `Game.encAnimalCue('bison')` → null.
3. **No chase LINES for `still` / `stealthy`** (spotted owl, florida panther) → generic fallback on flee. Repro: spook a panther, read the flee line.
4. **`slow` fiction mismatch.** huntText says "It doesn't flee," animalTurn's slow branch never bolts — but the strike-miss generic reaction prints "…bolts." Repro: strike a gila monster, miss, read "Something orange and black moving very slowly through the rocks bolts."
5. **Winded turns are silent** (`encounters.js:1557`, `return; // spent. your move.`). Winded never recovers; if the player walks instead of striking, beats are dead air. Repro: wind a groundhog, walk 6 beats without striking.
6. **Bison `"horn": 2` is off-schema** (schema allows hide/bone/antler/feather/shell/tusk/quill) but runtime-safe (generic material naming); left in place, proof warns.

## Judgment calls for Steve to overrule

- Bear fat removal (above): the killText still says "Render the fat FIRST (it's liquid gold)" — advisory real-world knowledge, no longer a butcher yield. If you want fat as a real mechanic, that's a js feature (render-fat), not data.
- `'avoid'` removal: the caution fiction is preserved in text; the method field now only names real methods.
