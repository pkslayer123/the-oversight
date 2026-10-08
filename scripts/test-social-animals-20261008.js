#!/usr/bin/env node
// PROOF TEST (Steve 2026-10-07) — social-animals worker fixes (encounters.js).
// Fixes under test:
//   3. 12 behaviors lacked encAnimalCue coaching — now all 38 have distinct cues.
//   4. Winded turns were silent — animalTurn now narrates the spent animal.
//   5. Slow-behavior strike-miss said "bolts" — now per-animal truth, no bolt.
//   6. fleeDifficulty was dead data — now wires into encPreyCfg (table wins).
// Played AS A PLAYER: deer chased to winded, turtle struck-and-missed, panther
// met after learning. RNG seeded (mulberry32, SEED env override).
// Turn hygiene: each player move/stalk followed by exactly one animalTurn().
// Interior tiles 1..7 for the player. Exit non-zero on any failure.
// Run: node scripts/test-social-animals-20261008.js
//      SEED=99 node scripts/test-social-animals-20261008.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);

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
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};
const say = () => { const l = Game.log || []; const s = l.map(x => x.text || x).join(' '); l.length = 0; return s; };
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const clamp17 = v => Math.min(7, Math.max(1, v));

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
  s.animal = { id, mx, my, aware: 0, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0 };
  say();
  return s.animal;
}
function know(id) { Game.encIdentifyAnimal(id); }
function unknowAll() { Game.state.codex.animalEncounters = {}; }

(async () => {
  await Game.init();
  console.log('== SEED ' + SEED + ' ==');
  const animals = Game.data.animals;
  const behaviors = [...new Set(animals.map(a => a.behavior || 'skittish'))].sort();
  console.log('   behaviors in data: ' + behaviors.length);

  // ---------- FIX 3: knownCue coaching for all behaviors ----------
  console.log('\n-- FIX 3: encAnimalCue coverage --');
  freshGame();
  unknowAll();
  // unknown animal: no cue (knowledge-gated)
  const unkId = 'florida_panther';
  ok('cue null when unknown', Game.encAnimalCue(unkId) === null, String(Game.encAnimalCue(unkId)));
  // known: every behavior has a cue
  const seen = new Map();
  let missing = [];
  for (const b of behaviors) {
    const id = animals.find(a => (a.behavior || 'skittish') === b).id;
    unknowAll(); know(id);
    const cue = Game.encAnimalCue(id);
    if (!cue) { missing.push(b); continue; }
    if (seen.has(cue)) seen.get(cue).push(b); else seen.set(cue, [b]);
  }
  ok('all ' + behaviors.length + ' behaviors have a cue', missing.length === 0, missing.join(','));
  const dupes = [...seen.entries()].filter(([, bs]) => bs.length > 1);
  ok('all cues distinct', dupes.length === 0, JSON.stringify(dupes));
  const NEW12 = ['aerial', 'ambush', 'burrowing', 'cautious', 'pack', 'patient', 'semiaquatic', 'social', 'stealthy', 'still', 'unpredictable', 'wading'];
  const newCues = NEW12.map(b => { const id = animals.find(a => (a.behavior || 'skittish') === b).id; unknowAll(); know(id); return Game.encAnimalCue(id); });
  ok('the 12 new cues are all present', newCues.every(c => typeof c === 'string' && c.length > 20), newCues.map(String).join(' | ').slice(0, 200));
  ok('new cues are not generic "bolt" text', !newCues.some(c => /it bolts/i.test(c || '')), newCues.filter(c => /it bolts/i.test(c || '')).join(' | '));
  // spot-check the twelve new ones read distinct and on-fiction
  unknowAll(); know('big_brown_bat');
  ok('aerial cue mentions the air', /air/i.test(Game.encAnimalCue('big_brown_bat') || ''));
  unknowAll(); know('florida_panther');
  ok('stealthy cue mentions the silence', /silent/i.test(Game.encAnimalCue('florida_panther') || ''));

  // ---------- FIX 6: fleeDifficulty wired into encPreyCfg ----------
  console.log('\n-- FIX 6: fleeDifficulty wiring --');
  const DIFFS = ['trivial', 'easy', 'medium', 'hard', 'very_hard', 'dangerous'];
  const dataDiffs = [...new Set(animals.map(a => a.fleeDifficulty).filter(Boolean))];
  ok('all data fleeDifficulty values in enum', dataDiffs.every(d => DIFFS.includes(d)), dataDiffs.join(','));
  // non-table animal: florida_panther (hard) -> notice 4, awareRate 0.65, stamina 4
  const pcfg = Game.encPreyCfg('florida_panther');
  ok('panther cfg from fleeDifficulty', pcfg.notice === 4 && pcfg.awareRate === 0.65 && pcfg.stamina === 4, JSON.stringify(pcfg));
  // table animal: deer keeps hand-tuned values (table wins over hard mapping)
  const dcfg = Game.encPreyCfg('white_tailed_deer');
  ok('deer keeps hand-tuned table (wins over fleeDifficulty)', dcfg.notice === 4 && dcfg.awareRate === 0.50 && dcfg.stamina === 3, JSON.stringify(dcfg));
  // every non-table animal with fleeDifficulty gets a non-default cfg
  const EXPECT = { trivial: [2, 0.25, 1], easy: [3, 0.35, 2], medium: [4, 0.50, 3], hard: [4, 0.65, 4], very_hard: [5, 0.80, 5], dangerous: [5, 0.85, 4] };
  let mism = [];
  for (const a of animals) {
    if (Game.ENC_PREY && Game.ENC_PREY[a.id]) continue; // hand-tuned: exempt
    if (!a.fleeDifficulty) { mism.push(a.id + ':no-diff'); continue; }
    const e = EXPECT[a.fleeDifficulty], c = Game.encPreyCfg(a.id);
    if (!e || c.notice !== e[0] || c.awareRate !== e[1] || c.stamina !== e[2]) mism.push(a.id + ':' + JSON.stringify(c));
  }
  ok('all non-table animals tuned by fleeDifficulty', mism.length === 0, mism.slice(0, 5).join(' | '));

  // ---------- FIX 4: winded turns narrate ----------
  console.log('\n-- FIX 4: winded-turn cue --');
  freshGame();
  const s = Game.state.scholar;
  const a = spawn('white_tailed_deer', 5, 5);
  a.pstate = 'winded';
  Game.log.length = 0;
  Game.animalTurn();
  const wtxt = say();
  ok('winded turn is not silent', wtxt.trim().length > 0, JSON.stringify(wtxt.slice(0, 80)));
  ok('winded cue says spent/winded', /spent|winded|sides heaving/i.test(wtxt), JSON.stringify(wtxt.slice(0, 120)));
  ok('winded animal stays (encounter continues)', !!Game.state.scholar.animal);
  // second winded turn also narrates
  Game.log.length = 0;
  Game.animalTurn();
  ok('second winded turn also narrates', say().trim().length > 0);

  // ---------- FIX 5: slow-behavior strike-miss ----------
  console.log('\n-- FIX 5: slow miss mismatch --');
  freshGame();
  const tv = Game.encSlowMissVerb({ id: 'box_turtle' });
  ok('turtle miss verb mentions the shell', /shell/i.test(tv), tv);
  ok('turtle miss verb never says bolts', !/bolt/i.test(tv), tv);
  const gv = Game.encSlowMissVerb({ id: 'gila_monster' });
  ok('gila miss verb says it doesn\'t flee', /doesn.t flee/i.test(gv), gv);
  ok('gila miss verb never says bolts', !/bolt/i.test(gv), gv);
  // encMissReact: slow stays, no bolt pstate
  const s5 = Game.state.scholar;
  const ta = spawn('box_turtle', 5, 5);
  const adef = animals.find(x => x.id === 'box_turtle');
  Game.log.length = 0;
  const ended = Game.encMissReact(ta, adef);
  ok('miss at turtle does not bolt', ta.pstate !== 'bolt', 'pstate=' + ta.pstate);
  ok('miss at turtle does not end encounter', ended === false);
  // drive the REAL huntAnimal with forced RNG into each miss band.
  // aware 0 + dist 1 keeps preyReaction from bolting (fleeP < 0); the turtle
  // can't flee anyway. chance for the turtle (easy, hands, calm) ~= 0.7, so
  // roll 0.72 = near-miss band, 0.99 = clean-miss band.
  freshGame();
  const realRng = Math.random;
  let nearTxt = '', cleanTxt = '';
  for (const [forced, slot] of [[0.72, 'near'], [0.99, 'clean']]) {
    const s7 = Game.state.scholar;
    s7.mx = 5; s7.my = 4;
    const ta2 = spawn('box_turtle', 5, 5);
    ta2.aware = 0; ta2.pstate = 'graze';
    Game.log.length = 0;
    Math.random = () => forced;
    try { Game.huntAnimal(); } catch (e) { console.log('   strike threw: ' + (e && e.message)); }
    Math.random = realRng;
    const t = say();
    if (slot === 'near' && /Not even close/.test(t)) nearTxt = t;
    if (slot === 'clean' && /Missed!/.test(t)) cleanTxt = t;
    if (!/Not even close|Missed!/.test(t)) console.log(`   (forced ${forced}: no miss text — got: ${t.slice(0, 160)})`);
  }
  ok('slow near-miss observed and drops the old "jinks" line', nearTxt.length > 0 && !/jinks at the last breath/i.test(nearTxt), nearTxt.slice(0, 140));
  ok('slow near-miss has no "bolt"', nearTxt.length > 0 && !/bolt/i.test(nearTxt), nearTxt.slice(0, 140));
  if (nearTxt) console.log('   near-miss reads: ' + nearTxt.slice(0, 240));
  ok('slow clean-miss observed and has no "bolt"', cleanTxt.length > 0 && !/bolt/i.test(cleanTxt), cleanTxt.slice(0, 140));
  if (cleanTxt) console.log('   clean-miss reads: ' + cleanTxt.slice(0, 240));
  ok('slow unit paths verified regardless', /shell/i.test(tv) && /doesn.t flee/i.test(gv) && ta.pstate !== 'bolt');

  // ---------- PLAYED AS A PLAYER: the feel pass ----------
  console.log('\n-- PLAYED: feel pass --');
  freshGame();
  const sp = Game.state.scholar;
  sp.mx = 4; sp.my = 4;
  // learn the panther first (knowledge is earned), then meet it
  know('florida_panther');
  spawn('florida_panther', 6, 6);
  Game.log.length = 0;
  // the spawn cue fires in checkAnimals, not our manual spawn — call encAnimalCue as the encounter would
  const pcue = Game.encAnimalCue('florida_panther');
  console.log('   panther (known) cue: ' + pcue);
  ok('panther cue is the stealthy coaching', /silent/i.test(pcue || ''));
  // chase a deer down to winded, read the turns as a player
  spawn('white_tailed_deer', 6, 4);
  let windedSeen = '', turns = 0;
  const da = Game.state.scholar.animal;
  da.pstate = 'bolt'; da.stamina = 1; da.aware = 1;
  while (turns < 6 && Game.state.scholar.animal) {
    turns++;
    Game.log.length = 0;
    Game.animalTurn();
    const t = say();
    if (Game.state.scholar.animal && Game.state.scholar.animal.pstate === 'winded') { windedSeen = t; break; }
  }
  console.log('   deer run down: ' + (windedSeen ? 'winded after ' + turns + ' turn(s)' : 'still going after ' + turns));
  if (windedSeen) console.log('   winded reads: ' + windedSeen.slice(0, 200));
  ok('deer reaches winded with narration', windedSeen.length > 0);

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e && e.stack || e); process.exit(2); });
