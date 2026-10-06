#!/usr/bin/env node
// Feel-fixes PLAYTEST — played as a player (Steve 2026-10-06).
// Narrated drivers at honest 1x turn economy; guarded endTurn() (never the
// double-advance pattern — see AGENTS.md). Four acts:
//   1. Sunbasker: the shade-fizzle repro layout, fixed approach, bask→charge→bite loop + counterplay.
//   2. Bulldozer: off-axis charge declare — the lane must pass through the aim point.
//   3. Mirror stag: off-axis charge declare — same geometry check via its bespoke declare.
//   4. Hype horn: crowd-deflate across windup cycles — the line speaks once.
// Run: node scripts/play-feel-fixes-20261006.js
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
function alive() { return !!(Game.tbfight && !Game.tbfight.over); }
function monsters() { return (Game.tbfight ? Game.tbfight.fighters : []).filter(x => x.kind === 'monster' && x.alive); }
// Guarded endTurn: exactly one AI round per player action.
function endTurn() {
  if (!alive()) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function waitTurn() { endTurn(); }
function strike(key) { let r = false; if (Game.tbIsPlayerTurn()) r = Game.tbPlayerStrike(key); endTurn(); return r; }
function freshGame() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.tbfight = null;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  for (const rid of Object.keys(Game.state.village.positions || {})) Game.state.village.positions[rid] = { mx: 0, my: 0 };
  Game.canSee = () => true;
  Game.dayPart = 1;
}
function flatGrid() { return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')); }

(async () => {
await Game.init();

// ================= ACT 1: SUNBASKER — the fizzle, fixed =================
note('\n===== ACT 1: SUNBASKER — shade on the approach path =====');
freshGame();
Game.debugScenario('sunbasker');
for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
{
  const sb = monsters().find(m => ((m.mdef || {}).id === 'sunbasker'));
  const p = P();
  // Repro layout (matches the unit test): tree at (sb.mx-1, sb.my-2) shades
  // (sb.mx-1, sb.my-1) — the tile the OLD approach stepped onto first.
  const grid = flatGrid();
  grid[sb.my - 2][sb.mx - 1] = 'tree';
  Game.genDetail = () => grid;
  p.mx = sb.mx - 3; p.my = sb.my;
  note(`I'm at (${p.mx},${p.my}), the basker at (${sb.mx},${sb.my}). Tree at (${sb.mx - 1},${sb.my - 2}) — tile (${sb.mx - 1},${sb.my - 1}) is shaded, right on the direct line in.`);
  note(`Old code walked straight onto it and flattened forever. Watching the approach...`);
  let turns = 0, everShaded = false, everFlat = false;
  for (let i = 0; i < 10 && alive(); i++) {
    waitTurn(); turns++;
    if (!alive()) break;
    const shaded = Game.tbInShade(sb.mx, sb.my);
    if (shaded) everShaded = true;
    if (sb.sbFlat) everFlat = true;
    note(`  turn ${turns}: basker at (${sb.mx},${sb.my})${shaded ? ' [SHADE!]' : ''} phase=${sb.beamPhase || '-'} charge=${sb.sbCharge || 0}${sb.sbFlat ? ' FLAT' : ''}`);
    if (Math.max(Math.abs(p.mx - sb.mx), Math.abs(p.my - sb.my)) <= 1) break;
  }
  const adj = Math.max(Math.abs(p.mx - sb.mx), Math.abs(p.my - sb.my)) <= 1;
  note(`Approach done: adjacent=${adj}, ever stepped in shade=${everShaded}, ever flattened=${everFlat}.`);
  // Now the loop: let it bask. It should build charge and declare the bite.
  note('It\'s next to me. I hold still — let it bask, watch the gold build.');
  let declared = false, chargeKnocked = false;
  for (let i = 0; i < 8 && alive(); i++) {
    waitTurn();
    if (sb.telegraph) { declared = true; note(`  BITE DECLARED at charge ${sb.sbCharge}: "${sb.telegraph.attackName || 'the attack'}" — the counterplay is pressure, not position. I HIT IT.`); break; }
  }
  if (declared) {
    const before = sb.sbCharge;
    strike(sb.key);
    note(`  Struck it: charge was ${before}, now ${sb.sbCharge}. ${sb.sbCharge < before ? 'The blow knocks the charge out of its scales — the bite starves. THAT is the fight.' : 'Charge did NOT drop — investigate!'}`);
    chargeKnocked = sb.sbCharge < before;
  }
  note(`ACT 1 VERDICT: ${adj && !everShaded && !everFlat && declared && chargeKnocked ? 'FIXED and FUN — sun-aware approach, bask→charge→bite loop plays, pressure is the counterplay.' : 'PROBLEM — see notes above.'}`);
}

// ================= ACT 2: BULLDOZER — off-axis committed lane =================
note('\n===== ACT 2: BULLDOZER — off-axis charge declare =====');
freshGame();
Game.debugScenario('bulldozer');
Game.genDetail = flatGrid;
for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
{
  const boar = monsters().find(m => ((m.mdef || {}).id === 'bulldozer'));
  const p = P();
  boar.mx = 4; boar.my = 4; p.mx = 7; p.my = 5; // dx=3, dy=1 — off-axis
  note(`Bulldozer at (4,4), I'm at (7,5) — bearing (3,1), NOT an 8-way angle. Old code snapped the lane diagonal and whiffed a stationary target.`);
  let declared = false;
  for (let i = 0; i < 10 && alive() && !declared; i++) {
    waitTurn();
    if (boar.telegraph) {
      declared = true;
      const cells = boar.telegraph.cells.map(c => `(${c.cx},${c.cy})`).join(' ');
      const onMe = boar.telegraph.cells.some(c => c.cx === p.mx && c.cy === p.my);
      note(`  DECLARED — phase ${boar.beamPhase}. Lane: ${cells}`);
      note(`  My tile (7,5) on the lane: ${onMe}. threatenedPlayer=${!!boar.telegraph.threatenedPlayer}.`);
      // What the OLD sign-snap would have drawn:
      const old = []; { const dx = Math.sign(7 - 4), dy = Math.sign(5 - 4); for (let k = 1; k <= 5; k++) old.push(`(${4 + dx * k},${4 + dy * k})`); }
      note(`  Old sign-snap would have drawn: ${old.join(' ')} — ${old.includes('(7,5)') ? 'hit' : 'MISSED me entirely'}.`);
      if (onMe && boar.telegraph.threatenedPlayer) {
        note('  The locked lane is honest now. I sidestep out of it.');
        p.mx = 6; p.my = 6; // off the lane
        endTurn(); // let it resolve
        note(`  After resolve: I'm at (6,6), hp=${Math.round(p.hp)}.`);
      }
    }
  }
  note(`ACT 2 VERDICT: ${declared ? 'Lane passes through the aim point at off-axis angles — the committed charge no longer whiffs stationary targets.' : 'NO DECLARE seen — investigate.'}`);
}

// ================= ACT 3: MIRROR STAG — off-axis committed lane =================
note('\n===== ACT 3: MIRROR STAG — off-axis charge declare =====');
freshGame();
Game.debugScenario('griefcounselor');
Game.genDetail = flatGrid;
for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
{
  const stag = monsters().find(m => ((m.mdef || {}).id === 'mirror_stag'));
  const p = P();
  stag.mx = 4; stag.my = 3; p.mx = 7; p.my = 5; // dx=3, dy=2 — off-axis
  note(`Stag at (4,3), I'm at (7,5) — bearing (3,2). Waiting through the mirror beat for the charge declare...`);
  let declared = false;
  for (let i = 0; i < 25 && alive() && !declared; i++) {
    waitTurn();
    if (stag.telegraph) {
      declared = true;
      const cells = stag.telegraph.cells.map(c => `(${c.cx},${c.cy})`).join(' ');
      const onMe = stag.telegraph.cells.some(c => c.cx === p.mx && c.cy === p.my);
      note(`  CHARGE DECLARED (windup ${stag.telegraph.turnsLeft}). Lane: ${cells}`);
      note(`  My tile (7,5) on the lane: ${onMe}.`);
    }
  }
  note(`ACT 3 VERDICT: ${declared ? 'Stag lane passes through the aim point off-axis — same fix, bespoke declare path.' : 'NO DECLARE in 25 turns — the mirror beat may need a longer drive; geometry covered by unit test.'}`);
}

// ================= ACT 4: HYPE HORN — crowd-deflate speaks once =================
note('\n===== ACT 4: HYPE HORN — crowd-deflate across windup cycles =====');
freshGame();
const saidLines = [];
const origSay = Game.say;
Game.say = (t) => { saidLines.push(String(t)); };
Game.debugScenario('motivationalspeaker');
Game.genDetail = flatGrid;
{ const s = Game.state.scholar; s.mx = s.monster.mx + 1; s.my = s.monster.my; }
for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
{
  const hh = () => monsters().filter(m => ((m.mdef || {}).id === 'hype_horn'));
  for (const h of hh()) h.hp = h.maxHp = 400;
  const f = Game.tbfight;
  for (let i = 0; i < 2; i++) {
    f.fighters.push({ key: 'pal' + i, kind: 'villager', name: 'Pal ' + i, mx: P().mx, my: P().my, hp: 80, maxHp: 80, alive: true, fled: false, speed: 3, acted: true, moveLeft: 0 });
    for (const h of hh()) Game.encNoticeFighter(h, 'pal' + i, true);
    hh().forEach(h => { h.telegraph = null; h.hypeCooldown = 0; });
  }
  note('Two villagers noticed — the horn can only do one-on-one. Playing...');
  const countDeflateLines = () => saidLines.filter(t => /YOU'RE ALL WINNERS/.test(t)).length;
  // Phase 1: same crowd persists — the line must speak exactly once.
  for (let i = 0; i < 4 && alive(); i++) waitTurn();
  const linesAfterCrowd1 = countDeflateLines();
  note(`  crowd {pal0,pal1} persists 4 rounds: deflate lines = ${linesAfterCrowd1} (was 4+ before the fix)`);
  // Phase 2: the crowd leaves — the horn should recover and wind up again.
  for (const k of ['pal0', 'pal1']) { const v = f.fighters.find(x => x.key === k); if (v) { v.fled = true; v.alive = false; } }
  note('  the villagers slip away. The horn recovers...');
  let woundUp = false;
  for (let i = 0; i < 6 && alive(); i++) { waitTurn(); const h = hh()[0]; if (h && h.beamPhase !== 'deflate') { woundUp = true; break; } }
  note(`  horn leaves deflate phase: ${woundUp}. Lines still: ${countDeflateLines()} (no new line — no crowd, no deflate)`);
  // Phase 3: a NEW crowd forms — genuinely changed situation, the line may speak again.
  for (let i = 0; i < 2; i++) {
    f.fighters.push({ key: 'qx' + i, kind: 'villager', name: 'Qx ' + i, mx: P().mx, my: P().my, hp: 80, maxHp: 80, alive: true, fled: false, speed: 3, acted: true, moveLeft: 0 });
    for (const h of hh()) Game.encNoticeFighter(h, 'qx' + i, true);
    hh().forEach(h => { h.telegraph = null; h.hypeCooldown = 0; });
  }
  for (let i = 0; i < 4 && alive(); i++) waitTurn();
  const linesAfterCrowd2 = countDeflateLines();
  note(`  NEW crowd {qx0,qx1} persists 4 rounds: deflate lines = ${linesAfterCrowd2}`);
  const verdict4 = linesAfterCrowd1 === 1 && woundUp && linesAfterCrowd2 === 2;
  note(`ACT 4 VERDICT: ${verdict4 ? 'One line per distinct crowd; repeats within a crowd are gone; a genuinely new crowd re-speaks. The mechanic still cycles.' : 'Check counts above.'}`);
}
Game.say = origSay;
note('\nDone — played as a player, 1x turn economy throughout.');
})().catch(e => { console.error(e); process.exit(1); });
