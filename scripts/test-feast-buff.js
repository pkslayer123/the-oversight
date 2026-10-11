#!/usr/bin/env node
// test-feast-buff.js — proof tests for the feast-surge TIMED BUFF rework
// (Worker B, 2026-10-10, Steve: "Okay build carefully").
//
// Replaces the retired on-strike feastBurn trigger: a feast grants FEASTED
// until dawn via Game.grantFeastBuff; strikes AND ability resolutions read
// the feasted multiplier. The devotion arming (scholar.prog.feastSurge) is
// the gate; feastSurgeUsed marks only on real combat use.
//
// Covers:
//   G1 unarmed grant refused honestly (no buff state)
//   G2 armed grant: quality->mult math, quality clamp, surge variants
//   G3 re-feast refreshes (no double-stack; better quality wins)
//   G4 strike uplift through the tbDamage player-source hook (exact)
//   G5 strike integration: FEASTED line states the true number; use marked
//   G6 ability twist: war_cry.bellow feasted extends stun (+1 round)
//   G7 heal twist: field_medicine feasted grants +50% bonus, honest number
//   G8 camp ability while feasted marks NOTHING (no combat use)
//   G9 expiry at dawn: effects gone, fade said once, buff deleted
//   G10 save/load mid-buff is clean; post-dawn load has no phantom buff
//   G11 re-feast after combat use refused (devotion spent)
//
// Run: node scripts/test-feast-buff.js            (SEED env override)
// Multi-seed: for s in 7 999 424242; do SEED=$s node scripts/test-feast-buff.js || break; done
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '7', 10);
const { loadGame, setupGame } = require('./sim-harness');

// ---- localStorage stub (save/load in node) ----
function makeStore() {
  const _store = {};
  const api = {
    getItem: (k) => (k in _store ? _store[k] : null),
    setItem: (k, v) => { _store[k] = String(v); },
    removeItem: (k) => { delete _store[k]; },
    key: (i) => Object.keys(_store)[i] || null,
    _keys: () => Object.keys(_store),
    _reset: () => { for (const k of Object.keys(_store)) delete _store[k]; },
  };
  Object.defineProperty(api, 'length', { get: () => Object.keys(_store).length });
  return api;
}
globalThis.localStorage = makeStore();

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

function synthFight(Game, monId, mhp) {
  const mdef = (Game.data.monsters || []).find(m => m.id === monId) || {};
  Game.tbfight = {
    fighters: [
      { key: 'p', kind: 'player', name: 'You', hp: 100, maxHp: 100, speed: 6, mx: 4, my: 4, alive: true, fled: false, moveLeft: 0, acted: false },
      { key: 'm1', kind: 'monster', monsterId: monId, mdef, name: 'TestMonster', hp: mhp || 200, maxHp: mhp || 200, speed: 3, mx: 5, my: 4, alive: true, fled: false, telegraph: null },
    ],
    over: false, round: 1, order: ['p', 'm1'], turnIdx: 0,
  };
  return 'm1';
}
function grantAbility(Game, id) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  if (!s.abilities.some(a => (a.id || a) === id)) s.abilities.push({ id, name: id, desc: '', level: 1, xp: 0 });
}
function arm(Game, surge) {
  const s = Game.state.scholar;
  s.prog = s.prog || {};
  s.prog.feastSurge = (surge == null ? 1.5 : surge);
  s.prog.feastSurgeUsed = false;
}

(async () => {
  const { Game, loadFails } = await loadGame({ seed: SEED, mode: 'feast-buff-proof' });
  const S = globalThis.Scattering;
  ok(!loadFails.length, 'all modules load', loadFails.join('; '));
  ok(typeof Game.grantFeastBuff === 'function', 'grantFeastBuff exists (Worker A contract)');
  ok(!!(Game.data && Game.data.feastSurge), 'feast-surge.json loaded into data');

  const said = [];
  Game.say = (m) => said.push(String(m));
  Game.sysSay = () => {};
  Game.audioEvent = () => {};
  try { Game.drama = () => {}; } catch (e) {}
  Game.equippedWeapon = () => ({ range: 1, bonus: 0, name: 'fists', unarmed: true });

  // ============ G1: unarmed grant refused honestly ============
  console.log('\n[G1] unarmed grant refused honestly');
  {
    await setupGame(Game);
    said.length = 0;
    const s = Game.state.scholar;
    s.prog = s.prog || {}; s.prog.feastSurge = false;
    const r = Game.grantFeastBuff({ quality: 1, served: [{ itemId: 'x', kcal: 2000 }], guests: ['a', 'b', 'c'], daypart: 2 });
    ok(r && r.granted === false, 'unarmed grant returns granted:false', JSON.stringify(r));
    ok(!s.feastBuff, 'no buff state set');
    ok(!Game.feastedActive(), 'feastedActive() false');
    ok(said.some(m => m.indexOf('devotion gate') >= 0), 'refusal names the devotion gate', said[said.length - 1] || '');
  }

  // ============ G2: armed grant math + clamp ============
  console.log('\n[G2] armed grant: quality->mult math, clamp, surge variants');
  {
    await setupGame(Game);
    const s = Game.state.scholar;
    arm(Game, 1.5);
    let r = Game.grantFeastBuff({ quality: 0, served: [], guests: ['a', 'b', 'c'], daypart: 1 });
    ok(r.granted && Math.abs(r.mult - 1.8) < 1e-9, 'q0: 1.2 x 1.5 = 1.8', 'got ' + r.mult);
    ok(r.untilDay === (s.day || 0) + 1 && r.untilPart === 0, 'expiry = next dawn (absolute)', JSON.stringify({ untilDay: r.untilDay, untilPart: r.untilPart }));
    Game.clearFeastBuff(false);
    arm(Game, 1.5);
    r = Game.grantFeastBuff({ quality: 1, served: [], guests: [], daypart: 1 });
    ok(Math.abs(r.mult - 2.03) < 1e-9, 'q1: 1.35 x 1.5 = 2.03', 'got ' + r.mult);
    Game.clearFeastBuff(false);
    arm(Game, 1.5);
    r = Game.grantFeastBuff({ quality: 2, served: [], guests: [], daypart: 1 });
    ok(Math.abs(r.mult - 2.25) < 1e-9, 'q2: 1.5 x 1.5 = 2.25', 'got ' + r.mult);
    Game.clearFeastBuff(false);
    arm(Game, 2.25); // chosen keepsake
    r = Game.grantFeastBuff({ quality: 1, served: [], guests: [], daypart: 1 });
    ok(Math.abs(r.mult - 3.04) < 1e-9, 'chosen keepsake: 1.35 x 2.25 = 3.04', 'got ' + r.mult);
    Game.clearFeastBuff(false);
    arm(Game, true); // old saves: truthy non-numeric -> surgeDefault
    r = Game.grantFeastBuff({ quality: 1, served: [], guests: [], daypart: 1 });
    ok(Math.abs(r.mult - 2.03) < 1e-9, 'truthy non-numeric arming falls back to surgeDefault 1.5', 'got ' + r.mult);
    Game.clearFeastBuff(false);
    arm(Game, 1.5);
    r = Game.grantFeastBuff({ quality: 9, served: [], guests: [], daypart: 1 });
    ok(r.quality === 2, 'quality clamps high (9 -> 2)', 'got ' + r.quality);
    Game.clearFeastBuff(false);
    arm(Game, 1.5);
    r = Game.grantFeastBuff({ quality: -3, served: [], guests: [], daypart: 1 });
    ok(r.quality === 0, 'quality clamps low (-3 -> 0)', 'got ' + r.quality);
    Game.clearFeastBuff(false);
  }

  // ============ G3: re-feast refreshes, never stacks ============
  console.log('\n[G3] re-feast refreshes (no double-stack)');
  {
    await setupGame(Game);
    const s = Game.state.scholar;
    arm(Game, 1.5);
    const r1 = Game.grantFeastBuff({ quality: 0, served: [], guests: [], daypart: 1 });
    ok(r1.granted && !r1.refreshed && Math.abs(r1.mult - 1.8) < 1e-9, 'first grant q0 -> 1.8');
    const r2 = Game.grantFeastBuff({ quality: 2, served: [], guests: [], daypart: 1 });
    ok(r2.granted && r2.refreshed === true, 'second grant while feasted refreshes');
    ok(Math.abs(r2.mult - 2.25) < 1e-9, 'refresh takes the BETTER quality (2.25), not stacked (1.8x2.25=4.05)', 'got ' + r2.mult);
    ok(r2.untilDay === r1.untilDay, 'expiry extends to next dawn (same absolute dawn)', 'r1=' + r1.untilDay + ' r2=' + r2.untilDay);
    ok(Game.feastedMult() < 3, 'single live buff object (no stacking)', 'mult=' + Game.feastedMult());
    // lower-quality re-feast keeps the better one
    const r3 = Game.grantFeastBuff({ quality: 0, served: [], guests: [], daypart: 1 });
    ok(r3.quality === 2 && Math.abs(r3.mult - 2.25) < 1e-9, 'thin re-feast does not downgrade the buff', 'got q' + r3.quality + ' x' + r3.mult);
    Game.clearFeastBuff(false);
  }

  // ============ G4: strike uplift through the tbDamage hook (exact) ============
  console.log('\n[G4] strike uplift via tbDamage player-source hook (exact numbers)');
  {
    await setupGame(Game);
    const s = Game.state.scholar;
    arm(Game, 1.5);
    Game.grantFeastBuff({ quality: 0, served: [], guests: [], daypart: 1 }); // 1.8
    const mk = synthFight(Game, 'hushwolf', 500);
    said.length = 0;
    const dealt = Game.tbDamage(mk, 10, 'you', null, { quiet: true });
    ok(dealt === 18, '10 dmg x 1.8 = 18 through the hook', 'got ' + dealt);
    ok(said.some(m => m.indexOf('FEASTED ×1.8') === 0), 'hook states the true multiplier', said.find(m => m.indexOf('FEASTED') === 0) || '');
    // monster-sourced damage is NOT uplifted
    said.length = 0;
    const mhpBefore = Game.tbFighter('p').hp;
    Game.tbDamage('p', 10, "teeth", 'm1', { quiet: true, undodgeable: true });
    const took = mhpBefore - Game.tbFighter('p').hp;
    ok(took === 10, 'incoming damage untouched by the buff', 'took ' + took);
    // villager-targeted player damage is NOT uplifted (gristlefit lash class)
    Game.tbfight.fighters.push({ key: 'v1', kind: 'villager', villagerId: 'vx', name: 'Ally', hp: 100, maxHp: 100, speed: 4, mx: 5, my: 5, alive: true, fled: false });
    Game.tbfight.order.push('v1');
    const vhp = Game.tbFighter('v1').hp;
    Game.tbDamage('v1', 10, 'your gristlefit', 'p', { quiet: true, undodgeable: true });
    ok(vhp - Game.tbFighter('v1').hp === 10, 'player-sourced damage to a villager ally NOT uplifted', 'dealt ' + (vhp - Game.tbFighter('v1').hp));
    Game.clearFeastBuff(false);
    Game.tbfight = null;
  }

  // ============ G5: strike integration — honest line + use marking ============
  console.log('\n[G5] strike integration: true number, use marked, arming spent');
  {
    await setupGame(Game);
    const s = Game.state.scholar;
    arm(Game, 1.5);
    Game.grantFeastBuff({ quality: 1, served: [], guests: [], daypart: 1 }); // 2.03
    const mk = synthFight(Game, 'hushwolf', 5000);
    const m = Game.tbFighter(mk);
    const p = Game.tbFighter('p');
    p.mx = 4; p.my = 4; p.moveLeft = 0; p.acted = false;
    const hpBefore = m.hp;
    said.length = 0;
    Game.tbPlayerStrike(mk);
    const dealt = hpBefore - m.hp;
    const strikeLine = said.find(x => x.indexOf('You STRIKE') === 0) || '';
    const mnum = (strikeLine.match(/for (\d+)/) || [])[1];
    ok(said.some(x => x.indexOf('FEASTED ×2.03') === 0), 'FEASTED line states the true mult');
    ok(mnum != null && parseInt(mnum, 10) === dealt, 'strike line states what LANDED (uplifted)', 'line=' + mnum + ' dealt=' + dealt);
    ok(s.prog.feastSurgeUsed === true, 'feastSurgeUsed marked on real combat use');
    ok(!s.prog.feastSurge, 'devotion arming consumed by the use');
    ok(s.feastBuff && s.feastBuff.used === true, 'buff flagged used (keeps running till dawn)');
    Game.tbfight = null;
  }

  // ============ G6: ability twist — war_cry.bellow feasted ============
  console.log('\n[G6] ability twist: feasted war_cry extends stun');
  {
    await setupGame(Game);
    const s = Game.state.scholar;
    grantAbility(Game, 'war_cry');
    arm(Game, 1.5);
    Game.grantFeastBuff({ quality: 1, served: [], guests: [], daypart: 1 });
    let stunned = false, tries = 0;
    while (!stunned && tries < 5) {
      tries++;
      const mk = synthFight(Game, 'hushwolf', 500);
      const m = Game.tbFighter(mk);
      const p = Game.tbFighter('p');
      p.moveLeft = 3; p.acted = false;
      said.length = 0;
      const r = Game.useAbility('war_cry', 'bellow');
      if (r) {
        let has = false;
        try { has = Game.hasStatus(m, 'stun'); } catch (e) {}
        if (has) {
          stunned = true;
          let turns = null;
          try { turns = (Game.seList(m) || []).find(e => e.id === 'stun'); } catch (e) {}
          ok(turns && turns.turnsLeft >= 2, 'feasted bellow: stun lasts 2 rounds (1 + 1 twist)', 'turnsLeft=' + (turns && turns.turnsLeft));
          ok(said.some(x => x.indexOf('Feasted War Cry') >= 0), 'twist line narrates the feasted form');
          ok(s.prog.feastSurgeUsed === true, 'non-damage combat ability marks combat use too');
        }
      }
      Game.tbfight = null;
    }
    ok(stunned, 'bellow stunned within 5 tries (twist had something to extend)', 'tries=' + tries);
  }

  // ============ G7: heal twist — field_medicine feasted ============
  console.log('\n[G7] heal twist: feasted field_medicine grants +50%');
  {
    await setupGame(Game);
    const s = Game.state.scholar;
    s.kcal = 2000;
    s.health = 50;
    s.fieldMedDayPart = null;
    grantAbility(Game, 'field_medicine');
    arm(Game, 1.5);
    Game.grantFeastBuff({ quality: 1, served: [], guests: [], daypart: 1 });
    said.length = 0;
    const r = Game.activateAbility('field_medicine');
    ok(r !== false, 'field_medicine resolved');
    ok(s.health === 80, 'heal 20 + feasted bonus 10 = 80', 'hp=' + s.health);
    ok(said.some(x => x.indexOf('+10 HP') >= 0 && x.indexOf('feasted') >= 0), 'bonus line states the true number', said.slice(-2).join(' | '));
  }

  // ============ G8: camp ability while feasted marks nothing ============
  console.log('\n[G8] non-combat ability while feasted: no use marking');
  {
    await setupGame(Game);
    const s = Game.state.scholar;
    grantAbility(Game, 'game_sense');
    arm(Game, 1.5);
    Game.grantFeastBuff({ quality: 1, served: [], guests: [], daypart: 1 });
    Game.tbfight = null;
    said.length = 0;
    const r = Game.useAbility('game_sense', 'read_sign');
    ok(r === true, 'read_sign resolved out of combat');
    ok(s.prog.feastSurgeUsed !== true, 'feastSurgeUsed NOT marked (no combat use)');
    ok(!!s.prog.feastSurge, 'devotion arming NOT consumed');
    ok(Game.feastedActive() && !s.feastBuff.used, 'buff still live and unused');
  }

  // ============ G9: expiry at dawn ============
  console.log('\n[G9] expiry at dawn removes all effects');
  {
    await setupGame(Game);
    const s = Game.state.scholar;
    arm(Game, 1.5);
    const g = Game.grantFeastBuff({ quality: 2, served: [], guests: [], daypart: 2 });
    ok(Game.feastedActive(), 'buff live before dawn');
    s.day = g.untilDay; // dawn arrives
    said.length = 0;
    ok(!Game.feastedActive(), 'feastedActive() false at dawn');
    ok(said.filter(x => x.indexOf('fades') >= 0).length === 1, 'fade line said exactly once');
    ok(!s.feastBuff, 'buff state deleted');
    ok(Game.feastedLine() === '', 'countdown line empty');
    ok(Game.feastedMult() === 1, 'mult back to 1');
    ok(!Game.feastedActive(), 'second check: no repeat fade line');
    ok(said.filter(x => x.indexOf('fades') >= 0).length === 1, 'still exactly one fade line (no spam)');
    // strikes normal again
    const mk = synthFight(Game, 'hushwolf', 500);
    const dealt = Game.tbDamage(mk, 10, 'you', null, { quiet: true });
    ok(dealt === 10, 'post-dawn strikes unmodified', 'got ' + dealt);
    Game.tbfight = null;
  }

  // ============ G10: save/load mid-buff is clean ============
  console.log('\n[G10] save/load mid-buff clean; no phantom buff after dawn');
  {
    await setupGame(Game);
    const s = Game.state.scholar;
    arm(Game, 1.5);
    const g = Game.grantFeastBuff({ quality: 1, served: [], guests: [], daypart: 1 });
    Game.save();
    const saves = S.state.listSaves();
    ok(saves.length > 0, 'save written', 'count=' + saves.length);
    const key = saves[0].key;
    ok(Game.load(key) === true, 'Continue loads');
    const s2 = Game.state.scholar;
    ok(Game.feastedActive(), 'buff still live after Continue (dawn has not come)');
    ok(Math.abs(Game.feastedMult() - g.mult) < 1e-9, 'same multiplier after load', 'got ' + Game.feastedMult());
    ok(s2.feastBuff.untilDay === g.untilDay, 'same absolute expiry after load');
    ok(Game.feastedLine().indexOf('×' + g.mult) >= 0, 'countdown line survives the load');
    // now let dawn pass, save, load -> no phantom buff
    s2.day = g.untilDay;
    Game.save();
    const key2 = S.state.listSaves()[0].key;
    ok(Game.load(key2) === true, 'second Continue loads');
    const s3 = Game.state.scholar;
    ok(!Game.feastedActive(), 'no phantom buff after dawn-crossing load');
    ok(!s3.feastBuff, 'buff state absent after load');
    const mk = synthFight(Game, 'hushwolf', 500);
    const dealt = Game.tbDamage(mk, 10, 'you', null, { quiet: true });
    ok(dealt === 10, 'post-load strikes unmodified', 'got ' + dealt);
    Game.tbfight = null;
    globalThis.localStorage._reset();
  }

  // ============ G11: re-feast after combat use refused ============
  console.log('\n[G11] re-feast after combat use: devotion spent, refused honestly');
  {
    await setupGame(Game);
    const s = Game.state.scholar;
    arm(Game, 1.5);
    Game.grantFeastBuff({ quality: 1, served: [], guests: [], daypart: 1 });
    const mk = synthFight(Game, 'hushwolf', 500);
    Game.tbDamage(mk, 10, 'you', null, { quiet: true }); // combat use
    ok(s.prog.feastSurgeUsed === true && !s.prog.feastSurge, 'use consumed the arming (setup)');
    said.length = 0;
    const r = Game.grantFeastBuff({ quality: 2, served: [], guests: [], daypart: 1 });
    ok(r.granted === false, 're-feast refused while feasted-but-spent');
    ok(said.some(m => m.indexOf('devotion gate') >= 0), 'refusal names the gate again');
    ok(Game.feastedActive(), 'the ORIGINAL buff is untouched by the refused re-feast');
    Game.tbfight = null;
  }

  // ============ G12: Arc IV burns hotter ============
  console.log('\n[G12] arc4burn multiplies the granted buff, stated honestly');
  {
    await setupGame(Game);
    const s = Game.state.scholar;
    arm(Game, 1.5);
    s.arc4burn = 1.25;
    said.length = 0;
    const r = Game.grantFeastBuff({ quality: 1, served: [], guests: [], daypart: 1 });
    // 1.35 x 1.5 x 1.25 = 2.53125 -> 2.53
    ok(r.granted && Math.abs(r.mult - 2.53) < 1e-9, 'arc4: 1.35 x 1.5 x 1.25 = 2.53', 'got ' + r.mult);
    ok(said.some(x => x.indexOf('Arc IV burns hotter') >= 0), 'grant line states the Arc IV bonus');
    const mk = synthFight(Game, 'hushwolf', 500);
    const dealt = Game.tbDamage(mk, 10, 'you', null, { quiet: true });
    ok(dealt === 25, 'hook applies the arc-hot mult (10 x 2.53 = 25.3 -> 25)', 'got ' + dealt);
    Game.tbfight = null;
    Game.clearFeastBuff(false);
  }

  console.log('\n========================================');
  console.log(`SEED=${SEED}  pass=${pass} fail=${fail}`);
  if (fail) { console.log('FAILURES:\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('ALL GREEN');
  process.exit(0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
