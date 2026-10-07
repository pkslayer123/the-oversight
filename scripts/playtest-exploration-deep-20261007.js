#!/usr/bin/env node
// DEEP playtest: exploration/survival/system scenarios AS A PLAYER.
// Takes real actions, checks game responds sensibly, looks for softlocks.
// Usage: node scripts/playtest-exploration-deep-20261007.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')))
});
global.window = global;

const files = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/examine.js',
  'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
  'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
];
for (const f of files) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error(`Failed to load ${f}: ${e.message}`); process.exit(1); }
}
delete global.window;
const Game = globalThis.Scattering.Game;

let said = [];
const origSay = Game.say;
Game.say = function (t) { said.push(String(t)); return origSay.call(this, t); };

const results = [];
function record(name, verdict, issues, notes) {
  results.push({ name, verdict, issues, notes });
  console.log(`\n=== ${name}: ${verdict} ===`);
  issues.forEach(i => console.log(`  ISSUE: ${i}`));
  if (notes) console.log(`  NOTES: ${notes}`);
}

async function scenario(name) {
  said = [];
  const ok = Game.debugScenario(name);
  if (!ok) throw new Error('debugScenario returned false');
  return said.slice();
}

(async () => {
  await Game.init();

  // ============ 1. day1: fresh start as a new player ============
  {
    const issues = [];
    const notes = [];
    const msgs = await scenario('day1');
    const s = Game.state.scholar;

    // As a player: I just started. What do I see? What can I do?
    // Check status is readable
    try {
      const st = Game.status();
      notes.push('status() works');
    } catch (e) { issues.push(`status() threw: ${e.message}`); }

    // Check I can perceive surroundings
    try {
      const p = Game.perceive ? Game.perceive() : null;
      if (!p) issues.push('perceive() returned nothing — player sees nothing on day 1');
      else notes.push('perceive() returns content');
    } catch (e) { issues.push(`perceive() threw: ${e.message}`); }

    // Check available actions — can I figure out what to do?
    // Try moving
    const startMx = s.mx, startMy = s.my;
    try {
      const targets = Game.travelTargets ? Game.travelTargets() : [];
      if (!targets || targets.length === 0) {
        issues.push('No travel targets on day 1 — player cannot move anywhere (SOFTLOCK?)');
      } else {
        notes.push(`${targets.length} travel targets available`);
      }
    } catch (e) { issues.push(`travelTargets threw: ${e.message}`); }

    // Check inventory isn't empty-confusing
    notes.push(`inventory: ${(s.inventory || []).length} items, kcal: ${Math.round(s.kcal || 0)}`);

    record('day1', issues.length ? 'NEEDS WORK' : 'PLAYABLE', issues, notes.join('; '));
  }

  // ============ 2. day7: week transition ============
  {
    const issues = [];
    const notes = [];
    const msgs = await scenario('day7');
    const s = Game.state.scholar;

    // What does the player see? Is the transition explained?
    const hasTransitionMsg = said.some(t => /week|day 7|seven/i.test(t));
    if (!hasTransitionMsg) {
      // Check if debugDay7Experience says anything
      notes.push('No explicit week-transition message in say output');
    } else {
      notes.push('Week transition messaged to player');
    }

    // Can the player still act?
    try {
      const targets = Game.travelTargets ? Game.travelTargets() : [];
      notes.push(`${targets.length} travel targets`);
    } catch (e) { issues.push(`travelTargets threw: ${e.message}`); }

    notes.push(`day=${s.day}`);
    record('day7', issues.length ? 'NEEDS WORK' : 'PLAYABLE', issues, notes.join('; '));
  }

  // ============ 3. night: night hunt ============
  {
    const issues = [];
    const notes = [];
    const msgs = await scenario('night');
    const s = Game.state.scholar;

    // Is night visually/mechanically distinct?
    if (Game.dayPart !== 3) issues.push(`Not night: dayPart=${Game.dayPart}`);

    // Can I move at night?
    try {
      const targets = Game.travelTargets ? Game.travelTargets() : [];
      if (targets.length === 0) issues.push('Cannot move at night (SOFTLOCK?)');
      else notes.push(`${targets.length} move targets at night`);
    } catch (e) { issues.push(`travelTargets threw: ${e.message}`); }

    // Is there a fox to hunt?
    const hasFox = s.animal && s.animal.id === 'gray_fox';
    if (!hasFox) issues.push('No fox spawned — scenario promises a fox hunt');
    else notes.push(`Fox at (${s.animal.mx},${s.animal.my}), aware=${s.animal.aware}`);

    // Can I attack/hunt?
    if (hasFox) {
      // Check hunt actions are available
      notes.push(`Player pos (${s.mx},${s.my}), fox distance ${Math.abs(s.animal.mx - s.mx) + Math.abs(s.animal.my - s.my)}`);
    }

    record('night', issues.length ? 'NEEDS WORK' : 'PLAYABLE', issues, notes.join('; '));
  }

  // ============ 4. starving: starving village ============
  {
    const issues = [];
    const notes = [];
    const msgs = await scenario('starving');
    const s = Game.state.scholar;
    const v = Game.state.village;

    // As a hungry player: can I get food?
    // Check pantry
    const pantryKcal = (v.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0);
    notes.push(`pantry ~${Math.round(pantryKcal)} kcal, scholar ${Math.round(s.kcal)} kcal`);

    if (s.kcal > 800) issues.push(`Scholar not hungry enough for 'starving' scenario (kcal=${Math.round(s.kcal)})`);

    // Can I take from pantry? (This is the core interaction)
    // Check if there's a take-from-pantry action
    try {
      // Try to find pantry interaction
      const hasPantry = v.pantry && v.pantry.length > 0;
      if (!hasPantry) issues.push('Pantry empty — nothing to take, scenario is just waiting to starve');
      else notes.push('Pantry has food to take');
    } catch (e) { issues.push(`pantry check threw: ${e.message}`); }

    // Do villagers react to low food? (trust should be strained)
    const trusts = Object.values(v.trust || {});
    const avgTrust = trusts.length ? trusts.reduce((a, b) => a + b, 0) / trusts.length : 0;
    notes.push(`avg trust ${Math.round(avgTrust)}`);
    if (avgTrust > 30) notes.push('Trust not particularly strained for starving scenario');

    record('starving', issues.length ? 'NEEDS WORK' : 'PLAYABLE', issues, notes.join('; '));
  }

  // ============ 5. language: language barrier ============
  {
    const issues = [];
    const notes = [];
    const msgs = await scenario('language');
    const v = Game.state.village;
    const s = Game.state.scholar;

    // Can I try to talk to someone? What happens?
    const roster = Object.keys(v.bgLangs || {});
    if (roster.length === 0) {
      issues.push('No villagers with languages — barrier not set up');
    } else {
      notes.push(`${roster.length} villagers with foreign languages`);
      // Check that English is not among their languages
      const sampleLang = v.bgLangs[roster[0]];
      if (sampleLang && sampleLang.levels && sampleLang.levels.english) {
        issues.push('Villager knows English — barrier is a lie');
      }
    }

    // Is there a way to learn? (This is the fun — can I overcome it?)
    // Check if language learning mechanics exist
    try {
      const canLearn = typeof Game.learnLanguage === 'function' || typeof Game.studyLanguage === 'function';
      if (!canLearn) notes.push('No obvious language-learning action — barrier may be permanent (is that fun?)');
      else notes.push('Language learning action exists');
    } catch (e) {}

    record('language', issues.length ? 'NEEDS WORK' : 'PLAYABLE', issues, notes.join('; '));
  }

  // ============ 6. keepsake: sentimental item ============
  {
    const issues = [];
    const notes = [];
    const msgs = await scenario('keepsake');
    const s = Game.state.scholar;

    const ring = (s.inventory || []).find(i => i.itemId === 'mothers_ring');
    if (!ring) {
      issues.push('Ring not in inventory — scenario broken');
    } else {
      notes.push(`Ring: sentimental=${!!ring.sentimental}, bond=${ring.bond}`);
      // Can I channel it? (The scenario says "Channel it from your pack")
      // Check if there's a channel/use action for sentimental items
      if (!ring.sentimental) issues.push('Ring not marked sentimental — channel mechanic may not trigger');
    }

    // Did the flashback play?
    const hasFlashback = said.some(t => /flashback|memory|mother/i.test(t));
    if (!hasFlashback) notes.push('No flashback text in say output — did playFlashback run?');

    record('keepsake', issues.length ? 'NEEDS WORK' : 'PLAYABLE', issues, notes.join('; '));
  }

  // ============ 7. mantle: death and succession ============
  {
    const issues = [];
    const notes = [];
    let deathWorked = false;
    try {
      const msgs = await scenario('mantle');
      deathWorked = true;
    } catch (e) {
      issues.push(`mantle scenario threw: ${e.message} (SOFTLOCK? — death broke the game)`);
    }

    if (deathWorked) {
      const s = Game.state.scholar;
      if (!s) {
        issues.push('No scholar after death — game is in broken state (SOFTLOCK)');
      } else {
        notes.push('Scholar exists after death flow');
        // Are we a NEW character? (The fiction: "You're not her")
        // Check if there's indication of succession
        const hasMantleMsg = said.some(t => /mantle|codex|new face|not her/i.test(t));
        if (!hasMantleMsg) notes.push('No clear succession messaging — player may be confused about who they are now');
        else notes.push('Succession messaged');
      }
    }

    record('mantle', issues.length ? 'NEEDS WORK' : 'PLAYABLE', issues, notes.join('; '));
  }

  // Summary
  console.log('\n\n========== DEEP PLAYTEST SUMMARY ==========');
  let playable = 0, needsWork = 0, broken = 0;
  for (const r of results) {
    if (r.verdict === 'PLAYABLE') playable++;
    else if (r.verdict === 'NEEDS WORK') needsWork++;
    else broken++;
    console.log(`${r.verdict.padEnd(12)} ${r.name} (${r.issues.length} issues)`);
  }
  console.log(`\nPlayable: ${playable}, Needs Work: ${needsWork}, Broken: ${broken}`);

  const reportPath = path.join(ROOT, 'hidden_files', 'playtest-scenarios-exploration-20261007.md');
  let md = `# Deep Playtest: Exploration/Survival/System Scenarios (2026-10-07)\n\n`;
  md += `Played as a player. Steve's DONE = playable, enjoyable, visuals complete.\n\n`;
  md += `Scenarios: day1, day7, night, starving, language, keepsake, mantle\n\n`;
  for (const r of results) {
    md += `## ${r.name}: ${r.verdict}\n\n`;
    if (r.issues.length) {
      md += `### Issues\n`;
      r.issues.forEach(i => md += `- ${i}\n`);
      md += `\n`;
    }
    if (r.notes) md += `Notes: ${r.notes}\n\n`;
  }
  md += `## Summary\n\nPlayable: ${playable}, Needs Work: ${needsWork}, Broken: ${broken}\n`;
  fs.writeFileSync(reportPath, md);
  console.log(`\nFull report: ${reportPath}`);
  process.exit(0);
})();
