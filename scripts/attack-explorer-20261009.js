#!/usr/bin/env node
// HOSTILE PLAYTEST (explorer archetype, 2026-10-09): play as an attacker, not a tourist.
// Travel/map/fog/examine/teleport attacks. The 2026-10-08 run held 15/15 — this run
// attacks NEW surfaces: dead exploration modifiers, examine species gating, chain-reveal
// state, contest-interruption mid-combat, grid stranding, tick/kcal accounting honesty,
// curiosity-whisper silencing.
// Run: node scripts/attack-explorer-20261009.js (SEED env override)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261009', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ a >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seed BEFORE eval: modules capture Math.random at load
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js + build.js need window at load
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
delete global.window; // sync combat path
const Game = globalThis.Scattering.Game;
const S = globalThis.Scattering;
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
  say();
  return s;
}
const keepAlive = s => { s.kcal = 2400; s.hydration = 100; if (s.health < 200) s.health = 500; };

(async () => {
  await Game.init();
  console.log('== SEED ' + SEED + ' ==');

  // ---- E1: EXPLOIT/HONESTY — eagle_eye's data modifier has zero consumers ----
  {
    const s = fresh();
    s.abilities = [{ id: 'eagle_eye', name: 'Eagle Eye', level: 3, xp: 0 }];
    const mods = S.modifiers.collectModifiers(s, Game.data.abilities);
    const granted = mods.filter(m => m.target === 'explore.spot_chance');
    const rare = S.modifiers.resolve(0, 'forage.rare_find_chance', mods, {});
    const lvlText = Game.abilityLevelBonus ? Game.abilityLevelBonus('eagle_eye', 3) : '(no fn)';
    const broke = granted.length > 0 && rare === 0;
    attack('E1 eagle_eye dead modifier', broke,
      `L3 grants ${granted.length}× explore.spot_chance (value ${granted[0] ? granted[0].value : 'n/a'}) but forage.rare_find_chance resolves to ${rare}; level text: "${lvlText}"`);
    say();
  }

  // ---- E2: EXPLOIT — examineCell tree-species leak + study-teaching honesty ----
  {
    const s = fresh();
    const layout = () => {
      const g = Array.from({ length: 9 }, () => Array(9).fill('grass'));
      g[4][5] = 'tree';
      return g;
    };
    Game.genDetail = layout;
    const t = Game.playerTile();
    t.modifiers = t.modifiers || {};
    t.modifiers['5,4'] = { species: 'ghost_pine', health: 'healthy' };
    Game.state.codex.trees = {}; // unknown
    Game.state.codex.examined = {};
    s.mx = 4; s.my = 4;
    Game.examineCell(5, 4); const m1 = say(); // depth 1
    Game.examineCell(5, 4); const m2 = say(); // depth 2 (deep)
    Game.examineCell(5, 4); const m3 = say(); // depth 3 -> learns at >=3 studies
    const leak = /ghost.?pine/i.test(m1 + m2 + m3);
    const learned = (Game.state.codex.trees || {}).ghost_pine && Game.state.codex.trees.ghost_pine.level >= 1;
    const studyCount = ((Game.state.codex.treeStudy || {}).ghost_pine || 0);
    attack('E2 tree species via examine', leak,
      `leak:${leak} learned-after-3:${!!learned} studyCount:${studyCount} msg1:"${m1.slice(0, 70)}"`);
  }

  // ---- E3: EXPLOIT — revealBush chain-reveal writes species for unexamined bushes; gated? ----
  {
    const s = fresh();
    const layout = () => {
      const g = Array.from({ length: 9 }, () => Array(9).fill('grass'));
      g[4][5] = 'bush'; g[5][5] = 'bush'; g[4][6] = 'bush';
      return g;
    };
    Game.genDetail = layout;
    const t = Game.playerTile();
    t.bushSpecies = {};
    s.mx = 4; s.my = 4;
    say();
    S.Examine.examinePlantCell(5, 4);
    const msg = say();
    const assigned = Object.keys(t.bushSpecies || {}).length;
    // every consumer of bushSpecies must gate on codex.plants level — check runtime surfaces
    Game.state.codex.plants = {};
    const hints = Game.perceptionHints();
    const hintNames = hints.join(' ').toLowerCase();
    const leakedName = /blackberry|muscadine/.test(hintNames);
    attack('E3 bush chain-reveal name leak', leakedName,
      `bushes auto-assigned:${assigned} (of 3), whisper names species:${leakedName}, msg:"${msg.slice(0, 80)}"`);
  }

  // ---- E4: SOFTLOCK/EXPLOIT — contest interruption lands mid-combat ----
  {
    const s = fresh(); keepAlive(s);
    // fabricate a live fight
    Game.tbfight = { over: false, result: null, fighters: [
      { key: 'p', kind: 'player', alive: true, mx: 4, my: 4, hp: 100 },
      { key: 'm0', kind: 'monster', alive: true, mx: 5, my: 5, hp: 50, monsterId: 'test_mon', mdef: { id: 'test_mon', name: 'Test Mon', follows: true } },
    ]};
    const _origIsPlayerTurn = Game.tbIsPlayerTurn;
    Game.tbIsPlayerTurn = () => true;
    const contest = { id: 'cx_test', name: 'Test Game', desc: 'A test.', givesChoice: false, variant: null };
    let threw = null, ac = null;
    try { ac = Game.contestInterruption(contest, ['player']); } catch (e) { threw = String(e && e.message || e); }
    const msg = say();
    const fightAlive = !!(Game.tbfight && !Game.tbfight.over);
    // now end the contest and see if the fight survives sane
    let endThrew = null;
    try { if (Game._contestEnd) Game._contestEnd(ac, 'lost', false); } catch (e) { endThrew = String(e && e.message || e); }
    const fightAfter = !!(Game.tbfight && !Game.tbfight.over);
    const broke = !!threw || !!endThrew || (ac && !fightAfter && fightAlive);
    attack('E4 contest-grab mid-combat desync', broke,
      `threw:${threw || 'no'} fightLiveDuring:${fightAlive} fightLiveAfterEnd:${fightAfter} endThrew:${endThrew || 'no'}`);
    Game.tbfight = null;
    Game.tbIsPlayerTurn = _origIsPlayerTurn;
  }

  // ---- S1: SOFTLOCK — grid surrounded by blocking cells; is there always an exit? ----
  {
    const s = fresh();
    Game.exitBuilding(); // tryNodeExit refuses while inside the hall (correct) — be outside
    const layout = () => {
      const g = Array.from({ length: 9 }, () => Array(9).fill('water'));
      g[4][4] = 'grass';
      return g;
    };
    Game.genDetail = layout;
    s.mx = 4; s.my = 4;
    let moves = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (Game.microMove(4 + dx, 4 + dy)) moves++;
    }
    // node exit is not grid movement — the escape hatch. Try all 4 directions;
    // a blockage (creek/rubble/tree) is always clearable/bridgeable/swimmable,
    // so only a PERMANENT no-exit in every direction counts as stranded.
    say();
    let escapes = 0, hardBlocked = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      // reset position between attempts
      Game.map.px = 4; Game.map.py = 4;
      const r = Game.tryNodeExit(dx, dy);
      say();
      if (r && r.moved) escapes++;
      else if (r && r.blocked) {
        // can the blockage be cleared? clearBlockage always offers a way.
        const b = r.blocked;
        const clearable = ['fallen_tree', 'rubble', 'washed_out', 'creek'].includes(b.blockType);
        if (clearable) escapes++; else hardBlocked++;
      }
      Game.map.px = 4; Game.map.py = 4;
    }
    attack('S1 water-locked grid stranding', moves === 0 && escapes === 0,
      `microMoves succeeded:${moves}/8, exits available:${escapes}/4, hard-blocked:${hardBlocked}/4`);
  }

  // ---- H1: HONESTY — examineCell promises "2 ticks, time-only" ----
  {
    const s = fresh();
    Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
    s.mx = 4; s.my = 4; s.dayTicks = 0; s.actionClock = 0;
    Game.state.codex.examined = {};
    Game.examineCell(5, 4);
    say();
    const dt = (s.dayTicks || 0);
    attack('H1 examineCell 2-tick promise', dt !== 2, `dayTicks delta:${dt} (promised 2)`);
  }

  // ---- H2: HONESTY — beginPathWalk kcal accounting (no double charge via pathStep) ----
  {
    const s = fresh();
    Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
    s.mx = 4; s.my = 4;
    const k0 = s.kcal;
    const pathp = Game.beginPathWalk(7, 4);
    const charged = k0 - s.kcal;
    const announced = pathp ? pathp.length * 10 : 0;
    const k1 = s.kcal;
    // walk the steps
    let steps = 0;
    if (pathp) for (const [tx, ty] of pathp) { if (Game.pathStep(tx, ty)) steps++; else break; }
    const totalSpent = k0 - s.kcal;
    say();
    attack('H2 committed-walk kcal accounting', charged !== announced || totalSpent !== announced,
      `announced:${announced} chargedUpfront:${charged} totalAfterSteps:${totalSpent} steps:${steps}`);
  }

  // ---- H3: HONESTY — curiosity whisper goes quiet after the feature is examined ----
  {
    const s = fresh();
    Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
    const t = Game.playerTile();
    s.mx = 4; s.my = 4;
    Game.state.codex.examined = {};
    // find an adjacent cell with a feature
    let featCell = null;
    outer: for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = 4 + dx, cy = 4 + dy;
      const f = Game.tileFeature(Game.map.px, Game.map.py, cx, cy, 'grass');
      if (f && f !== 'oldcamp' && f !== 'tracks') { featCell = { cx, cy, f }; break outer; }
      if (f) { featCell = featCell || { cx, cy, f }; }
    }
    let broke = false, detail = 'no adjacent feature cell';
    if (featCell) {
      const before = Game.perceptionHints().join(' | ');
      // examine the cell (dirt/grass branch reveals the feature)
      Game.examineCell(featCell.cx, featCell.cy);
      say();
      const after = Game.perceptionHints().join(' | ');
      const whisperLines = ['disturbed', 'used. Lived in', 'wrong in a way', "doesn't look accidental", 'dark hollow', 'trampled'];
      const beforeWhispered = whisperLines.some(w => before.includes(w));
      const afterWhispered = whisperLines.some(w => after.includes(w));
      broke = beforeWhispered && afterWhispered; // whisper should go quiet after examine
      detail = `feature:${featCell.f} whisperedBefore:${beforeWhispered} whisperedAfter:${afterWhispered}`;
    }
    attack('H3 curiosity whisper silences', broke, detail);
  }

  // ---- H4: HONESTY — travelTargets unknown flag matches UI promise ----
  {
    const s = fresh();
    const targets = Game.travelTargets();
    let bad = 0, checked = 0;
    for (const tg of targets) {
      const t = Game.tileAt(tg.x, tg.y);
      checked++;
      if (tg.unknown !== !t.revealed) bad++;
    }
    attack('H4 travelTargets unknown flag', bad > 0, `checked:${checked} mismatches:${bad}`);
  }

  console.log('\n== SUMMARY ==');
  const nBreak = verdicts.filter(v => v[1]).length;
  console.log(`${verdicts.length - nBreak}/${verdicts.length} held, ${nBreak} broke`);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(1); });
