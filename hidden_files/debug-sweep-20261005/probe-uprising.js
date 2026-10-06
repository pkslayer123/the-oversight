// probe-uprising.js — verify the uprising fight actually advances without throwing
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
  Game.debugScenario('uprising');
  const out = { fight: !!Game.tbfight, advances: 0, error: null, turns: [] };
  try {
    for (let i = 0; i < 25 && Game.tbfight && !Game.tbfight.over; i++) {
      const cur = Game.tbCurrent ? (Game.tbCurrent() || {}).key : '?';
      if (Game.tbIsPlayerTurn && Game.tbIsPlayerTurn()) {
        // player waits
        if (Game.tbPlayerWait) Game.tbPlayerWait(); else break;
        out.turns.push('P:wait');
      } else {
        Game.tbAdvance();
        out.turns.push(cur + ':ai');
      }
      out.advances++;
    }
    out.over = !!(Game.tbfight && Game.tbfight.over);
    out.result = Game.tbfight && Game.tbfight.result;
    const pf = Game.tbfight && Game.tbfight.fighters.find(x => x.key === 'p');
    out.playerHp = pf && pf.hp;
    out.hostilesAlive = Game.tbfight ? Game.tbfight.fighters.filter(x => x.kind === 'hostile' && x.alive).length : null;
  } catch (e) { out.error = e.message + '\n' + (e.stack || '').split('\n').slice(0,4).join('\n'); }
  console.log(JSON.stringify(out, null, 1));
  console.log('--- last log lines ---');
  (Game.log || []).slice(-6).forEach(l => console.log(' ', String(l).slice(0, 180)));
})();
