#!/usr/bin/env node
// PROOF TEST (Steve 2026-10-08) — aggro-audio worker verification of the
// animals-hunt JS gaps (game.js-side concerns; the fixes themselves landed
// in encounters.js via sibling commit cae8cb7 — this test independently
// re-verifies the behavior):
//   1. fleeDifficulty was dead data -> now drives encPreyCfg (chase tuning:
//      notice range, awareness gain per exposed step, bolt turns before
//      winded). This test proves it BEHAVIORALLY (seeded A/B), not just at
//      the config level: same behavior ('skittish'), same exposure, the
//      hard-fleeing roadrunner gains awareness faster and runs longer than
//      the medium snowshoe hare.
//   2. Slow fiction mismatch: striking a gila monster and missing must not
//      print "bolts" — the exact repro from the animals-hunt report.
//   3. encAnimalCue 12-behavior gap: documents that encAnimalCue lives in
//      encounters.js (sibling scope) — SKIPPED here, asserted as such.
// Played AS A PLAYER: approach, chase, strike-and-miss.
// RNG seeded (mulberry32, SEED env override). Exit non-zero on any failure.
// Run: node scripts/test-animal-gaps-20261008.js
//      SEED=99 node scripts/test-animal-gaps-20261008.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const seededRandom = mulberry32(SEED);
Math.random = seededRandom; // seeded BEFORE eval: modules capture Math.random at load

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
const say = () => { const l = Game.log || []; const s = l.map(x => x.text || x).join(' '); l.length = 0; return s; };

function freshGame() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100;
  s.mx = 4; s.my = 4;
  s.originTags = ['mars']; // defeat region-overlap knowledge: nothing is "common" here
  Game.state.codex.animalEncounters = {};
  say();
  return s;
}
function spawn(id, mx, my) {
  const s = Game.state.scholar;
  const cfg = Game.encPreyCfg(id);
  // hunger pinned: skips the random init and the starvation boldness bonus.
  s.animal = { id, mx, my, aware: 0, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0, hunger: 30 };
  say();
  return s.animal;
}

(async () => {
  await Game.init();
  console.log(`seed=${SEED}`);

  // ---------- 1. fleeDifficulty moves flee behavior (seeded A/B) ----------
  // Same behavior ('skittish'), neither hand-tuned in ENC_PREY, so the
  // fleeDifficulty map is the ONLY difference: hare=medium [4,0.50,3],
  // roadrunner=hard [4,0.65,4].
  console.log('\n-- fleeDifficulty A/B: snowshoe_hare (medium) vs roadrunner (hard) --');
  const hareCfg = Game.encPreyCfg('snowshoe_hare');
  const roadCfg = Game.encPreyCfg('roadrunner');
  ok('hare cfg = fleeDifficulty medium map', hareCfg.notice === 4 && hareCfg.awareRate === 0.50 && hareCfg.stamina === 3,
    JSON.stringify(hareCfg));
  ok('roadrunner cfg = fleeDifficulty hard map', roadCfg.notice === 4 && roadCfg.awareRate === 0.65 && roadCfg.stamina === 4,
    JSON.stringify(roadCfg));

  // AWARENESS: identical exposure in ONE game (same roster, same player
  // multipliers — tracker level etc. — so the ONLY difference is the
  // fleeDifficulty awareRate). Player walks one tile closer (dist 3), one
  // animalTurn each. First turn: lastPX null -> pSteps=1 -> pNoise=1,
  // approach=1 -> rate = awareRate * K for a common K. The ratio of gains
  // must equal the ratio of the fleeDifficulty awareRates (0.65/0.50).
  freshGame();
  let s = Game.state.scholar; s.mx = 4; s.my = 5;
  const hare = spawn('snowshoe_hare', 4, 8);
  Game.animalTurn();
  const hareAware = hare.aware;
  const road = spawn('roadrunner', 4, 8); // same game, same player
  Game.animalTurn();
  const roadAware = road.aware;
  ok('both animals noticed the approach', hareAware > 0 && roadAware > 0,
    `hare=${hareAware} road=${roadAware}`);
  ok('harder fleeDifficulty => closer to bolting after identical exposure', roadAware > hareAware,
    `hare=${hareAware} road=${roadAware}`);
  ok('awareness-gain ratio matches fleeDifficulty awareRate ratio (0.65/0.50)',
    Math.abs(roadAware / hareAware - 0.65 / 0.50) < 1e-9,
    `ratio=${roadAware / hareAware}`);

  // STAMINA: the chase-length mechanism. Each bolt turn costs exactly 1
  // stamina (skittish stepCost); winded triggers at stamina 0 — so the cfg
  // stamina IS the chase length in turns: 3 for the hare, 4 for the
  // roadrunner. (A full free chase wanders via the seeded zigzag and can
  // clip cornered/edge branches — path-dependent, not a stable assertion.
  // The per-turn decrement + the zero threshold determine the length.)
  const boltOnce = (id, startStamina) => {
    freshGame();
    const sc = Game.state.scholar; sc.mx = 1; sc.my = 4;
    const a = spawn(id, 4, 4);
    a.pstate = 'bolt'; a.aware = 1; a.stamina = startStamina;
    Game.animalTurn();
    const text = say();
    return { after: a.stamina, pstate: a.pstate, text };
  };
  for (const [id, st] of [['snowshoe_hare', 3], ['roadrunner', 4]]) {
    const r = boltOnce(id, st);
    ok(`${id}: one bolt turn costs exactly 1 stamina (${st}->${st - 1})`,
      r.after === st - 1 && r.pstate === 'bolt', `stamina=${r.after} pstate=${r.pstate}`);
    const w = boltOnce(id, 1);
    ok(`${id}: stamina 1 -> winded after one more bolt turn`,
      w.after === 0 && w.pstate === 'winded', `stamina=${w.after} pstate=${w.pstate}`);
    ok(`${id}: the winded beat is narrated (no silent turns)`, /winded/.test(w.text),
      w.text.slice(-120));
  }
  ok('harder fleeDifficulty => longer chase (stamina 4 > 3)', roadCfg.stamina > hareCfg.stamina,
    `hare=${hareCfg.stamina} road=${roadCfg.stamina}`);

  // ---------- 2. slow-miss fiction: the gila repro ----------
  // Strike a gila monster, miss. The old text printed "...bolts." for an
  // animal whose huntText says it doesn't flee. Forced miss: RNG pinned
  // high — preyReaction can't bolt at aware 0, the strike roll can't hit.
  console.log('\n-- slow-miss: strike the gila monster, miss --');
  freshGame();
  s = Game.state.scholar; s.mx = 4; s.my = 4;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear', range: 2 } };
  const gila = spawn('gila_monster', 4, 6); // dist 2: spear range, no bite block
  gila.aware = 0;
  Math.random = () => 0.999999;
  let threw = null;
  try { Game.huntAnimal(); } catch (e) { threw = e; }
  Math.random = seededRandom; // restore the seeded RNG
  ok('strike runs without throwing', !threw, threw && threw.message);
  const log = say();
  ok('a clean miss happened', /Missed!/.test(log), log.slice(0, 200));
  const missText = (log.match(/Missed!.{0,220}/) || [''])[0];
  ok('miss text never says "bolt" for the slow gila', !/bolt/i.test(missText), missText.slice(0, 160));
  ok('miss text routes to the slow reaction (holds its ground)', /holds its ground/.test(missText),
    missText.slice(0, 160));

  // ---------- 3. encAnimalCue: sibling scope, documented skip ----------
  console.log('\n-- encAnimalCue location (skip check) --');
  const gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  const encSrc = fs.readFileSync(path.join(ROOT, 'src/js/encounters.js'), 'utf8');
  ok('encAnimalCue is NOT defined in game.js', !/encAnimalCue\s*=/.test(gameSrc), 'found in game.js');
  ok('encAnimalCue IS defined in encounters.js (sibling scope — skipped)', /G\.encAnimalCue\s*=/.test(encSrc),
    'not found in encounters.js');
  ok('encAnimalCue is callable at runtime', typeof Game.encAnimalCue === 'function');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
