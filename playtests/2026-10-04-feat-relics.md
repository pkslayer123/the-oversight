# Relic Bonding & Hidden Evolutions — Playtest Report
**Date:** 2026-10-04 | **Commit:** e6579a3 | **Tester:** Muse (simulated)

## Summary: 30/31 checks pass. The system works. The secret evolutions are genuinely special.

Two of three "failures" were float-precision artifacts in my test assertions (110.00000000000001 ≈ 110 — mechanics correct). The third was my own harness bug (missing `noteToolUse()` call). All re-verified.

---

## What works

### Bond accrual (5/5)
- Scholar starts with exactly 5 bonded relics (tool/tool/weapon/clothing/clothing in test seed)
- Tools/weapons: +1/day with `noteToolUse()` (meaningful use)
- Sentimental: +1/day automatically (kept close)
- Clothing: +1/day with `noteTrailUse()` (on the trail)
- 30-day natural sim: tools hit bond 10 ~day 10-12, bond 25 ~day 25-27. Bond 50 is a ~50-day goal — appropriately long-term

### Threshold offers (6/6)
- Bond 10/25/50 each trigger exactly one offer
- 3 options per offer, no duplicates across thresholds
- One offer at a time (`!s.relicChoices` gate works — offers queue across days)
- Choosing records the enhancement, marks threshold offered, clears the choice state
- No repeat offers for the same threshold

### All 9 base enhancements are mechanically real (9/9)
Verified via modifier pipeline with exact values:
| Enhancement | Effect | Verified |
|---|---|---|
| efficient_action | forage yield ×1.25 | ✅ 100→125 |
| never_fails | hunt success +0.10 | ✅ 0.5→0.6 |
| impossible_edge | cook kcal ×1.10 | ✅ 100→110 |
| weatherproof | travel kcal ×0.9 | ✅ 100→90 |
| second_skin | rest energy ×1.3 | ✅ 100→130 |
| ghost_weave | travel encounter ×0.6 | ✅ 1→0.6 |
| quiet_luck | forage yield ×1.1 | ✅ 100→110 |
| resolve | ignore daily starvation damage (1/day) | ✅ special-cased game.js:4003 |
| anchor | hold at 1 HP instead of dying (1/30 days) | ✅ special-cased game.js:4011 |

All 7 modifier targets have real call sites in game code (forage.js, game.js). No dead targets.

### Secret evolutions (9/9)
- All 4 defined: `daughters_drawing`→`her_handwriting`, `grandfathers_knife`→`old_ghost`, `mothers_ring`→`inheritance`, `dead_phone`→`last_message`
- Appear only at bond 50: 0/20 early offers (bond 10/25) contained secrets
- Roll rate: 34/50 (68%) — matches the 65% design
- 4th "???" option with "Something is different about it. The System has gone quiet. That never happens."
- `secret: true` flag carried through; true name revealed only on choice
- Choosing records the evolution, marks bond-50 offered
- **0 leaks in 50 bond-50 checks** — secret IDs never appear in the normal 3-option pool

### Personality/playstyle weighting (2/2)
- Cautious temperament → `careful_hands`: 46/60 (77%) vs 19/60 (32%) baseline
- Bold playstyle (5+ signals) → `blood_remembers`: 49/60 (82%) vs 29/60 (48%) baseline
- `dominantPlaystyle()` correctly requires 3+ signals before presuming

### Non-transferability (2/2)
- `donateToPantry`: "That's yours. Not the village's. You can't give away your [item]." — item stays
- `useItem`: "You'd never use up your [item]. It's not a supply. It's yours." — not consumed

---

## Do the secret evolutions feel special?

Yes. The writing is the best in the game:

> **Her Handwriting:** "On the back, in wobbly letters: 'for when you are hungry i saved you some.' There are crumbs in the crease. You eat them. They taste like everything."
>
> System: *"[SYSTEM QUIET] We have no optimization for this. Take the day. Eat. We will watch, and we will not understand, and that is... acceptable."*

> **Old Ghost:** "Some mornings your hands move before you do — his grip, his angle, his patience. He's been dead for years. He's never been more useful."
>
> System: *"User motor patterns match archived profile: GRANDFATHER. Overlap 94%. We did not archive him. He archived himself. In you."*

The System going quiet is a real tonal break — the one entity that never shuts up goes silent. The "???" option with no telegraphing works because the player has invested 50 days into this item. The discovery *is* the reward, and the text delivers on it.

---

## Issues found

### Minor: relicPopup doesn't reflect the anomaly (polish)
When a secret evolution is offered, `game.js` says the "[ANOMALY]" line via `say()`, but `relicPopup()` in app.js always renders the standard "elevated attachment... inefficient... valuable?" header. The popup should go quiet too — different header, maybe no System commentary, just the "???" option sitting there. The tonal break deserves UI support.

### Minor: float precision in modifier resolve
`cook.kcal ×1.10` resolves to `110.00000000000001`. Harmless (rounds in display), but worth a `Math.round` at the resolve site if it ever surfaces in UI.

### Note: bond-50 pacing
At ~1 bond/day with consistent use, secret evolutions are a 50-day goal. That's a full expedition and then some. This feels right for "amazing hidden potential" — but worth confirming with real playtest length expectations. If expeditions typically run 30 days, most players will never see one.

---

## Harness notes
- Test file: `/tmp/relic-test.js` (31 checks)
- 3 "failures" were test artifacts, all re-verified as passing
- Natural 30-day sim: 7 offers, 0 crashes, 0 exceptions
- `CONTENT GATE: OK` throughout
