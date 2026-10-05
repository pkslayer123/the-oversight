// Storage / tools / stash / cache tests. Usage: node scripts/test-storage.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
function lastSay() { return (Game.log || []).slice(-1)[0] || ''; }

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  // player at center of detail grid
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  Game.state.scholar.inventory = [];
}
function plantTree(kind, cx, cy) {
  const d = Game.genDetail(Game.map.px, Game.map.py);
  d[cy][cx] = kind; // 'tree' | 'bigtree' | 'bush'
  return d;
}
function give(itemId, name) {
  Game.state.scholar.inventory.push({ itemId, name: name || itemId, units: 1, kcalEach: 0, kg: 0.8 });
}

(async () => {
  await Game.init();

  // ---------- 1. tool tags in data ----------
  freshGame();
  const hatchetDef = Game.data.items.find(i => i.id === 'hatchet');
  eq('hatchet tagged fell', hatchetDef.tool.woodcut, 'fell');
  eq('hand_saw tagged prune', Game.data.items.find(i => i.id === 'hand_saw').tool.woodcut, 'prune');
  eq('machete tagged brush', Game.data.items.find(i => i.id === 'machete').tool.woodcut, 'brush');
  ok('branch material exists', !!Game.data.items.find(i => i.id === 'branch'));
  ok('fiber material exists', !!Game.data.items.find(i => i.id === 'fiber'));

  // ---------- 2. woodcutTier ----------
  eq('bare hands tier', Game.woodcutTier().tier, 'none');
  give('hand_saw', 'Hand Saw');
  eq('saw tier prune', Game.woodcutTier().tier, 'prune');
  give('hatchet', 'Hatchet');
  eq('hatchet wins -> fell', Game.woodcutTier().tier, 'fell');

  // ---------- 3. cutInfo hints ----------
  freshGame();
  let ci = Game.cutInfo('tree');
  eq('no tool: cannot fell', ci.canFell, false);
  ok('no tool hint mentions axe', /axe/.test(ci.hint));
  give('hand_saw', 'Hand Saw');
  ci = Game.cutInfo('bigtree');
  eq('saw cannot fell bigtree', ci.canFell, false);
  eq('saw can prune', ci.canPrune, true);
  ok('saw hint mentions branches not trunks', /branches, not trunks/.test(ci.hint));
  give('hatchet', 'Hatchet');
  ci = Game.cutInfo('bigtree');
  eq('axe can fell bigtree', ci.canFell, true);

  // ---------- 4. cutTree gating: no axe, no felling ----------
  freshGame();
  plantTree('tree', 5, 4);
  const woodBefore = Game.woodCount();
  Game.cutTree(5, 4);
  const d1 = Game.genDetail(Game.map.px, Game.map.py);
  eq('tree still standing without axe', d1[4][5], 'tree');
  eq('no wood gained without axe', Game.woodCount(), woodBefore);
  ok('say explains need axe', /axe/i.test(lastSay()));

  // ---------- 5. cutTree with hatchet works ----------
  give('hatchet', 'Hatchet');
  Game.cutTree(5, 4);
  const d2 = Game.genDetail(Game.map.px, Game.map.py);
  eq('tree felled with axe', d2[4][5], 'dirt');
  ok('wood gained with axe', Game.woodCount() > woodBefore);

  // ---------- 6. bigtree + saw = blocked, prune works ----------
  freshGame();
  plantTree('bigtree', 5, 4);
  give('hand_saw', 'Hand Saw');
  const wb = Game.woodCount();
  Game.cutTree(5, 4);
  const d3 = Game.genDetail(Game.map.px, Game.map.py);
  eq('bigtree stands vs saw', d3[4][5], 'bigtree');
  eq('no wood from blocked fell', Game.woodCount(), wb);
  const brBefore = Game.materialCount('branch');
  Game.pruneBranches(5, 4);
  ok('prune yields branches', Game.materialCount('branch') > brBefore);
  const d4 = Game.genDetail(Game.map.px, Game.map.py);
  eq('tree survives pruning', d4[4][5], 'bigtree');

  // ---------- 7. prune bare hands blocked ----------
  freshGame();
  plantTree('tree', 5, 4);
  Game.pruneBranches(5, 4);
  eq('no branches bare-handed prune', Game.materialCount('branch'), 0);
  ok('prune refusal mentions saw or axe', /saw|axe/i.test(lastSay()));

  // ---------- 8. gatherFallen: always available ----------
  freshGame();
  plantTree('tree', 5, 4);
  Game.gatherFallen(5, 4);
  ok('deadfall yields branch, no tool', Game.materialCount('branch') >= 1);

  // ---------- 9. clearBrush: machete fast + fiber ----------
  freshGame();
  plantTree('bush', 5, 4);
  give('machete', 'Machete');
  const ticksBefore = Game.state.scholar.dayTicks || 0;
  Game.clearBrush(5, 4);
  const ticksAfter = Game.state.scholar.dayTicks || 0;
  eq('machete clears brush in 16 ticks', ticksAfter - ticksBefore, 16);
  ok('clearing yields fiber', Game.materialCount('fiber') >= 1);
  const d5 = Game.genDetail(Game.map.px, Game.map.py);
  eq('brush becomes grass', d5[4][5], 'grass');

  // ---------- 10. materials helpers ----------
  freshGame();
  Game.addMaterial('stone', 4);
  eq('materialCount stone', Game.materialCount('stone'), 4);
  ok('spendMaterial true', Game.spendMaterial('stone', 3));
  eq('stone left', Game.materialCount('stone'), 1);
  ok('spend too much false', !Game.spendMaterial('stone', 5));

  // ---------- 11. stash donate/take + ledger ----------
  freshGame();
  Game.addMaterial('branch', 10);
  Game.donateMaterial('branch', 10);
  eq('stash has branches', Game.stashState().materials.branch, 10);
  eq('carried branches gone', Game.materialCount('branch'), 0);
  ok('ledger has give entry', Game.stashLedgerText(5).includes('left 10× Branch'));
  Game.takeMaterial('branch', 5);
  eq('stash reduced', Game.stashState().materials.branch, 5);
  eq('carried 5 branches', Game.materialCount('branch'), 5);
  ok('ledger has take entry', Game.stashLedgerText(5).includes('took 5× Branch'));

  // ---------- 12. stash trust: chronic taker noticed ----------
  // Seed the stash as if villagers contributed, then take far more than given.
  freshGame();
  Game.stashState().materials.fiber = 50; // the village's pile
  Game.addMaterial('fiber', 10);
  Game.donateMaterial('fiber', 10);
  const vid = Game.state.scholar.villagerId;
  Game.state.village.trust = Game.state.village.trust || {};
  const trustBefore = Game.state.village.trust[vid] || 15;
  for (let i = 0; i < 8; i++) Game.takeMaterial('fiber', 5); // takes 40, gave 10 -> net -30
  const trustAfter = Game.state.village.trust[vid];
  ok('chronic taking costs trust', trustAfter < trustBefore);

  // ---------- 13. villageTrustLevel ----------
  freshGame();
  const v = Game.state.village;
  v.trust = {};
  (v.roster || []).filter(id => id !== Game.villagerId).forEach(id => v.trust[id] = 80);
  eq('high trust -> open', Game.villageTrustLevel(), 'open');
  (v.roster || []).filter(id => id !== Game.villagerId).forEach(id => v.trust[id] = 10);
  eq('low trust -> closed', Game.villageTrustLevel(), 'closed');

  // ---------- 14. tool stash round-trip ----------
  freshGame();
  give('hand_saw', 'Hand Saw');
  ok('saw is stashable', Game.isStashableTool(Game.state.scholar.inventory[0]));
  Game.donateTool(0);
  eq('stash has saw', Game.stashState().tools.length, 1);
  eq('inventory saw gone', Game.state.scholar.inventory.length, 0);
  Game.takeTool('hand_saw');
  eq('stash saw gone', Game.stashState().tools.length, 0);
  eq('saw back in inventory', Game.state.scholar.inventory.length, 1);

  // ---------- 15. bury + dig up ----------
  freshGame();
  Game.addMaterial('branch', 6);
  Game.buryCache('material', 'branch', 4);
  eq('one cache', Game.playerCaches().length, 1);
  eq('4 branches buried', Game.materialCount('branch'), 2);
  ok('codex places noted', (Game.state.codex.places || []).some(p => /buried/i.test(p.text)));
  const cid = Game.playerCaches()[0].id;
  Game.digUpCache(cid);
  eq('cache gone after dig', Game.playerCaches().length, 0);
  eq('branches back', Game.materialCount('branch'), 6);

  // ---------- 16. robbed cache ----------
  freshGame();
  Game.addMaterial('stone', 3);
  Game.buryCache('material', 'stone', 3);
  const c0 = Game.playerCaches()[0];
  c0.found = true; c0.items = [];
  Game.digUpCache(c0.id);
  eq('robbed cache removed', Game.playerCaches().length, 0);
  ok('disturbed message', /got here first|Disturbed/i.test(lastSay()));

  // ---------- 17. npcBatchTurn wrap doesn't crash; stash sim runs ----------
  freshGame();
  for (let i = 0; i < 5; i++) Game.npcBatchTurn();
  ok('batch turns run with stash hook', true);
  ok('stash state coherent', typeof Game.stashState().materials.wood === 'number');

  // ---------- 18. stashHtml renders ----------
  freshGame();
  const html = Game.stashHtml();
  ok('stashHtml mentions stash', /Village stash/.test(html));
  ok('stashHtml lists materials', /Wood log/.test(html));
  const ch = Game.cachesHtml();
  ok('cachesHtml renders', /Your caches/.test(ch));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
