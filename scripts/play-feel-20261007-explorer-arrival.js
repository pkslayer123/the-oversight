#!/usr/bin/env node
// FEEL PLAYTEST (2026-10-07), EXPLORER archetype — the ARRIVAL BEAT.
// Angle NOT covered by the 20261007 corner-walk (plants/edge/map-fill),
// curiosity (whisper→examine), or return (out-and-back) runs: the moment of
// arrival itself, over a long wander. Questions:
//   (a) does every first-visit arrival speak (no silent arrivals, no undefined)?
//   (b) arrival-line variety in the wild across tile types;
//   (c) the homecoming: walk back to haven — what does the return feel like,
//       and what does nodeDetail() show (haven branch was reading arr.text,
//       broken since 2026-10-05; fixed this run)?
// Engine: HEAD-frozen extract (/tmp/explorer-head) with the haven fixes.
// Seeded RNG (mulberry32, SEED env). Run: node scripts/play-feel-20261007-explorer-arrival.js [SEED]
const fs = require('fs');
const path = require('path');
const ROOT = '/tmp/explorer-head';
if (!fs.existsSync(ROOT)) { console.error('missing /tmp/explorer-head extract'); process.exit(2); }

const SEED = parseInt(process.env.SEED || process.argv[2] || '20261007', 10);
(function seed() {
  let a = SEED >>> 0;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js needs window at load
const SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
  'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js'];
for (const f of SCRIPTS) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error(`FAILED loading ${f}: ${e.message}`); process.exit(2); }
}
delete global.window;

const Game = globalThis.Scattering.Game;
const says = [];
const origSay = Game.say.bind(Game);
Game.say = (t, ...a) => { says.push(String(t)); return origSay(t, ...a); };
const sayMark = () => says.length;
const newSays = (since) => says.slice(since);

let failures = 0;
const fail = (m) => { failures++; console.log('  FAIL: ' + m); };
const note = (m) => console.log('  ' + m);

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  note(`departed, at (${Game.map.px},${Game.map.py})`);

  // ---- ACT 1: long wander, greedy toward unvisited ----
  const seenTypes = {};
  const arrivalLines = {}; // type -> Set of flavor texts heard
  let hops = 0, blocked = 0, firstVisits = 0, silentArrivals = 0;
  for (let i = 0; i < 30 && hops < 25; i++) {
    if (Game.over) { note('game ended mid-wander'); break; }
    let targets;
    try { targets = Game.travelTargets(); } catch (e) { note('travelTargets threw: ' + e.message); break; }
    if (!targets || !targets.length) break;
    const open = targets.filter(t => {
      try { return !Game.travelBlockage(t.x, t.y); } catch (e) { return false; }
    });
    blocked += targets.length - open.length;
    if (!open.length) break;
    const unvisited = open.filter(t => { const d = Game.tileAt(t.x, t.y); return d && !d.visited; });
    const pick = (unvisited.length ? unvisited : open)[Math.floor(Math.random() * (unvisited.length ? unvisited.length : open.length))];
    const before = sayMark();
    try { Game.travelTo(pick.x, pick.y); } catch (e) { note(`travelTo threw: ${e.message}`); continue; }
    hops++;
    const tile = Game.tileAt(Game.map.px, Game.map.py);
    const msgs = newSays(before).join('\n');
    seenTypes[tile.type] = (seenTypes[tile.type] || 0) + 1;
    if (!tile._countedVisit) { /* visited flag already set inside travelTo */ }
    if (msgs.includes('undefined') || msgs.includes('null')) fail(`arrival said undefined/null at (${Game.map.px},${Game.map.py}): ${msgs.slice(0, 120)}`);
    // first-visit flavor: the arrival paragraph (— Title —\n<text>)
    const m = msgs.match(/— ([^—\n]+) —\n(.+)/);
    if (m) {
      firstVisits++;
      const flavor = m[2].split('\n')[0].trim();
      if (!flavor) { silentArrivals++; fail(`empty arrival flavor at ${tile.type}`); }
      else {
        arrivalLines[tile.type] = arrivalLines[tile.type] || new Set();
        arrivalLines[tile.type].add(flavor);
      }
    }
  }
  note(`wander: ${hops} hops, ${firstVisits} first-visit arrivals, ${silentArrivals} silent, ${blocked} blocked targets seen`);
  note('tile types visited: ' + Object.entries(seenTypes).map(([k, v]) => `${k}×${v}`).join(', '));
  for (const [t, set] of Object.entries(arrivalLines))
    note(`  arrival variety ${t}: ${set.size} unique lines over ${seenTypes[t]} visits`);

  // ---- ACT 2: homecoming ----
  // walk toward (4,4) haven stepwise
  let guard = 0;
  while ((Game.map.px !== 4 || Game.map.py !== 4) && guard++ < 20 && !Game.over) {
    let targets;
    try { targets = Game.travelTargets(); } catch (e) { break; }
    const open = targets.filter(t => { try { return !Game.travelBlockage(t.x, t.y); } catch (e) { return false; } });
    if (!open.length) break;
    open.sort((a, b) => (Math.abs(a.x - 4) + Math.abs(a.y - 4)) - (Math.abs(b.x - 4) + Math.abs(b.y - 4)));
    const before = sayMark();
    try { Game.travelTo(open[0].x, open[0].y); } catch (e) { break; }
    const msgs = newSays(before).join('\n');
    if (msgs.includes('undefined')) fail('undefined in homecoming travel message');
  }
  const home = (Game.map.px === 4 && Game.map.py === 4);
  note(home ? 'made it home to (4,4)' : `did not reach haven (at ${Game.map.px},${Game.map.py})`);
  if (home) {
    const nd = Game.nodeDetail();
    note(`home nodeDetail: type=${nd.type} isHaven=${nd.isHaven} epithet="${nd.epithet}"`);
    note(`home nodeDetail.text: "${String(nd.text).slice(0, 100)}..."`);
    if (nd.text === undefined || nd.text === null || nd.text === '') fail('haven nodeDetail().text empty on homecoming');
    else note('homecoming beat speaks (haven arrival pool, pinned per world)');
  }

  if (failures) { console.log(`\n${failures} FAILURES (seed ${SEED})`); process.exit(1); }
  console.log(`\nDONE (seed ${SEED}) — ${hops} hops, ${firstVisits} arrivals, home=${home}`);
})().catch(e => { console.error('HARNESS ERROR:', e.stack.split('\n').slice(0, 4).join('\n')); process.exit(2); });
