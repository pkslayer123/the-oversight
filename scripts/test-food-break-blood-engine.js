// PROOF (break-it food run, Steve 2026-10-08): the blood_magic/field_medicine
// kcal engine. blood_magic had NO per-daypart gate: 9x Blood Price (-90 HP,
// +4500 kcal) -> field_medicine (+20 HP, -100 kcal, 1/daypart) -> 2x more =
// ~+5,400 kcal per day part from 100 HP, ~21,600 kcal/day. The code comment
// claimed the 100-kcal heal cost "prevents Blood Magic infinite loop" — it
// bounds it per daypart but the engine is real (measured, not theoretical).
//
// FIX: Blood Price capped at 2/day part (the body must knit), kcal clamped to
// the bank cap, dead duplicate data action removed, listing honest about cap.
//
// Run pre-fix : red  (exploit nets thousands per day part)
// Run post-fix: green (<= 1000 kcal/daypart, honest refusal on 3rd tap)
//   node scripts/test-food-break-blood-engine.js        (SEED env override)
//
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261008', 10);
Math.random = mulberry32(SEED); // seed BEFORE eval: modules capture Math.random at load
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = {
  getElementById: () => null,
  createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} }, body: {},
};
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function grant(id) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  let e = s.abilities.find(a => a.id === id);
  if (!e) { e = { id, name: id, level: 1, xp: 0 }; s.abilities.push(e); }
  return e;
}
let lastSaid = '';
const origSay = Game.say.bind(Game);
Game.say = (t) => { lastSaid = String(t); return origSay(t); };

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  console.log(`seed=${SEED} dayPart=${Game.dayPart} maxHealth=${Game.maxHealth()}`);

  grant('blood_magic');
  grant('field_medicine');
  s.health = 100; s.kcal = 2000;
  const kcal0 = s.kcal;

  // HOSTILE LOOP: one full day part of maximal Blood Price + Field Medicine.
  // Reset usage trackers so the loop starts from a clean day part.
  s.health = 100; s.kcal = 2000; s.bloodPriceDayPart = undefined; s.bloodPriceUses = 0;
  s.fieldMedDayPart = undefined;
  const k0 = s.kcal, h0 = s.health;
  let fires = 0;
  for (let i = 0; i < 60; i++) {
    const bk = s.kcal, bh = s.health;
    Game.activateAbility('blood_magic');
    const bmf = (s.kcal > bk);
    const bk2 = s.kcal;
    Game.activateAbility('field_medicine');
    const fmf = (s.kcal < bk2);
    if (bmf || fmf) fires++;
    else break;
  }
  const net = s.kcal - k0;
  console.log(`  daypart loop: blood fires bounded, net kcal=${net}, health ${h0}->${s.health}, activations=${fires}`);
  ok('one daypart of Blood Price looping nets <= 1000 kcal (cap holds)', net <= 1000, `net=${net}`);

  // Third tap in the same day part must be refused honestly, granting nothing.
  s.health = 100; const kk = s.kcal;
  Game.activateAbility('blood_magic');
  Game.activateAbility('blood_magic');
  const kBefore3rd = s.kcal;
  Game.activateAbility('blood_magic');
  ok('3rd Blood Price in one day part grants no kcal', s.kcal === kBefore3rd, `delta=${s.kcal - kBefore3rd}`);
  ok('3rd Blood Price refusal names the gate', /day part|knit|twice/i.test(lastSaid), `said: ${lastSaid.slice(0, 80)}`);

  // HONESTY: the UI listing shows ONE Blood Price button and names the cap.
  const list = Game.activatableAbilities().filter(a => /blood/i.test(a.id) || /blood/i.test(a.name || ''));
  ok('exactly one Blood Price button in the UI list', list.length === 1, `found: ${list.map(a => a.id).join(',')}`);
  ok('listing desc names the per-day-part cap', /2\/day part|twice/i.test(list[0] ? list[0].desc : ''), `desc: ${list[0] ? list[0].desc : 'NONE'}`);

  // Cap resets next day part (the gate is per-day-part, not permanent).
  s.health = 100; s.kcal = 1000; // below the bank cap so the +500 is visible
  const dp = Game.dayPart;
  Game.dayPart = dp === 'dawn' ? 'midday' : 'dawn';
  const kr = s.kcal;
  Game.activateAbility('blood_magic');
  ok('cap resets on day-part rollover', s.kcal === kr + 500, `delta=${s.kcal - kr}`);
  Game.dayPart = dp;

  // No negative-kcal path: blood magic never drives kcal below zero.
  s.kcal = 0; s.health = 100; s.bloodPriceDayPart = undefined; s.bloodPriceUses = 0;
  Game.dayPart = dp === 'dawn' ? 'midday' : 'dawn'; // fresh part so cap is open
  Game.activateAbility('blood_magic');
  ok('kcal never negative via Blood Price', s.kcal >= 0, `kcal=${s.kcal}`);
  Game.dayPart = dp;

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
