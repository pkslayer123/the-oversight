// Contest variants expansion — test + playtest driver (Steve 2026-10-06).
// Covers the 5 new contests (tithe, siege, maw, oath, beastmaster) and the
// 8 new shows: pool membership, wave gating, structural termination of EVERY
// contest in the pool (sibling-check for the stuck-phase class), knowledge
// gating, death lines, coaching, and full player-style playthroughs of 2 new
// contests + 2 new shows through the real code paths.
// Usage: node scripts/test-contests-variants.js
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
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function rig(fn) { const o = Math.random; Math.random = fn; return () => { Math.random = o; }; }
function log() { return (Game.log || []).join('\n'); }

function fresh() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = 15;
  Game.state.systemArrived = true;
  s.health = 10000; s.kcal = 3000; s.trauma = 0; // 10k hp: structural runs test flow, not death
  Game.log = [];
  Game.state.showBudget = null;
  Game.state.pendingContest = null;
  Game.state.activeContest = null;
  Game.state.contestsSeen = {};
  Game.state.codex = Game.state.codex || {};
  Game.state.codex.contests = {};
  Game.state.waveKills = {};
  const v = Game.state.village;
  v.positions = v.positions || {};
  const ids = (v.roster || []).filter(rid => rid !== Game.villagerId);
  ids.slice(0, 3).forEach((rid, i) => { v.positions[rid] = { mx: 2 + i * 2, my: 2 }; });
  return { s, vids: ids.slice(0, 3) };
}
function scaled(base) { return Game._contestScaled(Object.assign({}, base), null); }
// Drive one full contest as the player through the REAL path:
// fireContest -> resolveContest -> contestChoose until done.
function playThrough(contestId, choiceIdxs, randVal) {
  fresh();
  const base = Game.contestPool().find(c => c.id === contestId);
  const unrig = rig(() => (randVal !== undefined ? randVal : 0.5)); // no whim, grabbed (no choice branch)
  Game.fireContest(scaled(base));
  Game.resolveContest();
  let res = null, steps = 0;
  while (steps++ < 12 && Game.state.activeContest) {
    const ac = Game.state.activeContest;
    const ci = choiceIdxs[Math.min(ac.phaseIdx || 0, choiceIdxs.length - 1)] || 0;
    res = Game.contestChoose(ci);
    if (res && res.done) break;
  }
  unrig();
  return { res, steps, log: log() };
}

const NEW_CONTESTS = ['tithe', 'siege', 'maw', 'oath', 'beastmaster'];
const NEW_SHOWS = ['hot_take', 'who_farted', 'stare_down', 'crib_mine', 'talent_pit', 'lost_found', 'swear_jar', 'makeover'];

(async () => {
  await Game.init();

  // ============ N1. Pool membership ============
  {
    fresh();
    const pool = Game.contestPool();
    ok('N1 pool grew to 23', pool.length === 23, `got ${pool.length}`);
    for (const id of NEW_CONTESTS) {
      const c = pool.find(x => x.id === id);
      ok(`N1 ${id} in pool with full fields`,
        !!(c && c.name && c.cat && c.risk && c.desc && c.arena && c.participants),
        JSON.stringify(c && { id: c.id, risk: c.risk }));
    }
    const shows = Game.showPool();
    ok('N1 show pool grew to 21', shows.length === 21, `got ${shows.length}`);
    for (const id of NEW_SHOWS) {
      const s = shows.find(x => x.id === id);
      ok(`N1 show ${id} has name+desc`, !!(s && s.name && s.desc));
    }
  }

  // ============ N2. Wave gating ============
  {
    // wave 1: no extremes at all
    fresh();
    let unrig = rig(() => 0.5);
    const w1 = [];
    for (let i = 0; i < 18; i++) { const u2 = rig(() => (i + 0.5) / 18); w1.push(Game.pickContest().id); u2(); }
    unrig();
    ok('N2 wave1: no extreme contests offered', w1.every(id => Game.contestPool().find(c => c.id === id).risk !== 'extreme'), w1.join(','));
    ok('N2 wave1: no tithe/siege/maw/gauntlet', w1.every(id => !['tithe', 'siege', 'maw', 'gauntlet'].includes(id)));
    // wave 2: extremes except gauntlet+siege
    fresh();
    Game.state.waveKills = { 1: 4 };
    unrig = rig(() => 0.5);
    const w2 = [];
    for (let i = 0; i < 21; i++) { const u2 = rig(() => (i + 0.5) / 21); w2.push(Game.pickContest().id); u2(); }
    unrig();
    ok('N2 wave2: tithe offered', w2.includes('tithe'));
    ok('N2 wave2: maw offered', w2.includes('maw'));
    ok('N2 wave2: siege NOT offered', !w2.includes('siege'));
    ok('N2 wave2: gauntlet NOT offered', !w2.includes('gauntlet'));
    // wave 3: siege joins
    fresh();
    Game.state.scholar.day = 30;
    Game.state.waveKills = { 2: 8 };
    unrig = rig(() => 0.5);
    const w3 = [];
    for (let i = 0; i < 23; i++) { const u2 = rig(() => (i + 0.5) / 23); w3.push(Game.pickContest().id); u2(); }
    unrig();
    ok('N2 wave3: siege offered', w3.includes('siege'));
    ok('N2 wave3: gauntlet offered', w3.includes('gauntlet'));
  }

  // ============ N3. Structural termination (ALL contests — stuck-phase sibling check) ============
  {
    fresh();
    const pool = Game.contestPool();
    let allOk = true, bad = [];
    for (const base of pool) {
      const phases = Game.contestPlayable(scaled(base));
      if (!phases || !phases.length) { allOk = false; bad.push(base.id + ':no-phases'); continue; }
      for (let i = 0; i < phases.length; i++) {
        const ph = phases[i];
        if (!ph.choices || !ph.choices.length) { allOk = false; bad.push(base.id + ':phase' + i + ':no-choices'); continue; }
        for (const ch of ph.choices) {
          const nx = ch.next;
          const terminal = ['WIN', 'LOSE', 'DIE', 'REFUSE'].includes(nx);
          if (!terminal && !(Number.isInteger(nx) && nx > i && nx < phases.length)) {
            allOk = false; bad.push(`${base.id}:phase${i}:bad-next(${JSON.stringify(nx)})`);
          }
        }
      }
      // DFS: every path from phase 0 must reach a terminal within phases.length steps
      const seen = new Set();
      const stack = [[0, 0]];
      let terminates = true;
      while (stack.length) {
        const [pi, depth] = stack.pop();
        if (depth > phases.length + 1) { terminates = false; break; }
        const key = pi + ':' + depth;
        if (seen.has(key)) continue;
        seen.add(key);
        for (const ch of phases[pi].choices) {
          if (['WIN', 'LOSE', 'DIE', 'REFUSE'].includes(ch.next)) continue;
          stack.push([ch.next, depth + 1]);
        }
      }
      if (!terminates) { allOk = false; bad.push(base.id + ':non-terminating-path'); }
    }
    ok('N3 every contest structurally terminates (no stuck phases)', allOk, bad.join('; '));
  }

  // ============ N4. Full drive of every contest through real code path ============
  {
    let allDone = true, bad = [];
    for (const base of Game.contestPool()) {
      const { res, steps } = playThrough(base.id, [0, 0, 0, 0], 0.99);
      const cleared = Game.state.activeContest === null;
      if (!(res && res.done && cleared)) { allDone = false; bad.push(`${base.id}:steps=${steps}`); }
    }
    ok('N4 all 23 contests drive to completion via real path', allDone, bad.join('; '));
  }

  // ============ N5. Death lines bespoke for new contests ============
  {
    fresh();
    let bespoke = true, bad = [];
    for (const id of NEW_CONTESTS) {
      const base = Game.contestPool().find(c => c.id === id);
      const line = Game._contestDeathLine(base, 'x', 'You');
      const lineV = Game._contestDeathLine(base, 'x', 'Mira');
      if (!line || /did not come home/.test(line) || !lineV || /did not come home/.test(lineV)) {
        bespoke = false; bad.push(id);
      }
    }
    ok('N5 new contests have bespoke death lines (player + villager)', bespoke, bad.join(','));
  }

  // ============ N6. Coaching lines + knowledge gating ============
  {
    fresh();
    let coached = true, bad = [];
    for (const id of NEW_CONTESTS) {
      Game.contestLearn(id, 'won'); Game.contestLearn(id, 'won'); // seen=4 -> level 2
      const base = Game.contestPool().find(c => c.id === id);
      const coach = Game._cxCoaching(base);
      if (!coach || coach.length < 10) { coached = false; bad.push(id); }
    }
    ok('N6 coaching unlocks at level 2 for all new contests', coached, bad.join(','));
    // Tithe measure gating: blind vs knowledgeable intro
    fresh();
    const titheBase = Game.contestPool().find(c => c.id === 'tithe');
    const blindPhases = Game.contestPlayable(scaled(titheBase));
    ok('N6 tithe blind: intro hides the measure', !/THREE full measures/.test(blindPhases[0].text));
    ok('N6 tithe blind: stopping loses', blindPhases[2].choices[0].next === 'LOSE');
    Game.contestLearn('tithe', 'won'); Game.contestLearn('tithe', 'won');
    const wisePhases = Game.contestPlayable(scaled(titheBase));
    ok('N6 tithe level2: intro reveals the measure', /THREE full measures/.test(wisePhases[0].text));
    ok('N6 tithe level2: knowing stop wins', wisePhases[2].choices[0].next === 'WIN');
  }

  // ============ P1/P2. PLAYTEST: The Blood Tithe (blind, then knowledgeable) ============
  {
    // Blind run: bleed blind, stop early -> LOSE (the altar finds you wanting)
    const r1 = playThrough('tithe', [0, 2, 0], 0.99);
    ok('P1 tithe blind run resolves (not stuck)', !!(r1.res && r1.res.done));
    ok('P1 tithe blind stop-early loses', r1.res.outcome === 'lost', r1.res.outcome);
    ok('P1 tithe announces the altar', /BLEED FOR US/.test(r1.log));
    // Knowledgeable run: the knowing stop -> WIN
    fresh();
    Game.contestLearn('tithe', 'won'); Game.contestLearn('tithe', 'won');
    const base = Game.contestPool().find(c => c.id === 'tithe');
    const unrig = rig(() => 0.99);
    Game.fireContest(scaled(base));
    Game.resolveContest();
    const ac = Game.state.activeContest;
    ok('P2 tithe level2 intro shows the measure', /THREE full measures/.test(ac.phases[0].text));
    Game.contestChoose(1); // a real cut
    Game.contestChoose(0); // a little more
    const r2 = Game.contestChoose(0); // stop: three is the measure
    unrig();
    ok('P2 tithe knowledgeable run wins', !!(r2 && r2.done && r2.outcome === 'won'), JSON.stringify(r2 && r2.outcome));
    ok('P2 modal clears', Game.state.activeContest === null);
  }

  // ============ P3. PLAYTEST: Siege ============
  {
    const r = playThrough('siege', [0, 1, 0], 0.99); // fortify, fall back, hold the line
    ok('P3 siege resolves (not stuck)', !!(r.res && r.res.done));
    ok('P3 siege hold-the-line wins', r.res.outcome === 'won', r.res.outcome);
    ok('P3 siege: village watches from the walls', /watching from the walls/.test(r.log));
    ok('P3 siege: wave two feint beat plays', /feint at the barricade/.test(r.log));
  }

  // ============ P4. PLAYTEST: 2 new shows ============
  {
    fresh();
    const show1 = Game.showPool().find(s => s.id === 'who_farted');
    let unrig = rig(() => 0.1); // 0.1 < 0.7 -> a villager gets pulled
    const ret1 = Game.fireShow(show1);
    unrig();
    ok('P4 who_farted fires', ret1 && ret1.id === 'who_farted');
    ok('P4 who_farted pulls a villager', /The cameras want/.test(log()), log().slice(0, 200));
    fresh();
    const show2 = Game.showPool().find(s => s.id === 'swear_jar');
    unrig = rig(() => 0.9); // 0.9 > 0.7 -> village watches together
    const ret2 = Game.fireShow(show2);
    unrig();
    ok('P4 swear_jar fires', ret2 && ret2.id === 'swear_jar');
    ok('P4 swear_jar watch-together path', /watches together/.test(log()));
  }

  // ============ P5. Refuse path still resolves (tithe) ============
  {
    fresh();
    const base = Game.contestPool().find(c => c.id === 'tithe');
    const vals = [0.5, 0.15]; // no whim; choice branch offered
    let i = 0;
    const unrig = rig(() => vals[Math.min(i++, vals.length - 1)]);
    Game.fireContest(scaled(base));
    Game.resolveContest();
    const ac = Game.state.activeContest;
    ok('P5 choice branch offered', !!(ac && ac.phase === 'choice'), ac && ac.phase);
    const r = Game.contestChoose(1); // Refuse
    unrig();
    ok('P5 refusal resolves (sequence, not skip)', !!(r && r.done && r.outcome === 'refused'));
    ok('P5 modal clears after refusal', Game.state.activeContest === null);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
