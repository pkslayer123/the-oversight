const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  await Game.init();
  Game.debugScenario('mantle');
  const vid = Game.villagerId;
  const person = Game.getPerson(vid) || {};
  console.log('villagerId:', vid);
  console.log('person.name:', person.name, '| person.id:', person.id);
  console.log('displayName:', Game.displayName(vid));
  console.log('scholar.name:', Game.state.scholar.name);
  console.log('npcName:', Game.npcName(vid));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
