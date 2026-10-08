// Kill-grant honesty proof (break-it monsters run 2, follow-up).
// Attack: XP/farming loops. What does the engine actually grant on a monster
// kill — trophy/meat/items/knowledge — vs what the UI promises?
//
// Claims under test:
//   1. one_person_army is a SYNERGY (brawler path), not an XP grant path —
//      there is no numeric XP-on-kill in the engine to farm.
//   2. registerDeath creates exactly ONE corpse per death (no dup corpses).
//   3. lootCorpse is idempotent: re-looting the same corpse yields nothing
//      new (no corpse-loot duplication loop).
//   4. generatePossessions is bounded (1-2 items from a fixed pool) —
//      kill-farming yields linear, finite loot, not escalating rewards.
'use strict';
const { freshGame } = require('./break-monsters-harness.js');

let pass = 0, fail = 0;
function ok(cond, label, detail) {
  if (cond) { pass++; console.log('  PASS', label); }
  else { fail++; console.log('  FAIL', label, detail === undefined ? '' : JSON.stringify(detail)); }
}

(async () => {
  const Game = await freshGame(777);
  const fs = require('fs'), path = require('path');

  // 1. one_person_army: synergy, not an XP path. No XP-on-kill in the engine.
  const syns = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'src/data/synergies.json'), 'utf8'));
  const opa = syns.find(s => s.id === 'one_person_army');
  ok(!!opa && Array.isArray(opa.paths) && opa.paths.includes('brawler'),
     'one_person_army is a brawler synergy, not an XP grant');
  const allSrc = ['src/js/game.js', 'src/js/corpses.js', 'src/js/progression.js']
    .map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
  ok(!/xp\s*\+=|gainXP|grantXP|addXP/i.test(allSrc),
     'no numeric XP-on-kill path exists in game/corpses/progression');

  // 2. Exactly one corpse per death.
  const before = Game.corpses().length;
  Game.registerDeath({ kind: 'monster', monsterId: 'hushwolf', name: 'Hushwolf', cause: 'combat' });
  ok(Game.corpses().length === before + 1, 'one death -> exactly one corpse');

  // 3. lootCorpse anti-duplication: the total units ever taken from a corpse
  // can never exceed what the corpse held. Loot-as-action takes per unit;
  // repeated looting drains the corpse to zero, then yields nothing.
  const corpse = Game.corpses()[Game.corpses().length - 1];
  const origUnits = corpse.items.reduce((t, i) => t + (i.units == null ? 1 : i.units), 0);
  const invKey = (it) => (it.name || '') + '|' + (it.plantId || '');
  const invUnits = () => (Game.state.scholar.inventory || [])
    .reduce((t, i) => t + (i.units == null ? 1 : i.units), 0);
  const startUnits = invUnits();
  let took = 0, rounds = 0;
  for (rounds = 0; rounds < 40; rounds++) {
    const n0 = invUnits();
    Game.lootCorpse(corpse.id, true);
    const gained = invUnits() - n0;
    took += gained;
    if (gained === 0) break;
  }
  const corpseLeft = corpse.items.reduce((t, i) => t + (i.units == null ? 1 : i.units), 0);
  ok(took <= origUnits,
     'total looted units never exceed what the corpse held (no duplication)',
     { took, origUnits });
  ok(corpseLeft === 0, 'drained corpse holds zero units');
  const n1 = invUnits();
  Game.lootCorpse(corpse.id, true);
  ok(invUnits() === n1, 'looting a drained corpse grants nothing new');

  // 4. Possessions bounded: 30 kills -> item counts stay small and linear.
  let totalItems = 0, maxItems = 0;
  for (let i = 0; i < 30; i++) {
    const c = Game.registerDeath({ kind: 'monster', monsterId: 'hushwolf',
      name: 'Hushwolf', cause: 'combat' });
    totalItems += c.items.length; maxItems = Math.max(maxItems, c.items.length);
  }
  ok(maxItems <= 4, 'per-kill possessions bounded (<=4)', { maxItems });
  ok(totalItems <= 30 * 4, '30 kills yield linear, finite loot', { totalItems });

  console.log(`\nkill-grants: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
