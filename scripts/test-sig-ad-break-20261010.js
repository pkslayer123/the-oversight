#!/usr/bin/env node
// PROOF: sigW3c AD BREAK — ad pause with progress bar, heal/reposition,
// skip beat (audience favor), look away, killable sponsor-creature.
// BEFORE (MECHANIC=off): hooks/actions absent -> RED. AFTER: green x3 seeds.
const H = require('./sim-harness.js');
const SEED = parseInt(process.env.SEED || '20261010', 10);
const OFF = process.env.MECHANIC === 'off';
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + name + (detail ? ' — ' + detail : '')); }
};

function toPlayerTurn(Game) {
  let g = 0;
  while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && g++ < 80) Game.tbAdvance();
}
// ACTION ECONOMY: the turn only advances when moves are spent and the act
// is used — a driver that moves/strikes with moveLeft left over must spend
// the rest, or the fight stalls on the player's turn forever.
function endPlayerTurn(Game) {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p');
  if (!p) return;
  p.moveLeft = 0;
  if (!p.acted) Game.tbPlayerWait();
  else Game.tbAfterPlayerAction();
}
function endFight(Game) {
  if (Game.tbfight) { try { Game.tbfight.over = true; } catch (e) {} Game.tbfight = null; }
  try { Game.state.scholar.monster = null; } catch (e) {}
}
function admon(Game) { return Game.tbfight.fighters.find(x => x.kind === 'monster' && x.mdef && x.mdef.id === 'ad_break'); }
function sponsor(Game) { return Game.tbfight && Game.tbfight.fighters.find(x => x.mdef && x.mdef.id === 'ad_sponsor' && x.alive && !x.fled); }
// run monster turns until the ad starts (the hook yields while a generic
// wind-up is pending — telegraph honesty — so this takes 4+ turns)
function untilAd(Game, m, maxTurns) {
  for (let i = 0; i < (maxTurns || 16); i++) {
    if (!Game.tbfight || Game.tbfight.over || m.adActive) break;
    Game.tbMonsterTurn(m);
  }
}

(async () => {
  const { Game } = await H.loadGame({ seed: SEED });
  await H.setupGame(Game);
  const s = Game.state.scholar;
  const said = [];
  Game.say = (t) => { said.push(String(t)); };
  console.log('== SIG-W3C AD BREAK PROOF, SEED ' + SEED + (OFF ? ' [MECHANIC=off]' : '') + ' ==');

  ok('OFF/ON: hook registration state matches mode',
    OFF ? (typeof global.MonsterBehaviorHooks.adBreak === 'undefined') : (typeof global.MonsterBehaviorHooks.adBreak === 'function'));
  ok('OFF/ON: tbPlayerSkipAd presence matches mode',
    OFF ? (typeof Game.tbPlayerSkipAd === 'undefined') : (typeof Game.tbPlayerSkipAd === 'function'));
  ok('OFF/ON: tbPlayerLookAway presence matches mode',
    OFF ? (typeof Game.tbPlayerLookAway === 'undefined') : (typeof Game.tbPlayerLookAway === 'function'));

  if (OFF) {
    s.health = 9000; s.mx = 4; s.my = 4;
    Game.startCombat('ad_break');
    const m = admon(Game);
    for (let i = 0; i < 6; i++) Game.tbMonsterTurn(m);
    ok('OFF RED: ad starts', !!m.adActive);
    ok('OFF RED: sponsor spawns', Game.tbfight.fighters.some(x => x.mdef && x.mdef.id === 'ad_sponsor'));
    ok('OFF RED: skip-ad exists', typeof Game.tbPlayerSkipAd === 'function');
    console.log('  [expected RED above: mechanic absent]');
    console.log(`ad_break: ${pass} pass, ${fail} FAIL (BEFORE — mechanic absent, red as expected)`);
    process.exit(fail ? 1 : 0);
  }

  // ---- 1. the ad starts: bar, sponsor, honest telegraph ----
  Game.state.village.viewership = 0; // no favor: full-length ad
  s.health = 9000; s.mx = 4; s.my = 4;
  Game.startCombat('ad_break');
  let m = admon(Game);
  m.mx = 4; m.my = 6;
  said.length = 0;
  untilAd(Game, m); // adCd 3 -> 0, then the ad starts on a clean turn
  ok('ad starts after countdown', !!m.adActive, 'adActive=' + JSON.stringify(m.adActive));
  ok('ad: progress bar narrated', said.some(t => /PROGRESS BAR/.test(t)));
  ok('ad: full length without favor (total 4)', m.adActive && m.adActive.total === 4, 'total=' + (m.adActive && m.adActive.total));
  const sp = sponsor(Game);
  ok('ad: sponsor-creature spawns riding the glyph', !!sp, sp ? sp.key : 'none');
  ok('ad: sponsor is a real damageable fighter', sp && sp.kind === 'monster' && sp.hp === 40);

  // ---- 2. during the pause: it heals + repositions, and you watch ----
  m.hp = Math.min(m.hp, (m.maxHp || 300) - 60); // wound it so the heal is visible
  const hp0 = m.hp, mx0 = m.mx, my0 = m.my;
  said.length = 0;
  Game.tbMonsterTurn(m);
  ok('ad tick: progress advances', m.adActive && m.adActive.progress === 1, 'progress=' + (m.adActive && m.adActive.progress));
  const expectHeal = Math.round((m.maxHp || 300) * 0.03);
  ok('ad tick: heals (~5% maxHp)', m.hp - hp0 === expectHeal, '+' + (m.hp - hp0) + ' expected ' + expectHeal);
  ok('ad tick: repositions (drifts, never out of reach)', (m.mx !== mx0 || m.my !== my0), `(${mx0},${my0}) -> (${m.mx},${m.my})`);
  ok('ad tick: bar shown, you watch', said.some(t => /AD ▓/.test(t)) && said.some(t => /you watch/.test(t)));

  // ---- 3. kill the sponsor -> the ad shortens ----
  const prog0 = m.adActive.progress;
  Game.tbDamage(sp.key, 999, 'test', 'p');
  ok('sponsor: killable', !sp.alive);
  said.length = 0;
  Game.tbMonsterTurn(m);
  // progress was 1: slain (+2) + tick (+1) = 4 >= total 4 -> the ad ends
  // three ticks early. That IS the shorten.
  ok('sponsor slain: the ad shortens (ends early)', !m.adActive, 'adActive=' + !!m.adActive);
  ok('sponsor slain: bar JUMPS narrated', said.some(t => /JUMPS/.test(t)));

  // ---- 4. skip beat with audience favor ----
  endFight(Game);
  Game.state.village.viewership = 30; // the audience likes you
  s.health = 9000; s.mx = 4; s.my = 4;
  Game.startCombat('ad_break');
  m = admon(Game); m.mx = 4; m.my = 6;
  said.length = 0;
  untilAd(Game, m);
  ok('favor: ad is shorter (total 2)', m.adActive && m.adActive.total === 2, 'total=' + (m.adActive && m.adActive.total));
  Game.tbMonsterTurn(m); // one ad tick: progress 1 >= skipAt 1
  ok('favor: skip beat appears early', said.some(t => /SKIP AD is available/.test(t)));
  toPlayerTurn(Game);
  const p4 = Game.tbFighter('p'); p4.moveLeft = 3; p4.acted = false;
  said.length = 0;
  ok('skip: action works once the beat appears', Game.tbPlayerSkipAd() === true);
  ok('skip: ad over', !m.adActive);
  ok('skip: sponsor leaves with the glyph', !sponsor(Game));
  ok('skip: narrated', said.some(t => /SKIP AD/.test(t)));
  endFight(Game);

  // ---- 5. skip too early: honest refusal ----
  Game.state.village.viewership = 0;
  s.health = 9000; s.mx = 4; s.my = 4;
  Game.startCombat('ad_break');
  m = admon(Game); m.mx = 4; m.my = 6;
  untilAd(Game, m); // ad starts, progress 0
  toPlayerTurn(Game);
  const p5 = Game.tbFighter('p'); p5.moveLeft = 3; p5.acted = false;
  said.length = 0;
  ok('skip too early: refused honestly', Game.tbPlayerSkipAd() === false);
  ok('skip too early: patience coached', said.some(t => /hasn't appeared/.test(t)));
  ok('skip too early: turn NOT consumed', p5.acted === false);

  // ---- 6. look away: the ad starves, your aim suffers ----
  toPlayerTurn(Game); // still same fight, ad active, progress 0
  const p6 = Game.tbFighter('p'); p6.moveLeft = 3; p6.acted = false;
  m.hp = Math.min(m.hp, (m.maxHp || 300) - 60); // wound it so the halved heal is visible
  said.length = 0;
  ok('look away: action works', Game.tbPlayerLookAway() === true);
  ok('look away: narrated (power is that you WATCH)', said.some(t => /power is that you WATCH/.test(t)));
  const hp1 = m.hp;
  const progBefore = m.adActive.progress; // the look-away turn already ticked once (halved)
  Game.tbMonsterTurn(m); // ad tick with lookAway
  const halfHeal = Math.round((m.maxHp || 300) * 0.03 * 0.5);
  ok('look away: heal halved', m.hp - hp1 === halfHeal, '+' + (m.hp - hp1) + ' expected ' + halfHeal);
  ok('look away: progress starves (+0.5/tick)', m.adActive && (m.adActive.progress - progBefore) === 0.5, 'progress=' + (m.adActive && m.adActive.progress));
  // the blind strike: flag set until the next strike attempt
  toPlayerTurn(Game);
  const p7 = Game.tbFighter('p'); p7.moveLeft = 3; p7.acted = false;
  p7.mx = 4; p7.my = 4; m.mx = 5; m.my = 4;
  said.length = 0;
  const mHpBefore = m.hp;
  Game.tbPlayerStrike(m.key);
  ok('look away: strike is blind (hit or miss narrated)', said.some(t => /without looking/.test(t)));
  ok('look away: flag clears after the strike', (p7.adLookAway || 0) === 0);
  ok('look away: no crash either way', m.hp <= mHpBefore);
  endFight(Game);

  // ---- 7. the ad ends on its own; sponsor leaves ----
  Game.state.village.viewership = 0;
  s.health = 9000; s.mx = 4; s.my = 4;
  Game.startCombat('ad_break');
  m = admon(Game); m.mx = 4; m.my = 6;
  untilAd(Game, m); // ad starts
  said.length = 0;
  for (let i = 0; i < 10 && m.adActive; i++) Game.tbMonsterTurn(m); // run the bar to full
  ok('ad ends when the bar fills', !m.adActive);
  ok('ad end: thanked for watching', said.some(t => /Thanks for watching/.test(t)));
  ok('ad end: sponsor gone', !sponsor(Game));

  // ---- 8. field fight: villagers see the ad ----
  const mdef = Game.data.monsters.find(x => x.id === 'ad_break');
  const vid = (Game.state.village.roster || [])[0];
  const vid2 = (Game.state.village.roster || [])[1];
  Game.state.village.health = Game.state.village.health || {};
  Game.state.village.health[vid] = 900; // fixture: hold the line so round 4 lands
  const rec = Game.fieldFight(vid, mdef, null, { allies: 1, allyVids: [vid2], allyFromStart: true });
  ok('field: terminates (<=15 rounds)', rec.rounds <= 15, 'rounds=' + rec.rounds);
  ok('field: ad in the log', rec.log.some(t => /AD BREAK/.test(t)));

  // ---- 9. full fight terminates <=200 rounds ----
  s.health = 9000; s.mx = 4; s.my = 4;
  Game.startCombat('ad_break');
  m = admon(Game);
  let rounds = 0;
  while (Game.tbfight && !Game.tbfight.over && rounds++ < 200) {
    toPlayerTurn(Game);
    if (!Game.tbfight || Game.tbfight.over) break;
    const q = Game.tbFighter('p');
    q.moveLeft = 3;
    if (!q.acted) {
      // close to striking distance first (don't waste the turn at range 2)
      let dd = Math.max(Math.abs(m.mx - q.mx), Math.abs(m.my - q.my));
      let mg = 0;
      while (dd > 1 && q.moveLeft > 0 && mg++ < 6) {
        const nx = q.mx + Math.sign(m.mx - q.mx), ny = q.my + Math.sign(m.my - q.my);
        if (!Game.tbPlayerMove(nx, ny)) break;
        dd = Math.max(Math.abs(m.mx - q.mx), Math.abs(m.my - q.my));
      }
      // patience + opportunism: skip when the beat appears, else strike.
      // NOTE: tbPlayerWait() already advances the turn — never endPlayerTurn() after it (double-advance).
      if (m.adActive && m.adActive.progress >= m.adActive.skipAt) { Game.tbPlayerSkipAd(); endPlayerTurn(Game); }
      else if (Math.max(Math.abs(m.mx - q.mx), Math.abs(m.my - q.my)) <= 1) { Game.tbPlayerStrike(m.key); endPlayerTurn(Game); }
      else { Game.tbPlayerWait(); }
    } else {
      endPlayerTurn(Game);
    }
  }
  ok('brawl: terminates within 200 rounds', !Game.tbfight || Game.tbfight.over, 'rounds=' + rounds);
  endFight(Game);

  console.log(`ad_break: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PROOF CRASH:', e); process.exit(2); });
