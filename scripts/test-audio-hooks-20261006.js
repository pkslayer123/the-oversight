// test-audio-hooks-20261006.js — AUDIO VERIFICATION + UNMAPPED HOOK MAPPING (Steve 2026-10-06).
//
// Read-only verification: enumerates every audio hook fired across src/js +
// src/data, checks each resolves in the CombatAudio registry, then DRIVES
// every scenario the harness can reach headless (wave-2 five, Highbeam Deer,
// all 8 pattern telegraphs, flyer beats, forager loop, contest beats, social
// beats, system beats) and asserts each hook FIRES and RESOLVES (invocation
// logged + synth runs without throwing + produces a sound graph).
//
// The game's own dispatch (Game.audioEvent, game.js) silently no-ops unknown
// names: `if (this.audio && typeof this.audio[name] === 'function')` — so a
// fired-but-unregistered hook is a SILENT bug, not a loud one. This test
// makes it loud.
//
// Node cannot play audio: an instrumented mock Web Audio graph records the
// node graph. A hook "verified" here = invoked AND resolved AND produced
// sound nodes without throwing. This does NOT verify how it sounds to a
// human ear (Steve's phone is the final gate).
//
// Usage: node scripts/test-audio-hooks-20261006.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'src', 'js', 'app.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------- instrumented mock Web Audio ----------
let nodeSeq = 0;
let nodes = [];
let edges = [];
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
  setInterval() { return 1; },
  clearInterval() {},
  setTimeout() { return 1; },
  clearTimeout() {},
  Float32Array, console, Math, JSON, Object, Array, Error, Number, String, Boolean,
  Promise, isNaN, parseInt, parseFloat, Infinity, NaN,
  Game: {},
};

// ---------- extract & evaluate the CombatAudio IIFE ----------
const app = fs.readFileSync(APP, 'utf8');
const start = app.indexOf('const CombatAudio = (() => {');
ok('CombatAudio IIFE found in app.js', start >= 0);
const endMarker = '})();\n  Game.audio = CombatAudio;';
const end = app.indexOf(endMarker, start);
ok('IIFE end marker found', end > start);
const iifeSrc = app.slice(start, end + 5);
const names = Object.keys(sandbox);
const fn = new Function(...names, iifeSrc + '\nreturn CombatAudio;');
const audio = fn(...names.map(k => sandbox[k]));
ok('CombatAudio evaluated to an object', audio && typeof audio === 'object');
const registry = new Set(Object.keys(audio).filter(k => typeof audio[k] === 'function'));

// Wrap every registry function: log invocation, delegate to the original.
const firedLog = [];
for (const k of registry) {
  const orig = audio[k];
  audio[k] = function (...args) { firedLog.push(k); return orig.apply(this, args); };
}

// ---------- Part A: static resolution audit ----------
function firedHooks() {
  // name -> [{file, line}]
  const out = new Map();
  const jsDir = path.join(ROOT, 'src', 'js');
  for (const f of fs.readdirSync(jsDir).filter(x => x.endsWith('.js'))) {
    const lines = fs.readFileSync(path.join(jsDir, f), 'utf8').split('\n');
    lines.forEach((ln, i) => {
      for (const m of ln.matchAll(/audioEvent\(\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g)) {
        if (!out.has(m[1])) out.set(m[1], []);
        out.get(m[1]).push(`${f}:${i + 1}`);
      }
      for (const m of ln.matchAll(/Game\.audio\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
        if (!out.has(m[1])) out.set(m[1], []);
        out.get(m[1]).push(`direct:${f}:${i + 1}`);
      }
    });
  }
  const mons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'monsters.json'), 'utf8'));
  const walk = (o, where) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach((x, i) => walk(x, `${where}[${i}]`)); return; }
    for (const k of Object.keys(o)) {
      if (/(notice|aggro|declare|resolve|death)Audio$/.test(k) && typeof o[k] === 'string' && /^[A-Za-z_]\w*$/.test(o[k]) && !o[k].includes('?')) {
        if (!out.has(o[k])) out.set(o[k], []);
        out.get(o[k]).push(`data:monsters.json:${where}.${k}`);
      }
      walk(o[k], `${where}.${k}`);
    }
  };
  walk(mons, 'monsters');
  return out;
}
const fired = firedHooks();
const unmapped = [...fired.keys()].filter(h => !registry.has(h));
{
  const detail = unmapped.map(h => `${h} (${fired.get(h).slice(0, 3).join(', ')})`).join('; ');
  ok('every fired hook resolves to a registered synth', unmapped.length === 0,
    unmapped.length ? `SILENT NO-OP HOOKS: ${detail}` : `${fired.size} hooks checked`);
}

// The game's real dispatch rule (game.js audioEvent): unknown names are
// silently skipped. drive() mirrors that rule exactly.
function dispatch(name, data) {
  if (typeof audio[name] === 'function') { audio[name](data || {}); return 'fired'; }
  return 'silent-skip';
}
function resetGraph() { nodes = []; edges = []; nodeSeq = 0; firedLog.length = 0; }
function graphStats() {
  const sources = nodes.filter(n => (n._kind === 'osc' || n._kind === 'noise') && n._started);
  const connected = nodes.filter(n => n._started && edges.some(e => e[0] === n._id)).length;
  return { sources: sources.length, connected, totalNodes: nodes.length };
}
// Control hooks are legitimately silent (stops, mute, accessors).
const CONTROL = new Set(['combatEnd', 'beamSweepStop', 'humStop', 'toggleMute', 'isMuted', 'ensureAudio']);

// ---------- Part B: driven scenario coverage ----------
// Each entry: [hook, data, scenario]. Asserts: dispatch fires (not
// silent-skip), no throw, and the synth produces a sound graph.
const scenarios = [
  // Wave-2 five (Steve 2026-10-06 bar: genuine step up, not reskins)
  ['hecklerTaunt', { shame: 7 }, 'wave2:heckler taunt (shame 7)'],
  ['hecklerTaunt', { shame: 0 }, 'wave2:heckler taunt (shame 0)'],
  ['hecklerLaugh', {}, 'wave2:heckler aggro (monsters.json aggroAudio)'],
  ['hecklerPileOn', {}, 'wave2:heckler pile-on'],
  ['hecklerHeadliner', {}, 'wave2:heckler headliner'],
  ['hecklerJibe', {}, 'wave2:heckler jibe'],
  ['unionBullhorn', {}, 'wave2:union_rep aggro (monsters.json aggroAudio)'],
  ['unionRepChant', {}, 'wave2:union_rep chant (registered, unfired — dead?)'],
  ['unionPicket', {}, 'wave2:union_rep picket'],
  ['unionWalkout', {}, 'wave2:union_rep walkout'],
  ['unionRepWhistle', {}, 'wave2:union_rep whistle'],
  ['paparazzoShutter', {}, 'wave2:paparazzo aggro (monsters.json aggroAudio)'],
  ['paparazzoExclusive', {}, 'wave2:paparazzo exclusive'],
  ['paparazzoFlash', {}, 'wave2:paparazzo flash (registered, unfired — dead?)'],
  ['understudyWatch', {}, 'wave2:understudy aggro (monsters.json aggroAudio)'],
  ['understudyRehearse', {}, 'wave2:understudy rehearse'],
  ['understudyCopy', { fidelity: 0.6 }, 'wave2:understudy copy'],
  ['understudyPerform', {}, 'wave2:understudy perform'],
  ['understudyLearn', {}, 'wave2:understudy learn (registered, unfired — dead?)'],
  ['modNotice', {}, 'wave2:moderator aggro (monsters.json aggroAudio)'],
  ['modNoted', {}, 'wave2:moderator noted'],
  ['modMute', {}, 'wave2:moderator mute'],
  ['modViolation', {}, 'wave2:moderator violation'],
  ['modRemoval', {}, 'wave2:moderator removal (monsters.json resolveAudio)'],
  ['modShadow', {}, 'wave2:moderator shadowban'],
  ['modDown', {}, 'wave2:moderator deplatformed (monsters.json deathAudio)'],
  // Highbeam Deer — the benchmark (160 HP), full combat arc
  ['deerNotice', {}, 'deer: notice (distant, wrong call)'],
  ['deerAggro', {}, 'deer: aggro bellow'],
  ['telegraph', { beam: true, highbeam: true, urgency: 2 }, 'deer: beam declare (slow dread)'],
  ['telegraph', { beam: true, highbeam: true, urgency: 1, windupTick: true }, 'deer: beam windup tick (frantic)'],
  ['beamSweep', { pan: 0.3, heat: 0.6 }, 'deer: beam sweep turn'],
  ['impact', { beam: true, highbeam: true }, 'deer: beam fire resolve'],
  ['deerSnort', {}, 'deer: recharge snort'],
  ['deerDown', {}, 'deer: death'],
  ['beamBlocked', {}, 'deer: beam blocked on cover'],
  ['beamSweepStop', {}, 'deer: beam end (control: silent)'],
  // All 8 pattern telegraphs + resolves (wave-2 flesh-out dispatch surface)
  ...['beam', 'burst', 'charge', 'direct', 'line', 'rush', 'single', 'ambush'].flatMap(p => [
    [`telegraph`, { pattern: p, urgency: 1 }, `pattern:${p} windup`],
    [`impact`, { pattern: p }, `pattern:${p} resolve`],
  ]),
  // Flyer beats — 12 hooks fired by game.js with NO registered synth
  ['nevermoreCroak', {}, 'flyer:nevermore first contact'],
  ['nevermoreLand', {}, 'flyer:nevermore land'],
  ['nevermoreClimb', {}, 'flyer:nevermore climb'],
  ['nevermoreStrafe', {}, 'flyer:nevermore strafe'],
  ['nightcourtSilence', {}, 'flyer:nightcourt first contact'],
  ['nightcourtLand', {}, 'flyer:nightcourt land'],
  ['nightcourtClimb', {}, 'flyer:nightcourt climb'],
  ['kiteHum', {}, 'flyer:statickite first contact'],
  ['kiteBroadcast', {}, 'flyer:statickite broadcast'],
  ['kiteTransmit', {}, 'flyer:statickite transmit'],
  ['kiteClimb', {}, 'flyer:statickite climb'],
  ['kiteMark', {}, 'flyer:statickite mark'],
  // Forager loop — the hunt's missing sounds
  ['animalStalk', {}, 'forage: stalk step'],
  ['animalRustle', {}, 'forage: spawn notice'],
  ['animalSnort', {}, 'forage: deer alarm snort'],
  ['animalBolt', {}, 'forage: bolt'],
  ['animalKill', {}, 'forage: kill thud'],
  ['animalButcher', {}, 'forage: butcher'],
  ['animalBite', {}, 'forage: bite'],
  ['animalPinch', {}, 'forage: pinch'],
  ['animalSplash', {}, 'forage: splash'],
  ['animalFlop', {}, 'forage: flop'],
  ['animalChatter', {}, 'forage: chatter'],
  ['animalPant', {}, 'forage: winded'],
  ['animalRattle', {}, 'forage: rattlesnake warning'],
  ['animalSpray', {}, 'forage: skunk spray'],
  ['animalQuill', {}, 'forage: porcupine'],
  ['animalHonk', {}, 'forage: goose'],
  ['animalYowl', {}, 'forage: bobcat'],
  ['animalCharge', {}, 'forage: charger'],
  ['animalTailSlap', {}, 'forage: beaver'],
  ['animalWhistle', {}, 'forage: groundhog'],
  ['animalFlush', {}, 'forage: grouse'],
  ['animalHiss', {}, 'forage: snapping turtle'],
  // Contest beats
  ['contestCall', {}, 'contest: window announced'],
  ['contestTaken', {}, 'contest: the grab'],
  ['contestSpared', {}, 'contest: announced not-taken'],
  // Social scenario beats
  ['confront', {}, 'social: confrontation'],
  ['justiceVerdict', {}, 'social: moot verdict'],
  ['exileWalk', {}, 'social: exile walk'],
  ['joinVillage', {}, 'social: join village (probation)'],
  ['claimSite', {}, 'social: claim site'],
  ['chopWood', {}, 'social: chop wood'],
  ['buildShelter', {}, 'social: build shelter'],
  ['foundHaven', {}, 'social: found haven'],
  // System beats
  ['combatStart', {}, 'system: combat opens'],
  ['round', { round: 5 }, 'system: round tick'],
  ['crash', { cause: 'bulldozer' }, 'system: structure destroyed'],
  ['levelup', { quiet: true }, 'system: level up'],
  ['passiveUnlock', { quiet: true }, 'system: passive unlock'],
  ['waveUnlock', {}, 'system: wave unlock'],
  ['genesis_plant', {}, 'system: genesis plant'],
  ['gravity_well', {}, 'system: gravity well'],
  ['victory', {}, 'system: victory sting'],
  ['defeat', {}, 'system: defeat sting'],
  ['heartbeat', {}, 'system: heartbeat'],
  ['shout', {}, 'system: player shout'],
  ['talkAttention', {}, 'system: talk attention'],
  ['horrorSting', {}, 'system: UI dread sting'],
  // Glasswing / sunbasker / projector / eureka / swarm / drone / belltoad
  ['glasswingCircle', {}, 'glasswing: circle'],
  ['glasswingDive', {}, 'glasswing: dive'],
  ['glasswingLand', {}, 'glasswing: land'],
  ['glasswingClimb', {}, 'glasswing: climb'],
  ['glasswingShadowClose', { turns: 2 }, 'glasswing: shadow close'],
  ['baskCharge', { charge: 0.5 }, 'sunbasker: bask charge'],
  ['baskBreak', {}, 'sunbasker: charge broken'],
  ['baskFlatten', {}, 'sunbasker: flatten'],
  ['projectorHum', {}, 'projector: hum'],
  ['projectorStatic', {}, 'projector: static'],
  ['projectorBreak', {}, 'projector: break'],
  ['projectorPull', {}, 'projector: pull'],
  ['projectorFire', {}, 'projector: fire'],
  ['eurekaTick', {}, 'eureka: tick'],
  ['eurekaCharge', {}, 'eureka: charge'],
  ['eurekaDetonate', {}, 'eureka: detonate'],
  ['eurekaSpent', {}, 'eureka: spent'],
  ['eurekaDisperse', {}, 'eureka: disperse'],
  ['eurekaDrift', {}, 'eureka: drift'],
  ['swarmFilm', {}, 'swarm: film'],
  ['swarmBuild', {}, 'swarm: build'],
  ['swarmFlash', {}, 'swarm: flash'],
  ['swarmEscalate', {}, 'swarm: escalate'],
  ['swarmScatter', {}, 'swarm: scatter'],
  ['swarmShutters', {}, 'swarm: shutters'],
  ['humNotice', {}, 'hummice: notice'],
  ['humRise', { stacks: 3 }, 'hummice: rise'],
  ['humBreak', {}, 'hummice: break'],
  ['droneHum', {}, 'drone: hum'],
  ['droneCount', {}, 'drone: count'],
  ['droneBeam', {}, 'drone: beam resolve'],
  ['droneRecalc', {}, 'drone: recalc'],
  ['droneCorrect', {}, 'drone: correct'],
  ['belltoadCroak', {}, 'belltoad: croak'],
  ['belltoadStun', {}, 'belltoad: stun'],
  ['belltoadChorus', {}, 'belltoad: chorus'],
  ['toadSwell', {}, 'toad: swell'],
  // Wave-1 batch beasts
  ['boarNotice', {}, 'wave1:boar notice'],
  ['boarSnort', {}, 'wave1:boar snort'],
  ['boarCharge', {}, 'wave1:boar charge resolve'],
  ['boarTrample', {}, 'wave1:boar trample'],
  ['wolfSilence', {}, 'wave1:wolf silence'],
  ['wolfSnarl', {}, 'wave1:wolf snarl'],
  ['wolfBreak', {}, 'wave1:wolf break'],
  ['heronStatic', {}, 'wave1:heron static'],
  ['heronUnfold', {}, 'wave1:heron unfold'],
  ['heronStrike', {}, 'wave1:heron strike resolve'],
  ['turtleSnap', {}, 'wave1:turtle snap resolve'],
  ['turtleBunker', {}, 'wave1:turtle bunker'],
  ['stagMirror', {}, 'wave1:stag mirror'],
  ['stagSnort', {}, 'wave1:stag snort'],
  ['stagCharge', {}, 'wave1:stag charge resolve'],
  ['stagConfused', {}, 'wave1:stag confused'],
  ['ducksQuack', {}, 'wave1:ducks quack'],
  ['ducksQuackCut', {}, 'wave1:ducks quack cut'],
  ['duckLineUp', {}, 'wave1:duck line up'],
  ['duckMarch', {}, 'wave1:duck march'],
  ['duckNip', {}, 'wave1:duck nip'],
  ['duckRegroup', {}, 'wave1:duck regroup'],
  ['duckScreech', {}, 'wave1:duck screech'],
  ['ducksRejoin', {}, 'wave1:ducks rejoin (registered, unfired — dead?)'],
  ['catfishLure', {}, 'wave1:catfish lure'],
  ['catfishSnap', {}, 'wave1:catfish snap'],
  ['catfishStill', {}, 'wave1:catfish still'],
  ['lockpickChitter', {}, 'wave1:lockpick chitter'],
  ['lockpickGrab', {}, 'wave1:lockpick grab'],
  ['mothFlash', {}, 'wave1:moth flash'],
  ['mothFlutter', {}, 'wave1:moth flutter'],
  ['snakeSplit', {}, 'wave1:snake split'],
  // Manager aliases + generic wound/death + misc
  ['managerCircle', {}, 'manager: circle'],
  ['managerAnnounce', {}, 'manager: announce (registered, unfired — dead?)'],
  ['managerCharge', {}, 'manager: charge'],
  ['managerDebrief', {}, 'manager: debrief'],
  ['managerFear', {}, 'manager: fear'],
  ['delegateCircle', {}, 'manager: delegateCircle alias'],
  ['delegateAnnounce', {}, 'manager: delegateAnnounce alias (registered, unfired — dead?)'],
  ['delegateCharge', {}, 'manager: delegateCharge alias (registered, unfired — dead?)'],
  ['delegateDebrief', {}, 'manager: delegateDebrief'],
  ['monsterDown', {}, 'generic: monster death fallthrough'],
  ['monsterHurt', {}, 'generic: monster wound'],
  ['staticScream', {}, 'wave2: voice_mimic reveal scream'],
  ['staticCry', {}, 'wave2: static cry'],
  ['staticBreak', {}, 'wave2: static break'],
  ['serviceRush', {}, 'wave2: service_mimic rush resolve'],
  ['contractBind', {}, 'wave2: contractBind (registered, unfired — dead?)'],
  ['holdMusic', { mood: 'watching' }, 'system: hold music'],
  ['lineCut', {}, 'system: line cut'],
  ['paperRustle', {}, 'system: paper rustle'],
  ['hypeInflate', {}, 'hype: inflate'],
  ['hypeEncourage', {}, 'hype: encourage'],
  ['hypeDetonate', {}, 'hype: detonate'],
  ['hypeDeflate', {}, 'hype: deflate'],
  ['landlordClaim', {}, 'landlord: claim'],
  ['landlordSpread', {}, 'landlord: spread'],
  ['landlordEvict', {}, 'landlord: evict'],
  ['landlordStamp', {}, 'landlord: stamp (registered, unfired — dead?)'],
];

const silentObserved = [];
const thinObserved = [];
const thrownObserved = [];
for (const [hook, data, scenario] of scenarios) {
  resetGraph();
  let outcome, err = null;
  try { outcome = dispatch(hook, data); }
  catch (e) { outcome = 'threw'; err = e && e.message; }
  if (outcome === 'silent-skip') { silentObserved.push(`${hook} [${scenario}]`); continue; }
  if (outcome === 'threw') { thrownObserved.push(`${hook}: ${err}`); continue; }
  ok(`hook fires: ${hook} (${scenario})`, firedLog.includes(hook), 'dispatched but wrapper not invoked');
  if (CONTROL.has(hook)) continue;
  const st = graphStats();
  if (st.sources === 0) thinObserved.push(`${hook} (${scenario}): zero started sources`);
  else if (st.sources === 1 && st.totalNodes <= 4) thinObserved.push(`${hook} (${scenario}): thin — 1 source, ${st.totalNodes} nodes`);
}
{
  const flyer = silentObserved.filter(s => /flyer:/.test(s));
  ok('no silent skips outside the known flyer gap', silentObserved.length === flyer.length && flyer.length === 12,
    silentObserved.length ? `silent: ${silentObserved.join('; ')}` : 'none');
}
ok('no driven hook throws', thrownObserved.length === 0, thrownObserved.join('; '));

// ---------- Part C: full-registry sweep (every synth runs, thin-synth scan) ----------
// Drives EVERY registered synth once to catch throws anywhere, and flags
// thin ones (single source, tiny graph) as rename/rethink candidates.
// No ears-on: thinness is an objective proxy, not a verdict on feel.
const argShapes = [{}, { round: 5 }, { cause: 'bulldozer' }, { quiet: true }, { fidelity: 0.8 }, { pan: 0.3, heat: 0.6 }, { urgency: 1, pattern: 'burst' }, { stacks: 3 }, { turns: 2 }, { charge: 0.5 }, { dur: 1.2 }, { beam: true, highbeam: true }];
const thinSynths = [];
const sweepThrown = [];
for (const key of registry) {
  if (key === 'toggleMute' || key === 'isMuted' || key === 'ensureAudio') continue; // accessors
  resetGraph();
  // Stateful sustained synths: clear the IIFE's held state before the first
  // call, otherwise only the param-updater runs and the graph looks silent.
  if (key === 'beamSweep') { try { audio.beamSweepStop(); } catch (e) {} }
  let threw = null;
  for (const a of argShapes) {
    try { audio[key](a); } catch (e) { threw = e && e.message; break; }
  }
  if (threw) { sweepThrown.push(`${key}: ${threw}`); continue; }
  if (CONTROL.has(key)) continue;
  const st = graphStats();
  if (st.sources === 0) thinSynths.push(`${key}: SILENT (no started sources)`);
  else if (st.sources === 1 && st.totalNodes <= 5) thinSynths.push(`${key}: thin (1 source, ${st.totalNodes} nodes)`);
}
try { audio.combatEnd(); } catch (e) {}
ok('full-registry sweep: no synth throws', sweepThrown.length === 0, sweepThrown.join('; '));

// Dead synths: registered but never fired by any call site AND not reached
// through telegraph()/impact() dispatch or combatEnd()/delegate alias wiring.
{
  const deadRaw = [...registry].filter(k => !fired.has(k));
  // reachability through the pattern dispatchers + control paths
  const internalReachable = new Set([
    'beamCharge', 'beamFire', 'beamTechWindup', 'burstWindup', 'chargeWindup', 'diveWindup',
    'lineWindup', 'lockonTick', 'rushWindup', 'burstDetonate', 'chargeImpact', 'lockonHit',
    'lineStrike', 'rushHit', 'diveImpact', 'ambushSnap', 'droneBeam', 'impactWild', 'beamFlash',
  ]);
  const dead = deadRaw.filter(k => !internalReachable.has(k) && !CONTROL.has(k));
  console.log(`\nDEAD SYNTHS (registered, never fired, not dispatch-reachable): ${dead.length}`);
  for (const k of dead) console.log(`  dead: ${k}`);
  console.log(`\nTHIN/GENERIC CANDIDATES (objective layer scan, no ears-on): ${thinSynths.length}`);
  for (const t of thinSynths) console.log(`  thin: ${t}`);
  console.log(`\nREGISTRY SIZE: ${registry.size} | FIRED HOOKS: ${fired.size} | UNMAPPED: ${unmapped.length}`);
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
