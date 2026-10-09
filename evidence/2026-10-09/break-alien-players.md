# Break-it report: ALIEN PLAYERS (src/js/alienPlayers.js) — 2026-10-09

Target index 7 (advanced to 8). Worktree `break-alien`, commit `7759fec`, merged → pushed → bumped → live `7759fec-20261009-091847` on BOTH endpoints.

## Attacks attempted (all four classes)

**EXPLOIT** — favor loops (clamped ±100, ±1/day drift — held), dead-drop/care-package/persona-package kcal economy (rate-limited, none infinite — held), armor-salvage duplication (`available` filter excludes owned — held), lifeline (bond≥2 + 7-day cooldown — held), group-chain double counting (sporting rules recorded per chained start — held). **One real economy break:** #1.

**SOFTLOCK** — group-chain edges (consume-first, flee/loss disperses — held), refused-start cleanup (held), **phantom encounter state (#6)**, **dead-contact dead-end (#4)**.

**HONESTY** — spawn rates 8%/15%/3% match copy (held), beam-resist text 0.7^n matches math (held), **readiness comment lied (#7)**, knowledge-leak scan of every say/sysSay line + species names — **one real leak (#2)**; cover names safe pre-reveal by design; stasis/duel/raid/intro gate correctly.

**DEAD-CODE** — all 68 provided functions have runtime callers (entry points: checkEncounter wrap, endDay wrap, tbDamage wrap, contests.js ×2, game.js). **Two dead calls (#1, #5).** Zero shipped items are both `sentimental`+`armor`, so the bonded-armor beam-resist path can't fire on current data — documented as content gap, not fixed with an invented item.

## What broke → fixed

1. **Armor salvage granted bricks** — `this.giveItem` was never defined anywhere; every win fell into the `else` pushing bare `{itemId,id}` (no name/units — the r4 brick class). The whole "kill them → strip armor → survive beams" transition never worked. → uses `apGrantItem`.
2. **Group banter leaked the alien truth pre-reveal** — `"⚠ MULTIPLE alien players"` fired ungated. → gated; pre-reveal says "Multiple hostiles — and they're coordinating."
3. **Gossip cooldown burned on empty roster** — `lastGossipDay` recorded before the roster check (same class as r4 apEventFeed fix). → recorded only when gossip goes out.
4. **Dead villager as alien contact** — roster keeps corpses; `apContactedVillager` could pick a dead villager, and dead contacts kept whispering dream warnings. → living-only picks; dead contact released.
5. **Beam bond-deepening was dead** — `this.bumpBond` never existed; the guarded call silently never fired. → inline `+3` on the equipped bonded piece (matches game.js victory path).
6. **Fallback start left phantom `state.alienEncounter`** — a later unrelated tbEnd read it as that fight's persona and recorded a phantom encounter (favor/met-count/armor). → cleared on the no-fight path.
7. **Readiness comment lied** — claimed "no aliens before day 30" but the formula never enforced it. → comment now honest (day 30+ is a bonus, not a gate).

## Sibling sweep
Bug classes don't reproduce elsewhere: no other `this.giveItem`/`this.bumpBond` references; all other bare inventory pushes carry name+units; cooldown vars module-local; leak scan clean.

## Proof
`scripts/test-break-alien.js` 15/15 × 4 seeds. Regression green: test-alien4-copy (57), test-alien3-honesty (13), test-codex-aliens-20261008 (ALL GREEN), test-break-alien-20261008 (52/52).
