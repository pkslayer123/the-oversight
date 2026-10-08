// Miser playtest: THE PICKPOCKET ARC — live by theft for several days.
// Steve's rule: theft allowed, socially punished. This plays the whole arc:
// unseen steal -> notice sweep -> suspicion -> cold shoulder -> confrontation,
// plus the caught path, the empty-pack honesty, and the same-day farming gap.
// Seeded RNG (mulberry32, SEED env) for aggregates; stubbed RNG for branches.
// Usage: node scripts/play-feel-20261007-miser-thief.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // deleted before play (AGENTS.md)
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js',
 'src/js/journal.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

// --- seeded RNG ---
const SEED = parseInt(process.env.SEED || '20261007', 10);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const realRandom = Math.random;
const setRand = (fn) => { Math.random = fn; };
const seeded = () => setRand(mulberry32(SEED));
const restoreRand = () => { Math.random = realRandom; };

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name, extra === undefined ? '' : String(extra).slice(0, 300)); }
}

let said = [];
const ME = () => Game.state.scholar.villagerId;
const others = () => (Game.state.village.roster || []).filter(id => id !== ME());
const V = () => Game.state.village;
function freshGame() {
  said = [];
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.say = (t) => { said.push(String(t)); };
  Game.depart();
  Game.state.scholar.inventory = [];
  try { Game.state.scholar.tile = { type: 'haven' }; } catch (e) {}
}
// fatten a villager's pack to a known value
function fatPack(vid, kcal) {
  V().pack = V().pack || {};
  V().pack[vid] = { day: Game.state.scholar.day, kcal };
}
// run one part like the real clock (positions first, per famine play)
function onePart() {
  try { Game.ensureVillagerPositions(); } catch (e) {}
  try { Game.advancePart(); } catch (e) { console.log('  advancePart err: ' + e.message); }
}
const packKcalNow = (vid) => (V().pack && V().pack[vid] && V().pack[vid].kcal) || 0;
const trustOf = (vid) => (V().trust || {})[vid] || 0;

(async () => {
  await Game.init();

  // ============ SCENE 1: the unseen steal ============
  freshGame();
  const mark = others()[0];
  fatPack(mark, 1200);
  Game.state.scholar.ap = 5;
  Game.dayPart = 0;
  const hungerBefore = Game.npcNeeds(mark).hunger || 0;
  const trustBeforeSteal = trustOf(mark);
  setRand(() => 0.99); // detection roll always passes (chance 0.35-0.55)
  const r1 = Game.stealFrom(mark);
  restoreRand();
  ok('unseen steal returns unseen', r1 === 'unseen', r1);
  const stolen = Game.state.scholar.inventory.find(i => i.name === 'Stolen rations');
  ok('stolen rations land in inventory', !!stolen, JSON.stringify(Game.state.scholar.inventory).slice(0, 120));
  ok('stolen stack is marked stolen', !!(stolen && stolen.stolen), '');
  ok('stolen stack has a spoil clock', !!(stolen && stolen.spoilDay), '');
  ok('take is 300-600 kcal (units*150)', stolen && stolen.units * 150 >= 300 && stolen.units * 150 <= 600, stolen && stolen.units);
  ok('victim hunger rises (they feel it)', (Game.npcNeeds(mark).hunger || 0) > hungerBefore, '');
  ok('pack drained', packKcalNow(mark) < 1200, packKcalNow(mark));
  ok('theft recorded for the sweep', !!(V().packTheft && V().packTheft[mark] && !V().packTheft[mark].noticed), '');
  ok('say line is dramatic, not mechanical', said.some(t => /looking the other way/i.test(t)), said.join(' | ').slice(0, 200));
  const trustAfterSteal = trustOf(mark);
  ok('no trust hit before notice', trustAfterSteal === trustBeforeSteal, trustAfterSteal);

  // ============ SCENE 2: the notice sweep — hunger audits ============
  said = [];
  onePart(); // part 0 -> 1; sweep qualifies (theft was part 0, now part 1)
  ok('victim notices next part', said.some(t => /going through their pack/i.test(t)), said.join(' | ').slice(0, 240));
  ok('notice names the suspicion honestly', said.some(t => /Someone took my rations/i.test(t)), '');
  ok('notice costs trust (-15, clamped)', trustOf(mark) === Math.max(0, trustAfterSteal - 15), trustOf(mark));
  const mems = (V().memory || {})[mark] || [];
  ok('victim remembers suspecting you', JSON.stringify(mems).indexOf('suspects_you_stealing') >= 0, '');
  ok('crime on the books (unwitnessed)', (Game.justiceState().crimes || []).some(c => c.type === 'theft' && c.victim === mark), '');
  ok('justice heat 15 after one theft', Game.justiceHeat() === 15, Game.justiceHeat());
  ok('no double notice on later parts', (() => { said = []; onePart(); return !said.some(t => /going through their pack/i.test(t)); })(), '');

  // ============ SCENE 3: the arc — 4 thefts -> cold shoulder -> confrontation -> moot ============
  // The ladder self-drives: justiceTick runs after every advancePart, so the
  // whole arc must appear in the normal transcript with no manual ticks.
  freshGame();
  Game.state.scholar.ap = 99;
  setRand(() => 0.99);
  for (const vid of others().slice(0, 4)) { fatPack(vid, 1500); Game.stealFrom(vid); }
  restoreRand();
  said = [];
  // notices fire a part later; measure heat right after they land, before
  // the long arc loop (later parts add trust drift / judged-crime halves).
  // Collect the transcript from the very first part: the cold shoulder fires
  // on the first advancePart once heat crosses 25.
  const arcLines = [];
  const collectPart = () => { const n0 = said.length; onePart(); arcLines.push(...said.slice(n0)); };
  collectPart(); collectPart();
  const heatNow = Game.justiceHeat();
  ok('four unseen thefts = 60 heat once noticed', heatNow === 60, heatNow);
  for (let i = 0; i < 10 && Game.justiceStage() < 3; i++) collectPart();
  const arc = arcLines.join(' | ');
  ok('arc: cold shoulder scene plays on its own', /Something has shifted/i.test(arc), '');
  ok('arc: journal records the quiet', /gone quiet/i.test(arc), '');
  ok('arc: confrontation scene plays on its own', /⚖/i.test(arc), '');
  ok('arc: confrontation names the thefts', /theft|taking|stores/i.test(arc), '');
  // moot via heat>=70 OR the two-day silence timeout on the confrontation
  ok('arc: ladder reaches the moot (heat or silence timeout)', Game.justiceStage() >= 3, Game.justiceStage());
  console.log('  confrontation line:', (arc.match(/⚖[^|]{0,220}/) || ['(none)'])[0]);

  // ============ SCENE 4: caught red-handed ============
  freshGame();
  const mark2 = others()[1];
  fatPack(mark2, 1500);
  Game.state.scholar.ap = 5;
  Game.dayPart = 0;
  const trustB = trustOf(mark2);
  setRand(() => 0.0); // detection roll always fails
  const r4 = Game.stealFrom(mark2);
  restoreRand();
  ok('caught returns caught', r4 === 'caught', r4);
  ok('caught: trust -35 (clamped at 0)', trustOf(mark2) === Math.max(0, trustB - 35), trustOf(mark2));
  ok('caught: no food gained', !Game.state.scholar.inventory.some(i => i.name === 'Stolen rations'), '');
  ok('caught: pack NOT drained (you let go)', packKcalNow(mark2) === 1500, packKcalNow(mark2));
  ok('caught: remembered', JSON.stringify((V().memory || {})[mark2] || []).indexOf('caught_you_stealing') >= 0, '');
  ok('caught: crime recorded as witnessed', (Game.justiceState().crimes || []).some(c => c.type === 'theft' && c.caught === true), '');
  ok('caught line names the silence', said.some(t => /silence that follows is worse/i.test(t)), '');

  // ============ SCENE 5: honest empty pack ============
  freshGame();
  const mark3 = others()[2];
  fatPack(mark3, 50);
  Game.state.scholar.ap = 5;
  const r5 = Game.stealFrom(mark3);
  ok('empty pack refuses honestly', r5 === false && said.some(t => /nothing worth taking/i.test(t)), said.join(' | ').slice(0, 160));

  // ============ SCENE 6: same-part farming — is there a cooldown? ============
  freshGame();
  const mark4 = others()[3];
  fatPack(mark4, 5000);
  Game.state.scholar.ap = 99;
  Game.dayPart = 0;
  setRand(() => 0.99);
  const r6a = Game.stealFrom(mark4);
  const r6b = Game.stealFrom(mark4);
  const r6c = Game.stealFrom(mark4);
  restoreRand();
  const drained = 5000 - packKcalNow(mark4);
  console.log(`  same-part farm: 3 steals drained ${drained} kcal, results: ${r6a}/${r6b}/${r6c}`);
  ok('no same-part cooldown exists (farmable within one part)', r6a === 'unseen' && r6b === 'unseen' && r6c === 'unseen', '');
  // BUT: one notice + one trust hit per victim per sweep — the punishment doesn't scale with takes
  said = [];
  onePart();
  const notices = said.filter(t => /going through their pack/i.test(t)).length;
  ok('one victim = one notice regardless of take count', notices === 1, notices);

  // ============ SCENE 7: the stolen marker — recognition downstream ============
  // Fixed this run: handing the victim back their own stolen rations is
  // recognized ("Those are mine.") — no trust gain, small sting. Covered in
  // depth by scripts/test-theft-givefood-20261007.js; here the player-feel beat.
  freshGame();
  const mark5 = others()[4];
  fatPack(mark5, 1500);
  Game.state.scholar.ap = 5;
  setRand(() => 0.99); Game.stealFrom(mark5); restoreRand();
  onePart(); // notice fires -> victim suspects you
  const t5Before = trustOf(mark5);
  said = [];
  const r7 = Game.giveFood(mark5);
  ok('play: handing back stolen rations is recognized', !!(r7 && r7.recognized) && said.some(t => /Those are mine/i.test(t)), said.join(' | ').slice(0, 200));
  ok('play: no generosity trust gain', trustOf(mark5) <= t5Before, trustOf(mark5));

  restoreRand();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { Math.random = realRandom; console.error('ERR', e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e); process.exit(1); });
