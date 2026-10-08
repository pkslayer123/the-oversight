const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('exile');
  cap.log.splice(0);
  const step = (label, fn) => {
    let r = null;
    try { r = fn(); } catch (e) { cap.log.push('THROW ' + label + ': ' + e.message); }
    const out = cap.log.splice(0);
    console.log('\n### ' + label + ' (' + out.length + ' lines)');
    console.log(out.slice(0, 25).join('\n').slice(0, 3000));
    return r;
  };
  // give the player food to offer
  Game.state.scholar.inventory.push({ name: 'Dried meat', kcalEach: 400, units: 5, kg: 0.2, unit: 'strip', safe: true });
  step('petition Stonebridge + 700 kcal gift', () => Game.villageCardAction('village_1', 'petition', { giftKcal: 700 }));
  step('state', () => {
    const s = Game.state.scholar;
    console.log('exiled:', s.exiled, 'joinedVillage:', s.joinedVillage);
  });
  // if still exiled, try founding
  if (Game.state.scholar.exiled && !Game.state.scholar.joinedVillage) {
    step('found own haven', () => Game.foundHaven());
    step('after founding', () => {
      const s = Game.state.scholar;
      console.log('exiled:', s.exiled, 'drifting:', s.drifting, 'village:', Game.state.village && Game.state.village.name);
    });
  }
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
