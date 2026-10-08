#!/usr/bin/env node
// BREAK-IT: villager forage knowledge branch (2026-10-08).
//
// ATTACK 1 (crash/softlock): resolveOneAssignment's forage branch used a bare
// `v` that was never declared. Whenever the 25% "villager learns a plant"
// gate hit, it threw ReferenceError: v is not defined — the whole forage
// resolution died (no food, no report), and the endDay caller deletes the
// assignment in its catch. Villager forage knowledge was effectively dead.
//
// ATTACK 2 (honesty — "if you don't know it doesn't show"): once un-crashed,
// the learn report said "<First> also learned to recognize <TRUE NAME>" —
// but the branch guard fires exactly when the PLAYER does not know the plant,
// handing them the true name for free. Fixed with descriptor gating (the
// firesideTeaching pattern).
//
// EXPECTED: forage resolution completes, and the report never names a plant
// the player hasn't identified.
// PRE-FIX: ReferenceError crash. RED.
//
// Usage: node scripts/test-knowledge-forage-leak-20261008.js (SEED override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED);
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'\"'\"']*\\.js' index.html | head -80", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); } });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

const fails = [];
function check(name, actual, expected) {
  const ok = actual === expected;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  if (!ok) fails.push(name);
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  const vid = (Game.state.village.roster || []).find(id => id !== Game.villagerId);
  if (!vid) { console.log('  SKIP: no NPC villager'); process.exit(0); }

  const said = [];
  Game.say = function (t) { said.push(String(t)); };

  // force the 25% learn gate: first Math.random() calls return ~0
  const realRandom = Math.random;
  const leaks = [];
  let threw = null, fired = 0;
  const nameOf = {};
  for (const p of Game.data.plants) nameOf[p.name] = p.id;
  for (let i = 0; i < 12; i++) {
    said.length = 0;
    let n = 0;
    Math.random = () => (++n <= 2 ? 0 : realRandom());
    try { Game.resolveOneAssignment(vid, { task: 'forage' }); }
    catch (e) { threw = threw || (e.constructor.name + ': ' + e.message); }
    Math.random = realRandom;
    for (const line of said) {
      const m = line.match(/also learned to recognize (.+?) [\u2014-]/);
      if (!m) continue;
      fired++;
      const named = m[1].trim();
      const pid = nameOf[named];
      if (pid && !Game.plantKnown(pid)) leaks.push(`"${named}" named while unknown`);
    }
  }
  console.log(`  learn branch fired ${fired}x across forced runs`);
  check('forage resolution does not throw on the learn branch', threw, null);
  check('learn branch fired at least once', fired > 0, true);
  check('no true plant names leak in forage reports', leaks.length, 0);

  console.log(fails.length ? `\nRESULT: ${fails.length} FAILED` : '\nRESULT: all passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
