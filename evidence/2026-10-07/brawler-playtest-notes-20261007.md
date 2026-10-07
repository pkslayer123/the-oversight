# Brawler path play-audit — 2026-10-07

**Auditor:** flesh-out loop worker (play-as-player audit, not script execution)
**Audit base (pinned):** `79ca1b5` — last tree where the brawler data payload exists.
Pristine tree loaded via `git archive 79ca1b5 src` (worktree src/ was dirty).
**Harness:** `scripts/play-feel-20261007-brawler.js` — 60 checks, green on seeds 7/42/1234.
**Subject:** sibling commit `5f0279e` "Brawler path: 4 new abilities, actions on 6 existing,
3 multi-path synergies" + engine commit `b15ec93` (Game.useAbility + 28 impls + damage hooks).

## VERDICT: half a game loop — then the whole path was deleted

Against the pinned base, the brawler path is **real narration over a half-wired engine**:
all 15 actions execute through `Game.useAbility()` and every one narrates (no silent
turns — the hunter audit's core complaint is fixed). But **8 of 15 actions are
mechanically dead** (flags nothing reads, wrong field names, uncalled hooks), all
3 synergies are undiscoverable (same two defects as hunter), and 10/10 modifier
targets have zero engine consumers.

**Then sibling commit `725a49c` (12:51 CDT, "move 4 abilities to skills") DELETED the
entire brawler data payload** — the 4 new abilities, all 8 actions on the 6 touched
abilities, and all 3 synergies. The deletions are the byte-exact inverse of `5f0279e`
and unmentioned in the message: a **stale-tree revert** (worker's tree predated
`5f0279e`, 24 min earlier). The engine impls in `abilityActions.js` remain as dead
code. **The brawler path currently does not exist at HEAD.** Repair = re-apply
`5f0279e`'s data hunks onto current HEAD (plus the wiring fixes below).

(Sibling `00b3c36` already repaired the *earlier* stale-tree revert where `5f0279e`
itself had wiped `bc7b599`'s 16 lying-ability actions. The tree is eating its own
tail: two stale-tree reverts in one morning.)

## Per-action results (live, through useAbility)

** genuinely work:**
- `trade_of_blows.open_trade` — pays 10 HP, next 3 strikes +50% ([18,15,39] on ~12-base),
  attacksLeft decrements 2→1→0, narrates each hit. Real.
- `haymaker.throw_haymaker` — 2.5x next strike (28 on ~11 base), consumed, narrated. Real.
  (-30% accuracy / off-balance-on-miss not verified — accuracy roll path unclear.)
- `rage.unleash_rage` — +100% for 3 rounds ([26,32,24]), burns out with narration. Real
  damage, BUT: duplicates the free `hasAbility('rage') && hp<50%` passive (game.js:18006,
  x2 below half HP, no cost) — the turn+60kcal action is often redundant; they stack to x4.
  "Attacks nearest thing (friend or foe)" and "cannot retreat" are **not implemented**.
- `second_wind.refuse_death` — auto-trigger REAL via `maybeCheatDeath()`: lethal damage →
  "SECOND WIND: you should be dead. You refuse. (1 HP, 500 kcal. Once today.)" Verified
  live (health=1, kcal=500 after 1 monster round). Manual use honestly explains itself.

** narrate but mechanically dead:**
- `trade_of_blows.settle_debt` — **can never fire**: reads `s.fightDamageTaken`, which
  NOTHING in the engine writes. Even after taking a real 15-damage hit: "You haven't
  taken any damage this fight. Nothing to cash in." Dead action.
- `unbreakable.brace` — sets `braceActive`; `_applyAbilityDefenseMods` has **zero callers**.
  Live: braced player took full 14 damage, flag never cleared. The 60% reduction never fires.
- `war_cry.bellow` — writes `m.stunTurns`; the engine reads `m.stunned`. Monster acted
  normally next turn and still damaged the player. Also "Beasts may flee outright" has no code.
- `unbreakable.shake_off` — clears `s.stun/s.slow/s.bleed`, which **don't exist** (real
  player stun is fighter `stunned`; there is no slow/bleed status at all). Live: stunned=2
  survived Shake It Off; the narration lies ("Stun, slow, bleed — cleared").
- `fear_aura.loom` — sets `loomActive`, nothing reads it ("+1 round before they attack"
  never happens). Text says villagers lose **5** trust; impl does **-2**.
- `brawler_instinct.read_fight` — knowledge half works (pattern known/unknown gating via
  `tbPatternKnown`/`_stanceHint`, honest). "+2 initiative" is dead: turn order is
  **speed-based** (`engine/combat.js` turnOrder); `fightRead.initiativeBonus` unread.
- `intimidating_presence.stare_down` — sets `m.disengaging`; **zero consumers**. Monster
  never disengages.
- `iron_stomach.push_through` — sets `pushThroughUntil` (wall-clock `Date.now()` in an
  expedition-clock game); nothing reads it. Poison rolls on unsafe food unchanged.
  (The passive `food.poison_chance ×0.25` modifier IS consumed — the action adds nothing.)
- `fear_aura.menace`, `war_cry.challenge`, `intimidating_presence.end_it_before` —
  flavor-only: rich narration, **zero state change**. Never-silent rule met, no game there.

** engine gaps (not action bugs):**
- No per-fight reset: `startCombat` never clears `rageActive/tradeOpen/debtSettled/
  shakeOffUsed/...` — "once per fight" flags are once-per-save; rage/trade leak into
  the next fight. Verified live.
- `spendCombatAction('ability')` says "You ability — that costs your action." (broken text).
- 10/10 brawler modifier targets (`combat.trade_window`, `combat.knockdown_resist`,
  `combat.stun_duration`, `combat.heavy_damage`, `combat.damage_taken`,
  `combat.morale_break_resist`, `social.intimidate`, `combat.enemy_morale`,
  `combat.outnumbered_bonus`, `combat.solo_damage`): pipeline carries them, **zero**
  `modTarget` call sites. `knockdown` has no mechanic at all; `intimidate()` never
  consults its modifier.

## Synergies (same two defects as the hunter audit)

`unstoppable`, `fear_itself`, `one_person_army`: **no `discovery_method`** →
`checkSynergyDiscovery` skips (`if (!dm) continue`); **no `requires`** → `matchesUsed`
(gates on `syn.requires`, ignores `requires_any`) never passes. Deliberate 3-day
combined-use attempts: zero attempt-counters, never unlock. `getNearSynergies`
(requires_any hints) and `unlockSynergy` ceremony work — the machinery is fine, the
data starves it. `recomputeActiveSynergies` ignores `requires_any` (empty `requires`
⇒ always-active once discovered). `one_person_army` paths via synergy ids
(`unstoppable`+`fear_itself`) are unsatisfiable (`abilityLevel` on a synergy = 0);
only the all-ability path is in principle satisfiable.

## Knowledge gating

Clean: `activatableAbilities()` only surfaces actions for held abilities; no pre-unlock
name/effect leaks at the data layer. Near-synergy teaser-naming is the existing
design (all 44 synergies), not a brawler leak.

## Engine question (parent follow-up): does 60a9eec/b15ec93 wire the brawler actions?

Note: this audit's pinned base `79ca1b5` **already includes both engine commits**, so
the question is answered by the audit above, not a separate inspection. Per class:
- **Wired end-to-end (7):** open_trade, haymaker, unleash_rage (damage hook
  `_applyAbilityActionMods` in `tbPlayerStrike`), refuse_death (`maybeCheatDeath`),
  and the narrating trio menace/challenge/end_it_before (never-silent by design).
- **Impl exists but dead on arrival (8):** settle_debt (no `fightDamageTaken` writer),
  brace (`_applyAbilityDefenseMods` never called), bellow (wrong field `stunTurns`),
  shake_off (wrong fields), loom (`loomActive` unread), read_fight initiative half,
  stare_down (`disengaging` unread), push_through (`pushThroughUntil` unread).
- The engine did **not** fix the hunter audit's synergy defects: `matchesUsed` still
  gates on `requires`, `recomputeActiveSynergies` still ignores `requires_any`.

## Backlog for engine owner / siblings

1. **Restore the brawler data payload** deleted by `725a49c` (re-apply `5f0279e` data
   hunks on current HEAD; verify with `git diff 5f0279e -- src/data/abilities.json`
   showing only intended diffs). Do NOT hand-edit around it — stale-tree discipline.
2. Wire or cut the 8 dead actions: `fightDamageTaken` writer in the player-damage path;
   call `_applyAbilityDefenseMods` from player-damage application; bellow → `m.stunned`;
   shake_off → real status fields (or implement stun/slow/bleed); loom delay or cut the
   claim; read_fight → speed bonus or cut initiative; stare_down → flee/disengage AI;
   push_through → consult in food-poison rolls (and use game clock, not `Date.now()`).
3. Synergy data: add `discovery_method` to the 3 brawler synergies (and hunter's 3);
   fix `matchesUsed` to consider `requires_any`; make `recomputeActiveSynergies`
   evaluate `requires_any`; resolve synergy-as-requirement (`one_person_army`,
   hunter's `apex_predator`).
4. `startCombat`: reset per-fight flags (`rageActive`, `tradeOpen`, `debtSettled`,
   `shakeOffUsed`, ...).
5. Decide: 10/10 brawler modifier targets unconsumed — wire them or delete them (dead
   stats lie to future readers). Same for hunter's 9/10.
6. Decide: `unleash_rage` vs the free sub-50% rage passive — merge, differentiate, or cut.
7. Decide: menace/challenge/end_it_before as pure flavor — fine as color, but they
   occupy action-menu slots; consider moving to automatic context beats.
8. Fix text: "You ability — that costs your action."; loom 5-vs-2 trust; bellow's
   flee claim; brace's knockdown claim.
9. **Process:** two stale-tree reverts in one morning (`5f0279e` ⊃ `bc7b599`,
   `725a49c` ⊃ `5f0279e`). The private-index recipe's `git read-tree HEAD` must be
   re-run immediately before `write-tree`, and the tree diffed against the parent
   for unexpected deletions before `commit-tree`.
