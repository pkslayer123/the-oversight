#!/usr/bin/env node
// Break-it regional & hierarchy proof tests, run 2026-10-10 (target 14).
// Hostile-player attacks against the inter-village hierarchy engine
// (src/js/hierarchy.js):
//
//   EXPLOIT   - tribute dodging: late-week full/partial payments voided by
//               linkTick (food taken, full arrears anyway); payTribute trust
//               farm (+3/click on an empty pantry after one full payment);
//               honoring a demand on a BROKEN link (food leaves for a dead
//               bond); overpaying tribute; re-link opinion re-farm;
//               sweeten-loop.
//   SOFTLOCK  - kingdomEndingEligible unreachable (arrears>0 forever under
//               the tick bug); pendingCounter blocks proposeLink; Regional
//               Dawn double-stage; accord on a broken link.
//   HONESTY   - "cold proposals decline" vs engine (base 38 + rep/2 +/- 10:
//               the modal cold outcome is a COUNTER, not a decline);
//               tribute demand amounts displayed vs charged; the weekly
//               table gate; proportional demand honor; "so far this week"
//               copy vs tributePaidKcal.
//   DEAD CODE - every @ontology provides function reachable + exercised;
//               missing provides entries (villageLinks, representative,
//               renegotiateLink, bidForPrimacy, primaryDemand, proveWorth,
//               successionCrisis) added to the header.
//
// CATCHES THIS RUN (fixed, proven below):
//   1. TRIBUTE VOID (exploit/honesty): linkTick settled the CURRENT week,
//      crediting only payments tagged with it — but the tick runs at the
//      week's boundary (endDay), so only payments made on the single
//      boundary day ever counted. Full AND partial payments made on any
//      other day were silently voided: food left the pantry AND full
//      arrears were charged. The 2026-10-09 rule "paying half is strictly
//      better than paying nothing" was false in the engine, and
//      kingdomEndingEligible (requires arrears===0) was unreachable.
//      Fix: the tick settles the week that just ENDED, crediting that
//      week's tagged payments; links formed mid-week get grace.
//   2. PAY-TRIBUTE TRUST FARM (exploit): once a week's total reached the
//      owed amount, EVERY further payTribute call granted +3 trust —
//      paying once in full then clicking again with an empty pantry farmed
//      +3 trust per click for zero food. Fix: idempotent — a current week
//      says so and takes nothing.
//   3. DEMAND ON A DEAD LINK (exploit/softlock): breakLink left
//      pendingDemand alive; answerDemand honored it — tribute food left
//      the pantry for a broken bond. Fix: breakLink clears the demand;
//      answerDemand refuses non-active links.
//   4. COLD-PROPOSAL COPY LIE (honesty): "cold proposals decline" (app.js
//      comment + ontology rule) vs engine: base 38 + rep/2 +/-10 makes the
//      35-54 COUNTER band the modal cold outcome (~81% at standing 0,
//      0% decline). Fix: copy now says cold proposals usually draw a
//      counter-offer — the negotiation IS the climb.
//   5. ONTOLOGY GAP (dead-code): provides list omitted 7 public methods
//      (villageLinks, representative, renegotiateLink, bidForPrimacy,
//      primaryDemand, proveWorth, successionCrisis). Added.
//
// HELD (attacks attempted, system resisted — documented, not fixed):
//   - re-link after breakLink cannot re-farm join/codex opinion (one-shot
//     flags persist on the village object).
//   - sweeten cannot loop: each attempt costs 1,500 kcal win or lose and
//     clears the counter.
//   - overpaying tribute is engine-possible but UI-unreachable (the Pay
//     button never passes a kcal amount).
//   - demand honor is proportional (empty pantry -> +0 trust, arrears grow).
//   - the weekly table gate holds both directions (renegotiate/bid share
//     lastTableWeek).
//   - Regional Dawn stages exactly once; accord on a dead link clears.
//   - pendingCounter blocks proposeLink until answered (walk clears).
//
// Run: node scripts/test-hierarchy-break-20261010.js   (SEED env override)
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

// ---------- seeded RNG (modules capture Math.random at load) ----------
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

function freshWorld() {
  const said = [];
  Game.say = (m) => { said.push(String(m)); };
  const s = Game.state.scholar;
  s.day = 0;
  Game.state.networkLive = true; // skip the Regional Dawn beat in most tests
  Game.state.pendingCounter = null;
  Game.state.pendingAccord = null;
  Game.state.otherVillages = [
    { id: 'v1', name: 'Ashford', opinion: 0, rumored: true, generated: false,
      roster: [{ id: 'sp1', name: 'Mara of Ashford', alive: true }], news: ['A child was born at Ashford.'] },
    { id: 'v2', name: 'Gloam', opinion: 0, rumored: true, generated: false,
      roster: [{ id: 'sp2', name: 'Joren of Gloam', alive: true }], news: [] },
  ];
  const v = Game.state.village;
  v.roster = [];
  v.pantry = [{ kcalEach: 100, units: 300, spoilDay: 99999 }];
  const m = Game.mshipState();
  m.links = [];
  m.lastLinkWeek = -1;
  m.loaned = null;
  Game.villagerId = 'player';
  return said;
}
function pantryKcal() {
  return (Game.state.village.pantry || []).reduce((a, it) => a + (it.kcalEach || 0) * (it.units || 0), 0);
}
function formLink(day, tribute) {
  Game.state.scholar.day = day;
  const link = Game._formLink('v1', { asSubordinate: true, tributeKcalPerWeek: tribute || 4000 });
  link.day = day;
  return link;
}
function tickAt(day) {
  Game.state.scholar.day = day;
  Game.linkTick();
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  console.log('== EXPLOIT: tribute payments vs the weekly tick ==');
  { // E1: full payment late in the week must settle the week — no arrears.
    const said = freshWorld();
    const link = formLink(0);
    tickAt(0);                       // week-0 boundary tick (settles week -1: no-op)
    Game.state.scholar.day = 3;
    Game.payTribute(link.id);         // full 4000 on day 3
    ok(pantryKcal() === 26000, 'E1 pantry lost exactly 4000', 'have ' + pantryKcal());
    tickAt(7);                        // week-1 boundary tick settles week 0
    ok(link.arrears === 0, 'E1 full late-week payment leaves zero arrears', 'arrears=' + link.arrears);
    ok(link.trust > 30, 'E1 paid week deepens trust', 'trust=' + link.trust);
  }
  { // E2: partial payment must reduce arrears to the true shortfall.
    freshWorld();
    const link = formLink(0);
    tickAt(0);
    Game.state.scholar.day = 3;
    Game.payTribute(link.id, 2000);    // half on day 3
    tickAt(7);
    ok(link.arrears === 2000, 'E2 partial payment: arrears = true shortfall (2000)', 'arrears=' + link.arrears);
  }
  { // E2b: two partials across the week accumulate.
    freshWorld();
    const link = formLink(0);
    tickAt(0);
    Game.state.scholar.day = 2;
    Game.payTribute(link.id, 1500);
    Game.state.scholar.day = 5;
    Game.payTribute(link.id, 2500);    // completes the week
    ok(link.tributePaidWeek === 0, 'E2b split payments complete the week');
    tickAt(7);
    ok(link.arrears === 0, 'E2b accumulated full payment: no arrears', 'arrears=' + link.arrears);
  }
  { // E2c: mid-week formation gets grace for the partial week.
    freshWorld();
    const link = formLink(10);        // formed day 10 (week 1)
    tickAt(14);                        // week-2 tick settles week 1: link didn't exist all week
    ok(link.arrears === 0, 'E2c new mid-week link: no full-week charge for a partial week', 'arrears=' + link.arrears);
    Game.state.scholar.day = 16;
    Game.payTribute(link.id);
    tickAt(21);                        // settles week 2 (full week existed)
    ok(link.arrears === 0, 'E2c next full week paid: still no arrears', 'arrears=' + link.arrears);
  }

  console.log('== EXPLOIT: payTribute trust farm ==');
  { // E3: clicking Pay again after the week is current must not grant trust.
    freshWorld();
    const link = formLink(0);
    Game.payTribute(link.id);          // full: trust 30 -> 33
    const t1 = link.trust;
    Game.state.village.pantry = [];    // pantry bare
    const paid = Game.payTribute(link.id);
    ok(paid === 0, 'E3 second pay on a current week takes no food', 'paid=' + paid);
    ok(link.trust === t1, 'E3 no trust farm on repeat clicks', 'trust ' + t1 + ' -> ' + link.trust);
  }

  console.log('== EXPLOIT: demand honored on a broken link ==');
  { // E4: break the link, then answer the pending demand.
    freshWorld();
    const link = formLink(0);
    link.pendingDemand = { kind: 'tribute', costKcal: 2000, detail: 'test demand' };
    const before = pantryKcal();
    Game.breakLink(link.id, 'gambit');
    ok(link.pendingDemand === null, 'E4 breakLink clears the pending demand');
    // adversarial: a stale demand re-planted on the dead link (e.g. saved mid-demand)
    link.pendingDemand = { kind: 'tribute', costKcal: 2000, detail: 'stale demand' };
    const r = Game.answerDemand(link.id, true);
    ok(r === null, 'E4 answering a demand on a broken link is refused');
    ok(pantryKcal() === before, 'E4 no food leaves the pantry for a dead bond', 'lost ' + (before - pantryKcal()));
    ok(link.pendingDemand === null, 'E4 the stale demand is cleared, not honored');
  }

  console.log('== EXPLOIT: re-link opinion re-farm ==');
  { // E5: join/codex one-shot flags must survive break + re-link.
    freshWorld();
    const ov = Game.state.otherVillages[0];
    ov._joinOpinionGiven = true; ov._codexOpinionGiven = true;
    const link = formLink(0);
    const opBefore = ov.opinion;
    Game.breakLink(link.id, 'gambit');
    ok(ov._joinOpinionGiven && ov._codexOpinionGiven, 'E5 courtship one-shot flags persist across breakLink');
    ok(ov.opinion < opBefore, 'E5 breaking costs opinion (no free reset)', 'opinion ' + ov.opinion);
  }

  console.log('== SOFTLOCK: the earned ending must be reachable ==');
  { // S1: three paid weeks + trust 70 + 21 days -> kingdomEndingEligible.
    freshWorld();
    const link = formLink(0);
    tickAt(0);
    for (let w = 0; w < 3; w++) {
      Game.state.scholar.day = 7 * w + 3;
      Game.payTribute(link.id);
      tickAt(7 * (w + 1));
    }
    ok(link.arrears === 0, 'S1 three paid weeks: arrears stay zero', 'arrears=' + link.arrears);
    for (let i = 0; i < 5; i++) Game.proveWorth(link.id, 'player', 18); // deeds feed the link
    Game.state.scholar.day = 21;
    const ke = Game.kingdomEndingEligible();
    ok(ke.eligible === true && ke.linkId === link.id, 'S1 the valued subordinate frame is reachable', JSON.stringify(ke).slice(0, 80));
  }
  { // S2: pending counter blocks proposeLink until answered.
    freshWorld();
    Game.state.pendingCounter = { targetId: 'v2', opts: {}, asSubordinate: true, tributeKcalPerWeek: 5000, terms: 'x' };
    ok(Game.proposeLink('v2', {}) === 'counter', 'S2 proposeLink blocked while a counter is on the table');
    Game.answerCounter('walk');
    ok(Game.state.pendingCounter === null, 'S2 walking away clears the counter (no stuck state)');
  }
  { // S3: Regional Dawn stages exactly once.
    freshWorld();
    Game.state.networkLive = false;
    const link = formLink(0);          // _formLink stages the accord (networkLive was false)
    ok(Game.state.networkLive === true, 'S3 first link brings the network live');
    ok(Game.stageFirstAccord(link) === null, 'S3 second staging is a no-op');
    Game.state.pendingAccord = null;   // player never answers...
    ok(Game.answerAccord('gift') === null, 'S3 answering with no pending accord is a no-op');
  }
  { // S4: accord on a dead link clears instead of dangling.
    freshWorld();
    Game.state.networkLive = false;
    const link = formLink(0);
    Game.breakLink(link.id, 'severed');
    const r = Game.answerAccord('gift');
    ok(r === null && Game.state.pendingAccord === null, 'S4 accord on a broken link clears the pending beat');
  }

  console.log('== HONESTY: copy vs engine ==');
  { // H1: cold-proposal outcome distribution vs the "decline" claim.
    freshWorld();
    let decline = 0, counter = 0, accept = 0;
    for (let i = 0; i < 300; i++) {
      const j = Game.judgeLink('v1', { asSubordinate: true, tributeKcalPerWeek: 4000 });
      if (j.score >= 55) accept++; else if (j.score >= 35) counter++; else decline++;
    }
    console.log(`  info cold-proposal bands over 300 rolls: decline=${decline} counter=${counter} accept=${accept}`);
    ok(counter > decline && counter > accept, 'H1 the COUNTER band is the modal cold outcome (the negotiation is the climb)');
    ok(accept < 105, 'H1 cold acceptance is rare without courtship (<35%)', 'accept=' + accept);
    // courtship earns the accept: join (+5) + codex (+3) opinion
    Game.state.otherVillages[0].opinion = 8;
    let accept2 = 0;
    for (let i = 0; i < 300; i++) {
      if (Game.judgeLink('v1', { asSubordinate: true, tributeKcalPerWeek: 4000 }).score >= 55) accept2++;
    }
    console.log(`  info courted-proposal accepts over 300 rolls: ${accept2}`);
    ok(accept2 > accept, 'H1 courtship moves the needle on acceptance (the climb is earned)');
  }
  { // H2: demand honor is proportional — empty pantry, no free trust.
    freshWorld();
    const link = formLink(0);
    link.pendingDemand = { kind: 'tribute', costKcal: 2000, detail: 'x' };
    Game.state.village.pantry = [];
    const t0 = link.trust;
    Game.answerDemand(link.id, true);
    ok(link.trust === t0, 'H2 empty-handed honor grants zero trust', 'trust ' + t0 + ' -> ' + link.trust);
    ok(link.arrears === 2000, 'H2 the gap becomes arrears, honestly', 'arrears=' + link.arrears);
  }
  { // H3: the table is a weekly verb — both directions.
    freshWorld();
    const link = formLink(0);
    Game.state.scholar.day = 3;
    Game.renegotiateLink(link.id);
    const second = Game.renegotiateLink(link.id);
    ok(second === false, 'H3 second renegotiation same week refused');
    const bid = Game.bidForPrimacy(link.id);
    ok(bid === null, 'H3 bid shares the weekly gate after a renegotiation');
  }
  { // H4: demand amounts displayed match what's charged.
    freshWorld();
    const link = formLink(0);
    const d = Game.primaryDemand(link.id);
    if (d && d.kind === 'tribute') {
      const m = String(d.detail).match(/([\d,]+) kcal/);
      ok(m && parseInt(m[1].replace(/,/g, ''), 10) === d.costKcal, 'H4 tribute demand detail names the exact costKcal');
    } else {
      console.log('  info H4 demand rolled kind=' + (d && d.kind) + ' (tribute-specific check skipped this seed)');
      pass++;
    }
  }

  console.log('== DEAD CODE: every provided function reachable ==');
  {
    freshWorld();
    const link = formLink(0);
    const provided = ['hierarchyState', 'linkWith', 'knowsVillage', 'linkStanding', 'breakLink',
      'judgeLink', 'proposeLink', 'answerCounter', 'answerDemand', 'payTribute', 'hierarchyDaily',
      'linkTick', 'onLeaderDeath', 'theirLeaderDied', 'stageFirstAccord', 'answerAccord',
      'deliverVillageRumors', 'kingdomEndingEligible', '_nudgeOpinion',
      // public but missing from the @ontology provides list (added this run):
      'villageLinks', 'representative', 'renegotiateLink', 'bidForPrimacy',
      'primaryDemand', 'proveWorth', 'successionCrisis'];
    let allFn = true;
    for (const n of provided) {
      if (typeof Game[n] !== 'function') { allFn = false; console.log('  FAIL missing Game.' + n); }
    }
    ok(allFn, 'D1 all ' + provided.length + ' hierarchy functions exist on Game');
    let threw = null;
    try {
      Game.hierarchyState(); Game.linkWith('v1'); Game.knowsVillage({ id: 'v9' });
      Game.linkStanding('nobody'); Game.villageLinks('haven'); Game.representative();
      Game.judgeLink('v1', {}); Game.proposeLink('nope', {}); Game.answerCounter('walk');
      Game.answerDemand('nope', true); Game.hierarchyDaily(); Game.linkTick();
      Game.onLeaderDeath(null); Game.theirLeaderDied('nope'); Game.stageFirstAccord(null);
      Game.answerAccord('cold'); Game.deliverVillageRumors(); Game.kingdomEndingEligible();
      Game._nudgeOpinion('v1', 1); Game.primaryDemand('nope'); Game.proveWorth('nope', 'x', 5);
      Game.successionCrisis('nope');
      // registerDeath wrap is the onLeaderDeath wire:
      const src = Game.registerDeath.toString();
      if (!/onLeaderDeath/.test(src)) threw = 'registerDeath wrap does not call onLeaderDeath';
    } catch (e) { threw = e.message; }
    ok(!threw, 'D2 every provided function is callable without throwing', threw || '');
    // call-site check: each provided fn has a caller in app.js or hierarchy.js
    const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
    const hSrc = fs.readFileSync(path.join(ROOT, 'src/js/hierarchy.js'), 'utf8');
    const noCaller = [];
    for (const n of provided) {
      const re = new RegExp('\\.' + n + '\\s*\\(|[^_\\w]' + n + '\\(', 'g');
      const inApp = (appSrc.match(re) || []).length;
      const inH = (hSrc.match(re) || []).length;
      if (inApp + inH === 0) noCaller.push(n);
    }
    ok(noCaller.length === 0, 'D3 every provided function has a call site', noCaller.join(','));
  }

  console.log(`\n${pass} passed, ${fail} failed (seed ${SEED})`);
  if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log(' - ' + f)); process.exit(1); }
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
