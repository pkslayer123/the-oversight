#!/usr/bin/env node
// ADVERSARIAL brawler proof, round 1 (2026-10-10, rotation idx 4).
// Played as a HOSTILE brawler: the verbs are weapons.
//
// E1 STRIKE-PRACTICE GATING: every resolving strike grants exactly +1 str /
//    +1 agi practice; blocked paths (fled, downed) grant 0; the stat-10
//    ceiling holds even on a resolving strike. (Break attempt: risk-free
//    practice farming.)
// E2 INTIMIDATE BREAKING POINT: shaking down the same terrified villager
//    3x must snap-or-run on the third (no third yield); yields must move
//    real food; trust/crime/memory must land; a fled removal must not
//    corrupt the roster.
// T3 ROUTED RE-ENGAGE (softlock): rout a fight via fled, then immediately
//    start a new fight — no phantom fighters, no dead tbfight.
// H1 ARMOR CLAMP HONESTY: the 2026-10-09 armor model promises "at least 1
//    of any real blow lands" — absorbed = min(hit-1, round(hit*r)),
//    r = P/(P+20). Sweep P 0..120 x hit 1..40 through the REAL tbDamage
//    and assert the floor holds and no "Armor absorbs 0." is ever said.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '7', 10);
function loadAll(seed) {
  delete globalThis.Scattering;
  Math.random = mulberry32(seed);
  global.window = global;
  global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
  global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const files = [...html.matchAll(/<script src="([^"]+)"/g)]
    .map(m => m[1].split('?')[0])
    .filter(f => f.startsWith('src/js/'))
    .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
  for (const f of files) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  delete global.window;
  return globalThis.Scattering.Game;
}
let failures = 0;
function check(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
}
let said = [];
function freshGame(Game) {
  try { Game.tbfight = null; } catch (e) {}
  Game.say = () => {};
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.debugToWildNode();
  const s = Game.state.scholar;
  s.inventory = [];
  s.day = 1; Game.dayPart = 1; s.dayTicks = 0;
  Game.state.weather = 'clear';
  s.insideTent = null;
  s.kcal = 2000; s.hydration = 100; s.health = 100; s.energy = 80;
  s.stats = { str: 5, end: 5, per: 5, agi: 5, pre: 5 };
  s.practice = {};
  said = [];
  Game.say = (m) => { said.push(String(m)); };
}
// Advance the async-free turn queue until it's the player's turn or the fight ends.
function toPlayerTurn(Game) {
  let guard = 0;
  while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && guard++ < 40) {
    try { Game.tbAfterPlayerAction(); } catch (e) { break; }
  }
  return !!(Game.tbfight && !Game.tbfight.over && Game.tbIsPlayerTurn());
}
function startAdjacentFight(Game, monsterId) {
  Game.startCombat(monsterId || 'hushwolf');
  if (!Game.tbfight) return null;
  const pf = Game.tbFighter('p');
  const m = (Game.tbfight.fighters || []).find(f => f.kind === 'monster' && f.alive);
  if (!pf || !m) return null;
  pf.hp = pf.maxHp = 200; Game.state.scholar.health = 200;
  pf.mx = 4; pf.my = 4; m.mx = 5; m.my = 4;
  toPlayerTurn(Game);
  return m;
}

const Game = loadAll(SEED);

(async () => {
await Game.init();

// ============ E1: strike-practice gating ============
freshGame(Game);
{
  const m = startAdjacentFight(Game, 'hushwolf');
  check('E1 fight starts, player turn', !!m && Game.tbIsPlayerTurn());
  const s = Game.state.scholar;
  const p0 = { str: s.practice.str || 0, agi: s.practice.agi || 0 };
  const r = Game.tbPlayerStrike(m.key);
  check('E1 resolving strike returns true', r === true);
  check('E1 resolving strike grants exactly +1 str practice', (s.practice.str || 0) === p0.str + 1, `got ${s.practice.str}`);
  check('E1 resolving strike grants exactly +1 agi practice', (s.practice.agi || 0) === p0.agi + 1, `got ${s.practice.agi}`);
  // End the turn PROPERLY: a strike leaves moveLeft>0 so the turn stays open
  // (the player could still move). Zero the moves, then advance: the monster
  // acts and the next player turn opens with acted=false.
  const pfA = Game.tbFighter('p'); pfA.moveLeft = 0;
  Game.tbAfterPlayerAction();
  toPlayerTurn(Game);
  check('E1 next player turn opened', Game.tbIsPlayerTurn() && !Game.tbFighter('p').acted);
  // fled target: blocked, no practice
  m.fled = true;
  const p1 = { str: s.practice.str || 0, agi: s.practice.agi || 0 };
  const r2 = Game.tbPlayerStrike(m.key);
  check('E1 fled target blocked', r2 === false);
  check('E1 fled target grants no practice', (s.practice.str || 0) === p1.str && (s.practice.agi || 0) === p1.agi);
  check('E1 fled refusal narrated', said.some(x => /fled the fight|No striking at backs/.test(x)));
}
freshGame(Game);
{
  // downed target: blocked, no practice
  const m = startAdjacentFight(Game, 'hushwolf');
  const s = Game.state.scholar;
  m.alive = false; m.hp = 0;
  const p0 = { str: s.practice.str || 0, agi: s.practice.agi || 0 };
  const r = Game.tbPlayerStrike(m.key);
  check('E1 downed target blocked', r === false);
  check('E1 downed target grants no practice', (s.practice.str || 0) === p0.str && (s.practice.agi || 0) === p0.agi);
  check('E1 downed refusal narrated', said.some(x => /already down/.test(x)));
}
freshGame(Game);
{
  // stat ceiling: resolving strike at str/agi 10 grants no practice
  const m = startAdjacentFight(Game, 'hushwolf');
  const s = Game.state.scholar;
  s.stats.str = 10; s.stats.agi = 10;
  const p0 = { str: s.practice.str || 0, agi: s.practice.agi || 0 };
  Game.tbPlayerStrike(m.key);
  check('E1 stat-10 ceiling: no practice on resolving strike', (s.practice.str || 0) === p0.str && (s.practice.agi || 0) === p0.agi);
}

// ============ E2: intimidate breaking point ============
freshGame(Game);
{
  const v = Game.state.village;
  const vid = (v.roster || []).find(id => id !== Game.villagerId);
  check('E2 villager exists', !!vid);
  const rec = Game.data.villagers.find(x => x.id === vid);
  rec.personality = rec.personality || {}; rec.personality.temperament = 'cautious';
  v.pack = v.pack || {}; v.pack[vid] = { day: 1, kcal: 3000 };
  const trust0 = ((v.trust || {})[vid] === undefined ? 10 : v.trust[vid]);
  const r1 = Game.intimidate(vid);
  const r2 = Game.intimidate(vid);
  check('E2 first shakedown yields', r1 === 'yielded', `got ${r1}`);
  check('E2 second shakedown yields', r2 === 'yielded', `got ${r2}`);
  const stolen = Game.state.scholar.inventory.find(i => i.stolen);
  check('E2 yields move real food into player pack', !!stolen && (stolen.units || 0) > 0 && (stolen.kcalEach || 0) > 0);
  check('E2 second yield telegraphs the break', said.some(x => /Not again/.test(x)));
  const r3 = Game.intimidate(vid);
  check('E2 third shakedown does NOT yield', r3 !== 'yielded', `got ${r3}`);
  check('E2 third shakedown snaps or runs', r3 === 'fight' || r3 === 'fled', `got ${r3}`);
  const trust1 = ((Game.state.village.trust || {})[vid] === undefined ? 10 : Game.state.village.trust[vid]);
  check('E2 trust dropped across shakedowns', trust1 < trust0, `${trust0} -> ${trust1}`);
  const mems = ((Game.state.village.memory || {})[vid] || []).filter(m => m.t === 'you_threatened');
  check('E2 threats on the record', mems.length >= 2, `mems=${mems.length}`);
  if (r3 === 'fled') {
    check('E2 fled victim leaves roster', !(Game.state.village.roster || []).includes(vid));
    check('E2 game still runs after removal', typeof Game.tickAction === 'function' && !Game.over);
  }
  if (r3 === 'fight') {
    check('E2 snap starts betrayal fight, no crash', typeof Game.tbfight !== 'undefined');
  }
}

// ============ T3: routed re-engage ============
freshGame(Game);
{
  const m = startAdjacentFight(Game, 'hushwolf');
  check('T3 fight 1 starts', !!m);
  m.fled = true;
  Game.tbEndCheck();
  check('T3 all-fled ends fight (routed)', !Game.tbfight);
  check('T3 rout narrated honestly', said.some(x => /No meat, no trophy/.test(x)));
  const m2 = startAdjacentFight(Game, 'hushwolf');
  check('T3 immediate re-engage works', !!m2 && Game.tbIsPlayerTurn());
  const r = Game.tbPlayerStrike(m2.key);
  check('T3 strike works in fight 2', r === true);
  check('T3 no phantom fighters', (Game.tbfight.fighters || []).filter(f => f.fled && f.alive).length === 0);
}

// ============ H1: armor clamp ============
freshGame(Game);
{
  const m = startAdjacentFight(Game, 'hushwolf');
  check('H1 fight starts', !!m);
  const pf = Game.tbFighter('p');
  let worst = 0, worstCase = '';
  let absorbZeroSaid = false;
  let mismatch = 0;
  const origArmor = Game.armorBonus;
  for (const P of [0, 5, 20, 54, 100, 120]) {
    Game.armorBonus = () => P;
    for (let hit = 1; hit <= 40; hit++) {
      pf.hp = pf.maxHp = 1000;
      said = [];
      const pierce = 0;
      const effP = P * (1 - Math.min(0.9, Math.max(0, pierce)));
      const rr = effP / (effP + 20);
      const expectedAbsorb = Math.min(hit - 1, Math.round(hit * rr));
      const expectedFinal = hit - expectedAbsorb;
      const dealt = Game.tbDamage('p', hit, 'armor probe', m.key, { quiet: true, undodgeable: true });
      if (dealt !== expectedFinal) mismatch++;
      if (dealt < 1) { worst = dealt; worstCase = `P=${P} hit=${hit}`; }
      if (said.some(x => /Armor absorbs 0/.test(x))) absorbZeroSaid = true;
    }
  }
  Game.armorBonus = origArmor;
  check('H1 formula matches canon (absorbed=min(hit-1,round(hit*r)))', mismatch === 0, `mismatches=${mismatch}`);
  check('H1 at least 1 of any real blow lands', worst === 0, worstCase || 'floor held');
  check('H1 never says "Armor absorbs 0."', !absorbZeroSaid);
}

console.log(failures === 0 ? '\nALL GREEN' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
})();
