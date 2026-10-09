// BREAK-IT FOOD ROUND 3 (2026-10-08, worker break-food-3). Hostile-player
// audit of fresh surfaces: the blood wound gate (commit bc2bf4f), the water
// economy (60deda1/5d5ed03), never-attacked food flows, honesty, dead code.
//
// BREAKS FIXED (each with a red-pre-fix/green-post-fix proof below):
//   W1. Blood Price mid-combat: _activateAbilityInner wrote s.health directly;
//       tbEnd overwrites s.health with the fighter's hp — a mid-fight Price kept
//       +500 kcal AND the wound while the -10 HP cost was silently erased.
//       Now refused in combat.
//   W2. Mantle transfer inherited bloodPriceWound: the new bearer started with
//       the dead body's open wound (reduced maxHealth, instant refusal) —
//       contradicting "new body, no old afflictions". Now reset.
//   W3. lootCorpse merged by plantId alone (round-2 F1's 9th site): looted
//       low-quality meat folded into a high-quality pack stack, laundering
//       value. Now stacksMatch-gated.
//   W4. kcalCap sibling sweep (round-1 E1's class): field-dressing meat yield,
//       alien-player care packages x4, contest kcal effects, contest bet
//       payouts, villageMeal (home + joined, 3000 literal), driftTick gains,
//       betrayal joined-meal — all bypassed the bank cap. Now clamped.
//   W5. Dead code: fillWaterFromVillage had zero callers and skipped fillWater's
//       10-kcal hauling cost. Deleted.
//   W6. villageEats honestNet counted villagers' self-caught food (ownEat, never
//       touched the pantry) as pantry burn — the "about N days" estimate ran
//       short. Now tracks real pantry outflow (drawn).
//
// Run: node scripts/test-break-food-r3.js   (SEED env override, x5)
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

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const s = Game.state.scholar;
  const cap = Game.kcalCap();
  console.log(`seed=${SEED} kcalCap=${cap} maxHealth=${Game.maxHealth()}`);

  // ============ W1. Blood Price mid-combat refusal ============
  grant('blood_magic');
  s.health = 100; s.kcal = 1000; s.bloodPriceWound = 0;
  s.bloodPriceDayPart = null; s.bloodPriceUses = 0;
  const firedOut = Game._activateAbilityInner('blood_magic');
  ok('W1a blood fires out of combat', firedOut !== false && s.bloodPriceWound === 10, `wound=${s.bloodPriceWound}`);
  const kcalAfterOut = s.kcal;
  // Enter a (fake) fight: the fighter's hp is now the live value.
  Game.tbfight = { fighters: [], over: false, result: null };
  const hpBefore = s.health, woundBefore = s.bloodPriceWound, kcalBefore = s.kcal;
  // fresh day part so the cap isn't the refuser
  s.day += 100; s.bloodPriceDayPart = null; s.bloodPriceUses = 0;
  const firedIn = Game._activateAbilityInner('blood_magic');
  ok('W1b blood refused mid-combat', firedIn === false, `fired=${firedIn} said=${lastSaid.slice(0, 60)}`);
  ok('W1c no wound/kcal/health change in combat',
    s.bloodPriceWound === woundBefore && s.kcal === kcalBefore && s.health === hpBefore,
    `wound ${woundBefore}->${s.bloodPriceWound} kcal ${kcalBefore}->${s.kcal}`);
  Game.tbfight = null;
  s.day -= 100;

  // ============ W2. Mantle transfer resets the wound ============
  s.bloodPriceWound = 30; s.bloodPriceDayPart = `${s.day}-0`; s.bloodPriceUses = 1;
  ok('W2a pre-death: wound gates maxHealth', Game.maxHealth() === 70, `maxHealth=${Game.maxHealth()}`);
  Game.playerDeath('the test');
  const s2 = Game.state.scholar;
  ok('W2b successor has no inherited wound', (s2.bloodPriceWound || 0) === 0, `wound=${s2.bloodPriceWound}`);
  ok('W2c successor at full base health', s2.health === 100 && Game.maxHealth() === 100,
    `health=${s2.health} maxHealth=${Game.maxHealth()}`);
  ok('W2d daypart counters cleared', !s2.bloodPriceDayPart && !s2.bloodPriceUses,
    `dayPart=${s2.bloodPriceDayPart} uses=${s2.bloodPriceUses}`);

  // ============ W3. lootCorpse fungibility ============
  const sc = Game.state.scholar;
  sc.mx = 4; sc.my = 4;
  Game.map.px = Game.state.village.px ?? 4; Game.map.py = Game.state.village.py ?? 4;
  sc.inventory = [
    { plantId: 'meat_deer', name: 'Venison (cleaned)', foodKind: 'meat', foodState: 'cleaned', kcalEach: 200, units: 1, spoilDay: sc.day + 3, kg: 0.5 },
  ];
  const kcalBeforeLoot = sc.inventory.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0);
  Game.corpses().push({
    id: 'c-r3', kind: 'monster', node: { x: Game.map.px, y: Game.map.py },
    mx: 4, my: 4, dayDied: sc.day, items: [
      { plantId: 'meat_deer', name: 'Venison (cleaned)', foodKind: 'meat', foodState: 'cleaned', kcalEach: 50, units: 2, spoilDay: sc.day + 3, kg: 0.5 },
    ],
  });
  sc.health = 100;
  Game.lootCorpse('c-r3', true);
  const kcalAfterLoot = sc.inventory.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0);
  const stacks = sc.inventory.filter(i => i.plantId === 'meat_deer');
  ok('W3a looted meat did not merge into unlike stack', stacks.length === 2,
    `stacks=${stacks.length} (${stacks.map(x => x.units + 'x' + x.kcalEach).join(', ')})`);
  ok('W3b no value laundered', kcalAfterLoot === kcalBeforeLoot + 50,
    `before=${kcalBeforeLoot} after=${kcalAfterLoot} (takeAll takes 1 unit/stack; laundered would be +150)`);

  // ============ W4. kcalCap sibling sweep ============
  // W4a. field dressing
  sc.kcal = cap - 100;
  sc.inventory.push({ name: 'Deer (carcass)', foodKind: 'meat', foodState: 'carcass', hiddenKcal: 3000, units: 1, kg: 8 });
  const dress = globalThis.AbilityActionImpls['field_dressing.dress_game'];
  const dressOk = dress(Game, null);
  ok('W4a field dressing fires', dressOk === true);
  ok('W4b field dressing respects bank cap', sc.kcal === cap, `kcal=${sc.kcal} cap=${cap} (unclamped would be ${cap - 100 + 3000})`);
  // W4c. villageMeal (home) respects cap
  sc.kcal = cap - 100;
  const v = Game.state.village;
  v.trust = v.trust || {}; v.trust[Game.villagerId] = 70; // full share 2200
  v.pantry = [{ name: 'Foraged food', kcalEach: 200, units: 40, spoilDay: sc.day + 3, safe: true, kg: 0.2 }];
  // ensure at haven tile for pantryInReach
  const tile = Game.playerTile();
  const tileWas = tile && tile.type;
  if (tile) tile.type = 'haven';
  v.lastPlayerMeal = 0;
  Game.villageMeal();
  ok('W4c village meal respects bank cap', sc.kcal <= cap, `kcal=${sc.kcal} cap=${cap} (3000-literal would overfill)`);
  if (tile) tile.type = tileWas;
  // W4d. driftTick respects cap
  sc.drifting = true; sc.exiled = true;
  let overCap = false, sawGain = false;
  const kcalPreDrift = sc.kcal;
  for (let i = 0; i < 40 && !sawGain; i++) {
    const before = sc.kcal;
    Game.driftTick();
    if (sc.kcal > before) sawGain = true;
    if (sc.kcal > cap) overCap = true;
  }
  sc.drifting = false; sc.exiled = false;
  ok('W4d driftTick never exceeds bank cap', !overCap && sawGain, `sawGain=${sawGain} overCap=${overCap}`);
  // W4e. contest kcal effect respects cap
  sc.kcal = cap - 100;
  Game.state.activeContest = {
    contestId: 'r3test', phase: 0, phaseIdx: 0,
    phases: [{ choices: [{ label: 'Feast', do: { kcal: 5000 }, next: 'LOSE' }] }],
  };
  try { Game.contestChoose(0); } catch (e) { console.log('  (contestChoose threw: ' + e.message + ')'); }
  Game.state.activeContest = null;
  ok('W4e contest kcal prize respects bank cap', sc.kcal <= cap, `kcal=${sc.kcal} cap=${cap}`);
  // W4f. bet payout respects cap (villager wins, player bet on them)
  sc.kcal = cap - 100;
  const vid = (Game.state.village.roster || []).find(id => id !== Game.villagerId);
  const realCRG = Game.contestResolveGroup;
  Game.contestResolveGroup = () => ({ [vid]: { outcome: 'won', log: [] } });
  try {
    Game._contestVerdict({ contestId: 'r3test', participants: [vid], bet: { amount: 500 }, cheer: 0 });
  } catch (e) { console.log('  (_contestVerdict threw: ' + e.message + ')'); }
  Game.contestResolveGroup = realCRG;
  ok('W4f bet payout respects bank cap', sc.kcal <= cap, `kcal=${sc.kcal} cap=${cap} (unclamped would be ${cap - 100 + 1000})`);

  // ============ W5. dead code ============
  ok('W5 fillWaterFromVillage is gone', typeof Game.fillWaterFromVillage === 'undefined',
    `typeof=${typeof Game.fillWaterFromVillage}`);

  // ============ W6. honestNet tracks real pantry outflow ============
  const vv = Game.state.village;
  vv.pantry = [{ name: 'Foraged food', kcalEach: 200, units: 100, spoilDay: sc.day + 3, safe: true, kg: 0.2 }];
  vv.burnHistory = [];
  const testVid = (vv.roster || []).find(id => id !== Game.villagerId);
  const person = Game.getPerson(testVid);
  const mr = Game.villagerMealDay(testVid, person, vv, { cookId: null });
  ok('W6a villagerMealDay reports pantry draw separately', typeof mr.drawn === 'number' && mr.drawn <= mr.ate,
    `drawn=${mr.drawn} ate=${mr.ate} (ownEat=${mr.ate - mr.drawn} never touched pantry)`);
  vv.pantry = [{ name: 'Foraged food', kcalEach: 200, units: 100, spoilDay: sc.day + 3, safe: true, kg: 0.2 }];
  vv.burnHistory = []; vv.lastPlayerMeal = 0;
  Game.villageEats();
  const hist = vv.burnHistory[vv.burnHistory.length - 1];
  const oldFormula = Math.max(0, vv.lastEat - vv.lastGive) + (vv.lastPlayerMeal || 0);
  ok('W6b burn clock no longer inflated by self-caught food', hist <= oldFormula,
    `burn=${hist} oldFormula=${oldFormula}`);
  ok('W6c burn clock non-negative', hist >= 0, `burn=${hist}`);

  console.log(`\n${pass} passed, ${fail} failed (seed=${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
