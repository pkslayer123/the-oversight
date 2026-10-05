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
    s.animal = { id: animalId, mx: Math.min(8, px + 1), my: py };
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
  function toWildNode() {
    try {
      const tiles = Game.map.tiles;
      let best = null;
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const t = tiles[y][x];
        if (!t || t.type === 'haven' || t.type === 'ruin') continue;
        const d = Math.abs(x - 3) + Math.abs(y - 3);
        if (d < 2) continue; // not the doorstep — actually out
        if (!best || d > best.d) best = { x, y, d };
      }
      if (!best) return false;
      Game.map.px = best.x; Game.map.py = best.y;
      const t = tiles[best.y][best.x];
      t.visited = true; t.revealed = true;
      const s = Game.state.scholar;
      s.insideHaven = false;
      s.mx = 4; s.my = 4;
      return true;
    } catch (e) { return false; }
  }

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
      toWildNode(); // wild encounter: out in the wild, not the haven grounds (Steve 2026-10-04)
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
      Game.say(`Walk toward it. ${placed.map(npcName).join(' and ')} are out there too — the deer notices anyone too close, first in first out.`);
      Game.say('FIRST ENCOUNTER: no beam-lane warning until your codex learns. You get the freeze, the whine, and dread. MOVE.');
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
      Game.say('Walk toward it. It lands, it folds — and the flash only goes FORWARD. Get behind it before it fires.');
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
      Game.say('When one throat lets go, they ALL croak. Break the chorus: kill one, split them up — or SHOUT (📢).');
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
      Game.say("That's the problem — it's pretty. It won't chase you. Get close and the water goes still. Strike the light from range — never wade in.");
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
      if (c) Game.say('The case is open. Your defense window is ticking: speak, call witnesses, press your accuser, or run.');
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
        Game.say('Work it: examine the site, name witnesses, press them separately, flip the weakest. Then vote.');
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
      Game.say('RUN, TALK, or FIGHT — each exchange costs. Running is the intended move. They\'re scared, not killers.');
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
      try { Game.exilePlayer('debug'); } catch (e) {
        Game.say('🐞 exile failed: ' + e.message);
      }
      // THE WALK: exile starts at the village edge — out of the hall, on
      // the grounds, Haven's fire behind you. Not the hall's center.
      try { Game.exitBuilding(); } catch (e) {}
      Game.say('🐞 SCENARIO: exiled. You leave with what you carry — nothing more.');
      Game.say('Tap a 🏘️ tile on the minimap to approach & petition (they judge you — the gossip got there first). Your self bar has 🏕️ found-haven and 🚶 drift.');
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
      ['deer', '🦌 Deer encounter'],
      ['headlight', '💡 Headlight Deer fight'],
      ['flashbulb', '🦋 Flashbulb Moth fight'],
      ['choir', '🐸 Choir Toad fight'],
      ['lockpick', '🦝 Lockpick Raccoon fight'],
      ['hummice', '🐭 Hummice swarm fight'],
      ['nightlight', '💡 Nightlight Catfish fight'],
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
      ['liars', '🤥 Liar\'s den'],
      ['starving', '🔥 Starving village'],
    ];
  };

  Game.debugRetiredList = function () {
    return Object.keys(RETIRED).map(id => [id, RETIRED_LABELS[id] || ('🗄️ ' + id)]);
  };
})();
