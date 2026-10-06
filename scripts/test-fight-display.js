// Fight display discipline (Steve 2026-10-05: "3 pages of scrolling", "revealing way too much").
// - telegraph cues dedupe per monster-id per round (pack declares once, not N times)
// - offerSplit: correct threat count, groups packs, no debug-leak function names
// - "about to loose" typo fixed globally
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js', 'src/js/party-formal.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}`); }
}
function flatGrid() {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
}
function newMouseGame() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 100;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  return s;
}
Game.genDetail = () => flatGrid();

(async () => {
await Game.init();

// --- 1. telegraph dedup: 4 hummice declaring same round -> one cue ---
newMouseGame();
Game.debugScenario('hummice');
{
  const s = Game.state.scholar;
  s.mx = s.monster.mx + 1; s.my = s.monster.my;
  Game.canSee = () => true;
  for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
  ok('fight starts', !!Game.tbfight);
  const f = Game.tbfight;
  // simulate: every mouse declares a telegraph this round, cue said via helper
  Game.log = [];
  const mice = f.fighters.filter(x => x.kind === 'monster' && x.alive);
  ok('four mice', mice.length === 4);
  // (sayTelegraphOnce is silent now — cues render on the grid. We verify the
  // per-monster-id-per-round dedup via the cueSaid map. Clear any cues the
  // live AI already said.)
  f.cueSaid = {};
  for (const m of mice) {
    m.telegraph = { attackName: 'hum', turnsLeft: 1 };
    Game.sayTelegraphOnce(m, '⚠ TEST CUE hum');
  }
  const saidKeys = Object.keys(f.cueSaid || {});
  ok('one cue for four mice, same round', saidKeys.length === 1, saidKeys.join(','));
  // next round: cue fires again (it's a new warning)
  f.round = (f.round || 0) + 1;
  for (const m of mice) Game.sayTelegraphOnce(m, '⚠ TEST CUE hum');
  ok('cue fires again next round', Object.keys(f.cueSaid || {}).length === 2);
  // different monster id: separate cue same round
  const fake = { mdef: { id: 'other_beast' }, key: 'x1', telegraph: { attackName: 'hum' } };
  Game.sayTelegraphOnce(fake, '⚠ TEST CUE other');
  ok('different monster gets own cue', Object.keys(f.cueSaid || {}).length === 3);
}

// --- 2. offerSplit: groups packs, correct count, no code leak ---
newMouseGame();
Game.debugScenario('hummice');
{
  const s = Game.state.scholar;
  s.mx = s.monster.mx + 1; s.my = s.monster.my;
  Game.canSee = () => true;
  for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
  ok('fight starts', !!Game.tbfight);
  Game.log = [];
  const foes = Game.offerSplit();
  ok('offerSplit returns foes', foes && foes.length === 4);
  const text = Game.log.join('\n');
  ok('no TWO THREATS lie', !/TWO THREATS/.test(text));
  ok('single grouped threat', /One threat|1 threat/i.test(text));
  ok('pack count shown', /×4/.test(text));
  ok('no function-name leak', !/splitParty\(/.test(text));
  ok('no threatKey leak', !/threatKey/.test(text));
}

// --- 3. typo fixed ---
{
  const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  ok('no "about to loose"', !/about to loose/.test(src));
  ok('"break loose" present', /about to break loose/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
