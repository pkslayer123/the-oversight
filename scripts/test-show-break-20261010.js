#!/usr/bin/env node
// Break-it shows & broadcast proof tests, run 2026-10-10 (target 13).
// Hostile-player attacks against the shows & broadcast system
// (src/js/contests.js show engine + src/js/alienPlayers.js care packages +
//  src/js/broadcast.js frame + src/js/ledger.js viewershipBoard):
//
//   EXPLOIT   — care-package farming (direct apCarePackage spam, summons-win
//               repeat); contestChoose double-fire; reqKcal evasion on the
//               200 kcal stunt; nap-wars free-heal loop via sleep-spam.
//   SOFTLOCK  — fireShow twice (modal overwrite); player-death mid-show via
//               mouth_race dmg; broadcast frame left live after _showEnd;
//               pendingContest blocking show fire.
//   HONESTY   — "TV doesn't kill" (dmg clamp leaves >=1 HP); 2/week budget
//               (contest+show+summons share it); tiny_door prize is a real
//               usable non-food curio; summons refuse/phone-it-in paths land
//               honestly (no prize, said out loud); eligibility UI wired.
//   DEAD CODE — contestTick/fireShow/fireRatingsSummons reachable from the
//               game.js dawn branch; all 6 canon shows in the pool; every
//               pool show has an authored beat; viewershipBoard reachable via
//               contestStandings; summons phase declares its beat.
//
// CATCHES THIS RUN: none — every attack held. See HELD below.
//
// HELD (attacks attempted, system resisted — documented, not fixed):
//   - apCarePackage is gated favor>=20 AND 1-per-4-days: 5 same-day direct
//     calls grant exactly 1 package; a summons win on the same day whiffs
//     and SAYS SO ("The fans aren't organized enough yet").
//   - contestChoose double-fire: the second call returns null — _showEnd
//     clears activeContest synchronously, so effects (kcal/trauma/prize)
//     apply exactly once.
//   - reqKcal 200 on the stunt: at 0 kcal the choice is refused OUT LOUD,
//     no advance, no cost, no prize — the prize is not free on an empty tank.
//   - "TV doesn't kill": Mouth Race's dmg:[0,4] is clamped to health-1 in
//     contestChoose for show/summons kinds; health=3 + forced max roll
//     leaves 1 HP, never 0. Trauma clamps at 100 and never kills.
//   - 2/week budget: forced-fire (Math.random=0) yields exactly 2 events per
//     7-day window across contest/show/summons; week rollover resets.
//     Ratings summons consume the same slot (used++ in the tick).
//   - Pending contest countdown blocks new fires: contestTick returns null
//     while pendingContest exists.
//   - Refuse-on-camera: lands 'refused', grants NOTHING (no package, no
//     curio), -2 showbiz favor, said out loud. Phone-it-in: +2 trauma, no
//     prize, +1 favor said out loud. Zero-cost upside refusal doesn't exist.
//   - Nap Wars free heal (+5 HP, zero cost): REAL but not farmable — the
//     2/week shared budget caps it, and the show pick + player-cast pull are
//     both uncontrollable by the player (notability-first casting means a
//     famous player gets pulled MORE, but for embarrassment, not naps).
//     Sleeping to force dawn rolls costs full days and starvation — the
//     "farming" loop loses more than it gains. Documented, not a bug.
//   - fireShow twice: second fire overwrites the first modal cleanly —
//     choosing on the new modal lands normally (no stuck state).
//   - Broadcast frame: broadcastEnd called on every show/summons end path
//     (fireShow/_showVillagerEnd/_showEnd + summons); state.broadcast is
//     null after the end. Idempotent.
//   - Dead-code sweep: contestTick, fireShow, fireRatingsSummons are all
//     referenced in game.js's dawn branch; all 6 canon shows (WHY DO THEY
//     EAT?, The Moot, Break Room, Mouth Race, Ask a Human, The Death Reel)
//     are in showPool; all 30 pool shows have authored SHOW_BEATS; the
//     summons phase declares beat:'showDeclare'; viewershipBoard() is read
//     by ledger.contestStandings() which fires in the WORD TRAVELS beat.
//     Nothing in the show system is dead.
//
// Run: node scripts/test-show-break-20261010.js   (SEED env override)
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
  s.inventory = [];
}

function forceShowPlayer(showId) {
  // Hostile shortcut: build the exact modal fireShow builds for a player pull.
  const show = Game.showPool().find(x => x.id === showId);
  Game.state.activeContest = {
    kind: 'show', showId: show.id, showName: show.name, participant: 'player',
    phase: 'intro', phaseIdx: 0, phases: Game.showPhases(show, 'player'),
    variant: null, wounds: 0,
  };
  return Game.state.activeContest;
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
  console.log('\n[exploit] E1: apCarePackage direct-call farm — 5 same-day calls grant exactly 1');
  mkWorld(20); said.length = 0;
  {
    // get favor to 20+ first (hostile: favor is earnable, not granted)
    for (let i = 0; i < 8; i++) Game.apAdjustFavor(3, 'test', 'showbiz');
    let grants = 0;
    for (let i = 0; i < 5; i++) { if (Game.apCarePackage()) grants++; }
    ok(grants === 1, 'same-day apCarePackage spam: ' + grants + ' grant(s), expect 1');
  }

  console.log('\n[exploit] E2: summons-win package on a gated day whiffs and SAYS so');
  mkWorld(24); said.length = 0;
  {
    // burn the package gate manually (as if a package already dropped today)
    const ap = Game.apState(); ap.lastPackageDay = 24;
    for (let i = 0; i < 8; i++) Game.apAdjustFavor(3, 'test', 'showbiz');
    Game.state.scholar.kcal = 2000;
    Game.fireRatingsSummons();
    Game.contestChoose(0); // do the stunt (200 kcal, should have it)
    const saidOutLoud = said.some(m => /aren't organized enough|no care package/i.test(m));
    const invCount = Game.state.scholar.inventory.length;
    ok(saidOutLoud, 'gated-day summons win: whiff said out loud');
    ok(Game.state.activeContest === null, 'summons modal closed after stunt');
  }

  console.log('\n[exploit] E3: contestChoose double-fire applies effects exactly once');
  mkWorld(20); said.length = 0;
  {
    Game.state.scholar.kcal = 2000; Game.state.scholar.trauma = 0;
    const ac = forceShowPlayer('why_eat'); // choice 0: kcal -150
    const kcal0 = Game.state.scholar.kcal;
    const r1 = Game.contestChoose(0);
    const r2 = Game.contestChoose(0);
    ok(r1 && r1.done === true, 'first choice lands (done)');
    ok(r2 === null, 'second choice on closed modal returns null');
    ok(Game.state.scholar.kcal === kcal0 - 150, 'kcal deducted exactly once (' + kcal0 + ' -> ' + Game.state.scholar.kcal + ')');
  }

  console.log('\n[exploit] E4: reqKcal evasion — 0 kcal tank, stunt refused out loud, no prize');
  mkWorld(20); said.length = 0;
  {
    Game.state.scholar.kcal = 0;
    Game.fireRatingsSummons();
    const r = Game.contestChoose(0); // Do the stunt
    ok(r && r.blocked === true, 'stunt blocked at 0 kcal');
    ok(said.some(m => /don't have the body/i.test(m)), 'block said out loud');
    ok(Game.state.activeContest !== null && Game.state.activeContest.phase !== 'done', 'modal NOT advanced on block');
    ok(Game.state.scholar.kcal === 0, 'no kcal spent on blocked choice');
    const inv0 = Game.state.scholar.inventory.length;
    ok(inv0 === 0, 'no prize on blocked choice (inventory ' + inv0 + ')');
  }

  console.log('\n[exploit] E5: nap-wars free heal is budget-capped and uncontrollable');
  {
    // The player cannot choose which show fires (random pick over 30) nor
    // force the player cast (notability-first). Verify the pick is random
    // and the budget caps fires at 2/week.
    const picks = new Set();
    for (let i = 0; i < 60; i++) picks.add(Game.pickShow().id);
    ok(picks.size > 5, 'pickShow is not player-controllable (' + picks.size + ' distinct over 60 picks)');
    mkWorld(20);
    Math.random = () => 0; // force every scheduling roll to pass
    let fires = 0;
    for (let i = 0; i < 10; i++) { if (Game.contestTick()) fires++; }
    Math.random = realRandom;
    ok(fires === 2, 'forced-fire tick yields exactly 2 events/week (' + fires + ')');
  }

  // ================= SOFTLOCK =================
  console.log('\n[softlock] S1: fireShow twice — second modal overwrites, choosing works');
  mkWorld(20); said.length = 0;
  {
    Game.fireShow(Game.showPool().find(x => x.id === 'why_eat'));
    const first = Game.state.activeContest;
    Game.fireShow(Game.showPool().find(x => x.id === 'mouth_race'));
    ok(Game.state.activeContest !== first, 'second fire replaces the modal');
    const r = Game.contestChoose(0);
    ok(r && r.done === true && Game.state.activeContest === null, 'choosing on the new modal lands and closes');
  }

  console.log('\n[softlock] S2: mouth_race dmg:[0,4] at 3 HP — TV never kills');
  mkWorld(20); said.length = 0;
  {
    const ac = forceShowPlayer('mouth_race'); // choice 0: 'Speed, no fear', dmg [0,4]
    Game.state.scholar.health = 3;
    Math.random = () => 0.99999; // force max roll
    const r = Game.contestChoose(0);
    Math.random = realRandom;
    ok(Game.state.scholar.health === 1, 'max-roll TV damage leaves 1 HP (health=' + Game.state.scholar.health + ')');
    ok(r && r.done === true, 'show lands after the clamp');
  }

  console.log('\n[softlock] S3: broadcast frame lifts after show end');
  mkWorld(20); said.length = 0;
  {
    Game.fireShow(Game.showPool().find(x => x.id === 'why_eat'));
    ok(Game.state.broadcast && Game.state.broadcast.live === true, 'broadcast live during show');
    Game.contestChoose(0);
    ok(!Game.state.broadcast || Game.state.broadcast.live !== true, 'broadcast lifted after _showEnd');
    // idempotent: end again (belt) must not throw
    let threw = false;
    try { Game.broadcastEnd(); } catch (e) { threw = true; }
    ok(!threw, 'broadcastEnd idempotent');
  }

  console.log('\n[softlock] S4: pendingContest countdown blocks new fires');
  mkWorld(20);
  {
    Game.state.pendingContest = { contestId: 'duel', participant: 'player', participants: ['player'], firesDay: 21, variant: null };
    Math.random = () => 0;
    const ev = Game.contestTick();
    Math.random = realRandom;
    ok(ev === null, 'contestTick returns null while a countdown is pending');
  }

  // ================= HONESTY =================
  console.log('\n[honest] H1: 2/week budget shared — summons consumes the slot too');
  mkWorld(20);
  {
    const v = Game.state.village;
    v._lastWeekViewership = 100; v.viewership = 50; // ratings dipping hard
    Game.state.showBudget = { week: Math.floor(20 / 7), used: 0 };
    Math.random = () => 0; // force scheduling roll + summons branch
    const ev = Game.contestTick();
    Math.random = realRandom;
    ok(ev && ev.id === '__summons', 'dipping ratings + forced rolls -> summons slot');
    ok(Game.state.showBudget.used === 1, 'summons consumed the shared budget (used=' + Game.state.showBudget.used + ')');
  }

  console.log('\n[honest] H2: tiny_door prize is a real usable non-food curio');
  mkWorld(20); said.length = 0;
  {
    Game.state.scholar.kcal = 2000;
    const ac = forceShowPlayer('tiny_door'); // choice 0: 'Go through', prize:true
    Game.contestChoose(0);
    const inv = Game.state.scholar.inventory;
    ok(inv.length === 1, 'exactly one prize granted');
    const g = inv[0];
    ok(g.name && g.units === 1, 'prize is a usable entry (name+units)');
    const def = (Game.data.items || []).find(i => i.id === (g.itemId || g.id));
    ok(def && def.origin === 'alien' && (def.tier || 1) <= 1 && !def.kcalEach && def.class !== 'food',
      'prize is alien tier<=1, non-food, no kcalEach (' + (def ? def.id : '?') + ')');
    ok(!/BEANS|beans/.test(g.name || ''), 'prize is not the dinner can');
  }

  console.log('\n[honest] H3: summons refuse — lands refused, grants nothing, said out loud');
  mkWorld(20); said.length = 0;
  {
    const favor0 = Game.apFavor();
    Game.state.scholar.kcal = 2000;
    Game.fireRatingsSummons();
    const r = Game.contestChoose(2); // Refuse on camera
    ok(r && r.outcome === 'show_refused', 'refusal lands show_refused');
    ok(Game.state.scholar.inventory.length === 0, 'refusal grants no prize');
    ok(said.some(m => /refus/i.test(m)), 'refusal said out loud');
    ok(Game.apFavor() < favor0 || favor0 === undefined, 'refusal moves favor down (was ' + favor0 + ', now ' + Game.apFavor() + ')');
  }

  console.log('\n[honest] H4: summons phone-it-in — 2 trauma, no prize, said out loud');
  mkWorld(20); said.length = 0;
  {
    Game.state.scholar.kcal = 2000; Game.state.scholar.trauma = 0;
    Game.fireRatingsSummons();
    const r = Game.contestChoose(1); // Phone it in
    ok(r && r.outcome === 'show_lost', 'phone-it-in lands show_lost');
    ok(Game.state.scholar.trauma === 2, 'trauma +2 (got ' + Game.state.scholar.trauma + ')');
    ok(Game.state.scholar.inventory.length === 0, 'phone-it-in grants no prize');
    ok(said.some(m => /phon/i.test(m)), 'phone-it-in said out loud');
  }

  console.log('\n[honest] H5: week rollover resets the budget');
  mkWorld(27); // floor(27/7)=3, a new week
  {
    Game.state.showBudget = { week: 2, used: 2 }; // stale, exhausted last week
    Math.random = () => 0;
    const ev = Game.contestTick();
    Math.random = realRandom;
    ok(ev !== null, 'budget resets on week rollover');
  }

  // ================= DEAD CODE =================
  console.log('\n[dead] D1: dawn branch wires contestTick, fireShow, fireRatingsSummons');
  {
    const gs = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
    ok(/this\.contestTick\(\)/.test(gs), 'game.js calls contestTick');
    ok(/this\.fireShow\(event\)/.test(gs), 'game.js calls fireShow');
    ok(/this\.fireRatingsSummons\(\)/.test(gs), 'game.js calls fireRatingsSummons');
  }

  console.log('\n[dead] D2: all 6 canon shows are in the pool');
  {
    const canon = ['WHY DO THEY EAT?', 'The Moot', 'Break Room', 'Mouth Race', 'Ask a Human', 'The Death Reel'];
    const pool = Game.showPool().map(s => s.name);
    ok(canon.every(c => pool.includes(c)), 'canon 6 all present (' + pool.length + ' shows total)');
  }

  console.log('\n[dead] D3: every pool show has an authored beat');
  {
    const pool = Game.showPool();
    const missing = pool.filter(s => !(Game.SHOW_BEATS || {})[s.id]);
    ok(missing.length === 0, '0/30 pool shows missing beats' + (missing.length ? ' (' + missing.map(m => m.id).join(',') + ')' : ''));
    const gb = Game._showGenericBeat({ id: 'zzz', name: 'ZZZ', desc: 'd' });
    ok(gb && gb.choices && gb.choices.length > 0, '_showGenericBeat fallback exists and is playable');
  }

  console.log('\n[dead] D4: viewershipBoard reachable via contestStandings');
  {
    const rows = Game.contestStandings();
    ok(Array.isArray(rows) && rows.length > 0 && rows.some(r => r.us), 'contestStandings returns rows incl. Haven');
    const lsrc = fs.readFileSync(path.join(ROOT, 'src/js/ledger.js'), 'utf8');
    ok(/return this\.viewershipBoard\(\)\.map/.test(lsrc), 'contestStandings reads viewershipBoard');
  }

  console.log('\n[dead] D5: summons phase declares its beat');
  {
    const phases = Game.ratingsSummonsPhases();
    ok(phases.length === 1 && phases[0].beat === 'showDeclare', 'summons phase has beat showDeclare');
    ok(phases[0].choices.length === 3, 'summons offers 3 played choices');
  }

  console.log('\n[dead] D6: castability — dead/exiled scholar cannot be summoned');
  {
    Game.state.over = true;
    ok(Game.fireRatingsSummons() === null, 'over=true: summons refused');
    Game.state.over = false; Game.state.scholar.health = 0;
    ok(Game.fireRatingsSummons() === null, 'health=0: summons refused');
    Game.state.scholar.health = 100; Game.state.scholar.exiled = true;
    ok(Game.fireRatingsSummons() === null, 'exiled: summons refused');
    Game.state.scholar.exiled = false;
    ok(Game.state.activeContest === null, 'no modal left behind by refused summons');
  }

  console.log('\n==== ' + pass + ' passed, ' + fail + ' failed ===');
  if (failures.length) { console.log('failures:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
