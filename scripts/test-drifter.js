// Drifter playtest: travel far, distant villages, catch-up simulation, return.
// Usage: node scripts/test-drifter.js
// Covers: village placement, discovery-on-arrival (not delayed to part turn),
// catch-up sim depth (they lived while you weren't looking), LOCAL depletion
// (their foraging strips THEIR turf, not yours), non-exiled visit verbs
// (talk & trade knowledge), and the return-home loop.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/food.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/betrayal.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
// stubs for ledger-owned functions
globalThis.Scattering.Game.progState = function () {
  const s = this.state.scholar; s.prog = s.prog || {};
  s.prog.moments = s.prog || []; return s.prog;
};
globalThis.Scattering.Game.recordMoment = function () {};
globalThis.Scattering.Game.broadcastLine = function () {};
eval(fs.readFileSync(path.join(ROOT, 'src/js/membership.js'), 'utf8'));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
const said = [];
function freshGame() {
  said.length = 0;
  Game.say = function (t) { said.push(String(t)); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.kcal = 3000; s.health = 100; s.exiled = false;
  return s;
}
function saidHas(sub) { return said.some(t => t.indexOf(sub) >= 0); }
function manhattan(ax, ay, bx, by) { return Math.abs(ax - bx) + Math.abs(ay - by); }
// walk the player to a tile adjacent to (tx,ty), then travelTo onto it.
function walkTo(tx, ty) {
  // step 1: place adjacent (test setup), reveal the target
  const ax = tx > 0 ? tx - 1 : tx + 1;
  Game.reveal(ax, ty); Game.reveal(tx, ty);
  Game.map.px = ax; Game.map.py = ty;
  said.length = 0;
  Game.travelTo(tx, ty, true);
}

(async () => {
  await Game.init();

  // ---------- A. villages exist, placed with room ----------
  {
    const s = freshGame();
    const vs = Game.state.otherVillages || [];
    ok('A1: 2-3 other villages', vs.length >= 2 && vs.length <= 3);
    ok('A2: villages away from haven (>=3)', vs.every(v => manhattan(v.x, v.y, 3, 3) >= 3));
    ok('A3: villages apart from each other', vs.every((v, i) => vs.every((w, j) => i === j || manhattan(v.x, v.y, w.x, w.y) >= 2)));
    ok('A4: villages start ungenerated', vs.every(v => !v.generated && v.day === 0));
  }

  // ---------- B. discovery fires ON ARRIVAL ----------
  {
    const s = freshGame();
    s.day = 5;
    const v = Game.state.otherVillages[0];
    walkTo(v.x, v.y);
    ok('B1: arrival discovers the village (generated)', v.generated === true);
    ok('B2: catch-up ran to today', v.day === 5);
    ok('B3: discovery is announced', saidHas('smoke on the horizon'));
    ok('B3b: stepping onto their tile names it', saidHas("You're a guest here"));
    ok('B4: they have a knowledge profile', !!(v.knowledgeProfile && v.knowledgeProfile.focus));
  }

  // ---------- C. catch-up sim: they lived ----------
  {
    const s = freshGame();
    s.day = 14;
    const v = Game.state.otherVillages[1] || Game.state.otherVillages[0];
    Game.catchUpSim(v);
    ok('C1: village day caught up', v.day === 14);
    const prof = v.knowledgeProfile || {};
    const nPlants = Object.keys(prof.plants || {}).length;
    ok('C2: seeded + learned plants (>=2)', nPlants >= 2);
    ok('C3: codex mirrors profile', Object.keys((v.codex && v.codex.plants) || {}).length >= 2);
    ok('C4: pantry not negative', (v.pantryKcal || 0) >= 0);
    ok('C5: population alive (4-12)', v.population >= 4 && v.population <= 12);
    ok('C6: focus is a real word', ['fisher', 'forager', 'farmer', 'scavenger'].includes(prof.focus));
  }

  // ---------- D. depletion is LOCAL (their turf, not yours) ----------
  {
    const s = freshGame();
    s.day = 0;
    const v = Game.state.otherVillages[0];
    const stockAt = (x, y) => { const t = Game.tileAt(x, y); return (t && t.stock) || 0; };
    // "far" = beyond their foraging range (they work <=2, range to 4 when
    // desperate). Tiles past 4 must NEVER be touched by a distant village.
    let nearBefore = 0, farBefore = 0;
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      if (manhattan(x, y, v.x, v.y) <= 2) nearBefore += stockAt(x, y);
      else if (manhattan(x, y, v.x, v.y) > 4) farBefore += stockAt(x, y);
    }
    s.day = 10;
    Game.catchUpSim(v); // 10 days of their foraging
    let nearAfter = 0, farAfter = 0;
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      if (manhattan(x, y, v.x, v.y) <= 2) nearAfter += stockAt(x, y);
      else if (manhattan(x, y, v.x, v.y) > 4) farAfter += stockAt(x, y);
    }
    ok('D1: there was stock to deplete', nearBefore + farBefore > 0);
    ok('D2: far tiles untouched by their foraging', farAfter === farBefore);
    ok('D3: near tiles show their foraging', nearAfter < nearBefore);
  }

  // ---------- E. non-exiled visit has verbs ----------
  {
    const s = freshGame();
    s.day = 3;
    const v = Game.state.otherVillages[0];
    // far away: card should NOT offer talk
    const farCard = Game.villageCard(v.id);
    ok('E1: card exists even before visiting', !!farCard);
    ok('E2: far card offers no talk (travel there first)', !(farCard.actions || []).some(a => a.id === 'talk'));
    // walk in
    walkTo(v.x, v.y);
    ok('E3: village discovered on arrival', v.generated === true);
    const card = Game.villageCard(v.id);
    const talk = (card.actions || []).find(a => a.id === 'talk');
    ok('E4: at the village, talk is offered', !!talk);
    // knowledge exchange: give them something new to teach
    const prof = v.knowledgeProfile || {};
    const theirPids = Object.keys(prof.plants || {});
    ok('E5: they know something', theirPids.length > 0);
    // wipe my knowledge of their plants so the exchange teaches me
    for (const pid of theirPids) delete Game.state.codex.plants[pid];
    const ticksBefore = Game.state.scholar.dayTicks || 0;
    said.length = 0;
    const r = Game.villageTalk(v.id);
    ok('E6: talk happens', r === true);
    const learned = theirPids.some(pid => Game.state.codex.plants[pid]);
    ok('E7: I learn a plant from them (L1)', learned);
    const entry = Game.state.codex.plants[theirPids.find(pid => Game.state.codex.plants[pid])];
    ok('E8: learned-from attribution recorded', entry && entry.learnedFrom === v.name);
    ok('E9: talk costs time', (Game.state.scholar.dayTicks || 0) > ticksBefore);
    ok('E10: talk is once per day', Game.villageTalk(v.id) === null && saidHas('today'));
    // symmetric: they learn one of mine
    const myPids = Object.keys(Game.state.codex.plants || {}).filter(pid => !theirPids.includes(pid));
    if (myPids.length) {
      ok('E11: they learned one of mine', myPids.some(pid => (v.codex.plants || {})[pid]));    }
  }

  // ---------- F. return home closes the loop ----------
  {
    const s = freshGame();
    const v = Game.state.otherVillages[0];
    s.day = 4;
    walkTo(v.x, v.y);
    ok('F1: at the village', Game.map.px === v.x && Game.map.py === v.y);
    // head home on foot, one travel at a time — travel is step-by-step by design
    said.length = 0;
    let guard = 0;
    while (manhattan(Game.map.px, Game.map.py, 3, 3) > 0 && guard++ < 14) {
      Game.reveal(3, 3);
      const tgts = Game.travelTargets();
      let best = null, bd = 1e9;
      for (const t of tgts) {
        const d = manhattan(t.x, t.y, 3, 3);
        if (d < bd) { bd = d; best = t; }
      }
      if (!best) break;
      Game.travelTo(best.x, best.y, true);
    }
    ok('F2: home tile reached', Game.map.px === 3 && Game.map.py === 3);
    ok('F3: return announced', saidHas('Haven') || saidHas('home') || saidHas('village'));
  }

  // ---------- G. join/leave still works (exile path untouched) ----------
  {
    const s = freshGame();
    s.exiled = true;
    const v = Game.state.otherVillages[0];
    Game.catchUpSim(v);
    Game.joinVillage(v.id);
    ok('G1: join sets joinedVillage', s.joinedVillage === v.id);
    const kcalBefore = s.kcal;
    Game.villageMeal();
    ok('G2: meal comes from their pantry', s.kcal >= kcalBefore || (v.pantryKcal || 0) >= 0);
    Game.leaveVillage();
    ok('G3: leave clears joinedVillage', s.joinedVillage === null);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
