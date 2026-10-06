// Regression: betrayal kills respect loot-as-action (2026-10-06).
// The betrayal-fight tbEnd missed the loot-as-action pass (f870716): it
// vacuumed the victim's pack into the player's inventory automatically.
// Now the victim's carried items go on their corpse; the player loots
// deliberately via corpseTakeItem. Proof test for the party.js fix.
// Usage: node scripts/test-brawler-corpse-loot-20261006.js (exit 1 on failure)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/journal.js', 'src/js/betrayal.js',
 'src/js/corpses.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const failures = [];
const check = (name, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
  if (!cond) failures.push(name);
};
const endTurn = () => { if (Game.tbfight && Game.tbIsPlayerTurn()) { try { Game.tbPlayerEndTurn(); } catch (e) {} } };
const invNames = () => (Game.state.scholar.inventory || []).map(i => i.itemId || i.name);

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.village, me = Game.villagerId;
  const feed = () => { const s = Game.state.scholar; s.kcal = 2400; s.hydration = 100; s.health = 100; };
  feed();

  const vid = v.roster.find(id => id !== me);
  // the victim carries real things
  Game.vpOf(vid).items = ['stone_knife', 'lighter'];
  const invBefore = invNames().join(',');

  Game.playerAttacks(vid);
  let guard = 0;
  while (Game.tbfight && guard++ < 60) {
    const foe = Game.tbfight.fighters.find(f => f.key !== 'p' && f.alive && !f.fled);
    if (!foe) break;
    foe._yielded = true;
    if (foe.hp > 15) Game.tbPlayerStrike(foe.key);
    else break;
    endTurn();
  }
  if (Game.tbfight) {
    const foe = Game.tbfight.fighters.find(f => f.key !== 'p' && f.alive && !f.fled);
    if (foe) Game.tbDamage(foe.key, 999, 'the last blow', 'p');
    try { Game.tbEndCheck(); } catch (e) {}
    endTurn();
  }
  check('fight ended in a kill', !Game.tbfight);

  // 1. no auto-loot: the victim's things are NOT in the player inventory
  const invAfter = invNames().join(',');
  check('no auto-loot into player inventory',
    !invAfter.includes('stone_knife') && !invAfter.includes('lighter'),
    'before=[' + invBefore + '] after=[' + invAfter + ']');

  // 2. the things are on the corpse
  const corpse = (Game.corpses ? Game.corpses() : []).find(c => c.kind === 'person' && c.villagerId === vid && !c.buried);
  check('corpse entity exists for the victim', !!corpse);
  const citems = (corpse && corpse.items || []).map(i => i.itemId || i.name);
  check('victim\'s carried items transferred to the corpse',
    citems.includes('stone_knife') && citems.includes('lighter'),
    'corpse items=[' + citems.join(',') + ']');
  check('victim profile items cleared (no double-existence)',
    !(Game.vpOf(vid).items || []).length);

  // 3. deliberate loot works: take one item via the corpse action
  if (corpse) {
    // corpseTakeItem checks range: put the player next to the body
    const s = Game.state.scholar;
    Game.map.px = corpse.node.x; Game.map.py = corpse.node.y;
    s.mx = corpse.mx; s.my = corpse.my;
    const idx = corpse.items.findIndex(i => (i.itemId || i.name) === 'stone_knife');
    const n0 = invNames().filter(n => n === 'stone_knife').length;
    Game.corpseTakeItem(corpse.id, idx);
    const n1 = invNames().filter(n => n === 'stone_knife').length;
    check('deliberate corpseTakeItem takes exactly one stack', n1 === n0 + 1,
      `stone_knife count ${n0} -> ${n1}`);
  }

  if (failures.length) { console.log('FAILURES:', failures.join('; ')); process.exit(1); }
  console.log('ALL CORPSE-LOOT TESTS PASS');
})().catch(e => { console.error('TEST ERROR:', e.message); process.exit(1); });
