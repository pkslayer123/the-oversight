// Trader knowledge-gated appraisal (Steve 2026-10-06).
// "Trader wants discounts on spoiled or otherwise lower quality food but only
//  if he has the knowledge. He can also recognize potential in items;
//  obviously spoiled things like meat are only discounted or refused."
// Covers: known+spoiled -> discount; known+prime -> premium; known ordinary ->
// fair; unknown -> cautious/decline; spoiled meat -> refuse (common knowledge);
// specialty -> potential premium; sell flow credits the tab; buying spends
// the tab first; every appraisal is voiced (the player sees WHY).
// Usage: node scripts/test-trader-appraisal.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });

// Seeded RNG BEFORE the evals (PROOF-TEST RNG STABILITY lesson, AGENTS.md):
// betrayal.js captures `const R = Math.random` at load, so the patch must
// land first. SEED env override for exploration.
{
  const SEED = parseInt(process.env.SEED || '20261007', 10);
  let a = SEED;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
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
function forceTrader() {
  s().day = 8; V().pantryKcal = 20000; V().visitors = [];
  let vis = null;
  for (let i = 0; i < 300 && !vis; i++) { const c = Game.considerStrangers(); if (c && c.type === 'trader') vis = c; V().visitors = (V().visitors || []).filter(x => x.type === 'trader'); }
  // deterministic brain for the test: knows dandelion + dried beans, specialty in pemmican
  vis.traderKnows = ['dandelion', 'dried beans'];
  vis.traderSpecialties = ['pemmican'];
  // honest trader for the price-math sections: the under-appraisal scam is a
  // real mechanic but would randomly discount fair goods and break the tab
  // arithmetic below. (Scam behavior is covered by the betrayal suites.)
  vis.shady = false;
  vis.desperate = false;
  return vis;
}
const item = (o) => Object.assign({ units: 1 }, o);

(async () => {
  await Game.init();
  freshGame();
  const vis = forceTrader();
  ok('trader spawns', !!vis);
  ok('trader brain seeded', Array.isArray(vis.traderKnows) && Array.isArray(vis.traderSpecialties));
  const d = s().day;

  // ---- appraisal unit checks ----
  const ap = (it) => Game.traderAppraise(vis, item(it));

  // 1. known + spoiled -> discount at half
  let r = ap({ name: 'Wilted dandelion', plantId: 'dandelion', kcalEach: 45, spoilDay: d - 1, foodKind: 'plant', edible: true });
  ok('known+spoiled verdict=discount', r.verdict === 'discount');
  ok('known+spoiled half price', r.pricePerUnit === 23); // Math.round(45*0.5)
  ok('discount voiced', /turned|half price/i.test(r.line));

  // 2. known + prime (smoked) -> premium
  r = ap({ name: 'Smoked venison', kcalEach: 120, spoilDay: d + 30, foodKind: 'meat', prep: 'Smoked. Keeps ~a month.', edible: true });
  ok('known+prime verdict=prime', r.verdict === 'prime');
  ok('prime premium 1.25x', r.pricePerUnit === 150);
  ok('prime voiced', /trail food/i.test(r.line));

  // 3. known ordinary -> fair
  r = ap({ name: 'Dandelion greens', plantId: 'dandelion', kcalEach: 45, spoilDay: d + 3, foodKind: 'plant', edible: true });
  ok('known verdict=fair', r.verdict === 'fair');
  ok('fair full price', r.pricePerUnit === 45);

  // 4. unknown plant -> cautious flat-ish offer, never confident
  r = ap({ name: 'Strange fungus', plantId: 'weird_fungus_xyz', kcalEach: 60, spoilDay: d + 2, foodKind: 'plant', edible: true });
  ok('unknown verdict=cautious', r.verdict === 'cautious');
  ok('cautious discounted', r.pricePerUnit === 24 && r.pricePerUnit < 60);
  ok('cautious voiced honestly', /don't know this one/i.test(r.line));

  // 5. unknown non-food -> decline
  r = ap({ name: 'Odd metal shard', kcalEach: 50, edible: false });
  ok('unknown non-food verdict=decline', r.verdict === 'decline');
  ok('decline price 0', r.pricePerUnit === 0);
  ok('decline voiced', /don't know it, don't buy it/i.test(r.line));

  // 6. obviously spoiled meat -> REFUSED even though meat is "known"
  r = ap({ name: 'Rotten venison', kcalEach: 120, spoilDay: d - 2, foodKind: 'meat', edible: true });
  ok('spoiled meat verdict=refuse', r.verdict === 'refuse');
  ok('refuse price 0', r.pricePerUnit === 0);
  ok('refuse voiced', /rotten meat/i.test(r.line));

  // 7. fresh meat -> fair (meat is common knowledge)
  r = ap({ name: 'Fresh rabbit', kcalEach: 90, spoilDay: d + 2, foodKind: 'meat', edible: true });
  ok('fresh meat verdict=fair', r.verdict === 'fair');
  ok('fresh meat full price', r.pricePerUnit === 90);

  // 8. specialty -> potential premium with the buyer story
  r = ap({ name: 'Pemmican', itemId: 'pemmican', kcalEach: 200, spoilDay: d + 30, edible: true });
  ok('specialty verdict=potential', r.verdict === 'potential');
  ok('potential premium 1.5x', r.pricePerUnit === 300);
  ok('potential voiced', /two valleys over/i.test(r.line));

  // 9. every verdict is voiced (the player sees WHY)
  for (const v of ['refuse', 'decline', 'cautious', 'discount', 'fair', 'prime', 'potential']) {
    const probe = { refuse: { name: 'Rotten venison', kcalEach: 120, spoilDay: d - 2, foodKind: 'meat' },
      decline: { name: 'Odd metal shard', kcalEach: 50, edible: false },
      cautious: { name: 'Strange fungus', plantId: 'weird_fungus_xyz', kcalEach: 60, spoilDay: d + 2, foodKind: 'plant', edible: true },
      discount: { name: 'Wilted dandelion', plantId: 'dandelion', kcalEach: 45, spoilDay: d - 1, foodKind: 'plant', edible: true },
      fair: { name: 'Dandelion greens', plantId: 'dandelion', kcalEach: 45, spoilDay: d + 3, foodKind: 'plant', edible: true },
      prime: { name: 'Smoked venison', kcalEach: 120, spoilDay: d + 30, foodKind: 'meat', prep: 'Smoked.', edible: true },
      potential: { name: 'Pemmican', itemId: 'pemmican', kcalEach: 200, spoilDay: d + 30, edible: true } }[v];
    const rr = ap(probe);
    ok(`verdict ${v} voiced`, rr.verdict === v && typeof rr.line === 'string' && rr.line.length > 10);
  }

  // ---- sell flow: credit lands on the tab ----
  s().inventory = [
    { name: 'Dandelion greens', plantId: 'dandelion', kcalEach: 45, units: 5, spoilDay: d + 3, foodKind: 'plant', edible: true },
    { name: 'Wilted dandelion', plantId: 'dandelion', kcalEach: 45, units: 4, spoilDay: d - 1, foodKind: 'plant', edible: true },
    { name: 'Rotten venison', kcalEach: 120, units: 3, spoilDay: d - 2, foodKind: 'meat', edible: true },
  ];
  const stock = Game.traderSellStock(vis);
  ok('sell stock lists 3 stacks', stock.length === 3);
  ok('stock carries appraisals', stock.every(e => e.ap && e.ap.verdict));

  said = [];
  const soldOk = Game.traderSell(vis.id, 0); // 5x dandelion @45 = 225
  ok('sell fair stack works', soldOk === true);
  ok('tab credited 225', vis.credit === 225);  ok('sold stack leaves pack', s().inventory.length === 2);
  ok('sale voiced', said.join(' ').length > 20);

  said = [];
  const soldDisc = Game.traderSell(vis.id, 0); // 4x wilted @23 = 92
  ok('sell discounted stack works', soldDisc === true);
  ok('tab accumulates (225+92)', vis.credit === 317);

  said = [];
  const soldRot = Game.traderSell(vis.id, 0); // rotten venison -> refuse
  ok('rotten meat refused', soldRot === null);
  ok('refused stack stays in pack', s().inventory.length === 1);
  ok('refusal voiced', /rotten meat/i.test(said.join(' ')));
  ok('no credit for refusal', vis.credit === 317);

  // ---- buy flow: tab spends first ----
  // 3 guaranteed wares (alien/tool/news) + sometimes trail rations (R()<0.5 coin
  // flip in visitorWares) — the count is chance, the guaranteed kinds are not.
  const wares = Game.visitorWares(vis);
  ok('wares generated', wares.length >= 3 && wares.length <= 4);
  ok('guaranteed kinds present', ['alien', 'tool', 'news'].every(k => wares.some(w => w.kind === k)));
  // give the player pack food to cover a ware after tab
  s().inventory = [{ name: 'Smoked venison', kcalEach: 120, units: 20, spoilDay: d + 30, foodKind: 'meat', prep: 'Smoked.', edible: true }];
  const cheapIdx = wares.findIndex(w => !w.sold);
  const priceBefore = wares[cheapIdx].price;
  const tabBefore = vis.credit;
  Game.visitorBuyWare(vis.id, cheapIdx);
  ok('ware bought', wares[cheapIdx].sold === true);
  ok('tab spent first', vis.credit === Math.max(0, tabBefore - priceBefore));

  // ---- played trade: open sell view, appraise, sell, buy ----
  freshGame();
  const vis2 = forceTrader();
  s().inventory = [
    { name: 'Smoked venison', kcalEach: 120, units: 4, spoilDay: d + 30, foodKind: 'meat', prep: 'Smoked. Keeps.', edible: true },
    { name: 'Strange fungus', plantId: 'weird_fungus_xyz', kcalEach: 60, units: 3, spoilDay: d + 2, foodKind: 'plant', edible: true },
  ];
  said = [];
  Game.visitorInteract(vis2.id, 'sell');
  ok('sell opens', vis2.selling === true && vis2.trading === false);
  const html = Game.visitorHtml();
  ok('sell view shows appraisals', /my risk, my price|trail food/i.test(html));
  ok('sell view shows tab', /Your tab/i.test(html));
  Game.traderSell(vis2.id, 1); // fungus: 3x24 = 72 cautious
  ok('played sell credits tab', vis2.credit === 72);
  Game.visitorInteract(vis2.id, 'shelve');
  ok('shelve closes views', !vis2.selling && !vis2.trading);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
