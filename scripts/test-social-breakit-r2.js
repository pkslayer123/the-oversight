#!/usr/bin/env node
// Social break-it R2 (2026-10-08): hostile-player attacks on trust farms,
// softlocks, honesty, dead code. Seeded; SEED env override.
const { newSocialGame, SEED } = require('./social-breakit-harness.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

(async () => {
  const Game = await newSocialGame();
  const v = Game.state.village;
  const vids = v.roster.filter(id => id !== Game.villagerId);
  const vid = vids[0];

  // ---------- ATTACK 1: comfort farm on a chronically hungry villager ----------
  console.log('\n[1] comfort farm (hungry villager, no real act)');
  // force hunger mood: npcMood reads n.hunger > 70
  try { Game.npcNeeds(vid).hunger = 100; } catch (e) {}
  const mood0 = Game.npcMood(vid);
  console.log('  mood: ' + mood0);
  v.trust[vid] = 10;
  let comforts = 0;
  for (let i = 0; i < 40; i++) {
    try { Game.npcNeeds(vid).hunger = 100; } catch (e) {} // hunger never resolves
    const r = Game.comfort(vid);
    if (!r) break;
    comforts++;
  }
  const t1 = (v.trust[vid] || 0);
  console.log(`  after ${comforts} comforts: trust 10 -> ${t1} (talk cap is 40)`);
  check('comfort respects the 40 talk cap', t1 <= 40, `trust=${t1}`);

  // ---------- ATTACK 1b: 'share' comfort (real vulnerability) stays uncapped ----------
  console.log('\n[1b] comfort share (real act, trust>=40 gate) still works past 40');
  v.trust[vid] = 45;
  try { Game.npcNeeds(vid).hunger = 100; } catch (e) {}
  const rShare = Game.comfort(vid, 'share');
  const t1b = (v.trust[vid] || 0);
  console.log(`  share at 45 -> ${t1b} (expect >45: real act, no cap)`);
  check('share comfort still uncapped (real act)', t1b > 45, `trust=${t1b}`);

  // ---------- ATTACK 1c: silent comfort capped, no double-dip from observe ----------
  console.log('\n[1c] silent comfort: single application, capped');
  v.trust[vid] = 38;
  try { Game.npcNeeds(vid).hunger = 100; } catch (e) {}
  Game.comfort(vid, 'silent');
  const t1c = (v.trust[vid] || 0);
  console.log(`  silent at 38 -> ${t1c} (expect 40: +4 capped, no +4 observe drift)`);
  check('silent comfort capped at 40, no double-dip', t1c === 40, `trust=${t1c}`);

  // ---------- ATTACK 2: speak_back (documented HELD — see evidence file) ----------
  // speak_back requires the nonverbal thread + langExposure>=3 (each attempt
  // +1/+2 exposure, ONE per convo) and +3 needs exp>=25 (~13-25 convos of
  // grinding). Each convo costs time (socialTick->tickAction). The design
  // explicitly classifies it a real act (talk:false). Not a zero-cost farm.
  console.log('\n[2] speak_back: HELD by design (progression-gated real act)');

  // ---------- ATTACK 3: promise-keep cycle ('belong' kept by any convo) ----------
  console.log('\n[3] promise-keep cycle farm');
  const v3 = vids[2] || vid;
  // force goal to belong so a plain convo keeps it
  const origGoal = Game.npcGoal;
  Game.npcGoal = function (id) { return id === v3 ? 'belong' : origGoal.call(this, id); };
  v.trust[v3] = 10;
  let cycles = 0;
  for (let i = 0; i < 10; i++) {
    Game.promiseHelp(v3);
    Game.talkTo(v3);
    Game.endConvo(v3, 'left'); // checkPromises('social', vid) keeps 'belong'
    cycles++;
  }
  Game.npcGoal = origGoal;
  const t3 = (v.trust[v3] || 0);
  const keptCount = Object.values(v.promises || {}).filter(p => p.kept === true).length;
  console.log(`  after ${cycles} promise-keep cycles: trust 10 -> ${t3} (kept=${keptCount})`);

  // ---------- ATTACK 4: tellSide uncapped +6/person/case ----------
  console.log('\n[4] tellSide bypasses cap+progressive');
  // fabricate an open case accusing the player
  const bs = Game.betrayalState ? Game.betrayalState() : (v.bs = v.bs || {});
  const caseId = 'testcase1';
  bs.cases = bs.cases || [];
  bs.cases.push({ id: caseId, accused: [Game.villagerId], playerRole: 'accused', status: 'open', toldSide: {}, belief: {}, accuser: vids[3] || vid });
  const v4 = vids[4] || vid;
  v.trust[v4] = 38;
  Game.tellSide(caseId, v4);
  const t4 = (v.trust[v4] || 0);
  console.log(`  tellSide at trust 38: -> ${t4} (talk cap 40; +6 would be 44)`);
  check('tellSide capped at 40 like other words', t4 <= 40, `trust=${t4}`);

  // ---------- ATTACK 4b: makeAmends capped ----------
  console.log('\n[4b] makeAmends (words) capped at 40');
  const v5 = vids[5] || vids[0];
  v.trust[v5] = 38;
  try { Game.repOf(v5).honest = -20; } catch (e) {}
  const rAm = Game.makeAmends(v5);
  const t5 = (v.trust[v5] || 0);
  console.log(`  makeAmends at 38 -> ${t5} (expect <=40)`);
  check('makeAmends capped at 40', t5 <= 40, `trust=${t5}`);

  // ---------- ATTACK 5: exile softlock — talk after exile ----------
  console.log('\n[5] exile then talk (softlock/crash probe)');
  let exErr = null;
  try {
    Game.exilePlayer('test');
    Game.talkTo(vid);
    Game.endConvo(vid, 'left');
  } catch (e) { exErr = e.message; }
  check('no crash talking while exiled', !exErr, exErr);

  // ---------- ATTACK 6: gossip with dead witness ----------
  console.log('\n[6] gossip referencing dead villager');
  const deadVid = vids[vids.length - 1];
  let gErr = null;
  try {
    if (Game.removeVillager) Game.removeVillager(deadVid, 'killed');
    Game.seedGossip('test_rumor', { honest: -5 }, [deadVid, vid]);
    if (Game.spreadGossip) Game.spreadGossip();
    if (Game.gossipTick) Game.gossipTick();
  } catch (e) { gErr = e.message; }
  check('no crash gossiping with dead witness', !gErr, gErr);

  console.log(`\nSEED=${SEED} pass=${pass} fail=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FATAL: ' + (e && e.stack || e)); process.exit(2); });
