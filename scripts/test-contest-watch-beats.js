// Contest-specific watch beats test (Steve 2026-10-06)
// Asserts every contest in the pool has CONTEST-SPECIFIC watch beats
// (not the old generic fallback), that the three phases resolve cleanly
// through contestChoose -> VERDICT, and that veteran knowledge-gating works.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/contests.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

const GENERIC_TELL = "it's going badly. Or well.";

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.day = 15;
  Game.state.village.roster = ['v1', 'v2', 'v3'];
  Game.data.villagers = [{ id: 'v1', name: 'Aaron' }, { id: 'v2', name: 'Moshe' }, { id: 'v3', name: 'Ruth' }];

  console.log('=== Contest Watch Beats ===\n');
  const pool = Game.contestPool();
  ok('pool has 27 contests', pool.length === 27, `got ${pool.length}`);

  const turnBeats = new Set();
  for (const c of pool) {
    // 1. Every contest gets a beat entry (no generic fallback)
    let beats = null;
    try { beats = Game._contestWatchBeat(c, 'Aaron'); } catch (e) { beats = null; }
    ok(`${c.id} has contest-specific beats`, Array.isArray(beats) && beats.length === 3, `got ${beats && beats.length}`);
    if (!beats) continue;

    // 2. Phases resolve: 3 phases, texts name the contest, no generic tell
    const phases = Game._contestWatchPhases(c, 'v1');
    ok(`${c.id} phases count`, phases.length === 3);
    for (let i = 0; i < 3; i++) {
      const ph = phases[i];
      ok(`${c.id} phase ${i} has text`, typeof ph.text === 'string' && ph.text.length > 40, `len ${ph.text && ph.text.length}`);
      ok(`${c.id} phase ${i} names contest`, ph.text.includes(c.name));
      ok(`${c.id} phase ${i} not generic`, !ph.text.includes(GENERIC_TELL));
      ok(`${c.id} phase ${i} has choices`, Array.isArray(ph.choices) && ph.choices.length >= 2);
      for (const ch of ph.choices) {
        const good = ch.label && ch.sub && ch.do && (typeof ch.next === 'number' || ch.next === 'VERDICT');
        ok(`${c.id} phase ${i} choice '${ch.label}' wired`, !!good);
      }
    }
    // Phase wiring: 0 -> 1 -> 2 -> VERDICT
    ok(`${c.id} phase0 -> 1`, phases[0].choices.every(ch => ch.next === 1));
    ok(`${c.id} phase1 -> 2`, phases[1].choices.every(ch => ch.next === 2));
    ok(`${c.id} phase2 -> VERDICT`, phases[2].choices.every(ch => ch.next === 'VERDICT'));
    turnBeats.add(beats[1]);
  }
  ok('turn beats distinct per contest', turnBeats.size === pool.length, `got ${turnBeats.size} unique of ${pool.length}`);

  // 3. Knowledge gating: veterans get the 📚 coaching line, newbies don't
  Game.state.codex = Game.state.codex || {};
  Game.state.codex.contests = Game.state.codex.contests || {};
  const kb = (id, lvl) => { Game.state.codex.contests[id] = { seen: 3, wins: 1, level: lvl }; };
  kb('tithe', 0);
  let endT = Game._contestWatchBeat(Game.contestPool().find(c => c.id === 'tithe'), 'Aaron')[2];
  ok('tithe newbie: no coaching line', !endT.includes('📚'));
  kb('tithe', 2);
  endT = Game._contestWatchBeat(Game.contestPool().find(c => c.id === 'tithe'), 'Aaron')[2];
  ok('tithe veteran: coaching line shown', endT.includes('📚') && endT.includes('THREE full measures'));
  kb('riddle', 2);
  const endR = Game._contestWatchBeat(Game.contestPool().find(c => c.id === 'riddle'), 'Aaron')[2];
  ok('riddle veteran: coaching line shown', endR.includes('📚'));
  kb('pit', 2);
  const endP = Game._contestWatchBeat(Game.contestPool().find(c => c.id === 'pit'), 'Aaron')[2];
  ok('pit veteran: no coaching line (none defined)', !endP.includes('📚'));
  kb('tithe', 0); kb('riddle', 0); kb('pit', 0);

  // 4. Full watch walkthrough resolves cleanly (hide: Aaron taken, survive + die paths)
  function walkWatch(contestId, rigDie) {
    const contest = Game.contestPool().find(c => c.id === contestId);
    Game.state.activeContest = {
      contestId, participant: 'v1', phase: 'watching', phaseIdx: 0,
      phases: Game._contestWatchPhases(contest, 'v1'), wounds: 0,
    };
    const origRandom = Math.random;
    // rig: win roll succeeds, die roll = rigDie
    Math.random = () => 0.99;
    let res;
    for (let i = 0; i < 5 && Game.state.activeContest; i++) {
      if (i === 2) Math.random = rigDie ? () => 0.0 : () => 0.99; // VERDICT roll
      res = Game.contestChoose(0);
    }
    Math.random = origRandom;
    return res;
  }
  const r1 = walkWatch('hide', false);
  ok('hide watch walkthrough survives to done', r1 && r1.done === true && (r1.outcome === 'won' || r1.outcome === 'lost'), `got ${JSON.stringify(r1)}`);
  ok('hide watch clears activeContest', Game.state.activeContest === null);
  // reset villager roster after potential death
  Game.state.village.roster = ['v1', 'v2', 'v3'];
  const r2 = walkWatch('maw', true); // extreme: force the death roll
  ok('maw watch walkthrough can die on camera', r2 && r2.done === true && r2.outcome === 'died', `got ${JSON.stringify(r2)}`);
  ok('maw watch death removes villager', !Game.state.village.roster.includes('v1'));
  Game.state.village.roster = ['v1', 'v2', 'v3'];

  // 5. Watch beats don't leak prizes or coach first-timers
  for (const c of pool) {
    const all = Game._contestWatchBeat(c, 'Aaron').join('\n');
    // no promise of winning, no reveal of what the prize is
    ok(`${c.id} no prize leak`, !/you (will )?win|the prize is yours|prize: \w+|collect your prize/i.test(all));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
