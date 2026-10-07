#!/usr/bin/env node
// KNOWLEDGE-LEAK SWEEP (Steve 2026-10-07) — flesh-out loop queue #7.
// Steve's law: "If you don't know, it doesn't show."
//
// Systematic headless audit of knowledge gates across player-visible surfaces.
// The ENGINE IS LOADED FROM GIT HEAD (never the dirty worktree): every
// assertion below is a statement about the committed code, not sibling work.
// Seeded mulberry32 PRNG (SEED env override, fixed default); green across 2
// seeds required. Plain node, NOT jest.
//
// Surfaces probed:
//   S1  monster display primitives (monsterDisplayName/monsterNoun)
//   S2  telegraph cue gating, fresh codex vs learned (gallowdeer benchmark)
//   S3  REGRESSION: corpse-loot itemDisplayName (fixed 2c5eea3)
//   S4  REGRESSION: justiceConfront unwitnessed naming (fixed 2c5eea3)
//   S5  whoTag occupation gating (truthful villagers)
//   S6  pantry gating (pantryItemKnown)
//   S7  journal/codex gates (journalPerson, codexPlantLine)
//   S8  sentiment-bond gate (Channel button, bond perception, journal/codex)
//   S9  monster corpse examine, fresh codex (corpseDesc descriptor path)
//   S10 audit-2 beats still live at HEAD (understudy rehearsing — driven;
//       union_rep picket summon, walkout, paparazzo x3, landlord — verified
//       by code read against HEAD in the notes; say-capture where feasible)
//   S11 static scans: arrival pools, combat-card names, loot grant text
//
// A FAIL here is a successful audit finding: it names the leak precisely
// (file:line at HEAD) for the engine owner. This script does NOT fix.
//
// Usage: node scripts/test-knowledge-leaks-20261007.js [SEED]
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const atHead = (f) => execFileSync('git', ['show', 'HEAD:' + f],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });

// --- seeded PRNG (PROOF-TEST RNG STABILITY: fixed default, SEED override) ---
const SEED = parseInt(process.env.SEED || process.argv[2] || '20261007', 10);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(SEED);

// --- data + engine from HEAD ---
global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(atHead(f))),
});
global.window = global; // stub for equipment.js load-time window check
// --- minimal DOM stub (drama.js touches document at load) ---
function fakeEl() {
  return { style: { setProperty() {} }, innerHTML: '',
    classList: { add() {}, remove() {} }, appendChild() {}, remove() {},
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 40, height: 40 }),
    offsetWidth: 100 };
}
global.document = { createElement: () => fakeEl(), querySelector: () => null,
  querySelectorAll: () => [], getElementById: () => null, contains: () => false,
  head: { appendChild() {} }, body: fakeEl() };
global.getComputedStyle = () => ({ position: 'static' });
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
const SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js',
 'src/js/engine/calories.js', 'src/js/engine/day.js', 'src/js/engine/forage.js',
 'src/js/engine/combat.js', 'src/js/game.js', 'src/js/encounters.js',
 'src/js/conversation.js', 'src/js/convo-mood.js', 'src/js/convoTopics.js',
 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js',
 'src/js/contests.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/villager-agency.js',
 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
 'src/js/debug-scenarios.js', 'src/js/build.js', 'src/js/drama.js'];
SCRIPTS.forEach(f => eval(atHead(f)));
delete global.window; // sync combat path (AGENTS.md lesson)
const Game = globalThis.Scattering.Game;
const S = globalThis.Scattering;

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name); console.log('FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

// --- say capture ---
const said = [];
function hookSay() {
  said.length = 0;
  if (Game.say._kleak) return;
  const orig = Game.say.bind(Game);
  const wrapped = function (m) { said.push(String(m)); return orig(m); };
  wrapped._kleak = true; wrapped._orig = orig;
  Game.say = wrapped;
}
hookSay();
const saidText = () => said.join('\n');

// --- fight helpers ---
const P = () => Game.tbFighter('p');
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); if (p) { p.moveLeft = 0; p.acted = true; }
  Game.tbAfterPlayerAction();
}
function endFight() { try { if (Game.tbfight && !Game.tbfight.over) Game.tbEnd('fled'); } catch (e) {} }
function feed() { const s = Game.state.scholar; s.health = 5000; s.maxHealth = 5000; s.kcal = 4000; s.hydration = 100; }
function flatGrid() { return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')); }

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.tickAction = () => {};
  Game.genDetail = flatGrid;
  feed();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4;
  console.log('knowledge-leak sweep, HEAD=' + execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim() + ', seed=' + SEED);

  // ============ S1: monster display primitives ============
  section('S1 monster display primitives');
  Game.state.codex.monsters = {}; // fresh codex
  check('S1 unknown monster shows descriptor, not true name',
    Game.monsterDisplayName('gallowdeer') === 'the thing with headlights for eyes, standing too still',
    'got=[' + Game.monsterDisplayName('gallowdeer') + ']');
  check('S1 true name never shows pre-System',
    !/Highbeam Deer/.test(Game.monsterDisplayName('gallowdeer')));
  check('S1 monsterNoun is sentence-safe and gated',
    Game.monsterNoun('gallowdeer') === 'thing with headlights for eyes',
    'got=[' + Game.monsterNoun('gallowdeer') + ']');
  // village naming reveals
  Game.state.codex.monsters.gallowdeer = { villageName: 'Headlight Harry' };
  check('S1 village-agreed name shows once earned',
    Game.monsterDisplayName('gallowdeer') === 'Headlight Harry');
  check('S1 monsterNoun keeps proper-name casing',
    Game.monsterNoun('gallowdeer') === 'Headlight Harry');
  Game.state.codex.monsters = {};

  // ============ S2: telegraph cue gating (gallowdeer, fresh vs learned) ============
  // NOTE: sayTelegraphOnce is intentionally silent in combat (the grid is the
  // warning); the cue TEXT is probed via tbTelegraphCue on a real declare.
  section('S2 telegraph cue gating');
  Game.state.codex.monsters = {};
  said.length = 0;
  Game.startCombat('gallowdeer');
  check('S2 fight starts', !!Game.tbfight, 'no tbfight');
  const mdeer = Game.tbfight && Game.tbfight.fighters.find(f => f.kind === 'monster');
  check('S2 deer fighter name is the gated descriptor',
    !!mdeer && !/Highbeam Deer/.test(mdeer.name), 'name=[' + (mdeer && mdeer.name) + ']');
  // Declare through the REAL path (encDeclareBeam), fresh codex.
  const atkName = 'Ocular Discharge';
  const knownCue = 'The freeze is the tell';
  let cueFresh = null;
  try {
    Game.encDeclareBeam(mdeer, { f: P() });
    cueFresh = Game.tbTelegraphCue(mdeer);
  } catch (e) { console.log('   declare err: ' + e.message); }
  check('S2 declare produced a cue', !!cueFresh, 'no cue');
  if (cueFresh) {
    check('S2 fresh-codex cue hides attack true name', !cueFresh.includes(atkName),
      'LEAK: ' + cueFresh.slice(0, 140));
    check('S2 fresh-codex cue hides knownCue coaching', !cueFresh.includes(knownCue),
      'LEAK: ' + cueFresh.slice(0, 140));
    check('S2 fresh-codex cue has no "You know this one"',
      !/You know this one/.test(cueFresh), 'LEAK: ' + cueFresh.slice(0, 140));
    check('S2 fresh-codex cue is dread, not tactics',
      /It freezes\. Like a deer in headlights/.test(cueFresh) &&
      !/circle it wide|keep moving|sidestep|dodge|MOVE, don't stare/i.test(cueFresh),
      'cue=[' + cueFresh.slice(0, 120) + ']');
  }
  endFight();

  // learned: grant the pattern, re-cue
  Game.state.codex.monsters = {};
  said.length = 0;
  Game.startCombat('gallowdeer');
  const m2 = Game.tbfight.fighters.find(f => f.kind === 'monster');
  // simulate surviving the attack: grant pattern knowledge directly
  Game.state.codex.monsters.gallowdeer = { patterns: { 'Ocular Discharge': 'beam desc' } };
  check('S2 tbPatternKnown true after learning', Game.tbPatternKnown('gallowdeer', 'Ocular Discharge'));
  m2.telegraph = { kind: 'squares', targetKey: 'p', turnsLeft: 2, cueText: null, firing: 1 };
  const cueKnown = Game.tbTelegraphCue(m2);
  check('S2 learned cue names the attack', cueKnown.includes('Ocular Discharge'),
    'cue=[' + cueKnown.slice(0, 120) + ']');
  check('S2 learned cue carries coaching marker', /You know this one/.test(cueKnown));
  check('S2 learned cue includes knownCue', cueKnown.includes(knownCue),
    'cue=[' + cueKnown.slice(0, 160) + ']');
  // encAttackName gate
  Game.state.codex.monsters = {};
  check('S2 encAttackName is "the attack" pre-learning',
    Game.encAttackName(m2, 'Ocular Discharge') === 'the attack',
    'got=[' + Game.encAttackName(m2, 'Ocular Discharge') + ']');
  Game.state.codex.monsters.gallowdeer = { patterns: { 'Ocular Discharge': 'x' } };
  check('S2 encAttackName reveals true name post-learning',
    Game.encAttackName(m2, 'Ocular Discharge') === 'Ocular Discharge');
  endFight();

  // ============ S3 REGRESSION: corpse-loot itemDisplayName (fixed 2c5eea3) ============
  section('S3 corpse-loot display regression');
  const knife = { plantId: 'stone_knife', name: 'Stone knife', units: 1 };
  check('S3 corpse-looted tool shows its name, not plant matter',
    Game.itemDisplayName(knife) === 'Stone knife' && !/unfamiliar plant matter/.test(Game.itemDisplayName(knife)),
    'got=[' + Game.itemDisplayName(knife) + ']');
  const eff = { plantId: 'effect_0', name: 'Strange effect', units: 1 };
  check('S3 synthetic effect_* id shows its name',
    !/unfamiliar plant matter/.test(Game.itemDisplayName(eff)), 'got=[' + Game.itemDisplayName(eff) + ']');
  const keep = { plantId: 'keepsake', name: "Mara's locket", units: 1, keepsake: true };
  check('S3 keepsake shows its name',
    Game.itemDisplayName(keep) === "Mara's locket", 'got=[' + Game.itemDisplayName(keep) + ']');
  // real plants still gated
  Game.state.codex.plants = {};
  const unk = Game.itemDisplayName({ plantId: 'dandelion', name: 'Dandelion' });
  check('S3 unknown plant routes through gated plant display',
    unk === Game.plantDisplayName('dandelion') && !/Dandelion/.test(unk),
    'got=[' + unk + ']');
  Game.identifyPlant('dandelion', 'test');
  const kn = Game.itemDisplayName({ plantId: 'dandelion', name: 'Dandelion' });
  check('S3 known plant shows its name', kn === 'Dandelion', 'got=[' + kn + ']');
  // meat_* path
  const meat = { plantId: 'meat_gallowdeer', name: 'unknown flesh', foodKind: 'meat', edible: false };
  check('S3 unknown meat shows stored name, not plant matter',
    Game.itemDisplayName(meat) === 'unknown flesh', 'got=[' + Game.itemDisplayName(meat) + ']');

  // ============ S4 REGRESSION: justiceConfront unwitnessed (fixed 2c5eea3) ============
  section('S4 justice confrontation regression');
  const v = Game.state.village, me = Game.villagerId;
  const others = () => v.roster.filter(id => id !== me);
  const j = Game.justiceState();
  j.crimes.length = 0; j.stage = 2; j.confrontedBy = null; j.pendingConfront = false;
  // static confirmation of the dddeb76 stale-base revert
  const jsrc = atHead('src/js/justice.js');
  check('S4 witnessed-filter survives in justiceConfront (revert check)',
    /c\.witnessed !== false/.test(jsrc),
    'REVERTED by dddeb76, never restored: justice.js justiceConfront counts unwitnessed crimes again');
  const v2 = others()[2];
  Game.recordCrime('murder', { victim: v2, witnessed: false });
  said.length = 0;
  try { Game.justiceConfront(); } catch (e) { console.log('   confront err: ' + e.message); }
  const ct = saidText();
  check('S4 confrontation fires', /⚖/.test(ct), ct.slice(0, 80));
  check('S4 unwitnessed murder is NOT named',
    !/dead|killed|whose hands|what you did|murder/i.test(ct), 'LEAK: ' + ct.slice(0, 140));
  // witnessed case still gets the murder branch
  j.crimes.length = 0; j.confrontedBy = null; j.pendingConfront = false;
  Game.recordCrime('murder', { victim: v2, witnessed: true });
  said.length = 0;
  try { Game.justiceConfront(); } catch (e) {}
  const ct2 = saidText();
  check('S4 witnessed murder still gets the murder branch',
    /dead|killed|whose hands|what you did|murder/i.test(ct2), ct2.slice(0, 140));
  j.crimes.length = 0;

  // ============ S5: whoTag occupation gating ============
  section('S5 whoTag occupation');
  const truthful = others().find(id => {
    try { const lies = (Game.vpOf(id) || {}).lies; return !(lies && lies.occupation && !lies.occupation.confessed); }
    catch (e) { return true; }
  });
  check('S5 found a truthful villager to probe', !!truthful);
  if (truthful) {
    // ensure no journal occupation recorded
    try { const jp = Game.journalPerson(truthful); if (jp) delete jp.occupation; } catch (e) {}
    const tag0 = Game.whoTag(truthful);
    const vdef = (Game.data.villagers || []).find(x => x.id === truthful) || {};
    const occ = String(vdef.formerOccupation || vdef.occupation || '').toLowerCase();
    check('S5 pre-knowledge whoTag names no true occupation',
      !occ || !tag0.toLowerCase().includes(occ),
      'LEAK tag=[' + tag0 + '] occ=[' + occ + ']');
    // earn it: journal records the heard occupation
    try {
      const jp = Game.journalPerson(truthful);
      if (jp && occ) { jp.occupation = { value: vdef.formerOccupation || vdef.occupation }; }
    } catch (e) {}
    const tag1 = Game.whoTag(truthful);
    check('S5 post-knowledge whoTag shows the earned occupation',
      !occ || tag1.toLowerCase().includes(occ),
      'tag=[' + tag1 + '] occ=[' + occ + ']');
  }

  // ============ S6: pantry gating ============
  section('S6 pantry gating');
  Game.state.codex.plants = {};
  check('S6 unknown plant pantry item is not known',
    Game.pantryItemKnown({ plantId: 'dandelion', name: 'x' }) === false);
  Game.identifyPlant('dandelion', 'test');
  check('S6 known plant pantry item is known',
    Game.pantryItemKnown({ plantId: 'dandelion', name: 'Dandelion' }) === true);
  check('S6 staple (no plantId) is mundane, always shown',
    Game.pantryItemKnown({ name: 'Foraged food' }) === true);
  Game.state.codex.monsters = {}; Game.state.systemArrived = false;
  check('S6 unnamed-monster meat is not known',
    Game.pantryItemKnown({ plantId: 'meat_gallowdeer', name: 'x' }) === false);
  Game.state.codex.monsters.gallowdeer = { villageName: 'Headlight Harry' };
  check('S6 named-monster meat is known',
    Game.pantryItemKnown({ plantId: 'meat_gallowdeer', name: 'x' }) === true);
  Game.state.codex.monsters = {};

  // ============ S7: journal/codex gates ============
  section('S7 journal/codex gates');
  Game.state.codex.plants = {};
  let line = null;
  try { line = Game.codexPlantLine('dandelion'); } catch (e) { line = 'ERR:' + e.message; }
  check('S7 codex plant line hides name pre-L1',
    line == null || !/Dandelion/.test(String(line)), 'line=[' + String(line).slice(0, 120) + ']');
  Game.identifyPlant('dandelion', 'test');
  let line2 = null;
  try { line2 = Game.codexPlantLine('dandelion'); } catch (e) { line2 = 'ERR:' + e.message; }
  check('S7 codex plant line shows name post-identification',
    line2 != null && /Dandelion/i.test(String(line2)), 'line=[' + String(line2).slice(0, 120) + ']');
  // journal people entries: name gating
  try {
    const jp = Game.journalPerson(others()[0]);
    check('S7 journalPerson entry exists', !!jp);
  } catch (e) { check('S7 journalPerson entry exists', false, e.message); }

  // ============ S8: sentiment-bond gate ============
  section('S8 sentiment-bond gate');
  const pg = Game.progState ? Game.progState() : null;
  check('S8 progState exists', !!pg);
  if (pg) pg.sentimentTaught = false;
  check('S8 sentiment not taught on a fresh run', Game.sentimentTaught() === false);
  // a keepsake in the pack
  s.inventory = s.inventory || [];
  const ring = { itemId: 'wedding_ring', name: 'Wedding ring', units: 1, sentimental: true, spoilDay: 9999 };
  if (!s.inventory.some(i => i.itemId === 'wedding_ring')) s.inventory.push(ring);
  const ridx = s.inventory.findIndex(i => i.itemId === 'wedding_ring');
  const ch0 = Game.channelSentiment(ridx);
  check('S8 channeling pre-teaching is honest-unknown',
    /Nothing happens\. Not yet/.test(String(ch0)), 'got=[' + String(ch0).slice(0, 80) + ']');
  Game.teachSentiment();
  check('S8 sentimentTaught flips after teaching', Game.sentimentTaught() === true);
  const ch1 = Game.channelSentiment(ridx);
  check('S8 channeling post-teaching does something',
    !/Nothing happens/.test(String(ch1)), 'got=[' + String(ch1).slice(0, 80) + ']');
  // bond perception gate: the say branch at game.js tbEnd victory
  const src = atHead('src/js/game.js');
  check('S8 bond number is sentiment-gated in code',
    /sentimentTaught\(\)\)[\s\S]{0,200}\(bond/.test(src) || /sentimentTaught && this\.sentimentTaught\(\)\)/.test(src),
    'bond-perception branch not found');
  // journal-or-codex: is the bond visible anywhere recorded?
  const journalSrc = atHead('src/js/journal.js');
  const cpsrc = atHead('src/js/codex-people.js');
  const bondInJournal = /bond/.test(journalSrc) && /sentimental|keepsake/i.test(journalSrc);
  check('S8 bond has a journal surface (info)', true,
    bondInJournal ? 'bond mentioned in journal.js' : 'NO bond surface in journal.js — bond lives only in say + Channel button');
  const bondInCodex = /bond/.test(cpsrc);
  check('S8 bond has a codex-people surface (info)', true,
    bondInCodex ? 'bond mentioned in codex-people.js' : 'NO bond surface in codex-people.js');

  // ============ S9: monster corpse examine, fresh codex ============
  section('S9 monster corpse examine');
  Game.state.codex.monsters = {}; Game.state.systemArrived = false;
  said.length = 0;
  Game.startCombat('gallowdeer');
  const foeD = Game.tbfight.fighters.find(f => f.kind === 'monster');
  feed();
  try { Game.tbDamage(foeD.key, 99999, 'the survey blow', 'p'); } catch (e) { console.log('   tbDamage err: ' + e.message); }
  try { if (Game.tbfight && !Game.tbfight.over) Game.tbEnd('won'); } catch (e) {}
  said.length = 0;
  const corpses = (Game.corpses ? Game.corpses() : []).filter(c => c.kind === 'monster' && !c.buried);
  check('S9 monster corpse registered', corpses.length > 0, 'none found');
  const mc = corpses[corpses.length - 1];
  if (mc) {
    check('S9 corpse record descriptor is gated',
      !/Highbeam Deer/.test(mc.descriptor || ''), 'descriptor=[' + (mc.descriptor || '') + ']');
    Game.map.px = (mc.node && mc.node.x) || 0; Game.map.py = (mc.node && mc.node.y) || 0;
    try { Game.examineCorpse(mc.id); } catch (e) { console.log('   examine err: ' + e.message); }
    const ex = saidText();
    check('S9 corpse examine names no true name',
      !/Highbeam Deer/.test(ex), 'LEAK: ' + ex.slice(0, 160));
    check('S9 corpse examine uses the unknown descriptor',
      /headlights/i.test(ex), ex.slice(0, 160));
  }

  // ============ S10: audit-2 beats — verify state at HEAD ============
  section('S10 audit-2 beats at HEAD');
  // 10a. UNDERSTUDY rehearsing beat, driven as a player, fresh codex.
  Game.state.codex.monsters = {};
  said.length = 0;
  Game.startCombat('understudy');
  const foeU = Game.tbfight && Game.tbfight.fighters.find(f => f.kind === 'monster');
  check('S10a understudy fight starts', !!foeU);
  s.equipped = s.equipped || {};
  s.equipped.weapon = { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' };
  let g2 = 0, rehearsed = false;
  const preU = said.length;
  while (Game.tbfight && !Game.tbfight.over && g2++ < 30 && !rehearsed) {
    feed();
    const foe = Game.tbfight.fighters.find(f => f.key !== 'p' && f.alive && !f.fled);
    if (!foe) break;
    if (Game.tbIsPlayerTurn() && foe.hp > 1) {
      try { Game.tbPlayerStrike(foe.key); } catch (e) { break; }
      endTurn();
    } else if (Game.tbIsPlayerTurn()) { endTurn(); }
    else { try { Game.tbAdvance(); } catch (e) { break; } }
    rehearsed = said.slice(preU).some(t => /It copies at 50%|OPENING STEAL/.test(t));
  }
  const uSays = said.slice(preU).filter(t => /It copies at 50%|OPENING STEAL|DESPERATE IMPROV/.test(t));
  const codexKnows = Game.tbPatternKnown('understudy', 'Your Move');
  if (uSays.length && !codexKnows) {
    check('S10a rehearsing/steal beat is knowledge-gated', false,
      'LEAK while unknowing: "' + uSays[0].slice(0, 130) + '"');
  } else if (!uSays.length) {
    check('S10a rehearsing beat fired (inconclusive)', false, 'beat did not fire in 30 rounds');
  } else {
    check('S10a rehearsing/steal beat is knowledge-gated', true);
  }
  endFight();

  // 10b. static verification of the remaining audit-2 sites at HEAD
  const gsrc = atHead('src/js/game.js');
  const picketLine = gsrc.match(/PICKET LINE![\s\S]{0,160}/);
  check('S10b union_rep picket summon uses gated name', /monsterNoun\(pick\.id\)/.test(picketLine ? picketLine[0] : ''),
    'STILL LIVE game.js:~23658: ' + (picketLine ? picketLine[0].slice(0, 120).replace(/\n/g, ' ') : 'not found'));
  check('S10b union_rep walkout coaching is gated',
    /known \?[^;]{0,300}WALKOUT! WALKOUT!/.test(gsrc),
    'STILL LIVE game.js:~23624 walkout say is unconditional');
  check('S10b paparazzo flash resolve is gated',
    !/\(Prediction \$\{m\.pzPrediction\}\/4 — it learns your dodge\.\)/.test(gsrc),
    'STILL LIVE game.js:~21267');
  check('S10b paparazzo exclusive is gated',
    !/PREDICTION 4: the flash is now UNBLOCKABLE/.test(gsrc),
    'STILL LIVE game.js:~23507');
  check('S10b landlord foreclosure coaching is gated',
    !/\(Its healing climbs too — end this\.\)/.test(gsrc),
    'STILL LIVE game.js:~23338');
  check('S10b paparazzo still-beat mechanic is gated',
    !/Prediction climbing double/.test(gsrc),
    'STILL LIVE game.js:~23564');

  // ============ S11: static scans ============
  section('S11 static scans');
  // combat-card fighter names: every monster fighter creation must use the gated name.
  // Precise: the `name:` line within 4 lines after each `kind: 'monster'` fighter literal.
  const lines = gsrc.split('\n');
  const rawCards = [];
  for (let i = 0; i < lines.length; i++) {
    if (/kind:\s*'monster'/.test(lines[i]) && !/registerDeath|corpse/i.test(lines[i])) {
      const window = lines.slice(i, i + 5).join('\n');
      const nm = window.match(/name:\s*([^\n,]+)/);
      if (nm && !/monsterDisplayName|monsterNoun/.test(nm[1]) && /mdef\.name|pick\.name|pp\.name|\.name\b/.test(nm[1])) {
        rawCards.push('L' + (i + 1) + ': ' + nm[1].trim().slice(0, 80));
      }
    }
  }
  check('S11 no combat card uses a raw true name', rawCards.length === 0,
    rawCards.length ? 'RAW: ' + rawCards.join(' ; ') : '');
  // alien loot grant: name is the System's narration by design; effect hidden until use
  check('S11 alien loot effect hidden until first use',
    /alienEffectHidden:\s*true/.test(gsrc) && /alienLootReveal/.test(gsrc));
  // app.js pantry gate presence (DOM-only; verify the gate call exists)
  const asrc = atHead('src/js/app.js');
  check('S11 app.js pantry render calls pantryItemKnown', /pantryItemKnown/.test(asrc),
    'pantry gate missing in app.js render');
  check('S11 app.js pack render hides kcal for unknown meat',
    /foodKind === "meat" && .*edible === false/.test(asrc) || /edible === false/.test(asrc),
    'unknown-meat kcal mask not found');
  // arrival pools: no codex-entity names in flavor text
  const plants = JSON.parse(atHead('src/data/plants.json')).map(p => p.name.toLowerCase());
  const animals = JSON.parse(atHead('src/data/animals.json')).map(a => a.name.toLowerCase());
  const arrBlock = (gsrc.match(/const ARRIVAL = \{[\s\S]*?\n  \};/) || [''])[0].toLowerCase();
  const arrHits = [...plants, ...animals].filter(n => n.length > 4 && arrBlock.includes(n));
  check('S11 arrival pools name no codex plants/animals', arrHits.length === 0,
    arrHits.length ? 'names: ' + arrHits.slice(0, 5).join(', ') : '');

  // ============ summary ============
  console.log('\n' + pass + '/' + (pass + fail) + ' checks passed' + (fail ? ' — LEAKS PRESENT' : ''));
  if (failures.length) { console.log('FAILED:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e && e.stack || e); process.exit(2); });
