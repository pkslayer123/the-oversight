// SURVIVALIST playtest: field shelter, firecraft, cold nights, metabolic crisis.
// Usage: node scripts/playtest-survivalist-shelter.js
// A real multi-day run through the survivalist's core loop, on the REAL
// Game.sleep() path (the old test-survivalist.js never advanced the clock):
//   creek water run (risky fill, knowledge-gated examine, boil)
//   field fire (makeFire -> feedFire -> fireside sleep on a cold snap)
//   tent shelter tier (find packable tent -> pitch -> sleep)
//   exposure (cold ground, dead fire -> -18, no heal)
//   metabolic crisis (sleep dehydrated/starving -> half heal, wrung out)
//   rest action (energy recovery economics)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js',
 'src/js/journal.js', 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js',
 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const s = () => Game.state.scholar;
const v = () => Game.state.village;
const failures = [];
const skips = [];
const notes = [];
function ok(cond, label) {
  console.log((cond ? '  PASS ' : '  FAIL ') + label);
  if (!cond) failures.push(label);
}
function skip(m) { skips.push(m); console.log('  SKIP ' + m); }
function note(m) { notes.push(m); console.log('  NOTE ' + m); }
function snap() {
  return `day=${s().day} part=${Game.dayPart} ticks=${s().dayTicks} kcal=${Math.round(s().kcal)} hyd=${Math.round(s().hydration)} hp=${Math.round(s().health)} en=${Math.round(s().energy)}`;
}
function beat(title) {
  console.log('\n' + '='.repeat(64) + '\n  ' + title + '  [' + snap() + ']\n' + '='.repeat(64));
}
function goHome() {
  Game.travelTo(v().px ?? 3, v().py ?? 3);
  return Game.playerTile().type === 'haven';
}
// walk home tile-by-tile when haven is out of single-travel range.
// Player-honest: no teleporting, just walking.
function navigateHome() {
  if (goHome()) return true;
  const hx = v().px ?? 3, hy = v().py ?? 3;
  for (let hop = 0; hop < 10; hop++) {
    let best = null, bd = 99;
    for (const t of Game.travelTargets()) {
      const d = Math.abs(t.x - hx) + Math.abs(t.y - hy);
      if (d < bd) { bd = d; best = t; }
    }
    if (!best) break;
    const px0 = Game.map.px, py0 = Game.map.py;
    Game.travelTo(best.x, best.y);
    if (Game.map.px === px0 && Game.map.py === py0) break; // blocked — stop
    if (goHome()) return true;
  }
  return Game.playerTile().type === 'haven';
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
function travelToTile(t, label) {
  Game.travelTo(t.x, t.y);
  const arrived = Game.map.px === t.x && Game.map.py === t.y;
  ok(arrived, `travel to ${label} (${t.x},${t.y})`);
  return arrived;
}
// soft travel: no assertion — for optional beats where a blockage just means
// "not this map". Returns true on arrival.
function tryTravel(t) {
  Game.travelTo(t.x, t.y);
  return Game.map.px === t.x && Game.map.py === t.y;
}
// Play the day like a player: work a forageable tile until mid-afternoon so
// sleep is honest (the engine refuses sleep at dawn — correctly).
// Returns the tile worked, so later beats can pick a FRESH tile.
function spendDay() {
  const rich = nearestTileOfType('grove') || nearestTileOfType('forest_floor') || nearestTileOfType('meadow');
  if (rich) Game.travelTo(rich.x, rich.y);
  let guard = 0;
  while ((s().dayTicks || 0) < 300 && guard++ < 30 && !Game.over) {
    try { Game.doAction('forage'); } catch (e) { break; }
    if ((s().inventory || []).length > 40) break; // pack full-ish, stop
  }
  if ((s().dayTicks || 0) < 300) { try { Game.doAction('rest'); } catch (e) {} }
  return rich;
}
function freshTileOfType(type, exclude) {
  let best = null, bd = 99;
  for (const t of Game.travelTargets()) {
    const tile = Game.tileAt(t.x, t.y);
    if (tile.type !== type) continue;
    if (exclude && t.x === exclude.x && t.y === exclude.y) continue;
    if (t.d < bd) { bd = t.d; best = t; }
  }
  return best;
}
// A wanderer walked into camp mid-sleep. The sim is a survivalist, not a
// hunter — but there's no field-flee mechanic (design gap, noted for Steve),
// so it fights the minimal honest brawl: strike what's adjacent, end turn.
function fightNightEncounter() {
  if (!Game.pendingEncounter || Game.tbfight) return false;
  note('night encounter: a wanderer walked into camp — fighting it off (no field flee exists)');
  try { Game.startCombat(); } catch (e) { note('startCombat threw: ' + e.message); return false; }
  let guard = 0;
  while (Game.tbfight && guard++ < 60 && !Game.over) {
    try {
      if (Game.tbIsPlayerTurn()) {
        const p = Game.tbFighter('p');
        const foe = (Game.tbfight.fighters || []).find(f => (f.kind === 'monster' || f.kind === 'hostile') && f.alive);
        if (!foe || !p || !p.alive) break;
        const d = Math.max(Math.abs(foe.mx - p.mx), Math.abs(foe.my - p.my));
        if (d <= 1) Game.tbPlayerStrike(foe.key);
        if (Game.tbfight && Game.tbIsPlayerTurn()) Game.tbPlayerEndTurn();
      } else if (Game.tbAdvance) Game.tbAdvance();
    } catch (e) { break; }
  }
  const clear = !Game.pendingEncounter && !Game.tbfight;
  note(clear ? `night encounter resolved (hp now ${Math.round(s().health)})` : 'could not clear the encounter');
  return clear;
}
// sleep via the REAL path; retry if an encounter/fight wakes us.
function sleepNight(label) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const d0 = s().day;
    Game.sleep();
    if (s().day > d0) { if (attempt > 1) note(`${label}: sleep interrupted, succeeded on attempt ${attempt}`); return true; }
    if (Game.over) { note(`${label}: DIED during the night — ${(Game.log[Game.log.length - 1] || '').slice(0, 100)}`); return false; }
    if (Game.pendingEncounter && !Game.tbfight) {
      if (fightNightEncounter()) continue; // fought it off — try sleeping again
      note(`${label}: SLEEP STUCK on an encounter the sim cannot resolve`);
      return false;
    }
    note(`${label}: sleep attempt ${attempt} did not advance the day (woke: fight=${!!Game.tbfight} encounter=${!!Game.pendingEncounter})`);
  }
  const tail = Game.log.slice(-3).join(' / ');
  note(`${label}: SLEEP STUCK — over=${!!Game.over} fight=${!!Game.tbfight} encounter=${!!Game.pendingEncounter} tail="${tail.slice(0, 160)}"`);
  return false;
}
function adjClearCell() {
  // find clear ground within 2 of the player, step next to it, return it.
  // (makeFire needs the cell within 1 AND good ground.)
  const d = Game.genDetail(Game.map.px, Game.map.py);
  const px = s().mx ?? 4, py = s().my ?? 4;
  const clear = (cx, cy) => ['dirt', 'grass', 'clearing', 'path'].includes(d[cy] && d[cy][cx]);
  for (let r = 1; r <= 2; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const cx = px + dx, cy = py + dy;
      if (cx < 0 || cx > 8 || cy < 0 || cy > 8) continue;
      if (!clear(cx, cy)) continue;
      // step to an adjacent clear cell
      for (let sy = -1; sy <= 1; sy++) for (let sx = -1; sx <= 1; sx++) {
        if (!sx && !sy) continue;
        const nx = cx + sx, ny = cy + sy;
        if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
        if (clear(nx, ny)) { s().mx = nx; s().my = ny; return { cx, cy }; }
      }
    }
  }
  return null;
}
function findCell(type) {
  const d = Game.genDetail(Game.map.px, Game.map.py);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++)
    if (d[y] && d[y][x] === type) return { cx: x, cy: y };
  return null;
}
function stepNextTo(cell, needClear) {
  // walk up to an adjacent cell, player-honest.
  // needClear: for pitching fires/tents the player must stand on clear ground;
  // gatherFallen only needs adjacency.
  const d = Game.genDetail(Game.map.px, Game.map.py);
  const clear = (cx, cy) => ['dirt', 'grass', 'clearing', 'path'].includes(d[cy] && d[cy][cx]);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const cx = cell.cx + dx, cy = cell.cy + dy;
    if (cx < 0 || cx > 8 || cy < 0 || cy > 8) continue;
    if (needClear && !clear(cx, cy)) continue;
    s().mx = cx; s().my = cy; return true;
  }
  return false;
}
const cleanBottles = () => (s().water || []).filter(b => b.quality === 'clean').length;
const riskyBottles = () => (s().water || []).filter(b => b.quality === 'risky').length;

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const me = (Game.data.villagers || []).find(x => x.id === Game.villagerId) || {};
  console.log('PLAYER:', Game.displayName(Game.villagerId), '| occupation:', me.formerOccupation || '(none)', '| waterWise:', Game.waterSafetyKnown());

  // ============ BEAT 1: THE CREEK RUN ============
  beat('BEAT 1 — creek water run');
  // try creeks nearest-first; a blocked crossing just means "not this creek"
  const creeks = Game.travelTargets()
    .filter(t => Game.tileAt(t.x, t.y).type === 'creek')
    .sort((a, b) => a.d - b.d);
  let creekOk = false;
  for (const c of creeks) {
    if (tryTravel(c)) { creekOk = true; break; }
    note(`creek at ${c.x},${c.y} unreachable (${(Game.log[Game.log.length - 1] || '').slice(0, 80)})`);
  }
  if (!creekOk) {
    skip('no reachable creek this map — water beats skipped');
  } else {
    const wc = findCell('water');
    if (wc && stepNextTo(wc)) {
      const lmW = Game.log.length;
      Game.cellInteract(wc.cx, wc.cy);
      // short capture: examine + the drink that follows are 1-2 lines,
      // safely under the 40-line log cap.
      const said = Game.log.slice(lmW).join(' ');
      console.log('  water examine says:', JSON.stringify(said.slice(0, 160)));
      if (Game.waterSafetyKnown()) ok(/Safe|Poison/i.test(said), 'water-wise character reads safety');
      // ignorant + unsafe water -> "can't tell"; ignorant + safe water ->
      // "drink and hope". Both are the honest knowledge-gated behavior.
      else ok(/can't tell if it's safe|drink and hope/i.test(said), 'ignorant character gets the honest blind message');
    } else note('no reachable water cell in creek detail grid');
    Game.fillWater(); Game.fillWater(); Game.fillWater();
    ok(riskyBottles() === 3, `filled 3L risky at creek (got ${riskyBottles()})`);
    const rsrc = (s().water || []).filter(b => b.quality === 'risky')[0];
    ok(rsrc && /unknown/i.test(rsrc.source || ''), `creek source marked unknown ("${rsrc && rsrc.source}")`);
  }

  // ============ BEAT 2: BOIL + COOK AT HAVEN ============
  beat('BEAT 2 — boil and cook at haven');
  navigateHome();
  ok(Game.playerTile().type === 'haven', 'hauled back to haven');
  if (!Game.nearFire()) {
    note('no fire at haven — gathering branches to make one');
    const grove = nearestTileOfType('grove') || nearestTileOfType('forest_floor');
    if (grove && travelToTile(grove, 'grove')) {
      for (let i = 0; i < 8 && Game.materialCount('branch') < 2; i++) Game.doAction('forage');
      navigateHome();
    }
    const spot = adjClearCell();
    if (spot && Game.materialCount('branch') >= 2) Game.makeFire(spot.cx, spot.cy);
    else if (spot) Game.gatherFallen && null;
  }
  ok(Game.nearFire(), 'fire available at haven for boiling/cooking');
  if (riskyBottles() > 0) {
    const kcal0 = Math.round(s().kcal);
    const r0 = riskyBottles();
    Game.boilWater();
    ok(riskyBottles() === 0 && cleanBottles() >= r0, `boil converted risky water (${r0} -> 0 risky)`);
    ok(Math.round(s().kcal) === kcal0 - 30, `boiling costs 30 kcal (${kcal0} -> ${Math.round(s().kcal)})`);
  } else skip('no risky water to boil (no creek this map)');
  // cook: seeded raw beans, 5 units -> clean water total (bottles first, then
  // well). camp_cook ability discounts the water cost — read it, don't assume.
  s().inventory.push({ name: 'Raw beans', kcalEach: 0, units: 5, kg: 0.1, unit: 'handful', rawKcal: 300, cookedKcal: 600, needsCooking: true, safe: false, spoilDay: 30 });
  const cookLvl = Game.abilityLevel('camp_cook');
  const wMult = cookLvl >= 2 ? 0 : cookLvl >= 1 ? 0.5 : 1;
  const expWater = Math.ceil(5 * wMult);
  const well0 = Math.floor((v().water || {}).clean || 0), bot0 = cleanBottles();
  Game.cookAll();
  const well1 = Math.floor((v().water || {}).clean || 0), bot1 = cleanBottles();
  const waterSpent = (well0 - well1) + (bot0 - bot1);
  ok(waterSpent === expWater, `cooking 5 beans spends ${expWater}L clean water total (camp_cook L${cookLvl}; got ${waterSpent}L: well ${well0}->${well1}, bottles ${bot0}->${bot1})`);
  const beans = s().inventory.find(i => /bean/i.test(i.name || ''));
  ok(beans && !beans.needsCooking && !beans.rawKcal, 'beans cooked: needsCooking cleared, rawKcal cleared');

  // ============ BEAT 3: SLEEP AT HAVEN (hall) ============
  beat('BEAT 3 — sleep at haven');
  const dayTile = spendDay();
  ok(navigateHome(), 'back at haven for the night');
  s().health = 70; s().kcal = 2600; s().hydration = 100;
  const d0 = s().day, hp0 = Math.round(s().health);
  const q = Game.sleepQuality();
  const expHeal = Game.sleepPreview().heal;
  console.log(`  sleep quality at haven: ${q} (preview heal +${expHeal})`);
  // haven is sheltered ground: hall, bunk, or a nearby tent all count.
  // The invariant under test: actual healing matches the STATED quality.
  ok(['hall', 'bunk', 'tent'].includes(q), `haven sleep quality is sheltered (got ${q})`);
  const slept = sleepNight('haven');
  ok(slept && s().day === d0 + 1, `sleep advanced the day (${d0} -> ${s().day})`);
  if (slept) {
    ok(Math.round(s().health) === Math.min(Game.maxHealth(), hp0 + expHeal), `sleep heals the stated +${expHeal} (${hp0} -> ${Math.round(s().health)})`);
    ok(Math.round(s().energy) === 100, 'energy restored to 100');
  }

  // ============ BEAT 4: FIELD FIRE + COLD SNAP ============
  // ORDER MATTERS: fires burn real fuel — make and feed the fire LAST, right
  // before sleep, the way a player would. (An earlier draft made the fire,
  // then foraged for 300 ticks and watched it die: correct game, wrong sim.)
  beat('BEAT 4 — field fire on a cold night');
  // FRESH tile: BEAT 3's spendDay worked (depleted) dayTile for 3 days.
  const field = freshTileOfType('grove', dayTile) || freshTileOfType('forest_floor', dayTile) || freshTileOfType('meadow', dayTile)
    || nearestTileOfType('grove') || nearestTileOfType('forest_floor') || nearestTileOfType('meadow');
  if (field && travelToTile(field, Game.tileAt(field.x, field.y).type)) {
    spendDay(); // play the day first — the fire comes at dusk
    // fuel: forage deadfall — wood cells (species-less trees) are rare
    // (~1/tile), so scan a few tiles for one and sweep it directly.
    // Two-phase: FIND first (no wandering), then travel ONCE.
    let foragedBranches = 0, woodSpot = null;
    const SF = globalThis.Scattering.forage;
    for (const t of Game.travelTargets()) {
      if (woodSpot) break;
      const tile = Game.tileAt(t.x, t.y);
      if (SF && !SF.canForage(tile)) continue; // depleted — no deadfall to find
      const dd = Game.genDetail(t.x, t.y);
      const regrow = tile.detailRegrow || {};
      for (let y = 0; y < 9 && !woodSpot; y++) for (let x = 0; x < 9; x++) {
        const c = dd[y] && dd[y][x];
        if (regrow[x + ',' + y]) continue; // picked clean, regrowing
        if ((c === 'tree' || c === 'bigtree') && !Game.cellPlantSpecies(tile, x, y, c)) {
          woodSpot = { tx: t.x, ty: t.y, cx: x, cy: y };
          break;
        }
      }
    }
    const wtOk = woodSpot ? tryTravel({ x: woodSpot.tx, y: woodSpot.ty }) : false;
    const stOk = wtOk ? stepNextTo(woodSpot) : false;
    if (woodSpot && !wtOk) note(`deadfall dbg: travel to ${woodSpot.tx},${woodSpot.ty} failed`);
    if (woodSpot && wtOk && !stOk) note(`deadfall dbg: stepNextTo failed at ${woodSpot.cx},${woodSpot.cy}`);
    if (woodSpot && wtOk && stOk) {
      const b0 = Game.materialCount('branch');
      const lmDbg = Game.log.length;
      Game.doAction('forage', { cx: woodSpot.cx, cy: woodSpot.cy });
      foragedBranches = Game.materialCount('branch') - b0;
      if (foragedBranches <= 0) note(`deadfall dbg: spot=${woodSpot.tx},${woodSpot.ty}@${woodSpot.cx},${woodSpot.cy} canForage=${globalThis.Scattering.forage.canForage(Game.tileAt(woodSpot.tx, woodSpot.ty))} log="${Game.log.slice(lmDbg).join(' ').slice(0, 160)}"`);
      ok(foragedBranches > 0, `foraging deadfall at a species-less tree yields branches (${foragedBranches})`);
    } else skip('no species-less tree cell in range — deadfall forage path untestable this map');
    // the deliberate toolless path: gatherFallen (always available)
    const treeCell = findCell('tree') || findCell('bigtree') || findCell('bush') || findCell('thicket');
    if (treeCell && stepNextTo(treeCell, false)) {
      const b0 = Game.materialCount('branch');
      for (let i = 0; i < 6 && Game.materialCount('branch') < 10; i++) Game.gatherFallen(treeCell.cx, treeCell.cy);
      ok(Game.materialCount('branch') > b0, `gatherFallen yields branches without tools (${b0} -> ${Game.materialCount('branch')})`);
    } else note('no reachable tree cell for gatherFallen');
    const spot = adjClearCell();
    ok(!!spot, 'clear ground adjacent for a fire');
    if (spot && Game.materialCount('branch') >= 2) {
      // friction fire is a practice curve (40% base for the unknowing) —
      // a player keeps trying; so does the sim. If the lottery wins all
      // 8, that's the game's honesty, not a sim failure — skip the beat.
      let lit = false, fireMsg = '';
      for (let i = 0; i < 8 && !lit; i++) {
        Game.makeFire(spot.cx, spot.cy);
        fireMsg = Game.log[Game.log.length - 1] || '';
        lit = Game.nearFire();
      }
      console.log('  makeFire says:', JSON.stringify(fireMsg.slice(0, 120)));
      if (!lit) {
        skip('the friction lottery won all 8 attempts — no field fire tonight (honest failure, not a bug)');
      } else {
      ok(true, 'field fire lit (friction lottery, retries allowed)');
      let feeds = 0;
      for (let i = 0; i < 10 && Game.materialCount('branch') >= 1; i++) {
        if (Game.fireLastsTillDawn()) break;
        Game.feedFire(spot.cx, spot.cy); feeds++;
      }
      ok(Game.fireLastsTillDawn(), `fire fed to last till dawn (${feeds} feeds)`);
      Game.state.weather = 'cold'; // scenario: cold snap
      s().health = 70; s().kcal = 2600; s().hydration = 100;
      const qf = Game.sleepQuality();
      const expF = Game.sleepPreview().heal;
      console.log(`  sleep quality by field fire: ${qf} (preview heal +${expF})`);
      ok(qf === 'fireside', `fireside quality by your own fire (got ${qf})`);
      const dF = s().day, hpF0 = Math.round(s().health);
      const sleptF = sleepNight('fireside cold');
      ok(sleptF && s().day === dF + 1, 'slept through the cold night by the fire');
      if (sleptF) ok(Math.round(s().health) === Math.min(Game.maxHealth(), hpF0 + expF), `fireside sleep heals the stated +${expF} even in cold (${hpF0} -> ${Math.round(s().health)})`);
      }
    }
  }

  // ============ BEAT 5: TENT TIER ============
  beat('BEAT 5 — tent shelter');
  let tentTile = null, tentCell = null;
  for (const t of Game.travelTargets()) {
    const d = Game.genDetail(t.x, t.y);
    let found = null;
    for (let y = 0; y < 9 && !found; y++) for (let x = 0; x < 9; x++)
      if (d[y] && d[y][x] === 'tent') { found = { cx: x, cy: y }; break; }
    if (found) { tentTile = t; tentCell = found; break; }
  }
  if (tentTile && travelToTile(tentTile, 'tent tile') && stepNextTo(tentCell)) {
    const lm = Game.log.length;
    Game.cellInteract(tentCell.cx, tentCell.cy);
    const said = Game.log.slice(lm).join(' ');
    console.log('  tent examine says:', JSON.stringify(said.slice(0, 120)));
    const packed = (s().inventory || []).find(i => i.kind === 'tent');
    if (packed) {
      ok(true, 'packed up a found tent');
      const camp = nearestTileOfType('meadow') || nearestTileOfType('forest_floor');
      if (camp && travelToTile(camp, 'camp tile')) {
        const spot = adjClearCell();
        if (spot) {
          Game.pitchTent(spot.cx, spot.cy);
          const qt = Game.sleepQuality();
          console.log('  sleep quality in pitched tent:', qt);
          ok(qt === 'tent', `tent quality after pitching (got ${qt})`);
          spendDay();
          Game.state.weather = 'cold';
          s().health = 60; s().kcal = 2600; s().hydration = 100;
          const hpT0 = Math.round(s().health), dT = s().day;
          const sleptT = sleepNight('tent cold');
          ok(sleptT && s().day === dT + 1, 'slept through cold night in tent');
          if (sleptT) ok(Math.round(s().health) === Math.min(Game.maxHealth(), hpT0 + 25), `tent sleep heals +25 in cold (${hpT0} -> ${Math.round(s().health)})`);
          Game.packTent(spot.cx, spot.cy);
          const repacked = (s().inventory || []).find(i => i.kind === 'tent' && (i.units || 0) > 0);
          ok(!!repacked, 'tent packed back up into inventory');
        } else note('no clear ground to pitch the tent');
      }
    } else note('found tent was not packable — ' + said.slice(0, 80));
  } else skip('no reachable tent cell in travel range — tents are find-only');

  // ============ BEAT 6: EXPOSURE ============
  beat('BEAT 6 — exposure (cold ground, no fire)');
  // try candidate bare tiles nearest-first; blockages just mean "not this one"
  const bareCands = Game.travelTargets()
    .filter(t => ['meadow', 'forest_floor'].includes(Game.tileAt(t.x, t.y).type))
    .sort((a, b) => a.d - b.d);
  let bareOk = false;
  for (const c of bareCands) { if (tryTravel(c)) { bareOk = true; break; } }
  ok(bareOk, 'reached a bare tile');
  if (bareOk) {
    spendDay();
    Game.state.weather = 'cold';
    const qg = Game.sleepQuality();
    console.log('  sleep quality on bare ground:', qg);
    ok(qg === 'ground', `ground quality with no shelter/fire (got ${qg})`);
    s().health = 70; s().kcal = 2600; s().hydration = 100; // fed — isolate exposure from the spiral
    const hpG0 = Math.round(s().health), dG = s().day;
    const sleptG = sleepNight('exposed cold');
    ok(sleptG && s().day === dG + 1, 'survived the exposed night');
    if (sleptG) {
      ok(Math.round(s().health) === Math.max(1, hpG0 - 18), `cold exposure: -18 health, no healing (${hpG0} -> ${Math.round(s().health)})`);
      ok(Math.round(s().energy) === 60, `exposure leaves energy at 60 (got ${Math.round(s().energy)})`);
    }
  }

  // ============ BEAT 7: METABOLIC CRISIS ============
  beat('BEAT 7 — metabolic crisis (sleep on empty)');
  navigateHome();
  spendDay();
  const homeOk = navigateHome();
  ok(homeOk, 'back at haven for the crisis night');
  Game.state.weather = 'clear';
  s().hydration = 0; s().kcal = 0; s().health = 70;
  const warn = Game.sleepPreview().warn || '';
  console.log('  sleepPreview warn:', JSON.stringify(warn.slice(0, 120)));
  ok(/Running on empty/i.test(warn), 'sleep preview warns about running on empty');
  // location-agnostic: crisis halves WHATEVER the shelter tier heals.
  const halfHeal = Math.floor(Game.sleepPreview().heal / 2);
  const hpC0 = Math.round(s().health), dC = s().day;
  const sleptC = sleepNight('crisis');
  // the dawn message is the LAST log line (the log caps at 40 — never slice
  // from a stale index across a whole night of ticks).
  const dawnMsg = Game.log[Game.log.length - 1] || '';
  ok(sleptC && s().day === dC + 1, 'slept through the crisis night');
  if (sleptC) {
    // the spiral (endDay: starving + dehydrated) already took its cut, then
    // sleep heals HALF. Net: no recovery — the honest consequence.
    ok(new RegExp(`\\+${halfHeal} health, wrung-out morning`, 'i').test(dawnMsg), `crisis sleep applies HALVED heal (+${halfHeal}) — "${dawnMsg.slice(0, 60)}"`);
    ok(Math.round(s().health) < hpC0, `crisis night: the spiral wins, no net recovery (${hpC0} -> ${Math.round(s().health)})`);
    ok(Math.round(s().energy) === 60, `crisis morning is wrung out (energy 60, got ${Math.round(s().energy)})`);
  }

  // ============ BEAT 8: REST ECONOMICS ============
  beat('BEAT 8 — rest action');
  s().energy = 40; s().kcal = 500;
  const e0 = Math.round(s().energy), k0 = Math.round(s().kcal), t0 = s().dayTicks;
  Game.doAction('rest');
  ok(Math.round(s().energy) === Math.min(100, e0 + 30), `rest restores +30 energy (${e0} -> ${Math.round(s().energy)})`);
  ok(Math.round(s().kcal) === k0 - 40, `rest costs 40 kcal (${k0} -> ${Math.round(s().kcal)})`);
  ok(s().dayTicks - t0 === 96, `rest costs 96 ticks (${t0} -> ${s().dayTicks})`);

  console.log('\n' + '='.repeat(64));
  console.log(`RESULT: ${failures.length ? 'FAILURES (' + failures.length + ')' : 'ALL PASS'}${skips.length ? `, ${skips.length} skipped` : ''}`);
  for (const f of failures) console.log('  FAIL: ' + f);
  if (skips.length) { console.log('SKIPS:'); for (const n of skips) console.log('  - ' + n); }
  if (notes.length) { console.log('NOTES:'); for (const n of notes) console.log('  - ' + n); }
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error('PLAYTEST ERROR:', e.message, e.stack ? e.stack.split('\n')[1] : ''); process.exit(1); });
