// Hunter combat feel: monster on grid at night, played as a player.
// Reads the actual narrative text: telegraphs, tactical readouts, kill/loot.
// Usage: node scripts/play-hunter-combat-feel.js
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
function say(tag) { const l = Game.log.join('\n'); Game.log.length = 0; console.log('--- ' + tag + ' ---'); console.log(l || '(silence)'); }

(async () => {
  await Game.init();
  Game.debugScenario('hushpuppy');
  say('SCENARIO SETUP');
  const s = Game.state.scholar;
  console.log(`systemArrived=${!!Game.state.systemArrived} monsterEntry=${JSON.stringify((Game.ensureMonsterEntry && Game.ensureMonsterEntry('hushwolf')) || null)}`);

  Game.startCombat('hushwolf');
  say('COMBAT OPEN (first-contact dread?)');

  // play rounds as a player: strike nearest wolf, end turn
  for (let r = 0; r < 8 && Game.tbfight && !Game.tbfight.over; r++) {
    try {
      if (!Game.tbIsPlayerTurn()) Game.tbAdvance();
      if (Game.tbIsPlayerTurn()) {
        const f = Game.tbfight;
        const wolf = f.fighters.find(x => x.kind === 'monster' && !x.dead);
        // move adjacent if needed then strike
        if (wolf) {
          const dx = wolf.mx - s.mx, dy = wolf.my - s.my;
          if (Math.max(Math.abs(dx), Math.abs(dy)) > 2) {
            Game.tbPlayerMove(s.mx + Math.sign(dx), s.my + Math.sign(dy));
          }
          Game.tbPlayerStrike(wolf.key);
        }
        Game.tbPlayerEndTurn();
      } else { Game.tbAdvance(); }
      say('ROUND ' + (r + 1));
    } catch (e) { console.log('ERR round ' + r + ': ' + e.message); break; }
  }
  console.log('tbfight over:', !!(Game.tbfight && Game.tbfight.over));
  say('KILL / LOOT TEXT');
})();
