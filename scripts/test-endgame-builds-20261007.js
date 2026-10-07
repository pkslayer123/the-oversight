// End-game builds proof test (Steve 2026-10-07).
// Verifies: all 48 end-game items exist in items.json (read from git HEAD,
// NOT the dirty worktree), valid schema, tier/slot coverage per build,
// no duplicate ids, and docs/ENDGAME-BUILDS.md references real item ids.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = '/home/hatch/workspace/the-scattering';
let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', msg); }
}

const raw = execSync('git show HEAD:src/data/items.json', { cwd: REPO, maxBuffer: 8 * 1024 * 1024 }).toString();
const data = JSON.parse(raw);
const items = Array.isArray(data) ? data : data.items;
ok(Array.isArray(items) && items.length >= 170, `items array has ${items.length} entries (>=170)`);

const byId = {};
for (const it of items) {
  ok(it.id && it.name, `item has id/name (${it.id || '?'})`);
  if (byId[it.id]) ok(false, `duplicate id: ${it.id}`);
  byId[it.id] = it;
}

// The 48 new items, grouped by build.
const BUILDS = {
  socialite: ['commanders_coat', 'war_horn', 'banner_of_the_fallen', 'death_mask'],
  hunter: ['apex_bow', 'ghost_camo', 'predators_trophy', 'heartseeker_arrows'],
  forager: ['seed_vault', 'living_soil_robes', 'harvest_scythe', 'rain_caller_charm'],
  survivalist: ['worldroot_plate', 'undying_heart', 'scar_tissue_wraps', 'deep_earth_boots'],
  brawler: ['worldbreaker_maul', 'bloodplate', 'rage_bindings', 'skull_helm'],
  detective: ['truth_lenses', 'investigators_coat', 'the_ledger', 'whisper_catchers'],
  miser: ['vault_key', 'merchants_seals', 'gilded_pack', 'misers_eye'],
  explorer: ['farstrider_boots', 'wayfinders_atlas', 'stormcloak', 'trail_rations_pouch'],
  drifter: ['phase_shawl', 'between_boots', 'anchors_locket', 'hollow_bone_charm'],
  caregiver: ['surgeons_kit', 'ward_banner', 'lifebound_vestments', 'poultice_bandolier'],
  cross: ['second_skin_suit', 'whispering_compass', 'feast_king_cauldron', 'oath_ring',
          'godslayer_spear', 'deep_pocket_coat', 'trackers_blind', 'field_surgeons_satchel'],
};
const VALID_SLOTS = ['melee', 'ranged', 'head', 'torso', 'legs', 'hands', 'shoes'];
let newCount = 0;
for (const [build, ids] of Object.entries(BUILDS)) {
  for (const id of ids) {
    const it = byId[id];
    ok(!!it, `build ${build}: item ${id} exists`);
    if (!it) continue;
    newCount++;
    ok(it.class && it.flavor && it.baseEffect, `${id}: has class/flavor/baseEffect`);
    ok([2, 3, 4].includes(it.lootTier), `${id}: lootTier ${it.lootTier} in {2,3,4}`);
    ok(!it.slot || VALID_SLOTS.includes(it.slot), `${id}: slot ${it.slot} valid`);
  }
  const tiers = ids.map(id => byId[id] && byId[id].lootTier);
  ok(tiers.includes(4) || build === 'cross', `build ${build}: has a tier-4 capstone (${tiers})`);
}
ok(newCount === 48, `all 48 new items present (found ${newCount})`);

// Every build's tier-4 item is findable or otherwise obtainable (not dead content).
for (const [build, ids] of Object.entries(BUILDS)) {
  for (const id of ids) {
    const it = byId[id];
    if (it && it.lootTier === 4) {
      ok(it.findable !== false || it.craftable, `${id}: tier-4 obtainable (findable/craftable)`);
    }
  }
}

// fullBody items use the documented flag.
for (const id of ['worldroot_plate', 'second_skin_suit']) {
  ok(byId[id] && byId[id].fullBody === true, `${id}: fullBody flag set`);
}

// Tier distribution sanity: end-game tiers grew.
const tierCount = {};
for (const it of items) { const t = it.lootTier || 1; tierCount[t] = (tierCount[t] || 0) + 1; }
ok((tierCount[3] || 0) >= 20, `tier-3 items >= 20 (found ${tierCount[3] || 0})`);
ok((tierCount[4] || 0) >= 15, `tier-4 items >= 15 (found ${tierCount[4] || 0})`);

// Design doc exists and references real item ids.
const docPath = path.join(REPO, 'docs/ENDGAME-BUILDS.md');
ok(fs.existsSync(docPath), 'docs/ENDGAME-BUILDS.md exists');
const doc = fs.readFileSync(docPath, 'utf8');
let refs = 0;
for (const ids of Object.values(BUILDS)) for (const id of ids) if (doc.includes(id)) refs++;
ok(refs >= 40, `doc references >= 40 of the new item ids (found ${refs})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
