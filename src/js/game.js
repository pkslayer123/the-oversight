/* Slice 1 game controller: "Seven Days".
   Owns state, map, day loop, actions, encounters. UI renders from it (app.js). */
(function (global) {
  'use strict';
  const S = global.Scattering;
  const DAY_PARTS = ['dawn', 'midday', 'dusk', 'night'];
  const DAY_PART_HINT = {
    dawn: 'The world wakes. Animals are active.',
    midday: 'Honest work hours. Heat builds.',
    dusk: 'Animals stir again. Shadows lengthen.',
    night: 'Camp. Rest — or risk the dark.',
  };
  const TILE_GLYPH = {
    forest_floor: '🟫', grove: '🌳', meadow: '🌾', thicket: '🌿',
    wetland: '💧', creek: '🌊', trail_edge: '🟨', ruin: '🏚️', haven: '🏠',
  };
  const TILE_NAME = {
    forest_floor: 'forest floor', grove: 'grove', meadow: 'meadow', thicket: 'thicket',
    wetland: 'wetland', creek: 'creek', trail_edge: 'trail edge', ruin: 'ruin', haven: 'Haven',
  };
  // scavenged goods (ruins) — finite. the houses feed you until they don't.
  const SCAVENGED = [
    { id: 'can_beans', name: 'Canned beans', kcal: 650, kg: 0.4, text: 'Dusty can, intact seal. Someone\'s pantry, a lifetime ago.' },
    { id: 'can_corn', name: 'Canned corn', kcal: 550, kg: 0.4, text: 'The label is gone. The corn doesn\'t care.' },
    { id: 'can_soup', name: 'Canned soup', kcal: 450, kg: 0.35, text: 'Chicken soup. Tastes like before.' },
    { id: 'jar_peaches', name: 'Jarred peaches', kcal: 700, kg: 0.5, text: 'Home-canned. Whoever sealed this knew what they were doing.' },
  ];
  // first-visit arrival moments — destinations reveal something
  const ARRIVAL = {
    forest_floor: { title: 'Under the canopy', text: 'Leaf litter, birdcall, the smell of rot becoming soil. The woods, being the woods.' },
    grove: { title: 'Nut trees', text: 'Hickories and oaks, heavy with mast. This is a pantry that grows.' },
    meadow: { title: 'Open ground', text: 'Grasses head-high. Good greens, good visibility, nowhere to hide.' },
    thicket: { title: 'Thick brush', text: 'Thorns and tangle. Things live in here that don\'t want to be seen.' },
    wetland: { title: 'Still water, cattails', text: 'Cattails mean starch. Still water means boil it first — the Codex insists.' },
    creek: { title: 'Moving water', text: 'Cold, clear, moving. The best thing you\'ve seen all day.' },
    trail_edge: { title: 'An old trail', text: 'Something walked here regularly, before. The path remembers even if no one does.' },
    ruin: { title: 'Pre-Burn ruin', text: '' }, // ruinStory fills this
    haven: { title: 'Haven', text: 'Canvas, cookfire, twelve people who are glad you\'re back. Home is a tile on the map like any other — it just matters more.' },
  };

  const Game = {
    data: null, state: null, map: null,
    dayPart: 0, ap: 1, over: false, won: false,
    encounterDone: false, log: [],
    homeRegion: null, villagerId: null,
    location: 'village', // 'village' | 'wilds' — nodes access consistent maps
    departed: false,

    async init() {
      if (global.SCATTER_DATA) { this.data = global.SCATTER_DATA; return this.data; }
      const get = f => fetch('src/data/' + f).then(r => r.json());
      const [plants, biomes, monsters, villagers, abilities, items, background_survivors] = await Promise.all(
        ['plants.json', 'biomes.json', 'monsters.json', 'villagers.json', 'abilities.json', 'items.json', 'background_survivors.json'].map(get));
      this.data = { plants, biomes, monsters, villagers, abilities, items, background_survivors };
      return this.data;
    },

    biome() { return this.data.biomes.find(b => b.id === 'se_woodlands'); },

    newGame(homeRegion, villagerId, pickedItems) {
      this.homeRegion = homeRegion; this.villagerId = villagerId;
      const villager = this.data.villagers.find(v => v.id === villagerId);
      this.state = S.state.newState();
      this.state.village.name = 'Haven';
      // the roster: 6 mains (the story) + 6 drawn from 36 background survivors (the variety).
      // twelve mouths, different every run.
      const mains = ['mara_okafor', 'jesse_calhoun', 'aki_tanaka', 'ruth_delgado', 'theo_park', 'priya_nair'];
      const pool = [...this.data.background_survivors];
      const bg = [];
      for (let i = 0; i < 6 && pool.length; i++) bg.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].id);
      this.state.village.roster = mains.concat(bg);
      this.state.village.villagers = mains; // mains have dialogue; background have one-liners
      // ACT 0: trust starts low. you're 12 strangers from all over the world.
      // everyone woke up in a different building. nobody knows if they should work together.
      this.state.village.trust = {};
      this.state.village.spawnBuilding = {};
      const buildings = ['the clinic', 'the bus depot', 'the school', 'the fire station', 'the library', 'the grocery', 'the church', 'the garage', 'the apartment', 'the warehouse', 'the diner', 'the motel'];
      for (const rid of this.state.village.roster) {
        // trust 5-20: strangers. it's earned.
        this.state.village.trust[rid] = 5 + Math.floor(Math.random() * 16);
        this.state.village.spawnBuilding[rid] = buildings.splice(Math.floor(Math.random() * buildings.length), 1)[0];
      }
      // you trust yourself
      this.state.village.trust[villagerId] = 100;
      const scholar = S.state.newScholar(villagerId);
      const gear = (pickedItems && pickedItems.length === 5) ? pickedItems : villager.items.slice(0, 5);
      scholar.inventory = gear.map(id => ({ itemId: id, units: 1, kg: 0.2, name: (this.data.items.find(i => i.id === id) || {}).name || id }));
      // granted abilities from villager data (2 each, defined here for slice 1)
      const granted = {
        mara_okafor: ['triage', 'steady_hands'],
        jesse_calhoun: ['game_sense', 'patient_aim'],
        aki_tanaka: ['field_dressing', 'preservation_instinct'],
      };
      scholar.abilities = granted[villagerId] || [];
      scholar.water = 1; // 1 clean water to start
      this.state.scholar = scholar;
      this.state.codex = S.state.newCodex();
      this.dayPart = 0; this.ap = 1; this.over = false; this.won = false;
      this.villageLost = false; this.wanderer = null; this.fight = null; this.pendingEncounter = false;
      this.encounterDone = false; this.log = [];
      this.location = 'village'; this.departed = false;
      this.wipe();
      this.genMap();
      this.say('Haven. Twelve people. The fire is lit.');
      return this.status();
    },

    // --- village: people to talk to, things to do ---
    talkTo(vid) {
      const v = this.data.villagers.find(x => x.id === vid);
      if (!v || !v.talk || !v.talk.length) return null;
      this.state.talkIdx = this.state.talkIdx || {};
      const i = (this.state.talkIdx[vid] || 0) % v.talk.length;
      this.state.talkIdx[vid] = (this.state.talkIdx[vid] || 0) + 1;
      const line = v.talk[i];
      // trust builds through talking. strangers warm up slowly.
      const trust = (this.state.village.trust && this.state.village.trust[vid]) || 10;
      const newTrust = Math.min(100, trust + 3);
      if (this.state.village.trust) this.state.village.trust[vid] = newTrust;
      // the tone shifts with trust (not the number — you feel it)
      const tone = trust < 30 ? " (guarded)" : trust < 60 ? " (warming)" : " (open)";
      this.say(`${v.name.split(' ')[0]}${tone}: "${line}"`);
      return line;
    },

    // give food: the fastest way to earn trust. sharing is the social contract.
    giveFood(vid) {
      const v = this.data.villagers.find(x => x.id === vid) || this.data.background_survivors.find(x => x.id === vid);
      if (!v) return null;
      // find food in inventory
      const food = this.state.scholar.inventory.find(i => i.plantId && i.units > 0);
      if (!food) { this.say("You have no food to give."); return null; }
      food.units -= 1;
      if (food.units <= 0) this.state.scholar.inventory = this.state.scholar.inventory.filter(i => i.units > 0);
      const trust = (this.state.village.trust && this.state.village.trust[vid]) || 10;
      const newTrust = Math.min(100, trust + 12);
      if (this.state.village.trust) this.state.village.trust[vid] = newTrust;
      this.say(`You give ${v.name.split(' ')[0]} some ${food.name}. They look at you differently now.`);
      return true;
    },

    // integration: the System is learning you. you are learning it.
    // 0-20: journal (paper, handwriting). 20-40: system messages. 40-60: quests.
    // 60-80: codex/inventory overlay. 80+: full neural integration.
    integrate(amount, reason) {
      const s = this.state.scholar;
      s.integration = Math.min(100, (s.integration || 5) + amount);
      const thresholds = [20, 40, 60, 80];
      for (const t of thresholds) {
        if (s.integration >= t && (s.lastIntegration || 0) < t) {
          s.lastIntegration = t;
          const msgs = {
            20: 'SYSTEM: Neural interface stable. Text overlay enabled.',
            40: 'SYSTEM: Quest protocol integrated. Objectives will appear.',
            60: 'SYSTEM: Codex and inventory overlay online.',
            80: 'SYSTEM: Deep integration. You see the world through us now.',
          };
          this.say(msgs[t]);
        }
      }
      if (reason) this.tele('integrate', { amount, reason, total: Math.round(s.integration) });
    },

    // village quests: the people ask. light, passive, human.
    // (System quests come at integration 40+ — the overlay takes over.)
    maybeOfferQuest() {
      const s = this.state.scholar;
      if (s.activeQuest || (s.integration || 0) >= 40) return;
      if (Math.random() > 0.25) return;
      const mains = this.data.villagers.filter(v => v.id !== this.villagerId);
      const giver = mains[Math.floor(Math.random() * mains.length)];
      const quests = [
        { type: 'bring', plant: 'dandelion', qty: 3, reward: 'pantry', text: `${giver.name.split(' ')[0]} needs ${3} dandelion. "For tea. For morale. For reasons."` },
        { type: 'visit', tileType: 'creek', reward: 'knowledge', text: `${giver.name.split(' ')[0]} wants to know what's by the creek. "Just look. Come back and tell me."` },
        { type: 'bring', plant: 'blackberry', qty: 2, reward: 'item', text: `${giver.name.split(' ')[0]} is craving blackberries. "I'll trade you something good."` },
      ];
      const q = quests[Math.floor(Math.random() * quests.length)];
      q.giver = giver.id; q.giverName = giver.name.split(' ')[0];
      s.activeQuest = q;
      this.say(`📋 ${q.text}`);
    },

    getQuest() {
      // the intro: a random main (not you) wakes you up. Mara isn't the only one with the speech.
      if (this.state.questGiven) return null;
      const mains = this.data.villagers.filter(v => v.quest && v.id !== this.villagerId);
      const giver = mains[Math.floor(Math.random() * mains.length)] || this.data.villagers[0];
      this.state.questGiven = true;
      this.save();
      return { from: giver.name.split(' ')[0], lines: giver.quest };
    },

    villageAction(kind) {
      const scholar = this.state.scholar;
      if (kind === 'water') {
        scholar.water = 4;
        const msg = 'You fill your skin from the well. Cold. Clean. Home water.';
        this.say(msg); this.save(); return msg;
      }
      if (kind === 'fire') {
        const lines = [
          'The fire pops. Nobody talks for a while. It\'s enough.',
          'Someone throws another branch on. The sparks go up like they have somewhere to be.',
          'Twelve people around one fire. It doesn\'t feel small. It feels like a decision.',
          'The fire is the one thing the Burn couldn\'t take. Think about that.',
        ];
        this.state.fireIdx = (this.state.fireIdx || 0) + 1;
        const msg = lines[(this.state.fireIdx - 1) % lines.length];
        this.say(msg); return msg;
      }
      return null;
    },

    // --- village node ---
    // the roster: who lives here this run. mains talk; background have one line each.
    villageRoster() {
      const roster = this.state.village.roster || [];
      return roster.map(id => {
        const main = this.data.villagers.find(v => v.id === id);
        if (main) return { id, name: main.name, formerOccupation: main.formerOccupation, isMain: true };
        const bg = (this.data.background_survivors || []).find(v => v.id === id);
        if (bg) return { id, name: bg.name, formerOccupation: bg.formerOccupation, line: bg.line, isMain: false };
        return { id, name: id, formerOccupation: '', isMain: false };
      });
    },

    villageInfo() {
      const v = this.state.village;
      const codexN = Object.keys(this.state.codex.plants).length;
      const atmos = [
        'The fire is lit. Someone is mending something. It smells like smoke and rain.',
        'Morning in Haven. Twelve people, one fire, no plan beyond today.',
        'The clearing is quiet. A child is stacking stones. It feels like a beginning.',
      ];
      return {
        name: v.name, pop: 12, pantryKcal: Math.round(v.pantryKcal),
        atmos: atmos[this.state.scholar.day % atmos.length],
        codexN,
        scholarName: this.data.villagers.find(x => x.id === this.villagerId).name,
      };
    },

    depart() {
      // departure lite (member standing): tell someone you're going. no location switch — Haven is a tile.
      this.departed = true;
      this.dayPart = 0; this.ap = 1;
      const first = this.data.villagers.find(x => x.id === this.villagerId).name.split(' ')[0];
      this.say(`You tell the others you're heading out. Someone nods. "Come back before dark."`);
      this.say(`— DAY 1 DAWN — ${DAY_PART_HINT.dawn}`);
      this.save();
      return this.status();
    },

    returnToVillage() {
      // walking onto the Haven tile: the loop closes. what you carried feeds the village.
      // no day advance here — endDay owns the clock. this is just coming home.
      const s = this.state.scholar;
      const brought = s.inventory.reduce((t, i) => t + i.units * i.kcalEach, 0);
      const entries = Object.keys(this.state.codex.plants).length;
      const hasGreens = s.inventory.some(i => i.unit === 'handful' || i.unit === 'cup' || i.unit === 'oz');
      if (brought > 0) {
        this.state.village.pantryKcal += brought;
        s.inventory = [];
        this.say(`You unload ${Math.round(brought)} kcal into Haven's pantry.`);
      }
      if (this.won) {
        this.say(`You walk back into Haven with ${Math.round(brought)} kcal of food and ${entries} Codex entries. The pantry is fuller than when you left.`);
        this.say(`Mara: "Seven days. Thinner and smarter."`);
        this.say(`Jesse: "Back. That's the whole test, really."`);
        this.say(hasGreens ? `Aki: "You brought something green! I knew it."` : `Aki: "You're back. That's enough."`);
      }
      else if (s.health <= 0) {
        this.say(`You don't come back. The clearing is quieter. The Codex keeps what you wrote down.`);
        this.say(`Mara: "We buried what the woods sent back."`);
      }
      else {
        this.say(`You walk back into Haven. ${entries} Codex entries. The village is glad to see you.`);
        // win: the Codex is complete and the pantry is secure — Haven will make it. earned, not timed.
        // 10 plants + 8000 kcal forces 20+ days: depletion, death, and scarcity all bite.
        if (entries >= 10 && this.state.village.pantryKcal >= 8000 && !this.over) {
          this.over = true; this.won = true;
          this.say('Mara looks at the pantry, then at the Codex, then at you. "We\'re going to make it." Haven will survive — because someone learned the land, and wrote it down.');
        }
      }
      if (this.over) this.wipe(); // finished runs don't continue
      return this.status();
    },

    // --- autosave: one writer, one format. run data lives in state.run ---
    // the phone kills background tabs; an expedition must survive a refresh.
    syncRun() {
      this.state.run = {
        map: this.map, dayPart: this.dayPart, location: this.location,
        departed: this.departed, log: this.log.slice(-40),
        homeRegion: this.homeRegion, villagerId: this.villagerId,
        encounterDone: this.encounterDone, wanderer: this.wanderer || null, telemetry: this.state.telemetry || [],
        talkIdx: this.state.talkIdx || {}, fireIdx: this.state.fireIdx || 0,
        questGiven: !!this.state.questGiven,
      };
    },
    save() {
      if (this.over) return;
      this.syncRun();
      S.state.save(this.state);
    },
    hasSave() {
      try { return !!S.state.load(); } catch (e) { return false; }
    },
    load() {
      const s = S.state.load();
      if (!s || !s.run) return false;
      this.state = s;
      const r = s.run;
      this.map = r.map; this.dayPart = r.dayPart; this.location = r.location;
      this.departed = r.departed; this.log = r.log || [];
      this.homeRegion = r.homeRegion; this.villagerId = r.villagerId;
      this.encounterDone = r.encounterDone; this.wanderer = r.wanderer || null;
      this.over = false; this.won = false;
      return true;
    },
    wipe() { S.state.wipe(); },

    genMap() {
      // Procedural with logic: creek flows, wetlands hug water, groves cluster,
      // thickets edge, meadows open, one ruin with a story.
      const tiles = [];
      for (let y = 0; y < 7; y++) {
        const row = [];
        for (let x = 0; x < 7; x++) row.push({ type: 'forest_floor', revealed: false, stock: 1, maxStock: 1, visited: false });
        tiles.push(row);
      }
      const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < 7 && y < 7) tiles[y][x].type = t; };
      const at = (x, y) => (x >= 0 && y >= 0 && x < 7 && y < 7) ? tiles[y][x].type : null;

      // creek: random walk top→bottom
      let cx = 1 + Math.floor(Math.random() * 5), cy = 0;
      set(cx, cy, 'creek');
      while (cy < 6) {
        const mv = Math.random();
        if (mv < 0.45) cy++;
        else if (mv < 0.7) cx = Math.max(0, cx - 1);
        else cx = Math.min(6, cx + 1);
        set(cx, cy, 'creek');
      }
      // wetlands: adjacent to creek
      let placed = 0, guard = 0;
      while (placed < 3 && guard++ < 60) {
        const x = Math.floor(Math.random() * 7), y = Math.floor(Math.random() * 7);
        if (at(x, y) !== 'forest_floor') continue;
        const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy) === 'creek');
        if (nearWater) { set(x, y, 'wetland'); placed++; }
      }
      // groves: two clusters
      const blob = (sx, sy, t, n) => {
        let p = 0, g = 0;
        while (p < n && g++ < 40) {
          const x = sx + Math.floor(Math.random() * 3) - 1, y = sy + Math.floor(Math.random() * 3) - 1;
          if (at(x, y) === 'forest_floor') { set(x, y, t); p++; }
        }
      };
      blob(1 + Math.floor(Math.random() * 2), 1 + Math.floor(Math.random() * 2), 'grove', 4);
      blob(4 + Math.floor(Math.random() * 2), 4 + Math.floor(Math.random() * 2), 'grove', 4);
      // meadow: one open blob
      blob(2 + Math.floor(Math.random() * 3), 2 + Math.floor(Math.random() * 3), 'meadow', 5);
      // thickets: edges
      placed = 0; guard = 0;
      while (placed < 5 && guard++ < 60) {
        const edge = Math.random() < 0.5;
        const x = edge ? (Math.random() < 0.5 ? 0 : 6) : Math.floor(Math.random() * 7);
        const y = edge ? Math.floor(Math.random() * 7) : (Math.random() < 0.5 ? 0 : 6);
        if (at(x, y) === 'forest_floor') { set(x, y, 'thicket'); placed++; }
      }
      // trail: center cross
      for (let i = 1; i < 6; i++) { if (at(3, i) === 'forest_floor') set(3, i, 'trail_edge'); }
      // ruin: one, deliberate, with a story
      guard = 0;
      while (guard++ < 60) {
        const x = Math.floor(Math.random() * 7), y = Math.floor(Math.random() * 7);
        if (at(x, y) === 'forest_floor' && at(x + 1, y) !== 'creek' && at(x - 1, y) !== 'creek') {
          set(x, y, 'ruin');
          tiles[y][x].ruinStory = ['A collapsed barn. Pre-Burn. The wiring is gone — everything is gone — but the stones remember the shape of work.',
            'A farmhouse foundation. Someone\'s kitchen. The Burn took the wires from the walls; the walls kept standing out of spite.',
            'A gas station. The pumps are sculptures now. Nothing combustible within miles — the Burn was thorough.'][Math.floor(Math.random() * 3)];
          // finite pantry: 3-5 cans. the houses feed you until they don't.
          const nLoot = 3 + Math.floor(Math.random() * 3);
          tiles[y][x].loot = [];
          for (let i = 0; i < nLoot; i++) tiles[y][x].loot.push(SCAVENGED[Math.floor(Math.random() * SCAVENGED.length)].id);
          break;
        }
      }
      // stock: rich ground gives more pulls. number of times depends on the biome.
      // (computed inline — this.map doesn't exist yet during gen)
      const RICH = { grove: 1.5, wetland: 1.4, creek: 1.3, meadow: 1.3, thicket: 1.2, trail_edge: 1.0, forest_floor: 0.8 };
      for (let yy = 0; yy < 7; yy++) for (let xx = 0; xx < 7; xx++) {
        let r = RICH[tiles[yy][xx].type] || 1;
        for (let dy = -1; dy <= 1 && r < 1.8; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = xx + dx, ny = yy + dy;
          if (nx < 0 || ny < 0 || nx > 6 || ny > 6) continue;
          const nt = tiles[ny][nx].type;
          if (nt === 'creek' || nt === 'wetland') { r += 0.3; break; }
        }
        tiles[yy][xx].maxStock = r >= 1.5 ? 3 : r >= 1.0 ? 2 : 1;
        tiles[yy][xx].stock = tiles[yy][xx].maxStock;
      }
      // Haven was built where the land is good — guarantee a breadbasket by the door.
      // twelve people didn't settle on barren ground, and the first lesson shouldn't be a bad map roll.
      const doors = [[2, 3], [4, 3], [3, 2], [3, 4]];
      const door = doors[Math.floor(Math.random() * doors.length)];
      if (tiles[door[1]][door[0]].type !== 'ruin') {
        tiles[door[1]][door[0]].type = 'grove';
        // breadbasket is safety, not sufficiency: stock 2, not 3. a full day's work means ranging out.
        tiles[door[1]][door[0]].maxStock = 2; tiles[door[1]][door[0]].stock = 2;
      }
      // Haven is a tile, not a separate screen. home is a place you walk to.
      tiles[3][3].type = 'haven';
      tiles[3][3].stock = 0; tiles[3][3].maxStock = 0;
      tiles[3][3].revealed = true; tiles[3][3].visited = true;
      this.map = { tiles, px: 3, py: 3 };
      this.reveal(3, 3);
      const start = this.tileAt(3, 3);
      start.visited = true;
    },

    // --- detail grid: the world inside a tile ---
    // 9x9 cells per tile. generated lazily, seeded by position (stable across visits).
    // edges blend toward neighbor types: a grove by a creek has water on the creek side.
    // walk to the next tile and the boundary matches — one continuous world.
    detailSeed(x, y) {
      let h = (this.homeRegion || 'x').length * 7919 + x * 104729 + y * 1299709;
      h = (h ^ (h >> 13)) * 1274126177;
      return (h ^ (h >> 16)) >>> 0;
    },
    detailRand(seed) {
      let s = seed >>> 0;
      return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    },
    genDetail(x, y) {
      const t = this.tileAt(x, y);
      if (t.detail) return t.detail;
      const rnd = this.detailRand(this.detailSeed(x, y));
      const N = 9;
      const cells = [];
      const nType = (dx, dy) => {
        const nx = x + dx, ny = y + dy;
        return (nx < 0 || ny < 0 || nx > 6 || ny > 6) ? t.type : this.tileAt(nx, ny).type;
      };
      // base cell picker by tile type
      const pick = (type) => {
        const r = rnd();
        switch (type) {
          case 'grove': return r < 0.35 ? 'tree' : r < 0.5 ? 'bush' : r < 0.58 ? 'plant' : r < 0.85 ? 'grass' : 'dirt';
          case 'meadow': return r < 0.55 ? 'grass' : r < 0.72 ? 'plant' : r < 0.82 ? 'bush' : 'dirt';
          case 'thicket': return r < 0.45 ? 'bush' : r < 0.6 ? 'plant' : r < 0.75 ? 'grass' : 'dirt';
          case 'wetland': return r < 0.28 ? 'water' : r < 0.5 ? 'plant' : r < 0.8 ? 'grass' : 'dirt';
          case 'creek': return r < 0.3 ? 'water' : r < 0.55 ? 'grass' : r < 0.65 ? 'plant' : 'dirt';
          case 'forest_floor': return r < 0.25 ? 'tree' : r < 0.35 ? 'plant' : r < 0.6 ? 'dirt' : 'grass';
          case 'trail_edge': return r < 0.4 ? 'dirt' : r < 0.7 ? 'grass' : r < 0.8 ? 'plant' : 'bush';
          case 'ruin': return r < 0.25 ? 'rubble' : r < 0.4 ? 'wall' : r < 0.5 ? 'plant' : r < 0.75 ? 'dirt' : 'grass';
          case 'haven': return r < 0.2 ? 'tent' : r < 0.3 ? 'fire' : r < 0.55 ? 'dirt' : 'grass';
          default: return 'grass';
        }
      };
      for (let cy = 0; cy < N; cy++) {
        const row = [];
        for (let cx = 0; cx < N; cx++) {
          let cell = pick(t.type);
          // edge blending: 2 outer rows/cols lean toward the neighbor's type
          const edgeN = cy < 2 ? nType(0, -1) : null;
          const edgeS = cy > 6 ? nType(0, 1) : null;
          const edgeW = cx < 2 ? nType(-1, 0) : null;
          const edgeE = cx > 6 ? nType(1, 0) : null;
          const edge = edgeN || edgeS || edgeW || edgeE;
          if (edge && edge !== t.type && rnd() < 0.55) cell = pick(edge);
          // creek carves a channel; trail cuts a path (only if actually that type)
          if (t.type === 'creek' && cx >= 3 && cx <= 5) cell = rnd() < 0.8 ? 'water' : 'grass';
          if (t.type === 'trail_edge' && cy >= 3 && cy <= 5) cell = 'dirt';
          row.push(cell);
        }
        cells.push(row);
      }
      // big trees: 2x2 clusters that can straddle edges — the "splits biomes" feel
      const bigTrees = Math.floor(rnd() * 3);
      for (let i = 0; i < bigTrees; i++) {
        const bx = Math.floor(rnd() * 8), by = Math.floor(rnd() * 8);
        cells[by][bx] = 'bigtree'; cells[by][bx + 1] = 'bigtree';
        cells[by + 1][bx] = 'bigtree'; cells[by + 1][bx + 1] = 'bigtree';
      }
      t.detail = cells;
      return cells;
    },

    reveal(cx, cy) {
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        if (Math.abs(x - cx) + Math.abs(y - cy) <= 2) this.map.tiles[y][x].revealed = true;
      }
    },

    tileAt(x, y) { return this.map.tiles[y][x]; },
    playerTile() { return this.tileAt(this.map.px, this.map.py); },

    // --- travel: costs the day-part's action. destinations are decisions. ---
    travelTargets() {
      const out = [];
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const d = Math.abs(x - this.map.px) + Math.abs(y - this.map.py);
        if (d > 0 && d <= 3 && this.tileAt(x, y).revealed) out.push({ x, y, d });
      }
      return out;
    },

    travelTo(x, y) {
      if (this.over) return null;
      const t = this.travelTargets().find(t => t.x === x && t.y === y);
      if (!t) return null;
      this.map.px = x; this.map.py = y;
      this.reveal(x, y);
      const tile = this.playerTile();
      this.state.scholar.kcal -= 30 * t.d; // distance has a metabolic price
      let msg = `Travel ${t.d} tile${t.d > 1 ? 's' : ''} to ${S.TILE_NAME[tile.type]}.`;
      if (!tile.visited) {
        tile.visited = true;
        const arr = ARRIVAL[tile.type];
        msg += `\n— ${arr.title} —\n${tile.ruinStory || arr.text}`;
        // no free lessons on arrival — the land teaches when you work it, not when you walk in.
      }
      this.say(msg);
      if (tile.type === 'haven') this.returnToVillage();
      this.checkEncounter();
      this.checkQuest('travel');
      this.maybeOfferQuest();
      // travel consumes the day-part — time passes, no separate "end part" tap
      return this.endDayPart();
    },

    // --- node identity: the dominant biome/character of the tile + its neighbors ---
    // a grove by the creek is not the same place as a grove by the wetland
    // visual stage: the interface gets better as you progress. the Codex writes on the world.
    // 0: terminal/emoji (now). 1: annotated. 2: pixel entities. 3: arrival vignettes. 4: tileset.
    // each stage must earn its keep in playtesting before the next ships.
    visualStage() {
      const codex = Object.keys(this.state.codex.plants || {}).length;
      if (codex >= 8) return 1;
      return 0;
    },

    // the journal becomes the Codex at four entries. before that it's just your handwriting.
    journalName() {
      return Object.keys(this.state.codex.plants || {}).length >= 4 ? 'Codex' : 'Journal';
    },

    // tap a close-up tile: what do you know about this ground?
    tileInfo(x, y) {
      const t = this.tileAt(x, y);
      if (!t.revealed) return { name: 'Unknown ground', text: 'Fog. You haven\'t seen this ground yet.' };
      const epithet = this.nodeEpithet(x, y);
      if (t.type === 'haven') return { name: 'Haven', text: 'Home. Twelve people, one fire.' };
      if (t.type === 'ruin') return { name: epithet, text: (t.loot || []).length ? 'Pre-Burn ruin. There might be cans left.' : 'Pre-Burn ruin. Picked clean.' };
      if (t.knownPlant) {
        const kp = this.data.plants.find(p => p.id === t.knownPlant);
        if (kp) return { name: epithet, text: `${kp.name} country — you found ${kp.name.toLowerCase()} here. Your ${this.journalName().toLowerCase()} remembers.` };
      }
      return { name: epithet, text: `${S.TILE_NAME[t.type]}. You haven't worked this ground — no idea what's edible here yet.` };
    },

    nodeEpithet(x, y) {
      const t = this.tileAt(x, y);
      if (t.type === 'haven') return 'Haven';
      const nb = new Set();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx > 6 || ny > 6) continue;
        nb.add(this.tileAt(nx, ny).type);
      }
      const has = (...ts) => ts.some(t => nb.has(t));
      switch (t.type) {
        case 'grove': return has('creek') ? 'creekside grove' : has('wetland') ? 'drowned grove' : has('ruin') ? 'orchard ruin' : 'deep grove';
        case 'meadow': return has('ruin') ? 'old pasture' : has('creek') ? 'creek meadow' : 'open meadow';
        case 'creek': return has('wetland') ? 'the shallows' : 'creek bend';
        case 'wetland': return has('creek') ? 'creekmouth marsh' : 'still marsh';
        case 'thicket': return (x === 0 || y === 0 || x === 6 || y === 6) ? 'edge thicket' : 'heart thicket';
        case 'ruin': return 'the old place';
        case 'trail_edge': return 'the old trail';
        default: return 'forest floor';
      }
    },

    // --- bounty: the land's character drives what's findable. real ecology. ---
    // richness has a floor from the terrain itself + a bonus for good neighbors.
    // every map grows food; the skilled player finds the BEST food.
    bountyFor(x, y) {
      if (this.tileAt(x, y).type === 'haven') return null;
      const t = this.tileAt(x, y);
      const epithet = this.nodeEpithet(x, y);
      const FAVORED = {
        'creekside grove': ['cattail', 'Riparian ground. Water means life, and lunch.'],
        'drowned grove': ['cattail', 'Wet feet, full pantry.'],
        'deep grove': ['hickory_nut', 'Mast country. The old trees feed everything.'],
        'orchard ruin': ['persimmon', 'Someone planted food here once. The trees remember.'],
        'old pasture': ['dandelion', 'Disturbed ground grows good weeds.'],
        'creek meadow': ['wild_onion', 'Open ground by water — the onion beds.'],
        'open meadow': ['wild_onion', null],
        'creek bend': ['cattail', 'Slow water. The cattails stand thick.'],
        'the shallows': ['cattail', null],
        'creekmouth marsh': ['cattail', 'Where the creek spreads out, the starch grows.'],
        'still marsh': ['cattail', null],
        'edge thicket': ['blackberry', 'Edge habitat. Berries grow where the light gets in.'],
        'heart thicket': ['muscadine', null],
        'the old trail': ['chickweed', 'Trampled ground. The humble weeds win.'],
        'forest floor': ['wood_sorrel', 'Deep shade. The floor keeps its secrets.'],
      };
      const base = { grove: 1.5, wetland: 1.4, creek: 1.3, meadow: 1.3, thicket: 1.2, trail_edge: 1.0, forest_floor: 0.8 }[t.type] || 1.0;
      // water bonus: neighbors with creek/wetland
      let bonus = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx > 6 || ny > 6) continue;
        const nt = this.tileAt(nx, ny).type;
        if (nt === 'creek' || nt === 'wetland') { bonus = 0.3; break; }
      }
      const f = FAVORED[epithet];
      if (!f) return null;
      return { favored: f[0], richness: Math.round((base + bonus) * 10) / 10, why: f[1] };
    },

    // --- node detail: each tile is a node; arriving reveals its detail ---
    nodeDetail() {
      const t = this.playerTile();
      const arr = ARRIVAL[t.type];
      if (t.type === 'haven') {
        return {
          type: 'haven', title: arr.title, epithet: 'Haven', text: arr.text, here: ['home'],
          isRuin: false, isHaven: true, canForage: false, canTreat: false,
        };
      }
      const here = [];
      if (t.type === 'ruin') here.push((t.loot || []).length ? `${t.loot.length} can(s) left` : 'picked clean');
      else if ((t.stock || 0) > 0) here.push(t.stock >= 3 ? 'rich pickings' : t.stock === 2 ? 'good foraging' : 'a little left');
      else here.push('picked clean for today');
      if (t.bountyKnown && t.knownPlant) {
        const kp = this.data.plants.find(p => p.id === t.knownPlant);
        if (kp) here.push(`${kp.name.toLowerCase()} country`);
      }
      if (t.type === 'creek' || t.type === 'wetland') here.push('water to treat');
      if (this.wanderer && this.wanderer.x === this.map.px && this.wanderer.y === this.map.py) here.push('⚠ something big is here');
      return {
        type: t.type, title: arr.title, epithet: this.nodeEpithet(this.map.px, this.map.py),
        text: t.ruinStory || arr.text, here,
        isRuin: t.type === 'ruin',
        canForage: t.type === 'ruin' ? (t.loot || []).length > 0 : S.forage.canForage(t),
        canTreat: t.type === 'creek' || t.type === 'wetland',
      };
    },

    noteCodex(kind, text) {
      this.state.codex.terrain[kind] = text;
      this.say(`Codex: ${text}`);
    },

    checkEncounter() {
      // slice 1: the Bulldozer wanders from day 3 — visible, patrols, encounter on contact
      const scholar = this.state.scholar;
      if (scholar.day >= 3 && !this.wanderer && !this.encounterDone) {
        // spawn at a random revealed-edge thicket, or near player
        const spots = [];
        for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
          if (this.map.tiles[y][x].type === 'thicket') spots.push({ x, y });
        }
        const s = spots.length ? spots[Math.floor(Math.random() * spots.length)] : { x: 5, y: 5 };
        this.wanderer = { x: s.x, y: s.y, dir: Math.random() < 0.5 ? 1 : -1, monsterId: 'thornback_boar' };
        this.say('Something big is moving in the woods. The birds went quiet.');
      }
      if (this.wanderer && this.map.px === this.wanderer.x && this.map.py === this.wanderer.y) {
        this.encounterDone = true;
        this.pendingEncounter = true;
        this.wanderer = null;
      }
    },

    // wanderer patrols: pace back and forth along its row, 1 tile per day-part
    moveWanderer() {
      const w = this.wanderer;
      if (!w) return;
      const nx = w.x + w.dir;
      if (nx < 0 || nx > 6) { w.dir *= -1; return; }
      w.x = nx;
      // contact check after it moves (it can walk into you)
      if (w.x === this.map.px && w.y === this.map.py && !this.encounterDone) {
        this.encounterDone = true;
        this.pendingEncounter = true;
        this.wanderer = null;
      }
    },

    // --- pack weight: 15 kg. distance has a price; so does carrying. ---
    packCapacity() { return 15; },
    packWeight() {
      return this.state.scholar.inventory.reduce((t, i) => t + (i.units * (i.kg || 0.1)), 0);
    },
    canCarry(kg) { return this.packWeight() + kg <= this.packCapacity(); },

    // --- actions: each one consumes the day-part and advances time ---
    doAction(kind) {
      if (this.over) return null;
      const scholar = this.state.scholar;
      let msg = '';
      if (kind === 'forage') {
        const t = this.playerTile();
        // ruins: scavenge finite loot, not plants
        if (t.type === 'ruin') {
          if (!t.loot || !t.loot.length) { this.say('Picked clean. The houses fed someone — not you.'); return null; }
          const lootId = t.loot.shift();
          const item = SCAVENGED.find(s => s.id === lootId);
          if (!this.canCarry(item.kg)) { t.loot.unshift(lootId); this.say('Too heavy — your pack can\'t take it. Eat something or leave it.'); return null; }
          scholar.inventory.push({ plantId: lootId, units: 1, kcalEach: item.kcal, spoilDay: 9999, name: item.name, unit: 'can', prep: 'No prep. The miracle of the can.', kg: item.kg });
          scholar.kcal -= 100;
          msg = `You pry open a cupboard: ${item.name} (+${item.kcal} kcal). ${item.text}` + (t.loot.length ? '' : ' That\'s everything. This house is done.');
          this.say(msg);
          this.tele('scavenge', { item: item.name, kcal: item.kcal, lootLeft: t.loot.length, packKg: Math.round(this.packWeight() * 10) / 10 });
          return this.endDayPart();
        }
        if (!S.forage.canForage(t)) { this.say('Nothing left to take here today.'); return null; }
        t.stock -= 1;
        const bounty = this.bountyFor(this.map.px, this.map.py);
        const r = S.forage.forage(t, this.biome(), this.data.plants, scholar, this.state.codex, this.data.abilities, bounty);
        const kg = r.units * 0.1;
        if (!this.canCarry(kg)) { t.stock += 1; this.say('Your pack is full. Eat something, or leave it for the woods.'); return null; }
        if (r.firstFind) {
          this.state.codex.plants[r.plantId] = { identifiedDay: scholar.day };
          this.integrate(3, 'discovery');
          // the journal becomes a CODEX at four entries — the System notices, names it.
          if (Object.keys(this.state.codex.plants).length === 4)
            this.say('SYSTEM: Journal designated CODEX. Four entries. What you write, the village keeps.');
        }
        // discovery labels the place: the map remembers your BEST find here, not just the first.
        // the land's "why" comes after you've found something, not before.
        const prevBest = t.knownPlant ? this.data.plants.find(p => p.id === t.knownPlant) : null;
        if (!t.knownPlant || (r.plant.caloriesPerUnit > (prevBest ? prevBest.caloriesPerUnit : 0))) {
          const isNew = !t.knownPlant;
          t.knownPlant = r.plantId; t.bountyKnown = true;
          if (isNew && bounty && bounty.why) this.say(`Journal: ${bounty.why}`);
          else if (!isNew) this.say(`Journal updated: ${r.plant.name} grows here too — better than ${prevBest.name.toLowerCase()}.`);
        }
        scholar.inventory.push({ plantId: r.plantId, units: r.units, kcalEach: r.plant.caloriesPerUnit, spoilDay: scholar.day + (r.plant.spoilageDays || 2), name: r.plant.name, unit: r.plant.unit, prep: r.plant.preparation, kg: 0.1 });
        scholar.kcal -= S.calories.ACTION_COSTS.forage;
        msg = r.message + ` (${r.kcal} kcal to your pack — eat up.)` + (r.firstFind ? ` (${r.plant.codex})` : '');
        this.tele('forage', { tile: t.type, epithet: this.nodeEpithet(this.map.px, this.map.py), plant: r.plantId, units: r.units, kcal: r.kcal, cost: S.calories.ACTION_COSTS.forage, firstFind: !!r.firstFind });
      } else if (kind === 'rest') {
        scholar.energy = Math.min(100, scholar.energy + 30);
        scholar.health = Math.min(100, scholar.health + 5);
        scholar.kcal -= 40;
        msg = 'You rest. Breath slows. +30 energy.';
      } else if (kind === 'wait') {
        msg = 'You wait. The light changes. Nothing asks anything of you.';
      } else if (kind === 'treat') {
        const t = this.playerTile();
        if (t.type !== 'creek' && t.type !== 'wetland') { this.say('Need moving water — find a creek or wetland.'); return null; }
        scholar.water = (scholar.water || 0) + 2;
        scholar.kcal -= S.calories.ACTION_COSTS.treat_water;
        msg = 'You boil water over a small fire. +2 clean water.';
      }
      this.say(msg);
      this.checkQuest(kind);
      this.maybeOfferQuest();
      // the action took the day-part — time passes, no separate "end part" tap
      return this.endDayPart();
    },

    checkQuest(kind) {
      const q = this.state.scholar.activeQuest;
      if (!q) return;
      if (q.type === 'bring' && kind === 'forage') {
        const has = this.state.scholar.inventory.filter(i => i.plantId === q.plant).reduce((t, i) => t + i.units, 0);
        if (has >= q.qty) {
          // turn in: remove from inventory, give reward
          let need = q.qty;
          for (const item of this.state.scholar.inventory) {
            if (item.plantId === q.plant && need > 0) {
              const take = Math.min(item.units, need);
              item.units -= take; need -= take;
            }
          }
          this.state.scholar.inventory = this.state.scholar.inventory.filter(i => i.units > 0);
          this.state.scholar.activeQuest = null;
          if (q.reward === 'pantry') {
            this.state.village.pantryKcal += 500;
            this.say(`✅ ${q.giverName} takes the ${q.plant}. "+500 kcal to the pantry. You're good people."`);
          } else if (q.reward === 'knowledge') {
            this.integrate(5, 'quest');
            this.say(`✅ ${q.giverName} listens carefully. You understand the land a little better. (+integration)`);
          } else {
            this.say(`✅ ${q.giverName} grins. "Pleasure doing business." (The barter economy grows.)`);
            this.integrate(2, 'barter');
          }
        }
      } else if (q.type === 'visit' && kind === 'travel') {
        if (this.playerTile().type === q.tileType) {
          this.state.scholar.activeQuest = null;
          this.integrate(5, 'quest');
          this.say(`✅ You saw the ${q.tileType}. ${q.giverName} nods. "Good. Now we know." (+integration)`);
        }
      }
    },

    // --- free minors ---
    eat() {
      const scholar = this.state.scholar;
      if (this.over) return;
      // eat most-perishable first until kcal >= 2400 or empty
      scholar.inventory.sort((a, b) => a.spoilDay - b.spoilDay);
      let ate = 0;
      while (scholar.kcal < 2400 && scholar.inventory.length) {
        const it = scholar.inventory[0];
        const kcal = it.kcalEach;
        scholar.kcal += kcal; ate += kcal;
        it.units -= 1;
        if (it.units <= 0) scholar.inventory.shift();
      }
      // spoilage: drop expired
      const before = scholar.inventory.length;
      scholar.inventory = scholar.inventory.filter(i => i.spoilDay > scholar.day);
      const spoiled = before - scholar.inventory.length;
      this.say(ate > 0 ? `You eat (${ate} kcal).` + (spoiled ? ` ${spoiled} item(s) spoiled — the Codex notes the waste.` : '')
                       : (scholar.inventory.length ? 'You are full enough.' : 'Nothing to eat. The pantry of your pack is empty.'));
      if (ate > 0) this.tele('eat', { ateKcal: ate, spoiled });
    },

    drinkTreated() {
      const scholar = this.state.scholar;
      if ((scholar.water || 0) < 1) { this.say('No clean water. Treat some at a creek.'); return; }
      scholar.water -= 1;
      scholar.hydration = Math.min(100, scholar.hydration + 50);
      this.say('You drink clean water. +50 hydration.');
    },

    drinkWild() {
      const scholar = this.state.scholar;
      const t = this.playerTile();
      if (t.type !== 'creek' && t.type !== 'wetland') { this.say('No water here.'); return; }
      scholar.hydration = Math.min(100, scholar.hydration + 40);
      if (Math.random() < 0.15) {
        scholar.health -= 10;
        this.say('You drink from the creek. +40 hydration. Your stomach turns — untreated water is a gamble. (-10 health)');
      } else this.say('You drink from the creek. +40 hydration. (Untreated — a gamble.)');
    },

    endDayPart() {
      if (this.over) return this.status();
      // small energy tick per part
      this.state.scholar.energy = Math.max(0, this.state.scholar.energy - 5);
      this.moveWanderer();
      this.dayPart += 1;
      if (this.dayPart >= 4) return this.endDay();
      this.ap = 1;
      this.say(`— ${DAY_PARTS[this.dayPart].toUpperCase()} — ${DAY_PART_HINT[DAY_PARTS[this.dayPart]]}`);
      this.save();
      return this.status();
    },

    // village lives: the others aren't waiting. each day, 1-2 villagers do something.
    // they forage, they get hurt, they find things. they discover along with you.
    villageLives() {
      const v = this.state.village;
      if (!v.roster) return;
      const bg = v.roster.filter(id => !this.data.villagers.find(m => m.id === id));
      if (!bg.length) return;
      const n = 1 + (Math.random() < 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const id = bg[Math.floor(Math.random() * bg.length)];
        const person = this.data.background_survivors.find(p => p.id === id);
        if (!person) continue;
        const first = person.name.split(' ')[0];
        const r = Math.random();
        if (r < 0.05) {
          // BIG DAY: 3 people bringing two days each happens. someone has the day of their life.
          const kcal = 1500 + Math.floor(Math.random() * 1001);
          v.pantryKcal += kcal;
          this.say(`${first} had the day of their life — ${kcal} kcal. Two days of food from one person.`);
        } else if (r < 0.35) {
          // brings food: a real haul (400-800 kcal), not a snack. this is their work, made visible.
          const kcal = 400 + Math.floor(Math.random() * 401);
          v.pantryKcal += kcal;
          this.say(`${first} came back with ${kcal} kcal of something edible. The pantry breathes.`);
        } else if (r < 0.5) {
          // wounded: health bars. -20 to -35 per bad day.
          v.health = v.health || {};
          const curH = v.health[id] !== undefined ? v.health[id] : 100;
          const dmg = 20 + Math.floor(Math.random() * 16);
          v.health[id] = Math.max(0, curH - dmg);
          if (v.health[id] <= 0) {
            v.roster = v.roster.filter(rid => rid !== id);
            this.say(`💀 ${person.name} is gone. The wound was too much. The village is ${v.roster.length} now.`);
            delete v.health[id];
          } else {
            this.say(`${first} is hurt — a fall, a thorn, a bad step. (health ${v.health[id]}/100)`);
          }
        } else if (r < 0.65) {
          // discovers something (adds to codex if new!)
          const undiscovered = this.data.plants.filter(p => !this.state.codex.plants[p.id]);
          if (undiscovered.length && Math.random() < 0.3) {
            const p = undiscovered[Math.floor(Math.random() * undiscovered.length)];
            this.state.codex.plants[p.id] = { identifiedDay: this.state.scholar.day, by: first };
            this.say(`${first} found ${p.name}! They brought you a sample. The ${this.journalName()} grows.`);
          } else {
            this.say(`${first}: "${person.line}"`);
          }
        } else {
          // barter/economy flavor
          this.say(`${first} traded something with someone for something else. The barter economy stirs.`);
        }
      }
    },

    // village metabolism: every mouth eats, a few hands provide. the rates add up.
    // KNOWLEDGE FEEDS: each codex entry teaches the village what's edible.
    // they forage better because of you. the scholar's contribution isn't always calories.
    // expeditions are open-ended — the pantry clock is the arc, not a timer.
    villageEats() {
      const v = this.state.village;
      let eat = 0, give = 0;
      const providers = [];
      for (const id of (v.roster || [])) {
        const person = this.data.villagers.find(p => p.id === id) || this.data.background_survivors.find(p => p.id === id);
        if (!person) continue;
        const health = (v.health && v.health[id] !== undefined) ? v.health[id] : 100;
        const healthFactor = health / 100;
        // the sick eat less (can't keep it down) and provide nothing
        eat += (person.kcalPerDay || 2000) * (0.7 + 0.3 * healthFactor);
        // taught plants: villagers who LEARN (via dialogue) forage better. real mechanism.
        const knownPlants = (v.taught && v.taught[id]) ? v.taught[id].length : 0;
        const knowledgeFactor = 1 + (knownPlants * 0.15);
        // TRUST: they share food when they trust you. strangers hoard.
        // trust 0-30: 20% shared. 30-60: 50%. 60-80: 80%. 80+: all.
        const trust = (v.trust && v.trust[id] !== undefined) ? v.trust[id] : 10;
        const trustFactor = trust < 30 ? 0.2 : trust < 60 ? 0.5 : trust < 80 ? 0.8 : 1.0;
        const personalGive = (person.providesPerDay || 0) * healthFactor * knowledgeFactor * trustFactor;
        if (personalGive > 0) { give += personalGive; providers.push(person); }
      }
      const net = Math.max(0, eat - give);
      v.lastEat = eat; v.lastGive = give; v.lastProviders = providers.map(p => p.name.split(' ')[0]);
      v.pantryKcal = Math.max(0, v.pantryKcal - net);
      // starvation is slow: -5 health/day when empty. people fade.
      // health recovers +2/day when there's food.
      v.health = v.health || {};
      if (v.pantryKcal <= 0) {
        for (const rid of (v.roster || [])) {
          const cur = v.health[rid] !== undefined ? v.health[rid] : 100;
          v.health[rid] = Math.max(0, cur - 5);
          if (v.health[rid] <= 0) {
            const vp = this.data.villagers.find(m => m.id === rid) || this.data.background_survivors.find(p => p.id === rid);
            v.roster = v.roster.filter(r => r !== rid);
            this.say(`💀 ${(vp && vp.name) || rid} starved. Slowly. The village is ${v.roster.length} now.`);
            delete v.health[rid];
          }
        }
      } else {
        for (const rid of (v.roster || [])) {
          if (v.health[rid] !== undefined && v.health[rid] < 100 && v.health[rid] > 0) {
            v.health[rid] = Math.min(100, v.health[rid] + 2);
          }
        }
      }
      if (v.pantryKcal <= 0) {
        v.hungryDays = (v.hungryDays || 0) + 1;
        this.say(`⚠ Haven's pantry is empty. Day ${v.hungryDays} of hunger.`);
        if (v.hungryDays >= 3) {
          this.over = true; this.villageLost = true;
          this.say('Haven couldn\'t hold. On the third hungry day, people started walking — in different directions. The scattering, again.');
          this.wipe();
        }
      } else {
        if (v.hungryDays) this.say('Haven eats again. The hollow look fades.');
        v.hungryDays = 0;
      }
    },

    endDay() {
      const scholar = this.state.scholar;
      // regrow: +1/day up to maxStock. food comes back, but slowly.
      // strip a grove and it takes 3 days to recover. not unlimited, but renewable.
      // state persists — the land remembers what you took.
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const t = this.map.tiles[y][x];
        if (t.maxStock > 0) t.stock = Math.min(t.maxStock, (t.stock || 0) + 1);
      }
      // evening: run metabolism
      const res = S.calories.resolveDay(scholar, this.state.village);
      res.warnings.forEach(w => this.say('⚠ ' + w));
      // the village eats whether you're there or not — every day you're out, twelve mouths
      this.villageLives();
      this.villageEats();
      // depletion: every 5 days, the easy food is gone. the land gets tired.
      if (this.state.scholar.day % 5 === 0) {
        for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
          const t = this.tileAt(x, y);
          if (t.type !== 'haven' && t.type !== 'ruin' && t.maxStock > 1) {
            t.maxStock -= 1;
            t.stock = Math.min(t.stock, t.maxStock);
          }
        }
        this.say('The land is getting tired. The easy food is gone.');
      }
      if (this.villageLost) { return this.status(); } // no home to return to
      if (this.over) { this.returnToVillage(); return this.status(); }
      if (!res.ok || scholar.health <= 0) {
        this.over = true;
        this.say('You didn\'t make it. The village remembers. The Codex keeps what you brought home.');
        this.returnToVillage();
        return this.status();
      }
      scholar.day += 1;
      this.dayPart = 0; this.ap = 1;
      this.say(`— DAY ${scholar.day} DAWN — ${DAY_PART_HINT.dawn}`);
      this.save();
      return this.status();
    },

    // --- combat ---
    startCombat() {
      const monster = this.data.monsters.find(m => m.id === 'thornback_boar') || this.data.monsters[0];
      this.fight = S.combat.newFight(monster, this.state.scholar);
      this.pendingEncounter = false;
      this.say(`A BULLDOZER crashes from the thicket — ${monster.codexStages.unknown}`);
      return this.fight;
    },

    combatRound(cmd) {
      const r = S.combat.round(this.fight, cmd, this.state.scholar, this.data.abilities);
      r.log.forEach(l => this.say(l));
      this.state.scholar.health = Math.max(0, this.fight.scholarHp);
      if (cmd === 'study' && !this.state.codex.monsters) this.state.codex.monsters = {};
      if (cmd === 'study') this.state.codex.monsters['thornback_boar'] = { stage: 'observed' };
      if (r.result === 'won') {
        this.state.codex.monsters = this.state.codex.monsters || {};
        this.state.codex.monsters['thornback_boar'] = { stage: 'slain' };
        const scholar = this.state.scholar;
        scholar.inventory.push({ plantId: 'boar_meat', units: 4, kcalEach: 800, spoilDay: scholar.day + 3, name: 'Bulldozer meat', unit: 'cut', prep: 'Smoke it — it keeps for weeks.', kg: 0.8 });
        this.say('The Bulldozer falls. Pork is pork — 3,200 kcal of it. The village will eat. (+4 cuts of meat)');
        this.fight = null;
      } else if (r.result === 'fled') {
        this.fight = null;
        this.say('You escape. The thicket keeps its secrets.');
      } else if (r.result === 'lost') {
        this.over = true; this.fight = null;
        this.say('The Bulldozer does not go around. You didn\'t make it. The village remembers.');
      }
      if (this.state.scholar.health <= 0 && !this.over) { this.over = true; this.say('You didn\'t make it.'); }
      return r;
    },

    say(msg) { this.log.push(msg); if (this.log.length > 40) this.log.shift(); },

    // --- telemetry: every meaningful event, with state deltas. for diagnosing playtests. ---
    tele(type, data) {
      this.state.telemetry = this.state.telemetry || [];
      const s = this.state.scholar || {};
      this.state.telemetry.push(Object.assign({
        t: Date.now(), day: s.day || 0, part: DAY_PARTS[this.dayPart] || '?', type,
        kcal: Math.round(s.kcal || 0), hp: Math.round(s.health || 0),
        packKcal: (this.state.scholar ? this.state.scholar.inventory.reduce((t, i) => t + i.units * i.kcalEach, 0) : 0),
        pantry: Math.round(this.state.village ? this.state.village.pantryKcal : 0),
      }, data || {}));
      if (this.state.telemetry.length > 300) this.state.telemetry.splice(0, this.state.telemetry.length - 300);
    },

    status() {
      const s = this.state.scholar;
      return {
        day: s.day, dayPart: DAY_PARTS[this.dayPart], dayPartHint: DAY_PART_HINT[DAY_PARTS[this.dayPart]],
        ap: this.ap, health: Math.round(s.health), kcal: Math.round(s.kcal),
        hydration: Math.round(s.hydration), energy: Math.round(s.energy),
        water: s.water || 0,
        inventory: s.inventory.map(i => ({ name: i.name, units: i.units, kcalEach: i.kcalEach, spoilDay: i.spoilDay })),
        invKcal: s.inventory.reduce((t, i) => t + i.units * i.kcalEach, 0),
        pantryKcal: Math.round(this.state.village.pantryKcal),
        pantryDays: Math.floor(this.state.village.pantryKcal / Math.max(1, (this.state.village.lastEat || 800) - (this.state.village.lastGive || 0))),
        villageEat: Math.round(this.state.village.lastEat || 800),
        villageGive: Math.round(this.state.village.lastGive || 0),
        villageProviders: this.state.village.lastProviders || [],
        villageKnowledge: this.state.village.lastKnowledgeBonus || 0,
        rosterCount: (this.state.village.roster || []).length,
        integration: Math.round(this.state.scholar.integration || 5),
        activeQuest: this.state.scholar.activeQuest || null,
        hungryDays: this.state.village.hungryDays || 0,
        packKg: Math.round(this.packWeight() * 10) / 10,
        packCap: this.packCapacity(),
        px: this.map.px, py: this.map.py,
        over: this.over, won: this.won,
        location: this.location, departed: this.departed,
        inCombat: !!this.fight,
        pendingEncounter: !!this.pendingEncounter,
        wanderer: this.wanderer ? { x: this.wanderer.x, y: this.wanderer.y } : null,
        log: this.log.slice(-6),
        codexCount: Object.keys(this.state.codex.plants).length,
        abilities: s.abilities,
      };
    },

    codexEntries() {
      return Object.keys(this.state.codex.plants).map(pid => {
        const p = this.data.plants.find(x => x.id === pid);
        return p ? { name: p.name, kcal: p.caloriesPerUnit, unit: p.unit, prep: p.preparation, text: p.codex } : null;
      }).filter(Boolean);
    },
  };

  global.Scattering = global.Scattering || {};
  global.Scattering.Game = Game;
  global.Scattering.DAY_PARTS = DAY_PARTS;
  global.Scattering.TILE_GLYPH = TILE_GLYPH;
  global.Scattering.TILE_NAME = TILE_NAME;
})(typeof window !== 'undefined' ? window : globalThis);
