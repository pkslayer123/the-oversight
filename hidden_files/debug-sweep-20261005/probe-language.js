// probe-language.js — talk to a villager in the language-barrier scenario
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
  Game.debugScenario('language');
  const out = {};
  const rid = (Game.state.village.roster || []).find(id => id !== Game.villagerId);
  out.rid = rid;
  out.commLevel = (() => { try { return Game.commLevel(rid); } catch (e) { return 'ERR ' + e.message; } })();
  const logBefore = Game.log.length;
  try {
    const st = Game.startConvo(rid);
    out.startConvoOk = !!st;
    out.convoActive = !!(st && st.active);
  } catch (e) { out.convoError = e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n'); }
  out.newLog = Game.log.slice(logBefore).map(l => String(l).slice(0, 200));
  console.log(JSON.stringify(out, null, 1));
})();
