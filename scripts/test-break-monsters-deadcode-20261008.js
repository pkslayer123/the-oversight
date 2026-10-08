// Proof: break-it monsters run — dead monster-id cleanup (Steve 2026-10-08).
// CATCH: game.js carried ~456 lines of bespoke AI, damage rules, predicates,
// and cue branches for 5 monsters retired from monsters.json on 2026-10-06
// (hype_horn, camera_swarm, service_mimic, contract_golem, delegate_beast,
// commit 6943235). Their id predicates could never match — unreachable code,
// the same class as the Alien Players dead-module lesson.
//
// PROOF STRATEGY:
//  A. STATIC: retired ids appear in no data def and no code string literal.
//  B. DIFFERENTIAL: run a 28-monster scenario battery (tbMonsterTurn +
//     tbDamage across states/seeds) against HEAD's game.js and the patched
//     game.js; outputs must be byte-identical (deletion provably
//     behavior-preserving).
//
// Usage:
//   git show HEAD:src/js/game.js > /tmp/game-head.js
//   node scripts/test-break-monsters-deadcode-20261008.js --gamejs /tmp/game-head.js > /tmp/out-head.json
//   node scripts/test-break-monsters-deadcode-20261008.js --gamejs src/js/game.js > /tmp/out-new.json
//   diff /tmp/out-head.json /tmp/out-new.json && echo IDENTICAL
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const args = process.argv.slice(2);
const gi = args.indexOf('--gamejs');
const GAMEJS = gi >= 0 ? path.resolve(ROOT, args[gi + 1]) : path.join(ROOT, 'src/js/game.js');

const RETIRED = ['hype_horn', 'camera_swarm', 'service_mimic', 'contract_golem', 'delegate_beast'];

// ---- seeded RNG (mulberry32), installed BEFORE eval (modules capture it) ----
let _s = 1;
function rng() {
  _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function seedRng(seed) { _s = seed >>> 0 || 1; }
Math.random = rng;
global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))),
});
global.window = global;

const ORDER = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'GAMEJS', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/convo-scene.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
];

const results = { static: [], scenarios: [] };
const ok = (name, cond, extra) => results.static.push({ name, pass: !!cond, extra: extra || '' });

(async () => {
  // ---------- PART A: static ----------
  const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
  const ids = monsters.map(m => m.id);
  for (const r of RETIRED) {
    ok('retired id absent from monsters.json: ' + r, !ids.includes(r));
  }
  // no string literal references in code or data (comments excluded by quote requirement)
  const codeFiles = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      const st = fs.statSync(p);
      if (st.isDirectory()) { if (f !== '_archive') walk(p); }
      else if (f.endsWith('.js') || f.endsWith('.json')) codeFiles.push(p);
    }
  };
  walk(path.join(ROOT, 'src/js'));
  codeFiles.push(path.join(ROOT, 'src/data/monsters.json'));
  codeFiles.push(path.join(ROOT, 'src/data/monsterBehaviors.json'));
  for (const r of RETIRED) {
    const hits = [];
    const lit = new RegExp(`['"]${r}['"]`);
    for (const f of codeFiles) {
      const src = fs.readFileSync(f, 'utf8');
      const lines = src.split('\n');
      lines.forEach((ln, i) => {
        const code = ln.split('//')[0]; // strip line comments
        if (lit.test(code)) hits.push(path.basename(f) + ':' + (i + 1));
      });
    }
    ok('no live string literal for retired id: ' + r, hits.length === 0, hits.join(','));
  }
  const gameSrc = fs.readFileSync(GAMEJS, 'utf8');
  const liveCall = (fn) => new RegExp(`\\b${fn}\\s*\\(`).test(gameSrc);
  for (const fn of ['swarmIs', 'hornIs', 'smIs', 'cgIs', 'swarmCreep', 'swarmChase']) {
    ok('no live caller of ' + fn, !liveCall(fn));
  }

  // ---------- PART B: differential scenario battery ----------
  seedRng(1234);
  for (const f of ORDER) {
    const p = f === 'GAMEJS' ? GAMEJS : path.join(ROOT, f);
    try { eval(fs.readFileSync(p, 'utf8')); }
    catch (e) { console.error('EVAL FAIL ' + p + ': ' + e.message); process.exit(2); }
  }
  delete global.window;
  const Game = globalThis.Scattering.Game;
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  Game.audioEvent = function () {};
  const messages = [];
  Game.say = function (msg) { messages.push(String(msg == null ? '' : (msg.text || msg))); };
  Game.saySituationOnce = function (m, key, msg) { messages.push(String(msg)); };

  const MONSTER_IDS = ids; // all 28 live
  const SEEDS = [11, 22, 33];
  const STATES = [
    { name: 'default', st: {} },
    { name: 'telegraph', st: { telegraph: { kind: 'burst', cells: [{ cx: 4, cy: 4 }], dmg: [10, 14], attackName: 'test', turnsLeft: 2 } } },
    { name: 'lowhp', st: { hpFrac: 0.15 } },
  ];

  function snapFighter(m) {
    return {
      hp: Math.round(m.hp * 100) / 100, mx: m.mx, my: m.my, alive: m.alive, fled: m.fled,
      beamPhase: m.beamPhase || null, telegraph: !!m.telegraph,
      turtleBunker: m.turtleBunker || 0, drRecalcs: m.drRecalcs || 0,
      escalation: m.escalation || 0, stunned: m.stunned || 0,
    };
  }

  let n = 0;
  for (const mid of MONSTER_IDS) {
    const mdef = Game.data.monsters.find(m => m.id === mid);
    for (const sdef of STATES) {
      for (const seed of SEEDS) {
        n++;
        seedRng(seed * 1000 + n);
        messages.length = 0;
        let outcome;
        try {
          const hp = mdef.hp[0] + 5;
          const fighters = [
            { key: 'p', kind: 'player', name: 'You', emoji: '🧑', hp: 200, maxHp: 200, speed: 3, mx: 4, my: 4, alive: true, fled: false, moveLeft: 3, acted: false },
            Object.assign({
              key: 'm', kind: 'monster', monsterId: mid, mdef: mdef,
              name: 'Test ' + mid, emoji: '👹', hp: hp, maxHp: hp, speed: mdef.speed || 3,
              mx: 4, my: 6, alive: true, fled: false, moveLeft: 3, acted: false,
              threatQueue: [], telegraph: null,
            }, sdef.st),
          ];
          if (sdef.st.hpFrac) { fighters[1].hp = Math.max(1, Math.round(hp * sdef.st.hpFrac)); delete fighters[1].hpFrac; }
          Game.tbfight = { fighters, order: ['p', 'm'], turnIdx: 1, round: 2, over: false, style: 0 };
          const m = Game.tbFighter('m');
          Game.tbMonsterTurn(m);          // exercises bespoke AI dispatch
          const p = Game.tbFighter('p');
          const pHpBefore = p.hp;
          Game.tbDamage('m', 25, 'you');  // exercises damage rules (torch/fragile were here)
          outcome = {
            mid, state: sdef.name, seed,
            msgs: messages.slice(),
            monster: snapFighter(m),
            playerHpDelta: Math.round((pHpBefore - p.hp) * 100) / 100,
            fightOver: !!Game.tbfight.over,
          };
        } catch (e) {
          outcome = { mid, state: sdef.name, seed, threw: String(e.message).slice(0, 120) };
        } finally {
          Game.tbfight = null;
        }
        results.scenarios.push(outcome);
      }
    }
  }

  results.meta = {
    gamejs: GAMEJS.endsWith('game-head.js') ? 'HEAD' : 'patched',
    monsterCount: MONSTER_IDS.length,
    scenarioCount: results.scenarios.length,
  };
  process.stdout.write(JSON.stringify(results));
})().catch(e => { console.error('FATAL ' + e.stack); process.exit(1); });
