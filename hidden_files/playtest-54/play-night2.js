const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('night');
  cap.log.splice(0);
  const step = (label, fn) => {
    let r = null;
    try { r = fn(); } catch (e) { cap.log.push('THROW ' + label + ': ' + e.message + '\n' + (e.stack||'').split('\n').slice(1,3).join('\n')); }
    const out = cap.log.splice(0);
    console.log('\n### ' + label + ' (' + out.length + ' lines)');
    console.log(out.slice(0, 25).join('\n').slice(0, 3000));
    return r;
  };
  step('hunt until resolved', () => {
    for (let i = 0; i < 8; i++) {
      const s = Game.state.scholar;
      if (!s.animal) { console.log('no animal (resolved after ' + i + ' attempts)'); break; }
      console.log('attempt ' + (i+1) + ': animal at ' + s.animal.mx + ',' + s.animal.my + ' aware=' + s.animal.aware + ' pstate=' + s.animal.pstate);
      Game.huntAnimal();
    }
    const s = Game.state.scholar;
    console.log('corpse:', JSON.stringify(s.corpse && {id: s.corpse.id, mx: s.corpse.mx, my: s.corpse.my}));
  });
  // loot-as-action: loot the corpse deliberately
  const s = Game.state.scholar;
  if (s.corpse) {
    step('loot corpse (deliberate action)', () => {
      console.log('loot fns:', ['lootCorpse','openCorpse','butcherCorpse'].filter(f => typeof Game[f] === 'function').join(','));
      if (Game.lootCorpse) return Game.lootCorpse();
      if (Game.butcherCorpse) return Game.butcherCorpse();
    });
  }
  step('state after hunt', () => {
    const sc = Game.state.scholar;
    console.log('kcal:', sc.kcal, 'health:', sc.health, 'inv:', (sc.inventory||[]).map(i=>i.name+':'+i.units).join(', ').slice(0,200));
  });
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
