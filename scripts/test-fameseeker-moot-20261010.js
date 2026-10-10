#!/usr/bin/env node
// Break-it fame-seeker round 2, run 2026-10-10 (07:00 CDT).
// Hostile-player attack on the MOOT (contests.js _contestMoot) — the gossip
// lane's "playable contest" for non-fighters (docs/CONTESTS.md: "Non-fighters
// level fully here — gossip is a progression track").
//
// CATCH M1 (EXPLOIT+HONESTY, fixed in src/js/contests.js _contestMoot):
//   The moot's copy promises "Your social capital (trust, fame) sets the
//   base", and the @ontology header promises moot_standing = "trust/10 +
//   notability×2 base". The engine read s.trust / s.notability off
//   state.scholar — fields that NEVER exist (trust lives at
//   state.village.trust[villagerId]; notability at state.notability.player).
//   Result: the base was a FROZEN 5 (50/10 + 0) no matter what. A hostile
//   fame-seeker who ground trust to 90 and stacked 6 deed types got exactly
//   the same moot base as a stranger — fame was mechanically meaningless in
//   the one contest built for the famous. Fix: read the real trust (village
//   trust table, same read as the meal-share code) and the real deed types
//   (the same notes the eligibility panel shows), defaulting to the old 5
//   when no trust entry exists (no balance shift for trust-less states).
//
// HELD (attacks attempted, system resisted — documented, not fixed):
//   - Pull-chasing: no player action anywhere calls fireShow/fireContest;
//     pulls are System-scheduled only (contestTick dawn branch). You cannot
//     demand airtime.
//   - Heckling a villager's show is not a free fame button (prior run): it
//     costs the victim -4/-2 rep, records a 'heckled' memory the village
//     systems can read (conversation/carexplore/convo-mood readers exist),
//     and dings their show resolution -2. The note says what it does.
//   - Cheer-them-on (+1 showbiz favor, free) is single-shot per show pull
//     (one phase, terminal choices) and capped by the 2/week show budget —
//     not a favor printer. Favor still decays 1/day.
//   - Ratings-summons 'refuse' grants showmanship for free but is gated by
//     dip+roll+20%+budget: ~1/12 days expected. Not a notability farm.
//   - Moot walk-out with towering standing still wins (documented design);
//     sway -3 still loses for nobodies. The refusal IS the content either
//     way, narrated.
//
// Run: node scripts/test-fameseeker-moot-20261010.js   (SEED env override)
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

// ---------- seeded RNG (modules capture Math.random at load) ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261010', 10);
Math.random = mulberry32(SEED);

// ---------- boot the full engine ----------
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"]*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: { classList: { remove() {} } } };
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window;
const Game = globalThis.Scattering.Game;

function mkWorld() {
  Game.state.scholar.day = 20;
  const s = Game.state.scholar;
  s.health = 100; s.kcal = 2000; s.trauma = 0; s.exiled = false;
  Game.state.over = false;
  Game.state.activeContest = null;
  Game.state.pendingContest = null;
  Game.state.notability = {};
  const v = Game.state.village;
  v.trust = v.trust || {};
}

function mootBase() {
  const phases = Game._contestMoot({ id: 'moot', risk: 'medium', name: 'Moot' });
  return { base: phases[0]._mootBase, demand: phases[0]._mootDemand };
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const said = [];
  Game.say = (m) => { said.push(String(m)); };
  Game.sysSay = (m) => { said.push(String(m)); };

  // ================= EXPLOIT =================
  console.log('\n[exploit] M1a: fame + trust must move the moot base (the copy promises it)');
  mkWorld(); said.length = 0;
  {
    // Hostile fame-seeker: maxed village trust, stacked deeds.
    Game.state.village.trust[Game.villagerId] = 90;
    Game.addNotability('player', 'showmanship');
    Game.addNotability('player', 'showmanship');
    Game.addNotability('player', 'contestWin');
    Game.addNotability('player', 'survivedMoot');
    const notes = Game.notability('player'); // 3 distinct types
    const { base, demand } = mootBase();
    const expect = Math.round(90 / 10) + notes.length * 2; // 9 + 6 = 15
    ok(base === expect, 'moot base with trust 90 + 3 deed types = ' + base + ' (expect ' + expect + ')');
    ok(demand === 12, 'medium-risk demand still 12 (got ' + demand + ')');
  }

  console.log('\n[exploit] M1b: a nobody still gets the old floor (no balance shift)');
  mkWorld(); said.length = 0;
  {
    // No trust entry, no deeds: the old default was 50/10 + 0 = 5.
    delete Game.state.village.trust[Game.villagerId];
    const { base } = mootBase();
    ok(base === 5, 'moot base with no trust/deeds = ' + base + ' (expect 5, the old floor)');
  }

  console.log('\n[exploit] M1c: trust alone moves it (fame is not the only lever)');
  mkWorld(); said.length = 0;
  {
    Game.state.village.trust[Game.villagerId] = 20;
    const { base } = mootBase();
    ok(base === 2, 'moot base with trust 20, no deeds = ' + base + ' (expect 2)');
  }

  console.log('\n[exploit] M1d: repeats of one deed type count once (legible, matches the panel)');
  mkWorld(); said.length = 0;
  {
    Game.state.village.trust[Game.villagerId] = 50;
    for (let i = 0; i < 8; i++) Game.addNotability('player', 'showmanship');
    const notes = Game.notability('player');
    const { base } = mootBase();
    ok(notes.length === 1, '8 showmanship ticks = 1 deed type (panel shows "audience favorite (8×)")');
    ok(base === 5 + 2, 'moot base = ' + base + ' (expect 7: 5 + 1 type × 2, no repeat-farming)');
  }

  // ================= SOFTLOCK =================
  console.log('\n[softlock] S1: moot plays end-to-end, no stuck phase');
  mkWorld(); said.length = 0;
  {
    Game.state.village.trust[Game.villagerId] = 90;
    Game.addNotability('player', 'showmanship');
    const contest = { id: 'moot', risk: 'medium', name: 'Moot', cat: 'moot' };
    const phases = Game._contestMoot(contest);
    ok(phases.length === 3 && phases.every(p => p.choices && p.choices.length === 3),
      'moot has 3 phases × 3 choices');
    ok(phases.every((p, i) => p.choices.every(c => c.next !== undefined)),
      'every choice advances somewhere (no dead buttons)');
    ok(phases[2].choices.map(c => c.next).includes('MOOT_JUDGE'), 'climax reaches MOOT_JUDGE');
    // Walk out with towering standing: base 11 (9+2) - 3 = 8 < 12: loses, narrated. Played, not stuck.
    const standing = phases[0]._mootBase - 3;
    ok(typeof standing === 'number', 'walk-out standing computes (' + standing + ')');
  }

  console.log('\n[softlock] S2: moot with zero state (no trust table, no notability) does not throw');
  mkWorld(); said.length = 0;
  {
    Game.state.village.trust = {};
    Game.state.notability = {};
    let threw = null;
    try { mootBase(); } catch (e) { threw = e; }
    ok(!threw, 'mootBase computes on bare state' + (threw ? ' — threw: ' + threw.message : ''));
  }

  // ================= HONESTY =================
  console.log('\n[honesty] H1: the played moot verdict agrees with the standing math');
  mkWorld(); said.length = 0;
  {
    // High standing + best rhetorical line: truth(3) + confess(3) + whole-truth(5) = 11 sway.
    Game.state.village.trust[Game.villagerId] = 90; // base 9
    Game.addNotability('player', 'showmanship');    // +2 → base 11
    const phases = Game._contestMoot({ id: 'moot', risk: 'medium', name: 'Moot' });
    const base = phases[0]._mootBase;
    const standing = base + 3 + 3 + 5; // best honest line
    ok(standing >= phases[0]._mootDemand,
      'famous+trusted player arguing honestly clears demand (' + standing + ' >= ' + phases[0]._mootDemand + ')');
    // Same line as a nobody: base 5 + 11 = 16 >= 12 — skill still wins, fame is the edge, not the lock.
    mkWorld();
    const p2 = Game._contestMoot({ id: 'moot', risk: 'medium', name: 'Moot' });
    ok(5 + 11 >= p2[0]._mootDemand, 'a nobody arguing perfectly still clears medium (' + (5 + 11) + ' >= ' + p2[0]._mootDemand + ') — fame is the edge, not the gate');
  }

  console.log('\n[honesty] H2: "TV doesn\'t kill" still holds for show pulls');
  mkWorld(); said.length = 0;
  {
    const show = Game.showPool()[0];
    const phases = Game.showPhases(show, 'player');
    const allDo = phases.flatMap(p => p.choices.map(c => c.do || {}));
    const hasDmg = allDo.some(d => d.dmg);
    // Shows may carry small dmg per the audit, but _showEnd clamps. Check no DIE terminal exists.
    const terms = phases.flatMap(p => p.choices.map(c => c.next));
    ok(!terms.includes('DIE'), 'show phases never route to DIE (TV doesn\'t kill)');
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed (seed ' + SEED + ')');
  if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})();
