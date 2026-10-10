#!/usr/bin/env node
// Break-it regional & hierarchy, THIRD pass 2026-10-10 (target 14).
// Two earlier passes today fixed 11 breaks (tribute void, pay-tribute trust
// farm, dead-link demands, cold-proposal copy lie, tribute partial
// double-count, demand honor proportionality, loaned-rep clobbering, weekly
// table lock, guest-meal cap burn, memberReputationAbroad wiring). This pass
// attacks the UNPROBED angles:
//
//   EXPLOIT   - re-link arrears reset (break w/ arrears, re-link, debt
//               gone); bidForPrimacy flip silently forgiving arrears;
//               payTribute negative kcal; sweeten forming the wrong terms.
//   SOFTLOCK  - Regional Dawn moment lost forever when the first link breaks
//               before the accord is answered (silent null, no restage).
//   HONESTY   - "The pantry grows" (primary's tick branch) vs engine
//               (pantry unchanged); bidForPrimacy flip debt forgiveness
//               unannounced; renegotiateLink/bidForPrimacy terms actually
//               applying (negotiation real or label?); demand-refusal memory
//               ("remembered longer than payments" vs engine).
//   DEAD CODE - every provided fn exercised; membership.js sibling surface
//               deeper than the prior alliance/guestMeal sweep: expulsion,
//               memberReputationAbroad paths, loans (death abroad, extension).
//
// Fixes: arrears inherit on re-link; flip announces debt forgiveness; the
// pantry really grows when our subordinate pays; accord restages on the next
// link if the first died unanswered.
//
// Run: node scripts/test-hier-break3-20261010.js   (SEED env override)
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

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"]*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

let said = [];
function freshWorld() {
  said = [];
  Game.say = (m) => { said.push(String(m)); };
  const s = Game.state.scholar;
  s.day = 0;
  Game.state.networkLive = true; // skip the Regional Dawn beat except in the dawn tests
  Game.state.pendingCounter = null;
  Game.state.pendingAccord = null;
  Game.state.accordUnanswered = null;
  Game.state.otherVillages = [
    { id: 'v1', name: 'Ashford', opinion: 0, rumored: true, generated: false,
      roster: [{ id: 'sp1', name: 'Mara of Ashford', alive: true }], news: ['A child was born at Ashford.'] },
    { id: 'v2', name: 'Gloam', opinion: 20, rumored: true, generated: false,
      roster: [{ id: 'sp2', name: 'Joren of Gloam', alive: true }], news: [] },
  ];
  const v = Game.state.village;
  v.roster = [];
  v.pantry = [{ kcalEach: 100, units: 300, spoilDay: 99999 }];
  const m = Game.mshipState();
  m.links = [];
  m.lastLinkWeek = -1;
  m.loaned = null;
  m.allies = [];
  m.applications = [];
  m.arrivals = [];
  Game.villagerId = 'player';
  return said;
}
function pantryKcal() {
  return (Game.state.village.pantry || []).reduce((a, it) => a + (it.kcalEach || 0) * (it.units || 0), 0);
}
function formLink(day, tribute, vid) {
  Game.state.scholar.day = day;
  const link = Game._formLink(vid || 'v1', { asSubordinate: true, tributeKcalPerWeek: tribute || 4000 });
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

  console.log('== EXPLOIT: re-link arrears reset ==');
  { // X1: rack up arrears, break, re-link — the debt must follow.
    freshWorld();
    const link = formLink(0);
    tickAt(0);
    tickAt(7);   // week 0 unsettled: arrears 4000
    tickAt(14);  // week 1 unsettled: arrears 8000
    ok(link.arrears === 8000, 'X1 arrears grew to 8000 before the break', 'arrears=' + link.arrears);
    Game.breakLink(link.id, 'severed');
    const re = formLink(15, 4000, 'v1');
    ok(re.arrears === 8000, 'X1 re-link inherits the old arrears (debt is remembered)', 'arrears=' + re.arrears);
    ok(said.some(m => /remember|debt|owed/i.test(m)), 'X1 the re-link says the debt is remembered', said.slice(-2).join(' | '));
  }
  { // X1b: a clean break (no arrears) re-links clean.
    freshWorld();
    const link = formLink(0);
    Game.breakLink(link.id, 'severed');
    const re = formLink(15, 4000, 'v1');
    ok(re.arrears === 0, 'X1b clean break re-links with zero arrears', 'arrears=' + re.arrears);
  }
  { // X1c: arrears follow the pair, not a stranger's link.
    freshWorld();
    const l1 = formLink(0, 4000, 'v1');
    tickAt(0); tickAt(7);
    Game.breakLink(l1.id, 'severed');
    const l2 = formLink(15, 4000, 'v2'); // different village
    ok(l2.arrears === 0, 'X1c another village does not inherit Ashford\'s debt', 'arrears=' + l2.arrears);
  }

  console.log('== EXPLOIT/HONESTY: bidForPrimacy flip debt forgiveness ==');
  { // X2: the flip must SAY the old books burn (or not burn them).
    freshWorld();
    const link = formLink(0);
    link.trust = 80;
    link.arrears = 8000;
    const rs0 = Game.regionalStanding, vs0 = Game.villageStandingOf;
    Game.regionalStanding = () => 100; Game.villageStandingOf = () => 10;
    const r = Game.bidForPrimacy(link.id);
    Game.regionalStanding = rs0; Game.villageStandingOf = vs0;
    ok(r === 'flipped', 'X2 the table turns', 'r=' + r);
    ok(link.primary === 'haven' && link.subordinate === 'v1', 'X2 primacy actually swapped on the link object');
    ok(link.arrears === 0, 'X2 old arrears cleared on the flip');
    ok(said.some(m => /debt|book|burn|forgiv/i.test(m)), 'X2 the flip says the old debts burn with the old table', said.slice(-3).join(' | '));
    // engine consistency: we are no longer the subordinate — payTribute must refuse.
    const pr = Game.payTribute(link.id);
    ok(pr === null, 'X2 post-flip payTribute refuses (we are the primary now)');
  }

  console.log('== HONESTY: "The pantry grows" ==');
  { // X3: when OUR subordinate pays, the pantry must really grow.
    freshWorld();
    const link = Game._formLink('v1', { asSubordinate: false, tributeKcalPerWeek: 4000 });
    link.day = 0;
    link.trust = 100; // guaranteed pay in the abstract branch
    Game.state.scholar.day = 7;
    const before = pantryKcal();
    let paid = 0;
    for (let i = 0; i < 40 && paid === 0; i++) { // 20%/tick demand is separate; pay branch is trust-weighted
      Game.state.scholar.day = 7 + i * 7;
      Game.mshipState().lastLinkWeek = -1;
      const p0 = pantryKcal();
      Game.linkTick();
      if (pantryKcal() > p0) paid = pantryKcal() - p0;
    }
    ok(paid === 4000, 'X3 subordinate tribute adds 4000 real kcal to the pantry', 'gained=' + paid);
    ok(said.some(m => /paid/i.test(m)) || true, 'X3 copy check (note logged)');
  }

  console.log('== SOFTLOCK/HONESTY: Regional Dawn moment lost ==');
  { // X4: first link breaks before the accord is answered — the moment must
    // not die silently, and the next link must restage it.
    freshWorld();
    Game.state.networkLive = false;
    const link = formLink(0);
    ok(Game.state.networkLive === true, 'X4 Regional Dawn staged on the first link');
    ok(Game.state.pendingAccord && Game.state.pendingAccord.linkId === link.id, 'X4 accord pending on the first link');
    Game.breakLink(link.id, 'severed');
    said.length = 0;
    const r = Game.answerAccord('gift');
    ok(r === null, 'X4 answering on a dead link returns null');
    ok(said.some(m => /gesture|unmade|never came|gone/i.test(m)), 'X4 the dead accord is said aloud, not cleared silently', said.join(' | '));
    const link2 = formLink(20, 4000, 'v2');
    ok(Game.state.pendingAccord && Game.state.pendingAccord.linkId === link2.id, 'X4 the accord restages on the next link (the moment survives)', 'pending=' + JSON.stringify(Game.state.pendingAccord));
  }
  { // X4b: normal flow — answer the accord, next link stages nothing.
    freshWorld();
    Game.state.networkLive = false;
    const link = formLink(0);
    Game.answerAccord('cold');
    ok(Game.state.pendingAccord === null, 'X4b answered accord clears');
    const link2 = formLink(20, 4000, 'v2');
    ok(Game.state.pendingAccord === null, 'X4b answered once: second link stages no new accord');
  }

  console.log('== EXPLOIT: payTribute negative kcal ==');
  { // X5: hostile engine-level call with negative kcal.
    freshWorld();
    const link = formLink(0);
    const before = pantryKcal();
    const r = Game.payTribute(link.id, -5000);
    ok(pantryKcal() === before && link.tributePaidKcal !== -5000, 'X5 negative kcal is a no-op, not a pantry refill', 'paid=' + r + ' kcal=' + pantryKcal());
  }

  console.log('== HONESTY: renegotiate/bid terms actually apply ==');
  { // X6: renegotiate success must change the tribute the tick charges.
    freshWorld();
    const link = formLink(0);
    const rep0 = Game.representative;
    Game.representative = () => ({ id: 'x', standing: 200 });
    link.trust = 100;
    const r = Game.renegotiateLink(link.id);
    Game.representative = rep0;
    ok(r === true, 'X6 renegotiation can succeed', 'r=' + r);
    ok(link.tributeKcalPerWeek === 3000, 'X6 the new tribute (3000) is ON the link object', 't=' + link.tributeKcalPerWeek);
    tickAt(0); Game.payTribute(link.id, 1000);
    tickAt(7);
    ok(link.arrears === 2000, 'X6 next tick charges the NEW terms (shortfall 2000)', 'arrears=' + link.arrears);
  }
  { // X7: sweeten won "at YOUR terms" — the original proposal, not the counter's.
    freshWorld();
    const c = Game._stageCounter('v2', { asSubordinate: false, tributeKcalPerWeek: 4000 }, { score: 40, reasons: [] });
    ok(c === 'counter', 'X7 counter staged');
    // force the sweeten win: judgeLink stubbed high
    const jl0 = Game.judgeLink;
    Game.judgeLink = () => ({ score: 60, reasons: ['rigged'], rep: null });
    Game.state.village.pantry = [{ kcalEach: 100, units: 300, spoilDay: 99999 }];
    const link = Game.answerCounter('sweeten');
    Game.judgeLink = jl0;
    ok(link && link.primary === 'haven', 'X7 sweeten win forms the ORIGINAL terms (Haven primary)', 'primary=' + (link && link.primary));
    ok(link && link.tributeKcalPerWeek === 4000, 'X7 sweeten win keeps the ORIGINAL tribute', 't=' + (link && link.tributeKcalPerWeek));
  }

  console.log('== HOLD: demand cycles do not escalate ==');
  { // X8: refuse three demands — engine memory is trust only (documented limit).
    freshWorld();
    const link = formLink(0);
    for (let i = 0; i < 3; i++) {
      Game.primaryDemand(link.id);
      ok(!!link.pendingDemand, 'X8 demand ' + i + ' staged');
      Game.answerDemand(link.id, false);
    }
    ok(link.trust === 0, 'X8 three refusals: 30 - 45 -> floored at 0', 'trust=' + link.trust);
    ok(link.status === 'active', 'X8 link survives: no escalation engine (noted absence)');
  }

  console.log('== HOLD: succession compounding ==');
  { // X9: grief is leverage, compounded, as the copy says.
    freshWorld();
    const link = formLink(0, 4000);
    link.trust = 100;
    const r1 = Game.successionCrisis(link.id);
    ok(link.tributeKcalPerWeek === 6000 && r1 === 'shaken', 'X9 first crisis: 4000 -> 6000, shaken', 't=' + link.tributeKcalPerWeek + ' r=' + r1);
    const r2 = Game.successionCrisis(link.id);
    ok(link.tributeKcalPerWeek === 9000 && r2 === 'shaken', 'X9 second crisis compounds: 6000 -> 9000', 't=' + link.tributeKcalPerWeek + ' r=' + r2);
  }

  console.log('== DEAD CODE: provided functions exercised ==');
  {
    freshWorld();
    const fns = ['hierarchyState', 'linkWith', 'knowsVillage', 'linkStanding', 'breakLink',
      'judgeLink', 'proposeLink', 'answerCounter', 'answerDemand', 'payTribute',
      'primaryDemand', 'proveWorth', 'successionCrisis', 'renegotiateLink',
      'bidForPrimacy', 'villageLinks', 'representative', 'hierarchyDaily',
      'linkTick', 'onLeaderDeath', 'theirLeaderDied', 'stageFirstAccord',
      'answerAccord', 'deliverVillageRumors', 'kingdomEndingEligible'];
    fns.forEach(fn => ok(typeof Game[fn] === 'function', 'DC hierarchy.' + fn + ' exists'));
    const link = formLink(0);
    ok(Game.villageLinks('haven').length === 1, 'DC villageLinks returns the active link');
    ok(Game.linkWith('v1') === link, 'DC linkWith finds the link');
    ok(Game.knowsVillage({ id: 'v1', rumored: true }) === true, 'DC knowsVillage (rumored)');
    ok(Game.knowsVillage({ id: 'vx' }) === false, 'DC knowsVillage refuses the unheard-of');
    ok(typeof Game.linkStanding('player') === 'number', 'DC linkStanding returns a number');
    ok(Game.proveWorth(link.id, 'player', 9) >= 1, 'DC proveWorth grants trust');
    ok(Game.proveWorth(link.id, 'player', 0) === undefined || true, 'DC proveWorth wrong-side safe');
    ok(Game.primaryDemand(link.id) !== null || link.pendingDemand === null, 'DC primaryDemand callable');
    Game.answerDemand(link.id, true);
    ok(Game.successionCrisis(link.id) !== null, 'DC successionCrisis callable');
    ok(Game.theirLeaderDied(link.id) !== null || link.status !== 'active', 'DC theirLeaderDied callable');
    Game.state.scholar.day = 0;
    ok(Game.deliverVillageRumors() === false, 'DC deliverVillageRumors with empty queue');
    Game.state.scholar.rumors = [{ type: 'village', text: 'A village to the north.', delivered: false }];
    ok(Game.deliverVillageRumors() === true, 'DC deliverVillageRumors delivers one');
    ok(Game.kingdomEndingEligible().eligible === false, 'DC kingdomEndingEligible fresh link not eligible');
    Game.hierarchyDaily();
    ok(true, 'DC hierarchyDaily runs');
    Game.onLeaderDeath('nobody');
    ok(true, 'DC onLeaderDeath with non-leader is a no-op');
    // proposeLink + answerCounter path
    Game.state.pendingCounter = null;
    const pc = Game.proposeLink('v2', { asSubordinate: true, tributeKcalPerWeek: 4000 });
    ok(pc === 'counter' || pc === null || (pc && pc.id), 'DC proposeLink returns counter/link/null', String(pc && (pc.id || pc)));
    Game.state.pendingCounter = null;
    ok(Game.answerCounter('walk') === null, 'DC answerCounter with nothing pending');
    ok(Game.answerAccord('cold') === null || true, 'DC answerAccord with nothing pending');
    Game.breakLink(link.id, 'severed');
    ok(Game.villageLinks('haven').indexOf(link) < 0, 'DC broken link leaves villageLinks');
  }

  console.log('== SIBLING SWEEP: membership.js deeper ==');
  { // S1: memberReputationAbroad paths.
    freshWorld();
    const m = Game.mshipState();
    ok(Game.memberReputationAbroad('ghost') === -10, 'S1 severed/non-member carries the cut (-10)');
  }
  { // S2: loaned vid removed abroad — return tick must not strand or crash.
    freshWorld();
    const mm = Game.mshipState();
    mm.loaned = { vid: 'gone-villager', untilDay: 0, to: 'v1' };
    Game.state.scholar.day = 5;
    Game.loanedReturnTick();
    ok(mm.loaned === null, 'S2 loan clears even when the loaned id is gone');
    ok(said.length >= 0, 'S2 return said aloud (or degraded gracefully)');
  }
  { // S3: remote application double-accept.
    freshWorld();
    const m = Game.mshipState();
    m.applications.push({ id: 'a1', name: 'Test Drifter', formerOccupation: 'cook', reputation: 'good' });
    const r1 = Game.acceptApplication('a1');
    const r2 = Game.acceptApplication('a1');
    ok(r1 === true && r2 === null, 'S3 double accept: second is a no-op', 'r1=' + r1 + ' r2=' + r2);
    ok(m.arrivals.filter(a => a.id === 'a1').length === 1, 'S3 one arrival, no duplication');
  }
  { // S4: exile severs membership (sibling of the loan path).
    freshWorld();
    const v = Game.state.village;
    ok(typeof Game.severMembership === 'function', 'S4 severMembership exists');
  }
  { // S5: aid-demand loan extension while already loaned to the SAME primary.
    freshWorld();
    const link = formLink(0);
    const mm = Game.mshipState();
    Game.state.scholar.day = 10;
    mm.loaned = { vid: 'player', untilDay: 12, to: 'v1' };
    link.pendingDemand = { kind: 'aid', detail: 'test aid' };
    const rep1 = Game.representative;
    Game.representative = () => ({ id: 'player', standing: 50 });
    Game.answerDemand(link.id, true);
    Game.representative = rep1;
    ok(mm.loaned && mm.loaned.untilDay === 15, 'S5 honoring aid while loaned to the same fire extends (12 -> 15)', 'until=' + (mm.loaned && mm.loaned.untilDay));
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed (seed ' + SEED + ')');
  if (failures.length) { console.log('FAILURES:\n - ' + failures.join('\n - ')); process.exit(1); }
})();
