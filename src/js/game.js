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
    forest_floor: '♣', grove: '♠', meadow: '≋', thicket: '✳',
    wetland: '≈', creek: '≋', trail_edge: '·', ruin: '▦',
  };
  const TILE_NAME = {
    forest_floor: 'forest floor', grove: 'grove', meadow: 'meadow', thicket: 'thicket',
    wetland: 'wetland', creek: 'creek', trail_edge: 'trail edge', ruin: 'ruin',
  };

  const Game = {
    data: null, state: null, map: null,
    dayPart: 0, ap: 1, over: false, won: false,
    encounterDone: false, log: [],
    homeRegion: null, villagerId: null,

    async init() {
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
      this.genMap();
      this.say(`Day 1 — dawn. "${villager.name.split(' ')[0]}, eat something green. Drink water. Come back before dark."`);
      return this.status();
    },

    genMap() {
      const tiles = [];
      const weights = [
        ['forest_floor', 14], ['grove', 6], ['meadow', 8], ['thicket', 7],
        ['wetland', 4], ['creek', 3], ['trail_edge', 5], ['ruin', 2],
      ];
      const bag = [];
      weights.forEach(([t, w]) => { for (let i = 0; i < w; i++) bag.push(t); });
      for (let y = 0; y < 7; y++) {
        const row = [];
        for (let x = 0; x < 7; x++) {
          row.push({ type: bag[Math.floor(Math.random() * bag.length)], revealed: false, foraged: false });
        }
        tiles.push(row);
      }
      // guarantee a creek and wetland near-ish center
      tiles[2][3].type = 'creek'; tiles[4][2].type = 'wetland';
      this.map = { tiles, px: 3, py: 3 };
      this.reveal(3, 3);
    },

    reveal(cx, cy) {
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        if (Math.abs(x - cx) + Math.abs(y - cy) <= 2) this.map.tiles[y][x].revealed = true;
      }
    },

    tileAt(x, y) { return this.map.tiles[y][x]; },
    playerTile() { return this.tileAt(this.map.px, this.map.py); },

    canMove(x, y) {
      if (x < 0 || y < 0 || x > 6 || y > 6) return false;
      const d = Math.abs(x - this.map.px) + Math.abs(y - this.map.py);
      return d > 0 && d <= 3 && this.tileAt(x, y).revealed;
    },

    move(x, y) {
      if (!this.canMove(x, y)) return false;
      this.map.px = x; this.map.py = y;
      this.reveal(x, y);
      const t = this.playerTile();
      this.say(`Moved to ${TILE_NAME[t.type]}.`);
      this.checkEncounter();
      return true;
    },

    checkEncounter() {
      const t = this.playerTile();
      if (!this.encounterDone && this.state.scholar.day >= 3 && t.type === 'thicket') {
        this.encounterDone = true;
        this.pendingEncounter = true;
      }
    },

    // --- actions (1 AP) ---
    doAction(kind) {
      if (this.ap < 1 || this.over) return null;
      const scholar = this.state.scholar;
      let msg = '';
      if (kind === 'forage') {
        const t = this.playerTile();
        if (!S.forage.canForage(t)) { this.say('Nothing left to forage here today.'); return null; }
        t.foraged = true;
        const r = S.forage.forage(t, this.biome(), this.data.plants, scholar, this.state.codex, this.data.abilities);
        if (r.firstFind) this.state.codex.plants[r.plantId] = { identifiedDay: scholar.day };
        scholar.inventory.push({ plantId: r.plantId, units: r.units, kcalEach: r.plant.caloriesPerUnit, spoilDay: scholar.day + (r.plant.spoilageDays || 2), name: r.plant.name, unit: r.plant.unit, prep: r.plant.preparation });
        scholar.kcal -= S.calories.ACTION_COSTS.forage;
        msg = r.message + (r.firstFind ? ` (${r.plant.codex})` : '');
      } else if (kind === 'rest') {
        scholar.energy = Math.min(100, scholar.energy + 30);
        scholar.health = Math.min(100, scholar.health + 5);
        scholar.kcal -= 50;
        msg = 'You rest. Breath slows. +30 energy.';
      } else if (kind === 'treat') {
        const t = this.playerTile();
        if (t.type !== 'creek' && t.type !== 'wetland') { this.say('Need moving water — find a creek or wetland.'); return null; }
        scholar.water = (scholar.water || 0) + 2;
        scholar.kcal -= S.calories.ACTION_COSTS.treat_water;
        msg = 'You boil water over a small fire. +2 clean water.';
      }
      this.ap -= 1;
      this.say(msg);
      return msg;
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
      this.dayPart += 1;
      if (this.dayPart >= 4) return this.endDay();
      this.ap = 1;
      this.say(`— ${DAY_PARTS[this.dayPart].toUpperCase()} — ${DAY_PART_HINT[DAY_PARTS[this.dayPart]]}`);
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
        return this.status();
      }
      if (scholar.day >= 7) {
        this.over = true; this.won = true;
        this.say('Seven days. You ate, you drank, you came back. The village eats because of you.');
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
        scholar.inventory.push({ plantId: 'boar_meat', units: 4, kcalEach: 800, spoilDay: scholar.day + 3, name: 'Bulldozer meat', unit: 'cut', prep: 'Smoke it — it keeps for weeks.' });
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
        px: this.map.px, py: this.map.py,
        over: this.over, won: this.won,
        inCombat: !!this.fight,
        pendingEncounter: !!this.pendingEncounter,
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
