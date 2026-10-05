// Survivalist (wild camp) playtest: 6 days LIVING WILD, no haven return.
// Usage: node scripts/playtest-survivalist-wild.js
// The survivalist fantasy: leave the village, gather deadfall, friction-fire,
// boil creek water, forage, sleep fireside. Reports the wild-camp feel:
// how much of the day the camp chores cost, fire reliability, hydration
// curve, and whether wild living sustains or slowly kills you.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const s = () => Game.state.scholar;
const cleanBottles = () => (s().water || []).filter(b => b.quality === 'clean').length;
const snap = () => `hyd=${Math.round(s().hydration || 0)} kcal=${Math.round(s().kcal || 0)} hp=${Math.round(s().health || 0)} en=${Math.round(s().energy || 0)} H2O=${(s().water || []).length}(${cleanBottles()} clean)`;

let day = 1;
const log = [];
const say = (m) => log.push(`D${day} ${m}`);
function drainSay() {
  const lines = Game.log.splice(0, Game.log.length);
  for (const l of lines.slice(-8)) log.push(`D${day} [game] ${l.slice(0, 170)}`);
}

function bestWildTile() {
  let best = null, bv = -1;
  for (const t of Game.travelTargets()) {
    const tile = Game.tileAt(t.x, t.y);
    if (tile.type === 'haven') continue;
    const vv = (tile.stock || 0) / (t.d + 1) + (tile.type === 'creek' ? 3 : 0) + (tile.type === 'forest' ? 2 : 0);
    if (vv > bv) { bv = vv; best = t; }
  }
  return best;
}

function moveNear(cx, cy) {
  // walk the player adjacent to (cx,cy) — steps are free, the ACTION costs
  s().mx = Math.max(0, Math.min(8, cx + (cx > 4 ? -1 : 1)));
  s().my = Math.max(0, Math.min(8, cy > 4 ? cy - 1 : cy + 1));
}

function findCell(want) {
  const d = Game.genDetail(Game.map.px, Game.map.py);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const c = d[y] && d[y][x];
    if (want.indexOf(c) !== -1) return { cx: x, cy: y, cell: c };
  }
  return null;
}

function groundCellNearPlayer() {
  const d = Game.genDetail(Game.map.px, Game.map.py);
  const mx = s().mx ?? 4, my = s().my ?? 4;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = mx + dx, cy = my + dy;
    if (cx < 0 || cx > 8 || cy < 0 || cy > 8) continue;
    if (Game.fireGroundOK(d[cy] && d[cy][cx])) return { cx, cy };
  }
  return null;
}

function forageFew(n) {
  let got = 0;
  for (let i = 0; i < n; i++) {
    const d0 = s().day;
    Game.doAction('forage');
    got++;
    if (s().day !== d0) break;
  }
  return got;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.log.length = 0;

  let fireAttempts = 0, fireFails = 0, firesMade = 0, boils = 0, sickDrinks = 0, nightsWoke = 0, refusedSleeps = 0;

  for (day = 1; day <= 6 && !Game.state.over; day++) {
    say(`MORNING: ${snap()} on tile ${Game.playerTile() && Game.playerTile().type}`);
    const ticks0 = s().dayTicks || 0;

    // 0. MOVE: travel out to a good wild tile (never haven), walk to the green.
    const t = bestWildTile();
    if (t) { Game.travelTo(t.x, t.y); say(`traveled to ${Game.playerTile().type} (${Game.map.px},${Game.map.py})`); }
    drainSay();
    const spot = findCell(['plant', 'bush']);
    if (spot) { moveNear(spot.cx, spot.cy); say(`walked to the green (${spot.cell})`); }

    // 1. WATER: fill 3L (risky wild / creek).
    const tileType = Game.playerTile() && Game.playerTile().type;
    for (let i = 0; i < 3; i++) Game.fillWater();
    say(`filled 3L on ${tileType} tile, now ${(s().water || []).length}L carried`);

    // 2. FUEL: walk to a tree, gather deadfall.
    const tc = findCell(['tree', 'bigtree', 'bush', 'thicket']);
    if (tc) {
      moveNear(tc.cx, tc.cy);
      const b0 = Game.materialCount('branch');
      Game.gatherFallen(tc.cx, tc.cy);
      say(`gathered deadfall: branches ${b0} -> ${Game.materialCount('branch')}`);
    } else say('no tree/brush on this node — no fuel today');
    drainSay();

    // 3. FIRE: friction fire, real rolls, up to 4 attempts.
    const gc = groundCellNearPlayer();
    let lit = false, tries = 0;
    while (gc && !lit && Game.materialCount('branch') >= 2 && tries < 4) {
      tries++; fireAttempts++;
      const f0 = (Game.state.fires || []).length;
      Game.makeFire(gc.cx, gc.cy);
      lit = (Game.state.fires || []).length > f0;
      if (!lit) fireFails++;
    }
    if (lit) { firesMade++; say(`fire lit after ${tries} attempt(s)`); Game.feedFire(gc.cx, gc.cy); say('fed the fire'); }
    else say(`NO FIRE after ${tries} attempt(s) — branches left ${Game.materialCount('branch')}`);
    drainSay();

    // 4. BOIL + DRINK.
    if (Game.nearFire()) {
      const before = cleanBottles();
      Game.boilWater();
      if (cleanBottles() > before) { boils++; say(`boiled water: clean bottles ${before} -> ${cleanBottles()}`); }
    }
    const hp0 = Math.round(s().health);
    Game.drinkWater();
    if (Math.round(s().health) < hp0) { sickDrinks++; say('drank risky — got SICK (-15 hp)'); }
    drainSay();

    // 5. FOOD: forage the patch; if hungry and holding unknowns, TEST them
    // (the cautious test — the field survivalist's way out of ignorance).
    const sp2 = findCell(['plant', 'bush', 'tree', 'bigtree']);
    if (sp2) moveNear(sp2.cx, sp2.cy);
    const g = forageFew(4);
    if (Math.round(s().kcal) < 1000) {
      const li = (s().inventory || []).findIndex(i => i.lump);
      if (li !== -1) {
        const ticksB = s().dayTicks || 0;
        Game.testCautiously(li, {}, s().inventory);
        say(`tested an unknown cautiously (${(s().dayTicks || 0) - ticksB} ticks)`);
        drainSay();
      }
    }
    const k0 = Math.round(s().kcal);
    Game.eat();
    say(`foraged ${g}x, ate: kcal ${k0} -> ${Math.round(s().kcal)}`);
    drainSay();
    say(`chores cost: ${(s().dayTicks || 0) - ticks0} ticks (~${Math.round((((s().dayTicks || 0) - ticks0) / Game.TIME.TICKS_PER_DAY) * 100)}% of day)`);

    // 6. If the day is still young, rest a while (honest time-passing) so sleep is real.
    if (Game.dayPart === 0 && (s().dayTicks || 0) < Game.TIME.TICKS_PER_BATCH) {
      Game.doAction('rest');
      say('rested a while to let the day turn');
    }

    // 7. SLEEP wherever we are.
    const q = Game.sleepQuality();
    const hpA = Math.round(s().health), dayA = s().day;
    Game.sleep();
    const refused = Game.log.some(l => l.indexOf('barely dawn') !== -1);
    Game.log.length = 0;
    if (refused) { refusedSleeps++; say('sleep refused (barely dawn) — day did not advance'); }
    else {
      if (s().day === dayA && !Game.state.over) { nightsWoke++; say('WOKE MID-NIGHT (danger/interruption)'); }
      say(`slept ${q}: hp ${hpA} -> ${Math.round(s().health)}; EOD ${snap()}`);
    }
  }

  say(`FINAL: ${snap()} gameDay=${s().day} over=${!!Game.state.over}`);
  say(`firecraft: attempts=${fireAttempts} fails=${fireFails} fires=${firesMade} boils=${boils} sickDrinks=${sickDrinks} successes=${(s().firecraft || {}).successes || 0} nightsWoke=${nightsWoke} refusedSleeps=${refusedSleeps}`);

  console.log(log.join('\n'));
  fs.writeFileSync(path.join(ROOT, 'playtests', '2026-10-05-survivalist-wild.md'),
    ['# 2026-10-05 survivalist wild-camp run (playtest loop)', '',
     'Six days living wild, no haven return. Player fantasy: deadfall + friction fire + boiled creek water + fireside sleep.', '',
     '```', log.join('\n'), '```', '', '## Feel verdict', 'See loop log entry for this run.', ''].join('\n'));
  console.log('\n(wrote playtests/2026-10-05-survivalist-wild.md)');
})().catch(e => { console.error('THREW:', e && e.stack || e); process.exit(1); });
