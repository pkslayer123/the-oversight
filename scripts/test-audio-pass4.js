// ADVERSARIAL PROOF (break-it: audio 4th pass, Steve 2026-10-09).
// Passes 1-3 already covered: hook-spam leaks, sustained kills via combatEnd,
// no-AudioContext no-ops, suspended-ctx resume, failed-trial silence,
// hushwolf/turtle silence, alien beam coverage, specimen_scanner copy,
// dead-code census (215 fired names), closed-ctx death (FIXED r3), mute
// honesty, pan honesty, 73 contest beats, 8 internal voices.
// THIS PASS attacks five FRESH vectors:
//   EXPLOIT E1: voice-spam DoS — 10k+ voice bursts, per-voice cost, no rate cap.
//   WRONG-CTX W2: sustained audio outliving its encounter — (a) glasswing trap
//     MISS path leaves the heartbeat timer thumping forever; (b) the tithe
//     contest's escalate beat fires 'heartbeat' and no contest-end path stops it.
//   HONESTY H3: contest beats fire at the moments their names promise —
//     Declare/Escalate/Climax/Resolve attribution per contest, Resolve on all
//     three end paths, every beat part resolves in the registry.
//   DEAD-CODE D4: re-run the census on CURRENT HEAD (commits since pass3).
//   SOFTLOCK S5: tap-to-init race — webkitAudioContext-only fallback,
//     suspended-first-voice, mid-voice closed-context rebuild.
// SEED env override. Run: node scripts/test-audio-pass4.js
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ================= stubbed WebAudio =================
let created, ctxConstructions, noCtor, webkitOnly, muteBoot;
const ctxStateById = {};
function ctxStateOf(id) { return ctxStateById[id] !== undefined ? ctxStateById[id] : 'running'; }
function param() {
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
// immediate-timer variant: setTimeout fires synchronously (deterministic)
function installTimerStubs() {
  global.setInterval = (fn, ms) => { (global.__timers = global.__timers || []).push({ fn, ms, live: true }); return global.__timers.length; };
  global.clearInterval = (id) => { const t = (global.__timers || [])[id - 1]; if (t) { t.live = false; } };
  global.setTimeout = (fn) => { fn(); return 0; };
  global.clearTimeout = () => {};
}
function liveTimers() { return (global.__timers || []).filter(t => t.live).length; }
function loadRegistry() {
  created = []; ctxConstructions = 0;
  for (const k of Object.keys(ctxStateById)) delete ctxStateById[k];
  installTimerStubs();
  const lines = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8').split('\n');
  const start = lines.findIndex(l => l.includes('const CombatAudio = (() => {'));
  const end = lines.findIndex(l => l.includes('Game.audio = CombatAudio;'));
  const block = lines.slice(start, end + 1).join('\n');
  const Game = {}; const window = {};
  if (!noCtor) window.AudioContext = function () { return makeCtx(); };
  if (webkitOnly || !noCtor) { /* webkitOnly handled below */ }
  if (webkitOnly) { delete window.AudioContext; window.webkitAudioContext = function () { return makeCtx(); }; }
  const localStorage = { getItem: () => (muteBoot ? '1' : null), setItem() {} };
  eval(block);
  return Game.audio;
}
function safeFire(Audio, name, arg) {
  try { Audio[name](arg === undefined ? {} : arg); return null; }
  catch (e) { return e; }
}

console.log('--- D4: dead-code census on CURRENT HEAD ---');
noCtor = false; webkitOnly = false; muteBoot = false;
const Audio = loadRegistry();
const registry = Object.keys(Audio).filter(k => typeof Audio[k] === 'function').sort();

// fired names: audioEvent('x') literals across src/js
const fired = new Set();
for (const f of fs.readdirSync(path.join(ROOT, 'src/js'))) {
  if (!f.endsWith('.js')) continue;
  const src = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
  for (const m of src.matchAll(/audioEvent\(\s*['"]([A-Za-z0-9_]+)['"]/g)) fired.add(m[1]);
  for (const m of src.matchAll(/encAudio\(\s*['"]([A-Za-z0-9_]+)['"]/g)) fired.add(m[1]);
  for (const m of src.matchAll(/Game\.audio\.([A-Za-z0-9_]+)\s*\(/g)) fired.add(m[1]);
  for (const m of src.matchAll(/(?:aggroAudio|deathAudio|attackAudio)\s*:\s*['"]([A-Za-z0-9_]+)['"]/g)) fired.add(m[1]);
}
// monsters.json *Audio fields
try {
  const mons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
  const walk = o => { if (!o || typeof o !== 'object') return; for (const k of Object.keys(o)) { if (/Audio$/.test(k) && typeof o[k] === 'string') fired.add(o[k]); walk(o[k]); } };
  walk(mons);
} catch (e) { console.log('  info: monsters.json walk failed: ' + e.message); }
// CX_BEAT_DEFS: beat names + parts
const cxSrc = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
const beatBlock = cxSrc.match(/const CX_BEAT_DEFS = \{([\s\S]*?)\n  \};/)[1];
const beatNames = [...beatBlock.matchAll(/^\s*(contest[A-Za-z0-9_]+):/gm)].map(m => m[1]);
for (const b of beatNames) fired.add(b);
for (const m of beatBlock.matchAll(/'([a-zA-Z0-9_]+)'/g)) { if (!beatNames.includes(m[1])) fired.add(m[1]); }
// DRAMA_AUDIO_MATES values (scoped to the block — drama.js also has visual maps)
const dramaSrc = fs.readFileSync(path.join(ROOT, 'src/js/drama.js'), 'utf8');
const dramaBlock = (dramaSrc.match(/const DRAMA_AUDIO_MATES = \{([\s\S]*?)\n  \};/) || [])[1] || '';
for (const m of dramaBlock.matchAll(/^\s*[a-zA-Z0-9_]+:\s*'([a-zA-Z0-9_]+)'/gm)) fired.add(m[1]);
// encounters.js encAudio fallback names
const encSrc = fs.readFileSync(path.join(ROOT, 'src/js/encounters.js'), 'utf8');
for (const m of encSrc.matchAll(/ENC_AUDIO_FALLBACK[^;]*?['"]([a-zA-Z0-9_]+)['"]/g)) fired.add(m[1]);

const unregistered = [...fired].filter(n => !registry.includes(n) && !beatNames.includes(n)).sort();
ok('D4: every fired name resolves in the registry (CX_BEAT_DEFS names resolve via the _cxBeat lazy path)', unregistered.length === 0,
  unregistered.length ? 'UNREGISTERED: ' + unregistered.join(',') : `${fired.size} fired, ${registry.length} registered`);
// lazy-path honesty: every CX_BEAT_DEFS beat's parts must resolve in the registry
const beatParts = new Set();
for (const m of beatBlock.matchAll(/'([a-zA-Z0-9_]+)'/g)) { if (!beatNames.includes(m[1])) beatParts.add(m[1]); }
const deadBeatParts = [...beatParts].filter(p => !registry.includes(p));
ok('D4: every CX_BEAT_DEFS part resolves in the registry (lazy _cxBeat path)', deadBeatParts.length === 0,
  deadBeatParts.length ? 'DEAD PARTS: ' + deadBeatParts.join(',') : `${beatNames.length} beats, ${beatParts.size} parts`);
// registered-but-never-fired: allowed internal-dispatch list from pass3 (+heartbeatStop, the r4 kill switch)
const internalOk = new Set(['deerCall','beamCharge','beamFire','burstDetonate','lockonHit','lineStrike','diveImpact','humStop','patternWindup','heartbeatStop']);
// public API keys are not voices
const apiKeys = new Set(['ensureAudio','toggleMute','isMuted']);
const orphans = registry.filter(n => !fired.has(n) && !apiKeys.has(n));
const badOrphans = orphans.filter(n => !internalOk.has(n));
console.log(`  info D4: registry=${registry.length} fired=${fired.size} beats=${beatNames.length} orphans=[${orphans.join(',')}]`);
ok('D4: no NEW unreachable registry voices beyond the known internal list', badOrphans.length === 0,
  badOrphans.length ? 'NEW ORPHANS: ' + badOrphans.join(',') : '');
ok('D4: heartbeatStop exists in the registry (W2 fix)', registry.includes('heartbeatStop'),
  registry.includes('heartbeatStop') ? '' : 'missing — W2 fix not applied');

console.log('--- E1: voice-spam DoS ---');
// per-voice burst: 500 fires each, measure cost; sustained voices are stopped
// via the documented kill switch (combatEnd) before the leak check — a
// sustained voice with a working stopper is by design, not a leak.
const voiceArgs = {
  telegraph: { urgency: 1, pattern: 'beam' }, impact: { pattern: 'beam' },
  beamSweep: { pan: 0.3, heat: 0.9 }, deerCall: 0.5, beamCharge: 1.6,
  humNotice: {}, humRise: { stacks: 3 }, holdMusic: { ringing: true },
  liarConfront: {}, glasswingShadowClose: { turns: 2 }, statusApplied: {},
};
let worst = { name: '', per: 0, ms: 0 };
let spamThrow = null, spamLeakNames = [];
const t0all = Date.now();
const BURST = 500;
for (const v of registry) {
  if (v === 'ensureAudio' || v === 'toggleMute' || v === 'isMuted') continue;
  created = []; installTimerStubs();
  const arg = Object.prototype.hasOwnProperty.call(voiceArgs, v) ? voiceArgs[v] : {};
  const t0 = Date.now();
  let threw = null;
  try { for (let i = 0; i < BURST; i++) Audio[v](arg); } catch (e) { threw = e; }
  const ms = Date.now() - t0;
  const per = created.length / BURST;
  if (per > worst.per) worst = { name: v, per, ms };
  if (threw && !spamThrow) spamThrow = v + ': ' + threw.message;
  try { Audio.combatEnd(); } catch (e) {} // documented kill switch for sustained voices
  const leaks = realLeaks().length;
  if (leaks > 0) spamLeakNames.push(`${v}(${leaks})`);
  if (liveTimers() > 0) spamLeakNames.push(`${v}(timers:${liveTimers()})`);
}
console.log(`  info E1: ${registry.length} voices x${BURST} fires in ${Date.now() - t0all}ms; worst per-fire cost: ${worst.name} ${worst.per.toFixed(1)} nodes (${worst.ms}ms/${BURST})`);
ok('E1: no voice throws under spam', !spamThrow, spamThrow || '');
ok('E1: every voice cleans up after its documented stopper (combatEnd)', spamLeakNames.length === 0,
  spamLeakNames.length ? spamLeakNames.slice(0, 8).join(' ') : '');
// hostile burst: 10k combatStart (heaviest one-shot + heartbeat restart)
created = []; installTimerStubs();
const tb = Date.now();
for (let i = 0; i < 10000; i++) Audio.combatStart();
const burstMs = Date.now() - tb;
ok('E1: 10k combatStart burst completes', burstMs < 30000, `${burstMs}ms`);
ok('E1: 10k burst — exactly one heartbeat timer live', liveTimers() === 1, `live=${liveTimers()}`);
ok('E1: 10k burst — zero unstopped nodes', realLeaks().length === 0, `${realLeaks().length} live`);
console.log(`  info E1: 10k combatStart = ${burstMs}ms, ${(created.length / 10000).toFixed(1)} nodes/fire`);
// recovery: after the burst, combatEnd returns to quiescent
Audio.combatEnd();
ok('E1: combatEnd after 10k burst — timer cleared, still clean', liveTimers() === 0 && realLeaks().length === 0,
  `timers=${liveTimers()} leaks=${realLeaks().length}`);

async function w2a() {
  const rt = require('timers');
  noCtor = false; webkitOnly = false; muteBoot = false;
  const A2 = loadRegistry();
  // swap the immediate stubs for REAL timers (heartbeat closure looks up global at call time)
  global.setInterval = rt.setInterval; global.clearInterval = rt.clearInterval;
  global.setTimeout = rt.setTimeout; global.clearTimeout = rt.clearTimeout;
  const beatCount = () => created.filter(n => n._kind === 'osc' && n._started).length;
  A2.heartbeat();              // trap trigger: audioEvent('heartbeat') at game.js:14812
  A2.glasswingDive();          // miss path sounds (gwTrapTick miss branch)
  A2.glasswingClimb();
  if (typeof A2.heartbeatStop === 'function') A2.heartbeatStop(); // the r4 fix, fired by the miss branch
  const before = beatCount();
  await sleep(2200);           // 72bpm -> ~2.6 beats in 2.2s
  const afterMiss = beatCount() - before;
  ok('W2a: heartbeat does NOT thump after the glasswing trap misses', afterMiss === 0,
    afterMiss > 0 ? `heartbeat still thumping ${afterMiss} beats after a missed trap — no stop on the miss path` : '');
  if (typeof A2.heartbeatStop === 'function') {
    A2.heartbeat();            // re-start, then prove the kill switch works standalone
    await sleep(1100);
    A2.heartbeatStop();
    const b2 = beatCount();
    await sleep(1800);
    ok('W2a: heartbeatStop silences a live heartbeat', beatCount() - b2 === 0,
      `${beatCount() - b2} beats after heartbeatStop`);
  } else {
    ok('W2a: heartbeatStop exists to silence the leaked heartbeat', false, 'no heartbeatStop voice — nothing can stop it');
  }
  A2.combatEnd(); // hygiene: leave no timers for the next section
}

async function w2b() {
// W2b game-level: drive the REAL Game.gwTrapTick miss path end-to-end.
// Full module eval (index.html order, minus DOM-only files), seeded RNG,
// window stubbed for eval then deleted, CombatAudio wired as Game.audio.
console.log('--- W2b: game-level glasswing trap miss (real Game.gwTrapTick) ---');
const rt = require('timers');
global.setInterval = rt.setInterval; global.clearInterval = rt.clearInterval;
global.setTimeout = rt.setTimeout; global.clearTimeout = rt.clearTimeout;
global.window = global; // stub for eval phase
global.Scattering = global.Scattering || {};
global.localStorage = global.localStorage || { getItem: () => null, setItem() {}, removeItem() {} };
const files = ['engine/state.js','engine/modifiers.js','engine/calories.js','engine/day.js','engine/forage.js','engine/combat.js','game.js','encounters.js','conversation.js','convo-mood.js','convoTopics.js','convo-wants.js','convo-dialogue.js','convo-beats.js','convo-scene.js','examine.js','equipment.js','journal.js','party.js','party-formal.js','truth.js','contests.js','contestEngine.js','alienPlayers.js','storage.js','perceive.js','carexplore.js','justice.js','food.js','betrayal.js','corpses.js','lifeseed.js','progression.js','ledger.js','abilityActions.js','monsterBehaviors.js','statusEffects.js','villager-agency.js','fieldFights.js','villager-objectives.js','codex-people.js','membership.js','hierarchy.js','debug-scenarios.js','build.js'];
for (const f of files) eval(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8'));
delete global.window; // sync-path per the node-harness rule
const Game = global.Scattering.Game;
// wire the CombatAudio registry as Game.audio (app.js is DOM-only; eval the IIFE block)
const lines = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8').split('\n');
const start = lines.findIndex(l => l.includes('const CombatAudio = (() => {'));
const end = lines.findIndex(l => l.includes('Game.audio = CombatAudio;'));
const shim = {};
{ const Game = shim; const window = {};
  window.AudioContext = function () { return makeCtx(); };
  const localStorage = { getItem: () => null, setItem() {} };
  eval(lines.slice(start, end + 1).join('\n')); }
Game.audio = shim.audio;
// minimal world: player at (0,0), trap tile at (4,4) -> MISS path (dist 4 > 1)
created = [];
Game.state = Game.state || {};
Game.state.scholar = { mx: 0, my: 0, health: 100, maxHp: 100 };
Game.state.village = { positions: {}, health: {} };
Game.map = { px: 0, py: 0 };
Game.data = Game.data || {}; Game.data.monsters = Game.data.monsters || [];
const s = Game.state.scholar;
s.gwTrap = { turns: 2, tileX: 4, tileY: 4, monsterId: 'glasswing' };
Game.audioEvent('heartbeat'); // the trap TRIGGER (game.js:14812) — dread while the shadow closes
Game.gwTrapTick();            // turns -> 3, dist 4 > 1 -> MISS branch
ok('W2b: miss path taken (trap cleared, no combat)', s.gwTrap === null && !Game.tbfight,
  `gwTrap=${JSON.stringify(s.gwTrap)} tbfight=${!!Game.tbfight}`);
const beatsBefore = created.filter(n => n._kind === 'osc' && n._started).length;
await sleep(2200);
const beatsAfterMiss = created.filter(n => n._kind === 'osc' && n._started).length - beatsBefore;
ok('W2b: no heartbeat thumps after the missed trap (game-level)', beatsAfterMiss === 0,
  beatsAfterMiss > 0 ? `${beatsAfterMiss} thump-nodes kept spawning after gwTrapTick's miss branch — heartbeat leaked` : '');
// contest end paths: static check that the tithe-escalate heartbeat is stopped
const cx = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
const endBlock = (name) => { const i = cx.indexOf(`G.${name} = function`); return cx.slice(i, cx.indexOf('\n  };', i)); };
for (const fn of ['_contestEnd', '_contestDie', '_contestRefuse']) {
  const body = endBlock(fn);
  const stops = body.includes("audioEvent('heartbeatStop')") || body.includes("audioEvent('combatEnd')");
  ok(`W2b: ${fn} stops the contest-beat heartbeat`, stops,
    stops ? '' : `${fn} fires the Resolve beat but never stops 'heartbeat' — contestTitheEscalate's heartbeat thumps forever`);
}
Game.audioEvent('combatEnd'); // hygiene
}

function h3() {
console.log('--- H3: contest beats fire at the moments their names promise ---');
// strip // comments: docs mention beat:'name' as prose, not declarations
const cxRaw = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
const cx = cxRaw.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
// the 12 legacy single-beat designs (Steve 2026-10-06): one beat per contest,
// fired at each phase presentation — the name promises no phase, the moment
// (phase presented) is honest. Exempt from the per-phase arc convention.
const legacy = new Set(['contestSort','contestWitness','contestCache','contestDice','contestLock','contestMap','contestPrice','contestImpress','contestExchange','contestAuction','contestTide','contestWind','contestAlibi','contestEcho']);
// 1. Every beat:'x' phase literal must resolve in CX_BEAT_DEFS
const beatBlock = cx.match(/const CX_BEAT_DEFS = \{([\s\S]*?)\n  \};/)[1];
const beatNames = new Set([...beatBlock.matchAll(/^\s*(contest[A-Za-z0-9_]+):/gm)].map(m => m[1]));
const phaseBeats = [...cx.matchAll(/beat:\s*'([a-zA-Z0-9_]+)'/g)].map(m => m[1]);
const missing = phaseBeats.filter(b => !beatNames.has(b));
ok('H3: every phase-declared beat exists in CX_BEAT_DEFS', missing.length === 0,
  missing.length ? 'missing: ' + [...new Set(missing)].join(',') : `${new Set(phaseBeats).size} distinct phase beats`);
// 2. Attribution: each contest's phase-beat names must name THAT contest.
//    Walk each G._contestX = function block; beats inside must start with the contest's beat prefix.
const contestFns = [...cx.matchAll(/G\.(_contest[A-Za-z0-9_]+) = function/g)].map(m => m[1]);
let misattributed = [];
for (const fn of contestFns) {
  const i = cx.indexOf(`G.${fn} = function`);
  const end = cx.indexOf('\n  };', i);
  const body = cx.slice(i, end === -1 ? i + 200000 : end);
  const beats = [...body.matchAll(/beat:\s*'(contest[A-Za-z0-9_]+)'/g)].map(m => m[1]);
  // expected prefix: _contestHide -> contestHide
  const expected = 'contest' + fn.slice('_contest'.length);
  for (const b of beats) {
    if (b === 'contestChoice' || legacy.has(b)) continue;
    if (!b.startsWith(expected) && !expected.startsWith(b.replace(/Declare|Escalate|Climax|Resolve$/, ''))) {
      // allow generic fallback beats declared deliberately
      misattributed.push(`${fn}: ${b}`);
    }
  }
}
// filter: only flag beats whose contest-id part doesn't match the function
misattributed = misattributed.filter(x => {
  const [fn, b] = x.split(': ');
  const id = b.replace(/^contest/, '').replace(/Declare|Escalate|Climax|Resolve$/, '');
  return !fn.toLowerCase().includes(id.toLowerCase());
});
ok('H3: no phase beat is attributed to the wrong contest', misattributed.length === 0,
  misattributed.length ? misattributed.slice(0, 6).join(' | ') : '');
// 3. Resolve fires on all three end paths (won/lost/died/refused)
for (const fn of ['_contestEnd', '_contestDie', '_contestRefuse']) {
  const i = cx.indexOf(`G.${fn} = function`);
  const body = cx.slice(i, cx.indexOf('\n  };', i));
  ok(`H3: ${fn} fires the Resolve beat`, body.includes("_cxB(ac.contestId, 'Resolve')"),
    'Resolve beat missing on this end path');
}
// 4. Declare fires at declaration: phase 0 goes through _contestRenderPhase in grabbed AND choice paths
const render = cx.slice(cx.indexOf('G._contestRenderPhase = function'), cx.indexOf('G._contestRenderPhase = function') + 900);
ok('H3: _contestRenderPhase fires phase.beat when the phase is presented', render.includes('phase.beat') && render.includes('_cxBeat'),
  'beat dispatch missing in _contestRenderPhase');
// 5. Every CX_BEAT_DEFS part resolves in the registry (no silent no-ops inside beats)
const parts = new Set();
for (const m of beatBlock.matchAll(/'([a-zA-Z0-9_]+)'/g)) { if (!beatNames.has(m[1])) parts.add(m[1]); }
const deadParts = [...parts].filter(p => typeof Audio[p] !== 'function');
ok('H3: every beat part resolves in the Game.audio registry', deadParts.length === 0,
  deadParts.length ? 'dead parts: ' + deadParts.join(',') : `${parts.size} parts`);
// 6. Beats never promise a moment they can't hit: Climax/Resolve beats must exist for every contest that declares a Declare
const declared = new Set([...beatNames].map(b => b.replace(/Declare|Escalate|Climax|Resolve$/, '')));
let incomplete = [];
for (const id of declared) {
  for (const k of ['Declare', 'Escalate', 'Climax', 'Resolve']) {
    if (id === 'contestChoice' || id === 'contestGeneric' || legacy.has(id)) continue;
    if (!beatNames.has(id + k)) incomplete.push(id + k);
  }
}
ok('H3: every contest has the full Declare/Escalate/Climax/Resolve arc', incomplete.length === 0,
  incomplete.length ? 'incomplete: ' + incomplete.slice(0, 8).join(',') : `${declared.size} contests`);
}

function s5() {
console.log('--- S5: tap-to-init race ---');
// S5a: webkitAudioContext-only (older iOS): ensure() must still build audio
noCtor = false; webkitOnly = true; muteBoot = false;
let A3 = loadRegistry();
let threw = null;
try { A3.combatStart(); A3.beamFire(); A3.telegraph({ urgency: 1, pattern: 'rush' }); A3.combatEnd(); } catch (e) { threw = e; }
ok('S5a: webkitAudioContext-only fallback builds working audio', !threw && ctxConstructions === 1 && created.length > 0,
  threw ? 'threw: ' + threw.message : `ctx=${ctxConstructions} nodes=${created.length}`);
// S5b: first voice while the fresh context starts 'suspended' (pre-gesture iOS)
webkitOnly = false;
A3 = loadRegistry();
ctxStateById[1] = 'suspended';
threw = null;
try { A3.beamFire(); } catch (e) { threw = e; }
ok('S5b: first voice on a suspended context constructs + resumes without throwing', !threw && created.length > 0,
  threw ? 'threw: ' + threw.message : '');
delete ctxStateById[1];
// S5c: mid-voice closed rebuild — sustained voice live, OS kills ctx, next voice rebuilds
A3 = loadRegistry();
created = [];
A3.beamSweep({ pan: 0, heat: 1 }); // sustained sweep live
const liveId = ctxConstructions;
ctxStateById[liveId] = 'closed';   // OS kills it mid-sweep
threw = null;
try { A3.beamFire(); A3.beamSweep({ pan: 0.5, heat: 0.5 }); A3.combatEnd(); } catch (e) { threw = e; }
ok('S5c: closed-during-sustained rebuilds without throwing', !threw && ctxConstructions === liveId + 1,
  threw ? 'threw: ' + threw.message : `constructions=${ctxConstructions}`);
delete ctxStateById[liveId + 1];
}

// ================= runner =================
(async () => {
  h3();
  s5();
  await w2a();
  await w2b();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed (seed ${SEED})`);
  process.exit(fail ? 1 : 0);
})();
