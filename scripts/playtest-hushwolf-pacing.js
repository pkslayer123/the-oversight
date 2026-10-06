#!/usr/bin/env node
// HUSHWOLF PACK AI PACING PLAYTEST (Steve 2026-10-06): does a hushwolf pack
// actually come fight a PASSIVE player, or does it freeze?
//
// PHASE 1 (overworld): player presses WAIT (doAction('wait')). The pack must
//   close in and start combat — no 20-idle-round freeze.
// PHASE 2 (combat): player waits up to 30 rounds. The pack must keep fighting:
//   no more than 3 consecutive idle rounds (idle = no wolf moved AND no
//   damage dealt), and the pack must damage a passive player.
//
// PASS bar: combat starts within 10 waits; max 3 consecutive idle combat
// rounds; player takes damage.
// Run: node scripts/playtest-hushwolf-pacing.js
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

function note(t) { console.log(t); }
function P() { return Game.tbFighter('p'); }
function wolves() { return (Game.tbfight ? Game.tbfight.fighters : []).filter(x => x.kind === 'monster' && x.alive && !x.fled && ((x.mdef || {}).id === 'hushwolf')); }
// TURN HYGIENE (2026-10-06): tbPlayerStrike/tbAfterPlayerAction already advance
// the round; advance ONLY if still player's turn.
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function dist(a, b) { return Math.max(Math.abs(a.mx - b.mx), Math.abs(a.my - b.my)); }
function alive() { return !!(Game.tbfight && !Game.tbfight.over); }

(async () => {
  await Game.init();
  Game.debugScenario('hushpuppy');
  const s = Game.state.scholar;
  Game.canSee = () => true;

  // ---------- PHASE 1: overworld stalk ----------
  note('=== PHASE 1: overworld. Player presses WAIT. Does the pack come? ===');
  note(`spawn: player@(${s.mx},${s.my}) monster@(${s.monster.mx},${s.monster.my}) d=${dist(s, s.monster)}`);
  let waits = 0, owIdle = 0, owMaxIdle = 0;
  while (!Game.tbfight && waits < 10) {
    waits++;
    const m = s.monster;
    const bx = m.mx, by = m.my;
    Game.doAction('wait');
    if (Game.tbfight) { note(`wait ${waits}: ⚔ COMBAT STARTED`); break; }
    const moved = s.monster && (s.monster.mx !== bx || s.monster.my !== by);
    if (moved) owIdle = 0; else owIdle++;
    owMaxIdle = Math.max(owMaxIdle, owIdle);
    note(`wait ${waits}: monster@(${s.monster.mx},${s.monster.my}) stance=${s.monster.stance || '—'} d=${dist(s, s.monster)} ${moved ? 'moved' : 'STILL'}`);
  }
  const phase1Pass = !!Game.tbfight;
  note(phase1Pass ? `PHASE 1 PASS: combat started after ${waits} wait(s), max overworld idle streak ${owMaxIdle}` : 'PHASE 1 FAIL: no combat after 10 waits');
  if (!phase1Pass) { note('OVERALL: FAIL'); process.exit(1); }

  // ---------- PHASE 2: combat vs passive player ----------
  note('\n=== PHASE 2: combat. Player WAITS 30 rounds. Does the pack fight? ===');
  const pf = P(); pf.hp = pf.maxHp = 9000; // survive the story; measure damage separately
  const ws0 = wolves();
  note(`fight: player@(${pf.mx},${pf.my}), ${ws0.length} wolves: ${ws0.map(w => `(${w.mx},${w.my}) d=${dist(pf, w)}`).join(' ')}`);
  let maxIdleStreak = 0, idleStreak = 0, damageToPlayer = 0;
  const idleRounds = [];
  for (let r = 1; r <= 30 && alive(); r++) {
    const before = new Map(wolves().map(w => [w.key, { x: w.mx, y: w.my }]));
    const hpBefore = P().hp;
    endTurn();
    if (!alive()) { note(`round ${r}: fight ended`); break; }
    const ws = wolves(), p = P();
    const moved = ws.some(w => { const b = before.get(w.key); return b && (w.mx !== b.x || w.my !== b.y); });
    const dealt = Math.max(0, hpBefore - p.hp); damageToPlayer += dealt;
    const idle = !moved && dealt === 0;
    if (idle) { idleStreak++; idleRounds.push(r); } else idleStreak = 0;
    maxIdleStreak = Math.max(maxIdleStreak, idleStreak);
    const per = ws.map(w => `d=${dist(p, w)} phase=${w.beamPhase || '—'}`).join(' | ');
    note(`R${String(r).padStart(2)} ${idle ? 'IDLE  ' : 'ACTIVE'} | ${per}${dealt > 0 ? ` | dmg ${dealt}` : ''}`);
  }
  note(`\n=== RESULT ===`);
  note(`phase 1 (overworld stalk): combat after ${waits} wait(s) — ${phase1Pass ? 'PASS' : 'FAIL'}`);
  note(`phase 2 (combat): max consecutive idle rounds ${maxIdleStreak} (bar <=3); idle rounds: ${idleRounds.join(',') || 'none'}`);
  note(`phase 2 (combat): total damage to passive player ${damageToPlayer} (bar >0)`);
  const pass = phase1Pass && maxIdleStreak <= 3 && damageToPlayer > 0;
  note(pass ? 'OVERALL: PASS' : 'OVERALL: FAIL');
  process.exit(pass ? 0 : 1);
})();
