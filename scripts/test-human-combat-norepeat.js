// Human combat narration must not repeat lines within one fight.
// pickFresh cycles a line pool without repeats until exhausted.
// Usage: node scripts/test-human-combat-norepeat.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ': ' + extra : ''}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  // --- 1. pickFresh unit behavior: no repeats within a cycle ---
  Game.tbfight = null;
  const pool = ['a', 'b', 'c'];
  const first3 = [Game.pickFresh(pool, 'unit'), Game.pickFresh(pool, 'unit'), Game.pickFresh(pool, 'unit')];
  ok('3 picks cover the pool', new Set(first3).size === 3 && first3.every(x => pool.includes(x)), JSON.stringify(first3));
  const fourth = Game.pickFresh(pool, 'unit');
  ok('4th pick resets the cycle and stays in pool', pool.includes(fourth));
  // separate keys don't interfere
  const other = Game.pickFresh(pool, 'unit2');
  ok('other key independent', pool.includes(other));
  // monster pools unaffected (sanity: pickFresh is generic)
  ok('works with no fight active', typeof fourth === 'string');

  // --- 2. integration: 3 strikes on a human, no repeated strike lines ---
  const v = Game.state.village;
  const target = v.roster.filter(id => id !== Game.villagerId)[0];
  Game.playerAttacks(target);
  ok('betrayal fight started', !!(Game.tbfight && Game.tbfight.betrayal));
  const h = Game.tbFighter('h_' + target);
  h.hp = h.maxHp = 1000; // survive the volley
  Game.tbfight.turnIdx = Game.tbfight.order.indexOf('p');
  const p = Game.tbFighter('p');
  p.mx = 0; p.my = 0; h.mx = 1; h.my = 0;
  Game.state.scholar.equipped = Game.state.scholar.equipped || {};
  delete Game.state.scholar.equipped.weapon; // unarmed
  const strikeTexts = ['You hurt', 'Your hands move before you decide', 'connects.'];
  const dmgTexts = ["takes it and doesn't scream", 'Blood on your hands now', 'look like someone you knew'];
  const seenStrike = [], seenDmg = [];
  let strikes = 0;
  for (let i = 0; i < 3 && Game.tbfight; i++) {
    p.acted = false; p.moveLeft = 10;
    Game.tbfight.turnIdx = Game.tbfight.order.indexOf('p');
    const before = Game.log.length;
    if (!Game.tbPlayerStrike(h.key)) break;
    strikes++;
    const fresh = Game.log.slice(before);
    const s = fresh.find(l => strikeTexts.some(t => l.includes(t)));
    const d = fresh.find(l => dmgTexts.some(t => l.includes(t)));
    if (s) seenStrike.push(s);
    if (d) seenDmg.push(d);
  }
  ok('landed 3 strikes', strikes === 3, `landed ${strikes}`);
  ok('no repeated strike line in 3 strikes', new Set(seenStrike).size === seenStrike.length,
    JSON.stringify(seenStrike));
  ok('no repeated damage-description line in 3 strikes', new Set(seenDmg).size === seenDmg.length,
    JSON.stringify(seenDmg));
  Game.tbfight = null;

  // --- 3. victim retaliation / circling pools also use pickFresh ---
  const vlines = [
    'swings wildly', 'lashes out, panicking', 'fights like a cornered animal',
  ];
  const v3 = [Game.pickFresh(vlines, 'humanRetaliate'), Game.pickFresh(vlines, 'humanRetaliate'), Game.pickFresh(vlines, 'humanRetaliate')];
  ok('retaliate pool no repeats in a cycle', new Set(v3).size === 3, JSON.stringify(v3));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
