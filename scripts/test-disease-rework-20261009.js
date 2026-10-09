// PROOF (Steve 2026-10-09, disease rework): diseases never announce themselves.
// Contraction shows SYMPTOMS only; diagnosis (medical ability / herb lore /
// stethoscope / medical villager) unlocks true names; cures are tiered
// (folk -> occupation abilities -> specific ruin medicine -> earned healer
// deepening + Fever's End synergy); ruin medicine is rare + class-specific;
// trichinosis rides undercooked bear/boar; debuffs degrade the body.
//
// Run: node scripts/test-disease-rework-20261009.js   (SEED env override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261009', 10);
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function grant(id, level) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  let e = s.abilities.find(a => a.id === id);
  if (!e) { e = { id, name: id, level: level || 1, xp: 0 }; s.abilities.push(e); }
  else e.level = level || e.level;
  return e;
}
function clearSick() {
  const s = Game.state.scholar;
  s.statuses = []; s.diseases = []; s.diagnosed = {}; s.treatDayKey = null;
}
// capture narration
const said = [];
const _say = Game.say.bind(Game);
Game.say = (m) => { said.push(String(m)); };
function clearSaid() { said.length = 0; }
function saidNames(names) { return said.filter(m => names.some(n => m.toLowerCase().includes(n.toLowerCase()))); }

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  console.log(`seed=${SEED}`);

  const TRUE_NAMES = ['gut rot', 'trichinosis', 'lockjaw', 'wound fever']; // mundane only — alien diseases (Eurika, East Nile, Lemons) show true names by design

  // ---- 1. contraction is symptom-only ----
  clearSick(); clearSaid();
  Game.contractDisease('gutrot', { source: 'the creek water' });
  ok('gutrot contracts', Game.hasStatus('scholar', 'gutrot'));
  ok('contraction never names the disease', saidNames(TRUE_NAMES).length === 0, saidNames(TRUE_NAMES).join(' | ').slice(0, 120));
  ok('contraction describes symptoms', said.some(m => /churn/i.test(m)));
  let chips = Game.afflictionChips();
  ok('status chip shows symptom label', chips.length === 1 && chips[0].label === 'Nauseous' && !chips[0].diagnosed, JSON.stringify(chips));
  ok('legacy mirror stores symptom label, not true name', (s.diseases || [])[0] && s.diseases[0].name === 'Nauseous', JSON.stringify(s.diseases));
  // every disease def: apply/tick/expire text is name-free
  let leak = [];
  for (const id of ['gutrot', 'trichinosis', 'lockjaw', 'wound_fever']) {
    const d = Game.seDef(id);
    for (const k of ['applyText', 'tickText', 'expireText', 'description']) {
      const t = (d[k] || '').toLowerCase();
      if (t.includes(d.name.toLowerCase()) && d.name.toLowerCase() !== 'fever') leak.push(id + '.' + k);
    }
  }
  ok('no disease def names itself in symptom text', leak.length === 0, leak.join(','));
  // other diseases' chips
  for (const [id, label] of [['trichinosis', 'Aching'], ['lockjaw', 'Stiffening']]) {
    clearSick(); Game.contractDisease(id, { source: 'test' });
    const c = Game.afflictionChips();
    ok(`${id} chip symptom-labeled ("${label}")`, c.length === 1 && c[0].label === label, JSON.stringify(c));
  }

  // ---- 2. diagnosis unlocks names ----
  clearSick(); grant('herbal_remedy', 1);
  Game.contractDisease('gutrot', { source: 'test' });
  ok('canDiagnose with herbal_remedy', Game.canDiagnose());
  const _odds = Game.diagnoseOdds;
  Game.diagnoseOdds = () => 0; clearSaid();
  Game.examineSick();
  ok('failed exam leaves it unnamed', !Game.isDiagnosed('scholar', 'gutrot'));
  ok('failed exam never names it', saidNames(TRUE_NAMES).length === 0);
  Game.diagnoseOdds = () => 1; clearSaid();
  Game.examineSick();
  Game.diagnoseOdds = _odds;
  ok('successful exam diagnoses', Game.isDiagnosed('scholar', 'gutrot'));
  ok('diagnosis names it + gives class + cure direction', saidNames(['gut rot']).length > 0 && said.some(m => /parasitic/i.test(m)));
  chips = Game.afflictionChips();
  ok('chip shows true name after diagnosis', chips[0].label === 'Gut Rot' && chips[0].diagnosed);
  ok('codex records the diagnosis', !!(Game.state.codex.diseases || {}).gutrot);
  ok('village learns the name (word of mouth)', Game.villageKnowsDisease('gutrot'));
  // stethoscope alone can diagnose
  clearSick(); s.abilities = [];
  s.inventory.push({ itemId: 'stethoscope', name: 'Stethoscope', units: 1, kg: 0.15 });
  Game.contractDisease('trichinosis', { source: 'test' });
  ok('canDiagnose with stethoscope only', Game.canDiagnose());
  s.inventory = s.inventory.filter(i => i.itemId !== 'stethoscope');

  // ---- 3. cure tiers ----
  // 3a. gutrot + herbal_remedy = cure (no diagnosis needed)
  clearSick(); grant('herbal_remedy', 1);
  Game.contractDisease('gutrot', { source: 'test' });
  Game.treatDisease('herbal_remedy');
  ok('herbal_remedy cures gutrot', !Game.hasStatus('scholar', 'gutrot'));
  // 3b. trichinosis needs diagnosis: undiagnosed herbal only eases
  clearSick(); grant('herbal_remedy', 1);
  Game.contractDisease('trichinosis', { source: 'test' });
  Game.treatDisease('herbal_remedy');
  ok('undiagnosed trichinosis NOT cured by herbs (eased)', Game.hasStatus('scholar', 'trichinosis'));
  const te = Game.seList('scholar').find(e => e.id === 'trichinosis');
  ok('undiagnosed trichinosis eased (easedUntil set)', !!(te && te.easedUntil > 0));
  // 3c. lockjaw: triage L1 undiagnosed -> ease; L3 -> cure (bacterial, unnamed)
  clearSick(); grant('triage', 1);
  Game.contractDisease('lockjaw', { source: 'test' });
  Game.treatDisease('triage');
  ok('undiagnosed lockjaw NOT cured by triage L1', Game.hasStatus('scholar', 'lockjaw'));
  clearSick(); grant('triage', 3);
  Game.contractDisease('lockjaw', { source: 'test' });
  Game.treatDisease('triage');
  ok('triage L3 cures unnamed lockjaw (earned deepening)', !Game.hasStatus('scholar', 'lockjaw'));
  // 3d. field_medicine L3 cures unnamed bacterial (lockjaw); L1 does not
  clearSick(); grant('field_medicine', 1); s.abilities = s.abilities.filter(a => a.id !== 'triage');
  Game.contractDisease('lockjaw', { source: 'test' });
  Game.treatDisease('field_medicine');
  ok('undiagnosed lockjaw NOT cured by field_medicine L1', Game.hasStatus('scholar', 'lockjaw'));
  clearSick(); grant('field_medicine', 3);
  Game.contractDisease('lockjaw', { source: 'test' });
  Game.treatDisease('field_medicine');
  ok('field_medicine L3 cures unnamed lockjaw', !Game.hasStatus('scholar', 'lockjaw'));
  // 3e. Fever's End synergy: ease upgrades to cure
  clearSick(); grant('herbal_remedy', 1); s.activeSynergies = ['fevers_end'];
  Game.contractDisease('trichinosis', { source: 'test' });
  Game.treatDisease('herbal_remedy');
  ok("Fever's End turns herbal ease into cure", !Game.hasStatus('scholar', 'trichinosis'));
  s.activeSynergies = [];
  // 3f. medicine specificity: antibiotics cure bacterial wound_fever; antibiotics
  // do NOT cure parasitic gutrot (wrong class wastes the dose)
  clearSick(); grant('triage', 1); s.abilities = s.abilities.filter(a => a.id !== 'field_medicine');
  Game.contractDisease('wound_fever', { source: 'test' });
  s.inventory.push({ itemId: 'med_antibiotics', medType: 'antibiotics', name: 'Antibiotics (amoxicillin)', doses: 3, units: 1, kg: 0.1 });
  Game.useMedicine('antibiotics');
  ok('antibiotics cure bacterial wound_fever', !Game.hasStatus('scholar', 'wound_fever'));
  clearSick();
  Game.contractDisease('gutrot', { source: 'test' });
  const doses0 = s.inventory.find(i => i.medType === 'antibiotics').doses;
  Game.useMedicine('antibiotics');
  ok('antibiotics do NOT cure parasitic gutrot', Game.hasStatus('scholar', 'gutrot'));
  ok('wrong medicine wastes the dose', s.inventory.find(i => i.medType === 'antibiotics').doses === doses0 - 1);
  // 3g. antiparasitic cures gutrot (parasitic)
  clearSick();
  Game.contractDisease('gutrot', { source: 'test' });
  s.inventory.push({ itemId: 'med_antiparasitic', medType: 'antiparasitic', name: 'Antiparasitic (mebendazole)', doses: 3, units: 1, kg: 0.1 });
  Game.useMedicine('antiparasitic');
  ok('antiparasitic cures gutrot (parasitic)', !Game.hasStatus('scholar', 'gutrot'));
  s.inventory = s.inventory.filter(i => !i.medType);

  // ---- 4. folk remedies: anyone can try, uncertain ----
  clearSick(); s.abilities = [];
  Game.contractDisease('gutrot', { source: 'test' });
  Game.folkRemedy('rest'); // no throw, no ability
  ok('folk rest attemptable without abilities', true);
  s.water = [{ quality: 'clean', liters: 1, source: 'well' }];
  s.hydration = 50;
  const hyd0 = s.hydration || 0;
  Game.folkRemedy('fluids');
  ok('folk fluids drinks clean water', (s.hydration || 0) > hyd0 && (s.water || []).length === 0);
  s.inventory.push({ plantId: 'dandelion', name: 'Dandelion greens', units: 2, kcalEach: 20 });
  Game.folkRemedy('tea');
  ok('folk tea consumes a plant', !s.inventory.some(i => i.plantId === 'dandelion' && i.units === 2));
  const kcal0 = s.kcal || 0;
  Game.folkRemedy('fast');
  ok('folk fast costs kcal', (s.kcal || 0) < kcal0);
  clearSaid(); Game.folkRemedy('rest');
  ok('folk remedies never name the disease', saidNames(TRUE_NAMES).length === 0);

  // ---- 5. debuffs degrade the body ----
  clearSick();
  Game.contractDisease('gutrot', { source: 'test' });
  const db = Game.diseaseDebuffs('scholar');
  ok('gutrot steals kcal absorption', db.kcalAbsorbMult < 1, db.kcalAbsorbMult);
  ok('gutrot drains hydration', db.hydrationDrain > 0);
  const h0 = s.hydration = 80; const hp0 = s.health = 100;
  Game.tickStatuses('scholar', 'dayPart');
  ok('dayPart tick damages + drains', s.health < hp0 && s.hydration < h0, `hp ${hp0}->${s.health}, hyd ${h0}->${s.hydration}`);
  // alien east_nile: permanent warping, ongoing fever cost (2/part), never diagnosed/cured mundanely
  clearSick(); s.health = 100;
  Game.applyStatus('scholar', 'east_nile', { source: 'test' });
  ok('east_nile contracts via alien path (applyStatus)', Game.hasStatus('scholar', 'east_nile'));
  ok('contractDisease refuses alien east_nile', Game.contractDisease('east_nile', { source: 'test' }) === false);
  Game.tickStatuses('scholar', 'dayPart');
  ok('alien east_nile ticks 2 (fever dreams)', s.health === 98, `health=${s.health}`);
  ok('alien east_nile is not a mundane disease', !Game.sickDiseases().some(e => e.id === 'east_nile'));
  // eurika: mosquito-sense blocks ambush surprise
  clearSick();
  Game.applyStatus('scholar', 'eurika', { source: 'test' });
  const said2 = [];
  const _say2 = Game.say.bind(Game); Game.say = (m) => { said2.push(String(m)); };
  Game.map.px = 5; Game.map.py = 5; // wild tile, not haven
  Game.wanderer = { x: 5, y: 5, warned: false, monsterId: 'hushwolf' };
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  const _wt = Game.worldTick; Game.worldTick = () => {}; // isolate: don't walk the wanderer off
  try { Game.checkEncounter(); } catch (e) {}
  Game.worldTick = _wt;
  Game.say = _say2;
  ok('eurika-sense warns instead of ambush', said2.some(m => /eurika-sense/i.test(m)));

  // ---- 6. trichinosis via undercooked bear meat ----
  clearSick(); s.health = 100; s.kcal = 0;
  s.inventory = [{ name: 'Bear meat (cleaned)', plantId: 'meat_black_bear', foodKind: 'meat', foodState: 'cleaned', edible: true, units: 1, kcalEach: 500, parasiteRisk: { id: 'trichinosis', p: 1 } }];
  Game.eatOne(0);
  ok('undercooked bear meat gives trichinosis (not a popup)', Game.hasStatus('scholar', 'trichinosis'));
  clearSick();
  s.inventory = [{ name: 'Bear meat (cooked)', plantId: 'meat_black_bear', foodKind: 'meat', foodState: 'cooked', edible: true, units: 1, kcalEach: 600, parasiteRisk: { id: 'trichinosis', p: 1 } }];
  Game.eatOne(0);
  ok('cooked bear meat is safe', !Game.hasStatus('scholar', 'trichinosis'));

  // ---- 7. party dynamics ----
  clearSick(); s.abilities = []; s.backgroundAbilities = [];
  // (roster is random — a medical villager counts as a healer, correctly)
  ok('campHealerName without player healer is not You', Game.campHealerName() !== 'You');
  grant('field_medicine', 2);
  ok('campHealerName is You with a care ability', Game.campHealerName() === 'You');
  // treatVillager: L2 gate + 150 kcal cost + real cure
  const vid = 'test-villager-1';
  Game.state.village.sick = {};
  Game.state.village.sick[vid] = { name: 'wound fever', daysLeft: 5, severity: 1 };
  s.kcal = 1000;
  Game.treatVillager(vid, 'field_medicine');
  ok('field_medicine L2 cures villager wound fever', !Game.state.village.sick[vid]);
  ok('treating another costs 150 kcal (food->healing)', s.kcal === 850, `kcal=${s.kcal}`);
  ok('cure spreads the name (word of mouth)', Game.villageKnowsDisease('wound_fever'));
  // L1 cannot work on others
  Game.state.village.sick[vid] = { name: 'gut rot', daysLeft: 5, severity: 1 };
  grant('herbal_remedy', 1); s.abilities = s.abilities.filter(a => a.id !== 'field_medicine');
  s.kcal = 1000;
  Game.treatVillager(vid, 'herbal_remedy');
  ok('L1 cannot treat others (needs L2)', !!Game.state.village.sick[vid] && s.kcal === 1000);
  // too hungry to give
  grant('herbal_remedy', 2);
  s.kcal = 100;
  Game.treatVillager(vid, 'herbal_remedy');
  ok('treating others refused when starving', !!Game.state.village.sick[vid]);
  s.kcal = 1000;
  // villagerDiseaseId mapping
  ok('vector maps to disease id', Game.villagerDiseaseId({ name: 'gut rot' }) === 'gutrot' && Game.villagerDiseaseId({ name: 'tick fever' }) === 'disease');

  // ---- 8. herbal_remedy ability button path (legacy activatable) ----
  clearSick(); grant('herbal_remedy', 1);
  Game.contractDisease('disease', { source: 'test' });
  s.herbalDay = null;
  Game.activateAbility('herbal_remedy');
  ok('ability button treats via tiered path', !Game.hasStatus('scholar', 'disease'));

  console.log(`\n${pass} passed, ${fail} failed (seed=${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
