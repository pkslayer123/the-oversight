// WAVE-2 ESCALATION AUDIT (Steve 2026-10-06): Steve's correction —
// "highbeam deer is a wave 1." The deer was a finish-quality checklist, not
// the ceiling. This script answers: do wave-2 monsters ESCALATE beyond wave-1
// (demand new tactics), or are they deer-level with new paint?
//
// Method: a "wave-1 tactics bot" (dodge telegraphed cells, close in, strike)
// fights each wave-2 monster + wave-1 baselines. If the wave-1 kit fully
// neutralizes a wave-2 monster (near-zero damage, same tempo), it is paint.
// Escalation = damage taken despite correct play, new verbs demanded
// (fire, crowds, interrupts), multi-pattern concurrency, HP-threshold
// escalation, or counterplay inversion (wave-1 tactics punished).
//
// Run: node scripts/test-wave2-escalation.js
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
const MDEFS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));

const W2 = ['voice_mimic_radio', 'mirror_stag', 'review_drone', 'camera_swarm',
  'hype_horn', 'service_mimic', 'contract_golem', 'delegate_beast',
  'bright_idea', 'memory_projector', 'warranty_caller'];
const W1 = ['gallowdeer', 'bulldozer', 'hushwolf', 'sunbasker', 'glasswing'];

function flatGrid() { return Array.from({ length: 9 }, () => Array(9).fill('grass')); }
function M() { return Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster'); }
function P() { return Game.tbFighter('p'); }
const cheb = (a, b) => Math.max(Math.abs(a.mx - b.mx), Math.abs(a.my - b.my));

function setup(monId) {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  for (const rid of Object.keys(Game.state.village.positions || {})) {
    Game.state.village.positions[rid] = { mx: 0, my: 0 };
  }
  s.mx = 3; s.my = 4; s.monster = null;
  Game.dayPart = 3; // night: everything fires
  Game.canSee = () => true;
  Game.state.codex = Game.state.codex || {};
  Game.state.codex.monsters = {}; // UNKNOWN baseline: true first encounter
  Game.genDetail = flatGrid;
  Game.startCombat(monId);
  const m = M();
  if (!m) return null;
  m.mx = 6; m.my = 4; // 3 tiles from player
  const p = P(); p.hp = p.maxHp = 500;
  // bright_idea's burst is centered on itself (radius 2): stand inside it.
  if (monId === 'bright_idea') { p.mx = 4; p.my = 4; Game.state.scholar.mx = 4; }
  // NORMALIZE: wave-2 HP pools (35-90) die in 2-3 spear rounds, so their
  // multi-phase AIs never run. 250 HP buys ~10 rounds of behavior — the
  // audit is about tactics, not HP tuning.
  m.hp = m.maxHp = 250;
  // keep monster at natural HP, normalize player DPS by fixing strike damage via spear
  Game.log = [];
  return m;
}

// Danger cells for this player turn: every monster's declared telegraph cells.
function dangerCells() {
  const danger = new Set();
  if (!Game.tbfight) return danger;
  for (const f of Game.tbfight.fighters) {
    if (f.kind !== 'monster' || !f.alive) continue;
    const tg = f.telegraph;
    if (tg && tg.cells && tg.cells.length) {
      for (const c of tg.cells) danger.add(c.cx + ',' + c.cy);
    } else if (tg && tg.pattern && S && S.combat && S.combat.patternCells) {
      try {
        const cells = S.combat.patternCells(tg.pattern, f.mx, f.my, P().mx, P().my);
        for (const c of cells) danger.add(c.cx + ',' + c.cy);
      } catch (e) {}
    }
  }
  return danger;
}

// WAVE-1 TACTICS BOT: sidestep declared telegraphs, close in, strike.
// Turn hygiene (AGENTS.md): spend the turn fully (moveLeft=0, acted=true)
// before tbAfterPlayerAction, or the turn never advances.
// BOT_MODE 'still': stands ground (for punish-on-hit / punish-on-stillness
// escalation markers).
let BOT_MODE = 'habit';
function botTurn() {
  if (!Game.tbfight || !Game.tbIsPlayerTurn()) return;
  const p = P(), m = M();
  if (!m) { endPlayerTurn(); return; }
  if (BOT_MODE === 'still') {
    if (m && m.alive && Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my)) <= 1 && !p.acted) {
      try { Game.tbPlayerStrike(m.key); } catch (e) {}
    }
    endPlayerTurn(); return;
  }
  const danger = dangerCells();
  // best destination: safe from telegraphs, close enough to strike
  let best = null, bestScore = -1e9;
  for (let nx = 1; nx <= 7; nx++) for (let ny = 1; ny <= 7; ny++) {
    if (nx === m.mx && ny === m.my) continue;
    const path = Game.findPath(p.mx, p.my, nx, ny);
    if (!path || !path.length || path.length > p.moveLeft) continue;
    const safe = danger.has(nx + ',' + ny) ? 0 : 1;
    const dToM = Math.max(Math.abs(nx - m.mx), Math.abs(ny - m.my));
    const near = dToM <= 1 ? 2 : 0;
    const score = safe * 100 + near * 10 - dToM;
    if (score > bestScore) { bestScore = score; best = [nx, ny]; }
  }
  if (best) { try { Game.tbPlayerMove(best[0], best[1]); } catch (e) {} }
  if (!Game.tbfight || !Game.tbIsPlayerTurn()) return;
  const pp = P(), mm = M();
  if (pp && mm && mm.alive && Math.max(Math.abs(pp.mx - mm.mx), Math.abs(pp.my - mm.my)) <= 1 && !pp.acted) {
    try { Game.tbPlayerStrike(mm.key); } catch (e) {}
  }
  endPlayerTurn();
}
function endPlayerTurn() {
  if (!Game.tbfight || !Game.tbIsPlayerTurn()) return;
  const p = P();
  if (p) { p.moveLeft = 0; p.acted = true; }
  try { Game.tbAfterPlayerAction(); } catch (e) {}
}

function monsterTurns() {
  let guard = 0;
  while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && guard++ < 40) {
    try { Game.tbAdvance(); } catch (e) { break; }
  }
}

function fight(monId, rounds, botMode) {
  const said = [];
  const m = setup(monId);
  if (!m) return { id: monId, error: 'no fight' };
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); return origSay(t); };
  const d = MDEFS.find(x => x.id === monId);
  const rec = { id: monId, name: d.name, wave: d.wave,
    pat: ((d.attack || {}).pattern || {}).type, mhp: m.hp,
    rounds: 0, dmgTaken: 0, dmgDealt: 0, telegraphs: new Set(), phases: new Set(),
    newVerbs: [], notes: [] };
  const p0hp = P().hp, m0hp = m.hp;
  for (let r = 0; r < rounds && Game.tbfight && !Game.tbfight.over; r++) {
    rec.rounds++;
    const p = P(), mm = M();
    if (mm && mm.telegraph) {
      const tg = mm.telegraph;
      rec.telegraphs.add(tg.kind || tg.type || ((d.attack.pattern || {}).type + ':undeclared-cells'));
    }
    if (mm && mm.beamPhase) rec.phases.add(mm.beamPhase);
    botTurn();
    monsterTurns();
    if (!Game.tbfight) break;
  }
  const pEnd = Game.tbfight && P() ? P().hp : p0hp - rec.dmgTaken;
  rec.dmgTaken = Math.max(0, p0hp - (Game.tbfight && P() ? P().hp : p0hp));
  const mm = M();
  rec.dmgDealt = m0hp - (mm ? mm.hp : 0);
  rec.over = !Game.tbfight || Game.tbfight.over;
  rec.monsterDead = mm ? !mm.alive : true;
  rec.playerHpLeft = Game.tbfight && P() ? P().hp : 0;
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  rec.telegraphs = [...rec.telegraphs];
  rec.phases = [...rec.phases];
  rec._m = mm;
  rec._said = said;
  try { Game.say = origSay; } catch (e) {}
  return rec;
}

function verdict(r) {
  // Escalation heuristics from bot data
  if (r.error) return 'SETUP-FAIL';
  const dpt = r.dmgTaken / Math.max(1, r.rounds);
  if (dpt >= 8) return 'ESCALATES (hurts despite correct play)';
  if (r.telegraphs.length >= 2) return 'ESCALATES (multi-pattern)';
  return 'PAINT? (wave-1 kit neutralizes)';
}

// Wave-2 escalation markers (Steve 2026-10-06): each wave-2 monster changes
// the trick mid-fight. The marker proves the second act ran.
const ESCALATION = {
  voice_mimic_radio: ['replay rush (post-reveal, no telegraph)', (m, said) => said.some(l => /Teeth of static/.test(l))],
  mirror_stag: ['the wheel (missed charge re-declares, no windup)', (m, said) => said.some(l => /wheels on a hoof|wheels — impossibly fast/.test(l))],
  review_drone: ['predictive aim (learns your dodge side)', (m) => !!m.drDodge],
  camera_swarm: ['widening flash (radius 3 when starved)', (m, said) => said.some(l => /WIDENING THE SHOT/.test(l))],
  hype_horn: ['advancing encouragement (creeps during windup)', (m) => m.mx !== 6],
  service_mimic: ['please hold (rush stuns a full turn)', (m, said) => said.some(l => /You're on hold/.test(l))],
  contract_golem: ['spreading jurisdiction (range grows to 4+)', (m) => (m.cgRangeShown || 0) > 3],
  delegate_beast: ['follow-up charge (connected charge chains)', (m, said) => said.some(l => /CIRCLING BACK/.test(l))],
  bright_idea: ['faster rekindle + dazzle', (m) => (m.biCycles || 0) >= 2],
  memory_projector: ['homesick (stillness shortens the watch)', (m) => (m.mpStill || 0) >= 1],
  warranty_caller: ['faster redials + wrong number', (m) => (m.wcCycle || 0) >= 2],
};

(async () => {
  await Game.init();
  const all = [];
  console.log('=== WAVE-1 BASELINES (wave-1 tactics bot) ===');
  for (const id of W1) {
    const r = fight(id, 10);
    all.push(r);
    console.log(`${r.name} [${r.pat}] rounds=${r.rounds} dmgTaken=${r.dmgTaken} dmgDealt=${Math.round(r.dmgDealt)} dead=${r.monsterDead} telegraphs=${JSON.stringify(r.telegraphs)} phases=${JSON.stringify(r.phases)}`);
  }
  console.log('\n=== WAVE-2 ===');
  // Per-monster bot mode: punish-mechanics need the bot to make the mistake.
  const STILL_MODE = new Set(['delegate_beast', 'bright_idea', 'memory_projector']);
  for (const id of W2) {
    BOT_MODE = STILL_MODE.has(id) ? 'still' : 'habit';
    const r = fight(id, 14);
    all.push(r);
    console.log(`${r.name} [${r.pat}] rounds=${r.rounds} dmgTaken=${r.dmgTaken} dmgDealt=${Math.round(r.dmgDealt)} dead=${r.monsterDead} telegraphs=${JSON.stringify(r.telegraphs)} phases=${JSON.stringify(r.phases)}`);
  }
  BOT_MODE = 'habit';
  console.log('\n=== ESCALATION VERDICTS (wave-2 second-act markers) ===');
  for (const r of all) {
    if (r.wave !== 2 || r.error) { console.log(`${r.wave === 2 ? 'W2' : 'W1'} ${r.name}: ${verdict(r)}`); continue; }
    const esc = ESCALATION[r.id];
    let marker = false;
    try { marker = esc ? !!esc[1](r._m, r._said) : false; } catch (e) { marker = false; }
    console.log(`W2 ${r.name}: ${marker ? 'ESCALATES' : 'PAINT'} — ${esc ? esc[0] : 'no marker'} ${marker ? '(marker FIRED)' : '(marker did NOT fire)'}`);
    r.escalationMarker = esc ? esc[0] : null;
    r.escalationFired = marker;
    delete r._m; delete r._said;
  }
  fs.writeFileSync(path.join(ROOT, 'scripts', 'test-wave2-escalation-results.json'), JSON.stringify(all, null, 1));
})();
