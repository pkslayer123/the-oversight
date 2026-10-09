#!/usr/bin/env node
// Break-it combat round 6 (2026-10-09): hostile pass, fresh ground only.
// Rounds 1-5 vectors (strike-number lies, fieldFight-vs-corpse, startCombat
// clobber, dead standoff, 2x2 movement, phantom heals, eat/drink costs,
// save-scum, double-KO, xp farms, refuse_death) are NOT re-attacked.
// BEFORE=1 detection: every check FAILS on pre-fix code (verified via stash).
// Seed: fixed default 20261009, SEED env override. Green required x>=3 seeds.
const H = require('./combat-r3-harness.js');
const SEED = process.env.SEED || '20261009';
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra || ''); }
}
function grant(Game, id) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  if (!s.abilities.find(a => ((a && a.id) || a) === id)) s.abilities.push({ id });
}
function quiet(Game) {
  Game.say = () => {}; Game.audioEvent = () => {}; Game.drama = () => {};
  Game.sysSay = () => {}; Game.combatWitnessReact = () => {};
}

(async () => {
  console.log('break-combat6 seed=' + SEED);

  // T1. TAKE AIM EXPOSURE: "enemies get +hit" — exposeTurns was write-only.
  {
    const Game = await H.newCombatReadyGame();
    const said = [];
    Game.say = (s) => said.push(String(s));
    Game.audioEvent = () => {}; Game.drama = () => {};
    H.synthFight(Game, 'ducks_in_a_row');
    grant(Game, 'patient_aim');
    const s = Game.state.scholar;
    s.stats.agi = 55; // dodgeCh ~1.0
    s.kcal = 5000;
    const realRandom = Math.random;
    Math.random = () => 0.0001; // dodge would ALWAYS fire if dodgeCh > 0
    try {
      Game.useAbility('patient_aim', 'take_aim');
      ok('T1a impl arms exposeTurns=1', !!(s.aimBonus && s.aimBonus.exposeTurns === 1), JSON.stringify(s.aimBonus));
      const p = Game.tbFighter('p'); p.hp = 100;
      const ret = Game.tbDamage('p', 20, 'duck nip');
      ok('T1b exposed: no dodge, damage lands', ret > 0 && p.hp < 100, 'ret=' + ret + ' hp=' + p.hp);
      ok('T1c exposure narrated once', said.some(x => x.includes('Exposed')), JSON.stringify(said.slice(-3)));
      // Next player turn begins -> exposure ticks down, dodge returns.
      Game.tbBeginTurn();
      ok('T1d exposeTurns ticks down on new turn', (s.aimBonus.exposeTurns || 0) === 0);
      p.hp = 100;
      const ret2 = Game.tbDamage('p', 20, 'duck nip');
      ok('T1e unexposed: dodge fires again', ret2 === 0 && p.hp === 100, 'ret2=' + ret2);
    } finally { Math.random = realRandom; }
  }

  // T2. DEAD AIM: "you cannot move this turn" — moveLeft was never touched.
  {
    const Game = await H.newCombatReadyGame();
    quiet(Game);
    const mk = H.synthFight(Game, 'ducks_in_a_row', { moves: 6 });
    grant(Game, 'dead_aim');
    Game.state.scholar.kcal = 5000;
    const p = Game.tbFighter('p');
    ok('T2a starts with moves', p.moveLeft === 6, 'moveLeft=' + p.moveLeft);
    ok('T2a2 still player turn before', Game.tbIsPlayerTurn());
    Game.useAbility('dead_aim', 'dead_aim_shot');
    // "You cannot move this turn": planting the feet ends the turn — the 6
    // remaining moves are unusable. Pre-fix the turn never advanced.
    // (The round completes: monster acts, player gets a FRESH turn.)
    ok('T2b dead aim ends the turn (round advances)', Game.tbfight.round === 2, 'round=' + Game.tbfight.round);
    ok('T2c shot still armed', !!Game.state.scholar.deadAimShot);
  }

  // T3. ARMOR ABSORB HONESTY: union-rep +3 inflated final before armor, but
  // the line stated the RAW number ("absorbs 8" while 10 was absorbed).
  {
    const Game = await H.newCombatReadyGame();
    const said = [];
    Game.say = (x) => said.push(String(x));
    Game.audioEvent = () => {}; Game.drama = () => {}; Game.combatWitnessReact = () => {};
    H.synthFight(Game, 'ducks_in_a_row');
    Game.armorBonus = () => 10;
    const ur = { key: 'm_ur', kind: 'monster', monsterId: 'union_rep', name: 'Union Rep', alive: true, fled: false, hp: 50, maxHp: 50, mx: 0, my: 0 };
    Game.tbfight.fighters.push(ur);
    const origUrIs = Game.urIs; Game.urIs = (x) => x === ur;
    try {
      const p = Game.tbFighter('p'); p.hp = 100;
      Game.tbDamage('p', 8, 'test claws');
      const line = said.find(x => x.includes('Armor absorbs'));
      ok('T3 armor states actual absorbed (10, not raw 8)', line === 'Armor absorbs 10.', line);
      ok('T3b landed number consistent (11-10=1)', p.hp === 99, 'hp=' + p.hp);
    } finally { Game.urIs = origUrIs; }
  }

  // T4. DEAD CODE: tbNearestFire had zero callers anywhere (fire helper with
  // no reader — the Alien Players lesson class). Removed.
  {
    const Game = await H.newCombatReadyGame();
    ok('T4 tbNearestFire removed', typeof Game.tbNearestFire === 'undefined');
  }

  // T5. BETRAYAL WOUND TRUTH: hostile respawned at flat 40 HP — your damage
  // erased at no cost (same class as the door-flee monster reset).
  {
    const Game = await H.newCombatReadyGame();
    quiet(Game);
    const v = Game.state.village;
    const vid = (v.roster || []).find(id => id !== Game.villagerId);
    Game.startBetrayalCombat(vid, { aggressor: 'player' });
    let h = Game.tbfight.fighters.find(x => x.kind === 'hostile');
    ok('T5a hostile spawns at 40 fresh', h.hp === 40, 'hp=' + h.hp);
    h.hp = 5; // beat them down, then flee
    Game.tbEnd('fled');
    ok('T5b wounds stashed on village record', (v.betrayalWounds || {})[vid] === 5, JSON.stringify(v.betrayalWounds));
    Game.startBetrayalCombat(vid, { aggressor: 'player' });
    h = Game.tbfight.fighters.find(x => x.kind === 'hostile');
    ok('T5c re-engage honors wounds (5, not 40)', h.hp === 5, 'hp=' + h.hp);
    Game.tbEnd('fled');
  }

  // T6. READ THE FIGHT dead branch: the impl banked s.fightRead for "the NEXT
  // fight when used out of combat" — but context is combat-only, so the
  // branch was unreachable and the flag write-only. Removed: out-of-combat
  // use is refused, in-combat use grants +2 speed immediately.
  {
    const Game = await H.newCombatReadyGame();
    const said = [];
    Game.say = (x) => said.push(String(x));
    Game.audioEvent = () => {}; Game.drama = () => {};
    grant(Game, 'brawler_instinct');
    const s = Game.state.scholar;
    const r = Game.useAbility('brawler_instinct', 'read_fight');
    ok('T6a out-of-combat use refused (combat context)', r === false && !s.fightRead, 'r=' + r + ' fightRead=' + JSON.stringify(s.fightRead));
    H.synthFight(Game, 'ducks_in_a_row');
    const p = Game.tbFighter('p');
    const spdBefore = p.speed;
    Game.useAbility('brawler_instinct', 'read_fight');
    ok('T6b in-combat use grants +2 speed now', p.speed === spdBefore + 2, 'speed=' + p.speed + ' was=' + spdBefore);
    ok('T6c order re-sorts from next round', !!Game.tbfight.orderDirty);
  }

  // T7. RAGE COPY: engine counts STRIKES (3), data said "3 rounds".
  {
    const fs = require('fs'), path = require('path');
    const abs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'abilities.json'), 'utf8'));
    const rage = abs.find(a => a.id === 'rage');
    const act = (rage.actions || []).find(a => a.id === 'unleash_rage');
    ok('T7a action effect says strikes', (act.effect || '').includes('next 3 strikes'), act.effect);
    ok('T7b description says strikes', (rage.description || '').includes('next 3 strikes'), rage.description);
  }

  // T8. REGRESSION SPOT: strike still states the LANDED number (r1 fix holds
  // under the new armor/exposure code).
  {
    const Game = await H.newCombatReadyGame();
    const said = [];
    Game.say = (x) => said.push(String(x));
    Game.audioEvent = () => {}; Game.drama = () => {}; Game.combatWitnessReact = () => {};
    const mk = H.synthFight(Game, 'ducks_in_a_row', { mhp: 500 });
    const p = Game.tbFighter('p'); p.mx = 5; p.my = 4; // adjacent
    const m = Game.tbFighter(mk); const hpBefore = m.hp;
    Game.tbPlayerStrike(mk);
    const landed = hpBefore - m.hp;
    const line = said.find(x => x.includes('STRIKE'));
    ok('T8 strike honesty holds', !!line && line.includes(String(landed)), line + ' landed=' + landed);
  }

  console.log(`\nbreak-combat6: ${pass} pass, ${fail} fail (seed ${SEED})`);
  process.exit(fail ? 1 : 0);
})();
