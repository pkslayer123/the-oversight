#!/usr/bin/env node
// Proof test: bush lecture-once + thorn honesty (forager loop 2026-10-07).
// BUG 1: tapping a bush repeated the full "A berry bush — berries, certainly..."
// lecture on EVERY tap, even when the player was just told and the bush is
// picked clean. Fix: the description says only when it teaches something new.
// BUG 2: thorns taxed -20 kcal on every bush tap, BEFORE the forage — so a
// picked-clean (regrowing) bush still drew blood while saying "You get the
// berries" (a lie: there are no berries). Fix: no thorn tax when regrowing.
// Usage: node scripts/test-bush-lecture-once-20261007.js (exit 1 on failure)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let a = 4242;
Math.random = function () {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const failures = [];
const check = (name, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
  if (!cond) failures.push(name);
};

(async () => {
  await Game.init();
  const says = [];
  const os = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return os(t); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  says.length = 0;

  // find a bush anywhere in reach
  let found = null;
  for (const tt of (Game.travelTargets() || [])) {
    const d = Game.genDetail(tt.x, tt.y);
    for (let y = 0; y <= 8 && !found; y++) for (let x = 0; x <= 8; x++) {
      if (d[y][x] === 'bush') { found = { tt, bx: x, by: y }; break; }
    }
    if (found) break;
  }
  if (!found) { console.log('FAIL setup: no bush tile in reach'); process.exitCode = 1; return; }
  Game.travelTo(found.tt.x, found.tt.y); says.length = 0;
  const s = Game.state.scholar;
  const { bx, by } = found;
  const key = bx + ',' + by;
  const t = Game.playerTile();
  // stand adjacent (bush at edge-safe coords for this probe: shift if needed)
  s.mx = Math.max(0, bx - 1); s.my = by;
  // force the thorn path so the test exercises it deterministically
  t.secrets = t.secrets || {};
  t.secrets[key] = t.secrets[key] || { known: false };
  t.secrets[key].thorns = true;

  const tap = () => { says.length = 0; Game._cellInteract(bx, by); const m = says.join(' || '); says.length = 0; return m; };
  const k0 = Math.round(s.kcal);
  const m1 = tap();
  const thornFired1 = /Thorns\./.test(m1);
  const k1 = Math.round(s.kcal);
  const regrowing = !!((Game.playerTile().detailRegrow || {})[key]);
  const m2 = tap();
  const k2 = Math.round(s.kcal);
  const m3 = tap();
  const all = m1 + ' ||| ' + m2 + ' ||| ' + m3;
  const lectureCount = (all.match(/berry bush — berries, certainly/g) || []).length;
  const nameCount = (all.match(/you'll recognize the patch now/ig) || []).length;

  check('tap 1 harvests the bush (regrowing marked)', regrowing, `regrowing=${regrowing}`);
  check('tap 1 thorns fire on a fresh thorny bush', thornFired1 && k1 < k0, `Δkcal=${k1 - k0}`);
  check('bush lecture said exactly once across 3 taps', lectureCount === 1, `count=${lectureCount}`);
  check('recognition line said at most once', nameCount <= 1, `count=${nameCount}`);
  check('tap 2 (picked clean) does NOT tax thorns', !/Thorns\./.test(m2), `"${m2.slice(0, 100)}"`);
  check('tap 2 costs no thorn kcal', k2 === k1, `Δ=${k2 - k1}`);
  check('tap 2 does not claim berries were gathered', !/you get the berries/i.test(m2), `"${m2.slice(0, 100)}"`);
  check('tap 2 stays honest about the patch', /worked out|another green patch|nothing within reach|picked clean/i.test(m2), `"${m2.slice(0, 100)}"`);
  check('tap 3 also silent on lecture + thorns', !/berry bush — berries, certainly|Thorns\./.test(m3), `"${m3.slice(0, 100)}"`);

  // unknown->known transition: learn the species (as the camp ritual would),
  // tap again — the bush should name it ONCE, then go quiet.
  const species = Game.revealBush(bx, by);
  Game.state.codex.plants = Game.state.codex.plants || {};
  Game.state.codex.plants[species] = { level: 2 };
  const m4 = tap();
  const m5 = tap();
  check('after learning the species, the bush names it once', /you'll recognize the patch now/i.test(m4), `"${m4.slice(0, 110)}"`);
  check('naming does not repeat on the next tap', !/you'll recognize the patch now/i.test(m5), `"${m5.slice(0, 110)}"`);

  if (failures.length) process.exitCode = 1;
  else console.log('\nAll bush lecture/honesty checks pass.');
})();
