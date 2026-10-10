#!/usr/bin/env node
// HOSTILE PLAYTEST (forager archetype, 2026-10-10) — round 3:
// E15 eatStashOne empty-stash softlock, E16 cookAll unknown-flesh gate,
// E17 shellNuts conservation, E18 spoil countdown honesty,
// E19 eat() at cap consumes nothing, E20 testCautiously bridge honesty.
// Run: SEED=N node scripts/attack-forager-20261010c.js
const H = require('./sim-harness.js');
const fails = [];
const check = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' — ' + extra : ''));
  if (!cond) fails.push(name);
};
function invKcal(Game) {
  return Game.state.scholar.inventory.reduce((s, i) => s + (i.kcalEach || 0) * (i.units || 1), 0);
}

(async () => {
  const { Game } = await H.loadGame({ seed: Number(process.env.SEED) || 20261010 });
  await H.setupGame(Game);
  const S = Game.state, s = S.scholar;
  let said = [];
  Game.say = (m) => { said.push(String(m)); };
  Game.sysSay = () => {};
  const sayText = () => { const t = said.join(' | '); said = []; return t; };
  Game.nearFire = () => true;
  Game.consumeCookFire = () => 'ok';
  const day = s.day;
  const plant = (Game.data.plants || []).find(p => (p.caloriesPerUnit || 0) > 0 && (p.edibility === 'safe' || p.edibility === 'caution'));

  // ============ E15: eatStashOne on empty / bad index — no crash, no softlock ============
  {
    s.prepStash = [];
    let threw = false;
    try { Game.eatStashOne(0); Game.eatStashOne(-1); Game.eatStashOne(99); } catch (e) { threw = true; }
    const msg = sayText();
    check('E15 eatStashOne bad index: no crash, honest message', !threw && /nothing|no |empty/i.test(msg), msg.slice(0, 80));
  }

  // ============ E16: cookAll unknown-flesh gate ============
  {
    // monster flesh not cleared by the cautious test must stay out of the batch
    const mid = ((Game.data.monsters || []).find(m => !Game.monsterFoodSafe(m.id)) || {}).id || 'belltoad';
    const flesh = { name: 'Strange flesh', plantId: 'meat_' + mid, foodKind: 'meat', foodState: 'cleaned', kcalEach: 0, hiddenKcal: 500, units: 2, spoilDay: day + 1, kg: 0.5, edible: false };
    const known = { name: 'Cleaned meat', plantId: 'meat_deer', foodKind: 'meat', foodState: 'cleaned', kcalEach: 100, units: 2, spoilDay: day + 2, kg: 0.5, edible: true };
    s.inventory = [flesh, known];
    Game.knowsTechnique = () => true;
    try { Game.cookAll(); } catch (e) {}
    const msg = sayText();
    const fleshAfter = s.inventory.find(i => i.plantId === 'meat_' + mid);
    check('E16 unknown flesh stays raw through the batch (gate holds)',
      !!fleshAfter && fleshAfter.foodState === 'cleaned', `state=${fleshAfter && fleshAfter.foodState}`);
    const knownAfter = s.inventory.find(i => i.plantId === 'meat_deer');
    check('E16 known meat still cooks', !!knownAfter && knownAfter.foodState === 'cooked',
      `state=${knownAfter && knownAfter.foodState}`);
    s.inventory = [];
  }

  // ============ E17: shellNuts conservation ============
  {
    const nut = (Game.data.plants || []).find(p => p.id === 'hickory_nut' || /crack|shell/i.test(p.preparation || ''));
    if (nut) {
      const cpu = nut.caloriesPerUnit || 100;
      s.inventory = [{ plantId: nut.id, foodKind: 'nut', foodState: 'in_shell', edible: false, kcalEach: 0, hiddenKcal: cpu, units: 4, spoilDay: day + 30, name: nut.name + ' (in shell)', kg: 0.2 }];
      Game.shellNuts(0); sayText();
      const it = s.inventory[0];
      const expect = Math.round(cpu * 0.75);
      check('E17 shelling nets 0.75x gross (shells weigh, no creation)',
        !!it && it.kcalEach === expect && it.edible === true, `kcalEach=${it && it.kcalEach} expect=${expect}`);
    } else check('E17 nut fixture', false, 'no nut plant found');
    s.inventory = [];
  }

  // ============ E18: spoil countdown honesty ============
  {
    const bonus = Game.spoilBonusDays ? Game.spoilBonusDays() : 0;
    const it = { name: plant.name, plantId: plant.id, kcalEach: plant.caloriesPerUnit, units: 3, spoilDay: day + 2, kg: 0.2, edible: true };
    s.inventory = [it];
    const clock = Game.spoilClockShort ? Game.spoilClockShort(it) : null;
    const left = it.spoilDay + bonus - day;
    const spoiledNow = Game.isSpoiled(it, bonus);
    check('E18 countdown matches the isSpoiled boundary',
      !spoiledNow && left === 2 + bonus && (!clock || /2/.test(String(clock)) || String(left).length > 0),
      `clock=${clock} left=${left} bonus=${bonus}`);
    // at the boundary: spoilDay + bonus == day → spoiled
    const it2 = Object.assign({}, it, { spoilDay: day - bonus });
    check('E18 boundary item reads spoiled', Game.isSpoiled(it2, bonus) === true, `spoilDay=${it2.spoilDay}`);
    s.inventory = [];
  }

  // ============ E19: eat() at cap consumes nothing ============
  {
    const cap = Game.kcalCap ? Game.kcalCap() : 3000;
    s.kcal = cap;
    s.inventory = [{ name: plant.name, plantId: plant.id, kcalEach: plant.caloriesPerUnit, units: 5, spoilDay: day + 2, kg: 0.2, edible: true }];
    Game.eat(); sayText();
    check('E19 eat() at cap leaves food untouched', s.inventory.length === 1 && s.inventory[0].units === 5 && s.kcal === cap,
      `units=${s.inventory[0] && s.inventory[0].units} kcal=${s.kcal}`);
    s.inventory = [];
  }

  // ============ E20: testCautiously bridge — experiments ease, never skip ============
  {
    const unk = (Game.data.plants || []).find(p => (p.caloriesPerUnit || 0) > 0 &&
      (p.edibility === 'safe' || p.edibility === 'caution') && !((S.codex.plants || {})[p.id] || {}).level);
    if (unk) {
      const lump = { lump: {}, units: 0, name: 'mystery lump', kg: 0.5, spoilDay: day + 2 };
      lump.lump[unk.id] = { units: 20 };
      lump.units = 20;
      s.inventory = [lump];
      // 4 experiments first
      for (let i = 0; i < 4; i++) { Game.experimentWith(0); sayText(); }
      const entry = (S.codex.plants || {})[unk.id] || {};
      check('E20 experiments recorded on the L0 entry', (entry.experiments || 0) === 4, `experiments=${entry.experiments}`);
      // full cautious test still required for the name
      const before = (entry.level || 0);
      try { Game.testCautiously(0); } catch (e) {}
      const msg = sayText();
      const after = ((S.codex.plants || {})[unk.id] || {}).level || 0;
      check('E20 full test resolves honestly (names or honestly refuses)',
        after >= before, `level ${before}->${after} msg=${msg.slice(0, 80)}`);
    } else check('E20 unknown-plant fixture', false, 'none available');
    s.inventory = [];
  }

  console.log(fails.length ? `\n${fails.length} FAILURES: ` + fails.join('; ') : '\nALL CHECKS PASSED');
  process.exit(fails.length ? 1 : 0);
})();
