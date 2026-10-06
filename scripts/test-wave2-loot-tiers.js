// Wave-2 loot tiers (Steve 2026-10-06):
// - speedbump_turtle downgraded: wave-1 base, tier <= 2.
// - One apex per wave: gallowdeer (wave 1), moderator (wave 2, tier 4).
// - landlord demoted from apex: tier 3.
// - Veteran wave-1 variants (scarred/elder/pack-leader) drop wave-2 loot
//   (tier <= 3) ONLY after wave 2 unlocks; before that, wave-1 loot.
// - Base wave-1 monsters never exceed tier 2.
// Usage: node scripts/test-wave2-loot-tiers.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
const byId = Object.fromEntries(monsters.map(m => [m.id, m]));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

console.log('=== WAVE-2 LOOT TIERS ===\n');

// ---- 1. Data: turtle downgraded ----
console.log('1. Turtle downgrade:');
const turtle = byId['speedbump_turtle'];
ok('turtle exists', !!turtle);
ok('turtle tier <= 2', turtle.loot.tier <= 2, `tier=${turtle.loot.tier}`);
ok('turtle chance 0.08-0.12', turtle.loot.chance >= 0.08 && turtle.loot.chance <= 0.12, `chance=${turtle.loot.chance}`);

// ---- 2. Data: wave-1 tiers ----
console.log('\n2. Wave-1 loot tiers:');
for (const m of monsters) {
  if ((m.wave || 1) !== 1 || !m.loot) continue;
  if (m.apex) {
    ok(`${m.id} apex may exceed tier 2 (tier ${m.loot.tier})`, m.loot.tier <= 4, `tier=${m.loot.tier}`);
  } else {
    ok(`${m.id} base wave-1 tier <= 2`, m.loot.tier <= 2, `tier=${m.loot.tier}`);
  }
}

// ---- 3. Data: one apex per wave ----
console.log('\n3. One apex per wave:');
const apexW1 = monsters.filter(m => (m.wave || 1) === 1 && m.apex);
const apexW2 = monsters.filter(m => (m.wave || 1) === 2 && m.apex);
ok('exactly one wave-1 apex', apexW1.length === 1, `found ${apexW1.map(m => m.id)}`);
ok('wave-1 apex is gallowdeer', apexW1[0] && apexW1[0].id === 'gallowdeer');
ok('exactly one wave-2 apex', apexW2.length === 1, `found ${apexW2.map(m => m.id)}`);
ok('wave-2 apex is moderator', apexW2[0] && apexW2[0].id === 'moderator');

// ---- 4. Data: moderator / landlord ----
console.log('\n4. Apex assignment:');
ok('moderator tier 4', byId['moderator'].loot.tier === 4, `tier=${byId['moderator'].loot.tier}`);
ok('landlord tier 3 (demoted)', byId['landlord'].loot.tier === 3, `tier=${byId['landlord'].loot.tier}`);
ok('landlord not apex', !byId['landlord'].apex);

// ---- 5. Logic: rollAlienLoot tier caps ----
console.log('\n5. rollAlienLoot tier logic:');
// Controlled alien pool: one item per tier.
Game.data = Game.data || {};
Game.data.items = [1, 2, 3, 4].map(t => ({ id: `alien_t${t}`, origin: 'alien', lootTier: t }));
const tierOf = (id) => Game.data.items.find(i => i.id === id).lootTier;
const realUnlockedWave = Game.unlockedWave;
// Force the chance roll to always pass.
const realRandom = Math.random;
Math.random = () => 0;

function roll(mdef, fighter, waveUnlock) {
  Game.unlockedWave = () => waveUnlock;
  let seenMax = 0;
  for (let i = 0; i < 30; i++) {
    const id = Game.rollAlienLoot(mdef, fighter);
    if (id) seenMax = Math.max(seenMax, tierOf(id));
  }
  return seenMax;
}

// Base wave-1 with inflated data tier: still capped at 2.
ok('base wave-1 capped at tier 2',
  roll({ wave: 1, loot: { chance: 1, tier: 5 } }, null, 1) <= 2);
// Veteran pre wave-2 unlock: capped at 2.
ok('veteran pre-unlock capped at tier 2',
  roll({ wave: 1, loot: { chance: 1, tier: 2 } }, { veteranVariant: 'scarred' }, 1) <= 2);
// Veteran post wave-2 unlock: tier up to 3.
const vetPost = roll({ wave: 1, loot: { chance: 1, tier: 2 } }, { veteranVariant: 'elder' }, 2);
ok('veteran post-unlock reaches tier 3', vetPost === 3, `max=${vetPost}`);
const vetPostPL = roll({ wave: 1, loot: { chance: 1, tier: 1 } }, { veteranVariant: 'pack-leader' }, 2);
ok('pack-leader post-unlock tier 2-3', vetPostPL >= 2 && vetPostPL <= 3, `max=${vetPostPL}`);
// Wave-1 apex bypasses the cap.
ok('gallowdeer apex reaches tier 4',
  roll({ wave: 1, apex: true, loot: { chance: 1, tier: 4 } }, null, 1) === 4);
// Wave-2 base: tier 3 reachable, 4 not.
const w2base = roll({ wave: 2, loot: { chance: 1, tier: 3 } }, null, 2);
ok('wave-2 base reaches tier 3', w2base === 3, `max=${w2base}`);
// Wave-2 apex: tier 4.
ok('moderator apex reaches tier 4',
  roll({ wave: 2, apex: true, loot: { chance: 1, tier: 4 } }, null, 2) === 4);
// Wave-2 veteran flag irrelevant (wave-2 uses data tier).
ok('wave-2 data tier respected',
  roll({ wave: 2, loot: { chance: 1, tier: 2 } }, { veteranVariant: 'scarred' }, 2) <= 2);

Math.random = realRandom;
Game.unlockedWave = realUnlockedWave;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
