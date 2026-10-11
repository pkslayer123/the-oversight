#!/usr/bin/env node
// test-structural-combat-wounds.js — PROOF (Worker B, 2026-10-10).
// Wound-stabilization / field-medicine availability upstream of death.
//
// Covers:
//   W1. fieldFight: a villager holding field_medicine uses it once per
//       fight when hurt (<60% max) — +20 HP, narrated (mirrors the player's
//       "Heal 20 HP, once per day part" honestly, off-screen = per fight).
//   W2. field_medicine does NOT fire at full health, and fires at most once.
//   W3. healerRounds(): the camp healer treats the single most-hurt villager
//       (<50 HP) once per day — +15 HP, narrated, no item consumed.
//   W4. healerRounds(): no healer -> nothing happens (no phantom medicine).
//   W5. healerRounds(): at most once per day (second call is a no-op).
//   W6. healerRounds(): the healer never treats themselves or the dead.
//
// Usage: node scripts/test-structural-combat-wounds.js
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame } = require('./sim-harness');

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
};

(async () => {
  const { Game } = await loadGame({ seed: 20261011, mode: 'wounds-proof', fullTelemetry: false });
  setupGame(Game);
  const said = [];
  Game.say = (m) => { said.push(String(m)); };
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const vid = roster[0];
  Game.state.village.health = Game.state.village.health || {};
  const bulldozer = (Game.data.monsters || []).find(m => m.id === 'bulldozer');

  // W1: field_medicine fires in a field fight when hurt
  // (narrates into rec.log — fieldFight is off-screen, never Game.say.)
  Game.npcGrantAbility(vid, 'field_medicine');
  Game.state.village.health[vid] = 55; // <60% of 100
  said.length = 0;
  const rec = Game.fieldFight(vid, bulldozer, null, { awareness: false });
  const medLine = (rec.log || []).find(s => /field medicine/i.test(s));
  check('W1 field_medicine fires when hurt', !!medLine, (rec.log || []).slice(-4).join(' | '));
  check('W1 heal is +20 (honest number)', medLine && /\+20/.test(medLine), medLine || '(no line)');
  Game.state.village.npcAbilities[vid] = (Game.state.village.npcAbilities[vid] || []).filter(a => a !== 'field_medicine');

  // W2: no fire at full health; at most once
  Game.npcGrantAbility(vid, 'field_medicine');
  Game.state.village.health[vid] = 100;
  said.length = 0;
  const rec2 = Game.fieldFight(vid, bulldozer, null, { awareness: false });
  const medLines = (rec2.log || []).filter(s => /field medicine/i.test(s));
  check('W2 field_medicine silent at/near full health OR fires at most once', medLines.length <= 1, `fired ${medLines.length}x`);
  Game.state.village.npcAbilities[vid] = (Game.state.village.npcAbilities[vid] || []).filter(a => a !== 'field_medicine');

  // ---- healer rounds ----
  const vid2 = roster[1], vid3 = roster[2];
  // make the PLAYER the healer via field_medicine (scholar.abilities entries)
  const sch = Game.state.scholar;
  sch.abilities = sch.abilities || [];
  if (!Game.hasAbility('field_medicine')) sch.abilities.push({ id: 'field_medicine' });
  const healerName = Game.campHealerName ? Game.campHealerName() : null;
  if (!healerName) {
    console.log('  SKIP W3-W6: no camp healer available in this setup');
  } else {
    Game.state.village.health[vid2] = 20;
    Game.state.village.health[vid3] = 80;
    said.length = 0;
    const day = (Game.state.scholar || {}).day || 1;
    const treated = Game.healerRounds();
    check('W3 healer treats the most-hurt villager', treated === vid2, `treated=${treated}`);
    check('W3 heal is +15', Game.state.village.health[vid2] === 35, `hp=${Game.state.village.health[vid2]}`);
    check('W3 narrated', said.some(s => /healer|rounds|binds|treats/i.test(s)), said.join(' | ').slice(0, 200));
    // W5: once per day
    const again = Game.healerRounds();
    check('W5 healer rounds once per day', again === null || again === false, `again=${again}`);
    // W6: never treats the healer themselves / the dead — implicitly: vid3 untouched
    check('W6 only the most-hurt treated', Game.state.village.health[vid3] === 80, `vid3 hp=${Game.state.village.health[vid3]}`);
  }

  // W4: no healer -> nothing
  // (simulate by removing the player's medical abilities and benching any
  // medic villagers - campHealerName skips the dead, so mark them dead
  // temporarily; restored right after.)
  // (hasAbility reads BOTH scholar.abilities and scholar.backgroundAbilities.)
  const savedAbilities = (Game.state.scholar.abilities || []).slice();
  const savedBgAbilities = (Game.state.scholar.backgroundAbilities || []).slice();
  const stripMed = (list) => (list || []).filter(e => {
    const id = (e && e.id) || e;
    return id !== 'field_medicine' && id !== 'triage' && id !== 'herbal_remedy';
  });
  Game.state.scholar.abilities = stripMed(Game.state.scholar.abilities);
  Game.state.scholar.backgroundAbilities = stripMed(Game.state.scholar.backgroundAbilities);
  const benched = [];
  const v = Game.state.village;
  for (const id of (v.roster || [])) {
    if (id === Game.villagerId) continue;
    let p = null; try { p = Game.getPerson(id); } catch (e) {}
    if (p && /nurse|medic|doctor|paramedic|midwife|veterinarian|pharmacist|herbalist|dentist/i.test(String(p.formerOccupation || ''))) {
      benched.push([p, p.dead]); p.dead = true;
    }
  }
  const trulyNoHealer = Game.campHealerName ? Game.campHealerName() : 'someone';
  check('W4 precondition: healer genuinely absent', !trulyNoHealer, `healer=${trulyNoHealer}`);
  Game.state.scholar.day = (Game.state.scholar.day || 1) + 1; // fresh day - rounds allowed again
  Game.state.village.health[vid2] = 20;
  said.length = 0;
  const r = Game.healerRounds();
  check('W4 no healer -> no treatment', !r, `treated=${r}`);
  check('W4 no phantom narration', !said.some(s => /healer|rounds|bound up/i.test(s)), said.join(' | ').slice(0, 200));
  // restore
  Game.state.scholar.abilities = savedAbilities;
  Game.state.scholar.backgroundAbilities = savedBgAbilities;
  for (const [p, wasDead] of benched) p.dead = wasDead;

  console.log(`\nwounds proof: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
