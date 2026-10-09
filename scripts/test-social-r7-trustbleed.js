// BREAK-IT social r7 (2026-10-09): TRUST-FROM-WORDS sibling sweep.
// r6 established: gossip/rumors move REP only, never trust. This script hunts
// the remaining direct applyRep-with-trust callers and deed double-pays:
//   T1 mediate success: direct +6x2 then observe('mediate') drifts AGAIN (r5 trustMoved class)
//   T2 mediate FAILURE: "It goes badly... It's worse." but engine pays +trust/+rep (honesty)
//   T3 theft (caught): bumpTrust -35 then observe('theft') drifts -26 more (r5 class)
//   T4 intimidation: bumpTrust -40/-25/-20 then observe('intimidation') drifts -12 more (r5 class)
//   T5 truth.js confrontDoubt/confrontTheft: seed-time applyRep drifts trust next to an
//      explicit bumpTrust that already moved it (r6 KILL-2 class) — 3 sites
//   T6 betrayal seedCoverStory: plotters' cover STORY drifts the target's trust (r6 KILL-2 class)
//   T7 betrayal seedTargetStory: target's version drifts LISTENERS' trust-of-player (r6 KILL-1 class)
//   T8 betrayal seedAccuserStory: accusation drifts listeners' trust + the trustInPlayer
//      aggregate (r6 KILL-2 class)
// Run: node scripts/test-social-r7-trustbleed.js (SEED=... optional)
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
const REAL_RANDOM = Math.random;

(async () => {
  // ---------- T1: mediate success double-pay ----------
  await Game.init(); Game.debugScenario('day1');
  Game.say = () => {}; Game.sysSay = () => {};
  let S = Game.state, v = S.village, me = Game.villagerId;
  let npcs = (v.roster || []).filter(id => id !== me);
  const A = npcs[0], B = npcs[1];
  v.trust[A] = 40; v.trust[B] = 40;
  v.conflicts = [{ a: A, b: B, tension: 50, known: true, resolved: false }];
  const expGain = Game.trustGainProgressive(A, 6);
  Math.random = () => 0; // force success
  let mErr = null;
  try { Game.mediateConflict(A); } catch (e) { mErr = e.message; }
  Math.random = REAL_RANDOM;
  const dA = v.trust[A] - 40, dB = v.trust[B] - 40;
  check('T1 mediate success: no observe double-pay on target', mErr === null && dA === expGain, `err=${mErr} dA=${dA} expected=${expGain} dB=${dB}`);

  // ---------- T2: failed mediation must not pay positive ----------
  await Game.init(); Game.debugScenario('day1');
  Game.say = () => {}; Game.sysSay = () => {};
  S = Game.state; v = S.village; me = Game.villagerId;
  npcs = (v.roster || []).filter(id => id !== me);
  const A2 = npcs[0], B2 = npcs[1];
  v.trust[A2] = 40; v.trust[B2] = 40;
  v.conflicts = [{ a: A2, b: B2, tension: 50, known: true, resolved: false }];
  const repBefore = Object.assign({}, Game.repOf(A2));
  Math.random = () => 0.99999; // force failure
  try { Game.mediateConflict(A2); } catch (e) { mErr = e.message; }
  Math.random = REAL_RANDOM;
  const repAfter = Game.repOf(A2);
  check('T2 failed mediation: trust does not rise ("it\'s worse" is honest)', v.trust[A2] <= 40 && v.trust[B2] <= 40, `tA=${v.trust[A2]} tB=${v.trust[B2]}`);
  check('T2 failed mediation: competence rep does not rise', repAfter.competent <= repBefore.competent, `competent ${repBefore.competent} -> ${repAfter.competent}`);

  // ---------- T3: caught theft double-pay ----------
  await Game.init(); Game.debugScenario('day1');
  Game.say = () => {}; Game.sysSay = () => {};
  S = Game.state; v = S.village; me = Game.villagerId;
  npcs = (v.roster || []).filter(id => id !== me);
  const T = npcs[0];
  v.trust[T] = 60;
  Math.random = () => 0; // take=300, caught (0 < chance)
  let sRes = null, sErr = null;
  try { sRes = Game.stealFrom(T); } catch (e) { sErr = e.message; }
  Math.random = REAL_RANDOM;
  check('T3 caught theft: trust delta is exactly -35 (no observe double-pay)', sErr === null && sRes === 'caught' && v.trust[T] === 25, `res=${sRes} err=${sErr} trust=${v.trust[T]} (want 25)`);

  // ---------- T4: intimidation double-pay ----------
  await Game.init(); Game.debugScenario('day1');
  Game.say = () => {}; Game.sysSay = () => {};
  S = Game.state; v = S.village; me = Game.villagerId;
  npcs = (v.roster || []).filter(id => id !== me);
  // pick a steady/warm-temperament NPC so the branch is 'refused' (-20), no fight/flee
  let IV = npcs.find(id => { const t = Game.npcTemper(id); return t === 'steady' || t === 'warm'; }) || npcs[0];
  v.trust[IV] = 60;
  let iRes = null, iErr = null;
  try { iRes = Game.intimidate(IV); } catch (e) { iErr = e.message; }
  const iTrust = v.trust[IV];
  // refused branch: bumpTrust -20, drift would add -12 more
  check('T4 intimidation (refused): trust delta is exactly -20 (no observe double-pay)', iErr === null && iRes === 'refused' && iTrust === 40, `res=${iRes} err=${iErr} temper=${Game.npcTemper(IV)} trust=${iTrust} (want 40)`);

  // ---------- T5: truth.js confrontation seed bleed ----------
  await Game.init(); Game.debugScenario('day1');
  Game.say = () => {}; Game.sysSay = () => {};
  S = Game.state; v = S.village; me = Game.villagerId;
  npcs = (v.roster || []).filter(id => id !== me);
  const L = npcs[0];
  const vp = Game.vpOf(L);
  // hand-build a live lie + doubt
  vp.lies = { occupation: { told: 'blacksmith', truth: 'thief', motive: 'shame', field: 'occupation', confessed: false } };
  S.codex = S.codex || {}; S.codex.doubts = [{ id: 'd_r7', vid: L, kind: 'contradiction', evidence: ['claimed to be a blacksmith'], resolved: false }];
  v.trust[L] = 30;
  const expConfess = 30 + Game.trustGainProgressive(L, 5);
  Math.random = () => 0; // force confession (roll < confessP)
  let cRes = null;
  try { cRes = Game.confrontDoubt(L, 'd_r7'); } catch (e) { cRes = { outcome: 'threw:' + e.message }; }
  Math.random = REAL_RANDOM;
  // confession: bumpTrust +5 (progressive) => expConfess; seed drift would steal 2
  check('T5a confession: trust is exactly 30+progressive(5) (no seed-drift skim)', cRes && cRes.outcome === 'confessed' && v.trust[L] === expConfess, `outcome=${cRes && cRes.outcome} trust=${v.trust[L]} (want ${expConfess})`);

  // attack path: fresh lie/doubt, motive manipulation, high roll
  const L2 = npcs[1];
  const vp2 = Game.vpOf(L2);
  vp2.lies = { occupation: { told: 'healer', truth: 'poisoner', motive: 'manipulation', field: 'occupation', confessed: false } };
  S.codex.doubts.push({ id: 'd_r7b', vid: L2, kind: 'contradiction', evidence: ['claimed to be a healer'], resolved: false });
  v.trust[L2] = 30;
  Math.random = () => 0.9; // roll 0.9 >= confessP(0.2)+0.35 => attack
  let aRes = null;
  try { aRes = Game.confrontDoubt(L2, 'd_r7b'); } catch (e) { aRes = { outcome: 'threw:' + e.message }; }
  Math.random = REAL_RANDOM;
  // counter-attack: bumpTrust -8 => 22; seed drift would take 2 more => 20
  check('T5b counter-attack: trust is exactly 22 (no seed-drift skim)', aRes && aRes.outcome === 'attacked' && v.trust[L2] === 22, `outcome=${aRes && aRes.outcome} trust=${v.trust[L2]} (want 22)`);

  // ---------- T6: betrayal cover story seed bleed ----------
  await Game.init(); Game.debugScenario('day1');
  Game.say = () => {}; Game.sysSay = () => {};
  S = Game.state; v = S.village; me = Game.villagerId;
  npcs = (v.roster || []).filter(id => id !== me);
  const PL = npcs[0], TG = npcs[1];
  Game.betrayalState().plots = [{ id: 'p_r7', leader: PL, accomplices: [] }];
  const cs = { id: 'c_r7', plotId: 'p_r7', target: TG };
  v.trust[TG] = 30;
  const repTGBefore = Object.assign({}, Game.repOf(TG));
  try { Game.seedCoverStory(cs); } catch (e) { console.log('THREW T6:'); fails.push('T6 seedCoverStory threw: ' + e.message); }
  const dTrustTG = v.trust[TG] - 30;
  check('T6 cover story: target trust does not move from plotters\' words', dTrustTG === 0, `dTrust=${dTrustTG}`);
  check('T6 cover story: rep still lands on the target', (Game.repOf(TG).trustworthy || 0) < (repTGBefore.trustworthy || 0), `trustworthy ${repTGBefore.trustworthy} -> ${Game.repOf(TG).trustworthy}`);
  const g6 = (v.gossip || []).find(g => g.action === 'ambush_cover_c_r7');
  check('T6 cover story: seeded gossip is subject-marked + trust-silent', !!g6 && g6.dims.who === TG && g6.noTrust === true, g6 ? `who=${g6.dims.who} noTrust=${g6.noTrust}` : 'gossip missing');

  // ---------- T7: target's version drifts listeners' trust ----------
  await Game.init(); Game.debugScenario('day1');
  Game.say = () => {}; Game.sysSay = () => {};
  S = Game.state; v = S.village; me = Game.villagerId;
  npcs = (v.roster || []).filter(id => id !== me);
  const TG7 = npcs[0];
  for (const id of npcs) v.trust[id] = 10;
  const cs7 = { id: 'c_r7b', plotId: 'p_r7', target: TG7, belief: {}, evidence: [], accused: [] };
  try { Game.seedTargetStory(cs7); } catch (e) { console.log('THREW T7:', e.message); fails.push('T7 seedTargetStory threw: ' + e.message); }
  for (let i = 0; i < 25; i++) { try { Game.spreadGossip(); } catch (e) {} }
  let maxD7 = 0;
  for (const id of npcs) maxD7 = Math.max(maxD7, (v.trust[id] || 10) - 10);
  check('T7 target story: no listener gains trust from the telling', maxD7 === 0, `max listener trust delta=${maxD7}`);
  const g7 = (v.gossip || []).find(g => g.action === 'ambush_target_c_r7b');
  check('T7 target story: seeded gossip is subject-marked + trust-silent', !!g7 && g7.dims.who === TG7 && g7.noTrust === true, g7 ? `who=${g7.dims.who} noTrust=${g7.noTrust}` : 'gossip missing/faded');

  // ---------- T8: accuser story bleed ----------
  await Game.init(); Game.debugScenario('day1');
  Game.say = () => {}; Game.sysSay = () => {};
  S = Game.state; v = S.village; me = Game.villagerId;
  npcs = (v.roster || []).filter(id => id !== me);
  const AC = npcs[0];
  for (const id of npcs) v.trust[id] = 10;
  v.trust[me] = 10; // trustInPlayer aggregate slot
  const cs8 = { id: 'c_r7c', accuser: AC, target: me, charge: 'theft', fabricated: false };
  try { Game.seedAccuserStory(cs8); } catch (e) { console.log('THREW T8:'); fails.push('T8 seedAccuserStory threw: ' + e.message); }
  check('T8 accusation: trustInPlayer aggregate untouched by words', Game.trustInPlayer() === 10, `trustInPlayer=${Game.trustInPlayer()}`);
  for (let i = 0; i < 25; i++) { try { Game.spreadGossip(); } catch (e) {} }
  let maxD8 = 0;
  for (const id of npcs) maxD8 = Math.max(maxD8, Math.abs((v.trust[id] || 10) - 10));
  check('T8 accusation: no listener trust moves as the accusation spreads', maxD8 === 0, `max listener trust delta=${maxD8}`);
  const g8 = (v.gossip || []).find(g => g.action === 'accuse_c_r7c');
  check('T8 accusation: seeded gossip is trust-silent', !!g8 && g8.noTrust === true, g8 ? `noTrust=${g8.noTrust}` : 'gossip missing/faded');
  // the accusation's rep hit must still land somewhere real (village view of player)
  let repHit = false;
  for (const id of npcs) { if (Game.repOf(id).trustworthy < 0) repHit = true; }
  check('T8 accusation: rep hit lands on villagers\' view of the player', repHit, '');

  console.log(fails.length ? `\n${fails.length} FAILURES` : '\nALL GREEN');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
