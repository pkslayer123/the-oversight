#!/usr/bin/env node
// TEST (Steve 2026-10-07), SOCIALITE round 4 finding.
// BUG: c.rumorDone is set true when a rumor completes (conversation.js
// ~3322) and is NEVER reset — not in startConvo, not in endConvo. Each
// villager can therefore help spread exactly ONE rumor per game. The second
// attempt shows the prompt "Oh? Who are we talking about?" (the topic
// handler doesn't check rumorDone) but the rumor:tgt: choices are suppressed
// by the !c.rumorDone gate (~2477) — the drama verb dangles with no way
// forward. The socialite's signature move dies after one use per person.
// DRAMA-TERRITORY: conversation.js is the drama sibling's file — this test
// documents the bug for them. Do NOT "fix" by editing conversation.js here.
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
const choiceIds = (vid) => Game.convoUI(vid).choices.map(c => c.id);
const dname = (vid) => { try { return Game.displayName(vid); } catch (e) { return String(vid); } };

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  const pick = (Game.generatedRoster || [])[0];
  Game.newGame('Columbus, Ohio', null, pick.id);
  Game.depart();

  const failures = [];
  const ok = (name, cond, extra) => {
    console.log(`   [${cond ? 'OK' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`);
    if (!cond) failures.push(name);
  };

  const villagers = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const vid = villagers[0];
  // spread_rumor is rapport-gated (trust>=20 or 2nd conversation) by design —
  // establish the relationship first so we test the verb, not the gate.
  Game.state.village.trust = Game.state.village.trust || {};
  Game.state.village.trust[vid] = 50;
  // one throwaway conversation so convoCount>=2 also satisfies the rapport gate
  Game.startConvo(vid); try { Game.endConvo(vid, 'left'); } catch (e) {}
  const openBase = () => {
    Game.startConvo(vid);
    let ids = choiceIds(vid);
    if (ids.includes('dlg:subject')) { Game.convoTurn(vid, 'dlg:subject'); ids = choiceIds(vid); }
    return ids;
  };
  const close = () => { try { Game.endConvo(vid, 'left'); } catch (e) {} };

  // FIRST rumor: full two-step flow.
  let ids = openBase();
  // (menu ordering varies — the ask may sit behind the dialogue layer; the
  // turn itself is the ground truth for reachability)
  if (!ids.includes('ask:spread_rumor')) console.log('   [info] ask:spread_rumor not in menu snapshot; driving the turn anyway');
  Game.convoTurn(vid, 'ask:spread_rumor');
  const t1 = choiceIds(vid).find(i => /^rumor:tgt:/.test(i));
  ok('first rumor: target selection offered', !!t1);
  if (t1) {
    Game.convoTurn(vid, t1);
    const y1 = choiceIds(vid).find(i => /^rumor:type:/.test(i));
    ok('first rumor: type selection offered', !!y1);
    if (y1) Game.convoTurn(vid, y1);
  }
  close();
  const rumor1 = (Game.state.village.gossip || []).find(g => g.playerRumor);
  ok('first rumor seeded into gossip', !!rumor1);

  // SECOND rumor, new conversation, same partner.
  ids = openBase();
  Game.convoTurn(vid, 'ask:spread_rumor');
  const t2 = choiceIds(vid).find(i => /^rumor:tgt:/.test(i));
  const cv = (Game.state.village.conv || {})[vid] || {};
  ok('second rumor: target selection offered (rumorDone reset)',
    !!t2, `rumorDone=${!!cv.rumorDone}, choices: ${choiceIds(vid).slice(0, 6).join(',')}`);
  close();

  if (failures.length) { console.log(`\n${failures.length} FAILING (bug reproduced)`); process.exit(1); }
  console.log('\nALL GREEN');
})();
