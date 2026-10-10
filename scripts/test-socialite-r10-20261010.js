// PROOF TEST: socialite adversarial r10 (2026-10-10) — comfort-spam farm,
// pendingQ leave/reopen dead-end, 10-kcal charge honesty, rumor noTrust
// regression, rumor-target dangling.
// FAILS on broken code (see header notes), PASSES on held/clean behavior.
// Run: node scripts/test-socialite-r10-20261010.js (SEED=... optional)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261010', 10);
function mulberry32(seed) {
  let s = seed >>> 0;
  const f = function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.reset = (ns) => { s = ns >>> 0; };
  return f;
}
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js', 'src/js/drama.js']);
[...html.matchAll(/src\/js\/[^\/"]+\.js|src\/js\/engine\/[^\/"]+\.js/g)].map(m => m[0]).filter(f => !SKIP.has(f))
  .forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

let A = 0, F = 0;
function ok(cond, msg, extra) { A++; if (!cond) { F++; console.log('  FAIL:', msg, extra || ''); } }

function freshState() {
  Game.state.scholar.kcal = 2000;
  Game.state.scholar.day = 5;
  Game.state.village.grief = 0;
  Game.state.village.gossip = [];
  Game.state.village.trust = Game.state.village.trust || {};
  for (const id of Game.state.village.roster) Game.state.village.trust[id] = 10;
}

function openTalk(vid) {
  const said = [];
  const origSay = Game.say;
  Game.say = (t) => { said.push(String(t)); };
  const r = Game.startConvo(vid);
  Game.say = origSay;
  return { r, said };
}
function endNatural(vid) {
  Game.endConvo(vid, 'natural');
}
function pickChoice(vid, ids) {
  const choices = Game.convoChoices(vid) || [];
  const cids = choices.map(c => c.id);
  return ids.find(id => cids.includes(id)) || null;
}

(async () => {
  await Game.init();
  Game.debugScenario('day1');
  Game.say = function () {}; Game.save = function () {};
  const v = Game.state.village;
  const vid = v.roster.filter(id => id !== Game.villagerId)[0];

  // ===== ATTACK 1 (EXPLOIT): comfort/empathize spam farm =====
  // Hostile: force grief mood, tap "Are you okay?" / "That sounds really
  // hard." every turn. +2 trust +1 mood per tap. Question: does the 40
  // talk-cap hold, and is the menu still offering comfort forever?
  freshState();
  v.grief = 1; // everyone grieving -> feeling/grief menus
  let comfortTaps = 0, offeredCount = 0, turns = 0;
  for (let ci = 0; ci < 4; ci++) {
    openTalk(vid);
    for (let e = 0; e < 8; e++) {
      const pick = pickChoice(vid, ['dlg:comfort', 'dlg:empathize']);
      if (!pick) break;
      offeredCount++;
      Game.convoTurn(vid, pick);
      comfortTaps++;
      turns++;
    }
    endNatural(vid);
  }
  v.grief = 0;
  const tAfter = v.trust[vid];
  ok(comfortTaps > 0, 'comfort offered in grief menus', comfortTaps);
  ok(tAfter <= 40, 'comfort-spam respects the 40 words-cap', tAfter);
  console.log(`  [A1] ${comfortTaps} comfort/empathize taps over 4 convos -> trust ${tAfter.toFixed(1)} (cap 40)`);

  // ===== ATTACK 2 (SOFTLOCK): leave with pendingQ, reopen =====
  // Hostile: get asked a question, dodge with leave, reopen. The question
  // must resurface as an 'unanswered' open thread or lapse honestly —
  // never a stuck menu, never a silently dropped beat, never an exception.
  freshState();
  openTalk(vid);
  let c = Game.convoGet(vid);
  c.pendingQ = { q: 'Where are you from, really?', minTrust: 0 };
  c.genericQ = { q: 'Where are you from, really?', followedUp: false };
  let threw = false;
  try {
    Game.endConvo(vid, 'left');
  } catch (e) { threw = true; console.log('  endConvo(left) threw:', e.message); }
  ok(!threw, 'endConvo with pendingQ does not throw');
  let reopened = null;
  try {
    reopened = Game.startConvo(vid);
    const menu = Game.convoChoices(vid) || [];
    ok(menu.length > 0, 'menu builds after leave/reopen with pendingQ', menu.length);
    ok(!reopened.ended, 'convo is active after reopen');
    endNatural(vid);
  } catch (e) { ok(false, 'reopen after pendingQ-leave threw: ' + e.message); }
  // also verify a SECOND leave/reopen cycle doesn't wedge
  try {
    Game.startConvo(vid);
    const menu2 = Game.convoChoices(vid) || [];
    ok(menu2.length > 0, 'menu builds on second reopen', menu2.length);
    Game.endConvo(vid, 'left');
  } catch (e) { ok(false, 'second reopen threw: ' + e.message); }
  console.log('  [A2] pendingQ leave/reopen: no throw, menus build');

  // ===== ATTACK 3 (HONESTY): the 10-kcal open charge =====
  // The engine charges 10 kcal per conversation open. Steve's rule: no
  // silent actions -- the cost must be disclosed, on the button (app.js
  // person sheet, the single entry point) and once in-fiction on first open.
  freshState();
  delete Game.state.scholar.talkCostTold;
  const kcalBefore = Game.state.scholar.kcal;
  const { said } = openTalk(vid);
  const kcalAfter = Game.state.scholar.kcal;
  Game.endConvo(vid, 'left');
  ok(kcalBefore - kcalAfter === 10, 'open charges exactly 10 kcal', kcalBefore - kcalAfter);
  const disclosedInNarration = said.some(t => /kcal/i.test(t));
  ok(disclosedInNarration, 'first open narrates the cost', JSON.stringify(said.filter(t => /kcal/i.test(t))));
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const talkLabels = (appSrc.match(/Talk(?: again)?[^'`\n]*10 kcal[^'`\n]*/g) || []);
  const labelDiscloses = talkLabels.some(l => /kcal/i.test(l));
  ok(labelDiscloses, 'Talk button names the cost', JSON.stringify(talkLabels));
  // second open stays silent -- the cost is priced into the habit now
  const { said: said2 } = openTalk(vid);
  Game.endConvo(vid, 'left');
  ok(!said2.some(t => /kcal/i.test(t)), 'repeat opens do not re-narrate', JSON.stringify(said2.filter(t => /kcal/i.test(t))));
  console.log('  [A3] charge =', kcalBefore - kcalAfter, 'kcal; first-open narrated:', disclosedInNarration, '; button:', JSON.stringify(talkLabels));

  // ===== ATTACK 4 (EXPLOIT regression): rumor about NPC moves REP not TRUST =====
  // r6 2026-10-09 pinned: rumors move REP only. Replay: 'generous' rumor
  // about X, run spreadGossip, assert X's trust-of-player unchanged while
  // X's rep moved.
  freshState();
  const x = v.roster.filter(id => id !== Game.villagerId && id !== vid)[0];
  v.trust[x] = 25;
  const repBefore = (Game.repOf(x).generous || 0);
  Game.state.scholar.day = 6;
  Game.dayPart = 'morning';
  const g = Game.spreadRumor(x, 'generous', vid);
  ok(!!g, 'rumor seeded');
  // force the full gossip path deterministically: every teller tells
  // (Math.random()=0 always beats the tell rate). This also forces the
  // lie-trace (0.15 roll passes) — verifying the trace is the ONLY trust
  // mover for player rumors (r6).
  const savedRand = Math.random;
  Math.random = () => 0;
  const heardBefore = g.heard.length;
  for (let p = 0; p < 3; p++) Game.spreadGossip();
  Math.random = savedRand;
  const trustAfter = v.trust[x];
  const repAfter = (Game.repOf(x).generous || 0);
  const trustDelta = trustAfter - 25;
  ok(g.heard.length > heardBefore, 'rumor spread to new hearers', `${heardBefore} -> ${g.heard.length}`);
  ok(trustDelta <= 0 && trustDelta >= -2 * 3, 'rumor never pays trust to the subject (r6 holds; trace may cost)', `delta ${trustDelta}`);
  ok(repAfter > repBefore, 'rumor still moves rep (mechanic intact)', `${repBefore} -> ${repAfter}`);
  console.log(`  [A4] hearers ${heardBefore} -> ${g.heard.length}, trust delta ${trustDelta}, generous-rep ${repBefore} -> ${repAfter.toFixed(1)}`);

  // ===== ATTACK 5 (SOFTLOCK): leave mid rumor-target-selection, reopen =====
  // Hostile: start spread_rumor, pick target, leave before type. Reopen:
  // menu must build, rumor state must reset (no dangling "who?").
  freshState();
  Game.state.scholar.day = 7;
  // the rumor verb is trust-gated — a new-met stranger can't start rumors
  v.trust[vid] = 30;
  openTalk(vid);
  let threw5 = false;
  try {
    // drive to the rumor target-selection via askAbout-style topic path
    const ids = (Game.convoChoices(vid) || []).map(x => x.id);
    // find the subject menu / rumor entry
    let pick = pickChoice(vid, ['dlg:subject']);
    if (pick) Game.convoTurn(vid, pick);
    let ids2 = (Game.convoChoices(vid) || []).map(x => x.id);
    // an NPC question may preempt the subject menu — answer it, then re-open subjects
    const gq = ids2.find(i => i.indexOf('gq:') === 0);
    if (gq) {
      Game.convoTurn(vid, gq);
      const sub2 = pickChoice(vid, ['dlg:subject']);
      if (sub2) Game.convoTurn(vid, sub2);
      ids2 = (Game.convoChoices(vid) || []).map(x => x.id);
    }
    console.log('  [A5] subject menu ids:', ids2.join(','));
    const rumorEntry = ids2.find(i => i === 'ask:spread_rumor');
    console.log('  [A5] rumor menu entry found:', !!rumorEntry, rumorEntry || '');
    if (rumorEntry) {
      Game.convoTurn(vid, rumorEntry);
      const ids3 = (Game.convoChoices(vid) || []).map(x => x.id);
      const tgt = ids3.find(i => i.indexOf('rumor:tgt:') === 0);
      console.log('  [A5] rumor target choice found:', !!tgt);
      if (tgt) {
        Game.convoTurn(vid, tgt);
        // verify we are at type-selection (dangling state)
        const cMid = Game.convoGet(vid);
        console.log('  [A5] mid-flow: thread=' + cMid.thread + ' rumorTarget=' + cMid.rumorTarget);
      }
    }
    Game.endConvo(vid, 'left');
    Game.startConvo(vid);
    const menu5 = Game.convoChoices(vid) || [];
    ok(menu5.length > 0, 'menu builds after mid-rumor leave/reopen', menu5.length);
    const dangling = (Game.convoChoices(vid) || []).some(x => (x.id || '').indexOf('rumor:type:') === 0);
    ok(!dangling, 'no dangling rumor-type menu after reopen', dangling);
    Game.endConvo(vid, 'left');
  } catch (e) { threw5 = true; ok(false, 'rumor-dangle flow threw: ' + e.message); }
  ok(!threw5, 'mid-rumor leave/reopen does not throw');
  console.log('  [A5] mid-rumor leave/reopen: no throw, menus build');

  // ===== ATTACK 6 (design pin): expedition-return leadership drip =====
  // The returner's trust of the player rises +1 (progressive) when their
  // expedition comes home with food. This is the leadership-drip class
  // (same as assigned-task completions and forage returns): NPC labor
  // validating the player's leadership, NOT words — so the 40 words-cap
  // does not apply, but progressive scaling does (devotion isn't a grind).
  // It is not player-farmable: returns happen on the world's schedule.
  // Pinned so future loops don't re-litigate it as a cap bypass.
  freshState();
  const ev = v.roster.filter(id => id !== Game.villagerId && id !== vid)[0];
  v.trust[ev] = 40;
  const ag = Game.agencyState();
  ag.exped[ev] = { dist: 2, finds: [{ kcal: 120 }], encounters: [] };
  Game.state.scholar.day = 8;
  Game.expeditionReturn(ev, true);
  ok(v.trust[ev] === 41, 'expedition return pays the designed +1 leadership drip (progressive)', `trust=${v.trust[ev]}`);
  ok(!ag.exped[ev], 'expedition entry cleared on return');
  // at high trust the drip is damped to nearly nothing (progressive)
  v.trust[ev] = 90;
  ag.exped[ev] = { dist: 2, finds: [{ kcal: 120 }], encounters: [] };
  Game.expeditionReturn(ev, true);
  ok(v.trust[ev] === 90, 'leadership drip is damped at high trust (progressive: +1 -> +0 at 90)', `trust=${v.trust[ev]}`);
  console.log('  [A6] expedition return: leadership drip pinned (+1 at 40, +0 at 90); pantry got the haul');

  // ===== ATTACK 7 (EXPLOIT): promise->hello-goodbye keep farm =====
  // BREAK-IT (socialite r10 2026-10-10): endConvo called checkPromises
  // ('social') unconditionally, so promise -> open/close (hello-goodbye,
  // 10 kcal) kept a 'belong' promise for +15 trust/cycle — measured
  // 10->92 in 10 cycles. Keeping now requires a REAL conversation
  // (substantive + 3 exchanges, the mood-residue bar).
  freshState();
  // villagers whose intrinsic goal keeps via 'social' (belong/understand)
  const socialGoalIds = v.roster.filter(id => id !== Game.villagerId && id !== vid)
    .filter(id => Game.promiseKeepKind(Game.npcGoal(id)) === 'social');
  if (socialGoalIds.length < 2) { console.log('  [A7] skip: not enough social-goal villagers this seed'); }
  else {
  const pv = socialGoalIds[0], pv2 = socialGoalIds[1];
  v.trust[pv] = 10; v.trust[pv2] = 10;
  const pr1 = Game.promiseHelp(pv);
  ok(!!(pr1 && pr1.ok), 'belong promise made', Game.npcGoal(pv));
  for (let n = 0; n < 10; n++) {
    Game.startConvo(pv); Game.endConvo(pv, 'left'); // hello-goodbye
  }
  const tFarm = v.trust[pv];
  const stillOpen = !!((v.promises || {})[pv] && !(v.promises[pv] || {}).kept);
  ok(tFarm < 40, 'hello-goodbye spam cannot farm kept-promise trust', `trust=${tFarm.toFixed(1)}`);
  ok(stillOpen, 'hello-goodbye does not keep the promise (still open)', 'open=' + stillOpen);
  // a REAL conversation still keeps the promise (no regression)
  const pr2 = Game.promiseHelp(pv2);
  ok(!!(pr2 && pr2.ok), 'second belong promise made');
  Game.startConvo(pv2);
  let drove = 0;
  for (let e = 0; e < 10 && drove < 4; e++) {
    const ids = (Game.convoChoices(pv2) || []).map(x => x.id);
    const pk = ids.find(x => x === 'dlg:more') || ids.find(x => x === 'dlg:askwhy')
      || ids.find(x => x === 'dlg:react') || ids.find(x => x === 'agree') || ids.find(x => x === 'dlg:subject');
    if (!pk || pk === 'leave') break;
    const r = Game.convoTurn(pv2, pk);
    drove++;
    if (r && r.ended) break;
  }
  const c2 = Game.convoGet(pv2) || {};
  Game.endConvo(pv2, 'natural');
  const tReal = v.trust[pv2];
  const kept2 = ((v.promises || {})[pv2] || {}).kept === true;
  console.log(`  [A7] farm: 10 hello-goodbyes -> trust ${tFarm.toFixed(1)} (open=${stillOpen}); real convo (substantive=${!!c2.substantive}, ${drove} turns, ${c2.exchanges || 0} exch) -> trust ${tReal.toFixed(1)}, kept=${kept2}`);
  ok(kept2, 'a real substantive conversation keeps the promise', 'kept=' + kept2);
  } // end socialGoalIds guard

  console.log(`\n${A - F}/${A} asserts passed (${F} failed)`);
  process.exit(F ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
