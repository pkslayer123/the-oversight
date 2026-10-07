#!/usr/bin/env node
// MONSTER SCENARIO PLAYTEST (Steve 2026-10-06) — play all 23 monster debug
// scenarios AS A PLAYER. Not execution-only: approach, fight, judge.
// Partition: wave-1 + wave-2 monsters (sibling handles animals/justice/etc).
// TURN HYGIENE: endTurn() = exactly one AI round (never a second tbAdvance).
// Run: node scripts/play-monster-scenarios-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });

// Window stub for eval phase ONLY (equipment.js needs it at load).
// Deleted before playing so combat takes the SYNC path.
global.window = global;

const FILES = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-dialogue.js', 'src/js/convo-wants.js', 'src/js/convo-beats.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
  'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
];
for (const f of FILES) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error('LOAD FAIL', f, e.message); process.exit(1); }
}
delete global.window;
const Game = globalThis.Scattering.Game;

const WAVE1 = (process.env.ONLY ? process.env.ONLY.split(',') : ['headlight','flashbulb','choir','lockpick','hummice','glasswing','sunbasker','bulldozer','hushpuppy','whitenoise','nightlight','speedbump','ducksinarow']);
const WAVE2 = (process.env.ONLY ? [] : ['static','griefcounselor','reviewdrone','influencer','motivationalspeaker','customerservice','termsconditions','middlemanager','inspiration','nostalgia']);

function flatGrid() { return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')); }
function P() { return Game.tbFighter('p'); }
function foes() { return (Game.tbfight ? Game.tbfight.fighters : []).filter(x => x.kind === 'monster' && x.alive); }
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); if (!p) return;
  p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function dist(a, b) { return Math.max(Math.abs(a.mx - b.mx), Math.abs(a.my - b.my)); }

const says = [];
const report = [];

async function playOne(id) {
  const r = { id, errors: [], telegraphs: [], notes: [], combatRounds: 0, started: false, resolved: false, playerHpLost: 0, monsterHpLost: 0, softlock: false };
  says.length = 0;
  try {
    Game.genDetail = () => flatGrid();
    const ok = Game.debugScenario(id);
    if (!ok) { r.errors.push('debugScenario returned falsy'); return r; }
    const s = Game.state.scholar;
    // --- Phase 1: approach the monster on the grid, watch stance/telegraphs ---
    // Player steps toward the monster; monsterTurn() runs the hunt AI.
    let guard = 20, lastSay = 0;
    let dbgSteps = [];
    let dbgExit = '';
    while (guard-- > 0 && !Game.tbfight) {
      const m = s.monster;
      if (!m || m.mx === undefined) { r.notes.push('monster despawned/vanished before contact'); dbgExit = 'despawn'; break; }
      const dx = Math.sign(m.mx - s.mx), dy = Math.sign(m.my - s.my);
      if (!(dx === 0 && dy === 0)) {
        const nx = s.mx + dx, ny = s.my + dy;
        if (nx >= 0 && nx <= 8 && ny >= 0 && ny <= 8) { s.mx = nx; s.my = ny; }
        else { dbgExit = 'oob'; break; }
      } else if (process.env.DBG) { dbgExit = dbgExit || 'overlap-continue'; }
      if (process.env.DBG && (id === 'whitenoise')) dbgSteps.push(`p${s.mx},${s.my} m${m.mx},${m.my} stance=${m.stance}`);
      try { Game.monsterTurn(); } catch (e) { r.errors.push('monsterTurn: ' + e.message); dbgExit = 'throw'; break; }
      if (process.env.DBG && (id === 'whitenoise')) dbgSteps.push(`  -> after turn: p${s.mx},${s.my} m${s.monster ? s.monster.mx + ',' + s.monster.my : 'GONE'} tbfight=${!!Game.tbfight}`);
      // capture new say output as candidate telegraphs
      for (let i = lastSay; i < says.length; i++) {
        const t = says[i].replace(/🐞/g, '').trim();
        if (t.length > 20 && !/SCENARIO/i.test(t)) r.telegraphs.push(t.slice(0, 160));
      }
      lastSay = says.length;
      if (guard < 5 && !Game.tbfight) { r.notes.push('combat did not start after ~20 approach steps'); }
    }
    if (!Game.tbfight && process.env.DBG) dbgExit = dbgExit || ('guard-exhausted guard=' + guard);
    r.started = !!Game.tbfight;
    if (process.env.DBG && dbgSteps.length) { console.log('    dbg steps:'); dbgSteps.slice(0,16).forEach(x => console.log('      ' + x)); console.log('    dbg exit: ' + dbgExit); }
    if (!Game.tbfight) { r.notes.push('NO COMBAT — scenario may be non-combat by design or setup failed'); return r; }
    // --- Phase 2: fight as a player ---
    const p0 = P(); const pHp0 = p0 ? p0.hp : 0;
    const foe0 = foes()[0]; const fHp0 = foe0 ? foe0.hp : 0;
    let rounds = 0;
    guard = 60;
    let waitStreak = 0;
    while (guard-- > 0 && Game.tbfight && !Game.tbfight.over) {
      if (!Game.tbIsPlayerTurn()) { r.errors.push('stuck: not player turn and fight not over (softlock?)'); r.softlock = true; break; }
      const p = P(), foe = foes()[0];
      if (!p || !p.alive) break;
      if (!foe) {
        // No live foes but fight not over (e.g. choir pack incoming) — WAIT.
        waitStreak++;
        if (waitStreak > 12) { r.notes.push('waited 12 rounds for reinforcements, none came'); break; }
        r.notes.push('waiting for reinforcements (round ' + rounds + ')');
        endTurn(); rounds++;
        continue;
      }
      waitStreak = 0;
      // SMART TARGET: if primary foe is untargetable (walkout), hit another foe
      let tgt = foe;
      if (tgt.urWalkout) {
        const alt = foes().find(x => !x.urWalkout);
        if (alt) tgt = alt;
        else { r.notes.push('all foes untargetable (walkout) — waiting'); }
      }
      // move adjacent if needed, then strike
      let mg = 8;
      while (mg-- > 0 && dist(p, tgt) > 1 && p.moveLeft > 0 && Game.tbIsPlayerTurn()) {
        const dx = Math.sign(tgt.mx - p.mx), dy = Math.sign(tgt.my - p.my);
        if (!Game.tbPlayerMove(p.mx + dx, p.my + dy)) break;
      }
      if (dist(p, tgt) <= 2 && Game.tbIsPlayerTurn() && !tgt.urWalkout) {
        try { Game.tbPlayerStrike(tgt.key); } catch (e) { r.errors.push('strike: ' + e.message); break; }
      }
      // capture telegraphs during combat
      for (let i = lastSay; i < says.length; i++) {
        const t = says[i].replace(/🐞/g, '').trim();
        if (t.length > 25) r.telegraphs.push('[combat] ' + t.slice(0, 160));
      }
      lastSay = says.length;
      rounds++;
      endTurn();
    }
    r.combatRounds = rounds;
    // tbEnd() sets over=true then clears tbfight=null on clean finish.
    // Resolved = fight existed and is now gone-or-over.
    r.resolved = !Game.tbfight || !!(Game.tbfight && Game.tbfight.over);
    const p1 = P();
    // find foe hp via last known
    r.playerHpLost = pHp0 - (p1 ? p1.hp : 0);
    if (!r.resolved && rounds >= 60) { r.notes.push('combat did not resolve in 60 rounds'); r.softlock = true; }
    if (Game.tbfight && Game.tbfight.over) {
      r.notes.push('combat over. outcome: ' + (Game.tbfight.result || Game.tbfight.outcome || '?'));
    }
  } catch (e) {
    r.errors.push('EXCEPTION: ' + e.message);
  }
  return r;
}

(async () => {
  await Game.init();
  const os = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return os(t); };
  Game.canSee = () => true;

  const all = [...WAVE1.map(id => ['wave1', id]), ...WAVE2.map(id => ['wave2', id])];
  const results = [];
  for (const [wave, id] of all) {
    process.stdout.write(`\n### ${id} (${wave}) ... `);
    const r = await playOne(id);
    r.wave = wave;
    results.push(r);
    const flag = r.errors.length ? 'ERROR' : (r.softlock ? 'SOFTLOCK?' : (r.started ? (r.resolved ? 'OK' : 'UNRESOLVED') : 'NO-COMBAT'));
    process.stdout.write(flag + '\n');
    if (r.errors.length) r.errors.slice(0, 3).forEach(e => console.log('    ERR: ' + e.slice(0, 200)));
    if (r.telegraphs.length) console.log('    telegraph[0]: ' + r.telegraphs[0].slice(0, 140));
    if (r.notes.length) r.notes.slice(0, 3).forEach(n => console.log('    note: ' + n.slice(0, 160)));
  }

  fs.writeFileSync('/tmp/monster-playtest-results.json', JSON.stringify(results, null, 1));
  console.log('\n\n==== SUMMARY ====');
  for (const r of results) {
    const flag = r.errors.length ? 'ERROR' : (r.softlock ? 'SOFTLOCK?' : (r.started ? (r.resolved ? 'OK' : 'UNRESOLVED') : 'NO-COMBAT'));
    console.log(`${flag.padEnd(10)} ${r.id.padEnd(20)} rounds=${r.combatRounds} tel=${r.telegraphs.length} err=${r.errors.length}`);
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
