#!/usr/bin/env node
// PROOF TEST: the endgame deed gate (2026-10-10, Steve's directive).
// "You shouldn't be able to beat the game without going through a majority
// of game content. Don't gate on knowledge because some places won't allow
// people to get knowledge unlocked in other regions."
//
// The old Arc IV gate was breadth>=25 (KNOWLEDGE). The new gate is DEEDS
// (progression.js deedGateReady()):
//   - 3+ DISTINCT wave-3+ monsters FOUGHT (blow-by-blow, not unlocked),
//     at least 1 wave-4+
//   - 3+ contests SURVIVED (player taken and lived)
//   - scaleRank() >= 'national' (regional is deliberate partial credit: insufficient)
//   - 3+ distinct crises weathered
// plus kept: sentimentTaught, feastSurgeUsed (food-thesis deeds), stage>=3.
//
// Proves:
//   1. wavesFaced feeds from REAL paths: startCombat (a fight that actually
//      starts — the double-tap refusal records nothing), recordWaveKill
//      (all kill paths). Fleeing still counts — you stood on the grid.
//   2. contestsSurvived classifies honestly at the real _cxCountHeld choke:
//      player won/lost -> +1; watched-villager -> 0; real _contestRefuse -> 0;
//      real _contestDie -> 0; real _contestArenaAfter lost branch -> 0.
//   3. Scenario A (weak day-47-style run, the r3 organic winner: regional,
//      wave-2 max, 2 contests survived, 2 crises, high breadth 30, stage 3,
//      sentiment+surge) does NOT reach Arc IV/table.
//   4. Scenario B (knowledge-only: breadth 60, everything else stage-ready,
//      NO deeds) does NOT reach Arc IV — the knowledge gate is gone and
//      knowledge alone no longer opens the table.
//   5. Scenario C (genuine powerhouse: 3 wave-3 + 1 wave-4 fought via real
//      startCombat, 3 contests survived via real _contestEnd, national,
//      3 crises, sentiment+surge, LOW breadth 10) DOES reach Arc IV,
//      tableWaiting fires, tableScene fires, the final choice wins.
//   6. Scenario D (defense in depth): stale tableWaiting + unmet gate ->
//      tableScene withdraws the table ALOUD (no silent fire, no tableDone);
//      re-completing the deeds re-fires the invitation via checkArc.
// Green across 3 seeds: SEED=1/2/3 node scripts/test-deed-gate-20261010.js
const H = require('./sim-harness.js');
const SEED = parseInt(process.env.SEED || '20261010', 10);

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + name + (detail ? ' — ' + detail : '')); }
};

const W3 = ['redactor', 'gavel', 'spool'];
const W4 = ['eater'];

function abortFight(Game) {
  if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; }
  Game.state.scholar.monster = null;
}

(async () => {
  const { Game } = await H.loadGame({ seed: SEED });
  await H.setupGame(Game);
  Game.depart();
  console.log('== DEED GATE PROOF, SEED ' + SEED + ' ==');
  const said = [];
  const _say = Game.say, _sysSay = Game.sysSay;
  Game.say = (t) => { said.push(String(t)); };
  Game.sysSay = (t) => { said.push(String(t)); };
  const s = Game.state.scholar;
  const pg = () => Game.progState();
  const resetDeeds = () => { pg().deeds = null; Game.deedState(); };

  // ---------- 1. wave-fight feed ----------
  resetDeeds();
  for (const id of [...W3, ...W4]) {
    s.health = 9000; s.mx = 4; s.my = 4;
    Game.startCombat(id);
    ok(id + ' fight starts', !!Game.tbfight);
    ok(id + ' recorded in wavesFaced', Game.deedState().wavesFaced[id] >= 3, JSON.stringify(Game.deedState().wavesFaced));
    abortFight(Game);
  }
  // refusal path: a live fight blocks re-entry — no new tbfight, no deed.
  s.health = 9000;
  Game.startCombat('redactor');
  const liveFight = Game.tbfight;
  Game.startCombat('gavel'); // refused: already in a fight
  ok('double-tap re-entry refused', Game.tbfight === liveFight);
  ok('refused re-entry records no deed for gavel... (gavel already faced)',
    Game.deedState().wavesFaced.gavel === 3); // from the earlier real fight
  abortFight(Game);
  // a genuinely NEW monster via refused re-entry: use callback (w3, unfaced)
  s.health = 9000;
  Game.startCombat('redactor');
  Game.startCombat('callback'); // refused
  ok('refused fight records nothing new', !Game.deedState().wavesFaced.callback);
  abortFight(Game);
  // kill path feeds too (villager kills count — village is the protagonist)
  Game.recordWaveKill('buffering');
  ok('recordWaveKill feeds wavesFaced', Game.deedState().wavesFaced.buffering === 3);
  // wave 1-2 fights are the whole game, not the gate
  Game.recordWaveKill('bulldozer');
  ok('wave-1 kill not recorded', !Game.deedState().wavesFaced.bulldozer);

  // ---------- 2. contest-survival classification ----------
  resetDeeds();
  const n0 = () => Game.deedState().contestsSurvived;
  Game._contestEnd({ participant: 'player', contestId: 'cx_p1' }, 'won', false);
  ok('player won: survived+1', n0() === 1, 'got ' + n0());
  Game._contestEnd({ participant: 'player', contestId: 'cx_p2' }, 'lost', false);
  ok('player lost (lived): survived+1', n0() === 2, 'got ' + n0());
  Game._contestEnd({ participant: 'villagerX', contestId: 'cx_w1' }, 'won', false);
  ok('watched villager win: +0', n0() === 2, 'got ' + n0());
  Game._contestRefuse({ participant: 'player', contestId: 'cx_r1' });
  ok('real refusal path: +0', n0() === 2, 'got ' + n0());
  const overBefore = Game.over;
  Game._contestDie({ participant: 'player', contestId: 'cx_d1' }, 'the test');
  ok('real death path: +0', n0() === 2, 'got ' + n0());
  if (Game.over && !overBefore) Game.over = false; // the catch-fallback in _contestDie; classification is what we assert
  Game.state.activeContest = { participant: 'player', contestId: 'cx_a1' };
  Game._contestArenaAfter({ waveIdx: 0, waves: [] }, 'lost');
  ok('arena-lost branch: +0', n0() === 2, 'got ' + n0());
  Game._contestArenaAfter({ waveIdx: 0, waves: [] }, 'fled'); // -> _contestEnd lost -> survived
  // (fled needs an activeContest; set it again)
  Game.state.activeContest = { participant: 'player', contestId: 'cx_a2' };
  Game._contestArenaAfter({ waveIdx: 0, waves: [] }, 'fled');
  ok('arena fled (lived): +1', n0() === 3, 'got ' + n0());
  // once per contest object: multi-take verdicts call _contestEnd per contestant
  const multi = { participant: 'player', contestId: 'cx_m1' };
  Game._contestEnd(multi, 'won', false);
  Game._contestEnd(multi, 'won', false);
  ok('multi-take same ac: counted once', n0() === 4, 'got ' + n0());

  // ---------- scenario scaffolding ----------
  const stageReady = () => { Game.state.systemArrived = true; s.day = 47; s.integration = 85; pg().baseBreadth = 0; };
  const setBreadth = (n) => {
    Game.state.codex.plants = {};
    Game.state.codex.monsters = {}; Game.state.codex.animals = {};
    Game.state.codex.recipes = {}; Game.state.codex.techniques = {}; Game.state.codex.skills = {};
    for (let i = 0; i < n; i++) Game.state.codex.plants['weed' + i] = { level: 1 };
  };
  const setCrises = (kinds) => { pg().crises = {}; for (const k of kinds) pg().crises[k] = 1; };
  const setFoodDeeds = (on) => { pg().sentimentTaught = !!on; s.prog.feastSurgeUsed = !!on; };
  const setRank = (r) => { Game.scaleRank = () => r; };

  // ---------- 3. Scenario A: weak day-47-style run (the r3 organic winner) ----------
  resetDeeds(); stageReady(); setBreadth(30); setCrises(['first-grave', 'hunger-winter']);
  setFoodDeeds(true); setRank('regional'); pg().arc = 1; pg().arcSeen = {};
  // thin deeds: wave-2 max (never recorded), 2 contests survived, 2 crises
  Game.deedState().contestsSurvived = 2;
  Game.checkArc();
  const gA = Game.deedGateReady();
  ok('A: weak run reaches Arc III (want is real)', pg().arc === 3, 'arc=' + pg().arc);
  ok('A: deed gate fails (waves)', gA.waves === false, JSON.stringify(gA));
  ok('A: deed gate fails (contests)', gA.contests === false);
  ok('A: deed gate fails (crises)', gA.crises === false);
  ok('A: deed gate fails (scale)', gA.scale === false && gA.rank === 'regional');
  ok('A: NO tableWaiting', !pg().tableWaiting);
  ok('A: overall not ready', gA.ok === false);

  // ---------- 4. Scenario B: knowledge-only (high breadth, no deeds) ----------
  resetDeeds(); stageReady(); setBreadth(60); setCrises(['first-grave', 'hunger-winter']);
  setFoodDeeds(true); setRank('village'); pg().arc = 1; pg().arcSeen = {}; pg().tableWaiting = false;
  Game.checkArc();
  const gB = Game.deedGateReady();
  ok('B: knowledge-only reaches Arc III on breadth', pg().arc === 3, 'arc=' + pg().arc);
  ok('B: knowledge alone does NOT open the table', !pg().tableWaiting && gB.ok === false);

  // ---------- 6. Scenario D: defense in depth (before C ends the run) ----------
  resetDeeds(); stageReady(); setBreadth(20); setCrises(['first-grave']);
  setFoodDeeds(true); setRank('regional');
  pg().arc = 4; pg().arcSeen = { 4: true }; pg().tableWaiting = true; pg().tableDone = false;
  said.length = 0;
  Game.tableScene(); // stale invitation, deeds unmet
  ok('D: table does NOT fire on stale invitation', !pg().tableDone);
  ok('D: tableWaiting withdrawn', !pg().tableWaiting);
  ok('D: withdrawal said aloud', said.join(' ').includes('RESCHEDULE'), said.join(' ').slice(0, 120));
  // re-complete the deeds -> checkArc re-fires the invitation (arcBeat stays once)
  Game.deedState().wavesFaced = { redactor: 3, gavel: 3, spool: 3, eater: 4 };
  Game.deedState().contestsSurvived = 3;
  setCrises(['first-grave', 'hunger-winter', 'breach']); setRank('national');
  said.length = 0;
  Game.checkArc();
  ok('D: invitation re-fired when deeds hold', !!pg().tableWaiting);
  ok('D: re-fire said aloud', said.join(' ').includes('being set'));
  ok('D: arcBeat not re-run (arcSeen intact)', pg().arcSeen[4] === true);

  // ---------- 5. Scenario C: genuine powerhouse (deeds, LOW breadth) ----------
  // Breadth 15: clears Arc III's breadth>=12 but would have FAILED the old
  // Arc IV breadth>=25 gate — deeds, not knowledge, are the bar now.
  resetDeeds(); stageReady(); setBreadth(15); setCrises(['first-grave', 'hunger-winter', 'breach']);
  setFoodDeeds(true); setRank('national'); pg().arc = 1; pg().arcSeen = {}; pg().tableWaiting = false;
  for (const id of [...W3, ...W4]) {
    s.health = 9000; s.mx = 4; s.my = 4;
    Game.startCombat(id);
    abortFight(Game);
  }
  for (let i = 0; i < 3; i++) Game._contestEnd({ participant: 'player', contestId: 'pit' }, 'won', false);
  const gC = Game.deedGateReady();
  ok('C: powerhouse deed gate ready', gC.ok === true, JSON.stringify(gC));
  ok('C: 3+ distinct w3 fought, 1 w4', gC.w3 >= 3 && gC.w4 >= 1, `w3=${gC.w3} w4=${gC.w4}`);
  said.length = 0;
  Game.checkArc();
  ok('C: Arc IV reached', pg().arc === 4, 'arc=' + pg().arc);
  ok('C: tableWaiting set', !!pg().tableWaiting);
  ok('C: beat copy is deed-honest', said.join(' ').includes('made of deeds'), said.join(' ').slice(0, 200));
  Game.tableScene();
  ok('C: tableScene fires with deeds met', !!pg().tableDone && !!s.tableChoices);
  const choiceId = s.tableChoices.options[0].id;
  Game.chooseTableOption(choiceId);
  ok('C: final choice wins the run', Game.won === true && Game.over === true);

  Game.say = _say; Game.sysSay = _sysSay;
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e.stack || e.message); process.exit(1); });
