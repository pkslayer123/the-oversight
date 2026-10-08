# Hunter dead-modifier audit + prose-wart verification — 2026-10-07

Worker: hunter dead-modifier audit (flesh-out loop, 2108 backlog item).
Tree analyzed: pristine `git archive HEAD` extract (never the dirty worktree).
Proof script: `scripts/test-hunter-dead-modifiers-20261007.js` (NEW; deterministic, SEED=1,2,3 identical, exit 0).

## Verdict

**The 2108 backlog framing ("6 dead hunter modifiers") is stale.** Sibling commit
`cf3049d` ("Hunter wiring: 2 modifiers wired + 5 honestly removed", Steve 2026-10-05)
honestly REMOVED 5 of the 6 from the data files — they are not defined at HEAD at all.
Only ONE modifier is truly defined-but-never-consumed. The proof script snapshots this
actual state: **1 dead, 5 removed, 2 positive controls consumed.**

## Audit table (all at HEAD)

| Modifier | Defined (HEAD) | Consumed (HEAD) | Status | What wiring would look like |
|---|---|---|---|---|
| `stealth.move_silent` | YES — `src/data/abilities.json:1766` (stalk passive, add +0.3) | NOWHERE (0 `modTarget` readers in src/js) | **dead** | One line in `preyReaction` (`src/js/food.js:1198`): `fleeP -= this.modTarget('stealth.move_silent', 0, {})`. NOTE: `abilityActions.js:699-700` already *claims* the passive "feeds the same flee roll" — aspirational comment, not true at HEAD; the real flee roll uses `tracker` level × 0.12 instead. Wiring would make the comment true but stacks with the stalk action's aware-drop (A/B-proven 0/200 bolts) — balance check needed, not engine work. |
| `hunt.track_wounded` | NO — removed cf3049d (was `abilities.json` ~:1799, blood_trail add +0.5) | nowhere | removed | Would need a wounded-animal system (none exists; `blood_trail.follow_blood` is pure narration). Highest cost of the six. |
| `animal.behavior_read` | NO — removed cf3049d (was `abilities.json` ~:1876, animal_ken add +0.4) | nowhere | removed | Would need a `read_beast` quality ladder (currently a flat pick). Medium cost. |
| `hunt.wounded_find` | NO — removed cf3049d (was `synergies.json` ~:1285, blood_tracker add +0.8) | nowhere | removed | Same missing wounded-animal system as track_wounded. Highest cost. |
| `hunt.wounded_time` | NO — removed cf3049d (was `synergies.json` ~:1289, blood_tracker multiply ×0.5) | nowhere | removed | Same missing wounded-animal system. Highest cost. |
| `hunt.intimidate` | NO — removed cf3049d (was `synergies.json` ~:1327, apex_predator add +0.5) | nowhere | removed | Would need an animal-intimidation pipeline (none exists; `calm_beast`'s 50/50 fear roll is the opposite fiction). Medium-high cost. |

Consumption sweep method: `modTarget('<target>'|"<target>"|`<target>`)` over `src/js/**/*.js`,
excluding the engine resolver `src/js/engine/modifiers.js` (resolves, consumes nothing)
and line-commented mentions. Only other dynamic form in the codebase is
`statusEffects.js:116` via data `resistMod` (currently `food.poison_chance`) — none of
the six flow through it.

## Positive control (what "consumed" looks like)

`hunt.first_shot_damage` — wired by cf3049d at **`src/js/game.js:19183`** (round-1 strike
path, clean_shot/clean_kill synergy):

```js
const ckMult = this.modTarget('hunt.first_shot_damage', 1, { round: 1 });
if (ckMult > 1) { d = Math.round(d * ckMult); this.say(`CLEAN KILL: one shot, and it never knew. ×${ckMult}.`); }
```

The proof script asserts this target IS consumed — if the sweep ever reports it dead, the
sweep is blind (or a sibling reverted the wiring), not the modifier. Second control:
`hunt.meat_yield`, consumed in `abilityActions.js:643`, `encounters.js:616,879,2141`,
`game.js:8994`.

## Prose warts — both STILL PRESENT at HEAD

1. **"The the thing with headlights"** — `src/js/game.js:18593` (`tbAntlerThrash`):
   `` this.say(`The ${m.name} thrashes its antlers at ${who} — ...`) ``
   For an unnamed gallowdeer, `m.name` IS the unknown descriptor
   (`src/data/monsters.json:271`: "the thing with headlights for eyes, standing too
   still", self-articled) → renders "The the thing with headlights for eyes, standing
   too still thrashes its antlers at you". The `monsterNoun(mid)` helper exists
   (`game.js:12605`) and strips the article exactly for this case — unused here.
   Suggested fix (not applied — audit only): `The ${this.monsterNoun(m.id)} ...`
   (monsterNoun returns the article-stripped lowercase noun phrase; caller supplies "The").
2. **Lowercase sentence opener** — `src/js/game.js:12688-12689` (`reportMonster` path):
   ```js
   const unkP = /[.!?…]$/.test(unk) ? unk : unk + '.';
   this.say(`You don't know what that was. ${unkP} Someone at the haven should hear about this.`);
   ```
   The 8b21c94 punctuation fix appended the period but the descriptor starts lowercase →
   "You don't know what that was. the thing with headlights for eyes, standing too still.
   Someone at the haven should hear about this." Suggested fix (not applied):
   capitalize first letter of `unkP` (`unkP.charAt(0).toUpperCase() + unkP.slice(1)`).

## Ranked: cheapest to wire first (least engine risk)

1. **`stealth.move_silent`** — one-line consumer in the existing `preyReaction` flee roll
   (`food.js:1198`); no new system, no new data. Only cost is a balance check against the
   already-strong stalk aware-drop. The stale comment at `abilityActions.js:699` already
   promises this behavior, so wiring also fixes a lie in the code.
2. **`animal.behavior_read`** — needs a `read_beast` quality ladder; the action and its
   call sites exist, only the quality dimension is missing. Medium.
3. **`hunt.intimidate`** — needs an intimidation pipeline; the nearest neighbor
   (`calm_beast`) works the opposite fiction, so this is new design, not a hook-up.
   Medium-high.
4. **`hunt.track_wounded` / `hunt.wounded_find` / `hunt.wounded_time`** (tie, last) —
   all three need a wounded-animal tracking subsystem that does not exist anywhere in
   the codebase. This is a feature, not a wiring job. Do not re-add the data entries
   until the system exists (cf3049d removed them for exactly this reason).

## Files

- Proof: `scripts/test-hunter-dead-modifiers-20261007.js` — run with
  `HUNTERMOD_ROOT=<pristine-tree> node scripts/test-hunter-dead-modifiers-20261007.js`
  (defaults to repo root). Exit 0 = snapshot holds; exit 1 = drift (read header).
- No src/ changes made (audit + proof only, per assignment). No commits, no pushes,
  no shared-index contact (read-only `git log`/`git show` against the repo; all
  analysis on the `~/workspace/worker-huntermod` extract).
