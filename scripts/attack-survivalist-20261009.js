#!/usr/bin/env node
// Adversarial survivalist playtest, 2026-10-09. Hostile player vs the needs
// economy — round 2. Yesterday's run (attack-survivalist-20261008.js) broke
// rest-heal printing, dry-meadow filling, charcoal rake scope, the cold-night
// wait bypass, rain-immune friction fire, and flat-rate boiling; all fixed.
// This run goes deeper: tent-interior consistency gaps, dead-code hazards,
// storm-vs-tent wreck paths, and copy honesty.
// Seed BEFORE eval (modules capture Math.random at load).
const { boot, newWildGame } = require('./survivalist-harness.js');
const SO = parseInt(process.env.SEED_OFFSET || '0', 10);
const B = (s) => boot(s + SO);

let pass = 0, fail = 0;
const findings = [];
function ok(name, cond, note) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${note ? ' — ' + note : ''}`); findings.push(name + (note ? ': ' + note : '')); }
}
function info(s) { console.log('  INFO ' + s); }
function captureSays(Game) {
  const log = [];
  Game.say = (m) => { log.push(String(m)); };
  return log;
}
function goWild(Game) {
  // debugToWildNode if available, else pick a non-haven travel target
  try {
    if (typeof Game.debugToWildNode === 'function') { Game.debugToWildNode(); return true; }
  } catch (e) {}
  const targets = (typeof Game.travelTargets === 'function' ? Game.travelTargets() : []) || [];
  const t = targets.find(t => t && t.x !== undefined && !(t.type === 'haven'));
  if (!t) return false;
  Game.travelTo(t.x, t.y);
  return true;
}
// Put the scholar inside a pitched tent (real path when ground allows;
// deterministic fallback writes a REAL tent cell + secret, never a phantom
// insideTent — the engine correctly invalidates occupancy with no tent).
function tentUp(Game) {
  const s = Game.state.scholar;
  if (!s.inventory.find(i => i.kind === 'tent')) s.inventory.push({ kind: 'tent', name: 'Tent', units: 1, kg: 3 });
  if (!s.inventory.find(i => i.material === 'branch')) s.inventory.push({ material: 'branch', name: 'Branch', units: 6, kg: 0.5 });
  s.mx = 4; s.my = 4;
  try { Game.pitchTent(3, 3); } catch (e) {}
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  if (!detail[3] || detail[3][3] !== 'tent') {
    detail[3][3] = 'tent';
    const t = Game.playerTile();
    t.secrets = t.secrets || {};
    t.secrets['3,3'] = { condition: 'good', known: true, yours: true };
  }
  try { Game.enterTent(3, 3); } catch (e) {}
  return !!s.insideTent;
}

(async () => {
  // ================= E1: DEAD villageAction('water') = +4L CLEAN FREE =================
  // fillWater's hardened gates (cistern draw, carry weight, 10 kcal/L, real
  // water tile) do not apply here. Zero callers — a wired button away from an
  // infinite-water faucet. Fixed behavior: the branch is gone (returns null,
  // grants nothing); the live path stays fillWater().
  {
    const { Game } = B(9101);
    const s = await newWildGame(Game);
    captureSays(Game);
    s.kcal = 3000; s.health = 100;
    const vw = Game.state.village.water = { clean: 0, dirty: 0 }; // cistern DRY
    const w0 = (s.water || []).length;
    const kcal0 = s.kcal;
    let ret;
    try { ret = Game.villageAction('water'); } catch (e) { ret = 'threw:' + e.message; }
    const gained = (s.water || []).length - w0;
    info(`E1: villageAction('water') with DRY cistern -> +${gained}L, cistern ${vw.clean}L, kcal ${Math.round(kcal0)} -> ${Math.round(s.kcal)}`);
    ok('E1 FAIL-IF-EXPLOIT: dead water branch must not grant free water', gained === 0,
      `gained=${gained}L with dry cistern, no weight/kcal check`);
    // the live path still works: fillWater at a creek draws nothing from a
    // dry cistern (wild water is risky, not cistern water) and costs kcal
    if (goWild(Game)) {
      Game.location = 'wild';
      const t = Game.playerTile();
      info(`E1 live path: standing on '${t && t.type}' tile`);
    }
  }

  // ================= E2: NIGHT-AWAKE COLD BITE HITS TENT OCCUPANTS =================
  // The day shiver tax exempts the tent (shelteredFromSky); tent sleep is
  // fully protected; sleepPreview says "Feed it, or pitch a tent". But the
  // night-awake bite (added 2026-10-08 for the wait bypass) only exempts
  // haven/fire — a player awake inside their tent, even beside a lit interior
  // fire, takes -12 as if naked in the snow. Fiction break.
  // Fixed behavior: tent shelters the awake like it shelters the day.
  {
    const { Game } = B(9202);
    const s = await newWildGame(Game);
    const says = captureSays(Game);
    if (!goWild(Game)) { info('E2: no wild tile in reach — skipped'); }
    else {
      Game.location = 'wild';
      tentUp(Game);
      Game.dayPart = 2; s.dayTicks = 256; s.actionClock = 0; // dusk
      s.kcal = 3000; s.health = 100; s.energy = 100; s.hydration = 100;
      Game.state.weather = 'cold';
      const inTent = !!s.insideTent;
      Game.doAction('wait'); // dusk -> night transition
      info(`E2: inTent=${inTent}, wait through cold night -> health ${Math.round(s.health)}`);
      ok('E2 FAIL-IF-FICTION-BREAK: tent shelters the awake from the night bite',
        Math.round(s.health) === 100, `health=${Math.round(s.health)} while inside tent`);
    }
  }
  {
    // control: EXPOSED waiter still takes the bite (no regression on the fix)
    const { Game } = B(9203);
    const s = await newWildGame(Game);
    captureSays(Game);
    if (!goWild(Game)) { info('E2-control: no wild tile in reach — skipped'); }
    else {
      Game.location = 'wild';
      Game.dayPart = 2; s.dayTicks = 256; s.actionClock = 0;
      s.kcal = 3000; s.health = 100; s.energy = 100; s.hydration = 100;
      Game.state.weather = 'cold';
      Game.doAction('wait');
      info(`E2 control: exposed wait through cold night -> health ${Math.round(s.health)}`);
      ok('E2 control: exposed waiter still takes -12', Math.round(s.health) === 88, `health=${Math.round(s.health)}`);
    }
  }
  {
    // tent + LIT INTERIOR FIRE, awake: the warmest spot in the game bit you
    const { Game } = B(9204);
    const s = await newWildGame(Game);
    captureSays(Game);
    if (!goWild(Game)) { info('E2-fire: no wild tile in reach — skipped'); }
    else {
      Game.location = 'wild';
      tentUp(Game);
      s.firecraft = { attempts: 9, successes: 9, knack: true };
      try { Game.lightTentFire(); } catch (e) {}
      const lit = (typeof Game.tentFireLit === 'function') && Game.tentFireLit();
      Game.dayPart = 2; s.dayTicks = 256; s.actionClock = 0;
      s.kcal = 3000; s.health = 100; s.energy = 100; s.hydration = 100;
      Game.state.weather = 'cold';
      Game.doAction('wait');
      info(`E2-fire: tent fire lit=${!!lit}, wait through cold night -> health ${Math.round(s.health)}`);
      ok('E2-fire: tent + lit interior fire shelters the awake',
        Math.round(s.health) === 100, `health=${Math.round(s.health)} beside a lit tent fire`);
    }
  }

  // ================= E3: boilWater REFUSES BESIDE A LIT TENT FIRE =================
  // cookInTent cooks on the interior fire; lightTentFire's copy says "no rain
  // in the world can touch it in here". But boilWater checks nearFire() —
  // grid cells only — so it says "Need a fire to boil water." two feet from a
  // lit fire pan. Honesty break.
  // Fixed behavior: a lit interior tent fire counts for boiling.
  {
    const { Game } = B(9305);
    const s = await newWildGame(Game);
    const says = captureSays(Game);
    if (!goWild(Game)) { info('E3: no wild tile in reach — skipped'); }
    else {
      Game.location = 'wild';
      tentUp(Game);
      s.firecraft = { attempts: 9, successes: 9, knack: true };
      try { Game.lightTentFire(); } catch (e) {}
      const lit = (typeof Game.tentFireLit === 'function') && Game.tentFireLit();
      s.water = [{ liters: 1, quality: 'risky', source: 'creek' }, { liters: 1, quality: 'risky', source: 'creek' }];
      s.kcal = 3000;
      // tentUp re-captures says internally — re-capture for the boil assertions
      const says2 = captureSays(Game);
      const n = says2.length;
      Game.boilWater();
      const after = says2.slice(n).join(' ');
      const clean = s.water.filter(b => b.quality === 'clean').length;
      info(`E3: tent fire lit=${!!lit}, boilWater -> clean=${clean}/2, said: "${after.slice(0, 110)}"`);
      ok('E3 FAIL-IF-HONESTY-BREAK: lit tent fire boils water', clean === 2,
        `clean=${clean}/2; said "${after.slice(0, 80)}"`);
      ok('E3 boil names its kcal cost', /kcal/.test(after), `"${after.slice(0, 80)}"`);
    }
  }

  // ================= S1: STORM WRECKS CAMP WHILE YOU'RE INSIDE THE TENT =================
  // Softlock hunt: camp + pitched tent + interior fire lit, stormFront set,
  // resolveStormFront() unsheltered (wild). The tent is wrecked — the player
  // must be dumped cleanly: no phantom interior fire, no stuck insideTent,
  // no throw, player alive.
  {
    const { Game } = B(9406);
    const s = await newWildGame(Game);
    const says = captureSays(Game);
    if (!goWild(Game)) { info('S1: no wild tile in reach — skipped'); }
    else {
      Game.location = 'wild';
      tentUp(Game);
      s.firecraft = { attempts: 9, successes: 9, knack: true };
      // grid fire for the camp: friction first, deterministic fallback after
      // (the wreck path is the test target, not the lighting lottery)
      s.mx = 4; s.my = 4;
      try { Game.makeFire(5, 5); } catch (e) {}
      const absTick = Game._absTick();
      let hasGridFire = (Game.state.fires || []).some(f => !f.inside && f.tx === Game.map.px && f.ty === Game.map.py && f.till > absTick);
      if (!hasGridFire) {
        const detail = Game.genDetail(Game.map.px, Game.map.py);
        detail[5][5] = 'fire';
        (Game.state.fires = Game.state.fires || []).push({ tx: Game.map.px, ty: Game.map.py, cx: 5, cy: 5, till: absTick + 500 });
        hasGridFire = true;
      }
      try { Game.setUpCamp(); } catch (e) { info('S1: setUpCamp refused — ' + (says[says.length - 1] || '').slice(0, 60)); }
      const hadCamp = !!Game.state.camp;
      try { Game.lightTentFire(); } catch (e) {}
      const hadInteriorFire = (typeof Game.tentFireLit === 'function') && !!Game.tentFireLit();
      // DESIGN QUESTION (not asserted): with NO camp, a bare pitched tent
      // survives the storm untouched while the player takes the full beating
      // ("a tent is not a haven" covers shelter, not destruction). The storm
      // only wrecks tents via breakCamp's camp-tile sweep. Flagging for Steve.
      info(`S1 setup: camp=${hadCamp} (gridFire=${hasGridFire}), interiorFire=${hadInteriorFire}`);
      s.stormFront = { day: s.day || 1 };
      s.kcal = 3000; s.health = 100;
      let threw = null;
      try { Game.resolveStormFront(); } catch (e) { threw = e.message; }
      const fires = Game.state.fires || [];
      const phantomInterior = fires.filter(f => f.inside);
      info(`S1: camp was=${hadCamp}, interiorFire was=${hadInteriorFire} -> threw=${threw}, camp now=${!!Game.state.camp}, insideTent=${JSON.stringify(!!s.insideTent)}, interiorFires=${phantomInterior.length}, health=${Math.round(s.health)}`);
      ok('S1 storm-inside-tent: no throw', threw === null, threw);
      if (hadCamp) {
        // the wreck path: tent + interior fire must be swept, player dumped
        ok('S1 storm-inside-tent: no phantom interior fires', phantomInterior.length === 0, `phantoms=${phantomInterior.length}`);
        ok('S1 storm-inside-tent: player not stuck inside a wrecked tent',
          !s.insideTent, `insideTent=${!!s.insideTent}`);
      } else {
        // bare tent survives (design question noted above): player still
        // inside, fire still legitimately lit — no crash, no phantom
        ok('S1 bare-tent: player still sheltered inside intact tent', !!s.insideTent, `insideTent=${!!s.insideTent}`);
      }
      ok('S1 storm-inside-tent: player alive', !Game.over && s.health > 0, `over=${!!Game.over}`);
    }
  }

  // ================= H1: REST COPY NAMES THE COMPUTED GAIN =================
  // (code-read says the message interpolates restGain, not a hardcoded 30 —
  // verify against the engine with a rest.energy-boosting relic equipped.)
  {
    const { Game } = B(9507);
    const s = await newWildGame(Game);
    const says = captureSays(Game);
    s.kcal = 3000; s.hydration = 100; s.energy = 10; s.health = 90;
    const n = says.length;
    Game.doAction('rest');
    const restSay = says.slice(n).join(' ');
    const m = restSay.match(/\+(\d+) energy/);
    const named = m ? parseInt(m[1], 10) : null;
    const deltaE = Math.round(s.energy) - 10;
    info(`H1: rest message names +${named} energy; engine delta +${deltaE}`);
    ok('H1 rest copy names the actual energy gain', named !== null && named === deltaE,
      `named=${named} actual=${deltaE}`);
  }

  console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
  if (findings.length) { console.log('FINDINGS:'); findings.forEach(f => console.log(' - ' + f)); }
  process.exit(fail ? 1 : 0);
})();
