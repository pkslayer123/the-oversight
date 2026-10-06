// Wave-2 difficulty pass acceptance test (Steve 2026-10-06).
// Proves: heckler redesign (set fires), landlord apex (rent/addenda/foreclosure),
// paparazzo prediction reachability, understudy codex moves implemented,
// loot gating (wave-2 > wave-1), no codex lies.
// NOTE: written against the SPEC in evidence/2026-10-06/wave2-difficulty-spec.md.
// It FAILS until the spec is applied (tree was hot at write time).
// Run: node scripts/test-wave2-difficulty.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
const byId = Object.fromEntries((monsters.monsters || monsters).map(m => [m.id, m]));
const gameJs = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
const has = (s) => gameJs.includes(s);

console.log('\n=== WAVE-2 DIFFICULTY ACCEPTANCE ===\n');

// 1. HECKLER redesign
console.log('1. Heckler (the set must fire):');
{
  const m = byId.heckler;
  check('hp 85-100', m.hp[0] === 85 && m.hp[1] === 100, JSON.stringify(m.hp));
  check('direct chip 6-10', m.attack.damage[0] === 6 && m.attack.damage[1] === 10, JSON.stringify(m.attack.damage));
  check('headliner at 4', has('hkShame >= 4'), 'no >= 4 threshold');
  check('jibes every round (no 40% gate)', !has('Math.random() < 0.4'), 'old gate still present');
  check('miss mocked twice', has('lastPlayerMissed') && has('hkShame++'), 'no miss bonus');
  check('PILE-ON implemented', has('PILE-ON') || has('pileOn'), 'codex promises it');
  check('knownCue present', !!(m.encounter && m.encounter.knownCue), 'missing');
  check('armor 0 deliberate', m.armor === 0, JSON.stringify(m.armor));
  check('loot tier 2', m.loot && m.loot.tier === 2, JSON.stringify(m.loot));
}

// 2. LANDLORD apex
console.log('\n2. Landlord (apex):');
{
  const m = byId.landlord;
  check('hp 150-170', m.hp[0] === 150 && m.hp[1] === 170, JSON.stringify(m.hp));
  check('eviction 20-28', m.attack.damage[0] === 20 && m.attack.damage[1] === 28, JSON.stringify(m.attack.damage));
  check('recurring addenda', has('llAddenda'), 'one-shot llSpread still the only path');
  check('rent implemented', has('Rent comes due') || has('rent'), 'no rent damage');
  check('foreclosure phase fires', has("'foreclosing'") || has('"foreclosing"'), 'phase never set');
  check('heal scales', has('llAddenda') && /Math\.min\(1 \+ \(m\.llAddenda/.test(gameJs), 'flat +2 heal');
  check('apex loot 0.2/tier 4', m.loot && m.loot.chance === 0.2 && m.loot.tier === 4, JSON.stringify(m.loot));
  const slain = (m.codexStages || {}).slain || '';
  check('slain: rent/addenda/spread all implemented',
    has('llAddenda') && slain.includes('Addendum'), 'slain promises more than code');
}

// 3. PAPARAZZO
console.log('\n3. Paparazzo (exclusive reachable):');
{
  const m = byId.paparazzo;
  check('hit teaches +2', /pzPrediction.{0,80}\(hitPlayer \? 2 : 1\)/.test(gameJs), 'still +1 always');
  check('hp 70-90', m.hp[0] === 70 && m.hp[1] === 90, JSON.stringify(m.hp));
  check('knownCue present', !!(m.encounter && m.encounter.knownCue), 'missing');
  check('armor 1', m.armor === 1, JSON.stringify(m.armor));
  check('loot tier 3', m.loot && m.loot.tier === 3, JSON.stringify(m.loot));
}

// 4. UNDERSTUDY
console.log('\n4. Understudy (codex moves real):');
{
  const m = byId.understudy;
  check('performing at 3', has('totalSeen >= 3'), 'still >= 4');
  check('OPENING STEAL implemented', has('usBestMove') || has('usOpened'), 'codex lies');
  check('DESPERATE IMPROV implemented', has('usImprov') || has('IMPROVIS'), 'codex lies');
  check('hp 80-100', m.hp[0] === 80 && m.hp[1] === 100, JSON.stringify(m.hp));
  check('knownCue present', !!(m.encounter && m.encounter.knownCue), 'missing');
  check('loot tier 3', m.loot && m.loot.tier === 3, JSON.stringify(m.loot));
  const slain = (m.codexStages || {}).slain || '';
  check('slain moves implemented',
    (!slain.includes('Opening Steal') || has('usBestMove') || has('usOpened')) &&
    (!slain.includes('Desperate Improv') || has('usImprov') || has('IMPROVIS')),
    'slain advertises unimplemented moves');
}

// 5. UNION REP loot
console.log('\n5. Union rep loot:');
{
  const m = byId.union_rep;
  check('loot tier 3', m.loot && m.loot.tier === 3, JSON.stringify(m.loot));
}

// 6. Loot gating: wave-2 > wave-1
console.log('\n6. Loot gating (wave-2 earns better):');
{
  const w1 = Object.values(byId).filter(m => m.wave === 1 && m.loot && m.id !== 'gallowdeer');
  const w2 = Object.values(byId).filter(m => m.wave === 2 && m.loot);
  const w1MaxTier = Math.max(...w1.map(m => m.loot.tier));
  const w2MinTierNew = Math.min(...['heckler','paparazzo','understudy','union_rep','landlord'].map(id => (byId[id].loot || {}).tier || 0));
  check('wave-2 new-five min tier >= wave-1 max tier', w2MinTierNew >= w1MaxTier && w2MinTierNew > 0, `w2min=${w2MinTierNew} w1max=${w1MaxTier}`);
  check('apex best loot', (byId.landlord.loot || {}).tier >= Math.max(...w2.map(m => m.loot.tier)), 'apex not best');
  check('all wave-2 have loot', w2.length === Object.values(byId).filter(m => m.wave === 2).length, 'some wave-2 lootless');
}

// 7. No codex lies (mechanical)
console.log('\n7. Codex truth:');
{
  const lies = [];
  for (const m of Object.values(byId)) {
    const slain = (m.codexStages || {}).slain || '';
    for (const mv of ['Opening Steal', 'Desperate Improv', 'Pile-On', 'PileOn']) {
      if (slain.includes(mv)) {
        const key = mv.toLowerCase().replace(/[^a-z]/g, '');
        if (!gameJs.toLowerCase().includes(key)) lies.push(`${m.id}: ${mv}`);
      }
    }
  }
  check('no slain move without code', lies.length === 0, lies.join('; '));
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
