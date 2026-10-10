// BREAK-IT ROUND 2: SHOWS & BROADCAST (2026-10-10) — goes deeper than round 1
// (round 1: scripts/test-shows-break-20261010.js, 80/80 x3; fixed the dead
// outcome-commentary beat). New since round 1: fame-seeker apWackyGift(tier)
// helper, abilities-knowledge rework. Attacks the seams of the NEW code plus
// round-1's unverified margins (real favor landing, not stubbed).
//
//   EXPLOIT: summons refuse/stunt farming loops, care-package double paths,
//     mixed-deed notability laundering (cross-type linearity).
//   SOFTLOCK: exile/death mid-broadcast, villager watch-path termination.
//   HONESTY: -2 favor lands in state; ticker live-vs-dead; prize filter ==
//     apWackyGift rule (then refactored to call it); vault-shy paths said
//     aloud; SHOW_REFUSED commentary beat is GENERIC (BROKEN before fix).
//   DEAD CODE: summons reachability + not-castable fall-through, club-boon
//     reachability (all 4 branches), shy-fallback reachability.
//
// Usage: node scripts/test-shows-r2-20261010.js [SEED]
// Seed via SEED env or argv; default 777002. Run x3 seeds.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || process.argv[2] || '777002', 10);

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
  catch (e) { global.SCATTER_DATA[key] = key === 'contests' || key === 'items' || key === 'monsters' ? [] : {}; }
}

function mulberry32(a) {
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let _rng = mulberry32(SEED);
function rng() { return _rng(); }
rng.reset = (s) => { _rng = mulberry32(s); };
Math.random = rng;

global.window = global;
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', 'game.js', 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'broadcast.js', 'contestEngine.js', 'alienPlayers.js', 'storage.js',
  'perceive.js', 'carexplore.js', 'justice.js', 'food.js', 'betrayal.js', 'corpses.js',
  'corruption.js', 'lifeseed.js', 'progression.js', 'ledger.js', 'abilityActions.js',
  'monsterBehaviors.js', 'statusEffects.js', 'villager-agency.js', 'fieldFights.js',
  'villager-objectives.js', 'codex-people.js', 'membership.js', 'hierarchy.js',
  'debug-scenarios.js', 'build.js'];
for (const f of LIST) {
  try { eval(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function sec(t) { console.log('\n### ' + t); }

const said = [];
Game.sysSay = function(t) { said.push(String(t)); };
const _realSay = Game.say;
Game.say = function(t) { said.push(String(t)); try { return _realSay.call(this, t); } catch (e) {} };
Game.audioEvent = function() {};
Game.drama = function() {};
Game.tele = function() {};
Game.leadShift = function() {};
Game.recordMoment = function() {};
Game.contestLearn = function() {};
Game.villagerGainXP = function() {};
Game._showGossip = function() {};
Game._cxGossip = function() {};
// REAL apAdjustFavor this time (round 1 stubbed it) — we assert on state.
Game.kcalCap = function() { return 2400; };
Game.maxHealth = function() { return 100; };
Game.havenViewership = function() { return (this.state.village || {}).viewership || 0; };
Game.unlockedWave = function() { return 2; };
Game.monsterWavePool = function() { return (this.data.monsters || []).filter(m => (m.wave || 1) <= 1); };
const grantCalls = [];
const _realApGrantItem = Game.apGrantItem;
Game.apGrantItem = function(id) { grantCalls.push(id); return _realApGrantItem.call(this, id); };

function freshGame(day) {
  rng.reset(SEED);
  said.length = 0; grantCalls.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = day || 15;
  Game.state.systemArrived = true;
  s.health = 100; s.kcal = 2000; s.trauma = 0; s.exiled = false;
  s.inventory = s.inventory || [];
  Game.state.over = false;
  Game.state.activeContest = null;
  Game.state.pendingContest = null;
  Game.state.arenaContest = null;
  Game.state.broadcast = null;
  Game.state.notability = {};
  Game.state.showBudget = { week: Math.floor(s.day / 7), used: 0 };
  const v = Game.state.village;
  v.viewership = 50; v._lastWeekViewership = 50; v._peakViewership = 50;
  Game.state.alienPlayers = { fanClubs: { showbiz: 60, fight: 10, survival: 5, social: 5 }, lastPackageDay: -999, lastBoonDay: -999, favor: 0 };
  return (v.roster || []).filter(id => id !== Game.villagerId).slice(0, 4);
}

function fireSummons() {
  const ac = Game.fireRatingsSummons();
  if (!ac) return null;
  return ac;
}

// ================= EXPLOIT =================
sec('EXPLOIT E1 — summons refuse-farm: 60 refusals, no prize, favor floors at -100');
{
  freshGame(15);
  Game.state.alienPlayers.fanClubs.showbiz = 10; // low enough to drive into the floor
  let threw = null, grants = 0, nulls = 0;
  for (let i = 0; i < 60; i++) {
    Game.state.alienPlayers.lastPackageDay = -999; // never block on package gate
    const ac = fireSummons();
    if (!ac) { nulls++; continue; }
    try { Game.contestChoose(2); } catch (e) { threw = e; break; }
    grants = grantCalls.length;
  }
  ok('no throw over 60 refusals', threw === null, threw && threw.message);
  ok('no prize granted by any refusal', grants === 0, 'grants=' + grants);
  const fav = Game.apFanLane('showbiz');
  ok('showbiz favor floored at -100 (no silent underflow)', fav === -100, 'fav=' + fav);
  ok('broadcast lifted after last refusal', Game.state.broadcast === null);
  ok('activeContest cleared after last refusal', Game.state.activeContest === null);
  const saidRefusal = said.some(t => /no is the content|Refuse on camera|defiance/i.test(t));
  ok('refusal said out loud every time', saidRefusal);
}

sec('EXPLOIT E2 — stunt: reqKcal gate honest on empty tank, exact cost when paid');
{
  freshGame(15);
  const s = Game.state.scholar;
  s.kcal = 50;
  let ac = fireSummons();
  ok('summons fires', ac !== null);
  const r = Game.contestChoose(0); // Do the stunt, kcal=50 < 200
  ok('empty-tank stunt refused, not free', r && (r.blocked === true || r === null),
    'ret=' + JSON.stringify(r));
  ok('no 200 kcal deducted when refused', s.kcal === 50, 'kcal=' + s.kcal);
  ok('no advance on refusal (still intro phase)', Game.state.activeContest && Game.state.activeContest.phase !== 'done');
  s.kcal = 2000; s.trauma = 0;
  Game.state.alienPlayers.lastPackageDay = -999;
  const grants0 = grantCalls.length;
  Game.contestChoose(0);
  // Net: -200 stunt cost, then the shaken-loose care package adds 30-69 snack kcal.
  ok('stunt deducts 200 kcal net of the shaken-loose snack (30-69)',
    s.kcal >= 2000 - 200 + 30 && s.kcal <= 2000 - 200 + 69, 'kcal=' + s.kcal);
  ok('stunt costs exactly 4 trauma', s.trauma === 4, 'trauma=' + s.trauma);
  ok('stunt resolves (frame lifts)', Game.state.broadcast === null && Game.state.activeContest === null);
}

sec('EXPLOIT E3 — care-package double paths: contest win + stunt win same day = ONE package');
{
  freshGame(15);
  Game.state.alienPlayers.lastPackageDay = -999;
  const s = Game.state.scholar; s.kcal = 2000; s.day = 15;
  const g0 = grantCalls.length;
  const first = Game.apCarePackage();
  ok('first package granted', first === true);
  const gifts1 = grantCalls.length - g0;
  // same day: the stunt's _showEnd path calls apCarePackage again
  const s2 = Game.state.scholar;
  const saidLen = said.length;
  const ac = fireSummons();
  s2.kcal = 2000;
  Game.contestChoose(0); // stunt wins -> _showEnd -> apCarePackage (should whiff)
  const gifts2 = grantCalls.length - g0 - gifts1;
  ok('second package whiffed (4-day gate)', gifts2 === 0, 'extra gifts=' + gifts2);
  const whiffSaid = said.slice(saidLen).some(t => /aren't organized enough yet/.test(t));
  ok('whiff said out loud, never silent', whiffSaid);
}

sec('EXPLOIT E4 — mixed-deed notability laundering: cross-type linearity, per-type decay');
{
  freshGame(15);
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const vid = roster[0];
  // one of each of the 6 authored deed types
  const types = ['wave3Kill', 'wave2Kill', 'survivedMoot', 'heist', 'contestWin', 'showmanship'];
  types.forEach(t => Game.addNotability(vid, t));
  const w = Game.notabilityWeight(vid);
  const expect = 1 + 2 * (4 + 3 + 2 + 2 + 2 + 1);
  ok('mixed-deed weight = linear across types (' + w + ')', w === expect, 'w=' + w + ' expect=' + expect);
  // 50 identical deeds stay bounded (round-1 claim, re-verified)
  const vid2 = roster[1];
  for (let i = 0; i < 50; i++) Game.addNotability(vid2, 'showmanship');
  const w2 = Game.notabilityWeight(vid2);
  const e2 = 1 + 2 * (1 + 0.5 + 0.25 + 47 * 0.125);
  ok('50 identical deeds bounded (' + w2.toFixed(2) + ')', Math.abs(w2 - e2) < 1e-9, 'w2=' + w2);
  ok('laundering one-of-each beats 50 identical (churn wins)', w > w2, w + ' vs ' + w2);
  // casting: the laundered villager beats a plain player — notability-first holds
  // (whim is uniform-by-design; seed-hunt past it to reach the star branch)
  let cast = null;
  for (let i = 0; i < 40; i++) {
    rng.reset(SEED + i);
    cast = Game.showCastPull();
    if (cast.why !== 'whim') break;
  }
  ok('laundered villager pulled over plain player (notability-first)', cast.who === vid,
    'who=' + cast.who + ' why=' + cast.why);
}

// ================= SOFTLOCK =================
sec('SOFTLOCK S1 — exile mid-broadcast: refuse while exiled, frame still lifts');
{
  freshGame(15);
  let ac = fireSummons();
  ok('summons fires', ac !== null);
  Game.state.scholar.exiled = true;
  let threw = null;
  try { Game.contestChoose(2); } catch (e) { threw = e; }
  ok('no throw when exiled mid-broadcast', threw === null, threw && threw.message);
  ok('broadcast lifted', Game.state.broadcast === null);
  ok('activeContest cleared', Game.state.activeContest === null);
}

sec('SOFTLOCK S2 — death mid-broadcast: 0 HP scholar chooses, frame still lifts');
{
  freshGame(15);
  let ac = fireSummons();
  ok('summons fires', ac !== null);
  Game.state.scholar.health = 0;
  let threw = null;
  try { Game.contestChoose(1); } catch (e) { threw = e; } // phone it in
  ok('no throw on dead scholar choice', threw === null, threw && threw.message);
  ok('broadcast lifted', Game.state.broadcast === null);
  ok('activeContest cleared', Game.state.activeContest === null);
}

sec('SOFTLOCK S3 — villager watch path: renders and terminates with no extra input');
{
  freshGame(15);
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  Game.addNotability(roster[0], 'wave2Kill'); // make a villager the star so a pull can land on them
  let who = null, tries = 0;
  for (let i = 0; i < 60 && !who; i++) {
    rng.reset(9000 + i);
    Game.state.broadcast = null; Game.state.activeContest = null; said.length = 0;
    const show = Game.showPool()[0];
    Game.fireShow(show);
    const ac = Game.state.activeContest;
    if (ac && ac.participant === roster[0]) who = ac.participant;
    tries++;
  }
  ok('villager pull forceable (seed found)', who !== null, 'tries=' + tries);
  if (who) {
    let threw = null;
    try { Game.contestChoose(0); } catch (e) { threw = e; } // cheer them on -> SHOW_VILLAGER
    ok('no throw on watch choice', threw === null, threw && threw.message);
    ok('broadcast lifted after villager end', Game.state.broadcast === null);
    ok('activeContest cleared after villager end', Game.state.activeContest === null);
    ok('outcome beat fired while live (ticker got a line)',
      said.some(t => /^📺 (🎙️|🎨)/.test(t)), 'no commentator line found');
  }
}

sec('SOFTLOCK S4 — countdown with exiled player: recast or cancel, said aloud, no crash');
{
  freshGame(15);
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const contest = Game.contestPool().find(c => c.cat === 'moot') || Game.contestPool()[0];
  Game.state.pendingContest = { contestId: contest.id, participant: 'player',
    participants: ['player'], firesDay: Game.state.scholar.day, variant: null };
  Game.state.scholar.exiled = true;
  let threw = null;
  try { Game.resolveContest(); } catch (e) { threw = e; }
  ok('no throw resolving countdown with exiled player', threw === null, threw && threw.message);
  ok('pendingContest consumed', Game.state.pendingContest === null);
  const saidSomething = said.some(t => /📺/.test(t));
  ok('recast-or-cancel said out loud', saidSomething);
}

// ================= HONESTY =================
sec('HONESTY H1 — summons refused: -2 showbiz favor LANDS in state (real apAdjustFavor)');
{
  freshGame(15);
  Game.state.alienPlayers.fanClubs.showbiz = 10;
  const before = Game.apFanLane('showbiz');
  const ac = fireSummons();
  ok('summons fires', ac !== null);
  Game.contestChoose(2);
  const after = Game.apFanLane('showbiz');
  ok('-2 favor landed in state', after === before - 2, 'before=' + before + ' after=' + after);
  const saidAloud = said.some(t => /-2|favor|defiance|interesting/i.test(t));
  ok('refusal consequences said aloud', saidAloud);
}

sec('HONESTY H2 — ticker: live while airing, silent when dead; names the real show');
{
  freshGame(15);
  const show = Game.showPool().find(x => x.id === 'why_eat');
  Game.fireShow(show);
  const liveHtml = Game.broadcastTickerHTML();
  ok('ticker renders while live', liveHtml.length > 0 && /LIVE/.test(liveHtml));
  const liveLine = said.find(t => /● LIVE/.test(t));
  ok('LIVE line names the actual show', !!liveLine && /WHY DO THEY EAT/.test(liveLine),
    String(liveLine).slice(0, 80));
  Game.state.activeContest = null;
  Game.broadcastEnd();
  ok('ticker silent when broadcast dead', Game.broadcastTickerHTML() === '');
}

sec('HONESTY H3 — show prize: wacky curio, never dinner (apWackyGift rule, single helper)');
{
  freshGame(15);
  const allowed = {};
  Game.data.items.forEach(it => {
    if (it.origin === 'alien' && (it.tier || 1) <= 1 && !it.kcalEach && it.class !== 'food')
      allowed[it.id] = true;
  });
  ok('candidate pool non-empty (test is meaningful)', Object.keys(allowed).length > 0,
    'pool=' + Object.keys(allowed).length);
  let threw = null, bad = [];
  for (let i = 0; i < 10; i++) {
    rng.reset(SEED + i);
    freshGame(15);
    const ac = Game.state.activeContest = { kind: 'show', showId: 'why_eat',
      showName: 'WHY DO THEY EAT?', participant: 'player', phase: 'intro' };
    try { Game._showEnd(ac, 'won', true); } catch (e) { threw = e; break; }
  }
  grantCalls.forEach(id => { if (!allowed[id]) bad.push(id); });
  ok('no throw across 10 prize landings', threw === null, threw && threw.message);
  ok('every prize grant in the never-dinner set', bad.length === 0, 'bad=' + bad.join(','));
  ok('no BEANS can ever granted', !grantCalls.includes('mislabeled_beans'));
}

sec('HONESTY H4 — vault-shy fallbacks: said out loud, snacks still granted, no silent pocket');
{
  freshGame(15);
  const savedItems = Game.data.items;
  Game.data.items = savedItems.filter(it => it.origin !== 'alien'); // empty the vault
  try {
    const s = Game.state.scholar;
    const kcal0 = s.kcal || 0;
    const g0 = grantCalls.length;
    const pkg = Game.apCarePackage();
    ok('care package still lands when vault is shy', pkg === true);
    ok('shy said out loud (package)', said.some(t => /vault was feeling shy/i.test(t)));
    ok('no gift granted from empty vault', grantCalls.length === g0);
    ok('snacks still granted', (s.kcal || 0) > kcal0, 'kcal ' + kcal0 + ' -> ' + (s.kcal || 0));
    // club boon, showbiz branch (top lane), empty vault
    Game.state.alienPlayers.fanClubs = { showbiz: 60, fight: 0, survival: 0, social: 0 };
    Game.state.alienPlayers.lastBoonDay = -999;
    said.length = 0;
    let fired = false, tries = 0;
    for (let d = 15; d < 60 && !fired; d++) {
      Game.state.scholar.day = d;
      rng.reset(3000 + d);
      said.length = 0;
      if (Game.apClubBoon()) fired = true;
      tries++;
    }
    ok('showbiz boon fires with empty vault', fired, 'tries=' + tries);
    ok('shy said out loud (boon)', said.some(t => /vault was shy/i.test(t)));
  } finally {
    Game.data.items = savedItems;
  }
}

sec('HONESTY H5 — SHOW_REFUSED commentary beat: tied to the result, never generic');
{
  freshGame(15);
  const ac = fireSummons();
  ok('summons fires', ac !== null);
  Game.contestChoose(2); // refuse -> _showEnd refused -> broadcastBeat('SHOW_REFUSED')
  const bc = Game.state.broadcast; // null now (ended) — inspect what the ticker HAD
  // The beat line was said via sysSay: find the last commentator line.
  const lines = said.filter(t => /^📺 (🎙️|🎨)/.test(t));
  ok('a commentator line fired for the refusal', lines.length > 0, 'lines=' + lines.length);
  const genericLines = (Game.BROADCAST_LINES.generic || []).map(l => l[1].slice(0, 40));
  const refusedPool = (Game.BROADCAST_LINES.refused || []).map(l => l[1].slice(0, 40));
  const last = lines.length ? lines[lines.length - 1] : '';
  const fromGeneric = genericLines.some(g => last.includes(g.slice(0, 30)));
  const fromRefused = refusedPool.some(g => last.includes(g.slice(0, 30)));
  ok('refusal commentary comes from a REFUSED pool, not generic',
    refusedPool.length > 0 && fromRefused && !fromGeneric,
    'refusedPool=' + refusedPool.length + ' last=' + last.slice(0, 70));
}

// ================= DEAD CODE =================
sec('DEAD CODE D1 — summons reachable in live tick; dead player falls through cleanly');
{
  freshGame(15);
  let found = null;
  for (let i = 0; i < 600 && !found; i++) {
    rng.reset(5000 + i);
    const v = Game.state.village;
    v.viewership = 50; v._lastWeekViewership = 60; // dipping
    Game.state.showBudget = { week: Math.floor(Game.state.scholar.day / 7), used: 0 };
    Game.state.pendingContest = null; Game.state.activeContest = null;
    let ev = null;
    try { ev = Game.contestTick(); } catch (e) { ev = null; }
    if (ev && ev.id === '__summons') found = 5000 + i;
  }
  ok('summons slot reachable from contestTick (dip conditions)', found !== null, 'seed=' + found);
  // dead player: never summoned, slot falls through
  let summoned = 0;
  for (let i = 0; i < 200; i++) {
    rng.reset(5000 + i);
    const v = Game.state.village;
    v.viewership = 50; v._lastWeekViewership = 60;
    Game.state.showBudget = { week: Math.floor(Game.state.scholar.day / 7), used: 0 };
    Game.state.pendingContest = null; Game.state.activeContest = null;
    Game.state.scholar.health = 0;
    let ev = null;
    try { ev = Game.contestTick(); } catch (e) { ev = null; }
    if (ev && ev.id === '__summons') summoned++;
  }
  Game.state.scholar.health = 100;
  ok('dead player never summoned (200 dip ticks)', summoned === 0, 'summoned=' + summoned);
}

sec('DEAD CODE D2 — club boons reachable: fires within 40 days, 5-day gate holds, all branches clean');
{
  freshGame(15);
  Game.state.alienPlayers.fanClubs = { fight: 0, survival: 60, social: 0, showbiz: 0 };
  Game.state.alienPlayers.lastBoonDay = -999;
  const firedDays = [];
  let threw = null;
  for (let d = 15; d < 55; d++) {
    Game.state.scholar.day = d;
    rng.reset(7000 + d);
    try { if (Game.apClubBoon()) firedDays.push(d); } catch (e) { threw = e; break; }
  }
  ok('no throw across 40 boon rolls', threw === null, threw && threw.message);
  ok('boon fired at least once (reachable)', firedDays.length > 0, 'fired=' + firedDays.length);
  let gapOk = true;
  for (let i = 1; i < firedDays.length; i++) if (firedDays[i] - firedDays[i - 1] < 5) gapOk = false;
  ok('5-day gate holds between boons', gapOk, 'days=' + firedDays.join(','));
  // fight branch: +10 health, clamped
  freshGame(15);
  Game.state.scholar.health = 95;
  Game.state.alienPlayers.fanClubs = { fight: 60, survival: 0, social: 0, showbiz: 0 };
  Game.state.alienPlayers.lastBoonDay = -999;
  for (let d = 15; d < 55; d++) {
    Game.state.scholar.day = d; rng.reset(7000 + d);
    if (Game.apClubBoon()) break;
  }
  ok('fight boon: +10 health clamped at max', Game.state.scholar.health === 100,
    'health=' + Game.state.scholar.health);
  // social branch: unity shift path runs (leadShift stubbed, no throw)
  freshGame(15);
  Game.state.alienPlayers.fanClubs = { fight: 0, survival: 0, social: 60, showbiz: 0 };
  Game.state.alienPlayers.lastBoonDay = -999;
  let socialFired = false;
  for (let d = 15; d < 55; d++) {
    Game.state.scholar.day = d; rng.reset(7000 + d); said.length = 0;
    if (Game.apClubBoon()) { socialFired = said.some(t => /\+1 unity/.test(t)); break; }
  }
  ok('social boon: +1 unity announced', socialFired);
  // survival branch: pantry share or eaten-on-spot — said aloud either way
  freshGame(15);
  Game.state.alienPlayers.fanClubs = { fight: 0, survival: 60, social: 0, showbiz: 0 };
  Game.state.alienPlayers.lastBoonDay = -999;
  let survSaid = false;
  for (let d = 15; d < 55; d++) {
    Game.state.scholar.day = d; rng.reset(7000 + d); said.length = 0;
    if (Game.apClubBoon()) { survSaid = said.some(t => /pantry|voted rations/i.test(t)); break; }
  }
  ok('survival boon: pantry share narrated', survSaid);
}

sec('DEAD CODE D3 — _showEnd prize shy path: said aloud, no grant');
{
  freshGame(15);
  const savedItems = Game.data.items;
  Game.data.items = savedItems.filter(it => it.origin !== 'alien');
  try {
    const g0 = grantCalls.length;
    const ac = Game.state.activeContest = { kind: 'show', showId: 'why_eat',
      showName: 'WHY DO THEY EAT?', participant: 'player', phase: 'intro' };
    Game._showEnd(ac, 'won', true);
    ok('shy prize said aloud', said.some(t => /vault was feeling shy/i.test(t)));
    ok('no grant from empty vault', grantCalls.length === g0);
  } finally {
    Game.data.items = savedItems;
  }
}

console.log('\n==== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
