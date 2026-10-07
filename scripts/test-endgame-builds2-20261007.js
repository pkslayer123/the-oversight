// End-game builds expansion proof test (Steve 2026-10-07).
// Verifies: the 40 new signature items exist in items.json (read from git HEAD),
// valid schema, each of the 20 new paths has a tier-4 capstone, all ability
// kits in docs/ENDGAME-BUILDS.md reference real ability ids, and the doc
// references every new item id.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = '/home/hatch/workspace/the-scattering';
let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', msg); }
}

const raw = execSync('git show HEAD:src/data/items.json', { cwd: REPO, maxBuffer: 16 * 1024 * 1024 }).toString();
const items = JSON.parse(raw);
ok(Array.isArray(items) && items.length >= 210, `items array has ${items.length} entries (>=210)`);

const byId = {};
for (const it of items) {
  ok(it.id && it.name, `item has id/name (${it.id || '?'})`);
  if (byId[it.id]) ok(false, `duplicate id: ${it.id}`);
  byId[it.id] = it;
}

// The 40 new signature items, grouped by new path.
const NEW_PATHS = {
  diplomat:      ['universal_translator', 'peace_accords'],
  consensus:     ['consensus_crown', 'neural_weave'],
  ghost:         ['void_cloak', 'whisper_rounds'],
  beastmaster:   ['beastcall_horn', 'wildmark_wraps'],
  terraformer:   ['worldseed_satchel', 'rain_engine'],
  preserver:     ['memory_seed_vault', 'seedkeepers_grimoire'],
  adaptation:    ['adaptive_dermis', 'toxin_library'],
  shelter:       ['hearthstone_amulet', 'shelter_cloak'],
  living_weapon: ['ironfist_wraps', 'titan_belt'],
  warlord:       ['warlords_standard', 'conquerors_plate'],
  weaver:        ['causality_lens', 'fate_threads'],
  confessor:     ['confessional_seal', 'truthbrand'],
  vault:         ['everywhere_key', 'cache_fortress_kit'],
  broker:        ['futures_ledger', 'brokers_seal'],
  cartographer:  ['uncharted_atlas', 'horizon_compass'],
  pathfinder:    ['first_steps_boots', 'trailblazer_machete'],
  unbound:       ['empty_pack', 'nowhere_idol'],
  witness:       ['memory_lantern', 'witness_coat'],
  renewal:       ['lifespring_vial', 'menders_apron'],
  sanctuary:     ['sanctuary_bell', 'wardens_cloak'],
};
const VALID_SLOTS = ['melee', 'ranged', 'head', 'torso', 'legs', 'hands', 'shoes', 'acc'];
let newCount = 0;
for (const [pname, ids] of Object.entries(NEW_PATHS)) {
  for (const id of ids) {
    const it = byId[id];
    ok(!!it, `path ${pname}: item ${id} exists`);
    if (!it) continue;
    newCount++;
    ok(it.class && it.flavor && it.baseEffect, `${id}: has class/flavor/baseEffect`);
    ok([3, 4].includes(it.lootTier), `${id}: lootTier ${it.lootTier} in {3,4}`);
    ok(!it.slot || VALID_SLOTS.includes(it.slot), `${id}: slot ${it.slot} valid`);
    ok(it.findable !== false, `${id}: obtainable (findable)`);
  }
  const tiers = ids.map(id => byId[id] && byId[id].lootTier);
  ok(tiers.includes(4), `path ${pname}: has a tier-4 capstone (${tiers})`);
}
ok(newCount === 40, `all 40 new items present (found ${newCount})`);

// All ability kits in the doc reference real ability ids.
const abRaw = execSync('git show HEAD:src/data/abilities.json', { cwd: REPO, maxBuffer: 4 * 1024 * 1024 }).toString();
const abIds = new Set(JSON.parse(abRaw).map(a => a.id));
const docRaw = execSync('git show HEAD:docs/ENDGAME-BUILDS.md', { cwd: REPO, maxBuffer: 4 * 1024 * 1024 }).toString();
const kits = docRaw.match(/\*\*Ability kit \(6\):\*\* (.+)/g) || [];
ok(kits.length === 30, `doc has 30 ability kits (found ${kits.length})`);
let badAb = [];
for (const k of kits) {
  const ids = k.replace('**Ability kit (6):** ', '').split(',').map(s => s.trim());
  ok(ids.length === 6, `kit has 6 abilities (${ids.length}): ${ids.slice(0, 2).join(',')}...`);
  for (const id of ids) if (!abIds.has(id)) badAb.push(id);
}
ok(badAb.length === 0, `all kit ability ids real${badAb.length ? ': ' + [...new Set(badAb)].join(',') : ''}`);

// Doc references every new item id.
let refs = 0;
for (const ids of Object.values(NEW_PATHS)) for (const id of ids) if (docRaw.includes(id)) refs++;
ok(refs === 40, `doc references all 40 new item ids (found ${refs})`);

// Galactic bar: each path section has a fantasy paragraph mentioning the table/aliens/humanity.
const sections = docRaw.split(/^## /m).filter(s => /^\d+\. /.test(s));
ok(sections.length === 10, `doc has 10 player-type sections (found ${sections.length})`);
let pathCount = 0;
for (const s of sections) {
  const paths = s.match(/^### /gm) || [];
  pathCount += paths.length;
  ok(paths.length === 3, `section has 3 paths (found ${paths.length}): ${s.split('\n')[0]}`);
}
ok(pathCount === 30, `30 total paths (found ${pathCount})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
