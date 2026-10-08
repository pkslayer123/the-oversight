#!/usr/bin/env node
// PROOF (Steve 2026-10-07, fix-verification chain): the socialite's core verbs
// (ask:gossip, ask:spread_rumor) are never starved by the topic cap.
// Bug: for deflectors (prickly/withdrawn/restless, topic cap 2), the subject
// menu assembled t2fresh + asks under one cap — ask:personal permanently
// occupied the single asks slot, so ask:gossip / ask:spread_rumor were
// UNREACHABLE for ~1/3 of villagers, contradicting the 2026-10-06 "GOSSIP
// FIRST, never starved" intent. Fails before the fix, passes after.
// Fix (conversation.js): the two verbs ride after the capped topics once
// gossipOpen (earned verbs, not intimacy-budget topics).
// RNG seeded mulberry32 (default 20261007, SEED env override).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let _seed = parseInt(process.env.SEED || '20261007', 10) >>> 0;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(_seed);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const makeEl = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, setAttribute() {}, addEventListener() {}, removeEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, contains() { return false; }, innerHTML: '', textContent: '' });
global.document = { createElement: makeEl, body: makeEl(), head: makeEl(), getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }, contains() { return false; }, addEventListener() {} };
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

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log('  FAIL: ' + name + (extra ? ' — ' + extra : '')); } };

(async () => {
  const Game = globalThis.Scattering.Game;
  await Game.init();
  // Try several roster seeds until we get a deflector; the roster gen is
  // seeded so this is deterministic per SEED.
  let vid = null, temper = null;
  for (let attempt = 0; attempt < 12 && !vid; attempt++) {
    Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    Game.depart();
    const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
    for (const cand of roster) {
      let comm = null;
      try { comm = Game.commLevel(cand); } catch (e) {}
      if (!comm || comm.level === 'none') continue;
      const t = Game.npcTemper(cand);
      if (t === 'prickly' || t === 'withdrawn' || t === 'restless') { vid = cand; temper = t; break; }
    }
  }
  ok('found a deflector villager', !!vid, temper || 'none in 12 attempts');
  if (!vid) { console.log(`\n=== Results: ${pass} pass, ${fail} fail ===`); process.exit(1); }

  Game.state.village.trust = Game.state.village.trust || {};
  Game.state.village.trust[vid] = 25; // gossipOpen via effTrust
  Game.startConvo(vid);
  let menu = Game.convoUI(vid).choices.map(c => c.id);
  const subj = menu.includes('dlg:subject') ? 'dlg:subject' : (menu.includes('subject') ? 'subject' : null);
  ok('subject change available', !!subj, menu.join(','));
  if (subj) Game.convoTurn(vid, subj);
  menu = Game.convoUI(vid).choices.map(c => c.id);
  console.log('   deflector (' + temper + ') subject menu: ' + menu.join(','));
  ok('ask:gossip reachable for deflector once earned', menu.includes('ask:gossip'), menu.join(','));
  ok('ask:spread_rumor reachable for deflector once earned', menu.includes('ask:spread_rumor'), menu.join(','));
  // The intimacy cap still holds for TOPICS: at most 2 topic asks + verbs.
  const topics = menu.filter(id => /^ask:(you|fears|personal|past|goal|village|plans|others|advice|oldworld|skills|lately)$/.test(id));
  ok('topic cap still respected (<=2 fresh topics)', topics.length <= 2, topics.join(','));

  // Gossip still gated when NOT earned: fresh deflector at trust 10.
  try { Game.endConvo(vid, 'left'); } catch (e) {}
  Game.state.village.trust[vid] = 10;
  Game.startConvo(vid);
  menu = Game.convoUI(vid).choices.map(c => c.id);
  const subj2 = menu.includes('dlg:subject') ? 'dlg:subject' : (menu.includes('subject') ? 'subject' : null);
  if (subj2) Game.convoTurn(vid, subj2);
  menu = Game.convoUI(vid).choices.map(c => c.id);
  // convoCount>=2 may still open it on the 2nd conversation — that's the
  // "earned" path, fine. Just record; no assertion on the unearned case
  // beyond the gate existing (trust 10, first convo).
  console.log('   unearned (trust 10, convo 2) menu: ' + menu.join(','));
  try { Game.endConvo(vid, 'left'); } catch (e) {}

  console.log(`\n=== Results: ${pass} pass, ${fail} fail ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
