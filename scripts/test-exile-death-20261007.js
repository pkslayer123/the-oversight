#!/usr/bin/env node
// PROOF TEST: exile death on the road (drifter loop 2026-10-07).
// Bug: when the exiled player died on the road, the mantle passed to a
// villager but the scholar object kept exiled=true + the road arc, the dead
// exile's whole pack poured into the village pantry via a fiction-breaking
// "glad to see you" homecoming, and readmission bricked permanently
// ("nowhere to return TO" for the new identity while exiled stayed true).
// Fix (membership.js playerDeath wrap): the exile ends with the body —
// arc closed, pack stays where they fell, new bearer starts clean, spoken.
// Seeded RNG (mulberry32); override with SEED=<n>.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js',
 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seed = parseInt(process.env.SEED || '20261007', 10);
Math.random = mulberry32(seed);

const says = [];
Game.say = (t) => { says.push(String(t)); };
Game.sysSay = (t) => { says.push('[SYS]' + String(t)); };

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + label); }
}
function foodKcal() {
  return Game.state.scholar.inventory.reduce((t, i) => t + (((i.kcalEach || 0) > 0 && (i.units || 0) > 0) ? (i.units || 0) * (i.kcalEach || 0) : 0), 0);
}
function pantryKcal() {
  const v = Game.state.village || {};
  return (v.pantry || []).reduce((t, i) => t + ((i.kcalEach || 0) * (i.units || 1)), 0);
}

async function main() {
  console.log('seed=' + seed);
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = 15; Game.state.village.day = 15;
  s.kcal = 3200; s.health = 100;
  s.inventory.push({ name: 'Smoked fish', kcalEach: 350, units: 60, spoilDay: 9999, safe: true, edible: true, foodState: 'ready', foodKind: 'plant' });
  const oldId = Game.villagerId;
  const packBefore = foodKcal();
  ok(packBefore >= 21000, 'setup: road pack holds the 21000 kcal we packed (got ' + packBefore + ')');

  // exile, then die on the road with a full pack
  says.length = 0;
  Game.exilePlayer('moot');
  ok(!!s.exiled, 'exiled flag set');
  ok(!!(Game.state.village.severed || {})[oldId], 'severed record stands for the exile');
  says.length = 0;
  const pantryBefore = pantryKcal();
  Game.playerDeath('the night'); // the road takes them
  const newId = Game.villagerId;
  ok(newId !== oldId, 'mantle passed to a new bearer');
  ok(s.exiled === false, 'exile cleared on the new bearer (got ' + s.exiled + ')');
  ok(Game.exileArcState().stage === 'ended', "exile arc closed to 'ended' (got " + Game.exileArcState().stage + ')');
  ok(s.roadExposed === false, 'roadExposed cleared');
  ok(s.codexCut === false, 'codexCut cleared');
  ok(s.founding == null, 'founding project cleared');
  ok(s.drifting === false, 'drifting cleared');
  ok(foodKcal() === 0, 'road pack stayed where the body fell (pack now ' + foodKcal() + ' kcal)');
  ok(says.some(t => /road keeps/i.test(t)), 'the death is spoken ("the road keeps...")');
  ok(says.some(t => /stays where .* fell/i.test(t)), 'the lost pack is spoken, never silent');
  ok(Game.isMember(newId), 'new bearer is a member in good standing');
  ok(Game.seekReadmission() === null, 'seekReadmission: not exiled, nothing to petition');

  // the homecoming must not pour phantom food into the pantry
  says.length = 0;
  Game.returnToVillage();
  ok(pantryKcal() === pantryBefore, 'no phantom pantry injection (pantry ' + pantryBefore + ' -> ' + pantryKcal() + ' kcal)');
  ok(!says.some(t => /unload \d+ kcal into .*pantry/i.test(t)), 'no pantry-unload beat fired');

  // the road stays quiet: one more day, no roadDaily resurrection
  const rd = Game.exileArcState().roadDays;
  Game.endDay();
  ok(Game.exileArcState().roadDays === rd, 'road arc does not resume after death');
  ok(s.exiled === false, 'still not exiled after another day');

  // CONTROL: a non-exiled death is untouched by the wrap (pack inheritance preserved)
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s2 = Game.state.scholar;
  s2.day = 15; Game.state.village.day = 15;
  s2.inventory.push({ name: 'Dried venison', kcalEach: 400, units: 10, spoilDay: 9999, safe: true });
  const controlPack = foodKcal();
  says.length = 0;
  Game.playerDeath('the night');
  ok(!s2.exiled, 'control: non-exiled death leaves exiled unset');
  ok(foodKcal() === controlPack, 'control: non-exiled death keeps existing pack behavior (got ' + foodKcal() + ')');
  ok(!says.some(t => /road keeps/i.test(t)), 'control: no exile-death beat for a member death');

  // ROAD SUSTAINABILITY: a packed exile lives off the pack — the day's real
  // burn comes from road food, not body stores (2026-10-07: the old code ate
  // a fictional 2000 "road need" and settled it back, so exiles starved at
  // ~2200/day with a full pack).
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s3 = Game.state.scholar;
  s3.day = 15; Game.state.village.day = 15;
  s3.kcal = 2500; s3.health = 100; s3.hydration = 100;
  s3.inventory.push({ name: 'Smoked fish', kcalEach: 350, units: 60, spoilDay: 99999, safe: true, edible: true, foodState: 'ready', foodKind: 'plant' });
  Game.exilePlayer('moot');
  says.length = 0;
  const packStart = foodKcal();
  for (let d = 0; d < 5; d++) { s3.hydration = 100; try { Game.endDay(); } catch (e) {} }
  ok(Game.state.scholar.health >= 95, 'packed exile keeps their health on the road (got ' + Math.round(Game.state.scholar.health) + ')');
  ok(!says.some(t => /STARVING/i.test(t)), 'packed exile never hits the starvation spiral');
  const packDrained = packStart - foodKcal();
  ok(packDrained > 8000 && packDrained < 14000, 'the pack fed five road days (~2200/day, drained ' + Math.round(packDrained) + ')');
  ok(Game.exileArcState().roadDays === 5, 'road arc still tracks days (got ' + Game.exileArcState().roadDays + ')');

  // ...and a packless exile DOES starve: hunger stays real.
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s4 = Game.state.scholar;
  s4.day = 15; Game.state.village.day = 15;
  s4.kcal = 1500; s4.health = 100; s4.hydration = 100;
  Game.exilePlayer('moot');
  says.length = 0;
  for (let d = 0; d < 4; d++) { s4.hydration = 100; try { Game.endDay(); } catch (e) {} }
  ok(Game.state.scholar.health < 100, 'packless exile pays from the body (health ' + Math.round(Game.state.scholar.health) + ')');
  ok(says.some(t => /not a metaphor/i.test(t)), 'packless exile hears the hunger line');

  console.log(`\n${pass} passed, ${fail} failed (seed=${seed})`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('CRASH:', e.message); process.exit(1); });
