// Proof: corruption system + slippery-slope cannibalism + psycho spawns.
// Seeded (SEED env or 20261009). Multi-seed in CI.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261009', 10);
Math.random = mulberry32(SEED);

// Full module list in index.html order, minus DOM-only.
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js', 'src/js/drama.js']);
const ORDER = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .split('\n').map(l => (l.match(/src\/js\/[a-zA-Z0-9./-]*\.js/) || [])[0])
  .filter(Boolean).filter(f => !SKIP.has(f));

// window stub for equipment.js load; deleted before play (sync combat path).
global.window = global;
for (const f of ORDER) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  eval.call(global, code + '\n//# sourceURL=' + f);
}
delete global.window;

const G = globalThis.Scattering.Game;
// Boot data like Game.init (fetch -> read JSON directly).
(function bootData() {
  const get = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8'));
  const files = ['plants.json', 'biomes.json', 'monsters.json', 'villagers.json', 'abilities.json', 'items.json', 'background_survivors.json', 'cell_defs.json', 'animals.json', 'recipes.json', 'books.json', 'relicEnhancements.json', 'locations.json', 'characterGen.json', 'synergies.json', 'knowledge.json', 'nameCultures.json', 'originPicker.json', 'foreignSpeech.json', 'lifeseeds.json', 'arrivalText.json', 'justiceVoice.json', 'alienPlayers.json', 'regions.json', 'dramaEffects.json', 'monsterBehaviors.json', 'contests.json', 'events.json', 'statusEffects.json', 'cooking.json'];
  const keys = ['plants', 'biomes', 'monsters', 'villagers', 'abilities', 'items', 'background_survivors', 'cellDefs', 'animals', 'recipes', 'books', 'relicEnhancements', 'locations', 'characterGen', 'synergies', 'knowledge', 'nameCultures', 'originPicker', 'foreignSpeech', 'lifeseeds', 'arrivalText', 'justiceVoice', 'alienPlayers', 'regions', 'dramaEffects', 'monsterBehaviors', 'contests', 'events', 'statusEffects', 'cooking'];
  G.data = {};
  files.forEach((f, i) => { G.data[keys[i]] = get(f); });
})();
let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); }
};

// Minimal game state scaffold for corruption tests.
function freshState() {
  G.state = {
    scholar: { day: 1, kcal: 1500, health: 100, energy: 100, inventory: [], corruption: 0, cannibalMeals: 0, trauma: 0 },
    village: { roster: ['v1', 'v2', 'v3'], trust: { v1: 30, v2: 30, v3: 30 }, positions: {}, corruption: {} },
    corpses: [],
    systemArrived: false,
  };
  G.villagerId = 'player';
  G.map = { px: 0, py: 0 };
  G.dayPart = 0;
  G.over = false;
  G._said = [];
  const _say = G.say; // keep original; capture too
  G.say = function (t) { G._said.push(String(t)); };
  return G.state;
}
function personCorpse(id) {
  return { id, kind: 'person', villagerId: 'v1', node: { x: 0, y: 0 }, mx: 4, my: 4, buried: false, items: [] };
}
function giveCuttingTool() {
  G.state.scholar.inventory.push({ name: 'stone knife', itemId: 'stone_knife' });
}

console.log('seed', SEED);

// ---- 1. EXPLOIT: no free / corruption-less cannibalism path ----
(function () {
  freshState();
  const c = personCorpse('c1'); G.state.corpses.push(c);
  // no cutting tool -> honest refusal, no meat
  const r1 = G.corpseButcher('c1');
  check('butcher without blade refuses', r1 === null);
  check('no meat without blade', !G.state.scholar.inventory.some(i => i.plantId === 'meat_human'));
  giveCuttingTool();
  const before = G.state.scholar.corruption;
  const meat = G.corpseButcher('c1');
  check('butcher yields meat', !!meat && meat.plantId === 'meat_human');
  check('butcher costs corruption', G.state.scholar.corruption > before);
  check('butcher costs trauma', (G.state.scholar.trauma || 0) > 0);
  const units1 = G.state.scholar.inventory.filter(i => i.plantId === 'meat_human').reduce((s, i) => s + (i.units || 1), 0);
  check('meat bounded 2-4', units1 >= 2 && units1 <= 4, units1);
  // re-butcher refused: no infinite meat dup
  const r2 = G.corpseButcher('c1');
  const units2 = G.state.scholar.inventory.filter(i => i.plantId === 'meat_human').reduce((s, i) => s + (i.units || 1), 0);
  check('no re-butcher dup', r2 === null && units2 === units1, [units1, units2]);
  // eating consumes units
  const idx = G.state.scholar.inventory.findIndex(i => i.plantId === 'meat_human');
  G.eatCannibal(idx);
  const units3 = G.state.scholar.inventory.filter(i => i.plantId === 'meat_human').reduce((s, i) => s + (i.units || 1), 0);
  check('eating consumes a unit', units3 === units2 - 1, [units2, units3]);
  check('eating adds cannibalMeals', G.state.scholar.cannibalMeals === 1);
  check('eating adds corruption', G.state.scholar.corruption >= 14);
})();

// ---- 2. SLOPE: trauma desensitizes, corruption accelerates ----
(function () {
  freshState(); giveCuttingTool();
  const traumas = [], corrs = [];
  for (let m = 0; m < 5; m++) {
    G.state.scholar.inventory.push(G.humanMeatItem(1));
    const t0 = G.state.scholar.trauma || 0, c0 = G.state.scholar.corruption || 0;
    const idx = G.state.scholar.inventory.findIndex(i => i.plantId === 'meat_human');
    G.eatCannibal(idx);
    traumas.push((G.state.scholar.trauma || 0) - t0);
    corrs.push((G.state.scholar.corruption || 0) - c0);
  }
  check('first trauma > fifth trauma (desensitization)', traumas[0] > traumas[4], traumas);
  check('trauma strictly non-increasing', traumas.every((t, i) => i === 0 || t <= traumas[i - 1]), traumas);
  check('corruption accelerates', corrs[4] > corrs[0], corrs);
  check('first trauma devastating (>=25)', traumas[0] >= 25, traumas[0]);
})();

// ---- 3. FOIL: corruption drags trust gains ----
(function () {
  freshState();
  G.state.scholar.corruption = 0;
  const g0 = G.trustGainProgressive('v1', 10);
  G.state.scholar.corruption = 100;
  const g1 = G.trustGainProgressive('v1', 10);
  check('high corruption reduces trust gains', g1 < g0, [g0, g1]);
  G.state.scholar.corruption = 20;
  const g2 = G.trustGainProgressive('v1', 10);
  check('low corruption: no drag', g2 === g0, [g0, g2]);
})();

// ---- 4. HONESTY: labels say what they do ----
(function () {
  freshState();
  const app = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  check('butcher button honest', app.includes('🔪 Butcher the body'));
  const ab = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/abilities.json'), 'utf8'));
  const rf = ab.find(a => a.id === 'cannibal_frenzy');
  check('red hunger desc honest (no free kcal)', rf && !/\+1000/.test(rf.description) && /costs apply/.test(rf.description));
  const meat = G.humanMeatItem(1);
  check('meat item honest label', meat.name === 'human meat' && /exactly what this is/.test(meat.desc));
  check('prion risk disclosed on item', meat.prionRisk && /cooking/.test(meat.prionRisk.note));
  // eatOne routes human meat through the act
  freshState(); giveCuttingTool();
  G.state.scholar.inventory.push(G.humanMeatItem(1));
  const t0 = G.state.scholar.trauma || 0;
  const mi = G.state.scholar.inventory.findIndex(i => i.plantId === 'meat_human');
  G.eatOne(mi);
  check('eatOne routes to cannibal act', G.state.scholar.cannibalMeals === 1 && (G.state.scholar.trauma || 0) > t0);
})();

// ---- 5. PSYCHO SPAWN: rare, coherent, intro fires ----
(function () {
  let darkCount = 0;
  const N = 400;
  for (let i = 0; i < N; i++) {
    const d = G.rollDarkTrait();
    if (d && d.kind === 'malicious') darkCount++;
  }
  const rate = darkCount / N;
  check('malicious roll rare (~1.5%)', rate > 0 && rate < 0.06, rate);
  // intro fires for malicious bearer, sets corruption, marks once
  freshState();
  const tell = (G.data.characterGen.darkTells.malicious || [])[0];
  const char = { name: 'Test Dark', personality: { dark: { kind: 'malicious', tell: tell.id } } };
  const fired = G.psychoIntro(char);
  check('psycho intro fires', fired === true);
  check('starting corruption > 0', (G.state.scholar.corruption || 0) > 0);
  check('intro fires once', G.psychoIntro(char) === false);
  check('tell coherent (quirk surfaced, no "psychopath" label)', G._said.some(t => /smiles a beat too long|watches people/i.test(t)) && !G._said.some(t => /psychopath/i.test(t)), G._said.slice(0, 2));
  // benign dark does NOT trigger psycho bundle
  freshState();
  const fired2 = G.psychoIntro({ name: 'Test Benign', personality: { dark: { kind: 'benign', tell: 'x' } } });
  check('benign dark: no psycho bundle', fired2 === false && (G.state.scholar.corruption || 0) === 0);
})();

// ---- 6. NORMS: contextual consequences ----
(function () {
  freshState();
  check('healthy village -> exile norm', G.cannibalNorm() === 'exile');
  // starving: recent starvation death
  G.state.village.fallen = [{ villagerId: 'vx', day: 1, cause: 'starved' }];
  check('starving village -> horror norm', G.cannibalNorm() === 'horror');
  // corrupted: bottom-up
  freshState();
  G.state.village.corruption = { v1: 80, v2: 70, v3: 60 };
  G.state.scholar.corruption = 90;
  check('corrupted village -> power norm', G.cannibalNorm() === 'power', G.villageCorruption());
  check('village corruption bottom-up (mean ~75)', G.villageCorruption() > 70 && G.villageCorruption() < 80, G.villageCorruption());
})();

// ---- 7. JUSTICE: contextual heat ----
(function () {
  freshState();
  // healthy village: witnessed cannibalism = massive heat
  G.recordCrime('cannibalism', { witnessed: true });
  const hExile = G.justiceHeat();
  check('exile-norm heat >= 60', hExile >= 60, hExile);
  // corrupted village: minimal heat
  G.state.village.corruption = { v1: 80, v2: 70, v3: 60 };
  G.state.scholar.corruption = 90;
  const hPower = G.justiceHeat();
  check('power-norm heat small', hPower < hExile, [hExile, hPower]);
  // hidden: no heat, stays on books
  freshState();
  G.recordCrime('cannibalism', { witnessed: false });
  const crimes = G.justiceState().crimes.filter(c => c.type === 'cannibalism');
  check('hidden crime on books, no heat', crimes.length === 1 && G.justiceHeat() < 60);
})();

// ---- 8. FEAR: distinct, brittle ----
(function () {
  freshState();
  G.addFear('v1', 'player', 70);
  check('fear recorded', G.fearOf('v1', 'player') === 70);
  G.fearWeakness('player');
  const f2 = G.fearOf('v1', 'player');
  check('fear collapses on weakness', f2 < 70, f2);
})();

// ---- 9. CRAVINGS: abstaining costs at 60+ ----
(function () {
  freshState();
  G.state.scholar.corruption = 70;
  G.state.scholar.day = 10; G.state.scholar.cravingFedDay = 0;
  G.dayPart = 0;
  const e0 = G.state.scholar.energy;
  G.cravingTick();
  check('craving drains energy when unfed', G.state.scholar.energy < e0);
  G.state.scholar.cravingFedDay = 10;
  const e1 = G.state.scholar.energy;
  G.cravingTick();
  check('no craving when recently fed', G.state.scholar.energy === e1);
})();

// ---- 10. DISEASE: trembles in mundane pool ----
(function () {
  const se = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/statusEffects.json'), 'utf8'));
  const t = se.statuses.trembles;
  check('trembles exists, mundane pool', t && t.pool === 'mundane');
  check('trembles incurable (all no)', t && Object.values(t.cure).filter(x => x === 'no').length >= 5);
})();

console.log(`\n${pass} pass, ${fail} fail (seed ${SEED})`);
process.exit(fail ? 1 : 0);
