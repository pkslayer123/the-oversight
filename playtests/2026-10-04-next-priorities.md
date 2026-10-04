# Next Priorities Analysis — The Scattering (2026-10-04)

**Method:** Read all design docs (VISION, DESIGN, DECISIONS, DIRECTIVES, BALANCING, OPEN-QUESTIONS, ROADMAP, CONTENT, ITEMS, ARCHITECTURE) + all playtest reports through round 7. Checked implementation state directly against `src/data/*.json` and `src/js/game.js` / `src/js/engine/*`.

**What recent work finished:** The last week was bug-fix and systems-integrity work — ability acquisition flow, time economy, trust caps, dynamic carry, week-1 hooks, map generation, validation gate. That layer is now solid: 20+ sims per round, 0 crashes, 0 negative-value violations across ~7 rounds. The foundation is trustworthy.

**The pattern of what's missing:** The *frameworks* are built but the *content wiring* is thin. Three big design-doc systems exist as data or stubs but don't actually do anything in the game yet. These are the three highest-value items.

---

## #1 — Make all 60 abilities mechanically real (effects long tail)

**What:** 41 of 60 abilities are narrative-only. The System offers them with exciting descriptions; they do nothing when equipped. Additionally, 12 abilities have declarative `modifiers` (e.g. `hunt.find_chance ×1.4`, `food.spoilage_days ×1.5`) whose targets are **never read by any game code** — `grep` across `src/js/` shows 0 references to all 13 modifier targets. The declarative modifier pipeline is dead on arrival: it looks done, but it's decoration.

Only ~8 abilities actually work: the 6 hand-wired in game code (green_thumb, tracker, diplomat, camp_cook, generous, scrounger), pack_rat/hoarder (carryCapacity), and patient_aim (combat.js). The rest — including the entire wacky/vile/body-horror/risky/overpowered tier system Steve specifically asked for ("the ability pool should reach as far into weirdness as the twisted line animals") — are promises without mechanics.

**Why it matters:** This is the game's core progression fantasy. The System arrival is the biggest moment in Book 1/2; if 2 of your 3 offered abilities are decorative, the reality-show framing collapses. Steve's directive is explicit: *"Every ability must have a use, even if weak, bizarre, vile, or dangerous."* Right now most of them have no use at all. It's also the highest player-visibility gap — every player sees the offer screen.

**How (spec):**
1. Audit all 41 narrative-only + 12 dead-modifier abilities. Define one mechanical effect per ability. Passive effects → declarative modifier with a real target; active/weird effects (photosynthesis, chitin_skin, molt, thief) → a `useAbility()` path with kcal costs.
2. Resurrect the modifier pipeline: add `getModifier(target)` call sites in the engine where the targets belong — `food.spoilage_days` in the spoilage calc, `hunt.find_chance` in huntAnimal, `travel.encounter_chance` in travelTo, `food.poison_chance` in eat(), `forage.id_difficulty_bonus` in the ID system, `combat.bonus_actions` in combat rounds, etc. Delete or fix any target that has no honest home (don't keep decorative targets).
3. Wire the weird ones by hand where data can't express them — the weirdness is the point; don't flatten it into multipliers. E.g. `molt`: shed skin, heal 20 HP, lose 1 day of kcal; `thief`: steal from a villager's pack, trust consequences.
4. Verify: targeted mechanical test per ability (did the number move?) + a sim round confirming each ability fires in live play.

**Estimate:** 1–2 agent-days. Well-bounded (~53 small wiring tasks). Parallelizable: split by pool (fieldcraft/care/craft vs combat/system) across 2–3 agents. **Do together with #2** — you're editing every ability entry anyway.

---

## #2 — Power costs: make "conservation of energy" real (metabolic data, not name-sniffing)

**What:** `metabolicMult()` currently determines an ability's hunger cost by checking whether its *name contains the string "fire" or "god"*. No ability in `abilities.json` declares a metabolic cost — the field doesn't exist (checked: zero abilities have any metabolic key). The code even carries the TODO: *"Abilities don't have tiers yet — infer from name."* (Tiers now exist in the schema from the validation fix, but they're flavor tiers — utility/wacky/vile — not cost tiers.)

So the 5 overpowered-tier abilities, 6 body-horror, 5 risky — the abilities most likely to break the survival thesis — are currently **free power**. Steve's power-design test, *"Does this let you skip dinner?"*, is unenforced for everything except abilities whose names happen to match two substrings.

**Why it matters:** This is the guardrail the entire "broken builds" philosophy rests on. Steve: *"I love the broken builds component of roguelites"* — but the design decision that makes broken builds safe is that *"the hunger tax always applies"* and *"Power is a trade, not a tax."* Right now there is no tax and no trade; it's just free. A player who stacks overpowered abilities gets the unfair dimension without paying the food dimension, which is exactly the failure mode the design docs warn about. It's also a one-line-of-defense problem: the moment abilities get real effects (#1), the absence of costs becomes actively game-breaking rather than merely theoretical.

**How (spec):**
1. Add `metabolic` (daily-need multiplier, e.g. 1.0 / 1.5 / 2.0 / 4.0) to the ability schema. Populate during the #1 audit: overpowered and strong body-horror/risky abilities get real costs; utility abilities stay near 1.0. Rule per Steve: *cost must pair with a visible benefit* — never a pure tax.
2. `metabolicMult()` reads the field (max or stacked per the trade principle — recommend max-of-held to keep it legible, or additive if stacking is the intended "fire god eats 4 villages" fantasy; pick one and document it).
3. Surface the cost in the System offer UI: "FIRE GOD — daily need ×4 while held." The System should be *delighted* about this ("A growing boy needs his calories!").
4. Verify with sims: a max-metabolic build survives only when it can feed the multiplier; confirm the cost actually bites (starvation spiral engages) rather than being absorbable.

**Estimate:** Half an agent-day on its own; near-zero marginal cost if done inside #1's ability audit. **Recommend: merge #1 and #2 into one workstream, "make abilities real" (effects + costs).**

---

## #3 — Relic bonding: implement the Five Items + bond system

**What:** The gear progression system from docs/ITEMS.md and the 2026-10-03 "Relic bonding" decision does not exist in game code. `grep "bond" src/js/game.js` returns nothing. What exists: `src/data/relicEnhancements.json` (9 enhancements with System commentary), schema + validator support, and villagers carrying 3 items (not the specified 5). The design: your 5 personal items accrue bond through use/care; at thresholds 10/25/50 the System offers "optimization" (pick 1 of 3 enhancements per object class); bond is non-transferable — a bonded relic in a stranger's hands is just stuff ("Previous attachment data: [REDACTED]. Please form your own attachment.").

**Why it matters:** This is the game's gear system — Steve's explicit replacement for loot drops (*"arsenals are grown, not found"*). Right now gear progression is absent: items are stat sticks with no growth arc. It's also where the System's voice is funniest and most on-brand (earnest-alien commentary on human sentimentality — "the most valuable output it can't generate"), and all of that writing is sitting unused in the JSON. For a game whose thesis is "knowledge and attachment beat stuff," the attachment-to-stuff system being unimplemented is a conspicuous hole.

**How (spec):**
1. Onboarding: five-items pick. Per the day-zero revision, derive suggestions from backstory with tap-to-swap from the catalog (agency without a shopping trip).
2. Bond accrual: passive, 1/day of meaningful use — tool used, clothing worn, sentimental kept + story moments (carried through a crisis, used to save someone). No grind; simplicity doctrine applies.
3. Threshold offers at 10/25/50: System interrupts with pick-1-of-3 enhancement, drawn from per-class pools in relicEnhancements.json, with the existing systemCommentary. This is a ceremony moment — make it feel like one.
4. Non-transferability: scavenged/taken items keep base effects only; enhancements don't transfer. Show the provenance note.
5. Verify with sims: bond accrues at the intended rate, offers fire at thresholds, enhancements apply mechanically, stolen items lose their bond.

**Estimate:** 1 agent-day. Data and schema exist; it's wiring + the offer-flow UI + accrual hooks.

---

## Explicitly NOT in the top 3

- **Save across sessions:** blocked. Static artifacts prohibit durable browser storage; the builder confirmed this requires a server-backed rebuild. Steve declined the fullstack rebuild on 2026-10-04. Out of scope until he reopens it.
- **Travel not advancing time** (round 5 open item): a real design question — calorie-rich players can cross the map in one day-part — but it's a "should it?" for Steve, not implementation work. Flag for his call; don't implement unilaterally.
- **Hunter death spiral** (round 5 open item): bots hunting themselves to death at 100 kcal/attempt. Plausibly correct — hunting is a gamble and a human stops sooner. Not a bug until a human playtest says so.
- **More monsters / combat depth / Book 3+ story:** combat works, monsters wander the detail grid, other villages sim. These are content volume, and content volume should follow the mechanical foundation (#1–#3), not precede it.
- **Visual stages:** per OPEN-QUESTIONS, art investment follows validated interest. Not yet.

## Suggested sequencing

1. **Workstream A — "Make abilities real"** (#1 + #2 together): audit all 60 abilities, wire effects, populate metabolic costs, resurrect the modifier pipeline, sim-verify each one. 1.5–2 agent-days, parallelizable.
2. **Workstream B — "Relic bonding"** (#3): five-items onboarding, bond accrual, threshold offers, non-transferability. 1 agent-day. Can start in parallel with A (different code paths).
3. Rebuild + a full sim round (25+ runs) against the combined build, then phone playtest.
