#!/usr/bin/env node
// Proof test: encounters.js sections 8-12 (graduated coaching, encounter
// memory, pattern telegraphs, wound states, pack coordination).
// Deterministic: Math.random is reseeded with mulberry32 (default SEED=7;
// override with SEED=<n>). Per AGENTS.md PROOF-TEST RNG STABILITY: a node
// proof script over unseeded Math.random is flaky by construction — seed
// it, and assert behavior, not aggregates.
'use strict';

var SEED = parseInt(process.env.SEED || '7', 10);
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(SEED);

// ---- minimal Game harness: only what sections 8-12 touch ----
var said = [];
globalThis.Scattering = {
  Game: {
    state: { codex: {}, scholar: {}, logSeq: 0, fbMark: null },
    data: { animals: [], monsters: [] },
    say: function (m) { said.push(String(m)); },
    audioEvent: function (n) { said.push('[audio] ' + n); }
  }
};
var Game = globalThis.Scattering.Game;
require('../src/js/encounters.js');

var failures = 0, checks = 0;
function ok(cond, name, extra) {
  checks++;
  if (!cond) { failures++; console.log('FAIL [' + SEED + '] ' + name + (extra ? ' :: ' + extra : '')); }
  else console.log('ok   [' + SEED + '] ' + name);
}
function nonEmpty(s) { return typeof s === 'string' && s.length > 10; }

// ============ 8. GRADUATED COACHING ============
(function () {
  var G = Game;
  var CUES = {
    sight: function (l) { return l + ' tenses — you don\'t know this one yet.'; },
    recognized: function (l) { return l + ' drops its head. You\'ve seen this windup: sidestep, don\'t outrun.'; },
    mastered: function (l) { return l + ' drops its head. Third time: you read the lane before it moves. Sidestep early, strike the recovery.'; }
  };
  // stage 0: diegetic only — the tactical coaching must NOT show
  ok(G.encPatternStage('boarx', 'charge') === 0, 'coaching: fresh pattern is stage 0 (sight)');
  var c0 = G.encPatternCue('boarx', 'charge', CUES, 'the boar');
  ok(nonEmpty(c0) && c0.indexOf('sidestep') === -1, 'coaching: stage 0 cue has no tactics', c0);
  // one survival -> recognized
  ok(G.encPatternSeen('boarx', 'charge') === 1, 'coaching: first survival returns stage 1');
  var c1 = G.encPatternCue('boarx', 'charge', CUES, 'the boar');
  ok(c1.indexOf('sidestep') !== -1 && c1.indexOf('recovery') === -1, 'coaching: stage 1 names the tell, not the full read', c1);
  // two more survivals -> mastered
  G.encPatternSeen('boarx', 'charge');
  G.encPatternSeen('boarx', 'charge');
  ok(G.encPatternStage('boarx', 'charge') === 2, 'coaching: 3 survivals -> stage 2 (mastered)');
  var c2 = G.encPatternCue('boarx', 'charge', CUES, 'the boar');
  ok(c2.indexOf('recovery') !== -1, 'coaching: stage 2 gives full tactical read', c2);
  ok(G.encPatternStageName(0) === 'sight' && G.encPatternStageName(1) === 'recognized' && G.encPatternStageName(2) === 'mastered',
    'coaching: stage names');
  // fallback ladder: mastered missing -> recognized, never silence
  var cfb = G.encPatternCue('boarx', 'charge', { sight: 'S', recognized: 'R' }, 'x');
  ok(cfb === 'R', 'coaching: stage 2 falls back to recognized when mastered missing', cfb);
  var cfb0 = G.encPatternCue('newm', 'beam', { sight: 'only-sight' }, 'x');
  ok(cfb0 === 'only-sight', 'coaching: sight-only cue set never silent');
  // exposures counter is per monster|pattern
  ok(G.encPatternExposures('boarx', 'beam') === 0, 'coaching: exposures keyed per monster+pattern');
})();

// ============ 9. ENCOUNTER MEMORY ============
(function () {
  var G = Game;
  var r0 = G.encMonsterRecall('hbx');
  ok(r0.meetings === 0 && r0.lastOutcome === null, 'memory: fresh record is empty');
  var d0 = G.encMemoryDelta('hbx');
  ok(d0.approachBonus === 0 && !d0.keepsRange && !d0.focusesPlayer && !d0.wary, 'memory: fresh delta is neutral');
  G.encMonsterRemember('hbx', 'met');
  ok(G.encMeetingRead('hbx', 'the highbeam deer') === null, 'memory: first meeting gets no read (spawn text owns it)');
  G.encMonsterRemember('hbx', 'met');
  G.encMonsterRemember('hbx', 'fled');
  var rf = G.encMonsterRecall('hbx');
  ok(rf.meetings === 2 && rf.lastOutcome === 'fled' && rf.fled === 1, 'memory: fled recorded');
  var readF = G.encMeetingRead('hbx', 'the highbeam deer');
  ok(nonEmpty(readF) && readF.indexOf('running') !== -1, 'memory: fled read says it remembers you running', readF);
  var df = G.encMemoryDelta('hbx');
  ok(df.approachBonus === 1 && !df.keepsRange, 'memory: fled -> bolder approach');
  G.encMonsterRemember('hbx', 'hurt');
  var readH = G.encMeetingRead('hbx', 'the highbeam deer');
  ok(nonEmpty(readH) && readH.indexOf('wound') !== -1, 'memory: hurt read says it circles wide', readH);
  ok(G.encMemoryDelta('hbx').keepsRange === true, 'memory: hurt -> keeps range');
  G.encMonsterRemember('hbx', 'packmate_killed');
  var readP = G.encMeetingRead('hbx', 'the highbeam deer');
  ok(nonEmpty(readP) && readP.indexOf('personal') !== -1, 'memory: packmate_killed read says it watches YOU', readP);
  ok(G.encMemoryDelta('hbx').focusesPlayer === true, 'memory: packmate_killed -> focuses player');
  G.encMonsterRemember('hbx', 'drove_off');
  var readD = G.encMeetingRead('hbx', 'the highbeam deer');
  ok(nonEmpty(readD) && readD.indexOf('weighing you') !== -1, 'memory: drove_off read says it hangs back', readD);
  ok(G.encMemoryDelta('hbx').wary === true, 'memory: drove_off -> wary');
  // memory persists on the codex (monster-side knowledge, survives reloads)
  ok(Game.state.codex.encMonsterMem && Game.state.codex.encMonsterMem.hbx.meetings === 2, 'memory: stored on state.codex.encMonsterMem');
})();

// ============ 10. PATTERN TELEGRAPHS ============
(function () {
  var G = Game;
  var types = ['charge', 'burst', 'beam', 'rush', 'ambush'];
  var texts = {};
  types.forEach(function (t) {
    var r = G.encPatternTelegraph(t, 'the highbeam deer', 0, 'crown');
    ok(nonEmpty(r.text) && typeof r.audio === 'string' && r.audio.length > 0, 'telegraph: ' + t + ' returns text + audio', r.text);
    texts[t] = r.text;
  });
  // distinct per shape — no two share the same text
  var seen = {};
  var distinct = true;
  types.forEach(function (t) { if (seen[texts[t]]) distinct = false; seen[texts[t]] = 1; });
  ok(distinct, 'telegraph: all five shapes have distinct text');
  // anatomy justification: charger = body/lane, burst = swelling/radius,
  // beam = light/sweep (anatomy word honored), rush = speed, ambush = silence
  ok(texts.charge.indexOf('lane') !== -1, 'telegraph: charge names the lane', texts.charge);
  ok(texts.burst.indexOf('radius') !== -1, 'telegraph: burst names the radius', texts.burst);
  ok(texts.beam.indexOf('crown') !== -1, 'telegraph: beam honors the anatomy word', texts.beam);
  ok(texts.rush.indexOf('speed') !== -1, 'telegraph: rush IS the warning', texts.rush);
  ok(texts.ambush.indexOf('quiet') !== -1, 'telegraph: ambush telegraphs with silence', texts.ambush);
  // stage 0: diegetic only; stage 1+: tactical read appended (earned)
  ok(texts.charge.indexOf('sidestep') === -1, 'telegraph: stage 0 has no tactics');
  var t1 = G.encPatternTelegraph('charge', 'the boar', 1);
  ok(t1.text.indexOf('sidestep') !== -1, 'telegraph: stage 1 appends tactical read', t1.text);
  // unknown type degrades gracefully, never silent
  var tg = G.encPatternTelegraph('nope', 'it', 0);
  ok(nonEmpty(tg.text), 'telegraph: unknown type falls back, never silent', tg.text);
})();

// ============ 11. WOUND STATES ============
(function () {
  var G = Game;
  said.length = 0;
  var m = { hp: 160, maxHp: 160, encounter: { temperament: 'enraged' } };
  ok(G.encWoundState(m) === 'fresh', 'wound: fresh before damage');
  ok(G.encWoundCheck(m, 'the highbeam deer') === null, 'wound: no transition above half HP');
  m.hp = 100; // still above half
  ok(G.encWoundCheck(m, 'the highbeam deer') === null, 'wound: no transition at 100/160');
  m.hp = 79; // below half
  var line = G.encWoundCheck(m, 'the highbeam deer');
  ok(nonEmpty(line) && line.indexOf('BLEEDING') !== -1, 'wound: half-HP crossing narrates loudly', line);
  ok(G.encWoundState(m) === 'enraged', 'wound: temperament stored on entity');
  ok(said.some(function (s) { return s.indexOf('[audio] woundEnraged') === 0; }), 'wound: audio beat fired');
  ok(G.encWoundCheck(m, 'the highbeam deer') === null, 'wound: transition fires once per encounter');
  // cunning via pattern inference (ambush -> cunning)
  var m2 = { hp: 20, maxHp: 100, encounter: { pattern: 'ambush' } };
  var l2 = G.encWoundCheck(m2, 'the stalker');
  ok(nonEmpty(l2) && l2.indexOf('CHOOSING') !== -1 && G.encWoundState(m2) === 'cunning', 'wound: ambush pattern infers cunning', l2);
  // desperate via pattern inference (burst -> desperate)
  var m3 = { hp: 10, maxHp: 100, encounter: { pattern: 'burst' } };
  var l3 = G.encWoundCheck(m3, 'the bellower');
  ok(nonEmpty(l3) && l3.indexOf('sloppy') !== -1 && G.encWoundState(m3) === 'desperate', 'wound: burst pattern infers desperate', l3);
  // explicit temperament on the def wins over inference
  var m4 = { hp: 5, maxHp: 100, encounter: { pattern: 'burst', temperament: 'cunning' } };
  G.encWoundCheck(m4, 'the bellower');
  ok(G.encWoundState(m4) === 'cunning', 'wound: explicit temperament wins');
  // dead monsters don't transition; exact-half counts as wounded
  var m5 = { hp: 0, maxHp: 100 };
  ok(G.encWoundCheck(m5, 'it') === null, 'wound: dead monster has no transition');
  var m6 = { hp: 50, maxHp: 100 };
  ok(nonEmpty(G.encWoundCheck(m6, 'it')), 'wound: exactly half HP crosses the line');
})();

// ============ 12. PACK COORDINATION ============
(function () {
  var G = Game;
  var pack = [
    { maxHp: 60, hp: 60 },   // alpha by HP
    { maxHp: 40, hp: 40 },
    { maxHp: 40, hp: 40 }
  ];
  var asg = G.encPackAssign(pack, function () { return 'The hushwolves'; });
  ok(asg.roles.length === 3, 'pack: three roles assigned');
  ok(asg.roles[0].role === 'anchor', 'pack: alpha (highest HP) anchors');
  ok(asg.roles[1].role === 'driver' && asg.roles[2].role === 'flanker', 'pack: rest split driver/flanker');
  ok(G.encPackRoleOf(pack[0]) === 'anchor' && G.encPackRoleOf(pack[2]) === 'flanker', 'pack: roles readable per member');
  ok(nonEmpty(asg.text) && asg.text.indexOf('split') !== -1, 'pack: the split is narrated once', asg.text);
  var beat = G.encPackBeat(pack[2], 'the hushwolf', 0);
  ok(nonEmpty(beat) && beat.indexOf('circles wide') !== -1 && beat.indexOf('Punish') === -1, 'pack: flanker beat is diegetic at stage 0', beat);
  var beat1 = G.encPackBeat(pack[2], 'the hushwolf', 1);
  ok(beat1.indexOf('Punish') !== -1, 'pack: stage 1 appends tactical read', beat1);
  ok(G.encPackBeat({ hp: 10 }, 'lone thing', 0) === null, 'pack: roleless member returns null');
  var empty = G.encPackAssign([], function () { return 'x'; });
  ok(empty.roles.length === 0, 'pack: empty pack is safe');
  var pair = G.encPackAssign([{ maxHp: 30 }, { maxHp: 50 }], function () { return 'They'; });
  ok(pair.roles[1].role === 'anchor' && nonEmpty(pair.text) && pair.text.indexOf('Two parts') !== -1, 'pack: pair gets two-part text');
})();

console.log('\n' + checks + ' checks, ' + failures + ' failures (seed ' + SEED + ')');
process.exit(failures ? 1 : 0);
