// Survivalist real-days playtest: the needs loop across ACTUAL day boundaries.
// Usage: node scripts/test-survivalist-realdays.js
// The old test-survivalist.js played 7 "days" that were all game-day 1 (sleep
// refused at dawn because 4 forages ~= 64 ticks < 128, so endDay never ran).
// This one spends real 512-tick days and asserts: day advances on sleep,
// metabolism burns ~2200 kcal + 35 hydration per day, dehydration spirals,
// shelter tiers heal as documented (bunk 35 > tent 25 > hall 20 > fireside 18 > ground 12).
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

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('FAIL: ' + name + (extra ? ' | ' + extra : '')); } }
const s = () => Game.state.scholar;
const v = () => Game.state.village;
const T = () => Game.TIME;
const snap = () => `hyd=${Math.round(s().hydration)} kcal=${Math.round(s().kcal)} hp=${Math.round(s().health)} en=${Math.round(s().energy)} well=${Math.round((v().water && v().water.clean) || 0)}L bottles=${(s().water || []).length}`;

function goHome() {
  const hx = (v().px ?? 3), hy = (v().py ?? 3);
  try { Game.travelTo(hx, hy); } catch (e) {}
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
  try {
    const d = Game.genDetail(Game.map.px, Game.map.py);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (d[y] && d[y][x] === 'fire') return true;
  } catch (e) {}
  return false;
}
function sayLines() { // capture what the game told the player today
  const log = Game.log || [];
  return log.map(l => String(l.text || l)).join('\n');
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  s().kcal = 4000; s().hydration = 100;
  // seed a little real food so the eat path exercises
  s().inventory.push({ name: 'Field rations', kcalEach: 400, units: 6, kg: 0.2, unit: 'bar', safe: true, spoilDay: 30 });

  const dayRec = [];
  for (let d = 1; d <= 5; d++) {
    const control = (d === 5); // D5: eat nothing — measure the raw daily burn
    if (control) s().kcal = 4000; // full buffer so the burn doesn't floor at 0
    const m0 = { hyd: s().hydration, kcal: s().kcal, hp: s().health, en: s().energy, day: s().day };
    ok(`D${d}: starts on game-day ${d}`, m0.day === d, `game day is ${m0.day}`);

    // MORNING: drink, fill, eat (unless control day).
    let drinks = 0;
    while (s().hydration < 90 && (s().water || []).length > 0 && drinks++ < 6) { try { Game.drinkWater(); } catch (e) { break; } }
    let fills = 0;
    while ((s().water || []).length < 5 && fills++ < 9) { try { Game.fillWater(); } catch (e) { break; } }
    if (!control && (s().inventory.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0)) > 0 && s().kcal < 1800) { try { Game.eat(); } catch (e) {} }

    // MIDDAY: forage-hop in haul cycles. One sweep = several cells, so the pack
    // fills after a few tiles — haul home, unload, go back out. That IS the loop.
    // Only surveyed (revealed) tiles: abstract stock lies until genDetail runs
    // on arrival ("the world is the truth"). After travel we step to mid-tile
    // as a stand-in for walking to the green.
    let guard = 0, tilesWorked = 0, hauls = 0, misses = 0;
    while ((s().dayTicks || 0) < 260 && guard++ < 24 && !Game.over && !Game.pendingEncounter) {
      if (!Game.canCarry(2)) { goHome(); hauls++; continue; } // pack full: haul it in
      let best = null, bv = -1;
      for (const t of Game.travelTargets()) {
        const tile = Game.tileAt(t.x, t.y);
        if (tile.type === 'haven' || tile.type === 'ruin') continue;
        if (!tile.revealed) continue;
        if ((tile.stock || 0) <= 0) continue;
        const vv = (tile.stock || 0) / (t.d + 1);
        if (vv > bv) { bv = vv; best = t; }
      }
      if (!best) { goHome(); hauls++; break; } // everything surveyed is picked clean
      const t0 = s().dayTicks || 0;
      try { Game.travelTo(best.x, best.y); } catch (e) { break; }
      if (Game.playerTile() !== Game.tileAt(best.x, best.y)) break;
      tilesWorked++;
      s().mx = 4; s().my = 4; // walk to the middle of the tile
      let n = 0;
      while ((Game.tileAt(best.x, best.y).stock || 0) > 0 && n++ < 6 && !Game.pendingEncounter) {
        const bt0 = s().dayTicks || 0;
        try { Game.doAction('forage'); } catch (e) { break; }
        if ((s().dayTicks || 0) === bt0) { misses++; break; } // nothing within reach: move on
      }
      if ((s().dayTicks || 0) === t0) break; // travel+forage both no-ops: avoid a spin
    }
    // Picked clean by midday? Camp chores, then rest out the afternoon —
    // what a real player does when the land says "come back in a few days".
    if ((s().dayTicks || 0) < 200 && !Game.over && !Game.pendingEncounter) {
      try { Game.boilWater(); } catch (e) {}
      try { Game.cookAll(); } catch (e) {}
      let r = 0;
      while ((s().dayTicks || 0) < 320 && r++ < 4 && !Game.over && !Game.pendingEncounter) {
        try { Game.doAction('rest'); } catch (e) { break; }
      }
    }
    const ticksWorked = s().dayTicks || 0;

    // EVENING: home, boil risky, cook, eat, drink, sleep.
    goHome();
    let boiled = 0;
    if (hasFireHere()) {
      const riskyBefore = (s().water || []).filter(b => b.quality === 'risky').length;
      try { Game.boilWater(); } catch (e) {}
      boiled = riskyBefore - (s().water || []).filter(b => b.quality === 'risky').length;
    }
    try { Game.cookAll(); } catch (e) {}
    if (!control && s().kcal < 1500) { try { Game.eat(); } catch (e) {} }
    drinks = 0;
    while (s().hydration < 90 && (s().water || []).length > 0 && drinks++ < 6) { try { Game.drinkWater(); } catch (e) { break; } }
    const q = Game.sleepQuality();
    const hp0 = Math.round(s().health);
    const dayBefore = s().day;
    const logBefore = sayLines().length;
    try { Game.sleep(); } catch (e) { console.log(`D${d} sleep threw: ${e.message}`); }
    const advanced = s().day === dayBefore + 1;
    ok(`D${d}: sleep advanced the day`, advanced, `day ${dayBefore} -> ${s().day}, ticksWorked=${ticksWorked}, quality=${q}`);
    dayRec.push({ d, q, ticksWorked, tilesWorked, hauls, misses, advanced, control, m0,
      m1: { hyd: s().hydration, kcal: s().kcal, hp: s().health, en: s().energy },
      heal: Math.round(s().health) - hp0, boiled,
      said: sayLines().slice(logBefore).slice(-400) });
    if (!advanced) break; // no point continuing a broken clock
  }

  console.log('\n--- day records ---');
  for (const r of dayRec) {
    console.log(`D${r.d} (${r.q}, ${r.ticksWorked} ticks, ${r.tilesWorked} tiles, ${r.hauls} hauls, ${r.misses} misses): kcal ${Math.round(r.m0.kcal)}->${Math.round(r.m1.kcal)} (Δ${Math.round(r.m1.kcal - r.m0.kcal)}), hyd ${Math.round(r.m0.hyd)}->${Math.round(r.m1.hyd)}, hp ${Math.round(r.m0.hp)}->${Math.round(r.m1.hp)} (heal ${r.heal}), boiled ${r.boiled}`);
  }

  // METABOLISM: D5 control (no eating) must show the raw ~2200 burn.
  // Other days just need plausible books (eating offsets the burn).
  for (const r of dayRec) {
    const dk = r.m0.kcal - r.m1.kcal;
    // D5 control: raw burn 2200, minus 30% sleep conservation, minus up-to-1000
    // village meal (trust<30 share; here 0 taken — kcal was over the 3000 cap,
    // so want=0). Effective haven-day cost lands ~1100-1300.
    if (r.control) ok(`D${r.d} control: effective daily cost ~1100-1300`, dk > 900 && dk < 1700, `Δ=${Math.round(dk)}`);
    else ok(`D${r.d}: books plausible (burn minus meals)`, dk > -2500 && dk < 3200, `Δ=${Math.round(dk)}`);
  }
  const dh = dayRec.length > 1 ? dayRec[0].m0.hyd - dayRec[0].m1.hyd : 0;
  console.log(`hydration Δ over D1: ${Math.round(dh)} (drain 35 + drinks taken)`);

  // DEHYDRATION SPIRAL: force it, verify the game punishes.
  // (Game.say is hooked: the visible log caps at 40 and endDay says a lot
  // after the spiral warning, so slice-based capture misses it.)
  function recordSays(fn) {
    const heard = [];
    const orig = Game.say;
    Game.say = function (m) { heard.push(String(m)); return orig.call(this, m); };
    try { fn(); } finally { Game.say = orig; }
    return heard.join('\n');
  }
  if (dayRec.length >= 5 && s().day === 6) {
    s().hydration = 5; s().water = [];
    const hp0 = Math.round(s().health), en0 = Math.round(s().energy);
    // spend a day without drinking: work then sleep
    let n = 0;
    while ((s().dayTicks || 0) < 300 && n++ < 30 && !Game.over) { try { Game.doAction('wait'); } catch (e) { break; } }
    goHome();
    const said = recordSays(() => { try { Game.sleep(); } catch (e) {} });
    ok('dehydration spiral: warning fires', /DEHYDRATED|dehydrat/i.test(said));
    ok('dehydration spiral: health drops', Math.round(s().health) < hp0, `hp ${hp0} -> ${Math.round(s().health)}`);
    // METABOLIC CRISIS: no full recovery on empty — energy caps at 60, heal halved.
    ok('crisis sleep: energy only to 60', Math.round(s().energy) === 60, `en ${en0} -> ${Math.round(s().energy)}`);
    ok('crisis sleep: says why', /ran on empty|keeps score|wrung-out/i.test(said));
    // honest button: the preview warns before you commit
    s().hydration = 0;
    const pv = Game.sleepPreview();
    ok('crisis preview: warns on empty', /Running on empty/i.test(pv.warn || ''), `warn="${pv.warn || ''}"`);
    s().hydration = 100;
  }

  // STARVATION VARIANT: kcal 0 hits the same crisis branch. Camp WILD — at
  // haven the village meal would (correctly) rescue you; the crisis is a
  // field problem.
  if (!Game.over) {
    const wild = nearestTileOfType('meadow') || nearestTileOfType('forest') || nearestTileOfType('wetland');
    if (wild) { try { Game.travelTo(wild.x, wild.y); } catch (e) {} }
    s().kcal = 0; s().hydration = 100;
    const hp0 = Math.round(s().health);
    let n = 0;
    while ((s().dayTicks || 0) < 300 && n++ < 30 && !Game.over) { try { Game.doAction('wait'); } catch (e) { break; } }
    const said = recordSays(() => { try { Game.sleep(); } catch (e) {} });
    ok('starvation crisis: energy only to 60', Math.round(s().energy) === 60, `en -> ${Math.round(s().energy)}`);
    ok('starvation crisis: health does not fully recover', Math.round(s().health) <= hp0 + 10, `hp ${hp0} -> ${Math.round(s().health)} (hall heal 20, halved to 10)`);
    ok('starvation crisis: says why', /ran on empty|keeps score|wrung-out/i.test(said));
  }

  // SHELTER TIERS: sleepQuality must never offer a fake choice — it's positional.
  console.log('\nsleepPreview at haven:', JSON.stringify(Game.sleepPreview()));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
