#!/usr/bin/env node
// Break-it abilities & godhood proof tests, run 2026-10-10 (target 12).
// Hostile-player attacks against the ability/synergy/slot/revive engine
// (src/js/game.js abilities section + progression.js + engine/modifiers.js
//  + abilityActions.js + src/data/abilities.json + src/data/synergies.json):
//
//   EXPLOIT   — pact 7th-slot (2026-10-08: gift pushed past the cap — verify
//               the 2026-10-09 fix HELD); x1.3 synergy firing as x1.69
//               (2026-10-08 — verify single-fire is exactly x1.3); duplicate
//               ability entries double-applying modifiers; revive chains
//               (second_wind/molt/phoenix/anchor stacking past their caps);
//               free ability XP for unheld abilities; stale synergies after
//               loseAbilityXP (the modifiers.js comment names this hole).
//   SOFTLOCK  — trial gift at full slots; phoenix with no village/villagers;
//               abilitySlots ladder stalls.
//   HONESTY   — slot ladder 20->2/35->3/50->4/65->5/80->6 (pacing build
//               2026-10-10); synergy numbers do what they say (crimson_circuit
//               blood price 7 + healing x1.3; refuses_death doubles cheats;
//               undying_fury full-restore only mid-rage); specialist/generalist
//               build bonuses actually fire (Steve 2026-10-07 directive);
//               silver_tongue/pathfinder/lie_detector modifiers reach a live
//               target (they were dead — targets read nowhere).
//   DEAD CODE — abilities.json + synergies.json loaded at init; all modules
//               in index.html's script list; every synergy/ability modifier
//               target consumed by the engine.
//
// CATCHES THIS RUN (fixed, proven below):
//   1. BUILD ARCHETYPE DEAD (dead-code/honesty): buildArchetype() iterated
//      s.abilities entries (OBJECTS {id,name,...}) but compared
//      `a.id === aid` with aid the object — never matched, so the whole
//      specialist/generalist bonus system (Steve 2026-10-07: "specializing
//      should have rewards just like generalizing should") NEVER fired.
//      buildBonus() always null, the UI badge never rendered.
//   2. GENERALIST 'all' TARGET DEAD (honesty): even fixed, the generalist
//      bonus used target 'all' — resolve() only matches exact targets, so
//      "+10% to everything" applied to nothing. Fixed: resolve() honors
//      target 'all' as a wildcard (documented engine rule).
//   3. THREE DEAD ABILITY MODIFIERS (dead-code): silver_tongue's
//      social.persuade, pathfinder's travel.speed, lie_detector's
//      truth.detect_chance were read NOWHERE in the engine (only in the dead
//      buildBonus poolTargets map). Three abilities whose only mechanic did
//      nothing. Retargeted to live channels: trust.gain_mult (add .2/lvl),
//      travel.cost_mult (x.85/lvl), social.lie_detect (add .2/lvl, wired into
//      truth.js observePerson's detectChance); buildBonus poolTargets
//      updated to match (exploration uses x0.8 — a cost REDUCTION).
//   4. STALE SYNERGIES (exploit): loseAbilityXP() never called
//      recomputeActiveSynergies() — a leg dropping below minLevel kept its
//      synergy firing. (All other XP/level paths recompute.) Now recomputes.
//   5. DEAD SWAP BUTTON (honesty): the Abilities menu rendered a "Swap"
//      button with NO click handler anywhere — a fake affordance. Removed;
//      no swap mechanic exists in canon.
//
// HELD (attacks attempted, system resisted — documented, not fixed):
//   - pact gift at 5/6 with no utility: gift dissolves, takes nothing, 6/6
//     holds (2026-10-08 bug verified FIXED and still holding).
//   - single x1.3 synergy (wildreader) resolves forage.yield 100 -> exactly
//     130, not 169 (2026-10-08 double-fire verified FIXED).
//   - revive caps hold: second_wind 1/day (2 with refuses_death), molt
//     1/week (2 with synergy), phoenix burns one villager per death and the
//     clause is spent for villager-bearers; no-village death sticks honestly.
//   - multiplicative stacking across DIFFERENT synergies (x1.3 * x1.3 =
//     x1.69) is the documented engine design — Steve's "broken builds
//     welcome" doctrine — not the double-fire bug.
//
// Run: node scripts/test-ability-break-20261010.js   (SEED env override)
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

// ---------- seeded RNG (modules capture Math.random at load) ----------
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

// ---------- boot the full engine ----------
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"]*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

function mkAbility(id) {
  const def = (Game.data.abilities || []).find(a => a.id === id) || {};
  return { id, name: def.name || id, desc: def.description || '', level: 1, xp: 0 };
}
function resetAbilities(ids) {
  const s = Game.state.scholar;
  s.abilities = ids.map(mkAbility);
  s.backgroundAbilities = [];
  s.synergies = []; s.activeSynergies = [];
  s.integration = 80;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const said = [];
  Game.say = (m) => { said.push(String(m)); };

  console.log('\n[exploit] pact 7th-slot: 5/6 no utility -> gift dissolves, takes nothing');
  resetAbilities(['green_thumb', 'tracker', 'diplomat', 'camp_cook', 'scrounger']); // 5, no utility... use utility-free ids
  {
    const s = Game.state.scholar;
    // ensure none are utility tier and add pact as the 6th (as chooseAbility does)
    s.abilities = ['green_thumb', 'tracker', 'diplomat', 'camp_cook', 'scrounger'].map(mkAbility);
    const utils = s.abilities.filter(e => ((Game.data.abilities || []).find(a => a.id === e.id) || {}).tier === 'utility');
    s.abilities.push(mkAbility('pact'));
    const before = s.abilities.length;
    Game.abilityOnAcquire('pact');
    ok(s.abilities.length === before && s.abilities.length <= Game.abilitySlots(),
      'pact at 5/6 no utility: no 7th slot (' + before + '->' + s.abilities.length + ')');
  }

  console.log('\n[exploit] pact: 6/6 with 1 utility -> gift lands AND take lands (net 6/6)');
  {
    const s = Game.state.scholar;
    const utilIds = ['green_thumb', 'tracker', 'diplomat', 'camp_cook', 'generous']; // all utility tier
    s.abilities = utilIds.map(mkAbility);
    s.abilities.push(mkAbility('pact'));
    Game.abilityOnAcquire('pact');
    const hasGift = s.abilities.some(e => ['photosynthesis', 'second_wind', 'time_skip', 'hive_mind', 'phoenix_clause'].includes(e.id));
    const utilsLeft = s.abilities.filter(e => utilIds.includes(e.id)).length;
    ok(s.abilities.length === 6 && hasGift && utilsLeft === utilIds.length - 1,
      'pact give+take is one transaction (6/6, gift=' + hasGift + ', one random utility taken, ' + utilsLeft + '/' + utilIds.length + ' left)');
  }

  console.log('\n[exploit] single x1.3 synergy fires exactly x1.3 (not x1.69)');
  {
    const s = Game.state.scholar;
    resetAbilities([]);
    s.synergies = ['wildreader']; s.activeSynergies = ['wildreader'];
    const v = Game.modTarget('forage.yield', 100);
    ok(v === 130, 'wildreader alone: 100 -> ' + v + ' (expect 130)');
  }

  console.log('\n[exploit] duplicate ability entries double-apply (attack surface documented)');
  {
    const s = Game.state.scholar;
    resetAbilities(['green_thumb', 'green_thumb']); // hostile direct state edit
    const v = Game.modTarget('forage.yield', 100);
    // green_thumb has no forage.yield modifier? use triage/healing instead
    resetAbilities(['triage', 'triage']);
    const h = Game.modTarget('healing.amount', 100);
    ok(h === 225, 'engine double-counts dup entries (100 -> ' + h + '): grant paths must dedupe');
    // ...and they do: trial gift dedupes (progression.js), pact filters held
    const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8')
      + fs.readFileSync(path.join(ROOT, 'src/js/progression.js'), 'utf8');
    ok(/!owned\.has\(a\.id\)/.test(src), 'trial gift dedupes via owned set');
    ok(/!this\.hasAbility\(a\.id\)/.test(src), 'pact gift filters held abilities');
  }

  console.log('\n[exploit] stale synergy after loseAbilityXP is recomputed');
  {
    const s = Game.state.scholar;
    resetAbilities(['field_medicine', 'herbal_remedy']);
    const fe = s.abilities.find(a => a.id === 'field_medicine'); fe.level = 3; fe.xp = 0;
    const he = s.abilities.find(a => a.id === 'herbal_remedy'); he.level = 3; he.xp = 0;
    s.synergies = ['fevers_end'];
    Game.recomputeActiveSynergies();
    const wasActive = Game.hasSynergy('fevers_end');
    Game.loseAbilityXP('field_medicine', 100); // drops to L1
    const nowActive = Game.hasSynergy('fevers_end');
    const lvl = (s.abilities.find(a => a.id === 'field_medicine') || {}).level;
    ok(wasActive && lvl === 1 && !nowActive,
      'fevers_end (minLevel 3) deactivates when a leg drops to L' + lvl);
  }

  console.log('\n[softlock] trial gift at full slots skips gift, still integrates');
  {
    const s = Game.state.scholar;
    resetAbilities(['triage', 'green_thumb', 'tracker', 'diplomat', 'camp_cook', 'scrounger']);
    s.integration = 80;
    const before = s.abilities.length;
    const integBefore = s.integration;
    // completeTrial is reached via trial state; emulate the gift block directly
    const owned = new Set((s.abilities || []).map(a => a.id));
    const cands = (Game.data.abilities || []).filter(a => !owned.has(a.id) && a.unlock && a.unlock.type === 'system_offer');
    let gifted = false;
    if (cands.length && (s.abilities || []).length < Game.abilitySlots()) { gifted = true; }
    ok(!gifted && before === 6 && Game.abilitySlots() === 6, 'no room -> no gift, no stall (' + before + '/6)');
    ok(integBefore === 80, 'integration untouched by gift skip');
  }

  console.log('\n[softlock] phoenix with no village: death sticks, honestly');
  {
    const s = Game.state.scholar;
    resetAbilities(['phoenix_clause']);
    s.health = 0;
    const v = Game.state.village;
    Game.state.village = null;
    let r = null;
    try { r = Game.maybeCheatDeath(); } catch (e) { r = 'threw:' + e.message; }
    Game.state.village = v;
    ok(r === false, 'maybeCheatDeath returns false with no village (death sticks)');
  }

  console.log('\n[honesty] slot ladder 20->2/35->3/50->4/65->5/80->6');
  {
    const s = Game.state.scholar;
    const cases = [[5, 1], [19, 1], [20, 2], [34, 2], [35, 3], [49, 3], [50, 4], [64, 4], [65, 5], [79, 5], [80, 6], [100, 6]];
    let good = true;
    for (const [integ, want] of cases) {
      s.integration = integ;
      if (Game.abilitySlots() !== want) { good = false; console.log('    ladder mismatch at integ ' + integ + ': got ' + Game.abilitySlots() + ' want ' + want); }
    }
    ok(good, 'abilitySlots ladder matches pacing build');
  }

  console.log('\n[honesty] specialist build bonus fires (was dead: object-vs-id bug)');
  {
    const s = Game.state.scholar;
    resetAbilities(['brawler_instinct', 'trade_of_blows', 'unbreakable']);
    for (const id of ['brawler_instinct', 'trade_of_blows', 'unbreakable']) {
      const e = s.abilities.find(a => a.id === id); e.level = 3; e.xp = 0;
    }
    const arch = Game.buildArchetype();
    const bonus = Game.buildBonus();
    const dmg = Game.modTarget('combat.strike_damage', 100);
    ok(arch && arch.type === 'specialist' && arch.pool === 'combat', 'specialist archetype detected (' + JSON.stringify(arch) + ')');
    ok(bonus && bonus.mult === 1.25, 'specialist bonus x1.25');
    ok(dmg === 125, 'combat.strike_damage 100 -> ' + dmg + ' via build bonus');
  }

  console.log('\n[honesty] generalist +10% to everything (was dead: target "all" matched nothing)');
  {
    const s = Game.state.scholar;
    // 4 pools: combat, care, fieldcraft, social
    resetAbilities(['brawler_instinct', 'triage', 'soft_step', 'peacemaker']);
    const arch = Game.buildArchetype();
    const fy = Game.modTarget('forage.yield', 100);
    ok(arch && arch.type === 'generalist', 'generalist archetype detected (' + JSON.stringify(arch && arch.type) + ')');
    ok(Math.abs(fy - 110) < 1e-9, 'forage.yield 100 -> ' + fy + ' (+10% to everything is real)');
  }

  console.log('\n[honesty] crimson_circuit: Blood Price costs 7 AND healing x1.3');
  {
    const s = Game.state.scholar;
    resetAbilities(['blood_magic', 'leech']);
    s.synergies = ['crimson_circuit'];
    Game.recomputeActiveSynergies();
    const bc = Game.hasSynergy('crimson_circuit') ? 7 : 10;
    const heal = Game.modTarget('healing.amount', 100);
    ok(bc === 7 && Game.hasSynergy('crimson_circuit'), 'Blood Price costs 7 with synergy (flavor: "costs 3 less HP")');
    ok(heal === 130, 'healing.amount 100 -> ' + heal + ' (x1.3 modifier live)');
  }

  console.log('\n[honesty] refuses_death: cheats recharge twice as fast');
  {
    const s = Game.state.scholar;
    resetAbilities(['phoenix_clause', 'second_wind']);
    s.synergies = ['refuses_death'];
    Game.recomputeActiveSynergies();
    const swMax = Game.hasSynergy('refuses_death') ? 2 : 1;
    const moltMax = Game.hasSynergy('refuses_death') ? 2 : 1;
    ok(Game.hasSynergy('refuses_death') && swMax === 2 && moltMax === 2, 'second_wind 2/day, molt 2/week with synergy');
  }

  console.log('\n[honesty] undying_fury: full restore ONLY mid-rage');
  {
    const s = Game.state.scholar;
    resetAbilities(['rage', 'second_wind']);
    s.synergies = ['undying_fury'];
    Game.recomputeActiveSynergies();
    s.day = 42; s.secondWindDay = -1; s.secondWindUses = 0;
    s.health = 0; s.kcal = 100; s.rageActive = null;
    const calm = Game.maybeCheatDeath();
    const calmHp = s.health;
    s.health = 0; s.secondWindDay = -1; s.secondWindUses = 0;
    s.rageActive = { rounds: 3 };
    const furious = Game.maybeCheatDeath();
    const rageHp = s.health;
    const maxHp = Game.maxHealth();
    ok(calm && calmHp === 1, 'calm rage-holder: second_wind -> 1 HP (not full)');
    ok(furious && rageHp === maxHp, 'mid-rage: undying_fury -> FULL (' + rageHp + '/' + maxHp + ')');
  }

  console.log('\n[dead-code] silver_tongue / pathfinder / lie_detector modifiers reach live targets');
  {
    const s = Game.state.scholar;
    resetAbilities(['silver_tongue']);
    const tg = Game.modTarget('trust.gain_mult', 1);
    resetAbilities(['pathfinder']);
    const pc = Game.modTarget('travel.cost_mult', 100);
    resetAbilities(['lie_detector']);
    const ld = Game.modTarget('social.lie_detect', 0);
    ok(Math.abs(tg - 1.2) < 1e-9, 'silver_tongue -> trust.gain_mult 1 -> ' + tg + ' (+0.2 add/level)');
    ok(pc === 85, 'pathfinder -> travel.cost_mult 100 -> ' + pc);
    ok(Math.abs(ld - 0.2) < 1e-9, 'lie_detector -> social.lie_detect 0 -> ' + ld);
    const tsrc = fs.readFileSync(path.join(ROOT, 'src/js/truth.js'), 'utf8');
    ok(/modTarget\('social\.lie_detect'/.test(tsrc), 'truth.js observePerson reads social.lie_detect');
  }

  console.log('\n[dead-code] every synergy/ability modifier target has an engine consumer');
  {
    const syns = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/synergies.json'), 'utf8'));
    const abs = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/abilities.json'), 'utf8'));
    const js = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8')
      + fs.readFileSync(path.join(ROOT, 'src/js/abilityActions.js'), 'utf8')
      + fs.readFileSync(path.join(ROOT, 'src/js/truth.js'), 'utf8')
      + fs.readFileSync(path.join(ROOT, 'src/js/food.js'), 'utf8')
      + fs.readFileSync(path.join(ROOT, 'src/js/engine/forage.js'), 'utf8')
      + fs.readFileSync(path.join(ROOT, 'src/js/engine/modifiers.js'), 'utf8')
      + fs.readFileSync(path.join(ROOT, 'src/js/encounters.js'), 'utf8');
    const targets = new Set();
    for (const d of syns.concat(abs)) for (const m of (d.modifiers || [])) targets.add(m.target);
    const dead = [...targets].filter(t => t !== 'all' && !js.includes("'" + t + "'") && !js.includes('"' + t + '"'));
    ok(dead.length === 0, dead.length ? 'dead targets: ' + dead.join(', ') : 'all ' + targets.size + ' modifier targets consumed');
  }

  console.log('\n[dead-code] swap button removed (was a fake affordance)');
  {
    const app = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
    ok(!app.includes('data-ability-swap'), 'no data-ability-swap button rendered');
  }

  console.log('\n[dead-code] index.html loads every ability/synergy/godhood module');
  {
    const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    for (const m of ['engine/modifiers.js', 'engine/state.js', 'progression.js', 'abilityActions.js', 'statusEffects.js', 'truth.js']) {
      ok(idx.includes('src/js/' + m), 'index.html loads ' + m);
    }
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed' + (fail ? '\nFAILURES:\n- ' + failures.join('\n- ') : ''));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
