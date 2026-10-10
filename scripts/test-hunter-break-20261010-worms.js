#!/usr/bin/env node
// HUNTER ATTACK 2026-10-10 r3 (adversarial playtest loop, archetype 6).
// Hostile probes against the worm pipeline: trichinosis (bear/boar/javelina)
// must survive every preservation step that isn't a real cooking.
//
//   E1 EXPLOIT — pemmican launders trichinosis. makePemmican builds bars from
//      any 'preserved' meat; smoked-RAW bear meat carries live parasiteRisk
//      (p=0.35), but the bars drop it entirely and get safe:true. 120 days
//      of worm-free food from never-cooked bear meat — canon violation
//      (BEAR.md: "Only foodState: 'cooked' clears it — smoking does NOT").
//      Post-fix: the bars inherit the strongest input parasiteRisk; every
//      eat path already rolls it (foodState 'pemmican' != 'cooked').
//   E2 HONESTY — 'smoked ✓' marker lies on wormy meat. foodMarker prints
//      'smoked ✓' for smoked-raw bear meat while the engine rolls 35%
//      trichinosis per bite. Post-fix: a parasiteRisk branch that warns
//      'cook it through' — naming worms only for L4 knowers
//      (encAnimalLevel >= vectorLevel gate, same as the kill line), so no
//      knowledge leaks to the ignorant.
//   E3 HELD — trap-catch double-claim. checkTraps has exactly one call site
//      (endDay); each trap catches at most once per call; shyness and uses
//      move once per catch. Recorded as held.
//   E4 HELD — cornered prey: no silent turns, encounter terminates.
//      (Steve's no-silent-turns rule vs the corner-panic branch.)
//
// Harness: mulberry32 seeded BEFORE eval (modules capture Math.random at
// load), full src/js module list in index.html order minus DOM-only files
// and drama.js, window stubbed for eval then deleted (sync combat path).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261010', 10);
let _rng = mulberry32(SEED);
Math.random = () => _rng();
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const ORDER = ['src/js/engine/state.js','src/js/engine/modifiers.js','src/js/engine/calories.js',
 'src/js/engine/day.js','src/js/engine/forage.js','src/js/engine/combat.js',
 'src/js/game.js','src/js/encounters.js','src/js/conversation.js','src/js/convo-mood.js',
 'src/js/convoTopics.js','src/js/convo-wants.js','src/js/convo-dialogue.js','src/js/convo-beats.js',
 'src/js/convo-scene.js','src/js/examine.js','src/js/equipment.js','src/js/journal.js','src/js/party.js',
 'src/js/party-formal.js','src/js/truth.js','src/js/contests.js','src/js/contestEngine.js',
 'src/js/alienPlayers.js','src/js/storage.js','src/js/perceive.js','src/js/carexplore.js',
 'src/js/justice.js','src/js/food.js','src/js/betrayal.js','src/js/corpses.js','src/js/lifeseed.js',
 'src/js/progression.js','src/js/ledger.js','src/js/abilityActions.js','src/js/monsterBehaviors.js',
 'src/js/statusEffects.js','src/js/villager-agency.js','src/js/fieldFights.js',
 'src/js/villager-objectives.js','src/js/codex-people.js','src/js/membership.js',
 'src/js/hierarchy.js','src/js/debug-scenarios.js','src/js/build.js'];
for (const f of ORDER) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
delete global.window;
const Game = globalThis.Scattering.Game;

const fails = [];
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) fails.push(name);
}
function flatGrid() { return Array.from({ length: 9 }, () => Array(9).fill('grass')); }
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60; s.health = 100; s.hp = 100;
  Game.genDetail = flatGrid;
  return s;
}
function sayLog(fn) {
  const msgs = [];
  const realSay = Game.say, realFb = Game.feedback;
  Game.say = (m) => { msgs.push(String(m)); };
  if (realFb) Game.feedback = (m) => { msgs.push(String(m)); };
  try { fn(); } finally { Game.say = realSay; if (realFb) Game.feedback = realFb; }
  return msgs;
}
// Build smoked-raw bear meat + rendered fat through the honest pipeline.
function smokedBearPipeline(s) {
  const bear = Game.data.animals.find(a => a.id === 'black_bear');
  s.inventory.push(Game.foodCarcass(bear, bear.calories, s.day, 'trapped'));
  s.inventory.push({ name: 'Stone knife', recipeId: 'stone_knife', units: 1 });
  Game.state.codex.techniques = Game.state.codex.techniques || {};
  Game.state.codex.techniques.clean = { level: 3 };
  Game.state.codex.techniques.preserve = { level: 3 };
  Game.state.codex.techniques.render = { level: 3 };
  sayLog(() => Game.cleanCarcass());
  Game.nearFire = () => true; // test-only: a fire is right here
  sayLog(() => Game.preserveFood());
  sayLog(() => Game.renderFat());
  s.inventory.push({ plantId: 'blackberry', foodKind: 'plant', name: 'Blackberries', edible: true, units: 4, unit: 'berry', kcalEach: 20, spoilDay: 9999 });
  return {
    meat: s.inventory.find(i => i && i.foodKind === 'meat' && i.foodState === 'preserved' && /bear/i.test(i.name)),
    fat: s.inventory.find(i => i && i.foodKind === 'fat' && i.foodState === 'rendered'),
  };
}

(async () => {
  await Game.init();
  console.log('seed=' + SEED);

  // ---- E1: pemmican must not launder trichinosis ----
  {
    const s = freshGame();
    const { meat, fat } = smokedBearPipeline(s);
    check('E1 setup: smoked bear meat has live parasiteRisk', !!(meat && meat.parasiteRisk && meat.parasiteRisk.p === 0.35),
      meat ? JSON.stringify(meat.parasiteRisk) : 'no smoked bear meat');
    check('E1 setup: rendered fat ready', !!fat, fat ? fat.name : 'no fat');
    sayLog(() => Game.makePemmican());
    const bars = s.inventory.filter(i => i && i.itemId === 'pemmican');
    check('E1 setup: pemmican bars made', bars.length > 0, bars.length + ' stacks');
    const bar = bars[0];
    check('E1 bars carry the worms (parasiteRisk survives pemmican)', !!(bar && bar.parasiteRisk && bar.parasiteRisk.p === 0.35),
      bar ? ('parasiteRisk=' + JSON.stringify(bar.parasiteRisk)) : 'no bars');
    // the eat paths roll parasiteRisk on any non-'cooked' state — prove the
    // bar would actually roll by simulating one bite with a forced roll.
    let contracted = null;
    const realCD = Game.contractDisease;
    Game.contractDisease = (id) => { contracted = id; };
    const realR = Math.random; Math.random = () => 0.0; // force the worm roll
    try {
      const idx = s.inventory.indexOf(bar);
      s.kcal = 0; // make room on the bar
      sayLog(() => Game.eatOne(idx));
    } finally { Math.random = realR; Game.contractDisease = realCD; }
    check('E1 eating a wormy bar contracts trichinosis', contracted === 'trichinosis', 'contracted=' + contracted);
  }

  // ---- E2: the marker must not claim 'smoked ✓' on wormy meat ----
  {
    const s = freshGame();
    const { meat } = smokedBearPipeline(s);
    const m0 = Game.foodMarker(meat);
    check('E2 marker does not print a bare smoked-✓ on wormy meat', !/smoked ✓/.test(m0), JSON.stringify(m0));
    check('E2 marker tells the ignorant to cook it through', /cook it through/i.test(m0), JSON.stringify(m0));
    check('E2 marker does not leak the worm name to the ignorant', !/worm/i.test(m0), JSON.stringify(m0));
    Game.state.codex.animals = Game.state.codex.animals || {};
    Game.state.codex.animals.black_bear = { level: 4 }; // L4: earned the truth
    const m4 = Game.foodMarker(meat);
    check('E2 L4 knower sees the worm warning', /worm/i.test(m4), JSON.stringify(m4));
  }

  // ---- E3 (HELD): trap catches claim once per call, shyness/uses move once ----
  {
    const s = freshGame();
    const t = Game.tileAt(4, 4);
    t.type = 'forest';
    t.wildlife = { cottontail_rabbit: 4 };
    const recipe = Game.data.recipes.find(r => r.id === 'snare');
    t.traps = [{ recipeId: 'snare', setDay: s.day, uses: 10 }];
    const realR = Math.random; Math.random = () => 0.0; // force the catch roll
    let msgs;
    try { msgs = sayLog(() => Game.checkTraps()); } finally { Math.random = realR; }
    const carcasses = s.inventory.filter(i => i && i.foodState === 'carcass');
    check('E3 one checkTraps call = at most one catch per trap', carcasses.length === 1, carcasses.length + ' carcasses');
    check('E3 uses decrement once per catch (10 -> 9)', t.traps[0] && t.traps[0].uses === 9, 'uses=' + (t.traps[0] && t.traps[0].uses));
    check('E3 shyness rises once per catch (level 1)', ((t.trapShy || {})['snare'] || {}).level === 1,
      JSON.stringify((t.trapShy || {})['snare']));
    check('E3 catch message names the catch', msgs.some(m => /TRAP/i.test(m) && /rabbit/i.test(m)),
      msgs.filter(m => /TRAP/i.test(m)).join(' | ').slice(0, 120));
  }

  // ---- E4 (HELD): cornered prey — no silent turns; a pursued chase ----
  // ---- always reaches a decisive state (escaped at the treeline, or ----
  // ---- winded = your move). The hostile question: can you corner prey ----
  // ---- repeatedly at zero cost and farm strikes? (Strikes cost 100 kcal ----
  // ---- each and practice caps at +0.2 — the code, not this test.) ----
  {
    const s = freshGame();
    s.animal = { id: 'white_tailed_deer', mx: 4, my: 4, aware: 1, stamina: 0, pstate: 'cornered', wild: false, hunger: 50, edgeTurns: 0 };
    s.mx = 4; s.my = 5; // right on top of it — the corner press
    let silent = 0, turns = 0;
    for (let i = 0; i < 8 && s.animal; i++) {
      const msgs = sayLog(() => Game.animalTurn());
      turns++;
      if (!msgs.length) silent++;
      // hostile press: stay glued to it (interior tiles)
      const a = s.animal;
      if (a) { s.mx = Math.max(1, Math.min(7, a.mx)); s.my = Math.max(1, Math.min(7, a.my + 1)); }
    }
    check('E4 no silent corner/panic turns', silent === 0, silent + ' silent of ' + turns);
  }
  {
    // pursuit: the deer must not ping-pong forever — it escapes or winds.
    const s = freshGame();
    s.animal = { id: 'white_tailed_deer', mx: 4, my: 4, aware: 0.8, stamina: 3, pstate: 'bolt', wild: false, hunger: 50, edgeTurns: 0 };
    s.mx = 4; s.my = 6;
    let silent = 0, turns = 0, decisive = false;
    for (let i = 0; i < 40; i++) {
      const a = s.animal;
      if (!a) { decisive = true; break; }
      if (a.pstate === 'winded') { decisive = true; break; } // catchable: the chase is over, your move
      s.mx = Math.max(1, Math.min(7, s.mx + Math.sign(a.mx - s.mx)));
      s.my = Math.max(1, Math.min(7, s.my + Math.sign(a.my - s.my)));
      const msgs = sayLog(() => Game.animalTurn());
      turns++;
      if (!msgs.length) silent++;
    }
    if (!s.animal || (s.animal && s.animal.pstate === 'winded')) decisive = true;
    check('E4 no silent chase turns', silent === 0, silent + ' silent of ' + turns);
    check('E4 pursued chase reaches a decisive state (escaped or winded)', decisive,
      'still bolting after ' + turns + ' turns');
  }

  console.log(fails.length ? `\n${fails.length} FAILURES: ${fails.join('; ')}` : '\nALL GREEN');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
