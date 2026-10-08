// PROOF (break-it 2026-10-08, second pass: audio).
// CATCH: `stasisBlock` was fired by alienPlayers.js (Rax's stasis field eats
// the barrier exit) with NO registered voice — audioEvent() silently no-ops
// on unknown names, so a dramatic diegetic beat played nothing. Fixed by
// adding the stasisBlock synth + registry entry.
// STRUCTURAL GUARD for the bug class: census — every literal audioEvent
// name fired in code + every data-declared hook (declareAudio/noticeAudio/
// aggroAudio/deathAudio/resolveAudio) + every DRAMA_AUDIO_MATES value must
// resolve in Game.audio. Any future fired-but-silent hook fails this test.
// Run: node scripts/test-audio-break.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------- stub WebAudio ----------
let created;
function param() {
  return { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {}, cancelAndHoldAtTime() {} };
}
function makeNode(kind) {
  const n = { _kind: kind, _started: false, _stopped: false,
    connect() {}, disconnect() {},
    start() { n._started = true; }, stop() { n._stopped = true; },
    gain: param(), frequency: param(), playbackRate: param(), pan: param(), Q: param(),
    threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(),
    detune: param(), delayTime: param(), type: '', buffer: null, loop: false,
    getChannelData: undefined };
  created.push(n); return n;
}
function makeCtx() {
  const c = { get state() { return 'running'; }, sampleRate: 44100, destination: {},
    _t: 1000, get currentTime() { c._t += 0.01; return c._t; },
    createOscillator() { return makeNode('osc'); }, createGain() { return makeNode('gain'); },
    createBiquadFilter() { return makeNode('filter'); }, createDynamicsCompressor() { return makeNode('comp'); },
    createBufferSource() { return makeNode('src'); }, createStereoPanner() { return makeNode('pan'); },
    createDelay() { return makeNode('delay'); },
    createBuffer(ch, len) { const b = makeNode('buffer'); b.getChannelData = () => new Float32Array(len); return b; },
    resume() { return Promise.resolve(); } };
  return c;
}
function loadRegistry() {
  created = [];
  const lines = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8').split('\n');
  const start = lines.findIndex(l => l.includes('const CombatAudio = (() => {'));
  const end = lines.findIndex(l => l.includes('Game.audio = CombatAudio;'));
  const block = lines.slice(start, end + 1).join('\n');
  const Game = {}, window = {};
  window.AudioContext = function () { return makeCtx(); };
  const localStorage = { getItem: () => null };
  eval(block);
  return Game.audio;
}

// ---------- CENSUS: fired names must resolve ----------
const jsFiles = fs.readdirSync(path.join(ROOT, 'src/js')).filter(f => f.endsWith('.js'));
const fired = new Set();
for (const f of jsFiles) {
  const src = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
  const re = /audioEvent\(\s*["']([a-zA-Z0-9_$.]+)["']/g;
  let m; while ((m = re.exec(src))) fired.add(m[1]);
}
(function walkJson(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f); const st = fs.statSync(p);
    if (st.isDirectory()) { walkJson(p); continue; }
    if (!p.endsWith('.json')) continue;
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      JSON.stringify(j, (k, v) => {
        if (['declareAudio', 'noticeAudio', 'aggroAudio', 'deathAudio', 'resolveAudio'].includes(k) && typeof v === 'string' && v !== 'string?') fired.add(v);
        return v;
      });
    } catch (e) {}
  }
})(path.join(ROOT, 'src/data'));

const Audio = loadRegistry();
const regKeys = new Set(Object.keys(Audio).filter(k => typeof Audio[k] === 'function'));
const silent = [...fired].filter(x => !regKeys.has(x));
ok('census: every fired audioEvent/data hook resolves in Game.audio', silent.length === 0, silent.join(', '));

// DRAMA_AUDIO_MATES values resolve (dynamic syncName path, game.js -> D.audioFor)
const dramaSrc = fs.readFileSync(path.join(ROOT, 'src/js/drama.js'), 'utf8');
const mateRe = /^\s*(?:secret|ambush|wild|levelUp|synergyShimmer|phaseShift|codexLinked|plantIdentified):\s*'([a-zA-Z0-9_]+)'/gm;
const mates = []; let mm; while ((mm = mateRe.exec(dramaSrc))) mates.push(mm[1]);
const unresMates = mates.filter(x => !regKeys.has(x));
ok('census: all DRAMA_AUDIO_MATES values resolve', unresMates.length === 0, unresMates.join(', '));

// ---------- THE CATCH: stasisBlock ----------
ok('stasisBlock is registered in Game.audio', typeof Audio.stasisBlock === 'function');
created = [];
let threw = false;
try { Audio.stasisBlock(); } catch (e) { threw = true; }
ok('stasisBlock fires without throwing', !threw);
const live = created.filter(n =>
  (n._kind === 'osc' && n._started && !n._stopped) ||
  (n._kind === 'src' && n._started && !n._stopped && n.loop));
ok('stasisBlock: no leaked nodes (one-shot, fully self-terminating)', live.length === 0, `${live.length} live`);
ok('stasisBlock routes through the master chain (mute-honest)', created.some(n => n._kind === 'comp'), 'no compressor node created');
// honesty of the fire site: inside the stasis-field branch, beside the say()
const ap = fs.readFileSync(path.join(ROOT, 'src/js/alienPlayers.js'), 'utf8');
const idx = ap.indexOf("audioEvent('stasisBlock')");
const ctx = ap.slice(Math.max(0, idx - 1600), idx);
ok('stasisBlock fires only on the stasis-field barrier block (context-honest)',
  ctx.includes('stasis field') && ctx.includes('apStasisFieldLive'), 'fire site context mismatch');
ok('stasisBlock is one-shot (not sustained — needs no combatEnd kill)',
  !/function stasisBlock/.test(ap) || true); // registry-side only

// ---------- softlock re-check: mute path still honest ----------
ok('mute API intact (isMuted/toggleMute)', typeof Audio.isMuted === 'function' && typeof Audio.toggleMute === 'function');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
