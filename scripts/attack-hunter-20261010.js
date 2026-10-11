#!/usr/bin/env node
// HOSTILE PLAYTEST (hunter archetype, 2026-10-10):
// Attack surfaces: hunt.meat_yield stacking (single-bake? bounded?),
// tile-population double-spend (spawn + trap), travel continuity
// (park/restore/phantom), edge-bolt release accounting, box-trap
// rattlesnake (recipe warns "pin it", engine delivered a free dead snake),
// dress_game refused-tap costs, fishing.yield stacking on nets,
// cleanShotReady bolt-persistence, pit-trap trapline EV.
// Run: SEED=N node scripts/attack-hunter-20261010.js
const H = require('./sim-harness.js');
const fails = [];
const check = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' — ' + extra : ''));
  if (!cond) fails.push(name);
};

function tile(Game, x, y) { return Game.map.tiles[y][x]; }
function setTile(Game, x, y, type, wildlife) {
  const t = tile(Game, x, y);
  t.type = type; t.wildlife = Object.assign({}, wildlife);
  t.traps = []; t.nets = [];
  return t;
}
function gotoTile(Game, x, y) {
  Game.map.px = x; Game.map.py = y;
  const s = Game.state.scholar; s.mx = 4; s.my = 4;
}
function grantTrap(Game, recipeId, uses) {
  const s = Game.state.scholar;
  s.tools = s.tools || [];
  const tool = { recipeId, uses: uses == null ? 6 : uses, name: recipeId };
  s.tools.push(tool);
  return tool;
}
function clearAllTraps(Game) {
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const t = Game.map.tiles[y][x];
    t.traps = []; t.nets = [];
  }
  Game.state.scholar.tools = (Game.state.scholar.tools || []).filter(t => !/trap|snare|net/i.test(t.recipeId || ''));
}
function giveKnife(Game) {
  const s = Game.state.scholar;
  s.inventory = s.inventory || [];
  if (!Game.hasCuttingTool()) s.inventory.push({ name: 'stone knife', recipeId: 'stone_knife' });
}
const grantAbility = (Game, id, level) => {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  if (!s.abilities.includes(id)) s.abilities.push(id);
  s.abilityLevels = s.abilityLevels || {};
  s.abilityLevels[id] = level == null ? 3 : level;
};

(async () => {
  const { Game } = await H.loadGame({ seed: H.SEED || 20261010 });
  await H.setupGame(Game);
  const S = Game.state, s = S.scholar;
  let said = [];
  Game.say = (m) => { said.push(String(m)); };
  Game.sysSay = () => {};
  const sayText = () => { const t = said.join(' '); said = []; return t; };
  const adeff = (id) => (Game.data.animals || []).find(a => a.id === id) || {};
  const rabbit = adeff('cottontail_rabbit'), deer = adeff('white_tailed_deer');
  console.log('== SEED ' + (process.env.SEED || 20261010) +
    ' rabbit=' + (rabbit.calories || '?') + ' deer=' + (deer.calories || '?') + ' ==');

  // ============ E1: hunt.meat_yield stacking — bounded, single-baked ============
  {
    grantAbility(Game, 'field_dressing', 3);
    // find the synergy + relic that also target hunt.meat_yield and force them on
    const syn = (Game.data.synergies || []).find(x => JSON.stringify(x).includes('hunt.meat_yield'));
    if (syn) { s.synergies = s.synergies || []; if (!s.synergies.includes(syn.id)) s.synergies.push(syn.id); }
    const mult = Game.modTarget('hunt.meat_yield', 100) / 100;
    check('E1 meat_yield multiplier bounded (<=3x)', mult <= 3, 'mult=' + mult.toFixed(2) +
      ' ability=field_dressing synergy=' + (syn ? syn.id : 'none'));
    // trap catch bakes once: gross == base * mult
    gotoTile(Game, 4, 4);
    setTile(Game, 4, 4, 'meadow', { cottontail_rabbit: 5 });
    grantTrap(Game, 'snare', 10);
    Game.setTrap('snare'); sayText();
    let caught = null;
    for (let d = 0; d < 60 && !caught; d++) {
      Game.checkTraps();
      caught = (s.inventory || []).find(i => i.foodKind === 'meat' && i.foodState === 'carcass');
      sayText();
    }
    // trap catch is species-honest now: the carcass keeps the animal's real
    // gross (hunter break-it 2026-10-10, commit 77d43999 — hunt.meat_yield
    // moved to the cleaning as waste reduction, butcherYieldFrac). The old
    // pin asserted the pre-fix energy printer (gross = base*mult at the kill).
    const expected = Math.round(rabbit.calories || 0);
    check('E1 trap catch gross = species-honest base (no kill inflation)', !!caught && caught.hiddenKcal === expected,
      `gross=${caught && caught.hiddenKcal} expected=${expected}`);
    // clean + cook never exceed the gross
    if (caught) {
      s.inventory = [caught];
      giveKnife(Game);
      try { Game.knowsTechnique = () => true; } catch (e) {}
      const gi = s.inventory.findIndex(i => i.foodState === 'carcass');
      Game.cleanCarcass(gi); sayText();
      const cleaned = s.inventory.find(i => i.foodState === 'cleaned');
      const cleanedTotal = cleaned ? (cleaned.kcalEach || 0) * (cleaned.units || 1) : -1;
      check('E1 cleaned total <= gross', cleanedTotal <= (caught.hiddenKcal || 0) + 1,
        `cleaned=${cleanedTotal} gross=${expected}`);
    }
  }

  // ============ E2: population double-spend — spawn + trap on a 1-rabbit tile ============
  {
    s.inventory = [];
    clearAllTraps(Game);
    gotoTile(Game, 2, 2);
    setTile(Game, 2, 2, 'meadow', { cottontail_rabbit: 1 });
    grantTrap(Game, 'snare', 10);
    Game.setTrap('snare'); sayText();
    // force an encounter spawn (decrements to 0)
    let spawned = false;
    for (let i = 0; i < 40 && !spawned; i++) { Game.checkAnimals(); if (s.animal) spawned = true; sayText(); }
    const wlAfterSpawn = (tile(Game, 2, 2).wildlife || {}).cottontail_rabbit || 0;
    check('E2 spawn decrements population', spawned && wlAfterSpawn === 0, `spawned=${spawned} wl=${wlAfterSpawn}`);
    // the trap must find nothing: eligible filters > 0
    let catches = 0;
    for (let d = 0; d < 30; d++) {
      const before = s.inventory.length;
      Game.checkTraps(); sayText();
      if (s.inventory.length > before) catches++;
    }
    const wlEnd = (tile(Game, 2, 2).wildlife || {}).cottontail_rabbit || 0;
    check('E2 no phantom catch from empty tile', catches === 0, `catches=${catches}`);
    check('E2 wildlife never negative', wlEnd >= 0, `wl=${wlEnd}`);
    // the live animal is still the same individual — release returns exactly one
    if (s.animal) {
      const before = (tile(Game, 2, 2).wildlife || {}).cottontail_rabbit || 0;
      Game.encReleaseAnimal(s.animal);
      const after = (tile(Game, 2, 2).wildlife || {}).cottontail_rabbit || 0;
      check('E2 release returns exactly one', after - before === 1 && s.animal === null, `wl ${before}->${after}`);
    }
  }

  // ============ E3: travel continuity — park on leave, restore on return ============
  {
    s.animal = null;
    gotoTile(Game, 3, 3);
    setTile(Game, 3, 3, 'meadow', { cottontail_rabbit: 2 });
    // force an encounter on (3,3)
    for (let i = 0; i < 40 && !s.animal; i++) { Game.checkAnimals(); sayText(); }
    check('E3 encounter active before travel', !!s.animal, '');
    const aid = s.animal && s.animal.id;
    // move to adjacent tile (the live travelTo path parks the animal)
    const px0 = Game.map.px, py0 = Game.map.py;
    try { Game.travelTo(px0 + 1, py0); } catch (e) { console.log('INFO E3 travel threw: ' + e.message); }
    sayText();
    const parked = tile(Game, px0, py0).animal;
    const parkedOk = !s.animal && parked && parked.id === aid;
    check('E3 animal parked on leave tile, not in pocket', parkedOk,
      `s.animal=${!!s.animal} parked=${parked && parked.id}`);
    // walk back — it should be restored, and the population must NOT double-count.
    // force=true: a fallen tree may honestly refuse the return leg (blockage),
    // which would veto the continuity check without testing anything. The
    // engine's refusal is correct; the test wants the park/restore path.
    const wlBefore = (tile(Game, px0, py0).wildlife || {}).cottontail_rabbit || 0;
    if (parkedOk) { try { Game.travelTo(px0, py0, true); } catch (e) {} sayText(); }
    const restored = s.animal && s.animal.id === aid;
    const wlAfter = (tile(Game, px0, py0).wildlife || {}).cottontail_rabbit || 0;
    check('E3 animal restored on return', restored, `restored=${!!restored}`);
    check('E3 park/restore is population-neutral', wlAfter === wlBefore, `wl ${wlBefore}->${wlAfter}`);
    if (s.animal) Game.encReleaseAnimal(s.animal);
  }

  // ============ E4: edge-bolt exit — clean release, exact accounting ============
  {
    s.animal = null;
    gotoTile(Game, 5, 5);
    setTile(Game, 5, 5, 'meadow', { cottontail_rabbit: 2 });
    s.animal = { id: 'cottontail_rabbit', mx: 0, my: 4, aware: 1, stamina: 9, pstate: 'bolt', edgeTurns: 0, wild: true };
    tile(Game, 5, 5).wildlife.cottontail_rabbit = 1; // one left in the ground pop
    let threw = null, rounds = 0;
    try {
      while (s.animal && rounds++ < 20) { Game.preyReaction(s.animal); sayText(); }
    } catch (e) { threw = e.message; }
    const wl = (tile(Game, 5, 5).wildlife || {}).cottontail_rabbit || 0;
    check('E4 edge-bolt exits without exception', !threw && !s.animal, `threw=${threw} rounds=${rounds}`);
    check('E4 release increments population exactly once', wl === 2, `wl=${wl} (1 ground + 1 released)`);
  }

  // ============ E5: box-trap rattlesnake — the recipe warns, the engine must too ============
  {
    s.inventory = [];
    clearAllTraps(Game);
    gotoTile(Game, 6, 6);
    setTile(Game, 6, 6, 'thicket', { timber_rattlesnake: 4 });
    grantTrap(Game, 'box_trap', 6);
    Game.setTrap('box_trap'); sayText();
    let snake = null;
    for (let d = 0; d < 80 && !snake; d++) {
      Game.checkTraps();
      const t = sayText();
      snake = (s.inventory || []).find(i => (i.plantId || '') === 'meat_timber_rattlesnake');
      if (snake) {
        // the species name itself is not the warning — handling-risk language is
        const warned = /pin it|bite|fang|venom|poisoned/i.test(t);
        check('E5 rattlesnake retrieval carries the warned risk', warned,
          `said="${t.slice(0, 140)}"`);
        const bit = /poisoned|venom|-1?\d HP/i.test(t) || (s.poisons || []).some(p => /rattlesnake/i.test(p.name || ''));
        console.log('INFO E5 bite landed this seed: ' + bit + ' (careless path should bite ~60%)');
      }
    }
    check('E5 snake was trappable', !!snake, '');
    if (s.animal) Game.encReleaseAnimal(s.animal);
  }

  // ============ E6: dress_game refused taps cost nothing, rot is retained ============
  {
    grantAbility(Game, 'field_dressing', 2);
    s.inventory = [];
    const kcal0 = s.kcal, ticks0 = s.dayTicks || 0;
    let r1 = null;
    try { r1 = Game.useAbility('field_dressing', 'dress_game'); } catch (e) { r1 = 'threw:' + e.message; }
    const t1 = sayText();
    check('E6 dress_game no-carcass refuses, costs nothing',
      r1 === false && s.kcal === kcal0 && (s.dayTicks || 0) === ticks0,
      `ret=${r1} kcal ${kcal0}->${s.kcal} said="${t1.slice(0, 70)}"`);
    // rotted carcass: refused, retained for the Clean path, no cost
    const rot = Game.foodCarcass(rabbit, 500, s.day - 5, 'trapped');
    rot.spoilDay = s.day - 1;
    s.inventory = [rot];
    let r2 = null;
    try { r2 = Game.useAbility('field_dressing', 'dress_game'); } catch (e) { r2 = 'threw:' + e.message; }
    const t2 = sayText();
    check('E6 dress_game rotted-carcass refuses, keeps the rot, costs nothing',
      r2 === false && s.inventory.length === 1 && s.inventory[0].foodState === 'carcass' && s.kcal === kcal0,
      `ret=${r2} inv=${s.inventory.length} said="${t2.slice(0, 70)}"`);
  }

  // ============ E7: fishing.yield stacking on nets — bounded ============
  {
    s.inventory = [];
    clearAllTraps(Game);
    gotoTile(Game, 1, 1);
    setTile(Game, 1, 1, 'creek', { creek_chub: 8, bluegill: 8 });
    s.inventory.push({ itemId: 'gill_net', name: 'gill net', recipeId: 'gill_net' });
    Game.setNet(); sayText();
    let fish = null;
    for (let d = 0; d < 60 && !fish; d++) { Game.checkNets(); sayText(); fish = (s.inventory || []).find(i => i.foodKind === 'meat' && i.foodState === 'carcass'); }
    const chub = adeff('creek_chub');
    const ratio = fish ? fish.hiddenKcal / (chub.calories || 200) : -1;
    check('E7 netted fish gross bounded (<=3x species kcal)', !!fish && ratio <= 3,
      `gross=${fish && fish.hiddenKcal} species=${chub.calories} ratio=${ratio.toFixed(2)}`);
  }

  // ============ E8: cleanShotReady — survives a bolted strike, dies on a real one ============
  // RNG-ROBUST (2026-10-10): the bolt is a roll; retry the setup until a bolt
  // actually happens (the gill-net rebalance shifted the shared RNG stream,
  // which broke the old single-shot expectation — test fragility, not a game bug).
  {
    grantAbility(Game, 'patient_aim', 2);
    let bolted = false, keptAfterBolt = false, guard0 = 0;
    while (!bolted && guard0++ < 12) {
      s.animal = null;
      gotoTile(Game, 7, 7);
      setTile(Game, 7, 7, 'meadow', { cottontail_rabbit: 3 });
      s.cleanShotReady = false;
      try { Game.useAbility('patient_aim', 'clean_shot'); } catch (e) {}
      sayText();
      const armed = !!s.cleanShotReady;
      // bolted strike: aware=1 animal, strike -> preyReaction bolts pre-strike.
      // huntAnimal returns true when the strike aborted on a bolt (encStrikeReact)
      // AND on a clean kill — distinguish: a bolted animal is still present
      // (it moved), a killed one is gone. Only a bolt must preserve the flag.
      s.animal = { id: 'cottontail_rabbit', mx: 4, my: 5, aware: 1, stamina: 9, pstate: 'graze', edgeTurns: 0, wild: true };
      let struck = false;
      try { struck = !!Game.huntAnimal(); } catch (e) {}
      sayText();
      bolted = armed && struck && !!s.animal;
      if (bolted) keptAfterBolt = !!s.cleanShotReady;
      if (s.animal) { try { Game.encReleaseAnimal(s.animal); } catch (e) {} s.animal = null; }
    }
    console.log('INFO E8 bolt observed=' + bolted + ' flag kept after bolt=' + keptAfterBolt +
      ' (design: the lined-up bonus waits for a real strike — paid cost, kept bonus)');
    check('E8 clean_shot persists through a bolted strike', bolted && keptAfterBolt, '');
    // a resolved strike (kill or miss) consumes it
    s.animal = { id: 'cottontail_rabbit', mx: 4, my: 5, aware: 0, stamina: 9, pstate: 'graze', edgeTurns: 0, wild: true };
    let guard = 0;
    while (s.cleanShotReady && guard++ < 12) {
      s.animal = { id: 'cottontail_rabbit', mx: 4, my: 5, aware: 0, stamina: 9, pstate: 'graze', edgeTurns: 0, wild: true };
      try { Game.huntAnimal(); } catch (e) {}
      sayText();
      if (!s.animal) break;
    }
    check('E8 clean_shot consumed by a resolved strike', !s.cleanShotReady, `guard=${guard}`);
    if (s.animal) Game.encReleaseAnimal(s.animal);
  }

  // ============ E12: pit-trap trapline EV over 30 days (report, not a break) ============
  {
    s.inventory = [];
    clearAllTraps(Game);
    gotoTile(Game, 0, 0);
    setTile(Game, 0, 0, 'forest', { white_tailed_deer: 3 });
    grantTrap(Game, 'pit_trap', 4);
    Game.setTrap('pit_trap'); sayText();
    let totalKcal = 0, catches = 0;
    for (let d = 0; d < 30; d++) {
      const before = s.inventory.length;
      try { Game.simEcology(); } catch (e) {}
      Game.checkTraps(); sayText();
      for (const it of (s.inventory || []).slice(before)) {
        if (it.foodKind === 'meat' && it.foodState === 'carcass') { totalKcal += it.hiddenKcal || 0; catches++; }
      }
    }
    const trapLeft = (tile(Game, 0, 0).traps || []).length;
    console.log(`INFO E12 pit-trap 30d: catches=${catches} gross=${totalKcal}kcal trap_survives=${trapLeft} (uses=4)`);
    check('E12 trapline EV finite (trap breaks, ecology depletes)', catches <= 4,
      `catches=${catches} — a 2-stick trap cannot print infinite deer`);
  }

  console.log(fails.length ? `\n${fails.length} FAILURES: ${fails.join(' | ')}` : '\nALL GREEN');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS THREW:', e); process.exit(2); });
