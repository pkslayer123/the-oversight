#!/usr/bin/env node
// Dialog coherence pass — proof script (Worker D, 2026-10-11).
// Generator contextual-appropriateness: each line generator gated on the
// context it claims. Seeded PRNG (mulberry32) installed BEFORE module eval
// (several modules capture Math.random at load). Full production script
// list in index.html order (minus DOM-only app.js/sprites.js/tile-scenes.js/
// move-anim.js and drama.js, per the node-harness lesson).
//
// Classes covered (wrong context => CANNOT fire; right context => CAN):
//   A. GOAL 'answers' ("make the System explain itself") — every line names
//      the System. Pre-arrival (day < 7) nobody knows that word: canon
//      violation. Fixed via goalDef.preSystemLines + convoGoalLines().
//   B. Bespoke questions with time references — q_first_week ("the first
//      week?") on day 3, q_night ("did you sleep?") on day 1. Fixed via
//      minDay on the defs + convoQuestionOk() at both selection sites.
//   C. Six newer goals (home/record/answers/legacy/joy/peace) had NO
//      goalFollow entries and NO askAbout goal lines: "tell me more"
//      instantly exhausted the thread, and "what do you want?" answered
//      "I don't know. Getting through today, I guess." — contradicting the
//      goal the villager just shared. Fixed with real follow-ups + lines.
//   D. ambientSocial "tonight" lines fired at ANY day part ("The fire is
//      quiet tonight" at noon). Fixed with a day-part-aware time word.
//
// Audited and clean (no fix needed): village grief (event-set, decays per
// day-part), taughtref openers (reference real taught plants), talkReason
// templates (all conditional on real state), npcGossipAbout (teller-
// knowledge gated), teach/show (already topical per Rule 2 fix).
//
// Usage: node scripts/test-dialog-coherence-20261011.js [SEED=...]

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261011', 10);

// Seeded PRNG — BEFORE eval.
let _s = SEED >>> 0;
Math.random = function () {
  _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')))
});
global.window = global; // stub for eval phase only
const files = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/convo-scene.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js',
  'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js',
  'src/js/contests.js', 'src/js/broadcast.js', 'src/js/contestEngine.js',
  'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/corruption.js',
  'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/waveLedger.js',
  'src/js/feastBuff.js', 'src/js/ledger.js', 'src/js/abilityActions.js',
  'src/js/monsterBehaviors.js', 'src/js/partyTactics.js',
  'src/js/sigW3a.js', 'src/js/statusEffects.js', 'src/js/sigW3b.js',
  'src/js/metaProgression.js', 'src/js/sigW3c.js',
  'src/js/villager-agency.js', 'src/js/fieldFights.js',
  'src/js/villager-objectives.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/havenGrowth.js', 'src/js/hierarchy.js',
  'src/js/comms.js', 'src/js/safetynets.js', 'src/js/villageAgency.js',
  'src/js/debug-scenarios.js', 'src/js/build.js',
];
for (const f of files) { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
delete global.window; // sync headless path from here on
const Game = globalThis.Scattering.Game;

// EMISSION STUB (Worker D 2026-10-11): emission plumbing is Worker A's area
// and mid-flight — their say() wrapper routes through this.emit(), which has
// no implementation in the node harness (HARNESS ERROR: this.emit is not a
// function). Coherence assertions exercise the line GENERATORS, not the
// plumbing, so stub the surface when it's missing. If A's real emit lands,
// this never fires.
if (typeof Game.emit !== 'function') {
  Game.emit = function (msg) {
    try { (this.log = this.log || []).push(String(msg)); } catch (e) {}
    return msg;
  };
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name}` + (extra ? ` — ${extra}` : '')); }
}
const show = (x, n) => String(x == null ? '' : x).slice(0, n || 110);

// Set a villager's goal deterministically (both lookup paths npcGoal uses).
function setGoal(vid, goal) {
  const vv = (Game.data.villagers || []).find(x => x.id === vid);
  if (vv) vv.goal = goal;
  Game.state.village.bgGoals = Game.state.village.bgGoals || {};
  Game.state.village.bgGoals[vid] = goal;
}
// Force convoOpening onto the goal branch: skip proto/secret/want/taught/
// recall hooks and the grief/cheer weather; max trust clears the share gate.
function forceGoalOpener(vid, goal) {
  setGoal(vid, goal);
  Game.state.village.trust = Game.state.village.trust || {};
  Game.state.village.trust[vid] = 100;
  Game.state.village.grief = 0;
  Game.state.village.cheer = 0;
  const c = Game.convoGet(vid);
  c.secretShared = true; c.wantHooked = true; c.taughtMentioned = true;
  c.answered = { q_origin: 'x', q_trust: 'x' };
  c.recalled = { q_origin: true, q_trust: true };
  c.said = {};
  return Game.convoOpening(vid);
}

async function main() {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const npcs = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  console.log(`=== Dialog Coherence Proof (seed ${SEED}) === NPCs: ${npcs.length}`);
  console.log(`day=${Game.state.scholar.day} systemArrived=${!!Game.state.systemArrived}`);

  // ---------------- CLASS A: 'answers' goal, pre- vs post-System ----------------
  console.log('\n-- A. answers-goal era gate --');
  {
    const vid = npcs[0];
    const goalDef = (Game.data.characterGen.goals || []).find(g => g.id === 'answers');
    ok('answers goalDef exists with preSystemLines', !!(goalDef && goalDef.preSystemLines && goalDef.preSystemLines.length >= 4),
      show(goalDef && goalDef.preSystemLines && goalDef.preSystemLines.length));
    // WRONG CONTEXT: day 3, pre-System — the System must not be named.
    Game.state.scholar.day = 3;
    Game.state.systemArrived = false;
    const pre = Game.convoGoalLines('answers', goalDef);
    ok('pre-System: no line names the System (unit)', pre.length > 0 && !pre.some(l => /system/i.test(l)),
      show(pre.find(l => /system/i.test(l))));
    const o = forceGoalOpener(vid, 'answers');
    ok('pre-System: opener takes the goal thread', o && o.thread === 'goal', show(o && o.thread));
    ok('pre-System: opened goal line never names the System (integration)',
      !!(o && o.line) && !/system/i.test(o.line), show(o && o.line));
    // RIGHT CONTEXT: post-arrival — System lines are back on the table.
    Game.state.systemArrived = true;
    const post = Game.convoGoalLines('answers', goalDef);
    ok('post-System: System lines available again (unit)',
      post.some(l => /the system/i.test(l)), show(post[0]));
    const c2 = Game.convoGet(npcs[1]);
    c2.said = {};
    const seen = new Set();
    for (let i = 0; i < 10; i++) {
      const l = Game.convoPick(npcs[1], 'goal', post);
      if (l) seen.add(l);
    }
    ok('post-System: full 8-line pool drawable (no instant exhaustion)',
      seen.size === 8, `drew ${seen.size}/8`);
    ok('post-System: at least one drawn line names the System',
      [...seen].some(l => /the system/i.test(l)));
  }

  // ---------------- CLASS B: question minDay gates ----------------
  console.log('\n-- B. question minDay gates --');
  {
    const cg = (Game.data.characterGen || {}).convo || {};
    const fw = (cg.questions || []).find(q => q.id === 'q_first_week');
    const nq = (cg.questions || []).find(q => q.id === 'q_night');
    ok('q_first_week carries minDay 8 (data)', fw && fw.minDay === 8);
    ok('q_night carries minDay 2 (data)', nq && nq.minDay === 2);
    const mood = Game.npcMood(npcs[2]);
    // WRONG CONTEXT: day 3 — "the first week" hasn't happened.
    Game.state.scholar.day = 3;
    ok('day 3: q_first_week CANNOT be asked', Game.convoQuestionOk(fw, 100, mood) === false);
    // RIGHT CONTEXT: day 9 — the first week is real.
    Game.state.scholar.day = 9;
    ok('day 9: q_first_week CAN be asked', Game.convoQuestionOk(fw, 100, mood) === true);
    // WRONG CONTEXT: day 1 — nobody has slept in-game yet.
    Game.state.scholar.day = 1;
    ok('day 1: q_night ("did you sleep?") CANNOT be asked', Game.convoQuestionOk(nq, 100, mood) === false);
    // RIGHT CONTEXT: day 2 — a night has passed.
    Game.state.scholar.day = 2;
    ok('day 2: q_night CAN be asked', Game.convoQuestionOk(nq, 100, mood) === true);
    // Trust/mood gates still intact.
    ok('trust gate still enforced', Game.convoQuestionOk({ minTrust: 45 }, 10, mood) === false);
    Game.state.scholar.day = 3;
  }

  // ---------------- CLASS C: missing goalFollow + askAbout lines ----------------
  console.log('\n-- C. six goals: follow-ups + askAbout lines --');
  {
    const six = ['home', 'record', 'answers', 'legacy', 'joy', 'peace'];
    const gf = ((Game.data.characterGen || {}).convo || {}).goalFollow || {};
    for (const g of six) {
      const vid = npcs[3];
      setGoal(vid, g);
      const c = Game.convoGet(vid);
      c.thread = 'goal'; c.depth = 1; c.said = {};
      // WRONG-BEFORE: hasMore was false on an unexhausted thread ("told you
      // everything" after one line). NOW it must hold the thread open.
      ok(`goal '${g}': thread honestly has more (not instant-exhausted)`,
        Game.convoThreadHasMore(vid) === true);
      const beat = Game.convoThreadBeat(vid);
      ok(`goal '${g}': a follow-up beat exists`, !!(beat && beat.length > 10), show(beat));
    }
    // askAbout('goal') — capture the spoken line.
    const said = [];
    const origSay = Game.say;
    Game.say = (t) => { said.push(String(t)); };
    try {
      for (const g of six) {
        const vid = npcs[4];
        setGoal(vid, g);
        said.length = 0;
        Game.askAbout(vid, 'goal', { inConvo: true });
        const line = said.join(' ');
        ok(`askAbout goal '${g}': answered in character, not the generic dodge`,
          !/getting through today/i.test(line) && line.length > 20, show(line));
      }
    } finally { Game.say = origSay; }
  }

  // ---------------- CLASS D: ambientSocial day-part time word ----------------
  console.log('\n-- D. ambientSocial "tonight" day-part awareness --');
  {
    const said = [];
    const origSay = Game.say;
    const realRandom = Math.random;
    Game.say = (t) => { said.push(String(t)); };
    try {
      // WRONG CONTEXT: morning (dayPart 0) with grief — "tonight" is false.
      Game.dayPart = 0;
      Game.state.village.grief = 3;
      Game.state.village.cheer = 0;
      Math.random = () => 0; // gate passes, first grief line: the time-word one
      said.length = 0;
      Game.ambientSocial(true);
      ok('morning grief: no "tonight" in the line', said.length > 0 && !/tonight/i.test(said.join(' ')),
        show(said.join(' ')));
      ok('morning grief: says "today" instead', /today/i.test(said.join(' ')), show(said.join(' ')));
      // RIGHT CONTEXT: night (dayPart 3) — "tonight" is correct.
      Game.dayPart = 3;
      said.length = 0;
      Game.ambientSocial(true);
      ok('night grief: "tonight" is correct again', /tonight/i.test(said.join(' ')), show(said.join(' ')));
      // Cheer branch: r in [0.35, 0.5).
      Game.state.village.grief = 0;
      Game.state.village.cheer = 2;
      Game.dayPart = 1;
      Math.random = () => 0.4;
      said.length = 0;
      Game.ambientSocial(true);
      ok('daytime cheer: fire line uses "today", not "tonight"',
        said.length > 0 && /fire going big today/i.test(said.join(' ')), show(said.join(' ')));
      Game.dayPart = 3;
      said.length = 0;
      Game.ambientSocial(true);
      ok('night cheer: fire line uses "tonight"',
        /fire going big tonight/i.test(said.join(' ')), show(said.join(' ')));
    } finally { Game.say = origSay; Math.random = realRandom; }
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
