// Wave-2 cluster verification playtest (Steve 2026-10-06).
// Plays each new wave-2 monster AS A PLAYER for several rounds:
//   - heckler, landlord, understudy, paparazzo, union_rep, moderator
// Captures: say-lines (the fiction), audio events fired (11 hooks from
// commit 274addd), and key mechanic markers. Prints a fight trace per
// monster so a human can judge whether it FEELS new and wave-2.
// Run: node scripts/playtest-wave2-cluster-verify.js [monsterId]
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
const S = Game.S || globalThis.Scattering;

const AUDIO_HOOKS = ['unionBullhorn','unionWalkout','unionPicket',
  'understudyWatch','understudyRehearse','understudyPerform',
  'landlordSpread','landlordEvict','hecklerHeadliner','hecklerJibe','paparazzoExclusive'];

let said = [];
let audioFired = [];

function setup(monId) {
  said = []; audioFired = [];
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
  Game.genDetail = () => Array.from({ length: 9 }, () => Array(9).fill('grass'));
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); return origSay(t); };
  Game.audioEvent = (name, d) => { audioFired.push(String(name)); };
  Game.startCombat(monId);
  const m = Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster');
  if (!m) return null;
  m.mx = 6; m.my = 4;
  const p = Game.tbFighter('p'); p.hp = p.maxHp = 2000;
  m.hp = m.maxHp = 3000; // survive the audit; mechanics, not damage, are judged
  Game.log = [];
  return m;
}
// Guarded endTurn: exactly one AI round per player action (AGENTS.md).
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p'); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function monsterTurns() {
  let g = 0;
  while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && g++ < 40) {
    try { Game.tbAdvance(); } catch (e) { break; }
  }
}
// Player brain: close in, strike when adjacent; dodge telegraphed cells first.
function playerBrain(m, opts) {
  opts = opts || {};
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) { endTurn(); return; }
  let p = Game.tbFighter('p');
  if (!p || !p.alive) return;
  // dodge telegraphed cells
  const tg = m.telegraph;
  if (tg && tg.cells && tg.cells.length && p.moveLeft > 0) {
    const inCells = tg.cells.some(c => c.cx === p.mx && c.cy === p.my);
    if (inCells) {
      const cellSet = new Set(tg.cells.map(c => c.cx + ',' + c.cy));
      let best = null, bestScore = -1e9;
      for (let y = 1; y <= 7; y++) for (let x = 1; x <= 7; x++) {
        if (cellSet.has(x + ',' + y)) continue;
        const step = Math.max(Math.abs(x - p.mx), Math.abs(y - p.my));
        if (step > p.moveLeft || step === 0) continue;
        const dm = Math.max(Math.abs(x - m.mx), Math.abs(y - m.my));
        const score = 100 - dm;
        if (score > bestScore) { bestScore = score; best = { x, y }; }
      }
      if (best) { try { Game.tbPlayerMove(best.x, best.y); } catch (e) {} }
    }
  }
  p = Game.tbFighter('p');
  // heckler: answer back when compelled
  if (opts.answerHeckler && p.hkCompelled) {
    try { Game.tbPlayerWait(); } catch (e) { endTurn(); }
    return;
  }
  const d = Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my));
  if (d <= 1 && !p.acted) {
    try { Game.tbPlayerStrike(m.key); } catch (e) {}
  } else if (p.moveLeft > 0) {
    const dx = Math.sign(m.mx - p.mx), dy = Math.sign(m.my - p.my);
    const nx = Math.min(7, Math.max(1, p.mx + dx)), ny = Math.min(7, Math.max(1, p.my + dy));
    try { Game.tbPlayerMove(nx, ny); } catch (e) {}
    const p2 = Game.tbFighter('p');
    const d2 = Math.max(Math.abs(p2.mx - m.mx), Math.abs(p2.my - m.my));
    if (d2 <= 1 && !p2.acted && Game.tbIsPlayerTurn()) {
      try { Game.tbPlayerStrike(m.key); } catch (e) {}
    }
  }
  endTurn();
}

const FIGHTS = {
  heckler:   { rounds: 14, opts: { answerHeckler: true } },
  landlord:  { rounds: 14, opts: {} },
  understudy:{ rounds: 16, opts: {} },
  paparazzo: { rounds: 12, opts: {} },
  union_rep: { rounds: 14, opts: {} },
  moderator: { rounds: 12, opts: {} },
};

(async () => {
  await Game.init();
  const only = process.argv[2];
  const ids = only ? [only] : Object.keys(FIGHTS);
  for (const id of ids) {
    const cfg = FIGHTS[id] || { rounds: 10, opts: {} };
    console.log(`\n########## ${id.toUpperCase()} ##########`);
    const m = setup(id);
    if (!m) { console.log('NO FIGHT — startCombat failed'); continue; }
    for (let r = 1; r <= cfg.rounds && Game.tbfight && !Game.tbfight.over; r++) {
      const p = Game.tbFighter('p');
      const marker = [
        id === 'heckler' ? `shame=${m.hkShame||0} phase=${m.beamPhase} compelled=${!!p.hkCompelled}` : '',
        id === 'landlord' ? `claimed=${m.llClaimed||0} addenda=${m.llAddenda||0} phase=${m.beamPhase}` : '',
        id === 'understudy' ? `seen=${(m.usSeen||[]).length} phase=${m.beamPhase} steal=${!!m.usStealArmed} improv=${!!(m.telegraph&&m.telegraph.usImprov)}` : '',
        id === 'paparazzo' ? `pred=${m.pzPrediction||0} phase=${m.beamPhase}` : '',
        id === 'union_rep' ? `allies=${(m.urAllies||[]).length} phase=${m.beamPhase} walkout=${!!m.urWalkout}` : '',
        id === 'moderator' ? `phase=${m.beamPhase} muted=${m.modMutedVerb||'-'}` : '',
      ].filter(Boolean).join(' ');
      console.log(`-- r${r} php=${p.hp} mhp=${m.hp} ${marker}`);
      playerBrain(m, cfg.opts);
      monsterTurns();
      // print the interesting say-lines from this round
      const newLines = said.splice(0);
      for (const l of newLines) {
        const clean = l.replace(/<[^>]+>/g, '').slice(0, 220);
        if (/SHAME|PILE-ON|HEADLINER|ADDENDUM|Rent comes|FORECLOSURE|OPENING STEAL|IMPROV|performing|rehears|PREDICTION|EXCLUSIVE|money shot|WALKOUT|picket|MUTED|VIOLATION|shadowban|Deplatform|Mirror Strike|anticipated/i.test(l)) {
          console.log(`    > ${clean}`);
        }
      }
    }
    const heard = [...new Set(audioFired)];
    const relevant = AUDIO_HOOKS.filter(h => heard.includes(h));
    console.log(`\naudio fired (${heard.length}): ${heard.join(', ') || 'none'}`);
    console.log(`relevant wave-2 hooks: ${relevant.join(', ') || 'NONE'}`);
    try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  }
  console.log('\nDONE');
})();
