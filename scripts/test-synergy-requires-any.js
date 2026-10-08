#!/usr/bin/env node
// PROOF TEST (hunter loop 2026-10-07, Steve): requires_any synergy discovery.
// Before: the 3 hunter synergies (clean_kill, blood_tracker, apex_predator)
//   could never be discovered — no discovery_method, and checkSynergyDiscovery
//   / recomputeActiveSynergies ignored requires_any paths; synergy legs
//   (apex_predator requires clean_kill) were unsatisfiable via abilityLevel.
// After: discovery works via any requires_any path; synergy legs count as
//   satisfied-by-discovery; activation is path-gated (no permanent-active leak).
// Also proves: classic (non-requires_any) synergies behave EXACTLY as before.
// Seeded PRNG (mulberry32, default 7, SEED override) — deterministic.
// Run: node scripts/test-synergy-requires-any.js  (HUNTER_ROOT env override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = process.env.HUNTER_ROOT || '/tmp/hunter-loop-fixed';
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log('LOAD FAIL ' + f + ': ' + e.message); process.exit(2); } });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;
Game.say = () => {};
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function grant(id, level) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  let e = s.abilities.find(a => a.id === id);
  if (!e) { e = { id, name: id, desc: '', level: level || 1, xp: 0 }; s.abilities.push(e); }
  else e.level = level || e.level || 1;
}
function setDay(d, part) { Game.state.village.day = d; Game.state.scholar.day = d; Game.dayPart = part || 0; }
function use3x(legs, startDay) {
  for (let d = 0; d < 3; d++) {
    setDay(startDay + d, 1);
    for (const leg of legs) Game.noteAbilityUse(leg, {});
  }
}
function discovered(id) { return (Game.state.scholar.synergies || []).includes(id); }
function active(id) { return (Game.state.scholar.activeSynergies || []).includes(id); }

(async () => {
  await Game.init();
  console.log(`seed=${SEED} ROOT=${ROOT}`);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const s = Game.state.scholar;
  s.health = 100; s.kcal = 2600;

  // ---- 1. data: the 3 hunter synergies have discovery_methods ----
  const syns = Game.data.synergies;
  for (const id of ['clean_kill', 'blood_tracker', 'apex_predator']) {
    const syn = syns.find(x => x.id === id);
    ok(`${id} has discovery_method`, !!(syn && syn.discovery_method && syn.discovery_method.type), JSON.stringify(syn && syn.discovery_method));
  }

  // ---- 2. clean_kill discoverable via EACH requires_any path ----
  const ckPaths = [['patient_aim', 'game_sense'], ['dead_aim', 'tracker'], ['patient_aim', 'stalk'], ['ambush', 'game_sense']];
  [...new Set(ckPaths.flat())].forEach(id => grant(id, 2));
  // path 1
  Game.state.scholar.synergyAttempts = {};
  use3x(['patient_aim', 'game_sense'], 20);
  ok('clean_kill unlocks via [patient_aim + game_sense] x3', discovered('clean_kill'));
  ok('clean_kill ACTIVE while path held', active('clean_kill'));
  // activation gating: drop legs so NO path is fully held -> deactivates (no permanent-active leak)
  s.abilities = s.abilities.filter(a => a.id === 'patient_aim');
  Game.recomputeActiveSynergies();
  ok('clean_kill DEACTIVATES when no path fully held', !active('clean_kill'));
  grant('game_sense', 2);
  Game.recomputeActiveSynergies();
  ok('clean_kill REACTIVATES when path held again', active('clean_kill'));
  // alternate path also works (fresh scholar state for discovery)
  s.synergies = s.synergies.filter(id => id !== 'clean_kill');
  s.synergyAttempts = {};
  ['dead_aim', 'tracker', 'stalk', 'ambush'].forEach(id => grant(id, 2));
  use3x(['dead_aim', 'tracker'], 30);
  ok('clean_kill unlocks via [dead_aim + tracker] x3 (alternate path)', discovered('clean_kill'));

  // ---- 3. blood_tracker via [blood_trail + tracker] ----
  grant('blood_trail', 2);
  s.synergyAttempts = {};
  use3x(['blood_trail', 'tracker'], 40);
  ok('blood_tracker unlocks via [blood_trail + tracker] x3', discovered('blood_tracker'));
  ok('blood_tracker ACTIVE while path held', active('blood_tracker'));

  // ---- 4. apex_predator: synergy legs count as satisfied-by-discovery ----
  grant('animal_ken', 3); grant('stalk', 3); grant('ambush', 3);
  s.synergyAttempts = {};
  use3x(['animal_ken', 'stalk'], 50); // path [clean_kill(discovered) + animal_ken] and [clean_kill + stalk + ambush]
  ok('apex_predator unlocks (synergy leg = discovered)', discovered('apex_predator'), `attempts=${(s.synergyAttempts || {}).apex_predator || 0}`);
  ok('apex_predator ACTIVE while path held', active('apex_predator'));
  // negative: without the synergy leg discovered, no progress
  s.synergies = s.synergies.filter(id => id !== 'clean_kill' && id !== 'apex_predator');
  Game.recomputeActiveSynergies();
  s.synergyAttempts = {};
  use3x(['animal_ken', 'stalk'], 60);
  ok('apex_predator does NOT progress without clean_kill discovered', !discovered('apex_predator') && ((s.synergyAttempts || {}).apex_predator || 0) === 0);

  // ---- 5. classic synergies unaffected: simultaneous synergy with 2 bare ability legs ----
  const classic = syns.find(x => x.id !== 'clean_kill' && x.id !== 'blood_tracker' && x.id !== 'apex_predator'
    && !x.requires_any && (x.requires || []).length === 2
    && x.requires.every(r => !r.includes(':'))
    && x.discovery_method && x.discovery_method.type === 'simultaneous'
    && x.requires.every(r => (Game.data.abilities || []).some(a => a.id === r)));
  if (classic) {
    const legs = classic.requires.slice(0, 2);
    console.log(`  (classic control: ${classic.id} via [${legs.join(' + ')}])`);
    legs.forEach(id => grant(id, classic.minLevel || 1));
    // ensure legs aren't already discovered-synergy legs etc.
    s.synergies = (s.synergies || []).filter(id => id !== classic.id);
    s.synergyAttempts = {};
    use3x(legs, 70);
    ok(`classic synergy ${classic.id} still unlocks after 3 combined uses (no regression)`, discovered(classic.id),
      `attempts=${(s.synergyAttempts || {})[classic.id] || 0}`);
  } else {
    console.log('  (no classic simultaneous 2-ability-leg synergy found for control — skipped)');
  }

  // ---- 6. teases fire on attempts 1-2 (no silent grind) ----
  const said = [];
  const osay = Game.say;
  Game.say = (t) => { said.push(String(t)); };
  s.synergies = s.synergies.filter(id => id !== 'blood_tracker');
  s.synergyAttempts = {};
  grant('blood_trail', 2); grant('tracker', 2);
  setDay(80, 1); Game.noteAbilityUse('blood_trail', {}); Game.noteAbilityUse('tracker', {});
  const tease1 = said.join(' ').length > 20;
  ok('attempt 1 produces a tease (not silent)', tease1, said.join(' ').slice(0, 80));
  Game.say = osay;

  console.log(`\n==== ${pass} ok / ${fail} FAIL ====`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('PROOF ERROR: ' + (e && e.stack || e)); process.exit(2); });
