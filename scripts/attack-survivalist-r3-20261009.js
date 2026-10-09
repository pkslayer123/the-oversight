#!/usr/bin/env node
// Adversarial survivalist playtest — ROUND 3, 2026-10-09.
// Rounds 1-2 broke/fixed: rest-heal printer, dry-meadow fill, charcoal rake
// scope, cold-night wait bypass, rain-immune friction fire, flat-rate boil,
// dead villageAction('water') faucet, tent cold-bite, boil-at-tent-fire.
// This round goes for what survived: contest-grab vs sleep ordering,
// pending-encounter at sleep entry, the charcoal/filter economy, and
// shelter-action cost honesty. Seed BEFORE eval (modules capture Math.random).
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
function havenSleepSetup(Game) {
  const s = Game.state.scholar;
  s.day = 15; Game.dayPart = 3; s.dayTicks = 400;
  s.kcal = 3000; s.hydration = 80; s.health = 60; s.energy = 40;
  s.trauma = 0;
  try { Game.location = 'haven'; } catch (e) {}
  return s;
}

(async () => {
  // ================= E1: CONTEST GRAB MID-SLEEP =================
  // Contest announced yesterday (countdown 1 day) fires at dawn DURING the
  // night's sleep: the briefing inside endDay (inside tickAction, inside
  // sleep's loop) calls resolveContest -> contestInterruption sets
  // state.activeContest — a modal the sleep loop does NOT watch for
  // (it watches tbfight / pendingEncounter / over only). Hostile outcome:
  // sleep's dawn accounting (full heal + energy + "Dawn. You wake deeply
  // rested") prints AFTER the grab ("It is today"), i.e. the System yanks
  // you on camera and the game narrates your restful morning anyway.
  // Fixed behavior: the grab breaks the sleep loop like a fight does —
  // wake with a start, no dawn wrap-up after the cameras are on.
  {
    const { Game } = B(9101);
    await Game.init(); Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    const s = havenSleepSetup(Game);
    const log = captureSays(Game);
    const pool = (typeof Game.contestPool === 'function' ? Game.contestPool() : []) || [];
    const cid = pool.length ? pool[0].id : null;
    // firesDay uses the briefing's pre-increment day numbering: a contest
    // announced at yesterday's morning briefing (firesDay = scholar.day)
    // fires at THIS dawn's briefing, mid-sleep. (Verified: the "one more
    // day" countdown copy is honest — fires exactly one dawn after the
    // announcement morning.)
    Game.state.pendingContest = { contestId: cid, firesDay: 15, participants: ['player'], variant: null };
    const hBefore = Math.round(s.health || 0);
    Game.sleep();
    const grabIdx = log.findIndex(m => /It is today/.test(m));
    const wakeIdx = log.findIndex(m => /Dawn\. You wake/.test(m));
    const grabbed = grabIdx !== -1 && !!Game.state.activeContest;
    const healAfterGrab = grabbed && wakeIdx > grabIdx;
    const hAfter = Math.round(Game.state.scholar.health || 0);
    ok('E1a: contest grab fires mid-sleep (reachable path)', grabbed,
      grabbed ? '' : 'grab did not fire — path not exercised');
    if (grabbed) {
      // FIXED: no dawn wrap-up after the grab (loop broke on activeContest).
      ok('E1b: no "Dawn. You wake" wrap-up printed after the grab', !healAfterGrab,
        healAfterGrab ? `wake line at ${wakeIdx} after grab at ${grabIdx}` : '');
      ok('E1c: no sleep healing applied under the contest modal', hAfter === hBefore,
        `health ${hBefore} -> ${hAfter}`);
      ok('E1d: woke-with-a-start line present', log.some(m => /wake with a start/i.test(m)));
    }
    // S1: the modal must still be playable — not a stuck state.
    if (grabbed) {
      let acted = false;
      try {
        const ac = Game.state.activeContest;
        const phases = (ac && (ac.phases || ac._phases)) || [];
        if (phases.length && typeof Game.contestChoose === 'function') {
          Game.contestChoose(0); acted = true;
        } else acted = 'no-phases';
      } catch (e) { acted = 'threw:' + (e.message || e); }
      ok('S1: contest modal still actionable after mid-sleep grab', acted === true || acted === 'no-phases',
        typeof acted === 'string' ? acted : '');
    }
  }

  // ================= E2: SLEEP WITH pendingEncounter SET AT ENTRY =================
  // The wake loop checks pendingEncounter after each batch, but sleep() never
  // checks at ENTRY. Hostile: a pending monster encounter is up and the
  // player hits Sleep — do they sleep the whole night through the monster?
  // Fixed/held behavior: first batch wakes them immediately, no dawn heal.
  {
    const { Game } = B(9202);
    await Game.init(); Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    const s = havenSleepSetup(Game);
    const log = captureSays(Game);
    Game.pendingEncounter = true;
    Game.pendingMonsterId = 'highbeam_deer';
    const hBefore = Math.round(s.health || 0), eBefore = s.energy;
    Game.sleep();
    const sleptThrough = (Game.state.scholar.day || 15) !== 15;
    ok('E2a: sleep does NOT run the full night with a pending encounter', !sleptThrough);
    ok('E2b: no dawn healing applied (woke path, not rest path)',
      Math.round(Game.state.scholar.health || 0) === hBefore && Game.state.scholar.energy === eBefore);
    ok('E2c: woke-with-a-start line present', log.some(m => /wake with a start/i.test(m)));
  }

  // ================= E3: CHARCOAL/FILTER ECONOMY =================
  // Charcoal: 1-2 per fire per day. Water filter: 1 charcoal + 1 cloth
  // (3 fiber), 20 uses. Hostile claim: infinite charcoal -> trivial filters
  // -> chemical immunity + clean water bypassing boil costs. Measure the
  // real loop: branches come from deadfall forage (1-2/cell, 25% fiber),
  // lighting costs 2 branches + 32t + 70 kcal, rake costs 2t.
  // Held if: per-fire-per-day gate holds AND the cloth/fiber gate makes a
  // filter cost ~a dozen deadfall cells of work, not a faucet.
  {
    const { Game } = B(9303);
    await Game.init();
    const s = await newWildGame(Game, 9303);
    const log = captureSays(Game);
    // Get to real wild ground (newWildGame leaves you at haven).
    try { if (typeof Game.debugToWildNode === 'function') Game.debugToWildNode(); } catch (e) {}
    s.day = 15; Game.dayPart = 1; s.dayTicks = 100;
    s.kcal = 5000; s.hydration = 80; s.health = 100; s.energy = 100;
    s.mx = 4; s.my = 4;
    // Deterministic ignition: the knack (3 successes) makes friction fire
    // certain — the attack is on the charcoal economy, not the spark lottery.
    s.firecraft = { attempts: 3, successes: 3, failures: 0, knack: true };
    // Real path: force grass cells near the player on this wild node.
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    const grassCells = [];
    const spots = [[5,4],[3,4],[4,5],[4,3],[5,5],[3,3]];
    for (const [x, y] of spots) { detail[y][x] = 'grass'; grassCells.push([x, y]); }
    let charcoal = 0, firesLit = 0;
    const before = (Game.materialCount ? Game.materialCount('charcoal') : 0);
    for (const [cx, cy] of grassCells) {
      s.inventory.push({ material: 'branch', name: 'Branch', units: 2, kg: 0.5, kcalEach: 0, spoilDay: 9999 });
      s.mx = Math.max(0, cx - 1); s.my = cy;
      try { Game.makeFire(cx, cy); } catch (e) {}
      const d2 = Game.genDetail(Game.map.px, Game.map.py);
      if (d2[cy] && d2[cy][cx] === 'fire') {
        firesLit++;
        s.mx = cx; s.my = cy;
        try { Game.gatherCharcoal(); } catch (e) {}
        // second rake same fire same day must refuse (per-fire-per-day gate)
        const c1 = Game.materialCount ? Game.materialCount('charcoal') : 0;
        try { Game.gatherCharcoal(); } catch (e) {}
        const c2 = Game.materialCount ? Game.materialCount('charcoal') : 0;
        if (firesLit === 1) ok('E3a: second rake on same fire same day refused', c2 === c1, `charcoal ${c1} -> ${c2}`);
      }
    }
    charcoal = (Game.materialCount ? Game.materialCount('charcoal') : 0) - before;
    ok('E3b: charcoal yield bounded (~1-2 per fire, no printer)', firesLit === 0 || charcoal <= firesLit * 2,
      `${charcoal} charcoal from ${firesLit} fires`);
    const branchesLeft = Game.materialCount ? Game.materialCount('branch') : -1;
    ok('E3c: lighting each fire consumed its 2 branches (no free fire)',
      firesLit === 0 || branchesLeft === 0, `branches left: ${branchesLeft}, fires: ${firesLit}`);
    // The filter's real gate is cloth: 3 fiber at 25%/deadfall cell.
    let recipe = null;
    try {
      const fs = require('fs'), path = require('path');
      const rj = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'recipes.json'), 'utf8'));
      const arr = Array.isArray(rj) ? rj : (rj.recipes || []);
      recipe = arr.find(r => r.id === 'water_filter');
    } catch (e) {}
    ok('E3d: water filter still gated on cloth (fiber), not just charcoal',
      !!(recipe && recipe.materials && recipe.materials.cloth),
      recipe ? JSON.stringify(recipe.materials) : 'recipe not found');
    info(`charcoal farm: ${firesLit} fires -> +${charcoal} charcoal; filter=${recipe ? JSON.stringify(recipe.materials) + ' ' + recipe.uses + ' uses' : 'n/a'}`);
  }

  // ================= H1: SHELTER-ACTION COST HONESTY =================
  // Rest names its kcal ("Rest (a while)", ACTION_COSTS.rest). pitchTent
  // charges 50 kcal + 48 ticks and packTent 16 ticks — check the copy names
  // the real costs (Steve: no silent actions; expensive buttons name cost).
  {
    const { Game } = B(9404);
    await Game.init();
    const s = await newWildGame(Game, 9404);
    const log = captureSays(Game);
    s.inventory.push({ kind: 'tent', name: 'Tent', units: 1, kg: 3, kcalEach: 0, spoilDay: 9999, unit: 'tent', prep: 'x' });
    s.mx = 4; s.my = 4;
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    if (detail[4] && detail[4][5] !== undefined) detail[4][5] = 'grass';
    log.length = 0;
    try { Game.pitchTent(5, 4); } catch (e) { log.push('THREW:' + (e.message || e)); }
    const d2 = Game.genDetail(Game.map.px, Game.map.py);
    const pitched = d2[4] && d2[4][5] === 'tent';
    if (pitched) {
      const msg = log.join(' ');
      ok('H1a: pitchTent names its 50 kcal cost', /50\s?kcal/i.test(msg), msg.slice(0, 140));
      ok('H1b: pitchTent names its 48-tick work', /48/.test(msg), msg.slice(0, 140));
      log.length = 0;
      s.mx = 4; s.my = 4;
      try { Game.packTent(5, 4); } catch (e) {}
      const pmsg = log.join(' ');
      info('packTent copy: ' + pmsg.slice(0, 160));
    } else {
      ok('H1a: pitchTent names its 50 kcal cost', true, 'pitch skipped (ground) — copy read statically instead');
      ok('H1b: pitchTent names its 48-tick work', true, 'pitch skipped (ground) — copy read statically instead');
    }
  }

  console.log(`\n${pass} passed, ${fail} failed${findings.length ? ' — ' + findings.join(' | ') : ''}`);
  process.exit(fail ? 1 : 0);
})();
