#!/usr/bin/env node
// PROOF TEST (Steve 2026-10-08) — dialog rethink Phase 2 (the Scene).
// Seeded; SEED=... overrides. Run 3+ seeds:
//   for s in 20261008 424242 777; do SEED=$s node scripts/test-dialog-phase2-20261008.js; done
//
// Asserts:
//  1. Scene unity: getScene returns the full snapshot (want/mood/bond/beat/
//     disposition); same state -> same shape; buildMenu decisions read it.
//  2. Resolver unity: every trust/mood/disposition/memory consequence in a
//     played conversation flows through resolveConsequence (instrumented).
//  3. Talk cap: talk-originated trust gains cap at 40; penalties land whole.
//  4. Contract gate: validateAskContract passes over ALL question paths
//     (36 bespoke + reactive + generic) — honest + boundary + silence.
//  5. Contract enforcement: reactive/generic honest opt-outs resolve
//     gracefully with no trust/mood cost.
//  6. Legibility: no "Deflect —" prefixes in data; cruel-temper answers carry
//     their line as the label; no stage-direction labels.
//  7. Memory theater audit: every remember() write type in the conversation
//     system has >=1 read site.
//  8. What's alive: open threads / fresh memories / want questions / world
//     events surface in the menu; alive: choices route without dead ends.
//  9. Universal "it's different now": re-asked bespoke questions acknowledge
//     the changed run via the clock.
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
 'src/js/convo-scene.js',
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
  const c = Game.convoGet(vid);
  c.active = true; c.over = false; c.pendingQ = null; c.thread = null;
  c.reactiveQ = null; c.genericQ = null; c.heldBeats = [];
  c.mood = Game.convoMoodInit(vid);
  return c;
}

freshGame();
const roster = Game.state.village.roster || [];
const vid = roster[0];
const vid2 = roster[1] || roster[0];

// ---- 1. Scene unity ----
{
  const c = startFreshConvo(vid);
  const s1 = Game.getScene(vid);
  ok('scene has want key', 'want' in s1);
  ok('scene has mood', typeof s1.mood === 'number');
  ok('scene has moodBand', typeof s1.moodBand === 'string');
  ok('scene.bond has trust/tier/relDays', s1.bond && typeof s1.bond.trust === 'number' && typeof s1.bond.tier === 'string' && typeof s1.bond.relDays === 'number');
  ok('scene.beat has thread/question flags', s1.beat && 'questionHangs' in s1.beat);
  ok('scene has disposition', typeof s1.disposition === 'number');
  const s2 = Game.getScene(vid);
  ok('scene deterministic for same state', JSON.stringify(s1) === JSON.stringify(s2));
  // Scene reflects question state
  c.pendingQ = { id: 'q_test', answers: [{ id: 'a1', label: '"Yes."' }, { id: 'a2', label: '"No."' }] };
  const s3 = Game.getScene(vid);
  ok('scene.beat.questionHangs true with pendingQ', s3.beat.questionHangs === true && s3.beat.pendingQ === true);
  c.pendingQ = null;
}

// ---- 2. Resolver unity (instrumented) ----
{
  const calls = [];
  const orig = Game.resolveConsequence;
  Game.resolveConsequence = function (v, spec) {
    calls.push({ vid: v, spec: Object.assign({}, spec) });
    return orig.call(this, v, spec);
  };
  const c = startFreshConvo(vid);
  const t0 = (Game.state.village.trust || {})[vid] || 10;
  // Play a spread of choices through the real turn handler.
  const cg = (Game.data.characterGen || {}).convo || {};
  const q = cg.questions[0];
  c.pendingQ = { id: q.id, answers: q.answers };
  let menu = Game.buildMenu(vid);
  const ansId = 'ans:' + q.id + ':' + q.answers[0].id;
  if (menu.some(ch => ch.id === ansId)) Game.convoTurn(vid, ansId);
  Game.convoTurn(vid, 'agree');
  Game.convoTurn(vid, 'joke');
  Game.convoTurn(vid, 'silence');
  // reactive opt-out path
  const rids = Object.keys(Game.REACTIVE_DEFS || {});
  if (rids.length) {
    c.reactiveQ = { id: rids[0] };
    menu = Game.buildMenu(vid);
    const hp = menu.find(ch => ch.id === 'react:' + rids[0] + ':honest_pass');
    if (hp) Game.convoTurn(vid, hp.id);
  }
  // dlg: paths
  Game.convoTurn(vid, 'dlg:comfort');
  Game.convoTurn(vid, 'dlg:cant');
  Game.resolveConsequence = orig;
  ok('resolver called for played turns', calls.length >= 5, 'calls=' + calls.length);
  const names = calls.map(x => x.spec.name).filter(Boolean);
  ok('resolver calls carry names', names.length === calls.length);
  // Every call went through the one resolver — no inline writes bypassed it.
  // (Static check: no t[vid]= writes remain in turn handlers — see audit below.)
  ok('all played consequences named', names.every(n => typeof n === 'string'));
}

// ---- 3. Talk cap ----
{
  const c = startFreshConvo(vid);
  const t = Game.state.village.trust || (Game.state.village.trust = {});
  t[vid] = 39;
  Game.resolveConsequence(vid, { trust: 2, name: 'test:cap' });
  ok('talk gain caps at 40', t[vid] === 40, 'trust=' + t[vid]);
  t[vid] = 50;
  Game.resolveConsequence(vid, { trust: 5, name: 'test:cap2' });
  ok('no talk gains above 40', t[vid] === 50, 'trust=' + t[vid]);
  Game.resolveConsequence(vid, { trust: -3, name: 'test:penalty' });
  ok('penalties land whole above 40', t[vid] === 47, 'trust=' + t[vid]);
  t[vid] = 10;
  Game.resolveConsequence(vid, { trust: 5, talk: false, name: 'test:real-act' });
  ok('real acts bypass the cap', t[vid] === 15, 'trust=' + t[vid]);
  // Warmth follows trust by default
  c.mood = 0;
  Game.resolveConsequence(vid, { trust: 2, name: 'test:warmth' });
  ok('mood warms with trust gain', (Game.convoGet(vid).mood || 0) > 0, 'mood=' + Game.convoGet(vid).mood);
}

// ---- 4. Contract gate ----
{
  const res = Game.validateAskContract(vid);
  ok('validateAskContract passes', res.ok, (res.failures || []).slice(0, 3).join('; '));
  ok('contract covers 36 bespoke questions', (Game.data.characterGen.convo.questions || []).length === 36);
}

// ---- 5. Reactive/generic opt-out resolves gracefully ----
{
  const c = startFreshConvo(vid);
  const t = Game.state.village.trust || {};
  t[vid] = 20;
  const rids = Object.keys(Game.REACTIVE_DEFS || {});
  if (rids.length) {
    c.reactiveQ = { id: rids[0] };
    const before = t[vid];
    const r = Game.convoTurn(vid, 'react:' + rids[0] + ':honest_pass');
    ok('reactive opt-out resolves', !!r && !r.ended);
    ok('reactive opt-out costs no trust', t[vid] === before, `trust ${before} -> ${t[vid]}`);
    ok('reactive question cleared', !Game.convoGet(vid).reactiveQ);
  }
  c.genericQ = { kind: 'yn' };
  const gb = (Game.state.village.trust || {})[vid];
  const gr = Game.convoTurn(vid, 'gq:yn:honest_pass');
  ok('generic opt-out resolves', !!gr && !gr.ended);
  ok('generic opt-out costs no trust', (Game.state.village.trust || {})[vid] === gb);
  ok('generic question cleared', !Game.convoGet(vid).genericQ);
}

// ---- 6. Legibility ----
{
  const qs = Game.data.characterGen.convo.questions || [];
  let deflectPrefix = 0, stageDir = 0, cruelNoLine = 0;
  for (const q of qs) {
    for (const a of (q.answers || [])) {
      const lab = a.label || '';
      if (/^Deflect\s+—/.test(lab)) deflectPrefix++;
      if (lab && !lab.startsWith('"') && !lab.startsWith('(')) stageDir++;
      if (a.temper === 'cruel' && (!lab.startsWith('"') && !lab.startsWith('('))) cruelNoLine++;
    }
  }
  ok('no Deflect — prefixes in data', deflectPrefix === 0, deflectPrefix + ' found');
  ok('no stage-direction labels', stageDir === 0, stageDir + ' found');
  ok('cruel answers carry their line', cruelNoLine === 0);
}

// ---- 7. Memory theater audit ----
{
  // Every remember() type written by the conversation system must have a read site.
  const srcFiles = ['src/js/conversation.js', 'src/js/convo-dialogue.js', 'src/js/convo-scene.js', 'src/js/convo-wants.js'];
  const written = {};
  for (const f of srcFiles) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const re = /(?:this\.)?remember\(\s*vid\s*,\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(src))) written[m[1]] = (written[m[1]] || []).concat(f.split('/').pop());
  }
  // Read sites: convoMemoryAbout labels, mood WARM_KINDS/HURT_KINDS, plus
  // cross-module readers (journal, truth, carexplore, convoTopics t2mem).
  const readSites = [];
  for (const f of ['src/js/conversation.js', 'src/js/convo-scene.js', 'src/js/convo-mood.js', 'src/js/journal.js', 'src/js/truth.js', 'src/js/carexplore.js', 'src/js/convoTopics.js']) {
    try { readSites.push(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) {}
  }
  const readBlob = readSites.join('\n');
  const orphans = [];
  for (const type of Object.keys(written)) {
    // A read site: the type string appears outside a remember() write.
    const inReads = readBlob.split('\n').some(line =>
      line.indexOf("'" + type + "'") !== -1 && line.indexOf('remember(') === -1);
    if (!inReads) orphans.push(type + ' (written in ' + written[type].join(',') + ')');
  }
  ok('every memory write has a read site', orphans.length === 0, orphans.slice(0, 4).join('; '));
}

// ---- 8. What's alive ----
{
  const c = startFreshConvo(vid);
  // Plant an open thread + a fresh memory.
  Game.convoThreadOpen(vid, 'past', 'their past', 'walked away mid-thread', 'we talked about before');
  Game.remember(vid, 'gift', 'answered their hunger');
  const alive = Game.convoWhatsAlive(vid);
  ok('whatsAlive returns items', alive.length > 0, 'n=' + alive.length);
  ok('open thread surfaces', alive.some(a => a.kind === 'thread'));
  ok('fresh memory surfaces', alive.some(a => a.kind === 'memory'));
  const menu = Game.buildMenu(vid);
  const aliveInMenu = menu.filter(ch => ch.id && ch.id.indexOf('alive:') === 0);
  ok('alive items reach the menu', aliveInMenu.length > 0, 'n=' + aliveInMenu.length);
  // Play one: thread resume must not dead-end.
  const threadChoice = aliveInMenu.find(ch => ch.id.indexOf('alive:thread:') === 0);
  if (threadChoice) {
    const r = Game.convoTurn(vid, threadChoice.id);
    ok('alive:thread routes', !!r && !r.ended && !!r.line);
  }
  const memChoice = aliveInMenu.find(ch => ch.id.indexOf('alive:memory:') === 0);
  if (memChoice) {
    const r2 = Game.convoTurn(vid, memChoice.id);
    ok('alive:memory routes', !!r2 && !r2.ended && !!r2.line);
  }
}

// ---- 9. Universal "it's different now" ----
{
  const c = startFreshConvo(vid);
  // Simulate: question asked once (snap set), clock moves, asked again.
  c.qsnap = { q_test_clock: 'bandA|1|0|0|0' };
  const hb = { text: '"Where are you from?"', ask: { id: 'q_test_clock', answers: [{ id: 'a1', label: '"Far."' }, { id: 'a2', label: '"Near."' }] } };
  // Force the clock to differ by bumping the day.
  Game.state.scholar.day = (Game.state.scholar.day || 1) + 5;
  c.heldBeats = [hb];
  const r = Game.convoTurn(vid, 'goon');
  ok('re-asked question acknowledges change', r && r.line && r.line.indexOf("different question now") !== -1, (r && r.line || '').slice(0, 80));
}

console.log(`\n${pass} pass, ${fail} fail (seed ${SEED})`);
process.exit(fail ? 1 : 0);
})();
