// Contest content audit + new-variant proof (Steve 2026-10-06).
// Assignment: (1) expand the contest pool with 2-3 NEW variants — quiet,
// guest, vigil — playable end-to-end, knowledge-gated, with watch beats;
// (2) AUDIT one existing contest (pantry_raid) by PLAYING it as a player —
// judge fun/fear, find and fix real bugs (SIBLING discipline).
// Run: node scripts/play-contest-audit-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/contests.js', 'src/js/villager-agency.js', 'src/js/ledger.js',
 'src/js/betrayal.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function rig(seq) {
  const o = Math.random; let i = 0;
  Math.random = () => seq[i++ % seq.length];
  return () => { Math.random = o; };
}
let said = [];
function hookSay() {
  said = [];
  const orig = Game.say.bind(Game), origSys = Game.sysSay.bind(Game);
  Game.say = (t) => { said.push(String(t)); return orig(t); };
  Game.sysSay = (t) => { said.push('[SYS] ' + String(t)); return origSys(t); };
}
function fresh(day) {
  hookSay();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = day || 15;
  Game.state.systemArrived = true;
  s.health = 100; s.kcal = 3000; s.trauma = 0;
  Game.state.over = false;
  Game.log = [];
  Game.state.showBudget = null;
  Game.state.pendingContest = null;
  Game.state.activeContest = null;
  Game.state.contestsSeen = {};
  Game.state.notability = {};
  Game.state.codex = Game.state.codex || {};
  Game.state.codex.contests = {};
  return s;
}
function byId(id) { return Game.contestPool().find(c => c.id === id); }
function setLevel(id, lvl) {
  Game.state.codex.contests[id] = { seen: lvl >= 2 ? 4 : 1, wins: 0, level: lvl };
}
// Play the active contest with a choice-per-step plan; rngSeq rigs dice.
function playThrough(choiceIdxs, rngSeq) {
  const unrig = rig(rngSeq || [0.99]);
  let steps = 0, result = null;
  while (Game.state.activeContest && steps < 14) {
    const ac = Game.state.activeContest;
    const phase = ac.phases[ac.phaseIdx || 0];
    if (!phase || !phase.choices || !phase.choices.length) break;
    const ci = choiceIdxs[Math.min(steps, choiceIdxs.length - 1)];
    const idx = Math.min(ci, phase.choices.length - 1);
    result = Game.contestChoose(idx);
    steps++;
    if (result && result.done) break;
  }
  unrig();
  return result;
}
function take(id, opts) {
  opts = opts || {};
  const unrig = rig([0.99, 0.99, 0.99]); // whim off; player preferred; grabbed
  Game.contestInterruption(Object.assign({}, byId(id), { givesChoice: false }), opts.as || 'player');
  unrig();
}
function villagerId() {
  return (Game.state.village.roster || []).find(id => id !== Game.villagerId);
}
function banner(t) { console.log('\n' + '='.repeat(64) + '\n' + t + '\n' + '='.repeat(64)); }

(async () => {
  await Game.init();

  // ============ POOL INTEGRITY (SIBLING check: every id dispatches) ============
  banner('POOL INTEGRITY — all 30 ids dispatch, nexts resolve, death lines exist');
  {
    fresh(15);
    const pool = Game.contestPool();
    check('pool has 30 contests', pool.length === 30, 'got ' + pool.length);
    const ids = pool.map(c => c.id);
    check('quiet/guest/vigil in pool', ['quiet', 'guest', 'vigil'].every(i => ids.includes(i)));
    let bad = [];
    for (const c of pool) {
      let phases;
      try { phases = Game.contestPlayable(c); } catch (e) { bad.push(c.id + ':throw'); continue; }
      if (!phases || !phases.length) { bad.push(c.id + ':empty'); continue; }
      phases.forEach((ph, pi) => {
        // CONTRACT (established): the intro phase carries its own 📺 prefix
        // via _cxIntro; later phases are plain text and _cxPhaseSay adds the
        // prefix at display time (never doubling it).
        if (pi === 0 && !ph.text.startsWith('📺')) bad.push(`${c.id} p0: no 📺 prefix`);
        const saidForm = /^📺/.test(ph.text) ? ph.text : '📺 ' + ph.text;
        if (!saidForm.startsWith('📺')) bad.push(`${c.id} p${pi}: _cxPhaseSay gap`);
        (ph.choices || []).forEach((ch, ci) => {
          const n = ch.next;
          const ok = ['WIN', 'LOSE', 'DIE', 'REFUSE', 'VERDICT'].includes(n) || (typeof n === 'number' && n >= 0 && n < phases.length);
          if (!ok) bad.push(`${c.id} p${pi} c${ci}: bad next ${n}`);
        });
      });
      // death line: specific or category fallback, never the generic tail
      const dl = Game._contestDeathLine(c, '', 'Mara');
      if (/did not come home/.test(dl)) bad.push(c.id + ': no death line');
      // watch beats: 3, contest-specific
      let beats = null;
      try { beats = Game._contestWatchBeat(c, 'Mara'); } catch (e) {}
      if (!beats || beats.length !== 3) bad.push(c.id + ': watch beats');
    }
    check('all 30 dispatch clean (phases, nexts, death lines, 3 watch beats)', !bad.length, bad.slice(0, 6).join('; '));
  }

  // ============ QUIET — unknown player (blind) ============
  banner('PLAY: QUIET (blind, no knowledge) — the fear is exposure');
  {
    const s = fresh(15);
    take('quiet');
    const ac = Game.state.activeContest;
    const introText = said.join('\n');
    check('blind intro has NO coaching (📚)', !/📚/.test(introText), 'leak!');
    check('blind phase-0 hides the turnip tactic', !/turnip/i.test(said.join(' ')));
    // own it -> hold -> take it (honesty path: prize + fracture)
    const res = playThrough([2, 0, 0], [0.99]);
    check('quiet blind completes', res && res.done, JSON.stringify(res));
    check('honesty path won', res && res.outcome === 'won');
    check('honesty had social cost (trauma)', s.trauma > 0, 'trauma=' + s.trauma);
    check('honesty fractured the village (theft, socially punished)', (Game.leadership().fracture || 0) > 0, 'fracture=' + Game.leadership().fracture);
  }

  // ============ QUIET — veteran player ============
  banner('PLAY: QUIET (veteran, level 2) — knowledge is the defense');
  {
    const s = fresh(15);
    setLevel('quiet', 2);
    take('quiet');
    const introText = said.join('\n');
    check('veteran intro HAS coaching (📚)', /📚/.test(introText));
    check('coaching names the tactic', /turnip/i.test(introText));
    // decoy -> stay with plan -> hold turnips: WIN via comedy
    const res = playThrough([0, 0, 0], [0.99]);
    check('quiet veteran completes', res && res.done);
    check('decoy path won', res && res.outcome === 'won');
  }

  // ============ QUIET — watch mode beats + knows gating ============
  banner('WATCH: QUIET as a villager is taken — beats + knows gating');
  {
    fresh(15);
    const vid = villagerId();
    const unrig = rig([0.99]);
    Game.contestInterruption(Object.assign({}, byId('quiet'), { givesChoice: false }), vid);
    unrig();
    let beats = null;
    try { beats = Game._contestWatchBeat(byId('quiet'), 'Mara'); } catch (e) {}
    check('3 watch beats', beats && beats.length === 3);
    check('no knows line at level 0', beats && !/📚/.test(beats[2]));
    setLevel('quiet', 2);
    beats = Game._contestWatchBeat(byId('quiet'), 'Mara');
    check('knows line appears at level 2', beats && /📚/.test(beats[2]) && /TURNIPS/.test(beats[2]));
    Game.state.activeContest = null;
  }

  // ============ GUEST — unknown then veteran ============
  banner('PLAY: GUEST (blind) — farcical hospitality');
  {
    const s = fresh(15);
    take('guest');
    check('blind guest intro has NO palate intel', !/📚/.test(said.join('\n')));
    // best stew -> bow -> toast village: middling play, should still resolve
    const res = playThrough([0, 1, 0], [0.99]);
    check('guest blind completes', res && res.done, JSON.stringify(res));
  }
  banner('PLAY: GUEST (veteran) — knowledge wins the dinner');
  {
    const s = fresh(15);
    setLevel('guest', 2);
    take('guest');
    check('veteran guest intro HAS palate intel', /📚/.test(said.join('\n')) && /bitter/i.test(said.join('\n')));
    // bitter roots -> mirror -> toast village: the winning line
    const res = playThrough([1, 2, 0], [0.99]);
    check('guest veteran completes', res && res.done);
    check('winning line won', res && res.outcome === 'won');
    check('win brought unity (social reward)', (Game.leadership().unity || 0) > 0, 'unity=' + Game.leadership().unity);
  }

  // ============ VIGIL — hold vs alarm ============
  banner('PLAY: VIGIL — hold the post');
  {
    const s = fresh(15);
    take('vigil');
    check('blind vigil intro has NO circle intel', !/📚/.test(said.join('\n')));
    // check lamp -> hold still -> greet dawn: WIN
    const res = playThrough([0, 0, 0], [0.99]);
    check('vigil hold completes', res && res.done);
    check('held the line: won', res && res.outcome === 'won');
  }
  banner('PLAY: VIGIL — sound the alarm (the costly choice)');
  {
    const s = fresh(15);
    take('vigil');
    // check lamp -> SOUND THE ALARM: immediate LOSE with fracture
    const res = playThrough([0, 1], [0.99]);
    check('alarm run completes', res && res.done);
    check('alarm run lost (not a skip — a played failure)', res && res.outcome === 'lost');
  }
  banner('PLAY: VIGIL — veteran knowledge changes the texture');
  {
    fresh(15);
    setLevel('vigil', 2);
    take('vigil');
    check('veteran vigil intro HAS circle intel', /circles the LIGHT/.test(said.join('\n')));
    Game.state.activeContest = null;
  }

  // ============ AUDIT: PANTRY RAID (existing, never fully played) ============
  banner('AUDIT: PANTRY RAID — survive run (played as a player)');
  {
    const s = fresh(15);
    take('pantry_raid');
    check('intro has risk + arena', /Pantry Raid/.test(said.join('\n')));
    // sneak in -> take only the best -> present with pride: careful play
    const res = playThrough([0, 1, 0], [0.99, 0.99, 0.99, 0.99]);
    check('pantry raid completes', res && res.done, JSON.stringify(res));
    console.log(`    outcome=${res && res.outcome} hp=${s.health} kcal=${s.kcal} trauma=${s.trauma}`);
  }
  banner('AUDIT: PANTRY RAID — reckless run (death path + death line)');
  {
    const s = fresh(15);
    take('pantry_raid');
    s.health = 20; // fragile: reckless choices should kill
    // brave the front -> grab and run (die 0.06, rigged low) 
    const res = playThrough([1, 0, 0], [0.02, 0.02, 0.02]);
    const died = (res && res.outcome === 'died') || Game.state.over;
    check('reckless run can die', died, `outcome=${res && res.outcome} over=${Game.state.over} hp=${s.health}`);
    check('death line is pantry-specific (locals objected)', /locals objected/i.test(said.join('\n')));
  }
  banner('AUDIT: PANTRY RAID — watch mode (villager taken)');
  {
    fresh(15);
    const vid = villagerId();
    const unrig = rig([0.99]);
    Game.contestInterruption(Object.assign({}, byId('pantry_raid'), { givesChoice: false }), vid);
    unrig();
    check('watch phases built', Game.state.activeContest && Game.state.activeContest.phases.length === 3);
    // cheer -> shout advice -> go to them -> VERDICT
    const res = playThrough([0, 0, 0], [0.99, 0.99, 0.99]);
    check('watch run resolves', res && res.done, JSON.stringify(res));
  }
  banner('AUDIT: PANTRY RAID — veteran coaching appears');
  {
    fresh(15);
    setLevel('pantry_raid', 2);
    take('pantry_raid');
    check('veteran coaching in intro', /📚/.test(said.join('\n')) && /offering/i.test(said.join('\n')));
    Game.state.activeContest = null;
  }

  // ============ KNOWLEDGE-GATING LEAK SWEEP (all 30) ============
  banner('LEAK SWEEP — level-0 intros show no 📚 for any contest');
  {
    fresh(15);
    let leaks = [];
    for (const c of Game.contestPool()) {
      // _cxCoaching is what _cxIntro appends: empty at level 0 by contract.
      const coach = Game._cxCoaching(c);
      if (coach) leaks.push(c.id + ':coaching-at-0');
      // Watch beats: knows line must be absent at level 0.
      let beats = null;
      try { beats = Game._contestWatchBeat(c, 'Mara'); } catch (e) {}
      if (beats && /📚/.test(beats[2])) leaks.push(c.id + ':watch-knows-at-0');
    }
    check('no coaching leaks at knowledge 0', !leaks.length, leaks.slice(0, 4).join('; '));
  }

  console.log(`\n${'='.repeat(64)}\nRESULT: ${pass} pass, ${fail} fail\n${'='.repeat(64)}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
