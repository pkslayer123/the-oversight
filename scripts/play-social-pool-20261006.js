// PLAYTEST as a player: social small-pool expansion (Steve 2026-10-06).
// Reads new ambush openers/tells, justiceConfront variants, and truth liar
// lines out loud and judges: do they feel like people, or like a menu?
// Usage: node scripts/play-social-pool-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/lifeseed.js', 'src/js/villager-agency.js', 'src/js/debug-scenarios.js'].forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); }
});
const Game = globalThis.Scattering.Game;

const said = [];
const rawSay = Game.say;
Game.say = function (t) { said.push(String(t)); return rawSay.call(this, t); };
const lastSaid = (n) => said.slice(-n);

(async () => {
  await Game.init();

  console.log('========== 1. AMBUSH OPENERS (as the player, mid-walk) ==========\n');
  // Run the real ambush scenario first, then force identities to surface
  // each conditional opener.
  const rosterOf = () => (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const setupAmbush = (leaderTrust, leaderTemp) => {
    Game.debugScenario('ambush');
    const roster = rosterOf();
    const leader = roster[0], acc = [roster[1], roster[2]];
    const v = Game.state.village;
    v.trust = v.trust || {};
    v.trust[leader] = leaderTrust;
    const vp = Game.vpOf(leader) || {};
    vp.personality = vp.personality || {};
    const realTemp = vp.personality.temperament;
    vp.personality.temperament = leaderTemp;
    const plot = { id: 't' + Math.random(), leader, inviter: leader, accomplices: acc, target: Game.villagerId, tells: [], round: 0 };
    Game.springAmbush(plot);
    vp.personality.temperament = realTemp;
    return lastSaid(3);
  };
  const cases = [
    ['close friend leader (trust 60)', 60, 'steady'],
    ['bold stranger leader (trust 10)', 10, 'bold'],
    ['cautious leader (trust 15)', 15, 'cautious'],
    ['withdrawn leader (trust 5)', 5, 'withdrawn'],
    ['intense leader (trust 20)', 20, 'intense'],
  ];
  for (const [label, trust, temp] of cases) {
    const lines = setupAmbush(trust, temp);
    console.log(`--- ${label} ---`);
    // print the opener line (the one starting with a quote)
    const opener = lines.find(l => l.startsWith('"'));
    console.log('  OPENER:', opener || '(not found)');
    console.log('');
  }

  console.log('========== 2. AMBUSH TELLS (high perception = all 8) ==========\n');
  Game.debugScenario('ambush');
  const r2 = rosterOf();
  const plot2 = { leader: r2[0], inviter: r2[0], accomplices: [r2[1], r2[2]], target: Game.villagerId };
  const realSP = Game.socialPerception;
  Game.socialPerception = () => 100;
  const tells = Game.ambushTells(plot2);
  Game.socialPerception = realSP;
  console.log(`tells seen at perception 100: ${tells.length}/8`);
  tells.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
  console.log('');

  console.log('========== 3. JUSTICE CONFRONTATIONS (as the accused) ==========\n');
  const jcases = [
    ['murder, close confronter', [{ type: 'murder' }], 60],
    ['murder, stranger', [{ type: 'murder' }], 10],
    ['attack, cautious friend', [{ type: 'attack' }], 55, 'cautious'],
    ['attack, stranger', [{ type: 'attack' }], 10],
    ['theft, close friend', [{ type: 'theft' }], 65],
    ['theft, stranger', [{ type: 'theft' }], 10],
    ['heat only, no crimes, close', [], 50],
    ['heat only, wary stranger', [], 10, 'withdrawn'],
  ];
  for (const [label, crimes, trust, temp] of jcases) {
    Game.debugScenario('uprising'); // freshGame + village
    try { Game.state.village.roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId); } catch (e) {}
    const v = Game.state.village;
    const roster = v.roster || [];
    if (!roster.length) { console.log(`--- ${label}: no roster ---`); continue; }
    const confronter = roster[0];
    v.trust = v.trust || {}; v.trust[confronter] = trust;
    if (temp) { const vp = Game.vpOf(confronter) || {}; vp.personality = vp.personality || {}; vp.personality.temperament = temp; }
    const j = Game.justiceState();
    j.crimes = crimes.map(c => ({ type: c.type, day: 1 }));
    j.stage = 1; j.confrontedBy = null; j.pendingConfront = false;
    // rig the pick: make confronter[0] win by forcing bold temp if needed
    said.length = 0;
    try { Game.justiceConfront(); } catch (e) { console.log('  ERROR:', e.message); continue; }
    const line = said.find(l => l.startsWith('⚖'));
    console.log(`--- ${label} ---`);
    console.log('  ' + (line || '(no confrontation line)'));
    console.log('');
  }

  console.log('========== 4. LIAR LINES (truth pools) ==========\n');
  Game.debugScenario('liars');
  const rid = rosterOf()[0];
  const fill = (t) => t.replaceAll('{first}', 'Mara').replaceAll('{told}', 'Navy SEAL').replaceAll('{truth}', 'dockhand');
  console.log('--- observeTellOrigin (6) ---');
  Game.truthLinePools.observeTellOrigin.forEach((t, i) => console.log(`  ${i + 1}. ${fill(t)}`));
  console.log('\n--- motiveManipulation (5) ---');
  Game.truthLinePools.motiveManipulation.forEach((t, i) => console.log(`  ${i + 1}."${t.trim()}"`));
  console.log('\n--- motivePathological (5) ---');
  Game.truthLinePools.motivePathological.forEach((t, i) => console.log(`  ${i + 1}."${t.trim()}"`));
  console.log('\nDONE.');
})().catch(e => console.log('FATAL', e.message, e.stack && e.stack.split('\n')[1]));
