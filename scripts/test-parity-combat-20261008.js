#!/usr/bin/env node
// Parity proof: COMBAT stat-weighting (2026-10-08).
// BEFORE: resolveWildMonsterEncounter used a flat table (35% kill / 25% drive /
// 25% mauled / 15% die) regardless of villager stats or monster threat.
// AFTER: outcomes weight by villager capability vs monster threat.
// A strong villager vs a weak monster must do better than a weak villager
// vs a strong monster — in both directions.
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
  // strong: full health, veteran bravery, explorer profile
  v.health = v.health || {};
  v.health[strong] = 100; v.health[weak] = 20;
  try {
    const a = Game.agencyOf(strong); a.xp[strong].bravery = 40;
    const a2 = Game.agencyOf(weak); a2.xp[weak].bravery = 0;
    Game.agencyState().profiles[strong] = 'explorer';
    Game.agencyState().profiles[weak] = 'homebody';
  } catch (e) {}
  // silence narration
  const origSay = Game.say; Game.say = () => {};
  Game.state.scholar.awayNews = [];

  function runBatch(vid, monsterId, n) {
    const out = { kill: 0, drive: 0, mauled: 0, die: 0 };
    const origHurt = Game.hurtVillager;
    const origRemove = Game.removeWorldMonster;
    for (let i = 0; i < n; i++) {
      // fresh monster each time (kill removes it)
      const m = { id: monsterId, tx: hx + 1, ty: hy, mx: 4, my: 4, hp: 30, maxHp: 30 };
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
  console.log('  strong vs weak monster:', JSON.stringify(sVsW));
  console.log('  weak vs strong monster:', JSON.stringify(wVsS));

  check('strong vs weak kills more often than weak vs strong',
    sVsW.kill > wVsS.kill * 1.5,
    `strong kills ${sVsW.kill}/${N}, weak kills ${wVsS.kill}/${N}`);
  check('weak vs strong dies more often than strong vs weak',
    wVsS.die > sVsW.die,
    `weak dies ${wVsS.die}/${N}, strong dies ${sVsW.die}/${N}`);
  check('strong vs weak rarely dies (capable villagers survive)',
    sVsW.die < N * 0.08,
    `strong dies ${sVsW.die}/${N}`);
  check('weak vs strong rarely kills (no free heroics)',
    wVsS.kill < N * 0.25,
    `weak kills ${wVsS.kill}/${N}`);

  Game.say = origSay;
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
