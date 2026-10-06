// play-animals-feel-20261006b.js
// FEEL PLAYTEST (Steve 2026-10-06): hunt as a PLAYER — stalk, strike, flee,
// chase, kill, butcher, haul — judging playable-and-enjoyable, not "runs".
// Read-only on tracked files; new script only. No jest — plain node.
// Usage: node scripts/play-animals-feel-20261006b.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });

function boot() {
  delete globalThis.Scattering;
  ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
   'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js']
    .forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  eval(fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8'));
  ['src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
   'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
   'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  return globalThis.Scattering.Game;
}
// deterministic woods: same player, same luck.
let _seed = 20261006;
const realRandom = Math.random;
Math.random = function () { _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; };
function rigLow() { Math.random = () => 0.0001; }          // next beats always roll minimal
function unrig() { Math.random = function () { _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; }; }

function drainLines(Game) {
  const lines = (Game.log || []).slice(); Game.log = [];
  const fb = (Game._feedback || []); Game._feedback = [];
  return lines.concat(fb).map(String);
}
const firedAudio = [];
let Game = null;
async function newRun() {
  Game = boot();
  Game.audio = new Proxy({}, { get: (t, k) => (...a) => { firedAudio.push(String(k)); } });
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.dayPart = 1;
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4;
  s.kcal = 1500; s.health = 100;
  s.equipped = {};
  s.inventory = [{ name: 'Stone knife', recipeId: 'stone_knife', units: 1, kg: 0.2 }];
  return s;
}
function equip(id) { Game.state.scholar.equipped.weapon = { itemId: id }; }
function placeAnimal(id, ax, ay) {
  const cfg = Game.encPreyCfg(id);
  Game.state.scholar.animal = { id, mx: ax, my: ay, aware: 0, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0 };
}
function dist() {
  const s = Game.state.scholar, a = s.animal;
  return a ? Math.max(Math.abs(a.mx - s.mx), Math.abs(a.my - s.my)) : -1;
}
function show(prefix) {
  const said = drainLines(Game);
  for (const l of said) console.log('  ' + prefix + ' ' + l.slice(0, 220));
  return said;
}
function chaseBeat() {
  // player plays honestly: walk one tile toward the animal, world reacts
  const s = Game.state.scholar, a = s.animal;
  if (!a) return;
  s.mx += Math.sign(a.mx - s.mx); s.my += Math.sign(a.my - s.my);
  Game.animalTurn();
}
function note(t) { console.log('\n### ' + t); }

(async () => {
  // ============ ACT 1 — THE RABBIT: stalk, strike, bolt, chase ============
  let s = await newRun();
  equip('fire_hardened_spear'); // range 2
  note('ACT 1 — Cottontail rabbit. I spot movement in the brush. I stalk in, low and slow.');
  placeAnimal('cottontail_rabbit', 7, 4);
  show('spawn>');
  for (let i = 0; i < 3; i++) {
    const d0 = dist();
    Game.stalkAnimal();
    const a = Game.state.scholar.animal;
    console.log(`  [me: (${s.mx},${s.my}) -> animal (${a ? a.mx + ',' + a.my : 'gone'}), dist ${d0}->${dist()}, aware ${(a && a.aware != null ? a.aware.toFixed(2) : '?')}, pstate ${a && a.pstate}, stamina ${a && a.stamina}]`);
    show('stalk>');
    if (dist() <= 2) break;
  }
  note('ACT 1b — STRIKE. Hands-on in spear range. What does it do?');
  Game.huntAnimal();
  show('strike>');
  let a = Game.state.scholar.animal;
  console.log(`  [after strike: animal ${a ? `@(${a.mx},${a.my}) pstate=${a.pstate} aware=${(a.aware||0).toFixed(2)} stamina=${a.stamina}` : 'GONE (escaped)'}]`);
  if (a) {
    note('ACT 1c — THE CHASE. It bolted. I run it down, one tile a beat.');
    for (let t = 0; t < 10; t++) {
      a = Game.state.scholar.animal; if (!a) break;
      const d0 = dist();
      chaseBeat();
      a = Game.state.scholar.animal;
      console.log(`  [beat ${t + 1}: me (${s.mx},${s.my}) vs animal ${a ? `@(${a.mx},${a.my}) pstate=${a.pstate} aware=${(a.aware || 0).toFixed(2)} stamina=${a.stamina}` : 'GONE'}]`);
      show('chase>');
      if (!a) break;
      if (a.pstate === 'winded') {
        note('ACT 1d — WINDED. Sides heaving. This is the chase-method payoff — I strike now (rigged to land, playing the earned shot).');
        rigLow(); Game.huntAnimal(); unrig();
        show('kill>');
        break;
      }
    }
  }
  console.log('  [audio so far: ' + firedAudio.join(', ') + ']');

  // ============ ACT 2 — THE DEER: alarm snort, white-tail explode ============
  s = await newRun();
  equip('crude_bow'); // range 5, the deer's honest method
  note('ACT 2 — White-tailed deer, 20,000 kcal of walking pantry. I have a bow. I stalk to the edge of bow range.');
  placeAnimal('white_tailed_deer', 7, 5);
  show('spawn>');
  Game.stalkAnimal();
  console.log(`  [me (${s.mx},${s.my}) vs deer (${Game.state.scholar.animal.mx},${Game.state.scholar.animal.my}), dist ${dist()}, aware ${(Game.state.scholar.animal.aware || 0).toFixed(2)}, pstate ${Game.state.scholar.animal.pstate}]`);
  show('stalk>');
  note('ACT 2b — I loose an arrow (honest roll — the deer is hard, difficulty hard).');
  Game.huntAnimal();
  show('shot>');
  a = Game.state.scholar.animal;
  console.log(`  [deer ${a ? `@(${a.mx},${a.my}) pstate=${a.pstate} stamina=${a.stamina}` : 'GONE'}]`);
  if (a) {
    note('ACT 2c — I chase it. Does the flee feel alive — one tile, directional, or teleport-random?');
    for (let t = 0; t < 8; t++) {
      a = Game.state.scholar.animal; if (!a) break;
      chaseBeat();
      a = Game.state.scholar.animal;
      console.log(`  [beat ${t + 1}: me (${s.mx},${s.my}) vs deer ${a ? `@(${a.mx},${a.my}) pstate=${a.pstate} aware=${(a.aware || 0).toFixed(2)} stamina=${a.stamina}` : 'GONE'}]`);
      show('chase>');
      if (!a) break;
      if (a.pstate === 'winded') {
        note('ACT 2d — WINDED. It can\'t run anymore. I finish it (rigged to land).');
        rigLow(); Game.huntAnimal(); unrig();
        show('kill>');
        break;
      }
    }
  }
  const carcass = s.inventory.find(i => i.foodState === 'carcass');
  console.log('  [carcass in pack: ' + (carcass ? carcass.name + ' | ' + carcass.foodKind + '/' + carcass.foodState + ' | hiddenKcal ' + carcass.hiddenKcal : 'NONE') + ']');

  // ============ ACT 3 — BUTCHER: is it legible? ============
  note('ACT 3 — BUTCHERING. I have a carcass and a stone knife. Game.cleanCarcass.');
  const ci = s.inventory.findIndex(i => i.foodState === 'carcass');
  if (ci >= 0) { Game.cleanCarcass(ci); } else { console.log('  (no carcass — butcher beat could not play)'); }
  show('clean>');
  console.log('  [pack after clean:]');
  for (const it of s.inventory) console.log('   - ' + it.name + ' | units ' + it.units + ' | kcalEach ' + it.kcalEach + ' | kg ' + it.kg + ' | ' + (it.prep || '').slice(0, 80));
  console.log('  [audio on butcher beat: ' + firedAudio.slice(-3).join(', ') + ']');

  // ============ ACT 4 — GALLERY: one honest beat per special animal ============
  note('ACT 4 — GALLERY. Each animal answers the hunter differently. One beat each.');
  // opossum: flop on approach, then strike the "dead" one
  s = await newRun(); placeAnimal('opossum', 6, 4);
  Game.animalTurn(); // dist 2 -> wait, need dist<=4: me (4,4) vs (6,4) dist 2
  show('possum-approach>');
  a = Game.state.scholar.animal;
  console.log('  [opossum pstate: ' + (a && a.pstate) + ']');
  Game.huntAnimal();
  show('possum-strike>');
  // snapping turtle: hiss at dist<=2
  s = await newRun(); placeAnimal('snapping_turtle', 6, 4);
  s.mx = 4; Game.animalTurn();
  show('turtle>');
  // rattlesnake: rattle warning at dist<=3
  s = await newRun(); placeAnimal('timber_rattlesnake', 6, 4);
  Game.animalTurn();
  show('rattler>');
  // skunk: press to dist<=1
  s = await newRun(); placeAnimal('striped_skunk', 5, 4);
  s.mx = 5; Game.animalTurn();
  show('skunk>');
  console.log('  [skunkScent days: ' + (s.skunkScent || 0) + ']');
  // porcupine: barehand strike at dist 1
  s = await newRun(); equip(null); s.equipped = {}; placeAnimal('porcupine', 5, 4);
  rigLow(); Game.huntAnimal(); unrig();
  show('porcupine>');
  console.log('  [hp after: ' + s.health + ']');
  // boar: approach to dist<=3 for the pawing warning
  s = await newRun(); equip('fire_hardened_spear'); placeAnimal('wild_boar', 7, 4);
  Game.animalTurn();
  show('boar-approach>');
  console.log('  [boar pstate: ' + (Game.state.scholar.animal && Game.state.scholar.animal.pstate) + ']');
  // goose: it advances on YOU
  s = await newRun(); placeAnimal('canada_goose', 6, 4);
  for (let t = 0; t < 3; t++) { Game.animalTurn(); if (!Game.state.scholar.animal) break; }
  show('goose>');
  console.log('  [goose final: ' + (Game.state.scholar.animal ? `@(${Game.state.scholar.animal.mx},${Game.state.scholar.animal.my}) pstate=${Game.state.scholar.animal.pstate}` : 'gone') + ']');
  // wild turkey flock behavior: strike one — what does the flock do?
  s = await newRun(); equip('crude_bow'); placeAnimal('wild_turkey', 6, 4);
  rigLow(); Game.huntAnimal(); unrig();
  show('turkey>');

  note('ACT 5 — THE DEER, ROUND 2: I miss on purpose. Does the white-tail explode?');
  s = await newRun();
  equip('crude_bow');
  placeAnimal('white_tailed_deer', 7, 5);
  drainLines(Game);
  Game.stalkAnimal(); drainLines(Game);
  // honest miss: force the roll to MISS (roll 0.99 > chance) without rigging the flee reaction
  Math.random = () => 0.99;
  Game.huntAnimal();
  unrig();
  show('miss>');
  a = Game.state.scholar.animal;
  console.log('  [deer ' + (a ? `@(${a.mx},${a.my}) pstate=${a.pstate} stamina=${a.stamina} aware=${(a.aware || 0).toFixed(2)}` : 'GONE') + ']');
  if (a) {
    note('ACT 5b — THE CHASE. Bow in hand, I run it down.');
    for (let t = 0; t < 10; t++) {
      a = Game.state.scholar.animal; if (!a) break;
      chaseBeat();
      a = Game.state.scholar.animal;
      console.log(`  [beat ${t + 1}: me (${s.mx},${s.my}) vs deer ${a ? `@(${a.mx},${a.my}) pstate=${a.pstate} aware=${(a.aware || 0).toFixed(2)} stamina=${a.stamina}` : 'GONE'}]`);
      show('chase>');
      if (!a) break;
      if (a.pstate === 'winded') {
        note('ACT 5c — WINDED. I finish it (rigged).');
        rigLow(); Game.huntAnimal(); unrig();
        show('kill>');
        break;
      }
    }
  }

  note('ACT 6 — GALLERY ROUND 2. The beats my wrong id stole.');
  // porcupine, correct id: barehanded grab at dist 1
  s = await newRun(); s.equipped = {}; drainLines(Game);
  placeAnimal('north_american_porcupine', 5, 4);
  Game.huntAnimal();
  show('quill>');
  console.log('  [hp after quills: ' + s.health + ' | pstate: ' + (Game.state.scholar.animal && Game.state.scholar.animal.pstate) + ']');
  // opossum: approach to dist 1, then strike the "dead" one
  s = await newRun(); s.equipped = {}; drainLines(Game);
  placeAnimal('opossum', 5, 4);
  Game.animalTurn(); drainLines(Game); // flop
  s.mx = 5; // step onto it
  Game.huntAnimal();
  show('possum-kill>');
  const pcarc = s.inventory.find(i => i.foodState === 'carcass');
  console.log('  [possum carcass: ' + (pcarc ? pcarc.name : 'NONE') + ']');
  // rabbit: full small-game kill + butcher
  s = await newRun(); s.equipped = {}; drainLines(Game);
  placeAnimal('cottontail_rabbit', 5, 4);
  Game.animalTurn(); drainLines(Game);
  rigLow(); Game.huntAnimal(); unrig();
  show('rabbit-kill>');
  const rci = s.inventory.findIndex(i => i.foodState === 'carcass');
  if (rci >= 0) { Game.cleanCarcass(rci); show('rabbit-clean>'); }
  // wild turkey flock: scatter the flock, is there a straggler?
  s = await newRun(); equip('crude_bow'); drainLines(Game);
  placeAnimal('wild_turkey', 6, 4);
  Game.animalTurn(); drainLines(Game);
  Math.random = () => 0.99; Game.huntAnimal(); unrig();
  show('flock-miss>');
  a = Game.state.scholar.animal;
  console.log('  [flock ' + (a ? `@(${a.mx},${a.my}) pstate=${a.pstate} aware=${(a.aware || 0).toFixed(2)} stamina=${a.stamina}` : 'ALL GONE') + ']');

  note('AUDIO HOOKS FIRED (full order this run)');
  console.log('  ' + firedAudio.join(' → '));
  console.log('\nDone. See the evidence note for verdicts.');
})().catch(e => { console.error('CRASH', e); process.exit(2); });
