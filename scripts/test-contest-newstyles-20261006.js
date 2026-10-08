// PROOF TEST: 4 new contest styles (price/impress/exchange/auction) — fixes
// found by feel-playtest 2026-10-06 (Steve 2026-10-06).
//
// BEFORE (verified in playtest transcripts):
//   1. beat_audio: phases declared beat:'contestPrice'/'contestImpress'/
//      'contestExchange'/'contestAuction' but CX_BEAT_DEFS had no entries ->
//      _cxBeat silently no-opped (rule: every contest beat must resolve).
//   2. watch_beats_specific: _contestWatchBeat returned null for all 4 ->
//      watch mode showed the generic fallback ("it's going badly. Or well.
//      It's hard to tell through the lights.") for a televised village vote.
//   3. bespoke_death_lines: _contestDeathLine fell back to CAT category
//      lines (price -> moot's line, with mid-sentence "verdict on You").
//   4. auction 'Bid years' was do:{dmg:[0,0]} — the fiction calls years
//      "the serious currency" but the choice cost nothing (choice-that-
//      does-nothing class).
// AFTER: each assertion below pins the fixed behavior. Run:
//   node scripts/test-contest-newstyles-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js',
 'src/js/carexplore.js', 'src/js/contests.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; fails.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

// Synth names registered in app.js Game.audio (the only parts a composed
// beat may dispatch to). If contests.js references a synth that doesn't
// exist, the composition silently degrades — catch it here.
const REGISTERED_SYNTHS = ['contestCall', 'contestTaken', 'contestSpared',
  'justiceVerdict', 'exileWalk', 'horrorSting', 'rushHit', 'levelup'];

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.day = 15;
  Game.state.scholar.health = 100;
  Game.state.scholar.kcal = 2200;
  Game.state.systemArrived = true;
  const realRandom = Math.random;
  Math.random = () => 0.99;

  console.log('== 1. audio beats resolve (were silent no-ops) ==');
  const BEATS = { contestPrice: ['justiceVerdict', 'exileWalk'],
    contestImpress: ['levelup', 'contestSpared'],
    contestExchange: ['contestCall', 'rushHit'],
    contestAuction: ['contestCall', 'horrorSting'] };
  for (const [beat, parts] of Object.entries(BEATS)) {
    const fired = [];
    Game.audio = {};
    for (const s of REGISTERED_SYNTHS) Game.audio[s] = () => fired.push(s);
    Game._cxBeat(beat);
    check(`${beat} registers a composed dispatch`, typeof Game.audio[beat] === 'function', 'no-op before');
    check(`${beat} fires its parts in order`, fired.join(',') === parts.join(','),
      `got [${fired.join(',')}] want [${parts.join(',')}]`);
    check(`${beat} only uses registered synths`, parts.every(p => REGISTERED_SYNTHS.includes(p)));
  }
  Game.audio = undefined;

  console.log('== 2. bespoke watch beats (were generic fallback) ==');
  const SPECIFIC = {
    price: ['UNTIL DUSK', 'envelope'],
    impress: ['40,000 emotions', 'confused the judges'],
    exchange: ['Gray Hollow', 'lit gate'],
    auction: ['ALL BIDS ARE FINAL', 'hammer'],
  };
  for (const [id, markers] of Object.entries(SPECIFIC)) {
    const contest = Game.contestPool().find(c => c.id === id);
    const beats = Game._contestWatchBeat(contest, 'Luke');
    check(`${id}: _contestWatchBeat returns beats (was null)`, !!beats);
    const text = (beats || []).join('\n');
    check(`${id}: beats are contest-specific fiction`, markers.every(m => text.includes(m)),
      `missing marker in: ${text.slice(0, 120)}...`);
    check(`${id}: no generic fallback text`, !text.includes("it's going badly. Or well."));
  }

  console.log('== 3. knowledge-gated veteran watch line (was absent) ==');
  {
    const contest = Game.contestPool().find(c => c.id === 'price');
    Game.state.codex = Game.state.codex || {};
    Game.state.codex.contests = Game.state.codex.contests || {};
    delete Game.state.codex.contests.price;
    const first = Game._contestWatchBeat(contest, 'Luke').join('\n');
    check('price watch: first-timer sees NO coaching line', !first.includes('📚'));
    Game.state.codex.contests.price = { seen: 3, wins: 0, level: 2 };
    const vet = Game._contestWatchBeat(contest, 'Luke').join('\n');
    check('price watch: veteran (level 2) gets 📚 knows-line', vet.includes('📚'));
    check('price watch: veteran line names the tell', /olunteer/i.test(vet));
    delete Game.state.codex.contests.price;
  }

  console.log('== 4. bespoke death lines (were category fallback) ==');
  const DEATH_MARKERS = {
    price: ['price', 'vote'],
    impress: ['seventeen new emotions'],
    exchange: ['lit gate', 'badlands'],
    auction: ['hammer', 'ledger'],
  };
  for (const [id, markers] of Object.entries(DEATH_MARKERS)) {
    const contest = Game.contestPool().find(c => c.id === id);
    const youLine = Game._contestDeathLine(contest, '', 'You');
    const themLine = Game._contestDeathLine(contest, '', 'Luke');
    check(`${id}: death line is contest-specific (was ${contest.cat} fallback)`,
      markers.every(m => youLine.toLowerCase().includes(m.toLowerCase())), youLine.slice(0, 100));
    check(`${id}: no mid-sentence capital-You`, !/on You|of You/.test(youLine), youLine.slice(0, 80));
    check(`${id}: villager form reads`, !/undefined/.test(themLine));
  }

  console.log('== 5. auction Bid years has a real cost (was do:{dmg:[0,0]}) ==');
  {
    const contest = Game.contestPool().find(c => c.id === 'auction');
    const phases = Game.contestPlayable(contest);
    const bidYears = phases[0].choices.find(c => c.label === 'Bid years');
    const costless = bidYears.do && !bidYears.do.dmg && !bidYears.do.trauma && !bidYears.do.kcal && !bidYears.do.die;
    check('Bid years do:{} carries a cost now', !costless, JSON.stringify(bidYears.do));
    // Drive it: trauma must move
    Game.state.scholar.trauma = 0;
    Game.state.activeContest = null;
    Game.contestInterruption(Object.assign({}, contest, { givesChoice: false }), 'player');
    const r = Game.contestChoose(1); // Bid years
    check('Bid years applies trauma on play', (Game.state.scholar.trauma || 0) > 0,
      `trauma=${Game.state.scholar.trauma}`);
    Game.state.activeContest = null;
  }

  console.log('== 6. regression: all 4 still complete on every branch ==');
  const SEEDS = { price: [0, 1, 2], impress: [0, 1, 2], exchange: [0, 1, 2], auction: [0, 1, 2] };
  for (const id of ['price', 'impress', 'exchange', 'auction']) {
    const contest = Game.contestPool().find(c => c.id === id);
    for (const firstChoice of SEEDS[id]) {
      Game.state.over = false;
      Game.state.scholar.health = 100;
      Game.state.scholar.kcal = 2200;
      Game.state.activeContest = null;
      Game.contestInterruption(Object.assign({}, contest, { givesChoice: false }), 'player');
      let steps = 0, res = null;
      while (Game.state.activeContest && steps < 12) {
        const ac = Game.state.activeContest;
        const ph = ac.phases[ac.phaseIdx || 0];
        if (!ph || !ph.choices || !ph.choices.length) break;
        res = Game.contestChoose(Math.min(firstChoice, ph.choices.length - 1));
        steps++;
        if (res && res.done) break;
      }
      check(`${id} branch[${firstChoice}] resolves (no stuck)`, !Game.state.activeContest || (res && res.done),
        `steps=${steps} active=${!!Game.state.activeContest}`);
    }
  }

  Math.random = realRandom;
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fails.length) { console.log('FAILURES:\n- ' + fails.join('\n- ')); process.exit(1); }
})().catch(e => { console.error('TEST FAILED:', e); process.exit(1); });
