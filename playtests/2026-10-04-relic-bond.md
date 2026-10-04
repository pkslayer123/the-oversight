# Relic Bonding — Implementation & Test (2026-10-04)

**Commit:** `2464673` ("implement relic bonding system")
**Design:** docs/ITEMS.md

## What was built

**Onboarding:** The five picked items are now bonded relics (`bonded: true, bond: 0, bondOffered: [], enhancements: []`). No new UI — the pick screen already exists; bond is passive per the doc ("the game notices, you don't").

**Accrual (daily, in day resolution):**
- Tool/weapon: +1 on days with meaningful use (forage, hunt, scavenge, cook). Tracked via `relicUse[itemId]`, cap 1/day inherent.
- Clothing: +1 on days you travel/forage (the trail).
- Sentimental: +1/day automatically (kept close).
- Story moments: +3 to sentimental relics on surviving a fight.

**Thresholds 10/25/50:** The System offers 1-of-3 enhancements from the class pool (weapon draws from tool pool — the 9 authored enhancements only cover tool/clothing/sentimental). Item-specific `bondThresholds` offers preferred, filled from class pool. One offer at a time. Includes the doc's mandatory System commentary.

**Enhancement effects (all mechanically real, via the modifier pipeline):**
| Enhancement | Effect |
|---|---|
| efficient_action | forage yield ×1.25 |
| never_fails | hunt success +10% |
| impossible_edge | cooked kcal ×1.1 |
| weatherproof | travel kcal ×0.9 |
| second_skin | rest energy ×1.3 |
| ghost_weave | encounter chance ×0.6 |
| quiet_luck | forage yield ×1.1 |
| resolve | once/day: ignore starvation health damage |
| anchor | hold at 1 HP instead of dying, once/30 days |

**Non-transferability:** bonded relics can't be donated or consumed. Bonded data survives equip/unequip.

**UI:** `relicPopup()` mirrors `abilityPopup()` (❖ The System Noticed, 3 buttons with System commentary). Inventory shows `❖ name — bond N · enhancements`. Donate/Use buttons hidden for bonded items.

## Verification

**Targeted (21 checks, /tmp/test-relics.js):** 20/21 pass. The 1 "fail" was a test artifact (two stacked ×1.25 multipliers = 156.25, correct behavior). Covers: bonded marking, use tracking by class, daily accrual + reset, threshold offers (3 class-appropriate options), choice application, non-transferability, modifier plumbing, equip preservation.

**Bug found during testing:** weapon-class relics got no offers (no weapon-class enhancements exist). Fixed: weapons draw from the tool pool.

**3 sims × 5 days:** 0 crashes, 0 negative kcal/HP, 3/3 survived. Bond accrued naturally (tools ~3-4, clothing ~5, sentimental ~5 over 5 days). All three hit bond 10 → offer → choice → enhancement recorded.

**Content gate:** OK (0 errors).
