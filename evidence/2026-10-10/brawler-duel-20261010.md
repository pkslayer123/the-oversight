# Brawler adversarial run 4 — 2026-10-10 (04:30–05:30 CDT)

Archetype 4 (brawler). Hostile angles: deferred lie-buttons, duel-term
exploits, fled-fight softlocks, copy-vs-engine honesty.
Proof: `scripts/attack-brawler-duel-20261010.js` — 31/31 × 3 seeds
(20261010, 777, 424242).

## BREAK FOUND + FIXED

### The challenge dare's bout was vaporware (deferred lie-button)
Run 3 (this morning) fixed `war_cry.challenge` as "the button is the DARE —
the bout comes when hands are thrown." But `you_challenged` had NO consumer:
nothing ever made a later fight happen on the dare's terms. The copy promised
a witnessed, non-lethal bout; the engine delivered a stock betrayal fight
with full ambush-terror aftermath. Same lie-button class as the r7 `menace`
fix — just deferred.

**Fix (src/js/party.js): the witnessed duel.** An outstanding dare (memory
`you_challenged`, ≤3 days old) against the betrayer flags the betrayal fight
as a duel at start:
- Announced aloud at fight start ("THE DARE STANDS… witnessed, to yield,
  non-lethal").
- **Yield → terms honored:** winner takes respect (gossip `duel_won`
  {brave:+6, competent:+2}), loser takes humility (`duel_lost` {brave:-4}) —
  REP, never trust (canon). Terror fallout softened vs ambush (witnesses -10
  not -20, yielder -20 not -40, trauma 8 not 12). Dare consumed
  (`you_challenged` removed, `duel_fought` recorded).
- **Kill → terms have teeth:** killing under witnessed terms seeds
  `duel_broken` {honest:-20, generous:-10, brave:-5} + extra -15 witness
  trust — the village names you oathbreaker.
- **Fled/routed → dare stands** (bout unanswered, no softlock).
- No dare / stale dare (>3d) → stock betrayal fight (control held).

Ability copy (abilities.json `challenge` effect) now states the terms
explicitly. Build-notes entry added (pending-ship).

## HELD (attacked, didn't break)

- **H1 respect farm:** one dare/day guard holds; the dare is consumed by the
  duel, so a second fight vs the same target is a stock fight. A daily duel
  costs real HP (hostile hits [6,12]/turn), trust (-10 witnesses, -20 loser),
  trauma 8 — honest content with costs, not a printer.
- **S1 fled duel:** no hang, betrayal state cleaned, challenged villager
  still in village, dare stands.
- **E5 stale dare:** >3 days → no duel flag; the terms expire.
- **E4 control:** no-dare yield keeps the full ambush aftermath (-40/-20,
  trauma 12) — the duel softening is duel-only.
- **Corpse loot-as-action:** `corpseTakeItem` rejects double-take
  ("Nothing left of that"), no auto-loot in the betrayal-kill path (pack →
  corpse, deliberate take). Not re-attacked deeply — covered by prior runs.
- **Intimidate loop:** already hardened (breaking point, snap/run,
  recordCrime) — not re-attacked.

## Regression
- test-ability-actions-20261007: 21 pass, 1 pre-existing fail (unwired
  actions list — fails on pristine HEAD too)
- test-ability-honesty-20261009: 7 pass
- test-ability-xp-use-20261008: OK
- test-ability-id-resolution-20261008: 5 pass
- test-combat-break-20261010: 19 pass
- attack-brawler-20261010 (run 3): ALL GREEN
- validate-ontology.js: 52/52 green

## Files
- src/js/party.js — duel detection in startBetrayalCombat, duel yield
  aftermath + duel-broken in tbEnd wrapper, _duelResolveDare
- src/data/abilities.json — challenge effect states the terms
- src/data/build-notes.json — pending-ship entry (pruned to 15)
- scripts/attack-brawler-duel-20261010.js — proof (31 checks ×3 seeds)

## FUN note
The duel is the brawler's social weapon with a conscience: the terms make
the dare a promise the village remembers, and breaking them costs more than
keeping them. The oathbreaker consequence is the kind of social violence
Steve wants — theft allowed, violence desperate, reputation real.
