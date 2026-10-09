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

---

# Break-it: alien players r5 (2026-10-09, afternoon)

Target index 7 again this run. Commit `bf13f9ac` — "break-it alien r5: beam replaces strike (not bonus), salvage kill-only, feed naming reveals [needs-eyes]" (merged locally to master via rebase + --ff-only, pending ship; do NOT push — ship loop owns it).

## Canon note
No dedicated canon doc exists for alien players (docs/CANON.md registers none). Load-bearing rules used: docs/ONTOLOGY.md ("alien players are HUMANS, exclusive pool"), docs/DIRECTIVES.md, the module's own @ontology header. Nothing invented from scratch.

## Catches (3, all fixed + proven)

**B1. HONESTY — the beam was a BONUS attack, not a replacement.**
`apMaybeBeamAttack` fired from a `tbAfterPlayerAction` wrap that ran AFTER the original hook had already advanced the turn — the alien struck normally via `tbAlienTurn`, then got a free 90–110%-max-HP beam on top. The code comment claimed "(replaces their normal attack this turn)". The beam is a design pillar (kill them → take their armor → survive beams) and a free bonus strike broke its honesty.
Fix: the roll moved into `tbAlienTurn` (encounters.js, new §6b) where a fired beam ends the turn instead of the strike; the wrap was deleted; the cooldown tick moved with the roll. Same function: the telegraph named the persona pre-reveal ("Vex raises Vex's phase lance") while the fighter card says "Stranger" — now knowledge-gated.
Mid-run catch during the fix: moving the roll naively let the beam fire on `startAlienCombat`'s opening `tbAdvance` — one-shotting the player before their first move (the old post-action beam could never do that; it also broke the prior group-encounter suite). Added an `apTurns > 1` gate: no beam on the opening turn, every fight.

**B2. HONESTY/EXPLOIT — armor salvage fired on FLED opponents.**
A broke persona retreating ends the fight `'won'` (encounters.js `tbEndCheck` treats fled hostiles as defeated), and `apOnCombatEnd` then salvaged alien armor 60% of the time with copy claiming "from their body. It's warm." — stripping a body that ran away. Sibling honesty: monster `'routed'` gives "no meat, no trophy".
Fix: the `tbEnd` wrap now detects killed (`!f.alive`) vs fled and passes `{killed}`; `apOnCombatEnd(pid, outcome, opts)` gates salvage on `opts.killed`. New ontology rule `(salvage_kill_only)`; docs/ONTOLOGY.md regenerated (validator 52/52 pass).

**B3. HONESTY — feed naming vs "Stranger" gap.**
The System feed named a sadistic rival ("VEX MARLOWE was overheard…") but only *revealed* them 30% of the time — the other 70% you heard the name while the system still called them "Stranger".
Fix: `msgPids[]` tracks which message names whom; naming on the feed IS the reveal path, firing whenever the naming message is actually heard.

## Proof
`scripts/test-break-alien-20261009.js` — **91/91 assertions across 3 seeds** (beam placement + unit fire + knowledge gating + no opening-turn beam + kill-only salvage incl. 30 drove-off wins → zero armor + feed reveal honesty + source regression pins). Before/after verified: pre-fix code scores 60/91 (31 failures); post-fix 91/91. Ontology validator: 52/52 systems pass.

## Sibling sweep
- Contests `fled` → `_contestEnd(ac,'lost',false)` (no prize — honest).
- Monster `routed` → "no meat, no trophy" (honest) — the alien module was the outlier.
- All alienPlayers cooldowns record on success only.
- Audio voices (`fanPackageDrop`, `stasisBlock`, `alienRetreat`) all defined — no fired-but-silent.
- Dead-code check: all 60+ module functions have callers (wraps live in-module). Dead *data* note: persona `rivalry`/`voice` fields in `alienPlayers.json` are never read anywhere — flagged, not changed.

## Notes / caveats
- `scripts/test-break-alien-20261008.js` has 2 failures that are pre-existing on pristine code (test arithmetic ignores the `Math.max(0,…)` clamp on 101/107 beam damage vs 100 HP) — stale test from an earlier run, not touched here.
- Landing: master moved mid-run (sibling `5c5e0e8c` forager break-it r2, which regenerated docs/ONTOLOGY.md). Worker branch rebased cleanly (single commit, no overlap — sibling's ONTOLOGY changes were in broadcast/contests/food/game/party sections); proof re-verified 91/91 × 3 seeds on the rebased tree before `--ff-only` merge.
- `[needs-eyes]` included: beam is now strike-replacing and never fires turn 0 — combat feel Steve should playtest.

## Process note
safe-commit.sh REFUSED the commit (61 src deletions > 50-line guard). Coordinator verified the full diff by hand: the deletions were the removed broken beam wrap (legitimate restructure, net +28 lines, no sibling files) and approved `--force-delete` explicitly. Guard worked as designed — it forced a human diff read, not a dodge.
