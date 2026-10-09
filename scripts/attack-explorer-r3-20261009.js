#!/usr/bin/env node
// HOSTILE PLAYTEST (explorer r3, 2026-10-09): travel/map/examine/fog, round 3.
// Prior rounds covered: fog-skip travelTo, force-swim, mid-fight travelTo,
// barrier exits, world-edge, tileInfo leaks, examine/fog naming gates,
// blocked-travel honesty, water-locked grid, eagle_eye dead modifier,
// examine ticks/kcal, travelTargets unknown flags, whisper silencing.
// This round attacks FRESH angles:
//   A1 EXPLOIT: mid-combat examineCell — tickAction no-ops in combat, so a
//      stale "Examine closely" card farms knowledge/skills for free while the
//      world stands still. Same class as the clearBlockage/beginPathWalk
//      mid-fight guards (break-it travel r4/r6).
//   A2 EXPLOIT: mid-combat _cellInteract — runs monster/animal/villager turns
//      AND grants the interaction (secrets, drink, forage...) while its
//      tickAction(1) no-ops. Free loot + double-advanced world.
//   A3 SOFTLOCK: save/load round-trip — position, revealed flags, seenTiles,
//      visited must survive; no teleport-to-village, no re-fog.
//   A4 HONESTY: beginPathWalk quote ("Walking N squares (C kcal)") matches the
//      billed walk, step by step; interrupted walks bill only landed squares.
//   A5 HONESTY: travelTo reveal radius is exactly the manhattan<=2 diamond —
//      no fog skipped beyond it.
//   A6 HONESTY: refused examine (too far) costs nothing.
// Run: node scripts/attack-explorer-r3-20261009.js (SEED env override)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261009', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ a >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
// SEED BEFORE EVAL (2026-10-08 lesson): modules capture Math.random at load.
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
// localStorage stub for the save/load round-trip attack
const _store = {};
global.localStorage = {
  getItem: (k) => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
  key: (i) => Object.keys(_store)[i], get length() { return Object.keys(_store).length; },
};
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
let fails = 0;
const check = (name, cond, detail) => {
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fails++;
};
const encTotal = () => Object.values(Game.state.codex.encounters || {}).reduce((a, b) => a + b, 0);
const saidLines = [];
const origSay = Game.say.bind(Game);

(async () => {
  await Game.init();
  Game.say = (t) => { saidLines.push(String(t)); try { origSay(t); } catch (e) {} };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  let s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100;
  s.mx = 4; s.my = 4;

  // ---------- A1: mid-combat examine farms free knowledge ----------
  Game.tbfight = { over: false }; // mid-fight: tickAction no-ops
  const clockBefore = s.actionClock || 0;
  const encBefore = encTotal();
  let examined = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
    const r = Game.examineCell(4 + dx, 4 + dy);
    if (r && r.ok) examined++;
  }
  const encAfter = encTotal();
  const clockAfter = s.actionClock || 0;
  check('A1 mid-combat examine refused (no free knowledge farm)',
    examined === 0 && encAfter === encBefore,
    `examined=${examined} ok, encounters ${encBefore}->${encAfter}, clock ${clockBefore}->${clockAfter}`);
  check('A1 mid-combat examine costs nothing when refused',
    clockAfter === clockBefore, `clock ${clockBefore}->${clockAfter}`);
  const refusedLine = saidLines.some(l => /mid-fight/i.test(l));
  check('A1 refusal says so honestly (no silent no-op)', refusedLine,
    `last lines: ${saidLines.slice(-2).join(' | ').slice(0, 120)}`);

  // ---------- A2: mid-combat _cellInteract ----------
  saidLines.length = 0;
  const tile = Game.playerTile();
  const det2 = Game.genDetail(Game.map.px, Game.map.py);
  // plant an unknown tree secret on an adjacent cell to prove the grant
  tile.secrets = tile.secrets || {};
  tile.secrets['5,4'] = { known: false, yield: 5 };
  det2[4][5] = 'tree';
  let worldTurns = 0;
  const _mt = Game.monsterTurn.bind(Game);
  Game.monsterTurn = (...a) => { worldTurns++; return _mt(...a); };
  const clockB2 = s.actionClock || 0;
  const r2 = Game._cellInteract(5, 4);
  const leak = tile.secrets['5,4'].known === true;
  const saidNo = saidLines.some(l => /mid-fight/i.test(l));
  check('A2 mid-combat _cellInteract refused (no free secret reveal)',
    r2 === null && !leak,
    `returned ${JSON.stringify(r2)}, secretLeaked=${leak}`);
  check('A2 mid-combat interact does not advance the world (no free monster turns)',
    worldTurns === 0, `monsterTurn calls=${worldTurns}`);
  check('A2 mid-combat interact costs no ticks when refused',
    (s.actionClock || 0) === clockB2, `clock ${clockB2}->${s.actionClock || 0}`);
  check('A2 refusal says so honestly', saidNo, saidLines.slice(-1)[0]);
  Game.monsterTurn = _mt;
  Game.tbfight = null; // fight over

  // ---------- A3: save/load round-trip ----------
  // walk somewhere first so position is non-trivial
  Game.map.px = 5; Game.map.py = 4; s.mx = 6; s.my = 2;
  Game.reveal(5, 4);
  Game.markSeen(5, 4, 'visited');
  Game.tileAt(6, 4).visited = true;
  const revBefore = Game.tileAt(5, 4).revealed;
  const seenBefore = JSON.stringify(s.seenTiles);
  const saveKey = 'attack-r3-test';
  Game.state.runKey = saveKey;
  const saved = Game.save();
  check('A3 save reports success', saved === true, `save() -> ${JSON.stringify(saved)}`);
  // hostile mutation: move far away, fog everything
  Game.map.px = 0; Game.map.py = 0; s.mx = 0; s.my = 0;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) Game.tileAt(x, y).revealed = false;
  s.seenTiles = {};
  const loaded = Game.load(saveKey);
  check('A3 load succeeds', loaded === true || loaded === undefined, `load() -> ${JSON.stringify(loaded)}`);
  s = Game.state.scholar; // load() replaces Game.state — re-capture
  const s2 = s;
  check('A3 position restored (no teleport)', Game.map.px === 5 && Game.map.py === 4,
    `px,py=${Game.map.px},${Game.map.py}`);
  check('A3 micro-position restored', (s2.mx ?? 4) === 6 && (s2.my ?? 4) === 2,
    `mx,my=${s2.mx},${s2.my}`);
  check('A3 revealed flags restored (no re-fog)', Game.tileAt(5, 4).revealed === revBefore && revBefore === true,
    `tile(5,4).revealed=${Game.tileAt(5, 4).revealed}`);
  check('A3 seenTiles restored', JSON.stringify(s2.seenTiles) === seenBefore,
    `seenTiles match: ${JSON.stringify(s2.seenTiles) === seenBefore}`);
  check('A3 visited flag restored', Game.tileAt(6, 4).visited === true, '');

  // ---------- A4: committed-walk quote + per-step billing ----------
  saidLines.length = 0;
  s.mx = 1; s.my = 1; s.kcal = 5000;
  Game.map.px = 4; Game.map.py = 4;
  const d4 = Game.genDetail(4, 4);
  // find a far walkable target
  let target = null;
  outer: for (let ty = 8; ty >= 0; ty--) for (let tx = 8; tx >= 0; tx--) {
    if (tx === 1 && ty === 1) continue;
    const cell = d4[ty] && d4[ty][tx];
    try { if (cell && !Game.cellProps(cell).blocks) { target = [tx, ty]; break outer; } } catch (e) {}
  }
  check('A4 found a walk target', !!target, JSON.stringify(target));
  if (target) {
    const path = Game.beginPathWalk(target[0], target[1]);
    check('A4 walk committed (path found)', Array.isArray(path) && path.length > 0, `len=${path && path.length}`);
    if (path && path.length) {
      const quote = saidLines.join(' ');
      const m = quote.match(/Walking (\d+) squares \((\d+) kcal\)/);
      check('A4 quote names squares and kcal honestly', !!m && +m[1] === path.length && +m[2] === Game.walkCost(path.length),
        `quote: ${(m && m[0]) || quote.slice(-80)}`);
      const kcalBefore = s.kcal;
      let allLanded = true;
      for (const [sx, sy] of path) { if (!Game.pathStep(sx, sy)) { allLanded = false; break; } }
      check('A4 every committed step lands (no mid-walk divergence)', allLanded, '');
      check('A4 walk ends on target', s.mx === target[0] && s.my === target[1],
        `at ${s.mx},${s.my} want ${target}`);
      const billed = Math.round(kcalBefore - s.kcal);
      check('A4 billed exactly walkCost(path)', billed === Game.walkCost(path.length),
        `billed=${billed} walkCost=${Game.walkCost(path.length)}`);
    }
  }
  // walk into a blocked cell refuses with no charge
  saidLines.length = 0;
  let blocked = null;
  for (let ty = 0; ty < 9 && !blocked; ty++) for (let tx = 0; tx < 9; tx++) {
    const cell = d4[ty] && d4[ty][tx];
    try { if (cell && Game.cellProps(cell).blocks && !(tx === s.mx && ty === s.my)) { blocked = [tx, ty]; break; } } catch (e) {}
  }
  if (blocked) {
    const k0 = s.kcal;
    const rp = Game.beginPathWalk(blocked[0], blocked[1]);
    // a blocked DESTINATION cell: findPath treats the target cell as blocked -> no path
    check('A4 walk to blocked cell refuses honestly', rp === null, `-> ${JSON.stringify(rp)}`);
    check('A4 refused walk charges nothing', Math.round(s.kcal) === Math.round(k0), '');
    check('A4 refusal says why', saidLines.some(l => /No path/i.test(l)), saidLines.slice(-1)[0]);
  } else console.log('[SKIP] A4 blocked-cell: no blocked cell on this tile');

  // ---------- A5: reveal radius exactly manhattan<=2 ----------
  const before = {};
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) before[y * 9 + x] = !!Game.tileAt(x, y).revealed;
  // reset fog, then travel one tile
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) Game.tileAt(x, y).revealed = false;
  Game.map.px = 4; Game.map.py = 4;
  // pick a genuinely traversable adjacent target (some seeds block (5,4))
  const tgt5 = Game.travelTargets().find(t => !Game.travelBlockage(t.x, t.y));
  check('A5 has a traversable adjacent target', !!tgt5, JSON.stringify(tgt5));
  const dx5 = tgt5.x, dy5 = tgt5.y;
  Game.travelTo(dx5, dy5); // travelTo returns checkEncounter()'s value; assert on position
  check('A5 travelTo adjacent succeeds', Game.map.px === dx5 && Game.map.py === dy5,
    `px,py=${Game.map.px},${Game.map.py} want ${dx5},${dy5}`);
  let over = 0, under = 0;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const d = Math.abs(x - dx5) + Math.abs(y - dy5);
    const rev = Game.tileAt(x, y).revealed;
    if (rev && d > 2) over++;
    if (!rev && d <= 2) under++;
  }
  check('A5 no fog skipped beyond radius 2', over === 0, `over-revealed=${over}`);
  check('A5 full diamond revealed (no holes)', under === 0, `holes=${under}`);

  // ---------- A6: refused examine costs nothing ----------
  saidLines.length = 0;
  const c0 = s.actionClock || 0, k0b = s.kcal;
  const r6 = Game.examineCell(0, 0); // far from (mx,my)
  check('A6 far examine refused', r6 === null, '');
  check('A6 refused examine says too far', saidLines.some(l => /Too far/i.test(l)), saidLines.slice(-1)[0]);
  check('A6 refused examine costs no ticks', (s.actionClock || 0) === c0, '');
  check('A6 refused examine costs no kcal', Math.round(s.kcal) === Math.round(k0b), '');

  console.log(fails ? `\n${fails} FAILURES` : '\nALL GREEN');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e && e.stack || e); process.exit(2); });
