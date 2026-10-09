#!/usr/bin/env node
// IDLE-VILLAGE SIM (Steve 2026-10-09): "what happens when the player character
// does nothing but bare minimum? Is the village capable of winning the game
// with a competent group? How long do sims like that tend to last?"
//
// MODES (MODE env):
//   'zero'   — pure freeloader control: eat, sleep, nothing else. Verifies
//              whether the exile system fires on freeloaders.
//   'mvc'    — minimum viable contribution: eat fair share, sleep, and when
//              the takes/gives ledger slips below -2000, do ONE honest forage
//              trip (exit, forage nearest green, donate the haul) — nothing more.
//   'leader' — the player does no personal work but each dawn assigns every
//              free villager to forage (the actual minimum leadership).
//
// Harness: mulberry32 seeded BEFORE eval, full src/js list in index.html order
// minus DOM-only files + drama.js, window stubbed for eval then deleted.
// Read docs/CANON.md before touching this area.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261009', 10);
const MODE = process.env.MODE || 'mvc';
Math.random = mulberry32(SEED);
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'\"'\"']*\\.js' index.html | head -80", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); } });
delete global.window;
const Game = globalThis.Scattering.Game;
Game.say = function () {};
Game.sysSay = function () {};
Game.audioEvent = function () {};
if (Game.drama === undefined) Game.drama = function () {};

const M = {
  seed: SEED, mode: MODE,
  roster: [],
  days: 0, endReason: null,
  popCurve: [], pantryCurve: [],
  deaths: [],
  pantryIn: { assignment: 0, autonomous: 0, other: 0 },
  pantryInEvents: { assignment: 0, autonomous: 0, other: 0 },
  playerTakes: 0, playerGives: 0,
  playerForageKcal: 0, playerForageTrips: 0,
  exiles: [], theftChecks: 0,
  contests: [], contestChoices: 0, arenaFights: 0,
  villagerDeathsByMonster: 0,
  assignments: {},
  abilitySamples: [],
  trustFloor: 99, trustEnd: null,
};

function classifyStockSource() {
  const st = new Error().stack || '';
  if (/resolveOneAssignment/.test(st)) return 'assignment';
  if (/villageLives|npcTakeAction/.test(st)) return 'autonomous';
  return 'other';
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  const v = Game.state.village;
  for (const id of (v.roster || [])) {
    const p = Game.getPerson(id) || {};
    const occ = String(p.formerOccupation || '').toLowerCase();
    M.roster.push({
      id, name: p.name || id, occ: p.formerOccupation || '?', age: p.age || '?',
      temperament: (p.personality || {}).temperament || '?',
      sharing: (p.personality || {}).sharing || '?',
      healerish: /medic|doctor|nurse|herbalist|paramedic|surgeon/.test(occ),
      foodish: /hunter|fisher|forager|trapper|farmer|cook|chef|butcher|angler|gather/.test(occ),
      abilityWeights: p.abilityWeights || {},
    });
  }

  const origRemove = Game.removeVillager.bind(Game);
  Game.removeVillager = function (vid, how) {
    const p = Game.getPerson(vid) || {};
    M.deaths.push({ day: Game.state.scholar.day, vid, name: p.name || vid, how: how || '?' });
    return origRemove(vid, how);
  };
  const origStock = Game.stockPantry.bind(Game);
  Game.stockPantry = function (kcal, name, opts) {
    const src = classifyStockSource();
    M.pantryIn[src] += (kcal || 0);
    M.pantryInEvents[src] += 1;
    return origStock(kcal, name, opts);
  };
  const origExile = Game.exilePlayer.bind(Game);
  Game.exilePlayer = function (how) {
    M.exiles.push({ day: Game.state.scholar.day, who: Game.villagerId, how: how || '?' });
    return origExile(how);
  };
  const origCI = Game.contestInterruption.bind(Game);
  Game.contestInterruption = function (contest, pids) {
    const ids = Array.isArray(pids) ? pids : [pids];
    M.contests.push({ day: Game.state.scholar.day, id: (contest && contest.id) || '?', participants: ids.length, playerIn: ids.includes('player') || ids.includes(Game.villagerId) });
    return origCI(contest, pids);
  };
  const origTC = Game.theftConfrontation ? Game.theftConfrontation.bind(Game) : null;
  if (origTC) Game.theftConfrontation = function (t) { M.theftChecks++; return origTC(t); };
  const origResolveOne = Game.resolveOneAssignment ? Game.resolveOneAssignment.bind(Game) : null;
  if (origResolveOne) Game.resolveOneAssignment = function (vid, a) {
    const t = (a && a.task) || '?';
    M.assignments[t] = (M.assignments[t] || 0) + 1;
    return origResolveOne(vid, a);
  };
  const origRD = Game.registerDeath ? Game.registerDeath.bind(Game) : null;
  if (origRD) Game.registerDeath = function (rec) {
    if (rec && rec.kind === 'villager' && /monster|maul|bite|claw|beast/i.test(rec.cause || '')) M.villagerDeathsByMonster++;
    return origRD(rec);
  };

  const pantryKcal = () => (Game.state.village.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
  const pop = () => (Game.state.village.roster || []).length;

  function playerEat() {
    const s = Game.state.scholar, vv = Game.state.village;
    if (s.kcal < Game.kcalCap() * 0.85) {
      let guard = 0;
      while (s.kcal < Game.kcalCap() * 0.95 && (vv.pantry || []).length && guard++ < 20) {
        try { Game.takeFromPantry(0); } catch (e) { break; }
      }
      try { Game.eat(); } catch (e) {}
    }
  }

  function ledger() {
    const vv = Game.state.village, vid = Game.villagerId;
    M.playerTakes = ((vv.takes || {})[vid]) || 0;
    M.playerGives = ((vv.gives || {})[vid]) || 0;
    const tr = ((vv.trust || {})[vid]);
    if (tr !== undefined) { M.trustFloor = Math.min(M.trustFloor, tr); M.trustEnd = tr; }
    return M.playerGives - M.playerTakes;
  }

  // Honest forage trip: travel to nearest stocked wild tile, forage, donate
  // ONLY the new haul, travel back. (Haven grounds have no stock — by design.)
  function forageTrip() {
    const s = Game.state.scholar;
    try {
      const before = new Map((s.inventory || []).map(i => [(i.name + '|' + (i.plantId || '')), (i.units || 0)]));
      // nearest reachable wild tile with stock (from real travel targets)
      let bx = null, by = null, bd = 99;
      for (const tt of (Game.travelTargets() || [])) {
        const t = Game.tileAt(tt.x, tt.y);
        if (!t || t.type === 'haven' || t.type === 'ruin' || (t.stock || 0) <= 0) continue;
        if (tt.d < bd) { bd = tt.d; bx = tt.x; by = tt.y; }
      }
      if (bx === null) return 0;
      const hx = Game.map.px, hy = Game.map.py;
      Game.travelTo(bx, by);
      if (Game.over || Game.tbfight) { try { Game.travelTo(hx, hy); } catch (e) {} return 0; }
      const invBefore = (s.inventory || []).length;
      const kcalBefore = (s.inventory || []).reduce((t, i) => t + ((i.kcalEach || 0) * (i.units || 1)), 0);
      try { Game.doAction('forage', {}); } catch (e) {}
      const kcalAfter = (s.inventory || []).reduce((t, i) => t + ((i.kcalEach || 0) * (i.units || 1)), 0);
      if (process.env.TRIP_DEBUG) console.log(`TRIP day=${Game.state.scholar.day} tile=${bx},${by} stock=${(Game.tileAt(bx,by)||{}).stock} inv ${invBefore}->${(s.inventory||[]).length} kcal ${kcalBefore}->${kcalAfter}`);
      let haul = 0;
      const inv = s.inventory || [];
      for (let i = inv.length - 1; i >= 0; i--) {
        const key = inv[i].name + '|' + (inv[i].plantId || '');
        const had = before.get(key) || 0;
        const now = inv[i].units || 0;
        if (now > had && (inv[i].kcalEach || 0) > 0 && inv[i].edible !== false) {
          haul += (inv[i].kcalEach || 0) * (now - had);
          try { Game.donateToPantry(i); } catch (e) {}
        }
      }
      M.playerForageKcal += haul;
      M.playerForageTrips++;
      try { Game.travelTo(hx, hy); } catch (e) {}
      return haul;
    } catch (e) { try { Game.travelTo(hx, hy); } catch (e2) {} return 0; }
  }

  function upkeep() {
    playerEat();
    const net = ledger();
    if (MODE === 'mvc' && !upkeep._mvcDone && net < -2000) {
      upkeep._mvcDone = true;
      forageTrip();
    }
    if (MODE === 'leader' && !upkeep._leadDone) {
      upkeep._leadDone = true;
      const vv = Game.state.village;
      for (const id of (vv.roster || [])) {
        if (id === Game.villagerId) continue;
        if ((vv.assignments || {})[id]) continue;
        try { Game.assignTask(id, 'forage'); } catch (e) {}
      }
    }
  }

  function endTurnFight() {
    if (!Game.tbfight || Game.tbfight.over) return;
    if (!Game.tbIsPlayerTurn()) return;
    const p = Game.tbFighter('p');
    p.moveLeft = 0; p.acted = true;
    Game.tbAfterPlayerAction();
  }
  function driveFights() {
    // auto-fight any live tactical fight (monster encounters on trips, arena, etc.)
    let guard = 0;
    while (Game.tbfight && !Game.tbfight.over && guard++ < 200) {
      const tgt = Game.tbfight.fighters.find(x => x.kind === 'monster' && (x.hp || 0) > 0);
      if (tgt && Game.tbIsPlayerTurn()) {
        try { Game.tbPlayerStrike(tgt.key); } catch (e) {}
        M.arenaFights++;
      }
      endTurnFight();
      if (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn()) break;
      if (Game.over) break;
    }
  }
  function driveContests() {
    let guard = 0;
    while (Game.state.activeContest && guard++ < 400) {
      driveFights();
      try {
        if (Game.state.activeContest && !(Game.tbfight && !Game.tbfight.over)) {
          M.contestChoices++;
          Game.contestChoose(0);
        }
      } catch (e) { break; }
      if (Game.over) break;
    }
    driveFights();
    // pendingEncounter modal (wanderer): face it — startCombat via the honest path
    if (Game.pendingEncounter && Game.pendingMonsterId) {
      try {
        const mid = Game.pendingMonsterId;
        Game.pendingEncounter = false; Game.pendingMonsterId = null;
        Game.startCombat(mid);
        driveFights();
      } catch (e) {}
    }
  }

  function sampleAbilities(day) {
    let total = 0, max = 0, gear = 0, n = 0;
    const perVillager = [];
    for (const id of (Game.state.village.roster || [])) {
      const p = Game.getPerson(id) || {};
      const ab = p.abilities;
      const c = Array.isArray(ab) ? ab.length : (ab ? Object.keys(ab).length : 0);
      total += c; max = Math.max(max, c); n++;
      perVillager.push({ name: (p.name || id).split(' ')[0], ab: c });
      const items = p.items || [];
      gear += items.filter(i => i && (i.equipped || /weapon|blade|bow|armor|tool/i.test(i.name || ''))).length;
    }
    perVillager.sort((a, b) => b.ab - a.ab);
    M.abilitySamples.push({ day, n, avgAb: n ? +(total / n).toFixed(2) : 0, maxAb: max, gear, top: perVillager.slice(0, 3) });
  }

  const t0 = Date.now();
  let day;
  for (day = 1; day <= 365; day++) {
    upkeep._mvcDone = false; upkeep._leadDone = false;
    M.days = day;
    for (let p = 0; p < 3; p++) {
      upkeep();
      driveContests();
      if (Game.over) break;
      Game.tickAction(128);
      if (Game.over) break;
    }
    if (Game.over) break;
    upkeep();
    try { Game.sleep(); } catch (e) {}
    driveContests();
    if (Game.over) break;
    M.popCurve.push([day, pop()]);
    M.gameDay = Game.state.scholar.day;
    if (Game.tbfight && !Game.tbfight.over) {
      M.stuckFight = (M.stuckFight || 0) + 1;
      if (M.stuckFight === 1) {
        const f = Game.tbfight;
        M.stuckFightInfo = {
          day: Game.state.scholar.day,
          fighters: f.fighters.map(x => ({ key: x.key, hp: Math.round(x.hp || 0), acted: !!x.acted, isMonster: !!Game.modIs(x) })),
          isPlayerTurn: Game.tbIsPlayerTurn(),
          pendingEncounter: !!Game.pendingEncounter,
          activeContest: !!Game.state.activeContest,
        };
      }
    }
    M.pantryCurve.push([day, Math.round(pantryKcal())]);
    if (pop() === 0) break;
    if (day % 30 === 0) sampleAbilities(day);
  }
  M.ms = Date.now() - t0;
  M.endReason = Game.over
    ? (Game.villageLost ? 'village-lost' : 'over-other')
    : (day > 365 ? 'survived-year' : 'pop-zero');
  if (pop() === 0 && !Game.over) M.endReason = 'pop-zero';
  ledger();
  sampleAbilities(Math.min(day, 365));
  const causes = {};
  for (const d of M.deaths) causes[d.how] = (causes[d.how] || 0) + 1;
  M.deathCauses = causes;
  // compact curves for output
  M.popCurve = M.popCurve.filter((_, i) => i % 5 === 0 || i === M.popCurve.length - 1);
  M.pantryCurve = M.pantryCurve.filter((_, i) => i % 5 === 0 || i === M.pantryCurve.length - 1);

  console.log(JSON.stringify(M));
})();
