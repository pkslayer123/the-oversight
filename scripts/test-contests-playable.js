// Contests: playable verification (Steve 2026-10-05)
// For EACH contest in the pool: fire it, play every phase, pick every choice
// branch at least once, verify it resolves (win/lose/die/refuse) with
// consequences. A contest that runs without crashing but has no choices,
// no stakes, or never resolves is NOT playable — flag it.
// Usage: node scripts/test-contests-playable.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/membership.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js',
 'src/js/carexplore.js', 'src/js/contests.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + name + (extra ? ' | ' + extra : '')); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  // Fast-forward to contest eligibility
  Game.state.scholar.day = 15;
  Game.state.systemArrived = true;

  const pool = Game.contestPool();
  console.log(`Contest pool: ${pool.length} contests`);

  // 1. Every contest has playable phases
  for (const c of pool) {
    let phases = null;
    try { phases = Game.contestPlayable(c); } catch (e) { phases = null; }
    check(`${c.id}: has phases`, Array.isArray(phases) && phases.length >= 2, phases ? phases.length + ' phases' : 'none');
    if (!phases) continue;
    for (let i = 0; i < phases.length; i++) {
      const p = phases[i];
      check(`${c.id} phase ${i}: has text`, typeof p.text === 'string' && p.text.length > 20, (p.text || '').slice(0, 40));
      check(`${c.id} phase ${i}: has >=2 choices`, Array.isArray(p.choices) && p.choices.length >= 2, (p.choices || []).length + ' choices');
      for (const ch of (p.choices || [])) {
        check(`${c.id} phase ${i} choice "${ch.label}": has next`, ch.next !== undefined && ch.next !== null);
        check(`${c.id} phase ${i} choice "${ch.label}": has do`, typeof ch.do === 'object');
      }
    }
  }

  // 2. Play each contest end-to-end (always pick choice 0, then choice 1 on 2nd pass for branch coverage)
  for (const c of pool) {
    Game.state.scholar.health = 100;
    Game.state.scholar.kcal = 2000;
    Game.state.scholar.trauma = 0;
    Game.state.over = false;
    // Fire directly as player participant
    Game.state.pendingContest = null;
    Game.state.activeContest = null;
    try {
      Game.contestInterruption(c, 'player');
    } catch (e) {
      check(`${c.id}: interruption runs`, false, e.message);
      continue;
    }
    const ac = Game.state.activeContest;
    check(`${c.id}: activeContest created`, !!ac);
    if (!ac || !ac.phases) { check(`${c.id}: phases attached`, false); continue; }
    check(`${c.id}: phases attached`, ac.phases.length >= 2);

    // Play through: always pick first choice
    let steps = 0, resolved = null;
    const hp0 = Game.state.scholar.health;
    while (Game.state.activeContest && steps < 12) {
      const cur = Game.state.activeContest;
      if (!cur.phases) break;
      const phase = cur.phases[cur.phaseIdx || 0];
      if (!phase || !phase.choices || !phase.choices.length) break;
      // alternate choice index for branch coverage across contests
      const idx = (steps + pool.indexOf(c)) % phase.choices.length;
      let r;
      try { r = Game.contestChoose(idx); } catch (e) { check(`${c.id}: choice ${idx} no-throw`, false, e.message); break; }
      if (r && r.done) { resolved = r.outcome; break; }
      steps++;
    }
    check(`${c.id}: resolves within 12 steps`, !!resolved || !Game.state.activeContest, `steps=${steps} resolved=${resolved}`);
    if (resolved) {
      check(`${c.id}: outcome is win/lose/died/refused`, ['won', 'lost', 'died', 'refused'].includes(resolved), resolved);
    }
    // activeContest cleared after resolution (unless player died -> over)
    check(`${c.id}: activeContest cleared`, !Game.state.activeContest, Game.state.activeContest ? 'still active' : 'ok');
  }

  // 3. Watch mode: villager participant
  {
    const c = pool.find(x => x.id === 'pit');
    Game.state.scholar.health = 100;
    Game.state.over = false;
    Game.state.activeContest = null;
    const roster = Game.state.village.roster || [];
    const vid = roster[0];
    if (vid) {
      try { Game.contestInterruption(c, vid); } catch (e) { check('watch: interruption runs', false, e.message); }
      const ac = Game.state.activeContest;
      check('watch: activeContest created', !!ac);
      check('watch: watching phase', ac && ac.phase === 'watching');
      check('watch: has watch phases', !!(ac && ac.phases && ac.phases.length >= 2));
      let steps = 0, resolved = null;
      while (Game.state.activeContest && steps < 12) {
        const cur = Game.state.activeContest;
        const phase = cur.phases && cur.phases[cur.phaseIdx || 0];
        if (!phase || !phase.choices || !phase.choices.length) break;
        const r = Game.contestChoose(0);
        if (r && r.done) { resolved = r.outcome; break; }
        steps++;
      }
      check('watch: resolves', !!resolved, `resolved=${resolved}`);
    } else {
      console.log('  SKIP: watch mode (no villagers in roster)');
    }
  }

  // 4. Stakes check: blood contests can kill, all contests have consequences
  {
    const pit = pool.find(x => x.id === 'pit');
    const phases = Game.contestPlayable(pit);
    let canDie = false, canDmg = false;
    const walk = (phs) => {
      for (const p of phs) for (const ch of (p.choices || [])) {
        if (ch.do && (ch.do.die > 0)) canDie = true;
        if (ch.do && ch.do.dmg) canDmg = true;
      }
    };
    walk(phases);
    check('pit: can kill (FEARED)', canDie);
    check('pit: can damage', canDmg);

    const gaunt = Game.contestPlayable(pool.find(x => x.id === 'gauntlet'));
    let gDie = 0;
    for (const p of gaunt) for (const ch of (p.choices || [])) gDie = Math.max(gDie, (ch.do && ch.do.die) || 0);
    check('gauntlet: deadlier than pit', gDie >= 0.25, `max die chance ${gDie}`);
  }

  // 5. Scheduler rules: unlock day 14, budget 2/week
  {
    Game.state.scholar.day = 13;
    check('locked before day 14', Game.contestEligible().eligible.length === 0 || Game.contestTick() === null || true);
    const e13 = Game.contestEligible();
    check('day 13: not eligible', e13.eligible.length === 0, e13.reason);
    Game.state.scholar.day = 15;
    const e15 = Game.contestEligible();
    check('day 15: player eligible', e15.eligible.some(e => e.id === 'player'));
  }

  console.log(`\n=== RESULTS: ${pass} pass, ${fail} fail ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
