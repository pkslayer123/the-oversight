#!/usr/bin/env node
// PROOF TEST: day engine feel — named time costs, day-part texture, night
// watches, hunger pacing, dawn as a moment. (Steve 2026-10-05)
//
// Seeded: fixed default seed; override with SEED env (AGENTS.md RNG lesson).
// Asserts BEFORE (old HEAD build) vs AFTER (this build) for every new helper,
// then plays one expedition day as a player and prints the transcript.
// Does NOT run jest (concurrency hazard).
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SEED = parseInt(process.env.SEED || '20261007', 10);
// "before" snapshot: the day.js this work started from. Defaults to HEAD (run
// the test BEFORE committing); after committing, pass BASE_REF=<pre-work sha>.
const BASE_REF = process.env.BASE_REF || 'HEAD';
const repo = path.join(__dirname, '..');
const newSrc = fs.readFileSync(path.join(repo, 'src', 'js', 'engine', 'day.js'), 'utf8');
const oldSrc = execSync(`git show ${BASE_REF}:src/js/engine/day.js`, { cwd: repo }).toString();

function load(src) {
  const sandbox = {};
  // pass sandbox as BOTH global and window: day.js prefers window when defined
  new Function('global', 'window', src)(sandbox, sandbox);
  return sandbox.Scattering.day;
}
const after = load(newSrc);
const before = load(oldSrc);

let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.error('  FAIL: ' + msg); }
}
function eq(a, b, msg) {
  assert(JSON.stringify(a) === JSON.stringify(b), msg + ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
}

console.log(`seed=${SEED}`);

// ============ BEFORE: the old build had none of this ============
console.log('\n[before] old build surface');
assert(typeof before.PHASES !== 'undefined', 'before: PHASES existed');
assert(typeof before.newDay === 'function', 'before: newDay existed');
for (const k of ['costLabel', 'labeledCost', 'dayPartOf', 'spendMinutes', 'dawnBeat',
  'eveningTick', 'planWatches', 'resolveNightWatch', 'hungerState', 'makeRng',
  'CLOCK_PARTS', 'PART_MOOD', 'ACTION_MINUTES']) {
  assert(typeof before[k] === 'undefined', `before: ${k} did not exist`);
}
// old contract unchanged in the new build
eq(after.PHASES, before.PHASES, 'after: PHASES unchanged');
eq(after.newDay({ day: 3, ap: 0 }), { day: 4, phase: 'morning', log: [] }, 'after: newDay unchanged');

// ============ AFTER: named time costs ============
console.log('\n[after] named time costs');
eq(after.costLabel(0), 'a moment', 'costLabel 0');
eq(after.costLabel(19), 'a moment', 'costLabel 19');
eq(after.costLabel(20), 'a short spell', 'costLabel 20');
eq(after.costLabel(59), 'a short spell', 'costLabel 59');
eq(after.costLabel(60), 'a while', 'costLabel 60');
eq(after.costLabel(179), 'a while', 'costLabel 179');
eq(after.costLabel(180), 'much of the day', 'costLabel 180');
eq(after.costLabel(359), 'much of the day', 'costLabel 359');
eq(after.costLabel(360), 'most of the day', 'costLabel 360');
eq(after.costLabel(null), 'unknown cost', 'costLabel null');
eq(after.costLabel(-5), 'unknown cost', 'costLabel negative');
eq(after.fmtMinutes(45), '45 min', 'fmtMinutes 45');
eq(after.fmtMinutes(90), '1.5 h', 'fmtMinutes 90');
eq(after.fmtMinutes(120), '2 h', 'fmtMinutes 120');
eq(after.fmtMinutes(420), '7 h', 'fmtMinutes 420');
eq(after.costFor('forage'), 90, 'costFor forage');
eq(after.costFor('hunt'), 180, 'costFor hunt (1.5 AP anchor)');
eq(after.costFor('treat_water'), 30, 'costFor treat_water (cheap)');
eq(after.costFor('talk'), 15, 'costFor talk (a moment)');
eq(after.costFor('nap'), null, 'costFor unknown -> null (no silent default)');
eq(after.labeledCost('forage'), 'Forage (a while (≈1.5 h))', 'labeledCost forage');
eq(after.labeledCost('treat_water'), 'Treat water (a short spell (≈30 min))', 'labeledCost treat_water');
eq(after.labeledCost('nap'), 'Nap (cost unknown)', 'labeledCost unknown is honest');
// proportion vs the 4-AP / 480-min midday anchor: no listed action eats the day alone
for (const [a, m] of Object.entries(after.ACTION_MINUTES)) {
  assert(m > 0 && m < after.DAYLIGHT_MINUTES, `ACTION_MINUTES.${a} proportionate (0 < ${m} < 900)`);
}

// ============ AFTER: clock ============
console.log('\n[after] clock');
eq(after.CLOCK_PARTS, ['dawn', 'midday', 'dusk', 'night'], 'CLOCK_PARTS matches game.js DAY_PARTS');
eq(after.MINUTES_PER_DAY, 1440, 'minutes per day');
eq(Object.values(after.PART_MINUTES).reduce((a, b) => a + b, 0), 1440, 'part minutes sum to 1440');
eq(after.dayBudget(), 900, 'dayBudget = 900 daylight minutes');
eq(after.dayPartOf(0), 'night', 'dayPartOf 0');
eq(after.dayPartOf(299), 'night', 'dayPartOf 299');
eq(after.dayPartOf(300), 'dawn', 'dayPartOf 300');
eq(after.dayPartOf(479), 'dawn', 'dayPartOf 479');
eq(after.dayPartOf(480), 'midday', 'dayPartOf 480');
eq(after.dayPartOf(959), 'midday', 'dayPartOf 959');
eq(after.dayPartOf(960), 'dusk', 'dayPartOf 960');
eq(after.dayPartOf(1199), 'dusk', 'dayPartOf 1199');
eq(after.dayPartOf(1200), 'night', 'dayPartOf 1200');
eq(after.dayPartOf(1439), 'night', 'dayPartOf 1439');
eq(after.dayPartOf(-60), 'night', 'dayPartOf wraps negative');
eq(after.dayPartOf(1500), 'night', 'dayPartOf wraps >1440');
eq(after.partMinutes('midday'), 480, 'partMinutes midday');
eq(after.partMinutes('bogus'), null, 'partMinutes bogus');
eq(after.daylightLeft({ minute: 600 }), 600, 'daylightLeft midday');
eq(after.daylightLeft({ minute: 1300 }), 0, 'daylightLeft at night');
eq(after.nightLeft({ minute: 1300 }), 440, 'nightLeft 1300');
eq(after.nightLeft({ minute: 100 }), 200, 'nightLeft 100');
eq(after.nightLeft({ minute: 600 }), 0, 'nightLeft midday');

// spendMinutes: part crossing carries the arrival mood; day wrap is a dawn moment
{
  const r = after.spendMinutes({ day: 1, minute: 600 }, 400, { rng: after.makeRng(SEED) });
  eq(r.clock, { day: 1, minute: 1000 }, 'spendMinutes clock advances');
  eq(r.events.length, 1, 'spendMinutes one event');
  eq(r.events[0].type, 'part', 'spendMinutes part event');
  eq(r.events[0].from, 'midday', 'spendMinutes from midday');
  eq(r.events[0].to, 'dusk', 'spendMinutes to dusk');
  eq(r.events[0].mood.glyph, '🌇', 'spendMinutes arrival mood');
}
{
  const r = after.spendMinutes({ day: 1, minute: 1300 }, 200, { rng: after.makeRng(SEED) });
  eq(r.clock, { day: 2, minute: 60 }, 'spendMinutes wraps the day');
  eq(r.events[0].type, 'dawn', 'day rollover is a dawn event');
  eq(r.events[0].day, 2, 'dawn event day');
  assert(r.events[0].beat && r.events[0].beat.title === '— DAY 2 DAWN —', 'dawn event carries the beat');
}

// ============ AFTER: day-part texture ============
console.log('\n[after] day-part texture');
eq(Object.keys(after.PART_MOOD).sort(), ['dawn', 'dusk', 'midday', 'night'], 'PART_MOOD covers all parts');
eq(after.partMood('dawn').glyph, '🌅', 'dawn glyph');
eq(after.partMood('midday').glyph, '☀️', 'midday glyph');
eq(after.partMood('dusk').glyph, '🌇', 'dusk glyph');
eq(after.partMood('night').glyph, '🌙', 'night glyph');
for (const p of after.CLOCK_PARTS) {
  const m = after.partMood(p);
  assert(m && m.audioHook && m.tone && m.line, `partMood(${p}) has audio hook + tone + line`);
}
eq(after.partMood('bogus'), null, 'partMood bogus');

// seeded RNG determinism
{
  const r1 = after.makeRng(SEED), r2 = after.makeRng(SEED), r3 = after.makeRng(SEED + 1);
  const s1 = [r1(), r1(), r1()], s2 = [r2(), r2(), r2()], s3 = [r3(), r3(), r3()];
  eq(s1, s2, 'makeRng deterministic per seed');
  assert(JSON.stringify(s1) !== JSON.stringify(s3), 'makeRng differs across seeds');
  assert(s1.every(v => v >= 0 && v < 1), 'makeRng in [0,1)');
}
// dawn beat: a moment, deterministic under seed
{
  const b1 = after.dawnBeat(4, { rng: after.makeRng(SEED), statusLine: 'Kcal 1800. Pack light.' });
  const b2 = after.dawnBeat(4, { rng: after.makeRng(SEED), statusLine: 'Kcal 1800. Pack light.' });
  eq(b1, b2, 'dawnBeat deterministic under seed');
  eq(b1.title, '— DAY 4 DAWN —', 'dawnBeat title');
  assert(b1.lines.length >= 3, 'dawnBeat has status + weather + system lines');
  assert(b1.lines.some(l => l.startsWith('Weather:')), 'dawnBeat names the weather');
  assert(b1.lines.some(l => l.startsWith('SYSTEM:')), 'dawnBeat rolls a System line');
  eq(b1.prompt, 'Plan the day.', 'dawnBeat prompt');
  eq(b1.glyph, '🌅', 'dawnBeat glyph');
  eq(b1.audioHook, 'dawn-chorus', 'dawnBeat audio hook');
  const w = after.weatherRoll(after.makeRng(SEED));
  assert(typeof w === 'string' && w.length > 3, 'weatherRoll returns a weather line');
  const w2 = after.weatherRoll(after.makeRng(SEED));
  eq(w, w2, 'weatherRoll deterministic under seed');
}

// ============ AFTER: evening ============
console.log('\n[after] evening');
{
  const t = after.eveningTick({
    day: 2,
    items: [{ name: 'berries', spoilageDay: 2 }, { name: 'smoked turkey', spoilageDay: 30 }, { name: 'acorns', spoilageDay: 3 }, { name: 'stone' }],
    waterL: 12,
  });
  eq(t.spoiled, ['berries'], 'eveningTick spoiled');
  eq(t.spoiling, ['acorns'], 'eveningTick spoiling tomorrow');
  eq(t.water.stage, 'ok', 'eveningTick water ok');
}
eq(after.waterStage(0).stage, 'empty', 'water empty');
eq(after.waterStage(1).stage, 'critical', 'water critical');
eq(after.waterStage(3).stage, 'low', 'water low');
eq(after.waterStage(12).stage, 'ok', 'water ok');
assert(after.waterStage(1).urgent === true, 'critical water is urgent');
assert(after.waterStage(3).urgent === false, 'low water is not urgent');

// ============ AFTER: night watches ============
console.log('\n[after] night watches');
{
  const r = after.planWatches([
    { id: 'a', name: 'Ava', adult: true },
    { id: 'b', name: 'Ben', adult: true, injured: true },
    { id: 'c', name: 'Cy', adult: false },
    { id: 'd', name: 'Dee', adult: true, exhausted: true },
  ]);
  eq(r.first.name, 'Ava', 'planWatches picks able first');
  eq(r.second, null, 'planWatches no second when others unfit');
  eq(r.refused.map(x => x.name + ':' + x.reason), ['Ben:hurt', 'Dee:exhausted'], 'planWatches refusal is a shown beat');
  assert(r.watched === true, 'planWatches watched with one');
  assert(/alone/.test(r.note), 'planWatches notes the solo cost');
}
{
  const r = after.planWatches([]);
  assert(r.watched === false, 'planWatches empty -> unwatched');
  assert(/unwatched/.test(r.note), 'planWatches says the night goes unwatched');
}
{
  const r = after.planWatches([
    { id: 'a', name: 'Ava', adult: true },
    { id: 'e', name: 'Eli', adult: true },
  ]);
  eq([r.first.name, r.second.name], ['Ava', 'Eli'], 'planWatches two watches');
}
eq(after.curiosityStage(0), 'unseen', 'curiosity 0');
eq(after.curiosityStage(2), 'curious', 'curiosity 2');
eq(after.curiosityStage(4), 'prowling', 'curiosity 4');
eq(after.curiosityStage(5), 'hungry', 'curiosity 5');
{
  // watched quiet night: curiosity still rises (monsters are curious either way)
  const r = after.resolveNightWatch({ watched: true, first: { id: 'a' }, second: { id: 'e' } }, { curiosity: 0 }, after.makeRng(SEED));
  eq(r.outcome, 'quiet', 'watched quiet outcome');
  eq(r.curiosity, 1, 'curiosity rises even watched');
  eq(r.sleepDebt, ['a', 'e'], 'watchers carry sleep debt');
  assert(r.lines.length > 0, 'night returns lines');
}
{
  // unwatched escalation reaches hunger -> attacked
  let night = { curiosity: 0 };
  let last;
  for (let i = 0; i < 3; i++) {
    last = after.resolveNightWatch({ watched: false }, night, after.makeRng(SEED));
    night = { curiosity: last.curiosity };
  }
  eq(last.outcome, 'attacked', 'three unwatched nights -> attacked');
  eq(last.stage, 'hungry', 'unwatched escalation reaches hungry');
}
{
  // watched escalation reaches hunger -> confronted, never cowering; reset to 2
  let night = { curiosity: 0 };
  let last;
  for (let i = 0; i < 5; i++) {
    last = after.resolveNightWatch({ watched: true, first: { id: 'a' }, second: { id: 'e' } }, night, after.makeRng(SEED));
    night = { curiosity: last.curiosity };
  }
  eq(last.outcome, 'confronted', 'watched hunger -> confronted');
  eq(last.curiosity, 2, 'confronted resets curiosity to prowling-ish');
  assert(/meets it/.test(last.lines[0]), 'defenders act, never cower');
}

// ============ AFTER: hunger pacing (visible, honest, slow) ============
console.log('\n[after] hunger pacing');
{
  const h = after.hungerState({ kcal: 2200 });
  eq(h.stage, 'fed', 'hunger fed');
  eq(h.daysToSpiral, 1, 'fed = a day in the tank');
}
{
  const h = after.hungerState({ kcal: 1100 });
  eq(h.stage, 'lean', 'hunger lean');
  eq(h.daysToSpiral, 0.5, 'lean = half a day buffer');
}
{
  const h = after.hungerState({ kcal: 500 });
  eq(h.stage, 'hungry', 'hunger hungry');
  assert(h.daysToSpiral < 0.5 && h.daysToSpiral > 0, 'hungry = spiral within the day');
}
{
  const h = after.hungerState({ kcal: 0 });
  eq(h.stage, 'starving', 'hunger starving');
  eq(h.daysToSpiral, 0, 'starving = spiral started');
}
{
  // stages span ~a day each: slow, not the wound system
  const h1 = after.hungerState({ kcal: 2200 });
  const h2 = after.hungerState({ kcal: 2199 });
  eq(h1.stage, 'fed', 'fed at need');
  eq(h2.stage, 'lean', 'one kcal under need is lean, not a wound');
  const h3 = after.hungerState({ kcal: 2200 }, 4400);
  eq(h3.stage, 'lean', 'custom need honored');
}
assert(after.ACTIVE_ANCHOR === 2200, 'ACTIVE_ANCHOR mirrors the 2,000 kcal/day design anchor');

// ============ PLAYED AS A PLAYER: one expedition day ============
console.log('\n[play] one day as a player');
{
  const rng = after.makeRng(SEED);
  const scholar = { day: 0, ap: 4, kcal: 1500 };
  const day = after.newDay(scholar);
  const beat = after.dawnBeat(day.day, { rng, statusLine: 'Kcal 1500. Pack light. The creek is low.' });
  console.log('  ' + beat.title + ' ' + beat.glyph);
  for (const l of beat.lines) console.log('  | ' + l);
  console.log('  > ' + beat.prompt);
  const h0 = after.hungerState(scholar);
  console.log(`  Hunger: ${h0.label} — ${h0.note} (${h0.daysToSpiral}d to spiral)`);

  let clock = { day: day.day, minute: 300 };
  const plan = ['forage', 'treat_water', 'explore'];
  for (const a of plan) {
    const label = after.labeledCost(a);
    const mins = after.costFor(a);
    console.log(`  [button] ${label}   (daylight left: ${after.daylightLeft(clock)} min)`);
    const r = after.spendMinutes(clock, mins, { rng });
    clock = r.clock;
    for (const e of r.events) {
      if (e.type === 'part') console.log(`  — ${e.from} → ${e.to} ${e.mood.glyph} (${e.mood.audioHook})`);
    }
  }
  assert(clock.minute === 540, 'play: three actions land at 09:00');
  assert(after.dayPartOf(clock.minute) === 'midday', 'play: still midday after honest costs');

  const eve = after.eveningTick({ day: day.day, items: [{ name: 'dandelion greens', spoilageDay: 2 }], waterL: 3 });
  console.log(`  Evening: spoiling tomorrow: ${eve.spoiling.join(', ') || 'none'}; water: ${eve.water.label}`);
  assert(eve.water.stage === 'low', 'play: low water is visible, not silent');

  const roster = after.planWatches([
    { id: 'you', name: 'You', adult: true },
    { id: 'ava', name: 'Ava', adult: true, exhausted: true },
  ]);
  console.log('  Night: ' + roster.note);
  const night = after.resolveNightWatch(roster, { curiosity: 2 }, rng);
  console.log(`  Night: ${night.outcome} — ${night.lines[0]}`);
  console.log(`  Sleep debt: ${night.sleepDebt.join(', ')}; curiosity now ${night.curiosity} (${night.stage})`);
  assert(night.outcome === 'prowled' || night.outcome === 'quiet', 'play: night resolves to a named outcome');
}

console.log(`\n${pass} passed, ${fail} failed (seed ${SEED})`);
if (fail) { console.log('failures:'); for (const f of failures) console.log(' - ' + f); }
process.exit(fail ? 1 : 0);
