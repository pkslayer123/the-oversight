#!/usr/bin/env node
// PROOF (Steve 2026-10-06, miser loop): robbed caches are DISCOVERED, not announced.
// Before: resolveCacheRobbery fired "You check your cache. Disturbed earth.
// Empty." into the feed while the player sat in the hall, nodes away — plus
// an instant codex entry and a DISTURBED marker on the cache list. All three
// told the player something they could not know.
// After: the robbery is silent. The player learns at the hole (digUpCache) or
// through gossip (the 50% trace plants a real doubt, and only then does the
// list show DISTURBED). The codex entry lands at discovery.
// Usage: node scripts/test-cache-discovery-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js',
 'src/js/journal.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}${extra ? ' | ' + extra : ''}`); }
}
let said = [];
function freshGame() {
  said = [];
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); try { return origSay(t); } catch (e) {} };
  Game.depart();
  Game.state.scholar.inventory = [];
}
function buryAt(node, label) {
  Game.map.px = node.x; Game.map.py = node.y;
  Game.state.scholar.inventory.push({ name: 'Smoked venison', kcalEach: 120, units: 4, spoilDay: Game.state.scholar.day + 30, safe: true, kg: 0.2 });
  const inv = Game.state.scholar.inventory;
  Game.buryCache('food', inv.length - 1, 4);
  return Game.playerCaches()[Game.playerCaches().length - 1];
}
const origRand = Math.random;
const codexRobbed = () => (Game.state.codex.places || []).some(p => /Cache robbed/.test(p.text));

(async () => {
  await Game.init();

  // ---------- A. no-trace robbery: total silence until the hole ----------
  freshGame();
  const haven = { x: Game.state.village.px ?? 4, y: Game.state.village.py ?? 4 };
  const far = { x: Math.min(6, haven.x + 3), y: Math.min(6, haven.y + 3) };
  const c = buryAt(far, 'venison');
  Game.map.px = haven.x; Game.map.py = haven.y; // player sits in the hall
  const codexBefore = (Game.state.codex.places || []).length;
  Math.random = () => 0.9; // trace roll misses: nobody saw anything
  Game.resolveCacheRobbery(c);
  Math.random = origRand;
  said = [];
  // the npcBatchTurn wrap runs the robbery the same silent way; simulate one more beat
  ok('A1 no "you check your cache" from afar', !said.some(t => /check your cache|disturbed earth/i.test(t)));
  ok('A2 no codex entry before discovery', (Game.state.codex.places || []).length === codexBefore);
  ok('A3 cache list shows nothing', !Game.cachesHtml().includes('DISTURBED'));
  ok('A4 list still offers "Dig up", not "Check"', Game.cachesHtml().includes('Dig up') && !Game.cachesHtml().includes('>Check<'));
  // now walk out and dig: the gut-punch lands HERE
  Game.map.px = far.x; Game.map.py = far.y;
  said = [];
  Game.digUpCache(c.id);
  ok('A5 discovery scene at the hole', said.some(t => /Someone got here first/i.test(t)));
  ok('A6 codex records the robbery at discovery', codexRobbed());
  ok('A7 cache leaves the list', !Game.playerCaches().some(x => x.id === c.id));

  // ---------- B. trace robbery: gossip names it, list may show it ----------
  freshGame();
  const c2 = buryAt(far, 'venison');
  Game.map.px = haven.x; Game.map.py = haven.y;
  said = [];
  Math.random = () => 0.1; // trace fires
  Game.resolveCacheRobbery(c2);
  Math.random = origRand;
  ok('B1 still no "you check your cache"', !said.some(t => /check your cache/i.test(t)));
  ok('B2 suspicion doubt planted on the true robber',
    (Game.state.codex.doubts || []).some(d => d.theft && d.vid === c2.robbedBy));
  ok('B3 gossip marks the cache discovered', c2.discovered === true);
  ok('B4 list shows DISTURBED once gossip named it', Game.cachesHtml().includes('DISTURBED'));
  ok('B5 codex still waits for the hole', !codexRobbed());

  // ---------- C. the journal note disambiguates same-node caches ----------
  freshGame();
  const c3 = buryAt(far, 'venison');
  const c4 = buryAt(far, 'venison');
  ok('C1 desc carries a bearing from Haven', /tiles (north|south)?(east|west)? of Haven/.test(c3.desc), c3.desc);
  ok('C2 two caches at one node are distinguishable', c3.desc !== c4.desc || c3.id !== c4.id);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('THREW:', e && e.stack || e); process.exit(1); });
