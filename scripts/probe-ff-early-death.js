#!/usr/bin/env node
// probe: how often do fieldFight vDie deaths happen before the hopeless check can fire?
// (hopeless is only computed from round >= 2)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame } = require('./sim-harness');

(async () => {
  const { Game } = await loadGame({ seed: 777, mode: 'ff-probe', fullTelemetry: false });
  setupGame(Game);
  const s = Game.state.scholar;
  // pick a test villager
  const vid = (Game.state.village.roster || []).find(id => id !== Game.villagerId);
  console.log('villager:', vid);
  // force-hurt the villager to 100 HP (mid-expedition state)
  Game.state.village.health = Game.state.village.health || {};
  Game.state.village.health[vid] = 100;
  // wave-2 heavy: moderator (damage ~[?,?]) — check def
  const mdef = (Game.data.monsters || []).find(m => m.id === 'gavel');
  console.log('monster:', mdef.id, 'dmg', JSON.stringify(mdef.attack && mdef.attack.damage), 'hp', JSON.stringify(mdef.hp));
  let dieEarly = 0, dieLate = 0, flee = 0, other = 0;
  const earlyRounds = [];
  for (let i = 0; i < 60; i++) {
    Game.state.village.health[vid] = 100;
    const rec = Game.fieldFight(vid, mdef, null, { awareness: false, rng: null });
    if (rec.outcome === 'vDie' && rec.rounds <= 2) { dieEarly++; earlyRounds.push(rec.rounds); }
    else if (rec.outcome === 'vDie') dieLate++;
    else if (rec.outcome === 'vFlee') flee++;
    else other++;
  }
  console.log({ dieEarly, dieLate, flee, other, earlyRounds: earlyRounds.slice(0, 10) });
})();
