#!/usr/bin/env node
// PLAYTEST (Steve 2026-10-07), SOCIALITE archetype round 4.
// Player-first pass on the CURRENT committed master (b372ec6): form a real
// party via conversation invites, travel with companions, dismiss someone,
// then exercise the spread_rumor drama verb end-to-end (fix 9eaf4bb live).
// Verdict focus: is party building FUN or chores? What frictions bite?
// RNG seeded mulberry32 (default 20261007, SEED env override).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let _seed = parseInt(process.env.SEED || '20261007', 10) >>> 0;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(_seed);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const makeEl = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {},
  setAttribute() {}, addEventListener() {}, removeEventListener() {}, querySelector() { return null; },
  querySelectorAll() { return []; }, contains() { return false; }, innerHTML: '', textContent: '' });
global.document = { createElement: makeEl, body: makeEl(), head: makeEl(),
  getElementById() { return null; }, querySelector() { return null; },
  querySelectorAll() { return []; }, contains() { return false; }, addEventListener() {} };

const ORDER = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/src\/js\/[^\"]+\.js/g) || []);
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js']);
global.window = global;
for (const f of ORDER) {
  if (SKIP.has(f)) continue;
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL', f, e.message); process.exit(1); }
}
delete global.window;
delete global.document;
const Game = globalThis.Scattering.Game;

const says = [];
const results = [];
const note = (t) => console.log(t);
const check = (name, cond, extra) => {
  results.push([name, !!cond]);
  note(`   [${cond ? 'OK' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`);
};
const dname = (vid) => { try { return Game.displayName(vid); } catch (e) { return String(vid); } };
const choiceIds = (vid) => Game.convoUI(vid).choices.map(c => c.id);
function baseMenu(vid) {
  Game.startConvo(vid);
  let ids = choiceIds(vid);
  if (ids.includes('dlg:subject')) { says.length = 0; Game.convoTurn(vid, 'dlg:subject'); ids = choiceIds(vid); }
  return ids;
}
function endConvo(vid) { says.length = 0; try { Game.endConvo(vid, 'left'); } catch (e) {} }

(async () => {
  await Game.init();
  const os = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return os(t); };
  note('=== SOCIALITE ROUND 4 (seed ' + _seed + ', committed b372ec6) ===');

  Game.genRoster('Columbus, Ohio');
  const roster = Game.generatedRoster || [];
  const pick = roster.find(c => /lawyer|mediator|diplomat|counselor|teacher|organizer/i.test((c.formerOccupation || '') + ' ' + (c.name || ''))) || roster[0];
  Game.newGame('Columbus, Ohio', null, pick.id);
  Game.depart();
  const s = Game.state.scholar;
  const me = (Game.state.village.rosterChars || {})[Game.villagerId] || {};
  note(`   playing as: ${me.name || pick.name} (${me.formerOccupation || '?'})`);
  const villagers = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  note(`   haven villagers: ${villagers.length}`);

  // ============ ACT 1: day 1, work the room as a player ============
  note('\n=== ACT 1: day 1 — work the room ===');
  let intros = 0, trustSum = 0;
  for (const vid of villagers.slice(0, 5)) {
    says.length = 0;
    Game.startConvo(vid);
    let ids = choiceIds(vid);
    // play the opening: introduce self if that's the offered move
    const intro = ids.find(i => /intro/i.test(i));
    if (intro) { Game.convoTurn(vid, intro); intros++; }
    const trust = (Game.state.village.trust || {})[vid] || 10;
    trustSum += trust;
    note(`   met ${dname(vid)} (${me.name ? '' : ''}${(Game.state.village.rosterChars[vid] || {}).formerOccupation || '?'}, trust ${trust})`);
    endConvo(vid);
  }
  note(`   introductions completed: ${intros}/5, avg trust ${(trustSum / 5).toFixed(0)}`);

  // ============ ACT 2: fast-forward to system arrival (day 7) ============
  note('\n=== ACT 2: days 2-8 — simulate to system arrival ===');
  says.length = 0;
  let guard = 0;
  try {
    while (Game.state.scholar.day < 8 && guard++ < 20 && !Game.over) {
      // keep the player alive through the fast-forward: eat something if hungry
      const sch = Game.state.scholar;
      if ((sch.kcal || 0) < 400) {
        try {
          const pack = sch.pack || [];
          const food = pack.find(i => i && i.kcal > 50 && !i.spoiled);
          if (food) Game.eatOne(pack.indexOf(food));
        } catch (e) {}
      }
      Game.endDay();
    }
  } catch (e) { note('   endDay threw: ' + e.message); }
  note(`   day ${Game.state.scholar.day}, over=${!!Game.over}, health=${Math.round(Game.state.scholar.health || 0)}`);
  const ps = Game.partyState();
  note(`   day ${Game.state.scholar.day}, systemArrived=${!!Game.state.systemArrived}, partyUnlocked=${!!ps.partyUnlocked}, partyDiscovered=${Game.hasDiscovered ? Game.hasDiscovered('party') : 'n/a'}`);
  check('party system unlocked on schedule', !!Game.state.systemArrived && !!ps.partyUnlocked && Game.state.scholar.codexUnlocked,
    `partyMax=${ps.partyMax}`);
  const firehose = says.filter(t => /^🌟|^Not with light|^A voice behind/i).length;
  note(`   arrival cinematic lines captured: ${says.length} (first: ${(says[0] || '').slice(0, 90)})`);

  // ============ ACT 3: recruit — talk people up to trust 20, then invite ============
  note('\n=== ACT 3: recruit a party via conversation invites ===');
  const trustOf = (vid) => (Game.state.village.trust || {})[vid] || 10;
  // honest trust building: hold 2 conversations with small talk / compliments
  const candidates = villagers.slice(0, 4);
  for (const vid of candidates) {
    for (let r = 0; r < 2; r++) {
      says.length = 0;
      const ids = baseMenu(vid);
      // take the first rapport-building ask available
      const ask = ids.find(i => /^ask:/.test(i) && !/spread_rumor/.test(i));
      if (ask) Game.convoTurn(vid, ask);
      endConvo(vid);
    }
    note(`   ${dname(vid)}: trust now ${trustOf(vid)}`);
  }
  // now try invites
  const invited = [], declined = [];
  for (const vid of candidates) {
    says.length = 0;
    const ids = baseMenu(vid);
    const canInvite = ids.includes('invite_party');
    note(`   ${dname(vid)}: trust ${trustOf(vid)}, invite choice ${canInvite ? 'PRESENT' : 'absent'}`);
    if (canInvite) {
      says.length = 0;
      Game.convoTurn(vid, 'invite_party');
      const joined = Game.inParty(vid);
      const line = says.filter(t => /joins your party|shakes their head|System squints/i.test(t)).join(' ').slice(0, 220);
      note(`      → ${joined ? 'JOINED' : 'declined'}: ${line}`);
      (joined ? invited : declined).push(vid);
    }
    endConvo(vid);
  }
  check('at least one villager joined via conversation invite', invited.length >= 1,
    `joined: ${invited.map(dname).join(', ') || 'none'}; declined: ${declined.map(dname).join(', ') || 'none'}`);
  note(`   party: [${Game.partyMembers().map(dname).join(', ')}] (cap ${Game.partyCap()})`);

  // ============ ACT 4: travel with the party — feel ============
  note('\n=== ACT 4: travel with companions ===');
  if (Game.partyMembers().length) {
    says.length = 0;
    const before = Game.state.scholar.loc;
    try {
      Game.travelTo('meadow');
      note(`   traveled: ${before} → ${Game.state.scholar.loc}`);
      const travelers = Game.travelingWith().map(dname).join(', ');
      note(`   traveling with: ${travelers}`);
      check('party members travel with the player', Game.partyMembers().every(id => Game.travelingWith().includes(id)), travelers);
    } catch (e) { note('   travelTo threw: ' + e.message); check('travel with party did not crash', false, e.message); }
  } else {
    note('   (no party — skipping travel leg)');
  }

  // ============ ACT 5: dismiss — the sting ============
  note('\n=== ACT 5: dismiss someone ===');
  if (Game.partyMembers().length) {
    const out = Game.partyMembers()[0];
    const tBefore = trustOf(out);
    says.length = 0;
    const r = Game.dismissFromParty(out);
    const sting = says.filter(t => /You ask .* to leave/i.test(t)).join(' ').slice(0, 200);
    note(`   dismissed ${dname(out)}: trust ${tBefore} → ${trustOf(out)}`);
    note(`   line: ${sting || r.msg}`);
    check('dismissal costs trust and stings in-fiction', trustOf(out) < tBefore && /remember|understand|loss/i.test(sting + r.msg),
      `trust Δ${trustOf(out) - tBefore}`);
  }

  // ============ ACT 6: the drama verb, live, as a player ============
  note('\n=== ACT 6: spread_rumor live (fix 9eaf4bb) ===');
  const talker = villagers.find(v => baseMenu(v).includes('ask:spread_rumor'));
  check('spread_rumor reachable in real conversation', !!talker, talker ? dname(talker) : 'none found');
  if (talker) {
    endConvo(talker);
    says.length = 0;
    baseMenu(talker);
    says.length = 0;
    Game.convoTurn(talker, 'ask:spread_rumor');
    const promptLine = says.filter(t => /talking about|word on|hearing/i.test(t)).join(' ').slice(0, 160);
    note(`   prompt: ${promptLine}`);
    const ids = choiceIds(talker);
    // FLAG DUMP: is a stale hanging question suppressing the rumor thread?
    const cv = (Game.state.village.conv || {})[talker] || {};
    note(`   convo flags: thread=${cv.thread} rumorDone=${cv.rumorDone} pendingQ=${!!cv.pendingQ} reactiveQ=${!!cv.reactiveQ} genericQ=${cv.genericQ ? JSON.stringify(cv.genericQ.q).slice(0, 60) : 'null'}`);
    const tgt = ids.find(i => /^rumor:tgt:/.test(i));
    check('rumor target selection offered', !!tgt, tgt || 'none — choices were: ' + ids.slice(0, 6).join(', '));
    let rumor = null;
    if (tgt) {
      Game.convoTurn(talker, tgt);
      const t2 = choiceIds(talker).find(i => /^rumor:type:/.test(i));
      check('rumor type selection offered', !!t2, t2 || 'none');
      if (t2) {
        says.length = 0;
        Game.convoTurn(talker, t2);
        rumor = (Game.state.village.gossip || []).find(g => g.playerRumor);
        check('player rumor seeded with first hearer', !!(rumor && rumor.heard && rumor.heard.length),
          rumor ? `about ${dname(rumor.dims.who)}, heard=[${(rumor.heard || []).map(dname).join(',')}]` : 'none');
      }
    }
    endConvo(talker);
    if (rumor) {
      let travel = 0;
      for (let i = 0; i < 30; i++) { try { Game.spreadGossip(); } catch (e) { break; } }
      note(`   after 30 spread ticks: heard by ${rumor.heard.length} (${(rumor.heard || []).map(dname).join(', ')})`);
      check('rumor travels the village', rumor.heard.length > 1, `${rumor.heard.length} hearers`);
    }
  }

  // ============ ACT 7: rumorDone — can you spread a SECOND rumor with the same person? ============
  note('\n=== ACT 7: rumorDone persistence — second rumor with the same partner ===');
  // deterministic: complete a rumor with vidX, close, reopen, try again.
  const vidX = villagers.find(v => !Game.inParty(v));
  let secondOffered = null, rumorDoneFlag = null;
  if (vidX) {
    const idsX = baseMenu(vidX);
    if (idsX.includes('ask:spread_rumor')) {
      Game.convoTurn(vidX, 'ask:spread_rumor');
      const t1 = choiceIds(vidX).find(i => /^rumor:tgt:/.test(i));
      if (t1) {
        Game.convoTurn(vidX, t1);
        const y1 = choiceIds(vidX).find(i => /^rumor:type:/.test(i));
        if (y1) Game.convoTurn(vidX, y1);
      }
      endConvo(vidX);
      // now a NEW conversation — try the drama verb again
      says.length = 0;
      baseMenu(vidX);
      Game.convoTurn(vidX, 'ask:spread_rumor');
      const ids2 = choiceIds(vidX);
      const cvx = (Game.state.village.conv || {})[vidX] || {};
      rumorDoneFlag = !!cvx.rumorDone;
      secondOffered = ids2.some(i => /^rumor:tgt:/.test(i));
      note(`   after completing one rumor with ${dname(vidX)}: rumorDone=${rumorDoneFlag}, second rumor targets offered=${secondOffered}`);
      note(`   choices now: ${ids2.slice(0, 8).join(', ') || '(none)'}`);
      endConvo(vidX);
    } else note('   (ask:spread_rumor not offered to test subject — skipping)');
  }
  check('a villager can help spread more than one rumor per game', secondOffered === true,
    secondOffered === null ? 'no test subject' : `rumorDone stuck=${rumorDoneFlag}, targets offered=${secondOffered}`);

  // ============ summary ============
  note('\n=== RESULTS ===');
  let pass = 0;
  for (const [n, ok] of results) { if (ok) pass++; }
  note(`   ${pass}/${results.length} checks passed`);
  process.exit(results.every(([, ok]) => ok) ? 0 : 1);
})().catch(e => { console.error('HARNESS FATAL', e); process.exit(2); });
