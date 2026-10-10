#!/usr/bin/env node
// BREAK-IT contest engine #3 — SOFTLOCK SWEEP + DEAD CODE + HONESTY HELD.
//
// A. Every one of the 44 pool contests resolves for a single villager AND
//    for a group (duel with 2): no throw, no hang, outcome in
//    {won, lost, died}.
// B. duelFight terminates under adversarial stats (round cap 15).
// C. Dead arms are gone: _cxBlood's 'price' arm (price is moot-cat per
//    data), _cxEndurance's 'fetch' arm (fetch is weird-cat per data).
// D. HELD: the watcher's cheer input is genuinely capped at 0.15 in the
//    verdict path (cheerBonus seen by the engine is <= 15 from cheer).
// E. contestBeastFor: pool member, closest-HP match, deterministic.
// F. Ontology: contestResolveGroup reachable on Game; duelFight takes opts.
//
// Harness: full-module list (minus DOM-only), seeded RNG BEFORE eval
// (SEED env override). Exit non-zero on failure.
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(read(f))) });
global.window = global;
const _SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/contestEngine.js',
 'src/js/alienPlayers.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js',
 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js',
 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/fieldFights.js',
 'src/js/debug-scenarios.js', 'src/js/build.js'];
_SCRIPTS.forEach(f => eval(read(f)));
delete global.window;
const Game = globalThis.Scattering.Game;

(async () => {
await Game.init();
const note = t => console.log(t);
let passN = 0, failN = 0;
const ok = (name, cond, extra) => { if (cond) passN++; else { failN++; note(`   [FAIL] ${name}${extra ? ' — ' + extra : ''}`); } };
function drain() { const l = Game.log || []; const s = l.map(x => x.text || x).join(' '); l.length = 0; return s; }
Game.audio = new Proxy({}, { get: (t, name) => (d) => {} });
Game.audioEvent = function (n) {};

Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
Game.genRoster('Columbus, Ohio');
Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
Game.depart();
Game.state.systemArrived = true;
Game.state.scholar.day = 20;
drain();

const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
const vids = roster.slice(0, 4);
Game.state.village.health = Game.state.village.health || {};
const resetHp = () => { for (const v of vids) Game.state.village.health[v] = 100; };
const OUTCOMES = ['won', 'lost', 'died'];

// ---- A. all 44 contests: single + group resolve, no throw, no hang.
note('A. softlock sweep — all 44 contests resolve (single + group)');
(function () {
  const pool = Game.contestPool();
  ok('pool has 44 contests', pool.length === 44, `got ${pool.length}`);
  let bad = [];
  for (const c of pool) {
    resetHp();
    const t0 = Date.now();
    let r = null, g = null, err = null;
    try { r = Game.contestResolveVillager(vids[0], c, {}); } catch (e) { err = 'single:' + e.message; }
    try { g = Game.contestResolveGroup(vids.slice(0, 2), c, {}); } catch (e) { err = (err ? err + '; ' : '') + 'group:' + e.message; }
    const dt = Date.now() - t0;
    if (err) bad.push(`${c.id} threw (${err})`);
    else if (!r || !OUTCOMES.includes(r.outcome)) bad.push(`${c.id} single bad outcome (${r && r.outcome})`);
    else {
      for (const v of vids.slice(0, 2)) {
        if (!g[v] || !OUTCOMES.includes(g[v].outcome)) bad.push(`${c.id} group bad outcome for ${v}`);
      }
    }
    if (dt > 2000) bad.push(`${c.id} slow (${dt}ms)`);
  }
  ok('all 44 resolve cleanly (single + group)', bad.length === 0, bad.slice(0, 5).join(' | '));
  resetHp();
})();

// ---- B. duelFight terminates under adversarial stats.
note('B. duelFight terminates (adversarial stats)');
(function () {
  resetHp();
  Game.state.village.health[vids[0]] = 1;   // near-dead duelist
  Game.state.village.health[vids[1]] = 100;
  const t0 = Date.now();
  const d = Game.duelFight(vids[0], vids[1]);
  ok('1hp duel terminates', !!d.outcome && d.rounds <= 15, `${d.outcome}/${d.rounds}r`);
  ok('1hp duel fast', Date.now() - t0 < 2000);
  resetHp();
})();

// ---- C. dead arms removed from source.
note('C. dead code — unreachable fiction arms removed');
(function () {
  const src = read('src/js/contestEngine.js');
  ok("no 'price' arm left in _cxBlood", !/id === 'price'/.test(src));
  ok("no 'fetch' arm left in _cxEndurance", !/id === 'fetch'/.test(src));
})();

// ---- D. HELD: cheer input capped at 0.15 in the verdict path.
note('D. cheer cap held — engine never sees more than 0.15 of cheer');
(function () {
  const origGroup = Game.contestResolveGroup;
  const origAp = Game.apContestInterference;
  let seenBonus = null, seenLift = null;
  Game.contestResolveGroup = function (pids, contest, opts) {
    seenBonus = opts.cheerBonus; seenLift = opts.cheerLift;
    return origGroup.call(Game, pids, contest, opts);
  };
  Game.apContestInterference = function () { return { winMod: 0, deathSave: false, note: null }; };
  resetHp();
  const pit = Game.contestPool().find(c => c.id === 'pit');
  const ac = { contestId: 'pit', participants: [vids[0]], participant: vids[0], cheer: 0.9 };
  try { Game._contestVerdict(ac); } catch (e) { /* verdict is heavy; we only need the captured opts */ }
  Game.contestResolveGroup = origGroup;
  Game.apContestInterference = origAp;
  ok('cheer 0.9 capped to bonus 15 (0.15*100)', seenBonus === 15, `seenBonus=${seenBonus}`);
  ok('cheer 0.9 capped to lift 3 (0.15*20)', seenLift === 3, `seenLift=${seenLift}`);
  drain();
})();

// ---- E. contestBeastFor honesty.
note('E. contestBeastFor — pool member, closest-THREAT, deterministic (Gap 4: HP-matching -> threat-matching)');
(function () {
  const pool = Game.monsterWavePool();
  const b1 = Game.contestBeastFor(1, 600);
  const b2 = Game.contestBeastFor(1, 600);
  ok('returns a pool member', !!b1 && pool.includes(b1), b1 && b1.id);
  const threat = (m) => {
    const hp = m.hp || [20, 20], atk = m.attack || {}, dmg = atk.damage || [6, 10];
    return Math.max(1, m.pack || 1) * ((dmg[0] + dmg[1]) / 2) * ((hp[0] + hp[1]) / 2);
  };
  let best = null, bestD = Infinity;
  for (const m of pool) {
    const d = Math.abs(Math.log(threat(m) / 600));
    if (d < bestD) { bestD = d; best = m; }
  }
  ok('picks the closest-threat beast', b1 === best, `${b1 && b1.id} vs ${best && best.id}`);
  ok('deterministic', b1 === b2);
})();

// ---- F. ontology reachability.
note('F. ontology — all provides reachable');
(function () {
  ok('contestResolveVillager on Game', typeof Game.contestResolveVillager === 'function');
  ok('contestResolveGroup on Game', typeof Game.contestResolveGroup === 'function');
  ok('duelFight on Game', typeof Game.duelFight === 'function');
  ok('contestBeastFor on Game', typeof Game.contestBeastFor === 'function');
  ok('duelFight accepts opts (arity 3)', Game.duelFight.length === 3, `length=${Game.duelFight.length}`);
})();

note(`\n${passN} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
})();
