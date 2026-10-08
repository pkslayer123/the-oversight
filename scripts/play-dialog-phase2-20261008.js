#!/usr/bin/env node
// PLAY PASS (Steve 2026-10-08) — dialog Phase 2. Reads like a person?
// Prints transcripts for: stranger, friend (alive menu), honest boundary,
// cruel path (deflect), kind path (comfort). Human reads the output.
const fs = require('fs'); const path = require('path');
const ROOT = '/home/hatch/workspace/worktrees/dialog-phase2';
let _a = 20261008;
Math.random = () => { _a = _a + 0x6D2B79F5 | 0; let t = Math.imul(_a ^ _a >>> 15, 1 | _a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const SCRIPTS = ['src/js/engine/state.js','src/js/engine/modifiers.js','src/js/engine/calories.js','src/js/engine/day.js','src/js/engine/forage.js','src/js/engine/combat.js','src/js/game.js','src/js/encounters.js','src/js/conversation.js','src/js/convo-mood.js','src/js/convoTopics.js','src/js/convo-wants.js','src/js/convo-dialogue.js','src/js/convo-beats.js','src/js/convo-scene.js','src/js/examine.js','src/js/equipment.js','src/js/journal.js','src/js/party.js','src/js/party-formal.js','src/js/truth.js','src/js/contests.js','src/js/storage.js','src/js/perceive.js','src/js/carexplore.js','src/js/justice.js','src/js/food.js','src/js/betrayal.js','src/js/corpses.js','src/js/lifeseed.js','src/js/progression.js','src/js/ledger.js','src/js/abilityActions.js','src/js/monsterBehaviors.js','src/js/statusEffects.js','src/js/villager-agency.js','src/js/codex-people.js','src/js/membership.js','src/js/hierarchy.js','src/js/debug-scenarios.js','src/js/build.js'];
SCRIPTS.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

(async () => {
await Game.init(); delete global.window;
Game.genDetail = () => Array.from({length:9},()=>Array.from({length:9},()=>'grass'));
Game.genRoster('Columbus, Ohio');
Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
Game.depart();
const roster = Game.state.village.roster;
const name = (vid) => Game.displayName(vid).split(' ')[0];

function convo(vid) {
  const c = Game.convoGet(vid);
  c.active = true; c.over = false; c.pendingQ = null; c.thread = null;
  c.reactiveQ = null; c.genericQ = null; c.heldBeats = [];
  c.mood = Game.convoMoodInit(vid);
  return c;
}
function show(vid, menu, n=8) {
  console.log('  MENU: ' + menu.slice(0,n).map(m=>m.label).join(' | '));
}
function turn(vid, id) {
  const r = Game.convoTurn(vid, id);
  if (r && r.line) console.log(`  THEM: ${r.line.slice(0,140)}`);
  return r;
}

// SCENARIO 1: stranger, small talk only
console.log('\n=== 1. STRANGER (trust 10) ===');
{
  const vid = roster[0]; convo(vid);
  console.log(`  talking to ${name(vid)}`);
  const menu = Game.buildMenu(vid); show(vid, menu);
  const scene = Game.getScene(vid);
  console.log(`  scene: tier=${scene.bond.tier} mood=${scene.moodBand} trust=${scene.bond.trust}`);
}

// SCENARIO 2: friend with history — alive menu
console.log('\n=== 2. FRIEND WITH HISTORY (trust 45) ===');
{
  const vid = roster[1]; convo(vid);
  (Game.state.village.trust || (Game.state.village.trust = {}))[vid] = 45;
  Game.convoThreadOpen(vid, 'past', 'their past', 'walked away mid-thread', 'old talk');
  Game.remember(vid, 'gift', 'answered their hunger');
  console.log(`  talking to ${name(vid)}`);
  const menu = Game.buildMenu(vid); show(vid, menu);
  const alive = menu.find(m => m.id.indexOf('alive:memory:') === 0);
  if (alive) { console.log('  > pick: ' + alive.label); turn(vid, alive.id); }
}

// SCENARIO 3: honest boundary on a reactive question
console.log('\n=== 3. HONEST BOUNDARY (reactive) ===');
{
  const vid = roster[2]; convo(vid);
  const rid = Object.keys(Game.REACTIVE_DEFS)[0];
  Game.convoGet(vid).reactiveQ = { id: rid };
  const menu = Game.buildMenu(vid); show(vid, menu, 6);
  console.log('  > pick: "I\'d rather not say."');
  turn(vid, 'react:' + rid + ':honest_pass');
  console.log('  trust now: ' + ((Game.state.village.trust||{})[vid] || 10) + ' (should be unchanged)');
}

// SCENARIO 4: cruel path — deflect a bespoke question
console.log('\n=== 4. CRUEL PATH (deflect) ===');
{
  const vid = roster[3]; convo(vid);
  const q = Game.data.characterGen.convo.questions.find(q => q.id === 'q_trust');
  Game.convoGet(vid).pendingQ = { id: q.id, answers: q.answers };
  const menu = Game.buildMenu(vid); show(vid, menu, 7);
  console.log('  > pick: (change the subject)');
  turn(vid, 'deflect_q');
  console.log('  disposition now: ' + Game.playerDisposition() + ' (should be < 0)');
}

// SCENARIO 5: kind path — comfort
console.log('\n=== 5. KIND PATH (comfort) ===');
{
  const vid = roster[4]; convo(vid);
  const menu = Game.buildMenu(vid);
  const comfort = menu.find(m => m.id === 'dlg:comfort' || m.id === 'dlg:empathize');
  console.log('  comfort offered: ' + !!comfort);
  if (comfort) { console.log('  > pick: ' + comfort.label); turn(vid, comfort.id); }
}

// SCENARIO 6: scene snapshot mid-conversation
console.log('\n=== 6. SCENE SNAPSHOT ===');
{
  const vid = roster[5]; convo(vid);
  Game.convoTurn(vid, 'agree');
  const s = Game.getScene(vid);
  console.log('  ' + JSON.stringify({ want: s.want && s.want.id, mood: s.mood, band: s.moodBand, trust: s.bond.trust, tier: s.bond.tier, thread: s.beat.thread, disp: s.disposition }));
}
console.log('\nDONE');
})();
