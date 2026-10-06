// Miser: the trader's cart is a real economy (Steve 2026-10-06).
// Covers: visitor UI surface, wares generation, perishable-first preserved-
// premium payment, knowledge-gated alien loot, tool grant, news grant,
// honest failure paths, stale-visitor expiry (the stranger-slot choke fix),
// trader-type names.
// Usage: node scripts/test-miser-trade.js
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
function ok(name, cond) { if (cond) pass++; else { fail++; console.log(`FAIL ${name}`); } }

let said = [];
const s = () => Game.state.scholar;
const V = () => Game.state.village;
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
  s().inventory = [
    { name: 'Ripe blackberries', kcalEach: 30, units: 10, spoilDay: d + 1, foodKind: 'plant', foodState: 'ready', edible: true },
    { name: 'Smoked venison', kcalEach: 120, units: 8, spoilDay: d + 30, foodKind: 'meat', foodState: 'cooked', prep: 'Smoked. Keeps ~a month.', edible: true },
    { name: 'Dried beans', kcalEach: 100, units: 5, spoilDay: 9999, foodKind: 'plant', foodState: 'ready', edible: true },
  ];
}
function forceTrader() {
  s().day = 8; V().pantryKcal = 20000; V().visitors = [];
  let vis = null;
  for (let i = 0; i < 300 && !vis; i++) { const c = Game.considerStrangers(); if (c && c.type === 'trader') vis = c; V().visitors = (V().visitors || []).filter(x => x.type === 'trader'); }
  return vis;
}
const unitsOf = (re) => { const it = (s().inventory || []).find(i => re.test(i.name)); return it ? it.units : 0; };

(async () => {
  await Game.init();
  freshGame();
  forceTrader(); // sets the trade day first, so the perishable pack is fresh relative to it
  const d = s().day;
  stockPack(d);

  // 1. trader spawns, UI surfaces it
  const vis = forceTrader();
  ok('trader spawns when notable', !!vis);
  ok('trader has a trader name', /trader|peddler|cart-driver/i.test(vis.name));
  ok('trader leavesDay set', vis.leavesDay === s().day + 1);
  const html = Game.visitorHtml();
  ok('Haven panel shows the visitor block', html.includes('🧳 Visitor:'));
  ok('trade button wired', html.includes(`data-visitor-act="${vis.id}"`) && html.includes('data-how="trade"'));

  // 2. opening the cart generates 3 real wares
  Game.visitorInteract(vis.id, 'trade');
  ok('visitor stays while trading (not dismissed)', (V().visitors || []).some(x => x.id === vis.id));
  const wares = Game.visitorWares(vis);
  ok('three wares', wares.length === 3);
  ok('ware kinds alien/tool/news', ['alien', 'tool', 'news'].every(k => wares.some(w => w.kind === k)));
  ok('wares memoized per visitor', Game.visitorWares(vis) === wares);
  ok('cart line says something', said.some(t => /side panel down/.test(t)));
  const html2 = Game.visitorHtml();
  ok('buy buttons render per ware', (html2.match(/data-ware-buy/g) || []).length === 3);
  ok('done button replaces trade button', html2.includes('data-how="done"'));

  // 3. news purchase: perishable-first payment
  said = [];
  const newsIdx = wares.findIndex(w => w.kind === 'news');
  const rNews = Game.visitorBuyWare(vis.id, newsIdx);
  ok('news buy succeeds', rNews === true);
  ok('perishable berries spent first', unitsOf(/blackberries/) === 0);
  ok('smoked venison untouched (berries covered it)', unitsOf(/venison/) === 8);
  ok('news marked sold', wares[newsIdx].sold === true);
  ok('news spreads word both ways', Game.betrayalState().strangersHeard >= 2);
  ok('road news says something', said.some(t => /map in the dirt/.test(t)));

  // 4. alien ware: knowledge-gated loot
  const alienIdx = wares.findIndex(w => w.kind === 'alien');
  const venBefore = unitsOf(/venison/);
  Game.visitorBuyWare(vis.id, alienIdx);
  const loot = (s().inventory || []).find(i => i.alienLoot);
  ok('alien ware granted', !!loot);
  ok('alien effect hidden until first use (knowledge gate)', !!(loot && loot.alienEffectHidden));
  ok('payment consumed food (venison dropped: preserved 1.5x)', unitsOf(/venison/) < venBefore);
  ok('trader admits ignorance', said.some(t => /No idea what it does/.test(t)));

  // 5. tool ware: real tool in the pack
  stockPack(s().day);
  const toolIdx = wares.findIndex(w => w.kind === 'tool');
  Game.visitorBuyWare(vis.id, toolIdx);
  const tool = (s().inventory || []).find(i => (i.itemId || i.id) === wares[toolIdx].itemId);
  ok('tool ware lands in pack', !!tool);
  ok('tool ware is a functional tool', !!((Game.data.items || []).find(i => i.id === wares[toolIdx].itemId) || {}).tool);

  // 6. honest failures: sold-out and broke
  said = [];
  const rSold = Game.visitorBuyWare(vis.id, toolIdx);
  ok('re-buy of sold ware refused', rSold === null && said.some(t => /Already sold/.test(t)));
  s().inventory = [{ name: 'Ripe blackberries', kcalEach: 30, units: 2, spoilDay: s().day + 1, foodKind: 'plant', foodState: 'ready', edible: true }];
  const visB = forceTrader(); Game.visitorInteract(visB.id, 'trade');
  const wB = Game.visitorWares(visB);
  said = [];
  const rBroke = Game.visitorBuyWare(visB.id, wB.findIndex(w => w.kind === 'news'));
  ok('broke buy refused', rBroke === null);
  ok('refusal names the shortfall', said.some(t => /short/.test(t)));
  ok('failed payment leaves pack untouched (two-pass)', unitsOf(/blackberries/) === 2);
  ok('raw/unfinished food not accepted', (() => {
    s().inventory = [{ name: 'Raw turkey', kcalEach: 200, units: 5, spoilDay: d + 2, foodKind: 'meat', foodState: 'carcass', edible: true }];
    const p = Game.traderPay(300);
    return p.ok === false;
  })());

  // 7. preserved premium: smoked counts 1.5x
  s().inventory = [{ name: 'Smoked venison', kcalEach: 120, units: 2, spoilDay: d + 30, foodKind: 'meat', foodState: 'cooked', prep: 'Smoked.', edible: true }];
  const p2 = Game.traderPay(300); // 2*120*1.5 = 360 >= 300
  ok('preserved 1.5x premium pays the price', p2.ok === true && unitsOf(/venison/) === 0);
  s().inventory = [{ name: 'Plain jerky?', kcalEach: 120, units: 2, spoilDay: d + 30, foodKind: 'meat', foodState: 'cooked', edible: true }];
  const p3 = Game.traderPay(300); // 2*120 = 240 < 300 without the premium
  ok('unpreserved same food falls short', p3.ok === false);

  // 8. stale visitor expiry frees the stranger slot (the choke fix)
  said = [];
  V().visitors = [{ id: 'vis_old', type: 'trader', name: 'a weathered trader', day: s().day, leavesDay: s().day }];
  Game.visitorDaily();
  ok('stale trader leaves', (V().visitors || []).length === 0);
  ok('farewell line spoken', said.some(t => /moves on down the road/.test(t)));
  V().pantryKcal = 20000;
  let vis3 = null;
  for (let i = 0; i < 300 && !vis3; i++) vis3 = Game.considerStrangers();
  ok('stranger slot freed after expiry', !!vis3);
  // legacy visitors without leavesDay get one stamped, not insta-kicked
  V().visitors = [{ id: 'vis_legacy', type: 'scout', name: 'a lean scout', day: s().day }];
  Game.visitorDaily();
  ok('legacy visitor stamped, not kicked', (V().visitors || []).length === 1 && V().visitors[0].leavesDay === s().day + 1);

  // 9. non-trader visitors: honest options, no cart
  V().visitors = [{ id: 'vis_scout', type: 'scout', name: 'a lean scout', day: s().day, leavesDay: s().day + 1 }];
  const h3 = Game.visitorHtml();
  ok('scout gets welcome/turn-away', h3.includes('data-how="welcome"') && h3.includes('data-how="away"'));
  ok('scout gets no trade button', !h3.includes('data-how="trade"'));
  V().visitors = [{ id: 'vis_flee', type: 'fleeing', name: 'a frightened family', day: s().day, leavesDay: s().day + 1 }];
  ok('fleeing family can be invited to stay', Game.visitorHtml().includes('data-how="invite"'));

  // 10. old paths still work: welcome / turn away / invite dismiss the visitor
  freshGame(); V().visitors = [{ id: 'vis_w', type: 'curious', name: 'a curious wanderer', day: s().day, leavesDay: s().day + 1 }];
  Game.visitorInteract('vis_w', 'welcome');
  ok('welcome dismisses', (V().visitors || []).length === 0);
  V().visitors = [{ id: 'vis_a', type: 'scout', name: 'a lean scout', day: s().day, leavesDay: s().day + 1 }];
  Game.visitorInteract('vis_a', 'away');
  ok('turn-away dismisses', (V().visitors || []).length === 0);
  V().visitors = [{ id: 'vis_i', type: 'fleeing', name: 'a frightened family', day: s().day, leavesDay: s().day + 1 }];
  const rosterBefore = (V().roster || []).length;
  Game.visitorInteract('vis_i', 'invite');
  ok('invite adds them to the roster', (V().roster || []).length === rosterBefore + 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
