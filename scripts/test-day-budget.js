// Round 1: measure the day budget. Five archetypes play one full day each;
// we track tick spending by category and itinerary completion (what got
// squeezed out when the day ended).
// Usage: node scripts/test-day-budget.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let buckets, curLabel, dayEndCount;
const origTick = Game.tickAction; // captured once — never double-wrap
function resetMeasure() {
  buckets = {};
  curLabel = 'system';
  dayEndCount = 0;
  Game.tickAction = function (n, opts) {
    const s = this.state.scholar;
    const before = s.day;
    const r = origTick.call(this, n, opts);
    buckets[curLabel] = (buckets[curLabel] || 0) + Math.max(0, Math.round(n || 0));
    if (s.day !== before) dayEndCount++;
    return r;
  };
}
function act(label, fn) {
  const prev = curLabel; curLabel = label;
  try { return fn(); } finally { curLabel = prev; }
}
function startDay() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  resetMeasure();
  return Game.state.scholar.day;
}
const dayOver = (d0) => Game.state.scholar.day > d0 || Game.over;
function upkeep() {
  const s = Game.state.scholar;
  if (s.kcal < 1200 && s.inventory.length) act('eat', () => Game.eat());
  if (s.hydration < 55 && s.water > 0) act('drink', () => Game.drinkTreated());
}
function status() {
  const s = Game.state.scholar;
  return { dayTicks: s.dayTicks, kcal: Math.round(s.kcal || 0), hyd: Math.round(s.hydration || 0), energy: Math.round(s.energy || 0) };
}
function myPos() { const s = Game.state.scholar; return { x: s.mx ?? 4, y: s.my ?? 4 }; }
function invCount() { return Game.state.scholar.inventory.reduce((t, i) => t + (i.units || 1), 0); }

// forage: walk to the nearest forageable cell on the 9x9 grid (like a player
// would), then targeted-forage it. success = inventory grew.
function forageStep() {
  const before = invCount();
  const t = Game.playerTile();
  if (t.type === 'ruin') {
    act('scavenge', () => Game.doAction('forage'));
    return invCount() > before ? true : 'fail';
  }
  if (t.type === 'haven') return false;
  const d = Game.genDetail(Game.map.px, Game.map.py);
  const p = myPos();
  // nearest forageable cell on the whole grid
  let best = null, bd = 99;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const c = d[y] && d[y][x];
    if (c === 'plant' || c === 'bush' || c === 'tree' || c === 'bigtree') {
      const dist = Math.max(Math.abs(x - p.x), Math.abs(y - p.y));
      if (dist < bd) { bd = dist; best = { x, y }; }
    }
  }
  if (!best) return false; // nothing on this node
  if (bd > 1) {
    // walk adjacent (don't step ONTO it — some cells block)
    const tx = best.x + Math.sign(p.x - best.x), ty = best.y + Math.sign(p.y - best.y);
    const cx = Math.max(0, Math.min(8, tx)), cy = Math.max(0, Math.min(8, ty));
    act('walk', () => Game.microMove(cx, cy));
  }
  act('forage', () => Game.doAction('forage', { cx: best.x, cy: best.y }));
  return invCount() > before ? true : 'fail';
}
function travelStep() {
  const tg = Game.travelTargets();
  if (!tg.length) return false;
  const t = tg[Math.floor(Math.random() * tg.length)];
  const px0 = Game.map.px, py0 = Game.map.py;
  act('travel', () => Game.travelTo(t.x, t.y));
  return (Game.map.px !== px0 || Game.map.py !== py0) ? true : 'fail';
}
function goNode(pred) {
  const tg = Game.travelTargets().filter(t => { const tile = Game.tileAt(t.x, t.y); return tile && pred(tile); });
  const list = tg.length ? tg : Game.travelTargets();
  if (!list.length) return false;
  // richest first
  list.sort((a, b) => (Game.tileAt(b.x, b.y).stock || 0) - (Game.tileAt(a.x, a.y).stock || 0));
  const px0 = Game.map.px, py0 = Game.map.py;
  act('travel', () => Game.travelTo(list[0].x, list[0].y));
  return (Game.map.px !== px0 || Game.map.py !== py0) ? true : 'fail';
}
function convoStep(vid, exchanges) {
  const r = act('convo-open', () => Game.startConvo(vid));
  if (!r) return 'fail';
  const topics = ['village', 'plans', 'past', 'goal', 'theorize'];
  for (let i = 0; i < exchanges; i++) {
    act('convo-deep', () => { try { Game.askAbout(vid, topics[i % topics.length]); } catch (e) {} });
  }
  return true;
}
function examineStep() {
  const p = myPos();
  const cx = Math.max(0, Math.min(8, p.x + Math.floor(Math.random() * 3) - 1));
  const cy = Math.max(0, Math.min(8, p.y + Math.floor(Math.random() * 3) - 1));
  const d = Game.genDetail(Game.map.px, Game.map.py);
  const before = Game.state.scholar.dayTicks;
  act('examine', () => Game.cellInteract(cx, cy));
  return Game.state.scholar.dayTicks > before ? true : 'fail';
}
function cookStep() {
  const idx = Game.state.scholar.inventory.findIndex(i => i.rawKcal);
  if (idx < 0) return false;
  const before = Game.state.scholar.dayTicks;
  act('cook', () => Game.cookFood(idx));
  return Game.state.scholar.dayTicks > before ? true : 'fail';
}

const ARCHETYPES = {
  forager() {
    const plan = [['go-grounds', () => goNode(t => t.type !== 'haven' && t.type !== 'ruin')]];
    for (let i = 0; i < 10; i++) plan.push(['forage', forageStep]);
    plan.push(['go-home', () => goNode(t => t.type === 'haven')]);
    for (let i = 0; i < 4; i++) plan.push(['forage', forageStep]);
    return plan;
  },
  explorer() {
    const plan = [];
    for (let i = 0; i < 4; i++) {
      plan.push(['travel', travelStep]);
      plan.push(['examine', examineStep]);
      plan.push(['examine', examineStep]);
      plan.push(['examine', examineStep]);
      plan.push(['forage', forageStep]);
      plan.push(['forage', forageStep]);
    }
    return plan;
  },
  social() {
    const vids = (Game.state.village.roster || []).filter(id => id !== Game.villagerId).slice(0, 6);
    return vids.map(vid => ['convo×8', () => convoStep(vid, 8)]);
  },
  survivalist() {
    return [
      ['go-grounds', () => goNode(t => t.type !== 'haven' && t.type !== 'ruin')],
      ['forage', forageStep], ['forage', forageStep], ['forage', forageStep], ['forage', forageStep],
      ['go-home', () => goNode(t => t.type === 'haven')],
      ['boil-water', () => { const b = Game.state.scholar.dayTicks; act('boil', () => Game.doAction('treat')); return Game.state.scholar.dayTicks > b ? true : 'fail'; }],
      ['clear-brush', () => { const p = myPos(); const b = Game.state.scholar.dayTicks; act('chore', () => Game.clearBrush(p.x, p.y)); return Game.state.scholar.dayTicks > b ? true : 'fail'; }],
      ['cook', cookStep],
      ['rest', () => { const b = Game.state.scholar.dayTicks; act('rest', () => Game.doAction('rest')); return Game.state.scholar.dayTicks > b ? true : 'fail'; }],
      ['forage', forageStep], ['forage', forageStep],
    ];
  },
  speedrunner() {
    const vids = (Game.state.village.roster || []).filter(id => id !== Game.villagerId).slice(0, 3);
    const plan = [
      ['go-grounds', () => goNode(t => t.type !== 'haven' && t.type !== 'ruin')],
      ['forage', forageStep], ['forage', forageStep], ['forage', forageStep],
      ['travel', travelStep], ['examine', examineStep], ['examine', examineStep],
      ['forage', forageStep], ['forage', forageStep],
    ];
    vids.forEach(vid => plan.push(['convo×5', () => convoStep(vid, 5)]));
    plan.push(['travel', travelStep]);
    plan.push(['boil-water', () => { const b = Game.state.scholar.dayTicks; act('boil', () => Game.doAction('treat')); return Game.state.scholar.dayTicks > b ? true : 'fail'; }]);
    plan.push(['forage', forageStep]);
    return plan;
  },
};

(async () => {
  await Game.init();
  for (const [name, buildPlan] of Object.entries(ARCHETYPES)) {
    const d0 = startDay();
    const plan = buildPlan();
    let done = 0, failed = 0, skipped = 0;
    for (const [label, fn] of plan) {
      upkeep();
      if (dayOver(d0)) { skipped++; continue; }
      try {
        const r = fn();
        if (r === 'fail') failed++; else if (r !== false) done++;
        else failed++;
      } catch (e) { failed++; if (failed <= 3) console.log(`  ERROR in ${label}: ${e.message}`); }
    }
    const st = status();
    const total = Object.values(buckets).reduce((a, b) => a + b, 0);
    console.log(`\n=== ${name.toUpperCase()} ===`);
    console.log(`itinerary: ${done}/${plan.length} done, ${failed} failed, ${skipped} squeezed out by day-end`);
    console.log(`day ended: ${dayEndCount > 0 ? 'yes' : 'NO — day did not end'}`);
    const cats = Object.entries(buckets).sort((a, b) => b[1] - a[1]);
    for (const [k, v] of cats) console.log(`  ${k}: ${v} ticks (${Math.round(v / 512 * 100)}% of day)`);
    console.log(`  TOTAL: ${total}/512 ticks | end: kcal=${st.kcal} hyd=${st.hyd} energy=${st.energy} invUnits=${invCount()}`);
  }
})();
