// scripts/test-wave2-roster.js
// WAVE-2 ROSTER REDESIGN (Steve 2026-10-06): proves the new roster.
// - 5 removed reskins are GONE from wave 2
// - 5 new monsters EXIST with tricks, escalation, knowledge gating
// - mirror_stag + bright_idea kept as deliberate evolutions with fiction
// - veteran variants (scarred/elder/pack-leader) apply tricks
// - wave-1 monsters still spawn in wave 2 (60/40)
//
// Usage: node scripts/test-wave2-roster.js

const fs = require('fs');
const path = require('path');

const monstersPath = path.join(__dirname, '../src/data/monsters.json');
const monsters = JSON.parse(fs.readFileSync(monstersPath, 'utf8'));
const byId = Object.fromEntries(monsters.map(m => [m.id, m]));

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n=== WAVE-2 ROSTER REDESIGN TEST ===\n');

// 1. Removed reskins are gone
console.log('1. Cheap reskins removed:');
const removed = ['camera_swarm', 'hype_horn', 'service_mimic', 'contract_golem', 'delegate_beast'];
for (const id of removed) {
  check(`${id} not in data`, !byId[id], byId[id] ? 'still exists!' : '');
}

// 2. New monsters exist
console.log('\n2. New monsters exist:');
const added = ['understudy', 'landlord', 'heckler', 'paparazzo', 'union_rep'];
for (const id of added) {
  const m = byId[id];
  check(`${id} in data`, !!m, 'missing!');
  if (m) {
    check(`${id} is wave 2`, m.wave === 2, `wave=${m.wave}`);
    check(`${id} has unknown desc`, !!(m.unknown && m.unknown.length > 20), 'missing/short');
    check(`${id} has codexStages`, !!(m.codexStages && Object.keys(m.codexStages).length >= 3), 'missing');
    check(`${id} has vibe/fiction`, !!(m.vibe && m.vibe.length > 20), 'missing/short');
    check(`${id} has cues`, !!(m.cues && Object.keys(m.cues).length > 0), 'missing');
    check(`${id} has weaknesses`, !!(m.weaknesses && m.weaknesses.length > 0), 'missing');
  }
}

// 3. Kept evolutions have fiction
console.log('\n3. Kept evolutions (deliberate, fiction-meaningful):');
for (const id of ['mirror_stag', 'bright_idea']) {
  const m = byId[id];
  check(`${id} exists`, !!m);
  if (m) {
    const text = JSON.stringify(m);
    const hasEvo = text.includes('System') && (text.includes('iterat') || text.includes('evolu') || text.includes('version'));
    check(`${id} has System-iteration fiction`, !!hasEvo, 'evolution not explained');
  }
}

// 4. Wave-1 still spawns in wave 2 (check spawn logic in game.js)
console.log('\n4. Wave-1 persistence:');
const gameJs = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
check('60/40 spawn ratio exists', gameJs.includes('r < 0.6 ? 2 : 1'), 'ratio logic missing');
check('veteran flag on old-wave spawns', gameJs.includes('veteran: isVeteran'), 'veteran flag missing');
check('scarred variant', gameJs.includes("veteranVariant = vr < 0.34 ? 'scarred'"), 'scarred missing');
check('elder variant', gameJs.includes("'elder'"), 'elder missing');
check('pack-leader variant', gameJs.includes("'pack-leader'"), 'pack-leader missing');
check('scarred brace trick', gameJs.includes('scarBraced'), 'brace trick missing');
check('elder stun immunity', gameJs.includes('elderCalm'), 'elder immunity missing');
check('pack-leader extra packmate', gameJs.includes('packmateOf'), 'packmate missing');

// 5. New monster AI blocks exist
console.log('\n5. AI blocks:');
const aiChecks = [
  ['understudy', 'usIs(m)'],
  ['landlord', 'llIs(m)'],
  ['heckler', 'hkIs(m)'],
  ['paparazzo', 'pzIs(m)'],
  ['union_rep', 'urIs(m)'],
];
for (const [name, marker] of aiChecks) {
  check(`${name} AI block`, gameJs.includes(marker), 'AI block missing');
}

// 6. Predicates exist
console.log('\n6. Predicates:');
for (const pred of ['usIs(', 'llIs(', 'hkIs(', 'pzIs(', 'urIs(']) {
  check(`${pred} predicate`, gameJs.includes(pred), 'predicate missing');
}

// 7. Terraform 'claimed' type
console.log('\n7. Landlord terraform:');
check("'claimed' terraform type", gameJs.includes("'claimed'"), 'missing');
const css = fs.readFileSync(path.join(__dirname, '../src/css/main.css'), 'utf8');
check("'claimed' CSS", css.includes('claimed'), 'CSS missing');

// 8. Audio hooks
console.log('\n8. Audio:');
const appJs = fs.readFileSync(path.join(__dirname, '../src/js/app.js'), 'utf8');
for (const fn of ['understudyLearn', 'landlordStamp', 'hecklerTaunt', 'paparazzoShutter', 'unionRepChant']) {
  check(`${fn} audio`, appJs.includes(`function ${fn}(`), 'audio fn missing');
}

// 9. Heckler shame hook
console.log('\n9. Mechanic hooks:');
check('heckler shame in tbPlayerStrike', gameJs.includes('hkShame'), 'shame hook missing');
check('heckler compulsion in tbPlayerWait', gameJs.includes('hkCompelled'), 'compulsion missing');
check('union rep solidarity in tbDamage', gameJs.includes('UNION REP SOLIDARITY'), 'solidarity missing');
check('union rep walkout untargetable', gameJs.includes('urWalkout'), 'walkout missing');
check('paparazzo prediction', gameJs.includes('pzPrediction'), 'prediction missing');
check('understudy observation', gameJs.includes('usSeen'), 'observation missing');
check('landlord jurisdiction', gameJs.includes('llClaimed'), 'jurisdiction missing');

// Summary
console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail > 0 ? 1 : 0);
