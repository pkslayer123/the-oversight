const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('keepsake');
  cap.log.splice(0);
  const step = (label, fn) => {
    let r = null;
    try { r = fn(); } catch (e) { cap.log.push('THROW ' + label + ': ' + e.message); }
    const out = cap.log.splice(0);
    console.log('\n### ' + label + ' (' + out.length + ' lines)');
    console.log(out.slice(0, 25).join('\n').slice(0, 3000));
    return r;
  };
  step('channel the ring (idx 0)', () => {
    const inv = Game.state.scholar.inventory;
    const idx = inv.findIndex(i => i.itemId === 'mothers_ring');
    console.log('ring idx:', idx, 'sentimentTaught:', Game.progState().sentimentTaught);
    return Game.channelSentiment(idx);
  });
  step('channel again same day', () => {
    const idx = Game.state.scholar.inventory.findIndex(i => i.itemId === 'mothers_ring');
    return Game.channelSentiment(idx);
  });
  step('channel with trauma', () => {
    Game.state.scholar.trauma = 20;
    Game.state.scholar.day = (Game.state.scholar.day || 1) + 1; // next day
    const idx = Game.state.scholar.inventory.findIndex(i => i.itemId === 'mothers_ring');
    console.log('trauma before:', Game.state.scholar.trauma);
    const r = Game.channelSentiment(idx);
    console.log('trauma after:', Game.state.scholar.trauma);
    return r;
  });
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
