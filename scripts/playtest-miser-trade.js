// MISER playtest — THE TRADER'S CART (this run's archetype: miser).
// The old 'trade' beat said "You trade" but no goods moved, visitors had no
// UI at all, and one ignored visitor blocked every future stranger forever.
// This run plays the real cart: open it, pay with perishables, buy alien
// goods / tools / news, go broke, and watch the trader leave.
// Feel questions: does barter feel like an economy or a vending machine? Does
// the perishable-first payment read as fair? Is the trader worth the visit?
// Usage: node scripts/playtest-miser-trade.js
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

let said = [];
const s = () => Game.state.scholar;
const V = () => Game.state.village;
const packKcal = () => (s().inventory || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0);
function freshGame() {
  said = [];
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); try { return origSay(t); } catch (e) {} };
  Game.depart();
  s().inventory = [];
}
function stockPack(d) {
  // the miser's pack: berries rotting tomorrow, smoked meat (preserved), durable beans
  s().inventory = [
    { name: 'Ripe blackberries', kcalEach: 30, units: 10, spoilDay: d + 1, foodKind: 'plant', foodState: 'ready', edible: true },
    { name: 'Smoked venison', kcalEach: 120, units: 8, spoilDay: d + 30, foodKind: 'meat', foodState: 'cooked', prep: 'Smoked. Keeps ~a month.', edible: true },
    { name: 'Dried beans', kcalEach: 100, units: 5, spoilDay: 9999, foodKind: 'plant', foodState: 'ready', edible: true },
  ];
}
function forceTrader() {
  s().day = 8;
  V().pantryKcal = 20000;
  V().visitors = [];
  let vis = null;
  for (let i = 0; i < 200 && !vis; i++) { const c = Game.considerStrangers(); if (c && c.type === 'trader') vis = c; V().visitors = V().visitors.filter(x => x.type === 'trader'); }
  return vis;
}

(async () => {
  await Game.init();
  freshGame();
  console.log('ACT 1 — a trader comes to Haven (notability set first, so the pack is fresh relative to trade day)');
  const vis = forceTrader();
  if (!vis) { console.log('  no trader spawned in 200 tries — check notability gating'); return; }
  const d = s().day;
  stockPack(d);
  console.log(`PACK: ${packKcal()} kcal (berries spoil day ${d + 1}, smoked venison preserved, beans durable)`);
  console.log(`  visitor: "${vis.name}" (${vis.type}), leavesDay=${vis.leavesDay}`);
  const html = Game.visitorHtml();
  console.log(`  Haven panel shows visitor block: ${html.includes('🧳 Visitor:')}`);
  console.log(`  trade button present before cart opens: ${html.includes('data-how="trade"')}`);

  console.log('\nACT 2 — open the cart');
  said = [];
  Game.visitorInteract(vis.id, 'trade');
  const wares = Game.visitorWares(vis);
  console.log(`  wares: ${wares.map(w => `${w.kind}:${w.name} (${w.price} kcal)`).join(' | ')}`);
  const open = said.find(t => /side panel down/.test(t));
  console.log(`  cart line: ${(open || '').slice(0, 100)}...`);
  const html2 = Game.visitorHtml();
  console.log(`  buy buttons rendered: ${(html2.match(/data-ware-buy/g) || []).length}`);

  console.log('\nACT 3 — buy Road news (300 kcal): does the trader eat the rotting berries first?');
  said = [];
  const berriesBefore = (s().inventory.find(i => /blackberries/.test(i.name)) || {}).units;
  const newsIdx = wares.findIndex(w => w.kind === 'news');
  Game.visitorBuyWare(vis.id, newsIdx);
  const berriesAfter = (s().inventory.find(i => /blackberries/.test(i.name)) || {}).units || 0;
  const venisonAfterNews = (s().inventory.find(i => /venison/.test(i.name)) || {}).units;
  const dealLine = said.find(t => /sketches a map in the dirt/.test(t));
  console.log(`  berries ${berriesBefore} -> ${berriesAfter} (perishable-first: ${berriesAfter < berriesBefore ? 'YES' : 'NO'}); venison untouched: ${venisonAfterNews === 8}`);
  console.log(`  deal line: ${(dealLine || '(none)').slice(0, 120)}`);
  console.log(`  strangersHeard now: ${Game.betrayalState().strangersHeard} (news travels both ways)`);
  console.log(`  journal got the road news: ${said.some(t => /orchards gone wild/.test(t))}`);

  console.log('\nACT 4 — buy the alien ware: knowledge-gated?');
  said = [];
  const alienIdx = wares.findIndex(w => w.kind === 'alien');
  if (alienIdx >= 0) {
    const venBefore = (s().inventory.find(i => /venison/.test(i.name)) || {}).units;
    Game.visitorBuyWare(vis.id, alienIdx);
    const loot = (s().inventory || []).find(i => i.alienLoot);
    console.log(`  got: ${loot ? loot.name : '(nothing)'}; effect hidden until use: ${!!(loot && loot.alienEffectHidden)}`);
    console.log(`  smoked venison spent: ${venBefore} -> ${(s().inventory.find(i => /venison/.test(i.name)) || {}).units} (preserved counts 1.5x)`);
    console.log(`  trader admits ignorance: ${said.some(t => /No idea what it does/.test(t))}`);
  } else console.log('  (no alien ware this cart)');

  console.log('\nACT 5 — buy the tool ware (restock the miser first)');
  said = [];
  stockPack(s().day);
  const toolIdx = wares.findIndex(w => w.kind === 'tool');
  if (toolIdx >= 0) {
    Game.visitorBuyWare(vis.id, toolIdx);
    const tool = (s().inventory || []).find(i => (i.itemId || i.id) === wares[toolIdx].itemId);
    console.log(`  tool in pack: ${tool ? tool.name : '(missing)'}`);
  } else console.log('  (no tool ware this cart)');

  console.log('\nACT 6 — broke miser: the honest no');
  said = [];
  s().inventory = [{ name: 'Ripe blackberries', kcalEach: 30, units: 2, spoilDay: s().day + 1, foodKind: 'plant', foodState: 'ready', edible: true }];
  const r = Game.visitorBuyWare(vis.id, newsIdx); // already sold -> sold line
  const vis2b = forceTrader(); Game.visitorInteract(vis2b.id, 'trade');
  const w2 = Game.visitorWares(vis2b);
  const r2 = Game.visitorBuyWare(vis2b.id, w2.findIndex(w => w.kind === 'news'));
  console.log(`  re-buy sold ware: ${r === null && said.some(t => /Already sold/.test(t)) ? 'honest "already sold"' : 'CHECK'}`);
  console.log(`  can't afford: ${r2 === null && said.some(t => /short/.test(t)) ? 'honest "short" line, no goods moved' : 'CHECK'}`);
  console.log(`  pack untouched by failed payment: ${(s().inventory.find(i => /blackberries/.test(i.name)) || {}).units === 2}`);

  console.log('\nACT 7 — the trader does not wait forever');
  said = [];
  V().visitors = [{ id: 'vis_old', type: 'trader', name: 'a weathered trader', day: s().day, leavesDay: s().day }];
  Game.visitorDaily();
  console.log(`  stale trader left: ${(V().visitors || []).length === 0}`);
  console.log(`  farewell line: ${said.some(t => /moves on down the road/.test(t))}`);
  // slot freed: strangers can be considered again
  V().pantryKcal = 20000;
  let vis3 = null;
  for (let i = 0; i < 200 && !vis3; i++) vis3 = Game.considerStrangers();
  console.log(`  stranger slot freed (new arrival possible): ${!!vis3}`);

  console.log('\nACT 8 — non-trader visitors get honest options, no cart');
  V().visitors = [{ id: 'vis_scout', type: 'scout', name: 'a lean scout', day: s().day, leavesDay: s().day + 1 }];
  const h3 = Game.visitorHtml();
  console.log(`  scout: welcome=${h3.includes('data-how="welcome"')} trade=${h3.includes('data-how="trade"')} (expect true/false)`);

  console.log('\nFINAL pack: ' + JSON.stringify((s().inventory || []).map(i => `${i.name}×${i.units}`)));
})();
