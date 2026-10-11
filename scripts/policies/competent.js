// policies/competent.js — plays like an aware, experienced player (Steve 2026-10-09).
// Heuristics, not optimal. Genuinely trying to win: learns plants, teaches,
// cooks everything, avoids disease vectors, fights only with advantage,
// keeps the takes/gives ledger honest. This is the skill-ceiling seed.
'use strict';
const idle = require('./idle');

// Eat like someone who knows the disease roster (DISEASES.md): cooked/safe
// food first, never human meat (trembles — cooking doesn't kill prions),
// never raw meat (trichinosis/gutrot). Re-scans each take since indices shift.
function competentEat(Game) {
  const s = Game.state.scholar, vv = Game.state.village;
  try {
    if (s.kcal >= Game.kcalCap() * 0.85) return;
    // HONEST EATING (bal-survival 2026-10-10): eat from the PACK first
    // (your foraged food), pantry second. The old code took from the pantry
    // even with a full pack — making the player a net drain.
    try { Game.eat(); } catch (e) {}
    if (s.kcal >= Game.kcalCap() * 0.85) return;
    let guard = 0;
    while (s.kcal < Game.kcalCap() * 0.95 && guard++ < 20) {
      const pantry = vv.pantry || [];
      let best = -1, bestScore = -99;
      for (let i = 0; i < pantry.length; i++) {
        const it = pantry[i];
        if (!it || (it.kcalEach || 0) <= 0) continue;
        if (it.plantId === 'meat_human') continue; // trembles: no cure, ever
        let score = 1;
        const fs = it.foodState || '';
        if (fs === 'cooked' || fs === 'smoked' || fs === 'preserved' || fs === 'rendered') score = 10;
        else if (fs === 'raw') score = (it.plantId || '').startsWith('meat_') ? -10 : 2;
        if (score > bestScore) { bestScore = score; best = i; }
      }
      if (best < 0 || bestScore < 0) break;
      try { Game.takeFromPantry(best); } catch (e) { break; }
      try { Game.eat(); } catch (e) { break; }
    }
  } catch (e) {}
}

// Loot the dead: an experienced player strips corpses (take, don't leave
// meat to rot — but never human meat). Range-checked inside corpseTakeItem.
function lootCorpses(Game, ctx) {
  try {
    if (!Game.corpses) return 0;
    let took = 0;
    for (const c of Game.corpses()) {
      if (!c || c.looted || c.buried) continue;
      const items = c.items || [];
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (!it || (it.units == null ? 1 : it.units) <= 0) continue;
        if (it.plantId === 'meat_human') continue; // trembles
        try {
          const r = Game.corpseTakeItem(c.id, i);
          if (r) { took++; ctx.looted = (ctx.looted || 0) + 1; }
        } catch (e) {}
      }
      if (took >= 12) break; // don't spend the whole day-part
    }
    return took;
  } catch (e) { return 0; }
}

function nearFire(Game) {
  try { return Game.nearFire(); } catch (e) { return false; }
}

// Cook every raw item in the pack when a fire is near. Raw = disease risk.
function cookPack(Game, ctx) {
  if (!nearFire(Game)) return 0;
  let cooked = 0;
  try {
    const inv = Game.state.scholar.inventory || [];
    for (let i = inv.length - 1; i >= 0; i--) {
      const it = inv[i];
      if (it && it.foodState === 'raw' && it.kcalEach > 0) {
        try { Game.cookFood(i); cooked++; } catch (e) {}
        if (cooked >= 6) break; // don't burn the whole day-part
      }
    }
  } catch (e) {}
  if (cooked) ctx.cooked = (ctx.cooked || 0) + cooked;
  return cooked;
}

// Safe water: fill when near a source, boil first (needs fire or beard_moss),
// then drink. An experienced player never drinks risky water raw.
function drinkSafe(Game, ctx) {
  try {
    const s = Game.state.scholar;
    // fill a bottle when the tile offers water
    try {
      const t = Game.playerTile ? Game.playerTile() : null;
      if (t && /creek|well|spring|river|pond/i.test(t.type || '') && (s.water || []).length < 3) {
        try { Game.fillWater(); } catch (e) {}
      }
    } catch (e) {}
    if ((s.hydration || 0) >= 70) return;
    if (!(s.water || []).length) return;
    try { Game.boilWater(); } catch (e) {}
    try { Game.doAction('drink'); ctx.drank = (ctx.drank || 0) + 1; } catch (e) {}
  } catch (e) {}
}

// Ticks: check after wilderness time; remove cleanly only when skilled.
// Blind yanks botch into wound_fever — an experienced player knows that.
function checkTicks(Game, ctx) {
  try {
    const list = Game.seList ? Game.seList('scholar') : [];
    const tick = (list || []).find(e => e.id === 'tick_attached');
    if (!tick) return;
    const knows = !!((Game.state.codex || {}).techniques || {}).tick_removal ||
      (Game.hasAbility && (Game.hasAbility('triage') || Game.hasAbility('field_medicine') || Game.hasAbility('herbal_remedy')));
    if (knows) {
      try { Game.removeTick(); ctx.ticksRemoved = (ctx.ticksRemoved || 0) + 1; } catch (e) {}
    } else {
      ctx.ticksIgnored = (ctx.ticksIgnored || 0) + 1;
    }
  } catch (e) {}
}

// Teach: pass known plants to villagers who don't know them.
// Knowledge → food → power starts with someone knowing the plants.
function teachRound(Game, ctx) {
  try {
    const known = Object.keys((Game.state.codex || {}).plants || {});
    if (!known.length) return;
    const vv = Game.state.village;
    const roster = (vv.roster || []).filter(id => id !== Game.villagerId);
    if (!roster.length) return;
    let taught = 0;
    for (const pid of known.slice(0, 3)) { // a few per day, not a lecture marathon
      for (const vid of roster) {
        let vk = [];
        try { vk = (vv.plantKnowledge && vv.plantKnowledge[vid]) || []; } catch (e) {}
        if (!vk.includes(pid)) {
          try { if (Game.teachPlant(vid, pid)) { taught++; break; } } catch (e) {}
        }
      }
      if (taught >= 2) break;
    }
    if (taught) ctx.taught = (ctx.taught || 0) + taught;
  } catch (e) {}
}

// Talk: one real conversation a day. Relationships are the other economy.
function talkRound(Game, ctx) {
  try {
    const vv = Game.state.village;
    const roster = (vv.roster || []).filter(id => id !== Game.villagerId);
    if (!roster.length || !Game.talkTo) return;
    const vid = roster[Math.floor(Math.random() * roster.length)];
    try {
      Game.talkTo(vid);
      try { Game.endConvo(vid, 'left'); } catch (e2) {} // don't leave modal state open
      ctx.talked = (ctx.talked || 0) + 1;
    } catch (e) {}
  } catch (e) {}
}

// Forage when it matters: pantry low or personal reserves low.
// An experienced player doesn't wait for the ledger to scream.
function needTrip(Game) {
  try {
    const pantry = ((Game.state.village || {}).pantry || [])
      .reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
    const s = Game.state.scholar;
    return pantry < 25000 || s.kcal < Game.kcalCap() * 0.5;
  } catch (e) { return false; }
}

// WORK THE WATER (food-early 2026-10-09): a competent leader keeps the
// cistern filled. Villagers drink 2L/day each; nobody fetches water
// autonomously, so without assignments the village dies of thirst while
// food is still on the table — 11/49 baseline deaths. Runs in upkeep (per
// part); the already-assigned guard keeps it to one worker per need.
// Assign in person (assignTask refuses remote).
function workWater(Game, ctx) {
  try {
    if (!Game.playerAtHaven || !Game.playerAtHaven()) return;
    const v = Game.state.village || {};
    const vw = v.water || { clean: 0, dirty: 0 };
    const stored = (vw.clean || 0) + (vw.dirty || 0);
    const mouths = (v.roster || []).length;
    const asg = v.assignments || {};
    const onTask = (t) => Object.values(asg).some(a => a && a.task === t);
    const free = (v.roster || []).filter(id => {
      if (id === Game.villagerId) return false;
      if (asg[id]) return false;
      try { const p = Game.getPerson(id); return p && !p.dead; } catch (e) { return true; }
    });
    let fi = 0;
    const assignOne = (task) => {
      if (fi >= free.length) return false;
      try { Game.assignTask(free[fi++], task, { via: 'in-person' }); return true; }
      catch (e) { return false; }
    };
    if (stored < mouths * 4 && !onTask('water')) assignOne('water');
    if ((v.wood || 0) < 8 && !onTask('wood')) assignOne('wood');
  } catch (e) {}
}

// COUNTER-PLAY (bal-survival 2026-10-10): an honest player in the depletion
// build doesn't just forage harder — they build the second food leg. When
// the near grounds thin: break garden ground at haven, put a green-handed
// villager on garden duty (they sow from village seed stock), and put a
// fisher on the creek. Traps: set one when holding a trap tool on wild
// ground. All best-effort, in-person, obedience-gated like any leadership.
function groundsThinning(Game) {
  try {
    let stocked = 0, thin = 0;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      if (x === 4 && y === 4) continue;
      const dist = Math.abs(x - 4) + Math.abs(y - 4);
      if (dist < 1 || dist > 2) continue;
      const t = Game.tileAt(x, y);
      if (!t || t.type === 'ruin' || (t.stock || 0) <= 0) continue;
      stocked++;
      if (Game.depletionLevel(t) !== 'lush') thin++;
    }
    return stocked >= 3 && thin / stocked > 0.5;
  } catch (e) { return false; }
}

// SEED-FIRST (bal-survival 2026-10-10): sowing is the player's call, and
// seed is 2 units of a known gardenable plant from the PACK — not the
// pantry (the pantry never holds seed stock; stockPantry makes generic
// items). An honest player sows from the fresh haul BEFORE donating it,
// or the village eats the seed. Returns true when something was sown.
function trySow(Game, ctx) {
  try {
    if (!Game.gardenPlots || !Game.sowOptions || !Game.sowPlot) return false;
    if (!Game.playerAtHaven || !Game.playerAtHaven()) return false;
    const plots = Game.gardenPlots() || [];
    if (!plots.some(p => !p.pid && !p.dead)) return false;
    const opts = (Game.sowOptions() || []).slice();
    if (!opts.length) return false;
    // quick crops first (shoots 7d feed sooner), then richest
    opts.sort((a, b) => (a.growthDays - b.growthDays) || ((b.kcalEach || 0) - (a.kcalEach || 0)));
    try { Game.sowPlot(opts[0].pid); ctx.sown = (ctx.sown || 0) + 1; return true; }
    catch (e) { return false; }
  } catch (e) { return false; }
}

// Forage trip that feeds the garden: travel out, forage, travel home. The
// haul comes home as unidentified lumps (prepStash) — sorting, sowing, and
// donating happen as separate honest steps in daily(), not hidden in the trip.
function forageTripSeedFirst(Game, ctx) {
  const s = Game.state.scholar;
  try {
    const cands = [];
    for (const tt of (Game.travelTargets() || [])) {
      const t = Game.tileAt(tt.x, tt.y);
      if (!t || t.type === 'haven' || t.type === 'ruin' || (t.stock || 0) <= 0) continue;
      let blocked = false;
      try { blocked = !!Game.travelBlockage(tt.x, tt.y); } catch (e) {}
      cands.push({ x: tt.x, y: tt.y, d: tt.d, blocked });
    }
    cands.sort((a, b) => (a.blocked - b.blocked) || (a.d - b.d));
    if (!cands.length) return 0;
    const pick = cands[0];
    const bx = pick.x, by = pick.y;
    const hx = Game.map.px, hy = Game.map.py;
    const res = Game.travelTo(bx, by, pick.blocked);
    if (Game.over || Game.tbfight) { try { Game.travelTo(hx, hy); } catch (e) {} return 0; }
    if (Game.map.px !== bx || Game.map.py !== by) return 0;
    try { Game.doAction('forage', {}); ctx.forageTrips = (ctx.forageTrips || 0) + 1; } catch (e) {}
    try { Game.travelTo(hx, hy); } catch (e) {}
    return 1;
  } catch (e) { try { Game.travelTo(Game.map.px, Game.map.py); } catch (e2) {} return 0; }
}

// Donate the haul: identified edible inventory food goes to the pantry.
// (The seed was already sown by trySow; the player keeps a 1-day buffer.)
function donateHaul(Game, ctx) {
  try {
    const s = Game.state.scholar;
    const cap = Game.kcalCap ? Game.kcalCap() : 2400;
    const keep = cap; // one day's buffer stays in the pack
    let packKcal = (s.inventory || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
    const inv = s.inventory || [];
    for (let i = inv.length - 1; i >= 0; i--) {
      const it = inv[i];
      if (!it || (it.kcalEach || 0) <= 0 || it.edible === false) continue;
      const ik = it.kcalEach * (it.units || 1);
      if (packKcal - ik < keep) continue; // keep the buffer
      try { Game.donateToPantry(i); packKcal -= ik; ctx.donated = (ctx.donated || 0) + 1; } catch (e) {}
    }
  } catch (e) {}
}

// SORT THE HAUL (bal-survival 2026-10-10): foraging yields unknowns, period —
// identification happens at the camp ritual. An honest player sorts the bag
// at haven after a trip: known plants (and field-clicked ones) become real
// food that can be eaten, sown, or donated. Without this the haul is lumps.
// A villager who KNOWS the plants sorts with you — watching a knower teaches
// (faster than solo field-clicks); solo is the fallback.
function sortHaul(Game, ctx) {
  try {
    if (!Game.atCamp || !Game.atCamp()) return 0;
    const stash = (Game.state.scholar || {}).prepStash || [];
    const hasLumps = stash.some(l => l && l.lump && Object.keys(l.lump).length);
    if (!hasLumps) return 0;
    // best sorter: the roster villager who knows the most plants (background
    // knowledge breaks the chicken-and-egg); solo if nobody knows anything.
    let bestVid = null, bestKnown = 0;
    try {
      const v = Game.state.village || {};
      for (const rid of (v.roster || [])) {
        if (rid === Game.villagerId) continue;
        const known = Game.villagerKnowsPlants ? (Game.villagerKnowsPlants(rid) || []).length : 0;
        if (known > bestKnown) { bestKnown = known; bestVid = rid; }
      }
    } catch (e) {}
    let sorted = 0;
    for (let i = stash.length - 1; i >= 0 && sorted < 3; i--) {
      if (stash[i] && stash[i].lump && Object.keys(stash[i].lump).length) {
        try { Game.sortBag(bestVid, i); sorted++; } catch (e) {}
      }
    }
    if (sorted) ctx.sorted = (ctx.sorted || 0) + sorted;
    return sorted;
  } catch (e) { return 0; }
}

function freeVillagers(Game) {
  try {
    const v = Game.state.village || {};
    const asg = v.assignments || {};
    return (v.roster || []).filter(id => {
      if (id === Game.villagerId) return false;
      if (asg[id]) return false;
      try { const p = Game.getPerson(id); return p && !p.dead; } catch (e) { return true; }
    });
  } catch (e) { return []; }
}

function assignBest(Game, task, occWords) {
  try {
    const v = Game.state.village || {};
    const asg = v.assignments || {};
    if (Object.values(asg).some(a => a && a.task === task)) return false;
    const free = freeVillagers(Game);
    if (!free.length) return false;
    const score = (id) => {
      let s = 0;
      try {
        const p = Game.getPerson(id) || {};
        const occ = (p.formerOccupation || '').toLowerCase();
        if (occWords.some(w => occ.includes(w))) s += 2;
        if (Game.villagerCompetence) s += Game.villagerCompetence(id, task);
      } catch (e) {}
      return s;
    };
    free.sort((a, b) => score(b) - score(a));
    try { Game.assignTask(free[0], task, { via: 'in-person' }); return true; }
    catch (e) { return false; }
  } catch (e) { return false; }
}

// assignAnother: like assignBest but allows MULTIPLE villagers on the same
// task (the creek crew, not a lone fisher).
function assignAnother(Game, task, occWords) {
  try {
    const v = Game.state.village || {};
    const free = freeVillagers(Game);
    if (!free.length) return false;
    const score = (id) => {
      let s = 0;
      try {
        const p = Game.getPerson(id) || {};
        const occ = (p.formerOccupation || '').toLowerCase();
        if (occWords.some(w => occ.includes(w))) s += 2;
        if (Game.villagerCompetence) s += Game.villagerCompetence(id, task);
      } catch (e) {}
      return s;
    };
    free.sort((a, b) => score(b) - score(a));
    try { Game.assignTask(free[0], task, { via: 'in-person' }); return true; }
    catch (e) { return false; }
  } catch (e) { return false; }
}

function counterPlay(Game, ctx) {
  try {
    if (!Game.playerAtHaven || !Game.playerAtHaven()) return;
    const day = (Game.state.scholar || {}).day || 0;
    if ((ctx._cpDay || 0) === day) return;
    ctx._cpDay = day;
    // gardens: the answer to thinning ground. Break ground, staff it, sow.
    // Prefer a gardener who KNOWS gardenable plants — their knowledge guides
    // the sowing (villager-guided sowOptions). MAINTAIN the assignment: a
    // garden untended dies, so keep a gardener on duty while plots live.
    try {
      const plots = Game.gardenPlots ? Game.gardenPlots() : [];
      const livePlots = plots.filter(p => p.pid && !p.dead).length;
      const v = Game.state.village || {};
      const hasGardener = Object.values(v.assignments || {}).some(a => a && a.task === 'garden');
      if (plots.length < 6 && (groundsThinning(Game) || plots.length < 2 || (livePlots > 0 && !hasGardener))) {
        // break ground early: 4 plots by day 2-3, the garden needs scale
        // to matter (2 plots is a hobby; 4 is a food leg). 6 was tried:
        // the plot-making ate the gardener's tending time.
        while ((Game.gardenPlots ? Game.gardenPlots().length : 0) < 4) {
          const before = Game.gardenPlots ? Game.gardenPlots().length : 0;
          try { Game.makePlot(); } catch (e) { break; }
          // PROGRESS GUARD (competence panel 2026-10-10): makePlot() returns
          // null without throwing when the player isn't on the haven tile
          // (playerAtHaven is true within 1 node, but makePlot needs the
          // haven tile itself) — a roaming policy (oracle/winseek patrols)
          // interrupted mid-return spins this forever. Break on no progress.
          if ((Game.gardenPlots ? Game.gardenPlots().length : 0) <= before) break;
        }
        if (!hasGardener) {
          const GARDENABLE = new Set(["muscadine","elderberry","blackberry","pawpaw","persimmon","cattail","wild_onion","wood_sorrel","lambs_quarters","chickweed","dandelion","acorn","hickory_nut","walnut"]);
          let knowerAssigned = false;
          try {
            for (const rid of (v.roster || [])) {
              if ((v.assignments || {})[rid]) continue;
              const known = Game.villagerKnowsPlants ? Game.villagerKnowsPlants(rid) : [];
              if (known.some(k => GARDENABLE.has(k))) {
                try { Game.delegateTask(rid, 'garden'); knowerAssigned = true; ctx.gardenStaffed = (ctx.gardenStaffed || 0) + 1; } catch (e) {}
                break;
              }
            }
          } catch (e) {}
          if (!knowerAssigned && assignBest(Game, 'garden', ['farmer', 'gardener', 'botanist', 'herbalist', 'forager', 'cook']))
            ctx.gardenStaffed = (ctx.gardenStaffed || 0) + 1;
        }
      }
      trySow(Game, ctx); // sow from the pack whenever there's an empty plot
    } catch (e) {}
    // fishing: the creek crew. Two fishers from day one — the early deficit
    // kills before the garden matures. Three when the pantry is critical.
    // (Three from day one was tried: more exposure killed more than the
    // extra fish saved. Two is the sweet spot.)
    try {
      const v = Game.state.village || {};
      const pantryKcal = ((v.pantry || [])).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
      const fishers = Object.values(v.assignments || {}).filter(a => a && a.task === 'fish').length;
      const day = (Game.state.scholar || {}).day || 0;
      const wantFishers = pantryKcal < 15000 ? 3 : (pantryKcal < 30000 || day <= 5) ? 2 : 1;
      for (let i = fishers; i < wantFishers; i++) {
        if (assignAnother(Game, 'fish', ['fisherman', 'fishing guide', 'sailor', 'hunter', 'cook']))
          ctx.fishStaffed = (ctx.fishStaffed || 0) + 1;
        else break;
      }
    } catch (e) {}
    // traps: a held trap set on wild ground works while you sleep
    try {
      if ((ctx._trapDay || 0) + 3 <= day) {
        const tools = (Game.state.scholar || {}).tools || [];
        const trap = tools.find(t => t && t.recipeId && t.recipeId !== 'pit_trap');
        const pt = Game.playerTile ? Game.playerTile() : null;
        if (trap && pt && pt.type !== 'haven' && pt.type !== 'ruin') {
          try { Game.setTrap(trap.recipeId); ctx._trapDay = day; ctx.trapsSet = (ctx.trapsSet || 0) + 1; }
          catch (e) {}
        }
      }
    } catch (e) {}
  } catch (e) {}
}

const competent = {
  id: 'competent',
  desc: 'aware experienced player: learns, teaches, cooks, avoids vectors, fights with advantage',
  setup(Game, ctx) {
    ctx.knownAtStart = Object.keys((Game.state.codex || {}).plants || {}).length;
  },
  upkeep(Game, ctx) {
    cookPack(Game, ctx);
    competentEat(Game);
    drinkSafe(Game, ctx);
    checkTicks(Game, ctx);
    workWater(Game, ctx);
  },
  daily(Game, ctx) {
    // the honest food run: forage, sort the haul at camp, sow seed first,
    // donate the rest. (Foraging yields unknowns — an honest player sorts.)
    if (needTrip(Game)) forageTripSeedFirst(Game, ctx);
    sortHaul(Game, ctx); // identify the haul at camp — unknowns become food
    trySow(Game, ctx); // sow from identified pack plants when plots wait
    donateHaul(Game, ctx); // the rest feeds the village
    counterPlay(Game, ctx); // gardens / fishing / traps when the land thins
    // donate surplus beyond a 2-day personal buffer
    try {
      const s = Game.state.scholar;
      const cap = Game.kcalCap();
      if (s.kcal > cap * 1.5) {
        const inv = s.inventory || [];
        for (let i = inv.length - 1; i >= 0; i--) {
          if ((inv[i].kcalEach || 0) > 0 && inv[i].foodState !== 'raw') {
            try { Game.donateToPantry(i); ctx.donated = (ctx.donated || 0) + 1; break; } catch (e) {}
          }
        }
      }
    } catch (e) {}
    teachRound(Game, ctx);
    // LEARN FIRST: knowledge is the food economy. Until we know 5 plants,
    // triple the conversations — gratitude teaches, and taught plants feed.
    try {
      const known = Object.keys((Game.state.codex || {}).plants || {}).length;
      if (known < 5) { talkRound(Game, ctx); talkRound(Game, ctx); }
    } catch (e) {}
    talkRound(Game, ctx);
    lootCorpses(Game, ctx); // strip the dead after fights
    // TAKE THE SYSTEM'S OFFER (coverage 2026-10-09): an experienced player
    // chooses an ability when offered — the sim never did, so ability_granted
    // never fired. Pick the first offer (a competent player takes the gift).
    try {
      const ch = (Game.state.scholar || {}).abilityChoices;
      if (ch && ch.length && Game.chooseAbility) {
        Game.chooseAbility(ch[0].id);
        ctx.choseAbility = (ctx.choseAbility || 0) + 1;
      }
    } catch (e) {}
    const known = Object.keys((Game.state.codex || {}).plants || {}).length;
    ctx.knownPlants = known;
  },
  // Fight only with advantage: assess at fight START and walk away from bad
  // ones (an experienced player doesn't take 3:1 fights). Below 35% HP,
  // walk to the edge (flee-by-barrier). Otherwise strike the weakest.
  fight(Game, ctx) {
    try {
      const f = Game.tbfight;
      if (!f || f.over || !Game.tbIsPlayerTurn()) return false;
      const p = Game.tbFighter('p');
      const hpPct = (p.hp || 0) / Math.max(1, p.maxHp || p.hp || 1);
      const endTurn = () => {
        try {
          const q = Game.tbFighter('p');
          q.moveLeft = 0; q.acted = true;
          Game.tbAfterPlayerAction();
        } catch (e) {}
      };
      const flee = () => {
        try {
          const px = p.mx != null ? p.mx : 4, py = p.my != null ? p.my : 4;
          const tx = px <= 4 ? 0 : 8;
          try { Game.tbPlayerMove(tx, py); ctx.fled = (ctx.fled || 0) + 1; } catch (e) {}
        } catch (e) {}
        endTurn();
        return true;
      };
      // NEW-FIGHT ASSESSMENT: don't start fights you can't win.
      if (ctx._fightObj !== f) {
        ctx._fightObj = f;
        try {
          const monsters = f.fighters.filter(x => x.kind === 'monster' && (x.hp || 0) > 0);
          let totalMhp = 0, maxWave = 1;
          for (const m of monsters) {
            totalMhp += m.maxHp || m.hp || 0;
            const md = ((Game.data || {}).monsters || []).find(d => d.id === m.monsterId);
            if (md && md.wave) maxWave = Math.max(maxWave, md.wave);
          }
          const pmax = p.maxHp || 100;
          const outmatched = totalMhp > 2.5 * pmax ||
            (maxWave >= 2 && hpPct < 0.7) ||
            hpPct < 0.5;
          if (outmatched && monsters.length) {
            ctx.fledBad = (ctx.fledBad || 0) + 1;
            return flee();
          }
        } catch (e) {}
      }
      if (hpPct < 0.35) {
        // retreat toward the nearest edge — the barrier ends pursuit honestly
        return flee();
      }
      const alive = f.fighters.filter(x => x.kind === 'monster' && (x.hp || 0) > 0);
      if (!alive.length) return false;
      alive.sort((a, b) => (a.hp || 0) - (b.hp || 0));
      const tgt = alive[0];
      const px = p.mx != null ? p.mx : 4, py = p.my != null ? p.my : 4;
      const tmx = tgt.mx != null ? tgt.mx : 4, tmy = tgt.my != null ? tgt.my : 4;
      // CLOSE THE DISTANCE (coverage 2026-10-09): striking out of range is a
      // no-op that never advances the turn. Move adjacent first, then strike.
      // (Grid is 0..8; skip off-grid and monster-occupied tiles.)
      try {
        const w = (Game.equippedWeapon && Game.equippedWeapon()) || { range: 1 };
        const d0 = Math.max(Math.abs(tmx - px), Math.abs(tmy - py));
        if (d0 > (w.range || 1)) {
          const occupied = new Set(
            f.fighters.filter(x => x.alive && x.key !== 'p').map(x => x.mx + ',' + x.my));
          let bx = null, by = null, bd = 1e9;
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
            if (!dx && !dy) continue;
            const cx = tmx + dx, cy = tmy + dy;
            if (cx < 0 || cx > 8 || cy < 0 || cy > 8) continue;
            if (occupied.has(cx + ',' + cy)) continue;
            const dd = Math.max(Math.abs(cx - px), Math.abs(cy - py));
            if (dd < bd) { bd = dd; bx = cx; by = cy; }
          }
          if (bx != null) {
            try { Game.tbPlayerMove(bx, by); } catch (e) {}
            ctx.closed = (ctx.closed || 0) + 1;
          }
          endTurn();
          return true;
        }
      } catch (e) {}
      // STRIKE THEN END TURN (coverage 2026-10-09): tbPlayerStrike leaves
      // moveLeft > 0, so the turn never auto-advances — the policy spun on
      // "Already acted" forever, freezing the game clock. End explicitly.
      try { Game.tbPlayerStrike(tgt.key); ctx.struck = (ctx.struck || 0) + 1; } catch (e) {}
      endTurn();
      return true;
    } catch (e) { return false; }
  },
};

module.exports = { competent };
