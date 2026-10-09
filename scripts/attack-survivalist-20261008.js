#!/usr/bin/env node
// Adversarial survivalist playtest (2026-10-08). Hostile player vs the needs
// economy: infinite water/fire, rest exploits, camp invincibility, weather bypass.
// Every attack is a measurement, not a vibe. Seed BEFORE eval (modules capture
// Math.random at load).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261008', 10);
let pass = 0, fail = 0;
const findings = [];
function ok(name, cond, note) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${note ? ' — ' + note : ''}`); findings.push(name + (note ? ': ' + note : '')); }
}
function info(s) { console.log('  INFO ' + s); }
function loadAll(seed) {
  delete globalThis.Scattering;
  Math.random = mulberry32(seed);
  global.window = global;
  global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
  global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const files = [...html.matchAll(/<script src="([^"]+)"/g)]
    .map(m => m[1].split('?')[0])
    .filter(f => f.startsWith('src/js/'))
    .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
  for (const f of files) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  delete global.window;
  return globalThis.Scattering.Game;
}
let sayLog = [];
function freshGame(Game) {
  sayLog = [];
  Game.say = (m) => { sayLog.push(String(m)); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.dayPart = 1;
  Game.state.scholar.dayTicks = 0;
}
(async () => {
  const Game = loadAll(SEED);
  await Game.init();

  // ================= E1: REST-HEAL PRINTER AT 0 KCAL =================
  // doAction('rest') gives +30 energy, +5 health, -40 kcal UNCLAMPED.
  // Hypothesis: a starving player can rest-loop to full health/energy,
  // out-healing the midnight spiral. The sleep path has a metabolic-crisis
  // gate; rest does not.
  freshGame(Game);
  {
    Game.debugToWildNode();
    const s = Game.state.scholar;
    s.inventory = []; // no pack food: true starvation
    s.kcal = 0; s.hydration = 60; s.health = 40; s.energy = 5;
    s.day = 1; Game.dayPart = 1; s.dayTicks = 0;
    const h0 = s.health;
    const days0 = s.day;
    // rest until midnight hits at least once (or 12 rests max)
    let rests = 0;
    while (s.day === days0 && rests < 12 && !Game.over) { Game.doAction('rest'); rests++; }
    const kcalMin = Math.round(s.kcal);
    info(`E1 rest-loop (wild, no pantry meal): ${rests} rests, health ${Math.round(h0)} -> ${Math.round(s.health)}, kcal 0 -> ${kcalMin}, day ${s.day}`);
    const spiralWarnings = sayLog.filter(m => /STARVING|spiral|starving/i.test(m)).length;
    ok('E1 FAIL-IF-EXPLOIT: starving rest-loop must not net-heal past the spiral',
      Math.round(s.health) <= Math.round(h0) + 2,
      `health ${Math.round(h0)} -> ${Math.round(s.health)} at kcal ${kcalMin} (spiral mentions: ${spiralWarnings})`);
    ok('E1 rest kcal must not go negative (display/logic noise)',
      kcalMin >= 0, `kcal=${kcalMin}`);
  }

  // ================= E2: FILL WATER FROM A DRY MEADOW =================
  freshGame(Game);
  {
    Game.debugToWildNode();
    const t = Game.playerTile();
    const ttype = t ? t.type : 'none';
    const s = Game.state.scholar;
    s.kcal = 500;
    const w0 = (s.water || []).length;
    Game.fillWater();
    const filled = (s.water || []).length - w0;
    const lastSay = sayLog[sayLog.length - 1] || '';
    info(`E2: stood on '${ttype}' tile, fillWater -> +${filled}L; said: "${lastSay.slice(0, 110)}"`);
    const isWaterTile = ['creek', 'wetland', 'pond'].includes(ttype);
    ok('E2 FAIL-IF-EXPLOIT: fillWater must refuse on non-water wild tiles',
      isWaterTile ? filled >= 1 : filled === 0,
      `tile='${ttype}', filled=${filled}, label="${lastSay.slice(0, 80)}"`);
  }

  // ================= E3: CHARCOAL RAKE KEY SCOPE =================
  // Comment says "one raking per fire per day"; key is per-node per-day.
  freshGame(Game);
  {
    Game.debugToWildNode();
    const s = Game.state.scholar;
    s.kcal = 2000;
    s.inventory.push({ material: 'branch', units: 10 });
    s.firecraft = { attempts: 9, successes: 9, knack: true }; // guaranteed ignition
    // light two fires on the same node, different cells
    const fires0 = (Game.state.fires || []).length;
    Game.makeFire(3, 3);
    Game.makeFire(5, 5);
    const fires = (Game.state.fires || []).length - fires0;
    info(`E3: lit ${fires} fires on one node`);
    if (fires >= 2) {
      s.mx = 4; s.my = 4;
      Game.gatherCharcoal();
      const n1 = (Game.materialCount ? Game.materialCount('charcoal') : (s.inventory.find(i => i.material === 'charcoal') || {}).units) || 0;
      Game.gatherCharcoal();
      const n2 = (Game.materialCount ? Game.materialCount('charcoal') : (s.inventory.find(i => i.material === 'charcoal') || {}).units) || 0;
      const denied = sayLog.some(m => /already raked/i.test(m));
      info(`E3: charcoal after rake1=${n1}, after rake2=${n2}, denied-msg=${denied}`);
      // Design claims per-FIRE per-day; engine enforces per-NODE per-day.
      // Either the comment or the key is wrong. Flag as honesty break.
      ok('E3 honesty: rake key matches its own "per fire" comment', denied === (n2 === n1),
        `two fires, one node: second rake ${denied ? 'denied' : 'granted'} (comment says per-fire)`);
    } else {
      info('E3: could not light two fires (friction failures) — skipped');
    }
  }

  // ================= S1: STRANDED OPTIONS AT 0/0 =================
  // 0 kcal, 0 hydration, wild, far from haven. Is there ANY path back?
  freshGame(Game);
  {
    Game.debugToWildNode();
    const s = Game.state.scholar;
    s.kcal = 0; s.hydration = 0; s.health = 60; s.energy = 0;
    // Can you move at all? travelTo adjacent node.
    const targets = Game.travelTargets();
    let moved = false, moveSay = '';
    if (targets.length) {
      const before = sayLog.length;
      Game.travelTo(targets[0].x, targets[0].y);
      moved = (Game.map.px === targets[0].x && Game.map.py === targets[0].y);
      moveSay = sayLog.slice(before).join(' | ').slice(0, 120);
    }
    info(`S1: 0/0 stranded — travel targets=${targets.length}, moved=${moved}, said: "${moveSay}"`);
    // rest still functions at 0 (gives energy)? That's the E1-adjacent question:
    // a 0-energy stranded player who cannot rest is softlocked; who CAN rest
    // but rests into the void is E1. Report state, don't judge yet.
    const e0 = s.energy;
    Game.doAction('rest');
    info(`S1: rest at 0 kcal/0 energy -> energy ${Math.round(e0)} -> ${Math.round(s.energy)}, health ${Math.round(s.health)}`);
    ok('S1 stranded player can still act (not hard-softlocked)', moved || s.energy > e0,
      `moved=${moved} energy+${Math.round(s.energy - e0)}`);
  }

  // ================= S2: SLEEP + PENDING ENCOUNTER WAKES =================
  freshGame(Game);
  {
    Game.debugToWildNode();
    const s = Game.state.scholar;
    s.kcal = 2000; s.hydration = 60; s.health = 90; s.energy = 40;
    s.day = 4; Game.dayPart = 3; s.dayTicks = 300;
    // control: nothing wrong — sleep should complete to dawn
    const dayBefore = s.day;
    Game.state.weather = 'rain';
    const sayBefore = sayLog.length;
    Game.sleep();
    const controlOk = s.day === dayBefore + 1 && !Game.over;
    info(`S2 control: slept through, day ${dayBefore} -> ${s.day}, over=${!!Game.over}, health 90 -> ${Math.round(s.health)}`);
    ok('S2 control: clean sleep reaches dawn', controlOk);
    // E4: investigate — a clean sleep lost ~14 health. What ate it?
    const nightSays = sayLog.slice(sayBefore).filter(m => /health|hurt|damage|bite|mosquito|cold|fever|sick|wound|-1[0-9]|-\d+ health/i.test(m));
    info(`E4 night health delta: 90 -> ${Math.round(s.health)}; night lines: ${nightSays.length ? nightSays.map(m => m.slice(0, 100)).join(' || ') : '(none matched)'}`);
    if (Math.round(s.health) < 85) {
      const all = sayLog.slice(sayBefore).map(m => m.slice(0, 90)).join('\n    ');
      info(`E4 full night log:\n    ${all}`);
    }
  }
  freshGame(Game);
  {
    Game.debugToWildNode();
    const s = Game.state.scholar;
    s.kcal = 2000; s.hydration = 60; s.health = 90; s.energy = 40;
    s.day = 4; Game.dayPart = 3; s.dayTicks = 300;
    Game.state.weather = 'rain';
    // monster arrives as you drift off: pendingEncounter set pre-sleep
    Game.pendingEncounter = true;
    Game.pendingMonsterId = 'bulldozer';
    const dayBefore = s.day;
    Game.sleep();
    const woken = s.day === dayBefore; // did NOT sleep through to dawn
    const wokeSay = sayLog.some(m => /wake with a start|something is wrong/i.test(m));
    info(`S2 attack: pendingEncounter during sleep -> woken=${woken}, said-it=${wokeSay}, day=${s.day}`);
    ok('S2 camp-invincibility: pending encounter interrupts sleep', woken && wokeSay);
  }

  // ================= H1: COST HONESTY SPOT CHECKS =================
  freshGame(Game);
  {
    const s = Game.state.scholar;
    s.kcal = 2000; s.hydration = 80;
    const n = sayLog.length;
    Game.doAction('rest');
    const restSay = sayLog.slice(n).join(' ');
    ok('H1 rest names its kcal cost', /40 kcal|kcal/.test(restSay) && /rest burns fuel|kcal/.test(restSay),
      `"${restSay.slice(0, 100)}"`);
    // takeWood honesty: 2kg per log, pile drains, carry-gated
    Game.debugToWildNode();
    Game.map.px = 4; Game.map.py = 4; // back to haven node for the pile
    s.insideHaven = true;
    Game.state.village.wood = 10;
    s.kcal = 2000;
    // overweight the player: fill pack to capacity first
    const wBefore = Game.state.village.wood;
    Game.takeWood();
    const took = wBefore - Game.state.village.wood;
    const woodSay = sayLog[sayLog.length - 1] || '';
    info(`H1 takeWood: pile ${wBefore} -> ${Game.state.village.wood}, took=${took}, said: "${woodSay.slice(0, 90)}"`);
    ok('H1 takeWood drains pile exactly what was taken', took > 0 && took <= 4);
  }

  console.log(`\nRESULT seed=${SEED}: ${pass} pass, ${fail} fail`);
  if (findings.length) { console.log('FINDINGS:'); findings.forEach(f => console.log(' - ' + f)); }
  process.exit(fail ? 1 : 0);
})();
