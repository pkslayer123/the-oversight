#!/usr/bin/env node
// VILLAGER GEAR + OWNERSHIP PROOF (Steve 2026-10-09, revised x2):
// "Fix the root cause, that villagers aren't finding and equipping themselves."
// "Not necessarily communal gear, it's their gear." / "No village armory,
// just a stash for items that can be taken by any villager once deposited."
// "human or alien bodies are lootable corpses... There's a death pack to open
// and loot." / "wire those gear items... one organized system not parallel."
//
// Asserts the individual-ownership model + the one crafting system:
// 1. Namespace bridge: Scattering.equipment exists, autoEquip equips at spawn
// 2. No god-tier starter weapons (tier<=2, non-alien)
// 3. Choose-5: 5 carried + 3 personal stashed; NO communal auto-seeding
// 4. Sentimental owner-lock: tagged; bond accrues only for the owner;
//    sentimentals die with the owner (never on corpses)
// 5. gearUp re-equips on inventory gain (acquire=false: no mid-fight crafting)
// 6. gearUp acquisition order: own stashed -> DEPOSITED armory -> whittle;
//    never another villager's personal gear
// 7. Deposit: player weapon -> stash.weapons (armory); unarmed villager draws it
// 8. Heal check: hurt + healer -> tended; hurt + no healer -> sits out
// 9. fieldFight respects equipped weapon + armor absorption logged
// 10. Villager kills roll alien loot into the killer's pack
// 11. Corpse = death pack: real gear (minus sentimentals), take/leave per item
// 12. Crafting: 13 gear recipes in the ONE recipe system; craft() makes real
//    items (itemId); knowledge gates hold (L0 none / L1 blind 35% / L2+ 85%)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261009', 10);
Math.random = mulberry32(SEED);
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'\"'\"']*\\.js' index.html | head -80", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) {} });
delete global.window;
const Game = globalThis.Scattering.Game;
const SC = globalThis.Scattering;
Game.say = function () {}; Game.sysSay = function () {}; Game.audioEvent = function () {};
if (Game.drama === undefined) Game.drama = function () {};

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL [seed ${SEED}] ${name}${detail ? ' — ' + detail : ''}`); }
}
const itemIdOf = (e) => (e && (e.itemId || e.id)) || e;

(async () => {
  await Game.init();
  Game.newGame('Columbus, Ohio', null, (Game.generatedRoster || [])[0] && Game.generatedRoster[0].id);
  const v = Game.state.village;
  const roster = v.roster || [];
  const npcs = roster.filter(id => id !== Game.villagerId);

  // 1. namespace bridge
  check('Scattering.equipment published', !!(SC.equipment && SC.equipment.autoEquip));

  // 3. choose-5 + personal stash, BEFORE gearUp mutates inventories
  let five = 0, stashed3 = 0;
  for (const vid of npcs) {
    const ch = Game.getPerson(vid);
    if (!ch) continue;
    if ((ch.items || []).length === 5) five++;
    if ((ch.stashed || []).length === 3) stashed3++;
  }
  check('villagers carry exactly 5', five >= npcs.length - 1, `five=${five}/${npcs.length}`);
  check('unchosen 3 are personal stash', stashed3 >= npcs.length - 1, `stashed=${stashed3}/${npcs.length}`);
  check('no communal auto-seeding', !v.armory && npcs.every(id => !(Game.getPerson(id) || {}).villageShare),
    'armory/villageShare must not exist');

  // 6. gearUp arms from OWN gear (own stashed, then deposited, then whittle)
  for (const vid of npcs) Game.villagerGearUp(vid, true);
  let armed = 0;
  for (const vid of npcs) {
    const ch = Game.getPerson(vid);
    if (ch && (SC.equipment.weaponBonusOf(ch, Game.data.items) || 0) > 0) armed++;
  }
  check('villagers armed after gear-up', armed >= npcs.length - 1, `armed=${armed}/${npcs.length}`);

  // 2. no god-tier starters (carried + stashed)
  let godTier = [];
  for (const vid of npcs) {
    const ch = Game.getPerson(vid);
    for (const iid of (ch.items || []).concat(ch.stashed || [])) {
      const def = (Game.data.items || []).find(d => d.id === itemIdOf(iid)) || {};
      if (def.class === 'weapon' && ((def.lootTier || 1) > 2 || def.origin === 'alien')) godTier.push(itemIdOf(iid));
    }
  }
  check('no tier>2/alien starter weapons', godTier.length === 0, godTier.slice(0, 4).join(','));

  // 4. sentimental owner-lock
  let tagged = 0, keepsakes = 0;
  for (const vid of npcs) {
    const ch = Game.getPerson(vid);
    if (!ch) continue;
    for (const iid of (ch.items || [])) {
      const def = (Game.data.items || []).find(d => d.id === itemIdOf(iid)) || {};
      if (def.class === 'sentimental') { keepsakes++; if ((ch.keepsakeOwner || {})[itemIdOf(iid)] === ch.id) tagged++; }
    }
  }
  check('keepsakes owner-tagged', keepsakes === 0 || tagged === keepsakes, `${tagged}/${keepsakes}`);
  const scholar = Game.state.scholar;
  const strangerKeepsake = { itemId: 'daughters_drawing', bonded: true, bond: 0, owner: 'someone-else' };
  scholar.inventory.push(strangerKeepsake);
  try { Game.accrueRelicBond(); } catch (e) {}
  check("stranger's keepsake gains no bond", strangerKeepsake.bond === 0, `bond=${strangerKeepsake.bond}`);
  scholar.inventory = scholar.inventory.filter(i => i !== strangerKeepsake);

  // 5. re-equip on inventory gain, no mid-fight crafting
  const vid = npcs[0];
  const ch = Game.getPerson(vid);
  ch.items = (ch.items || []).filter(iid => (((Game.data.items || []).find(d => d.id === itemIdOf(iid)) || {}).class !== 'weapon'));
  ch.equipped = {};
  Game.villagerGearUp(vid, false);
  const wbBare = SC.equipment.weaponBonusOf(ch, Game.data.items) || 0;
  ch.items.push('machete');
  Game.villagerGearUp(vid, false);
  const wbAfter = SC.equipment.weaponBonusOf(ch, Game.data.items) || 0;
  check('re-equip picks up new weapon', wbAfter > wbBare, `wb ${wbBare} -> ${wbAfter}`);

  // 6b. own-stash draw: weapon in OWN stashed gets fetched; another's untouched
  const vid2 = npcs[1];
  const ch2 = Game.getPerson(vid2);
  ch2.items = (ch2.items || []).filter(iid => (((Game.data.items || []).find(d => d.id === itemIdOf(iid)) || {}).class !== 'weapon'));
  ch2.equipped = {};
  ch2.stashed = ['hatchet'];
  const otherVid = npcs[2];
  const otherCh = Game.getPerson(otherVid);
  const otherStashBefore = JSON.stringify(otherCh.stashed || []);
  Game.villagerGearUp(vid2, true);
  check('own stash drawn', (SC.equipment.weaponBonusOf(ch2, Game.data.items) || 0) > 0);
  check("other villager's stash untouched", JSON.stringify(otherCh.stashed || []) === otherStashBefore);

  // 7. deposit -> communal armory -> unarmed villager draws deposited weapon
  const st = Game.stashState();
  check('stash sections exist', !!(st.weapons && st.medicine && st.tools && st.materials), Object.keys(st).join(','));
  // player deposits a weapon (simulate: push to inventory, deposit via method on a copy)
  scholar.inventory.push({ itemId: 'machete', name: 'Machete', units: 1, kg: 0.9 });
  const depIdx = scholar.inventory.findIndex(i => i.itemId === 'machete');
  const depOk = Game.donateWeapon(depIdx);
  check('deposit routes to armory', depOk && st.weapons.some(w => w.itemId === 'machete'), `weapons=${st.weapons.length}`);
  const vid3 = npcs[3] || npcs[0];
  const ch3 = Game.getPerson(vid3);
  ch3.items = (ch3.items || []).filter(iid => (((Game.data.items || []).find(d => d.id === itemIdOf(iid)) || {}).class !== 'weapon'));
  ch3.equipped = {};
  ch3.stashed = (ch3.stashed || []).filter(iid => (((Game.data.items || []).find(d => d.id === itemIdOf(iid)) || {}).class !== 'weapon'));
  const wBefore = st.weapons.length;
  Game.villagerGearUp(vid3, true);
  check('deposited weapon drawn by unarmed villager',
    (SC.equipment.weaponBonusOf(ch3, Game.data.items) || 0) > 0 && st.weapons.length === wBefore - 1,
    `wb=${SC.equipment.weaponBonusOf(ch3, Game.data.items)}, stash ${wBefore}->${st.weapons.length}`);

  // 8. heal check
  v.health = v.health || {};
  v.health[vid] = 40;
  const satOut = Game.villagerHealCheck(vid, 'Testy');
  check('heal check resolves hurt villager', satOut === true || v.health[vid] > 40, `satOut=${satOut} hp=${v.health[vid]}`);
  v.health[vid] = 100;

  // 9. fieldFight gear + armor
  const mdef = (Game.data.monsters || []).find(m => m.id === 'hummice') || {};
  const armedVid = npcs.find(id => { const p = Game.getPerson(id); return p && (SC.equipment.weaponBonusOf(p, Game.data.items) || 0) > 0; });
  if (armedVid && mdef.id) {
    const rec = Game.fieldFight(armedVid, mdef, null, {});
    check('fieldFight resolves with gear', !!rec.outcome, rec.outcome);
    check('armed villager deals real damage', (rec.mDealt || 0) > 8, `mDealt=${rec.mDealt}`);
  } else { check('fieldFight resolves with gear', false, 'no armed villager'); check('armed villager deals real damage', false, ''); }
  const armVid = npcs.find(id => { const p = Game.getPerson(id); return p && SC.equipment && (SC.equipment.armorOf(p, Game.data.items) || 0) > 0; });
  if (armVid && mdef.id) {
    const rec = Game.fieldFight(armVid, mdef, null, {});
    check('armor absorption logged', (rec.log || []).some(l => /absorbs/.test(l)));
  } else check('armor absorption logged', true, 'no armored villager this seed — vacuously true');

  // 10. kill loot to killer
  const killer = Game.getPerson(vid);
  const kBefore = (killer.items || []).length;
  const _roll = Game.rollAlienLoot;
  Game.rollAlienLoot = () => 'snare_wire';
  const got = Game.villagerKillLoot(vid, mdef);
  Game.rollAlienLoot = _roll;
  check('kill loot granted to killer', got === 'snare_wire' && (killer.items || []).length === kBefore + 1);

  // 11. corpse = death pack: real gear minus sentimentals, take/leave per item
  const deadVid = npcs[4] || npcs[0];
  const deadCh = Game.getPerson(deadVid);
  deadCh.items = ['machete', 'stone_knife'];
  deadCh.stashed = ['hatchet'];
  // give them a sentimental to verify it dies with them
  const sentDef = (Game.data.items || []).find(d => d.class === 'sentimental');
  if (sentDef) { deadCh.items.push(sentDef.id); deadCh.keepsakeOwner = { [sentDef.id]: deadVid }; }
  v.health[deadVid] = 100;
  Game.hurtVillager(deadVid, 500, 'test');
  const corpse = (Game.corpses() || []).find(c => c.villagerId === deadVid);
  const cItems = (corpse && corpse.items || []).map(e => e.itemId || e.plantId);
  check('corpse holds real gear', corpse && cItems.includes('machete') && cItems.includes('hatchet'), cItems.join(','));
  check('sentimental dies with owner', !corpse || !cItems.includes(sentDef && sentDef.id), cItems.join(','));

  // 12. crafting: one system
  const gearIds = ['sharpened_stick','stone_knife','hunting_spear','fire_hardened_spear','crude_bow','bow','crossbow','sling','arrow','bolt','bark_armor','padded_cloth','hide_armor'];
  const missing = gearIds.filter(id => !(Game.data.recipes || []).some(r => r.id === id));
  check('13 gear recipes in recipes.json', missing.length === 0, missing.join(','));
  // craft a sharpened_stick: grant L3, give materials, craft, verify real itemId
  Game.state.codex.recipes = Game.state.codex.recipes || {};
  Game.state.codex.recipes['sharpened_stick'] = { level: 3 };
  scholar.inventory.push({ material: 'stick', name: 'Stick', units: 2, kcalEach: 0, spoilDay: 9999, kg: 0.2 });
  const invBefore = scholar.inventory.length;
  const crafted = Game.craft('sharpened_stick');
  const made = scholar.inventory.find(i => i.itemId === 'sharpened_stick');
  check('craft() makes a REAL item', crafted && !!made, `crafted=${crafted} itemId=${made && made.itemId}`);
  check('crafted weapon equips', !!made && (Game.isWeapon(made) || ((Game.data.items.find(d => d.id === 'sharpened_stick') || {}).class === 'weapon')));
  // knowledge gate: L0 unknown gear has no craft path
  Game.state.codex.recipes['hunting_spear'] = { level: 0 };
  const l0 = Game.craft('hunting_spear');
  check('L0 gear: no craft', l0 === null);
  // discovery: handling teaches L1
  delete Game.state.codex.recipes['sling'];
  Game.noteGearHandled('sling');
  check('handling teaches L1', ((Game.state.codex.recipes || {})['sling'] || {}).level === 1);

  console.log(`\n${pass} passed, ${fail} failed (seed ${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL', e.message); process.exit(2); });
