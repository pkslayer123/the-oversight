# Brawler path re-audit at HEAD — 2026-10-07

**Auditor:** flesh-out loop worker (Worker 2: brawler re-audit)
**HEAD:** `da99f23` at audit start (== origin/master then); sibling commits landed during the run — final base `159c8a8`. Brawler-relevant files (abilities.json, synergies.json, abilityActions.js) are byte-identical between the two; the only game.js delta is socialite knowledge-broker code (plantRumors old-news), unrelated. All verdicts hold at the final base.
**Tree note:** dirty with sibling work throughout — engine read from pristine `git archive HEAD src index.html` at `/tmp/brawler-reverify`, never the worktree)
**Proof script:** `scripts/test-brawler-reverify-20261007.js` — 45 checks, **green on seeds 7 and 42** (exit 0)
**Prior audit:** `4174d39` (pinned at `79ca1b5`): 15 actions all narrating, 8 mechanically dead, 3/3 synergies undiscoverable, 10/10 modifiers unconsumed, no per-fight flag reset — then `725a49c` deleted the whole path.

## HEADLINE: the path is half-restored, and the restore got re-reverted

Since the audit: `2c2d6c5` (partial restore — only the 4 new abilities), `efc1ec1` (7 action hooks re-applied), `84a6c4c` (rewired the 8 dead actions, re-added 4 data actions), then **`7b49fc5` ("Bulk restore: revert cda7946") reverted `src/data/abilities.json` to the `2c2d6c5` partial state — byte-identical** (`git diff 2c2d6c5 HEAD -- src/data/abilities.json` is empty). The bulk-restore worker's tree predated `84a6c4c`: a third stale-tree revert in one day, eating the rewire's data fixes. The engine impls in `abilityActions.js` survive (that file untouched by `7b49fc5`), so **all 28 impl keys exist — but `Game.useAbility` requires a data def, so 8 actions are unreachable**.

**At HEAD: 7 of 15 actions live, 8 missing from data.**

| # | Prior finding | Verdict at HEAD | Evidence |
|---|---|---|---|
| 1 | Path deleted by 725a49c | **PARTIAL** | 4 new abilities + 7 actions + 3 synergies present in HEAD data; 8 actions on the 6 existing abilities absent |
| 2 | settle_debt dead (no fightDamageTaken writer) | **FIXED** | game.js:19366 writes `s.fightDamageTaken` (post-armor) in the incoming-damage path; reset in startCombat. Live: took 26 → bonus 26 → strike 48 |
| 3 | brace dead (zero callers) | **FIXED** | game.js:19359 calls `_applyAbilityDefenseMods` in the single incoming-damage integration point. Live: "BRACE: you take it on the shoulder" fired, flag consumed. Text "cannot be knocked down" still exceeds engine (no knockdown mechanic; `noKnockdown` has no consumers) — **PARTIAL on text** |
| 4 | bellow dead (m.stunTurns vs m.stunned) | **FIXED** | abilityActions.js:770-776 writes via `Game.applyStatus(m,'stun')` → `m.stunned`. Live: stunned=1, monster's turn eaten, player undamaged. "Beasts may flee outright" now honored: skittish/curious beasts bolt (`m.fled=true`); fearless immune |
| 5 | shake_off dead (wrong fields) | **FIXED** | Cures real statuses via `Game.cureStatus` on the player fighter (stun/stun_full/slow/bleed). Live: fighter.stunned 2→0. Second use honestly refuses ("already shaken off") |
| 6 | loom dead (loomActive unread) + text −5 vs impl −2 | **PARTIAL** | Impl reworked: `m.loomHesitate` consumed at game.js:21239 (each enemy loses its next round); trust −5 matching text, hits watching villagers. **But `fear_aura` has no actions in HEAD data → unreachable** |
| 7 | read_fight initiative dead (speed-based order) | **PARTIAL** | Impl reworked: +2 fighter speed + `orderDirty` re-sort (turn order re-sorts from next round). **Data action missing → unreachable** |
| 8 | stare_down dead (disengaging unread) | **PARTIAL** | Impl reworked: `m.fled=true` + `tbEndCheck()`, fearless immunity honored. **Data action missing → unreachable** |
| 9 | push_through dead (unread + Date.now()) | **PARTIAL** | Impl reworked: `s.pushThroughParts=1` (day parts, no wall clock), consumed in food-poison rolls (game.js:15075,15225), decays per part (15404-15406). **Data action missing → unreachable** |
| 10 | refuse_death | **PARTIAL** | Auto-trigger `maybeCheatDeath` intact (game.js:24942: second_wind 1/day → 1 HP + 500 kcal). Manual data action missing |
| 11 | unleash_rage | **MISSING** | Data action absent. Impl sets `rageActive{frenzy}` but frenzy targeting ("nearest thing, friend or foe") and no-retreat still have no engine consumers |
| 12 | menace / challenge / end_it_before (flavor-only) | menace, end_it_before **MISSING**; challenge **PRESENT, unchanged** (narrates, zero state — by design) | Live: challenge returns true, narrates, changes zero scholar keys |
| 13 | 3 synergies undiscoverable (no discovery_method) | **STILL BROKEN (data)** | `unstoppable`, `fear_itself`, `one_person_army` all lack `discovery_method` at HEAD (also lacked at 2c2d6c5 and 84a6c4c — never added). `checkSynergyDiscovery` still skips them; 3 days of deliberate combined use → zero unlocks, zero attempt-counters |
| 14 | matchesUsed ignores requires_any; recompute ignores requires_any; synergy-as-requirement unsatisfiable | **FIXED (machinery)** | Hunter loop `10db816` fixed the engine: discovery evaluates requires_any paths; `recomputeActiveSynergies` gates on requires_any (empty-requires always-active bug gone — verified: deactivates with no legs held); synergy legs count via discovery (`one_person_army` [unstoppable+fear_itself] activates). Data starves it (see 13) |
| 15 | 10/10 modifiers unconsumed | **STILL BROKEN** | Zero `modTarget('…')` call sites in pristine src/js for all 10 targets (trade_window, knockdown_resist, stun_duration, heavy_damage, damage_taken, morale_break_resist, social.intimidate, enemy_morale, outnumbered_bonus, solo_damage) |
| 16 | No per-fight flag reset | **PARTIAL** | `fightDamageTaken` resets in startCombat (verified: stale 99 → 0, opener's 27 re-accumulates; ledger === HP lost). `rageActive`/`tradeOpen`/`debtSettled`/`shakeOffUsed` still leak across fights |
| 17 | "You ability — that costs your action." | **FIXED** | Now "You focus — that costs your action." (game.js:18779) |
| 18 | Knowledge gating | **CLEAN** | `activatableAbilities()` only surfaces held-ability actions; the 8 missing actions surface nowhere (not even as teasers) |

## Play-feel judgment (played as a player, seeded)

The surviving 7-action loop **is a game loop now** — the rewire worked where it reaches the player:

- **Interesting decisions, every turn.** T1: pay 10 HP to open the trade (+50% × 3)? The monster answers, so T2 cashes the bruises (+24 on the next strike here). Brace is a real read ("plant your feet" before the deer's answer — the 60% reduction visibly fires: "BRACE: you take it on the shoulder"). Bellow buys a turn against the faster opener. Haymaker is the wind-up gamble (2.5x, telegraphed). Each action's cost is honest and named (turn + HP/kcal). No silent turns anywhere — every action narrates, including honest refusals ("already shaken off", "doesn't exist").
- **The gallowdeer is a worthy sparring partner, and it teaches.** Its Ocular Discharge telegraphs ("It freezes… Light gathers behind its eyes. It is not frozen. It is aiming."), and standing still parks the full beam (105, killed me twice from full HP). The coaching line is diegetic and perfect: "MOVE and the beam has to chase — stand still and it parks the full beam on you." The brawler fantasy (stand and trade) collides directly with the deer's counter (move or die) — that's a real tactical tension, not a stat check. Bellow-stunning it mid-windup feels earned.
- **Against the Highbeam Deer bar:** telegraphs distinct ✓ (trade/debt/brace/bellow/haymaker each have their own voice), phase visibility ✓ (windup→action→recovery reads in the narration), audio hooks — not verified this run (no audio assertions), codex-gated knowledge ✓ (read_fight's known/unknown gating survives in the impl, though the action is data-missing), armor/resistances make sense ✓ (brace as damage reduction, not a number tweak), distinct behavior ✓. Where it falls short of the bar: **the loop is 7 actions, not 15** — the social/intimidation half (loom, menace, stare_down, end_it_before) and the rage/refuse/push_through texture are gone from the player's hands. And the 3 synergies are dead content — the "earn the combo" fantasy the audit promised doesn't exist for brawler yet.

**One-sentence verdict:** the rewire turned the surviving half of the brawler path into a genuinely playable, enjoyable combat loop with honest feedback and a real tactical matchup — but the path is still half-missing at the data layer (third stale-tree revert in a day ate the re-added actions), the synergies remain undiscoverable, and the modifiers remain decoration.

## Backlog deltas for engine owner / siblings

1. **Re-apply the 8 data actions** (the 84a6c4c hunks) onto current HEAD abilities.json — or all 8 from 5f0279e; note 84a6c4c only re-added 4 of 8 (push_through, loom, read_fight, stare_down) and never re-added refuse_death, unleash_rage, menace, end_it_before. Then verify with `git diff <base> -- src/data/abilities.json` showing only intended diffs.
2. **Add `discovery_method` to the 3 brawler synergies** (the hunter loop's machinery is ready and proven — finding 14 — the data just needs the methods).
3. Wire or delete the 10 modifier targets (finding 15 still open).
4. Reset the remaining per-fight flags in startCombat (finding 16 partial).
5. Brace text: drop "cannot be knocked down" or implement knockdown (finding 3 partial).
6. Decide unleash_rage frenzy targeting / rage-passive duplication (finding 11).
7. **Process:** three stale-tree reverts in one day (725a49c, cda7946-via-7b49fc5, and 5f0279e's own). The `safe-commit.sh` + read-from-HEAD discipline (AGENTS.md) exists now — use it; `7b49fc5` is the case study for why bulk reverts need a base-newer-than-everything check.
