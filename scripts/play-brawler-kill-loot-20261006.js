// PLAYTEST: brawler kill-and-loot arc (2026-10-06).
// As a player: shakedown a villager, they snap, fight, KILL them (witnessed),
// then live with it: the corpse, loot-as-action per item, first-touch trauma,
// rot over days, and the village justice response.
// Usage: node scripts/play-brawler-kill-loot-20261006.js
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
const T = [];
const origSay = Game.say, origSys = Game.sysSay;
Game.say = function (m) { T.push('  | ' + m); return origSay.call(this, m); };
Game.sysSay = function (m) { T.push('  | [SYS] ' + m); return origSys.call(this, m); };
const beat = (t) => { console.log('\n' + '='.repeat(64) + '\n  ' + t + '\n' + '='.repeat(64)); for (const l of T.splice(0)) console.log(l); };
const invNames = () => (Game.state.scholar.inventory || []).map(i => i.itemId || i.name);
const endTurn = () => { if (Game.tbfight && Game.tbIsPlayerTurn()) { try { Game.tbPlayerEndTurn(); } catch (e) {} } };
const feed = () => { const s = Game.state.scholar; s.kcal = 2400; s.hydration = 100; s.health = 100; };

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.tickAction = () => {};
  feed();
  const v = Game.state.village, me = Game.villagerId;
  const others = () => v.roster.filter(id => id !== me);

  console.log('I am:', Game.displayName(me), '| village size:', v.roster.length);
  const victim = others()[2];
  const witness = others()[3];
  Game.vpOf(victim).items = ['stone_knife', 'dried_meat', 'lighter'];
  console.log('victim:', Game.displayName(victim), '| witness nearby:', Game.displayName(witness));

  // BEAT 1: the shakedown
  console.log('\n>>> "Your food. Now."');
  const inv0 = invNames().join(',');
  Game.intimidate(victim);
  beat('SHAKEDOWN');

  // BEAT 2: the fight. Witness joins? Force fight via playerAttacks.
  if (!Game.tbfight) Game.playerAttacks(victim);
  console.log('>>> fight fighters:', (Game.tbfight && Game.tbfight.fighters || []).map(f => `${f.key}:${f.kind}:${f.name||''} hp=${Math.round(f.hp||0)}`).join(' | '));
  let guard = 0;
  while (Game.tbfight && guard++ < 80) {
    const foe = Game.tbfight.fighters.find(f => f.key !== 'p' && f.alive && !f.fled);
    if (!foe) break;
    foe._yielded = true; // no mercy arc this run — the killing blow is the point
    if (foe.hp > 15) { Game.tbPlayerStrike(foe.key); endTurn(); }
    else break;
  }
  if (Game.tbfight) {
    const foe = Game.tbfight.fighters.find(f => f.key !== 'p' && f.alive && !f.fled);
    if (foe) Game.tbDamage(foe.key, 999, 'the last blow', 'p');
    try { Game.tbEndCheck(); } catch (e) {}
    endTurn();
  }
  beat('THE KILL');
  check('fight ended', !Game.tbfight);

  const invAfter = invNames().join(',');
  check('no auto-loot of victim items',
    !invAfter.includes('stone_knife') && !invAfter.includes('lighter') && !invAfter.includes('dried_meat'),
    'inv=[' + invAfter.slice(0, 120) + ']');

  const corpses = Game.corpses();
  const c = corpses.find(x => x.kind === 'person' && x.villagerId === victim && !x.buried);
  check('corpse entity registered', !!c);
  const citems = (c && c.items || []).map(i => i.itemId || i.name);
  check('carried items on the corpse, profile cleared',
    citems.includes('stone_knife') && citems.includes('lighter') && !(Game.vpOf(victim).items || []).length,
    'corpse=[' + citems.join(',') + ']');

  // justice: attack + murder crimes on the books
  const j = Game.justiceState();
  const murder = j.crimes.find(x => x.type === 'murder' && x.victim === victim);
  const attack = j.crimes.find(x => x.type === 'attack' && x.victim === victim);
  check('murder crime recorded', !!murder);
  check('attack crime recorded', !!attack);
  console.log('>>> murder.witnessed=' + (murder && murder.witnessed) + ' attack.witnessed=' + (attack && attack.witnessed) + ' heat=' + Game.justiceHeat());

  // BEAT 3: the body. Stand over it.
  Game.map.px = c.node.x; Game.map.py = c.node.y;
  Game.state.scholar.mx = c.mx; Game.state.scholar.my = c.my;
  console.log('\n>>> I kneel by the body.');
  Game.examineCorpse(c.id);
  beat('EXAMINE');

  // BEAT 4: loot as action — take the knife, leave the rest.
  const idx = c.items.findIndex(i => (i.itemId || i.name) === 'stone_knife');
  const trauma0 = Game.state.scholar.trauma || 0;
  const n0 = invNames().filter(n => n === 'stone_knife').length;
  Game.corpseTakeItem(c.id, idx);
  const n1 = invNames().filter(n => n === 'stone_knife').length;
  check('deliberate take: exactly one stack into pack', n1 === n0 + 1, `${n0}->${n1}`);
  check('first touch applied trauma', (Game.state.scholar.trauma || 0) > trauma0,
    'trauma ' + trauma0 + ' -> ' + (Game.state.scholar.trauma || 0));
  beat('LOOT: TAKE THE KNIFE');

  // leave the rest: the keepsake, the food. Rot check next.
  console.log('>>> I leave the rest. The photo stays with them.');
  console.log('>>> rot read on the body: ' + JSON.stringify(Game.corpseMeatRead(c)));

  // BEAT 5: days pass. Stages advance, rot is announced if any, body persists.
  const day0 = Game.state.scholar.day;
  for (let d = 0; d < 4; d++) { try { Game.endDay(); } catch (e) { console.log('endDay err: ' + e.message); } feed(); }
  const c2 = Game.corpses().find(x => x.id === c.id);
  check('corpse persists 4 days later', !!c2 && !c2.buried);
  console.log('>>> body stage after 4 days:', c2 && Game.corpseStageInfo(c2).id, '| items left:', (c2.items || []).map(i => (i.itemId || i.name) + 'x' + (i.units || 1)).join(','));
  Game.examineCorpse(c.id);
  beat('FOUR DAYS LATER');

  // BEAT 6: justice response.
  for (let p = 0; p < 6; p++) { try { Game.justiceTick(); } catch (e) {} }
  console.log('>>> stage=' + Game.justiceStage() + ' heat=' + Game.justiceHeat());
  Game.justiceConfront(victim);
  beat('JUSTICE');

  // BEAT 7: burial closes the loop.
  Game.buryCorpse(c.id);
  const c3 = Game.corpses().find(x => x.id === c.id);
  check('burial marks the corpse buried', !!c3 && !!c3.buried);
  const idxLeft = (c3.items || []).findIndex(i => (i.units == null ? 1 : i.units) > 0);
  console.log('>>> items left on buried corpse:', idxLeft === -1 ? 'none' : c3.items[idxLeft].name);
  beat('BURIAL');

  if (failures.length) { console.log('\nFAILURES: ' + failures.join('; ')); process.exit(1); }
  console.log('\nALL KILL-LOOT ARC CHECKS PASS');
})().catch(e => { console.error('PLAYTEST ERROR:', e && e.stack || e); process.exit(1); });
