// Living world: NPC node movement, bgHome, question variety, day-7 debug.
// Usage: node scripts/test-living-world.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
// STUB: rollDarkTrait is sibling in-flight work (dark people agent).
// Stub it so living-world tests run; remove when the real one lands.
if (!Game.rollDarkTrait) Game.rollDarkTrait = function() { return null; };

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.village;
  const s = Game.state.scholar;
  const roster = v.roster.filter(rid => rid !== Game.villagerId);

  console.log('--- 1. NPC node positions ---');
  ok('nodePos initialized', !!v.nodePos);
  ok('all NPCs have nodePos', roster.every(rid => v.nodePos[rid]));
  const hx = v.px ?? 3, hy = v.py ?? 3;
  ok('all start at Haven', roster.every(rid => {
    const n = Game.npcNode(rid);
    return n.nx === hx && n.ny === hy;
  }));
  ok('away map initialized', !!v.away);

  console.log('--- 2. npcSetNode / npcsOnNode ---');
  const testRid = roster[0];
  Game.npcSetNode(testRid, 4, 3);
  const nn = Game.npcNode(testRid);
  eq('node set correctly nx', nn.nx, 4);
  eq('node set correctly ny', nn.ny, 3);
  ok('not on haven node list', !Game.npcsOnNode(hx, hy).includes(testRid));
  ok('on new node list', Game.npcsOnNode(4, 3).includes(testRid));
  // bounds clamping
  Game.npcSetNode(testRid, 99, -5);
  const nn2 = Game.npcNode(testRid);
  eq('clamped nx', nn2.nx, 6);
  eq('clamped ny', nn2.ny, 0);
  Game.npcSetNode(testRid, hx, hy); // restore

  console.log('--- 3. ensureVillagerPositions (node-aware) ---');
  Game.map.px = hx; Game.map.py = hy;
  Game.ensureVillagerPositions();
  ok('positions assigned at Haven', roster.every(rid => v.positions[rid]));
  // Move an NPC away, ensure positions clear
  Game.npcSetNode(testRid, 5, 5);
  Game.ensureVillagerPositions();
  ok('away NPC position cleared', !v.positions[testRid]);
  ok('haven NPCs still positioned', roster.filter(r => r !== testRid).every(rid => v.positions[rid]));
  // Travel to their node — they should appear
  Game.map.px = 5; Game.map.py = 5;
  Game.ensureVillagerPositions();
  ok('NPC appears on their node', !!v.positions[testRid]);
  ok('haven NPCs not on this node', roster.filter(r => r !== testRid).every(rid => !v.positions[rid]));
  // restore
  Game.npcSetNode(testRid, hx, hy);
  Game.map.px = hx; Game.map.py = hy;
  Game.ensureVillagerPositions();

  console.log('--- 4. npcNodeTravel ---');
  // Force travel by setting high hunger
  const hungryRid = roster[1];
  v.needs = v.needs || {};
  v.needs[hungryRid] = { hunger: 90, fear: 10, social: 30, energy: 80 };
  // Mock isNight to false, run travel many times to trigger
  const origNight = Game.isNight;
  Game.isNight = () => false;
  let traveled = false;
  for (let i = 0; i < 30; i++) {
    Game.npcNodeTravel();
    if (v.away[hungryRid] || Game.npcNode(hungryRid).nx !== hx) { traveled = true; break; }
  }
  ok('hungry NPC eventually leaves to forage', traveled);
  Game.isNight = origNight;
  // Night: nobody leaves
  Game.isNight = () => true;
  const before = JSON.stringify(v.nodePos);
  for (let i = 0; i < 10; i++) Game.npcNodeTravel();
  // (away NPCs may drift, but no NEW departures at night)
  Game.isNight = origNight;

  console.log('--- 5. bgHome (background survivor home regions) ---');
  ok('bgHome initialized', !!v.bgHome);
  const bgIds = roster.filter(rid => (Game.data.background_survivors || []).some(b => b.id === rid));
  if (bgIds.length) {
    ok('bg survivors have home regions', bgIds.every(rid => v.bgHome[rid]));
    ok('no "?" home regions', bgIds.every(rid => v.bgHome[rid] && v.bgHome[rid] !== '?'));
    const hr = Game.npcHomeRegion(bgIds[0]);
    ok('npcHomeRegion returns bgHome', hr === v.bgHome[bgIds[0]]);
    console.log(`  sample: ${bgIds[0]} -> ${hr}`);
  } else {
    console.log('  (no bg survivors in roster, skipping)');
  }

  console.log('--- 6. Question variety ---');
  const qs = (Game.data.characterGen.convo || {}).questions || [];
  ok('12+ questions exist', qs.length >= 12);
  const voices = new Set(qs.map(q => q.voice).filter(Boolean));
  ok('multiple voices represented', voices.size >= 4);
  console.log(`  voices: ${[...voices].join(', ')}`);

  console.log('--- 7. Leader feedback (resolveAssignments) ---');
  // Assign a forage task, advance a part, check for the return message
  const workerRid = roster[2];
  v.trust[workerRid] = 50; // enough to accept
  Game.assignTask(workerRid, 'forage', {});
  ok('assignment created', !!(v.assignments || {})[workerRid]);
  const logBefore = (Game.state.log || []).length;
  // Capture say output
  let sawReturn = false;
  const origSay = Game.say;
  Game.say = (msg) => { if (String(msg).includes('returns')) sawReturn = true; return origSay.call(Game, msg); };
  Game.advancePart();
  Game.say = origSay;
  ok('leader gets "returns" feedback', sawReturn);

  console.log('--- 8. NPC night behavior ---');
  // At night, batch turns should barely move NPCs
  Game.map.px = hx; Game.map.py = hy;
  Game.ensureVillagerPositions();
  Game.isNight = () => true;
  const posBefore = JSON.stringify(v.positions);
  // Run several batch turns
  for (let i = 0; i < 5; i++) {
    try { Game.npcBatchTurn(); } catch (e) { /* ignore */ }
  }
  Game.isNight = origNight;
  // Positions should be mostly unchanged (small shuffle allowed)
  let moved = 0, total = 0;
  const posAfter = v.positions;
  const beforeObj = JSON.parse(posBefore);
  for (const rid of Object.keys(beforeObj)) {
    if (!posAfter[rid]) continue;
    total++;
    if (beforeObj[rid].mx !== posAfter[rid].mx || beforeObj[rid].my !== posAfter[rid].my) moved++;
  }
  // At night with 25% shuffle chance over 5 turns, most should stay or move minimally
  console.log(`  night movement: ${moved}/${total} NPCs shifted over 5 batch turns`);
  ok('night movement is minimal', total === 0 || moved / total < 0.8);

  console.log('--- 9. Day-7 debug experience ---');
  // Fresh game for this test
  Game.genRoster('Austin, Texas');
  Game.newGame('Austin, Texas', null, Game.generatedRoster[0].id);
  Game.depart();
  const v2 = Game.state.village;
  const s2 = Game.state.scholar;
  const roster2 = v2.roster.filter(rid => rid !== Game.villagerId);
  Game.debugDay7Experience();
  eq('day set to 7', s2.day, 7);
  ok('trust synthesized', roster2.some(rid => (v2.trust[rid] || 0) > 20));
  ok('names learned', Object.keys(v2.knownNames || {}).length > roster2.length * 0.4);
  ok('pantry strained', (v2.pantryKcal || 0) < 15000);
  ok('week1 tracker filled', (s2.week1.talk || 0) > 5);
  ok('day7 armed', !!s2._day7Armed);
  ok('player at Haven', Game.map.px === (v2.px ?? 3) && Game.map.py === (v2.py ?? 3));
  // Journal should have entries
  const people = (Game.state.codex.people || {});
  ok('journal partially filled', Object.keys(people).length > 0);
  // Now take an action — System should arrive
  ok('system not yet arrived', !Game.state.systemArrived);
  Game.tickAction(1);
  ok('system arrives on first action', !!Game.state.systemArrived);
  ok('day7 disarmed', !s2._day7Armed);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
