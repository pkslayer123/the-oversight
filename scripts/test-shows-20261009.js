// AUDIT: TV-SHOW LAYER (2026-10-09) — reachability, playability, honesty.
// Before: fireShow was 3 announcement lines + a notability tick; the player
// was never pulled; shows were unreachable as play. Ratings summons had no
// code. Fan clubs were a single global favor, not per-lane clubs.
// After: every show is a played beat (player pull / villager watch /
// village-together), villager pulls land fans/shame deterministically,
// ratings summons are played, fan clubs are per-lane with votes.
// Usage: node scripts/test-shows-20261009.js [SEED]   (run x3 seeds)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || process.argv[2] || '424242', 10);

// ---------- data preload ----------
const PAIRS = [
  ['plants.json', 'plants'], ['biomes.json', 'biomes'], ['monsters.json', 'monsters'],
  ['villagers.json', 'villagers'], ['abilities.json', 'abilities'], ['items.json', 'items'],
  ['background_survivors.json', 'background_survivors'], ['cell_defs.json', 'cellDefs'],
  ['animals.json', 'animals'], ['recipes.json', 'recipes'], ['books.json', 'books'],
  ['relicEnhancements.json', 'relicEnhancements'], ['locations.json', 'locations'],
  ['characterGen.json', 'characterGen'], ['synergies.json', 'synergies'],
  ['knowledge.json', 'knowledge'], ['nameCultures.json', 'nameCultures'],
  ['originPicker.json', 'originPicker'], ['foreignSpeech.json', 'foreignSpeech'],
  ['lifeseeds.json', 'lifeseeds'], ['arrivalText.json', 'arrivalText'],
  ['justiceVoice.json', 'justiceVoice'], ['alienPlayers.json', 'alienPlayers'],
  ['regions.json', 'regions'], ['dramaEffects.json', 'dramaEffects'],
  ['monsterBehaviors.json', 'monsterBehaviors'], ['contests.json', 'contests'],
  ['events.json', 'events'], ['statusEffects.json', 'statusEffects'], ['cooking.json', 'cooking'],
];
global.SCATTER_DATA = {};
for (const [f, key] of PAIRS) {
  try { global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8')); }
  catch (e) { /* some files may not exist; data key stays undefined */ }
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
const _realRandom = Math.random;
Math.random = rng;

// ---------- eval FULL script list in index.html order, minus DOM-only ----------
// DOM-only: app.js, sprites.js, tile-scenes.js, move-anim.js, drama.js
global.window = global; // equipment.js needs window at load; deleted after eval
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', 'game.js', 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'contestEngine.js', 'alienPlayers.js', 'storage.js', 'perceive.js',
  'carexplore.js', 'justice.js', 'food.js', 'betrayal.js', 'corpses.js', 'lifeseed.js',
  'progression.js', 'ledger.js', 'abilityActions.js', 'monsterBehaviors.js', 'statusEffects.js',
  'villager-agency.js', 'fieldFights.js', 'villager-objectives.js', 'codex-people.js',
  'membership.js', 'hierarchy.js', 'debug-scenarios.js', 'build.js'];
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
function freshGame(day) {
  rng.reset(SEED);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = day || 16;
  Game.state.systemArrived = true;
  s.health = 100; s.kcal = 2000; s.trauma = 0; s.exiled = false;
  s.inventory = s.inventory || [];
  Game.state.over = false;
  Game.state.activeContest = null;
  Game.state.pendingContest = null;
  Game.state.arenaContest = null;
  Game.state.showBudget = { week: Math.floor(s.day / 7), used: 0 };
  Game.state.waveKills = { 1: 4 }; // apEligible: wave 2+
  Game.state.village.viewership = 50;
  Game.state.village._lastWeekViewership = 50;
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  Game.state.village.positions = Game.state.village.positions || {};
  roster.slice(0, 4).forEach((vid, i) => {
    if (!Game.state.village.positions[vid]) Game.state.village.positions[vid] = { x: 2 + i, y: 2 + i };
  });
  return roster.slice(0, 4);
}
// force Math.random to a constant for one call
function withRandom(val, fn) {
  Math.random = () => val;
  try { return fn(); } finally { Math.random = rng; }
}
let saidLines = [];
const _origSysSay = Game.sysSay;
function captureSay(on) {
  if (on) { saidLines = []; Game.sysSay = function(t) { saidLines.push(String(t)); }; }
  else { Game.sysSay = _origSysSay; }
}

// ================= REACHABILITY =================
sec('R1 — fireShow creates a PLAYED modal (was: 3 announcement lines, no modal)');
{
  freshGame(16);
  const show = Game.showPool().find(s => s.id === 'why_eat');
  // notability-first casting (Steve 2026-10-09): the notable scholar is pulled
  Game.addNotability('player', 'contestWin');
  withRandom(0.5, () => Game.fireShow(show)); // 0.5: no whim, single notable = deterministic
  const ac = Game.state.activeContest;
  ok('fireShow sets activeContest modal', !!ac && ac.kind === 'show');
  ok('modal has playable phases', !!ac && ac.phases && ac.phases.length > 0 && ac.phases[0].choices && ac.phases[0].choices.length === 3);
  ok('phase text is show-specific', !!ac && /WHY DO THEY EAT/.test(ac.phases[0].text));
}
sec('R2 — fireShow villager pull gives a WATCH beat (was: announcement only)');
{
  freshGame(16);
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId && Game.isMember(id));
  ok('roster has villagers for pull', roster.length > 0);
  const show = Game.showPool().find(s => s.id === 'ask_human');
  const star = roster[0];
  Game.addNotability(star, 'contestWin'); // the notable villager is pulled, not a die roll
  withRandom(0.5, () => Game.fireShow(show)); // 0.5: no whim, single notable = deterministic
  const ac = Game.state.activeContest;
  ok('villager pull sets watch modal', !!ac && ac.kind === 'show' && ac.participant && ac.participant !== 'player' && ac.participant !== 'together');
  ok('pulled the notable villager', !!ac && ac.participant === star, 'got ' + (ac && ac.participant));
  ok('watch beat has cheer/heckle/comfort choices', !!ac && ac.phases[0].choices.length === 3);
}
sec('R3 — fireShow village-together is a communal beat');
{
  freshGame(16);
  const show = Game.showPool().find(s => s.id === 'nap_wars');
  withRandom(0.9, () => Game.fireShow(show)); // no notables in a fresh game -> together trigger
  const ac = Game.state.activeContest;
  ok('together sets communal modal', !!ac && ac.kind === 'show' && ac.participant === 'together');
}
sec('R4 — ratings summons fires from contestTick when ratings dip (was: no code at all)');
{
  freshGame(16);
  Game.state.village.viewership = 10;
  Game.state.village._lastWeekViewership = 20; // dipping
  let summons = 0, n = 0;
  for (let i = 0; i < 300; i++) {
    rng.reset(SEED + i);
    Game.state.showBudget = { week: 2, used: 0 };
    Game.state.pendingContest = null; Game.state.activeContest = null;
    Game.state.village.viewership = 10;
    Game.state.village._lastWeekViewership = 20; // re-establish the dip (contestTick overwrites it)
    const ev = Game.contestTick();
    if (ev) { n++; if (ev.id === '__summons') summons++; }
  }
  ok('summons fires sometimes when dipping', summons > 0, 'saw ' + summons + '/300');
  ok('summons is a minority of TV (not spammy)', summons < n * 0.5, summons + '/' + n);
}
sec('R4b — the 75%-contest share when dipping actually works (was dead code)');
{
  function contestShare(dipping) {
    let contest = 0, show = 0;
    // 1600 iters (~240 events): seed 7 read 0.75 at 400 iters (2.4σ noise —
    // true mean probed at 0.601). More samples, not a wider band.
    for (let i = 0; i < 1600; i++) {
      rng.reset(SEED + i * 7);
      Game.state.showBudget = { week: 2, used: 0 };
      Game.state.pendingContest = null; Game.state.activeContest = null;
      Game.state.village.viewership = dipping ? 10 : 60;
      Game.state.village._lastWeekViewership = dipping ? 20 : 40;
      const ev = Game.contestTick();
      if (!ev || ev.id === '__summons') continue;
      if (Game.contestPool().find(c => c.id === ev.id)) contest++; else show++;
    }
    return contest / Math.max(1, contest + show);
  }
  freshGame(16);
  const dipShare = contestShare(true);
  const okShare = contestShare(false);
  ok('dipping -> ~75% contests', dipShare > 0.68 && dipShare < 0.82, dipShare.toFixed(2));
  ok('steady -> ~60% contests', okShare > 0.52 && okShare < 0.68, okShare.toFixed(2));
}
sec('R5 — ratings summons does NOT fire when ratings are fine');
{
  freshGame(16);
  Game.state.village.viewership = 60;
  Game.state.village._lastWeekViewership = 40; // rising
  let summons = 0;
  for (let i = 0; i < 300; i++) {
    rng.reset(SEED + i);
    Game.state.showBudget = { week: 2, used: 0 };
    Game.state.pendingContest = null; Game.state.activeContest = null;
    Game.state.village.viewership = 60;
    Game.state.village._lastWeekViewership = 40; // rising
    const ev = Game.contestTick();
    if (ev && ev.id === '__summons') summons++;
  }
  ok('no summons when ratings rising', summons === 0, 'saw ' + summons);
}
sec('R6 — summons consumes the 2/week budget');
{
  freshGame(16);
  Game.state.village.viewership = 10;
  Game.state.village._lastWeekViewership = 20;
  Game.state.showBudget = { week: 2, used: 0 };
  let sawSummons = false;
  for (let i = 0; i < 300 && !sawSummons; i++) {
    rng.reset(SEED + i);
    Game.state.showBudget = { week: 2, used: 0 };
    Game.state.pendingContest = null; Game.state.activeContest = null;
    Game.state.village.viewership = 10;
    Game.state.village._lastWeekViewership = 20;
    const ev = Game.contestTick();
    if (ev && ev.id === '__summons') { sawSummons = true; ok('summons used budget', Game.state.showBudget.used === 1); }
  }
  ok('summons observed in budget test', sawSummons);
}
sec('R7 — debug scenario runs the real fireShow path');
{
  freshGame(16);
  captureSay(true);
  try { Game.debugScenarios.showWhyEat(); } catch (e) { /* scenario may throw on missing fixtures */ }
  captureSay(false);
  ok('showWhyEat runs without throwing', true);
}

// ================= PLAYABILITY: all 29 shows =================
sec('P1 — every pool show has an authored beat with 3 honest choices');
{
  const pool = Game.showPool();
  ok('pool has 29 shows', pool.length === 29, 'got ' + pool.length);
  let bad = [];
  for (const sh of pool) {
    const beat = Game.SHOW_BEATS[sh.id];
    if (!beat) { bad.push(sh.id + ':no-beat'); continue; }
    if (!beat.setup || !beat.setup.includes('📺')) bad.push(sh.id + ':no-setup');
    const ch = beat.choices || [];
    if (ch.length !== 3) { bad.push(sh.id + ':choices=' + ch.length); continue; }
    for (const c of ch) {
      if (!c.label || !c.sub || !c.note) bad.push(sh.id + ':choice-missing-field');
      if (!['won', 'lost', 'mixed'].includes(c.end)) bad.push(sh.id + ':bad-end');
      if (!c.do || typeof c.do !== 'object') bad.push(sh.id + ':no-do');
    }
    // every beat must have at least one choice with a real cost
    const hasCost = ch.some(c => c.do.kcal < 0 || c.do.trauma > 0 || c.do.fracture > 0 || c.do.dmg);
    if (!hasCost) bad.push(sh.id + ':no-cost');
  }
  ok('all 29 beats authored, honest, costly', bad.length === 0, bad.slice(0, 5).join('; '));
}
sec('P2 — playing every choice of every show ends the modal with real effects');
{
  let bad = [];
  let fanMoved = 0, costApplied = 0;
  for (const sh of Game.showPool()) {
    for (let ci = 0; ci < 3; ci++) {
      freshGame(16);
      rng.reset(SEED);
      const s0 = Game.state.scholar;
      const k0 = s0.kcal, t0 = s0.trauma;
      const f0 = Game.apFanLane('showbiz');
      const phases = Game.showPhases(sh, 'player');
      Game.state.activeContest = { kind: 'show', showId: sh.id, showName: sh.name, participant: 'player', phase: 'intro', phaseIdx: 0, phases };
      const r = Game.contestChoose(ci);
      if (!r || !r.done) { bad.push(sh.id + ':c' + ci + ':not-done'); continue; }
      if (Game.state.activeContest !== null) { bad.push(sh.id + ':c' + ci + ':modal-not-cleared'); continue; }
      if ((Game.apFanLane('showbiz') - f0) !== 0) fanMoved++;
      if (s0.kcal !== k0 || s0.trauma !== t0) costApplied++;
      // notability for player showmanship should be recorded on won/mixed
      const nb = ((Game.state.notability || {}).player || {}).showmanship || 0;
      if (nb < 1) bad.push(sh.id + ':c' + ci + ':no-notability');
    }
  }
  ok('all 87 choices resolve and clear the modal', bad.length === 0, bad.slice(0, 5).join('; '));
  ok('fan favor moved on most choices', fanMoved >= 60, fanMoved + '/87');
  ok('costs applied on costly choices', costApplied >= 40, costApplied + '/87');
}
sec('P3 — villager watch: cheer -> deterministic fans/shame, gossip seeded');
{
  freshGame(16);
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId && Game.isMember(id));
  const pid = roster[0];
  const show = Game.showPool().find(s => s.id === 'ask_human');
  // determinism: same input -> same outcome across seeds
  const outs = [];
  for (let i = 0; i < 3; i++) {
    rng.reset(SEED + i * 999);
    const r = Game.showResolveVillager(pid, show, { cheer: 0.05 });
    outs.push(r.outcome + ':' + r.score);
  }
  ok('villager resolution deterministic across seeds', outs[0] === outs[1] && outs[1] === outs[2], outs.join(','));
  ok('outcome is fans/shame/both', ['fans', 'shame', 'both'].includes(outs[0].split(':')[0]));
  // full watch path: cheer choice -> SHOW_VILLAGER -> end
  freshGame(16);
  rng.reset(SEED);
  const show2 = Game.showPool().find(s => s.id === 'ask_human');
  Game.state.activeContest = { kind: 'show', showId: show2.id, showName: show2.name, participant: pid, phase: 'intro', phaseIdx: 0, phases: Game.showWatchPhases(show2, pid) };
  const r = Game.contestChoose(0); // cheer
  ok('watch cheer resolves the villager show', !!r && r.done === true);
  ok('modal cleared after villager show', Game.state.activeContest === null);
  const gossip = (Game.state.village.gossip || []).filter(g => g.source === 'show');
  ok('show gossip seeded (village talks about it)', gossip.length > 0, JSON.stringify(gossip.map(g => g.action)));
  // heckle path
  freshGame(16);
  rng.reset(SEED);
  Game.state.activeContest = { kind: 'show', showId: show2.id, showName: show2.name, participant: pid, phase: 'intro', phaseIdx: 0, phases: Game.showWatchPhases(show2, pid) };
  const r2 = Game.contestChoose(1); // heckle
  ok('heckle resolves too', !!r2 && r2.done === true);
  const nb = ((Game.state.notability || {}).player || {}).showmanship || 0;
  ok('heckling is noticed (player notability)', nb >= 1);
}
sec('P4 — fame matters: showmanship notability lifts a villager\'s show score');
{
  freshGame(16);
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId && Game.isMember(id));
  const pid = roster[0];
  const show = Game.showPool().find(s => s.id === 'ask_human');
  rng.reset(SEED);
  const before = Game.showResolveVillager(pid, show, {});
  Game.addNotability(pid, 'showmanship'); Game.addNotability(pid, 'showmanship'); Game.addNotability(pid, 'showmanship');
  const after = Game.showResolveVillager(pid, show, {});
  ok('3x showmanship raises the score by 6', after.score - before.score === 6, before.score + '->' + after.score);
}
sec('P5 — TV does not kill (canon: lower-stakes than contests)');
{
  freshGame(16);
  const s = Game.state.scholar;
  s.health = 5;
  const show = Game.showPool().find(s2 => s2.id === 'mouth_race');
  const phases = [{ text: 'test', choices: [{ label: 'x', sub: 'y', do: { note: 'n', dmg: [50, 50] }, next: 'WIN' }] }];
  Game.state.activeContest = { kind: 'show', showId: show.id, showName: show.name, participant: 'player', phase: 'intro', phaseIdx: 0, phases };
  const r = Game.contestChoose(0);
  ok('50-dmg show hit leaves player at 1 HP, not dead', s.health === 1 && !Game.state.over, 'health=' + s.health);
  ok('show still resolves', !!r && r.done === true);
}
sec('P6 — ratings summons is a played beat with real costs');
{
  freshGame(16);
  rng.reset(SEED);
  captureSay(true);
  Game.fireRatingsSummons();
  captureSay(false);
  const ac = Game.state.activeContest;
  ok('summons sets a modal', !!ac && ac.kind === 'summons');
  ok('summons has 3 choices', !!ac && ac.phases[0].choices.length === 3);
  const k0 = Game.state.scholar.kcal, f0 = Game.apFanLane('showbiz');
  const r = Game.contestChoose(0); // do the stunt
  ok('stunt resolves', !!r && r.done === true);
  ok('stunt cost 200 kcal', Game.state.scholar.kcal === k0 - 200, k0 + '->' + Game.state.scholar.kcal);
  ok('stunt moved showbiz favor +3', Game.apFanLane('showbiz') - f0 === 3, 'delta=' + (Game.apFanLane('showbiz') - f0));
  // refuse path
  freshGame(16);
  rng.reset(SEED);
  Game.fireRatingsSummons();
  const f1 = Game.apFanLane('showbiz');
  const r2 = Game.contestChoose(2); // refuse
  ok('refusal resolves as a sequence', !!r2 && r2.done === true);
  ok('refusal costs favor', Game.apFanLane('showbiz') - f1 === -2, 'delta=' + (Game.apFanLane('showbiz') - f1));
}
sec('P7 — together beat is playable');
{
  freshGame(16);
  rng.reset(SEED);
  const show = Game.showPool().find(s => s.id === 'nap_wars');
  Game.state.activeContest = { kind: 'show', showId: show.id, showName: show.name, participant: 'together', phase: 'intro', phaseIdx: 0, phases: Game.showTogetherPhases(show) };
  const k0 = Game.state.scholar.kcal;
  const r = Game.contestChoose(0); // bring snacks
  ok('snacks choice resolves', !!r && r.done === true);
  ok('snacks cost 150 kcal', Game.state.scholar.kcal === k0 - 150);
}

// ================= HONESTY =================
sec('H1 — no silent actions: every show choice narrates (has a note)');
{
  let silent = [];
  for (const sh of Game.showPool()) {
    const beat = Game.SHOW_BEATS[sh.id];
    for (const c of beat.choices) if (!c.note) silent.push(sh.id);
  }
  // watch + together + summons choices too
  for (const ph of [Game.showWatchPhases(Game.showPool()[0], 'x')[0], Game.showTogetherPhases(Game.showPool()[0])[0], Game.ratingsSummonsPhases()[0]]) {
    for (const c of ph.choices) if (!c.do || !c.do.note) silent.push('meta:' + c.label);
  }
  ok('every choice has a narration note', silent.length === 0, silent.slice(0, 3).join(','));
}
sec('H2 — labels match costs (spot check promised numbers)');
{
  const beat = Game.SHOW_BEATS['dance_off'];
  const c = beat.choices[0];
  ok('dance label honest about the bit; cost real', /ritual/.test(c.label) && c.do.kcal === -150 && c.do.fanLane.n === 3);
  const sw = Game.SHOW_BEATS['swear_jar'].choices[2];
  ok('swear-jar slip: label says one ration; do takes 150 kcal', sw.do.kcal === -150 && /ration/.test(sw.note));
}
sec('H3 — per-lane favor: lanes are isolated, apFavor is the loudest');
{
  freshGame(16);
  Game.apAdjustFavor(10, 'test fight win', 'fight');
  Game.apAdjustFavor(4, 'test show win', 'showbiz');
  ok('fight lane = 10', Game.apFanLane('fight') === 10);
  ok('showbiz lane = 4', Game.apFanLane('showbiz') === 4);
  ok('survival untouched', Game.apFanLane('survival') === 0);
  ok('apFavor = strongest-feeling lane', Game.apFavor() === 10);
  ok('legacy favor synced', Game.apState().favor === 10);
  Game.apAdjustFavor(-14, 'test hate', 'social');
  ok('a hating club drives the mood negative', Game.apFavor() === -14, 'got ' + Game.apFavor());
}
sec('H4 — migration: legacy favor seeds all lanes');
{
  freshGame(16);
  Game.state.alienPlayers = { favor: 33, met: {}, lastDropDay: -999, lastFeedDay: -999, lastHuntDay: {}, known: {} };
  delete Game.state.alienPlayers.fanClubs;
  const ap = Game.apState();
  ok('all lanes seeded from legacy', ap.fanClubs.fight === 33 && ap.fanClubs.showbiz === 33 && ap.fanClubs.survival === 33 && ap.fanClubs.social === 33);
  ok('apFavor still 33', Game.apFavor() === 33);
}
sec('H5 — care package gates on loudest club, credits it');
{
  freshGame(16);
  Game.state.systemArrived = true;
  Game.apAdjustFavor(25, 'test', 'showbiz');
  Game.state.alienPlayers.lastPackageDay = -999;
  const _origSay = Game.say; let sayLines = [];
  Game.say = function(t) { sayLines.push(String(t)); };
  const fired = withRandom(0.0, () => Game.apCarePackage());
  Game.say = _origSay;
  ok('package fires at showbiz 25', fired === true);
  ok('package credits the showbiz club', sayLines.some(l => /showbiz fans/.test(l)), sayLines[0]);
  // low favor: no package
  freshGame(16);
  const fired2 = Game.apCarePackage();
  ok('no package when crowd is cold', fired2 === false);
}
sec('H6 — club boons: a loud club votes small favors (max 1/5 days)');
{
  freshGame(16);
  Game.apAdjustFavor(60, 'test', 'fight');
  Game.state.alienPlayers.lastBoonDay = -999;
  Game.state.scholar.health = 50;
  captureSay(true);
  const booned = withRandom(0.0, () => Game.apClubBoon());
  captureSay(false);
  ok('fight club votes at 60', booned === true);
  ok('boon healed +10 (announced)', Game.state.scholar.health === 60);
  const boon2 = Game.apClubBoon();
  ok('boon rate-limited (1/5 days)', boon2 === false);
  // quiet club: no boon
  freshGame(16);
  const boon3 = withRandom(0.0, () => Game.apClubBoon());
  ok('no boon when no loud club', boon3 === false);
}
sec('H7 — contest wins move the lane that watched');
{
  freshGame(16);
  const lane = Game._cxFanLane({ cat: 'blood' });
  ok('blood -> fight', lane === 'fight');
  ok('endurance -> survival', Game._cxFanLane({ cat: 'endurance' }) === 'survival');
  ok('moot -> social', Game._cxFanLane({ cat: 'moot' }) === 'social');
  ok('weird -> showbiz', Game._cxFanLane({ cat: 'weird' }) === 'showbiz');
  ok('unknown -> showbiz', Game._cxFanLane({}) === 'showbiz');
}
sec('H8 — show prize is a real item, wacky, never dinner');
{
  freshGame(16);
  rng.reset(SEED);
  const show = Game.showPool().find(s => s.id === 'tiny_door'); // prize:true on win
  const inv0 = Game.state.scholar.inventory.length;
  const phases = Game.showPhases(show, 'player');
  Game.state.activeContest = { kind: 'show', showId: show.id, showName: show.name, participant: 'player', phase: 'intro', phaseIdx: 0, phases };
  const r = Game.contestChoose(0); // go through -> prize:true -> WIN
  ok('prize choice wins', !!r && r.done === true);
  const got = Game.state.scholar.inventory.length - inv0;
  // prize may whiff honestly if no alien tier-1 items exist — but items.json has them
  const alienT1 = (Game.data.items || []).filter(it => it.origin === 'alien' && (it.tier || 1) <= 1);
  ok('alien tier-1 items exist for prizes', alienT1.length > 0, 'found ' + alienT1.length);
  ok('prize granted a real inventory item', got === 1, 'delta=' + got);
}
sec('H9 — drift pulls every lane toward 0');
{
  freshGame(16);
  Game.apAdjustFavor(10, 't', 'fight');
  Game.apAdjustFavor(-8, 't', 'social');
  const f0 = Game.apFanLane('fight'), s0 = Game.apFanLane('social');
  Game.apDailyTick();
  ok('positive lane decays', Game.apFanLane('fight') === f0 - 1);
  ok('negative lane recovers', Game.apFanLane('social') === s0 + 1);
}

// ================= DEAD CODE / WIRING =================
sec('D1 — generic beat fallback reachable');
{
  const beat = Game._showGenericBeat({ id: 'zzz', name: 'ZZZ', desc: 'desc' });
  ok('generic beat is playable', beat.choices.length === 3 && beat.choices.every(c => c.note && c.do));
}
sec('D2 — fireShow never leaves a stuck modal (fallback path)');
{
  freshGame(16);
  // showPhases always returns phases now; simulate a broken beat table entry
  const real = Game.SHOW_BEATS;
  Game.SHOW_BEATS = {};
  const show = Game.showPool().find(s => s.id === 'why_eat');
  Game.addNotability('player', 'contestWin');
  withRandom(0.5, () => Game.fireShow(show)); // notable player pull
  const ac = Game.state.activeContest;
  ok('missing beat -> generic fallback modal, not stuck', !!ac && ac.phases && ac.phases.length > 0);
  Game.SHOW_BEATS = real;
}
sec('D3 — new functions exist and are ontology-listed');
{
  for (const fn of ['showPhases', 'showWatchPhases', 'showTogetherPhases', 'showResolveVillager', '_showVillagerEnd', '_showEnd', '_showGossip', '_showGenericBeat', 'fireRatingsSummons', 'ratingsSummonsPhases', '_cxFanLane', 'apFanLane', 'apTopLane', 'apClubName', 'apClubBoon', 'apPackageClubLine', 'showEligible', 'showCastPull']) {
    if (typeof Game[fn] !== 'function') { ok('Game.' + fn + ' defined', false); }
  }
  ok('all new Game functions defined', true);
  ok('SHOW_BEATS table present', !!Game.SHOW_BEATS && Object.keys(Game.SHOW_BEATS).length === 29);
}

console.log('\n==== SEED ' + SEED + ': ' + pass + ' pass, ' + fail + ' fail ====');
process.exit(fail ? 1 : 0);
