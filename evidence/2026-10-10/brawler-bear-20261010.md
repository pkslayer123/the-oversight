# Brawler adversarial run 5 — the bear fight (2026-10-10)

Archetype 4 (brawler). Hostile angles: bear-maul economy, weapon-effectiveness
honesty, narration honesty, death-at-0-HP softlock.
Canon: docs/CANON.md, docs/BEAR.md read first.
Proof: `scripts/attack-brawler-bear-20261010.js` — ALL GREEN ×3 seeds
(20261010, 777, 424242).

## BREAKS FOUND + FIXED

### 1. The maul was a toll, not a fight (EXPLOIT)
`encounters.js`: `if (a.id === 'black_bear' && dist <= 2 && !a._mauled)` — the
8–17 maul fired ONCE per encounter (`_mauled` set on the encounter object).
The bear stays after misses (encMissReact: answers 6–13, does not bolt), so
the hostile line was: eat one maul, then grind with a knife at FULL kill
chance — the ×0.4 close-range penalty lived inside the same one-shot block.
Canon BEAR.md is present-tense ("at range ≤ 2 the bear mauls for 8–17
damage"); the block's own comment says "Striking one inside mauling range
turns the hunt into a fight." A fight means every swing.
**Fix:** maul answers EVERY close strike (flag removed). Measured: knife@1
now costs ~21 HP/strike (maul 8–17 + 6–13 answer on miss), kill rate ~0.03 —
knife-bear is suicide, matching the L4 text ("Never a knife. Never your
hands."). Spear@2: maul halved 4–9, ~12 HP/strike, kill ~0.45 — "a dangerous
second choice." Bow@3+: ~4–5 HP/strike (answers on miss only), kill ~0.5 —
"a bow at range" is the real answer because of range, not raw bonus
(hunting_spear bonus 30 > crude_bow 18).

### 2. The generic bite double-dipped the bear (EXPLOIT + weak fiction)
The 2026-10-05 generic BITE block (`dist <= 1`, behavior not quilled/bedding)
fired for the bear ('cautious'): 20% chance of 3–8 "Teeth in your hand" ON
TOP of the maul AND the roar-answer — three damage events on one swing, and
"teeth in your hand" is weak fiction for a bear. Layering bug: the 2026-10-09
bear rework added the maul without excluding the bear from the older block.
**Fix:** `a.id !== 'black_bear'` in the bite condition. The maul is the full
close-range answer.

### 3. `(s.health || 100)` resurrected the player at 0 HP (EXPLOIT)
25 sites across encounters.js (13), game.js (5), betrayal.js (4), corpses.js
(2), food.js (1). JS falsy: at exactly 0 HP, `(0 || 100)` = 100 — the NEXT
damage application healed you. Proven in harness: 5 HP + maul 14 → 0, then
the roar-answer computed `(0 || 100) - 12` = **88 HP**. You could not be
killed by multi-hit strikes; the second hit was a heal. (Single hits could
still reach 0 — which exposed #4.)
**Fix:** all 25 → `(s.health == null ? 100 : s.health)`. `Math.max(1, …)`
non-lethal floors (betrayal/game.js) keep their design; the substitution only
changes behavior at exactly 0, where the new behavior is correct.

### 4. The hunt path had no death gate (SOFTLOCK, exposed by #3)
`huntAnimal` never checked for scholar death — the resurrection bug papered
over it (0 HP was always transient). Post-fix, a lethal maul left the player
walking at 0 HP: no death narration, no mantle, `tickAction`/`status`
unmoved. **Fix:** `G.encScholarDeathGate(cause)` — cheat-death abilities get
their say (maybeCheatDeath), then `playerDeath('the <animal>')`. Called at
the kill / near-miss / miss returns and in `encStrikeDeadPossum` (possum wake
deals 3–6). Measured: 12/20 lethal-maul strikes now process death (mantle
passes, 🕯️ narrated), zero throws.

## HELD
- **Portion law + fat math** (canon BEAR.md): 30,000 gross → 40% known =
  12,000 = 24×500 portions; fat 20% = 6,000/6 slabs = 1,000 kcal each. Matches
  canon exactly. `test-bear-rework-20261009` green.
- **Weapon ordering** (canon "bow > spear > knife > bare hands"): holds as
  cost-per-strike (bow 4–5 < spear ~12 < knife ~21) and kill rate
  (spear ≈ bow ≫ knife > hands). The L4 knowledge text is honest.
- **Narration honesty**: every HP lost in a bear strike is named in feedback,
  each number in its real roll range (maul 8–17 / spear 4–9, answer 6–13).
- **Ability XP economy**: capped at L3 (10+25 uses), refused taps grant none
  (prior run) — practice, not a printer. Not attacked further.

## NOTED FOR NEXT LOOP (same class, pre-existing, out of scope)
- `eatStashOne` (food.js) disease damage can single-hit to 0 HP with no local
  death gate (nightfall gate at game.js:22819 catches it eventually). Same
  `(s.health || 100)` class, not opened by this run.

## Regression
- attack-brawler-bear-20261010: ALL GREEN ×3 seeds
- test-bear-rework-20261009: ALL GREEN (2 assertions updated for per-strike maul)
- test-animals-hunt-20261008: 27 pass, 5 pre-existing fails (identical on pristine HEAD — stale schema assertions vs bear-rework data)
- test-combat-break-20261010: 19/19
- attack-brawler-20261010 (run 3): ALL GREEN
- attack-brawler-duel-20261010 (run 4): 31/31
- test-break-knowledge6-beargating-20261009: ALL GREEN
- test-hunter-attack-20261009: ALL GREEN
- validate-ontology.js: 52/52

## Files
- src/js/encounters.js — per-strike maul, bear excluded from generic bite,
  13× health-falsy fixes, encScholarDeathGate + 4 call sites
- src/js/game.js, src/js/betrayal.js, src/js/corpses.js, src/js/food.js —
  `(s.health || 100)` → `(s.health == null ? 100 : s.health)` (12 sites)
- src/data/build-notes.json — pending-ship entry (pruned to 15)
- scripts/attack-brawler-bear-20261010.js — proof (14 checks ×3 seeds)
- scripts/test-bear-rework-20261009.js — 2 assertions updated
- evidence/2026-10-10/brawler-bear-20261010.md — this note

## FUN note
The bear finally feels like the canon says: a non-monster monster fight.
The L4 knowledge text ("a bow at range, a spear as a dangerous second
choice. Never a knife. Never your hands.") is now mechanically true — the
engine prices each option exactly as the fiction promises. The death gate
also means the bear is the first thing in the wild that can actually end a
run mid-hunt, which is what "fierce" has to mean.
