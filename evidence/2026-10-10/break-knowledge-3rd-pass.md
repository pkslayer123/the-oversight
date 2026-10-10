# Break-it: knowledge system, depth pass 3 (2026-10-10)

Target: knowledge system (index 2). Canon read: docs/CANON.md, docs/TRUTH.md,
docs/DISEASES.md (diagnosis gating), docs/DESIGN.md knowledge sections. No
dedicated docs/KNOWLEDGE.md exists — the system lives in journal.js (plant
diary/levels), game.js (identifyPlant/teachPlant/grantKnowledge/wrongTeaching),
food.js (item naming), examine.js, perceive.js, codex-people.js.

Prior passes (4th/5th/6th/7th/r2 + this morning's displayName/prep-ladder pass)
had already hardened the displayName funnel, the plantCalledName believed-name
funnel, the prep ladder, taught[]/codex sync, and per-sweep harvest pacing.

## H1. HONESTY — believed-name: forage spoke the TRUE name for wrongAs plants (FIXED)

`wrongTeaching` sets `wrongAs` (the false label the player believes) at L1, but
the forage flow named everything with the data true name:

- `foodForageItem(plant, isKnown=true)` set `name: plant.name` (and the nut
  branch `plant.name + ' (in shell)'`) — every item foraged after being taught
  wrong carried the true name in the pack.
- Two pack summary say-lines (`packedBits` and the `knownBits` summary) printed
  `e.plant.name` — the true name — in the forage report.
- `splitLumpOut` (sort-at-camp flow) and the food.js `refreshItemNames` wrap's
  nut flip also used `p.name`.

Fix: all of them now use the believed name (`plantCalledName(pid)` — wrongAs
when set, true name when honestly known, descriptor when unknown). Proof: teach
wrong, forage the patch — 0/37 items true-named, all believed-named, pack line
clean (was 3 failures on HEAD).

## H2. HONESTY — the lie didn't rename existing stacks (FIXED)

Identify honestly at L1 (stacks get true names via refreshItemNames), then get
taught wrong: `wrongTeaching` set wrongAs but never renamed the pack — the
inventory kept showing the true name of a plant "you don't know." Fix:
`wrongTeaching` (taught-wrong branch) calls `refreshItemNames(pid)`, which now
resolves through `plantCalledName` — stacks take the false believed name.
(The contested branch, myLevel>=2, correctly renames nothing: you know better.)

## H3. HONESTY — the correction didn't rename stacks back (FIXED)

`resolveWrongName` cleared `wrongAs` but left inventory stacks showing the
false label (or a stale descriptor) after the Codex corrected itself. Fix: it
now calls `refreshItemNames(pid)` AFTER the deletes, so `plantCalledName`
resolves to the true name. (First attempt called it before the deletes and
renamed everything to the still-set false name — caught by the proof test.)

## H4. HONESTY — poison diary printed the true name (FIXED)

journal.js wrap 10 (eatOne poisoning/disease) wrote the diary entry with
`pname: p.name` — the true name. A wrongAs plant is L1, so this entry IS
reachable with a false label in play, and the diary is the player's hand.
Fix: uses `this._calledName(pid)` (same class as the r2 learnPart/
thickenKnowledge fixes). Sibling sweep: the other diary entries (tasting/
deeper/handling/mastery/sighting) were audited — all fire at points where
wrongAs is provably cleared (harvest L2 clears it in-beat, _grantPlant and
combineKnowledge call resolveWrongName first, learnPart is unreachable with
wrongAs set). `plantJournalEntry().name` was an unused-by-renderers true-name
footgun; switched to `_calledName` too.

## E1. EXPLOIT — knowledge-grant monotonicity (HELD)

`grantKnowledge` (plant/recipe), `learnSkill`, `_grantRecipe`: first grant
lands, 5 repeats refused, downgrades refused, levels hold. No duplication, no
farming. The one-dispatcher unification (Steve 2026-10-07) holds.

## E2. EXPLOIT — combineKnowledge jackpot farming (HELD)

20 consecutive `combineKnowledge` calls with a deeper village source: exactly
one grant, level capped at source depth, at most one `jackpot('insight')`.
One-shot per plant.

## S1. SOFTLOCK — L3 for medicinal (non-food-use) plants (HELD)

Medicinal plants (sassafras, yarrow, jewelweed, goldenrod, rare_herb) all carry
`caloriesPerUnit > 0`, so `eatOne` accepts them and tastings accrue — L3
reachable via the normal 3-tasting path. No stuck level.

## D1. DEAD CODE — tree/monster grant domains (HELD)

`grantKnowledge('tree'|'monster')` returns false; zero callers in src. The
morning pass's removal holds.

## H5. HONESTY — monster name gates post-System (DOCUMENTED, by design)

`monsterDisplayName` shows the true name post-System even for unencountered
monsters, while `monsterKnown` (canShow name gate: observed/slain) stays false.
This is the documented diegetic beat — the System labels everything, "it feels
invasive" — not a leak. The two gates diverge by design; noted, not changed.

## Sibling sweep (same bug class: believed-name vs true name)

Swept every `p.name`/`plant.name` say-line and item-naming site in the
forage/sort/eat flows for wrongAs reachability: harvest L2/L4 says (wrongAs
cleared in-beat before the say), traded/combined/_grantPlant says (all run
after resolveWrongName), identifyPlant/witness says (fresh L1, no wrongAs
possible), fireside listening (gated on !plantKnown; wrongTeaching never fires
there), fireside wrong-gossip branch (speaks the lie in quotes — the fiction).
All honest. No further fixes needed.

## Proof

`scripts/test-break-knowledge-20261010c.js` — 34 assertions, BEFORE=1 fails 8/34
(all four believed-name bugs), AFTER passes 34/34 on seeds 20261010, 11, 99.
Regressions: morning knowledge suite 28/28, r2 suite 40/40, gating suite green,
softlock suite green. Ontology: 57/57 validated. Node harness: full
src/js/*.js in index.html order (minus DOM-only), Math.random seeded pre-eval.

## Files

- `src/js/game.js` — refreshItemNames via plantCalledName; wrongTeaching +
  resolveWrongName rename stacks; two pack say-lines believed-named
- `src/js/food.js` — foodForageItem / splitLumpOut / refreshItemNames-wrap nut
  flip believed-named
- `src/js/journal.js` — poison diary _calledName; plantJournalEntry().name
  believed-named
- `scripts/test-break-knowledge-20261010c.js` — proof (8 fail on HEAD, 34/34
  green x3 seeds after)
