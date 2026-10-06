// Prey behavior deepening + role-audit fix #4 proof (Steve 2026-10-06).
// Proves, in src/js/encounters.js ONLY:
//   (a) prey flees with species-distinct behavior:
//       - deer: straight-line 2-tile burst on fresh legs (outpaces you early)
//       - turkey: flutter-hop x2, then REGROUPS (your window), then up again
//       - rabbit: zigzag that never repeats the same hop twice
//   (b) cornering produces PANIC, not a freeze: trapped prey lashes out or
//       breaks through — every turn narrated, audio hook fired
//   (c) the isHunter flat +0.2 backstory buff is GONE; the practice-XP path
//       exists: hunters start at 3, strikes +1, kills +2, capped at +0.2
//   (d) audio hooks fire: flee-startle (animalBolt), corner-panic
//       (animalPanic), kill (animalKill)
// Usage: node scripts/test-encounters-prey-20261006.js
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
function freshGame() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60; s.health = 100;
  Game.genDetail = flatGrid;
  Game.log = [];
  Game.state.codex.animalEncounters = {};
  return s;
}
function spawn(s, id, mx, my, extra) {
  const cfg = Game.encPreyCfg(id);
  s.animal = Object.assign({ id, mx, my, aware: 0, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0 }, extra || {});
  return s.animal;
}
function bow(s) {
  const def = Game.data.items.find(i => i.id === 'crude_bow');
  s.inventory.push({ itemId: 'crude_bow', name: def.name, units: 1 });
  s.equipped = { weapon: { itemId: 'crude_bow', name: def.name } };
}
function logText() { const l = (Game.log || []).join('\n'); Game.log = []; return l; }

// audio hook recorder: every audioEvent name fired, in order
const fired = [];
const _ae = Game.audioEvent;
Game.audioEvent = function (name, data) {
  fired.push(name);
  try { return _ae.call(this, name, data); } catch (e) {}
};
function firedSince(mark) { return fired.slice(mark); }

// deterministic Math.random: cycle through the given values
const _rand = Math.random;
function stubRand(vals) {
  let i = 0;
  Math.random = () => vals[i++ % vals.length];
}
function restoreRand() { Math.random = _rand; }

(async () => {
  await Game.init();

  // ================= (a1) DEER: straight-line burst, outpaces you =================
  {
    const s = freshGame();
    Game.genDetail = flatGrid;
    const a = spawn(s, 'white_tailed_deer', 4, 4, { aware: 1 });
    s.mx = 4; s.my = 7; // dist 3 — inside notice, far enough to see the burst
    const mark = fired.length;
    Game.log = [];
    Game.animalTurn();
    ok('deer bursts 2 tiles on fresh legs', a.mx === 4 && a.my === 2, `at ${a.mx},${a.my}`);
    ok('deer burst is a straight line (no zigzag)', a.mx === 4, `mx=${a.mx}`);
    ok('deer burst costs 2 stamina (sprint is real, and ends)', a.stamina === 1, `stamina=${a.stamina}`);
    ok('deer snorts on the bolt (species-distinct audio)', firedSince(mark).includes('animalSnort'));
    ok('flee-startle hook fires (animalBolt)', firedSince(mark).includes('animalBolt'));
    const t = logText();
    ok('deer bolt has distinct telegraph text', /white tail/i.test(t), t.slice(0, 120));
  }

  // ================= (a2) TURKEY: flutter-hop x2, then REGROUP =================
  {
    const s = freshGame();
    Game.genDetail = flatGrid;
    // interior geometry: the chase stays off the map edge (edge + pressure
    // = cornered, which is correct behavior — just not what this block tests)
    const a = spawn(s, 'wild_turkey', 4, 3, { aware: 1 });
    s.mx = 4; s.my = 2; // dist 1
    // turn 1: bolt -> flutter-hop 1
    Game.animalTurn();
    ok('turkey bolt turn 1: one flutter-hop', a.mx === 4 && a.my === 4 && a.pstate === 'bolt', `${a.mx},${a.my} ${a.pstate}`);
    // player closes in (the chase)
    s.mx = 4; s.my = 3;
    Game.animalTurn();
    ok('turkey bolt turn 2: second flutter-hop', a.mx === 4 && a.my === 5 && a.pstate === 'bolt', `${a.mx},${a.my} ${a.pstate}`);
    // player closes in again
    s.mx = 4; s.my = 4;
    Game.log = [];
    Game.animalTurn();
    ok('turkey regroups after 2 flutter-hops (poor sustained flier)', a.pstate === 'regroup', a.pstate);
    const t = logText();
    ok('regroup is narrated as the player window', /Your window/i.test(t), t.slice(0, 160));
    ok('regroup has a phase badge', Game.encPreyPhaseBadge(a) === '🦃 regrouping', Game.encPreyPhaseBadge(a));
    // regroup turn: still, then back in the air (no double bolt text)
    Game.log = [];
    Game.animalTurn();
    ok('turkey returns to bolt after regrouping', a.pstate === 'bolt', a.pstate);
    ok('no double bolt telegraph on the regroup return', !/decides you're trouble/.test(logText()));
  }

  // ================= (a3) RABBIT: zigzag, never the same hop twice =================
  {
    const s = freshGame();
    Game.genDetail = flatGrid;
    const a = spawn(s, 'cottontail_rabbit', 4, 4, { aware: 1 });
    s.mx = 4; s.my = 7;
    stubRand([0.0]); // idx 0 -> [1,0]
    Game.animalTurn();
    restoreRand();
    ok('rabbit hops one tile (no deer burst)', a.mx === 5 && a.my === 4, `${a.mx},${a.my}`);
    ok('rabbit remembers its last hop', a.lastZig === '1,0', a.lastZig);
    const prev = a.lastZig;
    stubRand([0.0, 0.2]); // first pick repeats -> forced repick -> idx 1 [-1,0]
    Game.animalTurn();
    restoreRand();
    ok('rabbit never repeats the same hop twice', a.lastZig !== prev, `${prev} -> ${a.lastZig}`);
    ok('rabbit jinked (changed direction)', a.mx === 4 && a.my === 4, `${a.mx},${a.my}`);
  }

  // ================= (b) CORNERING: panic, not a freeze =================
  {
    const s = freshGame();
    // ring of walls around (4,4): nowhere to run
    const wg = flatGrid();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx || dy) wg[4 + dy][4 + dx] = 'wall';
    }
    Game.genDetail = () => wg;
    const a = spawn(s, 'white_tailed_deer', 4, 4, { aware: 1 });
    s.mx = 4; s.my = 6; // dist 2 — closing in
    let mark = fired.length;
    Game.log = [];
    Game.animalTurn();
    ok('trapped deer is CORNERED (not frozen, not quietly gone)', a.pstate === 'cornered', a.pstate);
    ok('corner panic hook fires (animalPanic)', firedSince(mark).includes('animalPanic'));
    let t = logText();
    ok('cornering is narrated (no silent turns)', /TRAPPED/i.test(t), t.slice(0, 160));
    ok('cornered badge reads', Game.encPreyPhaseBadge(a) === '😱 cornered');
    // still trapped, player at dist 2: desperation has no opening — narrated, not frozen
    mark = fired.length;
    Game.log = [];
    Game.animalTurn();
    ok('cornered-with-no-opening stays narrated', /wheels, snorting/i.test(logText()));
    ok('panic audio keeps firing while trapped', firedSince(mark).includes('animalPanic'));
    // player closes to dist 1: it lashes out (deterministic rand)
    s.mx = 4; s.my = 5;
    stubRand([0.1]); // < 0.5 -> lash out; damage = 4 + floor(0.1*5) = 4
    mark = fired.length;
    Game.log = [];
    Game.animalTurn();
    restoreRand();
    ok('cornered deer LASHES OUT (panic, not a freeze)', s.health === 96, `health=${s.health}`);
    t = logText();
    ok('lash-out is species-flavored', /hooves flashing/i.test(t), t.slice(0, 160));
    ok('lash-out fires panic + bite audio', firedSince(mark).includes('animalPanic'));
    // open one gap toward the nearest edge: it breaks through
    wg[3][3] = 'grass';
    s.mx = 4; s.my = 7; // dist 3 — out of lash range, dash decides
    Game.log = [];
    Game.animalTurn();
    ok('cornered deer BREAKS THROUGH an opening', a.pstate === 'bolt' && !(a.mx === 4 && a.my === 4),
      `${a.pstate} at ${a.mx},${a.my}`);
    ok('cornered label is honest perception', /cornered, eyes wild/i.test(Game.encAnimalLabel(
      Object.assign({}, a, { pstate: 'cornered' }))));
  }

  // ================= (c) ROLE-AUDIT FIX #4: no permanent backstory buff =================
  {
    const src = fs.readFileSync(path.join(ROOT, 'src/js/encounters.js'), 'utf8');
    ok('flat (isHunter ? 0.2 : 0) is gone from the chance formula', !src.includes('(isHunter ? 0.2 : 0)'));
    ok('no isHunter variable remains', !/var isHunter\s*=/.test(src));
    const s = freshGame();
    // non-hunter: seeded at 0, no free bonus
    s.huntXPSeeded = undefined; s.huntXP = undefined;
    Game.log = [];
    let b = Game.encHuntXPBonus({ formerOccupation: 'fisher' });
    ok('non-hunter starts at 0 XP, 0 bonus', b === 0 && s.huntXP === 0, `bonus=${b} xp=${s.huntXP}`);
    // hunter: background sets the START
    s.huntXPSeeded = undefined; s.huntXP = undefined;
    Game.log = [];
    b = Game.encHuntXPBonus({ formerOccupation: 'Hunter' });
    ok('hunter starts ahead (3 XP = +0.12)', s.huntXP === 3 && Math.abs(b - 0.12) < 1e-9, `bonus=${b} xp=${s.huntXP}`);
    ok('hunter head start is narrated honestly', /head start, not a destiny/i.test(logText()));
    // practice: strikes +1, kills +2
    Game.encHuntPracticed('strike');
    ok('a strike adds 1 XP', s.huntXP === 4 && Math.abs(Game.encHuntXPBonus({}) - 0.16) < 1e-9, `xp=${s.huntXP}`);
    Game.encHuntPracticed('kill');
    ok('a kill adds 2 XP', s.huntXP === 6, `xp=${s.huntXP}`);
    // cap: never above +0.2
    Game.encHuntPracticed('kill'); Game.encHuntPracticed('kill');
    b = Game.encHuntXPBonus({});
    ok('practice bonus caps at +0.2', b === 0.2, `bonus=${b} xp=${s.huntXP}`);
    ok('cap holds after more practice', Game.encHuntXPBonus({}) === 0.2);
  }

  // ================= (d) KILL hook + XP accrual through a real hunt =================
  {
    const s = freshGame();
    Game.genDetail = flatGrid;
    bow(s);
    const inv0 = s.inventory.length;
    const a = spawn(s, 'cottontail_rabbit', 4, 2, { aware: 0, pstate: 'winded' });
    s.mx = 4; s.my = 4; // dist 2, bow range 5 — winded: no flee, strike proceeds
    s.huntXPSeeded = undefined; s.huntXP = undefined;
    stubRand([0.0]); // roll 0 < chance: the kill lands
    const mark = fired.length;
    Game.huntAnimal();
    restoreRand();
    ok('kill hook fires (animalKill)', firedSince(mark).includes('animalKill'));
    ok('kill resolves: encounter over, carcass in pack', s.animal === null && s.inventory.length === inv0 + 1);
    ok('a real kill accrues hunt XP', (s.huntXP || 0) >= 2, `xp=${s.huntXP}`);
  }

  // ================= noise ladder sanity: still < walk =================
  {
    const s = freshGame();
    Game.genDetail = flatGrid;
    spawn(s, 'white_tailed_deer', 4, 4, { aware: 0 });
    s.mx = 4; s.my = 7;
    Game.animalTurn(); // beat 1
    s.mx = 5; s.my = 7; // beat 2: walk (1 tile)
    Game.animalTurn();
    const awareWalk2 = s.animal.aware;
    const s2 = freshGame();
    Game.genDetail = flatGrid;
    spawn(s2, 'white_tailed_deer', 4, 4, { aware: 0 });
    s2.mx = 4; s2.my = 7;
    Game.animalTurn(); // beat 1
    Game.animalTurn(); // beat 2: stand still (0 tiles)
    const awareStill2 = s2.animal.aware;
    ok('standing still builds awareness slower than walking', awareStill2 < awareWalk2,
      `still=${awareStill2.toFixed(2)} walk=${awareWalk2.toFixed(2)}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
