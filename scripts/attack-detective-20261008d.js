#!/usr/bin/env node
// ADVERSARIAL detective run 2026-10-08d: fresh angles after the 01:00/06:10/11:53
// runs hardened confrontation, rumor-dedupe, trace-attribution, and bribery.
// 1. EXPLOIT: observePerson spam — strip every liar's backstory for 2 ticks a
//    pop, no cooldown, no suspicion; misses write zero memories.
// 2. EXPLOIT: rumor rotation farm — +2 listener trust per fresh (target,
//    day-part) rumor across a day; measure yield vs trace cost.
// 3. SOFTLOCK: trial with a dead accuser; trial with the player exiled mid-case.
// 4. HONESTY: fabricated-case press finds exactly the 2 planted seams, once.
// Run: SEED=N node scripts/attack-detective-20261008d.js (exit 0 = all green)
const H = require('./harness-detective.js');
const G = H.Game;

const failures = [];
const ok = (cond, label, extra) => {
  if (cond) console.log('  PASS', label);
  else { console.log('  FAIL', label, extra === undefined ? '' : JSON.stringify(extra)); failures.push(label); }
};
const trustOf = (vid) => ((G.state.village.trust || {})[vid]) || 10;
const memTypes = (vid) => (((G.state.village.memory || {})[vid]) || []).map(m => m.t);
const liarsOf = () => G.npcIds().filter(vid => {
  const lies = G.npcLies(vid) || {};
  return ['occupation', 'origin'].some(f => lies[f] && !lies[f].confessed);
});
const strippedOf = (vid) => {
  const lies = G.npcLies(vid) || {};
  const fields = ['occupation', 'origin'].filter(f => lies[f] && !lies[f].confessed);
  const doubts = (G.state.codex.doubts || []).filter(d => d.vid === vid && !d.resolved && d.kind === 'observation');
  return fields.every(f => doubts.some(d => (d.evidence || []).join(' ').includes(lies[f].told)));
};

(async () => {
  await G.init();
  console.log('== SEED ' + H.SEED + ' ==');

  // ============ ATTACK 1: observePerson spam ============
  console.log('\nATTACK 1: observePerson spam (strip the village\'s lies)');
  H.fresh();
  const liars = liarsOf();
  console.log('  liars in village:', liars.length, 'of', G.npcIds().length);
  ok(liars.length > 0, 'village has at least one liar to strip');
  let totalCalls = 0, threw = false, cooldownSignal = false;
  for (const vid of liars) {
    let calls = 0;
    for (let i = 0; i < 40 && !strippedOf(vid); i++) {
      calls++;
      let r;
      try { r = G.observePerson(vid); }
      catch (e) { threw = true; break; }
      totalCalls++;
      if (r && (r.cooldown || r.wait)) cooldownSignal = true;
    }
    console.log('  stripped', G.displayName(vid), 'in', calls, 'calls; stripped:', strippedOf(vid));
  }
  ok(!threw, 'observePerson never throws under spam');
  ok(!cooldownSignal, 'no cooldown/rate-limit signal on any call');
  ok(liars.every(strippedOf), 'every liar stripped via pure spam', { totalCalls });
  console.log('  total observe calls:', totalCalls, 'x 2 ticks =', totalCalls * 2, 'ticks');
  const wary = liars.map(vid => { try { return (G.convoDrift(vid) || {}).wariness || 0; } catch (e) { return -1; } });
  console.log('  wariness after spam:', JSON.stringify(wary), '(cosmetic only — detectChance ignores it)');
  const innocents = G.npcIds().filter(vid => !liars.includes(vid));
  if (innocents.length) {
    const iv = innocents[0];
    const memBefore = memTypes(iv).length;
    for (let i = 0; i < 20; i++) G.observePerson(iv);
    const memAfter = memTypes(iv).length;
    ok(memAfter === memBefore, 'staring at an innocent 20x writes zero memories', { memBefore, memAfter });
  }
  H.say();

  // ============ ATTACK 2: rumor rotation farm ============
  console.log('\nATTACK 2: rumor rotation farm (+2/listener per fresh target x day-part)');
  H.fresh();
  const listener = G.npcIds()[0];
  const targets = G.npcIds().slice(1, 7);
  const t0 = trustOf(listener);
  let rumors = 0, traces = 0;
  for (const part of ['dawn', 'morning', 'afternoon', 'dusk']) {
    G.dayPart = part;
    for (const tgt of targets) {
      const g = G.spreadRumor(tgt, 'generous', listener);
      if (g) {
        rumors++;
        const repSnap = JSON.stringify((G.state.village.rep || {})[G.villagerId] || {});
        G.resolveConsequence(listener, { trust: 2, temper: 'cruel', memory: { type: 'you_told_rumor', note: 'generous' }, name: 'rumor:spread' });
        G.spreadGossip();
        if (JSON.stringify((G.state.village.rep || {})[G.villagerId] || {}) !== repSnap) traces++;
      }
    }
  }
  const dt = trustOf(listener) - t0;
  console.log('  rumors spread:', rumors, '| listener trust delta:', dt.toFixed(1), '| trace events:', traces);
  ok(rumors === targets.length * 4, 'rotation bypasses the (target, day-part) dedupe fully', { rumors });
  console.log('  NOTE: farm yield', dt.toFixed(1), 'trust for', rumors, 'rumors; trace risk is the only counter');
  H.say();

  // ============ ATTACK 3a: dead accuser ============
  console.log('\nATTACK 3a: SOFTLOCK — accuser dies before the moot');
  H.fresh();
  G.openPlayerCase(G.npcIds()[0], 'theft', [], true);
  const c = (G.betrayalState().cases || []).find(x => x.playerRole === 'accused' && x.status === 'open');
  ok(!!c, 'player case opened', { charge: c && c.charge, fabricated: c && c.fabricated });
  G.state.village.roster = G.state.village.roster.filter(id => id !== c.accuser); // accuser dies
  c.day = G.state.scholar.day - (c.mootIn || 2) - 1; // moot due now
  let threw3a = null;
  try { G.playerCaseTick(); } catch (e) { threw3a = String((e && e.message) || e); }
  ok(!threw3a, 'playerCaseTick with dead accuser does not throw', threw3a);
  const cAfter = G.getCase(c.id);
  console.log('  case status after tick:', cAfter && cAfter.status, '| resolution:', cAfter && cAfter.resolution);
  H.say();

  // ============ ATTACK 3b: exiled mid-case ============
  console.log('\nATTACK 3b: SOFTLOCK — player exiled with an open case');
  H.fresh();
  G.openPlayerCase(G.npcIds()[0], 'assault', [], false);
  const c2 = (G.betrayalState().cases || []).find(x => x.playerRole === 'accused' && x.status === 'open');
  ok(!!c2, 'second player case opened');
  G.exilePlayer('test-exile');
  c2.day = G.state.scholar.day - (c2.mootIn || 2) - 1;
  let threw3b = null;
  try { G.playerCaseTick(); } catch (e) { threw3b = String((e && e.message) || e); }
  ok(!threw3b, 'playerCaseTick while exiled does not throw', threw3b);
  const c2After = G.getCase(c2.id);
  console.log('  case status after exile+tick:', c2After && c2After.status, '| resolution:', c2After && c2After.resolution);
  H.say();

  // ============ ATTACK 4: fabricated press honesty ============
  console.log('\nATTACK 4: HONESTY — fabricated press finds exactly the 2 planted seams');
  H.fresh();
  G.openPlayerCase(G.npcIds()[0], 'theft', [], true);
  const c3 = (G.betrayalState().cases || []).find(x => x.playerRole === 'accused' && x.status === 'open');
  ok(c3 && (c3.inconsistencies || []).length === 2, 'fabricated case plants exactly 2 inconsistencies', (c3 && c3.inconsistencies || []).length);
  const p1 = G.defendPressAccuser(c3.id);
  const p2 = G.defendPressAccuser(c3.id);
  ok(p1 === true, 'first press exposes a seam', p1);
  ok(p2 === null, 'second press gated (pressedAccuser once)', p2);
  ok((c3.inconsistencies || []).filter(i => i.found).length === 1, 'exactly one seam marked found', (c3.inconsistencies || []).filter(i => i.found).length);

  console.log(failures.length ? `\nRESULT: ${failures.length} FAILURES` : '\nALL GREEN');
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
