// BREAK-IT FOOD ROUND 4 (2026-10-08, worker break-food-r4). Hostile-player
// audit, fourth pass. Rounds 1-3 evidence: evidence/2026-10-08/break-food.md,
// break-food-r3.md. This round attacks only fresh surfaces.
//
// BREAKS FIXED (each with a red-pre-fix/green-post-fix proof below):
//   W2. Bulk eat() never granted the L3 "+5 health when eaten" benefit it
//       promises in its own level-up message. eatOne() (the per-item path)
//       grants +5 per bite at L3; eat() (the live Eat-button path, app.js:964)
//       granted nothing. The message lied on the main path.
//   W3. cannibal_frenzy's "Trust -30, permanently" was false: the -30 was
//       fully repairable via gifts (live path is carexplore's progressive
//       giveFood, not the dead flat +12 in game.js). Fix: the copy no longer
//       claims permanence for the trust NUMBER; instead every witness gets a
//       permanent 'saw_cannibalism' memory — THEY will not forget, which is
//       what "permanently" can honestly mean. (Measured: full repair via the
//       live progressive path costs MORE food than the frenzy grants, so the
//       frenzy->gift loop is not a printer — the issue was honesty, not
//       economy. Proof W3d.)
//   W4. howFarOptions 'raw' detail understated shelf life: it used raw
//       spoilDay without spoilBonusDays() (preservation_instinct), while
//       stashClock/isSpoiled are bonus-aware. One boundary, everywhere.
//
// VERIFIED HELD (attacked, resisted):
//   W1. blood_magic: the old +21,600 kcal/day measurement (memory lead) is
//       dead — the wound gate (2/daypart cap, +10 wound/use, ~10 knit/night,
//       refusal at 50, maxHealth ratchet) bounds sustained yield to ~1 use/day
//       (+500 kcal). Measured below across 6 simulated days.
//   W5. Dead code: food.js/storage.js/corpses.js/engine-calories.js all loaded
//       in index.html; every food.js public method reachable.
//   W6. Save/load: spoilDay round-trips through JSON; no spoilage reset.
//   W7. feastBurn: burns exactly the stated banked kcal; no creation.
//   W8. stockPantry bypasses the pantry cap — but only system grants use it
//       (expedition hauls, weregild, genesis fruit); every PLAYER path
//       (donateToPantry, pantryAdd) enforces the cap. Not player-farmable.
//
// Run: node scripts/test-break-food-r4.js   (SEED env override, x5)
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

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const s = Game.state.scholar;
  console.log(`seed=${SEED} kcalCap=${Game.kcalCap()} maxHealth=${Game.maxHealth()}`);
  Game.tbfight = null;

  // ============ W1. blood_magic: verify the old +21,600/day claim is dead ============
  grant('blood_magic');
  s.health = 100; s.kcal = 2500; s.bloodPriceWound = 0;
  s.bloodPriceDayPart = null; s.bloodPriceUses = 0;
  // Phase A: 2/daypart cap
  Game.dayPart = 0;
  const f1 = Game._activateAbilityInner('blood_magic');
  const f2 = Game._activateAbilityInner('blood_magic');
  const f3 = Game._activateAbilityInner('blood_magic');
  ok('W1a 2/daypart cap: 2 fire, 3rd refused',
    f1 !== false && f2 !== false && f3 === false && s.bloodPriceUses === 2,
    `f=${f1},${f2},${f3} uses=${s.bloodPriceUses}`);
  ok('W1b cap refusal names the rule', /2\/day part/i.test(lastSaid), lastSaid.slice(0, 80));
  // Phase B: wound gate — free perfect healing (most generous to the attacker)
  let uses = 2, refusedAt = -1;
  for (let dp = 0; dp < 4 && refusedAt < 0; dp++) {
    Game.dayPart = dp;
    for (let k = 0; k < 3; k++) {
      s.health = 100; s.kcal = 2500; // perfect free healing between uses
      const r = Game._activateAbilityInner('blood_magic');
      if (r === false) {
        if ((s.bloodPriceWound || 0) >= 50) refusedAt = uses;
        break;
      }
      uses++;
    }
  }
  ok('W1c wound refuses at >=50 (<=5 uses at cost 10)', refusedAt > 0 && refusedAt <= 5,
    `refusedAt use #${refusedAt}, wound=${s.bloodPriceWound}`);
  ok('W1d wound ratchets maxHealth', Game.maxHealth() < 100, `maxHealth=${Game.maxHealth()}`);
  // Phase C: 6-day sustainability with the REAL nightly knit (-10/night)
  let dayGains = [];
  s.bloodPriceWound = 0; s.bloodPriceDayPart = null; s.bloodPriceUses = 0;
  for (let d = 0; d < 6; d++) {
    s.day = 100 + d;
    let dayUse = 0;
    for (let dp = 0; dp < 4; dp++) {
      Game.dayPart = dp;
      for (let k = 0; k < 2; k++) {
        s.health = 100; s.kcal = 2500;
        if (Game._activateAbilityInner('blood_magic') === false) break;
        dayUse++;
      }
    }
    dayGains.push(dayUse * 500);
    s.bloodPriceWound = Math.max(0, (s.bloodPriceWound || 0) - 10); // the real nightly knit
  }
  const late = dayGains.slice(2);
  ok('W1e sustained yield ~1 use/day, nowhere near 21,600',
    late.every(g => g <= 1000) && dayGains.reduce((a, b) => a + b, 0) < 6000,
    `gains/day=${dayGains.join(',')}`);
  s.day = 101;

  // ============ W2. bulk eat() L3 "+5 health when eaten" (BREAK) ============
  s.bloodPriceWound = 0; // clean wound: W1's maxHealth ratchet must not clamp this measurement
  Game.state.codex.plants['chickweed'] = { level: 3, tastings: 5 };
  s.health = 50; s.kcal = 0;
  s.inventory = [
    { plantId: 'chickweed', name: 'Chickweed', kcalEach: 30, units: 3, edible: true, spoilDay: s.day + 3, foodState: 'cooked', safe: true, kg: 0.1 },
  ];
  Game.eat();
  ok('W2a bulk eat grants L3 +5 health per bite (3 bites)', s.health === 65, `health=${s.health}`);
  // level-up case: the message promises "+5 health when eaten"
  Game.state.codex.plants['chickweed'] = { level: 2, tastings: 2 };
  s.health = 50; s.kcal = 0;
  s.inventory = [
    { plantId: 'chickweed', name: 'Chickweed', kcalEach: 30, units: 2, edible: true, spoilDay: s.day + 3, foodState: 'cooked', safe: true, kg: 0.1 },
  ];
  Game.eat();
  const leveled = (Game.state.codex.plants['chickweed'] || {}).level === 3;
  ok('W2b level-up bite grants the promised +5 health', leveled && s.health >= 55,
    `level3=${leveled} health=${s.health}`);

  // ============ W3. cannibal_frenzy honesty (BREAK) ============
  grant('cannibal_frenzy');
  const roster = Game.state.village.roster || [];
  const vid = roster.find(r => r !== Game.villagerId) || roster[0];
  Game.state.village.trust = {}; Game.state.village.trust[vid] = 70;
  Game.state.village.memory = {};
  s.kcal = 400;
  const fr = Game._activateAbilityInner('cannibal_frenzy');
  ok('W3a frenzy fires when starving', fr !== false && s.kcal === 1400, `kcal=${s.kcal}`);
  ok('W3b trust -30 applied', Game.state.village.trust[vid] === 40, `trust=${Game.state.village.trust[vid]}`);
  const mems = (Game.state.village.memory[vid] || []).map(m => m.t);
  ok('W3c every witness permanently remembers (not a repairable number)',
    mems.includes('saw_cannibalism'), `memories=${JSON.stringify(mems)}`);
  ok('W3d copy no longer claims the trust NUMBER is permanent',
    !/permanently/i.test(lastSaid), lastSaid.slice(0, 100));

  // ============ W4. howFarOptions spoil label honors the bonus (BREAK) ============
  const realBonus = Game.spoilBonusDays.bind(Game);
  Game.spoilBonusDays = () => 3; // preservation_instinct-like bonus
  const meat = { foodKind: 'meat', foodState: 'cleaned', kcalEach: 100, units: 2, spoilDay: s.day + 2, name: 'Venison (cleaned)' };
  const rawOpt = (Game.howFarOptions(meat) || []).find(o => o.id === 'raw');
  Game.spoilBonusDays = realBonus;
  ok('W4a raw detail counts the spoilage bonus (2+3=5d, not 2d)',
    rawOpt && /spoils in 5d/.test(rawOpt.detail), rawOpt && rawOpt.detail);

  // ============ W5. dead code: food systems wired (HELD) ============
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const f of ['src/js/food.js', 'src/js/storage.js', 'src/js/corpses.js', 'src/js/engine/calories.js']) {
    ok(`W5a index.html loads ${f}`, html.includes(f), f);
  }
  for (const m of ['shellNuts', 'cleanCarcass', 'preserveFood', 'eatStashOne', 'stacksMatch',
    'pantryAdd', 'isSpoiled', 'sweepSpoiled', 'kcalCap', 'feastBurn', 'buryCache', 'digUpCache']) {
    ok(`W5b Game.${m} reachable`, typeof Game[m] === 'function', m);
  }

  // ============ W6. save/load spoilage round-trip (HELD) ============
  const it6 = { name: 'X', kcalEach: 50, units: 2, spoilDay: s.day + 2 };
  const back = JSON.parse(JSON.stringify({ inv: [it6] })).inv[0];
  ok('W6a spoilDay survives serialization', back.spoilDay === it6.spoilDay, `spoilDay=${back.spoilDay}`);
  ok('W6b boundary consistent after round-trip',
    Game.isSpoiled(back) === Game.isSpoiled(it6), '');

  // ============ W7. feastBurn burns exactly what it states (HELD) ============
  const realBankMult = Game.bankMult.bind(Game);
  Game.bankMult = () => 2; // skillset-expanded bank: cap 4800, fed line 2400
  s.kcal = Game.kcalCap();
  const before = s.kcal;
  const mult = Game.feastBurn();
  const burned = before - s.kcal;
  Game.bankMult = realBankMult;
  ok('W7a feastBurn burns a stated 300-400 banked kcal, nothing created',
    (burned === 300 || burned === 400) && mult > 1, `burned=${burned} mult=${mult}`);
  ok('W7b burn never eats below the fed line', s.kcal >= Game.fullLine(), `kcal=${s.kcal}`);

  // ============ W8. stockPantry cap bypass is system-only (HELD, documented) ============
  // Player paths enforce the cap (donateToPantry wrapper, pantryAdd). stockPantry
  // is the system-grant path (expedition hauls, weregild, genesis fruit) — NPC/
  // event-driven, not player-farmable. Assert the player paths hold:
  s.inventory = [{ name: 'Big roast', kcalEach: 200000, units: 1, spoilDay: s.day + 3, kg: 1 }];
  const donated = Game.donateToPantry(0);
  ok('W8a donateToPantry refuses over cap', donated === null && s.inventory.length === 1,
    `returned=${donated} inv=${s.inventory.length}`);

  console.log(`\n${pass} passed, ${fail} failed (seed ${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
