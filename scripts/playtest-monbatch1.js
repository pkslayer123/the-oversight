// Playtest harness for monster batch 1 (The Beasts).
// Usage: node scripts/playtest-monbatch1.js [monsterId]
// Drives each monster through its signature beats headlessly and saves the
// rendered log to playtests/<id>-beats.md. These are TEXT captures from the
// node sim (no live browser) — honest about that in the file header.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

function gridWith(walls) {
  const g = Array.from({ length: 9 }, () => Array(9).fill('grass'));
  for (const [x, y, c] of (walls || [])) g[y][x] = c;
  return g;
}

function setup(px, py, mx, my, walls) {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) { Game.tbfight = null; }
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = px; s.my = py; s.health = 100; s.kcal = 3000; s.energy = 60;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear', range: 2 } };
  Game.genDetail = () => gridWith(walls);
  Game.log = [];
  return s;
}

function startFight(id, px, py, mx, my, walls, dayPart) {
  const s = setup(px, py, mx, my, walls);
  Game.dayPart = dayPart;
  s.monster = { id, mx, my };
  Game.log = [];
  Game.startCombat(id);
  return s;
}

function M(key) { return Game.tbFighter(key); }
function monsters() { return (Game.tbfight.fighters || []).filter(f => f.kind === 'monster' && f.alive); }
function phaseOf(key) { const m = M(key); return m ? m.beamPhase : '?'; }
function posOf(key) { const m = M(key); return m ? `${m.mx},${m.my}` : '?'; }

// Player driver: perform one scripted action, then let AI turns run.
function P(action) {
  if (!Game.tbfight || Game.tbfight.over) return 'FIGHT OVER';
  if (!Game.tbIsPlayerTurn()) { Game.tbAdvance(); return P(action); }
  const p = M('p');
  let r;
  if (action.move) r = Game.tbPlayerMove(action.move[0], action.move[1]);
  else if (action.strike) r = Game.tbPlayerStrike(action.strike);
  else if (action.wait) { Game.tbPlayerEndTurn(); r = true; }
  else r = Game.tbPlayerEndTurn();
  return r;
}
function heal() { const p = M('p'); if (p) { p.hp = p.maxHp; Game.state.scholar.health = p.hp; } }
function beat(title) { Game.say(`\n━━━ ${title} ━━━`); }
function note(t) { Game.say(`🐞 ${t}`); }

const SCEN = {
  thornback_boar() {
    // Open ground: player (2,4), boar (7,4).
    startFight('thornback_boar', 2, 4, 7, 4, null, 1);
    beat('FIRST SIGHTING — the queue notices you');
    P({ wait: 1 });                       // boar: advance + PAW (declare)
    beat('PAW — the telegraph');
    const b0 = monsters()[0];
    note(`phase=${b0.beamPhase} boar@${b0.mx},${b0.my}`);
    // STAND IN THE LANE: step onto a telegraphed cell and take the hit.
    const lane = (b0.telegraph && b0.telegraph.cells) || [];
    const p0 = M('p');
    const cell = lane.find(c => !(c.cx === p0.mx && c.cy === p0.my) && Game.findPath(p0.mx, p0.my, c.cx, c.cy));
    if (cell) { P({ move: [cell.cx, cell.cy] }); note(`you step into the lane @${cell.cx},${cell.cy}`); }
    else note('you hold your ground in the lane');
    P({ wait: 1 });                       // boar: CHARGE resolves -> HIT
    beat('CHARGE — the hit (you stood in the lane)');
    heal();
    if (!Game.tbfight || Game.tbfight.over) return;
    // Sidestep: the next charge should miss, then come the trample.
    P({ move: [2, 6] }); P({ wait: 1 });  // player sidesteps; boar paws again
    beat('PAW AGAIN — sidestepped clear');
    P({ wait: 1 });                       // boar: CHARGE resolves -> MISS
    beat('MISS — the lane was committed, you were not in it');
    P({ wait: 1 });                       // boar: TRAMPLE (its own turn)
    beat('TRAMPLE — the price of the dodge');
    // Winded flanks: close in and strike (may kill — that proves the bonus).
    const b2 = monsters()[0];
    if (b2) {
      const adj = [b2.mx > 0 ? b2.mx - 1 : b2.mx + 1, b2.my];
      P({ move: adj });
      P({ strike: 'm_0' });
    }
    beat('WINDED FLANKS — soft, unarmored (+50%)');
    heal();
    if (Game.tbfight && !Game.tbfight.over) P({ wait: 1 });
    beat('AFTERMATH — the rhythm: paw, charge, trample, paw');
  },

  hushwolf() {
    startFight('hushwolf', 4, 4, 4, 1, null, 3);
    beat('FIRST SIGHTING — the birds go quiet (pack of 3, m_0 is the lead)');
    note(`fighters: ${Game.tbfight.fighters.filter(f => f.kind === 'monster').map(f => f.key + (f.wolfLead ? '[LEAD]' : '')).join(', ')}`);
    P({ wait: 1 });                       // wolves rush, no telegraph
    beat('SILENT RUSH — no warning, just teeth');
    heal();
    // WOUND the lead without killing it: a controlled hit to just below half.
    const lead = M('m_0');
    const target = Math.floor(lead.maxHp * 0.45);
    Game.tbDamage('m_0', Math.max(1, lead.hp - target), 'you');
    try { Game.encNoticesPain(lead, 'p'); } catch (e) {}
    const leadAfter = M('m_0');
    note(`lead hp ${leadAfter.hp}/${leadAfter.maxHp}, broken=${!!leadAfter.wolfBroken}`);
    beat('WOUND THE LEAD — the pack breaks (not dead, just broken)');
    P({ wait: 1 });                       // broken wolves: hesitate / scatter
    beat('BROKEN PACK — circling wide, yipping');
    heal();
    // Now KILL the lead: without it, the pack should melt away.
    if (M('m_0') && M('m_0').alive) Game.tbDamage('m_0', 999, 'you');
    beat('THE LEAD FALLS — without it');
    note(`remaining: ${monsters().map(m => m.key + (m.fled ? '[fled]' : '')).join(', ')}`);
  },

  white_noise_heron() {
    startFight('white_noise_heron', 2, 4, 7, 4, null, 2);
    beat('FIRST SIGHTING — a heron-shaped absence');
    P({ wait: 1 });                       // too far: stillness
    beat('STILLNESS — out of strike range, it does nothing');
    note(`heron@${posOf('m_0')} phase=${phaseOf('m_0')}`);
    P({ move: [4, 4] }); P({ wait: 1 });  // within 4: UNFOLD (declare)
    beat('UNFOLD — the telegraph');
    note(`phase=${phaseOf('m_0')}`);
    P({ wait: 1 });                       // windup tick 1: the unfold escalates
    beat('WINDUP — the air goes staticky');
    // rig the drift (it repositions unseen after the strike) from here on
    const orig = Math.random;
    Math.random = () => 0.1;
    P({ move: [4, 6] }); P({ wait: 1 });  // sidestep; STRIKE resolves -> miss -> DRIFT
    beat('STRIKE — committed to the line, sidestepped');
    heal();
    // ranged strike at the still heron: the coin flip is still rigged —
    // you strike where you thought it was.
    const hh = monsters()[0];
    if (hh) {
      // stand exactly 2 away (spear range, but not adjacent)
      const px = M('p').mx, py = M('p').my;
      let spot = null;
      outer2: for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
        if (Math.max(Math.abs(x - hh.mx), Math.abs(y - hh.my)) !== 2) continue;
        const path = Game.findPath(px, py, x, y);
        if (path && path.length <= (M('p').moveLeft || 0)) { spot = [x, y]; break outer2; }
      }
      if (spot) P({ move: spot });
      note(`you@${M('p').mx},${M('p').my} heron@${hh.mx},${hh.my} phase=${hh.beamPhase}`);
    }
    P({ strike: 'm_0' });
    Math.random = orig;
    beat('STRIKE AT STILLNESS — hitting empty air (drift + coin flip rigged)');
    heal();
    P({ wait: 1 });
    beat('STILL AGAIN — the statue waits');
  },

  speedbump_turtle() {
    startFight('speedbump_turtle', 4, 4, 4, 2, null, 1);
    beat('FIRST SIGHTING — a boulder with opinions');
    P({ move: [4, 3] }); P({ wait: 1 });  // step adjacent: SNAP
    beat('SNAP — no warning, there never is');
    heal();
    // Bring it just below half WITHOUT overshooting into a kill: a real
    // spear can one-shot it (50-70 hp), so the bunker demo uses a measured hit.
    const t = M('m_0');
    if (t && t.alive && !t.turtleBunkered) {
      const need = t.hp - Math.floor(t.maxHp * 0.45);
      if (need > 0) Game.tbDamage('m_0', need, 'you');
    }
    beat('BUNKER — the shell seals');
    note(`phase=${phaseOf('m_0')}`);
    Game.tbDamage('m_0', 20, 'you');      // chip damage through the shell
    beat('HITTING THE BUNKER — chip damage');
    P({ wait: 1 }); P({ wait: 1 });       // wait it out: bunker counts down on turtle turns
    beat('UNSEAL — the bad attitude is back');
    note(`phase=${phaseOf('m_0')}`);
  },

  mirror_stag() {
    // Phase A: open ground — mirror -> confront -> committed charge, sidestepped.
    startFight('mirror_stag', 2, 4, 8, 4, null, 1);
    beat('FIRST SIGHTING — something tall, flashing in the treeline');
    P({ wait: 1 });                       // advance + MIRROR (declare)
    beat('MIRROR — it shows you your face');
    const stagA = monsters()[0];
    note(`phase=${stagA.beamPhase} stag@${stagA.mx},${stagA.my}`);
    // Sidestep: move to a reachable cell NOT in the committed lane.
    const laneA = new Set(((stagA.telegraph && stagA.telegraph.cells) || []).map(c => c.cx + ',' + c.cy));
    const pA = M('p');
    let side = null;
    outerA: for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      if (laneA.has(x + ',' + y)) continue;
      const path = Game.findPath(pA.mx, pA.my, x, y);
      if (path && path.length > 0 && path.length <= (pA.moveLeft || 0)) { side = [x, y]; break outerA; }
    }
    if (side) { P({ move: side }); note(`you sidestep to ${side}`); }
    P({ wait: 1 });                       // CONFRONT (windup)
    beat('CONFRONT — the reflection sharpens');
    P({ wait: 1 });                       // CHARGE resolves at the old lane -> miss
    beat('CHARGE — committed to the lane, you are not in it');
    heal();
    const logA = Game.log.slice();
    // Phase B: fresh fight with a tree between — break LOS during the mirror beat.
    startFight('mirror_stag', 2, 4, 8, 4, [[4, 4, 'tree'], [5, 5, 'tree']], 1);
    beat('SECOND SIGHTING — trees to hide behind this time');
    P({ wait: 1 });                       // MIRROR (declare); lane through the trees (bulldoze)
    beat('MIRROR — the lane shreds cover, but the mirror needs eyes');
    // move behind the trees: find a spot the stag can't see
    const stag = monsters()[0];
    let hid = null;
    outer: for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      const p = M('p');
      const path = Game.findPath(p.mx, p.my, x, y);
      if (!path || path.length > (p.moveLeft || 0)) continue;
      if (!Game.canSee(stag.mx, stag.my, x, y)) { hid = [x, y]; break outer; }
    }
    note(`hiding spot: ${hid}`);
    if (hid) { P({ move: hid }); }
    P({ wait: 1 });                       // CONFRONT (windup tick)
    beat('CONFRONT — it sees you seeing yourself');
    P({ wait: 1 });                       // RESOLVE: LOS broken -> the charge dies unspent
    beat('LOST YOU — the charge dies unspent');
    note(`phase=${phaseOf('m_0')}`);
    Game.log = logA.concat(['', '━━━ (a second stag, a second chance — trees this time) ━━━', '']).concat(Game.log);
  },
};

(async () => {
  await Game.init();
  const only = process.argv[2];
  const ids = only ? [only] : Object.keys(SCEN);
  fs.mkdirSync(path.join(ROOT, 'playtests'), { recursive: true });
  for (const id of ids) {
    console.log(`\n########## PLAYTEST: ${id} ##########`);
    try {
      SCEN[id]();
    } catch (e) {
      Game.say(`\n!! HARNESS ERROR: ${e.message}\n${e.stack.split('\n').slice(0, 3).join('\n')}`);
    }
    const log = Game.log.join('\n');
    console.log(log);
    const header = `# ${id} — encounter beat capture\n\n` +
      `> Text capture from the node sim (\`node scripts/playtest-monbatch1.js ${id}\`) — ` +
      `no live browser. What the player SEES is the log below, in order.\n\n` +
      `Fiction root: \`${id}\` in \`src/data/monsters.json\` (telegraph text, weaknesses, behavior, codexStages).\n\n---\n\n`;
    fs.writeFileSync(path.join(ROOT, 'playtests', `${id}-beats.md`), header + log + '\n');
    console.log(`\n(saved playtests/${id}-beats.md, ${Game.log.length} lines)`);
  }
})().catch(e => { console.error('CRASH', e); process.exit(2); });
