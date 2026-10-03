# OPEN QUESTIONS

Unresolved design questions. Move to DECISIONS.md when answered (with date).

1. **Calorie tuning:** realistic (one bad week can spiral) vs slightly forgiving (constant pressure, recoverable)? Leaning realistic-with-warning.
2. **Day granularity:** 4 AP/day with Forage/Hunt/Craft/Explore/Rest/Treat Water — right size, or want more granular?
3. **Combat lethality:** usually survivable-but-costly vs genuinely run-ending dangerous?
4. **Village management depth:** menus-between-runs sufficient for v1, or any playable village turns?
5. **XP sources:** discoveries + survival days > kills (proposed) — ratios?
6. **Home biome selection:** player picks home village biome, or RNG? (Expedition targets are separate.)
7. **Integration timing:** System arrives after 7 days pure survival (proposed) — confirm?
8. **Final title:** "The Scattering" is working title. Alternatives wanted.
9. **Season/day counts:** days per season? Year length in-game?
10. **Multiplayer:** cut for v1; revisit ever? (Architecture stays async-friendly regardless.)
11. **Monetization:** personal project — none planned. Revisit if it grows legs.

## Visual direction — beyond text (noted 2026-10-03)

- Steve: graduate beyond strictly text illustrations to pixels or better, *at some point*. Constraint: build the world while maintaining simplicity and a game finishable as a solo dev team.
- Proposed staged path (not started):
  1. **Beautiful glyphs now** — the terminal aesthetic IS the art direction (grounded survival terminal + System overlay + Codex marginalia). Push color, glow, animation further. This is not placeholder art; it's the identity.
  2. **Pixel entities on the glyph map** — wanderer, villagers, monsters as small sprites (16×16) over the tile grid. Bounded: ~10 sprites.
  3. **Pixel vignettes for arrival moments** — one small illustration per terrain type (96×96), hand-drawn or palette-generated. Bounded: ~8 images.
  4. **Full tile replacement only if earned** — 16×16 tileset for ~12 terrain types. Finishable solo in an artist-week, or license CC0. Only if playtesting says glyphs aren't enough.
- Rule: never let art scope threaten shippability. Each stage must be independently shippable.
