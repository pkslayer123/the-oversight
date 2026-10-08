#!/usr/bin/env node
// PROOF TEST (Steve 2026-10-08) — dialog honest-opt-out architecture.
// Steve's report: "Conversations are largely nonsense right now. People
// getting mad I didn't answer a question when I had no good answer option."
//
// For EVERY bespoke question in characterGen.json convo.questions:
//   1. an honest opt-out choice exists in the pendingQ menu
//      (data-flagged honest_opt_out, or engine-appended ans:<qid>:honest_pass)
//   2. picking it costs NO trust and cools NO mood band
//   3. the NPC react contains no guilt-trip markers
// Plus a coherence floor: every question has >=2 answers, every answer has
// a non-empty label and react, and no react anywhere carries guilt markers.
// Seeded; SEED=... overrides. Run: node scripts/test-dialog-honest-optout-20261008.js
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

// Guilt-trip markers: an honest opt-out (or any answer) must never read cold.
const GUILT = [
  'shutters', 'They wanted to know you', 'withdraw a fraction',
  "don't forget how to be a person", 'stays in the air', 'a little too fast',
  'the fact that you went there', 'Something shutters', 'cold, but practical',
  'cold. But practical',
];

freshGame();
const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
if (!roster.length) { console.log('FAIL no villagers'); process.exit(1); }
const vid = roster[0];
const cg = (Game.data.characterGen || {}).convo || {};
const questions = cg.questions || [];
ok('question pool non-empty (36 expected)', questions.length === 36, 'got ' + questions.length);

// ---- coherence floor + data guilt audit ----
for (const q of questions) {
  ok(q.id + ' has >=2 answers', (q.answers || []).length >= 2, 'got ' + (q.answers || []).length);
  ok(q.id + ' has question text', !!(q.q && q.q.trim()), 'missing q');
  for (const a of (q.answers || [])) {
    ok(q.id + '/' + a.id + ' label non-empty', !!(a.label && String(a.label).trim()), 'empty label');
    ok(q.id + '/' + a.id + ' react non-empty', !!(a.react && String(a.react).trim()), 'empty react');
    for (const m of GUILT) {
      ok(q.id + '/' + a.id + ' react guilt-free', String(a.react || '').indexOf(m) === -1, 'marker: ' + m);
    }
  }
}

// ---- engine opt-out: menu presence + free resolution, per question ----
for (const q of questions) {
  const c = Game.convoGet(vid);
  c.active = true;
  c.pendingQ = q;
  const choices = Game.convoChoices(vid);
  const ids = choices.map(ch => ch.id);
  const engineOpt = 'ans:' + q.id + ':honest_pass';
  const dataOpt = (q.answers || []).filter(a => a.honest_opt_out).map(a => 'ans:' + q.id + ':' + a.id);
  const found = ids.indexOf(engineOpt) !== -1 ? engineOpt : dataOpt.find(id => ids.indexOf(id) !== -1);
  ok(q.id + ' offers honest opt-out', !!found, 'menu: ' + ids.join(','));
  if (!found) continue;
  // engine must not double-add when data supplies one
  if (dataOpt.length) {
    ok(q.id + ' no double opt-out', ids.indexOf(engineOpt) === -1, 'engine appended despite data flag');
  }
  // picking it: no trust cost, no mood cool, question resolves
  const t = Game.state.village.trust || {};
  const trustBefore = (t[vid] == null ? 10 : t[vid]);
  const bandBefore = Game.convoMoodBand(vid);
  const res = Game.convoTurn(vid, found);
  const trustAfter = (t[vid] == null ? 10 : t[vid]);
  const bandAfter = Game.convoMoodBand(vid);
  ok(q.id + ' opt-out costs no trust', trustAfter >= trustBefore, trustBefore + ' -> ' + trustAfter);
  ok(q.id + ' opt-out cools no mood', bandAfter >= bandBefore, bandBefore + ' -> ' + bandAfter);
  ok(q.id + ' opt-out resolves question', Game.convoGet(vid).pendingQ === null, 'pendingQ stuck');
  ok(q.id + ' opt-out returns a line', !!(res && res.line), 'no line');
  const line = (res && res.line) || '';
  for (const m of GUILT) {
    ok(q.id + ' opt-out react guilt-free', line.indexOf(m) === -1, 'marker: ' + m + ' :: ' + line.slice(0, 90));
  }
  // conversation continues: next menu is not stranded
  const next = Game.convoChoices(vid);
  ok(q.id + ' conversation continues', Array.isArray(next) && next.length > 0, 'empty menu after opt-out');
}

// ---- honest-pass react pool: varied per villager, stable per (villager, q) ----
{
  const r1 = Game.convoHonestPassReact('villagerA', 'q_origin');
  const r2 = Game.convoHonestPassReact('villagerA', 'q_origin');
  const rB = Game.convoHonestPassReact('villagerB', 'q_origin');
  ok('react stable per (villager, question)', r1 === r2);
  // across villagers the pool should vary (8 pool entries; two draws may collide by chance,
  // so check the pool itself has >1 distinct entry via several villagers)
  const seen = new Set();
  for (let i = 0; i < 12; i++) seen.add(Game.convoHonestPassReact('v' + i, 'q_origin'));
  ok('react varies across villagers (unique-person law)', seen.size > 1, 'all identical');
  for (const m of GUILT) {
    for (const r of seen) ok('pool react guilt-free', r.indexOf(m) === -1, 'marker: ' + m);
  }
}

// ---- deflect_q is still the rude option: costs trust, cools mood ----
{
  const q = questions[0];
  const c = Game.convoGet(vid);
  c.active = true;
  c.pendingQ = q;
  const t = Game.state.village.trust || {};
  t[vid] = 50;
  const trustBefore = t[vid];
  Game.convoTurn(vid, 'deflect_q');
  ok('deflect_q still costs trust (rude is a real choice now)', t[vid] < trustBefore, trustBefore + ' -> ' + t[vid]);
}

console.log(`\nseed ${SEED}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
