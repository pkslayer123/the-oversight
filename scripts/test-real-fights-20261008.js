#!/usr/bin/env node
// Proof: REAL FIGHTS (2026-10-08).
// Steve: "Why are you treating monster encounters like rng? It should be a
// fight. A hard one." Villager-vs-monster meetings are blow-by-blow fights
// with real stats and the monster's real attack data — never an outcome
// table (the parity hunt's stat-weighted 35/25/25/15 table is dead).
// This proves: weak vs hushwolf gets hurt/driven off/killed (never a clean
// kill); a strong armed villager CAN win a real fight and takes real wounds;
// NOBODY kills a Highbeam Deer alone; every fight leaves an honest record;
// 100 fights are cheap.
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
const VALID_OUTCOMES = ['evade', 'vKill', 'mFlee', 'vFlee', 'vDie', 'standoff'];

(async () => {
  const Game = loadAll();
  await Game.init();
  Game.genRoster('Breaker');
  const rid = Game.generatedRoster[0].id;
  Game.newGame('Breaker', null, rid);
  Game.depart();
  const v = Game.state.village;
  const npcIds = (v.roster || []).filter(id => id !== Game.villagerId);
  const strongId = npcIds[0], weakId = npcIds[1];
  v.health = v.health || {};
  // silence narration
  const origSay = Game.say; Game.say = () => {};

  function setupVillager(vid, hp, bravery, weaponId) {
    v.health[vid] = hp;
    try {
      const a = Game.agencyOf(vid);
      a.xp[vid].bravery = bravery;
    } catch (e) {}
    if (weaponId) {
      try {
        const rec = (Game.data.villagers || []).find(x => x.id === vid) ||
                    (Game.data.background_survivors || []).find(x => x.id === vid);
        if (rec) rec.equipped = { melee: { itemId: weaponId } };
      } catch (e) {}
    }
  }
  function mdef(id) {
    return (Game.data.monsters || []).find(x => x.id === id) || {};
  }
  function fightBatch(vid, monsterId, n, monsterHp) {
    const out = { vKill: 0, mFlee: 0, vFlee: 0, vDie: 0, standoff: 0, evade: 0 };
    const recs = [];
    for (let i = 0; i < n; i++) {
      const m = { id: monsterId, tx: 5, ty: 5, mx: 5, my: 5, hp: monsterHp ?? 30, maxHp: monsterHp ?? 30 };
      const rec = Game.fieldFight(vid, mdef(monsterId), m, {});
      recs.push(rec);
      out[rec.outcome] = (out[rec.outcome] || 0) + 1;
    }
    return { out, recs };
  }

  console.log('== 1. weak villager vs hushwolf: hurt/driven off/killed, never a clean kill ==');
  setupVillager(weakId, 20, 0, null);
  const w1 = fightBatch(weakId, 'hushwolf', 200);
  console.log('  weak vs hushwolf:', JSON.stringify(w1.out));
  check('weak vs hushwolf: ZERO clean kills', w1.out.vKill === 0, `kills=${w1.out.vKill}`);
  check('weak vs hushwolf: every fight ends hurt/driven off/dead',
    (w1.out.vFlee + w1.out.vDie + w1.out.standoff) === 200,
    JSON.stringify(w1.out));

  console.log('== 2. strong armed villager vs bulldozer: CAN win, takes real wounds ==');
  setupVillager(strongId, 100, 40, 'hunting_spear');
  const w2 = fightBatch(strongId, 'bulldozer', 200);
  console.log('  strong+armed vs bulldozer:', JSON.stringify(w2.out));
  const wins = w2.recs.filter(r => r.outcome === 'vKill' || r.outcome === 'mFlee');
  check('strong+armed vs bulldozer: wins some real fights', wins.length > 20, `wins=${wins.length}/200`);
  check('wins cost blood: every win took real wounds',
    wins.every(r => r.vTaken > 0),
    'a bloodless win found');
  check('wins are real fights: rounds >= 1, wounds logged',
    wins.every(r => r.rounds >= 1 && (r.vTaken + r.mDealt) > 0));

  console.log('== 3. NOBODY kills a Highbeam Deer alone; the table is dead ==');
  const w3 = fightBatch(strongId, 'gallowdeer', 200, 160);
  console.log('  strong+armed vs gallowdeer (160 HP):', JSON.stringify(w3.out));
  check('Highbeam Deer: ZERO solo kills by a strong armed villager', w3.out.vKill === 0, `kills=${w3.out.vKill}`);
  check('Highbeam Deer: the fight is hard — mostly driven off or dead',
    (w3.out.vFlee + w3.out.vDie) >= 190, JSON.stringify(w3.out));
  const src = Game.resolveWildMonsterEncounter.toString();
  check('the table is dead: resolveWildMonsterEncounter calls fieldFight', src.includes('fieldFight'));
  check('the table is dead: no outcome-table weights remain',
    !/killP|driveP|mauledP|dieP|deathP|hurtP/.test(src), 'table variables found');

  console.log('== 4. honest record: every fight leaves one ==');
  const all = [...w1.recs, ...w2.recs, ...w3.recs];
  check('every record has a valid outcome', all.every(r => VALID_OUTCOMES.includes(r.outcome)));
  check('every fight ran rounds and logged them',
    all.every(r => r.rounds >= 1 && Array.isArray(r.log) && r.log.length >= 1));
  check('wounds are logged both ways on contact fights',
    all.every(r => r.vTaken >= 0 && r.mDealt >= 0));
  const summary = Game.fieldFightSummary(w2.recs.find(r => r.outcome === 'vKill') || w2.recs[0], 'Ash', 'the bulldozer');
  check('gossip summary describes a real fight', /round/i.test(summary), summary);

  console.log('== 5. integrated routing: resolveWildMonsterEncounter still feeds downstream ==');
  setupVillager(weakId, 100, 10, null);
  let removed = false, hurtTotal = 0;
  const origRemove = Game.removeWorldMonster, origHurt = Game.hurtVillager;
  const m = { id: 'hushwolf', tx: 5, ty: 5, mx: 5, my: 5, hp: 30, maxHp: 30 };
  Game.removeWorldMonster = () => { removed = true; };
  Game.hurtVillager = (id, dmg) => { if (id === weakId) hurtTotal += dmg; };
  Game.state.scholar.awayNews = [];
  Game.resolveWildMonsterEncounter(weakId, m);
  Game.removeWorldMonster = origRemove; Game.hurtVillager = origHurt;
  check('downstream still wired: kill removes the monster OR wounds are applied OR it fled with news',
    removed || hurtTotal > 0 || Game.state.scholar.awayNews.length > 0,
    `removed=${removed} hurt=${hurtTotal} news=${Game.state.scholar.awayNews.length}`);

  console.log('== 6. performance: 100 fights ==');
  const t0 = Date.now();
  for (let i = 0; i < 100; i++) Game.fieldFight(strongId, mdef('hushwolf'), null, {});
  const ms = Date.now() - t0;
  console.log(`  100 fights: ${ms}ms`);
  check('100 fights resolve fast (< 2s)', ms < 2000, `${ms}ms`);

  Game.say = origSay;
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
