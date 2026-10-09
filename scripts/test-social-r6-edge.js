// BREAK-IT social r6 (2026-10-09): MOOT/EXILE/PHANTOM-TALK edge cases.
// Drives failures in the node harness rather than reading code.
// 1. startConvo with an EXILED or DEAD villager must not open a phantom talk.
// 2. Moot with a 2-person village (1 voter) must resolve without crashing.
// 3. Player exiled mid-case (awaitingPlayerVote) must not crash castPlayerVote.
// 4. Talk requests expire even if ignored 30+ days (queue cannot grow unbounded).
// Run: node scripts/test-social-r6-edge.js (SEED=... optional)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261009', 10);
function mulberry32(seed) {
  let s = seed >>> 0;
  const f = function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.reset = (ns) => { s = ns >>> 0; }; return f;
}
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js', 'src/js/drama.js']);
[...html.matchAll(/src\/js\/[^\/\"]+\.js|src\/js\/engine\/[^\/\"]+\.js/g)].map(m => m[0]).filter(f => !SKIP.has(f))
  .forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const fails = [];
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' — ' + extra : '')); if (!cond) fails.push(name); };

(async () => {
  await Game.init();
  Game.debugScenario('day1');
  const quiet = Game.say; Game.say = () => {}; Game.sysSay = () => {};
  const S = Game.state, v = S.village;
  const me = Game.villagerId;
  const npcs = () => (v.roster || []).filter(id => id !== me);

  // --- 1. PHANTOM TALK: exiled villager must not open a conversation
  const ex1 = npcs()[0];
  Game.removeVillager(ex1, 'exiled');
  let phantom1 = null;
  try { phantom1 = Game.startConvo(ex1); } catch (e) { phantom1 = 'threw:' + e.message; }
  check('startConvo(exiled) refuses', phantom1 === null, 'got=' + (phantom1 && phantom1.vid !== undefined ? 'convo' : String(phantom1).slice(0, 40)));

  // --- 1b. PHANTOM TALK: dead villager must not open a conversation
  const ex2 = npcs()[0];
  try { Game.removeVillager(ex2, 'killed'); } catch (e) {}
  let phantom2 = null;
  try { phantom2 = Game.startConvo(ex2); } catch (e) { phantom2 = 'threw:' + e.message; }
  check('startConvo(dead) refuses', phantom2 === null, 'got=' + (phantom2 && phantom2.vid !== undefined ? 'convo' : String(phantom2).slice(0, 40)));

  // --- 2. MOOT WITH A 2-PERSON VILLAGE (player + 1 NPC, NPC accused)
  const acc = npcs()[0];
  v.roster = [me, acc]; // a village of two
  const plot = { id: 'plot_edge', leader: acc, accomplices: [], target: me, day: S.scholar.day, resolved: false };
  Game.betrayalState().plots = Game.betrayalState().plots || [];
  Game.betrayalState().plots.push(plot);
  const c = Game.openCase(plot, 'ambush');
  let mootRes = null, mootErr = null;
  try { mootRes = Game.callMoot(c.id, acc); } catch (e) { mootErr = e.message; }
  check('moot with 1 voter does not crash', mootErr === null, mootErr || JSON.stringify(mootRes && mootRes.trial ? { awaiting: mootRes.awaitingPlayerVote } : mootRes));
  if (mootRes && mootRes.awaitingPlayerVote) {
    let vErr = null;
    try { Game.castPlayerVote(c.id, true); } catch (e) { vErr = e.message; }
    check('player vote in 2-person moot does not crash', vErr === null, vErr || 'resolution=' + c.resolution);
    check('2-person moot reached terminal state', ['resolved', 'acquitted'].includes(c.status), 'status=' + c.status + ' res=' + c.resolution);
  }

  // --- 3. PLAYER EXILED MID-CASE (awaitingPlayerVote), then votes anyway
  await Game.init(); Game.debugScenario('day1');
  Game.say = () => {}; Game.sysSay = () => {};
  const S2 = Game.state, v2 = S2.village, me2 = Game.villagerId;
  const acc2 = (v2.roster || []).filter(id => id !== me2)[0];
  const plot2 = { id: 'plot_edge2', leader: acc2, accomplices: [], target: me2, day: S2.scholar.day, resolved: false };
  Game.betrayalState().plots = Game.betrayalState().plots || [];
  Game.betrayalState().plots.push(plot2);
  const c2 = Game.openCase(plot2, 'ambush');
  let m2 = null;
  try { m2 = Game.callMoot(c2.id, acc2); } catch (e) { m2 = null; }
  if (m2 && m2.awaitingPlayerVote) {
    Game.exilePlayer('moot'); // exiled BEFORE voting
    let v2Err = null, v2Res = null;
    try { v2Res = Game.castPlayerVote(c2.id, true); } catch (e) { v2Err = e.message; }
    check('vote after own exile does not crash', v2Err === null, v2Err || 'ok');
    // the accused NPC must not be double-exiled / the player must not be re-exiled mid-resolution
    check('player stays exiled once', S2.scholar.exiled === true);
  } else {
    console.log('note: no awaitingPlayerVote on second moot (seed) — check skipped');
  }

  // --- 4. TALK-REQUEST QUEUE cannot grow unbounded when ignored
  await Game.init(); Game.debugScenario('day1');
  Game.say = () => {}; Game.sysSay = () => {};
  const S3 = Game.state, v3 = S3.village;
  for (let d = 0; d < 40; d++) {
    v3.talkRequests = v3.talkRequests || {};
    const rid = ((v3.roster || []).filter(id => id !== Game.villagerId))[d % 11] || 'x';
    v3.talkRequests['ghost_' + d] = { line: 'x', day: S3.scholar.day };
    if (typeof Game.expireTalkRequests === 'function') Game.expireTalkRequests();
    S3.scholar.day++;
  }
  const reqCount = Object.keys(v3.talkRequests || {}).length;
  console.log('talk requests after 40 ignored days: ' + reqCount);
  check('talk-request queue bounded', reqCount <= 12, 'count=' + reqCount);

  Game.say = quiet;
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
