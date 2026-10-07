#!/usr/bin/env node
// REPRODUCER (Steve 2026-10-06): language debug scenario is broken.
// The scenario sets v.bgLangs[rid] = {native, levels:{native:3}} intending
// "zero English", but hydrated person records carry person.languages
// (fluent English), and npcLangs() prefers person.languages over bgLangs.
// Result: commLevel() = full/english, the nonverbal barrier never triggers,
// villagers speak fluent English. The scenario's premise is silently defeated.
//
// EXPECTED: after Game.debugScenario('language'), talking to a roster
// villager opens the nonverbal thread (barrier stated, foreign tongue).
// ACTUAL (bug): commLevel is full English; talkTo yields fluent English dialogue.
//
// FIX (not applied here — debug-scenarios.js is outside this worker's safe
// files): the scenario must override person.languages (or delete it) in
// addition to bgLangs, e.g.:
//   const p = Game.getPerson(rid); if (p) p.languages = { native: t, levels: { [t]: 3 } };
//
// Usage: node scripts/test-language-scenario-20261007.js
// Exit 0 = barrier works (fixed), Exit 1 = bug present.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const FILES = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
  'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js',
  'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js',
];
for (const f of FILES) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
delete global.window;
const Game = globalThis.Scattering.Game;
let sayLog = [];
Game.say = (t) => { sayLog.push(String(t)); };

(async () => {
  await Game.init();
  Game.debugScenario('language');
  const v = Game.state.village;
  const roster = (v.roster || []).filter(rid => rid !== Game.villagerId);
  let failures = 0;

  // 1. Every roster villager must have NO English after the scenario.
  for (const rid of roster.slice(0, 6)) {
    let comm;
    try { comm = Game.commLevel(rid); } catch (e) { comm = { level: 'ERR' }; }
    const ok = comm && comm.level !== 'full' && comm.lang !== 'english';
    console.log(`  ${ok ? '✓' : '✗'} ${rid.slice(0, 12)}: commLevel=${comm && comm.level}/${comm && comm.lang} ${ok ? '' : '(barrier defeated — speaks English!)'}`);
    if (!ok) failures++;
  }

  // 2. Talking must open the nonverbal thread, not fluent English dialogue.
  const rid = roster[0];
  sayLog = [];
  Game.talkTo(rid);
  const out = sayLog.join(' ');
  const barrierStated = /no shared words|speaks only|don't understand|not understand/i.test(out);
  const fluentEnglish = new RegExp(rid && Game.displayName(rid) ? Game.displayName(rid).split(',')[0] + ':\\s*"[A-Z]' : 'nomatch').test(out);
  console.log(`  ${barrierStated ? '✓' : '✗'} barrier stated in talk output ${barrierStated ? '' : '— NPC just started talking in English'}`);
  if (!barrierStated) failures++;

  // 3. npcLangs must reflect the scenario override, not hydrated English.
  const nl = Game.npcLangs(rid);
  const noEnglish = !nl || !((nl.levels || {}).english > 0);
  console.log(`  ${noEnglish ? '✓' : '✗'} npcLangs(${rid.slice(0, 12)}): ${JSON.stringify(nl && { native: nl.native, levels: nl.levels })}`);
  if (!noEnglish) failures++;

  console.log(failures ? `\nFAIL: language scenario broken (${failures} checks)` : '\nPASS: language barrier works');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('HARNESS FATAL:', e.message); process.exit(2); });
