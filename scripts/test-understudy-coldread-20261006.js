// UNDERSTUDY COLD READ (Steve 2026-10-06) — anti-stall prod proof.
// The gap: a passive player faced a monster that never acted, forever.
// The fix: after ~3 watching turns without learning a real move, the
// understudy performs a COLD READ — it learned your stillness and attacks
// with your own body, badly. Played as a player, not grepped.
// Run: node scripts/test-understudy-coldread-20261006.js
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
const APP_SRC = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const REG_KEYS = new Set([...APP_SRC.matchAll(/^\s{6}([a-zA-Z][\w-]*)\(/gm)].map(m => m[1]));

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function note(name, detail) { console.log(`  NOTE ${name}${detail ? ' — ' + detail : ''}`); }

const P = () => Game.tbFighter('p');
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
  says = [];
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
function strikeKey(key) {
  if (Game.tbIsPlayerTurn() && P() && !P().acted) return Game.tbPlayerStrike(key);
  return null;
}
function playRound(strategy) {
  const st = { over: false, lastPhp: P() ? P().hp : 0, result: null };
  const f0 = Game.tbfight;
  if (!f0 || f0.over) { st.over = true; st.result = f0 && f0.result; return st; }
  if (P() && P().alive) st.lastPhp = P().hp;
  if (Game.tbIsPlayerTurn() && P() && P().alive && !P().acted) strategy();
  endTurn();
  st.over = !Game.tbfight || Game.tbfight.over || f0.over;
  st.result = f0.over ? f0.result : null;
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

  console.log('== COLD READ 1: fully passive player, 10 rounds ==');
  {
    const audioMark = audioFired.length;
    const m = newFight('understudy', 300, 400);
    const hp0 = P().hp;
    const phases = new Set();
    let coldReadRound = -1, damagedRound = -1;
    for (let r = 0; r < 10; r++) {
      const st = playRound(() => {}); // passive: never strikes
      phases.add(m.beamPhase);
      if (coldReadRound < 0 && /COLD READ|I'll do you|It stops watching\. It stands the way you stand/i.test(says.join('\n'))) coldReadRound = r + 1;
      if (damagedRound < 0 && P().hp < hp0) damagedRound = r + 1;
      if (st.over) break;
    }
    const log = says.join('\n');
    note('passive 10 rounds', `phases {${[...phases].join(',')}}, coldRead@R${coldReadRound}, first damage@R${damagedRound}, player hp ${hp0}->${P().hp}`);
    check('cold-read prod fires', coldReadRound > 0, `coldReadRound=${coldReadRound}`);
    check('prod fires by round 5 (after ~3 watching turns)', coldReadRound > 0 && coldReadRound <= 5, `coldReadRound=${coldReadRound}`);
    check('monster leaves watching phase', ![...phases].every(p => p === 'watching'), `phases={${[...phases].join(',')}}`);
    check('monster acts: player takes damage', P().hp < hp0, `hp ${hp0}->${P().hp}`);
    check('prod line is voiced (not a bare mechanic)', /I'll do you|learned your stillness|It stands the way you stand/i.test(log));
    check('usColdRead flag set', m.usColdRead === true);
    const newAudio = audioFired.slice(audioMark);
    check('all fired audio resolves in registry', newAudio.every(n => REG_KEYS.has(n)), newAudio.filter(n => !REG_KEYS.has(n)).join(','));
  }

  console.log('== COLD READ 2: one strike then turtle (1 observation) ==');
  {
    const m = newFight('understudy', 300, 400);
    const hp0 = P().hp;
    let coldReadRound = -1, struck = false;
    for (let r = 0; r < 10; r++) {
      const st = playRound(() => {
        if (!struck) { strikeKey(m.key); struck = true; }
      });
      if (coldReadRound < 0 && /COLD READ|I'll do you|It stops watching\. It stands the way you stand/i.test(says.join('\n'))) coldReadRound = r + 1;
      if (st.over) break;
    }
    note('1 strike then turtle', `coldRead@R${coldReadRound}, observations ${JSON.stringify(m.usSeen)}, player hp ${hp0}->${P().hp}`);
    check('prod still fires with 1 observation (anti-stall covers partial passivity)', coldReadRound > 0, `coldReadRound=${coldReadRound}`);
    check('monster acts after prod', P().hp < hp0, `hp ${hp0}->${P().hp}`);
  }

  console.log('== COLD READ 3: no regression — aggressive player still drives the normal arc ==');
  {
    const m = newFight('understudy', 300, 400);
    const phases = new Set();
    let struck = 0;
    for (let r = 0; r < 10; r++) {
      const st = playRound(() => {
        if (P().alive && !P().acted && struck < 5) { strikeKey(m.key); struck++; }
      });
      phases.add(m.beamPhase);
      if (st.over) break;
    }
    note('aggressive play', `strikes ${struck}, phases {${[...phases].join(',')}}, coldRead=${m.usColdRead === true}`);
    check('normal arc reaches performing (learned your moves)', [...phases].includes('performing'), `phases={${[...phases].join(',')}}`);
    check('cold read does NOT fire when the player is fighting (no false prod)', m.usColdRead !== true, `usColdRead=${m.usColdRead}`);
    check('opening steal armed on performing', m.usPerformed === true || m.usStealArmed);
  }

  const unregistered = [...new Set(audioFired)].filter(n => !REG_KEYS.has(n));
  console.log(`\n${pass} pass, ${fail} fail${unregistered.length ? ' — UNREGISTERED AUDIO: ' + unregistered.join(',') : ''}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
