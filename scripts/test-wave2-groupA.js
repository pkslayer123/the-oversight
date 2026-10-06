// Wave 2 Group A: Static, Grief Counselor, Performance Review, Influencer
// Tests each monster's unique mechanics at Highbeam Deer level.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name + (extra ? ' | ' + extra : '')); }
}

async function main() {
  await Game.init();
  Game.genRoster('Test');
  Game.newGame('Test', null, Game.generatedRoster[0].id);

  // ID gates exist
  ok('vmIs gate', typeof Game.vmIs === 'function');
  ok('stagIs gate', typeof Game.stagIs === 'function');
  ok('droneIs gate', typeof Game.droneIs === 'function');
  ok('swarmIs gate', typeof Game.swarmIs === 'function');

  // Monster defs have required fields
  const defs = Game.data.monsters;
  for (const mid of ['voice_mimic_radio', 'mirror_stag', 'review_drone', 'camera_swarm']) {
    const mdef = defs.find(x => x.id === mid);
    ok(mid + ' def exists', !!mdef);
    ok(mid + ' has telegraph', !!(mdef && mdef.attack && mdef.attack.telegraph));
    ok(mid + ' has phases', !!(mdef && mdef.encounter && mdef.encounter.phases && mdef.encounter.phases.length >= 3));
    ok(mid + ' has codex', !!(mdef && mdef.codexStages && mdef.codexStages.observed));
  }

  // Static: phases are call/approach/reveal
  const vmDef = defs.find(x => x.id === 'voice_mimic_radio');
  ok('Static phases', JSON.stringify(vmDef.encounter.phases) === JSON.stringify(['call', 'approach', 'reveal']));

  // Grief Counselor: charge pattern, length 6
  const stDef = defs.find(x => x.id === 'mirror_stag');
  ok('Stag charge pattern', stDef.attack.pattern.type === 'charge');
  ok('Stag charge length 6', stDef.attack.pattern.length === 6);

  // Drone: beam pattern, 3-beat windup
  const drDef = defs.find(x => x.id === 'review_drone');
  ok('Drone beam pattern', drDef.attack.pattern.type === 'beam');
  ok('Drone windup 3', drDef.attack.pattern.windup === 3);

  // Swarm: burst radius 2
  const swDef = defs.find(x => x.id === 'camera_swarm');
  ok('Swarm burst pattern', swDef.attack.pattern.type === 'burst');
  ok('Swarm radius 2', swDef.attack.pattern.radius === 2);

  // Audio functions exist in app.js (check via source)
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  for (const fn of ['staticCry', 'staticBreak', 'stagMirror', 'stagSnort', 'droneHum', 'droneCount', 'droneBeam', 'droneRecalc', 'swarmFilm', 'swarmBuild', 'swarmFlash']) {
    ok('Audio ' + fn, appSrc.includes('function ' + fn + '('));
  }

  console.log(`\n=== RESULTS: ${pass} pass, ${fail} fail ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
