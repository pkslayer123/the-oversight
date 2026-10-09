// EXILE HARD RESET PROOF (break-it social r5 2026-10-09). Steve's law: exile = hard reset —
// founding a new haven after exile must fork a REAL new village object, not mutate the old one.
// Asserts: old village archived with its social state intact; new village founder-only with
// fresh trust/gossip/needs/memory; pack + codex + character cross over; exile flags cleared;
// founding project spent. Run: node scripts/test-social-exile-fork-20261009.js (SEED=... optional)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261009', 10);
function mulberry32(seed) {
  let s = seed >>> 0;
  const f = function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.reset = (ns) => { s = ns >>> 0; }; return f;
}
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js', 'src/js/drama.js']);
[...html.matchAll(/src\/js\/[^\/"]+\.js|src\/js\/engine\/[^\/"]+\.js/g)].map(m => m[0]).filter(f => !SKIP.has(f))
  .forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

(async () => {
  await Game.init();
  Game.debugScenario('day1');
  const S = Game.state, s = S.scholar;
  const pid = Game.villagerId;
  const oldVillage = S.village;
  const oldName = oldVillage.name;
  // poison old village social state so we can check the fork is clean
  (S.village.trust = S.village.trust || {})[pid] = 5;
  S.village.gossip = S.village.gossip || [];
  S.village.gossip.push({ action: 'stingy', dims: { who: pid }, heard: [], day: s.day });
  S.village.rosterChars = S.village.rosterChars || {};
  S.village.rosterChars[pid] = { name: 'BearerChar', originTags: ['plains'] };
  const packBefore = JSON.stringify(s.inventory);
  const codexBefore = JSON.stringify(s.codex && s.codex.plants ? Object.keys(s.codex.plants).length : 0);

  // exile, then satisfy founding reqs
  Game.exilePlayer('moot');
  s.exileStartDay = s.day - 7; // 7 solo days
  s.founding = { siteClaimed: true, shelterTier: 2, stockpileKcal: 10000, claimX: 5, claimY: 5 };
  console.log('missing:', Game.foundingMissing());
  const r = Game.foundHaven();
  console.log('foundHaven ->', r);
  const v = S.village;
  const checks = [
    ['old archived', (S.pastVillages || []).includes(oldVillage)],
    ['new object !== old', v !== oldVillage],
    ['roster founder-only', v.roster.length === 1 && v.roster[0] === pid],
    ['fresh trust', v.trust[pid] === 15 && Object.keys(v.trust).length === 1],
    ['fresh gossip', (v.gossip || []).length === 0],
    ['fresh needs/memory', Object.keys(v.needs || {}).length === 0 && Object.keys(v.memory || {}).length === 0],
    ['pack crossed', JSON.stringify(s.inventory) === packBefore],
    ['char crossed', !!(v.rosterChars || {})[pid]],
    ['exile cleared (scholar)', s.exiled === false],
    ['exile cleared (justice)', Game.justiceState().exiled === false],
    ['founding spent', s.founding === null],
    ['old trust intact in archive', oldVillage.trust[pid] === 5],
    ['old gossip intact in archive (>=1, exile seeds its own rumor)', (oldVillage.gossip || []).length >= 1],
    ['old name remembered', S.oldVillage === oldName],
  ];
  let fail = 0;
  for (const [n, c] of checks) { console.log((c ? 'PASS' : 'FAIL') + ' ' + n); if (!c) fail++; }
  console.log('new village name:', v.name, '| day:', v.day);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
