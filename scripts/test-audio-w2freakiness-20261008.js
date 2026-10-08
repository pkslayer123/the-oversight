// test-audio-w2freakiness-20261008.js — WAVE-2 AUDIO FREAKINESS + HOOK-COMPLETION PROOF (Steve 2026-10-08).
//
// This run's mandate (audio worker):
//   1. QUEUED `wound` hook — resolved by the landed sweep 4b934b1 (wound()
//      synth registered 2026-10-08); asserted here, not duplicated.
//   2. unionRepChant / contractBind — fates decided: REMOVED (dead synths:
//      registered, unfired, no fire sites; union_rep's voices are
//      unionBullhorn/unionWalkout/unionPicket/unionRepWhistle). The stale-tree
//      damage commit briefly re-added unionRepChant; 7b49fc5 reverted.
//      contractBind died with the retired contract_golem. Assertions in Part C.
//   3. Sibling commit 3452732 fires (nightcourtTurn, wolfSnarl, heronUnfold +
//      bison horn butcher schema) — all resolve to registered synths (Part D).
//   4. Wave-2 freakiness pass — every wave-2 audio hook resolves to a REAL,
//      FREAKY synth (Part A: structural anti-generic bar), with the w2b*
//      telegraph-visual -> audio mapping documented, and every unmapped FIRED
//      hook (alienRetreat, meleeHit — the last two silent no-ops) given a real
//      synth this run.
//   5. OUT OF SCOPE: manager*/delegate* voice re-creation (needs proof-script
//      updates in 5 files) — reported as future follow-up; removals asserted.
//
// NOTE on "w2b* attack hooks": the w2b* names (w2bKiteCrackle, w2bLordPulse,
// w2bHeckJeer, w2bModStamp, w2bIdeaHeat, w2bPzFlash, w2bUnderPulse,
// w2bUnionPulse) are CSS keyframes/classes for the wave-2 telegraph VISUALS,
// not audio hooks. The audio voices behind each visual are the per-monster
// encounter voices mapped in W2B_AUDIO below — every one registered + freaky.
//
// Run: node scripts/test-audio-w2freakiness-20261008.js   (SEED env override)
// Part A: CombatAudio IIFE vs instrumented mock Web Audio (node can't play).
// Part B: seeded REAL fights (full module eval, window stubbed for eval then
//         deleted for the sync combat path) — the right cue at the right beat.
// Part C/D: static repo assertions.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'src', 'js', 'app.js');

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D6B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// SEED BEFORE EVAL (AGENTS.md): modules capture Math.random at load time.
const SEED = parseInt(process.env.SEED || '20261008', 10);
Math.random = mulberry32(SEED);

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ================= PART A: mock-graph freakiness =================
// ---------- instrumented mock Web Audio ----------
let nodeSeq = 0, nodes = [], edges = [];
function mockParam(node, pname, init) {
  const p = {
    _node: node, _pname: pname, events: [],
    setValueAtTime(v, t) { this.events.push({ op: 'set', v, t }); },
    linearRampToValueAtTime(v, t) { this.events.push({ op: 'lin', v, t }); },
    exponentialRampToValueAtTime(v, t) { this.events.push({ op: 'exp', v, t }); },
    setTargetAtTime(v) { this.events.push({ op: 'tgt', v }); },
    cancelScheduledValues() {},
  };
  let _v = init;
  Object.defineProperty(p, 'value', {
    get() { return _v; },
    set(v) { p.events.push({ op: 'set', v, t: NaN }); _v = v; },
    enumerable: true,
  });
  return p;
}
function paramDestId(dest) {
  if (!dest || typeof dest !== 'object') return '?';
  const id = dest._id || (dest._node && dest._node._id);
  if (!id) return 'bus';
  return id + (dest._pname ? '.' + dest._pname : '');
}
function mockNode(kind) {
  const n = {
    _id: kind + (++nodeSeq), _kind: kind, _started: false, _stopped: false,
    connect(dest) { edges.push([this._id, paramDestId(dest), this._kind]); },
    disconnect() {},
    start() { this._started = true; },
    stop() { this._stopped = true; },
  };
  if (kind === 'osc') { n.frequency = mockParam(n, 'frequency', 440); n.detune = mockParam(n, 'detune', 0); n.type = 'sine'; }
  if (kind === 'gain') { n.gain = mockParam(n, 'gain', 0); }
  if (kind === 'filter') { n.frequency = mockParam(n, 'frequency', 1000); n.Q = mockParam(n, 'Q', 1); n.type = ''; }
  if (kind === 'noise') { n.buffer = null; n.loop = false; n.playbackRate = mockParam(n, 'playbackRate', 1); }
  if (kind === 'panner') { n.pan = mockParam(n, 'pan', 0); }
  if (kind === 'comp') { ['threshold', 'knee', 'ratio', 'attack', 'release'].forEach(k => { n[k] = mockParam(n, k, 0); }); }
  if (kind === 'shaper') { n.curve = null; n.oversample = 'none'; }
  nodes.push(n);
  return n;
}
function MockAudioContext() {
  return {
    sampleRate: 44100, currentTime: 100, state: 'running', destination: mockNode('destination'),
    resume() { return Promise.resolve(); },
    createBuffer(ch, len) { return { numberOfChannels: ch, length: len, getChannelData() { return new Float32Array(len); } }; },
    createBufferSource() { return mockNode('noise'); },
    createOscillator() { return mockNode('osc'); },
    createGain() { return mockNode('gain'); },
    createBiquadFilter() { return mockNode('filter'); },
    createStereoPanner() { return mockNode('panner'); },
    createDynamicsCompressor() { return mockNode('comp'); },
    createWaveShaper() { return mockNode('shaper'); },
  };
}
const sandbox = {
  window: { AudioContext: MockAudioContext },
  localStorage: { getItem() { return null; }, setItem() {} },
  document: { getElementById() { return null; }, createElement() { return { style: {}, classList: { remove() {}, add() {} }, offsetWidth: 0 }; }, body: { appendChild() {} } },
  setInterval() { return 1; }, clearInterval() {}, setTimeout() { return 1; }, clearTimeout() {},
  Float32Array, console, Math, JSON, Object, Array, Error, Number, String, Boolean,
  Promise, isNaN, parseInt, parseFloat, Infinity, NaN,
  Game: {},
};
const app = fs.readFileSync(APP, 'utf8');
const start = app.indexOf('const CombatAudio = (() => {');
ok('CombatAudio IIFE found in app.js', start >= 0);
const endMarker = '})();\n  Game.audio = CombatAudio;';
const end = app.indexOf(endMarker, start);
ok('IIFE end marker found', end > start);
const vm = require('vm');
const iifeSrc = app.slice(start, end + 5) + '\nCombatAudio;';
const audio = vm.runInNewContext(iifeSrc, sandbox);
function resetGraph() { nodes = []; edges = []; nodeSeq = 0; }
function graphStats() {
  const sources = nodes.filter(n => (n._kind === 'osc' || n._kind === 'noise') && n._started);
  const kinds = new Set(nodes.map(n => n._kind));
  let events = 0;
  nodes.forEach(n => Object.values(n).forEach(v => { if (v && v.events) events += v.events.length; }));
  const hasFilter = nodes.some(n => n._kind === 'filter');
  const hasNoise = nodes.some(n => n._kind === 'noise');
  const connected = nodes.filter(n => n._started && edges.some(e => e[0] === n._id)).length;
  return { sources: sources.length, kinds: kinds.size, events, hasFilter, hasNoise, connected, total: nodes.length };
}
// FREAKY, NOT GENERIC (Steve's law): a synth is "generic" only if it is a lone
// blip — one started source, osc+gain kinds only, no filter, no noise, ≤4
// envelope events. Everything else has enough structure to be characterful.
// (Deliberately minimal voices like modNoted's "politeness is the scary part"
// still clear this: thump + blip = 2 sources.)
function isGeneric(st) {
  return st.sources === 1 && st.kinds <= 2 && !st.hasFilter && !st.hasNoise && st.events <= 4;
}
// Wave-2 audio voices: every fired hook + representative data.
const W2 = [
  ['staticCry', { close: true }], ['staticBreak', {}],
  ['stagMirror', {}], ['stagSnort', {}], ['stagCharge', {}],
  ['droneHum', {}], ['droneBeam', {}],
  ['eurekaTick', { urgency: 2 }], ['eurekaCharge', {}], ['eurekaDetonate', {}],
  ['eurekaDisperse', {}], ['eurekaSpent', {}],
  ['projectorHum', {}], ['projectorFire', {}],
  ['lineCut', {}],
  ['understudyWatch', {}], ['understudyPerform', {}],
  ['landlordClaim', {}], ['landlordSpread', {}], ['landlordEvict', {}],
  ['hecklerTaunt', { shame: 5 }], ['hecklerJibe', { shame: 3 }],
  ['hecklerLaugh', {}], ['hecklerHeadliner', {}], ['hecklerPileOn', {}],
  ['paparazzoShutter', {}], ['paparazzoExclusive', {}],
  ['unionBullhorn', {}], ['unionPicket', {}], ['unionWalkout', {}], ['unionRepWhistle', {}],
  ['modNotice', {}], ['modNoted', {}], ['modMute', {}], ['modViolation', {}],
  ['modRemoval', { final: true }], ['modShadow', {}], ['modDown', {}],
  ['kiteHum', {}], ['kiteMark', {}], ['kiteTransmit', {}], ['kiteBroadcast', {}],
  ['kiteUnfold', {}], ['kiteClimb', {}],
  // This run's hook-completion: the last two fired-but-silent encounter hooks.
  ['alienRetreat', {}], ['meleeHit', {}],
  // Item 1: the wound voice (landed by 4b934b1) + item 3's 3452732 fires.
  ['wound', {}], ['nightcourtTurn', {}], ['wolfSnarl', {}], ['heronUnfold', {}],
  ['heronStatic', {}], ['animalButcher', {}],
];
const freakStats = [];
for (const [hook, data] of W2) {
  resetGraph();
  let threw = null;
  try { audio[hook](data); } catch (e) { threw = e; }
  const st = graphStats();
  ok(`registered: ${hook}`, typeof audio[hook] === 'function');
  ok(`${hook}: no throw`, threw === null, threw && threw.message);
  ok(`${hook}: non-empty graph`, st.total > 0 && st.connected > 0, JSON.stringify(st));
  ok(`${hook}: freaky, not generic`, !isGeneric(st),
    isGeneric(st) ? `lone-blip signature ${JSON.stringify(st)}` : undefined);
  freakStats.push([hook, st.sources, st.events]);
}
// w2b* telegraph-visual -> audio-voice mapping: every wave-2 visual identity
// has a registered freaky audio voice behind it.
const W2B_AUDIO = {
  w2bIdea: 'eurekaTick', w2bPz: 'paparazzoShutter', w2bKite: 'kiteHum',
  w2bUnder: 'understudyWatch', w2bLord: 'landlordClaim', w2bHeck: 'hecklerLaugh',
  w2bUnion: 'unionBullhorn', w2bMod: 'modNotice',
};
for (const [cls, voice] of Object.entries(W2B_AUDIO)) {
  ok(`w2b visual ${cls} has audio voice ${voice}`,
    app.includes(`' ${cls}'`) && typeof audio[voice] === 'function');
}
console.log(`Part A: ${W2.length} wave-2 voices driven through mock graph (seed=${SEED})`);

// ================= PART B: the right cue at the right combat beat =================
// Seeded real fights through the game's own dispatch (Game.audioEvent ->
// Game.audio). Game.audio is a Proxy that records hook name + data, so beats
// (aggro -> declare -> windup -> resolve) are asserted on ORDER, not luck.
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'\"'\"']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global; // stub for eval; deleted before play (sync combat path)
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

const audioLog = [];
function setupFight(monsterId, night) {
  audioLog.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  if (night) Game.dayPart = 3; // bright_idea only brightens at night
  const s = Game.state.scholar;
  s.health = 500; s.mx = 4; s.my = 4;
  Game.ensureVillagerPositions();
  Game.state.village.roster = [];
  const vpos = Game.state.village.positions || {};
  for (const k of Object.keys(vpos)) vpos[k] = { mx: 8, my: 8 };
  s.monster = { id: monsterId, mx: 4, my: 6 };
  Game.startCombat(monsterId);
  const pf = Game.tbFighter('p');
  if (pf) { pf.mx = 4; pf.my = 4; pf.hp = 5000; pf.maxHp = 5000; }
}
function drive(maxTurns) {
  let n = 0;
  while (Game.tbfight && !Game.tbfight.over && n++ < maxTurns) {
    if (Game.tbIsPlayerTurn()) Game.tbPlayerWait();
    else Game.tbAdvance();
  }
}
function idxOf(name, pred) {
  for (let i = 0; i < audioLog.length; i++) {
    if (audioLog[i][0] === name && (!pred || pred(audioLog[i][1]))) return i;
  }
  return -1;
}
function countOf(name, pred) {
  return audioLog.filter(([n, d]) => n === name && (!pred || pred(d))).length;
}

(async () => {
  await Game.init();
  Game.audio = new Proxy({}, {
    get: (t, n) => (d) => { audioLog.push([String(n), d || {}]); },
  });

  // 1. HECKLER: laugh (aggro) before headliner (resolve); jibe narrates misses.
  setupFight('heckler'); drive(25);
  ok('heckler: hecklerLaugh fires at aggro', idxOf('hecklerLaugh') >= 0);
  ok('heckler: laugh before headliner', idxOf('hecklerLaugh') < idxOf('hecklerHeadliner'),
    `laugh@${idxOf('hecklerLaugh')} headliner@${idxOf('hecklerHeadliner')}`);
  ok('heckler: hecklerJibe fires (narrated miss)', countOf('hecklerJibe') >= 1);

  // 2. UNION_REP: bullhorn (aggro) before walkout (resolve).
  setupFight('union_rep'); drive(25);
  ok('union_rep: unionBullhorn fires at aggro', idxOf('unionBullhorn') >= 0);
  ok('union_rep: bullhorn before walkout', idxOf('unionBullhorn') < idxOf('unionWalkout'));

  // 3. LANDLORD: claim (aggro) before evict (resolve).
  setupFight('landlord'); drive(25);
  ok('landlord: landlordClaim fires at aggro', idxOf('landlordClaim') >= 0);
  ok('landlord: claim before evict', idxOf('landlordClaim') < idxOf('landlordEvict'));

  // 4. MODERATOR: notice (aggro) before removal (resolve).
  setupFight('moderator'); drive(25);
  ok('moderator: modNotice fires at aggro', idxOf('modNotice') >= 0);
  ok('moderator: notice before removal', idxOf('modNotice') < idxOf('modRemoval'));

  // 5. PAPARAZZO: shutter (aggro) before exclusive (resolve).
  setupFight('paparazzo'); drive(25);
  ok('paparazzo: paparazzoShutter fires at aggro', idxOf('paparazzoShutter') >= 0);
  ok('paparazzo: shutter before exclusive', idxOf('paparazzoShutter') < idxOf('paparazzoExclusive'));

  // 6. STATICKITE: the full escalation arc — hum (notice) -> unfold (aggro)
  //    -> mark (declare) -> broadcast (resolve), in that order.
  setupFight('statickite'); drive(25);
  const iHum = idxOf('kiteHum'), iUnf = idxOf('kiteUnfold'), iMark = idxOf('kiteMark'), iBc = idxOf('kiteBroadcast');
  ok('statickite: full arc fires', iHum >= 0 && iUnf >= 0 && iMark >= 0 && iBc >= 0,
    `hum@${iHum} unfold@${iUnf} mark@${iMark} broadcast@${iBc}`);
  ok('statickite: arc in order', iHum < iUnf && iUnf < iMark && iMark < iBc);

  // 7. BRIGHT_IDEA (night): charge (windup declared) -> tick urgency 2 ->
  //    tick urgency 1 -> detonate (resolve). The urgency ESCALATION is the
  //    beat: two beats from glow to boom.
  setupFight('bright_idea', true); drive(30);
  const iCh = idxOf('eurekaCharge');
  const iT2 = idxOf('eurekaTick', d => d.urgency === 2);
  const iT1 = idxOf('eurekaTick', d => d.urgency === 1);
  const iDet = idxOf('eurekaDetonate');
  ok('bright_idea: charge -> tick(2) -> tick(1) -> detonate, in order',
    iCh >= 0 && iT2 > iCh && iT1 > iT2 && iDet > iT1,
    `charge@${iCh} tick2@${iT2} tick1@${iT1} det@${iDet}`);

// ================= PART C: removal fates (items 1-2) =================
// unionRepChant / contractBind / delegateDebrief / paparazzoFlash /
// understudyLearn / ducksRejoin / landlordStamp: REMOVED — no function, no
// registry entry, no fire site, no data field. (manager*/delegate* aliases
// same class; re-adding their voices is the future follow-up, item 5.)
const REMOVED = ['unionRepChant', 'contractBind', 'delegateDebrief', 'paparazzoFlash',
  'understudyLearn', 'ducksRejoin', 'landlordStamp',
  'managerCircle', 'managerAnnounce', 'managerCharge', 'managerDebrief', 'managerFear',
  'delegateCircle', 'delegateAnnounce', 'delegateCharge'];
const jsDir = path.join(ROOT, 'src', 'js');
const jsFiles = fs.readdirSync(jsDir).filter(x => x.endsWith('.js'));
const mons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'monsters.json'), 'utf8'));
const monsStr = JSON.stringify(mons);
for (const h of REMOVED) {
  const fnDef = new RegExp(`function ${h}\\s*\\(`).test(app);
  // Registry ground truth: the extracted CombatAudio object from Part A.
  // (A regex over app.js would false-positive on the REMOVED documentation
  // comments, which name each hook with ().)
  const regEntry = typeof audio[h] === 'function';
  let fired = false;
  for (const f of jsFiles) {
    const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
    if (f === 'app.js') continue;
    if (new RegExp(`audioEvent\\(\\s*['"]${h}['"]`).test(src)) { fired = true; break; }
  }
  const inData = monsStr.includes(`"${h}"`);
  ok(`${h}: removed — no function, no registry, no fire, no data`,
    !fnDef && !regEntry && !fired && !inData,
    `fn=${fnDef} reg=${regEntry} fired=${fired} data=${inData}`);
}
ok('wound(): registered (4b934b1 sweep — not duplicated here)',
  /function wound\(\)/.test(app) && /[^a-zA-Z]wound\(\) \{/.test(app));

// ================= PART D: 3452732 fires resolve (item 3) =================
// nightcourtDive REMOVED 2026-10-08 (break-it audio): dead synth, dive deliberately silent
for (const h of ['nightcourtTurn', 'wolfSnarl', 'heronUnfold', 'heronStatic',
  'nightcourtSilence', 'nightcourtLand', 'nightcourtClimb', 'animalButcher']) {
  ok(`3452732: ${h} registered`, typeof audio[h] === 'function');
}
const schemas = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'schemas.json'), 'utf8'));
const butcherKeys = JSON.stringify(schemas).includes('"horn"');
ok('3452732: butcher schema allows horn', butcherKeys);
const animals = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'animals.json'), 'utf8'));
const animalArr = Array.isArray(animals) ? animals : (animals.animals || Object.values(animals));
const bison = animalArr.find(m => m && m.id === 'bison');
ok('3452732: bison butcher yields horn (schema-conformant)',
  !!(bison && bison.butcher && bison.butcher.horn === 2));

console.log(`\nseed=${SEED} — ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
})();
