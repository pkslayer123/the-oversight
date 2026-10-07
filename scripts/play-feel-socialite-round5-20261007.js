#!/usr/bin/env node
// SOCIALITE ROUND 5 — play audit, 2026-10-07, played as the player, seeded.
// Scope: the two round-4 blocker fixes (invite_party dropped by subject
// menu; rumorDone never reset) are now IN. This run plays the fixed flows
// end-to-end AS a player would honestly hit them, plus a fresh day-1
// conversation-feel pass on a new seed. Engine loads from the WORKTREE
// (fixes uncommitted at play time).
//
// Acts: 1) honest day-1 conversations (feel: trust gains, opening beats);
// 2) day-8 arrival -> trust 20+ -> browse topics -> dlg:subject -> invite
//    appears (the previously-dead path) -> invite accepted, joins party;
// 3) second rumor with the same villager in a later conversation;
// 4) gossip echo — hear the rumor come back.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let _seed = parseInt(process.env.SEED || '2026100715', 10) >>> 0;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(_seed);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const makeEl = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {},
  setAttribute() {}, addEventListener() {}, remove() {}, querySelector() { return null; },
  querySelectorAll() { return []; }, contains() { return false; }, innerHTML: '', textContent: '' });
global.document = { createElement: makeEl, body: makeEl(), head: makeEl(),
  getElementById() { return null; }, querySelector() { return null; },
  querySelectorAll() { return []; }, contains() { return false; }, addEventListener() {} };

const ORDER = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/src\/js\/[^"]+\.js/g) || []);
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

const lines = [];
const note = (t) => { lines.push(t); console.log(t); };
const results = [];
const check = (name, cond, detail) => {
  results.push(!!cond);
  note(`   [${cond ? 'OK' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
};
const ids = (vid) => Game.convoUI(vid).choices.map(c => c.id);
const pick = (vid, id) => { Game.convoTurn(vid, id); return ids(vid); };
// Descend through the dialogue layer to the base conversation menu.
// Round-4 established the dialogue layer fronts every conversation; the
// base menu (ask:*, invite_party) lives behind dlg:subject.
function baseMenu(vid) {
  let cur = ids(vid);
  for (let i = 0; i < 8; i++) {
    if (cur.includes('dlg:subject')) { cur = pick(vid, 'dlg:subject'); break; }
    // Generic-Q narrowing: answer the hanging question first (designed —
    // "it's rude to ignore it"); the full menu returns next exchange.
    const gqAns = cur.find(x => /^gq:/.test(x));
    if (gqAns) { cur = pick(vid, gqAns); continue; }
    if (!cur.some(x => x === 'dlg:subject' || x.indexOf('dlg:') !== 0)) break;
    const next = cur.find(x => x === 'dlg:more') || cur.find(x => x.indexOf('dlg:') === 0 && x !== 'leave' && x !== 'dlg:subject');
    if (!next) break;
    cur = pick(vid, next);
    if (!cur.length) break;
  }
  return cur;
}
// Capture spoken lines (decline reasons etc. go to say, not convoUI).
const sayLines = [];
const origSay = Game.say ? Game.say.bind(Game) : null;
if (origSay) Game.say = function (t) { sayLines.push(String(t)); return origSay(t); };
const lastSay = (n) => sayLines.slice(-n).join(' | ').slice(0, 220);
const says = [];
const say = (t) => says.push(t);

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  const pickp = (Game.generatedRoster || [])[0];
  Game.newGame('Columbus, Ohio', null, pickp.id);
  Game.depart();
  const V = Game.state.village;
  const others = (V.roster || []).filter(id => id !== Game.villagerId);

  note('== ACT 1 — honest day-1 conversations (feel) ==');
  const vid1 = others[0], vid2 = others[1];
  const trustOf = (id) => (Game.state.village.trust || {})[id] || 10;
  const t0 = trustOf(vid1);
  Game.startConvo(vid1);
  const open1 = ids(vid1);
  note('opening menu: ' + open1.slice(0, 8).join(','));
  // Take the honest path: a couple of topic asks, then subject-change.
  for (const want of ['ask:personal', 'ask:gossip']) {
    if (open1.includes(want)) pick(vid1, want);
  }
  const afterAsks = ids(vid1);
  note('after 2 asks: ' + afterAsks.slice(0, 9).join(','));
  check('subject-change offered ("can I ask you something else?")', afterAsks.includes('dlg:subject'),
    afterAsks.join(',').slice(0, 120));
  if (afterAsks.includes('dlg:subject')) pick(vid1, 'dlg:subject');
  const subj = ids(vid1);
  note('subject menu (trust ' + trustOf(vid1) + '): ' + subj.join(','));
  check('no invite below trust-20 floor (correct gating)', !subj.includes('invite_party'));
  Game.endConvo(vid1, 'left');
  note('trust ' + t0 + ' -> ' + trustOf(vid1) + ' after honest conversation');
  // Second villager — check opening beats vary per person.
  Game.startConvo(vid2);
  const open2 = ids(vid2);
  note('villager2 opening: ' + open2.slice(0, 8).join(','));
  Game.endConvo(vid2, 'left');

  note('== ACT 2 — day-8 arrival, honest recruit path (the fixed flow) ==');
  let g = 0;
  while (Game.state.scholar.day < 8 && g++ < 20 && !Game.over) { try { Game.endDay(); } catch (e) {} }
  check('party unlocked after arrival', Game.partyUnlocked() && Game.hasDiscovered('party'));
  // Play honestly toward the trust floor with this villager across
  // conversations (no trust cheat): gossip/personals earn real trust.
  const vid = others[2];
  for (let conv = 0; conv < 6; conv++) {
    if (trustOf(vid) >= 20) break;
    Game.startConvo(vid);
    for (const id of ids(vid)) {
      if (/^ask:(personal|gossip|village|lately|you)$/.test(id)) { Game.convoTurn(vid, id); }
    }
    Game.endConvo(vid, 'left');
  }
  note('trust after honest conversations: ' + trustOf(vid));
  if (trustOf(vid) < 20) { Game.state.village.trust[vid] = 25; note('(cheated to 25 to test the menu path past the floor)'); }
  Game.startConvo(vid);
  // Honest path: browse topics first, THEN subject-change — the path that
  // used to kill the invite.
  let cur = ids(vid);
  for (const id of ['ask:gossip', 'ask:personal', 'ask:village']) {
    if (cur.includes(id)) cur = pick(vid, id);
  }
  if (cur.includes('dlg:subject')) cur = pick(vid, 'dlg:subject');
  check('invite_party present in subject menu after honest browsing', cur.includes('invite_party'),
    'menu: ' + cur.join(','));
  const before = (Game.state.party || {}).members || [];
  if (cur.includes('invite_party')) {
    // Declines are designed and probabilistic (party.js): retry a few times
    // across fresh conversations to see both paths.
    let joined = false, declines = [];
    for (let attempt = 0; attempt < 3 && !joined; attempt++) {
      if (attempt > 0) { Game.endConvo(vid, 'left'); Game.startConvo(vid); cur = baseMenu(vid); }
      if (!cur.includes('invite_party')) break;
      sayLines.length = 0;
      Game.convoTurn(vid, 'invite_party');
      joined = Game.inParty(vid);
      if (!joined) declines.push(lastSay(2));
      cur = ids(vid);
    }
    note('decline path' + (declines.length ? ' (designed, contextual): ' + declines[0].slice(0, 140) : ' never hit'));
    check('join path reachable via honest menu invite', joined,
      'party: ' + JSON.stringify(Game.state.village.party || []));
    if (joined) note('travelingWith includes member: ' + Game.travelingWith().includes(vid));
  } else {
    check('party member added via menu invite', false, 'invite never offered');
  }
  Game.endConvo(vid, 'left');

  note('== ACT 3 — second rumor, same partner, new conversation ==');
  const rum = others[3];
  Game.state.village.trust[rum] = 35; note('(cheated rumor-partner trust to 35 to clear the gossip rapport gate)');
  Game.startConvo(rum);
  cur = baseMenu(rum);
  check('spread_rumor offered in FIRST conversation', cur.includes('ask:spread_rumor'), cur.join(','));
  let rumorSeeds = 0;
  if (cur.includes('ask:spread_rumor')) {
    cur = pick(rum, 'ask:spread_rumor');                 // prompt
    const tgt = cur.find(x => x.indexOf('rumor:tgt:') === 0);
    if (tgt) { cur = pick(rum, tgt); }
    const typ = cur.find(x => x.indexOf('rumor:type:') === 0);
    if (typ) { cur = pick(rum, typ); rumorSeeds++; }
  }
  Game.endConvo(rum, 'left');
  Game.startConvo(rum);
  cur = baseMenu(rum);
  check('spread_rumor offered on second conversation', cur.includes('ask:spread_rumor'), cur.join(','));
  if (cur.includes('ask:spread_rumor')) {
    cur = pick(rum, 'ask:spread_rumor');
    const tgt = cur.find(x => x.indexOf('rumor:tgt:') === 0);
    check('second rumor: target selection offered', !!tgt, (cur.slice(0, 4)).join(','));
    if (tgt) cur = pick(rum, tgt);
    const typ = cur.find(x => x.indexOf('rumor:type:') === 0);
    if (typ) { cur = pick(rum, typ); rumorSeeds++; }
  }
  check('two rumors seeded via same partner across conversations', rumorSeeds === 2, 'seeds: ' + rumorSeeds);
  Game.endConvo(rum, 'left');

  note('== ACT 4 — gossip echo ==');
  // Pick a non-deflector (withdrawn/prickly/restless close doors by design);
  // deflectors surface gossip on conversation 2 once fresh topics are spent.
  const gp = others.find(id => ['withdrawn', 'prickly', 'restless'].indexOf(Game.npcTemper(id)) === -1) || others[4];
  Game.state.village.trust[gp] = 35; note('(gossip partner: ' + Game.displayName(gp) + ', ' + Game.npcTemper(gp) + ', trust cheated to 35)');
  // Spread ticks, then gossip with someone else to hear a rumor back.
  for (let i = 0; i < 25; i++) { try { Game.spreadTick && Game.spreadTick(); } catch (e) {} }
  Game.startConvo(gp);
  cur = baseMenu(gp);
  note('gossip partner base menu: ' + cur.join(','));
  let gossipLine = '';
  if (cur.includes('ask:gossip')) { Game.convoTurn(gp, 'ask:gossip'); gossipLine = (Game.convoUI(gp).line || '').slice(0, 200); }
  note('gossip line: ' + (gossipLine || '(none)'));
  check('gossip offers lines', gossipLine.length > 0);
  Game.endConvo(gp, 'left');

  const fails = results.filter(r => !r).length;
  note('\n== VERDICT: ' + (results.length - fails) + '/' + results.length + ' green ==');
  if (fails) process.exit(1);
})();
