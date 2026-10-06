// Broken-pack bark rotation (2026-10-06): a hushwolf whose nerve broke used to
// print "Yipping, ... circles wide — the pack's nerve is gone." verbatim every
// broken turn — six identical lines in one playtest fight. The bark now rotates
// through 3 variants per wolf.
// Usage: node scripts/test-wolf-yip-rotation.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.log('FAIL ' + name); } }
function says() { const l = Game.log.slice(); Game.log.length = 0; return l; }

(async () => {
  await Game.init();
  Game.debugScenario('hushpuppy');
  says();
  const s = Game.state.scholar;
  Game.startCombat('hushwolf');
  says();
  const f = Game.tbfight;
  const wolf = f.fighters.find(x => x.kind === 'monster');
  ok('wolf fighter exists', !!wolf);
  // break the pack's nerve the way wounding the lead does
  wolf.wolfBroken = true;
  // force the broken branch every turn (Math.random < 0.5 gate)
  const realRandom = Math.random;
  Math.random = () => 0.1;
  const barks = [];
  for (let i = 0; i < 6; i++) {
    Game.log.length = 0;
    try { Game.tbMonsterTurn(wolf); } catch (e) { console.log('tbMonsterTurn err: ' + e.message); break; }
    const lines = says();
    const bark = lines.find(l => /circles wide|skirts the edge|feints in/i.test(l));
    if (bark) barks.push(bark);
  }
  Math.random = realRandom;
  ok('broken branch produced barks', barks.length >= 3);
  const uniq = new Set(barks);
  ok('barks rotate (no verbatim repeat across 6 broken turns)', uniq.size >= 2);
  const allThree = ['circles wide', 'skirts the edge', 'feints in'];
  const seen = allThree.filter(t => barks.some(b => b.includes(t)));
  ok('rotation cycles through variants', seen.length >= 2);
  console.log(`barks seen (${barks.length}): ${uniq.size} unique`);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
