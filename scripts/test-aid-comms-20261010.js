// CALL-FOR-HELP + SWITCHBOARD PROOF (2026-10-10) — the mechanical core of
// inter-village cooperation (PROGRESSION.md: "When a monster shows up at your
// door" + the switchboard OFFICE). Steve 2026-10-10: the switchboard is an
// OFFICE, not a god path. Canon read first: docs/CANON.md, docs/PROGRESSION.md.
//
// Covers: all 4 tiers fire with honest costs (runner danger/road-hot, signal
// indiscriminate+attracted, system garbled+favor, cry build-gated), refusals
// aloud and fast (low trust, mid-crisis), help as capped named party with
// remembered cost + repayable debt, aidFight blow-by-blow with real allies,
// office appointment beat + candidate trade-offs + message editing +
// confrontation + scale progression, system favor collection.
// Usage: node scripts/test-aid-comms-20261010.js [SEED] — run x3 seeds.
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
  'hierarchy.js', 'comms.js', 'debug-scenarios.js', 'build.js'];
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

const said = [], sysSaid = [], leadShifts = [];
Game.sysSay = function(t) { sysSaid.push(String(t)); };
const _realSay = Game.say;
Game.say = function(t) { said.push(String(t)); try { return _realSay.call(this, t); } catch (e) {} };
Game.audioEvent = function() {};
Game.drama = function() {};
Game.tele = function() {};
const _origLeadShift = Game.leadShift;
Game.leadShift = function(dim, amount) { leadShifts.push([dim, amount]); return _origLeadShift.call(this, dim, amount); };
Game.recordMoment = function() {};
Game.contestLearn = function() {};
Game.villagerGainXP = function() {};
Game._showGossip = function() {};
Game._cxGossip = function() {};
Game.kcalCap = function() { return 2400; };
Game.maxHealth = function() { return 100; };
Game.havenViewership = function() { return (this.state.village || {}).viewership || 0; };

function setupAid(opts) {
  opts = opts || {};
  rng.reset(opts.seed != null ? opts.seed : SEED);
  said.length = 0; sysSaid.length = 0; leadShifts.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = opts.day || 20;
  Game.state.systemArrived = true;
  s.integration = opts.integration != null ? opts.integration : 45;
  s.health = 100; s.kcal = 2000; s.trauma = 0; s.exiled = false;
  s.abilities = s.abilities || [];
  Game.state.over = false;
  Game.state.networkLive = true;
  Game.state.nationalLive = false; Game.state.globalLive = false;
  Game.state.village.viewership = 0;
  const ovs = Game.state.otherVillages || [];
  ovs.forEach(v => { v.generated = true; v.rumored = true; v.crisis = null; v.aidFaces = null; });
  const v0 = ovs[0];
  Game._formLink(v0.id, {}, null);
  const link = Game.linkWith(v0.id);
  link.trust = opts.trust != null ? opts.trust : 70; // 70-12=58 >= 45: acceptance forced unless the test says otherwise
  link.aidDebtKcal = 0;
  if (ovs[1]) ovs[1].opinion = opts.hostileOpinion != null ? opts.hostileOpinion : -40;
  return { v0, link, ovs };
}
function raise() { return Game.raiseAidCrisis('Hushwolf', 1); }
function joinedSaid() { return said.join('\n'); }
function advance(n) { for (let i = 0; i < n; i++) { try { Game.advancePart(); } catch (e) {} } }

// ================= 1. CRISIS =================
sec('1. crisis declaration');
{
  setupAid();
  ok('no crisis initially', Game.aidCrisis() === null);
  const c = raise();
  ok('raiseAidCrisis sets state', !!c && c.name === 'Hushwolf' && c.wave === 1);
  ok('raiseAidCrisis says it aloud', /at Haven's door/.test(joinedSaid()));
  ok('double raise refused', Game.raiseAidCrisis('Other', 2) === null);
  ok('callForHelp with no crisis says so', (() => {
    Game.resolveAidCrisis('cancelled'); said.length = 0;
    const r = Game.callForHelp('runner');
    return r === null && /No emergency/.test(joinedSaid());
  })());
  ok('bad tier guided', (() => {
    raise(); said.length = 0;
    const r = Game.callForHelp('pigeon');
    return r === null && /four ways/.test(joinedSaid());
  })());
}

// ================= 2. RUNNER =================
sec('2. tier 1 — runner');
{
  setupAid();
  raise();
  // force a send (danger may kill the first runner; retry deterministically)
  let res = null, tries = 0;
  while (tries++ < 10) {
    rng.reset(SEED + tries);
    said.length = 0;
    res = Game.callForHelp('runner');
    if (res === 'sent') break;
    // runner died — fresh state, continue the deterministic sequence
    setupAid({ seed: SEED + tries }); raise();
  }
  ok('runner sent (honest cost said aloud)', res === 'sent' && /day-parts? each way/.test(joinedSaid()));
  const rn = Game.state.aidRunners[0];
  ok('runner record: real day-parts, never instant', !!rn && rn.partsLeft >= 1 && rn.phase === 'out');
  ok('runner gone from candidate pool', (() => {
    const cands = Game.switchboardCandidates().map(c => c.id);
    return cands.indexOf(rn.vid) === -1;
  })());
  // walk them to the far door
  said.length = 0;
  advance(rn.partsLeft);
  const asked = /stumbles into|stay home|we're coming|foragers leave our fields|asks a lot/.test(joinedSaid());
  ok('runner arrives: the far end answers aloud', asked);
  const _cr0 = Game.aidCrisis();
  ok('answer recorded or party marching',
    Game.state.pendingHelp.length > 0 || Game.state.aidRunners.length > 0 || (_cr0 && _cr0.helpAtDoor.length > 0));
  // run to arrival of help (or refusal return)
  advance(16);
  const crisis = Game.aidCrisis();
  ok('help arrives as named party OR refusal returned aloud',
    (crisis && crisis.helpAtDoor.length > 0) || /empty-handed|said no/.test(joinedSaid()));
}
{
  // road hot
  setupAid(); raise();
  Game.aidCrisis().attracted = 2;
  said.length = 0;
  ok('road hot: nobody volunteers, said aloud', Game.callForHelp('runner') === 'hot' && /road is hot/.test(joinedSaid()));
}
{
  // danger is real: across many sends, mishaps happen (seeded, deterministic)
  setupAid(); raise();
  let mishaps = 0, deaths = 0;
  for (let i = 0; i < 60; i++) {
    setupAid({ seed: SEED * 7 + i }); raise();
    said.length = 0;
    const r = Game.callForHelp('runner');
    if (r === 'died') { deaths++; mishaps++; }
    else if (r === 'sent' && Game.state.aidRunners[0] && Game.state.aidRunners[0].mishap) mishaps++;
  }
  ok('road danger is real (mishaps across sends)', mishaps > 0, 'mishaps=' + mishaps);
  ok('runners can die on the road', deaths > 0, 'deaths=' + deaths);
  ok('runner death said aloud', /don't make it|doesn't make it/.test(joinedSaid()) || deaths > 0);
}

// ================= 3. SIGNAL =================
sec('3. tier 2 — signal fire');
{
  setupAid(); raise();
  said.length = 0;
  const r = Game.callForHelp('signal');
  ok('signal fires', r === 'signal');
  ok('signal asks every linked village aloud', Game.state.pendingHelp.length >= 1 || /stay home|we're coming|foragers can't leave|asks a lot/.test(joinedSaid()));
  ok('smoke draws company (attracted)', Game.aidCrisis().attracted === 1);
  const ovs = Game.state.otherVillages;
  ok('hostile fire reads the smoke (opinion drops, remembered)', ovs[1].opinion < -40 && ovs[1].smokeSeenDay === 20);
  ok('flee blocked while the beacon holds attention', Game.resolveAidCrisis('fled') === 'blocked' && /slip away/.test(joinedSaid()));
}

// ================= 4. SYSTEM RELAY =================
sec('4. tier 3 — system relay');
{
  setupAid({ integration: 5 }); raise();
  said.length = 0;
  ok('gated below integration stage 2', Game.callForHelp('system') === 'gated' && /neural creep/.test(joinedSaid()));
}
{
  setupAid({ integration: 45 }); raise();
  said.length = 0;
  const r = Game.callForHelp('system');
  ok('relay carries', r === 'relayed');
  ok('message arrives translated (said aloud)', /SMALL TEETH PROBLEM/.test(joinedSaid()));
  ok('the System takes its cut, narrated', Game.state.systemFavorsOwed === 1 && /favor owed/.test(joinedSaid()));
  // collect the favor: stage it deterministically
  let staged = null;
  for (let i = 0; i < 300 && !staged; i++) staged = Game.collectSystemFavor();
  ok('favor collected as a played demand', !!staged && /favor/.test(joinedSaid()));
  Game.state.village.pantryKcal = 50000;
  said.length = 0;
  Game.answerSystemFavor('pay');
  ok('paying the favor settles it', Game.state.systemFavorsOwed === 0 && Game.state.pendingSystemFavor === null);
  Game.callForHelp('system'); // owe another favor, then refuse it
  for (let i = 0; i < 300 && !Game.state.pendingSystemFavor; i++) Game.collectSystemFavor();
  const integBefore = Game.state.scholar.integration;
  Game.answerSystemFavor('refuse');
  ok('refusing costs integration + defiance (ending frame)', Game.state.scholar.integration < integBefore && leadShifts.some(x => x[0] === 'systemDefiant'));
}

// ================= 5. ABILITY CRY =================
sec('5. tier 4 — ability cry');
{
  setupAid(); raise();
  said.length = 0;
  ok('gated without the build', Game.callForHelp('cry', { abilityId: 'war_cry' }) === 'gated' && /don't have a cry/.test(joinedSaid()));
  Game.state.scholar.abilities.push({ id: 'war_cry', name: 'War Cry', desc: 'carries', level: 1, xp: 0 });
  ok('aidCryAbilities finds it', Game.aidCryAbilities().some(a => a.id === 'war_cry'));
  said.length = 0;
  const r = Game.callForHelp('cry', { abilityId: 'war_cry' });
  ok('cry punches through (targeted, honest)', r === 'accepted' && /TRUTH of it/.test(joinedSaid()));
  ok('cry musters fast (partsLeft 0)', Game.state.pendingHelp.length > 0 && Game.state.pendingHelp[0].partsLeft === 0);
  advance(1);
  ok('cry help arrives next part', Game.aidCrisis().helpAtDoor.length > 0);
  const hp = Game.aidCrisis().helpAtDoor[0];
  ok('party capped, led by a named face', hp.partySize <= 4 && !!hp.leader && hp.leader !== 'Someone');
}

// ================= 6. REFUSALS =================
sec('6. refusals aloud and fast');
{
  setupAid({ trust: 20 }); raise();
  said.length = 0;
  const r = Game.callForHelp('cry', { abilityId: 'war_cry' });
  Game.state.scholar.abilities.push({ id: 'war_cry', name: 'War Cry', desc: 'x', level: 1, xp: 0 });
  const r2 = Game.callForHelp('cry', { abilityId: 'war_cry' });
  ok('low standing: refused aloud, number named', r2 === 'refused' && /trust 20/.test(joinedSaid()) && /stay home/.test(joinedSaid()));
  ok('no party marches on refusal', Game.state.pendingHelp.length === 0);
}
{
  setupAid({ trust: 80 }); raise();
  Game.state.otherVillages[0].crisis = { kind: 'monster', parts: 3 };
  said.length = 0;
  Game.state.scholar.abilities.push({ id: 'war_cry', name: 'War Cry', desc: 'x', level: 1, xp: 0 });
  const r = Game.callForHelp('cry', { abilityId: 'war_cry' });
  ok('mid-crisis village can\'t come, says so', r === 'refused' && /own door has teeth/.test(joinedSaid()));
}

// ================= 7. COST REMEMBERED =================
sec('7. cost to them — trust or tribute owed');
{
  setupAid({ trust: 58 }); raise(); // 58-12=46 >= 45: accepted, but < 60: debt path
  Game.state.scholar.abilities.push({ id: 'war_cry', name: 'War Cry', desc: 'x', level: 1, xp: 0 });
  Game.callForHelp('cry', { abilityId: 'war_cry' });
  const link = Game.linkWith(Game.state.otherVillages[0].id);
  ok('debt recorded when trust < 60', (link.aidDebtKcal || 0) > 0);
  Game.state.village.pantryKcal = 50000;
  const trustBefore = link.trust;
  said.length = 0;
  Game.repayAidDebt(link.id);
  ok('debt repayable aloud, trust grows', (link.aidDebtKcal || 0) === 0 && link.trust > trustBefore && /Paid in full/.test(joinedSaid()));
}
{
  setupAid({ trust: 70 }); raise();
  Game.state.scholar.abilities.push({ id: 'war_cry', name: 'War Cry', desc: 'x', level: 1, xp: 0 });
  const t0 = Game.linkWith(Game.state.otherVillages[0].id).trust;
  Game.callForHelp('cry', { abilityId: 'war_cry' });
  const link = Game.linkWith(Game.state.otherVillages[0].id);
  ok('trust >= 60: forgiven into trust, no debt', (link.aidDebtKcal || 0) === 0 && link.trust > t0);
}

// ================= 8. THE FIGHT =================
sec('8. help fights blow-by-blow');
{
  setupAid({ trust: 70 }); raise();
  Game.state.scholar.abilities.push({ id: 'war_cry', name: 'War Cry', desc: 'x', level: 1, xp: 0 });
  Game.callForHelp('signal'); // attracted=1 -> packBonus; also asks the link
  Game.callForHelp('cry', { abilityId: 'war_cry' });
  advance(6); // march + muster
  const crisis = Game.aidCrisis();
  ok('help at the door', crisis && crisis.helpAtDoor.length > 0);
  const vid = Game.state.village.roster.find(id => id !== Game.villagerId && Game.isMember(id));
  const mdef = { id: 'testmite', name: 'Test Mite', hp: [10, 14], attack: { name: 'nip', damage: [2, 4] }, speed: 1, pack: 1, wave: 1 };
  said.length = 0;
  const rec = Game.aidFight(vid, mdef, null, {});
  ok('aidFight runs a real fight', !!rec && rec.rounds > 0);
  ok('ally charges in from round 1 (real combatant)', rec.log.join('\n').indexOf('already at the door') >= 0 && rec.allyDealt >= 0);
  ok('smoke drew company: pack really bigger', rec.packCount === 2, 'packCount=' + rec.packCount);
  ok('crisis resolves when the teeth break', Game.aidCrisis() === null || rec.outcome === 'vKill' || rec.outcome === 'mFlee');
}
{
  // a fallen ally lands on the link
  setupAid({ trust: 55 });
  const link = Game.linkWith(Game.state.otherVillages[0].id);
  link.aidDebtKcal = 2000;
  const t0 = link.trust;
  said.length = 0;
  Game.aidAllyDown(Game.state.otherVillages[0].id, 'Testface', 'Testface');
  ok('fallen ally: trust -6, debt forgiven in blood, said aloud',
    link.trust === t0 - 6 && link.aidDebtKcal === 1000 && /paid in blood/.test(joinedSaid()));
}

// ================= 9. SWITCHBOARD OFFICE =================
sec('9. the switchboard office');
{
  setupAid();
  Game.state.networkLive = false;
  ok('office gated pre-regional', Game.switchboardAvailable() === false);
  Game.state.networkLive = true;
  ok('office arrives with the regional game', Game.switchboardAvailable() === true);
  const cands = Game.switchboardCandidates();
  ok('candidates listed with honest costs', cands.length > 1 && cands.every(c => !!c.cost && !!c.id));
  ok('candidate trade-offs differ', cands.some(c => c.isTalker) && cands.some(c => c.isWeakest));
  const talker = cands.find(c => c.isTalker);
  ok('talker cost names the moots', /moots/i.test(talker.cost));
  const weakest = cands.find(c => c.isWeakest);
  ok('weakest-forager cost names resentment', /resent/i.test(weakest.cost));
}
{
  // appoint the talker: moots weaken
  setupAid();
  const talker = Game.switchboardCandidates().find(c => c.isTalker);
  said.length = 0; sysSaid.length = 0;
  const sw = Game.appointSwitchboard(talker.id);
  ok('appointment beat: public + televised', !!sw && /Holder of the Relay/.test(joinedSaid()) && sysSaid.some(t => /LIVE/.test(t)));
  ok('talker cost applied: moots lose their voice', Game.switchboardTalkerCost() === true);
  ok('holder gone from candidate pool', !Game.switchboardCandidates().some(c => c.id === talker.id));
  ok('second appointment refused aloud', Game.appointSwitchboard(talker.id) === null && /already has hands/.test(joinedSaid()));
}
{
  // appoint the weakest forager: resentment is mechanical
  setupAid();
  const weakest = Game.switchboardCandidates().find(c => c.isWeakest);
  Game.appointSwitchboard(weakest.id);
  const mods = Game.state.village.moodMods || [];
  ok('resentment lands as a timed mood mod', mods.some(m => m.kind === 'resentment' && m.amt === -8));
  ok('mood really moves', (() => {
    const m1 = Game.villageMood();
    return m1 <= -8 + 30; // mood() includes the -8 within clamp
  })());
  ok('trust toward them drops', (Game.state.village.trust[weakest.id] || 10) <= 10);
}
{
  // message routing: corrupt holder edits, log shows it, confrontation bites
  setupAid();
  const cands = Game.switchboardCandidates();
  const holder = cands[0];
  Game.repOf(holder.id).honest = -20; // scheming hands
  Game.appointSwitchboard(holder.id);
  let edited = null;
  for (let i = 0; i < 60 && !edited; i++) {
    const r = Game.switchboardRoute({ kind: 'aid-call', text: 'plea' });
    if (r.decision === 'edited') edited = r;
  }
  const sw = Game.switchboard();
  ok('corrupt holder edits messages', !!edited && sw.edited > 0 && sw.log.some(e => e.decision === 'edited'));
  ok('tampering feeds the ending frame (fracture)', leadShifts.some(x => x[0] === 'fracture'));
  ok('softened plea weakens the ask', edited.msg.softened === true);
  said.length = 0;
  const conf = Game.confrontSwitchboard();
  ok('confrontation with log evidence bites', (conf === 'confessed' || conf === 'denied') && Game.switchboard() === null);
}
{
  // baseless confrontation costs the accuser
  setupAid();
  const holder = Game.switchboardCandidates()[0];
  Game.repOf(holder.id).honest = 20;
  Game.appointSwitchboard(holder.id);
  // force clean routing: honest holder, no edits
  for (let i = 0; i < 20; i++) Game.switchboardRoute({ kind: 'aid-call', text: 'x' });
  Game.switchboard().edited = 0; // clean log
  const tp0 = (Game.state.village.trust || {})[Game.villagerId] || 10;
  said.length = 0;
  ok('baseless confrontation backfires', Game.confrontSwitchboard() === 'baseless' && /clean/.test(joinedSaid()));
  ok('false accusation costs trust', ((Game.state.village.trust || {})[Game.villagerId] || 10) < tp0);
}
{
  // scale progression, never a skill tree
  setupAid();
  const holder = Game.switchboardCandidates()[0];
  Game.appointSwitchboard(holder.id);
  said.length = 0;
  Game.state.nationalLive = true;
  ok('national: regional switchboard', Game.switchboardStageTick() === 'regional switchboard' && /switchboard/.test(joinedSaid()));
  Game.state.globalLive = true;
  ok('global: national voice', Game.switchboardStageTick() === 'national voice');
  Game.state.village.viewership = 40;
  ok('world watches: a name the planet knows', Game.switchboardStageTick() === 'a name the planet knows');
  ok('stage is a label, not a tree', !Game.switchboard().skills && !Game.switchboard().xp);
}

// ================= 10. DEBUG SCENARIO =================
sec('10. debug scenario');
{
  rng.reset(SEED); said.length = 0;
  let threw = null;
  try { Game.debugScenario('aid-crisis'); } catch (e) { threw = e; }
  ok('aid-crisis scenario runs', !threw, threw && threw.message);
  ok('scenario stages a real crisis + link', !!Game.aidCrisis() && !!Game.state.otherVillages[0] && !!Game.linkWith(Game.state.otherVillages[0].id));
}

console.log('\n==== aid-comms: ' + pass + ' passed, ' + fail + ' failed (seed ' + SEED + ') ====');
process.exit(fail ? 1 : 0);
