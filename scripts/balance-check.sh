#!/bin/bash
# Quick balance check: runs sim, reports vs targets
echo "=== BALANCE CHECK ==="
echo "Targets: greedy 20-40% win, 12-18 days, village shortfall 800-1200/day"
echo ""
timeout 120 node scripts/simulate.js 30 2>&1 | grep -E "GREEDY|RANDOM|win rate"
echo ""
echo "Village shortfall (3 samples):"
node -e "
const fs = require('fs'), path = require('path');
const ROOT = process.cwd();
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js','src/js/engine/modifiers.js','src/js/engine/calories.js','src/js/engine/day.js','src/js/engine/forage.js','src/js/engine/combat.js','src/js/game.js'].forEach(f => eval(fs.readFileSync(f, 'utf8')));
const Game = globalThis.Scattering.Game;
(async () => {
  await Game.init();
  for (let i = 0; i < 3; i++) {
    Game.newGame('ohio', 'mara_okafor');
    Game.villageEats();
    const v = Game.state.village;
    console.log('  need ' + v.lastEat + ', bring ' + v.lastGive + ', shortfall ' + (v.lastEat - v.lastGive));
  }
})();
"
