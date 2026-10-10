#!/usr/bin/env node
// PROOF TEST: the endgame deed gate, RETUNED (Steve 2026-10-10).
// "We are targeting 100 days and having to progress through every monster
// wave etc." The old gate (3+ distinct wave-3+, >=1 wave-4) was too lax —
// a weak day-47 run could reach it. The new gate (progression.js
// deedGateReady()) requires EVERY wave 1-5, blow-by-blow:
//   - wave 1: 5+ distinct fought (of 15)
//   - wave 2: 5+ distinct fought (of 15)
//   - wave 3: 4+ distinct fought (of 9)
//   - wave 4: 3+ distinct fought (of 9)
//   - wave 5: 2+ distinct fought (of 8) — The Producers must be faced
//   - 3+ contests SURVIVED (player taken and lived)
//   - scaleRank() >= 'national'
//   - 3+ distinct crises weathered
// plus kept: sentimentTaught, feastSurgeUsed (food-thesis deeds), stage>=3.
// Knowledge NEVER gates (Steve's rule).
//
// Pacing (scripts/sim-wave-pacing-20261010.js): a strong run unlocks w5
// ~day 77-93 and completes 2+ distinct w5 ~day 83-99 — the bars above are
// completable in a ~100-day game without becoming a calendar script.
//
// Proves:
//   1. wavesFaced feeds from REAL paths for ALL waves 1-5 (was 3+ only):
//      startCombat (a fight that actually starts — the double-tap refusal
//      records nothing), recordWaveKill (all kill paths). Fleeing still
//      counts — you stood on the grid.
//   2. contestsSurvived classifies honestly at the real _cxCountHeld choke.
//   3. Scenario A (the r3 organic day-47 winner, sharpened: it fought plenty
//      of wave 1-2 but never saw wave 3+) does NOT reach Arc IV/table —
//      EVERY wave is required now.
//   4. Scenario B (knowledge-only: breadth 60, no deeds) does NOT reach Arc
//      IV — knowledge alone never opens the table.
//   5. Scenario C (genuine powerhouse: all five waves fought via real
//      startCombat at the per-wave bars, 3 contests, national, 3 crises,
//      sentiment+surge, LOW breadth 15) DOES reach Arc IV, tableWaiting
//      fires, tableScene fires, the final choice wins.
//   6. Scenario D (defense in depth): stale tableWaiting + unmet gate ->
//      tableScene withdraws the table ALOUD; re-completing the full deed
//      set re-fires the invitation via checkArc.
// Green across 3 seeds: SEED=1/2/3 node scripts/test-deed-gate-20261010.js
const H = require('./sim-harness.js');
const SEED = parseInt(process.env.SEED || '20261010', 10);

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + name + (detail ? ' — ' + detail : '')); }
};

const W1 = ['bulldozer', 'hushwolf', 'gallowdeer', 'mirrormoth', 'belltoad'];
const W2 = ['voice_mimic_radio', 'mirror_stag', 'review_drone', 'bright_idea', 'memory_projector'];
const W3 = ['redactor', 'gavel', 'focus_group', 'spool'];
const W4 = ['eater', 'congregation', 'strike'];
const W5 = ['cancellation', 'editor'];

function abortFight(Game) {
  if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; }
  Game.state.scholar.monster = null;
}

(async () => {
  const { Game } = await H.loadGame({ seed: SEED });
  await H.setupGame(Game);
  Game.depart();
  console.log('== DEED GATE RETUNE PROOF, SEED ' + SEED + ' ==');
  const said = [];
  const _say = Game.say, _sysSay = Game.sysSay;
  Game.say = (t) => { said.push(String(t)); };
  Game.sysSay = (t) => { said.push(String(t)); };
  const s = Game.state.scholar;
  const pg = () => Game.progState();
  const resetDeeds = () => { pg().deeds = null; Game.deedState(); };

  // ---------- 1. wave-fight feed, ALL waves ----------
  resetDeeds();
  for (const [ids, w] of [[W1, 1], [W2, 2], [W3, 3], [W4, 4], [W5, 5]]) {
    for (const id of ids) {
      s.health = 9000; s.mx = 4; s.my = 4;
      Game.startCombat(id);
      ok(id + ' fight starts', !!Game.tbfight);
      ok(id + ' recorded in wavesFaced as w' + w, Game.deedState().wavesFaced[id] === w,
        JSON.stringify(Game.deedState().wavesFaced));
      abortFight(Game);
    }
  }
  // refusal path: a live fight blocks re-entry — no new tbfight, no deed.
  s.health = 9000;
  Game.startCombat('redactor');
  const liveFight = Game.tbfight;
  Game.startCombat('gavel'); // refused: already in a fight
  ok('double-tap re-entry refused', Game.tbfight === liveFight);
  abortFight(Game);
  // kill path feeds too (villager kills count — village is the protagonist)
  Game.recordWaveKill('buffering');
  ok('recordWaveKill feeds wavesFaced', Game.deedState().wavesFaced.buffering === 3);
  Game.recordWaveKill('bulldozer');
  ok('wave-1 kill recorded (retune: every wave feeds)', Game.deedState().wavesFaced.bulldozer === 1);

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
  if (Game.over && !overBefore) Game.over = false;
  Game.state.activeContest = { participant: 'player', contestId: 'cx_a1' };
  Game._contestArenaAfter({ waveIdx: 0, waves: [] }, 'lost');
  ok('arena-lost branch: +0', n0() === 2, 'got ' + n0());
  Game.state.activeContest = { participant: 'player', contestId: 'cx_a2' };
  Game._contestArenaAfter({ waveIdx: 0, waves: [] }, 'fled');
  ok('arena fled (lived): +1', n0() === 3, 'got ' + n0());
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
  const fightAll = (ids) => { for (const id of ids) { s.health = 9000; s.mx = 4; s.my = 4; Game.startCombat(id); abortFight(Game); } };

  // ---------- 3. Scenario A: the r3 organic day-47 winner, sharpened ----------
  // It fought plenty of wave 1-2 (5+5 distinct, like a real 47-day run) but
  // never saw wave 3+. Under the retune, EVERY wave is required.
  resetDeeds(); stageReady(); setBreadth(30); setCrises(['first-grave', 'hunger-winter']);
  setFoodDeeds(true); setRank('regional'); pg().arc = 1; pg().arcSeen = {};
  fightAll([...W1, ...W2]);
  Game.deedState().contestsSurvived = 2;
  Game.checkArc();
  const gA = Game.deedGateReady();
  ok('A: weak run reaches Arc III (want is real)', pg().arc === 3, 'arc=' + pg().arc);
  ok('A: w1/w2 bars met (fought plenty)', gA.w1 >= 5 && gA.w2 >= 5, `w1=${gA.w1} w2=${gA.w2}`);
  ok('A: deed gate fails — wave 3+ never faced', gA.waves === false, JSON.stringify({ w3: gA.w3, w4: gA.w4, w5: gA.w5 }));
  ok('A: NO tableWaiting', !pg().tableWaiting);
  ok('A: overall not ready', gA.ok === false);

  // ---------- 4. Scenario B: knowledge-only ----------
  resetDeeds(); stageReady(); setBreadth(60); setCrises(['first-grave', 'hunger-winter']);
  setFoodDeeds(true); setRank('village'); pg().arc = 1; pg().arcSeen = {}; pg().tableWaiting = false;
  Game.checkArc();
  const gB = Game.deedGateReady();
  ok('B: knowledge-only reaches Arc III on breadth', pg().arc === 3, 'arc=' + pg().arc);
  ok('B: knowledge alone does NOT open the table', !pg().tableWaiting && gB.ok === false);

  // ---------- 6. Scenario D: defense in depth ----------
  resetDeeds(); stageReady(); setBreadth(20); setCrises(['first-grave']);
  setFoodDeeds(true); setRank('regional');
  pg().arc = 4; pg().arcSeen = { 4: true }; pg().tableWaiting = true; pg().tableDone = false;
  said.length = 0;
  Game.tableScene(); // stale invitation, deeds unmet
  ok('D: table does NOT fire on stale invitation', !pg().tableDone);
  ok('D: tableWaiting withdrawn', !pg().tableWaiting);
  ok('D: withdrawal said aloud', said.join(' ').includes('RESCHEDULE'), said.join(' ').slice(0, 120));
  // re-complete the FULL deed set -> checkArc re-fires the invitation
  Game.deedState().wavesFaced = {};
  [...W1, ...W2, ...W3, ...W4, ...W5].forEach((id) => {
    const mdef = Game.data.monsters.find(m => m.id === id);
    Game.deedState().wavesFaced[id] = mdef ? mdef.wave : 1;
  });
  Game.deedState().contestsSurvived = 3;
  setCrises(['first-grave', 'hunger-winter', 'breach']); setRank('national');
  said.length = 0;
  Game.checkArc();
  ok('D: invitation re-fired when full deed set holds', !!pg().tableWaiting);
  ok('D: re-fire said aloud', said.join(' ').includes('being set'));
  ok('D: arcBeat not re-run (arcSeen intact)', pg().arcSeen[4] === true);

  // ---------- 5. Scenario C: genuine powerhouse, all five waves ----------
  resetDeeds(); stageReady(); setBreadth(15); setCrises(['first-grave', 'hunger-winter', 'breach']);
  setFoodDeeds(true); setRank('national'); pg().arc = 1; pg().arcSeen = {}; pg().tableWaiting = false;
  fightAll([...W1, ...W2, ...W3, ...W4, ...W5]);
  for (let i = 0; i < 3; i++) Game._contestEnd({ participant: 'player', contestId: 'pit' }, 'won', false);
  const gC = Game.deedGateReady();
  ok('C: powerhouse deed gate ready', gC.ok === true, JSON.stringify(gC));
  ok('C: per-wave bars met', gC.w1 >= 5 && gC.w2 >= 5 && gC.w3 >= 4 && gC.w4 >= 3 && gC.w5 >= 2,
    `w1=${gC.w1} w2=${gC.w2} w3=${gC.w3} w4=${gC.w4} w5=${gC.w5}`);
  said.length = 0;
  Game.checkArc();
  ok('C: Arc IV reached', pg().arc === 4, 'arc=' + pg().arc);
  ok('C: tableWaiting set', !!pg().tableWaiting);
  ok('C: beat copy is deed-honest', said.join(' ').includes('made of deeds'), said.join(' ').slice(0, 200));
  Game.tableScene();
  ok('C: tableScene fires and wins', !!pg().tableDone, 'tableDone=' + pg().tableDone);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
