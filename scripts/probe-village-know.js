#!/usr/bin/env node
// probe3: village-side knowledge after N days (taught counts, sharedKnowledge)
'use strict';
const { loadGame, setupGame } = require('./sim-harness');
const SEED = parseInt(process.argv[2] || '20261009', 10);
const DAYS = parseInt(process.argv[3] || '10', 10);
(async () => {
  const { Game } = await loadGame({ seed: SEED, mode: 'village-know' });
  await setupGame(Game, 'Columbus, Ohio');
  // advance N days via endDayPart x4 per day (villageLives runs in the loop)
  for (let d = 0; d < DAYS; d++) {
    for (let p = 0; p < 4; p++) {
      try { Game.endDayPart(); } catch (e) { break; }
      if (Game.over) break;
    }
    if (Game.over) break;
  }
  const v = Game.state.village;
  const taughtTotal = Object.values(v.taught || {}).reduce((t, l) => t + l.length, 0);
  const roster = (v.roster || []).length;
  const shared = Object.keys(v.sharedKnowledge || {}).length;
  const codex = Object.keys((Game.state.codex || {}).plants || {}).length;
  const fieldNotes = Object.values(v.fieldNotes || {}).reduce((t, o) => t + Object.keys(o).length, 0);
  console.log(`seed=${SEED} days=${DAYS} gameOver=${!!Game.over} roster=${roster}`);
  console.log(`taughtTotal=${taughtTotal} sharedKnowledge=${shared} codex=${codex} fieldNotesActive=${fieldNotes}`);
})().catch(e => console.error('FAIL', e));
