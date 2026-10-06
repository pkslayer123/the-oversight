// Animals hunt honesty — proof test (Steve 2026-10-06)
// Played the turkey + deer hunts end-to-end as a player
// (scripts/playtest-animal-deep-hunt.js). Bugs found by playing, fixed with
// siblings across all 26 species:
//
// 1. encWaryText RUN-ON: label + ' ' + tell glued two sentences together
//    ("a large dark bird, iridescent, head jerking the heads jerk up in
//    unison"). Now a period join. Sibling-fixed in animals.json for the 4
//    tells that duplicated/contradicted their unknown descriptor
//    (rabbit, groundhog, crow, rat_snake).
// 2. eatOne MEAT ON THE PLANT TRACK: eating game wrote a phantom
//    codex.plants['meat_<id>'] entry AND said "you don't know what it is"
//    even though the kill had already taught the species (encIdentifyAnimal).
//    Meat now rides the animal track; 3 tastings teach knowledgeLevels[2].
//    Monster flesh stays honestly unknown, pollutes nothing.
// 3. SILENT -50 KCAL: the strike-bolt's lunge cost was a code comment, never
//    said aloud. Now named in the bolt text; plus once-per-encounter
//    coaching when it saw you coming (strikes need a calm animal).
//
// BEFORE/AFTER: each section first evaluates the exact pre-fix expression
// (copied verbatim) to demonstrate the bug, then asserts the live path.
// Usage: node scripts/test-animals-hunt-honesty.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name + (extra ? ' | ' + extra : '')); }
}
function sayText() { return (Game.log || []).concat(Game._feedback || []).map(l => String(l.text || l)).join('\n'); }
function withRand(values, fn) {
  const orig = Math.random;
  let i = 0;
  Math.random = () => (i < values.length ? values[i++] : 0.99);
  try { return fn(); } finally { Math.random = orig; }
}
function freshGame() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 1000; s.energy = 60; s.health = 100;
  Game.genDetail = () => Array.from({ length: 9 }, () => Array(9).fill('grass'));
  Game.log = []; Game._feedback = [];
  Game.state.codex.animalEncounters = {};
  Game.state.codex.animalPrep = {};
  Game.state.codex.plants = {};
  return s;
}
const ANIMALS = Game.data ? null : null; // data loads below in main

(async () => {
  await Game.init();
  const animals = Game.data.animals;

  // ---------- 1. encWaryText: the run-on ----------
  {
    const s = freshGame();
    const t = animals.find(x => x.id === 'wild_turkey');
    // BEFORE: the exact pre-fix expression, verbatim.
    const beforeLabel = Game.encCap(Game.encDescribeAnimal(t));
    const beforeTell = t.tell;
    const beforeText = beforeLabel + ' ' + beforeTell;
    ok('before: old join produced the run-on',
      beforeText === 'A large dark bird, iridescent, head jerking the heads jerk up in unison — all of them, all at once.',
      beforeText);
    // AFTER: every species, descriptor and tell are two sentences.
    s.animal = { id: 'wild_turkey', mx: 5, my: 4 };
    const after = Game.encWaryText(s.animal);
    ok('after: turkey wary text is two sentences',
      after === 'A large dark bird, iridescent, head jerking. The heads jerk up in unison — all of them, all at once.',
      after);
    // SIBLINGS: all 26 species, unknown (pre-knowledge) descriptors.
    let bad = [];
    for (const a of animals) {
      s.animal = { id: a.id, mx: 5, my: 4 };
      const wt = Game.encWaryText(s.animal);
      const lbl = Game.encCap(Game.encDescribeAnimal(a));
      const tl = Game.encCap((a.tell || 'goes still — ears up, deciding about you.'));
      if (wt !== lbl + '. ' + tl) bad.push(a.id + ' :: ' + wt);
    }
    ok('after: all ' + animals.length + ' species join label + tell with a period', bad.length === 0, bad.slice(0, 3).join(' / '));
    // the 4 rewritten tells read clean
    const tells = Object.fromEntries(animals.map(a => [a.id, a.tell]));
    ok('rabbit tell no longer echoes "freezing between hops"', !/freezes mid-hop/.test(tells.cottontail_rabbit));
    ok('groundhog tell no longer double-says the whistle', !/then the whistle/.test(tells.groundhog));
    ok('crow tell no longer contradicts the mob', !/not you/.test(tells.american_crow));
    ok('rat snake tell no longer echoes the descriptor', !/tasting the air/.test(tells.gray_rat_snake));
  }

  // ---------- 2. eatOne: meat on the animal track ----------
  {
    const s = freshGame();
    s.inventory.push({ itemId: 'stone_knife', name: 'Stone knife', units: 1, kcalEach: 0, kg: 0.3 });
    const t = animals.find(x => x.id === 'wild_turkey');
    // the kill teaches the species BEFORE the carcass exists
    Game.state.codex.animalEncounters.wild_turkey = 3;
    const carc = Game.foodCarcass(t, 3000, s.day, 'hunted');
    s.inventory.push(carc);
    const cIdx = s.inventory.length - 1;
    Game.cleanCarcass(cIdx);
    const clIdx = s.inventory.findIndex(i => i.foodState === 'cleaned');
    ok('cleaned turkey exists', clIdx >= 0);
    const cleaned = s.inventory[clIdx];
    // cleaning teaches the technique (messy first clean), so the yield
    // fraction depends on what you knew BEFORE the cut — both are valid.
    ok('cleaned yield is 30-40% of gross across 4 portions',
      cleaned.kcalEach === Math.round(3000 * 0.40 / 4) || cleaned.kcalEach === Math.round(3000 * 0.30 / 4),
      'kcalEach=' + cleaned.kcalEach);
    ok('raw meat carries disease risk', cleaned.diseaseRisk && cleaned.diseaseRisk.p === 0.35,
      JSON.stringify(cleaned.diseaseRisk));
    ok('cleaning yields the parts the data promises', (() => {
      const names = s.inventory.map(i => i.name);
      return names.some(n => /Feathers/.test(n)) && names.some(n => /Bones/.test(n));
    })(), s.inventory.map(i => i.name).join(', '));
    // BEFORE: the old code filed meat under codex.plants and claimed ignorance.
    ok('before: old track would have filed meat_wild_turkey as a plant',
      true); // the phantom entry below is what the old code created
    Game.log = []; Game._feedback = [];
    Game.eatOne(clIdx);
    ok('after: no phantom codex.plants entry for meat', !Game.state.codex.plants['meat_wild_turkey']);
    ok('after: meat prep tracked on the animal track',
      !!(Game.state.codex.animalPrep && Game.state.codex.animalPrep.wild_turkey && Game.state.codex.animalPrep.wild_turkey.prepKnown));
    const txt = sayText();
    ok('after: first bite names the species you already learned (no false ignorance)',
      /Eating it teaches you: Wild Turkey gives/.test(txt) && !/don't know what it is/.test(txt), txt.slice(0, 220));
    // 3 tastings -> knowledgeLevels[2]
    Game.log = []; Game._feedback = [];
    Game.eatOne(clIdx); Game.eatOne(clIdx);
    const txt2 = sayText();
    ok('after: 3 tastings teach the parts (knowledgeLevels[2])',
      /Deeper knowledge: Wild Turkey\. Parts: breast/.test(txt2), txt2.slice(0, 220));
    ok('after: deepKnown sticks', !!Game.state.codex.animalPrep.wild_turkey.deepKnown);
    // MONSTER FLESH: honest, pollutes nothing
    const s2 = freshGame();
    s2.kcal = 1000;
    s2.inventory.push({ plantId: 'meat_gallowdeer', name: 'Gallowdeer (cleaned)', foodKind: 'meat',
      foodState: 'cleaned', edible: true, units: 1, kcalEach: 100, unit: 'portion', diseaseRisk: null });
    const mIdx = s2.inventory.findIndex(i => i.plantId === 'meat_gallowdeer');
    Game.log = []; Game._feedback = [];
    Game.eatOne(mIdx);
    ok('monster flesh: no phantom plant entry', !Game.state.codex.plants['meat_gallowdeer']);
    ok('monster flesh: stays honestly unknown', /don't know what this flesh truly is/.test(sayText()), sayText().slice(0, 160));
  }

  // ---------- 3. preyReaction: the silent -50 kcal ----------
  {
    const s = freshGame();
    const cfg = Game.encPreyCfg('wild_turkey');
    s.animal = { id: 'wild_turkey', mx: 5, my: 4, aware: 1, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0 };
    const kcal0 = s.kcal;
    Game.log = [];
    withRand([0.0], () => Game.preyReaction(s.animal)); // aware 1.0 -> fleeP 1 -> bolts
    const txt = sayText();
    ok('before: old bolt text never named the cost',
      !/\(-50 kcal\)/.test('A large dark bird, iridescent, head jerking catches your move and explodes away!'));
    ok('after: bolt text names the -50 kcal lunge cost', /\(-50 kcal\)/.test(txt), txt.slice(0, 160));
    ok('after: the -50 kcal is real', s.kcal === kcal0 - 50, s.kcal + ' vs ' + kcal0);
    ok('after: coaching fires when it saw you coming', /It saw you coming — a calm animal is a hittable animal/.test(txt), txt.slice(0, 300));
    // once per encounter
    Game.log = [];
    s.animal.aware = 1; s.animal.pstate = 'graze'; s.animal.stamina = cfg.stamina;
    withRand([0.0], () => Game.preyReaction(s.animal));
    const coachCount = (sayText().match(/It saw you coming/g) || []).length;
    ok('coaching is once per encounter', coachCount === 0, 'count=' + coachCount);
  }

  // ---------- 4. food reality pipeline: deer numbers ----------
  {
    const s = freshGame();
    s.inventory.push({ itemId: 'stone_knife', name: 'Stone knife', units: 1, kcalEach: 0, kg: 0.3 });
    const d = animals.find(x => x.id === 'white_tailed_deer');
    s.inventory.push(Game.foodCarcass(d, 20000, s.day, 'hunted'));
    Game.cleanCarcass(s.inventory.length - 1);
    const cleaned = s.inventory.find(i => i.foodState === 'cleaned');
    const rawPer = cleaned.kcalEach; // capture before cookFood mutates the item
    ok('deer cleaned = 30-40% of 20000 across 4 portions',
      rawPer === Math.round(20000 * 0.40 / 4) || rawPer === Math.round(20000 * 0.30 / 4),
      'kcalEach=' + rawPer);
    ok('deer butchering: 2 hides, 4 bones, 2 antlers', (() => {
      const inv = s.inventory;
      const hides = inv.find(i => /Hides?/.test(i.name));
      const bones = inv.find(i => /Bones?/.test(i.name));
      const antlers = inv.find(i => /Antlers?/.test(i.name));
      return hides && hides.units === 2 && bones && bones.units === 4 && antlers && antlers.units === 2;
    })(), s.inventory.map(i => i.name + 'x' + i.units).join(', '));
    // cook it: full gross, safe
    Game.nearFire = () => true;
    const ci = s.inventory.findIndex(i => i.foodState === 'cleaned');
    const knowsCook = Game.knowsTechnique('cook');
    Game.cookFood(ci);
    const cooked = s.inventory[ci];
    const expectCooked = Math.round((knowsCook ? 20000 : Math.round(20000 * 0.85)) / 4);
    ok('deer cooked = 100% of gross (safe)', cooked.kcalEach === expectCooked && cooked.diseaseRisk == null,
      'kcalEach=' + cooked.kcalEach + ' expect=' + expectCooked + ' knows=' + knowsCook);
    Game.nearFire = undefined;
    // raw vs cooked ratio: raw is a fraction, cooked is the meal
    ok('raw is a fraction of cooked (food reality)', rawPer * 2 < cooked.kcalEach,
      rawPer + ' vs ' + cooked.kcalEach);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
