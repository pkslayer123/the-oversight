#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-06), HUNTER archetype — run 2, the night hunter.
// Fresh territory NOT covered by playtest-hunter-week.js / play-feel-20261006-hunter.js:
//   ACT 1: night_hunting skill education — do night stalks/strikes actually teach (L1 at 3 XP)?
//   ACT 2: the hushwolf at night WHILE hunting — the silence telegraph, wound-the-lead -> pack melts.
//   ACT 3: veteran-variant wave-2 loot rule — tier up to 3, never above, only after wave 2 unlocks.
//   ACT 4: trapline economics — net kcal/day of a trapline vs the time it costs.
// TURN HYGIENE: after the player action, advance ONLY if still the player's turn.
// Run: node scripts/play-feel-20261006-hunter2.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
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
async function fresh(opts) {
  Game.genDetail = () => flatGrid();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear', range: 2 } };
  s.insideHaven = false;
  s.mx = 4; s.my = 4;
  said.length = 0;
}

(async () => {
  await Game.init();
  const os = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); return os(t); };

  // ================= ACT 1: night hunter's education =================
  note('\n=== ACT 1: night stalk/strike teaches night_hunting (L1 at 3 XP) ===');
  await fresh();
  const s1 = Game.state.scholar;
  Game.dayPart = 3; // night
  note(`isNight: ${Game.isNight && Game.isNight()}`);
  s1.animal = { id: 'cottontail', name: 'Cottontail Rabbit', mx: 2, my: 2, pstate: 'graze', aware: 0, turns: 2, behavior: 'skittish' };
  const xpBefore = s1.nightHuntXP || 0;
  for (let i = 0; i < 4; i++) {
    s1.animal = { id: 'cottontail', name: 'Cottontail Rabbit', mx: 2, my: 2, pstate: 'graze', aware: 0, turns: 2, behavior: 'skittish' };
    s1.mx = 6; s1.my = 6; // keep distance so there's an actual stalk to do (dist>1,<=6)
    s1._signNoted = true; // skip the one-time sign note, not the practice
    Game.stalkAnimal();
    const xp = (s1.nightHuntXP || xpBefore); // stalkAnimal calls nightHuntPractice itself at night
    note(`  night stalk #${i + 1}: nightHuntXP=${xp}, skill=${Game.skillKnown && Game.skillKnown('night_hunting', 1) ? 'L1+' : 'none'}`);
  }
  check('night stalks accrue night_hunting XP', (s1.nightHuntXP || 0) > xpBefore);
  check('L1 night_hunting earned at 3 XP', Game.skillKnown('night_hunting', 1));
  // night strike bonus: night_huntBonus 0.2 at L2 — show the delta exists mechanically
  note(`  night_hunting L1=${Game.skillKnown('night_hunting', 1)} (bonus kicks in at L2/L3)`);

  // ================= ACT 2: the hushwolf at night =================
  note('\n=== ACT 2: hushwolf at night — the silence telegraph + wound-the-lead ===');
  await fresh();
  Game.dayPart = 3;
  const s2 = Game.state.scholar;
  s2.monster = { id: 'hushwolf', mx: 6, my: 4 };
  said.length = 0;
  Game.startCombat('hushwolf');
  const telegraph = said.join(' ').match(/silence|silent|holding its breath/i);
  note(`  telegraph heard: ${telegraph ? `"${telegraph[0]}..."` : '(NONE)'}`);
  check('silence telegraph fires at fight start', !!telegraph);
  const pack0 = monsters().length;
  const lead = monsters().find(m => m.wolfLead);
  note(`  pack size: ${pack0}, lead marked: ${!!lead}`);
  check('pack arrives as a pack (>=2)', pack0 >= 2);
  check('one wolf is marked lead', !!lead);
  // Player feel: survive the rush, wound the lead.
  let rounds = 0, leadWounded = false;
  heal();
  while (Game.tbfight && !Game.tbfight.over && rounds++ < 40) {
    if (Game.tbIsPlayerTurn()) {
      const ms = monsters();
      const target = ms.find(m => m.wolfLead) || ms[0];
      if (!target) break;
      moveAdjTo(target);
      strikeMonster(target.key);
      if (target.wolfBroken) leadWounded = true;
    } else Game.tbAdvance();
    heal(); // feel evaluation, not a death spiral test
  }
  note(`  fight ended after ${rounds} rounds (tbfight ${Game.tbfight ? 'present' : 'cleared'}), lead wounded: ${leadWounded}`);
  const packEnd = Game.tbfight ? monsters().length : 0;
  note(`  wolves still fighting at end: ${packEnd}`);
  check('fight resolves (tbfight clears on end)', !Game.tbfight || Game.tbfight.over);
  const meltSaid = said.join(' ').match(/melt|scatter|flee|whimper|break/i);
  note(`  pack-melt narration: ${meltSaid ? `"...${said.join(' ').slice(Math.max(0, said.join(' ').indexOf(meltSaid[0]) - 60), said.join(' ').indexOf(meltSaid[0]) + 60)}..."` : '(none found)'}`);

  // ================= ACT 3: veteran wave-2 loot rule =================
  note('\n=== ACT 3: veteran variant loot — tier cap 3, only after wave 2 unlocks ===');
  await fresh();
  const s3 = Game.state.scholar;
  s3.day = 8; Game.state.waveKills = { 1: 4 }; // unlockedWave() >= 2
  note(`  unlockedWave: ${Game.unlockedWave()}`);
  check('wave 2 unlocked for test', Game.unlockedWave() >= 2);
  // Force loot chance and run rollAlienLoot directly across variants.
  const vetTiers = [];
  const mdef = (Game.data.monsters || []).find(m => m.id === 'thornback_boar') || { loot: { chance: 1, tier: 2 }, wave: 1 };
  mdef.loot = { chance: 1, tier: 2 };
  for (const variant of [null, 'scarred', 'elder', 'pack-leader']) {
    const tiers = new Set();
    for (let i = 0; i < 60; i++) {
      const id = Game.rollAlienLoot(mdef, { veteran: !!variant, veteranVariant: variant });
      if (id) {
        const def = (Game.data.items || []).find(x => x.id === id);
        if (def) tiers.add(def.lootTier || 1);
      }
    }
    vetTiers.push([variant || 'base', [...tiers].sort().join(',') || 'none']);
    note(`  ${variant || 'base'} wave-1 (wave2 unlocked): dropped tiers {${[...tiers].sort().join(',') || 'none'}}`);
  }
  const vetMax = Math.max(...vetTiers.slice(1).map(t => parseInt(String(t[1]).split(',').pop() || '0')));
  check('veterans never drop above tier 3', vetMax <= 3);
  check('veterans can reach tier 3 (the bump is real)', vetMax >= 3);
  // Before wave 2 unlocks: veterans capped at tier 2 like base.
  s3.day = 1; Game.state.waveKills = {};
  const preTiers = new Set();
  for (let i = 0; i < 60; i++) {
    const id = Game.rollAlienLoot(mdef, { veteran: true, veteranVariant: 'elder' });
    if (id) { const def = (Game.data.items || []).find(x => x.id === id); if (def) preTiers.add(def.lootTier || 1); }
  }
  note(`  veteran wave-1 (wave1 only): dropped tiers {${[...preTiers].sort().join(',') || 'none'}}`);
  check('veterans pre-wave-2 capped at tier 2', Math.max(...[...preTiers], 0) <= 2);

  // ================= ACT 4: trapline economics =================
  note('\n=== ACT 4: trapline economics — 3 snares over 10 days ===');
  await fresh();
  const s4 = Game.state.scholar;
  Game.learnRecipe('snare', 2);
  s4.inventory.push({ material: 'vine', units: 40 }, { material: 'stick', units: 40 });
  let setCount = 0;
  for (const [tx, ty] of [[2, 2], [5, 5], [6, 3]]) {
    Game.craft('snare'); // each set consumes one crafted trap
    Game.map.px = tx; Game.map.py = ty;
    if (Game.setTrap('snare')) setCount++;
  }
  note(`  snares set: ${setCount}`);
  let catches = 0, kcalIn = 0;
  const days = 10;
  for (let d = 0; d < days; d++) {
    const invBefore = s4.inventory.length;
    try { Game.endDay(); } catch (e) { note('  endDay crashed: ' + e.message); break; }
    s4.kcal = 2400; s4.hydration = 100; s4.health = 500; if (Game.over) break;
    const newItems = s4.inventory.length - invBefore;
    if (newItems > 0) {
      for (let i = invBefore; i < s4.inventory.length; i++) {
        const it = s4.inventory[i];
        if (it && /carcass|trapped/i.test(it.name || '') && (it.hiddenKcal || it.kcalEach)) {
          catches++;
          kcalIn += (it.hiddenKcal || it.kcalEach || 0);
          note(`  day ${s4.day}: CAUGHT ${it.name} (${it.hiddenKcal || it.kcalEach} kcal)`);
        }
      }
    }
  }
  note(`  10 days, 3 snares: ${catches} catches, ${kcalIn} kcal raw`);
  note(`  snare cost: craft time + materials; dawn check is free (works while you sleep)`);
  const perDay = (kcalIn / days).toFixed(0);
  note(`  FEEL: ${perDay} kcal/day average raw from the trapline (~${(kcalIn * 0.6 / days).toFixed(0)} cooked-eatable/day)`);

  note('\n=== SUMMARY ===');
  const bad = results.filter(r => !r[1]);
  note(`${results.length - bad.length}/${results.length} checks passed${bad.length ? ` — FAILED: ${bad.map(b => b[0]).join('; ')}` : ''}`);
  console.log('\nDone.');
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
