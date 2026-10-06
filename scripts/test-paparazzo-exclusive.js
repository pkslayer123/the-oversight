#!/usr/bin/env node
// PROOF TEST (Steve 2026-10-06): Paparazzo → wave-2 bar. The money shot must fire.
//
// BEFORE (audit 2026-10-06): prediction stacked +1 per RESOLVE (+1 per 2 rounds),
//   threshold 5 → exclusive earliest on monster-turn 6; ~3-round fights meant the
//   second act almost never fired. tg.unavoidable was set at declare but never
//   read — "UNAVOIDABLE" was text-only. o.frozen was write-only — the "freeze"
//   was text-only too. No knownCue. No armor/resistances.
// AFTER: prediction stacks +1 per DECLARE (+1/round), threshold 4, unavoidable
//   phase-locked to ⭐ EXCLUSIVE and REAL (re-centers on the target at resolve),
//   freeze via stunned (lose-move/keep-action, actually consumed), knownCue,
//   armor 0 + energy 0.5.
// Run: node scripts/test-paparazzo-exclusive.js
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

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function note(t) { console.log(t); }
const P = () => Game.tbFighter('p');
const M = () => Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive);
const says = [];
// Guarded endTurn: exactly one AI round per player action (AGENTS.md).
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function strikeM(m) { let r = false; if (Game.tbIsPlayerTurn()) r = Game.tbPlayerStrike(m.key); endTurn(); return r; }
function flatGrid() { return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')); }
function stepToward(tx, ty) {
  const p = P(); if (!Game.tbIsPlayerTurn() || p.moveLeft <= 0) return false;
  const dx = Math.sign(tx - p.mx), dy = Math.sign(ty - p.my);
  const nx = Math.min(7, Math.max(1, p.mx + dx)), ny = Math.min(7, Math.max(1, p.my + dy));
  if (nx === p.mx && ny === p.my) return false;
  return !!Game.tbPlayerMove(nx, ny);
}
// player brain, played like a player: dodge the telegraphed cells, close, strike.
function playerBrain(m) {
  if (!Game.tbIsPlayerTurn()) { endTurn(); return; }
  let p = P();
  // 1. dodge: if the declared burst covers us and we can move, step clear
  const tg = m.telegraph;
  if (tg && tg.cells && p.moveLeft > 0) {
    const inCells = tg.cells.some(c => c.cx === p.mx && c.cy === p.my);
    if (inCells) {
      const cellSet = new Set(tg.cells.map(c => c.cx + ',' + c.cy));
      // safe tile, prefer closer to the monster (stay aggressive)
      let best = null, bestD = 1e9;
      for (let y = 1; y <= 7; y++) for (let x = 1; x <= 7; x++) {
        if (cellSet.has(x + ',' + y)) continue;
        const step = Math.max(Math.abs(x - p.mx), Math.abs(y - p.my));
        if (step > p.moveLeft || step === 0) continue;
        const dm = Math.max(Math.abs(x - m.mx), Math.abs(y - m.my));
        if (dm < bestD) { bestD = dm; best = { x, y }; }
      }
      if (best) Game.tbPlayerMove(best.x, best.y);
    }
  }
  // 2. strike in range, else close
  p = P();
  let d = Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my));
  while (d > 2 && p.moveLeft > 0 && Game.tbIsPlayerTurn()) {
    if (!stepToward(m.mx, m.my)) break;
    p = P();
    d = Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my));
  }
  if (Game.tbIsPlayerTurn() && d <= 2) strikeM(m);
  else endTurn();
}

(async () => {
  await Game.init();
  Game.say = (t) => { says.push(String(t)); };
  Game.genDetail = () => flatGrid();

  // ---- BEFORE/AFTER ----
  // BEFORE (audit 2026-10-06 §3): threshold 5, +1 per RESOLVE (+1 per 2 rounds)
  //   → exclusive earliest turn 6; ~3-round fights meant the second act almost
  //   never fired. (HEAD pinned at threshold 5; the tree is too churny for a
  //   live git-show baseline, so the audit is the recorded before-state.)
  const newSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  const newThresh = (newSrc.match(/pzPrediction >= (\d) && m\.beamPhase !== 'exclusive'/) || [])[1];
  note(`BEFORE (audit): threshold=5, +1 per RESOLVE (+1/2 rounds) → exclusive earliest turn 6`);
  note(`AFTER (worktree): threshold=${newThresh}, +1 per DECLARE (+1/round) → exclusive ~turn 4`);
  check('pacing constants changed (5/resolve → 4/declare)', newThresh === '4' && /PREDICTION stacks on the COMMIT/.test(newSrc));

  // ---- audio registry ----
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  check('app.js registry maps paparazzoExclusive', /paparazzoExclusive\(\) \{ paparazzoExclusive\(\); \}/.test(appSrc));
  const synthBody = (appSrc.match(/function paparazzoExclusive\(\) \{([\s\S]*?)\n    \}\n    function /) || [])[1] || '';
  check('paparazzoExclusive synth is real (not a stub)',
    /createOscillator/.test(synthBody) && /createBuffer/.test(synthBody) && synthBody.length > 500);

  // ---- data ----
  const mdef = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'))
    .find(m => m.id === 'paparazzo');
  const kc = (mdef.encounter || {}).knownCue || '';
  check('knownCue present', typeof kc === 'string' && kc.length > 20);
  check('armor is 0 (deliberate: glass, not hide)', mdef.armor === 0);
  check('energy resistance 0.5', (mdef.resistances || {}).energy === 0.5);
  const moves = ['Flash Photography', 'Prediction', 'Widening'];
  const low = newSrc.toLowerCase();
  check('codex slain moves all implemented in game.js',
    moves.every(mv => low.includes(mv.toLowerCase())), moves.filter(mv => !low.includes(mv.toLowerCase())).join(','));

  // ---- capture audio ----
  const audioFired = [];
  Game.audio = new Proxy({}, { get: (t, k) => (...a) => { audioFired.push(String(k)); } });

  // ---- FIGHT ----
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = 1;
  Game.state.scholar.health = 500;
  Game.state.scholar.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  Game.canSee = () => true;
  Game.startCombat('paparazzo');
  let m = M();
  m.hp = m.maxHp = 85;
  const pl = P(); pl.hp = pl.maxHp = 200;
  pl.mx = 4; pl.my = 6; m.mx = 4; m.my = 2;
  Game.state.scholar.mx = pl.mx; Game.state.scholar.my = pl.my;

  let exclusiveRound = -1, exclusiveMhp = -1, sawTracking = false, sawWiden = false;
  let moneyShotHitWhileClear = false, moneyShotProofDetail = '';
  let cueBeforeKnown = null, cueAfterKnown = null;
  note('\n-- fight trace (round: pred/phase, php/mhp) --');
  for (let round = 1; round <= 14; round++) {
    if (!Game.tbfight || Game.tbfight.over) break;
    m = M(); if (!m) break;
    const pp = P();
    note(`  r${round}: pred=${m.pzPrediction}/4 phase=${m.beamPhase} php=${pp.hp} mhp=${m.hp} p@(${pp.mx},${pp.my}) m@(${m.mx},${m.my})`);
    if (m.beamPhase === 'tracking') sawTracking = true;
    if (m.pzWidenSaid) sawWiden = true;
    // knownCue: capture cue before learning (first telegraph) and after
    if (m.telegraph && Game.tbPatternKnown('paparazzo', 'Flash Photography') && cueAfterKnown === null) {
      cueAfterKnown = Game.tbTelegraphCue(m);
    }
    if (m.beamPhase === 'exclusive' && exclusiveRound < 0) {
      exclusiveRound = round;
      exclusiveMhp = m.hp;
      note(`  *** EXCLUSIVE on round ${round} — monster alive at ${m.hp}/${m.maxHp} ***`);
      // MONEY-SHOT PROOF: declared cells are centered where the player WAS.
      // Teleport the player to an interior tile clear of the DECLARED cells at
      // flash range (3-6, so it resolves instead of repositioning), then resolve.
      // Old code: clean dodge. New code: re-centered → still hit.
      const declared = new Set((m.telegraph.cells || []).map(c => c.cx + ',' + c.cy));
      let placed = null;
      for (let y = 1; y <= 7 && !placed; y++) for (let x = 1; x <= 7 && !placed; x++) {
        const d = Math.max(Math.abs(x - m.mx), Math.abs(y - m.my));
        if (d >= 3 && d <= 6 && !declared.has(x + ',' + y)) placed = { x, y, d };
      }
      if (placed) {
        pp.mx = placed.x; pp.my = placed.y;
        Game.state.scholar.mx = placed.x; Game.state.scholar.my = placed.y;
        const hpBefore = pp.hp;
        endTurn(); // monster resolves the unavoidable flash
        m = M();
        moneyShotProofDetail = `clearOfDeclared=true d=${placed.d} hp ${hpBefore}→${pp.hp}`;
        if (m && pp.hp < hpBefore) moneyShotHitWhileClear = true;
      } else moneyShotProofDetail = 'no clear tile found (geometry)';
      note(`  money-shot proof: ${moneyShotProofDetail} ${moneyShotHitWhileClear ? '(RE-CENTERED: hit while clear)' : ''}`);
      continue;
    }
    if (cueBeforeKnown === null && m.telegraph && !Game.tbPatternKnown('paparazzo', 'Flash Photography')) {
      cueBeforeKnown = Game.tbTelegraphCue(m);
    }
    playerBrain(m);
  }
  note(`\naudio fired: ${[...new Set(audioFired)].join(', ')}`);

  check('exclusive (2nd act) fires while monster alive', exclusiveRound > 0 && exclusiveMhp > 0, `round=${exclusiveRound} mhp=${exclusiveMhp}`);
  check('exclusive within a normal fight (<=8 rounds)', exclusiveRound > 0 && exclusiveRound <= 8, `round=${exclusiveRound}`);
  check('candid → tracking → exclusive arc readable', sawTracking && exclusiveRound > 0);
  check('widening shot announced before exclusive', sawWiden);
  const froze = says.some(s => s.includes("You're frozen — you can't move. (stunned)"));
  const flashed = says.some(s => s.includes('FLASH. The world goes white'));
  check('flash freezes via real stunned (lose-move/keep-action)', flashed && froze,
    `flashed=${flashed} froze=${froze}`);
  check('paparazzoExclusive audio fired (money-shot sting)', audioFired.includes('paparazzoExclusive'));
  check('paparazzoShutter audio fired on declares', audioFired.filter(a => a === 'paparazzoShutter').length >= 3);
  check('money shot REALLY unavoidable (hit while clear of declared cells)',
    moneyShotHitWhileClear, moneyShotProofDetail);
  check('knownCue hidden before pattern learned',
    cueBeforeKnown !== null && !cueBeforeKnown.includes(kc), cueBeforeKnown ? 'cue captured' : 'no early cue');
  check('knownCue appended after pattern learned',
    cueAfterKnown !== null && cueAfterKnown.includes(kc), cueAfterKnown ? 'cue captured' : 'no late cue');
  const mdefNow = (Game.data.monsters || []).find(x => x.id === 'paparazzo') || {};
  check('mdef armor/resistances live in Game.data', mdefNow.armor === 0 && (mdefNow.resistances || {}).energy === 0.5);

  note(`\nRESULT: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
