#!/usr/bin/env node
// TEST (Steve 2026-10-07), SOCIALITE round 3 finding.
// BUG: the broker's return (returnToVillage) SILENTLY consumes
// scholar.awayLearned when every away-learned plant is already known by
// someone at home ("old news").
// The player identified the plant in the wild, hauled the knowledge home,
// and the game says NOTHING about it — no fire beat, no rumor, no
// acknowledgment. The code comment says "old news at home — no fanfare"
// (game.js, broker block), but the queue is consumed without a word,
// violating the no-silent-actions rule: the player cannot tell whether
// the knowledge-bridging worked. Same effort as a true novelty (which gets
// the full "That night at the fire..." beat), zero feedback, no explanation.
// EXPECT: the return acknowledges the away-learned plant by name, even if
// only to say it's old news.
// ACTUAL (bug): zero return lines mention it.
//
// NOTE 2026-10-07: this test extracts the engine pristine from HEAD at
// runtime (`git archive`), so it always tests the committed engine — never
// the dirty worktree. If the broker system itself is absent at HEAD (e.g.
// the cda7946 stale-base revert), the test fails with a distinct diagnostic
// instead of the silent-skip assertion.
// DRAMA-TERRITORY NOTE: game.js is engine-owner territory — this test
// documents the bug for them. Do NOT "fix" by editing game.js here.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const EX = fs.mkdtempSync(path.join(os.tmpdir(), 's3eng-'));
try {
  execSync('git archive HEAD src/js src/data index.html | tar -x -C ' + EX, { cwd: ROOT });
} catch (e) {
  console.error('engine extract failed: ' + e.message);
  process.exit(2);
}

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
  if (!fs.existsSync(fp)) { console.error('WARN: index.html lists ' + f + ' but it is absent from HEAD — skipping'); continue; }
  try { eval(fs.readFileSync(fp, 'utf8')); }
  catch (e) { console.error('EVAL FAIL', f, e.message); process.exit(2); }
}
delete global.window;
delete global.document;
const Game = globalThis.Scattering.Game;

const says = [];
const failures = [];
const ok = (name, cond, extra) => {
  console.log(`   [${cond ? 'OK' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures.push(name);
};
const atHavenTile = () => { try { return (Game.tileAt(Game.map.px, Game.map.py) || {}).type === 'haven'; } catch (e) { return false; } };
// haven world position: read it off the map, never hardcode (reverts move it).
function havenXY() {
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    try { if ((Game.tileAt(x, y) || {}).type === 'haven') return [x, y]; } catch (e) {}
  }
  return [4, 4];
}
let HAVEN = null;
function walkOutFar() {
  const [hx, hy] = HAVEN;
  let guard = 0;
  while (guard++ < 10 && !Game.over) {
    const here = [Game.map.px, Game.map.py];
    if (Math.abs(here[0] - hx) + Math.abs(here[1] - hy) >= 2 && !atHavenTile()) return true;
    const targets = (Game.travelTargets() || []).filter(t => { const tt = Game.tileAt(t.x, t.y); return tt && tt.type !== 'ruin' && tt.type !== 'haven'; });
    let best = null, bestD = -1;
    for (const t of targets) { const d = Math.abs(t.x - hx) + Math.abs(t.y - hy); if (d > bestD) { bestD = d; best = t; } }
    if (!best) return false;
    Game.travelTo(best.x, best.y);
  }
  return false;
}
function walkHome() {
  const [hx, hy] = HAVEN;
  let guard = 0;
  says.length = 0;
  while (!atHavenTile() && guard++ < 16 && !Game.over) {
    const targets = Game.travelTargets() || [];
    let best = null, bestD = 1e9;
    for (const t of targets) { const d = Math.abs(t.x - hx) + Math.abs(t.y - hy); if (d < bestD) { bestD = d; best = t; } }
    if (!best) break;
    says.length = 0;
    Game.travelTo(best.x, best.y);
    if (atHavenTile()) return true; // keep the returnToVillage lines
  }
  return atHavenTile();
}

(async () => {
  await Game.init();
  const osay = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return osay(t); };
  Game.genRoster('Columbus, Ohio');
  const pick = (Game.generatedRoster || [])[0];
  Game.newGame('Columbus, Ohio', null, pick.id);
  Game.depart();
  says.length = 0;
  HAVEN = havenXY();
  console.log(`   haven at (${HAVEN[0]},${HAVEN[1]})`);

  // Fixture: a plant the player does NOT know but some other villager DOES
  // (their starting taught[]). Deterministic under the seed.
  const v = Game.state.village;
  const pid = (Game.data.plants || []).map(p => p.id).find(id =>
    !Game.plantKnown(id) &&
    (v.roster || []).some(rid => rid !== Game.villagerId && ((v.taught || {})[rid] || []).includes(id)));
  if (!pid) { console.log('   [SKIP] no old-news fixture plant at this seed'); process.exit(2); }
  const pname = (Game.data.plants.find(p => p.id === pid) || {}).name || pid;
  console.log(`   fixture: ${pname} (${pid}) — unknown to player, known by a villager`);

  // Honest expedition: go truly away (presence distance >= 2), identify there.
  if (!walkOutFar()) { console.log('   [SKIP] could not get away'); process.exit(2); }
  ok('genuinely away (presence gate)', !Game.playerAtHaven());
  says.length = 0;
  Game.identifyPlant(pid, 'observation');
  says.length = 0;
  const queued = (Game.state.scholar.awayLearned || []).includes(pid);
  if (!queued) {
    // The broker system itself is absent at this HEAD (e.g. the cda7946
    // stale-base revert wiped the drifter loop). Distinct failure.
    console.log('   [FAIL] broker queue absent: identifyPlant did not queue awayLearned —');
    console.log('          the drifter knowledge-bridge is not wired at this HEAD (stale revert?).');
    process.exit(1);
  }
  ok('away-learn queued (no teleport of knowledge)', true);

  // Honest return: walk onto the haven tile.
  const gotHome = walkHome();
  const returnLines = says.splice(0);
  ok('walked home (haven tile arrival)', gotHome);
  ok('return ran (awayLearned consumed)', !(Game.state.scholar.awayLearned || []).length);
  ok('return said something', returnLines.length > 0, `${returnLines.length} lines`);

  // THE BUG: the broker's return must acknowledge the away-learned plant by
  // name — even if only to say it's old news. Silence is the bug.
  const nameRe = new RegExp(pname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const mentioned = returnLines.some(l => nameRe.test(l));
  ok(`return acknowledges the away-learned plant ("${pname}")`, mentioned,
    mentioned ? 'named in: ' + returnLines.find(l => nameRe.test(l)).slice(0, 90)
              : `BUG: ${returnLines.length} return lines, zero mention ${pname}`);

  if (failures.length) { console.log(`\n${failures.length} FAILING (bug reproduced)`); process.exit(1); }
  console.log('\nPASS: broker\'s return acknowledges old-news knowledge');
})();
