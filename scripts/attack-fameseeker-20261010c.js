#!/usr/bin/env node
// Break-it fame-seeker round 3, run 2026-10-10 (12:00 CDT).
// Hostile-player attack on the FAME economy: fan clubs, care packages,
// show casting, watch-party agency, broadcast lifecycle.
//
// CATCH F3 (EXPLOIT, fixed in src/js/alienPlayers.js): fan gifts could be
//   DINNER. The "Can labeled BEANS" (350 kcal, class food, origin alien,
//   tier 1) was grantable through apCarePackage() — the daily-tick fan
//   package (25%/day once a lane hits favor 20), the ratings-stunt reward,
//   and every contest win — and through apClubBoon's showbiz curio. The
//   break-it shows 2026-10-09 fix ("wacky, never dinner") only patched the
//   _showEnd TV-prize filter; the two fan paths kept the hole. A fame-seeker
//   holding showbiz favor >= 20 farms a 350-kcal can on ~1/5 packages.
//   Fix: one shared apWackyGift(tier) helper (food excluded, no fallback to
//   food — the vault says it's shy instead), used by both paths; @ontology
//   header updated.
//
// HELD (attacks attempted, system resisted — documented, not fixed):
//   - Snacks favor printer: one choice per together-show (terminal), 2/week
//     budget in contestTick; kcal -150 / unity +1 / favor +1 all exact.
//   - Cheer stacking: single cheer per pull, 0.15 cap, deterministic +2.
//   - Summons-refuse notability farm: diminishing depthMult asymptotes the
//     casting weight (20 refuses -> W=8.75, exact); favor floors at -100.
//   - Ratings-milestone integration: one-shot per +5 viewership (peak
//     ratchets); declining 6,5,4,3,2... returns.
//   - Viewership is push-only via gated deeds (mag>=8 villager deeds,
//     knowledge-gated system quests, 5000-kcal feasts, one-shot champion)
//     — no cheap +5 loop for milestones.
//   - Broadcast lifecycle: every terminal (show WIN/LOSE/MIXED, villager,
//     together, summons WIN/LOSE/REFUSE) lifts the frame; no leak.
//   - Empty eligibility: showCastPull falls through to 'together' no-cast;
//     fireShow never strands.
//   - Cheer honesty: the +2 is deterministic and the note says "they heard
//     you" (direction honest); the "+5" log line never reaches the player
//     (dropped on terminal paths) — no copy lie to fix.
//   - Show-watch comfort ("then go to them") delivers exactly the promised
//     gesture; the contest path's silent +3 trust is a separate bonus, not
//     a promise — held, not "fixed" into a silent action.
//
// Run: node scripts/attack-fameseeker-20261010c.js   (SEED env override)
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
let ROSTER0 = null; // S2 empties the roster; mkWorld restores it

function mkWorld(day) {
  if (ROSTER0) Game.state.village.roster = ROSTER0.slice();
  Game.state.scholar.day = day || 20;
  const s = Game.state.scholar;
  s.health = 100; s.kcal = 2000; s.trauma = 0; s.exiled = false;
  Game.state.over = false;
  Game.state.activeContest = null;
  Game.state.pendingContest = null;
  Game.state.broadcast = null;
  Game.state.showBudget = { week: Math.floor((day || 20) / 7), used: 0 };
  Game.state.notability = {};
  s.inventory = [];
  const ap = Game.apState();
  ap.fanClubs = { fight: 0, survival: 0, social: 0, showbiz: 0 };
  ap.lastPackageDay = -999;
  ap.lastBoonDay = -999;
  ap.lastPersonaPackageDay = -999;
  Game.apSyncFavor();
  const v = Game.state.village;
  v.viewership = 10; v._lastWeekViewership = 10; v._peakViewership = 10;
}

function villagerId() {
  return (Game.state.village.roster || []).find(id => id !== Game.villagerId);
}
function itemDef(id) {
  return (Game.data.items || []).find(i => i.id === id);
}
function grantFoodCount(ids) {
  return ids.filter(id => { const d = itemDef(id); return d && (d.kcalEach || d.class === 'food'); });
}
// Force a together-show (ratings milestone) without touching casting.
function fireTogetherShow() {
  const v = Game.state.village;
  v._peakViewership = (v.viewership || 10) - 5; // next cast sees a milestone
  const show = Game.showPool().find(x => x.id === 'why_eat');
  Game.fireShow(show);
  return Game.state.activeContest;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  try { Game.ensureVillagerPositions(); } catch (e) {}
  ROSTER0 = (Game.state.village.roster || []).slice();
  const said = [];
  Game.say = (m) => { said.push(String(m)); };
  Game.sysSay = (m) => { said.push(String(m)); };

  // ================= EXPLOIT =================
  console.log('\n[exploit] F3a: fan care packages must never be dinner (apCarePackage)');
  mkWorld(20); said.length = 0;
  {
    // Hostile fame-seeker: showbiz favor pinned high, package gate open.
    const ap = Game.apState();
    ap.fanClubs.showbiz = 25; Game.apSyncFavor();
    const granted = [];
    for (let i = 0; i < 200; i++) {
      ap.lastPackageDay = -999;
      const before = Game.state.scholar.inventory.length;
      Game.apCarePackage();
      for (let j = before; j < Game.state.scholar.inventory.length; j++) {
        granted.push(Game.state.scholar.inventory[j].itemId);
      }
    }
    const food = grantFoodCount(granted);
    ok(granted.length > 0, 'packages actually granted items (' + granted.length + ' over 200 trials)');
    ok(food.length === 0, 'zero food grants across 200 packages (got ' + food.length + ': ' + food.slice(0, 3).join(',') + ')');
  }

  console.log('\n[exploit] F3b: club-boon showbiz curio must never be dinner');
  mkWorld(20); said.length = 0;
  {
    const ap = Game.apState();
    ap.fanClubs.showbiz = 60; Game.apSyncFavor(); // loudest lane, >= 50
    const granted = [];
    for (let i = 0; i < 400 && granted.length < 60; i++) {
      ap.lastBoonDay = -999;
      const before = Game.state.scholar.inventory.length;
      try { Game.apClubBoon(); } catch (e) {}
      for (let j = before; j < Game.state.scholar.inventory.length; j++) {
        granted.push(Game.state.scholar.inventory[j].itemId);
      }
    }
    const food = grantFoodCount(granted);
    ok(granted.length > 0, 'boons actually fired (' + granted.length + ' curios)');
    ok(food.length === 0, 'zero food curios across boons (got ' + food.length + ': ' + food.slice(0, 3).join(',') + ')');
  }

  console.log('\n[exploit] E1: watch-party snacks are not a favor printer');
  mkWorld(20); said.length = 0;
  {
    let unityDelta = 0;
    const origLead = Game.leadShift;
    Game.leadShift = function (k, n) { if (k === 'unity') unityDelta += n; return origLead.call(this, k, n); };
    try {
      const ac = fireTogetherShow();
      ok(ac && ac.participant === 'together', 'together show fired (milestone cast)');
      const kcal0 = Game.state.scholar.kcal, fav0 = Game.apFanLane('showbiz');
      const r1 = Game.contestChoose(0); // bring the good snacks -> WIN
      ok(Game.state.scholar.kcal === kcal0 - 150, 'snacks cost exactly 150 kcal');
      ok(unityDelta === 1, 'snacks move unity exactly +1 (got ' + unityDelta + ')');
      ok(Game.apFanLane('showbiz') === fav0 + 1, 'snacks move showbiz favor exactly +1');
      ok(!Game.state.notability.together, 'no notability minted for participant "together"');
      const r2 = Game.contestChoose(0); // terminal: no re-choose
      ok(r2 === null, 'second choice on a finished show is refused (single-shot)');
      ok(Game.state.broadcast == null, 'broadcast frame lifted after together WIN');
    } finally { Game.leadShift = origLead; }
  }

  console.log('\n[exploit] E2: cheer is capped and deterministic');
  mkWorld(20); said.length = 0;
  {
    const pid = villagerId();
    const show = { id: 'why_eat' };
    const a = Game.showResolveVillager(pid, show, { cheer: 0 });
    const b = Game.showResolveVillager(pid, show, { cheer: 0.05 });
    ok(b.score - a.score === 2, 'one cheer moves the deterministic score exactly +2 (got +' + (b.score - a.score) + ')');
    const c = Game.showResolveVillager(pid, show, { cheer: 0.15 });
    ok(c.score - a.score === 6, 'max cheer (0.15 cap) moves exactly +6 (got +' + (c.score - a.score) + ')');
  }

  console.log('\n[exploit] E4: summons-refuse notability asymptotes (no infinite casting weight)');
  mkWorld(20); said.length = 0;
  {
    const ap = Game.apState();
    for (let i = 0; i < 20; i++) {
      Game.state.activeContest = { kind: 'summons', showId: '__summons', showName: 'Ratings Summons', participant: 'player', phase: 'x', phaseIdx: 0, phases: [] };
      Game._showEnd(Game.state.activeContest, 'refused', false);
    }
    const w = Game.notabilityWeight('player');
    // 20 showmanship: 1 + 2*(1 + .5 + .25 + 17*.125) = 8.75
    ok(Math.abs(w - 8.75) < 1e-9, '20 refused summons -> casting weight exactly 8.75 (got ' + w + ')');
    ok(ap.fanClubs.showbiz === -40, 'refuse costs favor each time (-40 after 20, got ' + ap.fanClubs.showbiz + ')');
    ok(Game.state.broadcast == null, 'broadcast lifted after every refused summons');
  }

  console.log('\n[exploit] E5: ratings-milestone integration is one-shot per +5 viewership');
  mkWorld(20); said.length = 0;
  {
    const v = Game.state.village;
    const calls = [];
    const orig = Game.integrate;
    Game.integrate = function (a, why) { calls.push({ a, why }); try { return orig.call(this, a, why); } catch (e) { return a; } };
    try {
      v._peakViewership = 10; v.viewership = 15;
      try { const pg0 = Game.progState(); if (pg0) pg0.ratingMilestones = 0; } catch (e) {}
      const c1 = Game.showCastPull();
      ok(c1.who === 'together' && c1.why === 'milestone', 'peak+5 viewership fires the milestone together-show');
      ok(calls.length === 1 && calls[0].a === 6, 'first milestone integrates exactly 6 (got ' + JSON.stringify(calls) + ')');
      const c2 = Game.showCastPull();
      ok(!(c2.why === 'milestone'), 'peak ratchets: same viewership does not re-fire (' + c2.why + ')');
      ok(calls.length === 1, 'no second integration without another +5');
    } finally { Game.integrate = orig; }
  }

  // ================= SOFTLOCK =================
  console.log('\n[softlock] S1: broadcast frame lifts on every terminal');
  {
    const terminals = [];
    // player show: won / lost / mixed
    for (const [idx, end] of [[0, 'won'], [2, 'lost'], [1, 'mixed']]) {
      mkWorld(20); said.length = 0;
      Game.addNotability('player', 'contestWin'); // star casting
      Game.fireShow(Game.showPool().find(x => x.id === 'why_eat'));
      ok(Game.state.activeContest && Game.state.activeContest.participant === 'player', 'player pulled for ' + end);
      Game.contestChoose(idx);
      terminals.push([end, Game.state.broadcast == null && Game.state.activeContest == null]);
    }
    // villager show (watch beat)
    mkWorld(20); said.length = 0;
    {
      const pid = villagerId();
      Game.addNotability(pid, 'contestWin');
      Game.fireShow(Game.showPool().find(x => x.id == 'why_eat'));
      ok(Game.state.activeContest && Game.state.activeContest.participant === pid, 'villager pulled');
      Game.contestChoose(0); // cheer -> SHOW_VILLAGER
      terminals.push(['villager', Game.state.broadcast == null && Game.state.activeContest == null]);
    }
    // summons: stunt / phone / refuse
    for (const [idx, end] of [[0, 'stunt'], [1, 'phone'], [2, 'refuse']]) {
      mkWorld(20); said.length = 0;
      Game.state.scholar.kcal = 2000;
      Game.fireRatingsSummons();
      ok(!!Game.state.activeContest, 'summons fired for ' + end);
      Game.contestChoose(idx);
      terminals.push(['summons-' + end, Game.state.broadcast == null && Game.state.activeContest == null]);
    }
    for (const [name, clean] of terminals) ok(clean, 'terminal lifts broadcast+modal: ' + name);
  }

  console.log('\n[softlock] S2: empty eligibility never strands a show');
  mkWorld(20); said.length = 0;
  {
    Game.state.scholar.health = 0; // player not castable
    Game.state.village.roster = [];
    const cast = Game.showCastPull();
    ok(cast.who === 'together' && cast.why === 'no-cast', 'no candidates -> together no-cast (got ' + cast.who + '/' + cast.why + ')');
    let threw = null;
    try { Game.fireShow(Game.showPool().find(x => x.id === 'why_eat')); } catch (e) { threw = e; }
    ok(!threw, 'fireShow with no cast does not throw');
    ok(!!Game.state.activeContest, 'together show still fires as the fallback');
    Game.contestChoose(1); // watch from the doorway -> LOSE
    ok(Game.state.broadcast == null, 'broadcast lifts after fallback together show');
  }

  console.log('\n[softlock] S3: scheduler never double-fires');
  mkWorld(20); said.length = 0;
  {
    Game.state.activeContest = { kind: 'show', phase: 'intro' };
    ok(Game.contestTick() === null, 'contestTick returns null while a show is live');
    Game.state.activeContest = null;
    Game.state.pendingContest = { id: 'x' };
    ok(Game.contestTick() === null, 'contestTick returns null while a contest is pending');
    Game.state.pendingContest = null;
  }

  // ================= HONESTY =================
  console.log('\n[honesty] H1: cheer does what its note says (deterministic, direction-honest)');
  mkWorld(20); said.length = 0;
  {
    const pid = villagerId();
    Game.addNotability(pid, 'contestWin');
    Game.fireShow(Game.showPool().find(x => x.id === 'why_eat'));
    Game.contestChoose(0); // cheer them on
    const note = said.find(m => m.includes('cheer until your throat hurts'));
    ok(!!note, 'cheer note is said out loud');
    ok(Game.state.broadcast == null, 'villager show ends cleanly after cheer');
  }

  console.log('\n[honesty] H2/H3: stunt copy — costs real, numbers really tick up (regression)');
  mkWorld(20); said.length = 0;
  {
    const v = Game.state.village; v.viewership = 10; v._lastWeekViewership = 12;
    const pg = Game.progState ? Game.progState() : null;
    const moments0 = pg && pg.moments ? pg.moments.length : 0;
    Game.state.scholar.kcal = 2000;
    Game.fireRatingsSummons();
    Game.contestChoose(0); // do the stunt
    ok(Game.state.scholar.kcal === 1800, 'stunt costs exactly 200 kcal');
    ok(Game.state.scholar.trauma === 4, 'stunt costs exactly 4 trauma');
    ok(v.viewership === 13, 'stunt moves viewership +2 plus recordMoment +1 (10 -> ' + v.viewership + ')');
    const moments1 = pg && pg.moments ? pg.moments.length : 0;
    ok(moments1 === moments0 + 1, 'stunt records its moment');
    ok(Game.apFanLane('showbiz') === 3, 'stunt lands its +3 showbiz favor');
  }

  console.log('\n[honesty] H4: heckling costs what the note promises (trust moves, not just rep)');
  mkWorld(20); said.length = 0;
  {
    const pid = villagerId();
    Game.addNotability(pid, 'contestWin');
    const v = Game.state.village;
    v.trust = v.trust || {}; v.trust[pid] = 50;
    const rep0k = (Game.repOf(pid).kind || 0), rep0h = (Game.repOf(pid).honest || 0);
    Game.fireShow(Game.showPool().find(x => x.id === 'why_eat'));
    Game.contestChoose(1); // heckle
    ok((Game.state.notability.player || {}).showmanship === 1, 'heckler gains the promised showmanship');
    ok(v.trust[pid] === 46, 'victim trust of player drops exactly 4 (50 -> ' + v.trust[pid] + ')');
    ok(Game.repOf(pid).kind === rep0k - 4 && Game.repOf(pid).honest === rep0h - 2, 'victim rep drops -4 kind / -2 honest');
    const r0 = Game.showResolveVillager(pid, { id: 'why_eat' }, { cheer: 0, heckle: false });
    const r1 = Game.showResolveVillager(pid, { id: 'why_eat' }, { cheer: 0, heckle: true });
    ok(r0.score - r1.score === 2, 'heckle dings the deterministic show score exactly -2');
  }

  console.log('\n[honesty] H5: stunt prize is singular (no curio double-dip, regression)');
  mkWorld(20); said.length = 0;
  {
    const ap = Game.apState();
    ap.fanClubs.showbiz = 25; Game.apSyncFavor();
    Game.state.scholar.kcal = 2000;
    const inv0 = Game.state.scholar.inventory.length;
    Game.fireRatingsSummons();
    Game.contestChoose(0); // stunt -> WIN: care package via apCarePackage only
    const newItems = Game.state.scholar.inventory.slice(inv0).map(e => e.itemId);
    const curios = newItems.filter(id => { const d = itemDef(id); return d && d.origin === 'alien'; });
    ok(curios.length <= 1, 'stunt shakes loose at most one alien curio (got ' + curios.length + ')');
  }

  console.log('\npass=' + pass + ' fail=' + fail);
  if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log(' - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
