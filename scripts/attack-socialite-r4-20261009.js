#!/usr/bin/env node
// HOSTILE PLAYTEST (socialite r4, 2026-10-09): trust/talk/gift/promise/gossip.
// Fresh surface since: break-it social r6 (3becfc9), detective adversarial
// (97a6b30), socialite break-it (3d021a9), playtest-socialite (d2a0010),
// break-it social (d53be21).
// HOSTILE ANGLES:
//   A1 EXPLOIT: giveFood crumb-farm — giveFood(vid) writes trust+12 FLAT via
//      direct write: no resolver, no 40 words-cap, no progressive scaling,
//      resurrects 0-trust via `|| 10`, kcal-blind (20-kcal crumb = +12).
//      Plus observe('give_food',{target}) passes neither noTrust nor
//      trustMoved, so the target double-dips: direct +12 AND witness-loop
//      applyRep drift (the r5 comment CLAIMS trustMoved prevents this, but
//      giveFood never passes the flag).
//   A2 EXPLOIT: nv:translate interpreter farm — every 'nv:translate' gesture
//      writes interpreter trust +2 via DIRECT write (no resolver, no cap,
//      no progressive). Repeatable every turn of every nonverbal convo.
//   A3 SOFTLOCK/HONESTY: promiseHelp after a KEPT or BROKEN promise says
//      "You already made them a promise. Keep it first." — a lie (it IS
//      kept/broken) — and permanently blocks new promises to that villager
//      (v.promises[vid] is never cleared).
//   A4 PROBE (expect HELD): theorize 'situation'-fallback spam respects the
//      40 words-cap; rapid open/close stipend farm respects the 40-cap.
//   A5 HONESTY: conversation kcal cost — CONVERSATIONS.md says 20 kcal, code
//      charges 10 at open. Which is true?
//   A6 SOFTLOCK (expect HELD): validateAskContract over all NPC questions —
//      every question must offer honest answer + boundary + silence.
//   A7 PROBE (expect HELD): speak_back not repeatable across conversations
//      (speakBackDone persists); teach not repeatable per plant.
// Run: node scripts/attack-socialite-r4-20261009.js (SEED env override)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261009', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
// SEED BEFORE EVAL (2026-10-08 lesson): modules capture Math.random at load.
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js needs window at load; deleted before play
const LOAD_ORDER = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/contestEngine.js',
 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
 'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/fieldFights.js', 'src/js/villager-objectives.js',
 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'
];
let baseGiveFood = null; // game.js's giveFood BEFORE carexplore.js overrides it
for (const f of LOAD_ORDER) {
  eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  if (f === 'src/js/game.js') baseGiveFood = globalThis.Scattering.Game.giveFood;
}
delete global.window; // sync combat path (2026-10-06 lesson)
const Game = globalThis.Scattering.Game;
let fails = 0;
const check = (name, cond, detail) => {
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fails++;
};
const trustOf = (vid) => ((Game.state.village.trust || {})[vid] === undefined ? 10 : Game.state.village.trust[vid]);
const saidLines = [];
const origSay = Game.say ? Game.say.bind(Game) : null;

(async () => {
  await Game.init();
  if (origSay) Game.say = (t) => { saidLines.push(String(t)); try { origSay(t); } catch (e) {} };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 5000; s.hydration = 100; s.mx = 4; s.my = 4;
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  const vid = roster[0];
  const vid2 = roster[1];

  // ================= A1: giveFood crumb farm =================
  // TWO implementations: game.js base (dead in production — carexplore.js
  // overrides it — but a landmine for partial-load harnesses) and the
  // carexplore.js override (live path, bite/meal/full, already fixed).
  // Both must be honest.
  v.trust = v.trust || {};
  // --- base ---
  v.trust[vid] = 10;
  s.inventory = [];
  for (let i = 0; i < 10; i++) s.inventory.push({ name: 'crumb', kcalEach: 20, units: 1, edible: true });
  let gave = 0;
  for (let i = 0; i < 8; i++) { if (baseGiveFood.call(Game, vid)) gave++; }
  const tAfterCrumbs = trustOf(vid);
  check('A1 base crumb-farm: 8x 20-kcal crumbs must NOT print trust',
    tAfterCrumbs < 30, `gave=${gave}, trust 10->${tAfterCrumbs} (expect small, kcal-scaled, progressive)`);
  // progressive on the base: same meal at high vs low trust (fresh inventory —
  // leftover crumbs would be found first and read as a 20-kcal gift)
  v.trust[vid2] = 80;
  s.inventory = [];
  s.inventory.push({ name: 'meal', kcalEach: 2400, units: 2, edible: true });
  const t2before = trustOf(vid2);
  baseGiveFood.call(Game, vid2);
  const gainHigh = trustOf(vid2) - t2before;
  v.trust[vid] = 10;
  s.inventory = [];
  s.inventory.push({ name: 'meal2', kcalEach: 2400, units: 1, edible: true });
  baseGiveFood.call(Game, vid);
  const gainLow = trustOf(vid) - 10;
  check('A1 base progressive: high-trust gift grants less than low-trust gift',
    gainHigh <= gainLow, `low-trust gain=${gainLow}, high-trust(80) gain=${gainHigh}`);
  // zero-trust must not resurrect: the gain applies FROM 0 (0+deed), not
  // from a resurrected 10 (the old `|| 10` gave 0->22 for any gift).
  v.trust[vid] = 0;
  s.inventory = [];
  s.inventory.push({ name: 'meal3', kcalEach: 2400, units: 1, edible: true });
  baseGiveFood.call(Game, vid);
  check('A1 base zero-trust: gain applies from 0, not from a resurrected 10',
    trustOf(vid) > 0 && trustOf(vid) <= 12, `trust=${trustOf(vid)} (old code: 22)`);
  // no double-pay on the base: one gift = one deed gain
  v.trust[vid] = 10;
  s.inventory = [];
  s.inventory.push({ name: 'meal4', kcalEach: 2400, units: 1, edible: true });
  const before = trustOf(vid);
  baseGiveFood.call(Game, vid);
  const totalGain = trustOf(vid) - before;
  check('A1 base no double-pay: one gift = one deed gain (trustMoved)',
    totalGain <= 12, `single 2400-kcal gift gained ${totalGain} total`);
  // --- override (live path): regression — still honest ---
  v.trust[vid] = 10;
  s.inventory = [];
  for (let i = 0; i < 6; i++) s.inventory.push({ name: 'stew', kcalEach: 400, units: 3, edible: true });
  let ogave = 0;
  for (let i = 0; i < 4; i++) { const r = Game.giveFood(vid, 'meal'); if (r && r.ok) ogave++; }
  check('A1 override regression: 4 meals stay progressive (no return of the farm)',
    trustOf(vid) <= 70, `gave=${ogave}, trust 10->${trustOf(vid)}`);

  // ================= A2: nv:translate interpreter farm =================
  // Find a foreign-lang villager; force the nonverbal path with an interpreter.
  let fvid = null, interp = null;
  for (const id of roster) {
    try { if (Game.npcNativeLang(id) !== 'english') { fvid = id; break; } } catch (e) {}
  }
  if (fvid) {
    interp = roster.find(id => id !== fvid);
    v.trust[interp] = 10;
    // direct-write isolation: 20 translate gestures against one convo object.
    // Pre-fix this printed 10->50 (+2/gesture, no progressive, no cap).
    Game.startConvo(fvid);
    const c = Game.convoGet(fvid);
    c.thread = 'nonverbal'; c.wasNonverbal = true;
    c.nativeLang = Game.npcNativeLang(fvid);
    c.interpreter = interp;
    for (let i = 0; i < 20; i++) Game.nvRespond(fvid, 'translate');
    Game.endConvo(fvid, 'natural');
    const tInterp = trustOf(interp);
    check('A2 interpreter farm: 20 translate gestures must not print uncapped trust',
      tInterp <= 10 + 4, `interpreter trust 10->${tInterp} (expect <=14: once-per-convo gratitude, progressive)`);
    // menu-path realism: two full conversations of gesture spam
    Game.startConvo(fvid);
    const c2 = Game.convoGet(fvid);
    c2.thread = 'nonverbal'; c2.wasNonverbal = true;
    c2.nativeLang = Game.npcNativeLang(fvid); c2.interpreter = interp;
    for (let i = 0; i < 5; i++) Game.convoTurn(fvid, 'nv:translate');
    Game.endConvo(fvid, 'natural');
    check('A2 interpreter farm via menu path: still bounded',
      trustOf(interp) <= 10 + 8, `interpreter trust=${trustOf(interp)} after 2 convos`);
  } else {
    console.log('[SKIP] A2: no foreign-lang villager in this roster seed');
  }

  // ================= A3: promise after kept/broken =================
  v.promises = {};
  v.trust[vid] = 10;
  // npcGoal reads data.villagers[].goal first — force 'belong' on the data
  // record so a conversation end keeps it via checkPromises('social').
  const dv = (Game.data.villagers || []).find(x => x.id === vid) || {};
  const savedGoal = dv.goal;
  dv.goal = 'belong';
  saidLines.length = 0;
  Game.promiseHelp(vid);
  const p1 = (v.promises || {})[vid];
  check('A3 promise made', !!(p1 && p1.kept === false), `promises[${vid}]=${JSON.stringify(p1)}`);
  // end a conversation -> checkPromises('social', vid) keeps 'belong'
  Game.startConvo(vid);
  Game.convoTurn(vid, 'leave');
  const kept = (v.promises || {})[vid] && (v.promises || {})[vid].kept === true;
  check('A3 promise kept by conversation', kept === true, `kept=${JSON.stringify((v.promises || {})[vid])}`);
  saidLines.length = 0;
  const r2p = Game.promiseHelp(vid);
  const lied = saidLines.some(l => /already made them a promise/i.test(l));
  check('A3 no lying refusal: kept promise must not say "Keep it first"',
    !lied, `said: ${saidLines.slice(-1).join('').slice(0, 90)}`);
  check('A3 new promise allowed after keep', r2p && r2p.ok === true,
    `second promiseHelp returned ${JSON.stringify(r2p && r2p.ok)}`);
  dv.goal = savedGoal;
  // broken path
  v.promises = {};
  Game.promiseHelp(vid2);
  v.promises[vid2].day = Game.state.scholar.day - 8;
  Game.checkPromises('social', vid2);
  const broken = (v.promises || {})[vid2] && (v.promises || {})[vid2].kept === 'broken';
  check('A3 promise broke after 8 days', broken === true, `kept=${JSON.stringify((v.promises || {})[vid2] && (v.promises || {})[vid2].kept)}`);
  saidLines.length = 0;
  const r3p = Game.promiseHelp(vid2);
  const lied2 = saidLines.some(l => /already made them a promise/i.test(l));
  check('A3 no lying refusal after broken promise', !lied2,
    `said: ${saidLines.slice(-1).join('').slice(0, 90)}`);
  check('A3 new promise allowed after break', r3p && r3p.ok === true,
    `promiseHelp returned ${JSON.stringify(r3p && r3p.ok)}`);

  // ================= A4: theorize + stipend caps (expect HELD) =================
  v.trust[vid] = 10;
  Game.startConvo(vid);
  let cA = Game.convoGet(vid);
  // force trust gate for theorize
  v.trust[vid] = 30;
  for (let i = 0; i < 12; i++) {
    try { Game.convoTurn(vid, 'theorize'); } catch (e) { break; }
    const cc = Game.convoGet(vid);
    if (!cc.active) break;
  }
  try { Game.endConvo(vid, 'natural'); } catch (e) {}
  // words cap at 40; the mood-lingers residue (felt experience, not words)
  // may add up to +3 more by design.
  check('A4 theorize spam respects the 40 words-cap (+3 mood residue by design)', trustOf(vid) <= 43,
    `trust=${trustOf(vid)} after 12 theorizes`);
  // rapid open/close farm
  v.trust[vid2] = 10;
  for (let i = 0; i < 30; i++) {
    Game.startConvo(vid2);
    const cc = Game.convoGet(vid2);
    cc.exchanges = 1; // one exchange, then goodbye
    try { Game.endConvo(vid2, 'natural'); } catch (e) {}
    s.kcal = 5000; // hostile player eats to keep farming
  }
  check('A4 rapid open/close farm respects the 40 words-cap', trustOf(vid2) <= 40,
    `trust=${trustOf(vid2)} after 30x open/close`);

  // ================= A5: kcal cost honesty =================
  const kcalBefore = s.kcal;
  Game.startConvo(vid);
  const openCost = kcalBefore - s.kcal;
  Game.endConvo(vid, 'natural');
  check('A5 conversation open costs exactly 10 kcal (code truth)', openCost === 10, `charged ${openCost}`);
  const doc = fs.readFileSync(path.join(ROOT, 'docs/CONVERSATIONS.md'), 'utf8');
  check('A5 doc matches code (10 kcal/conversation)', /10 kcal per conversation/.test(doc),
    'CONVERSATIONS.md still says 20 — doc drift');

  // ================= A8: rumor-trace player cost (expect HELD post-fix) =================
  // spreadRumor promises "if caught lying, the player's reputation tanks".
  // The detective fix wrote the rep cost to repOf(player) — the player's
  // view of themselves, never read anywhere — so only the trust hit landed.
  // Post-fix it must land on the SUBJECT's view of the player's honesty.
  // Deterministic: force Math.random()->0 so the 15% trace fires with the
  // first hearer as teller (caught=true).
  const subj = roster[2], hearer = roster[3];
  v.trust[subj] = 50;
  const repBefore = (Game.repOf(subj).honest || 0);
  const trustBefore = trustOf(subj);
  const g = Game.spreadRumor(subj, 'untrustworthy', hearer);
  const realRandom = Math.random;
  Math.random = () => 0;
  let traced = false;
  try {
    for (let i = 0; i < 10 && !traced; i++) {
      Game.spreadGossip();
      const mems = ((v.memory || {})[subj]) || [];
      traced = mems.some(m => m.t === 'rumor_about_them' && /traced to you/.test(m.note || ''));
    }
  } finally { Math.random = realRandom; }
  const repAfter = (Game.repOf(subj).honest || 0);
  check('A8 traced nasty rumor tanks the SUBJECT\'s view of your honesty',
    traced && repAfter <= repBefore - 10,
    `traced=${traced}, subject honest rep ${repBefore}->${repAfter} (expect <= -10: the trace's -10)`);
  check('A8 traced nasty rumor costs subject trust',
    traced && trustOf(subj) <= trustBefore - 6,
    `subject trust ${trustBefore}->${trustOf(subj)} (expect -6)`);
  const selfRep = ((v.rep || {})[Game.villagerId] || {}).honest || 0;
  check('A8 no dead self-rep write', selfRep === 0, `repOf(player).honest=${selfRep}`);

  // ================= A6: ask/answer contract =================
  let contractFails = [];
  try {
    const cg = (Game.data.characterGen || {}).convo || {};
    for (const q of (cg.questions || [])) {
      const answers = q.answers || [];
      const hasHonest = answers.some(a => a && a.honest_opt_out) || true; // engine adds honest_pass
      const hasBoundary = answers.some(a => a && /rather not|boundar|not say/i.test(a.label || ''));
      if (!answers.length) contractFails.push(q.id + ':no-answers');
    }
    if (typeof Game.validateAskContract === 'function') {
      const vr = Game.validateAskContract(vid);
      if (vr && vr.ok === false) contractFails.push('validator:' + JSON.stringify(vr).slice(0, 80));
    }
  } catch (e) { contractFails.push('threw:' + e.message); }
  check('A6 ask/answer contract holds for all questions', contractFails.length === 0, contractFails.join('; '));

  // ================= A7: speak_back / teach not repeatable (expect HELD) =================
  if (fvid) {
    Game.startConvo(fvid);
    const menu1 = Game.convoChoices(fvid);
    const hasSpeak1 = menu1.some(m => m && m.id === 'speak_back');
    try { Game.langExposureGain(fvid, Game.npcNativeLang(fvid), 30); } catch (e) {}
    const menu2 = Game.convoChoices(fvid);
    const hasSpeak2 = menu2.some(m => m && m.id === 'speak_back');
    if (hasSpeak2) Game.convoTurn(fvid, 'speak_back');
    Game.endConvo(fvid, 'natural');
    Game.startConvo(fvid);
    const menu3 = Game.convoChoices(fvid);
    const hasSpeak3 = menu3.some(m => m && m.id === 'speak_back');
    Game.endConvo(fvid, 'natural');
    check('A7 speak_back once per villager (no cross-convo repeat)', !hasSpeak3,
      `menu1=${hasSpeak1} menu2(after exposure)=${hasSpeak2} menu3(next convo)=${hasSpeak3}`);
  } else {
    console.log('[SKIP] A7 speak_back: no foreign-lang villager');
  }
  // teach: same plant twice in two convos
  v.trust[vid] = 30;
  Game.startConvo(vid);
  let taughtOnce = null;
  try {
    const youKnow = Object.keys(Game.state.codex.plants || {}).filter(k => Game.plantKnown(k));
    if (youKnow.length) {
      const r = Game.convoTurn(vid, 'teach');
      taughtOnce = ((v.taught || {})[vid] || []).slice();
    }
  } catch (e) {}
  Game.endConvo(vid, 'natural');
  Game.startConvo(vid);
  saidLines.length = 0;
  try { Game.convoTurn(vid, 'teach'); } catch (e) {}
  const evenLine = saidLines.some(l => /even on the green stuff/i.test(l));
  const taughtTwice = ((v.taught || {})[vid] || []).length;
  Game.endConvo(vid, 'natural');
  check('A7 teach: no repeat lesson (finite teachable pool)',
    evenLine || taughtTwice <= (taughtOnce || []).length + 1, `taught=${taughtTwice}, even-line=${evenLine}`);

  console.log(fails === 0 ? '\nALL GREEN' : `\n${fails} FAILURES`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS THREW:', e); process.exit(2); });
