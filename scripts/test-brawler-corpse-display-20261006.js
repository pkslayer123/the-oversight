// Regression: corpse-loot display names + confrontation voice knowledge leak (2026-10-06).
// BUG 1: looting a victim's carried tools from their corpse said
//   "Taken: unfamiliar plant matter x1." — the betrayal transfer (party.js 8f9eb4e)
//   stamps plantId with non-plant ids ('stone_knife', 'effect_0', 'keepsake'),
//   and itemDisplayName routed every plantId through plantDisplayName.
// BUG 2: justiceConfront's voice named unwitnessed crimes ("Someone's dead.
//   And everyone knows whose hands") even when nobody saw anything — the
//   same knowledge-leak class as the moot summons (summons_voice rule).
// Usage: node scripts/test-brawler-corpse-display-20261006.js (exit 1 on failure)
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
const said = [];
const origSay = Game.say;
Game.say = function (m) { said.push(String(m)); return origSay.call(this, m); };
const feed = () => { const s = Game.state.scholar; s.kcal = 2400; s.hydration = 100; s.health = 100; };
const endTurn = () => { if (Game.tbfight && Game.tbIsPlayerTurn()) { try { Game.tbPlayerEndTurn(); } catch (e) {} } };

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.tickAction = () => {};
  feed();
  const v = Game.state.village, me = Game.villagerId;
  const others = () => v.roster.filter(id => id !== me);
  const victim = others()[1];

  // --- BUG 1: corpse loot display names ---
  Game.vpOf(victim).items = ['stone_knife', 'lighter'];
  Game.playerAttacks(victim);
  let guard = 0;
  while (Game.tbfight && guard++ < 80) {
    const foe = Game.tbfight.fighters.find(f => f.key !== 'p' && f.alive && !f.fled);
    if (!foe) break;
    foe._yielded = true;
    if (foe.hp > 15) { Game.tbPlayerStrike(foe.key); endTurn(); } else break;
  }
  if (Game.tbfight) {
    const foe = Game.tbfight.fighters.find(f => f.key !== 'p' && f.alive && !f.fled);
    if (foe) Game.tbDamage(foe.key, 999, 'the last blow', 'p');
    try { Game.tbEndCheck(); } catch (e) {}
    endTurn();
  }
  check('kill completed', !Game.tbfight);
  const c = (Game.corpses ? Game.corpses() : []).find(x => x.kind === 'person' && x.villagerId === victim && !x.buried);
  check('corpse found', !!c);
  Game.map.px = c.node.x; Game.map.py = c.node.y;
  Game.state.scholar.mx = c.mx; Game.state.scholar.my = c.my;

  const idxKnife = c.items.findIndex(i => (i.itemId || i.name) === 'stone_knife');
  said.length = 0;
  Game.corpseTakeItem(c.id, idxKnife);
  const takeMsg = said.find(m => m.startsWith('Taken:')) || '';
  check('taking a tool names the tool', /[Ss]tone knife/.test(takeMsg) && !/unfamiliar plant matter/.test(takeMsg),
    'msg=[' + takeMsg + ']');

  // synthetic generated-possession ids ('effect_*') and keepsakes must show names too
  const effect = (c.items || []).find(i => String(i.plantId || '').startsWith('effect_'));
  if (effect) check('effect_* possession shows its name, not plant matter',
    !/unfamiliar plant matter/.test(Game.itemDisplayName(effect)),
    'name=[' + Game.itemDisplayName(effect) + ']');
  const keep = (c.items || []).find(i => i.keepsake);
  if (keep) check('keepsake shows its name, not plant matter',
    !/unfamiliar plant matter/.test(Game.itemDisplayName(keep)),
    'name=[' + Game.itemDisplayName(keep) + ']');

  // real plants still route through the knowledge-gated plant display
  const gated = Game.itemDisplayName({ plantId: 'dandelion', name: 'Dandelion' });
  check('real plants keep the gated display',
    gated === Game.plantDisplayName('dandelion'),
    'got=[' + gated + ']');

  // --- BUG 2: confrontation voice must not name unwitnessed crimes ---
  const j = Game.justiceState();
  j.crimes.length = 0;
  j.stage = 2; j.confrontedBy = null; j.pendingConfront = false;
  const v2 = others()[2];
  Game.recordCrime('murder', { victim: v2, witnessed: false });
  said.length = 0;
  try { Game.justiceConfront(); } catch (e) { console.log('confront err: ' + e.message); }
  const confrontText = said.join(' ');
  check('confrontation fires', /⚖/.test(confrontText), confrontText.slice(0, 80));
  check('confrontation does not name the unwitnessed murder',
    !/dead|killed|whose hands|what you did|murder/i.test(confrontText),
    confrontText.slice(0, 120));

  // and the witnessed case still works: a witnessed murder gets the murder branch
  j.crimes.length = 0;
  j.confrontedBy = null; j.pendingConfront = false;
  Game.recordCrime('murder', { victim: v2, witnessed: true });
  said.length = 0;
  try { Game.justiceConfront(); } catch (e) {}
  const confrontText2 = said.join(' ');
  check('witnessed murder still gets the murder-branch confrontation',
    /dead|killed|whose hands|what you did|murder/i.test(confrontText2),
    confrontText2.slice(0, 120));

  if (failures.length) { console.log('FAILURES: ' + failures.join('; ')); process.exit(1); }
  console.log('ALL CORPSE-DISPLAY TESTS PASS');
})().catch(e => { console.error('TEST ERROR:', e && e.stack || e); process.exit(1); });
