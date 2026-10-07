// Miser feel run: the winter-stockpile fantasy with the new ration drawer.
// Plays like a player: bury a big pemmican stockpile far from Haven, walk
// home, live day to day drawing rations via takeFromCache, get robbed,
// discover the theft at the hole. Then: stash tool round-trip + a forced
// closed-village skim, checking the ledger never blames the player.
// Judges: does the stockpile feel like wealth? Is drawing rations smooth?
// Does the robbery gut-punch land? Is the stash ledger legible?
// Usage: node scripts/playtest-miser-rations-20261006.js
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

const s = () => Game.state.scholar;
const ME = () => s().villagerId;
const log = [];
const say = (m) => log.push(m);
const drainSay = (n) => {
  const lines = Game.log.splice(0, Game.log.length);
  for (const l of lines.slice(-(n || 6))) log.push(`  [game] ${l.slice(0, 170)}`);
};
const HAVEN = () => ({ x: Game.state.village.px ?? 3, y: Game.state.village.py ?? 3 });
const distFromHaven = () => Math.abs(Game.map.px - HAVEN().x) + Math.abs(Game.map.py - HAVEN().y);
const packKcal = () => (s().inventory || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
const cacheDesc = () => Game.playerCaches().map(c =>
  `${c.items.reduce((t, i) => t + (i.units || 1), 0)}u@${c.node.x},${c.node.y}${c.found ? '(ROBBED)' : ''}`).join('; ') || 'none';

function hopAway(n) {
  const h = HAVEN();
  for (let i = 0; i < n; i++) {
    const curD = distFromHaven();
    let best = null, bd = curD;
    for (const t of Game.travelTargets()) {
      const d = Math.abs(t.x - h.x) + Math.abs(t.y - h.y);
      if (d > bd) { bd = d; best = t; }
    }
    if (!best) break;
    const r = Game.travelTo(best.x, best.y);
    if (r !== undefined && r !== null) { say(`  hop blocked: ${JSON.stringify(r).slice(0, 80)}`); break; }
  }
  return distFromHaven();
}
function goHome() {
  const h = HAVEN();
  let guard = 0;
  while ((Game.map.px !== h.x || Game.map.py !== h.y) && guard < 20) {
    guard++;
    const curD = distFromHaven();
    let best = null, bd = curD;
    for (const t of Game.travelTargets()) {
      const d = Math.abs(t.x - h.x) + Math.abs(t.y - h.y);
      if (d < bd) { bd = d; best = t; }
    }
    if (!best) break;
    const r = Game.travelTo(best.x, best.y);
    if (r !== undefined && r !== null) break;
  }
  Game.enterBuilding();
}
function gotoNode(x, y) {
  let guard = 0;
  while ((Game.map.px !== x || Game.map.py !== y) && guard < 20) {
    guard++;
    const curD = Math.abs(Game.map.px - x) + Math.abs(Game.map.py - y);
    let best = null, bd = curD;
    for (const t of Game.travelTargets()) {
      const d = Math.abs(t.x - x) + Math.abs(t.y - y);
      if (d < bd) { bd = d; best = t; }
    }
    if (!best) break;
    const r = Game.travelTo(best.x, best.y);
    if (r !== undefined && r !== null) break;
  }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  s().mx = 4; s().my = 4; s().inventory = []; s().water = [];
  Game.log.length = 0;

  // ===== D1: the stockpile. 40 pemmican (24,000 kcal), buried far. =====
  s().inventory = [{ itemId: 'pemmican', name: 'Pemmican', units: 40, kcalEach: 600, kg: 0.3, spoilDay: 9999 }];
  const d1 = hopAway(5);
  say(`D1: walked ${d1} tiles out to ${Game.playerTile().type}.`);
  Game.buryCache('food', 0, 40);
  drainSay(3);
  const cacheNode = { x: Game.map.px, y: Game.map.py };
  say(`stockpile: ${cacheDesc()}`);
  goHome();
  say(`home. pack=${packKcal()}kcal`);

  // ===== D2-4: live off the drawer — walk out, take 4, walk home. =====
  for (let day = 2; day <= 4; day++) {
    Game.exitBuilding();
    gotoNode(cacheNode.x, cacheNode.y);
    const atNode = Game.map.px === cacheNode.x && Game.map.py === cacheNode.y;
    const c = Game.playerCaches()[0];
    Game.log.length = 0;
    if (atNode && c && !c.found) Game.takeFromCache(c.id, 0, 4);
    const took = Game.log.join(' ');
    goHome();
    say(`D${day}: walk-out ${atNode ? 'ok' : 'FAILED'}, drawer: "${took.slice(0, 110)}" | ${cacheDesc()} | pack=${packKcal()}kcal`);
  }

  // ===== D5: the robbery. Theft fires while the miser sleeps at home. =====
  const c5 = Game.playerCaches()[0];
  Game.log.length = 0;
  Game.resolveCacheRobbery(c5);
  const robLog = Game.log.splice(0, Game.log.length).join(' ');
  const gossiped = /was robbed/.test(robLog);
  say(`D5 night: robbery fired. robbedBy=${c5.robbedBy ? Game.firstRef(c5.robbedBy) : 'none'} gossip trace ${gossiped ? 'SAID OUTRIGHT: "' + robLog.slice(0, 130) + '..."' : '(no witness this time — earth keeps it)'}`);
  // the caches screen BEFORE visiting: DISTURBED only if gossip named it
  const htmlBefore = Game.cachesHtml();
  const marker = /DISTURBED/.test(htmlBefore);
  say(`caches screen before visiting: ${marker ? (gossiped ? 'DISTURBED — knowledge-consistent, gossip named it' : 'LEAK! marker without gossip') : 'clean — no marker, looks untouched'}`);
  // D6: walk out, reach for rations...
  Game.exitBuilding();
  gotoNode(cacheNode.x, cacheNode.y);
  Game.log.length = 0;
  Game.takeFromCache(c5.id, 0, 4); // reaching in IS checking
  drainSay(4);
  say(`after: discovered=${!!c5.discovered}, caches left: ${Game.playerCaches().length}`);

  // ===== stash tool round-trip: donate the hatchet, take it back =====
  goHome();
  Game.log.length = 0;
  s().inventory.push({ itemId: 'hatchet', name: 'Hatchet', units: 1, kcalEach: 0, kg: 0.9 });
  const hi = s().inventory.findIndex(i => i.itemId === 'hatchet');
  Game.donateTool(hi);
  say(`donated hatchet. stash tools: ${JSON.stringify(Game.stashState().tools.map(t => t.name))}`);
  say(`ledger: ${Game.stashLedgerText(2).replace(/\n/g, ' | ').slice(0, 160)}`);
  const st = Game.stashState();
  Game.takeTool('hatchet');
  say(`took it back. stash tools now: ${st.tools.length}, pack has hatchet: ${s().inventory.some(i => i.itemId === 'hatchet')}`);
  drainSay(2);

  // ===== closed village: force trust down, force the skim, read the ledger =====
  const v = Game.state.village;
  for (const id of (v.roster || [])) { v.trust = v.trust || {}; v.trust[id] = 5; }
  say(`trust level: ${Game.villageTrustLevel()}`);
  Game.addMaterial('branch', 6);
  Game.donateMaterial('branch', 6);
  const before = Game.stashState().materials.branch;
  const realRandom = Math.random;
  Math.random = () => 0.01; // force the 5% skim gate (and the 6% give gate)
  try { Game.npcBatchTurn(); } catch (e) { say(`npcBatchTurn threw: ${e.message}`); }
  Math.random = realRandom;
  const after = Game.stashState().materials.branch;
  const skimEntry = (Game.stashState().ledger || [])[0];
  say(`skim: stash branches ${before} -> ${after}. ledger head: day ${skimEntry && skimEntry.day} ${skimEntry && skimEntry.kind} ${skimEntry && skimEntry.qty}x ${skimEntry && skimEntry.what} vid=${skimEntry && String(skimEntry.vid)}`);
  say(`ledger text: "${Game.stashLedgerText(1).slice(0, 120)}"`);
  say(`ledger blames player? ${(skimEntry && skimEntry.vid) === ME() ? 'YES — BUG' : 'no — "someone", correct'}`);

  console.log(log.join('\n'));
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
