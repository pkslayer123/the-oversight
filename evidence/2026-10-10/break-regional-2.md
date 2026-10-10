# Break-it: regional & hierarchy — THIRD PASS, 2026-10-10 (target 14)

Verdict: **BROKE + FIXED** — 4 engine catches (2 exploits, 1 exploit-shaped honesty hole, 1 softlock/honesty), all fixed. Proof: `scripts/test-hier-break3-20261010.js`, 84/84 × 3 seeds (20261010, 7, 99). Prior pass suite still 35/35 — no regressions.

Canon note: still **no dedicated regional/hierarchy canon doc** in docs/ — the design rules live in `src/js/hierarchy.js`'s @ontology header (read as canon per brief). Nothing invented; all four fixes implement the header's own stated rules ("the graph remembers", "tribute is real", "the moment is played").

## CATCH 1 — RE-LINK ARREARS RESET (exploit)
Rack up arrears, breakLink, re-form the link: **the debt vanished** — new link, arrears 0, trust 30. The ontology says "broken links stay in history" but the engine forgot the ledger. Measured: 8,000 kcal arrears → severed → re-link → 0.
Fix: `_formLink` inherits the latest broken link's outstanding arrears when the new link matches the same pair (either direction), and says so aloud: "Old debts don't die with the old table — Ashford remembers the 8,000 kcal owed. It rides with the new link." Clean breaks re-link clean; other villages don't inherit a stranger's debt. (Design call, documented in code — no canon doc to consult.)

## CATCH 2 — THE FLIP'S SILENT FORGIVENESS (exploit-shaped honesty)
`bidForPrimacy`'s table-turn zeroed `link.arrears` without a word: refuse tribute for weeks, then flip primacy at trust 60+ and the debt burns invisibly. Mechanically defensible (the new primary writes the books), but silent forgiveness is an exploit-shaped honesty hole.
Fix: engine keeps the reset, the copy now announces it — "The old books burn — the 8,000 kcal Haven owed dies with the old table. Nobody mentions it. Everybody knows." + link-history note. Post-flip engine consistency verified: `payTribute` refuses (we're the primary now).

## CATCH 3 — "THE PANTRY GROWS" WAS A LIE (honesty)
`linkTick`'s our-subordinate branch said `"<name> paid. The pantry grows."` but added **zero kcal** to the pantry. Tribute is supposed to be real food (the metabolism system makes it REAL).
Fix: payment arrives as a real spoil-dated pantry item (`Tribute grain from Ashford`, tributeKcalPerWeek kcal, spoilDay +21) and a ~35% say line keeps it narrated without spam. Measured: 4,000 kcal/week now lands in the pantry.

## CATCH 4 — THE REGIONAL DAWN COULD DIE SILENTLY (softlock + honesty)
If the first link broke before the accord was answered, `answerAccord` returned null and cleared `pendingAccord` **without a word** — `networkLive` stayed true, so the played moment was lost forever. The flagship "player FEELS the moment" beat had a dead-end state.
Fix: the dead accord is said aloud ("The first gesture dies unmade…"), sets `accordUnanswered`, and `_formLink` restages `stageFirstAccord` on the next link. Normal flow verified: answered accord → second link stages nothing (still exactly once when honored).

## HELD (attacked, resisted — documented, not fixed)
- Renegotiate/bid terms genuinely apply: renegotiation writes the new tribute onto the link and the next tick charges the true shortfall; bid 'terms' halves; flip swaps primary/subordinate for real.
- Sweeten won "at YOUR terms" = the original proposal's terms (Haven primary, original tribute) — verified, not the counter's terms.
- Demand cycles don't escalate: three refusals = trust floored, link survives. Engine memory is trust-only ("remembered longer than payments" is copy aspiration — noted, not fixed; no canon demands escalation).
- Succession crises compound as the copy says (4000→6000→9000, 'shaken'); trust <20 snaps the link as designed.
- Negative-kcal payTribute is a no-op (engine clamps via need>0 loop).
- proveWorth is wrong-side safe; representative() null paths handled (visit→"go yourself", aid→+3 with honest copy).
- Dead code: all 26 provided functions exist, callable, each with a call site; ontology header gained 4 new rules (debts_survive_the_break, the_table_burns_the_books, tribute_is_real_food, the_moment_survives); validator green (52 systems).
- "Coalition tax" (brief wording): **no such system exists** in hierarchy.js — the phrase maps to the social-layer coalition building (`askSupport`, game.js), not the hierarchy engine. Terminology note, not a bug.
- Sibling sweep (membership.js, deeper than the prior alliance/guestMeal check): memberReputationAbroad severed path (-10) holds; loan clears when the loaned id is gone abroad (no strand, no crash); remote-application double-accept is a no-op with one arrival; aid-demand extension while loaned to the same fire extends 12→15 (honest). No sibling fixes needed.
