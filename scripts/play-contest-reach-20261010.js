#!/usr/bin/env node
// ORGANIC REACHABILITY (Worker D, parity audit, 2026-10-10):
// 200-day organic runs measuring contest/show/summons fire rates, playability,
// villager participation, broadcast-frame hygiene, casting bias, fan clubs.
// Usage: node scripts/play-contest-reach-20261010.js <SEED> <FLAVOR> <DAYS> <OUT>
//   FLAVOR: competent | fame  (fame-seeker does recordMoment deeds regularly)
// Writes JSONL beats to OUT (default evidence/contest-reach-<seed>-<flavor>.jsonl).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.argv[2] || '424242', 10);
const FLAVOR = process.argv[3] || 'competent';
const DAYS = parseInt(process.argv[4] || '200', 10);
const OUT = process.argv[5] || path.join(ROOT, 'evidence', `contest-reach-${SEED}-${FLAVOR}.jsonl`);

// ---------- data preload ----------
const PAIRS = [
  ['plants.json', 'plants'], ['biomes.json', 'biomes'], ['monsters.json', 'monsters'],
  ['villagers.json', 'villagers'], ['abilities.json', 'abilities'], ['items.json', 'items'],
  ['background_survivors.json', 'background_survivors'], ['cell_defs.json', 'cellDefs'],
  ['animals.json', 'animals'], ['recipes.json', 'recipes'], ['books.json', 'books'],
  ['relicEnhancements.json', 'relicEnhancements'], ['locations.json', 'locations'],
  ['characterGen.json', 'characterGen'], ['synergies.json', 'synergies'],
  ['knowledge.json', 'knowledge'], ['nameCultures.json', 'nameCultures'],
  ['originPicker.json', 'originPicker'], ['foreignSpeech.json', 'foreignSpeech'],
  ['lifeseeds.json', 'lifeseeds'], ['arrivalText.json', 'arrivalText'],
  ['justiceVoice.json', 'justiceVoice'], ['alienPlayers.json', 'alienPlayers'],
  ['regions.json', 'regions'], ['dramaEffects.json', 'dramaEffects'],
  ['monsterBehaviors.json', 'monsterBehaviors'], ['contests.json', 'contests'],
  ['events.json', 'events'], ['statusEffects.json', 'statusEffects'], ['cooking.json', 'cooking'],
];
global.SCATTER_DATA = {};
for (const [f, key] of PAIRS) {
  try { global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8')); }
  catch (e) { /* missing file: key stays undefined */ }
}

// ---------- seeded RNG BEFORE eval (modules capture Math.random at load) ----------
function mulberry32(a) {
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let _rng = mulberry32(SEED);
function rng() { return _rng(); }
rng.reset = (s) => { _rng = mulberry32(s); };
Math.random = rng;

// ---------- eval FULL script list in index.html order, minus DOM-only ----------
global.window = global; // equipment.js needs window at load; deleted after eval
const LIST = [
  'engine/state.js','engine/modifiers.js','engine/calories.js','engine/day.js',
  'engine/forage.js','engine/combat.js','game.js','encounters.js','conversation.js',
  'convo-mood.js','convoTopics.js','convo-wants.js','convo-dialogue.js','convo-beats.js',
  'convo-scene.js','examine.js','equipment.js','journal.js','party.js','party-formal.js',
  'truth.js','contests.js','broadcast.js','contestEngine.js','alienPlayers.js','storage.js',
  'perceive.js','carexplore.js','justice.js','food.js','betrayal.js','corpses.js',
  'corruption.js','lifeseed.js','progression.js','ledger.js','abilityActions.js',
  'monsterBehaviors.js','partyTactics.js','statusEffects.js','metaProgression.js',
  'villager-agency.js','fieldFights.js','villager-objectives.js','codex-people.js',
  'membership.js','havenGrowth.js','hierarchy.js','comms.js','villageAgency.js',
  'debug-scenarios.js','build.js',
];
for (const f of LIST) {
  try { eval(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window; // sync combat path for the harness
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;

// ---------- beat log ----------
const out = fs.createWriteStream(OUT);
function beat(ev) {
  ev.day = (Game.state && Game.state.scholar && Game.state.scholar.day) || 0;
  out.write(JSON.stringify(ev) + '\n');
}
function day() { return (Game.state && Game.state.scholar && Game.state.scholar.day) || 0; }

// quiet the say pipeline (capture only contest-ish lines for spot checks)
const cxLines = [];
const _sysSay = Game.sysSay.bind(Game);
Game.sysSay = function(t) {
  const s = String(t);
  if (/📺/.test(s) && cxLines.length < 4000) cxLines.push(s.slice(0, 220));
  return _sysSay(s);
};
try { Game.audioEvent = function() {}; } catch (e) {}

// ---------- instrument the contest/show/broadcast machinery ----------
function wrap(name, fn) {
  const orig = Game[name];
  if (typeof orig !== 'function') { console.error('MISSING ' + name); return; }
  Game[name] = function(...args) {
    const r = orig.apply(this, args);
    try { fn(args, r); } catch (e) {}
    return r;
  };
}
const fired = []; // pending countdown tracking
wrap('fireContest', (a) => {
  const c = a[0] || {};
  const elig = Game.contestEligible ? Game.contestEligible() : {};
  const weights = {};
  try { for (const e of (elig.eligible || [])) weights[e.id] = Math.round(Game.notabilityWeight(e.id) * 100) / 100; } catch (e2) {}
  fired.push({ id: c.id, day: day(), resolved: false });
  beat({ type: 'fireContest', contestId: c.id, risk: c.risk, cat: c.cat, variant: c.variant || null,
         participants: c.participants, notabilityWeights: weights,
         viewership: roundV() });
});
wrap('resolveContest', () => { beat({ type: 'resolveContest' }); });
wrap('contestInterruption', (a) => {
  const c = a[0] || {}, ids = a[1];
  for (const f of fired) if (f.id === c.id && !f.resolved && day() - f.day <= 3) f.resolved = true;
  beat({ type: 'interruption', contestId: c.id, participantIds: ids,
         isPlayer: (Array.isArray(ids) ? ids : [ids]).includes('player') });
});
wrap('fireShow', (a) => {
  const s = a[0] || {};
  beat({ type: 'fireShow', showId: s.id, name: s.name, viewership: roundV() });
});
wrap('showCastPull', (a, r) => {
  if (r && r.who) beat({ type: 'showCast', who: r.who, why: r.why, note: r.note || null });
});
wrap('fireRatingsSummons', () => { beat({ type: 'fireSummons', viewership: roundV() }); });
wrap('_contestEnd', (a) => {
  const ac = a[0] || {};
  beat({ type: 'contestEnd', contestId: ac.contestId, kind: ac.kind || 'contest',
         participant: ac.participant, outcome: a[1], prize: !!a[2],
         fans: fanSnapshot() });
});
wrap('_showEnd', (a) => {
  const ac = a[0] || {};
  beat({ type: 'showEnd', showId: ac.showId, participant: ac.participant, outcome: a[1], prize: !!a[2],
         fans: fanSnapshot() });
});
wrap('_showVillagerEnd', (a) => {
  const ac = a[0] || {};
  beat({ type: 'showVillagerEnd', showId: ac.showId, participant: ac.participant, fans: fanSnapshot() });
});
wrap('_contestRefuse', (a) => {
  const ac = a[0] || {};
  beat({ type: 'contestRefuse', contestId: ac.contestId, participant: ac.participant });
});
wrap('_contestDie', (a) => {
  const ac = a[0] || {};
  beat({ type: 'contestDie', contestId: ac.contestId, participant: ac.participant, detail: String(a[1] || '').slice(0, 120) });
});
wrap('_contestVerdict', () => { beat({ type: 'verdict' }); });
wrap('contestResolveGroup', (a, r) => {
  const pids = a[0] || [];
  const src = {};
  if (r) for (const pid of pids) src[pid] = r[pid] ? { outcome: r[pid].outcome, logLines: (r[pid].log || []).length } : null;
  beat({ type: 'resolveGroup', pids, outcomes: src });
});
wrap('contestResolveVillager', (a, r) => {
  beat({ type: 'resolveVillager', pid: a[0], contestId: (a[1] || {}).id,
         outcome: r ? r.outcome : null, logLines: r && r.log ? r.log.length : 0 });
});
wrap('_contestResolveOthers', () => { beat({ type: 'resolveOthers' }); });
wrap('broadcastStart', (a) => { beat({ type: 'bcastStart', kind: a[0] }); });
wrap('broadcastEnd', () => { beat({ type: 'bcastEnd' }); });
function roundV() {
  try { const v = Game.state.village || {}; return Math.round((v.viewership == null ? Game.havenViewership() : v.viewership) * 10) / 10; }
  catch (e) { return null; }
}
function fanSnapshot() {
  try { const ap = Game.apState ? Game.apState() : {}; return Object.assign({}, (ap.fanClubs || {})); }
  catch (e) { return null; }
}

// ---------- turn-based arena driver (sync path; window deleted) ----------
function P() { try { return Game.tbFighter('p'); } catch (e) { return null; } }
function mons() {
  try { return (Game.tbfight ? Game.tbfight.fighters : []).filter(x => x.kind === 'monster' && x.alive); }
  catch (e) { return []; }
}
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); if (!p) return;
  p.moveLeft = 0; p.acted = true;
  try { Game.tbAfterPlayerAction(); } catch (e) {}
}
function driveArena() {
  let rounds = 0;
  const startHp = (Game.state.scholar || {}).health || 0;
  while (Game.tbfight && !Game.tbfight.over && rounds < 300) {
    rounds++;
    try {
      if (Game.tbIsPlayerTurn()) {
        const p = P(), ms = mons();
        if (!p) break;
        let acted = false;
        if (ms.length) {
          // walk toward nearest, strike when adjacent
          let best = null, bd = 1e9;
          for (const m of ms) { const d = Math.max(Math.abs(m.mx - p.mx), Math.abs(m.my - p.my)); if (d < bd) { bd = d; best = m; } }
          if (best) {
            let guard = 12;
            while (guard-- > 0 && Math.max(Math.abs(best.mx - p.mx), Math.abs(best.my - p.my)) > 1 && p.moveLeft > 0 && Game.tbIsPlayerTurn()) {
              const dx = Math.sign(best.mx - p.mx), dy = Math.sign(best.my - p.my);
              try { if (!Game.tbPlayerMove(p.mx + dx, p.my + dy)) break; } catch (e) { break; }
            }
            if (Math.max(Math.abs(best.mx - p.mx), Math.abs(best.my - p.my)) <= 1) {
              try { Game.tbPlayerStrike(); acted = true; } catch (e) {}
            }
          }
        }
        endTurn();
      } else {
        endTurn();
      }
    } catch (e) { break; }
  }
  if (Game.tbfight && !Game.tbfight.over) {
    beat({ type: 'arenaStuck', rounds });
    try { Game.tbEnd('fled'); } catch (e) {}
  }
  beat({ type: 'arenaDone', rounds, hpBefore: startHp, hpAfter: (Game.state.scholar || {}).health || 0 });
}

// ---------- modal driver ----------
function driveModal() {
  let steps = 0;
  const seenOutcomes = [];
  while (Game.state.activeContest && steps < 60) {
    const ac = Game.state.activeContest;
    if (ac.arenaSuspended) { driveArena(); steps++; continue; }
    const phase = ac.phases[ac.phaseIdx || 0];
    if (!phase) { beat({ type: 'stuck', why: 'no-phase', contestId: ac.contestId, kind: ac.kind }); break; }
    if (!phase.choices || !phase.choices.length) {
      beat({ type: 'stuck', why: 'no-choices', contestId: ac.contestId, kind: ac.kind, phaseIdx: ac.phaseIdx });
      break;
    }
    const idx = Math.floor(rng() * phase.choices.length);
    let res = null;
    try { res = Game.contestChoose(idx); } catch (e) {
      beat({ type: 'chooseThrew', err: String(e && e.message || e).slice(0, 160) });
      break;
    }
    steps++;
    if (res && res.done) { seenOutcomes.push(res.outcome); break; }
    if (res && res.blocked) continue; // pick again next loop (rng advances)
    if (res === null) { beat({ type: 'stuck', why: 'choose-null', contestId: ac.contestId, kind: ac.kind }); break; }
    if (res && res.arena) continue; // suspended; loop handles
  }
  if (Game.state.activeContest) {
    beat({ type: 'modalUnresolved', kind: Game.state.activeContest.kind,
           contestId: Game.state.activeContest.contestId, phaseIdx: Game.state.activeContest.phaseIdx });
  }
  return seenOutcomes;
}

// ---------- fresh game ----------
function fresh() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 100; s.kcal = 2000; s.trauma = 0;
  Game.state.over = false;
}

// ---------- the run ----------
function keepAlive() {
  const s = Game.state.scholar;
  if (!s) return false;
  if (Game.state.over || (s.health || 0) <= 0) return false;
  // competent caretaker policy: eat/rest like a surviving player would
  if ((s.kcal || 0) < 1200) s.kcal = 2000;
  if ((s.health || 0) < 60) s.health = 100;
  if ((s.trauma || 0) > 60) s.trauma = 30;
  if (s.exiled) s.exiled = false; // caretaker: not testing exile here
  // COMPETENT PROVIDER (Worker D 2026-10-10): a hands-off harness never
  // forages, so the starting pantry (47k) empties ~day 21 and every run
  // scatters by day ~24 — before contests can be measured. stockPantry is
  // the honest API (real spoilable items, not a phantom number): 5000/day
  // simulates a foraging player hauling to the pantry.
  try { Game.stockPantry(5000, 'foraged haul'); } catch (e) {}
  // SUPPORTED VILLAGE: a competent player also waters and treats the sick.
  // Without this, thirst/sickness cascades empty the roster by ~day 40 and
  // villager contest participation can't be measured at all.
  try {
    const v = Game.state.village || {};
    v.water = v.water || { clean: 0, dirty: 0 };
    if ((v.water.clean || 0) < 40) v.water.clean = 40;
    v.health = v.health || {};
    for (const rid of (v.roster || [])) {
      if (v.health[rid] !== undefined && v.health[rid] < 50) v.health[rid] = 80;
    }
  } catch (e) {}
  return true;
}

fresh();
beat({ type: 'runStart', seed: SEED, flavor: FLAVOR, days: DAYS });
let deaths = 0, leakDays = 0;
for (let d = 1; d <= DAYS; d++) {
  if (!keepAlive()) { beat({ type: 'playerDead', day: d }); deaths++; break; }
  const vBefore = roundV();
  if (FLAVOR === 'fame' && rng() < 0.35) {
    try { Game.recordMoment(`a notable deed on day ${day()}`); } catch (e) {}
  }
  // broadcast frame hygiene: no frame should be live at dawn
  try {
    if (Game.state.broadcast && Game.state.broadcast.live) {
      leakDays++;
      beat({ type: 'bcastLeak', kind: Game.state.broadcast.kind, showName: Game.state.broadcast.showName });
      try { Game.broadcastEnd(); } catch (e) {} // keep the run going
    }
  } catch (e) {}
  // pending-contest countdown audit: any fire that never resolved?
  try {
    for (const f of fired) {
      if (!f.resolved && !f.counted && day() - f.day > 2) {
        f.counted = true;
        beat({ type: 'countdownSkipped', contestId: f.id, firedDay: f.day });
      }
    }
  } catch (e) {}
  // POSITIONS (Worker D 2026-10-10): ensureVillagerPositions only runs when
  // the player moves — a stationary harness leaves every villager
  // "unaccounted for" and contest-ineligible. The player is at Haven all
  // run; assign positions each dawn like a player standing among villagers.
  try { Game.ensureVillagerPositions(); } catch (e) {}
  try { Game.endDay(); } catch (e) {
    beat({ type: 'endDayThrew', err: String(e && e.message || e).slice(0, 200) });
    break;
  }
  if (Game.villageLost) { beat({ type: 'villageLost' }); break; }
  // drive any modal the day produced (contest / show / summons)
  if (Game.state.activeContest) {
    const kind = Game.state.activeContest.kind || 'contest';
    beat({ type: 'modalDriveStart', kind, contestId: Game.state.activeContest.contestId,
           participant: Game.state.activeContest.participant, vBefore });
    driveModal();
  }
  if (d % 20 === 0) {
    let eligN = -1, eligIds = [];
    try { const e = Game.contestEligible(); eligN = (e.eligible || []).length; eligIds = (e.eligible || []).map(x => x.id); } catch (e2) {}
    let rosterN = -1, fallenN = -1;
    try { const v = Game.state.village || {}; rosterN = (v.roster || []).length; fallenN = (v.fallen || []).length; } catch (e3) {}
    beat({ type: 'dawnSample', viewership: roundV(), fans: fanSnapshot(),
           dipping: !!(Game.state.village && Game.state.village._dipping),
           eligibleN: eligN, eligibleIds: eligIds, rosterN, fallenN });
  }
}
beat({ type: 'runEnd', deaths, leakDays, viewership: roundV(), fans: fanSnapshot(),
       contestLines: cxLines.length });
out.end(() => {
  // summary to stdout
  const beats = [];
  console.log(`run seed=${SEED} flavor=${FLAVOR} days=${DAYS} deaths=${deaths} bcastLeaks=${leakDays}`);
});
