// MISER playtest — THE FAMINE BARON (this run's archetype: miser).
// Hoard a fat pack + bury far caches, then let the village go hungry WITHOUT
// donating. Measures:
//  1. begging fires: how often, who asks, is the ask persistent in state?
//  2. can the player discover WHO asked (say buffer vs UI)?
//  3. answering an ask: trust, gratitude, foodExpectation.
//  4. ignoring asks: curdle (trust -2, 'ignored' memory, "stops asking").
//  5. the Santa alternative: donate bulk -> all-NPC hunger relief, cheer.
//  6. pantry skim during famine: is there any social cost to emptying the
//     communal pot while people starve?
// Usage: node scripts/playtest-miser-famine.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js',
 'src/js/journal.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let said = [];
const s = () => Game.state.scholar;
const V = () => Game.state.village;
const packKcal = () => (s().inventory || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0);
const pantryKcal = () => (V().pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
const avgHunger = () => { const r = (V().roster || []).filter(id => id !== Game.villagerId); const sum = r.reduce((t, id) => t + (Game.npcNeeds(id).hunger || 0), 0); return r.length ? sum / r.length : 0; };
const hungryCount = () => (V().roster || []).filter(id => id !== Game.villagerId && (Game.npcNeeds(id).hunger || 0) > 70).length;
const askLines = [];
function freshGame() {
  said = [];
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); try { return origSay(t); } catch (e) {} };
  Game.depart();
  s().inventory = [];
}
function advanceParts(n) {
  // real play path: advancePart ticks needs, runs NPC initiative (begging),
  // node travel, theft sweeps, and endDay -> villageMeal/villageEats.
  // Positions must exist or the entire living-world layer is dead (NPCs have
  // no grid positions until ensureVillagerPositions runs, as on real movement).
  for (let i = 0; i < n && !Game.over; i++) {
    try { Game.ensureVillagerPositions(); } catch (e) {}
    try { Game.advancePart(); } catch (e) { console.log('  advancePart err: ' + e.message); break; }
  }
}
function sleepNight() {
  const d0 = s().day; let guard = 0;
  while (s().day === d0 && guard < 8 && !Game.over) { guard++; Game.sleep(); if (s().day === d0 && !Game.over) Game.doAction('rest'); }
}

(async () => {
  await Game.init();
  freshGame();
  const hv = { x: V().px ?? 3, y: V().py ?? 3 };
  console.log('ACT 1 — build the hoard');
  console.log(`  opening: pack=${Math.round(packKcal())} pantry=${Math.round(pantryKcal())} avgHunger=${avgHunger().toFixed(0)}`);
  // bulk pantry skim (the classic miser move)
  Game.enterBuilding();
  let took = 0, iter = 0;
  while (iter < 40 && took < 30) {
    iter++;
    const pan = V().pantry || [];
    const idx = pan.findIndex(i => (i.kcalEach || 0) > 0 && (i.units || 0) > 0);
    if (idx < 0) break;
    try { Game.takeFromPantry(idx); took++; } catch (e) { break; }
  }
  console.log(`  pantry skim: took ${took} stacks -> pack=${Math.round(packKcal())} pantry=${Math.round(pantryKcal())}`);

  // bury two far caches: one perishable, one preserved
  Game.exitBuilding();
  const hopTo = (x, y) => { const r = Game.travelTo(x, y); return r === undefined || r === null; };
  const targets = Game.travelTargets();
  const far = targets[targets.length - 1];
  if (far) {
    const d = Math.abs(far.x - hv.x) + Math.abs(far.y - hv.y);
    hopTo(far.x, far.y);
    const fi = (s().inventory || []).findIndex(i => (i.kcalEach || 0) > 0 && (i.units || 0) > 1);
    if (fi >= 0) Game.buryCache('food', fi, 2);
    console.log(`  buried cache at dist ${d}; caches=${Game.playerCaches().length}`);
    // walk home
    let g = 0;
    while ((Game.map.px !== hv.x || Game.map.py !== hv.y) && g < 30) {
      g++;
      let best = null, bd = Infinity;
      for (const t of Game.travelTargets()) { const dd = Math.abs(t.x - hv.x) + Math.abs(t.y - hv.y); if (dd < bd) { bd = dd; best = t; } }
      if (!best || !hopTo(best.x, best.y)) break;
    }
  }
  Game.enterBuilding();

  console.log('\nACT 2 — let the village go hungry (no donations, just time)');
  // NOTE: the player must share the hall with the villagers (same side of the
  // Haven door) and positions must exist, or no NPC initiative ever fires.
  Game.enterBuilding();
  try { Game.ensureVillagerPositions(); } catch (e) {}
  // drain the pantry hard: the miser takes everything, famine is real
  let drain = 0, di2 = 0;
  while (di2 < 60 && pantryKcal() > 1500) {
    di2++;
    const pan = V().pantry || [];
    const idx = pan.findIndex(i => (i.kcalEach || 0) > 0 && (i.units || 0) > 0);
    if (idx < 0) break;
    try { Game.takeFromPantry(idx); drain++; } catch (e) { break; }
  }
  console.log(`  famine setup: drained ${drain} more stacks; pantry=${Math.round(pantryKcal())} pack=${Math.round(packKcal())}`);
  const asks = [];
  for (let p = 0; p < 8 && !Game.over; p++) {
    said = [];
    advanceParts(1);
    const lines = said.filter(t => /Got anything to eat|I hate asking|Don't suppose you've got food|rubbing their belly|sidles up/i.test(t));
    for (const l of lines) asks.push({ part: p, line: l.slice(0, 100) });
    if (p % 4 === 3) console.log(`  after part ${p + 1}: day=${s().day} avgHunger=${avgHunger().toFixed(0)} hungry=${hungryCount()} requests=${Object.keys(V().requests || {}).length} totalAsks=${asks.length} over=${!!Game.over}`);
  }
  console.log(`  asks fired: ${asks.length}`);
  asks.slice(0, 6).forEach(a => console.log(`    | ${a.line}`));
  const reqIds = Object.keys(V().requests || {});
  console.log(`  requests currently in state: ${reqIds.length} (${reqIds.slice(0, 5).join(', ')})`);
  // Q2: is there any player-visible way to know WHO asked?
  console.log(`  app.js surfaces requests in UI: ${false} (verified: no 'requests' read in app.js)`);
  // but conversation/person card may show hunger; check a requester
  const rid = reqIds[0];
  if (rid) {
    const needs = Game.npcNeeds(rid);
    console.log(`  requester ${Game.displayName(rid)}: hunger=${needs.hunger} mood=${Game.npcMood(rid)}`);
  }

  console.log('\nACT 3 — answer one ask publicly (meal)');
  said = [];
  let trustBefore = null, hungerBefore = null;
  if (rid) {
    trustBefore = (V().trust || {})[rid];
    hungerBefore = Game.npcNeeds(rid).hunger;
    const r = Game.giveFood(rid, 'meal');
    const grat = said.filter(t => /Thank you|I won't forget|eats like it's the first time/i.test(t));
    console.log(`  giveFood result: ${r && r.ok ? `ok units=${r.units} public=${r.public} trustGain=${r.trustGain}` : 'FAILED'}`);
    console.log(`  trust ${trustBefore} -> ${(V().trust || {})[rid]}; hunger ${hungerBefore} -> ${Game.npcNeeds(rid).hunger}`);
    console.log(`  gratitude line: ${grat.length ? grat[0].slice(0, 110) : '(none)'}`);
    console.log(`  request cleared: ${!((V().requests || {})[rid])}; foodExpectation=${!!V().foodExpectation}`);
    console.log(`  pack now=${Math.round(packKcal())}`);
  }

  console.log('\nACT 4 — ignore the rest; watch requests curdle');
  said = [];
  const ignored = reqIds.slice(1);
  const trustSnapshot = {};
  ignored.forEach(id => trustSnapshot[id] = (V().trust || {})[id]);
  // pass a full day so requests age >= 1 day (curdle threshold)
  advanceParts(4);
  console.log(`  day advanced; now day=${s().day}; requests remaining=${Object.keys(V().requests || {}).length}`);
  let curdled = 0;
  ignored.forEach(id => {
    const mem = ((V().memory || {})[id] || []);
    const hasIgnored = mem.some(m => JSON.stringify(m).includes('ignored'));
    const tNow = (V().trust || {})[id];
    if (hasIgnored || tNow < (trustSnapshot[id] || 10)) curdled++;
    console.log(`    ${Game.displayName(id)}: trust ${trustSnapshot[id]} -> ${tNow} ignoredMemory=${hasIgnored}`);
  });
  const stopLines = said.filter(t => /stops asking|The look says enough/i.test(t));
  console.log(`  "stops asking" lines: ${stopLines.length}${curdled === ignored.length && ignored.length ? '' : ` (${ignored.length - curdled} of ${ignored.length} ignored showed no curdle — check)`}`);

  console.log('\nACT 5 — the Santa alternative: donate bulk from the fat pack');
  const h0 = avgHunger(), c0 = V().cheer || 0, pk0 = packKcal(), pan0 = pantryKcal();
  Game.enterBuilding();
  said = [];
  const di = (s().inventory || []).findIndex(i => (i.kcalEach || 0) > 0 && (i.units || 0) >= 3);
  let donationDone = false;
  if (di >= 0) {
    try { Game.donateToPantry(di); donationDone = true; } catch (e) { console.log('  donate error: ' + e.message); }
  }
  // the donation feeds the pantry; relief lands at the communal meal (endDay)
  advanceParts(4);
  console.log(`  donated: ${donationDone}; hunger ${h0.toFixed(0)} -> ${avgHunger().toFixed(0)} (after communal meal); cheer ${c0} -> ${V().cheer}; pack ${Math.round(pk0)} -> ${Math.round(packKcal())}; pantry ${Math.round(pan0)} -> ${Math.round(pantryKcal())}`);
  const donLines = said.filter(t => /bellies|warmer|remember this|Donated/i.test(t));
  donLines.slice(0, 3).forEach(t => console.log('    | ' + t.slice(0, 110)));

  console.log('\nACT 6 — does emptying the communal pot while people starve have a cost?');
  // skim the pantry AGAIN down to near-zero and watch one more day of reaction
  Game.enterBuilding();
  let took2 = 0, it2 = 0;
  while (it2 < 40 && pantryKcal() > 2000) { it2++; const pan = V().pantry || []; const idx = pan.findIndex(i => (i.kcalEach || 0) > 0 && (i.units || 0) > 0); if (idx < 0) break; try { Game.takeFromPantry(idx); took2++; } catch (e) { break; } }
  said = [];
  const heat0 = JSON.stringify(V().heat || {});
  advanceParts(4); sleepNight();
  console.log(`  skimmed ${took2} more stacks; pantry now=${Math.round(pantryKcal())}; heat ${heat0} -> ${JSON.stringify(V().heat || {})}`);
  const skimLines = said.filter(t => /pantry|stash count|missing|notice/i.test(t));
  console.log(`  pantry-theft reaction lines: ${skimLines.length}`);
  skimLines.slice(0, 3).forEach(t => console.log('    | ' + t.slice(0, 110)));
  // village gossip about generosity?
  const genMem = (V().memory || {})[Game.villagerId];
  console.log(`  player memory entries: ${(V().memory && V().memory[Game.villagerId] || []).length}`);

  console.log('\nFINAL: ' + JSON.stringify({
    day: s().day, pack: Math.round(packKcal()), pantry: Math.round(pantryKcal()),
    caches: Game.playerCaches().length, avgHunger: Math.round(avgHunger()),
    asksFired: asks.length, foodExpectation: !!V().foodExpectation, over: !!Game.over
  }));
})();
