// TELEGRAPH DEPTH — nightlight_catfish (Steve 2026-10-06)
// Asserts: the still phase escalates (rotating lines, never 3 identical in a
// row), the glow creeps toward the player (no permanent stall at distance
// 3-4), the full lure → still → grasp → dark → lure cycle, the still-tell
// cell is knowledge-gated.
// Run: node scripts/test-telegraph-depth-catfish.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
function flatGrid() { return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')); }
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name); }
}
const P = () => Game.tbFighter('p');
const M = () => Game.tbfight.fighters.find(x => x.kind === 'monster');
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function learn(id) {
  const atkName = ((Game.data.monsters.find(m => m.id === id) || {}).attack || {}).name;
  Game.state.codex.monsters = Game.state.codex.monsters || {};
  const c = Game.state.codex.monsters[id] || (Game.state.codex.monsters[id] = {});
  c.patterns = c.patterns || {};
  if (atkName) c.patterns[atkName] = 'test-learned';
  c.stage = 'observed';
}
(async () => {
  await Game.init();
  Game.audioEvent = () => {};
  Game.genDetail = () => flatGrid();

  // ---- DATA ----
  const c = Game.data.monsters.find(m => m.id === 'nightlight_catfish');
  const enc = c.encounter || {};
  ok(JSON.stringify(enc.phases) === JSON.stringify(['lure', 'still', 'grasp', 'dark']),
    'phases: lure → still → grasp → dark');
  ok(enc.phaseBadges && enc.phaseBadges.lure && enc.phaseBadges.still && enc.phaseBadges.grasp && enc.phaseBadges.dark,
    'phaseBadges cover all four phases');
  ok(!!enc.knownCue, 'knownCue present');
  ok(c.armor === 4, 'armor sane for a big whiskered predator (4)');

  // ---- FIGHT: still-phase escalation (the old stall zone: distance 3) ----
  const says = [];
  Game.say = (t) => says.push(String(t));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = 1;
  Game.state.scholar.health = 900;
  Game.canSee = () => true;
  Game.startCombat('nightlight_catfish');
  P().hp = P().maxHp = 900;
  const m = M(); m.hp = m.maxHp = 900;
  P().mx = Math.max(0, m.mx - 3); P().my = m.my; // distance 3: the old dead zone
  const startPos = m.mx + ',' + m.my;
  const stillLines = [];
  let phases = [];
  for (let i = 0; i < 12 && Game.tbfight && !Game.tbfight.over; i++) {
    const ph = M().beamPhase;
    if (phases[phases.length - 1] !== ph) phases.push(ph);
    says.length = 0;
    endTurn();
    const ph2 = M() ? M().beamPhase : '?';
    if (phases[phases.length - 1] !== ph2) phases.push(ph2);
    if (M().beamPhase === 'still') {
      const l = says.find(s => /still|quiet|glow|creeps/i.test(s));
      if (l) stillLines.push(l);
    }
    if (M().beamPhase === 'dark' || M().beamPhase === 'grasp') break;
  }
  Game.say = () => {};
  ok(/lure.*still/.test(phases.join('>')), 'lure → still observed: ' + phases.join('>'));
  // the still lines rotate — never 3 identical in a row
  let triple = false;
  for (let i = 2; i < stillLines.length; i++) {
    if (stillLines[i] === stillLines[i - 1] && stillLines[i] === stillLines[i - 2]) triple = true;
  }
  ok(!triple && stillLines.length >= 2, 'still lines rotate, never 3 identical (' + stillLines.length + ' still beats)');
  ok(new Set(stillLines).size > 1, 'more than one distinct still line: ' + new Set(stillLines).size);
  // the glow creeps: it must reach grasp range (no permanent stall)
  const reached = phases.includes('grasp') || phases.includes('dark');
  ok(reached, 'the stillness closes → grasp (no permanent stall at distance 3): ' + phases.join('>'));
  ok(m.mx + ',' + m.my !== startPos, 'the glow drifted toward the player during still');

  // ---- still-tell cell: knowledge-gated ----
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = 1;
  Game.state.scholar.health = 900;
  Game.startCombat('nightlight_catfish');
  P().hp = P().maxHp = 900;
  const m2 = M(); m2.hp = m2.maxHp = 900;
  P().mx = Math.max(0, m2.mx - 3); P().my = m2.my;
  for (let i = 0; i < 6 && Game.tbfight && !Game.tbfight.over; i++) {
    endTurn();
    if (M().beamPhase === 'still') break;
  }
  ok(M().beamPhase === 'still', 'reached still phase');
  ok(Game.catfishTellCell() === null, 'tell cell hidden when pattern unknown');
  learn('nightlight_catfish');
  const tell = Game.catfishTellCell();
  ok(tell && tell.x === M().mx && tell.y === M().my, 'tell cell shows on the catfish tile once learned');

  console.log(`\ncatfish: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
