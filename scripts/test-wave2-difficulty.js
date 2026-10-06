// Wave-2 difficulty pass acceptance test (Steve 2026-10-06).
// Proves: heckler redesign (set fires), landlord apex-via-moderator (rent/addenda/foreclosure),
// paparazzo prediction reachability, understudy codex moves implemented,
// loot gating (wave-2 > wave-1), no codex lies.
//
// HISTORY: written against evidence/2026-10-06/wave2-difficulty-spec.md. The spec
// was NOT applied verbatim — siblings shipped playtest-decided variants under
// Steve's tag (bf080a1 heckler, 3939c53 landlord, e069503 understudy, 23ba720
// moderator-as-apex, paparazzo per scripts/test-paparazzo-exclusive.js). This test
// was updated 2026-10-06 to gate the SHIPPED designs; each divergence cites its
// sanction. The REMAINING real work is the loot table (8 checks, failing).
//
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
// The heckler's AI block, for scoped checks (a file-wide grep for '0.4' hits
// unrelated systems — conversation, charcoal, NPC betrayal).
const hkBlock = gameJs.slice(gameJs.indexOf('if (this.hkIs(m)) {'), gameJs.indexOf('if (this.hkIs(m)) {') + 9000);

console.log('\n=== WAVE-2 DIFFICULTY ACCEPTANCE ===\n');

// 1. HECKLER redesign (shipped: bf080a1)
console.log('1. Heckler (the set must fire):');
{
  const m = byId.heckler;
  check('hp 85-100', m.hp[0] === 85 && m.hp[1] === 100, JSON.stringify(m.hp));
  check('direct chip 6-10', m.attack.damage[0] === 6 && m.attack.damage[1] === 10, JSON.stringify(m.attack.damage));
  // SUPERSEDED (bf080a1; audit rec 2 offered "lower headliner to 3" as an option):
  // spec said >= 4, shipped hkHeadlinerAt = 3 (even more reachable).
  check('headliner at 3 (shipped)', has('hkHeadlinerAt = 3'), 'threshold changed');
  // SUPERSEDED (bf080a1): spec said jibe every round; shipped scaling 55-90%
  // chance + guaranteed triggers on miss/mocked/landed (the old 0.4 gate is gone).
  check('old 0.4 jibe gate gone from heckler block', !hkBlock.includes('Math.random() < 0.4'), 'gate still present');
  check('jibe chance scales with shame', hkBlock.includes('jibeChance'), 'no scaling jibe');
  // SUPERSEDED (bf080a1): spec said miss = +1 bonus shame; shipped = miss
  // guarantees the jibe (forces the trigger). knownCue no longer promises double-mock.
  check('miss forces a jibe', hkBlock.includes('lastPlayerMissed') && hkBlock.includes('lastMissed ||'), 'no miss trigger');
  check('PILE-ON implemented', has('PILE-ON') || has('pileOn'), 'codex promises it');
  check('knownCue present', !!(m.encounter && m.encounter.knownCue), 'missing');
  check('armor 0 deliberate', m.armor === 0, JSON.stringify(m.armor));
  // SUPERSEDED (bf080a1): spec said compulsion +1; shipped +2 ("doubles the shame").
  check('compulsion +2 shipped', has("(+2 SHAME)"), 'penalty changed');
  check('loot tier 2 — MISSING', m.loot && m.loot.tier === 2, JSON.stringify(m.loot));
}

// 2. LANDLORD (shipped: 3939c53 mechanics; apex slot -> MODERATOR per 23ba720)
console.log('\n2. Landlord (lease grows; apex is the Moderator):');
{
  const m = byId.landlord;
  // SUPERSEDED (23ba720): spec made landlord the apex (150-170 HP). The apex
  // slot went to the new Moderator instead; landlord stays the 90-120 bruiser.
  check('hp 90-120 (bruiser, not apex)', m.hp[0] === 90 && m.hp[1] === 120, JSON.stringify(m.hp));
  check('eviction 18-26 (shipped)', m.attack.damage[0] === 18 && m.attack.damage[1] === 26, JSON.stringify(m.attack.damage));
  const mod = byId.moderator;
  check('moderator IS the apex (hp 150-170)', !!mod && mod.hp[0] === 150 && mod.hp[1] === 170, JSON.stringify(mod && mod.hp));
  check('recurring addenda', has('llAddenda'), 'one-shot llSpread still the only path');
  check('rent implemented', has('RENT') && has('takes its cut'), 'no rent damage');
  check('foreclosure phase fires', has("'foreclosing'") || has('"foreclosing"'), 'phase never set');
  // SUPERSEDED (3939c53): spec said Math.min(1 + llAddenda, 5); shipped
  // 2 + llAddenda (scales, UNCAPPED — balance footnote: grows without bound).
  check('heal scales with addenda', /2 \+ \(m\.llAddenda/.test(gameJs), 'flat heal');
  const slain = (m.codexStages || {}).slain || '';
  check('slain: rent/addenda/spread all implemented',
    has('llAddenda') && slain.includes('Addendum'), 'slain promises more than code');
  check('landlord loot — MISSING', m.loot && m.loot.chance === 0.2 && m.loot.tier === 4, JSON.stringify(m.loot));
}

// 3. PAPARAZZO (shipped: paparazzo-exclusive design, proof in scripts/test-paparazzo-exclusive.js)
console.log('\n3. Paparazzo (exclusive reachable):');
{
  const m = byId.paparazzo;
  // SUPERSEDED: spec said hit +2/miss +1, threshold 5. Shipped: +1 per DECLARE
  // (commit, +1/round), threshold 4 — exclusive ~round 4 in a normal fight.
  check('prediction +1 per declare', /PREDICTION stacks on the COMMIT/.test(gameJs), 'not per-declare');
  check('exclusive threshold 4 (shipped)', has("pzPrediction >= 4 && m.beamPhase !== 'exclusive'"), 'threshold changed');
  check('hp 65-85 (shipped)', m.hp[0] === 65 && m.hp[1] === 85, JSON.stringify(m.hp));
  check('knownCue present', !!(m.encounter && m.encounter.knownCue), 'missing');
  // SUPERSEDED: spec said armor 1; shipped armor 0 + energy 0.5 (glass, not hide).
  check('armor 0 + energy 0.5 (shipped)', m.armor === 0 && (m.resistances || {}).energy === 0.5,
    JSON.stringify({ armor: m.armor, res: m.resistances }));
  check('loot tier 3 — MISSING', m.loot && m.loot.tier === 3, JSON.stringify(m.loot));
}

// 4. UNDERSTUDY (shipped: e069503)
console.log('\n4. Understudy (codex moves real):');
{
  const m = byId.understudy;
  check('performing at 3', has('totalSeen >= 3'), 'still >= 4');
  // SUPERSEDED (e069503): spec described usBestMove/usOpened markers; shipped
  // design anticipates the most-used move once (halved) and answers with the
  // copy at 80%. The move EXISTS under its codex name in the fiction.
  check('OPENING STEAL implemented', has('OPENING STEAL'), 'codex lies');
  check('DESPERATE IMPROV implemented', has('usImprov') || has('IMPROVIS'), 'codex lies');
  // SUPERSEDED (e069503, playtest-decided): spec said 80-100; shipped 105-125
  // so it survives its own second act.
  check('hp 105-125 (shipped)', m.hp[0] === 105 && m.hp[1] === 125, JSON.stringify(m.hp));
  check('knownCue present', !!(m.encounter && m.encounter.knownCue), 'missing');
  check('loot tier 3 — MISSING', m.loot && m.loot.tier === 3, JSON.stringify(m.loot));
  const slain = (m.codexStages || {}).slain || '';
  const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
  const codeNorm = norm(gameJs);
  check('slain moves implemented',
    (!slain.includes('Opening Steal') || codeNorm.includes(norm('Opening Steal'))) &&
    (!slain.includes('Desperate Improv') || codeNorm.includes(norm('Desperate Improv'))),
    'slain advertises unimplemented moves');
}

// 5. UNION REP loot
console.log('\n5. Union rep loot:');
{
  const m = byId.union_rep;
  check('loot tier 3 — MISSING', m.loot && m.loot.tier === 3, JSON.stringify(m.loot));
}

// 6. Loot gating: wave-2 > wave-1 (UNAPPLIED — the real remaining work)
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

// 7. No codex lies (mechanical) — space-tolerant: 'OPENING STEAL' in code must
// match 'Opening Steal' in slain text.
console.log('\n7. Codex truth:');
{
  const lies = [];
  const codeNorm = gameJs.toLowerCase().replace(/[^a-z]/g, '');
  for (const m of Object.values(byId)) {
    const slain = (m.codexStages || {}).slain || '';
    for (const mv of ['Opening Steal', 'Desperate Improv', 'Pile-On', 'PileOn']) {
      if (slain.includes(mv)) {
        const key = mv.toLowerCase().replace(/[^a-z]/g, '');
        if (!codeNorm.includes(key)) lies.push(`${m.id}: ${mv}`);
      }
    }
  }
  check('no slain move without code', lies.length === 0, lies.join('; '));
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
