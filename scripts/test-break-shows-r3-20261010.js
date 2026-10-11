// BREAK-IT ROUND 3: SHOWS & BROADCAST (2026-10-10) — goes deeper than rounds 1+2
// (r1: scripts/test-shows-break-20261010.js 80/80; r2: test-shows-r2-20261010.js
// 65/65; contests r13; parity audit). r1/r2 covered: dead outcome beat,
// SHOW_REFUSED generic pool, prize-filter duplication, 60-refusal farm,
// empty-tank stunt, stunt net, same-day double package, notability laundering,
// exile/death mid-broadcast, villager watch path, countdown recast, favor
// landing, ticker, vault-shy fallbacks, BEANS, dead-player summons, club boons,
// apWackyGift, contestTick overlap, broadcastStart idempotence.
// r3 attacks the seams they didn't:
//
//   EXPLOIT: dip-farming economics under weekly drift (perma-dip at the floor?
//     stunt loop net over 8 weeks), heckle-as-fame-button loop (30 heckles:
//     bounded? rep cost real? remembered?), apWackyGift grant uniqueness +
//     never-dinner over 300 grants.
//   SOFTLOCK: all 30 shows x every player choice terminates; all 30 x watch
//     choices (cheer/heckle/quiet) terminate; together x2; summons x3;
//     save/load mid-show (frame CSS restored; phantom broadcast dropped).
//   HONESTY: classifyBeat census over every show-path beat (non-generic);
//     "a week with a contest gets at most one show pull" (composition pin);
//     scheduling shares (20% summons / 75% contest-when-dipping) pinned;
//     canon gaps pinned as absent (no 'restless' teaser, no show retirement).
//   DEAD CODE: broadcast.js 9 defs wired; index.html loads broadcast.js +
//     contestEngine.js; apClubBoon reachable via apDailyTick.
//
// Usage: node scripts/test-break-shows-r3-20261010.js [SEED]
// Default 777003. Run x3 seeds.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || process.argv[2] || '777003', 10);

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
const REAL_RNG = rng;
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
  if (cond) { pass++; /* console.log('  PASS ' + name); */ }
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
Game.recordMoment = function() { try { const v = Game.state.village || {}; v.viewership = (v.viewership || 0) + 1; } catch (e) {} };
Game.contestLearn = function() {};
Game.villagerGainXP = function() {};
Game._showGossip = function() {};
Game._cxGossip = function() {};
Game.kcalCap = function() { return 2400; };
Game.maxHealth = function() { return 100; };
Game.havenViewership = function() { return (this.state.village || {}).viewership || 0; };
Game.unlockedWave = function() { return 2; };
Game.monsterWavePool = function() { return (this.data.monsters || []).filter(m => (m.wave || 1) <= 1); };
const grantCalls = [];
const _realApGrantItem = Game.apGrantItem;
Game.apGrantItem = function(id) { grantCalls.push(id); return _realApGrantItem.call(this, id); };

function freshGame(day) {
  Math.random = REAL_RNG;
  REAL_RNG.reset(SEED);
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
  v._driftWeek = Math.floor(s.day / 7); v._trendWeek = Math.floor(s.day / 7);
  v._dipping = false;
  Game.state.alienPlayers = { fanClubs: { showbiz: 60, fight: 10, survival: 5, social: 5 }, lastPackageDay: -999, lastBoonDay: -999, favor: 0, met: {}, known: {} };
  return (v.roster || []).filter(id => id !== Game.villagerId).slice(0, 4);
}

function startShowContest(showId, kind, participant, choiceIdx) {
  // Faithful to fireShow/fireRatingsSummons: broadcast on, modal set, then choose.
  const show = Game.showPool().find(x => x.id === showId) || { id: showId, name: showId };
  let phases;
  if (kind === 'summons') phases = Game.ratingsSummonsPhases();
  else if (participant === 'player') phases = Game.showPhases(show, 'player');
  else if (participant === 'together') phases = Game.showTogetherPhases(show);
  else phases = Game.showWatchPhases(show, participant);
  Game.broadcastStart(kind === 'summons' ? 'summons' : 'show',
    { showId: kind === 'summons' ? '__summons' : show.id, showName: kind === 'summons' ? 'Ratings Summons' : show.name, participant });
  Game.state.activeContest = {
    kind, showId: kind === 'summons' ? '__summons' : show.id,
    showName: kind === 'summons' ? 'Ratings Summons' : show.name,
    participant, phase: 'intro', phaseIdx: 0, phases, variant: null, wounds: 0,
  };
  let threw = null, ret = null;
  try { ret = Game.contestChoose(choiceIdx); } catch (e) { threw = e; }
  return { threw, ret };
}

// ================= EXPLOIT =================
sec('EXPLOIT E1 — dip-farm economics: 8 weeks at the viewership floor, stunt every summons');
{
  freshGame(15);
  const s = Game.state.scholar, v = Game.state.village;
  // Pin the dip: viewership at the drift floor (12), last week higher, trend
  // week stale so the first tick computes dipping=true for the whole week.
  let stunts = 0, kcalNet = 0, traumaPeak = 0, summonsSeen = 0;
  const kcalStart = 200000; // deep reserves: we measure the LOOP, not the wallet
  s.kcal = kcalStart;
  for (let week = 0; week < 8; week++) {
    const day0 = 15 + week * 7;
    for (let d = 0; d < 7; d++) {
      const day = day0 + d;
      s.day = day;
      v.viewership = 12; v._lastWeekViewership = 30; v._trendWeek = -1; v._driftWeek = Math.floor(day / 7);
      v._dipping = false;
      Math.random = () => 0.05; // always passes the chance gate; always takes the summons branch
      const ev = Game.contestTick();
      Math.random = REAL_RNG;
      if (ev && ev.id === '__summons') {
        summonsSeen++;
        s.kcal = Math.max(s.kcal, 2000);
        const k0 = s.kcal, t0 = s.trauma;
        const ac = Game.fireRatingsSummons();
        if (ac) { Game.contestChoose(0); stunts++; kcalNet += (s.kcal - k0); }
        void t0;
      }
      // nightly trauma decay (game.js: -2/night, -5 on nightmare)
      s.trauma = Math.max(0, (s.trauma || 0) - 2);
      traumaPeak = Math.max(traumaPeak, s.trauma || 0);
    }
  }
  Math.random = REAL_RNG;
  ok('summons fire under perma-dip (the signal is live)', summonsSeen > 0, 'summons=' + summonsSeen);
  ok('every summons stunt played to a terminal', stunts === summonsSeen, stunts + '/' + summonsSeen);
  ok('stunt loop is kcal-negative (no free-energy farm)', kcalNet < 0, 'net=' + kcalNet + ' over ' + stunts + ' stunts');
  ok('trauma stays bounded under max farming (decays nightly)', traumaPeak <= 40, 'peak=' + traumaPeak);
  ok('broadcast never left live after any stunt', Game.state.broadcast === null);
  ok('no activeContest left dangling', Game.state.activeContest === null);
}

sec('EXPLOIT E2 — heckle loop: 30 heckles, fame bounded, costs real');
{
  const roster = freshGame(15);
  const vid = roster[0];
  const s = Game.state.scholar;
  const rep0 = JSON.stringify(Game.repOf ? Game.repOf(vid) : null);
  let threw = null;
  for (let i = 0; i < 30; i++) {
    s.kcal = 2000; s.health = 100; s.trauma = 0;
    const r = startShowContest('why_eat', 'show', vid, 1); // Heckle
    if (r.threw) { threw = r.threw; break; }
  }
  ok('no throw over 30 heckles', threw === null, threw && threw.message);
  const w = Game.notabilityWeight('player');
  // showmanship impact 1: 1 + 2*(1 + .5 + .25 + 27*.125) = 1 + 2*5.125 = 11.25
  const expect = 1 + 2 * (1 + 0.5 + 0.25 + 27 * 0.125);
  ok('30 heckles: fame bounded sublinearly (' + w.toFixed(2) + ')', Math.abs(w - expect) < 1e-9, 'w=' + w);
  const mem = ((Game.state.village.memory || {})[vid] || []).some(m => m.t === 'heckled');
  ok('victim remembers every heckling (not free)', mem);
  const rep1 = JSON.stringify(Game.repOf ? Game.repOf(vid) : null);
  ok('victim rep moved (social cost is real)', rep0 !== rep1, rep0 + ' -> ' + rep1);
  ok('frame lifted after every heckle', Game.state.broadcast === null && Game.state.activeContest === null);
}

sec('EXPLOIT E3 — apWackyGift: 300 grants, never dinner, usable, unique');
{
  freshGame(15);
  const s = Game.state.scholar;
  const seen = new Set(); let bad = 0, brick = 0;
  for (let tier = 1; tier <= 3; tier++) {
    for (let i = 0; i < 100; i++) {
      const g = Game.apWackyGift(tier);
      if (!g) continue;
      if (g.kcalEach || g.class === 'food') bad++;
      const e = Game.apGrantItem(g.id);
      if (!e.name || !(e.units >= 1)) brick++;
      if (seen.has(e.id)) brick++;
      seen.add(e.id);
      if ((g.tier || 1) > tier) bad++;
    }
  }
  ok('no dinner, no over-tier in 300 wacky gifts', bad === 0, 'bad=' + bad);
  ok('every grant usable (name+units) and unique id (no dupes)', brick === 0, 'brick=' + brick);
  ok('grants landed in inventory (not the pack void)', s.inventory.length >= 200, 'inv=' + s.inventory.length);
}

// ================= SOFTLOCK =================
sec('SOFTLOCK S1 — all 30 shows x every player choice: terminates, frame lifts');
{
  const pool = Game.showPool();
  let total = 0, threw = 0, stuck = 0, frameLeft = 0;
  for (const show of pool) {
    freshGame(15);
    const n = (Game.showPhases(show, 'player')[0].choices || []).length;
    for (let i = 0; i < n; i++) {
      freshGame(15);
      Game.state.scholar.kcal = 2000;
      const r = startShowContest(show.id, 'show', 'player', i);
      total++;
      if (r.threw) { threw++; continue; }
      if (Game.state.activeContest !== null) stuck++;
      if (Game.state.broadcast !== null && Game.state.broadcast.live) frameLeft++;
    }
  }
  ok('30 shows x choices all ran (' + total + ')', total === pool.reduce((a, sh) => a + Game.showPhases(sh, 'player')[0].choices.length, 0));
  ok('no throw in any player-choice path', threw === 0, 'threw=' + threw);
  ok('no stuck modal (activeContest cleared)', stuck === 0, 'stuck=' + stuck);
  ok('no frame leak (broadcast lifted)', frameLeft === 0, 'leaks=' + frameLeft);
}

sec('SOFTLOCK S2 — all 30 shows x watch choices (cheer/heckle/quiet): terminates');
{
  const pool = Game.showPool();
  let total = 0, threw = 0, stuck = 0;
  for (const show of pool) {
    for (let i = 0; i < 3; i++) {
      const roster = freshGame(15);
      const vid = roster[0];
      const r = startShowContest(show.id, 'show', vid, i);
      total++;
      if (r.threw) { threw++; continue; }
      if (Game.state.activeContest !== null) stuck++;
      if (Game.state.broadcast !== null && Game.state.broadcast.live) stuck++;
    }
  }
  ok('30 shows x 3 watch choices ran (' + total + ')', total === pool.length * 3);
  ok('no throw in any watch path', threw === 0, 'threw=' + threw);
  ok('every watch path terminated (modal + frame)', stuck === 0, 'stuck=' + stuck);
}

sec('SOFTLOCK S3 — together x2 + summons x3: every _showEnd path terminates');
{
  const pool = Game.showPool();
  let threw = 0, stuck = 0, n = 0;
  for (const show of pool.slice(0, 5)) {
    for (let i = 0; i < 2; i++) {
      freshGame(15); Game.state.scholar.kcal = 2000;
      const r = startShowContest(show.id, 'show', 'together', i); n++;
      if (r.threw) threw++; else if (Game.state.activeContest !== null || (Game.state.broadcast && Game.state.broadcast.live)) stuck++;
    }
  }
  for (let i = 0; i < 3; i++) {
    freshGame(15); Game.state.scholar.kcal = 2000;
    const r = startShowContest('__summons', 'summons', 'player', i); n++;
    if (r.threw) threw++; else if (Game.state.activeContest !== null || (Game.state.broadcast && Game.state.broadcast.live)) stuck++;
  }
  ok('together+summons terminals ran (' + n + ')', n === 13);
  ok('no throw', threw === 0, 'threw=' + threw);
  ok('all terminated', stuck === 0, 'stuck=' + stuck);
}

sec('SOFTLOCK S4 — save/load mid-show: frame restored; phantom broadcast dropped');
{
  // in-memory localStorage + document stubs (node has neither)
  const store = {};
  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => Object.keys(store)[i],
    get length() { return Object.keys(store).length; },
  };
  const classes = new Set();
  global.document = { body: { classList: {
    add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
  } } };
  let threw = null, okFrame = false, okLive = false, okPhantom = false;
  try {
    freshGame(15);
    Game.state.scholar.kcal = 2000;
    const ac = Game.fireRatingsSummons();
    if (!ac) throw new Error('summons did not fire');
    ok('frame CSS applied at broadcastStart', classes.has('broadcasting'));
    const saved = Game.save();
    if (saved !== true) throw new Error('save returned ' + saved);
    const key = Game.state.runKey;
    classes.clear(); // the reload: DOM state is gone
    const loaded = Game.load(key);
    if (!loaded) throw new Error('load returned false');
    okLive = !!(Game.state.broadcast && Game.state.broadcast.live);
    okFrame = classes.has('broadcasting');
    // the modal restores: the saved show is still playable
    const ac2 = Game.state.activeContest;
    const r = Game.contestChoose(0);
    ok('restored show modal still playable after load', !r.threw && Game.state.activeContest === null && Game.state.broadcast === null);
    // phantom: live broadcast with no modal is dropped, not framed
    freshGame(15);
    Game.state.broadcast = { live: true, kind: 'show', showName: 'X', participant: 'player', ticker: [], lineIdx: 0 };
    Game.state.activeContest = null;
    Game.save();
    classes.clear();
    Game.load(Game.state.runKey);
    okPhantom = Game.state.broadcast === null && !classes.has('broadcasting');
  } catch (e) { threw = e; }
  delete global.localStorage; delete global.document;
  Math.random = REAL_RNG;
  ok('save+load mid-show: no throw', threw === null, threw && (threw.stack || threw.message));
  ok('broadcast still live after load', okLive);
  ok('frame CSS re-applied on load (the r3 fix)', okFrame);
  ok('phantom broadcast (no modal) dropped on load', okPhantom);
}

// ================= HONESTY =================
sec('HONESTY H1 — classifyBeat census: every show-path beat lands on an authored pool');
{
  // Every beat name the show/summons/watch/together paths can feed broadcastBeat.
  const beats = ['showDeclare', 'showWatchDeclare', 'showTogetherDeclare',
    'SHOW_WON', 'SHOW_LOST', 'SHOW_MIXED', 'SHOW_REFUSED',
    'SHOW_VILLAGER_FANS', 'SHOW_VILLAGER_SHAME', 'SHOW_VILLAGER_BOTH', '__pull'];
  freshGame(15);
  Game.broadcastStart('show', { showId: 'x', showName: 'X', participant: 'player' });
  let generic = 0;
  const seen = {};
  for (const b of beats) {
    const line = Game.broadcastBeat(b, {});
    const last = Game.state.broadcast.ticker[Game.state.broadcast.ticker.length - 1];
    seen[b] = last.type;
    if (last.type === 'generic' && b !== '__pull') generic++;
  }
  Game.broadcastEnd();
  ok('no show-path beat falls to generic (' + beats.length + ' beats)', generic === 0,
    JSON.stringify(Object.entries(seen).filter(([k, v]) => v === 'generic')));
  ok('SHOW_VILLAGER_BOTH -> together (not triumph)', seen['SHOW_VILLAGER_BOTH'] === 'together', seen['SHOW_VILLAGER_BOTH']);
  ok('SHOW_REFUSED -> refused (r2 fix holds)', seen['SHOW_REFUSED'] === 'refused', seen['SHOW_REFUSED']);
}

sec('HONESTY H2 — "a week with a contest gets at most one show pull" (composition pin)');
{
  // Structural: budget=2/week, so a week with >=1 contest can hold at most one show.
  // Organic pin: 400 seeded days, classify every fired event, check every week.
  freshGame(15);
  const contestIds = new Set((Game.contestPool() || []).map(c => c.id));
  const weeks = {};
  const v = Game.state.village;
  for (let day = 15; day < 415; day++) {
    Game.state.scholar.day = day;
    Game.state.scholar.kcal = 2000; Game.state.scholar.health = 100;
    const ev = Game.contestTick();
    if (ev && ev.id) {
      const wk = Math.floor(day / 7);
      weeks[wk] = weeks[wk] || { contest: 0, show: 0, summons: 0 };
      if (ev.id === '__summons') weeks[wk].summons++;
      else if (contestIds.has(ev.id)) weeks[wk].contest++;
      else weeks[wk].show++;
      // NOTE: contestTick only RETURNS the event (game.js's dawn branch fires
      // it) — nothing to resolve here; budget + guards are the only gates.
    }
  }
  Math.random = REAL_RNG;
  let weeksWithContest = 0, violations = 0, overBudget = 0, total = 0;
  for (const wk of Object.keys(weeks)) {
    const w = weeks[wk]; total++;
    if (w.contest >= 1) { weeksWithContest++; if (w.show > 1) violations++; }
    if (w.contest + w.show + w.summons > 2) overBudget++;
  }
  ok('organic weeks observed', total > 20, 'weeks=' + total);
  ok('no week exceeded the 2-event budget', overBudget === 0, 'over=' + overBudget);
  ok('weeks with a contest: at most one show pull', violations === 0,
    'violations=' + violations + ' in ' + weeksWithContest + ' contest-weeks');
}

sec('HONESTY H3 — scheduling shares: 20% summons + 75% contest-when-dipping (routing pin)');
{
  freshGame(15);
  const v = Game.state.village, s = Game.state.scholar;
  const contestIds = new Set((Game.contestPool() || []).map(c => c.id));
  // The tick consumes SEVERAL rng draws (chance gate, summons roll, share
  // roll), so a constant script can't pin routing — feed a queue instead.
  function tickKind(seq, calm) {
    s.day = 20;
    if (calm) { v.viewership = 60; v._lastWeekViewership = 60; }
    else { v.viewership = 10; v._lastWeekViewership = 30; }
    v._trendWeek = -1; v._driftWeek = Math.floor(20 / 7); v._dipping = false;
    Game.state.showBudget = { week: Math.floor(20 / 7), used: 0 };
    Game.state.activeContest = null; Game.state.pendingContest = null;
    s.health = 100; s.exiled = false; Game.state.over = false;
    const q = seq.slice();
    Math.random = () => (q.length ? q.shift() : 0.999);
    const ev = Game.contestTick();
    Math.random = REAL_RNG;
    if (!ev) return 'none';
    if (ev.id === '__summons') return 'summons';
    return contestIds.has(ev.id) ? 'contest' : 'show';
  }
  // dipping: chance = 0.25+0.15 = 0.40. [gate, summonsRoll, shareRoll]
  ok('dipping + low rolls -> ratings summons', tickKind([0.05, 0.05, 0.5], false) === 'summons');
  ok('dipping + failed summons roll + mid share -> contest (75% share)',
    tickKind([0.05, 0.5, 0.5], false) === 'contest');
  ok('dipping + failed summons roll + high share -> show pull',
    tickKind([0.05, 0.5, 0.9], false) === 'show');
  // calm: chance = 0.25, contestShare 0.6, no summons branch. [gate, shareRoll]
  ok('calm + mid roll -> contest (60% share)', tickKind([0.05, 0.5], true) === 'contest');
  ok('calm + high roll -> show (40% share)', tickKind([0.05, 0.7], true) === 'show');
  ok('calm never summons (dip-gated)', tickKind([0.05, 0.05], true) !== 'summons');
}

sec('HONESTY H4 — canon gaps pinned as absent (no silent invention)');
{
  const csrc = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
  // docs/CONTESTS.md scheduling: "They can see 'the show is restless' as a pull
  // approaches (gossip, System teasers)". No such mechanic exists — pinned so a
  // future build is deliberate, not drift.
  ok('no "show is restless" pre-pull teaser (canon gap, documented)',
    !/restless/i.test(csrc) || !/show is restless/i.test(csrc), 'teaser exists?');
  // canon: "old events retire when they've stopped being interesting" — pickShow
  // never retires (same class as contests r13 hold).
  const pickShowSrc = (csrc.match(/G\.pickShow = function\(\) \{[\s\S]*?\n  \};/) || [''])[0];
  ok('pickShow has no retirement (canon gap, documented)', !/retir/i.test(pickShowSrc));
  // census re-pin: 30 pool shows, 30 authored beats, 1:1
  const poolIds = [...csrc.match(/G\.showPool = function\(\) \{\s*return \[([\s\S]*?)\];/)[1].matchAll(/id: '([^']+)'/g)].map(m => m[1]);
  const beatIds = [...csrc.match(/G\.SHOW_BEATS = \{([\s\S]*?)\n  \};/)[1].matchAll(/^    ([a-z_]+): \{$/gm)].map(m => m[1]);
  ok('showPool = 30', poolIds.length === 30, '' + poolIds.length);
  ok('SHOW_BEATS = 30 and 1:1 with the pool',
    beatIds.length === 30 && poolIds.every(id => beatIds.includes(id)) && beatIds.every(id => poolIds.includes(id)));
}

// ================= DEAD CODE =================
sec('DEAD CODE D1 — broadcast.js: all 9 defs exist and the start/beat/end cycle works');
{
  const fns = ['broadcastStart', 'broadcastBeat', 'broadcastEnd', 'broadcastReplay',
    'broadcastLowerThird', 'broadcastTickerHTML', 'broadcastWatching', 'broadcastCrowd', 'broadcastGuestTitle'];
  const missing = fns.filter(f => typeof Game[f] !== 'function');
  ok('all 9 broadcast defs attached', missing.length === 0, missing.join(','));
  freshGame(15);
  Game.broadcastStart('show', { showId: 'x', showName: 'X', participant: 'player' });
  const line = Game.broadcastBeat('showDeclare', {});
  ok('beat returns a [voice, text] line while live', Array.isArray(line) && line.length === 2);
  ok('ticker renders while live', Game.broadcastTickerHTML().includes('LIVE'));
  ok('replay works while live', Game.broadcastReplay() === true);
  ok('watching(): player in it -> false', Game.broadcastWatching({ participant: 'player' }) === false);
  ok('watching(): villager in it -> true', Game.broadcastWatching({ participant: 'somevid' }) === true);
  ok('crowd row non-empty', (Game.broadcastCrowd('triumph') || '').length > 0);
  ok('guest title playful', /Doomed|Legend|Favorite|Will|Snack|Friend|TV|Metrics/.test(Game.broadcastGuestTitle()));
  Game.broadcastLowerThird('X', 'Y');
  ok('end lifts the frame', Game.broadcastEnd() === true && Game.state.broadcast === null);
  ok('ticker silent when dead', Game.broadcastTickerHTML() === '');
  ok('beat null when dead', Game.broadcastBeat('showDeclare', {}) === null);
  ok('end idempotent', Game.broadcastEnd() === false);
}

sec('DEAD CODE D2 — index.html loads broadcast.js + contestEngine.js (Alien-Players lesson)');
{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok('broadcast.js in index.html', html.includes('src/js/broadcast.js'));
  ok('contestEngine.js in index.html', html.includes('src/js/contestEngine.js'));
  ok('contests.js loads before broadcast.js', html.indexOf('src/js/contests.js') < html.indexOf('src/js/broadcast.js'));
}

sec('DEAD CODE D3 — club boons + care packages reachable via apDailyTick (not just direct)');
{
  freshGame(15);
  Game.state.alienPlayers.fanClubs.showbiz = 60;
  Game.state.alienPlayers.lastBoonDay = -999;
  Game.state.alienPlayers.lastPackageDay = -999;
  // apEligible gate: stub the pieces apDailyTick needs
  const _elig = Game.apEligible;
  Game.apEligible = function() { return true; };
  const _drop = Game.apDeadDrop, _feed = Game.apFeedMessage, _pg = Game.apPlaygroundTick,
        _vg = Game.apVillageGossip, _cw = Game.apContactWarning, _pp = Game.apPersonaPackage,
        _ef = Game.apEventFeed, _cv = Game.apContactedVillager;
  Game.apDeadDrop = Game.apFeedMessage = Game.apPlaygroundTick = Game.apVillageGossip =
    Game.apContactWarning = Game.apPersonaPackage = Game.apEventFeed = Game.apContactedVillager = function() {};
  Game.apSyncFavor = Game.apSyncFavor || function() {};
  let boonDay = -999, pkgDay = -999;
  for (let d = 15; d < 215; d++) {
    Game.state.scholar.day = d;
    try { Game.apDailyTick(); } catch (e) {}
    boonDay = Game.state.alienPlayers.lastBoonDay;
    pkgDay = Game.state.alienPlayers.lastPackageDay;
  }
  Game.apEligible = _elig;
  Game.apDeadDrop = _drop; Game.apFeedMessage = _feed; Game.apPlaygroundTick = _pg;
  Game.apVillageGossip = _vg; Game.apContactWarning = _cw; Game.apPersonaPackage = _pp;
  Game.apEventFeed = _ef; Game.apContactedVillager = _cv;
  Math.random = REAL_RNG;
  ok('club boon fired via daily tick (lane 60)', boonDay >= 15, 'lastBoonDay=' + boonDay);
  ok('care package fired via daily tick (favor 60)', pkgDay >= 15, 'lastPackageDay=' + pkgDay);
}

console.log('\n==== r3: ' + pass + ' passed, ' + fail + ' failed ====');
process.exit(fail ? 1 : 0);
