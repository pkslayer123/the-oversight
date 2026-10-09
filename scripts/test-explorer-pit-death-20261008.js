#!/usr/bin/env node
// PROOF TEST (explorer, 2026-10-08): own-pit-trap death on travelTo arrival.
// Before the 2026-10-08 break-it fix, a 0-HP scholar kept wandering with no
// death flow. After: the pit can kill you, honestly, with the cause named.
// We force the 50% trigger deterministically by wrapping Math.random.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ a >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
 'src/js/villager-agency.js', 'src/js/fieldFights.js', 'src/js/villager-objectives.js',
 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const say = () => { const l = Game.log || []; const s = l.map(x => x.text || x).join(' '); l.length = 0; return s; };
let fails = 0;
const check = (name, ok, detail) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fails++; };

(async () => {
  await Game.init();
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100; s.mx = 4; s.my = 4;
  say();

  // dig a pit on an adjacent node, leave, come back nearly dead
  const tg = Game.travelTargets().find(t => Math.abs(t.x - 4) + Math.abs(t.y - 4) === 1);
  check('has adjacent target', !!tg);
  Game.travelTo(tg.x, tg.y, true); say();
  const t = Game.playerTile();
  t.traps = t.traps || [];
  t.traps.push({ recipeId: 'pit_trap', setDay: (s.day || 0) - 2, uses: 1 });
  const back = Game.travelTargets().find(tt => tt.x === 4 && tt.y === 4);
  Game.travelTo(back.x, back.y, true); say();
  s.health = 1;
  s.kcal = 2400; s.hydration = 100;

  // force the 50% trigger: wrap Math.random to return 0.1 (trigger) then restore
  const origRandom = Math.random;
  const oldId = Game.villagerId;
  let deathCause = null;
  const _pd = Game.playerDeath;
  Game.playerDeath = function (c) { deathCause = c; return _pd.call(this, c); };
  Math.random = () => 0.1;
  Game.travelTo(tg.x, tg.y, true);
  Math.random = origRandom;
  Game.playerDeath = _pd;
  const msg = say();
  check('pit triggered', /your own leg|YOUR pit/i.test(msg), msg.slice(0, 100));
  check('death flow ran with named cause', deathCause === 'your own pit trap', `cause=${deathCause}`);
  check('mantle passed to a new bearer', Game.villagerId !== oldId, `${oldId} -> ${Game.villagerId}`);
  check('new bearer alive', Game.state.scholar.health > 0, `health=${Game.state.scholar.health}`);
  // village-as-protagonist: the run continues as someone else; no 0-HP zombie wandering
  check('no 0-hp zombie state', Game.state.scholar.health > 0, `over=${Game.over}`);
  const fallen = (Game.state.village.fallen || []).find(f => f.villagerId === oldId);
  check('memorial records the pit', !!(fallen && /pit trap/i.test(fallen.cause || '')), fallen ? fallen.cause : 'no fallen entry');
  console.log(fails ? `\n${fails} FAILURES` : '\nALL GREEN');
  process.exit(fails ? 1 : 0);
})();
