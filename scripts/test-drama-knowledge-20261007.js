// Drama D2 proof: knowledge and codex moments (Steve 2026-10-07).
// Verifies Game.drama wiring for: plant identification, technique learning,
// codex linking, skill gains, 1st-tease whisper, aha moments
// — plus the pre-System gate and integration scaling.
// Usage: node scripts/test-drama-knowledge-20261007.js [SEED]
// Env TEST_ROOT overrides the repo root (for pre-commit verification).
const fs = require('fs');
const path = require('path');
const ROOT = process.env.TEST_ROOT || path.join(__dirname, '..');

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

// --- load production scripts ---
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/ledger.js', 'src/js/drama.js',
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const Drama = globalThis.Scattering.Drama;

console.log('== drama-knowledge D2 proof, seed ' + SEED + ' ==');

// --- record Game.drama calls AND Drama method invocations ---
const dramaCalls = [];
const origDrama = Game.drama;
Game.drama = function (kind, ...args) {
  dramaCalls.push({ kind, args });
  return origDrama.call(this, kind, ...args);
};
const callsOf = (kind) => dramaCalls.filter(c => c.kind === kind);
const clearCalls = () => { dramaCalls.length = 0; };

// spy on the 6 Drama methods to prove dispatch + integration injection
const methodSpies = {};
const D2_METHODS = ['plantIdentified', 'techniqueLearned', 'codexLinked', 'skillGained', 'teaseFaint', 'ahaMoment'];
D2_METHODS.forEach(m => {
  methodSpies[m] = { calls: [] };
  const orig = Drama[m];
  ok('Drama.' + m + ' exists', typeof orig === 'function');
  Drama[m] = function (...args) {
    methodSpies[m].calls.push(args);
    return orig.apply(this, args);
  };
});
// kind -> method name mapping (levelUp maps to abilityLevelUp in C2; ours are 1:1)
const KIND_METHOD = {
  plantIdentified: 'plantIdentified', techniqueLearned: 'techniqueLearned',
  codexLinked: 'codexLinked', skillGained: 'skillGained',
  teaseFaint: 'teaseFaint', ahaMoment: 'ahaMoment',
};

async function main() {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4;
  Game.map = Game.map || {};
  Game.map.px = 4; Game.map.py = 4;

  // === 1. DAY-7 GATE: all 6 kinds blocked pre-arrival ===
  Game.state.systemArrived = false;
  clearCalls();
  Game.drama('plantIdentified', 4, 4, 'Chickweed');
  Game.drama('techniqueLearned', 4, 4, 'test_tech');
  Game.drama('codexLinked', 'Testville');
  Game.drama('skillGained', 4, 4, 'foraging');
  Game.drama('teaseFaint');
  Game.drama('ahaMoment', 4, 4);
  const preCalls = Object.values(methodSpies).reduce((n, sp) => n + sp.calls.length, 0);
  ok('day-7 gate blocks all 6 D2 kinds pre-arrival', preCalls === 0, 'fired=' + preCalls);

  // === 2. DISPATCH: all 6 kinds route post-arrival with integration appended ===
  Game.state.systemArrived = true;
  Object.values(methodSpies).forEach(sp => sp.calls.length = 0);
  Game.drama('plantIdentified', 4, 4, 'Chickweed');
  Game.drama('techniqueLearned', 4, 4, 'test_tech');
  Game.drama('codexLinked', 'Testville');
  Game.drama('skillGained', 4, 4, 'foraging');
  Game.drama('teaseFaint');
  Game.drama('ahaMoment', 4, 4);
  Object.keys(KIND_METHOD).forEach(kind => {
    const m = KIND_METHOD[kind];
    ok(kind + ' dispatched post-arrival', methodSpies[m].calls.length === 1, 'calls=' + methodSpies[m].calls.length);
    const args = methodSpies[m].calls[0] || [];
    ok(kind + ' got integration appended', typeof args[args.length - 1] === 'number', 'last=' + args[args.length - 1]);
  });

  // === 3. identifyPlant fires plantIdentified ===
  clearCalls();
  Object.values(methodSpies).forEach(sp => sp.calls.length = 0);
  const pid = (Game.data.plants || []).map(p => p.id).find(id => !Game.plantKnown(id));
  if (pid) {
    const pdef = Game.data.plants.find(p => p.id === pid);
    Game.identifyPlant(pid, 'observation');
    ok('identifyPlant fired plantIdentified', callsOf('plantIdentified').length >= 1,
      'kinds: ' + dramaCalls.map(c => c.kind).join(','));
    if (callsOf('plantIdentified').length) {
      ok('plantIdentified carried plant name', callsOf('plantIdentified')[0].args[2] === pdef.name,
        JSON.stringify(callsOf('plantIdentified')[0].args.slice(0, 4)));
    }
  } else {
    ok('identifyPlant fired plantIdentified (no unknown plants left)', true);
  }

  // === 4. learnSkill fires skillGained ===
  clearCalls();
  Object.values(methodSpies).forEach(sp => sp.calls.length = 0);
  const skillId = (Game.data.knowledge || []).map(k => k.id).find(id => !Game.skillKnown(id));
  if (skillId) {
    const kdef = Game.data.knowledge.find(k => k.id === skillId);
    const res = Game.learnSkill(skillId, 1, 'test');
    ok('learnSkill returned true', res === true);
    ok('learnSkill fired skillGained', callsOf('skillGained').length >= 1,
      'kinds: ' + dramaCalls.map(c => c.kind).join(','));
    if (callsOf('skillGained').length) {
      ok('skillGained carried skill name', callsOf('skillGained')[0].args[2] === kdef.name,
        JSON.stringify(callsOf('skillGained')[0].args.slice(0, 4)));
    }
  } else {
    ok('learnSkill fired skillGained (no unknown skills left)', true);
  }

  // === 5. synergyTease n=1 fires teaseFaint; n=2 does NOT ===
  clearCalls();
  Object.values(methodSpies).forEach(sp => sp.calls.length = 0);
  const syn = (Game.data.synergies || []).find(x => (x.discovery_method || {}).tease1);
  if (syn) {
    Game.state.scholar.synergyAttempts = Game.state.scholar.synergyAttempts || {};
    Game.synergyTease(syn, 1);
    ok('1st tease fired teaseFaint', methodSpies.teaseFaint.calls.length === 1,
      'calls=' + methodSpies.teaseFaint.calls.length);
    ok('1st tease did NOT fire synergyShimmer', (dramaCalls.filter(c => c.kind === 'synergyShimmer').length) === 0);
    // n=2 path still works (existing C2 behavior)
    Game.synergyTease(syn, 2);
    ok('2nd tease fired synergyShimmer (C2 intact)', dramaCalls.filter(c => c.kind === 'synergyShimmer').length === 1);
  } else {
    ok('synergy tease paths (no tease1 synergy in data)', true);
  }

  // === 6. All 6 Drama methods run crash-free on stub DOM ===
  Object.values(methodSpies).forEach(sp => sp.calls.length = 0);
  let crashed = null;
  try {
    Drama.plantIdentified(4, 4, 'Test Plant', 3);
    Drama.techniqueLearned(4, 4, 'test_technique', 2);
    Drama.codexLinked('Testville', 3);
    Drama.skillGained(4, 4, 'test_skill', 1);
    Drama.teaseFaint(2);
    Drama.ahaMoment(4, 4, 3);
  } catch (e) { crashed = e.message; }
  ok('all 6 D2 methods crash-free (incl. L3 paths)', crashed === null, crashed);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
