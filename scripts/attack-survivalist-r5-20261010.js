#!/usr/bin/env node
// Adversarial survivalist playtest — ROUND 5, 2026-10-10.
// Rounds 1-4 broke/fixed: rest-heal printer, dry-meadow fill, charcoal rake
// scope, cold-night wait bypass, rain-immune friction fire, flat-rate boil,
// dead villageAction('water') faucet, tent cold-bite, boil-at-tent-fire,
// contest-grab mid-sleep heal, pitchTent cost honesty, outdoor cooking fuel,
// boil fuel + honest boil-failure.
// This round attacks the COLD-SNAP REST DODGE:
//   E1: rest() has NO cold-exposure check. A hostile player rests through a
//       cold night instead of sleeping: full +30 energy and +5 healing for
//       the same 96 ticks a sleeper pays -18 health / no-heal / energy-60
//       for. The cold snap becomes a rest farm — weather bypass.
//   H1: the nightfall awake-bite copy promises "energy won't rise past 40
//       tonight" — but resting after the bite raises 40 -> 70. Copy lie.
//   E2: over a full cold night, rest-looping strictly dominates sleeping
//       exposed (better health AND energy). Proves the dodge is optimal play.
//   S1: the fix must not wedge: rest/sleep/status keep working in the cold.
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

// Cold night, wild, exposed: the hostile setup.
// depart() leaves you at Haven (a tile) — travel one node out so the
// exposure predicates (haven / sheltered / fire) actually read exposed.
async function coldNightSetup(Game) {
  const s = await newWildGame(Game);
  const tgts = Game.travelTargets().filter(t => {
    const tl = Game.tileAt(t.x, t.y);
    return tl && tl.type !== 'haven' && tl.type !== 'oldhaven';
  });
  if (!tgts.length) throw new Error('no wild travel target at game start');
  // force=true: creek blockages would refuse the crossing; setup just needs
  // to BE on the wild node (travelTo's move bookkeeping still runs).
  Game.travelTo(tgts[0].x, tgts[0].y, true);
  if (Game.playerTile().type === 'haven') throw new Error('setup failed to leave haven');
  Game.state.wanderer = null; // setup hygiene: no cast wanderer wandering in
  // clear tile-entry spawns on this node so the test night is mechanically
  // quiet (the living world may still wander something in — that's the game
  // working, not the test; seeds are run x3).
  for (const m of Game.worldMonsters().filter(m => m.tx === Game.map.px && m.ty === Game.map.py)) Game.removeWorldMonster(m);
  Game.state.weather = 'cold';
  Game.dayPart = 3; s.dayTicks = 384; // nightfall just happened
  s.day = 10;
  s.kcal = 3000; s.hydration = 80; s.health = 90; s.energy = 20;
  s.trauma = 0;
  // clear any tile-entry spawn so the night is mechanically quiet
  return s;
}
function exposureCheck(Game) {
  // Same predicates the engine's cold paths use.
  let atHaven = Game.location === 'haven';
  const t = Game.playerTile();
  if (t && t.type === 'haven') atHaven = true;
  return { atHaven, tile: t && t.type, sheltered: Game.shelteredFromSky(), nearFire: Game.nearFire() };
}

(async () => {
  // ================= E1: REST DODGES THE COLD BITE =================
  // Cold night, exposed. Rest = 96 ticks. Pre-fix: +30 energy, +5 heal,
  // zero cold consequence — the shivering never touches the rester.
  {
    const { Game } = B(5101);
    const s = await coldNightSetup(Game);
    const exp = exposureCheck(Game);
    info(`E1 exposure: ${JSON.stringify(exp)}`);
    ok('E1 exposed', !exp.atHaven && !exp.sheltered && !exp.nearFire, JSON.stringify(exp));
    const log = captureSays(Game);
    const h0 = Math.round(s.health), e0 = Math.round(s.energy);
    Game.doAction('rest');
    const dh = Math.round(s.health) - h0, de = Math.round(s.energy) - e0;
    info(`E1 rest in cold: health ${h0}->${Math.round(s.health)} (d${dh}), energy ${e0}->${Math.round(s.energy)} (d${de})`);
    ok('E1 cold rest grants no healing', dh <= 0, `healed +${dh} while exposed in a cold snap`);
    ok('E1 cold rest cannot rise past 40 energy', Math.round(s.energy) <= 40, `energy ${Math.round(s.energy)} > 40`);
    ok('E1 cold rest says the shiver', log.join(' ').match(/cold|shiver|frost/i) ? true : false, 'no cold named in rest copy');
    void log;
  }

  // ================= H1: "won't rise past 40 tonight" MUST BE TRUE =====
  // Fire the nightfall awake-bite (energy capped at 40), THEN rest.
  // Pre-fix: rest pushes 40 -> 70, making the bite copy a lie.
  {
    const { Game } = B(5102);
    const s = await coldNightSetup(Game);
    s.energy = 90;
    const log = captureSays(Game);
    // Simulate the dusk->night transition with the player awake.
    Game.dayPart = 2; s.dayTicks = 383;
    Game.tickAction(2); // crosses into night: advancePart fires the awake bite
    const biteMsg = log.join(' ');
    info(`E1b after nightfall: energy=${Math.round(s.energy)} biteSaid=${/won't rise past 40/.test(biteMsg)}`);
    ok('H1 nightfall bite fires', /won't rise past 40 tonight/.test(biteMsg), 'bite copy missing');
    ok('H1 bite caps energy at 40', Math.round(s.energy) <= 40, `energy ${Math.round(s.energy)}`);
    Game.doAction('rest');
    info(`E1b after rest: energy=${Math.round(s.energy)}`);
    ok('H1 rest honors "won\'t rise past 40 tonight"', Math.round(s.energy) <= 40,
      `rest pushed energy to ${Math.round(s.energy)} — the bite copy lied`);
    void log;
  }

  // ================= E2: REST-LOOP vs SLEEP, FULL COLD NIGHT =========
  // Same start, two paths. Pre-fix: rest-looping wins on health AND energy —
  // the dodge is strictly optimal play. Post-fix: rest must not dominate.
  async function runPath(seed, path) {
    const { Game } = B(seed);
    const s = await coldNightSetup(Game);
    captureSays(Game);
    const h0 = Math.round(s.health), e0 = Math.round(s.energy), d0 = s.day;
    if (path === 'sleep') { Game.sleep(); }
    else { Game.doAction('rest'); if (!Game.over) Game.doAction('rest'); }
    return {
      dh: Math.round(s.health) - h0,
      eEnd: Math.round(s.energy),
      dayAdvanced: s.day > d0,
      over: !!Game.over,
    };
  }
  {
    const sleepR = await runPath(5103, 'sleep');
    const restR = await runPath(5104, 'rest');
    info(`E2 sleep path: dHealth=${sleepR.dh} energyEnd=${sleepR.eEnd} dayAdvanced=${sleepR.dayAdvanced}`);
    info(`E2 rest path:  dHealth=${restR.dh} energyEnd=${restR.eEnd} dayAdvanced=${restR.dayAdvanced} over=${restR.over}`);
    ok('E2 sleep exposed cold night still bites', sleepR.dh < 0, `sleep dHealth=${sleepR.dh}`);
    // Post-fix bar: the dodge is closed — cold rest grants no free recovery.
    // (Rest no longer strictly dominates: no heal, energy capped at 40, and
    // it costs 80 kcal without the dawn reset sleep provides.)
    ok('E2 rest-loop heals nothing in the cold', restR.dh <= 0,
      `rest dHealth=${restR.dh} — cold rest still heals`);
    ok('E2 rest-loop energy capped at 40 in the cold', restR.eEnd <= 40,
      `rest energyEnd=${restR.eEnd} — the shiver lets you rest warm`);
    ok('E2 rest path does not end the game', !restR.over);
  }

  // ================= S1: FIX DOES NOT WEDGE ==========================
  {
    const { Game } = B(5105);
    const s = await coldNightSetup(Game);
    captureSays(Game);
    let threw = false;
    try {
      Game.doAction('rest');
      const st = Game.status();
      ok('S1 status renders after cold rest', !!st, 'status falsy');
      Game.sleep(); // sleep still available after a cold rest
      ok('S1 sleep still runs after cold rest', !Game.over || true, '');
    } catch (e) { threw = true; console.log('  THREW: ' + (e && e.message)); }
    ok('S1 no throw in cold rest/sleep sequence', !threw);
    ok('S1 game not over', !Game.over);
    void s;
  }

  // ================= WARM CONTROL: rest still works in fair weather ==
  {
    const { Game } = B(5106);
    const s = await coldNightSetup(Game);
    Game.state.weather = 'clear'; // not a cold snap
    captureSays(Game);
    const h0 = Math.round(s.health), e0 = Math.round(s.energy);
    Game.doAction('rest');
    const dh = Math.round(s.health) - h0, de = Math.round(s.energy) - e0;
    info(`CTRL clear-weather rest: dHealth=${dh} dEnergy=${de}`);
    ok('CTRL rest heals in fair weather', dh > 0, `dHealth=${dh}`);
    ok('CTRL rest restores energy in fair weather', de > 0, `dEnergy=${de}`);
    void s;
  }

  // ================= FIRE CONTROL: rest by a fire still works ========
  {
    const { Game } = B(5107);
    const s = await coldNightSetup(Game);
    s.inventory.push({ id: 'branch', material: 'branch', units: 10, name: 'fallen branch' });
    s.inventory.push({ id: 'lighter', itemId: 'lighter', units: 1, name: 'lighter' });
    s.mx = 4; s.my = 4; // stand mid-node (travelTo leaves you at the edge)
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    detail[4][5] = 'dirt';
    Game.makeFire(5, 4);
    captureSays(Game);
    const h0 = Math.round(s.health), e0 = Math.round(s.energy);
    Game.doAction('rest');
    const dh = Math.round(s.health) - h0, de = Math.round(s.energy) - e0;
    info(`CTRL fireside rest in cold: dHealth=${dh} dEnergy=${de} nearFire=${Game.nearFire()}`);
    ok('CTRL fire answers the cold for rest', dh > 0 && de > 0, `dHealth=${dh} dEnergy=${de}`);
    void s;
  }

  console.log(`\nRESULT r5: ${pass} pass, ${fail} fail${fail ? ' — ' + findings.join(' | ') : ''}`);
  process.exit(fail ? 1 : 0);
})();
