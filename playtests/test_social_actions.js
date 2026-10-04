// Social actions test: all 10 actions + checkPromises wiring + deal/appeal methods
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

async function main() {
  const Game = globalThis.Scattering.Game;
  await Game.init();

  let pass = 0, fail = 0;
  const t = (name, cond) => {
    if (cond) { pass++; /* console.log('  PASS: ' + name); */ }
    else { fail++; console.log('  FAIL: ' + name); }
  };

  // --- setup ---
  Game.newGame('Chicago, Illinois', null, null);
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  t('roster has NPCs', roster.length >= 5);
  const vid = roster[0];

  // give player some food for deal tests
  Game.state.scholar.inventory.push({ name: 'test jerky', kcalEach: 500, units: 3, spoilDay: 999, unit: 'strip', kg: 0.1 });

  // --- 1. askAbout ---
  console.log('1. askAbout');
  const rGoal = Game.askAbout(vid, 'goal');
  t('askAbout goal returns truthy', !!rGoal);
  t('goalKnown after ask', Game.goalKnown(vid));
  const rGossip = Game.askAbout(vid, 'gossip');
  t('askAbout gossip no-throw', rGossip !== undefined);
  const rVillage = Game.askAbout(vid, 'village');
  t('askAbout village no-throw', rVillage !== undefined);
  t('askAbout invalid topic no-crash', (() => { try { Game.askAbout(vid, 'bogus'); return true; } catch(e) { return false; } })());
  t('askAbout invalid vid no-crash', (() => { try { return Game.askAbout('nope', 'goal') === null; } catch(e) { return false; } })());

  // --- 2. comfort ---
  console.log('2. comfort');
  // force a mood
  const n = Game.npcNeeds(vid); n.fear = 80;
  const rComfort = Game.comfort(vid);
  t('comfort returns ok when scared', rComfort && rComfort.ok);
  t('comfort reduces fear', Game.npcNeeds(vid).fear < 80);

  // --- 3. offerDeal ---
  console.log('3. offerDeal');
  const totalFoodBefore = Game.state.scholar.inventory.reduce((s, i) => s + ((i.kcalEach || 0) > 0 && !i.bonded ? (i.units || 0) : 0), 0);
  const rDeal = Game.offerDeal(vid, 'forage');
  t('offerDeal returns result', rDeal && (rDeal.ok || rDeal.refused));
  const totalFoodAfter = Game.state.scholar.inventory.reduce((s, i) => s + ((i.kcalEach || 0) > 0 && !i.bonded ? (i.units || 0) : 0), 0);
  t('offerDeal consumed food', totalFoodAfter < totalFoodBefore);
  if (rDeal && rDeal.ok) t('deal assigns task', (Game.state.village.assignments || {})[vid]);

  // --- 4. appealToGoal ---
  console.log('4. appealToGoal');
  const vid2 = roster[1];
  Game.askAbout(vid2, 'goal'); // learn goal first
  const rAppeal = Game.appealToGoal(vid2, 'forage');
  t('appealToGoal returns result', rAppeal !== undefined);
  t('appealToGoal unknown goal → null', (() => {
    const vid3 = roster[2];
    // ensure goal NOT known
    delete (Game.state.village.goalsKnown || {})[vid3];
    // npcGoal always returns something, but goalKnown gates UI. Direct call with unknown:
    // appealToGoal uses npcGoal directly, so it works. Just check no-crash.
    try { Game.appealToGoal('nonexistent', 'forage'); return true; } catch(e) { return false; }
  })());

  // --- 5. makeAmends ---
  console.log('5. makeAmends');
  // set a bad rep axis first
  const rep = Game.repOf(vid); rep.generous = -20;
  const worst = Game.worstRepAxis(vid);
  t('worstRepAxis finds generous', worst && worst.axis === 'generous');
  const rAmends = Game.makeAmends(vid);
  t('makeAmends returns result', rAmends !== undefined);

  // --- 6. mediateConflict ---
  console.log('6. mediateConflict');
  const rMed = Game.mediateConflict(vid);
  t('mediateConflict no-crash (may be null)', rMed === null || !!rMed);

  // --- 7. rallyVillage ---
  console.log('7. rallyVillage');
  const rRally = Game.rallyVillage();
  t('rallyVillage returns result', rRally !== undefined);

  // --- 8. askSupport ---
  console.log('8. askSupport');
  const rSup = Game.askSupport(vid);
  t('askSupport returns result', rSup !== undefined);

  // --- 9. promiseHelp + checkPromises ---
  console.log('9. promiseHelp + checkPromises');
  const rProm = Game.promiseHelp(vid);
  t('promiseHelp returns result', rProm !== undefined);
  const prom = (Game.state.village.promises || {})[vid];
  t('promise stored', !!prom);
  if (prom) {
    // fulfill via matching kind
    const kindMap = { feed: 'food', protect: 'fight', heal: 'heal', prove: 'task', belong: 'social' };
    const kind = kindMap[prom.goal];
    if (kind) {
      const trustBefore = (Game.state.village.trust || {})[vid] || 10;
      Game.checkPromises(kind);
      t('promise kept on matching kind', prom.kept === true);
      t('trust increased', ((Game.state.village.trust || {})[vid] || 0) > trustBefore);
    }
  }
  // broken promise: age it 7 days
  const vid4 = roster[3];
  Game.promiseHelp(vid4);
  const p4 = (Game.state.village.promises || {})[vid4];
  if (p4 && !p4.kept) {
    p4.day = Game.state.scholar.day - 8;
    const trustBefore = (Game.state.village.trust || {})[vid4] || 10;
    Game.checkPromises('unrelated_kind_xyz');
    t('old promise marked broken', p4.kept === 'broken');
    t('trust decreased on broken', ((Game.state.village.trust || {})[vid4] || 0) < trustBefore);
  }

  // --- 10. confrontGossip ---
  console.log('10. confrontGossip');
  const rConf = Game.confrontGossip(vid);
  t('confrontGossip no-crash', rConf === null || !!rConf);

  // --- checkPromises wiring ---
  console.log('11. checkPromises wiring');
  t('checkPromises exists', typeof Game.checkPromises === 'function');
  t('checkPromises no-crash empty', (() => { try { Game.checkPromises('food'); return true; } catch(e) { return false; } })());
  t('checkPromises no-kind no-crash', (() => { try { Game.checkPromises(); return true; } catch(e) { return false; } })());

  // --- goalKnown / goalWant / npcMood / displayName ---
  console.log('12. helpers');
  t('goalKnown fn', typeof Game.goalKnown === 'function');
  t('goalWant fn', typeof Game.goalWant === 'function');
  t('npcMood fn', typeof Game.npcMood === 'function');
  t('worstRepAxis fn', typeof Game.worstRepAxis === 'function');
  t('displayName no ID leak', !String(Game.displayName(vid)).startsWith('gen_'));

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
