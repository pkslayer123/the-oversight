#!/usr/bin/env node
// PROOF (Steve 2026-10-07, fix-verification chain): party invite outcomes are
// VOICED in the conversation transcript.
// Bug (socialite playtest 2026-10-07): inviteToParty returned bare summaries
// ("Finn declined." / "Finn joins your party.") as the transcript 'them' line,
// while the voiced, contextual lines ("Not right now. I've got my own things
// to handle.") only reached the main say() log — which the player never sees
// mid-conversation (the full-screen chat renders transcript only, app.js
// dialogueBoxHTML). The player heard a bare decline with no reason.
// Fix (party.js): msg carries the voiced line for accept/decline/backstabber.
// Fails before the fix (bare summaries), passes after.
// RNG seeded mulberry32 (default 20261007, SEED env override); Math.random is
// pinned per-turn to force each outcome deterministically, then restored.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let _seed = parseInt(process.env.SEED || '20261007', 10) >>> 0;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const seededRandom = mulberry32(_seed);
Math.random = seededRandom;

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
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.systemArrived = true;
  Game.state.scholar.codexUnlocked = true;
  Game.unlockPartySystem();
  const v = Game.state.village;
  v.trust = v.trust || {};
  const roster = (v.roster || []).filter(id => id !== Game.villagerId)
    .filter(id => { try { return Game.commLevel(id).level !== 'none'; } catch (e) { return false; } });
  ok('roster has verbal NPCs', roster.length >= 2, 'got ' + roster.length);

  // One villager forced to decline, one forced to accept (non-backstabber).
  const plain = roster.filter(id => { try { return !Game.betrayalIntent(id); } catch (e) { return true; } });
  ok('non-backstabber villagers exist', plain.length >= 2, 'got ' + plain.length);

  function inviteTranscriptLine(vid, forceRandom) {
    v.trust[vid] = 60;
    Game.startConvo(vid);
    let menu = Game.convoUI(vid).choices.map(c => c.id);
    let inv = menu.includes('dlg:invite') ? 'dlg:invite' : (menu.includes('invite_party') ? 'invite_party' : null);
    if (!inv) {
      const subj = menu.includes('dlg:subject') ? 'dlg:subject' : (menu.includes('subject') ? 'subject' : null);
      if (subj) { Game.convoTurn(vid, subj); menu = Game.convoUI(vid).choices.map(c => c.id); }
      inv = menu.includes('dlg:invite') ? 'dlg:invite' : (menu.includes('invite_party') ? 'invite_party' : null);
    }
    if (!inv) { try { Game.endConvo(vid, 'left'); } catch (e) {} return null; }
    const realRandom = Math.random;
    Math.random = () => forceRandom;
    let r = null;
    try { r = Game.convoTurn(vid, inv); } finally { Math.random = realRandom; }
    const t = ((r && r.transcript) || Game.convoGet(vid).transcript || []);
    const them = [...t].reverse().find(e => e.who === 'them');
    try { Game.endConvo(vid, 'left'); } catch (e) {}
    return them ? String(them.text) : null;
  }

  const decliner = plain[0], accepter = plain[1];
  const declineLine = inviteTranscriptLine(decliner, 0.999);
  ok('decline transcript line exists', !!declineLine);
  if (declineLine) {
    ok('decline is voiced speech (quoted)', /^\s*"/.test(declineLine), declineLine.slice(0, 80));
    ok('decline is NOT the bare summary', !/declined\.\s*$/.test(declineLine), declineLine.slice(0, 80));
    // Contextual: carries a reason, not a wall.
    ok('decline carries a reason', /alone|know you|think about it|own things|right now/i.test(declineLine), declineLine.slice(0, 80));
  }
  const acceptLine = inviteTranscriptLine(accepter, 0.0);
  ok('accept transcript line exists', !!acceptLine);
  if (acceptLine) {
    ok('accept is voiced speech (quoted)', /^\s*"/.test(acceptLine), acceptLine.slice(0, 80));
    ok('accept is NOT the bare summary', !/joins your party\.\s*$/.test(acceptLine), acceptLine.slice(0, 80));
    ok('accepter actually joined', (() => { try { return Game.inParty(accepter); } catch (e) { return false; } })());
  }

  console.log(`\n=== Results: ${pass} pass, ${fail} fail ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
