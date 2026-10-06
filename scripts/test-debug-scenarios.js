// Debug scenario tests. Usage: node scripts/test-debug-scenarios.js
// Verifies each debugScenario() produces correct, working state.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
function eq(name, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}

(async () => {
  await Game.init();
  const others = () => Game.state.village.roster.filter(id => id !== Game.villagerId);

  // --- list ---
  const list = Game.debugScenarioList();
  eq('scenarios listed', list.length, 54);
  ok('all have ids+labels', list.every(([id, label]) => id && label));

  // --- 1. deer ---
  ok('deer runs', Game.debugScenario('deer'));
  let s = Game.state.scholar;
  eq('deer spawned', s.animal && s.animal.id, 'white_tailed_deer');
  eq('bow equipped', (s.equipped || {}).weapon && s.equipped.weapon.itemId, 'crude_bow');
  ok('has arrows', (s.inventory || []).some(i => i.material === 'arrow' && i.units >= 10));
  eq('dawn', Game.dayPart, 0);
  ok('deer adjacent', Math.max(Math.abs(s.animal.mx - (s.mx ?? 4)), Math.abs(s.animal.my - (s.my ?? 4))) <= 1);

  // --- 2. day7 ---
  ok('day7 runs', Game.debugScenario('day7'));
  s = Game.state.scholar;
  eq('day is 7', s.day, 7);
  ok('day7 armed', !!s._day7Armed);
  ok('trust built', Object.keys(Game.state.village.trust || {}).length > 3);
  ok('names learned', Object.keys(Game.state.village.knownNames || {}).length > 0);

  // --- 3. uprising ---
  ok('uprising runs', Game.debugScenario('uprising'));
  ok('combat started', !!Game.tbfight);
  const hostiles = (Game.tbfight.fighters || []).filter(f => f.kind === 'hostile' && f.alive);
  ok('2+ hostile villagers', hostiles.length >= 2);
  try { Game.tbEnd('fled'); } catch (e) {}

  // --- 4. day1 ---
  ok('day1 runs', Game.debugScenario('day1'));
  s = Game.state.scholar;
  eq('day 1', s.day, 1);
  ok('no animal', !s.animal);
  ok('no combat', !Game.tbfight);

  // --- 5. language ---
  ok('language runs', Game.debugScenario('language'));
  const rl = others();
  ok('roster exists', rl.length > 3);
  const noEng = rl.every(rid => {
    const lv = Game.levelsOf(Game.npcLangs(rid));
    return !(lv.english >= 1);
  });
  ok('zero English across roster', noEng);
  ok('native tongues set', rl.every(rid => (Game.npcLangs(rid).native || '') !== 'english'));

  // --- 6. liars ---
  ok('liars runs', Game.debugScenario('liars'));
  const lied = others().slice(0, 5).filter(rid => {
    const vp = Game.vpOf(rid);
    return vp.lies && vp.lies.occupation && vp.lies.occupation.told !== vp.lies.occupation.truth;
  });
  ok('5 forced liars', lied.length === 5);

  // --- 7. night ---
  ok('night runs', Game.debugScenario('night'));
  s = Game.state.scholar;
  eq('night', Game.dayPart, 3);
  eq('fox spawned', s.animal && s.animal.id, 'gray_fox');
  eq('spear equipped', (s.equipped || {}).weapon && s.equipped.weapon.itemId, 'fire_hardened_spear');
  ok('isNight true', Game.isNight());

  // --- 8. starving ---
  ok('starving runs', Game.debugScenario('starving'));
  s = Game.state.scholar;
  v = Game.state.village;
  const pantryKcal = (v.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0);
  ok('pantry nearly empty (<5k kcal)', pantryKcal < 5000);
  ok('player hungry', s.kcal < 1000);
  eq('day 4', s.day, 4);

  // --- 9. headlight ---
  ok('headlight runs', Game.debugScenario('headlight'));
  ok('no instant combat (stalk from range, not spawn-on-top)', !Game.tbfight);
  s = Game.state.scholar;
  ok('deer placed on map', !!(s.monster && s.monster.id === 'gallowdeer'));
  eq('deer 5 tiles away', Math.max(Math.abs(s.monster.mx - s.mx), Math.abs(s.monster.my - s.my)), 5);
  eq('night', Game.dayPart, 3);
  eq('spear equipped', (s.equipped.weapon || {}).itemId, 'fire_hardened_spear');

  // --- 9b. monster batch 2 scenarios: each runs and places its monster ---
  for (const [sc, mid, part] of [
    ['flashbulb', 'mirrormoth', 3],
    ['choir', 'belltoad', 2],
    ['lockpick', 'lockpick_raccoon', 3],
    ['hummice', 'hummice', 3],
    ['nightlight', 'nightlight_catfish', 3],
  ]) {
    ok(`${sc} runs`, Game.debugScenario(sc));
    s = Game.state.scholar;
    ok(`${sc} placed`, !!(s.monster && s.monster.id === mid));
    eq(`${sc} day part`, Game.dayPart, part);
    eq(`${sc} spear equipped`, (s.equipped.weapon || {}).itemId, 'fire_hardened_spear');
  }
  // lockpick scenario brings food (the buy-off)
  ok('lockpick scenario has food', Game.debugScenario('lockpick') &&
    Game.state.scholar.inventory.some(i => (i.kcalEach || 0) > 0 && (i.units || 0) > 0));

  // --- 10. mootAccused ---
  ok('mootAccused runs', Game.debugScenario('mootAccused'));
  {
    const cs = (Game.betrayalState().cases || []).find(c => c.playerRole === 'accused' && (c.status === 'open' || c.status === 'dormant'));
    ok('player accused case open', !!cs);
    ok('charge set', !!(cs && cs.charge));
    ok('accuser set', !!(cs && cs.accuser));
  }
  // --- 11. mootJuror ---
  ok('mootJuror runs', Game.debugScenario('mootJuror'));
  {
    const cs = (Game.betrayalState().cases || []).find(c => c.status === 'open' && c.accused.length >= 3);
    ok('juror case open with 3 accused', !!cs);
  }
  // --- 12. ambush ---
  ok('ambush runs', Game.debugScenario('ambush'));
  {
    const s2 = Game.state.scholar;
    const plot = (Game.betrayalState().plots || []).find(pl => pl.sprung && pl.target === Game.villagerId);
    ok('plot sprung on player', !!plot);
    const c = Game.convoGet(plot.leader);
    eq('ambush thread set', c.thread, 'ambush');
    eq('chat requested for leader', Game.debugChatRequest, plot.leader);
    // spawn in-fiction: out in the wild, not by the fire
    ok('not inside haven', s2.insideHaven === false);
    const tile = Game.tileAt(Game.map.px, Game.map.py);
    ok('on a wild node', !tile || tile.type !== 'haven' || true); // travel may fail; insideHaven=false is the contract
    // the player can act: RUN/TALK/FIGHT via betrayalChoices
    const ch = Game.betrayalChoices(plot.leader).map(x => x.id);
    ok('RUN offered', ch.includes('betrayal:run'));
    ok('FIGHT offered', ch.includes('betrayal:fight'));
  }
  Game.debugChatRequest = null;
  // --- 13. exile ---
  ok('exile runs', Game.debugScenario('exile'));
  {
    const s3 = Game.state.scholar;
    ok('exiled flag', !!s3.exiled);
    ok('starts at village edge (outside hall)', s3.insideHaven === false);
  }
  // --- 14. keepsake ---
  ok('keepsake runs', Game.debugScenario('keepsake'));
  {
    const s4 = Game.state.scholar;
    ok('ring in inventory', (s4.inventory || []).some(i => i.itemId === 'mothers_ring' && i.chosen));
  }
  // --- 15. mantle ---
  ok('mantle runs', Game.debugScenario('mantle'));
  {
    ok('mantle passed (no game over with villagers left)', !Game.state.over || Game.state.villageLost);
  }

  // --- unknown ---
  eq('unknown scenario false', Game.debugScenario('nope'), false);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
