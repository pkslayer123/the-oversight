# Hunter path play-audit — c1157dc (Steve 2026-10-07)

**Played as a player, not executed as a script.** Harness: `scripts/play-feel-20261007-hunter.js`
(pristine HEAD tree at /tmp/hunter-head — the worktree's src/ is dirty with sibling
work, so engine+data were loaded from `git archive HEAD src`). Seeded PRNG (mulberry32,
default 7, SEED override); stable 26/26 checks on seeds 7 and 42.

**Scope:** 4 new abilities (stalk, blood_trail, ambush, animal_ken), actions on 5 existing
(game_sense, patient_aim, field_dressing, tracker, dead_aim), 3 multi-path synergies
(clean_kill, blood_tracker, apex_predator), requires_any engine support.

## Verdict up front

The hunter path as shipped is **content without a game loop**. The data is evocative —
good names, good flavor, sensible paths — but almost none of it is reachable or felt in
play:

- The 3 synergies **can never be discovered** (two compounding engine defects).
- The 13 new actions **execute nothing** (all `doAction` → "unknown kind").
- 9 of 10 new modifier targets are **pipelined but never consumed** by any system.
- The one live modifier (field_dressing's meat bonus) is **silent** — never named on screen.

What DOES work: the requires_any *hint* engine (`getNearSynergies` names the right
missing piece per path), the modifier pipeline (level scaling correct), and the
synergy unlock ceremony itself (juicy, when force-triggered).

## Findings (all evidenced in-harness)

### 1. The 3 synergies are undiscoverable — two compounding defects [ENGINE BUG]
- `checkSynergyDiscovery` skips any synergy without `discovery_method` (`if (!dm) continue`).
  clean_kill, blood_tracker, apex_predator have `discovery` (flavor text) but no
  `discovery_method` (the machine). All 41 other synergies have one.
- Even with a discovery_method, `matchesUsed`/`otherId` read only `syn.requires`
  (empty for these) — `requires_any` paths are never consulted for the used leg.
- Proved by in-memory diagnostic: adding discovery_method alone → still 0 attempts;
  mirroring the first path into `requires` → unlocks after 3 combined uses. The
  combined-use machinery is fine; the requires_any wiring is not.
- **Sweep:** all 3 synergies affected. Same bug class, three instances.

### 2. apex_predator's requires_any references synergy ids — unsatisfiable [ENGINE/DATA BUG]
- Paths `[clean_kill, animal_ken]`, `[clean_kill, stalk, ambush]`, `[blood_tracker, dead_aim]`
  require *synergies*, but `hasReq` checks `abilityLevel(rid)` which returns 0 for
  non-abilities. Those paths can never be satisfied.
- `recomputeActiveSynergies` also ignores `requires_any` (uses `(syn.requires||[]).every(...)`
  → empty = always true). If clean_kill were discoverable it would be **permanently active**.
- **Flag for engine owner; not fixed here.**

### 3. All 13 actions are display-only; 12/13 produce silent turns [FEEL]
- `Game.doAction('<any of the 13 ids>')` → console.warn "unknown kind", 1 tick burns,
  an **empty string** is pushed to the say feed. No visible explanation — a silent turn
  by Steve's rule.
- The ability card renders an ⚡ **ACTIVE** badge for these (app.js renderSlot:
  `def.actions.length > 0 → ACTIVE`) — the badge implies executability that doesn't exist.
- **Sweep:** all 13 actions across all 9 abilities share the class. No exceptions.
- Nuance: two described verbs have *pre-existing adjacent* engine hooks, but neither is
  wired to the new actions: STUDY arms dead_aim's ×2.5 `p.aimed` crit (the "Dead Aim"
  action text promises 3x/ignores-armor/can't-move — mismatch), and patient_aim's
  round-1 double exists via `combat.strike_damage` with its own say line. The new Ambush
  ("2x next attack, can't be dodged") duplicates patient_aim's passive with no wiring.

### 4. 9 of 10 modifier targets have zero engine consumers [DATA/ENGINE GAP]
- Pipeline carries all 10 correctly (level scaling verified: field_dressing L1 1.3x,
  L2 1.69x, L3 2.197x). But only `hunt.meat_yield` is read anywhere
  (encounters.js:715,1926; game.js:8899). `stealth.move_silent`, `hunt.track_wounded`,
  `combat.first_strike_damage`, `animal.behavior_read`, `hunt.first_shot_damage`,
  `hunt.wounded_find`, `hunt.wounded_time`, `hunt.intimidate`, `combat.vs_beast_damage`
  — zero reads across all of src/js.
- **Sweep:** all 4 new abilities + all 3 synergies. Same class everywhere.
- **Feel:** fought 4 real rounds vs a gallowdeer with Ambush equipped — damage
  [30,14,12,14] with the round-1 double coming from *patient_aim's* pre-existing
  passive, nothing from ambush. The fight feels identical with or without the new kit.

### 5. The meat bonus is silent [FEEL]
- field_dressing's +30–69% meat works mechanically, but the kill line
  ("About 3900 kcal of meat on the bone…") never names the bonus. The player never
  learns why the haul was big — no earned-feeling payoff.

### 6. What works (keep)
- `getNearSynergies` evaluates requires_any paths correctly: "Clean Kill 1/2 — need
  Game Sense"; "Apex Predator 1/2 — need Blood Tracker". The teaser/hint layer is the
  one piece of the multi-path design a player can actually see.
- Synergy unlock ceremony (`unlockSynergy`: drama + audio + SYSTEM voice) is juicy —
  verified via forced unlock.
- Near-hints naming undiscovered synergies pre-discovery matches the other 41
  synergies' behavior — existing design, not a new knowledge leak.

## Fun judged honestly

As a player, the hunter kit today is **four passive stat lines and a menu of buttons
that do nothing**. Nothing in c1157dc changes a single decision I make in a fight or
on a hunt — except field_dressing's invisible meat bump. The fantasy the data sells
(stalk unseen, read the beast, lay an ambush, the perfect clean kill) has no playable
verb behind it. The synergies — the most exciting part — are the least reachable:
not just hard to earn, but *impossible* by construction.

The good news: the failures are all wiring, not design. The data wants the right
things; the engine just never got the memo. Recommended engine-owner fixes, in order:
1. Give the 3 synergies `discovery_method`s AND make `matchesUsed`/`otherId` consult
   requires_any paths.
2. Decide what synergy-as-requirement means (check `sch.synergies` instead of
   `abilityLevel`), and make `recomputeActiveSynergies` honor requires_any.
3. Wire the 13 actions to real verbs (or drop the ACTIVE badge until they exist).
4. Name the meat bonus in the kill line.

## Files
- Harness: `scripts/play-feel-20261007-hunter.js` (new, committed)
- These notes: `evidence/2026-10-07/hunter-playtest-notes-20261007.md` (new, committed)
- Engine untouched (read-only per assignment). No push (per assignment).
