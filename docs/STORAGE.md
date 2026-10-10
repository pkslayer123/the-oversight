# Tools, Stashes & Caches

Steve's rules, made mechanical. Not a crafting game — the world making sense.

## Tool prerequisites

Actions hide when you lack the tool. No dead buttons; the context line teaches
("You need an axe to fell this.").

Tool tags live in `items.json` (`tool.woodcut`): tiers are
`fell > prune > brush > whittle > none`.

| Tier | Example | Can fell | Can prune | Notes |
|---|---|---|---|---|
| fell | hatchet (axe) | ✅ any tree | ✅ | the only felling tier |
| prune | hand saw (pruning saw) | ❌ | ✅ branches | limbs, not trunks — Steve's rule |
| brush | machete | ❌ | ❌ | fast brush clearing |
| whittle | stone knife | ❌ | ❌ | carving, not felling |
| none | bare hands | ❌ | ❌ | gather deadfall, slow |

- `Game.cutInfo(cell)` → `{canFell, canPrune, hint}` — the UI's single source.
- `Game.cutTree` is wrapped: no axe, no felling (2-tick "sizing it up").
- `Game.clearBrush` is overridden: machete 16 ticks / axe 24 / hands 64, +fiber.
- New: `pruneBranches` (32 ticks, +2–4 branches, tree lives),
  `gatherFallen` (16 ticks, +1 branch, no tool — the honest slow path).

## Materials

`branch` 0.5kg · `fiber` 0.1kg · `stone` 0.3kg · `wood` log 2.0kg.
`Game.addMaterial / materialCount / spendMaterial`. Foundation for future
crafting/matter-manipulation; deliberately shallow for now.

## Village stash (Haven)

Communal materials + spare tools + ledger. `state.village.stash`.

- Give = all you carry (one tap). Take = 5. Weight-checked.
- The ledger remembers every give/take with day + who.
- `villageTrustLevel()`: open ≥50 / wary ≥25 / closed. In open villages NPCs
  contribute; in closed ones the pile gets skimmed ("The count's off.
  Nobody saw anything.") and taking tools is noticed.
- Chronic net-takers (takes − gives < −20) lose trust, get observed as hoarding.

## Armory & pharmacy (Steve 2026-10-09)

Sections of the stash opened by filter: weapons → armory, medicine →
pharmacy. Deposit-gated: items become communal ONLY on deliberate deposit,
never automatically. The engine enforces the section filter (armory takes
weapons, pharmacy takes medicine — junk deposits refused honestly). Take-back
rule mirrors tools: re-taking your own un-returned deposit is noticed, −5
trust. (miser break-it 2026-10-09: the sections landed with a
deposit↔take-back +2 trust farm, measured +22 over 11 cycles; killed by the
same rule that guards the tool path.)
Deposit grants are net-gated (miser break-it 2026-10-10): the +2 fires only
when the donate raises that item's net above zero — taking someone else's
deposited item and "donating" it back minted +2/cycle forever (measured +10
over 5 cycles on all three sections); returning a borrowed item is not a
donation. Same rule for materials: band grants count only net increases
above zero — repaying a material debt restores, it doesn't earn.
Keepsakes are refused everywhere (miser break-it 2026-10-10): the stash
strips items to {itemId, name}, which would destroy a sentimental charge —
donateTool and the armory/pharmacy refuse them, and the UI hides the
Stash/Armory buttons for keepsakes.
Ash-honor (Steve 2026-10-09): bringing a phoenix victim's ashOf gear home
grants +8 as the line says — the ordinary +2 no longer stacks underneath.

## Personal caches

`buryCache('material'|'food', key, qty)` — 32 ticks, removes from inventory,
writes the location to `state.codex.places` ("Buried 4× Branch — at the creek
bend, day 3") and announces the Journal note. `digUpCache(id)` returns it
(weight-checked).

Buried ≠ safe: ~6%/day discovery by others while NPCs are about. A robbed
cache greets you with disturbed earth and an empty hole.

## Files

- `src/js/storage.js` — self-attaching module (wraps cutTree, overrides
  clearBrush, wraps npcBatchTurn). Load after truth.js.
- `src/data/items.json` — `tool` tags, branch/fiber/stone materials.
- `src/js/app.js` — tool-aware tree actions, Haven stash panel, caches inline
  view, inventory Stash buttons.
- `scripts/test-storage.js` — 59 tests.
- `scripts/test-miser-takefirst-20261010.js` — 24 adversarial checks (take-first
  trust farm on all three sections, material 0-band grant, keepsake donation
  refusal, ash-honor +8 honesty, bury/take/dig softlock + honesty regressions).
- `scripts/test-miser-attack-20261009.js` — 16 adversarial checks (armory/
  pharmacy trust farms, section-filter bypass, stale cache take).
- `scripts/test-miser-pharmacy-20261010.js` — 22 adversarial checks (pharmacy
  round-trip strips medType/doses → bricked medicine; dosed-medicine merge
  laundering in stacksMatch; mid-combat free bury/dig/take/donate; bury-after-
  death; NPC armory/pharmacy honest consumption; bury-everything strand
  softlock attempt — held).
- `scripts/test-miser-section-chronic-20261010.js` — 12 adversarial checks
  (section chronic net-taker hole: 24 section takes of others' deposits were
  trust-free and invisible to _stashTotalNet; takeTool/_takeStashedItem now
  apply the -20 chronic block like takeMaterial; material control; donate-all
  + take-back softlock; "Take 5" partial-take honesty).

## Pharmacy identity (miser break-it 2026-10-10)

Stash entries keep medicine identity: `{itemId, name, kg, units, medType,
doses}`. A dosed bottle donated and returned comes back dosed and usable
from the pack — the old strip to `{itemId, name}` silently lobotomized it
(the affliction UI needs `medType` + `doses > 0`, so returned medicine was
an unusable brick). Every section keeps its units now: a merged 2-stack
donated whole comes back whole, and the weight checks weigh the whole
entry. Dosed medicine never merges (`stacksMatch`): dose pools are
per-bottle — merging a 1-dose bottle into a 3-dose stack destroyed a dose.
NPC consumption is honest too: an armory borrow takes one unit (entry
decremented), a pharmacy use spends one dose (entry spliced only at zero).
Stash/armory/pharmacy refuse mid-fight (the clock freezes in combat, so a
32-tick bury would have been free) and after death.

## Section chronic net-taker rule (miser break-it 2026-10-10)

`_stashTotalNet` used to sum only the material ledgers — the chronic
net-taker rule (net < −20 → −2 trust per take, "observed hoarding") never
saw the tool pile, armory or pharmacy. Draining all three sections of other
people's deposits cost nothing: measured 24 section takes, trust 15 → 15,
totalNet 0. Theft that is never socially punished. Now `_stashTotalNet` sums
all four ledgers (materials + tool/weapon/medicine), and `takeTool` /
`_takeStashedItem` apply the same chronic block as `takeMaterial`. Section
takes count per entry (one take = one unit of net), consistent with the
take-back sting accounting.
