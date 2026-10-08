# Brawler synergy discovery audit + proof — 2026-10-07 (Steve 2026-10-05)

**Auditor:** flesh-out loop worker (brawler synergy discovery audit)
**HEAD:** `a5e9328` (run note 2108). All data reads from a pristine
`git archive HEAD` extract (`~/workspace/worker-brawler-syn`); the dirty
shared worktree was never read for analysis and the shared index was never
touched (no add/commit/stash/reset; deliverables are NEW files only).
**Proof script:** `scripts/test-brawler-synergy-discovery-20261007.js` —
**84 ok, 0 FAIL at SEED=1, 2, 3** (exit 0).

## HEADLINE: the 2108 backlog item is CLOSED

- **7/7 brawler synergies** have a well-formed `discovery_method`
  (type + hint + tease1 + tease2), all legs resolve, and the discovery
  machinery gates play-unlock on it (`if (!dm) continue`).
- **10/10 backlog modifiers**: 7 wired through `modTarget` call sites,
  3 honestly removed from data (no mechanic exists to wire into — documented,
  not silent dead data).

## 1. Synergy audit table

Scope rule: a synergy is brawler-path if any leg is a brawler-EXCLUSIVE id
(brawler_instinct, intimidating_presence, fear_aura, war_cry, haymaker,
unbreakable, or a synergy-as-leg). rage / second_wind / adrenaline_control
are shared legs and do not scope a synergy into the path alone.

| synergy | legs | type | discovery hint | tease1/tease2 | minLevel | modifiers |
|---|---|---|---|---|---|---|
| ringcraft | brawler_instinct → intimidating_presence | sequential | "Brawl first. Then let them watch you do it again." | ✓ / ✓ | 1 | combat.strike_damage ×1.3 |
| trade_of_blows | brawler_instinct + second_wind | simultaneous | "Get hit. Hit back. Refuse the difference." | ✓ / ✓ | 1 | combat.strike_damage ×1.25 |
| rooms_go_quiet | intimidating_presence + fear_aura | simultaneous | "Stand still. Let the quiet do the work." | ✓ / ✓ | 1 | drama.resolve_bonus +8, trust.gain_mult ×0.85 |
| borrowed_surge | adrenaline_control → brawler_instinct | sequential | "Steady the surge first. Then throw it all into one strike." | ✓ / ✓ | 1 | combat.strike_damage ×1.4 |
| unstoppable | requires_any: [rage,iron_stomach] / [trade_of_blows,second_wind] / [unbreakable,haymaker] / [rage,unbreakable] | simultaneous | "Take the hit. Stay standing. Refuse the floor." | ✓ / ✓ | 2 | combat.damage_taken ×0.7 |
| fear_itself | requires_any: [fear_aura,intimidating_presence] / [war_cry,brawler_instinct] / [fear_aura,war_cry] | simultaneous | "Let them see you coming. Be the thing they were afraid of." | ✓ / ✓ | 2 | social.intimidate +0.4, combat.enemy_morale ×0.6 |
| one_person_army | requires_any: [unstoppable,fear_itself] / [unstoppable,rage,war_cry] / [trade_of_blows,unbreakable,haymaker] | simultaneous | "Stand alone in the middle of everything. Hold." | ✓ / ✓ | 3 | combat.outnumbered_bonus +0.5, combat.solo_damage ×1.4 |

Adjacent (shared-leg) synergies — informational, not gated, all discoverable:
undying_fury (rage+second_wind), refuses_death (phoenix_clause+second_wind),
cornered_fury (adrenaline_control+cornered_rat) — each has type+hint+tease1+tease2.

Coaching path (how the hint reaches the player):
1. Attempt 1 → `synergyTease` speaks `tease1` verbatim + faint drama whisper.
2. Attempt 2 → `tease2` + shimmer drama + "Something wants to happen when you
   do... whatever you just did. (2/3)". The full hint text surfaces in the
   pack panel via app.js `renderSynergyStirrings` (💡 + hint).
3. Attempt 3 → `unlockSynergy`: hero card, System voice line, knowledgeReveal
   + synergyDiscovered audio hooks, "✨ SYNERGY DISCOVERED".
4. `recomputeActiveSynergies` (discovered AND held only) → `synergyMods()`
   reads only `activeSynergies` → `mods()` → `modTarget` pipeline.
   Modifiers fire ONLY while the synergy is discovered and held:
   the knowledge→power loop holds in both directions (proven: undiscovered
   fear_itself/one_person_army leave enemy_morale/solo_damage at base).

## 2. Modifier consumption table (the 10 backlog targets)

| target | data source | engine consumer | status |
|---|---|---|---|
| combat.trade_window (+1) | ability trade_of_blows | abilityActions.js:783 — open_trade window 3+mod → 4 strikes, narrated | CONSUMED |
| combat.knockdown_resist | — (was: unbreakable) | none exists | HONESTLY REMOVED — no knockdown mechanic in src/js; natural re-home if one is built |
| combat.stun_duration | — (was: unbreakable ×0.5) | none exists | HONESTLY REMOVED — stuns are 1-turn integers; halving unrepresentable |
| combat.heavy_damage (×1.2) | ability haymaker | abilityActions.js:357 — haymaker strike 2.5×1.2, narrated | CONSUMED |
| combat.damage_taken (×0.7) | synergy unstoppable | abilityActions.js:423 — _applyAbilityDefenseMods, before brace | CONSUMED |
| combat.morale_break_resist | — (was: unstoppable) | none exists | HONESTLY REMOVED — no player morale-break mechanic |
| social.intimidate (+0.25 / +0.2 / +0.4) | abilities intimidating_presence, war_cry; synergy fear_itself | abilityActions.js:1009 — stare_down courage check 0.5+intim, cap 0.95 | CONSUMED |
| combat.enemy_morale (×0.6) | synergy fear_itself | abilityActions.js:857 — bellow courage check 0.6/morale, cap 0.95 | CONSUMED |
| combat.outnumbered_bonus (+0.5) | synergy one_person_army | abilityActions.js:399 — strike vs 2+ living foes ×(1+bonus), narrated | CONSUMED |
| combat.solo_damage (×1.4) | synergy one_person_army | abilityActions.js:405 — solo strike (1 foe, 0 allies) ×1.4, narrated | CONSUMED |

Also removed (not in the 10, noted in wiring fixes): combat.initiative
(brawler_instinct +2) — superseded by read_fight's direct +2 speed grant.

Other brawler modifiers (never in the backlog, verified consumed):
adrenaline_control combat.strike_damage (strike pipeline), fear_aura
trust.gain_mult (game.js:16312), iron_stomach food.poison_chance (poison
rolls), intimidating_presence social.intimidate (above).

## 3. Proof results

`scripts/test-brawler-synergy-discovery-20261007.js` vs pristine HEAD extract,
SEED=1,2,3 — **84 ok, 0 FAIL each run** (exit 0). Covers:
- A: 7 brawler synergies identified; every one has non-empty type/hint/tease1/tease2.
- B: every leg resolves to a known ability or synergy id.
- C: all 7 wired targets have ≥1 `modTarget('<target>'` call site in src/js;
  all 3 removed targets absent from data AND from src/js.
- D (static): discovery gates on `!dm`; tease reads tease1/tease2; attempt-2
  gated on `dm.hint`; unlockSynergy recomputes; synergyMods reads only
  activeSynergies; app.js surfaces the hint at attempt 2.
- E (behavioral, seeded node harness, full module list): trade_of_blows
  discovers in 3 same-day-part combined uses with tease1/tease2 spoken
  verbatim; strike_damage ×1.25 fires via modTarget post-discovery;
  trade_window 3→4 with the ability held; unstoppable discovers via the
  rage+iron_stomach requires_any path at minLevel 2 with damage_taken ×0.7;
  undiscovered fear_itself/one_person_army leave their targets at base.

## 4. Observations for the engine owner (not failures)

1. `dm.hint` is never SPOKEN in game.js — at attempt 2 it only gates the
   shimmer message ("Something wants to happen when you do... whatever you
   just did. (2/3)"). The literal hint text surfaces in the app.js pack
   panel (`renderSynergyStirrings`) at attempt 2. A player who never opens
   the pack panel gets the shimmer but not the wording. Design call whether
   the hint should be spoken in-log.
2. The 3 fixed synergies (unstoppable/fear_itself/one_person_army) have
   `flags` absent (null) vs `[]` on the older four. The engine never reads
   `syn.flags` — cosmetic only. schemas.json is stale repo-wide anyway
   (validate-data's ~485 pre-existing errors); not newly broken by this.
3. `one_person_army` requires_any includes a 3-leg path
   [trade_of_blows,unbreakable,haymaker] — minLevel 3 means all three legs
   at level 3; the wiring worker verified this. It's the intended pinnacle
   gate, but it's the steepest unlock in the game — worth a playtest eye.

## Tree-safety
No src/ changes made (audit + proof only). New files:
`scripts/test-brawler-synergy-discovery-20261007.js`,
`evidence/2026-10-07/brawler-synergy-discovery-notes-20261007.md`.
Shared index untouched; nothing committed; nothing pushed.
