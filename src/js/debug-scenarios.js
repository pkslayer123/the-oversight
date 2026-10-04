/*
 * debug-scenarios.js — one-tap preloaded scenarios for the debug panel.
 *
 * Steve's ask: "You never gave me a debug button with any preloaded
 * scenarios. I haven't tested the deer or the day 7 system transition."
 *
 * Self-attaching module: no edits to game.js. Each scenario starts from a
 * FRESH game (genRoster + newGame, same as character creation would), then
 * mutates state into the scenario. One tap, correct state, no broken refs.
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
    s.animal = { id: animalId, mx: Math.min(8, px + 1), my: py };
    const adef = (Game.data.animals || []).find(a => a.id === animalId) || {};
    Game.say(`Movement — ${adef.description || 'something alive'}.`);
  }

  function rosterIds() {
    const v = Game.state.village;
    return (v.roster || []).filter(rid => rid !== Game.villagerId);
  }

  const SCENARIOS = {
    // 1. Deer encounter — bow in hand, deer adjacent, dawn.
    deer() {
      freshGame();
      const s = Game.state.scholar;
      giveWeapon('crude_bow', 'arrow', 12);
      s.insideHaven = false;
      Game.dayPart = 0; // dawn — deer are crepuscular
      spawnAnimalNear('white_tailed_deer');
      Game.say('');
      Game.say('🐞 SCENARIO: deer encounter. Crude bow equipped, 12 arrows.');
      Game.say('Get adjacent to the deer and Hunt (🏹). It\'s hard difficulty — the bow\'s +40 helps.');
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
      v.trust = v.trust || {};
      for (const rid of roster) v.trust[rid] = 3 + Math.floor(Math.random() * 6);
      try {
        Game.recordCrime('attack', { victim: roster[0] });
        Game.recordCrime('attack', { victim: roster[1] });
      } catch (e) {}
      Game.say('🐞 SCENARIO: village uprising. You stole from the pantry, attacked when confronted, refused exile.');
      Game.say('They\'re coming. Anyone who still trusts you (good luck) fights at your side.');
      const s = Game.state.scholar;
      s.mx = 4; s.my = 4; s.insideHaven = true;
      Game.map.px = v.x ?? 3; Game.map.py = v.y ?? 3;
      try { Game.startVillageUprising('debug scenario'); }
      catch (e) { Game.say('🐞 uprising failed to start: ' + e.message); }
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
      Game.say('Talk to people. Watch what happens. Body language, fragments, frustration.');
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
      Game.say('Ask about them, gossip, watch them. Bad liars slip. Catch the contradictions.');
    },

    // 7. Night hunt — midnight, nocturnal predator, spear in hand.
    night() {
      freshGame();
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 3; // night
      spawnAnimalNear('gray_fox');
      Game.say('');
      Game.say('🐞 SCENARIO: night hunt. Midnight. A gray fox is out there.');
      Game.say('Fire-hardened spear equipped. The night has its own ecology — watch what\'s active.');
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
    // It already exists: nocturnal, freezes like a deer in headlights,
    // light gathering behind its eyes. It is not frozen. It is aiming.
    headlight() {
      freshGame();
      const s = Game.state.scholar;
      giveWeapon('fire_hardened_spear');
      s.insideHaven = false;
      Game.dayPart = 3; // night — it's nocturnal
      Game.say('🐞 SCENARIO: headlight deer fight. The Highbeam Deer is out there in the dark.');
      Game.say('When it freezes, it is NOT frozen. It is aiming. MOVE.');
      Game.startCombat('gallowdeer');
    },
  };

  Game.debugScenario = function (name) {
    const fn = SCENARIOS[name];
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
      ['deer', '🦌 Deer encounter'],
      ['day7', '🌟 Day 7 System transition'],
      ['uprising', '⚔️ Village uprising'],
      ['day1', '🌊 Day 1 fresh spawn'],
      ['language', '🗣️ Language barrier'],
      ['night', '🌙 Night hunt'],
      ['liars', '🤥 Liar\'s den'],
      ['starving', '🔥 Starving village'],
      ['headlight', '💡 Headlight Deer fight'],
    ];
  };
})();
