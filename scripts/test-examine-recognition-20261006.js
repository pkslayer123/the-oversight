// Examine + recognition proof (Steve 2026-10-06):
// "I should be able to examine more things instead of just foraging them.
// Come away with vague plant descriptions. This should be the foundation of
// recognizing a plant when someone reveals knowledge to you at a later date.
// That's what unlocks visual change."
// 1. Examine -> vague description, NEVER the name (unless already known)
// 2. Examine is cheap; foraging costs more
// 3. Observation memory is created; visual depth goes 0 -> 1
// 4. identifyPlant on an observed species fires the recognition beat
// 5. Visual depth goes 1 -> 2 on identification
// 6. Forage also records observations
// 7. Quality varies with skill (botanist sees more)
// Usage: node scripts/test-examine-recognition-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js', 'src/js/examine.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/journal.js', 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js',
 'src/js/debug-scenarios.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const Ex = globalThis.Scattering.Examine;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}` + (extra ? ' — ' + extra : '')); }
}

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
}

(async () => {
  await Game.init();
  ok('examine module loaded', !!Ex && !!Ex.observePlant);

  freshGame();
  const pid = 'jewelweed';
  const plant = Game.data.plants.find(p => p.id === pid);
  ok('test plant exists', !!plant);

  // 1. No observation yet: depth 0, not observed
  ok('unobserved: depth 0', Ex.plantVisualDepth(pid) === 0);
  ok('unobserved: not observed', !Ex.observedPlant(pid));

  // 2. Vague description never leaks the name
  const desc = Ex.examineDescription(pid, 1);
  ok('description exists', desc && desc.length > 10);
  ok('Q1: no name leak', desc.toLowerCase().indexOf(plant.name.toLowerCase()) === -1, desc);
  const desc3 = Ex.examineDescription(pid, 3);
  ok('Q3: no name leak', desc3.toLowerCase().indexOf(plant.name.toLowerCase()) === -1, desc3);
  ok('Q3 richer than Q1', desc3.length > desc.length);

  // 3. Observe -> depth 1
  const obs = Ex.observePlant(pid, 'examine');
  ok('observation recorded', !!obs && obs.count === 1 && obs.via.includes('examine'));
  ok('observed: depth 1', Ex.plantVisualDepth(pid) === 1);
  ok('observedPlant true', Ex.observedPlant(pid));

  // 4. Forage also observes
  Ex.observePlant(pid, 'forage');
  const obs2 = Ex.observationOf(pid);
  ok('forage observation merges', obs2.count === 2 && obs2.via.includes('forage'));

  // 5. Recognition beat fires on identifyPlant (capture say output)
  const said = [];
  const origSay = Game.say;
  Game.say = (m) => { said.push(String(m)); };
  const identified = Game.identifyPlant(pid, 'taught');
  Game.say = origSay;
  ok('identifyPlant works', identified === true);
  const hasIdent = said.some(m => m.includes('IDENTIFIED'));
  const hasClick = said.some(m => /clicks like a key|never unsee|words land/i.test(m));
  ok('identification announced', hasIdent);
  ok('recognition beat fired (revelation, not just unlock)', hasClick, said.slice(0, 3).join(' | '));
  ok('known: depth 2', Ex.plantVisualDepth(pid) === 2);

  // 6. No observation -> no recognition beat (control)
  freshGame();
  const pid2 = 'dandelion';
  const said2 = [];
  Game.say = (m) => { said2.push(String(m)); };
  Game.identifyPlant(pid2, 'taught');
  Game.say = origSay;
  const hasClick2 = said2.some(m => /clicks like a key|never unsee|words land/i.test(m));
  ok('no observation: no recognition beat', !hasClick2);

  // 7. Examine quality varies with skill
  freshGame();
  const q1 = Ex.examineQuality();
  ok('base quality >= 1', q1 >= 1);
  // botanist sees more (occupation lives on the vpOf record)
  try { Game.vpOf(Game.villagerId).formerOccupation = 'botanist'; } catch (e) {}
  const q2 = Ex.examineQuality();
  ok('botanist quality higher', q2 > q1, `base=${q1} botanist=${q2}`);

  // 8. Known plants: description uses the name (no need for vagueness)
  Game.identifyPlant(pid2, 'test');
  const knownDesc = Ex.examineDescription(pid2, 1);
  ok('known: name used', knownDesc.toLowerCase().indexOf('dandelion') !== -1, knownDesc.slice(0, 60));

  // 9. examineCell exists on Game
  ok('Game.examineCell exists', typeof Game.examineCell === 'function');

  // 10. examineDescription never leaks name across ALL plants (sweep)
  let leaks = 0;
  for (const p of Game.data.plants) {
    // simulate unknown
    delete (Game.state.codex.plants || {})[p.id];
    const d = Ex.examineDescription(p.id, 3);
    if (d.toLowerCase().indexOf(p.name.toLowerCase()) !== -1) { leaks++; console.log(`  LEAK: ${p.id}: ${d.slice(0, 80)}`); }
  }
  ok('no name leaks across all plants', leaks === 0, `${leaks} leaks`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
