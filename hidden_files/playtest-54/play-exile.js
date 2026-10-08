const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('exile');
  cap.log.splice(0);
  const step = (label, fn) => {
    let r = null;
    try { r = fn(); } catch (e) { cap.log.push('THROW ' + label + ': ' + e.message + '\n' + (e.stack||'').split('\n').slice(1,3).join('\n')); }
    const out = cap.log.splice(0);
    console.log('\n### ' + label + ' (' + out.length + ' lines)');
    console.log(out.slice(0, 25).join('\n').slice(0, 3200));
    return r;
  };
  step('exile state', () => {
    const s = Game.state.scholar;
    console.log('exiled:', s.exiled, 'drifting:', s.drifting, 'insideHaven:', s.insideHaven);
    const ov = Game.state.otherVillages || [];
    console.log('other villages:', ov.map(v => v.id + ':' + v.name + ' pop' + v.population).join(' | ') || 'NONE');
    return ov[0] && ov[0].id;
  });
  const vid = (Game.state.otherVillages || [])[0] && Game.state.otherVillages[0].id;
  if (vid) {
    step('village card', () => {
      const card = Game.villageCard(vid);
      console.log('card:', card.name, '|', card.sub);
      console.log('ACTIONS:', (card.actions||[]).map(a => a.id + ': ' + a.label).join(' | '));
    });
    step('petition', () => Game.villageCardAction(vid, 'petition', {}));
    step('after petition', () => {
      const s = Game.state.scholar;
      console.log('exiled:', s.exiled, 'joinedVillage:', s.joinedVillage, 'drifting:', s.drifting);
    });
  }
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
