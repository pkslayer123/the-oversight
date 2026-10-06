// REPRO: unknown-villager descriptor collisions.
// With names unearned, displayName/personDescriptor reduce to pro + age band,
// so two villagers routinely share "A woman, maybe 30s" and the player can't
// tell the theft victim from the moot voter from the person they just beat up.
// Usage: node scripts/repro-brawler-descriptor-collisions.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js', 'src/js/game.js',
 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

(async () => {
  await Game.init();
  let runsWithCollision = 0;
  const N = 30;
  for (let i = 0; i < N; i++) {
    Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    Game.depart();
    const ids = Game.state.village.roster.filter(id => id !== Game.villagerId);
    const labels = ids.map(id => Game.personDescriptor(id));
    const dupes = labels.filter((l, k) => labels.indexOf(l) !== k);
    if (dupes.length) {
      runsWithCollision++;
      if (runsWithCollision <= 3) {
        console.log(`run ${i}: ${labels.length} villagers, labels: ${JSON.stringify(labels)}`);
      }
    }
  }
  console.log(`\ncollisions in ${runsWithCollision}/${N} runs`);
  process.exit(runsWithCollision ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(2); });
