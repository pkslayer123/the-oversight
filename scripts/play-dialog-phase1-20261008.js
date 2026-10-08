#!/usr/bin/env node
// PLAY PASS (Steve 2026-10-08) — dialog Phase 1 as a player.
// Seeded. Prints transcripts for human reading. Scenarios:
//  1. Stranger: first conversation, small talk only
//  2. Opt-out: answer "I'd rather not say" to a personal question
//  3. Cruel to enemy: deflect + hostile at low trust
//  4. Cruel to friend: try cruelty at high trust (room-fit)
//  5. Honest-hard: "I don't trust you" lands with weight
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function makeRng(seed) {
  let a = seed | 0;
  const f = function () {
    a |= 0; a = a + 0x6D2B79F5 | 1;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  f.reset = (s) => { a = s | 0; };
  return f;
}
Math.random = makeRng(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'];
SCRIPTS.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

(async () => {
await Game.init();
delete global.window;
Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
Game.genRoster('Columbus, Ohio');
Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
Game.depart();
const s = Game.state.scholar;
s.health = 500; s.kcal = 2400; s.hydration = 100; s.mx = 4; s.my = 4;
(Game.log || []).length = 0;

const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);
const [stranger, friend] = roster;
const nameOf = (vid) => { try { return Game.displayName(vid); } catch (e) { return vid; } };

function showMenu(vid, menu) {
  console.log('  [menu]');
  for (const ch of menu) {
    console.log(`    - ${ch.id} :: ${ch.label} ${ch.temper ? '[' + ch.temper + ']' : ''}`);
  }
}

function playTurn(vid, choiceId) {
  const res = Game.convoTurn(vid, choiceId);
  if (res && res.line) console.log(`  THEM: ${res.line}`);
  return res;
}

console.log('=== SCENARIO 1: stranger (trust 10, first meeting) ===');
{
  Game.state.village.trust[stranger] = 10;
  const st = Game.startConvo(stranger);
  console.log(`  THEM: ${st.line}`);
  console.log(`  (tier: ${Game.convoVoiceTier(stranger)}, want: ${(Game.convoGet(stranger).want || {}).id})`);
  const menu = Game.convoChoices(stranger);
  showMenu(stranger, menu);
  Game.endConvo(stranger, 'done');
}

console.log('\n=== SCENARIO 2: opt-out ("I\'d rather not say") ===');
{
  const cg = Game.data.characterGen.convo;
  const q = cg.questions.find(q => q.id === 'q_kindness') || cg.questions[0];
  Game.startConvo(stranger);
  const c = Game.convoGet(stranger);
  c.pendingQ = q;
  console.log(`  THEM: ${q.q}`);
  const menu = Game.convoChoices(stranger);
  showMenu(stranger, menu);
  const optId = menu.find(ch => ch.id.endsWith(':honest_pass'))?.id ||
                'ans:' + q.id + ':' + q.answers.find(a => a.honest_opt_out).id;
  console.log(`  YOU pick: ${optId}`);
  const t0 = Game.state.village.trust[stranger];
  const b0 = Game.convoMoodBand(stranger);
  playTurn(stranger, optId);
  const t1 = Game.state.village.trust[stranger];
  const b1 = Game.convoMoodBand(stranger);
  console.log(`  (trust ${t0}->${t1}, mood ${b0}->${b1})`);
  Game.endConvo(stranger, 'done');
}

console.log('\n=== SCENARIO 3: cruel to stranger (deflect) ===');
{
  const cg = Game.data.characterGen.convo;
  const q = cg.questions[1];
  Game.state.village.trust[stranger] = 10;
  Game.startConvo(stranger);
  const c = Game.convoGet(stranger);
  c.pendingQ = q;
  console.log(`  THEM: ${q.q}`);
  const menu = Game.convoChoices(stranger);
  showMenu(stranger, menu);
  const t0 = Game.state.village.trust[stranger];
  console.log(`  YOU pick: deflect_q (rude dodge)`);
  playTurn(stranger, 'deflect_q');
  const t1 = Game.state.village.trust[stranger];
  console.log(`  (trust ${t0}->${t1}, disposition now ${Game.playerDisposition().toFixed(1)})`);
  Game.endConvo(stranger, 'done');
}

console.log('\n=== SCENARIO 4: cruel to friend (trust 40) — room-fit ===');
{
  const cg = Game.data.characterGen.convo;
  const q = cg.questions[2];
  Game.state.village.trust[friend] = 40;
  Game.startConvo(friend);
  const c = Game.convoGet(friend);
  c.pendingQ = q;
  console.log(`  THEM: ${q.q}`);
  const menu = Game.convoChoices(friend);
  showMenu(friend, menu);
  const cruelOpts = menu.filter(ch => ch.temper === 'cruel');
  console.log(`  (cruel options visible: ${cruelOpts.map(ch => ch.id).join(', ') || 'none — suppressed by room-fit'})`);
  Game.endConvo(friend, 'done');
}

console.log('\n=== SCENARIO 5: seed-driven (unfinished business) opens cooler ===');
{
  // Plant a seed manually, then start a convo.
  Game.state.village.convoSeeds = Game.state.village.convoSeeds || {};
  Game.state.village.convoSeeds[stranger] = {
    wantId: 'ask_favor', note: 'the help they asked you for', day: Game.state.scholar.day,
  };
  Game.state.village.trust[stranger] = 25;
  const c0 = Game.convoGet(stranger);
  const moodBefore = Game.convoMoodInit(stranger);
  const st = Game.startConvo(stranger);
  const c = Game.convoGet(stranger);
  console.log(`  THEM: ${st.line}`);
  console.log(`  (mood init ${moodBefore}, after seed ${c.mood}, want: ${(c.want || {}).id}, fromSeed: ${(c.want || {}).fromSeed})`);
  Game.endConvo(stranger, 'done');
}

console.log('\nDone. Read it like a person.');
})().catch(e => { console.error('FATAL', e); process.exit(2); });
