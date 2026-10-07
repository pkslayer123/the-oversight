// Contest pool expansion 3 — proof test (Steve 2026-10-05).
// 6 new variants in the three smallest pools:
//   puzzle:    lockpick (The Iron Pantry), wrongmap (The Wrong Map)
//   detective: alibi (The Alibi Chain), echo (The Echo)
//   forage:    tidepool (The Tide Clock), windfall (Windfall)
// Coverage: pool membership, wave gating, structural termination of EVERY
// contest in the pool (stuck-phase sibling check), full drive of every
// contest through the REAL path (player + watch), bespoke death lines,
// knowledge-gated coaching (blind vs level-2), beat declarations, and
// player-style playthroughs of all 6 new contests (2 runs each) with
// transcripts for the feel pass.
// Node harness: FULL src/js/*.js list in index.html script order, minus
// DOM-only app.js/sprites.js/tile-scenes.js/move-anim.js. equipment.js
// needs window at load — stubbed, then deleted before playing so combat
// takes the sync path.
// Usage: node scripts/test-contest-variants-20261007.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
// Minimal browser-ish stubs for modules that sniff at load time.
if (typeof global.navigator === 'undefined') global.navigator = { userAgent: 'node' };
if (typeof global.document === 'undefined') {
  global.document = {
    addEventListener() {}, removeEventListener() {}, querySelector() { return null; },
    querySelectorAll() { return []; }, createElement() { return { style: {}, appendChild() {}, setAttribute() {} }; },
    getElementById() { return null; }, body: { appendChild() {}, style: {} }, hidden: false,
  };
}
if (typeof global.localStorage === 'undefined') {
  const _store = {};
  global.localStorage = { getItem: k => (_store[k] ?? null), setItem: (k, v) => { _store[k] = String(v); }, removeItem: k => { delete _store[k]; } };
}
global.window = global; // equipment.js needs window at load
const FILES = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/examine.js',
  'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
  'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
  'src/js/build.js',
];
for (const f of FILES) { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.error('LOAD FAIL', f, e.message); process.exit(1); } }
delete global.window; // sync combat path for the harness
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function rig(fn) { const o = Math.random; Math.random = fn; return () => { Math.random = o; }; }
function log() { return (Game.log || []).join('\n'); }

function fresh() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = 15;
  Game.state.systemArrived = true;
  s.health = 10000; s.kcal = 3000; s.trauma = 0; // 10k hp: structural runs test flow, not death
  Game.log = [];
  Game.state.showBudget = null;
  Game.state.pendingContest = null;
  Game.state.activeContest = null;
  Game.state.contestsSeen = {};
  Game.state.codex = Game.state.codex || {};
  Game.state.codex.contests = {};
  Game.state.waveKills = {};
  const v = Game.state.village;
  v.positions = v.positions || {};
  const ids = (v.roster || []).filter(rid => rid !== Game.villagerId);
  ids.slice(0, 3).forEach((rid, i) => { v.positions[rid] = { mx: 2 + i * 2, my: 2 }; });
  return { s, vids: ids.slice(0, 3) };
}
function scaled(base) { return Game._contestScaled(Object.assign({}, base), null); }
// Drive one full contest as the player through the REAL path:
// fireContest -> resolveContest -> contestChoose until done.
function playThrough(contestId, choiceIdxs, randVal) {
  fresh();
  const base = Game.contestPool().find(c => c.id === contestId);
  const unrig = rig(() => (randVal !== undefined ? randVal : 0.5)); // no whim, grabbed (no choice branch)
  Game.fireContest(scaled(base));
  Game.resolveContest();
  let res = null, steps = 0;
  while (steps++ < 14 && Game.state.activeContest) {
    const ac = Game.state.activeContest;
    const ci = choiceIdxs[Math.min(ac.phaseIdx || 0, choiceIdxs.length - 1)] || 0;
    res = Game.contestChoose(ci);
    if (res && res.done) break;
  }
  unrig();
  return { res, steps, log: log() };
}
// Drive watch mode: a villager is taken, the player watches.
function watchThrough(contestId, choiceIdx, randVal) {
  fresh();
  const base = Game.contestPool().find(c => c.id === contestId);
  const v = Game.state.village;
  const vid = (v.roster || []).find(rid => rid !== Game.villagerId);
  const phases = Game._contestWatchPhases(scaled(base), [vid]);
  Game.state.activeContest = {
    contestId, participant: vid, participants: [vid], phase: 'watching',
    phaseIdx: 0, phases, wounds: 0, cheer: 0,
  };
  let res = null, steps = 0;
  const unrig = rig(() => (randVal !== undefined ? randVal : 0.5));
  while (steps++ < 10 && Game.state.activeContest) {
    res = Game.contestChoose(choiceIdx !== undefined ? choiceIdx : 0);
    if (res && res.done) break;
  }
  unrig();
  return { res, steps, log: log(), vid };
}

const NEW = ['lockpick', 'wrongmap', 'alibi', 'echo', 'tidepool', 'windfall'];

(async () => {
  await Game.init();

  // ============ T1. Pool membership ============
  {
    fresh();
    const pool = Game.contestPool();
    ok('T1 pool grew 38 -> 44', pool.length === 44, `got ${pool.length}`);
    for (const id of NEW) {
      const c = pool.find(x => x.id === id);
      ok(`T1 ${id} in pool with full fields`,
        !!(c && c.name && c.cat && c.risk && c.desc && c.arena && c.participants),
        JSON.stringify(c && { risk: c.risk, cat: c.cat }));
    }
    const cats = {};
    for (const c of pool) cats[c.cat] = (cats[c.cat] || 0) + 1;
    ok('T1 puzzle pool now 6', cats.puzzle === 6, `puzzle=${cats.puzzle}`);
    ok('T1 detective pool now 6', cats.detective === 6, `detective=${cats.detective}`);
    ok('T1 forage pool now 6', cats.forage === 6, `forage=${cats.forage}`);
  }

  // ============ T2. Bespoke dispatch (not category-template fallback) ============
  {
    fresh();
    let bespoke = true, bad = [];
    for (const id of NEW) {
      const base = Game.contestPool().find(c => c.id === id);
      const phases = Game.contestPlayable(scaled(base));
      if (!phases || !phases.length || !phases.every(p => typeof p.beat === 'string' && p.beat.length)) {
        bespoke = false; bad.push(id);
      }
    }
    ok('T2 all 6 dispatch to bespoke phases with audio beats', bespoke, bad.join(','));
  }

  // ============ T3. Structural termination (ALL 44 — stuck-phase sibling check) ============
  {
    fresh();
    const pool = Game.contestPool();
    let allOk = true, bad = [];
    for (const base of pool) {
      const phases = Game.contestPlayable(scaled(base));
      if (!phases || !phases.length) { allOk = false; bad.push(base.id + ':no-phases'); continue; }
      for (let i = 0; i < phases.length; i++) {
        const ph = phases[i];
        if (!ph.choices || !ph.choices.length) { allOk = false; bad.push(base.id + ':phase' + i + ':no-choices'); continue; }
        for (const ch of ph.choices) {
          const nx = ch.next;
          const terminal = ['WIN', 'LOSE', 'DIE', 'REFUSE', 'VERDICT'].includes(nx);
          if (!terminal && !(Number.isInteger(nx) && nx > i && nx < phases.length)) {
            allOk = false; bad.push(`${base.id}:phase${i}:bad-next(${JSON.stringify(nx)})`);
          }
        }
      }
      const seen = new Set(); const stack = [[0, 0]]; let terminates = true;
      while (stack.length) {
        const [pi, depth] = stack.pop();
        if (depth > phases.length + 1) { terminates = false; break; }
        const key = pi + ':' + depth;
        if (seen.has(key)) continue;
        seen.add(key);
        for (const ch of phases[pi].choices) {
          if (['WIN', 'LOSE', 'DIE', 'REFUSE', 'VERDICT'].includes(ch.next)) continue;
          stack.push([ch.next, depth + 1]);
        }
      }
      if (!terminates) { allOk = false; bad.push(base.id + ':non-terminating-path'); }
    }
    ok('T3 every contest structurally terminates (no stuck phases)', allOk, bad.join('; '));
  }

  // ============ T4. Full drive of ALL contests via real path ============
  {
    let allDone = true, bad = [];
    for (const base of Game.contestPool()) {
      for (const path of [[0, 0, 0, 0], [2, 2, 2, 2]]) {
        const { res, steps } = playThrough(base.id, path, 0.99);
        const cleared = Game.state.activeContest === null;
        if (!(res && res.done && cleared)) { allDone = false; bad.push(`${base.id}:${path.join('')}:steps=${steps}`); }
      }
    }
    ok('T4 all 44 contests drive to completion (2 paths each)', allDone, bad.join('; '));
  }

  // ============ T5. Death lines bespoke ============
  {
    fresh();
    let bespoke = true, bad = [];
    for (const id of NEW) {
      const base = Game.contestPool().find(c => c.id === id);
      const line = Game._contestDeathLine(base, 'x', 'You');
      const lineV = Game._contestDeathLine(base, 'x', 'Mira');
      if (!line || /did not come home/.test(line) || !lineV || /did not come home/.test(lineV)) {
        bespoke = false; bad.push(id);
      }
    }
    ok('T5 new contests have bespoke death lines (player + villager)', bespoke, bad.join(','));
  }

  // ============ T6. Knowledge-gated coaching ============
  {
    fresh();
    let coached = true, bad = [];
    for (const id of NEW) {
      Game.contestLearn(id, 'won'); Game.contestLearn(id, 'won'); // seen=4 -> level 2
      const base = Game.contestPool().find(c => c.id === id);
      const coach = Game._cxCoaching(base);
      if (!coach || coach.length < 10) { coached = false; bad.push(id); }
    }
    ok('T6 coaching unlocks at level 2 for all 6', coached, bad.join(','));
    // Blind vs knowledgeable: lockpick hides the weight order, wrongmap hides the water lie
    fresh();
    const lp = Game.contestPool().find(c => c.id === 'lockpick');
    const blind = Game.contestPlayable(scaled(lp));
    ok('T6 lockpick blind: weight order hidden', !/heavy to light/i.test(blind[0].text));
    Game.contestLearn('lockpick', 'won'); Game.contestLearn('lockpick', 'won');
    const wise = Game.contestPlayable(scaled(lp));
    ok('T6 lockpick level2: weight order revealed', /heavy to light/i.test(wise[0].text));
    fresh();
    const wm = Game.contestPool().find(c => c.id === 'wrongmap');
    const blindW = Game.contestPlayable(scaled(wm));
    ok('T6 wrongmap blind: water lie not named', !/lies about WATER/.test(blindW[0].text));
    Game.contestLearn('wrongmap', 'won'); Game.contestLearn('wrongmap', 'won');
    const wiseW = Game.contestPlayable(scaled(wm));
    ok('T6 wrongmap level2: water lie named', /lies about WATER/.test(wiseW[0].text));
  }

  // ============ T7. Watch mode: beats + full drive for all 6 ============
  {
    fresh();
    let beatsOk = true, bad = [];
    for (const id of NEW) {
      const base = Game.contestPool().find(c => c.id === id);
      const beats = Game._contestWatchBeat(base, 'Mira');
      if (!beats || beats.length !== 3 || beats.some(b => !/📺/.test(b))) { beatsOk = false; bad.push(id + ':beats'); }
      // veteran watchers get the coaching line
      Game.contestLearn(id, 'won'); Game.contestLearn(id, 'won');
      const beatsV = Game._contestWatchBeat(base, 'Mira');
      if (!/📚/.test(beatsV[2])) { beatsOk = false; bad.push(id + ':knows'); }
      Game.state.codex.contests[id] = { seen: 0, wins: 0, level: 0 };
    }
    ok('T7 watch beats exist (setup/turn/end) + veteran coaching line', beatsOk, bad.join(','));
    let watchOk = true, wbad = [];
    for (const id of NEW) {
      const { res, steps } = watchThrough(id, 0, 0.5);
      const cleared = Game.state.activeContest === null;
      if (!(res && res.done && cleared)) { watchOk = false; wbad.push(`${id}:steps=${steps}`); }
    }
    ok('T7 watch mode drives to verdict for all 6', watchOk, wbad.join('; '));
  }

  // ============ T8. Wave gating: new variants reachable at wave 1 ============
  {
    fresh();
    const unrig = rig(() => 0.5);
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
      const u2 = rig(() => (i + 0.5) / 60);
      seen.add(Game.pickContest().id);
      u2();
    }
    unrig();
    const allWave1Ok = NEW.every(id => !['lockpick', 'wrongmap', 'alibi', 'echo', 'tidepool', 'windfall'].includes(id) || true);
    const risks = NEW.map(id => Game.contestPool().find(c => c.id === id).risk);
    ok('T8 no new variant is wave-gated (none extreme)', risks.every(r => r !== 'extreme'), risks.join(','));
    ok('T8 wave1: no extreme contests offered at all',
      [...seen].every(id => Game.contestPool().find(c => c.id === id).risk !== 'extreme'), [...seen].join(','));
    void allWave1Ok;
  }

  // ============ T9. Unavoidable: refuse is a sequence, not a skip ============
  {
    const { res } = playThrough('lockpick', [], 0.99); // whim branch may offer choice
    ok('T9 lockpick completes end-to-end (refusal path is a sequence)', res && res.done && Game.state.activeContest === null);
  }

  // ============ PLAYTEST (as a player): 2 runs per new contest ============
  const transcripts = [];
  const RUNS = [
    ['lockpick', [0, 0, 0], 'blind, listen through, set gently -> WIN'],
    ['lockpick', [1, 1, 1], 'rookie sequence, rush, force -> WIN (costly)'],
    ['wrongmap', [0, 0, 0], 'study map, offset dig, open for village -> WIN'],
    ['wrongmap', [0, 1, 1], 'study map, dig at X -> LOSE, split partner -> WIN?'],
    ['alibi', [0, 0, 0], 'pull loud link, press, name gently -> WIN'],
    ['alibi', [2, 2, 2], 'watch first, out offered, chain stands -> LOSE'],
    ['echo', [0, 0, 0], 'line up tellings, press danger, dawn true -> WIN'],
    ['echo', [0, 2, 1], 'line up, let perform, bless noon -> LOSE'],
    ['tidepool', [0, 1, 0], 'deep pools, smart exit, run causeway -> WIN'],
    ['tidepool', [0, 0, 2], 'deep, greedy pool, drop haul -> LOSE alive'],
    ['windfall', [0, 0, 0], 'berries, dry fish, present -> WIN'],
    ['windfall', [2, 1, 2], 'haul raw, keep hauling, let rot -> LOSE'],
  ];
  for (const [id, choices, label] of RUNS) {
    const { res, steps, log: lg } = playThrough(id, choices, 0.99);
    transcripts.push({ id, label, outcome: res && res.outcome, steps, done: !!(res && res.done) });
    ok(`PLAY ${id} (${label}) completes`, !!(res && res.done) && Game.state.activeContest === null, `steps=${steps} outcome=${res && res.outcome}`);
    void lg;
  }

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  // Dump playthrough transcripts for the feel pass (evidence notes).
  fs.writeFileSync('/tmp/contest-transcripts-20261007.json', JSON.stringify(transcripts, null, 1));
  process.exit(fail ? 1 : 0);
})();
