// PROOF (Steve 2026-10-08): monster declarations fire their aggroAudio.
// 5 bespoke aggro hooks (turtleGrind, glasswingBuzz, sunbaskerShimmer,
// hecklerLaugh, lockpickFingers) were registered in app.js with ZERO call
// sites — bespoke turn code returns before the generic declare dispatch, and
// encDeclareDirect never fired aggroAudio. tbAggroAudio (game.js) now fires
// the data-driven hook at each bespoke declare moment; encDeclareDirect
// fires it too; the generic path's double-fire collapsed to one.
// Also: winded bulldozer turns now say + cue (animalPant).
//
// Run: node scripts/test-declare-audio-20261008.js   (SEED env override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261008', 10);
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = {
  getElementById: () => null,
  createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} }, body: {},
};
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

const audio = [];
const says = [];
function setupFight(monsterId, px, py, mx, my) {
  audio.length = 0; says.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = px; s.my = py; s.health = 200;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear', range: 2 } };
  Game.ensureVillagerPositions();
  // no party in these fights: empty the roster so nobody joins
  Game.state.village.roster = [];
  const vpos = Game.state.village.positions || {};
  for (const k of Object.keys(vpos)) vpos[k] = { mx: 8, my: 8 };
  s.mx = px; s.my = py; // (ensureVillagerPositions may touch scholar? re-assert)
  s.monster = { id: monsterId, mx, my };
  Game.startCombat(monsterId);
  // pin positions post-spawn (startCombat may nudge onto free cells)
  const mf = Game.tbfight.fighters.find(f => f.kind === 'monster');
  if (mf) { mf.mx = mx; mf.my = my; }
  const pf = Game.tbFighter('p');
  if (pf) { pf.mx = px; pf.my = py; pf.hp = 1000; pf.maxHp = 1000; }
  return mf;
}
// drive monster turns until stopWhen() true or the fight ends; player waits.
function drive(maxTurns, stopWhen) {
  let n = 0;
  while (Game.tbfight && !Game.tbfight.over && n++ < maxTurns) {
    if (stopWhen && stopWhen()) return true;
    if (Game.tbIsPlayerTurn()) Game.tbPlayerWait();
    else Game.tbAdvance();
  }
  return !!(stopWhen && stopWhen());
}
const monsterOf = () => Game.tbfight && Game.tbfight.fighters.find(f => f.kind === 'monster');

(async () => {
  await Game.init();
  Game.audio = new Proxy({}, { get: (t, n) => (d) => { audio.push(String(n)); } });
  const osay = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return osay(t); };
  console.log(`seed=${SEED}`);

  // 1. TURTLE: the snap is its declaration — turtleGrind must fire.
  setupFight('speedbump_turtle', 4, 4, 4, 5); // adjacent
  drive(6, () => audio.includes('turtleGrind'));
  ok('turtle snap fires turtleGrind', audio.includes('turtleGrind'), `audio=${audio.slice(0, 6).join(',')}`);

  // 2. GLASSWING: dive declare fires glasswingBuzz.
  setupFight('glasswing', 4, 4, 4, 6); // within dive range 3
  drive(8, () => audio.includes('glasswingBuzz'));
  ok('glasswing dive declare fires glasswingBuzz', audio.includes('glasswingBuzz'), `audio=${audio.slice(0, 8).join(',')}`);
  ok('glasswing still fires its dive cue too', audio.includes('glasswingDive'));

  // 3. SUNBASKER: bask x2 -> bite declare via encDeclareDirect fires sunbaskerShimmer.
  setupFight('sunbasker', 4, 4, 4, 5); // adjacent, daytime (dayPart 0)
  drive(10, () => audio.includes('sunbaskerShimmer'));
  ok('sunbasker bite declare fires sunbaskerShimmer', audio.includes('sunbaskerShimmer'), `audio=${audio.slice(0, 10).join(',')}`);

  // 4. HECKLER: first jibe fires hecklerLaugh.
  setupFight('heckler', 4, 4, 4, 6);
  drive(14, () => { const m = monsterOf(); return m && (m.hkShame || 0) >= 1; });
  const hk = monsterOf();
  ok('heckler jibed within 14 turns', !!(hk && (hk.hkShame || 0) >= 1), `shame=${hk && hk.hkShame}`);
  ok('heckler first jibe fires hecklerLaugh', audio.includes('hecklerLaugh'), `audio=${audio.slice(0, 10).join(',')}`);
  // Design: tbAggroAudio fires once per telegraph DECLARE, not per jibe. The
  // laugh can legitimately fire twice in this window: a startCombat-opening
  // declare plus the first-jibe declare (seed-fragile as exactly-once; failed
  // on seeds 456/555). The per-beat contract (laugh coupled to declare beats,
  // never spammed per jibe) is asserted across seeds in
  // scripts/test-aggro-audio-hooks-20261008.js.
  ok('hecklerLaugh fires at most twice (one per declare)', audio.filter(a => a === 'hecklerLaugh').length <= 2,
    `count=${audio.filter(a => a === 'hecklerLaugh').length}`);

  // 5. LOCKPICK: casing fires lockpickFingers.
  setupFight('lockpick_raccoon', 4, 4, 4, 6); // within grab range 2 -> steals on turn 1
  drive(6, () => audio.includes('lockpickFingers'));
  ok('lockpick casing fires lockpickFingers', audio.includes('lockpickFingers'), `audio=${audio.slice(0, 8).join(',')}`);

  // 6. GENERIC PATH: bulldozer declare fires boarSnort exactly once per declare (was 2x).
  setupFight('bulldozer', 4, 4, 4, 7); // charge range: declares lane
  drive(6, () => { const m = monsterOf(); return m && !!m.telegraph; });
  const snorts = audio.filter(a => a === 'boarSnort').length;
  ok('bulldozer declare fires boarSnort once (not twice)', snorts === 1, `boarSnort x${snorts}; audio=${audio.slice(0, 8).join(',')}`);

  // 8. NEVERMORE: strafe declare fires nevermoreUnfold (same bug class).
  setupFight('nevermore', 4, 4, 4, 6); // within strafe range 3
  drive(8, () => audio.includes('nevermoreUnfold'));
  ok('nevermore strafe declare fires nevermoreUnfold', audio.includes('nevermoreUnfold'), `audio=${audio.slice(0, 8).join(',')}`);

  // 9. STATICKITE: mark declare fires kiteUnfold (same bug class).
  setupFight('statickite', 4, 4, 4, 8); // within mark range 6
  drive(10, () => audio.includes('kiteUnfold'));
  ok('statickite mark declare fires kiteUnfold', audio.includes('kiteUnfold'), `audio=${audio.slice(0, 10).join(',')}`);

  // 10. WINDED: missed charge -> winded turns say + cue.
  // Drive the honest path: declare a charge, step off the lane, let it miss.
  setupFight('bulldozer', 4, 4, 4, 7);
  // wait for the declare, then dodge off the charge lane before resolve
  let dodged = false;
  drive(10, () => {
    const m = monsterOf();
    if (!dodged && m && m.telegraph && m.telegraph.kind === 'squares' && (m.telegraph.cells || []).length) {
      const p = Game.tbFighter('p');
      const lane = new Set(m.telegraph.cells.map(c => c.cx + ',' + c.cy));
      // step to a cell off the lane
      for (let dy = -1; dy <= 1 && !dodged; dy++) for (let dx = -1; dx <= 1 && !dodged; dx++) {
        const nx = p.mx + dx, ny = p.my + dy;
        if (nx < 0 || nx > 8 || ny < 0 || ny > 8 || lane.has(nx + ',' + ny)) continue;
        p.mx = nx; p.my = ny; dodged = true;
      }
      return false;
    }
    return !!(m && (m.boarWinded || 0) > 0);
  });
  const boar = monsterOf();
  ok('bulldozer goes winded after a missed charge', !!(boar && (boar.boarWinded || 0) > 0), `winded=${boar && boar.boarWinded} dodged=${dodged}`);
  if (boar && (boar.boarWinded || 0) > 0) {
    says.length = 0; audio.length = 0;
    // run the winded turn (trample) — must say + pant
    drive(4, () => says.some(t => /WINDRED/.test(t)));
    ok('winded trample turn says the winded state', says.some(t => /WINDRED/.test(t)), `says=${says.slice(-2).join(' | ').slice(0, 140)}`);
    ok('winded trample turn cues animalPant', audio.includes('animalPant'));
    // next winded turn (final decrement) — must say the wind coming back
    says.length = 0; audio.length = 0;
    drive(4, () => says.some(t => /wind is back/.test(t)));
    ok('final winded turn says the wind is back', says.some(t => /wind is back/.test(t)), `says=${says.slice(-2).join(' | ').slice(0, 140)}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
