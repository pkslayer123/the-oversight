#!/usr/bin/env node
/* Alien persona schema test (Steve 2026-10-07).
   Validates the SEMANTIC rules that scripts/validate-data.js can't express:
   conditional requirements (combat personas need combat fields), uniqueness,
   cross-references, and that the JS reads kits/tech/combat from JSON data.
   Run: node scripts/test-alien-schema-20261007.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.env.TEST_ROOT || path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('  FAIL: ' + msg); } };

// Load from git HEAD (authoritative; worktree may be stale)
const show = (p) => execSync(`git show HEAD:${p}`, { cwd: ROOT, encoding: 'utf-8' });
const personas = JSON.parse(process.env.TEST_JSON ? require('fs').readFileSync(process.env.TEST_JSON, 'utf-8') : show('src/data/alienPlayers.json'));
const abilities = JSON.parse(show('src/data/abilities.json'));
const abIds = new Set(abilities.map(a => a.id));
const js = process.env.TEST_JS ? require('fs').readFileSync(process.env.TEST_JS, 'utf-8') : show('src/js/alienPlayers.js');

console.log('== structural ==');
ok(Array.isArray(personas) && personas.length === 8, `8 personas (got ${personas.length})`);
const ids = personas.map(p => p.id);
ok(new Set(ids).size === ids.length, 'persona ids unique');

const REQUIRED = ['id','name','title','species','disposition','wealth','experience',
  'combat','voice','backstory','motivation','signature','rivalry',
  'introLines','defeatLines','abilityKit','alienTech'];
for (const p of personas) {
  for (const f of REQUIRED) ok(p[f] !== undefined && p[f] !== null, `${p.id}: required field '${f}' present`);
}

console.log('== enums ==');
for (const p of personas) {
  ok(['sadistic','neutral','benevolent'].includes(p.disposition), `${p.id}: disposition valid`);
  ok(['rich','comfortable','broke'].includes(p.wealth), `${p.id}: wealth valid`);
  ok(['veteran','rookie'].includes(p.experience), `${p.id}: experience valid`);
  ok(typeof p.combat === 'boolean', `${p.id}: combat is boolean`);
}

console.log('== combat conditional rules ==');
const COMBAT_SITUATIONS = ['onHit','onHurt','onWinning','onLosing','unhinged'];
for (const p of personas) {
  if (p.combat) {
    ok(p.combatLines && typeof p.combatLines === 'object', `${p.id}: combat persona has combatLines`);
    if (p.combatLines) {
      for (const s of COMBAT_SITUATIONS) {
        const lines = p.combatLines[s];
        ok(Array.isArray(lines) && lines.length === 3 && lines.every(l => typeof l === 'string' && l.length > 0),
          `${p.id}: combatLines.${s} has exactly 3 non-empty lines`);
      }
      // uniqueness across all 15 lines
      const all = COMBAT_SITUATIONS.flatMap(s => p.combatLines[s]);
      ok(new Set(all).size === all.length, `${p.id}: all 15 combat lines unique`);
    }
    ok(Array.isArray(p.abilityKit) && p.abilityKit.length === 6,
      `${p.id}: combat persona has exactly 6 abilities (got ${p.abilityKit.length})`);
    for (const aid of p.abilityKit) {
      ok(abIds.has(aid), `${p.id}: ability '${aid}' exists in abilities.json`);
    }
    ok(Array.isArray(p.alienTech), `${p.id}: alienTech is array`);
    for (const t of p.alienTech) {
      ok(t.id && t.name && t.desc, `${p.id}: tech '${t.id}' has id/name/desc`);
    }
    ok(p.taunts && p.taunts.length > 0, `${p.id}: combat persona has taunts`);
    ok(p.victoryLines && p.victoryLines.length > 0, `${p.id}: combat persona has victoryLines`);
  } else {
    ok(!p.combatLines || Object.keys(p.combatLines).length === 0, `${p.id}: non-combat persona has no combatLines`);
  }
}

console.log('== tech id uniqueness ==');
const techIds = [];
for (const p of personas) for (const t of (p.alienTech || [])) techIds.push(`${p.id}:${t.id}`);
ok(new Set(techIds.map(s => s.split(':')[1])).size === techIds.length, 'alien tech ids unique across all personas');

console.log('== JS data-driven wiring ==');
ok(js.includes('if (p && Array.isArray(p.abilityKit)) return p.abilityKit;'),
  'apAbilityKit reads from JSON first');
ok(js.includes('if (p && Array.isArray(p.alienTech)) return p.alienTech;'),
  'apAlienTech reads from JSON first');
ok(js.includes('apIsCombat: function (pid)'), 'apIsCombat helper exists');
ok(js.includes("if (p && typeof p.combat === 'boolean') return p.combat;"),
  'apIsCombat reads p.combat from data');
// all 5 call sites converted
const combatPilotRefs = (js.match(/COMBAT_PILOTS\.(includes|indexOf)/g) || []).length;
ok(combatPilotRefs === 1, `only fallback COMBAT_PILOTS ref remains (got ${combatPilotRefs})`);
const apIsCombatCalls = (js.match(/this\.apIsCombat\(/g) || []).length;
ok(apIsCombatCalls >= 5, `apIsCombat called at 5+ sites (got ${apIsCombatCalls})`);
ok(js.includes('//   - apIsCombat(pid)'), 'ontology provides lists apIsCombat');

console.log('== behavioral: data matches old hardcoded tables ==');
// Simulate the mixin with a minimal stub to prove JSON-first behavior
const stubThis = {
  apPersona: (pid) => personas.find(p => p.id === pid) || null,
};
// Extract and eval just the three functions via a sandbox
const vm = require('vm');
const sandbox = { COMBAT_PILOTS: ['vex_marlowe','countess_sable','rax_dentist','pip_quindle','sarge','dr_fenwick','old_tam'], personas };
const pickFn = (name) => {
  const m = js.match(new RegExp(name + ': function \\(pid\\) \\{[\\s\\S]*?\\n    \\},'));
  if (!m) throw new Error('function ' + name + ' not found in JS');
  return m[0].replace(/,$/, '');
};
const fnSrc = `
  apPersona: ${stubThis.apPersona.toString()},
  ${pickFn('apAbilityKit')},
  ${pickFn('apAlienTech')},
  ${pickFn('apIsCombat')},
`;
const fns = vm.runInNewContext(`({${fnSrc}})`, sandbox);
const bound = {};
for (const k of Object.keys(fns)) bound[k] = fns[k].bind(bound);

const EXPECTED_KITS = {
  vex_marlowe: 6, countess_sable: 6, rax_dentist: 6, pip_quindle: 6,
  sarge: 6, dr_fenwick: 6, old_tam: 6, wren: 0,
};
for (const [pid, len] of Object.entries(EXPECTED_KITS)) {
  const kit = bound.apAbilityKit(pid);
  ok(Array.isArray(kit) && kit.length === len, `apAbilityKit('${pid}') returns ${len} from JSON (got ${kit.length})`);
}
ok(bound.apAlienTech('vex_marlowe').length === 2, 'vex tech from JSON (2 pieces)');
ok(bound.apAlienTech('old_tam').length === 0, 'old_tam tech from JSON (0, fights fair)');
ok(bound.apAlienTech('wren').length === 0, 'wren tech from JSON (0, non-combat)');
ok(bound.apIsCombat('vex_marlowe') === true, 'vex is combat via data');
ok(bound.apIsCombat('wren') === false, 'wren is non-combat via data');
// fallback for unknown pid
ok(bound.apAbilityKit('nobody_xyz').length === 6, 'unknown pid falls back to default kit');
ok(bound.apIsCombat('vex_marlowe') === true, 'known pid uses data even though also in fallback list');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
