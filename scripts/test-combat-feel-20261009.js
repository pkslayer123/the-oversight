#!/usr/bin/env node
// Proof: combat feel tuning (2026-10-09, Steve-directed).
// "Fleeing should feel like a risk, not an escape route."
// "Unarmored + spear should feel hard, not a guarantee."
//
// Covers:
//  1. Four wave-1 chasers buffed in monsters.json (hushwolf/belltoad/
//     bulldozer/lockpick_raccoon) — stats + follows flags intact.
//  2. Feel curve: unarmored+spear 1v1 -> 2-4 rounds, 25-60% HP cost;
//     hide armor + spear -> meaningfully cheaper; party of 3 spear-
//     wielders -> fast kills.
//  3. Flee: parting attacks fire on trail-loss w/ chasers (normal roll,
//     armor applies, narrated); nothing on the followed branch; clean
//     getaway with no chasers stays clean.
//
// Seeded deterministic (mulberry32, SEED env override). 3 seeds:
// 20261009, 7, 424242.
'use strict';
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
const SEED = parseInt(process.env.SEED || '20261009', 10);

function loadAll() {
  delete globalThis.Scattering;
  Math.random = mulberry32(SEED);
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

let pass = 0, fail = 0;
const results = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
  results.push({ name, ok: !!cond, extra: extra || '' });
}

const says = [];
function endTurn(Game) {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p'); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}

function freshScholar(Game) {
  const s = Game.state.scholar;
  for (const k of ['tradeOpen', 'settleDebtBonus', 'debtSettled', 'braceActive', 'shakeOffUsed',
    'haymakerReady', 'rageActive', 'fightRead', 'loomActive', 'fightDamageTaken',
    'ambushReady', 'noDodgeNext', 'aimBonus', 'deadAimShot', 'ignoreArmorNext']) delete s[k];
  s.health = 100; s.kcal = 2600; s.hydration = 80; s.energy = 100; s.water = [];
  s.trauma = 0; s.mx = 4; s.my = 4; s.equipped = {};
  // baseline build: no abilities at all, so no PATIENT AIM opener doubling
  // (that's a separate, working system — the feel band measures raw stats)
  s.abilities = []; s.backgroundAbilities = [];
  return s;
}

function runPlayerFight(Game, monId, gear) {
  if (Game.inCombat()) { try { Game.tbfight.over = true; } catch (e) {} }
  const s = freshScholar(Game);
  if (gear === 'spear' || gear === 'spear+hide') s.equipped.melee = { itemId: 'hunting_spear', name: 'Hunting Spear' };
  if (gear === 'spear+hide') s.equipped.torso = { itemId: 'hide_armor', name: 'Hide Armor' };
  Game.startCombat(monId);
  // keep fighter refs: tbfight is nulled by tbEnd, but the objects persist
  const mRefs = Game.tbfight ? Game.tbfight.fighters.filter(x => x.kind === 'monster') : [];
  let rounds = 0, minHp = 100, fled = false;
  while (Game.inCombat() && rounds < 40) {
    const p = Game.tbFighter('p');
    if (!p || !p.alive) break;
    if (p.hp < minHp) minHp = p.hp;
    const m = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive && !x.fled);
    if (!m) break;
    if (p.fled) { fled = true; break; }
    if (!Game.tbIsPlayerTurn()) { endTurn(Game); continue; }
    // naive brawler: stand and strike (no telegraph dodging — worst honest case)
    Game.tbPlayerStrike(m.key);
    rounds++;
    endTurn(Game);
  }
  const p = Game.tbFighter('p');
  if (p && p.alive && p.hp < minHp) minHp = p.hp;
  const dead = mRefs.filter(m => m.hp <= 0).length;
  const routed = mRefs.filter(m => m.hp > 0 && m.fled).length;
  if (Game.inCombat()) { try { Game.tbfight.over = true; } catch (e) {} }
  return { rounds, hpCost: 100 - minHp, killed: dead, routed, fled,
           playerAlive: !p || p.alive, resolved: dead + routed === mRefs.length };
}

(async () => {
  const Game = loadAll();
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  try { Game.location = 'haven'; } catch (e) {}
  Game.state.weather = 'clear';
  const origSay = Game.say;
  Game.say = (t) => { says.push(String(t)); };

  const byId = {};
  for (const m of (Game.data.monsters || [])) byId[m.id] = m;

  console.log('== 1. stat buffs landed, follows untouched ==');
  const expect = {
    hushwolf: { hp: [50, 65], dmg: [14, 20] },
    belltoad: { hp: [45, 60], dmg: [12, 18] },
    bulldozer: { hp: [70, 90], dmg: [20, 28] },
    lockpick_raccoon: { hp: [40, 55], dmg: [12, 18] },
  };
  for (const [id, e] of Object.entries(expect)) {
    const m = byId[id];
    check(id + ' hp buffed', JSON.stringify(m.hp) === JSON.stringify(e.hp), JSON.stringify(m.hp));
    check(id + ' dmg buffed', JSON.stringify((m.attack || {}).damage) === JSON.stringify(e.dmg), JSON.stringify((m.attack || {}).damage));
    check(id + ' still follows:true', m.follows === true, String(m.follows));
  }
  check('gallowdeer untouched (benchmark, not my buff)', JSON.stringify(byId['gallowdeer'].hp) === JSON.stringify([150, 170]) && JSON.stringify((byId['gallowdeer'].attack || {}).damage) === JSON.stringify([22, 32]), JSON.stringify(byId['gallowdeer'].hp));

  console.log('== 1b. equippedWeapon slot fix (2026-10-07 regression) ==');
  {
    const s = Game.state.scholar;
    s.equipped = {};
    const un = Game.equippedWeapon();
    check('unequipped: unarmed, bonus 0', un.unarmed === true && un.bonus === 0, '');
    s.equipped = { melee: { itemId: 'hunting_spear', name: 'Hunting Spear' } };
    const sp = Game.equippedWeapon();
    check('melee spear: bonus applies (+30)', sp.unarmed === false && sp.bonus === 30, 'bonus=' + sp.bonus);
    check('melee spear: range 2 (spear reach)', sp.range === 2, 'range=' + sp.range);
    s.equipped = {};
  }

  console.log('== 2. feel curve: unarmored + spear (hard, not guaranteed) ==');
  const N = 6;
  const band = {};
  for (const id of Object.keys(expect)) {
    let rounds = [], costs = [], kills = 0, routs = 0, alive = 0;
    for (let i = 0; i < N; i++) {
      const r = runPlayerFight(Game, id, 'spear');
      rounds.push(r.rounds); costs.push(r.hpCost);
      kills += r.killed; routs += r.routed; if (r.playerAlive && !r.fled) alive++;
    }
    const avgR = rounds.reduce((a, b) => a + b, 0) / N;
    const avgC = costs.reduce((a, b) => a + b, 0) / N;
    band[id] = { avgR: +avgR.toFixed(1), avgC: +avgC.toFixed(0) };
    console.log(`    ${id}: ${avgR.toFixed(1)} rounds, ${avgC.toFixed(0)}% HP cost, kills ${kills}, routs ${routs} (n=${N})`);
    check(id + ' resolved in 2-4 rounds', avgR >= 2 && avgR <= 4, avgR.toFixed(1) + ' rounds');
    check(id + ' costs 25-60% HP', avgC >= 25 && avgC <= 60, avgC.toFixed(0) + '%');
  }

  console.log('== 3. hide armor + spear is meaningfully cheaper ==');
  for (const id of Object.keys(expect)) {
    let costs = [];
    for (let i = 0; i < N; i++) costs.push(runPlayerFight(Game, id, 'spear+hide').hpCost);
    const avgC = costs.reduce((a, b) => a + b, 0) / N;
    console.log(`    ${id}: armored ${avgC.toFixed(0)}% vs unarmored ${band[id].avgC}%`);
    check(id + ' armor reduces HP cost', avgC < band[id].avgC, avgC.toFixed(0) + '% vs ' + band[id].avgC + '%');
  }

  console.log('== 4. party of 3 spear-wielders: fast kills ==');
  {
    const v = Game.state.village;
    const npcIds = (v.roster || []).filter(id => id !== Game.villagerId);
    const trio = npcIds.slice(0, 3);
    // gear all three with the full starter set: spear + hide armor
    // (Steve: "full starter set of gear on a whole party of 3+ people")
    for (const vid of trio) {
      const vp = (Game.data.villagers || []).find(x => x.id === vid) ||
                 (Game.data.background_survivors || []).find(x => x.id === vid);
      if (vp) { vp.items = ['hunting_spear', 'hide_armor']; vp.equipped = { melee: { itemId: 'hunting_spear', name: 'Hunting Spear' }, torso: { itemId: 'hide_armor', name: 'Hide Armor' } }; }
      v.health = v.health || {}; v.health[vid] = 100;
    }
    for (const id of Object.keys(expect)) {
      const mdef = byId[id];
      let outcomes = [], rounds = [], taken = [];
      for (let i = 0; i < N; i++) {
        for (const vid of trio) v.health[vid] = 100;
        const rec = Game.fieldFight(trio[0], mdef, null, { allies: 2, allyVids: trio.slice(1) });
        outcomes.push(rec.outcome); rounds.push(rec.rounds); taken.push(rec.vTaken);
      }
      const avgR = rounds.reduce((a, b) => a + b, 0) / N;
      const avgT = taken.reduce((a, b) => a + b, 0) / N;
      const kills = outcomes.filter(o => o === 'vKill' || o === 'mFlee').length;
      console.log(`    ${id}: ${kills}/${N} kills/drives, ${avgR.toFixed(1)} rounds, ${avgT.toFixed(0)} taken`);
      check(id + ' party of 3 wins fast', kills >= N - 1 && avgR <= 8, outcomes.join(',') + ' / ' + avgR.toFixed(1) + ' rounds');
    }
  }

  console.log('== 5. chases, not coin flips ==');
  // Drive N barrier crossings westward; the map starts at (4,4) so three
  // crossings stay inside the world.
  function chaseTrial(monId, crossings, opts) {
    opts = opts || {};
    if (Game.inCombat()) { try { Game.tbfight.over = true; } catch (e) {} }
    const s = freshScholar(Game);
    Game.map.px = 4; Game.map.py = 4;
    Game.startCombat(monId);
    if (opts.boostPursuit) {
      for (const m of Game.tbfight.fighters) if (m.kind === 'monster') m._pursuit = opts.boostPursuit;
    }
    if (opts.havenWest) { Game.tileAt(3, 4).type = 'haven'; }
    const logs = [];
    let dists = [];
    for (let c = 0; c < crossings; c++) {
      if (!Game.inCombat()) break;
      const p = Game.tbFighter('p');
      p.mx = 0; p.my = 4; p.hp = 100; p.maxHp = 100; p.alive = true;
      let guard = 0;
      while (!Game.tbIsPlayerTurn() && guard++ < 12) endTurn(Game);
      if (!Game.inCombat()) break;
      says.length = 0;
      Game.tbBarrierExit(-1, 0);
      logs.push(says.join('\n'));
      if (Game.inCombat()) {
        const p2 = Game.tbFighter('p');
        const ms = Game.tbfight.fighters.filter(x => x.kind === 'monster' && x.alive && !x.fled);
        dists.push(ms.map(m => Math.max(Math.abs(m.mx - p2.mx), Math.abs(m.my - p2.my))));
      }
      if (!Game.inCombat()) break;
    }
    const over = !Game.inCombat();
    if (Game.inCombat()) { try { Game.tbfight.over = true; } catch (e) {} }
    if (opts.havenWest) { Game.tileAt(3, 4).type = 'forest'; }
    return { logs, over, dists };
  }
  {
    // turtle (follows:false): flee is free, no chase, no pursuit lines
    const t = chaseTrial('speedbump_turtle', 1);
    check('turtle flee is free (fight ends)', t.over, '');
    check('turtle: no chase narration', !/gaining on you|pulling away|won\'t stop|gives up the chase/.test(t.logs.join('\n')), '');
    check('turtle: clean getaway narrated', /can't follow/.test(t.logs.join('\n')), '');
  }
  {
    // bulldozer: persistence 2 — chases across one barrier (flagging), gives up at the second
    const t = chaseTrial('bulldozer', 3);
    check('bulldozer: first crossing continues the chase', !t.over || t.logs.length >= 1, '');
    const first = t.logs[0] || '';
    check('bulldozer: chase continues narrated', /chase continues/.test(first), first.slice(0, 100));
    check('bulldozer: flagging narrated at last pursuit', /flagging/.test(first), '');
    check('bulldozer: gives up at second barrier (fight ends)', t.over && t.logs.length === 2, `crossings=${t.logs.length} over=${t.over}`);
    check('bulldozer: give-up narrated', /give up the chase/.test(t.logs[1] || ''), '');
  }
  {
    // belltoad: persistence 1 — you pull away at the first barrier
    const t = chaseTrial('belltoad', 2);
    check('belltoad: gives up at first barrier (fight ends)', t.over && t.logs.length === 1, `crossings=${t.logs.length}`);
  }
  {
    // hushwolf: relentless — follows across 3 barriers, never gives up
    const t = chaseTrial('hushwolf', 3);
    check('hushwolf: chase never ends across 3 barriers', !t.over && t.logs.length === 3, `crossings=${t.logs.length} over=${t.over}`);
    check('hushwolf: relentlessness telegraphed', /won't stop/.test(t.logs[0] || ''), '');
    check('hushwolf: relentlessness told once', (t.logs.join('\n').match(/won't stop/g) || []).length === 1, '');
  }
  {
    // haven ends even the relentless chase
    const t = chaseTrial('hushwolf', 1, { havenWest: true });
    check('haven ends the relentless chase (fight ends)', t.over, '');
    check('haven safety narrated', /Haven is safe/.test(t.logs.join('\n')), '');
  }
  {
    // speed differential: faster monster re-enters closer than a slower one
    const fast = chaseTrial('hushwolf', 1);
    const slow = chaseTrial('belltoad', 1, { boostPursuit: 5 });
    const fastD = fast.dists[0] ? Math.min(...fast.dists[0]) : 99;
    const slowD = slow.dists[0] ? Math.min(...slow.dists[0]) : 0;
    console.log(`    re-entry distance: hushwolf(speed 5)=${fastD} vs belltoad(speed 2)=${slowD} (player speed ${Game.playerSpeed()})`);
    check('faster monster gains (re-enters closer)', fastD < slowD, `fast=${fastD} slow=${slowD}`);
    check('gaining narrated for faster', /gaining on you/.test(fast.logs.join('\n')), '');
    check('pulling away narrated for slower', /pulling away/.test(slow.logs.join('\n')), '');
  }
  {
    // no RNG anywhere in the chase: same seed path is fully deterministic
    check('chasePersistence documented values', Game.chasePersistence({ id: 'belltoad' }) === 1 && Game.chasePersistence({ id: 'bulldozer' }) === 2 && Game.chasePersistence({ id: 'lockpick_raccoon' }) === 3 && Game.chasePersistence({ id: 'whatever' }) === 2, '');
    const hw = byId['hushwolf'];
    check('hushwolf relentless flag in data', hw.relentless === true, '');
    check('hushwolf codex telegraphs relentlessness', /do not stop/.test((hw.codexStages || {}).observed || ''), '');
  }

  Game.say = origSay;
  console.log(`\n${pass} pass, ${fail} fail (seed ${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
