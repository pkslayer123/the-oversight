#!/usr/bin/env node
// Telegraph STYLE ROUTING tests (Steve 2026-10-06).
// Asserts the burstStyle/chargeStyle routing in tbAllTelegraphCells:
//   bulldozer  (chargeStyle bulldozer) -> dozeLane   (not chargeLane)
//   hype_horn  (burstStyle pep)        -> pepBurst   (not burstRadius)
//   hummice    (burstStyle swarm)      -> swarmHum   (not burstRadius)
//   belltoad   (burstStyle resonant)   -> resonantBurst (not burstRadius)
//   mirrormoth (burstStyle flash)      -> flashBurst (not burstRadius)
// Also asserts:
//   - knowledge gating: unknown pattern -> ALL buckets empty (no telegraph
//     markers at all), and the cue carries no coaching text.
//   - learned pattern -> cue carries the earned knownCue/knownTactics coaching.
//   - tbBeamLaneCells() is beam-only: no style-bucket cell may appear in it.
//   - beam control (review_drone): beam cells DO appear in tbBeamLaneCells.
// Run: node scripts/test-telegraph-routing.js
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

// The REAL tbAllTelegraphCells from app.js (same fn renderDetail uses).
const _tbSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8')
  .match(/function tbAllTelegraphCells\(\) \{[\s\S]*?\n  \}\n/)[0]
  .replace(/^function tbAllTelegraphCells/, 'function');
const tbAllTelegraphCells = eval('(' + _tbSrc + ')');

function def(id) {
  const md = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
  const mlist = Array.isArray(md) ? md : md.monsters;
  return mlist.find(m => m.id === id) || {};
}
function monsters() { return (Game.tbfight ? Game.tbfight.fighters : []).filter(x => (x.kind === 'monster' || x.kind === 'hostile') && x.alive); }
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p'); if (!p) return;
  p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function learn(id) {
  const atkName = ((def(id).attack) || {}).name;
  Game.state.codex.monsters = Game.state.codex.monsters || {};
  const c = Game.state.codex.monsters[id] || (Game.state.codex.monsters[id] = {});
  c.patterns = c.patterns || {};
  if (atkName) c.patterns[atkName] = 'test-learned';
}
// Drive combat until some monster declares a telegraph (max 60 rounds).
function driveToTelegraph() {
  for (let r = 0; r < 60; r++) {
    if (!Game.tbfight || Game.tbfight.over) return false;
    if (monsters().some(m => m.telegraph)) return true;
    if (Game.tbIsPlayerTurn()) endTurn();
    else { try { Game.tbAdvance && Game.tbAdvance(); } catch (e) { return false; } }
  }
  return monsters().some(m => m.telegraph);
}
function setup(t) {
  Game.debugScenario(t.scenario);
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4;
  s.monster = { id: t.id, mx: 6, my: 4 };
  Game.startCombat(t.id);
  if (!Game.tbfight) throw new Error('combat never started');
  const p = Game.tbFighter('p'); if (p) { p.hp = p.maxHp = 99999; }
  monsters().forEach(m => { m.hp = 99999; m.maxHp = 99999; });
}
function bucketCells(b, name) { return b[name] ? [...b[name]] : []; }

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + msg); }
}

const CASES = [
  { id: 'bulldozer', scenario: 'bulldozer', bucket: 'dozeLane', generic: 'charge' },
  { id: 'hype_horn', scenario: 'motivationalspeaker', bucket: 'pepBurst', generic: 'burst' },
  { id: 'hummice', scenario: 'hummice', bucket: 'swarmHum', generic: 'burst' },
  { id: 'belltoad', scenario: 'choir', bucket: 'resonantBurst', generic: 'burst' },
  { id: 'mirrormoth', scenario: 'flashbulb', bucket: 'flashBurst', generic: 'burst' },
];

(async () => {
  await Game.init();
  for (const t of CASES) {
    console.log(`== ${t.id} ==`);
    // --- UNKNOWN: knowledge gate must hide everything ---
    setup(t);
    const declared = driveToTelegraph();
    ok(declared, 'telegraph declared (unknown pass)');
    if (declared) {
      const b = tbAllTelegraphCells();
      const all = ['burst', 'charge', 'encircle', 'biHot', 'sbLock', 'line', 'single', 'direct',
        'dozeLane', 'pepBurst', 'swarmHum', 'resonantBurst', 'flashBurst'];
      const total = all.reduce((n, k) => n + (b[k] ? b[k].size : 0), 0);
      ok(total === 0, `unknown: no telegraph cells at all (got ${total})`);
      const m = monsters().find(x => x.telegraph);
      if (m) {
        const cue = Game.tbTelegraphCue ? Game.tbTelegraphCue(m) : '';
        ok(!cue.includes('You know this one'), 'unknown: cue has no coaching tail');
        const enc = ((m.mdef || {}).encounter) || {};
        if (enc.knownCue) ok(!cue.includes(enc.knownCue.slice(0, 24)), 'unknown: cue has no knownCue');
        if (enc.knownTactics) ok(!cue.includes(enc.knownTactics.slice(0, 24)), 'unknown: cue has no knownTactics');
      }
    }
    // --- LEARNED: style routing ---
    setup(t);
    learn(t.id);
    const declared2 = driveToTelegraph();
    ok(declared2, 'telegraph declared (learned pass)');
    if (declared2) {
      const b = tbAllTelegraphCells();
      const styled = bucketCells(b, t.bucket);
      const generic = bucketCells(b, t.generic);
      ok(styled.length > 0, `${t.bucket} bucket non-empty (got ${styled.length})`);
      ok(generic.length === 0, `generic ${t.generic} bucket empty (got ${generic.length})`);
      // beam-lane must be beam-only: no style-bucket cell in tbBeamLaneCells
      let lane = new Set();
      try { lane = Game.tbBeamLaneCells ? Game.tbBeamLaneCells() : new Set(); } catch (e) {}
      const leak = styled.filter(k => lane.has(k));
      ok(leak.length === 0, `tbBeamLaneCells has no ${t.bucket} cells (leak: ${leak.length})`);
      // coaching appears once learned
      const m = monsters().find(x => x.telegraph);
      if (m) {
        const cue = Game.tbTelegraphCue ? Game.tbTelegraphCue(m) : '';
        ok(cue.includes('You know this one'), 'learned: cue carries coaching tail');
      }
      if (t.bucket === 'dozeLane') ok(typeof b.dozeAngle === 'number', 'dozeAngle captured');
      if (t.bucket === 'swarmHum') ok(Array.isArray(b.swarmSrc) && b.swarmSrc.length > 0, 'swarmSrc captured');
    }
  }
  // --- BEAM CONTROL: review_drone's beam cells must still land in tbBeamLaneCells ---
  console.log('== review_drone (beam control) ==');
  setup({ id: 'review_drone', scenario: 'reviewdrone' });
  learn('review_drone');
  if (driveToTelegraph()) {
    let lane = new Set();
    try { lane = Game.tbBeamLaneCells ? Game.tbBeamLaneCells() : new Set(); } catch (e) {}
    ok(lane.size > 0, `beam lane non-empty for beam monster (got ${lane.size})`);
    const tgCells = new Set();
    monsters().forEach(m => (m.telegraph && m.telegraph.cells || []).forEach(c => tgCells.add(c.cx + ',' + c.cy)));
    const outside = [...lane].filter(k => !tgCells.has(k));
    ok(outside.length === 0, 'beam lane cells are all real telegraph cells');
  } else {
    ok(false, 'review_drone telegraph declared');
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH: ' + (e && e.stack || e)); process.exit(2); });
