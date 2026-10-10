#!/usr/bin/env node
// DPS ANCHOR SIM (2026-10-10): measure godhood-build DPS against wave-3/4/5
// draft bands, so the final numbers are ANCHORED to measured damage, not
// guessed (Steve 2026-10-09 call). Placeholder monsters are injected
// in-memory with draft bands; the real data file is written after.
//
// Two directions per matchup:
//   OFFENSE: player strikes every round -> player damage/round, rounds to kill
//   DEFENSE: player never strikes (study) -> monster damage/round vs player armor
// Each matchup runs FIGHTS_PER times; reported numbers are means.
//
// Run: SEED=N node scripts/sim-dps-anchor-20261010.js   (from repo root)
const H = require('./sim-harness.js');
const SEED = parseInt(process.env.SEED || '20261010', 10);
const FIGHTS_PER = 3;

// Draft bands from WAVE-3-5-DRAFT.md (placeholders — real data written after).
const PLACEHOLDERS = [
  // id, wave, dmgLo, dmgHi, hpLo, hpHi, pierce
  ['cancellation', 5, 70, 100, 400, 500, 0.6],
  ['editor', 5, 80, 110, 380, 480, 0.65],
  ['rerun', 5, 60, 90, 350, 450, 0.5],
  ['spoiler', 5, 75, 105, 320, 420, 0.55],
  ['timeslot', 5, 65, 95, 380, 460, 0.5],
  ['nielsen', 5, 50, 80, 300, 400, 0.4],
  ['finale', 5, 60, 85, 450, 550, 0.75],
  ['network_note', 5, 55, 80, 280, 360, 0.45],
  ['redactor', 3, 35, 55, 140, 180, 0.1],
  ['gavel', 3, 40, 60, 160, 200, 0.2],
  ['callback', 3, 30, 50, 120, 160, 0.25],
  ['congregation', 4, 50, 70, 220, 280, 0.3],
  ['reunion', 4, 60, 80, 280, 340, 0.45],
  ['eater', 4, 45, 75, 220, 300, 0.35],
];

function placeholderDef([id, wave, dlo, dhi, hlo, hhi, pierce]) {
  return {
    id, name: 'Anchor ' + id, wave, pierce,
    biomes: ['se_woodlands'], hp: [hlo, hhi],
    attack: { name: 'Anchor Strike', damage: [dlo, dhi], telegraph: 'telegraph', pattern: { type: 'direct' }, damageType: 'physical' },
    behavior: 'territorial', activity: 'both', aggression: 'territorial',
    follows: true, fear: 'fire', speed: 3, emoji: '👹',
    weaknesses: [], codexStages: { unknown: 'u', observed: 'o', slain: 's' },
  };
}

const grantAbility = (Game, id, level) => {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  if (!s.abilities.includes(id)) s.abilities.push(id);
  s.abilityLevels = s.abilityLevels || {};
  s.abilityLevels[id] = level == null ? 3 : level;
};

function endTurn(Game) {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p');
  if (!p) return;
  p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}

function buildBrawler(Game) {
  const s = Game.state.scholar;
  s.abilities = []; s.abilityLevels = {};
  for (const a of ['rage', 'second_wind', 'blood_magic', 'leech', 'adrenaline_control', 'cornered_rat']) grantAbility(Game, a, 3);
  s.equipped = {
    melee: { itemId: 'worldbreaker_maul', name: 'Worldbreaker Maul' },
    head: { itemId: 'alien_helm', name: 'Alien helm' },
    torso: { itemId: 'alien_carapace', name: 'Alien carapace' },
    legs: { itemId: 'alien_greaves', name: 'Alien greaves' },
    hands: { itemId: 'alien_gauntlets', name: 'Alien gauntlets' },
    shoes: { itemId: 'alien_boots', name: 'Alien boots' },
  };
  s.inventory = []; s.health = 9000; s.kcal = 99999;
}

function buildHunter(Game) {
  const s = Game.state.scholar;
  s.abilities = []; s.abilityLevels = {};
  for (const a of ['tracker', 'echo_location', 'patient_aim', 'dead_aim', 'game_sense', 'soft_step']) grantAbility(Game, a, 3);
  s.equipped = { ranged: { itemId: 'apex_bow', name: 'Apex Bow' } };
  s.inventory = [{ material: 'arrow', units: 999, name: 'Arrows' }];
  s.health = 9000; s.kcal = 99999;
}

function buildMid(Game) {
  const s = Game.state.scholar;
  s.abilities = []; s.abilityLevels = {};
  for (const a of ['patient_aim', 'dead_aim', 'tracker']) grantAbility(Game, a, 2);
  s.equipped = {
    melee: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' },
    torso: { itemId: 'hide_armor', name: 'Hide armor' },
    head: { itemId: 'skull_helm', name: 'Skull Helm' },
    shoes: { itemId: 'deep_earth_boots', name: 'Deep-earth boots' },
    hands: { itemId: 'rage_bindings', name: 'Rage Bindings' },
  };
  s.inventory = []; s.health = 9000; s.kcal = 99999;
}

function newFight(Game, id, buildFn) {
  buildFn(Game);
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4;
  Game.startCombat(id);
  if (!Game.tbfight) return null;
  const mf = Game.tbfight.fighters.find(f => f.kind === 'monster' && f.alive);
  return mf ? mf.key : null;
}

function endFight(Game) {
  if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; }
  Game.state.scholar.monster = null;
}

// OFFENSE: strike every round until dead or cap.
function fightOffense(Game, id, buildFn) {
  const mkey = newFight(Game, id, buildFn);
  if (!mkey) return { error: 'no fight' };
  const s = Game.state.scholar;
  let dealt = 0, rounds = 0, guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 100) {
    if (Game.tbIsPlayerTurn()) {
      const m = Game.tbFighter(mkey);
      const h0 = m ? m.hp : 0;
      try { Game.tbPlayerStrike(mkey); } catch (e) {}
      const m1 = Game.tbFighter(mkey);
      dealt += Math.max(0, h0 - (m1 ? m1.hp : 0));
      rounds++;
      endTurn(Game);
    } else {
      Game.tbAdvance();
    }
  }
  const m = Game.tbFighter(mkey);
  const dead = !m || !m.alive;
  const over = !Game.tbfight;
  endFight(Game);
  return { dpr: rounds ? dealt / rounds : 0, rounds, dead, over };
}

// DEFENSE: never strike; monster attacks resolve inside the player turn
// (tbAfterPlayerAction). Count player turns; mdpr = taken / playerTurns.
function fightDefense(Game, id, buildFn, maxTurns) {
  const mkey = newFight(Game, id, buildFn);
  if (!mkey) return { error: 'no fight' };
  const s = Game.state.scholar;
  const hStart = s.health;
  let turns = 0, guard = 0;
  while (Game.tbfight && !Game.tbfight.over && turns < (maxTurns || 24) && guard++ < 300) {
    if (Game.tbIsPlayerTurn()) {
      try { if (Game.tbPlayerStudy) Game.tbPlayerStudy(); } catch (e) {}
      const h0 = s.health;
      endTurn(Game);
      turns++;
      void h0;
    } else {
      Game.tbAdvance();
    }
  }
  const taken = Math.max(0, hStart - s.health);
  endFight(Game);
  return { mdpr: turns ? taken / turns : 0, turns, taken };
}

function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }

(async () => {
  const { Game } = await H.loadGame({ seed: SEED });
  await H.setupGame(Game);
  Game.say = () => {}; Game.sysSay = () => {};
  for (const p of PLACEHOLDERS) Game.data.monsters.push(placeholderDef(p));
  Game.depart();

  console.log('== DPS ANCHOR, SEED ' + SEED + ', ' + FIGHTS_PER + ' fights/matchup ==');

  // A. godhood brawler OFFENSE vs wave 5
  buildBrawler(Game);
  console.log(`\nA. GODHOOD BRAWLER offense (armor P=${Game.armorBonus()}):`);
  const aOff = {};
  for (const [id, wave] of PLACEHOLDERS.filter(p => p[1] === 5)) {
    const rs = [];
    for (let i = 0; i < FIGHTS_PER; i++) rs.push(fightOffense(Game, id, buildBrawler));
    const dpr = mean(rs.map(r => r.dpr)), rounds = mean(rs.map(r => r.rounds));
    const kills = rs.filter(r => r.dead).length;
    aOff[id] = { dpr, rounds };
    console.log(`  ${id}: ${dpr.toFixed(1)} dmg/round, kill in ${rounds.toFixed(1)} rounds (${kills}/${FIGHTS_PER} killed)`);
  }

  // B. godhood hunter OFFENSE vs 3 wave-5
  console.log('\nB. GODHOOD HUNTER offense:');
  for (const id of ['cancellation', 'finale', 'editor']) {
    const rs = [];
    for (let i = 0; i < FIGHTS_PER; i++) rs.push(fightOffense(Game, id, buildHunter));
    console.log(`  ${id}: ${mean(rs.map(r => r.dpr)).toFixed(1)} dmg/round, kill in ${mean(rs.map(r => r.rounds)).toFixed(1)} rounds (${rs.filter(r => r.dead).length}/${FIGHTS_PER} killed)`);
  }

  // C. godhood brawler DEFENSE vs wave 5 (monster damage through god armor)
  console.log('\nC. WAVE-5 offense vs GODHOOD armor:');
  for (const [id, wave] of PLACEHOLDERS.filter(p => p[1] === 5)) {
    const rs = [];
    for (let i = 0; i < FIGHTS_PER; i++) rs.push(fightDefense(Game, id, buildBrawler, 24));
    const P = (() => { buildBrawler(Game); return Game.armorBonus(); })();
    console.log(`  ${id}: monster ${mean(rs.map(r => r.mdpr)).toFixed(1)} dmg/round vs P=${P} (player took ${mean(rs.map(r => r.taken)).toFixed(0)} over ${mean(rs.map(r => r.turns)).toFixed(1)} rounds)`);
  }

  // D. mid build DEFENSE vs wave 3/4
  console.log('\nD. WAVE-3/4 offense vs MID build:');
  for (const [id, wave] of PLACEHOLDERS.filter(p => p[1] === 3 || p[1] === 4)) {
    const rs = [];
    for (let i = 0; i < FIGHTS_PER; i++) rs.push(fightDefense(Game, id, buildMid, 24));
    const P = (() => { buildMid(Game); return Game.armorBonus(); })();
    console.log(`  ${id} (w${wave}): monster ${mean(rs.map(r => r.mdpr)).toFixed(1)} dmg/round vs P=${P}`);
  }

  // E. godhood brawler OFFENSE vs wave 4 (how fast do gods clear w4?)
  console.log('\nE. GODHOOD BRAWLER offense vs WAVE 4:');
  for (const [id, wave] of PLACEHOLDERS.filter(p => p[1] === 4)) {
    const rs = [];
    for (let i = 0; i < FIGHTS_PER; i++) rs.push(fightOffense(Game, id, buildBrawler));
    console.log(`  ${id}: ${mean(rs.map(r => r.dpr)).toFixed(1)} dmg/round, kill in ${mean(rs.map(r => r.rounds)).toFixed(1)} rounds`);
  }

  // F. mid build OFFENSE vs wave 3 (can a mid build kill wave 3? how long?)
  console.log('\nF. MID BUILD offense vs WAVE 3:');
  buildMid(Game);
  console.log(`   mid armor P=${Game.armorBonus()}`);
  for (const [id, wave] of PLACEHOLDERS.filter(p => p[1] === 3)) {
    const rs = [];
    for (let i = 0; i < FIGHTS_PER; i++) rs.push(fightOffense(Game, id, buildMid));
    console.log(`  ${id}: ${mean(rs.map(r => r.dpr)).toFixed(1)} dmg/round, kill in ${mean(rs.map(r => r.rounds)).toFixed(1)} rounds (${rs.filter(r => r.dead).length}/${FIGHTS_PER} killed)`);
  }
  console.log('\nDONE');
})().catch(e => { console.error('SIM CRASH:', e.message); process.exit(1); });
