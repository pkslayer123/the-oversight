#!/usr/bin/env node
// REGIONAL AUDIT PROOF TEST (2026-10-09): the village -> regional layer.
// src/js/hierarchy.js + src/js/membership.js (+ minimal app.js/betrayal.js wiring).
//
// AUDIT VERDICTS UNDER TEST:
//  V1. THE REGIONAL DAWN did not exist: the first link was a say-line, not a
//      moment. FIX: stageFirstAccord/answerAccord — a played beat (System
//      overlay grows via networkLive; the player chooses Haven's first
//      gesture: gift / visit / cold — real costs, real consequences).
//  V2. proposeLink was a roll (score + noise, threshold 45). FIX: the middle
//      band (35-54) is a played counter-offer (accept / sweeten / walk away).
//  V3. The Haven panel listed EVERY village for proposals, met or not.
//      FIX: knowsVillage gate (rumored or generated).
//  V4. formAlliance had zero callers (and the "already allies" bonuses in
//      judgeLink/judgeApplication were unreachable). FIX: proposeAlliance
//      (opinion-gated, feast-priced) + guestMeal via recognizedAbroad.
//  V5. theirLeaderDied had zero callers. FIX: theirSpeaker is designated from
//      the sim's named roster at link formation; linkTick fires the mirror
//      beat when the sim kills them.
//  V6. scholar.rumors (village) was write-only — maybeVillageRumor queued,
//      nobody spoke. FIX: deliverVillageRumors, one/day at the day boundary.
//  V7. kingdomEndingEligible had no consumer. FIX: shown in the Haven panel
//      link row when earned (static assert on app.js).
//  V8. memberBenefits had no callers. FIX: rendered in the Haven panel
//      membership line (static assert on app.js).
//  V9. The courtship wraps sat on G.joinVillage (game.js) — which has NO
//      callers. The real join path is joinVillageReal. FIX: retargeted both
//      wraps (rejoinMembership + join news/opinion).
//  V10. m.loaned was write-only ("walks out for three days" — never away,
//      never home). FIX: awayMembers surfaces the loaned; loanedReturnTick
//      says the return aloud.
//  V11. pantryAccess was dead (one-liner, no callers, not in ontology).
//      FIX: removed.
//
// Usage: node scripts/test-regional-audit-20261009.js
//        SEED=7 node scripts/test-regional-audit-20261009.js
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
function pantryTotal() { return Game.pantryKcal ? Game.pantryKcal() : 0; }
const saidHas = (re) => SAID.some((t) => re.test(t));

(async () => {
  await Game.init();
  const osay = Game.say.bind(Game);
  Game.say = (t) => { SAID.push(String(t)); return osay(t); };
  Game.drama = () => {};
  Game.audioEvent = () => {};
  console.log(`seed=${SEED}`);

  // ============ V1. THE REGIONAL DAWN ============
  console.log('\n-- V1. first link stages the Regional Dawn (played beat) --');
  {
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true, opinion: 60 });
    Game.formAlliance('v1'); // courtship done the long way
    const link = Game.proposeLink('v1', { asSubordinate: true, tributeKcalPerWeek: 4000 });
    ok('V1a. high-courtship proposal forms a link', !!(link && link.id), 'got ' + JSON.stringify(link && link.id));
    ok('V1b. networkLive set — the System overlay grows', Game.state.networkLive === true);
    ok('V1c. pendingAccord staged for the link', !!(Game.state.pendingAccord && Game.state.pendingAccord.linkId === (link && link.id)));
    ok('V1d. the System speaks (coordination layer online)', saidHas(/Coordination layer: online/i));
    ok('V1e. the other fire watches what Haven does first', saidHas(/watching what Haven does FIRST/i));
  }
  {
    // gesture: gift — real food, real trust
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true, opinion: 60 });
    Game.formAlliance('v1');
    const link = Game.proposeLink('v1', { asSubordinate: true, tributeKcalPerWeek: 4000 });
    stockPantry(5000);
    const before = pantryTotal();
    const r = Game.answerAccord('gift');
    ok('V1f. gift gesture resolves', r === true);
    ok('V1g. 2,000 real kcal leaves the pantry', before - pantryTotal() === 2000, `before=${before} after=${pantryTotal()}`);
    ok('V1h. trust rises (30 -> 40)', link.trust === 40, 'trust=' + link.trust);
    ok('V1i. accord cleared', !Game.state.pendingAccord);
    ok('V1j. first gesture narrated honestly', saidHas(/first gesture: 2,000 kcal/i));
  }
  {
    // gesture: visit — the representative is really away
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true, opinion: 60 });
    Game.formAlliance('v1');
    const link = Game.proposeLink('v1', { asSubordinate: true, tributeKcalPerWeek: 4000 });
    const r = Game.answerAccord('visit');
    const rep = Game.representative();
    const loaned = Game.mshipState().loaned;
    ok('V1k. visit gesture resolves', r === true);
    ok('V1l. trust +8', link.trust === 38, 'trust=' + link.trust);
    if (rep && rep.id !== Game.villagerId) {
      ok('V1m. the representative is loaned (really away)', !!(loaned && loaned.vid === rep.id && loaned.untilDay === 33), JSON.stringify(loaned));
      ok('V1n. awayMembers shows them away', Game.awayMembers().indexOf(rep.id) >= 0);
    } else {
      ok('V1m. player-is-representative: you go yourself (honest)', saidHas(/You go yourself/i));
    }
  }
  {
    // gesture: cold — noted
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true, opinion: 60 });
    Game.formAlliance('v1');
    const link = Game.proposeLink('v1', { asSubordinate: true, tributeKcalPerWeek: 4000 });
    Game.answerAccord('cold');
    const ov = Game.state.otherVillages.find(x => x.id === 'v1');
    ok('V1o. cold gesture: opinion -3', ov.opinion === 57, 'opinion=' + ov.opinion);
    ok('V1p. cold narrated (first gestures remembered longest)', saidHas(/remembered longest/i));
    ok('V1q. trust unchanged by cold ink', link.trust === 30, 'trust=' + link.trust);
  }
  {
    // the dawn fires ONCE
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true, opinion: 60 });
    mkVillage('v2', 'Stonebridge', { generated: true, opinion: 60 });
    Game.formAlliance('v1'); Game.formAlliance('v2');
    Game.proposeLink('v1', { asSubordinate: true, tributeKcalPerWeek: 4000 });
    Game.answerAccord('cold');
    const l2 = Game.proposeLink('v2', { asSubordinate: false, tributeKcalPerWeek: 4000 });
    ok('V1r. second link forms', !!(l2 && l2.id));
    ok('V1s. no second accord beat', !Game.state.pendingAccord);
  }

  // ============ V2. PLAYED NEGOTIATION ============
  console.log('\n-- V2. counter-offer band is played, not rolled --');
  {
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true, opinion: 0 });
    // find an opinion that lands the score in the counter band [35,54]
    let bandOpinion = null, bandScore = 0;
    for (let op = -10; op <= 40; op += 5) {
      const v = Game.state.otherVillages[0]; v.opinion = op;
      const j = Game.judgeLink('v1', { asSubordinate: false, tributeKcalPerWeek: 4000 });
      if (j.score >= 35 && j.score < 55) { bandOpinion = op; bandScore = j.score; break; }
    }
    ok('V2a. a courtship level exists that counters (not auto-accept/decline)', bandOpinion !== null, 'score=' + bandScore);
    if (bandOpinion !== null) {
      const r = Game.proposeLink('v1', { asSubordinate: false, tributeKcalPerWeek: 4000 });
      ok('V2b. middle band stages a counter, not a roll', r === 'counter' && !!Game.state.pendingCounter, 'got ' + r);
      ok('V2c. their terms are named (tribute price)', /kcal\/week/.test(Game.state.pendingCounter.terms), Game.state.pendingCounter.terms);
    }
  }
  {
    // accept their terms
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true, opinion: 0 });
    Game._stageCounter('v1', { asSubordinate: false, tributeKcalPerWeek: 4000 });
    const link = Game.answerCounter('accept');
    ok('V2d. accept forms the link on THEIR terms', !!(link && link.id && link.subordinate === 'haven' && link.tributeKcalPerWeek === 5000),
      JSON.stringify(link && { sub: link.subordinate, trib: link.tributeKcalPerWeek }));
    ok('V2e. counter cleared', !Game.state.pendingCounter);
  }
  {
    // sweeten: pantry too thin — the table waits, honestly
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true, opinion: 0 });
    stockPantry(500); // not enough for the 1500 sweetener
    Game._stageCounter('v1', { asSubordinate: true, tributeKcalPerWeek: 4000 });
    const r = Game.answerCounter('sweeten');
    ok('V2f. thin pantry: sweetener refused, counter still on the table', r === 'counter' && !!Game.state.pendingCounter);
    ok('V2g. refusal is honest about the counting', saidHas(/watch you count/i));
  }
  {
    // sweeten: real food, re-judgment
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true, opinion: 0 });
    stockPantry(5000);
    Game._stageCounter('v1', { asSubordinate: true, tributeKcalPerWeek: 4000 });
    const before = pantryTotal();
    const r = Game.answerCounter('sweeten');
    ok('V2h. sweetener costs 1,500 real kcal', before - pantryTotal() === 1500, `delta=${before - pantryTotal()}`);
    ok('V2i. counter resolved either way (accepted at your terms, or refused with gift gone)',
      !Game.state.pendingCounter && (saidHas(/at YOUR terms/i) || saidHas(/turn you away anyway/i)));
  }
  {
    // walk away
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true, opinion: 20 });
    Game._stageCounter('v1', { asSubordinate: true, tributeKcalPerWeek: 4000 });
    const r = Game.answerCounter('walk');
    const ov = Game.state.otherVillages[0];
    ok('V2j. walking away clears the table', r === null && !Game.state.pendingCounter);
    ok('V2k. opinion remembers the walk (-3)', ov.opinion === 17, 'opinion=' + ov.opinion);
  }
  {
    // cold decline still declines
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true, opinion: -60 });
    const r = Game.proposeLink('v1', { asSubordinate: true, tributeKcalPerWeek: 4000 });
    ok('V2l. hostile village still declines outright', r === null && saidHas(/declines/i));
  }

  // ============ V3. KNOWLEDGE GATE ============
  console.log('\n-- V3. diplomacy is knowledge-gated --');
  {
    freshGame();
    const v = mkVillage('v1', 'Emberhold', {});
    ok('V3a. unheard-of village is not known', Game.knowsVillage(v) === false);
    v.rumored = true;
    ok('V3b. rumored village is known', Game.knowsVillage(v) === true);
    v.rumored = false; v.generated = true;
    ok('V3c. visited village is known', Game.knowsVillage(v) === true);
    v.generated = false; v.opinion = 12; // broadcast deeds move opinion from afar
    ok('V3d. afar-opinion alone is NOT knowledge', Game.knowsVillage(v) === false);
    const r = Game.proposeLink('v1', { asSubordinate: true, tributeKcalPerWeek: 4000 });
    ok('V3e. proposing to the unknown is refused honestly', r === null && saidHas(/don't know them well enough/i));
  }

  // ============ V4. ALLIANCE PLAYED ============
  console.log('\n-- V4. formAlliance / recognizedAbroad are reachable --');
  {
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true, opinion: 5 });
    stockPantry(5000);
    const r1 = Game.proposeAlliance('v1');
    ok('V4a. low regard: understanding refused with the path named', r1 === null && saidHas(/Sit at their fire/i));
    const v = Game.state.otherVillages[0]; v.opinion = 15;
    const before = pantryTotal();
    const r2 = Game.proposeAlliance('v1');
    ok('V4b. regard 15+: understanding sealed', r2 === true && Game.isAllied('haven', 'v1'));
    ok('V4c. the feast is real (1,500 kcal)', before - pantryTotal() === 1500, `delta=${before - pantryTotal()}`);
    ok('V4d. sealed-with-a-feast narrated', saidHas(/sealed with a feast/i));
    const r3 = Game.proposeAlliance('v1');
    ok('V4e. already allied: honest no-op', r3 === null && saidHas(/already holds/i));
  }
  {
    // the guest's meal
    freshGame();
    const v = mkVillage('v1', 'Emberhold', { generated: true, opinion: 15 });
    stockPantry(5000);
    Game.proposeAlliance('v1');
    Game.state.scholar.kcal = 1000;
    v.pantryKcal = 20000;
    const cap = Game.kcalCap ? Game.kcalCap() : 3000;
    const gained = Game.guestMeal('v1');
    ok('V4f. guest meal feeds (capped honestly)', gained === Math.min(1500, cap - 1000) && Game.state.scholar.kcal === Math.min(cap, 2500), `gained=${gained} kcal=${Game.state.scholar.kcal} cap=${cap}`);
    ok('V4g. their pantry feels it', v.pantryKcal === 18500, 'theirs=' + v.pantryKcal);
    const r2 = Game.guestMeal('v1');
    ok('V4h. once a day — guests, not locusts', r2 === null && saidHas(/Guests, not locusts/i));
    v.pantryKcal = 100;
    Game.state.scholar.day += 1;
    const r3 = Game.guestMeal('v1');
    ok('V4i. empty pot: honest refusal, no phantom food', r3 === null && saidHas(/nearly empty too/i));
  }
  {
    // no alliance, no meal
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true, opinion: 15 });
    const r = Game.guestMeal('v1');
    ok('V4j. unallied fire is not open', r === null && saidHas(/not open to you/i));
  }

  // ============ V5. THEIR SPEAKER DIES ============
  console.log('\n-- V5. theirLeaderDied fires when the sim kills the speaker --');
  {
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true, opinion: 60, roster: [
      { id: 'v1_p0', name: 'Mara Stone', age: 40, alive: true, partner: null, children: [] },
      { id: 'v1_p1', name: 'Joren Ash', age: 35, alive: true, partner: null, children: [] },
    ] });
    Game.formAlliance('v1');
    const link = Game.proposeLink('v1', { asSubordinate: true, tributeKcalPerWeek: 4000 });
    Game.answerAccord('cold');
    ok('V5a. speaker designated from the named roster', !!(link.theirSpeaker && link.theirSpeaker.name === 'Mara Stone'), JSON.stringify(link.theirSpeaker));
    link.trust = 60; // survive the succession without snapping
    const v = Game.state.otherVillages[0];
    v.roster[0].alive = false; // the sim's hunger takes Mara Stone
    const tribBefore = link.tributeKcalPerWeek;
    Game.mshipState().lastLinkWeek = -1; // force the weekly tick
    Game.state.scholar.day += 7;
    Game.linkTick();
    ok('V5b. mirror succession beat fires', saidHas(/speaker is dead/i));
    ok('V5c. Haven renegotiates in the chaos (tribute down)', link.tributeKcalPerWeek === Math.round(tribBefore * 0.75),
      `${tribBefore} -> ${link.tributeKcalPerWeek}`);
    ok('V5d. a new speaker is designated after', !!(link.theirSpeaker));
  }

  // ============ V6. RUMORS DELIVERED ============
  console.log('\n-- V6. traveler rumors reach the player --');
  {
    freshGame();
    const v = mkVillage('v9', 'Thornfield', {});
    Game.state.scholar.rumors = [{ type: 'village', villageId: 'v9', text: 'A traveler passed through yesterday, talking about a village to the north called Thornfield.', day: 30 }];
    Game.hierarchyDaily();
    ok('V6a. the rumor is spoken aloud', saidHas(/talking about a village to the north called Thornfield/i));
    ok('V6b. delivered once (no repeats)', (() => { const n = SAID.length; Game.hierarchyDaily(); return SAID.length === n; })());
    v.rumored = true; // maybeVillageRumor sets this alongside the queue
    ok('V6c. heard-of village is now a known proposal candidate', Game.knowsVillage(v) === true);
  }

  // ============ V7/V8. ENDING FRAME + BENEFITS ============
  console.log('\n-- V7/V8. ending frame + membership benefits --');
  {
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true, opinion: 60 });
    Game.formAlliance('v1');
    const link = Game.proposeLink('v1', { asSubordinate: true, tributeKcalPerWeek: 4000 });
    Game.answerAccord('cold');
    link.trust = 70; link.arrears = 0; link.day = 0;
    Game.state.scholar.day = 30;
    const ke = Game.kingdomEndingEligible();
    ok('V7a. valued-subordinate frame earned visibly', ke.eligible === true && ke.frame === 'the valued subordinate' && ke.linkId === link.id, JSON.stringify(ke));
    const ben = Game.memberBenefits();
    ok('V8a. memberBenefits lists the four benefits', Array.isArray(ben) && ben.length === 4, 'got ' + ben.length);
  }

  // ============ V9. COURTSHIP WRAP RETARGETED ============
  console.log('\n-- V9. joining fires the courtship (was dead on G.joinVillage) --');
  {
    freshGame();
    const v = mkVillage('v1', 'Emberhold', { generated: true, opinion: 0, news: ['💀 Joren died of hunger on day 12.', '🌱 A baby was born on day 20.'] });
    Game.joinVillageReal('v1');
    ok('V9a. joining moves their opinion (+5, once)', v.opinion === 5, 'opinion=' + v.opinion);
    ok('V9b. their history is read at the fire (news surfaced)', saidHas(/what the years did/) && saidHas(/Joren died of hunger/));
    ok('V9c. rejoinMembership fired (exile cleared)', Game.state.scholar.exiled === false);
    SAID.length = 0;
    Game.joinVillageReal('v1');
    ok('V9d. opinion gift is once per village (no farming)', v.opinion === 5, 'opinion=' + v.opinion);
  }

  // ============ V10. THE LOANED COME HOME ============
  console.log('\n-- V10. loaned representative is surfaced and returns --');
  {
    freshGame();
    mkVillage('v1', 'Emberhold', { generated: true, opinion: 60 });
    Game.formAlliance('v1');
    const link = Game.proposeLink('v1', { asSubordinate: true, tributeKcalPerWeek: 4000 });
    Game.answerAccord('cold');
    link.pendingDemand = { kind: 'aid', detail: 'Send your best for three days.' };
    Game.answerDemand(link.id, true);
    const loaned = Game.mshipState().loaned;
    const rep = Game.representative();
    if (rep && rep.id !== Game.villagerId) {
      ok('V10a. aid demand loans the representative', !!(loaned && loaned.vid === rep.id), JSON.stringify(loaned));
      ok('V10b. awayMembers shows them', Game.awayMembers().indexOf(rep.id) >= 0);
      Game.state.scholar.day = loaned.untilDay;
      Game.membershipDaily();
      ok('V10c. the return is said aloud', saidHas(/walks back in/i));
      ok('V10d. loan cleared', !Game.mshipState().loaned);
    } else {
      ok('V10a-d. SKIPPED (player is the representative this seed)', true);
    }
  }

  // ============ V11. DEAD CODE REMOVED ============
  console.log('\n-- V11. pantryAccess removed --');
  {
    ok('V11a. pantryAccess is gone', Game.pantryAccess === undefined);
  }

  // ============ STATIC: every previously-dead function now has a call site ============
  console.log('\n-- STATIC: built-but-unreachable is now wired --');
  {
    const hier = fs.readFileSync(path.join(ROOT, 'src/js/hierarchy.js'), 'utf8');
    const memb = fs.readFileSync(path.join(ROOT, 'src/js/membership.js'), 'utf8');
    const app = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
    const bet = fs.readFileSync(path.join(ROOT, 'src/js/betrayal.js'), 'utf8');
    ok('S1. theirLeaderDied called from linkTick', /self\.theirLeaderDied\(link\.id\)/.test(hier));
    ok('S2. formAlliance called by proposeAlliance', /this\.formAlliance\(villageId\)/.test(memb));
    ok('S3. recognizedAbroad gates guestMeal', /this\.recognizedAbroad\(this\.villagerId, ov\)/.test(memb));
    ok('S4. guestMeal reachable from village card', /actionId === 'guestmeal'/.test(bet) && /\bid: 'guestmeal'/.test(bet));
    ok('S5. kingdomEndingEligible rendered in panel', /kingdomEndingEligible\(\)/.test(app));
    ok('S6. memberBenefits rendered in panel', /memberBenefits\(\)/.test(app));
    ok('S7. accord buttons wired', /data-accord-gift/.test(app) && /answerAccord\('gift'\)/.test(app));
    ok('S8. counter buttons wired', /data-counter-accept/.test(app) && /answerCounter\('accept'\)/.test(app));
    ok('S9. alliance button wired', /data-ally-propose/.test(app) && /proposeAlliance\(b\.dataset\.allyPropose\)/.test(app));
    ok('S10. propose list knowledge-gated', /Game\.knowsVillage/.test(app));
    ok('S11. courtship wrap retargeted (no dead G.joinVillage wrap)', !/_joinVillageH\b/.test(hier) && /_joinVillageRealH/.test(hier));
    ok('S12. rejoin wrap retargeted', !/var _joinVillage = G\.joinVillage;/.test(memb) && /_joinVillageRealM/.test(memb));
    ok('S13. rumor delivery runs daily', /deliverVillageRumors\(\)/.test(hier));
    ok('S14. speaker designated at link formation', /this\._designateSpeaker\(link\)/.test(hier));
  }

  console.log(`\n==== ${pass} passed, ${fail} failed (seed=${SEED}) ====`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
