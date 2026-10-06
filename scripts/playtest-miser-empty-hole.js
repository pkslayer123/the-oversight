#!/usr/bin/env node
// MISER playtest — THE EMPTY HOLE (this run's archetype: miser).
// Plays the robbed-cache discovery path as a player, start to finish:
//  1. Bury a food cache far from haven, walk home.
//  2. Robbery fires while the player sits in the hall, nodes away.
//     What does the player see, exactly? (the say / codex / cache list)
//  3. Walk back out, dig up: the discovery scene.
// Feel questions: does the player learn about the robbery before they could
// possibly know? Does the DISTURBED marker on the cache list spoil the
// gut-punch at the hole? When the trace fires, does the gossip read as
// something HEARD rather than something announced?
// Usage: node scripts/playtest-miser-empty-hole.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js',
 'src/js/journal.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const s = () => Game.state.scholar;
const V = () => Game.state.village;
const log = [];
const say = (m) => log.push(m);
const HAVEN = () => ({ x: V().px ?? 3, y: V().py ?? 3 });
const distFromHaven = () => Math.abs(Game.map.px - HAVEN().x) + Math.abs(Game.map.py - HAVEN().y);
const drainSay = (label) => {
  const lines = Game.log.splice(0, Game.log.length);
  say(`--- game feed [${label}] ---`);
  for (const l of lines.slice(-14)) say('  [game] ' + String(l).slice(0, 200));
};
// hop away from haven n hops (increasing node distance), logging blockages
function hopAway(n) {
  const h = HAVEN();
  for (let i = 0; i < n; i++) {
    const curD = distFromHaven();
    let best = null, bd = curD;
    for (const t of Game.travelTargets()) {
      const d = Math.abs(t.x - h.x) + Math.abs(t.y - h.y);
      if (d > bd) { bd = d; best = t; }
    }
    if (!best) { say('  (no farther hop available)'); return distFromHaven(); }
    Game.travelTo(best.x, best.y);
  }
  return distFromHaven();
}
// hop toward (tx,ty) until close
function hopTo(tx, ty) {
  let guard = 0;
  while ((Game.map.px !== tx || Game.map.py !== ty) && guard < 30) {
    guard++;
    const curD = Math.abs(Game.map.px - tx) + Math.abs(Game.map.py - ty);
    let best = null, bd = curD;
    for (const t of Game.travelTargets()) {
      const d = Math.abs(t.x - tx) + Math.abs(t.y - ty);
      if (d < bd) { bd = d; best = t; }
    }
    if (!best) break;
    Game.travelTo(best.x, best.y);
  }
}
function goHome() { hopTo(HAVEN().x, HAVEN().y); }
function sleepNight(tag) {
  // sleep until morning, draining NPC batch turns in between
  let guard = 0;
  while (s().daypart !== 0 && guard < 12) { guard++; Game.sleep && Game.sleep(); }
  say(`${tag}: day=${s().day} daypart=${s().daypart}`);
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  s().inventory = [];

  // stock the pack with preserved food (what a miser buries)
  s().inventory.push(
    { name: 'Smoked venison', kcalEach: 120, units: 10, spoilDay: s().day + 30, foodKind: 'meat', foodState: 'cooked', prep: 'Smoked. Keeps ~a month.', edible: true, kg: 0.2 },
    { name: 'Dried beans', kcalEach: 100, units: 12, spoilDay: 9999, foodKind: 'plant', foodState: 'ready', edible: true, kg: 0.3 },
  );

  // BEAT 1: walk far out and bury
  const d0 = hopAway(7);
  say(`D1: walked out ${d0} nodes from haven, standing at (${Game.map.px},${Game.map.py})`);
  const packBefore = s().inventory.map(i => `${i.units}x ${i.name}`).join(', ');
  say(`pack before bury: ${packBefore}`);
  Game.buryCache('food', 0, 6); // 6 venison
  drainSay('bury 1');
  Game.buryCache('food', 0, 8); // 8 beans (idx shifted after first bury? venison idx 0 still)
  drainSay('bury 2');
  const caches = Game.playerCaches();
  say(`caches: ${caches.map(c => `${c.label} @(${c.node.x},${c.node.y})`).join(' | ')}`);
  say(`cache list UI:\n${Game.cachesHtml().replace(/<[^>]+>/g, '').slice(0, 400)}`);

  // BEAT 2: walk home, live in the hall. Force a robbery with trace while away.
  goHome();
  say(`home at haven (${Game.map.px},${Game.map.py}), cache is ${d0} nodes away. Player is eating dinner, doing nothing cache-related.`);
  const target = caches[0];
  // stub Math.random so the trace (50%) fires and robber = real villager
  const origRand = Math.random;
  Math.random = () => 0.1;
  Game.resolveCacheRobbery(target);
  Math.random = origRand;
  drainSay('robbery fires (trace forced)');
  say(`robbed cache state: found=${target.found} robbedBy=${Game.displayName(target.robbedBy)} items=${target.items.length}`);
  const doubts = (Game.state.codex.doubts || []).filter(d => d.theft);
  say(`theft doubts planted: ${doubts.length}${doubts.length ? ' — text: "' + doubts[0].text.slice(0, 160) + '"' : ''}`);
  say(`codex 'Cache robbed' entry: ${(Game.state.codex.places || []).some(p => /Cache robbed/.test(p.text))}`);
  say(`cache list UI after robbery:\n${Game.cachesHtml().replace(/<[^>]+>/g, '').slice(0, 300)}`);

  // BEAT 3: the player — who has had NO contact with the cache — walks out and digs.
  hopTo(target.node.x, target.node.y);
  say(`walked back out to (${Game.map.px},${Game.map.py}). Digging up the robbed cache...`);
  Game.digUpCache(target.id);
  drainSay('dig up robbed cache');
  say(`caches left: ${Game.playerCaches().length}`);

  // BEAT 4: no-trace robbery — what does the player learn?
  goHome();
  const c2 = Game.playerCaches()[0];
  Math.random = () => 0.9; // trace roll >= 0.5 -> no suspicion
  Game.resolveCacheRobbery(c2);
  Math.random = origRand;
  drainSay('robbery fires (no trace)');
  say(`no-trace: doubts=${(Game.state.codex.doubts || []).filter(d => d.theft).length} (from beat 2: 1 — new ones? ${doubts.length})`);

  console.log(log.join('\n'));
  fs.writeFileSync(path.join(ROOT, 'playtests', '2026-10-06-miser-empty-hole.md'),
    ['# 2026-10-06 miser: the empty hole (playtest loop)', '',
     'Bury far, get robbed while in the hall, walk back, dig. What does the player actually see?',
     '', '```', log.join('\n'), '```', ''].join('\n'));
  console.log('\n(wrote playtests/2026-10-06-miser-empty-hole.md)');
})().catch(e => { console.error('THREW:', e && e.stack || e); process.exit(1); });
