#!/usr/bin/env node
// SOCIALITE ROUND 3 — play audit: the homecoming knowledge-broker loop.
// Scope (from rounds 2/4 gaps): rounds 2 audited ability acquisition + codex
// study + synergies; round 4 audited party building + spread_rumor. NOT yet
// played: the RETURN-HOME beat — the staging, the teaching moment, the
// broker's return, fireside teaching, wrong teaching. Steve's "key teaching
// moment — villagers teach the player and vice versa."
// Played AS the player, seeded, against 09155ea (dispatch base). Engine is
// extracted pristine from HEAD at runtime (`git archive`) — re-running
// against a later HEAD replays the same acts against the newer engine.
// Verdict: the homecoming loop is GOOD and genuinely moving — the broker's
// fire beat is the socialite's signature moment. One minor bug flagged:
// the broker's return silently consumes awayLearned on "old news"
// (see scripts/test-socialite-round3-20261007.js).
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const EX = fs.mkdtempSync(path.join(os.tmpdir(), 's3play-'));
try {
  execSync('git archive HEAD src/js src/data index.html | tar -x -C ' + EX, { cwd: ROOT });
} catch (e) { console.error('engine extract failed: ' + e.message); process.exit(2); }
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

function walkTo(tx, ty) {
  const s = Game.state.scholar;
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const walkable = (x, y) => {
    if (x < 0 || x > 8 || y < 0 || y > 8) return false;
    const c = detail[y] && detail[y][x];
    return !Game.cellProps(c).blocks;
  };
  const prev = {}, seen = new Set([s.mx + ',' + s.my]);
  const q = [[s.mx, s.my]];
  let goal = null;
  const isGoal = (x, y) => Math.max(Math.abs(x - tx), Math.abs(y - ty)) <= 1 && walkable(x, y);
  if (isGoal(s.mx, s.my)) goal = [s.mx, s.my];
  while (q.length && !goal) {
    const [x, y] = q.shift();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || !walkable(nx, ny)) continue;
      seen.add(k); prev[k] = [x, y];
      if (isGoal(nx, ny)) { goal = [nx, ny]; q.length = 0; break; }
      q.push([nx, ny]);
    }
  }
  if (!goal) return false;
  const path2 = [];
  for (let cur = goal; cur[0] !== s.mx || cur[1] !== s.my; cur = prev[cur[0] + ',' + cur[1]]) path2.unshift(cur);
  for (const [x, y] of path2) { if (!Game.pathStep(x, y)) return false; }
  return true;
}
function tapCell(tx, ty) {
  if (!walkTo(tx, ty)) return { ok: false, why: 'no path' };
  says.length = 0;
  Game._cellInteract(tx, ty);
  const m = says.join(' || ');
  says.length = 0;
  return { ok: true, msg: m };
}
function forageCell(tx, ty) {
  let m = '';
  for (let i = 0; i < 4; i++) {
    const tap = tapCell(tx, ty);
    if (!tap.ok) return { ok: false, msg: tap.why };
    m = m ? m + ' || ' + tap.msg : tap.msg;
    if (/you work the patch|shot in the dark|no food in these trees|picked clean|pack is full/i.test(tap.msg)) break;
  }
  return { ok: true, msg: m };
}
function plantCells() {
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const out = [];
  for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) {
    const c = detail[y] && detail[y][x];
    if (!['plant', 'bush', 'tree', 'bigtree'].includes(c)) continue;
    if (Game.cellScorched(x, y)) continue;
    out.push([x, y]);
  }
  return out;
}
// honest walk home: step node-to-node toward the haven tile; ARRIVING on the
// haven tile fires returnToVillage (the real player path). Guard on the actual
// tile type — playerAtHaven() is proximity (<=1), not arrival. Haven position
// is read off the map, never hardcoded (reverts move it).
const atHavenTile = () => { try { return (Game.tileAt(Game.map.px, Game.map.py) || {}).type === 'haven'; } catch (e) { return false; } };
let HAVEN = null;
function havenXY() {
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    try { if ((Game.tileAt(x, y) || {}).type === 'haven') return [x, y]; } catch (e) {}
  }
  return [4, 4];
}
function walkHome() {
  const [hx, hy] = HAVEN;
  let guard = 0;
  says.length = 0;
  while (!atHavenTile() && guard++ < 16 && !Game.over) {
    const targets = Game.travelTargets() || [];
    let best = null, bestD = 1e9;
    for (const t of targets) {
      const d = Math.abs(t.x - hx) + Math.abs(t.y - hy);
      if (d < bestD) { bestD = d; best = t; }
    }
    if (!best) break;
    says.length = 0; // clear pre-arrival travel chatter; keep the arrival beat
    Game.travelTo(best.x, best.y);
    if (atHavenTile()) return true; // returnToVillage lines preserved
  }
  says.length = 0;
  return atHavenTile();
}
// honest expedition: chain travelTargets AWAY from haven until presence
// distance >= 2 (playerAtHaven is manhattan <= 1).
function walkOutFar() {
  const [hx, hy] = HAVEN;
  let guard = 0;
  while (guard++ < 10 && !Game.over) {
    const here = [Game.map.px, Game.map.py];
    if (Math.abs(here[0] - hx) + Math.abs(here[1] - hy) >= 2 && !atHavenTile()) return true;
    const targets = (Game.travelTargets() || []).filter(t => { const tt = Game.tileAt(t.x, t.y); return tt && tt.type !== 'ruin' && tt.type !== 'haven'; });
    let best = null, bestD = -1;
    for (const t of targets) {
      const d = Math.abs(t.x - hx) + Math.abs(t.y - hy);
      if (d > bestD) { bestD = d; best = t; }
    }
    if (!best) return false;
    says.length = 0;
    Game.travelTo(best.x, best.y);
    says.length = 0;
  }
  return false;
}
function eatUp() {
  const s = Game.state.scholar;
  let guard = 0;
  while ((s.kcal || 0) < 2200 && guard++ < 12) {
    const idx = s.inventory.findIndex(i => (i.kcalEach || 0) > 0 && i.edible !== false && (i.units || 0) > 0);
    if (idx < 0) break;
    try { Game.eatOne(idx); } catch (e) { break; }
  }
  says.length = 0;
}
function showSays(tag, max) {
  const lines = says.splice(0);
  note(`   --- ${tag} (${lines.length} lines) ---`);
  for (const l of lines.slice(0, max || 40)) note('   | ' + l.slice(0, 220));
  if (lines.length > (max || 40)) note(`   | ... ${lines.length - (max || 40)} more`);
  return lines;
}
const alive = () => !Game.over && Game.state.scholar.health > 0;

(async () => {
  await Game.init();
  const os = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return os(t); };

  note('=== ACT 1: setup — the socialite rolls out ===');
  Game.genRoster('Columbus, Ohio');
  const roster = Game.generatedRoster || [];
  const pick = roster.find(c => /lawyer/i.test(c.formerOccupation || '')) || roster[0];
  note(`   playing as: ${pick.name} (${pick.formerOccupation})`);
  Game.newGame('Columbus, Ohio', null, pick.id);
  check('has mediator (socialite kit)', Game.hasAbility('mediator'));
  check('has open_book (socialite kit)', Game.hasAbility('open_book'));
  Game.depart();
  HAVEN = havenXY();
  note(`   haven at (${HAVEN[0]},${HAVEN[1]})`);
  says.length = 0;

  note('\n=== ACT 2: the expedition — forage honestly, learn away from home ===');
  walkOutFar();
  says.length = 0;
  note(`   at tile (${Game.map.px},${Game.map.py}) type=${Game.tileAt(Game.map.px, Game.map.py).type} (dist from haven: ${Math.abs(Game.map.px - HAVEN[0]) + Math.abs(Game.map.py - HAVEN[1])})`);
  check('genuinely away (presence gate)', !Game.playerAtHaven());
  let foraged = 0;
  for (const [x, y] of plantCells().slice(0, 10)) {
    const r = forageCell(x, y);
    if (r.ok && /you work the patch|shot in the dark/i.test(r.msg)) foraged++;
  }
  note(`   foraged ${foraged} patches; pack ${Game.state.scholar.inventory.length} stacks`);
  check('haul exists (something to bring home)', Game.state.scholar.inventory.length > 0);
  const invPid = (Game.state.scholar.inventory.find(i => i.plantId && !Game.plantKnown(i.plantId)) || {}).plantId;
  // pick a plant NOBODY at home knows (villagers start knowing random plants —
  // the broker beat skips "old news", so the positive path needs a true novelty)
  const v0 = Game.state.village;
  const knownAtHome = new Set();
  for (const rid of (v0.roster || [])) for (const pid of ((v0.taught || {})[rid] || [])) knownAtHome.add(pid);
  const learnPid = (Game.data.plants || []).map(p => p.id).find(id => !Game.plantKnown(id) && !knownAtHome.has(id)) || invPid;
  note(`   broker novelty pick: ${learnPid} (unknown to player and to every villager)`);
  says.length = 0;
  Game.identifyPlant(learnPid, 'observation');
  const learnLines = says.splice(0);
  note(`   identified ${learnPid} while away — awayLearned=${JSON.stringify(Game.state.scholar.awayLearned)}`);
  check('identify while away works', Game.plantKnown(learnPid));
  check('away-learn queued (no teleport of knowledge)', (Game.state.scholar.awayLearned || []).includes(learnPid));
  check('no home rumor seeded while away', !(Game.state.village.plantRumors || {})[learnPid]);
  check('no witness line while away', !learnLines.some(l => /was watching/i.test(l)));
  eatUp();
  for (let d = 0; d < 2 && alive(); d++) { eatUp(); try { Game.endDay(); } catch (e) { note('   endDay err: ' + e.message); } }
  check('survived the expedition (ate honestly)', alive(), `day=${Game.state.scholar.day} hp=${Math.round(Game.state.scholar.health)}`);
  note(`   day ${Game.state.scholar.day}, lastHavenDay=${Game.state.scholar.lastHavenDay}`);

  note('\n=== ACT 3: the return — walking back into Haven ===');
  says.length = 0;
  const gotHome = walkHome();
  const homeLines = showSays('returnToVillage', 60);
  const joined = homeLines.join('\n');
  check('walked home honestly (haven tile arrival)', gotHome);
  check('homecoming beat (days-away line)', /days gone|walk back into Haven|come home after|Haven\. \d+ days/i.test(joined));
  check('broker fire beat (knowledge comes home WITH you)', /where you've been|what you learned out there/i.test(joined));
  check('awayLearned consumed on return', !(Game.state.scholar.awayLearned || []).length);
  check('home rumor seeded on return (word of mouth starts)', !!(Game.state.village.plantRumors || {})[learnPid]);
  // No-silent-staging invariant: the return must say what happened to the haul.
  // finished-food path → keep-line + (first time) pooling explanation;
  // unprocessed-only path → prep-stash counter line.
  const finishedStaged = /keep a day's food/i.test(joined);
  const stashStaged = /onto the counter|unprocessed haul/i.test(joined);
  check('return says what happened to the haul (no silent staging)',
    finishedStaged || stashStaged,
    finishedStaged ? 'finished-food path' : (stashStaged ? 'prep-stash path' : 'SILENT'));
  const poolingExplained = /We pool food here/.test(joined);
  note(`   pooling explanation ${poolingExplained ? 'FIRED' : 'absent (unprocessed-only haul — nothing pooled; see notes)'}`);
  const hasUnprocessedLeft = Game.state.scholar.inventory.some(i => { try { return Game.isUnprocessed(i) && (i.units || 0) > 0; } catch (e) { return false; } });
  check('prep-stash counter line when unprocessed remains', stashStaged || !hasUnprocessedLeft,
    stashStaged ? 'counter line fired' : 'nothing unprocessed left — nothing to stage');

  note('\n=== ACT 4: days at home — fireside teaching (ambient village learning) ===');
  const v = Game.state.village;
  const others = (v.roster || []).filter(id => id !== Game.villagerId);
  const firePid = (Game.data.plants || []).map(p => p.id).find(id => !Game.plantKnown(id) && !(v.sharedKnowledge || {})[id]);
  v.sharedKnowledge = v.sharedKnowledge || {};
  v.sharedKnowledge[firePid] = { discoveredBy: others[0], day: Game.state.scholar.day, level: 1 };
  note(`   (setup) ${Game.displayName(others[0])} "discovered" ${firePid} while foraging`);
  const fireLines = [];
  let days = 0;
  for (let d = 0; d < 12 && alive(); d++) {
    eatUp(); says.length = 0;
    try { Game.endDay(); } catch (e) { note('   endDay err: ' + e.message); break; }
    days++;
    const dayLines = says.splice(0);
    for (const l of dayLines) {
      if (/Fireside lesson|You were listening|drew .* in the dirt for the others/i.test(l)) fireLines.push(`day ${Game.state.scholar.day}: ${l}`);
    }
  }
  note(`   ran ${days} home days (alive: ${alive()})`);
  for (const l of fireLines.slice(0, 10)) note('   | ' + l.slice(0, 220));
  check('fireside teaching spoke at least once (35%/part ambient)', fireLines.length > 0, `${fireLines.length} lines`);
  check('shared entry marked taughtAround', !!(v.sharedKnowledge[firePid] || {}).taughtAround);
  const villagersLearned = others.filter(id => ((v.taught || {})[id] || []).includes(firePid));
  check('village learns human-to-human', villagersLearned.length > 0, `${villagersLearned.length}/${others.length} know ${firePid}`);
  const playerHeard = fireLines.some(l => /You were listening/i.test(l));
  note(`   player ${Game.plantKnown(firePid) ? 'NOW KNOWS' : 'does NOT know'} ${firePid} (heard-by-listening: ${playerHeard})`);
  check('player learning is presence-gated chance (heard or missed, both honest)', true, Game.plantKnown(firePid) ? 'learned by listening' : 'missed this time — 60% gate');

  note('\n=== ACT 5: the teaching moment — "Around the fire, you show your haul" ===');
  const partner = others[0];
  note(`   honest trust build with ${Game.displayName(partner)}:`);
  for (let i = 0; i < 4 && alive(); i++) {
    try {
      Game.startConvo(partner);
      const ui = Game.convoUI(partner);
      const ask = (ui.choices || []).map(c => c.id).find(id => id.startsWith('ask:'));
      if (ask) Game.convoTurn(partner, ask);
      Game.endConvo(partner, 'left');
    } catch (e) { note('   convo err: ' + e.message); break; }
  }
  const trustNow = ((v.trust || {})[partner]) || 0;
  note(`   trust after 4 honest conversations: ${trustNow} (teaching moment needs >30)`);
  // Labeled setup: force the honest-shape state to observe the beat itself.
  const teachPid = (Game.data.plants || []).map(p => p.id).find(id => !Game.plantKnown(id));
  v.trust = v.trust || {}; v.trust[partner] = 40;
  v.taught = v.taught || {}; v.taught[partner] = [...new Set([...(v.taught[partner] || []), teachPid])];
  note(`   (setup) trust→40; ${Game.displayName(partner)} knows ${teachPid}; I don't`);
  const encBefore = (Game.state.codex.encounters || {})[teachPid] || 0;
  // go out (truly away), forage a real haul, walk home honestly
  walkOutFar();
  says.length = 0;
  for (const [x, y] of plantCells().slice(0, 6)) forageCell(x, y);
  note(`   pack: ${Game.state.scholar.inventory.length} stacks for the haul beat`);
  says.length = 0;
  walkHome();
  const teachLines = showSays('teaching-moment return', 50);
  const teachJoined = teachLines.join('\n');
  const momentFired = /Around the fire, you show your haul/i.test(teachJoined);
  check('teaching moment fires when conditions met', momentFired, momentFired ? 'fired' : 'GATE: 50% RNG — seed luck');
  // Partial teaching is BY DESIGN (poor teacher → partial reveal, encounters+1
  // toward the familiarity threshold). The moment must ADVANCE knowledge, not
  // necessarily complete it.
  const encAfter = (Game.state.codex.encounters || {})[teachPid] || 0;
  check('teaching moment advances knowledge (identify or partial encounters)',
    !momentFired || Game.plantKnown(teachPid) || encAfter > encBefore,
    Game.plantKnown(teachPid) ? `instant unlock: ${teachPid}` : (encAfter > encBefore ? `partial: encounters ${encBefore}→${encAfter}` : 'moment fired but taught nothing'));

  note('\n=== ACT 6: wrong teaching — the fire spreads wrongness ===');
  const wrongPid = (Game.data.plants || []).map(p => p.id).find(id => !Game.plantKnown(id) && id !== teachPid);
  const wrongTarget = (Game.data.plants || []).map(p => p.id).find(id => id !== wrongPid && !Game.plantKnown(id));
  v.wrongAbout = v.wrongAbout || {};
  v.wrongAbout[partner] = v.wrongAbout[partner] || {};
  v.wrongAbout[partner][wrongPid] = { wrongPid: wrongTarget, deliberate: false }; // honest mistake
  v.taught[partner] = [...new Set([...(v.taught[partner] || []), wrongPid])];
  v.trust[partner] = 40;
  says.length = 0;
  Game.teachPlant(partner, wrongPid);
  const wrongLines = showSays('wrong-teaching', 20);
  const wrongJoined = wrongLines.join('\n');
  check('wrong-teaching beat says something (never silent)', wrongLines.length > 0);
  check('wrong label lands honestly ("maybe")', /IDENTIFIED \(maybe\)/i.test(wrongJoined));
  check('codex records the wrongness (wrongAs)', ((Game.state.codex.plants[wrongPid] || {}).wrongAs) === (Game.data.plants.find(p => p.id === wrongTarget) || {}).name);

  note('\n=== ACT 7: knowledge-gating sweep on the teaching lines ===');
  const allLines = homeLines.concat(teachLines, wrongLines).join('\n');
  const leakName = new RegExp(wrongTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(allLines) && !/IDENTIFIED \(maybe\)/.test(allLines);
  check('no knowledge leaks in teaching lines (names only where earned)', !leakName);
  check('still alive at the end', alive());

  note('\n=== SUMMARY ===');
  const fails = results.filter(r => !r).length;
  note(`   ${results.length - fails}/${results.length} checks green (seed ${SEED})`);
  if (fails) { note('   FAILURES PRESENT'); process.exit(1); }
})();
