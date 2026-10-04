# Social Systems Playtest — Language Barriers + Deep Conflicts
**Date:** 2026-10-04
**Method:** Node harness, targeted mechanical tests + 14-day simulations
**Commit:** e6579a3

## Verdict: Everything works. Pacing feels right.

Both social systems (language barriers, deep conflicts) are mechanically sound, properly gated, and paced for slow discovery. No crashes, no broken logic found.

---

## Language Barriers

### Distribution (10 villages, 50 NPCs)
- **44.0% have language barriers** — matches the ~45% design target exactly
- Breakdown: 11 partial (a few words of English), 5 none (no English), 6 bilingual (non-English native but fluent)
- Per-village range: 1-4 out of 5 NPCs. Every village has at least one barrier NPC; no village is all-barrier.

### Trust gain rates (commLevel)
| Level | Multiplier | Measured gain | Status |
|-------|-----------|---------------|--------|
| full | 1.0× | 6 | ✅ baseline |
| partial | 0.5× | 3 | ✅ exactly halved |
| none | 0.25× | 2 | ✅ quarter (rounds up from 1.5) |

The relative multipliers are exactly correct. (Absolute base of 6 vs 3 comes from character background bonuses — legitimate.)

### Discovery
- Barrier is **discovered on first conversation**, never listed beforehand ✅
- Message: *"...and then it lands: Alba doesn't speak English. A few words. Gestures. Patience. (🇪🇸 Spanish)"*
- Not repeated on subsequent talks ✅
- 35% misunderstanding lines fire for none-level (random, verified present in code)

### teachPlant gating
- **No shared language → blocked.** *"Rafael tries — gestures, dirt drawings, growing frustration. The words aren't there."* ✅
- **Partial language → downgraded.** No instant unlock; gives 1 encounter credit instead. *"Hank tries to explain. 'It looks... a bit like that?' You're not sure."* ✅
- **Full language → works normally** (instant unlock for good teachers) ✅

---

## Deep Conflicts

### Generation (10 villages)
- **1-2 conflicts per village** ✅ (distribution: 1,1,1,1,2,1,2,2,2,2)
- **All start hidden** (`known: false`) ✅
- old_wound: 11, friction: 4 — skewed toward old_wound because random heritages usually differ. Acceptable; the "deep history" is the more interesting type.

### Reveal pacing (5 villages × 14 days, talking to conflict parties daily)
- Revealed on days: 3, 3, 4, 6, 6, 8
- **Pacing feels right.** Not day 1, not day 14. Spread across the first week. The 12%/day base rate (+ talk bonus) creates natural variance — one village revealed both by day 4 (fast but you were actively engaging them), another took until day 8.
- Steve's "savor slowly" directive is honored: you won't trip over every conflict immediately.

### Incidents (10 forced fires)
- **4 unique variants**, all working:
  - Sharp quiet argument that stops when you approach (tension +5)
  - "Don't share your haul with [other]" — trust +2/-2 split
  - Eating apart, fire feels smaller (atmospheric, no mechanical change)
  - Carrying an unkind message (trust +2/-3, tension +3)
- 10%/day fire rate when known + tense. In the 14-day sim: 4 incidents across ~2 conflicts. Feels present without being spammy.

### Favoritism
- **Works.** Talking to A at trust 55 → B drops from 10 to 8 (-2). ✅
- Message differs by awareness: known conflict → *"Old history has long eyes. (-2 trust)"*; unknown → *"[Name] has been colder to you lately. You don't know why."* ✅
- **Design note:** Favoritism requires trust ≥50, but talking caps at 40. You need real actions (food gifts, etc.) to get that close. This is intentional — casual chatting doesn't trigger tribal politics. Correct.

### History unfolding (old_wound stages)
- **Stage 0→1 at trust 45:** *"Their peoples have history — [heritageA] and [heritageB]. The kind measured in generations, not arguments."* ✅
- **Stage 1→2 at trust 70:** *"Something about [grievance]. Ask directly and the conversation ends."* ✅
- **May never complete** — if you never get that close, you never learn why. As designed.
- **Design note:** Like favoritism, history requires trust beyond talk's 40 cap. You earn the story through actions, not conversation spam. This is the right call.

### Mediation
- **Works.** Trust 60/60 both sides → resolved. *"Peter nodded at Dmitri today. First time. Whatever it was, it's loosening. Haven breathes easier."* ✅
- Tension drops to 0, conflict marked resolved, no more incidents.
- Threshold (55+) is reachable but requires real investment in both parties — which is harder when they hate each other and favoritism punishes closeness with one side. Nice tension.

---

## Pacing Assessment

**Too fast? Too slow? Neither. It feels right.**

- Days 1-2: You meet people, discover language barriers. No conflicts visible.
- Days 3-8: Conflicts surface one by one. Incidents start. You're piecing together who's who.
- Days 8+: If you've invested (food, help, actions), histories unfold. Mediation becomes possible.
- Some runs: you never learn why. That's fine.

The systems respect Steve's "savored, not solved" directive. Nothing hits all at once. The 12%/day reveal rate, 10%/day incident rate, and trust-gated history stages create a natural slow burn.

---

## Issues Found

**None.** No bugs, no crashes, no broken logic across all tests.

### Minor observations (not bugs)
1. **old_wound:friction ratio (11:4)** is skewed toward deep conflicts. If Steve wants more petty friction, the heritage-matching could be tuned. But old wounds are more interesting — I'd leave it.
2. **History/favoritism/mediation all require trust >40**, which requires non-talk actions. This is intentional design ("words only go so far"), but it means talk-heavy players will see reveals and incidents without ever unlocking the deeper layers. That's probably correct — it rewards becoming a real community member.
3. **Misunderstanding lines (35%)** weren't directly observed in testing (random), but the code path is verified present and the trust mechanics around it work.

---

## Test Artifacts
- `/tmp/social-test.js` — distribution, commLevel, teachPlant, generation, 14-day sim
- `/tmp/social-test2.js` — none-level rate, favoritism, history, pacing, discovery, incidents
