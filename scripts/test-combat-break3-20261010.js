#!/usr/bin/env node
// Break-it combat-engine r3 proof tests, 2026-10-10 (target 0, fresh angles).
// r2 covered: attack-less crashes, leech/fightDamageTaken, feastBurn
// one-burn integrity, dead_aim double-advance, snake split, stat caps,
// refused-ability XP. This run attacks fresh surface:
//
//  E1 XP ECONOMY: is there a kill-XP or per-target double-count anywhere?
//     (The engine grants practice per ACTION — strike/dodge — never per
//     kill. Probe: a killing strike grants exactly one action's practice,
//     and no player damage path hits N targets per action.)
//  E2 FRIENDLY FIRE: strike refuses villagers (honest); gristlefit lash can
//     still kill a villager — socially recorded, no XP faucet; mid-fight
//     corpse looting is refused at the engine level (_cellInteract).
//  H1 VILLAGER HAYMAKER HONESTY (THE CATCH): the announced "(HAYMAKER! (d))"
//     number was the pre-mitigation swing; tbDamage then applies armor/
//     bunker and prints its own "hits X for Y" — vs a bunkered turtle the
//     two lines contradicted (announced 12, landed 2). Fix: announce what
//     LANDED, after tbDamage, same convention as the player strike line
//     (break-it combat r8 2026-10-09).
//  S1 TURN ECONOMY: stunned monsters skip cleanly (no double-turn); player
//     death mid-fight + second_wind resumes the SAME fight with no turn
//     duplication; the fight object is nulled by tbEnd's finally (no
//     phantom state into the new life).
//  H2 CRIT HONESTY: DEAD AIM's "x2.5" — the stated STRIKE number equals the
//     HP actually removed.
//
// Run: node scripts/test-combat-break3-20261010.js   (SEED env override)
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

// ---------- seeded RNG (modules capture Math.random at load) ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261010', 10);
Math.random = mulberry32(SEED);

// ---------- boot the full engine ----------
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"]*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: { classList: { remove() {} } } };
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window;
const Game = globalThis.Scattering.Game;
const S = globalThis.Scattering;

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  let said = [];
  Game.say = (m) => { said.push(String(m)); };
  Game.sysSay = (m) => { said.push(String(m)); };
  Game.audioEvent = () => {};
  try { Game.drama = () => {}; } catch (e) {}

  const mdefById = (id) => (Game.data.monsters || []).find(m => m.id === id) || {};
  const mkF = (key, kind, extra) => Object.assign(
    { key, kind, alive: true, fled: false, hp: 100, maxHp: 100, mx: 4, my: 4, speed: 3, moveLeft: 3, acted: false },
    extra || {});
  const clearSaid = () => { said = []; };

  // ================= EXPLOIT E1: no kill-XP, no per-target double-count =================
  console.log('\n[exploit] E1: the XP economy — practice per action, never per kill');
  {
    const s = Game.state.scholar;
    s.stats = { str: 5, end: 5, per: 5, agi: 5, pre: 5 };
    s.practice = {};
    const p = mkF('p', 'player');
    const m1 = mkF('m1', 'monster', { mdef: mdefById('hushwolf'), hp: 1, maxHp: 40, name: 'wolf' });
    Game.tbfight = { fighters: [p, m1], order: ['p', 'm1'], turnIdx: 0, round: 1, over: false };
    // wrap tbEnd to keep the harness fight object readable after the win
    let endResult = null;
    const realTbEnd = Game.tbEnd;
    Game.tbEnd = function (r) { endResult = r; return realTbEnd.call(this, r); };
    clearSaid();
    const r = Game.tbPlayerStrike('m1');
    Game.tbEnd = realTbEnd;
    ok(r === true, 'killing strike executes');
    ok(endResult === 'won', 'fight ends won after the kill (got ' + endResult + ')');
    ok((s.practice.str || 0) === 1 && (s.practice.agi || 0) === 1,
      'one action = exactly 1 str + 1 agi practice, no kill bonus (got str=' + (s.practice.str || 0) + ' agi=' + (s.practice.agi || 0) + ')');
    // Whiff branches grant nothing: the haymaker-whiff path returns before practice().
    s.practice = {};
    const p2 = mkF('p', 'player');
    const m2 = mkF('m1', 'monster', { mdef: mdefById('hushwolf'), hp: 500, maxHp: 500, name: 'wolf' });
    Game.tbfight = { fighters: [p2, m2], order: ['p', 'm1'], turnIdx: 0, round: 1, over: false };
    Game.state.scholar.haymakerReady = { accPenalty: 1.0 }; // always whiffs
    Game.tbPlayerStrike('m1');
    delete Game.state.scholar.haymakerReady;
    ok((s.practice.str || 0) === 0 && (s.practice.agi || 0) === 0,
      'a whiffed haymaker grants zero practice (turn spent, nothing learned)');
    Game.tbfight = null;
    // Structural: the only player-driven multi-fighter damage is the
    // gristlefit lash, and it hits exactly ONE random other fighter.
    const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
    const strikeSrc = src.slice(src.indexOf('    tbPlayerStrike(targetKey) {'), src.indexOf('    tbPlayerStrike(targetKey) {') + 22000);
    const dmgCalls = (strikeSrc.match(/this\.tbDamage\(/g) || []).length;
    ok(dmgCalls === 2, 'tbPlayerStrike issues exactly 2 tbDamage calls (the strike + the single-target lash), got ' + dmgCalls);
  }

  // ================= EXPLOIT E2: friendly fire =================
  console.log('\n[exploit] E2: friendly fire — refused, punished, no XP faucet');
  {
    // (a) a deliberate strike at a villager is refused, honestly, with no damage
    const p = mkF('p', 'player');
    const v = mkF('v1', 'villager', { name: 'Mara', villagerId: 'v_ff1', hp: 60, maxHp: 60 });
    const m1 = mkF('m1', 'monster', { mdef: mdefById('hushwolf'), hp: 40, maxHp: 40, name: 'wolf' });
    Game.tbfight = { fighters: [p, v, m1], order: ['p', 'v1', 'm1'], turnIdx: 0, round: 1, over: false };
    clearSaid();
    const r = Game.tbPlayerStrike('v1');
    ok(r === false, 'strike at a villager is refused (not a silent no-op, not damage)');
    ok(v.hp === 60, 'villager HP untouched (' + v.hp + ')');
    ok(said.some(l => /betrayal/i.test(l)), 'refusal names it betrayal: "' + (said.find(l => /betrayal/i.test(l)) || '').slice(0, 80) + '"');
    // (b) the involuntary lash CAN kill a villager — socially recorded, no XP
    const s = Game.state.scholar;
    s.practice = {};
    const trustBefore = (Game.state.village.trust || {}).v_ff1 || 10;
    Game.tbDamage('v1', 999, 'your gristlefit', 'p', { quiet: true });
    ok(!v.alive, 'lash-scale damage can drop a villager (the risk is real)');
    ok((s.practice.str || 0) === 0 && (s.practice.agi || 0) === 0,
      'no practice/XP from the villager kill — kills pay nothing, ever');
    const corpse = (Game.state.corpses || []).find(c => c.villagerId === 'v_ff1');
    ok(!!corpse, 'the villager death registers a real corpse (lootable, buriable — the world keeps the record)');
    Game.tbfight = null;
    // (c) mid-fight corpse interaction is refused at the engine level
    const p3 = mkF('p', 'player');
    Game.tbfight = { fighters: [p3], order: ['p'], turnIdx: 0, round: 1, over: false };
    Game.over = false;
    clearSaid();
    const inter = Game._cellInteract(4, 4);
    ok(inter === null, '_cellInteract mid-fight returns null (no free interacts)');
    ok(said.some(l => /Not mid-fight/i.test(l)), 'refusal is loud, not silent');
    Game.tbfight = null;
  }

  // ================= HONESTY H1: villager haymaker announced == landed =================
  console.log('\n[honesty] H1: villager haymaker states the number that landed');
  {
    // Drive the real tbVillagerTurn with a scripted strike decision: every
    // third swing is the haymaker, into a BUNKERED turtle (x0.15) so the
    // announced-vs-landed gap is unmistakable pre-fix.
    const realDecide = S.combat.villagerDecide;
    S.combat.villagerDecide = () => ({ moves: [], action: { type: 'strike', target: 'm1' } });
    const realNHA = Game.npcHasAbility;
    Game.npcHasAbility = () => true; // villager holds haymaker
    const p = mkF('p', 'player');
    const v = mkF('v1', 'villager', { name: 'Mara', villagerId: 'v_hm1', wbonus: 0 });
    v._haymakerSwings = 2; // next strike is the 3rd: haymaker
    const m1 = mkF('m1', 'monster', { mdef: mdefById('speedbump_turtle'), hp: 500, maxHp: 500, name: 'turtle', turtleBunker: 2 });
    Game.tbfight = { fighters: [p, v, m1], order: ['p', 'v1', 'm1'], turnIdx: 1, round: 4, over: false };
    clearSaid();
    const hpBefore = m1.hp;
    try { Game.tbVillagerTurn(v); }
    finally { S.combat.villagerDecide = realDecide; Game.npcHasAbility = realNHA; }
    const landed = hpBefore - m1.hp;
    const hmLine = said.find(l => /HAYMAKER!/i.test(l)) || '';
    const hitLine = said.find(l => /hits .* for \d+/.test(l)) || '';
    const announced = (hmLine.match(/\((\d+)\)/) || [])[1];
    const hitNum = (hitLine.match(/for (\d+)/) || [])[1];
    console.log('    haymaker line: ' + hmLine.slice(0, 90));
    console.log('    damage line:   ' + hitLine.slice(0, 90));
    ok(announced != null && hitNum != null, 'both the haymaker line and the damage line rendered (announced=' + announced + ', hit=' + hitNum + ')');
    ok(announced === hitNum, 'haymaker announces the LANDED number (announced ' + announced + ', landed ' + hitNum + ')');
    ok(landed < 10, 'sanity: the bunker really did blunt it (landed ' + landed + ' — the gap the old code hid)');
    Game.tbfight = null;
  }

  // ================= HONESTY H2: DEAD AIM x2.5 is what lands =================
  console.log('\n[honesty] H2: DEAD AIM critical — the STRIKE line states what the crit removed');
  {
    const p = mkF('p', 'player');
    p.aimed = true; // dead-aim armed, next strike crits
    const m1 = mkF('m1', 'monster', { mdef: mdefById('hushwolf'), hp: 500, maxHp: 500, name: 'wolf', mx: 5, my: 4 });
    Game.tbfight = { fighters: [p, m1], order: ['p', 'm1'], turnIdx: 0, round: 2, over: false };
    clearSaid();
    Game.tbPlayerStrike('m1');
    const hpBefore = 500, removed = hpBefore - m1.hp;
    const strikeLine = said.find(l => /You STRIKE .* for \d+/.test(l)) || '';
    const shown = (strikeLine.match(/for (\d+)/) || [])[1];
    ok(/DEAD AIM: patience, then thunder\. Critical/.test(said.join(' ')), 'crit is announced as x2.5');
    ok(shown != null && Number(shown) === removed,
      'STRIKE line states the crit damage that actually landed (shown ' + shown + ', removed ' + removed + ')');
    ok(p.aimed === false, 'the aim is consumed by the shot (no lingering crit)');
    Game.tbfight = null;
  }

  // ================= SOFTLOCK S1: turn economy =================
  console.log('\n[softlock] S1: turn economy — stuns skip cleanly, death+second_wind resumes without duplication');
  {
    // (a) stunned monster: loses the turn, nothing else happens
    const p = mkF('p', 'player', { hp: 80, maxHp: 100 });
    const m1 = mkF('m1', 'monster', { mdef: mdefById('hushwolf'), hp: 40, maxHp: 40, name: 'wolf', mx: 6, my: 4, stunned: 1 });
    Game.tbfight = { fighters: [p, m1], order: ['p', 'm1'], turnIdx: 1, round: 2, over: false };
    const mx0 = m1.mx, my0 = m1.my;
    Game.tbMonsterTurn(m1);
    ok(m1.stunned === 0, 'stun consumed exactly once (' + m1.stunned + ' left)');
    ok(p.hp === 80, 'stunned monster deals no damage (' + p.hp + ')');
    ok(m1.mx === mx0 && m1.my === my0, 'stunned monster does not move');
    ok(!m1.telegraph, 'stunned monster declares no telegraph');
    Game.tbfight = null;
    // (b) player dies mid-fight holding second_wind: the SAME fight resumes
    const s = Game.state.scholar;
    s.abilities = (s.abilities || []).concat([{ id: 'second_wind', name: 'Second Wind', level: 1, xp: 0 }]);
    s.health = 0; s.kcal = 100; s.day = s.day || 1;
    s.secondWindDay = -1; s.secondWindUses = 0;
    const p2 = mkF('p', 'player', { hp: 0, maxHp: 100, alive: false });
    const m2 = mkF('m1', 'monster', { mdef: mdefById('hushwolf'), hp: 40, maxHp: 40, name: 'wolf' });
    Game.tbfight = { fighters: [p2, m2], order: ['p', 'm1'], turnIdx: 1, round: 3, over: false };
    clearSaid();
    const cont = Game.tbEndCheck();
    ok(cont === false, 'tbEndCheck does NOT end the fight — second_wind refuses death');
    ok(p2.alive === true && p2.hp === 1, 'player fighter restored to 1 HP in the same fight (hp=' + p2.hp + ')');
    ok(Game.tbfight && !Game.tbfight.over, 'fight object intact — no phantom cleanup, no new fight spawned');
    ok(said.some(l => /SECOND WIND/i.test(l)), 'the refusal is narrated, not silent');
    // the second death the same day sticks: no double-refuse
    p2.hp = 0; p2.alive = false; s.health = 0;
    let endResult2 = null;
    const realTbEnd2 = Game.tbEnd;
    Game.tbEnd = function (r) { endResult2 = r; return realTbEnd2.call(this, r); };
    const realPD = Game.playerDeath;
    let pdCalled = false;
    Game.playerDeath = function (c) { pdCalled = true; };
    try { Game.tbEndCheck(); } finally { Game.tbEnd = realTbEnd2; Game.playerDeath = realPD; }
    ok(endResult2 === 'lost' && pdCalled, 'second death same day: fight ends lost, playerDeath runs (no free second refuse)');
    Game.tbfight = null;
  }

  // ================= HONESTY H3: sibling sweep — monster AoE fiction lines =================
  console.log('\n[honesty] H3: sibling sweep — antler thrash + recharge paw no longer pre-announce the roll');
  {
    // tbAntlerThrash (gallowdeer): fiction line must carry no number; the
    // landed number comes from tbDamage's own line and must equal HP removed.
    const p = mkF('p', 'player', { hp: 100, maxHp: 100, mx: 4, my: 4 });
    const m = mkF('m1', 'monster', { mdef: mdefById('gallowdeer'), monsterId: 'gallowdeer', name: 'deer', mx: 5, my: 4 });
    Game.tbfight = { fighters: [p, m], order: ['p', 'm1'], turnIdx: 1, round: 2, over: false };
    clearSaid();
    const hp0 = p.hp;
    const hit = Game.tbAntlerThrash(m);
    const removed = hp0 - p.hp;
    const fiction = said.find(l => /price\./.test(l)) || '';
    const dmgLine = said.find(l => /hits you for \d+/.test(l)) || '';
    const dmgShown = (dmgLine.match(/for (\d+)/) || [])[1];
    ok(hit === true, 'antler thrash fires when adjacent');
    ok(!/\(\d+\)/.test(fiction), 'fiction line carries no pre-mitigation number ("' + fiction.slice(0, 70) + '")');
    ok(dmgShown != null && Number(dmgShown) === removed,
      'tbDamage line states the landed number (shown ' + dmgShown + ', removed ' + removed + ')');
    Game.tbfight = null;
    // tbRechargePaw ("the breather"): same class, same fix.
    const p2 = mkF('p', 'player', { hp: 100, maxHp: 100, mx: 4, my: 4 });
    const m2 = mkF('m1', 'monster', { mdef: mdefById('hushwolf'), name: 'the breather', mx: 5, my: 4 });
    Game.tbfight = { fighters: [p2, m2], order: ['p', 'm1'], turnIdx: 1, round: 2, over: false };
    clearSaid();
    const hp02 = p2.hp;
    const hit2 = Game.tbRechargePaw(m2);
    const removed2 = hp02 - p2.hp;
    const fiction2 = said.find(l => /breather isn't free/.test(l)) || '';
    const dmgLine2 = said.find(l => /hits you for \d+/.test(l)) || '';
    const dmgShown2 = (dmgLine2.match(/for (\d+)/) || [])[1];
    ok(hit2 === true, 'recharge paw fires when adjacent');
    ok(!/\(\d+\)/.test(fiction2), 'fiction line carries no pre-mitigation number');
    ok(dmgShown2 != null && Number(dmgShown2) === removed2,
      'tbDamage line states the landed number (shown ' + dmgShown2 + ', removed ' + removed2 + ')');
    Game.tbfight = null;
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed (seed ' + SEED + ')');
  if (failures.length) { console.log('FAILURES:\n - ' + failures.join('\n - ')); process.exit(1); }
})();
