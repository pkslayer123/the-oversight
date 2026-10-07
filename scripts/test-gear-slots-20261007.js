// Proof test: Gear slot system + sentimental bond evolution (Steve 2026-10-07)
// Tests the explicit slot system, full-body blocking, equipped-only bond,
// and beam resistance via slots.

'use strict';

// Minimal DOM/window stub for equipment.js
global.window = global;
global.Game = { data: { items: [] } };

const fs = require('fs');
const vm = require('vm');

// Load equipment.js in a sandbox
const equipSrc = fs.readFileSync('/tmp/equip-new.js', 'utf8');
vm.runInThisContext(equipSrc);
const E = window.S.equipment;

// Mock item definitions
const items = [
  { id: 'hunting_knife', name: 'Hunting Knife', class: 'weapon', weapon: { bonus: 5, range: 1 } },
  { id: 'longbow', name: 'Longbow', class: 'weapon', weapon: { bonus: 8, range: 5 } },
  { id: 'sling', name: 'Sling', class: 'weapon', weapon: { bonus: 3, range: 4 } },
  { id: 'riot_gear', name: 'Riot Gear', armor: { protection: 30 }, fullBody: true },
  { id: 'leather_jacket', name: 'Leather Jacket', armor: { protection: 8 } },
  { id: 'good_boots', name: 'Good Boots', armor: { protection: 4 } },
  { id: 'work_gloves', name: 'Work Gloves', armor: { protection: 2 } },
  { id: 'knit_cap', name: 'Knit Cap', armor: { protection: 1 } },
  { id: 'canvas_pants', name: 'Canvas Pants', armor: { protection: 3 } },
  { id: 'hoodie', name: 'Hoodie', class: 'sentimental', armor: { protection: 5 } },
  { id: 'mothers_ring', name: "Mother's Ring", class: 'sentimental' },
  { id: 'reading_glasses', name: 'Reading Glasses', class: 'sentimental' },
  { id: 'spare_socks', name: 'Spare Socks', class: 'sentimental' },
  { id: 'lucky_coin', name: 'Lucky Coin', class: 'sentimental' },
  { id: 'sent_axe', name: "Father's Axe", class: 'sentimental', weapon: { bonus: 6, range: 1 } },
  { id: 'alien_helm', name: 'Alien Helm', armor: { protection: 15, beamResist: true } },
  { id: 'alien_carapace', name: 'Alien Carapace', armor: { protection: 20, beamResist: true } },
];
global.Game.data.items = items;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name); }
}

// === 1. Slot system ===
check('melee slot for knife', E.slotForItem(items[0]) === 'melee');
check('ranged slot for longbow', E.slotForItem(items[1]) === 'ranged');
check('ranged slot for sling', E.slotForItem(items[2]) === 'ranged');
check('isRangedWeapon longbow', E.isRangedWeapon(items[1]) === true);
check('isRangedWeapon knife false', E.isRangedWeapon(items[0]) === false);
check('full-body riot gear -> torso', E.slotForItem(items[3]) === 'torso');
check('isFullSet riot gear', E.isFullSet('riot_gear', items[3]) === true);
check('isFullSet leather jacket false', E.isFullSet('leather_jacket', items[4]) === false);

// === 2. Full-body blocking ===
const withRiot = { torso: { itemId: 'riot_gear', name: 'Riot Gear', fullSet: true } };
const blocked = E.blockedSlots(withRiot);
check('riot blocks head', blocked.indexOf('head') !== -1);
check('riot blocks legs', blocked.indexOf('legs') !== -1);
check('riot blocks shoes', blocked.indexOf('shoes') !== -1);
check('riot does NOT block hands', blocked.indexOf('hands') === -1);
check('riot does NOT block melee', blocked.indexOf('melee') === -1);
check('riot does NOT block acc1', blocked.indexOf('acc1') === -1);
check('isSlotBlocked head', E.isSlotBlocked('head', withRiot) === true);
check('isSlotBlocked hands false', E.isSlotBlocked('hands', withRiot) === false);
check('no block without full set', E.blockedSlots({ torso: { itemId: 'leather_jacket' } }).length === 0);

// === 3. Sentimental slots ===
check('hoodie -> torso', E.slotForItem(items[9]) === 'torso');
check('mothers_ring -> null (accessory)', E.slotForItem(items[10]) === null);
check('isAccessory mothers_ring', E.isAccessory(items[10]) === true);
check('reading_glasses -> head', E.slotForItem(items[11]) === 'head');
check('spare_socks -> shoes', E.slotForItem(items[12]) === 'shoes');
check('lucky_coin -> null (accessory)', E.slotForItem(items[13]) === null);
check('sentimental axe -> melee', E.slotForItem(items[14]) === 'melee');

// === 4. Slot labels ===
check('slotLabel melee', E.slotLabel('melee') === 'Melee weapon');
check('slotLabel shoes', E.slotLabel('shoes') === 'Shoes');
check('slotLabel acc1', E.slotLabel('acc1') === 'Accessory');

// === 5. Migration ===
const oldSave = { equipped: { weapon: { itemId: 'hunting_knife' }, feet: { itemId: 'good_boots' }, misc1: { itemId: 'lucky_coin' }, armor: { itemId: 'leather_jacket' } } };
E.migrateEquipment(oldSave);
check('weapon -> melee', !!oldSave.equipped.melee && !oldSave.equipped.weapon);
check('feet -> shoes', !!oldSave.equipped.shoes && !oldSave.equipped.feet);
check('misc1 -> acc1', !!oldSave.equipped.acc1 && !oldSave.equipped.misc1);
check('armor -> torso', !!oldSave.equipped.torso && !oldSave.equipped.armor);

// Ranged weapon migrates to ranged
const oldRanged = { equipped: { weapon: { itemId: 'longbow' } } };
E.migrateEquipment(oldRanged);
check('ranged weapon -> ranged slot', !!oldRanged.equipped.ranged && !oldRanged.equipped.weapon);

// === 6. autoEquip uses new slots ===
const villager = {
  items: ['hunting_knife', 'longbow', 'leather_jacket', 'good_boots', 'mothers_ring', 'lucky_coin'],
  personality: { temperament: 'steady', sharing: 'balanced' },
};
const eq = E.autoEquip(villager, items);
check('autoEquip melee', eq.melee && eq.melee.itemId === 'hunting_knife');
check('autoEquip ranged', eq.ranged && eq.ranged.itemId === 'longbow');
check('autoEquip accessory', eq.acc1 && (eq.acc1.itemId === 'mothers_ring' || eq.acc1.itemId === 'lucky_coin'));

// === 7. armorOf with new slots ===
const armored = { equipped: { torso: { itemId: 'leather_jacket' }, shoes: { itemId: 'good_boots' } } };
check('armorOf sums pieces', E.armorOf(armored, items) === 8 + 4 + 2); // +2 coordination

// === 8. weaponBonusOf melee/ranged ===
const armed = { equipped: { melee: { itemId: 'hunting_knife' }, ranged: { itemId: 'longbow' } } };
check('melee bonus', E.weaponBonusOf(armed, items, 'melee') === 5);
check('ranged bonus', E.weaponBonusOf(armed, items, 'ranged') === 8);

// === 9. Beam resistance slot logic (static check on ap-head.js) ===
const apSrc = fs.readFileSync('/tmp/ap-head.js', 'utf8');
check('no inventory kept-close counting', !/worn close|kept.*inventory/i.test(apSrc) || !/slot: 'kept'/.test(apSrc));
check('no kept slot in pieces', !/slot: 'kept'/.test(apSrc));
check('armor slots only comment', /armor slot/i.test(apSrc));
check('knife comment fixed', !/grandmother's knife protects you/i.test(apSrc));
check('shoes in slot list', /'shoes'/.test(apSrc));

// === 10. Bond equipped-only (static check on game-head.js) ===
const gameSrc = fs.readFileSync('/tmp/game-head.js', 'utf8');
check('bumpBond exists', /bumpBond\(itemId/.test(gameSrc));
check('bumpBond requires equipped', /must be equipped/.test(gameSrc));
check('bond decay exists', /out of sight, out of mind/i.test(gameSrc));
check('heirloom at 50', /heirloom/.test(gameSrc));
check('kill hook exists', /it drew blood for you/.test(gameSrc));
check('beam survival hook', /it caught the beam for you/.test(apSrc));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
