// BREAK-IT knowledge (3rd pass): SOFTLOCK — does the monster-naming debate
// converge on its own? kickMonsterNaming seeds 3-4 proposals; endDay adds late
// proposers (50%/day each) and runs monsterNamingCheck. Villagers never SWITCH
// votes, so convergence requires a natural majority of floor(roster/2)+1 on one
// name. The morning pass only tested FORCED convergence (7 votes injected).
// This drives the REAL endDay loop with no player intervention and checks that
// monsterNamingActive() clears within 60 days — across seeds.
'use strict';
const h = require('./break-monsters-harness.js');
const SEEDS = [6606, 7, 424242, 987654321, 20261008];

async function run(seed) {
  global.window = global; // harness deletes it after first load; re-install per game
  const G = await h.freshGame(seed);
  G.say = () => {};
  const mids = (G.data.monsters || []).map(m => m.id);
  if (!mids.length) return { seed, skip: true };
  const mid = mids[0];
  G.kickMonsterNaming(mid);
  const me = G.state.codex.monsters[mid];
  let days = 0, converged = false;
  for (let d = 0; d < 60 && !converged; d++) {
    try { G.endDay(); } catch (e) { return { seed, mid, error: String(e && e.message || e) }; }
    days++;
    if (me.villageName) converged = true;
  }
  const votes = {};
  for (const [, name] of Object.entries(me.proposals || {})) votes[name] = (votes[name] || 0) + 1;
  const top = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  return {
    seed, mid, converged, days,
    villageName: me.villageName || null,
    namingActive: G.monsterNamingActive(),
    proposals: Object.keys(me.proposals || {}).length,
    topVote: top ? `${top[0]} x${top[1]}` : 'none',
    majority: Math.floor((G.state.village.roster || []).length / 2) + 1,
  };
}

async function main() {
  let fails = 0;
  for (const s of SEEDS) {
    const r = await run(s);
    console.log(JSON.stringify(r));
    if (!r.skip && !r.converged) fails++;
  }
  console.log(fails ? `\n${fails}/${SEEDS.length} SEEDS STALLED (softlock)` : '\nALL SEEDS CONVERGED');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
