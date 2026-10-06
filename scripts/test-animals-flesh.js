// Animals flesh-out tests (Steve 2026-10-06)
// Highbeam-Deer level: distinct windup tells, audio-complete beats,
// same-tile bolt guard, knowledge-gated narration, butcher loop.
// Usage: node scripts/test-animals-flesh.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name + (extra ? ' | ' + extra : '')); }
}
function sayText() { return (Game.log || []).map(l => String(l.text || l)).join('\n'); }

// ---- audio dispatch: every name we fire must resolve to a real synth ----
const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const dispatch = new Set();
{
  // the Game.audio dispatch object: `return {` ... `};` containing the
  // `      name() { name(); },` entries (verified live 2026-10-06)
  const anchor = appSrc.indexOf('animalBite() { animalBite(); },');
  const start = appSrc.lastIndexOf('return {', anchor);
  const end = appSrc.indexOf('\n    };', anchor);
  const region = appSrc.slice(start, end);
  const re = /^\s{6}([a-zA-Z0-9_]+)\(\)\s*\{/gm;
  let m;
  while ((m = re.exec(region))) dispatch.add(m[1]);
}
ok('parsed audio dispatch from app.js', dispatch.size > 50, 'got ' + dispatch.size);
const fired = new Set();
Game.audioEvent = (n) => { fired.add(n); };

function freshGame() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60; s.health = 100;
  Game.genDetail = () => Array.from({ length: 9 }, () => Array(9).fill('grass'));
  Game.log = [];
  Game.state.codex.animalEncounters = {};
  fired.clear();
  return s;
}
function putAnimal(s, id, mx, my, extra) {
  const cfg = Game.encPreyCfg(id);
  s.animal = Object.assign({ id, mx, my, aware: 0, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0 }, extra || {});
  return s.animal;
}
function withRand(values, fn) {
  const orig = Math.random;
  let i = 0;
  Math.random = () => (i < values.length ? values[i++] : 0.99);
  try { return fn(); } finally { Math.random = orig; }
}

(async () => {
  await Game.init();
  const animals = Game.data.animals;

  // ---- 1. tell: distinct windup telegraph per species ----
  // NOTE (Steve 2026-10-06): count is dynamic — hardcoding it broke when the
  // pool grew 12->15. Assert shape/consistency, never the literal count.
  ok('animals loaded', animals.length > 0, 'got ' + animals.length);
  ok('all have tell', animals.every(a => typeof a.tell === 'string' && a.tell.length > 10));
  const tells = animals.map(a => a.tell);
  ok('tells are distinct per species', new Set(tells).size === animals.length);
  const nameLeak = animals.filter(a =>
    a.tell.toLowerCase().includes(a.name.toLowerCase()) ||
    (a.scientific && a.tell.toLowerCase().includes(a.scientific.split(' ')[0].toLowerCase())));
  ok('no true-name leak in tells', nameLeak.length === 0, nameLeak.map(a => a.id).join(','));

  // ---- 2. encWaryText: tell-based, knowledge-gated name ----
  let s = freshGame();
  for (const a of animals) {
    putAnimal(s, a.id, 5, 4);
    const t = Game.encWaryText(s.animal);
    ok('wary text for ' + a.id, t.includes(a.tell), t);
    ok('wary text gated for ' + a.id, !t.toLowerCase().includes(a.name.toLowerCase()), t);
    s.animal = null;
  }

  // ---- 3. encFleeText: huntText earned, generic otherwise ----
  s = freshGame();
  putAnimal(s, 'white_tailed_deer', 5, 4);
  const deer = animals.find(a => a.id === 'white_tailed_deer');
  ok('unknown flee = generic', Game.encFleeText(s.animal, 'GEN') === 'GEN');
  Game.state.codex.animalEncounters.white_tailed_deer = 3;
  ok('known flee = huntText', Game.encFleeText(s.animal, 'GEN') === deer.huntText);

  // ---- 4. bolt path wires encFleeText + audio (deer: white-tail explode) ----
  s = freshGame();
  putAnimal(s, 'white_tailed_deer', 5, 4);
  Game.state.codex.animalEncounters.white_tailed_deer = 3;
  Game.animalTurn(); // aware 0.5 -> wary (tell)
  ok('deer wary tell fires', /white tail flicks/.test(sayText()), sayText().slice(0, 80));
  Game.log = [];
  Game.animalTurn(); // aware 1.0 -> wary-behavior bolt
  ok('deer signature flee text', /explodes into motion/.test(sayText()));
  ok('deer signature flee has audio', fired.has('animalBolt'), [...fired].join(','));

  // ---- 5. same-tile bolt guard: animal on your tile still leaves ----
  s = freshGame();
  const ra = putAnimal(s, 'cottontail_rabbit', 4, 4); // same tile as player
  withRand([0.0], () => Game.animalTurn()); // force zigzag path choice
  ra.pstate = 'bolt';
  Game.animalTurn();
  ok('same-tile bolt moves the animal', !(ra.mx === 4 && ra.my === 4) || !s.animal, `at ${ra.mx},${ra.my}`);

  // ---- 6. encBoltDir never returns [0,0] ----
  s = freshGame();
  const d = Game.encBoltDir({ mx: 4, my: 4 }, 4, 4);
  ok('encBoltDir non-zero on same tile', d[0] !== 0 || d[1] !== 0, JSON.stringify(d));
  const d2 = Game.encBoltDir({ mx: 6, my: 4 }, 4, 4);
  ok('encBoltDir points away', d2[0] === 1 && d2[1] === 0, JSON.stringify(d2));

  // ---- 7. audio completion: every narrated beat fires a real synth ----
  const beats = [
    // [animalId, setup fn returning extra rand control, trigger]
    ['gray_fox', (a) => { a.pstate = 'bolt'; }, 'juke'],
    ['snapping_turtle', (a) => { a.hissed = true; }, 'snap'],
    ['raccoon', null, 'steal'],
    ['wild_turkey', (a) => { a.pstate = 'bolt'; }, 'flock'],
    ['cottontail_rabbit', (a) => { a.pstate = 'bolt'; }, 'dive-n/a'],
  ];
  // fox juke: bolt + random<0.35
  s = freshGame();
  putAnimal(s, 'gray_fox', 6, 4, { pstate: 'bolt' });
  withRand([0.1], () => Game.animalTurn());
  ok('fox juke has audio', fired.has('animalBolt'), [...fired].join(','));
  // snapper snap: dist<=1, random<0.35
  s = freshGame();
  putAnimal(s, 'snapping_turtle', 5, 4, { hissed: true });
  withRand([0.1, 0.99], () => Game.animalTurn());
  ok('snapper snap has audio', fired.has('animalBite'), [...fired].join(','));
  ok('snapper snap hurt the player', s.health < 100, 'hp=' + s.health);
  // raccoon steal: dist<=1, food in pack, random<0.15 then find food
  s = freshGame();
  putAnimal(s, 'raccoon', 5, 4);
  s.inventory.push({ name: 'Berries', kcalEach: 50, units: 2 });
  const before = s.inventory.length;
  withRand([0.05], () => Game.animalTurn());
  ok('raccoon stole food', s.inventory.length === before - 1, 'inv=' + s.inventory.length);
  ok('raccoon steal has audio', fired.has('animalBolt'), [...fired].join(','));
  // turkey flock panic line
  s = freshGame();
  putAnimal(s, 'wild_turkey', 6, 4, { pstate: 'bolt' });
  withRand([0.99, 0.5], () => Game.animalTurn());
  if (/flock explodes/.test(sayText())) ok('flock panic has audio', fired.has('animalBolt'), [...fired].join(','));

  // strike-bolt audio: miss path fires animalBolt exactly via one path
  s = freshGame();
  putAnimal(s, 'cottontail_rabbit', 5, 4, { aware: 1 });
  fired.clear();
  withRand([0.05], () => Game.huntAnimal()); // preyReaction: fleeP 0.9, flees
  ok('strike-bolt fires audio', fired.has('animalBolt'), [...fired].join(','));
  ok('strike-bolt moved the animal', !s.animal || s.animal.mx !== 5, s.animal ? s.animal.mx + ',' + s.animal.my : 'gone');

  // miss / near-miss paths fire audio
  s = freshGame();
  putAnimal(s, 'cottontail_rabbit', 5, 4, { aware: 0.1, pstate: 'winded', stamina: 0 });
  fired.clear();
  withRand([0.99, 0.5], () => Game.huntAnimal()); // winded: no flee-react, roll miss
  if (s.animal) ok('miss path fires audio', fired.has('animalBolt'), [...fired].join(','));

  // every fired name resolves in the dispatch
  const badAudio = [...fired].filter(n => !dispatch.has(n));
  ok('all fired audio names exist in app.js dispatch', badAudio.length === 0, badAudio.join(','));

  // ---- 8. phase badges for UI siblings ----
  const badgeExpect = { graze: 'grazing', wary: '⚠ wary', bolt: '💨 bolting', winded: '😮‍💨 winded', playing_dead: '💀 playing dead', taunt: '👀 toying with you' };
  let badgeOK = true;
  for (const [pstate, want] of Object.entries(badgeExpect)) {
    if (Game.encPreyPhaseBadge({ pstate }) !== want) { badgeOK = false; console.log('  badge mismatch: ' + pstate); }
  }
  ok('phase badges cover all pstates', badgeOK);

  // ---- 9. butcher loop: kill -> carcass -> clean -> yields + knowledge ----
  s = freshGame();
  s.inventory.push({ name: 'Stone knife', recipeId: 'stone_knife', units: 1, kg: 0.3 });
  putAnimal(s, 'gray_squirrel', 5, 4, { aware: 0, pstate: 'winded', stamina: 0 });
  withRand([0.5, 0.05], () => Game.huntAnimal()); // no bite (0.5); kill roll (0.05)
  const carcass = s.inventory.find(i => i.foodState === 'carcass');
  ok('kill yields a carcass', !!carcass, JSON.stringify(s.inventory.map(i => i.name)));
  ok('kill teaches identity', Game.encAnimalKnown('gray_squirrel'));
  if (carcass) {
    const idx = s.inventory.indexOf(carcass);
    Game.cleanCarcass(idx);
    const cleaned = s.inventory.find(i => i.foodState === 'cleaned');
    ok('cleaned into meat', !!cleaned && cleaned.edible === true);
    const hide = s.inventory.find(i => i.material === 'hide');
    ok('butcher yield: hide', !!hide && hide.units >= 1, JSON.stringify(s.inventory.filter(i => i.material).map(i => i.name)));
  }

  // ---- 10. knowledge gating holds across the loop ----
  s = freshGame();
  Game.checkAnimals && null;
  putAnimal(s, 'opossum', 6, 5);
  Game.log = [];
  Game.animalTurn();
  const t10 = sayText();
  ok('no true name pre-knowledge', !/opossum/i.test(t10), t10.slice(0, 120));

  console.log(`\n=== RESULTS: ${pass} pass, ${fail} fail ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
