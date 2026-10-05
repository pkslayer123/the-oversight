// Survivalist playtest: water / fire / shelter / rest / needs management.
// Usage: node scripts/test-survivalist.js
// Plays 7 days as a needs-management player and reports the survivalist feel:
// hydration curve, well economy, fire availability, cooking water costs, sleep quality.
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

const T = () => Game.TIME;
const s = () => Game.state.scholar;
const v = () => Game.state.village;
const wellClean = () => Math.round((v().water && v().water.clean) || 0);
const bottles = () => (s().water || []).length;
const riskyBottles = () => (s().water || []).filter(b => b.quality === 'risky').length;
const snap = () => `hyd=${Math.round(s().hydration)} kcal=${Math.round(s().kcal)} hp=${Math.round(s().health)} en=${Math.round(s().energy)} well=${wellClean()}L bottles=${bottles()}(${riskyBottles()} risky)`;

function goHome() {
  const hx = (v().px ?? 3), hy = (v().py ?? 3);
  Game.travelTo(hx, hy); // arriving at the haven tile triggers returnToVillage (unload)
}

function nearestTileOfType(type) {
  let best = null, bd = 99;
  for (const t of Game.travelTargets()) {
    const tile = Game.tileAt(t.x, t.y);
    if (tile.type !== type) continue;
    if (t.d < bd) { bd = t.d; best = t; }
  }
  return best;
}

function hasFireHere() {
  const d = Game.genDetail(Game.map.px, Game.map.py);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (d[y] && d[y][x] === 'fire') return true;
  return false;
}

function forageAFew(n) {
  let got = 0;
  for (let i = 0; i < n; i++) {
    const before = s().inventory.length;
    try { Game.doAction('forage'); } catch (e) { break; }
    if (s().inventory.length >= before) got++;
    if (s().day !== day) break; // day rolled over
    if ((s().dayTicks || 0) > T().TICKS_PER_DAY * 0.8) break;
  }
  return got;
}

let day = 1;
const log = [];
const say = (m) => log.push(`D${day} ${m}`);

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  s().kcal = 2600;

  // Seed: 5 raw beans (needsCooking) to exercise the cook path at fires.
  s().inventory.push({ name: 'Raw beans', kcalEach: 0, units: 5, kg: 0.1, unit: 'handful', rawKcal: 300, cookedKcal: 600, needsCooking: true, safe: false, spoilDay: 30 });

  for (day = 1; day <= 7; day++) {
    say(`MORNING: ${snap()}`);
    // 1. Drink up (UI prefers clean).
    while (s().hydration < 90 && bottles() > 0) Game.drinkWater();
    // 2. Top up bottles via the UI fill path (fillWater — the free one).
    const wellBefore = wellClean();
    let fills = 0;
    while (bottles() < 5 && s().day === day) { Game.fillWater(); fills++; if (fills > 8) break; }
    const wellAfter = wellClean();
    if (fills > 0) say(`filled ${fills}L at haven; cistern ${wellBefore}L -> ${wellAfter}L`);

    // 3. Cook raw beans at the haven fire (cooking water comes from the VILLAGE well).
    if (hasFireHere()) {
      const raw = s().inventory.find(i => i.needsCooking && i.rawKcal);
      if (raw) {
        const w0 = wellClean();
        Game.cookAll();
        say(`cooked ${raw.name}: well ${w0}L -> ${wellClean()}L (cost ${w0 - wellClean()}L for ${raw.units || '?'} units)`);
      }
    } else say('NO FIRE at haven this morning?!');

    // 4. Day 3: creek run — fill risky, haul back, boil at haven fire.
    if (day === 3) {
      const creek = nearestTileOfType('creek');
      if (creek) {
        Game.travelTo(creek.x, creek.y);
        for (let i = 0; i < 3; i++) Game.fillWater();
        say(`creek: filled 3L, risky bottles now ${riskyBottles()}`);
        goHome();
        if (hasFireHere() && riskyBottles() > 0) {
          const kcal0 = Math.round(s().kcal);
          Game.boilWater();
          say(`boiled: risky now ${riskyBottles()}, kcal ${kcal0} -> ${Math.round(s().kcal)} (boil cost)`);
        }
      } else say('no creek in range');
    }

    // 5. Forage the day away on a rich tile.
    let best = null, bv = -1;
    for (const t of Game.travelTargets()) {
      const tile = Game.tileAt(t.x, t.y);
      if (tile.type === 'haven' || tile.type === 'ruin') continue;
      const vv = (tile.stock || 0) / (t.d + 1);
      if (vv > bv) { bv = vv; best = t; }
    }
    if (best) {
      Game.travelTo(best.x, best.y);
      const got = forageAFew(4);
      say(`foraged ${got}x at ${Game.playerTile().type}`);
    }
    // eat if hungry
    if (s().kcal < 1500) Game.eat();
    // 6. Home + sleep.
    goHome();
    if (s().kcal < 1200) Game.eat();
    const q = Game.sleepQuality();
    const hp0 = Math.round(s().health);
    Game.sleep();
    say(`EVENING: slept (${q}), hp ${hp0} -> ${Math.round(s().health)}; EOD ${snap()}`);
  }

  // 7. FIELD COOKING: does cooking away from haven drain the haven well?
  const w0 = wellClean();
  s().inventory.push({ name: 'Field beans', kcalEach: 0, units: 4, kg: 0.1, unit: 'handful', rawKcal: 300, cookedKcal: 600, needsCooking: true, safe: false, spoilDay: 30 });
  // find a non-haven tile with a fire
  let fireTile = null;
  for (const t of Game.travelTargets()) {
    const tile = Game.tileAt(t.x, t.y);
    if (tile.type === 'haven') continue;
    Game.travelTo(t.x, t.y);
    if (Game.playerTile() !== tile) continue; // travel blocked — not actually there
    if (hasFireHere()) { fireTile = t; break; }
  }
  if (fireTile) {
    Game.cookAll();
    say(`FIELD COOK (${Game.playerTile().type}): well ${w0}L -> ${wellClean()}L — remote drain? ${wellClean() < w0}`);
  } else say('no field fire found in range');

  console.log(log.join('\n'));
  console.log('\nFINAL: ' + snap() + ` day=${s().day}`);
})();
