// BREAK-IT: SHOWS & BROADCAST (2026-10-09) — hostile-player attacks on the
// show/broadcast system: ratings summons, fan care packages, casting,
// eligibility, budget, broadcast-mode frames, copy-vs-engine honesty, dead code.
//
// Covers: contests.js scheduler/countdown (summons path), fireShow,
// fireRatingsSummons, ratingsSummonsPhases, _showEnd/_showVillagerEnd,
// showCastPull/showEligible, contestTick budget; broadcast.js frames;
// alienPlayers.js apCarePackage/apAdjustFavor (fan-club gift path);
// contestEngine.js wiring; app.js eligibility panel.
//
// Usage: node scripts/test-break-shows-20261009.js [SEED]
// Seed via SEED env or argv; default 777. Run x3 seeds.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || process.argv[2] || '777', 10);

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
  catch (e) { /* missing data key stays undefined */ }
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
  'truth.js', 'contests.js', 'broadcast.js', 'contestEngine.js', 'alienPlayers.js', 'storage.js', 'perceive.js',
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
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  Game.state.village.positions = Game.state.village.positions || {};
  roster.slice(0, 4).forEach((vid, i) => {
    if (!Game.state.village.positions[vid]) Game.state.village.positions[vid] = { x: 2 + i, y: 2 + i };
  });
  // fan-club state: loud enough for a care package, package long overdue
  const ap = Game.apState ? Game.apState() : null;
  if (ap) {
    ap.fanClubs = { fight: 0, survival: 0, social: 0, showbiz: 50 };
    ap.lastPackageDay = (s.day || 15) - 10;
    if (typeof Game.apSyncFavor === 'function') { try { Game.apSyncFavor(); } catch (e) {} }
  }
  return roster.slice(0, 4);
}
let saidLines = [];
const _origSysSay = Game.sysSay;
const _origSay = Game.say;
function captureSay(on) {
  if (on) { saidLines = []; Game.sysSay = function(t) { saidLines.push(String(t)); }; Game.say = function(t) { saidLines.push(String(t)); }; }
  else { Game.sysSay = _origSysSay; Game.say = _origSay; }
}
function fanLane(lane) {
  const ap = Game.apState();
  return ((ap.fanClubs || {})[lane || 'showbiz']) || 0;
}

// ================= EXPLOIT =================
sec('EXPLOIT E1 — summons stunt: ONE prize (the care package), no curio double-dip');
{
  freshGame(15);
  captureSay(true);
  Game.fireRatingsSummons();
  const kcalBefore = Game.state.scholar.kcal;
  const favorBefore = fanLane('showbiz');
  let grantCalls = 0;
  const origGrant = Game.apGrantItem;
  Game.apGrantItem = function(id) { grantCalls++; return origGrant.call(Game, id); };
  const r = Game.contestChoose(0); // Do the stunt
  Game.apGrantItem = origGrant;
  captureSay(false);
  ok('stunt resolves the modal', !!(r && r.done));
  const netKcal = kcalBefore - Game.state.scholar.kcal;
  ok('stunt is a real kcal cost (no longer kcal-positive)', netKcal >= 100 && netKcal <= 200,
    'net spent ' + netKcal);
  ok('stunt costs 4 trauma', Game.state.scholar.trauma === 4);
  ok('stunt moves showbiz favor +3 (the numbers tick up, announced)',
    fanLane('showbiz') === favorBefore + 3, 'favor ' + favorBefore + ' -> ' + fanLane('showbiz'));
  ok('exactly ONE item grant (the care package — no curio double-dip)',
    grantCalls === 1, 'grants=' + grantCalls);
  const saidCare = saidLines.join('\n').toLowerCase();
  ok('care package outcome is said out loud (fires or whiffs honestly)',
    /care package|package|fans aren't|not organized/i.test(saidCare),
    saidLines.slice(-3).join(' | '));
}

sec('EXPLOIT E2 — care package snacks: wacky, never dinner (canon)');
{
  freshGame(15);
  captureSay(true);
  const kcalBefore = Game.state.scholar.kcal;
  const fired = Game.apCarePackage();
  captureSay(false);
  ok('care package fires at 50 favor', fired === true);
  const gained = Game.state.scholar.kcal - kcalBefore;
  ok('snack kcal is a taste, not dinner (<= 100)', gained <= 100, 'gained ' + gained);
}

sec('EXPLOIT E3 — stunt requires the body: starving player cannot stunt free');
{
  freshGame(15);
  Game.state.scholar.kcal = 0;
  Game.fireRatingsSummons();
  captureSay(true);
  const r = Game.contestChoose(0); // Do the stunt, at 0 kcal
  captureSay(false);
  const ac = Game.state.activeContest;
  ok('stunt is refused at 0 kcal (choice does not resolve)', !!(r && r.blocked));
  ok('modal stays open (no prize, no phase advance)', !!ac && ac.phase !== 'done');
  ok('no trauma charged for the refused stunt', Game.state.scholar.trauma === 0);
  ok('refusal is said out loud, honestly', saidLines.some(l => /200 kcal|not enough|starv/i.test(l)),
    saidLines.join(' | ').slice(0, 160));
}

sec('EXPLOIT E4 — 2/week budget holds across 42 days, summons included');
{
  freshGame(14);
  let worstWeek = 0;
  const seen = { summons: 0, contest: 0, show: 0 };
  const weeks = {};
  for (let d = 14; d < 56; d++) {
    Game.state.scholar.day = d;
    // force the dipping signal every day so summons are always possible
    const v = Game.state.village;
    v._lastWeekViewership = 40;
    try { v.viewership = 20; } catch (e) {}
    const ev = Game.contestTick();
    const wk = 'w' + Math.floor(d / 7);
    if (ev && ev.id) {
      weeks[wk] = (weeks[wk] || 0) + 1;
      if (ev.id === '__summons') seen.summons++;
      else if (Game.contestPool().find(c => c.id === ev.id)) seen.contest++;
      else seen.show++;
      // (budget was incremented inside contestTick — leave it; that's the point)
    }
  }
  for (const w of Object.keys(weeks)) worstWeek = Math.max(worstWeek, weeks[w]);
  ok('no week exceeds 2 scheduled events', worstWeek <= 2, 'worst=' + worstWeek);
  ok('summons can fire when dipping (scheduler reachable)', seen.summons > 0, JSON.stringify(seen));
  // unit: budget exhausted -> tick returns null
  freshGame(15);
  Game.state.showBudget = { week: Math.floor(15 / 7), used: 2 };
  ok('tick returns null when budget exhausted', Game.contestTick() === null);
}

// ================= SOFTLOCK =================
sec('SOFTLOCK S1 — broadcast frame always lifts (show + summons + villager watch)');
{
  freshGame(15);
  // player show
  Game.fireShow(Game.pickShow());
  ok('broadcast live during player show', !!(Game.state.broadcast && Game.state.broadcast.live));
  { // force the player as participant if a villager was cast
    if (Game.state.activeContest && Game.state.activeContest.participant !== 'player') {
      Game.state.activeContest = null; Game.state.broadcast = null;
      Game.fireShow(Game.pickShow());
    }
  }
  let ac = Game.state.activeContest;
  if (ac && ac.participant === 'player') {
    Game.contestChoose(0);
    ok('show end lifts broadcast', !Game.state.broadcast || !Game.state.broadcast.live);
    ok('show end clears activeContest', Game.state.activeContest === null);
  } else {
    ok('player show reachable', false, 'cast went to ' + (ac && ac.participant));
  }
  // summons: refuse path
  freshGame(15);
  Game.fireRatingsSummons();
  ok('broadcast live during summons', !!(Game.state.broadcast && Game.state.broadcast.live));
  Game.contestChoose(2); // refuse on camera
  ok('refuse lifts broadcast', !Game.state.broadcast || !Game.state.broadcast.live);
  ok('refuse clears activeContest', Game.state.activeContest === null);
  // idempotent end
  ok('broadcastEnd idempotent (no throw, no state)', Game.broadcastEnd() === false);
}

sec('SOFTLOCK S2 — villager pulled onto a show comes home (no phantom)');
{
  freshGame(15);
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  // force a villager pull: make one villager notable, then make the player
  // ineligible for the show cast (exiled) so the notable villager is pulled
  Game.addNotability(roster[0], 'showmanship');
  Game.addNotability(roster[0], 'showmanship');
  Game.state.scholar.exiled = true;
  Game.fireShow(Game.pickShow());
  const ac = Game.state.activeContest;
  ok('show fired with a villager cast', !!ac && ac.participant !== 'player' && ac.participant !== 'together',
    'participant=' + (ac && ac.participant));
  if (ac && ac.participant !== 'player' && ac.participant !== 'together') {
    const pid = ac.participant;
    Game.contestChoose(0); // cheer
    ok('villager show end lifts broadcast', !Game.state.broadcast || !Game.state.broadcast.live);
    ok('villager show end clears activeContest', Game.state.activeContest === null);
    ok('pulled villager still a member (came home)', Game.isMember(pid));
  }
  Game.state.scholar.exiled = false;
}

// ================= HONESTY =================
sec('HONESTY H1 — TV does not kill: no death path in any show phase');
{
  freshGame(15);
  let bad = [];
  const scan = (label, phases) => {
    for (const p of (phases || [])) for (const c of (p.choices || [])) {
      const d = c.do || {};
      if (c.next === 'DIE' || d.die) bad.push(label + ':' + c.label);
    }
  };
  // every show in the pool: player beats, watch beats, together beats
  for (const show of (Game.showPool ? Game.showPool() : [])) {
    scan('show:' + show.id, Game.showPhases(show, 'player'));
    scan('watch:' + show.id, Game.showWatchPhases(show, 'someone'));
    scan('together:' + show.id, Game.showTogetherPhases(show));
  }
  scan('summons', Game.ratingsSummonsPhases());
  ok('no DIE/die in any show-phase choice', bad.length === 0, bad.join('; '));
  // damage clamp: a show-kind dmg choice cannot kill
  freshGame(15);
  Game.state.scholar.health = 5;
  Game.state.activeContest = { kind: 'show', showId: 'x', showName: 'x', participant: 'player',
    phase: 'intro', phaseIdx: 0, phases: [{ text: 't', choices: [{ label: 'ouch', do: { dmg: [50, 60], note: 'x' }, next: 'LOSE' }] }] };
  Game.contestChoose(0);
  ok('show damage clamps at 1 HP (never kills)', Game.state.scholar.health >= 1,
    'health=' + Game.state.scholar.health);
  ok('show modal still resolves after clamped damage', Game.state.activeContest === null);
}

sec('HONESTY H2 — phone-it-in: no silent favor moves');
{
  freshGame(15);
  const favorBefore = fanLane('showbiz');
  captureSay(true);
  Game.fireRatingsSummons();
  Game.contestChoose(1); // phone it in
  captureSay(false);
  const favorAfter = fanLane('showbiz');
  const txt = saidLines.join('\n');
  const claimsNoMove = /numbers don.t move/i.test(txt);
  ok('phone-it-in lands as a loss (modal resolved)', Game.state.activeContest === null);
  if (favorAfter !== favorBefore) {
    ok('any favor move is said out loud (no silent numbers)',
      /showbiz favor/i.test(txt),
      'favor ' + favorBefore + ' -> ' + favorAfter + ' but no announcement');
  } else {
    ok('no favor move at all (copy "don\'t move" is true)', !claimsNoMove || favorAfter === favorBefore);
  }
  ok('copy never claims the numbers rise on a phone-in', !/tick up|numbers rise/i.test(txt));
}

sec('HONESTY H3 — stunt: "numbers tick up" is a real announced number');
{
  freshGame(15);
  const favorBefore = fanLane('showbiz');
  captureSay(true);
  Game.fireRatingsSummons();
  Game.contestChoose(0);
  captureSay(false);
  const txt = saidLines.join('\n');
  ok('favor +3 applied', fanLane('showbiz') === favorBefore + 3);
  ok('the +3 is announced with the favor readout', /\+3.*ratings stunt|ratings stunt.*\+3/i.test(txt));
}

sec('HONESTY H4 — eligibility: exiled / dead / gravely wounded / children excluded');
{
  freshGame(15);
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const v1 = roster[0], v2 = roster[1], v3 = roster[2];
  Game.state.village.health = Game.state.village.health || {};
  Game.state.village.health[v1] = 10; // gravely wounded
  const vp2 = Game.vpOf(v2); if (vp2) vp2.age = 10; // child
  // kill v3 (remove from roster via membership: use isMember path — sever)
  const elC = Game.contestEligible().eligible.map(e => e.id);
  const elS = Game.showEligible().map(e => e.id);
  ok('gravely wounded excluded (contest)', !elC.includes(v1));
  ok('gravely wounded excluded (show)', !elS.includes(v1));
  ok('child excluded (contest)', !elC.includes(v2));
  ok('child excluded (show)', !elS.includes(v2));
  Game.state.scholar.exiled = true;
  ok('exiled player excluded (contest)', !Game.contestEligible().eligible.map(e => e.id).includes('player'));
  ok('exiled player excluded (show)', !Game.showEligible().map(e => e.id).includes('player'));
  Game.state.scholar.exiled = false;
  Game.state.scholar.health = 0;
  ok('dead player excluded (contest)', !Game.contestEligible().eligible.map(e => e.id).includes('player'));
  ok('dead player excluded (show)', !Game.showEligible().map(e => e.id).includes('player'));
  Game.state.scholar.health = 100;
}

sec('HONESTY H5 — show prizes: wacky, never dinner');
{
  freshGame(15);
  const grants = [];
  const orig = Game.apGrantItem;
  Game.apGrantItem = function(id) { grants.push(id); return orig.call(Game, id); };
  for (const show of (Game.showPool ? Game.showPool() : [])) {
    freshGame(15);
    const phases = Game.showPhases(show, 'player');
    const wi = phases[0].choices.findIndex(c => c.next === 'WIN' && c.do && c.do.prize);
    if (wi >= 0) {
      Game.state.activeContest = { kind: 'show', showId: show.id, showName: show.name,
        participant: 'player', phase: 'intro', phaseIdx: 0, phases };
      Game.state.scholar.kcal = 2000;
      Game.contestChoose(wi);
    }
  }
  Game.apGrantItem = orig;
  const defs = {};
  for (const it of (Game.data.items || [])) defs[it.id] = it;
  const edible = grants.filter(id => { const d = defs[id] || {}; return d.kcalEach || d.class === 'food'; });
  ok('prize grants happened', grants.length > 0, 'n=' + grants.length);
  ok('no edible prize ever granted from a show', edible.length === 0, edible.join(','));
  // deterministic regression guard: _showEnd's grant-time filter must exclude
  // food (the "Can labeled BEANS", 350 kcal, sat in the pool pre-fix).
  const csrcShow = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
  ok('_showEnd prize filter excludes edible items (source)',
    /!it\.kcalEach/.test(csrcShow) && /it\.class !== 'food'/.test(csrcShow));
}

sec('HONESTY H6 — choice labels name their trauma costs');
{
  freshGame(15);
  const phases = Game.ratingsSummonsPhases();
  const stunt = phases[0].choices[0], phone = phases[0].choices[1];
  ok('stunt sub names 200 kcal AND 4 trauma', /200 kcal/i.test(stunt.sub) && /4 trauma/i.test(stunt.sub), stunt.sub);
  ok('phone-it-in sub names the 2 trauma', /2 trauma/i.test(phone.sub), phone.sub);
}

// ================= DEAD-CODE =================
sec('DEAD-CODE D1 — broadcast module loaded and runtime-wired');
{
  for (const fn of ['broadcastStart', 'broadcastEnd', 'broadcastBeat', 'broadcastTickerHTML', 'broadcastWatching']) {
    ok('Game.' + fn + ' exists', typeof Game[fn] === 'function');
  }
  freshGame(15);
  let beatCalls = 0;
  const orig = Game.broadcastBeat;
  Game.broadcastBeat = function(b, ac) { beatCalls++; return orig.call(Game, b, ac); };
  Game.fireRatingsSummons();
  Game.state.scholar.kcal = 2000;
  Game.contestChoose(0);
  Game.broadcastBeat = orig;
  ok('broadcastBeat fired during a summons lifecycle', beatCalls > 0, 'calls=' + beatCalls);
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok('broadcast.js in index.html', src.includes('src/js/broadcast.js'));
  ok('contestEngine.js in index.html', src.includes('src/js/contestEngine.js'));
}

sec('DEAD-CODE D2 — fan clubs move on show beats (not a stub)');
{
  for (const fn of ['apAdjustFavor', 'apCarePackage', 'apState']) {
    ok('Game.' + fn + ' exists', typeof Game[fn] === 'function');
  }
  freshGame(15);
  const before = fanLane('showbiz');
  Game.fireShow(Game.pickShow());
  const ac = Game.state.activeContest;
  if (ac && ac.participant === 'player') {
    Game.contestChoose(0);
    ok('a played show beat moves the showbiz club', fanLane('showbiz') !== before,
      before + ' -> ' + fanLane('showbiz'));
  } else {
    ok('player show beat reachable', false, 'participant=' + (ac && ac.participant));
  }
}

sec('DEAD-CODE D3 — contest engine villager resolution is real and wired');
{
  for (const fn of ['contestResolveVillager', 'contestResolveGroup']) {
    ok('Game.' + fn + ' exists', typeof Game[fn] === 'function');
  }
  freshGame(15);
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const contest = Game.contestPool().find(c => c.id === 'pit');
  const r = Game.contestResolveVillager(roster[0], contest, {});
  ok('villager resolution returns a real outcome', !!(r && r.outcome && r.log),
    JSON.stringify(r && r.outcome));
  const src = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  ok('eligibility display implemented in app.js (not a stub)', src.includes('oversightPanel'));
  const csrc = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
  const ri = csrc.indexOf('Recast honors the same ratings bias');
  ok('recast uses the shared notabilityWeight (one casting weight)',
    ri >= 0 && csrc.slice(ri, ri + 500).includes('notabilityWeight('),
    ri < 0 ? 'recast block not found' : csrc.slice(ri, ri + 120).replace(/\n/g, ' '));
}

console.log('\n==== ' + pass + ' pass, ' + fail + ' fail ====');
process.exit(fail ? 1 : 0);
