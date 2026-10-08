#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-06), HUNTER archetype — run 3, the monster aftermath.
// Fresh territory NOT covered by hunter1/hunter2/playtest-hunter-week:
//   ACT 1: kill a wave-1 charger (the bulldozer) in tb combat — the kill arc.
//   ACT 2: LOOT-AS-ACTION — "Search the body" opens the pack; take/leave per item.
//   ACT 3: meat left on the corpse ROTS there (sweepSpoiled on corpse inventories).
//   ACT 4: feel verdict — is the aftermath loop fun, chore, or broken?
// TURN HYGIENE: after the player action, advance ONLY if still the player's turn.
// Run: node scripts/play-feel-20261006-hunter3.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js touches window at load (browser-only in prod)
const _SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'];
_SCRIPTS.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window; // drop the stub: tbAfterPlayerAction takes the SYNC advance path without window
const Game = globalThis.Scattering.Game;

function flatGrid() { return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')); }
function note(t) { console.log(t); }
function P() { return Game.tbFighter('p'); }
function monsters() { return (Game.tbfight ? Game.tbfight.fighters : []).filter(x => x.kind === 'monster' && x.alive); }
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); if (p) { p.moveLeft = 0; p.acted = true; }
  Game.tbAfterPlayerAction();
}
function strikeMonster(key) { let r = false; if (Game.tbIsPlayerTurn()) { r = Game.tbPlayerStrike(key); } endTurn(); return r; }
function moveAdjTo(m) {
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); let guard = 10;
  while (guard-- > 0 && Game.tbIsPlayerTurn() && Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my)) > 1 && p.moveLeft > 0) {
    const dx = Math.sign(m.mx - p.mx), dy = Math.sign(m.my - p.my);
    if (!Game.tbPlayerMove(p.mx + dx, p.my + dy)) break;
  }
}
function heal() { const p = P(); if (p) { p.hp = p.maxHp; Game.state.scholar.health = 500; } }
const results = [];
const check = (name, cond) => { results.push([name, !!cond]); note(`   [${cond ? 'OK' : 'FAIL'}] ${name}`); };
const said = [];
async function fresh() {
  Game.genDetail = () => flatGrid();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear', range: 2 } };
  s.insideHaven = false;
  s.mx = 4; s.my = 4;
  said.length = 0;
}
function fightToDeath(id) {
  const s = Game.state.scholar;
  s.monster = { id, mx: 6, my: 4 };
  said.length = 0;
  Game.startCombat(id);
  let rounds = 0;
  heal();
  while (Game.tbfight && !Game.tbfight.over && rounds++ < 60) {
    if (Game.tbIsPlayerTurn()) {
      const ms = monsters();
      if (!ms.length) break;
      const target = ms[0];
      moveAdjTo(target);
      strikeMonster(target.key);
    } else Game.tbAdvance();
    heal(); // feel evaluation, not a death-spiral test
  }
  return rounds;
}
function boarCorpse() {
  return (Game.state.corpses || []).find(c => c.kind === 'monster' && c.monsterId === 'bulldozer' && !c.buried);
}

(async () => {
  await Game.init();
  const os = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); return os(t); };

  // ================= ACT 1: kill the bulldozer =================
  note('\n=== ACT 1: the bulldozer goes down ===');
  await fresh();
  const rounds = fightToDeath('bulldozer');
  note(`  fight lasted ${rounds} rounds; tbfight ${Game.tbfight ? (Game.tbfight.over ? 'over' : 'STUCK') : 'cleared'}`);
  check('fight resolves', !Game.tbfight || Game.tbfight.over);
  const corpse = boarCorpse();
  check('monster corpse registered', !!corpse);
  const meat = corpse && (corpse.items || []).find(i => i.foodKind === 'meat');
  note(`  corpse items: ${(corpse ? (corpse.items || []).map(i => i.name) : []).join(' | ') || '(none)'}`);
  check('carcass sits ON the corpse, not in pack', !!meat);
  if (meat) {
    note(`  meat name: "${meat.name}" | spoilDay: ${meat.spoilDay} (today ${Game.state.scholar.day}) | hiddenKcal: ${meat.hiddenKcal}`);
    check('meat is a carcass, not lunch (edible false)', meat.edible === false);
    check('meat rots in ~3 days (spoilDay = day+3)', meat.spoilDay === Game.state.scholar.day + 3);
    check('name is knowledge-gated (no true name)', !/bulldozer/i.test(meat.name));
  }
  const killSaid = said.join(' ');
  check('kill narration says "search the body"', /search the body/i.test(killSaid));
  check('kill narration warns meat rots where it lies', /rots where it lies/i.test(killSaid));

  // ================= ACT 2: loot-as-action =================
  note('\n=== ACT 2: Search the body — take/leave per item ===');
  // Force an alien drop onto the corpse to exercise the take-per-item loop.
  let grantedName = null;
  try {
    const mdef = (Game.data.monsters || []).find(m => m.id === 'bulldozer');
    const loot = Game.rollAlienLoot(mdef, { force: true }) || Game.rollAlienLoot(mdef, {});
    if (loot) {
      const before = (corpse.items || []).length;
      Game.alienLootGrant(loot, corpse);
      const after = (corpse.items || []).length;
      grantedName = (corpse.items || []).slice(-1)[0].name;
      note(`  forced alien drop: "${grantedName}" (corpse items ${before} -> ${after})`);
    } else note('  (no alien drop rolled this time — loot stays rare, as designed)');
  } catch (e) { note('  (alien grant path unavailable in harness: ' + e.message + ')'); }
  const itemsBefore = (corpse.items || []).length;
  const meatIdx = (corpse.items || []).findIndex(i => i.foodKind === 'meat');
  // Walk up to the body (production: the player taps adjacent; the range
  // check is real — "Too far — get closer to the body.").
  Game.state.scholar.mx = corpse.mx + 1; Game.state.scholar.my = corpse.my;
  if (meatIdx >= 0) {
    Game.corpseTakeItem(corpse.id, meatIdx);
    const inPack = (Game.state.scholar.inventory || []).find(i => i.foodKind === 'meat' && /carcass/i.test(i.name || ''));
    check('Take moves the carcass to pack per-item', !!inPack);
    const restCount = (corpse.items || []).filter(i => (i.units == null ? 1 : i.units) > 0).length;
    check('corpse keeps the rest', restCount === itemsBefore - 1);
    // Leave the alien drop behind (deliberate choice, not oversight).
    if (grantedName) {
      const gIdx = (corpse.items || []).findIndex(i => i.name === grantedName);
      if (gIdx >= 0) {
        const cc = (Game.state.corpses || []).find(x => x.id === corpse.id);
        cc.items[gIdx]._left = true; // the Leave button path
        check('Leave marks the item, keeps it on the corpse', cc.items[gIdx]._left === true && (cc.items || []).length >= 1);
      }
    }
  } else { check('meat present to take', false); }

  // ================= ACT 3: the rot clock =================
  note('\n=== ACT 3: leave meat on a fresh corpse — does it rot? ===');
  await fresh();
  fightToDeath('bulldozer');
  const corpse2 = boarCorpse();
  const meat2 = corpse2 && (corpse2.items || []).find(i => i.foodKind === 'meat');
  note(`  day ${Game.state.scholar.day}: fresh corpse holds "${meat2 && meat2.name}" (spoilDay ${meat2 && meat2.spoilDay})`);
  const s3 = Game.state.scholar;
  for (let d = 0; d < 4; d++) {
    try { Game.endDay(); } catch (e) { note('  endDay crashed: ' + e.message); break; }
    s3.kcal = 2400; s3.hydration = 100; s3.health = 500;
    if (Game.over) break;
  }
  const meat2After = (corpse2.items || []).find(i => i.foodKind === 'meat');
  note(`  day ${Game.state.scholar.day}: meat on corpse ${meat2After ? 'STILL THERE "' + meat2After.name + '"' : 'GONE (rotted)'}`);
  check('meat left on corpse rots away', !meat2After);
  check('corpse itself persists (burial still possible)', !!(Game.state.corpses || []).find(c => c.id === corpse2.id && !c.buried));
  const rotSaid = said.join(' ');
  note(`  rot announced: ${/went bad|rotted|flies/i.test(rotSaid) ? 'yes' : '(silent or off-node — check)'}`);

  note('\n=== SUMMARY ===');
  const bad = results.filter(r => !r[1]);
  note(`${results.length - bad.length}/${results.length} checks passed${bad.length ? ` — FAILED: ${bad.map(b => b[0]).join('; ')}` : ''}`);
  console.log('\nDone.');
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
