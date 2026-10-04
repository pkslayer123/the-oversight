// Debug scenario tests. Usage: node scripts/test-debug-scenarios.js
// Verifies each debugScenario() produces correct, working state.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
function eq(name, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}

(async () => {
  await Game.init();
  const others = () => Game.state.village.roster.filter(id => id !== Game.villagerId);

  // --- list ---
  const list = Game.debugScenarioList();
  eq('9 scenarios listed', list.length, 9);
  ok('all have ids+labels', list.every(([id, label]) => id && label));

  // --- 1. deer ---
  ok('deer runs', Game.debugScenario('deer'));
  let s = Game.state.scholar;
  eq('deer spawned', s.animal && s.animal.id, 'white_tailed_deer');
  eq('bow equipped', (s.equipped || {}).weapon && s.equipped.weapon.itemId, 'crude_bow');
  ok('has arrows', (s.inventory || []).some(i => i.material === 'arrow' && i.units >= 10));
  eq('dawn', Game.dayPart, 0);
  ok('deer adjacent', Math.max(Math.abs(s.animal.mx - (s.mx ?? 4)), Math.abs(s.animal.my - (s.my ?? 4))) <= 1);

  // --- 2. day7 ---
  ok('day7 runs', Game.debugScenario('day7'));
  s = Game.state.scholar;
  eq('day is 7', s.day, 7);
  ok('day7 armed', !!s._day7Armed);
  ok('trust built', Object.keys(Game.state.village.trust || {}).length > 3);
  ok('names learned', Object.keys(Game.state.village.knownNames || {}).length > 0);

  // --- 3. uprising ---
  ok('uprising runs', Game.debugScenario('uprising'));
  ok('combat started', !!Game.tbfight);
  const hostiles = (Game.tbfight.fighters || []).filter(f => f.kind === 'hostile' && f.alive);
  ok('2+ hostile villagers', hostiles.length >= 2);
  try { Game.tbEnd('fled'); } catch (e) {}

  // --- 4. day1 ---
  ok('day1 runs', Game.debugScenario('day1'));
  s = Game.state.scholar;
  eq('day 1', s.day, 1);
  ok('no animal', !s.animal);
  ok('no combat', !Game.tbfight);

  // --- 5. language ---
  ok('language runs', Game.debugScenario('language'));
  const rl = others();
  ok('roster exists', rl.length > 3);
  const noEng = rl.every(rid => {
    const lv = Game.levelsOf(Game.npcLangs(rid));
    return !(lv.english >= 1);
  });
  ok('zero English across roster', noEng);
  ok('native tongues set', rl.every(rid => (Game.npcLangs(rid).native || '') !== 'english'));

  // --- 6. liars ---
  ok('liars runs', Game.debugScenario('liars'));
  const lied = others().slice(0, 5).filter(rid => {
    const vp = Game.vpOf(rid);
    return vp.lies && vp.lies.occupation && vp.lies.occupation.told !== vp.lies.occupation.truth;
  });
  ok('5 forced liars', lied.length === 5);

  // --- 7. night ---
  ok('night runs', Game.debugScenario('night'));
  s = Game.state.scholar;
  eq('night', Game.dayPart, 3);
  eq('fox spawned', s.animal && s.animal.id, 'gray_fox');
  eq('spear equipped', (s.equipped || {}).weapon && s.equipped.weapon.itemId, 'fire_hardened_spear');
  ok('isNight true', Game.isNight());

  // --- 8. starving ---
  ok('starving runs', Game.debugScenario('starving'));
  s = Game.state.scholar;
  v = Game.state.village;
  const pantryKcal = (v.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0);
  ok('pantry nearly empty (<5k kcal)', pantryKcal < 5000);
  ok('player hungry', s.kcal < 1000);
  eq('day 4', s.day, 4);

  // --- 9. headlight ---
  ok('headlight runs', Game.debugScenario('headlight'));
  ok('no instant combat (stalk from range, not spawn-on-top)', !Game.tbfight);
  s = Game.state.scholar;
  ok('deer placed on map', !!(s.monster && s.monster.id === 'gallowdeer'));
  eq('deer 5 tiles away', Math.max(Math.abs(s.monster.mx - s.mx), Math.abs(s.monster.my - s.my)), 5);
  eq('night', Game.dayPart, 3);
  eq('spear equipped', (s.equipped.weapon || {}).itemId, 'fire_hardened_spear');

  // --- unknown ---
  eq('unknown scenario false', Game.debugScenario('nope'), false);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
