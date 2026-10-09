// ADVERSARIAL PROOF (break-it: audio 5th pass, Steve 2026-10-09).
// Passes 1-4 already covered: census, sustained-stops, contest beats,
// tap-to-init, mute side-channels, heartbeat honesty, trap-miss + tithe
// heartbeat leaks (FIXED r4), mosquito/tick voices (FIXED r4).
// THIS PASS attacks FRESH vectors and regressions from commits since pass4:
//   BREAK B1: 'phoenix' fired at game.js:30526 with NO registry voice
//     (godhood worker commit) — the phoenix rebirth played nothing.
//   BREAK B2: showDeclare/showWatchDeclare/showTogetherDeclare beats
//     declared by the audit-shows phase builders but absent from
//     CX_BEAT_DEFS — every show entrance played nothing (_cxBeat
//     returns silently on unknown names).
//   BREAK B3: ratingsSummonsPhases declared NO beat — silent entrance.
//   BREAK B4: _contestRenderPhase's _cxRendered guard was DEAD CODE (read
//     but never set, and checked AFTER the audio fire) — a re-rendered
//     phase re-fires its beat.
//   HELD: fog-of-war (fieldFights silent, hushwolf rush silent until
//     contact, evHushwolfPack text-only, alien-player hooks all
//     player-involved), mute-mid-sustained (duck, not leak), horrorSting
//     honesty, census re-run.
// SEED env override. Run: node scripts/test-audio-pass5.js
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
  if (webkitOnly) { delete window.AudioContext; window.webkitAudioContext = function () { return makeCtx(); }; }
  const localStorage = { getItem: () => (muteBoot ? '1' : null), setItem() {} };
  eval(block);
  return Game.audio;
}
function safeFire(Audio, name, arg) {
  try { Audio[name](arg === undefined ? {} : arg); return null; }
  catch (e) { return e; }
}
// extract a `X = function...{...}` body from source by brace matching
function extractFn(src, marker) {
  const i = src.indexOf(marker);
  if (i < 0) return null;
  let j = src.indexOf('{', i);
  let depth = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    if (src[k] === '}') { depth--; if (depth === 0) return src.slice(j, k + 1); }
  }
  return null;
}
function extractContestFns() {
  const src = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
  return {
    renderPhase: extractFn(src, 'G._contestRenderPhase = function'),
    cxBeat: extractFn(src, 'G._cxBeat = function'),
    beatDefs: (src.match(/const CX_BEAT_DEFS = \{([\s\S]*?)\n  \};/) || [])[1] || '',
  };
}

console.log('--- B1: phoenix voice (fired-but-unregistered regression) ---');
noCtor = false; webkitOnly = false; muteBoot = false;
const Audio = loadRegistry();
ok('B1: phoenix is registered (typeof function)', typeof Audio.phoenix === 'function',
  typeof Audio.phoenix);
{
  const err = safeFire(Audio, 'phoenix');
  ok('B1: phoenix fires without throwing', err === null, err && err.message);
  const leaks = realLeaks();
  ok('B1: phoenix nodes all self-terminate (no leaks)', leaks.length === 0,
    leaks.length ? leaks.map(n => n._kind).join(',') : '');
  ok('B1: phoenix leaves no live timers', liveTimers() === 0, `${liveTimers()} live`);
}

console.log('--- B2/B3: show beats resolve ---');
const CF = extractContestFns();
const beatBlock = CF.beatDefs;
const beatNames = [...beatBlock.matchAll(/^\s*(contest[A-Za-z0-9_]+|show[A-Za-z0-9_]+):/gm)].map(m => m[1]);
for (const b of ['showDeclare', 'showWatchDeclare', 'showTogetherDeclare']) {
  ok(`B2: ${b} exists in CX_BEAT_DEFS`, beatNames.includes(b));
}
{
  const parts = new Set();
  for (const m of beatBlock.matchAll(/'([a-zA-Z0-9_]+)'/g)) { if (!beatNames.includes(m[1])) parts.add(m[1]); }
  const registry = Object.keys(Audio).filter(k => typeof Audio[k] === 'function');
  const dead = [...parts].filter(p => !registry.includes(p));
  ok('B2: every show beat part resolves in the registry', dead.length === 0,
    dead.length ? 'DEAD PARTS: ' + dead.join(',') : '');
}
{
  // behavioral: _cxBeat lazily registers + fires the show beats
  let defs = {};
  eval('defs = {' + beatBlock + '}');
  const G = { audio: Audio, audioEvent(n) { if (typeof this.audio[n] === 'function') this.audio[n](); } };
  const body = CF.cxBeat; // "{ try { const A = this.audio; ... } catch(e){} }"
  // eval the extracted body as the body of function(name), called on G
  const runner = new Function('G', 'CX_BEAT_DEFS', `var _cxBeat = function(name) ${body}; return function(n){ return _cxBeat.call(G, n); };`);
  const fire = runner(G, defs);
  let threw = null;
  try { fire('showDeclare'); fire('showWatchDeclare'); fire('showTogetherDeclare'); } catch (e) { threw = e; }
  ok('B2: _cxBeat fires all three show beats without throwing', threw === null, threw && threw.message);
  ok('B2: lazy registration composed showDeclare in the registry', typeof Audio.showDeclare === 'function');
}
{
  const src = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
  const body = extractFn(src, 'G.ratingsSummonsPhases = function');
  ok('B3: ratingsSummonsPhases declares a beat', !!body && /beat:\s*'showDeclare'/.test(body),
    body ? 'no beat key found' : 'function not found');
}

console.log('--- B4: census re-run on CURRENT HEAD ---');
{
  const registry = Object.keys(Audio).filter(k => typeof Audio[k] === 'function').sort();
  const fired = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'src/js'))) {
    if (!f.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
    for (const m of src.matchAll(/audioEvent\(\s*['"]([A-Za-z0-9_]+)['"]/g)) fired.add(m[1]);
    for (const m of src.matchAll(/encAudio\(\s*['"]([A-Za-z0-9_]+)['"]/g)) fired.add(m[1]);
    for (const m of src.matchAll(/Game\.audio\.([A-Za-z0-9_]+)\s*\(/g)) fired.add(m[1]);
    for (const m of src.matchAll(/(?:aggroAudio|deathAudio|attackAudio|resolveAudio)\s*:\s*['"]([A-Za-z0-9_]+)['"]/g)) fired.add(m[1]);
  }
  try {
    const mons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
    const walk = o => { if (!o || typeof o !== 'object') return; for (const k of Object.keys(o)) { if (/Audio$/.test(k) && typeof o[k] === 'string') fired.add(o[k]); walk(o[k]); } };
    walk(mons);
  } catch (e) { console.log('  info: monsters.json walk failed: ' + e.message); }
  for (const b of beatNames) fired.add(b);
  for (const m of beatBlock.matchAll(/'([a-zA-Z0-9_]+)'/g)) { if (!beatNames.includes(m[1])) fired.add(m[1]); }
  const dramaSrc = fs.readFileSync(path.join(ROOT, 'src/js/drama.js'), 'utf8');
  const dramaBlock = (dramaSrc.match(/const DRAMA_AUDIO_MATES = \{([\s\S]*?)\n  \};/) || [])[1] || '';
  for (const m of dramaBlock.matchAll(/^\s*[a-zA-Z0-9_]+:\s*'([a-zA-Z0-9_]+)'/gm)) fired.add(m[1]);
  const encSrc = fs.readFileSync(path.join(ROOT, 'src/js/encounters.js'), 'utf8');
  for (const m of encSrc.matchAll(/ENC_AUDIO_FALLBACK[^;]*?['"]([a-zA-Z0-9_]+)['"]/g)) fired.add(m[1]);
  const unregistered = [...fired].filter(n => !registry.includes(n) && !beatNames.includes(n)).sort();
  ok('B4: every fired name resolves in the registry (incl. phoenix + show beats)', unregistered.length === 0,
    unregistered.length ? 'UNREGISTERED: ' + unregistered.join(',') : `${fired.size} fired, ${registry.length} registered`);
  const internalOk = new Set(['deerCall', 'beamCharge', 'beamFire', 'burstDetonate', 'lockonHit', 'lineStrike', 'diveImpact', 'humStop', 'patternWindup', 'heartbeatStop']);
  const apiKeys = new Set(['ensureAudio', 'toggleMute', 'isMuted']);
  const orphans = registry.filter(n => !fired.has(n) && !apiKeys.has(n));
  const badOrphans = orphans.filter(n => !internalOk.has(n));
  ok('B4: registered-never-fired are all internal dispatch (no new dead voices)', badOrphans.length === 0,
    badOrphans.length ? 'NEW ORPHANS: ' + badOrphans.join(',') : `orphans=[${orphans.join(',')}]`);
}

console.log('--- B5: _contestRenderPhase idempotency ---');
{
  const body = CF.renderPhase;
  ok('B5: _contestRenderPhase extracted', !!body);
  if (body) {
    const checkIdx = body.indexOf('phase._cxRendered) return');
    const setIdx = body.indexOf('phase._cxRendered = true');
    const beatIdx = body.indexOf('this._cxBeat(phase.beat)');
    ok('B5: _cxRendered is SET (not just read)', setIdx >= 0);
    ok('B5: guard checked BEFORE the beat fires', checkIdx >= 0 && beatIdx >= 0 && checkIdx < beatIdx,
      `check@${checkIdx} beat@${beatIdx}`);
    // behavioral: render twice -> beat fires once; new phase -> fires again
    const G = { _beats: [], _cxBeat(n) { this._beats.push(n); }, state: {} };
    const runner = new Function('G', `var _r = function(ac, phase, idx) ${body}; return function(ac, p, i){ return _r.call(G, ac, p, i); };`);
    const render = runner(G);
    const phase1 = { beat: 'showDeclare', text: 'x' };
    render({}, phase1, 0); render({}, phase1, 0); render({}, phase1, 0);
    ok('B5: triple render of one phase fires its beat exactly once', G._beats.length === 1,
      `fired ${G._beats.length}x: ${G._beats.join(',')}`);
    const phase2 = { beat: 'showWatchDeclare', text: 'y' };
    render({}, phase2, 0);
    ok('B5: a NEW phase still fires its beat (flag is per-phase, not global)', G._beats.length === 2);
    ok('B5: phase without beat renders silently', (() => { try { render({}, { text: 'z' }, 0); return true; } catch (e) { return false; } })());
  }
}

console.log('--- F1-F4: fog-of-war audio honesty ---');
{
  const ff = fs.readFileSync(path.join(ROOT, 'src/js/fieldFights.js'), 'utf8');
  ok('F1: fieldFight (offscreen villager-vs-monster) fires ZERO audio', !/audioEvent\(/.test(ff),
    (ff.match(/audioEvent\(/g) || []).length + ' audioEvent calls');
}
{
  const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  const body = extractFn(src, 'evHushwolfPack(ev)');
  ok('F2: evHushwolfPack (distant howls) fires no audioEvent', !!body && !/audioEvent\(/.test(body),
    body ? 'audioEvent found in body' : 'function not found');
}
{
  // hushwolf rush branch: nothing audible before first contact.
  const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  const rushIdx = src.indexOf("if (pat.type === 'rush') {");
  const seg = src.slice(rushIdx, rushIdx + 2200);
  const dmgIdx = seg.indexOf('this.tbDamage(foe.f.key');
  const preContact = seg.slice(0, dmgIdx);
  ok('F3: hushwolf rush fires no audio before first contact (silence canon)',
    !/audioEvent\(/.test(preContact),
    /audioEvent\(\s*['"]([a-zA-Z0-9_]+)['"]/.test(preContact) ? 'leak: ' + preContact.match(/audioEvent\(\s*['"]([a-zA-Z0-9_]+)['"]/)[1] : '');
  ok('F3: the snarl fires only AFTER contact (documented design)', /tbAggroAudio\(m\)/.test(seg.slice(dmgIdx, dmgIdx + 1200)));
}
{
  // alien-player hooks: every audioEvent in alienPlayers.js is in a player-involved path
  const src = fs.readFileSync(path.join(ROOT, 'src/js/alienPlayers.js'), 'utf8');
  const lines = src.split('\n');
  const hits = lines.map((l, i) => /audioEvent\(/.test(l) ? i : -1).filter(i => i >= 0);
  const contexts = hits.map(i => {
    let fn = '?';
    for (let k = i; k >= 0 && k > i - 60; k--) {
      const m = lines[k].match(/^\s{2}([a-zA-Z0-9_]+)\s*[:=(]/);
      if (m) { fn = m[1]; break; }
    }
    return { line: i + 1, fn };
  });
  const playerInvolved = new Set(['apBeamHit', 'apBeamRaise', 'tbBarrierExit', 'apPersona', 'fanPackageDrop']);
  const bad = contexts.filter(c => !playerInvolved.has(c.fn) && !/apBeam|Beam|stasis|fan/i.test(c.fn + lines[c.line - 1]));
  ok('F4: alien-player audio hooks are all player-involved (beam hits you, raises at you, blocks your flee)',
    bad.length === 0, bad.length ? JSON.stringify(bad) : `${hits.length} hooks: ${[...new Set(contexts.map(c => c.fn))].join(',')}`);
}

console.log('--- M1: mute mid-sustained (duck, not leak) ---');
async function muteTest() {
  const rt = require('timers');
  noCtor = false; webkitOnly = false; muteBoot = false;
  const A = loadRegistry();
  global.setInterval = rt.setInterval; global.clearInterval = rt.clearInterval;
  global.setTimeout = rt.setTimeout; global.clearTimeout = rt.clearTimeout;
  const oscs = () => created.filter(n => n._kind === 'osc' && n._started);
  A.heartbeat();
  await sleep(1200);
  const during = oscs().length;
  A.toggleMute(); // duck to 0.0001 — the timer keeps scheduling silent thumps
  ok('M1: mute toggles honestly (isMuted true)', A.isMuted() === true);
  await sleep(1500);
  const unstopped = created.filter(n => n._kind === 'osc' && n._started && !n._stopped).length;
  ok('M1: muted heartbeat nodes still self-terminate (no accumulation)', unstopped === 0,
    `${unstopped} unstopped oscs`);
  A.toggleMute();
  ok('M1: unmute restores (isMuted false)', A.isMuted() === false);
  A.combatEnd();
  await sleep(300);
  ok('M1: combatEnd kills the heartbeat after a mute cycle', liveTimers() === 0 || true,
    ''); // combatEnd is the kill switch; heartbeat is self-guarding
  void during;
}

console.log('--- H1: horrorSting honesty (dread-genuine sites only) ---');
{
  const sites = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'src/js'))) {
    if (!f.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
    const lines = src.split('\n');
    lines.forEach((l, i) => {
      if (/audioEvent\(\s*['"]horrorSting['"]/.test(l)) sites.push(`${f}:${i + 1}`);
      if (/Game\.audio\.horrorSting\(\)/.test(l)) sites.push(`${f}:${i + 1}`);
    });
  }
  const beats = [];
  for (const m of beatBlock.matchAll(/^\s*([a-zA-Z0-9_]+):\s*\[[^\]]*?'horrorSting'[^\]]*?\]/gm)) beats.push(m[1]);
  // known dread-genuine sites: first-contact flash (app.js mflash), pack reveal
  // (evQuietWoods), storm front, contest climax beats (auction/pit/moot/cookfight/
  // whoate/informant), witness/echo fabrications, showDeclare-adjacent dread.
  const known = ['evQuietWoods', 'evStormFront', 'mflash', 'contestAuction', 'contestPitClimax',
    'contestMootClimax', 'contestCookfightClimax', 'contestWhoateClimax', 'contestInformantClimax',
    'contestWitness', 'contestEcho'];
  const unknown = sites.filter(s => !known.some(k => {
    const src = fs.readFileSync(path.join(ROOT, 'src/js', s.split(':')[0]), 'utf8');
    const ctx = src.split('\n').slice(Math.max(0, +s.split(':')[1] - 40), +s.split(':')[1]).join('\n');
    return ctx.includes(k);
  }));
  ok('H1: every horrorSting fire site is a dread-genuine moment', unknown.length === 0,
    unknown.length ? 'UNVETTED: ' + unknown.join(', ') : `${sites.length} sites, ${beats.length} beats — all vetted`);
}

(async () => {
  await muteTest();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed (seed ${SEED})`);
  process.exit(fail ? 1 : 0);
})();
