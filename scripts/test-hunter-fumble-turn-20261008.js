#!/usr/bin/env node
// PROOF TEST: the strike fumble ("it wriggles free!") costs the player one
// action — the animal must act ONCE after it, like every other miss path
// (near-miss, clean miss), not twice.
// BEFORE: huntAnimal's fumble branch ran this.animalTurn(); this.animalTurn();
// — the animal acted 2x for the player's 1 strike (double-advance class bug).
// AFTER: exactly one animalTurn.
// Deterministic: Math.random stubbed to 0 during the strike forces the bite
// (biteP 0.2 for wary) and the fumble (0.3) on a calm adjacent deer; the
// animalTurn calls are counted via a wrapper.
// Run: node scripts/test-hunter-fumble-turn-20261008.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const seeded = mulberry32(SEED);
Math.random = seeded;
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const _SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/alienPlayers.js',
 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
 'src/js/debug-scenarios.js'];
_SCRIPTS.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const results = [];
const check = (name, cond, detail) => { results.push([name, !!cond]); console.log(`   [${cond ? 'OK  ' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`); };

(async () => {
  await Game.init();
  console.log('== TEST: fumble = one animal turn | SEED ' + SEED + ' ==');
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.insideHaven = false; s.mx = 4; s.my = 4; s.kcal = 9000; s.health = 500;
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  const def = (Game.data.items || []).find(i => i.id === 'crude_bow') || {};
  s.equipped = { weapon: { itemId: 'crude_bow', name: def.name || 'Crude bow' } };
  const cfg = Game.encPreyCfg('white_tailed_deer');
  s.animal = { id: 'white_tailed_deer', mx: 4, my: 5, aware: 0, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0 };

  const says = [];
  const osay = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return osay(t); };
  let turns = 0;
  const origAT = Game.animalTurn.bind(Game);
  Game.animalTurn = function () { turns++; return origAT(); };

  Math.random = () => 0; // force: no flee in preyReaction, bite hits, fumble hits
  try {
    Game.huntAnimal();
  } finally {
    Math.random = seeded;
  }
  Game.animalTurn = origAT;
  Game.say = osay;

  const fumbled = says.some(t => /wriggles free/.test(t));
  const bit = says.some(t => /Teeth in your hand/.test(t));
  check('bite + fumble branch reached', bit && fumbled, says.filter(t => /wriggles|Teeth/.test(t)).join(' / ').slice(0, 100));
  check('animal acted exactly once after the fumble', turns === 1, turns + ' animalTurn call(s)');
  check('encounter continues (not ended)', !!s.animal);
  const fails = results.filter(r => !r[1]).length;
  console.log(fails ? `RESULT: FAIL (${fails})` : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})();
