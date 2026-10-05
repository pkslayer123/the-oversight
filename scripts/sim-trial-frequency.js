// Trial wild-day frequency tuning sim.
// Usage: node scripts/sim-trial-frequency.js [gamesPerRate]
// Simulates full conflict-biased games: seeds grievances, arms plots, runs
// ambushes (player targets driven through RUN exchanges, NPC targets via sim),
// applies diligent/casual evidence strategies, conducts trials, and measures:
//  - trials per game, wild-day share
//  - PAIRED flip rate: same case, same RNG seed, wild swing vs calm swing
//  - "stolen" trials: outcome contradicts decisive evidence (|avgBelief| >= 20)
//  - player role distribution (target/accused/bystander/witness)
// Compares WILD_DAY_RATE in [0.25, 0.15, 0.10, 0.05].
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickR = (arr, r) => arr[Math.floor(r() * arr.length)];

function applyEvidence(c, diligent, plot) {
  Game.seedTargetStory(c); // the target's version — baseline for both strategies
  if (Game.isPlayer(c.target) && (plot.woundsTaken || 0) > 0) Game.showWounds(c.id);
  if (!diligent) return;
  Game.examineAmbushSite(c.id);
  Game.nameWitnesses(c.id);
  for (const a of c.accused) Game.pressAccomplice(c.id, a);
  Game.approachWeakest(c.id, true);
}

async function runGame(rate, gameIdx, DAYS) {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.say = () => {}; Game.tickAction = () => {};
  Game.WILD_DAY_RATE = rate;
  Game.WILD_DAY_NO_CLUSTER = (process.env.MODE === 'uniform');
  const r = mulberry32(9000 + gameIdx);
  const v = Game.state.village;
  const npcs = () => v.roster.filter(id => id !== Game.villagerId);

  const seedConflict = () => {
    const ids = npcs();
    for (let i = 0; i < 8 && ids.length > 1; i++) {
      const a = pickR(ids, r), b = pickR(ids, r);
      if (a !== b) Game.recordGrievance(a, b, 'theft', 50 + Math.floor(r() * 30));
    }
    for (let i = 0; i < 3 && ids.length; i++) Game.recordGrievance(pickR(ids, r), Game.villagerId, 'insult', 55);
    for (let i = 0; i < 3 && ids.length; i++) { try { Game.vpOf(pickR(ids, r)).goal = 'lead'; } catch (e) {} }
  };
  seedConflict();

  const trials = [];
  for (let day = 6; day <= DAYS; day++) {
    if (day % 15 === 0) seedConflict(); // keep the village fractious
    Game.state.scholar.day = day;
    try {
      Game.considerBetrayalPlot();
      const bs = Game.betrayalState();
      const plot = (bs.plots || []).find(p => p.active && !p.sprung && !p.resolved);
      if (!plot) continue;
      let caseId = null;
      if (Game.isPlayer(plot.target)) {
        Game.springAmbush(plot);
        let res = { continue: true }, guard = 0;
        while (res && res.continue && guard++ < 8) res = Game.ambushExchange(plot, 'run');
        caseId = (res && res.caseId) || (bs.cases.length ? bs.cases[bs.cases.length - 1].id : null);
      } else {
        caseId = Game.simNpcAmbush(plot).caseId;
      }
      const c = caseId && Game.getCase(caseId);
      if (!c || c.status !== 'open') continue;
      const diligent = (trials.length % 2 === 0);
      applyEvidence(c, diligent, plot);
      const evStrength = Game.avgBelief(c); // before trial; negative = guilty
      const t = Game.callMoot(c.id);
      if (t && t.awaitingPlayerVote) Game.castPlayerVote(c.id, evStrength < 0); // honest vote
      // paired counterfactual: same seed, wild vs calm swing
      const seed = 100000 + gameIdx * 1000 + trials.length;
      const tWild = Game.tallyVotes(c, true, mulberry32(seed));
      const tCalm = Game.tallyVotes(c, false, mulberry32(seed));
      const pv = evStrength < 0 ? 1 : 0; // same honest player vote
      const convOf = (tt) => (tt.guilty + (tt.playerVoter ? pv : 0)) >= Math.floor((tt.present.length + (tt.playerVoter ? 1 : 0)) / 2) + 1;
      const convWild = convOf(tWild), convCalm = convOf(tCalm);
      trials.push({
        day, wild: !!c.trial.wildDay, convicted: !!c.trial.convicted,
        evStrength, role: c.playerRole, diligent,
        flip: convWild !== convCalm,
        stolen: (evStrength <= -20 && !c.trial.convicted) || (evStrength >= 20 && c.trial.convicted),
        strongAcquit: evStrength <= -20 && !c.trial.convicted,
        weakConvict: evStrength >= 20 && c.trial.convicted,
        wildRate: Game.wildDayRate(),
        traumaRecent: (() => { try { return Game.recentTrauma(5); } catch (e) { return false; } })(),
      });
    } catch (e) { /* keep the sim alive */ }
  }
  return trials;
}

function summarize(rate, allTrials, games) {
  const T = allTrials.flat();
  const n = T.length;
  const f = (k) => T.filter(k).length / Math.max(1, n);
  const perGame = allTrials.map(t => t.length);
  const stolenPerGame = allTrials.map(t => t.filter(x => x.stolen).length);
  const roles = {};
  for (const t of T) roles[t.role] = (roles[t.role] || 0) + 1;
  console.log(`\n=== WILD_DAY_RATE = ${rate} (${games} games x 100 days, ${n} trials) ===`);
  console.log(`trials/game: ${(n / games).toFixed(2)}`);
  console.log(`wild-day share of trials: ${f(t => t.wild).toFixed(3)} (target ~${rate})`);
  console.log(`PAIRED flip rate (wild vs calm, same seed): ${f(t => t.flip).toFixed(3)}`);
  console.log(`stolen trials (vs decisive evidence): ${f(t => t.stolen).toFixed(3)}`);
  console.log(`  strong-case acquitted: ${f(t => t.strongAcquit).toFixed(3)} | weak-case convicted: ${f(t => t.weakConvict).toFixed(3)}`);
  console.log(`stolen moments per game: mean ${(stolenPerGame.reduce((a, b) => a + b, 0) / games).toFixed(2)}, games with >=1: ${(stolenPerGame.filter(x => x >= 1).length / games * 100).toFixed(0)}%`);
  console.log(`player roles: ${Object.entries(roles).map(([k, v]) => `${k} ${(v / n * 100).toFixed(0)}%`).join(', ')}`);
  console.log(`evidence strategy split: diligent ${f(t => t.diligent).toFixed(2)}`);
  const wildTrials = T.filter(t => t.wild);
  if (wildTrials.length) {
    console.log(`mean wildDayRate at trial time: ${(T.reduce((a, t) => a + t.wildRate, 0) / n).toFixed(3)} (effective)`);
    console.log(`wild-day trials with recent trauma: ${(wildTrials.filter(t => t.traumaRecent).length / wildTrials.length * 100).toFixed(0)}% (legibility)`);
  }
  return { rate, trialsPerGame: n / games, flip: f(t => t.flip), stolen: f(t => t.stolen), stolenPerGame: stolenPerGame.reduce((a, b) => a + b, 0) / games, gamesWithStolen: stolenPerGame.filter(x => x >= 1).length / games };
}

(async () => {
  const gamesPerRate = parseInt(process.argv[2] || '25', 10);
  const DAYS = 100;
  const results = [];
  for (const rate of [0.25, 0.15, 0.10, 0.05]) {
    const all = [];
    for (let g = 0; g < gamesPerRate; g++) all.push(await runGame(rate, g, DAYS));
    results.push(summarize(rate, all, gamesPerRate));
  }
  console.log('\n--- recommendation inputs ---');
  for (const r of results) console.log(`rate ${r.rate}: flip=${r.flip.toFixed(3)} stolen=${r.stolen.toFixed(3)} stolen/game=${r.stolenPerGame.toFixed(2)} gamesWStolen=${(r.gamesWithStolen * 100).toFixed(0)}% trials/game=${r.trialsPerGame.toFixed(2)}`);
})();
