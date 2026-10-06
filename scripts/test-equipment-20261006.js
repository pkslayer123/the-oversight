// test-equipment-20261006.js — villager equipment system proof
// Run: node scripts/test-equipment-20261006.js
const fs = require('fs');
const path = require('path');

// Minimal browser-ish environment
global.window = global;
global.S = {};

// Load equipment.js
const eqSrc = fs.readFileSync(path.join(__dirname, '../src/js/equipment.js'), 'utf8');
eval(eqSrc);

const EQ = global.S.equipment;
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name); }
}

// Mock item defs (subset of real items.json shape)
const items = [
  { id: 'hunting_spear', name: 'Hunting Spear', class: 'weapon', weapon: { bonus: 30, type: 'melee', range: 2 } },
  { id: 'chefs_knife', name: "Chef's Knife", class: 'weapon', weapon: { bonus: 8, type: 'melee', range: 1 } },
  { id: 'riot_gear', name: 'Riot gear', class: 'clothing', armor: { protection: 30 } },
  { id: 'military_vest', name: 'Military vest', class: 'clothing', armor: { protection: 40 } },
  { id: 'knit_cap', name: 'Knit Cap', class: 'clothing', armor: { protection: 1 } },
  { id: 'canvas_pants', name: 'Canvas Pants', class: 'clothing', armor: { protection: 3 } },
  { id: 'work_gloves', name: 'Work Gloves', class: 'clothing', armor: { protection: 2 } },
  { id: 'good_boots', name: 'Good Boots', class: 'clothing', armor: { protection: 3 } },
  { id: 'flannel_shirt', name: 'Flannel Shirt', class: 'clothing', armor: { protection: 2 } },
  { id: 'wool_socks', name: 'Wool Socks', class: 'clothing', armor: { protection: 1 } },
  { id: 'camp_pot', name: 'Camp Pot', class: 'tool' },
  { id: 'locket', name: 'Brass Locket', class: 'sentimental', bondThresholds: [{ uses: 10 }] },
  { id: 'photo', name: 'Faded Photo', class: 'sentimental' },
];

console.log('=== Slot structure ===');
check('weapon slot', EQ.slotForItem(items[0]) === 'weapon');
check('torso slot', EQ.slotForItem(items[3]) === 'torso');
check('head slot', EQ.slotForItem(items[4]) === 'head');
check('legs slot', EQ.slotForItem(items[5]) === 'legs');
check('hands slot', EQ.slotForItem(items[6]) === 'hands');
check('feet slot', EQ.slotForItem(items[7]) === 'feet');
check('riot_gear is full set', EQ.isFullSet('riot_gear'));
check('riot_gear anchors on torso', EQ.slotForItem(items[2]) === 'torso');
check('camp_pot not a main slot', EQ.slotForItem(items[10]) === null);

console.log('=== Auto-equip: early game (set wins) ===');
const earlyVillager = {
  id: 'early1', personality: { temperament: 'steady', sharing: 'balanced' },
  items: ['flannel_shirt', 'canvas_pants', 'work_gloves', 'wool_socks', 'knit_cap', 'riot_gear', 'chefs_knife'].map(id => ({ itemId: id })),
};
EQ.autoEquip(earlyVillager, items);
check('early: riot set equipped', earlyVillager.equipped.torso && earlyVillager.equipped.torso.fullSet);
check('early: weapon equipped', earlyVillager.equipped.weapon && earlyVillager.equipped.weapon.itemId === 'chefs_knife');
const earlyArmor = EQ.armorOf(earlyVillager, items);
check('early: set armor = 30, no coordination', earlyArmor === 30);

console.log('=== Auto-equip: late game (pieces win) ===');
const lateVillager = {
  id: 'late1', personality: { temperament: 'bold', sharing: 'balanced' },
  items: ['military_vest', 'canvas_pants', 'work_gloves', 'good_boots', 'knit_cap', 'riot_gear', 'hunting_spear', 'locket', 'photo'].map(id => ({ itemId: id })),
};
EQ.autoEquip(lateVillager, items);
check('late: pieces equipped (no full set)', !(lateVillager.equipped.torso && lateVillager.equipped.torso.fullSet));
check('late: military vest on torso', lateVillager.equipped.torso && lateVillager.equipped.torso.itemId === 'military_vest');
check('late: hunting spear equipped', lateVillager.equipped.weapon && lateVillager.equipped.weapon.itemId === 'hunting_spear');
const lateArmor = EQ.armorOf(lateVillager, items);
// 1 + 40 + 3 + 2 + 3 = 49 + 8 coordination = 57
check('late: pieces armor = 57 > riot 30', lateArmor === 57);

console.log('=== Set-vs-pieces comparison ===');
const cmp = EQ.compareSetVsPieces(lateVillager, items);
check('comparison winner = pieces', cmp.winner === 'pieces');
check('comparison setTotal = 30', cmp.setTotal === 30);
check('comparison piecesTotal = 57', cmp.piecesTotal === 57);
const cmpEarly = EQ.compareSetVsPieces(earlyVillager, items);
check('early comparison winner = set', cmpEarly.winner === 'set');

console.log('=== Head fun ===');
const funVillager = {
  id: 'fun1', personality: { temperament: 'playful', sharing: 'showoff' },
  items: ['camp_pot', 'knit_cap'].map(id => ({ itemId: id })),
};
EQ.autoEquip(funVillager, items);
check('playful villager wears the pot', funVillager.equipped.head && funVillager.equipped.head.itemId === 'camp_pot');
check('pot headKind', funVillager.equipped.head.headKind === 'pot');

console.log('=== Misc slots ===');
check('locket in misc', lateVillager.equipped.misc1 || lateVillager.equipped.misc2 || lateVillager.equipped.misc3);

console.log('=== Threat levels ===');
check('unarmed = 0', EQ.threatLevel({ equipped: {} }, items) === 0);
check('weapon only = 1', EQ.threatLevel({ equipped: { weapon: { itemId: 'chefs_knife' } } }, items) === 1);
const armoredV = { equipped: { weapon: { itemId: 'chefs_knife' }, torso: { itemId: 'flannel_shirt' } } };
check('weapon + armor = 2', EQ.threatLevel(armoredV, items) === 2);
check('riot set = 3 (dangerous)', EQ.threatLevel(earlyVillager, items) === 3);
const heavyV = { equipped: { weapon: { itemId: 'hunting_spear' }, torso: { itemId: 'military_vest' }, head: { itemId: 'knit_cap' }, legs: { itemId: 'canvas_pants' }, hands: { itemId: 'work_gloves' }, feet: { itemId: 'good_boots' } } };
check('spear + full kit = 3', EQ.threatLevel(heavyV, items) === 3);

console.log('=== Render hints ===');
check('spear wkind', EQ.weaponKind(items[0]) === 'spear');
check('knife wkind', EQ.weaponKind(items[1]) === 'blade');
check('heavy tier', EQ.armorTier(40) === 'heavy');
check('medium tier', EQ.armorTier(15) === 'medium');
check('light tier', EQ.armorTier(3) === 'light');
check('pot headKind', EQ.headKind(items[10]) === 'pot');
check('cap headKind', EQ.headKind(items[4]) === 'cap');

console.log('=== Weapon/armor values ===');
check('spear bonus 30', EQ.weaponBonusOf(lateVillager, items) === 30);
check('no weapon = 0', EQ.weaponBonusOf({ equipped: {} }, items) === 0);

console.log('=== Migration ===');
const oldSave = { equipped: { armor: { itemId: 'flannel_shirt', name: 'Flannel Shirt' }, weapon: { itemId: 'chefs_knife', name: "Chef's Knife" } } };
EQ.migrateEquipment(oldSave);
check('armor migrated to torso', oldSave.equipped.torso && oldSave.equipped.torso.itemId === 'flannel_shirt');
check('old armor key gone', !oldSave.equipped.armor);

console.log('=== Gear description ===');
const desc = EQ.gearDescription(lateVillager);
check('description mentions spear', desc.includes('Hunting Spear'));
check('description mentions vest', desc.includes('Military vest'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
