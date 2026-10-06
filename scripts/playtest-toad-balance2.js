#!/usr/bin/env node
// Choir Toad (belltoad) balance + feel sim — post-598f45d chorus/pack fix.
// Headless combat sim with a COMPETENT player bot (knowledgeable player):
//   - dodges announced burst cells; when any toad swells, retreats from ALL toads
//   - SHOUTs (max 2/fight) to break a swelling chorus with 2+ toads alive
//   - strikes nearest toad in weapon range
// Loadouts: fist (unarmed), spear (fire-hardened spear), machete.
// Measures: win/loss/soft-lock, rounds, stun procs, chorus arrival pacing,
// damage spikes, player-death rate, audio hook counts.
// Usage: node scripts/playtest-toad-balance2.js [seedsPerLoadout] [--narrate SEED]
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const LOADOUTS = {
  fist:    { weapon: null, bonus: 0, range: 1 },
  spear:   { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' }, bonus: 15, range: 2 },
  machete: { weapon: { itemId: 'machete', name: 'Machete' }, bonus: 35, range: 1 },
};

function audioCounters() {
  const c = { belltoadCroak: 0, belltoadChorus: 0, belltoadStun: 0 };
  Game.audio = {
    belltoadCroak() { c.belltoadCroak++; },
    belltoadChorus() { c.belltoadChorus++; },
    belltoadStun() { c.belltoadStun++; },
  };
  return c;
}

function setup(loadoutName) {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game._pendingPack = null;
  Game.debugScenario('choir');
  const L = LOADOUTS[loadoutName];
  const s = Game.state.scholar;
  s.health = 100;
  s.equipped = L.weapon ? { weapon: L.weapon } : {};
  // player one tile from the first toad, like the scenario intends
  s.mx = s.monster.mx + 1; s.my = s.monster.my;
  Game.canSee = () => true;
  for (let i = 0; i < 8 && !Game.tbfight; i++) Game.monsterTurn();
  Game.audio = null;
}

function liveToads() {
  return Game.tbfight.fighters.filter(x => x.kind === 'monster' && x.alive && !x.fled &&
    x.mdef && x.mdef.id === 'belltoad');
}

// announced burst cells only (what the player actually sees telegraphed)
function announcedCells() {
  const set = new Set();
  for (const t of liveToads()) {
    if (t.telegraph && t.telegraph.cells) {
      for (const c of t.telegraph.cells) set.add(c.cx + ',' + c.cy);
    }
  }
  return set;
}

function walkable(x, y) {
  if (x < 0 || x > 8 || y < 0 || y > 8) return false;
  const d = Game.genDetail(Game.map.px, Game.map.py);
  const cell = d[y] && d[y][x];
  return !Game.cellProps(cell).blocks;
}

function botTurn(loadoutName, narrate) {
  const tf = Game.tbfight;
  if (!tf || !Game.tbIsPlayerTurn()) return false;
  const p = Game.tbFighter('p');
  if (!p || !p.alive) return false;
  const L = LOADOUTS[loadoutName];
  if (p.acted) { Game.tbPlayerEndTurn(); return true; }
  if (p.stunned > 0) { // engine already spent the turn; close it out
    Game.tbPlayerEndTurn(); return true;
  }
  const toads = liveToads();
  if (!toads.length) { Game.tbPlayerEndTurn(); return true; }

  // 1. SHOUT: break a swelling chorus (2+ toads alive, someone telegraphing)
  const f = Game.tbfight;
  const telegraphing = toads.some(t => t.telegraph);
  if (telegraphing && toads.length >= 2 && (f.shouts || 0) < 2) {
    if (Game.tbPlayerShout()) return true;
  }

  // 2. DODGE (brave): only step out of ANNOUNCED burst cells — a real player
  // stands their ground otherwise. Prefer cells still in strike range.
  const announced = announcedCells();
  const inDanger = announced.has(p.mx + ',' + p.my);
  if (inDanger && p.moveLeft > 0) {
    let best = null, bestScore = -1e9;
    for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
      const nx = p.mx + dx, ny = p.my + dy;
      if (!walkable(nx, ny)) continue;
      if (Game.tbBlocked && Game.tbBlocked(nx, ny)) continue;
      const occ = tf.fighters.some(o => o.alive && !o.fled && o.mx === nx && o.my === ny && o.key !== 'p');
      if (occ) continue;
      const key = nx + ',' + ny;
      let score = announced.has(key) ? -100 : 0;
      const nearest = Math.min(...toads.map(t => Math.max(Math.abs(t.mx - nx), Math.abs(t.my - ny))));
      score += nearest <= L.range ? 20 : -nearest * 2;
      if (score > bestScore) { bestScore = score; best = [nx, ny]; }
    }
    if (best) Game.tbPlayerMove(best[0], best[1]);
  }

  // 3. close to weapon range and strike
  const foe = toads.slice().sort((a, b) =>
    Math.max(Math.abs(a.mx - p.mx), Math.abs(a.my - p.my)) -
    Math.max(Math.abs(b.mx - p.mx), Math.abs(b.my - p.my)))[0];
  const dist = Math.max(Math.abs(foe.mx - p.mx), Math.abs(foe.my - p.my));
  if (!p.acted && dist <= L.range) Game.tbPlayerStrike(foe.key);
  let guard = 0;
  while (Game.tbfight && Game.tbIsPlayerTurn() && !p.acted && p.moveLeft > 0 && guard++ < 8) {
    const path = Game.findPath(p.mx, p.my, foe.mx, foe.my);
    if (!path || !path.length) break;
    const steps = Math.min(path.length - 1, p.moveLeft, 3);
    if (steps <= 0) break;
    const [tx, ty] = path[steps - 1];
    if (!Game.tbPlayerMove(tx, ty)) break;
    const d2 = Math.max(Math.abs(foe.mx - p.mx), Math.abs(foe.my - p.my));
    if (d2 <= L.range) Game.tbPlayerStrike(foe.key);
  }
  if (Game.tbfight && Game.tbIsPlayerTurn()) {
    if (!p.acted) Game.tbPlayerStudy(); else Game.tbPlayerEndTurn();
  }
  return true;
}

function runFight(loadoutName, narrate) {
  setup(loadoutName);
  const audio = audioCounters();
  const log0 = Game.log.length;
  const st = {
    result: null, rounds: 0, playerHpEnd: 0, dmgTaken: 0, croakHits: 0,
    stuns: 0, choruses: 0, chorusMults: [], maxToads: 0, arrivals: [],
    maxRoundDmg: 0, strikes: 0, playerKills: 0, shouts: 0, telegraphs: 0,
    guard: false, crash: null,
  };
  let hpStart = Game.state.scholar.health;
  let roundDmg = 0, lastRound = 0, lastHp = hpStart;
  const toadKeys0 = new Set(Game.tbfight.fighters.filter(x => x.kind === 'monster').map(x => x.key));
  let lastF = null;
  try {
    let guard = 0;
    while (Game.tbfight && guard++ < 300) {
      const f = Game.tbfight;
      lastF = f;
      // sample HP BEFORE the round-boundary reset (damage+round-change can
      // happen inside one tbAdvance — sampling after the reset loses it)
      const hpNow = Game.state.scholar.health;
      if (hpNow < lastHp) { roundDmg += lastHp - hpNow; lastHp = hpNow; }
      else if (hpNow > lastHp) { lastHp = hpNow; } // healing (patch-ups)
      if (f.round !== lastRound) {
        lastRound = f.round;
        st.maxRoundDmg = Math.max(st.maxRoundDmg, roundDmg);
        roundDmg = 0;
      }
      const nt = liveToads().length;
      for (const x of Game.tbfight.fighters) {
        if (x.kind === 'monster' && x.mdef && x.mdef.id === 'belltoad' && !toadKeys0.has(x.key)) {
          toadKeys0.add(x.key); st.arrivals.push(f.round);
        }
      }
      st.maxToads = Math.max(st.maxToads, nt);
      const cur = Game.tbCurrent();
      if (!cur) break;
      if (cur.kind === 'player') {
        if (!botTurn(loadoutName, narrate)) break;
      } else {
        Game.tbAdvance();
      }
      if (!Game.tbfight) break;
    }
    st.guard = guard >= 300 && !!Game.tbfight;
    if (lastF && lastF.result) st.result = lastF.result;
    if (process.env.DUMP_STALL && st.guard && Game.tbfight) {
      const f = Game.tbfight;
      console.log(`STALL DUMP [${loadoutName}]: round=${f.round} over=${f.over} result=${f.result}`);
      console.log('  fighters:', f.fighters.map(x => `${x.kind}/${x.key}@${x.mx},${x.my} alive=${x.alive} fled=${x.fled} hp=${x.hp} mdef=${x.mdef && x.mdef.id}`).join(' | '));
      console.log('  pendingPack:', JSON.stringify(Game._pendingPack && { id: Game._pendingPack.id, count: Game._pendingPack.count }));
      console.log('  order:', f.order.join(','), 'turnIdx:', f.turnIdx);
      const tail = Game.log.slice(-8);
      for (const l of tail) console.log('  LOG: ' + l.slice(0, 120));
    }
  } catch (e) {
    st.crash = e.message + '\n' + e.stack.split('\n').slice(0, 5).join('\n');
    st.result = 'crash';
  }
  // parse the fight log (robust patterns only; HP tracked by sampling above)
  const lines = Game.log.slice(log0);
  for (const l of lines) {
    const m = l.match(/\(chorus ×(\d+)\)/);
    if (m) { st.choruses++; st.chorusMults.push(+m[1]); }
    if (/You cup your hands and BELLOW/.test(l)) st.shouts++;
    if (/You STRIKE/.test(l)) st.strikes++;
    if (l.startsWith('⚠')) st.telegraphs++;
  }
  st.stuns = audio.belltoadStun; // fires exactly when a stun lands on the player
  st.maxRoundDmg = Math.max(st.maxRoundDmg, roundDmg);
  st.rounds = lastRound;
  st.playerHpEnd = Math.round(Game.state.scholar.health);
  st.hpLost = Math.round(hpStart - st.playerHpEnd);
  st.dmgTaken = st.hpLost;
  st.audio = audio;
  st.narration = narrate ? lines.filter(l =>
    /🐸|chorus|CHO|throat|swell|BELLOW|stun|ring|lose your turn|slack|SPENT|arrive|joins|quiet/i.test(l)
  ).map(l => l.slice(0, 130)) : [];
  return st;
}

(async () => {
  await Game.init();
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  const seeds = parseInt(process.argv[2] || '15', 10);
  const narrateSeed = process.argv.includes('--narrate') ? +process.argv[process.argv.indexOf('--narrate') + 1] : null;

  const results = {};
  for (const loadout of Object.keys(LOADOUTS)) {
    const arr = [];
    for (let s = 0; s < seeds; s++) {
      Math.randomSeed ? null : null;
      // reseed-ish: Math.random has no seed; fights vary by state anyway
      const st = runFight(loadout, narrateSeed === s && loadout === 'spear');
      arr.push(st);
      if (st.crash) { console.log(`CRASH seed ${s} [${loadout}]:\n${st.crash}`); }
    }
    results[loadout] = arr;
    const agg = { won: 0, lost: 0, routed: 0, fled: 0, guard: 0, other: 0 };
    for (const st of arr) {
      if (st.guard) { agg.guard++; continue; }
      if (st.result === 'won') agg.won++;
      else if (st.result === 'lost') agg.lost++;
      else if (st.result === 'routed') agg.routed++;
      else if (st.result === 'fled') agg.fled++;
      else agg.other++;
    }
    const avg = (f) => (arr.reduce((a, x) => a + (f(x) || 0), 0) / arr.length).toFixed(1);
    const max = (f) => Math.max(...arr.map(f));
    console.log(`\n=== ${loadout.toUpperCase()} (${seeds} seeds) ===`);
    console.log(`won=${agg.won} lost=${agg.lost} routed=${agg.routed} fled=${agg.fled} guard(soft-lock)=${agg.guard} other=${agg.other}`);
    console.log(`rounds avg=${avg(s => s.rounds)}  playerHpEnd avg=${avg(s => s.playerHpEnd)}  dmgTaken avg=${avg(s => s.dmgTaken)}`);
    console.log(`max single-round dmg to player: ${max(s => s.maxRoundDmg)}`);
    console.log(`stuns landed: total=${arr.reduce((a, s) => a + s.stuns, 0)} (avg/fight=${avg(s => s.stuns)})`);
    console.log(`choruses fired: total=${arr.reduce((a, s) => a + s.choruses, 0)} mults=[${arr.flatMap(s => s.chorusMults).join(',')}]`);
    console.log(`max simultaneous toads: ${max(s => s.maxToads)}  arrivals: ${JSON.stringify(arr.map(s => s.arrivals))}`);
    console.log(`shouts used avg=${avg(s => s.shouts)}  strikes avg=${avg(s => s.strikes)}  telegraphs seen avg=${avg(s => s.telegraphs)}`);
    console.log(`audio: croak=${arr.reduce((a, s) => a + s.audio.belltoadCroak, 0)} chorus=${arr.reduce((a, s) => a + s.audio.belltoadChorus, 0)} stun=${arr.reduce((a, s) => a + s.audio.belltoadStun, 0)}`);
  }

  if (narrateSeed !== null) {
    const st = results.spear[narrateSeed];
    console.log('\n================ NARRATED FIGHT (spear, seed ' + narrateSeed + ') ================');
    console.log(`result=${st.result} rounds=${st.rounds} hp ${100 - st.hpLost}→${st.playerHpEnd} stuns=${st.stuns} choruses=${st.choruses}`);
    for (const l of st.narration) console.log('  ' + l);
  }
  console.log('\nDONE');
})();
