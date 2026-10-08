const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('starving');
  cap.log.splice(0);
  const step = (label, fn) => {
    let r = null;
    try { r = fn(); } catch (e) { cap.log.push('THROW ' + label + ': ' + e.message); }
    const out = cap.log.splice(0);
    console.log('\n### ' + label + ' (' + out.length + ' lines)');
    console.log(out.slice(0, 20).join('\n').slice(0, 2800));
    return r;
  };
  const trustBefore = Object.assign({}, Game.state.village.trust);
  // take nearly everything: 6 soup + 3 meat = 2700 kcal
  step('take everything', () => Game.takeFromPantryBulk({ 0: 6, 1: 3 }));
  step('consequences', () => {
    const v = Game.state.village;
    const me = Game.state.scholar.villagerId;
    console.log('takes[me]:', v.takes && v.takes[me], 'trust[me]:', trustBefore[me], '->', v.trust[me]);
    console.log('pantry now:', JSON.stringify(v.pantry.map(p=>p.name+':'+p.units)));
  });
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
