#!/usr/bin/env node
// FIRESIDE RETURN GUARANTEE — proof test (Steve 2026-10-07).
// Standing rule: returning to haven with a new haul is the key teaching
// moment. The first fireside part after a real return must GUARANTEE the
// teaching fires (the 35% ambient RNG gate is skipped once); later parts
// revert to the 35% gate. Nothing-to-teach still says nothing.
// Engine: HEAD pristine src/js + the repo's CURRENT src/js/game.js overlaid,
// so the test always proves the committed fireside edit (firesideTeaching +
// returnToVillage), never stale HEAD code. The overlay is byte-identical to
// what this worker committed (verified with diff at commit time).
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const ROOT = path.resolve('/home/hatch/workspace/the-scattering');
const EX = fs.mkdtempSync(path.join(os.tmpdir(), 'fireplay-'));
try {
  execSync('git archive HEAD src/js src/data index.html | tar -x -C ' + EX, { cwd: ROOT });
} catch (e) { console.error('engine extract failed: ' + e.message); process.exit(2); }
// overlay the repo's current game.js (carries the committed fireside edit)
fs.copyFileSync(path.join(ROOT, 'src/js/game.js'), path.join(EX, 'src/js/game.js'));
const SEED = parseInt(process.env.SEED || '20261007', 10);

let _a = SEED >>> 0;
Math.random = function () {
  _a |= 0; _a = (_a + 0x6D2B79F5) | 0;
  let t = Math.imul(_a ^ (_a >>> 15), 1 | _a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(EX, f), 'utf8'))) });
const makeEl = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {},
  setAttribute() {}, addEventListener() {}, removeEventListener() {}, querySelector() { return null; },
  querySelectorAll() { return []; }, contains() { return false; }, innerHTML: '', textContent: '' });
global.document = { createElement: makeEl, body: makeEl(), head: makeEl(),
  getElementById() { return null; }, querySelector() { return null; },
  querySelectorAll() { return []; }, contains() { return false; }, addEventListener() {} };

const ORDER = (fs.readFileSync(path.join(EX, 'index.html'), 'utf8').match(/src\/js\/[^"]+\.js/g) || []);
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js']);
global.window = global;
for (const f of ORDER) {
  if (SKIP.has(f)) continue;
  const fp = path.join(EX, f);
  if (!fs.existsSync(fp)) { console.error('WARN: index.html lists ' + f + ' but absent from HEAD — skipping'); continue; }
  try { eval(fs.readFileSync(fp, 'utf8')); }
  catch (e) { console.error('EVAL FAIL', f, e.message); process.exit(1); }
}
delete global.window;
delete global.document;
const Game = globalThis.Scattering.Game;

const says = [];
const note = (t) => console.log(t);
const results = [];
const check = (name, cond, detail) => {
  results.push(!!cond);
  note(`   [${cond ? 'OK' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
};

(async () => {
  await Game.init();
  const os2 = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return os2(t); };

  Game.genRoster('Columbus, Ohio');
  const pick = (Game.generatedRoster || [])[0];
  Game.newGame('Columbus, Ohio', null, pick.id);
  const v = Game.state.village;
  const s = Game.state.scholar;
  const rid = (v.roster || []).find(id => id !== Game.villagerId) || v.roster[0];
  const plants = Game.data.plants || [];
  if (plants.length < 3) { console.error('not enough plants for test'); process.exit(2); }

  note('=== 1. no return => no flag (ambient gate untouched) ===');
  Game.returnToVillage(); // day 1, lastHavenDay day 1 => daysAway 0
  check('no homecomingFireside flag on a same-day return', !v.homecomingFireside,
    `daysAway=${(s.day || 1) - (s.lastHavenDay || 1)}`);

  note('=== 2. return after 3 days away => flag set, homecoming visible ===');
  v.sharedKnowledge = v.sharedKnowledge || {};
  const pid0 = plants[0].id;
  v.sharedKnowledge[pid0] = { taughtAround: false, discoveredBy: rid };
  s.day = 4; s.lastHavenDay = 1;
  says.length = 0;
  Game.returnToVillage();
  check('flag set on real return', v.homecomingFireside === true);
  check('return itself says something (no silent action)',
    says.some(l => /walk back into Haven|days gone|come home/i.test(l)), says[0] ? says[0].slice(0, 90) : '(silence!)');

  note('=== 3. first fireside part after return ALWAYS fires ===');
  says.length = 0;
  Game.firesideTeaching(true);
  check('a fireside teaching line was said (guaranteed, visible)',
    says.length > 0, says.length ? says[0].slice(0, 100) : '(silence!)');
  check('flag consumed regardless of outcome', v.homecomingFireside === false);
  check('the pending lesson was actually taught', v.sharedKnowledge[pid0] && v.sharedKnowledge[pid0].taughtAround === true);

  note('=== 4. later parts revert to the 35% ambient gate (n=100) ===');
  let fired = 0;
  for (let i = 0; i < 100; i++) {
    const pid = plants[1 + (i % (plants.length - 1))].id;
    // cycle the small pool: reset taughtAround so each part has something to teach.
    // NOTE: the function teaches ONE RANDOM untaught entry — not necessarily
    // this one — so "did it fire" = taughtAround flipped on ANY entry.
    v.sharedKnowledge[pid] = { taughtAround: false, discoveredBy: rid };
    const taughtBefore = Object.values(v.sharedKnowledge).filter(e => e.taughtAround).length;
    Game.firesideTeaching(true);
    const taughtAfter = Object.values(v.sharedKnowledge).filter(e => e.taughtAround).length;
    if (taughtAfter > taughtBefore) fired++;
    if (v.homecomingFireside) { check('flag never re-arms on its own', false, 'part ' + i); }
  }
  check('gate still real: not every ambient part fires', fired < 100, `${fired}/100 fired`);
  check('gate still generous: some ambient parts fire', fired > 0, `${fired}/100 fired`);
  check('rate near design band 0.35 (loose: 0.1..0.7)', fired >= 10 && fired <= 70, `${fired}/100 fired`);

  note('=== 5. flag set but nothing to teach => still silent, flag consumed ===');
  v.sharedKnowledge = {};
  v.homecomingFireside = true;
  says.length = 0;
  Game.firesideTeaching(true);
  check('nothing said when there is nothing to teach', says.length === 0);
  check('flag consumed even on the no-teach early-out', v.homecomingFireside === false);

  const fails = results.filter(r => !r).length;
  note(`\nRESULT seed=${SEED}: ${results.length - fails}/${results.length} checks green`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
