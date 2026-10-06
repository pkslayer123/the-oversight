// test-min-liar-guarantee.js: every village has at least one liar (detective loop).
// The 0.20 base liar rate leaves ~5% of villages with zero liars — a dead
// detective loop. truth.js wraps newGame to guarantee one (never the player),
// using the normal genLies machinery.
// Usage: node scripts/test-min-liar-guarantee.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', label); } };
const liarIds = () => Game.state.village.roster
  .filter(id => id !== Game.villagerId)
  .filter(id => { const l = Game.npcLies(id); return l && Object.values(l).some(x => x && x.told); });
const validShape = (id) => {
  const l = Game.npcLies(id);
  return Object.values(l).filter(x => x && x.told).every(x =>
    x.told && x.truth && x.motive && x.field && ['occupation', 'origin', 'goal'].includes(x.field));
};
const seedRand = (sd) => { let s = sd; Math.random = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; };

(async () => {
  // --- A. forced path: eager pass rolls all-honest; the force loop must fix it ---
  seedRand(42);
  await Game.init();
  const realGenLies = Game.genLies.bind(Game);
  const seen = {};
  Game.genLies = (vp) => {
    seen[vp.id] = (seen[vp.id] || 0) + 1;
    if (seen[vp.id] === 1) return {}; // eager pass: everyone honest
    // force-loop re-roll: deterministic liar via the real shape
    return { occupation: { told: 'locksmith', truth: vp.formerOccupation || 'cook', motive: 'shame', field: 'occupation' } };
  };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.genLies = realGenLies;
  const forced = liarIds();
  ok(Object.values(seen).some(n => n > 1), 'A: force loop re-rolled genLies for a villager');
  ok(forced.length >= 1, `A: guaranteed liar exists (got ${forced.length})`);
  ok(!forced.includes(Game.villagerId), 'A: forced liar is never the player');
  ok(forced.every(validShape), 'A: forced lie has valid shape');

  // --- B. natural sweep: 30 seeds, every village has >=1 NPC liar ---
  let minLiars = Infinity, totalLiars = 0;
  for (let seed = 1; seed <= 30; seed++) {
    seedRand(seed * 7919);
    await Game.init();
    Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    const liars = liarIds();
    minLiars = Math.min(minLiars, liars.length);
    totalLiars += liars.length;
    ok(liars.length >= 1, `B: seed ${seed} has >=1 NPC liar (got ${liars.length})`);
    ok(!liars.includes(Game.villagerId), `B: seed ${seed} player is not the liar`);
    ok(liars.every(validShape), `B: seed ${seed} all lies have valid shape`);
  }
  console.log(`B: min liars/village=${minLiars}, mean=${(totalLiars / 30).toFixed(2)}`);
  ok(minLiars >= 1, 'B: no zero-liar villages across 30 seeds');

  // --- C. the previously-dead seed (9) now has a liar ---
  seedRand(9);
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const liars9 = liarIds();
  ok(liars9.length >= 1, `C: seed 9 (previously 0 liars) now has ${liars9.length}`);
  if (liars9.length) {
    const l = Game.npcLies(liars9[0]);
    const first = Object.values(l).find(x => x && x.told);
    console.log(`C: liar ${Game.displayName(liars9[0])}: ${first.field} "${first.told}" (true: ${first.truth}, ${first.motive})`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
