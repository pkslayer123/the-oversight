// Truth-line dedupe: two villagers in one game never speak the same confrontation line.
// Regression test for the verbatim repeat found by the detective playtest loop
// (two "shame" confessions used the exact same sentence on consecutive days).
// Usage: node scripts/test-truth-line-dedupe.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
Game.say = function () {};

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);

  const vids = Game.state.village.roster.filter(id => id !== Game.villagerId);
  const pools = Object.keys(Game.truthLinePools);

  // 1. Within one pool, drawing across MANY villagers: first full cycle is all unique.
  for (const key of pools) {
    const n = Game.truthLinePools[key].length;
    Game.state.truthLineUsed = {}; // fresh
    const seen = new Set();
    let v = 0;
    for (let i = 0; i < n; i++) {
      seen.add(Game.drawTruthLine(key, vids[v++ % vids.length], { truth: 'A', told: 'B' }));
    }
    ok(`${key}: first ${n} draws across villagers all unique`, seen.size === n);
  }

  // 2. Same villager twice in a row still can't repeat when fresh lines remain.
  Game.state.truthLineUsed = {};
  const a = Game.drawTruthLine('motiveShame', vids[0]);
  const b = Game.drawTruthLine('motiveShame', vids[0]);
  ok('motiveShame: consecutive draws to same villager differ', a !== b);

  // 3. After the pool is exhausted, it recycles (game doesn't break on long runs).
  Game.state.truthLineUsed = {};
  const n = Game.truthLinePools.motiveShame.length;
  for (let i = 0; i < n; i++) Game.drawTruthLine('motiveShame', vids[i % vids.length]);
  const recycled = Game.drawTruthLine('motiveShame', vids[0]);
  ok('motiveShame: pool recycles after exhaustion without crash', typeof recycled === 'string' && recycled.length > 0);

  // 4. No state at all (pre-game / fallback): still no crash, still no same-villager repeat.
  const saved = Game.state;
  Game.state = null;
  const c = Game.drawTruthLine('attacks', 'nobody', { first: 'Nobody' });
  const d = Game.drawTruthLine('attacks', 'nobody', { first: 'Nobody' });
  Game.state = saved;
  ok('drawTruthLine works with null state and avoids consecutive repeats', typeof c === 'string' && c !== d);

  // 5. Stale doubts: confronting a doubt whose lie was already confessed
  // does NOT produce a second confession of the same lie.
  const svid = vids.find(id => id !== vids[0]) || vids[0];
  const svp = Game.vpOf(svid);
  svp.lies = { origin: { told: 'Denver', truth: 'Columbus, Ohio', motive: 'hiding', field: 'origin', confessed: false } };
  (Game.state.village.trust = Game.state.village.trust || {})[svid] = 100; // high trust → confession likely
  const origRandom = Math.random;
  const doubt1 = Game.addDoubt(svid, 'observation', 'something about origin does not add up',
    ['claimed "Denver"', 'observed: mentioned Columbus, Ohio like home']);
  Math.random = () => 0.01; // force the confession roll to succeed
  const r1 = Game.confrontDoubt(svid, doubt1.id);
  Math.random = origRandom;
  ok('first confrontation confesses the lie', r1 && r1.outcome === 'confessed');
  const doubt2 = Game.addDoubt(svid, 'gossip', 'heard their origin story does not hold',
    ['claimed "Denver"', 'gossip said they are not from Denver']);
  const r2 = Game.confrontDoubt(svid, doubt2.id);
  ok('second confrontation on same confessed lie -> already-confessed', r2 && r2.outcome === 'already-confessed');
  ok('stale doubt is resolved', Game.state.codex.doubts.find(dd => dd.id === doubt2.id).resolved === true);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
