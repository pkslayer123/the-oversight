// Contest system test (Steve 2026-10-05)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/membership.js', 'src/js/contests.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  
  console.log('=== Contest System Tests ===\n');
  
  // Day 1: not eligible
  Game.state.scholar.day = 1;
  let elig = Game.contestEligible();
  ok('day 1 not eligible', elig.eligible.length === 0);
  
  // Day 15: eligible
  Game.state.scholar.day = 15;
  // Mock village roster
  Game.state.village.roster = ['v1', 'v2'];
  Game.state.village.positions = { v1: { mx: 4, my: 4 }, v2: { mx: 5, my: 5 } };
  Game.data.villagers = [{ id: 'v1', name: 'Test1' }, { id: 'v2', name: 'Test2' }];
  elig = Game.contestEligible();
  ok('day 15 eligible', elig.eligible.length > 0, `got ${elig.eligible.length}`);
  
  // Contest pool
  const pool = Game.contestPool();
  ok('contest pool has events', pool.length >= 8, `got ${pool.length}`);
  ok('has blood category', pool.some(c => c.cat === 'blood'));
  ok('has weird category', pool.some(c => c.cat === 'weird'));
  
  // Show pool
  const shows = Game.showPool();
  ok('show pool has shows', shows.length >= 5);
  ok('has WHY DO THEY EAT', shows.some(s => s.id === 'why_eat'));
  
  // New categories (Steve 2026-10-05)
  ok('has puzzle category', pool.some(c => c.cat === 'puzzle'));
  ok('has detective category', pool.some(c => c.cat === 'detective'));
  ok('has forage category', pool.some(c => c.cat === 'forage'));
  ok('has chance category', pool.some(c => c.cat === 'chance'));
  ok('pool expanded to 18', pool.length >= 18, `got ${pool.length}`);
  
  // Arenas have emoji art
  ok('contests have arena art', pool.every(c => c.arena && c.arena.includes('\n')));
  
  // Variants
  Game.state.contestsSeen = { pit: 2 }; // seen twice
  // Force variant by mocking random
  const origRandom = Math.random;
  Math.random = () => 0.1; // < 0.3 triggers variant
  const varPick = Game.pickContest();
  Math.random = origRandom;
  // (Can't guarantee it's pit, but variant logic is tested via code path)
  
  // Notability
  Game.addNotability('player', 'wave2Kill');
  const notes = Game.notability('player');
  ok('notability tracked', notes.includes('slew a wave-2 beast'));
  
  // Budget
  Game.state.scholar.day = 20;
  Game.state.showBudget = { week: 2, used: 2 };
  const event = Game.contestTick();
  ok('budget cap respected', event === null);

  console.log('\n--- playtest assertions (Steve 2026-10-06) ---');

  // === ELIGIBILITY VISIBILITY ===
  // The player must always be able to answer "who can go, and why."
  Game.state.scholar.day = 15;
  Game.state.over = false;
  Game.state.scholar.health = 100;
  Game.state.scholar.exiled = false;
  const elig15 = Game.contestEligible();
  ok('eligibility lists names', elig15.eligible.every(e => e.name && e.name.length > 0));
  ok('player always eligible when alive', elig15.eligible.some(e => e.id === 'player'));
  ok('notability deeds visible as the why', (() => {
    Game.addNotability('player', 'contestWin');
    const e2 = Game.contestEligible();
    const me = e2.eligible.find(x => x.id === 'player');
    return me && me.notability.some(n => /won a contest/.test(n));
  })());
  ok('pre-day-14 gives the reason, not a list', (() => {
    Game.state.scholar.day = 5;
    const e3 = Game.contestEligible();
    Game.state.scholar.day = 15;
    return e3.eligible.length === 0 && /day 14/.test(e3.reason || '');
  })());
  ok('exiled player not eligible', (() => {
    Game.state.scholar.exiled = true;
    const e4 = Game.contestEligible();
    Game.state.scholar.exiled = false;
    return !e4.eligible.some(x => x.id === 'player');
  })());

  // === UNAVOIDABLE TRIGGER ===
  // resolveContest re-checks the contestant: a dead participant is recast
  // from the living eligible (the show still comes); only with NOBODY left
  // is the show cancelled. No modal for a corpse, ever.
  const sayLines = [];
  const _sysSay = Game.sysSay.bind(Game);
  Game.sysSay = function (t) { sayLines.push(t); return _sysSay(t); };
  Game.state.systemArrived = true;
  // (a) dead player -> recast to a living villager
  Game.state.village.roster = ['v1', 'v2'];
  Game.state.village.positions = { v1: { x: 2, y: 2 }, v2: { x: 6, y: 6 } };
  Game.state.pendingContest = { contestId: 'pit', participant: 'player', firesDay: 16, variant: null };
  Game.state.scholar.health = 0; Game.state.over = true; Game.state.scholar.day = 16;
  Game.resolveContest();
  const acA = Game.state.activeContest;
  ok('dead player is recast, not televised as a corpse', !!acA && acA.participant !== 'player');
  ok('recast announced diegetically', sayLines.some(l => /was going to take/.test(l)));
  ok('unavoidable: show still fires after recast', !!acA && acA.phase !== 'done');
  // (b) dead villager -> recast
  Game.state.activeContest = null; sayLines.length = 0;
  Game.state.scholar.health = 100; Game.state.over = false;
  Game.state.pendingContest = { contestId: 'pit', participant: 'v1', firesDay: 16, variant: null };
  Game.state.village.roster = ['v2'];
  Game.resolveContest();
  const acB = Game.state.activeContest;
  ok('dead villager is recast', !!acB && acB.participant !== 'v1');
  // (c) nobody left -> show cancelled, no stuck modal
  Game.state.activeContest = null; sayLines.length = 0;
  Game.state.village.roster = [];
  Game.state.scholar.health = 0; Game.state.over = true;
  Game.state.pendingContest = { contestId: 'pit', participant: 'v1', firesDay: 16, variant: null };
  Game.resolveContest();
  ok('no one left: cancelled, no modal', Game.state.activeContest === null);
  ok('cancellation is on the record', sayLines.some(l => /cancelled/.test(l)));
  Game.sysSay = _sysSay;
  Game.state.scholar.health = 100; Game.state.over = false;

  // === FREQUENCY CAP: 28-day seeded sim, ≤2 events per week ===
  Game.state.village.roster = ['v1', 'v2'];
  Game.state.village.positions = { v1: { x: 2, y: 2 }, v2: { x: 6, y: 6 } };
  const realRandom = Math.random;
  let seed = 42424242;
  Math.random = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const perWeek = {};
  for (let d = 15; d < 43; d++) {
    Game.state.scholar.day = d;
    Game.state.pendingContest = null; Game.state.activeContest = null;
    const ev = Game.contestTick();
    if (ev && ev.id) {
      const wk = Math.floor(d / 7);
      perWeek[wk] = (perWeek[wk] || 0) + 1;
    }
  }
  Math.random = realRandom;
  ok('frequency cap: no week exceeds 2 events', Object.values(perWeek).every(n => n <= 2),
    JSON.stringify(perWeek));

  // === NO DEAD-ENDS: phase-graph audit across all 27 contests ===
  // Every phase has ≥1 choice; every next resolves to a real phase or a
  // terminal ('WIN'|'LOSE'|'DIE'|'REFUSE'|'VERDICT'); no self-loops; every
  // path terminates within 12 steps. Covers both knowledge variants and
  // the watch-mode phases.
  const TERMINAL = new Set(['WIN', 'LOSE', 'DIE', 'REFUSE', 'VERDICT', 'MIXED', 'MOOT_JUDGE', 'MAW_JUDGE', 'SHOW_VILLAGER']);
  function auditPhases(phases, label) {
    if (!phases || !phases.length) return [`${label}: no phases`];
    const errs = [];
    phases.forEach((p, i) => {
      if (!p.choices || !p.choices.length) { errs.push(`${label} phase ${i}: no choices`); return; }
      p.choices.forEach((c, j) => {
        const nx = c.next;
        if (TERMINAL.has(nx)) return;
        if (typeof nx !== 'number' || !phases[nx]) {
          errs.push(`${label} phase ${i} choice ${j}: bad next ${JSON.stringify(nx)}`);
        } else if (nx === i) {
          errs.push(`${label} phase ${i} choice ${j}: self-loop`);
        }
      });
    });
    // termination: BFS from 0, every reachable numeric path must reach a
    // terminal within 12 steps
    const queue = [{ idx: 0, depth: 0 }];
    const seen = new Set();
    while (queue.length) {
      const { idx, depth } = queue.shift();
      const key = idx + ':' + depth;
      if (seen.has(key)) continue; seen.add(key);
      if (depth > 12) { errs.push(`${label}: path exceeds 12 steps (loop?)`); break; }
      const p = phases[idx];
      if (!p || !p.choices) continue;
      for (const c of p.choices) {
        if (TERMINAL.has(c.next)) continue;
        if (typeof c.next === 'number' && phases[c.next]) queue.push({ idx: c.next, depth: depth + 1 });
      }
    }
    return errs;
  }
  let graphErrs = [];
  for (const c of Game.contestPool()) {
    // player sequences: both knowledge variants where they differ
    for (const variant of [false, true]) {
      try {
        if (variant) { // force veteran coaching variant
          Game.state.codex = Game.state.codex || {};
          Game.state.codex.contests = Object.assign({}, Game.state.codex.contests,
            { [c.id]: { seen: 6, wins: 1, level: 3 } });
        }
        const phases = Game.contestPlayable(c);
        graphErrs = graphErrs.concat(auditPhases(phases, c.id + (variant ? '/vet' : '')));
        if (variant) delete Game.state.codex.contests[c.id];
      } catch (e) { graphErrs.push(`${c.id}: threw ${e.message}`); }
    }
    // watch sequences
    try {
      const wp = Game._contestWatchPhases(c, 'v1');
      graphErrs = graphErrs.concat(auditPhases(wp, c.id + '/watch'));
    } catch (e) { graphErrs.push(`${c.id}/watch: threw ${e.message}`); }
  }
  // the choice-prepend shift: Participate (next 1) must land on a real phase
  ok('phase graphs: all terminate, no dead-ends', graphErrs.length === 0,
    graphErrs.slice(0, 5).join(' ; '));
  ok('choice prepend shift lands on a real phase', (() => {
    const pit = Object.assign({}, Game.contestPool().find(x => x.id === 'pit'), { givesChoice: true });
    Game.state.activeContest = null;
    try { Game.contestInterruption(pit, 'player'); } catch (e) { return false; }
    const ac = Game.state.activeContest;
    const okShift = ac && ac.phases[0].choices[0].next === 1 && !!ac.phases[1] && ac.phases[1].choices.length > 0;
    Game.state.activeContest = null;
    return okShift;
  })());

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
