// PROOF: show casting 2 — DEPTH + IMPACT + scholar debut (Steve 2026-10-09).
// "We need depth to count too. And impact. Every show shouldn't start as
// a together episode."
// After: ONE shared notabilityWeight —
//   W = 1 + 2 × Σ over deed types Σ over repeats (impact_t × depthMult_k)
//   depthMult: 1st ×1, 2nd ×0.5, 3rd ×0.25, 4th+ ×0.125 (halving repeats)
//   impact: wave3Kill 4, wave2Kill 3, survivedMoot/heist/contestWin 2,
//           showmanship 1, anything else 1 (default, no invention).
// Used by BOTH show casting and contest casting (single system).
// No default-together: with nobody notable the pull goes to the SCHOLAR
// (debut — "the cameras don't know these people yet. They know YOU.").
// Together fires ONLY on the viewership-milestone trigger.
// Usage: node scripts/test-show-casting2-20261009.js [SEED]  (x3 seeds;
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
  Game.state.village._peakViewership = 50; // milestone trigger armed, not firing
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
// deterministic cast: suppress the 10% whim (0.5 > 0.10)
function castNoWhim() { return withRandom(0.5, () => Game.showCastPull()); }

// ================= (a) depth: repeats halve — exact weights =================
sec('(a) depth — repeats halve, exact weights asserted');
{
  freshGame(16);
  const V = 'player';
  const w = (n, deed) => {
    Game.state.notability = {};
    for (let i = 0; i < n; i++) Game.addNotability(V, deed);
    return Game.notabilityWeight(V);
  };
  ok('1x contestWin (impact 2) = 5', w(1, 'contestWin') === 5, 'got ' + w(1, 'contestWin'));
  ok('2x contestWin = 7 (second halves)', w(2, 'contestWin') === 7, 'got ' + w(2, 'contestWin'));
  ok('3x contestWin = 8', w(3, 'contestWin') === 8, 'got ' + w(3, 'contestWin'));
  ok('4x contestWin = 8.5', w(4, 'contestWin') === 8.5, 'got ' + w(4, 'contestWin'));
  ok('5x contestWin = 9 (4th+ floored at 0.125)', w(5, 'contestWin') === 9, 'got ' + w(5, 'contestWin'));
  ok('10x contestWin still grows, slowly', w(10, 'contestWin') === 11.5, 'got ' + w(10, 'contestWin'));
  ok('1x wave2Kill (impact 3) = 7', w(1, 'wave2Kill') === 7, 'got ' + w(1, 'wave2Kill'));
  ok('1x wave3Kill (impact 4) = 9', w(1, 'wave3Kill') === 9, 'got ' + w(1, 'wave3Kill'));
  ok('1x showmanship (impact 1) = 3', w(1, 'showmanship') === 3, 'got ' + w(1, 'showmanship'));
  ok('unknown deed defaults to impact 1', w(1, 'unboxed on camera') === 3, 'got ' + w(1, 'unboxed on camera'));
  ok('zero deeds = 1 (the floor)', w(0, 'contestWin') === 1, 'got ' + w(0, 'contestWin'));
  // mixed: wave2Kill + 2x showmanship = 1 + 2*(3 + 1.5) = 10
  Game.state.notability = {};
  Game.addNotability(V, 'wave2Kill');
  Game.addNotability(V, 'showmanship'); Game.addNotability(V, 'showmanship');
  ok('mixed deeds sum: wave2Kill + 2x showmanship = 10', Game.notabilityWeight(V) === 10,
     'got ' + Game.notabilityWeight(V));
}

// ================= (b) impact outranks repeated small deeds =================
sec('(b) high-impact deed outpulls low-impact at equal counts');
{
  rng.reset(SEED);
  const roster = freshGame(16);
  const A = roster[0], B = roster[1];
  Game.addNotability(A, 'wave2Kill');                    // w = 7
  Game.addNotability(B, 'showmanship');
  Game.addNotability(B, 'showmanship');                  // w = 1+2*1.5 = 4 — depth can't catch impact
  const cast = castNoWhim();
  ok('1x wave2Kill beats 2x showmanship', cast.who === A && cast.why === 'star',
     `who=${cast.who} why=${cast.why}, expected ${A}`);
  // and at the top: 2x wave2Kill (1+2*3*1.5=10) beats 1x wave3Kill (9)? no — 10 > 9, depth wins here
  rng.reset(SEED);
  freshGame(16);
  Game.addNotability(roster[0], 'wave2Kill'); Game.addNotability(roster[0], 'wave2Kill'); // 10
  Game.addNotability(roster[1], 'wave3Kill');                                            // 9
  const cast2 = castNoWhim();
  ok('stacked depth can still win (2x wave2Kill > 1x wave3Kill)', cast2.who === roster[0],
     `who=${cast2.who}, expected ${roster[0]}`);
}

// ================= (c) floor: zero-deed villagers never pulled =================
sec('(c) zero-deed villager pulled in 0 of 20 seeds (notables exist)');
{
  let pickedZero = 0, stray = 0;
  const roster = freshGame(16);
  const star = roster[0], target = roster[1];
  Game.addNotability(star, 'contestWin');
  for (let i = 0; i < 20; i++) {
    rng.reset(SEED * 31 + i);
    const cast = Game.showCastPull(); // full path INCLUDING the 10% whim
    if (cast.who === target) pickedZero++;
    if (cast.who !== 'together' && cast.who !== star && cast.who !== 'player') stray++;
  }
  ok('unwatched villager never pulled (0/20)', pickedZero === 0, `picked ${pickedZero}/20`);
  ok('nobody outside the notable set ever picked', stray === 0, `strays ${stray}/20`);
}

// ================= (d) no notables -> scholar debut, never together =================
sec('(d) no notables -> scholar debut every time (0/20 together)');
{
  let debut = 0, tog = 0;
  for (let i = 0; i < 20; i++) {
    rng.reset(SEED * 7 + i);
    freshGame(16); // nobody notable, no milestone
    const c = Game.showCastPull();
    if (c.who === 'player' && c.why === 'debut') debut++;
    if (c.who === 'together') tog++;
  }
  ok('scholar debuts every time (20/20)', debut === 20, `${debut}/20`);
  ok('together never fires without a trigger (0/20)', tog === 0, `${tog}/20`);
  // narration: honest debut framing
  rng.reset(SEED);
  freshGame(16);
  captureSay(true);
  withRandom(0.9, () => Game.fireShow(Game.showPool()[0]));
  captureSay(false);
  const text = saidLines.join('\n');
  ok('debut narration: cameras know YOU', /don't know these people yet/i.test(text));
  ok('debut is exposure, not honor', /just what the aliens like to see/i.test(text));
  ok('no together narration on debut', !/watches together/i.test(text));
}

// ================= (e) milestone -> together =================
sec('(e) viewership milestone -> together fires');
{
  rng.reset(SEED);
  const roster = freshGame(16);
  Game.addNotability(roster[0], 'contestWin'); // notables exist — milestone still wins
  Game.state.village.viewership = 100;         // peak was 50 -> milestone
  const cast = castNoWhim();
  ok('milestone -> together', cast.who === 'together' && cast.why === 'milestone',
     `who=${cast.who} why=${cast.why}`);
}

// ================= (f) contest casting shares the one weight =================
sec('(f) contest casting still sane — one shared notabilityWeight');
{
  // structural: both call sites use the shared function
  ok('fireContest calls notabilityWeight', /notabilityWeight/.test(Game.fireContest.toString()));
  ok('showCastPull calls notabilityWeight', /notabilityWeight/.test(Game.showCastPull.toString()));
  // behavioral: the shared weight ranks contest candidates by depth+impact
  rng.reset(SEED);
  const roster = freshGame(16);
  Game.addNotability('player', 'showmanship'); // w = 3
  Game.addNotability(roster[0], 'wave2Kill');
  Game.addNotability(roster[0], 'wave2Kill');  // w = 1+2*3*1.5 = 10
  const wP = Game.notabilityWeight('player'), wV = Game.notabilityWeight(roster[0]);
  ok('shared weight: stacked wave2Kill outranks showmanship', wV === 10 && wP === 3 && wV > wP,
     `player=${wP} villager=${wV}`);
}

console.log('\n==== SEED ' + SEED + ': ' + pass + ' pass, ' + fail + ' fail ====');
process.exit(fail ? 1 : 0);
