// Differential test: monster behavior table migration (Steve 2026-10-07).
// Proves tbMonsterTurn behaves IDENTICALLY after migrating 4 species
// (gallowdeer, speedbump_turtle, hummice, review_drone) to data-driven hooks.
// Runs each scenario against HEAD's code (golden) and the refactored code,
// compares serialized state + messages. Any difference = FAIL.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

const ENGINE_FILES = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/monsterBehaviors.js', 'src/js/progression.js', 'src/js/encounters.js',
  'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
  'src/js/justice.js', 'src/js/debug-scenarios.js'];

global.fetch = (f) => Promise.resolve({ json: () => {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) return Promise.resolve(JSON.parse(fs.readFileSync(p, 'utf8')));
  // Fall back to HEAD blob (worktree may be stale with sibling deletions)
  const blob = execSync(`git -C "${ROOT}" show HEAD:${f}`, { maxBuffer: 50 * 1024 * 1024 }).toString();
  return Promise.resolve(JSON.parse(blob));
} });

function loadTree(useHead) {
  delete globalThis.Scattering;
  delete globalThis.MonsterBehaviorHooks;
  for (const f of ENGINE_FILES) {
    let content = null;
    if (useHead) {
      try { content = execSync(`git -C "${ROOT}" show HEAD:${f}`, { maxBuffer: 50 * 1024 * 1024 }).toString(); }
      catch (e) { continue; } // monsterBehaviors.js doesn't exist in HEAD
    } else {
      // For the worktree run, prefer /tmp/game-new3.js (private-index build)
      // when it exists — the worktree copy may be stale/dirty with sibling work.
      if (f === 'src/js/game.js' && fs.existsSync('/tmp/game-new3.js')) {
        content = fs.readFileSync('/tmp/game-new3.js', 'utf8');
      } else {
        content = fs.readFileSync(path.join(ROOT, f), 'utf8');
      }
    }
    eval(content);
  }
  return globalThis.Scattering.Game;
}

// Seeded RNG for determinism
function seedRng(seed) {
  let s = seed;
  Math.random = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

async function runScenario(Game, spec) {
  seedRng(999);
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  const messages = [];
  Game.say = function (msg) { messages.push(String(msg)); };
  Game.saySituationOnce = function (m, key, msg) { messages.push(String(msg)); };
  Game.audioEvent = function () {};

  const mdef = Game.data.monsters.find(m => m.id === spec.monsterId);
  if (!mdef) throw new Error('no mdef for ' + spec.monsterId);

  const fighters = [
    { key: 'p', kind: 'player', name: 'You', emoji: '🧑', hp: 100, maxHp: 100, speed: 3, mx: 4, my: 4, alive: true, fled: false, moveLeft: 0, acted: false },
    Object.assign({ key: 'm', kind: 'monster', mdef: mdef, hp: 50, maxHp: 50, speed: 2, mx: 4, my: 5, alive: true, fled: false, moveLeft: 0, acted: false }, spec.monsterState || {}),
  ];
  // extra fighters for crowd scenarios
  for (let i = 0; i < (spec.extraFighters || 0); i++) {
    fighters.push({ key: 'a' + i, kind: 'player', name: 'Ally' + i, hp: 80, maxHp: 80, speed: 2, mx: 3 + i, my: 4, alive: true, fled: false });
  }
  Game.tbfight = { fighters: fighters, order: fighters.map(f => f.key), turnIdx: 1, over: false };

  const m = Game.tbFighter('m');
  // snapshot relevant state before
  const before = JSON.stringify({ hp: m.hp, mx: m.mx, my: m.my, turtleBunker: m.turtleBunker, beamPhase: m.beamPhase, drRecalcs: m.drRecalcs, telegraph: !!m.telegraph });
  try {
    Game.tbMonsterTurn(m);
  } catch (e) {
    messages.push('THREW: ' + e.message);
  }
  const p = Game.tbFighter('p');
  const after = {
    messages: messages,
    monster: { hp: m.hp, mx: m.mx, my: m.my, turtleBunker: m.turtleBunker, beamPhase: m.beamPhase, drRecalcs: m.drRecalcs, telegraph: !!m.telegraph, bunkerNoted: m.bunkerNoted },
    playerHp: p.hp,
  };
  return JSON.stringify(after);
}

const SCENARIOS = [
  { name: 'turtle bunker active', monsterId: 'speedbump_turtle', monsterState: { turtleBunker: 2 } },
  { name: 'turtle bunker expiring', monsterId: 'speedbump_turtle', monsterState: { turtleBunker: 1 } },
  { name: 'turtle no bunker', monsterId: 'speedbump_turtle', monsterState: {} },
  { name: 'deer antler thrash', monsterId: 'gallowdeer', monsterState: { beamPhase: 'idle' } },
  { name: 'deer firing (no thrash)', monsterId: 'gallowdeer', monsterState: { beamPhase: 'firing' } },
  { name: 'humice swarm check', monsterId: 'hummice', monsterState: {} },
  { name: 'drone crowd overload', monsterId: 'review_drone', monsterState: {}, extraFighters: 3 },
  { name: 'drone normal (1v1)', monsterId: 'review_drone', monsterState: {}, extraFighters: 0 },
  { name: 'bulldozer unmigrated', monsterId: 'bulldozer', monsterState: {} },
];

(async () => {
  let pass = 0, fail = 0;
  const ok = (name, cond, extra) => {
    if (cond) pass++;
    else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
  };

  // Schema checks (run once, on worktree)
  loadTree(false);
  const Game = globalThis.Scattering.Game;
  await Game.init();
  const mb = Game.data.monsterBehaviors;
  ok('monsterBehaviors.json loaded', !!mb && !!mb.behaviors);
  const monsterIds = Game.data.monsters.map(m => m.id);
  const missing = monsterIds.filter(id => !mb.behaviors[id]);
  ok('all 28 monsters have behavior entries', missing.length === 0, missing.join(','));
  const migrated = ['gallowdeer', 'speedbump_turtle', 'hummice', 'review_drone'];
  for (const id of migrated) {
    const hooks = (mb.behaviors[id] || {}).preTurnHooks || [];
    ok(`${id} has preTurnHooks`, hooks.length > 0);
    for (const h of hooks) {
      ok(`${id} hook ${h} registered`, typeof globalThis.MonsterBehaviorHooks[h] === 'function');
    }
  }
  ok('mbRunPreTurn exists on Game', typeof Game.mbRunPreTurn === 'function');
  ok('monsterBehavior lookup exists', typeof Game.monsterBehavior === 'function');

  // Differential: HEAD vs refactored
  const results = {};
  for (const useHead of [true, false]) {
    const G = loadTree(useHead);
    const label = useHead ? 'HEAD' : 'worktree';
    results[label] = {};
    for (const spec of SCENARIOS) {
      try {
        results[label][spec.name] = await runScenario(G, spec);
      } catch (e) {
        results[label][spec.name] = 'SETUP-THREW: ' + e.message;
      }
    }
  }

  for (const spec of SCENARIOS) {
    const a = results.HEAD[spec.name];
    const b = results.worktree[spec.name];
    if (a === b) {
      ok(`identical: ${spec.name}`, true);
    } else {
      ok(`identical: ${spec.name}`, false);
      console.log(`  HEAD:     ${a.slice(0, 300)}`);
      console.log(`  worktree: ${b.slice(0, 300)}`);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
