#!/usr/bin/env node
// Proof + measurement: armor diminishing-returns model (Steve 2026-10-09).
// Model (all three absorb sites — tbDamage player block, tbDamage villager
// block, fieldFights): r = P/(P+20); absorbed = min(hit-1, round(hit*r));
// final = hit - absorbed. Pieces stay additive into P (armorOf, coord bonus
// included). Monster-side mdef.armor untouched (separate system).
//
// Part 1: unit checks on the exact formula — no immunity ever, monotonic.
// Part 2: scenario measurements vs combat-feel baselines (seeds 20261009/7/424242).
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
function check(name, cond, extra) {
  if (cond) { pass++; } else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

// Exact model as implemented (mirror of the three sites).
function absorb(P, hit) {
  if (P <= 0 || hit <= 0) return { absorbed: 0, final: hit };
  const r = P / (P + 20);
  const absorbed = Math.min(hit - 1, Math.round(hit * r));
  return { absorbed, final: hit - absorbed };
}

console.log('== Part 1: formula unit checks (P x hit matrix) ==');
{
  const Ps = [0, 1, 5, 10, 20, 46, 54, 100, 200];
  const Hits = [1, 3, 5, 12, 14, 20, 28, 60, 100];
  let cells = 0;
  for (const hit of Hits) {
    let prevFinal = Infinity;
    for (const P of Ps) {
      const { absorbed, final } = absorb(P, hit);
      cells++;
      check(`P=${P} hit=${hit}: no immunity (absorbed<hit)`, absorbed < hit, `absorbed=${absorbed} hit=${hit}`);
      check(`P=${P} hit=${hit}: final>=${hit >= 1 ? 1 : 0}`, final >= (hit >= 1 ? 1 : 0), `final=${final}`);
      check(`P=${P} hit=${hit}: monotonic (final<=${prevFinal})`, final <= prevFinal, `final=${final} prev=${prevFinal}`);
      prevFinal = final;
    }
  }
  // armor always does something for realistic blows
  for (const hit of [12, 14, 20, 28]) {
    for (const P of [5, 10, 20, 46, 54]) {
      check(`P=${P} hit=${hit}: absorbs>0`, absorb(P, hit).absorbed > 0, '');
    }
  }
  // P=0 -> untouched
  for (const hit of [1, 14, 28, 100]) check(`P=0 hit=${hit}: final==hit`, absorb(0, hit).final === hit, '');
  console.log(`  ${cells} cells x 3 checks + realism + P=0 checks done`);
}

// ---- scenario harness (patterns from test-combat-feel-20261009.js) ----
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
  s.abilities = []; s.backgroundAbilities = [];
  return s;
}
const KIT = [
  ['head', 'skull_helm', 'Skull Helm'],
  ['torso', 'hide_armor', 'Hide Armor'],
  ['legs', 'canvas_pants', 'Canvas Pants'],
  ['hands', 'work_gloves', 'Work Gloves'],
  ['shoes', 'good_boots', 'Good Boots'],
];
function runPlayerFight(Game, monId, gear) {
  if (Game.inCombat()) { try { Game.tbfight.over = true; } catch (e) {} }
  const s = freshScholar(Game);
  s.equipped.melee = { itemId: 'hunting_spear', name: 'Hunting Spear' };
  if (gear === 'spear+hide') s.equipped.torso = { itemId: 'hide_armor', name: 'Hide Armor' };
  if (gear === 'spear+kit') for (const [slot, id, name] of KIT) s.equipped[slot] = { itemId: id, name };
  const prot = Game.armorBonus();
  says.length = 0;
  Game.startCombat(monId);
  const mRefs = Game.tbfight ? Game.tbfight.fighters.filter(x => x.kind === 'monster') : [];
  let rounds = 0, minHp = 100, fled = false;
  const absorbLines = [];
  const sayCap = Game.say;
  while (Game.inCombat() && rounds < 40) {
    const p = Game.tbFighter('p');
    if (!p || !p.alive) break;
    if (p.hp < minHp) minHp = p.hp;
    const m = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive && !x.fled);
    if (!m) break;
    if (p.fled) { fled = true; break; }
    if (!Game.tbIsPlayerTurn()) { endTurn(Game); continue; }
    Game.tbPlayerStrike(m.key);
    rounds++;
    endTurn(Game);
  }
  for (const t of says) { const m = /Armor absorbs (\d+)/.exec(t); if (m) absorbLines.push(+m[1]); }
  says.length = 0;
  const p = Game.tbFighter('p');
  if (p && p.alive && p.hp < minHp) minHp = p.hp;
  const dead = mRefs.filter(m => m.hp <= 0).length;
  const routed = mRefs.filter(m => m.hp > 0 && m.fled).length;
  if (Game.inCombat()) { try { Game.tbfight.over = true; } catch (e) {} }
  return { rounds, hpCost: 100 - minHp, killed: dead, routed, fled,
           playerAlive: !p || p.alive, resolved: dead + routed === mRefs.length, prot, absorbLines };
}

(async () => {
  const Game = loadAll();
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  try { Game.location = 'haven'; } catch (e) {}
  Game.state.weather = 'clear';
  Game.say = (t) => { says.push(String(t)); };

  const MONS = ['hushwolf', 'belltoad', 'bulldozer', 'lockpick_raccoon'];
  const N = 6;
  const table = {};

  for (const gear of ['spear', 'spear+hide', 'spear+kit']) {
    console.log(`== Part 2: player 1v1, gear=${gear} ==`);
    table[gear] = {};
    for (const id of MONS) {
      let rounds = [], costs = [], prods = [], allAbs = [];
      for (let i = 0; i < N; i++) {
        const r = runPlayerFight(Game, id, gear);
        rounds.push(r.rounds); costs.push(r.hpCost); prods.push(r.prot); allAbs.push(...r.absorbLines);
      }
      const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
      const prot = prods[0];
      table[gear][id] = { avgR: +avg(rounds).toFixed(1), avgC: +avg(costs).toFixed(0), prot, nAbs: allAbs.length, maxAbs: allAbs.length ? Math.max(...allAbs) : 0 };
      console.log(`    ${id}: prot=${prot} ${avg(rounds).toFixed(1)} rounds, ${avg(costs).toFixed(0)}% HP cost (n=${N}), absorb lines=${allAbs.length} maxAbsorbed=${table[gear][id].maxAbs}`);
    }
  }

  console.log('== Part 2 checks ==');
  for (const id of MONS) {
    const un = table['spear'][id], hi = table['spear+hide'][id], kit = table['spear+kit'][id];
    if (id === 'lockpick_raccoon') { console.log('    lockpick: routs round 1, never deals damage — armor comparisons vacuous, skipped'); continue; }
    check(id + ': hide (P=20) strictly better than unarmored', hi.avgC < un.avgC, `${hi.avgC}% vs ${un.avgC}%`);
    // noise tolerance: 0-vs-1% when the monster lands ~no hits is RNG, not armor
    check(id + ': kit no worse than hide (within noise)', kit.avgC <= hi.avgC + 2, `${kit.avgC}% vs ${hi.avgC}%`);
    // "never 0" is only meaningful if the monster actually landed hits
    for (const [lbl, sc] of [['hide', hi], ['kit', kit]]) {
      if (sc.nAbs > 0) check(`${id}: ${lbl} took damage when hit (no immunity)`, sc.avgC > 0, sc.avgC + '%');
      else console.log(`    ${id}: ${lbl} took no hits in ${N} fights — immunity check vacuous (monster never attacked)`);
    }
    // boundary: hide vs bulldozer — old model granted immunity on low rolls; no absorb line may reach the hit
    if (id === 'bulldozer' && hi.nAbs > 0) check('bulldozer: no absorb line reaches min hit 20', hi.maxAbs < 20, 'maxAbs=' + hi.maxAbs);
  }
  // unarmored baselines must be unchanged by this fix (armor code not touched for P=0)
  const expectBand = { hushwolf: [60, 95], belltoad: [10, 30], bulldozer: [2, 12], lockpick_raccoon: [0, 10] };
  for (const id of MONS) {
    const c = table['spear'][id].avgC, [lo, hiB] = expectBand[id];
    check(id + ': unarmored baseline in band', c >= lo && c <= hiB, c + '% not in [' + lo + ',' + hiB + ']');
  }

  console.log('== Part 2b: tank mode — per-hit absorption at the boundary (P=20) ==');
  // Player waits; monster gets max attack rounds. Direct evidence that no
  // single hit is ever fully absorbed (the old immunity cliff).
  function runTank(monId) {
    if (Game.inCombat()) { try { Game.tbfight.over = true; } catch (e) {} }
    const s = freshScholar(Game);
    s.equipped.melee = { itemId: 'hunting_spear', name: 'Hunting Spear' };
    s.equipped.torso = { itemId: 'hide_armor', name: 'Hide Armor' }; // P=20
    says.length = 0;
    Game.startCombat(monId);
    let rounds = 0;
    const absorbLines = [];
    while (Game.inCombat() && rounds < 8) {
      const p = Game.tbFighter('p');
      if (!p || !p.alive) break;
      if (!Game.tbIsPlayerTurn()) {
        const q = Game.tbFighter('p'); if (q) { q.moveLeft = 0; q.acted = true; }
        try { Game.tbAfterPlayerAction(); } catch (e) {}
        continue;
      }
      try { Game.tbPlayerWait(); } catch (e) { break; }
      rounds++;
    }
    for (const t of says) { const m = /Armor absorbs (\d+)/.exec(t); if (m) absorbLines.push(+m[1]); }
    says.length = 0;
    if (Game.inCombat()) { try { Game.tbfight.over = true; } catch (e) {} }
    return absorbLines;
  }
  const MINHIT = { hushwolf: 14, bulldozer: 20, belltoad: 12 };
  for (const id of ['hushwolf', 'bulldozer', 'belltoad']) {
    let abs = [];
    for (let i = 0; i < 4; i++) abs.push(...runTank(id));
    const minHit = MINHIT[id];
    console.log(`    ${id} P=20: ${abs.length} hits absorbed [${abs.slice(0, 12).join(',')}${abs.length > 12 ? '...' : ''}]`);
    check(`${id}: hits landed in tank mode`, abs.length > 0, 'no hits — tank broken');
    if (abs.length) {
      check(`${id}: every absorbed < min hit ${minHit} (no immunity)`, Math.max(...abs) < minHit, 'max=' + Math.max(...abs));
      check(`${id}: every absorbed >= 1 (armor does something)`, Math.min(...abs) >= 1, 'min=' + Math.min(...abs));
      // P=20 -> r=0.5, expect absorbed ~= round(hit/2)
      const avgA = abs.reduce((a, b) => a + b, 0) / abs.length;
      console.log(`    ${id}: avg absorbed ${avgA.toFixed(1)} (expect ~half of [${minHit},${minHit === 14 ? 20 : minHit === 20 ? 28 : 18}])`);
    }
  }

  console.log('== Part 3: party of 3, full kits (Steve bar) ==');
  {
    const v = Game.state.village;
    const npcIds = (v.roster || []).filter(id => id !== Game.villagerId);
    const trio = npcIds.slice(0, 3);
    for (const vid of trio) {
      const vp = (Game.data.villagers || []).find(x => x.id === vid) ||
                 (Game.data.background_survivors || []).find(x => x.id === vid);
      if (vp) {
        vp.items = ['hunting_spear', 'skull_helm', 'hide_armor', 'canvas_pants', 'work_gloves', 'good_boots'];
        vp.equipped = { melee: { itemId: 'hunting_spear', name: 'Hunting Spear' } };
        for (const [slot, iid, name] of KIT) vp.equipped[slot] = { itemId: iid, name };
      }
      v.health = v.health || {}; v.health[vid] = 100;
    }
    for (const id of MONS) {
      const mdef = (Game.data.monsters || []).find(m => m.id === id);
      let outcomes = [], rounds = [], taken = [];
      for (let i = 0; i < N; i++) {
        for (const vid of trio) v.health[vid] = 100;
        const rec = Game.fieldFight(trio[0], mdef, null, { allies: 2, allyVids: trio.slice(1) });
        outcomes.push(rec.outcome); rounds.push(rec.rounds); taken.push(rec.vTaken);
      }
      const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
      const wins = outcomes.filter(o => o === 'vKill' || o === 'mFlee').length;
      console.log(`    ${id}: wins ${wins}/${N}, ${avg(rounds).toFixed(1)} rounds, ${avg(taken).toFixed(0)} taken`);
      check(id + ': party of 3 kitted wins', wins >= 5, wins + '/' + N);
    }
  }

  console.log('== Part 4: villager fieldFight armor spot-check (capped path) ==');
  {
    const v = Game.state.village;
    const npcIds = (v.roster || []).filter(id => id !== Game.villagerId);
    const vid = npcIds[3] || npcIds[0];
    const vp = (Game.data.villagers || []).find(x => x.id === vid) ||
               (Game.data.background_survivors || []).find(x => x.id === vid);
    const mdef = (Game.data.monsters || []).find(m => m.id === 'hushwolf');
    v.health = v.health || {};
    // unarmored
    vp.items = []; vp.equipped = {};
    v.health[vid] = 100;
    let t0 = [], d0 = [];
    for (let i = 0; i < 4; i++) { v.health[vid] = 100; const rec = Game.fieldFight(vid, mdef, null, {}); t0.push(rec.vTaken); d0.push(rec.outcome + '/' + rec.rounds + 'r'); }
    // hide torso only
    vp.items = ['hide_armor']; vp.equipped = { torso: { itemId: 'hide_armor', name: 'Hide Armor' } };
    v.health[vid] = 100;
    let t1 = [], absLines = 0, d1 = [];
    for (let i = 0; i < 4; i++) { v.health[vid] = 100; const rec = Game.fieldFight(vid, mdef, null, {}); t1.push(rec.vTaken); d1.push(rec.outcome + '/' + rec.rounds + 'r'); absLines += (rec.log || []).filter(l => /gear absorbs/.test(l)).length; }
    const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
    console.log(`    hushwolf vs villager: unarmored taken ${avg(t0).toFixed(0)} [${d0.join(' ')}], hide-armored taken ${avg(t1).toFixed(0)} [${d1.join(' ')}], absorb lines ${absLines}`);
    check('villager: armor reduces taken', avg(t1) < avg(t0), `${avg(t1).toFixed(0)} vs ${avg(t0).toFixed(0)}`);
    check('villager: armor never grants 0 taken', avg(t1) > 0, avg(t1).toFixed(0));
    check('villager: absorb path exercised', absLines > 0, String(absLines));
    vp.items = []; vp.equipped = {};
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
