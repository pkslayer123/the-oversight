// TELEGRAPH DEPTH — white_noise_heron (Steve 2026-10-06)
// Asserts: distinct heronStrike visual bucket (not the generic red line),
// knowledge-gated, heron-specific resolve flavor (not "The light hits!"),
// still → unfold → strike phase rhythm, sane armor/resistances.
// Run: node scripts/test-telegraph-depth-heron.js
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
// REAL bucket routing, extracted from app.js (same fn renderDetail uses).
const _tbSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8')
  .match(/function tbAllTelegraphCells\(\) \{[\s\S]*?\n  \}\n/)[0]
  .replace(/^function tbAllTelegraphCells/, 'function');
const tbAllTelegraphCells = eval('(' + _tbSrc + ')');
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
function freshFight() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = 1;
  Game.state.scholar.health = 900;
  Game.canSee = () => true;
  Game.startCombat('white_noise_heron');
  P().hp = P().maxHp = 900;
  const m = M(); m.hp = m.maxHp = 900;
  P().mx = Math.max(0, m.mx - 3); P().my = m.my;
  return m;
}
(async () => {
  await Game.init();
  Game.say = () => {};
  Game.audioEvent = () => {};
  Game.genDetail = () => flatGrid();

  // ---- DATA ----
  const h = Game.data.monsters.find(m => m.id === 'white_noise_heron');
  const enc = h.encounter || {};
  ok(JSON.stringify(enc.phases) === JSON.stringify(['still', 'unfold', 'strike']), 'phases: still → unfold → strike');
  ok(enc.phaseMap && enc.phaseMap.declare === 'unfold' && enc.phaseMap.windup === 'unfold' &&
    enc.phaseMap.resolve === 'strike' && enc.phaseMap.idle === 'still', 'phaseMap maps the rhythm');
  ok(enc.phaseBadges && enc.phaseBadges.still && enc.phaseBadges.unfold && enc.phaseBadges.strike,
    'phaseBadges cover still/unfold/strike');
  ok(!!enc.knownCue, 'knownCue present');
  ok(h.armor === 1, 'armor sane (1)');
  ok(h.resistances && h.resistances.psychic === 0.5, 'psychic resistance sane for a white-noise predator');

  // ---- FIGHT: phase rhythm still → unfold → strike ----
  let m = freshFight();
  const seen = [];
  for (let i = 0; i < 12 && Game.tbfight && !Game.tbfight.over; i++) {
    const ph = M().beamPhase;
    if (seen[seen.length - 1] !== ph) seen.push(ph);
    endTurn();
  }
  ok(/still.*unfold.*strike.*still/.test(seen.join('>')), 'rhythm observed: ' + seen.join('>'));

  // ---- VISUAL: heronStrike bucket, distinct from generic line ----
  m = freshFight();
  learn('white_noise_heron');
  for (let i = 0; i < 6 && Game.tbfight && !Game.tbfight.over; i++) {
    if (M().telegraph) break;
    endTurn();
  }
  ok(!!M().telegraph, 'telegraph declares');
  const buckets = tbAllTelegraphCells();
  ok(buckets.heronStrike && buckets.heronStrike.size > 0, 'heron cells route to heronStrike bucket');
  ok(buckets.line.size === 0, 'generic line bucket stays empty for the heron (distinct visual)');
  // CSS: the heronStrike class exists and is not the deer's red
  const css = fs.readFileSync(path.join(ROOT, 'src/css/main.css'), 'utf8');
  ok(/\.cell\.heronStrike/.test(css), '.cell.heronStrike CSS exists');
  ok(!/\.cell\.heronStrike[^}]*#ff3b30/.test(css), 'heronStrike is not the deer-beam red');
  // renderDetail consumes the bucket
  const app = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  ok(app.includes("(_tg.heronStrike.has(_k) ? ' heronStrike' : '')"), 'renderDetail renders heronStrike class');

  // ---- VISUAL: knowledge-gated ----
  m = freshFight(); // fresh game: unknown
  for (let i = 0; i < 6 && Game.tbfight && !Game.tbfight.over; i++) {
    if (M().telegraph) break;
    endTurn();
  }
  const bucketsU = tbAllTelegraphCells();
  ok((bucketsU.heronStrike || new Set()).size === 0, 'heronStrike hidden when pattern unknown');

  // ---- FLAVOR: resolve text is heron-specific, pre-pattern ----
  const says = [];
  Game.say = (t) => says.push(String(t));
  m = freshFight(); // unknown: dread variant
  for (let i = 0; i < 8 && Game.tbfight && !Game.tbfight.over; i++) {
    endTurn();
    if (says.some(s => /STRIKES|light hits/.test(s))) break;
  }
  Game.say = () => {};
  ok(says.some(s => /needle out of the white noise/.test(s)), 'resolve: heron-specific dread text');
  ok(!says.some(s => /The light hits/.test(s)), 'resolve: never the deer\'s "The light hits!"');

  // ---- distinct cue text on windup ----
  ok((h.attack.telegraph || '').length > 20, 'distinct telegraph text in data');
  ok(!/generic|something is coming/i.test(h.attack.telegraph || ''), 'telegraph text not generic');

  console.log(`\nheron: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
