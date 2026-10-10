#!/usr/bin/env node
// BREAK-IT: food economy, layer 3 (2026-10-09). Hostile attacks on the
// VILLAGE food economy (villager-grit), the prepStash render/pemmican gap,
// the assignTask gate, blood_magic re-verification, and the trap economy.
//
// KILLS:
//   H1. EXPLOIT: villager takes never recorded -> freeloader exile pipeline
//       dead for villagers (draining check unreachable). FIX: villagerMealDay
//       records takes (pantry/pack draws) and gives (surplus shared).
//   H2. HONESTY: haven-role credit double-counted (produced + gives) and
//       conjured real pantry food via surplus. FIX: credit is ledger-only
//       (v.gives via resolveOneAssignment); removed from produced.
//   H3. EXPLOIT: alien-player kills marked dead but left roster -> villageEats
//       fed the corpse (ate AND produced). FIX: villageEats skips dead;
//       alien kill calls removeVillager (established pattern).
//   H4. HONESTY: prepStash render/pemmican never wired (PRESERVATION.md known
//       gap) — engine took a container, UI never passed the stash. FIX: stash
//       Render + Make-pemmican buttons, wired like smoke.
//   H5. SIBLING: player's villageMeal draw never recorded in takes (free
//       communal meals vs the freeloader ledger). FIX: record it.
//   H6. DEAD-CODE: freeloader effort gate (effort<0.5) unreachable for
//       villagers (produced = expected x grit, grit>=0.5 always). FIX:
//       capacity-scaled drain threshold (netDrain > max(1500, totE*3)) ORs
//       with the original gate.
// HELD (with numbers): blood_magic gate, assignTask gate, trap economy,
//   prepStash clocks, mentorship faucet.
//
// Usage: node scripts/test-break-food3-20261009.js
//        BEFORE=1 node scripts/test-break-food3-20261009.js
//        SEED=99 node scripts/test-break-food3-20261009.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
const SEED = parseInt(process.env.SEED || '20261009', 10);

const PRE = ['src/js/game.js', 'src/js/alienPlayers.js'];
const PRE_SRC = ['src/js/app.js']; // source-only checks (DOM, not eval'd)
if (BEFORE) {
  for (const f of PRE.concat(PRE_SRC)) {
    execSync(`git show HEAD:${f} > /tmp/bf3-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/bf3-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');
const srcTextOf = (f) => BEFORE && PRE_SRC.includes(f)
  ? fs.readFileSync(`/tmp/bf3-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seeded BEFORE eval: modules capture Math.random at load

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js touches window at load (browser-only in prod)
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FILES = [...html.matchAll(/<script src="(src\/js\/[^"]+)\?/g)].map(m => m[1])
  .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
for (const f of FILES) {
  try { eval(srcOf(f)); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window; // drop the stub: runtime checks take the sync path without window
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

const says = [];
function freshGame() {
  says.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.tbfight = null;
  return Game.state.scholar;
}

(async () => {
  await Game.init();
  const osay = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return osay(t); };
  Game.drama = () => {};
  Game.audioEvent = () => {};
  console.log(`seed=${SEED}`);

  // ============ H1. villager takes recorded (freeloader draining live) ============
  console.log('\n-- H1. villager takes/gives recorded in the ledger --');
  {
    const s = freshGame();
    const v = Game.state.village;
    const vid = v.roster.find(id => id !== Game.villagerId);
    const person = Game.getPerson(vid);
    v.trust = v.trust || {}; for (const id of v.roster) v.trust[id] = 10;
    v.pantry = [{ name: 'Foraged food', kcalEach: 200, units: 500, spoilDay: 99999, safe: true, kg: 0.2 }];
    const r = Game.villagerMealDay(vid, person, v, {});
    const takes = (v.takes || {})[vid];
    const gives = (v.gives || {})[vid];
    if (BEFORE) {
      ok('BEFORE: villager takes NOT recorded (pipeline dead)', takes === undefined, `takes=${takes}`);
    } else {
      ok('AFTER: villager takes recorded', typeof takes === 'number' && takes >= 0, `takes=${takes}`);
      ok('AFTER: villager gives recorded', typeof gives === 'number' && gives >= 0, `gives=${gives}`);
      ok('AFTER: takes match the pantry draw', Math.abs(takes - Math.round(r.drawn)) < 1, `takes=${takes} drawn=${Math.round(r.drawn)}`);
    }
  }

  // ============ H2. haven credit single-count, no food printing ============
  console.log('\n-- H2. haven credit: ledger-only, single count --');
  {
    const s = freshGame();
    const v = Game.state.village;
    const vid = v.roster.find(id => id !== Game.villagerId);
    const person = Game.getPerson(vid);
    person.formerOccupation = 'chef'; person.age = 30;
    v.trust = v.trust || {}; for (const id of v.roster) v.trust[id] = 90;
    v.pantry = [];
    // assignment PENDING at meal time (the double-count case)
    v.assignments = {}; v.assignments[vid] = { task: 'cook' };
    const credit = Game.havenRoleCredit(vid, v);
    const r = Game.villagerMealDay(vid, person, v, {});
    const lg = v.contribLog[vid];
    const dayProd = Game.villagerDayProduction(person, vid, v);
    if (BEFORE) {
      ok('BEFORE: produced includes haven credit (food-printing)', lg.produced > dayProd + credit * 0.5, `produced=${lg.produced} dayProd~${Math.round(dayProd)} credit=${credit}`);
    } else {
      // produced must be within the grit band of the identity model — the
      // 1120 credit must NOT be in there (grit rolls 0.5..1.3, so allow wide)
      const expDaily = Game.villagerExpectedDaily(person, vid, v);
      ok('AFTER: produced excludes haven credit', lg.produced < expDaily * 1.4 && lg.produced > expDaily * 0.4,
        `produced=${lg.produced} expected~${Math.round(expDaily)} credit=${credit}`);
      ok('AFTER: no pantry food conjured from credit', Game.pantryKcalLive(v) < 1500, `pantry=${Game.pantryKcalLive(v)}`);
    }
    // the ledger path: resolve -> gives (single count)
    Game.resolveOneAssignment(vid, { task: 'cook' });
    const gives = (v.gives || {})[vid] || 0;
    ok('haven credit lands in gives (ledger)', gives >= credit, `gives=${gives} credit=${credit}`);
  }

  // ============ H3. alien-kill phantom eaters ============
  console.log('\n-- H3. dead villagers do not eat --');
  {
    const s = freshGame();
    const v = Game.state.village;
    const vid = v.roster.find(id => id !== Game.villagerId);
    const person = Game.getPerson(vid);
    person.dead = true; // simulate alien-kill state: dead, still rostered
    v.trust = v.trust || {}; for (const id of v.roster) v.trust[id] = 10;
    v.pantry = [{ name: 'Foraged food', kcalEach: 200, units: 100, spoilDay: 99999, safe: true, kg: 0.2 }];
    const before = Game.pantryKcalLive(v);
    // isolate: only the dead villager's draw matters — measure via direct call
    const r = Game.villagerMealDay(vid, person, v, {});
    if (BEFORE) {
      ok('BEFORE: dead villager eats (phantom)', r.ate > 0, `ate=${Math.round(r.ate)}`);
    } else {
      // AFTER: villageEats skips dead. Direct villagerMealDay is engine-low-level;
      // the guard lives in villageEats. Verify via villageEats.
      const s2 = freshGame();
      const v2 = Game.state.village;
      const vid2 = v2.roster.find(id => id !== Game.villagerId);
      Game.getPerson(vid2).dead = true;
      v2.trust = v2.trust || {}; for (const id of v2.roster) v2.trust[id] = 10;
      v2.pantry = [{ name: 'Foraged food', kcalEach: 200, units: 100, spoilDay: 99999, safe: true, kg: 0.2 }];
      Game.villageEats();
      const lg = (v2.contribLog || {})[vid2];
      ok('AFTER: villageEats skips the dead (no meal, no production)', !lg, `contribLog=${lg ? 'present' : 'absent'}`);
    }
    // alien kill removes from roster (pattern-conformant)
    if (!BEFORE) {
      const s3 = freshGame();
      const v3 = Game.state.village;
      const victim = v3.roster.find(id => id !== Game.villagerId);
      // simulate the alien kill path directly
      const vp = Game.vpOf(victim) || {};
      vp.dead = true;
      Game.removeVillager(victim, 'killed');
      ok('AFTER: alien-killed villager leaves the roster', !v3.roster.includes(victim), `roster has them: ${v3.roster.includes(victim)}`);
    }
  }

  // ============ H4. prepStash render/pemmican wired ============
  console.log('\n-- H4. prepStash render/pemmican gap closed --');
  {
    const appSrc = srcTextOf('src/js/app.js');
    const hasRenderBtn = /data-stash-render/.test(appSrc);
    const hasPemBtn = /data-stash-pemmican/.test(appSrc);
    if (BEFORE) {
      ok('BEFORE: no stash render button', !hasRenderBtn);
      ok('BEFORE: no stash pemmican button', !hasPemBtn);
    } else {
      ok('AFTER: stash render button exists', hasRenderBtn);
      ok('AFTER: stash pemmican button exists', hasPemBtn);
      ok('AFTER: render wired to stash container', /Game\.renderFat\(\+b\.dataset\.stashRender, stashOf\(\)\)/.test(appSrc));
      ok('AFTER: pemmican wired to stash container', /Game\.makePemmican\(stashOf\(\)\)/.test(appSrc));
    }
    // engine honesty: clocks for the top ladder rungs (bonus-aware, one boundary)
    const s = freshGame();
    const day = s.day;
    const bonus = Game.spoilBonusDays();
    const pem = { name: 'Pemmican', foodKind: 'meat', foodState: 'pemmican', kcalEach: 600, units: 3, spoilDay: day + 120 };
    const rf = { name: 'Tallow', foodKind: 'fat', foodState: 'rendered', kcalEach: 810, units: 1, spoilDay: day + 90 };
    ok('stashClock pemmican honest (120d+bonus)', Game.stashClock(pem) === `spoils in ${120 + bonus}d`, Game.stashClock(pem));
    ok('stashClock rendered honest (90d+bonus)', Game.stashClock(rf) === `spoils in ${90 + bonus}d`, Game.stashClock(rf));
    s.day = day + 120 + bonus;
    ok('pemmican rots on its clock (not immortal)', Game.isSpoiled(pem), `day+${120 + bonus}`);
    s.day = day + 119 + bonus;
    ok('pemmican good before its clock', !Game.isSpoiled(pem), `day+${119 + bonus}`);
    s.day = day;
    // render from the stash container via engine
    const stash = Game.prepStash(); stash.length = 0;
    stash.push({ name: 'Bear fat (raw)', foodKind: 'fat', foodState: 'raw', edible: false, units: 1, kcalEach: 0, hiddenKcal: 900, spoilDay: day + 2, kg: 0.5 });
    try { Game.renderFat(0, stash); } catch (e) {}
    ok('engine renders from stash container', stash[0] && stash[0].foodState === 'rendered', stash[0] && stash[0].foodState);
    ok('rendered fat clocked at 90d', stash[0] && stash[0].spoilDay === day + 90, `spoilDay=${stash[0] && stash[0].spoilDay}`);
  }

  // ============ H5. player villageMeal takes recorded ============
  console.log('\n-- H5. player villageMeal draw recorded --');
  {
    const s = freshGame();
    const v = Game.state.village;
    v.pantry = [{ name: 'Foraged food', kcalEach: 200, units: 100, spoilDay: 99999, safe: true, kg: 0.2 }];
    s.kcal = 0;
    v.trust = v.trust || {}; v.trust[Game.villagerId] = 90;
    Game.villageMeal();
    const takes = (v.takes || {})[Game.villagerId] || 0;
    const meal = v.lastPlayerMeal || 0;
    if (BEFORE) {
      ok('BEFORE: villageMeal draw not in takes', takes === 0 && meal > 0, `takes=${takes} meal=${Math.round(meal)}`);
    } else {
      ok('AFTER: villageMeal draw recorded in takes', takes > 0 && Math.abs(takes - Math.round(meal)) < 2, `takes=${takes} meal=${Math.round(meal)}`);
    }
  }

  // ============ H6. freeloader gate reachability ============
  console.log('\n-- H6. freeloader pipeline fires on sustained drain --');
  {
    // spec scenario (from the villager-grit proof): produced=50, exp=1500, takes 800/d
    const s = freshGame();
    const v = Game.state.village;
    const vid = v.roster.find(id => id !== Game.villagerId);
    let voted = false;
    const origVote = Game.freeloadVote.bind(Game);
    Game.freeloadVote = function (id) { if (id === vid) voted = true; return origVote(id); };
    for (let d = 1; d <= 16; d++) {
      Game.state.scholar.day = d;
      v.contribLog = v.contribLog || {};
      v.contribLog[vid] = { produced: 50, expected: 1500, day: d };
      v.takes = v.takes || {};
      v.takes[vid] = (v.takes[vid] || 0) + 800;
      Game.freeloaderTick(v);
    }
    Game.freeloadVote = origVote;
    const fl = (v.freeload || {})[vid] || {};
    ok('sustained drain: warned (stage>=2)', (fl.stage || 0) >= 2, `stage=${fl.stage}`);
    ok('sustained drain: vote (stage 3)', (fl.stage || 0) >= 3, `stage=${fl.stage}`);
    // capacity-scaled: elderly modest drain never flags
    const s2 = freshGame();
    const v2 = Game.state.village;
    const oldId = v2.roster.find(id => id !== Game.villagerId);
    const oldP = Game.getPerson(oldId);
    oldP.age = 72; oldP.formerOccupation = 'librarian';
    for (let d = 1; d <= 20; d++) {
      Game.state.scholar.day = d;
      const exp = Game.villagerExpectedDaily(oldP, oldId, v2);
      v2.contribLog = v2.contribLog || {};
      v2.contribLog[oldId] = { produced: Math.round(exp * 0.9), expected: Math.round(exp), day: d };
      v2.takes = v2.takes || {};
      v2.takes[oldId] = (v2.takes[oldId] || 0) + 300;
      Game.freeloaderTick(v2);
    }
    const fl2 = (v2.freeload || {})[oldId] || {};
    ok('elderly modest drain: never flagged (no cruelty)', (fl2.stage || 0) === 0, `stage=${fl2.stage}`);
  }

  // ============ HELD: blood_magic gate (behavioral) ============
  console.log('\n-- HELD: blood_magic gate --');
  {
    const s = freshGame();
    s.abilities = [{ id: 'blood_magic' }];
    ok('hasAbility true', !!Game.hasAbility('blood_magic'));
    s.health = 100; s.kcal = 0; s.day = 5; Game.dayPart = 0;
    s.bloodPriceWound = 0; s.bloodPriceUses = 0; s.bloodPriceDayPart = null;
    let uses = 0;
    for (let i = 0; i < 6; i++) if (Game._activateAbilityInner('blood_magic') !== false) uses++;
    ok('2/daypart enforced', uses === 2, `uses=${uses}`);
    ok('wound +10/use', s.bloodPriceWound === 20, `wound=${s.bloodPriceWound}`);
    ok('+500 kcal/use', s.kcal === 1000, `kcal=${s.kcal}`);
    // kcalCap clamp
    s.kcal = Game.kcalCap() - 100; s.health = 100; Game.dayPart = 1;
    s.bloodPriceWound = 0; s.bloodPriceUses = 0; s.bloodPriceDayPart = null;
    Game._activateAbilityInner('blood_magic');
    ok('clamped to kcalCap', s.kcal === Game.kcalCap(), `kcal=${s.kcal} cap=${Game.kcalCap()}`);
    // wound refuse
    s.bloodPriceWound = 50; s.health = 100;
    ok('refused at wound>=50', Game._activateAbilityInner('blood_magic') === false);
    // daypart key rollover
    s.bloodPriceWound = 0; s.health = 100; s.kcal = 0; s.day = 5; Game.dayPart = 2;
    s.bloodPriceUses = 0; s.bloodPriceDayPart = null;
    const u1 = Game._activateAbilityInner('blood_magic') !== false;
    const u2 = Game._activateAbilityInner('blood_magic') !== false;
    const u3 = Game._activateAbilityInner('blood_magic') !== false;
    ok('new daypart: 2 uses then refuse', u1 && u2 && !u3);
    // day rollover, same part number
    s.day = 6; Game.dayPart = 2; s.health = 100; s.bloodPriceWound = 0;
    ok('new day: gate resets (day-part key)', Game._activateAbilityInner('blood_magic') !== false);
    // save/load: wound survives a JSON round-trip (the whole scholar does)
    s.bloodPriceWound = 33;
    const rt = JSON.parse(JSON.stringify(Game.state));
    ok('wound survives save/load round-trip', rt.scholar.bloodPriceWound === 33, `wound=${rt.scholar.bloodPriceWound}`);
    // menu mirror honesty
    s.bloodPriceWound = 0; s.bloodPriceUses = 0; s.bloodPriceDayPart = null;
    s.day = 7; Game.dayPart = 0; s.health = 100;
    Game._activateAbilityInner('blood_magic'); Game._activateAbilityInner('blood_magic');
    const acts = Game._legacyActivatables.call(Game);
    const bm = acts.find(a => a.abilityId === 'blood_magic');
    ok('menu mirrors the cap (unavailable after 2)', bm && bm.available === false, `available=${bm && bm.available}`);
  }

  // ============ HELD: assignTask gate ============
  console.log('\n-- HELD: assignTask gate --');
  {
    const s = freshGame();
    const v = Game.state.village;
    const vid = v.roster.find(id => id !== Game.villagerId);
    Game.map.px = 0; Game.map.py = 0; v.px = 4; v.py = 4; // player far from haven
    const r1 = Game.assignTask(vid, 'forage');
    ok('remote assignTask refused', r1 === null, `returned ${r1 === null ? 'null' : 'allowed'}`);
    const r2 = Game.assignTask(vid, 'forage', { via: 'signal-fire' });
    ok('bogus via refused', r2 === null);
    // at haven: allowed (set trust high so the obedience check passes —
    // a refusal is the designed "they said no" path, not the gate)
    Game.map.px = 4; Game.map.py = 4;
    v.trust = v.trust || {}; v.trust[vid] = 90;
    const r3 = Game.assignTask(vid, 'forage', { via: 'in-person' });
    ok('face-to-face allowed', r3 && r3.ok, `ok=${r3 && r3.ok}`);
    // UI honesty: remote sheet refuses upfront when no methods
    const methods = Game.remoteAssignMethods ? Game.remoteAssignMethods() : [];
    ok('no remote methods by default (UI sheet refuses honestly)', methods.length === 0, `methods=${methods.length}`);
  }

  // ============ HELD: trap economy bounded ============
  console.log('\n-- HELD: trap economy --');
  {
    const recipes = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/recipes.json'), 'utf8'));
    const animals = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/animals.json'), 'utf8'));
    const am = {}; animals.forEach(a => am[a.id] = a);
    // pit trap: the hottest table — bounded by uses + wildlife depletion
    const pit = recipes.find(r => r.id === 'pit_trap');
    ok('pit trap uses bounded (4)', pit.uses === 4, `uses=${pit.uses}`);
    // uses decrement per catch (no infinite trap)
    const s = freshGame();
    const t = Game.tileAt(4, 4);
    t.traps = [{ recipeId: 'snare', mx: 4, my: 4, setDay: s.day, uses: 3 }];
    t.wildlife = { cottontail_rabbit: 5 };
    const u0 = t.traps[0].uses;
    // force catches by stubbing random high? No — verify the decrement path exists in code
    const src = srcOf('src/js/game.js');
    ok('trap.uses decrements per catch', /trap\.uses -= 1/.test(src));
    ok('trap breaks at 0 uses', /if \(trap\.uses <= 0\)/.test(src));
    ok('catches deplete wildlife', /_wl\[catchId\]--/.test(src));
    ok('only eligible (present) species caught', /filter\(sid => \(\_wl\[sid\] \|\| 0\) > 0\)/.test(src));
    // expected value sanity: snare lifetime ~3133 kcal gross for vine+stick
    const snare = recipes.find(r => r.id === 'snare');
    const mean = snare.catches.reduce((tt, id) => tt + (am[id] ? am[id].calories : 0), 0) / snare.catches.length;
    const lifetime = 0.4 * mean * snare.uses;
    ok('snare lifetime EV ~3k kcal (fair for craft+time)', lifetime > 2000 && lifetime < 5000, `EV~${Math.round(lifetime)}`);
  }

  // ============ HELD: mentorship is not a free-food faucet ============
  console.log('\n-- HELD: mentorship/knowledge-spread faucet audit --');
  {
    const s = freshGame();
    const v = Game.state.village;
    const vid = v.roster.find(id => id !== Game.villagerId);
    const person = Game.getPerson(vid);
    v.party = [Game.villagerId, vid];
    Game.state.codex.plants = Game.state.codex.plants || {};
    const pids = (Game.data.plants || []).slice(0, 5).map(p => p.id);
    for (const pid of pids) Game.state.codex.plants[pid] = { level: 1 };
    const before = Game.villagerDayProduction(person, vid, v);
    // 30 days of mentoring: +0.05 per 10 xp, cap 0.5
    for (let d = 1; d <= 30; d++) { Game.state.scholar.day = d; Game.mentorTick(v); }
    const bonus = person.mentorBonus || 0;
    ok('mentorBonus capped at 0.5', bonus <= 0.5 + 1e-9, `bonus=${bonus}`);
    const after = Game.villagerDayProduction(person, vid, v);
    // the bonus multiplies the villager's OWN production (feeds self first) —
    // no kcal conjured from nothing. The return compounds with learned
    // knowledge (cap 2.0 — Steve 2026-10-09 food early balance moved it from
    // 1.8; this assertion was stale): bounded at ~3.0x of base after a 30-day
    // investment in ONE villager, not a faucet. Assert the component caps hold.
    const kf = Game.villagerKnowledgeFactor(vid, v);
    ok('mentorship components bounded (bonus<=0.5, kf<=2.0)', bonus <= 0.5 + 1e-9 && kf <= 2.0 + 1e-9, `bonus=${bonus} kf=${kf}`);
    ok('mentorship grows production (not flat)', after > before, `${Math.round(before)} -> ${Math.round(after)}`);
    // knowledge factor capped at 2.0 (no runaway) — Steve 2026-10-09 food
    // early balance moved the cap from 1.8; this assertion was stale.
    v.taught = v.taught || {}; v.taught[vid] = pids.concat(['x1','x2','x3','x4','x5','x6','x7','x8','x9','x10','x11','x12','x13']);
    ok('knowledgeFactor capped at 2.0', Game.villagerKnowledgeFactor(vid, v) === 2.0);
  }

  console.log(`\n${pass} passed, ${fail} failed (seed=${SEED}, mode=${BEFORE ? 'BEFORE' : 'AFTER'})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL', e.stack.split('\n').slice(0, 6).join('\n')); process.exit(2); });
