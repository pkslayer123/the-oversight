#!/usr/bin/env node
// PROOF TEST (brawler loop 2026-10-08): uprising 'lost' aftermath.
// BREAK: when the village uprising KILLED the bearer, uprisingAftermath had
// no 'lost' branch — no narration, and the successor inherited the dead
// bearer's full justice docket (stage 4, exiled, crimes) plus s.exiled, so
// the exile guard fired on a villager who committed no crimes.
// FIX: a 'lost' branch narrates the resolution and resets the formal docket;
// the crimes died with the criminal.
// BEFORE/AFTER: JUSTICE_SRC=head evals git HEAD's justice.js (bug present);
// default evals the worktree (fixed).
// Run: JUSTICE_SRC=head SEED=N node scripts/test-uprising-lost-20261008.js
//      then SEED=N node scripts/test-uprising-lost-20261008.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '7', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ a >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
global.window = global;
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });

const FILES = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js',
  'src/js/convo-beats.js', 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js',
  'src/js/journal.js', 'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js',
  'src/js/contests.js', 'src/js/contestEngine.js', 'src/js/alienPlayers.js', 'src/js/storage.js',
  'src/js/perceive.js', 'src/js/carexplore.js',
  // justice.js substituted for before/after (same slot, different source):
  'src/js/justice.js',
  'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js',
  'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js',
  'src/js/monsterBehaviors.js', 'src/js/statusEffects.js', 'src/js/villager-agency.js',
  'src/js/fieldFights.js', 'src/js/villager-objectives.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js',
];
let justiceCode;
if (process.env.JUSTICE_SRC === 'head') {
  justiceCode = execSync('git show HEAD:src/js/justice.js', { cwd: ROOT }).toString('utf8');
  console.log('JUSTICE_SRC=head (BEFORE)');
} else {
  justiceCode = fs.readFileSync(path.join(ROOT, 'src/js/justice.js'), 'utf8');
  console.log('JUSTICE_SRC=worktree (AFTER)');
}
for (const f of FILES) {
  if (!f) continue;
  eval(f === 'src/js/justice.js' ? justiceCode : fs.readFileSync(path.join(ROOT, f), 'utf8'));
}
delete global.window;
const Game = globalThis.Scattering.Game;
const sayLines = () => { const l = (Game.log || []).map(x => x.text || x); (Game.log || []).length = 0; return l; };

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); } };

(async () => {
  await Game.init();
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('UprisingLost');
  Game.newGame('UprisingLost', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.mx = 4; s.my = 4;
  // real pre-uprising docket: stage 4, exiled, crimes on the books
  const j = Game.justiceState();
  j.stage = 4; j.exiled = true;
  j.crimes = [{ type: 'theft', victim: 'v1', witnessed: true }, { type: 'attack', victim: 'v2', witnessed: true }];
  s.exiled = true;
  const oldId = Game.villagerId;
  sayLines();
  Game.startVillageUprising('defied exile');
  const p = Game.tbFighter('p'); p.hp = 5;
  let guard = 0;
  while (Game.tbfight && guard++ < 80) {
    const pp = Game.tbFighter('p');
    if (Game.tbIsPlayerTurn() && pp && pp.alive && !pp.acted) Game.tbPlayerWait();
    else { try { Game.tbAdvance(); } catch (e) { break; } }
  }
  const lines = sayLines().join(' ');
  const newId = Game.villagerId;
  const j2 = Game.justiceState();

  ok('bearer died and mantle passed', oldId !== newId, `${oldId} -> ${newId}`);
  ok('aftermath narrates the uprising death',
    /got who it|came for|uprising/i.test(lines), lines.slice(0, 120));
  ok('justice stage reset', j2.stage === 0, `stage=${j2.stage}`);
  ok('justice exile cleared', j2.exiled === false, `exiled=${j2.exiled}`);
  ok('crimes died with the criminal', (j2.crimes || []).length === 0, `crimes=${(j2.crimes || []).length}`);
  ok('scholar exile flag cleared', !Game.state.scholar.exiled);
  ok('justiceExiled() false for successor', Game.justiceExiled() === false);
  ok('exile guard silent for successor', Game.justiceExileGuards() === null,
    JSON.stringify(Game.justiceExileGuards()));
  ok('successor alive and playing', Game.state.scholar.health > 0 && !Game.over);

  console.log(`\n${pass} pass / ${fail} fail (seed ${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e.message); process.exit(1); });
