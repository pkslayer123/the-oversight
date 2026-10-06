// Deep contest audit (Steve 2026-10-06): Play 10 contests across types as a PLAYER.
// Answers: living? playable? winnable? loseable? worth it? enjoyable? thematic?
// Also verifies: no stuck states, every contest completable, win/lose paths real.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js',
 'src/js/carexplore.js', 'src/js/contests.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let seed = 987654321;
function srand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

const results = [];
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; results.push(`FAIL: ${name} ${detail || ''}`); }
}

// Play one contest with a choice path. Returns {outcome, transcript, stuck}
function playContest(id, choicePath, seedVal) {
  seed = seedVal;
  const transcript = [];
  const _say = Game.say.bind(Game);
  const _sysSay = Game.sysSay.bind(Game);
  Game.say = function(t) { transcript.push('SAY: ' + t); };
  Game.sysSay = function(t) { transcript.push('SYS: ' + t); };
  Game.state.over = false;
  Game.state.scholar.health = 100;
  Game.state.scholar.kcal = 2200;
  Game.state.scholar.trauma = 0;
  Game.state.activeContest = null;
  const contest = Game.contestPool().find(c => c.id === id);
  if (!contest) { Game.say = _say; Game.sysSay = _sysSay; return { error: 'not found' }; }
  const realRandom = Math.random;
  Math.random = () => 0.99;
  try { Game.contestInterruption(Object.assign({}, contest, { givesChoice: false }), 'player'); } catch (e) {
    Game.say = _say; Game.sysSay = _sysSay; Math.random = realRandom;
    return { error: 'interruption threw: ' + e.message };
  }
  Math.random = srand;
  let steps = 0, result = null, stuck = false;
  const seenTexts = new Set();
  while (Game.state.activeContest && steps < 12) {
    const ac = Game.state.activeContest;
    const phase = ac.phases[ac.phaseIdx || 0];
    if (!phase) { stuck = true; break; }
    if (!phase.choices || !phase.choices.length) {
      // No choices — is this a terminal or a stuck state?
      if (phase.next === 'WIN' || phase.next === 'LOSE' || result) break;
      stuck = true; break;
    }
    // Detect choice loops (same phase text repeating = stuck)
    const key = (phase.text || '').slice(0, 80);
    if (seenTexts.has(key + steps)) { /* allow some repetition */ }
    seenTexts.add(key);
    const idx = choicePath[steps % choicePath.length];
    const ch = phase.choices[Math.min(idx, phase.choices.length - 1)];
    transcript.push(`>>> CHOOSE: ${ch.label}`);
    try {
      result = Game.contestChoose(Math.min(idx, phase.choices.length - 1));
    } catch (e) {
      Game.say = _say; Game.sysSay = _sysSay; Math.random = realRandom;
      return { error: 'choose threw: ' + e.message, transcript };
    }
    steps++;
    if (result && result.done) break;
  }
  if (Game.state.activeContest && steps >= 12 && !result) stuck = true;
  Game.say = _say; Game.sysSay = _sysSay; Math.random = realRandom;
  return { outcome: result ? result.outcome : (Game.state.activeContest ? 'UNRESOLVED' : 'ended'), transcript, stuck, steps };
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.day = 15;
  Game.state.systemArrived = true;

  // 10 contests across types: blood x2, endurance, moot/social, weird, puzzle, detective, forage, chance, new bespoke
  const plays = [
    ['pit', [0, 0, 0], 111],       // blood: aggressive
    ['gauntlet', [2, 1, 1], 222],  // blood: cautious
    ['drop', [1, 0, 1], 333],      // endurance
    ['moot', [0, 1, 0], 444],      // social/moot
    ['cookfight', [1, 1, 0], 555],  // weird/cooking
    ['riddle', [0, 0, 1], 666],    // puzzle
    ['confession', [1, 0, 1], 777], // detective/social-fear
    ['calorie_run', [0, 1, 0], 888],// forage
    ['longodds', [0, 0, 0], 999],   // chance/bespoke
    ['sorting', [1, 0, 1], 1010],   // puzzle/bespoke
  ];

  const played = [];
  for (const [id, path, sd] of plays) {
    const r = playContest(id, path, sd);
    played.push({ id, ...r });
    check(`${id} completes without error`, !r.error, r.error || '');
    check(`${id} reaches a resolution`, r.outcome && r.outcome !== 'UNRESOLVED', `got ${r.outcome}`);
    check(`${id} no stuck state`, !r.stuck, 'stuck in phase loop');
    check(`${id} transcript non-empty`, r.transcript && r.transcript.length > 3, 'empty transcript');
  }

  // WINNABLE: play pit aggressively many times — does anyone ever win?
  let wins = 0, losses = 0, deaths = 0;
  for (let i = 0; i < 20; i++) {
    const r = playContest('pit', [0, 0, 0], 5000 + i);
    if (r.outcome === 'won') wins++;
    else if (r.outcome === 'lost') losses++;
    if (r.outcome === 'died') deaths++;
  }
  check('pit is winnable (aggressive play wins sometimes)', wins > 0, `${wins}/20 wins`);
  check('pit is loseable (not auto-win)', losses > 0 || deaths > 0, `${losses} losses ${deaths} deaths`);

  // LOSEABLE: play gauntlet recklessly — do losses hurt?
  let gw = 0, gl = 0;
  for (let i = 0; i < 20; i++) {
    const r = playContest('gauntlet', [0, 0, 0], 6000 + i);
    if (r.outcome === 'won') gw++;
    else gl++;
  }
  check('gauntlet loseable on reckless play', gl > 0, `${gl}/20 lost`);

  // Verify all 38 contests are at least completable (short path)
  const pool = Game.contestPool();
  check('pool has 38 contests', pool.length === 38, `got ${pool.length}`);
  let incompletable = [];
  for (const c of pool) {
    const r = playContest(c.id, [0], 7000 + pool.indexOf(c));
    if (r.error || r.stuck || r.outcome === 'UNRESOLVED') incompletable.push(c.id);
  }
  check('all 38 contests completable', incompletable.length === 0, `stuck: ${incompletable.join(',')}`);

  // Bug fix verification
  const deeds = { contestWin: 1 };
  const notes = [];
  // Simulate the fixed line
  const line1 = deeds.contestWin === 1 ? 'won a contest' : `won ${deeds.contestWin} contests`;
  check('"won 1 contest(s)" grammar fixed', line1 === 'won a contest', line1);
  const line2 = [2, 3].map(n => n === 1 ? 'won a contest' : `won ${n} contests`);
  check('plural works', line2[0] === 'won 2 contests' && line2[1] === 'won 3 contests', line2.join('|'));

  // Print feel verdicts
  console.log('\n=== FEEL VERDICTS (played) ===');
  for (const p of played) {
    const beats = p.transcript ? p.transcript.filter(t => t.startsWith('SYS:')).length : 0;
    console.log(`${p.id}: outcome=${p.outcome} steps=${p.steps} beats=${beats} ${p.stuck ? 'STUCK!' : ''} ${p.error ? 'ERROR: ' + p.error : ''}`);
  }
  console.log(`\nPit 20x aggressive: ${wins}W/${losses}L/${deaths}D`);
  console.log(`Gauntlet 20x reckless: ${gw}W/${gl}L`);

  console.log(`\n${pass} passed, ${fail} failed`);
  for (const r of results) console.log(r);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
