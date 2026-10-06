// Worker C (game.js) flesh-out tests (Steve 2026-10-06).
// Covers: (1) dawn branch -> Game.fireShow wiring, (2) Game.glasswingTrapCells
// grid contract, (3) lockpick_raccoon direct/burst pattern correctness +
// monsters.json attack-pattern sibling scan, (4) playtest-as-player drives
// (glasswing trap shadow -> dive; lockpick cornered fight).
// Usage: node scripts/test-gamec-1.js   (node, NOT jest)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/contests.js', 'src/js/debug-scenarios.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function rig(fn) { const o = Math.random; Math.random = fn; return () => { Math.random = o; }; }

const SHOW = { id: 'grudge_pudding', name: 'Grudge Pudding', desc: 'Two villagers with a grudge must cook a pudding together.' };

async function main() {
  await Game.init();

  // ---------- A. dawn branch -> fireShow ----------
  Game.debugScenario('headlight');
  Game.state.pendingContest = null;
  Game.state.activeContest = null;
  Game.contestTick = () => SHOW;
  Game.contestPool = () => [{ id: 'gauntlet_x', name: 'The Gauntlet' }];
  let firedWith = null;
  const origFireShow = Game.fireShow;
  Game.fireShow = function (ev) { firedWith = ev; return origFireShow.call(this, ev); };
  const said = [];
  const origSysSay = Game.sysSay;
  Game.sysSay = function (t) { said.push(String(t)); return origSysSay.call(this, t); };
  const showBefore = (Game.leadership().showmanship || 0);
  Game.endDay();
  ok('A1 dawn routes show event to fireShow (not inline sysSay)', firedWith === SHOW);
  ok('A2 TONIGHT announcement preserved', said.some(t => t.includes('📺 TONIGHT: Grudge Pudding.')));
  ok('A3 showmanship nudged (+1)', (Game.leadership().showmanship || 0) === showBefore + 1,
    `was ${showBefore}, now ${Game.leadership().showmanship}`);
  Game.fireShow = origFireShow; Game.sysSay = origSysSay;

  // A4: contests still route to fireContest, never fireShow
  Game.debugScenario('headlight');
  Game.state.pendingContest = null; Game.state.activeContest = null;
  const realContest = Game.contestPool()[0];
  Game.contestTick = () => realContest;
  let showFired = false, contestFired = null;
  Game.fireShow = function () { showFired = true; };
  const origFireContest = Game.fireContest;
  Game.fireContest = function (ev) { contestFired = ev; try { return origFireContest.call(this, ev); } catch (e) { return null; } };
  try { Game.endDay(); } catch (e) {}
  ok('A4 contest (has pool id) routes to fireContest', contestFired === realContest);
  ok('A4b fireShow NOT called for a real contest', !showFired);
  Game.fireShow = origFireShow; Game.fireContest = origFireContest;

  // ---------- B. fireShow internals ----------
  Game.debugScenario('headlight');
  Game.state.village = Game.state.village || {};
  Game.state.village.roster = ['vill_a', 'vill_b', 'vill_c'];
  Game.villagerId = 'player_vid';
  const saidB = [];
  Game.sysSay = function (t) { saidB.push(String(t)); return origSysSay.call(this, t); };
  const unrig = rig(() => 0.0); // 70% pull succeeds; picks roster[0]
  let pulledShow;
  try { pulledShow = Game.fireShow(SHOW); } finally { unrig(); Game.sysSay = origSysSay; }
  ok('B1 fireShow returns the show', pulledShow === SHOW);
  ok('B2 pull-away announced ("The cameras want")', saidB.some(t => t.includes('cameras want')));
  const notab = ((Game.state.notability || {})['vill_a'] || {}).showmanship || 0;
  ok('B3 pulled villager gains showmanship notability', notab >= 1, `notability=${notab}`);
  // no-id show falls back to the pool
  const picked = Game.fireShow(null);
  ok('B4 fireShow(null) picks from show pool', !!(picked && picked.name && picked.desc));

  // ---------- C. glasswingTrapCells ----------
  Game.debugScenario('glasswing');
  ok('C1 null when no trap', Game.glasswingTrapCells() === null);
  Game.state.scholar.gwTrap = { turns: 2, tileX: 5, tileY: 5, monsterId: 'glasswing' };
  const tc = Game.glasswingTrapCells();
  ok('C2 returns object when trap set', !!tc);
  ok('C3 tile matches trap tile', tc && tc.tile.x === 5 && tc.tile.y === 5);
  ok('C4 turns passes through', tc && tc.turns === 2);
  const splashKeys = new Set((tc.splash || []).map(c => c.x + ',' + c.y));
  const wantKeys = new Set();
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue; wantKeys.add((5 + dx) + ',' + (5 + dy));
  }
  ok('C5 splash is exactly the 8 adjacent tiles',
    splashKeys.size === 8 && [...wantKeys].every(k => splashKeys.has(k)),
    `got [${[...splashKeys].join(' ')}]`);
  ok('C6 splash excludes the center tile', !splashKeys.has('5,5'));

  // ---------- D. lockpick pattern + sibling scan ----------
  Game.debugScenario('lockpick');
  const s = Game.state.scholar; s.health = 900;
  Game.startCombat('lockpick_raccoon');
  const m = Game.tbfight.fighters.find(x => (x.mdef || {}).id === 'lockpick_raccoon');
  m.beamPhase = 'cornered'; m.lockpickHit = false; m.hp = m.maxHp; m.fled = false;
  s.mx = m.mx - 1; s.my = m.my;
  Game.tbMonsterTurn(m);
  const tg = m.telegraph;
  ok('D1 cornered lockpick declares a telegraph', !!tg);
  ok('D2 telegraph kind is direct (targeted, not AoE)', tg && tg.kind === 'direct', `kind=${tg && tg.kind}`);
  ok('D3 pattern type is direct, range 2 (matches monsters.json)',
    tg && tg.pattern && tg.pattern.type === 'direct' && tg.pattern.range === 2,
    JSON.stringify(tg && tg.pattern));
  ok('D4 no AoE cells on a direct telegraph', !tg.cells || tg.cells.length === 0,
    `cells=${(tg.cells || []).length}`);
  ok('D5 target is the player (lockOn tile)', tg && tg.targetKey === 'p');

  // Sibling scan: every monster's data pattern vs engine contract
  const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
  const list = monsters.monsters || monsters;
  const KNOWN = new Set(['beam', 'line', 'charge', 'burst', 'ambush', 'direct', 'single', 'rush']);
  const S = globalThis.Scattering;
  let unknownTypes = [], shapeBad = [];
  for (const md of list) {
    const pat = (md.attack || {}).pattern || {};
    const t = pat.type;
    if (!KNOWN.has(t)) { unknownTypes.push(`${md.id}:${t}`); continue; }
    // lanes measured from the grid edge (full length fits, up to edge clip);
    // bursts measured from center (no edge clip)
    const laneCells = S.combat.patternCells(pat, 0, 4, 8, 4);
    const burstCells = S.combat.patternCells(pat, 4, 4, 6, 4);
    let shapeOk = true;
    if (t === 'direct' || t === 'single' || t === 'rush') shapeOk = burstCells.length === 0;
    else if (t === 'burst' || t === 'ambush') {
      const r = pat.radius || 1;
      shapeOk = burstCells.length === (2 * r + 1) * (2 * r + 1); // chebyshev square
    } else if (t === 'beam' || t === 'line' || t === 'charge') {
      const w = pat.width || 1;
      shapeOk = laneCells.length === Math.min(pat.length || 5, 8) * (2 * w - 1);
    }
    if (!shapeOk) shapeBad.push(`${md.id}:${t} lane=${laneCells.length} burst=${burstCells.length}`);
  }
  ok('D6 all monsters.json attack patterns are known types', unknownTypes.length === 0, unknownTypes.join(','));
  ok('D7 patternCells shape matches every pattern type', shapeBad.length === 0, shapeBad.join(','));

  // ---------- E. playtest-as-player ----------
  // E1: glasswing trap shadow grows -> dive -> combat (played via public APIs)
  Game.debugScenario('glasswing');
  const gs = Game.state.scholar; gs.health = 900;
  let walked = 0;
  const stepToward = () => {
    const wm = gs.monster; if (!wm) return false;
    const px = gs.mx ?? 4, py = gs.my ?? 4;
    // try tiles in order of closeness to the monster; skip blockers
    const cands = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = px + dx, ny = py + dy;
      if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
      cands.push([nx, ny, Math.max(Math.abs(nx - wm.mx), Math.abs(ny - wm.my))]);
    }
    cands.sort((a, b) => a[2] - b[2]);
    for (const [nx, ny] of cands) if (Game.microMove(nx, ny)) return true;
    return false;
  };
  for (let i = 0; i < 24 && !gs.gwTrap && !Game.tbfight; i++) {
    if (!stepToward()) break;
    walked++;
  }
  ok('E1 walking at the glasswing triggers the dive shadow', !!gs.gwTrap, `walked=${walked}`);
  if (gs.gwTrap) {
    const c1 = Game.glasswingTrapCells();
    ok('E2 trap cells visible to renderer while shadow grows', !!c1 && c1.splash.length === 8);
    const t0 = gs.gwTrap.turns;
    Game.gwTrapTick(); Game.gwTrapTick(); Game.gwTrapTick();
    ok('E3 three ticks resolve the dive (trap consumed)', !gs.gwTrap);
    ok('E4 dive leads somewhere playable (combat started or clean miss)',
      !!Game.tbfight || (Game.log || []).join('\n').includes('empty dirt'));
  }
  // E5: lockpick fight plays as a targeted thief, not an AoE
  Game.debugScenario('lockpick');
  const ls = Game.state.scholar; ls.health = 900;
  Game.startCombat('lockpick_raccoon');
  const lm = Game.tbfight.fighters.find(x => (x.mdef || {}).id === 'lockpick_raccoon');
  lm.beamPhase = 'cornered'; lm.hp = lm.maxHp;
  ls.mx = lm.mx - 1; ls.my = lm.my;
  Game.tbMonsterTurn(lm); // declare
  const ltg = lm.telegraph;
  ok('E5 Disassemble declares targeted (kind direct)', !!ltg && ltg.kind === 'direct');
  // drive the countdown to resolution; the attack cycles declare->resolve->declare
  const hpBefore = ls.health;
  Game.tbMonsterTurn(lm); // countdown hits 0 -> resolves on the target
  const tookHit = ls.health < hpBefore;
  const learned = ((Game.state.codex.monsters || {}).lockpick_raccoon || {}).patterns || {};
  ok('E6 Disassemble resolved on the single target', tookHit, `hp ${hpBefore} -> ${ls.health}`);
  ok('E7 codex learned the targeted pattern ("locks onto one target")',
    Object.values(learned).some(v => String(v).includes('locks onto one target')),
    JSON.stringify(learned));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
