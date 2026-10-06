// Contest system flesh-out audit (Steve 2026-10-06).
// Plays the contest system end-to-end like a player: eligibility, firing
// cadence, the unavoidable interruption sequence (player + watch paths),
// fear stakes (closer odds, death lines), knowledge progression, and
// structural validity of every contest in the pool.
// Usage: node scripts/test-contests-flesh.js
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
  s.health = 100; s.kcal = 3000; s.trauma = 0;
  Game.log = [];
  Game.state.showBudget = null;
  Game.state.pendingContest = null;
  Game.state.activeContest = null;
  Game.state.contestsSeen = {};
  Game.state.codex = Game.state.codex || {};
  Game.state.codex.contests = {};
  const v = Game.state.village;
  v.positions = v.positions || {};
  const ids = (v.roster || []).filter(rid => rid !== Game.villagerId);
  ids.slice(0, 3).forEach((rid, i) => { v.positions[rid] = { mx: 2 + i * 2, my: 2 }; });
  return { s, vids: ids.slice(0, 3) };
}
function pit() { return Game.contestPool().find(c => c.id === 'pit'); }

(async () => {
  await Game.init();

  // ============ A. ELIGIBILITY ============
  {
    fresh();
    Game.state.scholar.day = 13;
    const e13 = Game.contestEligible();
    ok('A1 day<14: nobody eligible', e13.eligible.length === 0);
    ok('A2 day<14: reason says when', /14/.test(e13.reason || ''));
    ok('A3 day<14: tick silent', Game.contestTick() === null);

    const { vids } = fresh();
    const e15 = Game.contestEligible();
    ok('A4 day15: player eligible', e15.eligible.some(e => e.id === 'player'));
    ok('A5 day15: villagers with positions eligible',
      vids.every(id => e15.eligible.some(e => e.id === id)), JSON.stringify(vids));
    ok('A6 eligibility carries notability notes',
      e15.eligible.every(e => Array.isArray(e.notability)));
  }

  // ============ B. CADENCE: max 2/week, weekly reset, no stacking ============
  {
    fresh();
    const unrig = rig(() => 0.05); // always fires, always a contest
    let events = 0;
    for (let d = 15; d <= 20; d++) { // days 15-20 are all budget-week 2
      Game.state.scholar.day = d;
      Game.state.pendingContest = null;
      if (Game.contestTick()) events++;
    }
    ok('B1 weekly budget caps at 2', events <= 2, `fired ${events}`);
    Game.state.scholar.day = 22; // new week
    Game.state.pendingContest = null;
    ok('B2 budget resets next week', Game.contestTick() !== null);
    unrig();
  }
  {
    fresh();
    Game.state.pendingContest = { contestId: 'pit', participant: 'player', firesDay: 16 };
    const unrig = rig(() => 0.05);
    ok('B3 no second fire while one is pending', Game.contestTick() === null);
    unrig();
    Game.state.pendingContest = null;
    Game.state.activeContest = { contestId: 'pit', participant: 'player', phase: 'intro', phaseIdx: 0, phases: Game.contestPlayable(pit()) };
    const unrig2 = rig(() => 0.05);
    ok('B4 no new fire while a contest is unresolved', Game.contestTick() === null);
    unrig2();
  }

  // ============ C. UNAVOIDABLE SEQUENCE: fire -> resolve -> play through ============
  {
    fresh();
    const unrig = rig(() => 0.5); // no whim, no choice branch (grabbed)
    Game.fireContest(pit());
    const pc = Game.state.pendingContest;
    ok('C1 fire sets pendingContest', !!pc && pc.contestId === 'pit');
    ok('C2 countdown is 1 day', pc.firesDay === 16, `firesDay=${pc.firesDay}`);
    Game.resolveContest();
    const ac = Game.state.activeContest;
    ok('C3 resolve opens modal interruption', !!ac && ac.phases && ac.phases.length === 3);
    ok('C4 interruption announces', /CONTEST INTERRUPTION/.test(log()));
    // play through: always first choice, survive dice
    const unrig2 = rig(() => 0.99);
    let res = null, steps = 0;
    while (steps++ < 10 && Game.state.activeContest) {
      res = Game.contestChoose(0);
      if (res && res.done) break;
    }
    ok('C5 sequence completes (not stuck)', !!(res && res.done), `steps=${steps}`);
    ok('C6 modal clears after resolution', Game.state.activeContest === null);
    ok('C7 fear stakes: damage or death happened',
      ['won', 'lost', 'died'].includes(res && res.outcome));
    unrig2(); unrig();
  }
  {
    // CHOICE BRANCH: Participate must advance, not loop (the stuck bug)
    fresh();
    const contest = pit();
    const unrig = rig(() => 0.05); // givesChoice: 0.05 < 0.3 -> choice offered
    Game.contestInterruption(contest, 'player');
    unrig();
    const ac = Game.state.activeContest;
    ok('C8 choice phase offered', ac && ac.phases.length === 4 && ac.phases[0].choices[0].label === 'Participate');
    Game.contestChoose(0); // Participate
    ok('C9 Participate ADVANCES (no self-loop)',
      Game.state.activeContest && Game.state.activeContest.phaseIdx === 1,
      `phaseIdx=${Game.state.activeContest && Game.state.activeContest.phaseIdx}`);
    // Refuse path: a sequence, not a skip
    fresh();
    const unrig2 = rig(() => 0.05);
    Game.contestInterruption(pit(), 'player');
    unrig2();
    const r = Game.contestChoose(1); // Refuse
    ok('C10 Refuse is a played sequence', r && r.done && r.outcome === 'refused');
    ok('C11 Refuse clears modal', Game.state.activeContest === null);
    ok('C12 Refuse has a cost (trauma)', Game.state.scholar.trauma > 0);
  }

  // ============ D. WATCH PATH: villager taken, you watch ============
  {
    const { s, vids } = fresh();
    const vid = vids[0];
    const unrig = rig(() => 0.5);
    Game.fireContest(pit());
    Game.state.pendingContest.participant = vid;
    Game.resolveContest();
    unrig();
    const ac = Game.state.activeContest;
    ok('D1 watch mode opens', !!ac && ac.participant === vid);
    ok('D2 watch announces the taken villager', new RegExp(Game.displayName(vid).split(' ')[0]).test(log()));
    const unrig2 = rig(() => 0.99);
    let res = null, steps = 0;
    while (steps++ < 10 && Game.state.activeContest) {
      res = Game.contestChoose(0);
      if (res && res.done) break;
    }
    unrig2();
    ok('D3 watch sequence completes', !!(res && res.done));
    ok('D4 watcher takes no contest damage', s.health === 100, `hp=${s.health}`);
    ok('D5 villager survives a non-death watch', (Game.state.village.roster || []).includes(vid) || (res && res.outcome === 'died'));
  }
  {
    // Villager death on camera must kill the VILLAGER, never the player
    const { vids } = fresh();
    const vid = vids[0];
    const c = pit();
    Game.state.activeContest = {
      contestId: 'pit', participant: vid, phase: 'watching', phaseIdx: 0,
      phases: Game._contestWatchPhases(c, vid), variant: null, wounds: 0,
    };
    const hpBefore = Game.state.scholar.health;
    Game._contestDie(Game.state.activeContest, 'test death');
    ok('D6 villager death does not kill the player',
      Game.state.scholar.health === hpBefore && !Game.state.over);
    ok('D7 dead villager leaves the roster',
      !(Game.state.village.roster || []).includes(vid));
    ok('D8 death has a bespoke line', /fed the Pit|Pit/i.test(log()));
  }

  // ============ E. FEAR: gauntlet closer odds are readable ============
  {
    fresh();
    const stand40 = Game._contestCloserOdds('stand', 40);
    const run40 = Game._contestCloserOdds('run', 40);
    ok('E1 stand riskier than run', stand40 > run40, `${stand40} vs ${run40}`);
    ok('E2 odds scale with wounds',
      Game._contestCloserOdds('stand', 40) > Game._contestCloserOdds('stand', 5));
    ok('E3 odds capped', Game._contestCloserOdds('stand', 999) <= 0.45);
    // The odds must be visible where the choice is made (stored into phases)
    const { s } = fresh();
    s.health = 10000;
    const g = Game.contestPool().find(c => c.id === 'gauntlet');
    const unrig = rig(() => 0.5);
    Game.contestInterruption(g, 'player');
    unrig();
    const unrig2 = rig(() => 0.99);
    Game.contestChoose(0); Game.contestChoose(0); // reach the closer
    unrig2();
    const ac = Game.state.activeContest;
    const closerText = ac && ac.phases[2] && ac.phases[2].text;
    ok('E4 closer readout stored in the phase the box renders',
      !!closerText && /System helpfully displays your odds/.test(closerText));
    const closerSubs = (ac && ac.phases[2].choices || []).map(c => c.sub).join(' ');
    ok('E5 per-choice death odds shown', /death odds ~\d+%/.test(closerSubs), closerSubs.slice(0, 80));
  }

  // ============ F. VARIANT survives fire -> resolve ============
  {
    fresh();
    Game.state.contestsSeen = { pit: 1 };
    const unrig = rig(() => 0.0); // pick index 0 (pit), variant roll 0.0 < 0.3
    const scaled = Game.pickContest();
    ok('F1 hardened variant can roll', scaled.variant === 'hardened', scaled.name);
    Game.fireContest(scaled);
    Game.log = []; // the fire announcement also says HARDENED; we test the interruption
    Game.resolveContest(); // rebuilds from pool — variant must survive
    unrig();
    ok('F2 HARDENED announced at interruption (not dropped)',
      /HARDENED VARIANT/.test(log()));
  }

  // ============ G. KNOWLEDGE: earned, gated, veteran ============
  {
    fresh();
    ok('G1 no coaching before level 2', Game._cxCoaching(pit()) === '');
    Game.contestLearn('pit', 'lost');
    ok('G2 level 1 after one survival', Game.contestKnowledge('pit').level === 1);
    Game.contestLearn('pit', 'watched');
    ok('G3 level 2 after more exposure', Game.contestKnowledge('pit').level === 2);
    ok('G4 coaching appears at level 2', /What you know/.test(Game._cxCoaching(pit())));
    Game.contestLearn('pit', 'won'); Game.contestLearn('pit', 'won');
    ok('G5 veteran at level 3', Game.contestKnowledge('pit').level === 3);
    // veteran reads the hits coming: damage reduced
    const { s } = fresh();
    s.health = 100;
    Game.contestLearn('pit', 'won'); Game.contestLearn('pit', 'won');
    Game.contestLearn('pit', 'won'); Game.contestLearn('pit', 'won');
    const unrig = rig(() => 0.5); // dmg roll mid-range
    Game.contestInterruption(pit(), 'player');
    unrig();
    const hpBefore = s.health;
    const unrig2 = rig(() => 0.5);
    Game.contestChoose(0); // Spear (no dmg) -> phase 1
    Game.contestChoose(0); // Hold ground: dmg [8,18]
    unrig2();
    ok('G6 veteran damage reduction applied',
      /read it coming/.test(log()), `hp ${hpBefore} -> ${s.health}`);
  }

  // ============ H. EVERY contest is structurally playable ============
  {
    fresh();
    const pool = Game.contestPool();
    ok('H0 pool is substantial', pool.length >= 15, `pool=${pool.length}`);
    let bad = 0;
    for (const c of pool) {
      let phases;
      try { phases = Game.contestPlayable(c); } catch (e) { phases = null; }
      if (!phases || !phases.length) { console.log(`  H-bad ${c.id}: no phases`); bad++; continue; }
      phases.forEach((p, i) => {
        if (!p.choices || !p.choices.length) { console.log(`  H-bad ${c.id} phase ${i}: no choices`); bad++; }
        (p.choices || []).forEach((ch, j) => {
          const nx = ch.next;
          const validTerm = ['WIN', 'LOSE', 'DIE', 'REFUSE'].includes(nx);
          const validIdx = Number.isInteger(nx) && nx >= 0 && nx < phases.length && nx !== i;
          if (!validTerm && !validIdx) { console.log(`  H-bad ${c.id} p${i} c${j}: next=${nx}`); bad++; }
        });
      });
      // death line exists and is bespoke
      const dl = Game._contestDeathLine(c, 'x', 'You');
      if (/did not come home/.test(dl)) { console.log(`  H-bad ${c.id}: generic death line`); bad++; }
    }
    ok('H1 all contests structurally sound', bad === 0, `${bad} problems`);
  }

  // ============ I. WALK every contest to a terminal (no stuck, no throw) ============
  {
    let bad = 0;
    for (const c of Game.contestPool()) {
      fresh();
      const { s } = { s: Game.state.scholar };
      s.health = 10000; s.kcal = 5000;
      const unrig = rig(() => 0.5); // grabbed, no choice phase
      try { Game.contestInterruption(c, 'player'); } catch (e) { console.log(`  I-bad ${c.id}: interruption threw ${e.message}`); bad++; unrig(); continue; }
      unrig();
      if (!Game.state.activeContest) { console.log(`  I-bad ${c.id}: no activeContest`); bad++; continue; }
      const unrig2 = rig(() => 0.99); // survive all dice
      let res = null, steps = 0;
      try {
        while (steps++ < 15 && Game.state.activeContest) {
          res = Game.contestChoose(0);
          if (res && res.done) break;
        }
      } catch (e) { console.log(`  I-bad ${c.id}: choose threw ${e.message}`); bad++; }
      unrig2();
      if (!(res && res.done)) { console.log(`  I-bad ${c.id}: stuck after ${steps} steps`); bad++; }
      else if (!['won', 'lost', 'died'].includes(res.outcome)) { console.log(`  I-bad ${c.id}: odd outcome ${res.outcome}`); bad++; }
      if (Game.state.activeContest !== null) { console.log(`  I-bad ${c.id}: modal not cleared`); bad++; }
    }
    ok('I1 every contest walks to a terminal', bad === 0, `${bad} problems`);
  }

  // ============ J. SHOWS + small polish ============
  {
    fresh();
    const shows = Game.showPool();
    ok('J1 show pool expanded', shows.length >= 8, `shows=${shows.length}`);
    const drawn = Game.pickShow();
    ok('J2 pickShow draws from pool', drawn && shows.some(s => s.id === drawn.id));
    // whim grammar: never "You is / You goes"
    const unrig = rig(() => 0.05); // whim fires, picks eligible[0] = player
    Game.fireContest(pit());
    unrig();
    ok('J3 whim grammar for player', !/You is|You goes/.test(log()));
    // prefix discipline
    Game.log = [];
    Game._cxPhaseSay('📺 already prefixed');
    ok('J4 no double 📺', !/📺 📺/.test(log()));
    // fireShow: someone gets pulled away for a silly reason
    fresh();
    const unrigS = rig(() => 0.05); // 0.05 < 0.7 -> a villager is pulled
    const sh = Game.fireShow(Game.showPool()[0]);
    unrigS();
    ok('J5 fireShow pulls a villager', !!sh && /The cameras want/.test(log()));
    ok('J6 pulled villager is noted', /The cameras want/.test(log()));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
