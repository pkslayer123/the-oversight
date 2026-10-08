// PROOF (Steve 2026-10-08): activateAbility counted each activation TWICE.
// activateAbility() called noteAbilityUse(id) directly AND gainAbilityXP(id,1)
// — and gainAbilityXP ALSO calls noteAbilityUse — so one activation logged two
// synergy attempts (synergyAttempts inflation, e.g. one_person_army legs).
// Fixed: activateAbility delegates the logging to gainAbilityXP alone —
// one activation = one attempt = +1 XP.
//
// Demonstrates before/after: run with FIX=0 to simulate the old behavior
// (double noteAbilityUse) — it fails; FIX=1 (current code) passes.
//   node scripts/test-xp-attempts-20261008.js          -> fixed behavior, green
//   FIX=0 node scripts/test-xp-attempts-20261008.js   -> old behavior, red
//
// Run: node scripts/test-xp-attempts-20261008.js   (SEED env override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const FIX = process.env.FIX !== '0';
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261008', 10);
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = {
  getElementById: () => null,
  createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} }, body: {},
};
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function grant(id) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  let e = s.abilities.find(a => a.id === id);
  if (!e) { e = { id, name: id, level: 1, xp: 0 }; s.abilities.push(e); }
  return e;
}
// Old behavior shim: the pre-fix activateAbility called noteAbilityUse twice
// (once directly, once via gainAbilityXP). FIX=0 replays that to show red.
function activateAs(id, target) {
  if (!FIX) Game.noteAbilityUse(id); // the removed pre-fix line
  return Game.activateAbility(id, target);
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  console.log(`seed=${SEED} mode=${FIX ? 'FIXED (current code)' : 'OLD (double-count shim)'}`);

  // 'purify' WITH poison: fires — the activation attempt is logged exactly
  // once + 1 XP (the double-count fix this test was written for).
  grant('purify');
  s.poisons = [{ id: 'test-poison' }];
  s.abilityUseLog = [];
  const ab = s.abilities.find(a => a.id === 'purify');
  const xp0 = ab.xp || 0;
  activateAs('purify');
  const uses = (s.abilityUseLog || []).filter(u => u.id === 'purify').length;
  ok('one activation logs exactly ONE synergy attempt', uses === 1, `attempts=${uses}`);
  ok('one activation grants exactly +1 XP', (ab.xp || 0) - xp0 === 1, `xp delta=${(ab.xp || 0) - xp0}`);

  // 'purify' with NO poison: fails honestly ("Not poisoned.") — a fizzled
  // action is not practice (break-it food run 2026-10-08: failed activations
  // grant no XP). Reset the per-day gate so we test the no-poison path.
  s.poisons = [];
  s.purifyDay = null;
  s.abilityUseLog = [];
  const xp1 = ab.xp || 0;
  activateAs('purify');
  const uses2 = (s.abilityUseLog || []).filter(u => u.id === 'purify').length;
  ok('failed activation logs ZERO attempts', uses2 === 0, `attempts=${uses2}`);
  ok('failed activation grants ZERO XP', (ab.xp || 0) - xp1 === 0, `xp delta=${(ab.xp || 0) - xp1}`);

  // synergy discovery bookkeeping sees one attempt per activation, not two:
  // activate a real synergy leg pair (dowsing + rain_dancer in rain) and
  // check the attempt counter increments by 1 per activation.
  s.abilityUseLog = [];
  Game.state.weather = 'rain';
  grant('dowsing');
  const before = JSON.stringify(s.synergyAttempts || {});
  activateAs('dowsing');
  const after = s.synergyAttempts || {};
  const deltas = Object.keys(after).map(k => after[k] - ((JSON.parse(before))[k] || 0));
  ok('synergy attempt counters advance at most +1 per activation',
    deltas.every(d => d <= 1), `deltas=${JSON.stringify(deltas)}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
