#!/usr/bin/env node
// PROOF TEST: engine-verified doubts must never punish the player as a false accuser
// (detective adversarial playtest 2026-10-10).
//
// THE BREAK: betrayal-case doubts (showWounds / pressAccomplice / approachWeakest /
// fabricated-accuser) and engine-witnessed event observations (talk-down waver,
// bribe traces) name REAL things the engine verified — a real ambush, real
// inconsistencies, a real bribe. But confrontDoubt only searches npcLies (the
// backstory-lie subsystem). Finding no lie, it fell into the !lie 'cleared'
// branch: accuserPays('cleared') fired — honest -5 on hearers, 'false_accusation'
// village gossip naming the PLAYER, 'wrongly_accused' memory on the plotter,
// -2 trust. The engine branded the player a liar for accusing an actual
// attempted murderer: an H1-class copy lie ("you called X a liar, and you were
// wrong" — X tried to kill you).
//
// AFTER: doubts tagged caseId (live case, vid still a real participant) resolve
// as 'pressed' — the accusation stands, they hold their story, the case record
// keeps what the player earned. No false-accuser machinery, ever, on a real
// plot. Engine-witnessed event observations (eventBacked) clear neutrally, like
// behavior/lead doubts — the player asked about something real they saw.
//
// REGRESSION GUARDS: a baseless gossip doubt on an innocent still stings
// ('cleared' + wrongly_accused + accuserPays) — pinned by
// test-detective-false-accusation.js, re-asserted here.
// Run: node scripts/test-detective-plot-doubt-20261010.js (exit 0 = pass)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function makeSharedRng() {
  let a = 1 >>> 0;
  const f = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.reset = (seed) => { a = seed >>> 0; };
  return f;
}
const sharedRng = makeSharedRng();
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js load-time need; deleted before play
Math.random = sharedRng; sharedRng.reset(424242);
const files = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .match(/src\/js\/[^\"]*\.js/g)
  .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
const seen = new Set();
for (const f of files) { if (seen.has(f)) continue; seen.add(f); eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
delete global.window;
const Game = globalThis.Scattering.Game;

const failures = [];
const ok = (cond, label, extra) => {
  if (cond) console.log('  PASS', label);
  else { console.log('  FAIL', label, extra === undefined ? '' : JSON.stringify(extra)); failures.push(label); }
};
const memTypes = (vid) => (((Game.state.village.memory || {})[vid]) || []).map(m => m.t);
const trustOf = (vid) => ((Game.state.village.trust || {})[vid]) || 10;
// accuserPays detector: the old code punished the player for being right.
let paidCalls = [];
const origAP = Game.accuserPays;
Game.accuserPays = function (vid, outcome) { paidCalls.push([vid, outcome]); return origAP.call(this, vid, outcome); };

async function newSession(seed) {
  sharedRng.reset(seed);
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  return Game.state.village.roster.filter(id => id !== Game.villagerId);
}
// stage a REAL ambush plot against the player, with a live case
function stageAmbush(roster) {
  const leader = roster[0], acc1 = roster[1];
  const plot = Game.armPlot(leader, [acc1], Game.villagerId, { reasons: ['test debt'], score: 65 });
  const c = Game.openCase(plot, 'ambush');
  plot.woundsTaken = 2;
  return { leader, acc1, plot, c };
}

(async () => {
  // ---- 1. showWounds doubt on a REAL plot leader ----
  console.log('1. confronting a real ambush plotter (showWounds doubt)');
  let roster = await newSession(101);
  let { leader, acc1, plot, c } = stageAmbush(roster);
  ok(Game.showWounds(c.id) === true, 'showWounds planted the doubt');
  const d1 = Game.getDoubts(leader).find(d => d.kind === 'observation');
  ok(!!d1, 'observation doubt exists on the plot leader');
  paidCalls = [];
  const t1 = trustOf(leader);
  const r1 = Game.confrontDoubt(leader, d1.id);
  ok(r1.outcome === 'pressed', 'plot-backed doubt resolves as pressed, not cleared', r1.outcome);
  ok(d1.resolved === true, 'doubt resolved');
  ok(paidCalls.length === 0, 'accuserPays NEVER fired on a real plot', paidCalls);
  ok(!memTypes(leader).includes('wrongly_accused'), 'no wrongly_accused memory on an actual plotter', memTypes(leader).slice(-4));
  ok(trustOf(leader) - t1 === -2, 'plotter takes the honest -2 trust dent (you accused them to their face)', trustOf(leader) - t1);

  // ---- 2. pressAccomplice doubt on a REAL accomplice ----
  console.log('2. confronting a real accomplice (pressAccomplice doubt)');
  roster = await newSession(202);
  ({ leader, acc1, plot, c } = stageAmbush(roster));
  ok(Game.pressAccomplice(c.id, acc1) === true, 'pressAccomplice caught an inconsistency');
  const d2 = Game.getDoubts(acc1).find(d => d.kind === 'contradiction');
  ok(!!d2, 'contradiction doubt exists on the accomplice');
  paidCalls = [];
  const r2 = Game.confrontDoubt(acc1, d2.id);
  ok(r2.outcome === 'pressed', 'accomplice doubt resolves as pressed', r2.outcome);
  ok(paidCalls.length === 0, 'accuserPays NEVER fired on a real accomplice', paidCalls);
  ok(!memTypes(acc1).includes('wrongly_accused'), 'no wrongly_accused memory on a real accomplice');

  // ---- 3. fabricated-accuser doubt (engine caught them lying) ----
  console.log('3. confronting an exposed fabricating accuser');
  roster = await newSession(303);
  ({ leader, acc1, plot, c } = stageAmbush(roster));
  const accuser = roster[2];
  c.accuser = accuser; c.accuserExposed = true; c.fabricated = true;
  const d3 = Game.addDoubt(accuser, 'contradiction', `${Game.whoTag(accuser)}'s accusation doesn't match what others saw.`, [], { caseId: c.id });
  paidCalls = [];
  const r3 = Game.confrontDoubt(accuser, d3.id);
  ok(r3.outcome === 'pressed', 'exposed fabricator doubt resolves as pressed', r3.outcome);
  ok(paidCalls.length === 0, 'accuserPays NEVER fired on an exposed fabricator', paidCalls);
  ok(!memTypes(accuser).includes('wrongly_accused'), 'no wrongly_accused memory on a caught liar');

  // ---- 4. engine-witnessed event observation clears neutrally ----
  console.log('4. engine-witnessed event observation (bribe trace) clears neutrally');
  roster = await newSession(404);
  const voter = roster[0];
  const d4 = Game.addDoubt(voter, 'observation', 'Tried to buy a vote. That tells you everything.', ['saw the offer'], { eventBacked: true });
  paidCalls = [];
  const t4 = trustOf(voter);
  const r4 = Game.confrontDoubt(voter, d4.id);
  ok(r4.outcome === 'cleared', 'event-backed observation clears', r4.outcome);
  ok(trustOf(voter) - t4 === 0, 'event-backed clear is trust-neutral', trustOf(voter) - t4);
  ok(!memTypes(voter).includes('wrongly_accused'), 'no wrongly_accused for a witnessed event', memTypes(voter).slice(-3));
  ok(paidCalls.length === 0, 'accuserPays NEVER fired on a witnessed event', paidCalls);

  // ---- 5. REGRESSION: baseless gossip doubt on an innocent still stings ----
  console.log('5. regression: baseless accusation of an innocent still punished');
  roster = await newSession(505);
  const innocent = roster.find(vid => {
    const lies = Game.npcLies(vid) || {};
    return !Object.values(lies).some(l => l && l.told);
  });
  ok(!!innocent, 'found a villager with no lies');
  Game.trackClaimSilent(innocent, 'occupation', 'baker');
  Game.checkGossipClaim(innocent, 'occupation', 'underwater basket weaver', roster[0]);
  const d5 = Game.getDoubts(innocent).find(d => d.kind === 'gossip');
  ok(!!d5, 'false gossip formed a doubt');
  paidCalls = [];
  const t5 = trustOf(innocent);
  const r5 = Game.confrontDoubt(innocent, d5.id);
  ok(r5.outcome === 'cleared', 'baseless accusation still clears', r5.outcome);
  ok(trustOf(innocent) - t5 === -2, 'baseless accusation still costs -2 trust', trustOf(innocent) - t5);
  ok(memTypes(innocent).includes('wrongly_accused'), 'wrongly_accused still recorded for baseless accusation');
  ok(paidCalls.length === 1 && paidCalls[0][1] === 'cleared', 'accuserPays still fires on a real false accusation', paidCalls);

  // ---- 6. REGRESSION: dismissed case falls back to the standard path ----
  console.log('6. regression: resolved-case doubt is not plot-backed anymore');
  roster = await newSession(606);
  ({ leader, acc1, plot, c } = stageAmbush(roster));
  Game.showWounds(c.id);
  const d6 = Game.getDoubts(leader).find(d => d.kind === 'observation');
  c.status = 'resolved'; c.resolution = 'acquitted'; // the village's verdict stands
  paidCalls = [];
  const r6 = Game.confrontDoubt(leader, d6.id);
  ok(r6.outcome === 'cleared', 'post-verdict doubt takes the standard path', r6.outcome);
  ok(paidCalls.length === 1, 'standard false-accusation machinery applies after the verdict', paidCalls.length);

  console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL PASS');
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
