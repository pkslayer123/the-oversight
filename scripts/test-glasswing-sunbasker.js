#!/usr/bin/env node
// Glasswing Darter + Sunbasker mechanics tests (Steve 2026-10-05):
// dive and bask were TODO — the attacks literally whiffed (patternCells has
// no 'single' case; telegraphs resolved with empty cells). Now:
//  - glasswing: circle (untargetable) → dive (tile-locked shadow telegraph,
//    dodge by moving) → grounded on miss (vulnerable 1 turn) / climb on hit
//  - sunbasker: bask builds charge (+dmg), hits reset it, bite spends it,
//    shade/dusk flattens it (passive)
//  - codex: tbPatternDesc('single') no longer claims "hits an area around it"
//
// Turn driver: monsterActs() runs monster turns until it's the player turn.
// The player then acts directly (strike/move) with no intervening monster
// turn — the only honest way to test declare→respond→resolve beats.
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

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}`); }
}
function flatGrid() {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
}
function startFight(scen) {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s0 = Game.state.scholar;
  s0.health = 500;
  s0.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  for (const rid of Object.keys(Game.state.village.positions || {})) {
    Game.state.village.positions[rid] = { mx: 0, my: 0 };
  }
  Game.debugScenario(scen);
  const s = Game.state.scholar; // freshGame() replaces state — re-capture
  s.mx = s.monster.mx + 1; s.my = s.monster.my;
  Game.canSee = () => true;
  for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
  const m = M();
  m.hp = m.maxHp = 200; // survive observation; mechanics, not lethality
  return Game.tbfight;
}
function M() { return Game.tbfight.fighters.find(x => x.kind === 'monster'); }
function P() { return Game.tbFighter('p'); }
// run monster turns until it's the player turn (ends there, turn open)
function monsterActs() {
  const f = Game.tbfight;
  if (!f || f.over) return 'over';
  if (Game.tbIsPlayerTurn()) { const p = P(); p.moveLeft = 0; p.acted = true; }
  Game.tbAdvance();
  return f.over ? 'over' : 'ok';
}

(async () => {
  await Game.init();
  Game.genDetail = () => flatGrid();

  // --- 0. codex no longer lies about 'single' ---
  ok("tbPatternDesc('single') is not the area lie",
    !/area around it/i.test(Game.tbPatternDesc({ type: 'single' })));

  // ================= GLASSWING =================
  startFight('glasswing');
  let m = M();
  ok('glasswing opens circling or already diving (opening pass)',
    m.beamPhase === 'circle' || m.beamPhase === 'dive');
  ok('glasswing opening dread line',
    Game.log.some(l => /circling\. Something up there/i.test(l)));
  ok('opens on the player turn', Game.tbIsPlayerTurn());

  // --- circling is untargetable (strike now: no monster turn intervenes) ---
  m.telegraph = null; m.beamPhase = 'circle';
  m.mx = 4; m.my = 4; P().mx = 5; P().my = 4;
  Game.tbPlayerStrike(m.key);
  ok('circling strike refused (out of reach)', Game.log.some(l => /spear reach/i.test(l)));
  ok('circling strike did no damage', m.hp === m.maxHp);

  // --- while circling it closes in (airborne) ---
  m.mx = 8; m.my = 8; P().mx = 0; P().my = 0;
  monsterActs();
  const dAfterCircle = Math.max(Math.abs(M().mx - 0), Math.abs(M().my - 0));
  ok('circling closes distance', dAfterCircle < 8);

  // --- dive declares on the player's tile; flee before it resolves ---
  let declared = false;
  for (let i = 0; i < 8 && !declared; i++) {
    if (monsterActs() === 'over') break;
    if (M().telegraph) {
      const p = P(); p.mx = 7; p.my = 7; // flee the locked tile THIS turn
      declared = true;
    }
  }
  m = M();
  ok('dive declared', declared && !!m.telegraph && m.beamPhase === 'dive');
  ok('dive locks exactly one cell', m.telegraph && m.telegraph.cells.length === 1);
  ok('dive locked the tile the player fled', m.telegraph &&
    m.telegraph.cells[0].cx === 0 && m.telegraph.cells[0].cy === 0);
  ok('dive dread line, no coaching for the unknown',
    Game.log.some(l => /shadow detaches from the clouds/i.test(l)));

  // --- resolve: miss → grounded, vulnerable ---
  const hpBefore = P().hp;
  monsterActs();
  m = M();
  ok('dodge: no damage taken', P().hp === hpBefore);
  ok('miss → grounded', m.beamPhase === 'grounded');
  ok('grounded crash line', Game.log.some(l => /GROUNDED/i.test(l)));
  ok('clean dodge line', Game.log.some(l => /Clean dodge/i.test(l)));
  ok('darter landed on the dive tile', m.mx === 0 && m.my === 0);

  // --- grounded punish: close in and strike for +50%, then it climbs ---
  // (player turn is open; step up to the crashed darter like a real player)
  P().mx = 1; P().my = 0;
  Game.tbPlayerStrike(m.key);
  ok('grounded strike lands with vulnerability note', Game.log.some(l => /Wings tangled/i.test(l)));
  ok('grounded strike dealt damage', M().hp < M().maxHp);
  monsterActs();
  ok('climbs back to circle', M().beamPhase === 'circle');

  // --- stand still → dive hits → climbs (not grounded) ---
  for (let i = 0; i < 8 && !M().telegraph; i++) monsterActs();
  ok('dive re-declared', !!M().telegraph);
  const hp2 = P().hp;
  monsterActs(); // resolve: player still on the tile → hit
  ok('standing still: dive hits', P().hp < hp2);
  ok('hit → climbs, not grounded', M().beamPhase === 'circle');

  // ================= SUNBASKER =================
  startFight('sunbasker');
  m = M();
  ok('sunbasker opens basking', m.beamPhase === 'bask');
  ok('sunbasker opening dread line', Game.log.some(l => /Gold in the grass/i.test(l)));
  ok('slow monster: no opening-pass turn (charge 0)', m.sbCharge === 0);
  monsterActs(); // bask 1
  m = M();
  ok('charge builds to 1', m.sbCharge === 1 && m.beamPhase === 'bask');
  monsterActs(); // bask 2 → bite declared
  m = M();
  ok('charge builds to 2', m.sbCharge === 2);
  ok('bite declared at charge 2', !!m.telegraph && m.telegraph.kind === 'direct');
  ok('bite phase charged', m.beamPhase === 'charged');

  // --- hitting it mid-windup kills the charge; bite lands weak ---
  Game.tbPlayerStrike(m.key); // player turn is open
  m = M();
  ok('hit resets charge', m.sbCharge === 0);
  ok('charge-break line', Game.log.some(l => /knocks the charge out/i.test(l)));
  const hp3 = P().hp;
  monsterActs(); // bite resolves with no charge bonus
  const biteDmg = hp3 - P().hp;
  ok('weakened bite lands (base 8-14, no charge bonus)', biteDmg >= 8 && biteDmg <= 14);
  m = M();
  ok('bite spends charge, back to bask', m.sbCharge === 0 && m.beamPhase === 'bask');

  // --- full-charge bite hurts (leave it alone) ---
  monsterActs(); // charge 1
  monsterActs(); // charge 2 + declare
  const hp4 = P().hp;
  monsterActs(); // resolve at charge 2 → 16-22
  const fullDmg = hp4 - P().hp;
  ok('full-charge bite hits harder (16-22)', fullDmg >= 16 && fullDmg <= 22);

  // --- night flattens it (passive) ---
  startFight('sunbasker');
  Game.dayPart = 3;
  monsterActs();
  m = M();
  ok('night: flattened', !!m.sbFlat);
  ok('night: no charge, no telegraph', m.sbCharge === 0 && !m.telegraph);
  ok('flatten line', Game.log.some(l => /dull brown/i.test(l)));
  Game.dayPart = 1;

  // --- shade flattens too ---
  Game.genDetail = () => { const g = flatGrid(); g[4][3] = 'tree'; return g; };
  startFight('sunbasker');
  m = M();
  m.mx = 4; m.my = 4; // tree at (3,4) = orthogonal → shade
  monsterActs();
  ok('shade: flattened', !!M().sbFlat);
  Game.genDetail = () => flatGrid();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
