// PROOF (break-it food run, Steve 2026-10-08): phantom pantry kcal + dead buttons.
//
// CATCH 1 (honesty): two code paths promised kcal "to the pantry" but bumped
//   the compat counter v.pantryKcal directly — a phantom number that
//   villageEats' end-of-day sync re-derives from the item list, so the food
//   evaporated overnight:
//     - game.js checkGenesis: haven genesis crop "+500 kcal to the pantry"
//     - betrayal.js inviteReward 'cache': "+800-2000 kcal to the pantry"
//   FIX: both now route through stockPantry() — real items, real kcal.
// CATCH 2 (dead code): thief.steal_pantry existed in abilities.json but had no
//   ABILITY_ACTION_IMPLS entry — the button told the player "isn't wired up
//   yet". FIX: wired a minimal honest impl (50% clean / caught = -20 trust).
// CATCH 3 (dead code): cannibal_frenzy.feed_hunger was a dead duplicate of the
//   working legacy 'cannibal_frenzy'. FIX: dead data action removed.
//
// Run pre-fix : red  (phantoms evaporate; thief button dead)
// Run post-fix: green
//   node scripts/test-food-break-pantry-phantoms.js      (SEED env override)
//
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261008', 10);
Math.random = mulberry32(SEED); // seed BEFORE eval: modules capture Math.random at load
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
let lastSaid = '';
const origSay = Game.say.bind(Game);
Game.say = (t) => { lastSaid = String(t); return origSay(t); };
const live = (v) => Game.pantryKcalLive(v || Game.state.village);

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar, v = Game.state.village;
  console.log(`seed=${SEED}`);

  // --- CATCH 1a: genesis crop at haven yields REAL pantry food ---
  // Put a genesis tile on the haven tile, player standing elsewhere.
  let hx = -1, hy = -1;
  for (let y = 0; y < 9 && hx < 0; y++) for (let x = 0; x < 9; x++) {
    const t = Game.tileAt(x, y);
    if (t && (t.type === 'haven' || t.isHaven)) { hx = x; hy = y; break; }
  }
  // step off the haven tile so the yield goes to the haven, not the player
  if (hx >= 0) { Game.map.px = (hx + 3) % 9; Game.map.py = (hy + 3) % 9; }
  if (hx >= 0) {
    Game.tileAt(hx, hy).genesis = { daysLeft: 5 };
    v.pantry = [];
    const before = live();
    Game.checkGenesis();
    const gained = live() - before;
    ok('haven genesis crop adds 500 REAL kcal to the pantry', gained === 500, `pantryKcalLive delta=${gained}`);
    ok('genesis yield arrives as an item (survives end-of-day sync)',
      v.pantry.some(i => /genesis/i.test(i.name) && (i.kcalEach || 0) * (i.units || 1) === 500),
      `pantry=${JSON.stringify(v.pantry.map(i => i.name))}`);
  } else {
    ok('haven tile found for genesis test', false, 'no haven tile on map');
  }

  // --- CATCH 1b: inviteReward 'cache' yields REAL pantry food ---
  const vid = (v.roster || [])[0];
  let caches = 0, cacheReal = 0;
  v.pantry = [];
  for (let i = 0; i < 30 && caches < 4; i++) {
    const dayBefore = s.day, before = live();
    const r = Game.inviteReward(vid);
    if (s.day !== dayBefore) continue; // day rolled mid-call; skip noisy sample
    if (r && r.kind === 'cache') {
      caches++;
      if (live() - before > 0) cacheReal++;
    }
  }
  ok('inviteReward produced cache outcomes to test', caches > 0, `caches=${caches}`);
  ok('buried-cache rewards arrive as REAL pantry kcal', caches > 0 && cacheReal === caches,
    `real=${cacheReal}/${caches}`);

  // --- CATCH 2: thief.steal_pantry is wired ---
  // Stand inside the haven so the pantry is in reach.
  if (hx >= 0) { Game.map.px = hx; Game.map.py = hy; }
  s.insideHaven = true;
  grant('thief');
  v.pantry = [];
  Game.stockPantry(1000, 'Smoked fish');
  v.trust = v.trust || {}; v.trust[s.villagerId] = 50;
  const list = Game.activatableAbilities().filter(a => a.id === 'thief.steal_pantry');
  ok('thief.steal_pantry appears in the UI list', list.length === 1, `found=${list.length}`);
  const panBefore = live();
  const invBefore = (s.inventory || []).reduce((t, i) => t + ((i.kcalEach || 0) * (i.units || 1)), 0);
  Game.activateAbility('thief.steal_pantry');
  ok('Light Fingers does not say "isn\'t wired up yet"', !/isn't wired up yet/.test(lastSaid), `said: ${lastSaid.slice(0, 90)}`);
  const invAfter = (s.inventory || []).reduce((t, i) => t + ((i.kcalEach || 0) * (i.units || 1)), 0);
  ok('Light Fingers moves food pantry -> pack', invAfter > invBefore && live() < panBefore,
    `pack ${invBefore}->${invAfter}, pantry ${panBefore}->${live()}`);
  const trustAfter = v.trust[s.villagerId];
  ok('Light Fingers trust outcome is honest (50 or 30)', trustAfter === 50 || trustAfter === 30,
    `trust=${trustAfter}`);
  // caught-rate sanity: ~50% over trials (seeded, deterministic per seed)
  let caught = 0, trials = 0;
  for (let i = 0; i < 40; i++) {
    v.pantry = []; Game.stockPantry(1000, 'Smoked fish');
    v.trust[s.villagerId] = 50;
    Game.activateAbility('thief.steal_pantry');
    trials++;
    if (v.trust[s.villagerId] === 30) caught++;
  }
  const rate = caught / trials;
  console.log(`  light-fingers caught rate: ${caught}/${trials} = ${rate.toFixed(2)}`);
  ok('Light Fingers caught rate within 0.30-0.70 (50% design)', rate >= 0.3 && rate <= 0.7, `rate=${rate}`);

  // --- CATCH 3: no dead duplicate for cannibal_frenzy; legacy still works ---
  grant('cannibal_frenzy');
  const dupes = Game.activatableAbilities().filter(a => /cannibal/i.test(a.id));
  ok('exactly one Feed the Red Hunger button', dupes.length === 1 && dupes[0].id === 'cannibal_frenzy',
    `found: ${dupes.map(a => a.id).join(',')}`);
  s.kcal = 100; // starving
  const k0 = s.kcal;
  Game.activateAbility('cannibal_frenzy');
  ok('legacy Red Hunger still fires (+1000 kcal when starving)', s.kcal === k0 + 1000, `delta=${s.kcal - k0}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
