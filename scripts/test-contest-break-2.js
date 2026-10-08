#!/usr/bin/env node
// CONTEST BREAK-IT #2 (2026-10-08) — DEAD-CODE: the benevolent lifeline could
// never fire.
//
// CATCH: apContestInterference() was called ONLY from _contestVerdict (watch
// mode), where the player is never a participant — so its playerIn guard
// (participants includes 'player') could never pass in real play. The
// benevolent lifeline ("a bonded ally may save you from death") was fully
// built, honesty-fixed, and dead.
//
// FIX: contestChoose now calls apContestInterference(ac, {forPlayer:true})
// at the player's own death roll; a save converts the death into a loss
// (the sequence still runs — interruption law holds). The {forPlayer:true}
// mode skips the verdict-only branches (sadistic rigging, fan favor),
// which bend verdict win odds that don't exist on the playable path.
//
// PROOF:
//   A. With a bonded benevolent persona (Wren, bond 3), a scripted death
//      roll in The Pit converts to a loss: player alive, outcome 'lost',
//      lifeline note in the log.
//   B. apContestInterference(ac, {forPlayer:true}) never bends win odds
//      (winMod 0) even at high favor — verdict-only effects stay out.
//   C. Regression: plain apContestInterference(ac) in watch mode still
//      applies sadistic rigging + fan favor (verdict behavior unchanged).
// FAILS on pre-fix code (death roll -> 'died', player dead). PASSES post-fix.
// Run: node scripts/test-contest-break-2.js
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // BEFORE eval: modules capture it at load
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(read(f))) });
global.window = global; // equipment.js touches window at load
const _SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/alienPlayers.js',
 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
 'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'];
// drama.js excluded: DOM at load. All Game.drama calls are try/caught.
_SCRIPTS.forEach(f => eval(read(f)));
delete global.window; // sync combat path
const Game = globalThis.Scattering.Game;

let passN = 0, failN = 0; const fails = [];
function ok(name, cond, extra) {
  if (cond) { passN++; }
  else { failN++; fails.push(name + (extra ? ' — ' + extra : '')); console.log(`   [FAIL] ${name}${extra ? ' — ' + extra : ''}`); }
}
function drain() { const l = Game.log || []; const s = l.map(x => x.text || x).join('\n'); l.length = 0; return s; }
async function freshRun() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = 15; Game.state.systemArrived = true;
  Game.state.waveKills = { 1: 4 }; // unlockedWave() >= 2 -> apEligible()
  s.health = 500; s.maxHealth = 500; s.kcal = 2400; s.hydration = 100; s.trauma = 0;
  const v = Game.state.village; v.positions = v.positions || {};
  (v.roster || []).filter(id => id !== Game.villagerId).slice(0, 3)
    .forEach((id, i) => { v.positions[id] = { x: 2 + i, y: 2 + i }; });
  drain();
}
function scriptedRandom(seq, fn) {
  const r = Math.random; let i = 0;
  Math.random = () => (i < seq.length ? seq[i++] : 0.99);
  try { return fn(); } finally { Math.random = r; }
}
function bondWren() {
  const ap = Game.apState();
  ap.met = { wren: { encounters: 3, bond: 3, lastDay: 1 } };
  ap.favor = 0;
  ap.lastLifelineDay = -999; ap.lastRigDay = -999;
}
function forcePlayerContest(contestId) {
  Game.state.pendingContest = null; Game.state.activeContest = null;
  Game.state.pendingContest = { contestId, participant: 'player', participants: ['player'], firesDay: 15, variant: null };
  Game.state.scholar.day = 15;
  scriptedRandom([0.99], () => Game.resolveContest()); // grabbed, no choice
  return Game.state.activeContest;
}

(async () => {
  await Game.init();
  console.log('== CONTEST BREAK-IT #2: benevolent lifeline is reachable ==');
  await freshRun();
  ok('apEligible() true in harness (post-System, wave 2+)', Game.apEligible() === true);

  // --- A. lifeline converts the player's death roll into a loss ---
  bondWren();
  forcePlayerContest('pit');
  ok('pit contest active (player taken)', !!Game.state.activeContest);
  let res = null;
  scriptedRandom(
    // phase0 Spear: no RNG. phase1 'Charge it': dmg roll, die roll (0.05<0.20 -> dies),
    // lifeline roll (0.05<0.4 -> fires)
    [0.5, 0.05, 0.05, 0.99, 0.99],
    () => {
      Game.contestChoose(0); // Declare: Spear
      res = Game.contestChoose(1); // Escalate: Charge it (die 0.20)
    });
  const txt = drain();
  ok('death roll with bonded ally resolves to loss, not death', res && res.outcome === 'lost', 'outcome=' + (res && res.outcome));
  ok('player survives the saved blow', (Game.state.scholar.health || 0) > 0 && !Game.state.over);
  ok('lifeline note fired ("the killing blow... misses")', /killing blow\.\.\. misses/i.test(txt), txt.slice(0, 160));
  ok('contest sequence terminated (no skip, no stuck modal)', !Game.state.activeContest);

  // --- A2. no bonded ally -> the same roll kills (control) ---
  await freshRun(); // no bondWren: no allies at all
  forcePlayerContest('pit');
  let res2 = null;
  scriptedRandom([0.5, 0.05, 0.99, 0.99, 0.99], () => {
    Game.contestChoose(0);
    res2 = Game.contestChoose(1);
  });
  ok('control: same death roll with no ally still kills', res2 && res2.outcome === 'died', 'outcome=' + (res2 && res2.outcome));

  // --- B. forPlayer mode never bends win odds ---
  await freshRun(); bondWren();
  Game.apState().favor = 50; // high favor: verdict mode would grant +0.08
  const ac = { contestId: 'pit', participant: 'player', participants: ['player'] };
  const itf = scriptedRandom([0.99], () => Game.apContestInterference(ac, { forPlayer: true }));
  ok('forPlayer mode: winMod is 0 even at favor 50 (verdict-only effects skipped)', itf.winMod === 0, 'winMod=' + itf.winMod);
  drain();

  // --- C. regression: verdict-mode interference unchanged ---
  await freshRun(); bondWren();
  Game.apState().favor = 50;
  const itf2 = scriptedRandom([0.99], () => Game.apContestInterference({ contestId: 'pit', participant: 'v1', participants: ['v1'] }));
  ok('verdict mode: fan favor still bends win odds (+0.08)', itf2.winMod === 0.08, 'winMod=' + itf2.winMod);
  drain();

  console.log(`\n== ${passN} pass, ${failN} fail ==`);
  if (fails.length) { console.log('FAILURES:'); fails.forEach(f => console.log(' - ' + f)); }
  process.exit(failN ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
