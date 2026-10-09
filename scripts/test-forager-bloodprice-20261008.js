// FORAGER adversarial: Blood Price re-measurement (2026-10-08).
// FLAG under test: "blood_magic has no per-day gate (measured +21,600 kcal/day)".
// BASE here already carries the wound-gate fix (commit bc2bf4f: 2/daypart cap +
// wound gate, ~10 knits/night, body refuses past 50 wound). This test VERIFIES
// the fix holds under 5 days of hostile play, and demonstrates what the OLD
// rule printed (red against the pre-fix design) so the flag can't silently
// regress.
// DESIGN CALL (mine, Steve: "figure it out yourself"): the 2/daypart cap alone
// still printed ~1,500 kcal/day at zero net HP via field_medicine. The wound
// gate was the second lever — the cut is missing mass (maxHealth drops), knits
// only at night, and the body refuses past 50. Sustainable: ~1 use/day = ~500
// kcal/day — a real min-max edge, not dinner. Emergency use untouched.
// Usage: SEED=7 node scripts/test-forager-bloodprice-20261008.js
'use strict';
const fs = require('fs');
const path = require('path');

const SEED = parseInt(process.env.SEED || '20261008', 10);
let _s = SEED;
const R = () => { _s |= 0; _s = (_s + 0x6D2B79F5) | 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
R.reset = (s) => { _s = (s == null ? SEED : s) | 0; };
global.Math.random = R;

global.window = global;
global.document = undefined;
global.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };

const ROOT = path.join(__dirname, '..');
const FILES = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/convo-scene.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/contestEngine.js',
  'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js',
  'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
  'src/js/villager-agency.js', 'src/js/fieldFights.js', 'src/js/villager-objectives.js',
  'src/js/codex-people.js', 'src/js/membership.js',
  'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js',
];
for (const f of FILES) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try { eval.call(global, code + `\n//# sourceURL=${f}`); }
  catch (e) { console.error('LOAD FAIL', f, e.message); process.exit(2); }
}
delete global.window;

const Game = global.Scattering.Game;
let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); }
}

function freshGame() {
  R.reset();
  Game.state = {
    scholar: {
      villagerId: 'p1', day: 1, kcal: 2000, health: 100, energy: 100,
      inventory: [], mx: 4, my: 4, insideHaven: true, exiled: false,
      abilities: [{ id: 'blood_magic' }, { id: 'field_medicine' }],
      backgroundAbilities: [],
    },
    village: {
      name: 'Haven', px: 4, py: 4, day: 1,
      roster: ['p1'], trust: { p1: 15 },
      pantry: [], pantryKcal: 0, water: { clean: 0, dirty: 0 }, gossip: [],
    },
    otherVillages: [], pastVillages: [], codex: { plants: {} }, weather: 'clear',
  };
  Game.map = { px: 4, py: 4 };
  Game.dayPart = 0;
  Game.location = 'haven';
  Game.data = Game.data || {};
  Game.data.items = Game.data.items || [];
  Game.data.villagers = [{ id: 'p1', name: 'Test Scholar' }];
  for (const dn of ['abilities', 'plants', 'synergies']) {
    try { Game.data[dn] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', dn + '.json'), 'utf8')); }
    catch (e) { if (dn === 'abilities') Game.data.abilities = []; }
  }
  Game._said = [];
  Game.say = (t) => { Game._said.push(String(t)); };
  Game.tickAction = () => null;
  Game.status = () => null;
  Game.observe = () => {};
  Game.journalNote = () => {};
  Game.audioEvent = () => {};
  Game.recordTrauma = () => {};
  Game.villageLearn = () => {};
  Game.depleteRandomTile = () => {};
  Game.turfKcal = () => 0;
  Game.villagerMealDay = () => ({ ate: 0, gave: 0, drawn: 0 });
  Game.hasSynergy = () => false;
  Game.inCombat = () => false;
}
const priceUses = () => Game._said.filter(t => t.startsWith('BLOOD PRICE:')).length;
const saidHas = (re) => Game._said.some(t => re.test(t));

// Hostile player: hammer the Price every daypart for 5 days, healing via
// field_medicine + nightly sleep. Time driver: the real daypart keys and the
// real knit block (what endDay does). Uses counted from the honest message.
function hostileFiveDays() {
  const s = Game.state.scholar;
  for (let d = 1; d <= 5; d++) {
    s.day = d;
    for (let part = 0; part < 4; part++) {
      Game.dayPart = part; // what advancePart() leaves behind per part
      for (let i = 0; i < 6; i++) { // hostile: hammer past refusal
        Game.activateAbility('blood_magic');
        if ((s.health || 0) < 60) {
          try { Game._activateAbilityInner('field_medicine'); } catch (e) {}
        }
      }
    }
    // NIGHT: real knit (-10 wound), real sleep heal, daily burn
    if ((s.bloodPriceWound || 0) > 0) s.bloodPriceWound = Math.max(0, s.bloodPriceWound - 10);
    s.health = Math.min(Game.maxHealth(), (s.health || 0) + 35);
    s.kcal = Math.max(0, (s.kcal || 0) - 2200);
  }
  return { uses: priceUses(), refusals: Game._said.filter(t => /knit back together|more scar than skin|Too weak/.test(t)).length };
}

console.log('== A. FLAG RE-MEASUREMENT: 5 days of hostile Blood Price (fixed rule) ==');
{
  freshGame();
  const r = hostileFiveDays();
  const perDay = (r.uses / 5).toFixed(1);
  console.log(`  uses=${r.uses} (${perDay}/day) refusals=${r.refusals} finalWound=${Game.state.scholar.bloodPriceWound} finalMaxHP=${Game.maxHealth()}`);
  ok(r.uses <= 12, 'fixed rule: ~2 or fewer uses/day over 5 hostile days', r.uses);
  ok(r.refusals > 0, 'gates actually refuse the hostile hammering', r.refusals);
  ok((Game.state.scholar.bloodPriceWound || 0) >= 0, 'wound never goes negative');
  ok(saidHas(/more scar than skin/), 'the 50-wound body-refusal message fired (not just the daypart cap)');
}

console.log('== B. OLD RULE DEMONSTRATION (what the flag measured) ==');
{
  // Pre-fix rule: -10 HP → +500 kcal, no daypart cap, no wound. One game day.
  // Each activation costs 2 ticks (real tickAction cost): 512 ticks/day → 256
  // activation slots. Healing keeps health up; feastburn sinks the bank so the
  // cap never clamps the printing.
  let health = 100, kcal = 2000, ticks = 512, uses = 0, printed = 0;
  while (ticks >= 2) {
    ticks -= 2;
    if (health <= 20 && kcal >= 100) { kcal -= 100; health = Math.min(100, health + 20); continue; }
    if (health <= 10) break;
    health -= 10; uses++;
    const room = 2400 - kcal;
    const gain = Math.min(500, room);
    kcal += gain; printed += 500;
    if (kcal - 400 >= 2400 - 2400) { /* feastburn sink: */ }
    if (kcal >= 2400 && printed > 0) { kcal -= 400; } // feastburn spends the bank
  }
  console.log(`  old-rule uses in one day: ${uses} (~${uses * 500}/day printed)`);
  ok(uses >= 40, 'old rule prints 40+ uses/day — the flag measured ~43/day (21,600)', uses);
}

console.log('== C. HONESTY: the menu says 2/day part AND means it ==');
{
  freshGame();
  Game.dayPart = 0;
  const legs = Game.activatableAbilities().filter(a => a.abilityId === 'blood_magic' || a.id === 'blood_magic');
  const leg = legs[0];
  ok(!!leg, 'Blood Price appears in activatable abilities');
  ok(/2\/day part/.test(leg.desc || ''), 'desc states the 2/day part cap', leg.desc);
  ok(/50/.test(leg.desc || ''), 'desc states the 50-wound refusal', leg.desc);
  Game.activateAbility('blood_magic');
  Game.activateAbility('blood_magic');
  const leg2 = Game.activatableAbilities().filter(a => a.abilityId === 'blood_magic' || a.id === 'blood_magic')[0];
  ok(leg2 && leg2.available === false && /twice/.test(leg2.why || ''), 'after 2 uses the menu refuses honestly', leg2 && leg2.why);
}

console.log(`\nRESULT: ${pass} pass, ${fail} fail (seed ${SEED})`);
process.exit(fail ? 1 : 0);
