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
    wetland: '💧', creek: '🌊', trail_edge: '🟨', ruin: '🏚️', haven: '🏫',
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
      const [plants, biomes, monsters, villagers, abilities, items, background_survivors, cellDefs, animals, recipes, books] = await Promise.all(
        ['plants.json', 'biomes.json', 'monsters.json', 'villagers.json', 'abilities.json', 'items.json', 'background_survivors.json', 'cell_defs.json', 'animals.json', 'recipes.json', 'books.json'].map(get));
      this.data = { plants, biomes, monsters, villagers, abilities, items, background_survivors, cellDefs, animals, recipes, books };
      return this.data;
    },

    biome() { return this.data.biomes.find(b => b.id === 'se_woodlands'); },

    newGame(homeRegion, villagerId, pickedItems) {
      this.homeRegion = homeRegion; this.villagerId = villagerId;
      const villager = this.data.villagers.find(v => v.id === villagerId);
      this.state = S.state.newState();
      this.state.village.name = 'Haven';
      // Starting pantry: REAL FOOD, not a number. 1.5-3 days for the group.
      // Each item: name, kcal, spoilDay, safe, kg. Unsafe stays unsafe.
      const nPpl = 12;
      const startDays = 1.5 + Math.random() * 1.5;
      const targetKcal = Math.round(nPpl * 2000 * startDays);
      this.state.village.pantry = []; // list of food items
      this.state.village.pantryKcal = 0; // (kept for compat, computed from pantry)
      // Fill with staples: dried beans, rice, canned goods (safe, long spoil).
      // Staples: beans are RAW (need cooking, 150 raw -> 300 cooked).
      // If you don't know to cook them, they're half the food. Knowledge is calories.
      // 1.5 days for 12 people = 36,000 kcal. (12 * 2000 * 1.5)
      // Was 8,500. Starvation was mathematically inevitable. Fixed.
      const staples = [
        { name: 'Dried beans', rawKcal: 150, cookedKcal: 300, kcalEach: 150, units: 60, spoilDay: 9999, safe: false, kg: 0.5, needsCooking: true },
        { name: 'Rice', rawKcal: 200, cookedKcal: 350, kcalEach: 200, units: 50, spoilDay: 9999, safe: false, kg: 0.5, needsCooking: true },
        { name: 'Canned soup', kcalEach: 250, units: 30, spoilDay: 9999, safe: true, kg: 0.4 },
        { name: 'Dried meat', kcalEach: 400, units: 20, spoilDay: 9999, safe: true, kg: 0.3 },
      ];
      let kcal = 0;
      for (const s of staples) {
        const item = { ...s };
        this.state.village.pantry.push(item);
        kcal += item.kcalEach * item.units;
      }
      // (If target not met, it's fine — RNG means some runs start leaner.)
      this.state.village.water = { clean: 20, dirty: 0 }; // liters. Clean and dirty separate.
      // the roster: 6 mains (the story) + 6 drawn from 36 background survivors (the variety).
      // twelve mouths, different every run.
      const mains = ['mara_okafor', 'jesse_calhoun', 'aki_tanaka', 'ruth_delgado', 'theo_park', 'priya_nair'];
      const pool = [...this.data.background_survivors];
      const bg = [];
      for (let i = 0; i < 6 && pool.length; i++) bg.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].id);
      this.state.village.roster = mains.concat(bg);
      this.state.village.villagers = mains; // mains have dialogue; background have one-liners
      // ACT 0: trust starts low. you're 12 strangers from all over the world.
      // everyone woke up in the SAME building — but WHICH building varies.
      // by location, and by run. even ohio isn't always a school.
      // the drama is proximity: you're stuck with these people. figure it out.
      this.state.village.trust = {};
      // BUILDINGS by spawn type. City: you wake up in an apartment or office.
      // Countryside: school, church, warehouse. The building matches the world.
      const spawnType = this.state.spawnType || 'countryside';
      const buildingPools = {
        city: ['apartment', 'office', 'warehouse'],
        countryside: ['school', 'warehouse', 'church'],
      };
      const bpool = buildingPools[spawnType] || ['school', 'warehouse'];
      const buildingType = bpool[Math.floor(Math.random() * bpool.length)];
      this.state.village.buildingType = buildingType;
      const buildingNames = {
        school: 'the school gymnasium',
        warehouse: 'the warehouse loading bay',
        church: 'the church basement',
        apartment: 'the apartment lobby',
        office: 'the office break room',
      };
      this.state.village.spawnBuilding = buildingNames[buildingType];
      for (const rid of this.state.village.roster) {
        // trust 5-20: strangers. it's earned.
        this.state.village.trust[rid] = 5 + Math.floor(Math.random() * 16);
      }
      // you trust yourself
      this.state.village.trust[villagerId] = 100;
      // (Jesse's snare is granted after newCodex below — order matters.)
      // VILLAGERS IN THE GRID: each has a position (mx, my) in the Haven building.
      // they wander turn-based. you see them. you tap them.
      this.state.village.positions = {};
      // place them in the building (not on walls, not on you)
      const freeCells = [];
      // (positions assigned when Haven detail generates — see ensureVillagerPositions)
      
      // TEACHERS: everyone knows a few plants (from their old life).
      // mains know 2, background know 1. what they know, they can teach.
      this.state.village.taught = {};
      const plantIds = this.data.plants.map(p => p.id);
      for (const rid of this.state.village.roster) {
        const isMain = this.data.villagers.find(m => m.id === rid);
        const n = isMain ? 2 : 1;
        const known = [];
        for (let i = 0; i < n && plantIds.length; i++) {
          known.push(plantIds[Math.floor(Math.random() * plantIds.length)]);
        }
        this.state.village.taught[rid] = [...new Set(known)]; // dedupe
      }
      const scholar = S.state.newScholar(villagerId);
      const gear = (pickedItems && pickedItems.length === 5) ? pickedItems : villager.items.slice(0, 5);
      scholar.inventory = gear.map(id => ({ itemId: id, units: 1, kg: 0.2, name: (this.data.items.find(i => i.id === id) || {}).name || id }));
      // Start with a day's food. You're not starving on arrival (that's day 3).
      scholar.inventory.push(
        { name: 'Trail mix', kcalEach: 400, units: 2, spoilDay: 9999, safe: true, kg: 0.3, unit: 'bag' },
        { name: 'Dried meat', kcalEach: 300, units: 2, spoilDay: 30, safe: true, kg: 0.2, unit: 'strip' },
      );
      // granted abilities from villager data (2 each, defined here for slice 1)
      const granted = {
        mara_okafor: ['triage', 'steady_hands'],
        jesse_calhoun: ['game_sense', 'patient_aim'],
        aki_tanaka: ['field_dressing', 'preservation_instinct'],
      };
      scholar.abilities = granted[villagerId] || [];
      // WATER BOTTLES: 1L each, 1kg each. Assume you have bottles.
      // Quality matters: clean vs risky. Source is retained.
      scholar.water = [
        { liters: 1, quality: 'clean', source: 'Haven' },
        { liters: 1, quality: 'clean', source: 'Haven' },
      ];
      this.state.scholar = scholar;
      this.state.codex = S.state.newCodex();
      // Jesse (hunter) starts knowing the snare. Others must learn.
      if (villagerId === 'jesse_calhoun') {
        this.state.codex.recipes['snare'] = { level: 3 };
      }
      this.dayPart = 0; this.ap = 1; this.over = false; this.won = false;
      this.villageLost = false; this.wanderer = null; this.fight = null; this.pendingEncounter = false;
      this.encounterDone = false; this.log = [];
      this.location = 'village'; this.departed = false;
      this.wipe();
      this.genMap();
      this.genVillages();
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

    // TEACH: "show me what an oak leaf looks like."
    // Good education: they show you a picture, you get it. Instant level 1.
    // Bad education: "it looks a bit like that" — partial (+1 encounter, not full).
    // Teacher quality: occupation matters. A cook teaches food well. A nurse teaches medicine.
    teachPlant(vid, plantId) {
      const teacher = this.data.villagers.find(x => x.id === vid) || this.data.background_survivors.find(x => x.id === vid);
      const plant = this.data.plants.find(p => p.id === plantId);
      if (!teacher || !plant) return null;
      // does the teacher know it?
      const teacherKnows = (this.state.village.taught && this.state.village.taught[vid] || []).includes(plantId);
      // (for now, mains know 2 random plants; background know 1)
      if (!teacherKnows) {
        this.say(`${teacher.name.split(' ')[0]} doesn\'t know that one either.`);
        return null;
      }
      const occ = (teacher.formerOccupation || '').toLowerCase();
      // good teacher: relevant occupation, high trust
      const trust = (this.state.village.trust && this.state.village.trust[vid]) || 10;
      const isGoodTeacher = (occ.includes('cook') || occ.includes('chef') || occ.includes('hunter')) && trust > 40;
      const isMedicTeacher = occ.includes('nurse') && plant.medicinal && trust > 40;
      this.state.codex.encounters = this.state.codex.encounters || {};
      if (isGoodTeacher || isMedicTeacher) {
        // good education: instant unlock
        this.state.codex.plants[plantId] = { identifiedDay: this.state.scholar.day, level: 1, harvests: 0, tastings: 0 };
        this.state.codex.encounters[plantId] = 99; // learned
        this.say(`${teacher.name.split(' ')[0]} shows you — a leaf, a picture scratched in dirt. You get it. ${plant.name}.`);
        this.integrate(2, 'taught');
      } else {
        // bad education: partial
        const enc = (this.state.codex.encounters[plantId] || 0) + 1;
        this.state.codex.encounters[plantId] = enc;
        this.say(`${teacher.name.split(' ')[0]} tries to explain. "It looks... a bit like that?" You\'re not sure. (${enc} encounters)`);
      }
      // teaching builds trust
      if (this.state.village.trust) {
        this.state.village.trust[vid] = Math.min(100, ((this.state.village.trust[vid] || 10) + 8));
      }
      return true;
    },

    // CRAFT: make a recipe you know (L3). Consumes materials. Creates an item with uses.
    // Items degrade: snare breaks after 2 catches. You make another.
    craft(recipeId) {
      const recipe = this.data.recipes.find(r => r.id === recipeId);
      if (!recipe) return null;
      const known = (this.state.codex.recipes || {})[recipeId];
      // L2: you understand it. Attempting it (succeed or fail) teaches L3.
      if (!known || known.level < 2) {
        this.say(`You don\'t know how to make a ${recipe.name} yet.`);
        return null;
      }
      // check materials
      const inv = this.state.scholar.inventory;
      for (const [mat, need] of Object.entries(recipe.materials)) {
        const have = inv.filter(i => i.material === mat).reduce((t, i) => t + i.units, 0);
        if (have < need) {
          this.say(`Need ${need} ${mat} (have ${have}).`);
          return null;
        }
      }
      // consume materials
      for (const [mat, need] of Object.entries(recipe.materials)) {
        let left = need;
        for (const item of inv) {
          if (item.material !== mat || left <= 0) continue;
          const take = Math.min(item.units, left);
          item.units -= take; left -= take;
        }
      }
      this.state.scholar.inventory = inv.filter(i => i.units > 0);
      // create the item
      this.state.scholar.tools = this.state.scholar.tools || [];
      this.state.scholar.tools.push({ recipeId, uses: recipe.uses, name: recipe.name });
      this.say(`You make a ${recipe.name}. ${recipe.description} (${recipe.uses} uses)`);
      return true;
    },

    // LEARN RECIPE: like plants. Seen (L1), taught materials (L2), practiced (L3).
    learnRecipe(recipeId, level) {
      this.state.codex.recipes = this.state.codex.recipes || {};
      const cur = this.state.codex.recipes[recipeId] || { level: 0 };
      if (level > cur.level) {
        this.state.codex.recipes[recipeId] = { level };
        const recipe = this.data.recipes.find(r => r.id === recipeId);
        this.say(`Recipe: ${recipe.name}. ${recipe.knowledgeLevels[String(level)]}`);
      }
    },

    // SET TRAP: place a snare/deadfall. Check it later.
    setTrap(recipeId) {
      const tool = (this.state.scholar.tools || []).find(t => t.recipeId === recipeId);
      if (!tool) { this.say('You don\'t have that trap.'); return null; }
      const recipe = this.data.recipes.find(r => r.id === recipeId);
      // traps go in the current tile's detail (at your position)
      const t = this.playerTile();
      t.traps = t.traps || [];
      const mx = this.state.scholar.mx ?? 4, my = this.state.scholar.my ?? 4;
      t.traps.push({ recipeId, mx, my, setDay: this.state.scholar.day, uses: tool.uses });
      // remove from tools (it's set now)
      this.state.scholar.tools = this.state.scholar.tools.filter(x => x !== tool);
      this.say(`You set a ${recipe.name} here. Check it tomorrow.`);
      return true;
    },

    // CHECK TRAPS: at day start, traps may have caught something.
    checkTraps() {
      const t = this.playerTile();
      if (!t.traps || !t.traps.length) return;
      for (const trap of [...t.traps]) {
        if (trap.setDay >= this.state.scholar.day) continue; // set today, check tomorrow
        const recipe = this.data.recipes.find(r => r.id === trap.recipeId);
        // 40% chance per day (if the animal is here)
        if (Math.random() < 0.4) {
          const catchId = recipe.catches[Math.floor(Math.random() * recipe.catches.length)];
          const animal = this.data.animals.find(a => a.id === catchId);
          this.state.scholar.inventory.push({
            plantId: 'meat_' + animal.id, units: 1, kcalEach: animal.calories,
            spoilDay: this.state.scholar.day + 1, name: animal.name + ' (trapped)',
            unit: 'carcass', prep: 'Cook before eating.', kg: animal.calories / 1000
          });
          this.say(`Your ${recipe.name} caught a ${animal.name}! ${animal.calories} kcal.`);
          trap.uses -= 1;
          if (trap.uses <= 0) {
            this.say(`The ${recipe.name} broke. You\'ll need another.`);
            t.traps = t.traps.filter(x => x !== trap);
          } else {
            trap.setDay = this.state.scholar.day; // reset, check again tomorrow
          }
        }
      }
    },

    // READ BOOK: treasure trove. Unlocks big chunks of codex at once.
    // Not all at once — you find them occasionally, in ruins, offices, basements.
    readBook(bookId) {
      const book = this.data.books.find(b => b.id === bookId);
      if (!book) return null;
      this.say(`You open "${book.name}". ${book.flavor}`);
      const unlocks = book.unlocks || {};
      // plants
      for (const pid of (unlocks.plants || [])) {
        const level = unlocks.level || 1;
        this.state.codex.plants[pid] = { identifiedDay: this.state.scholar.day, level, harvests: 0, tastings: 0 };
        this.state.codex.encounters[pid] = 99;
        const plant = this.data.plants.find(p => p.id === pid);
        this.say(`Learned: ${plant.name} (Level ${level}). ${plant.knowledgeLevels[String(level)]}`);
      }
      // recipes
      for (const rid of (unlocks.recipes || [])) {
        this.learnRecipe(rid, 3);
      }
      // animals
      for (const aid of (unlocks.animals || [])) {
        this.state.codex.animalEncounters = this.state.codex.animalEncounters || {};
        this.state.codex.animalEncounters[aid] = 99;
        const animal = this.data.animals.find(a => a.id === aid);
        this.say(`Learned: ${animal.name}.`);
      }
      this.integrate(5, 'book');
      // remove the book (you've absorbed it)
      this.state.scholar.inventory = this.state.scholar.inventory.filter(i => i.bookId !== bookId);
      return true;
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
        // TEACHING MOMENT: you show your haul. they gather. someone might know something.
        // "What's this?" — and if they know, they teach. real foraging knowledge, exchanged.
        // find a villager who knows something you don't, and trusts you enough to share
        const v = this.state.village;
        const candidates = (v.roster || []).filter(rid => {
          const trust = (v.trust && v.trust[rid]) || 0;
          return trust > 30 && rid !== this.villagerId;
        });
        if (candidates.length && Math.random() < 0.5) {
          const teacherId = candidates[Math.floor(Math.random() * candidates.length)];
          const teacherKnows = (v.taught && v.taught[teacherId]) || [];
          const youKnow = Object.keys(this.state.codex.plants);
          const toTeach = teacherKnows.filter(pid => !youKnow.includes(pid) && this.data.plants.find(p => p.id === pid));
          if (toTeach.length) {
            const pid = toTeach[Math.floor(Math.random() * toTeach.length)];
            // they teach you (using the teachPlant logic, but as a moment not an action)
            this.say(`Around the fire, you show your haul.`);
            this.teachPlant(teacherId, pid);
          }
        }
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
      try { return S.state.listSaves().length > 0; } catch (e) { return false; }
    },
    listSaves() {
      try { return S.state.listSaves(); } catch (e) { return []; }
    },
    load(key) {
      const s = S.state.load(key);
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

    // OTHER VILLAGES: 2-3 on the map. They live their own game.
    // When you meet one mid-game, it has history — catch-up sim runs days since start.
    genVillages() {
      const villages = [];
      const nVillages = 2 + Math.floor(Math.random() * 2); // 2-3
      for (let i = 0; i < nVillages; i++) {
        // place away from haven (3,3) and away from each other
        let x, y, tries = 0;
        do {
          x = Math.floor(Math.random() * 7); y = Math.floor(Math.random() * 7);
          tries++;
        } while (tries < 50 && (
          (Math.abs(x - 3) + Math.abs(y - 3) < 3) || // not too close to haven
          villages.some(v => Math.abs(v.x - x) + Math.abs(v.y - y) < 2) // not too close to each other
        ));
        const village = {
          id: `village_${i}`,
          name: ['Emberhold', 'Stonebridge', 'Thornfield', 'Ashford'][i] || `Village ${i}`,
          x, y,
          day: 0, // how many days they've been simulated
          population: 8 + Math.floor(Math.random() * 5), // 8-12
          pantryKcal: 2000 + Math.floor(Math.random() * 3000),
          knowledge: Math.floor(Math.random() * 5), // codex-like level
          generated: false, // becomes true when player approaches
        };
        villages.push(village);
      }
      this.state.otherVillages = villages;
    },

    // catchUpSim: when you approach a village, simulate all days since game start.
    // They're not fresh — they've been living, foraging, competing.
    catchUpSim(village) {
      const targetDay = this.state.scholar.day;
      const daysToSim = targetDay - village.day;
      if (daysToSim <= 0) return;
      // Fast sim: each day, they forage (depleting the world), eat, maybe grow.
      for (let d = 0; d < daysToSim; d++) {
        // forage: 400-800 per person, depletes world
        const forage = village.population * (400 + Math.random() * 400);
        village.pantryKcal += forage;
        // they deplete the world near them (competition!)
        this.depleteRandomTile(Math.ceil(forage / 500));
        // eat: 2000 per person
        village.pantryKcal -= village.population * 2000;
        // starvation: lose people if pantry empty
        if (village.pantryKcal < 0) {
          village.pantryKcal = 0;
          if (Math.random() < 0.3 && village.population > 4) {
            village.population--;
          }
        }
        // knowledge grows slowly
        if (Math.random() < 0.2) village.knowledge++;
        village.day++;
      }
      village.generated = true;
    },

    // checkVillageProximity: when player gets within 2 tiles, generate + catch up.
    checkVillageProximity() {
      const px = this.map.px, py = this.map.py;
      for (const v of (this.state.otherVillages || [])) {
        const dist = Math.abs(v.x - px) + Math.abs(v.y - py);
        if (dist <= 2 && !v.generated) {
          this.catchUpSim(v);
          this.say(`You see smoke on the horizon. ${v.name} — ${v.population} people, ${v.day} days in. They've been here the whole time.`);
        }
      }
    },

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
      // HAVEN IS A BUILDING. The type varies by location and run.
      // Each is a scale model: walls are walls, the door leads outside.
      // Long-term: satellite imagery to build to scale from reality.
      if (t.type === 'haven') {
        const bt = (this.state.village && this.state.village.buildingType) || 'school';
        const layouts = {
          school: [
            ['wall','wall','wall','wall','wall','wall','wall','wall','wall'],
            ['wall','class','class','wall','wall','wall','class','class','wall'],
            ['wall','class','class','wall','wall','wall','class','class','wall'],
            ['wall','wall','wall','gym','gym','gym','wall','wall','wall'],
            ['wall','wall','wall','gym','gym','gym','wall','wall','wall'],
            ['wall','wall','wall','gym','gym','gym','wall','wall','wall'],
            ['wall','wall','wall','wall','door','wall','wall','wall','wall'],
            ['wall','hall','hall','hall','hall','hall','hall','hall','wall'],
            ['wall','wall','wall','wall','wall','wall','wall','wall','wall'],
          ],
          warehouse: [
            ['wall','wall','wall','wall','wall','wall','wall','wall','wall'],
            ['wall','office','office','wall','bay','bay','bay','bay','wall'],
            ['wall','office','office','wall','bay','bay','bay','bay','wall'],
            ['wall','wall','wall','wall','bay','bay','bay','bay','wall'],
            ['wall','dock','dock','door','bay','bay','bay','bay','wall'],
            ['wall','dock','dock','wall','bay','bay','bay','bay','wall'],
            ['wall','wall','wall','wall','wall','wall','wall','wall','wall'],
            ['wall','hall','hall','hall','hall','hall','hall','hall','wall'],
            ['wall','wall','wall','wall','wall','wall','wall','wall','wall'],
          ],
          church: [
            ['wall','wall','wall','wall','wall','wall','wall','wall','wall'],
            ['wall','office','wall','sanct','sanct','sanct','wall','office','wall'],
            ['wall','office','wall','sanct','sanct','sanct','wall','office','wall'],
            ['wall','wall','wall','sanct','sanct','sanct','wall','wall','wall'],
            ['wall','wall','wall','sanct','sanct','sanct','wall','wall','wall'],
            ['wall','wall','wall','wall','door','wall','wall','wall','wall'],
            ['wall','base','base','base','base','base','base','base','wall'],
            ['wall','base','base','base','base','base','base','base','wall'],
            ['wall','wall','wall','wall','wall','wall','wall','wall','wall'],
          ],
          apartment: [
            ['wall','wall','wall','wall','wall','wall','wall','wall','wall'],
            ['wall','apt','apt','wall','apt','apt','wall','apt','wall'],
            ['wall','apt','apt','wall','apt','apt','wall','apt','wall'],
            ['wall','wall','wall','hall','hall','hall','wall','wall','wall'],
            ['wall','apt','apt','hall','hall','hall','apt','apt','wall'],
            ['wall','apt','apt','wall','door','wall','apt','apt','wall'],
            ['wall','wall','wall','wall','wall','wall','wall','wall','wall'],
            ['wall','lobby','lobby','lobby','lobby','lobby','lobby','lobby','wall'],
            ['wall','wall','wall','wall','wall','wall','wall','wall','wall'],
          ],
          office: [
            ['wall','wall','wall','wall','wall','wall','wall','wall','wall'],
            ['wall','cube','cube','cube','wall','cube','cube','cube','wall'],
            ['wall','cube','cube','cube','wall','cube','cube','cube','wall'],
            ['wall','wall','wall','wall','hall','wall','wall','wall','wall'],
            ['wall','break','break','hall','hall','hall','conf','conf','wall'],
            ['wall','break','break','wall','door','wall','conf','conf','wall'],
            ['wall','wall','wall','wall','wall','wall','wall','wall','wall'],
            ['wall','lobby','lobby','lobby','lobby','lobby','lobby','lobby','wall'],
            ['wall','wall','wall','wall','wall','wall','wall','wall','wall'],
          ],
        };
        const layout = layouts[bt] || layouts.school;
        // FIRE: every Haven has a campfire in the common area (hall row 7, center).
        // This is where you cook. No fire = no cooking.
        if (layout[7] && layout[7][4]) layout[7][4] = 'fire';
        t.detail = layout;
        return layout;
      }
      const rnd = this.detailRand(this.detailSeed(x, y));
      const N = 9;
      const cells = [];
      // RIVER: for creek tiles, a continuous meandering river (2 wide) with one bridge.
      // it blocks the whole way besides the bridge. you go around, or you cross there.
      let river = null, bridge = null;
      if (t.type === 'creek') {
        const horizontal = rnd() < 0.5;
        const base = 3 + Math.floor(rnd() * 3); // river center line (3-5)
        river = { horizontal, cells: [] };
        for (let i = 0; i < 9; i++) {
          const meander = Math.floor((rnd() - 0.5) * 3); // -1 to +1
          const c = Math.max(1, Math.min(7, base + meander));
          river.cells.push(c);
        }
        // one bridge: a random position along the river, ON the river (not adjacent).
        const bi = Math.floor(rnd() * 9);
        const rc = river.cells[bi];
        bridge = horizontal ? { x: bi, y: rc } : { x: rc, y: bi };
      }
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
          case 'creek': return r < 0.55 ? 'grass' : r < 0.65 ? 'plant' : 'dirt'; // river is the water, not random puddles
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
          // river overrides: water (blocks), bridge (passable)
          if (river) {
            const horiz = river.horizontal;
            const rc = river.cells[horiz ? cx : cy];
            const isRiver = horiz ? (cy === rc || cy === rc + 1) : (cx === rc || cx === rc + 1);
            if (isRiver) {
              const isBridge = bridge && cx === bridge.x && cy === bridge.y;
              cell = isBridge ? 'bridge' : 'water';
            }
          }
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
      // MODIFIERS: every space has factors. they synthesize on the fly.
      // Water: flow + clarity + source. Running clear spring: best. Stagnant murky runoff: poison.
      // Tree: species + health + ivy. You SEE the modifiers (murky, ivy). You learn the system.
      // Knowledge sticks — stored per-cell, persists.
      t.secrets = t.secrets || {};
      t.modifiers = t.modifiers || {};
      const rnd2 = this.detailRand(this.detailSeed(x, y) + 999);
      // CELL DEFS: data-driven modifiers. see src/data/cell_defs.json.
      // to add variety: edit the JSON, not the code.
      const cellDefs = this.data.cellDefs ? this.data.cellDefs.cellTypes : null;
      const rollMod = (def) => {
        if (!def || !def.modifiers) return null;
        const out = { known: false };
        for (const [mkey, mdef] of Object.entries(def.modifiers)) {
          // fromTile override (e.g., creek -> running water)
          if (mdef.fromTile && mdef.fromTile[t.type]) {
            out[mkey] = mdef.fromTile[t.type];
          } else {
            const r = rnd2();
            let acc = 0;
            for (let i = 0; i < mdef.values.length; i++) {
              acc += mdef.weights[i];
              if (r < acc) { out[mkey] = mdef.values[i]; break; }
            }
          }
        }
        return out;
      };
      for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
        const key = cx + ',' + cy;
        const c = cells[cy][cx];
        if (t.modifiers[key]) continue;
        if (c === 'tree' || c === 'bigtree') {
          const species = rnd2() < 0.4 ? 'oak' : rnd2() < 0.7 ? 'hickory' : 'pine';
          const health = rnd2() < 0.75 ? 'healthy' : 'diseased';
          const ivy = rnd2() < 0.3;
          t.modifiers[key] = { species, health, ivy, known: false };
          // yield synthesizes: healthy oak no ivy = 3, diseased pine with ivy = 0
          let yield_ = 0;
          if (!ivy && health === 'healthy') yield_ = species === 'oak' ? 3 : species === 'hickory' ? 2 : 1;
          else if (!ivy && health === 'diseased') yield_ = 1;
          t.secrets[key] = { yield: yield_, known: false };
        } else if (c === 'water') {
          // flow from tile type: creek = running, wetland = stagnant, else random
          const flow = t.type === 'creek' ? 'running' : t.type === 'wetland' ? 'stagnant' : (rnd2() < 0.5 ? 'running' : 'stagnant');
          const clarity = rnd2() < 0.6 ? 'clear' : 'murky';
          const source = t.type === 'creek' ? 'creek' : t.type === 'wetland' ? 'pond' : (rnd2() < 0.3 ? 'spring' : 'pond');
          // near ruin? runoff (poison risk)
          const nearRuin = false; // TODO: check neighbors
          t.modifiers[key] = { flow, clarity, source: nearRuin ? 'runoff' : source, known: false };
          // safety synthesizes: running+clear+spring = safe. stagnant+murky+runoff = poison.
          let safe = true;
          if (flow === 'stagnant' && clarity === 'murky') safe = false;
          if (source === 'runoff') safe = false;
          if (flow === 'stagnant' && rnd2() < 0.3) safe = false; // stagnant is risky
          t.secrets[key] = { safe, known: false };
        } else if (c === 'tent') {
          const r = rnd2();
          t.secrets[key] = { condition: r < 0.5 ? 'good' : r < 0.8 ? 'shredded' : 'packable', known: false };
        } else if (cellDefs && (c === 'bush' || c === 'plant' || c === 'rubble' || c === 'fire')) {
          // data-driven: roll from cell_defs.json. easy to iterate.
          const mod = rollMod(cellDefs[c]);
          if (mod) t.modifiers[key] = mod;
          // synthesize secrets from modifiers
          if (c === 'bush' && mod) {
            // ripe blackberry no thorns = best. unripe or thorns = less/harm.
            const has = mod.berry !== 'none' && mod.ripeness === 'ripe';
            t.secrets[key] = { yield: has ? 2 : (mod.berry !== 'none' ? 1 : 0), thorns: mod.thorns, known: false };
          } else if (c === 'plant' && mod) {
            t.secrets[key] = { yield: mod.maturity === 'mature' ? 2 : mod.maturity === 'seeding' ? 1 : 0, known: false };
          } else if (c === 'rubble' && mod) {
            t.secrets[key] = { loot: mod.loot, amount: mod.loot === 'none' ? 0 : 1 + Math.floor(rnd2() * 2), known: false };
          }
        }
      }
      // STOCK FROM THE WORLD: count forageable cells. what exists is what you can take.
      // no abstract numbers. the grid is the inventory.
      // note: trees with 0 yield still count (you don't know until you check).
      const FORAGEABLE = { plant: 1, bush: 1, tree: 1, bigtree: 1 };
      let count = 0;
      for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
        if (FORAGEABLE[cells[cy][cx]]) count++;
      }
      // the world is the truth: detail count overrides abstract map stock.
      // but don't reset if we've already depleted (stock < maxStock means we've been here).
      if (t.stock === undefined || t.stock === t.maxStock) {
        t.maxStock = count; t.stock = count;
      }
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
    // FOG OF WAR: you can walk into "?" — the unknown. Adjacent unrevealed tiles are valid.
    // You don't know what's there until you arrive. Hope nothing's waiting.
    travelTargets() {
      const out = [];
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const d = Math.abs(x - this.map.px) + Math.abs(y - this.map.py);
        const t = this.tileAt(x, y);
        // revealed within 3, OR adjacent unrevealed (walking into fog)
        if (d > 0 && (d <= 3 && t.revealed || d === 1)) out.push({ x, y, d, unknown: !t.revealed });
      }
      return out;
    },

    travelTo(x, y) {
      const dest = this.tileAt(x, y);
      const wasUnknown = !dest.revealed;
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
      // Walking into fog: the wanderer system (checkEncounter) handles "something is there."
      // No invented ambush odds. If the Bulldozer is on this tile, you'll meet it.
      this.say(msg);
      // arrive at the center of the new tile's detail grid. you're IN the world now.
      this.state.scholar.mx = 4; this.state.scholar.my = 4;
      // MONSTERS FOLLOW (if they want to). Territorial and hungry ones do. Skittish ones don't.
      const oldMonster = this.state.scholar.monster;
      if (oldMonster) {
        const mdef = this.data.monsters.find(m => m.id === oldMonster.id);
        if (mdef && mdef.follows) {
          // it followed you. it's in the new tile's grid.
          this.say(`It followed you. The ${mdef.name} is here.`);
        } else {
          this.state.scholar.monster = null; // it didn't care enough to follow
        }
      }
      this.state.scholar.animal = null; // animals don't follow
      if (tile.type === 'haven') this.returnToVillage();
      this.checkEncounter();
      this.checkAnimals();
      this.checkQuest('travel');
    },

    // micro-move: step to an adjacent cell in the 9x9. costs calories, not time.
    // this is how you reach the plant, the water, the monster. the world is physical.
    microMove(cx, cy) {
      const s = this.state.scholar;
      const px = s.mx ?? 4, py = s.my ?? 4;
      const dx = Math.abs(cx - px), dy = Math.abs(cy - py);
      if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) return false;
      if (cx < 0 || cx > 8 || cy < 0 || cy > 8) return false;
      // INTERACTION MODEL: the world is physical and consistent.
      // blocks: you can't walk through. interact: what you can do from adjacent.
      // tree blocks AND feeds (nuts). water blocks AND quenches. wall just blocks.
      const detail = this.genDetail(this.map.px, this.map.py);
      const cell = detail[cy] && detail[cy][cx];
      const props = this.cellProps(cell);
      if (props.blocks) return false; // can't walk through, but might interact (see cellInteract)
      const cost = props.cost || 10;
      // Movement is baseline. Power doesn't tax walking.
      s.kcal = Math.max(0, s.kcal - cost);
      s.mx = cx; s.my = cy;
      // A step is not a decision. The world doesn't advance because you shifted your weight.
      // Monsters, animals, and villagers move on their own schedule (or when you ACT).
      this.ensureVillagerPositions();
      return true;
    },

    // cellInteract: tap a cell to USE it. but it's a MAYBE — you learn the truth up close.
    // tree might have nuts or be ivy. water might be poison. tent might be shredded.
    // knowledge sticks: once you know, you know.
    cellInteract(cx, cy) {
      // ACTIONS move the world. Steps don't.
      this.monsterTurn();
      this.animalTurn();
      this.villagerTurn();
      const t = this.playerTile();
      const detail = this.genDetail(this.map.px, this.map.py);
      const cell = detail[cy] && detail[cy][cx];
      const key = cx + ',' + cy;
      const secret = t.secrets && t.secrets[key];
      const px = this.state.scholar.mx ?? 4, py = this.state.scholar.my ?? 4;
      const dist = Math.max(Math.abs(cx - px), Math.abs(cy - py));
      if (dist > 1) { this.say('Too far. Step closer.'); return null; }

      // TREE: modifiers synthesize. you see species, health, ivy. you learn the system.
      if (cell === 'tree' || cell === 'bigtree') {
        const mod = t.modifiers && t.modifiers[key];
        if (secret && !secret.known) {
          secret.known = true;
          if (mod) mod.known = true;
          const desc = mod ? `${mod.species}, ${mod.health}${mod.ivy ? ', ivy-covered' : ''}` : 'a tree';
          if (secret.yield === 0) {
            this.say(`This ${desc}. Nothing to take. You note it — you won\'t waste time here again.`);
            return true;
          } else {
            this.say(`This ${desc}. Nuts — about ${secret.yield} worth. You take them.`);
          }
        } else if (secret && secret.known && secret.yield === 0) {
          this.say('You already checked. Nothing.');
          return true;
        }
        return this.doAction('forage');
      }
      // WATER: flow + clarity + source synthesize. running is better than stagnant.
      if (cell === 'water') {
        const mod = t.modifiers && t.modifiers[key];
        if (secret && !secret.known) {
          secret.known = true;
          if (mod) mod.known = true;
          const desc = mod ? `${mod.flow}, ${mod.clarity}, ${mod.source}` : 'water';
          if (!secret.safe) {
            this.say(`This water is ${desc}. Wrong. Poison. You mark it. Don\'t drink.`);
            return true;
          } else {
            this.say(`Water: ${desc}. Safe. You drink.`);
          }
        } else if (secret && secret.known && !secret.safe) {
          this.say('Poison water. You know better.');
          return true;
        }
        return this.doAction('drink');
      }
      // TENT: maybe good, shredded, or packable.
      if (cell === 'tent') {
        if (secret && !secret.known) {
          secret.known = true;
          if (secret.condition === 'shredded') {
            this.say('The tent is shredded — wind and teeth. Not usable. You leave it.');
            return true;
          } else if (secret.condition === 'packable') {
            this.say('This tent is intact — and light. You pack it up. (Shelter for later.)');
            detail[cy][cx] = 'dirt'; // it's gone, you took it
            return true;
          } else {
            this.say('A good tent. Dry inside. You could rest here.');
          }
        } else if (secret && secret.known) {
          if (secret.condition === 'shredded') { this.say('Shredded. You checked.'); return true; }
        }
        return this.doAction('rest');
      }
      // BUSH: thorns hurt. you learn to be careful.
      if (cell === 'bush') {
        const mod = t.modifiers && t.modifiers[key];
        if (mod) mod.known = true;
        if (secret) secret.known = true;
        // Learning the bush: it gets a species, neighbors chain-reveal, icon updates.
        const species = this.revealBush(cx, cy);
        this.say(`It's a ${species}. You'll recognize the patch now.`);
        if (secret && secret.thorns) {
          this.state.scholar.kcal -= 20; // thorns scratch
          this.say('Thorns. You get the berries, but they take a little blood. (-20 kcal)');
        }
        return this.doAction('forage');
      }
      if (cell === 'plant') {
        const mod = t.modifiers && t.modifiers[key];
        if (mod) mod.known = true;
        if (secret) secret.known = true;
        return this.doAction('forage');
      }
      // FIRE: warm
      if (cell === 'fire') { this.say('You warm your hands. The fire pops.'); return true; }
      // RUBBLE: might have loot. shifting rubble is dangerous.
      if (cell === 'rubble') {
        const mod = t.modifiers && t.modifiers[key];
        if (mod) mod.known = true;
        if (secret) secret.known = true;
        if (mod && mod.stability === 'shifting') {
          this.say('The rubble shifts under you. Careful.');
          // 20% chance of minor injury
          if (Math.random() < 0.2) {
            this.state.scholar.kcal -= 50;
            this.say('A stone slips — your ankle twists. (-50 kcal)');
          }
        }
        if (secret && secret.loot && secret.loot !== 'none') {
          this.say(`You find ${secret.amount} ${secret.loot}.`);
        } else if (secret) {
          this.say('Picked clean. Nothing.');
          return true;
        }
        return this.doAction('forage');
      }
      return null;
    },

    // ANIMALS: spawn by biome. they flee from you (not toward, like monsters).
    // rabbit in meadow, squirrel in grove, fish in creek, deer in forest, turkey in meadow/forest.
    checkAnimals() {
      const t = this.playerTile();
      const s = this.state.scholar;
      if (s.animal || Math.random() > 0.3) return; // 30% chance per tile entry
      const candidates = (this.data.animals || []).filter(a => (a.biomes || []).includes(t.type));
      if (!candidates.length) return;
      const animal = candidates[Math.floor(Math.random() * candidates.length)];
      // spawn at distance, not on you
      const px = s.mx ?? 4, py = s.my ?? 4;
      let ax, ay, tries = 0;
      do {
        ax = Math.floor(Math.random() * 9); ay = Math.floor(Math.random() * 9);
        tries++;
      } while (tries < 20 && Math.abs(ax - px) + Math.abs(ay - py) < 3);
      s.animal = { id: animal.id, mx: ax, my: ay };
      this.say(`Movement — ${animal.description}.`);
    },

    // animals flee when you move. they're scared of you.
    animalTurn() {
      const s = this.state.scholar;
      const a = s.animal;
      if (!a || a.mx === undefined) return;
      const px = s.mx ?? 4, py = s.my ?? 4;
      // flee: move away from player (1 cell)
      const dx = Math.sign(a.mx - px), dy = Math.sign(a.my - py);
      // don't flee off the grid or into walls/water
      const nx = Math.max(0, Math.min(8, a.mx + dx));
      const ny = Math.max(0, Math.min(8, a.my + dy));
      const detail = this.genDetail(this.map.px, this.map.py);
      const cell = detail[ny] && detail[ny][nx];
      const BLOCKS = { wall: 1, water: 1, bigtree: 1, tree: 1, tent: 1, fire: 1 };
      if (!BLOCKS[cell]) { a.mx = nx; a.my = ny; }
      // if it gets to the edge, it escapes (despawns)
      if (a.mx === 0 || a.mx === 8 || a.my === 0 || a.my === 8) {
        s.animal = null;
      }
    },

    // HUNT: adjacent to animal, tap it. Success by difficulty and your condition.
    // EQUIPMENT SLOTS: weapon, armor. Equipped, not "best in backpack."
    // You can't carry 3 spears for triple bonus. One slot, one item.
    equip(itemIdx, slot) {
      const item = this.state.scholar.inventory[itemIdx];
      if (!item) return null;
      const def = this.data.items.find(i => i.id === (item.itemId || item.id));
      if (!def) return null;
      // validate slot
      if (slot === 'weapon' && def.class !== 'weapon') { this.say('That\'s not a weapon.'); return null; }
      if (slot === 'armor' && !def.armor) { this.say('That\'s not armor.'); return null; }
      this.state.scholar.equipped = this.state.scholar.equipped || {};
      // unequip current (back to inventory, stays there)
      // equip new (remove from inventory, set slot)
      this.state.scholar.equipped[slot] = { itemId: def.id, name: def.name };
      // remove from inventory (it's worn, not carried)
      this.state.scholar.inventory.splice(itemIdx, 1);
      this.say(`Equipped ${def.name} (${slot}).`);
      return null;
    },
    unequip(slot) {
      const eq = (this.state.scholar.equipped || {})[slot];
      if (!eq) return null;
      // back to inventory
      this.state.scholar.inventory.push({ itemId: eq.itemId, name: eq.name, units: 1, kg: 0.5 });
      delete this.state.scholar.equipped[slot];
      this.say(`Unequipped ${eq.name}.`);
      return null;
    },
    armorBonus() {
      const eq = (this.state.scholar.equipped || {}).armor;
      if (!eq) return 0;
      const def = this.data.items.find(i => i.id === eq.itemId);
      return (def && def.armor) ? def.armor.protection : 0;
    },

    isWeapon(item) {
      const def = this.data.items.find(i => i.id === (item.itemId || item.id));
      return def && def.class === 'weapon' && def.weapon;
    },
    isArmor(item) {
      const def = this.data.items.find(i => i.id === (item.itemId || item.id));
      return def && def.armor;
    },
    // isUsable: can you USE this item? (first aid, etc.)
    isUsable(item) {
      const name = (item.name || '').toLowerCase();
      return name.includes('first aid') || name.includes('bandage') || name.includes('medicine');
    },

    // useItem: use it. First aid heals.
    useItem(idx) {
      const item = this.state.scholar.inventory[idx];
      if (!item || !this.isUsable(item)) return null;
      const name = item.name.toLowerCase();
      if (name.includes('first aid')) {
        this.state.scholar.health = Math.min(100, this.state.scholar.health + 30);
        this.say('You use the first aid kit. +30 health.');
      }
      // consume one
      item.units--;
      if (item.units <= 0) {
        this.state.scholar.inventory.splice(idx, 1);
      }
      return null;
    },

    // cellProps: shared. What blocks, what you can do.
    cellProps(cell) {
      const P = {
        wall: { blocks: 1 }, water: { blocks: 1, interact: 'drink' },
        bigtree: { blocks: 1, interact: 'forage' }, tree: { blocks: 1, interact: 'forage' },
        bush: { interact: 'forage' }, plant: { interact: 'forage' },
        tent: { blocks: 1, interact: 'rest' }, fire: { blocks: 1, interact: 'cook' },
        rubble: { interact: 'scavenge', cost: 20 },
        bridge: {}, door: {}, gym: {}, class: {}, hall: {}, office: {},
        bay: {}, dock: {}, sanct: {}, base: {}, grass: {}, dirt: {},
      };
      return P[cell] || {};
    },

    // findPath: BFS shortest path avoiding blocked cells. Returns list of [x,y] or null.
    findPath(sx, sy, tx, ty) {
      const detail = this.genDetail(this.map.px, this.map.py);
      const key = (x, y) => `${x},${y}`;
      const visited = new Set([key(sx, sy)]);
      const queue = [[sx, sy, []]]; // [x, y, path]
      while (queue.length) {
        const [x, y, path] = queue.shift();
        if (x === tx && y === ty) return path.concat([[tx, ty]]);
        for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
          if (visited.has(key(nx, ny))) continue;
          const cell = detail[ny] && detail[ny][nx];
          const props = this.cellProps(cell);
          if (props.blocks) continue;
          visited.add(key(nx, ny));
          queue.push([nx, ny, path.concat([[nx, ny]])]);
        }
      }
      return null; // no path
    },

    // movePath: walk a path. Cost = 10 kcal per square. Not free, not a decision.
    movePath(tx, ty) {
      const s = this.state.scholar;
      const sx = s.mx ?? 4, sy = s.my ?? 4;
      const path = this.findPath(sx, sy, tx, ty);
      if (!path) { this.say('No path there.'); return false; }
      const cost = path.length * 10;
      if (s.kcal < cost) { this.say(`Need ${cost} kcal, have ${Math.round(s.kcal)}. Eat first.`); return false; }
      s.kcal -= cost;
      s.mx = tx; s.my = ty;
      this.say(`Walked ${path.length} squares (${cost} kcal).`);
      this.ensureVillagerPositions();
      return true;
    },

    // cookFood: at a fire, raw -> cooked. More calories, safer.
    // Requires: fire nearby, knowledge (L3 tells you it needs cooking).
    cookFood(idx) {
      const item = this.state.scholar.inventory[idx];
      if (!item) return null;
      // need fire (in detail grid)
      const detail = this.genDetail(this.map.px, this.map.py);
      let hasFire = false;
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
        if (detail[y] && detail[y][x] === 'fire') hasFire = true;
      }
      if (!hasFire) { this.say('Need a fire to cook.'); return null; }
      if (!item.rawKcal) { this.say('Nothing to cook there.'); return null; }
      // water cost
      const water = this.state.village.water || { clean: 0 };
      if (item.needsCooking && water.clean < 1) {
        this.say(`Need 1L clean water to cook ${item.name}.`);
        return null;
      }
      if (item.needsCooking) water.clean -= 1;
      // cook it: rawKcal -> kcalEach (cooked)
      item.kcalEach = item.cookedKcal || item.rawKcal * 1.5;
      item.rawKcal = null; // it's cooked now
      item.safe = true; // cooking kills the risk (mostly)
      this.say(`Cooked ${item.name}. ${item.kcalEach} kcal now${item.needsCooking ? ' (-1L water)' : ''}.`);
      return null;
    },

    // drinkWater: drink from a water source. Hydrates.
    drinkWater() {
      this.state.scholar.kcal += 0; // water has no calories, but you need it
      this.say('You drink. Cold and clean.');
      return null;
    },
    // fillWater: fill ONE bottle (1L). Quality depends on source.
    // Creek water is risky (unknown). Haven well is clean.
    fillWater() {
      const s = this.state.scholar;
      s.water = s.water || [];
      // Where are you? Creek = risky, Haven = clean.
      const t = this.playerTile();
      const isCreek = t && t.type === 'creek';
      const quality = isCreek ? 'risky' : 'clean';
      const source = isCreek ? 'Creek (unknown)' : 'Haven well';
      s.water.push({ liters: 1, quality, source });
      this.say(`Filled 1L (${quality} — ${source}). ${s.water.length}L carried (${s.water.length}kg).`);
      return null;
    },
    // boilWater: at a fire, make risky water clean (kills bacteria).
    // Does NOT fix chemical contamination.
    boilWater() {
      const s = this.state.scholar;
      s.water = s.water || [];
      let n = 0;
      for (const b of s.water) {
        if (b.quality === 'risky' && !b.chemical) {
          b.quality = 'clean';
          b.source += ' (boiled)';
          n++;
        }
      }
      this.say(n ? `Boiled ${n}L. Bacteria dead.${s.water.some(b => b.chemical) ? ' (Chemical contamination survives boiling.)' : ''}` : 'No risky water to boil.');
      return null;
    },
    // drinkWater: drink clean first. Warn if only risky.
    drinkWater() {
      const s = this.state.scholar;
      s.water = s.water || [];
      // prefer clean
      let idx = s.water.findIndex(b => b.quality === 'clean');
      if (idx === -1) idx = s.water.findIndex(b => b.quality === 'risky');
      if (idx === -1) { this.say('No water. Fill at a creek or well.'); return null; }
      const b = s.water[idx];
      s.water.splice(idx, 1);
      if (b.quality === 'risky') {
        // 30% chance of sickness
        if (Math.random() < 0.3) {
          s.health = Math.max(0, (s.health || 100) - 15);
          this.say(`Drank risky water (${b.source}). Stomach cramps. -15 health. Boil it next time.`);
        } else {
          this.say(`Drank risky water (${b.source}). Got lucky this time.`);
        }
      } else {
        this.say(`Drank clean water.`);
      }
      return null;
    },
    // waterWeight: 1L = 1kg. Counts toward carry limit.
    waterWeight() {
      return (this.state.scholar.water || []).length; // 1 bottle = 1L = 1kg
    },
    // nearFire: is there a fire in the current detail grid?
    nearFire() {
      const detail = this.genDetail(this.map.px, this.map.py);
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
        if (detail[y] && detail[y][x] === 'fire') return true;
      }
      return false;
    },

    // cookAll: cook everything raw in inventory (at a fire).
    // COSTS WATER: 1L per item. Beans and rice need water. No pots, just fire + water.
    // Tradeoff: spend water, get safe + more calories. Or eat raw and risk sickness.
    cookAll() {
      const water = this.state.village.water || { clean: 0 };
      let n = 0, waterUsed = 0;
      for (const item of (this.state.scholar.inventory || [])) {
        if (item.rawKcal) {
          // needs water?
          const needsWater = item.needsCooking; // beans, rice
          if (needsWater && water.clean < 1) {
            this.say(`Not enough clean water to cook ${item.name}. Need 1L.`);
            continue;
          }
          if (needsWater) { water.clean -= 1; waterUsed++; }
          item.kcalEach = item.cookedKcal || item.rawKcal * 1.5;
          item.rawKcal = null;
          item.safe = true;
          n++;
        }
      }
      this.say(n ? `Cooked ${n} item${n > 1 ? 's' : ''}${waterUsed ? ` (-${waterUsed}L water)` : ''}.` : 'Nothing raw to cook.');
      return null;
    },

    // takeFromPantry: pack food before going out. Weight matters (20kg max).
    takeFromPantry(idx) {
      const pantry = this.state.village.pantry || [];
      const item = pantry[idx];
      if (!item || item.units <= 0) return null;
      // weight check (includes water: 1L = 1kg)
      const carry = (this.state.scholar.inventory || []).reduce((t, i) => t + (i.kg || 0) * (i.units || 1), 0) + this.waterWeight();
      if (carry + (item.kg || 0) > 20) {
        this.say(`Too heavy. Carrying ${carry.toFixed(1)}/20 kg.`);
        return null;
      }
      // take one unit
      item.units--;
      if (item.units <= 0) pantry.splice(idx, 1);
      // add to inventory (merge if same)
      const inv = this.state.scholar.inventory;
      const existing = inv.find(i => i.name === item.name);
      if (existing) existing.units++;
      else inv.push({ name: item.name, kcalEach: item.kcalEach, units: 1, spoilDay: item.spoilDay, safe: item.safe, kg: item.kg, unit: item.unit || 'item' });
      this.say(`Took ${item.name}.`);
      return null;
    },

    // weaponBonus: from EQUIPPED weapon. One slot.
    weaponBonus() {
      const eq = (this.state.scholar.equipped || {}).weapon;
      if (!eq) return 0;
      const def = this.data.items.find(i => i.id === eq.itemId);
      return (def && def.weapon) ? def.weapon.bonus : 0;
    },

    huntAnimal() {
      const s = this.state.scholar;
      const a = s.animal;
      if (!a) return null;
      const px = s.mx ?? 4, py = s.my ?? 4;
      const dist = Math.max(Math.abs(a.mx - px), Math.abs(a.my - py));
      if (dist > 1) { this.say('Too far. Get closer.'); return null; }
      const animal = this.data.animals.find(x => x.id === a.id);
      // success: easy 70%, medium 40%, hard 15%. Costs 100 kcal (chasing is work).
      // hunter background: +20%.
      const villager = this.data.villagers.find(v => v.id === this.villagerId);
      const isHunter = (villager && villager.formerOccupation || '').toLowerCase().includes('hunter');
      const base = animal.difficulty === 'easy' ? 0.7 : animal.difficulty === 'medium' ? 0.4 : 0.15;
      // Weapons matter. A spear (+30) turns a 40% shot into 70%.
      const wbonus = this.weaponBonus() / 100;
      const chance = Math.min(0.95, base + (isHunter ? 0.2 : 0) + wbonus);
      s.kcal = Math.max(0, s.kcal - 100);
      if (Math.random() < chance) {
        // caught!
        s.animal = null;
        const kcal = animal.calories;
        s.inventory.push({ plantId: 'meat_' + animal.id, units: 1, kcalEach: kcal, spoilDay: s.day + 1, name: animal.name + ' (dressed)', unit: 'carcass', prep: 'Cook before eating.', kg: kcal / 1000 });
        this.say(`Got it! ${animal.name}. ${kcal} kcal of meat. Gut it quickly.`);
        // knowledge: encounters
        this.state.codex.animalEncounters = this.state.codex.animalEncounters || {};
        this.state.codex.animalEncounters[animal.id] = (this.state.codex.animalEncounters[animal.id] || 0) + 1;
        return true;
      } else {
        this.say(`Missed! The ${animal.name.toLowerCase()} darts away. (-100 kcal)`);
        // it flees faster
        this.animalTurn(); this.animalTurn();
        return true;
      }
    },

    // ensure villagers have positions in the Haven grid.
    ensureVillagerPositions() {
      const v = this.state.village;
      if (this.map.px !== 3 || this.map.py !== 3) return; // only at Haven
      if (v.positions && Object.keys(v.positions).length > 0) return; // already placed
      v.positions = {};
      const detail = this.genDetail(3, 3);
      // find passable cells (not wall, not player spawn)
      const free = [];
      for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
        const c = detail[cy] && detail[cy][cx];
        if (c && !['wall'].includes(c) && !(cx === 4 && cy === 4)) free.push({x: cx, y: cy});
      }
      for (const rid of (v.roster || [])) {
        if (rid === this.villagerId) continue; // you're the player, not an NPC
        if (!free.length) break;
        const idx = Math.floor(Math.random() * free.length);
        const pos = free.splice(idx, 1)[0];
        v.positions[rid] = { mx: pos.x, my: pos.y };
      }
    },

    // villagers wander (turn-based). they go about their day.
    // they don't block you. they're just living.
    villagerTurn() {
      const v = this.state.village;
      if (this.map.px !== 3 || this.map.py !== 3) return;
      if (!v.positions) return;
      const detail = this.genDetail(3, 3);
      for (const rid of Object.keys(v.positions)) {
        const pos = v.positions[rid];
        // 50% chance to move (downtime), else stay
        if (Math.random() > 0.5) continue;
        // FLEE: trust < 20 and you're close? They move AWAY. Strangers are scary.
        const trust = (v.trust && v.trust[rid]) || 0;
        const px = this.state.scholar.mx ?? 4, py = this.state.scholar.my ?? 4;
        const dist = Math.abs(pos.mx - px) + Math.abs(pos.my - py);
        let dx, dy;
        if (trust < 20 && dist <= 3 && Math.random() < 0.6) {
          // run from you
          dx = Math.sign(pos.mx - px); dy = Math.sign(pos.my - py);
          if (dx === 0 && dy === 0) { dx = 1; }
        } else {
          dx = Math.floor(Math.random() * 3) - 1;
          dy = Math.floor(Math.random() * 3) - 1;
        }
        const nx = Math.max(0, Math.min(8, pos.mx + dx));
        const ny = Math.max(0, Math.min(8, pos.my + dy));
        const cell = detail[ny] && detail[ny][nx];
        if (cell && cell !== 'wall') {
          pos.mx = nx; pos.my = ny;
        }
      }
    },

    // searchRoom: examine + loot in ONE action. You look, you take what's there.
    searchRoom(cx, cy) {
      const key = `${this.map.px},${this.map.py},${cx},${cy}`;
      this.state.searchedRooms = this.state.searchedRooms || {};
      if (this.state.searchedRooms[key]) { this.say('Already searched.'); return null; }
      this.state.searchedRooms[key] = true;
      this.monsterTurn(); this.animalTurn(); this.villagerTurn();
      // 40%: find something useful
      if (Math.random() < 0.4) {
        const finds = [
          { name: 'First aid kit', kcalEach: 0, units: 1 },
          { name: 'Canned beans', kcalEach: 300, units: 2 },
          { name: 'Bottled water', kcalEach: 0, units: 1, water: true },
        ];
        const found = finds[Math.floor(Math.random() * finds.length)];
        this.state.scholar.inventory.push({
          ...found, spoilDay: 9999, unit: 'item', prep: 'Use as needed.', kg: 0.5
        });
        this.say(`You search the room. Found: ${found.name}.`);
      } else {
        this.say('You search the room. Nothing useful.');
      }
      // Searching is quick. Doesn't cost a day part (that was killing players).
      this.monsterTurn(); this.animalTurn();
      return null;
    },

    // cellActions: returns list of decision labels at a cell. Empty = just walk there.
    // Used by UI to decide: popup (decisions) vs step (no decisions).
    cellActions(cx, cy) {
      const detail = this.genDetail(this.map.px, this.map.py);
      const cell = detail[cy] && detail[cy][cx];
      if (!cell) return [];
      const t = this.playerTile();
      const sec = (t.secrets || {})[cx + ',' + cy];
      const actions = [];
      // monster here? decision.
      const mon = this.state.scholar.monster;
      if (mon && mon.x === cx && mon.y === cy) actions.push('Fight');
      // animal here? decision.
      const an = this.state.scholar.animal;
      if (an && an.x === cx && an.y === cy) actions.push('Hunt');
      // villager here (or within 3)? decision. Talk from a few spaces away.
      const v = this.state.village;
      const px = this.state.scholar.mx ?? 4, py = this.state.scholar.my ?? 4;
      if (v && v.positions) {
        for (const rid of Object.keys(v.positions)) {
          const pos = v.positions[rid];
          const d = Math.abs(pos.mx - px) + Math.abs(pos.my - py);
          if (d <= 3) { actions.push('Talk'); break; }
          if (pos.mx === cx && pos.my === cy) { actions.push('Talk'); break; }
        }
      }
      // interactive cells? decision.
      if (cell === 'tree' || cell === 'bigtree' || cell === 'tent') {
        if (!sec || !sec.known) actions.push('Examine');
        else actions.push('Use');
      } else if (cell === 'water') {
        actions.push('Drink');
        actions.push('Fill water (+2L)');
      } else if (cell === 'plant' || cell === 'bush' || cell === 'rubble') {
        actions.push('Forage');
      } else if (cell === 'fire') {
        actions.push('Warm hands');
        // If you have raw food, you can cook here. (Knowledge tells you what needs it.)
        const raw = (this.state.scholar.inventory || []).filter(i => i.rawKcal);
        if (raw.length) actions.push(`Cook (${raw.length} raw)`);
      } else if (['gym','class','office','apt','cube','break','conf','lobby','bay','sanct'].includes(cell)) {
        if (!sec || !sec.searched) actions.push('Search');
      }
      return actions;
    },

    // revealBush: when you examine a bush, it gets a species. Neighbors of the same
    // species chain-reveal (you recognize them now). Icons update.
    revealBush(cx, cy) {
      const t = this.playerTile();
      t.secrets = t.secrets || {};
      t.bushSpecies = t.bushSpecies || {};
      const key = `${cx},${cy}`;
      if (t.bushSpecies[key]) return t.bushSpecies[key];
      // assign a species (berry bushes in this biome)
      const species = ['blackberry', 'muscadine'][Math.floor(Math.random() * 2)];
      t.bushSpecies[key] = species;
      // CHAIN: nearby bushes (within 2) of the same "type" also reveal.
      // You see one blackberry, you recognize the patch.
      const detail = this.genDetail(this.map.px, this.map.py);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
        if (detail[ny] && detail[ny][nx] === 'bush') {
          const nkey = `${nx},${ny}`;
          if (!t.bushSpecies[nkey] && Math.random() < 0.7) {
            t.bushSpecies[nkey] = species;
          }
        }
      }
      return species;
    },

    // depleteRandomTile: when villagers forage, the world loses stock.
    // you compete for the same plants. if you don't take it, they might.
    depleteRandomTile(amount) {
      // find tiles with stock, deplete randomly
      const candidates = [];
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const t = this.tileAt(x, y);
        if (t.type !== 'haven' && t.type !== 'ruin' && (t.stock || 0) > 0) {
          candidates.push(t);
        }
      }
      for (let i = 0; i < amount && candidates.length; i++) {
        const t = candidates[Math.floor(Math.random() * candidates.length)];
        t.stock = Math.max(0, (t.stock || 0) - 1);
      }
    },

    // monsters move when you do. they're in the detail grid with you.
    monsterTurn() {
      const s = this.state.scholar;
      const m = s.monster;
      if (!m || m.mx === undefined) return;
      const px = s.mx ?? 4, py = s.my ?? 4;
      const dx = Math.sign(px - m.mx), dy = Math.sign(py - m.my);
      if (Math.abs(px - m.mx) >= Math.abs(py - m.my)) m.mx += dx;
      else m.my += dy;
      if (m.mx === px && m.my === py) this.startCombat(m.id);
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

    // isSafeTile: villages are safe from monsters. The ONLY safe space.
    isSafeTile(x, y) {
      const t = this.tileAt(x, y);
      if (t.type === 'haven') return true;
      // other villages are safe too
      for (const v of (this.state.otherVillages || [])) {
        if (v.x === x && v.y === y) return true;
      }
      return false;
    },

    checkEncounter() {
      // RNG, not staged. Monsters spawn in the wild.
      // Villages are safe. Everywhere else? Roll the dice.
      const scholar = this.state.scholar;
      const px = this.map.px, py = this.map.py;
      // Safe in villages. Don't even roll.
      if (this.isSafeTile(px, py)) return;
      // LEVER (not grounded): spawn chance per tile entry.
      // Thickets feel dangerous, meadows feel safe. Tune with playtest.
      // TODO: replace with monster population system (N monsters / 49 tiles).
      const tile = this.playerTile();
      let chance = 0.08;
      if (tile.type === 'thicket') chance = 0.15;
      else if (tile.type === 'meadow') chance = 0.05;
      else if (tile.type === 'ruin') chance = 0.12;
      if (Math.random() < chance && !scholar.monster) {
        const mdefs = this.data.monsters;
        const mdef = mdefs[Math.floor(Math.random() * mdefs.length)];
        const mx = 4 + Math.floor(Math.random() * 5) - 2;
        const my = 4 + Math.floor(Math.random() * 5) - 2;
        scholar.monster = { id: mdef.id, x: Math.max(0, Math.min(8, mx)), y: Math.max(0, Math.min(8, my)) };
        this.say(`A ${mdef.name} is here.`);
      }
      // slice 1: the Bulldozer wanders from day 3 — visible, patrols, encounter on contact
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
        // the monster is HERE, in the grid with you. spawn at a distance, not on top of you.
        const px = scholar.mx ?? 4, py = scholar.my ?? 4;
        let mx, my, tries = 0;
        do {
          mx = Math.floor(Math.random() * 9); my = Math.floor(Math.random() * 9);
          tries++;
        } while (tries < 20 && Math.abs(mx - px) + Math.abs(my - py) < 4);
        scholar.monster = { id: this.wanderer.monsterId, mx, my };
        this.say('Something big is HERE. In the grid with you. You can see it. It can see you.');
        this.encounterDone = true;
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
        // PHYSICAL: you must be on (or next to) a plant cell to forage it.
        // walk to the 🌱, then take it. the world is not a slot machine.
        const mx = scholar.mx ?? 4, my = scholar.my ?? 4;
        const detail = this.genDetail(this.map.px, this.map.py);
        let plantCell = null;
        // check your cell and adjacent for anything forageable: plant, bush, tree, bigtree.
        // trees feed you (nuts). bushes feed you (berries). you don't walk through them, you take from them.
        const FORAGEABLE = { plant: 1, bush: 1, tree: 1, bigtree: 1 };
        for (let dy = -1; dy <= 1 && !plantCell; dy++) {
          for (let dx = -1; dx <= 1 && !plantCell; dx++) {
            const cx = mx + dx, cy = my + dy;
            if (cx < 0 || cx > 8 || cy < 0 || cy > 8) continue;
            const c = detail[cy] && detail[cy][cx];
            if (FORAGEABLE[c]) plantCell = { x: cx, y: cy, cell: c };
          }
        }
        if (!plantCell && t.type !== 'ruin') {
          this.say('Nothing edible within reach. Walk to the green first.');
          return null;
        }
        // ruins: scavenge finite loot, not plants
        // BOOKS: 10% chance in ruins. Treasure, not routine.
        if (t.type === 'ruin') {
          if (!t.loot || !t.loot.length) {
            // check for a book (once per ruin)
            if (!t.bookChecked && Math.random() < 0.1 && this.data.books.length) {
              t.bookChecked = true;
              const book = this.data.books[Math.floor(Math.random() * this.data.books.length)];
              this.state.scholar.inventory.push({
                bookId: book.id, units: 1, name: book.name, kcalEach: 0,
                spoilDay: 9999, unit: 'book', prep: 'Read it.', kg: 0.5
              });
              this.say(`You find a book: "${book.name}". ${book.description}. (Read it from your pack.)`);
              return this.endDayPart();
            }
            this.say('Picked clean. The houses fed someone — not you.'); return null;
          }
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
        // deplete the specific cell you harvested. it regrows in 3 days.
        // trees/bushes don't disappear — they're picked clean (become 'dirt' visually, but the tree remains conceptually).
        // actually: trees stay trees, just depleted. track it separately.
        if (plantCell) {
          const origCell = plantCell.cell;
          // trees and bushes stay (they're perennial), plants become dirt
          detail[plantCell.y][plantCell.x] = (origCell === 'plant') ? 'dirt' : origCell;
          t.detailRegrow = t.detailRegrow || {};
          // store what it was, so it regrows correctly
          t.detailRegrow[plantCell.x + ',' + plantCell.y] = { day: scholar.day + 3, was: origCell };
        }
        const bounty = this.bountyFor(this.map.px, this.map.py);
        const r = S.forage.forage(t, this.biome(), this.data.plants, scholar, this.state.codex, this.data.abilities, bounty);
        const kg = r.units * 0.1;
        if (!this.canCarry(kg)) { t.stock += 1; this.say('Your pack is full. Eat something, or leave it for the woods.'); return null; }
        // LEARNING: encounters build familiarity. who you are matters.
        // regional: plant from home? start at 1. occupation: hunter/cook learns food in 2, others in 3-4.
        const plant = this.data.plants.find(p => p.id === r.plantId);
        const villager = this.data.villagers.find(v => v.id === this.villagerId);
        const homeRegion = (villager && villager.homeRegion || '').toLowerCase();
        const plantRegions = (plant.regions || []).map(x => x.toLowerCase());
        const isLocal = plantRegions.some(pr => homeRegion.includes(pr) || pr.includes(homeRegion.split(' ')[0]));
        const occupation = (villager && villager.formerOccupation || '').toLowerCase();
        // learning threshold: how many encounters to learn the name
        let threshold = 3;
        if (occupation.includes('hunter') || occupation.includes('cook') || occupation.includes('chef')) threshold = 2;
        if (occupation.includes('nurse') && plant.medicinal) threshold = 2;
        if (occupation.includes('bus driver') || occupation.includes('accountant') || occupation.includes('dropout')) threshold = 4;
        this.state.codex.encounters = this.state.codex.encounters || {};
        const enc = this.state.codex.encounters[r.plantId] || 0;
        // regional familiarity: start at 1 if it's from home
        const newEnc = enc === 0 && isLocal ? 1 : enc + 1;
        this.state.codex.encounters[r.plantId] = newEnc;
        const learned = newEnc >= threshold;
        if (learned && !this.state.codex.plants[r.plantId]) {
          // LEVEL 1: Named. You know what it is. Basic yield.
          this.state.codex.plants[r.plantId] = { identifiedDay: scholar.day, level: 1, harvests: 0, tastings: 0 };
          this.integrate(3, 'discovery');
          this.say(`You know this now. ${plant.name}. ${plant.knowledgeLevels['1']}`);
        } else if (learned && this.state.codex.plants[r.plantId]) {
          // LEVEL 2: Parts. Harvest 5 more times, you notice the parts.
          // Later you realize: roots AND leaves AND petals. Yield increases.
          const entry = this.state.codex.plants[r.plantId];
          entry.harvests = (entry.harvests || 0) + 1;
          if (entry.level === 1 && entry.harvests >= 5) {
            entry.level = 2;
            this.say(`Deeper knowledge: ${plant.name}. ${plant.knowledgeLevels['2']} (Yield +50%)`);
          }
        } else if (!learned) {
          // progressive: description, not name
          const stage = newEnc === 1 ? plant.description || 'a plant you don\'t recognize' :
                        `looks familiar — like the ${plant.description || 'plant'} from before`;
          this.say(`You take ${stage}. Not sure what it is yet. (${newEnc}/${threshold})`);
        }
        if (r.firstFind) {
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
        // KNOWLEDGE = YIELD. Level 2 (parts) gives 50% more. You know what to take.
        const entry = this.state.codex.plants[r.plantId];
        const levelMult = entry && entry.level >= 2 ? 1.5 : 1.0;
        const finalUnits = Math.ceil(r.units * levelMult);
        scholar.inventory.push({ plantId: r.plantId, units: finalUnits, kcalEach: r.plant.caloriesPerUnit, spoilDay: scholar.day + (r.plant.spoilageDays || 2), name: r.plant.name, unit: r.plant.unit, prep: r.plant.preparation, kg: 0.1 });
        // MATERIALS: byproducts for crafting. vine from bush, stick from tree, stone from rubble.
        // you don't just get food — you get supplies.
        if (plantCell && plantCell.cell === 'bush' && Math.random() < 0.3) {
          scholar.inventory.push({ material: 'vine', units: 1, name: 'Vine', kcalEach: 0, spoilDay: 9999, kg: 0.1 });
          this.say('You also take some vine (crafting material).');
        }
        if (plantCell && (plantCell.cell === 'tree' || plantCell.cell === 'bigtree') && Math.random() < 0.4) {
          scholar.inventory.push({ material: 'stick', units: 1, name: 'Stick', kcalEach: 0, spoilDay: 9999, kg: 0.2 });
          this.say('A sturdy stick (crafting material).');
        }
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
      // POWER NEEDS FOOD: target scales with metabolic mult. Fire god eats to 9600.
      const mult = this.metabolicMult(scholar.abilities);
      const target = Math.round(2400 * mult);
      // eat most-perishable first until kcal >= target or empty
      scholar.inventory.sort((a, b) => a.spoilDay - b.spoilDay);
      let ate = 0;
      const tasted = {}; // plantId -> units eaten (for knowledge level 3)
      // Eat only food (kcalEach > 0). Gear is skipped, NOT deleted.
      while (scholar.kcal < target) {
        // find the most perishable FOOD (not gear)
        const foodIdx = scholar.inventory.findIndex(i => (i.kcalEach || 0) > 0 && i.units > 0);
        if (foodIdx === -1) break; // no food left
        const it = scholar.inventory[foodIdx];
        const kcal = it.kcalEach;
        scholar.kcal += kcal; ate += kcal;
        if (it.plantId) tasted[it.plantId] = (tasted[it.plantId] || 0) + 1;
        it.units -= 1;
        if (it.units <= 0) scholar.inventory.splice(foodIdx, 1);
      }
      // LEVEL 3: Uses. Eat it 3 times, you learn what it does to you.
      // Vitamin C, medicine, energy. "Have you tasted it?" Yes. Now you know.
      for (const [pid, count] of Object.entries(tasted)) {
        const entry = this.state.codex.plants[pid];
        if (entry && entry.level === 2) {
          entry.tastings = (entry.tastings || 0) + count;
          if (entry.tastings >= 3) {
            entry.level = 3;
            const plant = this.data.plants.find(p => p.id === pid);
            this.say(`Deeper knowledge: ${plant.name}. ${plant.knowledgeLevels['3']} (+5 health when eaten)`);
            // level 3 benefit: eating gives health
            scholar.kcal = Math.min(scholar.kcal + 50, 3000); // nourished
          }
        }
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
      // Legacy. Use drinkWater() (bottle system).
      return this.drinkWater();
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
      this.checkVillageProximity();
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
        const pers = person.personality || { sharing: 'pragmatic', temperament: 'steady' };
        // PERSONALITY: selfish keeps more (shares 50%), generous shares all, pragmatic shares 80%.
        // bold: bigger hauls, more wounds. cautious: smaller, safer.
        const shareMult = pers.sharing === 'selfish' ? 0.5 : pers.sharing === 'generous' ? 1.0 : 0.8;
        const boldMult = pers.temperament === 'bold' ? 1.3 : pers.temperament === 'cautious' ? 0.7 : 1.0;
        if (r < 0.05) {
          // BIG DAY: someone has the day of their life.
          const kcal = Math.round((1500 + Math.floor(Math.random() * 1001)) * boldMult * shareMult);
          v.pantryKcal += kcal;
          // COMPETITION: they depleted a real tile. the world is shared.
          this.depleteRandomTile(Math.ceil(kcal / 200));
          this.say(`${first} had the day of their life — ${kcal} kcal. Two days of food from one person.${pers.sharing === 'selfish' ? ' (Kept some back, you suspect.)' : ''}`);
        } else if (r < 0.35) {
          // brings food: a real haul. from the world, not thin air.
          const kcal = Math.round((400 + Math.floor(Math.random() * 401)) * boldMult * shareMult);
          v.pantryKcal += kcal;
          this.depleteRandomTile(Math.ceil(kcal / 200));
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
    // metabolicMult: conservation of energy. Your kcal pool is your mana.
    // Abilities convert stored calories to effects. No free power.
    // A fire god needs 4x DAILY (8000 vs 2000) — body burns hot just existing.
    // (Abilities don't have tiers yet — infer from name. TODO: add tier to JSON.)
    metabolicMult(abilities) {
      if (!abilities || !abilities.length) return 1;
      let mult = 1;
      for (const aid of abilities) {
        const ab = this.data.abilities.find(a => a.id === aid);
        const isPowerful = ab && (ab.name.toLowerCase().includes('fire') || ab.name.toLowerCase().includes('god'));
        if (isPowerful) mult = Math.max(mult, 4);
      }
      return mult;
    },

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
        // detail cells regrow: the plant you picked comes back in 3 days.
        if (t.detail && t.detailRegrow) {
          for (const key of Object.keys(t.detailRegrow)) {
            const reg = t.detailRegrow[key];
            const regDay = (typeof reg === 'object') ? reg.day : reg;
            const was = (typeof reg === 'object') ? reg.was : 'plant';
            if (regDay <= this.state.scholar.day) {
              const [cx, cy] = key.split(',').map(Number);
              // restore the original (plants come back; trees were never gone, just picked clean)
              if (t.detail[cy] && (t.detail[cy][cx] === 'dirt' || t.detail[cy][cx] === was)) {
                t.detail[cy][cx] = was;
              }
              delete t.detailRegrow[key];
            }
          }
        }
      }
      // evening: run metabolism
      const res = S.calories.resolveDay(scholar, this.state.village);
      res.warnings.forEach(w => this.say('⚠ ' + w));
      // the village eats whether you're there or not — every day you're out, twelve mouths
      this.villageLives();
      this.villageEats();
      this.checkTraps();
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
    startCombat(monsterId) {
      const monster = this.data.monsters.find(m => m.id === (monsterId || 'thornback_boar')) || this.data.monsters[0];
      this.fight = S.combat.newFight(monster, this.state.scholar);
      this.pendingEncounter = false;
      this.state.scholar.monster = null; // it's in your face now, not on the grid
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
        invCount: s.inventory.reduce((t, i) => t + (i.units || 1), 0),
        invKcal: s.inventory.reduce((t, i) => t + i.units * i.kcalEach, 0),
        // Pantry kcal computed from ITEMS, not a bucket. Unsafe food counts (it's there, it's risky).
        pantryKcal: Math.round((this.state.village.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0)),
        pantryDays: Math.floor(((this.state.village.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0)) / Math.max(1, 12 * 2000)),
        waterClean: Math.round((this.state.village.water || {}).clean || 0),
        waterDirty: Math.round((this.state.village.water || {}).dirty || 0),
        // Weight: everything has mass. Carrying capacity 20kg.
        carryKg: (s.inventory || []).reduce((t, i) => t + (i.kg || 0) * (i.units || 1), 0),
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
