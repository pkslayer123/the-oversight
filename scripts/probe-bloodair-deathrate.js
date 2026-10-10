#!/usr/bin/env node
// probe-bloodair-deathrate.js — Gap 4: directly measure villager death rates
// through contestResolveVillager (the real engine) for every contest,
// across (day, hp) combos. Deterministic seeding means this measures the
// engine's real danger, not RNG luck.
const H = require('./sim-harness');

(async () => {
  const { Game } = await H.loadGame({ seed: 20261010, mode: 'probe' });
  await H.setupGame(Game);
  const roster = (Game.state.village.roster || []).slice(0, 6);
  const pool = Game.contestPool();
  const ids = ['pit', 'gauntlet', 'duel', 'tithe', 'siege', 'drop', 'starve', 'moot', 'maw', 'hide', 'lies', 'cookfight'];
  console.log('villagers:', roster.length, 'day:', Game.state.scholar.day);

  for (const cid of ids) {
    const base = pool.find(c => c.id === cid);
    if (!base) { console.log(cid, 'NOT IN POOL'); continue; }
    const contest = Game._contestScaled(base, null);
    let n = 0, died = 0, won = 0, lost = 0, nul = 0;
    for (let day = 14; day <= 44; day++) {
      Game.state.scholar.day = day;
      for (const pid of roster) {
        for (const hp of [35, 60, 85, 100]) {
          try { Game.state.village.health[pid] = hp; } catch (e) {}
          let r = null;
          try { r = Game.contestResolveVillager(pid, contest, {}); } catch (e) { r = null; }
          n++;
          if (!r) nul++;
          else if (r.outcome === 'died') died++;
          else if (r.outcome === 'won') won++;
          else lost++;
        }
      }
    }
    console.log(`${cid.padEnd(10)} cat=${String(base.cat).padEnd(10)} n=${n} died=${died} (${(100 * died / n).toFixed(1)}%) won=${won} lost=${lost} null=${nul}`);
  }
})();
