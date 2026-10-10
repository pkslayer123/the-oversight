# Break-it: regional & hierarchy — 2026-10-10 (target 14)

Verdict: **BROKE + FIXED** — 4 engine catches, 1 copy lie, 1 ontology gap. Proof: `scripts/test-hierarchy-break-20261010.js`, 35/35 × 3 seeds (20261010, 7, 99).

Canon note: there is **no dedicated regional/hierarchy canon doc** in docs/ (checked the full list). Designs live in memory + `src/js/hierarchy.js` @ontology rules. Nothing was invented; all fixes follow the header's stated rules.

## CATCH 1 — TRIBUTE VOID (exploit + softlock, the big one)
`linkTick` settled the CURRENT week, crediting only payments tagged with that week — but the tick runs at the week's boundary (endDay), so only payments made on the single boundary day ever counted. **Every other payment, full or partial, was silently voided: food left the pantry AND full arrears were charged.** The 2026-10-09 rule "paying half is strictly better than paying nothing" was false in the engine, and `kingdomEndingEligible` (requires `arrears===0`) was **unreachable** — the earned ending was softlocked.
Proof (before): full 4000 paid day 3 → arrears 4000 at the week-1 tick; partial 2000 → arrears 8000 (double charge); a link formed day 10 was charged a full week at the day-14 tick.
Fix: the tick settles the week that just ENDED, crediting that week's tagged payments; links formed mid-week get grace for the partial week. (Design call, documented in code — no canon doc exists to consult.)

## CATCH 2 — PAY-TRIBUTE TRUST FARM (exploit)
Once a week's accumulated total reached the owed amount, EVERY further `payTribute` call granted +3 trust. Pay once in full, then click again with a bare pantry: +3 trust per click for zero food.
Fix: idempotent — a current week says so honestly and takes nothing (`tributePaidWeek === week` guard before any food is removed).

## CATCH 3 — DEMAND HONORED ON A DEAD LINK (exploit)
`breakLink` left `pendingDemand` alive; `answerDemand` honored it — tribute food left the pantry for a broken bond, trust moved on a dead link.
Fix: `breakLink` clears the demand; `answerDemand` refuses non-active links with honest copy.

## CATCH 4 — COLD-PROPOSAL COPY LIE (honesty)
"cold proposals decline" (app.js comment + ontology rule) vs engine: base 38 + rep/2 ±10 makes the 35–54 **counter** band the modal cold outcome (~81% at standing 0, 0% decline) — and worse, the unconditional +8 "generous tribute" bonus stacked with the +10 subordinate bonus so cold subordinate proposals **accepted ~50%**, skipping the counter band (the played negotiation) and the climb entirely.
Fix: generosity +8 now needs opinion 5+ (courtship started — join is +5); cold: ~15% accept / ~70% counter / ~15% decline; courted (opinion 8): ~76% accept. Copy updated to "cold proposals usually draw a counter-offer — the negotiation is the climb."

## CATCH 5 — ONTOLOGY GAP (dead-code class)
`provides` omitted 7 public methods: villageLinks, representative, renegotiateLink, bidForPrimacy, primaryDemand, proveWorth, successionCrisis. Added; validator green (52 systems).

## HELD (attacked, resisted)
- Re-link after breakLink can't re-farm join/codex opinion (one-shot flags persist; breaking costs −15/−30).
- Sweeten can't loop: 1,500 kcal per attempt, counter clears win or lose.
- Tribute overpay is engine-possible but UI-unreachable (Pay button never passes kcal).
- Demand honor is proportional (empty pantry → +0 trust, gap becomes arrears).
- Weekly table gate holds both directions (renegotiate/bid share lastTableWeek).
- Regional Dawn stages exactly once; accord on a dead link clears; pendingCounter blocks proposeLink until answered.
- Sibling sweep (membership.js alliance, same bug classes): proposeAlliance is idempotent (isAllied gate before the 1,500 kcal charge, formAlliance dedupes); guestMeal's once-per-day gate, full-belly guard, face-to-face + time cost all hold. No sibling fixes needed.
- No dead provided functions: all 26 exist on Game, callable, each with a call site. No dangling link statuses ('active'/'broken' only).

## Dead-code note
`_formLink`/`_stageCounter` intentionally stay out of `provides` (internal, underscore-prefixed).
