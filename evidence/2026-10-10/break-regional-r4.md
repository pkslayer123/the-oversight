# Break-it: regional & hierarchy — FOURTH PASS, 2026-10-10 (target 14)

Verdict: **BROKE + FIXED** — 3 catches (1 exploit, 1 exploit-shaped honesty hole, 1 softlock-class UI gap), all fixed. Proof: `scripts/test-scale-break-r4-20261010.js`, 36 assertions × 3 seeds (11, 222, 3333) — ALL PASS. Prior suites still green: `test-scale-ladder-20261010.js` ALL GREEN ×3 (2 test-setup updates, see below), `test-hierarchy-break-20261010.js` 35/35 ×3, `test-hier-break3-20261010.js` 84/84 ×3. Ontology 53/53.

Attack surface this round: the fresh scale-ladder code from commit abe7bf79 (national/global beats, scaleRank, ×1.25 tribute logistics). Canon: docs/CANON.md + docs/SCALE.md read first; one design call documented in code + SCALE.md (no canon conflict).

## CATCH 1 — NATIONAL WAS A STICKY TITLE (exploit)
`nationalLive` was set by `answerNationalChoice` and **never cleared anywhere** — no code in the repo set it false. Burn the realm after the court sits: break all 3 links, and Haven kept `scaleRank()==='national'` forever with zero links — wave-5 gate (`scaleAtLeast(rank,'national')`) and the endgame deed gate stayed satisfied. Worse on the BELONG road: swear the oath, break the link, dodge the 4,000 kcal/week tribute upkeep while keeping the rank. Measured before-fix: 3 links broken → `nationalLive` still true, rank 'national', gate open.
Fix: national/global are **live states** — `_checkNational` (daily) revokes `nationalLive` + `globalLive` when no qualifying polity exists and no beat is pending, kills a pending global summons, and says every loss aloud ("The realm came apart — ... Haven is a free fire again"). The ladder implication holds (global ⟹ national, never a skip). Design call, documented in the new `national_is_a_live_state` ontology rule + docs/SCALE.md. Note: post-fix, `test-scale-ladder` §F had to build a *real* realm instead of faking `nationalLive=true` — the old test was encoding the bug's assumption.

## CATCH 2 — THE OATH WAS FREE ON AN EMPTY PANTRY (exploit-shaped honesty)
The Binding's `swear` granted the full **+12 trust on a 0-kcal oath** — `_removePantryKcal(3000)` returns 0 on a bare pantry, and trust moved anyway. The feast-court path and the accord gift were already proportional (break-it r1 rule: "honor is proportional, never free") — the oath was the odd one out.
Fix: `ogain = oath >= 3000 ? 12 : max(2, round(12*oath/3000))`, same floor pattern as the accord gift; `_nudgeOpinion` scales 5→2 likewise. Copy already said the true amount ("sealed with 0 kcal") — now the engine agrees with the spirit of its own copy.

## CATCH 3 — THE BEATS HAD NO WAY TO BE ANSWERED (softlock-class)
`state.pendingNational` / `state.pendingGlobal` had **zero references in app.js** — the say() lines narrate the choices ("FEAST them… HOST… or write the law in COLD ink") but the player had no button to answer. The flagship played moments were staged and unanswerable in the live game. (Sibling sweep: every other pending* beat — accord, counter, demand, contest — has UI wiring; national/global were the only orphans.)
Fix: minimal app.js wiring following the Regional Dawn accord pattern exactly — realm-beat panel in the Haven panel (renders outside the links gate so it shows even with an empty link list) + `data-national`/`data-global` onclick wiring in `expeditionScreen` next to the accord wiring. The "separate workstream" UI item from prog-scale-ladder.md is now done — no duplicate work needed.

## HELD (attacked, resisted)
- **×1.25 logistics bonus:** weekly-gated (`m.lastLinkWeek`), non-stackable, non-retriggerable same-week; arrival line says the true bonused amount (5,000 for a 4,000 base — measured); grain arrives as a real spoil-dated (+21d) pantry item, same spoilage/disease surface as normal tribute; honest fallback if the pantry push throws. No boundary farming (week tags from `_week()`, settled-week logic from the r1 fix).
- **Trust farming via beats:** feast/oath/cold are one-shot (nationalLive set on answer); post-fix, re-earning requires rebuilding a real realm (3 fresh links + courtship + 5,000 kcal feast each cycle) — costs exceed gains, no compounding on one link.
- **Foreign sim:** weekly gate, known-village filter, no player influence on outcomes, no knowledge leaks (all named villages are known; "possibly wrong" framing honest). The "delayed" claim holds at weekly granularity — the sim's cadence IS the delay.
- **Beat machinery:** no double-staging (LEAD+BELONG same day → one beat, led preferred); mid-beat dissolution dies aloud on both roads; double-answer is a no-op; `walk` returns before `nationalLive` is set (refusal is real, verified again).
- **Dead-code:** `scaleRank()` is live-wired (progression.js endgame deed gate, game.js wave-4/5 `scaleAtLeast` ladder — defensive, never throws); `polityNews`/`worldFeed` run in `hierarchyDaily`; `_foreignPolitySim` runs weekly inside it; `polityOf`/`foreignPolities` have no external callers yet but are documented API surface for the region view/rumor systems (held as API, not dead).
- **Belong-bar honesty:** 60/0/21 vs `kingdomEndingEligible` 70/0/21 — the "one notch below" framing is engine-true.
- **Sibling sweep:** the accord gift was already proportional (same class as Catch 2 — no fix needed); `*Live` flags exist only in hierarchy.js (`networkLive` is a historical fact, correctly sticky); no tribute.js exists — tribute lives in hierarchy.js; membership.js swept in r1/r3, nothing new.

## Files changed
- `src/js/hierarchy.js` — revocation in `_checkNational`, proportional oath in `answerNationalChoice`, +1 ontology rule
- `src/js/app.js` — national/global beat panel + button wiring (Haven panel, accord pattern)
- `docs/SCALE.md` — "National is a live state" design note
- `scripts/test-scale-break-r4-20261010.js` — new proof (36 assertions × 3 seeds)
- `scripts/test-scale-ladder-20261010.js` — §F builds a real realm, §H breaks it (test encoded the old sticky assumption)
- `evidence/2026-10-10/break-regional-r4.md` — this file

## Report to Steve
Loud items: (1) the burn-the-realm exploit is closed — national/global now die aloud when the realm dies; (2) the national/global beats finally have buttons — the First Court, the Binding, and the Watchers are actually playable in the UI now **[needs-eyes]** — Steve should play the court beat on his phone; (3) the oath honors proportionally. No tuning numbers were touched (all v1 per SCALE.md).
