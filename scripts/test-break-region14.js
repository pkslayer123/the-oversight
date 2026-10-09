#!/usr/bin/env node
// BREAK-IT REGIONAL/HIERARCHY PROOF TEST (2026-10-09, target 14).
// Hostile-player attacks on src/js/hierarchy.js + src/js/membership.js
// (+ one betrayal.js wiring line), and the fixes.
//
// BREAKS FOUND & FIXED:
//  B1. TRIBUTE PARTIAL DOUBLE-COUNT: payTribute added (owed - paid) to
//      arrears on a short payment, and linkTick then added the FULL owed on
//      top — paying half was strictly worse than paying nothing.
//      FIX: the week's payments accumulate in link.tributePaidKcal;
//      linkTick charges the true shortfall exactly once.
//  B2. FREE TRUST ON EMPTY HANDS: answerDemand('tribute', accept) granted
//      the full +8 trust even when the pantry was empty and 0 kcal moved,
//      narrated as "It hurts." FIX: honor is proportional (trust follows
//      the food), honest copy, the gap becomes arrears.
//  B2b. AID DEMAND WITH NOBODY TO SEND granted +8 silently; an in-flight
//      m.loaned was silently overwritten. FIX: partial trust + honest copy;
//      extend-or-send-word instead of clobbering.
//  B2c. ACCORD 'visit' overwrote an in-flight m.loaned. FIX: the gesture
//      becomes a message (trust +4), the loan record survives.
//  B3. SAME-SESSION RENEGOTIATION GRIND: renegotiateLink/bidForPrimacy had
//      no pacing — tribute ground to the 500 floor in one sitting.
//      FIX: the table is a weekly verb (link.lastTableWeek).
//  B4. GUEST MEAL AT CAP burned 1,500 of the ally's food for +0 gain.
//      FIX: a full player isn't served; partial room serves partially.
//  B5. memberReputationAbroad was dead code with a lying comment (claimed
//      judgeApplication used it). FIX: wired into the betrayal.js petition
//      judgment — "We've heard about Haven" is the reputation-abroad
//      moment; comment corrected.
//
// HELD (attacked, resisted):
//  H1. breakLink+relink farming: relink after a gambit costs -30 opinion and
//      the whole courtship — the climb gets harder, not farmable.
//  H2. Threshold honesty: score>=55 accepts, 35-54 counters (played), <35
//      declines — verified with stubbed scores.
//  H3. stageFirstAccord cannot double-stage (networkLive guard).
//  H4. successionCrisis snaps honestly at trust<20; theirLeaderDied fires
//      from linkTick's speaker watch; empty rosters don't crash.
//  H5. Dead-code sweep: every @ontology-provided function in both modules
//      is reachable (UI buttons, the endDay wrap chain, or internal calls).
//
// Usage: node scripts/test-break-region14.js
//        SEED=7 node scripts/test-break-region14.js
// Green required across >= 3 seeds.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261009', 10);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(SEED); // seeded BEFORE eval: modules capture Math.random at load

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js touches window at load (browser-only in prod)
// FULL script list in index.html order, minus DOM-only (app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js)
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FILES = [...html.matchAll(/<script src="(src\/js\/[^"]+)\?/g)].map(m => m[1])
  .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
for (const f of FILES) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window; // drop the stub: runtime checks take the sync path without window
const Game = globalThis.Scattering && globalThis.Scattering.Game;
if (!Game) { console.error('FATAL: Game did not load'); process.exit(2); }

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

const SAID = [];
function freshGame() {
  SAID.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = 30; s.kcal = 3000; s.health = 100; s.exiled = false;
  Game.state.systemArrived = true;
  Game.state.village.trust = Game.state.village.trust || {};
  Game.state.village.severed = {};
  Game.state.village.pantry = [];
  Game.state.otherVillages = [];
  return s;
}
function mkVillage(id, name, o) {
  o = o || {};
  const v = {
    id: id, name: name, x: 1, y: 1,
    population: 10, day: 20, pantryKcal: 20000,
    opinion: o.opinion != null ? o.opinion : 0,
    generated: !!o.generated, rumored: !!o.rumored,
    news: o.news || [],
    roster: o.roster || [{ id: id + '_p0', name: 'Mara Stone', age: 40, alive: true, partner: null, children: [] }],
  };
  Game.state.otherVillages.push(v);
  return v;
}
function stockPantry(kcal) {
  Game.state.village.pantry.push({ name: 'test food', kcalEach: 500, units: Math.ceil(kcal / 500), spoilDay: 9999 });
}
function mkLink(vid, trib) {
  const link = Game._formLink(vid, { asSubordinate: true, tributeKcalPerWeek: trib || 4000 });
  Game.answerAccord('cold'); // clear the dawn beat so it doesn't interfere
  SAID.length = 0;
  return link;
}
const saidHas = (re) => SAID.some((t) => re.test(t));
function forceLinkTick() {
  Game.state.village.mship.lastLinkWeek = -1;
  Game.linkTick();
}

(async () => {
  await Game.init();
  const osay = Game.say.bind(Game);
  Game.say = (t) => { SAID.push(String(t)); return osay(t); };
  Game.drama = () => {};
  Game.audioEvent = () => {};
  console.log(`seed=${SEED}`);

  // ============ B1. TRIBUTE PARTIAL DOUBLE-COUNT ============
  console.log('\n-- B1. partial tribute is charged once, not twice --');
  {
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true });
    const link = mkLink('v1', 4000);
    stockPantry(2000);
    const paid = Game.payTribute(link.id);
    ok('B1a. partial payment moves real food', paid === 2000, 'paid=' + paid);
    ok('B1b. arrears NOT charged at payment time', link.arrears === 0, 'arrears=' + link.arrears);
    ok('B1c. credit accumulates for the week', link.tributePaidKcal === 2000, 'credit=' + link.tributePaidKcal);
    const trustBefore = link.trust;
    forceLinkTick();
    ok('B1d. week-end charges the TRUE shortfall once (2000, not 6000)', link.arrears === 2000, 'arrears=' + link.arrears);
    ok('B1e. trust -6 for the short week', link.trust === trustBefore - 6, 'trust=' + link.trust);
  }
  {
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true });
    const link = mkLink('v1', 4000);
    stockPantry(100); // nothing meaningful
    forceLinkTick();
    ok('B1f. paying nothing: arrears = one full tribute', link.arrears === 4000, 'arrears=' + link.arrears);
  }
  {
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true });
    const link = mkLink('v1', 4000);
    stockPantry(5000);
    Game.payTribute(link.id);
    ok('B1g. full payment: arrears cleared, week settled', link.arrears === 0 && link.tributePaidWeek === Game._week(), JSON.stringify({ a: link.arrears, w: link.tributePaidWeek }));
    ok('B1h. full payment: trust +3', link.trust === 33, 'trust=' + link.trust);
    forceLinkTick();
    ok('B1i. settled week: no arrears, trust +1', link.arrears === 0 && link.trust === 34, 'trust=' + link.trust);
  }
  {
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true });
    const link = mkLink('v1', 4000);
    stockPantry(5000);
    Game.payTribute(link.id, 1500);
    Game.payTribute(link.id, 2500);
    ok('B1j. two partials accumulate to a full settlement', link.tributePaidWeek === Game._week() && link.arrears === 0, JSON.stringify({ w: link.tributePaidWeek, a: link.arrears }));
  }

  // ============ B2. DEMAND HONOR IS PROPORTIONAL ============
  console.log('\n-- B2. demand honor follows the food --');
  {
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true });
    const link = mkLink('v1', 4000);
    link.trust = 50;
    // empty pantry, tribute demand accepted
    link.pendingDemand = { kind: 'tribute', costKcal: 2000, detail: 'An extra 2,000 kcal, now.' };
    Game.answerDemand(link.id, true);
    ok('B2a. empty pantry: NO free +8 trust', link.trust === 50, 'trust=' + link.trust);
    ok('B2b. empty pantry: honest copy (all the pantry holds)', saidHas(/all the pantry holds/i));
    ok('B2c. the gap becomes arrears', link.arrears === 2000, 'arrears=' + link.arrears);
    ok('B2d. demand cleared', !link.pendingDemand);
  }
  {
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true });
    const link = mkLink('v1', 4000);
    link.trust = 50;
    stockPantry(1000); // half the demand
    link.pendingDemand = { kind: 'tribute', costKcal: 2000, detail: 'An extra 2,000 kcal, now.' };
    Game.answerDemand(link.id, true);
    ok('B2e. half paid: trust +4 (proportional)', link.trust === 54, 'trust=' + link.trust);
    ok('B2f. half paid: honest numbers in copy', saidHas(/1,000 of 2,000/i));
    ok('B2g. half paid: remainder to arrears', link.arrears === 1000, 'arrears=' + link.arrears);
  }
  {
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true });
    const link = mkLink('v1', 4000);
    link.trust = 50;
    stockPantry(5000);
    link.pendingDemand = { kind: 'tribute', costKcal: 2000, detail: 'An extra 2,000 kcal, now.' };
    Game.answerDemand(link.id, true);
    ok('B2h. full honor: trust +8, "it hurts"', link.trust === 58 && saidHas(/It hurts/i), 'trust=' + link.trust);
  }
  {
    // aid demand while the rep is already loaned to the SAME primary
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true });
    const link = mkLink('v1', 4000);
    link.trust = 50;
    const rep = Game.representative();
    const day = Game.state.scholar.day;
    Game.mshipState().loaned = { vid: rep ? rep.id : 'nobody', untilDay: day + 3, to: 'v1' };
    const untilBefore = Game.mshipState().loaned.untilDay;
    link.pendingDemand = { kind: 'aid', detail: 'Send your best for three days.' };
    Game.answerDemand(link.id, true);
    const loaned = Game.mshipState().loaned;
    ok('B2i. in-flight loan EXTENDED, not clobbered', loaned && loaned.untilDay === untilBefore + 3 && loaned.to === 'v1', JSON.stringify(loaned));
    ok('B2j. staying on counts, barely (trust +4)', link.trust === 54, 'trust=' + link.trust);
    ok('B2k. honest copy (stay on)', saidHas(/stay on three more days/i));
  }
  {
    // aid demand while the rep is loaned ELSEWHERE
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true });
    mkVillage('v2', 'Stonebridge', { generated: true });
    const link = mkLink('v1', 4000);
    link.trust = 50;
    const rep = Game.representative();
    const day = Game.state.scholar.day;
    Game.mshipState().loaned = { vid: rep ? rep.id : 'nobody', untilDay: day + 3, to: 'v2' };
    link.pendingDemand = { kind: 'aid', detail: 'Send your best for three days.' };
    Game.answerDemand(link.id, true);
    const loaned = Game.mshipState().loaned;
    ok('B2l. loan elsewhere untouched', loaned && loaned.to === 'v2' && loaned.untilDay === day + 3, JSON.stringify(loaned));
    ok('B2m. partial honor (trust +3)', link.trust === 53, 'trust=' + link.trust);
    ok('B2n. honest copy (can\'t send them twice)', saidHas(/can't send them twice/i));
  }
  {
    // aid demand with nobody to send
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true });
    const link = mkLink('v1', 4000);
    link.trust = 50;
    Game.state.village.roster = [];
    link.pendingDemand = { kind: 'aid', detail: 'Send your best for three days.' };
    Game.answerDemand(link.id, true);
    ok('B2o. empty bench: no phantom loan, partial trust +3', link.trust === 53 && !Game.mshipState().loaned, 'trust=' + link.trust);
    ok('B2p. honest copy (bench is empty)', saidHas(/bench is empty/i));
  }
  {
    // accord visit while the rep is already loaned
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true });
    const rep = Game.representative();
    const day = Game.state.scholar.day;
    if (rep && rep.id !== Game.villagerId) {
      Game.mshipState().loaned = { vid: rep.id, untilDay: day + 3, to: 'v2' };
      const link = Game._formLink('v1', { asSubordinate: true, tributeKcalPerWeek: 4000 });
      const trustBefore = link.trust;
      Game.answerAccord('visit');
      const loaned = Game.mshipState().loaned;
      ok('B2q. accord visit does not clobber the loan', loaned && loaned.to === 'v2' && loaned.untilDay === day + 3, JSON.stringify(loaned));
      ok('B2r. gesture becomes a message (trust +4)', link.trust === trustBefore + 4, 'trust=' + link.trust);
    } else {
      ok('B2q-r. SKIPPED (player is the representative this seed)', true);
    }
  }

  // ============ B3. THE TABLE IS A WEEKLY VERB ============
  console.log('\n-- B3. renegotiation pacing --');
  {
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true });
    const link = mkLink('v1', 4000);
    const r1 = Game.renegotiateLink(link.id);
    const tribAfterR1 = link.tributeKcalPerWeek;
    const r2 = Game.renegotiateLink(link.id);
    ok('B3a. second round same week refused', r2 === false && saidHas(/weekly verb/i), 'r2=' + r2);
    ok('B3b. tribute untouched by the refused round', link.tributeKcalPerWeek === tribAfterR1, 'trib=' + link.tributeKcalPerWeek);
    ok('B3c. first round happened (lock recorded)', link.lastTableWeek === Game._week(), 'lastTableWeek=' + link.lastTableWeek);
    void r1;
  }
  {
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true });
    const link = mkLink('v1', 4000);
    link.trust = 70;
    // force the standing gate open so the weekly lock is what answers
    const oRS = Game.regionalStanding, oVS = Game.villageStandingOf;
    Game.regionalStanding = () => 100; Game.villageStandingOf = () => 50;
    link.lastTableWeek = Game._week();
    const r = Game.bidForPrimacy(link.id);
    Game.regionalStanding = oRS; Game.villageStandingOf = oVS;
    ok('B3d. bid blocked same week as a table round', r === null && saidHas(/weekly verb/i), 'r=' + r);
  }
  {
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true });
    const link = mkLink('v1', 4000);
    link.trust = 70;
    const oRS = Game.regionalStanding, oVS = Game.villageStandingOf;
    Game.regionalStanding = () => 100; Game.villageStandingOf = () => 50;
    Game.renegotiateLink(link.id); // consumes the week
    const tribAfter = link.tributeKcalPerWeek;
    const r = Game.bidForPrimacy(link.id); // same week, different verb
    Game.regionalStanding = oRS; Game.villageStandingOf = oVS;
    ok('B3e. renegotiate then bid same week: bid refused', r === null && saidHas(/weekly verb/i), 'r=' + r);
    ok('B3f. no double-dip on tribute', link.tributeKcalPerWeek === tribAfter, 'trib=' + link.tributeKcalPerWeek);
  }

  // ============ B4. GUEST MEAL NEVER WASTES ============
  console.log('\n-- B4. guest meal at cap --');
  {
    freshGame();
    const v = mkVillage('v1', 'Emberhold', { generated: true, opinion: 15 });
    stockPantry(5000);
    Game.proposeAlliance('v1');
    v.pantryKcal = 20000;
    const cap = Game.kcalCap ? Game.kcalCap() : 3000;
    Game.state.scholar.kcal = cap; // full
    const r = Game.guestMeal('v1');
    ok('B4a. full player is not served', r === null, 'r=' + r);
    ok('B4b. their pantry untouched', v.pantryKcal === 20000, 'theirs=' + v.pantryKcal);
    ok('B4c. honest copy (come back hungry)', saidHas(/come back hungry/i));
    ok('B4d. the day-slot is NOT burned (can return hungry)', !(Game.mshipState().lastGuestMeal || {})['v1']);
  }
  {
    freshGame();
    const v = mkVillage('v1', 'Emberhold', { generated: true, opinion: 15 });
    stockPantry(5000);
    Game.proposeAlliance('v1');
    v.pantryKcal = 20000;
    const cap = Game.kcalCap ? Game.kcalCap() : 3000;
    Game.state.scholar.kcal = cap - 500; // partial room
    const r = Game.guestMeal('v1');
    ok('B4e. partial room serves partially', r === 500, 'r=' + r);
    ok('B4f. their pantry charged only the serving', v.pantryKcal === 19500, 'theirs=' + v.pantryKcal);
    ok('B4g. player topped to cap, not over', Game.state.scholar.kcal === cap, 'kcal=' + Game.state.scholar.kcal);
  }

  // ============ B5. memberReputationAbroad IS WIRED ============
  console.log('\n-- B5. the name travels (dead hook wired) --');
  {
    const bet = fs.readFileSync(path.join(ROOT, 'src/js/betrayal.js'), 'utf8');
    ok('B5a. petition judgment consumes memberReputationAbroad', /memberReputationAbroad\(this\.villagerId\)/.test(bet));
    freshGame();
    const rMember = Game.memberReputationAbroad(Game.villagerId);
    ok('B5b. member gets a standing-based modifier (number)', typeof rMember === 'number', 'r=' + rMember);
    Game.severMembership(Game.villagerId);
    const rSev = Game.memberReputationAbroad(Game.villagerId);
    ok('B5c. the severed carry the cut (-10)', rSev === -10, 'r=' + rSev);
  }

  // ============ H2. THRESHOLD HONESTY (stubbed scores) ============
  console.log('\n-- H2. negotiation thresholds do what copy promises --');
  {
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true, opinion: 0 });
    const oj = Game.judgeLink;
    Game.judgeLink = function () { return { score: 60, reasons: ['earned'], rep: null }; };
    const link = Game.proposeLink('v1', { asSubordinate: true, tributeKcalPerWeek: 4000 });
    Game.judgeLink = oj;
    ok('H2a. score>=55: accepts, forms the link', !!(link && link.id), 'got=' + JSON.stringify(link && link.id));
  }
  {
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true, opinion: 0 });
    const oj = Game.judgeLink;
    Game.judgeLink = function () { return { score: 45, reasons: ['close'], rep: null }; };
    const r = Game.proposeLink('v1', { asSubordinate: false, tributeKcalPerWeek: 4000 });
    Game.judgeLink = oj;
    ok('H2b. 35-54: stages a played counter', r === 'counter' && !!Game.state.pendingCounter, 'got=' + r);
    Game.state.pendingCounter = null;
  }
  {
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true, opinion: 0 });
    const oj = Game.judgeLink;
    Game.judgeLink = function () { return { score: 20, reasons: ['cold'], rep: null }; };
    const r = Game.proposeLink('v1', { asSubordinate: true, tributeKcalPerWeek: 4000 });
    Game.judgeLink = oj;
    ok('H2c. <35: declines', r === null && saidHas(/declines/i), 'got=' + r);
  }

  // ============ H3/H4. SOFTLOCK BATTERY ============
  console.log('\n-- H3/H4. softlock battery --');
  {
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true });
    const link = Game._formLink('v1', { asSubordinate: true, tributeKcalPerWeek: 4000 });
    const paBefore = Game.state.pendingAccord;
    const r = Game.stageFirstAccord(link);
    ok('H3a. Regional Dawn cannot double-stage', r === null && Game.state.networkLive === true, 'r=' + r);
    ok('H3b. single pending accord', Game.state.pendingAccord === paBefore);
    Game.answerAccord('cold');
  }
  {
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true });
    const link = mkLink('v1', 4000);
    link.trust = 10;
    const r = Game.successionCrisis(link.id);
    ok('H4a. low-trust succession snaps the link', r === 'broken' && link.status === 'broken', 'r=' + r);
  }
  {
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true });
    const link = mkLink('v1', 4000);
    link.trust = 50;
    const tribBefore = link.tributeKcalPerWeek;
    const r = Game.theirLeaderDied(link.id);
    ok('H4b. theirLeaderDied: tribute renegotiated down in the chaos', r === true && link.tributeKcalPerWeek === Math.round(tribBefore * 0.75), 'trib=' + link.tributeKcalPerWeek);
    ok('H4c. theirLeaderDied: trust -15', link.trust === 35, 'trust=' + link.trust);
  }
  {
    // speaker designated from the named roster; sim kills them; mirror beat fires; no crash
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true, roster: [{ id: 'v1_p0', name: 'Mara Stone', age: 40, alive: true }] });
    const link = mkLink('v1', 4000);
    ok('H4d. speaker is a named person', !!(link.theirSpeaker && link.theirSpeaker.id === 'v1_p0' && link.theirSpeaker.name === 'Mara Stone'), JSON.stringify(link.theirSpeaker));
    Game.state.otherVillages[0].roster[0].alive = false; // the sim takes them
    forceLinkTick();
    ok('H4e. the mirror succession beat fires', saidHas(/speaker is dead/i));
    ok('H4f. link survives, no crash', link.status === 'active');
  }
  {
    // empty roster: no speaker possible — must not crash, must not softlock
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true, roster: [] });
    let threw = false, link = null;
    try {
      link = mkLink('v1', 4000);
      forceLinkTick();
    } catch (e) { threw = true; }
    ok('H4g. speakerless village: no crash, no softlock', !threw && link && link.status === 'active' && link.theirSpeaker == null, 'threw=' + threw);
  }

  // ============ H5. DEAD-CODE SWEEP ============
  console.log('\n-- H5. every provided function is reachable --');
  {
    const hier = fs.readFileSync(path.join(ROOT, 'src/js/hierarchy.js'), 'utf8');
    const memb = fs.readFileSync(path.join(ROOT, 'src/js/membership.js'), 'utf8');
    const app = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
    const bet = fs.readFileSync(path.join(ROOT, 'src/js/betrayal.js'), 'utf8');
    const all = hier + memb + app + bet;
    const provided = [
      // hierarchy.js provides
      'hierarchyState', 'linkWith', 'knowsVillage', 'linkStanding', 'breakLink',
      'judgeLink', 'proposeLink', 'answerCounter', 'answerDemand', 'payTribute',
      'hierarchyDaily', 'linkTick', 'onLeaderDeath', 'theirLeaderDied',
      'stageFirstAccord', 'answerAccord', 'deliverVillageRumors',
      'kingdomEndingEligible',
      // membership.js provides
      'isMember', 'mshipState', 'memberBenefits', 'awayMembers',
      'acceptApplication', 'refuseApplication', 'genApplicant', 'judgeApplication',
      'considerApplications', 'debateIntake', 'rejoinMembership', 'severMembership',
      'housingCap', 'buildShelter', 'foodSupports', 'growthStatus',
      'regionalStanding', 'villageStandingOf', 'formAlliance', 'proposeAlliance',
      'isAllied', 'recognizedAbroad', 'memberReputationAbroad', 'guestMeal',
      'loanedReturnTick', 'membershipDaily',
    ];
    let dead = [];
    for (const fn of provided) {
      // a definition plus at least one call site that isn't the definition itself
      const defRe = new RegExp('\\b' + fn + '\\s*\\(');
      const defs = (all.match(defRe) || []).length;
      const calls = (all.match(new RegExp('[^\\w.]' + fn + '\\s*\\(', 'g')) || []).length;
      const thisCalls = (all.match(new RegExp('this\\.' + fn + '\\s*\\(', 'g')) || []).length;
      const selfCalls = (all.match(new RegExp('self\\.' + fn + '\\s*\\(', 'g')) || []).length;
      const gameCalls = (all.match(new RegExp('Game\\.' + fn + '\\s*\\(', 'g')) || []).length;
      if (thisCalls + selfCalls + gameCalls === 0) dead.push(fn);
    }
    ok('H5a. no fully-dead provided functions', dead.length === 0, 'dead=' + JSON.stringify(dead));
    // the endDay wrap chain: the daily loop actually runs
    ok('H5b. membershipDaily rides the day boundary', /G\.endDay = function[\s\S]*?this\.membershipDaily\(\)/.test(memb));
    ok('H5c. hierarchyDaily rides membershipDaily', /G\.membershipDaily = function[\s\S]*?this\.hierarchyDaily\(\)/.test(hier));
    // UI reachability for the player verbs
    for (const d of ['data-link-pay', 'data-counter-accept', 'data-accord-gift', 'data-demand-yes', 'data-link-reneg', 'data-link-bid', 'data-link-break', 'data-ally-propose']) {
      ok('H5d. UI button ' + d, app.indexOf(d) >= 0);
    }
  }

  console.log(`\n==== ${pass} passed, ${fail} failed (seed=${SEED}) ====`);
  process.exit(fail ? 1 : 0);
})();
