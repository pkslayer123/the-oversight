#!/usr/bin/env node
// ADVERSARIAL (explorer loop 2026-10-08): returnToVillage integrity.
//   V8. Callers: travelTo arrival (free), endDay over/death (narrative). Attack:
//       - PIN ("safe even when called without walking") with a follower in tow:
//         party stranded? positions out of bounds? inside/outside desync?
//       - inventory loss across the PIN? day/kcal cost leaked in?
//       - idempotency: calling it twice at haven.
// Seeded RNG installed BEFORE eval (modules capture Math.random at load).
// Run: node scripts/test-explorer-adv-return-20261008.js [SEED]
const fs = require('fs');
const path = require('path');
const WS = '/home/hatch/workspace/worktrees/playtest-explorer';
const SEED = parseInt(process.argv[2] || process.env.SEED || '20261008', 10);
(function seed() {
  let a = SEED >>> 0;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(WS, f), 'utf8'))) });
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/alienPlayers.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
 'src/js/debug-scenarios.js', 'src/js/build.js'
].forEach(f => eval(fs.readFileSync(path.join(WS, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`   [OK] ${name}`); }
  else { fail++; console.log(`   [FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
};

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  console.log('=== test-explorer-adv-return-20261008 (seed ' + SEED + ') ===');
  const v = Game.state.village;
  const hvx = v.px ?? 4, hvy = v.py ?? 4;

  // walk one node out (pick an unblocked d=1 neighbor dynamically)
  const dest1 = Game.travelTargets().find(t => t.d === 1 && !Game.travelBlockage(t.x, t.y));
  check('V8 setup: an unblocked neighbor exists', !!dest1);
  if (dest1) Game.travelTo(dest1.x, dest1.y);
  check('V8 setup: traveled one node out', !!dest1 && Game.map.px === dest1.x && Game.map.py === dest1.y,
    `(${Game.map.px},${Game.map.py})`);

  // attach a follower (travelingWith non-empty) and give them a position
  const ps = Game.partyState();
  const fid = (v.roster || []).find(id => id !== Game.villagerId);
  check('V8 setup: roster has a follower candidate', !!fid);
  if (fid) {
    ps.followers.push(fid);
    Game.placePartyAtPlayer();
  }
  const withYou = Game.travelingWith();
  check('V8 setup: travelingWith non-empty', withYou.length > 0, `n=${withYou.length}`);

  const dayBefore = Game.state.scholar.day;
  const kcalBefore = Game.state.scholar.kcal;
  const invBefore = JSON.stringify(Game.state.scholar.inventory || []);
  const awayNewsBefore = (Game.state.scholar.awayNews || []).length;

  let threw = null;
  try { Game.returnToVillage(); } catch (e) { threw = e.message; }
  check('V8 returnToVillage does not throw', threw === null, threw);
  check('V8 PIN: player at haven node', Game.map.px === hvx && Game.map.py === hvy,
    `(${Game.map.px},${Game.map.py}) vs haven (${hvx},${hvy})`);
  check('V8 costs nothing: day unchanged', Game.state.scholar.day === dayBefore,
    `${dayBefore} -> ${Game.state.scholar.day}`);
  check('V8 costs nothing: kcal unchanged', Game.state.scholar.kcal === kcalBefore,
    `${kcalBefore} -> ${Game.state.scholar.kcal}`);
  check('V8 no lost inventory', JSON.stringify(Game.state.scholar.inventory || []) === invBefore,
    'inventory differs');
  // party integrity: positions valid, still traveling with you
  const pos = (ps.positions || {})[fid];
  check('V8 follower has a valid grid position',
    !!pos && pos.mx >= 0 && pos.mx <= 8 && pos.my >= 0 && pos.my <= 8,
    pos ? `(${pos.mx},${pos.my})` : 'no position');
  check('V8 follower still traveling with you', Game.travelingWith().includes(fid),
    Game.travelingWith().join(','));

  // idempotency: call again at haven
  let threw2 = null;
  const logLen = (Game.log || []).length;
  try { Game.returnToVillage(); } catch (e) { threw2 = e.message; }
  check('V8 idempotent at haven (no throw)', threw2 === null, threw2);
  check('V8 still at haven after second call', Game.map.px === hvx && Game.map.py === hvy,
    `(${Game.map.px},${Game.map.py})`);

  // static: callers are travelTo arrival + endDay over/death; endDay guards villageLost first
  const gameSrc = fs.readFileSync(path.join(WS, 'src/js/game.js'), 'utf8');
  const allRefs = (gameSrc.match(/returnToVillage\(\)/g) || []).length;
  const callers = allRefs - 1; // minus the definition itself
  check('V8 known callers only (travelTo arrival, endDay x2)', callers === 3, `callers=${callers}`);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
