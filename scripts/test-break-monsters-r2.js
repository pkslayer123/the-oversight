#!/usr/bin/env node
// BREAK-IT monsters r2 (2026-10-09): proof tests for the four catches.
//   C1 SPAWNABILITY — Steve's 2026-10-06 waterAffinity design (catfish lives
//      IN water; heron/toad/turtle wade NEAR it) was silently deleted from
//      monsters.json by 98041cc and the deletion was preserved by the 7b49fc5
//      bulk restore. The water-gating code (pickWorldTile, pickSpawnMonster,
//      placeSpawnMonster, castMonster exclusion, wanderer placement) was live
//      but reading fields that no longer existed — dead guards, catfish on
//      dry land. FIX: the 4 fields restored byte-surgically.
//   C2 MEAT-ECONOMY EXPLOIT — askSpecialist 'cook' on cleaned meat computed
//      total from hiddenKcal (the RAW GROSS) instead of the cleaned net
//      (kcalEach×units): a 1280-kcal cleaned bulldozer cooked at 3200+ kcal
//      (3840 at skill 4) — the butchering loss resurrected, energy from
//      nothing. Same class the 2026-10-08 hunter loop fixed in the batch
//      path; the specialist path was missed. FIX: digestibility honesty —
//      the cleaned total is the raw net; skill buys a better cut of the
//      gross via the class, never more than gross. + reveal order fix:
//      markMonsterFoodSafe's /4 "standard yield" punished test-after-clean
//      (~25% loss vs test-before-clean); now distributes over actual portions.
//   C3 VILLAGER KILLS EVAPORATED — resolveWildMonsterEncounter vKill called
//      removeWorldMonster with no corpse and no meat: a 3200-kcal bulldozer
//      died with nothing left, while the player's identical kill left a
//      lootable, rottable carcass. FIX: the kill registers a monster corpse
//      at the monster's tile (registerDeath node override) with the same
//      carcass entry (monsterMeatEntry, factored out of tbEnd).
//   C4 PATROL RNG TABLE — resolvePatrol resolved villager-vs-monster as a
//      flat roll (fightPower+R vs mHp*1.2): the exact outcome-table class
//      Steve rejected twice ("it should be a fight. A hard one"). It also
//      granted flat R(200,600) "Game meat" — phantom calories bypassing the
//      carcass/clean/cook/weirdness pipeline (no monster-meat weirdness ever
//      fired on patrol meat; wounds didn't persist — the roll used def-min
//      HP, not the entity's). FIX: patrols fight through fieldFight with the
//      same outcome routing as the other two routers; kills leave carcasses.
//   C5 (honesty) WAVE-3 ANNOUNCEMENT — the unlock sysSay promised "Wave 3
//      talent has been released" but the roster has no wave-3 monsters (wave
//      3 IS reachable: day 25 + 8 wave-2 kills). FIX: the line checks the
//      data — talent promised only when the wave has monsters.
//   C6 (honesty) DISENGAGE COPY — "You walk clear of them" lied when a
//      drifter (mirrormoth) jittered out of its own range on turn 1. Now
//      direction-neutral.
// PROOF: scripts/test-break-monsters-r2.js (SEED=N; mulberry32 default).
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./combat-r3-harness.js');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok -', name); }
  else { fail++; console.log('  FAIL -', name, extra ? ':: ' + extra : ''); }
}

(async () => {
  console.log('seed', H.SEED);

  // ================= C1: waterAffinity =================
  {
    console.log('C1 waterAffinity restore');
    const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
    const aff = Object.fromEntries(monsters.filter(m => m.waterAffinity).map(m => [m.id, m.waterAffinity]));
    check('catfish lives IN water', aff.nightlight_catfish === 'in', JSON.stringify(aff));
    check('heron/toad/turtle wade NEAR water',
      aff.white_noise_heron === 'near' && aff.belltoad === 'near' && aff.speedbump_turtle === 'near');
    check('no other monster carries waterAffinity', Object.keys(aff).length === 4);
    const gameJs = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
    for (const fn of ['pickWorldTile', 'pickSpawnMonster', 'placeSpawnMonster']) {
      const fi = gameJs.indexOf(fn + '(');
      const wi = gameJs.indexOf('waterAffinity', fi);
      check(fn + ' reads waterAffinity', fi >= 0 && wi > fi && wi - fi < 2000, fn);
    }
    {
      // castMonster: find the DEFINITION (callers come first in the file).
      const fi = gameJs.indexOf('castMonster() {');
      const wi = gameJs.indexOf('waterAffinity', fi);
      check('castMonster reads waterAffinity', fi >= 0 && wi > fi && wi - fi < 2000, 'castMonster');
    }
    // BEFORE: the pre-fix base's data lacked the fields (the guards were dead).
    // Pinned to e6e30c4 (the worktree's original base) — post-rebase HEAD
    // contains the fix, so HEAD is no longer the "before" snapshot.
    const { execSync } = require('child_process');
    const head = JSON.parse(execSync('git show e6e30c4:src/data/monsters.json', { cwd: ROOT }));
    const headAff = head.filter(m => m.waterAffinity).length;
    check('e6e30c4 (pre-fix) had zero waterAffinity fields — the guards were dead', headAff === 0, 'e6e30c4 had ' + headAff);
  }

  // ================= C2: specialist cook =================
  {
    console.log('C2 specialist cook digestibility honesty (played math)');
    const Game = await H.newCombatReadyGame();
    const s = Game.state.scholar;
    s.inventory.length = 0; // harness-agnostic: our meat is index 0
    // A cleaned bulldozer: gross 3200, known-clean 40% -> 1280 net, 3 portions.
    const gross = 3200, net = Math.round(gross * 0.40), units = Math.max(1, Math.round(net / 500));
    const per = Math.round(net / units);
    Game.markMonsterFoodSafe('bulldozer', 'tested');
    s.inventory.push({
      plantId: 'meat_bulldozer', foodKind: 'meat', foodState: 'cleaned',
      edible: true, units, unit: 'portion', kcalEach: per, hiddenKcal: gross,
      spoilDay: (s.day || 0) + 2, name: 'Bulldozer (cleaned)',
    });
    // Stub only the specialist lookup; the cook math under test runs for real.
    const origSH = Game.specialistsHere;
    Game.specialistsHere = () => [{ id: 's1', name: 'Test Cook', skill: 4, occupation: 'cook' }];
    // npcNode gate: specialistsHere is stubbed, askSpecialist uses the stub list.
    Game.askSpecialist('s1', 0, undefined, 'cook');
    Game.specialistsHere = origSH;
    const it = s.inventory[0];
    const total = (it.kcalEach || 0) * (it.units || 1);
    // Old (buggy) math: round(3200 * 1.2 / 3) * 3 = 3840 — phantom calories.
    const oldTotal = Math.round(gross * 1.2 / units) * units;
    check('cooked state reached', it.foodState === 'cooked', it.foodState);
    check('no phantom calories: total <= gross', total <= gross, 'total=' + total + ' gross=' + gross);
    check('specialist improves on the cleaned net (skill matters)', total > net, 'total=' + total + ' net=' + net);
    check('old math would have printed money', oldTotal > gross, 'old=' + oldTotal);
    check('fixed total matches digestibility math (per-unit rounding)',
      total === Math.round(Math.min(gross, (net / 0.55) * 0.8 * 1.2) / units) * units, 'total=' + total);
    // Reveal order: test-after-clean must equal test-before-clean.
    const g2 = await H.newCombatReadyGame();
    const s2 = g2.state.scholar;
    s2.inventory.length = 0;
    s2.inventory.push({ // cleaned but unknown: kcalEach 0, units split, gross in hiddenKcal
      plantId: 'meat_hushwolf', foodKind: 'meat', foodState: 'cleaned', edible: false,
      units: 2, kcalEach: 0, hiddenKcal: 1400, spoilDay: (s2.day || 0) + 2, name: 'Hushwolf (cleaned)',
    });
    // Simulate test-after-clean: the flesh is unknown when cleaned, tested now.
    g2.markMonsterFoodSafe('hushwolf', 'tested');
    const revealed = s2.inventory[0];
    check('reveal distributes over actual portions (order-independent)',
      revealed.kcalEach === Math.round(1400 * 0.40 / 2),
      'kcalEach=' + revealed.kcalEach + ' want ' + Math.round(1400 * 0.40 / 2));
  }

  // ================= C3: villager kill corpse =================
  {
    console.log('C3 villager field-fight kill leaves a carcass');
    const Game = await H.newCombatReadyGame();
    const v = Game.state.village;
    const vid = (v.roster || [])[0];
    check('harness has a villager', !!vid);
    // A world monster on a far tile.
    const m = Game.spawnWorldMonster('bulldozer', 7, 7, { hp: 60 });
    const corpses0 = Game.corpses().length;
    // Rig the fight record (the router is under test, not the fight engine).
    const origFF = Game.fieldFight;
    Game.fieldFight = () => ({ outcome: 'vKill', rounds: 3, vTaken: 20, mDealt: 200, log: ['rigged'] });
    const origSummary = Game.fieldFightSummary;
    Game.fieldFightSummary = () => 'rigged summary';
    Game.resolveWildMonsterEncounter(vid, m);
    Game.fieldFight = origFF; Game.fieldFightSummary = origSummary;
    check('monster removed from the world', !Game.worldMonsters().includes(m));
    const fresh = Game.corpses().slice(corpses0);
    const mc = fresh.find(c => c.kind === 'monster' && c.monsterId === 'bulldozer');
    check('a monster corpse was registered', !!mc);
    check('corpse is at the kill tile, not the player tile',
      !!mc && mc.node.x === 7 && mc.node.y === 7, mc && JSON.stringify(mc.node));
    const meat = mc && (mc.items || []).find(i => i.plantId === 'meat_bulldozer');
    check('the carcass rides the corpse (lootable, rottable)', !!meat,
      meat ? meat.foodState + ' spoilDay=' + meat.spoilDay : 'no meat');
    check('carcass hides calories until learned', !!meat && meat.kcalEach === 0 && meat.hiddenKcal === 3200);
  }

  // ================= C4: patrol real fights =================
  {
    console.log('C4 patrol resolves through fieldFight, not a table');
    const gameJs = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
    // Slice the resolvePatrol body via brace counting (robust to inner closures).
    const pStart = gameJs.indexOf('resolvePatrol(vid, first) {');
    let depth = 0, pEnd = -1;
    for (let i = gameJs.indexOf('{', pStart); i < gameJs.length; i++) {
      if (gameJs[i] === '{') depth++;
      else if (gameJs[i] === '}') { depth--; if (depth === 0) { pEnd = i; break; } }
    }
    const patrolSrc = gameJs.slice(pStart, pEnd);
    check('patrol body sliced', pEnd > pStart);
    check('patrol routes through fieldFight', /this\.fieldFight\(vid, mdef, m,/.test(patrolSrc));
    check('the flat outcome table is gone', !/fightPower/.test(patrolSrc) && !/R\(200, 600\)/.test(patrolSrc));
    check('no phantom "Game meat" pantry grant', !/stockPantry/.test(patrolSrc));
    check('patrol kills leave a carcass (killCorpse)', /killCorpse\(\)/.test(patrolSrc));
    check('patrol records wave kills', /recordWaveKill\(m\.id\)/.test(patrolSrc));
    // Played: canned vKill through the live router.
    const Game = await H.newCombatReadyGame();
    const v = Game.state.village;
    const vid = (v.roster || [])[1] || (v.roster || [])[0];
    const first = Game.displayName(vid).split(' ')[0];
    const m = Game.spawnWorldMonster('hushwolf', 6, 6, { hp: 40 });
    const corpses0 = Game.corpses().length;
    const origFF = Game.fieldFight;
    Game.fieldFight = () => ({ outcome: 'vKill', rounds: 4, vTaken: 15, mDealt: 120, log: ['rigged'] });
    const origSummary = Game.fieldFightSummary;
    Game.fieldFightSummary = () => 'rigged patrol summary';
    Game.resolvePatrol(vid, first);
    Game.fieldFight = origFF; Game.fieldFightSummary = origSummary;
    const mc = Game.corpses().slice(corpses0).find(c => c.kind === 'monster' && c.monsterId === 'hushwolf');
    check('patrol vKill leaves a carcass with meat', !!mc && (mc.items || []).some(i => i.plantId === 'meat_hushwolf'));
    check('patrol vKill counts toward wave unlocks', ((Game.state.waveKills || {})[1] || 0) >= 1,
      JSON.stringify(Game.state.waveKills));
  }

  // ================= C5/C6: honesty =================
  {
    console.log('C5/C6 wave-3 announcement + disengage copy');
    const gameJs = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
    check('wave unlock checks the data before promising talent', /hasTalent/.test(gameJs));
    const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
    const wave3count = monsters.filter(m => (m.wave || 1) === 3).length;
    check('wave 3 has no monsters (the old line lied)', wave3count === 0);
    check('disengage copy no longer claims the player walked',
      gameJs.includes('It comes apart — no one in reach, no one chasing.'));
    check('old lying line is gone', !gameJs.includes('You walk clear of them. Nothing follows.'));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
