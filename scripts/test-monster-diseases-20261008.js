// MONSTER-DIET proof (Steve 2026-10-08): cooking isn't a cure-all. Monster meat
// carries weird comical-horrific consequences that survive the fire. First taste
// is a surprise; the Codex remembers; hooks are real (detection, strike, light,
// kin recognition, stealth, absorption).
'use strict';
const h = require('./break-monsters-harness.js');

async function main() {
  const G = await h.freshGame(777);
  const sayLog = [];
  G.say = m => sayLog.push(String(m));
  let fails = 0;
  const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + n + (d ? ' | ' + d : '')); if (!c) fails++; };

  const dzs = G.data.cooking.monsterDiseases;
  check('D0 6 diseases defined', dzs && dzs.length === 6, 'n=' + (dzs && dzs.length));
  const mids = new Set(G.data.monsters.map(m => m.id));
  const sids = new Set(Object.keys((G.data.statusEffects || {}).statuses || {}));
  check('D1 all disease monsters exist', dzs.every(d => d.monsters.every(m => mids.has(m))));
  check('D2 all disease statuses exist', dzs.every(d => sids.has(d.id)), dzs.map(d => d.id).join(','));

  // D3: trigger rate — raw ~35%, cooked ~20% (seeded, force via Math.random stub)
  const meatOf = (mid, state) => ({ name: 'meat', foodKind: 'meat', foodState: state, plantId: 'meat_' + mid, kcalEach: 100, units: 1, edible: true, safe: true, spoilDay: 99 });
  let hits = 0;
  const TRIALS = 400;
  const realRandom = Math.random;
  for (let i = 0; i < TRIALS; i++) {
    h.seedRng(1000 + i);
    // clear status
    try { G.cureStatus('scholar', 'howlbelly'); } catch (e) {}
    if (G.maybeMonsterWeirdness(meatOf('hushwolf', 'cleaned'))) hits++;
  }
  const rate = hits / TRIALS;
  check('D3 raw trigger rate ~0.35', Math.abs(rate - 0.35) < 0.06, rate.toFixed(3));
  hits = 0;
  for (let i = 0; i < TRIALS; i++) {
    h.seedRng(2000 + i);
    try { G.cureStatus('scholar', 'howlbelly'); } catch (e) {}
    if (G.maybeMonsterWeirdness(meatOf('hushwolf', 'cooked'))) hits++;
  }
  const rateC = hits / TRIALS;
  check('D3b cooked trigger rate ~0.20 (reduced, NOT cured)', Math.abs(rateC - 0.20) < 0.05, rateC.toFixed(3));
  Math.random = realRandom;

  // D4: codex recording
  h.seedRng(42);
  G.state.codex.monsters = {};
  // force a hit
  let forced = false;
  for (let i = 0; i < 50 && !forced; i++) { h.seedRng(3000 + i); try { G.cureStatus('scholar', 'howlbelly'); } catch (e) {} forced = G.maybeMonsterWeirdness(meatOf('hushwolf', 'cooked')); }
  check('D4 codex records the disease', forced && G.state.codex.monsters.hushwolf && G.state.codex.monsters.hushwolf.meatDisease === 'howlbelly',
    JSON.stringify(G.state.codex.monsters.hushwolf || {}));
  try { G.cureStatus('scholar', 'howlbelly'); } catch (e) {}

  // D5: no double-apply while active
  G.applyStatus('scholar', 'howlbelly', { source: 'test' });
  sayLog.length = 0;
  Math.random = () => 0; // would always hit
  const rehit = G.maybeMonsterWeirdness(meatOf('hushwolf', 'cooked'));
  Math.random = realRandom;
  check('D5 no re-roll while diseased', rehit === false && sayLog.length === 0);
  try { G.cureStatus('scholar', 'howlbelly'); } catch (e) {}

  // D6: shellgut absorption + immunity via eatOne
  const s = G.state.scholar;
  G.applyStatus('scholar', 'shellgut', { source: 'test' });
  s.kcal = 0; s.inventory = [{ name: 'Stew', kcalEach: 100, units: 2, edible: true, safe: true, spoilDay: 99, poisonRisk: { p: 1, note: 'x' }, diseaseRisk: { p: 1, note: 'y', dmg: 1 } }];
  const hp0 = s.health || 100;
  // eatOne eats a single unit; stub tick-heavy bits if needed
  try { G.eatOne(0); } catch (e) { check('D6 eatOne runs', false, String(e).slice(0, 80)); }
  check('D6 shellgut absorbs 75%', s.kcal === 75, `kcal=${s.kcal}`);
  check('D6b shellgut immune to ingested poison/disease', (s.health || 100) >= hp0 - 0.01, `health ${hp0} -> ${s.health}`);
  try { G.cureStatus('scholar', 'shellgut'); } catch (e) {}

  // D7: howlbelly detection hook (night)
  G.state.scholar.insideTent = { tx: 1, ty: 1, cx: 4, cy: 4 };
  G.tentFireLit = () => false;
  G.tentVentOpenAt = () => false;
  G.isNight = () => true;
  let det0 = 0, det1 = 0;
  const DT = 600;
  for (let i = 0; i < DT; i++) { h.seedRng(4000 + i); if (G.wandererFindsYou('hushwolf')) det0++; }
  G.applyStatus('scholar', 'howlbelly', { source: 'test' });
  for (let i = 0; i < DT; i++) { h.seedRng(4000 + i); if (G.wandererFindsYou('hushwolf')) det1++; }
  // hushwolf is scentHunter x1.5: base (0.12-0.04)=0.08 -> 0.12; howlbelly adds 0.25 -> 0.37 x1.5? order: p+=0.25 after scent mult? check code order
  check('D7 howlbelly raises night detection', det1 > det0, `${det0} -> ${det1} / ${DT}`);
  try { G.cureStatus('scholar', 'howlbelly'); } catch (e) {}
  G.state.scholar.insideTent = null;

  // D8: kin recognition — belltoad won't start anything with croakbelly
  G.applyStatus('scholar', 'croakbelly', { source: 'test' });
  sayLog.length = 0;
  const enc = G.triggerEncounter('belltoad');
  check('D8 croakbelly: belltoad lets you pass', enc === false && sayLog.some(m => /kin/i.test(m)), sayLog.slice(-1).join(' ').slice(0, 80));
  try { G.cureStatus('scholar', 'croakbelly'); } catch (e) {}

  // D9: witness_maw light
  G.dayProgress = () => 0.9; // night
  G.state.weather = 'clear';
  G.nearFire = () => false;
  G.playerTile = () => ({ type: 'wild' });
  const l0 = G.lightLevel();
  G.applyStatus('scholar', 'witness_maw', { source: 'test' });
  const l1 = G.lightLevel();
  check('D9 witness_maw halves the dark', l1 > l0 + 0.15, `${l0.toFixed(2)} -> ${l1.toFixed(2)}`);
  try { G.cureStatus('scholar', 'witness_maw'); } catch (e) {}

  console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
