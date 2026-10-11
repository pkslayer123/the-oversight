#!/usr/bin/env node
// PROOF TEST (hunter adversarial playtest, 2026-10-10, archetype 5, run r2):
// the ACTIVE fish() action vs the tile's real fish ecology.
//
// The 2026-10-08 ecology fixes made traps, nets, and encounters hunt the
// tile's REAL simEcology wildlife ("conjured animals from thin air" was the
// bug). The gill net got the same treatment on 2026-10-09 (flat 300-600 kcal
// "fish" -> real creek_chub/bluegill at species kcal, populations decrement,
// fished-out gets one honest quiet line). But the active hand-line fish()
// was MISSED: it pays a flat 500-900 kcal (known) / 150-350 (blind) x1.3
// for ANY catch, from a fake {id:'fish'} animal, with NO population check
// and NO decrement. A hostile player fishes a fished-out creek forever —
// the net says "fished out" on the same water while the hand-line prints.
//
//   E13 EXPLOIT — fish a fishless creek 200x: any kcal at all = conjured energy.
//   E13b        — per-catch: gross <= 260 (200-chub kcal x 1.3 line bonus),
//                 real species name, stock decrements by exactly 1.
//   E14 SOFTLOCK — chase a rabbit to winded at the grid edge, walk up, strike:
//                 no throw, encounter resolves (no phantom).
//   E15 HONESTY — pond copy says "Small fish, maybe" — engine must pay small.
//   E16 HONESTY — fish() without tackle refuses honestly (backstop).
//
// Post-fix expectations:
//   - catches come from the tile's FISH_IDS stock (creek_chub/bluegill),
//     one fish per catch, populations decrement;
//   - fishless water: honest "fished out" line, no carcass, still costs time;
//   - still water (pond): small fish — 0.6x chance and yield vs creek/wetland;
//   - no-tackle: honest refusal, no cost.
//
// NOTE: long cast loops advance days — the world keeps living (villagers,
// needs). sustain() tops up the test player each cast so the probe measures
// fishing, not starvation. (An earlier draft of this test watched its own
// fisherman die of thirst on day 7 and mistook the mantle-passing inventory
// wipe for a theft bug.)
// Run: SEED=N node scripts/test-hunter-activefishing-20261010.js
const H = require('./sim-harness.js');
const fails = [];
const check = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' — ' + extra : ''));
  if (!cond) fails.push(name);
};
function tile(Game, x, y) { return Game.map.tiles[y][x]; }
function setTile(Game, x, y, type, wildlife) {
  const t = tile(Game, x, y);
  t.type = type; t.wildlife = Object.assign({}, wildlife || {});
  t.traps = []; t.nets = [];
  return t;
}
function gotoTile(Game, x, y) {
  Game.map.px = x; Game.map.py = y;
  const s = Game.state.scholar; s.mx = 4; s.my = 4;
}
function giveLine(Game) {
  const s = Game.state.scholar; s.inventory = s.inventory || [];
  if (!Game.hasItem('fishing_line')) s.inventory.push({ name: 'fishing line', itemId: 'fishing_line', units: 1 });
}
// the world lives while you fish: keep the probe alive, not the exploit
function sustain(Game) {
  const s = Game.state.scholar;
  s.kcal = 2000; s.health = 100; s.hydration = 100;
  s.water = [{ liters: 9, quality: 'clean', source: 'Haven' }];
  giveLine(Game);
}
function fishedCarcasses(Game) {
  return (Game.state.scholar.inventory || []).filter(i => i.foodState === 'carcass' && /fish|chub|bluegill/i.test(i.source || i.name || ''));
}
const stockTotal = (t) => ['creek_chub', 'bluegill'].reduce((n, id) => n + ((t.wildlife || {})[id] || 0), 0);

(async () => {
  const { Game } = await H.loadGame({ seed: parseInt(process.env.SEED || '20261010', 10) });
  await H.setupGame(Game);
  const s = Game.state.scholar;
  let said = [];
  Game.say = (m) => { said.push(String(m)); };
  Game.sysSay = () => {};
  const sayText = () => { const t = said.join(' '); said = []; return t; };

  // ============ E13: active fishing on FISHLESS water ============
  // LIVING-WORLD NOTE (hunter playtest 2026-10-10 r3): 200 casts is ~12 days,
  // and simEcology migrates wildlife between adjacent tiles (10%/species/
  // day) — a creek chub can honestly swim in from next door mid-probe (seen
  // seed 99, cast 193). The tile doesn't STAY fishless, so "zero catches"
  // is the wrong invariant. The real pin: per cast, every carcass came from
  // pre-cast stock — fish() never conjures from empty water. (The stale-list
  // bonus double-up that DID conjure is fixed in game.js fish().)
  {
    gotoTile(Game, 4, 4);
    setTile(Game, 4, 4, 'creek', {}); // fishless — nets would say "fished out"
    s.inventory = [];
    Game.state.codex = Game.state.codex || {}; Game.state.codex.fishWise = true; // known
    let totalKcal = 0, catches = 0, fishedOutSaid = false, conjured = 0;
    for (let i = 0; i < 200; i++) {
      sustain(Game);
      s.inventory = s.inventory.filter(x => x.itemId === 'fishing_line');
      const beforeC = fishedCarcasses(Game).length;
      const beforeS = stockTotal(tile(Game, 4, 4));
      Game.fish(); const txt = sayText();
      const newC = fishedCarcasses(Game).length - beforeC;
      if (newC > 0) {
        catches += newC;
        for (const c of fishedCarcasses(Game).slice(-newC)) totalKcal += (c.hiddenKcal || 0);
        if (newC > beforeS) conjured += (newC - beforeS);
      }
      if (beforeS === 0 && /fished out/i.test(txt)) fishedOutSaid = true;
    }
    check('E13 no conjured fish from empty water', conjured === 0,
      `conjured=${conjured} of ${catches} catches (migrated-in fish are honest)`);
    check('E13 fishless water says fished out', fishedOutSaid, 'honest quiet like the net');
  }

  // ============ E13b: per-catch honesty on stocked water ============
  // ISOLATION (hunter playtest 2026-10-10 r3): E13b measures CATCH
  // ACCOUNTING (each carcass == exactly 1 stock decrement), not the living
  // world. fish() burns 32 ticks and the depletion ecology sims wildlife at
  // every dawn (simEcology) while villagers work the same water — both move
  // the stock between the before/after snapshots and make exact equality
  // unmeasurable. Freeze time for the probe; the ecology's honesty is
  // covered by the ecology suites, not this pin.
  {
    gotoTile(Game, 2, 2);
    setTile(Game, 2, 2, 'creek', { creek_chub: 30, bluegill: 30 });
    s.inventory = [];
    Game.state.codex.fishWise = true;
    const _tick = Game.tickAction;
    Game.tickAction = () => undefined; // frozen clock: measure the catch, not the day
    let maxGross = 0, catches = 0, badSpecies = 0, badDelta = 0;
    for (let i = 0; i < 60 && stockTotal(tile(Game, 2, 2)) > 0; i++) {
      sustain(Game);
      s.inventory = s.inventory.filter(x => x.itemId === 'fishing_line');
      const beforeC = fishedCarcasses(Game).length;
      const beforeS = stockTotal(tile(Game, 2, 2));
      Game.fish(); sayText();
      const newC = fishedCarcasses(Game).length - beforeC;
      const spent = beforeS - stockTotal(tile(Game, 2, 2));
      if (newC > 0) {
        catches += newC;
        for (const c of fishedCarcasses(Game).slice(-newC)) {
          const g = c.hiddenKcal || 0;
          if (g > maxGross) maxGross = g;
          if (!/chub|bluegill/i.test(String(c.name || ''))) badSpecies++;
        }
        if (spent !== newC) badDelta++;
      }
    }
    check('E13b per-catch gross <= 260 (200-chub x 1.3 line)', maxGross <= 260, `maxGross=${maxGross}`);
    check('E13b catches are real species', catches > 0 && badSpecies === 0, `generic=${badSpecies} of ${catches}`);
    check('E13b each catch decrements stock by exactly 1', catches > 0 && badDelta === 0, `mismatches=${badDelta}`);
    Game.tickAction = _tick; // clock back on
  }

  // ============ E14: chase to winded at the edge, walk up, strike ============
  {
    gotoTile(Game, 5, 5);
    setTile(Game, 5, 5, 'meadow', { cottontail_rabbit: 3 });
    s.inventory = [];
    s.animal = { id: 'cottontail_rabbit', mx: 6, my: 4, pstate: 'bolt', aware: 1, stamina: 3, wild: true };
    let threw = null, iters = 0;
    try {
      for (; iters < 60 && s.animal && s.animal.pstate !== 'winded'; iters++) {
        sustain(Game);
        try { Game.animalTurn(); } catch (e) {}
        try { Game.huntAnimal(); } catch (e) { threw = e; break; }
        sayText();
      }
      // walk up to the winded animal and strike — the chase's payoff
      let strikes = 0;
      while (s.animal && strikes < 10 && !threw) {
        sustain(Game);
        s.mx = Math.max(0, s.animal.mx - 1); s.my = s.animal.my;
        try { Game.huntAnimal(); } catch (e) { threw = e; break; }
        sayText();
        strikes++;
      }
    } catch (e) { threw = e; }
    sayText();
    check('E14 chase+strike never throws', !threw, threw ? String(threw).slice(0, 120) : `chase ${iters}, strikes resolved`);
    check('E14 encounter resolves (no phantom)', !s.animal, s.animal ? `stuck: ${s.animal.pstate} @${s.animal.mx},${s.animal.my}` : 'cleared');
  }

  // ============ E15: pond honesty — "Small fish, maybe" pays small ============
  {
    const avgFor = (tx, ty, type) => {
      gotoTile(Game, tx, ty);
      setTile(Game, tx, ty, type, { creek_chub: 40, bluegill: 40 });
      s.inventory = [];
      Game.state.codex.fishWise = true;
      let tot = 0, n = 0;
      for (let i = 0; i < 60; i++) {
        sustain(Game);
        s.inventory = s.inventory.filter(x => x.itemId === 'fishing_line');
        Game.fish(); sayText();
        for (const c of fishedCarcasses(Game)) { n++; tot += (c.hiddenKcal || 0); }
      }
      return n ? tot / n : 0;
    };
    const pondAvg = avgFor(3, 3, 'pond');
    const creekAvg = avgFor(4, 4, 'creek');
    check('E15 pond pays clearly smaller than creek ("Small fish, maybe")',
      pondAvg > 0 && creekAvg > 0 && pondAvg <= creekAvg * 0.8,
      `pond avg=${pondAvg.toFixed(0)} creek avg=${creekAvg.toFixed(0)} (need pond<=80% of creek)`);
  }

  // ============ E16: no tackle, honest refusal ============
  {
    gotoTile(Game, 4, 4);
    setTile(Game, 4, 4, 'creek', { creek_chub: 5 });
    s.inventory = []; // no line on purpose
    s.kcal = 2000;
    Game.fish(); const txt = sayText();
    check('E16 no tackle refuses honestly', /tackle|line/i.test(txt), txt.slice(0, 80));
    check('E16 refusal costs nothing', s.kcal === 2000, `kcal=${s.kcal}`);
    check('E16 refusal conjures nothing', fishedCarcasses(Game).length === 0, '');
  }

  console.log(fails.length ? `\n${fails.length} FAILURES: ${fails.join('; ')}` : '\nALL GREEN');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH', e); process.exit(2); });
