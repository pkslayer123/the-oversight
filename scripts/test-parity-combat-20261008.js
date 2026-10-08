#!/usr/bin/env node
// Parity proof: COMBAT is real fights (2026-10-08).
// BEFORE: resolveWildMonsterEncounter used a flat table (35% kill / 25% drive /
// 25% mauled / 15% die) regardless of villager stats or monster threat.
// The parity hunt replaced it with a stat-weighted table — Steve rejected the
// whole approach: "It should be a fight. A hard one."
// AFTER: resolveWildMonsterEncounter routes through fieldFight() — real
// rounds, real stats, the monster's real attack data. No outcome table at all.
// A strong armed villager vs a weak monster must do better than a weak
// villager vs a strong monster — in both directions — because the FIGHT says
// so, not because a table says so.
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

(async () => {
  const Game = loadAll();
  await Game.init();
  Game.genRoster('Breaker');
  const rid = Game.generatedRoster[0].id;
  Game.newGame('Breaker', null, rid);
  Game.depart();
  const v = Game.state.village;
  const hx = v.px ?? 4, hy = v.py ?? 4;
  Game.map.px = hx; Game.map.py = hy;

  const npcIds = (v.roster || []).filter(id => id !== Game.villagerId);
  const strong = npcIds[0], weak = npcIds[1];
  // strong: full health, veteran bravery, explorer profile, REAL weapon
  v.health = v.health || {};
  v.health[strong] = 100; v.health[weak] = 20;
  try {
    const a = Game.agencyOf(strong); a.xp[strong].bravery = 40;
    const a2 = Game.agencyOf(weak); a2.xp[weak].bravery = 0;
    Game.agencyState().profiles[strong] = 'explorer';
    Game.agencyState().profiles[weak] = 'homebody';
    const rec = (Game.data.villagers || []).find(x => x.id === strong) ||
                (Game.data.background_survivors || []).find(x => x.id === strong);
    if (rec) rec.equipped = { melee: { itemId: 'hunting_spear' } };
  } catch (e) {}
  // silence narration
  const origSay = Game.say; Game.say = () => {};
  Game.state.scholar.awayNews = [];

  function runBatch(vid, monsterId, n) {
    const out = { kill: 0, drive: 0, mauled: 0, die: 0 };
    const origHurt = Game.hurtVillager;
    const origRemove = Game.removeWorldMonster;
    // real HP: what spawnWorldMonster would give (base of the monster's hp range)
    const mdef0 = (Game.data.monsters || []).find(x => x.id === monsterId) || {};
    const baseHp = (mdef0.hp && mdef0.hp[0]) || 20;
    for (let i = 0; i < n; i++) {
      // fresh monster each time (kill removes it)
      const m = { id: monsterId, tx: hx + 1, ty: hy, mx: 4, my: 4, hp: baseHp, maxHp: baseHp };
      // restore health between trials (we measure odds, not attrition)
      v.health[vid] = vid === strong ? 100 : 20;
      let hurt = 0, removed = false;
      Game.hurtVillager = (id, dmg) => { if (id === vid) hurt = dmg; };
      Game.removeWorldMonster = (mm) => { removed = true; };
      Game.resolveWildMonsterEncounter(vid, m);
      if (removed) out.kill++;
      else if (hurt >= 500) out.die++;
      else if (hurt > 0) out.mauled++;
      else out.drive++;
    }
    Game.hurtVillager = origHurt;
    Game.removeWorldMonster = origRemove;
    return out;
  }

  // weak monster: hushwolf (wave 1, low hp/dmg). strong monster: gallowdeer (160hp).
  const N = 400;
  const sVsW = runBatch(strong, 'hushwolf', N);
  const wVsS = runBatch(weak, 'gallowdeer', N);
  const sVsW2 = runBatch(strong, 'gallowdeer', 200);
  console.log('  strong+armed vs weak monster:', JSON.stringify(sVsW));
  console.log('  weak vs strong monster:', JSON.stringify(wVsS));
  console.log('  strong+armed vs Highbeam Deer:', JSON.stringify(sVsW2));

  const sWins = sVsW.kill + sVsW.drive, wWins = wVsS.kill + wVsS.drive;
  check('strong+armed vs weak wins fights more often than weak vs strong (both directions)',
    sWins > wWins * 1.5,
    `strong wins ${sWins}/${N}, weak wins ${wWins}/${N}`);
  check('weak vs strong dies more often than strong vs weak',
    wVsS.die > sVsW.die,
    `weak dies ${wVsS.die}/${N}, strong dies ${sVsW.die}/${N}`);
  check('strong+armed vs weak rarely dies (capable villagers survive by fleeing)',
    sVsW.die < N * 0.10,
    `strong dies ${sVsW.die}/${N}`);
  check('weak vs Highbeam: never kills, almost always dies (no free heroics)',
    wVsS.kill === 0 && wVsS.die > N * 0.75,
    `weak kills ${wVsS.kill}/${N}, dies ${wVsS.die}/${N}`);
  check('strong+armed vs Highbeam: NOBODY kills it alone',
    sVsW2.kill === 0,
    `strong+armed kills ${sVsW2.kill}/${N}`);

  Game.say = origSay;
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
