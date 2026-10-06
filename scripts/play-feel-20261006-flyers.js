#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-06): the three flyers, played AS A PLAYER.
//   NEVERMORE — spear. Read the lane, step OFF it, punish the landing. Is the
//     3-lane telegraph readable? Is the grounded window real? Can you kill it?
//   NIGHTCOURT — spear. Dodge the silent dive TWICE (the second hearing
//     re-aims). Does the double-dive feel fair or cheap? Is silence readable?
//   STATICKITE — sling + spear. Dodge the 3x3 mark, punish the dip. Can a
//     melee-only player kill it? Does the sling answer feel rewarding?
// Judge: playable + enjoyable? Distinct telegraphs? Phases visible on grid?
// Run: node scripts/play-feel-20261006-flyers.js
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

function note(t) { console.log(t); }
function P() { return Game.tbFighter('p'); }
function MON() { return (Game.tbfight ? Game.tbfight.fighters : []).find(x => x.kind === 'monster' && x.alive); }
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
// player brain: dodge telegraphs, punish grounded, ranged while airborne
function playerBrain() {
  const m = MON(), p = P();
  if (!m || !Game.tbIsPlayerTurn()) return;
  const d = Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my));
  const tg = m.telegraph;
  const logN = Game.log.length;
  const fresh = () => Game.log.slice(logN).join(' | ');
  if (tg && tg.cells && tg.cells.length) {
    const danger = new Set(tg.cells.map(c => c.cx + ',' + c.cy));
    if (danger.has(p.mx + ',' + p.my)) {
      // step off the threatened cells
      let best = null, bd = 1e9;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = p.mx + dx, ny = p.my + dy;
        if (nx < 1 || nx > 7 || ny < 1 || ny > 7) continue;
        if (danger.has(nx + ',' + ny)) continue;
        const dd = Math.abs(dx) + Math.abs(dy);
        if (dd < bd) { bd = dd; best = [nx, ny]; }
      }
      if (best) {
        const [tx, ty] = best;
        let guard = 8;
        while (guard-- > 0 && (p.mx !== tx || p.my !== ty) && p.moveLeft > 0 && Game.tbIsPlayerTurn()) {
          if (!Game.tbPlayerMove(p.mx + Math.sign(tx - p.mx), p.my + Math.sign(ty - p.my))) break;
        }
        note(`  YOU: dodge → (${p.mx},${p.my})`);
      }
    } else note('  YOU: hold (not threatened)');
    endTurn();
    return;
  }
  const airborne = Game.flyerAirborne(m);
  const w = Game.equippedWeapon();
  if (!airborne && d <= w.range && !p.acted) {
    const hp0 = m.hp;
    Game.tbPlayerStrike(m.key);
    note(`  YOU: strike (${w.name}) → dealt ${hp0 - m.hp}, monster hp ${m.hp}`);
    endTurn();
    return;
  }
  if (airborne && w.range >= 4 && d <= w.range && !p.acted) {
    const hp0 = m.hp;
    Game.tbPlayerStrike(m.key);
    note(`  YOU: ranged ${w.name} at high flyer → dealt ${hp0 - m.hp}, monster hp ${m.hp}`);
    endTurn();
    return;
  }
  // otherwise: close distance if grounded, hold if airborne
  if (!airborne && d > 1 && p.moveLeft > 0) {
    let guard = 6;
    while (guard-- > 0 && Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my)) > 1 && p.moveLeft > 0 && Game.tbIsPlayerTurn()) {
      const dx = Math.sign(m.mx - p.mx), dy = Math.sign(m.my - p.my);
      if (!Game.tbPlayerMove(p.mx + dx, p.my + dy)) break;
    }
    note(`  YOU: close in → (${p.mx},${p.my}) d=${Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my))}`);
  } else note(`  YOU: wait (airborne=${airborne}, d=${d})`);
  endTurn();
}
function newRun() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2000;
  s.abilities = []; s.backgroundAbilities = [];
  s.stats = s.stats || {}; s.stats.agi = 5;
  Game.dayPart = 1;
  Game.audio = {};
  return s;
}
function fight(mid, weapon, ammo, maxTurns, dayPart) {
  const s = newRun();
  if (dayPart !== undefined) Game.dayPart = dayPart;
  s.equipped = { weapon };
  if (ammo) s.inventory.push(Object.assign({ units: 20 }, ammo));
  s.mx = 4; s.my = 6;
  Game.startCombat(mid);
  const m = MON();
  note(`\n### ${m.name} — hp ${m.hp}, you: ${weapon.name}`);
  let turn = 0;
  const logAt = () => Game.log.length;
  let lastLog = logAt();
  while (Game.tbfight && !Game.tbfight.over && turn < maxTurns) {
    turn++;
    const mm = MON();
    if (!mm) break;
    note(`— turn ${turn}: monster ${mm.beamPhase || '?'}${mm.altitude ? '/' + mm.altitude : ''} @(${mm.mx},${mm.my}) hp=${mm.hp} | you @(${P().mx},${P().my}) hp=${Math.round(Game.state.scholar.health)}`);
    if (Game.tbIsPlayerTurn()) playerBrain();
    else endTurn();
    const fresh = Game.log.slice(lastLog).filter(l => !/^\s*$/.test(l));
    lastLog = logAt();
    for (const l of fresh.slice(-4)) note('    > ' + String(l).slice(0, 150));
    if (!MON()) break;
  }
  const dead = !MON();
  const over = Game.tbfight && Game.tbfight.over;
  note(`RESULT: ${dead ? 'MONSTER SLAIN' : over ? 'fight over: ' + Game.tbfight.result : 'STALEMATE after ' + turn + ' turns'} | your hp ${Math.round(Game.state.scholar.health)}`);
  return { dead, turn, hp: Math.round(Game.state.scholar.health) };
}

(async () => {
  await Game.init();
  Game.canSee = () => true;
  // teach the patterns so the coached cues show (2nd+ encounter feel)
  const teach = (id) => { try { const e = Game.ensureMonsterEntry(id); e.stage = 'observed'; e.attacksSeen = ['x']; } catch (err) {} };

  note('=== NEVERMORE (spear) — read the lane, punish the landing ===');
  teach('nevermore');
  const r1 = fight('nevermore', { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' }, null, 40);

  note('\n=== NIGHTCOURT (spear, night) — dodge twice ===');
  teach('nightcourt');
  const r2 = fight('nightcourt', { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' }, null, 40, 3);

  note('\n=== STATICKITE (sling + spear) — dodge the mark, punish the dip ===');
  teach('statickite');
  const s = newRun();
  s.equipped = { weapon: { itemId: 'sling', name: 'Sling' } };
  s.inventory.push({ material: 'stone', units: 20, name: 'stone' });
  s.mx = 4; s.my = 6;
  Game.startCombat('statickite');
  const m = MON();
  note(`\n### ${m.name} — hp ${m.hp}, you: Sling (then spear for the dip)`);
  let turn = 0, lastLog = Game.log.length, speared = false;
  while (Game.tbfight && !Game.tbfight.over && turn < 45) {
    turn++;
    const mm = MON();
    if (!mm) break;
    note(`— turn ${turn}: monster ${mm.beamPhase || '?'}${mm.altitude ? '/' + mm.altitude : ''} @(${mm.mx},${mm.my}) hp=${mm.hp} | you @(${P().mx},${P().my}) hp=${Math.round(Game.state.scholar.health)}`);
    // swap to spear when it dips
    if (mm.altitude === 'low' && !speared) {
      s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
      speared = true;
      note('  YOU: swap to spear — it dipped!');
    } else if (mm.altitude === 'high' && speared) {
      s.equipped = { weapon: { itemId: 'sling', name: 'Sling' } };
      speared = false;
      note('  YOU: swap to sling — it climbed.');
    }
    if (Game.tbIsPlayerTurn()) playerBrain();
    else endTurn();
    const fresh = Game.log.slice(lastLog).filter(l => !/^\s*$/.test(l));
    lastLog = Game.log.length;
    for (const l of fresh.slice(-4)) note('    > ' + String(l).slice(0, 150));
  }
  const dead3 = !MON();
  note(`RESULT: ${dead3 ? 'MONSTER SLAIN' : 'STALEMATE after ' + turn} | your hp ${Math.round(Game.state.scholar.health)}`);

  note('\n=== VERDICT ===');
  note(`nevermore: ${r1.dead ? 'killed' : 'not killed'} in ${r1.turn}t, player hp ${r1.hp}`);
  note(`nightcourt: ${r2.dead ? 'killed' : 'not killed'} in ${r2.turn}t, player hp ${r2.hp}`);
  note(`statickite: ${dead3 ? 'killed' : 'not killed'} in ${turn}t, player hp ${Math.round(Game.state.scholar.health)}`);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
