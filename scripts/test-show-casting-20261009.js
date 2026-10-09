// PROOF: show pull casting is NOTABILITY-FIRST (Steve 2026-10-09).
// Before: flat RNG — player 30% / random villager 40% / together 30%.
// "The cameras want YOU. No reason."
// After: the pull goes to the notable (weight 1 + notes×2, SAME as contest
// ratings_casting). Zero notability notes = NEVER pulled, across any number
// of seeds. Together episodes fire on triggers (no notables, viewership
// milestone), never a die roll. 10% whim is announced and constrained to
// notables. Exact ties share the top band (tiny RNG among equals only).
// The pull is exposure, not a prize: "popular isn't good, it's just what
// the aliens like to see."
// Usage: node scripts/test-show-casting-20261009.js [SEED]   (run x3 seeds;
// the never-cases run 20 seeds internally)
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
Math.random = rng;

// ---------- eval FULL script list in index.html order, minus DOM-only ----------
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
  Game.state.waveKills = { 1: 4 };
  Game.state.village.viewership = 50;
  Game.state.village._lastWeekViewership = 50;
  Game.state.village._peakViewership = 50; // milestone trigger starts armed, not firing
  Game.state.notability = {}; // NOBODY notable until the test says so
  return (Game.state.village.roster || []).filter(id => id !== Game.villagerId && Game.isMember(id));
}
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
// deterministic cast: suppress the 10% whim (0.5 > 0.10), single RNG draws don't matter
function castNoWhim() { return withRandom(0.5, () => Game.showCastPull()); }

// ================= (a) highest notability wins, across seeds =================
sec('(a) highest-notability villager pulled over lower — x3 seeds');
for (const sd of [SEED, SEED + 1, SEED + 2]) {
  rng.reset(sd);
  const roster = freshGame(16);
  const A = roster[0], B = roster[1];
  Game.addNotability(A, 'contestWin'); Game.addNotability(A, 'wave2Kill'); // 2 note types, w = 5
  Game.addNotability(B, 'wave2Kill');                                      // 1 note type, w = 3
  const cast = castNoWhim();
  ok(`seed ${sd}: top notable pulled`, cast.who === A && cast.why === 'star',
     `who=${cast.who} why=${cast.why}, expected ${A}`);
}

// ================= (b) zero-notability NEVER pulled — 20 seeds =================
sec('(b) zero-notability villager pulled in 0 of 20 seeds');
{
  let pickedZero = 0, pickedTarget = 0;
  const roster = freshGame(16);
  const star = roster[0], target = roster[1]; // target: the unwatched one
  Game.addNotability(star, 'contestWin');
  for (let i = 0; i < 20; i++) {
    rng.reset(SEED * 31 + i);
    const cast = Game.showCastPull(); // full path INCLUDING the 10% whim
    if (cast.who === target) pickedZero++;
    if (cast.who !== 'together' && cast.who !== star) pickedTarget++;
  }
  ok('unwatched villager never pulled (0/20)', pickedZero === 0, `picked ${pickedZero}/20`);
  ok('nobody outside the notable set ever picked', pickedTarget === 0, `strays ${pickedTarget}/20`);
}

// ================= (c) most-notable scholar pulled — not a flat rate =================
sec('(c) most-notable scholar pulled; rules pick, not a flat rate');
{
  rng.reset(SEED);
  let roster = freshGame(16);
  Game.addNotability('player', 'contestWin');
  Game.addNotability('player', 'wave2Kill');
  Game.addNotability('player', 'survivedMoot'); // 3 note types, w = 7
  Game.addNotability(roster[0], 'wave2Kill');   // 1 note type, w = 3
  let cast = castNoWhim();
  ok('most-notable scholar pulled', cast.who === 'player' && cast.why === 'star',
     `who=${cast.who} why=${cast.why}`);
  // and the reverse: a more-notable villager beats the scholar — no 30% flat rate
  rng.reset(SEED);
  roster = freshGame(16);
  Game.addNotability('player', 'wave2Kill'); // w = 3
  Game.addNotability(roster[0], 'contestWin');
  Game.addNotability(roster[0], 'survivedMoot'); // 2 note types, w = 5
  cast = castNoWhim();
  ok('more-notable villager beats scholar (no flat player rate)', cast.who === roster[0],
     `who=${cast.who}, expected ${roster[0]}`);
}

// ================= (d) together fires on triggers, never randomly =================
sec('(d) together fires on triggers only');
{
  // d1: no notables -> always together
  let together = 0;
  for (let i = 0; i < 10; i++) {
    rng.reset(SEED * 7 + i);
    freshGame(16); // nobody notable
    if (Game.showCastPull().who === 'together') together++;
  }
  ok('no notables -> together every time (10/10)', together === 10, `${together}/10`);
  // d2: notables present, no milestone -> NEVER together (20 seeds)
  let tog = 0;
  freshGame(16);
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId && Game.isMember(id));
  Game.addNotability(roster[0], 'contestWin');
  for (let i = 0; i < 20; i++) {
    rng.reset(SEED * 13 + i);
    if (Game.showCastPull().who === 'together') tog++;
  }
  ok('notables + no milestone -> together never fires (0/20)', tog === 0, `${tog}/20`);
  // d3: viewership milestone -> together, announced as milestone
  freshGame(16);
  const r2 = (Game.state.village.roster || []).filter(id => id !== Game.villagerId && Game.isMember(id));
  Game.addNotability(r2[0], 'contestWin');
  Game.state.village.viewership = 100; // peak was 50 -> milestone
  const cast = castNoWhim();
  ok('viewership milestone -> together', cast.who === 'together' && cast.why === 'milestone',
     `who=${cast.who} why=${cast.why}`);
  // d4: +1..+4 noise does NOT trigger (margin is +5)
  freshGame(16);
  const r3 = (Game.state.village.roster || []).filter(id => id !== Game.villagerId && Game.isMember(id));
  Game.addNotability(r3[0], 'contestWin');
  Game.state.village.viewership = 54;
  const cast2 = castNoWhim();
  ok('small viewership gain is not a milestone', cast2.who !== 'together', `who=${cast2.who}`);
}

// ================= (e) whim: announced + constrained to notables =================
sec('(e) whim path announced and notable-only');
{
  freshGame(16);
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId && Game.isMember(id));
  const star = roster[0];
  Game.addNotability(star, 'contestWin');
  // force the 10% whim: first RNG draw < 0.10
  const cast = withRandom(0.05, () => Game.showCastPull());
  ok('whim fires when forced', cast.why === 'whim', `why=${cast.why}`);
  ok('whim pick is notable', cast.who === star, `who=${cast.who}`);
  // narration: announced as whim, exposure framing, old "No reason." copy gone
  captureSay(true);
  withRandom(0.05, () => Game.fireShow(Game.showPool()[0]));
  captureSay(false);
  const text = saidLines.join('\n');
  ok('whim announced in narration', /whim/i.test(text) && /\*interesting\*/.test(text));
  ok('old "No reason." copy gone', !/No reason\./.test(text));
  ok('exposure framing present', /just what the aliens like to see/i.test(text));
}

// ================= tie band: tiny RNG among equals only =================
sec('tie band — RNG among equals, nobody below');
{
  freshGame(16);
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId && Game.isMember(id));
  const A = roster[0], B = roster[1], C = roster[2]; // C: unwatched
  Game.addNotability(A, 'contestWin'); // w=3
  Game.addNotability(B, 'wave2Kill');  // w=3 — exact tie at top
  const seen = new Set(); let stray = 0;
  for (let i = 0; i < 20; i++) {
    rng.reset(SEED * 17 + i);
    const cast = Game.showCastPull();
    seen.add(cast.who);
    if (cast.who !== A && cast.who !== B && cast.who !== 'together') stray++;
  }
  ok('both tied top candidates get pulled across seeds', seen.has(A) && seen.has(B),
     'seen: ' + [...seen].join(','));
  ok('nobody below the top band ever picked', stray === 0 && !seen.has(C), 'seen: ' + [...seen].join(','));
}

// ================= weight parity with contest casting =================
sec('weight parity: 1 + notes×2, same as ratings_casting');
{
  freshGame(16);
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId && Game.isMember(id));
  // 2 notes (w=5) beats 1 note (w=3): weight is per-NOTE, not per-category
  Game.addNotability(roster[0], 'showmanship');
  Game.addNotability(roster[0], 'contestWin'); // 2 note types, w = 5
  Game.addNotability(roster[1], 'contestWin'); // 1 note type, w = 3
  const cast = castNoWhim();
  ok('per-note weight decides (2×showmanship beats 1×contestWin)', cast.who === roster[0],
     `who=${cast.who}, expected ${roster[0]}`);
}

console.log('\n==== SEED ' + SEED + ': ' + pass + ' pass, ' + fail + ' fail ====');
process.exit(fail ? 1 : 0);
