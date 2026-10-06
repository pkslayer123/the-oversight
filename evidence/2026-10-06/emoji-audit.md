# Emoji Collision Audit — 2026-10-06

Steve's rule: same emoji for unknowns is fine (lack of knowledge). Same emoji for
fundamentally different object types is a bug — DOUBLY so when one blocks and the
other doesn't.

## Method
Mapped CELL_GLYPH + PLANT_GLYPH (app.js), cell blocking (cell_defs.json),
monster emojis (monsters.json), animal emojis (animals.json), and grid render
paths. Checked every shared emoji against the blocking/interactable matrix.

## Blocking vs non-blocking: CLEAN
The rubble/wall (🧱) collision was the only one. Current state:
- Blocking: tree🌳 bigtree🌲 water💧 tent⛺ fire🔥 wall⬛
- Non-blocking: bush🌿 plant🌱 rubble🪨 bridge🌉 door🚪 grass dirt
No emoji is shared across the blocking boundary. ✅

## BY DESIGN — do not "fix" (Steve's INDISTINCT rule, 2026-10-05)
The code explicitly documents: "the emoji shows what it looks like, not what
it is." These shares are the lack-of-knowledge principle working as intended:
- 🐗 bulldozer (monster) vs wild_boar (animal)
- 🦌 Highbeam Deer (monster) vs white_tailed_deer (animal)
- 🐦 white_noise_heron (monster) vs american_woodcock (animal)
- 🦝 lockpick_raccoon (monster) vs raccoon (animal)
- 🐢 speedbump_turtle (monster) vs box_turtle / snapping_turtle (animals)
- 🐸 belltoad (monster) vs bullfrog (animal)
- 🌱 / 🌿 for unknown plants and bushes
- 🐍 🐟 🦫 shared across animal species (shape, not species ID)

**Open question for Steve:** the emoji never diverges once KNOWN. A village-named
"Headlight Harry" still renders as 🦌, identical to dinner. The mimicry is
correct while unknown — but should a KNOWN Highbeam read differently on the
grid? Options: (a) keep identical forever (permanent paranoia — you can never
be sure), (b) knowledge-gate the emoji so known monsters get a distinct
"wrong" variant (e.g. 🦌 with a glow badge, or a dedicated emoji).

## REAL COLLISIONS — fix these

### HIGH
1. **💡 nightlight_catfish (w1) vs bright_idea (w2)** — two different monsters,
   different waves, different fights. The "System iteration" theme explains the
   resemblance, but a wave-2 threat should read differently once known.
   Propose: bright_idea → 🔆 (brighter, harsher — the upgrade reads visually).

### MEDIUM
2. **🌰 hickory_nut vs acorn_white_oak** — two KNOWN plants, identical emoji.
   A player who learned the difference can't tell them apart on the grid.
   Propose: acorn keeps 🌰, hickory_nut → 🥜 (larger, rounder nut reads).
3. **🫐 known blackberry vs unknown berry bush** — the "you know it's a berry,
   not which one" state renders identically to a KNOWN blackberry. You can't
   tell earned knowledge from a hunch.
   Propose: unknown berry bush → 🌿 with a 🫐 badge, or keep 🫐 for known and
   give the unknown state a ❓ overlay. The distinction must survive at a glance.

### LOW (noted, probably fine)
4. **🌱 chickweed vs unknown plants** — chickweed's real emoji IS 🌱, so a known
   chickweed looks like an unknown. The `knownplant` CSS class distinguishes
   them, but visually identical. Acceptable under the unknown-sharing rule, but
   chickweed could take ☘️-style distinctness if it ever matters.
5. **🧱 in contest arena art** — decorative only, not a grid cell. No conflict.

## Summary
- Blocking boundary: clean, no action needed.
- 1 HIGH, 2 MEDIUM collisions to fix (all non-blocking, all knowledge-visible).
- 1 design question for Steve: should known monsters diverge from their
  animal lookalikes?
