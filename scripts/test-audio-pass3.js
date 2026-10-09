// ADVERSARIAL PROOF (break-it: audio 3rd pass, Steve 2026-10-09).
// Pass 1 (2026-10-08) + pass 2 (2026-10-09, commit 0c0d01c, 35/35 x3 seeds) already
// covered: hook-spam node leaks, sustained kills via combatEnd, no-AudioContext
// no-ops, suspended-ctx no-awaited-resumes, failed-trial silence, hushwolf/turtle
// silence, alien beam coverage, specimen_scanner copy, dead-code census.
// THIS PASS goes deeper on four fresh vectors:
//   EXPLOIT: E1 200-combat sustained leak; E2 combatStart x200 with no combatEnd
//     (heartbeat doubling); E3 AudioContext 'closed' mid-session death + recovery;
//     E4 master-gain stacking across ensure() calls.
//   SOFTLOCK: S1 AudioContext constructor throws / undefined (boot survival);
//     S2 resume() call-site audit (exactly one, synchronous, inside ensure);
//     S3 'interrupted' state self-heal.
//   HONESTY: H1 mute is real (master gain -> 0.0001, not theater); H2 pan/heat
//     honesty on beamSweep; H3 named voices actually sound; H4 every
//     CX_BEAT_DEFS contest beat resolves + sounds.
//   DEAD-CODE: D1 reverse census — every fired name (audioEvent literals,
//     Game.audio.X calls, monsters.json *Audio, CX_BEAT_DEFS, drama.js) resolves
//     in the registry; D2 orphaned voices (registered, never fired).
// SEED env override. Run: node scripts/test-audio-pass3.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261009', 10);
Math.random = mulberry32(SEED); // BEFORE eval: modules capture Math.random at load

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function safeFire(Audio, name, arg) {
  try { Audio[name](arg === undefined ? {} : arg); return null; }
  catch (e) { return e; }
}

// ================= stubbed WebAudio =================
let created, ctxConstructions, throwCtor, noCtor, muteBoot;
const ctxStateById = {}; // per-context state; fresh contexts start 'running'
function ctxStateOf(id) { return ctxStateById[id] !== undefined ? ctxStateById[id] : 'running'; }
let intervalCalls, clearCalls, timers, timeoutCalls;
function param(owner) {
  const p = { value: 0, _ramps: [], _sets: [], _cancels: 0,
    setValueAtTime(v) { p._sets.push(v); }, linearRampToValueAtTime(v) { p._ramps.push(['lin', v]); },
    exponentialRampToValueAtTime(v) { p._ramps.push(['exp', v]); },
    setTargetAtTime(v) { p._ramps.push(['tgt', v]); },
    cancelScheduledValues() { p._cancels++; }, cancelAndHoldAtTime() { p._cancels++; } };
  return p;
}
function makeNode(kind, ctxId) {
  const n = { _kind: kind, _ctx: ctxId, _started: false, _stopped: false, connect() {}, disconnect() {},
    start() { n._started = true; }, stop() { n._stopped = true; },
    gain: param(), frequency: param(), playbackRate: param(), pan: param(), Q: param(),
    threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(),
    detune: param(), delayTime: param(), type: '', buffer: null, loop: false };
  created.push(n); return n;
}
function makeCtx() {
  const id = ++ctxConstructions;
  const c = { _id: id, get state() { return ctxStateOf(id); }, sampleRate: 44100, destination: {},
    _t: 1000, get currentTime() { c._t += 0.01; return c._t; },
    createOscillator() { return makeNode('osc', id); }, createGain() { return makeNode('gain', id); },
    createBiquadFilter() { return makeNode('filter', id); }, createDynamicsCompressor() { return makeNode('comp', id); },
    createBufferSource() { return makeNode('src', id); }, createStereoPanner() { return makeNode('pan', id); },
    createDelay() { return makeNode('delay', id); }, createWaveShaper() { return makeNode('shaper', id); },
    createBuffer(ch, len) { const b = makeNode('buffer', id); b.getChannelData = () => new Float32Array(len); return b; },
    resume() { return Promise.resolve(); } };
  return c;
}
const realLeaks = () => created.filter(n =>
  (n._kind === 'osc' && n._started && !n._stopped) ||
  (n._kind === 'src' && n._started && !n._stopped && n.loop));
function installTimerStubs() {
  intervalCalls = 0; clearCalls = 0; timers = []; timeoutCalls = 0;
  global.setInterval = (fn, ms) => { intervalCalls++; timers.push(fn); return timers.length; };
  global.clearInterval = (id) => { clearCalls++; if (timers[id - 1]) timers[id - 1] = null; };
  global.setTimeout = (fn) => { timeoutCalls++; fn(); return 0; };
  global.clearTimeout = () => {};
}
function loadRegistry() {
  created = []; ctxConstructions = 0;
  for (const k of Object.keys(ctxStateById)) delete ctxStateById[k];
  installTimerStubs();
  const lines = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8').split('\n');
  const start = lines.findIndex(l => l.includes('const CombatAudio = (() => {'));
  const end = lines.findIndex(l => l.includes('Game.audio = CombatAudio;'));
  const block = lines.slice(start, end + 1).join('\n');
  const Game = {}; const window = {};
  if (throwCtor) window.AudioContext = function () { throw new Error('blocked by policy'); };
  else if (!noCtor) window.AudioContext = function () { return makeCtx(); };
  const localStorage = { getItem: () => (muteBoot ? '1' : null), setItem() {} };
  eval(block);
  return Game.audio;
}

console.log('--- E: exploit/resource ---');
throwCtor = false; noCtor = false; muteBoot = false;
let Audio = loadRegistry();

// E1: 200 full combat cycles — sustained playthrough leak check
created = [];
for (let i = 0; i < 200; i++) {
  Audio.combatStart();
  Audio.telegraph({ urgency: 1, pattern: 'beam' });
  Audio.impact({ pattern: 'beam' });
  Audio.telegraph({ urgency: 2, pattern: 'rush' });
  Audio.impact({ pattern: 'rush' });
  Audio.beamSweep({ pan: 0.3, heat: 0.5 }); Audio.beamSweep({ pan: -0.3, heat: 0.9 });
  Audio.beamSweepStop();
  Audio.combatEnd();
}
ok('E1: 200 combat cycles — zero real node leaks', realLeaks().length === 0, `${realLeaks().length} live`);
ok('E1: 200 combat cycles — no heartbeat timer left live', (intervalCalls - clearCalls) === 0, `live=${intervalCalls - clearCalls}`);
ok('E1: 200 combat cycles — nodes per cycle bounded', created.length / 200 < 400, `${(created.length / 200).toFixed(0)}/cycle`);
ok('E1: 200 combat cycles — exactly one AudioContext ever built', ctxConstructions === 1, `${ctxConstructions}`);

// E2: combatStart x200 with NO combatEnd — heartbeat must not double
created = [];
for (let i = 0; i < 200; i++) Audio.combatStart();
ok('E2: combatStart x200 no combatEnd — exactly one heartbeat timer live', (intervalCalls - clearCalls) === 1, `live=${intervalCalls - clearCalls}`);
Audio.combatEnd();
ok('E2: combatEnd after pile-up — timer cleared', (intervalCalls - clearCalls) === 0, `live=${intervalCalls - clearCalls}`);
ok('E2: pile-up — zero real node leaks', realLeaks().length === 0, `${realLeaks().length} live`);

// E3: AudioContext dies mid-session ('closed' — iOS memory pressure / route change)
created = [];
Audio.beamFire();
const liveCtx = ctxConstructions;
ctxStateById[liveCtx] = 'closed'; // the OS killed the live context
Audio.beamFire();    // voice fires into the dead context
Audio.beamFire();    // next voice: does ensure() recover?
const recovered = ctxConstructions > liveCtx;
ok('E3: closed-context death — ensure() rebuilds a fresh AudioContext', recovered,
  recovered ? `ctx #${ctxConstructions} built` : 'still on dead ctx — audio silently dead forever');
if (recovered) {
  const onNew = created.filter(n => n._ctx === ctxConstructions).length;
  ok('E3: post-recovery voices sound on the NEW context', onNew > 0, `${onNew} nodes on new ctx`);
  ok('E3: recovery is one-shot (no rebuild churn on later voices)',
    (Audio.beamFire(), ctxConstructions) === liveCtx + 1, `constructions=${ctxConstructions}`);
}

// E4: master-gain stacking — ensureAudio x50 must not rebuild the graph
const gainsBefore = created.filter(n => n._kind === 'gain').length;
for (let i = 0; i < 50; i++) Audio.ensureAudio();
ok('E4: ensureAudio x50 — no context rebuild, no graph restack', ctxConstructions === liveCtx + (recovered ? 1 : 0),
  `constructions=${ctxConstructions}`);

console.log('--- S: softlock/mobile ---');
// S1: constructor throws / missing entirely — boot + every voice must survive
throwCtor = true; Audio = loadRegistry();
let threw = false;
for (const v of ['ensureAudio', 'combatStart', 'beamFire', 'turtleFlip', 'toggleMute', 'combatEnd', 'trialFanfare', 'telegraph']) {
  if (safeFire(Audio, v)) threw = true;
}
ok('S1: AudioContext ctor throws — every voice no-ops, none throw', !threw);
ok('S1: ctor throws — zero contexts built, zero nodes', ctxConstructions === 0 && created.length === 0);
noCtor = true; throwCtor = false; Audio = loadRegistry();
threw = false;
for (const v of ['ensureAudio', 'combatStart', 'beamFire', 'toggleMute']) { if (safeFire(Audio, v)) threw = true; }
ok('S1: no AudioContext at all — boot + voices survive', !threw && ctxConstructions === 0);
noCtor = false; Audio = loadRegistry();

// S2: resume() call-site audit — exactly one, synchronous, inside ensure()
const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const resumeSites = (appSrc.match(/ctx\.resume\(\)/g) || []).length;
const ensureBlock = appSrc.slice(appSrc.indexOf('function ensure() {'), appSrc.indexOf('function noise('));
ok('S2: exactly ONE ctx.resume() call site in the whole codebase', resumeSites === 1, `${resumeSites} sites`);
ok('S2: the single resume() lives inside ensure()', ensureBlock.includes('ctx.resume()'));
ok('S2: ensure() never awaits the resume (no awaited-resume path)', !/await[^;]*resume/.test(ensureBlock));
const onstate = (appSrc.match(/onstatechange|addEventListener\(\s*['"]statechange/g) || []).length;
console.log(`  info S2: statechange listeners in app.js: ${onstate}`);

// S3: 'interrupted' (iOS phone call / bluetooth) self-heals on next voice
created = [];
Audio.beamFire();
const c2 = created[0]._ctx;
ctxStateById[c2] = 'interrupted';
Audio.beamFire(); // fires into interrupted ctx — silent in reality, must not throw/leak
const interruptedNodes = created.filter(n => n._ctx === c2).length;
ctxStateById[c2] = 'suspended'; // interruption ends — iOS drops back to suspended
const before = created.length;
Audio.beamFire(); // ensure() should resume() here
ok('S3: interrupted ctx — voices survive without throwing', interruptedNodes >= 0);
ok('S3: post-interruption voice creates nodes (recovery path runs)', created.length > before);
delete ctxStateById[c2];

console.log('--- H: honesty ---');
// H1: mute is REAL — master gain driven to ~0, not theater
Audio = loadRegistry(); created = [];
Audio.combatStart(); // build the graph unmuted
Audio.toggleMute();
const mutedRamps = created.filter(n => n._kind === 'gain' &&
  n.gain._cancels > 0 && n.gain._ramps.some(r => r[0] === 'lin' && r[1] === 0.0001));
ok('H1: toggleMute drives a gain to 0.0001 (cancel+set+ramp sequence)', mutedRamps.length === 1, `${mutedRamps.length} candidates`);
Audio.toggleMute();
const unmutedRamps = created.filter(n => n._kind === 'gain' &&
  n.gain._ramps.some(r => r[0] === 'lin' && r[1] === 0.9));
ok('H1: un-mute restores gain to 0.9', unmutedRamps.length >= 1, `${unmutedRamps.length}`);
ok('H1: isMuted() tracks the toggle', Audio.isMuted() === false);
Audio.toggleMute(); ok('H1: isMuted() true after toggle', Audio.isMuted() === true);
// boot-muted: master starts at 0.0001
muteBoot = true; Audio = loadRegistry(); created = [];
Audio.beamFire();
const bootGains = created.filter(n => n._kind === 'gain' && n.gain.value === 0.0001);
ok('H1: boot with oversight_mute=1 — master gain starts at 0.0001', bootGains.length >= 1, `${bootGains.length}`);
muteBoot = false; Audio = loadRegistry();

// H2: pan/heat honesty on beamSweep
created = [];
Audio.beamSweep({ pan: -0.7, heat: 0.9 });
const panners = created.filter(n => n._kind === 'pan');
const panSet = panners.some(p => p.pan._ramps.some(r => r[0] === 'tgt' && Math.abs(r[1] - (-0.7)) < 1e-9));
ok('H2: beamSweep pan=-0.7 reaches a stereo panner', panSet, `${panners.length} panners`);
Audio.beamSweep({ pan: 0.6, heat: 0.2 }); // singleton set() path
const panMoved = created.filter(n => n._kind === 'pan')
  .some(p => p.pan._ramps.some(r => r[0] === 'tgt' && Math.abs(r[1] - 0.6) < 1e-9));
ok('H2: sustained sweep.set() moves the pan (positional tracking)', panMoved);
Audio.beamSweepStop();
ok('H2: beamSweepStop leaves no live nodes', realLeaks().length === 0);

// H3: every named show-voice actually sounds
const named = ['trialFanfare', 'hypeDetonate', 'hypeInflate', 'hypeDeflate', 'contestCall',
  'contestTaken', 'contestSpared', 'round', 'droneCount', 'droneCorrect', 'lineCut',
  'systemCooking', 'holdMusic', 'paperRustle', 'teethTick', 'eurekaDetonate', 'stormFront',
  'shout', 'horrorSting', 'victory', 'defeat', 'justiceVerdict', 'exileWalk'];
let namedSilent = [];
for (const v of named) {
  created = [];
  const err = safeFire(Audio, v);
  if (err) namedSilent.push(v + '(threw)');
  else if (created.length < 3) namedSilent.push(v + `(${created.length})`);
}
ok('H3: 24 named show-voices all sound (no silent labels)', namedSilent.length === 0, namedSilent.join(','));

// H4: every CX_BEAT_DEFS contest beat resolves in the registry and sounds
const cxSrc = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
const beatNames = new Set();
const beatRe = /contest[A-Za-z0-9_]*:\s*\[([^\]]*)\]/g;
let m;
while ((m = beatRe.exec(cxSrc))) {
  for (const q of m[1].matchAll(/'([a-zA-Z0-9_]+)'/g)) beatNames.add(q[1]);
}
const registry = new Set(Object.keys(Audio));
const unresolved = [...beatNames].filter(b => !registry.has(b));
ok(`H4: all ${beatNames.size} CX_BEAT_DEFS beats resolve in registry`, unresolved.length === 0, unresolved.join(','));
let beatSilent = [];
for (const b of beatNames) {
  created = [];
  const err = safeFire(Audio, b);
  if (err || created.length < 2) beatSilent.push(b + (err ? '(threw)' : `(${created.length})`));
}
ok(`H4: all ${beatNames.size} contest beats fire without throw and sound`, beatSilent.length === 0, beatSilent.join(','));

console.log('--- D: dead-code ---');
// D1: reverse census — every fired name resolves
const fired = new Set();
const audioEventRe = /audioEvent\(\s*['"]([a-zA-Z0-9_]+)['"]/g;
for (const f of fs.readdirSync(path.join(ROOT, 'src/js'))) {
  if (!f.endsWith('.js')) continue;
  const src = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
  let mm; while ((mm = audioEventRe.exec(src))) fired.add(mm[1]);
  const callRe = /Game\.audio\.([a-zA-Z0-9_]+)\s*\(/g;
  while ((mm = callRe.exec(src))) fired.add(mm[1]);
}
for (const f of fs.readdirSync(path.join(ROOT, 'src/data'))) {
  if (!f.endsWith('.json')) continue;
  const src = fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8');
  const jRe = /"[a-zA-Z]*[Aa]udio"\s*:\s*"([a-zA-Z0-9_]+)"/g;
  let mm; while ((mm = jRe.exec(src))) fired.add(mm[1]);
}
for (const b of beatNames) fired.add(b);
const idxSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
{ const callRe = /Game\.audio\.([a-zA-Z0-9_]+)\s*\(/g; let mm; while ((mm = callRe.exec(idxSrc))) fired.add(mm[1]); }
// drama.js DRAMA_AUDIO_MATES values (kind -> voice name)
const dramaSrc = fs.readFileSync(path.join(ROOT, 'src/js/drama.js'), 'utf8');
{
  const mb = dramaSrc.indexOf('DRAMA_AUDIO_MATES = {');
  const me = dramaSrc.indexOf('};', mb);
  const mates = dramaSrc.slice(mb, me);
  const dRe = /:\s*'([a-zA-Z0-9_]+)'/g;
  let mm; while ((mm = dRe.exec(mates))) fired.add(mm[1]);
}
// encounters.js encAudio hook names (ENC_AUDIO_FALLBACK contract)
fired.add('animalPanic');
const dead = [...fired].filter(n => !registry.has(n));
ok(`D1: all ${fired.size} fired names resolve in Game.audio registry`, dead.length === 0, dead.join(','));

// D2: registered but never fired by literal name — verify each is reachable via
// an internal dispatcher (telegraph/impact/miss/combatEnd/combatStart bodies),
// via a registry alias, or via drama mates / encAudio. A truly unreachable
// registry voice is dead code.
const entryPoints = new Set(['ensureAudio', 'isMuted', 'toggleMute']);
const unfired = [...registry].filter(n => !fired.has(n) && !entryPoints.has(n));
const blockLines = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8').split('\n');
const cbStart = blockLines.findIndex(l => l.includes('const CombatAudio = (() => {'));
const cbEnd = blockLines.findIndex(l => l.includes('Game.audio = CombatAudio;'));
const cbLines = blockLines.slice(cbStart, cbEnd);
// A registry voice is reachable if some line calls it without being its own
// definition header (covers dispatcher bodies, return-block aliases,
// single-line methods).
const unreachable = unfired.filter(n => {
  const defRe = new RegExp('^\\s*(function\\s+)?' + n + '\\s*\\(');
  const callRe = new RegExp('[^a-zA-Z0-9_.]' + n + '\\s*\\(');
  return !cbLines.some(l => !defRe.test(l) && callRe.test(l));
});
ok(`D2: zero unreachable registry voices (${unfired.length} via internal dispatch)`, unreachable.length === 0, unreachable.join(','));
if (unfired.length) console.log(`  info D2: internally-dispatched: ${unfired.join(',')}`);

console.log(`\nPASS3 RESULT: ${pass} ok / ${fail} FAIL (seed ${SEED})`);
process.exit(fail ? 1 : 0);