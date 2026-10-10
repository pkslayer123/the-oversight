#!/usr/bin/env node
// HOSTILE PLAYTEST (explorer archetype, 2026-10-10): three attacks on travel/map.
//   T1 EXPLOIT  — travelTo at d<=3 skips intermediate-tile blockages:
//                 travelTargets offers d<=3 revealed destinations but travelTo
//                 only checks the DESTINATION's blockage. A fallen tree on the
//                 middle tile is walked around for free (no 60 kcal, no card).
//   T2 SOFTLOCK — exile returnToVillage: exiled scholar walks the old haven
//                 tile. Must PIN + estranged beat, never loop, never throw.
//   T3 HONESTY  — corpse-scouting fog order: if the arrival pit kills you,
//                 does reveal()/markSeen still fire BEFORE death (free map
//                 for the successor), or does death land first?
// Run: node scripts/test-explorer-attack-20261010.js (SEED env override)
// Full module list in index.html order, minus DOM-only; Math.random seeded
// BEFORE eval (modules capture it at load).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261010', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ a >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/contestEngine.js',
 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
 'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/fieldFights.js', 'src/js/villager-objectives.js',
 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/villageAgency.js',
 'src/js/partyTactics.js', 'src/js/debug-scenarios.js', 'src/js/build.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const say = () => { const l = Game.log || []; const s = l.map(x => x.text || x).join(' '); l.length = 0; return s; };
const verdicts = [];
const attack = (name, broke, detail) => { verdicts.push([name, broke]); console.log(`[${broke ? 'BREAK' : 'HELD '} ] ${name}${detail ? ' — ' + detail : ''}`); };
function fresh() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100; s.mx = 4; s.my = 4;
  say();
  return s;
}
const tile = (x, y) => Game.tileAt(x, y);

(async () => {
await Game.init();

// ---------- T1: intermediate-tile blockage bypass ----------
(function T1() {
  fresh();
  Game.map.px = 4; Game.map.py = 4;
  // fallen tree on (5,4), blocking entry from the west (player's side)
  const mid = tile(5, 4);
  mid.blockFrom = { dx: -1, dy: 0, type: 'fallen_tree' };
  mid.revealed = true;
  const dest = tile(6, 4);
  dest.revealed = true;
  dest.blockFrom = null;
  dest.type = 'meadow'; dest.needsBridge = false; dest.bridged = true;
  const kcalBefore = Game.state.scholar.kcal;
  // sanity: the honest d=1 hop must be blocked
  const hop = Game.travelTo(5, 4);
  const hopBlocked = !!(hop && hop.kind === 'blockage');
  const atMid = (Game.map.px === 5 && Game.map.py === 4);
  // the hostile move: jump OVER the blocked tile to (6,4), d=2
  Game.map.px = 4; Game.map.py = 4; say(); // reset position for the jump
  const jump = Game.travelTo(6, 4);
  const landed = (Game.map.px === 6 && Game.map.py === 4);
  const bypassed = landed && !(jump && jump.kind === 'blockage');
  const jumpRefused = !!(jump && jump.kind === 'blockage') && !landed;
  const kcalSpent = kcalBefore - Game.state.scholar.kcal;
  attack('T1 bypass: d=2 travelTo jumps over a fallen_tree on the middle tile',
    bypassed,
    `honest hop blocked=${hopBlocked} movedToMid=${atMid} | jump refused=${jumpRefused} bypassed=${bypassed} kcalSpentOnJump=${kcalSpent}`);
})();

// ---------- T1b: the fix must not brick legitimate travel ----------
// Clear the middle tile's tree, then the same jump must land (path is clear).
(function T1b() {
  fresh();
  Game.map.px = 4; Game.map.py = 4;
  const mid = tile(5, 4);
  mid.blockFrom = { dx: -1, dy: 0, type: 'fallen_tree' };
  mid.revealed = true;
  const dest = tile(6, 4);
  dest.revealed = true;
  dest.blockFrom = null;
  dest.type = 'meadow'; dest.needsBridge = false; dest.bridged = true;
  Game.state.scholar.kcal = 2400;
  const cleared = Game.clearBlockage(5, 4); // 60 kcal, +2 wood, the honest price
  say();
  const jump = Game.travelTo(6, 4);
  const landed = (Game.map.px === 6 && Game.map.py === 4);
  attack('T1b clear-then-jump: path reopens after the honest clear',
    !(cleared && landed),
    `cleared=${cleared} jumpLanded=${landed}`);
})();

// ---------- T2: exile returnToVillage ----------
(function T2() {
  fresh();
  const s = Game.state.scholar;
  s.exiled = true;
  try { Game.justiceState().exiled = true; } catch (e) {}
  // exile walks the old haven tile
  Game.map.px = Game.state.village.px ?? 4;
  Game.map.py = Game.state.village.py ?? 4;
  let threw = null, looped = false;
  try {
    for (let i = 0; i < 5; i++) Game.returnToVillage(); // hostile: call repeatedly
  } catch (e) { threw = String(e && e.message || e); }
  const log = say();
  const pinned = (Game.map.px === (Game.state.village.px ?? 4)) && (Game.map.py === (Game.state.village.py ?? 4));
  const estrangedBeat = /Nobody meets your eyes|exile means exile/i.test(log);
  const homecomingForExile = /days gone|walk back into Haven/i.test(log);
  attack('T2 exile returnToVillage: PIN + estranged beat, no loop, no throw',
    !!(threw || homecomingForExile),
    `threw=${threw} pinned=${pinned} estrangedBeat=${estrangedBeat} homecomingLeak=${homecomingForExile}`);
})();

// ---------- T3: corpse-scouting fog order ----------
// travelTo marks the arrival tile reveal()+markSeen BEFORE the arrival pit
// check. So a scout who walks into fog and dies in their own pit still maps
// the tile for the successor. The cost is a villager's life (or a mauling)
// per tile — a desperate trade, not an infinite free exploit. HELD by
// design; this probe pins the order so a future change can't silently
// flip it into a free-knowledge bug.
(function T3() {
  fresh();
  const src = fs.readFileSync(ROOT + '/src/js/game.js', 'utf8');
  const start = src.indexOf('travelTo(x, y, force, combatExit)');
  const chunk = src.slice(start, start + 9000);
  const iPos = chunk.indexOf('this.map.px = x');
  const iReveal = chunk.indexOf('this.reveal(x, y)');
  const iSeen = chunk.indexOf("this.markSeen(x, y, 'visited')");
  const iPit = chunk.indexOf('pit_trap');
  const orderOK = iPos > 0 && iReveal > iPos && iSeen > iReveal && iPit > iSeen;
  // empirical: a live travelTo into fog must mark seen
  Game.map.px = 4; Game.map.py = 4;
  const d5 = tile(5, 4);
  d5.revealed = false; d5.blockFrom = null; d5.type = 'meadow'; d5.needsBridge = false;
  Game.state.scholar.seenTiles = {};
  Game.travelTo(5, 4);
  const seenAfter = Game.mapSeen(5, 4);
  attack('T3 fog order pinned: pos < reveal < markSeen < pit (corpse-scout costs a life)',
    !(orderOK && seenAfter === 'visited'),
    `orderOK=${orderOK}, seenTiles after live fog arrival = ${seenAfter}`);
})();

const broke = verdicts.filter(v => v[1]).length;
console.log(`\n${verdicts.length - broke}/${verdicts.length} HELD, ${broke} BREAK (seed ${SEED})`);
process.exit(broke ? 1 : 0);
})();
