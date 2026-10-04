# Knowledge / Foraging / Codex Playtest — 2026-10-04

**Method:** Node harness driving the real game code (commit `e6579a3`). Tested: zero-knowledge foraging, L1/L2/L3 progression, lookalike mechanics, teaching both directions, books, seasons, Codex UI data. 13 targeted checks + deep-dives + 5-day learning simulation.

**Verdict: the knowledge system has good bones but the core discovery loop is broken.** The single biggest issue: the game tells you every plant's name on first sight, which bypasses the entire identification system.

---

## What's broken

### 🔴 CRITICAL: The name leak — identification system is bypassed

`src/js/engine/forage.js` says on first find:
> "New plant recorded: **Dandelion**. The Codex grows."

And `doAction` appends the **full codex entry**:
```js
msg = r.message + `...` + (r.firstFind ? ` (${r.plant.codex})` : '');
```

So the player sees BOTH of these in sequence:
1. "You take *a plant with jagged leaves*... Not sure what it is yet. (1/3)"
2. "New plant recorded: **Dandelion**. The Codex grows. (...kcal to your pack.) (**Every part is edible — leaves, flowers, roots. Bitter means nutritious...**)"

The second message gives away the name AND the complete codex description on the very first encounter. The encounter/threshold/L1 system is pure theater — the player already knows everything. Inventory also uses the real name (`name: r.plant.name`).

**Fix:** forage engine should return an unidentified descriptor until L1 is granted. The `firstFind` message should say something like "New plant recorded: *unknown green* — 3 encounters to identify." The codex text must not be appended until identified.

### 🟡 L4 exists in data, nothing grants it

All 25 plants define `knowledgeLevels['4']` (mastery text, e.g. "harvest roots in fall, leaves in spring... 2x yield"). Zero code paths grant L4. Dead content. Either wire it (e.g., 10 tastings + seasonal observation) or cut it from data.

### 🟡 No misidentification mechanic

21/25 plants have `lookalikeNote` text (good content — ramps vs lily-of-the-valley, purslane vs spurge, red vs white sumac). But these are **text warnings only**. There is no mechanic where you can actually mistake one plant for another. The forage engine always returns the true `plantId`. The fear/tension Steve wants from lookalikes doesn't exist mechanically.

The poison system (`food.poison_chance`, 20% on `safe:false`) is generic — it's not tied to misidentification.

### 🟡 Player can't teach villagers

Design says "villagers teach the player and vice versa." `village.taught[vid]` is set **only at init** — there is no function for the player to teach a villager a new plant. One-directional.

### 🟡 Seasons are data-only

25/25 plants have `seasons` arrays. **Zero game logic reads them.** No season system exists. The L4 text even references seasons ("harvest roots in fall") for a system that doesn't exist.

### 🟡 Codex UI shows no progression

`codexEntries()` returns `{name, kcal, unit, prep, text}` — no level, no encounter count, no progress toward next level. The Codex screen is a flat list. There's no visual satisfaction of filling it in: no "L2", no "2/3 encounters", no completion percentage.

---

## What works

- **L1/L2/L3 mechanical progression is sound.** Encounters (threshold 2-4 by occupation) → L1 name. 5 harvests → L2 parts (+50% yield). 3 tastings via `eat()` → L3 uses (+5 health). Verified each transition fires.
- **Regional familiarity works.** Arizona stranger started with 1 plant; the system correctly gates starting knowledge by origin vs. plant regions. The "learn fast" warning fires.
- **Occupation affects learning speed.** Hunter/cook learn in 2 encounters, office workers in 4. Verified in code.
- **Teaching has nuance.** Good teacher (relevant occupation + trust>40 + full shared language) = instant L1. Otherwise partial (+1 encounter). Language gating works — no shared words = no teaching, with appropriate flavor text.
- **Books are treasure.** 4 books, 10% in ruins, unlock 2-5 plants at levels 1-3 plus recipes. Verified: reading "Field Guide" went 2→4 plants.
- **Poison on unsafe food works.** 20% base chance, -5 health, symbiote warns.

---

## Does learning feel rewarding or tedious?

**Currently: neither — it's invisible.** The name leak means there's no discovery moment. You don't go from "unknown green" to "Dandelion!" — you just... already know. The L1/L2/L3 transitions fire mechanically (yield goes up, health bonus appears) but the *player experience* of learning is absent because the information was free.

**Pace** (if the leak were fixed): 15 forages over 5 days → 1 new plant identified, 6 more at 1-2 encounters. That's slow but not unreasonable for a survival game — *if* each identification felt like an event. Right now it wouldn't, because:
1. The Codex UI doesn't celebrate it (no level badge, no progress bar, no "NEW!" moment)
2. The identification message ("You know this now. Dandelion.") is a single line in the log

**To make it rewarding:**
1. Fix the name leak (prerequisite for everything)
2. Codex UI: show levels, show encounter progress (●●○), show completion % — make it feel like filling a collection
3. Make L1/L2/L3 transitions *events* — the System noticing, the Codex getting excited, not just a log line
4. Wire L4 or cut it
5. Consider a real misidentification risk for lookalikes (even a small chance) — that's where the fear lives

---

## Check results: 6/13 passed

| Check | Result |
|---|---|
| L1 after 3 encounters | PASS |
| L2 after 5 harvests | PASS |
| L3 after 3 tastings | PASS |
| L4 has code path | **FAIL** — data only |
| Plants have lookalike notes (21/25) | PASS |
| Misidentification mechanic exists | **FAIL** — text only |
| Eating unsafe food can poison | PASS |
| teachPlant grants knowledge | **FAIL** — see note |
| Player can teach villagers | **FAIL** — init only |
| Book unlocks knowledge chunk | PASS |
| Season system affects foraging | **FAIL** — no season logic |
| Codex entries show level | **FAIL** — omitted |
| Codex shows encounter progress | **FAIL** — omitted |

**Note on teachPlant:** the "FAIL" was a test artifact — the teacher had partial comms, so correctly gave partial (+1 encounter) instead of full L1. The mechanic works as designed. However: good teaching (instant L1) requires cook/hunter occupation + trust>40 + full shared language simultaneously, which is rare in practice. Most teaching will be partial. This may be intentional (slow trust-building) but worth tuning.
