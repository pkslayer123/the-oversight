#!/usr/bin/env node
// HOSTILE PLAYTEST (explorer archetype, 2026-10-09, round 2): proof test for
// three new attacks on travel/map/examine. RED before fix, GREEN after.
//   E1 EXPLOIT  — same-cell examine spam farms a skill (feedKnowledge has no
//                 per-cell cap: 4 stares at one tree = learnSkill, 8 ticks)
//   S1 SOFTLOCK — engine actions after death: examineCell narrates, advances
//                 the world (npcBatchTurn/monsterTurn via tickAction) and
//                 saves, for a corpse
//   H1 HONESTY  — phantom monster hint after node travel: scholar.monster is
//                 never re-synced on arrival, so perceive.js reports the OLD
//                 tile's monster as "nearby" on the NEW tile
//   H2 HONESTY  — examineCell "2 ticks, time-only": exactly 2 ticks, 0 kcal
//   H3 HONESTY  — species-study hint "one more careful look should do it"
//                 really teaches on the next deep examine
// Run: node scripts/test-explorer-attack-20261009.js (SEED env override)
// Full module list in index.html order, minus DOM-only; Math.random seeded
// BEFORE eval (modules capture it at load).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261009', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ a >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/contestEngine.js',
 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
 'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/fieldFights.js', 'src/js/villager-objectives.js',
 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const say = () => { const l = Game.log || []; const s = l.map(x => x.text || x).join(' '); l.length = 0; return s; };
const verdicts = [];
const attack = (name, broke, detail) => { verdicts.push([name, broke]); console.log(`[${broke ? 'BREAK' : 'HELD '} ] ${name}${detail ? ' — ' + detail : ''}`); };
function fresh() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100; s.mx = 4; s.my = 4;
  // reset knowledge state so the farm is measured, not background grants
  Game.state.codex.skills = {}; Game.state.codex.encounters = {};
  Game.state.codex.examined = {}; Game.state.codex.treeStudy = {};
  Game.state.codex.trees = {};
  say();
  return s;
}
function treeAt(cx, cy, species) {
  Game.genDetail = () => {
    const g = Array.from({ length: 9 }, () => Array(9).fill('grass'));
    g[cy][cx] = 'tree';
    return g;
  };
  if (species) {
    const t = Game.playerTile();
    t.modifiers = t.modifiers || {};
    t.modifiers[cx + ',' + cy] = { species, health: 'healthy' };
  }
}

(async () => {
  await Game.init();
  console.log('== SEED ' + SEED + ' ==');

  // ---- E1: EXPLOIT — same-cell examine spam farms track_read ----
  {
    const s = fresh();
    treeAt(5, 4);
    s.mx = 4; s.my = 4;
    const kcal0 = s.kcal, dt0 = s.dayTicks || 0;
    for (let i = 0; i < 4; i++) Game.examineCell(5, 4);
    const learned = !!((Game.state.codex.skills || {}).track_read || {}).level;
    const enc = (Game.state.codex.encounters || {}).track_read || 0;
    // trait-independent signal: 4 stares at ONE cell must not yield 4 encounters
    attack('E1 same-cell examine farms track_read', enc >= 4,
      `4 stares at one tree: encounters=${enc} learned=${learned} (cost ${((s.dayTicks || 0) - dt0)} ticks, ${kcal0 - s.kcal} kcal) — cap is 2/cell`);
    say();
  }

  // ---- E1b: distinct-cell study must STILL teach (fix must not kill the pattern) ----
  {
    const s = fresh();
    // 4 different cells, one surface examine each
    const cells = [[5, 4], [3, 4], [4, 5], [4, 3]];
    cells.forEach(([cx, cy]) => {
      Game.genDetail = () => {
        const g = Array.from({ length: 9 }, () => Array(9).fill('grass'));
        g[cy][cx] = 'tree';
        return g;
      };
      s.mx = cx - 1; s.my = cy; // stand adjacent
      if (Math.abs(cx - s.mx) + Math.abs(cy - s.my) > 1) { s.mx = 4; s.my = 4; }
      Game.state.codex.examined = {}; // new cell each time (distinct ground)
      Game.examineCell(cx, cy);
    });
    const learned = !!((Game.state.codex.skills || {}).track_read || {}).level;
    attack('E1b distinct-cell study still teaches (guard)', !learned,
      `4 distinct cells, 1 look each: learned=${learned} — must stay true after fix`);
    say();
  }

  // ---- S1: SOFTLOCK — examine after death ----
  {
    const s = fresh();
    treeAt(5, 4);
    s.mx = 4; s.my = 4;
    const dt0 = s.dayTicks || 0;
    Game.over = true; Game.state.over = true; // the player is dead
    say();
    const ret = Game.examineCell(5, 4);
    const narrated = say();
    const dt1 = s.dayTicks || 0;
    Game.over = false; Game.state.over = false;
    const broke = narrated.length > 0 || dt1 !== dt0;
    attack('S1 examine-after-death narrates/advances', broke,
      `ret:${ret === null ? 'null' : 'truthy'} logChars:${narrated.length} dayTicksDelta:${dt1 - dt0}`);
  }

  // ---- H1: HONESTY — phantom monster hint after node travel ----
  // A non-following world monster stays on the OLD tile (continuity), but
  // scholar.monster is never re-synced on arrival — perceive.js reads the
  // stale alias and reports the old tile's monster as "nearby" here.
  {
    const s = fresh();
    const px = Game.map.px, py = Game.map.py;
    s.mx = 4; s.my = 4;
    // gallowdeer: follows=false — it stays behind when you leave (continuity)
    Game.spawnWorldMonster('gallowdeer', px, py, { mx: 1, my: 4 });
    Game.syncMonsterAlias();
    const oldCheck = Game.checkEncounter;
    Game.checkEncounter = () => 0; // don't spawn on arrival: the hint must be about the OLD monster
    // travel EAST: entry = (0, oldMy=4); stale monster at (1,4) reads as adjacent
    let dest = null;
    for (const tg of Game.travelTargets()) {
      if (tg.x !== px + 1 || tg.y !== py) continue;
      if (Game.travelBlockage(tg.x, tg.y)) continue;
      if (Game.monsterAt && Game.monsterAt(tg.x, tg.y)) continue;
      dest = tg; break;
    }
    if (!dest) { // fall back: any adjacent unblocked monster-free tile
      for (const tg of Game.travelTargets()) {
        if (Math.abs(tg.x - px) + Math.abs(tg.y - py) !== 1) continue;
        if (Game.travelBlockage(tg.x, tg.y)) continue;
        if (Game.monsterAt && Game.monsterAt(tg.x, tg.y)) continue;
        dest = tg; break;
      }
    }
    let broke = false, detail = 'no valid adjacent target';
    if (dest) {
      Game.travelTo(dest.x, dest.y);
      say();
      const after = Game.perceptionHints().join(' | ');
      const phantom = /moves nearby|is close/i.test(after);
      const m = Game.state.scholar.monster;
      const aliasStale = !!(m && (m.tx !== Game.map.px || m.ty !== Game.map.py));
      broke = phantom;
      detail = `phantomAfter:${phantom} aliasStale:${aliasStale} moved:(${px},${py})->(${dest.x},${dest.y}) player@(${s.mx},${s.my})`;
    }
    Game.checkEncounter = oldCheck;
    attack('H1 phantom monster hint after travel', broke, detail);
    say();
  }

  // ---- H2: HONESTY — "2 ticks, time-only" ----
  {
    const s = fresh();
    treeAt(5, 4);
    s.mx = 4; s.my = 4;
    const kcal0 = s.kcal, dt0 = s.dayTicks || 0;
    Game.examineCell(5, 4);
    const dTicks = (s.dayTicks || 0) - dt0, dKcal = kcal0 - s.kcal;
    attack('H2 examine costs 2 ticks + 0 kcal', dTicks !== 2 || dKcal !== 0,
      `ticks:${dTicks} (promised 2) kcal:${dKcal} (promised time-only)`);
    say();
  }

  // ---- H3: HONESTY — species-study hint promise ----
  {
    const s = fresh();
    treeAt(5, 4, 'ghost_pine');
    s.mx = 4; s.my = 4;
    let hintSaid = false;
    for (let i = 0; i < 4; i++) { // depths 1..4 → studies on deep examines
      Game.examineCell(5, 4);
      if (/one more careful look/i.test(say())) hintSaid = true;
    }
    const learned = !!((Game.state.codex.trees || {}).ghost_pine || {}).level;
    attack('H3 "one more look" teaches on next deep study', !(hintSaid && learned),
      `hintSaid:${hintSaid} learned:${learned}`);
    say();
  }

  console.log('\n== SUMMARY ==');
  const nBreak = verdicts.filter(v => v[1]).length;
  console.log(`${verdicts.length - nBreak}/${verdicts.length} held, ${nBreak} broke`);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(1); });
