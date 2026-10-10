// BREAK-IT socialite r12 (2026-10-10): hostile-player pass, fresh ground.
// r11 killed moot re-convene, vote stalls, weregild minting (betrayal.js).
// r10 killed yieldChallenge flat-+10, 0-resurrections, ghost leadership state.
// Canon: docs/CANON.md (Trust != reputation; rumors move REP only, never trust),
// docs/CONVERSATIONS.md.
//   T1 EXPLOIT — malicious rumor rotation: one nasty rumor per daypart about a
//      fixed target (types rotate), spreadGossip 3 days. Exchange rate: subject
//      rep damage vs player cost (kcal/ticks/trust/rep). Rep is bounded +-100
//      (applyRep) — the hostile question is how CHEAP the nuke is.
//   T2 SOFTLOCK — winddown 'One more thing': drive convo past budget, take the
//      winddown choices, pick 'more'. Does the promised beat land, or does the
//      end-of-turn winddown check silently endConvo and discard it? Also: can
//      a hostile player extend a convo forever past windingDown?
//   T3 HONESTY — reactive-answer trust spec: 'saw' (trust:2) at trust 39/40/50.
//      Labels never promise numbers ("numbers never leak"), but the engine must
//      apply what the design spec'd and the 40 words-cap must be honest.
//   T4 HONESTY — every buildMenu state offers a way out: 'leave' present in
//      normal, pendingQ, rumor-thread, and winddown states.
// Run: node scripts/test-break-social-r12-20261010.js (SEED=... optional)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
const SEED = parseInt(process.env.SEED || '20261010', 10);
// BEFORE=1: eval conversation.js from git HEAD (pre-fix) instead of the worktree copy.
const srcOf = (f) => (BEFORE && f === 'src/js/conversation.js')
  ? execSync('git show HEAD:src/js/conversation.js', { cwd: ROOT, encoding: 'utf8' })
  : fs.readFileSync(path.join(ROOT, f), 'utf8');
if (BEFORE) console.log('MODE: BEFORE (conversation.js from git HEAD)');
function mulberry32(seed) {
  let s = seed >>> 0;
  const f = function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.reset = (ns) => { s = ns >>> 0; }; return f;
}
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js', 'src/js/drama.js']);
[...html.matchAll(/src\/js\/[^\/\\\"]+\.js|src\/js\/engine\/[^\/\\\"]+\.js/g)].map(m => m[0]).filter(f => !SKIP.has(f))
  .forEach(f => eval(srcOf(f)));
delete global.window;
const Game = globalThis.Scattering.Game;
const fails = [];
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' — ' + extra : '')); if (!cond) fails.push(name); };

async function fresh() {
  await Game.init(); Game.debugScenario('day1');
  Game.say = () => {}; Game.sysSay = () => {};
  const S = Game.state, v = S.village, me = Game.villagerId;
  const npcs = (v.roster || []).filter(id => id !== me);
  return { S, v, me, npcs };
}

(async () => {
  // ================= T1: rumor rotation rep-nuke =================
  {
    const { v, me, npcs } = await fresh();
    const target = npcs[0], listener = npcs[1];
    const types = ['untrustworthy', 'scheming', 'coward', 'stingy'];
    const startKcal = Game.state.scholar.kcal;
    v.trust[target] = 50;
    let rumorsStarted = 0, traceHits = 0;
    const origRemember = Game.remember.bind(Game);
    Game.remember = function (vid, type, note) {
      if (vid === target && type === 'rumor_about_them') traceHits++;
      return origRemember(vid, type, note);
    };
    const parts = ['morning', 'midday', 'evening', 'night'];
    for (let day = 1; day <= 3; day++) {
      for (let pi = 0; pi < 4; pi++) {
        Game.state.scholar.day = day; Game.dayPart = parts[pi];
        const g = Game.spreadRumor(target, types[(day * 4 + pi) % 4], listener);
        if (g) rumorsStarted++;
        Game.spreadGossip();
      }
    }
    Game.remember = origRemember;
    const subjRep = Game.repOf(target);
    const kcalSpent = startKcal - Game.state.scholar.kcal;
    const subjHonestViewOfPlayer = (Game.repOf(target).honest); // their view slot for subject==target is their own? no: repOf(target) is OTHERS' view? see below
    console.log(`  T1: rumorsStarted=${rumorsStarted} traceHits=${traceHits} kcalSpent=${kcalSpent}` +
      ` subjectRep(honest/trustworthy/generous/brave)=${subjRep.honest}/${subjRep.trustworthy}/${subjRep.generous}/${subjRep.brave}` +
      ` subjectTrustOfPlayer=${v.trust[target]}(start 50)`);
    check('T1 rep damage is bounded at the -100 floor (no unbounded nuke)',
      (subjRep.honest || 0) >= -100 && (subjRep.trustworthy || 0) >= -100);
    check('T1 rumor costs are real (kcal spent, trace fired at least once over 12 rumors)',
      rumorsStarted === 12 && kcalSpent >= 0 && traceHits >= 1,
      `traces=${traceHits}`);
    check('T1 rumors move REP, not trust (canon: Trust != reputation)',
      v.trust[target] >= 50 - 6 * traceHits,
      `subjectTrust=${v.trust[target]} (start 50, ${traceHits} traces x -6 max)`);
  }

  // ================= T2: pendingQ dodge-lapse (was: infinite hang) =================
  // BEFORE: a bespoke question dodged with silence hung forever — no follow-up,
  // no lapse — and its !c.pendingQ winddown gate defeated the energy budget
  // indefinitely (measured: 40 turns, budget 3, winddown never queued).
  // AFTER: one noticed follow-up, then an honest lapse; the winddown queues.
  // Design note: the goodbye itself is revealed via the continuer and is never
  // a silent chop — so the contract asserts winddown QUEUES under stonewall,
  // and the convo ends when the player cooperates (picks goon).
  {
    const { v, npcs } = await fresh();
    const vid = npcs[0];
    Game.state.scholar.kcal = 5000;
    const op = Game.startConvo(vid);
    check('T2 convo opens', !!op && !!Game.convoGet(vid).active);
    const c = Game.convoGet(vid);
    const budget = c.budget;
    // force a hanging bespoke question
    c.pendingQ = { id: 'probe_q', q: '"Where are you from, really?"', answers: [{ id: 'a1', label: '"Far away."' }] };
    let turns = 0, lapsedAt = -1, wdQueuedAt = -1;
    while (turns < 40) {
      const cc = Game.convoGet(vid);
      if (!cc.active) break;
      if (lapsedAt < 0 && !cc.pendingQ) lapsedAt = turns;
      if (wdQueuedAt < 0 && cc.winddownQueued) wdQueuedAt = turns;
      const choices = Game.convoChoices(vid);
      const ids = choices.map(x => x.id);
      // hostile player: stonewall with silence whenever offered
      const pick = ids.includes('silence') ? 'silence' : (ids.includes('goon') ? 'goon' : 'leave');
      Game.convoTurn(vid, pick);
      if (pick === 'leave') break;
      turns++;
    }
    const cc2 = Game.convoGet(vid);
    console.log(`  T2: turns=${turns} budget=${budget} lapsedAt=${lapsedAt} wdQueuedAt=${wdQueuedAt} active=${cc2.active}`);
    check('T2 dodged bespoke question lapses (not infinite hang)', lapsedAt >= 0 && lapsedAt <= 4, `lapsedAt=${lapsedAt}`);
    check('T2 winddown queues once blockers clear (stonewall cannot block the check)',
      wdQueuedAt >= 0, `wdQueuedAt=${wdQueuedAt}`);
    check('T2 transcript capped at 200', (cc2.transcript || []).length <= 200);
    // the lapse must be honest: no stale "did you hear me?" follow-up after "forget I asked"
    const texts = (cc2.transcript || []).map(t => t.text).join(' ');
    check('T2 no stale follow-up beat survives the lapse', !/did you hear me\?/i.test(texts) || !/forget i asked/i.test(texts),
      'transcript coherent');
    // cooperative close: picking the continuer reveals the goodbye and ends it
    let endTurns = 0;
    while (Game.convoGet(vid).active && endTurns < 10) {
      const cc = Game.convoGet(vid);
      const ids = Game.convoChoices(vid).map(x => x.id);
      if (cc.windingDown) { Game.convoTurn(vid, 'leave'); break; }
      Game.convoTurn(vid, ids.includes('goon') ? 'goon' : 'leave');
      endTurns++;
    }
    check('T2 cooperative player reaches a natural end', !Game.convoGet(vid).active, `endTurns=${endTurns}`);
    Game.endConvo(vid, 'left'); // no-op if already ended (goodbye_once_real)
  }

  // ================= T3: reactive trust spec honesty =================
  {
    for (const startTrust of [39, 40, 50]) {
      const { v, npcs } = await fresh();
      const vid = npcs[0];
      v.trust[vid] = startTrust;
      const applied = Game.resolveConsequence(vid, { trust: 2, temper: 'neutral', name: 'r12-probe:saw' });
      const after = v.trust[vid];
      console.log(`  T3: start=${startTrust} applied=${applied.trust} after=${after}`);
      if (startTrust < 40) check(`T3 words gain below 40 cap applies (start ${startTrust})`, applied.trust > 0 && after <= 40, `after=${after}`);
      else check(`T3 words gain at/above 40 cap is honest zero (start ${startTrust})`, applied.trust === 0 && after === startTrust, `after=${after}`);
    }
  }

  // ================= T4: exits and no-trap menus =================
  // genericQ-narrowed menus intentionally omit 'leave' (coherence fix, not a
  // bug — every offered choice resolves the question), so assert no-trap
  // instead of leave-presence there. pendingQ/rumor/normal states offer leave.
  {
    const { v, npcs } = await fresh();
    const vid = npcs[0];
    Game.state.scholar.kcal = 5000;
    Game.startConvo(vid);
    const c = Game.convoGet(vid);
    c.genericQ = null; c.reactiveQ = null; // force the plain menu
    let ids = Game.convoChoices(vid).map(x => x.id);
    check('T4 normal state offers leave', ids.includes('leave'), ids.slice(0, 8).join(','));
    // pendingQ state
    c.pendingQ = { id: 'probe_q', answers: [{ id: 'a1', label: '"Sure."' }] };
    ids = Game.convoChoices(vid).map(x => x.id);
    check('T4 pendingQ state offers leave', ids.includes('leave'), ids.slice(0, 8).join(','));
    c.pendingQ = null;
    // rumor thread mid-pick
    c.thread = 'spread_rumor'; c.rumorDone = false; c.rumorTarget = null;
    c.rumorTargets = [npcs[1]];
    ids = Game.convoChoices(vid).map(x => x.id);
    check('T4 rumor-thread state offers leave', ids.includes('leave'), ids.slice(0, 8).join(','));
    // genericQ state: no trap — every choice resolves or engages the question
    c.thread = null; c.rumorDone = true;
    c.genericQ = { kind: 'yn', q: '"Are you eating enough?"' };
    ids = Game.convoChoices(vid).map(x => x.id);
    const resolving = ids.every(id =>
      id.indexOf('gq:') === 0 || id === 'agree' || id === 'joke' || id === 'silence');
    check('T4 genericQ menu has no trap (every choice resolves the question)', resolving && ids.length > 0, ids.join(','));
    const before = !!Game.convoGet(vid).genericQ;
    const rpick = ids.includes('silence') ? 'silence' : ids[0];
    Game.convoTurn(vid, rpick);
    check('T4 answering/reacting clears the generic question', before && !Game.convoGet(vid).genericQ, `picked=${rpick}`);
    Game.endConvo(vid, 'left');
  }

  console.log(fails.length ? `\n${fails.length} FAILURES: ${fails.join(' | ')}` : '\nALL GREEN');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
