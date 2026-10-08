#!/usr/bin/env node
// Dive-declare reachability — design-pass proof (Steve 2026-10-07 "figure it
// out yourself", executed 2026-10-08).
//
// DESIGN DECISION (documented here and in the commit message):
// The glasswing's in-combat dive declare (circle -> dive, target-aware
// coaching, codex-gated knownCue, shadow grid telegraph — fleshed to
// Highbeam Deer level in 2ed99bd) was UNREACHABLE in natural play. Confirmed
// by code reading, not assumed from the run note:
//   1. In the world, a glasswing within 5 tiles VANISHES and sets gwTrap
//      (monsterTurn). The trap resolves after 3 action-ticks.
//   2. Trap HIT -> combat opens with the darter already GROUNDED
//      (gwGrounded=3); when the window ended it ESCAPED — never re-circled.
//   3. Trap MISS -> the darter just left; no combat at all.
//   4. No other natural path starts combat in circle/stalk phase (player
//      melee is 1 tile; the trap intercepts at <=5 first).
// So the whole circle->dive->grounded loop and its coaching only ever fired
// in debug-seeded tests.
//
// THE FIX (src/js/game.js, glasswing grounded branch only): when the
// grounded window ends, the darter CLIMBS and RE-CIRCLES instead of
// escaping — it climbs a couple tiles out so the circling reads honestly
// on the grid, then the declare fires when it closes back within dive
// range. Rationale:
//   - The block header documents the loop as circle -> dive -> grounded;
//     the old escape contradicted it.
//   - A hit-dive already re-circles (dive resolve); grounded recovery now
//     matches. Consistent, not special-cased.
//   - The old escape reduced every glasswing fight to a 2-strike formality
//     (kill it or it leaves). Now the ambush teaches the hard way and the
//     declare teaches the counter — the learning arc lands.
//   - Trap-MISS deliberately UNCHANGED: a clean dodge stays a clean escape
//     (no forced combat for good play); the declare is reachable via the
//     hit path, which is the common first-encounter outcome.
//   - Fleeing is always the player's out; no endless-fight trap.
// Deletions: 7 lines (the escape branch). No other monster touched.
//
// PROVES:
//   (a) the declare is reachable in NATURAL play: world trap -> 3 ticks
//       standing still -> trap hit -> grounded combat -> window burns ->
//       re-circle (NOT fled) -> dive declares with shadow telegraph.
//   (b) codex-gated coaching still works on the now-reachable declare
//       (unknown -> dread-only; known -> "diving at YOUR tile. MOVE").
//   (c) no regression to trap behavior: hit still damages + opens grounded
//       combat; miss still dodges cleanly with no combat; the grounded
//       +50% kill-window hook still fires.
//
// HARNESS (AGENTS.md 2026-10-06/07/08): full index.html script list in
// order, minus DOM-only (app.js, sprites.js, tile-scenes.js, move-anim.js)
// and drama.js (top-level document access crashes node eval). Resettable
// RNG installed as Math.random BEFORE eval (modules capture it at load).
// window stubbed for the eval phase, DELETED before playing (else combat
// goes async).
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = process.env.SEED ? parseInt(process.env.SEED, 10) : 0xD1E;
Math.random = mulberry32(SEED);

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = global; // eval phase only
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
 'src/js/debug-scenarios.js', 'src/js/build.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

// --- capture ---
const said = [], heard = [];
Game.say = (t) => { said.push(String(t)); };
Game.audioEvent = (n, p) => { heard.push(String(n)); };
const clearCap = () => { said.length = 0; heard.length = 0; };

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.log(`FAIL [seed ${SEED}] ${name}${extra ? ' — ' + extra : ''}`); }
}
function flatGrid() {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
}
function strip(s) {
  const bad = (a) => { const id = (a && a.id) || a; return id !== 'fear_aura' && id !== 'pocket_sand'; };
  s.abilities = (s.abilities || []).filter(bad);
  s.backgroundAbilities = (s.backgroundAbilities || []).filter(bad);
  s.stats = s.stats || {}; s.stats.agi = 5;
  if (s.passives) delete s.passives.footwork;
}
function freshRun() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  return s;
}
function markSlain(id) {
  Game.state.codex.monsters = Game.state.codex.monsters || {};
  Game.state.codex.monsters[id] = Object.assign(Game.state.codex.monsters[id] || {}, { stage: 'slain' });
}
function markKnown(id, attackName) {
  markSlain(id);
  const e = Game.state.codex.monsters[id];
  e.patterns = e.patterns || {};
  e.patterns[attackName] = 'test pattern';
}
function M() { return Game.tbfight ? Game.tbfight.fighters.find(x => x.kind === 'monster') : null; }
function P() { return Game.tbFighter('p'); }
function monsterActs() {
  const f = Game.tbfight; if (!f || f.over) return;
  if (Game.tbIsPlayerTurn()) { const p = P(); p.moveLeft = 0; p.acted = true; }
  Game.tbAdvance();
}
function playerWait() { const p = P(); p.moveLeft = 0; p.acted = true; Game.tbEndCheck(); }

// NATURAL FLOW: world trap -> stand still 3 ticks -> trap HIT -> combat.
// Returns null if the trap never sets (loud failure, not a skip).
function naturalHitFlow(known) {
  const s = freshRun();
  Game.debugScenario('glasswing'); // NB: scenario calls freshGame() (state reset) — markKnown AFTER it
  if (known) markKnown('glasswing', 'Skyfall Dive');
  const sc = Game.state.scholar; strip(sc);
  sc.mx = sc.monster.mx + 1; sc.my = sc.monster.my;
  Game.monsterTurn(); // trap set (world ambush)
  if (!sc.gwTrap) return null;
  Game.gwTrapTick(); Game.gwTrapTick();
  const hpBefore = sc.health;
  clearCap();
  Game.gwTrapTick(); // resolve: HIT, standing still
  return { s: sc, hpBefore };
}

(async () => {
  await Game.init();
  Game.genDetail = () => flatGrid();

  // ============ (a) DECLARE REACHABLE IN NATURAL PLAY (unknown) ============
  {
    const flow = naturalHitFlow(false);
    ok('natural: trap sets in the world', !!flow);
    const { s, hpBefore } = flow;
    ok('natural: standing still -> trap HIT (damage)', s.health < hpBefore, `hp ${hpBefore} -> ${s.health}`);
    const m = M();
    ok('natural: hit opens grounded combat', !!Game.tbfight && !!m && m.beamPhase === 'grounded',
      m && `phase=${m.beamPhase}`);
    // the speed-5 darter OPENS, burning a tick before the player moves
    // (grounded-window parity, game.js) — the player observes 2; the
    // window is 3 at spawn. Either way the kill window is real.
    ok('natural: trap-hit grounded window survives the opener', m && m.gwGrounded >= 2, m && `gwGrounded=${m.gwGrounded}`);
    // the darter must SURVIVE the window for the loop to turn (player waits)
    m.hp = m.maxHp = 300;
    const px = P().mx, py = P().my;
    let g = 0;
    while (M() && M().beamPhase === 'grounded' && g++ < 12) monsterActs();
    const m2 = M();
    ok('natural: window burns out', !!m2 && m2.beamPhase !== 'grounded', m2 && `phase=${m2.beamPhase}`);
    ok('natural: NO escape — darter still in the fight', !!m2 && m2.alive && !m2.fled,
      m2 && `alive=${m2.alive} fled=${m2.fled}`);
    ok('natural: recovery re-circles (phase circle, high)', !!m2 && m2.beamPhase === 'circle' && m2.altitude === 'high',
      m2 && `phase=${m2.beamPhase} alt=${m2.altitude}`);
    const dc = Math.max(Math.abs(m2.mx - px), Math.abs(m2.my - py));
    ok('natural: re-circle climbs off the player tile', dc === 2, `dist=${dc} at (${m2.mx},${m2.my})`);
    ok('natural: climb + circle audio', heard.includes('glasswingClimb') && heard.includes('glasswingCircle'));
    ok('natural: re-circle line reads', said.some(l => /circling for another dive/i.test(l)));
    // the declare: within dive range, the shadow telegraph must fire
    clearCap();
    let g2 = 0;
    while (M() && !M().telegraph && g2++ < 12) monsterActs();
    const m3 = M();
    ok('natural: IN-COMBAT DIVE DECLARES (reachable!)', !!m3 && !!m3.telegraph && m3.beamPhase === 'dive',
      m3 && `phase=${m3.beamPhase} telegraph=${!!m3.telegraph}`);
    ok('natural: declare is the single-tile shadow', m3 && m3.telegraph && m3.telegraph.kind === 'squares'
      && m3.telegraph.cells.length === 1, m3 && m3.telegraph && JSON.stringify(m3.telegraph.cells));
    ok('natural: unknown declare is dread-only (no coaching leak)',
      m3 && m3.telegraph && /falling out of the sky/.test(m3.telegraph.cueText) && !/MOVE/.test(m3.telegraph.cueText),
      m3 && m3.telegraph && m3.telegraph.cueText);
    const sh = Game.gwDiveShadow();
    ok('natural: gwDiveShadow dive contract on the natural declare',
      sh && sh.phase === 'dive' && sh.tile && Array.isArray(sh.streak));
    // loop continuity: stand still -> hit-dive -> snatch + climb -> circle again
    clearCap();
    let g3 = 0;
    while (M() && M().telegraph && g3++ < 12) { playerWait(); monsterActs(); }
    const m4 = M();
    ok('natural: declared dive resolves -> hit -> climbs to circle',
      !!m4 && !m4.telegraph && m4.beamPhase === 'circle' && m4.altitude === 'high',
      m4 && `phase=${m4.beamPhase} alt=${m4.altitude}`);
    ok('natural: snatch line reads', said.some(l => /snatches/i.test(l)));
  }

  // ============ (b) CODEX-GATED COACHING ON THE NATURAL DECLARE ============
  {
    const flow = naturalHitFlow(true); // codex knows Skyfall Dive
    ok('known: trap sets in the world', !!flow);
    const m = M();
    m.hp = m.maxHp = 300;
    let g = 0;
    while (M() && M().beamPhase === 'grounded' && g++ < 12) monsterActs();
    clearCap();
    let g2 = 0;
    while (M() && !M().telegraph && g2++ < 12) monsterActs();
    const m2 = M();
    ok('known: natural declare fires', !!m2 && !!m2.telegraph && m2.beamPhase === 'dive');
    ok('known: coaching names YOUR tile + MOVE',
      m2 && m2.telegraph && /diving at YOUR tile/.test(m2.telegraph.cueText) && /MOVE/.test(m2.telegraph.cueText),
      m2 && m2.telegraph && m2.telegraph.cueText);
    ok('known: attack name revealed', Game.encAttackName(m2) === 'Skyfall Dive', Game.encAttackName(m2));
  }

  // ============ (c) TRAP REGRESSIONS ============
  {
    // hit path sanity (approach coaching intact)
    const s = freshRun();
    Game.debugScenario('glasswing');
    const sc = Game.state.scholar; strip(sc);
    sc.mx = sc.monster.mx + 1; sc.my = sc.monster.my;
    Game.monsterTurn();
    ok('trap: sets on approach', !!sc.gwTrap);
    clearCap();
    Game.gwTrapTick();
    ok('trap: unknown approach is dread-only', said.some(l => /shadow on the ground — faint/i.test(l))
      && !said.some(l => /MOVE when it grows/i.test(l)));
  }
  {
    // miss path: dodge still a clean escape, no combat
    const s = freshRun();
    Game.debugScenario('glasswing');
    const sc = Game.state.scholar; strip(sc);
    sc.mx = sc.monster.mx + 1; sc.my = sc.monster.my;
    Game.monsterTurn();
    Game.gwTrapTick(); Game.gwTrapTick();
    sc.mx = 0; sc.my = 0; // well clear of the tile + splash
    const hpBefore = sc.health;
    clearCap();
    Game.gwTrapTick();
    ok('trap: moved away -> no damage (dodge works)', sc.health === hpBefore);
    ok('trap: miss -> no combat (dodge is a clean escape)', !Game.tbfight);
    ok('trap: miss line reads', said.some(l => /hits empty dirt/i.test(l)));
    ok('trap: trap cleared', !sc.gwTrap);
  }
  {
    // grounded kill window: +50% flyer-down hook still fires on a strike
    const flow = naturalHitFlow(false);
    ok('window: natural hit flow sets up', !!flow);
    const gm = M(); gm.hp = gm.maxHp = 300;
    const pp = P(); pp.mx = gm.mx + 1; pp.my = gm.my;
    clearCap();
    Game.tbPlayerStrike(gm.key);
    ok('window: grounded +50% hook fires', said.some(l => /takes the hit badly/i.test(l)),
      said.join(' | ').slice(0, 140));
    ok('window: darter survives the test strike, still grounded',
      M() && M().alive && M().beamPhase === 'grounded');
  }

  console.log(`\ndive-declare: ${pass} passed, ${fail} failed (seed ${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
