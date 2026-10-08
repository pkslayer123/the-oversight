// PROOF TEST (Steve 2026-10-06): wave-2 fix verification AS A PLAYER.
// Fixes the gaps reported (not fixed) by scripts/test-wave2-playverify-20261006.js:
//   1. union_rep WALKOUT soft-lock: urWalkout never cleared -> permanent
//      untargetable + zero damage = infinite stalemate; walkout at half HP
//      also made the second half unwinnable-by-design.
//      FIX: when all allies are gone the line breaks (urWalkout=false,
//      urLineBroken=true so it can't re-trigger, phase back to organizing,
//      rep targetable again).
//   2. union_rep 'organizing' phase had no visible beat.
//   3. heckler threat floor: Vicious Mockery chip 3-6 -> 6-10; direct 6-10 -> 8-12.
//   4. heckler 'warming_up' phase had no visible beat.
//   5. hecklerTaunt (deepened synth) was never fired -> now fires at the pile-on.
//   6. paparazzo exclusive unreachable vs fast kills: a STILL player feeds
//      prediction double (+2/shot), so the second act is reachable whenever
//      you plant your feet.
//   7. understudy passive-player stall: 3 watching turns with zero
//      observations -> it prods you (clumsy shove), ending the disengagement.
//
// Run: node scripts/test-wave2-fixverify-20261006.js
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
})(20261007);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const MONSTERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
const MDEF = Object.fromEntries(MONSTERS.filter(m => m.id).map(m => [m.id, m]));
const APP_SRC = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const REG_KEYS = new Set([...APP_SRC.matchAll(/^\s{6}([a-zA-Z][\w-]*)\(/gm)].map(m => m[1]));

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const P = () => Game.tbFighter('p');
const MON = (id) => Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive && !x.fled && x.mdef && x.mdef.id === id);
const ALLIES_OF = (m) => Game.tbfight.fighters.filter(x => x.kind === 'monster' && x.alive && !x.fled && x.key !== m.key);
// TURN HYGIENE: advance exactly one AI round, never two.
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
function moveToward(tx, ty) {
  const p = P(); if (!p) return;
  let guard = 0;
  while (Game.tbIsPlayerTurn() && !p.acted && p.moveLeft > 0 && guard++ < 8 &&
    Math.max(Math.abs(p.mx - tx), Math.abs(p.my - ty)) > 2) {
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
  const st = { over: false, lastPhp: P() ? P().hp : 0 };
  if (!Game.tbfight || Game.tbfight.over) { st.over = true; return st; }
  if (P() && P().alive) st.lastPhp = P().hp;
  if (Game.tbIsPlayerTurn() && P() && P().alive && !P().acted) strategy();
  endTurn();
  st.over = !Game.tbfight || Game.tbfight.over;
  if (P() && P().alive) st.lastPhp = P().hp;
  return st;
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

  console.log('== 1. union_rep: the line breaks (no more soft-lock) ==');
  {
    const m = newFight('union_rep', 200, 200);
    // Force walkout on its next turn: drop it under half HP.
    m.hp = Math.floor(m.maxHp * 0.4);
    let sawWalkout = false, sawBreak = false, phases = new Set();
    for (let r = 0; r < 20; r++) {
      const st = playRound(() => {}); // player waits
      phases.add(m.beamPhase);
      if (m.beamPhase === 'walkout') sawWalkout = true;
      // Once walking out, wipe the picket (the player broke the line).
      if (m.urWalkout) for (const a of ALLIES_OF(m)) { a.hp = 0; a.alive = false; }
      if (says.join('\n').includes('LINE is broken')) { sawBreak = true; break; }
      if (st.over) break;
    }
    check('walkout fired', sawWalkout);
    check('line breaks when allies are gone', sawBreak, says.slice(-3).join(' | '));
    check('rep targetable again after the break', m.urWalkout === false);
    check('walkout cannot re-trigger (urLineBroken)', m.urLineBroken === true);
    check('organizing phase got a visible beat', says.join('\n').includes('clipboard'));
    // The fight is now finishable: strike the rep directly.
    moveToward(m.mx, m.my);
    const hpBefore = m.hp;
    const res = strikeKey(m.key);
    check('player can strike the rep post-break', res !== null && res !== false && m.hp < hpBefore, `res=${res} hp ${hpBefore}->${m.hp}`);
    check('all fired audio resolves in registry', audioFired.every(n => REG_KEYS.has(n)), audioFired.filter(n => !REG_KEYS.has(n)).join(','));
  }

  console.log('== 2. heckler: threat floor + visible phases + taunt wired ==');
  {
    check('heckler direct damage 8-12 in data', JSON.stringify(MDEF.heckler.attack.damage) === '[8,12]', JSON.stringify(MDEF.heckler.attack.damage));
    const m = newFight('heckler', 300, 400); // fat: the arc must fire, not the kill
    const phases = new Set(); const chips = [];
    for (let r = 0; r < 14; r++) {
      const st = playRound(() => { moveToward(m.mx, m.my); strikeKey(m.key); });
      phases.add(m.beamPhase);
      for (const s of says) {
        const mm = s.match(/The words find the soft places\. \((\d+) psychic/);
        if (mm) chips.push(+mm[1]);
      }
      if (st.over) break;
    }
    says = says; // keep
    check('warming_up phase visible (narrated, known or unknown variant)',
      says.join('\n').includes('cracks its knuckles') || says.join('\n').includes('cat watches a dropped glass'),
      says.slice(0, 8).join(' | '));
    check('headliner phase reached', phases.has('headliner'), [...phases].join(','));
    check('Vicious Mockery chip 6-10', chips.length > 0 && chips.every(c => c >= 6 && c <= 10), `chips=[${chips.join(',')}]`);
    check('hecklerTaunt fired at the pile-on', audioFired.includes('hecklerTaunt'));
    check('hecklerJibe still fired with shame payload', audioFired.includes('hecklerJibe'));
  }

  console.log('== 3. paparazzo: a still player feeds prediction double ==');
  {
    const m = newFight('paparazzo', 500, 500);
    let exclusiveRound = -1; let predAtExclusive = -1;
    for (let r = 0; r < 12; r++) {
      const st = playRound(() => {}); // player plants their feet: no movement
      if (m.beamPhase === 'exclusive' && exclusiveRound < 0) { exclusiveRound = r; predAtExclusive = m.pzPrediction; }
      if (st.over) break;
    }
    check('exclusive fires vs a stationary player', exclusiveRound >= 0, `exclusiveRound=${exclusiveRound}`);
    check('exclusive at prediction 4 (codex-true)', predAtExclusive === 4, `pred=${predAtExclusive}`);
    check('still-player coaching said', says.join('\n').includes('Hold still. Yes. Just like that.'));
    check('exclusive cue warns it is unavoidable', says.join('\n').includes('UNAVOIDABLE flash'));
  }

  console.log('== 4. understudy: the prod ends the passive stall ==');
  {
    const m = newFight('understudy', 300, 500);
    const hp0 = P().hp;
    let prodRound = -1;
    for (let r = 0; r < 8; r++) {
      const st = playRound(() => {}); // passive player: never strikes
      if (says.join('\n').includes("Nothing to learn? Then I'll make you MOVE.")) { prodRound = r; break; }
      if (st.over) break;
    }
    check('prod fires after ~3 watching turns with zero observations', prodRound >= 0 && prodRound <= 5, `prodRound=${prodRound}`);
    check('the prod deals damage (fight cannot stall)', P() ? P().hp < hp0 : true, `hp ${hp0}->${P() && P().hp}`);
    check('zero observations recorded (starved, as designed)', Object.keys(m.usSeen || {}).length === 0);
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
