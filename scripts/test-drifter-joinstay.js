// test-drifter-joinstay.js — the joined village is a real place.
// Bugs fixed 2026-10-05 (drifter playtest loop):
//  1. DOUBLE-DIP: a player joined to a distant village ate THEIR meals while
//     their labor still fed HOME's pot (villageEats skipped the away player
//     only when NOT joined). Now joined-elsewhere counts as away.
//  2. TELEPORTING FOOD: villageMeal drew the joined meal from the joined
//     pantry no matter where the player stood — including Haven's hall.
//     Now the joined meal only serves at their fire (dist <= 1).
//  3. DEAD VILLAGE: the joined village never simmed while you lived there —
//     ten people ate nothing for days; only your meal moved their pantry.
//     Now tickJoinedVillage() sims their day (via extracted simVillageDay)
//     while you're at their fire, on the same village.day watermark so
//     catch-up never double-counts.
//  4. FROZEN AFTER FIRST SIGHT: checkVillageProximity only catch-up simmed
//     while !generated, so after first contact a village froze whenever you
//     walked away (only talk/petition re-synced it). Now every approach
//     catch-ups; the first-sight announcement still fires once.
// Usage: node scripts/test-drifter-joinstay.js [--seed N]
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/food.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/betrayal.js', 'src/js/justice.js', 'src/js/membership.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let seed = 7;
const argSeed = (process.argv.find(a => a.startsWith('--seed')) || '').split('=')[1];
if (argSeed) seed = parseInt(argSeed, 10);

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL:', name); }
}
function reseed(s) {
  let st = s >>> 0;
  Math.random = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
}
const manhattan = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);

async function freshGame(s) {
  reseed(s);
  await Game.init();
  Game.say = () => {};
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const sc = Game.state.scholar;
  sc.kcal = 4000; sc.health = 100; sc.hydration = 100; sc.exiled = false;
  return sc;
}
function walkTo(tx, ty) {
  let cx = Game.map.px, cy = Game.map.py, guard = 0;
  while ((cx !== tx || cy !== ty) && guard++ < 40) {
    const nx = cx !== tx ? cx + Math.sign(tx - cx) : cx;
    const ny = cx === tx ? cy + Math.sign(ty - cy) : cy;
    try { Game.reveal(nx, ny); Game.reveal(cx, cy); } catch (e) {}
    Game.map.px = cx; Game.map.py = cy;
    try { Game.travelTo(nx, ny, true); } catch (e) {}
    cx = nx; cy = ny;
  }
}
function nearestVillage() {
  const vs = Game.state.otherVillages || [];
  return vs.slice().sort((a, b) => manhattan(3, 3, a.x, a.y) - manhattan(3, 3, b.x, b.y))[0];
}

(async () => {
  for (const s of [seed, seed + 1, seed + 2]) {
    // --- FIX 1: joined-elsewhere player does not feed home's pot ---
    // Snapshot/restore within ONE game: pre-fix, joinedVillage exempted the
    // player from the away-skip, so the joined run fed home ~3600 kcal more.
    {
      const sc = await freshGame(s);
      const v = nearestVillage();
      walkTo(v.x, v.y);
      const p = Game.data.villagers.find(x => x.id === Game.villagerId) ||
                Game.data.background_survivors.find(x => x.id === Game.villagerId);
      if (p) p.providesPerDay = 20000; // loud labor: any double-dip is obvious
      Game.joinVillageReal(v.id);
      const snap = JSON.stringify(Game.state.village);
      reseed(s * 7919 + 11);
      const p0 = Game.state.village.pantryKcal || 0;
      Game.villageEats();
      const dJoined = (Game.state.village.pantryKcal || 0) - p0;

      Game.state.village = JSON.parse(snap);
      sc.joinedVillage = null; // identical state, but merely away
      reseed(s * 7919 + 11);
      const q0 = Game.state.village.pantryKcal || 0;
      Game.villageEats();
      const dAway = (Game.state.village.pantryKcal || 0) - q0;

      ok(dJoined === dAway,
        `seed ${s}: joined-away home delta === away-not-joined delta (${Math.round(dJoined)} vs ${Math.round(dAway)}) — no double-dip`);
    }

    // --- FIX 2: no teleporting food from the joined pantry ---
    {
      const sc = await freshGame(s);
      const v = nearestVillage();
      walkTo(v.x, v.y);
      Game.joinVillageReal(v.id);
      walkTo(3, 3); // home, WITHOUT leaving: still "joined", but at Haven
      ok(sc.joinedVillage === v.id, `seed ${s}: still joined after walking home`);
      reseed(s * 104729 + 3);
      const jv0 = v.pantryKcal;
      Game.villageMeal();
      ok(v.pantryKcal === jv0,
        `seed ${s}: joined pantry untouched by a meal eaten at home (${Math.round(jv0)} -> ${Math.round(v.pantryKcal)})`);
      walkTo(v.x, v.y); // back at their fire
      sc.kcal = 500;
      reseed(s * 104729 + 5);
      const jv1 = v.pantryKcal, k0 = sc.kcal;
      Game.villageMeal();
      ok(v.pantryKcal === jv1 - Math.min(2000, jv1) && sc.kcal > k0,
        `seed ${s}: meal at their fire draws their pantry (${Math.round(jv1)} -> ${Math.round(v.pantryKcal)}), fed ${Math.round(k0)} -> ${Math.round(sc.kcal)}`);
      // starving fire: honest +0, no phantom food
      v.pantryKcal = 0;
      sc.kcal = 500;
      Game.villageMeal();
      ok(sc.kcal === 500,
        `seed ${s}: empty joined pantry feeds nothing (kcal stays 500)`);
    }

    // --- FIX 3: the joined village lives while you're there ---
    {
      const sc = await freshGame(s);
      const v = nearestVillage();
      walkTo(v.x, v.y);
      Game.joinVillageReal(v.id);
      const day0 = v.day;
      // give them a healthy turf so their foraging has something to eat
      for (let ty = 0; ty < 7; ty++) for (let tx = 0; tx < 7; tx++) {
        const t = Game.tileAt(tx, ty);
        if (t && Math.abs(tx - v.x) + Math.abs(ty - v.y) <= 4 && (t.maxStock || 0) > 0) {
          t.stock = t.maxStock;
          t.detailRegrow = {};
        }
      }
      const turf0 = Game.turfKcal(v.x, v.y);
      for (let d = 0; d < 3; d++) {
        sc.kcal = 500; sc.hydration = 100; if (sc.health < 100) sc.health = 100;
        Game.state.village.pantryKcal = Math.max(Game.state.village.pantryKcal || 0, 20000);
        try { Game.endDay(); } catch (e) {}
        if (Game.over) break;
      }
      ok(v.day === day0 + 3,
        `seed ${s}: joined village day watermark advanced exactly 3 (${day0} -> ${v.day})`);
      const turf1 = Game.turfKcal(v.x, v.y);
      ok(turf0 > 0 && turf1 < turf0,
        `seed ${s}: they foraged their own turf while you lived there (${Math.round(turf0)} -> ${Math.round(turf1)} kcal)`);
      // walk away: their day must NOT advance while you're gone...
      walkTo(3, 3);
      const awayDay = v.day;
      sc.kcal = 4000; sc.hydration = 100;
      Game.endDay(); Game.endDay();
      ok(v.day === awayDay,
        `seed ${s}: joined village day frozen while you're away (${awayDay} -> ${v.day})`);
    }

    // --- FIX 4: every approach re-syncs (not just first sight) ---
    {
      const sc = await freshGame(s);
      const v = nearestVillage();
      walkTo(v.x, v.y); // first sight: catch-up to scholar day
      const firstDay = v.day;
      ok(firstDay === sc.day, `seed ${s}: first sight catch-up lands on scholar day (${firstDay} vs ${sc.day})`);
      walkTo(3, 3);
      for (let d = 0; d < 4; d++) {
        sc.kcal = 4000; sc.hydration = 100;
        Game.state.village.pantryKcal = Math.max(Game.state.village.pantryKcal || 0, 20000);
        try { Game.endDay(); } catch (e) {}
      }
      const gap = sc.day - v.day;
      ok(gap === 4, `seed ${s}: village froze while you were gone (gap ${gap})`);
      walkTo(v.x, v.y); // walk back WITHOUT talking: proximity must re-sync
      ok(v.day === sc.day,
        `seed ${s}: approach re-syncs the village (${v.day} vs scholar ${sc.day}) — no talk needed`);
    }
  }
  console.log(`\ntest-drifter-joinstay: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e.message, '\n', e.stack.split('\n').slice(0, 6).join('\n')); process.exit(1); });
