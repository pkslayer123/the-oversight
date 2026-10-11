// Break-it audio — wave-3 voice honesty test.
// Every new voice must actually synthesize something (schedule oscillators /
// noise sources) for its representative data shapes — no empty shells — and
// must survive empty/undefined data without throwing (fire sites pass {}).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'src', 'js', 'app.js'), 'utf8');

const iifeStart = appSrc.indexOf('const CombatAudio = (() => {');
const assignIdx = appSrc.indexOf('Game.audio = CombatAudio;');
const iifeText = appSrc.slice(iifeStart, appSrc.lastIndexOf('})();', assignIdx) + 5);

function param() {
  return {
    value: 0,
    setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
    setTargetAtTime() {}, cancelScheduledValues() {},
  };
}
function node() { return { connect() {}, start() {}, stop() {} }; }
function makeCtx(rec) {
  return {
    state: 'running', sampleRate: 44100, currentTime: 0, destination: {},
    resume() {},
    createOscillator() { rec.osc++; const n = node(); n.frequency = param(); return n; },
    createGain() { rec.gain++; const n = node(); n.gain = param(); return n; },
    createBiquadFilter() { rec.filt++; const n = node(); n.frequency = param(); n.Q = param(); return n; },
    createBuffer(ch, len) { rec.buf++; return { getChannelData() { return new Float32Array(len); } }; },
    createBufferSource() { rec.src++; const n = node(); n.loop = false; return n; },
    createDynamicsCompressor() {
      const n = node();
      n.threshold = param(); n.knee = param(); n.ratio = param(); n.attack = param(); n.release = param();
      return n;
    },
  };
}

const VOICES = {
  redactorPoint: [{}], gavelVerdict: [{}], gavelAccuse: [{}],
  spoolRecord: [{ n: 3 }, {}], spoolReplayStart: [{}], spoolReplay: [{ kind: 'move' }, {}],
  chorusStumble: [{}], chorusBeat: [{ beat: 4, downbeat: true }, { beat: 2, downbeat: false }, {}],
  chorusDance: [{}], gravelThrow: [{}],
  tosClause: [{ clause: 't1' }, {}], tosAccept: [{}], tosPenalty: [{}],
  tosLoophole: [{}], tosObject: [{}], tosRead: [{}],
  callbackRing: [{}], bufferStall: [{}], adbreakCut: [{}],
};

let failures = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + m); if (!c) failures++; };

for (const [name, shapes] of Object.entries(VOICES)) {
  for (const data of shapes) {
    const rec = { osc: 0, src: 0, gain: 0, filt: 0, buf: 0 };
    const g = { window: { AudioContext: function () { return makeCtx(rec); } } };
    let CA;
    try {
      CA = new Function('window', iifeText + '\nreturn CombatAudio;')(g.window);
    } catch (e) { ok(false, name + ' IIFE builds: ' + e.message); continue; }
    ok(typeof CA[name] === 'function', name + ' is registered');
    if (typeof CA[name] !== 'function') continue;
    let threw = null;
    try { CA[name](data); } catch (e) { threw = e; }
    const label = name + ' ' + JSON.stringify(data);
    ok(!threw, label + ' does not throw' + (threw ? ': ' + threw.message : ''));
    ok(rec.osc + rec.src > 0, label + ' synthesizes sound (' + rec.osc + ' osc, ' + rec.src + ' noise src)');
  }
}
console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'ALL GREEN'));
process.exit(failures ? 1 : 0);
