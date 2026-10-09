#!/usr/bin/env node
// BREAK-IT: combat engine — ROUND 1 (2026-10-09). Hostile attacks on the
// tactical combat core (game.js) + field fights (fieldFights.js).
//
// KILLS ATTEMPTED:
//   C1. HONESTY: "You STRIKE <x> for D" states the pre-tbDamage number, but
//       tbDamage applies monster-state modifiers AFTER (turtle bunker x0.15,
//       boar winded x1.5, voice-mimic reveal x1.5, flyer grounded x1.5).
//       Stated D != applied. Copy lies about the number that landed.
//   C2. EXPLOIT: fieldFight vs an ALREADY-DEAD world monster (m.hp<=0 —
//       reachable: a vFlee round can coincide with the lead falling, so the
//       world keeps a 0-hp monster) returns 'vKill' with full cheer, +trust,
//       and a 'hero' deed. Trust/deed farming off a corpse.
//   C3. EXPLOIT: startCombat() mid-fight has NO guard — a second call
//       silently clobbers the live fight (fighters dropped, player HP
//       re-rolled from stale scholar.health, monster wounds erased).
//   C4. DEAD-CODE: contestEngine checks rec.outcome === 'standoff' —
//       fieldFight never returns 'standoff'. Dead branch, stale contract.
//
// HELD (attacked, resisted — documented, not failures):
//   H1. tbEnd double-fire: 'won' twice pays once (f.over guard).
//   H2. Strike on a dead/fled target: refused honestly, turn NOT spent.
//   H3. useAbility with insufficient kcal: refused before payment, nothing paid.
//   H4. Turn economy: one strike per turn (p.acted), abilities with cost.turn
//       spend the action via spendCombatAction.
//
// Usage: node scripts/test-break-combat1-20261009.js
//        BEFORE=1 node scripts/test-break-combat1-20261009.js
//        SEED=99 node scripts/test-break-combat1-20261009.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
const SEED = parseInt(process.env.SEED || '20261009', 10);

const PRE = ['src/js/game.js', 'src/js/fieldFights.js', 'src/js/contestEngine.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/bc1-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/bc1-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seeded BEFORE eval: modules capture Math.random at load

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js touches window at load (browser-only in prod)
// FULL script list in index.html order, minus DOM-only (app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js)
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FILES = [...html.matchAll(/<script src="(src\/js\/[^"]+)\?/g)].map(m => m[1])
  .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
for (const f of FILES) {
  try { eval(srcOf(f)); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window; // drop the stub: combat takes the SYNC advance path without window
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

const says = [];
const audio = [];
function setupFight(monsterId, px, py, mx, my) {
  says.length = 0; audio.length = 0;
  // Close any live fight from a previous block honestly (fled) — the C3
  // guard means startCombat no longer clobbers it for us.
  if (Game.tbfight && !Game.tbfight.over) { try { Game.tbEnd('fled'); } catch (e) { Game.tbfight = null; } }
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = px; s.my = py; s.health = 200;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear', range: 2 } };
  Game.ensureVillagerPositions();
  Game.state.village.roster = []; // no party in these fights
  Game.startCombat(monsterId);
  const mf = Game.tbfight.fighters.find(f => f.kind === 'monster');
  if (mf) { mf.mx = mx; mf.my = my; }
  const pf = Game.tbFighter('p');
  if (pf) { pf.mx = px; pf.my = py; pf.hp = 1000; pf.maxHp = 1000; }
  return mf;
}
const strikeNum = () => {
  for (let i = says.length - 1; i >= 0; i--) {
    const m = String(says[i]).match(/You STRIKE .* for (\d+)/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
};

(async () => {
  await Game.init();
  const osay = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return osay(t); };
  Game.drama = () => {};
  Game.audioEvent = (h) => { audio.push(String(h)); };
  console.log(`seed=${SEED}`);

  // ============ C1. HONESTY: stated strike number vs applied ============
  console.log('\n-- C1. strike number honesty (stated vs applied) --');
  {
    // turtle bunker: x0.15 after the strike line is composed
    const t = setupFight('speedbump_turtle', 4, 4, 5, 4);
    t.turtleBunker = 2; t.turtleBunkered = true; t.bunkerNoted = true; // skip the intro say
    t.hp = 60; t.maxHp = 60;
    const hp0 = t.hp;
    while (!Game.tbIsPlayerTurn()) Game.tbAdvance();
    Game.tbPlayerStrike(t.key);
    const stated = strikeNum();
    const applied = hp0 - t.hp;
    console.log(`   turtle bunker: stated=${stated} applied=${applied}`);
    if (BEFORE) ok('C1a. BEFORE: strike line LIES under bunker', stated !== null && applied !== stated && applied < stated,
      `stated ${stated}, applied ${applied}`);
    else ok('C1a. AFTER: strike line matches applied (bunker)', stated !== null && stated === applied,
      `stated ${stated}, applied ${applied}`);
  }
  {
    // voice mimic reveal: x1.5 after the strike line
    const t = setupFight('voice_mimic_radio', 4, 4, 5, 4);
    t.beamPhase = 'reveal';
    t.hp = 80; t.maxHp = 80;
    const hp0 = t.hp;
    while (!Game.tbIsPlayerTurn()) Game.tbAdvance();
    Game.tbPlayerStrike(t.key);
    const stated = strikeNum();
    const applied = hp0 - t.hp;
    console.log(`   vm reveal: stated=${stated} applied=${applied}`);
    if (BEFORE) ok('C1b. BEFORE: strike line LIES on vm reveal', stated !== null && applied !== stated && applied > stated,
      `stated ${stated}, applied ${applied}`);
    else ok('C1b. AFTER: strike line matches applied (vm reveal)', stated !== null && stated === applied,
      `stated ${stated}, applied ${applied}`);
  }

  // ============ C2. EXPLOIT: fieldFight on an already-dead world monster ============
  console.log('\n-- C2. fieldFight vs already-dead world monster --');
  {
    says.length = 0;
    Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    Game.depart();
    const st = Game.state;
    const vid = (st.village.roster || [])[0];
    const mdef = Game.data.monsters.find(m => m.id === 'bulldozer');
    const m = { id: 'bulldozer', hp: 0, tx: 4, ty: 4 }; // corpse the world kept
    const trust0 = ((st.village.trust || {})[vid] || 0);
    const deeds0 = JSON.stringify(st.village.deeds || []);
    const rec = Game.fieldFight(vid, mdef, m, {});
    console.log(`   fieldFight outcome=${rec.outcome} rounds=${rec.rounds} vTaken=${rec.vTaken} mDealt=${rec.mDealt}`);
    // route it the way the world does
    try { Game.resolveWildMonsterEncounter(vid, m); } catch (e) { console.log('   resolve threw: ' + e.message); }
    const trust1 = ((st.village.trust || {})[vid] || 0);
    const deeds1 = JSON.stringify(st.village.deeds || []);
    if (BEFORE) ok('C2. BEFORE: dead world monster pays vKill rewards', rec.outcome === 'vKill' && (trust1 > trust0 || deeds1 !== deeds0),
      `outcome=${rec.outcome} trust ${trust0}->${trust1} deedsChanged=${deeds1 !== deeds0}`);
    else ok('C2. AFTER: dead world monster pays nothing, honest record', rec.outcome === 'alreadyDead' && trust1 === trust0 && deeds1 === deeds0,
      `outcome=${rec.outcome} trust ${trust0}->${trust1} deedsChanged=${deeds1 !== deeds0}`);
  }

  // ============ C3. EXPLOIT: startCombat mid-fight clobbers the fight ============
  console.log('\n-- C3. startCombat while a fight is live --');
  {
    const t = setupFight('bulldozer', 4, 4, 5, 4);
    t.hp = 5; // nearly dead
    const pf = Game.tbFighter('p');
    pf.hp = 37; pf.maxHp = 1000; // badly wounded
    const fightBefore = Game.tbfight;
    const monsterHpBefore = t.hp;
    Game.startCombat('bulldozer'); // hostile re-entry
    const fightAfter = Game.tbfight;
    const clobbered = fightAfter !== fightBefore;
    const freshMonster = (Game.tbfight.fighters.find(f => f.kind === 'monster') || {}).hp;
    const playerHpAfter = Game.tbFighter('p').hp;
    console.log(`   clobbered=${clobbered} monsterHp ${monsterHpBefore}->${freshMonster} playerHp 37->${playerHpAfter}`);
    if (BEFORE) ok('C3. BEFORE: mid-fight startCombat silently clobbers', clobbered && freshMonster > monsterHpBefore,
      'live fight replaced, wounds erased');
    else ok('C3. AFTER: mid-fight startCombat refused, fight intact', !clobbered && Game.tbFighter('p').hp === 37,
      'fight object identical, wounds kept');
  }

  // ============ C4. DEAD-CODE: contestEngine 'standoff' ============
  console.log('\n-- C4. dead branch: contestEngine standoff --');
  {
    const src = srcOf('src/js/contestEngine.js');
    const hasStandoff = src.includes("'standoff'");
    const ff = srcOf('src/js/fieldFights.js');
    const returnsStandoff = /outcome\s*=\s*['"]standoff['"]/.test(ff);
    if (BEFORE) ok('C4. BEFORE: contestEngine checks an outcome fieldFight never returns', hasStandoff && !returnsStandoff);
    else ok('C4. AFTER: stale standoff reference removed', !hasStandoff, hasStandoff ? 'still present' : '');
  }

  // ============ HELD ============
  console.log('\n-- HELD: tbEnd double-fire --');
  {
    const t = setupFight('bulldozer', 4, 4, 5, 4);
    t.hp = 1;
    const corpses0 = (Game.state.corpses || []).length;
    while (!Game.tbIsPlayerTurn()) Game.tbAdvance();
    Game.tbPlayerStrike(t.key); // kills -> tbEnd('won') via endcheck
    const corpses1 = (Game.state.corpses || []).length;
    const fightRef = Game.tbfight; // null after end
    Game.tbEnd('won'); // hostile double-fire
    const corpses2 = (Game.state.corpses || []).length;
    ok('H1. won pays once even on double tbEnd', corpses1 === corpses0 + 1 && corpses2 === corpses1 && fightRef === null,
      `corpses ${corpses0}->${corpses1}->${corpses2}`);
  }
  console.log('\n-- HELD: strike dead/fled target --');
  {
    const t = setupFight('bulldozer', 4, 4, 5, 4);
    t.alive = false; t.hp = 0;
    while (!Game.tbIsPlayerTurn()) Game.tbAdvance();
    const p = Game.tbFighter('p');
    const r = Game.tbPlayerStrike(t.key);
    ok('H2a. dead target refused, turn not spent', r === false && p.acted === false,
      says.slice(-2).join(' | '));
    t.alive = true; t.hp = 40; t.fled = true;
    const r2 = Game.tbPlayerStrike(t.key);
    ok('H2b. fled target refused, turn not spent', r2 === false && p.acted === false,
      says.slice(-2).join(' | '));
  }
  console.log('\n-- HELD: ability cost honesty --');
  {
    setupFight('bulldozer', 4, 4, 5, 4);
    while (!Game.tbIsPlayerTurn()) Game.tbAdvance();
    Game.state.scholar.kcal = 5;
    // grant a kcal-cost combat ability outright (cost {turn, kcal:40})
    Game.state.scholar.abilities = [{ id: 'haymaker', name: 'Haymaker', level: 1, xp: 0 }];
    {
      const kcal0 = Game.state.scholar.kcal;
      const p = Game.tbFighter('p');
      const r = Game.useAbility('haymaker', 'throw_haymaker');
      ok('H3. insufficient kcal: refused, nothing paid, turn not spent',
        r === false && Game.state.scholar.kcal === kcal0 && p.acted === false,
        `kcal ${kcal0}->${Game.state.scholar.kcal} acted=${p.acted}`);
      // and with enough kcal it pays exactly 40 and spends the turn
      Game.state.scholar.kcal = 100;
      const r2 = Game.useAbility('haymaker', 'throw_haymaker');
      ok('H3b. sufficient kcal: paid exactly, turn spent',
        r2 === true && Game.state.scholar.kcal === 60 && p.acted === true,
        `kcal 100->${Game.state.scholar.kcal} acted=${p.acted}`);
    }
  }
  console.log('\n-- HELD: one strike per turn --');
  {
    const t = setupFight('bulldozer', 4, 4, 5, 4);
    t.hp = 500; t.maxHp = 500; // survive even a Patient-Aim doubled opener
    while (!Game.tbIsPlayerTurn()) Game.tbAdvance();
    const r1 = Game.tbPlayerStrike(t.key);
    const p = Game.tbFighter('p');
    const r2 = p ? Game.tbPlayerStrike(t.key) : 'NOFIGHT';
    ok('H4. second strike same turn refused', r1 === true && p && p.acted === true && r2 === false);
  }

  // ============ C5. DEAD-CODE + MOVEMENT: 2x2 self-body paralysis ============
  console.log('\n-- C5. multi-tile movement: 2x2 step E/S/SE vs own body --');
  {
    const t = setupFight('bulldozer', 6, 4, 3, 4); // 2x2 body at (3,4), player due east
    const src = srcOf('src/js/game.js');
    const usesFootprint = src.includes('const blocked = (x, y) => !this.tbCanOccupy(m, x, y);');
    // The east step target (4,4) is open terrain but inside the mover's own
    // current 2x2 footprint.
    const terrainOpen = !Game.tbBlocked(4, 4) || true;
    const oldFormBlocked = Game.tbBlocked(4, 4) && !(4 === t.mx && 4 === t.my);
    const newFormBlocked = !Game.tbCanOccupy(t, 4, 4);
    const S = globalThis.Scattering;
    // Behavior through the real engine stepper with each callback form:
    const stOld = S.combat.stepToward(t.mx, t.my, 6, 4,
      (x, y) => Game.tbBlocked(x, y) && !(x === t.mx && y === t.my));
    const stNew = S.combat.stepToward(t.mx, t.my, 6, 4,
      (x, y) => !Game.tbCanOccupy(t, x, y));
    console.log(`   footprint-callback in engine: ${usesFootprint}; east target old-form blocked=${oldFormBlocked} new-form blocked=${newFormBlocked}`);
    console.log(`   stepToward east: old-form -> ${stOld ? stOld.x + ',' + stOld.y : 'null'}, new-form -> ${stNew ? stNew.x + ',' + stNew.y : 'null'}`);
    if (BEFORE) ok('C5. BEFORE: 2x2 bulldozer cannot step E (own body blocks)',
      usesFootprint === false && oldFormBlocked === true,
      'E/S/SE paralyzed; tbMoveFighter (the validated move) has zero callers');
    else ok('C5. AFTER: footprint-validated steps, eastward step permitted',
      usesFootprint === true && newFormBlocked === false);
    // dead-code verdict on tbMoveFighter
    const defPresent = /tbMoveFighter\(f, nx, ny\) \{/.test(src);
    const anyCalls = /this\.tbMoveFighter\(/.test(src);
    if (BEFORE) ok('C5b. BEFORE: tbMoveFighter is dead code (defined, zero callers)', defPresent && !anyCalls);
    else ok('C5b. AFTER: dead tbMoveFighter removed, contract lives in callbacks', !defPresent && !anyCalls);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL: ' + (e && e.stack || e)); process.exit(2); });
