// ADVERSARIAL FORAGER RUN (Steve 2026-10-08 playtest loop, hostile player).
// Target: the FOOD ECONOMY. Every assertion tries to break something:
//
//   (1) THE ENGINE — blood_magic's 2/daypart cap (prior run) STILL printed
//       ~+1,500 kcal/day at zero net HP: the Price self-throttles (too weak to
//       pay) and best sleep heals 35, so the loop ran forever at 2/3 of a
//       day's food — a true infinite engine, not min-maxing. THE FIX (v2,
//       design gate, ability NOT deleted): the Price's cut is missing mass —
//       maxHealth() drops while the wound is open, it knits ~10/night, the
//       body refuses past 50 wound, and field_medicine heals real wounds only
//       (its cap is the wound-aware maxHealth). Sustainable: ~1 use/day
//       (+500 kcal — a real min-max edge, not dinner). Emergency use untouched.
//       Steve can overrule the call.
//   (2) BYPASSES — crimson_circuit synergy path, UI-listing honesty (cap +
//       wound refusal in `available`), bank-cap clamps on every kcal source
//       (cannibal_frenzy, photosynthesis, cold_blooded were unclamped),
//       second_wind refuse_death farming.
//   (3) SOFTLOCKS — edibility test while dying/poisoned, starvation edges.
//   (4) HONESTY — button copy vs engine in the forage/cook path; failed
//       activations grant no XP (regression).
//
// Run pre-fix : red  (engine nets ~+1,500 kcal/day at zero net HP)
// Run post-fix: green (sustainable ~+500/day; wound wall throttles harder farming)
//   node scripts/test-forager-adversarial-20261008.js   (SEED env override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261008', 10);
Math.random = mulberry32(SEED); // seed BEFORE eval: modules capture Math.random at load
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = {
  getElementById: () => null,
  createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} }, body: {},
};
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function grant(id) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  let e = s.abilities.find(a => a.id === id);
  if (!e) { e = { id, name: id, level: 1, xp: 0 }; s.abilities.push(e); }
  return e;
}
let lastSaid = '';
const origSay = Game.say.bind(Game);
Game.say = (t) => { lastSaid = String(t); return origSay(t); };
function freshDayPart() {
  // Advance one full day part via the engine's own clock.
  Game.endDayPart();
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  console.log(`seed=${SEED} dayPart=${Game.dayPart} maxHealth=${Game.maxHealth()}`);

  // ============ 1. THE ENGINE — v2 gate: the Price's cut is missing mass.
  // maxHealth() drops while the wound is open; it knits ~10/night; the body
  // refuses past 50 wound; field_medicine heals real wounds only (its cap is
  // the wound-aware maxHealth). Hostile claim: farm the Price forever.
  // v2 economics: +10 wound/use, -10 knit/night → ~1 use/day sustainable
  // (+500 kcal: a real min-max edge, not dinner). Farming harder ratchets max
  // HP down until the body refuses.
  grant('blood_magic'); grant('field_medicine');
  const cap0 = (typeof Game.kcalCap === 'function') ? Game.kcalCap() : 1e9;
  const baseMax = Game.maxHealth();
  s.health = baseMax; s.kcal = 0; s.bloodPriceWound = 0;
  s.bloodPriceDayPart = undefined; s.bloodPriceUses = 0; s.fieldMedDayPart = undefined;
  const hp0 = s.health, k0 = s.kcal;
  function hostileDayPart() {
    for (let i = 0; i < 60; i++) {
      const bk = s.kcal, bh = s.health;
      Game.activateAbility('blood_magic');
      const bmf = (s.kcal > bk) || (s.health < bh);
      const bk2 = s.kcal, bh2 = s.health;
      Game.activateAbility('field_medicine');
      const fmf = (s.kcal < bk2) || (s.health > bh2);
      if (!bmf && !fmf) break; // both refused — spent
    }
  }
  for (let part = 0; part < 4; part++) { hostileDayPart(); if (part < 3) freshDayPart(); }
  const netKcal = s.kcal - k0, netHP = s.health - hp0;
  const ecost = (Game.hasSynergy && Game.hasSynergy('crimson_circuit')) ? 7 : 10;
  console.log(`  farmed day: netKcal=${netKcal} netHP=${netHP} wound=${s.bloodPriceWound} effMax=${Game.maxHealth()} (cap=${cap0})`);
  // The 50-wound wall bites mid-farm: a single day tops out at ~5-8 uses.
  ok('wound wall caps a max-farmed day (never past 50 + one use)', s.bloodPriceWound <= 50 + ecost, `wound=${s.bloodPriceWound}`);
  ok('max HP ratchets down with the wound', Game.maxHealth() === baseMax - s.bloodPriceWound, `effMax=${Game.maxHealth()}`);
  ok('the Price is really paid: farmed day costs >= 40 HP net', netHP <= -40, `netHP=${netHP}`);
  ok('kcal never exceeds the bank cap', s.kcal <= Game.kcalCap(), `kcal=${s.kcal} cap=${Game.kcalCap()}`);

  // The body refuses past 50 wound — the farm hits a wall, honestly narrated.
  s.bloodPriceDayPart = undefined; s.bloodPriceUses = 0; s.fieldMedDayPart = undefined;
  s.health = Game.maxHealth(); // top up to current (reduced) max
  const hBefore = s.health, wBefore = s.bloodPriceWound;
  Game.activateAbility('blood_magic');
  ok('body refuses past 50 wound', s.health === hBefore && s.bloodPriceWound === wBefore, `hp ${hBefore}->${s.health}`);
  ok('refusal is honest (says why)', /scar|knit/i.test(lastSaid), lastSaid.slice(0, 80));

  // Sustainable rate: 1 use/day vs 10 knit/night → wound hovers ~10, ~full HP.
  // Simulate 6 days with best-case sleep (+35) and the engine's own knit rule.
  s.bloodPriceWound = 0; s.health = baseMax; s.kcal = 0;
  let susKcal = 0;
  for (let d = 0; d < 6; d++) {
    s.bloodPriceDayPart = undefined; s.bloodPriceUses = 0;
    const bk = s.kcal;
    Game.activateAbility('blood_magic'); // exactly 1/day
    susKcal += (s.kcal - bk);
    s.bloodPriceWound = Math.max(0, (s.bloodPriceWound || 0) - 10); // the knit rule
    s.health = Math.min(Game.maxHealth(), s.health + 35); // best bunk sleep
  }
  console.log(`  6 days x 1 use/day: +${susKcal} kcal total, wound=${s.bloodPriceWound}, hp=${s.health}/${Game.maxHealth()}`);
  ok('sustainable rate is ~500 kcal/day (a snack, not dinner)', susKcal <= 3200, `+${susKcal}/6d`);
  ok('sustainable rate keeps the body ~whole', s.bloodPriceWound <= 10 && s.health >= baseMax - 20, `wound=${s.bloodPriceWound} hp=${s.health}`);

  // Unsustainable rate: 2 attempts/day outruns the knit → the wound wall
  // throttles real fires back toward ~1/day. Count fires via bloodPriceUses
  // (exact — immune to stray kcal from the world sim). Judge the STEADY STATE
  // (days 12-19), not the buildup transient.
  s.bloodPriceWound = 0; s.health = baseMax; s.kcal = 0;
  let lateFires = 0;
  for (let d = 0; d < 20; d++) {
    s.bloodPriceDayPart = undefined; s.bloodPriceUses = 0; s.fieldMedDayPart = undefined;
    s.health = Game.maxHealth(); s.kcal = 0;
    Game.activateAbility('blood_magic'); Game.activateAbility('blood_magic');
    if (d >= 12) lateFires += (s.bloodPriceUses || 0);
    s.bloodPriceWound = Math.max(0, s.bloodPriceWound - 10); // the knit rule
    s.health = Math.min(Game.maxHealth(), s.health + 35); // best bunk sleep
  }
  console.log(`  20 days x 2 attempts/day: steady-state fires (d12-19) = ${lateFires}, wound=${s.bloodPriceWound}`);
  ok('2/day attempts throttle to ~1/day in steady state', lateFires <= 10, `fires=${lateFires}`);

  // Unit checks: field_medicine heals real wounds, not Price wounds (v2: the
  // wound-aware maxHealth does the excluding by construction).
  s.day = 99; s.bloodPriceWound = 20; // effMax = base-20
  s.health = Game.maxHealth(); s.kcal = 2000; s.fieldMedDayPart = undefined;
  Game.activateAbility('field_medicine');
  ok('field_medicine heals 0 when all damage is Price wound', s.health === baseMax - 20, `hp=${s.health}`);
  s.health = baseMax - 30; s.kcal = 2000; s.fieldMedDayPart = undefined; // 10 real + 20 wound
  Game.activateAbility('field_medicine');
  ok('field_medicine still heals the 10 real HP alongside Price wounds', s.health === baseMax - 20, `hp=${s.health}`);
  // Emergency use intact: 2x from clean = +1000 kcal, -20 max HP, knits in 2 nights.
  s.bloodPriceWound = 0; s.health = baseMax; s.kcal = 0;
  s.bloodPriceDayPart = undefined; s.bloodPriceUses = 0;
  Game.activateAbility('blood_magic'); Game.activateAbility('blood_magic');
  ok('emergency 2x still works: +1000 kcal for -20 max HP', s.kcal === 1000 && Game.maxHealth() === baseMax - 20, `kcal=${s.kcal} effMax=${Game.maxHealth()}`);

  // ============ 2a. crimson_circuit synergy path still capped ============
  s.bloodPriceDayPart = undefined; s.bloodPriceUses = 0;
  s.bloodPriceWoundDay = undefined; s.bloodPriceWound = 0;
  // hasSynergy reads sch.activeSynergies — grant it the way the engine does.
  s.activeSynergies = s.activeSynergies || [];
  if (!s.activeSynergies.includes('crimson_circuit')) s.activeSynergies.push('crimson_circuit');
  const c0 = s.bloodPriceUses || 0; s.health = Game.maxHealth(); s.kcal = 0;
  const kb = s.kcal, hb = s.health;
  for (let i = 0; i < 10; i++) Game.activateAbility('blood_magic');
  const cost = Game.hasSynergy && Game.hasSynergy('crimson_circuit') ? 7 : 10;
  const hpSpent = hb - s.health, kcalGot = s.kcal - kb;
  console.log(`  synergy cost=${cost}: hpSpent=${hpSpent} kcalGot=${kcalGot}`);
  ok('synergy path honors 2/daypart cap', hpSpent <= cost * 2 && kcalGot <= 1000, `hpSpent=${hpSpent} kcalGot=${kcalGot}`);

  // ============ 2b. UI listing is honest about the cap ============
  const list = Game.activatableAbilities();
  const bm = list.find(a => a.id === 'blood_magic');
  ok('blood_magic listed with cap copy', !!bm && /2\/day part/.test(bm.desc || ''), bm && bm.desc);
  ok('blood_magic listed unavailable after 2 uses', bm && bm.available === false, `available=${bm && bm.available}`);

  // ============ 2c. photosynthesis: exactly +100 per daylight part ============
  // Measure against a control: same seeded RNG, same clock, ability removed
  // vs granted. The difference must be exactly the grant — no more.
  grant('photosynthesis');
  function daylightDelta() {
    // advancePart() directly: exactly one part transition (endDayPart's 128
    // ticks can cross two boundaries from a mid-part clock offset).
    Game.dayPart = 0;
    s.kcal = 500; s.bloodPriceWound = 0; s.health = 100;
    Math.random = mulberry32(SEED); // deterministic: identical random path
    const k = s.kcal;
    Game.advancePart();
    return s.kcal - k;
  }
  const abIdx = s.abilities.findIndex(a => a.id === 'photosynthesis');
  const savedPhoto = s.abilities.splice(abIdx, 1)[0];
  const control = daylightDelta();
  s.abilities.push(savedPhoto);
  const withPhoto = daylightDelta();
  console.log(`  photosynthesis daylight advance: control=${control} with=${withPhoto} (grant=${withPhoto - control})`);
  ok('photosynthesis grants exactly +100 per daylight part', withPhoto - control === 100, `grant=${withPhoto - control}`);
  // Bank-cap honesty: near-full bar + sunlight must not overfill.
  Game.dayPart = 0; s.kcal = Game.kcalCap() - 50; s.bloodPriceWound = 0; s.health = 100;
  Game.advancePart();
  ok('photosynthesis cannot overfill the bank cap', s.kcal <= Game.kcalCap(), `kcal=${s.kcal} cap=${Game.kcalCap()}`);
  ok('photosynthesis honesty: desc promises per-daylight-part, engine grants exactly that',
    (Game.data.abilities.find(a => a.id === 'photosynthesis') || {}).description.indexOf('/hour') < 0,
    'desc=' + (Game.data.abilities.find(a => a.id === 'photosynthesis') || {}).description);

  // ============ 2e. cannibal_frenzy + second_wind respect the bank cap ============
  grant('cannibal_frenzy');
  s.kcal = 400; // starving: the Red Hunger wakes
  s.day = 100; s.bloodPriceWoundDay = 100; s.bloodPriceWound = 0;
  Game.activateAbility('cannibal_frenzy');
  ok('cannibal_frenzy cannot overfill the bank cap', s.kcal <= Game.kcalCap(), `kcal=${s.kcal} cap=${Game.kcalCap()}`);

  // ============ 2d. second_wind refuse_death: once/day, not farmable ============
  grant('second_wind');
  s.health = Game.maxHealth(); s.kcal = 1000;
  s.secondWindDay = undefined; s.secondWindUses = 0;
  let deaths = 0;
  for (let i = 0; i < 3; i++) {
    s.health = 0;
    const cheated = Game.maybeCheatDeath();
    if (cheated && s.health === 1) deaths++;
    else s.health = 0; // stays dead / not cheated
  }
  console.log(`  refuse_death triggers same day: ${deaths}`);
  ok('refuse_death fires at most once per day', deaths <= 1, `fired ${deaths}x`);

  // ============ 3a. SOFTLOCK: edibility test while dying/poisoned ============
  // testCautiously(idx, opts, container) — the universal edibility test
  // (DIRECTIVES: always available from the pack anywhere, always honest).
  // Hostile angle: run the full careful AND rushed protocol at 1 HP while
  // poisoned, on a known-'avoid' plant lump. It must never throw, NaN, or
  // strand the player; its risks must stay non-lethal as promised.
  {
    const avoidPlant = (Game.data.plants || []).find(p => p.edibility === 'avoid' && !Game.plantKnown(p.id));
    if (avoidPlant) {
      for (const rush of [false, true]) {
        const cont = [{ name: 'weird lump', lump: { [avoidPlant.id]: { units: 3 } } }];
        s.health = 1; s.energy = 100; s.kcal = 500;
        s.poisons = [{ id: 'test', name: 'test poison' }];
        let threw = false, msg = '';
        try { Game.testCautiously(0, { rush }, cont); }
        catch (e) { threw = true; msg = e.message; }
        const bad = threw || Number.isNaN(s.health) || Number.isNaN(s.kcal) || Number.isNaN(s.energy);
        ok(`edibility test (${rush ? 'rushed' : 'careful'}) at 1HP poisoned: no throw/NaN`, !bad, msg || `hp=${s.health} kcal=${s.kcal}`);
        ok(`edibility test (${rush ? 'rushed' : 'careful'}) is non-lethal as promised`, s.health >= 1, `hp=${s.health}`);
        s.poisons = [];
      }
    } else { console.log('  SKIP edibility: no unknown avoid-plant found'); }
  }

  // ============ 3b. SOFTLOCK: starvation edge — eat at 0 kcal ============
  s.kcal = 0; s.health = 50;
  let nan = false;
  try {
    if (typeof Game.eatFood === 'function') Game.eatFood();
    nan = Number.isNaN(s.kcal) || Number.isNaN(s.health);
  } catch (e) { console.log(`  eatFood at 0 kcal threw: ${e.message}`); nan = true; }
  ok('starvation edge: no NaN kcal/health', !nan, `kcal=${s.kcal} hp=${s.health}`);

  // ============ 4. HONESTY: failed blood_magic grants no XP (regression) ============
  s.bloodPriceDayPart = undefined; s.bloodPriceUses = 0; s.health = 1;
  const ab = grant('blood_magic');
  const xp0 = ab.xp || 0;
  Game.activateAbility('blood_magic'); // should fail: too weak
  ok('failed blood_magic grants no ability XP', (ab.xp || 0) === xp0, `xp ${xp0} -> ${ab.xp}`);

  console.log(`\n${pass} passed, ${fail} failed (seed=${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
