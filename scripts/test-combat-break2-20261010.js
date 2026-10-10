#!/usr/bin/env node
// Break-it combat-engine r2 proof tests, run 2026-10-10 (combat engine target).
// Hostile-player attacks on the turn-based fight system (game.js tb*,
// feastBurn, leech stance, practice/XP economy, snake splits, passive
// monsters, dead-code reachability).
//
// CATCHES THIS RUN (fixed):
//   H1 leech stance vs Settle the Debt: the leech redirect (tbDamage) called
//      addHealth(-half) directly, which never writes fightDamageTaken.
//      trade_of_blows.settle_debt promises "You cash in every bruise, every
//      cut" — but the half you took via leech was invisible to it. Fix:
//      the redirect now records _half into fightDamageTaken (game.js).
//   H2 (sibling sweep, comment): app.js barrier-edge comment still promised
//      "50% break, 50% followed" — the CHASE rewrite (2026-10-09) removed
//      the coin flip for stamina pursuit. Comment corrected; no player
//      copy ever promised odds (verified: no say() with flee %).
//
// HELD (attacks attempted, engine resisted — documented, not fixed):
//   E1 feastBurn integrity: exactly one burn per tbPlayerStrike; kcal delta
//      equals the stated burn; multiplier matches computed pipeline.
//   E2 single feastBurn call site in src (static guard).
//   E3 dead_aim sibling sweep (f5794463): useAbility('dead_aim.dead_aim_shot')
//      advances the world exactly once (monster acts once, not twice).
//   E4 refused ability actions grant no XP (fizzle != practice).
//   E5 practice/stat farming capped (stats hard-cap 10).
//   S1 snake split: mid-chain kill splits into two hunting snakes; killing
//      everything ends the fight — no phantom fighters holding it open.
//   S2 passive monster (no attack data): tbMonsterTurn doesn't crash; the
//      round completes and the player turn arrives.
//   S3 tbAdvance with 12 fighters: player turn arrives (guard not tripped).
//   H3 leech stance redirect honesty: villager takes ceil(half), player the
//      rest; trust bumped; stance clears at the player's next tbBeginTurn.
//   D1/D2 dead-code: every tb* method defined on Game has >= 1 call site;
//      all 10 engine/combat.js exports resolve.
//
// Run: node scripts/test-combat-break2-20261010.js   (SEED env override)
// Multi-seed: SEED=7 node ... && SEED=999 node ... && SEED=424242 node ...
'use strict';
const H = require('./combat-break-harness.js');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

(async () => {
  const Game = await H.newCombatReadyGame();
  const s = Game.state.scholar;
  const mdefById = (id) => (Game.data.monsters || []).find(m => m.id === id) || {};
  Game.say = () => {};
  Game.sysSay = () => {};
  Game.audioEvent = () => {};
  try { Game.drama = () => {}; } catch (e) {}

  const grantAbility = (id) => {
    s.abilities = s.abilities || [];
    if (!s.abilities.some(a => (a.id || a) === id)) s.abilities.push({ id, name: id, desc: '', level: 1, xp: 0 });
  };
  const abXP = (id) => { const a = (s.abilities || []).find(a => (a.id || a) === id); return a ? (a.xp || 0) : null; };

  // ================= EXPLOIT E1: feastBurn integrity =================
  console.log('\n[exploit] E1: feastBurn — stated vs actual, exactly once per strike');
  {
    const mk = H.synthFight(Game, 'bulldozer', { mhp: 10000, php: 100 });
    const p = Game.tbFighter('p');
    p.mx = 5; p.my = 4; // adjacent to monster at (6,4): range 1 reachable
    p.moveLeft = 0; p.acted = false;
    // Bank 1000 kcal: fed line is 2400*mult; kcalCap 2400 baseline.
    s.kcal = 3400; s.kcalQ = 1.0;
    const bankedBefore = Game.banked();
    ok(bankedBefore >= 300, 'banked >= 300 (feastBurn fires)', 'banked=' + bankedBefore);
    const said = [];
    const _say = Game.say; Game.say = (m) => { said.push(String(m)); };
    const kcalBefore = s.kcal;
    Game.equippedWeapon = () => ({ range: 1, bonus: 0, name: 'fists', unarmed: true });
    Game.tbPlayerStrike(mk);
    Game.say = _say;
    const burns = said.filter(m => m.indexOf('FEASTBURN') === 0);
    ok(burns.length === 1, 'exactly one FEASTBURN per strike', 'saw ' + burns.length);
    const stated = burns.length ? parseInt((burns[0].match(/−(\d+) banked/) || [])[1] || '-1', 10) : -1;
    const actual = kcalBefore - s.kcal;
    ok(stated > 0 && actual === stated, 'kcal delta == stated burn', 'stated=' + stated + ' actual=' + actual);
    const statedMult = burns.length ? parseFloat((burns[0].match(/×([0-9.]+)/) || [])[1] || '-1') : -1;
    // feasting (banked >=300, not gorged): x1.5, q=1.0 -> no quality modifier
    ok(Math.abs(statedMult - 1.5) < 1e-9, 'stated multiplier = x1.5 (feasting)', 'got x' + statedMult);
  }

  // ================= EXPLOIT E2: single feastBurn call site =================
  console.log('\n[exploit] E2: feastBurn has exactly one engine call site');
  {
    const fs = require('fs'), path = require('path');
    const src = fs.readFileSync(path.join(H.ROOT, 'src/js/game.js'), 'utf8');
    const sites = (src.match(/this\.feastBurn\(\)/g) || []).length;
    ok(sites === 1, 'this.feastBurn() called once in game.js (tbPlayerStrike)', 'saw ' + sites);
  }

  // ================= EXPLOIT E3: dead_aim single turn advance =================
  console.log('\n[exploit] E3: dead_aim_shot advances the world exactly once (f5794463 regression)');
  {
    grantAbility('dead_aim');
    const mk = H.synthFight(Game, 'bulldozer', { mhp: 10000, php: 100 });
    const f = Game.tbfight;
    f.round = 1; f.turnIdx = 0; f.order = ['p', mk];
    const p = Game.tbFighter('p');
    p.moveLeft = 3; p.acted = false;
    let monsterTurns = 0;
    const _mt = Game.tbMonsterTurn;
    Game.tbMonsterTurn = function (m) { monsterTurns++; return _mt.call(this, m); };
    // Ensure the data action exists and costs a turn
    const def = Game.abilityActionDef('dead_aim', 'dead_aim_shot');
    ok(!!def && !!def.action && !!def.action.cost && def.action.cost.turn, 'dead_aim_shot is a turn-costing combat action');
    const r = Game.useAbility('dead_aim', 'dead_aim_shot');
    Game.tbMonsterTurn = _mt;
    ok(r === true, 'useAbility dispatched');
    // NOTE: useAbility spends the turn, tbAfterPlayerAction runs the monster's
    // answer, and the next player turn begins with acted reset — so by return
    // time we are on a FRESH player turn (acted=false is correct here). The
    // real single-advance check is monsterTurns === 1 above.
    ok(Game.tbIsPlayerTurn() === true, 'back on the player turn after exactly one monster answer');
    ok(monsterTurns === 1, 'monster acted exactly once after the tap', 'acted ' + monsterTurns + 'x');
    ok(!!(s.deadAimShot || s.aimBonus), 'dead-aim flag planted for the next strike');
    // The planted shot must be consumed by ONE strike (no linger).
    p.moveLeft = 0; p.acted = false;
    p.mx = 5; p.my = 4;
    Game.equippedWeapon = () => ({ range: 1, bonus: 0, name: 'fists', unarmed: true });
    s.kcal = 100; // no bank -> no feastBurn noise
    Game.tbPlayerStrike(mk);
    ok(!s.deadAimShot || !s.deadAimShot.mult, 'dead-aim shot consumed by the strike (no linger)');
  }

  // ================= EXPLOIT E4: refused actions grant no XP =================
  console.log('\n[exploit] E4: fizzled/refused ability actions grant no ability XP');
  {
    grantAbility('trade_of_blows');
    H.synthFight(Game, 'bulldozer', { mhp: 10000, php: 100 });
    const p = Game.tbFighter('p');
    p.moveLeft = 3; p.acted = false;
    s.fightDamageTaken = 0; s.debtSettled = false;
    const before = abXP('trade_of_blows');
    const r = Game.useAbility('trade_of_blows', 'settle_debt'); // refuses: no damage taken
    ok(r === false, 'settle_debt refused with no damage taken');
    ok(abXP('trade_of_blows') === before, 'no XP on the refused tap', 'xp ' + before + ' -> ' + abXP('trade_of_blows'));
  }

  // ================= EXPLOIT E5: practice hard-cap =================
  console.log('\n[exploit] E5: stat farming capped — 200 strikes cannot push past 10');
  {
    H.synthFight(Game, 'bulldozer', { mhp: 1000000, php: 100000 });
    Game.tbFighter('p').maxHp = 100000; Game.tbFighter('p').hp = 100000;
    const mk = 'm_test';
    Game.tbFighter('p').mx = 5; Game.tbFighter('p').my = 4;
    Game.equippedWeapon = () => ({ range: 1, bonus: 0, name: 'fists', unarmed: true });
    s.kcal = 100;
    for (let i = 0; i < 200; i++) {
      const p = Game.tbFighter('p');
      p.moveLeft = 0; p.acted = false;
      Game.tbPlayerStrike(mk);
      if (Game.tbfight.over) break;
    }
    ok((s.stats.str || 5) <= 10 && (s.stats.agi || 5) <= 10, 'str/agi hard-capped at 10', 'str=' + s.stats.str + ' agi=' + s.stats.agi);
  }

  // ================= SOFTLOCK S1: snake split =================
  console.log('\n[softlock] S1: snake mid-chain kill splits; full kill ends the fight');
  {
    const mdef = Object.assign({}, mdefById('ducks_in_a_row') || {}, { snake: true, id: 'ducks_in_a_row' });
    const seg = (i, hp) => ({
      key: 'm_seg_' + i, kind: 'monster', mdef, monsterId: 'ducks_in_a_row',
      name: 'duck (' + (i + 1) + ')', emoji: '🦆', hp, maxHp: hp,
      speed: 3, mx: 4, my: i, alive: true, fled: false,
      snakeId: 'snake_1', segmentIndex: i, isHead: i === 0,
    });
    Game.tbfight = {
      fighters: [
        { key: 'p', kind: 'player', name: 'You', emoji: '🧑', hp: 100, maxHp: 100, speed: 6, mx: 4, my: 4, alive: true, fled: false, moveLeft: 0, acted: false },
        seg(0, 30), seg(1, 30), seg(2, 30), seg(3, 30),
      ],
      over: false, round: 1, order: ['p', 'm_seg_0', 'm_seg_1', 'm_seg_2', 'm_seg_3'], turnIdx: 0,
    };
    Game.tbDamage('m_seg_1', 9999, 'you'); // kill the second segment — mid-chain break
    const s0 = Game.tbFighter('m_seg_0'), s2 = Game.tbFighter('m_seg_2');
    ok(s0 && s0.alive && s2 && s2.alive, 'both halves survive the mid-chain kill');
    ok(s0.snakeId !== s2.snakeId, 'the break separates the chain: two snake ids now');
    ok(Game.tbFighter('m_seg_2').isHead === true, 'after-side gets a new head (still hunts)');
    // every segment in f.order is still addressable — no phantom fighters
    const orderKeys = new Set(Game.tbfight.order);
    const live = Game.tbfight.fighters.filter(x => x.alive && x.kind === 'monster');
    ok(live.every(x => orderKeys.has(x.key)), 'all living segments still in the turn order (no frozen-out snake)');
    // kill the rest -> fight ends
    for (const x of live.slice()) Game.tbDamage(x.key, 9999, 'you');
    const f = Game.tbfight;
    Game.tbEndCheck();
    ok(f.over === true && (f.result === 'won' || f.result === 'routed'), 'fight ends after the last segment dies', 'result=' + f.result);
  }

  // ================= SOFTLOCK S2: passive monster (no attack data) =================
  console.log('\n[softlock] S2: monster with no attack data does not stall the round');
  {
    const bare = { kind: 'monster', monsterId: 'rock', mdef: { id: 'rock', name: 'a rock', attack: null }, name: 'a rock', emoji: '🪨', hp: 30, maxHp: 30, speed: 3, mx: 6, my: 4, alive: true, fled: false, telegraph: null, hesitate: 0, blind: 0, stunned: 0, gravityHeld: 0 };
    Game.tbfight = {
      fighters: [
        { key: 'p', kind: 'player', name: 'You', emoji: '🧑', hp: 100, maxHp: 100, speed: 6, mx: 4, my: 4, alive: true, fled: false, moveLeft: 0, acted: false },
        Object.assign({ key: 'm_rock' }, bare),
      ],
      over: false, round: 1, order: ['p', 'm_rock'], turnIdx: 0,
    };
    let threw = null;
    try { Game.tbMonsterTurn(Game.tbfight.fighters[1]); } catch (e) { threw = e; }
    ok(!threw, 'tbMonsterTurn survives an attack-less monster', threw && threw.message);
    // full round: player waits -> monster turns -> player turn returns
    const p = Game.tbFighter('p');
    p.moveLeft = 0; p.acted = false;
    const seenPlayerAgain = (() => { try { Game.tbPlayerWait(); return Game.tbIsPlayerTurn(); } catch (e) { return 'threw:' + e.message; } })();
    ok(seenPlayerAgain === true, 'player turn returns after the passive monster\'s turn', String(seenPlayerAgain));
  }

  // ================= SOFTLOCK S3: tbAdvance with a crowded order =================
  console.log('\n[softlock] S3: 12-fighter order — tbAdvance still reaches the player');
  {
    const fighters = [{ key: 'p', kind: 'player', name: 'You', emoji: '🧑', hp: 100, maxHp: 100, speed: 6, mx: 4, my: 4, alive: true, fled: false, moveLeft: 0, acted: false }];
    const order = ['p'];
    for (let i = 0; i < 11; i++) {
      const k = 'm_c' + i;
      fighters.push({ key: k, kind: 'monster', monsterId: 'hushpuppy', mdef: mdefById('hushpuppy'), name: 'pup', emoji: '🐶', hp: 20, maxHp: 20, speed: 2 + (i % 3), mx: i % 9, my: 0, alive: true, fled: false, telegraph: null, hesitate: 0, blind: 0, stunned: 0 });
      order.push(k);
    }
    Game.tbfight = { fighters, over: false, round: 1, order, turnIdx: 0 };
    // park the player mid-order, then advance: player turn must arrive
    Game.tbfight.turnIdx = 3;
    Game.tbAdvance();
    ok(Game.tbIsPlayerTurn() === true, 'tbAdvance walked 12 fighters and landed on the player');
  }

  // ================= HONESTY H1/H2: leech stance redirect =================
  console.log('\n[honesty] H1: leech redirect — split damage, trust, stance expiry, fightDamageTaken');
  {
    grantAbility('leech');
    const mk = H.synthFight(Game, 'bulldozer', { mhp: 10000, php: 100 });
    const f = Game.tbfight;
    // add a villager ally fighter near the player
    const v = { key: 'v_ally', kind: 'villager', villagerId: 'v_test', name: 'Ally', emoji: '🧑', hp: 100, maxHp: 100, speed: 4, mx: 5, my: 5, alive: true, fled: false };
    f.fighters.push(v);
    f.order.push('v_ally');
    f.turnIdx = 0;
    const p = Game.tbFighter('p');
    p.moveLeft = 3; p.acted = false; p.mx = 4; p.my = 4;
    Game.state.village.trust = Game.state.village.trust || {};
    const trustBefore = Game.state.village.trust['v_test'] || 10;
    const r = Game.useAbility('leech', 'leech_stance');
    ok(r === true, 'leech_stance activates');
    ok(p.leechStance === true, 'stance flag planted on the player fighter');
    // monster hits the ally for 20 -> ally takes 10, player takes 10
    s.fightDamageTaken = 0;
    const phpBefore = p.hp, vhpBefore = v.hp;
    Game.tbDamage('v_ally', 20, 'teeth', mk, { quiet: true, undodgeable: true });
    ok(v.hp === vhpBefore - 10, 'villager takes ceil(half): 20 -> 10', 'vhp ' + vhpBefore + ' -> ' + v.hp);
    ok(p.hp === phpBefore - 10, 'player takes the other half', 'php ' + phpBefore + ' -> ' + p.hp);
    ok((Game.state.village.trust['v_test'] || 0) > trustBefore, 'trust bumped for stepping in', 'trust ' + trustBefore + ' -> ' + Game.state.village.trust['v_test']);
    ok((s.fightDamageTaken || 0) === 10, 'redirected half counts as damage taken (settle_debt honesty)', 'fightDamageTaken=' + s.fightDamageTaken);
    // stance clears at the player's next turn
    Game.tbBeginTurn();
    ok(!p.leechStance, 'stance cleared at the player\'s next tbBeginTurn (one full round)');
  }

  // ================= DEAD-CODE D1: tb* reachability =================
  console.log('\n[dead-code] D1: every tb* method defined on Game has >= 1 call site');
  {
    const fs = require('fs'), path = require('path');
    const jsFiles = ['src/js/game.js', 'src/js/app.js', 'src/js/abilityActions.js', 'src/js/encounters.js',
      'src/js/monsterBehaviors.js', 'src/js/fieldFights.js', 'src/js/statusEffects.js', 'src/js/corpses.js',
      'src/js/party.js', 'src/js/contests.js', 'src/js/betrayal.js'];
    const all = jsFiles.map(f => { try { return fs.readFileSync(path.join(H.ROOT, f), 'utf8'); } catch (e) { return ''; } }).join('\n');
    const defs = [...new Set([...all.matchAll(/^\s{4}(tb[A-Za-z0-9_]+)\s*\(/gm)].map(m => m[1]))];
    const dead = [];
    for (const d of defs) {
      const calls = (all.match(new RegExp('[^A-Za-z0-9_."]' + d + '\\s*\\(', 'g')) || []).length;
      if (calls === 0) dead.push(d);
    }
    ok(dead.length === 0, defs.length + ' tb* methods defined, all called', dead.length ? 'dead: ' + dead.join(', ') : '');
  }

  // ================= DEAD-CODE D2: combat.js exports resolve =================
  console.log('\n[dead-code] D2: all engine/combat.js exports are functions');
  {
    const names = ['roll', 'cheb', 'key', 'inGrid', 'turnOrder', 'patternCells', 'isFoe', 'nearestEnemy', 'stepToward', 'stepAway', 'villagerDecide'];
    const C = (globalThis.Scattering || {}).combat || {};
    ok(names.every(n => typeof C[n] === 'function'), 'all ' + names.length + ' combat exports resolve', names.filter(n => typeof C[n] !== 'function').join(','));
  }

  console.log('\n==== ' + pass + ' passed, ' + fail + ' failed ====');
  if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
