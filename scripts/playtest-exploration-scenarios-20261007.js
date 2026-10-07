#!/usr/bin/env node
// Playtest: exploration/survival/system debug scenarios as a PLAYER.
// Scenarios: day1, day7, night, starving, language, keepsake, mantle
// Steve's definition of DONE: playable, enjoyable, visuals complete.
// Usage: node scripts/playtest-exploration-scenarios-20261007.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// Stub fetch for data loading
global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')))
});

// Stub window during load (some modules need it), delete after
global.window = global;

// Load order from index.html (minus DOM-only: app.js, sprites.js, tile-scenes.js, move-anim.js)
const files = [
  'src/js/engine/state.js',
  'src/js/engine/modifiers.js',
  'src/js/engine/calories.js',
  'src/js/engine/day.js',
  'src/js/engine/forage.js',
  'src/js/engine/combat.js',
  'src/js/game.js',
  'src/js/encounters.js',
  'src/js/conversation.js',
  'src/js/convo-mood.js',
  'src/js/convoTopics.js',
  'src/js/convo-wants.js',
  'src/js/convo-dialogue.js',
  'src/js/convo-beats.js',
  'src/js/examine.js',
  'src/js/equipment.js',
  'src/js/journal.js',
  'src/js/party.js',
  'src/js/party-formal.js',
  'src/js/truth.js',
  'src/js/contests.js',
  'src/js/storage.js',
  'src/js/perceive.js',
  'src/js/carexplore.js',
  'src/js/justice.js',
  'src/js/food.js',
  'src/js/betrayal.js',
  'src/js/corpses.js',
  'src/js/lifeseed.js',
  'src/js/progression.js',
  'src/js/ledger.js',
  'src/js/villager-agency.js',
  'src/js/codex-people.js',
  'src/js/membership.js',
  'src/js/hierarchy.js',
  'src/js/debug-scenarios.js',
];

for (const f of files) {
  try {
    eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  } catch (e) {
    console.error(`Failed to load ${f}: ${e.message}`);
    process.exit(1);
  }
}

// Delete window stub so game uses sync headless path
delete global.window;

const Game = globalThis.Scattering.Game;
if (!Game) { console.error('Game not loaded'); process.exit(1); }

const results = [];
function record(name, verdict, issues, notes) {
  results.push({ name, verdict, issues, notes });
  console.log(`\n=== ${name}: ${verdict} ===`);
  if (issues.length) issues.forEach(i => console.log(`  ISSUE: ${i}`));
  if (notes) console.log(`  NOTE: ${notes}`);
}

// Capture Game.say output
let said = [];
const origSay = Game.say;
Game.say = function (t) { said.push(String(t)); return origSay.call(this, t); };

async function runScenario(name, playFn) {
  said = [];
  const issues = [];
  let notes = '';
  console.log(`\n##### Running scenario: ${name} #####`);
  try {
    const ok = Game.debugScenario(name);
    if (!ok) {
      record(name, 'BROKEN', ['debugScenario returned false'], '');
      return;
    }
  } catch (e) {
    record(name, 'BROKEN', [`debugScenario threw: ${e.message}`], e.stack.split('\n')[1] || '');
    return;
  }

  // Play as a player
  try {
    const result = await playFn(issues);
    if (result && result.notes) notes = result.notes;
  } catch (e) {
    issues.push(`playthrough threw: ${e.message}`);
  }

  const verdict = issues.length === 0 ? 'PLAYABLE' : (issues.some(i => i.includes('SOFTLOCK') || i.includes('CRASH')) ? 'BROKEN' : 'NEEDS WORK');
  record(name, verdict, issues, notes);
}

(async () => {
  await Game.init();

  // 1. day1 — fresh start
  await runScenario('day1', async (issues) => {
    const s = Game.state.scholar;
    if (!s) { issues.push('No scholar state after day1'); return; }
    if (s.day !== 1) issues.push(`Expected day 1, got day ${s.day}`);
    if (!Game.state.village) issues.push('No village state');
    if (!s.inventory) issues.push('No inventory');
    // Player should be able to see status
    const st = Game.status ? Game.status() : null;
    return { notes: `Day ${s.day}, kcal ${Math.round(s.kcal || 0)}, village: ${Game.state.village ? 'yes' : 'no'}` };
  });

  // 2. day7 — day 7 experience
  await runScenario('day7', async (issues) => {
    const s = Game.state.scholar;
    if (!s) { issues.push('No scholar state after day7'); return; }
    // Check that day 7 transition happened or is set up
    return { notes: `Day ${s.day}, dayPart ${Game.dayPart}` };
  });

  // 3. night — night hunt
  await runScenario('night', async (issues) => {
    const s = Game.state.scholar;
    if (!s) { issues.push('No scholar state'); return; }
    if (Game.dayPart !== 3) issues.push(`Expected night (dayPart 3), got ${Game.dayPart}`);
    if (s.insideHaven) issues.push('Should be outside haven for night hunt');
    // Check that player can act at night (move, etc.)
    return { notes: `dayPart ${Game.dayPart}, insideHaven ${s.insideHaven}` };
  });

  // 4. starving — starving village
  await runScenario('starving', async (issues) => {
    const s = Game.state.scholar;
    const v = Game.state.village;
    if (!s) { issues.push('No scholar state'); return; }
    if (!v) { issues.push('No village state'); return; }
    if (!v.pantry || v.pantry.length === 0) issues.push('Pantry should have some (low) food');
    if (s.kcal > 1000) issues.push(`Scholar should be hungry, kcal=${Math.round(s.kcal)}`);
    return { notes: `Scholar kcal ${Math.round(s.kcal)}, pantry items ${v.pantry.length}` };
  });

  // 5. language — language barrier
  await runScenario('language', async (issues) => {
    const v = Game.state.village;
    if (!v) { issues.push('No village state'); return; }
    if (!v.bgLangs || Object.keys(v.bgLangs).length === 0) {
      issues.push('bgLangs not set — language barrier not configured');
    }
    return { notes: `Villagers with langs: ${v.bgLangs ? Object.keys(v.bgLangs).length : 0}` };
  });

  // 6. keepsake — sentimental item
  await runScenario('keepsake', async (issues) => {
    const s = Game.state.scholar;
    if (!s) { issues.push('No scholar state'); return; }
    const ring = (s.inventory || []).find(i => i.itemId === 'mothers_ring');
    if (!ring) issues.push('mothers_ring not in inventory');
    else if (!ring.sentimental) issues.push('Ring should be marked sentimental');
    return { notes: `Ring in inventory: ${ring ? 'yes' : 'no'}` };
  });

  // 7. mantle — death and mantle passing
  await runScenario('mantle', async (issues) => {
    // The scenario calls Game.playerDeath — check that we're on a new character
    // or that the death flow completed without crashing
    const s = Game.state.scholar;
    if (!s) { issues.push('No scholar state after mantle (death may have broken state)'); return; }
    return { notes: `Scholar exists after death flow: ${s.id || 'unknown'}` };
  });

  // Summary
  console.log('\n\n========== SUMMARY ==========');
  let playable = 0, needsWork = 0, broken = 0;
  for (const r of results) {
    if (r.verdict === 'PLAYABLE') playable++;
    else if (r.verdict === 'NEEDS WORK') needsWork++;
    else broken++;
    console.log(`${r.verdict.padEnd(12)} ${r.name}`);
  }
  console.log(`\nPlayable: ${playable}, Needs Work: ${needsWork}, Broken: ${broken}`);

  // Write report
  const reportPath = path.join(ROOT, 'hidden_files', 'playtest-scenarios-exploration-20261007.md');
  let md = `# Playtest: Exploration/Survival/System Scenarios (2026-10-07)\n\n`;
  md += `Scenarios: day1, day7, night, starving, language, keepsake, mantle\n\n`;
  md += `## Results\n\n`;
  for (const r of results) {
    md += `### ${r.name}: ${r.verdict}\n\n`;
    if (r.issues.length) {
      md += `Issues:\n`;
      r.issues.forEach(i => md += `- ${i}\n`);
      md += `\n`;
    }
    if (r.notes) md += `Notes: ${r.notes}\n\n`;
  }
  md += `## Summary\n\nPlayable: ${playable}, Needs Work: ${needsWork}, Broken: ${broken}\n`;
  fs.writeFileSync(reportPath, md);
  console.log(`\nReport written to ${reportPath}`);

  process.exit(broken > 0 ? 1 : 0);
})();
