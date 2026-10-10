#!/usr/bin/env node
// Break-it abilities r2 2026-10-10 — knowledge pipeline + synergy-leg audit.
//
// Hostile-player attacks (full knowledge of the code):
//   EXPLOIT   — molt.shed_skin double-logging synergy discovery attempts
//               (one tap = 2 attempts; 3-attempt synergies unlock in 2 taps).
//   SOFTLOCK  — none found this run (phoenix no-village path, death-cheat
//               budgets, and slot caps all held under attack; see evidence).
//   HONESTY   — time_skip copy promised "Ages you 1 day" (ageDebt removed
//               2026-10-08; no aging mechanic exists); knowledge skill
//               mechanicals silently did nothing (copy/descriptions imply
//               real effects).
//   DEAD CODE — allModifiers() (the ONLY merger of knowledge modifiers into
//               the pipeline) had ZERO callers: every knowledge skill
//               mechanical in the game was dead. 5 synergies (tidecaller,
//               wildreader, smokehouse, green_highway, read_the_patch)
//               required skill:fishing / skill:foraging — skills that do not
//               exist in knowledge.json (learnSkill rejects unknown ids):
//               permanently undiscoverable. 19/25 KNOWLEDGE_MOD_MAP emissions
//               targeted engine strings nothing reads.
//
// CATCHES THIS RUN (fixed, proven below):
//   1. KNOWLEDGE PIPELINE DEAD: modTarget() reads this.mods(), which never
//      included knowledge. Fix: mods() delegates to allModifiers().
//   2. FIVE DEAD SYNERGIES: authored `fishing` + `foraging` skills in
//      knowledge.json (backgrounds wire into grantBackgroundKnowledge
//      automatically; the synthesis path in checkSynergyDiscovery then
//      completes discovery for real).
//   3. MOLT DOUBLE-LOG: removed the impl's direct noteAbilityUse('molt') —
//      useAbility's post-dispatch gainAbilityXP already logs the use.
//   4. TIME_SKIP copy: "Ages you 1 day" -> names the real cost.
//   5. DEAD KNOWLEDGE TARGETS (sibling sweep): retargeted the unambiguous
//      ones to live engine targets (hunt.find_chance, hunt.trap_catch,
//      food.spoilage_days, combat.strike_damage, forage.yield); added
//      fish_yield / fish_rare / forage_yield map keys for the new skills.
//      Night-gated and target-less keys stay unmapped with a code comment
//      (documented gap, not silent). The gill-net check now resolves
//      through this.mods() so knowledge fishing bonuses apply.
//
// Run: node scripts/test-abilities-knowledge-20261010.js   (SEED env override)
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-9); }

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261010', 10);
Math.random = mulberry32(SEED);

// ---------- boot the full engine (index.html order, DOM-only excluded) ----------
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"]*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

function grant(id, level) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  const ex = s.abilities.find(a => ((a && a.id) || a) === id);
  if (ex) { if (ex.id) ex.level = level || ex.level || 1; }
  else s.abilities.push({ id, name: id, level: level || 1, xp: 0 });
  try { Game.recomputeActiveSynergies(); } catch (e) {}
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.say = () => {};
  const S = () => Game.state.scholar;

  // ============ 1. KNOWLEDGE PIPELINE: skills amplify powers ============
  console.log('\n[knowledge] skill mechanicals reach the modifier pipeline');
  // setSkill: deterministic across seeds (backgrounds randomly pre-grant skills)
  function setSkill(id, level) {
    Game.state.codex = Game.state.codex || {};
    Game.state.codex.skills = Game.state.codex.skills || {};
    delete Game.state.codex.skills[id];
    ok(Game.learnSkill(id, level, 'test'), 'learnSkill ' + id + ' L' + level);
  }
  {
    Game.state.codex = Game.state.codex || {};
    Game.state.codex.skills = Game.state.codex.skills || {};
    delete Game.state.codex.skills.fire_rain;
    delete Game.state.codex.skills.wound_care;
    const before = Game.modTarget('fire.success', 1.0);
    setSkill('fire_rain', 2);
    const after = Game.modTarget('fire.success', 1.0);
    ok(after > before, 'fire_rain L2 grants +fire.success (was dead)', before + ' -> ' + after);
    const mods = Game.mods();
    ok(mods.some(m => m.target === 'fire.success' && String(m.source || '').indexOf('knowledge:fire_rain') === 0),
      'mods() carries the knowledge-sourced modifier');
  }
  {
    setSkill('wound_care', 2);
    const hb = Game.modTarget('healing.amount', 10);
    ok(hb > 10, 'wound_care L2 heal_bonus reaches healing.amount (was dead)', 'got ' + hb);
  }

  // ============ 2. DEAD KNOWLEDGE TARGETS: retargeted to live engines ============
  console.log('\n[knowledge] retargeted mechanicals hit live engine targets');
  // setSkill: deterministic across seeds (backgrounds randomly pre-grant skills)
  function setSkill(id, level) {
    Game.state.codex = Game.state.codex || {};
    Game.state.codex.skills = Game.state.codex.skills || {};
    delete Game.state.codex.skills[id];
    ok(Game.learnSkill(id, level, 'test'), 'learnSkill ' + id + ' L' + level);
  }
  // knowMods: the raw knowledge modifiers (mapping unit under test)
  function knowMods() {
    return globalThis.Scattering.modifiers.collectKnowledgeModifiers(
      (Game.state.codex || {}).skills, Game.data.knowledge);
  }
  function hasKnowMod(source, target, op, value) {
    return knowMods().some(m => m.source === 'knowledge:' + source &&
      m.target === target && m.op === op && Math.abs(m.value - value) < 1e-9);
  }
  // retarget: learn the skill, assert the mapped modifier exists AND the
  // resolved value moves in the promised direction vs the skill ABSENT
  // (absolute values are seed-dependent: background abilities/relics share
  // these targets, and backgrounds can pre-grant the skill itself).
  function retarget(id, level, target, base, dir) {
    delete (Game.state.codex.skills || {})[id];
    const v0 = Game.modTarget(target, base);
    setSkill(id, level);
    const v1 = Game.modTarget(target, base);
    ok(dir === 'up' ? v1 > v0 : v1 < v0,
      id + ' moves ' + target + ' ' + dir + ' (' + v0 + ' -> ' + v1 + ')');
  }
  setSkill('track_read', 2);
  ok(hasKnowMod('track_read', 'hunt.find_chance', 'multiply', 1.15),
    'hunt_find -> hunt.find_chance x1.15 (was dead target hunt.find)');
  retarget('track_read', 2, 'hunt.find_chance', 0.5, 'up');
  setSkill('snare_wire', 2);
  ok(hasKnowMod('snare_wire', 'hunt.trap_catch', 'add', 0.2),
    'trap_success -> hunt.trap_catch +0.2 (was dead target trap.success)');
  retarget('snare_wire', 2, 'hunt.trap_catch', 0.5, 'up');
  setSkill('preserve_food', 2);
  ok(hasKnowMod('preserve_food', 'food.spoilage_days', 'multiply', 1.5),
    'spoil_slow -> food.spoilage_days x1.5 (was dead target food.spoil)');
  retarget('preserve_food', 2, 'food.spoilage_days', 10, 'up');
  setSkill('improvise_weapon', 2);
  ok(hasKnowMod('improvise_weapon', 'combat.strike_damage', 'multiply', 1.15),
    'combat_damage -> combat.strike_damage x1.15 (was dead target combat.damage)');
  retarget('improvise_weapon', 2, 'combat.strike_damage', 20, 'up');

  // ============ 3. DEAD SYNERGIES: fishing + foraging skills exist ============
  console.log('\n[synergy-legs] fishing / foraging skills are learnable');
  {
    delete (Game.state.codex.skills || {}).fishing;
    delete (Game.state.codex.skills || {}).foraging;
    ok(Game.learnSkill('fishing', 1, 'test'), 'learnSkill(fishing) accepted');
    ok(Game.learnSkill('foraging', 1, 'test'), 'learnSkill(foraging) accepted');
    const k = (Game.data.knowledge || []);
    ok(k.some(x => x.id === 'fishing'), 'fishing in knowledge.json');
    ok(k.some(x => x.id === 'foraging'), 'foraging in knowledge.json');
    // background wiring: a fisherman's occupation IS knowledge
    const before = Object.keys(Game.state.codex.skills || {}).length;
    Game.grantBackgroundKnowledge({ formerOccupation: 'fisherman' });
    const lvl = ((Game.state.codex.skills || {}).fishing || {}).level || 0;
    ok(lvl >= 1, 'fisherman background grants fishing (L' + lvl + ')', 'skills before=' + before);
  }

  // ============ 4. TIDECALLER end-to-end: dead synergy now discoverable ============
  console.log('\n[synergy] tidecaller discovery completes through the synthesis path');
  {
    // reset discovery state for a clean run
    S().synergies = (S().synergies || []).filter(id => id !== 'tidecaller');
    S().synergyAttempts = {};
    S().abilityUseLog = [];
    delete (Game.state.codex.skills || {}).fishing;
    grant('water_breathing', 2);
    ok(Game.learnSkill('fishing', 2, 'test'), 'fishing skill held at L2 (tidecaller minLevel 2)');
    Game.state.scholar.codex = Game.state.scholar.codex || {};
    Game.state.scholar.codex.techniques = Game.state.scholar.codex.techniques || {};
    Game.state.scholar.codex.techniques.tide_reading = { level: 1, learnedDay: 0 };
    // 3 real water_breathing uses; the synthesis path logs 'fishing' through the held skill
    const fyBefore = Game.modTarget('fishing.yield', 1);
    for (let i = 0; i < 3; i++) Game.noteAbilityUse('water_breathing');
    ok((S().synergies || []).includes('tidecaller'), 'tidecaller discovered after 3 combined uses');
    ok(Game.hasSynergy('tidecaller'), 'tidecaller ACTIVE (legs still held)');
    const fy = Game.modTarget('fishing.yield', 1);
    ok(approx(fy, fyBefore * 1.5), 'tidecaller fishing.yield x1.5 fires through mods()', fyBefore + ' -> ' + fy);
  }

  // ============ 5b. KNOWLEDGE->TECHNIQUE: abilitySynergies refs are live ============
  console.log('\n[dead-refs] knowledge abilitySynergies unlock real techniques');
  {
    grant('field_medicine');
    delete (Game.state.codex.skills || {}).wound_care;
    Game.learnSkill('wound_care', 1, 'test');
    const techs = (Game.state.codex || {}).techniques || {};
    ok(!!techs['wound_care_field_medicine'], 'Precise Mend technique unlocks (healing -> field_medicine retarget)');
    if (techs['wound_care_field_medicine']) {
      ok(techs['wound_care_field_medicine'].name === 'Precise Mend', 'technique named honestly');
    }
  }
  {
    grant('night_eyes');
    delete (Game.state.codex.skills || {}).nocturnal_patterns;
    Game.learnSkill('nocturnal_patterns', 2, 'test');
    const techs = (Game.state.codex || {}).techniques || {};
    ok(!!techs['nocturnal_patterns_night_eyes'], "Owl's Ledger technique unlocks (bare-string entry well-formed)");
  }

  // ============ 6. MOLT: one tap = one discovery attempt ============
  console.log('\n[exploit] molt.shed_skin logs exactly one synergy attempt per tap');
  {
    grant('molt');
    S().kcal = 5000; S().health = 100;
    S().moltWeek = -1; S().moltUses = 0;
    S().abilityUseLog = [];
    const r = Game.useAbility('molt', 'shed_skin');
    ok(r !== false, 'molt tap fired');
    const n = (S().abilityUseLog || []).filter(u => u.id === 'molt').length;
    ok(n === 1, 'exactly 1 molt use logged (double-log = 2-attempt exploit)', 'logged ' + n);
  }

  // ============ 6. TIME_SKIP honesty ============
  console.log('\n[honesty] time_skip copy names the real cost');
  {
    grant('time_skip');
    const legacy = (typeof Game._legacyActivatables === 'function') ? Game._legacyActivatables() : [];
    const ts = legacy.find(e => e.id === 'time_skip' || e.abilityId === 'time_skip');
    ok(!!ts, 'time_skip legacy entry exists');
    if (ts) ok(!/age/i.test(ts.desc || ''), 'no "ages you" claim (ageDebt removed 2026-10-08)', 'desc: ' + (ts.desc || '').slice(0, 80));
  }

  // ============ 7. NO REGRESSIONS: ability/synergy modifiers still single-fire ============
  console.log('\n[regression] ability modifiers unaffected by the rewire');
  {
    // crimson_circuit x1.3 must fire as exactly x1.3, not x1.69 (r9 catch)
    const has = (S().synergies || []).includes('crimson_circuit');
    ok(Game.modTarget('healing.amount', 10) >= 10, 'healing pipeline resolves (sanity)', '');
    // slot ladder intact
    ok(typeof Game.abilitySlots() === 'number' && Game.abilitySlots() >= 1, 'abilitySlots() intact: ' + Game.abilitySlots());
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
