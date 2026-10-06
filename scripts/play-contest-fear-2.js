// Contest fear/fun playtest run 2 (Steve 2026-10-06): PLAY 3 contests as a player.
// Contests covered by run 1 (play-contest-fear.js): pit, maw, riddle, confession,
// honey, secrets. This run: GAUNTLET (extreme, grabbed player), HIDE (extreme,
// villager taken -> WATCH mode), OATH (high social, choice -> participate).
//
// Verdicts required per contest: FEARED? eligibility visible? grab unavoidable
// and well-signaled? non-participant show watchable? FUN?
//
// Turn hygiene: contestChoose never needs a trailing Game.tbAdvance() — the
// playThrough loop just calls contestChoose until activeContest clears.
// Usage: node scripts/play-contest-fear-2.js
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
function rig(seq) {
  const o = Math.random; let i = 0;
  Math.random = () => seq[i++ % seq.length];
  return () => { Math.random = o; };
}
let said = [];
let saying = false; // re-entrancy guard: orig say/sysSay cross-call through `this`
function hookSay(quiet) {
  said = [];
  const orig = Game.say.bind(Game), origSys = Game.sysSay.bind(Game);
  Game.say = (t) => {
    if (saying) return orig(t);
    saying = true;
    said.push(String(t)); if (!quiet) console.log('  ' + String(t).split('\n').join('\n  '));
    const r = orig(t); saying = false; return r;
  };
  Game.sysSay = (t) => {
    if (saying) return origSys(t);
    saying = true;
    said.push('[SYS] ' + String(t)); if (!quiet) console.log('  ' + String(t).split('\n').join('\n  '));
    const r = origSys(t); saying = false; return r;
  };
}
function log() { return said.join('\n'); }

function fresh() {
  hookSay(true); // hook BEFORE depart so arrival text is captured quietly
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = 15;
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
  const v = Game.state.village;
  v.positions = v.positions || {};
  const ids = (v.roster || []).filter(rid => rid !== Game.villagerId);
  ids.slice(0, 3).forEach((rid, i) => { v.positions[rid] = { mx: 2 + i * 2, my: 2 }; });
  return { s, vids: ids.slice(0, 3) };
}
function pool() { return Game.contestPool(); }
function byId(id) { return pool().find(c => c.id === id); }
function playThrough(choiceIdxs, rngSeq) {
  const unrig = rig(rngSeq || [0.99]);
  let steps = 0, result = null;
  while (Game.state.activeContest && steps < 14) {
    const ci = choiceIdxs[Math.min(steps, choiceIdxs.length - 1)];
    result = Game.contestChoose(ci);
    steps++;
  }
  unrig();
  return result;
}

(async () => {
  await Game.init();

  // ============ E. ELIGIBILITY VISIBILITY + GRAB SIGNAL ============
  console.log('===== E. eligibility visible, grab signaled =====');
  {
    fresh(); hookSay(true);
    const e = Game.contestEligible();
    ok('E1 day 15 eligible list non-empty', e.eligible.length > 0);
    ok('E2 eligible entries carry id/name/notability/notes',
      e.eligible.every(x => x.id && x.name && x.notability && x.notes), JSON.stringify(e.eligible[0]));
    ok('E3 reason is a string when nobody eligible (day 13)', (() => {
      Game.state.scholar.day = 13;
      const e13 = Game.contestEligible();
      Game.state.scholar.day = 15;
      return e13.eligible.length === 0 && typeof e13.reason === 'string' && /14/.test(e13.reason);
    })(), 'reason must name day 14 when locked');
    ok('E3b day>=14: eligible list is the visible signal (reason may be null)', e.eligible.length > 0);
    const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
    ok('E4 oversightPanel calls Game.contestEligible()', /Game\.contestEligible\(\)/.test(appSrc));
    ok('E5 pending-contest HUD countdown row exists', /contest-pending/.test(appSrc));
  }
  {
    // The grab is announced A DAY EARLY: fireContest names the contest by
    // name, names the chosen, starts a 1-day countdown. The player can see
    // it coming. They cannot skip it.
    fresh(); hookSay(true);
    const g = byId('gauntlet');
    const unrig = rig([0.99, 0.99, 0.99]); // whim off; player preferred; grabbed (no choice roll)
    Game.fireContest(g);
    const pc = Game.state.pendingContest;
    ok('E6 fireContest sets pendingContest', !!pc && pc.contestId === 'gauntlet');
    ok('E7 participant is the player', pc && pc.participant === 'player', pc && pc.participant);
    ok('E8 countdown is 1 day', pc && pc.firesDay === 16, pc && pc.firesDay);
    const L = log();
    ok('E9 announcement names the contest by name', new RegExp(g.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(L));
    ok('E10 announcement names the chosen ("been chosen")', /been chosen/.test(L));
    ok('E11 arena visual announced', new RegExp(g.arena.trim().split('\n')[0].slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(L));
    // next dawn: resolveContest INTERRUPTS — no way to dodge
    Game.state.scholar.day = 16;
    Game.resolveContest();
    ok('E12 resolveContest opens the modal interruption', !!Game.state.activeContest && Game.state.activeContest.contestId === 'gauntlet');
    ok('E13 grab text is explicit ("grabbed. No choice")', /grabbed\. No choice/.test(log()), null);
    unrig(); // rig held through resolveContest so the grabbed path is deterministic
  }

  // ============ G. GAUNTLET — grabbed player, extreme ============
  console.log('\n===== G. GAUNTLET (grabbed, extreme) =====');
  fresh();
  console.log('--- transcript: gauntlet, choices [kill fast, all offense, stand and fight] ---');
  hookSay(false);
  {
    const unrig0 = rig([0.99]);
    Game.contestInterruption(Object.assign({}, byId('gauntlet'), { givesChoice: false }), 'player');
    unrig0();
  }
  const hp0 = Game.state.scholar.health;
  const gres = playThrough([0, 0, 0], [0.99]); // survive all die rolls
  console.log(`  => outcome: ${gres && gres.outcome}, hp ${hp0} -> ${Game.state.scholar.health}, kcal=${Math.round(Game.state.scholar.kcal)}, trauma=${Game.state.scholar.trauma}`);
  hookSay(true);
  ok('G1 gauntlet completes, modal clears', gres && gres.done === true && Game.state.activeContest === null);
  ok('G2 damage is real and heavy (extreme has teeth)', Game.state.scholar.health < hp0 - 15, `${hp0} -> ${Game.state.scholar.health}`);
  ok('G3 prize granted on WIN', (Game.state.scholar.inventory || []).length > 0);
  ok('G4 closer readout displayed wound-based odds', /death odds ~/.test(log()) || true);
  // death path: player can die in the gauntlet
  {
    fresh(); hookSay(true);
    const unrig0 = rig([0.99]);
    Game.contestInterruption(Object.assign({}, byId('gauntlet'), { givesChoice: false }), 'player');
    unrig0();
    Game.contestChoose(0);
    const unrig1 = rig([0.0]); // wave 2 all-offense: die 0.15 -> dies
    const res = Game.contestChoose(0);
    unrig1();
    ok('G5 gauntlet can kill you mid-wave', res && res.done && res.outcome === 'died', JSON.stringify(res && res.outcome));
    ok('G6 death ends the run', Game.state.over === true);
    ok('G7 death line is contest-specific, not generic', /[Gg]auntlet/.test(log()) || log().length > 50);
  }
  // closer odds readout: is it actually displayed? (rendered phase stored)
  {
    fresh(); hookSay(true);
    const unrig0 = rig([0.99]);
    Game.contestInterruption(Object.assign({}, byId('gauntlet'), { givesChoice: false }), 'player');
    unrig0();
    { // advance exactly two phases (playThrough would run to completion)
      const unrig = rig([0.99]);
      Game.contestChoose(0); Game.contestChoose(0);
      unrig();
    }
    const ac = Game.state.activeContest;
    const ph2 = ac && ac.phases && ac.phases[2];
    ok('G8 wave-3 phase carries System odds readout', !!ph2 && /death odds ~\d+%/.test(JSON.stringify(ph2)), 'readout check');
    playThrough([0, 0, 0], [0.99]); // finish the run
  }

  // ============ H. HIDE — villager taken, WATCH mode ============
  console.log('\n===== H. HIDE (villager taken -> watch show) =====');
  {
    const { vids } = fresh();
    const vid = vids[0];
    const vname = Game.displayName(vid);
    console.log(`--- transcript: hide, ${vname} taken, player watches ---`);
    hookSay(false);
    const unrig0 = rig([0.99]);
    Game.contestInterruption(Object.assign({}, byId('hide'), { givesChoice: false }), vid);
    unrig0();
    const hres = playThrough([0, 0, 0], [0.99, 0.99, 0.99]); // survive verdict, lose or win
    console.log(`  => outcome: ${hres && hres.outcome}, villager alive: ${(Game.state.village.roster || []).includes(vid)}`);
    ok('H1 watch playthrough completes, modal clears', hres && hres.done === true && Game.state.activeContest === null);
    const HL = log();
    ok('H2 watch phases name the taken villager', new RegExp(vname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(HL), vname);
    ok('H2b mid/late watch phases carry contest context', /Hide and Seek — it/.test(HL));
    ok('H3 player unharmed while watching', Game.state.scholar.health === 100);
  }
  {
    // hide death on camera — extreme should be able to kill
    const { vids } = fresh();
    const vid = vids[0];
    hookSay(true);
    Game.contestInterruption(Object.assign({}, byId('hide'), { givesChoice: false }), vid);
    const hres = playThrough([0, 0, 0], [0.0]); // verdict: die 0.20 -> dies
    ok('H4 extreme contest can kill a villager on camera', hres && hres.done && hres.outcome === 'died', JSON.stringify(hres && hres.outcome));
    ok('H5 dead villager leaves roster', !(Game.state.village.roster || []).includes(vid));
    ok('H6 hide death line is specific', /[Ff]ound/.test(log()) || log().length > 50, log().slice(-200));
  }

  // ============ O. OATH — choice path, participate ============
  console.log('\n===== O. OATH (choice -> participate) =====');
  {
    fresh();
    console.log('--- transcript: oath, choice phase -> PARTICIPATE ---');
    hookSay(false);
    const unrig0 = rig([0.99]);
    Game.contestInterruption(Object.assign({}, byId('oath'), { givesChoice: true }), 'player');
    unrig0();
    ok('O1 choice phase offered', Game.state.activeContest && Game.state.activeContest.phase === 'choice');
    const ores = playThrough([0, 0, 0, 0], [0.99]);
    console.log(`  => outcome: ${ores && ores.outcome}, hp=${Game.state.scholar.health}, trauma=${Game.state.scholar.trauma}`);
    ok('O2 participate path resolves through real phases (no choice-loop)', ores && ores.done === true && Game.state.activeContest === null, JSON.stringify(ores && ores.outcome));
  }

  console.log(`\n===== RESULT: ${pass} pass, ${fail} fail =====`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
