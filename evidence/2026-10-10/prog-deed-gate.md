# Prog Deed Gate — evidence (2026-10-10)

## The deed definition

Steve's directive (2026-10-10): *"You shouldn't be able to beat the game
without going through a majority of game content. Don't gate on knowledge
because some places won't allow people to get knowledge unlocked in other
regions."*

The old Arc IV gate was `breadth >= 25` — a KNOWLEDGE gate. Knowledge is
regional; some regions can't unlock other regions' knowledge, so the endgame
was gated on where you landed. Completion sweep r3 proved it: an organic win
on day 47 by a weak scholar (maxWave 2, 3 abilities, village bled 15 dead) —
the gates measured devotion (channels, integration, codex breadth), not
capability.

The new gate is **deeds/experience, never knowledge** (`deedGateReady()` in
src/js/progression.js, consumed by `checkArc()`'s Arc IV want-gate and
re-verified by `tableScene()` in src/js/ledger.js at dawn):

| Deed | Bar | Feed (real code paths only) |
|---|---|---|
| Waves faced | 3+ DISTINCT wave-3+ monsters FOUGHT (blow-by-blow), at least 1 wave-4+ | `startCombat` wrap (the fight that actually starts — the double-tap refusal creates no new tbfight and records nothing; fleeing still counts), `recordWaveKill` wrap (every real kill path: player TB kills, villager field/patrol kills), `fieldFight` wrap (villager blow-by-blow: patrols, wild encounters, expeditions; 'evade' excluded — saw it, gave it room, lived). Stored as `pg.deeds.wavesFaced` keyed by monster id. |
| Contests survived | 3+ | `_cxCountHeld` wrap — the single choke every contest terminal flows through. "Survived" = the player was taken AND lived: death terminals (`_contestDie`, the arena-lost branch) and refusals are marked before reaching the choke; watched-villager contests never had the player at risk. Once-guarded per contest object (multi-take verdicts count once). |
| Scale | `scaleRank()` ≥ national | Read defensively. **Regional primacy is deliberate partial credit: insufficient.** The table judges a world power, not a neighborhood (documented call, 2026-10-10). |
| Crises weathered | 3+ distinct | `pg.crises` keys (already tracked). |
| Kept | `sentimentTaught`, `feastSurgeUsed`, stage ≥ 3 | Food-thesis deeds, not knowledge; System integration is earned standing. |

Dropped: `breadth >= 25`. Arc II/III keep their existing gates (out of scope).

Defense in depth: `tableScene()` re-checks `deedGateReady()` at dawn. A stale
`tableWaiting` (old save, dissolved realm) is withdrawn **aloud** — never
fired silently — and `checkArc()`'s re-fire re-extends the invitation when
the deeds hold again (arcBeat stays once). Note: pre-gate saves sitting at
the table under the old devotion gate will hear the reschedule line and must
earn the deeds — no grandfathering a shallow win.

Files: `src/js/progression.js` (gate, feeds, beat copy), `src/js/ledger.js`
(tableScene re-check + ontology rule). Untouched per brief: hierarchy.js,
game.js, monsters.json, index.html, build-notes.json. Ontology 53/53 green.

## Proof results — scripts/test-deed-gate-20261010.js (43/43 × 3 seeds)

- Fight feed: 4 real `startCombat` fights (3 wave-3 + wave-4 eater) recorded;
  refused re-entry recorded nothing new; `recordWaveKill` feeds; wave-1/2
  excluded.
- Contest classification at the real choke: player won/lost → +1 each;
  watched villager → +0; real `_contestRefuse` → +0; real `_contestDie` → +0;
  real arena-lost branch → +0; arena fled → +1; multi-take same ac counted once.
- Scenario A (weak day-47-style: breadth 30, stage 3, sentiment+surge,
  regional, wave-2 max, 2 contests, 2 crises): reaches Arc III, **no Arc IV,
  no table** — every deed bar reads false.
- Scenario B (knowledge-only: breadth 60, no deeds): reaches Arc III,
  **no table** — knowledge alone no longer opens it.
- Scenario C (powerhouse via REAL feeds: 4 wave fights, 3 real contest
  survivals, national, 3 crises, sentiment+surge, breadth 15 — clears Arc
  III's ≥12 but would have FAILED the old ≥25): Arc IV, tableWaiting,
  tableScene fires, final choice → **won=true**.
- Scenario D: stale tableWaiting + unmet gate → table withdrawn aloud
  (RESCHEDULE), no tableDone; deeds re-completed → invitation re-fired aloud,
  arcBeat not re-run.

## Sweep comparison vs r3 baseline

scripts/sweep-deedgate-20261010.js, competent policy:

- 16 seeds × 150 days: **arc4 0/16, table 0/16, won 0/16**, maxWave≥3 0/16.
- 8 seeds × 365 days: **arc4 0/8, table 0/8, won 0/8**.
- r3 baseline (old gate): 1/60 wins at day 47 by a weak scholar.

Direction is as designed: shallow runs (the exact profile that won under the
old gate — e.g. seed 1: arc3, 7 contests survived, 3 crises, maxWave 2) now
stop at Arc III with the deed breakdown showing why (w3:0, rank:village).
The competent policy never survives past ~day 50, so no organic run reached
wave-3 content in this horizon — the positive case (a deep run CAN win) is
proven by Scenario C's driven powerhouse, which reaches Arc IV/table/win
through real fight and contest paths. Whether organic runs can reach the
full deed set in practice (wave-4 fights at 5 w3 kills + regional, a
4-fire national polity over seasons) is a balance/playtest question for the
loops, not the gate: the gate is reachable and honest about what's missing
(`deedGateReady()` returns the full breakdown).
