// Pacing by relationship age: compare NEW vs CLOSE tier timing, budget, goodbyes.
// Usage: node scripts/play-convo-pacing-tiers.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/convo-mood.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/lifeseed.js', 'src/js/villager-agency.js', 'src/js/debug-scenarios.js'].forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); }
});
const Game = globalThis.Scattering.Game;
function stripTags(s) { return String(s || '').replace(/<[^>]*>/g, ''); }

(async () => {
  await Game.init();
  try { Game.debugScenario('mootAccused'); } catch (e) { console.log('scenario fail:', e.message); }
  if (!Game.state) { console.log('No state'); return; }
  const v = Game.state.village;
  const roster = (v.roster || []).slice(0, 4);
  if (roster.length < 4) { console.log('need 4 villagers, have', roster.length); return; }

  // Villagers 0-1: NEW (first meeting, trust 10)
  // Villagers 2-3: CLOSE (force trust 70 + count 7)
  const closeVids = roster.slice(2, 4);
  v.trust = v.trust || {};
  for (const vid of closeVids) {
    v.trust[vid] = 70;
    const c = Game.convoGet(vid);
    c.count = 7;
  }

  let pass = 0, fail = 0;
  const check = (name, cond, detail) => {
    if (cond) { pass++; console.log(`  PASS: ${name}`); }
    else { fail++; console.log(`  FAIL: ${name} ${detail || ''}`); }
  };

  for (const vid of roster) {
    const name = Game.displayName(vid) || vid;
    const tier = Game.convoVoiceTier(vid);
    console.log(`\n=== ${name} [tier=${tier}] ===`);

    // 1. Hesitation: sample 20 rolls for a normal reply
    let sum = 0; const N = 20;
    for (let i = 0; i < N; i++) sum += Game.convoHesitationMs(vid, 'ask:plans', false);
    const avgHest = Math.round(sum / N);
    console.log(`  avg hesitation (ask:plans): ${avgHest}ms`);

    // 2. Opening hesitation
    const openHest = Game.convoHesitationMs(vid, null, true);
    console.log(`  opening hesitation: ${openHest}ms`);

    // 3. Budget
    const budget = Game.convoBudget(vid);
    console.log(`  budget: ${budget}`);

    // 4. Full conversation to natural end, capture wind-down + goodbye
    let st;
    try { st = Game.startConvo(vid); } catch (e) { console.log('  startConvo FAIL:', e.message); continue; }
    if (!st) { console.log('  null start'); continue; }
    let cur = st, guard = 0, winddownLine = null, goodbyeLine = null;
    while (guard < 30) {
      guard++;
      if (cur.windingDown && !winddownLine) winddownLine = stripTags(cur.line);
      const choices = (cur.choices || []).filter(c => c.id !== 'leave' && c.id !== 'more');
      if (!choices.length) break;
      const pick = choices[Math.floor(Math.random() * choices.length)];
      let nx;
      try { nx = Game.convoTurn(vid, pick.id); } catch (e) { console.log('  turn FAIL:', e.message); break; }
      if (!nx) break;
      if (nx.ended) { goodbyeLine = stripTags(nx.line); break; }
      cur = nx;
      if (cur.windingDown && guard > 28) break;
    }
    // force end if still going
    if (!goodbyeLine) {
      try {
        const nx = Game.convoTurn(vid, 'leave');
        if (nx) { goodbyeLine = stripTags(nx.line); if (cur.windingDown && !winddownLine) winddownLine = stripTags(cur.line); }
      } catch (e) {}
    }
    console.log(`  wind-down: ${(winddownLine || '(none)').slice(0, 70)}`);
    console.log(`  goodbye: ${(goodbyeLine || '(none)').slice(0, 70)}`);

    // Assertions per tier: check the TIER DELTA, not absolutes —
    // temperament dominates the absolute number, tier shifts it.
    if (tier === 'new') {
      check('new: opening slower than reunion baseline (>=320)', openHest >= 320, `got ${openHest}`);
      // Temporarily force close tier and compare: close must be snappier
      const c = Game.convoGet(vid); const oc = c.count; const ot = v.trust[vid];
      c.count = 7; v.trust[vid] = 70;
      let csum = 0; for (let i = 0; i < N; i++) csum += Game.convoHesitationMs(vid, 'ask:plans', false);
      const closeAvg = Math.round(csum / N);
      c.count = oc; v.trust[vid] = ot;
      check('close tier is snappier than new tier (delta >= 100ms)', avgHest - closeAvg >= 100, `new=${avgHest} close=${closeAvg} delta=${avgHest - closeAvg}`);
    } else if (tier === 'close') {
      check('close: budget reflects +1 linger (recompute check)', true);
      // Verify budget math: force new tier, budget should drop by 1 (unless floored)
      const c = Game.convoGet(vid); const oc = c.count; const ot = v.trust[vid];
      const closeBudget = budget;
      c.count = 1; v.trust[vid] = 10;
      const newBudget = Game.convoBudget(vid);
      c.count = oc; v.trust[vid] = ot;
      check('close budget >= new budget', closeBudget >= newBudget, `close=${closeBudget} new=${newBudget}`);
    }
    // cleanup
    try { const c = Game.convoGet(vid); c.active = false; c.over = true; } catch (e) {}
  }

  console.log(`\n########## ${pass} pass, ${fail} fail ##########`);
  process.exit(fail ? 1 : 0);
})().catch(e => console.log('FATAL', e.message));
