# Ability System Test — 10 Playthroughs (2026-10-03)

**Method:** Node harness loading `src/js/game.js` + engine files (same loader as `scripts/simulate.js`). 10 runs × 12 days (48 day parts), random characters, 6 playstyles (forager ×2, hunter ×2, talker, cook, donator, scavenger, mixed). Bots travel, forage, cook, donate, talk, hunt, eat, and drink via real game methods. Note: parent added ~17 abilities mid-test (43 → 60 total, 48 `system_offer`).

**Verdict: the ability system works end-to-end, but ability *effects* are narrative-only — none of the 48 system abilities change game math.**

## What works

- **System arrival fires** in 9/10 runs (the 10th died day 6, before day 7). `systemArrived=true`, timed events scheduled.
- **Ability choices match playstyle.** Foragers offered `green_thumb` (+1 wild); donator offered `generous`; cook offered `green_thumb`/`cannibal_frenzy`. Offer shape is 1–2 earned utility + 1 wild, per design.
- **Choosing works.** `chooseAbility()` equips, clears choices, announces with flavor text.
- **Slots gate correctly.** Integration 5 → 1 slot; a 2nd pick is refused with "No free ability slots"; integration 25 → 2 slots → pick succeeds.
- **Background abilities are separate.** Mara: triage/steady_hands; Jesse: game_sense/patient_aim; Aki: field_dressing/preservation_instinct. They don't consume System slots. Ruth/Theo/Priya have none.
- **XP and leveling work.** L1→L2 at 10 uses, L2→L3 at 25, hard cap at L3. Verified directly: 12 XP → L2 (2 carryover), +25 → L3, further XP ignored. Background abilities level too (triage L1→L2 at 10 XP).
- **Timed events all fire** (first_hunt d8, stranger d9, hushwolf_pack d10, system_task d12) in runs surviving to day 12+.
- **No crashes** across 10 runs, 0 errors.

## Bugs found

1. **`week1.hunt`, `week1.talk`, `week1.scavenge` are never incremented** (only forage/cook/donate have hooks). Consequence: `tracker`, `diplomat`, `scrounger` can **never be offered** — their thresholds are unreachable. Same for their XP: `gainAbilityXP` is only called for `green_thumb`, `camp_cook`, `generous`. The hunter/talker/scavenger playstyles the System claims to reward are unwinnable.
2. **Ability effects are narrative-only.** 0 of 48 `system_offer` abilities define `modifiers` in `abilities.json`. "Foraging yields +50%" / "+30% hunt" / "2x trust" change nothing mechanically. Worse, the plumbing that *would* apply them is incompatible with the new format:
   - `modifiers.collectModifiers` iterates `scholar.abilities` as string IDs; they're now objects → `byId[obj]` is undefined → silently no modifiers, even for the 12 legacy abilities that have them.
   - `metabolicMult(abilities)` does `data.abilities.find(a => a.id === aid)` with `aid` an object → never matches → 4x fire-god metabolism never triggers.
   - `combat.js:41` `(scholar.abilities||[]).includes('patient_aim')` → never true (objects now; also patient_aim moved to backgroundAbilities).
3. **Negative kcal / negative HP still possible.** `resolveDay` does `scholar.kcal -= need` with no floor. Observed: kcal −4810, hp −21/−17/−13/−16 at death. Death detection (`health <= 0`) still works, but the numbers are the previously-flagged bug resurfacing.
4. **Zero-action players get 1 random wild ability, not the 3-option fallback.** With all week1 counters at 0, `utility` is empty but `other` isn't, so choices = [1 random wild] (e.g. `beard_moss`, `hoarder`). The `survivor`/`wanderer`/`lucky_rock` fallback only triggers on a fully empty list, which can't happen while wild abilities exist. A player who does nothing gets one random (possibly vile) ability and no real choice.

## Balance / design notes

- **Survival: 5/10 runs reached day 12–14; 5 died (days 6–12), mostly starvation.** Deaths: talker (never foraged), donator (gave food away, died day 6 pre-arrival), scavenger, 2 others. Forager/cook/mixed builds survived on village meals + foraging. Bots are dumb (no water refills, no strategy), so this is a floor, not a ceiling.
- **Wild slot can be nasty on the FIRST ability.** Observed first-ability wild picks: `hoarder`, `chitin_skin`, `cannibal_frenzy`, `fear_aura`, `blood_magic`, `beard_moss`, `compost_king`. The `other` pool excludes only `utility` and `overpowered` — so vile/risky/body_horror are all eligible day-7 wild picks. Fine per "1 wild for flavor," but worth a conscious call: should a first-ever ability be `cannibal_frenzy`?
- **Run 8 reached 2 ability slots** (integration 20+ via discoveries) — slot progression works in real play.
- **Level-up pacing feels right:** forager bots hit L1 4–9 XP by day 13; dedicated play reached L2 in one earlier run. L3 (35 total uses) is a real commitment.

## Per-run summary

| # | Char | Style | Days | Surv | Arrival | Choices | Chosen | Sys ability end-state |
|---|------|-------|------|------|---------|---------|--------|---------------------|
| 1 | mara | forager | 13 | ✅ | ✅ | green_thumb, hoarder | green_thumb | L1 (7xp) |
| 2 | jesse | forager | 8 | ❌ | ✅ | beard_moss | beard_moss | L1 (0xp), died starving |
| 3 | aki | hunter | 14 | ✅ | ✅ | green_thumb, chitin_skin | green_thumb | L1 (6xp) |
| 4 | ruth | talker | 7 | ❌ | ✅ | generous, lucky_rock | generous | L1 (0xp), died starving |
| 5 | theo | cook | 14 | ✅ | ✅ | green_thumb, cannibal_frenzy | green_thumb | L1 (9xp) |
| 6 | priya | donator | 6 | ❌ | — | — | — | died pre-arrival |
| 7 | mara | scavenger | 8 | ❌ | ✅ | compost_king | compost_king | L1 (0xp), died |
| 8 | jesse | mixed | 13 | ✅ | ✅ | green_thumb, generous, compost_king | green_thumb | L1 (5xp), 2 slots |
| 9 | aki | forager | 13 | ✅ | ✅ | green_thumb, beard_moss | green_thumb | L1 (6xp) |
| 10 | ruth | hunter | 12 | ❌ | ✅ | green_thumb, blood_magic | green_thumb | L1 (4xp), died day 12 |

Background abilities held constant per character (mara: triage/steady_hands L1; jesse: game_sense/patient_aim L1; aki: field_dressing/preservation_instinct L1).

## Recommended fixes (priority order)

1. Increment `week1.hunt` in `huntAnimal()`, `week1.talk` in `talkTo()`, `week1.scavenge` in the ruin-loot branch — and add matching `gainAbilityXP('tracker'/'diplomat'/'scrounger')` hooks. Otherwise 3 of 6 first-ability paths are dead.
2. Decide the ability-effect story: either add `modifiers` entries to `abilities.json` for the mechanical claims (+50% yield etc.) AND fix `collectModifiers`/`metabolicMult`/combat to handle ability objects (or map to IDs), or change the copy to be honest that abilities are narrative/flavor. Current state promises math it doesn't deliver.
3. Floor kcal at 0 and hp at 0 in `resolveDay` (display/logic hygiene; death check already uses `<= 0`).
4. Zero-action fallback: if no utility earned, offer the 3-option fallback (survivor/wanderer/lucky_rock) instead of 1 random wild — or keep the wild single-pick deliberately (it's funny) but make it a conscious choice.
5. Optional: restrict the day-7 wild slot to non-vile tiers (wacky/underpowered/social) so nobody's first System gift is `cannibal_frenzy` — or keep it; roguelite chaos is a feature.

## Test-harness note

An earlier version of this harness mis-timed the arrival check (`scholar.day >= 7` becomes true a full day before `checkSystemArrival` fires, since it runs at the start of `endDay` during the day-7→8 transition). Fixed by handling on `state.systemArrived === true` rather than the day counter. The game was correct; the harness was wrong.
