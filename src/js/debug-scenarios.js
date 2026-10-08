// @ontology
// system: debug
// description: One-tap preloaded scenarios for the debug panel. Testing only.
// provides:
//   - SCENARIOS (code: debug-scenarios.js)
//   - RETIRED (code: debug-scenarios.js)
// rules:
//   - (none documented)
// consumes:
//   - (none documented)
/*
 * debug-scenarios.js — one-tap preloaded scenarios for the debug panel.
 *
 * Steve's ask: "You never gave me a debug button with any preloaded
 * scenarios. I haven't tested the deer or the day 7 system transition."
 *
 * And: "You need to make me debug events for this stuff if you want me to
 * test. Clear out old ones only when we think we have them down, and even
 * then you save them for later on a hidden list."
 *
 * Self-attaching module: no edits to game.js. Each scenario starts from a
 * FRESH game (genRoster + newGame, same as character creation would), then
 * mutates state into the scenario. One tap, correct state, no broken refs.
 *
 * RETIREMENT: scenarios are never deleted. When we're confident one is
 * solid, it moves from SCENARIOS to RETIRED — still in the file, still
 * runnable, shown in the debug panel behind a collapsed "retired" toggle.
 *
 * Used by app.js debugPanel. Loaded after justice.js in index.html.
 */
(function () {
  'use strict';
  const G = (typeof globalThis !== 'undefined' && globalThis.Scattering && globalThis.Scattering.Game)
    ? globalThis.Scattering.Game
    : (typeof Game !== 'undefined' ? Game : null);
  if (!G) return;
  const Game = G;

  // Fresh expedition, programmatically — same path as "New Expedition" but
  // without the origin picker. First generated character becomes the player.
  function freshGame() {
    Game.genRoster('Minneapolis, USA');
    const chars = Game.generatedRoster || [];
    const char = chars[0];
    if (!char) throw new Error('debug scenario: no generated characters');
    Game.newGame('Minneapolis, USA', null, char.id, [], 'Debug Scenario');
    return Game.state;
  }

  // Give + equip a weapon, with ammo where needed.
  function giveWeapon(itemId, ammoId, ammoN) {
    const s = Game.state.scholar;
    const def = (Game.data.items || []).find(i => i.id === itemId) || {};
    s.inventory = s.inventory || [];
    s.inventory.push({ itemId, units: 1, kcalEach: 0, kg: 0.5, name: def.name || itemId, bonded: true, bond: 0, bondOffered: [], enhancements: [] });
    s.equipped = s.equipped || {};
    s.equipped.weapon = { itemId, name: def.name || itemId };
    if (ammoId && ammoN) {
      const adef = (Game.data.items || []).find(i => i.id === ammoId) || {};
      s.inventory.push({ itemId: ammoId, material: ammoId, units: ammoN, kcalEach: 0, kg: 0.05, name: adef.name || ammoId });
    }
  }

  // Spawn an animal adjacent to the player (hunt range is 1).
  function spawnAnimalNear(animalId) {
    const s = Game.state.scholar;
    const px = s.mx ?? 4, py = s.my ?? 4;
    // full encounter state — the live loop expects aware/stamina/pstate
    // (a bare {id,mx,my} left the strike path initializing them mid-hunt).
    let cfg = { stamina: 3 };
    try { cfg = Game.encPreyCfg(animalId); } catch (e) {}
    s.animal = { id: animalId, mx: Math.min(8, px + 1), my: py, aware: 0, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0 };
    const adef = (Game.data.animals || []).find(a => a.id === animalId) || {};
    Game.say(`Movement — ${adef.description || 'something alive'}.`);
  }

  // Spawn an animal at an offset from the player (clamped to interior 1..7 —
  // the grid edge is the flee-by-barrier, animals don't start on it).
  function spawnAnimalAt(animalId, dx, dy) {
    const s = Game.state.scholar;
    const px = s.mx ?? 4, py = s.my ?? 4;
    let cfg = { stamina: 3 };
    try { cfg = Game.encPreyCfg(animalId); } catch (e) {}
    s.animal = {
      id: animalId,
      mx: Math.min(7, Math.max(1, px + dx)), my: Math.min(7, Math.max(1, py + dy)),
      aware: 0, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0,
    };
    const adef = (Game.data.animals || []).find(a => a.id === animalId) || {};
    Game.say(`Movement — ${adef.description || 'something alive'}.`);
  }

  function rosterIds() {
    const v = Game.state.village;
    return (v.roster || []).filter(rid => rid !== Game.villagerId);
  }

  // Place villagers at given grid spots (for combat-adjacent scenarios).
  // They walk out with you: set their node to yours first, or the sim
  // deletes their grid positions as not-on-your-node.
  function placeVillagers(spots) {
    const v = Game.state.village;
    v.positions = v.positions || {};
    const ids = rosterIds();
    spots.forEach((spot, i) => {
      const rid = ids[i];
      if (rid) {
        try { Game.npcSetNode(rid, Game.map.px, Game.map.py); } catch (e) {}
        v.positions[rid] = { mx: spot[0], my: spot[1] };
      }
    });
    return ids.slice(0, spots.length);
  }

  function npcName(rid) {
    try { return Game.displayName(rid); } catch (e) { return rid; }
  }

  // WILD NODE (Steve 2026-10-04): wild encounters happen OUT IN THE WILD,
  // not on the haven grounds. Move the player node a couple tiles out from
  // Haven to a wild tile — deterministic, no travel clock, no random
  // encounters. The scenario drops you mid-expedition: you walked out here.
  // 9x9 world (2026-10-07; break-it travel 2026-10-08): the old code scanned
  // a stale 7x7 corner measured from (3,3) — Haven sits at (4,4), so tiles
  // like (4,5) passed the "d>=2" filter while ADJACENT to Haven, and the
  // rim rows/cols 7-8 were never scanned. Measure from the real Haven tile.
  function toWildNode() {
    try {
      const tiles = Game.map.tiles;
      const v = (Game.state && Game.state.village) || {};
      const hx = v.px ?? 4, hy = v.py ?? 4;
      let best = null;
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
        const t = tiles[y][x];
        if (!t || t.type === 'haven' || t.type === 'ruin') continue;
        const d = Math.abs(x - hx) + Math.abs(y - hy);
        if (d < 2) continue; // not the doorstep — actually out
        if (!best || d > best.d) best = { x, y, d };
      }
      if (!best) return false;
      Game.map.px = best.x; Game.map.py = best.y;
      const t = tiles[best.y][best.x];
      t.visited = true; t.revealed = true;
      try { Game.markSeen(best.x, best.y, 'visited'); } catch (e2) {} // you're standing there — the map knows
      const s = Game.state.scholar;
      s.insideHaven = false;
      s.mx = 4; s.my = 4;
      return true;
    } catch (e) { return false; }
  }
  Game.debugToWildNode = toWildNode; // test hook (break-it travel 2026-10-08)

  const SCENARIOS = {
    // 1. Deer encounter — bow in hand, deer adjacent, dawn.
    deer() {
      freshGame();
      toWildNode(); // wild encounter: out in the wild, not the haven grounds (Steve 2026-10-04)
      const s = Game.state.scholar;
      giveWeapon('crude_bow', 'arrow', 12);
      s.insideHaven = false;
      Game.dayPart = 0; // dawn — deer are crepuscular
      spawnAnimalNear('white_tailed_deer');
      Game.say('');
      Game.say('🐞 SCENARIO: deer encounter. Crude bow equipped, 12 arrows.');
      Game.say('Dawn. A white-tail, grazing, not yet aware of you.');
    },

    // ANIMALS (Steve 2026-10-05): separate from monsters. These are prey,
    // not predators. Hunt them, don't fight them.
    rabbit() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('sling');
      s.insideHaven = false;
      Game.dayPart = 0; // dawn
      spawnAnimalNear('cottontail_rabbit');
      Game.say('🐞 SCENARIO: rabbit. Small, fast, everywhere at dawn. Sling in hand.');
    },

    squirrel() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('sling');
      s.insideHaven = false;
      Game.dayPart = 1; // midday
      spawnAnimalNear('gray_squirrel');
      Game.say('🐞 SCENARIO: squirrel. In the trees. Watch for movement.');
    },

    turkey() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('crude_bow', 'arrow', 8);
      s.insideHaven = false;
      Game.dayPart = 0; // dawn
      spawnAnimalNear('wild_turkey');
      Game.say('🐞 SCENARIO: wild turkey. Big bird. Crude bow in hand.');
    },

    opossum() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('sharpened_stick');
      s.insideHaven = false;
      Game.dayPart = 3; // night — nocturnal
      spawnAnimalNear('opossum');
      Game.say('🐞 SCENARIO: opossum. Nocturnal.');
    },

    bullfrog() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      s.insideHaven = false;
      Game.dayPart = 2; // dusk — near water
      spawnAnimalNear('bullfrog');
      Game.say('🐞 SCENARIO: bullfrog. Near water at dusk. Listen for the croak.');
    },

    boxturtle() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      s.insideHaven = false;
      Game.dayPart = 1; // midday
      spawnAnimalNear('box_turtle');
      Game.say('🐞 SCENARIO: box turtle. Slow.');
    },

    fox() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('crude_bow', 'arrow', 10);
      s.insideHaven = false;
      Game.dayPart = 3; // night — nocturnal hunter
      spawnAnimalNear('gray_fox');
      Game.say('🐞 SCENARIO: gray fox. Clever.');
    },

    crayfish() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      s.insideHaven = false;
      Game.dayPart = 1; // midday — in creeks
      spawnAnimalNear('crayfish');
      Game.say('🐞 SCENARIO: crayfish. In the creek.');
    },

    raccoon() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      s.insideHaven = false;
      Game.dayPart = 3; // night
      spawnAnimalNear('raccoon');
      Game.say('🐞 SCENARIO: raccoon. Night. Curious eyes in the dark.');
    },

    snappingturtle() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('sharpened_stick');
      s.insideHaven = false;
      Game.dayPart = 1; // midday — near water
      spawnAnimalNear('snapping_turtle');
      Game.say('🐞 SCENARIO: snapping turtle. Near water at midday. Big. Unhurried.');
    },

    chub() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      s.insideHaven = false;
      Game.dayPart = 1; // midday
      spawnAnimalNear('creek_chub');
      Game.say('🐞 SCENARIO: creek chub. In the water.');
    },

    // 2. Day 7 System transition — the lived-in village. System arrives on next action.
    day7() {
      freshGame();
      Game.debugDay7Experience();
    },

    // 3. Village uprising — you stole, they voted, now they come.
    uprising() {
      freshGame();
      const v = Game.state.village;
      const roster = rosterIds();
      // The fiction: you robbed the pantry blind and refused to make amends.
      // Set up the justice system at stage 4 (uprising).
      v.trust = v.trust || {};
      for (const rid of roster) v.trust[rid] = 3 + Math.floor(Math.random() * 6);
      // Record crimes to justify the uprising
      try {
        Game.recordCrime('theft', { victim: roster[0] });
        Game.recordCrime('attack', { victim: roster[1] });
      } catch (e) {}
      const s = Game.state.scholar;
      s.mx = 4; s.my = 4; s.insideHaven = true;
      Game.map.px = v.x ?? 3; Game.map.py = v.y ?? 3;
      Game.say('🐞 SCENARIO: village uprising. You stole from the pantry, attacked when confronted, refused exile.');
      Game.say('They\'re coming. Anyone who still trusts you (good luck) fights at your side.');
      Game.say('');
      Game.say('CONTEXT: The village justice system has 4 stages:');
      Game.say('  1. Cold shoulder (they go quiet)');
      Game.say('  2. Confrontation (restitution or else)');
      Game.say('  3. Moot (formal trial)');
      Game.say('  4. UPRISING (they come at you)');
      Game.say('');
      Game.say('You\'re at stage 4. Nobody here came to talk. But you\'ll try anyway — desperate people say desperate things.');
      // Trigger the uprising via the justice system
      try {
        const j = Game.justiceState();
        j.stage = 4;
        Game.startVillageUprising('theft, assault, and refusing the moot');
      } catch (e) {
        Game.say('🐞 uprising failed to start: ' + e.message);
        Game.say('You can still act: move, talk to villagers, or flee the haven.');
      }
    },

    // 4. Day 1 fresh spawn — standard start, no tweaks.
    day1() {
      freshGame();
      Game.say('🐞 SCENARIO: day 1, fresh expedition. Standard start.');
    },

    // 5. Language barrier — nobody speaks English.
    language() {
      freshGame();
      const v = Game.state.village;
      const tongues = ['italian', 'mandarin', 'spanish', 'french', 'hindi', 'arabic', 'portuguese', 'russian'];
      v.bgLangs = v.bgLangs || {};
      const roster = rosterIds();
      roster.forEach((rid, i) => {
        const t = tongues[i % tongues.length];
        v.bgLangs[rid] = { native: t, levels: { [t]: 3 } }; // fluent native, zero English
      });
      v.knownNames = {}; // strangers — descriptors, not names
      Game.say('🐞 SCENARIO: language barrier. Nobody here speaks English.');
      Game.say('You are a stranger among strangers. Gestures, tone, the length of a silence — that is your whole vocabulary now.');
    },

    // 6. Liar's den — five villagers with forced, detectable lies.
    liars() {
      freshGame();
      const roster = rosterIds().slice(0, 5);
      const covers = [
        { occupation: 'Brain surgeon', origin: 'Chicago' },
        { occupation: 'Navy SEAL', origin: 'Denver' },
        { occupation: 'Senator', origin: 'Boston' },
        { occupation: 'Michelin chef', origin: 'Seattle' },
        { occupation: 'Fighter pilot', origin: 'Austin' },
      ];
      roster.forEach((rid, i) => {
        const vp = Game.vpOf(rid);
        if (!vp || !vp.id) return;
        Game.npcLies(rid); // init
        const c = covers[i % covers.length];
        vp.lies = {
          occupation: { told: c.occupation, truth: vp.formerOccupation || 'unemployed', motive: 'shame', field: 'occupation' },
          origin: { told: c.origin, truth: Game.npcHomeRegion ? Game.npcHomeRegion(rid) : 'somewhere', motive: 'hiding', field: 'origin' },
        };
      });
      Game.say('🐞 SCENARIO: liar\'s den. Five villagers are lying about who they are.');
      Game.say('Brain surgeons, Navy SEALs, senators — so they say, around the fire. The words sit wrong in their mouths, like borrowed coats.');
      Game.say('People are eating with them every night. Sooner or later the coats come off.');
    },

    // 7. Night hunt — midnight, nocturnal predator, spear in hand.
    night() {
      freshGame();
      toWildNode(); // wild encounter: out in the wild, not the haven grounds (Steve 2026-10-04)
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 3; // night
      spawnAnimalNear('gray_fox');
      Game.say('');
      Game.say('🐞 SCENARIO: night hunt. Midnight. A gray fox is out there.');
      Game.say('Fire-hardened spear in hand.');
    },

    // FULL HUNT (Steve 2026-10-08, hunter audit): the whole arc in one tap.
    // The deer starts FOUR tiles out — not adjacent — so you play the
    // approach yourself: walk at it and it bolts (prey flees, it doesn't sit
    // still), Stalk in quiet, or run it down till it's winded. Strike it calm
    // or winded; clean the carcass fast (spoils in ~2 days). Stone knife in
    // the pack, crude bow in hand, dawn — the deer is crepuscular.
    hunt() {
      freshGame();
      toWildNode(); // wild encounter: out in the wild, not the haven grounds (Steve 2026-10-04)
      const s = Game.state.scholar;
      giveWeapon('crude_bow', 'arrow', 12);
      const kdef = (Game.data.items || []).find(i => i.id === 'stone_knife') || {};
      s.inventory.push({ itemId: 'stone_knife', units: 1, kcalEach: 0, kg: 0.3, name: kdef.name || 'Stone knife' });
      s.insideHaven = false;
      Game.dayPart = 0; // dawn — deer are crepuscular
      s.mx = 3; s.my = 4;
      spawnAnimalAt('white_tailed_deer', 4, 0); // four tiles east, grazing, unaware
      Game.say('');
      Game.say('🐞 SCENARIO: the full hunt. Crude bow in hand, 12 arrows, stone knife in the pack.');
      Game.say('Dawn. A deer, four tiles east, grazing — it has not seen you yet.');
      Game.say('Walk at it and watch it bolt. Stalk in quiet. Run it down till it\'s winded.');
      Game.say('Strike it calm or winded — then clean the carcass fast. Meat rots where it lies.');
    },

    // BUTCHER (Steve 2026-10-08, hunter audit): the carcass, not the chase.
    // A fresh deer carcass in the pack, NO knife, day 1. The rot clock is
    // already ticking (spoils in ~2 days): knap a Stone knife (stone + vine,
    // Craft) or watch it go bad. Teaches the butchering legibility loop.
    butcher() {
      freshGame();
      toWildNode(); // wild encounter: out in the wild, not the haven grounds (Steve 2026-10-04)
      const s = Game.state.scholar;
      s.insideHaven = false;
      Game.dayPart = 1; // midday
      const adef = (Game.data.animals || []).find(a => a.id === 'white_tailed_deer') || {};
      try {
        s.inventory.push(Game.foodCarcass(Object.assign({ name: 'White-tailed Deer' }, adef), 20000, s.day, 'hunted'));
      } catch (e) {
        Game.say('🐞 butcher scenario: could not make the carcass: ' + e.message);
      }
      Game.say('');
      Game.say('🐞 SCENARIO: the butcher. A whole deer carcass in your pack — 20,000 kcal on the bone.');
      Game.say('It spoils in ~2 days. You have NO knife — knap a Stone knife (stone + vine, Craft in your pack),');
      Game.say('then Clean it. Raw is a gamble; cook it over fire, smoke what you can\'t eat soon.');
    },

    // 8. Starving village — pantry nearly empty, trust strained.
    starving() {
      freshGame();
      const v = Game.state.village;
      const s = Game.state.scholar;
      v.pantry = [
        { name: 'Canned soup', kcalEach: 250, units: 6, spoilDay: 9999, safe: true, kg: 0.4, unit: 'can' },
        { name: 'Dried meat', kcalEach: 400, units: 3, spoilDay: 30, safe: true, kg: 0.2, unit: 'strip' },
      ];
      v.pantryKcal = 0; // compat; computed from pantry
      v.trust = v.trust || {};
      for (const rid of rosterIds()) v.trust[rid] = 8 + Math.floor(Math.random() * 8);
      s.kcal = 400; s.energy = 40; s.hydration = 50;
      s.day = 4; // a few days in — the easy food is gone
      Game.say('🐞 SCENARIO: starving village. Day 4. The pantry is nearly empty and everyone knows it.');
      Game.say('Take food if you want. People notice what you take.');
    },

    // 9. Headlight Deer fight — the Highbeam Deer (gallowdeer, wave 1).
    // Per Steve's spec: night, deer unaware/grazing 4-5 tiles out, spear
    // equipped, a couple of villagers nearby (FIFO targeting: the deer goes
    // after ANYONE too close, first in first out). Walk toward it and watch
    // the stance machine: graze → notice → FREEZE (it is aiming, not frozen).
    // First encounter: NO beam-lane warning until the codex learns — you get
    // the freeze, the whine, and dread. That's the test.
    headlight() {
      freshGame();
      toWildNode(); // wild encounter: out in the wild, not the haven grounds (Steve 2026-10-04)
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 3; // night — it's nocturnal
      s.mx = 2; s.my = 4;
      s.monster = { id: 'gallowdeer', mx: 7, my: 4 };
      // Two villagers near the deer: close enough to join combat (within 4
      // of the player) and close enough for the deer to notice them. Watch
      // the threat queue — it doesn't only come for you.
      const placed = placeVillagers([[5, 3], [6, 5]]);
      try {
        const v = Game.state.village;
        v.trust = v.trust || {};
        for (const rid of placed) v.trust[rid] = 40; // they fight beside you
      } catch (e) {}
      Game.say('🐞 SCENARIO: headlight deer. Grazing, five tiles east. It has not seen you.');
      Game.say(`Walk toward it. ${placed.map(npcName).join(' and ')} are out there too.`);
    },

    // Monster batch 2 — the tricksters. Each follows the headlight pattern:
    // fresh game, right day part, spear, monster placed a few tiles out.

    // Flashbulb Moth. Night, drifting four tiles east. Walk toward the
    // wrong-light. It must FACE you to flash — watch the fold, then get
    // behind it before the wings open.
    flashbulb() {
      freshGame();
      toWildNode(); // wild encounter: out in the wild, not the haven grounds (Steve 2026-10-04)
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 3; // night — it's nocturnal
      s.mx = 2; s.my = 4;
      s.monster = { id: 'mirrormoth', mx: 6, my: 4 };
      Game.say('🐞 SCENARIO: flashbulb moth. A dinner-plate moth, catching light wrong, four tiles east.');
      Game.say('Walk toward it.');
    },

    // Choir Toad. Dusk, a war-drum toad four tiles east — it brought a friend
    // (pack: 2). When one throat lets go, they ALL croak. Break the chorus:
    // kill one, split them up — or SHOUT.
    choir() {
      freshGame();
      toWildNode(); // wild encounter: out in the wild, not the haven grounds (Steve 2026-10-04)
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 2; // dusk — crepuscular
      s.mx = 2; s.my = 4;
      s.monster = { id: 'belltoad', mx: 6, my: 4 };
      Game.say('🐞 SCENARIO: choir toads. A toad like a war drum, throat swelling, four tiles east. It brought a friend.');
    },

    // Lockpick Raccoon. Night, too many fingers four tiles east. It's not
    // looking at you — it's looking at your pack. It steals FIRST and fights
    // second: hit it while it runs, or buy it off with food.
    lockpick() {
      freshGame();
      toWildNode(); // wild encounter: out in the wild, not the haven grounds (Steve 2026-10-04)
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.inventory.push({ name: 'Smoked fish', kcalEach: 400, units: 2, spoilDay: 99 });
      s.insideHaven = false;
      Game.dayPart = 3; // night — it's nocturnal
      s.mx = 2; s.my = 4;
      s.monster = { id: 'lockpick_raccoon', mx: 6, my: 4 };
      Game.say('🐞 SCENARIO: lockpick raccoon. Too many fingers, working at something, four tiles east.');
    },

    // Hummice. Night, the grass humming four tiles east — all four of them.
    // (Tactics deliberately NOT in the setup text — first contact should be
    // dread, not a lecture. See game.js humNoticed block.)
    hummice() {
      freshGame();
      toWildNode(); // wild encounter: out in the wild, not the haven grounds (Steve 2026-10-04)
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 3; // night — it's nocturnal
      s.mx = 2; s.my = 4;
      s.monster = { id: 'hummice', mx: 6, my: 4 };
      Game.say('🐞 SCENARIO: hummice. The grass is humming in harmony, four tiles east. Four of them.');
    },

    // Nightlight Catfish. Night, a soft green glow three tiles east — near
    // water, or it's just a glow. Pretty. That's the problem. It won't chase
    // you. Get close and the water goes still. Strike the light from range.
    nightlight() {
      freshGame();
      toWildNode(); // wild encounter: out in the wild, not the haven grounds (Steve 2026-10-04)
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 3; // night — it only hunts at night, near water
      s.mx = 2; s.my = 4;
      s.monster = { id: 'nightlight_catfish', mx: 5, my: 4 };
      Game.say('🐞 SCENARIO: nightlight catfish. A soft green glow under the water, three tiles east. Pretty.');
    },

    glasswing() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 1; // midday — it hunts in sunlight
      s.mx = 2; s.my = 4;
      s.monster = { id: 'glasswing', mx: 5, my: 4 };
      Game.say('🐞 SCENARIO: glasswing darter. A shadow moves wrong against the sun, three tiles east.');
    },

    nevermore() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 2; // dusk — it hunts the long shadows
      s.mx = 2; s.my = 4;
      s.monster = { id: 'nevermore', mx: 5, my: 4 };
      Game.say('🐦‍⬛ SCENARIO: nevermore. A crow on the treeline, three tiles east. It has not blinked.');
    },

    nightcourt() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 3; // night — court is in session
      s.mx = 2; s.my = 4;
      s.monster = { id: 'nightcourt', mx: 5, my: 4 };
      Game.say('🦉 SCENARIO: night court. Two eyes, forward-facing, three tiles east. No wingsound.');
    },

    statickite() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('sling', 'stone', 12);
      s.insideHaven = false;
      Game.dayPart = 1;
      s.mx = 2; s.my = 4;
      s.monster = { id: 'statickite', mx: 5, my: 4 };
      Game.say('🪁 SCENARIO: the static kite. A kite with no string, three tiles east. It is filming you.');
    },

    sunbasker() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 1; // midday — it basks in sunlight
      // SUN GUARANTEE (Steve 2026-10-06): the sunbasker flattens in shade by
      // design ("no sun, no fight") — a shaded spawn makes the scenario a
      // non-event. Relocate to the nearest sun tile so the fight is real.
      let mmx = 5, mmy = 4;
      try {
        if (Game.tbInShade(mmx, mmy)) {
          const detail = Game.genDetail(Game.map.px, Game.map.py);
          const spotOK = (x, y) => {
            const c = detail[y] && detail[y][x];
            return c && !Game.cellProps(c).blocks;
          };
          let best = null, bestD = 1e9;
          for (let y = 0; y < 9; y++) for (let x = 3; x < 9; x++) {
            if (!spotOK(x, y) || !spotOK(x - 3, y)) continue; // monster + player tiles
            if (Game.tbInShade(x, y)) continue;
            const d = Math.abs(x - 5) + Math.abs(y - 4);
            if (d < bestD) { bestD = d; best = { x, y }; }
          }
          if (best) { mmx = best.x; mmy = best.y; }
          else {
            // Fallback: clear shade-makers orthogonally adjacent to (5,4)
            // and make sure the player's west tile (2,4) is walkable.
            for (const dd of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const cx = mmx + dd[0], cy = mmy + dd[1];
              const c = detail[cy] && detail[cy][cx];
              if (c === 'tree' || c === 'bigtree') detail[cy][cx] = 'grass';
            }
            const pc = detail[4] && detail[4][2];
            if (!pc || Game.cellProps(pc).blocks) detail[4][2] = 'grass';
          }
        }
      } catch (e) {}
      // Player three tiles west of the monster keeps the intro line true.
      s.mx = mmx - 3; s.my = mmy;
      s.monster = { id: 'sunbasker', mx: mmx, my: mmy };
      Game.say('🐞 SCENARIO: sunbasker. Gold in the grass, three tiles east. It was not there, then it was.');
    },

    bulldozer() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 1; // midday — it owns the day
      s.mx = 2; s.my = 4;
      s.monster = { id: 'bulldozer', mx: 5, my: 4 };
      Game.say('🐞 SCENARIO: bulldozer. Something big and impatient, three tiles east. It does not go around.');
    },

    hushpuppy() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 3; // night — silent pack hunters
      s.mx = 2; s.my = 4;
      s.monster = { id: 'hushwolf', mx: 5, my: 4 };
      Game.say('🐞 SCENARIO: hushpuppy. The birds went quiet. Something is circling, three tiles east.');
    },

    whitenoise() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 2; // dusk — crepuscular
      s.mx = 2; s.my = 4;
      s.monster = { id: 'white_noise_heron', mx: 5, my: 4 };
      Game.say('🐞 SCENARIO: white noise heron. Static on the water, three tiles east. Do not listen too long.');
    },

    reviewdrone() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 1; // midday
      s.mx = 2; s.my = 4;
      s.monster = { id: 'review_drone', mx: 5, my: 4 };
      Game.say('🐞 SCENARIO: performance review drone. It is already evaluating you, three tiles east.');
    },

    influencer() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 1; // midday
      s.mx = 2; s.my = 4;
      s.monster = { id: 'paparazzo', mx: 5, my: 4 };
      Game.say('🐞 SCENARIO: paparazzo. Flashbulbs, three tiles east. They want content. You are content.');
    },

    customerservice() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 3; // night
      s.mx = 2; s.my = 4;
      s.monster = { id: 'understudy', mx: 5, my: 4 };
      Game.say('🐞 SCENARIO: understudy. It has been watching how you fight. Three tiles east. It is learning.');
    },

    inspiration() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 3; // night — it strikes when you're vulnerable
      s.mx = 2; s.my = 4;
      s.monster = { id: 'bright_idea', mx: 5, my: 4 };
      Game.say('🐞 SCENARIO: inspiration. A bright idea, three tiles east. It will not leave you alone.');
    },

    speedbump() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 1; // midday — diurnal
      s.mx = 2; s.my = 4;
      s.monster = { id: 'speedbump_turtle', mx: 5, my: 4 };
      Game.say('🐞 SCENARIO: speedbump turtle. Midday sun on its shell. It is crossing your path at its own ancient pace.');
    },

    ducksinarow() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 1; // midday — diurnal
      s.mx = 2; s.my = 4;
      s.monster = { id: 'ducks_in_a_row', mx: 5, my: 4 };
      Game.say('🐞 SCENARIO: ducks in a row. They are very organized. Suspiciously organized.');
    },

    static() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 3; // night — nocturnal
      s.mx = 2; s.my = 4;
      s.monster = { id: 'voice_mimic_radio', mx: 5, my: 4 };
      Game.say('🐞 SCENARIO: static. It sounds like your friend calling. It is not your friend.');
    },

    griefcounselor() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 1; // midday — diurnal
      s.mx = 2; s.my = 4;
      s.monster = { id: 'mirror_stag', mx: 5, my: 4 };
      Game.say('🐞 SCENARIO: grief counselor. It shows you yourself. Do not look too long.');
    },

    motivationalspeaker() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 2; // dusk — crepuscular
      s.mx = 2; s.my = 4;
      s.monster = { id: 'heckler', mx: 5, my: 4 };
      Game.say('🐞 SCENARIO: heckler. "YOU CALL THAT A FIGHT?" Three tiles east. It is shouting.');
    },

    termsconditions() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 1; // midday — diurnal
      s.mx = 2; s.my = 4;
      s.monster = { id: 'landlord', mx: 5, my: 4 };
      Game.say('🐞 SCENARIO: landlord. It is very large and very legal. Three tiles east. It is already claiming the ground.');
    },

    middlemanager() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 1; // midday — both (active day and night)
      s.mx = 2; s.my = 4;
      s.monster = { id: 'union_rep', mx: 5, my: 4 };
      Game.say('🐞 SCENARIO: union rep. It is circling. It wants to "sync up." Three tiles east.');
    },

    nostalgia() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 2; // dusk — crepuscular
      s.mx = 2; s.my = 4;
      s.monster = { id: 'memory_projector', mx: 5, my: 4 };
      Game.say('🐞 SCENARIO: nostalgia. It is showing you home. Do not follow it there.');
    },

    // 10. Moot — YOU stand accused. Theft + assault on the books, the case
    // is open, the defense window is ticking. Speak, call witnesses, press
    // the accuser, investigate bribes, or flee before the count.
    mootAccused() {
      freshGame();
      const roster = rosterIds();
      try {
        Game.recordCrime('theft', { victim: roster[0] });
        Game.recordCrime('attack', { victim: roster[1] });
      } catch (e) {}
      let c = null;
      try { c = Game.forcePlayerAccusation(); } catch (e) {
        Game.say('🐞 accusation failed to open: ' + e.message);
      }
      Game.say('🐞 SCENARIO: you stand accused. Theft and assault on the books — the moot is coming.');
      if (c) Game.say('Your name, spoken aloud in the wrong tone. The fire circle is being arranged — a ring of faces you know. The count is coming.');
      else Game.say('No case opened — check the log. The village may have nothing left unjudged to charge.');
    },

    // 11. Moot — you're a JUROR. Three villagers vs. one: an ambush plot
    // resolved into a case. Watch the cover story land first, then work the
    // evidence: press them separately, find the seam, flip the weakest.
    mootJuror() {
      freshGame();
      const roster = rosterIds();
      const leader = roster[0], acc = [roster[1], roster[2]], target = roster[3];
      // seed the fiction: the target wronged the leader, once, publicly
      try {
        const v = Game.state.village;
        v.trust = v.trust || {};
        v.trust[leader] = 30; v.trust[target] = 45;
        for (const rid of acc) v.trust[rid] = 25;
      } catch (e) {}
      let c = null;
      try {
        const plot = Game.armPlot(leader, acc, target, { reasons: ['an old debt, unpaid', 'they took the credit'], score: 65 });
        c = Game.openCase(plot, 'ambush');
        // you're the JUROR and you know about the case — the tools have to
        // be reachable or the scenario's prompt is a lie
        c.knownToPlayer = true;
        c.playerRole = 'juror';
        // witnesses: who saw them leave together (mirrors ambushAftermath)
        try {
          const wit = (Game.witnesses(6) || []).filter(id => id !== leader && acc.indexOf(id) < 0);
          plot.witnesses = wit.slice(0, 3);
        } catch (e) { plot.witnesses = []; }
      } catch (e) {
        Game.say('🐞 case failed to open: ' + e.message);
      }
      Game.say('🐞 SCENARIO: moot as juror. Three villagers stand accused of an ambush that never quite happened.');
      if (c) {
        Game.say(`The accused: ${[leader, ...acc].map(npcName).join(', ')}. The target: ${npcName(target)}. Their story landed first — yours hasn't started.`);
        Game.say('Three people swearing they were nowhere near the creek. One person swearing otherwise. You hold a vote — and everyone will remember how you cast it.');
      }
    },

    // 12. Ambush — the walk turns. An armed plot targets YOU, sprung now:
    // the interactive RUN / TALK / FIGHT beat, mid-conversation.
    // SPAWN: out in the wild, not by the fire — "let's go look together"
    // doesn't happen in the hall. The chat UI opens on the ambush thread
    // (Steve's QA rule: played by the builder, spawned in-fiction).
    ambush() {
      freshGame();
      const roster = rosterIds();
      const me = Game.villagerId;
      const leader = roster[0], acc = [roster[1], roster[2]];
      try {
        const v = Game.state.village;
        v.trust = v.trust || {};
        v.trust[leader] = 15; // the fiction: they want you gone
        for (const rid of acc) v.trust[rid] = 20;
      } catch (e) {}
      // THE WALK: head to the nearest wild node first. Fall back to the
      // Haven grounds if travel can't find one.
      try {
        const targets = (Game.travelTargets() || []).filter(t => {
          try { const tile = Game.tileAt(t.x, t.y); return tile && tile.type !== 'haven'; }
          catch (e) { return false; }
        }).sort((a, b) => a.d - b.d);
        if (targets.length) Game.travelTo(targets[0].x, targets[0].y, true);
        else Game.exitBuilding();
      } catch (e) {}
      let plot = null;
      try {
        plot = Game.armPlot(leader, acc, me, { reasons: ['you\'ve had this coming'], score: 70 });
        // the plotters walked out with you — placed around you, not wandering.
        const s = Game.state.scholar;
        const px = s.mx ?? 4, py = s.my ?? 4;
        placeVillagers([[Math.max(0, px - 1), py], [Math.min(8, px + 1), py], [px, Math.max(0, py - 1)]]);
        // open the conversation FIRST (startConvo resets the thread), then
        // spring the ambush onto it. The debug panel opens the chat UI on
        // the ambush thread via Game.debugChatRequest.
        Game.startConvo(leader);
        Game.springAmbush(plot);
        try {
          const c = Game.convoGet(leader);
          c.transcript.push({ who: 'them', text: '"You\'ve had this coming." They won\'t quite meet your eyes. Their hands are shaking.' });
        } catch (e) {}
        Game.debugChatRequest = leader;
      } catch (e) {
        Game.say('🐞 ambush failed to spring: ' + e.message);
      }
      Game.say('🐞 SCENARIO: the walk turned. Three people, placed around you — not wandering. Placed.');
      Game.say('Three people you walked out with, now arranged around you like the start of something. Breathing too fast, knuckles white. Whatever happens next, you will not be the same to this village.');
    },

    // 13. Exile — you walk. The moot voted (or you fled before it could).
    // Petition a nearby village (they've heard the gossip), found your own,
    // or drift. The old village continues without you.
    exile() {
      freshGame();
      const s = Game.state.scholar;
      try {
        Game.recordCrime('attack', { victim: rosterIds()[0] });
      } catch (e) {}
      // The 'debug' arg leaks "(debug)" into the persistent journal write
      // (betrayal.js exilePlayer → journalNote('village','exile')). Strip the
      // marker from everything said during the call AND scrub the persisted
      // note — the journal is player-facing and fiction-only. (Steve 2026-10-06)
      const _say = Game.say;
      try {
        Game.say = function (t) { return _say.call(this, String(t).replace(/\s*\(debug\)/i, '')); };
        Game.exilePlayer('debug');
      } catch (e) {
        _say.call(Game, '🐞 exile failed: ' + e.message);
      } finally {
        Game.say = _say;
      }
      try {
        const notes = (Game.state.codex && Game.state.codex.notes) || [];
        const n = notes.find(x => x && x.cat === 'village' && x.key === 'exile');
        if (n) n.text = String(n.text).replace(/\s*\(debug\)/i, '');
      } catch (e) {}
      // THE WALK: exile starts at the village edge — out of the hall, on
      // the grounds, Haven's fire behind you. Not the hall's center.
      try { Game.exitBuilding(); } catch (e) {}
      Game.say('🐞 SCENARIO: exiled. You leave with what you carry — nothing more.');
      Game.say('Haven\'s fire is behind you now, and it is not yours anymore. Out there: other fires, other judgments, other people who have already heard the gossip. Walk.');
    },

    // 14. Keepsake gamble — the gear-pick choice, restaged. A sentimental
    // keepsake marked CHOSEN (the opening gamble), the System's
    // resonance-harmonics lesson taught, and the flashback played on demand.
    keepsake() {
      freshGame();
      const s = Game.state.scholar;
      const def = (Game.data.items || []).find(i => i.id === 'mothers_ring') || {};
      s.inventory = s.inventory || [];
      const item = {
        itemId: 'mothers_ring', name: def.name || "Mother's Ring",
        sentimental: true, chosen: true, bond: 3, enhancements: [],
      };
      s.inventory.push(item);
      try { Game.teachSentiment(); } catch (e) {}
      Game.say('🐞 SCENARIO: the keepsake gamble. You chose the ring over the axe on day one — the visible gamble.');
      Game.say('The System calls it RESONANCE HARMONICS. It is not harmonics. It is love. The System will never know.');
      try {
        Game.playFlashback(item, def);
      } catch (e) {
        Game.say('🐞 flashback failed: ' + e.message);
      }
      Game.say('Channel it from your pack. Watch what grief does when the System does the math.');
    },

    // 15. Mantle — you die, the village doesn't. The most-trusted picks up
    // the Codex. "You're not her." The progression is the village's.
    mantle() {
      freshGame();
      const roster = rosterIds();
      try {
        const v = Game.state.village;
        v.trust = v.trust || {};
        for (const rid of roster) v.trust[rid] = 40 + Math.floor(Math.random() * 20);
      } catch (e) {}
      Game.say('🐞 SCENARIO: the mantle passes. You are about to die — the village is not.');
      Game.say('Watch who steps up. The Codex turns a page. The story continues in a new face.');
      try { Game.playerDeath('the debug scenario'); }
      catch (e) { Game.say('🐞 mantle failed: ' + e.message); }
    },

    // CONTESTS & SHOWS (Steve 2026-10-05): debug scenarios for the show.
    // Each contest type needs testing with different builds.

    // Contest: The Pit (Blood) — day 15, eligible, wave 1.
    contestPit() {
      freshGame();
      const s = Game.state.scholar;
      s.day = 15; // contests unlock day 14+
      // POST-SYSTEM (Steve 2026-10-05): real contests only happen after the
      // System arrives (day 7). sysSay is silent pre-System by design — the
      // scenario must replicate a real day-15 game, not change the gate.
      Game.state.systemArrived = true;
      // Villagers need grid positions to be contest-eligible; without them
      // only the player can ever be picked and the watch path is unreachable.
      placeVillagers([[2,2],[6,6],[3,5]]);
      giveWeapon('fire_hardened_spear');
      Game.say('🐞 SCENARIO: contest — The Pit. Day 15, you\'re eligible.');
      Game.say('The System should pick a contest soon. Check eligibility via the leaderboard.');
      // Force a contest to fire
      try {
        const contest = Game.contestPool().find(c => c.id === 'pit');
        if (contest) Game.fireContest(contest);
      } catch (e) { Game.say('🐞 contest fire failed: ' + e.message); }
    },

    // Contest: Hide and Seek (Weird, extreme risk)
    contestHide() {
      freshGame();
      const s = Game.state.scholar;
      s.day = 20;
      Game.state.systemArrived = true;
      placeVillagers([[2,2],[6,6],[3,5]]);
      giveWeapon('machete');
      Game.say('🐞 SCENARIO: contest — Hide and Seek. Extreme risk.');
      Game.say('The seeker is a wave-2 predator. Test with different loadouts.');
      try {
        const contest = Game.contestPool().find(c => c.id === 'hide');
        if (contest) Game.fireContest(contest);
      } catch (e) { Game.say('🐞 contest fire failed: ' + e.message); }
    },

    // Contest: Calorie Run (Forage) — tests foraging builds
    contestForage() {
      freshGame();
      const s = Game.state.scholar;
      s.day = 18;
      Game.state.systemArrived = true;
      placeVillagers([[2,2],[6,6],[3,5]]);
      Game.say('🐞 SCENARIO: contest — Calorie Run. Foraging competition.');
      Game.say('Whoever collects the most calorie-dense materials wins.');
      try {
        const contest = Game.contestPool().find(c => c.id === 'calorie_run');
        if (contest) Game.fireContest(contest);
      } catch (e) { Game.say('🐞 contest fire failed: ' + e.message); }
    },

    // Contest WATCH MODE (Steve 2026-10-05): a villager is taken, you watch.
    // The watching path must be in the debug list passing inspection, or it
    // doesn't exist as a game feature.
    contestWatch() {
      freshGame();
      const s = Game.state.scholar;
      s.day = 15;
      Game.state.systemArrived = true;
      const placed = placeVillagers([[2,2],[6,6],[3,5]]);
      giveWeapon('fire_hardened_spear');
      Game.say('🐞 SCENARIO: contest — WATCH MODE. A villager is taken, you watch.');
      try {
        const contest = Game.contestPool().find(c => c.id === 'pit');
        if (contest && placed.length) {
          Game.fireContest(contest);
          // Debug override: the System's cameras want someone else today.
          // fireContest prefers the player; this forces the villager pick so
          // the watch branch of contestInterruption is directly testable.
          const pc = Game.state.pendingContest;
          // MULTI-TAKE (Steve 2026-10-06): override the whole cast, not just
          // the first — resolveContest recasts from pc.participants.
          if (pc) { pc.participant = placed[0]; pc.participants = [placed[0]]; Game.resolveContest(); }
        }
      } catch (e) { Game.say('🐞 contest watch failed: ' + e.message); }
    },

    // TV Show: WHY DO THEY EAT?
    showWhyEat() {
      freshGame();
      const s = Game.state.scholar;
      s.day = 16;
      Game.state.systemArrived = true;
      placeVillagers([[2,2],[6,6]]);
      Game.say('🐞 SCENARIO: TV show — WHY DO THEY EAT?');
      Game.say('The aliens are horrified by cooking. The audience is delighted.');
      try {
        const show = Game.showPool().find(s => s.id === 'why_eat');
        if (show) {
          Game.sysSay(`📺 TONIGHT: ${show.name}. ${show.desc}`);
        }
      } catch (e) { Game.say('🐞 show failed: ' + e.message); }
    },

    // Contest eligibility check
    contestEligible() {
      freshGame();
      const s = Game.state.scholar;
      s.day = 15;
      Game.state.systemArrived = true;
      placeVillagers([[2,2],[6,6],[3,5]]);
      Game.addNotability('player', 'wave2Kill');
      Game.say('🐞 SCENARIO: contest eligibility. Day 15, you slew a wave-2 beast.');
      Game.say('Somewhere overhead, something enormous has been watching. It has opinions about who is interesting. You have been noticed.');
      try {
        const { eligible } = Game.contestEligible();
        Game.say(`🐞 Eligible: ${eligible.length} (${eligible.map(e => e.name).join(', ')})`);
      } catch (e) { Game.say('🐞 eligibility check failed: ' + e.message); }
    },

    // ALIEN PLAYERS (Steve 2026-10-08): the exclusive pool, wired live.
    // Day 30, wave 2, System integrated, two allies at your side — the
    // readiness gate passes and the encounter fires through the REAL roll
    // path (not a forced spawn). Out in the wild, two taps, in-fiction.
    alienEncounter() {
      freshGame();
      toWildNode();
      const s = Game.state.scholar;
      s.day = 30;
      Game.state.systemArrived = true;
      Game.state.systemIntegration = 1; // apReadinessCheck: seasoned world
      Game.state.waveKills = { 1: 4 };  // unlockedWave() >= 2
      giveWeapon('fire_hardened_spear');
      s.health = 120;
      const placed = placeVillagers([[3, 3], [5, 5]]);
      Game.state.party = placed.slice(0, 2); // readiness: 2 allies
      Game.say('🐞 SCENARIO: alien player encounter. Day 30, wave 2, the System watching.');
      Game.say('You walk the wilds with two allies. Something out there is wrong in a way you can\'t name.');
      // Fire through the REAL path: spin the exclusive-pool roll until it
      // lands, then start it. The roll is 8%/crossing — this loop is the
      // "walking the wilds" part, fast-forwarded.
      try {
        let pid = null, tries = 0;
        while (!pid && tries++ < 500) pid = Game.apRollEncounter();
        if (pid && Game.apStartEncounter(pid)) {
          Game.say('🐞 The exclusive pool fired. This is a PERSON — kind: hostile, not monster. Fight like it.');
        } else {
          Game.say('🐞 alien encounter failed to fire — the pool is wired but the roll never landed.');
        }
      } catch (e) { Game.say('🐞 alien encounter failed: ' + e.message); }
    },
  };

  // RETIRED: scenarios we're confident are solid. Never deleted — saved for
  // later behind the collapsed toggle in the debug panel. Move entries here
  // from SCENARIOS only when playtesting says they're down. Keep the label
  // in RETIRED_LABELS so the menu still reads well.
  const RETIRED = {
    // (empty for now — nothing's retired yet)
    // example: headlightOld() { ... },
  };
  const RETIRED_LABELS = {
    // headlightOld: '💡 Headlight Deer fight (old)',
  };

  Game.debugScenario = function (name) {
    const fn = SCENARIOS[name] || RETIRED[name];
    if (!fn) { Game.say('🐞 unknown scenario: ' + name); return false; }
    try {
      // A scenario is a fresh run — clear any combat/encounter state first.
      try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
      fn();
      return true;
    } catch (e) {
      try { Game.say('🐞 scenario "' + name + '" failed: ' + e.message); } catch (e2) {}
      return false;
    }
  };

  Game.debugScenarioList = function () {
    return [
      ['deer', '🦌 Deer hunt'],
      ['rabbit', '🐇 Rabbit hunt'],
      ['squirrel', '🐿️ Squirrel hunt'],
      ['turkey', '🦃 Wild Turkey hunt'],
      ['opossum', '🐾 Opossum encounter'],
      ['bullfrog', '🐸 Bullfrog encounter'],
      ['boxturtle', '🐢 Box Turtle encounter'],
      ['fox', '🦊 Gray Fox hunt'],
      ['crayfish', '🦞 Crayfish catch'],
      ['raccoon', '🦝 Raccoon encounter'],
      ['snappingturtle', '🐢 Snapping Turtle (careful!)'],
      ['chub', '🐟 Creek Chub fishing'],
      ['headlight', '💡 Headlight Deer fight'],
      ['flashbulb', '🦋 Flashbulb Moth fight'],
      ['choir', '🐸 Choir Toad fight'],
      ['lockpick', '🦝 Lockpick Raccoon fight'],
      ['hummice', '🐭 Hummice swarm fight'],
      ['nightlight', '💡 Nightlight Catfish fight'],
      ['glasswing', '🪰 Glasswing Darter fight'],
      ['nevermore', '🐦‍⬛ Nevermore fight'],
      ['nightcourt', '🦉 Night Court fight'],
      ['statickite', '🪁 Static Kite fight'],
      ['sunbasker', '🦎 Sunbasker fight'],
      ['bulldozer', '🐗 Bulldozer fight'],
      ['hushpuppy', '🐺 Hushpuppy pack fight'],
      ['whitenoise', '📻 White Noise Heron fight'],
      ['reviewdrone', '📋 Performance Review Drone fight'],
      ['influencer', '📸 Influencer Swarm fight'],
      ['customerservice', '🎧 Customer Service Mimic fight'],
      ['inspiration', '💡 Inspiration fight'],
      ['speedbump', '🐢 Speedbump Turtle fight'],
      ['ducksinarow', '🦆 Ducks in a Row fight'],
      ['static', '📻 Static fight'],
      ['griefcounselor', '🪞 Grief Counselor fight'],
      ['motivationalspeaker', '🎤 Motivational Speaker fight'],
      ['termsconditions', '📜 Terms & Conditions fight'],
      ['middlemanager', '💼 Middle Manager fight'],
      ['nostalgia', '📼 Nostalgia fight'],
      ['ambush', '🔪 Ambush — the walk turns'],
      ['mootAccused', '⚖️ Moot — you stand accused'],
      ['mootJuror', '⚖️ Moot — you are the juror'],
      ['exile', '🚶 Exile — you walk'],
      ['mantle', '🕯️ Mantle — you die, village continues'],
      ['keepsake', '💍 Keepsake gamble + flashback'],
      ['day7', '🌟 Day 7 System transition'],
      ['uprising', '⚔️ Village uprising'],
      ['day1', '🌊 Day 1 fresh spawn'],
      ['language', '🗣️ Language barrier'],
      ['night', '🌙 Night hunt'],
      ['hunt', '🏹 Full hunt — stalk, chase, kill, butcher'],
      ['butcher', '🔪 Butcher — carcass, no knife, rot clock'],
      ['liars', '🤥 Liar\'s den'],
      ['starving', '🔥 Starving village'],
      ['contestPit', '📺 Contest: The Pit'],
      ['contestHide', '📺 Contest: Hide and Seek'],
      ['contestForage', '📺 Contest: Calorie Run'],
      ['contestWatch', '📺 Contest: WATCH MODE (villager taken)'],
      ['showWhyEat', '📺 Show: WHY DO THEY EAT?'],
      ['contestEligible', '📺 Contest eligibility check'],
      ['alienEncounter', '👤 Alien player encounter'],
    ];
  };

  // CATEGORIZED SCENARIOS (Steve 2026-10-05): the list is getting long.
  // Categories first, then specifics within each.
  Game.debugScenarioCategories = function () {
    const all = Game.debugScenarioList();
    const byId = Object.fromEntries(all);
    const cats = {
      '🐾 Animals — Prey': ['deer', 'rabbit', 'squirrel', 'turkey', 'opossum', 'bullfrog', 'boxturtle', 'fox', 'crayfish', 'raccoon', 'snappingturtle', 'chub', 'hunt', 'butcher'],
      '🦌 Monsters — Wave 1': ['headlight', 'flashbulb', 'choir', 'lockpick', 'hummice', 'glasswing', 'sunbasker', 'bulldozer', 'hushpuppy', 'whitenoise', 'nightlight', 'speedbump', 'ducksinarow', 'nevermore', 'nightcourt'],
      '👹 Monsters — Wave 2': ['static', 'griefcounselor', 'reviewdrone', 'influencer', 'motivationalspeaker', 'customerservice', 'termsconditions', 'middlemanager', 'inspiration', 'nostalgia', 'statickite'],
      '⚖️ Justice & Social': ['ambush', 'mootAccused', 'mootJuror', 'exile', 'uprising', 'liars'],
      '📖 Story': ['mantle', 'day7', 'day1', 'night', 'language', 'starving'],
      '📺 Contests & Shows': ['contestPit', 'contestHide', 'contestForage', 'contestWatch', 'showWhyEat', 'contestEligible'],
      '👤 Alien Players': ['alienEncounter'],
      '💍 Items': ['keepsake'],
    };
    // Only include categories that have at least one existing scenario
    const result = {};
    for (const [cat, ids] of Object.entries(cats)) {
      const items = ids.filter(id => byId[id]).map(id => [id, byId[id]]);
      if (items.length) result[cat] = items;
    }
    return result;
  };

  Game.debugRetiredList = function () {
    return Object.keys(RETIRED).map(id => [id, RETIRED_LABELS[id] || ('🗄️ ' + id)]);
  };

  // === FIGHTER LOADOUT MATRIX (Steve 2026-10-05) ===
  // "Debug menu needs the option to enter as different types of fighters
  // with different equipment... designed so you can iterate through these
  // scenarios extremely quickly... This is how we prevent regressions."
  //
  // Each loadout is a preset: stats + equipment + party. Apply with
  // Game.debugApplyLoadout('unarmed') after starting any scenario.
  const LOADOUTS = {
    unarmed: {
      label: '🥊 Unarmed/Unarmored',
      desc: 'Bare fists, no armor. Should feel nearly impossible vs normal monsters.',
      apply() {
        const s = Game.state.scholar;
        s.inventory = []; s.equipped = {};
        s.strength = 10; s.agility = 10; s.toughness = 10;
      }
    },
    improvised: {
      label: '🔨 Improvised',
      desc: 'Sharpened stick (5 dmg), no armor. Early desperate fighter.',
      apply() {
        const s = Game.state.scholar;
        s.inventory = []; s.equipped = {};
        giveWeapon('sharpened_stick');
        s.strength = 12; s.agility = 11; s.toughness = 10;
      }
    },
    early: {
      label: '🗡️ Early Gear',
      desc: 'Fire-hardened spear (15 dmg), basic armor. Proper early fighter.',
      apply() {
        const s = Game.state.scholar;
        s.inventory = []; s.equipped = {};
        giveWeapon('fire_hardened_spear');
        // TODO: give armor when armor items exist
        s.strength = 14; s.agility = 12; s.toughness = 12;
      }
    },
    ranged: {
      label: '🏹 Ranged',
      desc: 'Crude bow (40 dmg), 20 arrows. Glass cannon.',
      apply() {
        const s = Game.state.scholar;
        s.inventory = []; s.equipped = {};
        giveWeapon('crude_bow', 'arrow', 20);
        s.strength = 10; s.agility = 14; s.toughness = 10;
      }
    },
    mid: {
      label: '⚔️ Mid-Tier',
      desc: 'Machete (35 dmg), decent stats. Wave 2 ready.',
      apply() {
        const s = Game.state.scholar;
        s.inventory = []; s.equipped = {};
        giveWeapon('machete');
        s.strength = 16; s.agility = 14; s.toughness = 14;
      }
    },
    late: {
      label: '💀 Late-Game',
      desc: 'Hardlight knife (45 dmg), high stats. Wave 3+.',
      apply() {
        const s = Game.state.scholar;
        s.inventory = []; s.equipped = {};
        giveWeapon('hardlight_knife');
        s.strength = 20; s.agility = 18; s.toughness = 18;
      }
    },
    alien: {
      label: '👽 Alien Loot',
      desc: 'Contest prize tier. Should feel powerful but not trivial.',
      apply() {
        const s = Game.state.scholar;
        s.inventory = []; s.equipped = {};
        // TODO: actual alien loot items when they exist
        giveWeapon('hardlight_knife');
        s.strength = 22; s.agility = 20; s.toughness = 20;
      }
    },
    // WAVE VARIATIONS (Steve 2026-10-05): each build scales by wave.
    // Wave 1: struggling. Wave 2: competent. Wave 3: strong. Wave 4: dominant.
    // Tests that progression feels right — each wave should challenge the
    // next gear tier, not trivialize or impossible-wall.
    w1_fighter: {
      label: '🌊 W1 Fighter',
      desc: 'Wave 1 build: spear, basic stats, 2 abilities. Should handle wave 1, struggle wave 2.',
      apply() {
        const s = Game.state.scholar;
        s.inventory = []; s.equipped = {};
        giveWeapon('fire_hardened_spear');
        s.strength = 14; s.agility = 12; s.toughness = 12;
        s.abilities = [{ id: 'patient_aim' }, { id: 'game_sense' }];
      }
    },
    w2_fighter: {
      label: '🌊🌊 W2 Fighter',
      desc: 'Wave 2 build: machete, mid stats, 4 abilities. Should handle wave 2, struggle wave 3.',
      apply() {
        const s = Game.state.scholar;
        s.inventory = []; s.equipped = {};
        giveWeapon('machete');
        s.strength = 17; s.agility = 15; s.toughness = 15;
        s.abilities = [{ id: 'patient_aim' }, { id: 'game_sense' }, { id: 'adrenaline_control' }, { id: 'triage' }];
      }
    },
    w3_fighter: {
      label: '🌊🌊🌊 W3 Fighter',
      desc: 'Wave 3 build: hardlight knife, high stats, 6 abilities. Should handle wave 3, struggle wave 4.',
      apply() {
        const s = Game.state.scholar;
        s.inventory = []; s.equipped = {};
        giveWeapon('hardlight_knife');
        s.strength = 21; s.agility = 19; s.toughness = 19;
        s.abilities = [{ id: 'patient_aim' }, { id: 'game_sense' }, { id: 'adrenaline_control' }, { id: 'triage' }, { id: 'steady_hands' }, { id: 'soft_step' }];
      }
    },
    w4_fighter: {
      label: '🌊🌊🌊🌊 W4 Fighter',
      desc: 'Wave 4 build: alien loot, max stats, 6 abilities. Should handle wave 4.',
      apply() {
        const s = Game.state.scholar;
        s.inventory = []; s.equipped = {};
        giveWeapon('hardlight_knife');
        s.strength = 25; s.agility = 23; s.toughness = 23;
        s.abilities = [{ id: 'patient_aim' }, { id: 'game_sense' }, { id: 'adrenaline_control' }, { id: 'triage' }, { id: 'steady_hands' }, { id: 'soft_step' }];
      }
    },
    // NON-FIGHTER BUILDS (Steve 2026-10-05): contests aren't just combat.
    // Social, forager, detective builds for moot/forage/detective contests.
    socialite: {
      label: '🎭 Socialite',
      desc: 'Moot contest build: high social abilities. Wins debates, not fights.',
      apply() {
        const s = Game.state.scholar;
        s.inventory = []; s.equipped = {};
        s.strength = 10; s.agility = 10; s.toughness = 10;
        // TODO: social abilities when they exist
        s.abilities = [{ id: 'triage' }, { id: 'steady_hands' }];
        Game.say('🐞 Socialite build: moot contests, gossip, persuasion. (Social abilities pending)');
      }
    },
    forager: {
      label: '🌿 Forager',
      desc: 'Calorie Run contest build: foraging abilities. Wins by gathering.',
      apply() {
        const s = Game.state.scholar;
        s.inventory = []; s.equipped = {};
        s.strength = 12; s.agility = 14; s.toughness = 12;
        s.abilities = [{ id: 'game_sense' }, { id: 'forage_identification' }, { id: 'soft_step' }];
      }
    },
  };

  Game.debugApplyLoadout = function (loadoutId) {
    const l = LOADOUTS[loadoutId];
    if (!l) { Game.say(`🐞 Unknown loadout: ${loadoutId}`); return; }
    l.apply();
    Game.say(`🐞 LOADOUT: ${l.label} — ${l.desc}`);
  };

  Game.debugLoadoutList = function () {
    return Object.keys(LOADOUTS).map(id => [id, LOADOUTS[id].label]);
  };
})();
