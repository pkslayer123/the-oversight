# Worker E — Win-Seeking Completion Runs (2026-10-10)

## Task
Steve's order: run games that SEEK to complete the game. Build a win-seeking
policy pursuing the galactic-table deed gate; run 200-day games across 60+
seeds in parallel; report win rate, per-requirement completion, binding
blockers; fix or document unachievable requirements.

## Policy: scripts/policies/winseek.js
Built on competent survival base, inverted to pursue:
1. **Hunt** (deed bars 5/5/4/3/2): patrols 3x/week to far wild tiles;
   wave-targeted (only fight waves with unfilled bars; flee filled waves);
   flee already-faced types (deed banked); fight new ones if winnable
   (3.5x HP threshold, bolder than competent); flee hopeless at once.
2. **Contests**: always participate (choice 0), never refuse.
3. **Scale**: court villages (study codex), proposeLink as subordinate
   (BELONG road — legitimate per Steve), accept counter-offers, pay weekly
   tribute (+3 trust), answer national beat (never refuse/walk).
4. **Crises**: weather them; famine buffer via preservation.
5. **Sentiment/feast**: channel keepsakes daily once taught; host feasts
   weekly; surge via devotion lane (resonance ≥35).
6. **Integration**: system quests, trials, teaching, naming → stage 3 (80+).

## Harness findings (policy debugging)
- **Pending-encounter sleep block**: travel in `daily` (post loop) sets
  pendingEncounter → sleep() aborts without advancing day → clock stuck.
  Fix: travel belongs in `upkeep` (pre harness drivers). Pattern matches
  competent's forageTrip.
- **Deed-at-startCombat**: startCombat records wavesFaced immediately, so a
  naive "flee if faced" flees everything. Fix: snapshot faced-before-fight
  via ctx._fightObj guard.

## Results
(see merged output below; per-run JSON in scripts/sweep-winseek-results.json)
