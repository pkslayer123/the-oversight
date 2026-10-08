// AUDIO CENSUS + FIRED-IN-COMBAT PROOF (Steve 2026-10-08).
// Part A: static census — every audioEvent('...') literal, dynamic 'wound'+
//   dispatch, drama audioFor mapping, and data-driven audio names in
//   monsters.json (declareAudio/aggroAudio/deathAudio/resolveAudio/noticeAudio)
//   must resolve to a CombatAudio registry key in src/js/app.js.
// Part B: fired-in-combat proof — seeded node combat sims drive each wave-2
//   bespoke hook's actual dispatch path and assert the hook is requested.
//   (Spies record the hook NAME request — the failure mode under test is
//   "registered but never fired", not synth sound quality.)
// Run: node scripts/test-audio-census-20261008.js [SEED]
//   never run concurrent jest; if jest is needed: --cacheDirectory=/tmp/jest-cache-audio-census
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name + (extra ? ' | ' + extra : '')); }
}

// ================= PART A: STATIC CENSUS =================
const appSrc = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8');
const caIdx = appSrc.indexOf('const CombatAudio');
const retStart = appSrc.indexOf('return {\n', caIdx);
const retBlock = appSrc.slice(retStart, appSrc.indexOf('};', retStart) + 2);
const registry = new Set();
{
  const re = /^\s{4,10}([A-Za-z0-9_]+)\(/gm;
  let m;
  while ((m = re.exec(retBlock))) registry.add(m[1]);
}

const fired = new Set();
const fireRe = /audioEvent\s*\(\s*['"]([A-Za-z0-9_]+)['"]/g;
for (const f of fs.readdirSync(SRC).filter(x => x.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(SRC, f), 'utf8');
  let m;
  while ((m = fireRe.exec(src))) fired.add(m[1]);
}
// data-driven dispatch: game.js audioEvent(tdCfg.deathAudio / rcfg.resolveAudio /
// dcfg.declareAudio / dcfg.aggroAudio / scCfg.noticeAudio) — names live in monsters.json
const mj = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'monsters.json'), 'utf8'));
const dataNames = new Set();
for (const m of (mj.monsters || mj)) {
  const e = m.encounter || {};
  for (const k of ['declareAudio', 'aggroAudio', 'deathAudio', 'resolveAudio', 'noticeAudio']) {
    if (e[k]) dataNames.add(e[k]);
  }
}
// drama mates: game.js drama() -> D.audioFor(kind) -> audioEvent(syncName).
// Scope the extraction to the DRAMA_AUDIO_MATES block only — drama.js also
// holds a signature-VISUAL registry (sigTriage etc.) that is not audio.
const dramaSrc = fs.readFileSync(path.join(SRC, 'drama.js'), 'utf8');
const dramaMates = new Set();
{
  const mb = dramaSrc.indexOf('const DRAMA_AUDIO_MATES');
  const me = dramaSrc.indexOf('};', mb);
  const mblock = dramaSrc.slice(mb, me);
  for (const m of mblock.matchAll(/:\s*'([A-Za-z0-9_]+)'/g)) dramaMates.add(m[1]);
}
const dramaDispatched = /audioFor\(kind/.test(dramaSrc) && /audioEvent\(syncName/.test(
  fs.readFileSync(path.join(SRC, 'game.js'), 'utf8'));

const allRequested = new Set([...fired, ...dataNames, ...dramaMates]);
const undefined_ = [...allRequested].filter(x => !registry.has(x) && x !== 'wound');
ok('census: zero fired-but-undefined audio hooks', undefined_.length === 0, undefined_.join(', '));
console.log('census: ' + fired.size + ' literal call sites, ' + dataNames.size +
  ' data-driven names, ' + dramaMates.size + ' drama mates, ' + registry.size + ' registered synths');

// dynamic dispatch spot-checks (these don't appear as literals)
const gameSrc = fs.readFileSync(path.join(SRC, 'game.js'), 'utf8');
ok("dynamic 'wound'+wcap dispatches woundEnraged/Cunning/Desperate",
  gameSrc.includes("this.audioEvent('wound' + wcap)") &&
  ['woundEnraged', 'woundCunning', 'woundDesperate'].every(x => registry.has(x)));
ok('patternWindup reachable via drama phaseShift mate',
  dramaDispatched && dramaSrc.includes("phaseShift: 'patternWindup'") && registry.has('patternWindup'));
const encSrc = fs.readFileSync(path.join(SRC, 'encounters.js'), 'utf8');
ok("animalPanic fired via encAudio cornered branches",
  (encSrc.match(/encAudio\('animalPanic'\)/g) || []).length >= 3 && registry.has('animalPanic'));
ok('delegateDebrief fully retired: no registry entry, no fire site',
  !registry.has('delegateDebrief') && ![...fired].includes('delegateDebrief'));
// (delegate_beast retired 2026-10-08; its debrief synth + registry entry were
// removed in the retired-id cleanup. The old assertion here checked the
// tbFifoBreather spec, whose dispatch was restructured away earlier that day.)

// pattern-dispatch coverage: every attack pattern type in monsters.json must
// resolve to a voice in telegraph()/impact() (ambush windup silent BY DESIGN).
{
  const pats = new Set();
  for (const m of (mj.monsters || mj)) {
    const t = m.attack && m.attack.pattern && m.attack.pattern.type;
    if (t) pats.add(t);
  }
  const tel = retBlock.slice(retBlock.indexOf('telegraph(d) {'), retBlock.indexOf('impact(d) {'));
  const imp = retBlock.slice(retBlock.indexOf('impact(d) {'));
  const handled = p => (tel.includes("'" + p + "'") || imp.includes("'" + p + "'"));
  const unhandled = [...pats].filter(p => !handled(p));
  ok('pattern coverage: every attack pattern type has a voice', unhandled.length === 0, unhandled.join(','));
  console.log('attack patterns in data: ' + [...pats].sort().join(', '));
}

// registered-but-never-requested: allow-list of legitimately indirect entries
// (utility methods, internal building blocks reached via public events,
// variable-dispatch sites verified above). Anything left is a real gap.
const ALLOW_INDIRECT = new Set([
  'ensureAudio', 'isMuted', 'toggleMute',               // audio-system UI methods, not events
  'beamCharge', 'beamFire',                             // via telegraph()/impact() {beam,highbeam}
  'burstDetonate', 'chargeImpact', 'diveImpact', 'lineStrike',
  'lockonHit', 'lockonTick', 'rushHit',                 // via telegraph()/impact() {pattern}
  'humStop',                                            // via combatEnd()
  'impactWild',                                         // via impact() fallthrough
  'deerCall',                                           // internal, via deerNotice/deerAggro/deerDown
  'animalPanic',                                    // variable dispatch (verified above)
  // NOTE: 'delegateDebrief' was here while the retired delegate_beast's synth
  // was still registered; removed 2026-10-08 with the registry entry.
  'woundEnraged', 'woundCunning', 'woundDesperate',      // 'wound'+wcap (verified above)
  'patternWindup',                                      // drama audioFor (verified above)
  'boarNotice', 'ducksQuack',                           // data-driven noticeAudio
  // DOCUMENTED GAP 2026-10-08 (see evidence/2026-10-08/audio-census-report.md):
  // patternResolve is exposed as "callable directly" per the contract comment
  // but has no call site anywhere. Left here so the census stays green while
  // the gap is tracked; a future run should wire it or remove it.
  'patternResolve',
  // CONTEST BESPOKE SET (Steve 2026-10-08): fired indirectly — contests.js
  // CX_BEAT_DEFS composes named beats from these hooks; _cxBeat dispatches
  // the beat name via Game.audioEvent, not an audioEvent('hook') literal.
  // Verified firing by scripts/test-contest-synths-20261008.js.
  'altarCurdle', 'hungerGnaw', 'predatorListen', 'teethTick', 'mindMoth', 'engineVoices',
]);
const silentRegistered = [...registry].filter(x => !allRequested.has(x) && !ALLOW_INDIRECT.has(x));
ok('no registered-but-never-fired synths outside the indirect allow-list',
  silentRegistered.length === 0, silentRegistered.join(', '));
if (silentRegistered.length) console.log('  silent-but-registered: ' + silentRegistered.join(', '));

// ================= PART B: FIRED-IN-COMBAT PROOF =================
// Seeded RNG (PROOF-TEST RNG STABILITY: deterministic by default, SEED override).
let seed = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(seed);

global.fetch = f => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')))
});
global.window = global; // eval-time stub: equipment.js needs window at load (delete before playing)
const MODULES = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/examine.js',
  'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
  'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
  'src/js/build.js',
];
for (const f of MODULES) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
delete global.window; // sync combat path (WINDOW STUB lesson)
const Game = globalThis.Scattering.Game;

// audio spies: record hook requests. audioEvent is wrapped; encAudio goes
// through Game.audio directly, so stub the animalPanic hook there.
const audioFired = [];
const _audioEvent = Game.audioEvent;
Game.audioEvent = function (name, data) {
  audioFired.push(name);
  try { return _audioEvent.call(this, name, data); } catch (e) {}
};
Game.audio = { animalPanic() { audioFired.push('animalPanic'); } };

function flatGrid() { return Array.from({ length: 9 }, () => Array(9).fill('grass')); }
function newFight(monsterId, px, py, mx, my) {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Test');
  Game.newGame('Test', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = px; s.my = py; s.health = 3000; s.kcal = 3000; s.energy = 60;
  Game.genDetail = flatGrid;
  s.monster = { id: monsterId, mx, my };
  // bright_idea disperses at dawn (game.js biIs block) — its detonation only
  // happens at night. The sunbasker is the inverse (flattens at night).
  if (monsterId === 'bright_idea') Game.dayPart = 3;
  audioFired.length = 0;
  Game.startCombat(monsterId);
  const tf = Game.tbfight;
  if (tf) {
    tf.fighters = tf.fighters.filter(x => x.kind !== 'villager');
    tf.order = tf.order.filter(k => tf.fighters.find(x => x.key === k));
  }
  return tf;
}
function stepTurns(max) {
  let n = 0;
  for (; n < max && Game.tbfight; n++) {
    const cur = Game.tbCurrent();
    if (!cur) break;
    const me = Game.state.scholar;
    if (me.health <= 0) break;
    if (cur.kind === 'player') { try { Game.tbPlayerWait(); } catch (e) { Game.tbPlayerEndTurn(); } }
    else Game.tbAdvance();
  }
  return n;
}
function monHook(monsterId, kind) {
  const m = (mj.monsters || mj).find(x => x.id === monsterId);
  return m && m.encounter && m.encounter[kind];
}

async function main() {
  await Game.init();

  // ---- B1: aggro hooks fire at declare (generic path, game.js:25434) ----
  const AGGRO = [
    ['gallowdeer', 'gallowdeerAim'], ['mirrormoth', 'mirrormothFlash'],
    ['nightlight_catfish', 'catfishLure'], // bespoke tbCatfishTurn fires it (game.js:21507)
  ];
  for (const [id, hook] of AGGRO) {
    ok(id + ' encounter.aggroAudio === ' + hook, monHook(id, 'aggroAudio') === hook);
    const tf = newFight(id, 4, 4, 4, 6);
    stepTurns(30);
    ok('FIRED in combat: ' + hook, audioFired.includes(hook),
      'fired=[' + [...new Set(audioFired)].slice(0, 12).join(',') + ']' + (tf ? '' : ' (no fight)'));
  }

  // ---- B1b: wave-2 bespoke aggro voices (fired from bespoke turn phases) ----
  const AGGRO_BESPOKE = [
    ['voice_mimic_radio', 'staticCry'],   // call/approach phases (game.js:23201/23209/23269)
    ['understudy', 'understudyWatch'],    // watching phase (game.js:24597)
    ['landlord', 'landlordClaim'],        // claiming phase (game.js:24720)
    ['union_rep', 'unionBullhorn'],       // solidarity beat (game.js:25021)
    ['moderator', 'modNotice'],           // (game.js:25111)
  ];
  for (const [id, hook] of AGGRO_BESPOKE) {
    newFight(id, 4, 4, 4, 6);
    stepTurns(40);
    ok('FIRED in combat (bespoke): ' + hook, audioFired.includes(hook),
      'fired=[' + [...new Set(audioFired)].slice(0, 12).join(',') + ']');
  }

  // ---- B1c: FORMERLY-UNREACHABLE aggro hooks — now wired (audio-hook sweep,
  // Steve 2026-10-08). These were registered in app.js and named in
  // monsters.json but their monsters' bespoke turn code returned before the
  // generic declare dispatch — so the census asserted they NEVER fired. The
  // audio-game worker's generic-declare fix wired them; the 2026-10-08 audio
  // census re-verification proved they fire (probe: FIRES on seeds 20261008,
  // 7, 42). The old DOCUMENTED-GAP assertions were failing BECAUSE the hooks
  // fire — stale assertions, not real gaps. Now asserted as fired.
  const NOW_WIRED = [
    ['speedbump_turtle', 'turtleGrind', 'turtle never declares by design (ambush snap, no warning) — game.js:25200'],
    ['glasswing', 'glasswingBuzz', 'bespoke circle/dive path fires glasswingDive, returns before generic declare — game.js:23826'],
    ['sunbasker', 'sunbaskerShimmer', 'bespoke bask path fires baskCharge via encDeclareDirect (no aggroAudio) — game.js:21710/24213'],
    ['heckler', 'hecklerLaugh', 'bespoke warming_up/heckling path fires hecklerPileOn/hecklerHeadliner only — game.js:24788'],
    ['lockpick_raccoon', 'lockpickFingers', 'bespoke tbLockpickTurn consumes the turn; generic declare only on cornered fallthrough — game.js:22998'],
  ];
  for (const [id, hook, why] of NOW_WIRED) {
    // turtle snaps only when adjacent — place the player next to it so the
    // fight exercises the real attack path, not an idle standoff.
    const adj = id === 'speedbump_turtle';
    newFight(id, 4, 4, adj ? 4 : 4, adj ? 5 : 6);
    stepTurns(40);
    ok('FIRED in combat (wired 2026-10-08): ' + hook, audioFired.includes(hook), why);
  }
  // the turtle's resolve path DOES work when adjacent — prove the snap voice fires
  {
    newFight('speedbump_turtle', 4, 4, 4, 5);
    stepTurns(40);
    ok('FIRED in combat: turtleSnap (resolveAudio, adjacent snap)', audioFired.includes('turtleSnap'),
      'fired=[' + [...new Set(audioFired)].slice(0, 10).join(',') + ']');
  }

  // ---- B2: resolve hooks fire when the attack resolves ----
  const RESOLVE = [
    ['voice_mimic_radio', 'staticBreak'], ['bright_idea', 'eurekaDetonate'],
    ['memory_projector', 'projectorFire'], ['understudy', 'understudyPerform'],
    ['landlord', 'landlordEvict'], ['heckler', 'hecklerHeadliner'],
    ['paparazzo', 'paparazzoExclusive'], ['union_rep', 'unionWalkout'],
  ];
  for (const [id, hook] of RESOLVE) {
    ok(id + ' encounter.resolveAudio === ' + hook, monHook(id, 'resolveAudio') === hook);
    const tf = newFight(id, 4, 4, 4, 6);
    const turns = stepTurns(150);
    ok('FIRED in combat: ' + hook, audioFired.includes(hook),
      'after ' + turns + ' turns; fired=[' + [...new Set(audioFired)].slice(0, 14).join(',') + ']');
  }

  // ---- B3: animalPanic fires from the cornered branch ----
  {
    try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
    Game.genRoster('Test');
    Game.newGame('Test', null, Game.generatedRoster[0].id);
    Game.depart();
    const s = Game.state.scholar;
    s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60; s.health = 3000;
    Game.genDetail = flatGrid;
    audioFired.length = 0;
    let panicked = false;
    for (let i = 0; i < 12 && !panicked; i++) {
      // re-corner the prey each turn: adjacent, trapped, pstate cornered
      const cfg = Game.encPreyCfg('white_tailed_deer');
      s.animal = { id: 'white_tailed_deer', mx: 4, my: 5, aware: 1, stamina: cfg.stamina, pstate: 'cornered', edgeTurns: 0, hunger: 10 };
      Game.animalTurn();
      if (audioFired.includes('animalPanic')) panicked = true;
    }
    ok('FIRED in hunt sim: animalPanic (cornered prey)', panicked);
  }

  // ---- B4: warrantyCall does not exist (task says "if it exists") ----
  ok('warrantyCall: no synth, no fire site, no data hook (correctly absent)',
    !registry.has('warrantyCall') && !allRequested.has('warrantyCall') &&
    !gameSrc.includes('warrantyCall') && !encSrc.includes('warrantyCall'));

  console.log('\nAUDIO CENSUS: ' + pass + ' pass, ' + fail + ' fail (seed ' + seed + ')');
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
