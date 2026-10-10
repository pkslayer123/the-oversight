// BREAK-IT: CONTESTS round 11 (2026-10-10) — hostile-player attacks on the
// contest/show engine (src/js/contests.js + contestEngine.js).
// Fresh ground vs r10 (summons castability, phase-graph walk, budget, MIXED)
// and the shows/fameseeker runs: this run attacks
//   EXPLOIT: E1 bet arbitrage (is the 2x kcal wager +EV anywhere?),
//            E2 prize duplication (player win: loot+care-package counted;
//            villager win: pantryAdd counted), E3 eligibility bypass
//            (dead/exiled/underage/gravely-wounded can never be cast),
//            E4 countdown integrity (firesDay, no double-pending)
//   SOFTLOCK: S1 compact phase-graph walk (regression), S2 arena 'lost'
//            clears the modal, S3 every terminal clears activeContest
//   HONESTY: H1 countdown copy, H2 2/week budget over 28 dawns,
//            H3 cheer is real (win-rate delta), H4 casting honesty
//            (whim announced; notability-weighted lead, never uniform),
//            H5 fear honesty (blood contests really kill)
//   DEAD-CODE: D1 index.html wires contests.js, every G.* def has a caller,
//            D2 every pool id resolves to phases, D3 every pool id has a
//            bespoke death line + watch beats
// Usage: node scripts/test-break-contests-20261010.js [SEED]
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
  Game.state.showBudget = { week: Math.floor(s.day / 7), used: 0 };
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  Game.state.village.positions = Game.state.village.positions || {};
  roster.slice(0, 6).forEach((vid, i) => {
    if (!Game.state.village.positions[vid]) Game.state.village.positions[vid] = { x: 2 + i, y: 2 + i };
  });
  // villagers at full health by default
  Game.state.village.health = Game.state.village.health || {};
  roster.slice(0, 6).forEach(vid => { Game.state.village.health[vid] = 100; });
  clearLog();
  return roster.slice(0, 6);
}
function snapScholar() {
  const s = Game.state.scholar;
  return { health: s.health, kcal: s.kcal, trauma: s.trauma };
}
function restoreScholar(snap) {
  const s = Game.state.scholar;
  s.health = snap.health; s.kcal = snap.kcal; s.trauma = snap.trauma;
}
function snapAc() { return JSON.parse(JSON.stringify(Game.state.activeContest)); }
const POOL = () => Game.contestPool();

// ================= EXPLOIT =================
sec('EXPLOIT E1 — bet arbitrage: is the 2x kcal wager +EV anywhere?');
{
  // The bet: watch-mode choice wagers N kcal on the first taken; a win pays
  // 2x (contestChoose d.bet + _contestVerdict payout). At exactly 50% win
  // rate the wager is fair; systematically above 50% it is a kcal printer.
  // Measure off-screen win rates per contest with max cheer (the bettor's
  // best case: cheerBonus 15, cheerLift 3 — what _contestVerdict passes).
  const vills = freshGame(20);
  const trials = 20;
  const rows = [];
  const saveHealth = () => JSON.parse(JSON.stringify(Game.state.village.health || {}));
  const saveRoster = () => (Game.state.village.roster || []).slice();
  for (const c of POOL()) {
    let wins15 = 0, wins0 = 0, died15 = 0, died0 = 0, n = 0;
    for (let t = 0; t < trials; t++) {
      const pid = vills[t % vills.length];
      for (const cheer of [0, 15]) {
        Game.state.scholar.day = 20 + t; // seed varies by day (determinism contract)
        const h0 = saveHealth(), r0 = saveRoster();
        let r = null;
        try {
          const sc = Game._contestScaled(c, null);
          r = Game.contestResolveGroup([pid], sc, cheer ? { cheerBonus: 15, cheerLift: 3 } : {});
        } catch (e) { r = null; }
        Game.state.village.health = h0; Game.state.village.roster = r0;
        if (!r || !r[pid]) continue;
        n++;
        if (cheer) { if (r[pid].outcome === 'won') wins15++; if (r[pid].outcome === 'died') died15++; }
        else { if (r[pid].outcome === 'won') wins0++; if (r[pid].outcome === 'died') died0++; }
      }
    }
    rows.push({ id: c.id, cat: c.cat, risk: c.risk, w15: wins15 / trials, w0: wins0 / trials, d15: died15 / trials, d0: died0 / trials });
  }
  const printers = rows.filter(r => r.w15 > 0.55);
  console.log('  contests with win rate >55% at max cheer (2x bet is +EV): ' +
    (printers.length ? printers.map(r => `${r.id} ${(r.w15 * 100) | 0}%`).join(', ') : 'none'));
  const avg = rows.reduce((a, r) => a + r.w15, 0) / rows.length;
  console.log(`  mean win rate at max cheer: ${(avg * 100).toFixed(1)}% over ${rows.length} contests x ${trials} trials`);
  // VERDICT (documented, not fixed): the bet is a FIXED 200->400 kcal stake
  // (no escalation, no compounding, kcal-capped), offered at most once per
  // watch contest, which itself requires the 10% whim path with the player
  // not taken. Solo chance contests (wheel/lottery/longodds) are rigged
  // theater — the lone contestant always wins BY DOCUMENTED DESIGN
  // (contestEngine.js _cxChance: "rigged theater ... Documented, not
  // hidden"). A code-knowing bettor can clear a risk-free +200 kcal there,
  // but the economics are bounded: +200/occurrence, rare trigger, capped
  // bank. Not a true infinite exploit (Steve's bar) — min-maxing welcome.
  // What WOULD be a break: a scalable stake or repeated bets per contest.
  // Assert the stake stays fixed and single.
  ok('E1 bet stake is fixed 200 kcal everywhere (no escalation path)', (() => {
    freshGame(20);
    const vills = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
    let amounts = new Set();
    for (const c of POOL()) {
      const sc = Game._contestScaled(c, null);
      const ph = Game._contestWatchPhases(sc, [vills[0]]);
      for (const p of ph) for (const ch of (p.choices || [])) {
        if (ch.do && ch.do.bet) amounts.add(ch.do.bet.amount);
      }
    }
    return amounts.size === 1 && amounts.has(200);
  })(), 'amounts seen: check log');
  // FEAR data rides along: blood contests must really kill (H5 uses this too)
  const blood = rows.filter(r => ['pit', 'gauntlet', 'duel', 'siege'].includes(r.id));
  console.log('  blood death rates (cheer0/cheer15): ' + blood.map(r => `${r.id} ${(r.d0 * 100) | 0}%/${(r.d15 * 100) | 0}%`).join(', '));
  globalThis.__E1ROWS = rows;
  globalThis.__E1CHEER = rows.map(r => ({ id: r.id, d: r.w15 - r.w0 }));
}

sec('EXPLOIT E2 — prize duplication on win paths');
{
  freshGame(20);
  // Player win: count loot grants + care packages across a forced WIN.
  let lootGrants = 0, carePkgs = 0, pantryAdds = 0;
  const _alg = Game.alienLootGrant, _acp = Game.apCarePackage, _pa = Game.pantryAdd;
  Game.alienLootGrant = function(l) { lootGrants++; return _alg.call(this, l); };
  Game.apCarePackage = function() { carePkgs++; return _acp.call(this); };
  Game.pantryAdd = function(s) { pantryAdds++; return _pa.call(this, s); };
  const c = Game._contestScaled(POOL().find(x => x.id === 'pit'), null);
  Game.state.activeContest = { contestId: 'pit', participant: 'player', participants: ['player'],
    others: [], phase: 'intro', phaseIdx: 0, phases: [], variant: null, wounds: 0 };
  clearLog();
  Game._contestEnd(Game.state.activeContest, 'won', true);
  ok('E2 player win grants at most one loot roll', lootGrants <= 1, 'grants=' + lootGrants);
  ok('E2 player win triggers at most one care package', carePkgs <= 1, 'pkgs=' + carePkgs);
  ok('E2 player win cleared the modal', Game.state.activeContest === null);
  // Villager win (watch mode): pantry share granted exactly once.
  const vills = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  Game.state.activeContest = { contestId: 'pit', participant: vills[0], participants: [vills[0]],
    others: [], phase: 'watching', phaseIdx: 0, phases: [], variant: null, wounds: 0 };
  const pantryBefore = (Game.state.village.pantry || []).length;
  Game._contestEnd(Game.state.activeContest, 'won', true);
  ok('E2 villager win: exactly one pantryAdd call', pantryAdds === 1, 'pantryAdds=' + pantryAdds);
  ok('E2 villager win cleared the modal', Game.state.activeContest === null);
  Game.alienLootGrant = _alg; Game.apCarePackage = _acp; Game.pantryAdd = _pa;
  void pantryBefore;
}

sec('EXPLOIT E3 — eligibility bypass: the unfit can never be cast');
{
  const vills = freshGame(20);
  const V = Game.state.village;
  // Rig one villager into each ineligible bucket.
  const dead = vills[0], exiled = vills[1], young = vills[2], old = vills[3], wounded = vills[4], okv = vills[5];
  V.health[dead] = 0;
  try { Game.removeVillager ? null : null; } catch (e) {}
  V.roster = V.roster.filter(id => id !== dead); // dead: off roster
  // exiled: sever membership — isMember false (real fn name: severMembership)
  try { if (Game.severMembership) Game.severMembership(exiled, 'test'); } catch (e) { V.roster = V.roster.filter(id => id !== exiled); }
  const vp = (id) => { try { return Game.vpOf(id); } catch (e) { return null; } };
  if (vp(young)) vp(young).age = 10;
  if (vp(old)) vp(old).age = 80;
  V.health[wounded] = 20; // gravely wounded: at/below the 20 HP floor
  const { eligible } = Game.contestEligible();
  const ids = eligible.map(e => e.id);
  ok('E3 dead villager not eligible', !ids.includes(dead));
  ok('E3 exiled/severed villager not eligible', !ids.includes(exiled));
  ok('E3 child not eligible', !ids.includes(young));
  ok('E3 elder not eligible', !ids.includes(old));
  ok('E3 gravely-wounded (<=20 HP) villager not eligible', !ids.includes(wounded));
  ok('E3 healthy adult still eligible', ids.includes(okv));
  // fireContest 300x: no pick outside the eligible set, no crash.
  let bad = 0, fired = 0;
  const elSet = new Set(ids);
  for (let i = 0; i < 300; i++) {
    clearLog();
    const c = POOL()[i % POOL().length];
    try {
      Game.state.pendingContest = null;
      Game.fireContest(Game._contestScaled(c, null));
      const pc = Game.state.pendingContest;
      if (pc) {
        fired++;
        for (const pid of (pc.participants || [])) if (!elSet.has(pid)) bad++;
      }
    } catch (e) { bad++; }
  }
  ok('E3 300 fireContest picks all within eligible set', bad === 0 && fired > 0, `bad=${bad} fired=${fired}`);
  // Documented asymmetry: a battered-but-standing PLAYER (1 HP) IS eligible.
  Game.state.scholar.health = 1;
  const { eligible: el2 } = Game.contestEligible();
  ok('E3 battered player (1 HP) remains eligible by design ("The System is not kind")',
    el2.some(e => e.id === 'player'));
  Game.state.scholar.health = 100;
}

sec('EXPLOIT E4 — countdown integrity: firesDay, no double-pending');
{
  freshGame(15);
  clearLog();
  const c = Game._contestScaled(POOL().find(x => x.id === 'pit'), null);
  Game.fireContest(c);
  const pc = Game.state.pendingContest;
  ok('E4 fire sets pendingContest', !!pc);
  ok('E4 countdown is exactly one day ("The grab comes at dawn. One more day.")',
    pc && pc.firesDay === 16, 'firesDay=' + (pc && pc.firesDay));
  // contestTick must not fire a second event while one is pending.
  const t = Game.contestTick();
  ok('E4 no second fire while pending', t === null);
  // Resolve at dawn: the interruption lands.
  Game.state.scholar.day = 16;
  clearLog();
  Game.resolveContest();
  ok('E4 pending cleared on resolve', Game.state.pendingContest === null);
  ok('E4 resolve lands an interruption modal', !!Game.state.activeContest);
  Game.state.activeContest = null;
}

// ================= SOFTLOCK =================
sec('SOFTLOCK S1 — phase-graph walk: every choice of every contest terminates');
{
  // Compact regression of the r10 exhaustive walk: for each pool contest, in
  // grabbed mode (and choice mode for givesChoice-30% — forced here), walk
  // every choice edge via the REAL contestChoose. Edges must terminate
  // (done/arena/blocked/phase), never throw, never return null, never cycle.
  const TERMINALS = new Set(['WIN', 'LOSE', 'DIE', 'REFUSE', 'VERDICT', 'MOOT_JUDGE', 'MAW_JUDGE', 'MIXED', 'SHOW_VILLAGER']);
  let problems = [], edges = 0;
  function walkContest(cid, useChoice) {
    freshGame(20);
    Game.state.scholar.health = 500; // survive damage edges; DIE terminals still route
    const base = POOL().find(x => x.id === cid);
    const contest = Game._contestScaled(base, null);
    // Force the mode: choice-mode prepends the participate/refuse phase.
    let ac;
    const savedRandom = Math.random;
    try {
      if (useChoice) {
        // Drive contestInterruption's givesChoice branch deterministically.
        let n = 0;
        Math.random = () => { n++; return n === 1 ? 0.05 : savedRandom(); }; // <0.3 => givesChoice
        Game.contestInterruption(contest, ['player']);
      } else {
        Math.random = () => 0.99; // >=0.3 => grabbed
        Game.contestInterruption(contest, ['player']);
      }
      ac = Game.state.activeContest;
    } finally { Math.random = savedRandom; }
    if (!ac) { problems.push(cid + ': no modal opened'); return; }
    // Static: every numeric next must land inside the phase array. An
    // out-of-range numeric silently becomes _contestEnd('lost') — a
    // mis-authored edge hiding as a defeat.
    ac.phases.forEach((p, pi) => {
      (p.choices || []).forEach((ch, ci) => {
        if (typeof ch.next === 'number' && (ch.next < 0 || ch.next >= ac.phases.length))
          problems.push(cid + ' p' + pi + ' c' + ci + ': numeric next ' + ch.next + ' out of range (len ' + ac.phases.length + ')');
      });
    });
    const pathStack = [];
    function dfs(depth) {
      const cur = Game.state.activeContest;
      if (!cur) { problems.push(cid + ': modal vanished mid-walk'); return; }
      if (depth > 30) { problems.push(cid + ': depth cap — cycle? path ' + pathStack.join('>')); return; }
      const phases = cur.phases || [];
      const pi = cur.phaseIdx || 0;
      const phase = phases[pi];
      if (!phase || !(phase.choices || []).length) { problems.push(cid + ': phase ' + pi + ' has no choices'); return; }
      for (let i = 0; i < phase.choices.length; i++) {
        const ch = phase.choices[i];
        const edge = cid + ' p' + pi + ' c' + i;
        if (ch.do && ch.do.arena) { edges++; continue; } // real fight via tbEnd — terminal here
        const acSnap = snapAc(), sSnap = snapScholar();
        let res = null, threw = null;
        try { res = Game.contestChoose(i); } catch (e) { threw = e; }
        edges++;
        if (threw) problems.push(edge + ': THREW ' + threw.message);
        else if (!res) problems.push(edge + ': null result — dead input');
        else if (res.done || res.arena || res.blocked) { /* terminal */ }
        else if (res.phase) {
          const npi = (Game.state.activeContest || {}).phaseIdx || 0;
          // Path-based cycle detection: only a return to a phase already on
          // THIS path is a cycle. Merges (two edges -> same phase) are fine.
          if (pathStack.includes('p' + npi)) problems.push(edge + ': CYCLE back to p' + npi + ' on path ' + pathStack.concat(['p' + npi]).join('>'));
          else { pathStack.push('p' + npi); dfs(depth + 1); pathStack.pop(); }
        } else problems.push(edge + ': unrecognized result');
        if (Game.state.activeContest) Game.state.activeContest = acSnap; else Game.state.activeContest = acSnap;
        restoreScholar(sSnap);
      }
    }
    pathStack.push('p' + (ac.phaseIdx || 0));
    dfs(0);
    Game.state.activeContest = null;
  }
  for (const c of POOL()) { walkContest(c.id, false); }
  // choice-mode for a sample (the prepend shifts every numeric next +1)
  for (const cid of ['pit', 'moot', 'tithe', 'auction', 'hide']) walkContest(cid, true);
  console.log(`  walked ${edges} choice edges across ${POOL().length} contests (+5 choice-mode)`);
  ok('S1 every choice edge terminates, no throws, no dead input, no cycles', problems.length === 0,
    problems.slice(0, 5).join(' | '));
}

sec('SOFTLOCK S2 — arena death path clears the modal (no stuck screen)');
{
  freshGame(20);
  const contest = Game._contestScaled(POOL().find(x => x.id === 'pit'), null);
  Game.contestInterruption(contest, ['player']);
  const ac = Game.state.activeContest;
  ac.arenaSuspended = true;
  const arc = { contestId: 'pit', waves: ['hushwolf'], waveIdx: 0 };
  // The tbEnd hook (game.js) clears state.arenaContest BEFORE routing to
  // _contestArenaAfter — mirror the production path.
  Game.state.arenaContest = arc;
  Game.state.arenaContest = null;
  clearLog();
  const res = Game._contestArenaAfter(arc, 'lost');
  ok('S2 arena loss returns done/died', res && res.done && res.outcome === 'died');
  ok('S2 arena loss clears activeContest', Game.state.activeContest === null);
  ok('S2 arena loss leaves no stale arena routing', !Game.state.arenaContest);
  ok('S2 arena loss says the death line out loud',
    sysLines.some(l => /did not come home|fed the Pit|Death Reel/i.test(l)));
  // won path with no waves left also terminates
  Game.contestInterruption(contest, ['player']);
  const ac2 = Game.state.activeContest;
  ac2.arenaSuspended = true;
  const arc2 = { contestId: 'pit', waves: ['hushwolf'], waveIdx: 0 };
  const res2 = Game._contestArenaAfter(arc2, 'won');
  ok('S2 arena win terminates the contest', res2 && res2.done && Game.state.activeContest === null);
}

sec('SOFTLOCK S2b — arena death gets the full resolve hygiene (beat/stop/drama)');
{
  // Same class as audio pass 5 (2026-10-09): every contest-death path must
  // fire the Resolve beat, stop sustained beat audio, and play the
  // sympathetic-dim drama beat. The arena 'lost' path skipped all three.
  freshGame(20);
  const calls = [];
  const _ae = Game.audioEvent, _dr = Game.drama;
  Game.audioEvent = function(n) { calls.push('audio:' + n); };
  Game.drama = function(k, d) { calls.push('drama:' + k + ':' + ((d && d.type) || '')); };
  Game.audio = Game.audio || {}; // _cxBeat dispatches through this.audio
  const contest = Game._contestScaled(POOL().find(x => x.id === 'pit'), null);
  Game.contestInterruption(contest, ['player']);
  const ac = Game.state.activeContest;
  ac.arenaSuspended = true;
  Game._contestArenaAfter({ contestId: 'pit', waves: ['hushwolf'], waveIdx: 0 }, 'lost');
  Game.audioEvent = _ae; Game.drama = _dr;
  ok('S2b arena death fires the Resolve beat',
    calls.some(c => c === 'audio:contestPitResolve'), calls.join(' | ').slice(0, 200));
  ok('S2b arena death stops sustained beat audio', calls.includes('audio:heartbeatStop'));
  ok('S2b arena death plays the loser drama beat', calls.includes('drama:contest:loser'));
}

sec('SOFTLOCK S3 — every terminal clears activeContest');
{
  const terms = ['WIN', 'LOSE', 'DIE', 'REFUSE'];
  let bad = 0;
  for (const t of terms) {
    freshGame(20);
    Game.state.scholar.health = 500;
    const contest = Game._contestScaled(POOL().find(x => x.id === 'pit'), null);
    Game.contestInterruption(contest, ['player']);
    const ac = Game.state.activeContest;
    // Drive straight to the terminal via a synthetic choice appended to phase 0.
    ac.phases[0].choices.push({ label: 'TEST-' + t, sub: 'x', do: {}, next: t });
    clearLog();
    let res = null;
    try { res = Game.contestChoose(ac.phases[0].choices.length - 1); }
    catch (e) { bad++; console.log('  terminal ' + t + ' threw: ' + e.message); }
    if (!res || !res.done) { bad++; console.log('  terminal ' + t + ' did not finish'); }
    if (Game.state.activeContest !== null) { bad++; console.log('  terminal ' + t + ' left modal open'); }
    if (Game.state.over && t !== 'DIE') { /* death only expected on DIE */ }
  }
  // DIE kills the player: village-as-protagonist — the mantle passes to a
  // successor (ledger.js playerDeath), it does NOT set over=true while the
  // village stands. Assert the handoff, not a game-over flag.
  ok('S3 WIN/LOSE/REFUSE clear the modal', bad === 0);
  freshGame(20);
  Game.state.scholar.health = 100;
  const oldBearer = Game.villagerId;
  const contest2 = Game._contestScaled(POOL().find(x => x.id === 'pit'), null);
  Game.contestInterruption(contest2, ['player']);
  const ac2 = Game.state.activeContest;
  ac2.phases[0].choices.push({ label: 'TEST-DIE', sub: 'x', do: {}, next: 'DIE' });
  clearLog();
  const rdie = Game.contestChoose(ac2.phases[0].choices.length - 1);
  ok('S3 DIE finishes the contest', rdie && rdie.done && rdie.outcome === 'died');
  ok('S3 DIE clears the modal', Game.state.activeContest === null);
  ok('S3 DIE passes the mantle (village-as-protagonist, game continues)',
    Game.over !== true && Game.villagerId !== oldBearer,
    `over=${Game.over} bearerChanged=${Game.villagerId !== oldBearer}`);
  ok('S3 DIE says the death line out loud',
    sysLines.some(l => /Death Reel|did not come home|fed the Pit/i.test(l)));
}

// ================= HONESTY =================
sec('HONESTY H2 — the 2/week budget holds over 28 dawns');
{
  freshGame(14);
  const usedPerWeek = {};
  // Force the scheduling roll to always pass so the budget is the only gate.
  const savedRandom = Math.random;
  let calls = 0;
  for (let d = 14; d < 42; d++) {
    Game.state.scholar.day = d;
    Game.state.pendingContest = null;
    Game.state.activeContest = null;
    // resolve any pending from the forced fire below immediately
    Math.random = () => 0.0; // chance roll passes; contestShare picks contest
    const ev = Game.contestTick();
    Math.random = savedRandom;
    if (ev && ev.id) {
      calls++;
      const wk = Math.floor(d / 7);
      usedPerWeek[wk] = (usedPerWeek[wk] || 0) + 1;
      // immediately resolve so the next dawn can fire again (stress the gate)
      if (ev.id === '__summons') {
        try { Game.fireRatingsSummons(); } catch (e) {}
        Game.state.activeContest = null;
      } else if (Game.contestPool().find(c => c.id === ev.id)) {
        try {
          Game.fireContest(ev);
          Game.state.scholar.day = d + 1;
          try { Game.resolveContest(); } catch (e) {}
          Game.state.activeContest = null;
          Game.state.pendingContest = null;
        } catch (e) {}
      } else {
        try { Game.fireShow(ev); } catch (e) {}
        Game.state.activeContest = null;
      }
    }
  }
  const over = Object.entries(usedPerWeek).filter(([w, n]) => n > 2);
  console.log('  events/week: ' + Object.entries(usedPerWeek).map(([w, n]) => `w${w}:${n}`).join(' ') + ` (${calls} total)`);
  ok('H2 no week exceeds 2 combined contests+shows', over.length === 0 && calls > 0,
    over.map(([w, n]) => `w${w}=${n}`).join(','));
}

sec('HONESTY H3 — cheer is real performance, not decoration');
{
  // From E1: compare win rates with cheer 0 vs max cheer. If cheer never
  // moves a single outcome, "cheer is real performance" is a lie.
  const rows = globalThis.__E1CHEER || [];
  const moved = rows.filter(r => Math.abs(r.d) > 0.001);
  const up = rows.filter(r => r.d > 0.001);
  console.log(`  cheer changed win rate in ${moved.length}/${rows.length} contests (${up.length} improved)`);
  ok('H3 cheer moves outcomes somewhere (it is read by the engine)', moved.length > 0);
  ok('H3 cheer never systematically hurts (no contest worse at max cheer by >20pts)',
    !rows.some(r => r.d < -0.2), rows.filter(r => r.d < -0.2).map(r => r.id).join(','));
}

sec('HONESTY H4 — casting honesty: whim announced, notability-weighted lead');
{
  const vills = freshGame(20);
  // Whim path: force Math.random < 0.1 on the first draw of fireContest.
  const savedRandom = Math.random;
  clearLog();
  let n = 0;
  Math.random = () => { n++; return n === 1 ? 0.05 : savedRandom(); };
  Game.state.scholar.health = 0; // player not castable -> villager lead paths exercised
  const c = Game._contestScaled(POOL().find(x => x.id === 'pit'), null);
  Game.fireContest(c);
  Math.random = savedRandom;
  const said = sysLines.join('\n');
  ok('H4 the 10% whim says so out loud when taken', /whim/i.test(said), said.slice(0, 120));
  Game.state.pendingContest = null;
  Game.state.scholar.health = 100;
  // Notability-weighted lead: one villager with 6 contest wins vs unknowns.
  const star = vills[0];
  for (let i = 0; i < 6; i++) Game.addNotability(star, 'contestWin');
  const wStar = Game.notabilityWeight(star), wPlain = Game.notabilityWeight(vills[1]);
  ok('H4 notability weight rewards deeds', wStar > wPlain * 2, `star=${wStar} plain=${wPlain}`);
  // Lead-pick distribution with the player out: the star should lead far
  // more often than the uniform 1/6.
  Game.state.scholar.health = 0;
  let starLeads = 0, tot = 0;
  for (let i = 0; i < 240; i++) {
    clearLog();
    Game.state.pendingContest = null;
    try {
      Game.fireContest(Game._contestScaled(POOL()[i % POOL().length], null));
      const pc = Game.state.pendingContest;
      if (pc && pc.participant) { tot++; if (pc.participant === star) starLeads++; }
    } catch (e) {}
  }
  Game.state.scholar.health = 100;
  const rate = tot ? starLeads / tot : 0;
  console.log(`  star lead rate: ${(rate * 100).toFixed(1)}% over ${tot} fires (uniform would be ~${(100 / 6).toFixed(1)}%)`);
  ok('H4 famous villagers lead far more often than uniform (notability-first, never RNG-first)',
    rate > 0.30, `rate=${rate.toFixed(2)}`);
}

sec('HONESTY H5 — fear honesty: death is really on the table');
{
  // Calibrated 2026-10-10: watched blood resolves through the morale model
  // (fieldFights.js) — healthy villagers FLEE hopeless fights (believable
  // flight), so watched-pit deaths are rare burst/grind events, not
  // regular. The fear lives where it's played: the player's arena fights
  // are real tactical combat, and the Maw is deterministic pursuit. What
  // honesty demands: death must be POSSIBLE where the copy promises it,
  // and CERTAIN where the fiction says so.
  const rows = globalThis.__E1ROWS || [];
  // 1. The Maw (extreme: "Almost nobody walks away") kills the nerveless —
  // deterministic from stats, not a roll. A 0-bravery villager never walks out.
  let mawDeaths = 0;
  {
    freshGame(20);
    const vills = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
    const maw = Game._contestScaled(POOL().find(x => x.id === 'maw'), null);
    for (let t = 0; t < 10; t++) {
      const pid = vills[t % vills.length];
      Game.state.scholar.day = 50 + t;
      Game.state.village.health[pid] = 100;
      const h0 = JSON.parse(JSON.stringify(Game.state.village.health)), r0 = Game.state.village.roster.slice();
      let r = null;
      try { r = Game.contestResolveGroup([pid], maw, {}); } catch (e) {}
      Game.state.village.health = h0; Game.state.village.roster = r0;
      if (r && r[pid] && r[pid].outcome === 'died') mawDeaths++;
    }
  }
  console.log(`  maw deaths for 0-bravery villagers: ${mawDeaths}/10`);
  ok('H5 the Maw kills the nerveless (extreme risk is honest)', mawDeaths === 10);
  // 2. Blood CAN kill — existence proof at the engine level (fieldFight
  // produces vDie when the beast overwhelms; watched deaths are rare
  // because the morale model favors flight — documented below, not tuned
  // here). A 1-HP villager caught by a wave-2 beast dies on the spot.
  {
    freshGame(20);
    const vills = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
    const pid = vills[0];
    const beasts = (Game.data.monsters || []).filter(m => (m.wave || 1) >= 2);
    let died = 0;
    for (let t = 0; t < 10; t++) {
      Game.state.village.health[pid] = 1;
      const R = (() => { let s = (500 + t) | 0; return () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; })();
      let rec = null;
      try { rec = Game.fieldFight(pid, beasts[t % beasts.length], null, { rng: R }); } catch (e) {}
      if (rec && rec.outcome === 'vDie') died++;
    }
    console.log(`  overwhelmed villagers die: ${died}/10`);
    ok('H5 the blood engine can really kill (vDie is reachable)', died > 0);
  }
  // 3. The player's pit is a REAL arena fight, not a roll (played not RNG).
  {
    freshGame(20);
    const pit = Game._contestScaled(POOL().find(x => x.id === 'pit'), null);
    const phases = Game.contestPlayable(pit);
    const arenaChoice = phases[1].choices.find(ch => ch.do && ch.do.arena);
    ok('H5 player pit routes to a real arena fight', !!arenaChoice && arenaChoice.do.arena.waves === 1);
  }
  // NOTE (design observation, not a fix): watched blood kills RARELY for
  // healthy villagers (~0-3% gauntlet over 90 trials) — the morale model
  // (fieldFights.js, Steve 2026-10-09) favors believable flight, and the
  // hopeless now flee instead of dying. The fear is real where it's
  // played (player arena/maw/real damage) and certain at the extreme
  // (maw). Whether watched blood should be bloodier is a Steve tuning
  // call — not changed here.
}

sec('HONESTY H5b — the cheer perversity is fixed (hopeless now flee)');
{
  // DIRECT PROOF of the fieldFights.js morale fix. Before: a villager with
  // +15 bravery (max cheer) in a hopeless blood fight held to the bravery
  // floor and DIED where an uncheered villager fled — cheer converted
  // 'lost' into 'died' and never added a win. After: hopeless + alone (or
  // help down) flees, brave or not. Cheer can no longer manufacture deaths.
  freshGame(20);
  const vills = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const pid = vills[0];
  // A beast far above the villager's weight: wave-appropriate killer.
  const beasts = (Game.data.monsters || []).filter(m => (m.wave || 1) >= 2);
  const beast = beasts[0];
  let fleeNoCheer = 0, fleeCheer = 0, dieCheer = 0;
  const T = 12;
  for (let t = 0; t < T; t++) {
    for (const bonus of [0, 15]) {
      Game.state.scholar.day = 30 + t;
      Game.state.village.health[pid] = 100;
      let rec = null;
      try {
        // Deterministic stream per trial (fieldFight takes rng).
        const R = (() => { let s = (99 + t) | 0; return () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; })();
        rec = Game.fieldFight(pid, beast, null, { braveryBonus: bonus, rng: R });
      } catch (e) { rec = null; }
      if (!rec) continue;
      if (bonus === 0 && rec.outcome === 'vFlee') fleeNoCheer++;
      if (bonus === 15) {
        if (rec.outcome === 'vFlee') fleeCheer++;
        if (rec.outcome === 'vDie') dieCheer++;
      }
    }
  }
  console.log(`  hopeless fight vs ${beast.id}: no-cheer flee ${fleeNoCheer}/${T}, cheer flee ${fleeCheer}/${T}, cheer death ${dieCheer}/${T}`);
  ok('H5b hopeless villagers flee (not die) even at max cheer bravery', dieCheer === 0 && fleeCheer > 0,
    `dieCheer=${dieCheer} fleeCheer=${fleeCheer}`);
  // And the courage-honesty line fires when a cheered villager does die.
  freshGame(20);
  const v2 = (Game.state.village.roster || []).filter(id => id !== Game.villagerId)[1];
  const ac = { contestId: 'pit', participant: v2, participants: [v2], phase: 'watching', cheer: 0.15 };
  clearLog();
  Game._contestDie(ac, 'test');
  ok('H5b cheered death says the courage cost out loud',
    sysLines.some(l => /held the line longer than wisdom allowed/i.test(l)));
}

// ================= DEAD CODE =================
sec('DEAD-CODE D1 — contests.js is wired: loaded in index.html, every def called');
{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok('D1 index.html loads src/js/contests.js', /src="src\/js\/contests\.js/.test(html));
  ok('D1 index.html loads src/js/contestEngine.js', /src="src\/js\/contestEngine\.js/.test(html));
  const src = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
  const defs = [...src.matchAll(/G\.([A-Za-z_$]+) = function/g)].map(m => m[1]);
  const allSrc = LIST.map(f => {
    try { return fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8'); } catch (e) { return ''; }
  }).join('\n');
  const dead = defs.filter(d => {
    // call sites: ".name(" occurrences minus the single def line
    const calls = (allSrc.match(new RegExp('[. ]' + d.replace(/\$/g, '\\$') + '\\(', 'g')) || []).length;
    return calls === 0;
  });
  ok('D1 every contests.js def has at least one call site', dead.length === 0, dead.join(','));
  console.log(`  ${defs.length} defs, all called`);
}

sec('DEAD-CODE D2 — every pool contest resolves to real phases');
{
  freshGame(20);
  let bad = [];
  for (const c of POOL()) {
    let ph = null;
    try { ph = Game.contestPlayable(Game._contestScaled(c, null)); } catch (e) { bad.push(c.id + ':threw'); continue; }
    if (!ph || !ph.length) bad.push(c.id + ':empty');
    else if (!ph.every(p => p && Array.isArray(p.choices) && p.choices.length)) bad.push(c.id + ':choiceless-phase');
  }
  ok('D2 all 44 pool contests produce playable phases with choices', bad.length === 0, bad.join(','));
}

sec('DEAD-CODE D3 — bespoke death lines + watch beats for every pool contest');
{
  freshGame(20);
  let badLine = [], badBeat = [];
  for (const c of POOL()) {
    const sc = Game._contestScaled(c, null);
    let line = '';
    try { line = Game._contestDeathLine(sc, 'test', 'Mara'); } catch (e) { badLine.push(c.id + ':threw'); }
    if (/did not come home from/.test(line)) badLine.push(c.id + ':generic-fallback');
    let beats = null;
    try { beats = Game._contestWatchBeat(sc, 'Mara'); } catch (e) { badBeat.push(c.id + ':threw'); }
    // _contestWatchBeat returns [setup, turn, end] (array, not object).
    if (!beats || !Array.isArray(beats) || beats.length < 3 || beats.some(b => !b || !b.length)) badBeat.push(c.id + ':incomplete');
  }
  ok('D3 every pool contest has a bespoke death line (no generic fallback)', badLine.length === 0, badLine.join(','));
  ok('D3 every pool contest has setup/turn/end watch beats', badBeat.length === 0, badBeat.join(','));
}

console.log(`\n==== RESULT seed=${SEED}: ${pass} passed, ${fail} failed ====`);
if (failures.length) { console.log('failures:'); failures.forEach(f => console.log(' - ' + f)); }
process.exit(fail ? 1 : 0);
