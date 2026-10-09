#!/usr/bin/env node
// sim-harness.js — THE shared node harness for world sims (Steve 2026-10-09).
// Every sim script must require this instead of copying the eval boilerplate.
// (The idle-village sim's evidence lists 4 bugs that were pure harness
// mistakes, not game bugs — one shared module kills that whole class.)
//
// Usage:
//   const { loadGame, runDays } = require('./sim-harness');
//   const { Game, manifest } = await loadGame({ seed: 42, mode: 'mvc', fullTelemetry: true });
//   const result = await runDays(Game, policy, { days: 365, manifest });
//   // result: { days, endReason, telemetry, samples, ms, manifest }
//
// Rules (AGENTS.md, hard-won):
// - mulberry32 seeded BEFORE eval — modules capture Math.random at load.
// - Full src/js list in index.html order, minus DOM-only
//   (app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js).
// - window stubbed for eval, then deleted (else combat goes async and stalls).
// - Never run two harnesses concurrently in one process (shared transform
//   state + fixture state) — sweep.js runs seeds sequentially.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function gitCommit() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
  } catch (e) { return 'unknown'; }
}

function manifest(seed, mode) {
  return {
    seed: seed,
    commit: gitCommit(),
    mode: mode || '?',
    date: new Date().toISOString().slice(0, 10),
    node: process.version,
  };
}

// loadGame({seed, mode, fullTelemetry}) -> { Game, manifest }
// fullTelemetry sets TELEMETRY_FULL=1 so Game.tele() keeps the whole stream
// (production keeps the 300-event ring cap — memory).
async function loadGame(opts) {
  opts = opts || {};
  const seed = opts.seed != null ? opts.seed : 20261009;
  const mode = opts.mode || '?';
  if (opts.fullTelemetry) process.env.TELEMETRY_FULL = '1';

  Math.random = mulberry32(seed);

  global.fetch = (f) => Promise.resolve({
    json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')))
  });

  const order = execSync(`grep -o 'src/js/[^"'"'"']*\\.js' index.html | head -80`, { cwd: ROOT })
    .toString().split('\n')
    .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));

  global.window = global;
  const loadFails = [];
  order.forEach(f => {
    try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
    catch (e) { loadFails.push(f + ': ' + e.message); }
  });
  delete global.window;

  const Game = globalThis.Scattering.Game;
  // Silence narration/audio/drama for sims — telemetry + state carry the signal.
  Game.say = function () {};
  Game.sysSay = function () {};
  Game.audioEvent = function () {};
  if (Game.drama === undefined) Game.drama = function () {};

  await Game.init();
  return { Game, manifest: manifest(seed, mode), loadFails };
}

// Standard new-game setup shared by sims: generate roster, start, depart.
async function setupGame(Game, place, rosterId) {
  place = place || 'Columbus, Ohio';
  Game.genRoster(place);
  const rid = rosterId != null ? rosterId : Game.generatedRoster[0].id;
  Game.newGame(place, null, rid);
  Game.depart();
}

// runDays(Game, policy, opts) — the shared day loop.
// policy: { id, setup?(Game, ctx), upkeep?(Game, ctx), daily?(Game, ctx),
//           fight?(Game, ctx), contest?(Game, ctx) }
// opts: { days, manifest, sampleEvery }
// Returns { days, endReason, telemetry, samples, ms, manifest, policyId }.
// Telemetry comes from Game.state.telemetry (full stream when
// TELEMETRY_FULL=1); samples are daily [day, value] curves.
async function runDays(Game, policy, opts) {
  opts = opts || {};
  const days = opts.days || 365;
  const sampleEvery = opts.sampleEvery || 1;
  const ctx = { policyId: policy.id, notes: [] };
  const t0 = Date.now();

  const samples = { pop: [], pantry: [], knowledge: [], trust: [], deaths: [], villagers: [] };
  // VILLAGER SNAPSHOT (coverage 2026-10-09): per-villager differentiation —
  // are villagers becoming different people? Captured every 30 loop-days:
  // occupation/profile, held abilities, agency XP tracks, key life stats.
  const villagerSnapshot = () => {
    try {
      const v = Game.state.village || {};
      const out = [];
      for (const vid of (v.roster || [])) {
        let person = null, ag = null;
        try { person = Game.getPerson ? Game.getPerson(vid) : null; } catch (e) {}
        try { ag = Game.agencyOf ? Game.agencyOf(vid) : null; } catch (e) {}
        const axp = ((ag || {}).xp || {})[vid] || {};
        const astats = ((ag || {}).stats || {})[vid] || {};
        out.push({
          vid: String(vid).slice(0, 12),
          occ: (person && (person.occupationId || person.formerOccupation)) || '?',
          profile: ((ag && ag.profiles && ag.profiles[vid]) || '?'),
          abilities: ((v.npcAbilities || {})[vid] || []).slice(),
          xp: { t: axp.tracking || 0, s: axp.survival || 0, b: axp.bravery || 0 },
          kills: astats.monsterKills || 0, exped: astats.expeditions || 0,
        });
      }
      return out;
    } catch (e) { return []; }
  };
  const pop = () => ((Game.state.village || {}).roster || []).length;
  const pantryKcal = () => {
    try {
      return ((Game.state.village || {}).pantry || [])
        .reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
    } catch (e) { return 0; }
  };
  const knownPlants = () => {
    try { return Object.keys((Game.state.codex || {}).plants || {}).length; }
    catch (e) { return 0; }
  };
  const trustStats = () => {
    try {
      const tr = Object.values((Game.state.village || {}).trust || {});
      if (!tr.length) return null;
      const mean = tr.reduce((a, b) => a + b, 0) / tr.length;
      return { mean: +mean.toFixed(1), min: Math.min.apply(null, tr), n: tr.length };
    } catch (e) { return null; }
  };

  if (policy.setup) { try { await policy.setup(Game, ctx); } catch (e) { ctx.notes.push('setup: ' + e.message); } }

  let day;
  for (day = 1; day <= days; day++) {
    for (let p = 0; p < 3; p++) {
      if (policy.upkeep) { try { policy.upkeep(Game, ctx); } catch (e) {} }
      driveFights(Game, policy, ctx);
      driveContests(Game, policy, ctx);
      if (Game.over) break;
      try { Game.tickAction(128); } catch (e) {}
      if (Game.over) break;
    }
    if (Game.over) break;
    if (policy.daily) { try { policy.daily(Game, ctx); } catch (e) {} }
    try { Game.sleep(); } catch (e) {}
    driveContests(Game, policy, ctx);
    if (Game.over) break;
    if (day % sampleEvery === 0) {
      samples.pop.push([day, pop()]);
      samples.pantry.push([day, Math.round(pantryKcal())]);
      samples.knowledge.push([day, knownPlants()]);
      const ts = trustStats();
      samples.trust.push([day, ts ? ts.mean : null]);
      if (day % 30 === 0) samples.villagers.push([day, villagerSnapshot()]);
    }
    if (pop() === 0) break;
  }

  // Deaths also come from the telemetry stream; keep a compact list here.
  try {
    for (const ev of (Game.state.telemetry || [])) {
      if (ev.type === 'death') samples.deaths.push({ day: ev.day, kind: ev.kind, who: ev.who, cause: ev.cause });
    }
  } catch (e) {}
  // Final villager snapshot (coverage 2026-10-09): short runs never reach
  // the 30-day cadence — always capture the end state for differentiation.
  try { samples.villagers.push([day > days ? days : day, villagerSnapshot()]); } catch (e) {}

  const endReason = Game.over
    ? (Game.villageLost ? 'village-lost' : 'over-other')
    : (day > days ? 'survived' : 'pop-zero');

  // End-state learned sets (coverage 2026-10-09): unioned across runs, these
  // answer "which skills/plants were NEVER learned". Cheaper than tele events.
  let learnedPlants = [], learnedSkills = [];
  try { learnedPlants = Object.keys((Game.state.codex || {}).plants || {}); } catch (e) {}
  try { learnedSkills = Object.keys((Game.state.codex || {}).skills || {}); } catch (e) {}
  let gameDays = 0;
  try { gameDays = Game.state.scholar.day || 0; } catch (e) {}

  return {
    days: day > days ? days : day,
    gameDays,
    endReason,
    telemetry: Game.state.telemetry || [],
    samples,
    learnedPlants, learnedSkills,
    ms: Date.now() - t0,
    manifest: opts.manifest || manifest('?', policy.id),
    policyId: policy.id,
    notes: ctx.notes,
  };
}

// Default fight driver: strike nearest live monster on the player's turn.
// Policies override via policy.fight(Game, ctx) returning true when handled.
function driveFights(Game, policy, ctx) {
  let guard = 0, still = 0, lastSig = '';
  // NO-PROGRESS BREAK (coverage 2026-10-09): a policy no-op that never
  // advances the fight (e.g. out-of-range strikes) used to spin 200× while
  // the game clock froze. Break when the fight state stops changing.
  const sig = () => {
    try {
      const f = Game.tbfight;
      if (!f) return 'none';
      return f.turnIdx + ':' + f.fighters.map(x => Math.round(x.hp || 0)).join(',') + ':' + (f.over ? 1 : 0);
    } catch (e) { return 'err'; }
  };
  while (Game.tbfight && !Game.tbfight.over && guard++ < 200) {
    if (Game.over) break;
    if (policy.fight) {
      let handled = false;
      try { handled = policy.fight(Game, ctx); } catch (e) {}
      if (handled) continue;
    }
    const tgt = Game.tbfight.fighters.find(x => x.kind === 'monster' && (x.hp || 0) > 0);
    if (tgt && Game.tbIsPlayerTurn()) {
      try { Game.tbPlayerStrike(tgt.key); } catch (e) {}
    }
    if (!Game.tbfight || Game.tbfight.over) break;
    if (Game.tbIsPlayerTurn()) {
      try {
        const p = Game.tbFighter('p');
        p.moveLeft = 0; p.acted = true;
        Game.tbAfterPlayerAction();
      } catch (e) { break; }
    } else break;
    const s = sig();
    if (s === lastSig) { if (++still > 10) { ctx.notes.push('driveFights: no progress for 10 rounds, breaking'); break; } }
    else { still = 0; lastSig = s; }
  }
}

// Default contest driver: pick choice 0 until the contest clears.
// Policies override via policy.contest(Game, ctx) returning true when handled.
function driveContests(Game, policy, ctx) {
  let guard = 0;
  while (Game.state.activeContest && guard++ < 400) {
    driveFights(Game, policy, ctx);
    if (Game.over) break;
    if (policy.contest) {
      let handled = false;
      try { handled = policy.contest(Game, ctx); } catch (e) {}
      if (handled) continue;
    }
    try {
      if (Game.state.activeContest && !(Game.tbfight && !Game.tbfight.over)) {
        Game.contestChoose(0);
      }
    } catch (e) { break; }
    if (Game.over) break;
  }
  driveFights(Game, policy, ctx);
  if (Game.pendingEncounter && Game.pendingMonsterId) {
    try {
      const mid = Game.pendingMonsterId;
      Game.pendingEncounter = false; Game.pendingMonsterId = null;
      Game.startCombat(mid);
      driveFights(Game, policy, ctx);
    } catch (e) {}
  }
}

module.exports = { mulberry32, loadGame, setupGame, runDays, manifest, driveFights, driveContests, ROOT };
