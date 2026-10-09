// BREAK-IT social r5 (2026-10-09): deal/appeal trust farm.
//
// KILL: offerDeal() and appealToGoal() wrote "effective trust for this
// check" into PERMANENT trust — flat, no progressive scaling, no 40
// words-cap, and the `|| 10` read resurrected 0-trust villagers.
// Measured BEFORE fix (SEED 20261009):
//   appeal: 10 -> 50 -> 90 -> 100 in THREE FREE calls (words!)
//   deal:   10 -> 41 -> 72 -> 100 in THREE calls costing 3 food units
// After: the +30/+bonus sweetener buys only the obedience check; the
// permanent residue is progressive (deal: talk:false deed; appeal: capped
// at 40 through the resolver like every other word).
//
// Run: node scripts/test-social-breakit-deal-appeal-20261009.js (SEED=... optional)
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
[...html.matchAll(/src\/js\/[^\/"]+\.js|src\/js\/engine\/[^\/"]+\.js/g)].map(m => m[0]).filter(f => !SKIP.has(f))
  .forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

let A = 0, F = 0;
function ok(cond, msg, extra) { A++; if (!cond) { F++; console.log('  FAIL:', msg, extra === undefined ? '' : JSON.stringify(extra)); } else { console.log('  PASS:', msg); } }
function trustOf(vid) { const t = Game.state.village.trust || {}; return t[vid] === undefined ? 10 : t[vid]; }

(async () => {
  await Game.init();
  Game.debugScenario('day1');
  const v = Game.state.village;
  const vid = v.roster.filter(id => id !== Game.villagerId)[0];
  Game.askAbout(vid, 'goal');
  const tasks = Object.keys(Game.delegateTasks());

  console.log('=== appeal farm (words, must cap at 40) ===');
  v.trust = {}; v.trust[vid] = 10;
  let last = 10;
  const appealGains = [];
  // first appeal: use the highest-affinity task so the effective bonus (10+40)
  // clears the refusal gate deterministically — the bonus must still buy the ask
  const goalId = Game.npcGoal(vid);
  const bestTask = tasks.slice().sort((a, b) => Game.goalTaskAffinity(goalId, b) - Game.goalTaskAffinity(goalId, a))[0];
  const r0 = Game.appealToGoal(vid, bestTask);
  const n0 = trustOf(vid);
  appealGains.push(Math.round((n0 - last) * 10) / 10);
  last = n0;
  ok(r0 && r0.ok === true, 'first appeal still lands on high-affinity task (bonus buys the ask)', { task: bestTask });
  for (const t of tasks) {
    if (t === bestTask) continue;
    Game.appealToGoal(vid, t);
    const now = trustOf(vid);
    appealGains.push(Math.round((now - last) * 10) / 10);
    last = now;
  }
  console.log('  appeal gains:', appealGains.map(g => Math.round(g * 10) / 10).join(','));
  ok(last <= 40, 'appeal farm cannot pass the 40 words-cap', { final: last });
  ok(last < 100, 'appeal farm no longer reaches 100 in free calls', { final: last });
  ok(appealGains.every(g => g <= 6), 'no single appeal pays more than ~5 permanent trust (mults may scale a little)', { gains: appealGains });

  console.log('=== deal farm (deed, must be progressive) ===');
  v.trust = {}; v.trust[vid] = 10;
  Game.state.scholar.inventory = [{ name: 'test food', kcalEach: 500, units: 30, safe: true }];
  last = 10;
  const dealGains = [];
  let okCount = 0;
  for (const t of tasks) {
    const r = Game.offerDeal(vid, t);
    const now = trustOf(vid);
    if (r && r.ok) { dealGains.push(now - last); okCount++; }
    last = now;
  }
  console.log('  deal gains:', dealGains.map(g => Math.round(g * 10) / 10).join(','));
  ok(okCount >= 5, 'deals still mostly land at low trust (the +30 buys the check)', { okCount });
  ok(dealGains.length && dealGains[0] > 0 && dealGains[0] <= 16, 'first deal pays progressive ~10 (mults may scale), not flat +30', { first: dealGains[0] });
  ok(last < 100, 'deal farm no longer reaches 100 in 3 calls', { final: Math.round(last) });
  // progressive: later gains must not exceed the first (diminishing)
  if (dealGains.length >= 3) {
    ok(dealGains[2] <= dealGains[0], 'deal gains diminish (progressive)', { gains: dealGains.slice(0, 3) });
  }

  console.log('=== zero-trust read (no resurrection) ===');
  v.trust = {}; v.trust[vid] = 0;
  Game.appealToGoal(vid, tasks[0]);
  const z = trustOf(vid);
  ok(z <= 5, 'a 0-trust villager is not resurrected toward 10 by the read', { final: z });

  console.log('=== theorize faucet (practical minds) ===');
  v.trust = {}; v.trust[vid] = 10;
  // find a practical-intellect villager so the trust branch fires
  let pvid = null;
  for (const id of v.roster.filter(x => x !== Game.villagerId)) {
    try { if ((Game.npcIntel(id) || {}).primary === 'practical') { pvid = id; break; } } catch (e) {}
  }
  if (!pvid) { console.log('  SKIP: no practical-intellect villager in this seed'); }
  else {
    v.trust[pvid] = 10;
    const t0 = trustOf(pvid);
    let lastT = t0;
    const thGains = [];
    for (let i = 0; i < 10; i++) {
      try { Game.theorizeWith(pvid, 'situation'); } catch (e) {}
      const now = trustOf(pvid);
      thGains.push(Math.round((now - lastT) * 10) / 10);
      lastT = now;
    }
    console.log('  theorize gains:', thGains.join(','));
    ok(lastT - t0 <= 25, '10 theorizes cannot farm past ~25 trust (capped, progressive)', { total: Math.round((lastT - t0) * 10) / 10 });
  }

  console.log('=== invite trust (NPC-paced, one math) ===');
  v.trust = {}; v.trust[vid] = 10;
  last = 10;
  const inGains = [];
  for (let i = 0; i < 4; i++) {
    const h = Game.inviteHistory(vid);
    h.pending = { defId: 'air', day: Game.state.scholar.day };
    Game.acceptInvite(vid);
    const now = trustOf(vid);
    inGains.push(Math.round((now - last) * 10) / 10);
    last = now;
  }
  console.log('  invite gains:', inGains.join(','));
  ok(inGains.every(g => g > 0 && g <= 8), 'invite trust pays progressive small amounts through the resolver', { gains: inGains });
  ok(last <= 40, 'invite gains respect the 40 words-cap', { final: Math.round(last * 10) / 10 });

  console.log(`\n${A - F}/${A} passed${F ? ' — FAILURES PRESENT' : ''}`);
  process.exit(F ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
