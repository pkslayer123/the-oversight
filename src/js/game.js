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
    forest_floor: '♣', grove: '◈', meadow: '≡', thicket: '✳',
    wetland: '≈', creek: '≋', trail_edge: '·', ruin: '▦',
  };
  const TILE_NAME = {
    forest_floor: 'forest floor', grove: 'grove', meadow: 'meadow', thicket: 'thicket',
    wetland: 'wetland', creek: 'creek', trail_edge: 'trail edge', ruin: 'ruin',
  };
  // scavenged goods (ruins) — finite. the houses feed you until they don't.
  const SCAVENGED = [
    { id: 'can_beans', name: 'Canned beans', kcal: 450, kg: 0.4, text: 'Dusty can, intact seal. Someone\'s pantry, a lifetime ago.' },
    { id: 'can_corn', name: 'Canned corn', kcal: 380, kg: 0.4, text: 'The label is gone. The corn doesn\'t care.' },
    { id: 'can_soup', name: 'Canned soup', kcal: 300, kg: 0.35, text: 'Chicken soup. Tastes like before.' },
    { id: 'jar_peaches', name: 'Jarred peaches', kcal: 500, kg: 0.5, text: 'Home-canned. Whoever sealed this knew what they were doing.' },
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
      const [plants, biomes, monsters, villagers, abilities, items] = await Promise.all(
        ['plants.json', 'biomes.json', 'monsters.json', 'villagers.json', 'abilities.json', 'items.json'].map(get));
      this.data = { plants, biomes, monsters, villagers, abilities, items };
      return this.data;
    },

    biome() { return this.data.biomes.find(b => b.id === 'se_woodlands'); },

    newGame(homeRegion, villagerId) {
      this.homeRegion = homeRegion; this.villagerId = villagerId;
      const villager = this.data.villagers.find(v => v.id === villagerId);
      this.state = S.state.newState();
      this.state.village.name = 'Haven';
      this.state.village.villagers = ['mara_okafor', 'jesse_calhoun', 'aki_tanaka'];
      const scholar = S.state.newScholar(villagerId);
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
      this.say(`${v.name.split(' ')[0]}: "${line}"`);
      return line;
    },

    getQuest() {
      // Mara's quest, once, on first arrival — the intro into the narrative
      if (this.state.questGiven) return null;
      const mara = this.data.villagers.find(x => x.id === 'mara_okafor');
      this.state.questGiven = true;
      this.save();
      return { from: mara.name.split(' ')[0], lines: mara.quest };
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
      // departure lite (member standing): tell someone you're going
      this.location = 'wilds'; this.departed = true;
      this.dayPart = 0; this.ap = 1;
      const first = this.data.villagers.find(x => x.id === this.villagerId).name.split(' ')[0];
      this.say(`You tell the others you're heading out. Someone nods. "Come back before dark."`);
      this.say(`— DAY 1 DAWN — ${DAY_PART_HINT.dawn}`);
      this.save();
      return this.status();
    },

    returnToVillage() {
      this.location = 'village';
      const s = this.state.scholar;
      const brought = s.inventory.reduce((t, i) => t + i.units * i.kcalEach, 0);
      const entries = Object.keys(this.state.codex.plants).length;
      const hasGreens = s.inventory.some(i => i.unit === 'handful' || i.unit === 'cup' || i.unit === 'oz');
      // the loop closes: what you carried feeds the village
      if (brought > 0) {
        this.state.village.pantryKcal += brought;
        s.inventory = [];
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
      else this.say(`You walk back into Haven early. ${entries} Codex entries. The village is glad to see you.`);
      this.wipe(); // expedition over — no continuing a finished run
      return this.status();
    },

    // --- autosave: the phone kills background tabs. a 7-day run must survive a refresh. ---
    save() {
      if (this.over) return;
      try {
        localStorage.setItem('scattering-save-v1', JSON.stringify({
          state: this.state, map: this.map, dayPart: this.dayPart, ap: this.ap,
          location: this.location, departed: this.departed, log: this.log.slice(-40),
          homeRegion: this.homeRegion, villagerId: this.villagerId,
          encounterDone: this.encounterDone,
        }));
      } catch (e) { /* storage full or unavailable — play on without it */ }
    },
    hasSave() {
      try { return !!localStorage.getItem('scattering-save-v1'); } catch (e) { return false; }
    },
    load() {
      let raw = null;
      try { raw = localStorage.getItem('scattering-save-v1'); } catch (e) { return false; }
      if (!raw) return false;
      const d = JSON.parse(raw);
      this.state = d.state; this.map = d.map; this.dayPart = d.dayPart; this.ap = d.ap;
      this.location = d.location; this.departed = d.departed; this.log = d.log || [];
      this.homeRegion = d.homeRegion; this.villagerId = d.villagerId;
      this.encounterDone = d.encounterDone; this.over = false; this.won = false;
      return true;
    },
    wipe() {
      try { localStorage.removeItem('scattering-save-v1'); } catch (e) {}
    },

    genMap() {
      // Procedural with logic: creek flows, wetlands hug water, groves cluster,
      // thickets edge, meadows open, one ruin with a story.
      const tiles = [];
      for (let y = 0; y < 7; y++) {
        const row = [];
        for (let x = 0; x < 7; x++) row.push({ type: 'forest_floor', revealed: false, foraged: false, visited: false });
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
      this.map = { tiles, px: 3, py: 3 };
      this.reveal(3, 3);
      const start = this.tileAt(3, 3);
      start.visited = true;
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
      this.state.scholar.kcal -= 40 * t.d; // distance has a metabolic price
      let msg = `Travel ${t.d} tile${t.d > 1 ? 's' : ''} to ${S.TILE_NAME[tile.type]}.`;
      if (!tile.visited) {
        tile.visited = true;
        const arr = ARRIVAL[tile.type];
        msg += `\n— ${arr.title} —\n${tile.ruinStory || arr.text}`;
        if (tile.type === 'creek') this.noteCodex('water', 'Moving water. The Codex notes: safer than still.');
        if (tile.type === 'grove') this.noteCodex('grove', 'Nut trees. The Codex does the math.');
      }
      this.say(msg);
      this.checkEncounter();
      // travel consumes the day-part — time passes, no separate "end part" tap
      return this.endDayPart();
    },

    // --- node identity: the dominant biome/character of the tile + its neighbors ---
    // a grove by the creek is not the same place as a grove by the wetland
    nodeEpithet(x, y) {
      const t = this.tileAt(x, y);
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

    // --- node detail: each tile is a node; arriving reveals its detail ---
    nodeDetail() {
      const t = this.playerTile();
      const arr = ARRIVAL[t.type];
      const here = [];
      if (t.type === 'ruin') here.push((t.loot || []).length ? `${t.loot.length} can(s) left` : 'picked clean');
      else if (S.forage.canForage(t)) here.push('forageable');
      else if (t.foraged) here.push('foraged clean');
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
          this.say(msg); return this.endDayPart();
        }
        if (!S.forage.canForage(t)) { this.say('Nothing left to forage here today.'); return null; }
        t.foraged = true;
        const r = S.forage.forage(t, this.biome(), this.data.plants, scholar, this.state.codex, this.data.abilities);
        const kg = r.units * 0.1;
        if (!this.canCarry(kg)) { t.foraged = false; this.say('Your pack is full. Eat something, or leave it for the woods.'); return null; }
        if (r.firstFind) this.state.codex.plants[r.plantId] = { identifiedDay: scholar.day };
        scholar.inventory.push({ plantId: r.plantId, units: r.units, kcalEach: r.plant.caloriesPerUnit, spoilDay: scholar.day + (r.plant.spoilageDays || 2), name: r.plant.name, unit: r.plant.unit, prep: r.plant.preparation, kg: 0.1 });
        scholar.kcal -= S.calories.ACTION_COSTS.forage;
        msg = r.message + (r.firstFind ? ` (${r.plant.codex})` : '');
      } else if (kind === 'rest') {
        scholar.energy = Math.min(100, scholar.energy + 30);
        scholar.health = Math.min(100, scholar.health + 5);
        scholar.kcal -= 50;
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
      // the action took the day-part — time passes, no separate "end part" tap
      return this.endDayPart();
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

    endDay() {
      const scholar = this.state.scholar;
      // reset forage flags
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) this.map.tiles[y][x].foraged = false;
      // evening: auto-eat prompt handled by UI; run metabolism
      const res = S.calories.resolveDay(scholar, this.state.village);
      res.warnings.forEach(w => this.say('⚠ ' + w));
      S.state.save(this.state);
      if (!res.ok || scholar.health <= 0) {
        this.over = true;
        this.say('You didn\'t make it. The village remembers. The Codex keeps what you brought home.');
        this.returnToVillage();
        return this.status();
      }
      if (scholar.day >= 7) {
        this.over = true; this.won = true;
        this.say('Seven days. You ate, you drank, you came back. The village eats because of you.');
        this.returnToVillage();
        return this.status();
      }
      scholar.day += 1;
      this.dayPart = 0; this.ap = 1;
      this.say(`— DAY ${scholar.day} DAWN — ${DAY_PART_HINT.dawn}`);
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

    status() {
      const s = this.state.scholar;
      return {
        day: s.day, dayPart: DAY_PARTS[this.dayPart], dayPartHint: DAY_PART_HINT[DAY_PARTS[this.dayPart]],
        ap: this.ap, health: Math.round(s.health), kcal: Math.round(s.kcal),
        hydration: Math.round(s.hydration), energy: Math.round(s.energy),
        water: s.water || 0,
        inventory: s.inventory.map(i => ({ name: i.name, units: i.units, kcalEach: i.kcalEach, spoilDay: i.spoilDay })),
        invKcal: s.inventory.reduce((t, i) => t + i.units * i.kcalEach, 0),
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
