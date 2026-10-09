#!/usr/bin/env node
// BRAWLER HOSTILE RUN 7 — 2026-10-09 (rotation idx 4).
// Hostile question set, new angles vs r6 (r6 covered: gristlefit lash,
// silent strike refusal, intimidation farm, practice grind, betrayal yield,
// strike-number honesty).
//  1. EXPLOIT: does ability activation in combat spend the turn at ENGINE
//     level? (The live UI wrapper calls tbPlayerActed(), but useAbility /
//     activateAbility themselves don't — any other caller gets free actions.)
//  2. HONESTY: "Armor absorbs N" (r6 fix) vs the 2026-10-09 diminishing-
//     returns curve — stated == applied, player AND villager blocks, and
//     the at-least-1-lands floor at high protection.
//  3. SOFTLOCK: moderator mute — can strike AND move ever both be muted?
//  4. EXPLOIT: tbEnd('routed') — no meat, no trophy, no codex 'slain'?
// Usage: node scripts/test-brawler-hostile-r7-20261009.js (SEED env override)
const H = require('./combat-break-harness.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function note(t) { console.log('  note ' + t); }

(async () => {
  const Game = await H.newCombatReadyGame();
  const s = Game.state.scholar;
  const lines = [];
  const osay = Game.say.bind(Game);
  Game.say = (t) => { lines.push(String(t)); return osay(t); };
  const clearLines = () => lines.splice(0);

  // ============ SECTION 1: ability activation spends the combat turn ======
  // ATTACK: the live UI (app.js) calls tbPlayerActed() after activateAbility,
  // but the ENGINE entry points don't. Call them directly, as any future
  // (or forgotten) caller would — a successful activation that leaves
  // p.acted=false is a free action: free heals/buffs every round.
  {
    // grant haymaker (data-driven, fires unconditionally, returns true)
    s.abilities = s.abilities || [];
    if (!s.abilities.find(a => a.id === 'haymaker'))
      s.abilities.push({ id: 'haymaker', name: 'Haymaker', desc: 'x', level: 1, xp: 0 });
    const mk = H.synthFight(Game, 'hushwolf', { php: 100, mhp: 500 });
    const f = Game.tbfight;
    const setPlayerTurn = () => {
      const p = Game.tbFighter('p');
      p.acted = false; p.moveLeft = 3;
      f.turnIdx = Math.max(0, f.order.indexOf('p'));
      return p;
    };
    // 1a: useAbility (data-driven entry)
    let p = setPlayerTurn();
    clearLines();
    let r1 = null;
    try { r1 = Game.useAbility('haymaker', 'throw_haymaker'); } catch (e) { r1 = 'threw:' + e.message; }
    const acted1 = Game.tbFighter('p').acted;
    note(`1a useAbility('haymaker','throw_haymaker') -> ${r1}, p.acted=${acted1}, haymakerReady=${!!s.haymakerReady}`);
    check('1a data-driven ability use in combat spends the turn', r1 !== false && acted1 === true,
      `activation fired (${r1}) but p.acted=${acted1} — free action at engine level`);
    try { Game.tbEnd && Game.tbEnd('fled'); } catch (e) {}
    // 1b: activateAbility (legacy entry, composite id routes to useAbility)
    H.synthFight(Game, 'hushwolf', { php: 100, mhp: 500 });
    p = setPlayerTurn();
    delete s.haymakerReady;
    clearLines();
    let r2 = null;
    try { r2 = Game.activateAbility('haymaker.throw_haymaker'); } catch (e) { r2 = 'threw:' + e.message; }
    const acted2 = Game.tbFighter('p').acted;
    note(`1b activateAbility('haymaker.throw_haymaker') -> ${r2}, p.acted=${acted2}`);
    check('1b legacy entry-point ability use in combat spends the turn', acted2 === true,
      `p.acted=${acted2} — free action at engine level`);
    try { Game.tbEnd && Game.tbEnd('fled'); } catch (e) {}
    // 1c: a REFUSED activation must NOT spend the turn (honesty — nothing
    // happened, nothing spent). second_wind.refuse_death refuses when alive.
    s.abilities.push({ id: 'second_wind', name: 'Second Wind', desc: 'x', level: 1, xp: 0 });
    H.synthFight(Game, 'hushwolf', { php: 100, mhp: 500 });
    p = setPlayerTurn();
    clearLines();
    let r3 = null;
    try { r3 = Game.useAbility('second_wind', 'refuse_death'); } catch (e) { r3 = 'threw:' + e.message; }
    const acted3 = Game.tbFighter('p').acted;
    note(`1c refused activation -> ${r3}, p.acted=${acted3}`);
    check('1c refused activation does NOT spend the turn', r3 === false && acted3 === false,
      `result=${r3}, p.acted=${acted3}`);
    try { Game.tbEnd && Game.tbEnd('fled'); } catch (e) {}
  }

  // ============ SECTION 2: armor absorb honesty ============================
  // ATTACK: "Armor absorbs N" — is N the real reduction under the 2026-10-09
  // curve (r = P/(P+20), absorb = min(hit-1, round(hit*r)))? Player block,
  // villager block, and the no-immunity floor.
  {
    const mk = H.synthFight(Game, 'hushwolf', { php: 200, mhp: 500 });
    const f = Game.tbfight;
    const m = f.fightersByKey[mk];
    m.mx = 5; m.my = 4;
    const origArmor = Game.armorBonus.bind(Game);
    const hitPlayer = (prot, dmg) => {
      Game.armorBonus = () => prot;
      const p = Game.tbFighter('p');
      p.hp = 500;
      clearLines();
      Game.tbDamage('p', dmg, 'test claws', mk);
      const said = lines.find(l => l.includes('Armor absorbs'));
      const absorbed = said ? parseInt(said.match(/absorbs (\d+)/)[1], 10) : null;
      return { hpAfter: p.hp, absorbed, said: !!said };
    };
    // 2a: prot 20, hit 20 -> r=0.5, absorb=min(19, round(10))=10, final 10
    let r = hitPlayer(20, 20);
    note(`2a prot=20 hit=20 -> absorbed=${r.absorbed}, hp 500->${r.hpAfter}`);
    check('2a stated absorb == applied (prot 20, hit 20)', r.absorbed === 10 && r.hpAfter === 490,
      `absorbed=${r.absorbed} hpAfter=${r.hpAfter}`);
    // 2b: no-immunity floor — prot 100, hit 3 -> absorb=min(2, round(3*.833)=round(2.5)=3)=2, final 1
    r = hitPlayer(100, 3);
    note(`2b prot=100 hit=3 -> absorbed=${r.absorbed}, hp 500->${r.hpAfter}`);
    check('2b at least 1 always lands (prot 100, hit 3)', r.absorbed === 2 && r.hpAfter === 499,
      `absorbed=${r.absorbed} hpAfter=${r.hpAfter}`);
    // 2c: villager block — varmor 20, hit 20 -> same curve
    const ally = { key: 'v_ally', kind: 'villager', villagerId: 'x', name: 'Ally',
      emoji: '🧍', hp: 500, maxHp: 500, speed: 3, mx: 5, my: 5, alive: true, fled: false, varmor: 20 };
    f.fighters.push(ally); f.fightersByKey['v_ally'] = ally;
    clearLines();
    Game.tbDamage('v_ally', 20, 'test claws', mk);
    const vsaid = lines.find(l => l.includes('absorbs'));
    const vabs = vsaid ? parseInt(vsaid.match(/absorbs (\d+)/)[1], 10) : null;
    note(`2c villager varmor=20 hit=20 -> absorbed=${vabs}, hp 500->${ally.hp}`);
    check('2c villager armor uses the same curve, stated == applied', vabs === 10 && ally.hp === 490,
      `absorbed=${vabs} hp=${ally.hp}`);
    Game.armorBonus = origArmor;
    try { Game.tbEnd && Game.tbEnd('fled'); } catch (e) {}
  }

  // ============ SECTION 3: moderator mute softlock =========================
  // ATTACK: can the moderator ever mute strike AND move together (no damage
  // path, no escape — a lock, not a trick)?
  {
    H.synthFight(Game, 'hushwolf', { php: 100, mhp: 500 });
    const f = Game.tbfight;
    f.modRecent = ['strike', 'strike', 'move', 'strike', 'move'];
    const top1 = Game.modTopVerbs(1);
    const top2 = Game.modTopVerbs(2);
    note(`3.0 modTopVerbs(1)=[${top1}] modTopVerbs(2)=[${top2}] after strike-heavy history`);
    check('3.1 mute selection never names more than one verb', top1.length <= 1, `got [${top1}]`);
    check('3.2 wait is never a mute candidate', !top2.includes('wait') && !top1.includes('wait'),
      `wait in candidates [${top2}]`);
    // Even with strike "muted", move + wait keep the fight winnable.
    const m = f.fightersByKey[Object.keys(f.fightersByKey).find(k => k !== 'p')];
    m.modMuted = ['strike']; m.beamPhase = 'muting'; m.modFieldSet = new Set(['4,4']);
    const origLive = Game.modLive; Game.modLive = () => m;
    const origFifo = Game.encUsesFifo; Game.encUsesFifo = () => true;
    const p = Game.tbFighter('p'); p.acted = false; p.moveLeft = 3; p.mx = 4; p.my = 4;
    f.turnIdx = Math.max(0, f.order.indexOf('p'));
    const blockedStrike = Game.modVerbBlocked('strike');
    const blockedMove = Game.modVerbBlocked('move');
    note(`3.3 modMuted=['strike']: strike blocked=${blockedStrike}, move blocked=${blockedMove}`);
    check('3.3 muting strike never mutes move', blockedStrike === true && blockedMove === false,
      `strike=${blockedStrike} move=${blockedMove}`);
    // wait is not gated by modVerbBlocked at all — always available
    p.acted = false; p.moveLeft = 0;
    const w0 = f.round;
    let wret = null;
    try { wret = Game.tbPlayerWait(); } catch (e) { wret = 'threw:' + e.message; }
    note(`3.4 tbPlayerWait with strike muted -> ${wret}`);
    check('3.4 wait always works under a mute (the flip escape)', wret === true, `returned ${wret}`);
    Game.modLive = origLive; Game.encUsesFifo = origFifo;
    try { Game.tbEnd && Game.tbEnd('fled'); } catch (e) {}
  }

  // ============ SECTION 4: routed pays nothing ==============================
  // ATTACK: route the monster (it flees, you don't kill it) — any carcass,
  // loot, or codex 'slain' would contradict "no meat, no trophy".
  {
    const mk = H.synthFight(Game, 'hushwolf', { php: 100, mhp: 50 });
    const f = Game.tbfight;
    const corpses0 = (Game.state.corpses || []).length;
    const inv0 = s.inventory.length;
    Game.state.codex.monsters = Game.state.codex.monsters || {};
    delete Game.state.codex.monsters['hushwolf'];
    f.fightersByKey[mk].fled = true; // monster routes
    clearLines();
    try { Game.tbEnd('routed'); } catch (e) { note('4.x tbEnd threw: ' + e.message); }
    const corpses1 = (Game.state.corpses || []).length;
    const inv1 = s.inventory.length;
    const stage = (Game.state.codex.monsters['hushwolf'] || {}).stage;
    const meatLine = lines.some(l => /meat|trophy|carcass/i.test(l) && !/no meat/i.test(l));
    note(`4.0 routed: corpses ${corpses0}->${corpses1}, inv ${inv0}->${inv1}, codex stage=${stage}`);
    check('4.1 routed creates no corpse', corpses1 === corpses0, `${corpses0}->${corpses1}`);
    check('4.2 routed grants no loot/meat to inventory', inv1 === inv0, `${inv0}->${inv1}`);
    check('4.3 routed does not mark species slain', stage !== 'slain', `stage=${stage}`);
    check('4.4 routed narration promises no rewards', lines.some(l => /No meat, no trophy/i.test(l)),
      'missing the honest line');
  }

  // ============ SECTION 5: disengage is a rout, not a player flee ==========
  // ATTACK (from the kiting audit): walking away from a turtle (follows:false)
  // disengaged the fight — but the old code marked the PLAYER fled, routing
  // to tbEnd('fled') and its "Coward's move" witness line for a retreat
  // nobody made. Fixed: disengaging monsters are marked fled -> 'routed'.
  {
    const mk = H.synthFight(Game, 'speedbump_turtle', { php: 100, mhp: 60 });
    const f = Game.tbfight;
    const t = Game.tbFighter(mk);
    const p = Game.tbFighter('p');
    t.mx = 6; t.my = 4; p.mx = 1; p.my = 1; // 5 tiles apart, turtle can't chase
    clearLines();
    const ended = Game.tbEndCheck();
    note(`5.0 disengage: ended=${ended} result=${f.result} p.fled=${p.fled} monster.fled=${t.fled}`);
    check('5.1 walking away from a non-chaser disengages the fight', ended && f.over,
      'fight still going');
    check('5.2 disengage routes to routed (not fled)', f.result === 'routed',
      `result=${f.result}`);
    check('5.3 the player is NOT marked fled', p.fled !== true, `p.fled=${p.fled}`);
    check('5.4 the disengaging monster is marked fled', t.fled === true, `t.fled=${t.fled}`);
    check('5.5 no cowardice witness line for a retreat nobody made',
      !lines.some(l => /coward/i.test(l)), 'found: ' + lines.find(l => /coward/i.test(l)));
    check('5.6 routed aftermath promises no rewards',
      lines.some(l => /No meat, no trophy/i.test(l)), 'missing the honest line');
  }

  console.log(`\nRESULT: ${pass} ok, ${fail} FAIL (seed ${H.SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FATAL:', e); process.exit(2); });
