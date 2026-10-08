#!/usr/bin/env node
// PROOF TEST (Steve 2026-10-08) — dialog rethink Phase 1.
// Seeded; SEED=... overrides. Run 3+ seeds:
//   for s in 20261008 424242 777; do SEED=$s node scripts/test-dialog-phase1-20261008.js; done
//
// Asserts:
//  1. every bespoke question offers an honest opt-out (engine or data)
//  2. opt-out ("I'd rather not say") costs no trust/mood; honest-hard
//     answers ("I don't trust you"-style) DO move the relationship
//  3. deflecting a want resolves as 'deflected', never 'engaged'
//  4. "..." (silence) exists on every menu the builder produces
//  5. count-bypasses are dead: deep topics unreachable at trust 10 no
//     matter how high the convo count gets
//  6. disposition filter: temper tags exist, cruel options suppressed vs
//     close friends, out-of-character picks cost more
//  7. stranger menus: no confrontations, no deep wants, only small talk
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
Math.random = makeRng(SEED); // BEFORE eval: modules capture Math.random at load

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js touches window at load
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
delete global.window; // sync path for combat/convo
const Game = globalThis.Scattering.Game;

(async () => {
await Game.init();
delete global.window;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};

function freshGame() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100;
  s.mx = 4; s.my = 4;
  (Game.log || []).length = 0;
  return s;
}

function startFreshConvo(vid) {
  // Bypass startConvo's opener randomness: set up minimal active convo.
  const c = Game.convoGet(vid);
  c.active = true; c.over = false; c.pendingQ = null; c.thread = null;
  c.mood = Game.convoMoodInit(vid);
  return c;
}

freshGame();
const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
if (roster.length < 2) { console.log('FAIL need 2+ villagers'); process.exit(1); }
const vid = roster[0], vid2 = roster[1];
const cg = (Game.data.characterGen || {}).convo || {};
const questions = cg.questions || [];

console.log(`seed ${SEED}: ${questions.length} questions, testing with ${vid}, ${vid2}`);

// ---- 1. honest opt-out on every bespoke question ----
for (const q of questions) {
  const c = startFreshConvo(vid);
  c.pendingQ = q;
  const ids = Game.convoChoices(vid).map(ch => ch.id);
  const engineOpt = 'ans:' + q.id + ':honest_pass';
  const dataOpt = (q.answers || []).filter(a => a.honest_opt_out).map(a => 'ans:' + q.id + ':' + a.id);
  const found = ids.indexOf(engineOpt) !== -1 ? engineOpt : dataOpt.find(id => ids.indexOf(id) !== -1);
  ok(q.id + ' offers honest opt-out', !!found, 'menu: ' + ids.join(','));
}

// ---- 2a. opt-out costs nothing; 2b. honest-hard answers move relationship ----
// Find a data answer with temper honest-hard, or inject one for the test.
let hardQ = questions.find(q => (q.answers || []).some(a => a.temper === 'honest-hard'));
if (!hardQ) {
  // Inject a synthetic honest-hard answer onto the first question for the test.
  hardQ = questions[0];
  hardQ.answers.push({
    id: 'a_test_hard', label: '"I don\'t trust you enough to answer that."',
    react: '"...Fair. I hear you."', temper: 'honest-hard',
  });
}
{
  const q = hardQ;
  const hardA = q.answers.find(a => a.temper === 'honest-hard');
  const c = startFreshConvo(vid2);
  c.pendingQ = q;
  const t = Game.state.village.trust || {};
  t[vid2] = 30;
  const trustBefore = t[vid2];
  const bandBefore = Game.convoMoodBand(vid2);
  Game.convoTurn(vid2, 'ans:' + q.id + ':' + hardA.id);
  const trustAfter = t[vid2];
  const bandAfter = Game.convoMoodBand(vid2);
  ok('honest-hard answer moves trust', trustAfter < trustBefore, trustBefore + ' -> ' + trustAfter);
  ok('honest-hard answer cools mood', bandAfter <= bandBefore, bandBefore + ' -> ' + bandAfter);
  ok('honest-hard marks escalated', Game.convoGet(vid2).escalated === true, 'not escalated');
}

// ---- 3. deflect resolves as deflected, never engaged ----
{
  const c = startFreshConvo(vid);
  // Simulate a surfaced want, then deflect it.
  c.want = { id: 'ask_favor', def: null, stage: 1, fromSeed: false };
  // Use the real ask_favor def for the resolve path.
  const seed = Game.convoCheckSeeds(vid);
  Game.convoAdvanceWant(vid, 'deflect');
  ok('deflect sets resolution deflected', c.want.resolution === 'deflected', 'got ' + c.want.resolution);
  ok('deflect sets stage 3', c.want.stage === 3, 'got ' + c.want.stage);
  // Now resolve — must NOT become engaged.
  c.want.def = { resolve: () => null };
  Game.convoResolveWant(vid, 'done');
  ok('resolve keeps deflected (not engaged)', c.want.resolution === 'deflected', 'got ' + c.want.resolution);
}

// ---- 4. "..." on every menu ----
function menusToCheck(v) {
  const menus = [];
  // pendingQ menu
  let c = startFreshConvo(v);
  c.pendingQ = questions[0];
  menus.push(['pendingQ', Game.convoChoices(v)]);
  // generic menu
  c = startFreshConvo(v);
  menus.push(['generic', Game.convoChoices(v)]);
  return menus;
}
for (const v of [vid, vid2]) {
  for (const [name, menu] of menusToCheck(v)) {
    const ids = menu.map(ch => ch.id);
    ok(`${v} ${name} menu has silence`, ids.indexOf('silence') !== -1, 'menu: ' + ids.join(','));
  }
}

// ---- 5. count-bypasses dead: trust 10 + high count still can't reach deep topics ----
{
  const c = startFreshConvo(vid);
  const t = Game.state.village.trust || {};
  t[vid] = 10; // low trust
  c.count = 99; // absurdly high convo count — must NOT unlock
  c.firstDay = Game.state.scholar.day; // relAge 0
  // Open the subject menu (where topic asks live).
  Game.convoTurn(vid, 'dlg:subject');
  const ids = Game.convoChoices(vid).map(ch => ch.id);
  ok('no ask:goal at trust 10 + count 99', ids.indexOf('ask:goal') === -1, 'menu: ' + ids.join(','));
  // But trust 40 alone opens it (trust-tier gating works). Clear t2
  // fresh topics so the topic cap doesn't hide the gate result.
  t[vid] = 40;
  const c2 = startFreshConvo(vid);
  c2.said = c2.said || {};
  const t2list = Game.topic2Asks ? Game.topic2Asks(vid) : [];
  for (const a of t2list) { const tid = a.id.slice(4); c2.said['t2:' + tid] = [1]; }
  Game.convoTurn(vid, 'dlg:subject');
  const ids2 = Game.convoChoices(vid).map(ch => ch.id);
  ok('ask:goal opens at trust 40', ids2.indexOf('ask:goal') !== -1, 'menu: ' + ids2.join(','));
}

// ---- 6. disposition filter ----
{
  // Temper tags exist on engine choices.
  const c = startFreshConvo(vid);
  c.pendingQ = questions[0];
  const menu = Game.convoChoices(vid);
  const deflect = menu.find(ch => ch.id === 'deflect_q');
  ok('deflect_q has temper cruel', deflect && deflect.temper === 'cruel', JSON.stringify(deflect));
  const q0 = questions[0];
  const dataOptId = 'ans:' + q0.id + ':' + (q0.answers.find(a => a.honest_opt_out) || {}).id;
  const optOut = menu.find(ch => ch.id === 'ans:' + q0.id + ':honest_pass' || ch.id === dataOptId);
  ok('opt-out has temper neutral', optOut && (optOut.temper || 'neutral') === 'neutral', JSON.stringify(optOut));
  // Room-fit: cruel suppressed vs close friends (trust 40+, not escalated).
  const t = Game.state.village.trust || {};
  t[vid2] = 40;
  const c2 = startFreshConvo(vid2);
  c2.escalated = false;
  c2.pendingQ = questions[0];
  const menu2 = Game.convoChoices(vid2);
  const cruelCount = menu2.filter(ch => ch.temper === 'cruel' && ch.id !== 'deflect_q').length;
  ok('cruel (non-deflect) suppressed vs close friend', cruelCount === 0, 'found ' + cruelCount);
  // Out-of-character costs more: kind player deflecting pays double.
  Game.state.scholar.disposition = 2; // kind
  const c3 = startFreshConvo(vid);
  c3.pendingQ = questions[0];
  t[vid] = 20;
  const trustBefore = t[vid];
  Game.convoTurn(vid, 'deflect_q');
  const trustAfter = t[vid];
  ok('kind player deflect costs 2 (out-of-character)', trustBefore - trustAfter === 2, trustBefore + ' -> ' + trustAfter);
  Game.state.scholar.disposition = 0; // reset
}

// ---- 7. stranger menus: small talk only ----
{
  const c = startFreshConvo(vid);
  const t = Game.state.village.trust || {};
  t[vid] = 10;
  c.count = 0;
  c.firstDay = Game.state.scholar.day; // relAge 0 -> tier 'new'
  const tier = Game.convoVoiceTier(vid);
  ok('fresh villager is tier new', tier === 'new', 'got ' + tier);
  const menu = Game.convoChoices(vid);
  const ids = menu.map(ch => ch.id);
  const hasConfront = ids.some(id => String(id).indexOf('confront:') === 0);
  const hasDoubt = ids.indexOf('dlg:doubt') !== -1;
  ok('stranger menu has no confrontations', !hasConfront, 'menu: ' + ids.join(','));
  ok('stranger menu has no doubt probes', !hasDoubt, 'menu: ' + ids.join(','));
  // Deep wants don't surface for strangers.
  const want = Game.convoSelectWant(vid);
  const deepWants = ['ask_favor', 'seek_comfort', 'warn_you', 'curious', 'repay'];
  ok('stranger want is shallow', deepWants.indexOf(want.id) === -1, 'got ' + want.id);
}

console.log(`\n${pass} pass, ${fail} fail (seed ${SEED})`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
