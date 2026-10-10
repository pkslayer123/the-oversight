#!/usr/bin/env node
// Summarize contest-reach JSONL runs.
const fs = require('fs');
const files = process.argv.slice(2);
const agg = {
  runs: 0, days: 0,
  fireContest: 0, fireShow: 0, fireSummons: 0,
  interruption: 0, resolveContest: 0, countdownSkipped: 0,
  modalDriveStart: 0, contestEnd: 0, showEnd: 0, contestDie: 0, contestRefuse: 0,
  showVillagerEnd: 0, stuck: 0, modalUnresolved: 0, chooseThrew: 0, endDayThrew: 0,
  arenaDone: 0, arenaStuck: 0,
  verdict: 0, resolveGroup: 0, resolveGroupPids: 0, resolveGroupOutcomes: {},
  bcastLeak: 0, bcastStart: 0, bcastEnd: 0,
  playerDead: 0, villageLost: 0,
  villagerContestParts: 0, villagerShowParts: 0, villagerSummons: 0,
  playerLeads: 0, whimCasts: 0,
  contestCats: {}, contestRisks: {}, showIds: {},
  outcomes: {},
  fanFirst: null, fanLast: null,
  viewershipFirst: [], viewershipLast: [],
  eligibleN: [], rosterN: [],
};
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  agg.runs++;
  let firstV = null, lastV = null, firstFans = null, lastFans = null;
  for (const e of lines) {
    const t = e.type;
    if (agg[t] !== undefined && typeof agg[t] === 'number') agg[t]++;
    if (t === 'runEnd') agg.days += e.day;
    if (t === 'fireContest') {
      agg.contestCats[e.cat] = (agg.contestCats[e.cat] || 0) + 1;
      agg.contestRisks[e.risk] = (agg.contestRisks[e.risk] || 0) + 1;
    }
    if (t === 'fireShow') agg.showIds[e.showId] = (agg.showIds[e.showId] || 0) + 1;
    if (t === 'interruption') {
      const ids = e.participantIds || [];
      const vill = ids.filter(id => id !== 'player');
      if (vill.length) agg.villagerContestParts++;
      if (ids.includes('player')) agg.playerLeads++;
    }
    if (t === 'modalDriveStart' && e.kind === 'show' && e.participant && e.participant !== 'player') agg.villagerShowParts++;
    if (t === 'contestEnd' || t === 'showEnd') {
      agg.outcomes[e.outcome] = (agg.outcomes[e.outcome] || 0) + 1;
      lastFans = e.fans;
      if (!firstFans) firstFans = e.fans;
    }
    if (t === 'resolveGroup') {
      for (const pid of (e.pids || [])) {
        agg.resolveGroupPids++;
        const o = (e.outcomes || {})[pid];
        if (o) agg.resolveGroupOutcomes[o.outcome] = (agg.resolveGroupOutcomes[o.outcome] || 0) + 1;
      }
    }
    if (t === 'dawnSample') {
      if (firstV === null) firstV = e.viewership;
      lastV = e.viewership;
      if (e.eligibleN >= 0) agg.eligibleN.push(e.eligibleN);
      if (e.rosterN >= 0) agg.rosterN.push(e.rosterN);
    }
  }
  if (firstV !== null) agg.viewershipFirst.push(firstV);
  if (lastV !== null) agg.viewershipLast.push(lastV);
}
const per100 = (n) => (n / agg.days * 100).toFixed(2);
console.log(`runs=${agg.runs} totalDays=${agg.days}`);
console.log(`FIRE RATES (per 100 days): contests=${per100(agg.fireContest)} shows=${per100(agg.fireShow)} summons=${per100(agg.fireSummons)}`);
console.log(`  raw: fireContest=${agg.fireContest} fireShow=${agg.fireShow} fireSummons=${agg.fireSummons}`);
console.log(`COUNTDOWN: interruptions=${agg.interruption} resolveContest=${agg.resolveContest} skipped=${agg.countdownSkipped}`);
console.log(`PLAYABILITY: driven=${agg.modalDriveStart} contestEnd=${agg.contestEnd} showEnd=${agg.showEnd} die=${agg.contestDie} refuse=${agg.contestRefuse} showVillagerEnd=${agg.showVillagerEnd}`);
console.log(`  stuck=${agg.stuck} unresolved=${agg.modalUnresolved} chooseThrew=${agg.chooseThrew} endDayThrew=${agg.endDayThrew} arenaDone=${agg.arenaDone} arenaStuck=${agg.arenaStuck}`);
console.log(`VILLAGER PARTICIPATION: contestParts=${agg.villagerContestParts} showParts=${agg.villagerShowParts} playerLeads=${agg.playerLeads}`);
console.log(`  resolveGroup calls=${agg.resolveGroup} pids=${agg.resolveGroupPids} outcomes=${JSON.stringify(agg.resolveGroupOutcomes)}`);
console.log(`BROADCAST: starts=${agg.bcastStart} ends=${agg.bcastEnd} leaks=${agg.bcastLeak}`);
console.log(`SURVIVAL: playerDead=${agg.playerDead} villageLost=${agg.villageLost}`);
console.log(`OUTCOMES: ${JSON.stringify(agg.outcomes)}`);
console.log(`CATS: ${JSON.stringify(agg.contestCats)} RISKS: ${JSON.stringify(agg.contestRisks)}`);
const avg = (a) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : 'n/a';
console.log(`VIEWERSHIP: first=${avg(agg.viewershipFirst)} last=${avg(agg.viewershipLast)}`);
console.log(`ELIGIBLE_N avg=${avg(agg.eligibleN)} ROSTER_N avg=${avg(agg.rosterN)}`);
