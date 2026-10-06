// Proof: sprite taxonomy pilot — berries (Steve 2026-10-06).
// Chain: root (plant/bush/tree) -> category (berry_bush) -> specific (blackberry).
// Unexamined = generic; examined = category; codex L1+ = specific sprite.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js', 'src/js/sprites.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const S = globalThis.Scattering;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.log('FAIL ' + name); } }

(async () => {
  // Registry loads
  ok('Sprites namespace exists', !!S.Sprites);
  ok('has generic_bush', S.Sprites.has('generic_bush'));
  ok('has blackberry', S.Sprites.has('blackberry'));
  ok('has elderberry', S.Sprites.has('elderberry'));
  ok('has wild_strawberry', S.Sprites.has('wild_strawberry'));
  ok('has berry_bush', S.Sprites.has('berry_bush'));

  // SVG validity: well-formed, has viewBox
  for (const id of ['generic_bush', 'blackberry', 'elderberry', 'wild_strawberry', 'berry_bush', 'generic_plant', 'generic_tree']) {
    const svg = S.Sprites.get(id);
    ok(id + ' is svg', svg && svg.includes('<svg') && svg.includes('viewBox="0 0 32 32"'));
  }

  // Chain definitions
  const bc = S.Sprites.chainFor('blackberry');
  ok('blackberry chain', JSON.stringify(bc) === JSON.stringify(['bush', 'berry_bush', 'blackberry']));
  const ec = S.Sprites.chainFor('elderberry');
  ok('elderberry chain', JSON.stringify(ec) === JSON.stringify(['bush', 'berry_bush', 'elderberry']));
  const sc = S.Sprites.chainFor('wild_strawberry');
  ok('strawberry chain', JSON.stringify(sc) === JSON.stringify(['plant', 'berry_plant', 'wild_strawberry']));

  // Depth resolution
  // depth 0 (unexamined): root sprite
  let s0 = S.Sprites.plantSprite('blackberry', 0, 'bush');
  ok('depth 0 = generic_bush', s0 && s0.includes('generic_bush') || (s0 === S.Sprites.get('generic_bush')));
  // depth 1 (examined): category sprite
  let s1 = S.Sprites.plantSprite('blackberry', 1, 'bush');
  ok('depth 1 = berry_bush', s1 === S.Sprites.get('berry_bush'));
  // depth 2 (codex): specific sprite
  let s2 = S.Sprites.plantSprite('blackberry', 2, 'bush');
  ok('depth 2 = blackberry', s2 === S.Sprites.get('blackberry'));

  // Distinctness: no two species share a sprite
  ok('blackberry != elderberry', S.Sprites.get('blackberry') !== S.Sprites.get('elderberry'));
  ok('blackberry != berry_bush', S.Sprites.get('blackberry') !== S.Sprites.get('berry_bush'));
  ok('elderberry != wild_strawberry', S.Sprites.get('elderberry') !== S.Sprites.get('wild_strawberry'));

  // Fallback: unknown pid -> root sprite
  let sf = S.Sprites.plantSprite('nonexistent_plant', 0, 'bush');
  ok('unknown pid falls back to generic_bush', sf === S.Sprites.get('generic_bush'));

  // plants.json taxon field
  await globalThis.Scattering.Game.init();
  const Game = globalThis.Scattering.Game;
  const plants = Game.data.plants || [];
  const bb = plants.find(p => p.id === 'blackberry');
  ok('blackberry has taxon in data', bb && Array.isArray(bb.taxon) && bb.taxon[2] === 'blackberry');

  console.log(pass + '/' + (pass + fail) + (fail ? ' FAILURES' : ' ALL GREEN'));
  process.exit(fail ? 1 : 0);
})();
