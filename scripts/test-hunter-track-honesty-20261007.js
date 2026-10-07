#!/usr/bin/env node
// PROOF TEST (Steve 2026-10-07, hunter playtest loop): tracking-verb honesty.
// Played findings from a real night-hunt session (scratch-night-hunt):
//   FIX 1: tracker.track always claimed a fresh eastward trail ("headed east,
//          not long ago") — even on cold ground, contradicting read_sign's
//          honest "nothing fresh" in the SAME kit. Now state-aware: live
//          encounter -> direction/distance; recent sign -> follow it; cold
//          ground -> honest cold.
//   FIX 2: game_sense.read_sign joined raw animal ids ("Sign of gila_monster")
//          — builder text on the surface. Names are knowledge-gated now
//          (encAnimalKnown), like every other surface.
//   FIX 3: identifyMonster's opener ran two sentences together ("...at the
//          treeline Someone at the haven...") because mdef.unknown is a bare
//          descriptor. Now terminal-punctuated.
//   FIX 4: tbPlayerStrike on a downed target was a silent no-op (return false,
//          nothing said). Now: "It's already down."
// Seeded PRNG (mulberry32, SEED env override, default 7). Exit 0 = PASS.
// Run: node scripts/test-hunter-track-honesty-20261007.js
//   HUNTER_ROOT defaults to the repo root; point it at a pristine extract.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = process.env.HUNTER_ROOT || path.resolve(__dirname, '..');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
global.window = global; // stub ONLY for eval (equipment.js needs window at load)
global.document = {
  getElementById: () => null,
  createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} }, body: {},
};
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log('LOAD FAIL ' + f + ': ' + e.message); process.exit(2); } });
delete global.window; delete global.document; // sync combat path from here on
const Game = globalThis.Scattering.Game;

const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function clearSays() { says.splice(0); }
function said() { return says.join(' '); }
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' -- ' + detail : ''}`); }
}
function grant(id, level) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  let e = s.abilities.find(a => a.id === id);
  if (!e) { e = { id, name: id, desc: '', level: level || 1, xp: 0 }; s.abilities.push(e); }
  else e.level = level || e.level || 1;
  return e;
}
function fresh() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100; s.mx = 4; s.my = 4;
  grant('tracker', 2); grant('game_sense', 2);
  Game.state.codex.animalEncounters = {};
  clearSays();
  return s;
}

(async () => {
  await Game.init();

  // ============ 1. track on cold ground: honest, no invented trail ============
  console.log('\n=== 1. track: cold ground ===');
  let s = fresh();
  s.animal = null;
  clearSays();
  const r1 = Game.useAbility('tracker', 'track');
  const t1 = said();
  check('track returns true', r1 === true);
  check('cold ground says Cold ground', /Cold ground/.test(t1), t1.slice(0, 90));
  check('cold ground invents no eastward trail', !/headed east, not long ago/.test(t1), t1.slice(0, 90));
  check('cold ground names no phantom company', !/wasn't alone/.test(t1), t1.slice(0, 90));

  // ============ 2. track with a live encounter: points at reality ============
  console.log('\n=== 2. track: live encounter ===');
  s = fresh();
  s.animal = { id: 'cottontail_rabbit', mx: 7, my: 4, aware: 0.5 }; // 3 squares east
  clearSays();
  Game.useAbility('tracker', 'track');
  const t2 = said();
  check('live encounter: Fresh sign', /Fresh sign/.test(t2), t2.slice(0, 110));
  check('live encounter: true direction+distance (3 squares east)', /3 squares east/.test(t2), t2.slice(0, 110));
  check('live encounter: no hardcoded old line', !/headed east, not long ago/.test(t2));

  // ============ 3. track with recent sign, no live encounter ============
  console.log('\n=== 3. track: recent sign only ===');
  s = fresh();
  s.animal = null;
  Game.state.codex.animalEncounters = { cottontail_rabbit: 2 }; // recent but <3: unnamed
  clearSays();
  Game.useAbility('tracker', 'track');
  const t3 = said();
  check('recent sign: followable', /fresh enough to follow/.test(t3), t3.slice(0, 110));
  check('recent sign: unknown species stays "something"', /something/.test(t3) && !/cottontail_rabbit/.test(t3), t3.slice(0, 110));

  // ============ 4. read_sign: no raw ids, knowledge-gated ============
  console.log('\n=== 4. read_sign: knowledge gating ===');
  s = fresh();
  Game.state.codex.animalEncounters = { gila_monster: 2 }; // seen, not known (<3, non-common)
  clearSays();
  Game.useAbility('game_sense', 'read_sign');
  const t4 = said();
  check('read_sign fires', /reading the ground/.test(t4), t4.slice(0, 100));
  check('read_sign leaks no raw id', !/gila_monster/.test(t4), t4.slice(0, 100));
  check('read_sign: unknown -> "something"', /something/.test(t4), t4.slice(0, 100));
  // now teach it: 3+ encounters = known
  Game.encIdentifyAnimal('gila_monster');
  clearSays();
  Game.useAbility('game_sense', 'read_sign');
  const t4b = said();
  check('read_sign: known animal named', /Gila Monster/.test(t4b), t4b.slice(0, 100));

  // ============ 5. opener punctuation ============
  console.log('\n=== 5. identifyMonster opener punctuation ===');
  s = fresh();
  clearSays();
  Game.identifyMonster('hushwolf');
  const t5 = said();
  check('opener: descriptor terminal-punctuated', /treeline\. Someone/.test(t5), t5.slice(0, 120));
  check('opener: no run-together sentences', !/treeline Someone/.test(t5));
  check('opener: no double period', !/\.\./.test(t5));

  // ============ 6. strike on a downed target: honest, turn not spent ============
  console.log('\n=== 6. tbPlayerStrike vs downed target ===');
  s = fresh();
  Game.state.village.day = 3; s.day = 3; Game.dayPart = 3;
  clearSays();
  Game.startCombat('hushwolf');
  clearSays();
  const dead = Game.tbfight.fighters.find(f => f.kind === 'monster' && f.alive);
  dead.hp = 0; dead.alive = false; // down it without ending the fight
  const p0acted = Game.tbFighter('p').acted;
  const r6 = Game.tbPlayerStrike(dead.key);
  const t6 = said();
  check('strike on corpse returns false', r6 === false);
  check('strike on corpse says so (no silent no-op)', /already down/i.test(t6), t6.slice(0, 80));
  check('strike on corpse spends no turn', Game.tbIsPlayerTurn() && Game.tbFighter('p').acted === p0acted);
  try { Game.tbfight.over = true; } catch (e) {}

  console.log(`\n=== RESULT: ${pass} ok, ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
