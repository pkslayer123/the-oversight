// TELEGRAPH DEPTH — ducks in a row (Steve 2026-10-06)
// Asserts the formation phase system: line_up → march → nip → regroup,
// segments never declare, duckLane knowledge-gated, knownCue gated,
// head-kill promotes the next duck.
// Run: node scripts/test-telegraph-depth-ducks.js
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
const segs = () => Game.tbfight.fighters.filter(x => x.kind === 'monster' && x.alive);
const head = () => segs().find(s => s.isHead);
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
  Game.say = () => {};
  Game.audioEvent = () => {};
  Game.genDetail = () => flatGrid();

  // ---- DATA: phase system declared in order ----
  const d = Game.data.monsters.find(m => m.id === 'ducks_in_a_row');
  const enc = d.encounter || {};
  ok(enc.fifo === true, 'ducks are FIFO clients (visible phases/badges)');
  ok(JSON.stringify(enc.phases) === JSON.stringify(['line_up', 'march', 'nip', 'regroup']),
    'phases declared in order: line_up → march → nip → regroup');
  ok(enc.phaseBadges && ['line_up', 'march', 'nip', 'regroup'].every(p => enc.phaseBadges[p]),
    'phaseBadges cover every phase');
  ok(enc.phaseMap && enc.phaseMap.declare === 'line_up' && enc.phaseMap.windup === 'march' &&
    enc.phaseMap.resolve === 'nip' && enc.phaseMap.cooldown === 'regroup' && enc.phaseMap.idle === 'line_up',
    'phaseMap maps declare/windup/resolve/cooldown/idle');
  ok(!!enc.knownCue, 'knownCue present in data');
  ok(d.armor === 1, 'armor sane for ducklings (1)');

  // ---- FIGHT: phase cycle ----
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = 1;
  Game.state.scholar.health = 900;
  Game.canSee = () => true;
  Game.startCombat('ducks_in_a_row');
  P().hp = P().maxHp = 900;
  head().hp = head().maxHp = 900;
  // stand clear so the march takes a few turns
  P().mx = 0; P().my = 0;
  const seen = [];
  for (let i = 0; i < 14 && Game.tbfight && !Game.tbfight.over; i++) {
    const ph = head() ? head().beamPhase : '?';
    if (seen[seen.length - 1] !== ph) seen.push(ph);
    // segments never declare: no telegraph on any segment, ever
    ok(!segs().some(s => s.telegraph), 'no segment declares a telegraph (round ' + i + ')');
    endTurn();
  }
  const cyc = seen.join('>');
  ok(/line_up.*march.*nip.*regroup.*line_up/.test(cyc), 'full cycle observed in order: ' + cyc);
  ok(seen.includes('line_up') && seen.includes('march') && seen.includes('nip') && seen.includes('regroup'),
    'all four phases visible: ' + seen.join(','));

  // ---- duckLane: knowledge-gated (fresh game — nothing learned yet) ----
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = 1;
  Game.state.scholar.health = 900;
  Game.startCombat('ducks_in_a_row');
  P().hp = P().maxHp = 900;
  const h2 = head(); h2.hp = h2.maxHp = 900;
  ok(h2.beamPhase === 'line_up', 'fight opens in line_up (the tell)');
  let lane = [...Game.duckLaneKeys()];
  ok(lane.length === 0, 'duckLane hidden when pattern unknown (knowledge gate)');
  learn('ducks_in_a_row');
  lane = [...Game.duckLaneKeys()];
  ok(lane.length > 0, 'duckLane shows once pattern learned: ' + lane.join(' '));

  // ---- knownCue: gated (fresh game). The opener line_up happens during
  // startCombat (fast monster opens) — before anything can be learned.
  const says = [];
  Game.say = (t) => says.push(String(t));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = 1;
  Game.state.scholar.health = 900;
  Game.startCombat('ducks_in_a_row');
  P().hp = P().maxHp = 900;
  head().hp = head().maxHp = 900;
  const kc = enc.knownCue;
  ok(!says.some(s => s.includes(kc)), 'knownCue NOT spoken before the pattern is learned (no leak)');
  // once learned, the next line_up carries the coaching
  says.length = 0;
  learn('ducks_in_a_row');
  P().mx = 0; P().my = 0;
  for (let i = 0; i < 10 && Game.tbfight && !Game.tbfight.over; i++) {
    endTurn();
    if (head() && head().beamPhase === 'line_up' && says.some(s => s.includes(kc))) break;
  }
  ok(says.some(s => s.includes(kc)), 'knownCue spoken once pattern learned');

  // ---- head kill: next duck takes the lead ----
  Game.say = () => {};
  Game.startCombat('ducks_in_a_row');
  P().hp = P().maxHp = 900;
  const hd = head();
  const before = segs().map(s => s.mx + ',' + s.my).join(' ');
  Game.tbDamage(hd.key, 99999, 'test');
  const after = segs();
  ok(after.some(s => s.isHead), 'killing the head promotes the next duck');
  Game.tbSnakeMove(after.find(s => s.isHead), P());
  const moved = after.map(s => s.mx + ',' + s.my).join(' ') !== before;
  ok(moved, 'the promoted head still drives the line (no frozen snake)');

  // ---- split: middle kill makes two snakes, both with heads ----
  Game.startCombat('ducks_in_a_row');
  P().hp = P().maxHp = 900;
  const mid = segs().find(s => s.segmentIndex === 2);
  Game.tbDamage(mid.key, 99999, 'test');
  const snakes = {};
  for (const s of segs()) snakes[s.snakeId] = (snakes[s.snakeId] || 0) + 1;
  ok(Object.keys(snakes).length === 2, 'middle kill splits into two snakes');
  const heads = segs().filter(s => s.isHead).length;
  ok(heads === 2, 'each half has a head: ' + heads);

  console.log(`\nducks: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
