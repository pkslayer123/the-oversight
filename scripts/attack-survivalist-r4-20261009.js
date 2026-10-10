#!/usr/bin/env node
// Adversarial survivalist playtest — ROUND 4, 2026-10-09.
// Rounds 1-3 broke/fixed: rest-heal printer, dry-meadow fill, charcoal rake
// scope, cold-night wait bypass, rain-immune friction fire, flat-rate boil,
// dead villageAction('water') faucet, tent cold-bite, boil-at-tent-fire,
// contest-grab mid-sleep heal, pitchTent cost honesty.
// This round attacks the FIRE-FUEL economy behind cooking and boiling:
//   E1: outdoor player fires never burn fuel when cooking (consumeCookFire's
//       f.burn0 filter only matches tent fires — makeFire never sets burn0),
//       so the "cooking is one fire session" fiction and the mid-cook death
//       downgrade are dead code outdoors.
//   E2: boilWater never calls consumeCookFire at all — a 32-tick boil burns
//       zero fuel, and a fire that dies under the pot still "boils" the water.
//   S1: the new boil-failure branch must not wedge the game.
//   H1: the boil copy ("tending the fire") must be true — fuel must move.
// Seed BEFORE eval (modules capture Math.random). Run x3 seed offsets.
const { boot, newWildGame } = require('./survivalist-harness.js');
const SO = parseInt(process.env.SEED_OFFSET || '0', 10);
const B = (s) => boot(s + SO);

let pass = 0, fail = 0;
const findings = [];
function ok(name, cond, note) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${note ? ' — ' + note : ''}`); findings.push(name + (note ? ': ' + note : '')); }
}
function captureSays(Game) {
  const log = [];
  Game.say = (m) => { log.push(String(m)); };
  Game.sysSay = (m) => { log.push('SYS:' + String(m)); };
  return log;
}
function info(s) { console.log('  INFO ' + s); }

async function wildSetup(Game) {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = 10; Game.dayPart = 1; s.dayTicks = 10;
  s.kcal = 3000; s.hydration = 50; s.health = 90; s.energy = 80;
  s.inventory.push({ id: 'branch', material: 'branch', units: 10, name: 'fallen branch' });
  s.inventory.push({ id: 'lighter', itemId: 'lighter', units: 1, name: 'lighter' });
  const px = Game.map.px, py = Game.map.py;
  const detail = Game.genDetail(px, py);
  detail[4][5] = 'dirt';
  Game.makeFire(5, 4); // lighter: autoFire, always catches
  const f = (Game.state.fires || []).find(f => f.tx === px && f.ty === py && !f.inside);
  return { s, f, px, py };
}
function setFireRem(Game, f, rem) { f.till = Game._absTick() + rem; }
function fireRem(Game, f) { return f.till - Game._absTick(); }
function findFire(Game) {
  return (Game.state.fires || []).find(f => f.tx === Game.map.px && f.ty === Game.map.py && !f.inside);
}
function addRawMeat(Game) {
  Game.state.scholar.inventory.push({ name: 'venison haunch', rawKcal: 800, units: 1, needsCooking: false });
  return Game.state.scholar.inventory.length - 1;
}
function cookedKcalFromLog(log) {
  const m = log.map(String).find(l => l.startsWith('Cooked venison haunch:'));
  if (!m) return null;
  const mm = m.match(/→\s*(\d+)\s*kcal/);
  return mm ? parseInt(mm[1], 10) : null;
}

(async () => {
  // ================= E1a: COOKING BURNS FIRE FUEL (outdoors) =================
  // Fire with 200 ticks of fuel. cookFood = 32 ticks of tending; the fuel
  // session should burn 32 extra ticks of fire beyond the wall clock (64
  // total). Pre-fix: the burn0 filter makes consumeCookFire a no-op — the
  // fire pays only the 32 wall-clock ticks. Break = free fire sessions.
  {
    const { Game } = B(4101);
    await wildSetup(Game);
    let f = findFire(Game);
    ok('E1a fire lit', !!f);
    const log = captureSays(Game);
    setFireRem(Game, f, 200);
    const idx = addRawMeat(Game);
    Game.cookFood(idx);
    f = findFire(Game);
    const remAfter = f ? fireRem(Game, f) : -999;
    info(`E1a fire remaining after cook: ${remAfter} (expect ~136 post-fix: 200-32 fuel -32 wall; 168 = no fuel burn)`);
    ok('E1a cooking burns 32 ticks of fire fuel', remAfter <= 140,
      `remaining ${remAfter}, fuel burn missing`);
    void log;
  }

  // ================= E1b: DYING FIRE DOWNGRADED COOK =================
  // Same seed, healthy fire (200) vs dying fire (20). The dying fire should
  // cook strictly worse (downgrade one outcome step — the fiction the code
  // comments promise). Pre-fix: identical yields — a guttering fire cooks
  // as well as a roaring one.
  {
    const runs = [];
    for (const [tag, rem] of [['healthy', 200], ['dying', 20]]) {
      const { Game } = B(4102);
      await wildSetup(Game);
      const log = captureSays(Game);
      const f = findFire(Game);
      setFireRem(Game, f, rem);
      const idx = addRawMeat(Game);
      // Pin the outcome roll: 'decent' downgrades visibly to 'undercooked'
      // (a rolled 'burnt' can't downgrade further and would hide the signal).
      Game.cookOutcome = () => ({ key: 'decent', mult: 0.8 });
      Game.cookFood(idx);
      runs.push({ tag, kcal: cookedKcalFromLog(log) });
    }
    info(`E1b yields healthy=${runs[0].kcal} dying=${runs[1].kcal} (post-fix: dying strictly worse)`);
    ok('E1b dying fire cooks worse than healthy fire',
      runs[0].kcal != null && runs[1].kcal != null && runs[1].kcal < runs[0].kcal,
      `healthy ${runs[0].kcal} vs dying ${runs[1].kcal}`);
  }

  // ================= E2a: BOIL ON A DYING FIRE =================
  // Fire with 20 ticks left, 3L risky water. The fire dies under the pot —
  // the batch must fail honestly, water stays risky. Pre-fix: 3L cleaned on
  // a fire that paid nothing and died mid-boil.
  {
    const { Game } = B(4103);
    await wildSetup(Game);
    const s = Game.state.scholar;
    s.water = [
      { liters: 1, quality: 'risky', source: 'creek' },
      { liters: 1, quality: 'risky', source: 'creek' },
      { liters: 1, quality: 'risky', source: 'creek' },
    ];
    const log = captureSays(Game);
    const f = findFire(Game);
    setFireRem(Game, f, 20);
    Game.boilWater();
    const clean = s.water.filter(b => b.quality === 'clean').length;
    const said = log.join(' | ');
    info(`E2a clean liters after boil on dying fire: ${clean} (post-fix: 0, honest failure)`);
    ok('E2a boil fails honestly when the fire dies under the pot', clean === 0,
      `${clean}L cleaned on a dead fire`);
    ok('E2a failure copy names the dead fire, never claims a boil',
      /died under the pot|never.*boil|still risky/i.test(said) && !/Boiled 3L/.test(said),
      said.slice(0, 160));
  }

  // ================= E2b: BOIL BURNS FIRE FUEL =================
  // Healthy fire (200), 3L risky. Post-fix the 32-tick boil burns 32 ticks
  // of fuel beyond the wall clock (remaining ~136). Pre-fix: 168.
  {
    const { Game } = B(4104);
    await wildSetup(Game);
    const s = Game.state.scholar;
    s.water = [
      { liters: 1, quality: 'risky', source: 'creek' },
      { liters: 1, quality: 'risky', source: 'creek' },
      { liters: 1, quality: 'risky', source: 'creek' },
    ];
    const log = captureSays(Game);
    const f = findFire(Game);
    setFireRem(Game, f, 200);
    Game.boilWater();
    const clean = s.water.filter(b => b.quality === 'clean').length;
    const f2 = findFire(Game);
    const remAfter = f2 ? fireRem(Game, f2) : -999;
    info(`E2b clean=${clean} fire remaining=${remAfter} (post-fix: 3 clean, ~136 remaining)`);
    ok('E2b healthy-fire boil still purifies', clean === 3, `${clean}L clean`);
    ok('E2b boil burns 32 ticks of fire fuel', remAfter <= 140,
      `remaining ${remAfter}, fuel burn missing`);
    void log;
  }

  // ================= S1: BOIL-FAILURE BRANCH DOESN'T WEDGE =================
  // After the honest boil failure: no throw, game not over, status renders,
  // feeding the dead fire is refused honestly, and a second boil with no
  // risky water is a clean no-op.
  {
    const { Game } = B(4105);
    await wildSetup(Game);
    const s = Game.state.scholar;
    s.water = [{ liters: 1, quality: 'risky', source: 'creek' }];
    const log = captureSays(Game);
    const f = findFire(Game);
    setFireRem(Game, f, 10);
    let threw = false;
    try {
      Game.boilWater();
      Game.feedFire(5, 4);
      Game.boilWater(); // nothing risky left... actually still risky (failed) — boil again on dead fire
    } catch (e) { threw = true; info('S1 threw: ' + (e && e.message)); }
    let statusOk = false;
    try { const st = Game.status(); statusOk = !!st; } catch (e) { info('S1 status threw'); }
    const said = log.join(' | ');
    ok('S1 boil-failure path never throws', !threw);
    ok('S1 game not over after failed boil', !Game.over);
    ok('S1 status renders after failed boil', statusOk);
    ok('S1 feeding the dead fire is refused honestly', /Nothing to feed there/.test(said),
      said.slice(-160));
  }

  // ================= H1: BOIL COPY EARNS "TENDING THE FIRE" =================
  // The success copy claims "32 ticks tending the fire" — post-fix the fire
  // actually pays 32 ticks of fuel, so the copy is true. (Folded into E2b's
  // fuel assertion; here we check the moss-boil path still names its work
  // and charges no fire.)
  {
    const { Game } = B(4106);
    await Game.init();
    Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    Game.depart();
    const s = Game.state.scholar;
    s.day = 10; Game.dayPart = 1; s.dayTicks = 10; s.kcal = 3000;
    // no fire anywhere: clear any map-placed fire cells so the moss path
    // (not the fire path) is genuinely taken.
    try {
      const d0 = Game.genDetail(Game.map.px, Game.map.py);
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (d0[y] && d0[y][x] === 'fire') d0[y][x] = 'dirt';
    } catch (e) {}
    // beard_moss: boil anywhere, no fire. Grant the ability directly.
    s.abilities = s.abilities || {};
    s.water = [{ liters: 1, quality: 'risky', source: 'creek' }];
    const log = captureSays(Game);
    // hasAbility('beard_moss') — force via data-less stub if needed
    const origHas = Game.hasAbility.bind(Game);
    Game.hasAbility = (id) => id === 'beard_moss' ? true : origHas(id);
    Game.boilWater();
    const clean = s.water.filter(b => b.quality === 'clean').length;
    const said = log.join(' | ');
    info(`H1 moss-boil clean=${clean} copy="${said.slice(0, 120)}"`);
    ok('H1 moss boil still purifies with no fire', clean === 1, `${clean}L clean`);
    ok('H1 moss-boil copy names the moss work, not a fire', /moss-tinder/.test(said) && !/tending the fire/.test(said),
      said.slice(0, 160));
  }

  console.log(`\n${pass} passed, ${fail} failed${fail ? ' — ' + findings.join('; ') : ''}`);
  process.exit(fail ? 1 : 0);
})();
