// Examine module unit test (isolated, no game init needed).
// Tests the pure logic: description building, name-leak scrubbing, observation
// records, quality tiers, recognition beat.
// Usage: node scripts/test-examine-unit-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// Minimal mock of Scattering.Game
const plants = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/plants.json'), 'utf8'));
const plantList = Array.isArray(plants) ? plants : plants.plants;

const codex = { plants: {}, observations: {}, encounters: {} };
const said = [];
globalThis.Scattering = {
  Game: {
    data: { plants: plantList },
    state: { codex, scholar: { day: 5, kcal: 2000 }, village: {} },
    villagerId: 'test_vid',
    vpOf: () => ({ formerOccupation: 'survivor' }),
    plantKnown: (pid) => !!(codex.plants[pid] && codex.plants[pid].level >= 1),
    abilityLevel: () => 0,
    say: (m) => said.push(String(m)),
  }
};

eval(fs.readFileSync(path.join(ROOT, 'src/js/examine.js'), 'utf8'));
const Ex = globalThis.Scattering.Examine;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}` + (extra ? ' — ' + extra : '')); }
}

// 1. Description never leaks name (all plants, all qualities)
let leaks = 0;
for (const p of plantList) {
  for (const q of [1, 2, 3]) {
    const d = Ex.examineDescription(p.id, q);
    if (d.toLowerCase().includes(p.name.toLowerCase())) {
      leaks++;
      console.log(`  LEAK ${p.id} Q${q}: ${d.slice(0, 90)}`);
    }
  }
}
ok('no name leaks (all plants x Q1-3)', leaks === 0, `${leaks} leaks`);

// 2. Known plant uses name
codex.plants['jewelweed'] = { level: 1 };
const kd = Ex.examineDescription('jewelweed', 1);
ok('known uses name', kd.toLowerCase().includes('jewelweed'), kd.slice(0, 60));
delete codex.plants['jewelweed'];

// 3. Quality tiers differ
const q1 = Ex.examineDescription('blackberry', 1);
const q3 = Ex.examineDescription('blackberry', 3);
ok('Q3 richer than Q1', q3.length > q1.length);
ok('Q3 mentions type', /berry bush/i.test(q3), q3.slice(0, 120));

// 4. Observation records
const obs = Ex.observePlant('blackberry', 'examine');
ok('observation created', obs && obs.count === 1 && obs.quality >= 1);
ok('observedPlant true', Ex.observedPlant('blackberry'));
ok('depth 1 when observed', Ex.plantVisualDepth('blackberry') === 1);
ok('depth 0 when not', Ex.plantVisualDepth('ramps') === 0);
Ex.observePlant('blackberry', 'forage');
ok('via merges', Ex.observationOf('blackberry').via.includes('forage'));
ok('count increments', Ex.observationOf('blackberry').count === 2);

// 5. Recognition beat (run multiple times — lines are random, 2/3 name teacher)
let teacherNamed = false, revelationTone = false, plantNamed = false;
for (let i = 0; i < 10; i++) {
  said.length = 0;
  const rb = Ex.recognitionBeat('blackberry', 'Marisol');
  ok('recognitionBeat returns true', rb === true);
  const s = said[0] || '';
  if (s.includes('Marisol')) teacherNamed = true;
  if (/clicks like a key|never unsee|words land/i.test(s)) revelationTone = true;
  if (s.includes('Blackberry')) plantNamed = true;
}
ok('beat names the teacher (across draws)', teacherNamed);
ok('beat has revelation tone (across draws)', revelationTone);
ok('beat names the plant (across draws)', plantNamed);

// 6. No observation -> no beat
said.length = 0;
const rb2 = Ex.recognitionBeat('ramps', 'Marisol');
ok('no obs: returns false', rb2 === false);
ok('no obs: says nothing', said.length === 0);

// 7. Quality: botanist > survivor
const qBase = Ex.examineQuality();
globalThis.Scattering.Game.vpOf = () => ({ formerOccupation: 'botanist' });
const qBot = Ex.examineQuality();
ok('botanist quality higher', qBot > qBase, `base=${qBase} bot=${qBot}`);

// 8. Unknown pid handled gracefully
ok('unknown pid: no crash', Ex.examineDescription('nonexistent', 1) === 'a plant.');
ok('unknown pid: depth 0', Ex.plantVisualDepth('nonexistent') === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
