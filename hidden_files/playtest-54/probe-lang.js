const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  await Game.init();
  Game.debugScenario('language');
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const vid = roster[0];
  const person = Game.getPerson(vid) || {};
  console.log('person.languages:', JSON.stringify(person.languages));
  console.log('bgLangs[vid]:', JSON.stringify(Game.state.village.bgLangs[vid]));
  console.log('npcLangs:', JSON.stringify(Game.npcLangs(vid)));
  console.log('commLevel:', JSON.stringify(Game.commLevel(vid)));
  console.log('scholar languages:', JSON.stringify(Game.state.scholar.languages), 'englishLevel:', Game.state.scholar.englishLevel);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
