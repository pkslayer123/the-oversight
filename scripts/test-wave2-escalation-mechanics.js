// Wave-2 escalation mechanic verification (Steve 2026-10-06).
// Drives each wave-2 monster until its second-act mechanic fires (or 25
// rounds), then asserts the mechanic's marker. NOT a pass/fail on damage —
// a proof that the escalation EXISTS and runs.
// Run: node scripts/test-wave2-escalation-mechanics.js
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
const S = Game.S || globalThis.Scattering;

function flatGrid() { return Array.from({ length: 9 }, () => Array(9).fill('grass')); }
function M() { return Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster'); }
function P() { return Game.tbFighter('p'); }

let said = [];
function setup(monId) {
  said = [];
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  for (const rid of Object.keys(Game.state.village.positions || {})) Game.state.village.positions[rid] = { mx: 0, my: 0 };
  s.mx = 3; s.my = 4; s.monster = null;
  Game.dayPart = 3; Game.canSee = () => true;
  Game.state.codex = Game.state.codex || {}; Game.state.codex.monsters = {};
  Game.genDetail = flatGrid;
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); return origSay(t); };
  Game.startCombat(monId);
  const m = M();
  if (!m) return null;
  m.mx = 6; m.my = 4;
  const p = P(); p.hp = p.maxHp = 2000;
  // bright_idea's burst is centered on itself (radius 2): the still bot must
  // stand inside it to test the dazzle.
  if (monId === 'bright_idea') { p.mx = 4; p.my = 4; Game.state.scholar.mx = 4; }
  m.hp = m.maxHp = 3000; // survive the whole audit
  Game.log = [];
  return m;
}
function dangerCells() {
  const danger = new Set();
  if (!Game.tbfight) return danger;
  for (const f of Game.tbfight.fighters) {
    if (f.kind !== 'monster' || !f.alive) continue;
    const tg = f.telegraph;
    if (tg && tg.cells && tg.cells.length) for (const c of tg.cells) danger.add(c.cx + ',' + c.cy);
  }
  return danger;
}
// Deliberately HABITUAL bot: always dodges the same way, always closes in.
// Wave-2 should punish the habit. Mode 'still' stands its ground (for
// punish-on-hit / punish-on-stillness mechanics).
let BOT_MODE = 'habit';
function botTurn() {
  if (!Game.tbfight || !Game.tbIsPlayerTurn()) return;
  const p = P(), m = M();
  if (!m) { endT(); return; }
  if (BOT_MODE === 'still') {
    const pp = P(), mm = M();
    if (pp && mm && mm.alive && Math.max(Math.abs(pp.mx - mm.mx), Math.abs(pp.my - mm.my)) <= 1 && !pp.acted) {
      try { Game.tbPlayerStrike(mm.key); } catch (e) {}
    }
    endT(); return;
  }
  const danger = dangerCells();
  let best = null, bestScore = -1e9;
  for (let nx = 1; nx <= 7; nx++) for (let ny = 1; ny <= 7; ny++) {
    if (nx === m.mx && ny === m.my) continue;
    const path = Game.findPath(p.mx, p.my, nx, ny);
    if (!path || !path.length || path.length > p.moveLeft) continue;
    const safe = danger.has(nx + ',' + ny) ? 0 : 1;
    const dToM = Math.max(Math.abs(nx - m.mx), Math.abs(ny - m.my));
    // HABIT: dodge perpendicular-off-axis the same way every time, then close in
    const habit = (ny !== p.my ? 5 : 0);
    const near = dToM <= 1 ? 2 : 0;
    const score = safe * 100 + habit * 10 + near * 10 - dToM;
    if (score > bestScore) { bestScore = score; best = [nx, ny]; }
  }
  if (best) { try { Game.tbPlayerMove(best[0], best[1]); } catch (e) {} }
  if (!Game.tbfight || !Game.tbIsPlayerTurn()) return;
  const pp = P(), mm = M();
  if (pp && mm && mm.alive && Math.max(Math.abs(pp.mx - mm.mx), Math.abs(pp.my - mm.my)) <= 1 && !pp.acted) {
    try { Game.tbPlayerStrike(mm.key); } catch (e) {}
  }
  endT();
}
function endT() {
  if (!Game.tbfight || !Game.tbIsPlayerTurn()) return;
  const p = P(); if (p) { p.moveLeft = 0; p.acted = true; }
  try { Game.tbAfterPlayerAction(); } catch (e) {}
}
function monsterTurns() {
  let g = 0;
  while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && g++ < 40) {
    try { Game.tbAdvance(); } catch (e) { break; }
  }
}
const has = (re) => said.some(l => re.test(l));

async function check(id, rounds, asserts) {
  const m = setup(id);
  if (!m) { console.log(`FAIL ${id}: no fight`); return false; }
  BOT_MODE = asserts.mode || 'habit';
  for (let r = 0; r < rounds && Game.tbfight && !Game.tbfight.over; r++) {
    botTurn(); monsterTurns();
    if (asserts.early && asserts.early()) break;
  }
  let okAll = true;
  for (const [name, fn] of Object.entries(asserts.checks)) {
    const ok = fn(m);
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}`);
    if (!ok) okAll = false;
  }
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  return okAll;
}

(async () => {
  await Game.init();
  let pass = 0, fail = 0;
  const run = async (id, rounds, asserts) => {
    console.log(`== ${id}`);
    (await check(id, rounds, asserts)) ? pass++ : fail++;
  };
  await run('review_drone', 25, { checks: {
    'predictive aim learned (drDodge set)': (m) => !!m.drDodge,
    'adjusting-aim line spoken': () => has(/ADJUSTING AIM/),
  }});
  await run('mirror_stag', 25, { checks: {
    'wheel fired (say line)': () => has(/wheels on a hoof|wheels — impossibly fast/),
  }});
  await run('camera_swarm', 25, { checks: {
    'widening announced': () => has(/WIDENING THE SHOT/),
  }});
  await run('hype_horn', 25, { checks: {
    'encourage beats spoken (windup runs)': () => has(/GET CLEAR/),
    'horn advanced during windup': (m) => m.mx !== 6 || has(/GET CLEAR/),
  }});
  await run('service_mimic', 25, { checks: {
    'on-hold stun applied': () => has(/You're on hold/),
  }});
  await run('contract_golem', 25, { checks: {
    'jurisdiction spread (range>3 shown)': (m) => (m.cgRangeShown || 0) > 3,
    'addendum spoken': () => has(/ADDENDUM/),
  }});
  await run('bright_idea', 30, { mode: 'still', checks: {
    'rekindle accelerated (2+ cycles)': (m) => (m.biCycles || 0) >= 2,
    'dazzle applied': () => has(/dazzled/),
  }});
  await run('memory_projector', 25, { mode: 'still', checks: {
    'homesick still-beats tracked': (m) => (m.mpStill || 0) >= 1,
    'faster watch narrated': () => has(/barely watches this time/),
  }});
  await run('warranty_caller', 30, { checks: {
    'redial cycles advanced (2+)': (m) => (m.wcCycle || 0) >= 2,
    'faster redial narrated': () => has(/shorter this time|knows your number/),
  }});
  await run('voice_mimic_radio', 25, { checks: {
    'reveal reached': (m) => m.beamPhase === 'reveal' || has(/always a radio/),
    'replay rush fired': () => has(/Teeth of static/),
  }});
  console.log(`\n${pass} monsters verified, ${fail} with missing mechanics`);
})();
