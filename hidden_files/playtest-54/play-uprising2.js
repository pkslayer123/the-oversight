const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('uprising');
  cap.log.splice(0);
  const step = (label, fn) => {
    let r = null;
    try { r = fn(); } catch (e) { cap.log.push('THROW ' + label + ': ' + e.message); }
    const out = cap.log.splice(0);
    console.log('\n### ' + label + ' (' + out.length + ' lines)');
    console.log(out.slice(0, 20).join('\n').slice(0, 2800));
    return r;
  };
  // give the player a real weapon so victory is achievable
  step('arm player', () => {
    Game.state.scholar.inventory.push({ name: 'Fire-hardened spear', itemId: 'fire_hardened_spear', units: 1, kg: 1 });
    Game.state.scholar.health = 160;
    const p = Game.tbFighter('p'); p.hp = 160; p.maxHp = 160;
    console.log('equipped:', Game.equippedWeapon() && Game.equippedWeapon().name);
  });
  // advance to player turn, then TALK
  step('TALK on player turn (beg)', () => {
    let n = 0;
    while (!Game.tbIsPlayerTurn() && Game.tbfight && !Game.tbfight.over && n++ < 20) Game.tbAdvance();
    console.log('player turn reached:', Game.tbIsPlayerTurn());
    const hk = Game.tbfight.fighters.find(f => f.kind === 'hostile' && f.alive && !f.fled).key;
    const r = Game.tbPlayerTalk(hk, 'beg');
    console.log('talk returned:', r);
  });
  step('FIGHT to conclusion', () => {
    let n = 0;
    while (Game.tbfight && !Game.tbfight.over && n++ < 150) {
      const tf = Game.tbfight;
      const cur = tf.order[tf.turnIdx % tf.order.length];
      const me = tf.fighters.find(f => f.key === 'p');
      if (!me || !me.alive) { console.log('player down'); break; }
      if (cur === 'p' && !me.acted) {
        const foe = tf.fighters.find(f => f.kind === 'hostile' && f.alive && !f.fled);
        if (!foe) { Game.tbAdvance(); continue; }
        Game.tbPlayerStrike(foe.key);
      } else Game.tbAdvance();
    }
    console.log('rounds:', n, 'fight:', !!Game.tbfight, 'result:', Game.tbfight && Game.tbfight.result,
      'php:', Game.state.scholar.health, 'over:', Game.state.over);
  });
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
