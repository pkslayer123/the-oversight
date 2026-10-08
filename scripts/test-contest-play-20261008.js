#!/usr/bin/env node
// CONTEST PLAY PROOF (Steve 2026-10-08) — play the 30 older contests as a
// PLAYER and judge them: fun/fear/pacing/voice, beats firing in order,
// the six bespoke synths firing at the right beats.
//
// The 30 older contests (pit..vigil) got per-phase beat defs
// (contest<Id>Declare|Escalate|Climax|Resolve in CX_BEAT_DEFS) and six of
// those beats carry bespoke synths (app.js): altarCurdle (tithe Declare),
// hungerGnaw (starve Escalate), predatorListen (hide Declare), teethTick
// (wheel Escalate), mindMoth (quiet Escalate), engineVoices (riddle Declare).
//
// What this proves, per contest:
//   BEATS   — declare→escalate→climax→resolve fire in narrative order,
//             every phase declares a beat that exists in CX_BEAT_DEFS.
//   HOOKS   — each bespoke synth fires when its beat runs in-context.
//   ESCALATE— phase texts are all distinct (beats escalate, never repeat).
//   RESOLVE — the sequence terminates and the outcome is named in the log.
//   VOICE   — within a family, no two contests open with the same text;
//             template-shared choices carry the right contest's fiction
//             (lottery≠wheel, pattern≠box, moot≠lies) — regressions for
//             wrong-fiction wiring fixed 2026-10-08.
//   KNOWLEDGE — tithe/quiet/riddle/confession change text at codex level 2.
//   CHOICE  — the participate/refuse screen fires the small contestChoice
//             beat, never the contest's Declare beat (no double-sting,
//             no bespoke sting on Refuse).
//
// HARNESS: full src/js/*.js list in index.html order, minus DOM-only
// app.js/sprites.js/tile-scenes.js/move-anim.js and minus drama.js.
// global.window stub for eval, deleted before play (sync combat path).
// RNG seeded (mulberry32, fixed default, SEED env override).
// Game.audio is a plain object with recorder stubs for every synth part
// named in CX_BEAT_DEFS, so _cxBeat's lazy composition installs exactly
// like the real CombatAudio and inner synth firings are recorded.
// Game.audioEvent mirrors game.js: records the beat name, then invokes
// the composed function (so inner synths fire too).
//
// Exit code non-zero on any assertion failure.
// Run: node scripts/test-contest-play-20261008.js
//      SEED=7 node scripts/test-contest-play-20261008.js
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(read(f))) });
global.window = global; // equipment.js touches window at load
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
// drama.js excluded: DOM at load. All Game.drama calls in contests.js are try/caught.
_SCRIPTS.forEach(f => eval(read(f)));
delete global.window; // sync combat path for tbAfterPlayerAction
const Game = globalThis.Scattering.Game;

// ---------- CX_BEAT_DEFS parsed from source (static assertions) ----------
const csrc = read('src/js/contests.js');
const DEFS = {};
for (const m of csrc.matchAll(/^\s{4}(contest[A-Za-z]+): \[([^\]]*)\],?$/gm)) {
  DEFS[m[1]] = m[2].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

// ---------- audio harness: recorder stubs, faithful _cxBeat composition ----------
const audioSeen = [];
Game.audio = {};
for (const parts of Object.values(DEFS)) for (const p of parts) {
  if (!Game.audio[p]) Game.audio[p] = ((nm) => function () { audioSeen.push('synth:' + nm); })(p);
}
// mirrors game.js audioEvent: record the beat name, then run the composition
Game.audioEvent = function (n) {
  audioSeen.push('event:' + n);
  if (typeof Game.audio[n] === 'function') { try { Game.audio[n](); } catch (e) {} }
};

// ---------- assertions ----------
let passN = 0, failN = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { passN++; }
  else { failN++; fails.push(name + (extra ? ' — ' + extra : '')); console.log(`   [FAIL] ${name}${extra ? ' — ' + extra : ''}`); }
}
function drain() { const l = Game.log || []; const s = l.map(x => x.text || x).join('\n'); l.length = 0; return s; }
async function freshRun() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = 15; Game.state.systemArrived = true;
  s.health = 500; s.maxHealth = 500; s.kcal = 2400; s.hydration = 100; s.trauma = 0;
  drain();
}
const OLD30 = ['pit', 'gauntlet', 'duel', 'drop', 'starve', 'moot', 'lies', 'cookfight', 'fetch', 'hide',
  'box', 'pattern', 'whoate', 'informant', 'calorie_run', 'pantry_raid', 'wheel', 'lottery', 'tithe', 'siege',
  'maw', 'oath', 'beastmaster', 'riddle', 'confession', 'honey', 'secrets', 'quiet', 'guest', 'vigil'];
// the six bespoke synth hooks: [contestId, phase kind, synth name]
const HOOKS = [
  ['tithe', 'Declare', 'altarCurdle'],
  ['starve', 'Escalate', 'hungerGnaw'],
  ['hide', 'Declare', 'predatorListen'],
  ['wheel', 'Escalate', 'teethTick'],
  ['quiet', 'Escalate', 'mindMoth'],
  ['riddle', 'Declare', 'engineVoices'],
];
const PICK_PAT = {
  brave: /aggress|charge|confront|attack|fight|strike|hold|stand your ground|impress|brave|bold|all in|push|trade blows/i,
  cautious: /hide|wait|surrender|flee|quiet|watch|study|still|look away|space|careful|safe|mercy|yield|dive/i,
};
function pickChoice(choices, persona) {
  if (persona === 'middle') return Math.floor((choices.length - 1) / 2);
  const pat = PICK_PAT[persona];
  const i = choices.findIndex(c => pat.test(c.label + ' ' + (c.sub || '')));
  return i >= 0 ? i : Math.floor((choices.length - 1) / 2);
}
// Drive the taken path to its end. Returns {outcome, logTail, stuck}.
function playToEnd(persona) {
  let logTail = '', guard = 0, stuck = false;
  while (Game.state.activeContest && Game.state.activeContest.phase !== 'done' && guard++ < 30) {
    const ac = Game.state.activeContest;
    const phase = ac.phases[ac.phaseIdx || 0];
    if (!phase || !(phase.choices || []).length) { stuck = true; break; }
    const res = Game.contestChoose(pickChoice(phase.choices, persona));
    const t = drain();
    if (t) logTail = t;
    if (res && res.done) return { outcome: res.outcome, logTail, stuck: false };
    // ARENA (Steve 2026-10-08): Blood contests suspend for real fights.
    // Simulate the fight(s) ending — this test verifies the sequence, not combat.
    if (res && res.arena) {
      let after = null, wguard = 0;
      while (Game.state.arenaContest && wguard++ < 5) {
        const arc = Game.state.arenaContest;
        Game.state.arenaContest = null;
        Game.tbfight = null;
        after = Game._contestArenaAfter(arc, 'won');
        if (after && after.done) break;
      }
      const t2 = drain();
      if (t2) logTail = t2;
      if (after && after.done) return { outcome: after.outcome, logTail, stuck: false };
      continue;
    }
    if (res === null) { stuck = true; break; }
  }
  return { outcome: null, logTail, stuck: stuck || guard >= 30 };
}
function contestBeatEvents(id) {
  const prefix = 'event:' + Game._cxB(id, '');
  return audioSeen.filter(e => e.startsWith(prefix)).map(e => e.slice(prefix.length));
}
function withRandom(v, fn) {
  const r = Math.random; Math.random = () => v;
  try { return fn(); } finally { Math.random = r; }
}
function allTexts(id) {
  const c = Game.contestPool().find(x => x.id === id);
  const phases = Game.contestPlayable(c);
  const texts = phases.map(p => p.text || '');
  const labels = phases.flatMap(p => (p.choices || []).map(ch => ch.label + ' ' + (ch.sub || '')));
  const notes = phases.flatMap(p => (p.choices || []).map(ch => (ch.do && ch.do.note) || ''));
  return { texts, labels, notes, phases };
}

(async () => {
  await Game.init();
  console.log('== CONTEST PLAY PROOF — SEED ' + SEED + ' ==');
  await freshRun(); // state (codex etc.) must exist before contestPlayable builds phases

  // ---------- ACT 0 — static wiring ----------
  console.log('\n-- ACT 0: beat wiring (static) --');
  for (const id of OLD30) {
    for (const kind of ['Declare', 'Escalate', 'Climax', 'Resolve']) {
      const name = Game._cxB(id, kind);
      ok(`${id}: CX_BEAT_DEFS has ${name}`, Array.isArray(DEFS[name]) && DEFS[name].length > 0);
    }
  }
  for (const [id, kind, synth] of HOOKS) {
    const name = Game._cxB(id, kind);
    ok(`hook ${id} ${kind} -> ${synth} wired in CX_BEAT_DEFS`, (DEFS[name] || []).includes(synth), JSON.stringify(DEFS[name]));
  }
  ok('contestChoice beat def exists (choice-screen beat)', Array.isArray(DEFS.contestChoice) && DEFS.contestChoice.length > 0);
  for (const id of OLD30) {
    const { phases } = allTexts(id);
    phases.forEach((p, i) => {
      ok(`${id} phase ${i} declares a beat`, !!p.beat, 'no beat');
      if (p.beat) ok(`${id} phase ${i} beat ${p.beat} is defined`, !!DEFS[p.beat], 'missing def');
    });
    ok(`${id}: no unreachable beat defs (duel-gap regression)`,
      ['Declare', 'Escalate', 'Climax'].every(k => phases.some(p => p.beat === Game._cxB(id, k))),
      'a beat def exists that no phase declares');
  }

  // ---------- ACT 1 — every contest, played end-to-end ----------
  console.log('\n-- ACT 1: play all 30, beats in order, hooks fire --');
  const personas = ['brave', 'cautious', 'middle'];
  let pi = 0;
  for (const id of OLD30) {
    const persona = personas[pi++ % 3];
    await freshRun();
    const contest = Object.assign({}, Game.contestPool().find(c => c.id === id), { givesChoice: false });
    audioSeen.length = 0;
    withRandom(0.99, () => Game.contestInterruption(contest, ['player'])); // grabbed, not choice
    drain();
    const r = playToEnd(persona);
    ok(`${id}: sequence terminates (no stuck modal)`, !r.stuck && (!Game.state.activeContest || Game.state.activeContest.phase === 'done'), 'stuck or unterminated');
    // beats fire in narrative order: indices strictly increasing
    const order = { Declare: 0, Escalate: 1, Climax: 2, Resolve: 3 };
    const evs = contestBeatEvents(id);
    const idxs = evs.map(e => order[e]).filter(x => x !== undefined);
    const inOrder = idxs.every((v, i) => i === 0 || v > idxs[i - 1]);
    ok(`${id}: beats fire in declare->escalate->climax->resolve order`, inOrder && idxs.length >= 2, evs.join(',') || 'no beats');
    ok(`${id}: resolve beat fires at the end`, evs.includes('Resolve'), evs.join(','));
    ok(`${id}: outcome is named in the log`, /YOU WIN|— over\.|did not come home|Death Reel|THE AUDIENCE|survived|is dead/i.test(r.logTail), 'tail: ' + r.logTail.slice(-120));
    const hook = HOOKS.find(h => h[0] === id);
    if (hook) {
      ok(`${id}: bespoke synth ${hook[2]} fires in-context at the ${hook[1]} beat`, audioSeen.includes('synth:' + hook[2]),
        'saw: ' + [...new Set(audioSeen)].join(','));
    }
    if (id === 'duel') {
      ok('duel: the missing middle is back — Escalate beat fires', evs.includes('Escalate'), evs.join(','));
    }
    console.log(`   ${id} (${persona}): outcome=${r.outcome || '?'} beats=${evs.join('>') || '—'}`);
  }

  // ---------- ACT 2 — judgments as assertions ----------
  console.log('\n-- ACT 2: fun/fear judgments (concrete) --');
  // escalate beats escalate: no phase repeats another's text
  for (const id of OLD30) {
    const { texts, phases } = allTexts(id);
    const distinct = new Set(texts.map(t => t.replace(/\s+/g, ' ').trim())).size === texts.length;
    ok(`${id}: every phase text is distinct (beats escalate, never repeat)`, distinct);
    const climax = phases[phases.length - 1];
    // Terminals: WIN/LOSE/DIE, plus the judged terminals (MOOT_JUDGE,
    // MAW_JUDGE resolve deterministically) and arena phases (Blood
    // pit/gauntlet/siege resolve via real fights — the climax is the
    // System's epitaph if the feed glitches).
    const hasTerminal = (climax.choices || []).some(c =>
      ['WIN', 'LOSE', 'DIE', 'MOOT_JUDGE', 'MAW_JUDGE'].includes(c.next));
    const isArena = (climax.choices || []).some(c => c.do && c.do.arena) ||
      ['pit', 'gauntlet', 'siege'].includes(id);
    ok(`${id}: the climax offers a terminal choice (resolve beats resolve)`,
      hasTerminal || isArena);
  }
  // voice distinctness: within a family, no two contests open the same way
  const fams = {};
  for (const id of OLD30) {
    const c = Game.contestPool().find(x => x.id === id);
    (fams[c.cat] = fams[c.cat] || []).push(id);
  }
  for (const [cat, ids] of Object.entries(fams)) {
    if (ids.length < 2) continue;
    const opens = ids.map(id => allTexts(id).texts[0].replace(/\s+/g, ' ').trim());
    ok(`family ${cat}: ${ids.join('/')} open distinctly`, new Set(opens).size === opens.length, 'two contests share an opening');
  }
  // wrong-fiction regressions (fixed 2026-10-08)
  {
    const lot = allTexts('lottery');
    const lotAll = [...lot.texts, ...lot.labels, ...lot.notes].join(' ');
    ok('lottery: no wheel-fiction in a token contest', !/wheel|teeth|pointer|\bspin\b/i.test(lotAll), (lotAll.match(/wheel|teeth|pointer|\bspin\b/i) || [])[0]);
    const pat = allTexts('pattern');
    const patAll = [...pat.texts, ...pat.labels, ...pat.notes].join(' ');
    ok('pattern: no box-fiction in a food-sequence contest', !/\bbox\b/i.test(patAll), (patAll.match(/\bbox\b/i) || [])[0]);
    const mootNotes = allTexts('moot').notes.join(' ');
    ok('moot: a jury trial, not a scanner room', !/scanner/i.test(mootNotes), (mootNotes.match(/scanner/i) || [])[0]);
    const liesNotes = allTexts('lies').notes.join(' ');
    ok('lies: the scanner stays in the scanner contest (positive control)', /scanner/i.test(liesNotes));
    const wheelAll = [...allTexts('wheel').texts, ...allTexts('wheel').notes].join(' ');
    ok('wheel: keeps its teeth (positive control)', /teeth/i.test(wheelAll));
  }
  // knowledge progression: veterans hear different beats
  for (const id of ['tithe', 'quiet', 'riddle', 'confession']) {
    await freshRun();
    const before = allTexts(id).texts.join('\n');
    Game.state.codex = Game.state.codex || {};
    Game.state.codex.contests = Game.state.codex.contests || {};
    Game.state.codex.contests[id] = { seen: 2, wins: 1, level: 2 };
    const after = allTexts(id).texts.join('\n');
    ok(`${id}: codex level 2 changes the beats (knowledge is shown)`, before !== after);
  }

  // ---------- ACT 3 — the choice screen ----------
  console.log('\n-- ACT 3: participate-or-refuse (the choice beat) --');
  await freshRun();
  audioSeen.length = 0;
  const tithe = Object.assign({}, Game.contestPool().find(c => c.id === 'tithe'), { givesChoice: true });
  Game.contestInterruption(tithe, ['player']);
  drain();
  const ac = Game.state.activeContest;
  ok('choice: the System offers participate-or-refuse', !!ac && (ac.phases[0].choices || []).some(c => /refuse/i.test(c.label)));
  ok('choice: the choice screen fires contestChoice, not the Declare beat', ac && ac.phases[0].beat === 'contestChoice', 'beat=' + (ac && ac.phases[0].beat));
  ok('choice: the bespoke declare sting does NOT fire on the choice screen', !audioSeen.includes('synth:altarCurdle'),
    [...new Set(audioSeen)].join(','));
  // participate: the real Declare beat fires exactly once for the whole run
  const parti = ac.phases[0].choices.findIndex(c => /participate/i.test(c.label));
  Game.contestChoose(parti); drain();
  const r2 = playToEnd('middle');
  const declareEvts = audioSeen.filter(e => e === 'event:contestTitheDeclare').length;
  const stingCount = audioSeen.filter(e => e === 'synth:altarCurdle').length;
  ok('choice: after Participate, the Declare beat fires exactly once (no double-sting)', declareEvts === 1 && stingCount === 1,
    `declare=${declareEvts} altarCurdle=${stingCount}`);
  ok('choice: the participated run terminates', !r2.stuck && (!Game.state.activeContest || Game.state.activeContest.phase === 'done'));
  // refuse: saying no is a sequence — Resolve fires, the bespoke sting never plays
  await freshRun();
  audioSeen.length = 0;
  const tithe2 = Object.assign({}, Game.contestPool().find(c => c.id === 'tithe'), { givesChoice: true });
  Game.contestInterruption(tithe2, ['player']);
  drain();
  const ac2 = Game.state.activeContest;
  const ri = ac2.phases[0].choices.findIndex(c => /refuse/i.test(c.label));
  const rr = Game.contestChoose(ri);
  const rtxt = drain();
  ok('refuse: refusal is a played sequence', /refus|say no|NOTED|galaxy/i.test(rtxt), 'len=' + rtxt.length);
  ok('refuse: the Resolve beat fires', audioSeen.includes('event:contestTitheResolve'), [...new Set(audioSeen)].join(','));
  ok('refuse: the bespoke sting never plays for a contest that never happened', !audioSeen.includes('synth:altarCurdle'));
  ok('refuse: the sequence ends cleanly', !Game.state.activeContest || Game.state.activeContest.phase === 'done' || (rr && rr.done));

  console.log(`\n== ${passN} pass, ${failN} fail ==`);
  if (fails.length) { console.log('\nFAILING:'); for (const f of fails) console.log('  · ' + f); process.exitCode = 1; }
  else console.log('ALL GREEN — the 30 older contests play end-to-end with beats that land.');
})();
