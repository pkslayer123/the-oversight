// Corpse system tests. Usage: node scripts/test-corpses.js
// Covers Steve's design: corpses persist, real-time decay, looting with
// grossness (trauma), disease from rot, death as knowledge (codex-gated
// real-time sync), party auto-notification, witness consequences.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/food.js',
 'src/js/corpses.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
const said = [];
function freshGame() {
  said.length = 0;
  Game.say = function (t) { said.push(String(t)); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.health = 100; s.trauma = 0;
  Game.map.px = 3; Game.map.py = 3;
  Game.state.corpses = [];
  return s;
}
function mkPersonCorpse(trust, dayDied) {
  const s = Game.state.scholar;
  const vid = 'test_vid_' + Math.random().toString(36).slice(2, 6);
  Game.state.village.trust = Game.state.village.trust || {};
  Game.state.village.trust[vid] = trust;
  return Game.registerDeath({
    kind: 'person', villagerId: vid, name: 'Test Person',
    mx: 4, my: 4, cause: 'combat', witnesses: [],
  });
}

(async () => {
  await Game.init();

  // 1. registerDeath creates a persistent corpse
  freshGame();
  const c1 = Game.registerDeath({ kind: 'monster', monsterId: 'rat', monsterName: 'rat', name: 'rat', mx: 4, my: 4, witnesses: [] });
  ok('corpse created', Game.corpses().length === 1);
  ok('corpse has who/when/where', c1.dayDied === Game.state.scholar.day && c1.node.x === 3 && c1.mx === 4);
  ok('monster corpse has loot', c1.items.length >= 1);
  ok('fresh stage at death', Game.corpseStage(c1) === 0);

  // 2. decay stages advance with the clock
  freshGame();
  const c2 = Game.registerDeath({ kind: 'person', villagerId: 'vx', name: 'X', mx: 4, my: 4, witnesses: [] });
  const s2 = Game.state.scholar;
  ok('fresh at day 0', Game.corpseStage(c2) === 0);
  s2.day += 1; ok('stiff at day 1', Game.corpseStage(c2) === 1);
  s2.day += 1; ok('bloating at day 2', Game.corpseStage(c2) === 2);
  s2.day += 2; ok('rotting at day 4', Game.corpseStage(c2) === 3);
  s2.day += 4; ok('bones at day 8', Game.corpseStage(c2) === 4);
  s2.day += 30; ok('bones persist', Game.corpseStage(c2) === 4);

  // 3. grossness: known > stranger (trust bands), fresh > bones (trauma)
  freshGame();
  const friend = mkPersonCorpse(70, 0);   // trust 70
  const stranger = mkPersonCorpse(5, 0);  // trust 5
  const tFriendFresh = Game.corpseTrauma(friend, {});
  const tStrangerFresh = Game.corpseTrauma(stranger, {});
  ok('friend costs more trauma than stranger', tFriendFresh > tStrangerFresh);
  Game.state.scholar.day += 10; // bones
  const tFriendBones = Game.corpseTrauma(friend, {});
  ok('bones cost less trauma than fresh', tFriendBones < tFriendFresh);
  const mon = Game.registerDeath({ kind: 'monster', monsterId: 'rat', name: 'rat', mx: 4, my: 4, witnesses: [] });
  ok('monster looting is field-dressing (low trauma)', Game.corpseTrauma(mon, {}) <= 3);

  // 4. disease rises with rot
  const pFresh = STAGES_CHECK(0), pRot = STAGES_CHECK(3);
  ok('rotting more diseased than fresh', pRot > pFresh);
  function STAGES_CHECK(i) {
    // reach into module data via a fresh corpse at the right age
    freshGame();
    const c = Game.registerDeath({ kind: 'person', villagerId: 'vd', name: 'D', mx: 4, my: 4, witnesses: [] });
    const days = [0, 1, 2, 4, 10][i];
    Game.state.scholar.day += days;
    return Game.corpseStageInfo(c).diseaseP;
  }

  // 5. looting transfers items, costs trauma, can sicken
  freshGame();
  const c5 = mkPersonCorpse(40, 0);
  c5.items = [{ plantId: 'knife1', name: 'Worn knife', units: 1, kg: 0.2, kcalEach: 0, spoilDay: 9999 }];
  const trauma0 = Game.state.scholar.trauma;
  const hp0 = Game.state.scholar.health;
  Game.lootCorpse(c5.id, true);
  ok('loot transfers to inventory', Game.state.scholar.inventory.some(i => i.plantId === 'knife1'));
  ok('looting costs trauma', Game.state.scholar.trauma > trauma0);
  ok('corpse marked stripped when empty', c5.looted === true);
  // disease roll: force by stubbing random many times? just check the mechanic exists via stage info
  ok('fresh disease risk low', Game.corpseStageInfo(c5).diseaseP <= 0.05);

  // 6. keepsake costs extra
  freshGame();
  const c6 = mkPersonCorpse(40, 0);
  c6.items = [{ plantId: 'keepsake', name: 'A photograph', units: 1, kg: 0.1, kcalEach: 0, spoilDay: 9999, keepsake: true }];
  const tBase = Game.corpseTrauma(c6, {});
  const tKeep = Game.corpseTrauma(c6, { keepsake: true });
  ok('taking the keepsake costs extra', tKeep > tBase);

  // 7. codex attunement stages
  freshGame();
  ok('pre-System attunement 0', Game.codexAttunement() === 0);
  Game.state.systemArrived = true;
  ok('post-arrival attunement 1', Game.codexAttunement() === 1);
  Game.state.scholar.day = 15;
  ok('day 15 + arrived = attunement 2', Game.codexAttunement() === 2);

  // 8. real-time sync at attunement 2
  freshGame();
  Game.state.systemArrived = true;
  Game.state.scholar.day = 15;
  said.length = 0;
  const c8 = Game.registerDeath({ kind: 'person', villagerId: 'vsync', name: 'Sync Test', mx: 4, my: 4, witnesses: [] });
  ok('codex syncs death in real time', c8.deathKnown === true);
  ok('codex announces itself', said.some(t => /turns a page on its own/.test(t)));

  // 9. no sync at attunement 1 without witnessing
  freshGame();
  Game.state.systemArrived = true; // day 1 -> attunement 1
  said.length = 0;
  const c9 = Game.registerDeath({ kind: 'person', villagerId: 'vnosync', name: 'No Sync', mx: 4, my: 4, witnesses: [] });
  ok('no auto-sync before attunement 2', c9.deathKnown === false);

  // 10. party auto-notification
  freshGame();
  const s10 = Game.state.scholar;
  const pmId = 'party_member_1';
  Game.state.village.party = [pmId];
  Game.state.village.roster = Game.state.village.roster || [];
  if (!Game.state.village.roster.includes(pmId)) Game.state.village.roster.push(pmId);
  said.length = 0;
  const c10 = Game.registerDeath({ kind: 'person', villagerId: pmId, name: 'Party Pal', mx: 4, my: 4, witnesses: [] });
  ok('party death notifies immediately', c10.deathKnown === true);
  ok('party notification message', said.some(t => /is dead/.test(t)));

  // 11. examine confirms death (knowledge event)
  freshGame();
  const c11 = mkPersonCorpse(20, 0);
  ok('death not known before examining', c11.deathKnown === false);
  Game.examineCorpse(c11.id);
  ok('examining confirms the death', c11.deathKnown === true);

  // 12. pay respects reduces trauma, bury ends decay
  freshGame();
  const c12 = mkPersonCorpse(50, 0);
  Game.state.scholar.trauma = 20;
  Game.payRespects(c12.id);
  ok('respects steady you', Game.state.scholar.trauma < 20);
  ok('respects once only', Game.payRespects(c12.id) === null);
  Game.buryCorpse(c12.id);
  ok('burial removes the corpse', c12.buried === true);
  ok('buried corpse not listed at cell', Game.corpseAt(4, 4).filter(x => x.id === c12.id).length === 0);

  // 13. witness consequences: looting fresh person-corpse is observed
  freshGame();
  let observed = null;
  const origObserve = Game.observe.bind(Game);
  Game.observe = function (a, o) { observed = a; return origObserve(a, o); };
  const c13 = mkPersonCorpse(30, 0);
  c13.items = [{ plantId: 'rope1', name: 'Rope', units: 1, kg: 0.3, kcalEach: 0, spoilDay: 9999 }];
  // put a witness nearby
  const witId = 'witness_1';
  Game.state.village.positions = Game.state.village.positions || {};
  Game.state.village.positions[witId] = { mx: 4, my: 5 };
  Game.state.village.roster = Game.state.village.roster || [];
  if (!Game.state.village.roster.includes(witId)) Game.state.village.roster.push(witId);
  Game.lootCorpse(c13.id, true);
  ok('fresh corpse looting is socially observed', observed === 'loot_corpse');
  Game.observe = origObserve;

  // 14. old bones looting is not shunned
  freshGame();
  let observed2 = null;
  const origObserve2 = Game.observe.bind(Game);
  Game.observe = function (a, o) { observed2 = a; return origObserve2(a, o); };
  const c14 = mkPersonCorpse(30, 0);
  Game.state.scholar.day += 10; // bones
  c14.items = [{ plantId: 'bone_knife', name: 'Knife', units: 1, kg: 0.2, kcalEach: 0, spoilDay: 9999 }];
  Game.lootCorpse(c14.id, true);
  ok('bones looting is not socially punished', observed2 !== 'loot_corpse');
  Game.observe = origObserve2;

  // 15. glyphs by stage/kind
  freshGame();
  const cg = Game.registerDeath({ kind: 'person', villagerId: 'vg', name: 'G', mx: 4, my: 4, witnesses: [] });
  ok('fresh person glyph', Game.corpseGlyph(cg) === '😔');
  Game.state.scholar.day += 10;
  ok('bones glyph', Game.corpseGlyph(cg) === '🦴');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
