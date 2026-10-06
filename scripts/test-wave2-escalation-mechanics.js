// Wave-2 escalation mechanic verification (Steve 2026-10-06).
// Drives each CURRENT wave-2 monster until its second-act mechanic fires (or
// N rounds), then asserts the mechanic's marker. NOT a pass/fail on damage —
// a proof that the escalation EXISTS and runs.
// Roster as of the 2026-10-06 redesign: 5 new (understudy, landlord, heckler,
// paparazzo, union_rep) + apex moderator + 6 kept (review_drone, mirror_stag,
// bright_idea, memory_projector, warranty_caller, voice_mimic_radio).
// (The pre-redesign version of this file tested camera_swarm, hype_horn,
// service_mimic, contract_golem, delegate_beast — removed in 6943235.)
// Run: node scripts/test-wave2-escalation-mechanics.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

function flatGrid() { return Array.from({ length: 9 }, () => Array(9).fill('grass')); }
// M(id): the monster under test. The id filter matters for union_rep, whose
// summoned picket-line allies are also kind==='monster'.
function M(id) {
  if (!Game.tbfight) return null;
  const ms = Game.tbfight.fighters.filter(x => x.kind === 'monster' && x.alive !== false);
  if (id) return ms.find(x => ((x.mdef || {}).id) === id) || ms[0];
  return ms[0];
}
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
  if (monId === 'bright_idea') { p.mx = 4; p.my = 4; Game.state.scholar.mx = 4; }
  m.hp = m.maxHp = 3000; // survive the whole audit
  Game.log = [];
  return m;
}
// Guarded endTurn: exactly one AI round per player action (AGENTS.md).
function endT() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); if (p) { p.moveLeft = 0; p.acted = true; }
  try { Game.tbAfterPlayerAction(); } catch (e) {}
}
function monsterTurns() {
  let g = 0;
  while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && g++ < 40) {
    try { Game.tbAdvance(); } catch (e) { break; }
  }
}
// Aggressive bot: close in, strike when adjacent. opts.answerHeckler waits when compelled.
// opts.bot === 'habit': the old habitual dodger — always sidesteps the same way,
// never closes in. review_drone's predictive aim only learns from dodge habits.
function botTurn(m, opts) {
  if (!Game.tbfight || !Game.tbIsPlayerTurn()) { endT(); return; }
  const p = P();
  if (!p || !p.alive || !m || !m.alive) { endT(); return; }
  if (opts.answerHeckler && p.hkCompelled) { try { Game.tbPlayerWait(); } catch (e) { endT(); } return; }
  if (opts.bot === 'habit') {
    // habitual dodge: step off-axis the same way every turn when threatened
    const tg = m.telegraph;
    if (tg && tg.cells && tg.cells.length && p.moveLeft > 0) {
      const inCells = tg.cells.some(c => c.cx === p.mx && c.cy === p.my);
      if (inCells) {
        const ny = Math.min(7, Math.max(1, p.my + 1)); // same sidestep, every time
        try { Game.tbPlayerMove(p.mx, ny); } catch (e) {}
      }
    }
    endT(); return;
  }
  let d = Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my));
  if (d > 1 && p.moveLeft > 0) {
    const nx = Math.min(7, Math.max(1, p.mx + Math.sign(m.mx - p.mx)));
    const ny = Math.min(7, Math.max(1, p.my + Math.sign(m.my - p.my)));
    try { Game.tbPlayerMove(nx, ny); } catch (e) {}
    d = Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my));
  }
  if (d <= 1 && !p.acted && Game.tbIsPlayerTurn()) {
    try { Game.tbPlayerStrike(m.key); } catch (e) {}
  }
  endT();
}
const has = (re) => said.some(l => re.test(l));

async function check(id, rounds, asserts) {
  const m = setup(id);
  const TM = () => M(id);
  if (!m) { console.log(`FAIL ${id}: no fight`); return false; }
  if (asserts.prep) asserts.prep(m);
  for (let r = 0; r < rounds && Game.tbfight && !Game.tbfight.over; r++) {
    botTurn(TM() || m, asserts);
    monsterTurns();
    if (asserts.mid) asserts.mid(TM() || m, r);
    if (asserts.early && asserts.early(TM() || m)) break;
  }
  let okAll = true;
  for (const [name, fn] of Object.entries(asserts.checks)) {
    const mm = TM() || m;
    const ok = fn(mm);
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
  // ---- the five new monsters ----
  await run('understudy', 14, { checks: {
    'OPENING STEAL armed/declared': () => has(/OPENING STEAL/),
    'rehearse->perform arc (got it now)': () => has(/I've got it now/),
    'DESPERATE IMPROV below 30%': (m) => has(/DESPERATE IMPROV/),
  }, mid: (m) => { if (m && m.beamPhase === 'performing' && m.hp > m.maxHp * 0.25) m.hp = Math.floor(m.maxHp * 0.25); }});
  await run('landlord', 12, { checks: {
    'rent comes due': () => has(/RENT\u2019S DUE|RENTS DUE|takes its cut/i),
    'addendum waves (2+)': (m) => (m.llAddenda || 0) >= 2,
    'foreclosure phase fires': (m) => m.beamPhase === 'foreclosing' || has(/FORECLOSURE/),
  }});
  await run('heckler', 12, { answerHeckler: true, checks: {
    'headliner phase reached': (m) => m.beamPhase === 'headliner' || has(/LIVE ONE/),
    'PILE-ON fired': () => has(/PILE-ON/),
    'compulsion answered (wait clears shame)': () => has(/answer back — it costs the turn/),
  }});
  await run('paparazzo', 10, { checks: {
    'exclusive (money shot) fires': () => has(/money shot/i),
    'prediction reaches 4': (m) => (m.pzPrediction || 0) >= 4,
  }});
  await run('union_rep', 12, {
    prep: (m) => {},
    mid: (m) => { if (m && !m.urWalkout && m.hp > m.maxHp * 0.45) m.hp = Math.floor(m.maxHp * 0.4); },
    checks: {
      'picket line summoned': () => has(/PICKET LINE/),
      'WALKOUT at half HP': () => has(/WALKOUT! WALKOUT/),
      'rep untargetable during walkout': (m) => !!m.urWalkout,
    }});
  await run('moderator', 10, {
    mid: (m) => { if (m && m.hp > m.maxHp * 0.45) m.hp = Math.floor(m.maxHp * 0.4); },
    checks: {
      'verb muting fires': () => has(/MUTED inside the suppression field/),
      'violations stack': () => has(/VIOLATIONS/),
      'shadowban phase fires': (m) => m.beamPhase === 'shadowban' || has(/shadowban/i),
    }});
  // ---- the six kept monsters (second acts from 9a6d919) ----
  await run('review_drone', 25, { bot: 'habit', checks: {
    'predictive aim learned (drDodge set)': (m) => !!m.drDodge,
    'adjusting-aim line spoken': () => has(/ADJUSTING AIM/),
  }});
  await run('mirror_stag', 25, { checks: {
    'wheel fired (say line)': () => has(/wheels on a hoof|wheels — impossibly fast/),
  }});
  await run('bright_idea', 30, { checks: {
    'rekindle accelerated (2+ cycles)': (m) => (m.biCycles || 0) >= 2,
    'dazzle applied': () => has(/dazzled/),
  }});
  await run('memory_projector', 25, { checks: {
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
  process.exit(fail ? 1 : 0);
})();
