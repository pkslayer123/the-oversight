// ADVERSARIAL PROOF (break-it: audio 2nd pass, Steve 2026-10-09).
// Fresh surface since the 2026-10-08 audio attack: turtleFlip handler added,
// alien-players r4 (pantry raid / fire sabotage / burn scorching / favor tiers /
// honest tech copy + feed-odds rewords), camps r5 (shredded-tent repair loop),
// contest-engine determinism, 6 new synergies (war_chest, iron_gut,
// loud_and_proud, master_of_flame, the_long_con, living_armor), stormcall +
// 8 island abilities + 3 farming synergies deleted, explorer eagle_eye retarget,
// monsters-4 (belltoad SHOUT chorus-break, hushwolf fire-weakness rescope,
// turtle flip + fail-snap turtleSnap), socialite ack-spam fix.
// HOSTILE ANGLES:
//   EXPLOIT: spam new/changed hooks 100-500x (turtleFlip, beamSweep singleton,
//     heartbeat interval restart, humRise 4-voice cap, humNotice) — measure
//     live node growth; node leaks (un-stopped oscs, never-cleared timers);
//     sustained-system kills reachable via combatEnd.
//   SOFTLOCK: no AudioContext at all -> every voice no-ops without throwing;
//     suspended ctx whose resume() never resolves -> hooks return synchronously
//     (no awaited resumes — static grep);
//   HONESTY: failed trials stay silent; hushwolf rush silence (post monsters-4);
//     turtle snap silence (post flip); alien beam audio coverage (the silent
//     apex weapon); specimen_scanner/favor-tier copy honesty; new synergies
//     generic-only cues; nightcourtDive stays deleted.
//   DEAD CODE: full census (registry vs fire sites) — companion run of
//     scripts/test-audio-breakit.js expected green; static index.html load check.
// SEED env override. Run: node scripts/attack-audio-20261009.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261009', 10);
Math.random = mulberry32(SEED); // BEFORE eval: modules capture Math.random at load

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ================= PART 1: stubbed WebAudio (CombatAudio only) =================
let created, resumeCalls, resumeNever, ctxState;
function param() {
  return { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {}, cancelAndHoldAtTime() {} };
}
function makeNode(kind) {
  const n = { _kind: kind, _started: false, _stopped: false, connect() {}, disconnect() {},
    start() { n._started = true; }, stop() { n._stopped = true; },
    gain: param(), frequency: param(), playbackRate: param(), pan: param(), Q: param(),
    threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(),
    detune: param(), delayTime: param(), type: '', buffer: null, loop: false };
  created.push(n); return n;
}
function makeCtx() {
  const c = { get state() { return ctxState; }, sampleRate: 44100, destination: {},
    _t: 1000, get currentTime() { c._t += 0.01; return c._t; },
    createOscillator() { return makeNode('osc'); }, createGain() { return makeNode('gain'); },
    createBiquadFilter() { return makeNode('filter'); }, createDynamicsCompressor() { return makeNode('comp'); },
    createBufferSource() { return makeNode('src'); }, createStereoPanner() { return makeNode('pan'); },
    createDelay() { return makeNode('delay'); }, createWaveShaper() { return makeNode('shaper'); },
    createBuffer(ch, len) { const b = makeNode('buffer'); b.getChannelData = () => new Float32Array(len); return b; },
    resume() { resumeCalls++; return resumeNever ? new Promise(() => {}) : Promise.resolve(); } };
  return c;
}
// REAL leak = osc started without stop, or LOOPING buffer source started without
// stop. Non-looping buffer sources self-terminate (WebAudio spec). noise() sets
// loop=true, so every noise() var must have an explicit .stop() (static check B8).
const realLeaks = () => created.filter(n =>
  (n._kind === 'osc' && n._started && !n._stopped) ||
  (n._kind === 'src' && n._started && !n._stopped && n.loop));
let intervalCalls, clearCalls, timers;
function installTimerStubs() {
  intervalCalls = 0; clearCalls = 0; timers = [];
  global.setInterval = (fn, ms) => { intervalCalls++; timers.push(fn); return timers.length; };
  global.clearInterval = (id) => { clearCalls++; if (timers[id - 1]) timers[id - 1] = null; };
  global.setTimeout = (fn) => { fn(); return 0; };
  global.clearTimeout = () => {};
}
function loadRegistry() {
  created = []; resumeCalls = 0;
  installTimerStubs();
  const lines = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8').split('\n');
  const start = lines.findIndex(l => l.includes('const CombatAudio = (() => {'));
  const end = lines.findIndex(l => l.includes('Game.audio = CombatAudio;'));
  const block = lines.slice(start, end + 1).join('\n');
  const Game = {}; const window = {};
  if (ctxState !== 'none') window.AudioContext = function () { return makeCtx(); };
  const localStorage = { getItem: () => null };
  eval(block);
  return Game.audio;
}

console.log('--- PART 1: stubbed-WebAudio exploit/softlock ---');
ctxState = 'running'; resumeNever = false;
let Audio = loadRegistry();

// A1: EXPLOIT — turtleFlip (new 2026-10-09 handler) spam 500x
created = [];
for (let i = 0; i < 500; i++) Audio.turtleFlip();
ok('EXPLOIT: turtleFlip x500 — zero real node leaks (all oscs stopped)', realLeaks().length === 0, `${realLeaks().length} live`);
ok('EXPLOIT: turtleFlip per-fire node count bounded', created.length / 500 < 30, `${(created.length / 500).toFixed(1)}/fire`);

// A2: EXPLOIT — beamSweep singleton: 100 starts with no stop between must not duplicate
created = [];
for (let i = 0; i < 100; i++) Audio.beamSweep({ pan: 0.5, heat: 1 });
const oscCount = created.filter(n => n._kind === 'osc' && n._started).length;
ok('EXPLOIT: beamSweep x100 no-stop — singleton holds (no node duplication)', oscCount <= 4, `${oscCount} started oscs`);
Audio.beamSweepStop();
ok('EXPLOIT: beamSweepStop kills the singleton', realLeaks().length === 0, `${realLeaks().length} live`);

// A3: EXPLOIT — heartbeat interval restarts (glasswing trap path) never stack
created = [];
for (let i = 0; i < 50; i++) Audio.heartbeat(80);
ok('EXPLOIT: heartbeat x50 — at most one timer ever live (restart clears first)', intervalCalls === 50 && (intervalCalls - clearCalls) === 1, `set=${intervalCalls} clear=${clearCalls}`);
Audio.combatEnd();
ok('EXPLOIT: combatEnd clears heartbeat timer', clearCalls >= 50);

// A4: EXPLOIT — humRise 4-voice cap under absurd stacks
created = [];
for (let i = 0; i < 200; i++) Audio.humRise({ stacks: 999 });
const humOscLive = created.filter(n => n._kind === 'osc' && n._started && !n._stopped).length;
ok('EXPLOIT: humRise x200 stacks=999 — 4-voice cap holds, rebuild kills prior', humOscLive <= 12, `${humOscLive} live oscs`);
Audio.combatEnd();
ok('EXPLOIT: combatEnd kills the hum bed', realLeaks().length === 0, `${realLeaks().length} live`);
created = [];
for (let i = 0; i < 20; i++) Audio.humNotice();
Audio.combatEnd();
ok('EXPLOIT: humNotice x20 + combatEnd — no leaks', realLeaks().length === 0, `${realLeaks().length} live`);

// A5: SOFTLOCK — no AudioContext at all: every voice no-ops without throwing
ctxState = 'none'; Audio = loadRegistry();
const keys = Object.keys(Audio).filter(k => typeof Audio[k] === 'function');
let threw = [];
for (const k of keys) { try { Audio[k]({ pattern: 'beam', beam: true, highbeam: true, urgency: 3, stacks: 5, round: 2, pan: 0.5, heat: 1, quiet: false }); } catch (e) { threw.push(k); } }
ok('SOFTLOCK: no AudioContext — all voices no-op without throwing', threw.length === 0, threw.slice(0, 5).join(','));

// A6: SOFTLOCK — suspended ctx, resume() never resolves: hooks must return synchronously
ctxState = 'suspended'; resumeNever = true; Audio = loadRegistry();
const syncTargets = ['turtleFlip', 'stasisBlock', 'synergyDiscovered', 'knowledgeReveal', 'beamSweep', 'heartbeat', 'victory', 'defeat', 'contestCall', 'contestTaken'];
let hung = [];
for (const k of syncTargets) {
  try { const r = Audio[k]({}); if (r && typeof r.then === 'function') hung.push(k + ':returned-promise'); } catch (e) { hung.push(k + ':' + e.message); }
}
ok('SOFTLOCK: never-resolving resume() — hooks return synchronously, never await', hung.length === 0, hung.join(','));
ok('SOFTLOCK: ensure() called resume() fire-and-forget (no await chain)', resumeCalls >= syncTargets.length, `resumeCalls=${resumeCalls}`);

// A7: SOFTLOCK — static: zero awaited resumes / awaited audioEvents in src
const srcAll = fs.readdirSync(path.join(ROOT, 'src/js')).filter(f => f.endsWith('.js'))
  .map(f => fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8')).join('\n');
const awaitedResume = (srcAll.match(/await[^;]*resume\(\)/g) || []).length;
const awaitedAudio = (srcAll.match(/await[^;]*audioEvent\(/g) || []).length;
ok('SOFTLOCK: zero `await ...resume()` in src/js', awaitedResume === 0, `${awaitedResume} found`);
ok('SOFTLOCK: zero `await ...audioEvent(` in src/js', awaitedAudio === 0, `${awaitedAudio} found`);

// ================= PART 2: full Game harness (honesty, seeded) =================
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/src\/js\/[^\s"']+\.js/g)]
  .map(m => m[0]).filter(s => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

const audio = [];   // fired voice names, in order
const audioData = []; // fired {name, data}
const says = [];
function freshGame() {
  audio.length = 0; audioData.length = 0; says.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.ensureVillagerPositions();
  Game.state.village.roster = [];
  const vpos = Game.state.village.positions || {};
  for (const k of Object.keys(vpos)) vpos[k] = { mx: 8, my: 8 };
}
function setupFight(monsterId, px, py, mx, my) {
  freshGame();
  const s = Game.state.scholar;
  s.mx = px; s.my = py; s.health = 200;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear', range: 2 } };
  s.monster = { id: monsterId, mx, my };
  Game.startCombat(monsterId);
  const mf = Game.tbfight.fighters.find(f => f.kind === 'monster');
  if (mf) { mf.mx = mx; mf.my = my; }
  const pf = Game.tbFighter('p');
  if (pf) { pf.mx = px; pf.my = py; pf.hp = 1000; pf.maxHp = 1000; }
  return mf;
}

(async () => {
  await Game.init();
  Game.audio = new Proxy({}, { get: (t, n) => (d) => { audio.push(String(n)); audioData.push({ name: String(n), data: d }); } });
  Game.say = (t) => says.push(String(t));

  console.log('--- PART 2: Game-harness honesty ---');

  // B1: HONESTY — the alien beam must sound like a beam (CATCH 2026-10-09:
  // apMaybeBeamAttack/apBeamHit fired ZERO audio — the apex weapon was silent).
  freshGame();
  const s1 = Game.state.scholar;
  s1.mx = 4; s1.my = 4; s1.maxHp = 100; s1.health = 100;
  Game.tbfight = { fighters: [], round: 1, _beamCooldown: 0, over: false };
  const per = Game.apPersona('vex_marlowe');
  ok('B1 setup: vex_marlowe is a sadistic beam combat persona', !!per && per.disposition === 'sadistic' && Game.apHasBeam('vex_marlowe'));
  const realRandom = Math.random;
  Math.random = () => 0; // force the beam chance roll to succeed
  audio.length = 0; audioData.length = 0;
  const fired = Game.apMaybeBeamAttack({ kind: 'hostile', alienPid: 'vex_marlowe', alive: true, _enraged: false });
  Math.random = realRandom;
  ok('B1: alien beam attack fires (forced roll)', fired === true);
  ok('HONESTY: alien beam raise plays the machine-beam windup (telegraph{pattern:beam})',
    audioData.some(e => e.name === 'telegraph' && e.data && e.data.pattern === 'beam'), audio.join(',') || '(silent)');
  ok('HONESTY: alien beam hit plays the beam resolve (impact{pattern:beam})',
    audioData.some(e => e.name === 'impact' && e.data && e.data.pattern === 'beam'), audio.join(',') || '(silent)');

  // B2: HONESTY — failed trials stay silent (2026-10-08 fix held?)
  freshGame();
  const s2 = Game.state.scholar;
  const realNearFire = Game.nearFire;
  Game.nearFire = () => false;
  s2.trialOffer = { options: [{ id: 'ember', label: 'Trial of the First Ember' }] };
  audio.length = 0; says.length = 0;
  Game.chooseTrialOption('ember');
  ok('HONESTY: failed trial does NOT play the victory sting', !audio.includes('victory'), audio.join(','));
  Game.nearFire = () => true;
  s2.trialOffer = { options: [{ id: 'ember', label: 'Trial of the First Ember' }] };
  audio.length = 0;
  Game.chooseTrialOption('ember');
  ok('HONESTY: triumphed trial DOES play the victory sting', audio.includes('victory'));
  Game.nearFire = realNearFire;

  // B3: HONESTY — hushwolf rush silence contract (post monsters-4 rescope).
  // Damage-event granularity: no wolfSnarl in the audio log before the first
  // hit's audio position; snarl present after (aftermath, not warning).
  // (A step-granularity check false-fails: the pack's opening rushes resolve
  // inside startCombat, snarl sequenced after each hit in the same beat.)
  // Hook damage BEFORE startCombat: the pack's opening rushes resolve inside
  // startCombat's first turns, and the snarl-after-damage sequencing must be
  // measured against THOSE hits, not just the ones after the drive loop starts.
  freshGame();
  const s3 = Game.state.scholar;
  s3.mx = 4; s3.my = 4; s3.health = 200;
  s3.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear', range: 2 } };
  s3.monster = { id: 'hushwolf', mx: 4, my: 6 };
  const pkey3 = 'p';
  const dmgEv = [];
  const odmg = Game.tbDamage.bind(Game);
  Game.tbDamage = function (key, dmg, by) { dmgEv.push({ key, audioLen: audio.length }); return odmg(key, dmg, by); };
  Game.startCombat('hushwolf');
  const mf3 = Game.tbfight.fighters.find(f => f.kind === 'monster');
  if (mf3) { mf3.mx = 4; mf3.my = 6; }
  const pf3 = Game.tbFighter('p');
  if (pf3) { pf3.mx = 4; pf3.my = 4; pf3.hp = 1000; pf3.maxHp = 1000; }
  let n3 = 0;
  while (Game.tbfight && !Game.tbfight.over && n3++ < 60) {
    if (Game.tbIsPlayerTurn()) Game.tbPlayerWait(); else Game.tbAdvance();
  }
  Game.tbDamage = odmg;
  const firstHit = dmgEv.find(e => e.key === pkey3);
  ok('hushwolf rush lands a hit in the sim', !!firstHit);
  if (firstHit) {
    ok('HONESTY: no wolfSnarl before first rush contact (rush stays silent)',
      !audio.slice(0, firstHit.audioLen).includes('wolfSnarl'),
      audio.slice(0, firstHit.audioLen).filter(a => /wolf|snarl/i.test(a)).join(','));
    ok('HONESTY: wolfSnarl fires after first contact (aftermath, not warning)',
      audio.slice(firstHit.audioLen).includes('wolfSnarl'));
    // Once per wolf per fight — a pack's first contact is three snarls, not thirty.
    ok('HONESTY: pack snarl count bounded (one per wolf, not per hit)',
      audio.filter(a => a === 'wolfSnarl').length <= 3, `${audio.filter(a => a === 'wolfSnarl').length} snarls`);
  }

  // B4: HONESTY — turtle snap silence (post flip mechanic). Step
  // granularity: the snap's audio and its damage land in the same beat —
  // a warning would be a PRIOR turn's audio. (The snap resolve fires
  // resolveAudio+aggro just before the damage loop in the same beat.)
  setupFight('speedbump_turtle', 4, 4, 4, 5);
  const pk2 = Game.tbFighter('p').key;
  let firstTurtleAudioStep = -1, firstSnapDmgStep = -1, step2 = 0;
  const od2 = Game.tbDamage.bind(Game);
  Game.tbDamage = function (key, dmg, by) {
    if (key === pk2 && firstSnapDmgStep < 0) firstSnapDmgStep = step2;
    return od2(key, dmg, by);
  };
  let n2 = 0;
  while (Game.tbfight && !Game.tbfight.over && n2++ < 80) {
    step2 = n2;
    const ab = audio.length;
    if (Game.tbIsPlayerTurn()) Game.tbPlayerWait(); else Game.tbAdvance();
    if (firstTurtleAudioStep < 0 && audio.slice(ab).some(a => /turtle/i.test(a))) firstTurtleAudioStep = step2;
  }
  Game.tbDamage = od2;
  ok('turtle snap lands in the sim', firstSnapDmgStep >= 0);
  ok('HONESTY: turtle sits silent before the snap turn (no warning beats)',
    firstTurtleAudioStep >= 0 && firstSnapDmgStep >= 0 && firstTurtleAudioStep === firstSnapDmgStep,
    `firstTurtleAudio=${firstTurtleAudioStep} firstDmg=${firstSnapDmgStep}`);
  ok('turtleSnap fires at resolve', audio.includes('turtleSnap'));
  ok('turtleGrind fires (the snap IS its declaration)', audio.includes('turtleGrind'));

  // B5: DEAD CODE — nightcourtDive stays deleted; dive declare stays silent
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  ok('DEAD: nightcourtDive synth still deleted (2026-10-08 fix held)', !/function nightcourtDive\(\)/.test(appSrc));
  ok('DEAD: nightcourtDive registry entry still deleted', !/nightcourtDive\(\)\s*\{\s*nightcourtDive\(\)/.test(appSrc));

  // B6: HONESTY (static) — specimen_scanner / favor-tier copy: what does it claim?
  // specimen_scanner lives in persona.alienTech (alienPlayers.json).
  const fenwick = (Game.data.alienPlayers || []).find(p => p.id === 'dr_fenwick') || {};
  const scannerDesc = ((fenwick.alienTech || []).find(g => g && g.id === 'specimen_scanner') || {}).desc || '';
  ok('FACT: specimen_scanner desc mentions humming', /hum/i.test(scannerDesc), scannerDesc.slice(0, 80));
  // No alien persona has ANY ambient audio — the whole alien event layer is
  // text-only (beamHorror drama + stasisBlock are the only hooks). Verdict in
  // evidence: flavor-consistent, no dispatched-audio claim, held.
  ok('FACT: zero ambient/persona audio hooks exist in alienPlayers.js',
    !/(apPersonaAmbience|personaHum|apAmbient)/.test(fs.readFileSync(path.join(ROOT, 'src/js/alienPlayers.js'), 'utf8')));

  // B7: HONESTY (static) — the 6 new synergies use generic unlock cues only
  const synJson = fs.readFileSync(path.join(ROOT, 'src/data/synergies.json'), 'utf8');
  const bespoke = ['loud_and_proud', 'war_chest', 'iron_gut', 'master_of_flame', 'the_long_con', 'living_armor']
    .filter(id => new RegExp(id + '[\\s\\S]{0,2000}(audio|drama\\()').test(synJson));
  ok('HONESTY: new synergies carry no bespoke audio claims (generic unlock cue)', bespoke.length === 0, bespoke.join(','));

  // B8: DEAD CODE (static) — every noise() (looping) var gets .stop()
  const appLines = appSrc.split('\n');
  const bad = [];
  for (let i = 0; i < appLines.length; i++) {
    const m = appLines[i].match(/const (\w+) = noise\(/);
    if (!m) continue;
    const v = m[1];
    let fs2 = i; while (fs2 > 0 && !/^\s{4}function /.test(appLines[fs2])) fs2--;
    let depth = 0, end = i;
    for (let j = fs2; j < appLines.length; j++) {
      depth += (appLines[j].match(/\{/g) || []).length - (appLines[j].match(/\}/g) || []).length;
      if (j > i && depth <= 4) { end = j; break; }
    }
    const block = appLines.slice(i, end + 1).join('\n');
    const started = new RegExp('\\b' + v + '\\.start\\(').test(block);
    const stopped = new RegExp('\\b' + v + '\\.stop\\(').test(block);
    if (started && !stopped) bad.push((i + 1) + ':' + v);
  }
  ok('DEAD/EXPLOIT: every noise() looping source has an explicit .stop()', bad.length === 0, bad.join(','));

  // B9: DEAD CODE (static) — index.html loads every audio-dispatching module
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dispatchers = ['alienPlayers.js', 'contests.js', 'contestEngine.js', 'monsterBehaviors.js', 'game.js'];
  const missing = dispatchers.filter(f => !html.includes('src/js/' + f));
  ok('DEAD: every audio-dispatching module is loaded in index.html', missing.length === 0, missing.join(','));

  console.log(`\n${pass} pass, ${fail} fail (seed ${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
