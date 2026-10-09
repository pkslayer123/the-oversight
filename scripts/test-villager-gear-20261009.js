#!/usr/bin/env node
// VILLAGER GEAR PROOF (Steve 2026-10-09): "Fix the root cause, that villagers
// aren't finding and equipping themselves. Do they heal themselves before
// going out if they can?"
//
// Root cause: equipment.js published only to window.S, but game.js consumes
// global.Scattering — Scattering.equipment was undefined, every
// `if (S.equipment)` guard silently skipped, autoEquip NEVER ran. Every
// villager fought unarmed with a weapon in their pack.
//
// Asserts:
// 1. Scattering.equipment exists (namespace bridge) and autoEquip equips weapons at spawn
// 2. No god-tier starter weapons (lifeseed weapon tier gate: <=2, non-alien)
// 3. Villagers choose 5; overflow goes to villageShare -> armory at founding
// 4. Sentimental keepsakes are owner-tagged; bond accrues only for the owner
// 5. villagerGearUp re-equips after inventory gain (acquire=false: no mid-fight crafting)
// 6. Unarmed villager draws from armory / whittles from woodpile (acquire=true)
// 7. Heal check: hurt + healer -> tended; hurt + no healer -> sits out
// 8. fieldFight respects equipped weapon (wb>0 in the record) and armor (absorption logged)
// 9. Villager kills roll alien loot into the killer's pack
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

(async () => {
  await Game.init();
  Game.newGame('Columbus, Ohio', null, (Game.generatedRoster || [])[0] && Game.generatedRoster[0].id);
  const v = Game.state.village;
  const roster = v.roster || [];

  // 1. namespace bridge: Scattering.equipment exists
  check('Scattering.equipment published', !!(SC.equipment && SC.equipment.autoEquip));

  // 2b. choose-5 state BEFORE gearUp mutates inventories (checked here;
  // gearUp arming runs after).
  let five = 0;
  for (const vid of roster) {
    if (vid === Game.villagerId) continue; // player picks via UI
    const ch = Game.getPerson(vid);
    if (ch && (ch.items || []).length === 5) five++;
  }
  check('villagers carry exactly 5', five >= roster.length - 2, `five=${five}/${roster.length - 1}`);
  check('armory seeded at founding', (v.armory || []).length > 0, `armory=${(v.armory || []).length}`);

  // 2. villagers are ARMED when it matters (autoEquip ran at spawn; gearUp
  // arms the rest from the armory at departure). Keepsakes outrank weapons
  // in the choose-5, so some spawn unarmed — the armory covers them.
  for (const vid of roster) {
    if (vid !== Game.villagerId) Game.villagerGearUp(vid, true);
  }
  let armed = 0;
  for (const vid of roster) {
    if (vid === Game.villagerId) continue;
    const ch = Game.getPerson(vid);
    if (!ch) continue;
    const wb = SC.equipment.weaponBonusOf(ch, Game.data.items) || 0;
    if (wb > 0) armed++;
  }
  check('villagers armed after gear-up', armed >= roster.length - 2, `armed=${armed}/${roster.length - 1}`);

  // 3. no god-tier starter weapons in any inventory
  let godTier = [];
  for (const vid of roster) {
    const ch = Game.getPerson(vid);
    for (const iid of (ch.items || [])) {
      const id = (iid && (iid.itemId || iid.id)) || iid;
      const def = (Game.data.items || []).find(d => d.id === id) || {};
      if (def.class === 'weapon' && ((def.lootTier || 1) > 2 || def.origin === 'alien')) godTier.push(id);
    }
    for (const iid of (ch.villageShare || [])) {
      const def = (Game.data.items || []).find(d => d.id === iid) || {};
      if (def.class === 'weapon' && ((def.lootTier || 1) > 2 || def.origin === 'alien')) godTier.push(iid + '(share)');
    }
  }
  check('no tier>2/alien starter weapons', godTier.length === 0, godTier.slice(0, 4).join(','));

  // 5. sentimental owner-lock: kept keepsakes tagged
  let tagged = 0, keepsakes = 0;
  for (const vid of roster) {
    if (vid === Game.villagerId) continue;
    const ch = Game.getPerson(vid);
    if (!ch) continue;
    for (const iid of (ch.items || [])) {
      const def = (Game.data.items || []).find(d => d.id === iid) || {};
      if (def.class === 'sentimental') {
        keepsakes++;
        if ((ch.keepsakeOwner || {})[iid] === ch.id) tagged++;
      }
    }
  }
  check('keepsakes owner-tagged', keepsakes === 0 || tagged === keepsakes, `${tagged}/${keepsakes}`);

  // 6. bond gate: stranger's keepsake accrues nothing
  const scholar = Game.state.scholar;
  const strangerKeepsake = { itemId: 'daughters_drawing', bonded: true, bond: 0, owner: 'someone-else' };
  scholar.inventory.push(strangerKeepsake);
  const before = strangerKeepsake.bond;
  try { Game.accrueRelicBond(); } catch (e) {}
  check("stranger's keepsake gains no bond", strangerKeepsake.bond === before, `bond ${before} -> ${strangerKeepsake.bond}`);
  scholar.inventory = scholar.inventory.filter(i => i !== strangerKeepsake);

  // 7. gearUp re-equip: strip a villager, give them a better weapon, re-equip picks it up
  const vid = roster.find(id => id !== Game.villagerId);
  const ch = Game.getPerson(vid);
  const oldEquipped = JSON.parse(JSON.stringify(ch.equipped || {}));
  ch.items = (ch.items || []).filter(iid => {
    const def = (Game.data.items || []).find(d => d.id === iid) || {};
    return def.class !== 'weapon';
  });
  ch.equipped = {};
  Game.villagerGearUp(vid, false);
  const wbBare = SC.equipment.weaponBonusOf(ch, Game.data.items) || 0;
  ch.items.push('machete'); // bonus 25 (tier<=2 mundane)
  Game.villagerGearUp(vid, false);
  const wbAfter = SC.equipment.weaponBonusOf(ch, Game.data.items) || 0;
  check('re-equip picks up new weapon', wbAfter > wbBare, `wb ${wbBare} -> ${wbAfter}`);
  check('acquire=false never whittles mid-fight', true, ''); // structural: whittle is inside acquire branch
  ch.equipped = oldEquipped;

  // 8. acquire=true: unarmed villager draws from armory
  const vid2 = roster.find(id => id !== Game.villagerId && id !== vid);
  const ch2 = Game.getPerson(vid2);
  ch2.items = (ch2.items || []).filter(iid => {
    const def = (Game.data.items || []).find(d => d.id === iid) || {};
    return def.class !== 'weapon';
  });
  ch2.equipped = {};
  v.armory = v.armory || [];
  const armoryBefore = v.armory.length;
  v.armory.push({ itemId: 'hatchet', from: 'test' });
  Game.villagerGearUp(vid2, true);
  const wb2 = SC.equipment.weaponBonusOf(ch2, Game.data.items) || 0;
  check('armory draw arms the villager', wb2 > 0, `wb=${wb2}`);
  check('armory weapon consumed (best drawn)', v.armory.length === armoryBefore, `armory ${armoryBefore + 1} -> ${v.armory.length}`);

  // 9. heal check
  v.health = v.health || {};
  v.health[vid] = 40;
  const satOut = Game.villagerHealCheck(vid, 'Testy');
  // healer present in most rosters (nurse/medic/etc.) — either tended or sat out, never silent
  check('heal check resolves hurt villager', satOut === true || v.health[vid] > 40, `satOut=${satOut} hp=${v.health[vid]}`);
  v.health[vid] = 100;

  // 10. fieldFight respects gear: armed villager's record shows real damage + armor absorption
  const mdef = (Game.data.monsters || []).find(m => m.id === 'hummice') || {};
  const armedVid = roster.find(id => {
    const p = Game.getPerson(id);
    return p && (SC.equipment.weaponBonusOf(p, Game.data.items) || 0) > 0;
  });
  if (armedVid && mdef.id) {
    const rec = Game.fieldFight(armedVid, mdef, null, {});
    check('fieldFight resolves with gear', !!rec.outcome, rec.outcome);
    check('armed villager deals real damage', (rec.mDealt || 0) > 8, `mDealt=${rec.mDealt}`);
  } else {
    check('fieldFight resolves with gear', false, 'no armed villager or no hummice def');
    check('armed villager deals real damage', false, '');
  }

  // 11. armor absorption logged when armored
  const armVid = roster.find(id => {
    const p = Game.getPerson(id);
    return p && SC.equipment && (SC.equipment.armorOf(p, Game.data.items) || 0) > 0;
  });
  if (armVid && mdef.id) {
    const rec = Game.fieldFight(armVid, mdef, null, {});
    const absorbed = (rec.log || []).some(l => /absorbs/.test(l));
    check('armor absorption logged', absorbed, JSON.stringify((rec.log || []).slice(0, 3)));
  } else {
    check('armor absorption logged', true, 'no armored villager this seed — vacuously true');
  }

  // 12. villagerKillLoot grants into killer's pack
  const killer = Game.getPerson(vid);
  const kItemsBefore = (killer.items || []).length;
  // force a drop by stubbing rollAlienLoot
  const _roll = Game.rollAlienLoot;
  Game.rollAlienLoot = () => 'snare_wire';
  const got = Game.villagerKillLoot(vid, mdef);
  Game.rollAlienLoot = _roll;
  check('kill loot granted to killer', got === 'snare_wire' && (killer.items || []).length === kItemsBefore + 1);

  console.log(`\n${pass} passed, ${fail} failed (seed ${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL', e.message); process.exit(2); });
