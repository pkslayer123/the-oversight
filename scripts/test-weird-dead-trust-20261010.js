#!/usr/bin/env node
// PROOF TEST: dead villagers must never act again (weirdness hunt 2026-10-10).
// 16 long organic sims (progress/mvc/survivalist/socialite x 4 seeds) surfaced
// trust events for villagers DAYS after their deaths. Root causes:
//   W1. bestMentor() (progression.js) picks from the STALE trust map — the
//       dead can be named "mentor" in the slotMoment(40) beat ("X watches you
//       work, then reaches over") and accrue +4 trust post-mortem.
//   W2. socialSimmer/conflictIncident (game.js) keep firing conflicts whose
//       party is dead — "You carry a message from [corpse] to X" + trust bumps.
//   W5. removeVillager(vid, 'ambushed') never marks the record dead
//       (only 'killed' did) — vpOf().dead lies for ambush victims.
//   W6. justice.js wraps G.bumpTrust as (vid, n) and drops `reason` — all
//       3985 trust events in the sim corpus carried reason '?', so no
//       reputation delta had a cause in telemetry.
// Green across 3 seeds: SEED=N node scripts/test-weird-dead-trust-20261010.js
const H = require('./sim-harness.js');
const SEED = parseInt(process.env.SEED || '20261010', 10);

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + name + (detail ? ' — ' + detail : '')); }
};

(async () => {
  const { Game } = await H.loadGame({ seed: SEED, mode: 'weird-dead-trust' });
  await H.setupGame(Game);
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  const deadId = roster[0], liveId = roster[1];

  // Kill deadId through the real pipeline.
  v.trust = v.trust || {};
  v.trust[deadId] = 90; v.trust[liveId] = 10;
  Game.hurtVillager(deadId, 9999, 'proof test');
  ok('victim left the roster', !(v.roster || []).includes(deadId));
  ok('victim has a death record', !!((v.fallen || []).some(f => f.villagerId === deadId)));

  // ---- W1: bestMentor never names the dead ----
  const mentor = Game.bestMentor();
  ok('W1 bestMentor() skips the dead', mentor !== deadId, 'returned ' + mentor);
  ok('W1 bestMentor() names someone living', !mentor || (v.roster || []).includes(mentor), 'returned ' + mentor);

  // ---- W1b: the slotMoment(40) beat never eulogizes a corpse as teacher ----
  const said = [];
  const _say = Game.say.bind(Game);
  Game.say = (m) => { said.push(String(m)); return _say(m); };
  const teleTrust = [];
  const _tele = Game.tele.bind(Game);
  Game.tele = (t, p) => { if (t === 'trust') teleTrust.push(p); return _tele(t, p); };
  try { Game.progState().slotMoments = {}; } catch (e) {}
  const deadName = (() => { try { return Game.displayName(deadId); } catch (e) { return deadId; } })();
  Game.slotMoment(40);
  // NOTE: match the FULL descriptor — pre-System descriptors share first
  // words ("A man, maybe 30s" vs "A man, maybe 40s, with tattooed arms").
  const deadTaught = said.some(m => m.indexOf(deadName) >= 0 && /watches|reaches over|Like this/.test(m));
  ok('W1b slotMoment(40) never has the corpse teach', !deadTaught, said.filter(m => m.indexOf('MENTOR') >= 0).join(' | ').slice(0, 160));
  ok('W1b no trust bump for the dead mentor', !teleTrust.some(t => t.who === deadId), JSON.stringify(teleTrust.filter(t => t.who === deadId)));

  // ---- W2: conflicts with a dead party resolve instead of simmering ----
  teleTrust.length = 0;
  v.conflicts = [{ a: deadId, b: liveId, known: true, tension: 90, resolved: false }];
  Game.socialSimmer();
  const c = v.conflicts[0];
  ok('W2 conflict with dead party resolves', c.resolved === true, 'resolved=' + c.resolved);
  ok('W2 no trust movement for the dead party', !teleTrust.some(t => t.who === deadId), JSON.stringify(teleTrust.filter(t => t.who === deadId)));

  // ---- W5: ambush victims are marked dead ----
  const ambushId = (v.roster || []).filter(id => id !== Game.villagerId)[0];
  Game.removeVillager(ambushId, 'ambushed');
  let ambushDead = false;
  try { ambushDead = !!(Game.vpOf(ambushId) || {}).dead; } catch (e) {}
  ok('W5 ambushed victim marked dead', ambushDead);

  // ---- W6: bumpTrust reason reaches telemetry ----
  teleTrust.length = 0;
  const live2 = (v.roster || []).filter(id => id !== Game.villagerId)[0];
  v.trust[live2] = 20;
  Game.bumpTrust(live2, 5, 'proof reason');
  const ev = teleTrust.find(t => t.who === live2);
  ok('W6 trust event carries its reason', !!ev && ev.reason === 'proof reason', 'reason=' + (ev && ev.reason));

  console.log(`\nweird-dead-trust: ${pass} passed, ${fail} failed (seed ${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR: ' + (e && e.stack || e)); process.exit(2); });
