# Social + Contest Scenario Playtest — 2026-10-07

Worker partition: middle-third scenarios — social (moot, ambush, liars, exile, uprising, starving, language) + contests (pit, hide, calorie_run, watch, why_eat, eligibility).
Harness: `scripts/playtest-social-contest-20261007.js` (FULL production script list, index.html order, window stub deleted post-load for sync combat).
Sibling coverage: `scripts/playtest-social-scenarios.js` (today) already played mootAccused/mootJuror/ambush/liars/exile — re-ran for regression.

## Verdicts

### CONTESTS — all playable ✅
| Scenario | Result |
|---|---|
| contestPit | ✅ 3 phases → won, prize given ("Can labeled BEANS... bean-adjacent") |
| contestHide | ✅ 4 phases → died. Extreme risk legible ("It was always going to find you") |
| contestForage (Calorie Run) | ✅ 3 phases → won on density |
| contestWatch | ✅ Villager taken (not player), watcher agency present (Cheer / Watch silently / Study the pattern / Look away / Shout advice), resolved with villager win |
| showWhyEat | ✅ Announced. Announcement-only, no beats (fine for a show) |
| contestEligible | ✅ 4 eligible listed, fiction legible ("something enormous has been watching. It has opinions") |

Contest drive pattern (for future harnesses): `fireContest` → `pendingContest`; `resolveContest()` → `activeContest`; drive `activeContest.phases[phaseIdx].choices`, call `contestChoose(index)` (INDEX, not id). There is NO `Game.contestChoices()` — my first harness version called it and got "0 choices" false failures.

### SOCIAL — mostly playable, 3 issues found

**mootAccused / mootJuror / ambush / liars** — ✅ all pass (sibling script, re-ran clean).

**exile** — ⚠️ 2 failures (sibling script, confirmed):
1. `petitionVillage(id, {giftKcal: 700})` does NOT deduct the gift — pack 858→858 kcal. Free gifts = exploit. (game.js `petitionVillage` — off-limits, REPORT)
2. `foundHaven()` after 12 drift days still gated ("7 more days surviving solo; a claimed campsite; a hut or better"). Possibly by design (hard-reset requirements), possibly drift not counting as "surviving solo". Needs design call. (game.js — REPORT)

**uprising** — ✅ playable:
- tbfight starts, 4 hostile villagers with descriptor names (knowledge-gated, good)
- Desperate talk path exists (talkTo responds mid-uprising)
- Door tiles kept clear for escape (code-verified); flee-by-barrier via UI
- Note: `tbPlayerStrike`/`tbPlayerMove` silently no-op when it's not the player's turn (`if (!f || !this.tbIsPlayerTurn()) return false`). UI-gated so low risk, but silent.

**starving** — ⚠️ playable but two soft spots:
1. `takeFromPantry` says only "Took Canned soup." — no kcal shown. Item has kcalEach 250. Per "every action visibly explains outcomes," the take should state kcal/weight. (game.js — REPORT)
2. Scenario promises "People notice what you take," but a single 250 kcal take produces NO reaction — trust only drops when net < −5000 kcal. In a village with ~2700 kcal total, you'd have to take ~2× the entire pantry before anyone notices. Threshold miscalibrated for scarcity. (game.js — REPORT)

**language** — ❌ BROKEN SCENARIO (root cause found, reproducer: `scripts/test-language-scenario-20261007.js`, currently FAILS 8/8):
- Scenario sets `v.bgLangs[rid] = {native, levels:{native:3}}` ("zero English")
- BUT hydrated person records carry `person.languages` (fluent English), and `npcLangs()` prefers `person.languages` over bgLangs ("UNIFIED" path, game.js:1248)
- Result: `commLevel()` = full/english for all 11 villagers; the nonverbal barrier NEVER triggers; villagers speak fluent English
- The scenario's entire premise is silently defeated. The real language system (exposure→translator progression) is never exercised.
- FIX (not applied — debug-scenarios.js outside this worker's safe files): scenario must override `person.languages`, e.g. `const p = Game.getPerson(rid); if (p) p.languages = { native: t, levels: { [t]: 3 } };`

## Files touched
- `scripts/playtest-social-contest-20261007.js` (new harness — commit)
- `scripts/test-language-scenario-20261007.js` (new reproducer, FAILS until scenario fixed — commit)
- `hidden_files/playtest-social-contest-verdicts.json` (harness output — commit)
- NO game source files modified (contests.js dirty by sibling — untouched; conversation.js clean but no bugs found in it; game.js/app.js off-limits)

## For Steve / parent
1. Language scenario needs the one-line scenario fix above (or a design call: should bgLangs override hydrated languages?).
2. Exile gift exploit (free 700 kcal gifts) — real bug, game.js.
3. Starving: take feedback + scarcity threshold — design calls, game.js.
4. Contests are in good shape — pit/hide/forage/watch all resolve, watcher agency works, death legible.
