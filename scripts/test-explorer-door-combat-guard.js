// Explorer break-it 2026-10-09: door verbs vs live combat.
// Hostile-player attacks:
//   A. EXPLOIT: raw Game.enterBuilding() mid-combat on the haven node.
//      Every sibling movement verb (travelTo, examineCell, clearBlockage,
//      buildBridge, tryNodeExit) refuses mid-fight at the engine level —
//      enterBuilding/exitBuilding did not. A raw call teleports the player
//      inside while the fight stays live: desynced fight, free flee with no
//      barrier roll, no doorFledMonsters stash, no consequences.
//   B. EXPLOIT: raw Game.exitBuilding() mid-combat (symmetric; teleports you
//      back outside with the fight live).
//   C. Legit path preserved: the flee-by-door branch (tbPlayerMove door tile)
//      is the one sanctioned mid-combat caller — it passes the doorFlee flag.
//   D. IDEMPOTENCY: enterBuilding while already inside / exitBuilding while
//      already outside must not teleport (free reposition).
//   E. HONESTY: refusals say the barrier is the way out, like the siblings.
//
// Harness: FULL src/js list in index.html order (minus DOM-only app.js,
// sprites.js, tile-scenes.js, move-anim.js, drama.js); seeded Math.random
// BEFORE eval (modules capture it at load); window stubbed for eval, deleted
// before playing (sync combat path).
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');

let _seed = 20261009;
const RNG = { reset(s) { _seed = (s >>> 0) || 1; }, next() { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; } };
Math.random = RNG.next.bind(RNG);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
[
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/convo-scene.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/broadcast.js', 'src/js/contestEngine.js', 'src/js/alienPlayers.js',
  'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
  'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js',
  'src/js/corruption.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/fieldFights.js',
  'src/js/villager-objectives.js', 'src/js/codex-people.js', 'src/js/membership.js',
  'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js',
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

let N = 0;
function ok(c, m) { N++; assert(c, m); console.log('ok ' + N + ' - ' + m); }

let log = [];
const _say = Game.say.bind(Game);
Game.say = t => { log.push(String(t)); return _say(t); };
const said = () => log.join('\n');
const clearLog = () => { log = []; };

function fresh() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 100; s.maxHp = 100; s.hp = 100; s.kcal = 3000;
  s.mx = 4; s.my = 4;
  Game.state.over = false;
  Game.tbfight = null;
  Game.state.doorFledMonsters = null;
  clearLog();
  return s;
}
// Start a fight the test can survive: full health first (startCombat runs
// the monster's opening turn immediately when it's faster — the hushwolf
// is — so back-to-back test fights would otherwise chip the player dead,
// which is correct game behavior, not a test failure).
function startFight() {
  Game.state.scholar.health = Game.maxHealth ? Game.maxHealth() : 100;
  Game.startCombat('hushwolf');
  ok(Game.inCombat(), 'setup — fight is live');
}

(async () => {
  await Game.init();
  for (const seed of [20261009, 777, 4242]) {
    RNG.reset(seed);
    fresh();
    ok(Game.playerTile().type === 'haven', `seed ${seed}: setup — player starts at haven node`);

    // ---------- A. EXPLOIT: raw enterBuilding mid-combat ----------
    // Real state: player OUTSIDE on the haven grounds, fighting.
    Game.exitBuilding();
    ok(Game.state.scholar.insideHaven === false, `seed ${seed}: A setup — outside on the grounds`);
    startFight();
    const beforeMx = Game.state.scholar.mx, beforeMy = Game.state.scholar.my;
    clearLog();
    const r = Game.enterBuilding();
    ok(r === false, `seed ${seed}: A — raw enterBuilding() mid-combat refused (got ${r})`);
    ok(Game.state.scholar.insideHaven !== true, `seed ${seed}: A — player NOT moved inside`);
    ok(Game.state.scholar.mx === beforeMx && Game.state.scholar.my === beforeMy, `seed ${seed}: A — no position teleport`);
    ok(Game.inCombat(), `seed ${seed}: A — fight still live and intact after refusal`);
    ok(/barrier/i.test(said()), `seed ${seed}: A — refusal names the barrier (honest, like siblings)`);
    Game.tbEnd('debug'); Game.tbfight = null;

    // ---------- B. EXPLOIT: raw exitBuilding mid-combat ----------
    // Simulate the desynced state the old code allowed (inside + live fight)
    // to prove the symmetric guard.
    Game.state.scholar.insideHaven = true;
    startFight();
    clearLog();
    const r2 = Game.exitBuilding();
    ok(r2 === false, `seed ${seed}: B — raw exitBuilding() mid-combat refused (got ${r2})`);
    ok(Game.state.scholar.insideHaven === true, `seed ${seed}: B — player stays inside`);
    ok(Game.inCombat(), `seed ${seed}: B — fight still live after refusal`);
    Game.tbEnd('debug'); Game.tbfight = null;
    Game.state.scholar.insideHaven = false;

    // ---------- C. legit door-flee path preserved ----------
    // Real door-flee state: OUTSIDE fighting -> enterBuilding(true); then
    // INSIDE fighting (desync-proof) -> exitBuilding(true).
    Game.exitBuilding();
    startFight();
    clearLog();
    const r3 = Game.enterBuilding(true); // the flag the flee-by-door branch passes
    ok(r3 === true, `seed ${seed}: C — enterBuilding(doorFlee) allowed mid-combat (legit path)`);
    ok(Game.state.scholar.insideHaven === true, `seed ${seed}: C — door-flee moves player inside`);
    Game.tbfight = null;
    startFight();
    ok(Game.state.scholar.insideHaven === true, `seed ${seed}: C setup — inside, fighting`);
    const r4 = Game.exitBuilding(true);
    ok(r4 === true, `seed ${seed}: C — exitBuilding(doorFlee) allowed mid-combat (legit path)`);
    ok(Game.state.scholar.insideHaven === false, `seed ${seed}: C — door-flee moves player outside`);
    Game.tbEnd('debug'); Game.tbfight = null;

    // ---------- D. idempotency: no free teleports ----------
    fresh(); // starts INSIDE the hall
    ok(Game.enterBuilding() === false, `seed ${seed}: D — enterBuilding() while inside refused`);
    ok(/already inside/i.test(said()), `seed ${seed}: D — refusal is honest`);
    Game.state.scholar.mx = 2; Game.state.scholar.my = 2;
    Game.enterBuilding();
    ok(Game.state.scholar.mx === 2 && Game.state.scholar.my === 2, `seed ${seed}: D — no teleport on refused entry`);
    clearLog();
    ok(Game.exitBuilding() === true, `seed ${seed}: D setup — exit works`);
    Game.state.scholar.mx = 1; Game.state.scholar.my = 1;
    clearLog();
    const r5 = Game.exitBuilding();
    ok(r5 === false, `seed ${seed}: D — exitBuilding() while outside refused (got ${r5})`);
    ok(/already outside/i.test(said()), `seed ${seed}: D — refusal is honest`);
    ok(Game.state.scholar.mx === 1 && Game.state.scholar.my === 1, `seed ${seed}: D — no teleport on refused exit`);

    // ---------- E. honest UI path out of combat still works ----------
    fresh(); // starts INSIDE
    clearLog();
    ok(Game.exitBuilding() === true, `seed ${seed}: E — exitBuilding() out of combat still works`);
    ok(Game.enterBuilding() === true, `seed ${seed}: E — enterBuilding() out of combat still works`);
    ok(Game.exitBuilding() === true, `seed ${seed}: E — exitBuilding() again still works`);
  }
  console.log(`\nPASS: ${N} assertions across 3 seeds`);
})().catch(e => { console.error('PROOF FAILED:', e.message); process.exit(1); });
