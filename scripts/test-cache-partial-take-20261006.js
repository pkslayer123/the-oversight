// Cache partial take (miser rations drawer). Steve's chain: a proof test per fix.
// Gap (before fix): a buried cache is a monolith — digUpCache takes everything
// or nothing, weight-checked on the TOTAL. A miser with a heavy pack cannot
// draw a few days' rations; a big stockpile can even brick (too heavy to ever
// lift at once, no way to take part).
// Fix: Game.takeFromCache(cacheId, itemIdx, qty) — location-gated, draws qty
// units of one item, weight-checked on the portion, leaves the rest buried.
// Usage: node scripts/test-cache-partial-take-20261006.js
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
function eq(name, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
const s = () => Game.state.scholar;
const packKcal = () => (s().inventory || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
const invUnits = (name) => ((s().inventory || []).find(i => i.name === name) || {}).units || 0;

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  s().mx = 4; s().my = 4;
  s().inventory = [];
}
// stash 20 pemmican in the pack, then bury all of it at the current node
function buryPemmican(units) {
  s().inventory = [{ itemId: 'pemmican', name: 'Pemmican', units, kcalEach: 600, kg: 0.3, spoilDay: 9999 }];
  Game.log.length = 0;
  Game.buryCache('food', 0, units);
  const caches = Game.playerCaches();
  return caches[caches.length - 1];
}

(async () => {
  await Game.init();

  // ---------- 1. the gap: no partial take, brick on weight ----------
  freshGame();
  ok('takeFromCache API exists', typeof Game.takeFromCache === 'function');
  const c1 = buryPemmican(20);
  eq('cache holds 20', c1.items[0].units, 20);
  // heavy pack: 18kg of rocks (inventory weight counts); empty waterskins
  // so the numbers are deterministic — waterWeight() is real and counts.
  s().water = [];
  s().inventory = [{ name: 'Rock', units: 6, kg: 3, kcalEach: 0 }];
  Game.log.length = 0;
  const r = Game.digUpCache(c1.id); // 6kg cache + 18kg pack > 20kg capacity
  eq('full dig refused when overweight', r, null);
  ok('refusal names weight', /Too heavy/.test(Game.log.join(' ')));
  ok('cache still buried', Game.playerCaches().some(c => c.id === c1.id));
  // the ONLY recourse before the fix: drop your pack. After: draw rations.
  if (typeof Game.takeFromCache === 'function') {
    Game.log.length = 0;
    const r2 = Game.takeFromCache(c1.id, 0, 4); // 1.2kg fits: 18 + 1.2 <= 20
    ok('partial take works with heavy pack', r2 !== null && r2 !== undefined);
    eq('took 4 into pack', invUnits('Pemmican'), 4);
    eq('16 left buried', Game.playerCaches().find(c => c.id === c1.id).items[0].units, 16);
    ok('says the rest stays buried', /stays buried|rest/.test(Game.log.join(' ')));
    // too much for the pack: 10 units = 3kg -> 18+3 > 20
    Game.log.length = 0;
    const r3 = Game.takeFromCache(c1.id, 0, 10);
    eq('over-portion refused', r3, null);
    ok('refusal suggests less', /less|heavy/i.test(Game.log.join(' ')));
    eq('cache untouched by refused take', Game.playerCaches().find(c => c.id === c1.id).items[0].units, 16);
  }

  // ---------- 2. location gate: no drawing from the hall couch ----------
  freshGame();
  const c2 = buryPemmican(10);
  Game.map.px += 1; // walk one node away
  Game.log.length = 0;
  const r4 = Game.takeFromCache(c2.id, 0, 2);
  eq('away take refused', r4, null);
  ok('journal reminder names the spot', /journal|Not here/i.test(Game.log.join(' ')));
  Game.map.px -= 1;
  const r5 = Game.takeFromCache(c2.id, 0, 2);
  ok('home-node take works', r5 !== null && r5 !== undefined);
  eq('2 drawn, 8 remain', Game.playerCaches().find(c => c.id === c2.id).items[0].units, 8);

  // ---------- 3. materials: draw branches without digging ----------
  freshGame();
  Game.addMaterial('branch', 10);
  Game.log.length = 0;
  Game.buryCache('material', 'branch', 10);
  const c3 = Game.playerCaches()[Game.playerCaches().length - 1];
  eq('branch cache buried', c3.items[0].units, 10);
  eq('pack branches spent', Game.materialCount('branch'), 0);
  Game.takeFromCache(c3.id, 0, 3);
  eq('3 branches back in hand', Game.materialCount('branch'), 3);
  eq('7 stay buried', Game.playerCaches().find(c => c.id === c3.id).items[0].units, 7);

  // ---------- 4. emptying the last item removes the cache ----------
  freshGame();
  const c4 = buryPemmican(2);
  Game.takeFromCache(c4.id, 0, 5); // clamped to 2
  eq('over-qty clamped, cache gone', Game.playerCaches().some(c => c.id === c4.id), false);
  eq('took both units', invUnits('Pemmican'), 2);

  // ---------- 5. spoilage: rotted portion goes to the worms ----------
  freshGame();
  const today = Game.state.scholar.day;
  s().inventory = [{ itemId: 'berries', name: 'Berries', units: 6, kcalEach: 40, kg: 0.1, spoilDay: today }]; // rots today
  Game.log.length = 0;
  Game.buryCache('food', 0, 6);
  const c5 = Game.playerCaches()[Game.playerCaches().length - 1];
  Game.state.scholar.day = today + 1; // a day passes underground
  Game.takeFromCache(c5.id, 0, 4);
  eq('rotted take adds nothing', invUnits('Berries'), 0);
  ok('worms mentioned', /worms|bad/i.test(Game.log.join(' ')));
  eq('rotted portion removed, 2 left', (Game.playerCaches().find(c => c.id === c5.id) || { items: [] }).items[0]
    ? Game.playerCaches().find(c => c.id === c5.id).items[0].units : -1, 2);
  Game.state.scholar.day = today;

  // ---------- 6. robbed cache: a take attempt discovers the theft ----------
  freshGame();
  const c6 = buryPemmican(8);
  const rr6 = Math.random; Math.random = () => 0.9; // trace roll >= 0.5 -> no gossip
  Game.resolveCacheRobbery(c6); // theft fires while player is away
  Math.random = rr6;
  eq('robbed flag set', c6.found, true);
  ok('not yet discovered', !c6.discovered);
  Game.log.length = 0;
  Game.takeFromCache(c6.id, 0, 2); // player walks up, reaches for a handful...
  ok('discovery at the hole', c6.discovered === true);
  ok('says someone got here first', /got here first|Disturbed/i.test(Game.log.join(' ')));
  ok('codex entry lands at discovery', (Game.state.codex.places || []).some(p => /robbed/i.test(p.text)));
  eq('robbed cache removed', Game.playerCaches().some(c => c.id === c6.id), false);

  // ---------- 7. cachesHtml renders Take affordances ----------
  freshGame();
  const c7 = buryPemmican(6);
  const html = Game.cachesHtml();
  ok('Take button rendered', new RegExp(`data-cache-take="${c7.id}:0"`).test(html));
  ok('qty input rendered', new RegExp(`take-qty-${c7.id}`).test(html));

  // ---------- 8. gossip says the theft OUTRIGHT (miser gut-punch) ----------
  // Before the fix, the trace planted a doubt but the live log only carried
  // a generic "jotted down what they said" — the player saw DISTURBED with no
  // in-fiction idea why. Now the ❓ payload is said outright (the truth.js
  // convention), and the generic label doesn't double-post.
  freshGame();
  const c8 = buryPemmican(5);
  Game.log.length = 0;
  const rr = Math.random; Math.random = () => 0.1; // trace roll < 0.5 -> fires
  Game.resolveCacheRobbery(c8);
  Math.random = rr;
  const saidAll = Game.log.join(' ');
  ok('gossip payload said outright', /❓/.test(saidAll) && /was robbed/.test(saidAll));
  ok('no generic double-post', !/jotted down what they said/.test(saidAll));
  ok('doubt still recorded in codex', (Game.state.codex.doubts || []).some(d => d.theft));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
