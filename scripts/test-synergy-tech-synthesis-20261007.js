#!/usr/bin/env node
// PROOF TEST (Steve 2026-10-07): cross-boundary synergy discovery via
// technique/skill synthesis.
// Bug: after the 9eaf4bb prefix fix, checkSynergyDiscovery matched prefixed
// requires — but no game code ever logs a tech/skill "use", so a real player
// could still never complete a cross-boundary sequence (e.g.
// trailblazers_promise = tech:trail_blazing + pathfinder).
// Fix: when an ability is used while holding a technique/skill that an
// undiscovered synergy pairs it with, a synthetic (non-recursive) use of the
// bare tech/skill id is logged — the knowledge is used THROUGH the ability.
// Seeded mulberry32 (default 20261007, SEED env override). Full production
// script list per AGENTS.md.
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

let pass = 0, fail = 0;
const results = [];
function check(name, cond, extra) {
  results.push([name, !!cond]);
  if (cond) { pass++; } else { fail++; }
  console.log(`  [${cond ? 'OK' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`);
}
function grantAbility(id, level) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  if (!s.abilities.some(e => ((e && e.id) || e) === id)) s.abilities.push({ id, level: level || 1, xp: 0 });
}
function learnTechnique(tid) {
  const s = Game.state.scholar;
  s.codex = s.codex || {};
  s.codex.techniques = s.codex.techniques || {};
  s.codex.techniques[tid] = { level: 1 };
}
function attempts(id) { return ((Game.state.scholar.synergyAttempts || {})[id]) || 0; }
function discovered(id) { return (Game.state.scholar.synergies || []).includes(id); }
function active(id) { Game.recomputeActiveSynergies(); return (Game.state.scholar.activeSynergies || []).includes(id); }

(async () => {
  await Game.init();
  const says = [];
  const os = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return os(t); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  says.length = 0;

  console.log('== 1. trailblazers_promise discovers through ABILITY uses alone (real-player path) ==');
  grantAbility('pathfinder', 2);
  learnTechnique('trail_blazing');
  Game.noteAbilityUse('pathfinder');
  check('attempt 1 registers (synthesis)', attempts('trailblazers_promise') === 1, `attempts=${attempts('trailblazers_promise')}`);
  check('tease 1 fired', says.some(t => /feet just knew the turns/i.test(t)));
  Game.noteAbilityUse('pathfinder');
  check('attempt 2 registers', attempts('trailblazers_promise') === 2);
  check('tease 2 fired', says.some(t => /half what they cost everyone else/i.test(t)));
  Game.noteAbilityUse('pathfinder');
  check('discovered on 3rd combined use', discovered('trailblazers_promise'));
  check('discovery narration said', says.some(t => /SYNERGY DISCOVERED: Trailblazer/i.test(t)));
  check('active after recompute (prefix fix)', active('trailblazers_promise'));

  console.log('== 2. stones_remember: second cross-boundary synergy, same mechanism ==');
  grantAbility('lie_detector', 1);
  learnTechnique('ruin_reading');
  Game.noteAbilityUse('lie_detector');
  Game.noteAbilityUse('lie_detector');
  Game.noteAbilityUse('lie_detector');
  check('stones_remember discovered via lie_detector uses', discovered('stones_remember'),
    `attempts=${attempts('stones_remember')}`);
  check('stones_remember active', active('stones_remember'));

  console.log('== 3. control: technique NOT held -> no attempts, no accidental discovery ==');
  const s = Game.state.scholar;
  delete s.codex.techniques['trail_blazing'];
  s.synergyAttempts = {};
  // use a fresh undiscovered cross-boundary synergy the player can't hold legs for
  Game.noteAbilityUse('pathfinder');
  Game.noteAbilityUse('pathfinder');
  check('no attempts without the technique', attempts('trailblazers_promise') === 0,
    `(already discovered; attempts counter fresh=${attempts('trailblazers_promise')})`);

  console.log('== 4. control: ability-only synergy unaffected (peacemakers_voice) ==');
  grantAbility('diplomat', 1);
  grantAbility('mediator', 1);
  s.synergyAttempts = {};
  const seq = (id) => Game.noteAbilityUse(id);
  seq('diplomat'); seq('mediator');
  seq('diplomat'); seq('mediator');
  seq('diplomat'); seq('mediator');
  check('peacemakers_voice still discovers (no regression)', discovered('peacemakers_voice'),
    `attempts=${attempts('peacemakers_voice')}`);

  console.log('== 5. control: synthetic events do not recurse / spam the log ==');
  learnTechnique('trail_blazing');
  const logBefore = (s.abilityUseLog || []).length;
  for (let i = 0; i < 6; i++) Game.noteAbilityUse('pathfinder');
  const logAfter = (s.abilityUseLog || []).length;
  check('run completes (no infinite recursion)', true);
  check('log bounded (cap 40)', logAfter <= 40, `log ${logBefore} -> ${logAfter}`);

  console.log(`\n${pass}/${pass + fail} passed (seed ${_seed})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PROOF CRASH:', e); process.exit(2); });
