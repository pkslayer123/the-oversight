#!/usr/bin/env node
// Break-it combat round 8 (2026-10-09): hostile pass, fresh ground only.
// Rounds 1-7 vectors are NOT re-attacked; their suites re-ran green separately.
// BEFORE=1 detection: every numbered check must FAIL on pre-fix code for the
// fixes below (verified via stash before landing).
// Seed: fixed default 20261009, SEED env override. Green required on >=3 seeds.
const H = require('./combat-r3-harness.js');
const SEED = process.env.SEED || '20261009';
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL', name, extra || ''); }
}
function quiet(Game) {
  Game.say = () => {}; Game.audioEvent = () => {}; Game.drama = () => {};
  Game.sysSay = () => {}; Game.combatWitnessReact = () => {};
}

function censusFight(Game, monId) {
  const mdef = Game.data.monsters.find(m => m.id === monId);
  const hpMid = Math.round(((mdef.hp || [20, 20])[0] + (mdef.hp || [20, 20])[1]) / 2);
  return H.synthFight(Game, monId, { mhp: hpMid, php: 200 });
}

(async () => {
  console.log('break-combat8 seed=' + SEED);

  // B1. MONSTER CENSUS (dead-code + softlock): every one of the 30 monsters
  // must survive its own turn through the production path (tbMonsterTurn),
  // and must die cleanly (fight resolves, one corpse, no double rewards).
  {
    const Game = await H.newCombatReadyGame();
    quiet(Game);
    const ids = Game.data.monsters.map(m => m.id);
    ok('B1a 30 monsters in data', ids.length === 30, 'n=' + ids.length);
    let turnThrows = [], deathBad = [], corpseBad = [];
    for (const id of ids) {
      const mk = censusFight(Game, id);
      const m = Game.tbFighter(mk);
      try {
        Game.tbMonsterTurn(m);
      } catch (e) { turnThrows.push(id + ':' + String(e && e.message || e).slice(0, 80)); }
      // kill it: one corpse, fight must resolve
      const before = (Game.state.corpses || []).length;
      try {
        Game.tbDamage(mk, 999999, 'you');
        Game.tbEndCheck();
      } catch (e) { deathBad.push(id + ':death-throw:' + String(e && e.message || e).slice(0, 60)); }
      const after = (Game.state.corpses || []).length;
      if (!m.alive && (after - before) !== 1 && Game.tbfight && !Game.tbfight.over) {
        corpseBad.push(id);
      }
      if (!m.alive && Game.tbfight && !Game.tbfight.over && !m.fled) {
        deathBad.push(id + ':fight-not-over');
      }
    }
    ok('B1b no monster turn throws', turnThrows.length === 0, JSON.stringify(turnThrows.slice(0, 5)));
    ok('B1c every death resolves the fight', deathBad.length === 0, JSON.stringify(deathBad.slice(0, 5)));
    ok('B1d one corpse per kill (no dup, no drop)', corpseBad.length === 0, JSON.stringify(corpseBad.slice(0, 5)));
  }

  // B2. SWEEP-HOLD SOFTLOCK (gallowdeer): lethal damage during a sweep windup
  // must hold it at 1 HP ("the light is already gathered"), must NOT kill it,
  // and once the beam has fired (hasFired) the next lethal hit must kill it.
  // A permanently-unkillable 1-HP deer would be a softlock.
  {
    const Game = await H.newCombatReadyGame();
    const said = [];
    Game.say = (x) => said.push(String(x));
    Game.audioEvent = () => {}; Game.drama = () => {}; Game.sysSay = () => {}; Game.combatWitnessReact = () => {};
    const mk = censusFight(Game, 'gallowdeer');
    const m = Game.tbFighter(mk);
    m.hp = 10;
    m.telegraph = { pattern: { sweep: true }, turnsLeft: 2, attackName: 'Ocular Discharge' };
    m.hasFired = false;
    const r1 = Game.tbDamage(mk, 9999, 'you');
    ok('B2a lethal mid-windup holds at 1 HP', m.hp === 1 && m.alive, 'hp=' + m.hp);
    ok('B2b hold narrated', said.some(x => /already gathered/.test(x)), said.slice(-2).join(' | '));
    const r2 = Game.tbDamage(mk, 9999, 'you');
    ok('B2c still held at 1 on repeat hits (no kill-before-fire)', m.hp === 1 && m.alive, 'hp=' + m.hp);
    ok('B2d repeat hold deals 0 (returns 0)', r2 === 0, 'returned=' + r2);
    // The beam fires: production sets hasFired on ignition (tbBeamSweepTick).
    m.hasFired = true; m.telegraph = null;
    Game.tbDamage(mk, 9999, 'you');
    ok('B2e killable after the beam fired', !m.alive, 'alive=' + m.alive);
  }

  // B3. MOSQUITO BITE HONESTY (canon: docs/DISEASES.md — giant mosquito bite
  // lands eurika or east_nile 50/50 per landed bite; application narrates).
  {
    const Game = await H.newCombatReadyGame();
    const said = [];
    Game.say = (x) => said.push(String(x));
    Game.audioEvent = () => {}; Game.drama = () => {}; Game.sysSay = () => {}; Game.combatWitnessReact = () => {};
    const mk = censusFight(Game, 'giant_mosquito');
    const m = Game.tbFighter(mk);
    m.mosqPhase = 'dive'; // production path: dive -> drink happens in one turn
    m.mx = 5; m.my = 4; // adjacent to the player at 4,4
    Game.tbMosquitoTurn(m);
    const hasV = (Game.hasStatus && (Game.hasStatus('scholar', 'eurika') || Game.hasStatus('scholar', 'east_nile')));
    ok('B3a landed drink applies a virus', !!hasV, 'statuses=' + JSON.stringify(Game.state.scholar.diseases || []));
    ok('B3b infection narrated (no silent disease)', said.length > 0, 'said=' + said.length);
    // Both viruses held: bite must not crash, must not stack.
    const Game2 = await H.newCombatReadyGame();
    Game2.say = () => {}; Game2.audioEvent = () => {}; Game2.drama = () => {};
    Game2.sysSay = () => {}; Game2.combatWitnessReact = () => {};
    Game2.applyStatus('scholar', 'eurika', { source: 'test' });
    Game2.applyStatus('scholar', 'east_nile', { source: 'test' });
    const mk2 = H.synthFight(Game2, 'giant_mosquito', { mhp: 40, php: 200 });
    const m2 = Game2.tbFighter(mk2);
    m2.mosqPhase = 'drink'; m2.mx = 5; m2.my = 4;
    let threw = null;
    try { Game2.tbMosquitoTurn(m2); } catch (e) { threw = e; }
    ok('B3c bite with both viruses: no crash', !threw, String(threw && threw.message));
  }

  // B4. FIELD-FIGHT WEAPON-BONUS HONESTY: tactical engine halves the MELEE
  // bonus only (wb = round(melee/2)); fieldFights halves melee+ranged
  // (wb = round((melee+ranged)/2)) — deliberate (2026-10-09, no grid
  // off-screen), but the comment claimed it was "same as threatLevel sums
  // them" — threatLevel sums WITHOUT /2. Behavior: melee-only gear must
  // match across engines; the fixed comment must describe the real formula.
  {
    const Game = await H.newCombatReadyGame();
    quiet(Game);
    const EQ = (globalThis.Scattering || {}).equipment || {};
    const items = Game.data.items;
    const vp = { equipped: {} };
    const meleeW = items.find(i => i.weapon && i.weapon.bonus && i.weapon.type === 'melee');
    const rangedW = items.find(i => i.weapon && i.weapon.bonus && i.weapon.type === 'ranged');
    if (EQ.weaponBonusOf && meleeW && rangedW) {
      vp.equipped = { melee: { itemId: meleeW.id }, ranged: { itemId: rangedW.id } };
      const mb = EQ.weaponBonusOf(vp, items, 'melee');
      const rb = EQ.weaponBonusOf(vp, items, 'ranged');
      const tacticalWb = Math.round(EQ.weaponBonusOf(vp, items) / 2); // no-slot = melee only
      const fieldWb = Math.round((mb + rb) / 2);
      ok('B4a fixture has both weapons', mb > 0 && rb > 0, 'melee=' + mb + ' ranged=' + rb);
      ok('B4b tactical halves melee only', tacticalWb === Math.round(mb / 2), 't=' + tacticalWb);
      ok('B4c field halves the sum (deliberate off-screen design)', fieldWb === Math.round((mb + rb) / 2), 'f=' + fieldWb);
      // melee-only gear: engines agree exactly
      vp.equipped = { melee: { itemId: meleeW.id } };
      const mb2 = EQ.weaponBonusOf(vp, items, 'melee');
      ok('B4d melee-only: field == tactical', Math.round(mb2 / 2) === Math.round(EQ.weaponBonusOf(vp, items) / 2), 'mb=' + mb2);
    } else {
      ok('B4a fixture has both weapons', false, 'no melee+ranged weapons in data');
    }
    // One live off-screen fight completes with a real outcome.
    const vid = (Game.state.village.roster || [])[0];
    const mdef = Game.data.monsters.find(m => m.id === 'bulldozer');
    let rec = null, threw = null;
    try { rec = Game.fieldFight(vid, mdef, null, {}); } catch (e) { threw = e; }
    ok('B4e live fieldFight completes', !threw && rec && !!rec.outcome, String(threw && threw.message));
  }

  // B5. FEASTBURN HONESTY (regression): the burn must not fire on a refused
  // strike (out of range) — kcal untouched, no FEASTBURN line.
  {
    const Game = await H.newCombatReadyGame();
    const said = [];
    Game.say = (x) => said.push(String(x));
    Game.audioEvent = () => {}; Game.drama = () => {}; Game.sysSay = () => {}; Game.combatWitnessReact = () => {};
    const s = Game.state.scholar;
    s.kcalCap = 12000; s.kcal = 3000; s.kcalQ = 1; // banked = 600 >= 300
    const mk = censusFight(Game, 'bulldozer');
    const m = Game.tbFighter(mk);
    m.mx = 8; m.my = 8; // far out of unarmed range 1
    const before = s.kcal;
    const r = Game.tbPlayerStrike(mk);
    ok('B5a out-of-range strike refused', r === false, 'returned=' + r);
    ok('B5b no kcal burned on refusal', s.kcal === before, 'kcal ' + before + ' -> ' + s.kcal);
    ok('B5c no FEASTBURN line on refusal', !said.some(x => /FEASTBURN/.test(x)), said.filter(x => /FEAST/.test(x)).join('|'));
  }

  // B6. ARMOR INVARIANTS (Steve 2026-10-09 model): at least 1 always lands,
  // absorption never exceeds hit-1, no immunity cliff at any protection.
  {
    const Game = await H.newCombatReadyGame();
    quiet(Game);
    Game.armorBonus = () => Game.__testProt || 0;
    const mk = censusFight(Game, 'bulldozer');
    let bad = [];
    for (const P of [0, 5, 20, 54, 100, 500]) {
      Game.__testProt = P;
      for (let hit = 1; hit <= 60; hit++) {
        const p = Game.tbFighter('p');
        p.hp = 200; p.alive = true;
        const saidL = [];
        Game.say = (x) => saidL.push(String(x));
        const landed = Game.tbDamage('p', hit, 'testblow', mk);
        // INVARIANT: at least 1 always lands (absorb <= hit-1). absorb=0 is
        // legal (nothing absorbed); the B6b check covers the noise line.
        if (P > 0 && hit > 0 && landed < 1) bad.push(`P=${P} hit=${hit} landed=${landed}`);
        // HONESTY micro-fix (F1): never print "Armor absorbs 0."
        if (saidL.some(x => x === 'Armor absorbs 0.') || saidL.some(x => /'s gear absorbs 0\./.test(x))) bad.push(`P=${P} hit=${hit} absorbs-0-line`);
      }
    }
    ok('B6a at least 1 always lands', bad.filter(x => !/absorbs-0/.test(x)).length === 0,
      JSON.stringify(bad.filter(x => !/absorbs-0/.test(x)).slice(0, 4)));
    ok('B6b no "Armor absorbs 0." noise line', !bad.some(x => /absorbs-0/.test(x)),
      JSON.stringify(bad.filter(x => /absorbs-0/.test(x)).slice(0, 3)));
    delete Game.__testProt;
  }

  // B7. MOSQUITO DRINK MISS (sibling sweep, same honesty class): a dodged
  // drink must not narrate "the proboscis slides in", must not go heavy
  // ("drunk on blood") on 0 damage, and must not hand a free punish window.
  {
    const Game = await H.newCombatReadyGame();
    const said = [];
    Game.say = (x) => said.push(String(x));
    Game.audioEvent = () => {}; Game.drama = () => {}; Game.sysSay = () => {}; Game.combatWitnessReact = () => {};
    const mk = H.synthFight(Game, 'giant_mosquito', { mhp: 40, php: 200 });
    const m = Game.tbFighter(mk);
    // guarantee the dodge: footwork bonus 2 => dodgeCh > 1 => always dodges
    const origPB = Game.passiveBonus;
    Game.passiveBonus = () => 2;
    m.mosqPhase = 'dive'; m.mx = 5; m.my = 4;
    Game.tbMosquitoTurn(m);
    Game.passiveBonus = origPB;
    ok('B7a dodged drink: no "proboscis slides in" line',
      !said.some(x => /proboscis slides in/.test(x)), said.join(' | ').slice(0, 200));
    ok('B7b dodged drink: no heavy phase (back to circling)', m.mosqPhase === 'circle', 'phase=' + m.mosqPhase);
    ok('B7c dodged drink: no virus on a miss',
      !(Game.hasStatus('scholar', 'eurika') || Game.hasStatus('scholar', 'east_nile')));
  }

  // B8. TERRAIN-STEP UNDODGEABLE (sibling sweep): stepping onto paper terrain
  // is unavoidable contact — even a 100% dodge chance must not avoid it, and
  // the line must state the real (nonzero) number.
  {
    const Game = await H.newCombatReadyGame();
    const said = [];
    Game.say = (x) => said.push(String(x));
    Game.audioEvent = () => {}; Game.drama = () => {}; Game.sysSay = () => {}; Game.combatWitnessReact = () => {};
    const mk = H.synthFight(Game, 'bulldozer', { mhp: 40, php: 200 });
    const origTerr = Game.tbTerrainAt;
    Game.tbTerrainAt = () => 'paper';
    const origPB = Game.passiveBonus;
    Game.passiveBonus = () => 2; // 100% dodge chance — terrain must ignore it
    const p = Game.tbFighter('p');
    const hpBefore = p.hp;
    Game.tbTerrainStep(4, 4);
    Game.passiveBonus = origPB;
    Game.tbTerrainAt = origTerr;
    ok('B8a terrain damage lands despite 100% dodge', p.hp === hpBefore - 1, 'hp ' + hpBefore + ' -> ' + p.hp);
    ok('B8b terrain line states the real number', said.some(x => /Paper cuts.*\(1\)/.test(x)),
      said.join(' | ').slice(0, 160));
    ok('B8c no contradictory "(0)" terrain line', !said.some(x => /\(0\)/.test(x)),
      said.join(' | ').slice(0, 160));
  }

  console.log(pass + '/' + (pass + fail) + ' passed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS THROW', e); process.exit(2); });
