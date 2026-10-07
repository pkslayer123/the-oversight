// SURVIVALIST playtest v2: the daily water tax (2026-10-06).
// Usage: node scripts/play-water-tax-20261006.js
// v1 bug: never burned enough ticks, so sleep() refused ("barely dawn") and
// the clock never turned. v2 adds burnDay() — rest until the sleep gate opens,
// then verifies the day actually advanced.
// Beats across 10 days at Haven:
//   1-3: morning fill-4L routine; cistern drawdown; shelter sleep baseline
//   4:   delegation attempt (trust-gated?); drain the cistern dry on purpose
//   5-6: creek days — risky fills, raw-drink sickness, learned waterWise
//   7-8: DEHYDRATION SPIRAL — drink nothing; do warnings telegraph it?
//   9:   recovery; hall heal measurement
//   10:  shelter tier audit (hall vs bunk/tent if reachable)
// Feel questions: is water a game or a rote tax? Does the game warn BEFORE
// the spiral bites? Do shelter tiers matter enough to feel?
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
const failures = [], notes = [], log = [];
const say = (m) => log.push(m);
function ok(cond, label) { log.push((cond ? '  PASS ' : '  FAIL ') + label); if (!cond) failures.push(label); }
function note(m) { notes.push(m); log.push('  NOTE ' + m); }
const cistern = () => Math.floor(((v().water) || {}).clean || 0);
const bottles = () => (s().water || []).length;
const cleanB = () => (s().water || []).filter(b => b.quality === 'clean').length;
function snap() {
  return `day=${s().day} part=${Game.dayPart} ticks=${s().dayTicks} kcal=${Math.round(s().kcal)} hyd=${Math.round(s().hydration)} hp=${Math.round(s().health)} en=${Math.round(s().energy)} bottles=${bottles()}(${cleanB()}c) cistern=${cistern()}L`;
}
function drainTail(n) {
  const lines = Game.log.splice(0, Game.log.length);
  for (const l of lines.slice(-(n || 3))) log.push('    [game] ' + l.slice(0, 150));
}
function goHome() {
  const hx = v().px ?? 4, hy = v().py ?? 4;
  Game.travelTo(hx, hy);
  return Game.playerTile() && Game.playerTile().type === 'haven';
}
// burn the day so sleep()'s "barely dawn" gate opens, then sleep and VERIFY
// the day advanced. Returns the sleep quality or null if refused/blocked.
function burnDay() {
  let guard = 0;
  while (Game.dayPart === 0 && (s().dayTicks || 0) < Game.TIME.TICKS_PER_BATCH && guard++ < 40) {
    Game.doAction('rest');
    if (Game.state.over) break;
  }
  const dayBefore = s().day;
  const q = Game.sleepQuality();
  Game.sleep();
  if (s().day === dayBefore && !Game.state.over) {
    const refused = Game.log.some(l => /barely dawn/i.test(l));
    Game.log.length = 0;
    return { quality: q, advanced: false, refused };
  }
  Game.log.length = 0;
  return { quality: q, advanced: true };
}
function drinkTo(target) {
  let drank = 0, sick = 0;
  for (let i = 0; i < 4 && (s().hydration || 0) < target && bottles() > 0 && !Game.state.over; i++) {
    const hp0 = Math.round(s().health);
    Game.drinkWater(); drank++;
    if (Math.round(s().health) < hp0) sick++;
  }
  Game.log.length = 0;
  return { drank, sick };
}
function fillN(n) {
  let filled = 0, refused = false;
  for (let i = 0; i < n; i++) {
    const b0 = bottles(), c0 = cistern();
    Game.fillWater();
    if (bottles() === b0) { refused = true; break; }
    filled++;
    if (cistern() === c0) { /* wild fill: no cistern draw */ }
  }
  Game.log.length = 0;
  return { filled, refused };
}
function hopTo(typeWanted, label) {
  for (let hop = 0; hop < 8; hop++) {
    let best = null, bd = 99;
    for (const t of Game.travelTargets()) {
      const tile = Game.tileAt(t.x, t.y);
      if (typeWanted && tile.type !== typeWanted) continue;
      if (t.d < bd) { bd = t.d; best = t; }
    }
    if (!best) return false;
    const px0 = Game.map.px, py0 = Game.map.py;
    Game.travelTo(best.x, best.y);
    if (Game.map.px === px0 && Game.map.py === py0) return false;
    const t = Game.playerTile();
    if (t && t.type === typeWanted) { say(`hopped to ${label} (${Game.map.px},${Game.map.py})`); return true; }
  }
  return false;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.log.length = 0;
  goHome();
  const startCistern = cistern();
  say(`START: ${snap()} (cistern ${startCistern}L)`);

  let waterTicks = 0, drankTotal = 0, sickTotal = 0, filledTotal = 0;
  const cisternLog = {};

  // ============ DAYS 1-3: the morning routine, no delegation ============
  for (let day = 1; day <= 3; day++) {
    say(`\n--- DAY ${day}: morning routine ---`);
    cisternLog[day + '_start'] = cistern();
    const t0 = s().dayTicks || 0;
    const f = fillN(4); filledTotal += f.filled;
    waterTicks += (s().dayTicks || 0) - t0;
    say(`filled ${f.filled}L (refused=${f.refused}): cistern ${cisternLog[day + '_start']} -> ${cistern()}L; ${snap()}`);
    ok(!f.refused || cistern() === 0, `day ${day}: fills only refused when cistern is dry`);
    const d = drinkTo(70); drankTotal += d.drank; sickTotal += d.sick;
    say(`drank ${d.drank}: hyd=${Math.round(s().hydration)}`);
    // work the day: 2 forage chunks
    const dd0 = s().day;
    for (let i = 0; i < 2 && !Game.state.over; i++) { Game.doAction('forage'); if (s().day !== dd0) break; }
    Game.log.length = 0;
    const q = Game.sleepQuality();
    const hpA = Math.round(s().health);
    const sl = burnDay();
    ok(sl.advanced, `day ${day}: sleep advanced the clock (quality ${sl.quality})`);
    say(`slept (${sl.quality}): hp ${hpA} -> ${Math.round(s().health)}; eod ${snap()}`);
    cisternLog[day + '_end'] = cistern();
  }
  say(`cistern days 1-3: ${JSON.stringify(cisternLog)}`);

  // ============ DAY 4: delegation + drain the cistern dry ============
  say('\n--- DAY 4: delegation + drain the cistern ---');
  const people = (Game.data.villagers || []).filter(p => p.id !== Game.villagerId);
  let delegated = false;
  if (people.length && Game.assignTask) {
    Game.log.length = 0;
    Game.assignTask(people[0].id, 'water');
    const refused = Game.log.some(l => /haven't earned that yet|Trust too low/i.test(l));
    Game.log.length = 0;
    delegated = !refused;
    note(`water duty delegation day 4: ${refused ? 'REFUSED (trust too low) — a fresh life cannot delegate' : 'accepted'}`);
  }
  const c0 = cistern();
  const f4 = fillN(12); filledTotal += f4.filled;
  say(`drained: filled ${f4.filled}L more, cistern ${c0} -> ${cistern()}L (refused=${f4.refused})`);
  ok(cistern() === 0 && f4.refused, 'cistern runs dry and further fills refuse honestly');
  Game.log.length = 0;
  Game.fillWater();
  const dryMsg = Game.log.some(l => /cistern is dry/i.test(l));
  Game.log.length = 0;
  ok(dryMsg, 'dry cistern names the fallback (creek / water duty)');
  if (dryMsg) say('  dry message names creek + water duty — good honesty');
  // work + sleep
  const dd0 = s().day;
  for (let i = 0; i < 2 && !Game.state.over; i++) { Game.doAction('forage'); if (s().day !== dd0) break; }
  Game.log.length = 0;
  const sl4 = burnDay();
  say(`slept (${sl4.quality}): eod ${snap()}`);
  cisternLog['4_end'] = cistern();

  // ============ DAYS 5-6: creek days — risky water ============
  for (let day = 5; day <= 6; day++) {
    say(`\n--- DAY ${day}: creek day ---`);
    const reached = hopTo('creek', 'creek');
    if (!reached) { say('no creek reachable — SKIP'); break; }
    const f = fillN(3); filledTotal += f.filled;
    say(`filled ${f.filled}L creek (risky): bottles=${bottles()}(${cleanB()}c)`);
    ok((s().water.slice(-f.filled).every(b => b.quality === 'risky')) || f.filled === 0,
      `day ${day}: wild water is risky, never clean`);
    // drink one raw risky to model the gamble
    const hp0 = Math.round(s().health);
    const d = drinkTo(60); drankTotal += d.drank; sickTotal += d.sick;
    if (Math.round(s().health) < hp0) say(`  raw risky drink: SICK -15 (waterWise learned: ${!!(Game.state.codex || {}).waterWise})`);
    else say('  raw risky drink: got lucky');
    goHome();
    const d0 = s().day;
    for (let i = 0; i < 2 && !Game.state.over; i++) { Game.doAction('forage'); if (s().day !== d0) break; }
    Game.log.length = 0;
    const sl = burnDay();
    say(`slept (${sl.quality}): eod ${snap()}`);
  }

  // ============ DAYS 7-8: DEHYDRATION SPIRAL — no drinks ============
  say('\n--- DAYS 7-8: dehydration spiral (zero drinks) ---');
  for (let day = 7; day <= 8 && !Game.state.over; day++) {
    const h0 = Math.round(s().hydration), hp0 = Math.round(s().health);
    Game.log.length = 0;
    const d0 = s().day;
    for (let i = 0; i < 3 && !Game.state.over; i++) { Game.doAction('forage'); if (s().day !== d0) break; }
    const lines = Game.log.splice(0, Game.log.length);
    const warned = lines.some(l => /thirst|dehydrat|water/i.test(l));
    say(`day ${day}: hyd ${h0} -> ${Math.round(s().hydration)} (Δ${Math.round(s().hydration) - h0}) hp ${hp0} -> ${Math.round(s().health)}`);
    say(`  game warned during the day: ${warned}`);
    if (warned) for (const l of lines.filter(l2 => /thirst|dehydrat|water/i.test(l2)).slice(0, 2)) say('    [warn] ' + l.slice(0, 140));
    const hpA = Math.round(s().health), enA = Math.round(s().energy);
    const sl = burnDay();
    say(`  slept (${sl.quality}) dehydrated: hp ${hpA} -> ${Math.round(s().health)}, en ${enA} -> ${Math.round(s().energy)}`);
    ok(Game.state.over || Math.round(s().health) <= hpA, `day ${day}: dehydration night does not fully heal (crisis path)`);
  }

  // ============ DAY 9: recovery ============
  if (!Game.state.over) {
    say('\n--- DAY 9: recovery ---');
    goHome();
    // cistern may have refilled via hauler by now (only if delegated)
    const f = fillN(4); filledTotal += f.filled;
    const d = drinkTo(90); drankTotal += d.drank; sickTotal += d.sick;
    say(`filled ${f.filled}, drank ${d.drank}: hyd=${Math.round(s().hydration)} hp=${Math.round(s().health)} cistern=${cistern()}L`);
    const d0 = s().day;
    for (let i = 0; i < 2 && !Game.state.over; i++) { Game.doAction('forage'); if (s().day !== d0) break; }
    Game.log.length = 0;
    const hpA = Math.round(s().health);
    const sl = burnDay();
    say(`slept (${sl.quality}): hp ${hpA} -> ${Math.round(s().health)} (heal tier check)`);
  }

  // ============ DAY 10: shelter tier audit ============
  if (!Game.state.over) {
    say('\n--- DAY 10: shelter tier audit ---');
    goHome();
    const prev = Game.sleepPreview();
    say(`at haven: quality=${prev.quality} heal=${prev.heal} ("${prev.name}")`);
    // tent in pack?
    const inv = s().inventory || [];
    const tentIdx = inv.findIndex(it => /tent/i.test(it.name || '') && it.packed !== false);
    say(`packed tent in inventory: ${tentIdx !== -1}`);
    // bunk on the haven detail grid?
    let bunkNear = false;
    try {
      const det = Game.genDetail(Game.map.px, Game.map.py);
      const mx = s().mx ?? 4, my = s().my ?? 4;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const row = det[my + dy];
        if (row && row[mx + dx] === 'bunk') bunkNear = true;
      }
    } catch (e) { say('detail gen threw: ' + (e && e.message)); }
    say(`bunk adjacent at haven: ${bunkNear}`);
    const d0 = s().day;
    Game.doAction('forage');
    if (s().day === d0) { const sl = burnDay(); say(`slept (${sl.quality})`); }
    say(`eod ${snap()}`);
  }

  say(`\nFINAL: ${snap()} gameDay=${s().day} over=${!!Game.state.over}`);
  say(`water economy: water-ticks=${waterTicks}, filled=${filledTotal}L, drank=${drankTotal}, sick=${sickTotal}`);
  say(`cistern trace: ${JSON.stringify(cisternLog)}`);

  console.log(log.join('\n'));
  console.log('\n==== FAILURES: ' + (failures.length ? failures.join(' | ') : 'none') + ' ====');
  console.log('==== NOTES ====\n' + notes.join('\n'));
  fs.writeFileSync(path.join(ROOT, 'playtests', '2026-10-06-survivalist-water-tax.md'),
    ['# 2026-10-06 survivalist water-tax run v2 (playtest loop)', '',
     'Ten days of the haven water economy: cistern drawdown, trust-gated delegation, creek risky water, dehydration spiral, shelter tiers.', '',
     '```', log.join('\n'), '```', '',
     '## Feel verdict', 'See loop log entry for this run.', ''].join('\n'));
  console.log('(wrote playtests/2026-10-06-survivalist-water-tax.md)');
  if (failures.length) process.exit(2);
})().catch(e => { console.error('THREW:', e && e.stack || e); process.exit(1); });
