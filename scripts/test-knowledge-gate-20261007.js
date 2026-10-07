// KNOWLEDGE GATE UNIFICATION TEST (Steve 2026-10-07)
// Verifies Game.canShow(domain, id, aspect) is the single gate, all legacy
// APIs delegate to it, and the kcal leaks are fixed.
// "If you don't know, it doesn't show."

const fs = require('fs');
const path = require('path');

// Load the game files
const gameSrc = fs.readFileSync('/tmp/kg-game.js', 'utf8');
const encSrc = fs.readFileSync('/tmp/kg-enc.js', 'utf8');
const apSrc = fs.readFileSync('/tmp/kg-ap.js', 'utf8');
const appSrc = fs.readFileSync('/tmp/kg-app.js', 'utf8');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL: ${name}`); }
}

// ============ STATIC CHECKS ============

// 1. canShow exists in game.js
check('canShow defined in game.js', gameSrc.includes('canShow(domain, id, aspect'));

// 2. All 7 gate functions delegate to canShow
check('plantKnown delegates', /plantKnown\(pid\)\s*\{\s*return this\.canShow\('plant', pid, 'name'\)/.test(gameSrc));
check('monsterKnown delegates', /monsterKnown\(mid\)\s*\{\s*return this\.canShow\('monster', mid, 'name'\)/.test(gameSrc));
check('nameKnown delegates', /nameKnown\(vid\)\s*\{\s*return this\.canShow\('npc', vid, 'name'\)/.test(gameSrc));
check('goalKnown delegates', /goalKnown\(vid\)\s*\{\s*return this\.canShow\('npc', vid, 'mechanics'\)/.test(gameSrc));
check('skillKnown delegates', /skillKnown\(skillId, minLevel\)\s*\{\s*return this\.canShow\('skill', skillId, 'mechanics'/.test(gameSrc));
check('pantryItemKnown delegates', /pantryItemKnown\(p\)\s*\{\s*return this\.canShow\('item', p, 'name'\)/.test(gameSrc));
check('tbPatternKnown delegates', /tbPatternKnown\(monsterId, attackName\)\s*\{\s*return this\.canShow\('monster', monsterId, 'mechanics'/.test(gameSrc));
check('encAnimalKnown delegates', encSrc.includes("return this.canShow('animal', id, 'name')"));
check('apKnowsAlien delegates', apSrc.includes("return this.canShow('alien', pid, 'name')"));

// 3. canShow handles all 7 domains
for (const d of ['plant', 'animal', 'monster', 'npc', 'skill', 'alien', 'item']) {
  check(`canShow handles domain '${d}'`, gameSrc.includes(`case '${d}':`));
}

// 4. canShow handles all 6 aspects (at least in plant domain)
for (const a of ['name', 'stats', 'kcal', 'edibility', 'mechanics', 'lore']) {
  check(`canShow handles aspect '${a}'`, gameSrc.includes(`case '${a}':`));
}

// 5. Kcal leaks fixed in app.js
check('pack kcal gated on canShow', appSrc.includes("Game.canShow('plant', i.plantId, 'kcal')"));
check('pantry loot kcal gated on canShow', appSrc.includes("Game.canShow('plant', it.plantId, 'kcal')"));
check('pantry known-items kcal gated', appSrc.includes("Game.canShow('plant', p.plantId, 'kcal')"));

// 6. No direct codex.plants reads bypassing canShow in the gate functions
// (The gate functions should not contain direct 'codex.plants' reads anymore)
const gateSection = gameSrc.match(/plantKnown\(pid\)\s*\{[^}]+\}/);
check('plantKnown has no direct codex read', gateSection && !gateSection[0].includes('codex.plants'));

// ============ BEHAVIORAL CHECKS ============
// Build a minimal Game mock to test canShow logic

function makeGame() {
  // Extract canShow via eval in a sandbox
  const sandbox = {
    state: {
      codex: {
        plants: {
          known_plant: { level: 1 },
          edible_plant: { level: 2 },
          medicinal_plant: { level: 3 },
          master_plant: { level: 4 },
        },
        monsters: {
          seen_monster: { stage: 'observed' },
          slain_monster: { stage: 'slain', patterns: { bite: true }, villageName: 'Chomper' },
        },
        skills: {
          basic_skill: { level: 1 },
          adv_skill: { level: 3 },
        },
        animalEncounters: { seen_animal: 5 },
      },
      village: {
        knownNames: { bob: true },
        goalsKnown: { bob: true },
      },
      scholar: { originTags: ['north_america'] },
      systemArrived: false,
    },
    data: {
      plants: [{ id: 'known_plant' }, { id: 'edible_plant' }, { id: 'unknown_plant' }, { id: 'medicinal_plant' }, { id: 'master_plant' }],
      animals: [{ id: 'deer', common: true, regions: ['north_america'] }],
      monsters: [{ id: 'seen_monster' }],
    },
    apState: () => ({ known: { vex: true } }),
  };

  // Extract just the canShow function and bind it
  const m = gameSrc.match(/canShow\(domain, id, aspect, opts\) \{[\s\S]*?\n    \},/);
  if (!m) throw new Error('canShow not found for extraction');
  const fnBody = m[0].replace(/canShow\(domain, id, aspect, opts\) \{/, '').replace(/\n    \},$/, '');
  const fn = new Function('domain', 'id', 'aspect', 'opts', fnBody);
  const bound = fn.bind(sandbox);
  sandbox.canShow = bound; // for recursive item-domain calls
  return { canShow: bound, sandbox };
}

const G = makeGame();

// Plant aspects
check('plant L0: name hidden', !G.canShow('plant', 'unknown_plant', 'name'));
check('plant L1: name shown', G.canShow('plant', 'known_plant', 'name'));
check('plant L1: kcal hidden', !G.canShow('plant', 'known_plant', 'kcal'));
check('plant L1: edibility hidden', !G.canShow('plant', 'known_plant', 'edibility'));
check('plant L2: kcal shown', G.canShow('plant', 'edible_plant', 'kcal'));
check('plant L2: edibility shown', G.canShow('plant', 'edible_plant', 'edibility'));
check('plant L2: stats hidden', !G.canShow('plant', 'edible_plant', 'stats'));
check('plant L3: stats shown', G.canShow('plant', 'medicinal_plant', 'stats'));
check('plant L4: lore shown', G.canShow('plant', 'master_plant', 'lore'));

// Monster aspects
check('monster unseen: name hidden', !G.canShow('monster', 'unknown', 'name'));
check('monster observed: name shown', G.canShow('monster', 'seen_monster', 'name'));
check('monster observed: stats hidden', !G.canShow('monster', 'seen_monster', 'stats'));
check('monster slain: stats shown', G.canShow('monster', 'slain_monster', 'stats'));
check('monster slain: lore shown (villageName)', G.canShow('monster', 'slain_monster', 'lore'));
check('monster pattern: mechanics with pattern', G.canShow('monster', 'slain_monster', 'mechanics', { pattern: 'bite' }));
check('monster no pattern: mechanics without pattern', !G.canShow('monster', 'slain_monster', 'mechanics', { pattern: 'claw' }));

// NPC aspects
check('npc unknown: name hidden', !G.canShow('npc', 'alice', 'name'));
check('npc known: name shown', G.canShow('npc', 'bob', 'name'));
check('npc known: goal shown', G.canShow('npc', 'bob', 'mechanics'));
check('npc unknown goal: hidden', !G.canShow('npc', 'alice', 'mechanics'));

// Skill aspects
check('skill L1: shown at minLevel 1', G.canShow('skill', 'basic_skill', 'mechanics', { minLevel: 1 }));
check('skill L1: hidden at minLevel 2', !G.canShow('skill', 'basic_skill', 'mechanics', { minLevel: 2 }));
check('skill L3: shown at minLevel 3', G.canShow('skill', 'adv_skill', 'mechanics', { minLevel: 3 }));

// Animal aspects
check('animal region-known: name shown', G.canShow('animal', 'deer', 'name'));
check('animal 5 encounters: name shown', G.canShow('animal', 'seen_animal', 'name'));
check('animal 0 encounters: name hidden', !G.canShow('animal', 'unknown_critter', 'name'));

// Alien aspects
check('alien known: name shown', G.canShow('alien', 'vex', 'name'));
check('alien unknown: name hidden', !G.canShow('alien', 'stranger', 'name'));

// Item aspects
check('item no plantId: shown (mundane)', G.canShow('item', { name: 'rock' }, 'name'));
check('item null: hidden', !G.canShow('item', null, 'name'));
check('item known plant: shown', G.canShow('item', { plantId: 'known_plant' }, 'name'));
check('item unknown plant: hidden', !G.canShow('item', { plantId: 'unknown_plant' }, 'name'));
check('item non-plant plantId: shown (tool)', G.canShow('item', { plantId: 'stone_knife' }, 'name'));

// Unknown domain
check('unknown domain: hidden', !G.canShow('bogus', 'x', 'name'));

// ============ SUMMARY ============
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
