#!/usr/bin/env node
// COMBAT BREAK-IT round 2: multi-kill reward payout (Steve 2026-10-08).
// Attack: tbEnd('won') paid carcass + alien-loot + codex-'slain' ONCE per
// fight, on the first monster fighter — pack fights left the other corpses
// barren and never marked their species slain. corpseForKill's node+species
// search also misfiled same-species kills onto one corpse.
// Fix: per-creature rewards (snake segments share one body per snakeId);
// the corpse registered at kill time is stashed on the fighter (_deathCorpse)
// and preferred by corpseForKill.
const H = require('./combat-break-harness.js');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

function addMonster(Game, key, monId, mhp, extra) {
  const mdef = Game.data.monsters.find(m => m.id === monId);
  const f = {
    key, kind: 'monster', monsterId: monId, mdef, name: 'TestMonster', emoji: '👹',
    hp: mhp, maxHp: mhp, speed: 3, mx: 6, my: 4,
    alive: true, fled: false, telegraph: null, hesitate: 0, blind: 0, stunned: 0,
  };
  Object.assign(f, extra || {});
  Game.tbfight.fighters.push(f);
  Game.tbfight.fightersByKey[key] = f;
  Game.tbfight.order.push(key);
  return f;
}
function carcasses(Game) {
  const out = [];
  for (const c of (Game.corpses ? Game.corpses() : [])) {
    for (const it of (c.items || [])) if (it.foodState === 'carcass') out.push({ corpse: c.id, plantId: it.plantId });
  }
  return out;
}

(async () => {
  const Game = await H.newCombatReadyGame();
  const s = Game.state.scholar;

  console.log('--- M1. three kills, two species -> three carcasses, both species slain ---');
  const mk = H.synthFight(Game, 'bulldozer', { mhp: 30, php: 100 });
  addMonster(Game, 'm_b2', 'bulldozer', 30);
  addMonster(Game, 'm_bt', 'belltoad', 20);
  // force loot rolls to hit so the per-kill loot path is exercised
  for (const id of ['bulldozer', 'belltoad']) {
    const md = Game.data.monsters.find(m => m.id === id);
    if (md && md.loot) md.loot.chance = 1;
  }
  for (const k of [mk, 'm_b2', 'm_bt']) Game.tbDamage(k, 9999, 'you');
  check('M1 all three dead', [mk, 'm_b2', 'm_bt'].every(k => !Game.tbFighter(k).alive));
  Game.tbEnd('won');
  const car = carcasses(Game);
  check('M1 three carcasses (one per kill)', car.length === 3, `carcasses=${car.length}`);
  const byCorpse = {};
  for (const c of car) byCorpse[c.corpse] = (byCorpse[c.corpse] || 0) + 1;
  check('M1 carcasses spread across corpses (no misfiling)', Object.keys(byCorpse).length === 3,
    JSON.stringify(byCorpse));
  const cx = Game.state.codex.monsters || {};
  check('M1 bulldozer marked slain', cx.bulldozer && cx.bulldozer.stage === 'slain');
  check('M1 belltoad marked slain', cx.belltoad && cx.belltoad.stage === 'slain');
  let lootDrops = 0;
  for (const c of (Game.corpses ? Game.corpses() : [])) {
    for (const it of (c.items || [])) if (it.alienLoot) lootDrops++;
  }
  check('M1 loot rolled per kill (3 drops at forced chance)', lootDrops === 3, `drops=${lootDrops}`);

  console.log('--- M2. snake segments share one body ---');
  const mk2 = H.synthFight(Game, 'bulldozer', { mhp: 30, php: 100 });
  const snakeMdef = Object.assign({}, Game.data.monsters.find(m => m.id === 'bulldozer'), { snake: { segments: 3 } });
  const before = carcasses(Game).length;
  for (let i = 0; i < 3; i++) addMonster(Game, 'm_seg' + i, 'bulldozer', 30, { snakeId: 'snake_test', segmentIndex: i, mdef: snakeMdef });
  for (const k of ['m_seg0', 'm_seg1', 'm_seg2']) Game.tbDamage(k, 9999, 'you');
  Game.tbFighter(mk2).alive = false; Game.tbFighter(mk2).hp = 0;
  Game.tbEnd('won');
  const after = carcasses(Game).length;
  // 1 snake body + 1 bulldozer body = 2 new carcasses (not 4)
  check('M2 one carcass per snake (segments share)', after - before === 2, `new carcasses=${after - before}`);

  console.log('--- M3. single kill unchanged ---');
  const mk3 = H.synthFight(Game, 'bulldozer', { mhp: 30, php: 100 });
  const b3 = carcasses(Game).length;
  Game.tbDamage(mk3, 9999, 'you');
  Game.tbEnd('won');
  check('M3 single kill -> single carcass', carcasses(Game).length - b3 === 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
