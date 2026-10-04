# Feature Playtest: Character Creation + Location Selection
**Date:** 2026-10-04
**Method:** Node harness at commit `e6579a3`. 23 mechanical checks + qualitative review of generated content + UI code audit.
**Report:** `playtests/2026-10-04-feat-character.md`

## Verdict: 22/23 checks pass. The system works. Two real gaps found.

---

## What works

### Location selection (6/6)
- 10 expeditions → each offers exactly 3 locations, always distinct archetypes
- All 8 archetypes appeared across 30 picks (good distribution)
- All 7 genMap params vary meaningfully across locations
- **Maps genuinely differ:** creek_bottom generated 17 creek + 12 grove tiles; old_suburb generated 23 forest_floor + 4 grove; ridgeline generated 25 forest_floor + 6 thicket
- old_suburb is correctly scavenger-tuned (loot×1.6, ruin≤2); creek_bottom is forage-tuned (stock×1.25)

### Roster generation (8/8)
- 6 fresh characters per expedition, every time
- **60/60 unique names** across 10 expeditions (no repeats)
- 15 occupations seen (full variety)
- Each character has: backstory (>20 chars), personality (temperament/sharing/curiosity), languages, 8 item candidates, 3+ talk lines, secret fear, System assessment

### Origin parsing (4/4)
- "Arizona" → [arizona, southwest, desert] → **stranger** (1 starting plant)
- "Ohio" → [ohio, midwest, temperate, woodlands] → **local** (3 starting plants)
- "rural France" → [france, temperate, rural] → stranger (correct — unfamiliar)
- Empty input → "somewhere unremembered" → stranger (graceful fallback)
- Familiarity tier **mechanically changes** starting codex, not just flavor
- Stranger message: "Nothing here looks like home. You know none of these plants. Learn fast."

### Item candidates (1/2 — see gap)
- 8 candidates per character, occupation bias works (ER nurse: 5/8 biased items)
- Class distribution correct (2 tool / 1 weapon / 2 clothing / 2 sentimental / 1 wild card)

### Three characters × 3 days (3/3)
- Grace Baker (hunting guide): game_sense + patient_aim, steady/generous
- Lena Fischer (ER nurse): triage + steady_hands, cautious/selfish
- Ibrahim Delgado (farmer): preservation_instinct, steady/generous
- All survived 3 days, no crashes. Different abilities, different personalities.

### Secret evolutions
- 4 secret evolutions exist (daughters_drawing→her_handwriting, etc.)
- Correctly flagged `secret: true`, excluded from normal enhancement pool
- 65% roll at bond 50, offered as unnamed "???" option with System going quiet
- **0 leaks** into the normal pool (verified)

### Onboarding UI (code audit)
Complete 4-screen flow in `app.js`:
1. "Where are you from?" → free text input
2. "WHERE DID YOU WAKE UP?" → 3 location cards (name, tagline, description, hazard warning)
3. "WHICH ONE IS YOU?" → 6 character cards (backstory, personality, System assessment)
4. "WHAT DID YOU GRAB?" → pick 5 from 8 items

---

## What's broken / gaps

### 🔴 GAP 1: Major world cities don't parse
- "Tokyo" → **zero tags** → stranger (safe fallback, but wrong)
- "London" → **zero tags** → stranger
- "Japan" works, but "Tokyo" doesn't. "France" works, "Paris" doesn't.
- 76 keywords cover US states + some countries + 3 US cities (chicago, houston, new york)
- **Impact:** International players typing their actual city get no region tags. The stranger fallback is safe, but we're losing the "oh, you're from a similar climate" moments for huge population centers.
- **Fix:** Add ~20 major world city → country mappings (tokyo→japan, london→uk, paris→france, berlin→germany, seoul→korea, etc.)

### 🟡 GAP 2: Language/talk incoherence
- NPC with `english: 0` (e.g., Wren the interpreter, native mandarin) still has fluent English talk lines
- "Back home I was interpreter. Doesn't mean much now, does it?"
- If they can't speak English, their dialogue should reflect it — broken English, noted as translated, or replaced with gesture descriptions
- **Fix:** Filter or transform talk templates by english fluency level

### ⚪ Non-issue: T20 "failure"
- Wild card drew a weapon → distribution was 2/2/2/2 instead of expected 2/1/2/2/1
- This is **correct behavior** (wild card is supposed to be random). Test was too strict.

---

## What feels flat

### Template repetition
- "Back home I was [occupation]. Doesn't mean much now, does it? Means something. Just not much." appeared verbatim for 2 of 3 sampled characters
- Talk template pool is too small — players will notice repeats within a single roster of 6
- **Suggestion:** 3-4x more talk templates, or occupation-specific openers

### System assessments are formulaic
- "Zoe reads as steady and selfish with strangers. The System finds this notable."
- Only 3 variants for the final word (sensible / entertaining / notable)
- The System is supposed to be a character — this reads as Mad Libs
- **Suggestion:** More varied System voice, ideally reacting to specific occupation+personality combos

### "Feel different" needs human testing
- My bots just foraged for 3 days. Stats differ (abilities, knowledge, personality), but I can't evaluate whether *playing* them feels different
- The mechanical hooks are all there (different starting knowledge, different abilities, different languages). Whether it *lands* emotionally needs Steve's playtest.

---

## Test artifacts
- Harness: `/tmp/feat-character-test.js`
- Results JSON: `/tmp/feat-character-results.json`
- 22/23 mechanical checks passed
