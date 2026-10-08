const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('night');
  cap.log.splice(0);
  const step = (label, fn) => {
    let r = null;
    try { r = fn(); } catch (e) { cap.log.push('THROW ' + label + ': ' + e.message); }
    const out = cap.log.splice(0);
    console.log('\n### ' + label + ' (' + out.length + ' lines)');
    console.log(out.slice(0, 25).join('\n').slice(0, 3000));
    return r;
  };
  step('close in and hunt', () => {
    for (let i = 0; i < 12; i++) {
      const s = Game.state.scholar;
      if (!s.animal) { console.log('animal gone after ' + i); break; }
      // walk adjacent (interior tiles only)
      const a = s.animal;
      s.mx = Math.max(1, Math.min(7, a.mx - 1)); s.my = Math.max(1, Math.min(7, a.my));
      a.aware = 0; a.pstate = 'graze'; // calm it: test the strike, not the stalk
      Game.huntAnimal();
      if (s.corpse) { console.log('KILL on attempt ' + (i+1)); break; }
    }
    console.log('corpse:', JSON.stringify(Game.state.scholar.corpse && {id: Game.state.scholar.corpse.id}));
  });
  step('loot the corpse (loot as action)', () => {
    const fns = ['lootCorpse','butcherCorpse','searchCorpse','openCorpse'].filter(f => typeof Game[f] === 'function');
    console.log('available loot fns:', fns.join(','));
    for (const f of fns) { try { const r = Game[f](); console.log(f, '->', JSON.stringify(r).slice(0,200)); } catch(e){ console.log(f,'THROW',e.message); } }
  });
  step('aftermath state', () => {
    const sc = Game.state.scholar;
    console.log('inv food:', (sc.inventory||[]).filter(i=>/meat|fox/i.test(i.name)).map(i=>i.name+':'+i.units+(i.rawKcal?'(raw)':'')).join(', ') || 'NONE');
  });
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
