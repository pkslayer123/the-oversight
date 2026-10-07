// Drama D1 proof: ability signature visuals (Steve 2026-10-07).
// Verifies: all 10 core abilities route to their unique signature via
// Game.drama('signature'), the day-7 gate blocks pre-arrival, integration is
// appended, pool-styled fallbacks fire for other abilities, and every
// signature method runs crash-free on stub DOM.
// Usage: node scripts/test-drama-abilities-20261007.js [SEED]
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// --- seeded PRNG (PROOF-TEST RNG STABILITY lesson) ---
const SEED = parseInt(process.env.SEED || process.argv[2] || '20261007', 10);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(SEED);

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL ' + name + (detail ? ' -- ' + detail : '')); }
}

// --- minimal DOM stub for Drama methods ---
function fakeEl() {
  return {
    style: { setProperty() {} }, innerHTML: '',
    classList: { add() {}, remove() {} },
    appendChild() {}, remove() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 40, height: 40 }),
    offsetWidth: 100,
    clientWidth: 390, clientHeight: 400,
  };
}
global.document = {
  createElement: () => fakeEl(),
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  contains: () => false,
  head: { appendChild() {} },
  body: fakeEl(),
};
global.getComputedStyle = () => ({ position: 'static' });
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))),
});

// --- load production scripts in index.html order (subset) ---
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/drama.js',
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const Drama = globalThis.Scattering.Drama;

console.log('== drama-abilities D1 proof, seed ' + SEED + ' ==');

const TEN = ['triage', 'forage_identification', 'brawler_instinct', 'patient_aim',
  'silver_tongue', 'diplomat', 'pathfinder', 'eagle_eye', 'lie_detector', 'game_sense'];

// record Game.drama calls
const dramaCalls = [];
const origDrama = Game.drama;
Game.drama = function (kind, ...args) {
  dramaCalls.push({ kind, args });
  return origDrama.call(this, kind, ...args);
};
const callsOf = (kind) => dramaCalls.filter(c => c.kind === kind);
const clearCalls = () => { dramaCalls.length = 0; };

async function main() {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4;

  ok('abilities data loaded', Array.isArray(Game.data.abilities) && Game.data.abilities.length > 0,
    'n=' + (Game.data.abilities || []).length);
  ok('all 10 core abilities exist in data',
    TEN.every(id => (Game.data.abilities || []).some(a => a.id === id)),
    'missing: ' + TEN.filter(id => !(Game.data.abilities || []).some(a => a.id === id)).join(','));

  // === 1. DAY-7 GATE: no signature drama before the System arrives ===
  // (spy at the Drama layer — the gate lives inside Game.drama)
  let sigFired = 0;
  const sigGateOrig = Drama.abilitySignature;
  Drama.abilitySignature = function (...a) { sigFired++; return sigGateOrig.apply(this, a); };
  Game.state.systemArrived = false;
  clearCalls();
  Game.noteAbilityUse('triage');
  Game.noteAbilityUse('brawler_instinct');
  Drama.abilitySignature = sigGateOrig;
  ok('gate blocks signature pre-arrival', sigFired === 0, 'fired: ' + sigFired);

  // === 2. POST-ARRIVAL: each of the 10 fires a signature ===
  Game.state.systemArrived = true;
  clearCalls();
  TEN.forEach(id => Game.noteAbilityUse(id));
  const sigs = callsOf('signature');
  ok('10 signature calls fired', sigs.length === 10, 'got ' + sigs.length);
  ok('each core ability fired once',
    TEN.every(id => sigs.some(c => c.args[0] === id)),
    'kinds: ' + sigs.map(c => c.args[0]).join(','));

  // === 3. args shape: (abilityId, x, y, color, pool) + integration appended ===
  // (Game.drama-layer calls carry the pre-injection args; verify the full
  // shape at the Drama layer where integration is appended)
  const t = sigs.find(c => c.args[0] === 'triage');
  ok('triage call shape', t && typeof t.args[1] === 'number' && typeof t.args[2] === 'number' &&
    typeof t.args[3] === 'string' && typeof t.args[4] === 'string',
    JSON.stringify(t && t.args));
  ok('triage pool is care', t && t.args[4] === 'care', 'pool=' + (t && t.args[4]));
  ok('triage color is care green', t && t.args[3] === '#7cfc9a', 'color=' + (t && t.args[3]));
  let integSeen = null;
  const integOrig = Drama.abilitySignature;
  Drama.abilitySignature = function (...a) { integSeen = a[5]; return integOrig.apply(this, a); };
  Game.noteAbilityUse('triage');
  Drama.abilitySignature = integOrig;
  ok('integration appended as 6th arg', typeof integSeen === 'number', 'integ=' + integSeen);

  // === 4. dispatcher routes to unique methods (spy) ===
  const seen = {};
  const spies = {};
  ['sigTriage', 'sigForageId', 'sigBrawler', 'sigPatientAim', 'sigSilverTongue',
   'sigDiplomat', 'sigPathfinder', 'sigEagleEye', 'sigLieDetector', 'sigGameSense'].forEach(m => {
    spies[m] = Drama[m];
    Drama[m] = function (...a) { seen[m] = (seen[m] || 0) + 1; return spies[m].apply(this, a); };
  });
  TEN.forEach(id => Drama.abilitySignature(id, 4, 4, '#fff', 'system', 1));
  Object.keys(spies).forEach(m => { Drama[m] = spies[m]; });
  ok('all 10 unique sig methods invoked', Object.keys(seen).length === 10,
    'seen: ' + Object.keys(seen).join(','));
  ok('each invoked exactly once', Object.values(seen).every(n => n === 1),
    JSON.stringify(seen));

  // === 5. pool fallback for non-core abilities ===
  let poolHit = null;
  const poolOrig = Drama.poolSignature;
  Drama.poolSignature = function (pool, ...a) { poolHit = pool; return poolOrig.call(this, pool, ...a); };
  Drama.abilitySignature('rage', 4, 4, '#ff5252', 'combat', 2);
  Drama.abilitySignature('open_book', 4, 4, '#4df3ff', 'system', 2);
  Drama.poolSignature = poolOrig;
  ok('unknown ability falls back to poolSignature', poolHit === 'system', 'pool=' + poolHit);

  // === 6. every sig method crash-free at L1/L2/L3 on stub DOM ===
  const methods = ['sigTriage', 'sigForageId', 'sigBrawler', 'sigPatientAim', 'sigSilverTongue',
    'sigDiplomat', 'sigPathfinder', 'sigEagleEye', 'sigLieDetector', 'sigGameSense'];
  let crashed = null;
  try {
    methods.forEach(m => { [0, 1, 2, 3].forEach(lv => Drama[m](4, 4, '#ffffff', lv)); });
    ['combat', 'social', 'exploration', 'investigation', 'system', 'care', 'fieldcraft', 'craft', 'bogus']
      .forEach(p => { [0, 2, 3].forEach(lv => Drama.poolSignature(p, 4, 4, '#ffffff', lv)); });
    Drama.abilitySignature('triage', 4, 4, '#7cfc9a', 'care', 3);
  } catch (e) { crashed = e.message; }
  ok('all sig methods crash-free L0-L3', crashed === null, crashed);

  // === 7. Game.drama('signature') routes to D.abilitySignature ===
  let routed = null;
  const asOrig = Drama.abilitySignature;
  Drama.abilitySignature = function (...a) { routed = a; return asOrig.apply(this, a); };
  Game.drama('signature', 'diplomat', 4, 4, '#ff6b9d', 'social');
  Drama.abilitySignature = asOrig;
  ok('Game.drama routes signature', routed !== null && routed[0] === 'diplomat',
    'routed=' + JSON.stringify(routed && routed[0]));
  ok('integration appended by Game.drama', routed !== null && typeof routed[5] === 'number',
    'args=' + JSON.stringify(routed));

  // === 8. noteAbilityUse still logs + synergy machinery intact ===
  clearCalls();
  const logBefore = (s.abilityUseLog || []).length;
  Game.noteAbilityUse('triage');
  ok('abilityUseLog still records', (s.abilityUseLog || []).length === logBefore + 1);
  ok('signature fired alongside log', callsOf('signature').length === 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
