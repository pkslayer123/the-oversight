# Brawler wiring backlog — fixes — 2026-10-07 (Steve 2026-10-05)

Four known-broken items from the 15:48 run note (ea5072f post-repair
verification), all fixed and proof-green. Commit: see worker report.

## 1. Three synergies lacking discovery_method — FIXED

**Before:** `unstoppable`, `fear_itself`, `one_person_army` (src/data/synergies.json)
had no `discovery_method`, so `checkSynergyDiscovery` skipped them (`if (!dm)
continue`) — they could never unlock via play. Forced unlock worked, but the
knowledge → power core loop was broken for the whole brawler endgame.

**After:** each has a `discovery_method` fitted to its fiction and its
requires_any legs (all `type: simultaneous` — brawler synergies are about
bringing two violent truths to bear in the same moment):
- `unstoppable`: "Take the hit. Stay standing. Refuse the floor." (pairs with
  the [rage+iron_stomach] / [trade_of_blows+second_wind] paths)
- `fear_itself`: "Let them see you coming. Be the thing they were afraid of."
- `one_person_army`: "Stand alone in the middle of everything. Hold."
  (minLevel 3 — the pinnacle; its [unstoppable+rage+war_cry] path needs the
  ability legs at level 3, verified in proof)

**Proof:** wiring script §A — all three present, well-formed
(type+hint+tease1+tease2), and `unstoppable` unlocks via 3 days of played
simultaneous rage+iron_stomach use. Reverify §D — all three unlock via play.

## 2. Brawler modifiers unconsumed — FIXED (7 wired, 4 honestly removed)

**Before:** 10/10 brawler modifier targets had zero engine consumers
(audit finding).

**After — wired through the sanctioned pipeline** (`game.modTarget`, "new
content = new target, never new plumbing"), all in src/js/abilityActions.js:
| target | source | consumption site |
|---|---|---|
| combat.trade_window (+1) | trade_of_blows | open_trade: window = 3 + mod → 4 strikes (narrated) |
| combat.heavy_damage (×1.2) | haymaker | haymaker strike: 2.5 × 1.2, narrated |
| combat.damage_taken (×0.7) | unstoppable | _applyAbilityDefenseMods, before brace |
| social.intimidate (+0.25/+0.2/+0.4) | intimidating_presence, war_cry, fear_itself | stare_down courage check: 0.5 + intim, cap 0.95 |
| combat.enemy_morale (×0.6) | fear_itself | bellow courage check: 0.6 / morale, cap 0.95 |
| combat.outnumbered_bonus (+0.5) | one_person_army | strike vs 2+ living foes: ×(1+bonus), narrated |
| combat.solo_damage (×1.4) | one_person_army | strike solo (1 foe, 0 allies): ×1.4, narrated |

Synergy modifiers only apply while the synergy is discovered AND active
(`synergyMods` reads `activeSynergies`) — the knowledge → power loop holds:
unstoppable's ×0.7 damage_taken only fires while you hold a path at minLevel.

**After — honestly removed from data** (no mechanic exists to wire into;
documented here, not left as silent dead data):
- `combat.knockdown_resist` (unbreakable): no knockdown mechanic anywhere in
  src/js. Natural re-home if one is ever built.
- `combat.morale_break_resist` (unstoppable): no player morale-break mechanic.
- `combat.stun_duration` (unbreakable, ×0.5): stuns are 1-turn integers in the
  status framework — halving is unrepresentable. A `durationMod` concept could
  re-home this if variable-duration stuns arrive.
- `combat.initiative` (brawler_instinct, +2): superseded — read_fight grants
  +2 speed directly (turn order is speed-based); the old +2 initiative was
  already dead per the impl comment. Not in the audit's 10, removed anyway.

**Proof:** wiring §B — 7/7 call sites found via modTarget sweep; 4/4 removed
targets absent from data; behavioral: open_trade window is 4; solo strike
fires "ONE PERSON ARMY: alone in it" narration with one_person_army active.

## 3. Per-fight flag leaks — FIXED

**Before:** rageActive, tradeOpen, debtSettled, shakeOffUsed survived into the
next fight (fightDamageTaken was fixed at ea5072f).

**After:** src/js/game.js startCombat now deletes all seven per-fight flags:
rageActive, tradeOpen, debtSettled, settleDebtBonus, braceActive,
shakeOffUsed, haymakerReady (+ the existing fightDamageTaken = 0).
`fightRead` is intentionally NOT cleared — read_fight banks +2 speed for the
NEXT fight when used out of combat (documented in the comment).

**Proof:** wiring §C — two-fight harness: all 7 flags set in fight 1 (4 via
real actions, 3 manual), fight 2 starts with zero leaked; ledger reset.
Reverify §C — same, green.

## 4. brace / frenzy design honesty — TRIMMED (no new mechanics)

**Design call** (per task directive — prefer trimming text promises over
inventing combat mechanics): there is no knockdown mechanic in src/js, no
forced-targeting, and no player retreat lock. The old text promised immunity
and behaviors the engine doesn't implement.

**Before / after:**
- brace effect: "…You cannot be knocked down this turn." → "Plant your feet.
  Reduce next incoming damage by 60%." `braceActive.noKnockdown` flag removed
  (it was set and read by nothing).
- unleash_rage effect: "+100% damage for 3 rounds, but you attack the nearest
  thing (friend or foe). You cannot retreat while raging." → "+100% damage
  for 3 rounds. The red comes down — hold on." `rageActive.frenzy: true`
  removed (set and read by nothing). What the action does (+100% × 3 rounds,
  costs turn + 60 kcal) is unchanged and was already proven working.

**Proof:** wiring §D — texts contain no knockdown/nearest/retreat promises;
flags carry no dead keys; rage still +100% × 3 rounds.

## Proof results

- scripts/test-brawler-wiring-20261007.js (new): **21 ok, 0 FAIL** at seeds 7, 42
- scripts/test-brawler-reverify-20261007.js (pins inverted from the
  broken-state pins at ea5072f): **46 ok, 0 FAIL** at seeds 7, 42
- `node --check` clean on all touched JS; both JSON files parse and
  round-trip byte-identical except the intended hunks.

## Tree-safety notes for the coordinator

- HEAD moved mid-run: audio worker committed 55576b2 (Drama.audioFor +
  hummice aggroAudio + antlerThrash) while this run was testing. Their commit
  did not touch brawler files — except game.js, where it SWEPT IN this worker's
  uncommitted startCombat reset (the worktree edit was live when they
  committed; classic COMMIT-INDEX RACE). This worker's commit 0e3e41c then
  added the same block a second time; follow-up commit ebbb0a2 dedupes to one
  copy. Net effect is correct; the sweep is recorded here so the duplication
  doesn't look like two authors' intent.
- Sibling's worktree game.js (dirty, MM) preserved at /tmp/brawler-backup-game.js
  and restored after each commit; sibling's abilities.json/synergies.json
  worktree versions preserved at /tmp/brawler-backup-*.json and restored.
  scripts/safe-commit.sh was deleted from the worktree by a sibling mid-run;
  restored temporarily from HEAD per commit, then removed again.
- Grep marker for revert detection: `BRAWLER FLAG HYGIENE` in startCombat.
- Out of scope, observed: hunter per-fight flags (aimBonus, deadAimShot,
  ambushReady) also lack a startCombat reset — not touched (not my area).
