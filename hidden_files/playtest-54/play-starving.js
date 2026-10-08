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
    console.log(out.slice(0, 25).join('\n').slice(0, 3200));
    return r;
  };
  step('pantry state', () => {
    console.log('pantry:', JSON.stringify(Game.state.village.pantry));
    console.log('pantryKcal:', Game.pantryKcal ? Game.pantryKcal() : 'n/a');
  });
  const trustBefore = Object.assign({}, Game.state.village.trust);
  step('take food from pantry', () => {
    // app.js uses Game.takeFromPantryBulk(sel); try single-item take first
    if (Game.takePantryItem) return Game.takePantryItem(0, 1);
    return Game.takeFromPantryBulk({ 0: 2 });
  });
  step('consequences', () => {
    const v = Game.state.village;
    const changed = Object.keys(v.trust || {}).filter(k => v.trust[k] !== trustBefore[k]);
    console.log('trust changed for:', changed.map(k => Game.displayName(k) + ':' + trustBefore[k] + '->' + v.trust[k]).join('; ') || 'NONE');
    console.log('scholar kcal:', Game.state.scholar.kcal);
  });
  // talk to a villager about the food situation
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  step('talk to villager about hunger', () => {
    Game.startConvo(roster[0]);
    const ch = Game.convoChoices(roster[0]) || [];
    console.log('CHOICES:', ch.slice(0,10).map(x=>x.id).join(', '));
  });
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
