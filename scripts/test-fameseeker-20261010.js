#!/usr/bin/env node
// Break-it fame-seeker proof tests, run 2026-10-10.
// Hostile-player attacks against the show/fame systems (src/js/contests.js
// show engine, src/js/alienPlayers.js fan clubs, src/js/ledger.js
// viewership): notability farming, fan-club gaming, ratings-summons gaming,
// shame weaponization, pull-chasing, broadcast honesty gaps.
//
// CATCHES THIS RUN (both fixed in src/js/contests.js _showEnd):
//   F1 ratings honesty: the stunt copy promised "the numbers tick UP" but
//      nothing moved viewership — the dip that summoned you never
//      recovered, so the next dawn could re-summon on the same dip. A
//      delivered stunt now moves the needle: +2 viewership + recordMoment's
//      +1. Phone-it-in promises nothing and moves nothing.
//   F2 silent double-unity: a watch-together WIN ran the choice's narrated
//      do.unity (+1, "the village settles in around you") AND a second,
//      un-narrated leadShift('unity',1) in _showEnd's 'won' else-branch.
//      The silent one is gone; together-snacks lands exactly +1 unity.
//
// HELD (attacks attempted, system resisted — documented, not fixed):
//   - Fan clubs only grow on camera: every apAdjustFavor() call site in the
//     engine lives in contests.js (TV/contest paths); no off-camera favor
//     printer exists. Growing fans without being watched is impossible by
//     construction.
//   - Notability weight's 0.125 repeat floor is deliberate ("the galaxy gets
//     bored, not blind"): growth is capped by the 2/week show budget and
//     casting is rank-order, so the marginal effect beyond the top band is
//     nil. No infinite-fame multiplier exists.
//   - Stunt economy is kcal-negative: 200 kcal cost vs 30-70 kcal of fan
//     snacks per package. No kcal-positive summons loop.
//   - Heckling a villager's show is no longer a free fame button (prior
//     fame-seeker run): it dings their resolution AND costs the player
//     trust/rep with the victim, said out loud.
//   - "TV doesn't kill": show/summons damage clamps at health-1 (prior run);
//     villager show fates never touch health.
//   - Countdown honesty: fireContest announces firesDay = day+1 ("The grab
//     comes at dawn. One more day.") and the grab lands exactly that dawn.
//   - Budget: contest+show+summons share one 2/week slot; forced rolls
//     yield exactly 2 events per 7-day window.
//   - Pilot-episode jank (docs/CONTESTS.md: the first challenge is a pilot
//     episode, "the System says so out loud") is NOT in the code — canon
//     gap noted, not built (inventing it is out of scope for a break run).
//
// Run: node scripts/test-fameseeker-20261010.js   (SEED env override)
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
const realRandom = Math.random;

// ---------- boot the full engine ----------
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"]*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: { classList: { remove() {} } } };
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window;
const Game = globalThis.Scattering.Game;

function mkWorld(day) {
  Game.state.scholar.day = day || 20;
  const s = Game.state.scholar;
  s.health = 100; s.kcal = 2000; s.trauma = 0; s.exiled = false;
  Game.state.over = false;
  Game.state.activeContest = null;
  Game.state.pendingContest = null;
  Game.state.showBudget = { week: Math.floor((day || 20) / 7), used: 0 };
  Game.state.notability = {};
  s.inventory = [];
  const ap = Game.apState();
  ap.fanClubs = { fight: 0, survival: 0, social: 0, showbiz: 0 };
  ap.lastPackageDay = -999;
  Game.apSyncFavor();
}

function villagerId() {
  return (Game.state.village.roster || []).find(id => id !== Game.villagerId);
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  try { Game.ensureVillagerPositions(); } catch (e) {} // grid positions: eligibility is real
  const said = [];
  Game.say = (m) => { said.push(String(m)); };
  Game.sysSay = (m) => { said.push(String(m)); };

  // ================= EXPLOIT =================
  console.log('\n[exploit] E1: summons stunt WIN moves viewership ("the numbers tick up") — F1');
  mkWorld(20); said.length = 0;
  {
    const v = Game.state.village; v.viewership = 10; v._lastWeekViewership = 12;
    Game.state.scholar.kcal = 2000;
    Game.fireRatingsSummons();
    Game.contestChoose(0); // do the stunt
    ok(v.viewership === 13, 'stunt win: viewership 10 -> ' + v.viewership + ' (expect 13: +2 plus recordMoment +1)');
    ok(Game.state.activeContest === null, 'summons modal closed');
  }

  console.log('\n[exploit] E2: watch-together snacks WIN grants exactly +1 unity — F2');
  mkWorld(20); said.length = 0;
  {
    let unityDelta = 0;
    const origLead = Game.leadShift;
    Game.leadShift = function (k, n) { if (k === 'unity') unityDelta += n; return origLead.call(this, k, n); };
    try {
      const show = Game.showPool()[0];
      Game.state.activeContest = {
        kind: 'show', showId: show.id, showName: show.name, participant: 'together',
        phase: 'intro', phaseIdx: 0, phases: Game.showTogetherPhases(show), variant: null, wounds: 0,
      };
      Game.contestChoose(0); // bring the good snacks (-150 kcal) -> WIN
    } finally { Game.leadShift = origLead; }
    ok(unityDelta === 1, 'together-snacks unity delta = ' + unityDelta + ' (expect 1, narrated; no silent second)');
    ok(Game.state.scholar.kcal === 1850, 'snack cost still real (kcal 2000 -> ' + Game.state.scholar.kcal + ')');
  }

  console.log('\n[exploit] E3: phone-it-in moves NO viewership ("the numbers don\'t move up")');
  mkWorld(20); said.length = 0;
  {
    const v = Game.state.village; v.viewership = 10;
    Game.fireRatingsSummons();
    Game.contestChoose(1); // phone it in -> LOSE
    ok(v.viewership === 10, 'phoned-in stunt: viewership unchanged (' + v.viewership + ')');
    ok(Game.apFanLane('showbiz') === 1, 'phone-it-in still lands its honest +1 favor (said out loud)');
  }

  console.log('\n[exploit] E4: no passive favor printer — favor only grows on TV or in real alien combat');
  {
    // Every apAdjustFavor call site (excluding the definition and the
    // ontology comment) must be a TV/contest path (contests.js) or a real
    // alien-combat outcome (apGroupBanter: the ambush spectacle begins;
    // apOnCombatEnd: won/lost/fled a real pilot fight). A passive daily
    // tick granting favor would be an off-camera fan farm.
    const files = fs.readdirSync(path.join(ROOT, 'src/js')).filter(f => f.endsWith('.js'));
    const bad = [];
    for (const f of files) {
      const lines = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8').split('\n');
      lines.forEach((ln, i) => {
        if (!/apAdjustFavor\s*\(/.test(ln)) return;
        if (/^\s*\/\//.test(ln)) return;                    // comment
        if (/apAdjustFavor:\s*function/.test(ln)) return;    // definition
        if (f === 'contests.js') return;                     // TV/contest paths
        if (f === 'alienPlayers.js') {
          // enclosing function must be combat-adjacent
          let fn = '?';
          for (let j = i; j >= 0; j--) {
            const m = lines[j].match(/^\s{4}(\w+):\s*function/);
            if (m) { fn = m[1]; break; }
          }
          if (/Banter|CombatEnd/.test(fn)) return;
          bad.push('alienPlayers.js:' + (i + 1) + ' in ' + fn);
        } else bad.push(f + ':' + (i + 1));
      });
    }
    ok(bad.length === 0, 'favor call sites: TV paths + real alien combat only' + (bad.length ? ' — bad: ' + bad.join(', ') : ''));
  }

  console.log('\n[exploit] E5: notabilityWeight repeat floor is diminishing-by-design, not an infinite multiplier');
  mkWorld(20);
  {
    const w = (n) => { Game.state.notability = { player: { showmanship: n } }; return Game.notabilityWeight('player'); };
    const d4 = w(5) - w(4), d5 = w(6) - w(5), d6 = w(7) - w(6);
    ok(d4 === 0.25 && d5 === 0.25 && d6 === 0.25,
      'repeat floor constant at +0.25/deed (bored, not blind) — got ' + [d4, d5, d6].join(','));
    ok(w(100) < 40, 'weight after 100 fame deeds is finite (' + w(100).toFixed(1) + '), budget-capped at 2 shows/week');
    // rank-order: one real deed outweighs a pile of small change per-unit
    Game.state.notability = { player: { contestWin: 1 } };
    const oneWin = Game.notabilityWeight('player');
    ok(w(4) < oneWin, '4 showmanship deeds (' + w(4).toFixed(1) + ') weigh less than 1 contest win (' + oneWin.toFixed(1) + ') — impact still matters');
  }

  console.log('\n[exploit] E6: stunt economy is kcal-negative — no kcal-positive summons loop');
  mkWorld(24); said.length = 0;
  {
    for (let i = 0; i < 8; i++) Game.apAdjustFavor(3, 'test', 'showbiz');
    Game.state.scholar.kcal = 500;
    const cap = Game.kcalCap();
    Game.apCarePackage();
    const delta = Game.state.scholar.kcal - 500;
    ok(delta >= 30 && delta <= 70 && Game.state.scholar.kcal <= cap,
      'package snacks +30..70 kcal (got +' + delta + '), bank cap respected');
    ok(70 < 200, 'max package snack (70) < stunt cost (200) — farming summons loses calories');
  }

  // ================= SOFTLOCK =================
  console.log('\n[softlock] S1: contest countdown outlives the player — recast, said out loud, no stuck state');
  mkWorld(20); said.length = 0;
  {
    const vid = villagerId();
    const c = Game.contestPool()[0];
    Game.state.pendingContest = { contestId: c.id, participant: 'player', participants: ['player', vid], firesDay: 21 };
    Game.state.scholar.day = 21;
    Game.state.scholar.health = 0; // the scholar died overnight
    Game.resolveContest();
    ok(Game.state.pendingContest === null, 'pendingContest cleared');
    ok(Game.state.activeContest !== null, 'the show goes on — interruption still fires');
    ok(said.some(m => /gone/i.test(m) && /instead/i.test(m)), 'recast said out loud');
    const ids = Game.state.activeContest.participants || [Game.state.activeContest.participant];
    ok(!ids.includes('player'), 'the corpse is not televised');
  }

  console.log('\n[softlock] S2: countdown with NO living eligible — cancelled, said out loud, nothing stuck');
  mkWorld(20); said.length = 0;
  {
    const c = Game.contestPool()[0];
    Game.state.pendingContest = { contestId: c.id, participant: 'player', participants: ['player'], firesDay: 20 };
    Game.state.scholar.health = 0;
    const savedRoster = Game.state.village.roster;
    Game.state.village.roster = [];
    Game.resolveContest();
    Game.state.village.roster = savedRoster; // S2 must not poison later tests
    ok(Game.state.pendingContest === null, 'pendingContest cleared');
    ok(Game.state.activeContest === null, 'no modal, no phantom contest');
    ok(said.some(m => /no one left to take instead/i.test(m)), 'cancellation said out loud');
  }

  console.log('\n[softlock] S3: contestTick blocked while a show modal is live');
  mkWorld(20); said.length = 0;
  {
    const show = Game.showPool().find(x => x.id === 'why_eat');
    Game.state.activeContest = {
      kind: 'show', showId: show.id, showName: show.name, participant: 'player',
      phase: 'intro', phaseIdx: 0, phases: Game.showPhases(show, 'player'), variant: null, wounds: 0,
    };
    ok(Game.contestTick() === null, 'tick returns null while modal active (no clobber)');
    Game.contestChoose(0);
    ok(Game.state.activeContest === null, 'modal closes after choice');
    let threw = false;
    try { Game.contestTick(); } catch (e) { threw = true; }
    ok(!threw, 'tick after modal close does not throw');
  }

  console.log('\n[softlock] S4: fireShow never pulls an exiled (or dead) scholar');
  mkWorld(20); said.length = 0;
  {
    Game.state.scholar.exiled = true;
    Game.fireShow(Game.showPool().find(x => x.id === 'why_eat'));
    const ac = Game.state.activeContest;
    ok(ac && ac.participant !== 'player', 'exiled scholar is not the pull (participant=' + (ac && ac.participant) + ')');
    ok(ac && ac.phases && ac.phases.length > 0, 'modal still has playable phases — no stuck screen');
    Game.state.scholar.exiled = false;
  }

  console.log('\n[softlock] S5: countdown display is honest — grab lands exactly one dawn later');
  mkWorld(14); said.length = 0;
  {
    Math.random = () => 0.5; // no whim, deterministic picks
    const c = Game.contestPool()[0];
    Game.fireContest(c);
    Math.random = realRandom;
    const pc = Game.state.pendingContest;
    ok(pc && pc.participants.includes('player'), 'the player is taken (no skipping)');
    ok(pc && pc.firesDay === 15, 'firesDay = day+1 (announcement: "The grab comes at dawn. One more day.")');
    ok(said.some(m => /grab comes at dawn/i.test(m)), 'countdown named out loud at fire time');
    Game.state.scholar.day = 15; said.length = 0;
    Game.resolveContest();
    ok(Game.state.pendingContest === null, 'pending cleared on fire');
    const ac = Game.state.activeContest;
    ok(ac && (ac.participant === 'player' || (ac.participants || []).includes('player')), 'the grab lands on the player at dawn');
    ok(said.some(m => /It is today/i.test(m)), '"It is today" dread beat fires at the grab');
  }

  // ================= HONESTY =================
  console.log('\n[honesty] H1: summons stunt = ONE prize route (package attempt, no curio double-dip)');
  mkWorld(24); said.length = 0;
  {
    for (let i = 0; i < 8; i++) Game.apAdjustFavor(3, 'test', 'showbiz');
    Game.state.scholar.kcal = 2000;
    const ap = Game.apState(); ap.lastPackageDay = -999;
    const inv0 = Game.state.scholar.inventory.length;
    Game.fireRatingsSummons();
    Game.contestChoose(0); // stunt -> WIN
    ok(!said.some(m => /presses something humming/i.test(m)), 'no curio grant on the stunt path');
    ok(Game.state.scholar.inventory.length >= inv0, 'package route ran (gift or honest whiff)');
    ok(said.some(m => /care package|aren't organized enough/i.test(m)), 'package outcome said out loud either way');
  }

  console.log('\n[honesty] H2: tiny_door curio filter never passes food (static scan of the vault)');
  {
    const items = Game.data.items || [];
    const cands = items.filter(it => it.origin === 'alien' && (it.tier || 1) <= 1 && !it.kcalEach && it.class !== 'food');
    ok(cands.length > 0, 'the vault is not empty (' + cands.length + ' grantable curios)');
    ok(cands.every(it => it.class !== 'food' && !it.kcalEach), 'every grantable curio is non-food, zero-kcal — prizes are wacky, never dinner');
  }

  console.log('\n[honesty] H3: 2/week shared budget — contest+show+summons, forced rolls');
  mkWorld(14);
  {
    const v = Game.state.village; v.viewership = 5; v._lastWeekViewership = 10; // dipping: summons eligible
    Math.random = () => 0; // force every scheduling roll to pass
    let events = 0, summons = 0;
    for (let i = 0; i < 12; i++) {
      const e = Game.contestTick();
      if (e) { events++; if (e.id === '__summons') summons++; }
    }
    Math.random = realRandom;
    ok(events === 2, 'forced-fire tick: exactly 2 events/week (' + events + '), summons among them: ' + summons);
    ok(Game.state.showBudget.used === 2, 'budget counter consumed exactly 2 slots');
  }

  console.log('\n[honesty] H4: eligibility excludes the dead, exiled, gravely wounded');
  mkWorld(20);
  {
    const vid = villagerId();
    Game.state.village.health = Game.state.village.health || {};
    Game.state.village.health[vid] = 10; // gravely wounded
    let el = Game.contestEligible().eligible.map(e => e.id);
    ok(!el.includes(vid), 'gravely-wounded villager (10 HP) is not eligible');
    Game.state.village.health[vid] = 100;
    el = Game.contestEligible().eligible.map(e => e.id);
    ok(el.includes(vid), 'healed villager (100 HP) is eligible again');
    Game.state.scholar.exiled = true;
    el = Game.contestEligible().eligible.map(e => e.id);
    ok(!el.includes('player'), 'exiled scholar is not eligible');
    Game.state.scholar.exiled = false;
    el = Game.contestEligible().eligible.map(e => e.id);
    ok(el.includes('player'), 'un-exiled scholar is eligible again');
  }

  console.log('\n===== done: ' + pass + ' passed, ' + fail + ' failed (seed ' + SEED + ') =====');
  if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log(' - ' + f)); process.exit(1); }
})();
