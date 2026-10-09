# BREAK-IT: knowledge system (target #2) — SEVENTH PASS, 2026-10-09

Hostile-player pass over the knowledge system, deliberately avoiding all 27
prior kills (breaks 1–15 in evidence/2026-10-08/break-knowledge.md, 16–21 in
break-knowledge-4th-pass.md, 22–24 in
evidence/2026-10-09/break-knowledge-5th-pass.md, 25–27 in
evidence/2026-10-09/break-knowledge-6th-pass.md). Fresh attack surface: the
gear-crafting/ownership commit (a208a9e3, landed ~10 min before this run) —
13 gear recipes, `noteGearHandled` L1 discovery, blind-craft engine odds,
corpse death packs, deposit-gated armory/pharmacy, villager gear-up.

Canon read first: docs/CANON.md, docs/PRESERVATION.md (blind penalties teach,
never stupid-make; the ladder gates itself). No canon doc covers recipe
knowledge levels or monster naming — those live in MEMORY.md/DESIGN.md
("before naming, only a strange descriptor"; monsterDisplayName contract:
"The TRUE name never shows pre-System").

Found **3 new breaks** (1 dead-code/softlock, 1 exploit/honesty, 1 honesty),
all fixed and proven. 2 new proof suites, each RED on unfixed code, GREEN
after (× 3 seeds: 20261009, 7, 424242). Prior knowledge suites re-run green
(gating, exploit-sweep, codex-sections, beargating 21/21); villager-gear
26/26; ontology 50/50.

## BREAK 28 — the blind-craft discovery loop was engine-complete but UI-unreachable (DEAD CODE + SOFTLOCK, Alien-Players class)
**Files:** `src/js/app.js` (pack Craft section, ~12579/12647); engine
`src/js/game.js` `craft()` / `noteGearHandled` (correct, untouched).
Commit a208a9e3 built the full loop: handling a gear item (equip, corpse
loot) teaches recipe L1 via `noteGearHandled`; `craft()` implements L1 35%
blind attempts ("materials at real risk") and success teaches L2
("PRACTICE: your hands learn what your eyes only guessed at"); the comment
promises "blind is never 'button disabled' — it's 'button honest.'"
But the ONLY craft UI filtered `codex.recipes[r.id].level >= 3` (a filter
predating the mechanic — it dates to the original crafting commit), and no
codex RECIPES section exists. Consequences: the L1 grant narrated once
("Recipe: Hunting spear (Level 1)...") then stranded — no button, no
re-read, no way to attempt the promised blind copy; L2 was unreachable at
runtime (its sole grant is the unreachable blind success). The engine was
never broken — the feature shipped without a door.
**Fix:** the Craft section lists recipes at level ≥ 1 with honest buttons —
L1 "Try blind (35%)" with materials hidden ("materials unknown — bring your
best guess"; the list is L2 knowledge), L2 "Try (85%)" with materials shown
(L2 text teaches them), L3 "Make" unchanged. Tooltips name the odds.
**Sibling sweep:** no other recipe UI surface exists (one `data-craft`
binder); TECHNIQUES/SKILLS codex sections exist; `learnRecipe` has zero
callers (dead wrapper, harmless, left in place like the other unused
dispatcher branches); trap recipes have no L1 grant path (noteGearHandled
is durable-only), so no stranded trap states.
**Proof:** `scripts/test-break-knowledge7-recipe-blind-20261009.js` —
extracts the SHIPPED filter + row template from app.js (brace-matched, not
copies), evals against live Game. RED pre-fix (9 failures/seed: L1/L2 absent
from the UI), GREEN post-fix × 3 seeds. Also proves the engine half: L1
attempts accepted ("only SEEN" line, not the refusal) and a blind success
teaches L2.

## BREAK 29 — blind material probing leaked the L2 materials list (EXPLOIT/HONESTY)
**File:** `src/js/game.js` — `craft()` missing-materials check.
The check runs BEFORE any cost (no ticks, no consumption) and named each
missing material: "Need 1 branch (have 0)." At L1 the materials list is L2
knowledge by design — so a player with an empty pack could probe one free
attempt per material and extract the full L2 list at zero cost, then attempt
the 35% blind craft fully informed. The blind attempt was not blind.
**Fix:** at blind (L1) the refusal is vague and honest — "You don't know
what a X is made of — not really. Bring your best guess and try." At L2+
the detailed "Need X (have Y)" stays (materials are known there).
**Sibling sweep:** `setTrap` operates on already-crafted tools (no probe);
`renderFat`/`makePemmican` work on physical items in hand, and pemmican's
recipe names itself only behind the `knowsTechnique('render')` gate; no
other pre-cost "Need X" enumerations touch knowledge-gated secrets (the
rest are kcal/water costs).
**Exploit verdict on the loop as designed:** NOT a printer — every attempt
consumes materials even on failure, costs 32 ticks, caps at L2 (craft never
grants L3), grants are one-shot/no-downgrade. One honest costly trial per
attempt, exactly as the canon blind-penalty rule wants.
**Proof:** same suite — empty-pack blind attempt at L1: RED pre-fix (say
line named "branch"), GREEN post-fix; L2 control still names the missing
material.

## BREAK 30 — the map monster popup leaked the true name at codex stage 'observed' (HONESTY)
**File:** `src/js/app.js` — the tap-a-monster popup (~1196).
`known = Game.monsterKnown(mon.id)` (canShow 'monster'/'name' = stage
'observed'/'slain') then printed `mdef.name` — the TRUE name. But stage
'observed' is reached by surviving a SINGLE telegraph (beam-windup witness,
game.js) or one STUDY action — long before the village naming debate,
pre-System. Every other surface (fighters, corpses, gossip, BEASTS codex,
field-fight summaries) routes through `monsterDisplayName`; the popup used
the parallel `monsterKnown` gate. Two name gates disagreed; the popup
trusted the wrong one. Its own comment ("name hidden until the Codex knows
it") mistook 'observed' for naming. Pre-fix the popup ALSO ignored an
agreed village name (showed the true name even after the debate converged).
**Fix:** the popup calls it what the UI calls it — `Game.monsterDisplayName`
(village name, else System true name once arrived, else the strange
descriptor), keeping the vibe + "It sees you." / "You don't know what it
is." framing.
**Sibling sweep:** all `mdef.name` / `${m.name}` render sites audited —
corpse `monsterName` fields are dead writes (`registerDeath` never stores
them; the `c.monsterName` fallbacks can't fire); the debug `?debug=1` panel
is dev-only; fighter say-lines use the gated fighter name; `perceive.js`
uses `monsterKnown` only for sentence framing around the gated
`monsterDesc` (safe); `praw` sites, `fieldFightSummary`, `monsterMeatEntry`,
convoTopics gossip all route through `monsterDisplayName`/`monsterNoun`.
**Proof:** `scripts/test-break-knowledge7-monster-popup-20261009.js` —
extracts the SHIPPED `isMon` branch from app.js, evals against live Game.
RED pre-fix (5 failures/seed: popup printed "Hushpuppy" at 'observed'),
GREEN post-fix × 3 seeds ("A dog-shaped silence at the treeline. It sees
you. You don't know what it is."); controls: village name shows after the
debate, true name shows post-System, descriptor pre-encounter.

## HELD (attacked, survived — documented, not fixed)
- **Corpse death-pack knowledge:** death packs name the dead villager's real
  gear (physical objects — the recipe, not the object, is what's gated);
  sentimental items are excluded from loot; looting teaches recipe L1 by
  design ("you've held one"); `corpseDesc`/`codexDeathSync` use the gated
  descriptor; decay stages are observable, not knowledge. The `prep` line is
  flavor. No leak.
- **Villager gear knowledge (94fa7f71 + a208a9e3):** the armory/pharmacy
  stash sections show NAMES of player-deposited items only (no stats/
  properties); NPC `villagerGearUp` is silent (no say lines); heal-check
  names are `displayName`-gated and HP bars are by-design ("people get
  health bars"); taking from the armory doesn't teach L1 but equipping does
  — no stranded state. No leak.
- **Naming-debate reachability (dead-code re-check):** tellbeast topic →
  report → `spreadMonsterNews` (endDay) → `monsterNewsCheck` (min(3,roster))
  → `kickMonsterNaming` → proposals → campaigning → `monsterNamingCheck` →
  villageName. Fully wired; convergence proven in pass 3.
- **canShow() render-site sweep:** all 16 call sites are the previously
  audited ones (plant kcal in pack/pantry/haven, skill name/mechanics,
  animal name, monster name/mechanics, npc name/mechanics, alien name).
  No new ungated surfaces in files touched since 2026-10-08.
- **knowledgeLevels read sweep:** no new ungated dumps; the eating-deepening
  block is `encAnimalKnown`-gated (break 26's fix holds).
- **tbPlayerStudy naming the attack:** deliberate design ("Study names the
  attack and sharpens the cue — but the PATTERN stays unknown until you
  survive it") — the action costs a turn and its purpose is naming; the
  counter-pattern stays behind `tbPatternKnown`. Not a leak, by comment.

## Minor dead-code notes (not fixed — harmless, recorded)
- `learnRecipe(recipeId, level)`: zero callers (delegates to grantKnowledge).
  Left in place — same class as the unused grantKnowledge skill/tree/monster
  domains the 1st pass kept as dispatcher infrastructure.
- Corpse `monsterName: mdef.name` opts (3 call sites) are dead writes —
  `registerDeath` never stores the field. Harmless; the `c.monsterName`
  fallbacks in app.js/corpses.js can never fire.

## Proof-test result counts (this pass)
- test-break-knowledge7-recipe-blind-20261009.js: 19 checks × 3 seeds
  (20261009, 7, 424242). RED pre-fix: 9 failures/seed (all UI-reachability
  + probing assertions; engine-acceptance controls passed pre-fix, proving
  the engine was never the broken half). GREEN post-fix.
- test-break-knowledge7-monster-popup-20261009.js: 8 checks × 3 seeds.
  RED pre-fix: 5 failures/seed (true name at 'observed', village name
  ignored). GREEN post-fix.
- Regressions: gating (ALL CHECKS PASSED), exploit-sweep, codex-sections,
  beargating 21/21, villager-gear 26/26 — all green. Ontology 50/50.

## Files changed
- `src/js/game.js` — `craft()`: blind (L1) missing-materials refusal no
  longer names materials (break 29).
- `src/js/app.js` — pack Craft section: L1/L2 recipes listed with honest
  blind-attempt buttons, materials gated at L2+ (break 28); map monster
  popup uses `monsterDisplayName` (break 30).
- `scripts/test-break-knowledge7-recipe-blind-20261009.js` — new proof suite.
- `scripts/test-break-knowledge7-monster-popup-20261009.js` — new proof suite.
- `evidence/2026-10-09/break-knowledge-7th-pass.md` — this file.
