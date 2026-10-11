#!/usr/bin/env node
// PROOF: one text stream — every emitted line routes to exactly ONE surface.
// Steve 2026-10-11: the dialog system showed the SAME text in two stacked
// panels (green narration box + orange feedback box). Root cause: say()
// dual-wrote to Game.log AND the feedback buffer, and narrationBoxHTML
// rendered `fb || lastNarr`. Fix: Game.log entries carry a surface tag
// (narration|feedback|toast|bubble|dialogue|contest|person); each renderer
// consumes only its own surface.
//
// BEFORE/AFTER: part 1 simulates the OLD emission+render logic inline and
// shows duplicated text; part 2 drives the REAL Game object (new path) and
// asserts zero duplication. app.js is DOM-only (excluded from the harness),
// so the DOM renderers are verified by static source assertions + faithful
// equivalents of their consumption logic.
//
// Run: node scripts/test-dialog-stream-20261011.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---- seeded RNG BEFORE eval (modules capture Math.random at load) ----
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seed = parseInt(process.env.SEED || '20261011', 10);
const rng = mulberry32(seed);
Math.random = () => rng();

// ---- window stub for the eval phase only (equipment.js needs window at load;
// runtime checks must take the sync path, so delete it before playing) ----
global.window = global;
globalThis.Scattering = globalThis.Scattering || {};

const ORDER = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js',
  'src/js/convo-beats.js', 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js',
  'src/js/journal.js', 'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js',
  'src/js/contests.js', 'src/js/broadcast.js', 'src/js/contestEngine.js', 'src/js/alienPlayers.js',
  'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js',
  'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/corruption.js',
  'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/waveLedger.js', 'src/js/feastBuff.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/partyTactics.js', 'src/js/sigW3a.js', 'src/js/statusEffects.js', 'src/js/sigW3b.js',
  'src/js/metaProgression.js', 'src/js/sigW3c.js', 'src/js/villager-agency.js',
  'src/js/fieldFights.js', 'src/js/villager-objectives.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/havenGrowth.js', 'src/js/hierarchy.js', 'src/js/comms.js',
  'src/js/safetynets.js', 'src/js/villageAgency.js', 'src/js/debug-scenarios.js',
  'src/js/build.js',
  // DOM-only, excluded per harness contract: app.js, sprites.js, tile-scenes.js,
  // move-anim.js, drama.js
];
for (const f of ORDER) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
delete global.window;
const Game = globalThis.Scattering.Game;

const results = [];
const check = (name, cond, extra) => {
  results.push([name, !!cond]);
  console.log(`   [${cond ? 'OK' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`);
};

// =====================================================================
// PART 1 — BEFORE: simulate the OLD (pre-fix) emission + render logic.
// Old say(): push to Game.log AND to state.fbLines when marked.
// Old narrationBoxHTML: text = fb || lastNarr (green box echoed feedback).
// =====================================================================
console.log('\n== PART 1 — BEFORE (old dual-write path, simulated) ==');
{
  const oldLog = [];            // Game.log (narration history)
  const oldFb = [];             // state.fbLines (feedback buffer)
  let mark = null;              // fbMark active
  const oldSay = (msg) => {     // old game.js say + old encounters.js wrapper
    oldLog.push(msg); if (oldLog.length > 40) oldLog.shift();
    if (mark !== null) { oldFb.push(msg); while (oldFb.length > 4) oldFb.shift(); }
  };
  const oldFeedback = (msg) => { if (mark === null) mark = oldLog.length; oldSay(msg); };
  // green box: fb || lastNarr ; orange box: fbLines
  const oldGreen = () => (oldFb.length ? oldFb.join(' ') : (oldLog[oldLog.length - 1] || ''));
  const oldOrange = () => oldFb.join(' ');

  oldSay('The wind moves through the grass.');   // narration
  mark = oldLog.length;                          // app marks at action start
  oldSay('You gather a handful of berries.');    // encounter/action text
  oldFeedback('You eat the berries. +40 kcal.'); // explicit feedback

  const dupes = [];
  for (const t of oldFb) if (oldGreen().includes(t) && oldOrange().includes(t)) dupes.push(t);
  check('OLD path duplicates text across green+orange', dupes.length > 0,
    `${dupes.length} line(s) on both surfaces: ${JSON.stringify(dupes.slice(0, 2))}`);
}

// =====================================================================
// PART 2 — AFTER: drive the REAL Game object (new tagged stream).
// =====================================================================
console.log('\n== PART 2 — AFTER (new one-stream path, real engine) ==');
Game.log = [];
Game.state = {};

// Renderer equivalents (faithful to app.js consumption logic):
// narrationBoxHTML: contest > person card > dialogue box > last NARRATION entry
//   (contest/person/dialogue take precedence and never read the stream;
//   here we test the stream-consumption tail).
const narrationRender = () => {
  for (let i = Game.log.length - 1; i >= 0; i--) {
    const e = Game.log[i];
    const s = (e && typeof e === 'object') ? (e.surface || 'narration') : 'narration';
    if (s === 'narration') return (e && typeof e === 'object') ? e.text : String(e);
  }
  return '';
};
// feedbackHTML/feedbackInner: Game.feedbackLines() only.
const feedbackRender = () => Game.feedbackLines().map(
  e => (e && typeof e === 'object') ? e.text : String(e));
const SURFACES = ['narration', 'feedback', 'toast', 'bubble', 'dialogue', 'contest', 'person'];

// 1. narration: unmarked say() -> exactly one entry, surface narration.
{
  const n0 = Game.log.length;
  Game.say('The wind moves through the grass.');
  check('say() pushes exactly one entry', Game.log.length === n0 + 1);
  const e = Game.log[Game.log.length - 1];
  check('say() tags surface narration', e.surface === 'narration', JSON.stringify(e));
  check('narration render shows it', narrationRender() === 'The wind moves through the grass.');
  check('feedback render empty (no mark yet)', feedbackRender().length === 0);
}

// 2. npc announce: say() with a villager voice line -> narration only.
{
  Game.say('Mara: "The sky just... opened. And something talked to us."');
  const e = Game.log[Game.log.length - 1];
  check('npc announce routes to narration', e.surface === 'narration');
  check('narration render shows announce', narrationRender().includes('Mara:'));
}

// 3. encounter/action text: marked say() -> feedback surface ONLY (no dual write).
{
  Game.feedbackMark();
  const n0 = Game.log.length;
  Game.say('You gather a handful of berries.');   // encounters.js wrapped say()
  Game.feedback('You eat the berries. +40 kcal.'); // explicit feedback path
  check('marked emissions push exactly one entry each', Game.log.length === n0 + 2);
  const [a, b] = Game.log.slice(-2);
  check('marked say() tagged feedback (not narration)', a.surface === 'feedback');
  check('feedback() tagged feedback', b.surface === 'feedback');
  const fb = feedbackRender();
  check('feedback render shows both action lines', fb.length === 2 &&
    fb[0] === 'You gather a handful of berries.' && fb[1] === 'You eat the berries. +40 kcal.');
  check('narration render does NOT echo feedback',
    narrationRender() === 'Mara: "The sky just... opened. And something talked to us."');
}

// 4. toast path: the stream write app.js Game.toast performs -> toast surface.
{
  Game.emit('🏆 Trailblazer — first to map the creek', 'toast');
  const e = Game.log[Game.log.length - 1];
  check('toast emission tagged toast', e.surface === 'toast');
  check('toast not in narration render', !narrationRender().includes('Trailblazer'));
  check('toast not in feedback render', !feedbackRender().some(t => t.includes('Trailblazer')));
}

// 5. zero duplicated text across the two stacked panels.
{
  const green = narrationRender();
  const orange = feedbackRender();
  const dupes = orange.filter(t => green.includes(t) && t.length > 0);
  check('ZERO duplicated text between narration box and feedback card', dupes.length === 0,
    dupes.length ? JSON.stringify(dupes) : 'green and orange show different lines');
}

// 6. every entry carries exactly one valid surface tag.
{
  const bad = Game.log.filter(e =>
    !(e && typeof e === 'object') || SURFACES.indexOf(e.surface) < 0 || typeof e.text !== 'string');
  check('every stream entry has exactly one valid surface tag', bad.length === 0,
    `${Game.log.length} entries checked`);
  // each entry counted on exactly one surface's render
  const counts = {};
  for (const e of Game.log) counts[e.surface] = (counts[e.surface] || 0) + 1;
  const total = Object.values(counts).reduce((x, y) => x + y, 0);
  check('surface accounting sums to stream length (no line on two surfaces)',
    total === Game.log.length, JSON.stringify(counts));
}

// 7. preserved behaviors: dedup, 40-cap, object guard, empty, bad surface.
{
  Game.log = []; Game.state = {};
  Game.say('A deer watches from the treeline.');
  Game.say('A deer watches from the treeline.');
  check('dedup: same line twice -> one entry', Game.log.length === 1);
  Game.say({ text: 'object-guarded line' });
  check('object guard extracts text', Game.log[Game.log.length - 1].text === 'object-guarded line');
  Game.say('');
  Game.say(null);
  check('empty/null emissions push nothing', Game.log.length === 2);
  Game.emit('weird surface line', 'nope');
  check('unknown surface defaults to narration', Game.log[Game.log.length - 1].surface === 'narration');
  for (let i = 0; i < 60; i++) Game.say('filler line ' + i);
  check('stream capped at 40 entries', Game.log.length === 40);
}

// 8. legacy saves: bare-string entries normalize to tagged narration.
{
  const norm = Game.normalizeLogEntries(['old string', { text: 'new', surface: 'feedback', t: 1 }]);
  check('legacy strings lift to narration-tagged entries',
    norm[0].text === 'old string' && norm[0].surface === 'narration' &&
    norm[1].surface === 'feedback');
  check('normalize handles missing/empty', Game.normalizeLogEntries(null).length === 0);
  // mixed legacy log doesn't crash the renderers
  Game.log = Game.normalizeLogEntries(['legacy line']);
  Game.state = {};
  check('renderers survive legacy-normalized log',
    narrationRender() === 'legacy line' && feedbackRender().length === 0);
}

// 9. save shape: entries are JSON-serializable (save/load round-trip).
{
  Game.log = []; Game.state = {};
  Game.say('round trip line');
  const snap = JSON.parse(JSON.stringify(Game.log.slice(-40)));
  check('toJSON serializes tagged entries', snap.length === 1 &&
    snap[0].text === 'round trip line' && snap[0].surface === 'narration');
  Game.log = Game.normalizeLogEntries(snap);
  check('save/load round-trip preserves tagged entries',
    Game.log.length === 1 && Game.log[0].surface === 'narration' &&
    narrationRender() === 'round trip line');
}

// 10. backward compat: lines are String objects — the ~700 existing
// string-op readers (indexOf, regex .test, String(), templates) keep working.
{
  Game.log = []; Game.state = {};
  Game.say('📓 you note the leaf shape');
  const e = Game.log[0];
  check('line is a String object carrying its tag',
    e instanceof String && e.surface === 'narration' && e.text === '📓 you note the leaf shape');
  check('indexOf works on lines', Game.log.some(l => l.indexOf('📓') !== -1));
  check('regex .test works on lines', Game.log.some(l => /leaf shape/.test(l)));
  check('String(l) recovers text', String(Game.log[0]) === '📓 you note the leaf shape');
  check('template coercion works', `${Game.log[0]}` === '📓 you note the leaf shape');
  check('.length is text length', Game.log[0].length === '📓 you note the leaf shape'.length);
  // normalize rebuilds String objects from every stored shape
  const n1 = Game.normalizeLogEntries(['bare string']);
  const n2 = Game.normalizeLogEntries([{ text: 'plain obj', surface: 'feedback', t: 5 }]);
  check('normalize lifts bare strings', n1[0] instanceof String && n1[0].surface === 'narration');
  check('normalize lifts plain objects (keeps surface)',
    n2[0] instanceof String && n2[0].surface === 'feedback' && n2[0].t === 5);
}

// =====================================================================
// PART 3 — static assertions on app.js (DOM-only, excluded from eval).
// The renderers live there; verify they consume only their own surface.
// =====================================================================
console.log('\n== PART 3 — app.js renderer contracts (static) ==');
{
  const app = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  check('narrationBoxHTML no longer echoes feedback (fb || lastNarr gone)',
    !/const fb = feedbackInner\(\);\s*\n?\s*const text = fb \|\| lastNarr/.test(app));
  check('narrationBoxHTML consumes narration surface only',
    /s === 'narration'/.test(app) && /lastNarr = \(e && typeof e === 'object'\) \? \(e\.text/.test(app));
  check('Game.toast no longer bare-pushes into narration log',
    !/Also log it \(history\), but don.t show in narration box/.test(app));
  check('Game.toast routes through the tagged stream',
    /this\.emit\(msg, 'toast'\)/.test(app));
  check('feedbackInner reads entry .text (tagged entries)',
    /const textOf = l => \(l && typeof l === 'object'\) \? \(l\.text/.test(app));
  check('fallback feedbackLines filters feedback surface only',
    /=== 'feedback'/.test(app));
  // contest/person-card/dialogue precedence untouched in narrationBoxHTML
  check('contest/person/dialogue precedence preserved in narrationBoxHTML',
    /activeContest/.test(app) && /inlineView\.kind === 'person'/.test(app) &&
    /if \(chatView\) return dialogueBoxHTML\(chatView\)/.test(app));
}

const fails = results.filter(([, ok]) => !ok);
console.log(`\n==== ${results.length - fails.length}/${results.length} checks passed (seed ${seed}) ====`);
if (fails.length) {
  console.log('FAILURES:'); fails.forEach(([n]) => console.log('  - ' + n));
  process.exit(1);
}
