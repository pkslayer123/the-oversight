// Play harness for monster batch 4 (corporate horrors). NOT the formal test.
// Usage: node scripts/play-monbatch4.js [review_drone|camera_swarm|hype_horn|delegate_beast|all]
// Scripted playthroughs; prints the encounter log at key beats so a human
// can READ the fight like a player and feel the phases/telegraphs/counterplay.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

function flatGrid() { return Array.from({ length: 9 }, () => Array(9).fill('grass')); }
function fireGrid(fx, fy) {
  return () => { const g = flatGrid(); g[fy][fx] = 'fire'; return g; };
}
function giveSpear() {
  const s = Game.state.scholar;
  const def = (Game.data.items || []).find(i => i.id === 'fire_hardened_spear') || {};
  s.inventory = s.inventory || [];
  s.inventory.push({ itemId: 'fire_hardened_spear', units: 1, kcalEach: 0, kg: 0.5, name: def.name || 'fire-hardened spear', bonded: true, bond: 0, bondOffered: [], enhancements: [] });
  s.equipped = s.equipped || {};
  s.equipped.weapon = { itemId: 'fire_hardened_spear', name: def.name || 'fire-hardened spear' };
}
function placeVillagers(spots) {
  const v = Game.state.village;
  const ids = (v.roster || []).filter(rid => rid !== Game.villagerId);
  v.positions = v.positions || {};
  spots.forEach((sp, i) => { if (ids[i]) v.positions[ids[i]] = { mx: sp[0], my: sp[1] }; });
  return ids.slice(0, spots.length);
}

function setup(monsterId, opts = {}) {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = opts.px ?? 4; s.my = opts.py ?? 4; s.kcal = 3000; s.energy = 60; s.health = 100;
  Game.genDetail = opts.grid || flatGrid;
  Game.log = [];
  giveSpear();
  if (opts.villagers) placeVillagers(opts.villagers);
  s.monster = { id: monsterId, mx: opts.mx ?? 7, my: opts.my ?? 4 };
  Game.startCombat(monsterId);
  return s;
}
const P = () => Game.tbFighter('p');
const M = () => Game.tbfight && Game.tbfight.fighters.find(f => f.kind === 'monster' && f.alive);
const cheb = (a, b, c, d) => Math.max(Math.abs(a - c), Math.abs(b - d));
let mark = 0;
function beat(title) {
  const lines = Game.log.slice(mark);
  mark = Game.log.length;
  const mon = M();
  console.log(`\n===== ${title} =====`);
  console.log(`[grid] you=(${P().mx},${P().my}) hp=${Math.round(P().hp)}` +
    (mon ? ` | foe=(${mon.mx},${mon.my}) hp=${Math.round(mon.hp)} phase=${mon.beamPhase}${Game.encPhaseBadge ? Game.encPhaseBadge(mon) : ''}` : ' | foe=GONE') +
    ` | queue=${mon ? (mon.threatQueue || []).join(',') : '-'}`);
  for (const l of lines) console.log('  ' + l);
}
function pass() { // run AI turns until it's the player's turn again
  if (!Game.tbfight) return;
  const cur = Game.tbCurrent();
  if (cur && cur.kind !== 'player') {
    // an AI turn is pending (e.g. fast monster opens): run it directly,
    // then continue advancing to the player.
    if (cur.kind === 'villager') Game.tbVillagerTurn(cur);
    else Game.tbMonsterTurn(cur);
    if (Game.tbfight && !Game.tbfight.over) Game.tbAdvance();
    return;
  }
  Game.tbPlayerEndTurn();
}
function move(x, y) {
  if (!Game.tbIsPlayerTurn()) { console.log('  (not player turn, cannot move)'); return; }
  Game.tbPlayerMove(x, y);
}
function strike() {
  const m = M(); if (!m) return;
  Game.tbPlayerStrike(m.key);
}
function safeCell(cells, maxD) {
  const p = P();
  const set = new Set(cells.map(c => c.cx + ',' + c.cy));
  let best = null, bestD = 99;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    if (set.has(x + ',' + y)) continue;
    const d = cheb(p.mx, p.my, x, y);
    if (d > maxD || d === 0) continue;
    const cell = Game.genDetail()[y][x];
    if (Game.cellProps(cell).blocks) continue;
    if (d < bestD) { bestD = d; best = [x, y]; }
  }
  return best;
}

function playDrone() {
  console.log('\n########## PLAY: review_drone (Performance Review) ##########');
  setup('review_drone', { px: 4, py: 4, mx: 7, my: 4 });
  beat('FIRST SIGHTING — it notices you');
  pass(); // monster declares
  beat('TELEGRAPH — the 3-count begins');
  const cells = M().telegraph.cells;
  const [sx, sy] = safeCell(cells, 3);
  console.log(`  (player reads the projected line, steps to (${sx},${sy}))`);
  move(sx, sy);
  pass(); beat('COUNTDOWN — "TWO."');
  pass(); beat('COUNTDOWN — "ONE."');
  pass(); beat('CORRECT — you were NOT on the line');
  pass(); beat('RECALC — breather');
  // round 2: stand on the line this time — take the hit, watch efficiency fall
  pass(); beat('ROUND 2 — it declares again');
  if (M().telegraph) {
    const c2 = new Set(M().telegraph.cells.map(c => c.cx + ',' + c.cy));
    const p = P();
    const onLine = c2.has(p.mx + ',' + p.my);
    console.log(`  (player is ${onLine ? 'ON' : 'OFF'} the announced line — standing still to feel it)`);
  }
  pass(); pass(); pass();
  beat('CORRECT — standing on the line');
  // crowd test: bring friends — it can't grade a crowd
  console.log('\n  --- new setup: two villagers beside you ---');
  setup('review_drone', { px: 4, py: 4, mx: 7, my: 4, villagers: [[3, 4], [5, 4]] });
  for (const f of Game.tbfight.fighters) if (f.kind === 'villager') f.ai = 'brave';
  beat('FIRST SIGHTING — with friends');
  pass();
  beat('CROWD — it can\'t grade a crowd');
}

function playSwarm() {
  console.log('\n########## PLAY: camera_swarm (Influencer) ##########');
  setup('camera_swarm', { px: 4, py: 4, mx: 7, my: 4 });
  beat('FIRST SIGHTING — the tide pours in');
  pass(); // chase + declare
  beat('TELEGRAPH — flashes building, it closes in');
  const p = P();
  // run 3 tiles away
  move(p.mx, Math.max(0, p.my - 3));
  console.log('  (player runs — keep moving)');
  pass(); beat('BUILD — it creeps closer while winding up');
  pass(); beat('FLASH — did it miss? escalation?');
  // fire test: fresh setup, campfire nearby
  console.log('\n  --- new setup: campfire at (4,2), swarm at (6,4) ---');
  setup('camera_swarm', { px: 4, py: 4, mx: 6, my: 4, grid: fireGrid(4, 2) });
  beat('FIRST SIGHTING — near fire');
  pass();
  beat('SCATTER — lead it into hazards');
}

function playHorn() {
  console.log('\n########## PLAY: hype_horn (Motivational Speaker) ##########');
  setup('hype_horn', { px: 4, py: 4, mx: 7, my: 4 });
  beat('FIRST SIGHTING — "HELLO, CHAMPION!"');
  pass();
  beat('TELEGRAPH — it inflates');
  const p = P();
  move(p.mx, 0); // 4 tiles north — out of radius 3
  console.log('  (player gets CLEAR — 4 squares out)');
  pass(); beat('ENCOURAGE — "YOU\'RE A WINNER!"');
  pass(); beat('ENCOURAGE — "NEVER GIVE UP!"');
  pass(); beat('DETONATE — did distance save you?');
  pass(); beat('DEFLATE — spent');
  // crowd test
  console.log('\n  --- new setup: two villagers beside you ---');
  setup('hype_horn', { px: 4, py: 4, mx: 7, my: 4, villagers: [[3, 4], [5, 4]] });
  for (const f of Game.tbfight.fighters) if (f.kind === 'villager') f.ai = 'brave';
  beat('FIRST SIGHTING — with friends');
  pass();
  beat('CROWD — it can\'t encourage a crowd');
}

function playBeast() {
  console.log('\n########## PLAY: delegate_beast (Middle Manager) ##########');
  setup('delegate_beast', { px: 4, py: 4, mx: 7, my: 4 });
  beat('FIRST SIGHTING — "Let\'s sync up!"');
  pass(); // circle turn
  beat('CIRCLE — it always circles first');
  pass(); // declare
  beat('ANNOUNCE — the line is set');
  const cells = M().telegraph.cells;
  const [sx, sy] = safeCell(cells, 4);
  console.log(`  (player reads the announced line, sidesteps to (${sx},${sy}))`);
  move(sx, sy);
  pass();
  beat('CHARGE — the announced line, exactly');
  pass();
  beat('DEBRIEF');
}

const which = process.argv[2] || 'all';
(async () => {
  await Game.init();
  if (which === 'all' || which === 'review_drone') playDrone();
  if (which === 'all' || which === 'camera_swarm') playSwarm();
  if (which === 'all' || which === 'hype_horn') playHorn();
  if (which === 'all' || which === 'delegate_beast') playBeast();
  console.log('\n(done)');
})();
