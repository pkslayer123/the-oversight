// Dive & bask fixes regression test (2026-10-05).
// Bug classes:
//  1. DEAD-HOOK-IN-WRONG-BRANCH: sunbasker bite charge-spend sat inside the
//     non-direct resolve branch checking tg.kind === 'direct' — unreachable.
//     Charge pinned at 3, bite every ~2 turns at max bonus, phase stuck.
//  2. UNGATED-FLAVOR-FALLBACK: resolve flavor "The light hits!" assumed a
//     light attack for every unlearned attack. Now flavored by pattern/monster.
//  3. UNGATED-ATTACK-NAME: raw tg.attackName in damage-source strings bypassed
//     the knowledge gate (resName said "the attack", damage line said the true
//     name). Now encAttackName everywhere, including the beam resolve.
//  4. MONSTER-STACKED-ON-VICTIM: glasswing stayed on the victim's tile in
//     'circle' phase after a hit-dive. Now climbs ~4 tiles away.
//  5. GROUNDED-WINDOW: crash set gwGrounded=1 (one player turn); the committed
//     design comment says 2 turns. Now gwGrounded=2.
// Usage: node scripts/test-dive-bask.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function flatGrid() { return Array.from({ length: 9 }, () => Array(9).fill('grass')); }
function giveSpear() {
  const s = Game.state.scholar;
  const def = (Game.data.items || []).find(i => i.id === 'fire_hardened_spear') || {};
  s.inventory = s.inventory || [];
  s.inventory.push({ itemId: 'fire_hardened_spear', units: 1, kcalEach: 0, kg: 0.5, name: def.name || 'fire-hardened spear', bonded: true, bond: 0, bondOffered: [], enhancements: [] });
  s.equipped = s.equipped || {};
  s.equipped.weapon = { itemId: 'fire_hardened_spear', name: def.name || 'fire-hardened spear' };
}
function setup(monsterId, px, py, mx, my) {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = px; s.my = py; s.kcal = 3000; s.energy = 60; s.health = 100;
  // DETERMINISTIC PLAYER (Steve 2026-10-06): random roster abilities —
  // fear_aura (hesitate), pocket_sand (blind), footwork/AGI (dodge) — flake
  // turn-sensitive asserts. Strip/pin; this file measures monster mechanics.
  const bad = (a) => { const id = (a && a.id) || a; return id !== 'fear_aura' && id !== 'pocket_sand'; };
  s.abilities = (s.abilities || []).filter(bad);
  s.backgroundAbilities = (s.backgroundAbilities || []).filter(bad);
  s.stats = s.stats || {}; s.stats.agi = 5;
  if (s.passives) delete s.passives.footwork;
  Game.genDetail = flatGrid;
  Game.log = [];
  giveSpear();
  s.monster = { id: monsterId, mx, my };
  Game.startCombat(monsterId);
  return s;
}
const P = () => Game.tbFighter('p');
const M = () => Game.tbfight && Game.tbfight.fighters.find(f => f.kind === 'monster' && f.alive);
const cheb = (a, b, c, d) => Math.max(Math.abs(a - c), Math.abs(b - d));
function step() { // one full round: pending AI turn, then player ends turn
  if (!Game.tbfight || Game.tbfight.over) return;
  const cur = Game.tbCurrent();
  if (cur && cur.kind !== 'player') {
    if (cur.kind === 'villager') Game.tbVillagerTurn(cur);
    else Game.tbMonsterTurn(cur);
    if (Game.tbfight && !Game.tbfight.over) Game.tbAdvance();
  } else {
    Game.tbPlayerEndTurn();
  }
}
function logHas(re) { return Game.log.some(l => re.test(l)); }

async function main() {
  await Game.init();
  Game.dayPart = 1; // midday: both are diurnal

  // ===== 1. SUNBASKER: bite spends the charge (dead-hook fix) =====
  setup('sunbasker', 2, 4, 3, 4);
  for (let i = 0; i < 6 && !(M() && M().telegraph); i++) step();
  const sb = M();
  ok('bite declared at charge>=2', !!(sb && sb.telegraph && sb.telegraph.kind === 'direct' && sb.sbCharge >= 2),
    `charge=${sb && sb.sbCharge}`);
  const mark = Game.log.length;
  step(); // bite resolves
  const sb2 = M();
  ok('charge spent after bite', sb2 && sb2.sbCharge === 0, `charge=${sb2 && sb2.sbCharge}`);
  ok('phase back to bask after bite', sb2 && sb2.beamPhase === 'bask', `phase=${sb2 && sb2.beamPhase}`);
  ok('spend narrated', Game.log.slice(mark).some(l => /charge is spent/i.test(l)));
  step(); // next monster turn: must re-bask, not sit at max
  const sb3 = M();
  ok('bask loop restarts (charge rebuilds from 0)', sb3 && sb3.sbCharge === 1 && sb3.beamPhase === 'bask',
    `charge=${sb3 && sb3.sbCharge} phase=${sb3 && sb3.beamPhase}`);

  // ===== 1b. SUNBASKER: hit during windup still kills the charge =====
  setup('sunbasker', 2, 4, 3, 4);
  for (let i = 0; i < 6 && !(M() && M().telegraph); i++) step();
  const sbw = M();
  if (Game.tbIsPlayerTurn() && sbw && sbw.telegraph) {
    const before = sbw.sbCharge;
    Game.tbPlayerStrike(sbw.key);
    ok('mid-windup hit kills the charge', (sbw.sbCharge || 0) === 0 && before >= 2,
      `before=${before} after=${sbw.sbCharge}`);
  } else ok('mid-windup hit kills the charge', false, 'setup failed');

  // ===== 2/3. GLASSWING: dive hit -> climb away; flavor gated =====
  setup('glasswing', 2, 4, 5, 4);
  for (let i = 0; i < 4 && !(M() && M().telegraph); i++) step();
  const gw = M();
  ok('dive declared (squares, one cell)', !!(gw && gw.telegraph && gw.telegraph.kind === 'squares' && gw.telegraph.cells.length === 1));
  step(); // stand still -> dive hits
  const gw2 = M();
  ok('hit-dive returns to circle', gw2 && gw2.beamPhase === 'circle', `phase=${gw2 && gw2.beamPhase}`);
  ok('climbed away from the victim tile', gw2 && cheb(P().mx, P().my, gw2.mx, gw2.my) >= 3,
    `dist=${gw2 && cheb(P().mx, P().my, gw2.mx, gw2.my)}`);
  ok('no "The light hits!" for a shadow dive', !logHas(/The light hits/));
  const preLearn = Game.log.join('\n');
  ok('dive damage line gates the attack name', !/Skyfall Dive/.test(preLearn) || Game.tbPatternKnown('glasswing', 'Skyfall Dive'));

  // ===== 4/5. GLASSWING: dodge -> grounded, 2-turn window, escape ends fight =====
  setup('glasswing', 2, 4, 5, 4);
  for (let i = 0; i < 4 && !(M() && M().telegraph); i++) step();
  const gw3 = M();
  ok('dive declared (dodge test)', !!(gw3 && gw3.telegraph));
  const cell = gw3.telegraph.cells[0];
  if (Game.tbIsPlayerTurn()) Game.tbPlayerMove(cell.cx === 2 ? 1 : 2, 4); // off the locked tile
  const hpBefore = P().hp;
  step(); // dive resolves as a miss
  const gw4 = M();
  ok('dodge: no damage', P().hp === hpBefore, `hp ${hpBefore} -> ${P().hp}`);
  ok('miss -> grounded', gw4 && gw4.beamPhase === 'grounded', `phase=${gw4 && gw4.beamPhase}`);
  ok('grounded window is 2 turns (committed design)', gw4 && gw4.gwGrounded === 2, `gwGrounded=${gw4 && gw4.gwGrounded}`);
  ok('crash narrated', logHas(/wings tangled/i));
  // punish it: strike while grounded (+50% hook)
  const mhp = gw4.hp;
  if (Game.tbIsPlayerTurn()) Game.tbPlayerStrike(gw4.key);
  ok('grounded strike lands', gw4.hp < mhp, `mhp ${mhp} -> ${gw4.hp}`);
  ok('vulnerability narrated', logHas(/takes the hit badly/));
  // window closes: two monster turns with no kill -> escape, fight ends
  setup('glasswing', 2, 4, 5, 4);
  for (let i = 0; i < 4 && !(M() && M().telegraph); i++) step();
  const gw5 = M();
  const c5 = gw5.telegraph.cells[0];
  if (Game.tbIsPlayerTurn()) Game.tbPlayerMove(c5.cx === 2 ? 1 : 2, 4);
  step(); // crash
  ok('crashed (escape test)', M() && M().beamPhase === 'grounded');
  step(); // player ends turn; monster turn: still down (window turn 1)
  ok('still grounded through window turn 1', M() && M().beamPhase === 'grounded');
  step(); // player ends turn; monster turn: escapes
  ok('escapes after the window', !M() || (Game.tbfight && Game.tbfight.over));
  ok('fight ends on escape (not stuck)', !Game.tbfight || Game.tbfight.over);
  ok('escape narrated', logHas(/back into the sun\. Gone/i));

  console.log(`\n=== RESULTS: ${pass} pass, ${fail} fail ===`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
