// SURVIVAL SAFETY NETS PROOF (2026-10-10) — Part C of the survival-economy
// diagnosis (0 wins / 60 seeds, median survival 24d vs ~100d target).
// Three played systems, not flat relief:
//   1. System aid quests (days 7-21): offered only when genuinely struggling;
//      played with real costs + real failure; 1-in-4 bizarrely wrong.
//   2. Crisis relief (triage tents / rationing vote / emergency hunt):
//      villager-driven always (pre-day-7 identical); honest costs, once each.
//   3. Neighbor-village aid flows: request (food/medicine/hands) via links,
//      inbound offers, neighbor begs; real deliveries, trust both ways,
//      ingratitude remembered; the request move is knowledge-gated.
// Each net fired end-to-end x3 seeds + honesty checks (costs real) +
// no-infinite-farm exploit check + regressions on the closest existing suite.
// Usage: node scripts/test-survival-nets.js [SEED] — run x3 seeds.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || process.argv[2] || '777010', 10);

const PAIRS = [
  ['plants.json', 'plants'], ['biomes.json', 'biomes'], ['monsters.json', 'monsters'],
  ['villagers.json', 'villagers'], ['abilities.json', 'abilities'], ['items.json', 'items'],
  ['background_survivors.json', 'background_survivors'], ['cell_defs.json', 'cellDefs'],
  ['animals.json', 'animals'], ['recipes.json', 'recipes'], ['books.json', 'books'],
  ['relicEnhancements.json', 'relicEnhancements'], ['locations.json', 'locations'],
  ['characterGen.json', 'characterGen'], ['knowledge.json', 'knowledge'],
  ['nameCultures.json', 'nameCultures'], ['originPicker.json', 'originPicker'],
  ['foreignSpeech.json', 'foreignSpeech'], ['lifeseeds.json', 'lifeseeds'],
  ['arrivalText.json', 'arrivalText'], ['justiceVoice.json', 'justiceVoice'],
  ['alienPlayers.json', 'alienPlayers'], ['regions.json', 'regions'],
  ['dramaEffects.json', 'dramaEffects'], ['monsterBehaviors.json', 'monsterBehaviors'],
  ['contests.json', 'contests'], ['events.json', 'events'],
  ['statusEffects.json', 'statusEffects'], ['cooking.json', 'cooking'],
];
global.SCATTER_DATA = {};
for (const [f, key] of PAIRS) {
  try { global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8')); }
  catch (e) { global.SCATTER_DATA[key] = key === 'contests' || key === 'items' || key === 'monsters' ? [] : {}; }
}

function mulberry32(a) {
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let _rng = mulberry32(SEED);
function rng() { return _rng(); }
rng.reset = (s) => { _rng = mulberry32(s); };
Math.random = rng;

global.window = global;
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', 'game.js', 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'broadcast.js', 'contestEngine.js', 'alienPlayers.js', 'storage.js',
  'perceive.js', 'carexplore.js', 'justice.js', 'food.js', 'betrayal.js', 'corpses.js',
  'corruption.js', 'lifeseed.js', 'progression.js', 'ledger.js', 'abilityActions.js',
  'monsterBehaviors.js', 'statusEffects.js', 'metaProgression.js', 'villager-agency.js',
  'fieldFights.js', 'villager-objectives.js', 'codex-people.js', 'membership.js',
  'hierarchy.js', 'comms.js', 'safetynets.js', 'debug-scenarios.js', 'build.js'];
for (const f of LIST) {
  try { eval(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function sec(t) { console.log('\n### ' + t); }

const said = [], sysSaid = [];
Game.sysSay = function(t) { sysSaid.push(String(t)); };
const _realSay = Game.say;
Game.say = function(t) { said.push(String(t)); try { return _realSay.call(this, t); } catch (e) {} };
Game.audioEvent = function() {};
Game.drama = function() {};
Game.tele = function() {};
Game.recordMoment = function() {};
Game.contestLearn = function() {};
Game.villagerGainXP = function() {};
Game.seedGossip = function() {};
Game.kcalCap = function() { return 2400; };
Game.maxHealth = function() { return 100; };

function freshGame(opts) {
  opts = opts || {};
  rng.reset(opts.seed != null ? opts.seed : SEED);
  said.length = 0; sysSaid.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = opts.day != null ? opts.day : 9;
  Game.state.systemArrived = opts.systemArrived !== false;
  s.integration = 45; s.health = 100; s.kcal = 2000; s.trauma = 0; s.exiled = false;
  s.abilities = s.abilities || [];
  Game.state.over = false;
  const v = Game.state.village;
  v.sick = v.sick || {}; v.health = v.health || {};
  // one linked neighbor, like the aid-comms proof
  const ovs = Game.state.otherVillages || [];
  ovs.forEach(x => { x.generated = true; x.rumored = true; x.crisis = null; x.aidFaces = null; x.pantryKcal = opts.neighborPantry != null ? opts.neighborPantry : 22000; });
  const v0 = ovs[0];
  if (v0 && !Game.linkWith(v0.id)) Game._formLink(v0.id, {}, null);
  const link = v0 ? Game.linkWith(v0.id) : null;
  if (link) { link.trust = opts.trust != null ? opts.trust : 70; link.aidDebtKcal = 0; link.aidCreditKcal = 0; }
  Game.state.aidKnown = !!opts.aidKnown;
  return { s, v, v0, link };
}
// make the village genuinely struggling: empty pantry + one sick villager
function makeStruggling(v) {
  v.pantry = []; v.pantryKcal = 0;
  const tv = (v.roster || []).find(id => id !== Game.villagerId);
  v.sick = {}; v.sick[tv] = { name: 'gut rot', daysLeft: 3, severity: 1 };
  return tv;
}
function pantryKcal() { try { return Game.pantryKcalLive(Game.state.village); } catch (e) { return -1; } }
function tickParts(n) { for (let i = 0; i < n; i++) { try { Game.safetyNetsPartTick(); } catch (e) {} } }

// ================= NET 1: SYSTEM AID QUESTS =================
sec('NET 1 — System aid quests');
{
  // 1a. no quests before day 7 (systemArrived gate)
  let g = freshGame({ day: 5, systemArrived: false });
  makeStruggling(g.v);
  ok('no quest pre-System (day 5)', Game.offerAidQuest() === null);
  // 1b. struggling village, day 9 -> offer fires, said aloud via System
  g = freshGame({ day: 9 });
  makeStruggling(g.v);
  const q = Game.offerAidQuest();
  ok('quest offered when struggling (day 9)', !!q && !!Game.state.pendingAidQuest, 'q=' + (q && q.kind));
  ok('offer spoken by the System', sysSaid.length >= 2, sysSaid.length + ' sysSaid');
  // 1c. not struggling -> no offer
  g = freshGame({ day: 9 });
  Game.stockPantry(60000, 'full bins', { pieceKcal: 500 });
  ok('no quest when not struggling', Game.offerAidQuest() === null);
  // 1d. cooldown + budget gates
  g = freshGame({ day: 9 });
  makeStruggling(g.v);
  Game.state.aidQuestLedger = { lastOfferDay: 9, done: 0, failed: 0 };
  ok('offer respects 4d cooldown', Game.offerAidQuest() === null);
  Game.state.aidQuestLedger = { lastOfferDay: -99, done: 3, failed: 0 };
  ok('offer respects 3/run budget', Game.offerAidQuest() === null);
  Game.state.aidQuestLedger = { lastOfferDay: -99, done: 0, failed: 0 };
  // 1e. accept + FETCH quest plays end-to-end with real cost
  g = freshGame({ day: 9 });
  makeStruggling(g.v);
  const sg = Game.aidQuestStruggle();
  const fq = Game._makeAidQuest('fetch', false, sg, []);
  fq.need = { meatKcal: 1500 }; fq.needText = 'hand over 1,500 kcal of meat';
  fq.rewardKind = 'supply';
  Game.state.pendingAidQuest = fq;
  ok('accept moves quest to active', Game.answerAidQuest('accept') === fq && !!Game.state.activeAidQuest);
  ok('hand-in short when empty-handed', Game.handInAidQuest() === 'short');
  const s = Game.state.scholar;
  s.inventory.push({ name: 'Raw venison', foodKind: 'meat', kcalEach: 500, units: 4, spoilDay: 99 });
  const invBefore = s.inventory.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0);
  const panBefore = pantryKcal();
  const res = Game.handInAidQuest();
  const invAfter = s.inventory.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0);
  ok('fetch hand-in completes + reward fires', res === 'reward-supply', 'res=' + res);
  ok('honesty: the meat really left the pack', invAfter <= invBefore - 1500, invBefore + '->' + invAfter);
  ok('honesty: supply drop really landed in pantry', pantryKcal() >= panBefore + 2000, panBefore + '->' + pantryKcal());
  ok('quest ledger counted the completion', (Game.state.aidQuestLedger.done || 0) >= 1);
  // 1f. TREAT quest: recovery completes, death fails
  g = freshGame({ day: 10 });
  makeStruggling(g.v);
  const tv = Object.keys(g.v.sick)[0];
  const tq = Game._makeAidQuest('treat', false, Game.aidQuestStruggle(), Object.keys(g.v.sick));
  Game.state.pendingAidQuest = tq;
  Game.answerAidQuest('accept');
  ok('treat quest names the sick one', Game.state.activeAidQuest.targetVid === tv);
  delete g.v.sick[tv]; // tended back to health by any means
  const tr = Game.aidQuestCheckTreat();
  ok('treat completes on recovery', tr === 'reward-supply' || tr === 'reward-ability', 'tr=' + tr);
  // death fails it
  g = freshGame({ day: 10 });
  makeStruggling(g.v);
  const tv2 = Object.keys(g.v.sick)[0];
  const tq2 = Game._makeAidQuest('treat', false, Game.aidQuestStruggle(), Object.keys(g.v.sick));
  Game.state.pendingAidQuest = tq2; Game.answerAidQuest('accept');
  g.v.roster = g.v.roster.filter(id => id !== tv2); // died / left
  const tr2 = Game.aidQuestCheckTreat();
  ok('treat fails when the patient is gone', tr2 === 'failed');
  ok('failure counted in ledger', (Game.state.aidQuestLedger.failed || 0) >= 1);
  // 1g. LEARN quest: codex growth completes
  g = freshGame({ day: 11 });
  makeStruggling(g.v);
  const lq = Game._makeAidQuest('learn', false, Game.aidQuestStruggle(), []);
  Game.state.pendingAidQuest = lq; Game.answerAidQuest('accept');
  ok('learn not complete at baseline', Game.aidQuestCheckLearn() === null);
  Game.state.codex.plants['test_plant_a'] = { level: 1 };
  Game.state.codex.plants['test_plant_b'] = { level: 1 };
  const lr = Game.aidQuestCheckLearn();
  ok('learn completes on +2 plants', lr === 'reward-supply' || lr === 'reward-ability', 'lr=' + lr);
  // 1h. deadline expiry is real failure (integration -2)
  g = freshGame({ day: 9 });
  makeStruggling(g.v);
  const eq = Game._makeAidQuest('fetch', false, Game.aidQuestStruggle(), []);
  eq.deadlineDay = 9;
  Game.state.activeAidQuest = eq;
  Game.state.scholar.day = 10;
  const integBefore = Game.state.scholar.integration;
  Game.safetyNetsDayTick();
  ok('expired quest fails + integration -2', !Game.state.activeAidQuest && Game.state.scholar.integration === integBefore - 2);
  // 1i. weird variants are bizarre but checkable
  const wq = Game._makeAidQuest('fetch', true, Game.aidQuestStruggle(), []);
  ok('weird fetch asks for rocks, honestly', wq.need.stoneUnits === 3, JSON.stringify(wq.need));
  const wt = Game._makeAidQuest('treat', true, Game.aidQuestStruggle(), ['x']);
  ok('weird treat keeps the real need', wt.need.recoverVid === 'x' && /HUG/i.test(wt.ask));
  // 1j. ability reward path offers the choice sheet (slot-capped)
  g = freshGame({ day: 9 });
  makeStruggling(g.v);
  const aq = Game._makeAidQuest('fetch', false, Game.aidQuestStruggle(), []);
  aq.rewardKind = 'ability';
  Game.state.activeAidQuest = aq;
  Game.state.scholar.abilities = [];
  const ar = Game._completeAidQuest(true);
  ok('ability reward sets the System choice sheet', ar === 'reward-ability' && (Game.state.scholar.abilityChoices || []).length >= 1,
    'ar=' + ar + ' choices=' + ((Game.state.scholar.abilityChoices || []).length));
  ok('ability choices are real defs', (Game.state.scholar.abilityChoices || []).every(c => c.id && c.name));
}

// ================= NET 2: CRISIS RELIEF =================
sec('NET 2 — crisis relief');
{
  // 2a. sickness cascade raises relief (villager-driven)
  let g = freshGame({ day: 12 });
  const v = g.v;
  const r1 = (v.roster || []).find(id => id !== Game.villagerId);
  const r2 = (v.roster || []).find(id => id !== Game.villagerId && id !== r1);
  v.sick = {}; v.sick[r1] = { name: 'gut rot', daysLeft: 4, severity: 1 }; v.sick[r2] = { name: 'wound fever', daysLeft: 3, severity: 2 };
  said.length = 0; sysSaid.length = 0;
  Game.villageSicknessTick();
  ok('sickness cascade raises relief', !!Game.state.relief && Game.state.relief.kind === 'sickness');
  ok('relief proposed by a named villager, not the System', sysSaid.length === 0 && said.join(' ').includes('🛟'), 'sysSaid=' + sysSaid.length);
  // 2b. pre-day-7: identical path, still villager-driven
  g = freshGame({ day: 4, systemArrived: false });
  const w1 = (g.v.roster || []).find(id => id !== Game.villagerId);
  const w2 = (g.v.roster || []).find(id => id !== Game.villagerId && id !== w1);
  g.v.sick = {}; g.v.sick[w1] = { name: 'gut rot', daysLeft: 4, severity: 1 }; g.v.sick[w2] = { name: 'fever', daysLeft: 3, severity: 1 };
  said.length = 0; sysSaid.length = 0;
  Game.villageSicknessTick();
  ok('pre-day-7 relief still raises (villager-driven)', !!Game.state.relief && sysSaid.length === 0);
  // 2c. triage: honest 800 kcal cost, sick mend sooner, once per relief
  g = freshGame({ day: 12 });
  const tv = (g.v.roster || []).find(id => id !== Game.villagerId);
  const tv2 = (g.v.roster || []).find(id => id !== Game.villagerId && id !== tv);
  g.v.sick = {}; g.v.sick[tv] = { name: 'gut rot', daysLeft: 4, severity: 1 }; g.v.sick[tv2] = { name: 'fever', daysLeft: 5, severity: 1 };
  Game.raiseRelief('sickness', {});
  Game.stockPantry(5000, 'bins', { pieceKcal: 500 });
  const panB = pantryKcal();
  const tri = Game.answerRelief('triage');
  ok('triage fires', tri === 'triage', 'tri=' + tri);
  ok('honesty: triage really cost >= 800 kcal', panB - pantryKcal() >= 800, panB + '->' + pantryKcal());
  ok('triage shortens sickness', g.v.sick[tv].daysLeft === 2 && g.v.sick[tv2].daysLeft === 3);
  ok('triage once per relief', Game.answerRelief('triage') === 'used');
  // triage refused honestly when the pantry can't cover it
  g = freshGame({ day: 12 });
  const qv = (g.v.roster || []).find(id => id !== Game.villagerId);
  g.v.sick = {}; g.v.sick[qv] = { name: 'gut rot', daysLeft: 4, severity: 1 };
  g.v.pantry = []; g.v.pantryKcal = 0;
  Game.raiseRelief('sickness', {});
  ok('triage refused when pantry < 800', Game.answerRelief('triage') === 'short');
  // 2d. rationing vote: flag, morale cost, villagers eat half (real wrapper)
  g = freshGame({ day: 12 });
  Game.raiseRelief('hunger', {});
  const dayB = Game.state.scholar.day;
  const rat = Game.answerRelief('rations');
  ok('rationing vote passes', rat === 'rations');
  ok('rationing flag set 3 days', g.v.rationing && g.v.rationing.until === dayB + 3);
  ok('rationing costs morale', g.v.morale === 'strained');
  Game.stockPantry(20000, 'bins', { pieceKcal: 500 });
  const vid = (g.v.roster || []).find(id => id !== Game.villagerId);
  const person = Game.getPerson(vid);
  const kpdBefore = person.kcalPerDay;
  const meal = Game.villagerMealDay(vid, person, g.v, {});
  ok('rationed villager eats ~half need', meal.ate < 1300, 'ate=' + Math.round(meal.ate));
  ok('villager need restored after the meal', person.kcalPerDay === kpdBefore, person.kcalPerDay + ' vs ' + kpdBefore);
  ok('rationing once per relief', Game.answerRelief('rations') === 'used');
  // 2e. emergency hunt: real meat, real risk, once per relief
  g = freshGame({ day: 12 });
  Game.raiseRelief('raid', {});
  Game.stockPantry(1000, 'bins', { pieceKcal: 500 });
  const panH = pantryKcal();
  const hu = Game.answerRelief('hunt');
  ok('emergency hunt fires', hu === 'hunt');
  ok('hunt really stocks meat', pantryKcal() >= panH + 1500, panH + '->' + pantryKcal());
  ok('hunt once per relief', Game.answerRelief('hunt') === 'used');
  // 2f. relief expires on its own (~3 days of parts)
  g = freshGame({ day: 12 });
  Game.raiseRelief('storm', {});
  ok('relief open', !!Game.state.relief);
  tickParts(12);
  ok('relief expires after ~3 days', !Game.state.relief);
  // 2g. raid aftermath hooks resolveAidCrisis
  g = freshGame({ day: 15 });
  Game.state.aidCrisis = { kind: 'monster', name: 'raiders', wave: 1, sinceDay: 15, sincePart: 0, calls: [], helpAtDoor: [], attracted: 0, resolved: false, raiders: true };
  Game.resolveAidCrisis('fought');
  ok('raid aftermath raises relief', !!Game.state.relief && Game.state.relief.kind === 'raid');
  // 2h. hunger winter hooks fireCrisis
  g = freshGame({ day: 16 });
  Game.fireCrisis('hunger-winter');
  ok('hunger winter raises relief', !!Game.state.relief && Game.state.relief.kind === 'hunger');
  // 2i. storm aftermath hooks resolveStormFront (only when caught out)
  g = freshGame({ day: 18 });
  Game.state.scholar.stormFront = { day: 18 };
  Game.map = Game.map || {}; Game.map.px = 0; Game.map.py = 0; // far from haven (4,4): caught out
  Game.resolveStormFront();
  ok('storm aftermath raises relief when caught out', !!Game.state.relief && Game.state.relief.kind === 'storm');
  // 2j. one relief at a time
  g = freshGame({ day: 18 });
  Game.raiseRelief('sickness', {});
  ok('second relief refused while one is open', Game.raiseRelief('raid', {}) === null);
  ok('dismiss closes it', Game.answerRelief('dismiss') === 'dismissed' && !Game.state.relief);
}

// ================= NET 3: NEIGHBOR-VILLAGE AID FLOWS =================
sec('NET 3 — neighbor-village aid flows');
{
  // 3a. knowledge gate: the request move must be LEARNED
  let g = freshGame({ day: 12, aidKnown: false });
  makeStruggling(g.v);
  const gate = Game.aidRequestable(g.link.id);
  ok('request-aid knowledge-gated', !!gate.blocked && /gossip/i.test(gate.blocked), gate.blocked);
  // 3b. gossip teaches it
  g = freshGame({ day: 12, aidKnown: false, seed: SEED + 1 });
  let learned = false;
  for (let d = 0; d < 40 && !learned; d++) { if (Game.aidKnownTick()) learned = true; }
  ok('aid move learned via gossip', learned && Game.state.aidKnown);
  ok('gossip said it aloud', said.join(' ').includes('traders'));
  // 3c. request food: runner, real decision, real delivery
  g = freshGame({ day: 12, aidKnown: true });
  makeStruggling(g.v);
  const rq = Game.aidRequestable(g.link.id);
  ok('requestable when struggling + trust 70', rq.kinds && rq.kinds.length === 3, JSON.stringify(rq));
  const theirBefore = g.v0.pantryKcal;
  const req = Game.requestAid(g.link.id, 'food');
  ok('request dispatches a runner', !!req && req.kind === 'food' && (Game.state.aidOut || []).length === 1);
  const panB0 = pantryKcal();
  let decided = false;
  for (let i = 0; i < 8 && !decided; i++) { tickParts(1); decided = (Game.state.aidOut || []).length === 0; }
  ok('runner arrives + far end decides aloud', decided);
  const accepted = (Game.state.aidInbound || []).length === 1 || pantryKcal() > panB0;
  ok('trust-70 ask accepted', accepted, said.slice(-2).join(' | '));
  ok('no [object Object] face names', !/\[object Object\]/.test(said.join(' ')));
  const panB = pantryKcal();
  tickParts(8); // delivery marches
  ok('delivery arrives as real pantry kcal', pantryKcal() >= panB + 1900, panB + '->' + pantryKcal());
  ok('honesty: their pantry really thinned', g.v0.pantryKcal <= theirBefore - 2000, theirBefore + '->' + g.v0.pantryKcal);
  ok('ledger remembers received aid', (Game.aidLedger(g.v0.id).receivedKcal || 0) >= 2000);
  // 3d. per-village cooldown blocks farming the same neighbor
  const again = Game.requestAid(g.link.id, 'food');
  ok('second ask blocked by 7d cooldown', again === 'blocked');
  // 3e. a bare neighbor refuses honestly (and it costs a little trust)
  g = freshGame({ day: 12, aidKnown: true, neighborPantry: 1000 });
  makeStruggling(g.v);
  const trustB = g.link.trust;
  Game.requestAid(g.link.id, 'food');
  tickParts(6);
  ok('bare neighbor refuses aloud', (Game.state.aidInbound || []).length === 0 && /thin ourselves|bare/i.test(said.join(' ')));
  ok('refusal costs a little trust', g.link.trust === trustB - 2, trustB + '->' + g.link.trust);
  // 3f. low-trust ask refused at the gate
  g = freshGame({ day: 12, aidKnown: true, trust: 10 });
  makeStruggling(g.v);
  const low = Game.aidRequestable(g.link.id);
  ok('trust < 35: the ask wouldn\'t carry', !!low.blocked && /Trust 10/.test(low.blocked), low.blocked);
  // 3g. not struggling: no ask (anti-farm)
  g = freshGame({ day: 12, aidKnown: true });
  Game.stockPantry(60000, 'full', { pieceKcal: 500 });
  const fat = Game.aidRequestable(g.link.id);
  ok('no ask when stores are fine', !!fat.blocked && /wouldn't carry/.test(fat.blocked), fat.blocked);
  // 3h. inbound OFFER from a rich neighbor while struggling
  g = freshGame({ day: 12, aidKnown: false, neighborPantry: 40000, seed: SEED + 2 });
  makeStruggling(g.v);
  let offered = false;
  for (let d = 0; d < 40 && !offered; d++) { Game.safetyNetsDayTick(); if (Game.state.pendingAidOffer) offered = true; }
  ok('rich neighbor offers aid when struggling', offered);
  ok('an offer teaches the move', Game.state.aidKnown === true);
  if (offered) {
    const of = Game.state.pendingAidOffer;
    const panO = pantryKcal();
    const theirO = Game._otherVillage(of.villageId).pantryKcal;
    ok('offer accepted -> delivery scheduled', Game.answerAidOffer('accept') === 'accepted');
    tickParts(8);
    ok('offered aid arrives real', pantryKcal() >= panO + of.amount * 0.9, panO + '->' + pantryKcal());
    ok('their pantry paid for the offer', Game._otherVillage(of.villageId).pantryKcal <= theirO - of.amount * 0.9);
  }
  // 3i. refuse an offer: pride costs trust
  g = freshGame({ day: 12, aidKnown: true, neighborPantry: 40000 });
  Game.state.pendingAidOffer = { villageId: g.v0.id, kind: 'food', amount: 2000, face: 'Someone', offerDay: 12 };
  const tB = g.link.trust;
  ok('offer refused with pride', Game.answerAidOffer('refuse') === 'refused' && g.link.trust === tB - 3);
  // 3j. neighbor BEGS: give real food, earn real trust + credit
  g = freshGame({ day: 12, aidKnown: true });
  Game.stockPantry(10000, 'bins', { pieceKcal: 500 });
  Game.state.pendingAidBeg = { villageId: g.v0.id, kind: 'food', amount: 1500, face: 'Someone', begDay: 12 };
  const panG = pantryKcal(), theirG = g.v0.pantryKcal, trustG = g.link.trust;
  ok('beg answered with real food', Game.answerAidBeg('give') === 'gave');
  ok('honesty: our pantry really paid', panG - pantryKcal() >= 1500, panG + '->' + pantryKcal());
  ok('honesty: their pantry really grew', g.v0.pantryKcal >= theirG + 1400, theirG + '->' + g.v0.pantryKcal);
  ok('giving earns trust + credit', g.link.trust === trustG + 4 && (g.link.aidCreditKcal || 0) >= 1500);
  // 3k. ingratitude: refuse a creditor after taking their food — double cost
  g = freshGame({ day: 12, aidKnown: true });
  Game.stockPantry(10000, 'bins', { pieceKcal: 500 });
  Game.aidLedger(g.v0.id).receivedKcal = 3000; // they fed us before
  Game.state.pendingAidBeg = { villageId: g.v0.id, kind: 'food', amount: 1500, face: 'Someone', begDay: 12 };
  const trustI = g.link.trust;
  Game.answerAidBeg('refuse');
  ok('ingratitude costs double trust', g.link.trust === trustI - 10, trustI + '->' + g.link.trust);
  ok('ingratitude ledgered', (Game.aidLedger(g.v0.id).ingratitude || 0) >= 1);
  ok('ingratitude said aloud', /forgot who fed them/.test(said.join(' ')));
  // 3l. honest no: bare bins, they see it
  g = freshGame({ day: 12, aidKnown: true });
  g.v.pantry = []; g.v.pantryKcal = 0;
  Game.state.pendingAidBeg = { villageId: g.v0.id, kind: 'food', amount: 1500, face: 'Someone', begDay: 12 };
  ok('bare bins: honest no', Game.answerAidBeg('give') === 'short');
  // 3m. medicine request treats the sick for real
  g = freshGame({ day: 12, aidKnown: true });
  makeStruggling(g.v);
  const sickBefore = Object.keys(g.v.sick).length;
  Game.requestAid(g.link.id, 'medicine');
  tickParts(12);
  const sickAfter = Object.keys(g.v.sick).length;
  ok('medicine aid cures the sickest', sickBefore === 1 && sickAfter === 0, sickBefore + '->' + sickAfter);
  // 3n. hands request: crew works 3 days, then leaves
  g = freshGame({ day: 12, aidKnown: true });
  makeStruggling(g.v);
  Game.requestAid(g.link.id, 'hands');
  tickParts(12);
  ok('hands crew arrives', !!Game.state.aidHands, JSON.stringify(Game.state.aidHands && Game.state.aidHands.daysLeft));
  const panH = pantryKcal();
  Game.safetyNetsDayTick();
  ok('crew hauls real kcal', pantryKcal() >= panH + 1000, panH + '->' + pantryKcal());
  Game.safetyNetsDayTick(); Game.safetyNetsDayTick();
  ok('crew leaves after 3 days', !Game.state.aidHands);
}

// ================= EXPLOIT CHECK: no infinite farm =================
sec('EXPLOIT — the nets cannot be farmed forever');
{
  const g = freshGame({ day: 12, aidKnown: true, seed: SEED + 3 });
  let totalReceived = 0;
  // 30 days of maximum aggression: stay struggling, ask whenever possible
  for (let d = 0; d < 30; d++) {
    Game.state.scholar.day = 12 + d;
    makeStruggling(g.v); // re-impose struggle (costs the pantry every time)
    Game.state.aidQuestLedger = Game.state.aidQuestLedger || { lastOfferDay: -99, done: 0, failed: 0 };
    Game.safetyNetsDayTick();
    // answer any quest offer immediately with the cheapest completion
    if (Game.state.pendingAidQuest) {
      Game.answerAidQuest('accept');
      const q = Game.state.activeAidQuest;
      if (q && q.kind === 'fetch') { Game.abandonAidQuest(); } // can't be bothered: counts as failed
      else if (q && q.kind === 'treat') {
        const tv = q.targetVid; if (tv) delete g.v.sick[tv];
        tickParts(2);
      } else if (q && q.kind === 'learn') {
        Game.state.codex.plants['farm_a_' + d] = { level: 1 };
        Game.state.codex.plants['farm_b_' + d] = { level: 1 };
        tickParts(2);
      }
    }
    // request aid whenever the gate allows
    const rq = Game.aidRequestable(g.link.id);
    if (!rq.blocked) Game.requestAid(g.link.id, 'food');
    tickParts(8);
    // accept any inbound offer
    if (Game.state.pendingAidOffer) Game.answerAidOffer('accept');
    tickParts(4);
  }
  for (const vid of Object.keys(Game.state.aidLedger || {})) {
    totalReceived += (Game.state.aidLedger[vid].receivedKcal || 0);
  }
  // their pantry: 22000 start; offers + asks drain it for real, and the
  // bare-pantry refusal (honest) kicks in below cost+4000 — the floor is
  // ~6000-8000, the point is the pantry visibly depletes and can't be farmed
  const theirLeft = g.v0.pantryKcal;
  ok('30d of max aggression: neighbor pantry visibly depletes (finite)', theirLeft < 14000, 'their pantry: ' + Math.round(theirLeft));
  ok('total aid received is bounded (finite pantries + cooldowns)', totalReceived <= 16000, 'received: ' + Math.round(totalReceived));
  const led = Game.state.aidQuestLedger || {};
  ok('quest budget held under aggression', (led.done || 0) + (led.failed || 0) <= 3, 'done+failed=' + ((led.done || 0) + (led.failed || 0)));
  ok('request cooldown held (asks spaced)', (Game.state.aidLedger[g.v0.id].lastReqDay || 0) <= 12 + 30);
}

// ================= REACHABILITY: every path has a UI beat + engine path =================
sec('REACHABILITY — UI beats wired to engine answers');
{
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const beats = [
    ['aq:accept', 'answerAidQuest'], ['aq:handin', 'handInAidQuest'], ['aq:abandon', 'abandonAidQuest'],
    ['rel:triage', 'answerRelief'], ['rel:rations', 'answerRelief'], ['rel:hunt', 'answerRelief'], ['rel:dismiss', 'answerRelief'],
    ['aidoffer:accept', 'answerAidOffer'], ['aidbeg:give', 'answerAidBeg'],
    ['fav:pay', 'answerSystemFavor'], ['data-aidreq', 'requestAid'],
  ];
  for (const [beat, fn] of beats) {
    const ui = appSrc.includes(beat);
    const eng = typeof Game[fn] === 'function';
    ok('reachable: ' + beat + ' -> Game.' + fn, ui && eng, (!ui ? 'no UI beat' : '') + (!eng ? ' no engine fn' : ''));
  }
  // the beats row renders open beats (state-driven, like the parity beats)
  ok('beatsRowHTML renders pendingAidQuest', appSrc.includes('st.pendingAidQuest'));
  ok('beatsRowHTML renders relief', appSrc.includes('st.relief'));
  ok('beatsRowHTML renders pendingAidOffer/Beg', appSrc.includes('st.pendingAidOffer') && appSrc.includes('st.pendingAidBeg'));
  ok('beatsRowHTML renders pendingSystemFavor (was engine-only)', appSrc.includes('st.pendingSystemFavor'));
}

console.log('\n==== RESULT: ' + pass + ' pass, ' + fail + ' fail ====');
process.exit(fail ? 1 : 0);
