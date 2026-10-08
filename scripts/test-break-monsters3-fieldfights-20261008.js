#!/usr/bin/env node
// Proof: FIELD-FIGHTS round 3 (2026-10-08, break-it monsters).
// Three catches in the brand-new real-fights engine (f06255f/abd802f):
//
// CATCH 1 (EXPLOIT+HONESTY): fight wounds were silently DROPPED on wins.
//   resolveWildMonsterEncounter and expeditionMonster applied rec.vTaken
//   only on vFlee/vDie. On vKill/mFlee the villager walked away at FULL
//   health while the gossip/deeds announced "44 taken" — copy lied, and a
//   strong villager could chain fights forever at zero attrition, farming
//   trust (+4/+2) and bravery XP for free. Now every outcome pays the
//   fight's real price through hurtVillager (non-lethal by construction:
//   vTaken < starting HP whenever the outcome isn't vDie).
//
// CATCH 2 (HONESTY, engine): the pack never broke when the lead fell.
//   fieldFight promoted members[1] to a second lead and kept fighting —
//   contradicting the module doc ("the pack dies/scatters with it"), the
//   data (hushwolf weakness "broken coordination (wound the lead)"), and
//   the tactical engine ("without the lead, the pack melts away"). Worse,
//   m.hp persistence then wrote the DEAD lead's 0 HP onto the live world
//   entity while phantom pack members kept fighting it — a 0-HP zombie
//   leading fresh-rolled fighters. Now: lead falls -> vKill, pack broken.
//
// CATCH 3 (DEAD-CODE): 'standoff' was an unreachable outcome — the round
//   cap always resolves to vFlee/mFlee — but three sites still branched on
//   it (summary + both callers). Removed.
//
// Seeded deterministic (mulberry32, SEED env override). Loader parses
// index.html script order so it always matches production load order.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261008', 10);

function loadAll() {
  delete globalThis.Scattering;
  Math.random = mulberry32(SEED);
  global.window = global;
  global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
  global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const files = [...html.matchAll(/<script src="([^"]+)"/g)]
    .map(m => m[1].split('?')[0])
    .filter(f => f.startsWith('src/js/'))
    .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
  for (const f of files) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  delete global.window;
  return globalThis.Scattering.Game;
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function cannedRec(outcome, vTaken) {
  return { outcome, rounds: 3, vTaken, mDealt: 40, vHpLeft: 100 - vTaken, mHpLeft: outcome === 'vKill' ? 0 : 12, packCount: 1, log: ['R1: test'] };
}

(async () => {
  const Game = loadAll();
  await Game.init();
  Game.genRoster('Breaker3');
  const rid = Game.generatedRoster[0].id;
  Game.newGame('Breaker3', null, rid);
  Game.depart();
  const v = Game.state.village;
  const npcIds = (v.roster || []).filter(id => id !== Game.villagerId);
  const vid = npcIds[0];
  v.health = v.health || {};
  const origSay = Game.say; Game.say = () => {};
  const byId = {}; for (const m of (Game.data.monsters || [])) byId[m.id] = m;

  console.log('== 1. wounds applied on WINS (game.js router) ==');
  {
    // world-monster entity on a tile; stub fieldFight to return a canned WIN
    const m = { id: 'bulldozer', tx: 3, ty: 3, hp: 50, maxHp: 55 };
    Game.worldMonsters().push(m);
    const realFF = Game.fieldFight;
    Game.fieldFight = () => cannedRec('vKill', 37);
    v.health[vid] = 100;
    Game.resolveWildMonsterEncounter(vid, m);
    Game.fieldFight = realFF;
    check('vKill applies the fight wounds (100 -> 63)', v.health[vid] === 63, 'health=' + v.health[vid]);
    check('vKill still removes the monster', !Game.worldMonsters().includes(m), '');
    // mFlee: canned drive-off, wounds must land too
    const m2 = { id: 'bulldozer', tx: 4, ty: 4, hp: 50, maxHp: 55 };
    Game.worldMonsters().push(m2);
    Game.fieldFight = () => cannedRec('mFlee', 22);
    v.health[vid] = 100;
    Game.resolveWildMonsterEncounter(vid, m2);
    Game.fieldFight = realFF;
    check('mFlee applies the fight wounds (100 -> 78)', v.health[vid] === 78, 'health=' + v.health[vid]);
    check('mFlee leaves the (wounded) monster in the world', Game.worldMonsters().includes(m2), '');
    Game.removeWorldMonster(m2);
  }

  console.log('== 2. wounds applied on WINS (expedition router) ==');
  {
    const st = Game.agencyState();
    const a = Game.agencyOf(vid);
    st.exped[vid] = { encounters: [], duration: 5, legs: 0, tx: 5, ty: 5 };
    const realFF = Game.fieldFight;
    Game.fieldFight = () => cannedRec('vKill', 41);
    v.health[vid] = 100;
    const b4 = (a.xp[vid] || {}).bravery || 0;
    Game.expeditionMonster(vid, 3, false);
    Game.fieldFight = realFF;
    check('expedition vKill applies wounds (100 -> 59)', v.health[vid] === 59, 'health=' + v.health[vid]);
    check('expedition vKill still teaches (bravery up)', ((a.xp[vid] || {}).bravery || 0) > b4, '');
    check('expedition vKill still counts the kill', (a.stats[vid] || {}).monsterKills >= 1, '');
    // mFlee on expedition
    st.exped[vid] = { encounters: [], duration: 5, legs: 0, tx: 5, ty: 5 };
    Game.fieldFight = () => cannedRec('mFlee', 15);
    v.health[vid] = 100;
    Game.expeditionMonster(vid, 3, false);
    Game.fieldFight = realFF;
    check('expedition mFlee applies wounds (100 -> 85)', v.health[vid] === 85, 'health=' + v.health[vid]);
    delete st.exped[vid];
  }

  console.log('== 3. no double-application: wounds land EXACTLY once ==');
  {
    const m = { id: 'bulldozer', tx: 3, ty: 3, hp: 50, maxHp: 55 };
    Game.worldMonsters().push(m);
    const realFF = Game.fieldFight;
    Game.fieldFight = () => cannedRec('vFlee', 30);
    v.health[vid] = 100;
    Game.resolveWildMonsterEncounter(vid, m);
    Game.fieldFight = realFF;
    check('vFlee wounds applied exactly once (100 -> 70)', v.health[vid] === 70, 'health=' + v.health[vid]);
    Game.removeWorldMonster(m);
  }

  console.log('== 4. pack: the lead falling breaks the pack ==');
  {
    // deterministic rig: 1-HP pack members, 0-damage monster, villager hits >= 4.
    // Whoever acts first, the lead dies in round 1 -> the fight MUST end vKill in 1 round.
    const mdef = { id: 'hushwolf', pack: 3, hp: [1, 1], speed: 1, wave: 1,
      behavior: 'pack', attack: { name: 'nip', damage: [0, 0] } };
    v.health[vid] = 100;
    const rec = Game.fieldFight(vid, mdef, null, {});
    check('lead death ends the fight that round (rounds=1)', rec.rounds === 1, 'rounds=' + rec.rounds);
    check('outcome is vKill (pack dies/scatters with the lead)', rec.outcome === 'vKill', rec.outcome);
    check('no phantom promotion: log names the broken pack',
      rec.log.some(l => /coordination shatters/i.test(l)), JSON.stringify(rec.log.slice(-1)));
  }

  console.log('== 5. no zombie entities: m.hp never 0-while-live ==');
  {
    // battery of pack fights against a live world entity. Rigged weak-damage
    // pack so the villager survives long enough to wound the lead below the
    // break line (mFlee persistence is the path under test); a real hushwolf
    // just kills an unarmed villager before that (see section 8).
    const mdef = Object.assign({}, byId['hushwolf'],
      { attack: { name: 'nip', damage: [2, 3] }, hp: [30, 30], speed: 1 });
    let zombie = 0, checked = 0, mFleeSaw = 0;
    for (let i = 0; i < 300; i++) {
      const m = { id: 'hushwolf', tx: 2, ty: 2, hp: 30, maxHp: 35 };
      v.health[vid] = 100;
      const rec = Game.fieldFight(vid, mdef, m, {});
      checked++;
      if (rec.outcome === 'mFlee') {
        mFleeSaw++;
        if (!(m.hp > 0)) zombie++;
        if (m.hp !== rec.mHpLeft) zombie++;
      }
      if (rec.outcome === 'vKill' && m.hp === 0) zombie++; // vKill must not persist
      if (rec.outcome !== 'vKill' && m.hp <= 0) zombie++;
    }
    check('300 pack fights: no 0-HP live entities, m.hp tracks the lead', zombie === 0, 'zombies=' + zombie);
    check('battery actually exercised mFlee persistence', mFleeSaw > 0, 'mFlee=' + mFleeSaw);
  }

  console.log('== 6. standoff is gone (dead outcome) ==');
  {
    const mdef = byId['bulldozer'];
    let saw = false;
    for (let i = 0; i < 2000; i++) {
      v.health[vid] = 100;
      const rec = Game.fieldFight(vid, mdef, null, {});
      if (rec.outcome === 'standoff') { saw = true; break; }
    }
    check('2000 fights: standoff never returned', !saw, '');
    const ffSrc = fs.readFileSync(path.join(ROOT, 'src/js/fieldFights.js'), 'utf8');
    check('fieldFights.js has no standoff branch', !/'standoff'/.test(ffSrc), '');
    const gSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
    check('game.js router has no standoff branch', !/rec\.outcome === 'standoff'/.test(gSrc), '');
    const vaSrc = fs.readFileSync(path.join(ROOT, 'src/js/villager-agency.js'), 'utf8');
    check('villager-agency.js has no standoff branch', !/standoff/.test(vaSrc), '');
  }

  console.log('== 7. awareness honesty: the silence is the weapon ==');
  {
    // hushwolf (pack, fast, long notice): nearly impossible to spot untrained
    let ev0 = 0, ev30 = 0, N = 2000;
    const wolf = byId['hushwolf'], doz = byId['bulldozer'];
    const a = Game.agencyOf(vid);
    for (let i = 0; i < N; i++) {
      a.xp[vid].tracking = 0;
      v.health[vid] = 100;
      if (Game.fieldFight(vid, wolf, null, { awareness: true }).outcome === 'evade') ev0++;
      a.xp[vid].tracking = 30;
      v.health[vid] = 100;
      if (Game.fieldFight(vid, wolf, null, { awareness: true }).outcome === 'evade') ev30++;
    }
    const r0 = ev0 / N, r30 = ev30 / N;
    check('novice tracker almost never spots the hushwolf first (<10%)', r0 < 0.10, (r0 * 100).toFixed(1) + '%');
    check('tracking pays: veteran spots it far more often', r30 > r0 + 0.15, (r30 * 100).toFixed(1) + '% vs ' + (r0 * 100).toFixed(1) + '%');
    // bulldozer (territorial, big, loud): easier to spot than the wolf at equal tracking
    let bEv = 0;
    for (let i = 0; i < N; i++) {
      a.xp[vid].tracking = 15;
      v.health[vid] = 100;
      if (Game.fieldFight(vid, doz, null, { awareness: true }).outcome === 'evade') bEv++;
    }
    let wEv = 0;
    for (let i = 0; i < N; i++) {
      a.xp[vid].tracking = 15;
      v.health[vid] = 100;
      if (Game.fieldFight(vid, wolf, null, { awareness: true }).outcome === 'evade') wEv++;
    }
    check('bulldozer easier to spot than hushwolf at equal tracking', bEv > wEv, (bEv / N * 100).toFixed(0) + '% vs ' + (wEv / N * 100).toFixed(0) + '%');
    a.xp[vid].tracking = 0;
  }

  console.log('== 8. wins still cost, and the fight is still hard ==');
  {
    // strong ARMED villager (bravery 40, hunting spear) vs bulldozer:
    // wins happen, but never for free. (An unarmed villager basically never
    // wins — that is the intended "hard fight", not a test failure.)
    try { Game.agencyOf(vid).xp[vid].bravery = 40; } catch (e) {}
    try {
      const rec = (Game.data.villagers || []).find(x => x.id === vid) ||
                  (Game.data.background_survivors || []).find(x => x.id === vid);
      if (rec) rec.equipped = { melee: { itemId: 'hunting_spear' } };
    } catch (e) {}
    const mdef = byId['bulldozer'];
    let wins = 0, freeWins = 0, trials = 200;
    for (let i = 0; i < trials; i++) {
      v.health[vid] = 100;
      const rec = Game.fieldFight(vid, mdef, null, {});
      if (rec.outcome === 'vKill' || rec.outcome === 'mFlee') {
        wins++;
        if (rec.vTaken <= 0) freeWins++;
      }
    }
    check('strong+armed vs bulldozer: wins some real fights', wins > 20, wins + '/' + trials);
    check('no free wins: every win cost blood in the record', freeWins === 0, 'free=' + freeWins);
    // Highbeam Deer benchmark: nobody kills it alone
    const deer = byId['gallowdeer'];
    let deerKills = 0;
    for (let i = 0; i < 100; i++) {
      v.health[vid] = 100;
      if (Game.fieldFight(vid, deer, null, {}).outcome === 'vKill') deerKills++;
    }
    check('Highbeam Deer: 0 solo kills in 100 (benchmark holds)', deerKills === 0, 'kills=' + deerKills);
  }

  Game.say = origSay;
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILURE:', e); process.exit(2); });
