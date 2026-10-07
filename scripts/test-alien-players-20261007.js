// Alien Players test (Steve 2026-10-07)
// Proves: late-game inhabited avatars work — gating, knowledge hiding,
// rival/allies/favor systems, and System limitation enforcement.

const fs = require('fs');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + msg); }
}

const personas = JSON.parse(fs.readFileSync('/home/hatch/workspace/the-scattering/src/data/alienPlayers.json', 'utf8'));
const moduleSrc = fs.readFileSync('/home/hatch/workspace/the-scattering/src/js/alienPlayers.js', 'utf8');

console.log('=== 1. Persona data: 8 distinct characters, 3 dispositions ===');
assert(personas.length >= 8, 'at least 8 personas, got ' + personas.length);
var dispositions = {};
personas.forEach(function (p) { dispositions[p.disposition] = (dispositions[p.disposition] || 0) + 1; });
assert(dispositions.sadistic >= 3, 'at least 3 sadistic, got ' + (dispositions.sadistic || 0));
assert(dispositions.neutral >= 3, 'at least 3 neutral, got ' + (dispositions.neutral || 0));
assert(dispositions.benevolent >= 2, 'at least 2 benevolent, got ' + (dispositions.benevolent || 0));

console.log('\n=== 2. Each persona is a PERSON, not a stat block ===');
personas.forEach(function (p) {
  assert(p.name && p.title && p.species, p.id + ' has name/title/species');
  assert(p.backstory && p.backstory.length > 50, p.id + ' has a real backstory');
  assert(p.motivation && p.motivation.length > 20, p.id + ' has a motivation');
  assert(p.voice, p.id + ' has a voice description');
});
// Combat personas need combat voice; Wren (non-combat) is exempt
personas.forEach(function (p) {
  if (p.id === 'wren') {
    assert((!p.taunts || p.taunts.length === 0), 'wren has no taunts (non-combat)');
    assert(p.helpLines && p.helpLines.length >= 3, 'wren has help lines');
  } else {
    assert(p.introLines && p.introLines.length >= 1, p.id + ' has intro lines');
  }
});

console.log('\n=== 3. Module: ontology header present ===');
assert(/\/\/ @ontology/.test(moduleSrc), 'ontology header present');
assert(/system: alienPlayers/.test(moduleSrc), 'system named');
assert(/apState\(\)/.test(moduleSrc), 'apState provided');
assert(/apMaybeInhabit/.test(moduleSrc), 'apMaybeInhabit provided');
assert(/apDailyTick/.test(moduleSrc), 'apDailyTick provided');
assert(/apFavor/.test(moduleSrc), 'apFavor provided');

console.log('\n=== 4. Gating: post-System, wave 2+ only ===');
assert(/state\.systemArrived/.test(moduleSrc), 'gated on systemArrived');
assert(/unlockedWave\(\) >= 2/.test(moduleSrc), 'gated on wave 2+');
assert(/\(mdef\.wave \|\| 1\) < 2/.test(moduleSrc), 'wave-1 monsters never inhabited');

console.log('\n=== 5. Knowledge gating: identity hidden until earned ===');
assert(/apKnowsInhabited/.test(moduleSrc), 'knowledge gate function exists');
assert(/apRevealInhabited/.test(moduleSrc), 'reveal function exists');
assert(/encounters >= 3/.test(moduleSrc), '3rd encounter reveals (pattern recognition)');
// Mystery intro when unknown
assert(/It moves wrong/.test(moduleSrc), 'mystery intro for unknown pilots');

console.log('\n=== 6. Limitations enforced in code ===');
assert(/lastDropDay/.test(moduleSrc), 'dead drop cooldown tracked');
assert(/day - ap\.lastDropDay < 3/.test(moduleSrc), 'dead drops max 1 per 3 days');
assert(/lastFeedDay/.test(moduleSrc), 'feed cooldown tracked');
assert(/day - ap\.lastFeedDay < 1/.test(moduleSrc), 'feed max 1 per day');
assert(/lastHuntDay/.test(moduleSrc), 'rival hunt cooldown tracked');
assert(/>= 2/.test(moduleSrc), 'sporting rules: min 2 days between hunts');
// Deniability: benevolent help is subtle
assert(/deniable/i.test(moduleSrc) || /Deniable/i.test(moduleSrc) || /DENIABLE/.test(moduleSrc), 'deniability documented');

console.log('\n=== 7. Favor system: -100..100, shapes packages ===');
assert(/Math\.max\(-100, Math\.min\(100/.test(moduleSrc), 'favor clamped -100..100');
assert(/apCarePackage/.test(moduleSrc), 'care package function exists');
assert(/favor >= 70/.test(moduleSrc), 'package quality scales with favor');

console.log('\n=== 8. Wraps: startCombat, tbEnd, endDay ===');
assert(/G\.startCombat = function/.test(moduleSrc), 'startCombat wrapped');
assert(/G\.tbEnd = function/.test(moduleSrc), 'tbEnd wrapped');
assert(/G\.endDay = function/.test(moduleSrc), 'endDay wrapped');
assert(/_sc \? _sc\.apply/.test(moduleSrc), 'startCombat wrap is chain-safe');
assert(/_tbEnd \? _tbEnd\.apply/.test(moduleSrc), 'tbEnd wrap is chain-safe');
assert(/_endDay \? _endDay\.apply/.test(moduleSrc), 'endDay wrap is chain-safe');

console.log('\n=== 9. Behavioral: module loads and methods work ===');
// Minimal harness: eval the full module with a controlled _g
var sayLog = [];
var sysSayLog = [];
var mockGame = {
  state: {
    systemArrived: true,
    scholar: { day: 10, kcal: 1000, pack: [] },
    alienPlayers: null,
  },
  data: { alienPlayers: personas, items: [{ id: 'test_gadget', name: 'Test Gadget', alien: true, tier: 1, desc: 'A test.' }] },
  _wave: 2,
  unlockedWave: function () { return this._wave; },
  say: function (t) { sayLog.push(t); },
  sysSay: function (t) { sysSayLog.push(t); },
};
try {
  // The module is (function(_g){ ... })(window||global).
  // We run it with _g = { Scattering: { Game: mockGame } } by wrapping.
  var src = moduleSrc;
  // Replace the trailing invocation with our controlled _g
  var invokeAt = src.lastIndexOf('})(typeof window');
  assert(invokeAt > 0, 'module invocation found');
  var bodyOnly = src.slice(0, invokeAt) + '})';
  var runModule = new Function('_g', bodyOnly + '(_g);');
  runModule({ Scattering: { Game: mockGame } });
  assert(typeof mockGame.apState === 'function', 'apState attached to Game');
  assert(typeof mockGame.apEligible === 'function', 'apEligible attached');

  // apEligible: true when system arrived + wave 2
  assert(mockGame.apEligible() === true, 'eligible post-System wave 2');
  mockGame._wave = 1;
  assert(mockGame.apEligible() === false, 'not eligible wave 1');
  mockGame._wave = 2;
  mockGame.state.systemArrived = false;
  assert(mockGame.apEligible() === false, 'not eligible pre-System');
  mockGame.state.systemArrived = true;

  // apState initializes
  var ap = mockGame.apState();
  assert(ap.favor === 0, 'favor starts at 0');
  assert(typeof ap.met === 'object', 'met map exists');

  // apFavor / apAdjustFavor
  mockGame.apAdjustFavor(30, 'test');
  assert(mockGame.apFavor() === 30, 'favor adjusts to 30');
  mockGame.apAdjustFavor(200, 'test');
  assert(mockGame.apFavor() === 100, 'favor clamps at 100');
  mockGame.apAdjustFavor(-300, 'test');
  assert(mockGame.apFavor() === -100, 'favor clamps at -100');
  mockGame.apState().favor = 0; // reset

  // Knowledge gating
  assert(mockGame.apKnowsInhabited('vex_marlowe') === false, 'pilot unknown initially');
  mockGame.apRevealInhabited('vex_marlowe', 'test reveal');
  assert(mockGame.apKnowsInhabited('vex_marlowe') === true, 'pilot known after reveal');
  assert(sayLog.some(function (t) { return t.indexOf('Vex Marlowe') >= 0; }), 'reveal announces the pilot');

  // apMaybeInhabit: wave-1 never, wave-2 sometimes
  sayLog = [];
  var w1mdef = { id: 'bulldozer', wave: 1 };
  assert(mockGame.apMaybeInhabit('bulldozer', w1mdef) === null, 'wave-1 never inhabited');
  // Force inhabit by running many rolls (12% chance)
  var w2mdef = { id: 'moderator', wave: 2 };
  var inhabited = null;
  for (var i = 0; i < 200 && !inhabited; i++) {
    // reset hunt cooldowns so sporting rules don't block
    mockGame.apState().lastHuntDay = {};
    inhabited = mockGame.apMaybeInhabit('moderator', w2mdef);
  }
  assert(!!inhabited, 'wave-2 sometimes inhabited (200 rolls)');
  if (inhabited) {
    assert(mockGame.apPersona(inhabited) !== null, 'inhabited pilot is a real persona');
  }

  // Combat end records encounter
  sayLog = [];
  mockGame.apOnCombatEnd('vex_marlowe', 'won');
  var met = mockGame.apState().met['vex_marlowe'];
  assert(met && met.encounters === 1, 'encounter recorded');
  assert(met.lastOutcome === 'won', 'outcome recorded');
  assert(mockGame.apFavor() > 0, 'favor increased after beating sadistic pilot');

  // Dead drop respects cooldown
  mockGame.apState().lastDropDay = 10; // today
  assert(mockGame.apDeadDrop() === false, 'dead drop blocked by cooldown');
  mockGame.apState().lastDropDay = 5; // 5 days ago
  // May or may not fire (50% + helper check), but shouldn't throw
  try { mockGame.apDeadDrop(); assert(true, 'dead drop runs without throwing'); }
  catch (e) { assert(false, 'dead drop threw: ' + e.message); }

  // Feed respects cooldown
  mockGame.apState().lastFeedDay = 10;
  assert(mockGame.apFeedMessage() === false, 'feed blocked by cooldown');

  // Daily tick runs without throwing
  try { mockGame.apDailyTick(); assert(true, 'daily tick runs'); }
  catch (e) { assert(false, 'daily tick threw: ' + e.message); }

  // Not eligible: daily tick is a no-op
  mockGame.state.systemArrived = false;
  sayLog = [];
  try { mockGame.apDailyTick(); assert(sayLog.length === 0, 'no output pre-System'); }
  catch (e) { assert(false, 'pre-System tick threw'); }
  mockGame.state.systemArrived = true;

} catch (e) {
  assert(false, 'harness failed: ' + e.message + ' ' + e.stack.split('\n')[1]);
}

console.log('\n=== 10. Integration: monster-pilot affinity ===');
assert(typeof mockGame.apPilotAffinity === 'function', 'apPilotAffinity exists');
var aff = mockGame.apPilotAffinity('nightlight_catfish');
assert(aff && aff.includes('vex_marlowe'), 'catfish -> Vex Marlowe affinity');
assert(mockGame.apPilotAffinity('bulldozer').includes('sarge'), 'bulldozer -> Sarge affinity');
assert(mockGame.apPilotAffinity('nonexistent_xyz') === null, 'unknown monster -> no affinity');

console.log('\n=== 11. Integration: contest interference ===');
assert(typeof mockGame.apContestInterference === 'function', 'apContestInterference exists');
// Not eligible pre-System
mockGame.state.systemArrived = false;
var ci = mockGame.apContestInterference({});
assert(ci.winMod === 0 && ci.deathSave === false, 'no interference pre-System');
mockGame.state.systemArrived = true;
// Sadistic rival rigging (needs 2+ encounters)
mockGame.apState().met['vex_marlowe'] = { encounters: 3, lastOutcome: 'won' };
mockGame.apState().lastRigDay = -999;
var rigged = false;
for (var ri = 0; ri < 50 && !rigged; ri++) {
  mockGame.apState().lastRigDay = -999;
  var r = mockGame.apContestInterference({});
  if (r.winMod < 0) rigged = true;
}
assert(rigged, 'sadistic rival sometimes rigs contests');
// Benevolent lifeline (needs bond 2+)
mockGame.apState().met['old_tam'] = { encounters: 3, bond: 3 };
mockGame.apState().lastLifelineDay = -999;
var saved = false;
for (var li = 0; li < 50 && !saved; li++) {
  mockGame.apState().lastLifelineDay = -999;
  mockGame.apState().lastRigDay = 10; // block rigging
  var r2 = mockGame.apContestInterference({});
  if (r2.deathSave) saved = true;
}
assert(saved, 'bonded benevolent sometimes provides lifeline');
// Fan favor affects contests
mockGame.apState().favor = 60;
mockGame.apState().lastRigDay = 10; mockGame.apState().lastLifelineDay = 10;
var r3 = mockGame.apContestInterference({});
assert(r3.winMod > 0, 'high favor boosts contest odds');
mockGame.apState().favor = -60;
var r4 = mockGame.apContestInterference({});
assert(r4.winMod < 0, 'low favor hurts contest odds');
mockGame.apState().favor = 0;

console.log('\n=== 12. Integration: codex entries ===');
assert(typeof mockGame.apCodexEntry === 'function', 'apCodexEntry exists');
mockGame.state.codex = {};
var entry = mockGame.apCodexEntry('vex_marlowe');
assert(entry && entry.name === 'Vex Marlowe', 'codex entry created');
assert(entry.stage === 'encountered' || entry.stage === 'identified', 'progressive stage set');

console.log('\n=== 13. Integration: village gossip & NPC contacts ===');
assert(typeof mockGame.apVillageGossip === 'function', 'apVillageGossip exists');
assert(typeof mockGame.apContactedVillager === 'function', 'apContactedVillager exists');
assert(typeof mockGame.apContactWarning === 'function', 'apContactWarning exists');
// Gossip respects cooldown
mockGame.apState().lastGossipDay = 10;
assert(mockGame.apVillageGossip() === false, 'gossip blocked by cooldown');

console.log('\n=== 14. Integration: persona care packages ===');
assert(typeof mockGame.apPersonaPackage === 'function', 'apPersonaPackage exists');
mockGame.apState().lastPersonaPackageDay = 10;
assert(mockGame.apPersonaPackage() === false, 'persona package blocked by cooldown');

console.log('\n=== 15. Integration: event-referencing feed ===');
assert(typeof mockGame.apEventFeed === 'function', 'apEventFeed exists');
mockGame.apState().lastFeedDay = 10;
assert(mockGame.apEventFeed() === false, 'event feed blocked by cooldown');

console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
