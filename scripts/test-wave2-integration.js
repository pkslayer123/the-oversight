// Wave 2 Integration Test (Steve 2026-10-05)
// Verifies the 10 Wave 2 monsters (built by 3 parallel workers) work TOGETHER:
// - No duplicate audio synth names in app.js
// - No duplicate helper functions in game.js
// - All 10 have complete monsters.json defs (incl. aggroAudio)
// - All fired audio events are registered in the dispatcher
// - Encounter configs have required fields
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

const mj = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
const monsters = mj.monsters || mj;
const appCode = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const gameCode = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');

const WAVE2 = ['voice_mimic_radio', 'mirror_stag', 'review_drone', 'camera_swarm',
  'hype_horn', 'service_mimic', 'contract_golem', 'delegate_beast',
  'bright_idea', 'memory_projector'];

// 1. All 10 defs exist and are complete
for (const id of WAVE2) {
  const m = monsters.find(x => x.id === id);
  check(`${id} def exists`, !!m);
  if (!m) continue;
  check(`${id} has name`, !!m.name);
  check(`${id} has hp`, !!m.hp);
  check(`${id} has attack.name`, !!(m.attack && m.attack.name));
  check(`${id} has attack.damage`, !!(m.attack && m.attack.damage));
  check(`${id} has attack.pattern.type`, !!(m.attack && m.attack.pattern && m.attack.pattern.type));
  check(`${id} has encounter`, !!m.encounter);
  check(`${id} has encounter.aggroAudio`, !!(m.encounter && m.encounter.aggroAudio), 'would fall back to deerAggro');
  check(`${id} has encounter.knownCue`, !!(m.encounter && m.encounter.knownCue), 'no codex coaching');
  // HP valid
  const hp = m.hp;
  const hpOk = typeof hp === 'number' || (Array.isArray(hp) && hp.length === 2 && hp[0] < hp[1]);
  check(`${id} hp valid`, hpOk, JSON.stringify(hp));
  // aggroAudio synth exists in app.js
  const aggro = m.encounter && m.encounter.aggroAudio;
  if (aggro) check(`${id} aggroAudio registered`, appCode.includes(`function ${aggro}(`), aggro);
}

// 2. No duplicate function definitions in app.js
const appFns = (appCode.match(/function [a-zA-Z0-9_]+/g) || []).map(s => s.replace('function ', ''));
const appDupes = appFns.filter((f, i) => appFns.indexOf(f) !== i && f);
check('no duplicate app.js functions', appDupes.length === 0, appDupes.join(','));

// 3. No duplicate dispatcher keys in the CombatAudio dispatcher
// (scope to the dispatcher object literal, not the whole file)
const dispStart = appCode.indexOf('const CombatAudio');
const dispEnd = appCode.indexOf('Game.audio = CombatAudio');
const dispBlock = appCode.slice(dispStart, dispEnd);
const dispKeys = (dispBlock.match(/^      [a-zA-Z0-9_]+\([^)]*\) \{/gm) || []).map(s => s.trim().split('(')[0]);
const dispDupes = dispKeys.filter((k, i) => dispKeys.indexOf(k) !== i && k);
check('no duplicate dispatcher keys', dispDupes.length === 0, dispDupes.join(','));

// 4. Helper functions exist exactly once in game.js
const helpers = ['vmIs', 'stagIs', 'droneIs', 'swarmIs', 'hornIs', 'beastIs', 'biIs'];
for (const h of helpers) {
  const count = (gameCode.match(new RegExp(`\\b${h}\\(m\\) \\{`, 'g')) || []).length;
  check(`helper ${h} defined once`, count === 1, `found ${count}`);
}

// 5. Wave 2 audio events fired in game.js are all registered
const wave2Events = ['staticCry', 'staticBreak', 'stagMirror', 'stagSnort', 'stagConfused',
  'droneHum', 'droneCount', 'droneBeam', 'droneRecalc', 'droneCorrect',
  'swarmFilm', 'swarmBuild', 'swarmFlash', 'swarmEscalate', 'swarmScatter', 'swarmShutters',
  'hypeInflate', 'hypeEncourage', 'hypeDetonate', 'hypeDeflate',
  'holdMusic', 'lineCut', 'paperRustle',
  'managerCircle', 'managerAnnounce', 'managerCharge', 'managerDebrief', 'managerFear',
  'delegateAnnounce', 'delegateCharge', 'delegateCircle',
  'eurekaTick', 'eurekaCharge', 'eurekaDetonate', 'eurekaSpent', 'eurekaDisperse', 'eurekaDrift',
  'projectorHum', 'projectorStatic', 'projectorBreak', 'projectorPull'];
for (const e of wave2Events) {
  const fired = gameCode.includes(`audioEvent('${e}')`);
  if (fired) {
    check(`audio ${e} registered`, appCode.includes(`${e}(`), 'fires silence');
  }
}

// 6. Pattern variety (coherent wave, not 10x same pattern)
const patterns = WAVE2.map(id => {
  const m = monsters.find(x => x.id === id);
  return m.attack.pattern.type;
});
const uniquePatterns = [...new Set(patterns)];
check('pattern variety >= 4 types', uniquePatterns.length >= 4, uniquePatterns.join(','));

console.log(`\n=== RESULTS: ${pass} pass, ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);
