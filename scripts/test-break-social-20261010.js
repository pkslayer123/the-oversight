// BREAK-IT social r10 (2026-10-10): leadership-challenge trust math + ghost-challenge hygiene + dead allies wiring.
// Fresh ground (r9 killed gift/theft-apology farms, r8 mood-residue, r7 trust-from-words sweep,
// r6 rumor/whogossip/phantom-talk, r5 deal/appeal/trust-bands, r4 interpreter/giveFood/promise/rumor-trace):
//   T1 yieldChallenge: flat +10 trust, no progressive scaling, ||10 resurrection (EXPLOIT)
//   T2 yieldChallenge at trust 0: 0 -> 20 via ||10 (sibling sweep, same class bumpTrust fixed)
//   T3 standGround at trust 0: 0 -> 5 via ||10 (same class)
//   T4 leadershipFriction at trust 0: penalty -2 becomes 0 -> 8 via ||10 (same class)
//   T5 declineInvite at trust 0: penalty -1 becomes 0 -> 9 via ||10 (same class, betrayal.js)
//   T6 removeVillager leaves v.challenge/v.heat/v.allies pointing at a ghost (SOFTLOCK/phantom)
//   T7 askSupport rallies against an exiled contender's stale heat (phantom interaction)
//   T8 v.allies written by askSupport, never read — "allies expect to be treated well" is dead copy (DEAD CODE)
//   T9 'ally' memory write has no read site (Telltale-theater rule)
//   T10 social modules still loaded in index.html (dead-code re-check)
// Run: node scripts/test-break-social-20261010.js (SEED=... optional)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261010', 10);
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
const REAL_RANDOM = Math.random;

async function fresh() {
  await Game.init(); Game.debugScenario('day1');
  Game.say = () => {}; Game.sysSay = () => {};
  const S = Game.state, v = S.village, me = Game.villagerId;
  const npcs = (v.roster || []).filter(id => id !== me);
  return { S, v, me, npcs };
}
function makeContender(Game, vid) {
  const rec = (Game.data.villagers || []).find(x => x.id === vid);
  if (rec) { rec.goal = 'lead'; rec.personality = rec.personality || {}; rec.personality.temperament = 'bold'; }
}

(async () => {
  // ---------- T1: yieldChallenge flat +10 at high trust ----------
  {
    const { v, npcs } = await fresh();
    const C = npcs[0]; makeContender(Game, C);
    v.trust[C] = 95;
    v.challenge = { cid: C, task: 'forage', age: 0 };
    let err = null;
    try { Game.yieldChallenge(C); } catch (e) { err = e.message; }
    // progressive law (Steve 2026-10-07): 90-100 moves one point at a time for
    // base>=5. Flat +10 jumps 95 -> 100. Fixed: 95 -> 96 (x disposition).
    check('T1 yieldChallenge at trust 95 does not jump to 100', err === null && v.trust[C] < 100 && v.trust[C] >= 95, `err=${err} trust=${v.trust[C]}`);
  }

  // ---------- T2: yieldChallenge 0-resurrection ----------
  {
    const { v, npcs } = await fresh();
    const C = npcs[0]; makeContender(Game, C);
    v.trust[C] = 0; // real 0: they hate you
    v.challenge = { cid: C, task: 'forage', age: 0 };
    let err = null;
    try { Game.yieldChallenge(C); } catch (e) { err = e.message; }
    // (0 || 10) + 10 = 20 pre-fix. Real 0 must stay 0-based: gain applies on 0.
    check('T2 yieldChallenge at trust 0 does not resurrect to 20', err === null && v.trust[C] < 20, `err=${err} trust=${v.trust[C]}`);
  }

  // ---------- T3: standGround 0-resurrection ----------
  {
    const { v, npcs } = await fresh();
    const C = npcs[0]; makeContender(Game, C);
    v.trust[C] = 0;
    v.challenge = { cid: C, task: 'forage', age: 0 };
    let err = null;
    try { Game.standGround(C); } catch (e) { err = e.message; }
    // (0 || 10) - 5 = 5 pre-fix: a penalty that pays. Fixed: 0 stays 0.
    check('T3 standGround at trust 0 stays 0', err === null && v.trust[C] === 0, `err=${err} trust=${v.trust[C]}`);
  }

  // ---------- T4: leadershipFriction 0-resurrection ----------
  {
    const { v, npcs } = await fresh();
    const C = npcs[0]; makeContender(Game, C);
    const D = npcs[1];
    v.trust[C] = 0;
    Math.random = () => 0; // force the 0.4 contender-pushback branch
    let err = null;
    try { Game.leadershipFriction(D, 'forage'); } catch (e) { err = e.message; }
    Math.random = REAL_RANDOM;
    // (0 || 10) - 2 = 8 pre-fix: watching you give orders GAINS trust for a hater.
    check('T4 leadershipFriction at trust 0 stays 0 (penalty, not reward)', err === null && v.trust[C] === 0, `err=${err} trust=${v.trust[C]}`);
  }

  // ---------- T5: declineInvite 0-resurrection ----------
  {
    const { v, npcs } = await fresh();
    const V = npcs[0];
    v.trust[V] = 0;
    let err = null, line = null;
    try { line = Game.declineInvite(V); } catch (e) { err = e.message; }
    // (0 || 10) - 1 = 9 pre-fix. Fixed: 0 stays 0.
    check('T5 declineInvite at trust 0 stays 0', err === null && v.trust[V] === 0, `err=${err} trust=${v.trust[V]} line=${!!line}`);
  }

  // ---------- T6: ghost challenge hygiene on removeVillager ----------
  {
    const { v, npcs } = await fresh();
    const C = npcs[0]; makeContender(Game, C);
    const A = npcs[1];
    v.challenge = { cid: C, task: 'forage', age: 0 };
    v.heat = { [C]: 5 };
    v.allies = { [A]: C };
    let err = null;
    try { Game.removeVillager(C, 'exiled'); } catch (e) { err = e.message; }
    const challengeGone = !v.challenge || v.challenge.cid !== C;
    const heatGone = !(v.heat || {})[C];
    const alliesGone = !Object.keys(v.allies || {}).some(k => k === C || v.allies[k] === C);
    check('T6 exile clears ghost challenge/heat/allies', err === null && challengeGone && heatGone && alliesGone,
      `err=${err} challenge=${JSON.stringify(v.challenge)} heat=${JSON.stringify(v.heat)} allies=${JSON.stringify(v.allies)}`);
  }

  // ---------- T7: askSupport refuses ghost heat ----------
  {
    const { v, npcs } = await fresh();
    const C = npcs[0]; makeContender(Game, C);
    const A = npcs[1];
    v.trust[A] = 35;
    v.heat = { [C]: 4 };
    let err = null;
    try { Game.removeVillager(C, 'exiled'); } catch (e) { err = e.message; }
    let r = 'unset', rErr = null;
    try { r = Game.askSupport(A); } catch (e) { rErr = e.message; }
    // nobody to back you against: the heat died with the contender.
    check('T7 askSupport after contender exile: no rally against a ghost', err === null && rErr === null && r === null, `err=${err} rErr=${rErr} r=${JSON.stringify(r)}`);
  }

  // ---------- T8: allies are read at challenge resolution ----------
  {
    const { v, npcs } = await fresh();
    const C = npcs[0]; makeContender(Game, C);
    const A = npcs[1];
    v.trust[A] = 35;
    v.heat = { [C]: 4 };
    let err = null;
    try { Game.askSupport(A); } catch (e) { err = e.message; }
    const allied = (v.allies || {})[A] === C;
    v.challenge = { cid: C, task: 'forage', age: 0 };
    try { Game.yieldChallenge(C); } catch (e) { err = (err || '') + e.message; }
    let griev = [];
    try { griev = (Game.betrayalState().grievances || []).filter(g => g.by === A && g.kind === 'abandoned_alliance'); } catch (e) {}
    const alliesSpent = !(v.allies || {})[A];
    // askSupport says "allies expect to be treated well" — yielding to the
    // contender they backed you against must cost the alliance.
    check('T8 yielding to a backed-against contender records an ally grievance + spends the alliance',
      err === null && allied && griev.length > 0 && alliesSpent,
      `err=${err} allied=${allied} grievances=${griev.length} allies=${JSON.stringify(v.allies)}`);
  }

  // ---------- T9: 'ally' memory has a read site ----------
  {
    await fresh();
    const label = Game.convoMemoryAbout('ally');
    check("T9 convoMemoryAbout('ally') has a human label (Telltale-theater read site)", typeof label === 'string' && label.length > 0, `label=${label}`);
  }

  // ---------- T11: crowdingTick 0-resurrection (sibling sweep, membership.js) ----------
  {
    const { v, npcs } = await fresh();
    const X = npcs[0];
    v.trust[X] = 0;
    const _hc = Game.housingCap;
    Game.housingCap = () => 1; // force overcrowding
    let err = null;
    try { Game.crowdingTick(); } catch (e) { err = e.message; }
    Game.housingCap = _hc;
    // (0 || 20) - 1 = 19 pre-fix: overcrowding made haters like you. Fixed: 0 stays 0.
    check('T11 crowdingTick at trust 0 stays 0', err === null && v.trust[X] === 0, `err=${err} trust=${v.trust[X]}`);
  }

  // ---------- T12: _evTrustAll penalty at trust 0 (sibling sweep) ----------
  {
    const { v, npcs } = await fresh();
    const X = npcs[0];
    v.trust[X] = 0;
    let err = null;
    try { Game._evTrustAll(-10); } catch (e) { err = e.message; }
    // (0 || 15) - 10 = 5 pre-fix: a village-wide penalty paid a hater.
    check('T12 _evTrustAll(-10) at trust 0 stays 0', err === null && v.trust[X] === 0, `err=${err} trust=${v.trust[X]}`);
  }

  // ---------- T13: _evTrustAll gain at trust 0 has no 15-point resurrection ----------
  {
    const { v, npcs } = await fresh();
    const X = npcs[0];
    v.trust[X] = 0;
    let err = null;
    try { Game._evTrustAll(8); } catch (e) { err = e.message; }
    const exp = Game.trustGainProgressive(X, 8);
    // (0 || 15) + g pre-fix: 15+ points from nothing. Fixed: progressive on the real 0.
    check('T13 _evTrustAll(+8) at trust 0 gains progressively only', err === null && v.trust[X] === exp, `err=${err} trust=${v.trust[X]} expected=${exp}`);
  }

  // ---------- T14: conflictIncident corner-beat at trust 0 (sibling sweep) ----------
  {
    const { v, npcs } = await fresh();
    const A = npcs[0], B = npcs[1];
    v.trust[A] = 0; v.trust[B] = 50;
    Math.random = () => 0.26; // incidents[floor(0.26*4)] = index 1 (corner beat)
    let err = null;
    try { Game.conflictIncident({ a: A, b: B, tension: 50 }); } catch (e) { err = e.message; }
    Math.random = REAL_RANDOM;
    const expA = Game.trustGainProgressive(A, 2);
    // (0 || 10) + 2 = 12 pre-fix: a hater cornering you left liking you.
    check('T14 conflictIncident corner beat at trust 0 gains progressively only', err === null && v.trust[A] === expA && v.trust[B] === 48, `err=${err} tA=${v.trust[A]} expected=${expA} tB=${v.trust[B]}`);
  }

  // ---------- T10: social modules loaded ----------
  {
    const need = ['conversation.js', 'convo-scene.js', 'convo-dialogue.js', 'justice.js', 'betrayal.js', 'truth.js', 'party.js', 'party-formal.js', 'corruption.js', 'hierarchy.js', 'membership.js', 'codex-people.js', 'journal.js'];
    const missing = need.filter(f => !html.includes('src/js/' + f));
    check('T10 all social modules in index.html', missing.length === 0, `missing=${missing.join(',')}`);
  }

  console.log(fails.length ? `\n${fails.length} FAILING: ${fails.join('; ')}` : '\nALL GREEN');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
