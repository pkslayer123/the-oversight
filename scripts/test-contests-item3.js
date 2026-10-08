// Contest eligibility depth — item 3 (Steve 2026-10-06).
// Asserts: contestEligible accepts/rejects by age, death, severed,
// missing position, player health/exile, day gate — and the return
// shape stays {eligible:[{id,name,notability,notes}], reason}.
// Also covers the siblings: fireShow pull-away and resolveContest recast
// must not pick dead/severed villagers.
// Usage: node scripts/test-contests-item3.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js',
 'src/js/carexplore.js', 'src/js/membership.js', 'src/js/contests.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label); }
}
const ids = r => (r.eligible || []).map(e => e.id);

function freshGame() {
  return Game.init().then(() => {
    Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    Game.depart();
    Game.state.scholar.day = 15;
    Game.state.systemArrived = true;
    Game.state.scholar.health = 100;
    // everyone on the roster gets a grid position
    const v = Game.state.village;
    v.positions = {};
    for (const rid of v.roster) v.positions[rid] = { mx: 4, my: 4 };
    return v.roster.slice();
  });
}

(async () => {
  const roster = await freshGame();
  const npcs = roster.filter(id => id !== Game.villagerId);
  console.log(`roster: ${roster.length} (npcs: ${npcs.length})`);

  console.log('--- day gate ---');
  Game.state.scholar.day = 10;
  let r = Game.contestEligible();
  ok(r.eligible.length === 0 && r.reason === 'Show not yet casting (day 14+)', 'day 10: nobody eligible, reason set');
  Game.state.scholar.day = 15;
  r = Game.contestEligible();
  ok(r.reason === null, 'day 15: no reason string');
  ok(ids(r).includes('player'), 'player eligible when healthy + not exiled');
  ok(r.eligible.length === roster.length, `all ${roster.length} roster members eligible at baseline`);

  console.log('--- return shape ---');
  ok(r.eligible.every(e => typeof e.id === 'string' && typeof e.name === 'string' &&
    Array.isArray(e.notability) && Array.isArray(e.notes)), 'entries have id/name/notability[]/notes[]');
  ok(Object.keys(r).sort().join(',') === 'eligible,reason', 'top-level keys unchanged');

  console.log('--- death exclusion ---');
  const dead = npcs[0];
  Game.vpOf(dead).dead = true;
  r = Game.contestEligible();
  ok(!ids(r).includes(dead), `dead villager ${dead} excluded`);
  Game.vpOf(dead).dead = false;

  console.log('--- severed exclusion ---');
  const sev = npcs[1];
  Game.state.village.severed = { [sev]: { day: 15, how: 'test' } };
  r = Game.contestEligible();
  ok(!ids(r).includes(sev), `severed villager ${sev} excluded`);
  Game.state.village.severed = {};

  console.log('--- age exclusion ---');
  const kid = npcs[2], elder = npcs[3];
  const kidVp = Game.vpOf(kid), elderVp = Game.vpOf(elder);
  const kidAge = kidVp.age, elderAge = elderVp.age;
  kidVp.age = 8; elderVp.age = 80;
  r = Game.contestEligible();
  ok(!ids(r).includes(kid), 'child (age 8) excluded');
  ok(!ids(r).includes(elder), 'elder (age 80) excluded');
  kidVp.age = kidAge; elderVp.age = elderAge;
  r = Game.contestEligible();
  ok(ids(r).includes(kid) && ids(r).includes(elder), 'adults back in after age restore');

  console.log('--- missing position exclusion ---');
  const unpos = npcs[4];
  const saved = Game.state.village.positions[unpos];
  delete Game.state.village.positions[unpos];
  r = Game.contestEligible();
  ok(!ids(r).includes(unpos), 'villager without grid position excluded');
  Game.state.village.positions[unpos] = saved;

  console.log('--- player exclusions ---');
  Game.state.scholar.health = 0;
  r = Game.contestEligible();
  ok(!ids(r).includes('player'), 'dying player (health 0) excluded');
  Game.state.scholar.health = 100;
  Game.state.scholar.exiled = true;
  r = Game.contestEligible();
  ok(!ids(r).includes('player'), 'exiled player excluded');
  Game.state.scholar.exiled = false;

  console.log('--- fireShow sibling: no dead/severed pull-aways ---');
  for (const id of npcs) { const vp = Game.vpOf(id); vp.dead = true; }
  Game.state.village.severed = Object.fromEntries(npcs.map(id => [id, { day: 15, how: 'test' }]));
  let pulledAny = false;
  const _say = Game.say.bind(Game);
  let pulledName = null;
  Game.say = function(t) {
    const m = /The cameras want ([^.]+)\./.exec(String(t));
    if (m) { pulledAny = true; pulledName = m[1]; }
    return _say(t);
  };
  for (let i = 0; i < 10; i++) Game.fireShow();
  Game.say = _say;
  for (const id of npcs) { Game.vpOf(id).dead = false; }
  Game.state.village.severed = {};
  ok(!pulledAny, `fireShow with all villagers dead/severed pulls no one (pulled: ${pulledName})`);

  console.log('--- resolveContest sibling: recast from the living ---');
  const gone = npcs[0];
  Game.vpOf(gone).dead = true;
  Game.state.pendingContest = { contestId: 'gauntlet', participant: gone, firesDay: 15, variant: null };
  Game.state.activeContest = null;
  const realRandom = Math.random; Math.random = () => 0.99; // grabbed path
  Game.resolveContest();
  Math.random = realRandom;
  const who = Game.state.activeContest && Game.state.activeContest.participant;
  const aliveOk = who && who !== gone && Game.isMember(who);
  ok(aliveOk, `recast skips dead ${gone}, televised ${who} instead`);
  Game.vpOf(gone).dead = false;

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
