#!/usr/bin/env node
// Socialite adversarial playtest, run 2026-10-10 (rotation index 2 -> socialite).
// Hostile player attacks on the trust/gossip/promise systems.
//
// EXPLOIT — promise-keep cycling: promiseHelp(+6 words, talk-capped 40) followed by
//             a KEEP action that pays +15 talk:false (uncapped, progressive). The r10
//             run gated 'social' keeps behind substantive+3-exchange conversations;
//             'heal' keeps still flow through comfort() (words-ish, talk:true) and
//             'food' keeps through giveFood() (a real deed). Measure cost-per-trust
//             and cycles-to-100 for each path, and whether words-keeps smuggle trust
//             past the 40 talk cap.
// EXPLOIT — promise-make spam: +6/villager words; verify the 40 talk cap holds and a
//             second promise is refused while one is open.
// EXPLOIT — comfort share-spam: r5 repetition gate re-verified.
// SOFTLOCK — conversation states via convoUI (the real UI contract): start twice,
//             exhaust budget (choices never strand), endConvo noop, invalid choiceId.
// HONESTY — gossip moves REP only, never trust (CANON.md standing rule, r6 pin);
//             confrontGossip with no gossip; offer_help gated on goalKnown;
//             Talk button names its 10 kcal cost.
//
// Run: node scripts/test-socialite-break-20261010.js   (SEED env override)
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261010', 10);
Math.random = mulberry32(SEED);

// ---------- boot the full engine ----------
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"]*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const said = [];
  Game.say = (m) => { said.push(String(m)); };
  const trustOf = (vid) => ((Game.state.village.trust || {})[vid] === undefined ? 10 : Game.state.village.trust[vid]);
  const setTrust = (vid, v) => { (Game.state.village.trust || (Game.state.village.trust = {}))[vid] = v; };
  const roster = () => (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  // npcGoal reads the DATA record first — set goals there for a real keepable path
  const setGoal = (vid, goal) => { const rec = (Game.data.villagers || []).find(v => v.id === vid); if (rec) rec.goal = goal; };
  const A = roster()[0], B = roster()[1], C = roster()[2], D = roster()[3], E = roster()[4], F = roster()[5];

  Game.state.scholar.inventory = Game.state.scholar.inventory || [];
  Game.state.scholar.inventory.push({ id: 'dand', name: 'Dandelion greens', kcalEach: 50, units: 400, spoilDay: 99 });
  Game.state.scholar.kcal = 3000;

  // ================= EXPLOIT: promise-make spam (words only) =================
  console.log('\n[exploit] promise-make spam across villagers');
  {
    ['feed', 'protect', 'heal', 'prove', 'belong', 'family'].forEach((g, i) => { setGoal(roster()[i], g); setTrust(roster()[i], 10); });
    for (const vid of roster().slice(0, 6)) { const r = Game.promiseHelp(vid); if (!r || !r.ok) console.log('    promiseHelp(' + vid.slice(0, 10) + ') -> ' + JSON.stringify(r)); }
    const over40 = roster().slice(0, 6).filter(vid => trustOf(vid) > 40);
    ok(over40.length === 0, 'words alone never push trust past 40 (make spam)', over40.length ? 'over: ' + over40.map(v => v.slice(0, 8) + '=' + trustOf(v)).join(',') : '');
    // second promise while one is open: refused, no trust paid
    const t0 = trustOf(A);
    const r = Game.promiseHelp(A);
    ok(r === null && trustOf(A) === t0, 'second promise while one is open is refused, no trust paid', 'r=' + JSON.stringify(r) + ' t=' + t0 + '->' + trustOf(A));
    // unkeepable goal: honest deflection, no promise tracked, no trust
    Game.state.village.promises = {};
    setGoal(F, 'home');
    const tF = trustOf(F);
    const rd = Game.promiseHelp(F);
    ok(rd && rd.ok === false && rd.deflected === true && !(Game.state.village.promises || {})[F] && trustOf(F) === tF,
      'unkeepable goal: honest deflection, nothing tracked, no trust paid', JSON.stringify(rd));
    setGoal(F, 'feed');
  }

  // ================= EXPLOIT: promise->giveFood keep cycling ('food' deed) =================
  console.log('\n[exploit] promise->giveFood keep cycling (feed goal, real deed)');
  {
    setGoal(A, 'feed'); setTrust(A, 10);
    Game.state.village.promises = {};
    let cycles = 0; const trustPath = [];
    for (let i = 0; i < 40 && trustOf(A) < 100; i++) {
      const pr = Game.promiseHelp(A);
      if (!pr || !pr.ok) { trustPath.push('promise-failed@' + i); break; }
      const gf = Game.giveFood(A, 'bite');
      if (!gf || !gf.ok) { trustPath.push('giveFood-failed@' + i); break; }
      cycles++;
      trustPath.push(trustOf(A));
    }
    console.log('    trust path: ' + trustPath.join(','));
    const inv = (Game.state.scholar.inventory || []).find(x => x.id === 'dand');
    console.log('    food units left: ' + (inv ? inv.units : '?') + ', cycles=' + cycles);
    ok(cycles >= 10, 'the farm actually ran (sanity)', 'cycles=' + cycles);
    // 40 bites + 40 words: reaching the 80s is the design's intended big-gain
    // territory (progressive curve binds: +1/cycle at 90+). Flag only if it sprints.
    ok(!(trustOf(A) >= 70 && cycles <= 10), 'food-keep farm does not sprint 10->70 in <=10 cycles', 'trust=' + trustOf(A) + ' cycles=' + cycles);
  }

  // ================= EXPLOIT: promise->comfort keep cycling ('heal', words-ish keep) =================
  console.log('\n[exploit] promise->comfort keep cycling (heal goal, WORDS keep)');
  {
    setGoal(B, 'heal'); setTrust(B, 10);
    Game.state.village.promises = {};
    let cycles = 0; const trustPath = [];
    for (let i = 0; i < 30; i++) {
      const pr = Game.promiseHelp(B);
      if (!pr || !pr.ok) { trustPath.push('promise-failed@' + i + ':' + JSON.stringify(pr)); break; }
      try { const n = Game.npcNeeds(B); n.fear = 85; n.grief = 0; n.hunger = 0; } catch (e) {}
      const r = Game.comfort(B, 'silent');
      if (!r || !r.ok) { trustPath.push('comfort-failed@' + i); break; }
      cycles++;
      trustPath.push(trustOf(B));
    }
    console.log('    trust path: ' + trustPath.join(','));
    // The hostile question: comfort is words (talk:true per the r2 fix), but the
    // KEEP pays +15 talk:false — uncapped. Words must not smuggle trust past 40.
    // FIX (2026-10-10): words-keeps route talk:true (40 cap); only real deeds
    // keep past it. Expect the farm to plateau at 40.
    const over40ViaWords = trustOf(B) > 40;
    ok(cycles >= 5, 'the comfort farm actually ran (sanity)', 'cycles=' + cycles + ' path=' + trustPath.slice(0, 6).join(','));
    ok(!over40ViaWords, 'words-keep (comfort) cannot smuggle trust past the 40 talk cap', 'trust=' + trustOf(B) + ' after ' + cycles + ' cycles');
  }

  // ================= EXPLOIT: stingy bite must not keep a 'feed' promise =================
  console.log('\n[honesty] stingy bite does not keep a feed promise');
  {
    const vid = C;
    setGoal(vid, 'feed'); setTrust(vid, 10);
    Game.state.village.promises = {};
    const pr = Game.promiseHelp(vid);
    ok(pr && pr.ok, 'promise made (sanity)');
    // crumb food: bite substance < 0.5, so a bite to a starving villager can sting
    Game.state.scholar.inventory.push({ id: 'crumb', name: 'Crumb', kcalEach: 10, units: 60, spoilDay: 99 });
    // move the crumb stack first so bites take crumbs
    Game.state.scholar.inventory.sort((a, b) => (a.id === 'crumb' ? -1 : 1));
    // STARVING + CRUMB = insult risk (40%/bite) — loop until the stingy path fires
    let stung = false, tries = 0, tBeforeStingy = 0;
    while (!stung && tries < 25) {
      tries++;
      try { const n = Game.npcNeeds(vid); n.hunger = 95; } catch (e) {}
      said.length = 0;
      tBeforeStingy = trustOf(vid);
      const gf = Game.giveFood(vid, 'bite');
      if (!gf || !gf.ok) break;
      stung = said.join(' ').match(/That's\.\.\. it/i) !== null;
      // a non-stingy crumb bite may have kept the promise already — re-promise
      if (!stung) { const pp = (Game.state.village.promises || {})[vid]; if (pp && pp.kept) { Game.state.village.promises = {}; Game.promiseHelp(vid); } }
    }
    ok(stung, 'stingy path triggered within 25 crumb-bites (sanity)', 'tries=' + tries);
    const p = (Game.state.village.promises || {})[vid];
    ok(p && !p.kept, 'insulting bite does NOT settle the feed promise', 'promise=' + JSON.stringify(p));
    // the stingy bite itself pays nothing: no deed (zeroed as insulting), no keep
    ok(trustOf(vid) - tBeforeStingy < 5, 'stingy bite adds no keep bonus on its own delta',
      'before=' + tBeforeStingy + ' after=' + trustOf(vid));
    // a real meal to the same starving villager DOES keep it (deed, not words)
    Game.state.village.promises = {};
    Game.promiseHelp(vid);
    try { const n = Game.npcNeeds(vid); n.hunger = 95; } catch (e) {}
    Game.state.scholar.inventory.sort((a, b) => (a.id === 'dand' ? -1 : 1));
    const gf2 = Game.giveFood(vid, 'meal');
    const p2 = (Game.state.village.promises || {})[vid];
    ok(gf2 && gf2.ok && p2 && p2.kept === true, 'a real meal keeps the feed promise', 'kept=' + (p2 && p2.kept));
    Game.state.village.promises = {};
  }

  // ================= REGRESSION: deed-keeps still pay past 40 =================
  console.log('\n[regression] real-deed keeps are NOT talk-capped');
  {
    const vid = D;
    setGoal(vid, 'feed');
    Game.state.village.promises = {};
    // control: meal with no promise at trust 50
    setTrust(vid, 50);
    try { const n = Game.npcNeeds(vid); n.hunger = 60; } catch (e) {}
    Game.state.scholar.inventory.sort((a, b) => (a.id === 'dand' ? -1 : 1));
    Game.giveFood(vid, 'meal');
    const deedOnly = trustOf(vid) - 50;
    // with promise: the keep bonus (+15, progressive-halved at 50 => +7) must land ON TOP
    setTrust(vid, 50);
    Game.state.village.promises = {};
    Game.promiseHelp(vid);
    try { const n = Game.npcNeeds(vid); n.hunger = 60; } catch (e) {}
    Game.giveFood(vid, 'meal');
    const withKeep = trustOf(vid) - 50;
    console.log('    deed-only gain=' + deedOnly + ', with-keep gain=' + withKeep);
    ok(withKeep > deedOnly + 3, 'deed-keep bonus pays past the 40 talk cap (not capped like words)',
      'deedOnly=' + deedOnly + ' withKeep=' + withKeep);
    Game.state.village.promises = {};
  }

  // ================= EXPLOIT: comfort share-spam (r5 gate re-verify) =================
  console.log('\n[exploit] comfort share-spam repetition gate');
  {
    setTrust(C, 45);
    try { const n = Game.npcNeeds(C); n.fear = 85; n.grief = 0; n.hunger = 0; } catch (e) {}
    Game.comfort(C, 'share');
    const t1 = trustOf(C);
    Game.comfort(C, 'share');
    const t2 = trustOf(C);
    ok((t2 - t1) < 6, 'second share in a day pays repeat rate, not full +10 (r5 gate holds)', 'second gain=' + (t2 - t1));
  }

  // ================= HONESTY: gossip moves REP only, never trust =================
  console.log('\n[honesty] gossip moves REP only, never trust');
  {
    const v = Game.state.village;
    const trustBefore = {};
    roster().forEach(id => { trustBefore[id] = trustOf(id); });
    // deterministic spread: stub Math.random to 0 so every teller tells
    // (spreadGossip calls Math.random() at call time — the stub takes effect)
    const realRandom = Math.random;
    v.gossip = v.gossip || [];
    const g = { dims: { generous: 12, brave: 8 }, heard: roster().slice(0, 4), distortion: 0, action: 'give_food' };
    v.gossip.push(g);
    const heard0 = g.heard.length;
    Math.random = () => 0;
    try {
      for (let i = 0; i < 10 && g.heard.length < roster().length - 1; i++) Game.spreadGossip();
    } finally { Math.random = realRandom; }
    const moved = roster().map(id => trustOf(id) - trustBefore[id]).filter(d => d !== 0);
    ok(moved.length === 0, 'spreadGossip moves no trust anywhere', moved.length ? 'moved at teller chain' : '');
    ok(g.heard.length > heard0, 'gossip actually spread (test is live)', 'heard=' + g.heard.length);
    // and the rep DID move (the spread isn't a no-op)
    v.gossip.pop();
  }

  // ================= HONESTY: confrontGossip with no gossip =================
  console.log('\n[honesty] confrontGossip honesty');
  {
    Game.state.village.gossip = [];
    said.length = 0;
    const t0 = trustOf(D);
    const r = Game.confrontGossip(D);
    ok(r === null && trustOf(D) === t0, 'confront with no gossip: honest refusal, no trust moved');
    ok(said.join(' ').match(/haven't heard/i), 'says the honest line');
  }

  // ================= SOFTLOCK: conversation states (convoUI contract) =================
  console.log('\n[softlock] conversation state integrity');
  {
    // start twice: modal rule must end the first
    const s1 = Game.startConvo(D);
    ok(!!(s1 && s1.choices && s1.choices.length), 'first convo starts with choices', 'choices=' + ((s1 && s1.choices) || []).length);
    Game.startConvo(E);
    const u1 = Game.convoUI(D);
    ok(u1 && u1.active === false, 'starting a second convo ends the first (modal)');
    Game.endConvo(E, 'left');
    const t0 = trustOf(E);
    const r2 = Game.endConvo(E, 'left');
    ok(r2 && r2.noop === true && trustOf(E) === t0, 'endConvo on dead convo is a noop (no repeat trust)');
    // invalid choice id: no crash, no strand
    const vid3 = F;
    let ui = Game.convoUI(vid3); // not started
    ok(ui && ui.active === false, 'convoUI on unstarted convo reports inactive');
    const st = Game.startConvo(vid3);
    let stranded = false, steps = 0, ended = false;
    let choices = (st && st.choices) || [];
    // realistic driver: 'goon' continues the thread when offered, else first choice
    const pickNext = (chs) => { const goon = chs.find(c => c.id === 'goon'); return goon ? goon.id : chs[0].id; };
    while (!ended && steps < 60) {
      steps++;
      if (!choices.length) { stranded = true; break; }
      const turn = Game.convoTurn(vid3, pickNext(choices));
      if (!turn || turn.ended) { ended = true; break; }
      choices = turn.choices || [];
    }
    ok(!stranded, 'exhausted conversation never strands with empty choices', stranded ? 'stranded at step ' + steps : '');
    ok(ended && steps < 60, 'conversation ends cleanly within 60 steps', 'steps=' + steps + ' ended=' + ended);
    try { Game.endConvo(vid3, 'left'); } catch (e) {}
    // ---- STUCK-HELDASK regression (socialite 2026-10-10) ----
    // budget spent + goodbye queued, then a question beat queues (heldAsk),
    // then the player moves on (non-'goon'): the ask beat is discarded and
    // heldAsk MUST clear, or the winddown gate blocks forever.
    {
      const vhx = D;
      Game.startConvo(vhx);
      const chx = (Game.convoUI(vhx).choices || []).map(c => c.id);
      const cx = Game.convoGet(vhx);
      cx.heldBeats.push({ text: '"So — what scares you?"', ask: { id: 'qtest', q: 'what scares you?', answers: [{ id: 'a1', label: '"Plenty."' }] } });
      cx.heldAsk = true;
      cx.winddownQueued = true;
      cx.heldBeats.push({ text: '"I should get back to it."', winddown: true });
      const nonGoon = chx.find(id => id !== 'goon' && id !== 'leave') || 'recap';
      Game.convoTurn(vhx, nonGoon);
      const cx2 = Game.convoGet(vhx);
      const plantedGone = !(cx2.heldBeats || []).some(h => h.ask && h.ask.id === 'qtest');
      const flagMatchesReality = cx2.heldAsk === (cx2.heldBeats || []).some(h => h.ask);
      ok(plantedGone, 'moving on discards the unrevealed ask beat', 'beats=' + (cx2.heldBeats || []).length);
      ok(flagMatchesReality, 'heldAsk flag tracks queued ask beats (no stuck flag)',
        'heldAsk=' + cx2.heldAsk);
      ok((cx2.heldBeats || []).some(h => h.winddown), 'winddown beat survives the player moving on');
      const g2 = Game.convoTurn(vhx, 'goon');
      ok(g2 && g2.windingDown === true, 'continuer reveals the queued goodbye after the fix');
      try { Game.endConvo(vhx, 'left'); } catch (e) {}
    }
    // invalid choice id mid-convo
    const vid4 = D;
    Game.startConvo(vid4);
    let crashed = false;
    try { const t = Game.convoTurn(vid4, 'no_such_choice_xyz'); if (!t) crashed = 'null-return'; } catch (e) { crashed = String(e && e.message || e).slice(0, 80); }
    ok(!crashed, 'invalid choice id does not crash or null-return', crashed ? String(crashed) : '');
    try { Game.endConvo(vid4, 'left'); } catch (e) {}
  }

  // ================= HONESTY: offer_help gated on goalKnown; Talk names cost =================
  console.log('\n[honesty] offer_help gating + Talk cost label');
  {
    setGoal(A, 'feed');
    const s = Game.startConvo(A);
    const known = !!Game.goalKnown(A);
    const hasOffer = ((s && s.choices) || []).some(ch => ch.id === 'offer_help');
    ok(hasOffer === known, 'offer_help appears exactly when the goal is known', 'known=' + known + ' offered=' + hasOffer);
    try { Game.endConvo(A, 'left'); } catch (e) {}
    // Talk button label names the 10 kcal cost (CONVERSATIONS.md contract)
    const fs = require('fs');
    const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
    const talkLabelLine = (appSrc.match(/Talk again \(10 kcal\)|Talk \(10 kcal\)/g) || []);
    ok(talkLabelLine.length > 0, 'Talk button label names its 10 kcal cost', talkLabelLine.slice(0, 2).join(' | '));
  }

  console.log('\n---- pass=' + pass + ' fail=' + fail + ' ----');
  if (failures.length) console.log('FAILURES:\n' + failures.join('\n'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e && e.stack || e); process.exit(2); });
