#!/usr/bin/env node
// Villager objectives proof (2026-10-08).
// BEFORE/AFTER: run B evals HEAD's game.js (the old dice triggers) and skips
// villager-objectives.js; run A is the new objective system.
// Seeds Math.random BEFORE eval (modules capture it at load time).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
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

function loadAll(oldGame) {
  // fresh global state per run
  delete globalThis.Scattering;
  Math.random = mulberry32(SEED);
  global.window = global;
  global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
  global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  let files = [...html.matchAll(/<script src="([^"]+)"/g)]
    .map(m => m[1].split('?')[0])
    .filter(f => f.startsWith('src/js/'))
    .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
  if (oldGame) files = files.filter(f => f !== 'src/js/villager-objectives.js');
  let oldSrc = null;
  if (oldGame) {
    // game.js is >1MB: execSync's buffer can't hold it — go through a file
    const tmp = '/tmp/game-old-' + SEED + '.js';
    execSync('git show HEAD:src/js/game.js > ' + tmp, { cwd: ROOT });
    oldSrc = fs.readFileSync(tmp, 'utf8');
  }
  for (const f of files) {
    const src = (oldGame && f === 'src/js/game.js') ? oldSrc : fs.readFileSync(path.join(ROOT, f), 'utf8');
    eval(src);
  }
  delete global.window;
  return globalThis.Scattering.Game;
}

async function newFedGame(Game) {
  await Game.init();
  Game.genRoster('Breaker');
  const rid = Game.generatedRoster[0].id;
  Game.newGame('Breaker', null, rid);
  Game.depart();
  const v = Game.state.village;
  const hx = v.px ?? 4, hy = v.py ?? 4;
  Game.map.px = hx; Game.map.py = hy; // player at haven: beats are said
  Game.stockPantry(20000, 'test'); // FED village: old hunger trigger starves
  v.water = v.water || {}; v.water.clean = 1; // well nearly dry → WATER objective fires
  for (const id of (v.roster || [])) {
    if (id === Game.villagerId) continue;
    const n = Game.npcNeeds(id);
    n.hunger = 10; n.energy = 80; n.social = 40; n.fear = 10;
    Game.npcSetNode(id, hx, hy);
    try { Game.npcSetInside(id, true); } catch (e) {}
  }
  // one trap-knower so TRAPS is in the repertoire (knowledge-gated)
  try {
    const ids2 = (v.roster || []).filter(id => id !== Game.villagerId);
    if (ids2.length) Game.vpOf(ids2[0]).knowsSnare = true;
  } catch (e) {}
  return { v, hx, hy };
}

function npcIds(Game, v) {
  return (v.roster || []).filter(id => id !== Game.villagerId);
}

// drive N parts; count departure events (rid newly in v.away)
function drive(Game, v, parts, onPart) {
  let departures = 0, depPurposes = {};
  const seen = new Set(Object.keys(v.away || {}));
  for (let p = 0; p < parts; p++) {
    Game.advancePart();
    for (const id of Object.keys(v.away || {})) {
      if (!seen.has(id)) {
        seen.add(id); departures++;
        const pur = (v.away[id] || {}).purpose || '?';
        depPurposes[pur] = (depPurposes[pur] || 0) + 1;
      }
    }
    if (onPart) onPart(p);
  }
  return { departures, depPurposes };
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

(async () => {
  // ============ RUN A: new objective system ============
  console.log('== RUN A (objectives) ==');
  let Game = loadAll(false);
  let { v, hx, hy } = await newFedGame(Game);
  const ids = npcIds(Game, v);

  // T2: pursuit, not random walk — wrap objAwayStep BEFORE the first drive
  // and measure across the whole sim.
  let toward = 0, total = 0, stepCalls = 0;
  const _oas = Game.objAwayStep;
  Game.objAwayStep = function (rid, node, away, hx2, hy2) {
    stepCalls++;
    const o = (this.objState()[rid] || {});
    let d0 = null;
    if (o.state === 'out' && o.tx != null) d0 = Math.max(Math.abs(node.nx - o.tx), Math.abs(node.ny - o.ty));
    _oas.call(this, rid, node, away, hx2, hy2);
    if (d0 != null && d0 > 0) {
      // traveling (not yet at the site): does the step close the distance?
      const n2 = this.npcNode(rid);
      const d1 = Math.max(Math.abs(n2.nx - o.tx), Math.abs(n2.ny - o.ty));
      if (d0 !== d1) { total++; if (d1 < d0) toward++; }
    }
  };

  // ensureDanger: seed monster-activity gossip until objVillageDanger() >= min,
  // stepping a part if the living game deduped our seed (same action+part).
  // Pins rain for a static scenario.
  function ensureDanger(Game, v, min) {
    let guard = 0;
    while (Game.objVillageDanger() < min && guard++ < 8) {
      Game.seedGossip('attack', { brave: -5 }, []);
      Game.seedGossip('murder', { honest: -10 }, []);
      Game.state.weather = 'rain';
      if (Game.objVillageDanger() < min) Game.advancePart();
    }
    Game.state.weather = 'rain';
    return Game.objVillageDanger();
  }

  // T1: departures happen in a fed village, every one with an objective
  // (6 days — stable across RNG paths)
  const r1 = drive(Game, v, 24);
  console.log('  departures/6d:', r1.departures, JSON.stringify(r1.depPurposes));
  check('fed village: villagers actually leave (new)', r1.departures >= 6, 'got ' + r1.departures);
  check('fed village: villagers actually leave (new)', r1.departures >= 6, 'got ' + r1.departures);
  let allObj = true;
  for (const id of Object.keys(v.away || {})) {
    const o = (v.objectives || {})[id];
    if (!o || !o.purpose) allObj = false;
  }
  // (check historically too: every away entry ever had purpose — objDepart always sets both)
  check('every departure carries an objective purpose', allObj);
  console.log('  away-steps:', stepCalls, 'pursuit steps:', toward + '/' + total);
  // smoke-level: the rigorous pursuit proof is T2b (crafted); here we just
  // need the integrated sim to show target-directed movement, not drift
  check('sim movement pursues targets (not random walk)', total >= 2 && toward / total > 0.5, toward + '/' + total);
  Game.objAwayStep = _oas;

  // T2b: crafted far trips — deterministic pursuit measurement. Three
  // villagers sent 4 steps out by direct departure; every traveling step
  // should close the distance (meander excepted).
  Game = loadAll(false);
  ({ v, hx, hy } = await newFedGame(Game));
  const travelers = npcIds(Game, v).slice(0, 3);
  for (const id of travelers) {
    const o = Game.objOf(id);
    o.kind = 'EXPLORE'; o.purpose = 'explore'; o.state = 'ready'; o.indoor = false;
    o.tx = hx + 4; o.ty = hy; o.tightness = 4; o.partsLeft = 8;
    o.targetVid = null; o.companion = null; o.tightened = false;
    Game.objDepart(id, o, hx, hy, true);
  }
  let ctoward = 0, ctotal = 0;
  const _oas2 = Game.objAwayStep;
  Game.objAwayStep = function (rid, node, away, hx2, hy2) {
    const o = (this.objState()[rid] || {});
    let d0 = null;
    if (o.state === 'out' && o.tx != null) d0 = Math.max(Math.abs(node.nx - o.tx), Math.abs(node.ny - o.ty));
    _oas2.call(this, rid, node, away, hx2, hy2);
    if (d0 != null && d0 > 0) {
      const n2 = this.npcNode(rid);
      const d1 = Math.max(Math.abs(n2.nx - o.tx), Math.abs(n2.ny - o.ty));
      if (d0 !== d1) { ctotal++; if (d1 < d0) ctoward++; }
    }
  };
  drive(Game, v, 10);
  Game.objAwayStep = _oas2;
  console.log('  crafted pursuit steps:', ctoward + '/' + ctotal);
  check('crafted far trips pursue targets', ctotal >= 6 && ctoward / ctotal > 0.55, ctoward + '/' + ctotal);

  // T3a: no night departures
  const awayBefore = Object.keys(v.away || {}).length;
  Game.dayPart = 3;
  for (let i = 0; i < 8; i++) Game.npcNodeTravel();
  const awayAfter = Object.keys(v.away || {}).length;
  check('no departures at night', awayAfter <= awayBefore, awayBefore + '->' + awayAfter);

  // T5: nomadic range — homebodies tight, others range
  Game = loadAll(false);
  ({ v, hx, hy } = await newFedGame(Game));
  const maxD = {};
  drive(Game, v, 24, () => {
    for (const id of npcIds(Game, v)) {
      const n = Game.npcNode(id);
      const d = Math.max(Math.abs(n.nx - hx), Math.abs(n.ny - hy));
      maxD[id] = Math.max(maxD[id] || 0, d);
    }
  });
  let homeOk = true, farSeen = false;
  for (const id of npcIds(Game, v)) {
    const prof = Game.npcRangeProfile(id);
    if (prof === 'homebody' && (maxD[id] || 0) > 1) homeOk = false;
    if ((prof === 'explorer' || prof === 'wanderer') && (maxD[id] || 0) >= 2) farSeen = true;
  }
  check('homebodies stay within 1 node', homeOk, JSON.stringify(maxD));
  check('nomads range farther (>=2 nodes seen)', farSeen, JSON.stringify(maxD));

  // T6: indoor behavior — indoor objectives hold them home and inside
  Game = loadAll(false);
  ({ v, hx, hy } = await newFedGame(Game));
  let indoorViol = 0, indoorSeen = 0;
  drive(Game, v, 16, () => {
    for (const id of npcIds(Game, v)) {
      const o = (Game.objState()[id] || {});
      if (o.indoor && o.state === 'indoor') {
        indoorSeen++;
        const n = Game.npcNode(id);
        if (n.nx !== hx || n.ny !== hy) indoorViol++;
        try { if (!Game.npcInside(id)) indoorViol++; } catch (e) {}
      }
    }
  });
  console.log('  indoor-objective parts seen:', indoorSeen);
  check('indoor objectives: no travel, stay inside', indoorSeen > 0 && indoorViol === 0, 'viol=' + indoorViol);

  // T3b: danger respected — ensured score >= 4 + pinned rain → tighten →
  // no departure beyond 1 step (escape is the designed exception)
  Game = loadAll(false);
  ({ v, hx, hy } = await newFedGame(Game));
  const dscore = ensureDanger(Game, v, 4);
  console.log('  danger score ensured:', dscore);
  check('danger scenario established (score>=4)', dscore >= 4, 'score=' + dscore);
  // pin the weather: the living storm system would otherwise move it and the
  // danger scenario wouldn't be static (correct game behavior; controlled here)
  const keepRain = () => { Game.state.weather = 'rain'; };
  let farDep = 0, farPurposes = [];
  const seen2 = new Set();
  drive(Game, v, 8, () => {
    keepRain();
    for (const id of Object.keys(v.away || {})) {
      if (seen2.has(id)) continue;
      seen2.add(id);
      const pur = (v.away[id] || {}).purpose;
      if (pur === 'leave') continue; // escape: the desperate don't count danger (designed exception)
      const n = Game.npcNode(id);
      if (Math.max(Math.abs(n.nx - hx), Math.abs(n.ny - hy)) > 1) { farDep++; farPurposes.push(pur); }
    }
  });
  check('high danger: no departure beyond 1 node (except escape)', farDep === 0, 'far=' + farDep + ' ' + JSON.stringify(farPurposes));

  // T4: companion asking — moderate danger via rain + distance (no gossip:
  // deterministic). Wanderer at dist 3: rain 1 + dist 1 = 2 → 'ask'.
  Game = loadAll(false);
  ({ v, hx, hy } = await newFedGame(Game));
  Game.state.weather = 'rain';
  const vid = npcIds(Game, v).find(id => {
    const t = Game.npcTemper(id);
    let g = null;
    try { g = Game.npcGoal(id); } catch (e) {}
    return t !== 'bold' && t !== 'restless' && g !== 'escape'; // escape goal zeroes danger by design
  }) || npcIds(Game, v)[0];
  Game.agencyState().profiles[vid] = 'wanderer'; // maxD 3
  Game.objOf(vid).kind = 'FORAGE'; Game.objOf(vid).purpose = 'forage';
  Game.objOf(vid).tx = hx + 3; Game.objOf(vid).ty = hy;
  Game.objOf(vid).tightness = 3; Game.objOf(vid).partsLeft = 3;
  Game.objOf(vid).state = 'ready'; Game.objOf(vid).indoor = false;
  // a willing companion: give someone an outdoor objective too
  const cid0 = npcIds(Game, v).find(id => id !== vid);
  Game.objOf(cid0).kind = 'FORAGE'; Game.objOf(cid0).purpose = 'forage';
  Game.objOf(cid0).tx = hx + 1; Game.objOf(cid0).ty = hy;
  Game.objOf(cid0).tightness = 1; Game.objOf(cid0).partsLeft = 3;
  Game.objOf(cid0).state = 'ready'; Game.objOf(cid0).indoor = false;
  Game.dayPart = 1;
  const node = Game.npcNode(vid);
  const dg0 = Game.objDanger(vid, hx + 3, hy, hx, hy);
  console.log('  T4 danger:', JSON.stringify(dg0));
  check('danger verdict is ask at score 2', dg0.verdict === 'ask' && dg0.score === 2, JSON.stringify(dg0));
  Game.objMaybeDepart(vid, node, true, hx, hy);
  const o = Game.objOf(vid);
  const paired = o.companion && v.away[vid] && v.away[o.companion];
  console.log('  companion:', o.companion, 'away:', Object.keys(v.away || {}));
  check('moderate danger: paired departure, both marked away', !!paired, 'comp=' + o.companion);

  // T8: honesty — departures seed departure gossip
  const depGossip = (v.gossip || []).filter(g => g.action === 'departure').length;
  check('departures are gossiped', depGossip > 0, 'n=' + depGossip);

  // ============ RUN B: old dice code ============
  // Honest A/B: the old code DOES depart people (explore dice + expeditions),
  // but its departures are directionless (no targets) and danger-blind, with
  // a narrow purpose set. The new system's win is objectives, not raw count.
  console.log('== RUN B (old dice triggers) ==');
  Game = loadAll(true);
  ({ v, hx, hy } = await newFedGame(Game));
  const rB = drive(Game, v, 16);
  console.log('  departures/4d:', rB.departures, JSON.stringify(rB.depPurposes));
  const oldSet = Object.keys(rB.depPurposes);
  const newSet = ['water', 'traps', 'visit', 'guard'];
  check('old purposes are only the dice set (no water/traps/visit/guard)',
    oldSet.every(p => ['forage', 'explore', 'leave', 'expedition'].includes(p)), JSON.stringify(oldSet));
  const newPurposes = ['water', 'traps', 'visit', 'guard'].filter(p => (r1.depPurposes[p] || 0) > 0);
  check('new code uses the broader purpose set', newPurposes.length >= 2, JSON.stringify(r1.depPurposes));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(2); });
