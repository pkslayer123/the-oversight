#!/usr/bin/env node
// PLAYTEST fame-seeker (2026-10-10, run D): hostile-player attacks on the FAME
// economy, on ground NOT covered by today's earlier passes:
//   - attack-fameseeker-20261010c.js (BEANS hole, snacks printer, cheer stack,
//     refuse-notability farm, milestone integration, broadcast lifecycle)
//   - test-fameseeker-heckle-20261009.js (heckle trust/rep cost)
//   - break-shows r1/r2, break-contests r13 (dip signal — IN FLIGHT, hands off)
//
// HOSTILE PLAN: the fame-seeker wants infinite fame at zero cost. Attacks:
//   EXPLOIT H1: zero-cost dominant show choices — audit every SHOW_BEATS
//     choice for (favor>=2 or notability) with no resource cost.
//   EXPLOIT H2: 365-day fame equilibrium — greedy fame-seeker (max favor every
//     choice, cheer every villager show); does showbiz favor pin at 100? does
//     the 2/week budget ever break? do packages/boons gate honestly?
//   EXPLOIT H3: celebrity ratchet — showResolveVillager is deterministic; at
//     what deed count does shame become mathematically impossible? The canon
//     promise (docs/CONTESTS.md) is "fans or shame — sometimes both".
//   SOFTLOCK H4: hostile states — dead player + empty roster show pull;
//     _showVillagerEnd on a phantom villager; heckle-path regression.
//   HONESTY H5: every favor delta in the show paths is said out loud.
//
// Usage: node scripts/test-fameseeker-20261010d.js [SEED]   (SEED env override)
// Run x3 seeds.
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

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || process.argv[2] || '20261010', 10);
Math.random = mulberry32(SEED); // seeded BEFORE eval (modules capture it at load)

// ---------- boot the full engine ----------
const PAIRS = [
  ['plants.json', 'plants'], ['biomes.json', 'biomes'], ['monsters.json', 'monsters'],
  ['villagers.json', 'villagers'], ['abilities.json', 'abilities'], ['items.json', 'items'],
  ['background_survivors.json', 'background_survivors'], ['cell_defs.json', 'cellDefs'],
  ['animals.json', 'animals'], ['recipes.json', 'recipes'], ['books.json', 'books'],
  ['relicEnhancements.json', 'relicEnhancements'], ['locations.json', 'locations'],
  ['characterGen.json', 'characterGen'], ['knowledge.json', 'knowledge'],
  ['nameCultures.json', 'nameCultures'], ['originPicker.json', 'originPicker'],
  ['foreignSpeech.json', 'foreignSpeech'], ['lifeseeds.json', 'lifeseeds'],
  ['arrivalText.json', 'arrivalText'], ['justiceVoice.json', 'justiceVoice'],
  ['alienPlayers.json', 'alienPlayers'], ['regions.json', 'regions'],
  ['dramaEffects.json', 'dramaEffects'], ['monsterBehaviors.json', 'monsterBehaviors'],
  ['contests.json', 'contests'], ['events.json', 'events'],
  ['statusEffects.json', 'statusEffects'], ['cooking.json', 'cooking'],
];
global.SCATTER_DATA = {};
for (const [f, key] of PAIRS) {
  try { global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8')); }
  catch (e) { global.SCATTER_DATA[key] = (key === 'contests' || key === 'items' || key === 'monsters') ? [] : {}; }
}
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"]*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: { classList: { remove() {} } } };
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window;
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;
let ROSTER0 = null;

function mkWorld(day) {
  if (ROSTER0) Game.state.village.roster = ROSTER0.slice();
  Game.state.scholar.day = day || 20;
  const s = Game.state.scholar;
  s.health = 100; s.kcal = 2000; s.trauma = 0; s.exiled = false;
  Game.state.over = false;
  Game.state.activeContest = null;
  Game.state.pendingContest = null;
  Game.state.broadcast = null;
  Game.state.systemArrived = true; // apDailyTick (favor decay, packages, boons) needs this
  Game.state.showBudget = { week: Math.floor((day || 20) / 7), used: 0 };
  Game.state.notability = {};
  s.inventory = [];
  const ap = Game.apState();
  ap.fanClubs = { fight: 0, survival: 0, social: 0, showbiz: 0 };
  ap.lastPackageDay = -999; ap.lastBoonDay = -999; ap.lastPersonaPackageDay = -999;
  Game.apSyncFavor();
  const v = Game.state.village;
  v.viewership = 10; v._lastWeekViewership = 10; v._peakViewership = 10;
  v.trust = {}; v.memory = {};
}

function favorGainOf(d) {
  if (!d) return 0;
  const fl = d.fanLane;
  if (fl === undefined || fl === null) return 0;
  if (typeof fl === 'object') return fl.n || 0;
  return fl;
}
function hasCost(d) {
  if (!d) return false;
  return (d.kcal || 0) < 0 || (d.trauma || 0) > 0 || !!d.dmg || (d.fracture || 0) > 0 || (d.heal || 0) < 0;
}
// Greedy fame-seeker: always take the max-favor choice (ties -> first).
function greedyChoiceIdx(choices) {
  let best = 0, bestG = -999;
  choices.forEach((c, i) => { const g = favorGainOf(c.do); if (g > bestG) { bestG = g; best = i; } });
  return best;
}
function resolveShowGreedy(maxSteps) {
  let steps = 0;
  while (Game.state.activeContest && Game.state.activeContest.phase !== 'done' && steps < (maxSteps || 12)) {
    const ac = Game.state.activeContest;
    const ph = ac.phases[ac.phaseIdx];
    if (!ph || !ph.choices || !ph.choices.length) break;
    // villager watch beat: cheer is the greedy favor play (+1, free)
    let idx = greedyChoiceIdx(ph.choices);
    Game.contestChoose(idx);
    steps++;
  }
  return steps;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  try { Game.ensureVillagerPositions(); } catch (e) {}
  ROSTER0 = (Game.state.village.roster || []).slice();
  // apEligible needs wave>=2 — stub the unlock for the fame sim
  const _uw = Game.unlockedWave;
  Game.unlockedWave = function () { return 2; };
  const said = [];
  Game.say = (m) => { said.push(String(m)); };
  Game.sysSay = (m) => { said.push(String(m)); };

  // ================= H1: zero-cost dominant show choices (static audit) =================
  console.log('\n[H1] zero-cost dominant show choices audit');
  {
    const beats = Game.SHOW_BEATS || {};
    const free = [];
    const all = Object.assign({ __generic: Game._showGenericBeat({ name: 'X', desc: 'Y' }) }, beats);
    for (const [sid, b] of Object.entries(all)) {
      for (const c of (b.choices || [])) {
        const g = favorGainOf(c.do);
        const nota = !!(c.do && c.do.notability);
        if ((g >= 2 || nota) && !hasCost(c.do)) {
          free.push(`${sid} :: "${c.label}" favor+${g}${nota ? ' +deed(' + c.do.notability + ')' : ''} costless`);
        }
      }
    }
    console.log('  costless fame choices (' + free.length + '):');
    free.forEach(f => console.log('    - ' + f));
    ok(free.length > 0, 'H1-audit ran over ' + Object.keys(all).length + ' beats');
    // The design question, not an auto-fail: the wacky/funny choice winning is
    // the point ("reward players for learning"). Record, don't fail.
    Game.__H1_free = free;
  }

  // ================= H3: fame lifecycle (was: celebrity ratchet) =================
  // BEFORE (master, this run's first pass): score = 2 + n*2 + hash — shame
  // impossible after ONE deed (min 4 > 3), fans guaranteed at 3+ (min 8).
  // AFTER (the fix): fame bonus caps at 3 deeds, overexposure -2/deed past 5.
  console.log('\n[H3] fame lifecycle — showResolveVillager determinism');
  {
    // Sample hash variation via multiple pids (hash = pid+show dependent).
    const pids = ['va', 'vb', 'vc', 'vd', 've', 'vf', 'vg', 'vh'];
    const show = { id: 'why_eat' };
    const table = {};
    for (let n = 0; n <= 9; n++) {
      Game.state.notability = {};
      let mn = 99, mx = -99;
      const outs = {};
      for (const pid of pids) {
        Game.state.notability = { [pid]: { showmanship: n } };
        const r = Game.showResolveVillager(pid, show, { cheer: 0, heckle: false });
        mn = Math.min(mn, r.score); mx = Math.max(mx, r.score);
        outs[r.outcome] = (outs[r.outcome] || 0) + 1;
      }
      table[n] = { min: mn, max: mx, outcomes: outs };
      console.log(`  deeds=${n}: score ${mn}..${mx} outcomes=${JSON.stringify(outs)}`);
    }
    Game.state.notability = {};
    const shamePossible = (n) => table[n].min <= 3;
    const fansLocked = (n) => table[n].min >= 7;
    ok(shamePossible(0), 'H3-debut can shame (min ' + table[0].min + ' <= 3)');
    ok(!shamePossible(1), 'H3-one deed: pure shame needs a heckle (min ' + table[1].min + ')');
    ok(fansLocked(3) && fansLocked(4) && fansLocked(5), 'H3-celebrity peak at 3-5 deeds (fans locked)');
    ok(!fansLocked(6), 'H3-overexposure begins at 6 deeds (min ' + table[6].min + ')');
    ok(shamePossible(8), 'H3-shame returns for the overexposed (8 deeds, min ' + table[8].min + ')');
    // regression pin (test-shows-20261009): 0 -> 3 deeds is still +6
    Game.state.notability = { vz: { showmanship: 0 } };
    const s0 = Game.showResolveVillager('vz', show, {}).score;
    Game.state.notability = { vz: { showmanship: 3 } };
    const s3 = Game.showResolveVillager('vz', show, {}).score;
    ok(s3 - s0 === 6, 'H3-0->3 deeds still +6 (regression pin)', s0 + '->' + s3);
    // heckle dethrones: -2 shifts the celebrity band into 'both'
    Game.state.notability = { va: { showmanship: 4 } };
    const rc = Game.showResolveVillager('va', show, { cheer: 0, heckle: false });
    const rh = Game.showResolveVillager('va', show, { cheer: 0, heckle: true });
    ok(rc.score - rh.score === 2 && rh.outcome === 'both', 'H3-heckle dethrones a celebrity (-2 -> both)',
      `clean=${rc.score}/${rc.outcome} heckled=${rh.score}/${rh.outcome}`);
    Game.state.notability = {};
    Game.__H3_table = table;
  }

  // ================= H2: 365-day fame equilibrium =================
  console.log('\n[H2] 365-day greedy fame-seeker equilibrium');
  {
    mkWorld(14);
    const weekly = {};
    let shows = 0, contests = 0, summons = 0, ticks = 0;
    let maxShowbiz = -100, endShowbiz = 0;
    const pkgDays = [], boonDays = [];
    const _pkg = Game.apCarePackage, _boon = Game.apClubBoon;
    Game.apCarePackage = function () { const r = _pkg.apply(this, arguments); if (r) pkgDays.push(Game.state.scholar.day); return r; };
    Game.apClubBoon = function () { const r = _boon.apply(this, arguments); if (r) boonDays.push(Game.state.scholar.day); return r; };
    const contestIds = new Set((Game.contestPool() || []).map(c => c.id));
    let threw = null;
    for (let day = 14; day < 14 + 365; day++) {
      const s = Game.state.scholar;
      s.day = day; s.health = 100; s.kcal = 2000; // fame-seeker is fed & rested; fame economy isolated
      if (s.trauma > 80) s.trauma = 40;
      if (day % 25 === 0) { try { Game.recordMoment('big play (simulated)'); } catch (e) {} } // lively village
      try { Game.apDailyTick(); } catch (e) { threw = threw || ('apDailyTick d' + day + ': ' + e.message); }
      let ev = null;
      try { ev = Game.contestTick(); } catch (e) { threw = threw || ('contestTick d' + day + ': ' + e.message); }
      if (!ev) continue;
      ticks++;
      const wk = Math.floor(day / 7);
      weekly[wk] = (weekly[wk] || 0) + 1;
      const ap = Game.apState();
      maxShowbiz = Math.max(maxShowbiz, ap.fanClubs.showbiz || 0);
      if (ev.id === '__summons') { summons++; continue; }
      if (contestIds.has(ev.id)) { contests++; continue; }
      shows++;
      try {
        Game.fireShow(ev);
        resolveShowGreedy();
      } catch (e) { threw = threw || ('show d' + day + ': ' + e.message); }
      if (Game.state.activeContest && Game.state.activeContest.phase !== 'done') {
        threw = threw || ('stranded modal d' + day);
        Game.state.activeContest = null;
      }
    }
    endShowbiz = (Game.apState().fanClubs || {}).showbiz || 0;
    Game.apCarePackage = _pkg; Game.apClubBoon = _boon;
    const over = Object.entries(weekly).filter(([w, n]) => n > 2);
    console.log(`  ticks=${ticks} shows=${shows} contests=${contests} summons=${summons}`);
    console.log(`  showbiz favor: max=${maxShowbiz} end=${endShowbiz}`);
    console.log(`  packages=${pkgDays.length} boons=${boonDays.length}`);
    const w = Game.notabilityWeight('player');
    console.log(`  notabilityWeight(player) end=${w.toFixed(2)}`);
    ok(over.length === 0, 'H2-budget: 2/week never exceeded', over.length ? JSON.stringify(over.slice(0, 3)) : '');
    ok(maxShowbiz <= 100, 'H2-favor clamp: showbiz never exceeded 100', 'max=' + maxShowbiz);
    let pkgGapOk = true;
    for (let i = 1; i < pkgDays.length; i++) if (pkgDays[i] - pkgDays[i - 1] < 4) pkgGapOk = false;
    ok(pkgGapOk, 'H2-package gate: >=4 days between packages', JSON.stringify(pkgDays.slice(0, 8)));
    let boonGapOk = true;
    for (let i = 1; i < boonDays.length; i++) if (boonDays[i] - boonDays[i - 1] < 5) boonGapOk = false;
    ok(boonGapOk, 'H2-boon gate: >=5 days between boons', JSON.stringify(boonDays.slice(0, 8)));
    ok(!threw, 'H2-no throws / no stranded modals over 365 days', threw || '');
    // The dip signal is ALIVE on master (util audit 2026-10-10: weekly drift
    // + now<15 soft-dip) — r13's "dead signal" premise is superseded. Summons
    // SHOULD fire sometimes and consume budget.
    ok(summons > 0, 'H2-dip signal alive: ratings summons airs over a year', 'summons=' + summons);
    ok(summons < ticks * 0.5, 'H2-summons stays a minority of TV', `summons=${summons} ticks=${ticks}`);
    Game.__H2 = { shows, contests, summons, maxShowbiz, endShowbiz, pkgs: pkgDays.length, boons: boonDays.length, w };
  }

  // ================= H4: softlock hostile states =================
  console.log('\n[H4] softlock — hostile states');
  {
    // (a) dead player + empty roster: the pull must fall through to together no-cast, never strand
    mkWorld(30); said.length = 0;
    Game.state.over = true;
    Game.state.scholar.health = 0;
    Game.state.village.roster = [];
    let threwA = null, acA = null;
    try {
      const show = Game.showPool()[0];
      Game.fireShow(show);
      acA = Game.state.activeContest;
      resolveShowGreedy();
    } catch (e) { threwA = e.message; }
    ok(!threwA, 'H4a-dead player + empty roster: no throw', threwA || '');
    ok(!Game.state.activeContest || Game.state.activeContest.phase === 'done', 'H4a-modal terminates',
      Game.state.activeContest ? Game.state.activeContest.phase : 'null-ok');
    try { Game.broadcastEnd(); } catch (e) {}
    Game.state.activeContest = null;

    // (b) _showVillagerEnd on a phantom villager (pulled, then vanished from roster)
    mkWorld(30); said.length = 0;
    let threwB = null;
    try {
      const vid = (Game.state.village.roster || []).find(id => id !== Game.villagerId);
      const show = Game.showPool().find(x => x.id === 'why_eat') || Game.showPool()[0];
      Game.fireShow(show);
      const ac = Game.state.activeContest;
      // force the villager-watch path with a phantom participant
      Game.state.activeContest = { kind: 'show', showId: show.id, showName: show.name, participant: 'ghost_vid_zzz', phase: 'watch', phaseIdx: 0, phases: [], cheer: 0, heckle: false };
      const r = Game._showVillagerEnd(Game.state.activeContest);
      ok(r && r.done, 'H4b-phantom villager end resolves', JSON.stringify(r));
    } catch (e) { threwB = e.message; }
    ok(!threwB, 'H4b-no throw on phantom participant', threwB || '');
    ok(!Game.state.activeContest, 'H4b-activeContest cleared');
    try { Game.broadcastEnd(); } catch (e) {}

    // (c) heckle regression: real trust/rep cost lands on current master
    mkWorld(30); said.length = 0;
    let threwC = null;
    try {
      const vid = (Game.state.village.roster || []).find(id => id !== Game.villagerId);
      // force the pull onto this villager (notability seeding is not deterministic)
      const origPullC = Game.showCastPull;
      Game.showCastPull = () => ({ who: vid, why: 'star', note: null });
      const show = Game.showPool().find(x => x.id === 'why_eat') || Game.showPool()[0];
      Game.fireShow(show);
      Game.showCastPull = origPullC;
      const ac = Game.state.activeContest;
      if (ac && ac.participant && ac.participant !== 'player' && ac.participant !== 'together') {
        const tBefore = (Game.state.village.trust || {})[ac.participant];
        const wBefore = Game.notabilityWeight('player');
        // find the heckle choice
        const ph = ac.phases[ac.phaseIdx];
        const hi = ph.choices.findIndex(c => c.do && c.do.heckle);
        if (hi >= 0) {
          Game.contestChoose(hi);
          resolveShowGreedy();
          const tAfter = (Game.state.village.trust || {})[ac.participant];
          const wAfter = Game.notabilityWeight('player');
          const mem = ((Game.state.village.memory || {})[ac.participant] || []).some(m => m.t === 'heckled');
          ok(mem, 'H4c-heckle memory logged');
          ok((tAfter === undefined ? 10 : tAfter) < (tBefore === undefined ? 10 : tBefore), 'H4c-victim trust drops',
            `before=${tBefore} after=${tAfter}`);
          ok(wAfter > wBefore, 'H4c-player fame still lands (infamy is famous)', `${wBefore} -> ${wAfter}`);
        } else { ok(false, 'H4c-heckle choice present'); }
      } else { ok(false, 'H4c-villager pull fired (got ' + (ac && ac.participant) + ')'); }
    } catch (e) { threwC = e.message; }
    ok(!threwC, 'H4c-no throw on heckle path', threwC || '');
    try { Game.broadcastEnd(); } catch (e) {}
    Game.state.activeContest = null;
  }

  // ================= H5: honesty — the settled favor-announcement standard =================
  // Settled standard (this loop's own c-run + the summons precedent): big
  // swings (|n|>=3) get the 📈/📉 line from apAdjustFavor itself; small
  // deltas ride the outcome narration ("the chat is making clips", "they
  // heard you" — direction-honest, no spreadsheet on the button, feel over
  // math). What must NEVER happen: spoken copy CONTRADICTING a delta (the
  // fixed summons bug: "the numbers don't move" while +1 landed).
  console.log('\n[H5] honesty — favor-announcement standard');
  {
    mkWorld(30);
    const deltas = [];
    const _adj = Game.apAdjustFavor;
    Game.apAdjustFavor = function (n, why, lane) { deltas.push({ n, why, lane }); return _adj.apply(this, arguments); };
    // H5a: a +3 swing must get the 📈 line (nap_wars "Snore operatively": +3, costless)
    said.length = 0; deltas.length = 0;
    {
      const show = Game.showPool().find(x => x.id === 'nap_wars');
      // force the pull onto the player
      const origPull = Game.showCastPull;
      Game.showCastPull = () => ({ who: 'player', why: 'debut', note: null });
      Game.fireShow(show);
      Game.showCastPull = origPull;
      const ac = Game.state.activeContest;
      if (ac && ac.participant === 'player') {
        const ph = ac.phases[ac.phaseIdx];
        const wi = ph.choices.findIndex(c => (c.do && favorGainOf(c.do) >= 3));
        Game.contestChoose(wi >= 0 ? wi : 0);
        resolveShowGreedy();
      }
      Game.state.activeContest = null; try { Game.broadcastEnd(); } catch (e) {}
    }
    const big = deltas.filter(d => Math.abs(d.n) >= 3);
    const saidText = said.join('\n');
    ok(big.length > 0, 'H5a-a +3 swing occurred', JSON.stringify(deltas));
    ok(big.every(d => saidText.includes('📈') || saidText.includes('📉')),
      'H5a-big swings get the 📈/📉 line', big.map(d => d.n + ':' + d.why).join(' | '));
    // H5b: no spoken copy contradicts a favor delta anywhere in the show paths
    said.length = 0; deltas.length = 0;
    {
      const vid = (Game.state.village.roster || []).find(id => id !== Game.villagerId);
      Game.state.notability = { [vid]: { showmanship: 3 } };
      const show = Game.showPool().find(x => x.id === 'why_eat') || Game.showPool()[0];
      const origPull = Game.showCastPull;
      Game.showCastPull = () => ({ who: vid, why: 'star', note: null });
      Game.fireShow(show);
      Game.showCastPull = origPull;
      const ac = Game.state.activeContest;
      if (ac && ac.participant === vid) {
        Game.contestChoose(0); // cheer
        resolveShowGreedy();
      }
      Game.state.activeContest = null; try { Game.broadcastEnd(); } catch (e) {}
    }
    const saidText2 = said.join('\n');
    const contra = /don'?t move|doesn'?t move|nothing changes?|no one (will|would) notice|went unnoticed/i;
    ok(!contra.test(saidText2), 'H5b-no copy contradicts favor movement in villager show path',
      deltas.length ? deltas.map(d => d.n).join(',') : 'no deltas');
    ok(deltas.length > 0, 'H5b-favor moved on the villager show path (something to check against)');
    Game.apAdjustFavor = _adj;
    Game.state.notability = {};
  }

  Game.unlockedWave = _uw;
  console.log(`\n==== RESULT seed=${SEED}: ${pass} pass / ${fail} fail ====`);
  if (failures.length) { console.log('failures:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FATAL: ' + (e && e.stack || e)); process.exit(2); });
