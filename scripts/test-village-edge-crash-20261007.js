#!/usr/bin/env node
// PROOF TEST (explorer loop 2026-10-07): simVillageDay's strategy-bonus turf
// scan called tileAt(village.x+dx, village.y+dy) with NO bounds guard — a
// distant village at the map edge (e.g. (3,0)) made tileAt(-2) throw
// TypeError, crashing checkVillageProximity -> catchUpSim when the player
// walked within 2 tiles. An explorer hiking to an edge village crashed the
// game. Fixed with a 0..8 guard. Run: node scripts/test-village-edge-crash-20261007.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
let fails = 0;
function check(label, cond, extra) {
  console.log(`   ${cond ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) fails++;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  console.log('=== edge-village crash proof ===');
  const villages = Game.state.otherVillages || [];
  check('distant villages exist', villages.length > 0, `${villages.length} villages`);
  if (!villages.length) { process.exit(1); }

  // park a village on the north edge corner — the crash case
  const v = villages[0];
  v.x = 3; v.y = 0; v.generated = false; v.roster = null; v.day = 1;

  // 1. simVillageDay directly, many days, no throw
  let threw = null;
  try { for (let d = 0; d < 40; d++) Game.simVillageDay(v); }
  catch (e) { threw = e; }
  check('simVillageDay 40 days at edge village: no throw', !threw, threw ? threw.message : '');

  // 2. the real player path: walk within 2 tiles -> checkVillageProximity -> catchUpSim
  // use a fresh village object so the day watermark actually needs catching up
  const vEdge = { id: 'edge-prox', name: 'Proxedge', x: 3, y: 0, day: 1, population: 8, generated: false, roster: null };
  Game.state.otherVillages.push(vEdge);
  Game.state.scholar.day = 5; // give catch-up days to simulate
  Game.map.px = 3; Game.map.py = 2; // dist = 2 from (3,0)
  threw = null;
  try { Game.checkVillageProximity(); }
  catch (e) { threw = e; }
  check('checkVillageProximity near edge village: no throw', !threw, threw ? threw.message : '');
  check('edge village got generated + caught up', !!vEdge.generated, `generated=${!!vEdge.generated} day=${vEdge.day}`);

  // 3. rumor pipeline: force rumor chance to 1 and confirm a rumor lands on the scholar
  const v2 = villages[1] || villages[0];
  v2.rumored = false; v2.generated = false;
  const realRandom = Math.random;
  Math.random = () => 0.0; // rumorChance check passes
  threw = null;
  try { Game.simVillageDay(v2); } catch (e) { threw = e; }
  Math.random = realRandom;
  const rumors = Game.state.scholar.rumors || [];
  check('simVillageDay: no throw with forced rumor roll', !threw, threw ? threw.message : '');
  check('traveler rumor queued on scholar', rumors.length > 0, `${rumors.length} rumors`);
  if (rumors.length) {
    const r = rumors[rumors.length - 1];
    check('rumor names the village + a direction', /village to the \w+ called \S+/.test(r.text), r.text.slice(0, 90));
  }

  // 4. corner village (0,0): both axes out of bounds in the scan
  const v3 = { id: 'edge-test', name: 'Edgehold', x: 0, y: 0, day: 1, population: 8, generated: false, roster: null };
  threw = null;
  try { for (let d = 0; d < 10; d++) Game.simVillageDay(v3); } catch (e) { threw = e; }
  check('simVillageDay at corner (0,0): no throw', !threw, threw ? threw.message : '');

  console.log(fails ? `\nFAILURES: ${fails}` : '\nall green');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
