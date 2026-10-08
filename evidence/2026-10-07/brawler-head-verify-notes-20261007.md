# Brawler path full proof at HEAD cc37d20 — 2026-10-07

Proof script: `scripts/test-brawler-verify-head-20261007.js` (26 ok / 0 FAIL, seeds 7 and 42).
Method: pristine HEAD extract at /tmp/brawler-head-verify (`git archive HEAD`),
full src/js eval in index.html order (minus app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js),
window stub during eval deleted before play, mulberry32-seeded RNG.

## Per-action verdicts (ALL FIXED — 15/15)

Every action: `Game.abilityActionDef` resolves the data def, and `Game.useAbility`
narrates real text — zero "doesn't exist" rejections, zero "isn't wired up yet"
fallthroughs. All 15 have implementations in `ABILITY_ACTION_IMPLS`.

combat (11): fear_aura.loom, brawler_instinct.read_fight,
intimidating_presence.stare_down, trade_of_blows.open_trade,
trade_of_blows.settle_debt, unbreakable.brace, unbreakable.shake_off,
war_cry.bellow, haymaker.throw_haymaker, rage.unleash_rage,
second_wind.refuse_death.

- refuse_death called manually explains honestly ("isn't something you choose —
  it's what happens when you would die… automatic") rather than erroring.

explore (1): iron_stomach.push_through.
social (3): fear_aura.menace, intimidating_presence.end_it_before, war_cry.challenge.

## Context filtering (BY DESIGN, verified)

- In combat, `activatableAbilities()` surfaces exactly the 11 combat actions;
  push_through / menace / end_it_before / challenge are correctly ABSENT.
- Out of combat, the 11 combat actions are absent; push_through (explore)
  and all 3 social actions are present.
- No action leaks across contexts either way.

## Play-feel: brawler vs gallowdeer (strike / brace / bellow), as a player

- Fight flows: strike lands (10–14 dmg), brace sets braceActive and the engine
  consumes it on the next incoming hit, bellow runs the morale engine (60%
  fail chance, skittish beasts bolt). No stalls, no crashes, every beat narrates.
- The gallowdeer is genuinely dangerous: an unbraced answer can hit ~86 into
  100 HP — the beam telegraph ("holds its line, burning where you were")
  demands movement, which is the actual fight skill. Brace is the brawler's
  answer to the beam: 60% reduction is meaningful, not cosmetic.
- Honest friction: the bellow narration in the captured trace was crowded out
  by the beam-tick narration and a synergy-discovery burst (Unstoppable fired
  mid-brace). The action works, but the noisiest line in the log is not always
  the action you just took — worth a readability pass in a future polish run.
- Strike dmg (12–14) vs real gallowdeer HP 150–170: ~11–13 naked strikes to
  kill, but the brawler kit multiplies (rage +100%, haymaker 2×, open_trade
  +50% ×4). The loop is trade-pain → cash-out → brace the answer → bellow for
  a breather → haymaker. It reads as a coherent brawler fantasy, not button
  soup.

## Verdict

The brawler action engine is FULLY WIRED at HEAD cc37d20: 15/15 data actions
resolve via useAbility with honest narration, combat surfacing matches the
context design exactly, and the played loop is playable, threatening, and
distinct. The 2907a57 repair holds — HEAD's abilities.json contains all 8
re-applied actions plus the 7 that survived the stale-tree damage.
