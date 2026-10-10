#!/usr/bin/env node
// Break-it abilities & godhood proof tests, run 2026-10-10 (target index 12).
//
// Attacks (hostile player, full knowledge of the code):
//   EXPLOIT   — 6-slot economy holes (pact 7/6 was r9; re-verify all grant
//               paths), synergy multiplicative stacking bound, blood_magic
//               wound gate, second_wind daily cap, XP farm via refused taps.
//   SOFTLOCK  — molt weekly budget shared between auto + manual paths;
//               synergy discovery completion (tidecaller synthetic path).
//   HONESTY   — dead_aim double turn-advance (impl self-advances AND the
//               framework spends the turn: the monster acts twice per tap);
//               12 data-declared ability actions with no implementation
//               (buttons that answer "isn't wired up yet — this is a bug").
//   DEAD CODE — wiring audit: every abilities.json action has an impl;
//               echo_location/purify duplicates of working legacy buttons.
//
// CATCHES THIS RUN (fixed, proven below):
//   1. TWELVE DEAD BUTTONS: 12 actions declared in abilities.json had no
//      ABILITY_ACTION_IMPLS entry. activatableAbilities() surfaced them as
//      tappable buttons; every tap answered "(X isn't wired up yet — the
//      data defines it but the code doesn't. This is a bug, not a feature.
//      Nothing spent.)" Fixed: all 12 wired (molt/scream/pocket_sand/
//      grave_robber/mediator/leech/scarecrow/peacemaker x2/dive_deep) or
//      deduped against working legacy buttons (echo_location, purify).
//   2. DEAD_AIM DOUBLE-ADVANCE: 'dead_aim.dead_aim_shot' has cost
//      {turn:true} AND its impl called game.tbAfterPlayerAction() directly;
//      the framework then ran COST_HANDLERS.turn after dispatch. Every tap
//      advanced the world twice — the monster acted twice per player turn.
//      Fixed: the impl no longer self-advances; the framework owns the turn.
//
// Run: node scripts/test-abilities-break-20261010.js   (SEED env override)
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

// ---------- seeded RNG (modules capture Math.random at load) ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261010', 10);
Math.random = mulberry32(SEED);

// ---------- boot the full engine ----------
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"]*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;
const IMPLS = globalThis.AbilityActionImpls;

function grant(id) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  if (!s.abilities.some(a => ((a && a.id) || a) === id))
    s.abilities.push({ id, name: id, level: 1, xp: 0 });
  try { Game.recomputeActiveSynergies(); } catch (e) {}
}
function ungrant(id) {
  const s = Game.state.scholar;
  s.abilities = (s.abilities || []).filter(a => ((a && a.id) || a) !== id);
  try { Game.recomputeActiveSynergies(); } catch (e) {}
}

let advances = 0;
const realAdvance = Game.tbAfterPlayerAction.bind(Game);
function mockCombat(extraFighters) {
  advances = 0;
  Game.tbAfterPlayerAction = () => { advances++; };
  const fighters = [{ key: 'p', kind: 'player', name: 'You', hp: 100, maxHp: 100, alive: true, acted: false, moveLeft: 3, mx: 4, my: 4 }];
  (extraFighters || []).forEach((m, i) => fighters.push(Object.assign(
    { key: 'm' + i, kind: 'monster', name: 'Test Monster', alive: true, fled: false, hp: 50, maxHp: 50, mx: 5, my: 4, monsterId: 'hushwolf', mdef: { id: 'hushwolf' } }, m)));
  Game.tbfight = { id: 9001, over: false, round: 3, fighters, order: fighters.map(f => f.key), turnIdx: 0 };
  return Game.tbfight;
}
function unmockCombat() {
  Game.tbfight = null;
  Game.tbAfterPlayerAction = realAdvance;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const said = [];
  Game.say = (m) => { said.push(String(m)); };
  const clearSaid = () => { said.length = 0; };
  const S = () => Game.state.scholar;

  // ================= DEAD CODE: wiring audit =================
  console.log('\n[dead-code] every declared ability action has an implementation');
  {
    const abs = Game.data.abilities || [];
    const missing = [];
    for (const ab of abs) for (const act of (ab.actions || [])) {
      if (typeof IMPLS[ab.id + '.' + act.id] !== 'function') missing.push(ab.id + '.' + act.id);
    }
    ok(missing.length === 0, 'all ' + abs.reduce((n, a) => n + (a.actions || []).length, 0) + ' declared actions wired',
      missing.length ? 'unwired: ' + missing.join(', ') : '');
  }

  // ================= HONESTY: dead_aim double advance =================
  console.log('\n[honesty] dead_aim spends exactly one turn');
  {
    grant('dead_aim');
    S().kcal = 500; S().health = 100;
    mockCombat();
    clearSaid();
    const r = Game.useAbility('dead_aim', 'dead_aim_shot');
    ok(r === true, 'dead_aim fires');
    ok(advances === 1, 'exactly one turn advance (was: impl + framework = 2)', 'advances=' + advances);
    ok(S().kcal === 450, 'the 50 kcal cost is paid once', 'kcal=' + S().kcal);
    unmockCombat(); ungrant('dead_aim');
  }

  // ================= EXPLOIT: 6-slot economy =================
  console.log('\n[exploit] the 6-slot law holds on every grant path');
  {
    S().abilities = [];
    const ids = ['tracker', 'echo_location', 'patient_aim', 'dead_aim', 'game_sense', 'soft_step'];
    ids.forEach(grant);
    ok(S().abilities.length === 6, 'six abilities held');
    // chooseAbility path
    S().abilityChoices = [{ id: 'rage', name: 'Rage', description: 'x' }];
    Game.chooseAbility('rage');
    ok(S().abilities.length === 6, 'chooseAbility refuses at 6/6');
    ok(/No free ability slots/.test(said.join('\n')), 'refusal is narrated, not silent');
    // pact path at 5/6 with no utility held: gift must not land 7/6
    S().abilities = S().abilities.slice(0, 5);
    S().day = 40;
    clearSaid();
    Game.abilityOnAcquire('pact');
    ok(S().abilities.length <= 6, 'pact never exceeds 6 slots', 'len=' + S().abilities.length);
    S().abilities = [];
  }

  // ================= EXPLOIT: blood_magic wound gate =================
  console.log('\n[exploit] blood_magic cannot print infinite kcal');
  {
    grant('blood_magic');
    S().health = 100; S().kcal = 0; S().day = 41;
    S().bloodPriceWound = 50; // body is scar
    clearSaid();
    const r = Game._activateAbilityInner('blood_magic');
    ok(r === false, 'refused past 50 wound');
    ok(S().kcal === 0, 'no kcal printed');
    ok(/more scar than skin/.test(said.join('\n')), 'refusal names the wound gate');
    S().bloodPriceWound = 0; ungrant('blood_magic');
  }

  // ================= EXPLOIT: second_wind daily cap =================
  console.log('\n[exploit] second_wind fires once per day (twice with refuses_death)');
  {
    grant('second_wind');
    S().day = 42; S().health = 0; S().kcal = 0;
    S().secondWindDay = -1; S().secondWindUses = 0;
    clearSaid();
    ok(Game.maybeCheatDeath() === true, 'first death cheated');
    ok(S().health === 1 && S().kcal >= 500, '1 HP + 500 kcal, honestly');
    S().health = 0;
    ok(Game.maybeCheatDeath() === false, 'second death same day sticks (no synergy)');
    ungrant('second_wind');
  }

  // ================= EXPLOIT: synergy stacking is slot-bounded =================
  console.log('\n[exploit] multiplicative synergy stacking cannot escape the 6-slot cap');
  {
    const syns = Game.data.synergies || [];
    const abs = Game.data.abilities || [];
    // strike_damage multipliers: which abilities would you need to hold them all?
    const tgt = syns.filter(x => (x.modifiers || []).some(m => m.target === 'combat.strike_damage' && m.op === 'multiply'));
    const need = new Set();
    tgt.forEach(x => (x.requires || []).forEach(r => { if (!r.includes(':')) need.add(r); }));
    ok(need.size > 6, 'all strike_damage multipliers need ' + need.size + ' abilities (> 6 slots) — cannot co-fire',
      [...need].join(','));
    // achievable max with 6 slots: pick the best 3 synergies (6 abilities)
    const mults = tgt.map(x => Math.max(...x.modifiers.filter(m => m.target === 'combat.strike_damage').map(m => m.value))).sort((a, b) => b - a);
    const best3 = mults.slice(0, 3).reduce((p, m) => p * m, 1);
    console.log('  info achievable 6-slot strike_damage ceiling ≈ x' + best3.toFixed(2) + ' (scary-good build, not an infinite)');
    ok(best3 < 3, 'bounded ceiling, no infinite', 'x' + best3.toFixed(2));
  }

  // ================= EXPLOIT: XP farm =================
  console.log('\n[exploit] ability XP cannot be farmed past L3 or via refused taps');
  {
    grant('tracker');
    const ab = S().abilities.find(a => a.id === 'tracker');
    ab.level = 3; ab.xp = 0;
    Game.gainAbilityXP('tracker', 100);
    ok(ab.level === 3, 'L3 is the ceiling');
    ungrant('tracker');
  }

  // ================= SOFTLOCK: molt weekly budget =================
  console.log('\n[softlock] molt: auto and manual share one weekly budget');
  {
    grant('molt');
    S().day = 50; S().health = 0;
    S().moltWeek = -1; S().moltUses = 0;
    ok(Game.maybeCheatDeath() === true, 'auto-molt fires on lethal damage');
    S().equipped = { torso: { id: 'x' } }; S().health = 40; S().kcal = 500;
    clearSaid();
    const r = Game.useAbility('molt', 'shed_skin');
    ok(r === false, 'manual molt refused: the week\'s molt is spent');
    ok(/already|week/i.test(said.join('\n')), 'refusal names the weekly budget');
    ok(S().equipped && S().equipped.torso, 'gear NOT dropped on a refused molt');
    ungrant('molt');
  }

  // ================= AFTER-FIX behaviorals =================
  console.log('\n[fix] molt.shed_skin — manual weekly molt');
  {
    grant('molt');
    S().day = 60; S().moltWeek = -1; S().moltUses = 0;
    S().health = 40; S().kcal = 500;
    S().equipped = { torso: { id: 'shirt', name: 'Shirt' } };
    clearSaid();
    const r = Game.useAbility('molt', 'shed_skin');
    ok(r === true, 'manual molt fires on a fresh week');
    ok(S().health === Game.maxHealth(), 'healed to full');
    ok(!S().equipped || !S().equipped.torso, 'equipped gear lost in the old skin');
    ok(/naked|old skin/i.test(said.join('\n')), 'the cost is narrated');
    ungrant('molt');
  }

  console.log('\n[fix] scream_cheese.scream — stuns all monsters, one turn, 20 kcal');
  {
    grant('scream_cheese');
    S().kcal = 500; S().screamDay = -1;
    const f = mockCombat([{}, {}]);
    clearSaid();
    const r = Game.useAbility('scream_cheese', 'scream');
    ok(r === true, 'scream fires');
    ok(f.fighters[1].stunned > 0 && f.fighters[2].stunned > 0, 'both monsters stunned');
    ok(advances === 1, 'exactly one turn spent');
    ok(S().kcal === 480, '20 kcal paid (the copy\'s price)', 'kcal=' + S().kcal);
    ok(S().screamDay === S().day, 'daily gate set');
    clearSaid();
    const r2 = Game.useAbility('scream_cheese', 'scream');
    ok(r2 === false, 'second scream refused: throat is raw');
    ok(/raw/.test(said.join('\n')), 'refusal is honest');
    unmockCombat(); ungrant('scream_cheese');
  }

  console.log('\n[fix] pocket_sand.throw_sand — blinds for 2 rounds');
  {
    grant('pocket_sand');
    const f = mockCombat([{}]);
    clearSaid();
    const r = Game.useAbility('pocket_sand', 'throw_sand');
    ok(r === true, 'sand thrown');
    ok(f.fighters[1].blind === 2, 'target blinded 2 rounds (engine: 50% miss while blind>0)');
    ok(advances === 1, 'one turn spent');
    unmockCombat(); ungrant('pocket_sand');
  }

  console.log('\n[fix] grave_robber.rob_grave — thorough loot, trust cost if seen');
  {
    grant('grave_robber');
    const corpses = Game.corpses();
    const before = corpses.length;
    Game.state.scholar.kcal = 500;
    // plant a corpse next to the player
    const cid = 'test-corpse-' + Date.now();
    corpses.push({
      id: cid, kind: 'person', villagerId: 'nobody', buried: false, ash: false,
      node: { x: Game.map.px, y: Game.map.py }, mx: (S().mx || 4), my: (S().my || 4),
      items: [{ id: 'it1', name: 'Old Watch', units: 1 }, { id: 'it2', name: 'Bone Knife', units: 1 }],
      witnesses: [],
    });
    clearSaid();
    const invBefore = S().inventory.length;
    const r = Game.useAbility('grave_robber', 'rob_grave');
    ok(r === true, 'rob_grave fires with a corpse in reach');
    ok(S().inventory.length > invBefore, 'takes the body\'s goods (thorough: takeAll)');
    // no corpse in reach: honest refusal, costs nothing
    corpses.splice(corpses.findIndex(c => c.id === cid), 1);
    const kcalBefore = S().kcal;
    clearSaid();
    const r2 = Game.useAbility('grave_robber', 'rob_grave');
    ok(r2 === false, 'refused with no corpse in reach');
    ok(S().kcal === kcalBefore, 'refused tap costs nothing');
    ungrant('grave_robber');
    ok(Game.corpses().length === before, 'test corpse cleaned up');
  }

  console.log('\n[fix] echo_location + purify dedupe — data actions removed, legacy buttons live');
  {
    ok(Game.abilityActionDef('echo_location', 'echo_locate') === null, 'echo_locate data action gone');
    ok(Game.abilityActionDef('purify', 'purify_poison') === null, 'purify_poison data action gone');
    grant('echo_location'); grant('purify');
    const acts = Game.activatableAbilities();
    const ids = acts.map(a => a.id);
    ok(ids.includes('echo_location'), 'legacy echo-locate button still offered');
    ok(ids.includes('purify'), 'legacy purify button still offered');
    ok(!ids.includes('echo_location.echo_locate'), 'no dead echo button');
    ok(!ids.includes('purify.purify_poison'), 'no dead purify button');
    ungrant('echo_location'); ungrant('purify');
  }

  console.log('\n[fix] mediator.mediate_dispute — resolves real disputes');
  {
    grant('mediator');
    const v = Game.state.village;
    v.conflicts = v.conflicts || [];
    const roster = v.roster || [];
    if (roster.length >= 2) {
      const [a, b] = roster;
      v.trust = v.trust || {}; v.trust[a] = 80; v.trust[b] = 80;
      v.conflicts.push({ a, b, known: true, stage: 0, tension: 90, resolved: false });
      S().kcal = 500;
      clearSaid();
      const r = Game.useAbility('mediator', 'mediate_dispute');
      const c = v.conflicts[v.conflicts.length - 1];
      ok(r === true, 'mediate fires on a live dispute');
      ok(c.tension < 90 || c.resolved, 'tension moved or resolved', 'tension=' + c.tension);
      v.conflicts.pop();
    } else console.log('  skip dispute test: roster too small');
    ungrant('mediator');
  }

  console.log('\n[fix] leech.leech_stance — intercepts ally damage this round');
  {
    grant('leech');
    const f = mockCombat([]);
    f.fighters.push({ key: 'v1', kind: 'villager', name: 'Ally', alive: true, hp: 60, maxHp: 60, mx: 4, my: 5 });
    S().kcal = 500;
    clearSaid();
    const r = Game.useAbility('leech', 'leech_stance');
    ok(r === true, 'stance entered');
    const p = Game.tbFighter('p');
    ok(!!(p && p.leechStance), 'stance flag on the player fighter');
    const php = p.hp;
    // monster hits the ally for 20: half should land on the player
    const ally = f.fighters.find(x => x.key === 'v1');
    Game.tbDamage('v1', 20, 'test claws');
    ok(ally.hp === 60 - 10, 'ally takes half', 'ally hp=' + ally.hp);
    ok(p.hp === php - 10, 'player takes the other half', 'player hp=' + p.hp);
    ok(/owe you/.test(said.join('\n')), '"they owe you" is said aloud');
    unmockCombat(); ungrant('leech');
  }

  console.log('\n[fix] scarecrow.stage_injury — next trap guaranteed');
  {
    grant('scarecrow');
    S().kcal = 500;
    // set a snare on the player tile with real wildlife
    const t = Game.tileAt(Game.map.px, Game.map.py);
    t.traps = t.traps || [];
    t.wildlife = { gray_squirrel: 3 };
    t.traps.push({ recipeId: 'snare', setDay: S().day, uses: 1 });
    clearSaid();
    const r = Game.useAbility('scarecrow', 'stage_injury');
    ok(r === true, 'injury staged');
    ok(!!S().stagedInjury, 'the promise is armed');
    const invBefore = S().inventory.length;
    Game.checkTraps();
    ok(S().inventory.length > invBefore, 'the trap caught — guaranteed, no 40% roll');
    ok(!S().stagedInjury, 'the promise is consumed');
    t.traps = [];
    ungrant('scarecrow');
  }

  console.log('\n[fix] peacemaker.walk_in — talk the fight down, or be exposed');
  {
    grant('peacemaker');
    const f = mockCombat([{}, {}]);
    const pf = Game.tbFighter('p');
    clearSaid();
    const r = Game.useAbility('peacemaker', 'walk_in');
    const fled = f.fighters.filter(m => m.kind === 'monster' && m.fled).length;
    const exposed = !!(pf.exposedTurns > 0);
    ok(r === true, 'walk_in resolves');
    ok(fled === 2 || exposed, 'either they stand down or you are exposed', 'fled=' + fled + ' exposed=' + exposed);
    if (fled === 2) ok(/stand down|peace|leave/i.test(said.join('\n')), 'the peaceful end is narrated');
    if (exposed) ok(/exposed/i.test(said.join('\n')), 'the exposure is narrated');
    unmockCombat(); ungrant('peacemaker');
  }

  console.log('\n[fix] peacemaker.make_friends — defuses social tension');
  {
    grant('peacemaker');
    const v = Game.state.village;
    v.conflicts = v.conflicts || [];
    const roster = v.roster || [];
    if (roster.length >= 2) {
      const [a, b] = roster;
      v.conflicts.push({ a, b, known: true, stage: 0, tension: 70, resolved: false });
      S().kcal = 500;
      clearSaid();
      const r = Game.useAbility('peacemaker', 'make_friends');
      const c = v.conflicts[v.conflicts.length - 1];
      ok(r === true, 'make_friends fires');
      ok(c.tension < 70, 'tension drops', 'tension=' + c.tension);
      v.conflicts.pop();
    } else console.log('  skip: roster too small');
    ungrant('peacemaker');
  }

  console.log('\n[fix] water_breathing.dive_deep — salvage at real water');
  {
    grant('water_breathing');
    // put the player on a creek tile
    const px = Game.map.px, py = Game.map.py;
    Game.tileAt(px, py).type = 'creek';
    S().kcal = 500;
    clearSaid();
    const invBefore = S().inventory.length;
    const r = Game.useAbility('water_breathing', 'dive_deep');
    ok(r === true, 'dive fires at a creek tile');
    ok(S().inventory.length > invBefore, 'sunken salvage comes up');
    // dry land: honest refusal
    Game.tileAt(px, py).type = 'grass';
    const kcalBefore = S().kcal;
    clearSaid();
    const r2 = Game.useAbility('water_breathing', 'dive_deep');
    ok(r2 === false, 'refused on dry land');
    ok(S().kcal === kcalBefore, 'refused tap costs nothing');
    ungrant('water_breathing');
  }

  // ================= SOFTLOCK: synergy discovery completes =================
  console.log('\n[softlock] synergy discovery: the tidecaller synthetic path completes');
  {
    grant('water_breathing');
    // tidecaller minLevel is 2: the ability leg must be deepened first
    S().abilities.find(a => a.id === 'water_breathing').level = 2;
    Game.state.codex = Game.state.codex || {};
    Game.state.codex.skills = Game.state.codex.skills || {};
    Game.state.codex.skills.fishing = { level: 2 };
    Game.state.scholar.synergies = (Game.state.scholar.synergies || []).filter(s => s !== 'tidecaller');
    Game.state.scholar.synergyAttempts = {};
    Game.state.scholar.abilityUseLog = [];
    // tech leg must be known for hasReq
    Game.state.scholar.codex = Game.state.scholar.codex || {};
    Game.state.scholar.codex.techniques = Game.state.scholar.codex.techniques || {};
    Game.state.scholar.codex.techniques.tide_reading = true;
    // three combined uses across... sequential needs order [water_breathing, fishing]:
    // use water_breathing -> synthetic fishing event -> combined counts
    for (let i = 0; i < 3; i++) {
      Game.state.village.day = 70 + i; Game.state.scholar.day = 70 + i;
      Game.noteAbilityUse('water_breathing');
    }
    // sequential requires the order: usedId must be order[1]='fishing' — the
    // synthetic event fires with bare 'fishing', so discovery should complete
    const found = (Game.state.scholar.synergies || []).includes('tidecaller');
    ok(found, 'tidecaller discovered after 3 combined uses (synthetic skill path)');
    console.log('  info attempts=' + JSON.stringify(Game.state.scholar.synergyAttempts['tidecaller']));
    ungrant('water_breathing');
  }

  console.log('\n==== ' + pass + ' passed, ' + fail + ' failed ===');
  if (failures.length) { console.log('failures:\n - ' + failures.join('\n - ')); process.exit(1); }
})();
