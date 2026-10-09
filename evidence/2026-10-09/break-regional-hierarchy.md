# BREAK-IT run 2026-10-09 — target 14: REGIONAL & HIERARCHY

Worker: break-region14. Canon: there is NO docs/REGIONAL.md — per the task,
Steve's design for this system lives in docs/CANON.md (manifest only) plus the
@ontology headers and design comments at the top of src/js/hierarchy.js and
src/js/membership.js. No canon was invented; all fixes follow the headers'
stated rules.

## Verdict: BROKE + FIXED (6 breaks, 5 held)

## Breaks found and fixed

### B1. Tribute partial double-count (EXPLOIT-adjacent, HONESTY)
`payTribute` added `(owed - paid)` to arrears on a short payment, and
`linkTick` then added the FULL `tributeKcalPerWeek` on top at week-end.
Paying half the tribute was strictly worse than paying nothing (1.5× owed
vs 1× owed in arrears) — the dominant strategy was never to partially pay.
**Fix:** the week's payments accumulate in `link.tributePaidKcal`
(reset per week); `linkTick` charges the true shortfall exactly once.
A settled week stays settled. Proven B1a–B1j.

### B2. Free +8 trust on empty hands (EXPLOIT + HONESTY)
`answerDemand(linkId, true)` on a tribute demand granted the full +8 trust
even when the pantry was empty and 0 kcal moved — narrated as "It hurts."
An empty pantry was a free-trust button on every demand (~20%/week/link).
**Fix:** honor is proportional — `trust += round(8 * paid/want)`, honest copy
("You send X of Y kcal — all the pantry holds"), the gap becomes arrears,
opinion -2. Proven B2a–B2h.

### B2b/c. Loaned-representative clobbering (SOFTLOCK-adjacent state loss)
`answerDemand` 'aid' and `answerAccord` 'visit' both did `m.loaned = {...}`
unconditionally — an in-flight loan was silently erased (the person was
"away" but the record said only the new loan; the first return never fired).
Also, honoring an aid demand with NO representative granted +8 silently.
**Fix:** if already loaned to the same primary, extend `untilDay` (+4 trust,
"they stay on"); if loaned elsewhere, send word (+3); if nobody to send,
+3 with honest copy. Proven B2i–B2r.

### B3. Same-session renegotiation grind (EXPLOIT)
`renegotiateLink`/`bidForPrimacy` had no pacing: tribute ground to the 500
floor in one sitting, trust bought back with deeds. Each round cost only
trust, and trust is re-farmable.
**Fix:** the table is a weekly verb — `link.lastTableWeek` shared by both;
one hard conversation per week, matching the tribute cadence. The climb is
paced in weeks, not ground out in an afternoon. Proven B3a–B3f.

### B4. Guest meal burned ally food at cap (HONESTY + economy)
`guestMeal` charged the ally's pantry 1,500 then served `min(cap, kcal+1500)`
— a full player burned 1,500 of the ally's food for +0 gain.
**Fix:** the pantry is charged exactly the serving (`min(1500, room)`); a
full player is turned away without spending ("come back hungry"), and the
day-slot is NOT burned. Proven B4a–B4g.

### B5. memberReputationAbroad was dead code with a lying comment (DEAD CODE)
In the @ontology provides list; its comment claimed "Used mechanically in
judgeApplication" — zero callers anywhere. The Alien-Players-class bug.
**Fix:** wired into the betrayal.js petition judgment ("We've heard about
Haven" is the reputation-abroad moment): a Haven member in good standing is
vouched for by the name (−10..+10); the severed carry the cut (−10).
Comment corrected. Proven B5a–B5c.

## Held (attacked, resisted)

- **H1. breakLink+relink farming:** relink after a gambit costs −30 opinion
  and the full courtship (join/study/deeds are once-per-village); each
  decline costs more opinion. The climb gets harder, not farmable.
- **H2. Negotiation thresholds honest:** verified with stubbed scores —
  ≥55 forms the link, 35–54 stages the played counter (accept/sweeten/walk),
  <35 declines. The ±10 RNG in judgeLink is judgment noise, damped by the
  −5 opinion cost per declined proposal (anti-scum).
- **H3. Regional Dawn cannot double-stage** (`networkLive` guard); a broken
  link's pending accord clears silently but safely.
- **H4. Succession:** `successionCrisis` snaps honestly at trust<20;
  `theirLeaderDied` fires from `linkTick`'s speaker watch when the sim kills
  the named speaker; empty rosters neither crash nor softlock.
- **H5. Dead-code sweep:** every @ontology-provided function in both modules
  has a live call site (UI buttons, the endDay→membershipDaily→hierarchyDaily
  chain, or internal calls). `membershipDaily` is NOT dead — it rides
  `G.endDay` via the wrap in membership.js.

## Observed, not changed (design calls)

- `_removePantryKcal` takes the LEAST-perishable food first (sorts by
  spoilDay ascending, draws from the end) while `pantryDraw` (village meals)
  prefers smallest/most-perishable first. For a tribute trek, preserved food
  is arguably the honest choice — left as a design call.
- `bidForPrimacy`'s terms path can halve tribute repeatedly across weeks
  (floor 500) — paced now by the weekly table lock; the 500 floor bounds it.

## Test notes

- `test-sibling-sweep.js` CLASS 2 was RED on clean HEAD (stale DEAD list:
  `formAlliance` was legitimately wired by the 2026-10-09 regional audit).
  Removed it from the DEAD list with a comment. Now 3/3.
- `test-hierarchy.js` bid-twice-in-one-week scenario updated for the weekly
  table lock (advance 7 days between bids). Now 42/42.
- `test-hierarchy-20261007.js` has a pre-existing harness crash
  (`temperament` of undefined at line 95) — fails identically on clean HEAD,
  stale since 2026-10-07; left alone.
- `test-regional-audit-20261009.js` V4g updated: the pantry is now charged
  the serving, not a flat 1,500 (old expectation encoded the B4 waste).

## Proof results

- `scripts/test-break-region14.js` (new): 67/67 across seeds 20261009, 7, 42.
- `scripts/test-regional-audit-20261009.js`: 78/78 × 3 seeds.
- `scripts/test-hierarchy.js`: 42/42. `scripts/test-village-membership.js`: 53/53.
- `node scripts/validate-ontology.js`: all 52 systems validated.

## Files changed

- src/js/hierarchy.js (fixes B1, B2, B2b/c, B3 + 3 ontology rules)
- src/js/membership.js (fix B4, B5 comment + 1 ontology rule)
- src/js/betrayal.js (B5: one-line petition-judgment wire)
- scripts/test-break-region14.js (new proof)
- scripts/test-regional-audit-20261009.js (V4g expectation → honest charging)
- scripts/test-hierarchy.js (weekly-table pacing in bid scenario)
- scripts/test-sibling-sweep.js (formAlliance off the stale DEAD list)
- docs/ONTOLOGY.md (regenerated by the validator)
