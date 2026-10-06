// PROOF TEST (Steve 2026-10-06): wave-2 fix-pass re-verification, played AS A PLAYER.
// The 6 gaps from evidence/2026-10-06/wave2-playverify-20261006.md ("Gaps for
// the fix pass"). Most fixes landed in sibling commits 491d6a4/cc74c4d; this
// run re-verifies them against current HEAD, re-applies the two that a stale
// sibling commit reverted (heckler 8-12 direct, paparazzo still-coaching), and
// plays the union_rep fight as a player to prove winnable AND losable.
//
// BEFORE (each fix): what the old code did, so a re-run against old code fails.
//   1. union_rep WALKOUT: urWalkout never cleared once fired — rep permanently
//      untargetable + zero damage = infinite stalemate (16-round real fight hit
//      the round cap, player at 82, rep alive). AFTER: the line breaks when no
//      allies remain (urWalkout=false, urLineBroken, back to organizing, modest
//      direct) — the fight is winnable AND losable.
//   2. union_rep 'organizing' phase: set on the intro turn but the summon
//      advanced straight to 'picketing' — 2 of 3 phases visible. AFTER: the
//      clipboard beat narrates organizing.
//   3. heckler threat floor: chip 3-6, direct 6-10, realized ~2.3/round vs the
//      14/round bar. AFTER: chip 6-10 (Vicious Mockery), direct 8-12 (data).
//   4. heckler 'warming_up': set then instantly overwritten by 'heckling' on
//      the first jibe — 2 of 3 phases visible. AFTER: the knuckles-crack beat.
//   5. paparazzo EXCLUSIVE: died in 3 rounds at prediction 3/4 in a
//      strike-through — the second act never fired. AFTER: a still player feeds
//      prediction +2/shot ("posing for the camera"), EXCLUSIVE at prediction 4.
//      (Plus: the still-coaching fired only when post-increment prediction < 4,
//      so move-then-plant players never saw the warning — now checked pre-math.)
//   6. understudy passive stall: a player who never attacked faced a monster
//      that never acted — the watching branch stepped away forever. AFTER: 3
//      watching turns with zero observations -> COLD READ (it performs your
//      stillness at [8,12]).
//
// Run: node scripts/test-wave2-fixpass-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
(function seed(seed) {
  let s = seed >>> 0;
  Math.random = function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})(20261006);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const MONSTERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
const MS = MONSTERS.monsters || MONSTERS;
const MDEF = Object.fromEntries(MS.filter(m => m.id).map(m => [m.id, m]));
const APP_SRC = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const REG_KEYS = new Set([...APP_SRC.matchAll(/^\s{6}([a-zA-Z][\w-]*)\(/gm)].map(m => m[1]));

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const P = () => { try { return Game.tbFighter('p'); } catch (e) { return null; } };
const MON = (id) => Game.tbfight ? Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive && !x.fled && x.mdef && x.mdef.id === id) : null;
const ALLIES_OF = (m) => Game.tbfight ? Game.tbfight.fighters.filter(x => x.kind === 'monster' && x.alive && !x.fled && x.key !== m.key) : [];
// TURN HYGIENE: advance exactly one AI round, never two. Interior tiles 1..7.
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); if (!p) return; p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
const SPEAR = { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' };
let says = [], audioFired = [];
function newFight(id, playerHp, monsterHp) {
  try { if (Game.tbfight && !Game.tbfight.over) Game.tbEnd('fled'); } catch (e) {}
  says = []; audioFired = [];
  Game.startCombat(id);
  const m = Game.tbfight.fighters.find(x => x.kind === 'monster');
  if (!m) throw new Error('newFight: no monster for ' + id);
  if (monsterHp) m.hp = m.maxHp = monsterHp;
  const pl = P(); pl.hp = pl.maxHp = (playerHp || 100);
  pl.mx = Math.min(7, Math.max(1, m.mx - 3)); pl.my = Math.min(7, Math.max(1, m.my));
  Game.state.scholar.mx = pl.mx; Game.state.scholar.my = pl.my;
  Game.state.scholar.equipped.weapon = Object.assign({}, SPEAR);
  return m;
}
function moveNear(tx, ty) {
  const p = P(); if (!p) return;
  let guard = 0;
  while (Game.tbIsPlayerTurn() && !p.acted && p.moveLeft > 0 && guard++ < 10 &&
    Math.max(Math.abs(p.mx - tx), Math.abs(p.my - ty)) > 1) {
    const nx = Math.min(7, Math.max(1, p.mx + Math.sign(tx - p.mx)));
    const ny = Math.min(7, Math.max(1, p.my + Math.sign(ty - p.my)));
    if (!Game.tbPlayerMove(nx, ny)) break;
  }
}
function strikeKey(key) {
  if (Game.tbIsPlayerTurn() && P() && !P().acted) return Game.tbPlayerStrike(key);
  return null;
}
function playRound(strategy) {
  if (!Game.tbfight || Game.tbfight.over) return true;
  if (Game.tbIsPlayerTurn() && P() && P().alive && !P().acted) strategy();
  endTurn();
  return !Game.tbfight || Game.tbfight.over;
}

(async () => {
  await Game.init();
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = 1;
  Game.state.scholar.health = 500;
  Game.state.scholar.equipped = { weapon: Object.assign({}, SPEAR) };
  Game.canSee = () => true;
  Game.say = (t) => { says.push(String(t)); };
  const origAudio = Game.audioEvent;
  Game.audioEvent = function (name, d) { audioFired.push(name); return origAudio.call(this, name, d); };

  console.log('== 1+2. union_rep: the walkout breaks, organizing reads, fight is winnable AND losable ==');
  {
    // WINNABLE, played as a player: kill the picket line, drop the rep under
    // half, weather the walkout, break the line, finish the rep.
    const m = newFight('union_rep', 120, 90);
    let sawWalkout = false, sawBreak = false, walkoutRounds = 0, lastPhp = 120, won = false;
    let over = false, r = 0;
    for (r = 0; r < 30 && !over; r++) {
      if (P() && P().alive) lastPhp = P().hp;
      over = playRound(() => {
        const rep = MON('union_rep'); if (!rep) return;
        const allies = ALLIES_OF(rep);
        if (rep.urWalkout && allies.length) {
          const a = allies[0]; moveNear(a.mx, a.my); strikeKey(a.key); // break the line
        } else { moveNear(rep.mx, rep.my); strikeKey(rep.key); }
      });
      if (m.beamPhase === 'walkout' || m.urWalkout) sawWalkout = true;
      if (m.urWalkout) walkoutRounds++;
      if (says.join('\n').includes('LINE is broken')) sawBreak = true;
    }
    won = says.join('\n').includes('You came back bloody');
    check('walkout fired (the second act)', sawWalkout);
    check('line breaks when allies are gone (no soft-lock)', sawBreak, says.slice(-4).join(' | '));
    check('rep targetable again after the break', m.urWalkout === false && m.urLineBroken === true);
    check('organizing phase got a visible beat', says.join('\n').includes('clipboard'), says.slice(0, 6).join(' | '));
    check('fight is WINNABLE as a player (victory text, fight ended)', won && over, `rounds=${r} over=${over}`);
    check('fight did not stalemate (ended well under the round cap)', over && r < 30, `rounds=${r}`);
    check('all fired audio resolves in registry', audioFired.every(n => REG_KEYS.has(n)), audioFired.filter(n => !REG_KEYS.has(n)).join(','));

    // LOSABLE, played as a player: stand there and take it.
    newFight('union_rep', 100, 90);
    let lastPhp2 = 100, lost = false;
    over = false;
    for (r = 0; r < 30 && !over; r++) {
      if (P() && P().alive) lastPhp2 = P().hp;
      over = playRound(() => {}); // passive: no strikes, no movement
    }
    lost = says.join('\n').includes('You go down');
    check('fight is LOSABLE as a player (defeat text, fight ended)', lost && over, `rounds=${r} lastPhp=${lastPhp2}`);
  }

  console.log('== 3+4. heckler: threat floor + warming_up beat ==');
  {
    check('heckler direct damage 8-12 in data', JSON.stringify(MDEF.heckler.attack.damage) === '[8,12]', JSON.stringify(MDEF.heckler.attack.damage));
    const m = newFight('heckler', 300, 400); // fat: the arc must fire, not the kill
    const phases = new Set(); const chips = [];
    for (let r = 0; r < 14; r++) {
      const stOver = playRound(() => { moveNear(m.mx, m.my); strikeKey(m.key); });
      phases.add(m.beamPhase);
      for (const s of says) {
        const mm = s.match(/The words find the soft places\. \((\d+) psychic/);
        if (mm && !chips.includes(+mm[1])) chips.push(+mm[1]);
      }
      if (stOver) break;
    }
    const j = says.join('\n');
    check('warming_up phase visible (narrated beat)', j.includes('cracks its knuckles') || j.includes('cat watches a dropped glass'), says.slice(0, 6).join(' | '));
    check('headliner phase reached (escalation reachable)', phases.has('headliner'), [...phases].join(','));
    check('Vicious Mockery chip observed 6-10', chips.length > 0 && chips.every(c => c >= 6 && c <= 10), `chips=[${chips.join(',')}]`);
    check('hecklerTaunt fired at the pile-on', audioFired.includes('hecklerTaunt'));
  }

  console.log('== 5. paparazzo: a still player feeds prediction double, EXCLUSIVE fires ==');
  {
    const m = newFight('paparazzo', 500, 500);
    let exclusiveRound = -1, predAtExclusive = -1, stillCoaching = false;
    for (let r = 0; r < 14; r++) {
      const stOver = playRound(() => {}); // player plants their feet: no movement
      if (says.join('\n').includes('Just like that')) stillCoaching = true;
      if (m.beamPhase === 'exclusive' && exclusiveRound < 0) { exclusiveRound = r; predAtExclusive = m.pzPrediction; }
      if (stOver) break;
    }
    const j = says.join('\n');
    check('EXCLUSIVE fires vs a stationary player', exclusiveRound >= 0, `exclusiveRound=${exclusiveRound}`);
    check('EXCLUSIVE at prediction 4 (codex-true)', predAtExclusive === 4, `pred=${predAtExclusive}`);
    check('still-player coaching said (pre-math, move-then-plant safe)', stillCoaching);
    check('exclusive cue warns it is unavoidable', j.includes('UNAVOIDABLE flash'));
    check('exclusive audio resolves in registry', audioFired.includes('paparazzoExclusive') && REG_KEYS.has('paparazzoExclusive'));
  }

  console.log('== 6. understudy: the COLD READ ends the passive stall ==');
  {
    const m = newFight('understudy', 300, 500);
    const hp0 = P().hp;
    let prodRound = -1, lastPhp = hp0;
    for (let r = 0; r < 10; r++) {
      if (P() && P().alive) lastPhp = P().hp;
      const stOver = playRound(() => {}); // passive player: never strikes
      const j6 = says.join('\n');
      // known branch: "Then I'll do you" / unknown branch: "Done waiting — hit it first."
      if (prodRound < 0 && (j6.includes("Then I'll do you") || j6.includes('Done waiting'))) { prodRound = r; }
      if (stOver) break;
    }
    check('COLD READ prod fires after ~3 watching turns with zero observations', prodRound >= 0 && prodRound <= 6, `prodRound=${prodRound}`);
    check('the prod deals damage (fight cannot stall)', lastPhp < hp0, `hp ${hp0}->${lastPhp}`);
    check('zero observations recorded (starved, as designed)', Object.keys(m.usSeen || {}).length === 0);
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
