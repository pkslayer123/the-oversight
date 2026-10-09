// PROOF: mood-residue substance gate (socialite break-it 2026-10-08).
// BREAK: agree-spam ("yeah"/"tell me more" x N, warm goodbye) farmed the
// UNCAPPED endConvo:mood-lingers residue (+3/convo, talk:false) past the
// 40 talk cap — measured 18 -> 61 over 25 convos. The old guard
// (exchanges >= 3) is trivially satisfied by spam.
// FIX: c.substantive (set by the convoTurn wrapper for any non-acknowledgment
// choice) gates the residue. Listening still earns the capped stipend.
// Usage: node scripts/test-socialite-mood-residue-20261008.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let _s = (parseInt(process.env.SEED || '1337', 10) >>> 0) || 1;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(_s);
const stubEl = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, setAttribute() {}, innerHTML: '', textContent: '', addEventListener() {}, querySelector: () => stubEl(), querySelectorAll: () => [], getContext: () => null, click() {}, focus() {}, dataset: {} });
global.document = { createElement: () => stubEl(), getElementById: () => stubEl(), querySelector: () => stubEl(), querySelectorAll: () => [], body: stubEl(), addEventListener() {}, documentElement: stubEl() };
global.window = global;
global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const ORDER = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js', 'engine/forage.js', 'engine/combat.js', 'game.js', 'encounters.js', 'conversation.js', 'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js', 'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js', 'truth.js', 'contests.js', 'contestEngine.js', 'alienPlayers.js', 'storage.js', 'perceive.js', 'carexplore.js', 'justice.js', 'food.js', 'betrayal.js', 'corpses.js', 'lifeseed.js', 'progression.js', 'ledger.js', 'abilityActions.js', 'monsterBehaviors.js', 'statusEffects.js', 'villager-agency.js', 'fieldFights.js', 'villager-objectives.js', 'codex-people.js', 'membership.js', 'hierarchy.js', 'debug-scenarios.js', 'build.js'];
for (const f of ORDER) eval.call(global, fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8') + `\n//# sourceURL=${f}`);
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`ok   ${name}`); }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
const LIGHT = new Set(['goon', 'leave', 'recap', 'dlg:react', 'dlg:more']);

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.say = function () {}; Game.save = function () {};
  const V = Game.state.village;
  const vid = V.roster.find(id => id !== Game.villagerId);
  const trustOf = () => ((V.trust || {})[vid] === undefined ? 15 : V.trust[vid]);

  // ---- TEST A: wrapper marks substance correctly ----
  Game.startConvo(vid);
  let c = Game.convoGet(vid);
  ok('A1 flag starts false', c.substantive === false);
  Game.convoTurn(vid, 'dlg:react');
  ok('A2 dlg:react is light', Game.convoGet(vid).substantive === false);
  Game.convoTurn(vid, 'goon');
  ok('A3 goon is light', Game.convoGet(vid).substantive === false);
  Game.convoTurn(vid, 'dlg:more');
  ok('A4 dlg:more is light', Game.convoGet(vid).substantive === false);
  // a real question must flip it
  const ch = (Game.convoChoices(vid) || []).map(x => x.id);
  const substantiveId = ch.find(id => !LIGHT.has(id));
  ok('A5 menu offers a substantive choice', !!substantiveId, 'menu=' + ch.join(','));
  if (substantiveId) {
    Game.convoTurn(vid, substantiveId);
    ok('A6 substantive choice flips flag', Game.convoGet(vid).substantive === true, 'used ' + substantiveId);
  }
  try { Game.endConvo(vid, 'left'); } catch (e) {}

  // ---- TEST B: gate on the residue (direct, deterministic) ----
  // NOTE: expectations go through Game.trustGainProgressive — villagers have
  // individual dispositions (some warm up slower), so exact deltas vary by
  // seed. What's asserted: non-substantive pays stipend ONLY; substantive
  // pays stipend + residue.
  V.trust[vid] = 30;
  const eStip = Game.trustGainProgressive(vid, 3);
  Game.startConvo(vid);
  c = Game.convoGet(vid);
  c.exchanges = 3; c.mood = 3; c.substantive = false; // agree-spam shape
  const b0 = trustOf();
  Game.endConvo(vid, 'natural');
  const dNonSub = trustOf() - b0;
  ok('B1 non-substantive warm convo: stipend only, no residue', Math.abs(dNonSub - eStip) < 0.01, `delta=${dNonSub.toFixed(2)} expected=${eStip}`);
  V.trust[vid] = 30 + eStip; // residue is computed after the stipend lands
  const eRes = Game.trustGainProgressive(vid, 3);
  V.trust[vid] = 30;
  Game.startConvo(vid);
  c = Game.convoGet(vid);
  c.exchanges = 3; c.mood = 3; c.substantive = true; // real conversation
  const b1 = trustOf();
  Game.endConvo(vid, 'natural');
  const dSub = trustOf() - b1;
  ok('B2 substantive warm convo: stipend + residue', Math.abs(dSub - (eStip + eRes)) < 0.01, `delta=${dSub.toFixed(2)} expected=${(eStip + eRes).toFixed(2)}`);

  // ---- TEST C: exploit replay — 25 agree-spam convos must not pass 40 ----
  V.trust[vid] = 18;
  for (let i = 0; i < 25; i++) {
    Game.startConvo(vid);
    for (let e = 0; e < 6; e++) {
      const ch2 = (Game.convoChoices(vid) || []).map(x => x.id);
      const light = ch2.find(id => LIGHT.has(id) && id !== 'leave');
      if (!light) break;
      const r = Game.convoTurn(vid, light);
      if (r && r.ended) break;
    }
    try { Game.endConvo(vid, 'natural'); } catch (e) {}
  }
  const final = trustOf();
  ok('C1 25 agree-spam convos capped at 40', final <= 40, 'final=' + final.toFixed(1));

  // ---- TEST D: negative residue still symmetric on substantive convos ----
  V.trust[vid] = 50;
  Game.startConvo(vid);
  c = Game.convoGet(vid);
  c.exchanges = 3; c.mood = -3; c.substantive = true;
  const d0 = trustOf();
  Game.endConvo(vid, 'natural');
  const dNeg = trustOf() - d0;
  ok('D1 tense substantive convo still costs (stipend capped at 0 over 40, residue -3)', dNeg < 0, 'delta=' + dNeg.toFixed(2));

  console.log(`\n${pass} passed, ${fail} failed (seed ${_s})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('BOOT/PROBE FAIL', e.stack.split('\n').slice(0, 6).join('\n')); process.exit(2); });
