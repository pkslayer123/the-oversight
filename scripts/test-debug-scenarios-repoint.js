// Proof: deleted-monster debug scenarios repointed (Steve 2026-10-06).
// The wave-2 roster redesign deleted 5 cheap reskins; 5 debug scenarios still
// spawned the dead ids and startCombat silently fell back to bulldozer.
// This asserts each repointed scenario spawns the intended monster, and that
// unknown ids now fail LOUDLY instead of substituting bulldozer.
//
// Run: node scripts/test-debug-scenarios-repoint.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/lifeseed.js', 'src/js/villager-agency.js', 'src/js/debug-scenarios.js'].forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); }
});
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

// ---- static: no dead ids remain in the scenario file ----
const scenSrc = fs.readFileSync(path.join(ROOT, 'src/js/debug-scenarios.js'), 'utf8');
for (const id of ['camera_swarm', 'hype_horn', 'service_mimic', 'contract_golem']) {
  ok(`no '${id}' in debug-scenarios.js`, !scenSrc.includes(`'${id}'`));
}
// ---- static: startCombat fails loudly ----
const gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
ok('startCombat throws on unknown id', /throw new Error\(`startCombat: unknown monster id/.test(gameSrc));
ok('silent monsters[0] fallback removed', !gameSrc.includes('|| this.data.monsters[0]'));

(async () => {
  await Game.init();

  const pairs = [
    ['influencer', 'paparazzo'],
    ['customerservice', 'understudy'],
    ['motivationalspeaker', 'heckler'],
    ['termsconditions', 'landlord'],
    ['middlemanager', 'union_rep'],
  ];
  for (const [scen, mid] of pairs) {
    try {
      Game.debugScenario(scen);
      const m = Game.state.scholar.monster;
      ok(`scenario '${scen}' spawns '${mid}'`, m && m.id === mid, `got ${m && m.id}`);
      // the monster def actually exists (no silent substitution downstream)
      const mdef = (Game.data.monsters || []).find(x => x.id === (m && m.id));
      ok(`'${mid}' def exists in monsters.json`, !!mdef);
    } catch (e) {
      ok(`scenario '${scen}' runs`, false, e.message);
    }
  }

  // unknown explicit id -> loud throw, not silent bulldozer
  try {
    Game.startCombat('camera_swarm');
    ok('startCombat(camera_swarm) throws', false, 'no throw');
  } catch (e) {
    ok('startCombat(camera_swarm) throws', /unknown monster id "camera_swarm"/.test(e.message), e.message);
  }
  // legitimate default path untouched: no id -> bulldozer, no throw
  try {
    Game.startCombat();
    const fighters = (Game.tbfight && Game.tbfight.fighters) || [];
    const foe = fighters.find(f => (f.mdef || {}).id || f.mid);
    const foeId = foe && ((foe.mdef || {}).id || foe.mid || foe.id);
    ok('startCombat() default still spawns bulldozer', foeId === 'bulldozer', `got ${foeId}`);
  } catch (e) {
    ok('startCombat() default path', false, e.message);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
