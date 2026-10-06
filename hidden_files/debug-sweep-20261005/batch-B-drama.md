# Debug Sweep — Batch B: Combat/Social Drama Scenarios
**Date:** 2026-10-05 · **Repo:** `~/workspace/the-scattering` (shared tree, uncommitted)  
**Method:** headless Node harness (`hidden_files/debug-sweep-20261005/harness.js`) — stubbed `fetch`→local JSON, in-memory `localStorage`, eval'd all 30 game sources in load order (skipped `app.js`, `move-anim.js`), `await Game.init()`, then `Game.debugScenario(name)` per scenario in its own process under `timeout 60`. Deep-probe pass (`deep-probe.js`) re-ran moot/exile/mantle scenarios to inspect correct state keys (`village.betrayal.cases`, etc.).  
**Result: all 6 scenarios loaded in ~8s total, zero throws, zero `🐞 failed` lines, none hit the 60s guard.**

No fixes applied, nothing committed, no jest run.

## Summary table

| scenario | loads? | error | state coherent? | notes |
|---|---|---|---|---|
| `ambush` | ✅ yes (`true`) | none | **Yes** | Plot armed vs player; 3 plotters placed around player (not wandering); convo opened on `ambush` thread; `debugChatRequest` set. Real mechanics behind it: `ambushExchange(plot, 'run'\|'talk'\|'fight')` with rounds, `talksLeft: 2`, awareness from tells, aftermath. No `tbfight` — correct, it's a social beat. |
| `mootAccused` | ✅ yes (`true`) | none | **Yes** | Case `open` in `village.betrayal.cases`, player accused of `assault`, accuser identified, `knownToPlayer: true`. Crime bookkeeping is smart: unwitnessed theft stays uncharged, witnessed attack becomes the charge. Moot timing exists in code (`c.mootIn` = 2–3 days, countdown + firing logic in `betrayal.js:2234/2300`). The moot *firing* itself wasn't exercised (needs day ticks). |
| `mootJuror` | ✅ yes (`true`) | none | **Yes** | Case `open`, 3 accused, charge `ambush`, `playerRole: 'juror'`, `knownToPlayer: true`. Plot armed with leader/target. Witness seeding ran. Setup matches the scenario's promise (press them separately, flip the weakest, vote). |
| `exile` | ✅ yes (`true`) | none | **Yes** | `scholar.exiled: true`; exitBuilding moved player to Haven grounds; pantry closed, journal updated, next actions exist (petition a village / found-haven / drift). |
| `mantle` | ✅ yes (`true`) | none | **Yes — surprisingly complete** | Full death sequence: death announcement, "You're not her" beat, System notice, Codex page turn. Succession picks a real named villager (`marcus_webb` in one run, `lena_ruiz` in another — RNG). New scholar alive at 100hp. |
| `keepsake` | ✅ yes (`true`) | none | **Yes** | `mothers_ring` in inventory with `chosen: true, bond: 3`. `teachSentiment` ran, flashback played with real prose, journal/codex notes written. |

## The junk (edge incoherences found)

These are all minor, but they're the kind of thing that erodes trust:

1. **"Twelve people" vs 6 villagers.** `newGame` hardcodes `Haven. Twelve people. The fire is lit.` (`game.js:1311`), but `genRoster` produces 6 villagers — every scenario snapshot shows `villagerCount: 6`. The fiction and the roster disagree from the first line of every run.
2. **Mantle death not memorialized.** After `playerDeath` + succession, `village.fallen` is empty (`fallen: 0`). The death is narrated beautifully but not recorded in the village's data — the memorial list doesn't know.
3. **Codex says "passes to someone".** The mantle page-turn line reads `The mantle passes to someone` — unnamed, even though a specific named villager was picked. Small narrative gap.
4. **Exile leaves the player in the village roster.** `villagePop` stays 6 after exile; exile state is a flag on the scholar only (`state.exile` absent, `exileMeta` null). The fiction says "To Haven, you are not one of ours anymore" — the roster doesn't reflect that. May be intentional (gossip/petition systems may need the link), but it's unverified.
5. **Raw-ID display risk.** Headless probes of `playerName()` fell back to raw IDs (`gen_eozxxfl`) in some paths. The anonymity system ("A person, maybe 30s") is by design, but it's worth a UI check that no `gen_` ID ever reaches the screen. Not confirmed as a bug — just unconfirmed as clean.

## Honest verdict

Batch B is **not junk**. All six scenarios load cleanly and set up coherent, playable states backed by real mechanics (ambush exchanges, moot countdown/firing, exile flags, mantle succession, keepsake bonding). This is the best-shaped batch so far. The remaining risk is all in the *transitions* — moot actually firing on schedule, ambush exchanges played through a real convo UI, exile petition flow — which headless runs can't exercise. Nothing here needs a rewrite; it needs a play pass.
