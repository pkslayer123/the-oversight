// Attack anyone + weapon range tests. Usage: node scripts/test-attack-anyone.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  const items = Game.data.items;

  // --- 1. weapon ranges in data ---
  const wmap = {};
  for (const it of items) if (it.weapon) wmap[it.id] = it.weapon;
  eq('spear range 2', wmap['hunting_spear'].range, 2);
  eq('fire spear range 2', wmap['fire_hardened_spear'].range, 2);
  eq('sling range 4', wmap['sling'].range, 4);
  eq('bow range 5', wmap['crude_bow'].range, 5);
  eq('machete range 1', wmap['machete'].range, 1);
  eq('knife range 1', wmap['stone_knife'].range, 1);
  eq('sling ammo stone', wmap['sling'].ammo, 'stone');
  eq('bow ammo arrow', wmap['crude_bow'].ammo, 'arrow');
  ok('arrow item exists', items.some(i => i.id === 'arrow'));

  // --- 2. equippedWeapon ---
  let w = Game.equippedWeapon();
  ok('unarmed default', w.unarmed && w.range === 1 && w.bonus === 0);
  // equip a spear
  Game.state.scholar.equipped = Game.state.scholar.equipped || {};
  Game.state.scholar.equipped.weapon = { itemId: 'hunting_spear', name: 'Hunting spear' };
  w = Game.equippedWeapon();
  eq('spear range', w.range, 2);
  eq('spear bonus', w.bonus, 30);
  // equip bow
  Game.state.scholar.equipped.weapon = { itemId: 'crude_bow', name: 'Crude bow' };
  w = Game.equippedWeapon();
  eq('bow range', w.range, 5);
  eq('bow ammo', w.ammo, 'arrow');

  // --- 3. tbPlayerStrike respects range ---
  // set up a minimal betrayal fight manually
  const v = Game.state.village;
  const roster = v.roster.filter(id => id !== Game.villagerId);
  const target = roster[0];
  Game.playerAttacks(target);
  ok('betrayal combat started', !!(Game.tbfight && Game.tbfight.betrayal));
  const h = Game.tbFighter('h_' + target);
  ok('hostile fighter exists', !!h);
  // force player turn
  Game.tbfight.turnIdx = Game.tbfight.order.indexOf('p');
  const p = Game.tbFighter('p');
  p.moveLeft = 10; p.acted = false;
  // place hostile far away (beyond bow range 5)
  p.mx = 0; p.my = 0; h.mx = 8; h.my = 8;
  Game.state.scholar.equipped.weapon = { itemId: 'stone_knife', name: 'Stone knife' };
  const farResult = Game.tbPlayerStrike(h.key);
  eq('knife cannot reach 8 away', farResult, false);
  // bow CAN reach 5... place at distance 5
  h.mx = 5; h.my = 0;
  Game.state.scholar.equipped.weapon = { itemId: 'crude_bow', name: 'Crude bow' };
  // no arrows -> should fail
  Game.state.scholar.inventory = (Game.state.scholar.inventory || []).filter(i => i.material !== 'arrow');
  p.acted = false;
  const noAmmo = Game.tbPlayerStrike(h.key);
  eq('bow without arrows fails', noAmmo, false);
  // give arrows
  Game.state.scholar.inventory.push({ material: 'arrow', units: 5, name: 'Arrow', kcalEach: 0, spoilDay: 9999, kg: 0.05 });
  p.acted = false;
  const hpBefore = h.hp;
  const bowHit = Game.tbPlayerStrike(h.key);
  eq('bow with arrows hits at range 5', bowHit, true);
  ok('hostile took damage', h.hp < hpBefore);
  eq('arrow consumed', Game.ammoCount('arrow'), 4);
  ok('trauma accrued', Game.traumaLevel() > 0);

  // --- 4. tbHostileTurn: beg / yield / flee paths don't crash ---
  // reset fight for AI testing
  Game.tbfight = null;
  Game.playerAttacks(target);
  const h2 = Game.tbFighter('h_' + target);
  ok('second fight started', !!h2);
  // force beg: hp < 60%
  h2.hp = Math.floor(h2.maxHp * 0.5);
  h2._begged = false;
  try { Game.tbHostileTurn(h2); ok('beg path runs', h2._begged === true); }
  catch (e) { fail++; console.log('FAIL beg path threw:', e.message); }
  // force yield: hp very low, run many times to hit the 55% chance
  let yielded = false;
  for (let i = 0; i < 20 && !yielded; i++) {
    h2.hp = Math.floor(h2.maxHp * 0.1); h2._yielded = false; h2.yielded = false;
    Game.tbfight.over = false;
    try { Game.tbHostileTurn(h2); } catch (e) { fail++; console.log('FAIL yield path threw:', e.message); break; }
    if (h2.yielded) yielded = true;
    // reset fight if it ended
    if (!Game.tbfight) { Game.playerAttacks(target); }
  }
  ok('yield path triggers within 20 tries', yielded);
  Game.tbfight = null;

  // --- 5. murder observe dims exist ---
  // (indirect: seedGossip shouldn't throw)
  try { Game.observe('murder'); ok('observe murder runs', true); }
  catch (e) { fail++; console.log('FAIL observe murder threw:', e.message); }

  // --- 6. villageEvent murder ---
  try { Game.villageEvent('murder'); ok('villageEvent murder runs', true); }
  catch (e) { fail++; console.log('FAIL villageEvent murder threw:', e.message); }

  // --- 7. trauma + sleep ---
  Game.state.scholar.trauma = 50;
  ok('trauma level', Game.traumaLevel() === 50);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
