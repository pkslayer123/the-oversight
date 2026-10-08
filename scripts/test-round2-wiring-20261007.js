// test-round2-wiring-20261007.js (Steve 2026-10-07)
// Proof test for Round 2 wiring in src/js/game.js:
//   1. audio emitters fire at knowledge-reveal moments (skill, codex-study,
//      synergy, integration, slots)
//   2. synergy discovery fanfare: ✨ say + discovery text as the System's
//      excited voice + distinct 'synergyDiscovered' audio hook
//   3. integration level-up beats: keeper reacts, System names the tier,
//      slot reminder honestly tied to the NEURAL scale (scholar.integration),
//      not the codex-linked scale.
// Node-only (no jest). Run: node scripts/test-round2-wiring-20261007.js
'use strict';
global.window = global; // stub for eval phase (AGENTS.md: delete before "playing")
const fs = require('fs');
const path = require('path');
const repo = path.resolve(__dirname, '..');

eval(fs.readFileSync(path.join(repo, 'src/js/game.js'), 'utf8'));
const Game = global.Scattering.Game;
const synergies = JSON.parse(fs.readFileSync(path.join(repo, 'src/data/synergies.json'), 'utf8'));
const synList = synergies.synergies || synergies;

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label); }
}

// Fresh harness instance: captures say() and audioEvent() payloads.
function makeGame() {
  const g = Object.create(Game);
  const said = [], audio = [];
  g.say = (t) => said.push(String(t));
  g.tele = () => {};
  g.spendDayPart = () => {};
  g.abilityLevel = () => 1;
  g.audio = {
    knowledgeReveal(d) { audio.push({ name: 'knowledgeReveal', data: d }); },
    synergyDiscovered(d) { audio.push({ name: 'synergyDiscovered', data: d }); },
  };
  g.state = {
    scholar: { day: 1, codex: { plants: {}, techniques: {}, recipes: {}, animals: {} }, integration: 5 },
    codex: { skills: {} },
    systemArrived: true,
    village: { roster: [] },
    otherVillages: [],
  };
  g.map = { px: 4, py: 4 };
  g.data = { plants: [], animals: [], knowledge: [], synergies: synList };
  return { g, said, audio };
}
const audioOf = (audio, name) => audio.filter(a => a.name === name);

// ---------- T1: learnSkill (skill level-up) emits knowledgeReveal ----------
console.log('T1: learnSkill knowledgeReveal emitter');
{
  const { g, said, audio } = makeGame();
  g.data.knowledge = [{ id: 'k_test', name: 'Test Lore', levels: { '1': 'basics' }, backgrounds: [] }];
  const r = g.learnSkill('k_test', 1, 'practice');
  ok(r === true, 'learnSkill returns true on genuine gain');
  const ev = audioOf(audio, 'knowledgeReveal');
  ok(ev.length === 1, 'exactly one knowledgeReveal emitted');
  ok(ev[0] && ev[0].data.kind === 'skill' && ev[0].data.id === 'k_test' && ev[0].data.level === 1 && ev[0].data.via === 'practice',
    'payload carries what was learned: ' + JSON.stringify(ev[0] && ev[0].data));
  ok(said.some(t => t.includes('📖 LEARNED')), 'say announces the learning');
  const r2 = g.learnSkill('k_test', 1, 'practice');
  ok(r2 === false && audioOf(audio, 'knowledgeReveal').length === 1, 'repeat at same level: no re-emit');
}

// ---------- T2: studyVillageCodex: aggregate codex emitter + integration beat ----------
console.log('T2: studyVillageCodex codex emitter + integration level-up beat');
{
  const { g, said, audio } = makeGame();
  g.data.plants = [{ id: 'dandelion', name: 'Dandelion' }];
  g.state.otherVillages = [{
    id: 'village_0', name: 'Emberhold', x: 4, y: 4,
    knowledgeProfile: { focus: 'foragers' },
    codex: {
      plants: { dandelion: { level: 2 } },
      techniques: { smoke_signal: { level: 1, strategy: 'signalers' } },
      recipes: { pemmican: {} },
      animals: {},
    },
  }];
  const ret = g.studyVillageCodex('village_0');
  const codexEv = audioOf(audio, 'knowledgeReveal').filter(a => a.data.kind === 'codex');
  ok(codexEv.length === 1, 'one aggregate codex reveal (not one per page)');
  ok(codexEv[0] && codexEv[0].data.village === 'village_0' && codexEv[0].data.total === 3 &&
     codexEv[0].data.plants === 1 && codexEv[0].data.techniques === 1 && codexEv[0].data.recipes === 1,
    'payload has the breakdown: ' + JSON.stringify(codexEv[0] && codexEv[0].data));
  ok(typeof ret === 'string' && ret.includes('Emberhold'), 'returns a study summary');
  // integration level-up beat (linkedCodices was empty -> systemIntegrationLevel 1)
  const intEv = audioOf(audio, 'knowledgeReveal').filter(a => a.data.kind === 'integration');
  ok(intEv.length === 1 && intEv[0].data.level === 1, 'integration level-up emits knowledgeReveal {kind:integration, level:1}');
  ok(said.some(t => t.includes('keeper of') || t.includes('codex keeper')), 'a villager (the codex keeper) reacts');
  ok(said.some(t => t.includes('SYSTEM INTEGRATION L1')), 'System names the new tier');
  ok(said.some(t => t.includes('neural integration') && t.includes('Ability slots')), 'slot reminder honestly tied to the NEURAL scale');
  // second study: nothing new learned, no codex emitter, no repeat beat
  said.length = 0; audio.length = 0;
  const ret2 = g.studyVillageCodex('village_0');
  ok(audioOf(audio, 'knowledgeReveal').length === 0, 'nothing-new study: silent (no emitters, no repeat beat)');
  ok(typeof ret2 === 'string' && ret2.includes("holds nothing you don't already know"), 'nothing-new study says so');
}

// ---------- T3: integrate() threshold crossing -> slot beat ----------
console.log('T3: integrate() slot beat on neural threshold crossing');
{
  const { g, said, audio } = makeGame();
  g.state.scholar.integration = 19; // slots: 1
  g.integrate(5, 'book');           // -> 24, crosses 20, slots: 2
  ok(said.some(t => t.includes('Neural interface stable')), 'threshold message still said');
  ok(said.some(t => t.includes('ability slots: 2')), 'slot beat announces the new slot count');
  const slotEv = audioOf(audio, 'knowledgeReveal').filter(a => a.data.kind === 'slots');
  ok(slotEv.length === 1 && slotEv[0].data.slots === 2 && slotEv[0].data.integration === 24,
    'slots hook payload: ' + JSON.stringify(slotEv[0] && slotEv[0].data));
}
{
  // non-slot gain: no beat, no noise
  const { g, said, audio } = makeGame();
  g.state.scholar.integration = 22;
  g.integrate(3, 'discovery'); // 22 -> 25, no threshold crossed
  ok(audioOf(audio, 'knowledgeReveal').length === 0, 'no threshold crossing: no emitter');
  ok(!said.some(t => t.includes('ability slots')), 'no threshold crossing: no slot beat');
}

// ---------- T4: unlockSynergy fanfare ----------
console.log('T4: unlockSynergy fanfare');
{
  const { g, said, audio } = makeGame();
  g.state.scholar.synergies = [];
  g.state.scholar.activeSynergies = [];
  const syn = synList[0];
  g.unlockSynergy(syn);
  ok(g.state.scholar.synergies.includes(syn.id), 'synergy pushed');
  const fanEv = audioOf(audio, 'synergyDiscovered');
  ok(fanEv.length === 1 && fanEv[0].data.id === syn.id && fanEv[0].data.name === syn.name,
    'distinct synergyDiscovered hook: ' + JSON.stringify(fanEv[0] && fanEv[0].data));
  const krEv = audioOf(audio, 'knowledgeReveal').filter(a => a.data.kind === 'synergy');
  ok(krEv.length === 1, 'knowledgeReveal synergy hook still fires (not replaced)');
  ok(said.some(t => t.includes('✨ SYNERGY DISCOVERED: ' + syn.name)), '✨ SYNERGY DISCOVERED say');
  ok(said.some(t => t.includes('📺 SYSTEM: "' + syn.discovery + '"')), "discovery text framed as the System's excited voice");
  // duplicate unlock: silent
  said.length = 0; audio.length = 0;
  g.unlockSynergy(syn);
  ok(said.length === 0 && audio.length === 0, 'duplicate unlock: silent');
}
{
  // pre-arrival: discovery still said, but WITHOUT the 📺 SYSTEM tag
  // (the overlay never speaks first — identifyPlant voice gate)
  const { g, said, audio } = makeGame();
  g.state.systemArrived = false;
  g.state.scholar.synergies = [];
  g.state.scholar.activeSynergies = [];
  const syn = synList[1];
  g.unlockSynergy(syn);
  ok(said.some(t => t.includes(syn.discovery)) && !said.some(t => t.includes('📺 SYSTEM')),
    'pre-arrival: discovery said ungated, no 📺 SYSTEM tag');
  ok(audioOf(audio, 'synergyDiscovered').length === 1, 'pre-arrival: fanfare hook still fires');
}

// ---------- T5: standing rule — synergies take no ability slots ----------
console.log('T5: standing rules');
{
  const { g } = makeGame();
  const before = g.abilitySlots();
  g.state.scholar.synergies = [synList[0].id, synList[1].id];
  ok(g.abilitySlots() === before, 'discovered synergies do not change abilitySlots()');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
