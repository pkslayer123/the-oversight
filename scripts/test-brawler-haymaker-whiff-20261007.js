#!/usr/bin/env node
// PROOF: haymaker whiff is real (Steve 2026-10-07 fix).
//
// Bug: throw_haymaker's data text ("2.5x damage, but -30% accuracy. If it
// misses, you're off-balance") and impl narration promised a gamble, but the
// strike engine had NO accuracy roll and offBalanceOnMiss had zero consumers
// — the 2.5x was free. Fix (game.js): tbPlayerStrike rolls the readied
// haymaker's accPenalty; a whiff consumes the flag, spends the turn, and sets
// haymakerOffBalance (next incoming hit: no dodge, flag consumed);
// startCombat resets the flag. Dead-aim ("cannot miss") holds over the whiff.
//
// Proof: (A) seeded miss rate ≈30% over many strikes, every miss narrates +
// sets the flag + consumes haymakerReady; (B) aimed strikes never whiff on the
// same seed; (C) off-balance suppresses a guaranteed dodge exactly once;
// (D) startCombat clears the flag; (E) hits still deal 2.5x.
//
// Loads the FIXED game.js via GAME_JS env (default: worktree). Engine otherwise
// from the pristine HEAD extract (worktree src/js is dirty with sibling work).
// Usage: GAME_JS=/tmp/game-fixed.js ROOT=/tmp/headjs-brawler2 node scripts/test-brawler-haymaker-whiff-20261007.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED);
const ROOT = process.env.ROOT || '/tmp/headjs-brawler2';
const GAME_JS = process.env.GAME_JS || path.join(ROOT, 'src', 'js', 'game.js');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
for (const f of order) {
  const fp = (f === 'src/js/game.js') ? GAME_JS : path.join(ROOT, f);
  try { eval(fs.readFileSync(fp, 'utf8')); } catch (e) { console.log(`LOAD FAIL ${fp}: ${e.message}`); }
}
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;
const says = [];
Game.say = (t) => { says.push(String(t)); };
function clearSays() { says.splice(0); }
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p'); if (p) { p.moveLeft = 0; p.acted = true; }
  Game.tbAfterPlayerAction();
}
function freshFight() {
  const s = Game.state.scholar;
  for (const k of ['haymakerReady', 'haymakerOffBalance', 'tradeOpen', 'braceActive', 'rageActive', 'fightDamageTaken']) delete s[k];
  s.health = 100; s.kcal = 3000;
  if (Game.tbfight) Game.tbfight.over = true;
  Game.startCombat('bulldozer');
  const mk = Game.tbfight.fighters.find(x => x.kind === 'monster').key;
  const mo = Game.tbFighter(mk); mo.hp = 500; mo.maxHp = 500;
  const pp = Game.tbFighter('p'); pp.hp = 100; pp.maxHp = 100; pp.alive = true;
  return mk;
}
function strikeAdjacent(mk) {
  const m = Game.tbFighter(mk), pp = Game.tbFighter('p');
  pp.mx = Math.min(7, Math.max(1, m.mx + 1)); pp.my = Math.min(7, Math.max(1, m.my));
  if (pp.mx === m.mx && pp.my === m.my) pp.mx = Math.max(1, m.mx - 1);
  Game.tbPlayerStrike(mk);
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const s = Game.state.scholar;
  s.health = 100; s.kcal = 3000; s.hydration = 90; s.energy = 100; s.trauma = 0;
  Game.state.weather = 'clear';
  s.abilities = [{ id: 'haymaker', name: 'haymaker', desc: '', level: 2, xp: 0 }];

  // ============ A. seeded miss rate ============
  console.log('\n=== A. whiff rate over 60 readied haymakers (seed ' + SEED + ') ===');
  let misses = 0, hits = 0, whiffNarrated = 0, flagSet = 0;
  for (let i = 0; i < 60; i++) {
    const mk = freshFight();
    clearSays();
    Game.useAbility('haymaker', 'throw_haymaker');
    endTurn(); // pass the spent ability turn; next strike is fresh
    // NOTE: useAbility auto-advance check — endTurn only advances a fresh turn
    clearSays();
    strikeAdjacent(mk);
    const narr = says.join(' ');
    if (/catches nothing but air/.test(narr)) { misses++; whiffNarrated++; }
    else if (/HAYMAKER/.test(narr)) { hits++; }
    if (s.haymakerOffBalance) flagSet++;
    // re-ready next iteration via freshFight (flag cleared there)
    endTurn();
    if (!Game.inCombat()) break;
  }
  console.log(`   misses=${misses} hits=${hits} (60 trials)`);
  check('miss rate is real (~30%: 8-28 of 60)', misses >= 8 && misses <= 28, `misses=${misses}`);
  check('every miss narrates the whiff', whiffNarrated === misses);
  check('every miss sets haymakerOffBalance', flagSet === misses);
  check('at least one hit landed (upside intact)', hits > 0);

  // ============ B. dead-aim holds over the whiff ============
  console.log('\n=== B. aimed haymaker never whiffs (same seed) ===');
  Math.random = mulberry32(SEED); // reset seed: identical roll sequence to A
  let aimedMisses = 0;
  // burn the same number of random draws as A's loop would... instead: direct
  // comparison — find a strike index that whiffed in A is complex; simpler:
  // with aim on, 60 readied strikes must yield ZERO whiffs regardless of rolls.
  for (let i = 0; i < 60; i++) {
    const mk = freshFight();
    Game.useAbility('haymaker', 'throw_haymaker');
    endTurn();
    clearSays();
    Game.tbFighter('p').aimed = true; // dead-aim: cannot miss
    strikeAdjacent(mk);
    if (/catches nothing but air/.test(says.join(' '))) aimedMisses++;
    endTurn();
    if (!Game.inCombat()) break;
  }
  check('aimed: zero whiffs in 60', aimedMisses === 0);

  // ============ C. off-balance suppresses dodge exactly once ============
  console.log('\n=== C. off-balance kills the dodge, once ===');
  {
    const mk = freshFight();
    // guarantee a dodge chance: footwork 3 + high agi
    s.passives = s.passives || {}; s.passives.footwork = 3;
    const agi0 = Game.stat('agi');
    // force the flag deterministically (bypass the 30% roll)
    s.haymakerOffBalance = true;
    clearSays();
    const m = Game.tbFighter(mk);
    Game.tbDamage('p', 10, m.name || 'test');
    const narr = says.join(' ');
    check('off-balance narrates the lost slip-aside', /Off-balance from the whiffed haymaker/.test(narr), narr.slice(0, 120));
    check('flag consumed by the incoming hit', !s.haymakerOffBalance);
    // second hit: flag gone — normal path (no off-balance narration even with dodge chance)
    s.haymakerOffBalance = false;
    clearSays();
    Game.tbDamage('p', 10, m.name || 'test');
    check('no off-balance narration when flag absent', !/Off-balance/.test(says.join(' ')));
    void agi0;
  }

  // ============ D. startCombat resets the flag ============
  console.log('\n=== D. flag hygiene ===');
  {
    s.haymakerOffBalance = true;
    Game.startCombat('bulldozer');
    check('startCombat clears haymakerOffBalance', !s.haymakerOffBalance);
    if (Game.tbfight) Game.tbfight.over = true;
  }

  // ============ E. hit still deals 2.5x ============
  console.log('\n=== E. upside intact ===');
  {
    Math.random = mulberry32(999); // fresh sequence; find a hitting roll
    let dealt = null;
    for (let i = 0; i < 20 && dealt === null; i++) {
      const mk = freshFight();
      Game.useAbility('haymaker', 'throw_haymaker');
      endTurn();
      clearSays();
      const m = Game.tbFighter(mk); m.hp = 500;
      const hp0 = m.hp;
      strikeAdjacent(mk);
      const narr = says.join(' ');
      if (/HAYMAKER: a wild/.test(narr)) dealt = hp0 - m.hp;
      endTurn();
    }
    // base strike ~10-16; haymaker 2.5x (+heavy_damage 1.2x if held — not held here) => >= 20
    check('haymaker hit deals 2.5x (>=20 on 10-16 base)', dealt !== null && dealt >= 20, `dealt=${dealt}`);
  }

  console.log(`\nRESULT: ${pass} ok, ${fail} FAIL (seed ${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
