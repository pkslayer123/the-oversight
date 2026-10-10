// BREAK-IT: SHOWS & BROADCAST (2026-10-10) — hostile-player attacks on
// src/js/contests.js (show/summons paths), broadcast.js, contestEngine.js wiring.
//   EXPLOIT: 2/week budget bypass, summons prize double-dip, care-package
//     farming, show prize double-grant, notability farming to force casting,
//     reqKcal gate honesty.
//   SOFTLOCK: countdown with dead contest id, resolve flow, summons refusal,
//     generic-beat fallback, show modal with no phases.
//   HONESTY: TV doesn't kill (do.dmg clamp), outcome commentary beat fires
//     while the broadcast is live (BROKEN before fix), whim announced,
//     budget accounting.
//   DEAD-CODE: broadcast.js/contestEngine.js loaded + runtime-wired, all six
//     canon shows in pool with authored beats, ticker reachable.
// Usage: node scripts/test-shows-break-20261010.js [SEED]
// Seed via SEED env or argv; default 777001. Run x3 seeds.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || process.argv[2] || '777001', 10);

// ---------- data preload (verified fresh vs HEAD 2026-10-10) ----------
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

// ---------- seeded RNG BEFORE eval (modules capture Math.random at load) ----------
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

// ---------- eval FULL script list in index.html order, minus DOM-only ----------
// DOM-only: app.js, sprites.js, tile-scenes.js, move-anim.js, drama.js
global.window = global; // equipment.js needs window at load; deleted after eval
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
delete global.window; // sync combat path for the harness
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;

// ---------- plumbing ----------
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function sec(t) { console.log('\n### ' + t); }

// Peripheral stubs: record, don't crash. Core show/broadcast fns stay real.
const said = [];
Game.sysSay = function(t) { said.push(String(t)); };
Game.audioEvent = function() {};
Game.drama = function() {};
Game.tele = function() {};
Game.leadShift = function() {};
Game.recordMoment = function() {};
Game.contestLearn = function() {};
Game.villagerGainXP = function() {};
Game._showGossip = function() {};
const favorCalls = [];
Game.apAdjustFavor = function(n, why, lane) { favorCalls.push({ n, why, lane }); };
Game.kcalCap = function() { return 2400; };
Game.maxHealth = function() { return 100; };
Game.havenViewership = function() { return (this.state.village || {}).viewership || 0; };
Game.unlockedWave = function() { return 1; };
Game.monsterWavePool = function() { return (this.data.monsters || []).filter(m => (m.wave || 1) <= 1); };
const grantCalls = [];
const _realApGrantItem = Game.apGrantItem;
Game.apGrantItem = function(id) { grantCalls.push(id); return _realApGrantItem.call(this, id); };

function freshGame(day) {
  rng.reset(SEED);
  said.length = 0; favorCalls.length = 0; grantCalls.length = 0;
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
  v.positions = v.positions || {};
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  roster.slice(0, 4).forEach((vid, i) => {
    if (!v.positions[vid]) v.positions[vid] = { x: 2 + i, y: 2 + i };
  });
  // fan clubs: showbiz loud enough for care packages
  Game.state.alienPlayers = { fanClubs: { showbiz: 60, fight: 10, survival: 5, social: 5 }, lastPackageDay: -999, favor: 0 };
  return roster.slice(0, 4);
}

// Force contestTick into a ratings-summons slot: fresh dip + seed hunt.
function forceSummonsSeed() {
  for (let s = 0; s < 600; s++) {
    rng.reset(5000 + s);
    const v = Game.state.village;
    v.viewership = 50; v._lastWeekViewership = 60; // dipping
    Game.state.showBudget = { week: Math.floor(Game.state.scholar.day / 7), used: 0 };
    Game.state.pendingContest = null; Game.state.activeContest = null;
    let ev = null;
    try { ev = Game.contestTick(); } catch (e) { ev = null; }
    if (ev && ev.id === '__summons') return 5000 + s;
  }
  return null;
}

// ================= EXPLOIT =================
sec('EXPLOIT E1 — 2/week budget: 80 ticks in one week can never schedule more than 2');
{
  freshGame(15);
  const v = Game.state.village;
  let events = 0;
  for (let i = 0; i < 80; i++) {
    rng.reset(SEED + i);
    v.viewership = 50; v._lastWeekViewership = 50; // flat: no dip distortion
    let ev = null;
    try { ev = Game.contestTick(); } catch (e) { ev = null; }
    if (ev) events++;
  }
  ok('events scheduled <= 2 in one week', events <= 2, 'got ' + events);
  ok('showBudget.used matches scheduled events', Game.state.showBudget.used === events,
    'used=' + Game.state.showBudget.used + ' events=' + events);
  ok('showBudget.used never exceeds 2', Game.state.showBudget.used <= 2);
}

sec('EXPLOIT E2 — ratings summons: refusal is clean, no prize, broadcast lifts');
{
  freshGame(15);
  const seed = forceSummonsSeed();
  ok('summons slot forceable (seed found)', seed !== null);
  if (seed !== null) {
    rng.reset(seed);
    const v = Game.state.village;
    v.viewership = 50; v._lastWeekViewership = 60;
    Game.state.showBudget = { week: Math.floor(Game.state.scholar.day / 7), used: 0 };
    Game.state.pendingContest = null; Game.state.activeContest = null;
    const ev = Game.contestTick();
    ok('tick returned __summons', !!(ev && ev.id === '__summons'));
    ok('summons consumed exactly one budget slot', Game.state.showBudget.used === 1,
      'used=' + Game.state.showBudget.used);
    said.length = 0; favorCalls.length = 0; grantCalls.length = 0;
    const ac = Game.fireRatingsSummons();
    ok('summons modal opened', !!(ac && ac.kind === 'summons'));
    ok('broadcast live during summons', !!(Game.state.broadcast && Game.state.broadcast.live));
    const r = Game.contestChoose(2); // Refuse on camera
    ok('refuse resolves', !!(r && r.done));
    ok('no modal left after refusal', Game.state.activeContest === null);
    ok('broadcast lifted after refusal', !(Game.state.broadcast && Game.state.broadcast.live));
    ok('refusal grants no item', grantCalls.length === 0, 'grants=' + grantCalls.length);
    const neg = favorCalls.find(c => c.n < 0);
    ok('refusal costs favor (said out loud)', !!neg, JSON.stringify(favorCalls));
  }
}

sec('EXPLOIT E3 — summons stunt: one stunt, one prize (no curio double-dip)');
{
  freshGame(15);
  said.length = 0; favorCalls.length = 0; grantCalls.length = 0;
  const ac = Game.fireRatingsSummons();
  ok('summons modal opened', !!(ac && ac.kind === 'summons'));
  Game.state.scholar.kcal = 2000;
  const before = Game.state.scholar.inventory.length;
  const r = Game.contestChoose(0); // Do the stunt
  ok('stunt resolves won', !!(r && r.done && /won/.test(r.outcome || '')));
  // 2000 - 200 (stunt) + 30..70 (care-package snacks, said out loud)
  const kcal = Game.state.scholar.kcal;
  ok('stunt cost 200 kcal net of package snacks', kcal >= 1830 && kcal <= 1870, 'kcal=' + kcal);
  ok('exactly one apGrantItem call (the care-package gift; no curio double-dip)',
    grantCalls.length === 1, 'grants=' + JSON.stringify(grantCalls));
  ok('care package landed in inventory', Game.state.scholar.inventory.length === before + 1);
  ok('no modal left', Game.state.activeContest === null);
  ok('broadcast lifted', !(Game.state.broadcast && Game.state.broadcast.live));
}

sec('EXPLOIT E4 — care packages: rate-limited, favor-gated, no infinite loop');
{
  freshGame(15);
  const first = Game.apCarePackage();
  const second = Game.apCarePackage();
  const third = Game.apCarePackage();
  const trues = [first, second, third].filter(Boolean).length;
  ok('3 calls same day -> exactly 1 package', trues === 1, 'trues=' + trues);
  Game.state.alienPlayers.fanClubs = { showbiz: 10, fight: 5, survival: 5, social: 5 };
  Game.state.alienPlayers.lastPackageDay = -999;
  ok('favor < 20 -> no package', Game.apCarePackage() === false);
}

sec('EXPLOIT E5 — show prize: terminal choice cannot be re-fired for a second prize');
{
  freshGame(15);
  said.length = 0; grantCalls.length = 0;
  const show = Game.showPool().find(s => s.id === 'tiny_door');
  Game.fireShow(show);
  const ac = Game.state.activeContest;
  ok('tiny_door fired for player (debut, no notables)', !!(ac && ac.participant === 'player')),
  grantCalls.length = 0;
  const r1 = Game.contestChoose(0); // 'Go through' — prize: true
  ok('first choice resolves', !!(r1 && r1.done));
  const grantsAfterFirst = grantCalls.length;
  ok('prize granted once', grantsAfterFirst === 1, 'grants=' + grantsAfterFirst);
  const r2 = Game.contestChoose(0); // hostile double-tap
  ok('second fire blocked (phase done)', r2 === null);
  ok('no second prize', grantCalls.length === grantsAfterFirst);
}

sec('EXPLOIT E6 — notability farming: weight grows sublinearly (diminishing returns)');
{
  freshGame(15);
  for (let i = 0; i < 50; i++) Game.addNotability('player', 'showmanship');
  const w = Game.notabilityWeight('player');
  ok('50 identical deeds stay bounded', w < 25, 'w=' + w);
  const w1 = (() => { Game.state.notability = {}; Game.addNotability('player', 'showmanship'); return Game.notabilityWeight('player'); })();
  ok('first deed worth more than the 50th marginal', (w - w1) / 49 < (w1 - 1), 'w1=' + w1 + ' w=' + w);
}

sec('EXPLOIT E7 — reqKcal gate: stunt on an empty tank is refused out loud, no prize');
{
  freshGame(15);
  said.length = 0; grantCalls.length = 0;
  Game.fireRatingsSummons();
  Game.state.scholar.kcal = 50;
  const r = Game.contestChoose(0); // Do the stunt — needs 200
  ok('blocked, not advanced', !!(r && r.blocked));
  ok('modal still open (no silent advance)', Game.state.activeContest !== null && Game.state.activeContest.phase !== 'done');
  ok('kcal untouched', Game.state.scholar.kcal === 50);
  ok('no prize on blocked choice', grantCalls.length === 0);
  ok('refusal said out loud', said.some(l => /200 kcal|body/.test(l)));
}

// ================= SOFTLOCK =================
sec('SOFTLOCK S1 — countdown with a dead contest id resolves without hanging');
{
  freshGame(15);
  Game.state.pendingContest = { contestId: 'no_such_contest', participant: 'player',
    participants: ['player'], firesDay: Game.state.scholar.day };
  let threw = false;
  try { Game.resolveContest(); } catch (e) { threw = true; }
  ok('no throw on unknown contest id', !threw);
  ok('pendingContest cleared', Game.state.pendingContest === null);
  ok('no phantom modal', Game.state.activeContest === null);
}

sec('SOFTLOCK S2 — countdown fires at firesDay and always produces a sequence or a said cancellation');
{
  freshGame(15);
  const contest = Game.contestPool().find(c => c.id === 'pit');
  Game.fireContest(contest);
  const pc = Game.state.pendingContest;
  ok('countdown set', !!(pc && pc.firesDay === Game.state.scholar.day + 1));
  Game.state.scholar.day = pc.firesDay;
  said.length = 0;
  let threw = false;
  try { Game.resolveContest(); } catch (e) { threw = true; }
  ok('resolve does not throw', !threw);
  ok('pendingContest cleared', Game.state.pendingContest === null);
  ok('sequence started or cancellation said aloud',
    Game.state.activeContest !== null || said.some(l => /cancelled|boos/i.test(l)));
}

sec('SOFTLOCK S3 — ratings summons: every choice terminates the modal');
{
  for (const idx of [0, 1, 2]) {
    freshGame(15);
    said.length = 0;
    Game.fireRatingsSummons();
    Game.state.scholar.kcal = 2000;
    let r = null, threw = false;
    try { r = Game.contestChoose(idx); } catch (e) { threw = true; }
    ok('summons choice ' + idx + ' terminates cleanly', !threw && !!(r && r.done) && Game.state.activeContest === null);
    ok('summons choice ' + idx + ' lifts broadcast', !(Game.state.broadcast && Game.state.broadcast.live));
  }
}

sec('SOFTLOCK S4 — show with no authored beat falls back to a playable generic beat');
{
  freshGame(15);
  said.length = 0;
  Game.fireShow({ id: 'mystery_show_xyz', name: 'Mystery Show', desc: 'A test.' });
  const ac = Game.state.activeContest;
  ok('generic fallback produces phases', !!(ac && ac.phases && ac.phases.length && ac.phases[0].choices.length === 3));
  const r = Game.contestChoose(0);
  ok('generic beat choice resolves', !!(r && r.done) && Game.state.activeContest === null);
}

// ================= HONESTY =================
sec('HONESTY H1 — TV does not kill: show dmg clamps at 1 HP');
{
  freshGame(15);
  said.length = 0;
  const show = Game.showPool().find(s => s.id === 'mouth_race');
  Game.fireShow(show);
  const ac = Game.state.activeContest;
  ok('mouth_race fired for player', !!(ac && ac.participant === 'player'));
  Game.state.scholar.health = 1;
  const r = Game.contestChoose(0); // 'Speed, no fear' — do.dmg [0,4]
  ok('choice resolves', !!(r && r.done));
  ok('health never hits 0 on TV', Game.state.scholar.health >= 1, 'health=' + Game.state.scholar.health);
}

sec('HONESTY H2 — the outcome beat fires while the broadcast is LIVE (commentators call the result)');
{
  freshGame(15);
  said.length = 0;
  const beats = [];
  const _bb = Game.broadcastBeat;
  Game.broadcastBeat = function(name, ac) {
    beats.push({ name: String(name), live: !!(this.state.broadcast && this.state.broadcast.live) });
    return _bb.call(this, name, ac);
  };
  try {
    const show = Game.showPool().find(s => s.id === 'tiny_door');
    Game.fireShow(show);
    Game.contestChoose(0); // WIN
  } finally { Game.broadcastBeat = _bb; }
  const won = beats.find(b => b.name === 'SHOW_WON');
  ok('SHOW_WON beat fired', !!won);
  ok('SHOW_WON beat fired while broadcast live', !!(won && won.live),
    won ? 'live=' + won.live : 'beat missing entirely (dropped after broadcastEnd)');
}

sec('HONESTY H2b — villager show ending: the fate beat fires while live');
{
  freshGame(16);
  said.length = 0;
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const vid = roster[0];
  const beats = [];
  const _bb = Game.broadcastBeat;
  Game.broadcastBeat = function(name, ac) {
    beats.push({ name: String(name), live: !!(this.state.broadcast && this.state.broadcast.live) });
    return _bb.call(this, name, ac);
  };
  try {
    Game.broadcastStart('show', { showId: 'ask_human', showName: 'Ask a Human', participant: vid });
    Game._showVillagerEnd({ kind: 'show', showId: 'ask_human', showName: 'Ask a Human',
      participant: vid, phase: 'x', phaseIdx: 0, phases: [], cheer: 0 });
  } finally { Game.broadcastBeat = _bb; }
  const fate = beats.find(b => /^SHOW_VILLAGER_/.test(b.name));
  ok('SHOW_VILLAGER_* beat fired', !!fate, 'beats=' + JSON.stringify(beats.map(b => b.name)));
  ok('villager fate beat fired while live', !!(fate && fate.live));
}

sec("HONESTY H3 — the System's whim announces itself on show pulls");
{
  freshGame(15);
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  // make two villagers notable so the whim has a constrained pool
  Game.addNotability(roster[0], 'contestWin');
  Game.addNotability(roster[1], 'showmanship');
  said.length = 0;
  const _rnd = Math.random;
  Math.random = () => 0.05; // force the 10% whim branch
  try { Game.fireShow(Game.showPool().find(s => s.id === 'ask_human')); }
  finally { Math.random = _rnd; }
  ok('whim announced out loud', said.some(l => /System's whim/.test(l)),
    'said=' + JSON.stringify(said.slice(0, 6)));
}

sec('HONESTY H4 — casting is notability-first: the star is pulled, never the unknown');
{
  freshGame(15);
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  for (let i = 0; i < 3; i++) Game.addNotability(roster[0], 'contestWin'); // the star
  const _rnd = Math.random;
  Math.random = () => 0.5; // no whim (needs < 0.10), no tie
  let who = null;
  try { who = Game.showCastPull().who; } finally { Math.random = _rnd; }
  ok('highest-weight notable pulled', who === roster[0], 'who=' + who);
}

// ================= DEAD CODE =================
sec('DEAD CODE D1 — broadcast + contest engine modules are loaded and runtime-wired');
{
  ok('broadcastStart is a function', typeof Game.broadcastStart === 'function');
  ok('broadcastEnd is a function', typeof Game.broadcastEnd === 'function');
  ok('broadcastBeat is a function', typeof Game.broadcastBeat === 'function');
  ok('contestResolveGroup is a function', typeof Game.contestResolveGroup === 'function');
  ok('contestResolveVillager is a function', typeof Game.contestResolveVillager === 'function');
  ok('_contestVerdict routes through contestResolveGroup',
    /contestResolveGroup/.test(Game._contestVerdict.toString()));
}

sec('DEAD CODE D2 — all six canon shows are in the pool with authored beats');
{
  const poolIds = Game.showPool().map(s => s.id);
  for (const id of ['why_eat', 'break_room', 'mouth_race', 'ask_human', 'death_reel', 'moot']) {
    ok('pool has ' + id, poolIds.includes(id));
    ok('SHOW_BEATS has ' + id, !!(Game.SHOW_BEATS || {})[id]);
  }
}

sec('DEAD CODE D3 — ticker renders while live, silent when dead');
{
  freshGame(15);
  ok('ticker empty when broadcast dead', Game.broadcastTickerHTML() === '');
  Game.broadcastStart('show', { showId: 'x', showName: 'Test', participant: 'player' });
  Game.broadcastBeat('showDeclare', {});
  const html = Game.broadcastTickerHTML();
  ok('ticker renders while live', /LIVE/.test(html) && html.length > 50);
  Game.broadcastEnd();
  ok('ticker empty after end', Game.broadcastTickerHTML() === '');
  ok('broadcastEnd idempotent', Game.broadcastEnd() === false);
}

// ================= SUMMARY =================
console.log('\n========================================');
console.log('shows-break: ' + pass + ' passed, ' + fail + ' failed (seed ' + SEED + ')');
process.exit(fail ? 1 : 0);
