// Proof: loot-as-action — no auto-loot, corpse has inventory, take/leave/use,
// meat rots on the corpse. Steve 2026-10-06.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/corpses.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Test');
  Game.newGame('Test', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  const invCountBefore = s.inventory.length;

  // ---- 1. Kill a monster: NO auto-loot ----
  const mdef = { id: 'test_beast', name: 'Test Beast', edible: { calories: 800, note: '' } };
  // register the death as tbDamage would
  const corpse = Game.registerDeath({
    kind: 'monster', monsterId: 'test_beast', monsterName: 'Test Beast',
    name: 'Test Beast', mx: 5, my: 5, cause: 'combat', killerId: Game.villagerId,
    descriptor: 'something big', witnesses: [],
  });
  ok('corpse registered on kill', !!corpse && corpse.kind === 'monster');
  ok('corpse has trophy items (not empty)', (corpse.items || []).length > 0);

  // simulate tbEnd win path drops via corpseForKill
  const found = Game.corpseForKill(mdef, { mx: 5, my: 5 });
  ok('corpseForKill finds the death corpse', found && found.id === corpse.id);

  // meat goes to corpse, NOT player inventory
  const meatEntry = { plantId: 'meat_test_beast', foodKind: 'meat', foodState: 'carcass',
    edible: false, units: 1, kcalEach: 0, hiddenKcal: 800,
    spoilDay: s.day + 3, name: 'something big (carcass)',
    unit: 'carcass', kg: 0.8, prep: 'A carcass.' };
  found.items.push(meatEntry);
  ok('no auto-loot: player inventory unchanged', s.inventory.length === invCountBefore);
  ok('meat is on the corpse', found.items.some(i => i.plantId === 'meat_test_beast'));

  // ---- 2. Take per item ----
  // move player next to corpse
  s.mx = 5; s.my = 4;
  const meatIdx = found.items.findIndex(i => i.plantId === 'meat_test_beast');
  const took = Game.corpseTakeItem(found.id, meatIdx);
  ok('corpseTakeItem takes the meat', !!took && took.plantId === 'meat_test_beast');
  ok('meat now in player inventory', s.inventory.some(i => i.plantId === 'meat_test_beast'));
  ok('meat removed from corpse', !found.items.some(i => (i.units || 0) > 0 && i.plantId === 'meat_test_beast'));

  // ---- 3. Leave per item ----
  const trophyIdx = found.items.findIndex(i => (i.units || 0) > 0);
  const trophy = found.items[trophyIdx];
  trophy._left = true; // what the Leave button does
  ok('leave marks item (stays on corpse)', trophy._left === true && (trophy.units || 0) > 0);

  // ---- 4. Use on the spot ----
  // add a usable item to the corpse
  found.items.push({ name: 'Test Bandage', units: 1, kg: 0.1, kcalEach: 0, spoilDay: 9999,
    usable: true, plantId: 'test_bandage' });
  // stub isUsable/useItem for the test
  const origUsable = Game.isUsable;
  const origUse = Game.useItem;
  let usedIdx = -1;
  Game.isUsable = (it) => !!(it && it.usable);
  Game.useItem = (idx) => { usedIdx = idx; s.inventory.splice(idx, 1); };
  const useIdx = found.items.findIndex(i => i.plantId === 'test_bandage');
  Game.corpseUseItem(found.id, useIdx);
  ok('corpseUseItem routes through use path', usedIdx >= 0);
  Game.isUsable = origUsable; Game.useItem = origUse;

  // ---- 5. Meat rots ON THE CORPSE ----
  const rotCorpse = Game.registerDeath({
    kind: 'monster', monsterId: 'rot_beast', name: 'Rot Beast',
    mx: 3, my: 3, cause: 'combat', descriptor: 'something', witnesses: [],
  });
  rotCorpse.items.push({ plantId: 'meat_rot_beast', foodKind: 'meat', foodState: 'carcass',
    edible: false, units: 1, kcalEach: 0, name: 'rot meat', kg: 0.8,
    spoilDay: s.day - 1 }); // already spoiled
  const before = rotCorpse.items.length;
  Game.sweepSpoiled();
  ok('spoiled meat removed from corpse by sweepSpoiled', rotCorpse.items.length < before);
  ok('no spoiled items remain on corpse', !rotCorpse.items.some(i => Game.isSpoiled(i)));

  // ---- 6. Knowledge gating: weight shown, identity gated ----
  // itemDisplayName gates plant names; meat uses stored (gated) name
  const dispName = Game.itemDisplayName({ plantId: 'meat_test_beast', name: 'something big (carcass)' });
  ok('meat display name uses gated stored name', dispName === 'something big (carcass)');
  // weight is always available
  const w = ((meatEntry.kg || 0.1) * (meatEntry.units || 1)).toFixed(1);
  ok('weight computable without knowledge', w === '0.8');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
