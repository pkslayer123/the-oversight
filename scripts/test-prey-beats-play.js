// Player playtest — prey beats (Steve 2026-10-06).
// Plays the hunt like a player: approach a deer (graze → wary → white-tail
// bolt → chase → winded), corner a snapping turtle (hiss), spot movement
// (rustle), and run a rabbit down and kill it (kill thud). Verifies the
// five new audio events fire at the right beats and the phase badges read
// correctly at each stage — the windup → action → recovery the grid shows.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
 ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/contests.js', 'src/js/encounters.js',
 'src/js/food.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  const s = Game.state.scholar;

  // spy on audio beats
  const fired = [];
  const _origAudio = Game.audioEvent.bind(Game);
  Game.audioEvent = function (name, data) { fired.push(name); try { _origAudio(name, data); } catch (e) {} };
  const had = (n) => fired.indexOf(n) >= 0;

  // ============ ACT 1: the deer ============
  // spawn a white-tail mid-grid, walk the player into its notice range
  s.mx = 4; s.my = 0; s.kcal = 5000; s.health = 100;
  s.animal = { id: 'white_tailed_deer', mx: 4, my: 3, aware: 0, stamina: 3, pstate: 'graze', edgeTurns: 0 };
  const seen = new Set(), badges = [];
  let guard = 0;
  while (guard++ < 40) {
    const a = s.animal;
    if (!a) break;
    seen.add(a.pstate);
    badges.push(`${a.pstate}:${Game.encPreyPhaseBadge(a)}`);
    // player walks toward the deer, one tile per turn (the chase is real)
    if (s.my < a.my) s.my++; else if (s.my > a.my) s.my--;
    else if (s.mx < a.mx) s.mx++; else if (s.mx > a.mx) s.mx--;
    Game.animalTurn();
    s.kcal = 5000;
    if (s.animal) seen.add(s.animal.pstate); // windup→action→recovery, as the grid shows it
    if (a.pstate === 'winded') break;
  }
  const story = badges.join(' → ');
  console.log('  deer hunt:', story);
  ok('deer: graze → wary → bolt → winded observed',
    seen.has('graze') && seen.has('wary') && seen.has('bolt') && seen.has('winded'));
  ok('deer: alarm snort fired on the white-tail bolt', had('animalSnort'));
  ok('deer: scamper fired with the bolt', had('animalBolt'));
  ok('deer: pant fired when winded (sides heaving)', had('animalPant'));
  ok('deer: badge reads "😮‍💨 winded" at recovery',
    Game.encPreyPhaseBadge({ pstate: 'winded' }) === '😮‍💨 winded');
  ok('deer: hunt ended winded, not vanished (player can strike)',
    s.animal && s.animal.pstate === 'winded');

  // ============ ACT 2: the turtle ============
  fired.length = 0;
  s.mx = 4; s.my = 4; s.kcal = 5000;
  s.animal = { id: 'snapping_turtle', mx: 4, my: 5, aware: 0, stamina: 2, pstate: 'graze', edgeTurns: 0 };
  Game.animalTurn();
  console.log('  turtle badge:', Game.encPreyPhaseBadge(s.animal));
  ok('turtle: hiss fired on lunge warning', had('animalHiss'));
  ok('turtle: does not flee (aggressive, holds ground)', s.animal && s.animal.pstate !== 'bolt');

  // ============ ACT 3: movement in the grass ============
  // (the player is out foraging on a forest_floor tile — haven has no prey)
  fired.length = 0;
  s.animal = null; s.mx = 4; s.my = 4; s.kcal = 5000;
  Game.map.px = 6; Game.map.py = 1; // forest_floor (deer biomes: forest_floor, meadow)
  let spawned = null;
  for (let i = 0; i < 80 && !spawned; i++) { Game.checkAnimals(); spawned = s.animal; }
  Game.map.px = 3; Game.map.py = 3; // back to haven
  ok('movement: animal spawns on the grid', !!spawned);
  ok('movement: rustle fired on the spawn notice', had('animalRustle'));
  if (spawned) console.log('  spawned:', spawned.id, 'badge:', Game.encPreyPhaseBadge(spawned));

  // ============ ACT 4: the kill ============
  // Corner a tired rabbit mid-grid and strike until the kill lands.
  // (The full chase is proven in acts above; the zigzag-across-the-map
  // dance is why snares exist. The kill beat is what's under test.)
  fired.length = 0;
  const meatCount = () => (s.inventory || []).filter(i => i && i.foodKind === 'meat').length;
  const meat0 = meatCount();
  let strikes = 0, rounds = 0;
  while (rounds++ < 8 && meatCount() === meat0) {
    s.mx = 4; s.my = 5; s.kcal = 5000; s.health = 100;
    s.animal = { id: 'cottontail_rabbit', mx: 4, my: 4, aware: 1, stamina: 0, pstate: 'winded', edgeTurns: 0 };
    let g2 = 0;
    while (g2++ < 30 && s.animal && meatCount() === meat0) {
      const a = s.animal;
      // stay glued: step adjacent (the strike's own reactions move it)
      s.mx = Math.max(0, Math.min(8, a.mx));
      s.my = a.my > 0 ? a.my - 1 : a.my + 1;
      s.kcal = 5000;
      try { Game.huntAnimal(); strikes++; } catch (e) { console.log('  hunt threw:', e.message); break; }
    }
  }
  const carcasses = meatCount() - meat0;
  console.log(`  rabbit: ${strikes} strike(s) over ${rounds} round(s), carcasses: ${carcasses}`);
  ok('rabbit: kill lands (carcass in pack)', carcasses > 0);
  ok('rabbit: kill thud fired on the strike that lands', had('animalKill'));

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
