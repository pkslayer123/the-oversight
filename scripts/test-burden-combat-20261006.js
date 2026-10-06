// Burden combat drawbacks (Steve 2026-10-06).
// "Carrying more than your pack allotment should come with drawbacks that
//  manifest inside and outside of combat."
//
// Covers:
//  1. burdenTier returns combat penalties: dodgePen and speedPen per tier.
//  2. Laden (50-75%): small dodge penalty (-0.03), no speed penalty.
//  3. Heavy (75-95%): dodge -0.08, speed -1 (initiative).
//  4. Straining (95%+): dodge -0.15, speed -2.
//  5. playerSpeed() applies the burden speed penalty (min 1).
//  6. tbDamage dodge calculation subtracts the burden dodge penalty.
// Usage: node scripts/test-burden-combat-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/betrayal.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const S = globalThis.Scattering;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

const bt = S.calories.burdenTier;

// 1. Tier definitions carry combat penalties
const light = bt(5, 20);
ok('light: no dodge penalty', light.dodgePen === 0, JSON.stringify(light));
ok('light: no speed penalty', light.speedPen === 0);

const laden = bt(12, 20); // 60%
ok('laden tier name', laden.name === 'laden', laden.name);
ok('laden: dodge -0.03', laden.dodgePen === 0.03, String(laden.dodgePen));
ok('laden: no speed penalty', laden.speedPen === 0);

const heavy = bt(17, 20); // 85%
ok('heavy tier name', heavy.name === 'heavy', heavy.name);
ok('heavy: dodge -0.08', heavy.dodgePen === 0.08, String(heavy.dodgePen));
ok('heavy: speed -1', heavy.speedPen === 1);

const straining = bt(19.5, 20); // 97.5%
ok('straining tier name', straining.name === 'straining', straining.name);
ok('straining: dodge -0.15', straining.dodgePen === 0.15, String(straining.dodgePen));
ok('straining: speed -2', straining.speedPen === 2);

// 2. Penalties scale monotonically
ok('dodge penalty scales', light.dodgePen < laden.dodgePen && laden.dodgePen < heavy.dodgePen && heavy.dodgePen < straining.dodgePen);
ok('speed penalty scales', light.speedPen <= laden.speedPen && laden.speedPen <= heavy.speedPen && heavy.speedPen <= straining.speedPen);

// 3. playerSpeed applies burden
(async () => {
await Game.init();
Game.genRoster('Columbus, Ohio');
Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
const scholar = () => Game.state.scholar;

// Light load: speed 3
scholar().inventory = [{ itemId: 'test', units: 1, kg: 2 }];
scholar().water = [];
ok('light load: playerSpeed 3', Game.playerSpeed() === 3, String(Game.playerSpeed()));

// Heavy load: need 75-95% of capacity. Capacity base 20.
scholar().inventory = [{ itemId: 'test', units: 1, kg: 17 }];
const w = Game.packWeight(), cap = Game.packCapacity();
console.log(`  (heavy test: weight=${w.toFixed(1)}kg cap=${cap}kg frac=${(w/cap).toFixed(2)})`);
ok('heavy load: playerSpeed 2', Game.playerSpeed() === 2, String(Game.playerSpeed()));

// Straining load: 95%+
scholar().inventory = [{ itemId: 'test', units: 1, kg: 19.5 }];
ok('straining load: playerSpeed 1', Game.playerSpeed() === 1, String(Game.playerSpeed()));

// 4. Dodge penalty is wired into tbDamage (source check)
const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
ok('tbDamage subtracts burden dodgePen', src.includes('burdenTier') && src.includes('dodgePen'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
