#!/usr/bin/env node
// Find (day, pid) combos where a full-hp villager DIES in the pit, then run
// one through the FULL contest flow and verify blood-on-air fires.
const H = require('./sim-harness');
(async () => {
  const { Game } = await H.loadGame({ seed: 4242, mode: 'probe' });
  await H.setupGame(Game);
  const v = Game.state.village;
  v.positions = v.positions || {};
  const roster = (v.roster || []).slice(0, 6);
  for (const pid of roster) { try { v.health[pid] = 100; } catch (e) {} v.positions[pid] = { mx: 4, my: 4 }; }
  const pool = Game.contestPool();
  const pit = Game._contestScaled(pool.find(c => c.id === 'pit'), null);
  const dying = [];
  for (let day = 14; day <= 40 && dying.length < 3; day++) {
    Game.state.scholar.day = day;
    for (const pid of roster) {
      try { v.health[pid] = 100; } catch (e) {}
      const r = Game.contestResolveVillager(pid, pit, {});
      if (r.outcome === 'died') { dying.push({ day, pid }); break; }
    }
  }
  console.log('dying combos:', JSON.stringify(dying));
  if (!dying.length) { console.log('no dying combo found'); return; }

  // Full flow for the first dying combo
  const { Game: G2 } = await H.loadGame({ seed: 4242, mode: 'probe' });
  await H.setupGame(G2);
  const v2 = G2.state.village;
  v2.positions = v2.positions || {};
  for (const pid of (v2.roster || [])) { try { v2.health[pid] = 100; } catch (e) {} v2.positions[pid] = { mx: 4, my: 4 }; }
  G2.state.scholar.day = dying[0].day;
  let crisis = 0, crisisCtx = null;
  const origFC = G2.fireCrisis;
  G2.fireCrisis = function (kind, ctx) {
    if (kind === 'blood-on-air') { crisis++; crisisCtx = ctx; }
    return origFC.call(this, kind, ctx);
  };
  const pit2 = G2._contestScaled(G2.contestPool().find(c => c.id === 'pit'), null);
  // force this specific villager as the 'other'
  const origFire = G2.fireContest;
  G2.fireContest = function (contest) {
    const r = origFire.call(this, contest);
    if (G2.state.pendingContest) G2.state.pendingContest.participants = ['player', dying[0].pid];
    return r;
  };
  G2.fireContest(pit2);
  G2.state.scholar.day = dying[0].day + 1;
  // keep the forced day for resolution determinism: contestResolveVillager
  // seeds on scholar.day — set back to the dying day before resolveOthers runs
  const origOthers = G2._contestResolveOthers;
  G2._contestResolveOthers = function (ac) {
    G2.state.scholar.day = dying[0].day;
    return origOthers.call(this, ac);
  };
  G2.resolveContest();
  let guard = 0;
  while (G2.state.activeContest && guard++ < 400) {
    H.driveFights(G2, { id: 'probe', fight: null }, {});
    if (G2.over) break;
    try { if (G2.state.activeContest && !(G2.tbfight && !G2.tbfight.over)) G2.contestChoose(0); }
    catch (e) { break; }
    if (G2.over) break;
  }
  H.driveFights(G2, { id: 'probe', fight: null }, {});
  const stillMember = G2.isMember(dying[0].pid);
  console.log(`full flow: villager dead=${!stillMember} crises fired=${crisis} ctx=${JSON.stringify(crisisCtx)}`);
  console.log(crisis === 1 && !stillMember ? 'PASS: death -> crisis, reactive' : 'FAIL');
})();
