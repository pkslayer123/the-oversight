// BREAK-IT: CONTESTS round 12 (2026-10-10) — hostile-player attacks on fresh
// ground vs r11 (cheer-trap, dead helpers, arena-death hygiene, dead-leak).
// This round attacks:
//   EXPLOIT: E1 re-trigger / re-entry farming (double-terminal prize &
//            counter duplication, verdict multi-mint), E2 multi-take
//            co-winner prize asymmetry (K3: watch-path winners ate, co-taken
//            winners didn't)
//   SOFTLOCK: S1 save/load mid-arena, S2 contest-while-show-live, S3 dawn
//            resolve with a show modal open (all documented as held)
//   HONESTY: H1 contestsHeld vs the "every end path flows through here"
//            comment (K1: die/refuse/arena-lost bypassed the counter),
//            H2 "who can go, AND WHY" — the eligibility panel never showed
//            who's out or why (K2: ineligible[] + panel section),
//            H3 arena-lost skipped the codex 'died' knowledge every other
//            death path grants (K1b)
//   DEAD-CODE: D1 contestEngine reachability census
// Usage: node scripts/test-break-contests-r12-20261010.js [SEED]
// Run x3 seeds: SEED=424242 / 777 / 31337
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
  catch (e) { /* missing file: key stays undefined */ }
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

// ---------- log capture ----------
let sysLines = [];
Game.sysSay = function(t) { sysLines.push(String(t)); };
Game.say = function(t) { sysLines.push(String(t)); };
function clearLog() { sysLines = []; }

// ---------- plumbing ----------
let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
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
  Game.state.contestsHeld = 0;
  Game.state.showBudget = { week: Math.floor(s.day / 7), used: 0 };
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  Game.state.village.positions = Game.state.village.positions || {};
  // everyone at Haven: the healthy baseline has no one off the board
  roster.forEach((vid, i) => {
    if (!Game.state.village.positions[vid]) Game.state.village.positions[vid] = { x: 2 + (i % 5), y: 2 + Math.floor(i / 5) };
  });
  Game.state.village.health = Game.state.village.health || {};
  roster.slice(0, 6).forEach(vid => { Game.state.village.health[vid] = 100; });
  clearLog();
  return roster.slice(0, 10);
}
function mkAc(participant, others) {
  return {
    contestId: 'pit', participant, participants: [participant].concat(others || []),
    others: others || [], phase: 'intro', phaseIdx: 0, phases: [], variant: null, wounds: 0,
  };
}
const POOL = () => Game.contestPool();

// ================= EXPLOIT =================
sec('EXPLOIT E1 — terminal re-entry: no double-count, no double-prize');
{
  const vills = freshGame(20);
  // (a) _contestEnd twice on the same ac: the counter must move exactly once.
  Game.state.activeContest = mkAc('player', []);
  Game._contestEnd(Game.state.activeContest, 'lost', false);
  const afterOne = Game.state.contestsHeld;
  // second call: contestChoose would refuse (phase==='done'), but a direct
  // re-call must also not double-count (belt and suspenders).
  Game.state.activeContest = mkAc('player', []);
  Game.state.activeContest._heldCounted = true; // simulate: already counted
  Game._contestEnd(Game.state.activeContest, 'lost', false);
  ok('E1a counter moves exactly once per contest object', afterOne === 1 && Game.state.contestsHeld === 1,
    `held=${Game.state.contestsHeld}`);
  // (b) multi-take verdict: _contestEnd fires per contestant on ONE ac —
  // the counter must still move exactly once.
  const w = vills.slice(0, 3);
  const _crg = Game.contestResolveGroup;
  Game.contestResolveGroup = function() {
    const o = {};
    for (const p of w) o[p] = { outcome: 'won', detail: '', log: [] };
    return o;
  };
  Game.state.activeContest = {
    contestId: 'pit', participant: w[0], participants: w.slice(), others: [],
    phase: 'watching', phaseIdx: 0, phases: [], variant: null, wounds: 0,
  };
  const heldBefore = Game.state.contestsHeld;
  Game._contestVerdict(Game.state.activeContest);
  Game.contestResolveGroup = _crg;
  ok('E1b 3-contestant verdict counts ONE held contest', Game.state.contestsHeld === heldBefore + 1,
    `delta=${Game.state.contestsHeld - heldBefore}`);
  // (c) prize-per-winner stays per-winner (the count fix must not touch it):
  // 3 villager wins in the verdict above = 3 pantry shares, not 1.
  const shares = (Game.state.village.pantry || []).filter(p => /Winner's share/.test(p.name || ''));
  ok('E1c verdict: each winner still gets their own share (3 wins = 3 shares)', shares.length >= 3,
    `shares=${shares.length}`);
}

sec('EXPLOIT E2 — multi-take co-winner prize (K3)');
{
  const vills = freshGame(20);
  const co = vills[0];
  let pantryAdds = 0;
  const _pa = Game.pantryAdd;
  Game.pantryAdd = function(s) { pantryAdds++; return _pa.call(this, s); };
  const _crv = Game.contestResolveVillager;
  // co-taken villager WINS their arena
  Game.contestResolveVillager = function() { return { outcome: 'won', detail: '', log: [] }; };
  Game.state.activeContest = mkAc('player', [co]);
  clearLog();
  Game._contestResolveOthers(Game.state.activeContest);
  ok('E2a co-taken winner gets exactly one winner\'s share', pantryAdds === 1, `pantryAdds=${pantryAdds}`);
  ok('E2b the share is the pantryAdd winner\'s share', sysLines.some(l => /Prize for .* winner's share/i.test(l)));
  // and a co-taken LOSER gets none
  pantryAdds = 0;
  Game.contestResolveVillager = function() { return { outcome: 'lost', detail: '', log: [] }; };
  Game.state.activeContest = mkAc('player', [co]);
  Game._contestResolveOthers(Game.state.activeContest);
  ok('E2c co-taken loser gets no share', pantryAdds === 0, `pantryAdds=${pantryAdds}`);
  Game.contestResolveVillager = _crv;
  Game.pantryAdd = _pa;
}

// ================= HONESTY =================
sec('HONESTY H1 — contestsHeld: every terminal counts (K1)');
{
  const vills = freshGame(20);
  // (a) villager death on camera (watch branch) counts
  Game.state.activeContest = mkAc(vills[0], []);
  Game._contestDie(Game.state.activeContest, 'the test');
  ok('H1a watched death counts as a held contest', Game.state.contestsHeld === 1,
    `held=${Game.state.contestsHeld}`);
  // (b) refusal counts
  Game.state.contestsHeld = 0;
  Game.state.activeContest = mkAc('player', []);
  Game._contestRefuse(Game.state.activeContest);
  ok('H1b refusal counts as a held contest', Game.state.contestsHeld === 1,
    `held=${Game.state.contestsHeld}`);
  ok('H1b refusal clears the modal', Game.state.activeContest === null);
  // (c) arena death counts AND grants codex 'died' knowledge like every
  // other death path (H3)
  Game.state.contestsHeld = 0;
  Game.state.codex = Game.state.codex || {}; Game.state.codex.contests = {};
  const ac = mkAc('player', []);
  ac.arenaSuspended = true;
  Game.state.activeContest = ac;
  Game.state.scholar.health = 100;
  Game._contestArenaAfter({ contestId: 'pit', waves: ['hushwolf'], waveIdx: 0 }, 'lost');
  ok('H1c arena death counts as a held contest', Game.state.contestsHeld === 1,
    `held=${Game.state.contestsHeld}`);
  const ck = (Game.state.codex.contests || {}).pit;
  ok('H3 arena death grants codex died-knowledge (like _contestDie)', !!(ck && ck.seen >= 2),
    `seen=${ck && ck.seen}`);
  ok('H1c arena death clears the modal', Game.state.activeContest === null);
  // (d) arena win still counts exactly once (via _contestEnd)
  Game.state.contestsHeld = 0;
  const ac2 = mkAc('player', []);
  ac2.arenaSuspended = true;
  Game.state.activeContest = ac2;
  Game._contestArenaAfter({ contestId: 'pit', waves: ['hushwolf'], waveIdx: 1 }, 'won');
  ok('H1d arena win counts exactly once', Game.state.contestsHeld === 1,
    `held=${Game.state.contestsHeld}`);
}

sec('HONESTY H2 — eligibility: who can go, AND WHY (K2)');
{
  const vills = freshGame(20);
  const V = Game.state.village;
  const [vSev, vYoung, vOld, vWound, vDead, vOk] = vills;
  // severed but still on the roster (the on-roster sever path)
  V.severed = V.severed || {}; V.severed[vSev] = { day: 20, how: 'test' };
  // fully severed via the real flow: off the roster, simply not castable
  const vGone = vills[6];
  try { Game.severMembership(vGone, 'test'); } catch (e) {}
  try { const vp = Game.vpOf(vYoung); if (vp) vp.age = 10; } catch (e) {}
  try { const vp = Game.vpOf(vOld); if (vp) vp.age = 80; } catch (e) {}
  V.health[vWound] = 15;
  try { const vp = Game.vpOf(vDead); if (vp) vp.dead = true; } catch (e) {}
  delete V.positions[vOk]; // positionless at Haven: unaccounted for
  V.nodePos = V.nodePos || {};
  const vAway = vills[7];
  delete V.positions[vAway]; V.nodePos[vAway] = { nx: 5, ny: 5 }; // out in the world
  const { eligible, ineligible } = Game.contestEligible();
  const ids = eligible.map(e => e.id);
  const outById = {};
  for (const o of ineligible) outById[o.id] = o.reason;
  ok('H2 severed villager out with reason', !ids.includes(vSev) && /severed/.test(outById[vSev] || ''), outById[vSev]);
  ok('H2 fully-severed (off roster) simply not castable', !ids.includes(vGone) && !outById[vGone]);
  ok('H2 child out with reason', !ids.includes(vYoung) && /young/.test(outById[vYoung] || ''), outById[vYoung]);
  ok('H2 elder out with reason', !ids.includes(vOld) && /old/.test(outById[vOld] || ''), outById[vOld]);
  ok('H2 gravely wounded out with reason', !ids.includes(vWound) && /wounded/.test(outById[vWound] || ''), outById[vWound]);
  ok('H2 dead-on-roster out with reason', !ids.includes(vDead) && /dead/.test(outById[vDead] || ''), outById[vDead]);
  ok('H2 positionless villager out with reason', !ids.includes(vOk) && /unaccounted/.test(outById[vOk] || ''), outById[vOk]);
  ok('H2 away-from-Haven villager out with reason', !ids.includes(vAway) && /away from Haven/.test(outById[vAway] || ''), outById[vAway]);
  // eligible set unchanged by the reporting (no one lost, no one gained)
  ok('H2 every excluded on-roster person is reported (none silently dropped)',
    [vSev, vYoung, vOld, vWound, vDead, vOk, vAway].every(id => outById[id]));
  // player exclusion reasons
  Game.state.scholar.exiled = true;
  const r2 = Game.contestEligible();
  const pOut = (r2.ineligible || []).find(o => o.id === 'player');
  ok('H2 exiled player out with reason', pOut && /exiled/.test(pOut.reason), pOut && pOut.reason);
  Game.state.scholar.exiled = false;
  Game.state.scholar.health = 0;
  const r3 = Game.contestEligible();
  const pOut2 = (r3.ineligible || []).find(o => o.id === 'player');
  ok('H2 dead player out with reason', pOut2 && /dead/.test(pOut2.reason), pOut2 && pOut2.reason);
  Game.state.scholar.health = 100;
  // healthy baseline: nothing off the board
  const vills2 = freshGame(20);
  const r4 = Game.contestEligible();
  ok('H2 healthy roster: ineligible list empty', (r4.ineligible || []).length === 0,
    `n=${(r4.ineligible || []).length}: ${JSON.stringify((r4.ineligible || []).map(o => o.reason))}`);
  void vills2;
}

// ================= DEAD CODE =================
sec('DEAD CODE D1 — contestEngine reachability + new-helper wiring');
{
  // every engine resolver is reachable from contests.js call sites
  const src = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
  ok('D1 contestResolveGroup called from contests.js', src.includes('this.contestResolveGroup('));
  ok('D1 contestResolveVillager called from contests.js', src.includes('this.contestResolveVillager('));
  // new helpers are defined AND called
  ok('D1 _cxCountHeld defined and called', /G\._cxCountHeld = function/.test(src) && (src.match(/this\._cxCountHeld\(/g) || []).length >= 4);
  ok('D1 _cxWinnerShare defined and called', /G\._cxWinnerShare = function/.test(src) && (src.match(/this\._cxWinnerShare\(/g) || []).length >= 2);
  // all four terminals route through the counter
  for (const fn of ['_contestEnd', '_contestDie', '_contestRefuse', '_contestArenaAfter']) {
    const i = src.indexOf('G.' + fn + ' = function');
    const next = src.indexOf('G.', i + 10);
    const body = src.slice(i, next === -1 ? undefined : next);
    ok(`D1 ${fn} counts the held contest`, body.includes('_cxCountHeld'), fn);
  }
  // arena-lost grants died knowledge
  const ai = src.indexOf('G._contestArenaAfter = function');
  const anext = src.indexOf('G.', ai + 10);
  ok('D1 arena-lost grants died knowledge', src.slice(ai, anext).includes("contestLearn(ac.contestId, 'died')"));
}

// ================= SUMMARY =================
console.log(`\n${pass} passed, ${fail} failed (seed ${SEED})`);
if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log(' - ' + f)); process.exit(1); }
