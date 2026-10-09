// BREAK-IT: CONTEST SYSTEM round 3 (2026-10-09) — hostile-player attacks.
// New surface (rounds 1-2 covered arena re-fire, moot walk-out prize, villager
// prize pantry cap, notability-weighted lead casting, determinism, engine wiring):
//   F1 HONESTY: hardened variant announced ("It's worse now") but dropped at
//       resolve — _contestVerdict/_contestResolveOthers refetched the pool BASE,
//       so watched villagers resolved at base risk and every end path said
//       "Pit" instead of "Hardened Pit". Fixed via _cxScaledContest(ac).
//   F2 HONESTY: hardened was mechanically identical for the player path (no
//       builder reads variant) — dmg x1.25 at the contestChoose choke point,
//       arena beasts +1 wave when hardened.
//   F3 EXPLOIT: player-win prize was {chance:1, tier:wave} — guaranteed apex
//       (tier-4) item on every wave-4 win + the forbidden wave->tier
//       conflation (monsters: 12% off an actual apex kill). Now a real drop
//       table: 60% (75% hardened) chance, tier cap 3, tier 4 only at 25% for
//       extreme-risk wave-4 wins; whiffs say so aloud.
//   HELD (documented): no participate+watch double-dip (bet/cheer are
//       watch-only); care package rate-limited (1/4d, favor>=20, 2/wk budget);
//       save-scum tilt closed (deterministic engine, cheer capped 0.15);
//       modal stacking guarded (contestTick + sleep wake-with-start);
//       maw is location-free modal fiction; day-7/System-arrival no overlap
//       (contests unlock day 14); eligibility panel driven by contestEligible();
//       "grab at dawn" == firesDay==day+1 resolved in the dawn routine;
//       all 44 contests have bespoke watch beats + death lines; all phase
//       beats resolve; extreme/gauntlet/siege wave gates reachable.
// Usage: node scripts/test-break-contest-20261009-r3.js [SEED]
// Seed via SEED env or argv; default 424242. Run x3 seeds.
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
  s.day = day || 15;
  Game.state.systemArrived = true;
  s.health = 100; s.kcal = 2000; s.trauma = 0; s.exiled = false;
  s.inventory = s.inventory || [];
  Game.state.over = false;
  Game.state.activeContest = null;
  Game.state.pendingContest = null;
  Game.state.arenaContest = null;
  Game.state.showBudget = { week: Math.floor(s.day / 7), used: 0 };
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  Game.state.village.positions = Game.state.village.positions || {};
  roster.slice(0, 4).forEach((vid, i) => {
    if (!Game.state.village.positions[vid]) Game.state.village.positions[vid] = { x: 2 + i, y: 2 + i };
  });
  return roster.slice(0, 4);
}
let saidLines = [];
const _origSysSay = Game.sysSay;
function captureSay(on) {
  if (on) { saidLines = []; Game.sysSay = function(t) { saidLines.push(String(t)); }; }
  else { Game.sysSay = _origSysSay; }
}

// ================= F1: hardened variant survives to resolve =================
sec('F1a — _contestVerdict passes the SCALED contest to the engine (hardened risk real)');
{
  freshGame(60); // wave 4 territory for risk tables
  const vids = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const v1 = vids[0];
  let captured = null;
  const origRG = Game.contestResolveGroup;
  Game.contestResolveGroup = function(pids, contest, opts) {
    captured = { risk: contest.risk, name: contest.name, id: contest.id };
    const out = {};
    pids.forEach(pid => { out[pid] = { outcome: 'won', detail: 'x', log: [] }; });
    return out;
  };
  captureSay(true);
  Game.state.activeContest = {
    contestId: 'pit', participant: v1, participants: [v1],
    phase: 'watching', phaseIdx: 2, phases: [], variant: 'hardened', cheer: 0,
  };
  Game._contestVerdict(Game.state.activeContest);
  captureSay(false);
  Game.contestResolveGroup = origRG;
  ok('engine got scaled risk (high->extreme for hardened pit)', captured && captured.risk === 'extreme',
    'risk=' + (captured && captured.risk));
  ok('engine got the Hardened name', captured && captured.name === 'Hardened The Pit',
    'name=' + (captured && captured.name));
  ok('winner line says Hardened The Pit', saidLines.some(l => l.includes('Hardened The Pit')),
    saidLines.filter(l => l.includes('Pit')).slice(0, 2).join(' | '));
}

sec('F1b — non-hardened resolve unchanged (no phantom prefix)');
{
  freshGame(60);
  const vids = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const v1 = vids[0];
  let captured = null;
  const origRG = Game.contestResolveGroup;
  Game.contestResolveGroup = function(pids, contest, opts) {
    captured = { risk: contest.risk, name: contest.name };
    const out = {};
    pids.forEach(pid => { out[pid] = { outcome: 'lost', detail: 'x', log: [] }; });
    return out;
  };
  captureSay(true);
  Game.state.activeContest = {
    contestId: 'pit', participant: v1, participants: [v1],
    phase: 'watching', phaseIdx: 2, phases: [], variant: null, cheer: 0,
  };
  Game._contestVerdict(Game.state.activeContest);
  captureSay(false);
  Game.contestResolveGroup = origRG;
  ok('base risk passes through (pit high)', captured && captured.risk === 'high',
    'risk=' + (captured && captured.risk));
  ok('base name has no Hardened prefix', captured && captured.name === 'The Pit',
    'name=' + (captured && captured.name));
}

sec('F1c — _contestResolveOthers passes the SCALED contest to the engine');
{
  freshGame(60);
  const vids = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const v1 = vids[0], v2 = vids[1];
  let captured = null;
  const origRV = Game.contestResolveVillager;
  Game.contestResolveVillager = function(pid, contest, opts) {
    captured = { risk: contest.risk, name: contest.name };
    return { outcome: 'lost', detail: 'x', log: [] };
  };
  Game.state.activeContest = {
    contestId: 'duel', participant: 'player', participants: ['player', v1, v2],
    others: [v1, v2], phase: 'intro', phaseIdx: 0, phases: [], variant: 'hardened',
  };
  Game._contestResolveOthers(Game.state.activeContest);
  Game.contestResolveVillager = origRV;
  ok('others engine got scaled risk (duel high->extreme)', captured && captured.risk === 'extreme',
    'risk=' + (captured && captured.risk));
  ok('others engine got the Hardened name', captured && captured.name === 'Hardened Duel',
    'name=' + (captured && captured.name));
}

sec('F1d — _contestDie death line uses the scaled name');
{
  freshGame(30);
  const vids = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const v1 = vids[0];
  captureSay(true);
  Game.state.activeContest = {
    contestId: 'pit', participant: v1, participants: [v1],
    phase: 'intro', phaseIdx: 0, phases: [], variant: 'hardened',
  };
  Game._contestDie(Game.state.activeContest, 'the arena');
  captureSay(false);
  ok('death line says Hardened The Pit', saidLines.some(l => l.includes('Hardened The Pit')),
    saidLines.filter(l => l.includes('Pit')).slice(0, 3).join(' | '));
}

// ================= F2: hardened is mechanically worse =================
sec('F2a — hardened phase damage x1.25 at the choke point (deterministic)');
{
  function runDmg(variant) {
    freshGame(15);
    Game.state.scholar.health = 100;
    Game.state.activeContest = {
      contestId: 'box', participant: 'player', participants: ['player'],
      phase: 'intro', phaseIdx: 0, variant,
      phases: [{ text: 't', choices: [{ label: 'x', do: { dmg: [4, 4] }, next: 'LOSE' }] }],
    };
    Game.contestChoose(0);
    return 100 - Game.state.scholar.health;
  }
  const normal = runDmg(null);
  const hardened = runDmg('hardened');
  ok('normal dmg [4,4] deals 4', normal === 4, 'dealt=' + normal);
  ok('hardened dmg [4,4] deals 5 (x1.25)', hardened === 5, 'dealt=' + hardened);
}

sec('F2b — hardened arena runs one wave hotter');
{
  freshGame(15);
  const origUW = Game.unlockedWave;
  const origMWP = Game.monsterWavePool;
  const origSC = Game.startCombat;
  Game.unlockedWave = () => 1;
  Game.monsterWavePool = () => [{ id: 'w1m', wave: 1 }, { id: 'w2m', wave: 2 }];
  Game.startCombat = () => null;
  function picks(variant, n) {
    const seen = [];
    for (let i = 0; i < n; i++) {
      const ac = { contestId: 'pit', variant, arenaSuspended: false };
      Game._contestArena(ac, { waves: 1 }, []);
      seen.push(Game.state.arenaContest.waves[0]);
      Game.state.arenaContest = null;
    }
    return seen;
  }
  const normalPicks = picks(null, 200);
  const hardenedPicks = picks('hardened', 200);
  Game.unlockedWave = origUW; Game.monsterWavePool = origMWP; Game.startCombat = origSC;
  ok('normal wave-1 arena never drafts wave-2 beasts',
    normalPicks.every(id => id === 'w1m'),
    normalPicks.filter(id => id !== 'w1m').length + ' hot picks');
  ok('hardened wave-1 arena drafts wave-2 beasts',
    hardenedPicks.some(id => id === 'w2m'),
    'w2 picks=' + hardenedPicks.filter(id => id === 'w2m').length + '/200');
}

// ================= F3: prize drop table =================
sec('F3 — player-win prize is a real drop table, not guaranteed apex');
{
  const origUW = Game.unlockedWave;
  const origRL = Game.rollAlienLoot;
  function prizeArgs(wave, contestId, variant, n) {
    Game.unlockedWave = () => wave;
    const seen = [];
    Game.rollAlienLoot = function(mdef) { seen.push({ chance: mdef.loot.chance, tier: mdef.loot.tier }); return null; };
    // freshGame resets the RNG — do it ONCE, then iterate without reseeding
    // (reseeding per iteration would repeat the 25% tier-4 roll identically).
    freshGame(60);
    Game.unlockedWave = () => wave;
    for (let i = 0; i < n; i++) {
      const s = Game.state.scholar;
      s.health = 100; s.kcal = 2000;
      Game.state.activeContest = {
        contestId, participant: 'player', participants: ['player'],
        phase: 'intro', phaseIdx: 0, variant,
      };
      captureSay(true);
      Game._contestEnd(Game.state.activeContest, 'won', true);
      captureSay(false);
    }
    Game.rollAlienLoot = origRL;
    return seen;
  }
  // box: base medium. wave 2 -> tier 2, chance 0.6
  let args = prizeArgs(2, 'box', null, 3);
  ok('wave-2 win: chance 0.6', args.every(a => a.chance === 0.6), JSON.stringify(args[0]));
  ok('wave-2 win: tier 2 (no wave->tier conflation)', args.every(a => a.tier === 2), JSON.stringify(args[0]));
  // lottery at wave 4: base low stays low (wave scaling only bumps
  // medium/high) -> not extreme -> tier 3, never 4
  args = prizeArgs(4, 'lottery', null, 50);
  ok('wave-4 non-extreme win: tier 3, never apex', args.every(a => a.tier === 3),
    'tiers=' + [...new Set(args.map(a => a.tier))].join(','));
  // pit at wave 4: high->extreme -> tier 3 mostly, tier 4 sometimes (25%)
  args = prizeArgs(4, 'pit', null, 200);
  const tiers = new Set(args.map(a => a.tier));
  ok('wave-4 extreme win: chance 0.6', args.every(a => a.chance === 0.6));
  ok('wave-4 extreme win: tier-4 possible but rare (not guaranteed)',
    tiers.has(4) && args.filter(a => a.tier === 4).length < 100,
    'tiers=' + [...tiers].join(',') + ' t4=' + args.filter(a => a.tier === 4).length + '/200');
  ok('wave-4 extreme win: no tier above 4, no tier below 3', [...tiers].every(t => t === 3 || t === 4),
    'tiers=' + [...tiers].join(','));
  // hardened: hotter chance
  args = prizeArgs(4, 'pit', 'hardened', 3);
  ok('hardened win: chance 0.75', args.every(a => a.chance === 0.75), JSON.stringify(args[0]));
  Game.unlockedWave = origUW;
  Game.rollAlienLoot = origRL;
}

sec('F3b — prize whiff says so aloud (no silent pocketing)');
{
  freshGame(60);
  const origUW = Game.unlockedWave;
  const origRL = Game.rollAlienLoot;
  Game.unlockedWave = () => 2;
  Game.rollAlienLoot = () => null; // the 40% whiff
  Game.state.activeContest = {
    contestId: 'box', participant: 'player', participants: ['player'],
    phase: 'intro', phaseIdx: 0, variant: null,
  };
  captureSay(true);
  Game._contestEnd(Game.state.activeContest, 'won', true);
  captureSay(false);
  Game.unlockedWave = origUW;
  Game.rollAlienLoot = origRL;
  ok('whiffed prize gets an honest line',
    saidLines.some(l => l.includes('feeling shy tonight')),
    saidLines.filter(l => l.toLowerCase().includes('prize')).join(' | '));
}

// ================= HELD: no participate+watch double-dip =================
sec('HELD — watch-only rewards unreachable on the participate path');
{
  freshGame(15);
  // Participate path phases never offer cheer/bet (watch-only agency)
  const contest = Game._contestScaled(Game.contestPool().find(c => c.id === 'pit'), null);
  const phases = Game.contestPlayable(contest);
  const hasWatchAgency = phases.some(ph => (ph.choices || []).some(ch => ch.do && (ch.do.cheer || ch.do.bet || ch.do.study)));
  ok('participate phases carry no cheer/bet/study levers', !hasWatchAgency);
  // Watch phases never resolve a player prize
  const wph = Game._contestWatchPhases(contest, ['villagerX']);
  ok('watch phases built without crashing', wph.length === 3);
}

console.log('\nRESULT: ' + pass + ' pass, ' + fail + ' fail (seed ' + SEED + ')');
process.exit(fail ? 1 : 0);
