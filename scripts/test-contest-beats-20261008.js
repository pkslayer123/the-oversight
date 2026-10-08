#!/usr/bin/env node
// CONTEST BEAT AUDIO PROOF (Steve 2026-10-08) — the 30 older contests get
// bespoke per-phase beats: declare -> escalation -> climax -> resolution.
//
// Asserts, per contest:
//   GRAB   — every visited phase's declared beat actually fired an audioEvent,
//            and the Resolve beat fired when the sequence completed.
//   CHOICE — the 30%-choice branch fires the Declare beat, and the choice
//            phase text no longer repeats name+desc (intro dedupe).
//   REFUSE — Declare + Resolve fire; the sequence terminates as 'refused'.
//   WATCH  — all three watch beats fire; Resolve fires at the verdict.
// Static:
//   every CX_BEAT_DEFS entry is composed of registered Game.audio synth
//   names (no silent no-ops); every def name matches Game._cxB(id, kind).
//
// Harness: same full-module list as test-contest-play-20261008.js (minus
// DOM-only app.js/sprites.js/tile-scenes.js/move-anim.js and drama.js),
// window stub deleted before play, seeded RNG.
// Exit code non-zero on any assertion failure.
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
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
 'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'];
_SCRIPTS.forEach(f => eval(read(f)));
delete global.window;
const Game = globalThis.Scattering.Game;

// ---------- harness ----------
const note = t => console.log(t);
let passN = 0, failN = 0;
const ok = (name, cond, extra) => { if (cond) passN++; else { failN++; note(`   [FAIL] ${name}${extra ? ' — ' + extra : ''}`); } };
const trunc = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };
function drain() { const l = Game.log || []; const s = l.map(x => x.text || x).join(' '); l.length = 0; return s; }
const audioSeen = [];
Game.audio = new Proxy({}, { get: (t, name) => (d) => { audioSeen.push(String(name)); } });
Game.audioEvent = function (n) { audioSeen.push(String(n)); };

function freshRun() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  drain();
}
function setupContestDay(day) {
  const s = Game.state.scholar;
  s.day = day;
  Game.state.systemArrived = true;
  s.health = 500; s.maxHealth = 500; s.kcal = 2400; s.hydration = 100; s.hp = 100; s.trauma = 0;
  const def = (Game.data.items || []).find(i => i.id === 'fire_hardened_spear') || {};
  s.inventory = s.inventory || [];
  s.inventory.push({ itemId: 'fire_hardened_spear', units: 1, kcalEach: 0, kg: 0.5, name: def.name || 'Fire-hardened spear', bonded: true, bond: 0, bondOffered: [], enhancements: [] });
  s.equipped = s.equipped || {};
  s.equipped.weapon = { itemId: 'fire_hardened_spear', name: def.name || 'Fire-hardened spear' };
  const v = Game.state.village; v.positions = v.positions || {};
  const ids = (v.roster || []).filter(rid => rid !== Game.villagerId);
  [[2, 2], [6, 6], [3, 5]].forEach((spot, i) => {
    const rid = ids[i];
    if (rid) { try { Game.npcSetNode(rid, Game.map.px, Game.map.py); } catch (e) {} v.positions[rid] = { mx: spot[0], my: spot[1] }; }
  });
  drain();
  return ids;
}

// The 30 older contests (everything except the 14 newer beats contests).
const NEWER = ['sorting', 'witness', 'cache', 'longodds', 'price', 'impress', 'exchange', 'auction', 'lockpick', 'wrongmap', 'alibi', 'echo', 'tidepool', 'windfall'];
let CONTESTS = [];
async function loadContests() {
  await freshRun(); setupContestDay(15); // data loads here
  CONTESTS = Game.contestPool().map(c => c.id).filter(id => !NEWER.includes(id));
  ok('exactly 30 older contests in scope', CONTESTS.length === 30, 'got ' + CONTESTS.length);
}

// ---------- static: every beat def resolves to registered synths ----------
(function staticChecks() {
  const appSrc = read('src/js/app.js');
  const keys = new Set();
  const lines = appSrc.split('\n');
  for (let i = 10154; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(\w+)\((?:\w+|)\)\s*\{/);
    if (m) keys.add(m[1]);
  }
  const cxSrc = read('src/js/contests.js');
  const defsBody = cxSrc.match(/const CX_BEAT_DEFS = \{([\s\S]*?)\n  \};/)[1];
  const defNames = [...defsBody.matchAll(/^\s*(\w+): \[/gm)].map(m => m[1]);
  let nDefs = 0;
  for (const n of defNames) {
    const m = defsBody.match(new RegExp('^' + '\\s*' + n + ': ' + '\\[(.*?)\\],$', 'm'));
    const parts = [...m[1].matchAll(/'(\w+)'/g)].map(x => x[1]);
    nDefs++;
    for (const p of parts) ok(`beat ${n}: synth '${p}' is registered in Game.audio`, keys.has(p));
  }
  // naming contract: every def must equal Game._cxB(id, kind)
  for (const cid of CONTESTS.concat(['generic'])) {
    for (const kind of ['Declare', 'Escalate', 'Climax', 'Resolve']) {
      const expected = Game._cxB(cid, kind);
      ok(`def exists: ${expected}`, defNames.includes(expected));
    }
  }
  note(`   static: ${nDefs} beat defs checked`);
})();

// ---------- driver ----------
function playToEnd(expectResolve) {
  // returns { done, outcome, visitedBeats: [] }
  const visitedBeats = [];
  let guard = 0, done = false, outcome = null;
  while (Game.state.activeContest && Game.state.activeContest.phase !== 'done' && guard++ < 30) {
    const ac = Game.state.activeContest;
    const idx = ac.phaseIdx || 0;
    const phase = ac.phases[idx];
    if (!phase || !phase.choices || !phase.choices.length) return { done: false, outcome: 'STUCK', visitedBeats };
    if (phase.beat) visitedBeats.push(phase.beat);
    const ci = Math.floor((phase.choices.length - 1) / 2); // middle — never the refuse label on choicePhase
    const res = Game.contestChoose(ci);
    if (res && res.done) { done = true; outcome = res.outcome; break; }
    // ARENA (Steve 2026-10-08): Blood pit/gauntlet/siege suspend the modal
    // for a real tactical fight. Simulate the fight(s) ending (won) — the
    // beats test verifies audio, not combat. Multi-wave arenas chain.
    if (res && res.arena) {
      let after = null;
      let wguard = 0;
      while (Game.state.arenaContest && wguard++ < 5) {
        const arc = Game.state.arenaContest;
        Game.state.arenaContest = null;
        Game.tbfight = null;
        after = Game._contestArenaAfter(arc, 'won');
        if (after && after.done) break;
      }
      if (after && after.done) { done = true; outcome = after.outcome; break; }
      continue;
    }
    if (res === null) return { done: false, outcome: 'NULL', visitedBeats };
  }
  return { done, outcome, visitedBeats };
}

function cloneWithChoice(base, givesChoice) {
  const c = Object.assign({}, base);
  c.givesChoice = givesChoice;
  return c;
}

function actGrab(contestId) {
  freshRun(); setupContestDay(15);
  const base = Game.contestPool().find(c => c.id === contestId);
  audioSeen.length = 0;
  Game.contestInterruption(cloneWithChoice(base, false), ['player']);
  ok(contestId + ' grab: interruption starts', !!Game.state.activeContest);
  ok(contestId + ' grab: contestTaken fires', audioSeen.includes('contestTaken'));
  const r = playToEnd(true);
  ok(contestId + ' grab: sequence terminates', r.done, 'outcome=' + r.outcome);
  for (const b of [...new Set(r.visitedBeats)]) {
    ok(contestId + ` grab: phase beat fired (${b})`, audioSeen.includes(b));
  }
  if (r.done && r.outcome !== 'refused') {
    const resolve = Game._cxB(contestId, 'Resolve');
    ok(contestId + ` grab: Resolve beat fired (${resolve})`, audioSeen.includes(resolve));
  }
  ok(contestId + ' grab: Declare beat fired', audioSeen.includes(Game._cxB(contestId, 'Declare')));
}

function actChoice(contestId) {
  freshRun(); setupContestDay(15);
  const base = Game.contestPool().find(c => c.id === contestId);
  audioSeen.length = 0;
  Game.contestInterruption(cloneWithChoice(base, true), ['player']);
  const ac = Game.state.activeContest;
  ok(contestId + ' choice: choice branch taken', !!(ac && ac.phase === 'choice'));
  const declare = Game._cxB(contestId, 'Declare');
  // Choice preface fires the small shared contestChoice beat, never the
  // contest's Declare beat (double-sting on Participate / sting-on-Refuse
  // was the fixed bug, 2026-10-08).
  ok(contestId + ` choice: choice-phase fires shared contestChoice beat`, audioSeen.includes('contestChoice'));
  ok(contestId + ` choice: choice-phase does NOT fire Declare beat (${declare})`, !audioSeen.includes(declare));
  // dedupe: the choice phase must not re-say the contest desc
  const cpText = String((ac.phases[0] || {}).text || '');
  ok(contestId + ' choice: no desc repeat in choice phase', !cpText.includes(String(base.desc).slice(0, 60)), trunc(cpText, 120));
  Game.contestChoose(0); // Participate
  const r = playToEnd(true);
  ok(contestId + ' choice: sequence terminates after participating', r.done, 'outcome=' + r.outcome);
  for (const b of [...new Set(r.visitedBeats)]) {
    ok(contestId + ` choice: phase beat fired (${b})`, audioSeen.includes(b));
  }
  if (r.done) ok(contestId + ' choice: Resolve beat fired', audioSeen.includes(Game._cxB(contestId, 'Resolve')));
}

function actRefuse(contestId) {
  freshRun(); setupContestDay(15);
  const base = Game.contestPool().find(c => c.id === contestId);
  audioSeen.length = 0;
  Game.contestInterruption(cloneWithChoice(base, true), ['player']);
  const ac = Game.state.activeContest;
  ok(contestId + ' refuse: choice branch taken', !!(ac && ac.phase === 'choice'));
  const res = Game.contestChoose(1); // Refuse
  ok(contestId + ' refuse: refusal is a sequence (done)', !!(res && res.done));
  // Refuse must NOT play the contest's bespoke Declare sting — the contest
  // never happened (fixed 2026-10-08; the choice screen fired contestChoice).
  ok(contestId + ' refuse: Declare beat NOT fired', !audioSeen.includes(Game._cxB(contestId, 'Declare')));
  ok(contestId + ' refuse: choice beat fired (not the sting)', audioSeen.includes('contestChoice'));
  ok(contestId + ' refuse: Resolve beat fired', audioSeen.includes(Game._cxB(contestId, 'Resolve')));
}

function actWatch(contestId) {
  freshRun(); const vids = setupContestDay(15);
  const vid = vids[0];
  const base = Game.contestPool().find(c => c.id === contestId);
  audioSeen.length = 0;
  Game.contestInterruption(cloneWithChoice(base, false), [vid]);
  const ac = Game.state.activeContest;
  ok(contestId + ' watch: show starts', !!ac);
  const r = playToEnd(true);
  ok(contestId + ' watch: the show terminates', r.done, 'outcome=' + r.outcome);
  for (const b of [...new Set(r.visitedBeats)]) {
    ok(contestId + ` watch: beat fired (${b})`, audioSeen.includes(b));
  }
  if (r.done) ok(contestId + ' watch: Resolve beat fired', audioSeen.includes(Game._cxB(contestId, 'Resolve')));
}

async function main() {
  await Game.init();
  await loadContests();
  for (const cid of CONTESTS) {
    note('\n==== beats — ' + cid + ' ====');
    actGrab(cid);
    actChoice(cid);
    actRefuse(cid);
    actWatch(cid);
  }
  note(`\n${passN} passed, ${failN} failed (seed ${SEED})`);
  process.exit(failN ? 1 : 0);
}
main();
