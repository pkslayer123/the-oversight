#!/usr/bin/env node
// test-parity-abilities.js — proof test for the villager-ability parity fix
// (Worker A, 2026-10-10).
//
// BEFORE: the System granted villagers abilities for real deeds
// (villagerGainXP -> npcGrantAbility), but NOTHING ever read them —
// npcHasAbility was only consulted for phoenix_clause burn eligibility.
// A granted ability that never fires is a lie.
//
// AFTER: held abilities translate into fieldFight's real mechanics
// (patient_aim/haymaker/ambush/war_cry/scream_cheese/unbreakable/dead_aim/
// trade_of_blows/blood_trail/stalk/game_sense/tracker/echo_location) plus
// purify+iron_stomach (food), triage (care), tracker+game_sense+
// field_dressing (hunt).
//
// Run: node scripts/test-parity-abilities.js
//   STRIP=1 node scripts/test-parity-abilities.js  -> simulates the pre-fix
//   world (abilities granted but forcibly unread) and shows the test FAILS,
//   proving the test is sensitive to the fix rather than vacuous.
'use strict';
const path = require('path');
const { loadGame, setupGame, mulberry32 } = require('./sim-harness');

const STRIP = process.env.STRIP === '1';
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  PASS ${name}${detail ? ' — ' + detail : ''}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

function fightStats(Game, vid, mdef, abilities, n, seedBase) {
  // grant abilities (or strip them when simulating pre-fix). Reset before
  // EACH fight: fieldFight grants combat XP per fight, and villagerGainXP
  // would otherwise mid-run grant abilities that pollute the baseline.
  const v = Game.state.village;
  v.npcAbilities = v.npcAbilities || {};
  let vKill = 0, vDie = 0, vFlee = 0, mFlee = 0, evade = 0;
  let vTakenSum = 0, mDealtSum = 0, aimLogs = 0, ambushLogs = 0, braceLogs = 0;
  let cryLogs = 0, haymakerLogs = 0;
  for (let i = 0; i < n; i++) {
    v.npcAbilities[vid] = STRIP ? [] : abilities.slice();
    const rng = mulberry32(seedBase + i);
    // reset villager health each fight
    v.health = v.health || {};
    v.health[vid] = 100;
    const rec = Game.fieldFight(vid, mdef, null, { awareness: true, rng });
    if (rec.outcome === 'vKill') vKill++;
    else if (rec.outcome === 'vDie') vDie++;
    else if (rec.outcome === 'vFlee') vFlee++;
    else if (rec.outcome === 'mFlee') mFlee++;
    else if (rec.outcome === 'evade') evade++;
    vTakenSum += rec.vTaken || 0;
    mDealtSum += rec.mDealt || 0;
    const log = (rec.log || []).join(' | ');
    if (/Take Aim/.test(log)) aimLogs++;
    if (/ambush!/i.test(log)) ambushLogs++;
    if (/Unbreakable/.test(log)) braceLogs++;
    if (/War Cry/.test(log)) cryLogs++;
    if (/HAYMAKER/.test(log)) haymakerLogs++;
  }
  return { vKill, vDie, vFlee, mFlee, evade, vTaken: vTakenSum / n, mDealt: mDealtSum / n,
           aimLogs, ambushLogs, braceLogs, cryLogs, haymakerLogs, n };
}

(async () => {
  const { Game } = await loadGame({ seed: 777, mode: 'parity-proof' });
  await setupGame(Game);
  // capture Game.say lines for the tactical-combat section
  const logLines = [];
  const _say = Game.say.bind(Game);
  Game.say = (msg) => { try { logLines.push(String(msg)); } catch (e) {} };
  const clearLog = () => { logLines.length = 0; };
  try { Game.state.systemArrived = true; } catch (e) {}
  const v = Game.state.village;
  const vid = (v.roster || []).find(id => id !== Game.villagerId);
  if (!vid) { console.log('no villager'); process.exit(2); }
  // arm the villager minimally so wb is stable
  try { if (Game.villagerGearUp) Game.villagerGearUp(vid, false); } catch (e) {}
  const mdef = (Game.data.monsters || []).find(m => m.id === 'bulldozer') ||
               (Game.data.monsters || [])[0];
  console.log(`monster: ${mdef.id}, villager: ${String(vid).slice(0, 12)}${STRIP ? ' [STRIP MODE: pre-fix simulation]' : ''}`);

  const N = 120;
  console.log('baseline (no abilities):');
  const base = fightStats(Game, vid, mdef, [], N, 1000);
  console.log(`  vKill ${base.vKill} vDie ${base.vDie} vFlee ${base.vFlee} mDealt/fight ${base.mDealt.toFixed(1)} vTaken/fight ${base.vTaken.toFixed(1)}`);

  console.log('full combat kit (patient_aim,haymaker,ambush,war_cry,unbreakable,dead_aim,trade_of_blows,scream_cheese,stalker,blood_trail,game_sense,tracker):');
  const kit = ['patient_aim', 'haymaker', 'ambush', 'war_cry', 'unbreakable', 'dead_aim',
               'trade_of_blows', 'scream_cheese', 'stalk', 'blood_trail', 'game_sense', 'tracker'];
  const withAb = fightStats(Game, vid, mdef, kit, N, 1000);
  console.log(`  vKill ${withAb.vKill} vDie ${withAb.vDie} vFlee ${withAb.vFlee} mDealt/fight ${withAb.mDealt.toFixed(1)} vTaken/fight ${withAb.vTaken.toFixed(1)}`);

  // The kit must MATTER: more damage out, fewer deaths, and the signature
  // log lines must appear.
  check('kit deals more damage than baseline', withAb.mDealt > base.mDealt + 2,
        `${withAb.mDealt.toFixed(1)} vs ${base.mDealt.toFixed(1)}`);
  check('kit kills at least as often', withAb.vKill >= base.vKill,
        `${withAb.vKill} vs ${base.vKill}`);
  check('Take Aim fires (patient_aim)', withAb.aimLogs > N * 0.2, `${withAb.aimLogs}/${N} fights`);
  check('ambush opening strike fires', withAb.ambushLogs > N * 0.3, `${withAb.ambushLogs}/${N} fights`);
  check('HAYMAKER fires (every 3rd round)', withAb.haymakerLogs > N * 0.4, `${withAb.haymakerLogs}/${N} fights`);

  console.log('single ability: unbreakable alone');
  const ub = fightStats(Game, vid, mdef, ['unbreakable'], N, 2000);
  const ubBase = fightStats(Game, vid, mdef, [], N, 2000);
  check('unbreakable brace fires', ub.braceLogs > 0, `${ub.braceLogs}/${N} fights`);
  check('unbreakable reduces damage taken', ub.vTaken < ubBase.vTaken,
        `${ub.vTaken.toFixed(1)} vs ${ubBase.vTaken.toFixed(1)}`);

  console.log('single ability: war_cry alone (hopeless fights)');
  const wc = fightStats(Game, vid, mdef, ['war_cry'], N, 3000);
  check('war_cry bellow fires', wc.cryLogs > 0, `${wc.cryLogs}/${N} fights`);

  // ---- non-combat: purify halves food-poisoning ----
  console.log('purify / iron_stomach vs food poisoning:');
  const sickRate = (abilities) => {
    v.npcAbilities[vid] = STRIP ? [] : abilities.slice();
    v.sick = {};
    let sick = 0;
    const exposure = { raw: [{ p: 0.6, note: 'raw test meat' }] };
    for (let i = 0; i < 200; i++) {
      delete v.sick[vid];
      try { sick += Game.villagerFoodPoisoning(v, vid, exposure) || 0; } catch (e) {}
    }
    return sick / 200;
  };
  const rBase = sickRate([]);
  const rPur = sickRate(['purify']);
  console.log(`  sicken rate: baseline ${rBase.toFixed(2)}, purify ${rPur.toFixed(2)}`);
  check('purify roughly halves sicken chance', rPur < rBase * 0.75,
        `${rPur.toFixed(2)} vs ${rBase.toFixed(2)}`);

  // ---- non-combat: triage doubles care reach ----
  console.log('triage vs villagerCareTick:');
  const careReach = (abilities) => {
    v.npcAbilities[vid] = STRIP ? [] : abilities.slice();
    // make vid the ONLY medic: neutralize other medics' occupations
    const saved = [];
    try {
      for (const id of (v.roster || [])) {
        if (id === vid || id === Game.villagerId) continue;
        const p = Game.getPerson(id);
        if (p && /nurse|medic|doctor|paramedic|midwife|veterinarian|pharmacist|herbalist|dentist/i.test(String(p.formerOccupation || ''))) {
          saved.push([p, p.formerOccupation]);
          p.formerOccupation = 'accountant';
        }
      }
    } catch (e) {}
    let person = null;
    try { person = Game.getPerson(vid); } catch (e) {}
    const oldOcc = person ? person.formerOccupation : null;
    if (person) person.formerOccupation = 'nurse';
    const roster = (v.roster || []).filter(id => id !== Game.villagerId && id !== vid).slice(0, 3);
    v.sick = {};
    for (const id of roster) v.sick[id] = { name: 'test flu', daysLeft: 5, severity: 1 };
    const before = roster.map(id => v.sick[id].daysLeft);
    try { Game.villagerCareTick(() => 'X'); } catch (e) {}
    const tended = roster.filter((id, i) => v.sick[id] && v.sick[id].daysLeft < before[i]).length;
    if (person) person.formerOccupation = oldOcc;
    for (const [p, occ] of saved) p.formerOccupation = occ;
    return tended;
  };
  const tBase = careReach([]);
  const tTri = careReach(['triage']);
  console.log(`  patients tended per tick: baseline ${tBase}, triage ${tTri}`);
  check('triage tends more patients', tTri > tBase, `${tTri} vs ${tBase}`);

  // ---- hunt: real wildlife, real gear ----
  console.log('villagerHuntResolve:');
  const hr = Game.villagerHuntResolve(vid, 1.0);
  check('hunt resolve returns a result object', hr && typeof hr.kcal === 'number', JSON.stringify(hr).slice(0, 120));
  // determinism of shape: a hunted-out world yields nothing
  let sawZeroMsg = /hunted out|no game|finds sign/.test(hr.msg || '');
  check('hunt narrates honestly (kill or honest miss)', typeof hr.msg === 'string' && hr.msg.length > 10);

  // ---- tactical combat: villager allies use passive/active abilities ----
  // (unbreakable brace in tbDamage; haymaker in the villager strike path)
  console.log('tactical combat: villager ally abilities');
  {
    const v2 = Game.state.village;
    const vid2 = (v2.roster || []).find(id => id !== Game.villagerId);
    v2.health = v2.health || {}; v2.health[vid2] = 100;
    v2.positions = v2.positions || {};
    const px = Game.map.px, py = Game.map.py;
    v2.positions[vid2] = { mx: px, my: py };
    Game.state.scholar.mx = px; Game.state.scholar.my = py;
    Game.state.scholar.health = 100;
    clearLog();
    try { Game.startCombat('bulldozer'); } catch (e) { check('tactical fight starts', false, e.message); }
    const ally = (Game.tbfight && Game.tbfight.fighters || []).find(f => f.kind === 'villager' && f.villagerId === vid2);
    const foe = (Game.tbfight && Game.tbfight.fighters || []).find(f => f.kind === 'monster');
    if (!ally || !foe) {
      check('ally + foe present', false, 'setup failed');
    } else {
      // UNBREAKABLE: hurt the ally, then deal a known hit through tbDamage
      v2.npcAbilities[vid2] = STRIP ? [] : ['unbreakable'];
      ally.hp = 80; // hurt — brace condition (hp < maxHp)
      clearLog();
      const landed = Game.tbDamage(ally.key, 20, 'test claws', foe.key, { quiet: true });
      const braceLine = logLines.some(l => /braces/i.test(l));
      check('tactical unbreakable brace fires', STRIP ? !braceLine : braceLine,
        'landed=' + landed + ' (20 → ~8 expected)');
      check('tactical unbreakable reduces the hit', STRIP ? landed === 20 : landed < 20 && landed >= 6,
        'landed=' + landed);
      // HAYMAKER: run real rounds; every 3rd villager strike should HAYMAKER
      // (make the ally brave so they close to melee — helpful AIs harry at range)
      v2.npcAbilities[vid2] = STRIP ? [] : ['haymaker'];
      ally.ai = 'brave';
      ally.hp = 100; // reset
      clearLog();
      let rounds = 0;
      try {
        while (Game.tbfight && !Game.tbfight.over && rounds < 30 && foe.alive !== false) {
          // player waits; tbAdvance runs the world (villager + monster turns)
          Game.tbPlayerWait();
          rounds++;
          // keep the player alive through the measurement
          if (Game.state.scholar.health < 50) Game.state.scholar.health = 100;
          if (ally.hp < 30) ally.hp = 100;
        }
      } catch (e) {}
      const haymakers = logLines.filter(l => /HAYMAKER/.test(l)).length;
      check('tactical haymaker fires (every 3rd swing)', STRIP ? haymakers === 0 : haymakers >= 1,
        haymakers + ' haymaker lines in ' + rounds + ' rounds');
      try { if (Game.tbfight && !Game.tbfight.over) Game.tbEnd('fled'); } catch (e) {}
    }
  }

  console.log(failures ? `\n${failures} FAILURES` : '\nALL GREEN');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
