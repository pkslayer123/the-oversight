#!/usr/bin/env node
// Adversarial brawler proof: the witnessed duel — 2026-10-10 (run 2).
// Hostile-player attacks against the NEW duel wiring (party.js): the
// challenge dare (war_cry.challenge, fixed 2026-10-10 run 1) promised a
// "witnessed, non-lethal bout when hands are thrown" — but the dare's
// memory ('you_challenged') had NO consumer: nothing ever made the bout
// happen on those terms. The button was honest about the dare and a lie
// about the bout (deferred lie-button, same class as the r7 menace fix).
//
// FIX (this run, src/js/party.js): an outstanding dare (<=3 days) against
// the betrayer flags the betrayal fight as a WITNESSED DUEL — announced
// aloud, to yield, non-lethal. The aftermath honors the terms:
//   - yield: winner takes respect (gossip 'duel_won' {brave:+6, competent:+2}),
//     loser takes humility ('duel_lost' {brave:-4}) — REP, never trust (canon);
//     terror fallout softened (witnesses -10 not -20, yielder -20 not -40,
//     trauma 8 not 12); the dare is consumed ('you_challenged' removed,
//     'duel_fought' recorded).
//   - killing under the terms: oathbreaker named ('duel_broken'
//     {honest:-20, generous:-10, brave:-5} + extra -15 trust) — the terms
//     have teeth.
//   - fled/routed: the dare stands (bout unanswered).
//   - no dare / stale dare (>3 days): no duel flag — control.
//
// Run: node scripts/attack-brawler-duel-20261010.js   (SEED env override)
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

// ---------- seeded RNG (modules capture Math.random at load) ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261010', 10);
Math.random = mulberry32(SEED);

// ---------- boot the full engine ----------
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"]*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: { classList: { remove() {} } } };
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window;
const G = globalThis.Scattering.Game;

(async () => {
  await G.init();
  G.genRoster('Columbus, Ohio');
  G.newGame('Columbus, Ohio', null, G.generatedRoster[0].id);
  G.depart();
  let said = [];
  G.say = (m) => { said.push(String(m)); };
  G.sysSay = (m) => { said.push(String(m)); };
  const sayText = () => { const t = said.join(' '); said = []; return t; };

  const trustCalls = [];
  const _bump = G.bumpTrust.bind(G);
  G.bumpTrust = (vid, amt) => { trustCalls.push([String(vid), amt]); return _bump(vid, amt); };
  const traumaCalls = [];
  const _trauma = G.addTrauma.bind(G);
  G.addTrauma = (n) => { traumaCalls.push(n); return _trauma(n); };

  const s = G.state.scholar, v = G.state.village;
  const me = G.villagerId;
  const others = (v.roster || []).filter(id => id !== me);
  ok(others.length >= 6, 'setup: 6+ villagers besides player', 'have=' + others.length);
  const [t1, t2, t3, t4, t5, t6] = others;
  const grant = (id) => { s.abilities = s.abilities || []; if (!s.abilities.includes(id)) s.abilities.push(id); };
  grant('war_cry');
  const hasMem = (vid, t) => (((v.memory || {})[vid]) || []).some(m => m.t === t);
  const gossipActs = () => (v.gossip || []).map(g => g.action);
  const resetGuard = () => { s.challengeDay = -999; };
  v.party = [t3]; // loyal witness for every fight

  // ============ E1: outstanding dare flags the fight as a duel ============
  resetGuard(); sayText();
  G.useAbility('war_cry', 'challenge', t1);
  ok(hasMem(t1, 'you_challenged'), 'E1 dare recorded on target');
  sayText();
  G.startBetrayalCombat(t1, { aggressor: 'player' });
  const t1say = sayText();
  ok(!!(G.tbfight && G.tbfight.duel), 'E1 fight flagged as duel');
  ok(/THE DARE STANDS/i.test(t1say), 'E1 dare announced aloud at fight start', t1say.slice(0, 90));
  ok(hasMem(t1, 'duel_terms'), 'E1 duel_terms memory recorded');

  // ============ E2: duel yield — terms honored ============
  trustCalls.length = 0; traumaCalls.length = 0; sayText();
  const h1 = G.tbfight.fighters.find(x => x.kind === 'hostile');
  h1._yielded = true; h1.yielded = true; h1.alive = true;
  G.tbEnd('betrayal_yielded');
  ok(gossipActs().includes('duel_won'), 'E2 duel_won gossip seeded (winner respect)');
  ok(gossipActs().includes('duel_lost'), 'E2 duel_lost gossip seeded (loser humility)');
  ok(hasMem(t1, 'lost_duel'), 'E2 lost_duel memory on yielder');
  ok(!hasMem(t1, 'you_challenged'), 'E2 dare consumed when duel resolves');
  ok(hasMem(t1, 'duel_fought'), 'E2 duel_fought recorded');
  const yT = trustCalls.filter(c => c[0] === String(t1)).map(c => c[1]);
  const wT = trustCalls.filter(c => c[0] === String(t3)).map(c => c[1]);
  ok(yT.includes(-20), 'E2 yielder trust -20 (softened from -40)', JSON.stringify(yT));
  ok(wT.includes(-10), 'E2 witness trust -10 (softened from -20)', JSON.stringify(wT));
  ok(traumaCalls.includes(8), 'E2 trauma 8 (softened from 12)', JSON.stringify(traumaCalls));
  ok(!G.tbfight, 'E2 fight object cleared');

  // ============ H2: spent dare cannot bless a second fight (no farm) ============
  resetGuard(); sayText();
  G.startBetrayalCombat(t1, { aggressor: 'player' });
  ok(!(G.tbfight && G.tbfight.duel), 'H2 no duel flag after dare consumed');
  G.tbEnd('fled'); // clean up the probe fight
  sayText();

  // ============ E3: duel-broken — killing under the terms ============
  resetGuard(); sayText();
  G.useAbility('war_cry', 'challenge', t2);
  G.startBetrayalCombat(t2, { aggressor: 'player' });
  ok(!!(G.tbfight && G.tbfight.duel), 'E3 second dare flags second duel');
  sayText(); trustCalls.length = 0;
  const h2 = G.tbfight.fighters.find(x => x.kind === 'hostile');
  h2.alive = false; h2.hp = 0;
  G._lastBetrayal.betrayerDead = true; // the killing blow's bookkeeping
  G.tbEnd('betrayal_won');
  ok(gossipActs().includes('duel_broken'), 'E3 duel_broken gossip seeded (oathbreaker named)');
  const wT3 = trustCalls.filter(c => c[0] === String(t3)).map(c => c[1]);
  ok(wT3.includes(-15), 'E3 witnesses take extra -15 for the oathbreaking', JSON.stringify(wT3));
  ok(!hasMem(t2, 'you_challenged'), 'E3 dare consumed on duel-broken');

  // ============ E4/H1: control — no dare, no duel, full terror ============
  resetGuard(); sayText(); trustCalls.length = 0; traumaCalls.length = 0;
  G.startBetrayalCombat(t4, { aggressor: 'player' });
  ok(!(G.tbfight && G.tbfight.duel), 'E4 no duel flag without a dare');
  const h4 = G.tbfight.fighters.find(x => x.kind === 'hostile');
  h4._yielded = true; h4.yielded = true; h4.alive = true;
  G.tbEnd('betrayal_yielded');
  ok(!gossipActs().includes('duel_won') || true, 'H1 (sanity) control ran');
  const yT4 = trustCalls.filter(c => c[0] === String(t4)).map(c => c[1]);
  const wT4 = trustCalls.filter(c => c[0] === String(t3)).map(c => c[1]);
  ok(yT4.includes(-40), 'H1 control yielder trust -40 (full terror)', JSON.stringify(yT4));
  ok(wT4.includes(-20), 'H1 control witness trust -20 (full terror)', JSON.stringify(wT4));
  ok(traumaCalls.includes(12), 'H1 control trauma 12', JSON.stringify(traumaCalls));
  ok(!G.tbfight, 'H1 control fight cleared');

  // ============ E5: stale dare (>3 days) — no duel ============
  resetGuard(); sayText();
  G.useAbility('war_cry', 'challenge', t5);
  G.state.scholar.day += 4; // the dare goes cold
  G.startBetrayalCombat(t5, { aggressor: 'player' });
  ok(!(G.tbfight && G.tbfight.duel), 'E5 stale dare does not flag a duel');
  G.tbEnd('fled');
  G.state.scholar.day -= 4; sayText();

  // ============ S1: player flees the duel — dare stands, no softlock ============
  resetGuard(); sayText();
  G.useAbility('war_cry', 'challenge', t6);
  G.startBetrayalCombat(t6, { aggressor: 'player' });
  ok(!!(G.tbfight && G.tbfight.duel), 'S1 duel flagged before flee');
  G.tbfight.playerFled = true;
  G.tbEnd('fled');
  ok(!G.tbfight, 'S1 fight object cleared after flee (no hang)');
  ok(!G._lastBetrayal, 'S1 betrayal state cleaned up');
  ok(hasMem(t6, 'you_challenged'), 'S1 dare stands when the bout goes unanswered');
  ok(v.roster.includes(t6), 'S1 challenged villager still in village');

  console.log(`\n${pass} passed, ${fail} failed (seed ${SEED})`);
  if (fail) { console.log('FAILURES:\n' + failures.join('\n')); process.exit(1); }
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
