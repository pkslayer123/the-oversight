// Split-team balance test (Steve 2026-10-05): a lone villager split off against
// a gallowdeer must lose (or barely survive) — never stroll to victory.
// Pairs should be viable but bloody; trios should usually win.
// Usage: node scripts/test-spliteam.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

const GALLOWDEER = { id: 'gallowdeer', hp: [95, 115], attack: { damage: [22, 32] } };
const WOLF = { id: 'hushwolf', hp: [25, 35], attack: { damage: [12, 18] } };

// deterministic RNG sweep: cycle through these values for Math.random
function sweepRandom(vals, fn) {
  const real = Math.random;
  let i = 0;
  Math.random = () => vals[(i++) % vals.length];
  try { return fn(); } finally { Math.random = real; }
}
const LADDER = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];

function trialOutcomes(team, mdef, mname, trials) {
  const counts = { won: 0, costly: 0, lost: 0 };
  const deaths = { n: 0 };
  const realSay = Game.say; Game.say = () => {};
  for (let t = 0; t < trials; t++) {
    const r = sweepRandom([LADDER[t % LADDER.length]], () =>
      Game.resolveSplitTeam(team, mdef, mname));
    counts[r.result]++;
    if (/didn't come back/.test(r.detail)) deaths.n++;
  }
  Game.say = realSay;
  return { counts, deaths: deaths.n, trials };
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  ok('roster has 3+ NPCs', roster.length >= 3);
  const [A, B, C] = roster;

  // --- 1. SOLO vs GALLOWDEER: must lose (never the old auto-win) ---
  const solo = trialOutcomes([A], GALLOWDEER, 'gallowdeer', 40);
  console.log('solo vs gallowdeer:', JSON.stringify(solo.counts), `deaths=${solo.deaths}/${solo.trials}`);
  ok('solo vs gallowdeer never wins', solo.counts.won === 0, JSON.stringify(solo.counts));
  ok('solo vs gallowdeer loses ~always', solo.counts.lost / solo.trials >= 0.9, JSON.stringify(solo.counts));

  // --- 2. PAIR vs GALLOWDEER: viable but bloody — kills it, always costs blood ---
  const pair = trialOutcomes([A, B], GALLOWDEER, 'gallowdeer', 40);
  console.log('pair vs gallowdeer:', JSON.stringify(pair.counts), `deaths=${pair.deaths}/${pair.trials}`);
  ok('pair vs gallowdeer never walks away clean-trivially', pair.counts.won <= pair.trials * 0.8, JSON.stringify(pair.counts));
  ok('pair vs gallowdeer usually survives the fight', (pair.counts.won + pair.counts.costly) / pair.trials >= 0.5, JSON.stringify(pair.counts));

  // --- 3. TRIO vs GALLOWDEER: should usually win, sometimes at cost ---
  const trio = trialOutcomes([A, B, C], GALLOWDEER, 'gallowdeer', 40);
  console.log('trio vs gallowdeer:', JSON.stringify(trio.counts), `deaths=${trio.deaths}/${trio.trials}`);
  ok('trio vs gallowdeer mostly wins', trio.counts.won / trio.trials >= 0.5, JSON.stringify(trio.counts));
  ok('trio vs gallowdeer rarely loses outright', trio.counts.lost / trio.trials <= 0.3, JSON.stringify(trio.counts));

  // --- 4. SOLO vs WEAK THREAT: lone-wolfing isn't suicide in general ---
  const soloWolf = trialOutcomes([A], WOLF, 'hushwolf', 40);
  console.log('solo vs hushwolf:', JSON.stringify(soloWolf.counts));
  ok('solo vs weak threat can win', soloWolf.counts.won / soloWolf.trials >= 0.5, JSON.stringify(soloWolf.counts));

  // --- 5. scale sanity: threat reads in baseline-player units ---
  // gallowdeer 2835 / 3.5 = 810 ~= baseline player soloPower (~800)
  const tp = Game.threatPower(GALLOWDEER);
  ok('gallowdeer threatPower sane', tp > 2500 && tp < 3200, String(tp));
  const soloP = Game.soloPower();
  ok('baseline player soloPower ~800', soloP >= 700 && soloP <= 1100, String(soloP));

  // --- 6. split history still records ---
  const before = (Game.state.village.partySplits || []).length;
  Game.tbfight = { over: false, fighters: [
    { key: 'm1', kind: 'monster', name: 'gallowdeer', mdef: GALLOWDEER, alive: true, fled: false },
    { key: 'm2', kind: 'monster', name: 'gallowdeer', mdef: GALLOWDEER, alive: true, fled: false },
    { key: 'p', kind: 'player', name: 'You', alive: true, fled: false },
  ]};
  // party not formally unlocked in this fresh game; splitParty needs inParty —
  // exercise resolveSplitTeam path only (covered above). Just check tbfight guard:
  const noFight = Game.splitParty('m1', [A]);
  ok('splitParty refuses without party membership', noFight.ok === false);
  Game.tbfight = null;
  ok('no phantom split recorded', (Game.state.village.partySplits || []).length === before);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
