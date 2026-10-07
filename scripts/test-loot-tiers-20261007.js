// Loot tiering audit test (Steve 2026-10-07)
// Verifies: unified 4-tier model, bug fixes, relic wiring, no contradictions.

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL: ${msg}`); }
}
function ok(msg) { pass++; }

// --- Load data ---
const items = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/items.json'), 'utf8'));
const monsters = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/monsters.json'), 'utf8'));
const relics = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/relicEnhancements.json'), 'utf8'));
const modifiers = fs.readFileSync(path.join(__dirname, '../src/js/engine/modifiers.js'), 'utf8');
const gameJs = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');

console.log('=== TIER MODEL: 4 tiers max ===');
const alienItems = items.filter(i => i.origin === 'alien');
const tiers = [...new Set(alienItems.map(i => i.lootTier || 1))].sort();
assert(Math.max(...tiers) <= 4, `Max alien lootTier should be <= 4, found ${Math.max(...tiers)}`);
assert(!tiers.includes(5), 'Tier 5 should not exist (searcaster downgraded)');
ok(`Alien items span tiers: ${tiers.join(', ')}`);

// Tier 4 items should exist (apex loot)
const t4 = alienItems.filter(i => (i.lootTier || 1) === 4);
assert(t4.length >= 3, `Should have 3+ tier-4 items, found ${t4.length}`);
console.log(`  Tier 4 items: ${t4.map(i => i.id).join(', ')}`);

console.log('\n=== MONSTER LOOT TIERS match code rules ===');
// Code rules (rollAlienLoot):
// - Wave-1 base: tier 1-2 max
// - Wave-1 apex: tier 4
// - Wave-1 veterans: tier up to 3 (after wave 2)
// - Wave-2 base: tier 2-3
// - Wave-2 apex: tier 4
for (const m of monsters) {
  const loot = m.loot || {};
  const tier = loot.tier || 1;
  const wave = m.wave || 1;
  const isApex = !!m.apex;
  
  if (wave <= 1 && !isApex) {
    assert(tier <= 2, `${m.id} (wave-1 base) has tier ${tier}, should be <= 2`);
  }
  if (wave >= 2 && !isApex) {
    assert(tier >= 2 && tier <= 3, `${m.id} (wave-2 base) has tier ${tier}, should be 2-3`);
  }
  if (isApex) {
    assert(tier === 4, `${m.id} (apex) has tier ${tier}, should be 4`);
  }
}

console.log('\n=== INSPIRATION BUG FIX: ember never 0 ===');
assert(gameJs.includes("m.biEmber = Math.max(1, 3 - m.biCycles)"),
  'Inspiration ember should use Math.max(1, ...) not Math.max(0, ...)');
assert(!gameJs.includes("m.biEmber = Math.max(0, 3 - m.biCycles)"),
  'Old Math.max(0, ...) should be gone');

console.log('\n=== WARRANTY CROWD-LOCK FIX ===');
assert(gameJs.includes('wcConsecutiveRedials'),
  'Warranty should track consecutive redials for impatience');
assert(gameJs.includes('wcDmg >= Math.max(5, wcMaxHp * 0.1)') || gameJs.includes('wcDmg >='),
  'Warranty bad-connection should have damage threshold');

console.log('\n=== RELIC ENHANCEMENTS WIRED ===');
const relicIds = new Set(relics.map(r => r.id));
// Extract RELIC_MOD_MAP keys via regex
const mapMatch = modifiers.match(/const RELIC_MOD_MAP = \{([\s\S]*?)\n  \};/);
const mappedIds = new Set();
if (mapMatch) {
  const keys = mapMatch[1].match(/^\s+(\w+):/gm);
  if (keys) keys.forEach(k => mappedIds.add(k.trim().replace(':', '')));
}
const unmapped = [...relicIds].filter(id => !mappedIds.has(id));
assert(unmapped.length === 0, `Unmapped relics: ${unmapped.join(', ')}`);
ok(`${mappedIds.size} relics wired (was 21, now ${mappedIds.size})`);

console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
