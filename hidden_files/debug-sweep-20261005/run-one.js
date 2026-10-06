// run-one.js — headless single-scenario runner for The Oversight.
// Usage: node run-one.js <scenarioName>
// Prints one JSON object to stdout: { name, loaded, loadError, scenarioOk, scenarioError, logTail, monsterDef, combat: {...} }
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..'); // repo root
const name = process.argv[2];

const FILES = [
  'src/js/engine/state.js',
  'src/js/engine/modifiers.js',
  'src/js/engine/calories.js',
  'src/js/engine/day.js',
  'src/js/engine/forage.js',
  'src/js/engine/combat.js',
  'src/js/game.js',
  'src/js/encounters.js',
  'src/js/conversation.js',
  'src/js/journal.js',
  'src/js/party.js',
  'src/js/party-formal.js',
  'src/js/truth.js',
  'src/js/contests.js',
  'src/js/storage.js',
  'src/js/perceive.js',
  'src/js/carexplore.js',
  'src/js/justice.js',
  'src/js/food.js',
  'src/js/betrayal.js',
  'src/js/corpses.js',
  'src/js/lifeseed.js',
  'src/js/progression.js',
  'src/js/ledger.js',
  'src/js/villager-agency.js',
  'src/js/codex-people.js',
  'src/js/membership.js',
  'src/js/hierarchy.js',
  'src/js/debug-scenarios.js',
  'src/js/build.js',
];

const result = { name, loaded: false, loadError: null, scenarioOk: null, scenarioError: null, logTail: [], monsterDef: null, combat: null };

async function main() {
  let Game = null;
  global.window = globalThis; // build.js assigns window.BUILD_VERSION at eval time
  // 1. fetch stub
  global.fetch = (f) => Promise.resolve({
    json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))),
  });
  // minimal localStorage stub (state.js guards with try/catch anyway)
  global.localStorage = {
    _m: {},
    getItem(k) { return this._m[k] ?? null; },
    setItem(k, v) { this._m[k] = String(v); },
    removeItem(k) { delete this._m[k]; },
  };

  // 2. eval files in order
  try {
    for (const f of FILES) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      eval(src + '\n//# sourceURL=' + f);
    }
    result.loaded = true;
    Game = global.Scattering && global.Scattering.Game;
    if (!Game) throw new Error('Scattering.Game not exposed after eval');
  } catch (e) {
    result.loadError = String(e && e.stack || e);
    finish();
    return;
  }

  // 3. init
  try {
    await Game.init();
  } catch (e) {
    result.loadError = 'init failed: ' + String(e && e.stack || e);
    finish();
    return;
  }

  // 4. run the scenario
  const logBefore = Game.log ? Game.log.length : 0;
  try {
    result.scenarioOk = Game.debugScenario(name);
  } catch (e) {
    result.scenarioOk = false;
    result.scenarioError = String(e && e.stack || e).split('\n').slice(0, 5).join('\n');
  }
  try {
    const log = Game.log || [];
    result.logTail = log.slice(-10);
  } catch (e) { result.logTail = ['(log unreadable: ' + e.message + ')']; }

  // 5. monster def check (if a monster was placed)
  const s = Game.state && Game.state.scholar;
  const mid = s && s.monster && s.monster.id;
  if (mid) {
    try {
      const def = (Game.data.monsters || []).find(m => m.id === mid);
      if (!def) {
        result.monsterDef = { id: mid, found: false };
      } else {
        result.monsterDef = {
          id: mid, found: true,
          name: def.name || null,
          hp: def.hp || null,
          speed: def.speed ?? null,
          pack: def.pack ?? null,
          risk: def.risk || null,
          hasEncounter: !!def.encounter,
          hasAttack: !!(def.attack || def.attacks),
          missingCore: ['name', 'hp', 'speed'].filter(k => def[k] === undefined),
        };
      }
    } catch (e) { result.monsterDef = { id: mid, found: 'error: ' + e.message }; }
  }

  // 6. combat: force-start fight if a monster is placed, then poke it
  const combat = { attempted: false, fightActive: false, turns: [], finalState: null, error: null };
  result.combat = combat;
  try {
    if (mid && !Game.tbfight) {
      try { Game.startCombat(mid); } catch (e) { combat.error = 'startCombat threw: ' + e.message; }
    }
    if (Game.tbfight) {
      combat.attempted = true;
      combat.fightActive = true;
      const f0 = Game.tbfight;
      const fighters = (f0.fighters || []).map(x => ({ key: x.key, kind: x.kind, name: x.name, hp: x.hp, maxHp: x.maxHp, alive: x.alive, mdefId: x.mdef && x.mdef.id }));
      combat.fighters = fighters;
      combat.monsterKeys = fighters.filter(x => x.kind === 'monster' && x.alive).map(x => x.key);

      // 3 attack rounds worth of player actions; monster AI runs via tbAdvance
      let advanceCalls = 0;
      const MAX_ADV = 60; // safety valve against infinite AI loops
      for (let i = 0; i < 3 && Game.tbfight && !Game.tbfight.over; i++) {
        const snap = {
          iter: i,
          round: Game.tbfight.round,
          turnIdx: Game.tbfight.turnIdx,
          current: Game.tbCurrent ? (Game.tbCurrent() || {}).key : null,
          isPlayerTurn: Game.tbIsPlayerTurn ? Game.tbIsPlayerTurn() : null,
          playerHp: null, monstersHp: [], acted: [],
        };
        for (const x of (Game.tbfight.fighters || [])) {
          if (x.key === 'p') snap.playerHp = x.hp + '/' + x.maxHp;
          if (x.kind === 'monster') snap.monstersHp.push(x.key + ':' + x.hp + '/' + x.maxHp + (x.alive ? '' : ' (dead)'));
        }
        try {
          if (Game.tbIsPlayerTurn()) {
            const p = Game.tbFighter('p');
            const mk = combat.monsterKeys.find(k => { const ff = Game.tbFighter(k); return ff && ff.alive; });
            if (mk) {
              const r = Game.tbPlayerStrike(mk);
              snap.action = 'strike ' + mk + ' -> ' + r;
            } else {
              const r = Game.tbPlayerWait ? Game.tbPlayerWait() : 'no wait fn';
              snap.action = 'wait -> ' + r;
            }
            snap.acted.push('player');
          } else {
            // advance until player's turn again or fight over (bounded)
            let n = 0;
            while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && n < 12 && advanceCalls < MAX_ADV) {
              Game.tbAdvance();
              advanceCalls++; n++;
            }
            snap.action = 'advanced ' + n + ' AI turns';
            if (advanceCalls >= MAX_ADV) snap.action += ' (HIT ADVANCE CAP — possible soft-lock)';
          }
        } catch (e) {
          snap.actionError = String(e && e.message || e);
        }
        combat.turns.push(snap);
      }
      const tf = Game.tbfight;
      combat.finalState = tf ? {
        over: tf.over, result: tf.result, round: tf.round, turnIdx: tf.turnIdx,
        playerHp: (tf.fighters.find(x => x.key === 'p') || {}).hp,
        monstersAlive: tf.fighters.filter(x => x.kind === 'monster' && x.alive).length,
        logTail: (Game.log || []).slice(-5),
      } : { ended: true, logTail: (Game.log || []).slice(-5) };
      // soft-lock heuristic: never reached over and player never got a 2nd action
      const playerActions = combat.turns.filter(t => (t.action || '').startsWith('strike') || (t.action || '').startsWith('wait')).length;
      combat.softLockSuspect = !combat.finalState.over && playerActions < 2 && advanceCalls >= MAX_ADV;
    }
  } catch (e) {
    combat.error = String(e && e.stack || e).split('\n').slice(0, 5).join('\n');
  }

  finish();
}

function finish() {
  process.stdout.write(JSON.stringify(result));
}

main().catch(e => {
  result.loadError = result.loadError || ('main threw: ' + String(e && e.stack || e));
  finish();
});
