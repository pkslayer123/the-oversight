// Proof: break-it monsters run — sunbasker dusk honesty (Steve 2026-10-08).
// CATCH: monsters.json weakness promises "it won't fight in shade or at
// dusk", and the code comment says "Shade or dusk: it flattens" — but the
// engine tested isNight() (dayPart 3 only), so at dusk (dayPart 2) the
// sunbasker kept basking, charging, and biting. Copy said dusk; engine said
// night. FIX: dusk (dayPart 2) flattens it too, with its own honest line.
// Run twice: --gamejs /tmp/game-head.js (documents the old lie) and
// --gamejs src/js/game.js (proves the fix).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const gi = args.indexOf('--gamejs');
const GAMEJS = gi >= 0 ? path.resolve(ROOT, args[gi + 1]) : path.join(ROOT, 'src/js/game.js');
const IS_HEAD = GAMEJS.includes('game-head');

let _s = 99;
function rng() {
  _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
Math.random = rng;
global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))),
});
global.window = global;

const ORDER = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'GAMEJS', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/convo-scene.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
];

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok: ' + name); }
  else { fail++; console.log('  FAIL: ' + name + (extra ? ' — ' + extra : '')); }
};

async function scenario(dayPart) {
  _s = 99;
  global.window = global; // re-stub: deleted after each eval pass
  for (const f of ORDER) {
    const p = f === 'GAMEJS' ? GAMEJS : path.join(ROOT, f);
    eval(fs.readFileSync(p, 'utf8'));
  }
  delete global.window;
  const Game = globalThis.Scattering.Game;
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.audioEvent = function () {};
  const messages = [];
  Game.say = function (m) { messages.push(String(m)); };
  Game.dayPart = dayPart;
  // put the monster in sunlight (not shade): mock tbInShade false
  Game.tbInShade = function () { return false; };
  const mdef = Game.data.monsters.find(m => m.id === 'sunbasker');
  const fighters = [
    { key: 'p', kind: 'player', name: 'You', emoji: 'x', hp: 200, maxHp: 200, speed: 3, mx: 4, my: 4, alive: true, fled: false, moveLeft: 3, acted: false },
    { key: 'm', kind: 'monster', monsterId: 'sunbasker', mdef, name: 'T', emoji: 'x', hp: 50, maxHp: 50, speed: 3, mx: 4, my: 5, alive: true, fled: false, moveLeft: 3, acted: false, threatQueue: [], telegraph: null, beamPhase: 'stalk', sbCharge: 0 },
  ];
  Game.tbfight = { fighters, order: ['p', 'm'], turnIdx: 1, round: 2, over: false, style: 0 };
  Game.tbMonsterTurn(Game.tbFighter('m'));
  const m = Game.tbFighter('m');
  return { flat: !!m.sbFlat, phase: m.beamPhase, charge: m.sbCharge || 0, saidDying: messages.some(x => /dying|gone/i.test(x)) };
}

(async () => {
  // dusk (dayPart 2): the promise says it won't fight.
  const dusk = await scenario(2);
  // night (dayPart 3): control — always flattened.
  const night = await scenario(3);
  // midday (dayPart 1): control — always basks.
  const mid = await scenario(1);

  console.log(`  [${IS_HEAD ? 'HEAD (before)' : 'patched (after)'}] dusk: flat=${dusk.flat} phase=${dusk.phase} | night: flat=${night.flat} | midday: flat=${mid.flat}`);

  if (IS_HEAD) {
    // Document the lie on HEAD: dusk does NOT flatten (the bug).
    ok('HEAD documents the lie: dusk sunbasker keeps fighting', !dusk.flat && dusk.phase !== 'flat',
       `flat=${dusk.flat} phase=${dusk.phase}`);
  } else {
    ok('dusk flattens the sunbasker (weakness promise kept)', dusk.flat && dusk.phase === 'flat' && dusk.charge === 0,
       `flat=${dusk.flat} phase=${dusk.phase} charge=${dusk.charge}`);
    ok('night still flattens (control)', night.flat);
    ok('midday still basks (control)', !mid.flat && mid.charge >= 0);
  }
  console.log(`\nsunbasker dusk proof: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
