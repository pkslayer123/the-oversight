// MISER ATTACK (adversarial playtest 2026-10-09): break the stash.
// The armory/pharmacy sections landed 2026-10-09 with the SAME shape the
// tool path had BEFORE the 2026-10-08 miser fixes: +trust on deposit, no
// take-back sting, no per-item ledgers. Attack: deposit↔take-back cycles
// minting trust, plus engine-level section-filter bypass.
// Usage: node scripts/test-miser-attack-20261009.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
// SEED BEFORE EVAL (modules capture Math.random at load)
let _s = 12345;
const _rng = () => (_s = (_s * 1664525 + 1013904223) >>> 0) / 4294967296;
Math.random = _rng;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}`); }
}
function eq(name, got, want) {
  if (got === want) pass++;
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}
function lastSay() { return (Game.log || []).slice(-1)[0] || ''; }
function trustOf() {
  const v = Game.state.village, vid = Game.state.scholar.villagerId;
  return (v.trust || {})[vid] === undefined ? 15 : v.trust[vid];
}
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  Game.state.scholar.inventory = [];
  Game.state.scholar.villagerId = Game.generatedRoster[0].id;
  // inside the hall: physical-store gate open for donate/take
  if (Game.havenStoresAccess) Game.state.scholar.insideHaven = true;
}
function give(itemId, name) {
  Game.state.scholar.inventory.push({ itemId, name: name || itemId, units: 1, kcalEach: 0, kg: 0.8 });
  return Game.state.scholar.inventory.length - 1;
}

(async () => {
  await Game.init();
  // make the store gate permissive if the real one needs more setup
  if (Game.havenStoresAccess) {
    const real = Game.havenStoresAccess;
    Game.havenStoresAccess = function () { return this.state.scholar.insideHaven ? 'inside' : real.call(this); };
  }

  // ---------- ATTACK A: armory deposit↔take-back trust farm ----------
  freshGame();
  const idx = give('kitchen_knife', 'Kitchen knife');
  eq('knife is stashable weapon', Game.isStashableWeapon(Game.state.scholar.inventory[idx]), true);
  const t0 = trustOf();
  Game.donateWeapon(idx);
  ok('deposit weapon accepted', Game.stashState().weapons.length === 1);
  const t1 = trustOf();
  eq('deposit weapon grants +2 trust', t1 - t0, 2);
  Game.takeWeapon('kitchen_knife');
  ok('weapon taken back', Game.stashState().weapons.length === 0);
  const t2 = trustOf();
  eq('FIXED: take-back of own weapon stings -5 (farm nets -3/cycle)', t2, t1 - 5);
  // run the farm: deposit/take x10
  for (let k = 0; k < 10; k++) {
    const i2 = give('kitchen_knife', 'Kitchen knife');
    Game.donateWeapon(i2);
    Game.takeWeapon('kitchen_knife');
  }
  const tFarm = trustOf();
  console.log(`  [attack A] trust ${t0} -> after 1 deposit+take ${t2} -> after 10 more cycles ${tFarm} (farm gain: ${tFarm - t0})`);
  ok('armory trust farm prints trust per cycle (BROKEN if gain > 0)', tFarm - t0 <= 0);

  // ---------- ATTACK B: pharmacy deposit↔take-back trust farm ----------
  freshGame();
  const mi = give('field_sutures', 'Field Sutures');
  eq('sutures are medicine', Game.isMedicine(Game.state.scholar.inventory[mi]), true);
  const m0 = trustOf();
  Game.donateMedicine(mi);
  ok('deposit medicine accepted', Game.stashState().medicine.length === 1);
  Game.takeMedicine('field_sutures');
  ok('medicine taken back', Game.stashState().medicine.length === 0);
  for (let k = 0; k < 10; k++) {
    const i3 = give('field_sutures', 'Field Sutures');
    Game.donateMedicine(i3);
    Game.takeMedicine('field_sutures');
  }
  const mFarm = trustOf();
  console.log(`  [attack B] trust ${m0} -> after 11 cycles ${mFarm} (farm gain: ${mFarm - m0})`);
  ok('pharmacy trust farm prints trust per cycle (BROKEN if gain > 0)', mFarm - m0 <= 0);

  // ---------- ATTACK C: section-filter bypass (engine accepts junk) ----------
  freshGame();
  const bi = give('branch', 'Branch');
  ok('branch is NOT a weapon', Game.isStashableWeapon(Game.state.scholar.inventory[bi]) === false);
  Game.donateWeapon(bi);
  const junkIn = Game.stashState().weapons.some(w => w.itemId === 'branch');
  console.log(`  [attack C] branch deposited to ARMORY as weapon: ${junkIn}; said: "${lastSay()}"`);
  ok('armory rejects non-weapons (BROKEN if junk accepted)', !junkIn);
  freshGame();
  const bi2 = give('branch', 'Branch');
  ok('branch is NOT medicine', Game.isMedicine(Game.state.scholar.inventory[bi2]) === false);
  Game.donateMedicine(bi2);
  const junkMed = Game.stashState().medicine.some(w => w.itemId === 'branch');
  console.log(`  [attack C] branch deposited to PHARMACY as medicine: ${junkMed}; said: "${lastSay()}"`);
  ok('pharmacy rejects non-medicine (BROKEN if junk accepted)', !junkMed);

  // ---------- SOFTLOCK D: takeFromCache stale index = silent null ----------
  freshGame();
  Game.addMaterial('branch', 6);
  Game.buryCache('material', 'branch', 6);
  const cache = Game.playerCaches()[0];
  const said = [];
  const realSay = Game.say;
  Game.say = (t) => { said.push(t); };
  const res = Game.takeFromCache(cache.id, 99, 1); // stale index
  Game.say = realSay;
  console.log(`  [softlock D] stale take returned ${res === null ? 'null' : 'non-null'}, feedback lines: ${said.length}`);
  ok('stale cache take gives feedback (BROKEN if silent null)', said.length > 0 || res !== null);

  // ---------- HONESTY E: baseline paths still honest ----------
  freshGame();
  const ti = give('hand_saw', 'Hand Saw');
  const ht0 = trustOf();
  Game.donateTool(ti);            // +2
  Game.takeTool('hand_saw');      // -5 take-back sting (2026-10-08 fix)
  ok('tool deposit/take-back net (existing fix)', trustOf() === ht0 - 3);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
