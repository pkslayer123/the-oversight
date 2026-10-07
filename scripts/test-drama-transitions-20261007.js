// Drama C2 proof: life, death, and transition moments (Steve 2026-10-07).
// Verifies Game.drama wiring for: player death, mantle transfer/new life,
// ability level-up, synergy pre-reveal shimmer, village birth, village death
// — plus the pre-System gate and integration scaling.
// Usage: node scripts/test-drama-transitions-20261007.js [SEED]
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
const realRandom = Math.random;
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

console.log('== drama-transitions C2 proof, seed ' + SEED + ' ==');

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
['playerDeath', 'newLife', 'abilityLevelUp', 'synergyShimmer', 'villageBirth', 'villageDeath'].forEach(m => {
  methodSpies[m] = { calls: [] };
  const orig = Drama[m];
  ok('Drama.' + m + ' exists', typeof orig === 'function');
  Drama[m] = function (...args) {
    methodSpies[m].calls.push(args);
    return orig.apply(this, args);
  };
});

async function main() {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4;

  // === 1. DAY-7 GATE: all 6 kinds blocked pre-arrival ===
  Game.state.systemArrived = false;
  clearCalls();
  Game.drama('playerDeath', 4, 4, 'Test', 'testing');
  Game.drama('newLife', 'Test');
  Game.drama('levelUp', 4, 4, 'Test', 2);
  Game.drama('synergyShimmer');
  Game.drama('villageBirth', 'Baby', 'Parent');
  Game.drama('villageDeath', 'Elder', 'old age');
  const preCalls = Object.values(methodSpies).reduce((n, sp) => n + sp.calls.length, 0);
  ok('day-7 gate blocks all 6 C2 kinds pre-arrival', preCalls === 0, 'fired=' + preCalls);

  // === 2. DISPATCH: all 6 kinds route post-arrival with integration appended ===
  Game.state.systemArrived = true;
  Object.values(methodSpies).forEach(sp => sp.calls.length = 0);
  Game.drama('playerDeath', 4, 4, 'Test', 'testing');
  Game.drama('newLife', 'Test');
  Game.drama('levelUp', 4, 4, 'Test', 2);
  Game.drama('synergyShimmer');
  Game.drama('villageBirth', 'Baby', 'Parent');
  Game.drama('villageDeath', 'Elder', 'old age');
  ['playerDeath', 'newLife', 'abilityLevelUp', 'synergyShimmer', 'villageBirth', 'villageDeath'].forEach(m => {
    ok(m + ' dispatched post-arrival', methodSpies[m].calls.length === 1, 'calls=' + methodSpies[m].calls.length);
    const integ = methodSpies[m].calls[0] && methodSpies[m].calls[0][methodSpies[m].calls[0].length - 1];
    ok(m + ' got integration appended', typeof integ === 'number', 'integ=' + integ);
  });

  // === 3. ABILITY LEVEL-UP: gainAbilityXP fires levelUp drama ===
  clearCalls();
  Object.values(methodSpies).forEach(sp => sp.calls.length = 0);
  // give the scholar a real ability at xp threshold
  const abId = 'forager';
  let ab = (s.abilities || []).find(a => a.id === abId);
  if (!ab) {
    s.abilities = s.abilities || [];
    ab = { id: abId, name: 'Forager', level: 1, xp: 0 };
    s.abilities.push(ab);
  }
  ab.level = 1; ab.xp = 9; // need 10 at L1
  try { Game.gainAbilityXP(abId, 1); } catch (e) { console.log('gainAbilityXP threw: ' + e.message); }
  ok('level-up fired levelUp drama', callsOf('levelUp').length >= 1,
    'kinds: ' + dramaCalls.map(c => c.kind).join(','));
  if (callsOf('levelUp').length) {
    ok('levelUp carried ability name', callsOf('levelUp')[0].args[2] === ab.name, JSON.stringify(callsOf('levelUp')[0].args));
    ok('levelUp carried new level', callsOf('levelUp')[0].args[3] === 2, JSON.stringify(callsOf('levelUp')[0].args));
  }

  // === 4. SYNERGY SHIMMER: 2nd tease fires pre-reveal ===
  clearCalls();
  Object.values(methodSpies).forEach(sp => sp.calls.length = 0);
  const fakeSyn = { id: 'test_syn', discovery_method: { tease1: 't1', tease2: 't2', hint: 'the hint' } };
  s.synergyAttempts = s.synergyAttempts || {};
  try { Game.synergyTease(fakeSyn, 1); } catch (e) {}
  ok('tease 1 does NOT fire shimmer', callsOf('synergyShimmer').length === 0);
  try { Game.synergyTease(fakeSyn, 2); } catch (e) { console.log('synergyTease threw: ' + e.message); }
  ok('tease 2 fires synergyShimmer', callsOf('synergyShimmer').length === 1,
    'kinds: ' + dramaCalls.map(c => c.kind).join(','));

  // === 5. VILLAGE BIRTH: simVillageDay fires villageBirth (forced via RNG stub) ===
  clearCalls();
  Object.values(methodSpies).forEach(sp => sp.calls.length = 0);
  const v = Game.state.village;
  v.day = 300;
  v.x = 4; v.y = 4; // haven sits at world center (simVillageDay reads village.x/y)
  v.roster = v.roster || [];
  // ensure at least 2 coupled adults
  const mk = (id, age) => ({ id, name: 'Test ' + id, age, alive: true, partner: id + '_p', children: [] });
  v.roster.push(mk('p1', 25), mk('p1_p', 24), mk('p2', 28), mk('p2_p', 27));
  v.population = (v.population || 0) + 4;
  v.news = [];
  Math.random = () => 0.0001; // force the 0.005 birth roll AND pick couples
  // stub name gen to avoid deep deps
  const origGen = Game.genNameForOrigin;
  Game.genNameForOrigin = () => ({ name: 'Baby Test' });
  try { Game.simVillageDay(v); } catch (e) { console.log('simVillageDay threw: ' + e.message); }
  Game.genNameForOrigin = origGen;
  Math.random = mulberry32(SEED + 999);
  ok('birth fired villageBirth drama', callsOf('villageBirth').length >= 1,
    'kinds: ' + dramaCalls.map(c => c.kind).join(','));

  // === 6. VILLAGE DEATH (old age): simVillageDay fires villageDeath ===
  clearCalls();
  Object.values(methodSpies).forEach(sp => sp.calls.length = 0);
  v.roster.push({ id: 'elder1', name: 'Elder Test', age: 80, alive: true, partner: null, children: [] });
  Math.random = () => 0.0001; // force the 0.005 old-age roll
  try { Game.simVillageDay(v); } catch (e) { console.log('simVillageDay threw: ' + e.message); }
  Math.random = mulberry32(SEED + 1000);
  ok('old-age death fired villageDeath drama', callsOf('villageDeath').length >= 1,
    'kinds: ' + dramaCalls.map(c => c.kind).join(','));
  if (callsOf('villageDeath').length) {
    ok('villageDeath carried cause', callsOf('villageDeath')[0].args[1] === 'old age',
      JSON.stringify(callsOf('villageDeath')[0].args));
  }

  // === 7. PLAYER DEATH (ledger): full mantle flow fires playerDeath + newLife ===
  clearCalls();
  // progState / npcIds live in modules not loaded in this harness — stub them
  if (typeof Game.progState !== 'function') Game.progState = () => ({});
  if (typeof Game.endingFrame !== 'function') Game.endingFrame = () => 'unwritten';
  if (typeof Game.npcIds !== 'function') {
    const vids = (Game.data.villagers || []).filter(v => v.id !== Game.villagerId).slice(0, 3).map(v => v.id);
    Game.npcIds = () => vids;
  }
  Object.values(methodSpies).forEach(sp => sp.calls.length = 0);
  Game.state.systemArrived = true;
  // ensure candidates exist for the successor
  const before = callsOf('playerDeath').length;
  try { Game.playerDeath('testing the drama'); } catch (e) { console.log('playerDeath threw: ' + e.message); }
  ok('playerDeath fired playerDeath drama', callsOf('playerDeath').length > before,
    'kinds: ' + dramaCalls.map(c => c.kind).join(','));
  // if a successor was found, newLife should also fire
  const newLifeFired = callsOf('newLife').length >= 1;
  ok('mantle transfer fired newLife drama (if successor existed)', newLifeFired || Game.villageLost,
    'newLife=' + callsOf('newLife').length + ' villageLost=' + !!Game.villageLost);

  // === 8. NO-CRASH: all 6 Drama methods run clean with stub DOM ===
  let crashed = null;
  try {
    Drama.playerDeath(4, 4, 'T', 'c', 2);
    Drama.newLife('T', 2);
    Drama.abilityLevelUp(4, 4, 'A', 2, 2);
    Drama.synergyShimmer(2);
    Drama.villageBirth('B', 'P', 2);
    Drama.villageDeath('E', 'old age', 2);
  } catch (e) { crashed = e.message; }
  ok('all 6 Drama methods run without crashing', crashed === null, crashed);

  console.log(`\n${pass} passed, ${fail} failed (seed ${SEED})`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
