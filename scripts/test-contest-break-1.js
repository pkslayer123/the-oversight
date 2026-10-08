#!/usr/bin/env node
// CONTEST BREAK-IT #1 (2026-10-08) — HONESTY: every playable WIN choice must
// carry prize:true.
//
// CATCH: _contestTithe's "Offer your name instead" and _contestConfession's
// "Accuse the System" both resolved to WIN without prize:true, so
// contestChoose called _contestEnd(ac, 'won', undefined) — the player "won"
// the contest, took the winner's -5 health mark, and got NO alien-loot
// prize. Violates the template_prize rule (every playable WIN choice carries
// prize:true). Sibling: _contestGeneric's "Push hard" had the same hole.
//
// FIX: prize:true added to all three choices.
//
// PROOF: static sweep over every pool contest + the generic fallback, plus
// two played wins (tithe/confession) asserting the alien-loot prize lands
// in the scholar's inventory.
// FAILS on pre-fix code (tithe/confession WIN choices lack prize:true;
// played wins grant nothing). PASSES post-fix.
// Run: node scripts/test-contest-break-1.js
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
  Game.state.waveKills = { 1: 4 };
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
// Force a grabbed (no-choice) player contest for contestId, player alone.
function forcePlayerContest(contestId) {
  const contest = Game.contestPool().find(c => c.id === contestId);
  Game.state.pendingContest = null; Game.state.activeContest = null;
  Game.state.pendingContest = { contestId, participant: 'player', participants: ['player'], firesDay: 15, variant: null };
  Game.state.scholar.day = 15;
  scriptedRandom([0.99], () => Game.resolveContest()); // 0.99: grabbed, no choice
  return Game.state.activeContest;
}

(async () => {
  await Game.init();
  console.log('== CONTEST BREAK-IT #1: WIN choices carry prize:true ==');

  // --- static: every pool contest, every playable WIN choice ---
  await freshRun();
  const pool = Game.contestPool();
  const bad = [];
  for (const c of pool) {
    const ph = Game.contestPlayable(c);
    ph.forEach((p, i) => (p.choices || []).forEach(ch => {
      if (ch.next === 'WIN' && !(ch.do && ch.do.prize)) bad.push(`${c.id}[${i}]:"${ch.label}"`);
    }));
  }
  // sibling: the generic fallback
  Game._contestGeneric({ id: 'zz', name: 'ZZ', cat: 'zzz' })
    .forEach((p, i) => (p.choices || []).forEach(ch => {
      if (ch.next === 'WIN' && !(ch.do && ch.do.prize)) bad.push(`_contestGeneric[${i}]:"${ch.label}"`);
    }));
  ok('every WIN choice (44 contests + generic fallback) carries prize:true', bad.length === 0, bad.join('; ').slice(0, 300));

  // --- played: tithe "Offer your name instead" (non-knows branch) ---
  await freshRun();
  forcePlayerContest('tithe');
  const inv0 = (Game.state.scholar.inventory || []).length;
  scriptedRandom([0.5, 0.5, 0.5, 0.5, 0.5], () => {
    Game.contestChoose(0); // phase 0: A shallow cut
    Game.contestChoose(0); // phase 1: A little more
    Game.contestChoose(2); // phase 2: Offer your name instead -> WIN
  });
  const inv1 = (Game.state.scholar.inventory || []).length;
  ok('tithe "Offer your name instead" WIN grants the alien-loot prize', inv1 > inv0, `inventory ${inv0} -> ${inv1}`);
  ok('tithe contest resolved', !Game.state.activeContest);

  // --- played: confession "Accuse the System" ---
  await freshRun();
  forcePlayerContest('confession');
  const inv2 = (Game.state.scholar.inventory || []).length;
  const res = scriptedRandom([0.99, 0.99, 0.99, 0.99, 0.99, 0.99], () => {
    Game.contestChoose(0); // phase 0: Study the confessor
    Game.contestChoose(0); // phase 1: Press the details
    return Game.contestChoose(2); // phase 2: Accuse the System (die 0.25, scripted to survive) -> WIN
  });
  const inv3 = (Game.state.scholar.inventory || []).length;
  ok('confession "Accuse the System" WIN grants the alien-loot prize', inv3 > inv2, `inventory ${inv2} -> ${inv3}, outcome=${res && res.outcome}`);
  ok('confession contest resolved', !Game.state.activeContest);

  console.log(`\n== ${passN} pass, ${failN} fail ==`);
  if (fails.length) { console.log('FAILURES:'); fails.forEach(f => console.log(' - ' + f)); }
  process.exit(failN ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
