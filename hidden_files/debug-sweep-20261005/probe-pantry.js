// probe-pantry.js — check day1 pantry items vs pantryKcal compat field
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.env.HOME + '/workspace/the-scattering';
globalThis.Scattering = globalThis.Scattering || {};
globalThis.window = globalThis;
globalThis.localStorage = { _m: {}, getItem(k){return this._m[k]??null;}, setItem(k,v){this._m[k]=String(v);}, removeItem(k){delete this._m[k];} };
globalThis.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const FILES = ['src/js/engine/state.js','src/js/engine/modifiers.js','src/js/engine/calories.js','src/js/engine/day.js','src/js/engine/forage.js','src/js/engine/combat.js','src/js/game.js','src/js/encounters.js','src/js/conversation.js','src/js/journal.js','src/js/party.js','src/js/party-formal.js','src/js/truth.js','src/js/contests.js','src/js/storage.js','src/js/perceive.js','src/js/carexplore.js','src/js/justice.js','src/js/food.js','src/js/betrayal.js','src/js/corpses.js','src/js/lifeseed.js','src/js/progression.js','src/js/ledger.js','src/js/villager-agency.js','src/js/codex-people.js','src/js/membership.js','src/js/hierarchy.js','src/js/debug-scenarios.js','src/js/build.js'];
(async () => {
  for (const f of FILES) (0, eval)(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  const Game = globalThis.Scattering.Game;
  await Game.init();
  Game.debugScenario('day1');
  const v = Game.state.village;
  const items = (v.pantry || []).map(i => ({ name: i.name, units: i.units, kcalEach: i.kcalEach }));
  const computed = (v.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0);
  console.log(JSON.stringify({ field: v.pantryKcal, computed, itemCount: items.length, items: items.slice(0, 12) }, null, 1));
})();
