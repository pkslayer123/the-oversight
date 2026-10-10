# Brawler adversarial run 6 — armor-pierce wiring (2026-10-10)

Archetype 4 (brawler). Hostile angles: endgame armor immunity cells,
pierce-hook honesty, static audit of all damage call sites.
Canon: docs/CANON.md, docs/DIRECTIVES.md, docs/MONSTER-WAVES.md,
docs/BALANCING.md read first.
Proof: `scripts/test-brawler-pierce-20261010.js` — ALL GREEN ×3 seeds
(0xB0A910, 777, 424242). H5 (static audit) FAILED pre-fix, passes post-fix.

## BREAK FOUND + FIXED

### The wave-3/4/5 armor-pierce design was silently inert (EXPLOIT — immunity cell)
`tbDamage` reads `mdef.pierce` via `tbFighter(sourceKey)` — but of ~30
monster-attack call sites, only 2 passed a sourceKey (understudy copy, heckler
chip). Everywhere else `tbFighter(null)` → null → pierce 0. The 25 pierce
assignments in monsters.json (0.1–0.75, wave 3/4/5) never fired — god armor
(P=138) was an immunity cell against the System's immune system, exactly the
class Steve's armor law forbids ("No immunity cells allowed").

Concrete: The Finale's 175-damage strike vs P=138 landed **22** (broken) vs
**64** with pierce 0.75 applied — MONSTER-WAVES.md's "~70 through god armor,
the wall holds" only makes sense with pierce working (without it the number
would be ~22, not ~70). The dps-anchor sim measured its "8-21/round through
P=138" bands through the broken engine, so enabling pierce moves measured
defense numbers up toward the design's stated expectations.

**Fix:** pass the attacker's fighter key at all 20 monster→player/villager
`tbDamage` sites (game.js ×17, encounters.js ×2 alien-predator strikes,
party.js ×1 hostile strike — the last also lets the justice.js enrage hook
match by key instead of by fragile name-match). Deliberately untouched:
environmental chip (bulldozer shrapnel, landlord/moderator leased ground —
no monster fighter in scope, pierce 0, math identical), non-monster
attackers (player strike, gristlefit lash, snake segments already keyed,
villager strikes on monsters — pierce hook is player/villager-target only).
Wave-1/2 monsters all have pierce 0 → effP identical → zero behavior change
for existing content.

## HELD (attacked, didn't break)
- **Hit-1 clamp with pierce:** hit 1 vs pierce 0.75 still lands exactly 1 —
  pierce can't create a reverse immunity cell either.
- **Armor UI honesty:** the only player-facing armor number is the combat
  "Armor absorbs N" line, which states the post-pierce absorbed value — the
  number is honest; the WHY (pierce) is monster knowledge, correctly gated.
  No equip-screen copy promises flat reduction.
- **read_fight speed stacking:** repeatable (+2 speed/fight each tap) but each
  tap costs the combat turn — a costed tradeoff, honestly narrated ("+2 speed
  for the rest of the fight"). Self-limiting; held.
- **fear_aura/Dread wiring:** trust -10 on grant and combat hesitate both
  wired (verified in code, not re-attacked).
- **armor.flat stacking:** finite sources only (chitin +30, synergy +15, relic
  +2) — no infinite loop; diminishing curve + clamp contain it. Held.

## Regression
- test-brawler-pierce-20261010 (new): 5/5 ×3 seeds
- test-combat-break-20261010: 19/19 (one stale assertion updated — it demanded
  "no monster declares pierce", written before the 2026-10-10 wave-3/4/5
  assignments; now asserts pierce is wave-gated: none in wave 1/2)
- test-wave3-5-20261010: 211/211
- test-brawler-adversarial-20261008: 14/14 relevant, 1 pre-existing fail
  (2.2b trust drift — fails on pristine HEAD too, unrelated to combat)

## Files
- src/js/game.js — 17 tbDamage sites keyed
- src/js/encounters.js — alien-predator heavy strike + strike keyed
- src/js/party.js — hostile strike keyed
- scripts/test-brawler-pierce-20261010.js — new proof
- scripts/test-combat-break-20261010.js — stale assertion → wave-gated

## Design note for Steve
Enabling pierce makes wave-3/4/5 hit noticeably harder through heavy armor
than the last few days' builds did — that IS the documented design ("the wall
holds", not "the wall is untouched"). The sim's defense bands should be
re-anchored with pierce live when convenient; unit math here is exact
(finale 175 → 64 through P=138).
