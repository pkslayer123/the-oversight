# Forager→Pantry feel playtest — evidence notes (2026-10-07)

Runner: flesh-out loop worker. Script: `scripts/play-feel-20261007-forager-pantry.js` at HEAD (ffba5a1).
Engine: pristine HEAD extract `/tmp/headjs` (`git archive HEAD src`). Seeded RNG (mulberry32).

## Run results

The committed script could NOT run as-is: its loader evals only 19 modules, missing
`statusEffects.js` (and ~20 other production modules). ACT 5 crashed with
`TypeError: this.seTickFighter is not a function` when a monster encounter fired
during a walk (tbMonsterTurn → tbAdvance). Repaired in a /tmp copy ONLY (committed
script untouched): full index.html module order, `window`+`document` stubs for the
load phase (deleted before play). Also repointed the fetch stub at the HEAD extract
so data JSONs come from HEAD, not the worktree.

- Seed 20261007: **15/15 checks pass, exit 0**
- Seed 777: **15/15 checks pass, exit 0**

## Verdict: PASS (with script caveats below)

The knowledge→haul→pantry loop is playable and genuinely enjoyable as a player:

- **Blind forage stays honest.** "Unfamiliar unknown berries — into the bag. (Unknowns
  lump together; sort them at camp.)" / "This tree you don't recognize, healthy.
  There might be nuts, but you're not sure what kind of tree this is." No free
  knowledge, no true names leaked. Pack-full is honest AND helpful: "Your pack is
  full. Eat something, test a lump from your pack, or leave some for the woods."
- **Haul home closes the loop.** Travel-home unloads surplus to the pantry (keeping a
  2000 kcal day's food for the player — the old vacuum bug is fixed), stages
  unprocessed hauls on the kitchen counter with spoilage clocks ("2 unprocessed
  hauls onto the counter — the clock is ticking."), and the pooling explanation
  fires once. The prep stash has real UI in app.js (kitchen counter panel).
- **Pantry fills, caps, feeds.** Village starts with a seeded 47,250 kcal stockpile
  (cap 120,000) — the village feels alive before you contribute. Donations added
  ~1,600 kcal; over-cap donation refused honestly ("The pantry is full (120,000 kcal
  cap). Expand storage to take more."). Haven dawn meal drew 4,050 kcal; player share
  is trust-scaled (1000/2000/2200) and perishable-first. Announced, never silent.
- **Processing feels like learning, not chores.** shellNuts: "You crack and pick 1 lot
  of nuts. Shells everywhere — the net is less than the gross looked." cookFood on
  cleaned meat: "A bit burnt in spots — but edible. You'll do better next time.
  ★ Learned: cooking." Technique learning via trial is a lovely touch.
  testCautiously: excellent staged flavor text (inspect → skin → lips → taste → meal).
- **Wild camp is honest.** "You camp wild tonight — no pantry meal. Eat from your
  pack." Overnight burn is announced ("Overnight your body burned 2200 kcal just
  staying alive.") and the starvation spiral warns before it bites. The village
  still eats while you're out (intended — pantry is physical, your meal is too).
- **No silent taps.** Re-tapped dirt ("Bare dirt. Nothing growing here."), swept
  dirt ("Worked earth. This patch is picked clean — it'll recover in a few days."),
  grass ("Just grass. Forage where it's green.") — all speak.

## Bugs found

1. **Script false positive — `Game.ident` does not exist.** ACT 2's "identifying flips
   unknown hauls toward food" check passed 2→0, but the ident loop is a no-op
   (try/catch swallows the missing API) and `Game.refreshItemNames && null;` is a
   literal no-op. What actually moved the lumps was **travel-home staging them onto
   the prep stash** — the check proves the wrong mechanism. The real teaching path
   (fireside teaching on return: 50% chance, villager trust>30) was never exercised.
   No UI calls `Game.ident` (grepped all src) — it's purely the script's invention.
   Repro: run ACT 2 with prep-stash inspection; `typeof Game.ident === 'undefined'`.
2. **Vacuous wild-camp check.** `check('wild camp: no player meal share from pantry',
   s.kcal <= 2000 + 1)` passes trivially: the basal burn (2200, ACTIVE_DAY) consumed
   the topped-up 2000 → kcal=0. The script never verified the interesting thing —
   that the player was told to eat from pack (which the engine DID do).
3. **eatOne on in-shell nuts is honest but doesn't teach.** "Nothing edible there."
   names no solution. The knowledge dimension should hint: "Still in the shell —
   crack them first (shell nuts)." Same class for raw needs-cooking items eaten raw
   (they do warn via diseaseRisk/prep text, nuts get nothing). Low severity.

## Design mismatches (text vs engine)

- Script header promises "identifying later flips hauls into food (refreshItemNames)"
  but the engine's actual return-home flow is: finished food → pantry (surplus),
  unprocessed → prep stash counter, teaching → fireside (RNG-gated). `refreshItemNames`
  exists and works (probed: unknown → named, ready/in_shell, kcal revealed, honest
  say line) but is only reached via teaching paths the script never triggered.
- The eatOne "You don't know what it is, but you know it's edible now" line is
  knowledge-law careful (uses descriptor-safe wording), but line 15237 announces
  `You eat the ${it.name}` with the raw item name unconditionally. Injected test
  items carried true names unearned (my probe artifact), so not a confirmed live
  leak — real forage lumps and hunt meat are named honestly. Not filed as a leak;
  worth a glance if gifted/strange items ever carry true names pre-knowledge.
- `roster: undefined` in script output is a script artifact (scholar has no `name`
  field; UI resolves via villagerId → getPerson), not a game bug.

## Backlog for the engine/test owner

1. **Fix the script's ACT 2**: replace the no-op `Game.ident` loop with the real
   teaching path; assert lumps land on the prep stash (with spoilage clocks) and
   that a teaching moment (or its absence) is reported. The current check is a
   false positive and should not be trusted.
2. **Strengthen the wild-camp check**: assert the "camp wild" line names the pack as
   the food source AND consider surfacing pack kcal in the line itself ("Eat from
   your pack (X kcal on hand)") so the required action is actionable, not just honest.
3. **Fireside teaching is 50% RNG-gated** (trust>30 + coin flip). Consider guaranteeing
   the FIRST return carrying unknowns teaches something, so the core
   knowledge→haul→identify loop always demonstrates itself to a new player.
4. **Commit-script loader hygiene**: the eval list in this and sibling playtest
   scripts drifts from index.html. Consider a shared `scripts/harness-loader.js`
   that reads the production script order (minus DOM-only) so future feel scripts
   don't crash on missing modules mid-run.
