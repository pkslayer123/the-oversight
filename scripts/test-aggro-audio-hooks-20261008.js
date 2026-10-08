#!/usr/bin/env node
// PROOF TEST (Steve 2026-10-08) — aggro-audio worker verification.
// The 5 registered-but-unreachable aggro hooks from the 2026-10-08 audio
// census (turtleGrind, glasswingBuzz, sunbaskerShimmer, hecklerLaugh,
// lockpickFingers) were wired by sibling commit c316dd4 (tbAggroAudio).
// This test INDEPENDENTLY re-verifies, with a stricter property than the
// sibling's declare-audio test: each hook must fire ON THE DECLARE TURN
// itself (coupled to the bespoke declare beat — snap / dive cue / bite
// telegraph / first jibe / casing), not merely "somewhere in the fight".
// Also: data<->registry wiring integrity, and the census's warrantyCall
// negative (it does not exist; warranty_caller's real voice is lineCut).
// Played AS A PLAYER: full fights, player waits, monster declares.
// RNG seeded (mulberry32, SEED env override). Exit non-zero on any failure.
// Run: node scripts/test-aggro-audio-hooks-20261008.js
//      SEED=99 node scripts/test-aggro-audio-hooks-20261008.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seeded BEFORE eval: modules capture Math.random at load

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js touches window at load (browser-only in prod)
const SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'];
// NOTE: app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js are DOM-only — excluded per convention.
SCRIPTS.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window; // drop the stub: combat takes the SYNC advance path without window
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

const audio = [];
const says = [];
function setupFight(monsterId, px, py, mx, my) {
  audio.length = 0; says.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = px; s.my = py; s.health = 200;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear', range: 2 } };
  Game.ensureVillagerPositions();
  Game.state.village.roster = []; // no party in these fights
  const vpos = Game.state.village.positions || {};
  for (const k of Object.keys(vpos)) vpos[k] = { mx: 8, my: 8 };
  s.mx = px; s.my = py;
  s.monster = { id: monsterId, mx, my };
  Game.startCombat(monsterId);
  const mf = Game.tbfight.fighters.find(f => f.kind === 'monster');
  if (mf) { mf.mx = mx; mf.my = my; }
  const pf = Game.tbFighter('p');
  if (pf) { pf.mx = px; pf.my = py; pf.hp = 1000; pf.maxHp = 1000; }
  return mf;
}
const monsterOf = () => Game.tbfight && Game.tbfight.fighters.find(f => f.kind === 'monster');
// Drive the fight, slicing audio+says per LOOP ITERATION (one full round:
// player wait + monster response), plus a SETUP slice capturing anything
// startCombat itself triggers (the lockpick cases on combat start).
// The hook is coupled to its declare beat by co-occurrence in the SAME
// slice — the code fires them adjacently, so same-slice is the right
// granularity and immune to turn-boundary bookkeeping.
function fightTurns(monsterId, px, py, mx, my, maxTurns, stopWhen) {
  setupFight(monsterId, px, py, mx, my);
  const turns = [{ audio: audio.slice(), says: says.slice(), setup: true }];
  let n = 0;
  while (Game.tbfight && !Game.tbfight.over && n++ < maxTurns) {
    const a0 = audio.length, s0 = says.length;
    if (Game.tbIsPlayerTurn()) Game.tbPlayerWait(); // advances the round; no endTurn after
    else Game.tbAdvance();
    const t = { audio: audio.slice(a0), says: says.slice(s0) };
    turns.push(t);
    if (stopWhen && stopWhen(t)) break;
  }
  return turns;
}
const hasHook = (turns, hook) => turns.some(t => t.audio.includes(hook));

(async () => {
  await Game.init();
  Game.audio = new Proxy({}, { get: (t, n) => (d) => { audio.push(String(n)); } });
  const osay = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return osay(t); };
  console.log(`seed=${SEED}`);

  // ---------- PART A: data <-> registry wiring integrity ----------
  console.log('\n-- wiring: monsters.json aggroAudio -> app.js CombatAudio registry --');
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
  const PAIRS = [
    ['speedbump_turtle', 'turtleGrind'],
    ['glasswing', 'glasswingBuzz'],
    ['sunbasker', 'sunbaskerShimmer'],
    ['heckler', 'hecklerLaugh'],
    ['lockpick_raccoon', 'lockpickFingers'],
  ];
  for (const [mid, hook] of PAIRS) {
    const mdef = monsters.find(m => m.id === mid);
    const dataHook = mdef && mdef.encounter && mdef.encounter.aggroAudio;
    ok(`${mid} data aggroAudio is ${hook}`, dataHook === hook, `data=${dataHook}`);
    ok(`${hook} registered in CombatAudio`, new RegExp('^\\s*' + hook + '\\(', 'm').test(appSrc), 'registry key missing');
  }
  // census negative: warrantyCall does not exist anywhere; the real voice is lineCut.
  const wc = monsters.find(m => m.id === 'warranty_caller');
  ok('warranty_caller aggroAudio is lineCut (not warrantyCall)',
    wc && wc.encounter && wc.encounter.aggroAudio === 'lineCut',
    `data=${wc && wc.encounter && wc.encounter.aggroAudio}`);
  const jsData = ['src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/app.js', 'src/data/monsters.json']
    .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  ok('warrantyCall appears nowhere in src/data', !/warrantyCall/.test(jsData), 'phantom hook found');

  // ---------- PART B: declare-turn coupling, full fights ----------
  console.log('\n-- declare-turn coupling: hook fires ON the declare beat --');

  // 1. TURTLE: the snap IS the declaration (never telegraphs, by design).
  let turns = fightTurns('speedbump_turtle', 4, 4, 4, 5, 8,
    t => t.says.some(s => /SNAPS/.test(s)));
  let snapTurn = turns.find(t => t.says.some(s => /SNAPS/.test(s)));
  ok('turtle snaps within 8 turns', !!snapTurn, `slices=${turns.length}`);
  ok('turtleGrind fires ON the snap beat', !!(snapTurn && snapTurn.audio.includes('turtleGrind')),
    snapTurn ? `slice-audio=${snapTurn.audio.join(',')}` : 'no snap slice');
  ok('no telegraph audio on the snap (ambush declare, by design)',
    !!(snapTurn && !snapTurn.audio.includes('telegraph')),
    snapTurn ? `slice-audio=${snapTurn.audio.join(',')}` : 'no snap slice');

  // 2. GLASSWING: the dive cue is the declaration — buzz first, then the dive voice.
  turns = fightTurns('glasswing', 4, 4, 4, 6, 10, t => t.audio.includes('glasswingDive'));
  const diveTurn = turns.find(t => t.audio.includes('glasswingDive'));
  ok('glasswing dive declares within 10 turns', !!diveTurn, `slices=${turns.length}`);
  ok('glasswingBuzz fires ON the dive-declare beat', !!(diveTurn && diveTurn.audio.includes('glasswingBuzz')),
    diveTurn ? `slice-audio=${diveTurn.audio.join(',')}` : 'no dive slice');
  ok('buzz precedes the dive voice (the air screams first)',
    !!(diveTurn && diveTurn.audio.indexOf('glasswingBuzz') < diveTurn.audio.indexOf('glasswingDive')),
    diveTurn ? `order=${diveTurn.audio.join(',')}` : 'no dive slice');

  // 3. SUNBASKER: bask x2 -> bite declare via encDeclareDirect; the bite cue is spoken.
  turns = fightTurns('sunbasker', 4, 4, 4, 5, 12, t => t.audio.includes('sunbaskerShimmer'));
  const biteTurn = turns.find(t => t.audio.includes('sunbaskerShimmer'));
  ok('sunbaskerShimmer fires within 12 turns', !!biteTurn, `slices=${turns.length}`);
  ok('shimmer shares the beat with the spoken bite cue (molten gold)',
    !!(biteTurn && biteTurn.says.some(s => /molten gold|Fully gold|Sun-Charged/.test(s))),
    biteTurn ? `slice-says=${biteTurn.says.join(' | ').slice(0, 160)}` : 'no shimmer slice');
  ok('shimmer shares the beat with the telegraph voice',
    !!(biteTurn && biteTurn.audio.includes('telegraph')),
    biteTurn ? `slice-audio=${biteTurn.audio.join(',')}` : 'no shimmer slice');

  // 4. HECKLER: the first jibe is the declaration — the laugh, with notes,
  // before the words start cutting. (Jibe lines carry "(SHAME n)" only once
  // the codex knows the pattern; fresh fights get the unknown variants.
  // Compulsion can move hkShame without a jibe, so the laugh slice itself —
  // not the shame counter — is the ground truth. Per tbAggroAudio's design
  // (once per telegraph; once per combat for telegraph-less declares), a
  // later telegraph declare legitimately re-fires the laugh — so the
  // assertion is per-beat coupling, not per-fight count.)
  turns = fightTurns('heckler', 4, 4, 4, 6, 16, t => t.audio.includes('hecklerLaugh'));
  const laughSlices = turns.filter(t => t.audio.includes('hecklerLaugh'));
  ok('hecklerLaugh fires within 16 turns', laughSlices.length >= 1, `slices=${turns.length}`);
  const firstLaugh = laughSlices[0];
  ok('the first laugh shares the beat with the first-jibe words',
    !!(firstLaugh && firstLaugh.says.some(s => /laugh has notes|Do it again/.test(s))),
    firstLaugh ? `slice-says=${firstLaugh.says.join(' | ').slice(0, 160)}` : 'no laugh slice');
  ok('every laugh is coupled to a declare beat (jibe words or telegraph declare)',
    laughSlices.every(t => t.says.some(s => /laugh has notes|Do it again/.test(s)) || t.audio.includes('telegraph')),
    laughSlices.map(t => t.audio.join('+')).join(' / '));
  ok('no single beat double-fires the laugh',
    laughSlices.every(t => t.audio.filter(a => a === 'hecklerLaugh').length === 1),
    laughSlices.map(t => t.audio.filter(a => a === 'hecklerLaugh').length).join(','));

  // 5. LOCKPICK: the casing is the declaration — it happens in startCombat,
  // captured by the setup slice. The hands ARE the sound (too many fingers).
  turns = fightTurns('lockpick_raccoon', 4, 4, 4, 6, 8, t => t.audio.includes('lockpickFingers'));
  const caseTurn = turns.find(t => t.audio.includes('lockpickFingers'));
  ok('lockpickFingers fires', !!caseTurn, `slices=${turns.length}`);
  ok('the fingers share the beat with the casing line (circles once)',
    !!(caseTurn && caseTurn.says.some(s => /circles once/.test(s))),
    caseTurn ? `slice-says=${caseTurn.says.join(' | ').slice(0, 160)}` : 'no fingers slice');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
