# The Oversight — Bear Canon (Steve's design)

The black bear is an animal, NOT a System monster. Steve 2026-10-09:
**"Bear should be a non monster monster fight."** It is fierce for humans using
ordinary human weapons — the fight is scary because it's a bear, not because
it's a monster.

## The fight

- **Weapon effectiveness: bow > spear > knife > bare hands.** Ranged wins;
  bare hands are desperation.
- **The maul:** at range ≤ 2 the bear mauls for **8–17 damage**. Spear reach
  halves the maul. A miss does not make it harmless — it advances and mauls.
- Most people familiar with America recognize a black bear on sight. That
  recognition (and basic danger) is early knowledge. Everything else is earned.

## The carcass (portion law)

- A 30,000-kcal bear does NOT become one slab. Butchering yields roughly
  **24 × 500-kcal portions** after realistic usable-meat yield. Portioning
  applies engine-wide to large-game butchering — no giant calorie lumps.
- **Separable fat** (animal-specific, `butcher.fat` in animals.json):
  bear 6 slabs, boar 3, javelina 2. Deer, elk, moose, bison, rabbit, turkey:
  none. (Raccoon deliberately omitted — "fat in fall" would need a season
  system that doesn't exist.)
- ~20% of the gross lives in the fat. Raw slabs are inedible until rendered.

## Knowledge gating

- Ungated bear-kill instructions were removed. The scenario must not teach
  killing the bear, trichinosis, fat rendering, or sickness up front.
- **L4 (deep):** trichinosis, fat rendering, pemmican. Most people do NOT know
  these — they are earned knowledge.
- **Book:** *Tallow & Keeping* teaches rendering + deep bear knowledge.
- **Trichinosis:** bear/boar/javelina meat carries `parasiteRisk`. Only
  `foodState: 'cooked'` clears it — smoking does NOT.

## Open / known gaps (2026-10-09)

- Render/pemmican actions are wired for pack + fire, but NOT yet for the
  village stash (`prepStash`). That's a real gap, not a design choice.
- The maul's *feel* (not just its constants) still needs a live playtest pass.

## Change log

- 2026-10-09: canon created from Steve's bear-rework direction. Bear feature
  `7c04049`; knowledge-gating fixes `ea5d0b8`; smoking restored to 16 ticks
  (was 8 — worker misunderstanding; Steve: "1/8 of a day seems about correct").
