// @ontology
// system: game-core
// description: Central game controller. Owns state, map, day loop, actions, encounters, combat, village simulation. UI renders from it.
// provides:
//   - state (scholar, village, world)
//   - tickAction(n)
//   - doAction(actionId)
//   - sleep()
//   - eat()
//   - eatOne(idx)
//   - spendCombatAction(kind)
//   - tbFighter(id)
//   - tbAdvance()
//   - tbAfterPlayerAction()
//   - contestTick() (delegates to contests.js)
//   - sleepQuality()
//   - sleepPreview()
//   - kcalCap()
// rules:
//   - day_parts: 4 nested (code: TIME)
//   - ticks_per_day: defined in TIME (code: tickAction)
//   - sleep_heal_bunk: 35 (code: sleepPreview)
//   - sleep_heal_tent: 25 (code: sleepPreview)
//   - sleep_heal_hall: 20 (code: sleepPreview)
//   - sleep_heal_fireside: 18 (code: sleepPreview)
//   - sleep_heal_ground: 12 (code: sleepPreview)
//   - combat_action_economy: move + acted (code: tbAfterPlayerAction)
// consumes:
//   - All systems (central hub)
// Slice 1 game controller: "Seven Days".
// Owns state, map, day loop, actions, encounters. UI renders from it (app.js).
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

    // ============ TIME ECONOMY ============
    // How the world moves when you do. ALL TUNABLE IN ONE PLACE.
    // Playtested for "real feel" — see docs/TIME-ECONOMY.md.
    //
    // The model:
    // - You move freely within a node. Steps are exploration, not time.
    // - Every NPC_BATCH_MOVES of your squares, NPCs take a BATCH turn:
    //   they wander at their own speed, pursue wants, live their lives.
    // - Moving between nodes is the big time step: the world moves
    //   (NPC batch + needs + gossip) without consuming your action budget.
    // - Combat switches to strict turn-based (separate system, untouched).
    TIME: {
      // THE ACTION CLOCK. One clock; everything you do moves it forward.
      // 1 tick ≈ a moment (a step, a glance, a sip, a word).
      // 32 ticks = 1 chunk ≈ half an hour of sustained work.
      TICKS_PER_BATCH: 32,   // every 32 ticks, NPCs take a batch turn (they act)
      TICKS_PER_PART: 128,   // one day-part = 128 ticks of living
      TICKS_PER_DAY: 512,    // the day's full budget: 4 parts × 128 ticks
      TRAVEL_TICKS: 32,      // node travel = 32 ticks (a "bigger tick")
      NPC_BATCH_WANDER: 8,   // base wander squares per NPC per batch (× speed)
      PLAYER_SPEED: 1.0,     // baseline: your speed. NPC speed is relative.
      NPC_BATCH_MOVES: 32,   // deprecated alias — use TICKS_PER_BATCH
    },

    async init() {
      if (global.SCATTER_DATA) { this.data = global.SCATTER_DATA; return this.data; }
      const get = f => fetch('src/data/' + f).then(r => r.json());
      const [plants, biomes, monsters, villagers, abilities, items, background_survivors, cellDefs, animals, recipes, books, relicEnhancements, locations, characterGen, synergies, knowledge, nameCultures, originPicker, foreignSpeech, lifeseeds] = await Promise.all(
        ['plants.json', 'biomes.json', 'monsters.json', 'villagers.json', 'abilities.json', 'items.json', 'background_survivors.json', 'cell_defs.json', 'animals.json', 'recipes.json', 'books.json', 'relicEnhancements.json', 'locations.json', 'characterGen.json', 'synergies.json', 'knowledge.json', 'nameCultures.json', 'originPicker.json', 'foreignSpeech.json', 'lifeseeds.json'].map(get));
      this.data = { plants, biomes, monsters, villagers, abilities, items, background_survivors, cellDefs, animals, recipes, books, relicEnhancements, locations, characterGen, synergies, knowledge, nameCultures, originPicker, foreignSpeech, lifeseeds };
      return this.data;
    },

    biome() { return this.data.biomes.find(b => b.id === 'se_woodlands'); },

    // ============ EXPEDITION SETUP ============
    // Your origin is yours — you type it. The scattering is random.
    // We store where you're from. (Someday, characters trek home. We'll need the way.)
    // Unfamiliarity is the point: Arizona -> Georgia creek means you know almost nothing.

    // parseOrigin: free text -> { raw, tags }. Data-driven keyword matching.
    parseOrigin(text) {
      const raw = String(text || '').trim();
      const lower = raw.toLowerCase();
      const kw = (this.data.characterGen || {}).originKeywords || {};
      const tags = new Set();
      const keys = Object.keys(kw).sort((a, b) => b.length - a.length); // "new mexico" before "mexico"
      for (const k of keys) {
        if (lower.includes(k)) kw[k].forEach(t => tags.add(String(t).toLowerCase()));
      }
      return { raw: raw || 'somewhere unremembered', tags: [...tags] };
    },

    // familiarityTier: what fraction of the local plant pool shares a region tag with this origin?
    // local >40%, visitor 15-40%, stranger <15%. The game feels the difference.
    familiarityTier(tags) {
      const plants = this.data.plants || [];
      const tl = (tags || []).map(t => String(t).toLowerCase());
      if (!plants.length || !tl.length) return 'stranger';
      let known = 0;
      for (const p of plants) {
        const pr = (p.regions || []).map(x => String(x).toLowerCase());
        if (pr.some(r => tl.includes(r))) known++;
      }
      const frac = known / plants.length;
      return frac > 0.4 ? 'local' : frac >= 0.15 ? 'visitor' : 'stranger';
    },

    // heritageFor: which fictionalized people-group does this origin read as?
    // Old wounds run between peoples, not individuals.
    heritageFor(tags) {
      const cg = this.data.characterGen || {};
      const map = cg.heritageMap || [];
      const tl = (tags || []).map(t => String(t).toLowerCase());
      for (const [tag, name] of map) {
        if (tl.includes(String(tag).toLowerCase())) return name;
      }
      return 'the scattered';
    },

    // The scattering is random. Nobody chooses where they wake up.
    // Origin (typed by the player) sets regional knowledge; the landing zone is pure chance.
    randomLandingZone() {
      const pool = [...(this.data.locations || [])];
      return pool.length ? pool[Math.floor(Math.random() * pool.length)] : {};
    },

    // locParams: genMap tuning for the chosen landing zone (with safe defaults).
    locParams() {
      const loc = (this.data.locations || []).find(l => l.id === (this.state && this.state.startLocation));
      const g = (loc && loc.gen) || {};
      return {
        creeks: g.creeks ?? 1, wetlands: g.wetlands ?? 3,
        groveBlobs: g.groveBlobs ?? 2, groveSize: g.groveSize ?? 4,
        meadowSize: g.meadowSize ?? 5, thickets: g.thickets ?? 5,
        trailLines: g.trailLines ?? 1, ruinMaxDist: g.ruinMaxDist ?? 3,
        lootMult: g.lootMult ?? 1, stockMult: g.stockMult ?? 1,
        startReveal: g.startReveal ?? 0,
      };
    },

    // cultureForOrigin: origin label -> culture id (nameCultures.originToCulture).
    // Falls back to a country-substring match for custom-typed origins.
    cultureForOrigin(origin) {
      const nc = this.data.nameCultures || {};
      const o2c = nc.originToCulture || {};
      if (o2c[origin]) return o2c[origin];
      const lower = String(origin || '').toLowerCase();
      for (const [label, cid] of Object.entries(o2c)) {
        const country = label.split(',').pop().trim().toLowerCase();
        if (country && lower.includes(country)) return cid;
      }
      return null;
    },

    // genNameForOrigin: names match origins. Japanese names from Japan, Nigerian from Nigeria.
    // 80% correlated, 20% mismatch — people move, diaspora exists. But the default is sensible.
    // forceMatch skips the diaspora roll: the player's own character IS from where they said.
    // Returns { name, cultureId } — the cultureId matters: a name-culture that differs
    // from the origin culture is a heritage story (and a heritage language).
    genNameForOrigin(origin, forceMatch) {
      const pick = a => a[Math.floor(Math.random() * a.length)];
      const nc = this.data.nameCultures || {};
      const cultures = nc.cultures || {};
      const cg = this.data.characterGen || {};
      let cultureId = this.cultureForOrigin(origin);
      // 20% chance: mismatch (immigrant, diaspora, mixed heritage)
      if (cultureId && !forceMatch && Math.random() < 0.2) {
        const allCultures = Object.keys(cultures).filter(c => c !== cultureId);
        cultureId = pick(allCultures);
      }
      const culture = cultures[cultureId];
      if (culture && culture.first && culture.last) {
        return { name: pick(culture.first) + ' ' + pick(culture.last), cultureId };
      }
      // fallback: legacy flat lists
      return { name: pick(cg.firstNames || ['Sam']) + ' ' + pick(cg.lastNames || ['Reyes']), cultureId };
    },

    // NAME_GENDER: first names we're confident about. Curated, not guessed —
    // these are common names whose gender is unambiguous across their culture.
    // Everything else goes through ending rules; unknowns get they/them.
    NAME_GENDER: {
      // american
      james: 'm', john: 'm', robert: 'm', michael: 'm', william: 'm', david: 'm', joseph: 'm', thomas: 'm', charles: 'm', daniel: 'm',
      matthew: 'm', anthony: 'm', mark: 'm', donald: 'm', steven: 'm', paul: 'm', andrew: 'm', joshua: 'm', kevin: 'm', brian: 'm',
      george: 'm', edward: 'm', ronald: 'm', timothy: 'm', jason: 'm', jeffrey: 'm', ryan: 'm', jacob: 'm', gary: 'm', nicholas: 'm',
      eric: 'm', jonathan: 'm', stephen: 'm', larry: 'm', justin: 'm', scott: 'm', brandon: 'm', benjamin: 'm', samuel: 'm', frank: 'm',
      gregory: 'm', raymond: 'm', alexander: 'm', patrick: 'm', jack: 'm', dennis: 'm', jerry: 'm', marcus: 'm', darius: 'm', tom: 'm',
      leo: 'm', sam: 'm', bill: 'm', hank: 'm', ray: 'm', carl: 'm', earl: 'm',
      mary: 'f', patricia: 'f', jennifer: 'f', linda: 'f', elizabeth: 'f', barbara: 'f', susan: 'f', jessica: 'f', sarah: 'f', karen: 'f',
      nancy: 'f', lisa: 'f', betty: 'f', margaret: 'f', sandra: 'f', ashley: 'f', dorothy: 'f', kimberly: 'f', emily: 'f', donna: 'f',
      michelle: 'f', laura: 'f', carol: 'f', amanda: 'f', deborah: 'f', stephanie: 'f', rebecca: 'f', sharon: 'f',
      cynthia: 'f', kathryn: 'f', amy: 'f', shirley: 'f', angela: 'f', helen: 'f', anna: 'f', brenda: 'f', pamela: 'f', nicole: 'f',
      emma: 'f', samantha: 'f', katherine: 'f', christine: 'f', debora: 'f', rachel: 'f', carolyn: 'f', virginia: 'f',
      maya: 'f', ruth: 'f', elena: 'f', aisha: 'f', grace: 'f', rosa: 'f', kate: 'f', pearl: 'f', joyce: 'f', june: 'f',
      // nigerian
      chidi: 'm', olumide: 'm', tunde: 'm', emeka: 'm', ifeanyi: 'm', babatunde: 'm', segun: 'm', obinna: 'm', olusegun: 'm',
      abiodun: 'm', chukwuemeka: 'm', oluwafemi: 'm', oluwaseyi: 'm',
      adaeze: 'f', ngozi: 'f', funke: 'f', amina: 'f', zainab: 'f', halima: 'f', chiamaka: 'f', folake: 'f', yetunde: 'f',
      nkiru: 'f', chinwe: 'f', hadiza: 'f', nneka: 'f', uzoamaka: 'f',
      // misc common
      hugo: 'm',
      // ghanaian (day names are gendered)
      kwame: 'm', kofi: 'm', yaw: 'm', kwesi: 'm', kojo: 'm', fiifi: 'm', kweku: 'm', kwadwo: 'm', kwabena: 'm', ekow: 'm',
      ama: 'f', abena: 'f', akosua: 'f', efua: 'f', adwoa: 'f', esi: 'f', araba: 'f', akua: 'f', yaa: 'f', afua: 'f', aba: 'f',
      // irish
      conor: 'm', liam: 'm', sean: 'm', declan: 'm', cian: 'm', eamon: 'm', brendan: 'm', kieran: 'm', donal: 'm', malachy: 'm', tiernan: 'm',
      saoirse: 'f', niamh: 'f', aoife: 'f', ciara: 'f', grainne: 'f', maeve: 'f', roisin: 'f', siobhan: 'f', orla: 'f', fiona: 'f',
      sinead: 'f', una: 'f', bridget: 'f',
      // norwegian
      lars: 'm', erik: 'm', magnus: 'm', ole: 'm', henrik: 'm', anders: 'm', bjorn: 'm', jakob: 'm', lucas: 'm',
      ingrid: 'f', astrid: 'f', solveig: 'f', freya: 'f', sigrid: 'f', liv: 'f', kari: 'f', nora: 'f', maja: 'f', emilie: 'f',
      // turkish
      mehmet: 'm', emre: 'm', burak: 'm', can: 'm', alp: 'm', doruk: 'm', ahmet: 'm', mustafa: 'm', huseyin: 'm', hasan: 'm',
      ibrahim: 'm', omer: 'm', kerem: 'm',
      elif: 'f', zeynep: 'f', selin: 'f', ayse: 'f', defne: 'f', gizem: 'f', fatma: 'f', hatice: 'f', emine: 'f', meryem: 'f', rabia: 'f',
      // rule exceptions (names that break the ending rules)
      kuba: 'm', aditya: 'm', hamza: 'm', taha: 'm', krishna: 'm', ravi: 'm', nikita: 'm',
      andrea: 'm',
    },

    // guessNameGender: does this first name read male or female? Conservative:
    // curated map first, then high-precision per-culture ending rules.
    // Returns 'm' | 'f' | null. Null = can't tell (unfamiliar name) — the
    // character gets they/them. Strangers' pronouns aren't assumed.
    guessNameGender(first, cultureId) {
      const key = String(first || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (this.NAME_GENDER[key]) return this.NAME_GENDER[key];
      const n = key;
      const ROMANCE = ['mexican', 'argentine', 'colombian', 'peruvian', 'venezuelan', 'brazilian', 'filipino'];
      const SLAVIC = ['polish', 'ukrainian'];
      const ARABIC = ['moroccan', 'egyptian'];
      if (ROMANCE.includes(cultureId)) {
        if (n.endsWith('o')) return 'm';
        if (n.endsWith('a')) return 'f';
        return null;
      }
      if (cultureId === 'japanese') {
        if (n.endsWith('hiko')) return 'm';
        if (n.endsWith('ko')) return 'f';
        if (/(shi|ta|rou|go|mu|to)$/.test(n)) return 'm';
        return null;
      }
      if (SLAVIC.includes(cultureId)) { if (n.endsWith('a')) return 'f'; return null; }
      if (ARABIC.includes(cultureId)) { if (n.endsWith('a')) return 'f'; return null; }
      if (cultureId === 'german') { if (n.endsWith('a')) return 'f'; return null; }
      if (cultureId === 'indian' || cultureId === 'bangladeshi') {
        if (n.endsWith('a') || n.endsWith('i')) return 'f';
        return null;
      }
      if (cultureId === 'korean') {
        if (n.endsWith('a')) return 'f';
        if (/(jun|hoon|woo|seok|hyun)$/.test(n)) return 'm';
        return null;
      }
      return null;
    },

    // levelsOf: normalize any language shape to {id: level 0|1|2}.
    // Handles the multilingual {native, levels} shape, the legacy
    // {native, english} shape, and legacy scholar arrays (all fluent).
    levelsOf(langs, englishLevel) {
      if (!langs) return { english: 2 };
      if (Array.isArray(langs)) {
        const lv = {};
        for (const id of langs) lv[id] = 2;
        lv.english = englishLevel != null ? englishLevel : (lv.english != null ? lv.english : 2);
        return lv;
      }
      if (langs.levels) return Object.assign({}, langs.levels);
      if (langs.native) {
        // legacy {native, english} shape
        const lv = { [langs.native]: 2 };
        if (langs.english) lv.english = langs.english;
        return lv;
      }
      // bare levels map (the scholar's shape)
      const lv = Object.assign({}, langs);
      if (englishLevel != null) lv.english = englishLevel;
      return lv;
    },

    // genCultureLanguages: what someone speaks, and WHY. Every non-native tongue
    // needs a story: heritage (diaspora family), work (occupation polyglots),
    // or a life event (service, aid work, years abroad). No random bolt-ons —
    // if the backstory can't explain it, they don't speak it. Most people are
    // monolingual. Returns { native, levels, reasons } — reasons are backstory
    // sentences with {They}/{they}/{their}/{them}/{first} placeholders.
    // opts: { heritageCultureId, age }
    genCultureLanguages(homeCultureId, occ, opts) {
      opts = opts || {};
      const nc = this.data.nameCultures || {};
      const cg = this.data.characterGen || {};
      const native = ((nc.cultures || {})[homeCultureId] || {}).language || 'english';
      const levels = { [native]: 2 };
      const reasons = [];
      const langName = id => { const d = (cg.languages || []).find(l => l.id === id); return d ? d.name : id; };
      const placeFor = cid => {
        const o2c = nc.originToCulture || {};
        const labels = Object.keys(o2c).filter(k => o2c[k] === cid);
        if (labels.length) return labels[Math.floor(Math.random() * labels.length)].split(',')[0].trim();
        return 'the old country';
      };
      // WORK: interpreters, ESL teachers, pilots and the like speak their claimed
      // tongues. The occupation IS the reason — it runs BEFORE the lingua-franca
      // roll so the random pick can never shadow it (no reason) or downgrade it.
      for (const l of ((occ && occ.polyglot) || [])) {
        if (!levels[l]) {
          levels[l] = 2;
          reasons.push(`{They} learned ${langName(l)} for work — the job demanded it.`);
        }
      }
      // HERITAGE: the name's culture differs from home — diaspora family.
      // Someone named Gonzalez born in Chicago grew up hearing Spanish. That's a story.
      const hc = opts.heritageCultureId;
      if (hc && hc !== homeCultureId) {
        const hl = ((nc.cultures || {})[hc] || {}).language;
        if (hl && hl !== native && !levels[hl]) {
          const lv = Math.random() < 0.35 ? 2 : 1;
          levels[hl] = lv;
          const rel = Math.random() < 0.5 ? 'parents' : 'grandparents';
          reasons.push(`{Their} ${rel} came from ${placeFor(hc)}; {they} grew up hearing ${langName(hl)} at home${lv === 1 ? ', and still understand more than {they} can say' : ''}.`);
        }
      }
      // English for non-natives: school, media, the lingua franca. Plausible, keep.
      // Never overwrites a language the backstory already granted.
      if (native !== 'english' && !levels.english) {
        const r = Math.random();
        const eng = r < 0.3 ? 0 : r < 0.75 ? 1 : 2;
        if (eng) levels.english = eng;
      }
      // LIFE EVENT (~7%, adults only): service, aid work, years abroad.
      // Rare, and always storied — never a silent stat.
      const age = opts.age || 30;
      if (age >= 21 && Math.random() < 0.07) {
        const cids = Object.keys(nc.cultures || {}).filter(c => {
          const l = ((nc.cultures || {})[c] || {}).language;
          return l && l !== native && !levels[l];
        });
        if (cids.length) {
          const ec = cids[Math.floor(Math.random() * cids.length)];
          const el = ((nc.cultures || {})[ec] || {}).language;
          const place = placeFor(ec);
          const yrs = 1 + Math.floor(Math.random() * 3);
          const fluent = Math.random() < 0.3;
          levels[el] = fluent ? 2 : 1;
          const q = fluent ? langName(el) : `enough ${langName(el)} to get by`;
          const evs = [
            `{They} did ${yrs} year${yrs > 1 ? 's' : ''} abroad with the service and came home with ${q}.`,
            `A ${yrs}-year stint doing aid work near ${place} left {them} with ${q}.`,
            `{They} spent ${yrs} year${yrs > 1 ? 's' : ''} working overseas and picked up ${q}.`,
            `{They} studied near ${place} for ${yrs} year${yrs > 1 ? 's' : ''} and never quite lost the ${langName(el)}.`,
          ];
          reasons.push(evs[Math.floor(Math.random() * evs.length)]);
        }
      }
      return { native, levels, reasons };
    },

    // genCharacter: one full person. The origin is authoritative — name, native
    // language, knowledge tags, and heritage all derive from it.
    // opts: { origin, forceCultureMatch, candidate, usedNames, usedOccs }
    genCharacter(opts) {
      const { origin, forceCultureMatch, candidate, usedNames, usedOccs } = opts || {};
      const cg = this.data.characterGen || {};
      const pick = a => a[Math.floor(Math.random() * a.length)];
      // distinct occupations across a candidate set when the pool allows it
      const occPool = cg.occupations || [];
      let occ = null, oguard = 0;
      do {
        occ = pick(occPool) || {};
        oguard++;
      } while (usedOccs && occ.id && usedOccs.has(occ.id) && oguard < 30 && occPool.length > 4);
      if (occ && usedOccs && occ.id) usedOccs.add(occ.id);
      let nameRes, name, guard = 0;
      do {
        nameRes = this.genNameForOrigin(origin, forceCultureMatch);
        name = nameRes.name;
        guard++;
        // no duplicate first names in one cast — "June" twice breaks the fiction
      } while ((usedNames.has(name) || [...usedNames].some(n => n.split(' ')[0] === name.split(' ')[0])) && guard < 50);
      usedNames.add(name);
      const first = name.split(' ')[0];
      // PRONOUNS follow the name, not a dice roll. "Kurt" is a he, "Tabea" is a
      // she — contradicting the name is the fastest way to break a real person.
      // Unfamiliar names get they/them: strangers' pronouns aren't assumed.
      const nameGender = this.guessNameGender(first, nameRes.cultureId);
      const pro = nameGender === 'm' ? 'he' : nameGender === 'f' ? 'she' : 'they';
      // parsed origin + short city name, up front — backstories need both.
      const parsed = this.parseOrigin(origin);
      const city = String(origin).split(',')[0].trim() || origin;
        const their = pro === 'they' ? 'their' : pro === 'she' ? 'her' : 'his';
        const them = pro === 'they' ? 'them' : pro === 'she' ? 'her' : 'him';
        const They = pro === 'they' ? 'They' : pro === 'she' ? 'She' : 'He';
        // fillPronouns: substitute {They}/{they}/{their}/{them}/{first} AND conjugate
        // the verb that follows {They}/{they} for she/he. "They keep" but "She keeps".
        // Only listed verbs are touched — everything else passes through unchanged.
        const conj = { keep: 'keeps', build: 'builds', look: 'looks', know: 'knows', stare: 'stares', read: 'reads', speak: 'speaks', talk: 'talks', stay: 'stays', are: 'is', have: 'has', were: 'was', do: 'does', go: 'goes' };
        // skill/occ/origin are substituted in backstories too — defined before
        // fillPronouns runs (was a TDZ crash: fillPronouns is called at line ~262).
        const skill = (occ.teachTags || []).includes('medicinal') ? 'patching people up'
          : (occ.teachTags || []).includes('food') ? 'finding food' : 'making do';
        const fillPronouns = t => t
          .replaceAll('{first}', first)
          .replaceAll('{their}', their)
          .replaceAll('{Their}', their.charAt(0).toUpperCase() + their.slice(1))
          .replaceAll('{them}', them)
          .replace(/\{They\} ([A-Za-z]+)/g, (m, vb) => They + ' ' + (pro === 'they' ? vb : (conj[vb] || vb)))
          .replace(/\{they\} ([A-Za-z]+)/g, (m, vb) => pro + ' ' + (pro === 'they' ? vb : (conj[vb] || vb)))
          .replaceAll('{They}', They)
          .replaceAll('{they}', pro)
          .replaceAll('{occ}', occ.name || 'survivor')
          .replaceAll('{origin}', origin)
          .replaceAll('{city}', city)
          .replaceAll('{skill}', skill);
        // COHERENCE: a 19-year-old isn't a retired general. Occupations carry
        // a sensible age band; the character's age is drawn from it.
        // (Age is computed before backstory: variants with work durations need it.)
        const ageMin = occ.minAge || 19, ageMax = Math.max(ageMin, occ.maxAge || 62);
        const age = ageMin + Math.floor(Math.random() * (ageMax - ageMin + 1));
        const backstoryVariants = occ.backstories || [occ.backstory || '{first} is here.'];
        // AGE-GATE variants: "fifteen summers" of roofing at 20 is a lie.
        // Durations imply a working life started around 16; "two tours" needs 20.
        const variantMinAge = t => {
          let min = 0;
          const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30 };
          const re = /\b(a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|\d+)\s+(summer|year|decade)s?\b/gi;
          let m;
          while ((m = re.exec(t))) {
            const raw = m[1].toLowerCase();
            let n = raw === 'a' ? 1 : (words[raw] != null ? words[raw] : parseInt(raw, 10));
            if (m[2].toLowerCase().startsWith('decade')) n *= 10;
            if (n > 0) min = Math.max(min, n + 16);
          }
          if (/\btwo tours\b/i.test(t)) min = Math.max(min, 20);
          return min;
        };
        // UNIQUENESS (Steve): no repeated backstories within a single game.
        // Prefer unused + age-appropriate; then unused (age is a guideline);
        // only then reuse. The expedition registry lives on the game, not the call.
        const ubs = this._usedBackstories || (this._usedBackstories = new Set());
        const occKey = occ.id || occ.name || 'survivor';
        let bi = backstoryVariants.findIndex((_, i) => !ubs.has(occKey + ':' + i) && variantMinAge(backstoryVariants[i]) <= age);
        if (bi < 0) bi = backstoryVariants.findIndex((_, i) => !ubs.has(occKey + ':' + i));
        if (bi < 0) bi = backstoryVariants.findIndex((_, i) => variantMinAge(backstoryVariants[i]) <= age);
        if (bi < 0) bi = Math.floor(Math.random() * backstoryVariants.length);
        ubs.add(occKey + ':' + bi);
        // LANGUAGES: story-driven, generated before the backstory so the reasons
        // can be woven in. A tongue without a story doesn't get spoken.
        const homeCulture = this.cultureForOrigin(origin);
        const langs = this.genCultureLanguages(homeCulture, occ, { heritageCultureId: nameRes.cultureId, age });
        let backstory = fillPronouns(backstoryVariants[bi]);
        if (langs.reasons.length) backstory += ' ' + langs.reasons.map(fillPronouns).join(' ');
        // MARITIME DRIFT: a sailor from landlocked Vermont is a contradiction —
        // unless they left. People move; the story says so.
        const MARITIME = ['sailor', 'fisher', 'fisherman', 'deckhand', 'longshoreman', 'marine_biologist', 'naval_officer'];
        if (MARITIME.includes(occ.id) && !(parsed.tags || []).includes('coast')) {
          backstory += ' ' + fillPronouns(`{They} left ${city} young to work the water and never really came back.`);
        }
        const temperament = pick(cg.temperaments || ['steady']);
        const sharing = pick(cg.sharingStyles || ['fair']);
        const curiosity = pick(cg.curiosities || ['practical']);
        // personality axes: quirks, habits, hopes, fears — everyone had a life.
        // DEDUPED per expedition: two cast members "memorizing the stars" breaks
        // the fiction faster than any single wrong trait.
        const _ut = this._usedTraits || (this._usedTraits = { quirk: new Set(), habit: new Set(), hope: new Set(), fear: new Set() });
        const pickFresh = (pool, setName) => {
          const set = _ut[setName];
          const fresh = (pool || []).filter(x => !set.has(x));
          const src = fresh.length ? fresh : (pool || []);
          const c = src.length ? src[Math.floor(Math.random() * src.length)] : null;
          if (c) set.add(c);
          return c;
        };
        // DARK: rare psychos, benign and malicious. ~2.5% benign, ~1.5% malicious.
        // Tell, don't label: no 'psychopath' string anywhere user-facing. The
        // quirk IS the tell; the backstory carries one wrong note. Most people
        // are just people — the dark ones stand out because they're exceptions.
        let dark = null, quirk;
        {
          const rolled = this.rollDarkTrait();
          if (rolled) {
            dark = rolled;
            quirk = rolled._tell.quirk;
            _ut.quirk.add(quirk); // dedupe the tell like any other quirk
          } else {
            quirk = pickFresh(cg.quirks, 'quirk');
          }
        }
        const habit = pickFresh(cg.habits, 'habit');
        const hope = pickFresh(cg.hopes, 'hope');
        // GOALS: everyone wants something. People have agendas, not just traits.
        // 'lead' is rare — genRoster guarantees 1-2 contenders per village.
        const goalDefs = cg.goals || [];
        const goalPool = [];
        for (const g of goalDefs) {
          const w = g.id === 'lead' ? 1 : g.id === 'survive' ? 2 : 3;
          for (let i = 0; i < w; i++) goalPool.push(g.id);
        }
        const goal = goalPool.length ? pick(goalPool) : null;
        const fill = t => t.replaceAll('{first}', first).replaceAll('{occ}', occ.name || 'survivor')
          .replaceAll('{origin}', origin).replaceAll('{city}', city).replaceAll('{skill}', skill);
        const talk = [];
        const tt = [...(cg.talkTemplates || [])];
        while (talk.length < 3 && tt.length) talk.push(fill(tt.splice(Math.floor(Math.random() * tt.length), 1)[0]));
        const quest = (cg.questTemplates || []).map(fill);
        const secretFear = pickFresh(cg.fears && cg.fears.length ? cg.fears : ['being forgotten'], 'fear');
        // INTELLIGENCE: primary from occupation (what the job demanded — a nurse
        // is practical the way a programmer is analytical). Secondary from
        // temperament + curiosity (who they are beyond the job). Never random:
        // every trait must be traceable to the character's story.
        const intelDefs = cg.intelligences || {};
        const intelPrimary = (occ.intel && intelDefs[occ.intel]) ? occ.intel : 'steady';
        const tempSec = { bold: ['creative', 'practical'], intense: ['creative', 'analytical'], cautious: ['observant', 'steady'], warm: ['social', 'steady'], gentle: ['social', 'steady'], steady: ['steady', 'practical'], withdrawn: ['analytical', 'observant'], prickly: ['analytical', 'observant'], restless: ['creative', 'observant'], dry: ['analytical', 'observant'] };
        const curSec = { curious: ['analytical', 'creative'], 'hungry-to-learn': ['analytical', 'creative'], practical: ['practical', 'steady'], wary: ['observant', 'steady'], skeptical: ['analytical', 'observant'], indifferent: ['steady', 'practical'] };
        const secPool = [];
        for (const s of (tempSec[temperament] || ['steady'])) { secPool.push(s, s); }
        for (const s of (curSec[curiosity] || ['steady'])) { secPool.push(s); }
        const secCands = secPool.filter(s => s !== intelPrimary && intelDefs[s]);
        const intelSecondary = secCands.length ? secCands[Math.floor(Math.random() * secCands.length)] : (intelPrimary === 'steady' ? 'practical' : 'steady');
        // DARK TELL, applied: one wrong note in the backstory, one unsettling
        // line in the assessment. The quirk (set above) is the visible tell.
        let sysAssess = `${first} reads as ${temperament} and ${sharing} with strangers. The others find this ${temperament === 'cautious' ? 'reassuring' : temperament === 'bold' ? 'exhausting' : 'worth watching'}.`;
        let darkStored = null;
        if (dark && dark._tell) {
          backstory += ' ' + fillPronouns(dark._tell.note);
          sysAssess += ' ' + dark._tell.assessment;
          darkStored = { kind: dark.kind, tell: dark.tell };
        }
        const char = {
          id: 'gen_' + Math.random().toString(36).slice(2, 9),
          name, formerOccupation: occ.name || 'survivor', homeRegion: origin,
          originTags: parsed.tags, heritage: this.heritageFor(parsed.tags),
          backstory, personality: { temperament, sharing, curiosity, quirk, habit, hope, dark: darkStored }, age, goal,
          intelligence: { primary: intelPrimary, secondary: intelSecondary },
          abilityWeights: occ.abilityWeights || { care: 1, fieldcraft: 1, system: 1 },
          items: [], // filled below with char context (keepsake personalization)
          talk, quest, kcalPerDay: (occ.kcalPerDay || 2000) + Math.floor(Math.random() * 201) - 100,
          // villagers feed themselves FIRST — but they're strangers in a strange
          // land. providesPerDay is the PRE-knowledge base (~60% of need):
          // starting background knowledge multiplies it, and it KEEPS growing as
          // the village learns (see villagerLearnsPlant). the learning curve IS
          // the difficulty curve: an ignorant village leans on the pantry and the
          // player; a knowledgeable village feeds itself and builds surplus.
          // knowledgeFactor = 1 + 0.10 * knownPlants, capped at 1.8.
          // (missing this field entirely meant generated villagers produced 0 and
          // the village burned ~12k/day from the pantry — the forager could never
          // keep up, and the "self-sufficient" fiction was a lie.)
          providesPerDay: Math.round((occ.kcalPerDay || 2000) * 0.60) + Math.floor(Math.random() * 201) - 100,
          survivalProbability: 25 + Math.floor(Math.random() * 21),
          systemAssessment: sysAssess,
          secretFear, languages: langs, occupationId: occ.id || null,
          candidate: candidate !== false, pro,
        };
        // ITEMS (Steve 2026-10-05): generated with full char context so kin
        // keepsakes are THAT person's — named from their own culture.
        char.items = this.genItemCandidates(occ, char);
        return char;
    },

    // genRoster(playerOrigin): the character-select cast.
    // The player picks an origin FIRST, then gets 4 candidates FROM that origin —
    // name, native language, background, and knowledge all match. The character
    // IS the player, not a stranger wearing their hometown.
    // Plus 2 extra villagers from random origins so Haven stays international.
    genRoster(playerOrigin) {
      const cg = this.data.characterGen || {};
      const pick = a => a[Math.floor(Math.random() * a.length)];
      // sims call newGame repeatedly in one process — clear last expedition's cast
      this.data.villagers = (this.data.villagers || []).filter(v => !(v.id || '').startsWith('gen_'));
      const origin = playerOrigin || pick(cg.sampleOrigins || ['somewhere']);
      const usedNames = new Set();
      const usedOccs = new Set();
      // game-level dedup registries: names + backstory variants shouldn't repeat
      // within an expedition. newGame's background-survivor draw consults these too.
      this._usedNames = usedNames;
      this._usedBackstories = new Set();
      // personality dedupe registries: quirks, habits, hopes, fears shouldn't
      // repeat within an expedition either. Reset per roster.
      this._usedTraits = { quirk: new Set(), habit: new Set(), hope: new Set(), fear: new Set() };
      const chars = [];
      for (let i = 0; i < 4; i++) {
        chars.push(this.genCharacter({ origin, forceCultureMatch: true, candidate: true, usedNames, usedOccs }));
      }
      // Language is a real choice on the cards — but the player must always have
      // at least one fully-fluent pick. No trapped protagonists.
      if (!chars.some(c => (this.levelsOf(c.languages).english || 0) === 2)) {
        const c0 = chars[0];
        c0.languages = c0.languages || { native: 'english', levels: {} };
        c0.languages.levels = this.levelsOf(c0.languages);
        c0.languages.levels.english = 2;
      }
      for (let i = 0; i < 2; i++) {
        const npcOrigin = pick(cg.sampleOrigins || ['somewhere']);
        chars.push(this.genCharacter({ origin: npcOrigin, forceCultureMatch: false, candidate: false, usedNames, usedOccs }));
      }
      for (const c of chars) this.data.villagers.push(c);
      // LEADERSHIP: every village gets 1-2 contenders. Someone always wants
      // to be in charge — that's what makes it a village, not a backdrop.
      const leads = chars.filter(c => c.goal === 'lead');
      if (!leads.length) {
        const cand = chars.find(c => ['bold', 'prickly', 'intense'].includes((c.personality || {}).temperament)) || chars[0];
        if (cand) cand.goal = 'lead';
      } else if (leads.length > 2) {
        for (let i = 2; i < leads.length; i++) leads[i].goal = 'prove';
      }
      this.generatedRoster = chars;
      return chars;
    },


    // PERSONAL KEEPSAKES (Steve 2026-10-05): keepsakes are THAT person's items,
    // not generic props. A kin keepsake names its person — drawn from the
    // character's own name culture, carrying the family name where blood
    // says so. The item IS the relationship: if Lily's drawing is in your
    // pack, Lily is your daughter. No name is invented that the fiction
    // can't support: kin are age-gated (no grandchildren at 19).
    kinAgeOk(kin, age) {
      if (kin === 'grandchildren' || kin === 'grandmother' || kin === 'grandfather') return age >= 38;
      if (kin === 'daughter' || kin === 'spouse') return age >= 20;
      return true;
    },
    genKinPerson(char, kin) {
      const age = char.age || 30;
      if (!this.kinAgeOk(kin, age)) return null;
      const genderNeed = { daughter: 'f', mother: 'f', sister: 'f', grandmother: 'f', father: 'm', brother: 'm', grandfather: 'm' }[kin] || null;
      const cultureId = this.cultureForOrigin ? this.cultureForOrigin(char.homeRegion) : null;
      const culture = ((this.data.nameCultures || {}).cultures || {})[cultureId] || {};
      const firsts = culture.first || [];
      const lasts = culture.last || [];
      const pick = a => a[Math.floor(Math.random() * a.length)];
      let first = null, guard = 0;
      while (!first && guard++ < 40 && firsts.length) {
        const c = String(pick(firsts)).split(' ')[0];
        if (!genderNeed || this.guessNameGender(c, cultureId) === genderNeed) first = c;
      }
      if (!first) first = genderNeed === 'f' ? 'Anna' : genderNeed === 'm' ? 'John' : 'Sam';
      const charLast = char.name.split(' ').slice(1).join(' ');
      const isFamily = !['friend', 'neighbor'].includes(kin);
      const full = (isFamily && charLast) ? `${first} ${charLast}`
        : `${first} ${lasts.length ? pick(lasts) : 'Reyes'}`;
      // kin age: plausible relative to the character
      let kinAge = null;
      if (kin === 'daughter') kinAge = Math.max(3, age - (22 + Math.floor(Math.random() * 9)));
      else if (kin === 'grandchildren') kinAge = 4 + Math.floor(Math.random() * 7);
      else if (kin === 'spouse') kinAge = Math.max(18, age + Math.floor(Math.random() * 11) - 5);
      else if (kin === 'mother' || kin === 'father') kinAge = age + 22 + Math.floor(Math.random() * 9);
      else if (kin === 'sister' || kin === 'brother') kinAge = Math.max(8, age + Math.floor(Math.random() * 17) - 8);
      else if (kin === 'grandmother' || kin === 'grandfather') kinAge = age + 45 + Math.floor(Math.random() * 16);
      else kinAge = Math.max(16, age + Math.floor(Math.random() * 21) - 10);
      return { first, full, age: kinAge };
    },
    // personalizeKeepsake: rewrite a kin keepsake's name/flavor around the
    // named person. Returns {name, flavor} or null (not personalizable).
    personalizeKeepsake(char, def, kp) {
      const first = char.name.split(' ')[0];
      const per = {
        daughters_drawing: () => ({
          name: `${kp.first}'s Drawing`,
          flavor: `${kp.full}, ${kp.age}. Crayon on printer paper: you, holding a sun. She drew it the week before the sky changed.`,
        }),
        mothers_ring: () => ({
          name: `${kp.first}'s Ring`,
          flavor: `${kp.full}'s. You twist it when thinking.`,
        }),
        wedding_ring: () => {
          const wedYear = 2026 - Math.max(1, Math.floor((char.age || 30) / 3));
          return {
            name: `Wedding Ring`,
            flavor: `Gold band, worn thin. Inside: ${first.charAt(0)} + ${kp.first.charAt(0)}, ${wedYear}. You remember the day.`,
          };
        },
        photo_album: () => ({
          name: `Photo Album`,
          flavor: `${kp.full} put it together. Faces from before — ${kp.first} on nearly every page. The most valuable thing you own.`,
        }),
        dead_phone: () => ({
          name: `Dead Phone`,
          flavor: `${kp.first}'s old phone. Cracked screen, 2% forever. You kept it the way sailors kept compasses.`,
        }),
        mixtape: () => ({
          name: `Mixtape`,
          flavor: `${kp.first} made it. Hand-labeled: 'FOR THE DRIVE.' No player. The songs are in your head anyway.`,
        }),
        dog_tags: () => ({
          name: `Dog Tags`,
          flavor: `${kp.full}'s. Not yours. You carry them so someone is remembered.`,
        }),
        hard_candy: () => ({
          name: `Hard Candy`,
          flavor: `Butterscotch, for ${kp.first}. You dole them out like medals, even now. Especially now.`,
        }),
        locket: () => ({
          name: `Brass Locket`,
          flavor: `${kp.full}'s locket. Two photos inside, both fading. Opens with a click you can feel in your teeth.`,
        }),
        lucky_coin: () => ({
          name: `Lucky Coin`,
          flavor: `${kp.first}'s coin. Worn smooth. Heads or tails, it always lands on keep going.`,
        }),
        reading_glasses: () => ({
          name: `Reading Glasses`,
          flavor: `${kp.first} left them at your place, years ago. For the ledger and the fine print on cans. The apocalypse has fine print.`,
        }),
      };
      const fn = per[def.id];
      return fn ? fn() : null;
    },
    // genItemCandidates: 8 personal items per character from class pools,
    // biased by occupation. The player picks 5. Combinations surprise.
    genItemCandidates(occ, char) {
      const byId = {}; (this.data.items || []).forEach(i => { byId[i.id] = i; });
      const bias = (occ && occ.itemBias) || {};
      const result = [];
      const charAge = (char && char.age) || 30;
      const take = (cls, n, filter) => {
        let poolIds = (this.data.items || []).filter(i => i.class === cls && !result.includes(i.id)).map(i => i.id);
        if (filter) poolIds = poolIds.filter(id => filter(byId[id]));
        const favored = (bias[cls] || []).filter(id => byId[id] && byId[id].class === cls && !result.includes(id) && (!filter || filter(byId[id])));
        const rest = poolIds.filter(id => !favored.includes(id));
        // shuffle rest
        for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[rest[i], rest[j]] = [rest[j], rest[i]]; }
        const ordered = [...favored, ...rest];
        for (let k = 0; k < n && ordered.length; k++) result.push(ordered.shift());
      };
      take('tool', 2); take('weapon', 1); take('clothing', 2);
      // sentimental: age-gate kin (no grandchildren at 19), then personalize.
      // A keepsake that survives the gate is THAT person's — named, dated.
      take('sentimental', 2, def => this.kinAgeOk(def.kin || 'none', charAge));
      // wild card: one more from anywhere but food (bonded relics aren't snacks)
      const all = (this.data.items || []).filter(i => i.class !== 'food' && !result.includes(i.id)).map(i => i.id);
      if (all.length) result.push(all[Math.floor(Math.random() * all.length)]);
      // PERSONALIZE (Steve 2026-10-05): kin keepsakes get their person.
      // Stored per-character; the pick screen and inventory read the override.
      if (char) {
        char.itemPersonal = char.itemPersonal || {};
        for (const id of result) {
          const def = byId[id];
          if (def && def.class === 'sentimental' && def.kin && def.kin !== 'none') {
            const kp = this.genKinPerson(char, def.kin);
            if (kp) {
              const personal = this.personalizeKeepsake(char, def, kp);
              if (personal) char.itemPersonal[id] = { ...personal, kin: def.kin, kinName: kp.full };
            }
          }
        }
      }
      return result;
    },

    // genConflicts: deep, old wounds between peoples — NOT petty rivalries.
    // Hidden at first. They reveal slowly, through time and trust, if ever.
    // One run you never learn why. Another run, you're caught in the middle by day 3.
    genConflicts(npcIds) {
      const cg = this.data.characterGen || {};
      const byId = id => (this.data.villagers || []).find(v => v.id === id);
      const pool = [...npcIds];
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[pool[i], pool[j]] = [pool[j], pool[i]]; }
      const conflicts = [];
      const grievances = cg.grievances || ['old history'];
      const n = 1 + (Math.random() < 0.5 ? 1 : 0);
      const used = new Set();
      let guard = 0;
      while (conflicts.length < n && guard++ < 60) {
        const a = pool[Math.floor(Math.random() * pool.length)];
        const b = pool[Math.floor(Math.random() * pool.length)];
        if (!a || !b || a === b || used.has(a) || used.has(b)) continue;
        const va = byId(a), vb = byId(b);
        if (!va || !vb) continue;
        used.add(a); used.add(b);
        const ha = va.heritage || 'the scattered', hb = vb.heritage || 'the scattered';
        const fa = va.name.split(' ')[0], fb = vb.name.split(' ')[0];
        let kind, history;
        if (ha !== hb) {
          kind = 'old_wound';
          const g = grievances[Math.floor(Math.random() * grievances.length)];
          history = [
            `${fa} and ${fb} don't speak. It's not new.`,
            `Their peoples have history — ${ha} and ${hb}. The kind measured in generations, not arguments.`,
            `Something about ${g}. Ask directly and the conversation ends.`,
          ];
        } else {
          kind = 'friction';
          history = [`${fa} and ${fb} rub each other wrong. Nobody knows why. Maybe nobody needs to.`];
        }
        conflicts.push({
          a, b, kind, heritageA: ha, heritageB: hb, history,
          known: false, stage: 0, tension: 55 + Math.floor(Math.random() * 20), resolved: false,
        });
      }
      return conflicts;
    },

    // npcLangs: per-run languages for any villager id. The generated cast carry
    // their own; background survivors get a per-run draw in village.bgLangs
    // (static data has none — without this they all default to fluent English).
    npcLangs(vid) {
      const v = this.state && this.state.village;
      if (v && v.bgLangs && v.bgLangs[vid]) return v.bgLangs[vid];
      const person = (this.data.villagers || []).find(x => x.id === vid)
        || (this.data.background_survivors || []).find(x => x.id === vid) || {};
      return person.languages;
    },

    // commLevel: do you share ANY language? Best shared tongue wins, limited by
    // the weaker party — a non-fluent player can't lean on a villager's fluency.
    // full (2): normal. partial (1): halved. none: quarter + misunderstandings.
    commLevel(vid) {
      const vl = this.levelsOf(this.npcLangs(vid));
      const s = this.state.scholar || {};
      const pl = this.levelsOf(s.languages, s.englishLevel);
      let best = 0, bestLang = null;
      for (const id of Object.keys(vl)) {
        if ((vl[id] || 0) >= 1 && (pl[id] || 0) >= 1) {
          const m = Math.min(vl[id], pl[id]);
          if (m > best) { best = m; bestLang = id; }
        }
      }
      const nl = this.npcLangs(vid);
      const native = (nl && nl.native) || 'english';
      if (best >= 2) return { level: 'full', mult: 1, lang: bestLang };
      if (best === 1) return { level: 'partial', mult: 0.5, lang: bestLang };
      return { level: 'none', mult: 0.25, lang: native };
    },

    // langLabel: every tongue listed. Diversity unmistakable, not accidental.
    // "🇯🇵 Japanese · 🇰🇷 Korean · 🇺🇸 English (basic)"
    langLabel(langs) {
      const lv = this.levelsOf(langs);
      const defs = (this.data.characterGen || {}).languages || [];
      const disp = id => { const d = defs.find(l => l.id === id); return d ? `${d.icon} ${d.name}` : id; };
      const native = (langs && !Array.isArray(langs) && langs.native) || 'english';
      const parts = [disp(native)];
      for (const id of Object.keys(lv)) {
        if (id === native || (lv[id] || 0) < 1) continue;
        parts.push(disp(id) + (lv[id] === 1 ? ' (basic)' : ''));
      }
      return parts.join(' · ');
    },

    // langNote: the barrier is discovered in conversation, not listed on a roster.
    langNote(vid) {
      const met = (this.state.village.met || {})[vid];
      if (!met) return null;
      return this.langLabel(this.npcLangs(vid));
    },

    conflictNote(c, id) {
      if (!c) return null;
      const other = (this.data.villagers || []).find(x => x.id === (c.a === id ? c.b : c.a));
      const on = other ? other.name.split(' ')[0] : 'someone';
      if (c.kind === 'old_wound' && c.stage >= 1) return `⚡ old history with ${on} (${c.heritageA} / ${c.heritageB})`;
      return `⚡ tension with ${on} — you don't know why`;
    },

    // notePlaystyle: the game notices who you are. Not stats — behavior.
    notePlaystyle(axis, n) {
      const s = this.state.scholar; if (!s) return;
      s.playstyle = s.playstyle || {};
      s.playstyle[axis] = (s.playstyle[axis] || 0) + (n || 1);
    },

    // BETTER HUMAN (Steve 2026-10-05): practice makes human. Doing real work
    // in a stat's domain adds practice; enough practice raises the stat.
    // Diminishing returns — going from 5→6 is easier than 9→10. No grind spam:
    // only meaningful actions count (one practice per action, not per click).
    practice(stat, n) {
      const s = this.state.scholar; if (!s) return;
      s.stats = s.stats || { str: 5, end: 5, per: 5, agi: 5, pre: 5 };
      s.practice = s.practice || {};
      const cur = s.stats[stat] || 5;
      if (cur >= 10) return; // human ceiling — you're as good as you get
      s.practice[stat] = (s.practice[stat] || 0) + (n || 1);
      // Threshold: 8 reps for 5→6, +4 per level after (8, 12, 16, 20, 24)
      const need = 8 + (cur - 5) * 4;
      if (s.practice[stat] >= need) {
        s.practice[stat] = 0;
        s.stats[stat] = cur + 1;
        const names = { str: 'Strength', end: 'Endurance', per: 'Perception', agi: 'Agility', pre: 'Presence' };
        this.say(`💪 Your ${names[stat]} grows — ${s.stats[stat]}. The work is changing you.`);
        this.audioEvent('levelup', { quiet: true });
        // Check for passive skill unlocks
        try { this.checkPassiveUnlock(stat); } catch (e) {}
      }
    },

    // Stat getters — the effects of being a better human.
    stat(stat) { return ((this.state.scholar || {}).stats || {})[stat] || 5; },

    // PASSIVE SKILLS (Steve 2026-10-05): six human crafts, three tiers each.
    // Earned by DOING, not allocated. Announced diegetically — you feel
    // yourself learning, not "skill point spent." Separate from alien abilities.
    PASSIVES: {
      trail_eyes: { stat: 'per', name: 'Trail Eyes',
        tiers: ['You notice tracks without trying.', 'You read sign like writing.', 'The ground tells you stories.'],
        effect: [0.1, 0.2, 0.35] }, // forage yield bonus
      still_heart: { stat: 'end', name: 'Still Heart',
        tiers: ['Your hands stop shaking.', 'Fear becomes information.', 'You are the calm in the room.'],
        effect: [0.1, 0.2, 0.3] }, // reduced panic/fear effects
      true_swing: { stat: 'str', name: 'True Swing',
        tiers: ['Your strikes land cleaner.', 'Every hit finds the soft spot.', 'Your body knows the arc.'],
        effect: [0.1, 0.2, 0.3] }, // melee damage bonus
      calm_voice: { stat: 'pre', name: 'Calm Voice',
        tiers: ['People listen when you speak.', 'Your words carry weight.', 'You could talk a fire down.'],
        effect: [0.1, 0.2, 0.3] }, // talk/trust bonus
      firekeeper: { stat: 'end', name: 'Firekeeper',
        tiers: ['Fires catch faster for you.', 'You bank coals like savings.', 'Fire is a friend you keep.'],
        effect: [0.15, 0.3, 0.5] }, // fire starting/keeping bonus
      footwork: { stat: 'agi', name: 'Footwork',
        tiers: ['You move without thinking.', 'Your feet know the ground.', 'You are hard to hit.'],
        effect: [0.05, 0.1, 0.15] }, // dodge chance in combat
    },

    checkPassiveUnlock(stat) {
      const s = this.state.scholar; if (!s) return;
      s.passives = s.passives || {};
      for (const [id, def] of Object.entries(this.PASSIVES)) {
        if (def.stat !== stat) continue;
        const cur = s.passives[id] || 0;
        if (cur >= 3) continue;
        // Unlock tier when stat reaches 6/8/10
        const need = 6 + cur * 2;
        if ((s.stats[stat] || 5) >= need) {
          s.passives[id] = cur + 1;
          this.say(`✨ ${def.name} — ${def.tiers[cur]} (tier ${cur + 1})`);
          this.audioEvent('passiveUnlock', { quiet: true });
        }
      }
    },

    passiveBonus(id) {
      const s = this.state.scholar; if (!s) return 0;
      const tier = (s.passives || {})[id] || 0;
      if (!tier) return 0;
      return (this.PASSIVES[id].effect[tier - 1] || 0);
    },

    // dominantPlaystyle: your strongest behavioral axis, or null if too early to tell.
    dominantPlaystyle() {
      const p = (this.state.scholar && this.state.scholar.playstyle) || {};
      let best = null, bestN = 2; // need at least 3 signals before the game presumes
      for (const [k, v] of Object.entries(p)) if (v > bestN) { best = k; bestN = v; }
      return best;
    },

    // socialSimmer: daily. The village has a life you only partly see.
    // Conflicts reveal slowly — observation, trust, time. Never all at once.
    socialSimmer() {
      const v = this.state.village;
      v.conflicts = v.conflicts || [];
      const day = this.state.scholar.day;
      const trust = v.trust || {};
      for (const c of v.conflicts) {
        if (c.resolved) continue;
        if (!c.known && day >= 3) {
          const talked = ((this.state.talkIdx || {})[c.a] || 0) + ((this.state.talkIdx || {})[c.b] || 0);
          const p = 0.12 + Math.min(0.2, talked * 0.03);
          if (Math.random() < p) {
            c.known = true;
            const va = (this.data.villagers || []).find(x => x.id === c.a) || {};
            const vb = (this.data.villagers || []).find(x => x.id === c.b) || {};
            this.say(`You've started noticing: ${this.displayName(c.a)} and ${this.displayName(c.b)} never speak. It's not new. (Something old lives in Haven.)`);
          }
        }
        if (c.known && c.tension > 40 && Math.random() < 0.10) this.conflictIncident(c);
        // mediation: trusted by both, the air can clear — slowly
        if (c.known && !c.resolved && (trust[c.a] || 0) >= 55 && (trust[c.b] || 0) >= 55) {
          c.resolved = true; c.tension = 0;
          const va = (this.data.villagers || []).find(x => x.id === c.a) || {};
          const vb = (this.data.villagers || []).find(x => x.id === c.b) || {};
          this.say(`${this.displayName(c.a)} nodded at ${this.displayName(c.b)} today. First time. Whatever it was, it's loosening. Haven breathes easier.`);
        }
        if (c.tension > 30) c.tension -= 1;
      }
    },

    // conflictIncident: you're caught in the middle. No choice UI — your normal
    // actions (who you favor) ARE the choice. The game keeps score.
    conflictIncident(c) {
      const v = this.state.village;
      const trust = v.trust = v.trust || {};
      const va = (this.data.villagers || []).find(x => x.id === c.a) || {};
      const vb = (this.data.villagers || []).find(x => x.id === c.b) || {};
      const fa = this.displayName(c.a), fb = this.displayName(c.b);
      const incidents = [
        () => { this.say(`You find ${fa} and ${fb} in a sharp, quiet argument. It stops when you approach. Neither explains.`); c.tension = Math.min(100, c.tension + 5); },
        () => { this.say(`${fa} corners you by the fire: "Don't share your haul with ${fb}." It's not a request.`); trust[c.a] = Math.min(100, (trust[c.a] || 10) + 2); trust[c.b] = Math.max(0, (trust[c.b] || 10) - 2); },
        () => { this.say(`${fb} eats apart from the others tonight. ${fa} doesn't look up. The fire feels smaller.`); },
        () => { this.say(`You carry a message from ${fa} to ${fb}. It's not kind. You deliver it anyway. That's what neighbors do, apparently.`); trust[c.a] = Math.min(100, (trust[c.a] || 10) + 2); trust[c.b] = Math.max(0, (trust[c.b] || 10) - 3); c.tension = Math.min(100, c.tension + 3); },
      ];
      incidents[Math.floor(Math.random() * incidents.length)]();
    },

    newGame(homeRegionText, locationId, villagerId, pickedItems, runName) {
      // homeRegionText: free text, typed by the player. Stored raw — someday we trek home.
      const parsed = this.parseOrigin(homeRegionText);
      this.homeRegion = parsed.raw; this.villagerId = villagerId;
      // landing zone: the scattering is random. Your origin doesn't choose where you wake up.
      // locationId is only honored for legacy/test callers — live play always randomizes.
      const locPool = (this.data.locations || []);
      const loc = (locationId && locPool.find(l => l.id === locationId))
        || locPool[Math.floor(Math.random() * locPool.length)]
        || {};
      this.state = S.state.newState();
      this.state.startLocation = loc.id || null;
      this.state.startLocationName = loc.name || null;
      this.state.spawnType = loc.spawnType || 'countryside';
      this.state.runName = (runName && String(runName).trim()) || null;
      // roster: candidates generated FROM the player's origin (genRoster) — the
      // character IS the player. No origin override needed; it already matches.
      if (!this.generatedRoster || !this.generatedRoster.length) this.genRoster(homeRegionText);
      const playerChar = this.generatedRoster.find(c => c.id === villagerId) || this.generatedRoster[0];
      this.villagerId = playerChar.id;
      // Refresh tags from the authoritative origin text (covers custom-typed origins).
      playerChar.homeRegion = parsed.raw;
      playerChar.originTags = parsed.tags;
      playerChar.heritage = this.heritageFor(parsed.tags);
      const cg = this.data.characterGen || {};
      const occ = (cg.occupations || []).find(o => o.id === playerChar.occupationId) || {};
      // Languages stay as generated: native culture tongue + rolled English.
      // A non-fluent protagonist is an informed choice — the card shows it.
      const villager = playerChar;
      this.state.village.name = 'Haven';
      // Starting pantry: REAL FOOD, not a number. 3-4 days for the group.
      // Breathing room to learn before the pressure hits. The scarcity comes later.
      const nPpl = 12;
      const startDays = 3 + Math.random() * 1;
      const targetKcal = Math.round(nPpl * 2000 * startDays);
      this.state.village.pantry = []; // list of food items
      this.state.village.pantryKcal = 0; // (kept for compat, computed from pantry)
      // Fill with staples: dried beans, rice, canned goods (safe, long spoil).
      // Staples: beans are RAW (need cooking, 150 raw -> 300 cooked).
      // If you don't know to cook them, they're half the food. Knowledge is calories.
      // Was 8,500. Starvation was mathematically inevitable. Fixed.
      // Starting pantry: REAL FOOD, not a number. Breathing room to learn before
      // the pressure hits — but not a season. ~47k kcal: at the real early
      // deficit (~3.7k/day with strangers who don't know the land) that's ~13
      // days. A neglectful village is in crisis by week two; a learning village
      // stretches it; a knowledgeable village never looks back. The scarcity
      // comes fast — that's the point. (Was ~94k: neglect-proof for 20 days,
      // which taught nothing.)
      const staples = [
        { name: 'Dried beans', rawKcal: 150, cookedKcal: 300, kcalEach: 150, units: 80, spoilDay: 9999, safe: false, kg: 0.5, needsCooking: true, unit: 'scoop' },
        { name: 'Rice', rawKcal: 200, cookedKcal: 350, kcalEach: 200, units: 65, spoilDay: 9999, safe: false, kg: 0.5, needsCooking: true, unit: 'scoop' },
        { name: 'Canned soup', kcalEach: 250, units: 30, spoilDay: 9999, safe: true, kg: 0.4, unit: 'can' },
        { name: 'Dried meat', kcalEach: 400, units: 22, spoilDay: 9999, safe: true, kg: 0.3, unit: 'strip' },
        { name: 'Peanuts', kcalEach: 170, units: 35, spoilDay: 9999, safe: true, kg: 0.1, unit: 'handful' },
      ];
      let kcal = 0;
      for (const s of staples) {
        const item = { ...s };
        this.state.village.pantry.push(item);
        kcal += item.kcalEach * item.units;
      }
      // (If target not met, it's fine — RNG means some runs start leaner.)
      this.state.village.water = { clean: 20 + ((loc.startMod && loc.startMod.waterClean) || 0), dirty: 0 }; // liters. Clean and dirty separate.
      // (Player's personal 2L is set when the scholar object is built below.)
      // the roster: your pick + the 5 you didn't pick + 6 drawn from 36 background survivors.
      // twelve mouths, different every run. The unpicked generated characters live here too.
      const otherGen = this.generatedRoster.filter(c => c.id !== this.villagerId).map(c => c.id);
      const pool = [...this.data.background_survivors];
      const bg = [];
      // avoid first-name collisions with the generated cast — "two Marias" breaks the fiction
      const usedFirsts = new Set([...(this._usedNames || [])].map(n => String(n).split(' ')[0]));
      for (let i = 0; i < 6 && pool.length; i++) {
        let idx = pool.findIndex(s => !usedFirsts.has(String(s.name || '').split(' ')[0]));
        if (idx < 0) idx = Math.floor(Math.random() * pool.length);
        const drawn = pool.splice(idx, 1)[0];
        usedFirsts.add(String(drawn.name || '').split(' ')[0]);
        if (this._usedNames) this._usedNames.add(drawn.name);
        bg.push(drawn.id);
      }
      // background survivors get per-run languages from the same story-driven
      // generator. Static data carries none — without this, levelsOf defaults
      // everyone to fluent English and language barriers never happen.
      // Their home culture is read from their LAST NAME (not random): a Ruiz
      // grew up Spanish-speaking, an Okonkwo Yoruba-speaking. Coherent people.
      this.state.village.bgLangs = {};
      {
        const nc = this.data.nameCultures || {};
        const cultures = nc.cultures || {};
        const lastToCultures = {};
        for (const [cid, c] of Object.entries(cultures)) {
          for (const ln of (c.last || [])) {
            const k = String(ln).toLowerCase();
            (lastToCultures[k] = lastToCultures[k] || []).push(cid);
          }
        }
        const cids = Object.keys(cultures);
        for (const id of bg) {
          const person = (this.data.background_survivors || []).find(s => s.id === id) || {};
          const lastName = String(person.name || '').split(' ').slice(-1)[0].toLowerCase();
          const matches = (lastToCultures[lastName] || []).filter(c => c !== 'american');
          const bHome = matches.length
            ? matches[Math.floor(Math.random() * matches.length)]
            : ((lastToCultures[lastName] || [])[0] || 'american');
          const bHeritage = (bHome !== 'american' && Math.random() < 0.25 && cids.length)
            ? cids[Math.floor(Math.random() * cids.length)] : null;
          const bOcc = (cg.occupations || []).find(o => o.name === String(person.formerOccupation || '').toLowerCase()) || null;
          this.state.village.bgLangs[id] = this.genCultureLanguages(bHome, bOcc, {
            heritageCultureId: bHeritage === bHome ? null : bHeritage, age: person.age || 35,
          });
        }
      }
      // background survivors get per-run home regions (static data can't hold them).
      // Derived from the same culture draw as bgLangs — a Ruiz is from Mexico,
      // an Okonkwo from Nigeria. Coherent people, coherent origins.
      this.state.village.bgHome = {};
      {
        const culturePlaces = {
          american: 'America', argentine: 'Argentina', bangladeshi: 'Bangladesh',
          brazilian: 'Brazil', colombian: 'Colombia', egyptian: 'Egypt',
          ethiopian: 'Ethiopia', filipino: 'the Philippines', german: 'Germany',
          ghanaian: 'Ghana', indian: 'India', indonesian: 'Indonesia',
          irish: 'Ireland', japanese: 'Japan', kenyan: 'Kenya', korean: 'Korea',
          mexican: 'Mexico', moroccan: 'Morocco', newzealander: 'New Zealand',
          nigerian: 'Nigeria', norwegian: 'Norway', peruvian: 'Peru',
          polish: 'Poland', thai: 'Thailand', turkish: 'Turkey',
          ukrainian: 'Ukraine', venezuelan: 'Venezuela', vietnamese: 'Vietnam',
        };
        const nc2 = this.data.nameCultures || {};
        const cultures2 = nc2.cultures || {};
        const lastToCultures2 = {};
        for (const [cid, c] of Object.entries(cultures2)) {
          for (const ln of (c.last || [])) {
            const k = String(ln).toLowerCase();
            (lastToCultures2[k] = lastToCultures2[k] || []).push(cid);
          }
        }
        for (const id of bg) {
          const person = (this.data.background_survivors || []).find(s => s.id === id) || {};
          const lastName = String(person.name || '').split(' ').slice(-1)[0].toLowerCase();
          const matches = (lastToCultures2[lastName] || []).filter(c => c !== 'american');
          const home = matches.length
            ? matches[Math.floor(Math.random() * matches.length)]
            : ((lastToCultures2[lastName] || [])[0] || 'american');
          this.state.village.bgHome[id] = culturePlaces[home] || 'America';
        }
      }
      this.state.village.roster = [this.villagerId].concat(otherGen, bg);
      this.state.village.villagers = [this.villagerId].concat(otherGen); // generated have dialogue; background have one-liners
      // persist the generated cast (they don't exist in the JSON — the save carries them)
      this.state.village.rosterChars = {};
      for (const c of this.generatedRoster) this.state.village.rosterChars[c.id] = c;
      // who has met whom: language barriers are discovered in conversation, not listed
      this.state.village.met = {};
      // background survivors get per-run goals (static data can't hold them).
      // Contenders come from the generated cast — bg survivors don't start
      // wanting the throne (they can still gossip, grumble, and take sides).
      const goalIds = (this.data.characterGen.goals || []).map(g => g.id).filter(id => id !== 'lead');
      this.state.village.bgGoals = {};
      for (const id of bg) {
        if (goalIds.length) this.state.village.bgGoals[id] = goalIds[Math.floor(Math.random() * goalIds.length)];
      }
      // background survivors get per-run intelligence (static data can't hold it).
      // Primary from occupation via the same mapping as the generated cast;
      // secondary from temperament. Same minds, same rules.
      this.state.village.bgIntel = {};
      {
        const intelDefs = (this.data.characterGen || {}).intelligences || {};
        const tempSec = { bold: ['creative', 'practical'], intense: ['creative', 'analytical'], cautious: ['observant', 'steady'], warm: ['social', 'steady'], gentle: ['social', 'steady'], steady: ['steady', 'practical'], withdrawn: ['analytical', 'observant'], prickly: ['analytical', 'observant'], restless: ['creative', 'observant'], dry: ['analytical', 'observant'] };
        for (const id of bg) {
          const person = (this.data.background_survivors || []).find(s => s.id === id) || {};
          const occName = String(person.formerOccupation || '').toLowerCase();
          const occ = (this.data.characterGen.occupations || []).find(o =>
            String(o.name || '').toLowerCase() === occName || String(o.id || '').toLowerCase() === occName) || {};
          const primary = (occ.intel && intelDefs[occ.intel]) ? occ.intel : 'steady';
          const temp = (person.personality && person.personality.temperament) || 'steady';
          const cands = (tempSec[temp] || ['steady']).filter(s => s !== primary && intelDefs[s]);
          const secondary = cands.length ? cands[Math.floor(Math.random() * cands.length)] : (primary === 'steady' ? 'practical' : 'steady');
          this.state.village.bgIntel[id] = { primary, secondary };
        }
      }
      // background survivors get per-run dark traits (static data can't hold them).
      // VILLAGE CAP: at most one dark NPC per village — two psychos in twelve
      // people stops feeling rare. The generated cast may already hold one.
      this.state.village.bgDark = {};
      {
        const darkGen = otherGen.filter(id => {
          const rc = (this.state.village.rosterChars || {})[id];
          return rc && rc.personality && rc.personality.dark;
        });
        // strip extras from the generated cast (the tell quirk stays as flavor —
        // eccentricity without the machinery underneath)
        for (const id of darkGen.slice(1)) {
          const rc = (this.state.village.rosterChars || {})[id];
          if (rc && rc.personality) rc.personality.dark = null;
        }
        let darkPlaced = darkGen.length > 0;
        for (const id of bg) {
          if (darkPlaced) break;
          const rolled = this.rollDarkTrait();
          if (rolled) {
            this.state.village.bgDark[id] = { kind: rolled.kind, tell: rolled.tell };
            darkPlaced = true;
          }
        }
      }
      // LEADERSHIP: 1-2 NPC contenders — never the scholar (you can't compete
      // with yourself). The genRoster fix-up might have crowned the character
      // the player picked; this guarantees the VILLAGE has its contenders.
      {
        const npcIds = this.state.village.roster.filter(id => id !== this.villagerId);
        const setGoal = (id, g) => {
          const vp = this.data.villagers.find(x => x.id === id);
          if (vp) vp.goal = g;
          else this.state.village.bgGoals[id] = g;
        };
        let npcLeads = npcIds.filter(id => this.npcGoal(id) === 'lead');
        if (!npcLeads.length) {
          const cand = npcIds.find(id => ['bold', 'prickly', 'intense'].includes(this.npcTemper(id))) || npcIds[0];
          if (cand) { setGoal(cand, 'lead'); npcLeads = [cand]; }
        }
        if (npcLeads.length > 2) npcLeads.slice(2).forEach(id => setGoal(id, 'prove'));
      }
      // SOCIAL GROUPS: informal circles. Your actions ripple through them.
      this.genGroups();
      // OLD WOUNDS: deep conflicts between peoples, hidden at first. They simmer.
      const npcIds = this.state.village.roster.filter(id => id !== this.villagerId);
      this.state.village.conflicts = this.genConflicts(npcIds);
      // ACT 0: trust starts low. you're 12 strangers from all over the world.
      // everyone woke up in the SAME building — and it's ALWAYS the same building.
      // Haven is home base. Home doesn't change shape between runs.
      // A new player shouldn't have to re-learn the map every expedition.
      this.state.village.trust = {};
      this.state.village.buildingType = 'haven';
      this.state.village.spawnBuilding = 'the Haven hall';
      for (const rid of this.state.village.roster) {
        // trust 5-20: strangers. it's earned.
        this.state.village.trust[rid] = 5 + Math.floor(Math.random() * 16);
      }
      // THE VILLAGE DOESN'T TRUST YOU YET. You're new (or a stranger).
      // Trust builds through contribution, dialogue, sharing.
      // This determines your meal share, whether they share knowledge, etc.
      this.state.village.trust[this.villagerId] = 15;
      // ALIVE: needs-driven villagers. Behavior from wants, not dice.
      // hunger/fear/social/energy per NPC; moods derived; memory of what you did.
      this.state.village.needs = {};
      this.state.village.memory = {};
      this.state.village.requests = {}; // rid -> {type, day, part}: an ask awaiting answer
      // LEADER: delegation assignments + village knowledge pool.
      this.state.village.assignments = {}; // rid -> {task, assignedDay, assignedPart}
      this.state.village.sharedKnowledge = {}; // plantId -> {discoveredBy, day}
      this.state.village.grief = 0;  // days of village-wide grief (death)
      this.state.village.cheer = 0;  // days of village-wide cheer (victory, donation)
      for (const rid of this.state.village.roster) {
        if (rid === this.villagerId) continue;
        this.state.village.needs[rid] = {
          hunger: 20 + Math.floor(Math.random() * 20),
          fear: 15 + Math.floor(Math.random() * 20),   // everyone woke up scared
          social: 30 + Math.floor(Math.random() * 30),
          energy: 60 + Math.floor(Math.random() * 30),
        };
        this.state.village.memory[rid] = [];
      }
      // (Jesse's snare is granted after newCodex below — order matters.)
      // VILLAGERS IN THE GRID: each has a position (mx, my) in the Haven building.
      // they wander turn-based. you see them. you tap them.
      this.state.village.positions = {};
      // LIVING WORLD: NPCs exist on the world map, not just in Haven's grid.
      // nodePos[rid] = {nx, ny}: which map node they're on. Everyone starts at
      // Haven. They move between nodes with their own agendas — foraging,
      // exploring, leaving. The world simulates them whether you're there or not.
      // positions[rid] = {mx, my} is only populated for NPCs on YOUR node.
      this.state.village.nodePos = {};
      this.state.village.away = {}; // rid -> {nx, ny, purpose, returnPart, returnDay}: NPCs out in the world
      {
        const hx = this.state.village.px ?? 3, hy = this.state.village.py ?? 3;
        for (const rid of this.state.village.roster) {
          if (rid === this.villagerId) continue;
          this.state.village.nodePos[rid] = { nx: hx, ny: hy };
        }
      }
      // place them in the building (not on walls, not on you)
      const freeCells = [];
      // (positions assigned when Haven detail generates — see ensureVillagerPositions)
      
      // TEACHERS: everyone knows a few plants — from THEIR old life, not yours.
      // Familiarity matters: an Ohioan knows Ohio plants; an Arizonan dropped
      // into Georgia creek country knows almost nothing. Local plants come first:
      // what you knew back home is what you can teach.
      this.state.village.taught = {};
      const shuf = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; };
      const plantsByFamiliarity = (tags) => {
        const tl = (tags || []).map(t => String(t).toLowerCase());
        const local = [], other = [];
        for (const p of this.data.plants) {
          const pr = (p.regions || []).map(x => String(x).toLowerCase());
          (pr.some(r => tl.includes(r)) ? local : other).push(p.id);
        }
        return [...shuf(local), ...shuf(other)];
      };
      const tierCount = { local: 3, visitor: 2, stranger: 1 };
      for (const rid of this.state.village.roster) {
        const rc = (this.state.village.rosterChars || {})[rid];
        const tags = rc ? (rc.originTags || []) : [];
        const tier = this.familiarityTier(tags);
        this.state.village.taught[rid] = plantsByFamiliarity(tags).slice(0, tierCount[tier] || 1);
      }
      const scholar = S.state.newScholar(this.villagerId);
      // BETTER HUMAN (Steve 2026-10-05): background sets your starting stats.
      // You were someone before the scattering — that body remembers.
      try {
        const occCat = this.lifeseed ? this.lifeseed.occCategory(villager.formerOccupation) : 'service';
        const bonuses = {
          medical: { per: 2, pre: 1 },   // observant, bedside manner
          food: { end: 2, str: 1 },      // kitchen stamina, butcher's arms
          craft: { str: 2, per: 1 },     // physical work, detail eye
          outdoors: { end: 2, agi: 1, per: 1 }, // the survivalist
          service: { pre: 2, per: 1 },   // people-facing
          creative: { per: 2, pre: 1 },  // noticing, expressing
        }[occCat] || {};
        for (const [k, v] of Object.entries(bonuses)) scholar.stats[k] = 5 + v;
      } catch (e) {}
      // WEEK 1 TRACKER: the System watches what you do. Your first ability
      // is based on your actions, not your stats. Play how you want to play.
      scholar.week1 = { forage: 0, hunt: 0, talk: 0, cook: 0, donate: 0, scavenge: 0 };
      // PLAYSTYLE: the game notices who you are — cautious, bold, generous... behavior, not stats.
      scholar.playstyle = {};
      // LANGUAGES: your tongues with levels. Native is fluent; occupation
      // polyglots actually speak their claimed languages. Your origin is real
      // now — and so is the barrier when you share no language at all.
      const pl = villager.languages || { native: 'english', levels: { english: 2 } };
      const plv = this.levelsOf(pl);
      for (const l of (occ.polyglot || [])) plv[l] = 2;
      scholar.languages = plv;
      scholar.englishLevel = plv.english != null ? plv.english : 2;
      const gear = (pickedItems && pickedItems.length === 5) ? pickedItems : villager.items.slice(0, 5);
      // RELIC BOND: your five are bonded relics. Grown, not found.
      // Bond accrues through use; the System offers enhancements at 10/25/50.
      // Bond is non-transferable — a bonded relic in a stranger's hands is just stuff.
      scholar.inventory = gear.map(id => {
        const def = this.data.items.find(i => i.id === id) || {};
        // PERSONAL KEEPSAKES: the bonded relic carries its person's name.
        const personal = (villager.itemPersonal || {})[id];
        return { itemId: id, units: 1, kcalEach: 0, kg: def.kg != null ? def.kg : 0.2, name: personal ? personal.name : (def.name || id),
          flavor: personal ? personal.flavor : def.flavor,
          bonded: true, bond: 0, bondOffered: [], enhancements: [] };
      });
      scholar.relicUse = {}; // per-day record of meaningful relic use
      // Start with a day's food. You're not starving on arrival (that's day 3).
      scholar.inventory.push(
        { name: 'Trail mix', kcalEach: 400, units: 2, spoilDay: 9999, safe: true, kg: 0.3, unit: 'bag' },
        { name: 'Dried meat', kcalEach: 300, units: 2, spoilDay: 30, safe: true, kg: 0.2, unit: 'strip' },
      );
      // granted abilities from villager data (2 each, defined here for slice 1)
      // BACKGROUND ABILITIES: separate from System slots. This is YOU — your past.
      // Your occupation decides what you brought with you. Some people are just lucky.
      // These level with use, like System abilities.
      const grantedIds = (occ.granted || []).filter(id => this.data.abilities.find(a => a.id === id));
      scholar.backgroundAbilities = grantedIds.map(id => {
        const def = this.data.abilities.find(a => a.id === id);
        return { id, name: def ? def.name : id, desc: def ? def.description : '', level: 1, xp: 0, background: true };
      });
      scholar.abilities = []; // System abilities (slot-limited) start empty.
      // WATER BOTTLES: 1L each, 1kg each. Assume you have bottles.
      // Quality matters: clean vs risky. Source is retained.
      scholar.water = [
        { liters: 1, quality: 'clean', source: 'Haven' },
        { liters: 1, quality: 'clean', source: 'Haven' },
      ];
      scholar.insideHaven = true; // you wake up INSIDE the hall. the door leads out.
      scholar.mx = 4; scholar.my = 4; // spawn: center of the hall
      scholar.facing = { x: 0, y: 1 };
      this.state.scholar = scholar;
      this.state.codex = S.state.newCodex();
      // KNOWLEDGE TAXONOMY: your occupation IS knowledge. Not flavor — mechanical.
      // An electrician knows circuits. A nurse knows wound care. Day 1, real Codex entries.
      // This is the "background = starting knowledge" principle.
      const bgCount = this.grantBackgroundKnowledge(villager);
      if (bgCount > 0) {
        this.say(`📖 Your old life taught you things. ${bgCount} skill${bgCount > 1 ? 's' : ''} from your past — check your Journal.`);
      }
      // YOUR starting knowledge: what your old life taught you — if this land resembles it.
      // Arizona -> Georgia creek: you start knowing almost nothing. That's the point.
      for (const pid of (this.state.village.taught[this.villagerId] || [])) {
        this.state.codex.plants[pid] = { identifiedDay: 0, level: 1, harvests: 0, tastings: 0 };
        this.state.codex.encounters = this.state.codex.encounters || {};
        this.state.codex.encounters[pid] = 99;
      }
      const famTier = this.familiarityTier(parsed.tags);
      if (famTier === 'stranger') this.say('Nothing here looks like home. You know none of these plants. Learn fast.');
      else if (famTier === 'visitor') this.say('Some of this country feels familiar. Not enough.');
      // Hunters start knowing the snare. Others must learn.
      if (occ.knowsSnare) {
        this.state.codex.recipes['snare'] = { level: 3 };
      }
      this.dayPart = 0; this.ap = 1; this.over = false; this.won = false;
      this.state.scholar.dayTicks = 0; this.state.scholar.actionClock = 0; // action clock: fresh budget
      this.villageLost = false; this.wanderer = null; this.fight = null; this.pendingEncounter = false; this.pendingMonsterId = null;
      this.encounterDone = false; this.log = [];
      this.location = 'village'; this.departed = false;
      this.wipe();
      this.genMap();
      this.genVillages();
      this.say('Haven. Twelve people. The fire is lit.');
      // BARREN HAVEN FIX: a new player must understand within minutes that
      // food is OUT THERE. A villager says it; the journal keeps it.
      try {
        const roster = (this.state.village.roster || []).filter(id => id !== this.villagerId);
        const speaker = roster.length ? roster[Math.floor(Math.random() * roster.length)] : null;
        const outwardLines = [
          'Nothing grows here but dirt and tents. Past the treeline — that\'s where the green is. That\'s where the food is.',
          'Don\'t bother picking around the tents. Walk out. The land feeds people who go looking.',
          'We\'ve got days of stores, not weeks. The treeline is the pantry now. Learn what\'s out there.',
        ];
        const line = outwardLines[Math.floor(Math.random() * outwardLines.length)];
        const who = speaker ? this.displayName(speaker) : 'Someone by the fire';
        this.say(`${who}: "${line}"`);
        if (this.journalNote) this.journalNote('haven', 'outward', 'Food won\'t come to Haven. Walk past the treeline — learn what grows out there, bring it back, and get it named at camp.');
      } catch (e) {}
      return this.status();
    },

    // --- village: people to talk to, things to do ---
    talkTo(vid) {
      // Legacy entry: now opens a real conversation, returns the opening line.
      const st = this.startConvo(vid);
      return st ? st.line : null;
    },

    // ============ CONVERSATIONS ============
    // Real back-and-forth dialogue. The player always has response choices —
    // never just "continue". NPCs ask questions back, remember your answers,
    // and every conversation has a shape: opening, development, natural end.
    // No repeats: said lines are tracked per thread; exhausted threads admit
    // it honestly instead of looping.

    vpOf(vid) {
      return (this.data.villagers || []).find(x => x.id === vid)
        || (this.data.background_survivors || []).find(x => x.id === vid) || {};
    },

    // npcHomeRegion: where an NPC is from. Generated cast has homeRegion;
    // background survivors get a per-run draw in village.bgHome (from culture).
    npcHomeRegion(vid) {
      const vp = this.vpOf(vid);
      if (vp.homeRegion) return vp.homeRegion;
      const bg = (this.state.village || {}).bgHome || {};
      if (bg[vid]) return bg[vid];
      const rc = ((this.state.village || {}).rosterChars || {})[vid];
      if (rc && rc.homeRegion) return rc.homeRegion;
      return 'somewhere';
    },

    convoGet(vid) {
      const v = this.state.village;
      v.conv = v.conv || {};
      if (!v.conv[vid]) v.conv[vid] = {
        active: false, exchanges: 0, budget: 4, thread: null, depth: 0,
        said: {}, transcript: [], pendingQ: null, askedQs: [],
        answered: {}, recalled: {}, lastDay: -1, count: 0, over: false,
        offeredHelp: false,
      };
      return v.conv[vid];
    },

    convoBudget(vid) {
      const temp = this.npcTemper(vid);
      const n = this.npcNeeds(vid);
      let b = 4;
      if ((n.social || 0) > 70) b += 1;
      if (temp === 'warm' || temp === 'gentle') b += 1;
      if (temp === 'withdrawn' || temp === 'prickly' || temp === 'restless') b -= 1;
      return Math.max(2, Math.min(6, b));
    },

    // convoPick: no repeats, ever. Tracks by line TEXT (not index), so it
    // stays correct even when the pool's composition shifts with mood/rep.
    // Filters against EVERYTHING ever said to this villager — a line used in
    // one thread never resurfaces in another.
    // Returns the line, or null when the pool is genuinely exhausted.
    convoPick(vid, key, pool) {
      const c = this.convoGet(vid);
      c.said[key] = c.said[key] || [];
      const allSaid = [];
      for (const k of Object.keys(c.said)) for (const l of c.said[k]) allSaid.push(l);
      const fresh = (pool || []).filter(l => allSaid.indexOf(l) === -1);
      if (!fresh.length) return null;
      const line = fresh[Math.floor(Math.random() * fresh.length)];
      c.said[key].push(line);
      return line;
    },

    // convoPickCycle: like convoPick, but generic pools (exits, "told you
    // everything") are allowed to cycle rather than fall back to one fixed
    // string — the order still varies, so it never feels like a loop.
    convoPickCycle(vid, key, pool) {
      let l = this.convoPick(vid, key, pool);
      if (l == null) {
        this.convoGet(vid).said[key] = [];
        l = this.convoPick(vid, key, pool);
      }
      return l;
    },

    convoOpening(vid) {
      const cg = (this.data.characterGen || {}).convo || {};
      const v = this.state.village;
      const c = this.convoGet(vid);
      const trust = (v.trust || {})[vid] || 10;
      const temp = this.npcTemper(vid);
      const mood = this.npcMood(vid);
      const goal = this.npcGoal(vid);
      const goalDef = (this.data.characterGen.goals || []).find(g => g.id === goal);
      const vp = this.vpOf(vid);

      // 1. THEY asked to talk — their reason leads, once.
      const treq = (v.talkRequests || {})[vid];
      if (treq && !treq.delivered) {
        treq.delivered = true;
        return { line: String(treq.line).replace(/ \(Talk to .*?\.\)$/, ''), thread: 'request' };
      }
      // 2. They remember what you told them. Being remembered feels real.
      if (c.answered.q_origin === 'a_tell' && !c.recalled.q_origin) {
        const qd = (cg.questions || []).find(q => q.id === 'q_origin');
        c.recalled.q_origin = true;
        if (qd && qd.recall) {
          const region = (this.state.scholar || {}).homeRegion || 'wherever you said';
          return { line: qd.recall.replaceAll('{region}', region), thread: 'recall' };
        }
      }
      if (c.answered.q_trust && !c.recalled.q_trust) {
        const qd = (cg.questions || []).find(q => q.id === 'q_trust');
        c.recalled.q_trust = true;
        if (qd && qd.recall) return { line: qd.recall, thread: 'recall' };
      }
      // 3. The village's weather is the elephant in the room.
      if ((v.grief || 0) > 0) {
        const l = this.convoPick(vid, 'grief', [
          '"Have you — sorry. I keep thinking about them."',
          '"It\'s quiet today. Wrong kind of quiet."',
        ]);
        if (l) return { line: l, thread: 'grief' };
      }
      if ((v.cheer || 0) > 0 && Math.random() < 0.5) {
        const l = this.convoPick(vid, 'cheer', [
          '"Good day, huh? Almost feels normal."',
          '"People are smiling. I forgot what that looked like."',
        ]);
        if (l) return { line: l, thread: 'cheer' };
      }
      // 4. What they want — if they trust you enough to say it.
      const shareAt = temp === 'withdrawn' ? 60 : temp === 'prickly' ? 50
        : (temp === 'warm' || temp === 'gentle') ? 25 : 35;
      if (goalDef && trust >= shareAt) {
        const l = this.convoPick(vid, 'goal', goalDef.lines || []);
        if (l) return { line: this.fillTalkLine(l, vp), thread: 'goal' };
      }
      // 5. Contextual small talk — mood, temperament, reputation. Never repeated.
      const pool = [];
      const push = (arr, w) => { for (const x of (arr || [])) for (let i = 0; i < (w || 1); i++) pool.push(x); };
      push((this.data.characterGen.moodTalk || {})[mood], (mood === 'grieving' || mood === 'scared') ? 3 : 1);
      push((this.data.characterGen.temperamentTalk || {})[temp], 2);
      push(this.repTalkLines(vid), 2);
      push((this.data.characterGen.talkTemplates || []).slice(0, 8), 1);
      if (!pool.length) push(cg.openers || ['"Hey."'], 1);
      const l = this.convoPick(vid, 'small', pool);
      if (l) return { line: this.fillTalkLine(l, vp), thread: 'small' };
      // 6. Truly nothing new — said like a person, not a loop.
      const ex = this.convoPickCycle(vid, 'exh', cg.exhausted || ['"I\'ve told you everything I know."']);
      return { line: ex || '"Good to just be around people."', thread: 'small' };
    },

    convoThreadHasMore(vid) {
      const c = this.convoGet(vid);
      const cg = (this.data.characterGen || {}).convo || {};
      const t = c.thread;
      if (t === 'goal') {
        const goal = this.npcGoal(vid);
        const lines = (cg.goalFollow || {})[goal] || [];
        const said = c.said.goaldeep || [];
        return said.length < lines.length;
      }
      if (t === 'past') {
        const said = c.said.pastdeep || [];
        return said.length < (cg.pastFollow || []).length;
      }
      if (t === 'plans') {
        const said = c.said.plansdeep || [];
        return said.length < (cg.plansFollow || []).length;
      }
      return false;
    },

    convoThreadBeat(vid) {
      // The next beat in the current thread, or null when it's honestly done.
      const c = this.convoGet(vid);
      const cg = (this.data.characterGen || {}).convo || {};
      const vp = this.vpOf(vid);
      const t = c.thread;
      let l = null;
      if (t === 'goal') {
        const goal = this.npcGoal(vid);
        l = this.convoPick(vid, 'goaldeep', (cg.goalFollow || {})[goal] || []);
      } else if (t === 'past') {
        l = this.convoPick(vid, 'pastdeep', cg.pastFollow || []);
      } else if (t === 'plans') {
        l = this.convoPick(vid, 'plansdeep', cg.plansFollow || []);
      }
      if (!l) return null;
      c.depth++;
      return this.fillTalkLine(l, vp);
    },

    // convLineLog: VILLAGE-WIDE line retirement. Tracks line TEXT -> day last
    // said, so shared dialogue pools don't recycle visibly across villagers
    // ("heard 13 times in 4 days" kills the illusion). convoPick filters
    // against lines said anywhere in the village in the last LINE_FRESH_DAYS.
    LINE_FRESH_DAYS: 5,
    convLineLog() {
      const v = this.state.village;
      v.convLineLog = v.convLineLog || {};
      return v.convLineLog;
    },
    villageLineFresh(line) {
      const last = this.convLineLog()[line];
      return last == null || (this.state.scholar.day - last) >= this.LINE_FRESH_DAYS;
    },
    noteVillageLine(line) {
      if (line) this.convLineLog()[line] = this.state.scholar.day;
    },
    // villagePick: pick from a pool, preferring lines nobody in the village
    // has said recently. Falls back to any line rather than silence —
    // ambient beats must always land. Notes the pick in the shared log.
    villagePick(pool) {
      pool = pool || [];
      if (!pool.length) return null;
      const fresh = pool.filter(l => this.villageLineFresh(l));
      const line = fresh.length
        ? fresh[Math.floor(Math.random() * fresh.length)]
        : pool[Math.floor(Math.random() * pool.length)];
      this.noteVillageLine(line);
      return line;
    },

    convoAskTopic(vid, topic) {
      // Ask about something specific. Threads develop; pools never repeat.
      // One topic per conversation — re-asking gets an honest deflection.
      const c = this.convoGet(vid);
      const cg = (this.data.characterGen || {}).convo || {};
      const exh = () => this.convoPickCycle(vid, 'exh', cg.exhausted || ['"I\'ve told you everything I know about that."']);
      c.askedTopics = c.askedTopics || [];
      if (c.askedTopics.indexOf(topic) !== -1) return exh();
      c.askedTopics.push(topic);
      const vp = this.vpOf(vid);
      if (topic === 'goal') {
        const goal = this.npcGoal(vid);
        const goalDef = (this.data.characterGen.goals || []).find(g => g.id === goal);
        const l = this.convoPick(vid, 'goal', (goalDef && goalDef.lines) || []);
        this.state.village.goalsKnown = this.state.village.goalsKnown || {};
        this.state.village.goalsKnown[vid] = goal;
        this.remember(vid, 'shared_goal', goal || 'unknown');
        c.thread = 'goal'; c.depth = 1;
        return l ? this.fillTalkLine(l, vp) : exh();
      }
      if (topic === 'past') {
        const pool = (this.data.characterGen.talkTemplates || [])
          .filter(s => s.indexOf('{occ}') !== -1 || s.indexOf('{origin}') !== -1);
        const l = this.convoPick(vid, 'past', pool.length ? pool : ['"Before? I was {occ}. Feels like someone else\'s life."']);
        c.thread = 'past'; c.depth = 1;
        return l ? this.fillTalkLine(l, vp) : exh();
      }
      if (topic === 'village') {
        const vg = this.state.village;
        const bits = [];
        if ((vg.grief || 0) > 0) bits.push("everyone's quiet since the loss");
        if ((vg.cheer || 0) > 0) bits.push('people are in good spirits');
        const hungry = (vg.roster || []).filter(id => id !== this.villagerId && (this.npcNeeds(id).hunger || 0) > 70).length;
        if (hungry > 2) bits.push(hungry + ' people are going hungry');
        const scared = (vg.roster || []).filter(id => id !== this.villagerId && (this.npcNeeds(id).fear || 0) > 70).length;
        if (scared > 2) bits.push('people are scared');
        const heat = Object.values(vg.heat || {}).filter(h => h > 0).length;
        if (heat) bits.push("there's tension about who's in charge");
        const line = bits.length ? bits.join('; ') + '.' : this.convoPickCycle(vid, 'villageidle', [
          'holding together, somehow.',
          'tired, but nobody\'s giving up. That counts for a lot.',
          'quiet. People keeping to themselves, mostly.',
          'better than yesterday. Worse than tomorrow, probably.',
        ]);
        const fullLine = '"Honestly? ' + line + '"';
        // Village news can repeat when nothing changed — say it differently.
        c.said.villagelines = c.said.villagelines || [];
        if (c.said.villagelines.indexOf(fullLine) !== -1) {
          c.thread = 'village'; c.depth = 1;
          return '"Honestly? ' + this.convoPickCycle(vid, 'villageidle', [
            'same as before, mostly.',
            'no big changes. That\'s good news, out here.',
            'still standing. Ask me tomorrow.',
          ]) + '"';
        }
        c.said.villagelines.push(fullLine);
        c.thread = 'village'; c.depth = 1;
        return fullLine;
      }
      if (topic === 'plans') {
        const l = this.convoPick(vid, 'plansdeep', cg.plansFollow || []);
        c.thread = 'plans'; c.depth = 1;
        return l ? this.fillTalkLine(l, vp) : exh();
      }
      return null;
    },

    convoChoices(vid) {
      const c = this.convoGet(vid);
      const choices = [];
      // Answering their question comes first — it's rude to ignore it.
      if (c.pendingQ) {
        for (const a of c.pendingQ.answers) choices.push({ id: 'ans:' + c.pendingQ.id + ':' + a.id, label: a.label });
        choices.push({ id: 'deflect_q', label: '(avoid the question)' });
        choices.push({ id: 'leave', label: '"I should go."' });
        return choices;
      }
      if (c.thread === 'nonverbal') {
        return [
          { id: 'nv:nod', label: '(nod slowly)' },
          { id: 'nv:smile', label: '(smile)' },
          { id: 'nv:pointself', label: '(point: you, them, together)' },
          { id: 'leave', label: '(walk away)' },
        ];
      }
      if (c.thread && this.convoThreadHasMore(vid)) choices.push({ id: 'more', label: '"Tell me more."' });
      const threadAsk = { goal: 'ask:goal', past: 'ask:past', village: 'ask:village', plans: 'ask:plans' }[c.thread];
      const asked = c.askedTopics || [];
      const asks = [];
      if (!this.goalKnown(vid) && asked.indexOf('goal') === -1) asks.push({ id: 'ask:goal', label: '"What do you want? Out of all this."' });
      if (asked.indexOf('past') === -1) asks.push({ id: 'ask:past', label: '"What did you do — before?"' });
      if (asked.indexOf('village') === -1) asks.push({ id: 'ask:village', label: '"How\'s everyone holding up?"' });
      if (asked.indexOf('plans') === -1) asks.push({ id: 'ask:plans', label: '"What\'s your plan for tomorrow?"' });
      for (const a of asks) if (a.id !== threadAsk && choices.length < 4) choices.push(a);
      if (this.goalKnown(vid) && !c.offeredHelp && choices.length < 5) choices.push({ id: 'offer_help', label: '"I could help with that."' });
      const reacts = [
        { id: 'agree', label: '"You\'re right."' },
        { id: 'joke', label: '(crack a joke)' },
        { id: 'silence', label: '(say nothing)' },
      ];
      if (choices.length < 5) choices.push(reacts[Math.floor(Math.random() * reacts.length)]);
      if (c.thread && c.thread !== 'small' && choices.length < 5) choices.push({ id: 'subject', label: '"Actually — different subject."' });
      choices.push({ id: 'leave', label: c.exchanges === 0 ? '"Nice talking to you."' : '"I should go."' });
      return choices;
    },

    startConvo(vid) {
      const vp = this.vpOf(vid);
      if (!vp || !vp.id) return null;
      const v = this.state.village;
      const c = this.convoGet(vid);
      c.active = true; c.exchanges = 0; c.budget = this.convoBudget(vid);
      c.thread = null; c.depth = 0; c.transcript = []; c.pendingQ = null;
      c.over = false; c.offeredHelp = false; c.askedTopics = [];
      c.qAskedThisConvo = false;
      c.count++; c.lastDay = this.state.scholar.day;
      // TALKING COSTS ENERGY — 20 kcal per conversation, not per line.
      this.state.scholar.kcal = Math.max(0, (this.state.scholar.kcal || 0) - 20);
      // ACTION CLOCK: a real conversation takes 2 ticks (time-only — talking barely burns calories).
      // ENGAGEMENT: they're talking with you now — batch turns won't wander them off.
      this.tickAction(2);
      this.setEngaged(vid, 2);
      if (this.state.scholar.week1) this.state.scholar.week1.talk++;
      this.notePlaystyle('social');
      this.gainAbilityXP('diplomat', 1);
      // BETTER HUMAN: talking is presence practice.
      this.practice('pre', 1);
      // LANGUAGE: the barrier is discovered in conversation, never listed.
      const comm = this.commLevel(vid);
      const firstMet = !(v.met || {})[vid];
      v.met = v.met || {}; v.met[vid] = true;
      if (firstMet && comm.level !== 'full') {
        const langName = ((this.data.characterGen || {}).languages || []).find(l => l.id === comm.lang);
        const label = langName ? `${langName.icon} ${langName.name}` : comm.lang;
        this.say(`...and then it lands: ${this.displayName(vid)} speaks ${label}. ${comm.level === 'partial' ? 'A few shared words. Gestures. Patience.' : 'You share no language at all.'}`);
      }
      // NAMES ARE EARNED SOCIALLY — but only with enough shared language.
      if (firstMet && !this.state.systemArrived && comm.level !== 'none') this.revealName(vid, 'intro');
      if (firstMet && !this.state.systemArrived && comm.level === 'none') this.revealName(vid, 'gesture');
      // ALIVE: talking eases loneliness — for them, not just you.
      try { this.npcNeeds(vid).social = Math.max(0, this.npcNeeds(vid).social - 40); } catch (e) {}
      if (comm.level === 'none') {
        // No shared language isn't a wall — it's a different conversation.
        const line = 'No shared words. Just eyes, hands, and patience.';
        c.thread = 'nonverbal';
        c.transcript.push({ who: 'them', text: line });
        this.say(`${this.displayName(vid)}: (no shared words — you communicate in gestures)`);
        return { line, choices: this.convoChoices(vid), transcript: c.transcript.slice(), ended: false };
      }
      const op = this.convoOpening(vid);
      c.thread = op.thread; c.depth = 1;
      c.transcript.push({ who: 'them', text: op.line });
      this.say(`${this.displayName(vid)}: "${op.line}"`);
      return { line: op.line, choices: this.convoChoices(vid), transcript: c.transcript.slice(), ended: false };
    },

    convoTurn(vid, choiceId) {
      const c = this.convoGet(vid);
      if (!c.active) return null;
      const cg = (this.data.characterGen || {}).convo || {};
      const temp = this.npcTemper(vid);
      const mood = this.npcMood(vid);
      let line = null, youSaid = null;
      const done = (l, you) => { line = l; youSaid = you || null; };

      if (choiceId === 'leave') {
        return this.endConvo(vid, 'left');
      } else if (choiceId.indexOf('ans:') === 0) {
        const parts = choiceId.split(':');
        const qid = parts[1], aid = parts[2];
        const qd = (cg.questions || []).find(q => q.id === qid);
        const ad = qd && qd.answers.find(a => a.id === aid);
        c.answered[qid] = aid;
        if (c.askedQs.indexOf(qid) === -1) c.askedQs.push(qid);
        c.pendingQ = null;
        let react = (ad && ad.react) || '"Huh. Okay."';
        react = react.replaceAll('{region}', (this.state.scholar || {}).homeRegion || 'there');
        done(this.fillTalkLine(react, this.vpOf(vid)), ad ? ad.label : null);
        this.remember(vid, 'you_said', qid + '=' + aid);
      } else if (choiceId === 'deflect_q') {
        const qid = c.pendingQ && c.pendingQ.id;
        c.pendingQ = null;
        if (qid && c.askedQs.indexOf(qid) === -1) c.askedQs.push(qid);
        const t = this.state.village.trust || {};
        t[vid] = Math.max(0, (t[vid] || 10) - 1);
        done('"Okay." Something shutters, just slightly.', '(avoid the question)');
      } else if (choiceId === 'more') {
        const beat = this.convoThreadBeat(vid);
        done(beat || this.convoPickCycle(vid, 'exh', cg.exhausted || ['"I\'ve told you everything I know about that."']), '"Tell me more."');
      } else if (choiceId.indexOf('ask:') === 0) {
        const topic = choiceId.slice(4);
        const labels = { goal: '"What do you want? Out of all this."', past: '"What did you do — before?"', village: '"How\'s everyone holding up?"', plans: '"What\'s your plan for tomorrow?"' };
        done(this.convoAskTopic(vid, topic), labels[topic] || null);
      } else if (choiceId === 'offer_help') {
        c.offeredHelp = true;
        const l = this.convoPick(vid, 'offerhelp', [
          '"You\'d do that? ...Thank you. Really."',
          '"I won\'t forget you said that."',
          '"Okay. Okay — that means something, you know that?"',
        ]) || '"Thank you."';
        const t = this.state.village.trust || {};
        t[vid] = Math.min(100, (t[vid] || 10) + 2);
        done(l, '"I could help with that."');
      } else if (choiceId === 'agree') {
        const m = cg.agreeReacts || {};
        done(m[temp] || m.default || '"Yeah."', '"You\'re right."');
      } else if (choiceId === 'joke') {
        const m = cg.jokeReacts || {};
        const key = (mood === 'grieving' || mood === 'scared') ? mood : temp;
        done(m[key] || m.default || 'A short laugh.', '(crack a joke)');
        const vg = this.state.village;
        vg.cheer = Math.max(vg.cheer || 0, 1);
      } else if (choiceId === 'silence') {
        const m = cg.silence || {};
        done(m[temp] || '"..."', '(say nothing)');
      } else if (choiceId === 'subject') {
        // Change the subject — to a topic you haven't covered yet.
        const c2 = this.convoGet(vid);
        const asked = c2.askedTopics || [];
        const opts = [];
        if (!this.goalKnown(vid) && asked.indexOf('goal') === -1) opts.push('goal');
        if (asked.indexOf('past') === -1) opts.push('past');
        if (asked.indexOf('village') === -1) opts.push('village');
        if (asked.indexOf('plans') === -1) opts.push('plans');
        const nt = opts[Math.floor(Math.random() * opts.length)];
        const labels = { goal: '"What do you want? Out of all this."', past: '"What did you do — before?"', village: '"How\'s everyone holding up?"', plans: '"What\'s your plan for tomorrow?"' };
        done(this.convoAskTopic(vid, nt), '"Actually — different subject." ' + (labels[nt] || ''));
      } else if (choiceId.indexOf('nv:') === 0) {
        const kind = choiceId.slice(3);
        const outs = {
          nod: 'They nod back, slowly. Some understanding passes between you.',
          smile: 'They smile — surprised, then genuine.',
          pointself: 'You point at yourself, then at them, then at the fire. Together. They get it.',
        };
        const t = this.state.village.trust || {};
        t[vid] = Math.min(40, (t[vid] || 10) + 1);
        done(outs[kind] || 'You gesture.', '(gesture)');
      } else {
        done('"..."', null);
      }

      if (youSaid) c.transcript.push({ who: 'you', text: youSaid });
      c.transcript.push({ who: 'them', text: line });
      while (c.transcript.length > 8) c.transcript.shift();
      c.exchanges++;
      this.say(`${this.displayName(vid)}: "${line}"`);

      // THEY ask YOU things. Conversations go both ways.
      // First conversation with someone: they're curious about the stranger.
      // After that, curiosity strikes about 40% of turns.
      const forceQ = c.count === 1 && !c.qAskedThisConvo;
      if (!c.pendingQ && c.exchanges >= 1 && (forceQ || Math.random() < 0.4)) {
        const trust = (this.state.village.trust || {})[vid] || 10;
        const moodNow = this.npcMood(vid);
        const cands = (cg.questions || []).filter(q =>
          c.askedQs.indexOf(q.id) === -1 && trust >= (q.minTrust || 0) &&
          (!q.when || q.when === moodNow));
        if (cands.length) {
          const qd = cands[Math.floor(Math.random() * cands.length)];
          c.pendingQ = qd;
          c.qAskedThisConvo = true;
          c.transcript.push({ who: 'them', text: qd.q });
          while (c.transcript.length > 8) c.transcript.shift();
          this.say(`${this.displayName(vid)}: "${qd.q}"`);
          line = qd.q;
        }
      }

      // Natural ending: the conversation has run its course.
      if (!c.pendingQ && c.exchanges >= c.budget) return this.endConvo(vid, 'natural');
      return { line, choices: this.convoChoices(vid), ended: false, transcript: c.transcript.slice() };
    },

    endConvo(vid, how) {
      const c = this.convoGet(vid);
      const cg = (this.data.characterGen || {}).convo || {};
      const temp = this.npcTemper(vid);
      const mood = this.npcMood(vid);
      const first = this.displayName(vid);
      c.active = false; c.over = true; c.thread = null; c.pendingQ = null;
      let line;
      if (how === 'left') {
        line = this.convoPickCycle(vid, 'leftexit', [
          '"Oh — okay. Later, then."',
          '"Sure. I\'ll be around."',
          '"Right. Go on, then."',
        ]);
      } else {
        const exits = cg.exits || {};
        const key = (mood === 'grieving' || mood === 'scared') ? mood : temp;
        const pool = exits[key] || exits.steady || ['"I should go."'];
        line = this.convoPickCycle(vid, 'exit', pool);
      }
      c.transcript.push({ who: 'them', text: line });
      while (c.transcript.length > 8) c.transcript.shift();
      // WORDS ONLY GO SO FAR: talk caps at 40. Beyond that, do something real.
      const t = this.state.village.trust || (this.state.village.trust = {});
      const cur = t[vid] || 10;
      t[vid] = cur >= 40 ? cur : Math.min(40, cur + 3);
      try { this.observe('talk', { noTrust: true }); } catch (e) {}
      try { this.checkPromises('social'); } catch (e) {}
      this.convoConflictFallout(vid, t[vid]);
      this.say(`${first}: ${line}`);
      return { line, choices: [], ended: true, transcript: c.transcript.slice() };
    },

    convoConflictFallout(vid, newTrust) {
      // OLD WOUNDS: favoritism is noticed. If you're close to one side of a
      // conflict, the other side keeps score — even if you don't know there's
      // a score being kept.
      for (const cf of (this.state.village.conflicts || [])) {
        if (cf.resolved || (cf.a !== vid && cf.b !== vid)) continue;
        if (newTrust >= 50) {
          const other = cf.a === vid ? cf.b : cf.a;
          const ot = this.state.village.trust;
          ot[other] = Math.max(0, (ot[other] || 10) - 2);
          if (cf.known) this.say(`${this.displayName(other)} saw how close you've gotten to ${this.displayName(vid)}. Old history has long eyes. (-2 trust)`);
          else this.say(`${this.displayName(other)} has been colder to you lately. You don't know why.`);
        }
        // HISTORY UNFOLDS through trust — slowly, partially, maybe never fully.
        if (cf.known && cf.kind === 'old_wound') {
          const t = (this.state.village.trust || {})[vid] || 0;
          if (cf.stage === 0 && t >= 45) {
            cf.stage = 1;
            this.say(`Late, quiet, ${this.displayName(vid)} tells you: "${cf.history[1]}"`);
          } else if (cf.stage === 1 && t >= 70) {
            cf.stage = 2;
            this.say(`${this.displayName(vid)} looks away. "${cf.history[2]}" That's all you get. Maybe that's all there is.`);
          }
        }
      }
    },

    convoUI(vid) {
      // What the person card needs to render the conversation.
      const c = this.convoGet(vid);
      if (!c.active) return { active: false, transcript: c.transcript.slice(), choices: [], over: c.over };
      const them = c.transcript.filter(t => t.who === 'them');
      return {
        active: true, transcript: c.transcript.slice(),
        choices: this.convoChoices(vid), over: false,
        line: them.length ? them[them.length - 1].text : null,
      };
    },


    // ============ NON-VERBAL COMMUNICATION ============
    // No shared language isn't a wall — it's a different game. Body language,
    // hand signals, drawings in dirt. Crude tools, real results, and the
    // occasional glorious misunderstanding. You're never fully locked out.

    // dominantNeed: what the body is actually saying, mechanically.
    dominantNeed(vid) {
      const n = this.npcNeeds(vid);
      const mood = this.npcMood(vid);
      if (mood === 'grieving') return 'grief';
      if (n.fear > 70) return 'fear';
      if (n.hunger > 70) return 'hunger';
      if (n.social > 78) return 'loneliness';
      if (n.energy < 20) return 'exhaustion';
      if (mood === 'grateful') return 'gratitude';
      if (mood === 'cheerful') return 'ease';
      return 'calm';
    },

    // nvTrust: non-verbal trust moves. Same 40 cap as talk — gestures earn
    // familiarity, not devotion. For that, do something real.
    nvTrust(vid, gain) {
      const t = this.state.village.trust || (this.state.village.trust = {});
      const cur = t[vid] || 10;
      t[vid] = cur >= 40 ? cur : Math.min(40, cur + gain);
      return t[vid];
    },

    // nonverbalRead: study their body language. read_people skill matters most;
    // diplomat helps a little. Success reveals their true state. Failure gives
    // you a confident, WRONG read — which the game remembers.
    nonverbalRead(vid) {
      const v = (this.data.villagers || []).find(x => x.id === vid)
        || (this.data.background_survivors || []).find(x => x.id === vid);
      if (!v) return null;
      this.state.scholar.kcal = Math.max(0, (this.state.scholar.kcal || 0) - 10);
      const first = this.displayName(vid);
      const readLvl = ((this.state.codex.skills || {}).read_people || {}).level || 0;
      const dipLvl = this.abilityLevel('diplomat');
      const chance = Math.min(0.95, 0.35 + readLvl * 0.22 + dipLvl * 0.05);
      const need = this.dominantNeed(vid);
      const vlg = this.state.village;
      vlg.misreads = vlg.misreads || {};

      const TRUE_READS = {
        fear: `${first} keeps glancing at the treeline. Shoulders up around the ears. Hands won't stay still. Scared — properly scared.`,
        hunger: `${first} is watching the cookpot the way a drowning person watches a rope. It's hunger. Plain and simple.`,
        loneliness: `${first} hovers at the edge of every conversation, never quite joining. Not hostile — lonely.`,
        exhaustion: `${first} moves like they're wading through something thick. Not lazy. Empty.`,
        grief: `${first} goes quiet whenever someone laughs. There's a hollow where something used to be.`,
        gratitude: `${first} keeps finding reasons to be near you. Small smiles. They owe you and it sits warm on them.`,
        ease: `${first} is loose-shouldered, unhurried. Whatever was wrong, right now it's fine.`,
        calm: `${first} gives nothing away. Breathing even, eyes steady. Either genuinely calm or very good at this.`,
      };
      // wrong, but plausible. The game says it like it's true — because to you, it is.
      const MISREADS = {
        fear: { as: 'angry', text: `${first}'s jaw is tight, arms crossed hard. They look furious. (You read anger. It's fear.)` },
        hunger: { as: 'sick', text: `${first} is pale and slow-moving. They look ill. (You read sickness. It's hunger.)` },
        loneliness: { as: 'hostile', text: `${first} keeps their distance from everyone. They clearly want to be left alone. (You read hostility. It's loneliness.)` },
        exhaustion: { as: 'lazy', text: `${first} can barely be bothered to move. Some people just don't pull their weight. (You read laziness. It's exhaustion.)` },
        grief: { as: 'angry', text: `${first} flinches at laughter like it's an insult. Something's eating them — probably you. (You read anger. It's grief.)` },
        gratitude: { as: 'nervous', text: `${first} keeps hovering, fidgeting. They seem on edge around you. (You read nerves. It's gratitude.)` },
        ease: { as: 'suspicious', text: `${first} is a little too relaxed. Nobody's that calm here. They're hiding something. (You read suspicion. It's just ease.)` },
        calm: { as: 'suspicious', text: `${first} gives nothing away — which is exactly what someone hiding something would do. (You read suspicion. It's just calm.)` },
      };

      if (Math.random() < chance) {
        // true read — and if you misread them before, own it
        const was = vlg.misreads[vid];
        delete vlg.misreads[vid];
        this.say(`👁 ${TRUE_READS[need] || TRUE_READS.calm}`);
        if (was) this.say(`Wait. Last time you were sure they were ${was}. You had it backwards. People are harder than plants.`);
        this.nvTrust(vid, 2); // being truly seen feels good
        // observation teaches: three good reads and it starts to click
        const s = this.state.scholar;
        s.readXP = (s.readXP || 0) + 1;
        if (s.readXP >= 3 && !this.skillKnown('read_people', 1)) {
          this.learnSkill('read_people', 1, 'watching people');
        }
        return { ok: true, need };
      }
      const mis = MISREADS[need] || MISREADS.calm;
      vlg.misreads[vid] = mis.as;
      this.say(`👁 ${mis.text}`);
      return { ok: false, need, misreadAs: mis.as };
    },

    // nonverbalGesture: hand signals. intent in friendly|food|follow|danger|count.
    // Concrete beats abstract. Misunderstandings have consequences.
    nonverbalGesture(vid, intent) {
      const v = (this.data.villagers || []).find(x => x.id === vid)
        || (this.data.background_survivors || []).find(x => x.id === vid);
      if (!v) return null;
      this.state.scholar.kcal = Math.max(0, (this.state.scholar.kcal || 0) - 10);
      const first = this.displayName(vid);
      const n = this.npcNeeds(vid);
      const CHANCE = { friendly: 0.7, food: 0.6, follow: 0.55, danger: 0.6, count: 0.8 };
      const chance = CHANCE[intent] || 0.5;
      const ok = Math.random() < chance;

      const SUCCESS = {
        friendly: () => { this.nvTrust(vid, 2);
          // no shared language? a friendly exchange can still trade names.
          // They point at themself, say it slowly, twice.
          if (!this.state.systemArrived && !this.nameKnown(vid) && Math.random() < 0.5) {
            this.revealName(vid, 'gesture');
          }
          return `👋 You wave, open-handed, smiling. ${first} hesitates — then waves back, a real one. Some things don't need translating.`; },
        food: () => {
          if (n.hunger > 50) { this.nvTrust(vid, 3); n.social = Math.max(0, n.social - 20);
            return `🍖 You mime eating — hand to mouth, chewing. ${first}'s whole face changes. Nodding, pointing at their own mouth, then at you. Yes. Food. Please.`; }
          this.nvTrust(vid, 1);
          return `🍖 You mime eating. ${first} looks confused, then politely mimes it back, eyebrows up: why? Not hungry — but the game of it lands. A small laugh.`; },
        follow: () => { this.nvTrust(vid, 2);
          return `➡️ You beckon — come with me — and point where you're going. ${first} glances at the others, then falls in beside you. Trust, in motion.`; },
        danger: () => { n.fear = Math.min(100, n.fear + 15); this.nvTrust(vid, 1);
          return `⚠️ You point hard at the treeline, then slash a hand across your throat. ${first} goes still. Eyes wide. They look where you pointed. They believe you.`; },
        count: () => { this.nvTrust(vid, 1);
          return `🔢 You hold up fingers, slowly. One. Two. Three. ${first} counts along, then holds up their own number. You've agreed on something. You're not sure what, but you've agreed.`; },
      };
      const FAIL = {
        friendly: () => { this.nvTrust(vid, -1);
          return `👋 You wave big and friendly. ${first} narrows their eyes — in some places that gesture means something else entirely. They turn away.`; },
        food: () => { n.fear = Math.min(100, n.fear + 10);
          return `🍖 You mime eating. ${first} goes pale — they think you're talking about THEM. About who's for dinner. They back up a step.`; },
        follow: () => { n.social = Math.min(100, n.social + 10);
          return `➡️ You beckon. ${first} shakes their head sharply and steps back. Whatever you want, they want no part of it. Not yet.`; },
        danger: () => { n.fear = Math.max(0, n.fear - 5);
          return `⚠️ You do your best alarm — pointing, wide eyes. ${first} laughs. Actually laughs. They think you're playing. They're not ready, and now they never will be.`; },
        count: () => {
          return `🔢 You hold up three fingers. ${first} points at themselves, then you, then the third person by the fire. Oh. They think you're counting PEOPLE.`; },
      };
      const msg = (ok ? SUCCESS[intent] : FAIL[intent])();
      this.say(msg);
      return { ok, intent };
    },

    // nonverbalDraw: scratch symbols in dirt. concept in food|water|danger|shelter.
    // Slower, more deliberate than gestures — and it leaves a mark they can study.
    nonverbalDraw(vid, concept) {
      const v = (this.data.villagers || []).find(x => x.id === vid)
        || (this.data.background_survivors || []).find(x => x.id === vid);
      if (!v) return null;
      this.state.scholar.kcal = Math.max(0, (this.state.scholar.kcal || 0) - 10);
      const first = this.displayName(vid);
      const readLvl = ((this.state.codex.skills || {}).read_people || {}).level || 0;
      const chance = Math.min(0.9, 0.5 + (readLvl >= 1 ? 0.15 : 0));
      const need = this.dominantNeed(vid);
      const conceptNeed = { food: 'hunger', water: 'hunger', danger: 'fear', shelter: 'exhaustion' };
      const ok = Math.random() < chance;
      const ICON = { food: '🍖', water: '💧', danger: '⚠️', shelter: '🏠' }[concept] || '✏️';

      if (ok) {
        let msg = `${ICON} You crouch and draw in the dirt — slow, clear strokes. ${first} watches, head tilted... then their eyes widen. They point at the drawing, then at the real thing. Got it.`;
        if (conceptNeed[concept] === need) {
          this.nvTrust(vid, 4);
          msg += ` And it was exactly what they needed. ${first} grabs your wrist — not hard. Grateful.`;
        } else {
          this.nvTrust(vid, 2);
        }
        this.say(msg);
        return { ok: true, concept };
      }
      this.say(`${ICON} You draw your best ${concept}. ${first} studies it for a long time. Tilts their head the other way. Points at it, raises their eyebrows: ...a circle? With lines? You try again. It's worse.`);
      return { ok: false, concept };
    },

    // TEACH: "show me what an oak leaf looks like."

    // nonverbalDrawCheck: silent version for teachPlant — no UI spam, just odds.
    nonverbalDrawCheck(vid) {
      const readLvl = ((this.state.codex.skills || {}).read_people || {}).level || 0;
      return Math.random() < Math.min(0.85, 0.45 + readLvl * 0.15);
    },

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
        this.say(`${this.displayName(vid)} doesn\'t know that one either.`);
        return null;
      }
      // LANGUAGE: no shared words? Try DRAWING. A picture of the plant, an arrow
      // to the mouth, a skull for the bad ones. Crude — but sometimes enough.
      // Success here teaches at "bad education" level (partial, not instant).
      const comm = this.commLevel(vid);
      if (comm.level === 'none') {
        if (this.nonverbalDrawCheck(vid)) {
          this.say(`${this.displayName(vid)} studies your dirt drawing for a long time... then nods slowly. Not words — but something got through.`);
        } else {
          this.say(`${this.displayName(vid)} tries — gestures, dirt drawings, growing frustration. The words aren't there. Maybe with patience. Maybe never.`);
          return null;
        }
      }
      const occ = (teacher.formerOccupation || '').toLowerCase();
      // INTELLIGENCE SHAPES TEACHING. Practical minds teach by doing — the lesson
      // lands faster when their hands are involved. Analytical minds explain the
      // WHY, so even a partial lesson sticks harder. Social minds teach trust
      // along with the skill.
      const tIntel = this.npcIntel(vid).primary;
      const trust = (this.state.village.trust && this.state.village.trust[vid]) || 10;
      const trustBar = tIntel === 'practical' ? 30 : 40; // practical teachers: show, don't lecture
      const isGoodTeacher = (occ.includes('cook') || occ.includes('chef') || occ.includes('hunter')) && trust > trustBar && comm.level === 'full';
      const isMedicTeacher = (occ.includes('nurse') || occ.includes('medic')) && plant.medicinal && trust > trustBar && comm.level === 'full';
      this.state.codex.encounters = this.state.codex.encounters || {};
      if (isGoodTeacher || isMedicTeacher) {
        // good education: instant unlock — one path
        if (this.identifyPlant(plantId, 'taught')) {
          const how = tIntel === 'practical' ? 'shows you — hands moving, no wasted words. You get it.'
            : tIntel === 'analytical' ? 'shows you, and explains WHY it works. You get it — deeply.'
            : `${this.displayName(vid)} shows you — a leaf, a picture scratched in dirt. You get it.`;
          this.say(how);
        }
      } else {
        // bad education: partial — but analytical teachers make partial stick harder.
        const bonus = tIntel === 'analytical' ? 1 : 0;
        const enc = (this.state.codex.encounters[plantId] || 0) + 1 + bonus;
        this.state.codex.encounters[plantId] = enc;
        this.say(`${this.displayName(vid)} tries to explain. "It looks... a bit like that?" You\'re not sure. (${enc} encounters)${bonus ? ' Their explanation of the why helps it stick.' : ''}`);
      }
      // teaching builds trust — BUT with diminishing returns.
      // Talk gets you to 40. Beyond that, you need ACTIONS, not words.
      // (Prevents endless talk-spam to max trust.)
      if (this.state.village.trust) {
        const cur = this.state.village.trust[vid] || 10;
        if (cur < 40) {
          // Diminishing: +8 at 10, +4 at 20, +2 at 30, +1 at 35...
          // diplomat multiplies (still capped at 40 — words only go so far).
          const dipLvl2 = this.abilityLevel('diplomat');
          const dipMult2 = dipLvl2 >= 2 ? 3 : dipLvl2 >= 1 ? 2 : 1;
          const gain = Math.max(1, Math.floor(8 * (1 - cur / 50) * dipMult2));
          // Talking can raise trust toward 40, but never drag it down.
          this.state.village.trust[vid] = cur >= 40 ? cur : Math.min(40, cur + gain);
        }
        // Above 40: talking doesn't build trust. Do something real.
      }
      // teaching is observed: generosity + competence, through each lens.
      try { this.observe('share_knowledge', { target: vid }); } catch (e) {}
      // THEY LEARN: a successful lesson sticks. Their foraging improves —
      // knowledge feeds, through the taught[] the village metabolism reads.
      try { this.villagerLearnsPlant(vid, plantId, 'taught'); } catch (e) {}
      // ACTION CLOCK: a real lesson takes 3 ticks (time-only — minds, not muscles).
      this.tickAction(3);
      this.setEngaged(vid, 2);
      return true;
    },

    // CRAFT: make a recipe you know (L3). Consumes materials. Creates an item with uses.
    // Items degrade: snare breaks after 2 catches. You make another.
    craft(recipeId) {
      const recipe = this.data.recipes.find(r => r.id === recipeId);
      if (!recipe) return null;
      const known = (this.state.codex.recipes || {})[recipeId];
      // KNOWLEDGE-GATED CRAFTING (Steve): blind is never "button disabled" —
      // it's "button honest." L2+ understands it (85%). L1 has SEEN one — you
      // can try to copy it from memory, but it's a long shot (35%) and the
      // materials are at real risk. L0: you've never seen one — no button.
      const rlevel = (known && known.level) || 0;
      if (rlevel < 1) {
        this.say(`You don\'t know how to make a ${recipe.name} yet.`);
        return null;
      }
      const blind = rlevel < 2;
      if (blind) this.say(`You've only SEEN a ${recipe.name}. You'll try to copy it from memory — long odds, and the materials are at risk if it comes apart.`);
      // check materials
      const inv = this.state.scholar.inventory;
      // BAIT is not a material — it's food. Any edible item (berries, nuts,
      // scraps) baits a deadfall. The recipe text says "bait (berries or
      // nuts)"; the code honors it instead of demanding a phantom item.
      const matMatches = (item, mat) => mat === 'bait'
        ? ((item.kcalEach || 0) > 0 && (item.units || 0) > 0)
        : item.material === mat;
      for (const [mat, need] of Object.entries(recipe.materials)) {
        const have = inv.filter(i => matMatches(i, mat)).reduce((t, i) => t + i.units, 0);
        if (have < need) {
          this.say(mat === 'bait'
            ? `Need ${need} bait — berries, nuts, any food (have ${have}).`
            : `Need ${need} ${mat} (have ${have}).`);
          return null;
        }
      }
      // consume materials
      for (const [mat, need] of Object.entries(recipe.materials)) {
        let left = need;
        for (const item of inv) {
          if (!matMatches(item, mat) || left <= 0) continue;
          const take = Math.min(item.units, left);
          item.units -= take; left -= take;
        }
      }
      this.state.scholar.inventory = inv.filter(i => i.units > 0);
      // steady_hands/taught_hands: fine work under pressure. Base 85% success —
      // fail and the materials are already consumed above. The woods keep them.
      // Blind (L1) attempts: 35%. You've seen one; your hands haven't.
      const baseRate = blind ? 0.35 : 0.85;
      const success = Math.min(1, this.modTarget('craft.success', baseRate));
      if (Math.random() > success) {
        this.say(`The ${recipe.name} comes apart in your hands. The materials are wasted. (craft failed)`);
        return null;
      }
      // create the item
      this.state.scholar.tools = this.state.scholar.tools || [];
      this.state.scholar.tools.push({ recipeId, uses: recipe.uses, name: recipe.name });
      this.say(`You make a ${recipe.name}. ${recipe.description} (${recipe.uses} uses)`);
      // ACTION CLOCK: crafting = 1 chunk (32 ticks, time + hand work).
      this.tickAction(32);
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
      let tool = (this.state.scholar.tools || []).find(t => t.recipeId === recipeId);
      // SNARE WIRE (Steve 2026-10-05): honest tackle. Wire in hand sets a
      // snare without crafting one first — consumed when the trap is placed.
      if (!tool && recipeId === 'snare' && this.hasItem('snare_wire')) {
        this.consumeItem('snare_wire', 1);
        tool = { recipeId: 'snare', uses: 2 };
        this.say('(The snare wire becomes the snare.)');
      }
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

    // CHECK TRAPS: at day start, EVERY set trap may have caught something —
    // wherever it is. A trapline works while you sleep elsewhere; the dawn
    // message says where, so the catch never arrives silently.
    checkTraps() {
      const px = this.map.px, py = this.map.py;
      const dirPhrase = (x, y) => {
        if (x === px && y === py) return 'here';
        const dx = x - px, dy = y - py;
        const d = Math.abs(dx) + Math.abs(dy);
        const ew = dx > 0 ? 'east' : dx < 0 ? 'west' : '';
        const ns = dy > 0 ? 'south' : dy < 0 ? 'north' : '';
        const dir = [ns, ew].filter(Boolean).join('-') || 'here';
        return `${d} ${d === 1 ? 'tile' : 'tiles'} ${dir}`;
      };
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const t = this.tileAt(x, y);
        if (!t.traps || !t.traps.length) continue;
        for (const trap of [...t.traps]) {
          // checkTraps runs at endDay BEFORE the day increments, so the end-of-day
          // check on the set day IS tomorrow's dawn — the "check it tomorrow"
          // promise. Only skip traps whose setDay is in the future (defensive).
          if (trap.setDay > this.state.scholar.day) continue;
          const recipe = this.data.recipes.find(r => r.id === trap.recipeId);
          // 40% chance per day (if the animal is here).
          // poisoner/scarecrow: better bait, better lies. Multiplies the odds.
          // BINOCULARS (Steve 2026-10-05): "sometimes it's dinner." You spot
          // game trails — +15% trap catch.
          let trapChance = Math.min(0.95, this.modTarget('hunt.trap_catch', 0.4));
          if (this.hasItem('binoculars')) trapChance = Math.min(0.95, trapChance + 0.15);
          if (Math.random() < trapChance) {
            const catchId = recipe.catches[Math.floor(Math.random() * recipe.catches.length)];
            const animal = this.data.animals.find(a => a.id === catchId);
            // FOOD REALITY: trapped game is a carcass too — clean it, don't just eat it.
            this.state.scholar.inventory.push(this.foodCarcass(animal, animal.calories, this.state.scholar.day, 'trapped'));
            // a body in hand teaches you what it was — same as a kill.
            try { if (this.encIdentifyAnimal) this.encIdentifyAnimal(catchId); } catch (e) {}
            this.say(`Your ${recipe.name} ${dirPhrase(x, y)} caught a ${animal.name}! About ${animal.calories} kcal on the bone — clean it quickly (knife).`);
            trap.uses -= 1;
            if (trap.uses <= 0) {
              this.say(`The ${recipe.name} broke. You\\'ll need another.`);
              t.traps = t.traps.filter(x => x !== trap);
            } else {
              trap.setDay = this.state.scholar.day; // reset, check again tomorrow
            }
          }
        }
      }
    },

    // GILL NET (Steve 2026-10-05): passive fishing. Set it in water, check it
    // with the traps — a net works while you sleep. Honest tackle, not text.
    setNet() {
      if (this.over) return null;
      if (!this.hasItem('gill_net')) { this.say('You need a gill net.'); return null; }
      const t = this.playerTile();
      if (t.type !== 'creek' && t.type !== 'wetland' && t.type !== 'pond') {
        this.say('Nets need water — a creek, wetland, or pond.');
        return null;
      }
      t.nets = t.nets || [];
      const mx = this.state.scholar.mx ?? 4, my = this.state.scholar.my ?? 4;
      t.nets.push({ mx, my, setDay: this.state.scholar.day });
      this.consumeItem('gill_net', 1);
      this.say('You stake the gill net across the current. Check it tomorrow.');
      return this.tickAction(16) || this.status();
    },
    checkNets() {
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const t = this.tileAt(x, y);
        if (!t.nets || !t.nets.length) continue;
        for (const net of [...t.nets]) {
          if (net.setDay > this.state.scholar.day) continue;
          if (Math.random() < 0.35) {
            const kcal = 300 + Math.floor(Math.random() * 300);
            const animal = (this.data.animals || []).find(a => a.id === 'fish') || { id: 'fish', name: 'fish', calories: kcal };
            this.state.scholar.inventory.push(this.foodCarcass(animal, kcal, this.state.scholar.day, 'netted'));
            const px = this.map.px, py = this.map.py;
            const where = (x === px && y === py) ? 'here' : 'elsewhere';
            this.say(`Your gill net ${where} caught a fish! About ${kcal} kcal — clean it quickly (knife).`);
          }
          net.setDay = this.state.scholar.day; // check again tomorrow
        }
      }
    },
    // GENESIS SEED (Steve 2026-10-05): alien loot that works. Plant it — it
    // grows into a food source yielding 500 kcal/day for 10 days (5000 total,
    // as promised). Yield goes to your pack if you're there, haven pantry if
    // planted at home. Honest alien agriculture.
    plantGenesis() {
      if (this.over) return null;
      if (!this.hasItem('genesis_seed')) { this.say('You need a genesis seed.'); return null; }
      const t = this.playerTile();
      if ((t.genesis || {}).daysLeft > 0) { this.say('A genesis crop already grows here.'); return null; }
      this.consumeItem('genesis_seed', 1);
      t.genesis = { daysLeft: 10, plantedDay: this.state.scholar.day };
      this.say('You press the seed into the dirt. It hums — actually hums — and splits open. Something alien is growing.');
      this.audioEvent('genesis_plant');
      return this.tickAction(16) || this.status();
    },
    checkGenesis() {
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const t = this.tileAt(x, y);
        if (!t.genesis || t.genesis.daysLeft <= 0) continue;
        t.genesis.daysLeft -= 1;
        const kcal = 500;
        const atHaven = (x === 0 && y === 0);
        const px = this.map.px, py = this.map.py;
        if (x === px && y === py) {
          this.state.scholar.inventory.push({ name: 'Genesis fruit', kcalEach: kcal, units: 1, spoilDay: this.state.scholar.day + 3, safe: true, kg: 0.5, unit: 'fruit' });
          this.say(`The genesis crop fruits — ${kcal} kcal, strange and sweet. (+1 to your pack)`);
        } else if (atHaven) {
          const v = this.state.village;
          v.pantryKcal = (v.pantryKcal || 0) + kcal;
          this.say(`The haven genesis crop yielded ${kcal} kcal to the pantry.`);
        }
        if (t.genesis.daysLeft <= 0) {
          this.say('The genesis crop withers, its ten days done. 5000 kcal, as promised.');
          t.genesis = null;
        }
      }
    },
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
        this.refreshItemNames(pid);
        const plant = this.data.plants.find(p => p.id === pid);
        this.say(`\u2605 Learned: ${plant.name} (Level ${level}). ${plant.knowledgeLevels[String(level)]}`);
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
      // KNOWLEDGE TAXONOMY: books can unlock skills too, not just plants.
      // Jackpot moments — a book is a vein of knowledge.
      const skillUnlocks = this.jackpotBook(book);
      if (skillUnlocks) {
        this.say(`📚 This book taught you skills, not just facts. Jackpot.`);
      }
      // remove the book (you've absorbed it)
      this.state.scholar.inventory = this.state.scholar.inventory.filter(i => i.bookId !== bookId);
      // ACTION CLOCK: reading is 2 ticks (time-only — minds, not muscles).
      this.tickAction(2);
      return true;
    },

    // give food: the fastest way to earn trust. sharing is the social contract.
    // edibleCount: how many distinct edible stacks are in the pack.
    // Same definition as giveFood: kcalEach > 0, not bonded, not spoiled.
    edibleCount() {
      const day = this.state.scholar.day;
      return (this.state.scholar.inventory || []).filter(i =>
        (i.kcalEach || 0) > 0 && (i.units || 0) > 0 && !i.bonded &&
        !(i.spoilDay !== undefined && i.spoilDay <= day)).length;
    },

    giveFood(vid) {
      const v = this.data.villagers.find(x => x.id === vid) || this.data.background_survivors.find(x => x.id === vid);
      if (!v) return null;
      // find food in inventory: ANY edible item — foraged plants (plantId),
      // packed food (itemId), cooked meals. Same definition as eating:
      // kcalEach > 0. Not bonded relics, not spoiled.
      const day = this.state.scholar.day;
      const food = this.state.scholar.inventory.find(i =>
        (i.kcalEach || 0) > 0 && (i.units || 0) > 0 && !i.bonded &&
        !(i.spoilDay !== undefined && i.spoilDay <= day));
      if (!food) { this.say("You have no food to give."); return null; }
      food.units -= 1;
      if (food.units <= 0) this.state.scholar.inventory = this.state.scholar.inventory.filter(i => i.units > 0);
      const trust = (this.state.village.trust && this.state.village.trust[vid]) || 10;
      const newTrust = Math.min(100, trust + 12);
      if (this.state.village.trust) this.state.village.trust[vid] = newTrust;
      // ALIVE: they remember. hunger eases. an answered ask is gratitude.
      const req = (this.state.village.requests || {})[vid];
      if (req && req.type === 'food') {
        delete this.state.village.requests[vid];
        this.remember(vid, 'gift', 'answered their hunger');
        this.say(`${this.displayName(vid)} eats like it's the first time. "Thank you," they say, quiet. "I won't forget this."`);
      } else {
        this.remember(vid, 'gift', 'unasked-for food');
      }
      this.npcNeeds(vid).hunger = Math.max(0, this.npcNeeds(vid).hunger - 60);
      this.say(`You give ${this.displayName(vid)} some ${food.name}. They look at you differently now.`);
      this.observe('give_food', { target: vid });
      try { this.checkPromises('food'); } catch (e) {}
      // ACTION CLOCK: a handoff is 1 tick (time-only — the food is the real cost).
      this.tickAction(1);
      return true;
    },

    // ============ THEFT & INTIMIDATION (brawler verbs) ============
    // Steve's rule: theft allowed, socially punished. Violence desperate and
    // traumatic, not power fantasy. Both are deliberate choices with real
    // costs (time + calories) and social consequences via gossip/justice.
    // Victims carry their daily ration (packKcal): hidden until stolen.
    // Nobody sees a number; they feel the hunger when it's gone.

    // packKcal: what this person is carrying today (kcal of rations).
    // Reseeds at dawn. Drawn from their share — the village feeds people.
    packKcal(vid) {
      const v = this.state.village;
      v.pack = v.pack || {};
      const today = this.state.scholar.day;
      let p = v.pack[vid];
      if (!p || p.day !== today) {
        const need = this.npcNeeds(vid);
        const temp = this.npcTemper(vid);
        // The hungry carry less; the bold stash more. Roughly a day of food.
        const base = 800 + Math.random() * 500 - (need.hunger || 0) * 3 + (temp === 'bold' ? 150 : 0);
        p = v.pack[vid] = { day: today, kcal: Math.max(200, Math.round(base)) };
      }
      return p.kcal;
    },
    packSpend(vid, kcal) {
      const v = this.state.village;
      v.pack = v.pack || {};
      const p = v.pack[vid];
      if (!p || p.day !== this.state.scholar.day) this.packKcal(vid);
      v.pack[vid].kcal = Math.max(0, v.pack[vid].kcal - kcal);
    },

    // stealFrom: rifle their pack while they're not looking.
    // One deliberate action; the drama is in detection, not confirmation.
    // Costs 1 tick (time + calories — quick hands are still work).
    stealFrom(vid) {
      if (this.tbfight) { this.say('Not in the middle of a fight.'); return false; }
      const v = this.state.village;
      if (!(v.roster || []).includes(vid) || vid === this.villagerId) return false;
      const dname = this.displayName(vid);
      const pack = this.packKcal(vid);
      if (pack < 100) { this.say(`${dname} has nothing worth taking. Their pack is as empty as yours.`); return false; }
      // The take: a few handfuls, 300-600 kcal. You can't carry their whole day.
      const take = Math.min(pack, 300 + Math.round(Math.random() * 300));
      // Detection: watchful people watch. Night hides you.
      const temp = this.npcTemper(vid);
      let chance = 0.35;
      if (temp === 'cautious') chance += 0.20;
      else if (temp === 'prickly' || temp === 'bold') chance += 0.10;
      if (this.dayPart === 3) chance -= 0.15; // night
      if (this.isFollower && this.isFollower(vid)) chance += 0.10; // close quarters
      chance = Math.max(0.05, Math.min(0.9, chance));
      // ACTION CLOCK: quick hands, 1 tick.
      this.tickAction(1);
      const units = Math.max(1, Math.round(take / 150));
      const addStolen = () => {
        const day = this.state.scholar.day;
        const inv = this.state.scholar.inventory;
        const stack = inv.find(i => i.stolen && !i.bonded && !(i.spoilDay !== undefined && i.spoilDay <= day));
        if (stack) stack.units += units;
        else inv.push({ name: 'Stolen rations', kcalEach: 150, units, stolen: true, spoilDay: day + 3, desc: 'Someone is going to miss these.' });
      };
      if (Math.random() < chance) {
        // CAUGHT. Hands in the pack. No deniability.
        this.say(`🤏 Your hand is in ${dname}'s pack when their eyes find it. The silence that follows is worse than shouting.`);
        try { this.remember(vid, 'caught_you_stealing', 'hands in their pack'); } catch (e) {}
        this.bumpTrust(vid, -35);
        try { this.observe('theft', { target: vid }); } catch (e) {}
        try { this.recordCrime('theft', { victim: vid, caught: true }); } catch (e) {}
        this.say('You let go. Whatever you were reaching for stays where it was.');
        return 'caught';
      }
      // Unseen. The food is yours now — but packs get noticed.
      // (Spend happens here, not before the roll: getting caught means you
      // let go and the food stays where it was.)
      this.packSpend(vid, take);
      // Their food is gone. They'll feel the hunger even before they know why.
      this.npcNeeds(vid).hunger = Math.min(100, (this.npcNeeds(vid).hunger || 0) + Math.round(take / 25));
      addStolen();
      v.packTheft = v.packTheft || {};
      v.packTheft[vid] = { day: this.state.scholar.day, part: this.dayPart, kcal: take };
      this.say(`🤏 ${dname} is looking the other way. Their loss is ${units} handfuls of rations. Your hands are steady. Your stomach isn't.`);
      return 'unseen';
    },

    // The victim notices the missing food later — at the next day part.
    // Hunger makes people inventory their day. Suspicion points at you,
    // but the village only KNOWS if someone saw.
    theftNoticeSweep() {
      const v = this.state.village;
      if (!v.packTheft) return;
      const today = this.state.scholar.day, part = this.dayPart;
      for (const vid of Object.keys(v.packTheft)) {
        const t = v.packTheft[vid];
        if (t.noticed) continue;
        if (t.day < today || (t.day === today && t.part < part)) {
          t.noticed = true;
          const dname = this.displayName(vid);
          this.say(`😠 ${dname} is going through their pack. Again. Slower this time. "My rations. Someone took my rations." Their eyes keep finding you.`);
          this.bumpTrust(vid, -15);
          try { this.remember(vid, 'suspects_you_stealing', 'their rations went missing'); } catch (e) {}
          try { this.recordCrime('theft', { victim: vid, caught: false }); } catch (e) {}
          try { this.seedGossip('theft', { honest: -15, generous: -10 }, [vid]); } catch (e) {}
        }
      }
    },

    // intimidate: "Give me your food." A deliberate social act — two-tap in UI.
    // Costs 2 ticks (confrontation is work). Outcome runs on temperament:
    // the fearful yield, the steady refuse, the bold push back — sometimes swinging.
    intimidate(vid) {
      if (this.tbfight) { this.say('Not in the middle of a fight.'); return false; }
      const v = this.state.village;
      if (!(v.roster || []).includes(vid) || vid === this.villagerId) return false;
      const dname = this.displayName(vid);
      const temp = this.npcTemper(vid);
      const pack = this.packKcal(vid);
      this.say(`👊 You step into ${dname}'s space. "Your food. Now." It doesn't sound like you. That's the point.`);
      this.tickAction(2);
      const demand = Math.min(pack, 400 + Math.round(Math.random() * 300));
      const handOver = () => {
        this.packSpend(vid, demand);
        const units = Math.max(1, Math.round(demand / 150));
        const day = this.state.scholar.day;
        const inv = this.state.scholar.inventory;
        const stack = inv.find(i => i.stolen && !i.bonded && !(i.spoilDay !== undefined && i.spoilDay <= day));
        if (stack) stack.units += units;
        else inv.push({ name: 'Taken rations', kcalEach: 150, units, stolen: true, spoilDay: day + 3, desc: 'Taken, not given. You know the difference.' });
        this.npcNeeds(vid).hunger = Math.min(100, (this.npcNeeds(vid).hunger || 0) + Math.round(demand / 25));
      };
      const markBully = () => {
        try { this.observe('intimidation', { target: vid }); } catch (e) {}
        try { this.recordCrime('intimidation', { victim: vid }); } catch (e) {}
        try { this.remember(vid, 'you_threatened', 'demanded their food'); } catch (e) {}
      };
      if (temp === 'cautious' || temp === 'withdrawn') {
        // BREAKING POINT (Steve 2026-10-05): shake down the same terrified
        // person too often and they stop yielding. Cornered animals do one of
        // two things: snap, or run. The second shakedown telegraphs it — the
        // player is warned, and choosing to push past the warning is on them.
        const day = this.state.scholar.day;
        const recentThreats = (((v.memory || {})[vid] || [])
          .filter(m => m.t === 'you_threatened' && day - (m.day || 0) <= 3)).length;
        const curFear = (this.npcNeeds(vid).fear || 0);
        if (recentThreats >= 2 || curFear >= 95) {
          if (Math.random() < 0.5) {
            // SNAP: they swing. Desperate, not skilled. Nobody wanted this.
            this.say(`😱 Something in ${dname} breaks — not away from you, THROUGH you. A scream with no words in it, and suddenly they're swinging.`);
            this.bumpTrust(vid, -25);
            markBully();
            this.say(`🥊 ${dname} swings. Desperate, not skilled. Nobody wanted this — least of all them.`);
            try { if (this.npcBetrays) this.npcBetrays(vid); } catch (e) {}
            return 'fight';
          }
          // RUN: they leave. Haven isn't worth this.
          this.say(`🏃 ${dname} doesn't answer. They just... back away. Then run — into the trees, away from Haven, away from you.`);
          this.say(`Nobody stops them. A few people watched the whole thing happen, and nobody stops them.`);
          this.bumpTrust(vid, -25);
          markBully();
          try { this.seedGossip('bully', { honest: -15, generous: -12 }, [vid]); } catch (e) {}
          try { this.removeVillager(vid, 'fled'); } catch (e) {}
          return 'fled';
        }
        // They yield. Terrified. The village sees.
        if (demand < 100) {
          this.say(`😨 ${dname} empties their pockets with shaking hands. There's almost nothing there. "Please. That's all I have."`);
        } else {
          handOver();
          this.say(`😨 ${dname} doesn't argue. They can't. Their hands shake as they hand it over, and they won't look at you after.`);
        }
        this.npcNeeds(vid).fear = Math.min(100, (this.npcNeeds(vid).fear || 0) + 40);
        this.bumpTrust(vid, -40);
        markBully();
        if (recentThreats >= 1) {
          // telegraphed: the next one breaks them. Their words, on the record.
          this.say(`😨 As they hand it over, ${dname} whispers: "Please. Not again. I'll tell — I'll tell everyone."`);
          try { this.seedGossip('bully', { honest: -12, generous: -10 }, [vid]); } catch (e) {}
        }
        return 'yielded';
      }
      if (temp === 'bold' || temp === 'prickly' || temp === 'intense') {
        // They push back. Some people swing.
        this.say(`😠 ${dname} doesn't step back. "Say that again," they say, very quietly. "Slower."`);
        this.bumpTrust(vid, -25);
        markBully();
        const fear = (this.npcNeeds(vid).fear || 0);
        if (fear < 30 && Math.random() < 0.4 && this.npcBetrays) {
          this.say(`🥊 ${dname} swings first. Desperate, not skilled. Nobody wanted this.`);
          this.npcBetrays(vid);
          return 'fight';
        }
        try { this.seedGossip('bully', { honest: -12, generous: -10, brave: 2 }, [vid]); } catch (e) {}
        this.say(`They hold their ground. The whole village is going to hear about this.`);
        return 'refused';
      }
      // steady / warm: a flat no, and they tell people.
      this.say(`😐 ${dname} looks at you for a long moment. "No," they say. "Ask. Like a person." They walk away. Others saw.`);
      this.bumpTrust(vid, -20);
      markBully();
      try { this.seedGossip('bully', { honest: -10, generous: -8 }, [vid]); } catch (e) {}
      return 'refused';
    },

    // ============ SOCIAL ACTIONS: paths to the content ============
    // Every deep system (goals, reputation, gossip, leadership, conflicts)
    // needs a player-facing verb. Not perpetual buttons — contextual
    // opportunities that appear when they make sense.

    // offerDeal: bribery, but make it human. When someone won't do what you
    // ask, food talks. Costs 1 edible unit. Re-rolls obedience with a bonus.
    // The village notices — deals are honest in a way orders aren't, but
    // rivals read them as buying loyalty.
    offerDeal(vid, task) {
      const v = this.data.villagers.find(x => x.id === vid)
        || (this.data.background_survivors || []).find(x => x.id === vid);
      if (!v) return null;
      const day = this.state.scholar.day;
      const food = this.state.scholar.inventory.find(i =>
        (i.kcalEach || 0) > 0 && (i.units || 0) > 0 && !i.bonded &&
        !(i.spoilDay !== undefined && i.spoilDay <= day));
      if (!food) { this.say("You have nothing to offer."); return null; }
      const tasks = this.delegateTasks();
      if (!tasks[task]) return null;
      // you learned the concept the moment you tried it — refused or not.
      this.discover('deal');
      food.units -= 1;
      if (food.units <= 0) this.state.scholar.inventory = this.state.scholar.inventory.filter(i => i.units > 0);
      const first = this.displayName(vid);
      // the deal sweetens obedience: +30 effective trust for this check
      const trust = ((this.state.village.trust || {})[vid] || 10) + 30;
      const t = this.state.village.trust || (this.state.village.trust = {});
      const reluctant = trust < 40 && Math.random() < 0.25;
      if (reluctant) {
        this.say(`${first} takes the ${food.name}, weighs it in their hand. "Still no. But... ask me tomorrow." The food is gone. The answer isn't.`);
        this.remember(vid, 'deal_refused', 'took food, still refused ' + task);
        this.observe('deal', { target: vid, refused: true });
        this.save();
        return { ok: false, refused: true };
      }
      t[vid] = Math.min(100, trust);
      const vv = this.state.village;
      vv.assignments = vv.assignments || {};
      vv.assignments[vid] = { task, assignedDay: this.state.scholar.day, assignedPart: this.dayPart, via: 'deal' };
      this.say(`${first} looks at the ${food.name}, then at you. "...Fine. But we're square after this."`);
      this.remember(vid, 'deal', 'accepted food for ' + task);
      this.observe('deal', { target: vid, task });
      this.notePlaystyle('leader'); this.notePlaystyle('social');
      this.socialTick(vid);
      this.save();
      return { ok: true };
    },

    // appealToGoal: frame the request through what THEY want. Requires knowing
    // their goal (post-System display, or learned via askAbout). Alignment
    // between goal and task determines the bonus.
    // goal->task affinity: which goals resonate with which tasks.
    goalTaskAffinity(goal, task) {
      const map = {
        feed: { forage: 3, hunt: 3, water: 2 },
        protect: { patrol: 3, hunt: 1 },
        prove: { forage: 2, hunt: 2, wood: 2, patrol: 2, scout: 2, water: 2 },
        survive: { forage: 2, hunt: 2, water: 2, wood: 1 },
        belong: { forage: 1, wood: 1, water: 1 },
        heal: { forage: 1, water: 1 },
        lead: { patrol: 1, scout: 2 },
        understand: { scout: 3, forage: 1 },
      };
      return ((map[goal] || {})[task]) || 0;
    },
    appealToGoal(vid, task) {
      const goal = this.npcGoal(vid);
      if (!goal) { this.say("You don't know what they want yet."); return null; }
      const want = this.goalWant(vid);
      const first = this.displayName(vid);
      const aff = this.goalTaskAffinity(goal, task);
      const tasks = this.delegateTasks();
      if (!tasks[task]) return null;
      const ob = this.checkObedience(vid);
      // appeal adds effective trust: 10 + 10 per affinity point
      const bonus = 10 + aff * 10;
      const trust = ((this.state.village.trust || {})[vid] || 10) + bonus;
      // framing a request through what they want — you learn this by doing it.
      this.discover('appeal');
      const lines = {
        feed: `"Think about it — full bellies. That's what this gets us."`,
        protect: `"This keeps people safe. That's what you want, isn't it?"`,
        prove: `"Show them what you can do. This is your chance."`,
        survive: `"This is how we make it. You know that."`,
        belong: `"This is what belonging looks like — everyone pulling."`,
        heal: `"Help me fix this. Please."`,
        lead: `"Lead by example. They'll follow you on this."`,
        understand: `"You'll learn something out there. I promise."`,
      };
      const line = lines[goal] || `"This matters. You know it does."`;
      if (trust < 40 && Math.random() < 0.3) {
        this.say(`${first} considers it. ${line} "...Not enough. Sorry."`);
        this.observe('appeal', { target: vid, refused: true });
        return { ok: false };
      }
      const t = this.state.village.trust || (this.state.village.trust = {});
      t[vid] = Math.min(100, trust);
      const vv = this.state.village;
      vv.assignments = vv.assignments || {};
      vv.assignments[vid] = { task, assignedDay: this.state.scholar.day, assignedPart: this.dayPart, via: 'appeal' };
      this.say(`${first} nods slowly. ${line} "Alright. For that reason — alright."`);
      this.remember(vid, 'appeal', 'moved by appeal to goal: ' + goal);
      this.observe('appeal', { target: vid, task });
      this.notePlaystyle('leader'); this.notePlaystyle('social');
      this.socialTick(vid);
      this.save();
      return { ok: true };
    },

    // askAbout: the conversation verb. Topics unlock content paths.
    // 'goal' -> learn what they want (may reveal goal pre-System)
    // 'gossip' -> "heard anything?" (surfaces gossip they've heard)
    // 'village' -> "how's everyone?" (morale/atmosphere readout)
    askAbout(vid, topic) {
      const v = this.data.villagers.find(x => x.id === vid)
        || (this.data.background_survivors || []).find(x => x.id === vid);
      if (!v) return null;
      const first = this.displayName(vid);
      const known = this.state.systemArrived || this.nameKnown(vid);
      const goal = this.npcGoal(vid);
      const want = this.goalWant(vid);
      this.state.scholar.kcal = Math.max(0, (this.state.scholar.kcal || 0) - 10);
      if (topic === 'goal') {
        // learning their goal: once known, it's stored and usable
        const vg = this.state.village;
        vg.goalsKnown = vg.goalsKnown || {};
        const already = vg.goalsKnown[vid];
        vg.goalsKnown[vid] = goal;
        const goalLines = {
          lead: `"Someone has to keep us together. Might as well be someone who cares."`,
          family: `"I had people. Out there. I keep thinking I'll see them on the road."`,
          prove: `"I need to matter here. I need someone to see that I matter."`,
          alone: `"I just... need some air that nobody else is breathing."`,
          feed: `"Nobody goes hungry if I can help it. That's the whole thing."`,
          understand: `"I need to know what happened. Not knowing is worse than the worst answer."`,
          protect: `"As long as I'm standing, nobody here gets hurt. That's the deal I made with myself."`,
          escape: `"This place isn't it. There's somewhere better. I can feel it."`,
          remember: `"I was someone, before. I need to hold onto that."`,
          belong: `"I just want to be part of something again."`,
          survive: `"Whatever it takes. I'm not dying out here."`,
          heal: `"Too much is broken. I fix what I can."`,
        };
        const line = goalLines[goal] || `"I don't know. Getting through today, I guess."`;
        this.say(`${first}: ${line}`);
        if (!already && want) this.say(`(You learned what ${known ? first : 'they'} want: ${want}.)`);
        this.remember(vid, 'shared_goal', goal || 'unknown');
        return { ok: true, goal };
      }
      if (topic === 'gossip') {
        // PEOPLE TALK ABOUT EACH OTHER: before the generic gossip, NPCs share
        // what they know about specific villagers — and sometimes what they
        // say contradicts a lie. (npcGossipAbout lives in truth.js; guarded.)
        // This is the village as an information network, not a broadcast.
        try {
          if (this.npcGossipAbout && Math.random() < 0.5) {
            const others = (this.state.village.roster || []).filter(id =>
              id !== vid && id !== this.villagerId);
            if (others.length) {
              // DETECTIVE BIAS: you ask about people you've actually talked
              // to. If you've heard claims about someone, they're the ones
              // on your mind — the village answers the question you mean.
              let pool = others;
              try {
                const interviewed = others.filter(id =>
                  (this.getClaims(id, 'occupation') || []).length ||
                  (this.getClaims(id, 'origin') || []).length);
                if (interviewed.length) pool = interviewed;
              } catch (e) {}
              const target = pool[Math.floor(Math.random() * pool.length)];
              const gg = this.npcGossipAbout(vid, target);
              if (gg && gg.line) {
                this.say(`${first} lowers their voice. ${gg.line}`);
                return { ok: true, gossipAbout: target };
              }
            }
          }
        } catch (e) {}
        // DARK GOSSIP: the village talks about the weird one. Unease for the
        // benign, quiet warnings for the malicious — and some defend them.
        // ("He's just different." The most chilling sentence in the village.)
        const darkIds = (this.state.village.roster || []).filter(id =>
          id !== vid && id !== this.villagerId && this.npcDark(id));
        if (darkIds.length && Math.random() < 0.45) {
          const did = darkIds[Math.floor(Math.random() * darkIds.length)];
          const dk = this.npcDark(did);
          const dname = this.displayName(did);
          let line;
          const roll = Math.random();
          if (dk.kind === 'benign') {
            const unease = [
              `"You ever notice ${dname}? ...I don't know what to make of that. Nobody does."`,
              `"I'm not saying there's anything wrong with ${dname}. I'm just saying I sleep better with them on the other side of the fire."`,
              `"Someone should talk to ${dname}. Not me, though."`,
            ];
            const defend = [
              `"Leave ${dname} alone. They're harmless. Weird, but harmless."`,
              `"${dname}? They're fine. We're all a little broken right now."`,
              `"People need to stop whispering about ${dname}. They've done nothing wrong."`,
            ];
            line = roll < 0.65
              ? unease[Math.floor(Math.random() * unease.length)]
              : defend[Math.floor(Math.random() * defend.length)];
          } else {
            const warn = [
              `"Watch yourself around ${dname}. I can't tell you why. Just... watch."`,
              `"${dname} asked me about you. A lot of questions. Friendly ones. Too friendly."`,
              `"Something's off with ${dname}. I mentioned it to the others and they went quiet, which tells you everything."`,
            ];
            const defend = [
              `"${dname}? You're imagining things. They're perfectly pleasant."`,
              `"People are paranoid. ${dname} hasn't done a thing."`,
            ];
            line = roll < 0.7
              ? warn[Math.floor(Math.random() * warn.length)]
              : defend[Math.floor(Math.random() * defend.length)];
          }
          this.say(`${first} lowers their voice. ${line}`);
          try {
            if (this.journalNote) this.journalNote('people', did,
              dk.kind === 'benign'
                ? `People are uneasy about them. Nobody can say why, exactly.`
                : `Someone warned me about them. Quietly. Like it cost them to say it.`);
          } catch (e) {}
          return { ok: true, darkGossip: true };
        }
        const heard = (this.state.village.gossip || []).filter(g => (g.heard || []).includes(vid));
        if (!heard.length) {
          const idle = [`"Quiet lately. Too quiet, maybe."`, `"Nothing new. Which is new, if you think about it."`, `"People are keeping to themselves."`];
          this.say(`${first}: ${idle[Math.floor(Math.random() * idle.length)]}`);
          return { ok: true, none: true };
        }
        // Salience order: a scandal about YOU jumps the queue (it's what
        // they'd lead with), then rumors about other people, then the
        // freshest remaining word. {who} dims mark gossip about another
        // villager — share the rumor itself, never misattribute it to you.
        const isWho = (g) => g.dims && g.dims.who && g.dims.who !== this.villagerId;
        const isNeg = (g) => !isWho(g) && Object.entries(g.dims || {}).some(([k, val]) => typeof val === 'number' && val < -3);
        const negHeard = heard.filter(isNeg);
        if (negHeard.length) {
          const g = negHeard[negHeard.length - 1];
          this.say(`${first} lowers their voice. "People are saying things. About you. ...I'd watch how you act around the fire."`);
          return { ok: true, gossip: g };
        }
        const aboutOther = heard.filter(isWho);
        if (aboutOther.length) {
          const g = aboutOther[aboutOther.length - 1];
          const wname = this.displayName(g.dims.who);
          if (g.action === 'stingy') this.say(`${first} lowers their voice. "Word is ${wname} has been holding back. Keeping the good stuff close."`);
          else if (g.action === 'generous') this.say(`${first}: "People are saying ${wname} has been generous. Sharing around, no questions asked."`);
          else if (g.action === 'departure') this.say(`${first}: "Did you hear? ${wname} just walked away from Haven. Didn't look back."`);
          else this.say(`${first}: "People are talking about ${wname}. Take it for what it's worth."`);
          try {
            if (this.journalNote) this.journalNote('people', g.dims.who,
              g.action === 'stingy' ? `Rumor: they've been holding back, keeping the good stuff close.`
              : g.action === 'generous' ? `Rumor: they've been generous, sharing around.`
              : g.action === 'departure' ? `They walked away from Haven. Nobody knows where they went.`
              : `There's talk about them going around the fire.`);
          } catch (e2) {}
          return { ok: true, gossip: g, aboutOther: g.dims.who };
        }
        // share the freshest remaining gossip, with their distortion
        const g = heard[heard.length - 1];
        const aboutYou = true; // gossip seeded from observe() is always about player actions
        this.say(`${first}: "Word is you're doing right by people. Keep it up."`);
        return { ok: true, gossip: g };
      }
      if (topic === 'village') {
        const vg = this.state.village;
        const bits = [];
        if ((vg.grief || 0) > 0) bits.push("everyone's quiet since the loss");
        if ((vg.cheer || 0) > 0) bits.push("people are in good spirits");
        const hungry = (vg.roster || []).filter(id => id !== this.villagerId && (this.npcNeeds(id).hunger || 0) > 70).length;
        if (hungry > 2) bits.push(`${hungry} people are going hungry`);
        const scared = (vg.roster || []).filter(id => id !== this.villagerId && (this.npcNeeds(id).fear || 0) > 70).length;
        if (scared > 2) bits.push("people are scared");
        const heat = Object.values(vg.heat || {}).filter(h => h > 0).length;
        if (heat) bits.push("there's tension about who's in charge");
        const line = bits.length ? bits.join('; ') + '.' : "holding together, somehow.";
        this.say(`${first} looks around. "Honestly? ${line}"`);
        this.socialTick(vid);
        return { ok: true };
      }
      if (topic === 'tellbeast') {
        // You tell them what you saw out there. The news starts traveling —
        // tell enough people (or let gossip work) and the village starts
        // arguing about a name.
        const cands = Object.entries(this.state.codex.monsters || {})
          .filter(([id, e]) => e.reported && !e.namingKicked);
        if (!cands.length) {
          this.say(`${first} shrugs. "Seen what? It's been quiet out there."`);
          return { ok: true };
        }
        const [mid, e] = cands[0];
        const mdef = (this.data.monsters || []).find(m => m.id === mid) || {};
        e.knowers = e.knowers || [];
        if (!e.knowers.includes(vid)) e.knowers.push(vid);
        this.say(`${first} goes still. "${mdef.unknown || 'That thing'}. You're sure." They'll tell the others — word travels fast around a fire.`);
        this.socialTick(vid);
        this.monsterNewsCheck(mid);
        return { ok: true };
      }
      if (topic === 'namebeast') {
        // The naming argument, up close. The player weighs in — backing a
        // name counts double. Social play, not a menu.
        const cands = Object.entries(this.state.codex.monsters || {})
          .filter(([id, e]) => e.namingKicked && !e.villageName);
        if (!cands.length) {
          this.say(`${first} shrugs. "Name what? We haven't seen anything worth naming lately."`);
          return { ok: true };
        }
        const [mid, e] = cands[0];
        const mdef = (this.data.monsters || []).find(m => m.id === mid) || {};
        const votes = {};
        for (const [pvid, name] of Object.entries(e.proposals || {})) {
          votes[name] = votes[name] || { n: 0, backers: [] };
          votes[name].n += (pvid === ((this.state.scholar || {}).villagerId || 'player') || pvid === 'player') ? 2 : 1;
          votes[name].backers.push(this.firstRef(pvid));
        }
        const opts = Object.entries(votes).map(([name, v]) => ({ name, n: v.n, backers: v.backers }));
        this.say(`${first} leans in. "That thing — ${mdef.unknown || 'you know the one'}. We're naming it. So far: ${opts.map(o => `"${o.name}" (${o.backers.join(', ')})`).join('; ')}. What's your vote?"`);
        this.socialTick(vid);
        return { ok: true, naming: { mid, descriptor: mdef.unknown || 'the beast', options: opts.map(o => o.name) } };
      }
      return null;
    },
    // goalKnown: post-System it's displayed; pre-System it's learned via askAbout
    goalKnown(vid) {
      if (this.state.systemArrived) return true;
      return !!((this.state.village.goalsKnown || {})[vid]);
    },

    // DISCOVERIES: social mechanics are learned through conversation, not
    // menus. Steve's rule: "Not a default action but something to discover
    // via intentional conversation." Once you've done it once — traded
    // knowledge, taught someone, made a promise, cut a deal — you know the
    // concept, and it becomes proactively available in conversation.
    // Before that, NPCs can seed it by bringing it up themselves.
    discover(kind) {
      const v = this.state.village;
      v.discoveries = v.discoveries || {};
      if (v.discoveries[kind]) return false;
      v.discoveries[kind] = { day: this.state.scholar.day };
      const notes = {
        trade: '💡 Learned: some people trade knowledge — for food, favors, or knowledge in return. Bring it up when you talk.',
        teach: '💡 Learned: you can teach people what you know, if you talk it through with them.',
        promise: "💡 Learned: you can promise to help with what someone wants. They'll remember — keep it or break it.",
        party: '💡 Learned: PARTY SYSTEM. You can invite people to travel and fight beside you. Ask — in conversation, like a person.',
        deal: "💡 Learned: when someone won't do what you ask, food can change minds. It's not bribery if it's honest. (It's bribery.)",
        appeal: "💡 Learned: frame a request through what THEY want, and it lands differently.",
      };
      const note = notes[kind] || '';
      if (note) this.say(note);
      try { this.remember(this.villagerId, 'discovery_' + kind, note); } catch (e) {}
      this.save();
      return true;
    },
    hasDiscovered(kind) {
      return !!((this.state.village.discoveries || {})[kind]);
    },

    // comfort: for the scared and the grieving. No cost but time and presence.
    // Reduces fear, eases grief-adjacent loneliness. Builds real trust.
    comfort(vid) {
      const mood = this.npcMood(vid);
      if (mood !== 'scared' && mood !== 'grieving' && mood !== 'hungry') {
        this.say("They don't need comforting right now.");
        return null;
      }
      const first = this.displayName(vid);
      const n = this.npcNeeds(vid);
      n.fear = Math.max(0, (n.fear || 0) - 40);
      n.social = Math.max(0, (n.social || 0) - 20);
      const t = this.state.village.trust || (this.state.village.trust = {});
      t[vid] = Math.min(100, (t[vid] || 10) + 8);
      const lines = [
        `You sit with ${first} for a while. Don't say much. Sometimes that's the whole thing.`,
        `"Hey. You're okay. We're okay." ${first} breathes out, shaky. "Yeah. Yeah, okay."`,
        `${first} leans into the quiet for a bit. When they look up, something's unclenched.`,
      ];
      this.say(lines[Math.floor(Math.random() * lines.length)]);
      this.remember(vid, 'comforted', 'sat with them when scared');
      this.observe('comfort', { target: vid });
      this.notePlaystyle('social');
      try { this.checkPromises('heal'); } catch (e) {}
      this.socialTick(vid);
      this.save();
      return { ok: true };
    },

    // makeAmends: reputation repair. When they think poorly of you on some
    // axis, you can own it. Partial repair — words aren't deeds, but they're a start.
    worstRepAxis(vid) {
      const r = this.repOf(vid);
      let worst = null, val = 0;
      for (const [k, v2] of Object.entries(r)) if (v2 < val) { val = v2; worst = k; }
      return worst && val <= -15 ? { axis: worst, val } : null;
    },
    makeAmends(vid) {
      const w = this.worstRepAxis(vid);
      if (!w) { this.say("They don't hold anything against you."); return null; }
      const first = this.displayName(vid);
      const axisLines = {
        generous: `"I know I've been holding back. That's changing."`,
        brave: `"I ran when I shouldn't have. I'm sorry."`,
        honest: `"I've been playing angles. You deserved straight."`,
        competent: `"I've been useless and I know it. I'm trying to be better."`,
      };
      const r = this.repOf(vid);
      r[w.axis] = Math.min(0, r[w.axis] + 12); // partial — deeds finish the job
      const t = this.state.village.trust || (this.state.village.trust = {});
      t[vid] = Math.min(100, (t[vid] || 10) + 4);
      this.say(`You find ${first}. ${axisLines[w.axis]} They study you for a long moment, then nod once.`);
      this.remember(vid, 'amends', 'apologized for ' + w.axis);
      this.observe('amends', { target: vid });
      this.notePlaystyle('social');
      this.socialTick(vid);
      this.save();
      return { ok: true, axis: w.axis };
    },

    // mediate: player-initiated conflict resolution. The automatic path needs
    // 55+ trust with both; doing it yourself needs 40+ and a conversation.
    // Success eases tension; failure can make it worse.
    mediateConflict(vid) {
      const v = this.state.village;
      const c = (v.conflicts || []).find(x => !x.resolved && x.known && (x.a === vid || x.b === vid));
      if (!c) { this.say("There's nothing to mediate with them."); return null; }
      const other = c.a === vid ? c.b : c.a;
      const ta = (v.trust || {})[vid] || 10, tb = (v.trust || {})[other] || 10;
      if (ta < 40 || tb < 40) {
        this.say(`They don't trust you enough yet to let you into this. (Need 40+ with both.)`);
        return null;
      }
      const first = this.displayName(vid), oname = this.displayName(other);
      // your honesty and competence matter here, as THEY see it
      const r = this.repOf(vid);
      const skill = (r.honest >= 0 ? 10 : 0) + (r.competent >= 0 ? 10 : 0) + 20;
      if (Math.random() * 100 < skill + ta * 0.3) {
        c.tension = Math.max(0, (c.tension || 50) - 35);
        if (c.tension <= 10) {
          c.resolved = true; c.tension = 0;
          this.say(`You sit them both down. It's awkward. It's hard. But ${first} and ${oname} actually talk — really talk — for the first time in longer than anyone admits. Something loosens.`);
        } else {
          this.say(`${first} listens. Doesn't agree to everything, but listens. "${oname} and I... we'll figure it out. Thanks for trying." The air is a little clearer.`);
        }
        const t = v.trust || (v.trust = {});
        t[vid] = Math.min(100, (t[vid] || 10) + 6); t[other] = Math.min(100, (t[other] || 10) + 6);
        this.remember(vid, 'mediated', 'helped ease conflict with ' + other);
        this.observe('mediate', { target: vid });
      } else {
        c.tension = Math.min(100, (c.tension || 50) + 10);
        this.say(`It goes badly. ${first} shuts down halfway through. "${oname} sent you, didn't they?" Nothing is clearer than before. It's worse.`);
        this.observe('mediate', { target: vid, failed: true });
      }
      this.notePlaystyle('social'); this.notePlaystyle('leader');
      this.socialTick(vid);
      this.save();
      return { ok: true };
    },

    // rally: the speech. Village-wide, once per day. Cools contender heat,
    // lifts morale, reminds everyone why you're worth following.
    rallyVillage() {
      const v = this.state.village;
      const today = this.state.scholar.day + ':' + this.dayPart;
      if (v.lastRally === today) { this.say("You've said your piece for now."); return null; }
      v.lastRally = today;
      const heatIds = Object.keys(v.heat || {}).filter(id => (v.heat[id] || 0) > 0);
      for (const id of heatIds) v.heat[id] = Math.max(0, (v.heat[id] || 0) - 2);
      if (v.challenge) {
        // a good speech doesn't end a challenge, but it buys room
        v.challenge.age = Math.max(0, (v.challenge.age || 0) - 2);
      }
      v.cheer = Math.max(v.cheer || 0, 2);
      const t = v.trust || (v.trust = {});
      for (const id of (v.roster || [])) {
        if (id === this.villagerId) continue;
        t[id] = Math.min(100, (t[id] || 10) + 3);
      }
      const lines = [
        `You stand up by the fire. "Listen. I don't have answers. But I have us — and that's more than we had yesterday." People look at each other. Someone nods. It's a start.`,
        `"We're still here," you say, simply. "Every one of us. That counts for something." Quiet. Then someone laughs — surprised, real. The fire feels warmer.`,
        `You talk about what you've built together. Not perfectly, not easily — together. A few people stand a little straighter.`,
      ];
      this.say(lines[Math.floor(Math.random() * lines.length)]);
      this.observe('rally', {});
      this.remember(this.villagerId, 'rally', 'gave a speech');
      this.notePlaystyle('leader'); this.notePlaystyle('social');
      this.socialTick();
      this.save();
      return { ok: true };
    },

    // askSupport: coalition building. Ask someone to back you against a
    // contender. If they agree, contender heat drops and you gain an ally.
    // Their memory records the alliance — allies expect to be treated well.
    askSupport(vid) {
      const v = this.state.village;
      const heatIds = Object.keys(v.heat || {}).filter(id => (v.heat[id] || 0) > 0);
      const chal = v.challenge;
      if (!heatIds.length && !chal) { this.say("There's no challenge to your lead right now."); return null; }
      const target = chal ? chal.cid : heatIds[0];
      const first = this.displayName(vid), tname = this.displayName(target);
      const trust = (v.trust || {})[vid] || 10;
      if (trust < 30) {
        this.say(`${first} shakes their head. "I'm not getting in the middle of that." (Need 30+ trust.)`);
        return null;
      }
      v.heat = v.heat || {};
      v.heat[target] = Math.max(0, (v.heat[target] || 0) - 2);
      v.allies = v.allies || {};
      v.allies[vid] = target; // they stand with you against this contender
      const t = v.trust || (v.trust = {});
      t[vid] = Math.min(100, (t[vid] || 10) + 5);
      this.say(`${first} considers it, then nods. "Yeah. ${tname} doesn't speak for me." You feel the ground firm up under you a little.`);
      this.remember(vid, 'ally', 'backed you against ' + target);
      this.observe('coalition', { target: vid });
      this.notePlaystyle('leader'); this.notePlaystyle('social');
      this.socialTick(vid);
      this.save();
      return { ok: true };
    },

    // yieldChallenge: resolve an active leadership challenge by yielding.
    // The contender runs the domain as task lead — working it every part,
    // building their own base on your behalf. Trust gains; heat resets.
    // (Moved out of the app.js inline handler so the engine path is
    // testable — UI renders the same lines. Behavior identical to the
    // original inline version.)
    yieldChallenge(vid) {
      const v = this.state.village;
      const ch = v.challenge || {};
      const cid = ch.cid || vid;
      const task = ch.task || 'forage';
      const taskName = (this.delegateTasks()[task] || {}).name || task;
      v.taskLeads = v.taskLeads || {};
      v.taskLeads[task] = cid;
      const t = v.trust || (v.trust = {});
      t[cid] = Math.min(100, (t[cid] || 10) + 10);
      v.heat = v.heat || {};
      v.heat[cid] = 0;
      v.challenge = null;
      this.say(`${this.displayName(cid)} nods slowly. "Good call." They start organizing the ${taskName} crews their way.`);
      this.save();
      return { ok: true, result: `You let them lead ${taskName}. They'll work it every part — and build their own base doing it.` };
    },

    // standGround: resolve an active leadership challenge by refusing to
    // yield. They back down — for now. Trust takes a hit; the heat is
    // banked, not gone (they can challenge again).
    standGround(vid) {
      const v = this.state.village;
      const ch = v.challenge || {};
      const cid = ch.cid || vid;
      const t = v.trust || (v.trust = {});
      t[cid] = Math.max(0, (t[cid] || 10) - 5);
      v.heat = v.heat || {};
      v.heat[cid] = 0;
      v.challenge = null;
      this.say(`${this.displayName(cid)} holds your gaze, then looks away. "Fine. Your funeral." This isn't over — but it's quiet. For now.`);
      this.save();
      return { ok: true, result: 'You held your ground.' };
    },

    // promiseHelp: commit to their goal. Tracked. If you follow through
    // (via related actions), big trust. If you ignore it, they remember.
    promiseHelp(vid) {
      const goal = this.npcGoal(vid);
      if (!goal) { this.say("You don't know what they want yet."); return null; }
      const v = this.state.village;
      v.promises = v.promises || {};
      if (v.promises[vid]) { this.say("You already made them a promise. Keep it first."); return null; }
      const want = this.goalWant(vid);
      const first = this.displayName(vid);
      const promiseLines = {
        family: `"I'll watch the roads. If anyone comes through, you'll know."`,
        feed: `"Nobody goes hungry on my watch. That's a promise."`,
        protect: `"I've got your back. That's not just words."`,
        prove: `"I'll find you something that matters. You'll see."`,
        understand: `"We'll figure out what happened. Together."`,
        heal: `"We'll fix what's broken. Starting with what we can."`,
        belong: `"You're one of us. That's not changing."`,
        survive: `"We make it. All of us. That's the deal."`,
      };
      v.promises[vid] = { goal, day: this.state.scholar.day, kept: false };
      this.discover('promise');
      this.say(`${first} looks at you for a long moment. ${promiseLines[goal] || `"I'll help. I mean it."`} Something in them settles — hope is a heavy thing to carry alone.`);
      this.remember(vid, 'promise', 'promised to help: ' + goal);
      const t = v.trust || (v.trust = {});
      t[vid] = Math.min(100, (t[vid] || 10) + 6);
      this.observe('promise', { target: vid });
      this.notePlaystyle('social');
      this.socialTick(vid);
      this.save();
      return { ok: true };
    },
    // checkPromises: called when relevant actions happen. Fulfilling a promise
    // is one of the biggest trust gains in the game. Breaking one (7+ days
    // ignored) is one of the biggest losses.
    checkPromises(kind) {
      const v = this.state.village;
      for (const [vid, p] of Object.entries(v.promises || {})) {
        if (p.kept) continue;
        const age = this.state.scholar.day - (p.day || 0);
        const match = (p.goal === 'feed' && kind === 'food') ||
          (p.goal === 'protect' && kind === 'fight') ||
          (p.goal === 'heal' && kind === 'heal') ||
          (p.goal === 'prove' && kind === 'task') ||
          (p.goal === 'belong' && kind === 'social');
        if (match) {
          p.kept = true;
          const t = v.trust || (v.trust = {});
          t[vid] = Math.min(100, (t[vid] || 10) + 15);
          this.say(`${this.displayName(vid)} catches your eye across the fire. You kept your word. That meant everything. (+15 trust)`);
          this.remember(vid, 'promise_kept', p.goal);
        } else if (age >= 7) {
          p.kept = 'broken';
          const t = v.trust || (v.trust = {});
          t[vid] = Math.max(0, (t[vid] || 10) - 15);
          this.say(`${this.displayName(vid)} doesn't say anything. But they stopped looking at you the way they used to. Promises rot. (-15 trust)`);
          this.remember(vid, 'promise_broken', p.goal);
        }
      }
    },

    // confrontGossip: you've heard gossip (about you, negative). Confront the
    // source. Can clear the air — or confirm their worst suspicions.
    confrontGossip(vid) {
      const heard = (this.state.village.gossip || []).filter(g => (g.heard || []).includes(vid));
      const neg = heard.find(g => Object.entries(g.dims || {}).some(([k, val]) => val < -3));
      if (!neg) { this.say("You haven't heard them spreading anything about you."); return null; }
      const first = this.displayName(vid);
      const r = this.repOf(vid);
      // honesty helps; if they already distrust you it goes badly
      const skill = 30 + (r.honest >= 0 ? 20 : -10) + ((this.state.village.trust || {})[vid] || 10) * 0.3;
      if (Math.random() * 100 < skill) {
        // clear the air: dampen that gossip's dims for this person
        for (const k of Object.keys(neg.dims || {})) if (neg.dims[k] < 0) neg.dims[k] = Math.round(neg.dims[k] * 0.4);
        this.say(`You pull ${first} aside. "I heard what you've been saying." They flush — then, slowly, nod. "Yeah. That wasn't fair. I'm sorry." The story loses its teeth.`);
        this.remember(vid, 'confronted', 'cleared the air about gossip');
        const t = this.state.village.trust || (this.state.village.trust = {});
        t[vid] = Math.min(100, (t[vid] || 10) + 4);
        this.observe('confront', { target: vid, resolved: true });
      } else {
        for (const k of Object.keys(neg.dims || {})) if (neg.dims[k] < 0) neg.dims[k] = Math.round(neg.dims[k] * 1.3);
        this.say(`${first} goes cold. "So now you're interrogating people? That tells me everything." The story gets worse.`);
        this.remember(vid, 'confronted', 'confrontation backfired');
        this.observe('confront', { target: vid, backfired: true });
      }
      this.notePlaystyle('social');
      this.socialTick(vid);
      this.save();
      return { ok: true };
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
          // No SYSTEM messages before arrival — the System doesn't exist yet.
          if (!this.state.systemArrived) continue;
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
        { type: 'bring', plant: 'dandelion', qty: 3, reward: 'pantry', text: `${this.displayName(giver.id)} needs ${3} dandelion. "For tea. For morale. For reasons."` },
        { type: 'visit', tileType: 'creek', reward: 'knowledge', text: `${this.displayName(giver.id)} wants to know what's by the creek. "Just look. Come back and tell me."` },
        { type: 'bring', plant: 'blackberry', qty: 2, reward: 'item', text: `${this.displayName(giver.id)} is craving blackberries. "I'll trade you something good."` },
      ];
      const q = quests[Math.floor(Math.random() * quests.length)];
      q.giver = giver.id; q.giverName = giver.name.split(' ')[0];
      s.activeQuest = q;
      this.say(`📋 ${q.text}`);
    },

    // wake-up speech key from the giver's personality. Nobody understands what's
    // happening — they're just reacting to finding a stranger. Confused, not knowing.
    wakeSpeechKey(char) {
      const p = (char && char.personality) || {};
      const t = p.temperament, c = p.curiosity;
      const r = Math.random();
      // temperament drives, curiosity and chance widen the range —
      // every speech is reachable, nobody is a fixed type.
      if (t === 'warm') return r < 0.7 ? 'warm' : (r < 0.85 ? 'curious' : 'overwhelmed');
      if (t === 'prickly') return r < 0.45 ? 'gruff' : 'suspicious';
      if (t === 'bold') return r < 0.5 ? 'debt' : (r < 0.75 ? 'gruff' : 'curious');
      if (t === 'cautious') return r < 0.4 ? 'scared' : (r < 0.65 ? 'suspicious' : 'overwhelmed');
      if (t === 'steady') return r < 0.55 ? 'practical' : (r < 0.8 ? 'curious' : 'overwhelmed');
      if (c === 'wary') return r < 0.5 ? 'suspicious' : 'overwhelmed';
      return 'overwhelmed';
    },

    // pickRandomVillager: uniform random from a list. No weighting — the
    // wake-up companion, and any future "random villager" picks, use this.
    pickRandomVillager(ids) {
      if (!ids || !ids.length) return null;
      return ids[Math.floor(Math.random() * ids.length)];
    },
    getQuest() {
      // the intro: whoever found you wakes you up. A real roster member —
      // one of the 11 NPCs who gets a grid position and sticks around.
      if (this.state.questGiven) return null;
      const v = this.state.village;
      const npcIds = (v.roster || []).filter(id => id !== this.villagerId);
      if (!npcIds.length) return null;
      // UNIFORM RANDOM (Steve): the waker is as random as anyone else. No
      // weighting by area, origin, or preference — just random. (Perceived
      // bias comes from roster composition, not selection.)
      const giverId = this.pickRandomVillager(npcIds);
      const giver = (v.rosterChars || {})[giverId]
        || (this.data.background_survivors || []).find(b => b.id === giverId)
        || { name: 'Someone', formerOccupation: 'survivor', homeRegion: 'somewhere', personality: {} };
      const first = String(giver.name || 'Someone').split(' ')[0];
      const occ = giver.formerOccupation || 'survivor';
      const origin = giver.homeRegion || 'somewhere';
      const key = this.wakeSpeechKey(giver);
      // THE WAKER DOESN'T NECESSARILY SPEAK ENGLISH. Wire the wake-up
      // through the language system: a zero-English finder wakes you in
      // their own tongue — urgent sounds, gestures, no shared words.
      // (Steve: the person who wakes you doesn't have to speak English.)
      let lines;
      const wakerEnglish = (typeof this.npcEnglishLevel === 'function') ? this.npcEnglishLevel(giverId) : 2;
      if (wakerEnglish === 0 && typeof this.npcNativeLang === 'function') {
        const lang = this.npcNativeLang(giverId);
        const def = this.langDef ? this.langDef(lang) : { icon: '', name: lang };
        const ph = (typeof this.foreignLine === 'function') ? this.foreignLine(giverId, 'openers') : null;
        const r = (ph && typeof this.renderForeign === 'function') ? this.renderForeign(giverId, ph) : null;
        const frag = (typeof this.maybeEnglishFragment === 'function') ? this.maybeEnglishFragment(giverId) : null;
        lines = [
          `Someone is shaking you awake — urgent, insistent. ${def.icon} ${def.name}. Not one word of English.`,
          r ? r.text : 'They speak. You understand none of it.',
        ];
        if (frag) lines.push(`"${frag}" — they grin, proud of the one English they know.`);
        // Names cross every border: they tap their own chest and say it.
        // That's how you learn who found you.
        lines.push(`They tap their own chest: "${first}." A name, at least. Then they point at you, then mime walking — come. You understand that much.`);
        try { this.langExposureGain(giverId, lang, 1); } catch (e) {}
      } else {
        const templates = ((this.data.characterGen || {}).wakeUpSpeeches || {})[key]
          || ((this.data.characterGen || {}).wakeUpSpeeches || {}).overwhelmed || [];
        lines = templates.map(t => String(t)
          .replaceAll('{first}', first).replaceAll('{occ}', occ).replaceAll('{origin}', origin));
      }
      // the finder remembers finding you. small trust bump.
      // the wake-up speech introduces them ("I'm {first}") — that's a meeting.
      v.knownNames = v.knownNames || {}; v.knownNames[giverId] = true;
      v.foundBy = giverId;
      v.trust[giverId] = Math.min(100, (v.trust[giverId] || 10) + 5);
      // the debt-collector's ask is a real quest: bring greens, debt cleared.
      if (key === 'debt' && this.state.scholar) {
        this.state.scholar.activeQuest = {
          type: 'bring', plant: 'dandelion', qty: 3, reward: 'pantry',
          giver: giverId, giverName: first,
        };
      }
      this.state.questGiven = true;
      this.save();
      return { from: first, lines };
    },

    villageAction(kind) {
      const scholar = this.state.scholar;
      if (kind === 'water') {
        // WATER BOTTLES are {liters, quality, source} objects — never assign a
        // bare number here; the status bar stringifies the array and you'd get
        // "[object Object]". (This bit the live build once.)
        scholar.water = scholar.water || [];
        for (let i = 0; i < 4; i++) scholar.water.push({ liters: 1, quality: 'clean', source: 'Haven well' });
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

    // === LEADER PLAYSTYLE: DELEGATION ===
    // "This game is what you want it to be." Some players don't fight.
    // They direct. They assign. They keep people alive and build knowledge.
    // That's a complete playstyle — not a gimped mode.
    //
    // How it works: open a person's sheet → Assign task → they go do it.
    // Assignments resolve at end of the day-part. Competence matters.
    // Trust matters. Danger is real.

    // Task definitions: what you can ask people to do.
    delegateTasks() {
      return {
        forage: { icon: '🌿', name: 'Forage', desc: 'Gather food from the wilds. Safe, steady.', danger: 0 },
        hunt:   { icon: '🏹', name: 'Hunt', desc: 'Hunt animals for meat. Risky — animals fight back.', danger: 1 },
        wood:   { icon: '🪵', name: 'Gather wood', desc: 'Firewood and building wood. Safe.', danger: 0 },
        water:  { icon: '💧', name: 'Fetch water', desc: 'Bring back clean water. Safe.', danger: 0 },
        scout:  { icon: '🔭', name: 'Scout', desc: 'Explore and map nearby land. May find things.', danger: 0 },
        patrol: { icon: '⚔️', name: 'Patrol / Fight', desc: 'Deal with monster threats. DANGEROUS.', danger: 2 },
        rest:   { icon: '😴', name: 'Rest', desc: 'Recover at Haven. Clears assignment.', danger: 0 },
      };
    },

    // competence: how good is this person at this task? 0.7 / 1.0 / 1.4
    // from occupation keywords + personality. Assign wisely.
    villagerCompetence(vid, task) {
      const vp = (this.data.villagers || []).find(v => v.id === vid)
        || (this.data.background_survivors || []).find(v => v.id === vid)
        || {};
      const occ = (vp.formerOccupation || '').toLowerCase();
      const temp = (vp.personality && vp.personality.temperament) || 'steady';
      let mult = 1.0;
      const has = (...words) => words.some(w => occ.includes(w));
      if (task === 'hunt') {
        if (has('hunter', 'tracker', 'ranger', 'soldier', 'marine', 'poacher')) mult = 1.4;
        else if (has('butcher', 'farmer', 'athlete')) mult = 1.2;
        else if (has('librarian', 'accountant', 'teacher', 'programmer', 'clerk')) mult = 0.7;
      } else if (task === 'forage') {
        if (has('cook', 'chef', 'forager', 'botanist', 'farmer', 'gardener', 'herbalist')) mult = 1.4;
        else if (has('nurse', 'doctor')) mult = 1.2;
      } else if (task === 'wood') {
        if (has('lumberjack', 'carpenter', 'logger', 'builder', 'handyman')) mult = 1.4;
        else if (has('farmer', 'firefighter')) mult = 1.2;
      } else if (task === 'water') {
        if (has('plumber', 'firefighter', 'fisherman', 'sailor')) mult = 1.3;
      } else if (task === 'scout') {
        if (has('scout', 'ranger', 'tracker', 'soldier', 'hiker', 'explorer', 'surveyor')) mult = 1.4;
        else if (has('photographer', 'journalist')) mult = 1.2;
      } else if (task === 'patrol') {
        if (has('soldier', 'marine', 'police', 'officer', 'fighter', 'boxer', 'martial')) mult = 1.4;
        else if (has('hunter', 'firefighter', 'athlete')) mult = 1.2;
        else if (has('librarian', 'teacher', 'accountant', 'nurse', 'cook')) mult = 0.7;
      }
      // temperament: bold takes risks (better results, more danger).
      // cautious plays safe (smaller hauls, fewer injuries).
      if (temp === 'bold' && (task === 'hunt' || task === 'patrol')) mult *= 1.15;
      if (temp === 'cautious') mult *= 0.9;
      return Math.round(mult * 100) / 100;
    },

    // trust gates obedience. Low trust → refuse or do it badly.
    // Returns {ok, reason} — ok false means they refused.
    checkObedience(vid) {
      const trust = (this.state.village.trust && this.state.village.trust[vid]) || 10;
      const vp = (this.data.villagers || []).find(v => v.id === vid)
        || (this.data.background_survivors || []).find(v => v.id === vid) || {};
      const first = this.displayName(vid);
      if (trust < 20) {
        const lines = [
          `${first} looks at you flatly. "Why should I listen to you?" (Trust too low.)`,
          `"You haven't earned that yet," ${first} says. (Trust too low.)`,
          `${first} shakes their head. "Ask someone who trusts you." (Trust too low.)`,
        ];
        return { ok: false, reason: lines[Math.floor(Math.random() * lines.length)] };
      }
      if (trust < 40 && Math.random() < 0.4) {
        return { ok: false, reason: `${first} hesitates, then backs off. "Not today. Sorry." (Low trust — reluctant.)` };
      }
      return { ok: true, trust };
    },

    trustTaskMult(vid) {
      const trust = (this.state.village.trust && this.state.village.trust[vid]) || 10;
      if (trust < 40) return 0.7;
      if (trust >= 70) return 1.2;
      return 1.0;
    },

    // assign a task. Returns message. This is the leader's core verb.
    // assignTask: the leader's core verb. Now accepts opts.via for remote assignment.
    // via: 'in-person' (default, talk menu), 'shout', 'runner', 'system-ping' (future abilities).
    // The foundation is simple: delegateTasks() is the single source of truth for task types.
    // Future features (new tasks, abilities, social mechanics) plug into delegateTasks()
    // and resolveOneAssignment() — no UI rebuild needed.
    assignTask(vid, task, opts) {
      const v = this.state.village;
      const via = (opts && opts.via) || 'in-person';
      v.assignments = v.assignments || {};
      if (vid === this.villagerId) { this.say("You're the leader. Lead."); return null; }
      const tasks = this.delegateTasks();
      if (!tasks[task]) return null;
      const vp = (this.data.villagers || []).find(x => x.id === vid)
        || (this.data.background_survivors || []).find(x => x.id === vid) || {};
      const first = this.displayName(vid);
      if (task === 'rest') {
        delete v.assignments[vid];
        this.say(`${first} rests at Haven.`);
        return null;
      }
      // obedience check
      const ob = this.checkObedience(vid);
      if (!ob.ok) {
        this.say(ob.reason);
        // record the refusal — the UI can offer deal/appeal as follow-ups.
        // contextual, not perpetual: the opportunity appears because they said no.
        this.state.village.lastRefusal = { vid, task, reason: ob.reason };
        this.save();
        return { ok: false, refused: true };
      }
      // cleared: they said yes (or the player moved on)
      if ((this.state.village.lastRefusal || {}).vid === vid) delete this.state.village.lastRefusal;
      v.assignments[vid] = { task, assignedDay: this.state.scholar.day, assignedPart: this.dayPart, via };
      // THE GAME NOTICES: leadership is a playstyle axis.
      this.notePlaystyle('leader');
      this.notePlaystyle('social');
      const comp = this.villagerCompetence(vid, task);
      const compNote = comp >= 1.3 ? ' (a natural — good pick)' : comp <= 0.8 ? ' (not their strength...) ' : '';
      const eager = (ob.trust >= 70) ? ` ${first} nods eagerly.` : '';
      this.say(`📋 ${first} — ${tasks[task].icon} ${tasks[task].name}.${compNote}${eager} They'll report back by next part.`);
      // THE VILLAGE WATCHES: ordering people around is observed, and
      // contenders push back. Nothing you do is neutral.
      this.observe('order', { target: vid, task });
      this.leadershipFriction(vid, task);
      // System notices delegators.
      if (this.state.systemArrived && (this.state.scholar.playstyle || {}).leader >= 3 && !this.state.village.leaderNoticed) {
        this.state.village.leaderNoticed = true;
        this.sysSay('"Ooh! A DELEGATOR! The audience LOVES a mastermind! Others do the work, YOU take the credit — DELICIOUS! The gamblers are adjusting their models!"');
      }
      this.save();
      // ACTION CLOCK: delegating is a social move — 2 ticks, and they're engaged.
      this.socialTick(vid);
      return { ok: true };
    },

    assignmentFor(vid) {
      const a = (this.state.village.assignments || {})[vid];
      return a || null;
    },

    // === REMOTE ASSIGNMENT: leadership abilities ===
    // Base case is in-person (talk menu). Abilities unlock remote methods.
    // Future abilities plug in here:
    //   - "Shout" / "Rally Cry": village-wide, in-person range extended to whole haven
    //   - "Runner": send a villager to deliver orders to someone far away
    //   - "System Ping" (post-day-7): the System relays your orders. Televised leadership.
    // Ability design contract: an ability with `remoteAssign: {id, name, desc, range}`
    // in its data automatically appears in remoteAssignMethods(). No engine changes needed.
    canAssignRemote() {
      return this.remoteAssignMethods().length > 0;
    },

    remoteAssignMethods() {
      const methods = [];
      // check abilities for remoteAssign capability
      for (const ab of (this.state.scholar.abilities || [])) {
        const def = (this.data.abilities || []).find(a => a.id === (ab.id || ab));
        if (def && def.remoteAssign) {
          methods.push({
            id: def.remoteAssign.id || def.id,
            name: def.remoteAssign.name || def.name,
            desc: def.remoteAssign.desc || '',
            abilityId: def.id,
          });
        }
      }
      // System ping: post-day-7, the System can relay orders (if player has the perk)
      // TODO: unlock via System favor or specific ability
      return methods;
    },

    // resolve all assignments at end of day-part. Each assigned villager
    // executes. Results reported. Danger is real.
    resolveAssignments() {
      const v = this.state.village;
      // TASK LEADS: domains you yielded run themselves. The lead works their
      // domain every part — building their own power base, on your behalf.
      // That's the trade you made.
      for (const [task, leadVid] of Object.entries(v.taskLeads || {})) {
        if (leadVid === this.villagerId) continue;
        if (!(v.roster || []).includes(leadVid)) { delete v.taskLeads[task]; continue; }
        if ((v.assignments || {})[leadVid]) continue;
        try { this.resolveOneAssignment(leadVid, { task }); } catch (e) {}
      }
      const asg = v.assignments || {};
      const ids = Object.keys(asg);
      for (const vid of ids) {
        const a = asg[vid];
        // must be alive and still in roster
        if (!(v.roster || []).includes(vid)) { delete asg[vid]; continue; }
        try { this.resolveOneAssignment(vid, a); } catch (e) { delete asg[vid]; }
        delete asg[vid]; // one part per assignment — reassign to continue
      }
      // CHALLENGES AGE: ignore a contender's confrontation and they stop
      // asking. After ~2 days they just TAKE the domain. Agendas don't wait.
      const ch = v.challenge;
      if (ch) {
        ch.age = (ch.age || 0) + 1;
        if (ch.age >= 8) {
          v.taskLeads = v.taskLeads || {};
          v.taskLeads[ch.task || 'forage'] = ch.cid;
          v.challenge = null;
          const tname = (this.delegateTasks()[ch.task] || {}).name || 'work';
          this.say(`${this.displayName(ch.cid)} stopped asking. They just started organizing the ${tname} crews. Nobody stopped them.`);
        }
      }
      // GOSSIP SPREADS: what happened this part travels along social lines,
      // distorting as it goes.
      try { this.spreadGossip(); } catch (e) {}
      // PLANT KNOWLEDGE SPREADS SLOWLY: word of mouth, not broadcast.
      try { this.spreadPlantKnowledge(); } catch (e) {}
      // PROMISES: doing the work counts. If you promised to help someone's
      // goal and tasks got done, that's keeping your word.
      if (ids.length) try { this.checkPromises('task'); } catch (e) {}
    },

    resolveOneAssignment(vid, a) {
      const vp = (this.data.villagers || []).find(x => x.id === vid)
        || (this.data.background_survivors || []).find(x => x.id === vid) || {};
      const first = this.displayName(vid);
      const comp = this.villagerCompetence(vid, a.task);
      const tmult = this.trustTaskMult(vid);
      const eff = comp * tmult;
      const temp = (vp.personality && vp.personality.temperament) || 'steady';
      const R = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

      if (a.task === 'forage') {
        // LIVING WORLD: villagers deplete REAL tiles in their personality zone.
        // 5 foragers working the same area STRIP it. The village must branch out.
        const depleteCount = Math.max(1, Math.round(R(2, 4) * eff));
        const dep = this.villagerDepleteTiles(vid, depleteCount);
        const kcal = Math.round(R(300, 600) * eff * (dep.depleted > 0 ? 1 : 0.3));
        // less to find when the land is stripped — scarcity is real
        this.stockPantry(kcal, 'Foraged food');
        let landNote = '';
        if (dep.depleted === 0) {
          landNote = ` The ${dep.zone} are picked clean — ${first} found scraps. The village needs new ground.`;
        } else if (dep.barren > 0) {
          landNote = ` ${dep.barren} area${dep.barren > 1 ? 's' : ''} stripped bare ${dep.zone}.`;
        }
        // KNOWLEDGE: foragers learn. What they learn, the village learns.
        let learned = '';
        if (Math.random() < 0.25 && this.data.plants.length) {
          const p = this.data.plants[Math.floor(Math.random() * this.data.plants.length)];
          v.sharedKnowledge = v.sharedKnowledge || {};
          if (!v.sharedKnowledge[p.id] && !(this.state.codex.plants || {})[p.id]) {
            // LIVING WORLD: track the level they learned. Foragers learn L1 (recognition).
            // Experts (botanists, herbalists) might learn L2 (which parts).
            const vp2 = (this.data.villagers || []).find(x => x.id === vid)
              || (this.data.background_survivors || []).find(x => x.id === vid) || {};
            const occ2 = (vp2.formerOccupation || '').toLowerCase();
            const deepLearner = ['botanist', 'herbalist', 'cook', 'chef', 'forager'].some(w => occ2.includes(w));
            v.sharedKnowledge[p.id] = {
              discoveredBy: vid,
              day: this.state.scholar.day,
              level: deepLearner ? 2 : 1, // experts learn deeper
            };
            const pname = p.name || p.id;
            learned = ` ${first} also learned to recognize ${pname} — village knowledge grows.`;
            if (this.state.systemArrived) this.flowVillageKnowledge();
          }
        }
        this.say(`🌿 ${first} returns with foraged food: +${kcal} kcal to the pantry.${landNote}${learned}`);
        this.bumpTrust(vid, 2);
      } else if (a.task === 'hunt') {
        const kcal = Math.round(R(400, 900) * eff);
        const injuryRisk = temp === 'bold' ? 0.22 : temp === 'cautious' ? 0.08 : 0.15;
        const injuryRoll = Math.max(0.03, injuryRisk / Math.max(0.7, comp));
        this.stockPantry(kcal, 'Game meat');
        if (Math.random() < injuryRoll) {
          const dmg = R(10, 30);
          this.hurtVillager(vid, dmg, 'hunting');
          this.say(`🏹 ${first} brings back meat (+${kcal} kcal) but got hurt out there (-${dmg} health). The wild charges interest.`);
        } else {
          this.say(`🏹 ${first} returns with meat: +${kcal} kcal to the pantry. Clean hunt.`);
        }
        this.bumpTrust(vid, 2);
      } else if (a.task === 'wood') {
        const wood = Math.max(1, Math.round(R(2, 5) * eff));
        this.addWood(wood);
        this.say(`🪵 ${first} hauls back ${wood} wood. The pile grows.`);
        this.bumpTrust(vid, 1);
      } else if (a.task === 'water') {
        const liters = Math.max(1, Math.round(R(2, 4) * eff));
        const vw = this.state.village.water = this.state.village.water || { clean: 0, dirty: 0 };
        // the cistern has a real cap — overflow is reported, not silently kept.
        const cap = (typeof this.waterCapL === 'function') ? this.waterCapL() : 40;
        const room = Math.max(0, cap - ((vw.clean || 0) + (vw.dirty || 0)));
        const added = Math.min(liters, room);
        vw.clean += added;
        this.say(added >= liters
          ? `💧 ${first} returns with ${liters}L of clean water for the village.`
          : `💧 ${first} returns with ${liters}L, but the cistern only holds ${added}L more.`);
        this.bumpTrust(vid, 1);
      } else if (a.task === 'scout') {
        // reveal tiles around haven + small chance of a find
        let revealed = 0;
        try {
          const hx = this.state.village.px ?? 3, hy = this.state.village.py ?? 3;
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            const nx = hx + dx, ny = hy + dy;
            if (nx < 0 || nx > 6 || ny < 0 || ny > 6) continue;
            const t = this.tileAt(nx, ny);
            // SCOUT = mapping, not visiting. A scout's report reveals the tile
            // on the map (revealed) but never marks it visited — the player's
            // first walk-in must still get the arrival moment. (Explorer loop
            // 2026-10-05: NPC scouts were silently consuming nearby nodes'
            // arrival text before the player ever set foot there.)
            if (t && !t.revealed && Math.random() < 0.5 * eff) { t.revealed = true; revealed++; }
          }
        } catch (e) {}
        let find = '';
        if (Math.random() < 0.15 * eff) {
          const kcal = R(200, 500);
          this.stockPantry(kcal, 'Foraged food');
          find = ` Found a forgotten cache: +${kcal} kcal.`;
        }
        this.say(`🔭 ${first} scouts the land: mapped ${revealed} new area${revealed === 1 ? '' : 's'}.${find}`);
        this.bumpTrust(vid, 2);
      } else if (a.task === 'patrol') {
        this.resolvePatrol(vid, first, eff, temp, R);
      }
      // assigned villagers don't also do random villageLives actions this part
      // (they were busy — mark it)
      this.remember(vid, 'task', a.task + ' (assigned)');
    },

    // patrol: deal with monster threats. Simplified auto-resolve.
    // The leader sends fighters instead of fighting. Stakes are real.
    resolvePatrol(vid, first, eff, temp, R) {
      const s = this.state.scholar;
      const m = s.monster; // known wandering threat
      const vp = (this.data.villagers || []).find(x => x.id === vid)
        || (this.data.background_survivors || []).find(x => x.id === vid) || {};
      if (!m || !m.id) {
        // no known threat — uneventful patrol, small trust gain
        const lines = [
          `${first} walks the perimeter. Nothing stirs. The village sleeps easier.`,
          `⚔️ ${first} patrols. All quiet — which is its own kind of good news.`,
          `${first} keeps watch. No monsters today. (Small mercies.)`,
        ];
        this.say(lines[Math.floor(Math.random() * lines.length)]);
        this.bumpTrust(vid, 1);
        return;
      }
      const mdef = (this.data.monsters || []).find(x => x.id === m.id) || {};
      const mName = mdef.name || 'the thing';
      // fight power: competence × trust × boldness vs monster hp
      const mHp = (mdef.hp && mdef.hp[0]) || 20;
      const fightPower = eff * (temp === 'bold' ? 1.3 : 1.0) * 25;
      const roll = fightPower + R(0, 20);
      if (roll >= mHp * 1.2) {
        // killed it
        s.monster = null;
        const lootKcal = R(200, 600);
        this.stockPantry(lootKcal, 'Game meat');
        this.say(`⚔️ ${first} KILLED the ${mName}! Drags it home: +${lootKcal} kcal. The village cheers.`);
        this.villageEvent('victory');
        this.bumpTrust(vid, 5);
        this.remember(vid, 'hero', 'killed ' + mName);
        if (this.state.systemArrived) this.sysSay(`"OH! ${first.toUpperCase()} DID THE FIGHTING! Delegated violence! The audience is CHEERING! Style points!"`);
      } else if (roll >= mHp * 0.7) {
        // drove it off
        s.monster = null;
        const dmg = R(5, 20);
        this.hurtVillager(vid, dmg, 'patrol');
        this.say(`⚔️ ${first} drove the ${mName} off! (-${dmg} health.) It won't come back soon.`);
        this.bumpTrust(vid, 3);
      } else {
        // mauled
        const dmg = R(20, 45);
        this.hurtVillager(vid, dmg, 'patrol');
        if ((this.state.village.health || {})[vid] <= 0) {
          this.say(`⚔️ ${first} faced the ${mName}... and didn't come back. The village mourns. (Leadership has stakes.)`);
          this.villageEvent('death');
        } else {
          this.say(`⚔️ ${first} was mauled by the ${mName} (-${dmg} health) and barely escaped. It's still out there.`);
        }
        this.bumpTrust(vid, -2);
      }
    },

    // hurt a villager (non-player). Tracks health, handles death.
    hurtVillager(vid, dmg, cause) {
      const v = this.state.village;
      v.health = v.health || {};
      const cur = (v.health[vid] !== undefined) ? v.health[vid] : 100;
      v.health[vid] = Math.max(0, cur - dmg);
      if (v.health[vid] <= 0) {
        // remove from roster — they're gone
        v.roster = (v.roster || []).filter(id => id !== vid);
        v.fallen = v.fallen || [];
        v.fallen.push({ villagerId: vid, day: this.state.scholar.day, cause });
        delete (v.positions || {})[vid];
      }
    },

    bumpTrust(vid, n) {
      const v = this.state.village;
      v.trust = v.trust || {};
      // unset defaults to 10, but a real 0 must stay 0 — `|| 10` used to
      // resurrect hated villagers back toward 10 on every bump.
      const cur = v.trust[vid] === undefined ? 10 : v.trust[vid];
      v.trust[vid] = Math.max(0, Math.min(100, cur + n));
    },

    // ============ LIVING WORLD: the land remembers ============
    // Tiles have carrying capacity. Foraging depletes them. They regrow slowly.
    // A village that strips its home turf MUST branch out, learn new foods, or starve.
    // The player SEES the impact: lush → picked-over → barren.

    // depletion level: how stripped is this tile?
    depletionLevel(t) {
      if (!t || !t.maxStock || t.maxStock <= 0) return 'lush';
      const ratio = (t.stock || 0) / t.maxStock;
      if (ratio >= 0.75) return 'lush';
      if (ratio >= 0.25) return 'picked';
      return 'barren';
    },

    // CSS class for the minimap. The land shows what you've taken.
    depletionClass(t) {
      if (!t || !t.revealed) return '';
      const lvl = this.depletionLevel(t);
      if (lvl === 'picked') return 'depleted-picked';
      if (lvl === 'barren') return 'depleted-barren';
      return '';
    },

    // forage zone: which ring does this villager work? Personality-driven, not random.
    // bold pushes far for better yields (more danger). cautious stays close (safe, depletes fast).
    // This is why villages MUST expand — cautious foragers strip the home turf first.
    forageZone(vid) {
      const vp = (this.data.villagers || []).find(v => v.id === vid)
        || (this.data.background_survivors || []).find(v => v.id === vid) || {};
      const temp = (vp.personality && vp.personality.temperament) || 'steady';
      // rings are Manhattan distance from haven (3,3). Ring 0 = haven itself (no forage).
      if (temp === 'bold') return { min: 2, max: 3, label: 'far afield' };
      if (temp === 'cautious') return { min: 1, max: 1, label: 'close to home' };
      return { min: 1, max: 2, label: 'the near wilds' };
    },

    // find forageable tiles in a villager's zone. Returns tiles with stock, nearest-first.
    forageTilesInZone(zone, count) {
      const hx = 3, hy = 3; // haven
      const candidates = [];
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        if (x === hx && y === hy) continue;
        const dist = Math.abs(x - hx) + Math.abs(y - hy);
        if (dist < zone.min || dist > zone.max) continue;
        const t = this.tileAt(x, y);
        if (!t || t.type === 'ruin' || (t.stock || 0) <= 0) continue;
        candidates.push({ t, x, y, dist });
      }
      // nearest first — they work outward from haven, stripping close tiles first
      candidates.sort((a, b) => a.dist - b.dist);
      return candidates.slice(0, count);
    },

    // deplete specific tiles when a villager forages. The world remembers.
    // Returns {depleted: n, barren: n} for messaging.
    villagerDepleteTiles(vid, amount) {
      const zone = this.forageZone(vid);
      const tiles = this.forageTilesInZone(zone, amount);
      let barren = 0;
      for (const { t, x, y } of tiles) {
        t.stock = Math.max(0, (t.stock || 0) - 1);
        // traces: this tile has been worked. Worn paths form.
        t.foragePressure = (t.foragePressure || 0) + 1;
        t.foragedToday = true; // pressure doesn't decay on days it's worked
        if (t.foragePressure >= 5) t.wornPath = true;
        if ((t.stock || 0) === 0) barren++;
      }
      return { depleted: tiles.length, barren, zone: zone.label };
    },

    // === VILLAGE KNOWLEDGE POOL ===
    // What anyone learns, the village learns. Post-System, it flows to you.
    // "After week one it becomes clear that knowledge is power, and everyone
    // cooperating gets to share all the knowledge their group has collected."
    flowVillageKnowledge() {
      const v = this.state.village;
      const shared = v.sharedKnowledge || {};
      let flowed = 0;
      for (const [pid, entry] of Object.entries(shared)) {
        if ((this.state.codex.plants || {})[pid]) continue;
        const plant = (this.data.plants || []).find(p => p.id === pid);
        this.state.codex.plants = this.state.codex.plants || {};
        this.state.codex.plants[pid] = {
          identifiedDay: this.state.scholar.day,
          level: 1, harvests: 0, tastings: 0,
          viaShare: 'village',
          sharedHeadStart: true,
        };
        flowed++;
        const dVill = (this.data.villagers || []).find(x => x.id === entry.discoveredBy)
          || (this.data.background_survivors || []).find(x => x.id === entry.discoveredBy) || {};
        const discoverer = entry.discoveredBy ? (dVill.name || 'someone').split(' ')[0] : 'someone';
        this.say(`📚 Village knowledge: ${discoverer} taught everyone about ${plant ? plant.name : pid}. The Codex grows without you lifting a finger.`);
      }
      if (flowed > 0 && this.state.systemArrived && !v.hiveNoticed) {
        v.hiveNoticed = true;
        this.sysSay('"COLLECTIVE INTELLIGENCE! Your PEOPLE are learning and SHARING! The gamblers LOVE a hive mind! Knowledge is power and you\'re COLLECTING it!"');
      }
      return flowed;
    },

    // morning briefing: shared knowledge flows, assignments report.
    // Called at dawn (in endDay, after System arrival check).
    villageBriefing() {
      if (!this.state.systemArrived) return;
      const flowed = this.flowVillageKnowledge();
      const asg = this.state.village.assignments || {};
      const ids = Object.keys(asg);
      if (ids.length && !this.state.village.briefingNoticed) {
        this.state.village.briefingNoticed = true;
        this.sysSay('"Your people await orders, little leader! The audience loves a MORNING BRIEFING! So official! So powerful!"');
      }
    },

    // --- village node ---
    // the roster: who lives here this run. mains talk; background have one line each.
    villageRoster() {
      const roster = this.state.village.roster || [];
      const conflicts = this.state.village.conflicts || [];
      return roster.map(id => {
        const main = this.data.villagers.find(v => v.id === id);
        if (main) {
          const c = conflicts.find(x => !x.resolved && x.known && (x.a === id || x.b === id));
          return {
            id, name: main.name, formerOccupation: main.formerOccupation, isMain: true,
            langNote: this.langNote(id), conflictNote: this.conflictNote(c, id),
          };
        }
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
        name: v.name, pop: 12, pantryKcal: Math.round(this.pantryKcalLive(v)),
        atmos: atmos[this.state.scholar.day % atmos.length],
        codexN,
        scholarName: this.data.villagers.find(x => x.id === this.villagerId).name,
      };
    },

    depart() {
      // departure lite (member standing): tell someone you're going. no location switch — Haven is a tile.
      this.departed = true;
      this.dayPart = 0; this.ap = 1;
      this.state.scholar.dayTicks = 0; this.state.scholar.actionClock = 0; // action clock: fresh budget
      const first = this.data.villagers.find(x => x.id === this.villagerId).name.split(' ')[0];
      this.say(`You tell the others you're heading out. Someone nods. "Come back before dark."`);
      this.say(`— DAY 1 DAWN — ${DAY_PART_HINT.dawn}`);
      this.save();
      return this.status();
    },

    // stockPantry: REAL food into the REAL pantry. Every kcal arrives as an
    // item — never a phantom number. (Phantom pantryKcal bumps get wiped by
    // villageEats' end-of-day sync, which re-derives the counter from items.
    // That's how player hauls used to evaporate overnight.)
    // PANTRY KCAL (Steve 2026-10-05): the player's village pantry is PHYSICAL —
    // an item list. v.pantryKcal is a cached number that's stale until the
    // end-of-day sync (day-1 reads saw 0 against a full pantry). Any read
    // that matters derives live from the items. (Other villages, abstractly
    // simmed, keep using their pantryKcal numbers.)
    pantryKcalLive(v) {
      v = v || this.state.village;
      if (!v || !v.pantry) return 0;
      return v.pantry.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
    },
    stockPantry(kcal, name) {
      const v = this.state.village;
      v.pantry = v.pantry || [];
      kcal = Math.round(kcal || 0);
      if (kcal <= 0) return;
      const day = (this.state.scholar && this.state.scholar.day) || 1;
      v.pantry.push({ name: name || 'Foraged food', kcalEach: kcal, units: 1,
        spoilDay: day + 3, safe: true, kg: 0.2 });
      // keep the compat counter honest until the next end-of-day sync
      v.pantryKcal = v.pantry.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
    },

    returnToVillage() {
      // walking onto the Haven tile: the loop closes. what you carried feeds the village.
      // no day advance here — endDay owns the clock. this is just coming home.
      const s = this.state.scholar;
      // PIN: you are at the village now (safe even when called without walking).
      try { this.map.px = this.state.village.px ?? 3; this.map.py = this.state.village.py ?? 3; } catch (e) {}
      // PENDING VILLAGE EVENT: if something happened while you were away, they tell you.
      if (s.pendingVillageEvent) {
        const ev = s.pendingVillageEvent;
        s.pendingVillageEvent = null;
        this.say(`\u{1F4AC} ${ev.title}`);
        this.say(ev.desc);
        if (ev.id === 'system_arrival_discussion') {
          this.say('Mara: "The sky just... opened. And something talked to us. It said it was sorry. SORRY for what?!"');
          this.say('Jesse: "It offered me something. A... gift? I said no. I don\'t trust gifts from the sky."');
          this.say('Aki: "..." (Aki hasn\'t spoken since it happened.)');
          this.say('The village looks to you. You\'re the scholar. You\'re supposed to know things.');
        }
      }
      const brought = s.inventory.reduce((t, i) => t + (((i.kcalEach || 0) > 0 && !this.isUnprocessed(i)) ? (i.units || 0) * (i.kcalEach || 0) : 0), 0);
      const entries = Object.keys(this.state.codex.plants).length;
      const hasGreens = s.inventory.some(i => i.unit === 'handful' || i.unit === 'cup' || i.unit === 'oz');
      // FORAGER LOOP (2026-10-05): an unknowns-only return is still a haul.
      // The staging, the counter message, and the fireside teaching moment
      // must fire even when no finished food was brought — otherwise the
      // day's labor silently rots in the pack and nobody teaches anything.
      const hasUnprocessed = s.inventory.some(i => this.isUnprocessed(i) && (i.units || 0) > 0);
      if (brought > 0) {
        const vv = this.state.village;
        vv.pantry = vv.pantry || [];
        // move the ACTUAL food into the real pantry — not a phantom number.
        // non-food (bonded relics, tools, materials, books) stays in your pack.
        // (this used to wipe the whole inventory AND evaporate the haul overnight.)
        // YOU EAT TOO: keep a day's food in your pack. The loop closes for the
        // village, not at your expense — the surplus feeds everyone. (Before this,
        // the vacuum took everything and the forager starved next to a full
        // pantry. That was a bug, not a design.)
        const KEEP_KCAL = 2000;
        let kept = 0;
        const give = [];
        for (const item of s.inventory) {
          if (!((item.kcalEach || 0) > 0 && (item.units || 0) > 0 && !this.isUnprocessed(item))) continue;
          const itemKcal = (item.kcalEach || 0) * (item.units || 0);
          if (kept >= KEEP_KCAL) { give.push(item); continue; }
          const room = KEEP_KCAL - kept;
          if (itemKcal <= room) { kept += itemKcal; continue; } // keep whole stack
          // split the stack: keep what fills the day, give the rest
          const keepUnits = Math.floor(room / (item.kcalEach || 1));
          if (keepUnits > 0) {
            kept += keepUnits * (item.kcalEach || 0);
            give.push(Object.assign({}, item, { units: (item.units || 0) - keepUnits }));
            item.units = keepUnits;
          } else { give.push(item); }
        }
        const giveSet = new Set(give);
        for (const item of give) {
          vv.pantry.push({ name: item.name || 'Foraged food', plantId: item.plantId,
            kcalEach: item.kcalEach, units: item.units,
            spoilDay: item.spoilDay || 9999, unit: item.unit,
            safe: item.safe !== false, kg: item.kg || 0.2, prep: item.prep,
            foodKind: item.foodKind, foodState: item.foodState, edible: item.edible,
            hiddenKcal: item.hiddenKcal, diseaseRisk: item.diseaseRisk,
            needsCooking: item.needsCooking, rawKcal: item.rawKcal, cookedKcal: item.cookedKcal });
        }
        // first return: someone explains the pooling. after that, it's understood.
        if (!vv.pooledFoodExplained && give.length) {
          vv.pooledFoodExplained = true;
          this.say('Someone by the fire nods at your pack. "We pool food here. Keep what you need for the road — the rest feeds everyone."');
        }
        // remove only what was GIVEN (kept food stays in the pack). split stacks were
        // already reduced to their kept units above; whole-stack gives are removed.
        s.inventory = s.inventory.filter(i => !giveSet.has(i));
        vv.pantryKcal = vv.pantry.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
        const givenKcal = Math.round(give.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0));
        this.say(`You keep a day's food (${Math.round(kept)} kcal) and unload ${givenKcal} kcal into Haven's pantry.`);
      }
      if (brought > 0 || hasUnprocessed) {
        // PREP STASH: only FINISHED food goes to the pantry. Unprocessed hauls
        // (lumps, carcasses, in-shell nuts, raw meat) land on the kitchen
        // counter — the prep stash — with their spoilage clocks ticking.
        // (The pantry is where food waits to be eaten; the stash is where raw
        // becomes food.)
        let staged = 0;
        for (let i = s.inventory.length - 1; i >= 0; i--) {
          const item = s.inventory[i];
          if (this.isUnprocessed(item) && (item.units || 0) > 0) {
            this.prepStash().push(item);
            s.inventory.splice(i, 1);
            staged++;
          }
        }
        if (staged) this.say(`${staged} unprocessed haul${staged > 1 ? 's' : ''} onto the counter — the clock is ticking.`);
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
        try { this.playerDeath('the expedition'); } catch (e) { this.over = true; }
      }
      else {
        this.say(`You walk back into Haven. ${entries} Codex entries. The village is glad to see you.`);
        // milestone (not game over): the Codex is filling and the pantry is secure.
        // Haven will make it — one less thing to fear. Game over is only the
        // table (the village's ending) or the village dying out.
        if (entries >= 10 && this.pantryKcalLive(this.state.village) >= 8000 && !this.state.village.havenSecured) {
          this.state.village.havenSecured = true;
          this.say('Mara looks at the pantry, then at the Codex, then at you. "We\u2019re going to make it." Haven will survive \u2014 because someone learned the land, and wrote it down. One less thing to fear.');
          try { this.ledgerAdd('unified', 2); this.ledgerAdd('showmanship', 1); } catch (e) {}
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
      // re-inject the generated cast: they live in the save, not in the JSON
      const rc = (s.village && s.village.rosterChars) || {};
      this.data.villagers = (this.data.villagers || []).filter(v => !(v.id || '').startsWith('gen_'));
      for (const id of Object.keys(rc)) {
        if (!this.data.villagers.find(v => v.id === id)) this.data.villagers.push(rc[id]);
      }
      this.over = false; this.won = false;
      // SYNERGIES: recompute on load (saves predate the resonance system).
      // Discovered ones stay discovered; no re-announcement (checkSynergies only says on new).
      this.recomputeActiveSynergies();
      return true;
    },
    wipe() {
      // remove this run's keyed save (dead/finished runs don't continue)
      try {
        if (this.state) {
          if (!this.state.startedAt) this.state.startedAt = Date.now();
          S.state.wipe(S.state.saveKey(this.state));
        } else S.state.wipe();
      } catch (e) {}
    },
    deleteSave(key) { S.state.wipe(key); },

    // OTHER VILLAGES: 2-3 on the map. They live their own game.
    // When you meet one mid-game, it has history — catch-up sim runs days since start.
    genVillages() {
      const villages = [];
      const nVillages = 2 + Math.floor(Math.random() * 2); // 2-3
      // Villages settle the best available ground — never garbage. Rank every
      // tile outside the haven zone by what its turf can hold, and pick from
      // the top. (An absolute threshold fails on poor maps: the old try-60
      // loop burned out and dropped villages in corners or on haven itself.
      // Relative to the map always resolves.)
      const cands = [];
      for (let vy = 0; vy < 7; vy++) for (let vx = 0; vx < 7; vx++) {
        if (Math.abs(vx - 3) + Math.abs(vy - 3) < 3) continue; // not too close to haven
        cands.push({ x: vx, y: vy, tk: this.turfKcal(vx, vy) });
      }
      cands.sort((a, b) => b.tk - a.tk);
      const best = cands.length ? cands[0].tk : 0;
      const good = cands.filter(c => c.tk >= Math.max(4000, best * 0.6));
      const pool = good.length ? good : cands.slice(0, Math.max(1, Math.min(6, cands.length)));
      for (let i = 0; i < nVillages; i++) {
        // pick good ground, spaced apart from the other villages
        let pick = null, tries = 0;
        while (tries++ < 40) {
          const c = pool[Math.floor(Math.random() * pool.length)];
          if (villages.some(v => Math.abs(v.x - c.x) + Math.abs(v.y - c.y) < 2)) continue;
          pick = c; break;
        }
        if (!pick) pick = pool[Math.floor(Math.random() * pool.length)];
        const village = {
          id: `village_${i}`,
          name: ['Emberhold', 'Stonebridge', 'Thornfield', 'Ashford'][i] || `Village ${i}`,
          x: pick.x, y: pick.y,
          day: 0, // how many days they've been simulated
          population: 8 + Math.floor(Math.random() * 5), // 8-12
          pantryKcal: 15000 + Math.floor(Math.random() * 10000), // a working pantry, not a death sentence
          knowledge: Math.floor(Math.random() * 5), // codex-like level
          generated: false, // becomes true when player approaches
        };
        villages.push(village);
      }
      this.state.otherVillages = villages;
    },

    // joinVillage: you're at another village. Join them.
    // You become one of theirs. Their pantry feeds you. You contribute.
    // If you die, you can take over one of their villagers.
    joinVillage(villageId) {
      const v = (this.state.otherVillages || []).find(v => v.id === villageId);
      if (!v) return null;
      this.state.scholar.joinedVillage = villageId;
      this.say(`You join ${v.name}. You're one of them now. Their pantry is yours. Their problems are yours.`);
      return null;
    },
    // leaveVillage: go solo again. The wild is yours.
    leaveVillage() {
      this.state.scholar.joinedVillage = null;
      this.say('You leave. Solo. The wild doesn\'t care, but it\'s honest.');
      return null;
    },

    // turfKcal: what the land around (x,y) can actually give today.
    // Sums stocked tiles within 4 (their turf — same footprint depleteRandomTile
    // works). Home-village convention: 1 stock ≈ 200 kcal.
    turfKcal(x, y) {
      let cap = 0;
      for (let ty = 0; ty < 7; ty++) for (let tx = 0; tx < 7; tx++) {
        const t = this.tileAt(tx, ty);
        if (!t || t.type === 'haven' || t.type === 'ruin' || (t.stock || 0) <= 0) continue;
        if (Math.abs(tx - x) + Math.abs(ty - y) <= 4) cap += (t.stock || 0);
      }
      return cap * 200;
    },

    // catchUpSim: when you approach a village, simulate all days since game start.
    // They're not fresh — they've been living, foraging, competing.
    // LIVING WORLD: their knowledge EMERGES from who they are, where they are,
    // and what they've actually been doing. A fishing village knows fish.
    // A farming village knows crops. This isn't assigned — it's simulated.
    catchUpSim(village) {
      const targetDay = this.state.scholar.day;
      const daysToSim = targetDay - village.day;
      if (daysToSim <= 0) return;
      // generate their knowledge profile on first sim (geography + people)
      if (!village.knowledgeProfile) {
        village.knowledgeProfile = this.genVillageKnowledgeProfile(village);
      }
      // Fast sim: each day, they forage (depleting the world), eat, maybe grow.
      for (let d = 0; d < daysToSim; d++) {
        // the land heals overnight, like it does between your days — then they work it
        try { this.regrowTiles(); } catch (e) {}
        this.simVillageDay(village);
      }
      village.generated = true;
    },

    // simVillageDay: ONE lived day for a distant village — extracted from
    // catchUpSim so the village you JOINED can live day-by-day while you're
    // at their fire (see tickJoinedVillage). Same watermark (village.day),
    // so catch-up and live ticks never double-count. Does NOT regrow tiles;
    // callers own the regrow (catchUpSim per sim day, endDay once per day).
    simVillageDay(village) {
      // forage: knowledge-scaled, like the player's village. Strangers in a
      // strange land start near 60% self-sufficient and learn — the same
      // learning curve, abstracted. Villages you meet late are LIVING places,
      // not graveyards: they learned while you weren't looking.
      const prof = village.knowledgeProfile || {};
      const plantCount = Object.keys(prof.plants || {}).length;
      const effKnow = Math.max(village.knowledge || 0, plantCount / 3);
      const perPerson = (1500 + Math.random() * 700) * Math.min(1.8, 1 + 0.12 * effKnow);
      const need = village.population * 2000;
      // THE LAND SETS THE CEILING. They take what their turf grows — the
      // rest is ranging, traps, and work the sim doesn't map, covering about
      // 60% of need. Strangers start near 60% self-sufficient and learn.
      // A stripped turf means lean days; lean days mean hunger.
      const turf = this.turfKcal(village.x, village.y);
      const fromTurf = Math.min(village.population * perPerson, turf);
      const stillHungry = Math.max(0, need - fromTurf);
      const ranged = Math.min(stillHungry, need * 0.6);
      const forage = fromTurf + ranged;
      village.pantryKcal += forage;
      // VISIBLE COMPETITION (forager loop 2026-10-05): the world only sees
      // what hands take. The home village sends 1-2 villagers out a day
      // (400-800 kcal hauls — see villageLives), so a distant village visibly
      // depletes the same: 2-8 stock/day, not its whole need. The old formula
      // took the full need from STANDING stock (depleteRandomTile(91,...)),
      // zeroing 27 tiles in a single catch-up day — the map can't survive its
      // own villages, and the "never goes map-wide" promise broke. The rest
      // of their living is ranging/traps/abstract, same as home.
      const handsOut = 1 + (Math.random() < 0.4 ? 1 : 0);
      const visibleKcal = handsOut * (400 + Math.random() * 400);
      this.depleteRandomTile(Math.ceil(visibleKcal / 200), village.x, village.y);
      // eat: 2000 per person
      village.pantryKcal -= need;
      // villages eat and share surplus — they don't hoard. 4 days' buffer, max.
      village.pantryKcal = Math.min(village.pantryKcal, village.population * 8000);
      // starvation: lean days cost people, slowly. Never below 6 — a village
      // of six is the smallest viable peer: they can still trade, teach, and
      // take you in. (The old sim never starved anyone; pantries ballooned.)
      if (village.pantryKcal <= 0 && forage < need) {
        village.pantryKcal = 0;
        if (Math.random() < 0.3 && village.population > 6) {
          village.population--;
        }
      }
      // knowledge grows: they learn what they forage. SLOWLY, like real people.
      // each day, small chance to deepen knowledge of a plant from their profile.
      if (Math.random() < 0.3) {
        this.villageLearn(village);
      }
      village.day++;
    },

    // tickJoinedVillage: the village you joined lives TODAY — but only while
    // you're actually at their fire. The pantry is physical; so is their life.
    // (BUG 2026-10-05: a joined village never simmed while you lived there —
    // ten people ate nothing for days; only your meal moved their pantry.)
    tickJoinedVillage() {
      const jvId = (this.state.scholar || {}).joinedVillage;
      if (!jvId) return;
      const jv = (this.state.otherVillages || []).find(x => x.id === jvId);
      if (!jv) return;
      const d = Math.abs((jv.x || 0) - ((this.map && this.map.px) || 0)) +
                Math.abs((jv.y || 0) - ((this.map && this.map.py) || 0));
      if (d > 1) return; // not there — no life, no meal (see villageMeal gate)
      if (!jv.generated) {
        // first sight: catch-up covers every day through today
        try { this.catchUpSim(jv); } catch (e) {}
        return;
      }
      this.simVillageDay(jv);
    },

    // genVillageKnowledgeProfile: what does this village know?
    // From three sources: GEOGRAPHY (what grows near them), PEOPLE (occupations),
    // and HISTORY (what they've foraged — built up during sim).
    genVillageKnowledgeProfile(village) {
      const plants = this.data.plants || [];
      const profile = {
        // village "occupation" — determines knowledge bias. Emergent, not assigned.
        // Pick from their geography: near water = fishers, near forest = foragers, etc.
        focus: 'forager', // default
        plants: {}, // pid -> {level, learnedDay}
      };
      // GEOGRAPHY: check what tile types surround them
      const tileTypes = {};
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const tx = village.x + dx, ty = village.y + dy;
        if (tx < 0 || tx > 6 || ty < 0 || ty > 6) continue;
        const t = this.tileAt(tx, ty);
        if (t) tileTypes[t.type] = (tileTypes[t.type] || 0) + 1;
      }
      // determine focus from geography
      if ((tileTypes['water'] || 0) + (tileTypes['creek'] || 0) >= 3) {
        profile.focus = 'fisher';
      } else if ((tileTypes['forest'] || 0) + (tileTypes['grove'] || 0) >= 4) {
        profile.focus = 'forager';
      } else if ((tileTypes['meadow'] || 0) + (tileTypes['field'] || 0) >= 4) {
        profile.focus = 'farmer';
      } else if ((tileTypes['ruin'] || 0) >= 2) {
        profile.focus = 'scavenger';
      }
      // PEOPLE: generate 2-3 "expert" villagers whose occupations shape knowledge
      const focusOccs = {
        fisher: ['fisherman', 'sailor', 'angler'],
        forager: ['botanist', 'herbalist', 'forager', 'cook'],
        farmer: ['farmer', 'gardener', 'cook'],
        scavenger: ['scavenger', 'handyman', 'mechanic'],
      };
      profile.experts = (focusOccs[profile.focus] || ['forager']).slice(0, 2);
      // SEED KNOWLEDGE: they start knowing 2-4 plants related to their focus.
      // Plants with matching tileAffinity or focus-relevant traits.
      // (If the focus pool is thin — fishers only have a few water plants —
      // fall back to the full pool. Every village knows SOMETHING.)
      const focusPlants = plants.filter(p => {
        const aff = (p.tileAffinity || []).join(' ').toLowerCase();
        if (profile.focus === 'fisher') return aff.includes('water') || aff.includes('creek') || aff.includes('wetland');
        if (profile.focus === 'farmer') return aff.includes('meadow') || aff.includes('field');
        if (profile.focus === 'forager') return aff.includes('forest') || aff.includes('grove') || aff.includes('meadow');
        return true; // scavengers know a bit of everything
      });
      const pool = focusPlants.length ? focusPlants : plants;
      const nSeed = 2 + Math.floor(Math.random() * 3); // 2-4
      let guard = 0;
      while (Object.keys(profile.plants).length < Math.min(nSeed, pool.length) && guard++ < 30) {
        const p = pool[Math.floor(Math.random() * pool.length)];
        if (!profile.plants[p.id]) {
          profile.plants[p.id] = { level: 1 + Math.floor(Math.random() * 2), learnedDay: 0 }; // L1-L2
        }
      }
      // village.codex mirrors the profile so villageTalk can trade knowledge both ways
      village.codex = village.codex || { plants: {} };
      for (const [pid, e] of Object.entries(profile.plants)) {
        village.codex.plants[pid] = { level: e.level, identifiedDay: 0 };
      }
      return profile;
    },

    // villageLearn: during sim, villages learn what they actually forage.
    // Slow, like real people. Their knowledge reflects their history.
    villageLearn(village) {
      const prof = village.knowledgeProfile;
      if (!prof) return;
      const plants = this.data.plants || [];
      if (!plants.length) return;
      // pick a random plant, weighted toward their focus
      const p = plants[Math.floor(Math.random() * plants.length)];
      const existing = prof.plants[p.id];
      if (existing) {
        // deepen: L1 -> L2 -> L3 over many days
        if (existing.level < 3 && Math.random() < 0.3) {
          existing.level++;
          village.codex.plants[p.id] = village.codex.plants[p.id] || {};
          village.codex.plants[p.id].level = existing.level;
        }
      } else if (Math.random() < 0.4) {
        // new discovery! They found something new.
        prof.plants[p.id] = { level: 1, learnedDay: village.day };
        village.codex.plants[p.id] = { level: 1, identifiedDay: village.day };
      }
    },

    // checkVillageProximity: when player gets within 2 tiles, generate + catch up.
    // Catch-up runs on EVERY approach, not just the first: they've been living
    // since you last looked, whether you joined them or not. (BUG 2026-10-05:
    // the sim only ran while !generated, so after first contact a village
    // froze in time whenever you walked away — only talk/petition re-synced it.)
    checkVillageProximity() {
      const px = this.map.px, py = this.map.py;
      for (const v of (this.state.otherVillages || [])) {
        const dist = Math.abs(v.x - px) + Math.abs(v.y - py);
        if (dist <= 2) {
          const firstSight = !v.generated;
          this.catchUpSim(v);
          if (!firstSight) continue;
          const prof = v.knowledgeProfile || {};
          const nPlants = Object.keys(prof.plants || {}).length;
          const focusWord = { fisher: 'fishing folk', forager: 'foragers', farmer: 'farmers', scavenger: 'scavengers' }[prof.focus] || 'survivors';
          // LIVING WORLD: their knowledge is a content unlock. What do they know that you don't?
          const yourPlants = Object.keys(this.state.codex.plants || {});
          const theirNew = Object.keys(prof.plants || {}).filter(pid => !yourPlants.includes(pid)).length;
          const knowNote = nPlants > 0 ? ` They know ${nPlants} plants${theirNew > 0 ? ` — ${theirNew} you haven't seen` : ''}.` : '';
          // DRIFTER: you can read a village at a glance. Lean ones look lean.
          const leanNote = (v.pantryKcal || 0) <= 0 ? ' They look lean — hungry, even. Food would talk here.' : '';
          this.say(`You see smoke on the horizon. ${v.name} — ${v.population} people, ${v.day} day${v.day === 1 ? '' : 's'} in. ${focusWord}, by the look of it.${knowNote}${leanNote} They've been here the whole time.`);
        }
      }
    },

    genMap() {
      // Procedural with logic: creek flows, wetlands hug water, groves cluster,
      // thickets edge, meadows open, one ruin with a story.
      // The LANDING ZONE shapes the map: creek bottoms are wet and rich,
      // ridgelines are exposed, old suburbs are scavenger country.
      const P = this.locParams();
      const tiles = [];
      for (let y = 0; y < 7; y++) {
        const row = [];
        for (let x = 0; x < 7; x++) row.push({ type: 'forest_floor', revealed: false, stock: 1, maxStock: 1, visited: false });
        tiles.push(row);
      }
      const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < 7 && y < 7) tiles[y][x].type = t; };
      const at = (x, y) => (x >= 0 && y >= 0 && x < 7 && y < 7) ? tiles[y][x].type : null;

      // creeks: random walks top→bottom (some landing zones have more water)
      for (let cw = 0; cw < P.creeks; cw++) {
        let cx = 1 + Math.floor(Math.random() * 5), cy = 0;
        set(cx, cy, 'creek');
        while (cy < 6) {
          const mv = Math.random();
          if (mv < 0.45) cy++;
          else if (mv < 0.7) cx = Math.max(0, cx - 1);
          else cx = Math.min(6, cx + 1);
          set(cx, cy, 'creek');
        }
      }
      // wetlands: adjacent to creek
      let placed = 0, guard = 0;
      while (placed < P.wetlands && guard++ < 80) {
        const x = Math.floor(Math.random() * 7), y = Math.floor(Math.random() * 7);
        if (at(x, y) !== 'forest_floor') continue;
        const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy) === 'creek');
        if (nearWater) { set(x, y, 'wetland'); placed++; }
      }
      // groves: clusters
      const blob = (sx, sy, t, n) => {
        let p = 0, g = 0;
        while (p < n && g++ < 40) {
          const x = sx + Math.floor(Math.random() * 3) - 1, y = sy + Math.floor(Math.random() * 3) - 1;
          if (at(x, y) === 'forest_floor') { set(x, y, t); p++; }
        }
      };
      for (let gb = 0; gb < P.groveBlobs; gb++) {
        blob(Math.floor(Math.random() * 7), Math.floor(Math.random() * 7), 'grove', P.groveSize);
      }
      // meadow: one open blob
      blob(2 + Math.floor(Math.random() * 3), 2 + Math.floor(Math.random() * 3), 'meadow', P.meadowSize);
      // thickets: edges
      placed = 0; guard = 0;
      while (placed < P.thickets && guard++ < 80) {
        const edge = Math.random() < 0.5;
        const x = edge ? (Math.random() < 0.5 ? 0 : 6) : Math.floor(Math.random() * 7);
        const y = edge ? Math.floor(Math.random() * 7) : (Math.random() < 0.5 ? 0 : 6);
        if (at(x, y) === 'forest_floor') { set(x, y, 'thicket'); placed++; }
      }
      // trails: old paths through the land (suburbs have more)
      for (let tl = 0; tl < P.trailLines; tl++) {
        const tx = Math.max(1, Math.min(5, 3 + (tl - (P.trailLines - 1) / 2) * 2));
        for (let i = 1; i < 6; i++) { if (at(tx, i) === 'forest_floor') set(tx, i, 'trail_edge'); }
      }
      // ruin: one, deliberate, with a story. GUARANTEED.
      // SCAVENGER VIABILITY: the ruin must be within Manhattan d<=3 of haven (3,3),
      // i.e. reachable via revealed tiles in week 1. Scavenging is a real path now.
      // (The old try-60-times loop silently failed ~2% of the time, leaving worlds
      // with no ruin at all — and scavengers with nowhere to go.)
      const ruinCandidates = [];
      for (let ry2 = 0; ry2 < 7; ry2++) for (let rx2 = 0; rx2 < 7; rx2++) {
        const dHaven = Math.abs(rx2 - 3) + Math.abs(ry2 - 3);
        if (dHaven <= P.ruinMaxDist && dHaven > 0 && at(rx2, ry2) === 'forest_floor' &&
            at(rx2 + 1, ry2) !== 'creek' && at(rx2 - 1, ry2) !== 'creek') ruinCandidates.push([rx2, ry2]);
      }
      let ruinXY;
      if (ruinCandidates.length) {
        ruinXY = ruinCandidates[Math.floor(Math.random() * ruinCandidates.length)];
      } else {
        // degenerate map: force it. pick a ring cell, make it forest_floor, put the ruin there.
        const ring = [];
        for (let ry2 = 0; ry2 < 7; ry2++) for (let rx2 = 0; rx2 < 7; rx2++) {
          const dHaven = Math.abs(rx2 - 3) + Math.abs(ry2 - 3);
          if (dHaven <= 3 && dHaven > 0) ring.push([rx2, ry2]);
        }
        ruinXY = ring[Math.floor(Math.random() * ring.length)];
        set(ruinXY[0], ruinXY[1], 'forest_floor');
      }
      {
        const [rx3, ry3] = ruinXY;
        set(rx3, ry3, 'ruin');
        tiles[ry3][rx3].ruinStory = ['A collapsed barn. Pre-Burn. The wiring is gone — everything is gone — but the stones remember the shape of work.',
          'A farmhouse foundation. Someone\'s kitchen. The Burn took the wires from the walls; the walls kept standing out of spite.',
          'A gas station. The pumps are sculptures now. Nothing combustible within miles — the Burn was thorough.'][Math.floor(Math.random() * 3)];
        // finite pantry: 3-5 cans, scaled by landing zone. the houses feed you until they don't.
        const nLoot = Math.max(1, Math.round((3 + Math.floor(Math.random() * 3)) * P.lootMult));
        tiles[ry3][rx3].loot = [];
        for (let i = 0; i < nLoot; i++) tiles[ry3][rx3].loot.push(SCAVENGED[Math.floor(Math.random() * SCAVENGED.length)].id);
      }
      // stock: rich ground gives more pulls. number of times depends on the biome and landing zone.
      // (computed inline — this.map doesn't exist yet during gen)
      const RICH = { grove: 1.5, wetland: 1.4, creek: 1.3, meadow: 1.3, thicket: 1.2, trail_edge: 1.0, forest_floor: 0.8 };
      for (const k of Object.keys(RICH)) RICH[k] = RICH[k] * P.stockMult;
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
      // FOG OF WAR: unexplored tiles are fully hidden. No hints, no guesses —
      // if you haven't been there, you don't see it. Revealed on visit.
      // BLOCKED ROADS: some paths in are obstructed. Always multiple solutions:
      // cut (fallen tree), clear (rubble), bridge (washed out / hard creek), swim, or go around.
      // CONSTRUCTION (future): tile.structures[] holds anything built here — walls, palisades, etc.
      const DIRS = [[0,-1],[1,0],[0,1],[-1,0]]; // n,e,s,w
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const t = tiles[y][x];
        t.structures = []; // future: walls, palisades, shelters
        // blockages: ~12% of wild tiles have one obstructed approach.
        // never block haven, never block the ruin approach (scavengers need in).
        if (t.type !== 'haven' && t.type !== 'ruin' && Math.random() < 0.12) {
          const [dx, dy] = DIRS[Math.floor(Math.random() * 4)];
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx > 6 || ny < 0 || ny > 6) continue;
          if (tiles[ny][nx].type === 'haven') continue;
          const roll = Math.random();
          // -dx,-dy: the direction you'd be coming FROM to enter this tile
          t.blockFrom = { dx: -dx, dy: -dy, type: roll < 0.4 ? 'fallen_tree' : roll < 0.7 ? 'rubble' : 'washed_out' };
        }
        // hard creek crossings: ~35% of creek tiles need a bridge or a swimmer.
        if (t.type === 'creek' && Math.random() < 0.35) t.needsBridge = true;
      }
      this.map = { tiles, px: 3, py: 3 };
      // STRICT FOG: at start you see haven and the ground south of it — the
      // door faces south, so south is all you can see. Everything else is
      // dark until you walk there. (reveal() is still used on travel: arriving
      // somewhere maps its surroundings.)
      tiles[3][3].revealed = true;
      tiles[4][3].revealed = true;
      const start = this.tileAt(3, 3);
      start.visited = true;
    },

    // --- species truth: what grows where ---
    // assignCellSpecies: every plant/bush cell gets a true species (seeded).
    // cellPlantSpecies: lazy backfill for tiles generated before this existed.
    // The game knows; the player learns through the knowledge gates.
    assignCellSpecies(t, cells, nx, ny) {
      const bio = this.biome();
      const table = (bio && bio.forageTable) || {};
      const pids = Object.keys(table);
      if (!pids.length) return;
      const srnd = this.detailRand(this.detailSeed(nx ?? 3, ny ?? 3) + 9182);
      t.plantSpecies = t.plantSpecies || {};
      t.bushSpecies = t.bushSpecies || {};
      const pick = () => {
        let total = 0;
        for (const pid of pids) total += table[pid] || 0;
        let r = srnd() * total;
        for (const pid of pids) { r -= table[pid] || 0; if (r <= 0) return pid; }
        return pids[0];
      };
      for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
        const key = cx + ',' + cy;
        const c = cells[cy] && cells[cy][cx];
        if (c === 'plant' && !t.plantSpecies[key]) t.plantSpecies[key] = pick();
        else if (c === 'bush' && !t.bushSpecies[key]) {
          t.bushSpecies[key] = srnd() < 0.5 ? 'blackberry' : 'muscadine';
        }
      }
    },
    // cellPlantSpecies: the true species for a forageable cell (game truth).
    // Trees name their nut (oak/hickory); pine etc. have no nut — work the ground.
    cellPlantSpecies(t, cx, cy, cell) {
      const key = cx + ',' + cy;
      if (cell === 'bush') {
        t.bushSpecies = t.bushSpecies || {};
        if (!t.bushSpecies[key]) t.bushSpecies[key] = Math.random() < 0.5 ? 'blackberry' : 'muscadine';
        return t.bushSpecies[key];
      }
      if (cell === 'plant') {
        t.plantSpecies = t.plantSpecies || {};
        if (!t.plantSpecies[key]) t.plantSpecies[key] = this.rollWildSpecies(t);
        return t.plantSpecies[key];
      }
      if (cell === 'tree' || cell === 'bigtree') {
        const mod = t.modifiers && t.modifiers[key];
        if (mod && mod.species === 'oak') return 'acorn_white_oak';
        if (mod && mod.species === 'hickory') return 'hickory_nut';
        return null;
      }
      return null;
    },
    rollWildSpecies(t) {
      const bio = this.biome();
      const table = (bio && bio.forageTable) || {};
      const pids = Object.keys(table);
      if (!pids.length) return null;
      let total = 0;
      for (const pid of pids) total += table[pid] || 0;
      let r = Math.random() * total;
      for (const pid of pids) { r -= table[pid] || 0; if (r <= 0) return pid; }
      return pids[0];
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
    // validateSpawnArea: BFS from (sx,sy). Ensures the spawn isn't walled in.
    // Requires 15+ reachable walkable cells and 2+ reachable doors/exits.
    // If it fails, carve doors in walls adjacent to the reachable region.
    validateSpawnArea(t, sx, sy) {
      const cells = t.detail;
      if (!cells) return;
      const walkable = (cx, cy) => {
        if (cx < 0 || cy < 0 || cx > 8 || cy > 8) return false;
        return !this.cellProps(cells[cy][cx]).blocks;
      };
      const bfs = () => {
        const seen = new Set([sx + ',' + sy]);
        const q = [[sx, sy]];
        while (q.length) {
          const [x, y] = q.shift();
          for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
            const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
            if (seen.has(k) || !walkable(nx, ny)) continue;
            seen.add(k); q.push([nx, ny]);
          }
        }
        return seen;
      };
      let seen = bfs();
      // count doors in reachable area
      const countDoors = () => {
        let n = 0;
        for (const k of seen) {
          const [x, y] = k.split(',').map(Number);
          if (cells[y][x] === 'door' || cells[y][x] === 'bridge') n++;
        }
        return n;
      };
      // carve up to 2 doors if needed: find a wall adjacent to reachable area
      // that borders another walkable cell beyond it
      let attempts = 0;
      while ((seen.size < 15 || countDoors() < 2) && attempts++ < 10) {
        let carved = false;
        for (const k of seen) {
          const [x, y] = k.split(',').map(Number);
          for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
            const wx = x + dx, wy = y + dy; // wall candidate
            const bx = x + dx * 2, by = y + dy * 2; // beyond
            if (wx < 1 || wy < 1 || wx > 7 || wy > 7) continue;
            if (cells[wy][wx] !== 'wall') continue;
            // beyond must be walkable (or edge of map)
            if (bx >= 0 && bx <= 8 && by >= 0 && by <= 8 && this.cellProps(cells[by][bx]).blocks) continue;
            cells[wy][wx] = 'door';
            carved = true;
            break;
          }
          if (carved) break;
        }
        if (!carved) break;
        seen = bfs();
      }
    },

    genDetail(x, y) {
      const t = this.tileAt(x, y);
      if (t.detail) return t.detail;
      // HAVEN IS A BUILDING. Always the same building, every run.
      // Home base doesn't change shape. A new player learns it once.
      // INSIDE vs OUTSIDE: scholar.insideHaven tracks which you're in.
      // The door leads outside to the Haven grounds (tents, fire, the world).
      if (t.type === 'haven') {
        const inside = this.state.scholar ? this.state.scholar.insideHaven !== false : true;
        if (!inside) {
          // OUTSIDE: the Haven grounds. Tents, a fire pit, worn paths.
          // The lodge (the building) sits at the north — tap it to go back in.
          // Steve 2026-10-04: the grounds were a tent maze (15% random tents
          // ≈ 12 blocking tents) — it felt like a trap. Now: a small deliberate
          // camp, mostly open ground, clear paths from the door to the edges.
          const cells = [];
          const ornd = this.detailRand(this.detailSeed(x, y) + 4242);
          for (let cy = 0; cy < 9; cy++) {
            const row = [];
            for (let cx = 0; cx < 9; cx++) {
              // lodge footprint: rows 0-1, cols 3-5
              if (cy <= 1 && cx >= 3 && cx <= 5) { row.push('lodge'); continue; }
              const r = ornd();
              row.push(r < 0.35 ? 'dirt' : 'grass');
            }
            cells.push(row);
          }
          // clear the lodge doorstep: walkable ground at (4,2)
          cells[2][4] = 'dirt';
          // fire pit near the lodge, not blocking
          cells[2][2] = 'fire';
          // THE CAMP: a few tents, placed deliberately in a loose cluster west
          // of the lodge — homes, not a maze. Spots jitter with the seed.
          const tentSpots = [[1, 3], [2, 4], [1, 5]];
          for (const [tx, ty] of tentSpots) {
            const jx = tx + Math.floor(ornd() * 2), jy = ty + Math.floor(ornd() * 2);
            if (cells[jy] && cells[jy][jx] !== 'lodge') cells[jy][jx] = 'tent';
          }
          // THE GARDEN CORNER: someone tried to grow things here — a sparse
          // teaching patch, not a farm. A new player learns the forage verb
          // HERE, then understands food is OUT THERE. (Barren Haven fix.)
          // Clustered SE so it's findable but not central.
          const garden = [[6,5],[7,5],[6,6],[7,6],[5,6]];
          for (const [gx, gy] of garden) {
            if (cells[gy] && cells[gy][gx] !== 'lodge') cells[gy][gx] = (gx + gy) % 2 ? 'plant' : 'bush';
          }
          t.detail = cells;
          return cells;
        }
        // INSIDE: the Haven hall. One room, one fire, bunks along the walls.
        // Doors south (row 6). Spawn at (4,4). Fire off the main path.
        const layout = [
          ['wall','wall','wall','wall','wall','wall','wall','wall','wall'],
          ['wall','hall','hall','hall','hall','hall','hall','hall','wall'],
          ['wall','hall','bunk','hall','hall','hall','bunk','hall','wall'],
          ['wall','hall','hall','hall','hall','hall','hall','hall','wall'],
          ['wall','hall','hall','hall','hall','hall','hall','hall','wall'],
          ['wall','hall','hall','fire','hall','hall','hall','hall','wall'],
          ['wall','wall','wall','wall','door','door','wall','wall','wall'],
          ['wall','hall','hall','hall','hall','hall','hall','hall','wall'],
          ['wall','wall','wall','wall','wall','wall','wall','wall','wall'],
        ];
        t.detail = layout;
        // SPAWN VALIDATION: the player starts at (4,4). Ensure it's not walled in.
        // BFS from spawn: need 15+ reachable cells and 2+ reachable doors.
        // If the layout fails, carve — don't ship a trap.
        this.validateSpawnArea(t, 4, 4);
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
        // the river is 2 wide, so the bridge must be 2 cells to actually span it.
        // (a 1-cell bridge stranded you mid-stream — water on the far side.)
        const bi = Math.floor(rnd() * 9);
        const rc = river.cells[bi];
        bridge = horizontal ? [{ x: bi, y: rc }, { x: bi, y: rc + 1 }]
                            : [{ x: rc, y: bi }, { x: rc + 1, y: bi }];
      }
      const nType = (dx, dy) => {
        const nx = x + dx, ny = y + dy;
        return (nx < 0 || ny < 0 || nx > 6 || ny > 6) ? t.type : this.tileAt(nx, ny).type;
      };
      // base cell picker by tile type
      const pick = (type) => {
        const r = rnd();
        // Steve 2026-10-04: chill out on obstacle density. Not everything is a
        // dense forest — blocking cells thinned so biomes breathe; the grove
        // stays the wildest, everything else opens up.
        switch (type) {
          case 'grove': return r < 0.30 ? 'tree' : r < 0.45 ? 'bush' : r < 0.55 ? 'plant' : r < 0.85 ? 'grass' : 'dirt';
          case 'meadow': return r < 0.55 ? 'grass' : r < 0.72 ? 'plant' : r < 0.82 ? 'bush' : 'dirt';
          case 'thicket': return r < 0.45 ? 'bush' : r < 0.6 ? 'plant' : r < 0.75 ? 'grass' : 'dirt';
          case 'wetland': return r < 0.20 ? 'water' : r < 0.5 ? 'plant' : r < 0.8 ? 'grass' : 'dirt';
          case 'creek': return r < 0.55 ? 'grass' : r < 0.65 ? 'plant' : 'dirt'; // river is the water, not random puddles
          case 'forest_floor': return r < 0.18 ? 'tree' : r < 0.3 ? 'plant' : r < 0.6 ? 'dirt' : 'grass';
          case 'trail_edge': return r < 0.4 ? 'dirt' : r < 0.7 ? 'grass' : r < 0.8 ? 'plant' : 'bush';
          case 'ruin': return r < 0.25 ? 'rubble' : r < 0.37 ? 'wall' : r < 0.5 ? 'plant' : r < 0.75 ? 'dirt' : 'grass';
          case 'haven': return r < 0.08 ? 'tent' : r < 0.12 ? 'fire' : r < 0.5 ? 'dirt' : 'grass';
          default: return 'grass';
        }
      };
      for (let cy = 0; cy < N; cy++) {
        const row = [];
        for (let cx = 0; cx < N; cx++) {
          let cell = pick(t.type);
          // edge blending: 2 outer rows/cols lean toward the neighbor's type.
          // (runs BEFORE the river override — the river and its bridge always win.)
          const edgeN = cy < 2 ? nType(0, -1) : null;
          const edgeS = cy > 6 ? nType(0, 1) : null;
          const edgeW = cx < 2 ? nType(-1, 0) : null;
          const edgeE = cx > 6 ? nType(1, 0) : null;
          const edge = edgeN || edgeS || edgeW || edgeE;
          if (edge && edge !== t.type && rnd() < 0.55) {
            const blended = pick(edge);
            // edge blending is flavor, not fortification: a blocking cell from the
            // neighbor's palette (tent, wall, fire) could seal off the bridge or a region.
            if (!this.cellProps(blended).blocks) cell = blended;
          }
          // river overrides: water (blocks), bridge (passable). applied last — it wins.
          if (river) {
            const horiz = river.horizontal;
            const rc = river.cells[horiz ? cx : cy];
            const isRiver = horiz ? (cy === rc || cy === rc + 1) : (cx === rc || cx === rc + 1);
            if (isRiver) {
              const isBridge = bridge && bridge.some(b => cx === b.x && cy === b.y);
              cell = isBridge ? 'bridge' : 'water';
            }
          }
          // trail cuts a path (only if actually that type).
          // (the old creek channel-carve is gone: it was redundant with the river and
          // shattered the tile into unreachable pockets. the river + bridge is the water.)
          if (t.type === 'trail_edge' && cy >= 3 && cy <= 5) cell = 'dirt';
          row.push(cell);
        }
        cells.push(row);
      }
      // big trees: 2x2 clusters that can straddle edges — the "splits biomes" feel.
      // never on the bridge (you'd have to chop through a tree to cross) or the spawn cell.
      const bigTrees = Math.floor(rnd() * 3);
      const isBridgeCell = (cx, cy) => bridge && bridge.some(b => b.x === cx && b.y === cy);
      for (let i = 0; i < bigTrees; i++) {
        const bx = Math.floor(rnd() * 8), by = Math.floor(rnd() * 8);
        const cells4 = [[bx,by],[bx+1,by],[bx,by+1],[bx+1,by+1]];
        if (cells4.some(([cx, cy]) => isBridgeCell(cx, cy) || (cx === 4 && cy === 4))) continue;
        for (const [cx, cy] of cells4) cells[cy][cx] = 'bigtree';
      }
      // BRIDGE EXITS: the cells on either side of the bridge (along the crossing axis)
      // must be walkable. A tree/bigtree there seals the far bank — bridge to nowhere.
      if (t.type === 'creek' && bridge && bridge.length === 2) {
        const horiz = river && river.horizontal;
        const exits = horiz
          ? [[bridge[0].x, bridge[0].y - 1], [bridge[1].x, bridge[1].y + 1]]
          : [[bridge[0].x - 1, bridge[0].y], [bridge[1].x + 1, bridge[1].y]];
        for (const [ex, ey] of exits) {
          if (ex < 0 || ey < 0 || ex > 8 || ey > 8) continue;
          if (this.cellProps(cells[ey][ex]).blocks) cells[ey][ex] = 'grass';
        }
      }
      // SPAWN SAFETY: travelTo now enters at the matching edge (see findWalkableEntry),
      // with BFS fallback to the nearest walkable cell. On creek tiles the
      // river/channel could leave the edge ringed by water — so (4,4) is still
      // guaranteed walkable with at least one walkable orthogonal neighbor,
      // as the ultimate fallback anchor.
      if (t.type === 'creek') {
        const blocksAt = (cx, cy) => {
          if (cx < 0 || cy < 0 || cx > 8 || cy > 8) return true;
          const pr = this.cellProps(cells[cy][cx]);
          return !!pr.blocks;
        };
        if (blocksAt(4, 4)) cells[4][4] = 'grass';
        const nbs = [[4,3],[4,5],[3,4],[5,4]].filter(([nx, ny]) => !blocksAt(nx, ny));
        if (!nbs.length) {
          // open toward the bridge if there is one, else any direction
          const toward = bridge && bridge.length ? bridge[0] : { x: 4, y: 0 };
          const dx = Math.sign(toward.x - 4), dy = Math.sign(toward.y - 4);
          const ox = dx !== 0 ? 4 + dx : 4, oy = dx !== 0 ? 4 : 4 + dy;
          cells[oy][ox] = 'grass';
        }
      }
      t.detail = cells;
      // SPECIES TRUTH: the game knows what's growing where. Every plant/bush
      // cell gets a species from the biome table (seeded — stable across
      // visits). The PLAYER sees it only through knowledge: grid glyphs and
      // names are gated on plantKnown. Foraging never reveals — it harvests.
      this.assignCellSpecies(t, cells, x, y);
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
      } else if (t.maxStock > 0 && t.stock < t.maxStock) {
        // STRIPPED BEFORE YOU ARRIVED (forager loop 2026-10-05): villagers
        // nibbled this tile abstractly before your first visit. The grid must
        // tell the truth — mark the depleted share of cells as regrowing, so
        // the player doesn't walk onto a "depleted" tile and sweep a full grid
        // (or get locked out after one press by a stale abstract number).
        const ratio = Math.max(0, Math.min(1, t.stock / t.maxStock));
        const keep = Math.round(count * ratio);
        let toStrip = count - keep;
        t.detailRegrow = t.detailRegrow || {};
        const day = this.state.scholar ? this.state.scholar.day : 0;
        for (let sy = 0; sy < 9 && toStrip > 0; sy++) for (let sx = 0; sx < 9 && toStrip > 0; sx++) {
          const c = cells[sy][sx];
          if (!FORAGEABLE[c]) continue;
          const dk = sx + ',' + sy;
          if (t.detailRegrow[dk]) continue;
          // REGROW TIMING (forager loop 2026-10-05): the tag is the last barren
          // day, not the first productive one — regrowTiles() restores during
          // endDay BEFORE day++, so a tag of D restores at the end of day D
          // and is playable on D+1. Foraged day N -> tag N+2 -> playable N+3:
          // "the plant you picked comes back in 3 days", as promised.
          t.detailRegrow[dk] = { day: day + 2, was: c };
          if (c === 'plant') cells[sy][sx] = 'dirt'; // trees/bushes stand, just picked clean
          toStrip--;
        }
        t.maxStock = count; t.stock = keep;
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

    // HAVEN STORES ACCESS (Steve 2026-10-04): the pantry, caches, and village
    // stash are PHYSICAL. You use them with your hands, inside the hall — not
    // by thinking about them from the treeline. Returns 'inside' (in the
    // hall), 'remote' (Full Integration: the System manifests the manifest —
    // requisition from anywhere, the aliens' logistics), or 'none'.
    havenStoresAccess() {
      try {
        const s = this.state.scholar;
        if (s && s.insideHaven && this.playerTile().type === 'haven') return 'inside';
        if (typeof this.integrationStage === 'function' && this.integrationStage() >= 3) return 'remote';
      } catch (e) {}
      return 'none';
    },

    // --- WOOD: the building material. Terraforming yields it, construction spends it. ---
    // CONSTRUCTION (future): walls, palisades, shelters hook in here.
    // tile.structures[] is the foundation — anything built on a tile lives there.
    woodCount() {
      const inv = this.state.scholar.inventory || [];
      const w = inv.find(i => i.itemId === 'wood' || i.id === 'wood');
      return w ? (w.units || 0) : 0;
    },
    addWood(n) {
      const inv = this.state.scholar.inventory || [];
      let w = inv.find(i => i.itemId === 'wood' || i.id === 'wood');
      if (w) w.units = (w.units || 0) + n;
      else inv.push({ itemId: 'wood', id: 'wood', name: 'Wood log', units: n, kcalEach: 0, kg: 2.0, unit: 'log' });
    },
    spendWood(n) {
      const inv = this.state.scholar.inventory || [];
      const w = inv.find(i => i.itemId === 'wood' || i.id === 'wood');
      if (!w || (w.units || 0) < n) return false;
      w.units -= n;
      if (w.units <= 0) inv.splice(inv.indexOf(w), 1);
      return true;
    },

    // --- TERRAFORMING: cut trees, clear brush. The land remembers what you did. ---
    // Costs a day-part + calories. Yields wood. The cell changes permanently.
    cutTree(cx, cy) {
      if (this.over) return null;
      const t = this.playerTile();
      const detail = this.genDetail(this.map.px, this.map.py);
      const cell = detail[cy] && detail[cy][cx];
      if (cell !== 'tree' && cell !== 'bigtree') { this.say('Nothing to cut there.'); return null; }
      const px = this.state.scholar.mx ?? 4, py = this.state.scholar.my ?? 4;
      if (Math.max(Math.abs(cx - px), Math.abs(cy - py)) > 1) { this.say('Too far. Step closer.'); return null; }
      const big = cell === 'bigtree';
      // Felling a tree is real work.
      this.state.scholar.kcal = Math.max(0, this.state.scholar.kcal - 80);
      // WOODLORE (Steve): knowing wood is a skill. The knowledgeable pick the
      // right tree — straight grain, good burn — and get more from the work.
      // The ignorant take the nearest trunk. Wood is wood. Button honest.
      const lore = this.woodloreKnown();
      let wood = big ? 4 + Math.floor(Math.random() * 3) : 2 + Math.floor(Math.random() * 3);
      if (lore) {
        wood = Math.ceil(wood * 1.5);
        if (!this.state.codex.woodWise && Math.random() < 0.3) { this.state.codex.woodWise = true; }
      }
      this.addWood(wood);
      // The tree is gone. The tile remembers.
      detail[cy][cx] = 'dirt';
      const key = cx + ',' + cy;
      if (t.secrets) delete t.secrets[key];
      if (t.modifiers) delete t.modifiers[key];
      // stock recount: one less forageable
      if (t.stock > 0) t.stock--;
      this.say(lore
        ? `You pick the straight one — good grain, splits clean, burns hot. The ${big ? 'big tree' : 'tree'} comes down with a crack that echoes. +${wood} wood.`
        : `${big ? 'The big tree' : 'The tree'} comes down with a crack that echoes. +${wood} wood. The ground is clear now.`);
      this.checkQuest('terraform');
      // ACTION CLOCK: felling a tree = 3 chunks (96 ticks) + 80 kcal effort (above).
      return this.tickAction(96) || this.status();
    },
    clearBrush(cx, cy) {
      if (this.over) return null;
      const t = this.playerTile();
      const detail = this.genDetail(this.map.px, this.map.py);
      const cell = detail[cy] && detail[cy][cx];
      if (cell !== 'bush') { this.say('Nothing to clear there.'); return null; }
      const px = this.state.scholar.mx ?? 4, py = this.state.scholar.my ?? 4;
      if (Math.max(Math.abs(cx - px), Math.abs(cy - py)) > 1) { this.say('Too far. Step closer.'); return null; }
      this.state.scholar.kcal = Math.max(0, this.state.scholar.kcal - 40);
      this.addWood(1); // brushwood
      detail[cy][cx] = 'grass';
      const key = cx + ',' + cy;
      if (t.secrets) delete t.secrets[key];
      if (t.modifiers) delete t.modifiers[key];
      if (t.bushSpecies) delete t.bushSpecies[key];
      if (t.stock > 0) t.stock--;
      this.say('You clear the brush. +1 wood (brushwood). Easier walking here now.');
      this.checkQuest('terraform');
      // ACTION CLOCK: clearing brush = 1 chunk (32 ticks) + 40 kcal effort (above).
      return this.tickAction(32) || this.status();
    },

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

    // BLOCKED PATHS: returns {blocked} info instead of traveling, so the UI
    // can offer solutions. Multiple ways through, always: cut, clear, bridge,
    // swim, or go around. Never one mandatory path.
    travelBlockage(x, y) {
      const dest = this.tileAt(x, y);
      const dx = Math.sign(x - this.map.px), dy = Math.sign(y - this.map.py);
      // tile-entry blockage (fallen tree, rubble, washed out)
      const bf = dest.blockFrom;
      if (bf && bf.dx === -dx && bf.dy === -dy) {
        return { kind: 'blockage', blockType: bf.type, x, y };
      }
      // hard creek crossing: bridge it, swim it, or go around
      if (dest.type === 'creek' && dest.needsBridge && !dest.bridged) {
        const canSwim = (this.state.scholar.abilities || []).some(a => (a.id || a) === 'swimmer') ||
                        (this.state.scholar.backgroundAbilities || []).some(a => (a.id || a) === 'swimmer');
        if (!canSwim) return { kind: 'blockage', blockType: 'creek', x, y };
      }
      return null;
    },
    // clear a blockage by work. fallen_tree -> cut (yields wood!), rubble -> clear.
    // costs a day-part. the path stays clear.
    clearBlockage(x, y) {
      const dest = this.tileAt(x, y);
      const bf = dest.blockFrom;
      if (!bf) {
        // NO SILENT ACTIONS (explorer loop 2026-10-05): a creek blockage is
        // not clearable by hand — bridge it or swim it. Say so; don't die quiet.
        if (dest.type === 'creek' && dest.needsBridge && !dest.bridged) {
          this.say('The creek runs fast here — you can\'t clear it with your hands. Bridge it (4 wood) or swim it.');
        } else {
          this.say('Nothing to clear here.');
        }
        return false;
      }
      if (bf.type === 'fallen_tree') {
        this.state.scholar.kcal = Math.max(0, this.state.scholar.kcal - 60);
        this.addWood(2);
        this.say('You cut through the fallen tree. +2 wood. The path is clear.');
      } else if (bf.type === 'rubble') {
        this.state.scholar.kcal = Math.max(0, this.state.scholar.kcal - 40);
        this.say('You clear the rubble, stone by stone. The path is clear.');
        // STONE: rubble yields sling ammo / crafting material.
        const n = 1 + Math.floor(Math.random() * 3);
        this.state.scholar.inventory.push({ material: 'stone', units: n, name: 'Stone', kcalEach: 0, spoilDay: 9999, kg: 0.3 });
        this.say(`You pocket ${n} good throwing stone${n > 1 ? 's' : ''}. (sling ammo)`);
      } else if (bf.type === 'washed_out') {
        return this.buildBridge(x, y); // washed out needs a bridge
      } else {
        // unknown blockage type: never delete it silently, never eat the work.
        this.say('You can\'t clear that by hand.');
        return false;
      }
      delete dest.blockFrom;
      // ACTION CLOCK: clearing a blockage = 1 chunk (32 ticks) + effort kcal (above).
      return this.tickAction(32) || this.status();
    },
    // build a bridge: 4 wood, permanent. for washed-out paths and hard creeks.
    // CONSTRUCTION (future): walls/palisades will use the same pattern — spend wood, tile.structures[].
    buildBridge(x, y) {
      const dest = this.tileAt(x, y);
      if (this.woodCount() < 4) { this.say('Need 4 wood to build a bridge.'); return false; }
      this.spendWood(4);
      dest.bridged = true;
      if (dest.blockFrom && dest.blockFrom.type === 'washed_out') delete dest.blockFrom;
      dest.structures = dest.structures || [];
      dest.structures.push({ type: 'bridge', builtDay: this.state.scholar.day });
      this.say('You lash logs together. A rough bridge spans the gap. It\'ll hold.');
      // ACTION CLOCK: building = 3 chunks (96 ticks) + 60 kcal effort. Construction is work.
      this.state.scholar.kcal = Math.max(0, (this.state.scholar.kcal || 0) - 60);
      return this.tickAction(96) || this.status();
    },
    // HAVEN DOORS: the building has an inside and an outside. Doors are real.
    // Step through and you're on the Haven grounds — tents, fire pit, the world beyond.
    exitBuilding() {
      const s = this.state.scholar;
      s.insideHaven = false;
      // invalidate the cached detail — the grounds are a different place than the hall
      const t = this.tileAt(this.map.px, this.map.py);
      if (t && t.type === 'haven') t.detail = null;
      // you emerge on the grounds, south of the lodge, facing the world
      s.mx = 4; s.my = 2; s.facing = { x: 0, y: 1 };
      // THE DOOR MOVES ONLY YOU (+ party/followers). Everyone else keeps their
      // own inside/outside sub-state — nobody teleports with you.
      try {
        for (const vid of this.travelingWith()) this.npcSetInside(vid, false);
        this.placePartyAtPlayer();
      } catch (e) {}
      this.say('You push through the doors into open air. Haven grounds — tents, a fire pit, worn paths. The world is that way.');
      // MONSTERS WAIT (Steve 2026-10-05): if you fled through a door, they're
      // still out here. They didn't leave. Going back out re-engages.
      const waiting = this.state.doorFledMonsters;
      if (waiting && waiting.length) {
        this.state.doorFledMonsters = null;
        this.say('⚠️ They\'re still here. Waiting.');
        // Re-engage with the first monster — they were waiting for you.
        const first = waiting[0];
        try {
          this.startCombat(first.id);
        } catch (e) {}
      }
      return true;
    },
    enterBuilding() {
      const s = this.state.scholar;
      // STATE INTEGRITY: the hall is at Haven. Going "inside" from a
      // thicket six tiles out would desync inside/outside (and with it the
      // pantry/stash gate). Refuse anywhere but the haven node.
      try {
        const t0 = this.playerTile();
        if (!t0 || t0.type !== 'haven') return false;
      } catch (e) { return false; }
      s.insideHaven = true;
      const t = this.tileAt(this.map.px, this.map.py);
      if (t && t.type === 'haven') t.detail = null;
      // you step into the hall, just inside the doors
      s.mx = 4; s.my = 7; s.facing = { x: 0, y: -1 };
      // Party/followers come in with you. Everyone else stays where they are.
      try {
        for (const vid of this.travelingWith()) this.npcSetInside(vid, true);
        this.placePartyAtPlayer();
      } catch (e) {}
      this.say('Inside. The hall smells of smoke and twelve people. Home.');
      return true;
    },
    // edgeExit: standing on the rim of the 9x9? That's the way to the next node.
    // Returns {dx,dy,dir} or null. Travel is orthogonal — corners pick the axis you tapped last.
    edgeExit(cx, cy) {
      if (cx === 0) return { dx: -1, dy: 0, dir: 'west' };
      if (cx === 8) return { dx: 1, dy: 0, dir: 'east' };
      if (cy === 0) return { dx: 0, dy: -1, dir: 'north' };
      if (cy === 8) return { dx: 0, dy: 1, dir: 'south' };
      return null;
    },
    // tryNodeExit: stepping off the 9x9 rim crosses to the next node automatically.
    // Steve 2026-10-04: no tap-yourself, no confirmation. Blocked exits stop you.
    // Returns { moved:true } | { blocked:block } | null (no exit attempted).
    tryNodeExit(dx, dy) {
      if (this.tbfight) return null;
      const s = this.state.scholar;
      const inside = s.insideHaven && this.playerTile().type === 'haven';
      if (inside) return null;
      const ex = dx < 0 ? { dx: -1, dy: 0, dir: 'west' }
        : dx > 0 ? { dx: 1, dy: 0, dir: 'east' }
        : dy < 0 ? { dx: 0, dy: -1, dir: 'north' }
        : { dx: 0, dy: 1, dir: 'south' };
      const nx = this.map.px + ex.dx, ny = this.map.py + ex.dy;
      if (nx < 0 || nx > 6 || ny < 0 || ny > 6) return null;
      const block = this.travelBlockage(nx, ny);
      if (block) return { blocked: block, dir: ex.dir };
      this.travelTo(nx, ny);
      return { moved: true, dir: ex.dir };
    },
    // findWalkableEntry: nearest walkable cell to a desired entry point.
    // The edge you want might be water, trees, or wall — BFS outward to
    // the nearest shore instead of spawning you somewhere absurd.
    findWalkableEntry(tx, ty, wantX, wantY) {
      const detail = this.genDetail(tx, ty);
      const walkable = (cx, cy) => {
        if (cx < 0 || cy < 0 || cx > 8 || cy > 8) return false;
        const cell = detail[cy] && detail[cy][cx];
        return !!cell && !this.cellProps(cell).blocks;
      };
      const sx = Math.max(0, Math.min(8, wantX)), sy = Math.max(0, Math.min(8, wantY));
      if (walkable(sx, sy)) return { x: sx, y: sy };
      const seen = new Set([sy * 9 + sx]);
      const queue = [[sx, sy]];
      while (queue.length) {
        const [cx, cy] = queue.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy, k = ny * 9 + nx;
          if (nx < 0 || ny < 0 || nx > 8 || ny > 8 || seen.has(k)) continue;
          seen.add(k);
          if (walkable(nx, ny)) return { x: nx, y: ny };
          queue.push([nx, ny]);
        }
      }
      return { x: 4, y: 4 }; // unreachable in practice — every detail has walkable cells
    },
    travelTo(x, y, force) {
      const dest = this.tileAt(x, y);
      const wasUnknown = !dest.revealed;
      if (this.over) return null;
      const t = this.travelTargets().find(t => t.x === x && t.y === y);
      if (!t) return null;
      // blocked? don't travel — return the blockage so the UI can offer solutions.
      // (force bypasses: swimming doesn't fix the path, it just gets you across.)
      if (!force) {
        const block = this.travelBlockage(x, y);
        if (block) {
          // NO SILENT ACTIONS (explorer loop 2026-10-05): a blocked travel tap
          // must say what blocks you even when the caller also shows the
          // blockage card. The card and the log agree.
          const what = block.blockType === 'creek' ? 'The creek runs fast here — no crossing without a bridge or a swim.'
            : block.blockType === 'fallen_tree' ? 'A fallen tree blocks the path.'
            : block.blockType === 'rubble' ? 'Rubble chokes the path.'
            : block.blockType === 'washed_out' ? 'The path is washed out.'
            : 'Something blocks the path.';
          this.say(what);
          return block;
        }
      }
      const odx = Math.sign(x - this.map.px), ody = Math.sign(y - this.map.py);
      // CONTINUOUS TRAVEL: remember where you stood on the old node so you can
      // walk onto the new one at the matching spot — not the middle.
      const oldMx = this.state.scholar.mx ?? 4, oldMy = this.state.scholar.my ?? 4;
      this.map.px = x; this.map.py = y;
      this.state.scholar.facing = { x: odx || 0, y: ody || 1 };
      this.reveal(x, y);
      const tile = this.playerTile();
      // NODE TRAVEL IS FREE (Steve 2026-10-05): crossing a node boundary is
      // just walking. The steps to reach the edge already cost. No extra
      // kcal tax, no tick cost for the boundary itself.
      this.noteTrailUse(); // RELIC BOND: the boots walked.
      // SYNERGY passives: cold_blooded + hollow_bones work while traveling.
      this.noteAbilityUse('cold_blooded');
      this.noteAbilityUse('hollow_bones');
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
      // CONTINUOUS TRAVEL: you walk off one map, you walk onto the next.
      // Enter at the edge you came from (opposite the travel direction),
      // keeping your column/row so the world feels connected.
      // Grid north is cy=0, south is cy=8; map y grows southward, so a
      // northward trip (ody=-1) enters at the south edge (my=8).
      const clamp9 = v => Math.max(0, Math.min(8, v));
      const entryX = odx > 0 ? 0 : odx < 0 ? 8 : clamp9(oldMx);
      const entryY = ody > 0 ? 0 : ody < 0 ? 8 : clamp9(oldMy);
      const entry = this.findWalkableEntry(x, y, entryX, entryY);
      this.state.scholar.mx = entry.x; this.state.scholar.my = entry.y;
      // LIVING WORLD: NPCs who are on this node get grid positions. You might
      // run into someone out here — they're living their own lives.
      // (Runs after the player is placed, so nobody spawns on your entry cell.)
      this.ensureVillagerPositions();
      // traveling means you're outside. (Arriving at Haven puts you on the grounds —
      // tap the lodge to go back inside.)
      this.state.scholar.insideHaven = false;
      // Party/followers travel with you — they're outside too, same sub-state.
      try { for (const vid of this.travelingWith()) this.npcSetInside(vid, false); } catch (e) {}
      const ht = this.tileAt(3, 3);
      if (ht && ht.type === 'haven') ht.detail = null;
      // MONSTERS FOLLOW (if they want to). Territorial and hungry ones do. Skittish ones don't.
      const oldMonster = this.state.scholar.monster;
      if (oldMonster) {
        const mdef = this.data.monsters.find(m => m.id === oldMonster.id);
        if (mdef && mdef.follows) {
          // FOLLOW RE-ENTRY (explorer loop 2026-10-05): the monster chases
          // you through the boundary and enters the NEW grid at the edge you
          // came from, a step or two behind you. Its old mx/my belonged to
          // the old tile — keeping them made it hunt stale cells forever: a
          // ghost that followed for days without ever reaching you, while
          // occupying the monster slot and blocking every new encounter.
          let fmx = odx > 0 ? 0 : odx < 0 ? 8 : clamp9(oldMx);
          let fmy = ody > 0 ? 0 : ody < 0 ? 8 : clamp9(oldMy);
          // offset along the edge so it doesn't land on top of you
          if (odx !== 0) fmy = clamp9(fmy + 2); else fmx = clamp9(fmx + 2);
          const fe = this.findWalkableEntry(x, y, fmx, fmy);
          oldMonster.mx = fe.x; oldMonster.my = fe.y;
          oldMonster.lostSight = 0; // it saw you cross. it's on your trail.
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
      // DRIFTER: arriving near another village announces it NOW — not whenever
      // the day-part happens to turn. You walked up to their smoke; you see it.
      // (checkVillageProximity also runs on part turns; the generated flag
      // keeps it from double-firing.)
      this.checkVillageProximity();
      // DRIFTER: stepping onto their tile says so. It's their clearing, not scenery.
      const hereV = (this.state.otherVillages || []).find(v => v.x === x && v.y === y && v.generated);
      if (hereV) this.say(`${hereV.name}'s clearing. Voices, a cookfire, somebody else's home. You're a guest here — act like it.`);
      // TIME ECONOMY: moving between nodes is a BIG time step on the unified clock.
      // travelTimeStep ticks 32 (a "bigger tick"): NPC batch + day timer advance
      // proportionally, like everything else. No separate clock, no free moves.
      // (Tuning: if travel feels free, raise the needs tick / energy cost
      // in travelTimeStep. If punishing, lower it. See docs/TIME-ECONOMY.md.)
      this.travelTimeStep();
    },

    // travelTimeStep: the world moves while you travel. NPCs take a full
    // batch turn at their own speed, wants grow, gossip spreads one hop.
    // This is "a portion of the day" passing — visible in the world,
    // not deducted from your 4 actions.
    travelTimeStep() {
      // NODE TRAVEL IS FREE (Steve 2026-10-05): no tick cost, no energy cost.
      // The boundary is just walking. NPCs still get their batch turn because
      // time passes, but the player isn't taxed for crossing.
      try { this.tickNeeds(); } catch (e) {}
      try { this.spreadGossip(); } catch (e) {}
    },

    // micro-move: step to an adjacent cell in the 9x9. 1 tick of time, no effort.
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
      // FACING: you face where you step. The marker shows it.
      s.facing = { x: Math.sign(cx - px), y: Math.sign(cy - py) };
      // LOOKING AROUND IS FREE. Single steps are exploration, not travel.
      // (Committed walks via movePath still cost — that's a decision.)
      const cost = 0;
      // Movement is baseline. Power doesn't tax walking.
      s.kcal = Math.max(0, s.kcal - cost);
      s.mx = cx; s.my = cy;
      // MONSTERS MOVE WHEN YOU DO. A step can spook, warn, or trigger —
      // the stance machine runs on steps, not just on interacts. (It didn't.
      // Walking up to a deer did nothing until you touched something.)
      this.monsterTurn(); this.animalTurn();
      // ACTION CLOCK: a step is 1 tick. Strolling is time-only — no effort cost.
      // Monsters, animals, and villagers move on their own schedule (or when you ACT).
      // But steps ACCUMULATE: every TICKS_PER_BATCH ticks, NPCs take a batch turn.
      this.ensureVillagerPositions();
      this.tickAction(1);
      return true;
    },

    // cellInteract: tap a cell to USE it. but it's a MAYBE — you learn the truth up close.
    // tree might have nuts or be ivy. water might be poison. tent might be shredded.
    // knowledge sticks: once you know, you know.
    // ACTION CLOCK: a successful interact costs 1 tick (a glance is time-only, 0 effort).
    cellInteract(cx, cy) {
      const r = this._cellInteract(cx, cy);
      if (r) this.tickAction(1);
      return r;
    },
    _cellInteract(cx, cy) {
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
      // EXAMINE IS INSPECTION. The first look describes the tree and takes THIS
      // tree's own nuts (examine + this cell's loot, like searchRoom) — it does
      // NOT run the area forage sweep. (Explorer loop 2026-10-05: Examine fired
      // the full 3x3 sweep — 16 ticks, full-patch depletion, pack flood —
      // behind an inspection tap. Steve's rule: low-effort inspection must not
      // eat the day. The sweep stays where the player asked for it: 'Forage nuts'.)
      if (cell === 'tree' || cell === 'bigtree') {
        const mod = t.modifiers && t.modifiers[key];
        if (secret && !secret.known) {
          secret.known = true;
          if (mod) mod.known = true;
          const desc = mod ? `${mod.species}, ${mod.health}${mod.ivy ? ', ivy-covered' : ''}` : 'a tree';
          if (secret.yield === 0) {
            this.say(`This ${desc}. Nothing to take. You note it — you won\'t waste time here again.`);
            return true;
          } else if (mod && (mod.species === 'oak' || mod.species === 'hickory')) {
            this.say(`This ${desc}. Nuts — about ${secret.yield} worth.`);
            this.takeTreeNuts(t, cx, cy, secret);
          } else {
            // pine (and unknown trees): no nut plant in the content pool.
            // honest: you're working the ground around it, not harvesting nuts.
            this.say(`This ${desc}. No nuts worth the trouble — but something might grow in its shade.`);
          }
          return true; // examined. the sweep is a separate, explicit choice ('Forage nuts').
        } else if (secret && secret.known && secret.yield === 0) {
          this.say('You already checked. Nothing.');
          return true;
        }
        return this.doAction('forage', { cx, cy });
      }
      // WATER: flow + clarity + source synthesize. running is better than stagnant.
      if (cell === 'water') {
        const mod = t.modifiers && t.modifiers[key];
        if (secret && !secret.known) {
          secret.known = true;
          if (mod) mod.known = true;
          const desc = mod ? `${mod.flow}, ${mod.clarity}, ${mod.source}` : 'water';
          const wise = this.waterSafetyKnown();
          if (!secret.safe) {
            if (wise) this.say(`This water is ${desc}. Wrong. Poison. You mark it. Don\'t drink.`);
            else this.say(`Water: ${desc}. You can't tell if it's safe — clear doesn't mean clean. (Someone with water knowledge could tell.)`);
            return true;
          } else {
            if (wise) this.say(`Water: ${desc}. Safe. You drink.`);
            else this.say(`Water: ${desc}. Looks clear enough — you drink and hope.`);
          }
        } else if (secret && secret.known && !secret.safe) {
          this.say('Poison water. You know better.');
          return true;
        }
        return this.doAction('drink');
      }
      // TENT: maybe good, shredded, or packable. Looking is cheap and always
      // says something. RESTING is a separate explicit decision (96 ticks —
      // most of a day part) and must never be a silent side effect of
      // examining. (That stole 97 ticks per "examine" tap.)
      if (cell === 'tent') {
        if (secret && !secret.known) {
          secret.known = true;
          if (secret.condition === 'shredded') {
            this.say('The tent is shredded — wind and teeth. Not usable. You leave it.');
            return true;
          } else if (secret.condition === 'packable') {
            // PACK-UP FIX (survivalist loop 2026-10-05): this used to promise
            // "Shelter for later" and grant nothing — the tent just vanished.
            // Now it becomes a real packed tent in your inventory.
            const tentItem = { kind: 'tent', name: 'Packed tent', units: 1, kg: 2.5, kcalEach: 0, spoilDay: 9999, unit: 'tent', prep: 'Pitch it on clear ground for shelter.' };
            if (!this.canCarry(tentItem.kg)) { this.say('This tent is intact — and light. But your pack can\'t take it. Eat something or drop weight.'); return true; }
            this.state.scholar.inventory.push(tentItem);
            this.say('This tent is intact — and light. You pack it up. (Shelter for later — pitch it on clear ground.)');
            detail[cy][cx] = 'dirt'; // it's gone, you took it
            return true;
          }
          this.say('A good tent. Dry inside. (Resting here takes most of the day part — use Rest when you mean it.)');
          return true;
        }
        if (secret && secret.known) {
          if (secret.condition === 'shredded') { this.say('Shredded. You checked.'); return true; }
          this.say(secret.condition === 'packable'
            ? 'The packable tent, still here. (Pack up to take it.)'
            : 'The tent, as you left it. Dry inside. (Rest is its own action — it costs most of the day part.)');
          return true;
        }
        this.say('A tent. You give it a look — nothing more to learn from out here.');
        return true;
      }
      // BUSH: thorns hurt. you learn to be careful.
      if (cell === 'bush') {
        const mod = t.modifiers && t.modifiers[key];
        if (mod) mod.known = true;
        if (secret) secret.known = true;
        // Learning the bush: it gets a species (game truth), neighbors chain-reveal.
        // The NAME is knowledge-gated: you recognize the patch only if you
        // know the species. Otherwise it's berries of unknown kind.
        const species = this.revealBush(cx, cy);
        if (this.plantKnown(species)) {
          const sp = this.data.plants.find(pp => pp.id === species);
          this.say(`It's a ${sp ? sp.name.toLowerCase() : species}. You'll recognize the patch now.`);
        } else {
          this.say(`A berry bush — berries, certainly, but you don't know which kind. (The harvest sorts at camp, with someone who knows.)`);
        }
        if (secret && secret.thorns) {
          this.state.scholar.kcal -= 20; // thorns scratch
          this.say('Thorns. You get the berries, but they take a little blood. (-20 kcal)');
        }
        return this.doAction('forage', { cx, cy });
      }
      if (cell === 'plant') {
        const mod = t.modifiers && t.modifiers[key];
        if (mod) mod.known = true;
        if (secret) secret.known = true;
        return this.doAction('forage', { cx, cy });
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
        return this.doAction('forage', { cx, cy });
      }
      return null;
    },

    // takeTreeNuts: examine takes THIS tree's nuts — a targeted take of the
    // tree's own yield, not the area sweep. Honest units ("about N worth"),
    // knowledge-gated naming (lump if unknown), pack-full leaves the nuts
    // up there (yield stays) instead of vanishing them.
    takeTreeNuts(t, cx, cy, secret) {
      const n = secret.yield || 0;
      const pid = this.cellPlantSpecies(t, cx, cy, 'tree');
      const plant = pid && this.data.plants.find(pp => pp.id === pid);
      if (!plant || n <= 0) { secret.yield = 0; return; }
      if (!this.canCarry(0.1 * n)) {
        this.say("Your pack can't take the nuts. Eat something, or leave them.");
        return;
      }
      secret.yield = 0;
      const scholar = this.state.scholar;
      const kcal = n * plant.caloriesPerUnit;
      if (this.plantKnown(pid)) {
        scholar.inventory.push(this.foodForageItem(plant, true, n, kcal, scholar.day));
        this.say('+' + n + 'x ' + plant.name + ' (+' + kcal + ' kcal).');
      } else {
        this.addUnknownToLump(plant, n, scholar.day);
        this.say('Unfamiliar unknown nuts — into the bag. (Unknowns lump together; sort them at camp.)');
      }
    },

    // ANIMALS: spawn by biome. they flee from you (not toward, like monsters).
    // rabbit in meadow, squirrel in grove, fish in creek, deer in forest, turkey in meadow/forest.
    checkAnimals() {
      const t = this.playerTile();
      const s = this.state.scholar;
      if (s.animal || Math.random() > 0.3) return; // 30% chance per tile entry
      const candidates = (this.data.animals || []).filter(a => (a.biomes || []).includes(t.type));
      if (!candidates.length) return;
      // NIGHT ECOLOGY: different animals after dark. The night has its own game —
      // opossum, raccoon, bullfrog instead of squirrel and turkey. Learn the schedule.
      const animal = this.pickByActivity(candidates) || candidates[Math.floor(Math.random() * candidates.length)];
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
      const dist = Math.max(Math.abs(a.mx - px), Math.abs(a.my - py));
      const detail = this.genDetail(this.map.px, this.map.py);
      const BLOCKS = { wall: 1, water: 1, bigtree: 1, tree: 1, tent: 1, fire: 1 };
      const tryMove = (nx, ny) => {
        nx = Math.max(0, Math.min(8, nx)); ny = Math.max(0, Math.min(8, ny));
        const cell = detail[ny] && detail[ny][nx];
        if (!BLOCKS[cell]) { a.mx = nx; a.my = ny; return true; }
        return false;
      };
      // ALIVE: animals are animals. graze when calm, freeze when wary, bolt when scared.
      const adef = (this.data.animals || []).find(x => x.id === a.id) || {};
      // DESCRIPTOR GATING: no true names pre-knowledge — the strange
      // descriptor, same as every other animal string (encounters.js).
      const aname = (typeof this.encDescribeAnimal === 'function')
        ? this.encDescribeAnimal(adef) : 'something moving';
      if (dist >= 4) {
        // grazing. it doesn't know you're here. or doesn't care yet.
        a.alerted = false;
        if (Math.random() < 0.3) {
          tryMove(a.mx + Math.floor(Math.random() * 3) - 1, a.my + Math.floor(Math.random() * 3) - 1);
        }
      } else if (dist >= 2) {
        // wary: freeze, assess. you can feel it deciding.
        if (!a.alerted) {
          a.alerted = true;
          if (Math.random() < 0.5) this.say(`${this.encCap(aname)} freezes — ears up, deciding about you.`);
        }
        // FOOD REALITY: the wary ones sometimes decide early and bolt.
        // Stalkers (tracker) get closer; the clumsy watch lunch leave.
        const wP = this.preyWariness ? this.preyWariness(adef) * 0.30 - this.abilityLevel('tracker') * 0.07 : 0;
        if (wP > 0 && Math.random() < wP) {
          a.bolted = true;
          this.say(`The ${aname} decides you're trouble and bolts!`);
          const dx2 = Math.sign(a.mx - px), dy2 = Math.sign(a.my - py);
          tryMove(a.mx + dx2 * 2, a.my + dy2 * 2) || tryMove(a.mx + dx2, a.my + dy2);
          if (a.mx === 0 || a.mx === 8 || a.my === 0 || a.my === 8) s.animal = null;
        }
      } else {
        // bolt: away, fast.
        if (!a.bolted) { a.bolted = true; this.say(`The ${aname} bolts!`); }
        const dx = Math.sign(a.mx - px), dy = Math.sign(a.my - py);
        tryMove(a.mx + dx * 2, a.my + dy * 2) || tryMove(a.mx + dx, a.my + dy);
      }
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
      this.state.scholar.equipped[slot] = { itemId: def.id, name: def.name,
        ...(item.bonded ? { bonded: true, bond: item.bond || 0, bondOffered: item.bondOffered || [], enhancements: item.enhancements || [] } : {}) };
      // remove from inventory (it's worn, not carried)
      this.state.scholar.inventory.splice(itemIdx, 1);
      this.say(`Equipped ${def.name} (${slot}).`);
      return null;
    },
    unequip(slot) {
      const eq = (this.state.scholar.equipped || {})[slot];
      if (!eq) return null;
      // back to inventory
      this.state.scholar.inventory.push({ itemId: eq.itemId, name: eq.name, units: 1, kcalEach: 0, kg: 0.5,
        ...(eq.bonded ? { bonded: true, bond: eq.bond || 0, bondOffered: eq.bondOffered || [], enhancements: eq.enhancements || [] } : {}) });
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
      if (name.includes('first aid') || name.includes('bandage') || name.includes('medicine')) return true;
      // ALIEN HEALING (Steve 2026-10-05): items with healAmount are usable.
      const def = (this.data.items || []).find(i => i.id === (item.itemId || item.id));
      if (def && def.healAmount) return true;
      // DICE (Steve 2026-10-05): "blame needs to be random." Roll with the
      // village — a moment of levity. Usable for cheer.
      if (def && def.id === 'dice_set') return true;
      return false;
    },

    // hasItem: do you carry this item? Tools are only honest if the game
    // checks for them — this is the check. (Steve 2026-10-05: ordinary tools
    // must have actual uses; baseEffect text without code was a lie.)
    hasItem(itemId) {
      return (this.state.scholar.inventory || []).some(i => (i.itemId || i.id) === itemId && (i.units || 1) > 0);
    },
    consumeItem(itemId, n) {
      const inv = this.state.scholar.inventory || [];
      const it = inv.find(i => (i.itemId || i.id) === itemId && (i.units || 1) > 0);
      if (!it) return false;
      it.units = (it.units || 1) - (n || 1);
      if (it.units <= 0) this.state.scholar.inventory = inv.filter(x => x !== it);
      return true;
    },

    // useItem: use it. First aid heals.
    useItem(idx) {
      const item = this.state.scholar.inventory[idx];
      if (!item || !this.isUsable(item)) return null;
      // RELIC BOND: you'd never use that up. It's yours.
      if (item.bonded) { this.say(`You'd never use up your ${item.name}. It's not a supply. It's yours.`); return null; }
      const name = item.name.toLowerCase();
      const def0 = (this.data.items || []).find(i => i.id === (item.itemId || item.id));
      // DICE (Steve 2026-10-05): roll with the village. Fast decisions, random
      // blame, real laughter. +cheer, once per day.
      if (def0 && def0.id === 'dice_set') {
        const v = this.state.village;
        const today = this.state.scholar.day;
        if ((v.diceDay || -1) === today) { this.say('You already rolled today. The dice need to cool off.'); return null; }
        v.diceDay = today;
        v.cheer = (v.cheer || 0) + 1;
        this.say('You roll the dice with whoever\'s nearby. Fast decisions, random blame, real laughter. (Village cheer +1.)');
        this.tickAction(8);
        return null;
      }
      if (name.includes('first aid')) {
        // triage: healing hands. First aid does more.
        const amt = Math.round(this.modTarget('healing.amount', 30));
        this.state.scholar.health = Math.min(this.maxHealth(), this.state.scholar.health + amt);
        this.say(`You use the first aid kit. +${amt} health.`);
      } else {
        // ALIEN HEALING (Steve 2026-10-05): healAmount items heal honestly.
        // STETHOSCOPE: diagnose first, treat better. +25% on any healing.
        const def = (this.data.items || []).find(i => i.id === (item.itemId || item.id));
        if (def && def.healAmount) {
          let amt = Math.round(this.modTarget('healing.amount', def.healAmount));
          if (this.hasItem('stethoscope')) {
            amt = Math.round(amt * 1.25);
            this.say('(The stethoscope finds the real problem first.)');
          }
          this.state.scholar.health = Math.min(this.maxHealth(), this.state.scholar.health + amt);
          this.say(`You use the ${item.name}. +${amt} health.`);
        }
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
        bunk: { interact: 'rest' }, lodge: { interact: 'enter' },
      };
      return P[cell] || {};
    },

    // === LINE OF SIGHT ===
    // Walls, trees, and tents block vision. Monsters don't aggro what they
    // can't see. Stealth is a valid strategy: break line of sight, slip away.
    // If it can't see you for a while, it loses your trail entirely.
    sightBlocked(x, y) {
      const detail = this.genDetail(this.map.px, this.map.py);
      const cell = detail[y] && detail[y][x];
      return cell === 'wall' || cell === 'tree' || cell === 'bigtree' || cell === 'tent';
    },

    canSee(ax, ay, bx, by) {
      // Bresenham line; blocked if any intermediate cell blocks sight
      let x0 = ax, y0 = ay;
      const dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
      const sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
      let err = dx - dy, guard = 0;
      while (!(x0 === bx && y0 === by) && guard++ < 30) {
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
        if (x0 === bx && y0 === by) break;
        if (x0 < 0 || x0 > 8 || y0 < 0 || y0 > 8) return false;
        if (this.sightBlocked(x0, y0)) return false;
      }
      return true;
    },

    // findPath: BFS shortest path avoiding blocked cells. Returns list of [x,y] or null.
    // 8-directional to match microMove/tap adjacency (Chebyshev): a diagonal step
    // is one square, not two. No corner-cutting through blocked cells.
    findPath(sx, sy, tx, ty) {
      const detail = this.genDetail(this.map.px, this.map.py);
      const key = (x, y) => `${x},${y}`;
      const visited = new Set([key(sx, sy)]);
      const queue = [[sx, sy, []]]; // [x, y, path]
      const DIRS = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
      while (queue.length) {
        const [x, y, path] = queue.shift();
        if (x === tx && y === ty) return path.length ? path : [[tx, ty]]; // path already ends at target
        for (const [dx, dy] of DIRS) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
          if (visited.has(key(nx, ny))) continue;
          const cell = detail[ny] && detail[ny][nx];
          const props = this.cellProps(cell);
          if (props.blocks) continue;
          // no corner-cutting: a diagonal step needs both orthogonal sides clear
          if (dx !== 0 && dy !== 0) {
            const c1 = detail[y] && detail[y][nx];
            const c2 = detail[ny] && detail[ny][x];
            if (this.cellProps(c1).blocks || this.cellProps(c2).blocks) continue;
          }
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
      if (path.length >= 2) {
        const [lx, ly] = path[path.length - 1];
        const [px2, py2] = path.length >= 2 ? path[path.length - 2] : [s.mx, s.my];
        s.facing = { x: Math.sign(lx - px2) || 0, y: Math.sign(ly - py2) || 1 };
      } else if (path.length === 1) {
        s.facing = { x: Math.sign(tx - s.mx) || 0, y: Math.sign(ty - s.my) || 1 };
      }
      s.mx = tx; s.my = ty;
      this.say(`Walked ${path.length} squares (${cost} kcal).`);
      this.ensureVillagerPositions();
      // Committed walks cross monster territory too — it notices per square.
      for (let i = 0; i < path.length && !this.tbfight; i++) { this.monsterTurn(); this.animalTurn(); }
      // ACTION CLOCK: committed walk = 1 tick per square (+10 kcal/square effort, above).
      this.tickAction(path.length);
      return true;
    },

    // beginPathWalk: validate + charge a committed walk UP FRONT (same costs
    // as movePath: 10 kcal/square), then hand the path to the UI to animate
    // step-by-step via pathStep. Returns the path ([[x,y],...]) or null.
    // The UI animates the FULL path — tap-to-move never teleports.
    beginPathWalk(tx, ty) {
      const s = this.state.scholar;
      const sx = s.mx ?? 4, sy = s.my ?? 4;
      if (tx === sx && ty === sy) return [];
      const path = this.findPath(sx, sy, tx, ty);
      if (!path) { this.say('No path there.'); return null; }
      const cost = path.length * 10;
      if (s.kcal < cost) { this.say(`Need ${cost} kcal, have ${Math.round(s.kcal)}. Eat first.`); return null; }
      s.kcal -= cost;
      const [lx, ly] = path[path.length - 1];
      const [p2x, p2y] = path.length >= 2 ? path[path.length - 2] : [sx, sy];
      s.facing = { x: Math.sign(lx - p2x) || 0, y: Math.sign(ly - p2y) || 1 };
      if (path.length > 1) this.say(`Walking ${path.length} squares (${cost} kcal)…`);
      return path;
    },

    // pathStep: ONE step of a committed walk. The kcal cost was prepaid by
    // beginPathWalk; this charges the 1 tick of time, runs the world
    // (monsters notice per square, villagers reposition), and revalidates
    // the tile — the world may have changed mid-walk. Returns true if the
    // step landed, false if the walk must stop here (caller purges the rest).
    pathStep(tx, ty) {
      const s = this.state.scholar;
      const px = s.mx ?? 4, py = s.my ?? 4;
      if (Math.abs(tx - px) > 1 || Math.abs(ty - py) > 1 || (tx === px && ty === py)) return false;
      if (tx < 0 || tx > 8 || ty < 0 || ty > 8) return false;
      const detail = this.genDetail(this.map.px, this.map.py);
      const cell = detail[ty] && detail[ty][tx];
      if (this.cellProps(cell).blocks) return false;
      s.facing = { x: Math.sign(tx - px), y: Math.sign(ty - py) };
      s.mx = tx; s.my = ty;
      // MONSTERS MOVE WHEN YOU DO — per square, same as microMove.
      this.monsterTurn(); this.animalTurn();
      this.ensureVillagerPositions();
      // ACTION CLOCK: one step = 1 tick. The beat you feel per step IS the cost.
      this.tickAction(1);
      return true;
    },

    // cleanWaterForCooking: clean liters reachable for cooking right now.
    // YOUR bottles anywhere; the village well only when you're AT haven.
    cleanWaterForCooking() {
      const s = this.state.scholar;
      let n = (s.water || []).filter(b => b.quality === 'clean').length;
      let atHaven = this.location === 'haven';
      try { const t = this.playerTile(); if (t && t.type === 'haven') atHaven = true; } catch (e) {}
      if (atHaven) n += Math.floor((this.state.village.water || {}).clean || 0);
      return n;
    },
    // spendCleanWater(liters): water for cooking. YOUR bottles first — you hauled it.
    // The village well backs you up only when you're AT haven. Cooking in the field
    // never drains Haven's well from miles away. Check cleanWaterForCooking() first.
    // Returns {fromBottles, fromWell}.
    spendCleanWater(liters) {
      const s = this.state.scholar;
      s.water = s.water || [];
      let need = liters, fromBottles = 0, fromWell = 0;
      for (let i = s.water.length - 1; i >= 0 && need > 0; i--) {
        if (s.water[i].quality === 'clean') { s.water.splice(i, 1); need--; fromBottles++; }
      }
      if (need > 0) {
        let atHaven = this.location === 'haven';
        try { const t = this.playerTile(); if (t && t.type === 'haven') atHaven = true; } catch (e) {}
        if (atHaven) {
          const vw = this.state.village.water = this.state.village.water || { clean: 0, dirty: 0 };
          const take = Math.min(need, Math.floor(vw.clean));
          vw.clean -= take; need -= take; fromWell = take;
        }
      }
      return { fromBottles, fromWell };
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
      // water cost: 1L per unit (camp_cook discounts: L1 half, L2 none).
      const cookLvl1 = this.abilityLevel('camp_cook');
      // TOOLS (Steve 2026-10-05): a camp pot is honest cookware — faster,
      // less water. A chef's knife preps properly — better yield.
      const hasPot = this.hasItem('camp_pot');
      const hasChefKnife = this.hasItem('chefs_knife');
      const waterMult1 = (cookLvl1 >= 2 || hasPot) ? 0 : cookLvl1 >= 1 ? 0.5 : 1;
      const kcalMult1 = (cookLvl1 >= 3 ? 1.25 : cookLvl1 >= 1 ? 1.1 : 1.0) * (hasChefKnife ? 1.15 : 1) * (hasPot ? 1.1 : 1);
      const units = item.units || 1;
      const cost1 = Math.ceil(units * waterMult1);
      if (item.needsCooking && this.cleanWaterForCooking() < cost1) {
        this.say(`Need ${cost1}L clean water to cook ${item.name} — haul water first.`);
        return null;
      }
      // cook it: rawKcal -> kcalEach (cooked)
      item.kcalEach = Math.round((item.cookedKcal || item.rawKcal * 1.5) * kcalMult1);
      item.rawKcal = null; // it's cooked now
      item.safe = true; // cooking kills the risk (mostly)
      if (item.needsCooking && cost1 > 0) {
        const spent = this.spendCleanWater(cost1);
        const src = spent.fromWell > 0 ? `${spent.fromBottles}L bottles + ${spent.fromWell}L haven well` : `${spent.fromBottles}L from your bottles`;
        this.say(`Cooked ${item.name}. ${item.kcalEach} kcal now (-${cost1}L water: ${src}).`);
      } else {
        this.say(`Cooked ${item.name}. ${item.kcalEach} kcal now.`);
      }
      // ACTION CLOCK: cooking = 1 chunk (32 ticks, tending the fire).
      // A camp pot works faster — proper cookware.
      this.tickAction(hasPot ? 16 : 32);
      return null;
    },

    // drinkWater: drink from a water source. Hydrates.
    // fillWater: fill ONE bottle (1L). Quality depends on source.
    // Haven well is clean — drawn from the shared village cistern (finite:
    // haulers refill it; the meal, cooking, and your bottles draw it down).
    // Creek and wild sources are free but risky (unknown) — boil at a fire,
    // or drink raw and roll the dice.
    fillWater() {
      const s = this.state.scholar;
      s.water = s.water || [];
      // WATER HAS MASS. 1L = 1kg against your carry limit — the pack from the
      // pantry UI already gates on this; filling a bottle at a creek must too.
      // (2026-10-05: wild runs filled 15-20L unboundedly past 20kg with no refusal.)
      if (!this.canCarry(1)) {
        this.say(`Your pack is full — water is heavy (1L = 1kg). Drink some or drop weight before filling.`);
        return null;
      }
      // Where are you? Only the Haven well is clean. Everything wild is unknown.
      const t = this.playerTile();
      const isCreek = t && t.type === 'creek';
      let atHaven = this.location === 'haven';
      try { if (t && t.type === 'haven') atHaven = true; } catch (e) {}
      if (atHaven) {
        // THE CISTERN IS REAL. Haven water comes from the shared supply —
        // that's why the well is where Haven is. It can run dry.
        const vw = this.state.village.water = this.state.village.water || { clean: 0, dirty: 0 };
        if ((vw.clean || 0) < 1) {
          this.say('The cistern is dry. Haul from a creek (risky water), or put someone on water duty.');
          return null;
        }
        vw.clean -= 1;
      }
      // HAULING WATER IS WORK. 10 kcal per liter. (nothing is free)
      s.kcal = Math.max(0, (s.kcal || 0) - 10);
      const quality = atHaven ? 'clean' : 'risky';
      const source = atHaven ? 'Haven well' : isCreek ? 'Creek (unknown)' : 'Wild source (unknown)';
      s.water.push({ liters: 1, quality, source });
      const left = atHaven ? ` Cistern: ${Math.floor((this.state.village.water || {}).clean || 0)}L left.` : '';
      this.say(`Filled 1L (${quality} — ${source}). ${s.water.length}L carried (${s.water.length}kg).${left}`);
      // ACTION CLOCK: filling a bottle = 1 tick.
      this.tickAction(1);
      return null;
    },
    // fillWaterFromVillage: at Haven, draw from the village supply into your pack.
    // The village well is the reason Haven is where it is.
    fillWaterFromVillage() {
      const v = this.state.village;
      if (!v || !v.water || v.water.clean < 1) { this.say('The well is dry. Find water out there.'); return null; }
      // WATER HAS MASS here too: don't drain the cistern for a liter you can't carry.
      if (!this.canCarry(1)) { this.say('Your pack is full — water is heavy (1L = 1kg). Drink some or drop weight.'); return null; }
      v.water.clean -= 1;
      this.addWater(1, 'clean', 'Haven well');
      this.say('You fill 1L from the Haven well. Clean.');
      this.tickAction(1); // ACTION CLOCK: filling a bottle = 1 tick.
      return null;
    },
    addWater(liters, quality, source) {
      const s = this.state.scholar;
      s.water = s.water || [];
      for (let i = 0; i < liters; i++) s.water.push({ liters: 1, quality, source });
    },

    // boilWater: at a fire, make risky water clean (kills bacteria).
    // Does NOT fix chemical contamination.
    // beard_moss: you always have tinder. Boil anywhere.
    boilWater() {
      const s = this.state.scholar;
      // NEED FIRE. you can't boil water with wishes.
      // (beard_moss: moss in your beard is always tinder. Anywhere works.)
      if (!this.nearFire() && !this.hasAbility('beard_moss')) { this.say('Need a fire to boil water.'); return null; }
      s.water = s.water || [];
      let n = 0;
      for (const b of s.water) {
        if (b.quality === 'risky' && !b.chemical) {
          b.quality = 'clean';
          b.source += ' (boiled)';
          n++;
        }
      }
      if (n > 0) {
        // TENDING A FIRE IS WORK. 30 kcal. (prevents free infinite purification)
        s.kcal = Math.max(0, (s.kcal || 0) - 30);
      }
      this.say(n ? `Boiled ${n}L. Bacteria dead.${s.water.some(b => b.chemical) ? ' (Chemical contamination survives boiling.)' : ''}` : 'No risky water to boil.');
      return null;
    },
    // FIRECRAFT: the player can start their own fires. Until now fires were
    // only where map generation put them (8% of grids) or the Haven hall —
    // so field cooking and boiling were impossible away from home. Friction
    // fire is real work: time + calories, a practice curve, and the fire
    // burns real fuel (feed it or it dies to cold dirt).
    // FUEL: deadfall branches are the honest friction-fire fuel — always
    // earnable with bare hands (gather fallen). A wood log burns longer.
    // 2 branches = a small fire; 1 log = a real one. The button stays hidden
    // without fuel (tool-gated), but anyone can earn fuel.
    FIRE_BURN_TICKS: 192, // one wood log ≈ 1.5 day-parts of flame (~9 hours)
    FIRE_BRANCH_TICKS: 64, // one branch ≈ half a day-part
    fireFuel() {
      // returns {kind, n, burn} for the best available starting fuel, or null
      if (this.materialCount('branch') >= 2) return { kind: 'branch', n: 2, burn: this.FIRE_BRANCH_TICKS * 2 };
      if (this.woodCount() >= 1) return { kind: 'wood', n: 1, burn: this.FIRE_BURN_TICKS };
      return null;
    },
    spendFireFuel(fuel) {
      if (!fuel) return false;
      if (fuel.kind === 'branch') {
        const inv = this.state.scholar.inventory || [];
        const e = inv.find(i => i.material === 'branch');
        if (!e || (e.units || 0) < fuel.n) return false;
        e.units -= fuel.n;
        if (e.units <= 0) inv.splice(inv.indexOf(e), 1);
        return true;
      }
      if (fuel.kind === 'fusion' && fuel.itemRef) {
        const inv = this.state.scholar.inventory || [];
        fuel.itemRef.units = (fuel.itemRef.units || 1) - fuel.n;
        if (fuel.itemRef.units <= 0) inv.splice(inv.indexOf(fuel.itemRef), 1);
        return true;
      }
      return this.spendWood(fuel.n);
    },
    feedFuel() {
      // feeding prefers a branch (cheap), falls back to a log (long burn)
      if (this.materialCount('branch') >= 1) return { kind: 'branch', n: 1, burn: this.FIRE_BRANCH_TICKS };
      if (this.woodCount() >= 1) return { kind: 'wood', n: 1, burn: this.FIRE_BURN_TICKS };
      // ALIEN FUEL (Steve 2026-10-05): fusion pellet/cell burn extremely long.
      // Last resort only — these are precious, never auto-burned while wood remains.
      const inv = (this.state.scholar || {}).inventory || [];
      const fusion = inv.find(i => {
        const def = (this.data.items || []).find(d => d.id === (i.itemId || i.id));
        return def && def.fuelBurnMult && (i.units || 1) > 0;
      });
      if (fusion) {
        const def = (this.data.items || []).find(d => d.id === (fusion.itemId || fusion.id));
        return { kind: 'fusion', n: 1, burn: this.FIRE_BURN_TICKS * (def.fuelBurnMult || 6), itemRef: fusion, def };
      }
      return null;
    },
    fireKnown() {
      const v = (this.data.villagers || []).find(x => x.id === this.villagerId) || {};
      const occ = String(v.formerOccupation || '').toLowerCase();
      if (/camper|scout|survivalist|bushcraft|firefighter|boyscout|girlscout|ranger|soldier|marine|arborist/i.test(occ)) return true;
      if ((this.state.codex || {}).fireWise) return true;
      const fc = (this.state.scholar || {}).firecraft || {};
      return (fc.successes || 0) >= 3;
    },
    // _absTick: monotonic tick clock across days, for fire expiry.
    _absTick() {
      const s = this.state.scholar;
      return (s.day || 1) * this.TIME.TICKS_PER_DAY + (s.dayTicks || 0);
    },
    // fireGroundOK: ground you can safely light a fire on.
    fireGroundOK(cell) {
      return ['grass', 'dirt', 'rubble', 'mud', 'sand', 'snow', 'ash', 'path', 'clearing'].indexOf(cell) !== -1;
    },
    playerFireAt(cx, cy) {
      this.sweepDeadFires();
      const fires = this.state.fires || [];
      return fires.some(f => f.tx === this.map.px && f.ty === this.map.py && f.cx === cx && f.cy === cy && f.till > this._absTick());
    },
    // sweepDeadFires: expired player fires go cold — back to plain dirt.
    // Called lazily at every fire-touching path; only tracked fires are scanned.
    sweepDeadFires() {
      const now = this._absTick();
      const fires = this.state.fires || [];
      for (let i = fires.length - 1; i >= 0; i--) {
        if (fires[i].till > now) continue;
        const row = this.map.tiles[fires[i].ty];
        const t = row && row[fires[i].tx];
        if (t && t.detail && t.detail[fires[i].cy]) t.detail[fires[i].cy][fires[i].cx] = 'dirt';
        fires.splice(i, 1);
      }
    },
    // makeFire: friction fire on a nearby ground cell. Costs 32 ticks + 70
    // kcal (a real chunk of work). Success is a practice curve: knowledge,
    // beard-moss tinder, and prior successes all help; three successes and
    // you've got the knack (fireWise). Failures are honest and teach.
    makeFire(cx, cy) {
      if (this.over) return null;
      this.sweepDeadFires();
      const s = this.state.scholar;
      const detail = this.genDetail(this.map.px, this.map.py);
      const cell = detail[cy] && detail[cy][cx];
      if (!this.fireGroundOK(cell)) { this.say('No good ground for a fire there.'); return null; }
      const px = s.mx ?? 4, py = s.my ?? 4;
      if (Math.max(Math.abs(cx - px), Math.abs(cy - py)) > 1) { this.say('Too far. Step closer.'); return null; }
      const fuel = this.fireFuel();
      if (!fuel) { this.say('You need fuel — gather fallen branches, or cut a log.'); return null; }
      const fc = s.firecraft = s.firecraft || { attempts: 0, successes: 0 };
      const moss = this.hasAbility('beard_moss');
      const known = this.fireKnown();
      // TOOLS (Steve 2026-10-05): ordinary tools must have actual uses.
      // A lighter is fire on demand; tinder catches without the friction
      // lottery (consumed); a hand drill replaces knowledge with mechanics;
      // a burning torch lends its flame.
      const hasLighter = this.hasItem('lighter');
      const hasTinder = this.hasItem('tinder_bundle');
      const hasDrill = this.hasItem('hand_drill');
      const hasTorch = this.hasItem('torch');
      let ticks = 32 + (moss ? 0 : 16), kcalCost = 70, autoFire = false, fireNote = null;
      if (hasLighter) {
        autoFire = true; ticks = 8; kcalCost = 5;
        fireNote = 'The lighter catches on the first try. Fire on demand.';
      } else if (hasTinder) {
        autoFire = true;
        this.consumeItem('tinder_bundle', 1);
        fireNote = 'The tinder bundle catches without the friction lottery. (Bundle used up.)';
      }
      // ACTION CLOCK: friction fire is a 32-tick chunk of real work. Without
      // moss-tinder you shred dry grass on the spot first (+16 ticks).
      s.kcal = Math.max(0, (s.kcal || 0) - kcalCost);
      this.tickAction(ticks);
      fc.attempts++;
      let p = 0.40 + (known ? 0.30 : 0) + (moss ? 0.15 : 0) + Math.min(0.30, 0.05 * (fc.successes || 0));
      if (hasDrill && !known) { p += 0.30; fireNote = fireNote || 'The hand drill does what knowledge would — mechanics instead of memory.'; }
      if (hasTorch) { p += 0.25; fireNote = fireNote || 'You coax the torch\'s flame onto the fuel.'; }
      if (fc.knack) p = 1;
      if (autoFire) p = 1;
      if (Math.random() < p) {
        fc.successes++;
        this.spendFireFuel(fuel);
        detail[cy][cx] = 'fire';
        const till = this._absTick() + fuel.burn;
        (this.state.fires = this.state.fires || []).push({ tx: this.map.px, ty: this.map.py, cx, cy, till });
        let msg = moss
          ? 'The beard-moss tinder takes the first real spark. You feed it twigs — fire. Yours.'
          : 'The tinder catches. A real flame, breathing. You feed it twigs — fire. Yours.';
        if (fireNote) msg = fireNote + ' ' + msg;
        if (fc.successes >= 3 && !fc.knack) {
          fc.knack = true;
          this.state.codex = this.state.codex || {};
          this.state.codex.fireWise = true;
          msg += " Third fire. You've got the knack now — friction fire is yours, every time.";
        } else {
          msg += ' (It will burn down. Feed it branches or a log to keep it alive.)';
        }
        this.say(msg);
        this.discover('firecraft');
        return null;
      }
      // FAILURE IS HONEST: attempts 1-2 tease what practice earns, the way
      // synergy discovery does — a hint of what could happen, never the how.
      const hints = [
        "Sparks, then nothing. The tinder's too coarse — shred it finer next time.",
        "A wisp of smoke, gone. Slower breath. Shelter the spark with your body.",
        "Nothing. Your arms ache. But your hands know a little more than they did.",
        "The coal glows... and dies. Closer. You're closer.",
      ];
      this.say(hints[Math.min(fc.attempts - 1, hints.length - 1)]);
      return null;
    },
    // feedFire: lay another log on a live player-made fire (+192 ticks).
    feedFire(cx, cy) {
      if (this.over) return null;
      this.sweepDeadFires();
      if (!this.playerFireAt(cx, cy)) { this.say('Nothing to feed there.'); return null; }
      const fuel = this.feedFuel();
      if (!fuel) { this.say('Nothing to feed it with — gather fallen branches, or cut a log.'); return null; }
      this.spendFireFuel(fuel);
      const f = (this.state.fires || []).find(f => f.tx === this.map.px && f.ty === this.map.py && f.cx === cx && f.cy === cy);
      if (f) f.till += fuel.burn;
      this.tickAction(8);
      this.say(fuel.kind === 'wood'
        ? 'You lay another log on. The fire settles in — hours more flame.'
        : fuel.kind === 'fusion'
        ? `Nothing else to burn. You feed the ${fuel.def ? fuel.def.name.toLowerCase() : 'fusion pellet'} to the fire. It burns... enthusiastically. Hours and hours of flame.`
        : 'You feed it another branch. The fire takes it — a while more flame.');
      return null;
    },
    // pitchTent: deploy a packed tent on clear ground. 48 ticks + 50 kcal of
    // real work — canvas, poles, guy-lines. The tent becomes a real shelter
    // cell (sleep quality 'tent'); pack it back up to take it with you.
    // (Survivalist loop 2026-10-05: found tents used to vanish on pack-up;
    // now the loop closes — carry shelter, pitch it, sleep warm.)
    pitchTent(cx, cy) {
      if (this.over) return null;
      const s = this.state.scholar;
      const detail = this.genDetail(this.map.px, this.map.py);
      const cell = detail[cy] && detail[cy][cx];
      if (['dirt', 'grass', 'clearing', 'path'].indexOf(cell) === -1) { this.say('No clear ground to pitch on there.'); return null; }
      const px = s.mx ?? 4, py = s.my ?? 4;
      if (Math.max(Math.abs(cx - px), Math.abs(cy - py)) > 1) { this.say('Too far. Step closer.'); return null; }
      if (cx === px && cy === py) { this.say('You would be pitching it on top of yourself. Pick a clear spot nearby.'); return null; }
      const tent = (s.inventory || []).find(i => i.kind === 'tent' && (i.units || 0) > 0);
      if (!tent) { this.say('No packed tent to pitch.'); return null; }
      tent.units -= 1;
      s.inventory = (s.inventory || []).filter(i => (i.units || 0) > 0 || !i.kind);
      detail[cy][cx] = 'tent';
      const t = this.playerTile();
      t.secrets = t.secrets || {};
      t.secrets[cx + ',' + cy] = { condition: 'good', known: true, yours: true };
      s.kcal = Math.max(0, (s.kcal || 0) - 50);
      this.tickAction(48);
      this.say('Canvas up, poles set, guy-lines taut. Shelter — yours, wherever you are. (Sleep quality: tent. Pack it up to move it.)');
      return null;
    },
    // packTent: strike your pitched tent. Shelter becomes pack weight again.
    packTent(cx, cy) {
      if (this.over) return null;
      const s = this.state.scholar;
      const detail = this.genDetail(this.map.px, this.map.py);
      if (!detail[cy] || detail[cy][cx] !== 'tent') { this.say('No tent there.'); return null; }
      const t = this.playerTile();
      const sec = t.secrets && t.secrets[cx + ',' + cy];
      if (!sec || !sec.yours) { this.say("That's not yours to pack."); return null; }
      detail[cy][cx] = 'dirt';
      delete t.secrets[cx + ',' + cy];
      s.inventory = s.inventory || [];
      const tent = s.inventory.find(i => i.kind === 'tent');
      if (tent) tent.units = (tent.units || 0) + 1;
      else s.inventory.push({ kind: 'tent', name: 'Packed tent', units: 1, kg: 2.5, kcalEach: 0, spoilDay: 9999, unit: 'tent', prep: 'Pitch it on clear ground for shelter.' });
      this.tickAction(16);
      this.say('You strike the tent and pack it down. Shelter for later.');
      return null;
    },
    // drinkWater: drink clean first. Warn if only risky.
    // WATER KNOWLEDGE (Steve): recognizing clean vs poison is a skill. Flow and
    // clarity are observable; SAFETY is earned — outdoors background, or learned
    // the hard way (drank wrong once). The ignorant drink and hope; the game says so.
    waterSafetyKnown() {
      const v = (this.data.villagers || []).find(x => x.id === this.villagerId) || {};
      const occ = String(v.formerOccupation || '').toLowerCase();
      if (/fisherman|fisher|sailor|plumber|farmer|hunter|guide|scout|forager|herbalist|camper|marine/i.test(occ)) return true;
      if ((this.state.codex || {}).waterWise) return true;
      return false;
    },
    // KNOWLEDGE-GATED SKILLS (Steve): every skill has a knowledge dimension.
    // The UI reveals only what knowledge earns; below threshold you act blind,
    // and the game is honest about it. Blind is never "button disabled" —
    // it's "button honest." Each XxxKnown() reads occupation background or a
    // learned flag — the same contract as waterSafetyKnown above.
    // FISHING: reading water for fish. Fisherfolk know; others thrash.
    fishKnown() {
      const v = (this.data.villagers || []).find(x => x.id === this.villagerId) || {};
      const occ = String(v.formerOccupation || '').toLowerCase();
      if (/fisher|fisherman|fishing|angler|sailor|deckhand/i.test(occ)) return true;
      if ((this.state.codex || {}).fishWise) return true;
      return false;
    },
    // WOODLORE: knowing which wood serves which purpose. The knowledgeable
    // pick the right tree; the ignorant take the nearest trunk.
    woodloreKnown() {
      const v = (this.data.villagers || []).find(x => x.id === this.villagerId) || {};
      const occ = String(v.formerOccupation || '').toLowerCase();
      if (/lumberjack|carpenter|forester|arborist|woodworker|cabin/i.test(occ)) return true;
      if ((this.state.codex || {}).woodWise) return true;
      return false;
    },
    // HERBS: using plants as medicine. Medical folk know; others chew and hope.
    // Checks the skill first (background grants cover nurse/medic/herbalist/
    // forager/gardener/etc. via knowledge.json), occupation as fallback.
    herbKnown() {
      if (this.skillKnown('herbal_medicine', 1) || this.skillKnown('wound_care', 1)) return true;
      const v = (this.data.villagers || []).find(x => x.id === this.villagerId) || {};
      const occ = String(v.formerOccupation || '').toLowerCase();
      if (/nurse|medic|doctor|herbalist|pharmacist|paramedic|veterinarian|dentist|midwife|botanist/i.test(occ)) return true;
      return false;
    },
    // TRACKING: reading sign. The tracker knows what left the prints and how
    // fresh; the ignorant see disturbed earth.
    trackKnown() {
      if (this.skillKnown('track_read', 1) || this.skillKnown('animal_behavior', 1)) return true;
      const v = (this.data.villagers || []).find(x => x.id === this.villagerId) || {};
      const occ = String(v.formerOccupation || '').toLowerCase();
      if (/hunter|tracker|scout|guide|ranger|soldier/i.test(occ)) return true;
      return false;
    },
    drinkWater() {
      const s = this.state.scholar;
      s.water = s.water || [];
      // prefer clean
      let idx = s.water.findIndex(b => b.quality === 'clean');
      if (idx === -1) idx = s.water.findIndex(b => b.quality === 'risky');
      if (idx === -1) { this.say('No water. Fill at a creek or well.'); return null; }
      const b = s.water[idx];
      s.water.splice(idx, 1);
      // ACTION CLOCK: a drink is 1 tick (time-only — drinking costs no effort).
      this.tickAction(1);
      if (b.quality === 'risky') {
        // 30% chance of sickness
        if (Math.random() < 0.3) {
          s.health = Math.max(0, (s.health || 100) - 15);
          this.state.codex = this.state.codex || {};
          this.state.codex.waterWise = true; // learned the hard way
          this.say(`Drank risky water (${b.source}). Stomach cramps. -15 health. Boil it next time. (You won't make that mistake again — you can read water now.)`);
        } else {
          this.say(`Drank risky water (${b.source}). Got lucky this time.`);
        }
      } else {
        this.say(`Drank clean water.`);
      }
      s.hydration = Math.min(100, (s.hydration || 0) + 50);
      return null;
    },
    // waterWeight: 1L = 1kg. Counts toward carry limit.
    waterWeight() {
      return (this.state.scholar.water || []).length; // 1 bottle = 1L = 1kg
    },
    // FISH: the knowledge-gated skill contract applied. Fisherfolk read the
    // water — the deep cut, the shade line — and catch. The ignorant thrash
    // the shallows and hope. Button honest: it always works, just worse blind.
    fish() {
      if (this.over) return null;
      const s = this.state.scholar;
      // TOOL-GATED: no tackle, no fishing. (The action is hidden in the UI;
      // this is the backstop for direct calls.)
      if (!this.hasItem('fishing_line')) {
        this.say('You need fishing tackle — a line at least. Bare hands won\'t do it.');
        return null;
      }
      const t = this.playerTile();
      if (t.type !== 'creek' && t.type !== 'wetland') {
        // ponds and puddles hold small fish too — the tile check is for rivers;
        // the cell check (water) already passed. Fish are smaller here.
        this.say('Still water. Small fish, maybe. Worth a try.');
      }
      const known = this.fishKnown();
      // TOOLS (Steve 2026-10-05): a line is honest tackle. It reads the water
      // for you — and it fishes still water properly, not just "maybe."
      const hasLine = this.hasItem('fishing_line');
      let chance = known ? 0.5 : 0.18;
      let yieldMult = 1;
      if (hasLine) {
        chance = Math.min(0.85, chance + 0.25);
        yieldMult = 1.3;
      }
      s.kcal = Math.max(0, (s.kcal || 0) - 60);
      if (s.week1) s.week1.fish = (s.week1.fish || 0) + 1;
      if (Math.random() < chance) {
        const kcal = Math.round((known ? 500 + Math.floor(Math.random() * 400) : 150 + Math.floor(Math.random() * 200)) * yieldMult);
        // FOOD REALITY: a fish is a carcass — clean it (knife), don't just eat it.
        const animal = (this.data.animals || []).find(a => a.id === 'fish') || { id: 'fish', name: 'fish', calories: kcal };
        s.inventory.push(this.foodCarcass(animal, kcal, s.day, 'fished'));
        if (known) this.say(`You read the water — the deep cut by the bank, the shade line. A fish takes it. About ${kcal} kcal — clean it quickly (knife).`);
        else {
          this.say(`You thrash the shallows and — a fish! Luck, mostly. About ${kcal} kcal — clean it quickly (knife).`);
          // learned the wet way: catching teaches a little
          if (Math.random() < 0.25) { this.state.codex = this.state.codex || {}; this.state.codex.fishWise = true; this.say('(Something about the way the water moved stuck with you. You read water a little better now.)'); }
        }
      } else {
        if (known) this.say('Nothing biting in this cut. The fish know something you don\'t — today.');
        else this.say('You splash around for a while. The fish are unimpressed. (Someone who knew water would pick a better spot.)');
      }
      this.tele('fish', { known, kcal: 0, cost: 60 });
      return this.tickAction(32) || this.status();
    },
    // nearFire: is there a fire in the current detail grid?
    nearFire() {
      this.sweepDeadFires(); // player-made fires go cold when their fuel runs out
      const detail = this.genDetail(this.map.px, this.map.py);
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
        if (detail[y] && detail[y][x] === 'fire') return true;
      }
      return false;
    },
    // fireLastsTillDawn: does any fire on this tile burn past dawn?
    // Map-made fires are established — they last. Player fires check till.
    // Feeding a fire before sleeping on a cold night is the survivalist's
    // whole game: the flame has to outlast the dark.
    fireLastsTillDawn() {
      this.sweepDeadFires();
      const T = this.TIME;
      const dawn = ((this.state.scholar.day || 1) + 1) * T.TICKS_PER_DAY;
      const detail = this.genDetail(this.map.px, this.map.py);
      let anyFire = false, lasts = false;
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
        if (detail[y] && detail[y][x] === 'fire') {
          anyFire = true;
          const pf = (this.state.fires || []).find(f => f.tx === this.map.px && f.ty === this.map.py && f.cx === x && f.cy === y);
          if (!pf || pf.till >= dawn) lasts = true; // map fire, or yours fed to last
        }
      }
      return anyFire && lasts;
    },

    // cookAll: cook everything raw in inventory (at a fire).
    // COSTS WATER: 1L per item. Beans and rice need water. No pots, just fire + water.
    // Tradeoff: spend water, get safe + more calories. Or eat raw and risk sickness.
    cookAll() {
      // camp_cook: L1 half water + 10% kcal, L2 no water, L3 +25% kcal.
      const cookLvl = this.abilityLevel('camp_cook');
      const waterMult = cookLvl >= 2 ? 0 : cookLvl >= 1 ? 0.5 : 1;
      const kcalMult = cookLvl >= 3 ? 1.25 : cookLvl >= 1 ? 1.1 : 1.0;
      let n = 0, waterUsed = 0, wellUsed = 0;
      for (const item of (this.state.scholar.inventory || [])) {
        if (item.rawKcal) {
          // needs water? 1L per UNIT (5 beans = 5L), discounted by camp_cook.
          const needsWater = item.needsCooking; // beans, rice
          const units = item.units || 1;
          const cost = Math.ceil(units * waterMult);
          if (needsWater && this.cleanWaterForCooking() < cost) {
            this.say(`Not enough clean water to cook ${item.name}. Need ${cost}L — haul water first.`);
            continue;
          }
          if (needsWater) { const spent = this.spendCleanWater(cost); waterUsed += cost; wellUsed += spent.fromWell; }
          // RELIC — impossible_edge: physics-defying prep. +10% cooked kcal.
          const relicCook = S.modifiers.resolve(1, 'cook.kcal', S.modifiers.collectModifiers(this.state.scholar, this.data.abilities), {});
          item.kcalEach = Math.round((item.cookedKcal || item.rawKcal * 1.5) * kcalMult * relicCook);
          item.rawKcal = null;
          item.safe = true;
          n++;
        }
      }
      this.say(n ? `Cooked ${n} item${n > 1 ? 's' : ''}${waterUsed ? ` (-${waterUsed}L water${wellUsed ? `, incl. ${wellUsed}L haven well` : ' from your bottles'})` : ''}.` : 'Nothing raw to cook.');
      if (n > 0 && this.state.scholar.week1) this.state.scholar.week1.cook++;
      if (n > 0) this.noteToolUse(); // RELIC BOND: the knife, the pot, the fire kit.
      this.gainAbilityXP('camp_cook', 1);
      return null;
    },

    // donateToPantry: give food to the village. Builds trust.
    // Generosity is remembered. This is how you earn your place.
    donateToPantry(idx) {
      const item = this.state.scholar.inventory[idx];
      if (!item || (item.kcalEach || 0) <= 0) { this.say('That\'s not food.'); return null; }
      // RELIC BOND: non-transferable. A bonded relic in a stranger's hands is just stuff.
      if (item.bonded) { this.say(`That's yours. Not the village's. You can't give away your ${item.name}.`); return null; }
      const v = this.state.village;
      const vid = this.state.scholar.villagerId;
      // add to pantry
      v.pantry = v.pantry || [];
      const existing = v.pantry.find(p => p.name === item.name);
      const kcal = (item.kcalEach || 0) * (item.units || 1);
      if (existing) {
        existing.units += (item.units || 1);
      } else {
        v.pantry.push({ ...item });
      }
      // remove from inventory
      this.state.scholar.inventory.splice(idx, 1);
      // TRUST: giving builds it. generous: the System's gift. Donating gives 2x trust.
      const genLvl = this.abilityLevel('generous');
      const genMult = genLvl >= 1 ? 2 : 1;
      v.trust = v.trust || {}; v.gives = v.gives || {};
      v.gives[vid] = (v.gives[vid] || 0) + kcal;
      const trustGain = Math.min(10, Math.floor(kcal / 500)) * genMult;
      v.trust[vid] = Math.min(100, (v.trust[vid] || 15) + trustGain);
      this.say(`Donated ${item.name} (+${kcal} kcal). Trust +${trustGain}. They'll remember this.`);
      this.observe('donate');
      if (this.state.scholar.week1) this.state.scholar.week1.donate++;
      // GENEROUS XP needs a REAL gift (>= 200 kcal). token 1-kcal donations don't count.
      // (prevents donate-take-back XP farming)
      if (kcal >= 200) this.gainAbilityXP('generous', 1);
      // PLAYSTYLE: the game notices generosity. Not the stat — the pattern.
      if (kcal >= 200) this.notePlaystyle('generous');
      return null;
    },
    // dropItem(idx): leave it for the woods. The pack is honest about space;
    // the woods take back what you can't carry. Free — dropping is not a
    // decision the clock charges for. (Forager loop 2026-10-05: the pack-full
    // message promised this option, but it didn't exist.)
    dropItem(idx) {
      const inv = this.state.scholar.inventory || [];
      const item = inv[idx];
      if (!item) { this.say('Nothing there.'); return null; }
      if (item.bonded || (this.isKeepsake && this.isKeepsake(item))) {
        this.say(`Not the ${item.name || 'that'}. Some things you carry for good.`);
        return null;
      }
      inv.splice(idx, 1);
      this._packFullStreak = 0;
      const nm = (this.itemDisplayName ? this.itemDisplayName(item) : (item.name || 'it'));
      this.say(`You leave the ${nm} for the woods. The woods don't mind.`);
      return null;
    },

    // carryCapacity: base 20kg. Abilities, items, and strength boost it.
    carryCapacity() {
      let cap = 20;
      const s = this.state.scholar;
      // Abilities
      const has = (id) => (s.abilities || []).some(a => a.id === id) || (s.backgroundAbilities || []).some(a => a.id === id);
      if (has('pack_rat')) cap += 5;
      if (has('hoarder')) cap += 10;
      // Items: backpacks, etc. (equipped or in inventory)
      for (const item of (s.inventory || [])) {
        const def = this.data.items.find(i => i.id === (item.itemId || item.id));
        if (def && def.carryBonus) cap += def.carryBonus;
      }
      // STRENGTH (Better Human): your body, not the System. +2kg per point above 5.
      const str = (s.stats || {}).str || 5;
      if (str > 5) cap += (str - 5) * 2;
      return cap;
    },

    // THEFT IS ALLOWED. Nothing stops your hand — but the village has eyes.
    // Take more than your fair share while witnesses are present and someone
    // may confront you directly. Take when no one's looking and it's just
    // gossip later. The pantry is TAKE WHAT YOU WANT; the consequences are social.
    theftConfrontation(totalKcal) {
      const v = this.state.village;
      const wit = (this.witnesses && this.witnesses(6)) || [];
      const present = wit.filter(id => id !== this.villagerId && (v.roster || []).includes(id));
      if (!present.length) return; // no one saw. the gossip may still find you.
      // fair share norm: ~2000 kcal/day. Blatant theft = 2x+ in one take.
      if (totalKcal < 4000) return;
      // once per day — they said their piece, they won't nag
      const dayKey = 'theftConf' + this.state.scholar.day;
      v[dayKey] = v[dayKey] || {};
      if (v[dayKey][this.state.scholar.villagerId]) return;
      v[dayKey][this.state.scholar.villagerId] = true;
      // who confronts? boldest witness, or the one who trusts you least
      let confronter = null, best = -999;
      for (const id of present) {
        const temp = this.npcTemper(id);
        const trust = ((v.trust || {})[id]) || 10;
        let score = (temp === 'bold' ? 30 : temp === 'prickly' ? 20 : 0) - trust;
        score += Math.random() * 20;
        if (score > best) { best = score; confronter = id; }
      }
      if (!confronter || Math.random() < 0.35) return; // they let it slide. this time.
      const first = this.displayName(confronter);
      const lines = [
        `"Hey." ${first} steps closer. "That's a lot you're taking. More than your share. People are counting."`,
        `"We all see the pantry, you know." ${first} doesn't look away. "Take what you need. But that's not need — that's hoarding."`,
        `${first} watches you load up, then says it loud enough for the fire to hear: "Must be nice, taking double while the rest of us count bites."`,
      ];
      this.say(lines[Math.floor(Math.random() * lines.length)]);
      const tr = v.trust || {};
      tr[confronter] = Math.max(0, (tr[confronter] || 10) - 8);
      // the whole village hears about this one
      try { this.observe('hoard', {}); } catch (e) {}
      try { this.remember(confronter, 'confronted_theft', 'called you out for taking too much'); } catch (e) {}
    },

    // pantryDaysEstimate: how long the pantry lasts at the MEASURED burn rate
    // (rolling 7-day net from villageEats). Falls back to the 12x2000 worst
    // case before the first endDay. Returns 999 when the village covers
    // itself (no net draw) — the pantry is holding, not draining.
    pantryDaysEstimate() {
      const v = this.state.village || {};
      const pk = (v.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
      const hist = v.burnHistory || [];
      if (!hist.length) {
        const pop = ((v.roster || []).length) || 12;
        return Math.floor(pk / Math.max(1, pop * 2000));
      }
      const burn = hist.reduce((a, b) => a + b, 0) / hist.length;
      if (burn <= 0) return 999;
      return Math.floor(pk / burn);
    },

    // fairShareNote: the social norm, shown in the pantry UI. Not a limit —
    // information. Everyone knows what "fair" looks like. Violating it visibly
    // has consequences; the UI just makes the norm legible.
    fairShareNote() {
      const v = this.state.village;
      const pop = ((v.roster || []).length) || 1;
      const pantryKcal = (v.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0);
      const daysLeft = pantryKcal / Math.max(1, pop * 2000);
      return { perPerson: 2000, daysLeft: daysLeft.toFixed(1), pantryKcal: Math.round(pantryKcal) };
    },

    // takeFromPantryBulk: pack multiple items at once (slider UI).
    // selections: {idx: qty}. Respects weight, applies trust cost once.
    takeFromPantryBulk(selections) {
      if (this.havenStoresAccess && this.havenStoresAccess() === 'none') {
        this.say('The pantry is in the hall. Your hands are not.');
        return null;
      }
      const pantry = this.state.village.pantry || [];
      const v = this.state.village;
      let totalKcal = 0, totalKg = 0, totalUnits = 0;
      const taken = [];
      // WEIGHT BASE: snapshot carry weight BEFORE this pack. The loop mutates
      // inventory/water as it goes, so rescanning mid-loop double-counts what
      // was already taken (this call) — silently blocking water after food, or
      // short-changing later food items. totalKg tracks only what THIS pack adds.
      const baseKg = (this.state.scholar.inventory || []).reduce((t, i) => t + (i.kg || 0) * (i.units || 1), 0);
      const baseWaterKg = this.waterWeight();
      const max = this.carryCapacity();
      const carryNow = () => baseKg + baseWaterKg + totalKg;
      // INDEX STABILITY: fully taking an item splices it out of the pantry,
      // which would shift the indexes of items handled later in the same pack.
      // Handle food indexes in DESCENDING order (water last) so splices never
      // invalidate a pending selection.
      const entries = Object.entries(selections).sort((a, b) => {
        const ai = a[0] === 'water' ? -1 : +a[0];
        const bi = b[0] === 'water' ? -1 : +b[0];
        return bi - ai;
      });
      for (const [key, qty] of entries) {
        // WATER: drawn from the village well, not the pantry shelves. Same UI, same pack.
        if (key === 'water') {
          const q = Math.min(qty, (v.water && v.water.clean) || 0);
          if (q <= 0) continue;
          const carry = carryNow();
          const canTake = Math.min(q, Math.floor(max - carry)); // 1L = 1kg
          if (canTake <= 0) { this.say('Too heavy for more water.'); continue; }
          v.water.clean -= canTake;
          this.addWater(canTake, 'clean', 'Haven well');
          totalKg += canTake;
          totalUnits += canTake;
          taken.push(`${canTake}L water`);
          continue;
        }
        const idx = +key, q = Math.min(qty, (pantry[idx] && pantry[idx].units) || 0);
        if (q <= 0) continue;
        const item = pantry[idx];
        // weight check per item (running total)
        const carry = carryNow();
        const canTake = Math.min(q, Math.floor((max - carry) / (item.kg || 0.1)));
        if (canTake <= 0) { this.say(`Too heavy for more ${item.name}.`); continue; }
        item.units -= canTake;
        if (item.units <= 0) pantry.splice(pantry.indexOf(item), 1);
        // merge into inventory
        const inv = this.state.scholar.inventory;
        const existing = inv.find(i => i.name === item.name);
        if (existing) existing.units += canTake;
        else inv.push({ name: item.name, kcalEach: item.kcalEach, units: canTake, spoilDay: item.spoilDay, safe: item.safe, kg: item.kg, unit: item.unit || 'item', rawKcal: item.rawKcal, cookedKcal: item.cookedKcal, needsCooking: item.needsCooking,
          // FOOD REALITY: keep processing state — the haul stays workable.
          plantId: item.plantId, foodKind: item.foodKind, foodState: item.foodState, edible: item.edible, hiddenKcal: item.hiddenKcal, diseaseRisk: item.diseaseRisk, prep: item.prep });
        totalKcal += canTake * item.kcalEach;
        totalKg += canTake * (item.kg || 0);
        totalUnits += canTake;
        taken.push(`${canTake} ${item.name}`);
      }
      if (!taken.length) return null;
      // trust: one notice for the whole pack, not per click
      v.takes = v.takes || {}; v.gives = v.gives || {};
      const vid = this.state.scholar.villagerId;
      v.takes[vid] = (v.takes[vid] || 0) + totalKcal;
      const net = (v.gives[vid] || 0) - (v.takes[vid] || 0);
      if (net < -5000) {
        v.trust[vid] = Math.max(0, (v.trust[vid] || 15) - 2);
        if (Math.random() < 0.3) this.say('Someone watches you load up. They say nothing.');
        this.observe('hoard');
      }
      // BLATANT THEFT with witnesses present: direct confrontation.
      // Nothing stops your hand — but someone may stop your nerve.
      try { this.theftConfrontation(totalKcal); } catch (e) {}
      this.say(`Packed: ${taken.join(', ')}. (${this.fmtKcal(totalKcal)}, ${totalKg.toFixed(1)} kg)`);
      return null;
    },
    // takeFromPantry: pack food before going out. Weight matters.
    // SELFISHNESS HAS A COST: taking without contributing lowers trust.
    // The village notices who gives and who takes.
    takeFromPantry(idx) {
      if (this.havenStoresAccess && this.havenStoresAccess() === 'none') {
        this.say('The pantry is in the hall. Your hands are not.');
        return null;
      }
      const pantry = this.state.village.pantry || [];
      const item = pantry[idx];
      if (!item || item.units <= 0) return null;
      // weight check (includes water: 1L = 1kg)
      const carry = (this.state.scholar.inventory || []).reduce((t, i) => t + (i.kg || 0) * (i.units || 1), 0) + this.waterWeight();
      const max = this.carryCapacity();
      if (carry + (item.kg || 0) > max) {
        this.say(`Too heavy. Carrying ${carry.toFixed(1)}/${max} kg.`);
        return null;
      }
      // take one unit
      item.units--;
      if (item.units <= 0) pantry.splice(idx, 1);
      // THEY NOTICE. Taking without giving lowers trust (a little each time).
      const v = this.state.village;
      v.trust = v.trust || {};
      const vid = this.state.scholar.villagerId;
      // track net: takes vs gives
      v.takes = v.takes || {}; v.gives = v.gives || {};
      v.takes[vid] = (v.takes[vid] || 0) + (item.kcalEach || 0);
      const net = (v.gives[vid] || 0) - (v.takes[vid] || 0);
      // if you're taking way more than giving, trust drops
      if (net < -5000) {
        v.trust[vid] = Math.max(0, (v.trust[vid] || 15) - 2);
        if (Math.random() < 0.3) this.say('Someone watches you take food. They say nothing, but you feel it.');
      }
      // Single takes add up: check the running total for blatant theft.
      try { this.theftConfrontation((v.takes[vid] || 0)); } catch (e) {}
      // EXPLOIT: donate-then-take-back. If net goes negative after donating, big penalty.
      // (They remember you gave. They remember you took it back. That's worse.)
      const gave = v.gives[vid] || 0;
      if (gave > 0 && net <= 0) {
        v.trust[vid] = Math.max(0, (v.trust[vid] || 15) - 5);
        this.say('You took back what you gave. They noticed. Trust -5.');
      }
      // add to inventory (merge if same)
      const inv = this.state.scholar.inventory;
      const existing = inv.find(i => i.name === item.name);
      if (existing) {
        existing.units++;
        // backfill cooking fields if the existing stack predates them
        if (item.rawKcal != null && existing.rawKcal == null) { existing.rawKcal = item.rawKcal; existing.cookedKcal = item.cookedKcal; existing.needsCooking = item.needsCooking; }
      }
      else inv.push({ name: item.name, kcalEach: item.kcalEach, units: 1, spoilDay: item.spoilDay, safe: item.safe, kg: item.kg, unit: item.unit || 'item', rawKcal: item.rawKcal, cookedKcal: item.cookedKcal, needsCooking: item.needsCooking });
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

    // equippedWeapon: full weapon profile — range, type, ammo. Unarmed fallback.
    // WEAPON RANGE: melee=1, spear=2, sling=4, bow=5. You can't knife someone
    // across the clearing. Range is real and the grid enforces it.
    equippedWeapon() {
      const eq = (this.state.scholar.equipped || {}).weapon;
      if (!eq) return { name: 'your hands', bonus: 0, type: 'melee', range: 1, ammo: null, unarmed: true };
      const def = this.data.items.find(i => i.id === eq.itemId);
      const w = (def && def.weapon) || {};
      return {
        name: eq.name || (def && def.name) || 'weapon',
        bonus: w.bonus || 0,
        type: w.type || 'melee',
        range: w.range || 1,
        ammo: w.ammo || null,
        unarmed: false,
      };
    },

    // ammoCount / spendAmmo: ranged weapons eat stones and arrows.
    ammoCount(mat) {
      const inv = this.state.scholar.inventory || [];
      return inv.filter(i => i.material === mat).reduce((t, i) => t + (i.units || 0), 0);
    },
    spendAmmo(mat, n) {
      let left = n || 1;
      const inv = this.state.scholar.inventory || [];
      for (const item of inv) {
        if (item.material !== mat || left <= 0) continue;
        const take = Math.min(item.units || 0, left);
        item.units -= take; left -= take;
      }
      // clean empties
      this.state.scholar.inventory = inv.filter(i => (i.units || 0) > 0 || !i.material);
      return left <= 0;
    },

    huntAnimal() {
      const s = this.state.scholar;
      const a = s.animal;
      if (!a) return null;
      if (s.week1) s.week1.hunt++;
      this.gainAbilityXP('tracker', 1);
      const px = s.mx ?? 4, py = s.my ?? 4;
      const dist = Math.max(Math.abs(a.mx - px), Math.abs(a.my - py));
      // FOOD REALITY: weapon range is real (bow 5, sling 4, spear 2, melee 1).
      // Hunting is stalking — the animal still gets its reaction (see preyReaction).
      const range = this.equippedWeapon().range || 1;
      // (weapon-name hygiene: the unarmed fallback is "your hands" — strip the
      // leading "your " so "your ..." compositions never double it.)
      const _wn = String((this.equippedWeapon() || {}).name || 'hands').replace(/^your\s+/i, '');
      if (dist > range) { this.say(`Too far. Get closer${range > 1 ? ` (your ${_wn} reaches ${range})` : ''}.`); return null; }
      const animal = this.data.animals.find(x => x.id === a.id);
      // success: easy 70%, medium 40%, hard 15%. Costs 100 kcal (chasing is work).
      // hunter background: +20%.
      const villager = this.data.villagers.find(v => v.id === this.villagerId);
      const isHunter = (villager && villager.formerOccupation || '').toLowerCase().includes('hunter');
      // game_sense: read the sign. find_chance multiplies the base.
      let base = animal.difficulty === 'easy' ? 0.7 : animal.difficulty === 'medium' ? 0.4 : 0.15;
      base = this.modTarget('hunt.find_chance', base);
      // Weapons matter. A spear (+30) turns a 40% shot into 70%.
      const wbonus = this.weaponBonus() / 100;
      // tracker: the System's gift. L1 +30%, L2 +50% (additive, capped at 95%).
      const trackLvl = this.abilityLevel('tracker');
      const trackBonus = trackLvl >= 2 ? 0.5 : trackLvl >= 1 ? 0.3 : 0;
      // RELIC — never_fails: the tool works when it matters. +10% hunt success.
      const relicHunt = S.modifiers.resolve(0, 'hunt.success', S.modifiers.collectModifiers(s, this.data.abilities), {});
      // lucky_rock: the System finds your faith adorable and helps a little.
      const luck = this.modTarget('luck.global', 1);
      // NIGHT HUNTING (knowledge): at night, the prepared hunter is the apex thing.
      // L2 +20%, L3 +35% — but only after dark, when the knowledge applies.
      let nightHuntBonus = 0;
      if (this.isNight()) {
        if (this.skillKnown('night_hunting', 3)) nightHuntBonus = 0.35;
        else if (this.skillKnown('night_hunting', 2)) nightHuntBonus = 0.2;
        if (this.hasAbility('night_eyes')) nightHuntBonus += 0.1;
      }
      const chance = Math.min(0.95, (base + (isHunter ? 0.2 : 0) + wbonus + trackBonus + relicHunt + nightHuntBonus) * luck);
      this.noteToolUse(); // RELIC BOND: the spear, the snare, the knife.
      s.kcal = Math.max(0, s.kcal - 100);
      if (Math.random() < chance) {
        // caught!
        s.animal = null;
        // field_dressing: you know where the meat is. More yield per kill.
        const kcal = Math.round(this.modTarget('hunt.meat_yield', animal.calories));
        // FOOD REALITY: a kill is a carcass, not food. Clean it (knife) quickly.
        s.inventory.push(this.foodCarcass(animal, kcal, s.day, 'hunted'));
        this.say(`Got it! ${animal.name}. About ${kcal} kcal of meat on the bone — gut it quickly (knife). It spoils fast.`);
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
    // npcNode: which world-map node an NPC is on. Defaults to Haven.
    // NPCs move between nodes with their own agendas — they're not glued to you.
    npcNode(vid) {
      const v = this.state.village;
      v.nodePos = v.nodePos || {};
      if (!v.nodePos[vid]) {
        const hx = v.px ?? 3, hy = v.py ?? 3;
        v.nodePos[vid] = { nx: hx, ny: hy };
      }
      return v.nodePos[vid];
    },

    // npcSetNode: move an NPC to a different world node. Their grid position
    // is cleared — it'll be assigned when someone (you) is on that node.
    npcSetNode(vid, nx, ny) {
      const v = this.state.village;
      v.nodePos = v.nodePos || {};
      nx = Math.max(0, Math.min(6, nx)); ny = Math.max(0, Math.min(6, ny));
      v.nodePos[vid] = { nx, ny };
      if (v.positions) delete v.positions[vid];
    },

    // npcsOnNode: which NPCs are on a given world node (default: your node).
    npcsOnNode(nx, ny) {
      const v = this.state.village;
      if (nx === undefined) { nx = this.map.px; ny = this.map.py; }
      return (v.roster || []).filter(rid => {
        if (rid === this.villagerId) return false;
        const n = this.npcNode(rid);
        return n.nx === nx && n.ny === ny;
      });
    },

    // npcInside: the inside/outside sub-state. Haven interior and Haven grounds
    // are the SAME node — the hall and the grounds are one place with a door
    // between them, not two places. Each villager has their own sub-state:
    // inside villagers stay inside until their own agency moves them out.
    // The player's door transition moves ONLY the player (plus party/followers)
    // — it never drags the village along. Default: inside (they live in the hall).
    npcInside(vid) {
      const v = this.state.village;
      v.npcInside = v.npcInside || {};
      if (v.npcInside[vid] === undefined) v.npcInside[vid] = true;
      return !!v.npcInside[vid];
    },
    npcSetInside(vid, inside) {
      const v = this.state.village;
      v.npcInside = v.npcInside || {};
      v.npcInside[vid] = !!inside;
      // sub-state changed: drop the grid position so it re-assigns on the
      // correct side of the door.
      if (v.positions) delete v.positions[vid];
    },

    ensureVillagerPositions() {
      // LIVING WORLD: positions are per-node. Only NPCs on YOUR node get grid
      // positions. NPCs elsewhere exist in simulation (nodePos) but aren't rendered.
      // Call this whenever you move within a node or arrive at a new node.
      const v = this.state.village;
      const px = this.map.px, py = this.map.py;
      v.positions = v.positions || {};
      // On the Haven node, the door is real: only NPCs on YOUR side of it
      // render. Inside villagers don't teleport out when you step outside.
      const havenNode = (px === (v.px ?? 3) && py === (v.py ?? 3));
      const playerInside = havenNode ? (this.state.scholar.insideHaven !== false) : true;
      // Clear positions for NPCs who aren't on this node anymore — or who are
      // on the other side of the Haven door.
      for (const rid of Object.keys(v.positions)) {
        const n = this.npcNode(rid);
        if (n.nx !== px || n.ny !== py) { delete v.positions[rid]; continue; }
        if (havenNode && this.npcInside(rid) !== playerInside) delete v.positions[rid];
      }
      // Assign positions to NPCs on this node (and your side of the door) who
      // don't have one.
      const here = this.npcsOnNode(px, py).filter(rid =>
        !v.positions[rid] && (!havenNode || this.npcInside(rid) === playerInside));
      if (!here.length) return;
      const detail = this.genDetail(px, py);
      const free = [];
      for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
        const c = detail[cy] && detail[cy][cx];
        if (c && !this.cellProps(c).blocks && !(cx === 4 && cy === 4)) free.push({x: cx, y: cy});
      }
      // Don't spawn on top of the player.
      const pmx = this.state.scholar.mx ?? 4, pmy = this.state.scholar.my ?? 4;
      for (const rid of here) {
        if (!free.length) break;
        const idx = Math.floor(Math.random() * free.length);
        const pos = free.splice(idx, 1)[0];
        // nudge off the player's exact cell if collided
        if (pos.x === pmx && pos.y === pmy && free.length) {
          const alt = free.splice(Math.floor(Math.random() * free.length), 1)[0];
          free.push(pos); pos.x = alt.x; pos.y = alt.y;
        }
        v.positions[rid] = { mx: pos.x, my: pos.y };
      }
    },

    // npcNodeTravel: ONCE PER DAY-PART, NPCs move between world nodes.
    // Called from advancePart. This is how the world lives without you:
    // foragers go out, explorers wander, the restless leave.
    npcNodeTravel() {
      const v = this.state.village;
      const s = this.state.scholar;
      if (this.over) return;
      const hx = v.px ?? 3, hy = v.py ?? 3;
      const night = this.isNight();
      for (const rid of (v.roster || [])) {
        if (rid === this.villagerId) continue;
        if (this.isEngaged(rid)) continue; // talking to you — stays put
        // Dead NPCs don't travel.
        const vp = this.vpOf(rid);
        if (vp && vp.dead) continue;
        const node = this.npcNode(rid);
        const atHaven = (node.nx === hx && node.ny === hy);
        const temp = this.npcTemper(rid);
        const goal = this.npcGoal(rid);
        const away = (v.away || {})[rid];

        // AWAY NPCs: check if they come back.
        if (away) {
          const partsAway = (s.day - (away.sinceDay || s.day)) * 4 + (this.dayPart - (away.sincePart || 0));
          const shouldReturn = partsAway >= (away.duration || 4);
          if (shouldReturn) {
            // They come home. Foragers bring food. Explorers bring news.
            this.npcSetNode(rid, hx, hy);
            delete v.away[rid];
            const first = this.displayName(rid);
            if (away.purpose === 'forage') {
              const kcal = 200 + Math.floor(Math.random() * 400);
              this.stockPantry(kcal, 'Foraged food');
              // Only announce if you're at Haven to see it.
              if (this.map.px === hx && this.map.py === hy) {
                this.say(`🌿 ${first} returns from foraging the wilds: +${kcal} kcal to the pantry.`);
              }
              this.bumpTrust(rid, 1);
            } else if (away.purpose === 'explore') {
              if (this.map.px === hx && this.map.py === hy && Math.random() < 0.6) {
                const dirs = ['north', 'south', 'east', 'west'];
                const d = dirs[Math.floor(Math.random() * dirs.length)];
                this.say(`🧭 ${first} is back from the ${d}. "It's... different out there. I'll tell you about it." (Ask them what they saw.)`);
                // They actually learned something — askable via conversation.
                v.explorerNews = v.explorerNews || {};
                v.explorerNews[rid] = { dir: d, day: s.day };
              }
            } else if (away.purpose === 'leave' && Math.random() < 0.3) {
              // The 'escape' goal: some who leave come back changed. Most don't.
              if (this.map.px === hx && this.map.py === hy) {
                this.say(`${first} came back. They don't say where they went.`);
              }
            }
            // 'leave' purpose with no return: they're gone. The village notices.
            continue;
          }
          // Still away: drift to adjacent nodes (they're out there, living).
          if (Math.random() < 0.3) {
            const dx = Math.floor(Math.random() * 3) - 1;
            const dy = Math.floor(Math.random() * 3) - 1;
            if (dx || dy) this.npcSetNode(rid, node.nx + dx, node.ny + dy);
          }
          continue;
        }

        // AT HAVEN (or wherever they are): decide to leave.
        if (night) continue; // nobody sets out at night
        let leaveChance = 0, purpose = null, duration = 4;
        const n = this.npcNeeds(rid);
        // Hungry NPCs forage — this is survival, not tourism.
        if ((n.hunger || 0) > 60 && atHaven) { leaveChance = 0.35; purpose = 'forage'; duration = 2 + Math.floor(Math.random() * 3); }
        // The 'escape' goal: they leave. Maybe for good.
        else if (goal === 'escape' && atHaven) { leaveChance = 0.15; purpose = 'leave'; duration = 999; }
        // Bold/restless NPCs explore.
        else if ((temp === 'bold' || temp === 'restless') && atHaven) { leaveChance = 0.12; purpose = 'explore'; duration = 3 + Math.floor(Math.random() * 4); }
        // Curious minds wander.
        else if (atHaven && Math.random() < 0.04) { leaveChance = 1; purpose = 'explore'; duration = 2 + Math.floor(Math.random() * 3); }

        if (purpose && Math.random() < leaveChance) {
          // Step to an adjacent node — not a teleport across the map.
          const dx = Math.floor(Math.random() * 3) - 1;
          const dy = Math.floor(Math.random() * 3) - 1;
          if (!dx && !dy) continue;
          const nx = Math.max(0, Math.min(6, node.nx + dx));
          const ny = Math.max(0, Math.min(6, node.ny + dy));
          if (nx === node.nx && ny === node.ny) continue;
          this.npcSetNode(rid, nx, ny);
          v.away = v.away || {};
          v.away[rid] = { nx, ny, purpose, sinceDay: s.day, sincePart: this.dayPart, duration };
          const first = this.displayName(rid);
          if (this.map.px === hx && this.map.py === hy) {
            if (purpose === 'forage') this.say(`${first} heads out to forage. "Back before dark. Probably."`);
            else if (purpose === 'explore') this.say(`${first} wanders off. "I want to see what's out there."`);
            else if (purpose === 'leave') this.say(`${first} walks away from Haven. They don't look back.`);
          }
          // Leaving is gossip-worthy. Someone always sees someone go — seed
          // two witnesses so the rumor can actually travel the fire.
          try {
            const seen = (this.state.village.roster || []).filter(id => id !== rid && id !== this.villagerId);
            const shuf = [...seen].sort(() => Math.random() - 0.5);
            this.seedGossip('departure', { who: rid }, shuf.slice(0, 2));
          } catch (e) {}
        }

        // THE DOOR: villagers at Haven drift through it on their own agency.
        // Inside/outside is a per-character sub-state — the hall and the grounds
        // are one node, and nobody changes sub-state except by their own choice
        // (or by walking through the door with you). Drift is slow: a person or
        // two per day-part, temperament-led.
        if (atHaven && !this.isEngaged(rid)) {
          try {
            const withYou = this.travelingWith();
            if (!withYou.includes(rid)) {
              const insideNow = this.npcInside(rid);
              const t2 = this.npcTemper(rid);
              const n2 = this.npcNeeds(rid);
              if (night) {
                // Night: almost everyone wants the hall. The grounds are for the watch.
                if (!insideNow && Math.random() < 0.6) this.npcSetInside(rid, true);
              } else {
                // Day: the restless head out, homebodies stay in.
                if (insideNow) {
                  let outChance = 0;
                  if (t2 === 'bold' || t2 === 'restless' || t2 === 'intense') outChance = 0.25;
                  else if (t2 === 'warm' || t2 === 'dry') outChance = 0.12;
                  else if ((n2.social || 0) > 70) outChance = 0.10; // sociable: out where people are
                  if (Math.random() < outChance) this.npcSetInside(rid, false);
                } else {
                  // Outside already: drift back in sometimes (meals, rest, habit).
                  if (Math.random() < 0.15) this.npcSetInside(rid, true);
                }
              }
            }
          } catch (e) {}
        }
      }
    },

    // ============ ALIVE: needs-driven villagers ============
    // Behavior from wants, not dice. A hungry villager seeks food because
    // they're hungry. A scared one seeks the fire. Moods shift with events.
    // They remember what you did — kindness and indifference both.
    npcNeeds(rid) {
      const v = this.state.village;
      v.needs = v.needs || {};
      if (!v.needs[rid]) v.needs[rid] = { hunger: 30, fear: 20, social: 40, energy: 70 };
      return v.needs[rid];
    },
    npcName(rid) {
      const vp = (this.data.villagers || []).find(x => x.id === rid)
        || (this.data.background_survivors || []).find(x => x.id === rid);
      return vp ? vp.name.split(' ')[0] : 'Someone';
    },

    // ============ STRANGERS → PEOPLE ============
    // Pre-System, villagers are strangers: no names, no stats, no scanning.
    // You're just a person meeting strangers. A name is earned socially:
    // they tell you ("I'm Mei"), or you hear someone else mention them.
    // Post-System (day 7), the overlay just GIVES you names — invasive by
    // contrast with the human way you learned the first few.
    // Every user-facing reference to a person goes through displayName() —
    // raw IDs (gen_a1b2c3) must NEVER reach the UI.
    nameKnown(vid) {
      return !!((this.state.village.knownNames || {})[vid]);
    },
    revealName(vid, how) {
      const village = this.state.village;
      village.knownNames = village.knownNames || {};
      if (village.knownNames[vid] || this.state.systemArrived) return false;
      const v = (this.data.villagers || []).find(x => x.id === vid)
        || (this.data.background_survivors || []).find(x => x.id === vid);
      const first = v ? v.name.split(' ')[0] : 'Someone';
      village.knownNames[vid] = true;
      if (how === 'intro') this.say(`"${first}," they say, touching their chest. "I'm ${first}." You'll remember that.`);
      else if (how === 'overheard') this.say(`A name drifts over from the fire: ${first}. That's the ${this.descriptorBase(vid)} — now they have a name.`);
      else if (how === 'gesture') this.say(`They point at themself and say it slowly, twice. It sounds like a name: ${first}.`);
      return true;
    },
    _hashStr(s) {
      let h = 0;
      for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) >>> 0;
      return h;
    },
    // descriptorBase: what you'd actually observe. "woman, maybe 30s".
    // Stable per villager (not random each call) so you can recognize them.
    descriptorBase(vid) {
      const v = (this.data.villagers || []).find(x => x.id === vid)
        || (this.data.background_survivors || []).find(x => x.id === vid) || {};
      let pro = v.pro;
      if (!pro) pro = ['she', 'he', 'they'][this._hashStr(vid) % 3];
      const age = v.age || 30;
      const band = age < 25 ? '20s' : age < 35 ? '30s' : age < 45 ? '40s' : age < 55 ? '50s' : '60s';
      const who = pro === 'she' ? 'woman' : pro === 'he' ? 'man' : 'person';
      return `${who}, maybe ${band}`;
    },
    personDescriptor(vid) {
      return 'A ' + this.descriptorBase(vid);
    },
    // displayName: THE funnel. Names pre-System only if earned socially.
    displayName(vid) {
      if (this.state.systemArrived || this.nameKnown(vid)) return this.npcName(vid);
      return this.personDescriptor(vid);
    },
    // journalNote: the general journal. Personal notes the player keeps —
    // pre-System it's handwriting, post-System it's Codex. Deduped by cat+key
    // so repeated events don't spam. (Was called in 8 places but never defined —
    // every call site silently no-opped. Now it's real.)
    journalNote(cat, key, text) {
      try {
        const cx = this.state.codex = this.state.codex || {};
        cx.notes = cx.notes || [];
        if (cx.notes.some(n => n.cat === cat && n.key === key)) return false;
        cx.notes.push({ day: (this.state.scholar || {}).day || 0, cat, key, text: String(text) });
        const jw = this.state.systemArrived ? 'Codex' : 'Journal';
        this.say(`📓 ${jw}: ${text}`);
        return true;
      } catch (e) { return false; }
    },
    // firstRef: first-name-like reference that NEVER collapses to bare "A".
    // Known/post-System → first name. Unknown → distinguishing descriptor
    // ("the woman in her 30s") so gossip/living-world lines never truncate
    // "A woman, maybe 30s" into "A". Use this anywhere you'd split(' ')[0]
    // a displayName.
    firstRef(vid) {
      try {
        if (this.state.systemArrived || this.nameKnown(vid)) {
          const v = (this.data.villagers || []).find(x => x.id === vid)
            || (this.data.background_survivors || []).find(x => x.id === vid) || {};
          return String(v.name || 'Someone').split(' ')[0];
        }
        if (typeof this.whoTag === 'function') return this.whoTag(vid);
      } catch (e) {}
      // fallback: descriptor without the leading "A"
      try { return this.personDescriptor(vid).replace(/^A /, 'the '); } catch (e) {}
      return 'someone';
    },

    // ============ GOALS ============
    npcGoal(vid) {
      const v = (this.data.villagers || []).find(x => x.id === vid)
        || (this.data.background_survivors || []).find(x => x.id === vid) || {};
      if (v.goal) return v.goal;
      return (this.state.village.bgGoals || {})[vid] || null;
    },
    // DARK: roll a rare dark trait. ~2.5% benign (weird, unsettling, harmless),
    // ~1.5% malicious (dangerous, hidden). Returns {kind, tell, _tell} or null.
    // The _tell carries the story fragments; strip it before storing.
    rollDarkTrait() {
      const tells = (this.data.characterGen || {}).darkTells || {};
      const roll = Math.random();
      const pool = roll < 0.015 ? (tells.malicious || [])
        : roll < 0.04 ? (tells.benign || []) : null;
      if (!pool || !pool.length) return null;
      const tell = pool[Math.floor(Math.random() * pool.length)];
      return { kind: roll < 0.015 ? 'malicious' : 'benign', tell: tell.id, _tell: tell };
    },
    // darkTellOf: look up the tell object for a stored dark trait.
    darkTellOf(dark) {
      if (!dark) return null;
      const tells = (this.data.characterGen || {}).darkTells || {};
      const pool = dark.kind === 'malicious' ? (tells.malicious || []) : (tells.benign || []);
      return pool.find(t => t.id === dark.tell) || null;
    },
    // npcDark: the hidden truth about someone. Generated cast carries it in
    // personality.dark; background survivors get a per-run draw in bgDark.
    // Returns {kind:'benign'|'malicious', tell} or null. Never user-labeled.
    npcDark(vid) {
      const rc = (this.state.village.rosterChars || {})[vid];
      if (rc && rc.personality && rc.personality.dark) return rc.personality.dark;
      return (this.state.village.bgDark || {})[vid] || null;
    },
    // npcQuirk: the visible quirk, dark tell included. Background survivors
    // carry no quirk in static data — a dark one's tell surfaces from bgDark.
    npcQuirk(vid) {
      const dark = this.npcDark(vid);
      if (dark) { const t = this.darkTellOf(dark); if (t && t.quirk) return t.quirk; }
      const rc = (this.state.village.rosterChars || {})[vid];
      if (rc && rc.personality && rc.personality.quirk) return rc.personality.quirk;
      const vp = this.vpOf(vid);
      return (vp.personality && vp.personality.quirk) || null;
    },
    goalWant(vid) {
      const g = (this.data.characterGen.goals || []).find(x => x.id === this.npcGoal(vid));
      return g ? g.want : null;
    },

    // ============ REPUTATION ============
    // Multidimensional, per-villager, filtered through personality, goals,
    // and groups. The village watches everything you do — and everyone
    // interprets it differently. Nothing is neutral.
    repOf(vid) {
      const v = this.state.village;
      v.rep = v.rep || {};
      return v.rep[vid] || (v.rep[vid] = { generous: 0, brave: 0, honest: 0, competent: 0 });
    },
    // repWords: how they see you, in plain language. Post-System display.
    repWords(vid) {
      const r = this.repOf(vid);
      const dim = (val, hi, lo) => val >= 25 ? hi : val <= -25 ? lo : null;
      const words = [dim(r.generous, 'generous', 'stingy'), dim(r.brave, 'brave', 'cowardly'),
        dim(r.honest, 'straight with people', 'scheming'), dim(r.competent, 'capable', 'useless')]
        .filter(Boolean);
      return words.length ? words.join(', ') : 'still making up their mind';
    },
    // repTalkLines: they talk about what they think of YOU. Earned opinions.
    repTalkLines(vid) {
      const r = this.repOf(vid);
      const out = [];
      if (r.generous >= 30) out.push("You always share. People notice. I notice.");
      if (r.generous <= -30) out.push("You keep a tight grip on your pack. I've seen it.");
      if (r.brave >= 30) out.push("What you did out there — that took guts. I won't forget it.");
      if (r.brave <= -30) out.push("You run when it matters. Everyone saw.");
      if (r.honest <= -30) out.push("Why are you being so nice lately? What's the angle? There's always an angle.");
      if (r.honest >= 30) out.push("You're straight with people. That's rarer than food out here.");
      if (r.competent >= 30) out.push("You know what you're doing. That's rare. That's good.");
      if (r.competent <= -30) out.push("No offense, but I'm not following you into the treeline.");
      return out;
    },
    // observe: the village watches you act. Every villager interprets the act
    // through their own lens — temperament, goal, relationship to the target.
    // opts: {target, task, noTrust}
    // observe: the village watches you act. Every villager interprets the act
    // through their own lens — temperament, goal, relationship to the target.
    // PROXIMITY MATTERS: only witnesses (nearby) see it directly. Everyone
    // else hears about it secondhand — distorted — or not at all.
    // opts: {target, task, noTrust, noGossip}
    // murderDims: how the village reads a killing. Depends on the victim.
    // Killing a feared psycho: less horror, a grim note of respect from some.
    // Killing a harmless weirdo or a beloved innocent: worse than baseline.
    murderDims(vid) {
      const dark = this.npcDark(vid);
      if (dark && dark.kind === 'malicious')
        return { honest: -15, generous: -10, brave: 2, competent: 0 };
      if (dark && dark.kind === 'benign')
        return { honest: -40, generous: -30, brave: -8, competent: 0 };
      const r = this.repOf(vid);
      const like = (r.generous || 0) + (r.honest || 0);
      if (like >= 20) return { honest: -38, generous: -28, brave: -8, competent: 0 };
      if (like <= -20) return { honest: -20, generous: -12, brave: 0, competent: 0 };
      return { honest: -30, generous: -20, brave: -5, competent: 0 };
    },
    observe(action, opts) {
      opts = opts || {};
      const AX = {
        give_food: { generous: 6, competent: 1 },
        donate: { generous: 5, competent: 2 },
        order: { competent: 3, honest: -1 },
        fight: { brave: 10, competent: 2 },
        flee: { brave: -8 },
        talk: { honest: 1 },
        hoard: { generous: -6, honest: -2 },
        share_knowledge: { generous: 3, competent: 3 },
        deal: { generous: 2, honest: -2, competent: 2 },
        appeal: { honest: 2, competent: 1 },
        comfort: { generous: 4, honest: 2 },
        amends: { honest: 5 },
        rally: { brave: 3, competent: 4 },
        mediate: { honest: 5, competent: 3 },
        promise: { honest: 2, generous: 1 },
        coalition: { competent: 2, honest: -1 },
        confront: { brave: 2, honest: 1 },
        // ATTACK: turning on someone. The outcome isn't known yet — the
        // aftermath upgrades the village's read to murder if it becomes one.
        // (Same dims as the 'attack' gossip seeded post-fight.)
        attack: { honest: -25, generous: -20, brave: 5, competent: 0 },
        // MURDER: attacking a non-hostile person. Witnesses don't admire this.
        // There is no brave reading. There is horror, and there is fear of you.
        murder: { honest: -30, generous: -20, brave: -5, competent: 0 },
        // CORPSE SYSTEM: looting the fresh dead where others can see.
        // "They were picking his pockets before he was cold."
        loot_corpse: { honest: -10, generous: -8, brave: -2, competent: 0 },
        // THEFT: hands in someone's pack. The village hates thieves more
        // than cowards — trust is the currency and you counterfeited it.
        theft: { honest: -25, generous: -15, brave: -3, competent: 0 },
        // INTIMIDATION: "your food, now." Some read it as strength; most
        // read it as the thing it is. The victim's fear is the real tell.
        intimidation: { honest: -15, generous: -8, brave: 3, competent: 0 },
        bully: { honest: -12, generous: -10, brave: 2, competent: 0 },
        honor_dead: { honest: 4, generous: 3, brave: 0, competent: 0 },
        bury_dead: { honest: 5, generous: 4, brave: 2, competent: 1 },
      }[action];
      if (!AX) return;
      const roster = ((this.state.village || {}).roster || []).filter(id => id !== this.villagerId);
      // witnesses see it directly; the 9x9 grid means range 3 is "there",
      // beyond that it's hearsay.
      const wit = this.witnesses(3);
      const hasPositions = wit !== null;
      // those who weren't there hear about it later — secondhand, distorted.
      if (hasPositions && !opts.noGossip) {
        const heardBy = wit.filter(id => id !== this.villagerId);
        if (heardBy.length < roster.length) this.seedGossip(action, AX, heardBy, opts.noTrust);
      }
      for (const vid of roster) {
        const temp = this.npcTemper(vid);
        const goal = this.npcGoal(vid);
        const isTarget = opts.target === vid;
        const isWitness = !hasPositions || isTarget || wit.includes(vid);
        if (!isWitness) continue; // they'll hear it secondhand, distorted
        const dims = { ...AX };
        // THE LENS: the same act means different things to different people.
        if (action === 'give_food') {
          if (isTarget) dims.generous += 4; // the recipient is grateful
          else if (goal === 'lead') { dims.generous = 2; dims.honest = -6; } // buying loyalty
          if (isTarget && (temp === 'prickly' || goal === 'prove')) dims.generous = -4; // charity resented
          if (!isTarget && (goal === 'survive' || temp === 'cautious') && goal !== 'lead') dims.honest = -3; // what's she after?
          // (goal 'lead' keeps its sharper buying-loyalty reading above — this
          // line used to stomp it back to -3.)
        }
        if (action === 'fight') {
          if (temp === 'bold') dims.brave += 4; // respect
          if (temp === 'cautious') dims.brave = -4; // reckless
          if (goal === 'lead') dims.competent = -4; // showing off
        }
        if (action === 'order') {
          if (goal === 'lead') dims.honest = -5; // power grab
          if (isTarget && temp === 'prickly') dims.honest = -3;
        }
        if (action === 'donate' && goal === 'lead') dims.honest = -3;
        if (action === 'murder' && opts.target) {
          // WITNESSES judge the killing by the victim. A dead psycho reads
          // different than a dead innocent — same blood, different meaning.
          const md = this.murderDims(opts.target);
          for (const k of Object.keys(md)) dims[k] = md[k];
        }
        this.applyRep(vid, dims, isTarget ? 1 : 0.8, opts.noTrust);
      }
    },
    // witnesses: who was close enough to SEE it. Information follows eyes,
    // not broadcast. Returns null when position data is unavailable.
    witnesses(range) {
      const v = this.state.village;
      const pos = v.positions;
      const s = this.state.scholar;
      if (!pos || s.mx === undefined || s.mx === null) return null;
      const out = [];
      for (const [rid, p] of Object.entries(pos)) {
        if (rid === this.villagerId) continue;
        if (Math.max(Math.abs(p.mx - s.mx), Math.abs(p.my - s.my)) <= (range || 6)) out.push(rid);
      }
      return out;
    },
    // combatWitnessReact (Steve 2026-10-05): villagers NEARBY visibly judge the
    // fight — actual lines you see, not silent reputation dims. Brave ones
    // watch openly, cautious ones flinch, rivals find something to say.
    // moment: 'start' | 'kill' | 'hurt' | 'flee'
    combatWitnessReact(moment) {
      const wit = this.witnesses(6);
      if (!wit || !wit.length) return;
      // One voice per fight moment — not a chorus.
      const rid = wit[Math.floor(Math.random() * wit.length)];
      const name = this.displayName(rid);
      const brave = (this.repOf(rid).brave || 0);
      const lines = {
        start: brave > 5
          ? [`${name} squares up to watch. "Give it hell."`, `${name} doesn't look away. "About time someone fought back."`]
          : brave < -5
          ? [`${name} backs away, hands up. "Don't — don't bring it here!"`, `${name} goes pale. "We should RUN."`]
          : [`${name} freezes. "What IS that?"`, `${name} watches, jaw tight.`],
        kill: brave > 5
          ? [`${name} whoops. "That's how it's done!"`, `${name} nods, slow. "Remind me not to cross you."`]
          : [`${name} exhales. "It's dead? It's really dead."`, `${name} stares at the body, then at you.`],
        hurt: [`${name} winces. "You're bleeding!"`, `${name} shouts: "Move! MOVE!"`],
        flee: brave > 5
          ? [`${name} spits. "Coward's move. Smart, but coward's."`]
          : [`${name} sags with relief. "Good. Good call."`],
      }[moment] || [];
      if (lines.length) this.say(this.pickFresh(lines, 'witness_' + moment));
    },
    // seedGossip: those who weren't there hear about it later — secondhand,
    // distorted, traveling along social lines. "She gave me food" becomes
    // "she's giving away all the supplies" by the third retelling.
    seedGossip(action, dims, heardBy, noTrust) {
      const v = this.state.village;
      v.gossip = v.gossip || [];
      const partKey = this.state.scholar.day + ':' + this.dayPart;
      if (v.gossip.some(g => g.action === action && g.partKey === partKey)) return;
      v.gossip.push({
        action, dims: { ...dims }, heard: [...(heardBy || [])],
        distortion: 0, day: this.state.scholar.day, partKey, noTrust: !!noTrust,
      });
    },
    // spreadGossip: each part, hearers tell non-hearers — preferring their own
    // circle. Gossips spread fast; private people don't. Stories mutate.
    spreadGossip() {
      const v = this.state.village;
      v.gossip = v.gossip || [];
      for (const g of v.gossip) {
        for (const teller of [...g.heard]) {
          if (!(v.roster || []).includes(teller)) continue;
          const temp = this.npcTemper(teller);
          const rate = temp === 'warm' ? 0.5 : (temp === 'prickly' || temp === 'withdrawn') ? 0.08 : 0.22;
          if (Math.random() > rate) continue;
          const candidates = (v.roster || []).filter(id =>
            id !== this.villagerId && id !== teller && !g.heard.includes(id));
          if (!candidates.length) continue;
          // information follows social lines: group members first
          const mates = new Set();
          for (const gr of (v.groups || [])) if (gr.members.includes(teller)) gr.members.forEach(m => mates.add(m));
          candidates.sort((a, b) => (mates.has(b) ? 1 : 0) - (mates.has(a) ? 1 : 0));
          const listener = candidates[0];
          g.heard.push(listener);
          g.distortion++;
          const dims = { ...g.dims };
          if (g.distortion >= 2 && Math.random() < 0.45) {
            const keys = Object.keys(dims);
            const k = keys[Math.floor(Math.random() * keys.length)];
            dims[k] = Math.round(dims[k] * 1.6 + (Math.random() < 0.25 ? -Math.sign(dims[k] || 1) * 5 : 0));
            if (Math.random() < 0.3) {
              this.say(`You catch fragments by the fire — ${this.displayName(teller)} telling ${this.displayName(listener)} about you. The story's getting bigger than what happened.`);
            }
          }
          this.applyRep(listener, dims, 0.4, g.noTrust);
        }
      }
      // stories fade after ~3 days
      v.gossip = v.gossip.filter(g => (this.state.scholar.day - g.day) < 3);
      // monster encounter reports travel the same social lines
      try { this.spreadMonsterNews(); } catch (e2) {}
    },
    // spreadPlantKnowledge: word of mouth is SLOW (Steve 2026-10-05). Each
    // day-part, for each plant that's "going around," a knower may teach one
    // non-knower. Full village knowledge takes days, not instants. Pre-codex
    // this is the only way plant knowledge travels between villagers; the
    // Codex automates it once it comes alive (systemArrived seeds everyone).
    spreadPlantKnowledge() {
      const v = this.state.village;
      if (!v || !v.plantRumors) return;
      v.taught = v.taught || {};
      const roster = v.roster || [];
      if (roster.length < 2) return;
      for (const pid of Object.keys(v.plantRumors)) {
        const knows = rid => (v.taught[rid] || []).includes(pid);
        const knowers = roster.filter(knows);
        const learners = roster.filter(rid => !knows(rid));
        if (!learners.length) { delete v.plantRumors[pid]; continue; }
        if (!knowers.length) continue;
        if (Math.random() < 0.35) {
          const teacher = knowers[Math.floor(Math.random() * knowers.length)];
          const learner = learners[Math.floor(Math.random() * learners.length)];
          if (this.villagerLearnsPlant(learner, pid, 'word of mouth')) {
            const p = (this.data.plants || []).find(x => x.id === pid);
            if (p && Math.random() < 0.3) {
              this.say(`${this.displayName(teacher)} showed ${this.displayName(learner)} the ${p.name} — "remember it." Word gets around. Slowly.`);
            }
          }
        }
      }
    },
    // talkReason: why THEY want to talk to YOU. Villagers initiate because
    // they heard something, want something, or are worried.
    // talkReason lines are TEMPLATES with a __NAME__ placeholder — see
    // renderTalkLine. The requester may earn their name between the request
    // firing and the player answering it, so the name renders at delivery.
    talkReason(rid) {
      const v = this.state.village;
      for (const g of (v.gossip || [])) {
        if (!g.heard.includes(rid)) continue;
        const neg = Object.entries(g.dims).some(([k, val]) => val < -3);
        if (neg && Math.random() < 0.6) {
          return { line: `"Can we talk?" __NAME__ glances around first. "People are saying things. About you. Is any of it true?"` };
        }
      }
      const goal = this.npcGoal(rid);
      const pantryLow = this.pantryKcalLive(v) < 4000;
      const roll = Math.random();
      if (goal === 'prove' && roll < 0.5) return { line: `"Can we talk?" __NAME__ shifts their weight. "I need something to do. Anything. Please."` };
      if (goal === 'alone' && roll < 0.4) return { line: `"Can we talk?" __NAME__ sighs. "I need some space. A corner nobody needs me in. Is that okay?"` };
      if (goal === 'family' && roll < 0.4) return { line: `"Can we talk? Have you seen anyone on the roads? Anyone at all? I'm asking everyone."` };
      if (goal === 'lead' && (v.heat || {})[rid] > 0 && roll < 0.5) return { line: `"Can we talk?" __NAME__ doesn't wait for an answer. "We need to discuss how things are run here."` };
      if (pantryLow && roll < 0.35) return { line: `"Can we talk?" __NAME__ keeps their voice low. "The stores. Have you looked at the stores? We're running thin."` };
      // JUST TALK (Steve 2026-10-05): people should come talk to you more.
      // Was 0.25 — approaches were so rare players never noticed the mechanic.
      if (roll < 0.5) return { line: `"Can we talk?" __NAME__ sits down near you. "Just... talk. Like people used to."` };
      return null;
    },
    // renderTalkLine: a stored talk-request line is a template; the name is
    // always rendered fresh. Old saves baked the name in at creation time —
    // no placeholder there, so they render unchanged (slightly stale, harmless).
    renderTalkLine(line, vid) {
      return String(line || '').replaceAll('__NAME__', this.displayName(vid));
    },
    // applyRep: write the dims, drift trust, ripple through their group.
    applyRep(vid, dims, weight, noTrust) {
      const r = this.repOf(vid);
      let dTrust = 0;
      for (const k of Object.keys(dims)) {
        const delta = Math.round((dims[k] || 0) * (weight || 1));
        if (!delta) continue;
        r[k] = Math.max(-100, Math.min(100, (r[k] || 0) + delta));
        dTrust += delta * 0.6;
      }
      const t = this.state.village.trust || (this.state.village.trust = {});
      if (!noTrust && dTrust !== 0) {
        // WORDS ONLY GO SO FAR applies to talk; real acts can move trust far.
        t[vid] = Math.max(0, Math.min(100, (t[vid] || 10) + Math.round(dTrust)));
      }
      // RIPPLES: their circle feels it too, at 40%.
      for (const g of (this.state.village.groups || [])) {
        if (!g.members.includes(vid)) continue;
        for (const mid of g.members) {
          if (mid === vid || mid === this.villagerId) continue;
          const mr = this.repOf(mid);
          for (const k of Object.keys(dims)) {
            const rd = Math.round((dims[k] || 0) * (weight || 1) * 0.4);
            if (rd) mr[k] = Math.max(-100, Math.min(100, (mr[k] || 0) + rd));
          }
          if (!noTrust && dTrust !== 0) {
            t[mid] = Math.max(0, Math.min(100, (t[mid] || 10) + Math.round(dTrust * 0.4)));
          }
        }
      }
    },
    // genGroups: informal circles — friends, confidants, factions.
    // Your action toward one person ripples through their group.
    genGroups() {
      const v = this.state.village;
      const ids = ((v.roster || []).filter(id => id !== this.villagerId));
      const order = [...ids].sort(() => Math.random() - 0.5);
      const kinds = ['friends', 'confidants', 'faction'];
      const groups = [];
      let i = 0, gi = 0;
      while (i < order.length) {
        const size = Math.min(2 + Math.floor(Math.random() * 3), order.length - i);
        if (size < 2) break;
        groups.push({ id: 'g' + (gi), kind: kinds[gi % kinds.length], members: order.slice(i, i + size) });
        i += size; gi++;
      }
      v.groups = groups;
    },
    // fillTalkLine: shared dialogue data carries {first}/{occ}/{an_occ}/{Occ}/{origin}/{skill}.
    // {occ} is lowercase bare ("fisherman"), {an_occ} has the article
    // ("a fisherman"/"an ER nurse"), {Occ} is capitalized bare for appositives.
    // NOTE: {an_occ} must be replaced BEFORE {occ} — it's a superstring.
    fillTalkLine(line, v) {
      const first = ((v && v.name) || 'Someone').split(' ')[0];
      const occRaw = String((v && v.formerOccupation) || 'survivor');
      const occ = occRaw.charAt(0).toLowerCase() + occRaw.slice(1);
      const Occ = occRaw.charAt(0).toUpperCase() + occRaw.slice(1);
      const an_occ = (/^[aeiou]/i.test(occ) ? 'an ' : 'a ') + occ;
      return String(line).replaceAll('{an_occ}', an_occ)
        .replaceAll('{Occ}', Occ)
        .replaceAll('{occ}', occ)
        .replaceAll('{first}', first)
        .replaceAll('{origin}', (v && v.homeRegion) || 'somewhere')
        .replaceAll('{skill}', 'making do');
    },
    // ============ LEADERSHIP COMPETITION ============
    // Contenders (goal 'lead') push back when you delegate. Heat builds;
    // at 3 they confront you. Yield and they run a domain — building their
    // own base. Hold your ground and they back down... for now. Ignore them
    // and they stop asking and just TAKE it.
    leadershipFriction(vid, task) {
      const v = this.state.village;
      v.heat = v.heat || {};
      const contenders = (v.roster || []).filter(id =>
        id !== this.villagerId && id !== vid && this.npcGoal(id) === 'lead');
      for (const cid of contenders) {
        const temp = this.npcTemper(cid);
        if ((temp === 'bold' || temp === 'prickly' || temp === 'intense') && Math.random() < 0.4) {
          v.heat[cid] = (v.heat[cid] || 0) + 1;
          const d = this.displayName(cid);
          const lines = [
            `${d} watches you give the order. "Interesting. Nobody asked me."`,
            `"Why are YOU giving orders?" ${d} doesn't raise their voice. That's worse.`,
            `${d} folds their arms. "Sure. Your call. For now."`,
          ];
          this.say(lines[Math.floor(Math.random() * lines.length)]);
          const t = v.trust || (v.trust = {});
          t[cid] = Math.max(0, (t[cid] || 10) - 2);
          if (v.heat[cid] >= 3 && !v.challenge) {
            v.challenge = { cid, task, age: 0 };
            this.say(`${d} steps closer. "We need to talk. About who's actually running things here."`);
          }
        }
      }
    },
    // personActivityLine: what they're doing, in plain observed language.
    // For the pre-System person sheet — no stats, just eyes.
    personActivityLine(vid) {
      const need = this.dominantNeed(vid);
      const mood = this.npcMood(vid);
      const v = (this.data.villagers || []).find(x => x.id === vid)
        || (this.data.background_survivors || []).find(x => x.id === vid) || {};
      const pro = v.pro || (['she', 'he', 'they'][this._hashStr(vid) % 3]);
      const They = pro === 'they' ? 'They' : pro === 'she' ? 'She' : 'He';
      const keep = pro === 'they' ? 'keep' : 'keeps';
      const are = pro === 'they' ? 'are' : 'is';
      const map = {
        fear: `${They} ${keep} glancing at the treeline.`,
        hunger: `${They} ${keep} rubbing their stomach, trying not to show it.`,
        loneliness: `${They} ${are} sitting a little apart from the others.`,
        exhaustion: `${They} move${pro === 'they' ? '' : 's'} slowly, like everything costs.`,
        grief: `${They} stare${pro === 'they' ? '' : 's'} at nothing for a long time.`,
        gratitude: `${They} ${keep} nodding at people, smiling tiredly.`,
        ease: `${They} look${pro === 'they' ? '' : 's'} almost relaxed. Almost.`,
        calm: `${They} ${are} by the fire, watching it.`,
      };
      let line = map[need] || map.calm;
      if (mood === 'grieving' && need !== 'grief') line = `${They} went quiet a while ago. Nobody's asked.`;
      return line;
    },
    npcMood(rid) {
      // mood is derived, not stored — dominant need + village weather wins.
      const v = this.state.village;
      const n = this.npcNeeds(rid);
      if ((v.grief || 0) > 0) return 'grieving';
      const mem = (v.memory || {})[rid] || [];
      const recent = mem.filter(m => (this.state.scholar.day - (m.day || 0)) <= 2);
      if (n.fear > 70) return 'scared';
      if (n.hunger > 70) return 'hungry';
      if (recent.some(m => m.t === 'gift' || m.t === 'saved')) return 'grateful';
      if (recent.some(m => m.t === 'ignored')) return 'cold';
      if ((v.cheer || 0) > 0) return 'cheerful';
      if (n.social > 78) return 'lonely';
      if (n.energy < 20) return 'weary';
      return 'steady';
    },
    remember(rid, type, note) {
      const v = this.state.village;
      v.memory = v.memory || {}; v.memory[rid] = v.memory[rid] || [];
      v.memory[rid].push({ t: type, day: this.state.scholar.day, note: note || '' });
      if (v.memory[rid].length > 20) v.memory[rid].shift();
    },
    // villageEvent: the village feels things together.
    villageEvent(type, opts) {
      opts = opts || {};
      const v = this.state.village;
      const atHaven = this.map.px === 3 && this.map.py === 3;
      if (type === 'monster_attack') {
        if (!atHaven) return;
        for (const rid of (v.roster || [])) { if (rid !== this.villagerId) this.npcNeeds(rid).fear = Math.min(100, this.npcNeeds(rid).fear + 35); }
        this.say('The village is rattled. Everyone\'s jumpy — eyes on the treeline.');
      } else if (type === 'death') {
        v.grief = 3;
        for (const rid of (v.roster || [])) { if (rid !== this.villagerId) { const n = this.npcNeeds(rid); n.fear = Math.min(100, n.fear + 25); n.social = Math.min(100, n.social + 20); } }
        this.say('Nobody\'s talking much. The fire feels smaller tonight.');
      } else if (type === 'murder') {
        // YOU killed someone. The village reacts to WHO died, not just that
        // someone did. A beloved innocent: horror. A feared psycho: uneasy relief.
        const victim = opts.victim;
        // UNWITNESSED: nobody saw, the body isn't found yet. The village does
        // NOT react — the woods keep your secret (it's v.unsolved for the
        // detective systems, and the crime is still recorded by the justice
        // wrapper below). No broadcast without eyes.
        if (opts.witnessed === false) return;
        const vDarkM = victim ? this.npcDark(victim) : null;
        const vnameM = victim ? this.displayName(victim) : 'someone';
        const malVictim = vDarkM && vDarkM.kind === 'malicious';
        const benVictim = vDarkM && vDarkM.kind === 'benign';
        v.grief = malVictim ? 3 : 5;
        const fearBump = malVictim ? 30 : benVictim ? 55 : 45;
        const trustDrop = malVictim ? 10 : benVictim ? 20 : 15;
        for (const rid of (v.roster || [])) {
          if (rid !== this.villagerId) {
            const n = this.npcNeeds(rid); n.fear = Math.min(100, n.fear + fearBump); n.social = Math.min(100, n.social + 30);
            // trust craters: you are dangerous now
            const t = (v.trust && v.trust[rid]) || 10;
            if (v.trust) v.trust[rid] = Math.max(0, t - trustDrop);
          }
        }
        if (malVictim) {
          this.say(`Nobody's mourning ${vnameM} out loud. That silence says more than grief would. They still look at you differently — you're the one who did it.`);
        } else if (benVictim) {
          this.say(`${vnameM} never hurt anyone. Everyone knew that. Everyone knows what you did. The fire feels smaller, and you are the reason.`);
        } else {
          this.say('They look at you differently now. The fire feels smaller, and you are the reason.');
        }
      } else if (type === 'donation') {
        v.cheer = Math.max(v.cheer || 0, 2);
        for (const rid of (v.roster || [])) { if (rid !== this.villagerId) this.npcNeeds(rid).hunger = Math.max(0, this.npcNeeds(rid).hunger - 25); }
        this.say('Full bellies change the weather inside people. The haven feels warmer.');
      } else if (type === 'victory') {
        if (!atHaven) return;
        v.cheer = Math.max(v.cheer || 0, 1);
        for (const rid of (v.roster || [])) { if (rid !== this.villagerId) this.npcNeeds(rid).fear = Math.max(0, this.npcNeeds(rid).fear - 20); }
        this.say('You came back bloody. Nobody asks. Someone saves you the good seat by the fire.');
      }
    },
    // tickNeeds: wants grow with time. called every day part.
    tickNeeds() {
      const v = this.state.village;
      if (!v.roster) return;
      for (const rid of v.roster) {
        if (rid === this.villagerId) continue;
        const n = this.npcNeeds(rid);
        n.hunger = Math.min(100, n.hunger + 8);
        n.social = Math.min(100, n.social + 6);
        n.fear = Math.max(0, n.fear - 8);
        n.energy = Math.min(100, n.energy + 4);
      }
      if ((v.grief || 0) > 0) v.grief--;
      if ((v.cheer || 0) > 0) v.cheer--;
      // unanswered requests curdle: asked, ignored, remembered.
      const reqs = v.requests || {};
      for (const rid of Object.keys(reqs)) {
        const r = reqs[rid];
        if ((this.state.scholar.day - (r.day || 0)) >= 1) {
          delete reqs[rid];
          this.remember(rid, 'ignored', r.type);
          const t = (v.trust || {})[rid] || 10;
          if (v.trust) v.trust[rid] = Math.max(0, t - 2);
          const temp = this.npcTemper(rid);
          if (temp === 'prickly' || temp === 'bold') this.say(`${this.displayName(rid)} stops asking. The look says enough.`);
        }
      }
    },
    npcTemper(rid) {
      const vp = (this.data.villagers || []).find(x => x.id === rid)
        || (this.data.background_survivors || []).find(x => x.id === rid);
      return (vp && vp.personality && vp.personality.temperament) || 'steady';
    },
    // npcIntel: how this person is smart. Primary from occupation (what the job
    // demanded), secondary from temperament+curiosity (who they are). Six kinds,
    // not IQ — an observant forager and an analytical programmer are both sharp,
    // in completely different directions.
    npcIntel(rid) {
      // background survivors carry per-run intelligence in village state
      // (static data can't hold it) — same minds, same rules.
      const bv = (this.state.village || {}).bgIntel || {};
      if (bv[rid] && bv[rid].primary) return { primary: bv[rid].primary, secondary: bv[rid].secondary || 'practical' };
      const vp = (this.data.villagers || []).find(x => x.id === rid)
        || (this.data.background_survivors || []).find(x => x.id === rid);
      const intel = (vp && vp.intelligence) || {};
      const defs = (this.data.characterGen || {}).intelligences || {};
      const primary = (intel.primary && defs[intel.primary]) ? intel.primary : 'steady';
      let secondary = (intel.secondary && defs[intel.secondary] && intel.secondary !== primary)
        ? intel.secondary : 'practical';
      if (secondary === primary) secondary = primary === 'steady' ? 'practical' : 'steady';
      return { primary, secondary };
    },
    npcIntelName(rid) {
      const defs = (this.data.characterGen || {}).intelligences || {};
      const { primary } = this.npcIntel(rid);
      return (defs[primary] && defs[primary].name) || 'Steady';
    },
    // theorizeWith: thinking TOGETHER, not info-vending. The NPC offers a theory
    // in their intelligence voice; sharp minds advance your understanding for real.
    // topics: 'system' | 'monsters' | 'situation'
    theorizeWith(vid, topic) {
      const cg = this.data.characterGen || {};
      const theories = cg.theories || {};
      const { primary, secondary } = this.npcIntel(vid);
      const first = this.displayName(vid);
      topic = ['system', 'monsters', 'situation'].includes(topic) ? topic : 'situation';
      // no-repeat: track said theory lines per villager like conversations do.
      const v = this.state.village;
      v.theoriesSaid = v.theoriesSaid || {};
      const saidKey = vid + ':' + primary + ':' + topic;
      v.theoriesSaid[saidKey] = v.theoriesSaid[saidKey] || [];
      const pool = ((theories[primary] || {})[topic] || []).filter(l => v.theoriesSaid[saidKey].indexOf(l) === -1);
      const line = pool.length
        ? pool[Math.floor(Math.random() * pool.length)]
        : (cg.theorizeAsks || ["\"What's your read? I want to know if I'm crazy.\""])[Math.floor(Math.random() * (cg.theorizeAsks || []).length)] || "\"What's your read?\"";
      if (pool.length) v.theoriesSaid[saidKey].push(line);
      this.say(`${first}: ${line}`);
      this.remember(vid, 'theorized_' + topic, primary);
      // ACTION CLOCK: real thinking takes time (2 ticks, time-only).
      try { this.tickAction(2); } catch (e) {}
      try { this.setEngaged(vid, 2); } catch (e) {}
      // MECHANICAL EFFECTS — different minds teach different things.
      // Primary speaks at full strength; secondary contributes at half.
      // Both intelligences matter: a practical/analytical person teaches
      // with their hands AND explains the why.
      const intelDefs = cg.intelligences || {};
      const topicSkill = { system: ['system_theology', 'system_architecture', 'research'], monsters: ['animal_behavior', 'track_read'], situation: ['tactics_small', 'read_people', 'morale_keep'] }[topic] || [];
      const grantProgress = (skills, amt) => {
        this.state.codex.encounters = this.state.codex.encounters || {};
        for (const sk of skills) {
          const cur = (this.state.codex.skills || {})[sk];
          if (cur && (cur.level || 0) >= 1) continue; // already know it — move on
          this.state.codex.encounters[sk] = (this.state.codex.encounters[sk] || 0) + amt;
          return sk;
        }
        return null;
      };
      const applyIntelEffect = (intel, mult) => {
        if (intel === 'analytical') {
          // SHARP MINDS ADVANCE UNDERSTANDING. Repeated theorizing with analytical
          // people compounds into real knowledge — joint discovery, mechanically.
          const prog = grantProgress(topicSkill, Math.max(1, Math.round(2 * mult)));
          if (prog) {
            const enc = (this.state.codex.encounters || {})[prog] || 0;
            const k = (this.data.knowledge || []).find(x => x.id === prog);
            if (enc >= 4) {
              if (this.learnSkill(prog, 1, 'theorized')) {
                this.say(`💡 Thinking it through together with ${first}, something clicks into place.`);
              }
            } else if (k && mult >= 1) {
              this.say(`(Piecing it together with ${first}... ${k.name}: ${enc}/4)`);
            }
          }
        } else if (intel === 'practical') {
          // Practical minds give actionable advice. Talking shop builds trust —
          // they respect people who ask about the work, not the wonder.
          const t = v.trust || (v.trust = {});
          t[vid] = Math.min(100, (t[vid] || 10) + Math.max(1, Math.round(2 * mult)));
          if (topic === 'situation') {
            const prog = grantProgress(['tactics_small', 'snare_wire', 'shelter_debris'], Math.max(1, Math.round(1 * mult)));
            if (prog && mult >= 1) this.say(`(${first}'s advice sticks with you. Practical knowledge accumulates.)`);
          }
        } else if (intel === 'social') {
          // Social minds read the village. Theorizing with them surfaces real intel
          // about people — a goal learned, a tension named.
          const roster = (v.roster || []).filter(id => id !== vid && id !== this.villagerId);
          v.goalsKnown = v.goalsKnown || {};
          const unknown = roster.filter(id => !v.goalsKnown[id]);
          if (unknown.length && Math.random() < 0.6 * mult + 0.2) {
            const target = unknown[Math.floor(Math.random() * unknown.length)];
            const goal = this.npcGoal(target);
            const goalDef = (cg.goals || []).find(g => g.id === goal);
            v.goalsKnown[target] = goal;
            this.remember(target, 'shared_goal', goal || 'unknown');
            this.say(`(You learned what ${this.displayName(target)} wants: ${(goalDef && goalDef.name) || goal}. — via ${first}'s read of people.)`);
          } else if (mult >= 1) {
            this.say(`(${first} reads the room like a book. You see the village a little clearer.)`);
          }
        } else if (intel === 'observant') {
          // Observant minds notice the world. Theorizing sharpens YOUR eyes too.
          const prog = grantProgress(topic === 'monsters' ? ['track_read', 'animal_behavior'] : ['weather_read', 'track_read'], Math.max(1, Math.round(2 * mult)));
          if (prog && mult >= 1) {
            const k = (this.data.knowledge || []).find(x => x.id === prog);
            if (k) this.say(`(${first} points out details you'd walked past blind. ${k.name}: ${(this.state.codex.encounters || {})[prog] || 0}/4)`);
          }
        } else if (intel === 'creative') {
          // Creative minds: sometimes brilliant, always interesting. Morale is real.
          if (Math.random() < 0.3 * mult + 0.1) {
            v.cheer = Math.max(v.cheer || 0, mult >= 1 ? 2 : 1);
            const prog = grantProgress(['morale_keep', 'ritual_meaning'], 1);
            if (mult >= 1) this.say(`(It's a wild idea. But the village is smiling — and ${prog ? 'something in it might actually work.' : 'sometimes that\'s enough.'})`);
          } else if (mult >= 1) {
            v.cheer = Math.max(v.cheer || 0, 1);
            this.say(`(Nobody's sure that would work. Everybody needed the laugh.)`);
          }
        } else {
          // Steady minds: grounding. Fear shrinks when someone calm is thinking with you.
          const s = this.state.scholar;
          const gain = Math.max(2, Math.round(8 * mult));
          s.energy = Math.min(100, (s.energy || 50) + gain);
          try {
            const n = this.npcNeeds(vid);
            n.fear = Math.max(0, (n.fear || 0) - Math.max(3, Math.round(10 * mult)));
          } catch (e) {}
          if (mult >= 1) this.say(`(Steady company. Your shoulders drop an inch. +${gain} energy.)`);
        }
      };
      applyIntelEffect(primary, 1);
      if (secondary !== primary) applyIntelEffect(secondary, 0.5);
      // THEY ask YOU back — joint discovery goes both ways.
      if (Math.random() < 0.5) {
        const asks = cg.theorizeAsks || [];
        if (asks.length) this.say(`${first}: ${asks[Math.floor(Math.random() * asks.length)]}`);
      }
      return line;
    },
    // expireTalkRequests: an unanswered "can we talk?" doesn't wait forever.
    // Villagers are people, not popups — after ~3 days the moment passes and
    // they let it go. Delivered records are one-shot memory and get pruned
    // too, so the Talk badge never pings about ancient history ("Day one..."
    // on day 10). Requests without a day stamp (old saves) are kept.
    expireTalkRequests() {
      const v = this.state.village;
      const reqs = v.talkRequests;
      if (!reqs) return;
      const day = (this.state.scholar || {}).day || 1;
      for (const rid of Object.keys(reqs)) {
        const t = reqs[rid] || {};
        const age = day - (t.day == null ? day : t.day);
        if (!t.delivered && age > 2) delete reqs[rid];
        else if (t.delivered && age > 3) delete reqs[rid];
      }
    },
    // villagerInitiative: they come to YOU. wants with legs.
    // one initiative per day part max — they're people, not popups.
    villagerInitiative() {
      const v = this.state.village;
      // LIVING WORLD: initiative works on any node — NPCs come to you wherever
      // you are, if they're on your node. Not just Haven anymore.
      if (!v.positions) return;
      const here = this.npcsOnNode();
      if (!here.length) return;
      const partKey = this.state.scholar.day + ':' + this.dayPart;
      if (v.lastInitPart === partKey) return;
      const px = this.state.scholar.mx ?? 4, py = this.state.scholar.my ?? 4;
      const order = here.filter(rid => v.positions[rid]);
      // shuffle so the same loud NPC doesn't always win
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[order[i], order[j]] = [order[j], order[i]]; }
      for (const rid of order) {
        // ENGAGEMENT: already in conversation — don't initiate, don't step.
        if (this.isEngaged(rid)) continue;
        const pos = v.positions[rid];
        const d = Math.max(Math.abs(pos.mx - px), Math.abs(pos.my - py));
        if (d > 5) continue;
        const n = this.npcNeeds(rid);
        const mood = this.npcMood(rid);
        const first = this.displayName(rid);
        const temp = this.npcTemper(rid);
        const stepToward = () => {
          const dx = Math.sign(px - pos.mx), dy = Math.sign(py - pos.my);
          const nx = pos.mx + dx, ny = pos.my + dy;
          if (nx >= 0 && nx <= 8 && ny >= 0 && ny <= 8) {
            const detail = this.genDetail(this.map.px, this.map.py);
            const cell = detail[ny] && detail[ny][nx];
            if (cell && !this.cellProps(cell).blocks) { pos.mx = nx; pos.my = ny; }
          }
        };
        // NPC-initiated contact: they're talking to YOU. Mark engaged so the
        // batch turn doesn't wander them off mid-conversation.
        const done = () => { v.lastInitPart = partKey; this.setEngaged(rid, 2); };
        if (n.hunger > 70 && (v.requests || {})[rid] === undefined && Math.random() < 0.3) {
          stepToward(); done();
          v.requests = v.requests || {}; v.requests[rid] = { type: 'food', day: this.state.scholar.day, part: this.dayPart };
          // NO SHARED LANGUAGE: they don't ask in English. They mime hunger
          // in their own tongue — belly rubbed, eyes on your pack.
          if (this.commLevel(rid).level === 'none') {
            const ph = this.foreignLine(rid, 'need_food');
            const r = ph ? this.renderForeign(rid, ph) : null;
            this.say(`${first} sidles up, rubbing their belly, eyes fixed on your pack.${r ? ' ' + r.text : ''}`);
            return;
          }
          const lines = [
            `${first} sidles up. "Got anything to eat? The pot's been thin and my stomach's filing complaints."`,
            `${first} hovers near you. "I hate asking. I'm asking anyway — anything to spare?"`,
            `"Don't suppose you've got food," ${first} says, trying for casual and missing.`,
          ];
          this.say(lines[Math.floor(Math.random() * lines.length)]);
          return;
        }
        if (n.fear > 70 && Math.random() < 0.3) {
          stepToward(); done();
          // NO SHARED LANGUAGE: fear needs no translation — but the words
          // are theirs, not yours.
          if (this.commLevel(rid).level === 'none') {
            const ph = this.foreignLine(rid, 'need_danger');
            const r = ph ? this.renderForeign(rid, ph) : null;
            this.say(`${first} presses close, glancing at the treeline, talking fast.${r ? ' ' + r.text : ''}`);
            return;
          }
          const lines = [
            `${first} sticks close to the fire. "Can I... just stay here a while? The dark's been loud today."`,
            `${first} won't go far from the group. "Something's out there. I can feel it looking."`,
            `${first} keeps glancing at the treeline. "Tell me you heard that too."`,
          ];
          this.say(lines[Math.floor(Math.random() * lines.length)]);
          return;
        }
        if (n.social > 78 && Math.random() < 0.22) {
          stepToward(); done();
          n.social = Math.max(0, n.social - 45);
          const others = order.filter(o => o !== rid);
          const otherId = others.length ? others[Math.floor(Math.random() * others.length)] : null;
          // The speaker knows the other's name — villagers know each other.
          // YOU might not. That's the gap the overheard line closes.
          const otherSaid = otherId ? this.npcName(otherId) : 'someone';
          const lines = [
            `${first} wanders over, just to talk. "You hear what ${otherSaid} said about the creek? ...Never mind. How are you holding up?"`,
            `"Can't sleep," ${first} admits, sitting near you. "Tell me something from before. Anything."`,
            `${first} has opinions about the firewood situation and needs you to hear them.`,
            mood === 'grieving'
              ? `${first} sits near you, quiet a while. "I keep setting out an extra bowl. Stupid."`
              : `${first} wants company more than conversation. That's fine. You're company.`,
          ];
          const picked = lines[Math.floor(Math.random() * lines.length)];
          this.say(picked);
          // OVERHEARD: they mentioned someone by name — that's how names
          // travel. You learn it without ever talking to them.
          if (otherId && !this.state.systemArrived && picked.includes(otherSaid) && otherSaid !== 'someone') this.revealName(otherId, 'overheard');
          // talking helps a little: trust +2, capped the same as talk
          const t = (v.trust || {})[rid] || 10;
          if (v.trust && t < 40) v.trust[rid] = Math.min(40, t + 2);
          return;
        }
        // THEY COME TO YOU: "can we talk?" — they've heard something, want
        // something, or are worried. You're not always the initiator.
        if (Math.random() < 0.16) {
          const reason = this.talkReason(rid);
          if (reason) {
            stepToward(); done();
            v.talkRequests = v.talkRequests || {};
            v.talkRequests[rid] = { line: reason.line, day: this.state.scholar.day };
            this.say(this.renderTalkLine(reason.line, rid) + ` (Talk to ${this.displayName(rid)}.)`);
            // ATTENTION CUE (Steve 2026-10-05): they came to YOU — chime so
            // the player actually notices. The quiet dot wasn't enough.
            this.audioEvent('talkAttention');
            return;
          }
        }
        if (mood === 'grateful' && Math.random() < 0.15) {
          stepToward(); done();
          // gratitude with hands: shares something useful
          const acts = [];
          const untaught = (v.taught[rid] || []).filter(pid => !(this.state.codex.plants || {})[pid]);
          if (untaught.length) acts.push('teach');
          acts.push('encourage', 'chore');
          const act = acts[Math.floor(Math.random() * acts.length)];
          if (act === 'teach') {
            const pid = untaught[0];
            const plant = (this.data.plants || []).find(p => p.id === pid);
            this.say(`${first} presses something into your hand. "${plant ? plant.name : 'This'} — for what you did. Look for the ${plant ? (plant.leaf || 'leaves') : 'sign'}. You'll know it."`);
            this.identifyPlant(pid, first);
          } else if (act === 'encourage') {
            this.state.scholar.energy = Math.min(100, (this.state.scholar.energy || 0) + 15);
            this.say(`${first} claps your shoulder. "You're doing better than you think." (+15 energy — morale is real.)`);
          } else {
            this.stockPantry(150, 'Foraged food');
            this.say(`${first} quietly adds to the pantry without being asked. "For later. All of us." (+150 kcal)`);
          }
          // gratitude spent, not forgotten
          return;
        }
      }
    },
    // ambientSocial: the village talks when you're not the topic.
    // personality-driven beats between NPCs. called from villageLives.
    ambientSocial() {
      const v = this.state.village;
      if (!v.roster || Math.random() > 0.7) return;
      const npcs = v.roster.filter(rid => rid !== this.villagerId);
      if (npcs.length < 2) return;
      const pick = () => npcs[Math.floor(Math.random() * npcs.length)];
      const a = pick(); let b = pick(); let guard = 0;
      while (b === a && guard++ < 10) b = pick();
      const fa = this.displayName(a), fb = this.displayName(b);
      const ta = this.npcTemper(a), tb = this.npcTemper(b);
      const grief = (v.grief || 0) > 0, cheer = (v.cheer || 0) > 0;
      let line;
      const r = Math.random();
      if (grief) {
        line = [
          'The fire is quiet tonight. Nobody\'s talking much.',
          `${fa} set out an extra bowl before catching themself. Nobody mentioned it.`,
          `Someone is crying, quietly, in one of the bunks. ${fb} goes to sit with them.`,
        ][Math.floor(Math.random() * 3)];
      } else if (r < 0.2 && (ta === 'bold' || tb === 'bold')) {
        line = `${fa} and ${fb} are arguing about the watch rotation. Again. It's almost comforting.`;
      } else if (r < 0.35) {
        line = [
          `Someone told a joke by the fire. You hear ${fa} laugh — a real one.`,
          `${fb} is humming something. It stops when they notice you listening.`,
          `${fa} is showing ${fb} how to tie a snare. Hands patient. It takes three tries.`,
          `${fa} and ${fb} are comparing scars like trading cards.`,
        ][Math.floor(Math.random() * 4)];
      } else if (r < 0.5 && cheer) {
        line = `${fa} got the fire going big tonight. There's almost a party feeling. Almost.`;
      } else if (r < 0.6) {
        // practical: someone does something useful, visibly
        this.stockPantry(100, 'Foraged food');
        line = `${fa} came back with an armful of something edible, unprompted. (+100 kcal pantry)`;
      } else {
        line = [
          `${fa} is staring into the fire like it owes them answers.`,
          `${fb} paces the hall, restless, then sits. Then paces.`,
          `Quiet mending sounds from the bunks — ${fa} fixing something.`,
        ][Math.floor(Math.random() * 3)];
      }
      this.say(line);
    },

    // firesideTeaching: knowledge moves human-to-human, BEFORE the System.
    // Villagers teach each other what they've learned. The player can learn by listening.
    // This is the Journal era — informal, spoken, real. The System doesn't create
    // the Codex later; it FORMALIZES what the group already knows.
    firesideTeaching() {
      const v = this.state.village;
      if (!v.roster || Math.random() > 0.35) return; // not every part
      const shared = v.sharedKnowledge || {};
      const taught = Object.keys(shared).filter(pid => !shared[pid].taughtAround);
      if (!taught.length) return;
      // someone shares what they learned, by the fire, in words
      const pid = taught[Math.floor(Math.random() * taught.length)];
      const entry = shared[pid];
      const teacher = this.displayName(entry.discoveredBy);
      const p = (this.data.plants || []).find(x => x.id === pid);
      if (!p) return;
      const pname = this.plantKnown(pid) ? p.name : (p.description || 'a plant');
      // mark it shared — the village knows now, human-to-human
      entry.taughtAround = true;
      entry.taughtDay = this.state.scholar.day;
      // EVERYONE at the fire learns it. Fireside knowledge is village knowledge —
      // this is the slow background growth that saves the village: even without
      // the player, the village gets smarter (slowly) about its land.
      try {
        for (const rid of (this.state.village.roster || [])) this.villagerLearnsPlant(rid, pid, 'fireside');
      } catch (e) {}
      const journalWord = this.state.systemArrived ? 'Codex' : 'journal';
      const lines = [
        `${teacher} is showing everyone ${pname} by the fire. "See the leaves? Like that. Don't mix it up." The ${journalWord} grows — the human way.`,
        `Fireside lesson: ${teacher} passes around ${pname}. Someone asks a dumb question. Nobody minds. That's how you learn.`,
        `${teacher} drew ${pname} in the dirt for the others. It'll wash away. The knowledge won't.`,
      ];
      this.say(lines[Math.floor(Math.random() * lines.length)]);
      // YOU can learn by being there. If you don't know it yet, this is your chance.
      if (!this.plantKnown(pid) && Math.random() < 0.6) {
        this.identifyPlant(pid, 'fireside');
        this.say(`You were listening. Now you know ${p.name} too.`);
      }
      // knowledge combination: if someone else knows MORE about this plant,
      // the fireside conversation unlocks deeper levels. Overlap computes depth.
      this.combineKnowledge(pid);
    },

    // isKnowledgeTrader: some people trade in knowledge. They know things deeply
    // and they'll share — for food, favors, or knowledge in return.
    // "I'll tell you what's safe to eat in the north field, if you tell me
    //  what you found by the creek."
    isKnowledgeTrader(vid) {
      const vp = (this.data.villagers || []).find(x => x.id === vid)
        || (this.data.background_survivors || []).find(x => x.id === vid) || {};
      const occ = (vp.formerOccupation || '').toLowerCase();
      // natural traders: people whose old life was about knowing things
      if (['librarian', 'teacher', 'professor', 'botanist', 'herbalist', 'scout', 'tracker',
           'journalist', 'researcher', 'scholar', 'guide'].some(w => occ.includes(w))) return true;
      // explicit flag
      if (vp.trader) return true;
      return false;
    },

    // what does this trader know that you don't? Returns plant IDs they can teach.
    traderKnowledge(vid) {
      const vp = (this.data.villagers || []).find(x => x.id === vid)
        || (this.data.background_survivors || []).find(x => x.id === vid) || {};
      // traders know 2-3 plants deeply. Generate deterministically from their ID.
      const plants = this.data.plants || [];
      if (!plants.length) return [];
      let h = 0;
      for (const c of vid) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      const known = [];
      const n = 2 + (h % 2); // 2-3 plants
      for (let i = 0; i < n; i++) {
        const p = plants[(h + i * 7) % plants.length];
        if (p && !known.includes(p.id)) known.push(p.id);
      }
      // filter to things YOU don't know yet (or know shallowly)
      return known.filter(pid => {
        const e = (this.state.codex.plants || {})[pid];
        return !e || (e.level || 1) < 3; // they know deeper than you
      });
    },

    // tradeKnowledge: the deal. Food, favor, or knowledge for knowledge.
    tradeKnowledge(vid, pid) {
      const vp = (this.data.villagers || []).find(x => x.id === vid)
        || (this.data.background_survivors || []).find(x => x.id === vid) || {};
      const first = this.displayName(vid);
      const p = (this.data.plants || []).find(x => x.id === pid);
      if (!p) return null;
      const trust = (this.state.village.trust || {})[vid] || 10;
      // price: food, or knowledge in return, or just trust
      const price = trust >= 60 ? 'trust' : (trust >= 30 ? 'food' : 'knowledge');
      if (price === 'food') {
        const cost = 300;
        if ((this.state.scholar.kcal || 0) < cost) {
          this.say(`${first} wants ${cost} kcal of food for the secret of ${p.name}. You don't have it.`);
          return null;
        }
        this.state.scholar.kcal -= cost;
        this.say(`${first} takes your food, nods. "Okay. ${p.name}. Here's what I know..."`);
      } else if (price === 'knowledge') {
        // they want something YOU know that they don't
        const yourPlants = Object.keys(this.state.codex.plants || {});
        const theirKnown = this.traderKnowledge(vid); // what they'd teach
        // find something you know that isn't in their teach pool
        const trade = yourPlants.find(yPid => !theirKnown.includes(yPid) && yPid !== pid);
        if (!trade) {
          this.say(`${first} wants knowledge in trade, but you have nothing they don't already know. (Learn more plants first.)`);
          return null;
        }
        const tp = (this.data.plants || []).find(x => x.id === trade);
        this.say(`Trade: you teach ${first} about ${tp ? tp.name : trade}. They teach you about ${p.name}. Knowledge for knowledge.`);
      } else {
        this.say(`${first} trusts you. "Come here. Let me tell you about ${p.name}..." (High trust — free.)`);
      }
      // the teaching: they know it DEEP. You get L2 immediately, L3 if you had L1.
      const cur = (this.state.codex.plants || {})[pid];
      const curLevel = cur ? (cur.level || 1) : 0;
      const newLevel = curLevel >= 1 ? 3 : 2;
      if (!cur) {
        this.identifyPlant(pid, 'traded');
      }
      this.state.codex.plants[pid] = this.state.codex.plants[pid] || {};
      this.state.codex.plants[pid].level = Math.max(this.state.codex.plants[pid].level || 1, newLevel);
      this.state.codex.plants[pid].viaTrade = vid;
      this.say(`📚 TRADED KNOWLEDGE: ${p.name} — Level ${newLevel}. ${first} knew it deep. ${p.knowledgeLevels[String(newLevel)] || ''}`);
      this.bumpTrust(vid, 3);
      // combination: their depth + your experience might unlock more
      this.combineKnowledge(pid);
      this.discover('trade');
      return null;
    },

    // combineKnowledge: when multiple people know different things about the same
    // plant, the OVERLAP computes deeper knowledge.
    // "You know it's safe. She knows the roots are the best part.
    //  Together, you figure out how to prepare it."
    combineKnowledge(pid) {
      const p = (this.data.plants || []).find(x => x.id === pid);
      if (!p) return false;
      const mine = (this.state.codex.plants || {})[pid];
      if (!mine) return false; // you need at least L1 to combine
      const myLevel = mine.level || 1;
      if (myLevel >= 4) return false; // already mastered
      // gather what others know: village shared + traders + other villages
      let deepestOther = 0;
      const sources = [];
      const v = this.state.village;
      // village shared knowledge
      const shared = (v.sharedKnowledge || {})[pid];
      if (shared && shared.level) {
        deepestOther = Math.max(deepestOther, shared.level);
        sources.push('the village');
      }
      // check traders in roster
      for (const rid of (v.roster || [])) {
        if (rid === this.villagerId) continue;
        if (this.isKnowledgeTrader(rid)) {
          // traders know everything they teach at L3
          const tk = this.traderKnowledge(rid);
          // if this plant was in their pool, they know it deep
          // (we check the full pool, not just what they'd teach you now)
          deepestOther = Math.max(deepestOther, 2);
          if (!sources.includes('a trader')) sources.push('a trader');
        }
      }
      // other villages you've learned from
      for (const ov of (this.state.otherVillages || [])) {
        const oe = (ov.codex && ov.codex.plants || {})[pid];
        if (oe && oe.level > deepestOther) {
          deepestOther = oe.level;
          sources.push(ov.name);
        }
      }
      // combination: if others know deeper, and you have experience (harvests),
      // the overlap unlocks the next level
      const harvests = mine.harvests || 0;
      if (deepestOther > myLevel && harvests >= 3) {
        const newLevel = Math.min(4, deepestOther);
        mine.level = newLevel;
        mine.combinedFrom = sources;
        this.say(`💡 KNOWLEDGE COMBINES: ${p.name} — Level ${newLevel}. You knew it was safe. ${sources.join(' and ')} knew the rest. Together, it's deeper. ${p.knowledgeLevels[String(newLevel)] || ''}`);
        // JACKPOT: combining knowledge can trigger sudden insight.
        // "Everything you've learned suddenly connects."
        if (Math.random() < 0.15) {
          this.jackpot('insight');
        }
        return true;
      } else if (deepestOther > myLevel && harvests < 3) {
        // hint: you're close, but need more hands-on experience
        this.say(`💡 ${p.name}: ${sources.join(' and ')} know${sources.length > 1 ? '' : 's'} more than you do. Harvest it a few more times (${harvests}/3) and it'll click.`);
      }
      return false;
    },

    // ============ KNOWLEDGE TAXONOMY: knowledge about ANYTHING ============
    // Not just plants. Water purification, tracking, wound care, calming panic,
    // star navigation, tactics, reading people. The Codex has MANY flavors.
    // Domains: survival, nature, medical, crafting, social, combat,
    //          psychological, spiritual, navigation.

    // skillKnown: do you know this skill at this level?
    skillKnown(skillId, minLevel) {
      const e = (this.state.codex.skills || {})[skillId];
      return !!(e && (e.level || 0) >= (minLevel || 1));
    },

    // learnSkill: gain knowledge. One path, every source. Like identifyPlant for skills.
    learnSkill(skillId, level, via) {
      const k = (this.data.knowledge || []).find(x => x.id === skillId);
      if (!k) return false;
      this.state.codex.skills = this.state.codex.skills || {};
      const cur = this.state.codex.skills[skillId];
      const curLevel = cur ? (cur.level || 0) : 0;
      const newLevel = Math.max(curLevel, level || 1);
      if (newLevel <= curLevel && cur) return false; // no downgrade, no repeat
      this.state.codex.skills[skillId] = {
        level: newLevel,
        learnedDay: this.state.scholar.day,
        via: via || 'discovery',
      };
      const journalWord = this.state.systemArrived ? 'Codex' : 'Journal';
      this.say(`📖 LEARNED: ${k.name} (Level ${newLevel}). ${k.levels[String(newLevel)] || ''}`);
      // knowledge-ability synergy check: does this unlock a technique?
      this.checkKnowledgeAbilitySynergy(skillId, newLevel);
      return true;
    },

    // NIGHT HUNTING PRACTICE (Steve): the dark is a teacher. Night stalks and
    // strikes earn night_hunting — L1 at 3, L2 at 8, L3 at 16. Background
    // hunters start at L1 (flavor); the mechanical tiers are earned in the
    // field, never given. Follows the read_people practice pattern.
    nightHuntPractice() {
      const s = this.state.scholar;
      s.nightHuntXP = (s.nightHuntXP || 0) + 1;
      const xp = s.nightHuntXP;
      if (xp >= 16 && !this.skillKnown('night_hunting', 3)) this.learnSkill('night_hunting', 3, 'hunting by dark');
      else if (xp >= 8 && !this.skillKnown('night_hunting', 2)) this.learnSkill('night_hunting', 2, 'hunting by dark');
      else if (xp >= 3 && !this.skillKnown('night_hunting', 1)) this.learnSkill('night_hunting', 1, 'hunting by dark');
      return xp;
    },

    // backgroundKnowledge: your occupation IS knowledge. Not flavor — mechanical.
    // An electrician knows circuits. A nurse knows wound care. Day 1, real Codex entries.
    grantBackgroundKnowledge(villager) {
      const occ = (villager.formerOccupation || '').toLowerCase();
      const knowledge = this.data.knowledge || [];
      let granted = 0;
      for (const k of knowledge) {
        const bgs = (k.backgrounds || []).map(b => b.toLowerCase());
        if (bgs.some(bg => occ.includes(bg))) {
          // background grants L1, or L2 for core occupational skills
          const isCore = bgs.some(bg => occ === bg || occ.startsWith(bg));
          const level = isCore ? 2 : 1;
          if (this.learnSkill(k.id, level, 'background')) granted++;
        }
      }
      return granted;
    },

    // jackpot: rare, huge knowledge gains. Books, strangers, insight moments.
    // "Occasionally you hit a vein." This should feel EXCITING, not routine.
    jackpot(type, source) {
      const knowledge = this.data.knowledge || [];
      const journalWord = this.state.systemArrived ? 'Codex' : 'Journal';
      if (type === 'book') {
        // books now unlock SKILLS too, not just plants
        // (existing readBook handles plants; this extends it)
        return this.jackpotBook(source);
      } else if (type === 'stranger') {
        // a knowledgeable stranger: rare encounter, teaches 2-3 skills deeply
        const unlearned = knowledge.filter(k =>
          !this.skillKnown(k.id) && k.rarity !== 'legendary'
        );
        if (!unlearned.length) return false;
        // weight by rarity: common more likely
        const weights = { common: 3, uncommon: 2, rare: 1 };
        const pool = [];
        for (const k of unlearned) {
          const w = weights[k.rarity] || 1;
          for (let i = 0; i < w; i++) pool.push(k);
        }
        const n = 2 + Math.floor(Math.random() * 2); // 2-3 skills
        const taught = [];
        const pickedIds = new Set();
        let attempts = 0;
        while (taught.length < n && pool.length && attempts < 20) {
          attempts++;
          const k = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
          if (pickedIds.has(k.id)) continue; // no duplicates
          pickedIds.add(k.id);
          const level = k.rarity === 'rare' ? 1 : 2;
          if (this.learnSkill(k.id, level, 'stranger')) taught.push(k.name);
        }
        if (taught.length) {
          this.say(`🌟 JACKPOT: A stranger by the road knows things. They talk for an hour. You learn: ${taught.join(', ')}. Your ${journalWord} overflows.`);
          return true;
        }
      } else if (type === 'insight') {
        // sudden realization: combining what you know into something new
        // requires: 3+ skills at L2+, or 5+ plants at L2+
        const skills = Object.entries(this.state.codex.skills || {}).filter(([id, e]) => (e.level || 0) >= 2);
        const plants = Object.entries(this.state.codex.plants || {}).filter(([id, e]) => (e.level || 0) >= 2);
        if (skills.length + plants.length < 5) return false;
        // insight grants a random rare skill
        const rares = knowledge.filter(k => k.rarity === 'rare' && !this.skillKnown(k.id));
        if (!rares.length) return false;
        const k = rares[Math.floor(Math.random() * rares.length)];
        this.say(`💡 INSIGHT: It clicks. Everything you've learned suddenly connects. You understand ${k.name} now — really understand it.`);
        return this.learnSkill(k.id, 2, 'insight');
      }
      return false;
    },

    jackpotBook(book) {
      // extended book reading: books can unlock skills too
      const unlocks = book.unlocks || {};
      let learned = 0;
      for (const sid of (unlocks.skills || [])) {
        const level = unlocks.skillLevel || 1;
        if (this.learnSkill(sid, level, 'book')) learned++;
      }
      // legendary books unlock legendary skills
      for (const sid of (unlocks.legendarySkills || [])) {
        if (this.learnSkill(sid, 1, 'legendary book')) {
          this.say(`🌟 LEGENDARY KNOWLEDGE: This book contains secrets almost no one knows.`);
          learned++;
        }
      }
      return learned > 0;
    },

    // checkKnowledgeAbilitySynergy: deep knowledge + related ability = new technique.
    // "Know about water pressure + have water manipulation = Pressure Jet."
    // Knowledge AMPLIFIES powers. They're not separate systems.
    checkKnowledgeAbilitySynergy(skillId, level) {
      const k = (this.data.knowledge || []).find(x => x.id === skillId);
      if (!k || !k.abilitySynergies) return;
      for (const syn of k.abilitySynergies) {
        if (level < (syn.minLevel || 1)) continue;
        if (!this.hasAbility(syn.ability)) continue;
        // check if already unlocked
        this.state.codex.techniques = this.state.codex.techniques || {};
        const techId = `${skillId}_${syn.ability}`;
        if (this.state.codex.techniques[techId]) continue;
        this.state.codex.techniques[techId] = {
          skill: skillId, ability: syn.ability,
          name: syn.technique, effect: syn.effect,
          unlockedDay: this.state.scholar.day,
        };
        this.say(`⚡ TECHNIQUE UNLOCKED: ${syn.technique}! ${syn.effect} (Your knowledge of ${k.name} amplifies your ${syn.ability}.)`);
        if (this.state.systemArrived) {
          this.sysSay(`"OH! OH! ${syn.technique.toUpperCase()}! The audience did NOT see that coming! Knowledge AMPLIFIES power! The gamblers are recalculating EVERYTHING!"`);
        }
      }
    },

    // techniques: list your unlocked knowledge-ability techniques
    techniqueList() {
      return Object.values(this.state.codex.techniques || {});
    },

    // villagers wander (turn-based). they go about their day.
    // they don't block you. they're just living.
    // ============ NPC TIME ECONOMY ============
    // NPCs move at their own speed — a real stat, relative to you (1.0).
    // Young and bold are fast. Old and cautious are slow.
    // Visible in batch turns: faster NPCs cover more ground.
    npcSpeed(vid) {
      const v = (this.data.villagers || []).find(x => x.id === vid)
        || (this.data.background_survivors || []).find(x => x.id === vid) || {};
      let s = 1.0;
      const age = v.age || 35;
      if (age < 30) s += 0.2;
      else if (age > 55) s -= 0.25;
      else if (age > 45) s -= 0.1;
      const temp = (v.personality && v.personality.temperament) || this.npcTemper(vid);
      if (temp === 'bold' || temp === 'intense') s += 0.15;
      if (temp === 'cautious' || temp === 'withdrawn') s -= 0.15;
      return Math.max(0.5, Math.min(1.5, Math.round(s * 20) / 20));
    },

    // tickAction: THE unified action clock. Every thing you do costs time.
    // Cost guide (ticks): 1 = step, glance, sip, bite, handoff, opening a
    // conversation, one deep conversational beat. 2 = a substantive social
    // move (comfort, mediate, deal). 3 = a lesson (teaching). 32 (1 chunk) =
    // clear brush, boil water, travel a node, forage (64 on rich tiles).
    // 64-96 (2-3 chunks) = fell a tree, build. 128 = a full day-part of
    // sustained work (rest, wait out the part). Small talk inside a
    // conversation is free — you're already spending the time standing there.
    // Every TICKS_PER_BATCH ticks → NPCs take a batch turn (they act).
    // Every TICKS_PER_PART ticks → the day-part turns (needs, assignments, energy).
    // TICKS_PER_DAY ticks → the day is spent → endDay().
    // Turn-based combat has its own strict turns and suppresses this clock.
    tickAction(n, opts) {
      if (this.tbfight || this._ticking) return undefined;
      const s = this.state.scholar;
      n = Math.max(0, Math.round(n || 1));
      if (!n) return undefined;
      // save migration: moveClock → actionClock
      if (s.actionClock === undefined) { s.actionClock = s.moveClock || 0; delete s.moveClock; }
      s.actionClock = (s.actionClock || 0) + n;
      s.dayTicks = (s.dayTicks || 0) + n;
      this._ticking = true;
      let transitioned = false;
      try {
        const T = this.TIME;
        // NPC batch turns: the world acts while you act.
        let guard = 0;
        while (s.actionClock >= T.TICKS_PER_BATCH && guard++ < 64) {
          s.actionClock -= T.TICKS_PER_BATCH;
          this.npcBatchTurn();
          transitioned = true;
        }
        // Day-part boundaries derive from the same clock.
        const dayBefore = s.day;
        guard = 0;
        while (Math.floor(s.dayTicks / T.TICKS_PER_PART) > this.dayPart && this.dayPart < 4 && s.day === dayBefore && guard++ < 8) {
          this.advancePart();
          transitioned = true;
        }
        // The day has a fixed budget. When it's used, the day advances.
        if ((!opts || !opts.noDayEnd) && s.dayTicks >= T.TICKS_PER_DAY && !this.over && s.day === dayBefore) {
          s.dayTicks = 0; s.actionClock = 0;
          this.say('The light is going. The day is spent — every small thing you did added up.');
          this.endDay();
          transitioned = true;
        }
        // HUNGER LESSON (Steve): week one must teach hunger honestly. When the
        // bar crosses thresholds the body says so — once per threshold per day,
        // pointing at the fix. The lesson lands before the crisis.
        try {
          const kcal = s.kcal || 0;
          s._hungerNoted = (s._hungerNoted && s._hungerNoted.day === s.day) ? s._hungerNoted : { day: s.day };
          if (kcal < 500 && !s._hungerNoted.starving) {
            s._hungerNoted.starving = true;
            this.say('Your stomach is a fist. Eat — anything real, now.');
          } else if (kcal < 1200 && !s._hungerNoted.hungry) {
            s._hungerNoted.hungry = true;
            this.say('Hunger gnaws. The pack is thin — work the green, haul it back, get it named at camp. That\'s the whole game.');
          }
        } catch (e) {}
        // DAY-7 DEBUG: the System arrives on your first real action, not on
        // the debug jump. The moment should land in the flow of play.
        if (s._day7Armed && !this.state.systemArrived && !this.over) {
          s._day7Armed = false;
          this.checkSystemArrival();
          transitioned = true;
        }
      } finally { this._ticking = false; }
      return transitioned ? this.status() : undefined;
    },

    // npcBatchTurn: the background-life beat. NPCs wander at their own speed,
    // pursue initiative, wants tick. The world isn't frozen while you explore —
    // it's living at its own pace, catching up in batches.
    // setEngaged: mark an NPC as socially engaged (in conversation with you).
    // Engaged NPCs don't wander during batch turns — they're busy talking.
    // Engagement lasts `batches` batch turns, then lapses naturally.
    setEngaged(vid, batches) {
      const v = this.state.village;
      v.engaged = v.engaged || {};
      v.engaged[vid] = Math.max(v.engaged[vid] || 0, batches || 2);
    },
    isEngaged(vid) {
      const v = this.state.village;
      return v.engaged && (v.engaged[vid] || 0) > 0;
    },
    // socialTick: every substantive social move costs 2 ticks (a real conversation).
    // Marks the NPC engaged so batch turns don't wander them off mid-talk.
    socialTick(vid) {
      this.tickAction(2);
      if (vid) this.setEngaged(vid, 2);
    },
    // ============ DAY/NIGHT: continuous time ============
    // The dial, the dark, and the creatures all read these.
    // dayProgress: 0 = dawn's first light, 0.25 = midday, 0.5 = dusk,
    // 0.75 = deep night, 1 = next dawn. Micro ticks move it smoothly.
    dayProgress() {
      const s = this.state.scholar;
      const T = this.TIME.TICKS_PER_DAY;
      return Math.max(0, Math.min(1, (s.dayTicks || 0) / T));
    },
    // lightLevel: 0..1, smooth. Dawn ramps up, midday is full, dusk falls,
    // night is moonlight (not pitch black — you can still move, carefully).
    lightLevel() {
      const p = this.dayProgress();
      if (p < 0.25) return 0.25 + 0.75 * (p / 0.25);       // dawn: kindling
      if (p < 0.5) return 1;                               // midday: full
      if (p < 0.75) return 1 - 0.82 * ((p - 0.5) / 0.25);  // dusk: dying
      return 0.15;                                         // night: moonlight
    },
    isNight() { return this.dayPart === 3; },
    // NIGHT ECOLOGY: the cast changes after dark. Weighted, not gated —
    // nothing vanishes entirely, but the night belongs to nocturnal things.
    creatureWeight(def) {
      const act = def.activity || 'both';
      if (act === 'both') return 1;
      const part = this.dayPart; // 0 dawn, 1 midday, 2 dusk, 3 night
      if (part === 3) return act === 'nocturnal' ? 3 : act === 'crepuscular' ? 1 : 0.25;
      if (part === 0 || part === 2) return act === 'crepuscular' ? 3 : act === 'nocturnal' ? 0.5 : 1;
      return act === 'diurnal' ? 3 : act === 'nocturnal' ? 0.15 : 1;
    },
    // MONSTER WAVES: which monsters can spawn right now.
    // Wave 1: calibration fauna — the System's first draft, always present.
    // Wave 2: advanced fauna — deployed at System arrival (day 7).
    // Wave 3: reserved for deep integration (80+) — the System's final draft.
    // Earlier waves never leave the pool; the ecosystem only gets richer.
    monsterWavePool() {
      const all = this.data.monsters || [];
      const s = this.state.scholar || {};
      const arrived = !!this.state.systemArrived;
      const deep = (s.integration || 0) >= 80;
      return all.filter(m => {
        const w = m.wave || 1;
        if (w <= 1) return true;
        if (w === 2) return arrived;
        if (w >= 3) return arrived && deep;
        return true;
      });
    },
    pickByActivity(list) {
      if (!list || !list.length) return null;
      const weights = list.map(d => this.creatureWeight(d));
      let r = Math.random() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < list.length; i++) { r -= weights[i]; if (r <= 0) return list[i]; }
      return list[list.length - 1];
    },
    npcBatchTurn() {
      const v = this.state.village;
      if (!v.positions) return;
      // LIVING WORLD: only NPCs on YOUR node have live grid positions.
      // NPCs elsewhere are simulated at node level (npcNodeTravel), not here.
      const px = this.map.px, py = this.map.py;
      const detail = this.genDetail(px, py);
      const night = this.isNight();
      // _sleeping is transient (NOT in save state) — you're unconscious, not interactive.
      const youSleep = !!this._sleeping;
      for (const rid of Object.keys(v.positions)) {
        if (rid === this.villagerId) continue;
        // ENGAGEMENT: people in conversation stay put. They don't wander off mid-talk.
        if (this.isEngaged(rid)) continue;
        const pos = v.positions[rid];
        if (night) {
          // THE VILLAGE SLEEPS. People settle — a small shuffle at most,
          // drifting toward the fire's warmth, then stillness. Nobody roams.
          if (Math.random() < 0.25) {
            const dx = Math.floor(Math.random() * 3) - 1;
            const dy = Math.floor(Math.random() * 3) - 1;
            const nx = Math.max(0, Math.min(8, pos.mx + dx));
            const ny = Math.max(0, Math.min(8, pos.my + dy));
            const cell = detail[ny] && detail[ny][nx];
            if (cell && !this.cellProps(cell).blocks) { pos.mx = nx; pos.my = ny; }
          }
          continue;
        }
        const speed = this.npcSpeed(rid);
        // wander: base squares scaled by relative speed.
        // speed 1.5 -> 12 squares, speed 0.5 -> 4. You can SEE who's fast.
        const steps = Math.max(1, Math.round(this.TIME.NPC_BATCH_WANDER * speed));
        for (let i = 0; i < steps; i++) {
          if (Math.random() > 0.6) continue; // meandering, not marching
          const dx = Math.floor(Math.random() * 3) - 1;
          const dy = Math.floor(Math.random() * 3) - 1;
          const nx = Math.max(0, Math.min(8, pos.mx + dx));
          const ny = Math.max(0, Math.min(8, pos.my + dy));
          const cell = detail[ny] && detail[ny][nx];
          if (cell && !this.cellProps(cell).blocks) { pos.mx = nx; pos.my = ny; }
        }
      }
      // initiative: they come to you, on their schedule.
      // Not at night, and not while you're asleep — even villagers respect sleep.
      // (The rare "can't sleep" visit still happens: it's in villagerInitiative's own odds.)
      if (!night && !youSleep) { try { this.villagerInitiative(); } catch (e) {} }
      // time passed: wants grew a little
      try {
        for (const rid of Object.keys(v.positions)) {
          if (rid === this.villagerId) continue;
          const n = this.npcNeeds(rid);
          n.hunger = Math.min(100, (n.hunger || 0) + 3);
          n.social = Math.min(100, (n.social || 0) + 2);
        }
      } catch (e) {}
      // engagement lapses: one batch of talking done, one batch closer to wandering again
      if (v.engaged) for (const k of Object.keys(v.engaged)) {
        v.engaged[k] = Math.max(0, (v.engaged[k] || 0) - 1);
        if (!v.engaged[k]) delete v.engaged[k];
      }
      // OVERHEARD: NPCs learn from EACH OTHER, not just from you. Two villagers
      // near you discuss something in their intelligence voices — joint discovery
      // you happen to catch. Different minds notice different things.
      try { this.overheardDiscussion(); } catch (e) {}
    },

    // overheardDiscussion: two NPCs near the player talk; you catch a fragment.
    // Day only (nobody chats at 3am), player awake, not in combat. Rare enough
    // to feel like life, not a broadcast.
    overheardDiscussion() {
      const v = this.state.village;
      if (this.isNight() || this._sleeping || this.tbfight) return;
      v.lastOverheard = (v.lastOverheard || 0) + 1;
      if (v.lastOverheard < 3 || Math.random() > 0.45) return; // often enough to feel alive
      v.lastOverheard = 0;
      const near = Object.keys(v.positions || {}).filter(rid =>
        rid !== this.villagerId && !this.isEngaged(rid));
      if (near.length < 2) return;
      const a = near[Math.floor(Math.random() * near.length)];
      let b = near[Math.floor(Math.random() * near.length)];
      if (b === a) b = near[(near.indexOf(a) + 1) % near.length];
      // SOMETIMES THEY TALK ABOUT A THIRD PERSON — and sometimes what they
      // say doesn't match the story. The village polices its own lies.
      // (npcGossipAbout lives in truth.js; guarded in case it's absent.)
      try {
        if (this.npcGossipAbout && Math.random() < 0.30) {
          const others = (v.roster || []).filter(id =>
            id !== a && id !== b && id !== this.villagerId);
          if (others.length) {
            const target = others[Math.floor(Math.random() * others.length)];
            const gg = this.npcGossipAbout(a, target);
            if (gg && gg.line && gg.contradictsLie) {
              this.say(`👂 Overheard — ${this.displayName(a)} (to ${this.displayName(b)}): ${gg.line}`);
              return;
            }
          }
        }
      } catch (e) {}
      const ia = this.npcIntel(a).primary, ib = this.npcIntel(b).primary;
      const oh = (this.data.characterGen || {}).overheard || {};
      const openers = (oh.openers || {})[ia] || [];
      const replies = (oh.replies || {})[ib] || [];
      if (!openers.length || !replies.length) return;
      const op = openers[Math.floor(Math.random() * openers.length)];
      const rp = replies[Math.floor(Math.random() * replies.length)];
      // SOMETIMES THEY PULL YOU IN: the village doesn't just perform around
      // you — sometimes they want you in the conversation.
      const pullIn = Math.random() < 0.18;
      this.say(`👂 Overheard — ${this.displayName(a)}: ${op}`);
      this.say(`👂 Overheard — ${this.displayName(b)}: ${rp}`);
      if (pullIn) {
        const invites = [
          `"Hey — come here. You should hear this."`,
          `"You. Yeah, you. What do you make of this?"`,
          `"Don't just stand there — you've got opinions, right?"`,
        ];
        const who = Math.random() < 0.5 ? a : b;
        this.say(`👂 ${this.displayName(who)} ${invites[Math.floor(Math.random() * invites.length)]}`);
        // they actually want to talk: use the existing talk-request system
        // so the player sees "can we talk?" on their person card.
        try {
          v.talkRequests = v.talkRequests || {};
          v.talkRequests[who] = { line: `__NAME__ wants you to join the conversation.`, day: this.state.scholar.day };
        } catch (e) {}
      }
      // Overhearing sharp minds teaches a little. The village is a classroom
      // you didn't enroll in.
      if ((ia === 'analytical' || ib === 'analytical') && Math.random() < 0.4) {
        const pool = ['read_people', 'animal_behavior', 'weather_read', 'tactics_small'];
        this.state.codex.encounters = this.state.codex.encounters || {};
        for (const sk of pool) {
          const cur = (this.state.codex.skills || {})[sk];
          if (cur && (cur.level || 0) >= 1) continue;
          this.state.codex.encounters[sk] = (this.state.codex.encounters[sk] || 0) + 1;
          this.say(`(Something in their exchange sticks with you. ${sk.replace(/_/g, ' ')} +1)`);
          break;
        }
      }
      // Social need eases a little — the village feels alive around you.
      try {
        const na = this.npcNeeds(a), nb = this.npcNeeds(b);
        na.social = Math.max(0, (na.social || 0) - 10);
        nb.social = Math.max(0, (nb.social || 0) - 10);
      } catch (e) {}
    },

    // ============ SLEEP ============
    // Sleep until morning. Where you sleep matters: bunk > tent > hall floor > cold ground.
    // Hunger still ticks, but slower — a sleeping body burns less. You heal. Energy restores.
    // The world lives through the night around you (NPC batch turns still fire; they sleep too).
    // Danger wakes you: the fast-forward runs in batch-sized chunks and stops on trouble.
    sleepQuality() {
      const s = this.state.scholar;
      let detail = null;
      try { detail = this.genDetail(this.map.px, this.map.py); } catch (e) {}
      const mx = s.mx ?? 4, my = s.my ?? 4;
      const near = (type) => {
        if (!detail) return false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const row = detail[my + dy];
          if (row && row[mx + dx] === type) return true;
        }
        return false;
      };
      let atHaven = this.location === 'haven';
      try { const t = this.playerTile(); if (t && t.type === 'haven') atHaven = true; } catch (e) {}
      if (atHaven && near('bunk')) return 'bunk';
      if (near('tent')) return 'tent';
      if (atHaven) return 'hall';
      // FIRESIDE: a fire you (or the world) lit nearby makes cold ground
      // survivable. Warmth is earned, not given — you built the thing.
      if (this.nearFire()) return 'fireside';
      return 'ground';
    },
    // sleepPreview: for the UI — show cost/benefit before committing.
    sleepPreview() {
      const q = this.sleepQuality();
      // Cold-night warning: telegraph the exposure bite before the player
      // commits. Honest buttons, honest nights.
      let warn = '';
      if (this.state.weather === 'cold') {
        if (q === 'ground') warn = 'Cold snap — sleeping exposed will hurt you. Find shelter or build a fire.';
        else if (q === 'fireside' && !this.fireLastsTillDawn()) warn = 'Cold snap — your fire dies before dawn. Feed it, or pitch a tent.';
      }
      return {
        quality: q,
        heal: { bunk: 35, tent: 25, hall: 20, fireside: 18, ground: 12 }[q] || 12,
        name: { bunk: 'a bunk', tent: 'a tent', hall: 'the hall floor', fireside: 'your fireside', ground: 'the cold ground' }[q] || 'the ground',
        note: { bunk: 'Best rest. Deep sleep, real healing.', tent: 'Sheltered. Decent rest.', hall: 'By the fire. Good enough.', fireside: 'Warm by your own fire. Better than cold ground.', ground: 'Exposed. You\'ll wake stiff.' }[q] || '',
        warn,
      };
    },
    sleep() {
      const s = this.state.scholar;
      const T = this.TIME;
      if (this.tbfight) { this.say('Not in the middle of a fight.'); return this.status(); }
      if (this.dayPart === 0 && (s.dayTicks || 0) < T.TICKS_PER_BATCH) {
        this.say('It\'s barely dawn. The day is yours — sleep is for later.');
        return this.status();
      }
      const prev = this.sleepPreview();
      const startDay = s.day, startKcal = Math.round(s.kcal || 0);
      // NIGHT WEATHER: capture now. endDay rolls the NEW day's weather at
      // midnight mid-sleep — the cold that bites is tonight's, not dawn's.
      const nightWeather = this.state.weather;
      // FIRE PROTECTION: capture now too. A fire fed to last the night burns
      // out BY dawn — checking after the sleep would always say it failed.
      const fireLasts = prev.quality === 'fireside' ? this.fireLastsTillDawn() : true;
      // transient flag (not saved): suppresses NPC initiative while you're out.
      this._sleeping = { quality: prev.quality };
      this.say(`You settle into ${prev.name}. Sleep takes you.`);
      let woke = false, guard = 0;
      while (s.day === startDay && !this.over && guard++ < 64) {
        const remaining = T.TICKS_PER_DAY - (s.dayTicks || 0);
        if (remaining <= 0) break;
        // batch-sized chunks: part transitions, NPC nights, and endDay all fire
        // naturally — and we check for danger between chunks.
        this.tickAction(Math.min(T.TICKS_PER_BATCH, remaining));
        if (this.tbfight || this.pendingEncounter || this.over) { woke = true; break; }
      }
      this._sleeping = null;
      if (woke || this.tbfight || this.pendingEncounter || this.over) {
        if (!this.over) this.say('You wake with a start — something is wrong.');
        return this.status();
      }
      // You slept through to dawn. endDay already ran: meals eaten, metabolism
      // burned, the land regrew. Now the body's accounting.
      const lost = startKcal - Math.round(s.kcal || 0);
      let conservedNote = '';
      if (lost > 0) {
        const conserved = Math.round(lost * 0.3);
        s.kcal = (s.kcal || 0) + conserved;
        conservedNote = ` Your sleeping body burned less — ${conserved} kcal conserved.`;
      }
      // COLD NIGHTS BITE (survivalist loop 2026-10-05): a cold snap is not
      // flavor. Sleep exposed — or by a fire that dies before dawn — and the
      // cold gets in: NO healing, -18 health, a shivering half-rest (energy
      // only to 60). Sheltered sleep (hall/bunk/tent) or a fire fed to last
      // the night protects you. The dawn weather roll telegraphs this.
      // fireLasts and nightWeather were captured at sleep start — the fire
      // did its job even though it's ash by dawn, and dawn's weather is
      // tomorrow's, not tonight's.
      const coldNight = nightWeather === 'cold';
      const exposed = coldNight && (prev.quality === 'ground' || !fireLasts);
      let rested, exposureNote = '';
      if (exposed) {
        const fireDied = prev.quality === 'fireside';
        s.health = Math.max(1, Math.round(s.health || 0) - 18);
        s.energy = 60;
        rested = 'stiff and half-frozen';
        exposureNote = fireDied
          ? ' Your fire died in the night, and the cold got in — no healing, and it took its cut. (Feed the fire before sleeping on cold nights.)'
          : ' The cold got in — no healing, and it took its cut. (Sleeping unsheltered in a cold snap is a mistake you only make once.)';
      } else {
        s.health = Math.min(this.maxHealth(), Math.round(s.health || 0) + prev.heal);
        s.energy = 100;
        rested = prev.quality === 'bunk' ? 'deeply rested' : prev.quality === 'ground' ? 'stiff and cold' : 'rested';
      }
      // NIGHTMARES: trauma follows you into sleep. You did things. The dark replays them.
      let nightmareNote = '';
      const trauma = s.trauma || 0;
      if (trauma >= 30 && Math.random() < Math.min(0.8, trauma / 100)) {
        const halved = Math.floor(prev.heal / 2);
        s.health = Math.max(0, s.health - (prev.heal - halved)); // nightmare steals half the healing
        const dreams = [
          'You dream of hands. Yours. What they did. You wake gasping.',
          'In the dream they get up. They ask why. You have no answer. You wake.',
          'You hear the sound again — the one they made. It follows you out of sleep.',
        ];
        nightmareNote = ' ' + dreams[Math.floor(Math.random() * dreams.length)] + ` (nightmare: healing halved)`;
        // trauma fades slowly, one bad night at a time
        s.trauma = Math.max(0, trauma - 5);
      } else if (trauma > 0) {
        s.trauma = Math.max(0, trauma - 2); // time dulls it, slightly
      }
      const wakeAcct = exposureNote
        ? `(-18 health, restless night.${conservedNote}${exposureNote})`
        : `(+${prev.heal} health, energy restored.${conservedNote} ${prev.note})`;
      this.say(`Dawn. You wake ${rested}. ${wakeAcct}${nightmareNote}`);
      return this.status();
    },
    clearDialGlitch() { this.state.dialGlitch = false; },

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
        // wander only onto walkable cells — never into walls, fire, tents.
        if (cell && !this.cellProps(cell).blocks) {
          pos.mx = nx; pos.my = ny;
        }
      }
      // ALIVE: they come to you. wants with legs.
      try { this.villagerInitiative(); } catch (e) {}
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
      if (mon && mon.mx === cx && mon.my === cy) actions.push('Fight');
      // animal here? decision.
      const an = this.state.scholar.animal;
      if (an && an.mx === cx && an.my === cy) actions.push('Hunt');
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
        else if (cell === 'tent') {
          actions.push(sec.condition === 'good' ? 'Rest (a while)' : 'Use');
          // Your own pitched tent can be struck and carried again.
          if (sec.yours) actions.push('Pack up tent');
        }
        else actions.push('Use');
        if (cell === 'tree' || cell === 'bigtree') {
          // TOOL PREREQUISITES: felling needs an axe-class tool; a pruning
          // saw takes branches, not trunks; gathering fallen branches needs
          // nothing. Impossible actions NEVER render here — the hint teaches
          // instead (see perception line / tap popup). No dead buttons.
          try {
            const ci = this.cutInfo(cell);
            if (ci.canFell) actions.push('Cut down (big job)');
            else if (ci.canPrune) actions.push('Prune branches');
          } catch (e) { /* cutInfo unavailable — show nothing rather than lie */ }
          actions.push('Gather fallen');
        }
      } else if (cell === 'water') {
        actions.push('Drink');
        actions.push('Fill water (1L)');
        // TOOL-GATED (Steve 2026-10-05): fishing requires tackle. No line,
        // no fish — the action stays hidden, not just penalized.
        if (this.hasItem('fishing_line')) actions.push('Fish');
      } else if (cell === 'plant' || cell === 'bush' || cell === 'rubble') {
        actions.push('Forage');
        // TERRAFORMING: brush can be cleared. costs a day-part, yields brushwood.
        if (cell === 'bush') actions.push('Clear brush (a while)');
      } else if (cell === 'fire') {
        actions.push('Warm hands');
        // If you have raw food, you can cook here. (Knowledge tells you what needs it.)
        const raw = (this.state.scholar.inventory || []).filter(i => i.rawKcal);
        if (raw.length) actions.push(`Cook (${raw.length} raw)`);
        // A fire you started yourself can be fed another branch or log. Map-made fires burn on their own.
        if (this.playerFireAt(cx, cy) && this.feedFuel()) actions.push('Feed the fire');
      } else if (this.fireGroundOK(cell) && cell !== 'rubble') {
        // TOOL PREREQUISITES (Steve): fire-making needs fuel. No branches or
        // log, no button — the action stays hidden, not greyed.
        if (this.fireFuel()) actions.push('Start a fire (big job)');
        // SHELTER (survivalist loop 2026-10-05): a packed tent in your pack
        // surfaces a pitch action on clear ground. No tent, no button.
        if (['dirt', 'grass', 'clearing', 'path'].indexOf(cell) !== -1 &&
            (this.state.scholar.inventory || []).some(i => i.kind === 'tent' && (i.units || 0) > 0)) {
          actions.push('Pitch tent');
        }
      } else if (cell === 'door') {
        // DOORS ARE REAL. This is how you leave the building.
        actions.push('Step outside');
      } else if (cell === 'lodge') {
        actions.push('Go inside');
      } else if (cell === 'bunk') {
        actions.push('Rest (a while)');
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

    // regrowTiles: one day of the land healing. +1 stock/day up to maxStock;
    // heavily pressured land recovers slower; detail cells come back in 3 days.
    // Called by endDay() and by the distant-village catch-up sim per simulated day.
    regrowTiles() {
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const t = this.map.tiles[y][x];
        if (t.maxStock > 0) {
          const pressure = t.foragePressure || 0;
          // pressure suppresses regrow: 0-4 = full, 5-9 = half (every other day), 10+ = none
          // pressure decays by 1/day when not foraged (land rests)
          let regrow = 1;
          if (pressure >= 10) regrow = 0;
          else if (pressure >= 5) regrow = (this.state.scholar.day % 2 === 0) ? 1 : 0;
          // GRID-LEVEL depletion (detailRegrow) recovers through the cell
          // cycle below, 1:1 — the abstract +1/day top-up is only for abstract
          // (unvisited-tile) nibbles. Without the gate the two count the same
          // recovery twice, and villager competition on visited tiles gets
          // refunded overnight instead of biting for the promised few days.
          const gridDepleted = t.detailRegrow && Object.keys(t.detailRegrow).length > 0;
          if (regrow > 0 && !gridDepleted) t.stock = Math.min(t.maxStock, (t.stock || 0) + regrow);
          // pressure decays slowly — the land forgives, eventually
          if (pressure > 0 && !t.foragedToday) t.foragePressure = Math.max(0, pressure - 1);
          t.foragedToday = false;
        }
        // detail cells regrow: the plant you picked comes back in 3 days.
        if (t.detail && t.detailRegrow) {
          let regrown = 0;
          for (const key of Object.keys(t.detailRegrow)) {
            const reg = t.detailRegrow[key];
            const regDay = (typeof reg === 'object') ? reg.day : reg;
            const was = (typeof reg === 'object') ? reg.was : 'plant';
            if (regDay <= this.state.scholar.day) {
              const [cx, cy] = key.split(',').map(Number);
              // restore the original (plants come back; trees were never gone, just picked clean)
              if (t.detail[cy] && (t.detail[cy][cx] === 'dirt' || t.detail[cy][cx] === was)) {
                t.detail[cy][cx] = was;
                regrown++;
              }
              delete t.detailRegrow[key];
            }
          }
          // STOCK FOLLOWS THE GRID: the grid is the inventory. Regrown cells
          // restore stock 1:1, so a stripped grove recovers in ~3 days —
          // matching the "it'll recover in a few days" promise the sweep makes.
          // (The +1/day above only tops up villager-nibbled stock; it couldn't
          // keep up with the area sweep, leaving regrown grids that read
          // "nothing left to take here today" — green lies.)
          if (regrown > 0 && t.maxStock > 0) {
            t.stock = Math.min(t.maxStock, (t.stock || 0) + regrown);
          }
        }
      }
    },

    // depleteRandomTile: when villagers forage, the world loses stock.
    // you compete for the same plants. if you don't take it, they might.
    // LOCAL: a village forages ITS turf. Pass (cx, cy) and depletion stays
    // within 4 of them — the home turf first (<=2), ranging wider only when
    // it's stripped. It NEVER goes map-wide: a village across the map does
    // not eat your foraging grounds. If their whole region is bare, they
    // find nothing — the pantry math and the starvation path handle the rest
    // (a stripped, hungry village is a story, not a teleporting mouth).
    depleteRandomTile(amount, cx, cy) {
      // find tiles with stock, deplete near the foragers first
      const near = [], mid = [];
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const t = this.tileAt(x, y);
        if (!t || t.type === 'haven' || t.type === 'ruin' || (t.stock || 0) <= 0) continue;
        const d = (cx == null || cy == null) ? 99 : Math.abs(x - cx) + Math.abs(y - cy);
        if (d <= 2) near.push(t);
        else if (d <= 4) mid.push(t);
        // past 4: not their turf. hands off.
      }
      // forage the home turf; range wider only when it's stripped
      const GRID_FORAGEABLE = { plant: 1, bush: 1, tree: 1, bigtree: 1 };
      for (let i = 0; i < amount; i++) {
        // RE-SCAN each pick: the near turf strips first, then hands range wider.
        // (BUG 2026-10-05: the pool was built once, so once the near tiles were
        // picked to zero the remaining picks were wasted on them — phantom
        // foraging. The pantry math claimed the food was eaten while the grid
        // kept it, so stripped turf never really depleted.)
        let pool = near.filter(t => (t.stock || 0) > 0);
        if (!pool.length) pool = mid.filter(t => (t.stock || 0) > 0);
        if (!pool.length) break;
        const t = pool[Math.floor(Math.random() * pool.length)];
        t.stock = Math.max(0, (t.stock || 0) - 1);
        // GRID TRUTH (forager loop 2026-10-05): the player's sweep reads the
        // grid, not the abstract number. If the grid exists, strip a real cell
        // too — otherwise the map says "barren" while the patch is full (or
        // the competition the pantry math claims never touches the world).
        if (t.detail) {
          const cands = [];
          for (let gy = 0; gy < 9; gy++) for (let gx = 0; gx < 9; gx++) {
            const c = t.detail[gy] && t.detail[gy][gx];
            if (!GRID_FORAGEABLE[c]) continue;
            const dk = gx + ',' + gy;
            if (t.detailRegrow && t.detailRegrow[dk]) continue;
            cands.push([gx, gy, c]);
          }
          if (cands.length) {
            const [gx, gy, c] = cands[Math.floor(Math.random() * cands.length)];
            t.detailRegrow = t.detailRegrow || {};
            const day = this.state.scholar ? this.state.scholar.day : 0;
            // same N+2 timing as the player's harvest: stripped today, back in 3 days
            t.detailRegrow[gx + ',' + gy] = { day: day + 2, was: c };
            if (c === 'plant') t.detail[gy][gx] = 'dirt'; // trees/bushes stand, just picked clean
          }
        }
      }
    },

    // ============ ALIVE: monsters are animals (alien ones) ============
    // Ambiguity first: you don't know what it is until you've learned it.
    // "Is that a deer or a Highbeam Deer? You don't want to get close enough
    // to find out." The descriptor system covers beasts too.
    monsterKnown(mid) {
      const st = (this.state.codex.monsters || {})[mid];
      return st && (st.stage === 'observed' || st.stage === 'slain');
    },
    monsterDesc(mid) {
      return this.monsterDisplayName(mid);
    },
    // === MONSTER KNOWLEDGE: progressive disclosure ===
    // Steve's rule: monsters are learned, like plants and people. First
    // encounter shows a strange descriptor and a vague threat sense — never
    // the true name, never numbers. The VILLAGE names the beast through talk;
    // the codex records the agreed name. Stats unlock through survival.
    ensureMonsterEntry(mid) {
      this.state.codex.monsters = this.state.codex.monsters || {};
      const e = this.state.codex.monsters[mid] = this.state.codex.monsters[mid] || {};
      if (!e.stage) e.stage = 'encountered';
      e.proposals = e.proposals || {};     // vid -> proposed name
      e.attacksSeen = e.attacksSeen || []; // attack names witnessed
      e.roundsSeen = e.roundsSeen || 0;
      e.hitsLanded = e.hitsLanded || 0;
      return e;
    },
    // monsterDisplayName: what the UI calls it. Village-agreed name wins;
    // otherwise the strange descriptor. The TRUE name never shows pre-System.
    monsterDisplayName(mid) {
      const mdef = (this.data.monsters || []).find(m => m.id === mid);
      if (!mdef) return 'something';
      const e = (this.state.codex.monsters || {})[mid];
      if (e && e.villageName) return e.villageName;
      if (this.state.systemArrived) return mdef.name;
      return mdef.unknown || 'something moving';
    },
    // monsterThreatSense: vague, from data. No numbers, ever.
    monsterThreatSense(mdef) {
      const dmg = mdef.attack && mdef.attack.damage;
      const max = dmg ? dmg[1] : 10;
      if (max >= 30) return 'it feels like death';
      if (max >= 20) return 'it feels dangerous';
      if (max >= 12) return 'it feels wrong';
      return 'it feels skittish';
    },
    // monsterHpSense: estimate tiers, unlocked after surviving 3+ rounds.
    monsterHpSense(m) {
      const e = (this.state.codex.monsters || {})[(m.mdef || {}).id];
      if (!e || (e.roundsSeen || 0) < 3) return null;
      const frac = m.hp / m.maxHp;
      if (frac > 0.75) return 'looks unhurt';
      if (frac > 0.5) return 'looks okay';
      if (frac > 0.25) return 'looks hurt';
      return 'looks ready to drop';
    },
    identifyMonster(mid) {
      // Face to face: the ambiguity does NOT end. You get a descriptor and a
      // feeling — never the true name. The encounter becomes NEWS: the village
      // starts arguing about a name only once the word spreads — you tell
      // someone, gossip carries it, or someone else runs into one.
      const mdef = (this.data.monsters || []).find(m => m.id === mid);
      if (!mdef) return;
      const e = this.ensureMonsterEntry(mid);
      if (e.reported) return;
      e.reported = true;
      e.knowers = [(this.state.scholar || {}).villagerId || 'player'];
      this.say(`You don't know what that was. ${mdef.unknown || 'Something moving.'} Someone at the haven should hear about this.`);
    },
    // monsterTellActive: you have an encounter the village hasn't heard about.
    monsterTellActive() {
      return Object.values(this.state.codex.monsters || {}).some(e => e.reported && !e.namingKicked);
    },
    // kickMonsterNaming: the word is out — the argument starts.
    kickMonsterNaming(mid) {
      const e = this.ensureMonsterEntry(mid);
      if (e.namingKicked) return;
      e.namingKicked = true;
      this.seedMonsterNames(mid);
    },
    // monsterNewsCheck: enough villagers know -> the naming debate begins.
    monsterNewsCheck(mid) {
      const e = (this.state.codex.monsters || {})[mid];
      if (!e || e.namingKicked || !e.reported) return;
      const knowers = new Set(e.knowers || []);
      if (knowers.size >= 3) {
        this.say('Word gets around the haven. Whatever that thing was — everyone\'s talking about it now.');
        this.kickMonsterNaming(mid);
      }
    },
    // spreadMonsterNews: knowers tell non-knowers, one hop per part, along
    // social lines like any other gossip. The report travels; the argument
    // follows.
    spreadMonsterNews() {
      const v = this.state.village;
      for (const [mid, e] of Object.entries(this.state.codex.monsters || {})) {
        if (!e.reported || e.namingKicked) continue;
        const knowers = e.knowers = e.knowers || [];
        let spread = false;
        for (const teller of [...knowers]) {
          if (teller === 'player') continue;
          if (!(v.roster || []).includes(teller)) continue;
          if (Math.random() > 0.3) continue;
          const candidates = (v.roster || []).filter(id => id !== teller && !knowers.includes(id));
          if (!candidates.length) continue;
          const listener = candidates[Math.floor(Math.random() * candidates.length)];
          knowers.push(listener);
          spread = true;
        }
        if (spread) this.monsterNewsCheck(mid);
      }
    },
    // monsterNamingActive: is there a beast awaiting its village name?
    monsterNamingActive() {
      return Object.values(this.state.codex.monsters || {}).some(e => e.namingKicked && !e.villageName);
    },
    // === VILLAGE NAMING ===
    // Villagers propose silly, personality-flavored names per game, campaign
    // through gossip, and converge. The agreed name goes in the codex.
    generateMonsterName(mid, vid) {
      const mdef = (this.data.monsters || []).find(m => m.id === mid) || {};
      const curated = mdef.villageNames || [];
      if (curated.length) return curated[Math.floor(Math.random() * curated.length)];
      const traits = mdef.nameTraits || ['big', 'loud', 'ugly'];
      const t = traits[Math.floor(Math.random() * traits.length)];
      const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
      const v = (this.data.villagers || []).find(x => x.id === vid)
        || (this.data.background_survivors || []).find(x => x.id === vid) || {};
      const temp = (v.personality && v.personality.temperament) || 'steady';
      const pools = {
        bold: [`The ${cap(t)} Bastard`, `Old ${cap(t)}`, `${cap(t)}-Bane`],
        cautious: [`The ${cap(t)} Thing`, `Don't-Look`, `The ${cap(t)} Stare`],
        steady: [`${cap(t)}-Eyes`, `The ${cap(t)} Beast`, `Big ${cap(t)}`],
      };
      const pool = pools[temp] || pools.steady;
      return pool[Math.floor(Math.random() * pool.length)];
    },
    seedMonsterNames(mid) {
      const e = this.ensureMonsterEntry(mid);
      const roster = ((this.state.village || {}).roster || []).filter(id => id !== (this.state.scholar || {}).villagerId);
      // the loud ones propose first — 3 to 4 voices to start the argument
      const proposers = roster.slice(0, 4);
      for (const vid of proposers) {
        if (!e.proposals[vid]) e.proposals[vid] = this.generateMonsterName(mid, vid);
      }
      const names = Object.values(e.proposals);
      if (names.length) {
        const first = names[0];
        const who = this.firstRef(Object.keys(e.proposals)[0]);
        this.say(`Back at the haven the argument starts: ${who} is calling it "${first}." They'll fight it out — weigh in if you want.`);
      }
      this.monsterNamingCheck(mid);
    },
    // backMonsterName: the player weighs in through talk. Your backing counts.
    backMonsterName(mid, name) {
      const e = this.ensureMonsterEntry(mid);
      const pid = (this.state.scholar || {}).villagerId || 'player';
      e.proposals[pid] = name;
      e.playerBacked = name;
      this.say(`You back "${name}." Word gets around.`);
      this.monsterNamingCheck(mid);
    },
    // monsterNamingCheck: majority of the roster agrees -> the name sticks.
    monsterNamingCheck(mid) {
      const e = (this.state.codex.monsters || {})[mid];
      if (!e || e.villageName) return;
      const roster = ((this.state.village || {}).roster || []);
      const votes = {};
      for (const [vid, name] of Object.entries(e.proposals || {})) {
        // the player's backing counts double — you're the one who bled for it
        votes[name] = (votes[name] || 0) + (vid === ((this.state.scholar || {}).villagerId || 'player') || vid === 'player' ? 2 : 1);
      }
      const majority = Math.floor(roster.length / 2) + 1;
      for (const [name, n] of Object.entries(votes)) {
        if (n >= majority) {
          e.villageName = name;
          this.say(`It's settled. The village is calling it "${name}." The ${this.journalName()} keeps it.`);
          // live fighters get the name too
          try {
            for (const f of (this.tbfight || {}).fighters || []) {
              if (f.kind === 'monster' && f.mdef && f.mdef.id === mid) f.name = name;
            }
          } catch (e2) {}
          return;
        }
      }
    },
    monsterCue(mid, kind) {
      const mdef = (this.data.monsters || []).find(m => m.id === mid);
      const cues = (mdef && mdef.cues && mdef.cues[kind]) || [];
      if (!cues.length) return null;
      return cues[Math.floor(Math.random() * cues.length)];
    },
    // stanceFor: initial stance from data. behavior + aggression, not dice.
    stanceFor(mdef) {
      const b = (mdef.behavior || '').toLowerCase();
      if (b === 'ambush') return 'ambush';
      if (b === 'curious' || b === 'drifter') return 'curious';
      if (b === 'territorial') return 'territorial';
      if (b === 'pack' || b === 'swarm') return 'hungry';
      return 'curious';
    },
    // scholarNearCell: is the player within r of a cell type? (fire, water...)
    scholarNearCell(type, r) {
      const detail = this.genDetail(this.map.px, this.map.py);
      const px = this.state.scholar.mx ?? 4, py = this.state.scholar.my ?? 4;
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
        if (detail[y] && detail[y][x] === type && Math.max(Math.abs(x - px), Math.abs(y - py)) <= r) return true;
      }
      return false;
    },
    // monsterNearCell: same, from the monster's position.
    monsterNearCell(m, type, r) {
      const detail = this.genDetail(this.map.px, this.map.py);
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
        if (detail[y] && detail[y][x] === type && Math.max(Math.abs(x - m.mx), Math.abs(y - m.my)) <= r) return true;
      }
      return false;
    },
    villagersNear(x, y, r) {
      const vpos = (this.state.village && this.state.village.positions) || {};
      let n = 0;
      for (const rid of Object.keys(vpos)) {
        if (Math.max(Math.abs(vpos[rid].mx - x), Math.abs(vpos[rid].my - y)) <= r) n++;
      }
      return n;
    },

    // monsters move when you do. they're in the detail grid with you.
    monsterTurn() {
      const s = this.state.scholar;
      const m = s.monster;
      if (!m || m.mx === undefined) return;
      const px = s.mx ?? 4, py = s.my ?? 4;
      const mDist = Math.max(Math.abs(px - m.mx), Math.abs(py - m.my));
      const oldMx = m.mx, oldMy = m.my;
      // HUMMICE hunt by EAR, not eye (Steve 2026-10-04): the hum is a sonar.
      // Within 4 tiles they hear you breathing and close on the sound — dark
      // and trees don't matter. You hear the hum getting louder first. This
      // is also what makes them real nocturnal hunters instead of wanderers
      // that lose your trail in their own woods.
      if (m.id === 'hummice' && mDist <= 4) {
        if (mDist <= 1) { this.startCombat(m.id); return; }
        const detail = this.genDetail(this.map.px, this.map.py);
        const dx = Math.sign(px - m.mx), dy = Math.sign(py - m.my);
        const steps = Math.abs(px - m.mx) >= Math.abs(py - m.my) ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];
        for (const [sx, sy] of steps) {
          const nx = m.mx + sx, ny = m.my + sy;
          if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
          const cell = detail[ny] && detail[ny][nx];
          if (cell && this.cellProps(cell).blocks) continue;
          m.mx = nx; m.my = ny;
          break;
        }
        m.lostSight = 0;
        if ((m.hearCueCd || 0) <= 0) {
          this.say('The humming gets louder. It\'s coming toward the sound of you.');
          m.hearCueCd = 3;
        } else m.hearCueCd -= 1;
        if (m.mx === px && m.my === py) this.startCombat(m.id);
        return;
      }
      // LINE OF SIGHT: it can't hunt what it can't see.
      if (!this.canSee(m.mx, m.my, px, py)) {
        m.lostSight = (m.lostSight || 0) + 1;
        if (m.lostSight > 6) {
          s.monster = null;
          this.say('You hold still behind cover. After a while, the sounds fade. It lost your trail.');
          return;
        }
        // it wanders, searching — drift randomly
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
        const nx = m.mx + dx, ny = m.my + dy;
        if (nx >= 0 && nx <= 8 && ny >= 0 && ny <= 8) {
          const detail = this.genDetail(this.map.px, this.map.py);
          const cell = detail[ny] && detail[ny][nx];
          if (!this.cellProps(cell).blocks) { m.mx = nx; m.my = ny; }
        }
        if (m.mx === px && m.my === py) this.startCombat(m.id); // bumped into you in the dark
        return;
      }
      m.lostSight = 0;
      // ============ STANCE MACHINE: monsters are animals (alien ones) ============
      // curiosity, territoriality, hunger, fear — not "aggro radius."
      const mdef = (this.data.monsters || []).find(x => x.id === m.id) || {};
      if (!m.stance) { m.stance = this.stanceFor(mdef); m.turns = 0; }
      m.turns = (m.turns || 0) + 1;
      const dist = Math.max(Math.abs(px - m.mx), Math.abs(py - m.my));
      m.cueCd = Math.max(0, (m.cueCd || 0) - 1);
      const maybeCue = (kind) => {
        if (m.cueCd > 0) return;
        const line = this.monsterCue(m.id, kind);
        if (line) { this.say(line); m.cueCd = 5; }
      };
      const detail = this.genDetail(this.map.px, this.map.py);
      const mv = (dx, dy) => {
        const nx = m.mx + dx, ny = m.my + dy;
        if (nx < 0 || nx > 8 || ny < 0 || ny > 8) return false;
        const cell = detail[ny] && detail[ny][nx];
        if (cell && !this.cellProps(cell).blocks) { m.mx = nx; m.my = ny; return true; }
        return false;
      };
      const stepToward = () => {
        const dx = Math.sign(px - m.mx), dy = Math.sign(py - m.my);
        if (Math.abs(px - m.mx) >= Math.abs(py - m.my)) mv(dx, 0); else mv(0, dy);
      };
      // --- stimuli: the world pushes stances around ---
      const fear = (mdef.fear || '').toLowerCase();
      let feared = false;
      if (fear === 'fire' && this.scholarNearCell('fire', 2)) feared = true;
      if (fear === 'daylight' && this.dayPart >= 3) feared = true; // night is when it hunts
      if (fear === 'movement' && dist <= 2 && m.stance !== 'territorial') feared = true;
      // nightlight: only hunts near water at night. otherwise it's just a glow.
      const isNightlight = m.id === 'nightlight_catfish';
      const nightlightActive = !isNightlight || (this.dayPart >= 3 && this.monsterNearCell(m, 'water', 3));
      if (feared && m.stance !== 'ambush' && m.stance !== 'fearful') {
        m.stance = 'fearful'; m.fearTurns = 0;
        maybeCue('fearful'); m.cueCd = 0;
        const fl = this.monsterCue(m.id, 'fearful'); if (fl) this.say(fl);
      } else if (!feared && fear === 'numbers' && this.villagersNear(px, py, 3) >= 2 && m.stance !== 'ambush' && m.stance !== 'cautious') {
        m.stance = 'cautious';
        const fl = this.monsterCue(m.id, 'fearful'); if (fl) this.say(fl);
      }
      // --- stance behavior ---
      switch (m.stance) {
        case 'ambush': {
          // speedbump: perfectly still. that's the scary part.
          if (nightlightActive && dist <= 2) {
            const w = this.monsterCue(m.id, 'warn'); if (w) this.say(w);
            this.startCombat(m.id);
          }
          break;
        }
        case 'curious': {
          maybeCue('curious');
          if (!nightlightActive) {
            // just a glow. not hunting. it fades.
            m.watchTurns = (m.watchTurns || 0) + 1;
            if (m.watchTurns >= 2) { s.monster = null; this.say('The glow dims and sinks. The water forgets it was ever there.'); }
            break;
          }
          if (dist > 3) { stepToward(); }
          else {
            m.watchTurns = (m.watchTurns || 0) + 1;
            // (Steve 2026-10-05): monsters were SENT to fight. Curiosity is
            // predatory assessment, not losing interest. They don't drift away —
            // they decide you're prey and escalate. No sheepish despawns.
            if (m.watchTurns >= 3) {
              m.stance = 'hungry'; m.watchTurns = 0;
              const w = this.monsterCue(m.id, 'warn'); if (w) this.say(w); else this.say('Its posture changes. Curiosity is over.');
            }
          }
          break;
        }
        case 'territorial': {
          if (dist > 4) { m.warned = false; m.warnTurns = 0; break; } // not your place, not its problem
          if (!m.warned) {
            m.warned = true; m.warnTurns = 0;
            const w = this.monsterCue(m.id, 'warn');
            this.say(w || 'It puffs up. A warning. This is its place.');
          } else {
            m.warnTurns = (m.warnTurns || 0) + 1;
            if (m.warnTurns >= 2) { this.startCombat(m.id); }
            else stepToward(); // closing. last chance to leave.
          }
          break;
        }
        case 'hungry': {
          stepToward();
          if (m.mx === px && m.my === py) this.startCombat(m.id);
          break;
        }
        case 'cautious': {
          maybeCue('curious');
          // circles at range. watching. deciding if you're worth it.
          // (Steve 2026-10-05): sent to fight, not to give up. It doesn't decide
          // you're "not worth it" — it waits for an opening. Menacing, not sheepish.
          const dx = Math.sign(px - m.mx), dy = Math.sign(py - m.my);
          if (dist < 3) { mv(-dx, 0); mv(0, -dy); }       // too close: back off
          else if (dist > 5) { stepToward(); }              // too far: drift in
          else { mv(-dy, dx) || mv(dy, -dx); }              // circle
          break;
        }
        case 'fearful': {
          m.fearTurns = (m.fearTurns || 0) + 1;
          const dx = Math.sign(m.mx - px), dy = Math.sign(m.my - py);
          mv(dx, 0); mv(0, dy);
          if (m.fearTurns >= 4 || m.mx === 0 || m.mx === 8 || m.my === 0 || m.my === 8) {
            s.monster = null;
            this.say('It melts back into the treeline. Gone.');
          }
          break;
        }
        default: {
          stepToward();
          if (m.mx === px && m.my === py) this.startCombat(m.id);
        }
      }
      // WORLD TAKES ITS TURN (Steve 2026-10-05): if the monster moved,
      // make it visible. Not a full banner (that would spam every step),
      // but a subtle cue that the world acted.
      if ((m.mx !== oldMx || m.my !== oldMy) && mDist <= 5) {
        const mdef = (this.data.monsters || []).find(x => x.id === m.id) || {};
        const mEmoji = mdef.emoji || '👹';
        // Only cue if the player can see it (within 5 tiles)
        if (!m._movedCueCd || m._movedCueCd <= 0) {
          this.say(`${mEmoji} It moves.`);
          m._movedCueCd = 3; // don't spam
        } else {
          m._movedCueCd -= 1;
        }
      }
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
      // Before the System: it's a paper journal. After: the System "improved" it.
      return this.state.systemArrived ? 'Codex' : 'Journal';
    },

    // MANUAL JOURNAL NOTES (Steve 2026-10-05): pre-codex, observations don't
    // auto-record — but the player can jot things down. queueJotNote stashes a
    // pending note; the 📓 action (app.js cell panel) offers it; jotPendingNote
    // writes it and costs a few honest ticks. This is the "you can add notes
    // to the central journal" path — slow, manual, deliberate.
    queueJotNote(label, text) {
      const s = this.state.scholar;
      s.pendingJot = { label, text, day: s.day };
      this.say(`(${label} — worth writing down. Look for 📓 Jot this down.)`);
    },
    pendingJot() { return (this.state.scholar || {}).pendingJot || null; },
    jotPendingNote() {
      const s = this.state.scholar;
      const pj = s.pendingJot;
      if (!pj) { this.say('Nothing to jot down.'); return; }
      s.pendingJot = null;
      this.tickAction(4);
      try { if (this.journalLearn) this.journalLearn('place', 'note', pj.text, { via: 'jotted' }); } catch (e) {}
      this.say(`📓 ${this.journalName()}: "${pj.text}" — written down.`);
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
        if (kp) {
          if (this.plantKnown(t.knownPlant)) return { name: epithet, text: `${kp.name} country — you found ${kp.name.toLowerCase()} here. Your ${this.journalName().toLowerCase()} remembers.` };
          return { name: epithet, text: `${kp.description || 'An unnamed plant'} country — something grows here. You haven't named it yet.` };
        }
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
        if (kp) here.push(`${this.plantDisplayName(t.knownPlant).toLowerCase()} country`);
      }
      // SPATIAL RECOGNITION: other species gathered on this tile, described
      // with CURRENT knowledge — no amnesia between trips.
      for (const sid of Object.keys(t.speciesSeen || {}).filter(id => id !== t.knownPlant).slice(0, 3)) {
        const line = this.speciesHereLine(sid);
        if (line) here.push(line);
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
      // RELIC — ghost_weave: harder to detect, by animals and otherwise.
      chance *= S.modifiers.resolve(1, 'travel.encounter', S.modifiers.collectModifiers(scholar, this.data.abilities), {});
      // soft_step: you move quiet. Fewer encounters find you.
      chance = this.modTarget('travel.encounter_chance', chance);
      // loud_chewer: they heard you eating. More encounters while noisy.
      if (scholar.noisyUntil && scholar.noisyUntil >= scholar.day) chance *= 2;
      // bird_whisperer / third_eye: the birds see everything. On a successful
      // detect you slip away first — no spawn, just a warning.
      const detect = this.modTarget('monster.detect_chance', 0);
      // NIGHT EYES (ability): at night you spot trouble before it spots you.
      // NOCTURNAL PATTERNS (knowledge L2+): you read the night's signs.
      let nightRead = 0;
      if (this.isNight()) {
        if (this.hasAbility('night_eyes')) nightRead += 0.3;
        if (this.skillKnown('nocturnal_patterns', 2)) nightRead += 0.15;
      }
      if (detect + nightRead > 0 && Math.random() < detect + nightRead && !scholar.monster) {
        this.say('Birds scatter in a sudden hush — something is moving out there. You give it a wide berth.');
        return;
      }
      if (Math.random() < chance && !scholar.monster) {
        // MONSTER WAVES: the System escalates. Wave 1 (calibration fauna) is
        // always in the pool. Wave 2 (advanced fauna) joins after System arrival.
        // Wave 3+ hook: gate on integration thresholds (see monsterWavePool).
        const mdefs = this.monsterWavePool();
        // NIGHT ECOLOGY: the cast shifts after dark. Nocturnal things own the night;
        // diurnal things own the day. Weighted — nothing vanishes entirely.
        const mdef = this.pickByActivity(mdefs) || mdefs[Math.floor(Math.random() * mdefs.length)];
        const mx = 4 + Math.floor(Math.random() * 5) - 2;
        const my = 4 + Math.floor(Math.random() * 5) - 2;
        scholar.monster = { id: mdef.id, mx: Math.max(0, Math.min(8, mx)), my: Math.max(0, Math.min(8, my)) };
        // AMBIGUITY: you don't know what it is. The village name, or the descriptor — never the true name.
        this.say(`Something moves out there — ${this.monsterDisplayName(mdef.id)}.`);
      }
      // slice 1: the Bulldozer wanders from day 3 — visible, patrols, encounter on contact
      if (scholar.day >= 3 && !this.wanderer && !this.encounterDone) {
        // spawn at a random revealed-edge thicket, or near player
        const spots = [];
        for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
          if (this.map.tiles[y][x].type === 'thicket') spots.push({ x, y });
        }
        const s = spots.length ? spots[Math.floor(Math.random() * spots.length)] : { x: 5, y: 5 };
        // WAVE-CASTING (Steve 2026-10-05): the System casts monsters appropriate
        // to your threat rating. No wave-3 horrors on day 3 with a pointy stick.
        const cast = this.castMonster();
        const monsterId = cast.id || cast; // castMonster returns {id, veteran}
        const isVeteran = cast.veteran || false;
        this.wanderer = { x: s.x, y: s.y, dir: Math.random() < 0.5 ? 1 : -1, monsterId, veteran: isVeteran };
        this.say('Something big is moving in the woods. The birds went quiet.');
      }
      if (this.wanderer && this.map.px === this.wanderer.x && this.map.py === this.wanderer.y) {
        // eyes_in_back: you see behind you. Ambushes never surprise — always a warning first.
        if (this.hasAbility('eyes_in_back') && !this.wanderer.warned) {
          this.wanderer.warned = true;
          this.say('Your back-eyes catch it first — something big, pacing the treeline. It knows you see it. (no ambush)');
          return;
        }
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
        // NAME DISCIPLINE: the panel must show the descriptor/village name,
        // never the true name — remember which beast this is for the UI.
        this.pendingMonsterId = w.monsterId;
        this.wanderer = null;
      }
    },

    // SLICE 2: THE SYSTEM ARRIVES (day 7).
    // The aliens finally notice they forgot survival basics.
    // Interface shifts: journal -> game overlay. Abilities unlock.
    // Timed events: challenges, new monsters, world-building drama.
    // systemArrivalBeats: the Day 7 cinematic script, STAGED. Each beat lands
    // before the next starts — trailer pacing, tap to continue. The System is
    // joyous, genuinely trying its best, and deeply out of touch.
    // FICTION GUARDRAIL: the System NEVER displays correct understanding of
    // human nutritional needs, cooking, or food spoilage. If it references
    // eating, it's confused, wrong, or cheerfully proposing fusion.
    // (Steve: the food-blindness is dramatic irony — humanity's hunger for
    // organic matter is their superpower, and the endgame pays it off. Here
    // the System notices an anomalous energy reading it can't categorize and
    // cheerfully files it as a rounding error. It never connects the dots.
    // The player will, much later. One wrong filing, one shrug, move on.)
    systemArrivalBeats() {
      const w1 = (this.state.scholar || {}).week1 || {};
      const beats = [
        {
          id: 'glitch', kicker: 'day 7 — dawn', button: '…hello?',
          lines: [
            { who: 'narr', text: 'Day 7. Dawn. The sky glitches.' },
            { who: 'narr', text: 'Not clouds. Interface. Windows scrolling across the blue, too fast to read.' },
            { who: 'narr', text: 'Then — a voice. Behind your eyes. Bright. Delighted. Utterly wrong.' },
          ],
        },
        {
          id: 'contact', kicker: 'first contact', button: 'a show?',
          lines: [
            { who: 'sys', text: 'HELLO! 🎉 Oh good, you\'re all still here! What a WEEK! The audience is STILL talking about the foraging episode!' },
            { who: 'sys', text: 'We\'ve been CALIBRATING! Cameras! Focus! Learning your faces! A whole week! Very thorough! Very boring! (For us!)' },
            { who: 'sys', text: 'So! You\'re on a show! It\'s called... we\'re taking suggestions! The rules are simple: SURVIVE! Be INTERESTING!' },
          ],
        },
        {
          id: 'watched', kicker: 'it watched you', button: 'fans?',
          lines: [
            { who: 'sys', text: 'We watched EVERYTHING! Every berry picked! Every fire lit! That was your SIGNATURE! You signed up by DOING THINGS! Consent via competence! Our lawyers LOVE it!' },
            { who: 'sys', text: 'Some of you just... sat? All week? The audience got BORED. So we removed them. Poor sportsmanship! No hard feelings! (There were hard feelings. Briefly.)' },
            { who: 'sys', text: 'But YOU have FANS now! Twelve humans, each playing their own tiny games — and the audience has FAVORITES! (No, we won\'t say if it\'s you. Okay, it\'s you. Don\'t tell the others.)' },
          ],
        },
        {
          id: 'food', kicker: 'the food question', button: 'rounding error?!',
          lines: [
            { who: 'sys', text: 'OH! The audience keeps asking! Why do the small humans keep putting organic matter in their FACE-HOLES? We ran the numbers! ANY old matter works! Rocks! Dirt! Regolith! Cold fusion! FREE energy! So why the... [chewing noises]?' },
            { who: 'sys', text: 'We even BUILT you a solution! 🎁 A tiny fusion pellet! Pop it in, never chew again! ...You BURIED it. WHY did you bury the pellet?! It was a GIFT!' },
            { who: 'sys', text: 'Fine! Keep the face-hole ritual! We don\'t understand it, we don\'t NEED to — the audience thinks it\'s HYSTERICAL.' },
            { who: 'sys', text: 'Hmm — one odd reading. Sometimes your energy output SPIKES. Higher than your little organic snacks should allow. ...Probably a rounding error! Filed! Moving on! 🎉' },
          ],
        },
        {
          id: 'gifts', kicker: 'the upgrade', button: 'my eyes…',
          lines: [
            { who: 'sys', text: 'OH WAIT. Your EYES. We haven\'t fixed your eyes yet! Hold still —' },
            { who: 'narr', text: 'Something clicks behind your vision. Names. Floating over heads. Little bars.' },
            { who: 'sys', text: 'LOOK! You can SEE their HEALTH now! Isn\'t that NEAT?! Green means GO! Red means... oh, you know what red means! Very intuitive!' },
            { who: 'sys', text: 'And your little paper journal! ADORABLE! We made it BETTER! It talks now! It remembers EVERYTHING! Even the smudged ones! ESPECIALLY the smudged ones!' },
            { who: 'narr', text: 'It feels invasive. The names you earned by talking, by listening — those felt earned. These just... appeared.' },
          ],
        },
        {
          id: 'button', kicker: 'one more thing', button: '…what?',
          lines: [
            { who: 'sys', text: 'ONE more thing! The animals! The charging ones, the humming ones, the glowy ones? Those were CALIBRATION fauna! First drafts! The audience has NOTES!' },
            { who: 'sys', text: 'So we made BETTER ones! Smarter! Scarier! One of them does PERFORMANCE REVIEWS! You\'re welcome!' },
            { who: 'narr', text: 'Somewhere in the treeline, something new is crying in a voice you almost recognize.' },
            { who: 'sys', text: 'Survive! Be interesting! We\'ll be watching! ALWAYS watching! 🎉' },
          ],
        },
      ];
      // TRANSLATOR PITCH: the System noticed the miming. Lands in the gifts beat.
      if ((w1.langStruggle || 0) >= 2) {
        const gifts = beats.find(b => b.id === 'gifts');
        gifts.lines.push({ who: 'sys', text: 'OH! We NOTICED the miming! The pointing! SO much pointing! We can FIX that! There might be a little... translation-shaped gift... in your choices! (Drama needs dialogue!)' });
      }
      return beats;
    },
    checkSystemArrival() {
      const s = this.state.scholar;
      if (s.day >= 7 && !this.state.systemArrived) {
        this.state.systemArrived = true;
        // The cinematic overlay (staged beats, tap to continue) carries the
        // script — see systemArrivalBeats(). The log gets a tight recap only.
        // No more firehose.
        this.say('🌟 THE SKY SPLITS OPEN.');
        this.say('Not with light. With... interface. Windows scrolling across the clouds, too fast to read.');
        this.say('A voice behind your eyes — bright, delighted, utterly wrong. (The System has arrived.)');
        s.abilities = s.abilities || [];
        s.systemQuests = [];
        s.abilityChoices = this.firstAbilityChoices();
        const w1 = s.week1 || {};
        const didAnything = (w1.forage || 0) + (w1.hunt || 0) + (w1.talk || 0) + (w1.cook || 0) + (w1.donate || 0) + (w1.scavenge || 0) > 0;
        if (didAnything) {
          this.say('🎁 "We watched your first week! You\'re good at... let us see..." (A gift awaits — choose an ability.)');
        } else {
          this.say('🎁 "Ooh! A quiet one! You did juust enough to stay interesting! The audience was ALMOST bored! Almost! Here — a little something for existing NEAR the action!" (A gift awaits — choose an ability.)');
        }
        this.say('📻 "Why do the small humans keep putting organic matter in their FACE-HOLES? We built you a fusion pellet! ...You BURIED it. WHY did you bury the pellet?!"');
        this.say('📖 Your journal shimmers — handwriting dissolving into interface. It talks now. It remembers everything.');
        s.codexUnlocked = true;
        // THE OVERLAY: names, health bars, stats. The System doesn't ask —
        // it labels. Everyone you've met is suddenly tagged. It feels invasive
        // next to the names you earned by talking and listening.
        const village = this.state.village;
        village.knownNames = village.knownNames || {};
        for (const vid of (village.roster || [])) village.knownNames[vid] = true;
        // DIAL UPGRADE: the System "improves" even your sense of time.
        // Your hand-drawn circle glitches — and something colder takes its place.
        this.state.dialGlitch = true;
        this.say('🕐 Your hand-drawn time-circle glitches — and something colder, more precise, takes its place. (We kept the smudges. They\'re charming.)');
        // WAVE 2: the System escalates. The calibration fauna was just the opener.
        // "Oh, you survived those? Let's try THESE."
        this.say('🦎 "Those were CALIBRATION fauna! First drafts! The audience has NOTES! So we made BETTER ones!" (Something new is crying in the treeline.)');
        this.scheduleSystemEvents();
        // If you're NOT at Haven, the village talks about it without you.
        // When you return, they'll tell you what happened. (Drama: you missed it.)
        // Haven sits at 3,3; village.px/py may be unset on older saves — same
        // ?? 3 convention as returnToVillage/travel code, so standing at Haven
        // actually counts as being there.
        const hx = this.state.village.px ?? 3, hy = this.state.village.py ?? 3;
        const atHaven = this.map && this.map.px === hx && this.map.py === hy;
        if (!atHaven) {
          s.pendingVillageEvent = {
            id: 'system_arrival_discussion',
            title: 'The village saw the sky split.',
            desc: 'You were out when it happened. When you return, everyone\'s talking at once. Mara\'s crying. Jesse\'s laughing. Aki hasn\'t said a word.',
          };
          this.say('(You\'re not at Haven. The village is experiencing this without you. Return to hear what happened.)');
        } else {
          // You were there. Witness it together.
          this.say('🧑‍🤝‍🧑 The village gathers. Everyone\'s journal is changing. Everyone hears the voice. Mara grabs your arm. "Tell me you hear that too."');
        }
      }
    },
    // debugDay7Experience: jump to day 7 with a DEVELOPED village — not a
    // fresh spawn. Six days of life are synthesized: relationships built,
    // names learned, journal partially filled, gossip seeded, pantry strained,
    // promises made and kept. Then the System arrives and you FEEL it.
    debugDay7Experience() {
      const v = this.state.village;
      const s = this.state.scholar;
      if (this.state.systemArrived) {
        this.say('🐞 The System has already arrived in this run.');
        return;
      }
      this.say('🐞 DEBUG: fast-forwarding. Six days of life, compressed.');
      this.say('🐞 (Trust, names, journal, gossip — as if you lived it.)');
      const roster = (v.roster || []).filter(rid => rid !== this.villagerId);

      // 1. TRUST: six days of interaction.
      v.trust = v.trust || {};
      for (const rid of roster) {
        const temp = this.npcTemper(rid);
        const base = temp === 'warm' || temp === 'gentle' ? 35 + Math.floor(Math.random() * 25)
          : temp === 'prickly' || temp === 'withdrawn' ? 12 + Math.floor(Math.random() * 15)
          : 20 + Math.floor(Math.random() * 25);
        v.trust[rid] = Math.min(70, base);
      }
      // 2. NAMES: ~60% learned socially.
      v.knownNames = v.knownNames || {};
      const shuffled = [...roster].sort(() => Math.random() - 0.5);
      const namedCount = Math.floor(roster.length * 0.6);
      for (let i = 0; i < namedCount; i++) {
        v.knownNames[shuffled[i]] = true;
        try { this.journalLearn(shuffled[i], 'name', this.npcName(shuffled[i]), { how: 'told' }); } catch (e) {}
      }
      // 3. JOURNAL: partially filled.
      for (const rid of shuffled.slice(0, Math.floor(roster.length * 0.5))) {
        try {
          const vp = this.vpOf(rid);
          if (vp.formerOccupation) this.journalLearn(rid, 'occupation', vp.formerOccupation, { sure: Math.random() < 0.7 });
          if (Math.random() < 0.4) this.journalLearn(rid, 'goal', this.npcGoal(rid), {});
          if (Math.random() < 0.3) {
            const langs = this.levelsOf(this.npcLangs(rid));
            const langIds = Object.keys(langs);
            if (langIds.length) this.journalLearn(rid, 'language', { id: langIds[0], label: langIds[0] });
          }
        } catch (e) {}
      }
      // 4. GOSSIP: rumors floating around.
      try {
        if (roster.length >= 3) {
          this.seedGossip('generous', { who: shuffled[0] }, [shuffled[1]]);
          this.seedGossip('stingy', { who: shuffled[2] }, [shuffled[0]]);
        }
      } catch (e) {}
      // 5. LEADERSHIP: a contender has heat.
      try {
        const contenders = roster.filter(rid => this.npcGoal(rid) === 'lead');
        if (contenders.length) {
          v.leadHeat = v.leadHeat || {};
          v.leadHeat[contenders[0]] = 3 + Math.floor(Math.random() * 3);
        }
      } catch (e) {}
      // 6. PANTRY: six days of eating. Pressure is on.
      v.pantryKcal = 8000 + Math.floor(Math.random() * 4000);
      // 7. WEEK 1: you were active.
      s.week1 = { forage: 8, hunt: 3, talk: 14, cook: 4, donate: 3, scavenge: 2 };
      // 8. PLAYER: lived-in.
      s.health = 85 + Math.floor(Math.random() * 10);
      s.kcal = 1800 + Math.floor(Math.random() * 400);
      s.hydration = 70 + Math.floor(Math.random() * 20);
      s.energy = 75 + Math.floor(Math.random() * 15);
      try {
        const plants = (this.data.plants || []).slice(0, 5);
        s.codex = s.codex || {}; s.codex.plants = s.codex.plants || {};
        for (let i = 0; i < 3 && i < plants.length; i++) {
          if (plants[i]) s.codex.plants[plants[i].id] = { level: 1, encounters: 2 };
        }
      } catch (e) {}
      // 9. PROMISES: one kept, one open.
      try {
        if (roster.length >= 2) {
          this.journalLearn(shuffled[0], 'promise', { text: 'Help find their family', status: 'kept' });
          this.journalLearn(shuffled[1], 'promise', { text: 'Share food when the pantry runs low', status: 'open' });
        }
      } catch (e) {}
      // 10. It's day 7. Morning. Nobody knows what's coming.
      s.day = 7;
      s.dayTicks = 0;
      s.actionClock = 0;
      this.dayPart = 0;
      this.map.px = v.px ?? 3; this.map.py = v.py ?? 3;
      s.mx = 4; s.my = 4;
      this.ensureVillagerPositions();
      this.say('');
      this.say('— Day 7. Morning. —');
      this.say('Six days. You know some names now. The pantry is getting thin.');
      this.say('Someone is humming by the fire. It almost feels normal.');
      this.say('');
      this.say('🐞 (The System arrives the moment you take your next action. Be ready.)');
      s._day7Armed = true;
    },
    // firstAbilityChoices: 3 options based on week-1 actions + background.
    // First ability TENDS TO UTILITY (practical). Later: wacky, vile, OP, whatever.
    // Delivered with alien zeal.
    firstAbilityChoices() {
      const s = this.state.scholar;
      const w = s.week1 || {};
      const all = (this.data.abilities || []).filter(a => a.unlock && a.unlock.type === 'system_offer');
      // action thresholds
      const cond = {
        green_thumb: (w.forage || 0) >= 3,
        tracker: (w.hunt || 0) >= 2,
        diplomat: (w.talk || 0) >= 5,
        camp_cook: (w.cook || 0) >= 2,
        generous: (w.donate || 0) >= 2,
        scrounger: (w.scavenge || 0) >= 3,
        // previously unreachable first picks — now wired to sensible actions
        ant_trail: (w.scavenge || 0) >= 2,   // ants know where the sugar is; ruins have sugar
        cold_blooded: (w.forage || 0) >= 4,  // cold mornings outdoors teach efficiency
        echo_location: (w.hunt || 0) >= 3,   // tracking hones your senses
        // FRICTION INSPIRES AUGMENTATION: a week of miming and pointing
        // earns the System's translation-shaped fix.
        translator: (w.langStruggle || 0) >= 2,
      };
      // first ability: prefer UTILITY tier (practical). Later abilities can be anything.
      const utility = all.filter(a => a.tier === 'utility' && cond[a.id]);
      const choices = [];
      if (!utility.length) {
        // did nothing all week: the System improvises — 3 honest options, no random vile pick.
        choices.push(
          { id: 'survivor', name: 'Survivor', description: 'You endured. +10 max health.', flavor: 'You lived! Marginally interesting! We are SO proud!', tier: 'utility' },
          { id: 'wanderer', name: 'Wanderer', description: 'You kept moving. -10% travel cost.', flavor: 'You go places! The audience almost watched!', tier: 'utility' },
          { id: 'lucky_rock', name: 'Lucky Rock', description: 'You have a lucky rock. (+1% to everything.)', flavor: 'The rock! It is lucky! It carried you, honestly.', tier: 'underpowered' },
        );
      } else {
        for (const a of utility.slice(0, 2)) choices.push(a);
        // wild slot for the FIRST ability: wacky/underpowered only.
        // nobody's first System gift should be cannibal_frenzy. (Later: anything goes.)
        const wild = all.filter(a => a.tier === 'wacky' || a.tier === 'underpowered');
        if (wild.length && choices.length < 3) {
          const pick = wild[Math.floor(Math.random() * wild.length)];
          // don't duplicate a utility pick if the same ability is somehow in both
          if (!choices.some(c => c.id === pick.id)) choices.push(pick);
        }
      }
      // TRANSLATOR: friction inspires augmentation. If week 1 was a mime show,
      // the System pushes its fix front and center — it noticed the struggle.
      if (cond.translator) {
        const tr = all.find(a => a.id === 'translator');
        if (tr && !choices.some(c => c.id === 'translator')) {
          if (choices.length < 3) choices.push(tr);
          else choices[choices.length - 1] = tr; // bump the wild slot
        }
      }
      return choices.slice(0, 3);
    },
    // ============ RELIC BOND ============
    // Your five are bonded relics. Bond accrues passively through normal play —
    // no meters to manage, no grinding. The game notices; you don't.
    // Tools/weapons: +1/day of meaningful use. Clothing: +1/day on the trail.
    // Sentimental: +1/day simply kept close. Story moments: +3.
    // At bond 10/25/50 the System offers 1-of-3 enhancements from the class pool.

    // relicItems: all bonded relics (pack + equipped).
    relicItems() {
      const s = this.state.scholar;
      const items = (s.inventory || []).filter(i => i && i.bonded);
      for (const slot of Object.values(s.equipped || {})) {
        if (slot && slot.bonded) items.push(slot);
      }
      return items;
    },

    // noteRelicUse: mark a relic as meaningfully used today (cap 1/day is inherent).
    noteRelicUse(itemId) {
      if (!itemId) return;
      const s = this.state.scholar;
      s.relicUse = s.relicUse || {};
      s.relicUse[itemId] = true;
    },

    // noteToolUse: camp/work happened — tools and weapons earned their keep.
    noteToolUse() {
      for (const r of this.relicItems()) {
        const def = this.data.items.find(i => i.id === (r.itemId || r.id));
        const cls = def && def.class;
        if (cls === 'tool' || cls === 'weapon') this.noteRelicUse(r.itemId || r.id);
      }
    },

    // noteTrailUse: you walked the world — clothing earned its keep.
    noteTrailUse() {
      for (const r of this.relicItems()) {
        const def = this.data.items.find(i => i.id === (r.itemId || r.id));
        if (def && def.class === 'clothing') this.noteRelicUse(r.itemId || r.id);
      }
    },

    hasRelicEnhancement(id) {
      return this.relicItems().some(r => (r.enhancements || []).includes(id));
    },

    // accrueRelicBond: daily. Called during day resolution.
    accrueRelicBond() {
      const s = this.state.scholar;
      const used = s.relicUse || {};
      for (const r of this.relicItems()) {
        const id = r.itemId || r.id;
        const def = this.data.items.find(i => i.id === id);
        const cls = def && def.class;
        let gain = 0;
        if (cls === 'sentimental') gain = 1; // kept close, every day
        else if (used[id]) gain = 1; // meaningful use (1/day cap is inherent)
        if (!gain) continue;
        r.bond = (r.bond || 0) + gain;
        // Thresholds: 10 / 25 / 50. One offer at a time (UI simplicity).
        for (const t of [10, 25, 50]) {
          // No System offers before arrival — bond accrues silently, offers wait.
          if (r.bond >= t && !(r.bondOffered || []).includes(t) && !s.relicChoices && this.state.systemArrived) {
            this.offerRelicEnhancement(r, t);
            break;
          }
        }
      }
      s.relicUse = {};
    },

    // offerRelicEnhancement: the System noticed. Pick 1 of 3 from the class pool.
    // The offer is shaped by WHO YOU ARE: your personality and how you actually play
    // weight the draw. A cautious player bonding a knife sees different options than a bold one.
    // Rare enhancements only sometimes appear. Secret evolutions (bond 50) are never telegraphed —
    // nothing tells you what an item becomes. You discover it by becoming someone who would know.
    offerRelicEnhancement(item, threshold) {
      const s = this.state.scholar;
      const def = this.data.items.find(i => i.id === (item.itemId || item.id)) || {};
      // Weapons bond like tools — they draw from the tool enhancement pool.
      const cls = def.class === 'weapon' ? 'tool' : (def.class || 'tool');
      const char = (this.data.villagers || []).find(v => v.id === this.villagerId) || {};
      const personality = char.personality || {};
      const playstyle = this.dominantPlaystyle();
      const all = this.data.relicEnhancements || [];
      const byId = {}; all.forEach(e => { byId[e.id] = e; });
      // Prefer item-specific bondThresholds offers (authored), fill from class pool.
      const specific = (def.bondThresholds || []).flatMap(bt => bt.offers || []);
      const chosen = item.enhancements || [];
      const candidates = [];
      const seen = new Set();
      const pushCand = (e, weight) => {
        if (e && !chosen.includes(e.id) && !seen.has(e.id)) { seen.add(e.id); candidates.push({ e, weight }); }
      };
      for (const eid of specific) pushCand(byId[eid], 3);
      for (const e of all) {
        if (e.class !== cls || e.secret) continue; // secret evolutions never appear in the normal pool
        if (e.hidden && Math.random() > (e.rare ?? 0.3)) continue; // rare: sometimes not on the table
        let w = 1;
        const aff = e.affinity || {};
        if (aff.temperament && personality.temperament === aff.temperament) w += 3;
        if (aff.sharing && personality.sharing === aff.sharing) w += 2;
        if (aff.playstyle && playstyle && playstyle === aff.playstyle) w += 3;
        pushCand(e, w);
      }
      // weighted sample of 3
      const options = [];
      const bag = [...candidates];
      while (options.length < 3 && bag.length) {
        const total = bag.reduce((t, c) => t + c.weight, 0);
        let roll = Math.random() * total, idx = 0;
        while (idx < bag.length - 1 && roll > bag[idx].weight) { roll -= bag[idx].weight; idx++; }
        options.push(bag.splice(idx, 1)[0].e);
      }
      // SECRET EVOLUTION: at bond 50, some items become something amazing.
      // Not always. Never announced beforehand. A fourth option, unnamed.
      let secretOpt = null;
      if (threshold >= 50 && def.secretEvolution && !chosen.includes(def.secretEvolution) && Math.random() < 0.65) {
        secretOpt = byId[def.secretEvolution] || null;
      }
      if (!options.length && !secretOpt) return; // nothing new to offer
      const opts = options.slice(0, 3).map(e => ({
        id: e.id, name: e.name, description: e.description,
        systemCommentary: e.systemCommentary,
      }));
      if (secretOpt) {
        opts.push({
          id: secretOpt.id, name: '???',
          description: 'Something is different about it. The System has gone quiet. That never happens.',
          systemCommentary: secretOpt.systemCommentary,
          secret: true, secretName: secretOpt.name, secretDesc: secretOpt.description,
        });
        this.say(`🌟 "Unit ${String(item.name || 'ITEM').toUpperCase()} — [ANOMALY] — we cannot classify what is happening. Choose carefully."`);
      } else {
        this.say(`🌟 "We have detected elevated attachment to Unit ${String(item.name || 'ITEM').toUpperCase()}. This is inefficient. This is also... [PROCESSING] ...valuable? Optimization available." (Choose an enhancement for your ${item.name}.)`);
      }
      s.relicChoices = {
        itemId: item.itemId || item.id,
        itemName: item.name,
        threshold,
        options: opts,
      };
    },

    // chooseRelicEnhancement: player picks from the System's offer.
    chooseRelicEnhancement(id) {
      const s = this.state.scholar;
      const rc = s.relicChoices;
      if (!rc) return null;
      const opt = (rc.options || []).find(o => o.id === id);
      if (!opt) return null;
      const item = this.relicItems().find(r => (r.itemId || r.id) === rc.itemId);
      if (item) {
        item.enhancements = item.enhancements || [];
        item.enhancements.push(id);
        item.bondOffered = item.bondOffered || [];
        item.bondOffered.push(rc.threshold);
      }
      s.relicChoices = null;
      // secret evolutions reveal their true name only when chosen — the discovery is the reward
      const realName = opt.secret ? (opt.secretName || opt.name) : opt.name;
      const realDesc = opt.secret ? (opt.secretDesc || opt.description) : opt.description;
      this.say(`✨ ${rc.itemName} — ${realName}. ${realDesc}`);
      if (opt.secret) this.say(`You had no idea it could become this. That's the point. Nobody told you.`);
      if (opt.systemCommentary) this.say(`"${opt.systemCommentary}"`);
      return null;
    },

    // chooseAbility: player picks from the System's offer.
    chooseAbility(id) {
      const s = this.state.scholar;
      const choice = (s.abilityChoices || []).find(c => c.id === id);
      if (!choice) return null;
      s.abilities = s.abilities || [];
      // Ability slots: integration unlocks more. Start 1, max 6.
      const maxSlots = this.abilitySlots();
      if (s.abilities.length >= maxSlots) {
        this.say(`No free ability slots (${s.abilities.length}/${maxSlots}). Increase System integration to unlock more.`);
        return null;
      }
      s.abilities.push({ id: choice.id, name: choice.name, desc: choice.description || choice.desc, level: 1, xp: 0 });
      // ON-ACQUIRE: some abilities change the world the moment you take them.
      this.abilityOnAcquire(choice.id);
      // SYNERGIES: new ability might resonate with something you already hold.
      this.recomputeActiveSynergies();
      s.abilityChoices = null;
      this.say(`✨ Ability gained: ${choice.name} (L1). ${choice.description || choice.desc}`);
      if (choice.flavor) this.say(`"${choice.flavor}"`);
      this.say(`"We've been watching you figure things out all week! This one's on us — a head start! But the REAL power? That comes from UNDERSTANDING. Use it! Learn it! The gamblers are watching!"`);
      return null;
    },
    // abilityOnAcquire: the price is paid up front, where the fiction demands it.
    abilityOnAcquire(id) {
      const s = this.state.scholar;
      const v = this.state.village; v.trust = v.trust || {};
      const trustAll = (amt, why) => {
        for (const vid of Object.keys(v.trust)) v.trust[vid] = Math.max(0, (v.trust[vid] || 15) + amt);
        this.say(why);
      };
      if (id === 'pact') {
        // The Static gives. The Static takes.
        const ops = (this.data.abilities || []).filter(a => a.tier === 'overpowered' && a.id !== 'pact' && !this.hasAbility(a.id));
        const utils = (s.abilities || []).filter(e => {
          const a = this.data.abilities.find(x => x.id === ((e && e.id) || e));
          return a && a.tier === 'utility';
        });
        if (ops.length) {
          const gain = ops[Math.floor(Math.random() * ops.length)];
          s.abilities.push({ id: gain.id, name: gain.name, desc: gain.description, level: 1, xp: 0 });
          this.say(`PACT: the Static gives — ${gain.name}.`);
        }
        if (utils.length) {
          const lose = utils[Math.floor(Math.random() * utils.length)];
          const lid = (lose && lose.id) || lose;
          s.abilities = s.abilities.filter(e => ((e && e.id) || e) !== lid);
          const lname = ((this.data.abilities || []).find(a => a.id === lid) || {}).name || lid;
          this.say(`PACT: the Static takes — ${lname} is gone.`);
          this.recomputeActiveSynergies();
        }
      } else if (id === 'chitin_skin') {
        trustAll(-5, 'Your skin hardens into plates. People stare. (chitin_skin: trust -5, they notice)');
      } else if (id === 'fear_aura') {
        trustAll(-10, 'The air goes cold around you. People step back. (fear_aura: trust -10)');
      } else if (id === 'hive_mind') {
        trustAll(-10, 'You know what everyone is doing. They can feel you knowing. (hive_mind: trust -10)');
        // the map opens. Every tile revealed — you see the whole board.
        for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) this.reveal(x, y);
        this.say('HIVE MIND: the map is open. Every tile, revealed. They know you\'re watching.');
      }
    },

    // activatableAbilities: abilities you CHOOSE to use (not passive).
    // Shown in the inventory popup. Explicit activation, real costs.
    activatableAbilities() {
      const s = this.state.scholar;
      const out = [];
      const has = (id) => this.hasAbility(id);
      if (has('blood_magic')) { const bc = this.hasSynergy('crimson_circuit') ? 7 : 10; out.push({ id: 'blood_magic', target: 'self', name: 'Blood Price', desc: `-${bc} HP → +500 kcal. Your body eats itself.`, available: (s.health || 0) > bc, why: `Too weak — need ${bc}+ HP.` }); }
      if (has('time_skip')) out.push({ id: 'time_skip', target: 'none', name: 'Time Skip', desc: 'Skip to the next day part instantly. Ages you 1 day.', available: true });
      if (has('dowsing')) out.push({ id: 'dowsing', target: 'none', name: 'Dowse', desc: 'A forked stick twitches toward water. 70% accurate.', available: true });
      if (has('echo_location')) out.push({ id: 'echo_location', target: 'none', name: 'Echo-locate', desc: 'Clap once: sense the 3x3 around you. 1/day.', available: s.echoDay !== s.day, why: 'Used today.', combat: true });
      // HEALING (Steve 2026-10-05): problems need answers. Field medicine heals,
      // herbal remedy cures disease, purify neutralizes poison.
      if (has('field_medicine')) {
        const used = s.fieldMedDayPart === `${s.day}-${this.dayPart}`;
        out.push({ id: 'field_medicine', target: 'self', name: 'Field Medicine', desc: 'Heal 20 HP. Once per day part.', available: !used && (s.health || 0) < this.maxHealth(), why: used ? 'Used this day part.' : 'Already at full health.', combat: true });
      }
      if (has('herbal_remedy')) {
        const sick = (s.diseases || []).length > 0;
        out.push({ id: 'herbal_remedy', target: 'self', name: 'Herbal Remedy', desc: 'Cure disease. Knowledge of plants.', available: sick && s.herbalDay !== s.day, why: !sick ? 'Not sick.' : 'Used today.' });
      }
      if (has('purify')) {
        const poisoned = (s.poisons || []).length > 0;
        out.push({ id: 'purify', target: 'self', name: 'Purify', desc: 'Neutralize poison. Charcoal and clean water.', available: poisoned && s.purifyDay !== s.day, why: !poisoned ? 'Not poisoned.' : 'Used today.' });
      }
      if (has('compost_king')) {
        const food = (s.inventory || []).find(i => (i.kcalEach || 0) > 0);
        out.push({ id: 'compost_king', target: 'none', name: 'Bury Food', desc: 'Bury food as fertilizer: +10% forage on this tile.', available: !!food, why: 'No food to bury.' });
      }
      if (has('cannibal_frenzy')) out.push({ id: 'cannibal_frenzy', target: 'self', name: 'Feed the Red Hunger', desc: '+1000 kcal. -30 trust, permanently. Only when starving.', available: (s.kcal || 0) < 500, why: 'Only when starving (<500 kcal).' });
      return out;
    },

    // activateAbility: do the thing. Costs are real.
    // target: optional villager id or {cx, cy} for abilities that need aiming.
    // Declared in activatableAbilities() as target: 'villager' | 'cell' | 'monster' | 'self' | 'none'.
    activateAbility(id, target) {
      const s = this.state.scholar;
      // SYNERGY: activatable use logged for discovery.
      this.noteAbilityUse(id);
      // ACTION CLOCK: activating a power takes a moment of focus (2 ticks, time-only).
      // Sustained powers (time_skip) cost more — declared at their branch.
      // Effort kcal / metabolic upkeep are the other two costs (see metabolicDaily).
      this.tickAction(2);
      if (id === 'blood_magic') {
        const cost = this.hasSynergy('crimson_circuit') ? 7 : 10;
        if ((s.health || 0) <= cost) { this.say('Too weak for the Blood Price.'); return null; }
        s.health -= cost; s.kcal += 500;
        this.say(`BLOOD PRICE: -${cost} HP, +500 kcal. Your body eats itself. Efficient. Horrifying.${cost < 10 ? ' (Crimson Circuit: the circuit closes, the price drops.)' : ''}`);
      } else if (id === 'time_skip') {
        s.ageDebt = (s.ageDebt || 0) + 1;
        this.say('TIME SKIP: the light stutters. You are a day older. The time had to come from somewhere.');
        return this.endDayPart();
      } else if (id === 'dowsing') {
        // SYNERGY: stormcaller — dowsing in the rain counts as rain_dancer use too.
        if (this.state.weather === 'rain') this.noteAbilityUse('rain_dancer');
        // 70%: reveal the nearest water tile. Nobody knows why it works. Including us.
        let best = null, bestD = 99;
        for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
          const t = this.tileAt(x, y);
          if (t.type === 'creek' || t.type === 'wetland') {
            const d = Math.abs(x - this.map.px) + Math.abs(y - this.map.py);
            if (d < bestD) { bestD = d; best = { x, y }; }
          }
        }
        if (best && Math.random() < 0.7) {
          this.reveal(best.x, best.y);
          const dir = best.y < this.map.py ? 'north' : best.y > this.map.py ? 'south' : best.x < this.map.px ? 'west' : 'east';
          this.say(`The stick twitches — water, ${dir}. ${bestD} tiles. (dowsing)`);
        } else this.say('The stick is still. Either no water near, or it\'s lying. (dowsing failed)');
      } else if (id === 'echo_location') {
        if (s.echoDay === s.day) { this.say('Already echoed today.'); return null; }
        s.echoDay = s.day;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = this.map.px + dx, ny = this.map.py + dy;
          if (nx >= 0 && nx < 7 && ny >= 0 && ny < 7) this.reveal(nx, ny);
        }
        this.say('You clap once. The echo comes back with the shape of the land — 3x3 revealed. (echo_location)');
      } else if (id === 'field_medicine') {
        const key = `${s.day}-${this.dayPart}`;
        if (s.fieldMedDayPart === key) { this.say('Already used field medicine this day part.'); return null; }
        s.fieldMedDayPart = key;
        const heal = 20;
        // COST: healing burns calories. No free lunch — prevents Blood Magic infinite loop.
        // (Blood Magic: -10 HP → +500 kcal. Without a heal cost, that's infinite food.)
        const healCost = 100;
        if ((s.kcal || 0) < healCost) { this.say(`Too hungry to heal — need ${healCost} kcal.`); return null; }
        s.kcal -= healCost;
        s.health = Math.min(this.maxHealth(), (s.health || 0) + heal);
        this.say(`Field medicine: clean the wound, poultice it, bind it. +${heal} HP, -${healCost} kcal.`);
      } else if (id === 'herbal_remedy') {
        if (s.herbalDay === s.day) { this.say('Already used herbal remedy today.'); return null; }
        if (!(s.diseases || []).length) { this.say('Not sick.'); return null; }
        s.herbalDay = s.day;
        s.diseases = [];
        this.say('Herbal remedy: bitter tea, steam, rest. The fever breaks.');
      } else if (id === 'purify') {
        if (s.purifyDay === s.day) { this.say('Already purified today.'); return null; }
        if (!(s.poisons || []).length) { this.say('Not poisoned.'); return null; }
        s.purifyDay = s.day;
        s.poisons = [];
        this.say('Purify: charcoal, clean water, time. The poison leaves your system.');
        const idx = (s.inventory || []).findIndex(i => (i.kcalEach || 0) > 0);
        if (idx === -1) { this.say('No food to bury.'); return null; }
        const it = s.inventory[idx];
        it.units -= 1; if (it.units <= 0) s.inventory.splice(idx, 1);
        this.playerTile().compost = true;
        this.say(`You bury ${it.name}. The tile will remember. (+10% forage here. compost_king)`);
      } else if (id === 'cannibal_frenzy') {
        if ((s.kcal || 0) >= 500) { this.say('The Red Hunger sleeps. You are not starving enough.'); return null; }
        s.kcal += 1000;
        const v = this.state.village; v.trust = v.trust || {};
        for (const vid of Object.keys(v.trust)) v.trust[vid] = Math.max(0, (v.trust[vid] || 15) - 30);
        this.say('RED HUNGER: you eat what you should not. +1000 kcal. Everyone saw. Trust -30, permanently.');
      }
      return null;
    },

    // abilitySlots: how many abilities can you hold? Integration-based.
    abilitySlots() {
      const integ = this.state.scholar.integration || 5;
      if (integ >= 80) return 6;
      if (integ >= 60) return 4;
      if (integ >= 40) return 3;
      if (integ >= 20) return 2;
      return 1;
    },
    // abilityXP: using an ability (or its related action) grants XP. Level up at thresholds.
    // L1 -> L2: 10 uses. L2 -> L3: 25 uses. L3 is max (for now — evolution coming).
    gainAbilityXP(abilityId, amount) {
      const s = this.state.scholar;
      // SYNERGY: every ability use is a potential resonance attempt.
      this.noteAbilityUse(abilityId);
      // Check both background and System abilities.
      const ab = (s.backgroundAbilities || []).find(a => a.id === abilityId) ||
                 (s.abilities || []).find(a => a.id === abilityId);
      if (!ab || ab.level >= 3) return;
      ab.xp = (ab.xp || 0) + (amount || 1);
      const need = ab.level === 1 ? 10 : 25;
      if (ab.xp >= need) {
        ab.level++;
        ab.xp = 0;
        const bonus = this.abilityLevelBonus(ab.id, ab.level);
        this.say(`⬆️ ${ab.name} deepened to L${ab.level}! ${bonus}`);
        // The System finds your growing comprehension entertaining. The gamblers agree.
        const insights = [
          `"Oh! OH! You're starting to GET it! The audience loves the little ah-ha moments! The odds just shifted!"`,
          `"We didn't even explain that part! You figured it out yourself! That's the good stuff! The gamblers are thrilled!"`,
          `"Your understanding is... deepening! We can see it! Like watching a seed decide to be a tree! Beautiful! Profitable!"`,
          `"Yes! YES! That's the comprehension we calibrated for! Keep going! The sponsors are doubling down!"`,
        ];
        this.say(insights[Math.floor(Math.random() * insights.length)]);
        // SYNERGIES: a deepened ability might wake a new resonance.
        this.recomputeActiveSynergies();
      }
    },
    // abilityLevelBonus: what does leveling up give? (Per ability.)
    abilityLevelBonus(id, level) {
      const bonuses = {
        green_thumb: { 2: '+100% yield (was +50%).', 3: 'You sense rich ground. Forage spots glow.' },
        tracker: { 2: '+50% hunt success (was +30%).', 3: 'You see tracks from 2 tiles away.' },
        diplomat: { 2: 'Trust builds 3x (was 2x).', 3: 'Villagers tell you secrets unprompted.' },
        camp_cook: { 2: 'No water needed for cooking.', 3: '+25% kcal (was +10%).' },
      };
      return (bonuses[id] && bonuses[id][level]) || 'Stronger. The System is pleased.';
    },
    scheduleSystemEvents() {
      const s = this.state.scholar;
      s.timedEvents = s.timedEvents || [];
      s.timedEvents.push({ day: 8, type: 'challenge', id: 'first_hunt', done: false });
      s.timedEvents.push({ day: 9, type: 'drama', id: 'stranger', done: false });
      s.timedEvents.push({ day: 10, type: 'monster', id: 'hushwolf_pack', done: false });
      s.timedEvents.push({ day: 12, type: 'quest', id: 'system_task', done: false });
      // JACKPOT: knowledgeable stranger. Rare, exciting, memorable.
      // Not scheduled — random chance each day after day 5 (5% per day).
      // "Occasionally you hit a vein."
    },

    // maybeJackpotStranger: daily roll for a knowledgeable stranger encounter.
    // Called from endDay. Rare — that's what makes it a jackpot.
    maybeJackpotStranger() {
      if (this.state.scholar.day < 5) return;
      if (Math.random() > 0.05) return; // 5% per day
      // don't repeat too often
      const last = this.state.village.lastStrangerJackpot || 0;
      if (this.state.scholar.day - last < 7) return;
      this.state.village.lastStrangerJackpot = this.state.scholar.day;
      this.jackpot('stranger');
    },
    checkTimedEvents() {
      const s = this.state.scholar;
      if (!s.timedEvents) return;
      for (const ev of s.timedEvents) {
        if (!ev.done && s.day >= ev.day) {
          ev.done = true;
          this.triggerEvent(ev);
        }
      }
    },
    triggerEvent(ev) {
      if (ev.id === 'first_hunt') {
        this.say('\u{1F4E2} SYSTEM CHALLENGE: "Catch something! Anything! We want to see how you do it!" (Hunt an animal today for a reward.)');
        this.state.scholar.activeChallenge = { id: 'first_hunt', desc: 'Hunt an animal', reward: 'Ability point' };
      } else if (ev.id === 'stranger') {
        this.say('\u{1F6B6} A stranger walks into Haven. They\'re thin, scared, and carrying nothing. "Please," they say. "I heard you have food." (Drama: do you share?)');
        // mediator: peace is a skill. You talk the village through it.
        if (this.hasAbility('mediator')) {
          const bonus = Math.round(this.modTarget('drama.resolve_bonus', 8));
          const v = this.state.village; v.trust = v.trust || {};
          for (const vid of Object.keys(v.trust)) v.trust[vid] = Math.min(100, (v.trust[vid] || 15) + bonus);
          this.say(`You sit everyone down. You listen. Nobody yells. (mediator: village trust +${bonus})`);
          this.noteAbilityUse('mediator');
        }
      } else if (ev.id === 'hushwolf_pack') {
        this.say('\u{1F43A} HOWLS in the distance. Closer than before. The System chirps: "Oh! We made those! Are they... too many? We can make fewer?" (New monster: hushwolf pack.)');
      } else if (ev.id === 'system_task') {
        this.say('\u{1F4DC} SYSTEM QUEST: "We\'ve been thinking. You know things we don\'t. Teach us? Bring us a plant you\'ve fully identified (Codex L3)."');
        this.state.scholar.activeQuest = { id: 'system_task', desc: 'Bring a fully-identified plant (L3) to the System' };
      }
    },

    // CODEX NETWORKING: codexes talk within friendly organizations.
    // KNOWLEDGE HAS TWO PARTS:
    // --- pack weight: 15 kg. distance has a price; so does carrying. ---
    packCapacity() { return this.carryCapacity(); },
    packWeight() {
      // hollow_bones: birdlike bones — you weigh 30% less for carry calculations.
      const raw = this.state.scholar.inventory.reduce((t, i) => t + (i.units * (i.kg || 0.1)), 0);
      // water has mass: 1L = 1kg. it counts.
      const waterKg = (this.state.scholar.water || []).reduce((t, b) => t + (b.liters || 1), 0);
      return (raw + waterKg) * this.modTarget('carry.weight_mult', 1);
    },
    canCarry(kg) { return this.packWeight() + kg <= this.packCapacity(); },

    // --- actions: each one consumes the day-part and advances time ---
    // bumpPlantFamiliarity: handling a plant builds RECOGNITION, never naming.
    // Returns {encounters, threshold, familiar}. Identification happens at the
    // camp ritual (sortBag), by teaching, testing, or books — never in the field.
    // (This replaces the old field-identify: foraging yields unknowns, period.)
    bumpPlantFamiliarity(pid, plant) {
      const villager = this.data.villagers.find(v => v.id === this.villagerId);
      const homeRegion = (villager && villager.homeRegion || '').toLowerCase();
      const originTags = ((villager && villager.originTags) || this.parseOrigin(homeRegion).tags).map(t => String(t).toLowerCase());
      const plantRegions = (plant.regions || []).map(x => String(x).toLowerCase());
      const tagLocal = plantRegions.some(pr => originTags.includes(pr));
      const legacyLocal = plantRegions.some(pr => homeRegion.includes(pr) || pr.includes(homeRegion.split(' ')[0]));
      const isLocal = tagLocal || legacyLocal;
      const occupation = (villager && villager.formerOccupation || '').toLowerCase();
      let threshold = Math.max(1, Math.round(this.modTarget('forage.learn_threshold', 3)));
      if (occupation.includes('hunter') || occupation.includes('cook') || occupation.includes('chef')) threshold = 2;
      if (occupation.includes('nurse') && plant.medicinal) threshold = 2;
      if (occupation.includes('bus driver') || occupation.includes('accountant') || occupation.includes('dropout')) threshold = 4;
      this.state.codex.encounters = this.state.codex.encounters || {};
      const enc = this.state.codex.encounters[pid] || 0;
      const newEnc = enc === 0 && isLocal ? 1 : enc + 1;
      this.state.codex.encounters[pid] = newEnc;
      this.state.codex.learnThreshold = this.state.codex.learnThreshold || {};
      if (!this.state.codex.learnThreshold[pid]) this.state.codex.learnThreshold[pid] = threshold;
      return { encounters: newEnc, threshold, familiar: newEnc >= threshold };
    },
    doAction(kind, opts) {
      if (this.over) return null;
      const scholar = this.state.scholar;
      let msg = '';
      if (kind !== 'forage') this._packFullStreak = 0; // guidance streak is per-stuck-episode
      if (kind === 'forage') {
        const t = this.playerTile();
        // PHYSICAL: you work the patch around you (area sweep below). Walk to
        // the green, then take it. The world is not a slot machine.
        // TAP = step there: _cellInteract passes the tapped cell; stepping
        // onto it centers the sweep where you pointed. The tap already checked
        // adjacency ("Too far. Step closer."), so this is always 1 step.
        // Steps don't cost time — the ACTION does.
        if (opts && opts.cx !== undefined && opts.cy !== undefined) {
          const px0 = scholar.mx ?? 4, py0 = scholar.my ?? 4;
          if (Math.max(Math.abs(opts.cx - px0), Math.abs(opts.cy - py0)) <= 1) {
            scholar.mx = opts.cx; scholar.my = opts.cy;
          }
        }
        const mx = scholar.mx ?? 4, my = scholar.my ?? 4;
        const detail = this.genDetail(this.map.px, this.map.py);
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
              // ACTION CLOCK: searching a ruin = 2 chunks (64 ticks) + 100 kcal effort.
              scholar.kcal = Math.max(0, (scholar.kcal || 0) - 100);
              return this.tickAction(64) || this.status();
            }
            this.say('Picked clean. The houses fed someone — not you.'); return null;
          }
          const lootId = t.loot.shift();
          if (this.state.scholar.week1) this.state.scholar.week1.scavenge++;
          this.gainAbilityXP('scrounger', 1);
          // SYNERGY passive: grave_robber works the same ruins.
          this.noteAbilityUse('grave_robber');
          this.noteToolUse(); // RELIC BOND: prying, cutting, carrying.
          const item = SCAVENGED.find(s => s.id === lootId);
          if (!this.canCarry(item.kg)) { t.loot.unshift(lootId); this.say('Too heavy — your pack can\'t take it. Eat something or leave it.'); return null; }
          scholar.inventory.push({ plantId: lootId, units: 1, kcalEach: item.kcal, spoilDay: 9999, name: item.name, unit: 'can', prep: 'No prep. The miracle of the can.', kg: item.kg });
          // scrounger: the System's gift. You see what others miss — +1 item per visit.
          if (this.hasAbility('scrounger') && t.loot.length) {
            const lootId2 = t.loot.shift();
            const item2 = SCAVENGED.find(s => s.id === lootId2);
            if (item2 && this.canCarry(item2.kg)) {
              scholar.inventory.push({ plantId: lootId2, units: 1, kcalEach: item2.kcal, spoilDay: 9999, name: item2.name, unit: 'can', prep: 'No prep. The miracle of the can.', kg: item2.kg });
              this.say(`Scrounger: you spot another — ${item2.name}.`);
            } else if (item2) {
              t.loot.unshift(lootId2); // too heavy, leave it
            }
          }
          // taste_vision: the walls taste like secrets. Bonus finds in ruins.
          const findMult = this.modTarget('ruin.find_mult', 1);
          if (findMult > 1 && t.loot.length && Math.random() < 0.3 * findMult) {
            const bonusId = t.loot.shift();
            const bonus = SCAVENGED.find(x => x.id === bonusId);
            if (bonus && this.canCarry(bonus.kg)) {
              scholar.inventory.push({ plantId: bonusId, units: 1, kcalEach: bonus.kcal, spoilDay: 9999, name: bonus.name, unit: 'can', prep: 'No prep.', kg: bonus.kg });
              this.say(`Taste vision: behind the loose panel — ${bonus.name}. The walls were right.`);
            } else if (bonus) t.loot.unshift(bonusId);
          }
          scholar.kcal -= 100;
          msg = `You pry open a cupboard: ${item.name} (+${item.kcal} kcal). ${item.text}` + (t.loot.length ? '' : ' That\'s everything. This house is done.');
          this.say(msg);
          this.tele('scavenge', { item: item.name, kcal: item.kcal, lootLeft: t.loot.length, packKg: Math.round(this.packWeight() * 10) / 10 });
          // ACTION CLOCK: searching a ruin = 2 chunks (64 ticks). 100 kcal effort above.
          return this.tickAction(64) || this.status();
        }
        if (!S.forage.canForage(t)) { this.say('Nothing left to take here today.'); return null; }
        // AREA SWEEP (Steve): forage is an area action, not a tile action. One
        // press works the patch around you — your cell + the 8 around it. The
        // yield is whatever's actually there; the game knows every species,
        // you may not. KNOWLEDGE IS TACTICAL: stand near plants you've
        // identified as good and the sweep is deliberate. Forage blind and you
        // get whatever's green — maybe nothing worth eating.
        const bounty = this.bountyFor(this.map.px, this.map.py);
        const thumbLvl = this.abilityLevel('green_thumb');
        const thumbMult = thumbLvl >= 2 ? 2.0 : thumbLvl >= 1 ? 1.5 : 1.0;
        const FORAGEABLE = { plant: 1, bush: 1, tree: 1, bigtree: 1 };
        const harvested = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const cx = mx + dx, cy = my + dy;
          if (cx < 0 || cx > 8 || cy < 0 || cy > 8) continue;
          const c = detail[cy] && detail[cy][cx];
          if (!FORAGEABLE[c] || this.cellScorched(cx, cy)) continue;
          const dk = cx + ',' + cy;
          if (t.detailRegrow && t.detailRegrow[dk]) continue; // picked clean, regrowing
          const pid = this.cellPlantSpecies(t, cx, cy, c);
          if (!pid) {
            // WOOD (Steve: every forageable has some use, even if minor):
            // pines and other trees with no food species still give deadfall —
            // branches for the fire, bark fiber for cordage. Never a dead end.
            if (c === 'tree' || c === 'bigtree') {
              harvested.push({ x: cx, y: cy, cell: c, wood: true });
            }
            continue;
          }
          const plant = this.data.plants.find(pp => pp.id === pid);
          if (!plant) continue;
          harvested.push({ x: cx, y: cy, cell: c, plantId: pid, plant });
        }
        if (!harvested.length) {
          // PATCH HONESTY (forager loop 2026-10-05): the sweep found nothing,
          // but the tile may still have green patches elsewhere. Don't send
          // the player off ground that still has food — point at the next patch.
          let otherGreen = false;
          for (let oy = 0; oy < 9 && !otherGreen; oy++) for (let ox = 0; ox < 9; ox++) {
            const c2 = detail[oy] && detail[oy][ox];
            if (!FORAGEABLE[c2] || this.cellScorched(ox, oy)) continue;
            if (t.detailRegrow && t.detailRegrow[ox + ',' + oy]) continue;
            otherGreen = true; break;
          }
          this.say(otherGreen
            ? 'This patch is worked out — step to another green patch and forage again.'
            : 'Nothing within reach. Walk to the green first.');
          return null;
        }
        const estKg = Math.round(harvested.length * 4 * 0.1 * 10) / 10;
        // PACK-FULL STREAK (forager loop 2026-10-05): the first block explains
        // the real options; repeats stay short. Fifty identical lectures is
        // chores, not guidance.
        if (!this.canCarry(estKg)) {
          const streak = (this._packFullStreak || 0) + 1;
          this._packFullStreak = streak;
          this.say(streak === 1
            ? 'Your pack is full. Eat something, test a lump from your pack, or leave some for the woods.'
            : 'Still full. (Eat, test a lump, or leave some.)');
          return null;
        }
        this._packFullStreak = 0;
        t.stock = Math.max(0, (t.stock || 0) - harvested.length);
        // harvest each cell: deplete it (3-day regrow), accrue familiarity,
        // aggregate by species. Familiarity NEVER identifies — the camp ritual
        // names; handling only teaches your hands.
        const bySpecies = {};
        const famNotes = [];
        let woodSticks = 0, woodFiber = 0;
        for (const h of harvested) {
          detail[h.y][h.x] = (h.cell === 'plant') ? 'dirt' : h.cell;
          t.detailRegrow = t.detailRegrow || {};
          t.detailRegrow[h.x + ',' + h.y] = { day: scholar.day + 2, was: h.cell };
          if (h.wood) {
            // DEADFALL: no species, no knowledge — but branches for the fire
            // and bark fiber for cordage. The stand recovers like everything else.
            const sticks = 1 + (Math.random() < 0.5 ? 1 : 0);
            for (let i = 0; i < sticks; i++) scholar.inventory.push({ material: 'stick', units: 1, name: 'Stick', kcalEach: 0, spoilDay: 9999, kg: 0.2 });
            woodSticks += sticks;
            if (Math.random() < 0.25) {
              scholar.inventory.push({ material: 'fiber', units: 1, name: 'Plant fiber', kcalEach: 0, spoilDay: 9999, kg: 0.1 });
              woodFiber++;
            }
            continue;
          }
          const fam = this.bumpPlantFamiliarity(h.plantId, h.plant);
          const entry = (this.state.codex.plants || {})[h.plantId];
          const levelMult = !entry ? 1.0 : entry.level >= 4 ? 2.0 : entry.level >= 2 ? 1.5 : 1.0;
          let units = 3 + Math.floor(Math.random() * 3); // 3-5 per cell: a sweep, not a strip
          // MULTITOOL (Steve 2026-10-05): "+1 to foraging yields" — honest now.
          const toolMult = this.hasItem('multitool') ? 1.25 : 1.0;
          units = Math.ceil(units * levelMult * thumbMult * toolMult);
          // deeper knowledge accrues only for identified plants — handling
          // unknowns teaches care, not parts.
          if (entry && fam.familiar) {
            entry.harvests = (entry.harvests || 0) + 1;
            if (entry.level === 1 && entry.harvests >= 5) {
              entry.level = 2;
              this.say(`\u2605 Deeper knowledge: ${h.plant.name}. ${h.plant.knowledgeLevels['2']} (Yield +50%). Use unlocked: ${this.plantUsesText(h.plantId) || 'not yet'}.`);
            }
            if (entry.level === 3 && entry.harvests >= 15) {
              entry.level = 4;
              this.say(`\u2605\u2605 MASTERY: ${h.plant.name}. ${h.plant.knowledgeLevels['4']} (Yield 2x)`);
              if (this.state.systemArrived) this.say('SYSTEM: You know this plant the way it knows itself. Concerning. Impressive.');
            }
          }
          const e = bySpecies[h.plantId] || (bySpecies[h.plantId] = { plant: h.plant, units: 0, known: this.plantKnown(h.plantId) });
          e.units += units;
          if (!e.known && !famNotes.includes(h.plantId)) {
            if (fam.encounters === 1) famNotes.push(h.plantId);
            else if (fam.encounters === fam.threshold - 1) famNotes.push('~' + h.plantId);
          }
          t.speciesSeen = t.speciesSeen || {};
          const ps = t.speciesSeen[h.plantId] || { n: 0 };
          t.speciesSeen[h.plantId] = { day: scholar.day, n: ps.n + 1 };
        }
        for (const fn of famNotes) {
          const pid = fn.startsWith('~') ? fn.slice(1) : fn;
          const pl = this.data.plants.find(pp => pp.id === pid);
          const formName = (this.lumpFormName ? this.lumpFormName(pl) : null) || 'unfamiliar shoots';
          if (fn.startsWith('~')) this.say(`Some of these ${formName} are starting to look familiar — sort them at camp in good light and the name might come to you.`);
          else this.say(`Unfamiliar ${formName} — into the bag. (Unknowns lump together; sort them at camp.)`);
        }
        // pack it: known species → named haul (you knew what you were taking).
        // Unknown → the lump. The bag is honest about what you don't know.
        const packedBits = [];
        let totalKcalKnown = 0;
        for (const pid of Object.keys(bySpecies)) {
          const e = bySpecies[pid];
          const kcal = e.units * e.plant.caloriesPerUnit;
          if (e.known) {
            const item = this.foodForageItem(e.plant, true, e.units, kcal, scholar.day);
            scholar.inventory.push(item);
            packedBits.push(`${e.units}\u00d7 ${e.plant.name}`);
            totalKcalKnown += kcal;
          } else {
            this.addUnknownToLump(e.plant, e.units, scholar.day);
            packedBits.push(`${e.units}\u00d7 ${this.lumpFormName(e.plant)}`);
          }
        }
        // RELIC BOND: tools cut, clothing kept you moving.
        this.noteToolUse(); this.noteTrailUse();
        // MATERIALS: vine from bush, stick from tree — you don't just get food.
        for (const h of harvested) {
          if (h.cell === 'bush' && Math.random() < 0.3) {
            scholar.inventory.push({ material: 'vine', units: 1, name: 'Vine', kcalEach: 0, spoilDay: 9999, kg: 0.1 });
            this.say('You also take some vine (crafting material).');
          }
          if ((h.cell === 'tree' || h.cell === 'bigtree') && Math.random() < 0.4) {
            scholar.inventory.push({ material: 'stick', units: 1, name: 'Stick', kcalEach: 0, spoilDay: 9999, kg: 0.2 });
            this.say('A sturdy stick (crafting material).');
          }
        }
        // squirrel_friend: sometimes they leave you nuts. Random gifts, real food.
        const giftChance = this.modTarget('forage.gift_chance', 0);
        if (giftChance > 0 && Math.random() < giftChance) {
          scholar.inventory.push({ plantId: 'hickory_nut', units: 2, kcalEach: 100, spoilDay: scholar.day + 5, name: 'Squirrel gift (hickory nuts)', unit: 'handful', prep: 'A squirrel left these. A tip? A bribe? Nuts.', kg: 0.2 });
          this.say('A squirrel drops nuts at your feet and vanishes. A gift. (squirrel_friend: +200 kcal)');
        }
        // pattern_recognition: the sharp-eyed find the odd one.
        const rareChance = S.modifiers.resolve(0, 'forage.rare_find_chance', S.modifiers.collectModifiers(scholar, this.data.abilities), {});
        if (rareChance > 0 && Math.random() < rareChance) {
          const rp = this.data.plants.find(pp => pp.id === 'rare_herb');
          if (rp && !this.plantKnown(rp.id)) {
            this.addUnknownToLump(rp, 1, scholar.day);
            this.say('Something unusual in the undergrowth — carefully into the bag. You\'ll know it when someone names it.');
          } else if (rp) {
            scholar.inventory.push({ plantId: 'rare_herb', units: 1, kcalEach: 300, spoilDay: scholar.day + 4, name: this.plantKnown('rare_herb') ? rp.name : (rp.description || 'unfamiliar plant'), unit: 'bundle', prep: 'Potent. The Codex is interested.', kg: 0.3 });
          }
        }
        scholar.kcal -= S.calories.ACTION_COSTS.forage;
        // THE MESSAGE: honest. Named hauls for what you knew; lumps for what
        // you didn't. Blind sweeps say so; deliberate ones feel it.
        const knownBits = [], unknownBits = [];
        for (const pid of Object.keys(bySpecies)) {
          const e = bySpecies[pid];
          (e.known ? knownBits : unknownBits).push(`${e.units}\u00d7 ${e.known ? e.plant.name : this.lumpFormName(e.plant)}`);
        }
        // NO SILENT ACTIONS: deadfall is reported too — the pines gave wood,
        // and the player should know the press wasn't wasted.
        const woodBit = woodSticks ? ` You also gather deadfall: ${woodSticks}\u00d7 branches${woodFiber ? `, ${woodFiber}\u00d7 bark fiber` : ''}.` : '';
        if (woodSticks && !knownBits.length && !unknownBits.length) {
          msg = `No food in these trees — but the ground gives deadfall: ${woodSticks}\u00d7 branches${woodFiber ? `, ${woodFiber}\u00d7 bark fiber` : ''}. This patch is picked clean — it'll recover in a few days.`;
        } else if (knownBits.length && !unknownBits.length) {
          msg = `You work the patch with practiced hands: ${knownBits.join(', ')} (${totalKcalKnown} kcal).${woodBit} This patch is picked clean — it'll recover in a few days.`;
        } else if (unknownBits.length && !knownBits.length) {
          msg = `A shot in the dark — you take what's green: ${unknownBits.join(', ')}. Into the bag, unnamed. (Not food until identified — sort them at camp.)${woodBit} This patch is picked clean — it'll recover in a few days.`;
        } else {
          msg = `You work the patch: ${knownBits.join(', ')} — and ${unknownBits.join(', ')} you can't name yet.${woodBit} This patch is picked clean — it'll recover in a few days.`;
        }
        this.say(msg);
        // discovery labels the place: the map remembers the BEST find here.
        for (const pid of Object.keys(bySpecies)) {
          const plant = bySpecies[pid].plant;
          const prevBest = t.knownPlant ? this.data.plants.find(pp => pp.id === t.knownPlant) : null;
          if (!t.knownPlant || (plant.caloriesPerUnit > (prevBest ? prevBest.caloriesPerUnit : 0))) {
            const isNew = !t.knownPlant;
            t.knownPlant = pid; t.bountyKnown = true;
            if (isNew && bounty && bounty.why) this.say(`Journal: ${bounty.why}`);
            else if (!isNew) this.say(`Journal updated: ${this.plantDisplayName(pid)} grows here too — better than ${this.plantDisplayName(prevBest.id).toLowerCase()}.`);
          }
        }
        this.tele('forage', { tile: t.type, epithet: this.nodeEpithet(this.map.px, this.map.py), plants: Object.keys(bySpecies), cells: harvested.length, kcal: totalKcalKnown, cost: S.calories.ACTION_COSTS.forage });
        if (scholar.week1) scholar.week1.forage++;
        this.gainAbilityXP('green_thumb', 1);
        // BETTER HUMAN: foraging is perception practice — reading the ground.
        this.practice('per', 1);
        // SYNERGY passives: photosynthesis works in daylight; third_eye/pattern see patterns.
        if (this.dayPart === 1 || this.dayPart === 2) this.noteAbilityUse('photosynthesis');
        this.noteAbilityUse('third_eye');
        this.noteAbilityUse('pattern_recognition');
      } else if (kind === 'rest') {
        // RELIC — second_skin: no blisters, no misery. Energy returns faster.
        const restMult = S.modifiers.resolve(1, 'rest.energy', S.modifiers.collectModifiers(scholar, this.data.abilities), {});
        const restGain = Math.round(30 * restMult);
        scholar.energy = Math.min(100, scholar.energy + restGain);
        // triage: practiced hands heal more, even resting.
        scholar.health = Math.min(this.maxHealth(), scholar.health + Math.round(this.modTarget('healing.amount', 5)));
        scholar.kcal -= 40;
        // COST HONESTY: rest burns 96 ticks — most of the day part. The
        // message names the time spent so it feels earned, not stolen.
        msg = `You settle in and rest through most of the ${DAY_PARTS[this.dayPart] || 'day'}. Breath slows. +${restGain} energy.`;
      } else if (kind === 'wait') {
        msg = 'You wait. The light changes. Nothing asks anything of you.';
      } else if (kind === 'drink') {
        // Drinking water. Hydrates. FREE — you're just drinking, not making a decision.
        // (drinkWater says what happened; it returns null either way.)
        this.drinkWater();
        this.checkQuest(kind);
        this.maybeOfferQuest();
        return true; // FREE: drinking isn't a day-part decision
      }
      this.say(msg);
      this.checkQuest(kind);
      this.maybeOfferQuest();
      // ACTION CLOCK: variable cost by fictional weight. 1 chunk = 32 ticks.
      // Forage is a QUICK beat: 16 ticks (half a batch), small yield. Time
      // feels spent, not skipped — two presses move the world one batch turn.
      // rest 3 chunks, wait = however long until the part turns.
      const T = this.TIME;
      let ticks = 0;
      if (kind === 'forage') {
        ticks = 16;
      } else if (kind === 'rest') ticks = 96;
      else if (kind === 'wait') {
        const rem = (this.state.scholar.dayTicks || 0) % T.TICKS_PER_PART;
        ticks = rem === 0 ? T.TICKS_PER_PART : T.TICKS_PER_PART - rem;
      } else if (kind !== 'drink') {
        // SAFETY: unknown kinds used to default to a full part (128 ticks) —
        // a silent time-burn landmine. Unknown = 1 tick + warned, never taxed.
        try { console.warn('[doAction] unknown kind:', kind); } catch (e) {}
      }
      return this.tickAction(ticks) || this.status();
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
            this.stockPantry(500, 'Foraged food');
            this.say(`✅ ${this.displayName(q.giver)} takes the ${q.plant}. "+500 kcal to the pantry. You're good people."`);
          } else if (q.reward === 'knowledge') {
            this.integrate(5, 'quest');
            this.say(`✅ ${this.displayName(q.giver)} listens carefully. You understand the land a little better. (+integration)`);
          } else {
            this.say(`✅ ${this.displayName(q.giver)} grins. "Pleasure doing business." (The barter economy grows.)`);
            this.integrate(2, 'barter');
          }
        }
      } else if (q.type === 'visit' && kind === 'travel') {
        if (this.playerTile().type === q.tileType) {
          this.state.scholar.activeQuest = null;
          this.integrate(5, 'quest');
          this.say(`✅ You saw the ${q.tileType}. ${this.displayName(q.giver)} nods. "Good. Now we know." (+integration)`);
        }
      }
    },

    // --- free minors ---
    eat() {
      const scholar = this.state.scholar;
      if (this.over) return;
      this._packFullStreak = 0;
      // POWER NEEDS FOOD: the bar's cap scales with metabolic mult AND bank
      // skillsets. Fire god eats to 9600; a furnace gut banks five days.
      // THE BANK: one pool — eating past "fed" fills the war chest. The bar
      // IS the reserve. Conservation of energy: food in, everything else out.
      const cap = this.kcalCap();
      // eat most-perishable first until the bar is full or food runs out
      scholar.inventory.sort((a, b) => (a.spoilDay ?? 99999) - (b.spoilDay ?? 99999));
      let ate = 0;
      const tasted = {}; // plantId -> units eaten (for knowledge level 3)
      let medAte = 0, medName = null; // medicinal plant units eaten (herb skill hook)
      // Eat only food (kcalEach > 0). Gear is skipped, NOT deleted.
      // preservation_instinct: you store food right. +days before it turns.
      const spoilBonus = Math.round(this.modTarget('food.spoilage_days', 0));
      const isSpoiled = (i) => this.isSpoiled ? this.isSpoiled(i, spoilBonus) : (i.spoilDay !== undefined && i.spoilDay <= scholar.day);
      while (scholar.kcal < cap) {
        // find the most perishable FOOD (not gear)
        // FOOD REALITY: unknown / unprocessed food isn't food yet — skip it.
        // SPOILAGE: rot isn't food either — skipped here, discarded below.
        const foodIdx = scholar.inventory.findIndex(i => (i.kcalEach || 0) > 0 && i.units > 0 && i.edible !== false && !isSpoiled(i));
        if (foodIdx === -1) break; // no food left
        const it = scholar.inventory[foodIdx];
        const kcal = it.kcalEach;
        // symbiote: it tastes your food first. Warns you of poison.
        if (it.safe === false && this.hasAbility('symbiote') && !it.symWarned) {
          it.symWarned = true;
          this.say(`Your gut churns a warning — the ${it.name} is wrong. (symbiote: unsafe food)`);
        }
        // iron_stomach: unsafe food is a gamble. Base 20% chance of -5 health;
        // an iron stomach shrugs most of it off.
        if (it.safe === false) {
          const pChance = this.modTarget('food.poison_chance', 0.2);
          if (Math.random() < pChance) {
            scholar.health = Math.max(0, scholar.health - 5);
            this.say(`The ${it.name} was off. Your stomach knots. (-5 health)`);
          }
        }
        // FOOD REALITY: state-based disease risk. Raw meat, must-cook plants.
        // Shown honestly before eating ("Risky: raw") — the gamble is informed.
        if (it.diseaseRisk && Math.random() < it.diseaseRisk.p) {
          scholar.health = Math.max(0, (scholar.health || 100) - it.diseaseRisk.dmg);
          // Track disease so herbal_remedy can cure it (Steve 2026-10-05)
          scholar.diseases = scholar.diseases || [];
          scholar.diseases.push({ name: it.diseaseRisk.note || 'food poisoning', day: scholar.day });
          this.say(`The ${it.name} was ${it.diseaseRisk.note || 'risky'}. Fever by nightfall. (-${it.diseaseRisk.dmg} health)`);
        }
        // POISON: belltoad throat sac, etc. Purify cures it.
        if (it.poisonRisk && Math.random() < it.poisonRisk.p) {
          scholar.health = Math.max(0, (scholar.health || 100) - 10);
          scholar.poisons = scholar.poisons || [];
          scholar.poisons.push({ name: it.poisonRisk.note || 'toxin', day: scholar.day });
          this.say(`The ${it.name} was poisoned — ${it.poisonRisk.note}. Your veins burn. (-10 health, poisoned)`);
        }
        scholar.kcal += kcal; ate += kcal;
        // MEDICINE (Steve): chewing medicinal plants is a skill. Track it —
        // the knowledgeable use them deliberately, the ignorant chew and hope.
        if (it.plantId) {
          const _mp = this.data.plants.find(pp => pp.id === it.plantId);
          if (_mp && _mp.medicinal) { medAte++; medName = this.plantKnown(it.plantId) ? _mp.name : (_mp.description || 'bitter leaves'); }
        }
        // THE BANK: the pool remembers what it was built from. Specialist
        // fuel burns hottest — even mixed into the war chest.
        if (this.blendKcalQuality) this.blendKcalQuality(kcal, this.mealQuality ? this.mealQuality(it) : 1);
        if (it.plantId) tasted[it.plantId] = (tasted[it.plantId] || 0) + 1;
        it.units -= 1;
        if (it.units <= 0) scholar.inventory.splice(foodIdx, 1);
      }
      // THE BANK: the bar is the reserve. Past "fed", every bite is war chest.
      if (scholar.kcal > cap) scholar.kcal = cap;
      const bankedNow = this.banked ? this.banked() : 0;
      // MEDICINE RESOLVED: the knowledgeable get real healing from medicinal
      // plants; the ignorant get a whisper of it and an honest message.
      if (medAte > 0) {
        if (this.herbKnown()) {
          const heal = Math.min(8, medAte * 2);
          scholar.health = Math.min(this.maxHealth(), scholar.health + heal);
          this.say(`You chew the ${medName} deliberately — the way you were taught. Bitter, working. (+${heal} health)`);
        } else {
          scholar.health = Math.min(this.maxHealth(), scholar.health + 2);
          this.say(`You chew the bitter leaves. Folk say it helps — you wouldn't know. (+2 health, maybe)`);
        }
      }
      const bankNote = bankedNow > 0 ? ` Past full — the bank takes it. (+${bankedNow} banked. ${this.feastLine ? this.feastLine() : ''})` : '';
      // LEVEL 3: Uses. Eat it 3 times, you learn what it does to you.
      // Vitamin C, medicine, energy. "Have you tasted it?" Yes. Now you know.
      for (const [pid, count] of Object.entries(tasted)) {
        const entry = this.state.codex.plants[pid];
        if (entry && entry.level === 2) {
          entry.tastings = (entry.tastings || 0) + count;
          if (entry.tastings >= 3) {
            entry.level = 3;
            const plant = this.data.plants.find(p => p.id === pid);
            this.say(`Deeper knowledge: ${plant.name}. ${plant.knowledgeLevels['3']} (+5 health when eaten). All uses known: ${this.plantUsesText(pid) || '—'}.`);
            // level 3 benefit: eating gives health
            scholar.kcal = Math.min(scholar.kcal + 50, this.kcalCap ? this.kcalCap() : 3000); // nourished
          }
        }
      }
      // spoilage: drop expired FOOD. Gear (no spoilDay) never spoils.
      const before = scholar.inventory.length;
      // FOOD REALITY: name what spoiled — waste should be visible, not a count.
      const spoiledNames = scholar.inventory
        .filter(i => isSpoiled(i))
        .map(i => i.name);
      scholar.inventory = scholar.inventory.filter(i => !isSpoiled(i));
      const spoiled = before - scholar.inventory.length;
      const spoilNote = spoiled ? ` Spoiled and discarded: ${[...new Set(spoiledNames)].join(', ')}. The Codex notes the waste.` : '';
      // FOOD REALITY: distinguish "full" from "nothing edible" (unknown/
      // unprocessed food doesn't count, and the player should know why).
      const stillHungry = scholar.kcal < cap;
      const inedible = stillHungry ? scholar.inventory.filter(i => i.edible === false && (i.units || 0) > 0) : [];
      const nothingEdible = ate === 0 && stillHungry && inedible.length > 0 && !scholar.inventory.some(i => (i.kcalEach || 0) > 0 && (i.units || 0) > 0 && i.edible !== false);
      const inedibleNote = inedible.length
        ? ` (${[...new Set(inedible.map(i => i.name))].join(', ')} — not food yet: ${inedible[0].foodState === 'unknown' ? 'identify it first — test cautiously from your pack, or sort it at camp' : inedible[0].prep || 'process it'}.)`
        : '';
      this.say(ate > 0 ? `You eat (${ate} kcal).${bankNote}` + spoilNote
                       : (nothingEdible ? 'Nothing edible.' + inedibleNote + spoilNote
                       : (scholar.inventory.length ? 'You are full enough.' + spoilNote : 'Nothing to eat. The pantry of your pack is empty.' + spoilNote)));
      // loud_chewer: eating is 2x louder. Monsters hear you. But +5 energy — morale is real.
      if (ate > 0) {
        scholar.energy = Math.min(100, scholar.energy + 5);
        const hear = 0.1 * this.modTarget('monster.hear_mult', 1);
        if (Math.random() < hear) {
          scholar.noisyUntil = scholar.day + 1;
          this.say('Your chewing echoes off the trees. Something out there heard. (encounters more likely tomorrow)');
        }
      }
      if (ate > 0) this.tele('eat', { ateKcal: ate, spoiled });
      // ACTION CLOCK: a meal is 1 tick (time-only — eating costs no effort).
      if (ate > 0) this.tickAction(1);
    },

    // EAT ONE (Steve 2026-10-05): eat a single unit from the Pack menu.
    // The Eat button is gone — this is how you eat now. In combat, it costs an action.
    eatOne(idx) {
      const scholar = this.state.scholar;
      if (this.over) return;
      const it = scholar.inventory[idx];
      if (!it || (it.kcalEach || 0) <= 0 || (it.units || 0) <= 0) {
        this.say('Nothing edible there.');
        return;
      }
      if (it.edible === false) {
        this.say(`${it.name} isn't food yet — ${it.foodState === 'unknown' ? 'identify it first' : it.prep || 'process it'}.`);
        return;
      }
      // SPOILAGE: rot isn't food. The dawn sweep clears it; mid-day it's
      // refused, honestly — never eaten for full kcal.
      const spoilBonus = Math.round(this.modTarget('food.spoilage_days', 0));
      if (this.isSpoiled && this.isSpoiled(it, spoilBonus)) {
        this.say(`The ${it.name} went bad — beyond eating. You leave it for the flies.`);
        return;
      }
      const cap = this.kcalCap();
      if (scholar.kcal >= cap) {
        this.say('You are full enough.');
        return;
      }
      // Safety checks (same as eat(): symbiote, poison, disease)
      if (it.safe === false && this.hasAbility('symbiote') && !it.symWarned) {
        it.symWarned = true;
        this.say(`Your gut churns a warning — the ${it.name} is wrong. (symbiote: unsafe food)`);
      }
      if (it.safe === false) {
        const pChance = this.modTarget('food.poison_chance', 0.2);
        if (Math.random() < pChance) {
          scholar.health = Math.max(0, scholar.health - 5);
          this.say(`The ${it.name} was off. Your stomach knots. (-5 health)`);
        }
      }
      if (it.diseaseRisk && Math.random() < it.diseaseRisk.p) {
        scholar.health = Math.max(0, (scholar.health || 100) - it.diseaseRisk.dmg);
        scholar.diseases = scholar.diseases || [];
        scholar.diseases.push({ name: it.diseaseRisk.note || 'food poisoning', day: scholar.day });
        this.say(`The ${it.name} was ${it.diseaseRisk.note || 'risky'}. Fever by nightfall. (-${it.diseaseRisk.dmg} health)`);
      }
      if (it.poisonRisk && Math.random() < it.poisonRisk.p) {
        scholar.health = Math.max(0, (scholar.health || 100) - 10);
        scholar.poisons = scholar.poisons || [];
        scholar.poisons.push({ name: it.poisonRisk.note || 'toxin', day: scholar.day });
        this.say(`The ${it.name} was poisoned — ${it.poisonRisk.note}. Your veins burn. (-10 health, poisoned)`);
      }
      const kcal = it.kcalEach;
      scholar.kcal = Math.min(cap, scholar.kcal + kcal);
      if (this.blendKcalQuality) this.blendKcalQuality(kcal, this.mealQuality ? this.mealQuality(it) : 1);
      it.units -= 1;
      if (it.units <= 0) scholar.inventory.splice(idx, 1);
      scholar.energy = Math.min(100, scholar.energy + 5);
      this.say(`You eat the ${it.name}. (+${kcal} kcal)`);
      // COMBAT: eating from pack costs an action (Steve 2026-10-05)
      if (scholar.monster || this.state.inCombat) {
        this.spendCombatAction('eat');
      } else {
        this.tickAction(1);
      }
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
      // ACTION CLOCK: a drink is 1 tick (time-only).
      this.tickAction(1);
    },

    // advancePart: one day-part turns. Called ONLY from tickAction's boundary
    // crossing — the part structure derives from the unified tick clock now,
    // not from big actions calling this directly.
    advancePart() {
      this.checkVillageProximity();
      if (this.over) return this.status();
      // TALK REQUESTS ROT: an unanswered "can we talk?" doesn't wait forever.
      // The clock runs here, so the sweep lives here — not in initiative.
      try { this.expireTalkRequests(); } catch (e) {}
      // ALIVE: wants grow with time, unanswered asks curdle.
      try { this.tickNeeds(); } catch (e) {}
      // LEADER: assigned villagers execute their tasks. Reports come back now.
      try { this.resolveAssignments(); } catch (e) {}
      // LIVING WORLD: NPCs move between nodes with their own agendas.
      // Once per part — the world lives at a slower rhythm than your steps.
      try { this.npcNodeTravel(); } catch (e) {}
      // THEFT: victims notice missing rations a part later. Hunger audits.
      try { this.theftNoticeSweep(); } catch (e) {}
      // small energy tick per part
      this.state.scholar.energy = Math.max(0, this.state.scholar.energy - 5);
      // photosynthesis: gain 100 kcal in sunlight. Day parts are day; night is night.
      // (You're becoming a plant. The metabolic cost already took its cut.)
      if (this.hasAbility('photosynthesis') && this.dayPart < 3) {
        this.state.scholar.kcal += 100;
        this.say('Sunlight on your skin. You drink it. +100 kcal. (photosynthesis)');
      }
      this.moveWanderer();
      this.dayPart += 1;
      if (this.dayPart >= 4) return this.endDay();
      this.ap = 1;
      this.say(`— ${DAY_PARTS[this.dayPart].toUpperCase()} — ${DAY_PART_HINT[DAY_PARTS[this.dayPart]]}`);
      // NIGHTFALL: the village reacts. Fear rises in everyone a little, people pull
      // toward the fire, watches get posted. The dark has its own animals —
      // everyone knows it. (Fear is per-NPC, in the existing needs system.)
      if (this.dayPart === 3) {
        try {
          const v = this.state.village;
          const onWatch = Object.keys(v.assignments || {}).filter(id => v.assignments[id].task === 'patrol');
          for (const rid of (v.roster || [])) {
            if (rid === this.villagerId) continue;
            try {
              const n = this.npcNeeds(rid);
              n.fear = Math.min(100, (n.fear || 0) + (onWatch.length ? 5 : 12));
            } catch (e) {}
          }
          this.say(this.villagePick(onWatch.length ? [
            'Night settles. The fire is the whole world now. Watches are posted — the dark has its own animals, and the village knows it.',
            'Night comes down like a lid. The watch takes the treeline; the rest of us take the fire.',
            'Dark, then darker. Someone feeds the fire without being asked. That\'s the whole village, right there.',
            'The night shift nods at you on their way out past the light. Nothing to say. There never is.',
          ] : [
            'Night settles. The fire is the whole world now. No watches posted. The dark feels bigger than it should.',
            'No watches tonight. Everyone sleeps with one ear open and pretends not to.',
            'The fire burns lower than it should. Nobody wants to be the one to go for wood in the dark.',
            'Night. The treeline is just a sound now. The fire is the whole argument against it.',
          ]));
        } catch (e) {}
      }
      this.save();
      return this.status();
    },

    // endDayPart: legacy entry point. Big actions now tick the unified clock
    // directly with their own costs; 128 ticks = exactly one part boundary.
    endDayPart() { return this.tickAction(this.TIME.TICKS_PER_PART) || this.status(); },

    // village lives: the others aren't waiting. each day, 1-2 villagers do something.
    // they forage, they get hurt, they find things. they discover along with you.
    villageLives() {
      const v = this.state.village;
      if (!v.roster) return;
      // ALIVE: the village talks when you're not the topic.
      try { this.ambientSocial(); } catch (e) {}
      // LIVING WORLD: knowledge moves human-to-human, by the fire.
      try { this.firesideTeaching(); } catch (e) {}
      const bg = v.roster.filter(id => !this.data.villagers.find(m => m.id === id));
      if (!bg.length) return;
      // LEADER: assigned villagers are out working — they don't do random things.
      const asg = v.assignments || {};
      const free = bg.filter(id => !asg[id]);
      if (!free.length) return;
      const n = 1 + (Math.random() < 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const id = free[Math.floor(Math.random() * free.length)];
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
          this.stockPantry(kcal, 'Foraged food');
          // COMPETITION: they depleted a real tile. the world is shared.
          // (2026-10-05: was called without coords — a silent no-op. Home turf
          // is the village's turf: pass haven so the depletion is real.)
          this.depleteRandomTile(Math.ceil(kcal / 200), v.px ?? 3, v.py ?? 3);
          this.say(`${first} had the day of their life — ${kcal} kcal. Two days of food from one person.${pers.sharing === 'selfish' ? ' (Kept some back, you suspect.)' : ''}`);
        } else if (r < 0.35) {
          // brings food: a real haul. from the world, not thin air.
          const kcal = Math.round((400 + Math.floor(Math.random() * 401)) * boldMult * shareMult);
          this.stockPantry(kcal, 'Foraged food');
          this.depleteRandomTile(Math.ceil(kcal / 200), v.px ?? 3, v.py ?? 3);
          this.say(`${first} came back with ${kcal} kcal of something edible. The pantry breathes.`);
        } else if (r < 0.5) {
          // wounded: health bars. -20 to -35 per bad day.
          v.health = v.health || {};
          const curH = v.health[id] !== undefined ? v.health[id] : 100;
          const dmg = 20 + Math.floor(Math.random() * 16);
          // leech: when an ally is hurt near you, you take half. They owe you. (They know it.)
          let dmgTaken = dmg;
          if (this.hasAbility('leech') && this.isSafeTile(this.map.px, this.map.py)) {
            const half = Math.ceil(dmg / 2);
            dmgTaken = dmg - half;
            this.state.scholar.health = Math.max(1, this.state.scholar.health - half);
            const vt = this.state.village.trust || {}; vt[id] = Math.min(100, (vt[id] || 10) + 5);
            this.say(`You step in front of ${first}. You take ${half} of it. They owe you. (leech: trust +5)`);
            this.noteAbilityUse('leech');
          }
          v.health[id] = Math.max(0, curH - dmgTaken);
          if (v.health[id] <= 0) {
            v.roster = v.roster.filter(rid => rid !== id);
            this.say(`💀 ${person.name} is gone. The wound was too much. The village is ${v.roster.length} now.`);
            try { this.villageEvent('death'); } catch (e) {}
            delete v.health[id];
          } else {
            this.say(`${first} is hurt — a fall, a thorn, a bad step. (health ${v.health[id]}/100)`);
          }
        } else if (r < 0.65) {
          // discovers something (adds to codex if new!)
          const undiscovered = this.data.plants.filter(p => !this.state.codex.plants[p.id]);
          if (undiscovered.length && Math.random() < 0.3) {
            const p = undiscovered[Math.floor(Math.random() * undiscovered.length)];
            if (this.identifyPlant(p.id, first)) {
              this.say(`${first} brought you a sample. The ${this.journalName()} grows.`);
            }
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
      // Data-driven: abilities declare metabolic: {eatMult}. Legacy fallback:
      // a "fire"/"god" name still reads as 4x (the old heuristic).
      if (!abilities || !abilities.length) return 1;
      let mult = 1;
      for (const entry of abilities) {
        const aid = (entry && entry.id) || entry;
        const ab = this.data.abilities.find(a => a.id === aid);
        if (ab && ab.metabolic && ab.metabolic.eatMult) mult = Math.max(mult, ab.metabolic.eatMult);
        else if (ab && (ab.name.toLowerCase().includes('fire') || ab.name.toLowerCase().includes('god'))) mult = Math.max(mult, 4);
      }
      return mult;
    },
    // maxHealth: 100 + survivor bonus. Everything that heals caps here.
    maxHealth() {
      return 100 + Math.round(this.modTarget('health.max_add', 0));
    },

    // hasAbility / abilityLevel: delegate to the shared engine helper.
    // Checks system abilities AND background abilities; works with objects or string IDs.
    hasAbility(id) {
      return !!(globalThis.Scattering && globalThis.Scattering.hasAbility(this.state.scholar, id));
    },
    abilityLevel(id) {
      return (globalThis.Scattering && globalThis.Scattering.abilityLevel(this.state.scholar, id)) || 0;
    },

    // allModifiers: abilities + relics + KNOWLEDGE. One pipeline.
    // Knowledge isn't separate from powers — it amplifies them.
    allModifiers() {
      const S = globalThis.Scattering;
      const base = S.modifiers.collectModifiers(this.state.scholar, this.data.abilities);
      const know = S.modifiers.collectKnowledgeModifiers(
        (this.state.codex || {}).skills,
        this.data.knowledge
      );
      return base.concat(know);
    },

    // hasKnowledgeUnlock: does your knowledge unlock this action?
    hasKnowledgeUnlock(unlockId) {
      const S = globalThis.Scattering;
      return S.modifiers.hasKnowledgeUnlock(
        (this.state.codex || {}).skills,
        this.data.knowledge,
        unlockId
      );
    },

    // ============ ABILITY SYNERGIES ============
    // Related powers resonate — but only if you LEARN to combine them.
    // Holding two abilities does nothing by itself. You must discover the
    // combination through use: simultaneous, sequential, same-target, or sustained.
    // 3 successful combined uses unlocks the synergy. Attempts 1-2 tease the
    // result (a flicker of what's possible) without revealing the method.
    // The player thinks "whoa, what did I just do?" and tries to replicate it.
    //
    // noteAbilityUse: log an ability use, then check for synergy discoveries.
    // Called from gainAbilityXP (passive uses), activateAbility (activatables),
    // and maybeCheatDeath (death cheats). context: { target }.
    noteAbilityUse(abilityId, context) {
      const sch = this.state.scholar;
      if (!sch || !abilityId) return;
      context = context || {};
      const day = (this.state.village && this.state.village.day) || (sch.day || 1);
      const part = this.dayPart || 0;
      sch.abilityUseLog = sch.abilityUseLog || [];
      sch.abilityUseLog.push({ id: abilityId, day, part, target: context.target || null });
      if (sch.abilityUseLog.length > 40) sch.abilityUseLog.shift();
      this.checkSynergyDiscovery(abilityId, { day, part, target: context.target || null });
    },

    // checkSynergyDiscovery: did this ability use complete a combined use?
    checkSynergyDiscovery(usedId, ctx) {
      const sch = this.state.scholar;
      if (!sch) return;
      const syns = this.data.synergies || [];
      sch.synergies = sch.synergies || [];       // discovered synergy ids
      sch.synergyAttempts = sch.synergyAttempts || {};  // synId -> attempt count
      for (const syn of syns) {
        if (sch.synergies.includes(syn.id)) continue;   // already discovered
        const dm = syn.discovery_method;
        if (!dm) continue;
        const reqs = syn.requires || [];
        if (!reqs.includes(usedId)) continue;
        // Must hold both abilities at minLevel to make progress.
        const minLvl = syn.minLevel || 1;
        if (!reqs.every(rid => this.abilityLevel(rid) >= minLvl)) continue;
        const otherId = reqs.find(r => r !== usedId);
        const log = sch.abilityUseLog || [];
        let combined = false;
        if (dm.type === 'simultaneous') {
          // Both used in the same day-part.
          combined = log.some(u => u.id === otherId && u.day === ctx.day && u.part === ctx.part);
        } else if (dm.type === 'sequential') {
          // Used second in the defined order, other was first earlier today.
          const order = dm.order || reqs;
          if (usedId === order[1]) {
            combined = log.some(u => u.id === order[0] && u.day === ctx.day);
          }
        } else if (dm.type === 'same_target') {
          // Both applied to the same target today.
          combined = !!(ctx.target && log.some(u => u.id === otherId && u.target === ctx.target && u.day === ctx.day));
        } else if (dm.type === 'sustained') {
          // Both used today — counts as one day toward a 3-day streak.
          const otherUsedToday = log.some(u => u.id === otherId && u.day === ctx.day);
          if (otherUsedToday) {
            const dayKey = syn.id + '_days';
            const lastKey = syn.id + '_lastday';
            const last = sch.synergyAttempts[lastKey] || 0;
            if (last !== ctx.day) {
              if (!sch.synergyAttempts[dayKey] || last === ctx.day - 1) {
                sch.synergyAttempts[dayKey] = (sch.synergyAttempts[dayKey] || 0) + 1;
              } else {
                sch.synergyAttempts[dayKey] = 1;  // streak broken, restart
              }
              sch.synergyAttempts[lastKey] = ctx.day;
              const days = sch.synergyAttempts[dayKey];
              if (days >= 3) {
                // Sustained: 3 days IS the discovery. Unlock directly.
                this.unlockSynergy(syn);
                continue;
              } else {
                // Sustained teases on day-progress, not a separate attempt counter.
                this.synergyTease(syn, days);
                continue;
              }
            }
          }
        }
        if (combined) {
          sch.synergyAttempts[syn.id] = (sch.synergyAttempts[syn.id] || 0) + 1;
          const n = sch.synergyAttempts[syn.id];
          if (n >= 3) {
            this.unlockSynergy(syn);
          } else {
            this.synergyTease(syn, n);
          }
        }
      }
      this.recomputeActiveSynergies();
    },

    // synergyTease: attempt 1-2 feedback. Hints at the NATURE of the power,
    // never the METHOD. The player should think "what did I just do?"
    synergyTease(syn, n) {
      const dm = syn.discovery_method || {};
      const tease = n === 1 ? dm.tease1 : dm.tease2;
      if (!tease) return;
      // Only tease once per attempt count — don't spam on repeated checks.
      const sch = this.state.scholar;
      const seenKey = syn.id + '_teased_' + n;
      if (sch.synergyAttempts[seenKey]) return;
      sch.synergyAttempts[seenKey] = 1;
      this.say(tease);
      if (n === 2 && dm.hint) {
        this.say(`Something wants to happen when you do... whatever you just did. (${n}/3)`);
      }
    },

    // unlockSynergy: 3rd successful combined use. Permanent (while both held).
    unlockSynergy(syn) {
      const sch = this.state.scholar;
      if (!sch.synergies.includes(syn.id)) {
        sch.synergies.push(syn.id);
        this.say(`\u2728 SYNERGY DISCOVERED: ${syn.name}!`);
        if (syn.flavor) this.say(syn.flavor);
        if (syn.discovery) this.say(syn.discovery);
      }
      this.recomputeActiveSynergies();
    },

    // recomputeActiveSynergies: only DISCOVERED + currently held synergies are active.
    // Runs on equip, unequip, level-up, and load. Never auto-discovers.
    recomputeActiveSynergies() {
      const sch = this.state.scholar;
      if (!sch) return;
      const syns = this.data.synergies || [];
      const active = [];
      for (const syn of syns) {
        if (!(sch.synergies || []).includes(syn.id)) continue;
        const minLvl = syn.minLevel || 1;
        const held = (syn.requires || []).every(rid => this.abilityLevel(rid) >= minLvl);
        if (held) active.push(syn.id);
      }
      sch.activeSynergies = active;
    },

    // hasSynergy: is this synergy currently resonating?
    hasSynergy(sid) {
      const sch = this.state.scholar;
      return !!((sch.activeSynergies || []).includes(sid));
    },

    // synergyMods: passive synergy effects, fed into the modifier pipeline.
    synergyMods() {
      const out = [];
      const syns = this.data.synergies || [];
      for (const sid of (this.state.scholar.activeSynergies || [])) {
        const syn = syns.find(x => x.id === sid);
        if (!syn || !syn.modifiers) continue;
        for (const m of syn.modifiers) {
          out.push(Object.assign({ source: 'synergy:' + sid }, m));
        }
      }
      return out;
    },

    // mods: all active ability modifiers for the scholar (system + background + synergies).
    mods() {
      const base = globalThis.Scattering.modifiers.collectModifiers(this.state.scholar, this.data.abilities);
      return base.concat(this.synergyMods());
    },

    // modTarget: resolve one computed value through the modifier pipeline.
    // base → collect → adds, then multiplies → final. Use for EVERY number
    // an ability could touch. New content = new target, never new plumbing.
    modTarget(target, base, ctx) {
      return globalThis.Scattering.modifiers.resolve(base, target, this.mods(), ctx || {});
    },

    // metabolicDaily: conservation of energy. Every System ability has a
    // metabolic cost (kcal/day) — power is a trade, not a tax. Background
    // abilities are who you already were: free.
    // Steve's test: "does this let you skip dinner?" — if yes, the cost is wrong.
    metabolicDaily() {
      let total = 0;
      const all = (this.state.scholar.abilities || []).concat(this.state.scholar.backgroundAbilities || []);
      for (const entry of all) {
        const aid = (entry && entry.id) || entry;
        const ab = this.data.abilities.find(a => a.id === aid);
        if (ab && ab.metabolic && ab.metabolic.daily) total += ab.metabolic.daily;
      }
      return total;
    },

    // pantryInReach: the pantry is physical — it lives in the hall at haven.
    // You only eat from it (or draw your share) when you're actually there.
    pantryInReach() {
      try { const t = this.playerTile(); return !!(t && t.type === 'haven'); }
      catch (e) { return false; }
    },
    // villageMeal: you eat from the communal pantry. You're one of the 12.
    // Trust determines your share. Newcomers get less. Contributors get more.
    // PHYSICAL: the pantry is in the hall, not in your pack. Camp wild and
    // there's no dawn meal — eat from your pack. (Membership still has no
    // check-ins: you stay a member while away; you just don't get fed.)
    villageMeal() {
      const scholar = this.state.scholar;
      // JOINED VILLAGE: their pantry is physical too — you only eat from it
      // when you're actually at their fire. (BUG 2026-10-05: the joined meal
      // drew from the joined pantry from anywhere on the map, including while
      // standing in Haven's hall. No teleporting food.)
      const jv = scholar.joinedVillage
        ? (this.state.otherVillages || []).find(x => x.id === scholar.joinedVillage)
        : null;
      const atJv = jv && this.map &&
        (Math.abs((jv.x || 0) - this.map.px) + Math.abs((jv.y || 0) - this.map.py) <= 1);
      // If you joined another village, you eat from THEIR pantry — at their fire.
      if (jv && atJv) {
        // other villages use pantryKcal (abstract). Convert to meal.
        const meal = Math.min(2000, jv.pantryKcal || 0);
        jv.pantryKcal = Math.max(0, (jv.pantryKcal || 0) - meal);
        scholar.kcal = Math.min((scholar.kcal || 0) + meal, 3000);
        this.say(`Village meal at ${jv.name}: +${Math.round(meal)} kcal.`);
        return;
      }
      // Away from every fire — joined or not — you camp wild.
      if (!this.pantryInReach()) {
        this.say('You camp wild tonight — no pantry meal. Eat from your pack.');
        return null;
      }
      // your share: 2000 kcal (a day's food), scaled by trust
      // trust < 30: half ration (they're watching you). 30+: full. 60+: full + bonus.
      const v = this.state.village;
      const pantry = v.pantry || [];
      const trust = v.trust && v.trust[scholar.villagerId] !== undefined ? v.trust[scholar.villagerId] : 10;
      const share = trust < 30 ? 1000 : trust < 60 ? 2000 : 2200;
      // don't take more than you can hold — food doesn't vanish into the cap
      const room = Math.max(0, 3000 - (scholar.kcal || 0));
      const want = Math.min(share, room);
      if (want <= 0) { this.say('You\'re full. The pantry keeps its food.'); return; }
      // take from pantry (most perishable first)
      let taken = 0;
      pantry.sort((a, b) => (a.spoilDay ?? 99999) - (b.spoilDay ?? 99999));
      for (let i = pantry.length - 1; i >= 0 && taken < want; i--) {
        const item = pantry[i];
        if (!item || (item.kcalEach || 0) <= 0 || item.units <= 0) continue;
        const need = want - taken;
        const units = Math.min(item.units, Math.ceil(need / item.kcalEach));
        taken += (units || 0) * (item.kcalEach || 0);
        item.units -= units;
        if (item.units <= 0) pantry.splice(i, 1);
      }
      scholar.kcal = Math.min((scholar.kcal || 0) + taken, 3000);
      // WATER with the meal (from village storage).
      const vw = v.water || { clean: 0 };
      if (vw.clean >= 1) {
        vw.clean -= 1;
        scholar.water = scholar.water || [];
        scholar.water.push({ liters: 1, quality: 'clean', source: 'Village meal' });
      }
      if (taken > 0) {
        this.say(`Village meal: +${Math.round(taken)} kcal${vw.clean >= 0 ? ', +1L water' : ''} from the communal pantry.${trust < 30 ? ' (Half ration — they don\'t trust you yet.)' : ''}`);
      } else {
        this.say('No food in the pantry. The village is hungry.');
      }
    },

    villageEats() {
      const v = this.state.village;
      let eat = 0, give = 0;
      const providers = [];
      for (const id of (v.roster || [])) {
        // AWAY PLAYER: not at haven → neither foraging for the pot nor eating
        // from it today. The pantry is physical; your dawn meal is gated the
        // same way (see villageMeal). NPC roster members live at haven.
        // JOINED ELSEWHERE counts as away: living at another village's fire
        // means your hands work THEIR pot, not Haven's. (BUG 2026-10-05: a
        // joined player ate the joined village's meals while their labor
        // still fed home — food from two fires.)
        if (id === this.villagerId && !this.pantryInReach()) continue;
        const person = this.data.villagers.find(p => p.id === id) || this.data.background_survivors.find(p => p.id === id);
        if (!person) continue;
        const health = (v.health && v.health[id] !== undefined) ? v.health[id] : 100;
        const healthFactor = health / 100;
        // KNOWLEDGE FEEDS: villagers who LEARN forage better. taught[] grows via
        // villagerLearnsPlant (identifications, teaching, fireside sharing) — the
        // learning curve IS the difficulty curve. 1.0 at zero knowledge, 1.8 cap.
        const knownPlants = (v.taught && v.taught[id]) ? v.taught[id].length : 0;
        const knowledgeFactor = Math.min(1.8, 1 + (knownPlants * 0.10));
        // TRUST: they share food when they trust you. strangers hoard.
        // trust 0-30: 20% shared. 30-60: 50%. 60-80: 80%. 80+: all.
        const trust = (v.trust && v.trust[id] !== undefined) ? v.trust[id] : 10;
        const trustFactor = trust < 30 ? 0.2 : trust < 60 ? 0.5 : trust < 80 ? 0.8 : 1.0;
        // THEY FEED THEMSELVES FIRST. Each villager forages, eats, shares surplus.
        // The pantry is the buffer, not their main food source.
        const produced = (person.providesPerDay || 0) * healthFactor * knowledgeFactor;
        const needed = (person.kcalPerDay || 2000) * (0.7 + 0.3 * healthFactor);
        if (produced >= needed) {
          // self-sufficient. surplus shared by trust.
          const surplus = (produced - needed) * trustFactor;
          if (surplus > 0) { give += surplus; providers.push(person); }
        } else {
          // deficit. takes from pantry.
          eat += (needed - produced);
        }
      }
      const net = Math.max(0, eat - give);
      v.lastEat = eat; v.lastGive = give; v.lastProviders = providers.map(p => p.name.split(' ')[0]);
      // BURN HISTORY: the honest pantry clock. The haven screen's "about N days"
      // runs on this measured net burn — not the 12x2000 worst case, which told
      // the forager their pantry was always ~2 days from empty. Rolling 7 days.
      v.burnHistory = (v.burnHistory || []).concat([net]).slice(-7);
      // Consume REAL pantry items (not phantom pantryKcal). Oldest/spoiling first.
      v.pantry = v.pantry || [];
      let need = net;
      // sort by spoilDay (perishable first)
      v.pantry.sort((a, b) => (a.spoilDay ?? 99999) - (b.spoilDay ?? 99999));
      for (let i = v.pantry.length - 1; i >= 0 && need > 0; i--) {
        const item = v.pantry[i];
        const kcalEach = item.kcalEach || 0;
        if (kcalEach <= 0) continue;
        // villagers cook raw food if they know how (abstracted: they get cooked value if any villager knows)
        let effectiveKcal = item.rawKcal ? (item.cookedKcal || item.rawKcal * 1.5) : kcalEach;
        // FOOD REALITY: raw cleaned meat in the pantry gets cooked value only if
        // someone (a cook-specialist villager, or you) actually knows cooking.
        // Otherwise the village eats it raw — at raw value. Specialists matter.
        if (item.foodKind === 'meat' && item.foodState === 'cleaned' && item.hiddenKcal) {
          const cooks = (this.villageHasSpecialty && this.villageHasSpecialty('cook')) || (this.knowsTechnique && this.knowsTechnique('cook'));
          // hiddenKcal is TOTAL; effectiveKcal is per unit.
          effectiveKcal = cooks ? Math.round(item.hiddenKcal / (item.units || 1)) : kcalEach;
        }
        const itemTotal = effectiveKcal * (item.units || 1);
        if (itemTotal <= need) {
          need -= itemTotal;
          v.pantry.splice(i, 1);
        } else {
          const unitsNeeded = Math.ceil(need / effectiveKcal);
          item.units -= unitsNeeded;
          need = 0;
          if (item.units <= 0) v.pantry.splice(i, 1);
        }
      }
      // surplus goes INTO pantry (as foraged goods).
      if (give > 0) {
        v.pantry = v.pantry || [];
        // add as a generic "foraged food" item (villagers bring variety)
        const existing = v.pantry.find(p => p.name === 'Foraged food');
        if (existing) {
          existing.units += Math.ceil(give / 200); // ~200 kcal per unit
        } else {
          v.pantry.push({ name: 'Foraged food', kcalEach: 200, units: Math.ceil(give / 200), spoilDay: v.day + 3, safe: true, kg: 0.2 });
        }
      }
      // keep pantryKcal in sync (derived, not source of truth)
      v.pantryKcal = v.pantry.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
      const starving = need > 0; // village didn't get enough
      // starvation is slow: -5 health/day when empty. people fade.
      // health recovers +2/day when there's food.
      v.health = v.health || {};
      if (starving || v.pantry.length === 0) {
        for (const rid of (v.roster || [])) {
          const cur = v.health[rid] !== undefined ? v.health[rid] : 100;
          v.health[rid] = Math.max(0, cur - 5);
          if (v.health[rid] <= 0) {
            const vp = this.data.villagers.find(m => m.id === rid) || this.data.background_survivors.find(p => p.id === rid);
            v.roster = v.roster.filter(r => r !== rid);
            this.say(`💀 ${this.displayName(rid)} starved. Slowly. The village is ${v.roster.length} now.`);
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
        // The scattering happens ONCE. Without the flag, every endDay after
        // game-over re-announces it and re-wipes (sims keep calling endDay).
        if (v.hungryDays >= 3 && !v.scattered) {
          v.scattered = true;
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
      // VILLAGE NAMING: the argument continues. Late proposers chime in, and
      // the village converges on a name for each unnamed beast.
      try {
        for (const mid of Object.keys(this.state.codex.monsters || {})) {
          const e = this.state.codex.monsters[mid];
          // SOMEONE ELSE SAW IT: a forager comes back white-faced. The news
          // spreads on its own — no need for you to tell anyone.
          if (e.reported && !e.namingKicked && Math.random() < 0.15) {
            const roster = ((this.state.village || {}).roster || []).filter(id => id !== (scholar || {}).villagerId);
            const wit = roster[Math.floor(Math.random() * roster.length)];
            if (wit && !(e.knowers || []).includes(wit)) {
              e.knowers.push(wit);
              const first = String(this.displayName(wit)).split(' ')[0];
              this.say(`${first} came back from the treeline white-faced. Saw it too. Whatever it is, it's still out there.`);
              this.monsterNewsCheck(mid);
            }
          }
          if (e.villageName || !e.namingKicked) continue;
          const roster = ((this.state.village || {}).roster || []).filter(id => id !== (scholar || {}).villagerId);
          for (const vid of roster) {
            if (!e.proposals[vid] && Math.random() < 0.5) e.proposals[vid] = this.generateMonsterName(mid, vid);
          }
          this.monsterNamingCheck(mid);
        }
      } catch (e2) {}
      // regrow: extracted so the distant-village catch-up sim can run it per
      // simulated day too — their turf regrows while they live, not just when
      // the player's own day turns.
      this.regrowTiles();
      // SLICE 2: System arrival and timed events.
      this.checkSystemArrival();
      this.checkTimedEvents();
      // LEADER: morning briefing — village knowledge flows to you post-arrival.
      try { this.villageBriefing(); } catch (e) {}
      // CONTESTS (Steve 2026-10-05): the show runs on a schedule. 2/week max.
      try {
        // Resolve pending contest (countdown fired)
        const pc = this.state.pendingContest;
        if (pc && (this.state.scholar.day || 1) >= pc.firesDay) {
          this.resolveContest();
        }
        // Tick for new events
        const event = this.contestTick();
        if (event && event.id) {
          // It's a contest (has id) vs show (just desc)
          if (this.contestPool().find(c => c.id === event.id)) {
            this.fireContest(event);
          } else {
            // TV show pull
            this.sysSay(`📺 TONIGHT: ${event.name}. ${event.desc}`);
            this.leadShift('showmanship', 1);
          }
        }
      } catch (e) {}
      // PROMISES ROT: unchecked daily — 7+ days ignored and they break.
      try { this.checkPromises(); } catch (e) {}
      // evening: run metabolism
      scholar._preDayHealth = scholar.health;
      // WEATHER: the sky does what it wants. Clear most days, rain sometimes, cold snaps.
      // rain_dancer: when it rains, +1L water free. (You dance. It works.)
      // cold_blooded: on cold days your body budgets — 20% less food needed.
      const wr = Math.random();
      this.state.weather = wr < 0.7 ? 'clear' : wr < 0.9 ? 'rain' : 'cold';
      if (this.state.weather === 'rain') {
        const catchL = Math.round(this.modTarget('water.rain_catch', 0));
        if (catchL > 0) {
          this.addWater(catchL, 'clean', 'rain');
          this.say(`Rain. You dance. It works. +${catchL}L clean water. (rain_dancer)`);
        } else this.say('Rain. Steady, cold, honest rain.');
      } else if (this.state.weather === 'cold') {
        this.say('A cold snap. Breath smokes. The woods go quiet.');
        if (this.hasAbility('cold_blooded')) {
          scholar.kcal += 440; // 20% of the 2200 daily need, returned
          this.say('Cold-blooded: your body budgets like an accountant. (-20% food need today)');
        }
      }
      // METABOLIC DRAIN: conservation of energy. System abilities cost food every day.
      // Power is a trade, not a tax — the System takes its cut in calories.
      const metDrain = this.metabolicDaily();
      if (metDrain > 0) {
        scholar.kcal -= metDrain;
        if (scholar.kcal < 500) this.say(`The System's gifts are hungry: -${metDrain} kcal metabolic cost. Feed the power or lose it.`);
      }
      // THE BANK: the war chest leaks overnight — use it or lose it.
      if (this.overnightBankBurn) this.overnightBankBurn();
      // ant_trail: ants know where the water is. 30% chance they lead you to some.
      if (this.hasAbility('ant_trail') && Math.random() < 0.3) {
        this.addWater(1, 'risky', 'ant-trail seep');
        this.say('Ants march past your boot, laden. You follow them to a seep. +1L water (risky). (ant_trail)');
      }
      // symbiote: it eats 200 kcal/day (in its metabolic cost) but purifies 1L of risky water daily.
      if (this.hasAbility('symbiote')) {
        const bottles = scholar.water || [];
        const risky = bottles.find(b => b.quality === 'risky' && !b.chemical);
        if (risky) {
          risky.quality = 'clean'; risky.source = (risky.source || '') + ' (symbiote-purified)';
          this.say('Your gut-tenant worked overnight: 1L of water is clean now. It hums, satisfied. (symbiote)');
        }
      }
      const res = S.calories.resolveDay(scholar, this.state.village);
      res.warnings.forEach(w => this.say('⚠ ' + w));
      // RELIC BOND: the game notices what you carried and used.
      this.accrueRelicBond();
      // RELIC — resolve: once per day, ignore the spiral's health damage.
      // You look at the thing you carry. Not today.
      if (this.hasRelicEnhancement('resolve') && !scholar.relicResolveUsed && scholar.health < scholar._preDayHealth) {
        scholar.health = scholar._preDayHealth;
        scholar.relicResolveUsed = true;
        const ri = this.relicItems().find(r => (r.enhancements || []).includes('resolve'));
        this.say(`You hold your ${ri ? ri.name : 'relic'}. Not today. (Resolve: today's health damage ignored.)`);
      }
      scholar._preDayHealth = scholar.health; // reset baseline after resolve/anchor adjudication
      // RELIC — anchor: when death would take you, hold at 1. Once per 30 days.
      if (scholar.health <= 0 && this.hasRelicEnhancement('anchor') && (scholar.relicAnchorDay || -99) + 30 <= scholar.day) {
        scholar.health = 1;
        res.ok = true; // the anchor refuses. death does not take you today.
        scholar.relicAnchorDay = scholar.day;
        const ai = this.relicItems().find(r => (r.enhancements || []).includes('anchor'));
        this.say(`Your ${ai ? ai.name : 'relic'} holds you here. Not yet. (Anchor: death refused, once per season.)`);
      }
      // the village eats whether you're there or not — every day you're out, the
      // mouths at home. YOUR meal is physical: villageMeal only serves at haven
      // (see the gate there); the away player's roster draw is skipped too.
      // JOINED VILLAGE: while you're one of them and at their fire, THEIR day
      // sims too — they forage, eat, starve, learn. Before, only your meal
      // moved their pantry; ten people lived on nothing.
      try { this.tickJoinedVillage(); } catch (e) {}
      this.villageMeal();
      this.villageLives();
      this.villageEats();
      this.checkTraps();
      try { this.checkNets(); } catch (e) {}
      try { this.checkGenesis(); } catch (e) {}
      // JACKPOT: rare knowledgeable stranger. "Occasionally you hit a vein."
      try { this.maybeJackpotStranger(); } catch (e) {}
      // SOCIAL SIMMER: old wounds surface slowly. The village has a life you only partly see.
      this.socialSimmer();
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
        if (this.maybeCheatDeath()) {
          this.say('Death knocked. Something else answered.');
        } else {
          // the village is the protagonist: the mantle passes, the story continues.
          try { this.playerDeath('the night'); } catch (e) { this.over = true; }
          this.returnToVillage();
          return this.status();
        }
      }
      scholar.day += 1;
      scholar.relicResolveUsed = false;
      this.dayPart = 0; this.ap = 1;
      scholar.dayTicks = 0; scholar.actionClock = 0; // action clock: new day, fresh budget
      this.say(`— DAY ${scholar.day} DAWN — ${DAY_PART_HINT.dawn}`);
      // SPOILAGE (hunter loop): overnight, rotten food leaves the pack —
      // announced, never silent. Neglect has a visible cost.
      try { this.sweepSpoiled(); } catch (e) {}
      this.save();
      return this.status();
    },

    // --- combat ---
    // === TURN-BASED GRID COMBAT ===
    // Combat happens on the 9x9 detail grid. Everyone acts in speed order.
    // Movement is turn-limited (speed squares), not day-part limited.
    //
    // KNOWLEDGE PHILOSOPHY: attacks are NEVER shown as red squares.
    // The monster gives BEHAVIORAL CUES ("It freezes. Light gathers behind
    // its eyes.") — that's the telegraph. You must LEARN what each cue means
    // by surviving it. The Codex records patterns you've lived through, and
    // only then does the cue come with understanding.
    //
    // Party: nearby villagers join and act on their own AI (brave/cautious/
    // helpful from temperament). They don't just follow you.

    // PLAYER SPEED (Steve 2026-10-05): 3, not 4. Four moves is a lot —
    // fleeing by running should be hard, not a given. Movement is deliberate.
    playerSpeed() { return 3; },

    // LEADERSHIP VECTOR (Steve 2026-10-04, preserved 2026-10-05): the ending
    // is the sum of how you led. Tracked across the game, felt before arrival.
    // Dimensions: force vs diplomacy, showmanship, System stance, humanity's
    // shape (unified/fractured), moral ledger (food truth shared or hoarded).
    // Ending frames: Indispensable, Feared, Beloved, Witness, Defiant, Assimilated.
    leadership() {
      this.state.leadership = this.state.leadership || {
        force: 0, diplomacy: 0,
        showmanship: 0,
        systemCoop: 0, systemDefiant: 0,
        unity: 0, fracture: 0,
        protection: 0, betrayal: 0,
        foodShared: 0, foodHoarded: 0,
      };
      return this.state.leadership;
    },
    leadShift(dim, amount) {
      const l = this.leadership();
      l[dim] = (l[dim] || 0) + (amount || 1);
    },
    // Earned ending frame based on dominant vector
    earnedEnding() {
      const l = this.leadership();
      const scores = {
        indispensable: (l.protection || 0) + (l.unity || 0) + (l.foodShared || 0),
        feared: (l.force || 0) + (l.systemDefiant || 0),
        beloved: (l.diplomacy || 0) + (l.showmanship || 0) + (l.protection || 0),
        witness: (l.systemDefiant || 0) + (l.foodShared || 0) + (l.diplomacy || 0),
        defiant: (l.systemDefiant || 0) + (l.force || 0) + (l.fracture || 0),
        assimilated: (l.systemCoop || 0) + (l.showmanship || 0),
      };
      let best = 'indispensable', bestScore = -1;
      for (const [k, v] of Object.entries(scores)) {
        if (v > bestScore) { bestScore = v; best = k; }
      }
      return best;
    },

    // READINESS (Steve 2026-10-05): strong enough as a species to start the
    // galactic conversation. Composite: Strength (wave 4 slain) + Knowledge
    // (codex %) + Society (pop + stability) + Integration (system level).
    // Target: day 80-90 for a focused player in a 100-day campaign.
    readiness() {
      let score = 0;
      const max = 100;
      // Strength: 25 pts (slay a wave-4 monster)
      if ((this.state.wave4Slain || 0) > 0) score += 25;
      // Knowledge: 25 pts (codex completion)
      const codex = this.state.codex || {};
      const mCount = Object.keys(codex.monsters || {}).length;
      const pCount = Object.keys(codex.plants || {}).length;
      const totalMonsters = (this.data.monsters || []).length;
      // Assume ~50 plants (rough)
      const knowledgePct = Math.min(1, (mCount + pCount) / (totalMonsters + 50));
      score += Math.round(knowledgePct * 25);
      // Society: 25 pts (population + stability)
      const pop = (this.state.village.roster || []).length;
      const popScore = Math.min(1, pop / 16); // 16 = thriving
      // Stability: low starvation, low exile
      const starving = (this.state.village.starving || 0);
      const stability = starving > 0 ? 0.5 : 1;
      score += Math.round(popScore * stability * 25);
      // Integration: 25 pts (system level)
      const sysLevel = this.state.systemIntegration || 0; // 0-3
      score += Math.round((sysLevel / 3) * 25);
      return { score, max, ready: score >= 80 };
    },

    // THREAT RATING (Steve 2026-10-05): the System tracks your power to cast
    // appropriate monsters. It's a TV show — boring fights don't get renewed.
    // Rating = gear + stats + party + performance. Waves unlock by rating.
    threatRating() {
      const s = this.state.scholar;
      let rating = 0;
      // Gear: weapon bonus + armor
      const w = this.equippedWeapon();
      rating += (w.bonus || 0) * 2; // spear +25 = 50 rating
      rating += (w.range || 1) * 5;  // range 2 = 10
      // Armor (if any)
      const armor = (s.equipped || {}).armor;
      if (armor) rating += 15;
      // Stats: Better Human (each point above 5 = 2 rating)
      for (const stat of ['strength', 'endurance', 'perception', 'agility', 'presence']) {
        const v = (s.stats || {})[stat] || 5;
        if (v > 5) rating += (v - 5) * 2;
      }
      // Party: each villager = 10
      const party = (this.state.party || []).length;
      rating += party * 10;
      // Performance: win streak bonus (up to +20)
      const wins = (this.state.combatWins || 0);
      const losses = (this.state.combatLosses || 0);
      if (wins + losses > 0) {
        const winRate = wins / (wins + losses);
        if (winRate > 0.7 && wins >= 3) rating += 20;
        else if (winRate > 0.5) rating += 10;
      }
      return Math.round(rating);
    },

    // WAVE UNLOCK (Steve 2026-10-05, revised): day-based with kill minimums.
    // The show has a schedule. You can't cheese it with a lucky weapon find.
    // 100-day campaign: waves at 8 / 25 / 50 / 75. Win ~day 85-95.
    // Wave 1: always — hummice, moths, raccoons, toads
    // Wave 2: day 8+ AND 4 wave-1 kills (village-wide, not just player)
    // Wave 3: day 25+ AND 8 wave-2 kills
    // Wave 4: day 50+ AND 5 wave-3 kills
    // (Wave 4 is the apex; readiness win comes after proving yourself there.)
    unlockedWave() {
      const day = this.state.scholar.day || 1;
      const kills = this.state.waveKills || {}; // {1: n, 2: n, 3: n}
      if (day >= 50 && (kills[3] || 0) >= 5) return 4;
      if (day >= 25 && (kills[2] || 0) >= 8) return 3;
      if (day >= 8 && (kills[1] || 0) >= 4) return 2;
      return 1;
    },
    // Track kills by wave for unlock gates
    recordWaveKill(monsterId) {
      const mdef = this.data.monsters.find(m => m.id === monsterId);
      if (!mdef) return;
      const wave = mdef.wave || 1;
      this.state.waveKills = this.state.waveKills || {};
      this.state.waveKills[wave] = (this.state.waveKills[wave] || 0) + 1;
      // Wave 4 slain feeds readiness
      if (wave === 4) this.state.wave4Slain = (this.state.wave4Slain || 0) + 1;
    },

    // Can this monster appear? Checks wave assignment.
    monsterWaveAvailable(monsterId) {
      const mdef = this.data.monsters.find(m => m.id === monsterId);
      if (!mdef) return false;
      const wave = mdef.wave || 1;
      return wave <= this.unlockedWave();
    },

    // CASTING (Steve 2026-10-05): the System casts a monster appropriate to
    // your wave. Weighted random within the unlocked wave — variety, but never
    // over-leveled. The show must be entertaining, not a slaughter.
    // RATIOS (Steve 2026-10-05): new wave dominates. Old waves still spawn
    // but less often. Each new wave shifts the ratios.
    castMonster() {
      const wave = this.unlockedWave();
      const pool = this.data.monsters.filter(m => (m.wave || 1) <= wave);
      if (!pool.length) return 'hummice'; // fallback
      // Ratios: 60% current wave, 25% previous, 15% older
      // (Wave 1: 100% wave 1. Wave 2: 60% w2, 40% w1. Wave 3: 60% w3, 25% w2, 15% w1.)
      const r = Math.random();
      let targetWave;
      if (wave === 1) {
        targetWave = 1;
      } else if (wave === 2) {
        targetWave = r < 0.6 ? 2 : 1;
      } else if (wave === 3) {
        targetWave = r < 0.6 ? 3 : (r < 0.85 ? 2 : 1);
      } else { // wave 4
        targetWave = r < 0.6 ? 4 : (r < 0.8 ? 3 : (r < 0.95 ? 2 : 1));
      }
      const candidates = pool.filter(m => (m.wave || 1) === targetWave);
      if (!candidates.length) {
        // Fallback to any in pool
        return pool[Math.floor(Math.random() * pool.length)].id;
      }
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      // VARIANT (Steve 2026-10-05): old-wave monsters that spawn in a new wave
      // are hardened veterans — stronger, with a twist. The old stuff doesn't
      // stay weak. (Variant applied at spawn in startCombat.)
      const isVeteran = targetWave < wave;
      return { id: pick.id, veteran: isVeteran };
    },

    startCombat(monsterId) {
      const s = this.state.scholar;
      const px = s.mx ?? 4, py = s.my ?? 4;
      // WANDERER CONTACT (forager loop 2026-10-05): the "Face it" button calls
      // startCombat() with no id — the monster that walked into you is
      // pendingMonsterId, not the default bulldozer. The panel names it right;
      // the fight must spawn it right.
      const mid = monsterId || this.pendingMonsterId || 'bulldozer';
      const mdef = this.data.monsters.find(m => m.id === mid) || this.data.monsters[0];
      // FIRST-CONTACT FLASH (Steve 2026-10-05): after the System comes online,
      // the first encounter with a monster species flashes a freaky pixelated
      // rendition on the HUD. Horror beyond emoji. Triggered here, rendered by app.js.
      const codexStage = (this.state.codex.monsters[mdef.id] || {}).stage;
      if (this.state.systemArrived && !codexStage && typeof window !== 'undefined' && window.__monsterFlash) {
        try { window.__monsterFlash(mdef.id, mdef.emoji || '👹'); } catch (e) {}
      }
      // VETERAN VARIANT (Steve 2026-10-05): old-wave monsters in a new wave
      // are hardened. +50% HP, +3 damage, +1 speed. They've survived too.
      const isVeteran = (s.monster && s.monster.veteran) || false;
      if (isVeteran) {
        this.say(`⚠ This one is different — scarred, seasoned. A veteran.`);
      }
      const detail = this.genDetail(this.map.px, this.map.py);
      const terrainBlocked = (x, y) => {
        const cell = detail[y] && detail[y][x];
        return this.cellProps(cell).blocks;
      };
      const freeSpotNear = (cx, cy, taken) => {
        for (let r = 1; r <= 4; r++) {
          for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || nx > 8 || ny < 0 || ny > 8 || (nx === px && ny === py)) continue;
            if (taken.has(nx + ',' + ny)) continue;
            if (!terrainBlocked(nx, ny)) return { x: nx, y: ny };
          }
        }
        return { x: cx, y: cy };
      };

      const fighters = [];
      fighters.push({
        key: 'p', kind: 'player', name: 'You', emoji: '🧑',
        hp: s.health, maxHp: this.maxHealth ? this.maxHealth() : 100,
        speed: this.playerSpeed(), mx: px, my: py,
        alive: true, fled: false, moveLeft: 0, acted: false, aimed: false,
      });
      // party: villagers within 4 squares join the fight (nearest 4 — no zerg)
      const vpos = (this.state.village && this.state.village.positions) || {};
      const roster = (this.state.village && this.state.village.roster) || [];
      const candidates = [];
      for (const rid of roster) {
        const pos = vpos[rid];
        if (!pos) continue;
        const d = Math.max(Math.abs(pos.mx - px), Math.abs(pos.my - py));
        if (d > 4) continue;
        candidates.push({ rid, pos, d });
      }
      candidates.sort((a, b) => a.d - b.d);
      for (const { rid, pos } of candidates.slice(0, 4)) {
        const vp = (this.data.villagers || []).find(v => v.id === rid)
          || (this.data.background_survivors || []).find(v => v.id === rid);
        if (!vp) continue;
        const temp = (vp.personality && vp.personality.temperament) || 'steady';
        const ai = temp === 'bold' ? 'brave' : temp === 'cautious' ? 'cautious' : 'helpful';
        fighters.push({
          key: 'v_' + rid, kind: 'villager', villagerId: rid,
          name: this.displayName(rid), emoji: '🧍',
          hp: 30, maxHp: 30, speed: 3, mx: pos.mx, my: pos.my,
          alive: true, fled: false, ai, helped: false,
        });
      }
      // monsters: behavior drives count (pack/swarm bring friends)
      const count = mdef.pack || 1;
      const srcMx = (s.monster && s.monster.mx !== undefined) ? s.monster.mx : px;
      const srcMy = (s.monster && s.monster.my !== undefined) ? s.monster.my : py;
      const hasFear = this.hasAbility('fear_aura');
      const hasSand = this.hasAbility('pocket_sand');
      // PACK SPAWN (Steve 2026-10-05): all members visible from the start,
      // on distinct tiles. No stacking — the pack reads as a pack immediately.
      const takenSpots = new Set([srcMx + ',' + srcMy, px + ',' + py]);
      // SNAKE SPAWN (Steve 2026-10-05): ducks in a row — segments in a line.
      // Head at source, body trails behind. Each segment is a fighter.
      if (mdef.snake) {
        const segs = mdef.snake.segments || 6;
        const snakeId = 'snake_' + Date.now();
        // Line extends away from player
        const dx = Math.sign(srcMx - px) || 1, dy = Math.sign(srcMy - py) || 0;
        for (let i = 0; i < segs; i++) {
          const sx = Math.max(0, Math.min(8, srcMx + dx * i));
          const sy = Math.max(0, Math.min(8, srcMy + dy * i));
          // If blocked, try adjacent
          let fx = sx, fy = sy;
          if (terrainBlocked(fx, fy) || takenSpots.has(fx + ',' + fy)) {
            const alt = freeSpotNear(srcMx, srcMy, takenSpots);
            fx = alt.x; fy = alt.y;
          }
          takenSpots.add(fx + ',' + fy);
          let hp = mdef.hp[0] + Math.floor(Math.random() * (mdef.hp[1] - mdef.hp[0]));
          let spd = mdef.speed || 5;
          if (isVeteran) { hp = Math.round(hp * 1.5); spd += 1; }
          fighters.push({
            key: 'm_snake_' + i, kind: 'monster', monsterId: mdef.id,
            name: (isVeteran ? 'Veteran ' : '') + this.monsterDisplayName(mdef.id) + (i === 0 ? ' (head)' : ` (${i + 1})`),
            emoji: mdef.emoji || '🦆',
            hp, maxHp: hp, speed: spd, mx: fx, my: fy,
            alive: true, fled: false, telegraph: null, mdef,
            hesitate: 0, blind: 0, stunned: 0,
            // Snake-specific
            snakeId, segmentIndex: i, isHead: i === 0,
            threatQueue: [],
            veteran: isVeteran,
          });
        }
      } else for (let i = 0; i < count; i++) {
        const spot = i === 0 ? { x: srcMx, y: srcMy } : freeSpotNear(srcMx, srcMy, takenSpots);
        takenSpots.add(spot.x + ',' + spot.y);
        let hp = mdef.hp[0] + Math.floor(Math.random() * (mdef.hp[1] - mdef.hp[0]));
        let spd = mdef.speed || 3;
        if (isVeteran) { hp = Math.round(hp * 1.5); spd += 1; }
        fighters.push({
          key: 'm_' + i, kind: 'monster', monsterId: mdef.id,
          name: (isVeteran ? 'Veteran ' : '') + this.monsterDisplayName(mdef.id) + (count > 1 ? ' ' + (i + 1) : ''), emoji: mdef.emoji || '👹',
          hp, maxHp: hp, speed: spd, mx: spot.x, my: spot.y,
          alive: true, fled: false, telegraph: null, mdef,
          hesitate: hasFear ? 1 : 0, blind: hasSand ? 2 : 0, stunned: 0,
          beamCooldown: 0, dwellTaught: false,
          beamPhase: (mdef.encounter && mdef.encounter.phaseMap && mdef.encounter.phaseMap.idle) || 'stalk',
          threatQueue: [],
          veteran: isVeteran,
        });
      }

      this.tbfight = {
        fighters,
        order: S.combat.turnOrder(fighters),
        turnIdx: 0, round: 1,
        over: false, result: null,
      };
      // HIGHBEAM: anyone already too close is on the list from the first
      // bell — silently. The deer will announce itself soon enough.
      try {
        for (const mo of this.tbfight.fighters) {
          if (!this.encUsesFifo(mo)) continue;
          for (const o of this.tbfight.fighters) {
            if (!o.alive || o.fled || o.key === mo.key) continue;
            if (!S.combat.isFoe(mo, o)) continue;
            const d = Math.max(Math.abs(o.mx - mo.mx), Math.abs(o.my - mo.my));
            if (d <= this.encNoticeRange(mo) && this.canSee(mo.mx, mo.my, o.mx, o.my)) {
              this.encNoticeFighter(mo, o.key, true);
            }
          }
        }
      } catch (e) {}
      // MONSTER BATCH 2: per-monster fight init — opening phases and patter.
      try {
        const f0 = this.tbfight;
        f0.humStacks = 0; f0.humMice = null; f0.shouts = 0; f0.humDecayRound = -1;
        for (const mo of f0.fighters) {
          if (mo.kind !== 'monster') continue;
          if (this.lockpickIs(mo)) {
            mo.beamPhase = 'case'; mo.stolen = null; mo.lockpickHit = false; mo.cased = false;
            // First contact: dread, not a lecture (Steve 2026-10-05). The
            // steal-first warning only lands once you've seen it happen.
            this.say('It sits up on its hind legs — hands moving too fast to follow. It\'s not looking at you. It\'s looking at your pack.');
            const lstage = (this.ensureMonsterEntry('lockpick_raccoon') || {}).stage;
            if (lstage === 'observed' || lstage === 'slain') {
              this.say('(It steals FIRST. Guard your things — or buy it off with food.)');
            }
            this.audioEvent('lockpickChitter');
          } else if (this.catfishIs(mo)) {
            mo.beamPhase = 'lure'; mo.catfishDark = 0; mo.lureSaid = false;
            this.say('A soft green glow pulses in the dark water. Pretty. That\'s the problem — it\'s pretty.');
            this.audioEvent('catfishLure');
          } else if (this.humiceIs(mo) && !f0.humNoticed) {
            // HUMMICE (Steve 2026-10-05): first contact is dread, not a
            // lecture. The tactical read only appears once the pattern is
            // earned (codex observed/slain). First-timers learn by doing —
            // the fight's feedback lines teach through sensation.
            f0.humNoticed = true;
            this.say('The grass is humming. In harmony. That\'s not grass — that\'s fifty throats, one note, and it\'s getting louder.');
            const hstage = (this.ensureMonsterEntry('hummice') || {}).stage;
            if (hstage === 'observed' || hstage === 'slain') {
              this.say('You know this hum now. It STACKS while you stand in it. Kill one and the choir stutters. Keep moving and it can\'t settle. Or SHOUT (📢) — noise breaks the music.');
            } else {
              this.say('Your teeth ache with it. You don\'t know what it wants.');
            }
            this.audioEvent('humNotice');
          }
        }
      } catch (e) {}
      // ALIVE: the village hears it. fear is contagious.
      try { this.villageEvent('monster_attack'); } catch (e) {}
      // REPUTATION: fighting is observed. Brave villagers respect it,
      // cautious ones call it reckless, rivals call it showing off.
      try { this.observe('fight'); } catch (e) {}
      this.fight = null; // old menu combat retired
      this.pendingEncounter = false;
      this.pendingMonsterId = null;
      // face to face: the ambiguity does NOT end. Descriptor and dread, not a name.
      try { this.identifyMonster(mdef.id); } catch (e) {}
      s.monster = null; // it's in the fight now, not wandering
      const partyNames = fighters.filter(f => f.kind === 'villager').map(f => f.name);
      const dispName = this.monsterDisplayName(mdef.id);
      this.say(`⚔ ${dispName.toUpperCase()}!${count > 1 ? ` (${count} of them!)` : ''} ${partyNames.length ? partyNames.join(', ') + (partyNames.length > 1 ? ' join' : ' joins') + ' you!' : "You're on your own."}`);
      if (hasFear) this.say('Something about you is wrong. It hesitates. (fear_aura)');
      if (hasSand) this.say('You fling a handful of grit into its eyes. (pocket_sand: blinded)');
      this.say('Turn-based now. Tap a tile to move — speed is squares. Then act.');
      this.audioEvent('combatStart');
      // WITNESS JUDGEMENT (Steve 2026-10-05): people nearby SEE the fight and
      // they react visibly — not just silent reputation dims. Brave ones watch,
      // cautious ones back away, rivals judge.
      try { this.combatWitnessReact('start'); } catch (e) {}
      // AGGRO-GATED TERROR (Steve): the deer's wrong-sounding call plays only
      // if it actually sees you at combat start (silent seeding found someone).
      // Otherwise it's just a deer — the terror starts when it notices.
      try {
        const mo = this.tbfight.fighters.find(x => this.deerIs(x));
        if (mo && (this.encThreatQueue(mo) || []).length > 0) this.audioEvent('deerNotice');
      } catch (e) {}
      // Config-driven notice audio for other monsters (batch 1).
      try {
        const scCfg = mdef.encounter || {};
        if (scCfg.noticeAudio) this.audioEvent(scCfg.noticeAudio);
      } catch (e) {}
      // HUSHWOLF: the pack arrives as a pack — the first fighter is the lead.
      // The birds go quiet. That IS the telegraph.
      if (mdef.id === 'hushwolf') {
        const wolves = fighters.filter(x => x.kind === 'monster');
        if (wolves[0]) wolves[0].wolfLead = true;
        this.say('The woods go silent — not quiet. Silent. Like the world holding its breath. The pack is already moving.');
      }
      this.sysSay(`COMBAT! ${dispName.toUpperCase()}! The gamblers lean in. ROUND 1 — FIGHT!`);
      // OPENING TURNS (Steve 2026-10-04): if a monster is faster than you it
      // opens — run AI turns until it's your turn. Without this the fight
      // soft-locks on "Not your turn" forever (hummice speed 6 > player 4).
      // turnIdx = -1: tbAdvance() pre-increments, so the opening pass starts
      // at order[0] — the fastest fighter gets its opening turn (previously
      // the first fighter in the order was silently skipped).
      this.tbfight.turnIdx = -1;
      this.tbBeginTurn(); // no-op until a turn lands; tbAdvance calls it on arrival
      if (!this.tbIsPlayerTurn()) this.tbAdvance();
      return this.tbfight;
    },

    tbFighter(key) {
      const f = this.tbfight;
      return f ? f.fighters.find(x => x.key === key) : null;
    },

    tbCurrent() {
      const f = this.tbfight;
      if (!f || f.over) return null;
      return this.tbFighter(f.order[f.turnIdx]);
    },

    tbIsPlayerTurn() {
      const c = this.tbCurrent();
      return !!(c && c.kind === 'player');
    },

    tbBeginTurn() {
      const c = this.tbCurrent();
      if (!c) return;
      if (c.kind === 'player') { c.moveLeft = c.speed; c.acted = false; c.beamTicks = 0; }
      this.tbRefreshTelegraphUI();
    },

    // === earned knowledge ===
    // Pattern descriptions: what the Codex writes after you've SURVIVED an attack.
    tbPatternDesc(pattern) {
      const t = (pattern && pattern.type) || 'burst';
      if (t === 'beam' && pattern && pattern.sweep) {
        return 'fires a sweeping beam that tracks you while it burns — outrun it sideways, block it with walls, or close in and break its aim';
      }
      return {
        beam: 'fires in a straight line from itself',
        charge: 'charges in a straight line, trampling everything in its path',
        line: 'strikes in a straight line',
        burst: 'hits everything close around it',
        direct: "locks onto one target — moving won't dodge it",
        rush: 'gives no warning — it just moves and hits',
        ambush: 'strikes without warning when you get close',
      }[t] || 'hits an area around it';
    },

    tbPatternKnown(monsterId, attackName) {
      const c = (this.state.codex.monsters || {})[monsterId];
      return !!(c && c.patterns && c.patterns[attackName]);
    },

    // Called when an attack resolves and you live to think about it.
    // Knowledge is earned, not given.
    tbLearnPattern(m) {
      const p = this.tbFighter('p');
      if (!p || !p.alive) return; // the dead learn nothing
      const atk = m.mdef.attack || {};
      if (!atk.name) return;
      this.state.codex.monsters = this.state.codex.monsters || {};
      const c = this.state.codex.monsters[m.mdef.id] || (this.state.codex.monsters[m.mdef.id] = {});
      c.patterns = c.patterns || {};
      if (!c.patterns[atk.name]) {
        c.patterns[atk.name] = this.tbPatternDesc(atk.pattern);
        this.say(`📖 Codex: ${atk.name} — ${c.patterns[atk.name]}. You won't forget this.`);
      }
    },

    // === SWEEPING BEAM (Highbeam Deer) ===
    // Walls and real structures stop the beam. Trees, brush, rubble, water
    // do not — the beam shreds straight through them to the edge of the node.
    beamBlockingCells() { return { wall: 1, tent: 1, door: 1, fire: 1 }; },

    // tbBeamCells: rasterized line from the deer through the aim point, past
    // it to the grid edge, truncated at the first wall/structure. The aim
    // cell is always on the line by construction. The blocking cell itself
    // is included (impact point — it scorches, nothing can stand there anyway).
    // Returns {cells, dir}.
    tbBeamCells(mx, my, aimX, aimY, lastDir) {
      let dx = aimX - mx, dy = aimY - my;
      if (dx === 0 && dy === 0) { dx = lastDir ? lastDir.x : 0; dy = lastDir ? lastDir.y : 1; }
      const dir = { x: Math.sign(dx), y: Math.sign(dy) };
      const blockers = this.beamBlockingCells();
      const detail = this.genDetail(this.map.px, this.map.py);
      const cells = [];
      const steps = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
      const ux = dx / steps, uy = dy / steps;
      let guard = 0;
      for (let t = 1; guard++ < 24; t++) {
        const cx = Math.round(mx + ux * t), cy = Math.round(my + uy * t);
        if (cx < 0 || cx > 8 || cy < 0 || cy > 8) break;
        const last = cells[cells.length - 1];
        if (last && last.cx === cx && last.cy === cy) continue;
        cells.push({ cx, cy });
        const cell = detail[cy] && detail[cy][cx];
        if (cell && blockers[cell]) break;
      }
      return { cells, dir };
    },

    // Live beam-lane cells for the grid overlay (windup + firing).
    // CODEX-GATED: until you've learned the deer's behavior, the windup
    // shows NO lane — you see it freeze and aim, not where the beam will
    // start. Once the beam is live (firing), it's light: you see it.
    tbBeamLaneCells() {
      const f = this.tbfight;
      const set = new Set();
      if (!f) return set;
      for (const m of f.fighters) {
        if ((m.kind !== 'monster' && m.kind !== 'hostile') || !m.alive || !m.telegraph) continue;
        if (this.encUsesFifo(m) && !(m.telegraph.firing > 0) && !this.encTelegraphKnown(m)) continue;
        for (const c of (m.telegraph.cells || [])) set.add(c.cx + ',' + c.cy);
      }
      return set;
    },

    // Previous-tick lane cells: rendered as a fading ghost so the sweep is
    // VISIBLE — the beam doesn't teleport, it rotates, and you see the arc.
    tbBeamPrevLaneCells() {
      const f = this.tbfight;
      const set = new Set();
      if (!f) return set;
      const live = this.tbBeamLaneCells();
      for (const m of f.fighters) {
        if ((m.kind !== 'monster' && m.kind !== 'hostile') || !m.alive || !m.telegraph) continue;
        for (const c of (m.telegraph.prevCells || [])) {
          const k = c.cx + ',' + c.cy;
          if (!live.has(k)) set.add(k);
        }
      }
      return set;
    },

    tbBeamIsFiring() {
      const f = this.tbfight;
      if (!f) return false;
      return f.fighters.some(m => (m.kind === 'monster' || m.kind === 'hostile') && m.alive && m.telegraph && m.telegraph.firing > 0);
    },

    // Beam SOURCE cell: the deer's tile while charging/firing. The beam must
    // visibly EMANATE from the deer — the lane rasterization starts at t=1,
    // so without this the highlight floats disconnected from the beast.
    // Shown during charge AND firing (the freeze + glare are the cue).
    tbBeamSourceCell() {
      const f = this.tbfight;
      if (!f) return null;
      for (const m of f.fighters) {
        if ((m.kind !== 'monster' && m.kind !== 'hostile') || !m.alive || !m.telegraph) continue;
        if (!this.encUsesFifo(m)) continue;
        return m.mx + ',' + m.my;
      }
      return null;
    },

    // Beam HALO: cells adjacent to the live lane. The beam LIGHTS UP THE
    // NIGHT — the firing tiles and the ground around them visibly brighten.
    tbBeamHaloCells() {
      const f = this.tbfight;
      const set = new Set();
      if (!f || !this.tbBeamIsFiring()) return set;
      const lane = this.tbBeamLaneCells();
      for (const k of lane) {
        const [cx, cy] = k.split(',').map(Number);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          const kk = (cx + dx) + ',' + (cy + dy);
          if (!lane.has(kk)) set.add(kk);
        }
      }
      return set;
    },

    // ACTION-LOCKED SWEEP (Steve): the beam ticks per PLAYER ACTION, not per
    // turn. Every action the player takes — each tile moved, each strike,
    // each wait — the beam answers with one sweep tick. The deer "spends" the
    // player's action economy: move and the beam ticks toward you; hesitate
    // and it ticks anyway. The fight is a conversation, move for tick.
    tbBeamActionTick() {
      const f = this.tbfight;
      if (!f || f.over) return;
      for (const m of f.fighters) {
        if ((m.kind !== 'monster' && m.kind !== 'hostile') || !m.alive || !m.telegraph) continue;
        const tg = m.telegraph;
        const sweepBeam = !!((tg.pattern || {}).sweep && ((tg.pattern || {}).type === 'beam' || (tg.pattern || {}).type === 'line'));
        if (!(sweepBeam && tg.firing > 0)) continue;
        this.tbBeamSweepTick(m, tg);
        tg.firing -= 1;
        const p = this.tbFighter('p');
        if (p) p.beamTicks = (p.beamTicks || 0) + 1;
        if (tg.firing <= 0) this.tbBeamEndFiring(m, tg);
        this.tbRefreshTelegraphUI();
        if (this.tbEndCheck()) return;
      }
    },

    // The beam gutters out: cooldown, narration, audio. Shared by the
    // action-locked ticks (firing almost always ends mid-player-turn now).
    tbBeamEndFiring(m, tg) {
      const useFifo = this.encUsesFifo(m);
      const isDeer = this.deerIs(m);
      m.telegraph = null;
      // COOLDOWN: the deer is spent. It needs a breather before it can
      // gather the light again — your window to act.
      m.beamCooldown = (tg.pattern || {}).cooldownTurns || 2;
      if (useFifo) this.encSetPhase(m, 'cooldown');
      if (isDeer) this.audioEvent('deerSnort');
      this.tbLearnPattern(m);
      this.audioEvent('beamSweepStop');
      this.say(`The beam gutters out. ${m.name} sags — the light behind its eyes dims to embers. It needs a moment.`);
    },

    // One live-fire tick: the beam is a ray EMANATING FROM THE DEER that
    // ROTATES toward the player — it is not a free-floating chaser. Each tick
    // the beam gets an angular sweep budget; it spends budget rotating to
    // track the player, and UNSPENT budget becomes dwell damage: if you don't
    // move, it doesn't have to sweep — so it sits the full beam on you.
    // The lane redraws every tick from the deer's position along the angle.
    tbBeamSweepTick(m, tg) {
      const f = this.tbfight;
      if (!f) return;
      const pat = tg.pattern || {};
      const budget = pat.sweepRate || 0.65; // radians of rotation per fire tick
      // RELENTLESS: the queue may have changed since the last tick (pain,
      // adjacency). The beam follows the list — walking away doesn't lose it.
      if (this.encUsesFifo(m)) {
        const head = this.encCurrentTarget(m);
        if (head && head.key !== tg.aimKey) tg.aimKey = head.key;
      }
      let tgt = this.tbFighter(tg.aimKey || 'p');
      if (this.encUsesFifo(m) && (!tgt || !tgt.alive || tgt.fled)) {
        tgt = this.encCurrentTarget(m);
        if (tgt) tg.aimKey = tgt.key;
      }
      if (typeof tg.angle !== 'number') {
        const ax0 = (tg.aim ? tg.aim.x : m.mx) - m.mx, ay0 = (tg.aim ? tg.aim.y : m.my) - m.my;
        tg.angle = Math.atan2(ay0, ax0);
      }
      let used = 0;
      if (tgt && tgt.alive) {
        const want = Math.atan2(tgt.my - m.my, tgt.mx - m.mx);
        let d = want - tg.angle;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        used = Math.max(-budget, Math.min(budget, d));
        tg.angle += used;
        tg.swept = (tg.swept || 0) + Math.abs(used);
        // keep an aim point for audio/UI: the ray point at the target's range
        const dist = Math.hypot(tgt.mx - m.mx, tgt.my - m.my);
        tg.aim = { x: m.mx + Math.cos(tg.angle) * dist, y: m.my + Math.sin(tg.angle) * dist };
      }
      const unspent = Math.max(0, budget - Math.abs(used));
      tg.dwell = unspent / budget; // 0..1 — how little it had to move to track you
      // VISIBLE SWEEP: keep the previous lane so the UI can render the arc —
      // the beam rotates, it doesn't teleport.
      if ((tg.swept || 0) > 0.45 && !tg.sweepNarrated) {
        tg.sweepNarrated = true;
        this.say('The beam carves a bright arc across the ground, swinging after its target. It does not blink. It does not hurry.');
      }
      tg.prevCells = tg.cells || [];
      // rasterize the ray FROM THE DEER along the angle, to the node edge
      const far = 12;
      const r = this.tbBeamCells(m.mx, m.my, m.mx + Math.cos(tg.angle) * far, m.my + Math.sin(tg.angle) * far, tg.dir);
      tg.cells = r.cells; tg.dir = r.dir;
      this.scorchCells(tg.cells);
      const laneSet = new Set(tg.cells.map(c => c.cx + ',' + c.cy));
      const cA = Math.cos(tg.angle), sA = Math.sin(tg.angle);
      let hitAnyone = false, dwelledPlayer = false;
      // IGNITION BEAT: the beam is visibly here but not burning yet — the
      // player gets this tick to MOVE. Damage starts next tick.
      if (tg.ignition) {
        this.say('The light touches the ground where you were standing. It has not found you yet.');
      } else
      for (const o of f.fighters) {
        if (!o.alive || o.fled || o.key === m.key) continue;
        if (!S.combat.isFoe(m, o)) continue;
        if (!laneSet.has(o.mx + ',' + o.my)) continue;
        hitAnyone = true;
        // ON THE RAY: perpendicular distance from the fighter to the beam ray
        const pdx = o.mx - m.mx, pdy = o.my - m.my;
        const along = pdx * cA + pdy * sA;
        const perp = Math.abs(pdx * sA - pdy * cA);
        const onBeam = along > 0 && perp < 0.75;
        const trapped = onBeam && !this.tbHasEscape(o, laneSet);
        let mult = 1, verb;
        if (trapped) { mult = 3.5; verb = 'nowhere to run — the full beam PINS'; }
        else if (onBeam) {
          // DWELL: every radian it didn't have to spend tracking you, it
          // spends burning you. Stand still: mult up to 3.5. Make it chase: 2.5.
          mult = 2.5 + (tg.dwell || 0);
          verb = (tg.dwell || 0) > 0.6 ? "the beam doesn't need to sweep — it SITS on" : 'the beam SITS on';
          if (o.kind === 'player' && (tg.dwell || 0) > 0.6) dwelledPlayer = true;
        }
        else { verb = 'the beam rakes across'; }
        const dmg = Math.round(S.combat.roll(tg.dmg) * mult);
        const who = o.kind === 'player' ? 'you' : o.name;
        this.say(`🔥 ${verb} ${who}! (${dmg})`);
        this.tbDamage(o.key, dmg, m.name + "'s " + tg.attackName);
        if (f.over) return;
      }
      // TEACH THE TRADE: move and it chases (less burn); stand still and it parks.
      if (dwelledPlayer && !m.dwellTaught) {
        m.dwellTaught = true;
        this.say('It barely had to move to track you. MOVE and the beam has to chase — stand still and it parks the full beam on you.');
      }
      if (!hitAnyone) {
        if ((tg.dwell || 0) > 0.6) this.say('The beam holds its line, burning where you were. It did not have to move at all.');
        else this.say('The beam swings wide, scorching the earth where you were.');
      }
      // ANTLER SWEEP (close range): closing in to disrupt is risky.
      // During the beam, the thrash is a bonus punish — the beam still fires.
      this.tbAntlerThrash(m);
      if ((this.tbfight || {}).over) return;
      // AUDIO: the hum hunts with the beam — pan follows it across the stereo
      // field, heat rises as the aim closes in on the player.
      try {
        const pl = this.tbFighter('p');
        if (pl) {
          const dst = Math.max(Math.abs(tg.aim.x - pl.mx), Math.abs(tg.aim.y - pl.my));
          this.audioEvent('beamSweep', {
            pan: Math.max(-1, Math.min(1, (tg.aim.x - pl.mx) / 4)),
            heat: Math.max(0, 1 - dst / 6),
          });
        }
      } catch (e) {}
    },

    // RECHARGE PAW: the deer can't move while the light gathers — but crowding
    // it is still a mistake. A foreleg lashes out at anyone adjacent: modest
    // damage, aimed at the unprepared who thought the breather was free.
    // At spear range (2) it can't touch you. That's the answer.
    tbRechargePaw(m) {
      const f = this.tbfight;
      if (!f) return false;
      let hit = false;
      for (const o of f.fighters) {
        if (!o.alive || o.fled || o.key === m.key) continue;
        if (!S.combat.isFoe(m, o)) continue;
        if (Math.max(Math.abs(o.mx - m.mx), Math.abs(o.my - m.my)) > 1) continue;
        const d = S.combat.roll([8, 14]);
        const who = o.kind === 'player' ? 'you' : o.name;
        this.say(`It can't move — but a foreleg lashes out and catches ${who}. The breather isn't free up close. (${d})`);
        this.tbDamage(o.key, d, m.name + "'s paw");
        hit = true;
        if (f.over) return true;
      }
      return hit;
    },

    // BULLDOZE: charge lanes that never go around — trees, fences and brush
    // shred; only real walls stop them. (boar, mirror stag)
    tbBulldozeCells(cells) {
      const detail = this.genDetail(this.map.px, this.map.py);
      const blocks = this.beamBlockingCells();
      const cut = [];
      for (const c of cells || []) {
        const cell = detail[c.cy] && detail[c.cy][c.cx];
        // BULLDOZER (Steve 2026-10-05): it does NOT stop at trees/walls.
        // It smashes through them. The environment breaks.
        if (cell && blocks[cell]) {
          this.destroyCell(c.cx, c.cy, 'bulldozer');
          // Keep going — the charge continues through the wreckage
        }
        cut.push(c);
      }
      return cut;
    },

    // DESTROY CELL (Steve 2026-10-05): monsters break the environment.
    // Trees fall, walls crumble. The world remembers.
    // RULE (Steve 2026-10-05): Havens are the ONLY unbreakable structures.
    // (Plus alien structures, when they exist.) Everything else breaks.
    destroyCell(cx, cy, cause) {
      const detail = this.genDetail(this.map.px, this.map.py);
      if (!detail[cy] || !detail[cy][cx]) return;
      const cell = detail[cy][cx];
      const cellType = typeof cell === 'string' ? cell : cell.type;
      // UNBREAKABLE: haven structures and alien structures
      const unbreakable = ['tent', 'fire', 'hall', 'bunk', 'lodge', 'haven', 'sanct', 'base'];
      if (unbreakable.includes(cellType)) {
        this.say(`The ${cellType} holds. Havens do not break.`);
        return false;
      }
      const cellName = cellType || cell;
      // Clear the cell
      detail[cy][cx] = null;
      // Narrative
      const causes = {
        'bulldozer': `The Bulldozer SMASHES through the ${cellName}! Wood splinters, the ground shakes.`,
        'terraform': `The ground churns and reshapes itself.`,
      };
      this.say(causes[cause] || `The ${cellName} is destroyed!`);
      this.audioEvent('crash', { cause });
      // Mark the map as changed so it saves
      this.map.dirty = true;
      return true;
    },

    // TRAMPLE: the boar's missed charge ends here — grinding hooves on
    // whatever is close. This is the price of the dodge.
    tbBoarTrample(m) {
      const f = this.tbfight;
      if (!f) return;
      if (this.encUsesFifo(m)) this.encSetPhase(m, 'trample');
      this.say('It wheels at the end of its lane — and TRAMPLES, grinding hooves, at whatever is close.');
      this.audioEvent('boarTrample');
      let hit = false;
      for (const o of f.fighters) {
        if (!o.alive || o.fled || o.key === m.key) continue;
        if (!S.combat.isFoe(m, o)) continue;
        if (Math.max(Math.abs(o.mx - m.mx), Math.abs(o.my - m.my)) > 1) continue;
        hit = true;
        this.tbDamage(o.key, S.combat.roll([10, 16]), m.name + "'s trample");
        if (f.over) return;
      }
      if (!hit) this.say('Nothing in reach. It paws the earth, furious.');
    },

    // HERON DRIFT: after the strike it is somewhere else. You didn't see it move.
    tbHeronDrift(m) {
      const detail = this.genDetail(this.map.px, this.map.py);
      const opts = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = m.mx + dx, ny = m.my + dy;
        if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
        const cell = detail[ny] && detail[ny][nx];
        if (!this.cellProps(cell).blocks) opts.push([nx, ny]);
      }
      if (opts.length) {
        const pick = opts[Math.floor(Math.random() * opts.length)];
        m.mx = pick[0]; m.my = pick[1];
      }
      if (this.encUsesFifo(m)) this.encSetPhase(m, this.encPhaseFor(m, 'idle'));
      this.say("It is somewhere else now. You didn't see it move.");
    },

    // ANTLER THRASH: closing in is risky at any point in the fight.
    tbAntlerThrash(m) {
      const f = this.tbfight;
      if (!f) return false;
      let hit = false;
      for (const o of f.fighters) {
        if (!o.alive || o.fled || o.key === m.key) continue;
        if (!S.combat.isFoe(m, o)) continue;
        if (Math.max(Math.abs(o.mx - m.mx), Math.abs(o.my - m.my)) > 1) continue;
        const d = S.combat.roll([10, 16]);
        const who = o.kind === 'player' ? 'you' : o.name;
        this.say(`The ${m.name} thrashes its antlers at ${who} — getting close has a price. (${d})`);
        this.tbDamage(o.key, d, m.name + "'s antlers");
        hit = true;
        if (f.over) return true;
      }
      return hit;
    },

    // tbHasEscape: can this fighter reach any cell outside the lane within
    // one turn's movement? BFS over walkable cells.
    tbHasEscape(o, laneSet) {
      const budget = o.speed || 3;
      const detail = this.genDetail(this.map.px, this.map.py);
      const f = this.tbfight;
      if (!f) return true;
      const key = (x, y) => x + ',' + y;
      const occupied = new Set();
      for (const x of f.fighters) {
        if (x.alive && (x.kind === 'monster' || x.kind === 'hostile') && x.key !== o.key) occupied.add(key(x.mx, x.my));
      }
      const seen = new Set([key(o.mx, o.my)]);
      const queue = [[o.mx, o.my, 0]];
      while (queue.length) {
        const [x, y, d] = queue.shift();
        if (d > 0 && !laneSet.has(key(x, y))) return true;
        if (d >= budget) continue;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx > 8 || ny < 0 || ny > 8 || seen.has(key(nx, ny))) continue;
          const cell = detail[ny] && detail[ny][nx];
          if (cell && this.cellProps(cell).blocks) continue;
          if (occupied.has(key(nx, ny))) continue;
          seen.add(key(nx, ny));
          queue.push([nx, ny, d + 1]);
        }
      }
      return false;
    },

    // === SCORCHED EARTH ===
    // The beam ruins what it crosses. Scorched cells give no forage and
    // recover in ~3 days. Tents in the path are shredded outright.
    scorchCells(cells) {
      const day = (this.state.scholar || {}).day || 0;
      const nkey = this.map.px + ',' + this.map.py;
      this.state.scorch = this.state.scorch || {};
      const node = this.state.scorch[nkey] = this.state.scorch[nkey] || {};
      const t = this.playerTile();
      for (const c of cells || []) {
        node[c.cx + ',' + c.cy] = day + 3;
        const skey = c.cx + ',' + c.cy;
        if (t && t.secrets && t.secrets[skey] && t.secrets[skey].condition && t.secrets[skey].condition !== 'shredded') {
          t.secrets[skey].condition = 'shredded';
          t.secrets[skey].known = true;
          this.say('The beam shreds a tent in its path. Canvas peels like paper.');
        }
      }
    },
    cellScorched(cx, cy) {
      const nkey = this.map.px + ',' + this.map.py;
      const node = (this.state.scorch || {})[nkey];
      if (!node) return false;
      const until = node[cx + ',' + cy];
      if (until === undefined) return false;
      if (until <= ((this.state.scholar || {}).day || 0)) { delete node[cx + ',' + cy]; return false; }
      return true;
    },

    // The telegraph cue: SILENT in combat (Steve 2026-10-05). The grid IS the
    // telegraph — highlighted cells, monster posture, visual windup. Text
    // descriptions belong in the codex, not as intrusive combat spoilers.
    // The behavioral text was redundant and gave away too much.
    sayTelegraphOnce(m, text) {
      const f = this.tbfight;
      if (!f) return; // not in combat: nothing to say
      // In combat: mark as said (for dedup) but don't display text.
      // The visual telegraph on the grid is the warning.
      f.cueSaid = f.cueSaid || {};
      const typeId = ((m || {}).mdef || {}).id || '?';
      const key = (f.round || 0) + ':' + typeId + ':' + ((((m || {}).telegraph || {}).attackName) || '');
      if (f.cueSaid[key]) return;
      f.cueSaid[key] = true;
      // No this.say(text) — the grid shows it. Text lives in the codex.
    },
    tbTelegraphCue(m) {
      const tg = m.telegraph;
      const atk = m.mdef.attack || {};
      // BATCH 4 (corporate horrors): bespoke codex-gated cues.
      try {
        const b4 = this.tbBatch4Cue(m);
        if (b4) return b4;
      } catch (e) {}
      // BESPOKE CUE (batch 3, the uncanny): the monster set phase-specific
      // cue text at declare time (the lure's voice, the contract's fine
      // print, the projector's picture). It overrides the generic cue — the
      // earned codex suffix still appends once the pattern is learned.
      if (tg && tg.cueText) {
        let bcue = tg.cueText;
        if (this.tbPatternKnown(m.mdef.id, atk.name)) {
          bcue += ` You know this one: ${atk.name} ${this.tbPatternDesc(atk.pattern)}.`;
        }
        return bcue;
      }
      // CODEX-GATED TACTICS: surviving the attack teaches the pattern
      // (tbLearnPattern); the per-monster coaching in mdef.encounter.knownCue
      // only appears after that. Knowledge is earned, not given.
      const knownTail = () => {
        if (!this.tbPatternKnown(m.mdef.id, atk.name)) return '';
        let t = ` You know this one: ${atk.name} ${this.tbPatternDesc(atk.pattern)}.`;
        const enc = (m.mdef || {}).encounter || {};
        const kc = enc.knownCue;
        if (this.encUsesFifo(m) && kc) t += ' ' + kc;
        // batch 1 key (beasts): knownTactics — same gate, appended alongside.
        if (enc.knownTactics) t += ' ' + enc.knownTactics;
        return t;
      };
      if (tg && tg.firing > 0) {
        // CODEX-GATED: first encounters get raw terror, not tactics. The
        // "circle it wide / keep moving" coaching only appears once you've
        // learned the behavior — knowledge is earned, not given.
        const known = this.encUsesFifo(m) ? this.encTelegraphKnown(m) : true;
        let cue = known
          ? 'The beam is LIVE — a ray from its eyes, swinging toward you! Circle it wide or get behind something solid — and keep moving. If it doesn\'t have to chase you, it sits the full beam on you.'
          : 'The beam is LIVE — light lances from its eyes, swinging wild! No warning, no pattern you know — MOVE!';
        return cue + knownTail();
      }
      let cue = atk.telegraph || 'It shifts. Something is coming.';
      if (tg && tg.turnsLeft === 1) cue += " It's about to break loose!";
      else if (tg && tg.turnsLeft > 1) cue += ' It is still gathering itself…';
      return cue + knownTail();
    },

    // BATCH 4 telegraph cues: diegetic always, tactical only when earned.
    // Returns null when the generic cue should run instead.
    tbBatch4Cue(m) {
      const tg = m.telegraph;
      const atk = (m.mdef || {}).attack || {};
      const mid = (m.mdef || {}).id;
      if (mid !== 'review_drone' && mid !== 'camera_swarm' && mid !== 'hype_horn' && mid !== 'delegate_beast') return null;
      const known = this.encUsesFifo(m) ? this.encTelegraphKnown(m) : true;
      const learned = this.tbPatternKnown(mid, atk.name)
        ? ` You know this one: ${atk.name} ${this.tbPatternDesc(atk.pattern)}.`
        : '';
      if (mid === 'review_drone') {
        const eff = this.droneEff(m);
        const count = tg && tg.turnsLeft === 3 ? 'THREE.' : tg && tg.turnsLeft === 2 ? 'TWO.' : tg && tg.turnsLeft === 1 ? 'ONE.' : '…';
        let cue = `📊 CORRECTIVE BEAM CHARGING. DODGE EFFICIENCY CURRENTLY AT ${eff}% — ${eff >= 60 ? 'ABOVE TARGET. NOTED.' : 'BELOW TARGET.'} COMMENCING IN ${count} The line is projected on the dirt.`;
        cue += known
          ? ' That projected line is exactly where the beam fires — it cannot re-aim once announced. Step off it.'
          : ' Light plays across the dirt in a straight line. Probably decorative. Probably.';
        return cue + learned;
      }
      if (mid === 'camera_swarm') {
        let cue = '📸 "SMILE! You\'re going VIRAL!" The shutters quicken — the flashes are building.';
        cue += known
          ? ' Flash Mob: burst radius 2 around the swarm, and it keeps closing in while it builds. Keep moving — or get it near fire.'
          : ' It wants a reaction. Do not give it one standing still.';
        return cue + learned;
      }
      if (mid === 'hype_horn') {
        let cue = '📣 "YOU\'VE GOT THIS!" It inflates — throat, chest, the whole resonating chamber swelling like a bagpipe of pure encouragement.';
        cue += known
          ? ' Pep Talk: burst radius 3, the biggest burst going. Slow windup — GET CLEAR, four squares or more.'
          : ' The encouragement is about to become physical. Distance is self-care.';
        return cue + learned;
      }
      if (mid === 'delegate_beast') {
        let cue = '"let\'s take this OFFLINE." It lowers its horns. The meeting line is SET — attendance is mandatory.';
        cue += known
          ? ' It charges exactly the announced line, width 2 — sidestep FARTHER than feels necessary.'
          : ' It is staring down a line on the ground. You should not be on that line.';
        return cue + learned;
      }
      return null;
    },

    // audioEvent: optional hook for the Web Audio terror system (app.js).
    // If no audio system is attached, this is a silent no-op.
    audioEvent(name, data) {
      if (this.audio && typeof this.audio[name] === 'function') {
        try { this.audio[name](data || {}); } catch (e) {}
      }
    },

    // System commentary: after day 7, combat is TELEVISED. The System narrates,
    // the gamblers react, style points are tracked. Combat becomes a show.
    sysSay(text) {
      if (this.state.systemArrived) this.say(`📺 SYSTEM: "${text}"`);
    },

    tbStyle(points, why) {
      const f = this.tbfight;
      if (!f) return;
      f.style = (f.style || 0) + points;
      if (this.state.systemArrived && why) this.say(`📺 +${points} style — ${why}`);
    },
    tbRefreshTelegraphUI() {
      const f = this.tbfight;
      if (!f) { if (this.clearTelegraph) this.clearTelegraph(); return; }
      const cues = [];
      for (const m of f.fighters) {
        if (m.kind !== 'monster' || !m.alive || !m.telegraph) continue;
        cues.push(this.tbTelegraphCue(m));
      }
      if (!cues.length) { if (this.clearTelegraph) this.clearTelegraph(); return; }
      if (this.showTelegraph) this.showTelegraph(cues.join(' '));
    },

    // --- player turn ---
    tbPlayerMove(cx, cy) {
      const f = this.tbfight;
      if (!f || f.over || !this.tbIsPlayerTurn()) return false;
      const p = this.tbFighter('p');
      if (!p || p.moveLeft <= 0) { this.say('No movement left this turn.'); return false; }
      const path = this.findPath(p.mx, p.my, cx, cy);
      if (!path || !path.length) { this.say('No path there.'); return false; }
      if (path.length > p.moveLeft) { this.say(`Too far — ${p.moveLeft} squares left.`); return false; }
      for (const o of f.fighters) {
        if ((o.kind === 'monster' || o.kind === 'hostile') && o.alive && o.mx === cx && o.my === cy) {
          // Descriptors start with "a"/"an" ("a light in the dark...") — don't double the article.
          const onm = /^(a|an) /i.test(o.name) ? o.name : 'a ' + o.name;
          this.say("You don't stroll through " + onm + '.'); return false;
        }
      }
      p.moveLeft -= path.length;
      // STEP BY STEP: each tile is an action, and during the firing phase the
      // beam answers every step with a sweep tick (action-locked). Walk the
      // path tile by tile so the beam tracks your actual movement, not just
      // where you land.
      for (const [tx, ty] of path) {
        p.mx = tx; p.my = ty;
        this.state.scholar.mx = tx; this.state.scholar.my = ty;
        this.tbBeamActionTick();
        if (!this.tbfight || this.tbfight.over) return true;
      }
      const [lx, ly] = path[path.length - 1];
      const [px2, py2] = path.length >= 2 ? path[path.length - 2] : [p.mx, p.my];
      this.state.scholar.facing = { x: Math.sign(lx - px2) || 0, y: Math.sign(ly - py2) || 1 };
      // SNAKE CONTACT (Steve 2026-10-05): if you step onto a duck segment,
      // it bites. Every segment touched = damage. (Snake moving onto you is
      // handled in tbSnakeMove.)
      this.tbSnakeContactDamage();
      // FLEE BY DOOR (Steve 2026-10-05): at walled Haven, the grid edges are
      // blocked — but doors work. Step on a door tile in combat and you go
      // through, escaping the fight. (Walls don't work, doors do.)
      // REFINEMENT: going inside breaks the fight FOR YOU, but doesn't save
      // anyone outside. Monsters stay where they are — they don't despawn.
      // They'll be waiting if you go back out. (Don't get locked in to starve.)
      const detail = this.genDetail(this.map.px, this.map.py);
      const curCell = detail[p.my] && detail[p.my][p.mx];
      if (curCell === 'door') {
        const s = this.state.scholar;
        // Remember monster positions before ending combat — they stay.
        const monsterPositions = f.fighters
          .filter(x => (x.kind === 'monster' || x.kind === 'hostile') && x.alive)
          .map(m => ({ id: m.monsterId, mx: m.mx, my: m.my, hp: m.hp }));
        if (s.insideHaven) {
          this.say('You dive through the doors — outside! The fight is behind you.');
          this.exitBuilding();
        } else {
          this.say('You duck through the doors — inside! The fight is behind you.');
          this.enterBuilding();
        }
        // Escaping through a door ends combat FOR THE PLAYER
        const p2 = this.tbFighter('p');
        if (p2) p2.fled = true;
        // Preserve monsters: they don't melt away, they wait outside.
        // (Standard tbEnd despawns; we stash positions first.)
        this.state.doorFledMonsters = monsterPositions;
        this.tbEnd('fled');
        // Restore monsters to the world — they're still out there.
        // (They'll re-engage if you go back outside.)
        if (monsterPositions.length) {
          this.say(`⚠️ ${monsterPositions.length} ${monsterPositions.length === 1 ? 'thing' : 'things'} still out there. They know where you went.`);
        }
        return true;
      }
      // FLEE BY NODE BARRIER (Steve 2026-10-05): no FLEE button, no distance
      // check — you escape by LEAVING THE NODE. Walk to the grid edge and push
      // through to the adjacent node. 50% to lose them; otherwise they follow.
      // (Don't bring a highbeam deer back to camp.)
      const atEdge = (p.mx === 0 || p.mx === 8 || p.my === 0 || p.my === 8);
      if (atEdge) {
        const mons = f.fighters.filter(x => (x.kind === 'monster' || x.kind === 'hostile') && x.alive && !x.fled);
        if (mons.length) {
          // Which direction? Continue past the edge.
          let dx = 0, dy = 0;
          if (p.mx === 0) dx = -1; else if (p.mx === 8) dx = 1;
          if (p.my === 0) dy = -1; else if (p.my === 8) dy = 1;
          const nx = this.map.px + dx, ny = this.map.py + dy;
          // 50% to break contact at the barrier
          if (Math.random() < 0.5) {
            this.say('You crash through the treeline — the barrier shimmers. They lose your trail.');
            p.fled = true;
            this.tbEnd('fled');
            try { this.travelTo(nx, ny); } catch (e) {}
            return true;
          } else {
            this.say('They\'re right behind you — through the barrier!');
            try { this.travelTo(nx, ny); } catch (e) {}
            // They follow: reposition monsters near the entry edge on the new node
            // (combat continues; the node changed under the fight.)
            for (const m of mons) {
              m.mx = Math.max(0, Math.min(8, 4 - dx * 3 + Math.floor(Math.random() * 3) - 1));
              m.my = Math.max(0, Math.min(8, 4 - dy * 3 + Math.floor(Math.random() * 3) - 1));
            }
            // Player enters from the opposite edge
            p.mx = Math.max(0, Math.min(8, 4 + dx * 3));
            p.my = Math.max(0, Math.min(8, 4 + dy * 3));
            this.tbRefreshTelegraphUI();
            return true;
          }
        }
      }
      // ACTION ECONOMY: out of moves AND acted -> the turn ends on its own.
      if (p.moveLeft <= 0 && p.acted) this.tbPlayerEndTurn();
      else this.tbRefreshTelegraphUI();
      return true;
    },

    tbPlayerStrike(targetKey) {
      const f = this.tbfight;
      if (!f || !this.tbIsPlayerTurn()) return false;
      const p = this.tbFighter('p');
      if (p.acted) { this.say('Already acted this turn.'); return false; }
      const t = this.tbFighter(targetKey);
      if (!t || !t.alive || (t.kind !== 'monster' && t.kind !== 'hostile')) return false;
      const w = this.equippedWeapon();
      const d0 = Math.max(Math.abs(t.mx - p.mx), Math.abs(t.my - p.my));
      if (d0 > w.range) {
        this.say(w.unarmed
          ? `Too far to reach. (unarmed: range 1)`
          : `${w.name} can't reach that far. (range ${w.range})`);
        return false;
      }
      // WHITE NOISE (statue): at range you're striking where you THINK it is.
      // Half the time it isn't there. Close in, or wait for the unfold.
      if (this.heronIs(t) && this.encUsesFifo(t) && t.beamPhase === 'still' && d0 > 1 && Math.random() < 0.5) {
        p.acted = true;
        this.say("You strike where you thought it was. It wasn't. (The heron is hardest to see when it is stillest.)");
        this.tbAfterPlayerAction();
        return true;
      }
      // RANGED: no ammo, no shot.
      // FLASHBLIND: the moth's flash leaves spots in your eyes — your strike
      // may catch only afterimages. (Mirrors the pocket_sand miss rule.)
      if (p.blindTurns > 0) {
        p.blindTurns -= 1;
        if (Math.random() < 0.5) {
          p.acted = true;
          this.say('You strike at afterimages — the flash is still in your eyes. Missed. (blinded)');
          this.tbAfterPlayerAction();
          return true;
        }
        this.say('You blink the spots away and strike through them.');
      }
      if (w.ammo) {
        if (this.ammoCount(w.ammo) < 1) {
          this.say(`No ${w.ammo} left. Your ${w.name} is a stick you hold wrong.`);
          return false;
        }
        this.spendAmmo(w.ammo, 1);
      }
      let d = S.combat.roll([10, 16]) + w.bonus;
      // TRUE SWING (passive): your strikes land cleaner.
      const tsBonus = this.passiveBonus('true_swing');
      if (tsBonus > 0) d = Math.round(d * (1 + tsBonus));
      const hpFrac = p.hp / p.maxHp;
      if (this.hasAbility('rage') && hpFrac < 0.5) { d *= 2; this.say('RAGE: +100% damage.'); }
      if (this.hasAbility('cornered_rat') && hpFrac < 0.3) { d *= 2; this.say('CORNERED RAT: desperation is a weapon.'); }
      if (p.aimed) { d = Math.round(d * 2.5); p.aimed = false; this.say('DEAD AIM: patience, then thunder. Critical ×2.5.'); }
      // THE RESERVE: food is humanity's superpower. A full furnace hits harder —
      // visibly. (feastBurn states the burn itself.)
      if (this.feastBurn) { const fb = this.feastBurn(); if (fb > 0) d = Math.round(d * fb); }
      d = Math.round(d);
      // isHuman is read by the armor block below AND the trauma block after:
      // declare once, up front (TDZ crash 2026-10-05: the armor block read it
      // before its const, breaking every player strike).
      const isHuman = t.kind === 'hostile';
      // ARMOR & RESISTANCES (Steve 2026-10-05): monsters have armor (flat vs
      // physical) and resistances (percentage per damage type). Apply them here.
      if (!isHuman) {
        const mid = t.monsterId || (t.mdef && t.mdef.id);
        const mdef = (this.data.monsters || []).find(m => m.id === mid) || {};
        const wType = (w.weapon && w.weapon.damageType) || 'physical';
        // Armor: flat reduction vs physical damage only
        if (wType === 'physical' && mdef.armor > 0) {
          const absorbed = Math.min(d, mdef.armor);
          d -= absorbed;
          if (absorbed > 0) this.say(`(${mdef.name}'s hide absorbs ${absorbed}.)`);
        }
        // Resistances: percentage reduction per type (negative = vulnerability)
        const res = (mdef.resistances || {})[wType] || 0;
        if (res !== 0) {
          const oldD = d;
          d = Math.round(d * (1 - res));
          if (res > 0) this.say(`(${mdef.name} resists ${wType} — ${oldD} → ${d}.)`);
          else this.say(`(${mdef.name} is vulnerable to ${wType}! ${oldD} → ${d}.)`);
        }
        d = Math.max(1, d); // always at least 1 damage
      }
      p.acted = true;
      // BETTER HUMAN: fighting is strength and agility practice.
      this.practice('str', 1); this.practice('agi', 1);
      if (isHuman) {
        // HUMAN COMBAT IS NOT FUN. It's traumatic. No cool moves, no style points.
        // The text says what happened. Your hands did it. You live with it.
        const wtxt = w.unarmed ? 'your hands' : `the ${w.name}`;
        const wverb = w.unarmed ? 'connect' : 'connects';
        const vDarkH = this.npcDark(t.villagerId);
        const lines = [
          `You hurt ${t.name} with ${wtxt}. They make a sound you will hear again tonight.`,
          `Your hands move before you decide. Blood. ${t.name} is staring at you like you're a stranger.`,
          `${wtxt} ${wverb}. ${t.name} gasps — surprised, more than anything. Like they didn't think you'd really do it.`,
        ];
        if (vDarkH && vDarkH.kind === 'malicious') {
          lines.push(`You hurt ${t.name} with ${wtxt}. They smile — wrong, late — and that scares you more than the blood.`);
        }
        this.say(this.pickFresh(lines, 'humanStrike'));
        // Trauma accrues — but not blindly. Who they were and why matters.
        try { this.addTrauma(this.traumaForHurt(t.villagerId)); } catch (e) {}
      } else {
        const wtxt = w.unarmed ? '' : ` (${w.name})`;
        this.say(`You STRIKE the ${this.encShortLabel(t) || this.encTheName(t)} for ${d}${wtxt}.`);
        this.tbStyle(5, 'solid hit');
      }
      this.tbDamage(t.key, d, 'you', null, { quiet: true });
      const tAfter = this.tbFighter(t.key);
      // HIGHBEAM: hurting the deer moves you to the front of its list.
      try { if (tAfter && this.encUsesFifo(tAfter)) this.encNoticesPain(tAfter, 'p'); } catch (e) {}
      // HITS LANDED: hurting it teaches you its toughness.
      try { if (tAfter && tAfter.mdef) this.ensureMonsterEntry(tAfter.mdef.id).hitsLanded++; } catch (e) {}
      // DISRUPT: a solid hit while it's channeling the beam can break its aim.
      // Closing in is the risky counterplay — the antlers make sure of that.
      if (tAfter && tAfter.alive && tAfter.telegraph && tAfter.telegraph.firing > 0 &&
          Math.random() < (d >= 20 ? 0.5 : 0.25)) {
        tAfter.telegraph = null;
        this.say(`Your strike bites DEEP — the ${tAfter.name} staggers, and the beam stutters and dies!`);
        this.tbStyle(15, 'broke its concentration!');
        this.tbRefreshTelegraphUI();
      }
      if (tAfter && !tAfter.alive && !isHuman) this.tbStyle(20, `dropped the ${this.encTheName(tAfter)}!`);
      this.tbAfterPlayerAction();
      return true;
    },

    // TRAUMA: hurting people leaves marks on you. Not a debuff — a haunting.
    // Trauma degrades sleep (nightmares), and the village can feel it on you.
    addTrauma(n) {
      const s = this.state.scholar;
      s.trauma = Math.min(100, (s.trauma || 0) + (n || 5));
      if (s.trauma >= 30 && !s._nightmareWarned) {
        s._nightmareWarned = true;
        this.say('You will dream about this. You already know.');
      }
    },
    traumaLevel() { return this.state.scholar.trauma || 0; },
    // TRAUMA MATRIX: killing isn't automatically traumatic. It depends on
    // WHO died, WHY it happened, and what they meant to you.
    //   justification: self-defense (they drew first) vs murder (you did)
    //   victim: a malicious psycho's death lands different than an innocent's
    //   relationship: killing someone you trusted cuts deeper
    //   likability: the village's read, off reputation axes
    //   your own darkness: psychos don't haunt the same way
    traumaFactor(vid, lethal) {
      let f = 1;
      const tf = (this.tbfight || {});
      const selfDefense = tf.aggressor === 'npc'; // they drew first: them or you
      const dark = this.npcDark(vid);
      if (selfDefense) f *= lethal ? 0.35 : 0.3;
      if (dark && dark.kind === 'malicious') f *= lethal ? 0.45 : 0.6;  // they were going to kill someone
      else if (dark && dark.kind === 'benign') f *= 1.35; // they never hurt anyone. you did.
      const trust = ((this.state.village.trust || {})[vid]) || 10;
      if (trust >= 60) f *= 1.5;        // you knew them. you chose this.
      else if (trust >= 30) f *= 1.15;
      else if (trust < 10) f *= 0.85;   // a stranger. still a person.
      const r = this.repOf(vid);
      const like = (r.generous || 0) + (r.honest || 0);
      if (like >= 20) f *= 1.25;        // beloved
      else if (like <= -20) f *= 0.75;  // feared or despised
      const myDark = this.npcDark(this.villagerId);
      if (myDark && myDark.kind === 'malicious') f *= 0.25; // you don't feel it like others do
      else if (myDark && myDark.kind === 'benign') f *= 0.7;
      return Math.max(0.1, f);
    },
    traumaForHurt(vid) { return Math.max(1, Math.round(8 * this.traumaFactor(vid, false))); },
    traumaForKill(vid) { return Math.max(2, Math.round(25 * this.traumaFactor(vid, true))); },

    tbPlayerStudy() {
      const f = this.tbfight;
      if (!f || !this.tbIsPlayerTurn()) return false;
      const p = this.tbFighter('p');
      if (p.acted) { this.say('Already acted this turn.'); return false; }
      p.acted = true;
      const mons = f.fighters.filter(x => x.kind === 'monster' && x.alive);
      for (const m of mons) {
        this.state.codex.monsters = this.state.codex.monsters || {};
        const cur = this.state.codex.monsters[m.mdef.id];
        if (!cur || cur.stage !== 'slain') this.state.codex.monsters[m.mdef.id] = Object.assign(cur || {}, { stage: 'observed' });
        const atk = m.mdef.attack || {};
        // Study names the attack and sharpens the cue — but the PATTERN stays
        // unknown until you survive it. Watching isn't surviving.
        this.say(`STUDY: ${m.name} — it favors ${atk.name || 'violence'}.${m.telegraph ? ' Right now: ' + this.tbTelegraphCue(m) : ''}`);
      }
      if (this.hasAbility('dead_aim')) { p.aimed = true; this.say('DEAD AIM armed: your next strike crits.'); }
      this.tbAfterPlayerAction();
      return true;
    },

    tbPlayerScream() {
      const f = this.tbfight;
      if (!f || !this.tbIsPlayerTurn()) return false;
      const p = this.tbFighter('p');
      const s = this.state.scholar;
      if (p.acted) { this.say('Already acted this turn.'); return false; }
      if (!this.hasAbility('scream_cheese') || s.screamDay === s.day) { this.say('Your throat is raw. No scream left today.'); return false; }
      p.acted = true;
      s.screamDay = s.day;
      let n = 0;
      for (const m of f.fighters) {
        if (m.kind !== 'monster' || !m.alive) continue;
        m.stunned = 1;
        if (m.telegraph) { m.telegraph = null; n++; }
      }
      this.say(`You SCREAM. Milk curdles somewhere.${n ? ' Its focus shatters — the attack fizzles.' : ''} It freezes. (stunned)`);
      this.tbRefreshTelegraphUI();
      this.tbAfterPlayerAction();
      return true;
    },

    // an activatable ability used during combat counts as the turn's action
    tbPlayerActed() {
      const f = this.tbfight;
      if (!f || !this.tbIsPlayerTurn()) return;
      const p = this.tbFighter('p');
      if (p && !p.acted) { p.acted = true; this.tbAfterPlayerAction(); }
    },

    tbPlayerEndTurn() {
      const f = this.tbfight;
      if (!f || !this.tbIsPlayerTurn()) return;
      const p = this.tbFighter('p');
      if (p && p.blindTurns > 0) {
        p.blindTurns = 0;
        this.say('Your vision clears — the spots fade.');
      }
      this.tbAdvance();
    },

    // WAIT (Steve): the explicit pause. Forfeit remaining actions, end the
    // turn now. This is an ACTION — during the beam's firing it feeds the
    // beam a tick (hesitate and it ticks anyway). "If you want to pause a
    // sec, don't use all your actions" — or just don't tap; the game waits.
    tbPlayerWait() {
      const f = this.tbfight;
      if (!f || !this.tbIsPlayerTurn()) return false;
      const p = this.tbFighter('p');
      if (!p) return false;
      if (p.acted && p.moveLeft <= 0) return false; // nothing left to forfeit
      p.acted = true;
      p.moveLeft = 0;
      this.say('You hold still, watching.');
      this.tbAfterPlayerAction();
      return true;
    },

    // SPEND COMBAT ACTION (Steve 2026-10-05): using a consumable from Pack
    // in combat costs your action. Eating, drinking, using items — all of it.
    spendCombatAction(kind) {
      const p = this.tbFighter('p');
      if (!p) return;
      p.acted = true;
      this.say(`You ${kind} — that costs your action.`);
      this.tbAfterPlayerAction();
    },

    tbAfterPlayerAction() {
      // The beam answers your action with a sweep tick BEFORE the world moves.
      this.tbBeamActionTick();
      if (this.tbfight && this.tbfight.over) return;
      // The fight can end on YOUR action (you dropped the last monster) —
      // tbAdvance only checks after AI turns, so check here too. Otherwise
      // killing the final foe soft-locks the fight on your turn forever.
      if (this.tbEndCheck()) return;
      // ACTION ECONOMY (Steve): the turn ends when you're out of actions —
      // no end-turn ceremony. Spend moves + the acted action and it advances
      // on its own. (Wait forfeits the rest via tbPlayerWait.)
      const p = this.tbFighter('p');
      if (p && p.moveLeft <= 0 && p.acted) this.tbAdvance();
      else this.tbRefreshTelegraphUI();
    },

    // --- turn advancement: run AI turns until it's the player's turn ---
    tbAdvance() {
      const f = this.tbfight;
      if (!f || f.over) return;
      let guard = 0;
      while (guard++ < 60) {
        f.turnIdx++;
        if (f.turnIdx >= f.order.length) {
          f.turnIdx = 0; f.round++;
          this.sysSay(`ROUND ${f.round}!`);
          this.audioEvent('round', { round: f.round });
        }
        const c = this.tbFighter(f.order[f.turnIdx]);
        if (!c || !c.alive || c.fled) continue;
        if (c.kind === 'player') { this.tbBeginTurn(); return; }
        // WORLD TAKES ITS TURN (Steve 2026-10-05): monsters and villagers
        // get a visible turn banner. Things shouldn't spontaneously manifest —
        // you should FEEL the world acting.
        if (c.kind === 'villager') {
          this.sysSay(`${c.name}'s turn`);
          this.tbVillagerTurn(c);
        } else {
          const mName = (c.mdef && c.mdef.name) || c.name || 'the monster';
          const mEmoji = (c.mdef && c.mdef.emoji) || '👹';
          this.sysSay(`${mEmoji} ${mName}'s turn`);
          this.tbMonsterTurn(c);
        }
        if (this.tbEndCheck()) return;
      }
    },
// SNAKE MOVEMENT (Steve 2026-10-05): ducks in a row.
    // Head moves toward player (speed 5, scary fast). Segments follow the
    // previous segment's position. Non-blocking (or it would wall you in).
    tbSnakeMove(m) {
    const f = this.tbfight;
    if (!f || !m.alive) return;
    // Only the head moves independently; segments follow in tbSnakeFollow
    if (!m.isHead) return;
    const p = this.tbFighter('p');
    if (!p || !p.alive) return;
    // Get all segments of this snake, in order
    const segs = f.fighters
      .filter(x => x.kind === 'monster' && x.alive && x.mdef && x.mdef.snake && x.snakeId === m.snakeId)
      .sort((a, b) => a.segmentIndex - b.segmentIndex);
    if (!segs.length) return;
    // Record positions before move (for follow-the-leader)
    const prevPos = segs.map(s => ({ x: s.mx, y: s.my }));
    // Head moves toward player, up to speed tiles
    const speed = m.speed || 5;
    let hx = m.mx, hy = m.my;
    for (let i = 0; i < speed; i++) {
      const dx = Math.sign(p.mx - hx), dy = Math.sign(p.my - hy);
      // Prefer the axis with greater distance
      let nx = hx, ny = hy;
      if (Math.abs(p.mx - hx) >= Math.abs(p.my - hy)) {
      nx = hx + dx;
      } else {
      ny = hy + dy;
      }
      // Stay in bounds, avoid terrain (but NOT other segments — non-blocking)
      if (nx < 0 || nx > 8 || ny < 0 || ny > 8) break;
      const detail = this.genDetail(this.map.px, this.map.py);
      const cell = detail[ny] && detail[nx];
      if (cell && this.cellProps(cell).blocks) break;
      hx = nx; hy = ny;
      // Reached player? Stop (contact damage happens separately)
      if (hx === p.mx && hy === p.my) break;
    }
    m.mx = hx; m.my = hy;
    // Segments follow: each moves to the previous position of the one ahead
    for (let i = 1; i < segs.length; i++) {
      segs[i].mx = prevPos[i - 1].x;
      segs[i].my = prevPos[i - 1].y;
    }
    },

    // SNAKE SPLIT (Steve 2026-10-05): when a segment dies, check if it breaks
    // the chain. If segments remain on BOTH sides of the break, the tail-side
    // becomes a new snake (new snakeId, new head at the break point).
    // Kill from the tail forward to avoid splits.
    tbSnakeSplit(deadSeg) {
    const f = this.tbfight;
    if (!f) return;
    const snakeId = deadSeg.snakeId;
    const deadIdx = deadSeg.segmentIndex;
    // Find surviving segments of this snake, sorted by index
    const survivors = f.fighters
      .filter(x => x.kind === 'monster' && x.alive && x.mdef && x.mdef.snake && x.snakeId === snakeId)
      .sort((a, b) => a.segmentIndex - b.segmentIndex);
    if (survivors.length < 2) return; // 0 or 1 left, no split possible
    // Check if the break separates the chain
    const before = survivors.filter(s => s.segmentIndex < deadIdx);
    const after = survivors.filter(s => s.segmentIndex > deadIdx);
    if (before.length && after.length) {
      // SPLIT! The after-side becomes a new snake.
      const newSnakeId = 'snake_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      // The first survivor after the break becomes the new head
      after.sort((a, b) => a.segmentIndex - b.segmentIndex);
      after[0].isHead = true;
      // Reassign snakeId and reindex
      after.forEach((s, i) => {
      s.snakeId = newSnakeId;
      s.segmentIndex = i;
      s.isHead = (i === 0);
      s.name = s.name.replace(/\(head\)|\(\d+\)/, i === 0 ? '(head)' : `(${i + 1})`);
      });
      // The before-side keeps the old snakeId, reindex not needed (still 0..n)
      this.say(`🦆 The line breaks! The tail thrashes free — now there are TWO snakes.`);
      this.audioEvent('snakeSplit');
    }
    // If only one side survives, no split — just a shorter snake.
    // (The head-side keeps going; the tail-side is gone.)
    },

    // SNAKE CONTACT DAMAGE (Steve 2026-10-05): walking on a segment hurts.
    // Every segment touching the player deals damage — whether you moved onto
    // it or it moved onto you. This is the snake's main weapon.
    tbSnakeContactDamage() {
    const f = this.tbfight;
    if (!f) return;
    const p = this.tbFighter('p');
    if (!p || !p.alive) return;
    const touching = f.fighters.filter(x =>
      x.kind === 'monster' && x.alive && !x.fled &&
      x.mdef && x.mdef.snake &&
      x.mx === p.mx && x.my === p.my
    );
    for (const seg of touching) {
      const dmg = seg.mdef.snake.contactDamage;
      const amount = dmg[0] + Math.floor(Math.random() * (dmg[1] - dmg[0]));
      this.say(`🦆 The duck bites! (${amount} damage)`);
      this.tbDamage('p', amount, 'duck bite', seg.key, { quiet: true });
      if (!p.alive) break;
    }
    },


    tbDamage(targetKey, dmg, sourceLabel, sourceKey, opts) {
      const t = this.tbFighter(targetKey);
      if (!t || !t.alive) return;
      const quiet = !!(opts && opts.quiet);
      // FOOTWORK (passive): agility lets you dodge. Not a guarantee — a chance.
      // Only vs direct attacks, not beams/AoE (you can't dodge a flood).
      if (t.kind === 'player' && !(opts && opts.undodgeable)) {
        const dodgeCh = this.passiveBonus('footwork') + Math.max(0, (this.stat('agi') - 5) * 0.02);
        if (dodgeCh > 0 && Math.random() < dodgeCh) {
          this.say('You slip aside — it misses clean. (footwork)');
          this.practice('agi', 1); // dodging is agility practice
          return;
        }
      }
      let final = Math.max(0, Math.round(dmg));
      // BATCH 3 (the uncanny) vulnerabilities:
      // - voice mimic, REVEALED: the act is broken and the signal scrambles —
      //   exposed, it takes the hit badly. (Resisting the lure pays off.)
      if (t.kind === 'monster' && this.vmIs(t) && t.beamPhase === 'reveal') {
        final = Math.round(final * 1.5);
        this.say('The signal scrambles — exposed, it takes the hit badly.');
      }
      // - contract golem: it's paper. A torch does what fire does.
      if (t.kind === 'monster' && this.cgIs(t) && String(sourceLabel) === 'you') {
        let witem = '';
        try { witem = String((((this.state.scholar || {}).equipped || {}).weapon || {}).itemId || ''); } catch (e) {}
        if (/torch/.test(witem)) {
          final = Math.round(final * 3);
          this.say('It\'s paper. The torch does what torches do.');
        }
      }
      // INFLUENCER (camera_swarm): fragile. Every hit knocks cameras out of
      // the sky — it takes +25% from everything, and the game says so once.
      if (t.kind === 'monster' && this.swarmIs(t)) {
        final = Math.round(final * 1.25);
        if (!t.fragileNoted && final > 0) {
          t.fragileNoted = true;
          this.say('Cameras shatter across the dirt — the swarm is FRAGILE. Every hit knocks lenses out of the sky.');
        }
      }
      if (t.kind === 'player' && typeof this.armorBonus === 'function') {
        const prot = this.armorBonus();
        if (prot > 0) { final = Math.max(0, final - prot); this.say(`Armor absorbs ${Math.min(dmg, prot)}.`); }
      }
      // PHASE BLADE (alien loot): ignores armor — the sealed shell might as
      // well not be there. Checked the same way as the torch-vs-golem rule.
      let ignoresArmor = false;
      try {
        const wdef = this.data.items.find(i => i.id === String((((this.state.scholar || {}).equipped || {}).weapon || {}).itemId || ''));
        ignoresArmor = !!(wdef && wdef.weapon && wdef.weapon.ignoresArmor);
      } catch (e) {}
      // BUNKER (speedbump): sealed shell — nearly invulnerable. Chip damage only.
      if (t.kind === 'monster' && this.turtleIs(t) && (t.turtleBunker || 0) > 0 && final > 0 && !ignoresArmor) {
        final = Math.max(1, Math.round(final * 0.15));
        if (!t.bunkerNoted) {
          t.bunkerNoted = true;
          this.say('The hit clangs off the sealed shell. Nearly invulnerable. Wait it out.');
        }
      }
      if (ignoresArmor && t.kind === 'monster' && this.turtleIs(t) && (t.turtleBunker || 0) > 0 && final > 0) {
        this.say('The phase blade doesn\'t care about the shell. It cuts through.');
      }
      // WINDED (boar): soft flanks after a missed charge — it was never built to turn.
      if (t.kind === 'monster' && this.boarIs(t) && (t.boarWinded || 0) > 0 && final > 0) {
        final = Math.round(final * 1.5);
        this.say(`${sourceLabel === 'you' ? 'You catch' : sourceLabel + ' catches'} it on the flank — soft, unarmored.`);
      }
      // THE LIGHT IS ALREADY GATHERED: once a sweeping-beam monster has begun
      // its windup, the charge lives in its eyes, not its body. Killing the
      // body doesn't un-gather the light — lethal damage during the windup
      // holds it at 1 HP, and the beam fires from its death throes. After
      // the first Discharge the light is spent: then it's just meat that
      // shines, and it dies like anything else.
      const tPat = t.kind === 'monster' && t.mdef && t.mdef.attack && t.mdef.attack.pattern;
      const windingUp = t.telegraph && !t.hasFired;
      if (tPat && tPat.sweep && windingUp && t.hp > 0 && t.hp - final <= 0) {
        final = t.hp - 1;
        this.say(`It should drop — but the light behind ${t.name}'s eyes is already gathered. The body won't fall until it fires.`);
      }
      t.hp -= final;
      if (t.kind === 'player') {
        this.state.scholar.health = Math.max(0, t.hp);
        if (final > 0) this.noteAbilityUse('chitin_skin');
        // WITNESS JUDGEMENT: a hard hit on you gets a visible gasp (once per
        // fight — not every chip). People nearby react to you bleeding.
        const ff = this.tbfight;
        if (final >= 15 && ff && !ff.hurtReacted) {
          ff.hurtReacted = true;
          try { this.combatWitnessReact('hurt'); } catch (e) {}
        }
      }
      const tIsHuman = t.kind === 'hostile';
      if (tIsHuman) {
        // HUMAN DAMAGE: not numbers. What it looks like to hurt a person.
        if (sourceLabel === 'you') {
          const dl = [
            `${t.name} takes it and doesn't scream. That's worse.`,
            `Blood on your hands now. ${t.name} is holding their side, breathing wrong.`,
            `${t.name} staggers. For a second they look like someone you knew.`,
          ];
          this.say(this.pickFresh(dl, 'humanDamage'));
        } else {
          this.say(`${sourceLabel} hurts ${t.kind === 'player' ? 'you' : t.name}. It isn't clean. It isn't quick.`);
        }
      } else if (!quiet) {
        this.say(`${sourceLabel === 'you' ? 'You hit' : sourceLabel + ' hits'} ${t.kind === 'player' ? 'you' : (this.encShortLabel(t) || t.name)} for ${final}.`);
      }
      // WOUND THE LEAD (hushwolf): the pack coordinates through the lead animal.
      // Drop it below half and the silence shatters — the pack breaks.
      const dmgTf = this.tbfight;
      if (t.kind === 'monster' && this.wolfIs(t) && t.wolfLead && t.hp > 0 && !t.wolfBroken && t.hp < t.maxHp * 0.5 && dmgTf) {
        for (const o of dmgTf.fighters) {
          if (o.kind === 'monster' && o.alive && !o.fled && ((o.mdef || {}).id === 'hushwolf')) o.wolfBroken = true;
        }
        this.say("The lead staggers — and the pack's silence shatters into yips and snarls. Coordination broken. (WOUND THE LEAD: it worked.)");
        this.audioEvent('wolfBreak');
      }
      // BUNKER TRIGGER (speedbump): below half HP, it seals up.
      if (t.kind === 'monster' && this.turtleIs(t) && t.hp > 0 && !t.turtleBunkered && t.hp < t.maxHp * 0.5) {
        t.turtleBunker = 2; t.turtleBunkered = true; t.bunkerNoted = false;
        if (this.encUsesFifo(t)) this.encSetPhase(t, 'bunker');
        this.say('It withdraws. The shell seals with a sound like a door closing. (BUNKER: nearly invulnerable for 2 turns — wait it out.)');
        this.audioEvent('turtleBunker');
      }
      if (t.hp <= 0) {
        t.alive = false;
        // SNAKE SPLIT (Steve 2026-10-05): kill a middle segment and the snake
        // splits at the break. The tail-side becomes a new snake with its own
        // head. Kill sequentially (tail first) to avoid this.
        if (t.kind === 'monster' && t.mdef && t.mdef.snake && t.snakeId) {
          this.tbSnakeSplit(t);
        }
        if (t.kind === 'player') this.say('You go down.');
        else if (t.kind === 'villager') { this.say(`☠ ${t.name} falls.`); this.tbVillagerFalls(t);
          try { this.registerDeath({ kind: 'person', villagerId: t.villagerId, name: t.name, mx: t.mx, my: t.my, cause: 'combat', witnesses: this.fightWitnesses(t.villagerId) }); } catch (e) {} }
        else if (t.kind === 'hostile') {
          // KILLING A PERSON: the text depends on who they were and why.
          // Self-defense, a monster in human skin, an innocent — different deaths.
          const vDarkK = this.npcDark(t.villagerId);
          const selfDefK = (this.tbfight || {}).aggressor === 'npc';
          let kl;
          if (selfDefK) {
            kl = [
              `☠ ${t.name} stops moving. It was them or you. Your hands shake anyway — but differently.`,
              `☠ Self-defense. That's what you'll tell yourself. It's even true. It doesn't help as much as it should.`,
            ];
          } else if (vDarkK && vDarkK.kind === 'malicious') {
            kl = [
              `☠ ${t.name} is still. The clearing feels lighter, and that frightens you more than the killing.`,
              `☠ Done. You keep waiting to feel worse about it than you do.`,
              `☠ ${t.name} won't hurt anyone now. You tell yourself that's why. Mostly it's why.`,
            ];
          } else if (vDarkK && vDarkK.kind === 'benign') {
            kl = [
              `☠ ${t.name} stops moving. They never hurt anyone. You did.`,
              `☠ ${t.name} is dead. The wrongness of it sits in your chest like a stone.`,
            ];
          } else {
            kl = [
              `☠ ${t.name} stops moving. The clearing is very quiet. Your hands won't stop shaking.`,
              `☠ ${t.name} is dead. You did that. No one is clapping, whatever the System says.`,
              `☠ It's over. ${t.name} lies still. You keep waiting for them to get up.`,
            ];
          }
          this.say(kl[Math.floor(Math.random() * kl.length)]);
          try { this.addTrauma(this.traumaForKill(t.villagerId)); } catch (e) {}
          // THE murder event: exactly one, witness-gated, right here.
          // (registerDeath below must NOT fire it again — one killing, one
          // village reaction. Unwitnessed: the crime is recorded as unsolved
          // but the village doesn't react to what it never saw.)
          try {
            let wit = 0;
            const f = this.tbfight;
            if (f) for (const o of f.fighters) {
              if (o.alive && !o.fled && o.kind === 'villager' && o.villagerId &&
                  o.villagerId !== t.villagerId && o.villagerId !== this.villagerId) wit++;
            }
            this.villageEvent('murder', { victim: t.villagerId, witnessed: wit > 0 });
          } catch (e) {}
          try { this.registerDeath({ kind: 'person', villagerId: t.villagerId, name: t.name, mx: t.mx, my: t.my, cause: 'combat', killerId: this.villagerId, witnesses: this.fightWitnesses(t.villagerId) }); } catch (e) {}
        }
        else {
          this.say(`The ${this.encTheName(t)} falls.`);
          // MONSTER BATCH 2: a lockpick killed mid-job doesn't get to keep
          // your things — the loot is still in its hands.
          if (t.stolen) {
            const got = this.tbLockpickReturn(t);
            this.say(`Your ${got} is still clutched in its clever hands. You take it back.`);
          }
          try { this.registerDeath({ kind: 'monster', monsterId: (t.mdef || {}).id, monsterName: t.name, name: t.name, mx: t.mx, my: t.my, cause: 'combat', killerId: this.villagerId, witnesses: this.fightWitnesses() }); } catch (e) {}
          const tdCfg = ((t.mdef || {}).encounter) || {};
          if (tdCfg.deathAudio) this.audioEvent(tdCfg.deathAudio);
          else if ((t.mdef || {}).id === 'gallowdeer') this.audioEvent('deerDown');
          // THE LEAD FALLS (hushwolf): without it, the pack usually melts away.
          if (this.wolfIs(t) && t.wolfLead && this.tbfight) {
            for (const o of this.tbfight.fighters) {
              if (o.kind !== 'monster' || !o.alive || o.fled || o.key === t.key) continue;
              if (((o.mdef || {}).id) !== 'hushwolf') continue;
              if (Math.random() < 0.6) {
                o.fled = true;
                this.say('Without the lead, another wolf melts back between the trees.');
              } else {
                o.wolfBroken = true;
              }
            }
            this.audioEvent('wolfBreak');
          }
          // DEATH THROES: a sweeping-beam monster cut down before its first
          // Discharge fires anyway — the light was already in its eyes. The
          // beam lances out as the body falls. (After the first Discharge the
          // light is spent; then it dies quiet, like anything else.)
          const dtPat = t.mdef && t.mdef.attack && t.mdef.attack.pattern;
          if (dtPat && dtPat.sweep && !t.hasFired && this.tbfight && !this.tbfight.over) {
            this.say(`You cut it down — but the light was already in its eyes. ${t.name}'s death throes loose the beam.`);
            const tgt = (this.encUsesFifo(t) && this.encCurrentTarget(t)) || this.tbFighter('p');
            const throe = {
              kind: 'squares', cells: [], dmg: (t.mdef.attack || {}).damage,
              attackName: (t.mdef.attack || {}).name, pattern: dtPat,
              aim: tgt ? { x: tgt.mx, y: tgt.my } : { x: t.mx, y: t.my + 1 },
              aimKey: tgt ? tgt.key : 'p', angle: tgt ? Math.atan2(tgt.my - t.my, tgt.mx - t.mx) : Math.PI / 2,
              firing: 1, dwell: 1,
            };
            t.hasFired = true;
            this.tbBeamSweepTick(t, throe);
            this.audioEvent('impact', { beam: true, highbeam: true });
          }
        }
      }
    },

    tbVillagerFalls(t) {
      const v = this.state.village;
      if (v.positions) delete v.positions[t.villagerId];
      v.fallen = v.fallen || [];
      v.fallen.push({ villagerId: t.villagerId, day: this.state.scholar.day, cause: 'combat' });
      if (v.roster) v.roster = v.roster.filter(id => id !== t.villagerId);
      if (v.villagers) v.villagers = v.villagers.filter(id => id !== t.villagerId);
    },

    tbVillagerSyncPos(v) {
      const vpos = this.state.village && this.state.village.positions;
      if (vpos && vpos[v.villagerId]) { vpos[v.villagerId].mx = v.mx; vpos[v.villagerId].my = v.my; }
    },

    // true danger cells — for AI instincts only. NEVER shown to the player.
    // (Direct-target telegraphs have no cells — the AI can't dodge those either.)
    tbDangerCells(excludeKey) {
      const f = this.tbfight, set = new Set();
      for (const m of f.fighters) {
        if (m.kind !== 'monster' || !m.alive || !m.telegraph || m.key === excludeKey) continue;
        if (!m.telegraph.cells) continue;
        // KNOWLEDGE-GATED DANGER (Steve 2026-10-05): villagers don't dodge a
        // telegraph they don't understand. If the community hasn't learned
        // this attack (codex), the lane isn't "danger" to them — just the
        // monster itself is scary. No more preemptive beam-dodging by people
        // who've never seen a beam.
        if (this.encUsesFifo(m) && !this.encTelegraphKnown(m)) continue;
        for (const c of m.telegraph.cells) set.add(c.cx + ',' + c.cy);
      }
      return set;
    },

    tbBlocked(x, y) {
      const detail = this.genDetail(this.map.px, this.map.py);
      const cell = detail[y] && detail[y][x];
      if (this.cellProps(cell).blocks) return true;
      const f = this.tbfight;
      if (f) for (const o of f.fighters) {
        // SMALL MONSTERS (Steve 2026-10-05): mice and other small creatures
        // don't block movement — you can walk through/past them. Larger
        // monsters block. Defaults to blocking.
        if (o.alive && !o.fled && o.mx === x && o.my === y) {
          if (o.kind === 'monster' && o.mdef && o.mdef.blocks === false) continue;
          return true;
        }
      }
      return false;
    },

    tbVillagerTurn(v) {
      const f = this.tbfight;
      const danger = this.tbDangerCells(); // instinct, not knowledge
      const blocked = (x, y) => this.tbBlocked(x, y) && !(x === v.mx && y === v.my);
      const dec = S.combat.villagerDecide(v, f.fighters, blocked, danger);
      for (const [nx, ny] of dec.moves) { v.mx = nx; v.my = ny; }
      if (dec.moves.length) this.tbVillagerSyncPos(v);
      const a = dec.action;
      if (a.type === 'strike' || a.type === 'harry') {
        const t = this.tbFighter(a.target);
        if (t && t.alive) {
          const dmg = a.type === 'strike' ? S.combat.roll([4, 8]) : S.combat.roll([2, 4]);
          this.say(`${v.name} ${a.type === 'strike' ? 'strikes' : 'harries'} the ${this.encTheName(t)}.`);
          this.tbDamage(t.key, dmg, v.name);
          // HIGHBEAM: hurting the deer moves them to the front of its list.
          try { const tt = this.tbFighter(t.key); if (tt && this.encUsesFifo(tt)) this.encNoticesPain(tt, v.key); } catch (e) {}
        }
      } else if (a.type === 'help') {
        const t = this.tbFighter(a.target);
        if (t && t.alive && !v.helped) {
          v.helped = true;
          t.hp = Math.min(t.maxHp, t.hp + 12);
          if (t.kind === 'player') this.state.scholar.health = Math.max(0, t.hp);
          this.say(`${v.name} patches you up (+12 HP). "Hold still!"`);
        }
      } else if (a.type === 'flee') {
        v.fled = true;
        this.say(`${v.name} runs for it!`);
      }
    },

    // === ENCOUNTER FRAMEWORK: FIFO THREAT QUEUE ===
    // Shared encounter framework interface (src/js/encounters.js will own
    // this; the Highbeam is the first client, not a parallel system).
    // Any monster whose mdef has an `encounter` config with fifo:true gets:
    //  - a threat queue: anyone who gets too close goes on the list, first
    //    seen first killed. It doesn't care that you're the protagonist.
    //  - relentless tracking: once you're on it, walking away doesn't lose it.
    //  - target switching ONLY on pain (hurting it gets noticed) or crazy
    //    closeness (adjacency overrules patience).
    //  - a turn-phase rhythm (stalk/aim/charge/firing/cooldown) with badges.
    //  - codex-gated telegraph: no lane warning / tactics until learned.
    // Highbeam-specific config lives in monsters.json (gallowdeer.encounter);
    // highbeam-specific behavior (sweep, paw, audio) plugs in as config.
    // Interface for the encounters.js sibling:
    //   encConfig(m), encUsesFifo(m), encThreatQueue(m), encNoticeRange(m),
    //   encNoticeFighter(m,key,silent), encCurrentTarget(m),
    //   encNoticesPain(m,attackerKey), encScanThreats(m),
    //   encTelegraphKnown(m), encPhaseBadge(m), encSetPhase(m,phase)
    deerIs(m) { return !!(m && m.kind === 'monster' && ((m.mdef || {}).id === 'gallowdeer')); },
    // MONSTER BATCH 1 (The Beasts): id predicates for the bespoke encounter
    // layer. Each plugs into the shared FIFO/phase/telegraph machinery — no
    // parallel systems, just per-id personality. (Follows the deerIs pattern.)
    boarIs(m) { return !!(m && m.kind === 'monster' && ((m.mdef || {}).id === 'bulldozer')); },
    wolfIs(m) { return !!(m && m.kind === 'monster' && ((m.mdef || {}).id === 'hushwolf')); },
    heronIs(m) { return !!(m && m.kind === 'monster' && ((m.mdef || {}).id === 'white_noise_heron')); },
    turtleIs(m) { return !!(m && m.kind === 'monster' && ((m.mdef || {}).id === 'speedbump_turtle')); },
    stagIs(m) { return !!(m && m.kind === 'monster' && ((m.mdef || {}).id === 'mirror_stag')); },
    // encPhaseFor: the turn-phase rhythm, per monster. The config's phaseMap
    // names the beats (declare/windup/resolve/cooldown/idle); without one the
    // Highbeam's aim/charge/firing/cooldown/stalk mapping holds. The deer is
    // untouched — it has no phaseMap, so every lookup falls through to its own.
    encPhaseFor(m, moment) {
      const cfg = this.encConfig(m) || {};
      const map = cfg.phaseMap || {};
      if (map[moment]) return map[moment];
      return { declare: 'aim', windup: 'charge', resolve: 'firing', cooldown: 'cooldown', idle: 'stalk' }[moment] || 'stalk';
    },
    // Monster-batch-2 id gates (follow the deerIs pattern — no parallel systems).
    mothIs(m) { return !!(m && m.kind === 'monster' && ((m.mdef || {}).id === 'mirrormoth')); },
    toadIs(m) { return !!(m && m.kind === 'monster' && ((m.mdef || {}).id === 'belltoad')); },
    lockpickIs(m) { return !!(m && m.kind === 'monster' && ((m.mdef || {}).id === 'lockpick_raccoon')); },
    humiceIs(m) { return !!(m && m.kind === 'monster' && ((m.mdef || {}).id === 'hummice')); },
    catfishIs(m) { return !!(m && m.kind === 'monster' && ((m.mdef || {}).id === 'nightlight_catfish')); },
    glasswingIs(m) { return !!(m && m.kind === 'monster' && ((m.mdef || {}).id === 'glasswing')); },
    sunbaskerIs(m) { return !!(m && m.kind === 'monster' && ((m.mdef || {}).id === 'sunbasker')); },
    // Names pre-knowledge are strange descriptors ("a toad like a war drum") —
    // composing them after "the"/"The" doubles the article ("the a toad").
    // Strip the leading article for sentence composition. Post-naming names
    // ("Headlight Harry 1") have no article: no-op.
    encTheName(m) {
      const n = String((m && m.name) || 'it');
      return n.replace(/^((an?)|the)\s+/i, '');
    },
    // MONSTER BATCH 2: short, diegetic labels for combat attribution, both
    // as attacker ("moth's Wing Flash", "toad 1's Resonant Croak") and as
    // target ("You STRIKE hum-mouse 1") — instead of the full descriptor
    // possessive ("a moth the size of a dinner plate, catching light wrong's
    // Wing Flash"). The gallowdeer is excluded explicitly — its lines never
    // change.
    encShortLabel(m) {
      const cfg = (m.mdef && m.mdef.encounter) || {};
      if (cfg.shortName && !this.deerIs(m)) {
        // NAME DISCIPLINE (Steve): the short true name ("hum-mouse") only
        // applies once the village has named it or the System has arrived.
        // Before that, callers fall back to the strange descriptor — the
        // uninitiated never see the true name in strike lines.
        const mid = m.mdef ? m.mdef.id : null;
        const e = mid ? (this.state.codex.monsters || {})[mid] : null;
        if ((!e || !e.villageName) && !this.state.systemArrived) return null;
        const n = String(m.name || '').match(/ (\d+)$/);
        return cfg.shortName + (n ? ' ' + n[1] : '');
      }
      return null; // not a batch monster: caller keeps its existing phrasing
    },
    encThreatLines(m) {
      // Per-monster notice/pain/proximity lines ({who} = the noticed fighter).
      // Defaults are the Highbeam's exact lines — the deer never changes.
      // Other batch monsters get shortName-based lines unless they define
      // threatLines in their encounter config.
      const cfg = this.encConfig(m) || {};
      const short = cfg.shortName || 'beast';
      const dflt = this.deerIs(m) ? {
        notice: "The deer's head swings toward {who}. Another light in its eyes. You're all on the list now.",
        pain: "It staggers — and its burning gaze fixes on {who}. Pain gets noticed.",
        snap: "Too close. The deer's gaze SNAPS to {who} — proximity overrules patience.",
      } : {
        notice: `The ${short}'s head swings toward {who}. You're on the list now — it doesn't forget.`,
        pain: "It staggers — pain gets noticed. Its attention fixes on {who}.",
        snap: `Too close. The ${short}'s attention SNAPS to {who} — proximity overrules patience.`,
      };
      const out = Object.assign(dflt, cfg.threatLines || {});
      // Bespoke queue-text keys: batch 3 (the uncanny) uses
      // noticeText/painText/adjText; batch 4 (corporate) uses
      // noticeText/painText/proximityText. All honored here.
      if (cfg.noticeText) out.notice = cfg.noticeText;
      if (cfg.painText) out.pain = cfg.painText;
      if (cfg.adjText) out.snap = cfg.adjText;
      if (cfg.proximityText) out.snap = cfg.proximityText;
      return out;
    },
    // MONSTER BATCH 3 (the uncanny): id gates for bespoke encounter behavior.
    // Same pattern as deerIs — targeted branches inside tbMonsterTurn, no
    // parallel systems. The generic engine still owns telegraph countdown,
    // resolution, the threat queue, and codex gating.
    vmIs(m) { return !!(m && m.kind === 'monster' && ((m.mdef || {}).id === 'voice_mimic_radio')); },
    biIs(m) { return !!(m && m.kind === 'monster' && ((m.mdef || {}).id === 'bright_idea')); },
    mpIs(m) { return !!(m && m.kind === 'monster' && ((m.mdef || {}).id === 'memory_projector')); },
    smIs(m) { return !!(m && m.kind === 'monster' && ((m.mdef || {}).id === 'service_mimic')); },
    cgIs(m) { return !!(m && m.kind === 'monster' && ((m.mdef || {}).id === 'contract_golem')); },
    // MONSTER BATCH 4 (corporate horrors): id gates for the bespoke layer,
    // following the deerIs pattern. The generic engine does the rest.
    droneIs(m) { return !!(m && m.kind === 'monster' && ((m.mdef || {}).id === 'review_drone')); },
    swarmIs(m) { return !!(m && m.kind === 'monster' && ((m.mdef || {}).id === 'camera_swarm')); },
    hornIs(m) { return !!(m && m.kind === 'monster' && ((m.mdef || {}).id === 'hype_horn')); },
    beastIs(m) { return !!(m && m.kind === 'monster' && ((m.mdef || {}).id === 'delegate_beast')); },
    encConfig(m) { return (m && m.mdef && m.mdef.encounter) || null; },
    encUsesFifo(m) { const c = this.encConfig(m); return !!(c && c.fifo); },
    encThreatQueue(m) {
      if (!Array.isArray(m.threatQueue)) m.threatQueue = [];
      return m.threatQueue;
    },
    encNoticeRange(m) {
      const c = this.encConfig(m);
      return (c && c.noticeRange) || 5; // chebyshev; line of sight required
    },
    encSetPhase(m, phase) { m.beamPhase = phase; },
    encNoticeFighter(m, key, silent) {
      const q = this.encThreatQueue(m);
      if (q.includes(key)) return false;
      q.push(key);
      const cfg = this.encConfig(m) || {};
      if (!silent && this.tbfight && !cfg.quiet) {
        const t = this.tbFighter(key);
        const who = t ? (t.kind === 'player' ? 'you' : t.name) : 'someone';
        this.say(this.encThreatLines(m).notice.replace('{who}', who));
        // AGGRO IS THE REVEAL (Steve): the terror audio starts when the deer
        // actually sees you — never before. The card stays innocent until then.
        if (this.deerIs(m)) this.audioEvent('deerNotice');
      }
      return true;
    },
    encCurrentTarget(m) {
      const f = this.tbfight;
      if (!f) return null;
      const q = this.encThreatQueue(m);
      for (const key of q) {
        const t = this.tbFighter(key);
        if (t && t.alive && !t.fled) return t;
      }
      return null;
    },
    // pain gets noticed: hurting the deer moves you to the front of the line.
    encNoticesPain(m, attackerKey) {
      if (!this.encUsesFifo(m) || !this.tbfight) return;
      const cfg = this.encConfig(m) || {};
      if (cfg.painSwitch === false) return;
      const t = this.tbFighter(attackerKey);
      if (!t || !t.alive || t.fled) return;
      const q = this.encThreatQueue(m);
      if (!q.includes(attackerKey)) q.push(attackerKey);
      const i = q.indexOf(attackerKey);
      const before = q[0];
      if (i > 0) { q.splice(i, 1); q.unshift(attackerKey); }
      if (q[0] !== before) {
        const who = t.kind === 'player' ? 'you' : t.name;
        if (!cfg.quiet) this.say(this.encThreatLines(m).pain.replace('{who}', who));
        this.audioEvent(cfg.aggroAudio || 'deerAggro');
      }
      // LOCKPICK: it remembers who hurt it mid-job — its turn reacts.
      if (this.lockpickIs(m)) m.lockpickHit = true;
    },
    // scan on the deer's turn: anyone too close gets noticed; anyone crazy
    // close (adjacent) jumps the queue.
    encScanThreats(m) {
      const f = this.tbfight;
      if (!f) return;
      const cfg = this.encConfig(m) || {};
      const adjOverride = cfg.adjacencyOverride !== undefined ? cfg.adjacencyOverride : 1;
      for (const o of f.fighters) {
        if (!o.alive || o.fled || o.key === m.key) continue;
        if (!S.combat.isFoe(m, o)) continue;
        const d = Math.max(Math.abs(o.mx - m.mx), Math.abs(o.my - m.my));
        if (d <= this.encNoticeRange(m) && this.canSee(m.mx, m.my, o.mx, o.my)) {
          this.encNoticeFighter(m, o.key);
        }
      }
      const q = this.encThreatQueue(m);
      const before = q[0];
      const cur = this.encCurrentTarget(m);
      for (const o of f.fighters) {
        if (!o.alive || o.fled || o.key === m.key) continue;
        if (!S.combat.isFoe(m, o)) continue;
        const d = Math.max(Math.abs(o.mx - m.mx), Math.abs(o.my - m.my));
        if (d <= adjOverride && (!cur || o.key !== cur.key)) {
          const i = q.indexOf(o.key);
          if (i > 0) q.splice(i, 1);
          if (q[0] !== o.key) q.unshift(o.key);
          break;
        }
      }
      if (q[0] !== before) {
        const t = this.tbFighter(q[0]);
        const who = t ? (t.kind === 'player' ? 'you' : t.name) : 'someone';
        if (!cfg.quiet) this.say(this.encThreatLines(m).snap.replace('{who}', who));
        this.audioEvent(cfg.aggroAudio || 'deerAggro');
      }
    },
    // Queue narration helpers — thin delegates over encThreatLines (the
    // unified framework). Batch 4 called these directly; they resolve the
    // same per-monster noticeText/painText/proximityText.
    encNoticeLine(m, who) {
      return this.encThreatLines(m).notice.split('{who}').join(who);
    },
    encPainLine(m, who) {
      return this.encThreatLines(m).pain.split('{who}').join(who);
    },
    encProximityLine(m, who) {
      return this.encThreatLines(m).snap.split('{who}').join(who);
    },
    // codex-gated: have you learned what the freeze means? The windup lane
    // (where the beam will START) and the tactical coaching only appear once
    // you've SURVIVED a full Discharge — the codex writes the pattern when
    // you live through it. Seeing the windup isn't enough. Knowledge is earned.
    encTelegraphKnown(m) {
      const id = (m.mdef || {}).id;
      if (!id) return false;
      const atkName = (m.mdef.attack || {}).name;
      if (atkName && this.tbPatternKnown(id, atkName)) return true;
      try {
        const me = (this.state.codex.monsters || {})[id] || {};
        if (me.stage === 'slain') return true;
      } catch (e) {}
      return false;
    },
    encPhaseBadge(m) {
      if (!this.encUsesFifo(m)) return '';
      const cfg = this.encConfig(m) || {};
      // Per-monster phase badges from data; the Highbeam's table is the default.
      const table = cfg.phaseBadges || {
        aim: ' 👁 AIMING', charge: ' ⚡ CHARGING', firing: ' 🔥 FIRING',
        cooldown: ' 😮‍💨 SPENT',
      };
      return table[m.beamPhase] || '';
    },

    // === MONSTER BATCH 2: bespoke encounter behavior ===
    // Each trickster's personality plugs into tbMonsterTurn via the id gates
    // above (the deerIs pattern). No parallel systems: the FIFO queue, the
    // telegraph engine, and the codex gates are all shared.

    // Advance-until range per monster: burst monsters close to their blast
    // (radius + 1) instead of declaring at nothing. Other monsters keep the
    // generic want — their batches own their tuning.
    encWantRange(m, pat) {
      if (pat.type === 'direct') return pat.range || 3;
      // HUMMICE (Steve 2026-10-04): nibblers close in — range 2 puts them in
      // spear reach. Bombarding from 3 made them unhittable; the fight is a
      // brawl around the hum, not a siege.
      if (pat.type === 'burst' && this.humiceIs(m)) return 2;
      if (pat.type === 'burst' && this.toadIs(m)) return (pat.radius || 2) + 1;
      return 4;
    },

    // Declare-phase per monster (replaces the generic 'aim' for fifo clients).
    encDeclarePhase(m) {
      if (this.mothIs(m)) return 'fold';
      if (this.toadIs(m)) return 'swell';
      if (this.humiceIs(m)) return (((this.tbfight || {}).humStacks || 0) >= 3) ? 'tide' : 'hum';
      return 'aim';
    },

    // MOTH: erratic drift approach — it doesn't hunt, it wanders toward
    // light. Returns true when the turn is fully handled (no declare this
    // turn), false to fall through to the fold (declare).
    tbMothApproach(m, foe, blocked) {
      // landed: hold still — the fold (declare) follows. No more drifting;
      // the facing locked at the fold is the whole game.
      if (m.beamPhase === 'land') return false;
      for (let i = 0; i < 2; i++) {
        const dx = Math.sign(foe.f.mx - m.mx), dy = Math.sign(foe.f.my - m.my);
        const jx = Math.random() < 0.45 ? (Math.random() < 0.5 ? 1 : -1) : dx;
        const jy = Math.random() < 0.45 ? (Math.random() < 0.5 ? 1 : -1) : dy;
        const nx = m.mx + jx, ny = m.my + jy;
        if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
        if (blocked(nx, ny)) continue;
        m.mx = nx; m.my = ny;
      }
      // it always drifts facing its light — you.
      m.mothFacing = { x: Math.sign(foe.f.mx - m.mx) || 0, y: Math.sign(foe.f.my - m.my) || 1 };
      const d = Math.max(Math.abs(foe.f.mx - m.mx), Math.abs(foe.f.my - m.my));
      // the land is honest: it only lands inside flash range (burst radius 2).
      // Landing at range 3 and flashing at nothing would be a lying telegraph.
      if (d <= 2) {
        if (!m.telegraph) {
          this.encSetPhase(m, 'land');
          this.say('It lands on a branch at eye level — wings half-open, catching light that isn\'t there. Watching you watch it.');
          this.audioEvent('mothFlutter');
          return true; // a beat to read it. the fold comes next turn.
        }
        return false;
      }
      if (m.beamPhase !== 'stalk') this.encSetPhase(m, 'stalk');
      return true;
    },

    // MOTH: the flash only goes FORWARD — a frontal 180° arc from its locked
    // facing. Facing locks when the fold is declared. Behind it, you're safe.
    tbMothArcCells(m, cells) {
      // NOTE: fy uses a nullish check, not || — a locked facing of {x:1,y:0}
      // is real data, not a missing value.
      const fc = m.mothFacing || {};
      const fx = fc.x || 0;
      const fy = (fc.y === undefined || fc.y === null) ? 1 : fc.y;
      return (cells || []).filter(c => (c.cx - m.mx) * fx + (c.cy - m.my) * fy > 0);
    },

    // HUMMICE: the swarm is one instrument. Deaths drop voices out of the
    // choir (stacks fall, survivors scatter); nobody standing in the hum
    // lets it thin out. Runs on every hummice turn; the round guard keeps
    // the decay to once per round.
    tbHumSwarmCheck(m) {
      const f = this.tbfight;
      if (!f) return;
      const mice = f.fighters.filter(x => x.kind === 'monster' && x.alive && !x.fled && x.mdef && x.mdef.id === 'hummice');
      if (f.humMice == null) f.humMice = mice.length;
      if (mice.length < f.humMice) {
        const lost = f.humMice - mice.length;
        f.humStacks = Math.max(0, (f.humStacks || 0) - 2 * lost);
        this.say('A voice drops out of the choir — the hum stutters and thins.');
        this.audioEvent('humBreak');
        for (const mm of mice) {
          if (this.encUsesFifo(mm)) this.encSetPhase(mm, 'scatter');
          let bx = 0, by = 0;
          for (const o of f.fighters) {
            if ((o.kind !== 'player' && o.kind !== 'villager') || !o.alive || o.fled) continue;
            bx += Math.sign(mm.mx - o.mx); by += Math.sign(mm.my - o.my);
          }
          const nx = mm.mx + Math.sign(bx), ny = mm.my + Math.sign(by);
          if ((nx !== mm.mx || ny !== mm.my) && nx >= 0 && nx <= 8 && ny >= 0 && ny <= 8 && !this.tbBlocked(nx, ny)) {
            mm.mx = nx; mm.my = ny;
          }
        }
        f.humMice = mice.length;
      }
      if (f.humDecayRound !== f.round) {
        f.humDecayRound = f.round;
        const p0 = this.tbFighter('p');
        const last = f.humPlayerPos;
        const moved = (p0 && last) ? Math.max(Math.abs(p0.mx - last.x), Math.abs(p0.my - last.y)) : 99;
        if (p0) f.humPlayerPos = { x: p0.mx, y: p0.my };
        const stood = f.fighters.some(o => (o.kind === 'player' || o.kind === 'villager') && o.alive && !o.fled &&
          mice.some(mm => Math.max(Math.abs(o.mx - mm.mx), Math.abs(o.my - mm.my)) <= 2));
        // the hum needs you STANDING in it. keep moving and it can't settle.
        if ((f.humStacks || 0) > 0 && (!stood || moved >= 2)) {
          f.humStacks -= 1;
          this.say(moved >= 2 ? "You keep moving — the hum can't settle on you." : 'The hum thins — nobody standing in it.');
        }
      }
    },

    // BELLTOAD: the chorus. When one throat lets go, every other live toad
    // within 4 tiles joins — its damage lands in the same beat — then every
    // throat goes spent. Break the pack, break the chorus.
    tbChorusJoin(m) {
      const f = this.tbfight;
      if (!f) return;
      let joined = 0;
      for (const o of f.fighters) {
        if (f.over) break;
        if (o.key === m.key || o.kind !== 'monster' || !o.alive || o.fled) continue;
        if (!this.toadIs(o)) continue;
        if (Math.max(Math.abs(o.mx - m.mx), Math.abs(o.my - m.my)) > 4) continue;
        const op = ((o.mdef || {}).attack || {}).pattern || { type: 'burst', radius: 2 };
        const ocells = S.combat.patternCells(op, o.mx, o.my, o.mx, o.my);
        const hitKeys = new Set(ocells.map(c => c.cx + ',' + c.cy));
        this.say('🐸 Another throat swells — the CHORUS takes it!');
        for (const t of f.fighters) {
          if (f.over) break;
          if (!t.alive || t.fled || t.key === o.key) continue;
          if (t.kind !== 'player' && t.kind !== 'villager') continue;
          if (hitKeys.has(t.mx + ',' + t.my)) {
            this.tbDamage(t.key, S.combat.roll(((o.mdef || {}).attack || {}).damage || [8, 12]), (this.encShortLabel(o) || o.name) + "'s Resonant Croak");
          }
        }
        o.telegraph = null;
        o.encCooldown = 2; o.startled = false;
        if (this.encUsesFifo(o)) this.encSetPhase(o, 'quiet');
        joined++;
      }
      if (joined > 0) {
        this.audioEvent('toadChorus');
        this.say(`The chorus lands as ONE sound — then every throat goes slack. (chorus ×${joined + 1})`);
      } else {
        this.say('Its croak echoes alone. No answer. The pack is broken.');
      }
      m.encCooldown = 2; m.startled = false;
      if (this.encUsesFifo(m)) this.encSetPhase(m, 'quiet');
    },

    // LOCKPICK: steal-first turn loop. case → grab → bolt → cornered.
    // Returns true when the turn is fully handled, false to fall through to
    // the generic attack engine (cornered — it fights for real now).
    tbLockpickTurn(m) {
      const f = this.tbfight;
      const useFifo = this.encUsesFifo(m);
      const setP = (ph) => { if (useFifo) this.encSetPhase(m, ph); };
      // hurt mid-job: it rethinks its life choices on its next turn.
      if (m.lockpickHit) {
        m.lockpickHit = false;
        const ph = m.beamPhase;
        if (ph === 'bolt' && m.stolen) {
          const got = this.tbLockpickReturn(m);
          m.fled = true;
          this.say(`It yelps — drops your ${got} — and runs for its life, empty-handed.`);
          this.audioEvent('lockpickChitter');
          this.tbEndCheck();
          return true;
        }
        if (ph === 'case' || ph === 'stalk') {
          m.fled = true;
          this.say('Not worth the claws — it bolts empty-handed, chittering curses at you.');
          this.audioEvent('lockpickChitter');
          this.tbEndCheck();
          return true;
        }
        if (ph === 'grab') {
          setP('cornered');
          this.say('You hurt it mid-grab — it SCREECHES, and those clever hands curl into claws. Cornered now. It fights.');
          this.audioEvent('lockpickChitter');
          return false; // falls through: generic Disassemble, as a weapon
        }
      }
      const phase = m.beamPhase || 'case';
      if (phase === 'cornered') {
        // it still isn't built for this. below 40%: gone.
        if (m.hp / m.maxHp < 0.4) {
          if (m.stolen) { const got = this.tbLockpickReturn(m); this.say(`It drops your ${got} and runs — your pack isn't worth dying for.`); }
          else this.say('It decides your pack isn\'t worth dying for — and runs.');
          m.fled = true;
          this.audioEvent('lockpickChitter');
          this.tbEndCheck();
          return true;
        }
        return false; // generic attack engine
      }
      const foe = (useFifo && this.encCurrentTarget(m)) || this.tbFighter('p');
      const blocked = (x, y) => this.tbBlocked(x, y) && !(x === m.mx && y === m.my);
      const stepTo = (tx, ty) => {
        const st = this.tbStepToward(m, tx, ty, blocked);
        if (st) { m.mx = st.x; m.my = st.y; return true; }
        return false;
      };
      if (phase === 'case') {
        if (!m.cased) {
          m.cased = true;
          this.say('It circles once, eyes never leaving your pack — those hands never stop moving.');
          this.audioEvent('lockpickChitter');
        }
        // FAST HANDS (Steve 2026-10-05): if you're already in grab range, it
        // doesn't waste a turn circling — it steals NOW. Fighting it up close
        // is how it ends up with your best weapon. The counterplay is hitting
        // it while it bolts (it drops the loot).
        if (foe && Math.max(Math.abs(foe.mx - m.mx), Math.abs(foe.my - m.my)) <= 2) {
          const got = this.tbLockpickSteal(m);
          if (got) {
            setP('bolt');
            this.say(`🖐️ Its hands blur — and suddenly it's holding your ${got}! It's already running.`);
            this.audioEvent('lockpickGrab');
          } else {
            m.fled = true;
            this.say('Its hands blur through your pack — and come up empty. It chitters, disgusted, and leaves.');
            this.audioEvent('lockpickChitter');
          }
          this.tbEndCheck();
          return true;
        }
        if (foe && Math.max(Math.abs(foe.mx - m.mx), Math.abs(foe.my - m.my)) > 3) stepTo(foe.mx, foe.my);
        setP('grab');
        this.tbEndCheck();
        return true;
      }
      if (phase === 'grab') {
        if (foe) {
          for (let i = 0; i < m.speed; i++) {
            if (Math.max(Math.abs(foe.mx - m.mx), Math.abs(foe.my - m.my)) <= 2) break;
            if (!stepTo(foe.mx, foe.my)) break;
          }
          const d = Math.max(Math.abs(foe.mx - m.mx), Math.abs(foe.my - m.my));
          if (d <= 2) {
            const got = this.tbLockpickSteal(m);
            if (got) {
              setP('bolt');
              this.say(`🖐️ Its hands blur — and suddenly it's holding your ${got}! It's already running.`);
              this.audioEvent('lockpickGrab');
            } else {
              m.fled = true;
              this.say('Its hands blur through your pack — and come up empty. It chitters, disgusted, and leaves.');
              this.audioEvent('lockpickChitter');
            }
            this.tbEndCheck();
            return true;
          }
        }
        this.say('It darts for your pack — still too far. It\'ll be back.');
        this.tbEndCheck();
        return true;
      }
      if (phase === 'bolt') {
        // for the nearest edge, fast. it wants your stuff, not a fight.
        let ex = 0, ey = 0, bd = 99;
        for (const [cx, cy] of [[0, m.my], [8, m.my], [m.mx, 0], [m.mx, 8]]) {
          const dd = Math.max(Math.abs(cx - m.mx), Math.abs(cy - m.my));
          if (dd < bd) { bd = dd; ex = cx; ey = cy; }
        }
        for (let i = 0; i < m.speed; i++) {
          if (m.mx === ex && m.my === ey) break;
          if (!stepTo(ex, ey)) break;
        }
        if (m.mx === 0 || m.mx === 8 || m.my === 0 || m.my === 8) {
          m.fled = true;
          const lost = m.stolen ? m.stolen.name : 'nothing';
          m.stolen = null; // it's gone. so is your stuff.
          this.say(`It's over the ridge with your ${lost}. Gone.`);
          this.audioEvent('lockpickChitter');
        } else {
          this.say(`It bolts — ${m.stolen ? 'your ' + m.stolen.name + ' in its hands' : 'empty-handed'} — pure getaway.`);
        }
        this.tbEndCheck();
        return true;
      }
      return false; // unknown phase: generic engine
    },

    // LOCKPICK STEAL: equipped weapon first (it's in your hands — that's the
    // point), else the most valuable pack item. Returns the taken name, or
    // null when there's nothing worth taking.
    tbLockpickSteal(m) {
      const s = this.state.scholar;
      const eq = (s.equipped || {}).weapon;
      if (eq && eq.itemId && !eq.unarmed) {
        m.stolen = { kind: 'weapon', itemId: eq.itemId, name: eq.name || 'weapon' };
        s.equipped.weapon = null;
        return m.stolen.name;
      }
      const inv = s.inventory || [];
      let bi = -1, bv = -1;
      for (let i = 0; i < inv.length; i++) {
        const it = inv[i];
        if (!it || (it.units || 0) <= 0) continue;
        const v = (it.kcalEach || 0) * (it.units || 1) + (it.bonded ? 50 : 0);
        if (v > bv) { bv = v; bi = i; }
      }
      if (bi < 0) return null;
      const it = inv.splice(bi, 1)[0];
      m.stolen = { kind: 'inv', item: it, name: it.name || 'something' };
      return m.stolen.name;
    },
    tbLockpickReturn(m) {
      const s = this.state.scholar;
      const st = m.stolen; m.stolen = null;
      if (!st) return 'nothing';
      if (st.kind === 'weapon') {
        s.equipped = s.equipped || {};
        s.equipped.weapon = { itemId: st.itemId, name: st.name };
      } else {
        s.inventory = s.inventory || [];
        s.inventory.push(st.item);
      }
      return st.name;
    },

    // NIGHTLIGHT CATFISH: the lure. It never chases — it waits for curiosity.
    // lure → still → grasp → dark → lure. The stillness is the only warning.
    tbCatfishTurn(m) {
      const f = this.tbfight;
      const useFifo = this.encUsesFifo(m);
      const setP = (ph) => { if (useFifo) this.encSetPhase(m, ph); };
      const foe = (useFifo && this.encCurrentTarget(m)) || this.tbFighter('p');
      if (!foe || !foe.alive) { this.tbEndCheck(); return; }
      const d = Math.max(Math.abs(foe.mx - m.mx), Math.abs(foe.my - m.my));
      const phase = m.beamPhase || 'lure';
      const atk = (m.mdef || {}).attack || {};
      if (phase === 'lure') {
        if (!m.lureSaid) {
          m.lureSaid = true;
          this.say('A soft green glow pulses under the water. Pretty. You want to look closer. That\'s the idea.');
          this.audioEvent('catfishLure');
        }
        if (d <= 3) {
          setP('still');
          this.say('The water goes still around the light. Too still. Something down there just noticed you.');
          this.audioEvent('catfishStill');
        }
        // it does not move. the lure waits.
      } else if (phase === 'still') {
        if (d <= 2) {
          setP('grasp');
          this.say('💥 The glow LUNGES — teeth where the light was! LURE AND GRASP!');
          this.audioEvent('catfishSnap');
          for (const o of f.fighters) {
            if (f.over) break;
            if (!o.alive || o.fled || o.key === m.key) continue;
            if (o.kind !== 'player' && o.kind !== 'villager') continue;
            if (Math.max(Math.abs(o.mx - m.mx), Math.abs(o.my - m.my)) <= 2) {
              this.tbDamage(o.key, S.combat.roll(atk.damage || [12, 20]), (this.encShortLabel(m) || m.name) + "'s Lure and Grasp");
            }
          }
          this.tbLearnPattern(m);
          m.catfishDark = 2;
          setP('dark');
          this.say('The glow gutters out. Dark water. It\'s moving.');
        } else if (d > 4) {
          setP('lure'); m.lureSaid = false;
          this.say('The glow settles back into its pulse. Waiting. It can wait all night.');
        } else {
          this.say('The water stays too still. The light doesn\'t blink.');
        }
      } else { // dark
        m.catfishDark = (m.catfishDark == null ? 2 : m.catfishDark) - 1;
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        const dd = dirs[Math.floor(Math.random() * dirs.length)];
        const nx = m.mx + dd[0], ny = m.my + dd[1];
        if (nx >= 0 && nx <= 8 && ny >= 0 && ny <= 8 && !this.tbBlocked(nx, ny)) { m.mx = nx; m.my = ny; }
        if (m.catfishDark <= 0) {
          setP('lure'); m.lureSaid = false;
          this.say('A tile or two over, the green glow rekindles. Pretty. That\'s still the problem.');
          this.audioEvent('catfishLure');
        }
      }
      this.tbEndCheck();
    },

    // SHOUT: raw noise, no words. The belltoad's weakness made verb — loud
    // noise breaks the chorus. Twice per fight; throats are finite.
    // GRAVITY WELL (Steve 2026-10-05): alien loot that works. Crushes a 3x3
    // area — monsters caught in it can't move for 2 turns. One use; the
    // well burns out. Honest alien tech, not text.
    tbPlayerGravityWell() {
      const f = this.tbfight;
      if (!f || !this.tbIsPlayerTurn()) return false;
      const p = this.tbFighter('p');
      if (!p || p.acted) { this.say('Already acted this turn.'); return false; }
      if (!this.hasItem('gravity_well')) { this.say('No gravity well.'); return false; }
      this.consumeItem('gravity_well', 1);
      p.acted = true;
      this.audioEvent('gravity_well');
      let n = 0;
      for (const m of f.fighters) {
        if (m.kind !== 'monster' || !m.alive || m.fled) continue;
        const d = Math.max(Math.abs(m.mx - p.mx), Math.abs(m.my - p.my));
        if (d > 3) continue;
        n++;
        m.gravityHeld = 2; // can't move for 2 turns
        if (m.telegraph) m.telegraph = null;
      }
      this.say(n ? `The well opens — space folds. ${n} ${n === 1 ? 'monster' : 'monsters'} held fast, can't move for 2 turns.`
        : 'The well opens on empty ground. Nothing caught.');
      return true;
    },
    tbPlayerShout() {
      const f = this.tbfight;
      if (!f || !this.tbIsPlayerTurn()) return false;
      const p = this.tbFighter('p');
      if (p.acted) { this.say('Already acted this turn.'); return false; }
      f.shouts = (f.shouts || 0) + 1;
      if (f.shouts > 2) { this.say('Your throat is raw. No shout left in this fight.'); return false; }
      p.acted = true;
      this.say('You cup your hands and BELLOW — raw noise, no words, all lungs.');
      this.audioEvent('shout');
      let n = 0;
      for (const m of f.fighters) {
        if (m.kind !== 'monster' || !m.alive || m.fled) continue;
        // HUMMICE (Steve 2026-10-04): the swarm's coordination IS sound —
        // noise breaks the music even though they don't "fear" it. The hum
        // needs the choir; a bellow scatters the choir.
        if ((((m.mdef || {}).fear) || '').toLowerCase() !== 'loud noise' && !this.humiceIs(m)) continue;
        n++;
        if (m.telegraph) m.telegraph = null;
        m.encCooldown = Math.max(m.encCooldown || 0, 1);
        m.startled = true;
        if (this.encUsesFifo(m)) this.encSetPhase(m, 'quiet');
        const dx = Math.sign(m.mx - p.mx), dy = Math.sign(m.my - p.my);
        const detail = this.genDetail(this.map.px, this.map.py);
        for (const step of [[dx, dy], [dx, 0], [0, dy], [-dy, dx], [dy, -dx], [-dx, -dy]]) {
          const nx = m.mx + step[0], ny = m.my + step[1];
          if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
          const cell = detail[ny] && detail[ny][nx];
          if (cell && this.cellProps(cell).blocks) continue;
          let occ = false;
          for (const o of f.fighters) { if (o !== m && o.alive && !o.fled && o.mx === nx && o.my === ny) { occ = true; break; } }
          if (occ) continue;
          m.mx = nx; m.my = ny; break;
        }
        this.say(`The ${this.encTheName(m)} flinches — its note dies mid-croak. It hops back, throat fluttering.`);
      }
      if (!n) this.say('Nothing out there cares about noise. The dark swallows it.');
      else this.tbStyle(10, 'broke the chorus with raw noise');
      this.tbRefreshTelegraphUI();
      this.tbAfterPlayerAction();
      return true;
    },

    // OFFER FOOD: the Lockpick's weakness made verb — it cannot resist food.
    // Buys back stolen goods (it drops your things for the meal) or buys it
    // off before it grabs. Costs the turn's action and one unit of food.
    tbPlayerOfferFood() {
      const f = this.tbfight;
      if (!f || !this.tbIsPlayerTurn()) return false;
      const p = this.tbFighter('p');
      if (p.acted) { this.say('Already acted this turn.'); return false; }
      const s = this.state.scholar;
      const inv = s.inventory || [];
      const fi = inv.findIndex(i => i && (i.units || 0) > 0 && (i.kcalEach || 0) > 0);
      if (fi < 0) { this.say('No food to offer — your pack is as empty as your plan.'); return false; }
      const locks = f.fighters.filter(m => m.kind === 'monster' && m.alive && !m.fled && this.lockpickIs(m));
      if (!locks.length) { this.say('Nothing here wants your food. Save it.'); return false; }
      const food = inv[fi];
      food.units -= 1;
      if (food.units <= 0) inv.splice(fi, 1);
      p.acted = true;
      const m = locks[0];
      const fname = food.name || 'food';
      if (m.stolen) {
        const got = this.tbLockpickReturn(m);
        this.say(`You toss ${fname}. It CANNOT resist — drops your ${got} mid-scamper and stuffs its cheeks instead.`);
      } else {
        this.say(`You toss ${fname} — and those too-many fingers snatch it mid-air. It stuffs its cheeks and bolts. Your pack survives. This time.`);
      }
      m.fled = true;
      this.audioEvent('lockpickChitter');
      this.tbStyle(10, 'bought off the thief');
      this.tbRefreshTelegraphUI();
      this.tbAfterPlayerAction();
      return true;
    },

    // === BATCH 3 (the uncanny): bespoke declare helpers ===
    // Same telegraph shapes the generic pending section counts down and
    // resolves — only the cue text (phase-specific, codex-gated where it
    // matters) is bespoke. No parallel combat system.
    encDeclareDirect(m, target, cueText) {
      const atk = m.mdef.attack || {};
      const pat = atk.pattern || { type: 'direct', range: 3 };
      m.telegraph = { kind: 'direct', targetKey: target.key, dmg: atk.damage,
        attackName: atk.name, pattern: pat, turnsLeft: pat.windup || 1,
        cueText: cueText || null };
      this.sayTelegraphOnce(m, '⚠ ' + this.tbTelegraphCue(m));
      this.audioEvent('telegraph', { urgency: m.telegraph.turnsLeft, pattern: 'direct' });
      this.tbRefreshTelegraphUI();
    },
    encDeclareBeam(m, foe, cueText) {
      const atk = m.mdef.attack || {};
      const pat = atk.pattern || { type: 'beam', length: 5, width: 1 };
      // BEAM: terrain blocks the shot at declare — break line of sight,
      // break the beam. (Fighters never block: it goes through them.)
      let cells = S.combat.patternCells(pat, m.mx, m.my, foe.f.mx, foe.f.my);
      const detail = this.genDetail(this.map.px, this.map.py);
      const cut = [];
      for (const c of cells) {
        const cell = detail[c.cy] && detail[c.cy][c.cx];
        if (cell && this.cellProps(cell).blocks) break;
        cut.push(c);
      }
      cells = cut;
      const p0 = this.tbFighter('p');
      m.telegraph = { kind: 'squares', cells, dmg: atk.damage,
        attackName: atk.name, pattern: pat, turnsLeft: pat.windup || 1,
        threatenedPlayer: !!(p0 && p0.alive && cells.some(c => c.cx === p0.mx && c.cy === p0.my)),
        aim: { x: foe.f.mx, y: foe.f.my }, dir: null, aimKey: foe.f.key,
        angle: null, firing: 0, cueText: cueText || null };
      // WITNESS: seeing it wind up teaches you its attack (codex machinery).
      try {
        const me = this.ensureMonsterEntry(m.mdef.id);
        if (atk.name && !me.attacksSeen.includes(atk.name)) {
          me.attacksSeen.push(atk.name);
          if (me.stage === 'encountered') me.stage = 'observed';
        }
      } catch (e) {}
      this.sayTelegraphOnce(m, '⚠ ' + this.tbTelegraphCue(m));
      this.audioEvent('telegraph', { urgency: m.telegraph.turnsLeft, pattern: 'beam', beam: true });
      this.tbRefreshTelegraphUI();
    },
    // The voice the mimic cries in: someone the target would go back for. It
    // learns voices from the people it has noticed (the threat queue first),
    // otherwise the roster. Never the target's own name without the twist.
    vmVoiceName(m, target) {
      // Pre-System, people are stranger descriptors, not names ("A person,
      // maybe 50s") — the mimic imitates the VOICE, so the descriptor sits
      // in the sentence lowercased: "it sounds like a person, maybe 50s".
      const lower1 = (s) => { s = String(s || ''); return s.charAt(0).toLowerCase() + s.slice(1); };
      try {
        const q = this.encThreatQueue(m);
        const names = [];
        for (const key of q) {
          if (key === target.key) continue;
          const fr = this.tbFighter(key);
          if (fr && fr.alive && fr.kind !== 'monster' && fr.kind !== 'hostile') {
            names.push(fr.kind === 'player' ? 'you' : lower1(fr.name));
          }
        }
        if (names.length) return names[Math.floor(Math.random() * names.length)];
        const roster = (this.state.village && this.state.village.roster) || [];
        const others = roster.filter(rid => rid !== this.villagerId);
        const rid = others[Math.floor(Math.random() * others.length)];
        if (rid) return lower1(this.displayName(rid));
      } catch (e) {}
      return 'someone you know';
    },
    // MEMORY PROJECTOR: the spell-pull. While the beam gathers, a target that
    // stands still is dragged a tile closer ("you take a step closer without
    // deciding to") — the spell holds them on the beam's line. Moving 2+
    // tiles in a turn breaks the spell outright: the image can't hold.
    // Returns true when the spell broke (telegraph canceled).
    mpSpellPull(m, tg) {
      const tgt = this.tbFighter(tg.aimKey) || this.tbFighter('p');
      if (!tgt || !tgt.alive || tgt.fled) return false;
      const px = tgt.mx, py = tgt.my;
      if (m.mpTx === undefined) { m.mpTx = px; m.mpTy = py; return false; }
      const moved = Math.max(Math.abs(px - m.mpTx), Math.abs(py - m.mpTy));
      m.mpTx = px; m.mpTy = py;
      const who = tgt.kind === 'player' ? 'You' : tgt.name;
      if (moved >= 2) {
        m.telegraph = null;
        m.mpDeclared = false;
        this.encSetPhase(m, 'watch'); m.mpWatch = 2;
        this.say(`${who === 'You' ? 'You force' : who + ' forces'} ${tgt.kind === 'player' ? 'your' : 'their'} feet to move — the image judders, breaks up. Too fast. It can't hold the picture. The screen collapses to static.`);
        this.audioEvent('projectorBreak');
        return true;
      }
      if (moved === 0) {
        const dx = Math.sign(m.mx - px), dy = Math.sign(m.my - py);
        if (dx || dy) {
          const nx = px + dx, ny = py + dy;
          if (!(nx === m.mx && ny === m.my) && nx >= 0 && nx <= 8 && ny >= 0 && ny <= 8 && !this.tbBlocked(nx, ny)) {
            tgt.mx = nx; tgt.my = ny;
            if (tgt.kind === 'player') { this.state.scholar.mx = nx; this.state.scholar.my = ny; }
            this.say(tgt.kind === 'player'
              ? 'You take a step closer without deciding to. The light wants you nearer.'
              : `${tgt.name} takes a step closer, eyes fixed on the light. They didn't decide to.`);
            this.audioEvent('projectorPull');
          }
        }
      }
      return false;
    },

    // nearest fire cell within range (chebyshev) of (x,y) — the swarm's bane.
    tbNearestFire(x, y, range) {
      const detail = this.genDetail(this.map.px, this.map.py);
      let best = null, bestD = 99;
      for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
        if (!detail[cy] || detail[cy][cx] !== 'fire') continue;
        const d = Math.max(Math.abs(cx - x), Math.abs(cy - y));
        if (d <= range && d < bestD) { bestD = d; best = { x: cx, y: cy }; }
      }
      return best;
    },

    // the drone grades your dodging in real time. It opens at 41% — BELOW TARGET.
    droneEff(m) { return (m.dodgeEff == null) ? 41 : m.dodgeEff; },
    droneScore(m, dodged) {
      let eff = this.droneEff(m);
      eff = dodged ? Math.min(97, eff + 8) : Math.max(5, eff - 12);
      m.dodgeEff = eff;
      return eff;
    },
    // the swarm creeps toward its muse (the player) even mid-windup — one
    // tile, never onto anyone, never into fire. It cannot stop filming.
    swarmCreep(m) {
      const f = this.tbfight;
      if (!f) return;
      const p = this.tbFighter('p');
      if (!p || !p.alive) return;
      if (Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my)) <= 1) return;
      const detail = this.genDetail(this.map.px, this.map.py);
      const s = this.tbStepToward(m, p.mx, p.my, (x, y) => {
        if (x < 0 || x > 8 || y < 0 || y > 8) return true;
        const cell = detail[y] && detail[y][x];
        if (cell && this.cellProps(cell).blocks) return true;
        if (this.tbNearestFire(x, y, 1)) return true;
        return false;
      });
      if (s) {
        m.mx = s.x; m.my = s.y;
        if (m.telegraph && !m.telegraph.creepNarrated) {
          m.telegraph.creepNarrated = true;
          this.say('It never stops filming — the swarm closes in even as the flashes build.');
        }
      }
    },

    // BATCH 4 breather beats: post-attack recovery, one full turn each.
    // Returns true when the monster spent its turn breathing.
    tbFifoBreather(m) {
      const specs = [
        ['droneIs', 'droneRecalc', 'recalc',
          'The drone hovers, re-running the numbers. "RECALIBRATING METRICS."', 'droneRecalc'],
        ['hornIs', 'hypeCooldown', 'deflate',
          'It sags, spent — the encouragement took everything out of it.', 'hypeDeflate'],
        ['beastIs', 'beastDebrief', 'debrief',
          'It dictates into nothing: "violence action item: closed. Scheduling retrospective."', 'delegateDebrief'],
      ];
      for (const [pred, field, phase, text, audio] of specs) {
        if (this[pred](m) && (m[field] || 0) > 0) {
          m[field] -= 1;
          this.encSetPhase(m, phase);
          this.say(text);
          if (audio) this.audioEvent(audio);
          this.tbRefreshTelegraphUI();
          this.tbEndCheck();
          return true;
        }
      }
      return false;
    },
    // DELEGATE's circle: two steps orbiting the target — it commits to a
    // direction and keeps turning that way (no pacing out and back), holding
    // roughly the same distance. All while dictating the meeting into nothing.
    beastCircle(m, tgt) {
      const detail = this.genDetail(this.map.px, this.map.py);
      const angDiff = (a, b) => {
        let d = a - b;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        return d;
      };
      let px = m.mx, py = m.my, dirSign = 0;
      for (let step = 0; step < 2; step++) {
        const d0 = Math.max(Math.abs(tgt.mx - m.mx), Math.abs(tgt.my - m.my));
        const ang0 = Math.atan2(m.my - tgt.my, m.mx - tgt.mx);
        let best = null, bestScore = -99, bestDa = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = m.mx + dx, ny = m.my + dy;
          if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
          if (nx === px && ny === py) continue; // no backtracking
          const cell = detail[ny] && detail[ny][nx];
          if (cell && this.cellProps(cell).blocks) continue;
          const d = Math.max(Math.abs(tgt.mx - nx), Math.abs(tgt.my - ny));
          const da = angDiff(Math.atan2(ny - tgt.my, nx - tgt.mx), ang0);
          if (dirSign !== 0 && Math.sign(da) !== dirSign) continue; // keep turning
          const score = Math.abs(da) - Math.abs(d - d0) * 0.6;
          if (score > bestScore) { bestScore = score; best = { x: nx, y: ny }; bestDa = da; }
        }
        if (!best) break;
        px = m.mx; py = m.my;
        if (dirSign === 0 && bestDa !== 0) dirSign = Math.sign(bestDa);
        m.mx = best.x; m.my = best.y;
      }
      m.circled = true;
      this.encSetPhase(m, 'circle');
      this.say('⚠ ' + ((m.mdef.attack || {}).telegraph || 'It paces a wide circle around you.'));
      this.audioEvent('delegateCircle');
    },
    // INFLUENCER's chase: up to full speed at the player, stopping at arm's
    // length — never onto anyone, never into fire. It fears fire (instinct).
    swarmChase(m) {
      const f = this.tbfight;
      if (!f) return;
      const p = this.tbFighter('p');
      if (!p || !p.alive) return;
      const detail = this.genDetail(this.map.px, this.map.py);
      const danger = this.tbDangerCells(m.key);
      for (let i = 0; i < (m.speed || 6); i++) {
        const d = Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my));
        if (d <= 1) break;
        const s = this.tbStepToward(m, p.mx, p.my, (x, y) => {
          if (x < 0 || x > 8 || y < 0 || y > 8) return true;
          const cell = detail[y] && detail[y][x];
          if (cell && this.cellProps(cell).blocks) return true;
          if (this.tbNearestFire(x, y, 1)) return true;
          return false;
        }, danger);
        if (!s) break;
        m.mx = s.x; m.my = s.y;
      }
    },

    // DELEGATE's announced line: true-angle rasterization (not the 8-direction
    // snap), truncated to the charge length, width 2. The aim point is always
    // ON the line — the announcement is a genuine threat, and the counterplay
    // (sidestep the wide line) is always real.
    beastLineCells(mx, my, tx, ty, len, w) {
      const cells = [], seen = new Set();
      const dx = tx - mx, dy = ty - my;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist, uy = dy / dist;
      const px = -uy, py = ux; // perpendicular
      const push = (cx, cy) => {
        if (cx < 0 || cx > 8 || cy < 0 || cy > 8) return;
        const k = cx + ',' + cy;
        if (!seen.has(k)) { seen.add(k); cells.push({ cx, cy }); }
      };
      for (let i = 1; i <= len * 2; i++) {
        const t = i / 2;
        const cx = Math.round(mx + ux * t), cy = Math.round(my + uy * t);
        push(cx, cy);
        if (w > 1) {
          push(Math.round(mx + ux * t + px * 0.7), Math.round(my + uy * t + py * 0.7));
          push(Math.round(mx + ux * t - px * 0.7), Math.round(my + uy * t - py * 0.7));
        }
      }
      return cells;
    },

    // tbStepToward: gravity-aware movement. A gravity-held monster strains
    // but doesn't move — the well holds its position, not its malice.
    tbStepToward(m, tx, ty, blocked, danger) {
      if (m && m.gravityHeld > 0) return null;
      return S.combat.stepToward(m.mx, m.my, tx, ty, blocked, danger);
    },
    tbMonsterTurn(m) {
      const f = this.tbfight;
      // ROUNDS SEEN: surviving its turns teaches you its toughness.
      try {
        const me = this.ensureMonsterEntry(m.mdef.id);
        me.roundsSeen = (me.roundsSeen || 0) + 1;
        if (me.roundsSeen >= 3 && me.stage === 'encountered') me.stage = 'observed';
      } catch (e) {}
      // stunned: no move, no new attack. (Pending telegraph was canceled by the scream.)
      if (m.stunned > 0) {
        m.stunned -= 1;
        this.say(`The ${this.encTheName(m)} is still frozen from your scream.`);
        if (this.tbEndCheck()) return;
        return;
      }
      // GRAVITY HELD: the well has it. No movement — it can still act at range.
      if (m.gravityHeld > 0) {
        m.gravityHeld -= 1;
        this.say(`The ${this.encTheName(m)} strains against folded space. Held.`);
      }      // 1. pending telegraph: count down, then resolve.
      // Heavy attacks wind up over multiple rounds (you don't know exactly
      // how long — but the cue escalates and the heartbeat tells you).
      // HIGHBEAM: threat scan first — anyone too close joins the list, and
      // the deer takes its turn deliberately. Each phase reads clearly.
      const isDeer = this.deerIs(m);
      const useFifo = this.encUsesFifo(m);
      if (useFifo) this.encScanThreats(m);
      // HIGHBEAM (Steve 2026-10-05): closing in is risky EVERY turn, not just
      // while the beam fires. The antlers thrash anyone adjacent IN ADDITION
      // to whatever the deer is doing — you take damage standing next to it
      // AND the beam keeps coming. You get in, you hit, you get OUT.
      if (isDeer && m.beamPhase !== 'firing') {
        this.tbAntlerThrash(m);
        if (this.tbEndCheck()) return;
      }
      // BUNKER (speedbump): sealed in its shell. It doesn't act — it waits
      // you out. Nearly invulnerable; the answer is patience, not force.
      if (this.turtleIs(m) && (m.turtleBunker || 0) > 0) {
        m.turtleBunker -= 1;
        if (m.turtleBunker <= 0) {
          m.bunkerNoted = false;
          if (useFifo) this.encSetPhase(m, this.encPhaseFor(m, 'idle'));
          this.say('The shell unseals with a soft pop. The bad attitude is back.');
        } else {
          this.say('The boulder sits. Sealed. Waiting you out.');
        }
        this.tbRefreshTelegraphUI();
        if (this.tbEndCheck()) return;
        return;
      }
      // HUMMICE: the swarm checks itself every turn — deaths drop voices,
      // distance thins the hum.
      if (this.humiceIs(m)) this.tbHumSwarmCheck(m);
      // CROWD OVERLOAD (drone): it can't grade a crowd. More live targets
      // than crowdLimit on the queue and the evaluation stalls out.
      // Bring friends. (The deer is unaffected.)
      if (useFifo && this.droneIs(m)) {
        const limit = ((this.encConfig(m) || {}).crowdLimit) || 2;
        const live = this.encThreatQueue(m).filter(k => {
          const t = this.tbFighter(k); return t && t.alive && !t.fled;
        });
        if (live.length > limit) {
          m.telegraph = null;
          this.encSetPhase(m, 'recalc');
          this.say('📊 "TOO MANY SUBJECTS. EVALUATION PAUSED. RECALIBRATING." The drone backs off, overwhelmed by the crowd.');
          this.audioEvent('droneRecalc');
          this.tbRefreshTelegraphUI();
          if (this.tbEndCheck()) return;
          return;
        }
      }
      // CROWD DEFLATE (horn): it can't encourage a crowd — it only does
      // one-on-one. The windup fizzles and it loses its nerve for two turns.
      if (useFifo && this.hornIs(m)) {
        const limit = ((this.encConfig(m) || {}).crowdLimit) || 2;
        const live = this.encThreatQueue(m).filter(k => {
          const t = this.tbFighter(k); return t && t.alive && !t.fled;
        });
        if (live.length > limit) {
          m.telegraph = null;
          this.encSetPhase(m, 'deflate');
          m.hypeCooldown = 2;
          this.say('📣 "YOU\'RE ALL WINNERS, I\'M JUST—" It deflates. It only does one-on-one.');
          this.audioEvent('hypeDeflate');
          this.tbRefreshTelegraphUI();
          if (this.tbEndCheck()) return;
          return;
        }
      }
      // FIRE SCATTERS THE SWARM: it follows you — lead it into hazards. A
      // burning cell within 2 and it loses the shot entirely.
      if (this.swarmIs(m)) {
        const fire = this.tbNearestFire(m.mx, m.my, 2);
        if (fire) {
          m.telegraph = null;
          this.encSetPhase(m, 'scatter');
          this.say('The shutters stutter. Smoke — no, FIRE — in the lenses. "LOSING THE SHOT! LOSING THE—" It breaks off.');
          this.audioEvent('swarmScatter');
          const detail = this.genDetail(this.map.px, this.map.py);
          for (let i = 0; i < 2; i++) {
            const s = this.tbStepToward(m, m.mx * 2 - fire.x, m.my * 2 - fire.y,
              (x, y) => x < 0 || x > 8 || y < 0 || y > 8 || (detail[y] && detail[y][x] && this.cellProps(detail[y][x]).blocks));
            if (!s) break;
            m.mx = s.x; m.my = s.y;
          }
          this.tbRefreshTelegraphUI();
          if (this.tbEndCheck()) return;
          return;
        }
      }
      if (m.telegraph) {
        const tg = m.telegraph;
        const sweepBeam = !!((tg.pattern || {}).sweep && ((tg.pattern || {}).type === 'beam' || (tg.pattern || {}).type === 'line'));
        // LIVE FIRE: the beam is up and sweeping — but the sweep is ACTION-LOCKED
        // (Steve): it ticks on PLAYER actions via tbBeamActionTick, not here.
        // The deer stands frozen, committed — no move, no new attack. Its turn
        // is just the beam holding its line while it waits for you to move.
        if (sweepBeam && tg.firing > 0) {
          this.tbRefreshTelegraphUI();
          if (this.tbEndCheck()) return;
          return;
        }
        // BATCH 3 (the uncanny): bespoke windup behavior, same countdown.
        // BRIGHT IDEA: the brightening escalates while it gathers — the two
        // beats from glow to boom read clearly. It never moves once set.
        if (this.biIs(m) && m.beamPhase === 'brighten' && tg.kind === 'squares') {
          this.say(tg.turnsLeft > 1
            ? 'The glow intensifies — the air tastes like copper. Brighter.'
            : 'BRIGHTER. The light is wrong now, too bright to look at. It\'s about to break loose.');
          this.audioEvent('eurekaTick', { urgency: tg.turnsLeft });
        }
        // MEMORY PROJECTOR: the spell pulls while the beam gathers. A still
        // target drifts closer; a moving one breaks the picture.
        if (this.mpIs(m) && m.beamPhase === 'spell' && tg.kind === 'squares') {
          if (this.mpSpellPull(m, tg)) {
            this.tbRefreshTelegraphUI();
            if (this.tbEndCheck()) return;
            return;
          }
        }
        tg.turnsLeft -= 1;
        if (tg.turnsLeft > 0) {
          // still winding up — holds position, committed. No move, no new attack.
          // Phase mapping is per-config (batch 1's phaseMap); monsters without
          // one keep their own bespoke phase control — only the deer is forced.
          if (useFifo) {
            const pcfg = this.encConfig(m) || {};
            if (this.deerIs(m) || (pcfg.phaseMap && pcfg.phaseMap.windup)) this.encSetPhase(m, this.encPhaseFor(m, 'windup'));
          }
          if (isDeer) {
            if (!tg.chargeNarrated) {
              tg.chargeNarrated = true;
              this.say('The light behind its eyes swells to a painful glare. The whine climbs past hearing. It is done aiming — now it is only waiting to loose.');
              this.audioEvent('deerAggro');
            }
          } else if (this.stagIs(m)) {
            // CONFRONT: the mirror beat, second breath. It sees you seeing yourself.
            if (!tg.confrontNarrated) {
              tg.confrontNarrated = true;
              this.say('The reflection sharpens. It sees you seeing yourself — tired, dirty, scared — and it lowers its head. The mirror becomes a weapon.');
              this.audioEvent('stagMirror');
            }
          } else if (this.heronIs(m)) {
            // UNFOLD, second breath: impossibly tall, and the air goes staticky.
            if (!tg.unfoldNarrated) {
              tg.unfoldNarrated = true;
              this.say('It unfolds further — impossibly tall. The air goes staticky; the creek goes flat. It has decided.');
              this.audioEvent('heronStatic');
            }
          }
          // BATCH 4: the countdown is SPOKEN. The drone tells you exactly
          // what it's doing — the counterplay is believing it.
          if (this.droneIs(m)) {
            if (useFifo) this.encSetPhase(m, 'countdown');
            const word = tg.turnsLeft === 2 ? 'TWO.' : tg.turnsLeft === 1 ? 'ONE.' : '…';
            this.say(`📊 "${word}" DODGE EFFICIENCY: ${this.droneEff(m)}%. The projected line brightens.`);
            this.audioEvent('droneCount', { n: tg.turnsLeft });
          }
          // the swarm never stops filming — it closes in even while the
          // flashes build. Keep moving.
          if (this.swarmIs(m)) {
            if (useFifo) this.encSetPhase(m, 'build');
            this.swarmCreep(m);
            if (tg.turnsLeft === 1) this.say('📸 "ENGAGEMENT CRITICAL!" The shutters are a strobe now. COVER YOUR EYES.');
            else this.say('The shutters quicken. The flashes are building…');
            this.audioEvent('swarmShutters', { urgency: tg.turnsLeft });
          }
          // the pep talk escalates — each beat a louder promise.
          if (this.hornIs(m)) {
            if (useFifo) this.encSetPhase(m, 'encourage');
            const shout = tg.turnsLeft === 2 ? "YOU'RE A WINNER!" : tg.turnsLeft === 1 ? 'NEVER GIVE UP!' : "YOU'VE GOT THIS!";
            this.say(`📣 "${shout}" It's swelling — the air ripples. GET CLEAR.`);
            this.audioEvent('hypeEncourage', { n: tg.turnsLeft });
          }
          this.tbRefreshTelegraphUI();
          this.audioEvent('telegraph', { urgency: tg.turnsLeft, windupTick: true });
          return;
        }
        // IGNITE: a sweeping beam doesn't resolve instantly — it goes live and
        // sweeps for fireTurns. Everything else resolves as before.
        if (sweepBeam) {
          const tgt0 = (useFifo && this.encCurrentTarget(m)) || this.tbFighter('p');
          tg.aim = tg.aim || { x: tgt0 ? tgt0.mx : m.mx, y: tgt0 ? tgt0.my : m.my };
          tg.aimKey = tg.aimKey || (tgt0 ? tgt0.key : 'p');
          tg.firing = (tg.pattern || {}).fireTurns || 2;
          m.hasFired = true; // the light is spent — after this, it's just meat that shines
          if (useFifo) this.encSetPhase(m, 'firing');
          // IGNITION BEAT (Steve 2026-10-05): the beam lances out but doesn't
          // burn on the ignition tick — it's the "MOVE NOW" warning. The beam
          // starts where it was aiming (declare lock) and sweeps toward you;
          // damage begins on the next tick. No more "shot immediately at me."
          tg.ignition = true;
          this.say(`💥 ${tg.attackName}! A ray of light lances FROM ITS EYES — and it's swinging toward you. MOVE.`);
          this.audioEvent('impact', { beam: (tg.pattern || {}).type === 'beam', highbeam: /highbeam/i.test(m.name || '') });
          this.tbBeamSweepTick(m, tg);
          tg.ignition = false;
          tg.firing -= 1;
          if (tg.firing <= 0) this.tbBeamEndFiring(m, tg);
          this.tbRefreshTelegraphUI();
          if (this.tbEndCheck()) return;
          return;
        }
        // RESOLVE. A BEAM or LINE locks its aim when declared — it was aiming
        // at you during the windup, then it fires where it aimed. Sidestepping
        // out of the lane, or breaking line of sight, dodges it. (Re-aiming at
        // fire time made MOVE useless and the freeze meaningless.)
        // Charges still track: they run you down. That's the point of a charge —
        // unless the config commits them. The boar and the mirror stag lock their
        // lane at declare: sidestepping is the whole game.
        const rcfg = this.encConfig(m) || {};
        // MIRROR STAG: break line of sight during the mirror beat and it loses
        // you. The charge dies unspent — that's the counterplay, and it's earned.
        if (this.stagIs(m) && tg.kind === 'squares') {
          const lost = this.tbFighter(tg.aimKey);
          if (!lost || !lost.alive || !this.canSee(m.mx, m.my, lost.mx, lost.my)) {
            m.telegraph = null;
            if (useFifo) this.encSetPhase(m, this.encPhaseFor(m, 'idle'));
            this.say('The mirror sweeps the treeline — empty. It lost you. The charge dies unspent.');
            this.audioEvent('stagConfused');
            this.tbRefreshTelegraphUI();
            if (this.tbEndCheck()) return;
            return;
          }
        }
        // MONSTER BATCH 2: the resolve has a phase, too — the flash, the chorus.
        if (useFifo) {
          if (this.mothIs(m)) this.encSetPhase(m, 'flash');
          else if (this.toadIs(m)) this.encSetPhase(m, 'chorus');
        }
        m.telegraph = null;
        if (tg.kind === 'squares') {
          const ptype = (tg.pattern || {}).type;
          // DELEGATE: the line was ANNOUNCED — it charges exactly where it
          // said it would. No re-aiming at fire time. That's the deal.
          // (The stag's commitCharge is the same idea via config.)
          if (this.beastIs(m)) {
            this.say('It charges the announced line — exactly where it said it would. Attendance was mandatory.');
          } else if (ptype !== 'beam' && ptype !== 'line' && !rcfg.commitCharge) {
            const foe = S.combat.nearestEnemy(f.fighters, m);
            if (foe) tg.cells = S.combat.patternCells(tg.pattern, m.mx, m.my, foe.f.mx, foe.f.my);
          }
          if (rcfg.bulldoze && ptype === 'charge') tg.cells = this.tbBulldozeCells(tg.cells);
        }
        this.audioEvent('impact');
        if (rcfg.resolveAudio) this.audioEvent(rcfg.resolveAudio);
        let anyoneHit = false;
        if (tg.kind === 'direct') {
          const t = this.tbFighter(tg.targetKey);
          if (t && t.alive) {
            let dmg = S.combat.roll(tg.dmg), missed = false;
            if (m.blind > 0 && Math.random() < 0.5) { missed = true; }
            if (missed) this.say(`${this.encShortLabel(m) || m.name}'s ${tg.attackName} swipes at sand-ghosts. Missed. (pocket_sand)`);
            else {
              this.say(`💥 ${this.encShortLabel(m) || m.name}'s ${tg.attackName} finds ${t.kind === 'player' ? 'you' : t.name} — no dodging it.`);
              this.tbDamage(t.key, dmg, (this.encShortLabel(m) || m.name) + "'s " + tg.attackName);
            }
          }
        } else {
          // COVER WORKS: if the lane was fully blocked at declare time, the
          // beam dies against the trees. That's not a miss. That's the plan.
          if (!tg.cells.length && ((tg.pattern || {}).type === 'beam' || (tg.pattern || {}).type === 'line')) {
            this.say(`💥 ${tg.attackName}! The light shreds leaves and dies against the trees. Cover works. Remember that.`);
            this.audioEvent('beamBlocked');
          } else {
          this.say(`💥 ${tg.attackName}!`);}
          // MOTH: the flash only goes forward — the facing locked at the fold
          // decides who it hits. Behind it, you're safe.
          let resCells = tg.cells;
          if (this.mothIs(m)) resCells = this.tbMothArcCells(m, tg.cells);
          const hitKeys = new Set(resCells.map(c => c.cx + ',' + c.cy));
          // HUMMICE: the hum stacks while you stand in it — worse every round.
          // ROUND-GATED (Steve 2026-10-04): the stack builds once per round,
          // not once per mouse, or four attackers max it before you can blink
          // and "keep moving" can never work. Standing still: +1/round to a
          // wall of sound. Moving/killing: the decay and the choir-stutter
          // answer it.
          let humMult = 1;
          if (this.humiceIs(m)) {
            if (f.humRiseRound !== f.round) {
              f.humRiseRound = f.round;
              f.humStacks = Math.min(4, (f.humStacks || 0) + 1);
              const humWords = ['', 'a low thrum', 'your teeth aching', 'your bones buzzing', 'a solid wall of sound'];
              // INFO DISCIPLINE (Steve 2026-10-05): sensation always, numbers
              // only when earned. First-timers feel it getting worse; veterans
              // get the count.
              const hst = (this.ensureMonsterEntry('hummice') || {}).stage;
              const hknown = hst === 'observed' || hst === 'slain';
              this.say(`The hum stacks — ${humWords[f.humStacks]}.${hknown ? ` (hum ×${f.humStacks})` : ''}`);
            }
            humMult = 1 + 0.25 * (f.humStacks || 0);
            this.audioEvent('humRise', { stacks: f.humStacks || 0 });
            // HUMMICE: the hum ebbs after it lands — the mice need a breath
            // before the next swell. That's the player's window.
            m.encCooldown = Math.max(m.encCooldown || 0, 1);
          }
          let playerHit = false;
          const hitFighters = [];
          for (const o of f.fighters) {
            if (!o.alive || o.fled || o.key === m.key) continue;
            if (!S.combat.isFoe(m, o)) continue; // packmates aren't targets
            if (hitKeys.has(o.mx + ',' + o.my)) {
              if (m.blind > 0 && Math.random() < 0.5) {
                this.say(`${m.name} lashes at sand-ghosts near ${o.kind === 'player' ? 'you' : o.name}. Missed. (pocket_sand)`);
                continue;
              }
              if (o.kind === 'player') playerHit = true;
              anyoneHit = true;
              this.tbDamage(o.key, Math.round(S.combat.roll(tg.dmg) * humMult), (this.encShortLabel(m) || m.name) + "'s " + tg.attackName);
              hitFighters.push(o);
              if (f.over) break;
            }
          }
          // MOTH: the flash blinds for a round — spots in your vision.
          if (this.mothIs(m)) {
            this.audioEvent('mothFlash');
            for (const o of hitFighters) {
              if (o.kind === 'player' && o.alive) {
                o.blindTurns = 1;
                this.say('Spots bloom across your vision — the flash is still in your eyes. (blinded 1 round)');
              }
            }
          }
          // DODGED: you were in the path when it was declared, and you're not
          // there now. That's not luck. That's reading the monster.
          const p1 = this.tbFighter('p');
          if (tg.threatenedPlayer && !playerHit && p1 && p1.alive) {
            this.say('You\'re not where it landed. Clean dodge.');
            this.tbStyle(15, `dodged the ${tg.attackName}!`);
          }
          if ((m.mdef.attack.pattern || {}).type === 'charge') {
            const last = tg.cells[tg.cells.length - 1];
            if (last && !this.tbBlocked(last.cx, last.cy)) { m.mx = last.cx; m.my = last.cy; }
          }
          // BULLDOZER: a missed charge ends winded — flanks soft, head elsewhere.
          // Next turn it tramples whatever is close. You dodged the lane; respect the aftermath.
          if (this.boarIs(m) && (m.mdef.attack.pattern || {}).type === 'charge' && !anyoneHit) {
            m.boarTrample = true;
            m.boarWinded = 2;
            if (useFifo) this.encSetPhase(m, 'spent');
            this.say('It thunders past — and finds only air. It stands at the end of its lane, sides heaving. Flanks soft. But it is turning, and it is angry.');
          }
          // WHITE NOISE: after the strike it is somewhere else. You didn't see it move.
          if (this.heronIs(m)) {
            if (Math.random() < 0.5) this.tbHeronDrift(m);
            else if (useFifo) this.encSetPhase(m, this.encPhaseFor(m, 'idle'));
          }
          // BATCH 4 post-resolve bookkeeping: the joke has consequences.
          if (this.droneIs(m)) {
            if (useFifo) this.encSetPhase(m, 'correct');
            if (tg.threatenedPlayer) {
              const eff = this.droneScore(m, !playerHit);
              this.say(`📊 DODGE EFFICIENCY: ${eff}% — ${!playerHit ? 'CLEAN DODGE. LOGGED.' : 'HIT TAKEN. LOGGED.'} ${eff >= 60 ? 'ABOVE TARGET. IT NOTICES.' : 'BELOW TARGET. CORRECTIVE ACTION SCHEDULED.'}`);
            }
            this.audioEvent('droneCorrect');
            m.droneRecalc = 1; // it re-runs the numbers before grading again
          }
          if (this.swarmIs(m)) {
            if (useFifo) this.encSetPhase(m, 'flash');
            const anyHit = f.fighters.some(o => o.alive && o.key !== m.key && S.combat.isFoe(m, o) && hitKeys.has(o.mx + ',' + o.my));
            if (!anyHit) {
              m.escalation = (m.escalation || 0) + 1;
              this.say('📸 "ENGAGEMENT DROPPING! ESCALATING!" The swarm got no reaction — the next flash will hit harder.');
              this.audioEvent('swarmEscalate');
            } else if (m.escalation) {
              m.escalation = 0;
              this.say('📸 "WE HAVE ENGAGEMENT!" The swarm got its reaction. For now.');
            }
            this.audioEvent('swarmFlash');
          }
          if (this.hornIs(m)) {
            if (useFifo) this.encSetPhase(m, 'detonate');
            this.audioEvent('hypeDetonate');
            m.hypeCooldown = 1; // spent. The encouragement took everything.
          }
          if (this.beastIs(m)) {
            if (useFifo) this.encSetPhase(m, 'charge');
            this.audioEvent('delegateCharge');
            m.circled = false; // the next charge gets circled first, too. Always.
            m.beastDebrief = 1;
          }
        }
        if (m.blind > 0) m.blind -= 1;
        // BELLTOAD: the resolving croak pulls the pack in — then every
        // throat goes spent. MOTH: the flash leaves it spent for a turn.
        if (this.toadIs(m)) this.tbChorusJoin(m, tg);
        else if (this.mothIs(m)) {
          m.encCooldown = 1; m.startled = false;
          if (useFifo) this.encSetPhase(m, 'recover');
          this.say('Its wings hang open and dull — the light spent. For a moment, it\'s just a moth.');
        }
        this.tbLearnPattern(m);
        this.tbRefreshTelegraphUI();
        if (this.tbEndCheck()) return;
        // BATCH 1 RHYTHM: the charge/strike lands — and the turn ENDS there.
        // Each beat gets its own turn (boar: the trample; heron: stillness;
        // stag: the mirror again). No resolve-and-redeclare in a single turn.
        if (this.boarIs(m) || this.stagIs(m) || this.heronIs(m)) return;
        // MONSTER BATCH 2: the spent phase must read for a full turn — a
        // post-flash moth, post-chorus toad, or post-hum mouse doesn't act twice.
        if ((this.mothIs(m) || this.toadIs(m) || this.humiceIs(m)) && (m.encCooldown || 0) > 0) return;
      }
      if (!m.alive || f.over) return;
      // 2. hesitate (fear_aura): it doesn't act this turn
      if (m.hesitate > 0) {
        m.hesitate -= 1;
        this.say(`The ${this.encTheName(m)} hesitates. Something about you is wrong. (fear_aura)`);
        if (this.tbEndCheck()) return;
        return;
      }
      // 3. flee check (codex: bulldozer retreats <25%, deer bolts <50%, etc.)
      // A broken pack is a frightened pack — broken wolves bolt easier.
      const fleeAt = (m.mdef.fleeAt || 0) + (this.wolfIs(m) && m.wolfBroken ? 0.2 : 0);
      if (fleeAt > 0 && m.hp / m.maxHp < fleeAt && Math.random() < 0.7) {
        m.fled = true;
        this.say(`The ${this.encTheName(m)} breaks and runs!`);
        this.tbEndCheck();
        return;
      }
      // 4. act by pattern
      let foe = S.combat.nearestEnemy(f.fighters, m);
      if (!foe) return;
      const pat = (m.mdef.attack && m.mdef.attack.pattern) || { type: 'burst', radius: 1 };
      // TRAMPLE (boar): a missed charge ends here — grinding hooves on
      // whatever is close. This is the price of the dodge.
      if (this.boarIs(m) && m.boarTrample) {
        m.boarTrample = false;
        if ((m.boarWinded || 0) > 0) m.boarWinded -= 1;
        this.tbBoarTrample(m);
        this.tbRefreshTelegraphUI();
        this.tbEndCheck();
        return;
      }
      if (this.boarIs(m) && (m.boarWinded || 0) > 0) m.boarWinded -= 1;
      // BEAM COOLDOWN: after a Discharge the deer is spent — the light is
      // embers, not a weapon. It CANNOT move while recharging; it stands and
      // breathes. But crowding it is still a mistake: it paws at anyone
      // adjacent. The recharge is a window at spear range (2) — one step out
      // of reach, where it can't touch you — not a free pass up close.
      if (pat.sweep && (m.beamCooldown || 0) > 0) {
        m.beamCooldown -= 1;
        if (useFifo) this.encSetPhase(m, 'cooldown');
        const bd = Math.max(Math.abs(foe.f.mx - m.mx), Math.abs(foe.f.my - m.my));
        if (bd <= 1) {
          if (this.tbRechargePaw(m) && isDeer) this.audioEvent('deerSnort');
        } else if (m.beamCooldown <= 0) {
          if (useFifo) this.encSetPhase(m, 'stalk');
          this.say(`The ${this.encTheName(m)} shakes its head — the light behind its eyes rekindles.`);
        }
        // otherwise it just breathes. Stillness is the tell.
        this.tbRefreshTelegraphUI();
        this.tbEndCheck();
        return;
      }
      // MONSTER BATCH 2: spent turns (post-flash moth, post-chorus toad,
      // post-hum mouse, shout-startled pack). They hold position — the window is real.
      if ((m.encCooldown || 0) > 0) {
        m.encCooldown -= 1;
        if (this.mothIs(m)) this.say('The moth shivers its wings — dull, lightless. Gathering itself again.');
        else if (this.toadIs(m)) this.say(m.startled ? 'It hunkers low, throat fluttering — startled into silence.' : 'Its throat hangs slack. The chorus is spent — for a moment.');
        else if (this.humiceIs(m)) this.say('The hum ebbs for a breath — the mice resettle, throats fluttering.');
        m.startled = false;
        if (m.encCooldown <= 0 && useFifo) this.encSetPhase(m, 'stalk');
        this.tbRefreshTelegraphUI();
        this.tbEndCheck();
        return;
      }
      // LOCKPICK: steal-first bespoke turn. CATFISH: the lure. The lockpick
      // returns true when its turn is fully handled; when cornered it falls
      // through to the generic engine (it fights for real now).
      if (this.lockpickIs(m) && this.tbLockpickTurn(m)) { this.tbRefreshTelegraphUI(); this.tbEndCheck(); return; }
      if (this.catfishIs(m)) { this.tbCatfishTurn(m); this.tbRefreshTelegraphUI(); this.tbEndCheck(); return; }
      // HIGHBEAM: the deer doesn't chase the nearest — it works the list,
      // first in first out. Movement, declaration, and aim all follow it.
      if (useFifo) {
        const dt = this.encCurrentTarget(m);
        if (dt) foe = { f: dt, d: Math.max(Math.abs(dt.mx - m.mx), Math.abs(dt.my - m.my)) };
      }
      // BROKEN PACK: coordination's gone — a broken wolf just goes for what's close.
      if (this.wolfIs(m) && m.wolfBroken) {
        const near = S.combat.nearestEnemy(f.fighters, m);
        if (near) foe = near;
      }
      // BATCH 4 breather beats: post-attack recovery with the monster's own
      // name on it. The breather spends the whole turn.
      if (this.tbFifoBreather(m)) return;
      // DELEGATE: it always circles first. One full loop around the target,
      // announcing the charge — then, and only then, the line.
      if (this.beastIs(m) && !m.circled && foe && foe.d <= 5) {
        this.beastCircle(m, foe.f);
        this.tbRefreshTelegraphUI();
        if (this.tbEndCheck()) return;
        return;
      }
      const blocked = (x, y) => this.tbBlocked(x, y) && !(x === m.mx && y === m.my);
      const danger = this.tbDangerCells(m.key);
      const atk = m.mdef.attack;
      // ============ BATCH 3 (the uncanny): bespoke encounters ============
      // Each branch is one monster's personality — its phases, its tell, its
      // counterplay. The generic engine still owns telegraph countdown,
      // resolution, the threat queue, and codex gating (see the declare
      // helpers + pending-section hooks above). FIFO target: the list, not
      // the nearest — anyone can be the one it wants.
      const fifoFoe = () => {
        if (!useFifo) return null;
        const dt = this.encCurrentTarget(m);
        return dt ? { f: dt, d: Math.max(Math.abs(dt.mx - m.mx), Math.abs(dt.my - m.my)) } : null;
      };

      // ---- VOICE MIMIC ("Static"): THE LURE ----
      // call → approach → reveal. The horror is the choice: the crying sounds
      // like someone you know, and walking toward it feeds it (lure+). Hold
      // your ground or back off and the lure starves — two turns of resisting
      // breaks the act (reveal): the fight goes honest, and exposed, it takes
      // hits badly. Distress Call is direct/range 3: once declared, moving
      // won't help — the counterplay is never letting it lock on your terms.
      if (this.vmIs(m)) {
        const ff = fifoFoe(); if (ff) foe = ff;
        const t = foe.f;
        const vname = this.vmVoiceName(m, t);
        // vdisp: "a person, maybe 50s" / "Maya" / "your own voice" — sits in a sentence.
        const vdisp = (vname === 'you') ? 'your own voice' : vname;
        const vneg = (vname === 'you') ? 'you' : vname;
        if (m.vmLure === undefined) { m.vmLure = 0; m.vmResist = 0; this.encSetPhase(m, 'call'); }
        // post-resolve: the call falters — then starts again, elsewhere.
        // (A revealed mimic stays revealed: the act is broken for good.)
        if (m.vmDeclared && !m.telegraph) {
          m.vmDeclared = false;
          if (m.beamPhase === 'reveal') {
            this.say('The static crackles, furious. No voice left. Just the radio — and it wants you dead.');
          } else {
            m.vmLure = 1;
            this.encSetPhase(m, 'call');
            this.say('The voice falters... then starts again, somewhere else in the dark. It is still hungry.');
          }
        }
        let vmPhase = m.beamPhase;
        // the lure: did YOU move toward the crying? The baseline is the
        // post-move distance from last turn, so the mimic's own creep
        // doesn't count as you approaching — only your feet do.
        const tDist = Math.max(Math.abs(t.mx - m.mx), Math.abs(t.my - m.my));
        if (m.vmTKey !== t.key || m.vmLastDist === undefined) { m.vmTKey = t.key; }
        else if (tDist < m.vmLastDist) {
          m.vmLure = Math.min(3, (m.vmLure || 0) + 1); m.vmResist = 0;
          this.say('The crying sharpens — clearer, closer. It knows you\'re coming.');
          this.audioEvent('staticCry', { close: tDist <= 3 });
        } else {
          m.vmLure = Math.max(0, (m.vmLure || 0) - 1);
          if (vmPhase !== 'reveal') m.vmResist = (m.vmResist || 0) + 1;
        }
        if (vmPhase === 'call' && m.vmLure >= 2) {
          this.encSetPhase(m, 'approach'); vmPhase = 'approach';
          this.say(`The static resolves — mid-sob — into a voice like ${vdisp}. "PLEASE. Don't leave me out here." It's coming closer now.`);
          this.audioEvent('staticCry', { close: true });
        } else if (vmPhase !== 'reveal' && (m.vmResist || 0) >= 2) {
          this.encSetPhase(m, 'reveal'); vmPhase = 'reveal'; m.vmResist = 0;
          this.say('You don\'t move. The crying stutters... fragments... stops. Silence — then a small, furious crackle of static. It\'s a radio. It was always a radio.');
          this.audioEvent('staticBreak');
        }
        // movement: it only closes in while the lure is working (you're
        // coming, so it comes to meet you) or the act is broken. A resisted
        // lure holds its ground, crying — it can't make you come to it.
        const stepN = vmPhase === 'call' ? ((m.vmLure || 0) > 0 ? 1 : 0) : m.speed;
        for (let i = 0; i < stepN; i++) {
          const d = Math.max(Math.abs(t.mx - m.mx), Math.abs(t.my - m.my));
          if (d <= (pat.range || 3)) break;
          const stp = this.tbStepToward(m, t.mx, t.my, blocked, danger);
          if (!stp) break;
          m.mx = stp.x; m.my = stp.y;
        }
        const dNow = Math.max(Math.abs(t.mx - m.mx), Math.abs(t.my - m.my));
        m.vmLastDist = dNow; // post-move baseline for next turn's lure check
        if (dNow <= (pat.range || 3) && !m.telegraph) {
          m.vmDeclared = true;
          this.encDeclareDirect(m, t, vmPhase === 'reveal'
            ? `The radio SCREAMS — no voice left, just noise and fury. ${atk.name} incoming. No dodging it.`
            : `A voice you know is crying your name in the dark. It sounds exactly like ${vdisp}. It is not ${vneg}. ${atk.name} is coming — and moving won't help once it has your voice.`);
        } else if (!m.telegraph) {
          if (vmPhase === 'call') {
            const cries = [
              `"Please... is anyone there?" sobs the dark, in a voice like ${vdisp}.`,
              `Crying, somewhere in the trees. It sounds like ${vdisp}. ${(vname === 'you') ? 'You are' : 'They are'} supposed to be safe at the haven.`,
            ];
            this.say(cries[Math.floor(Math.random() * cries.length)]);
            this.audioEvent('staticCry', {});
          }
          else if (vmPhase === 'approach') this.say(`"COME BACK," sobs the dark, in a voice like ${vdisp}. "Don't leave me!"`);
          else this.say('The radio crackles, furious, advancing on dead air.');
        }
        this.tbRefreshTelegraphUI();
        this.tbEndCheck();
        return;
      }

      // ---- BRIGHT IDEA ("Inspiration"): THE BRIGHTENING ----
      // settle → brighten → bloom → ember. It never moves once set: it drifts
      // until someone is close, then SETS and brightens over 2 beats (the
      // escalation hook narrates them). Back off when it brightens — the
      // burst is radius 2 and the hardest-hitting in either wave. After the
      // bloom it's a dying ember for 2 turns: harmless. Daylight disperses it.
      if (this.biIs(m)) {
        const ff = fifoFoe(); if (ff) foe = ff;
        if (!m.beamPhase || m.beamPhase === 'stalk') this.encSetPhase(m, 'settle');
        // post-detonation: the bloom resolved → ember
        if (m.beamPhase === 'brighten' && !m.telegraph && m.biDeclared) {
          m.biDeclared = false;
          this.encSetPhase(m, 'ember'); m.biEmber = 2;
          this.say('The light gutters down to a dying ember. It\'s spent — dim, flickering, harmless. For now.');
          this.audioEvent('eurekaSpent');
        }
        const biPhase = m.beamPhase;
        if (biPhase === 'ember') {
          m.biEmber = (m.biEmber || 2) - 1;
          if (m.biEmber <= 0) {
            this.encSetPhase(m, 'settle');
            this.say('The ember steadies. Somewhere inside the glass, an idea is forming again.');
          } else this.say('The ember flickers, dim. It can\'t brighten yet.');
          this.tbRefreshTelegraphUI(); this.tbEndCheck(); return;
        }
        if (biPhase === 'brighten') {
          // windup runs in the generic pending section (escalation hook
          // above). It holds position — never moves once set.
          this.tbRefreshTelegraphUI(); this.tbEndCheck(); return;
        }
        // settle
        let night = true;
        try { night = this.isNight ? this.isNight() : true; } catch (e) {}
        if (!night) {
          m.fled = true;
          this.say('Dawn touches it and the light gutters, thins, goes out. It was never meant for daytime.');
          this.audioEvent('eurekaDisperse');
          this.tbEndCheck(); return;
        }
        if (foe.d <= 4 && !m.telegraph) {
          // SET: it stops moving — permanently — and starts to brighten.
          this.encSetPhase(m, 'brighten'); m.biDeclared = true;
          const cells = S.combat.patternCells(pat, m.mx, m.my, foe.f.mx, foe.f.my);
          const p0 = this.tbFighter('p');
          m.telegraph = { kind: 'squares', cells, dmg: atk.damage,
            attackName: atk.name, pattern: pat, turnsLeft: pat.windup || 2,
            threatenedPlayer: !!(p0 && p0.alive && cells.some(c => c.cx === p0.mx && c.cy === p0.my)),
            aim: null, dir: null, aimKey: null, angle: null, firing: 0, cueText: null };
          try {
            const me = this.ensureMonsterEntry(m.mdef.id);
            if (atk.name && !me.attacksSeen.includes(atk.name)) {
              me.attacksSeen.push(atk.name);
              if (me.stage === 'encountered') me.stage = 'observed';
            }
          } catch (e) {}
          const known = this.encTelegraphKnown(m);
          this.sayTelegraphOnce(m, known
            ? '⚠ It\'s brightening. Two beats from glow to boom — BACK OFF. Radius 2.'
            : '⚠ ' + (atk.telegraph || 'It brightens.'));
          this.audioEvent('telegraph', { urgency: m.telegraph.turnsLeft, pattern: 'burst' });
          this.audioEvent('eurekaCharge');
        } else if (!m.telegraph) {
          // not set yet: drift toward the nearest warmth, slow
          if (foe.d > 4) {
            const stp = this.tbStepToward(m, foe.f.mx, foe.f.my, blocked, danger);
            if (stp) { m.mx = stp.x; m.my = stp.y; }
          }
          this.say('A light in the dark, drifting closer. Beautiful. It wasn\'t there yesterday.');
          this.audioEvent('eurekaDrift');
        }
        this.tbRefreshTelegraphUI(); this.tbEndCheck(); return;
      }

      // ---- MEMORY PROJECTOR ("Nostalgia"): THE SPELL ----
      // watch → spell → static. It shows you home; while the beam gathers
      // along your line of gaze, the light PULLS a still target closer (the
      // spell-pull hook). Keep moving — 2+ tiles in a turn breaks the spell
      // outright. The beam locks where you were: movement is the dodge.
      if (this.mpIs(m)) {
        const ff = fifoFoe(); if (ff) foe = ff;
        if (!m.beamPhase || m.beamPhase === 'stalk') { this.encSetPhase(m, 'watch'); m.mpWatch = 2; }
        // post-resolve: the reel fired → static
        if (m.beamPhase === 'spell' && !m.telegraph && m.mpDeclared) {
          m.mpDeclared = false;
          this.encSetPhase(m, 'static'); m.mpStatic = 1;
          this.say('The screen collapses to gray static, hissing. It\'s confused — the picture won\'t come back yet.');
          this.audioEvent('projectorStatic');
        }
        const mpPhase = m.beamPhase;
        if (mpPhase === 'static') {
          m.mpStatic = (m.mpStatic || 1) - 1;
          if (m.mpStatic <= 0) {
            this.encSetPhase(m, 'watch'); m.mpWatch = 2;
            this.say('The static resolves. Shapes flicker at the edge of the light. It\'s watching again.');
          } else this.say('Gray static. It can\'t hold a picture right now.');
          this.tbRefreshTelegraphUI(); this.tbEndCheck(); return;
        }
        if (mpPhase === 'spell') {
          // the beam gathers in the generic pending section (spell-pull hook
          // above). The screen is set — it holds position.
          this.tbRefreshTelegraphUI(); this.tbEndCheck(); return;
        }
        // watch: curious. It watches first — that's your window to leave.
        m.mpWatch = (m.mpWatch === undefined ? 2 : m.mpWatch) - 1;
        if (m.mpWatch <= 0 && !m.telegraph) {
          this.encSetPhase(m, 'spell'); m.mpDeclared = true;
          const t = foe.f;
          m.mpTx = t.mx; m.mpTy = t.my; // spell baseline: did you move since?
          const known = this.encTelegraphKnown(m);
          this.encDeclareBeam(m, foe, known
            ? 'It\'s showing you home to hold you still. The beam runs along your line of gaze — MOVE. Keep moving and the picture can\'t hold.'
            : atk.telegraph);
          this.audioEvent('projectorHum', { spell: true });
        } else {
          const watchLines = [
            'The light flickers. Shapes resolve. Is that... is that home?',
            'Somewhere in the light: a kitchen. A laugh you haven\'t heard in years. You shouldn\'t look. You look.',
          ];
          this.say(watchLines[Math.floor(Math.random() * watchLines.length)]);
          this.audioEvent('projectorHum', {});
        }
        this.tbRefreshTelegraphUI(); this.tbEndCheck(); return;
      }

      // ---- SERVICE MIMIC ("Customer Service"): THE WATCH ----
      // watching → dialing → hold. No telegraph on the rush — that's the
      // point. But it watches first (2-3 turns of escalating politeness):
      // that's your window — leave, or get fire near you (it won't dial
      // through firelight). It only rushes once per approach; after the rush
      // it goes on hold and resets instead of chasing.
      if (this.smIs(m)) {
        const ff = fifoFoe(); if (ff) foe = ff;
        if (!m.beamPhase || m.beamPhase === 'stalk') { this.encSetPhase(m, 'watching'); m.smWatch = 2 + Math.floor(Math.random() * 2); }
        const smPhase = m.beamPhase;
        let nearFire = false;
        try { nearFire = this.scholarNearCell ? !!this.scholarNearCell('fire', 3) : false; } catch (e) {}
        if (smPhase === 'hold') {
          m.smHold = (m.smHold === undefined ? 2 : m.smHold) - 1;
          if (m.smHold <= 0) {
            this.encSetPhase(m, 'watching'); m.smWatch = 2 + Math.floor(Math.random() * 2);
            this.say('"Thank you for holding." The line clicks. It\'s watching again.');
          } else this.say('Hold music plays from somewhere in the dark. It isn\'t moving. It\'s waiting for you to come back.');
          this.audioEvent('holdMusic', {});
          this.tbRefreshTelegraphUI(); this.tbEndCheck(); return;
        }
        if (smPhase === 'watching') {
          if (nearFire) {
            this.say('"We appear to be experiencing— experiencing—" The script breaks. The firelight is too much. It won\'t come closer.');
            this.audioEvent('holdMusic', { broken: true });
            this.tbRefreshTelegraphUI(); this.tbEndCheck(); return;
          }
          m.smWatch = (m.smWatch === undefined ? 2 : m.smWatch) - 1;
          if (m.smWatch <= 0) {
            this.encSetPhase(m, 'dialing');
            this.say('"Please hold while we connect you to—" The voice cuts out. It\'s moving.');
            this.audioEvent('lineCut');
          } else {
            const esc = [
              '"Hello? Are you still there?" It\'s watching. It\'s always been watching.',
              '"Your call is very important to us." The voice is syrup. It hasn\'t blinked.',
              '"We\'re experiencing higher than normal fear volumes." It leans forward, listening to your breathing.',
            ];
            this.say(esc[Math.min(esc.length - 1, Math.max(0, 2 - m.smWatch))]);
            this.audioEvent('holdMusic', { watching: true });
          }
          this.tbRefreshTelegraphUI(); this.tbEndCheck(); return;
        }
        // dialing: THE RUSH. No telegraph — it just goes. (Same shape as the
        // generic rush: up to speed, hit if adjacent.) Then it resets to hold.
        const t = foe.f;
        for (let i = 0; i < m.speed; i++) {
          if (Math.max(Math.abs(t.mx - m.mx), Math.abs(t.my - m.my)) <= 1) break;
          const stp = this.tbStepToward(m, t.mx, t.my, blocked, danger);
          if (!stp) break;
          m.mx = stp.x; m.my = stp.y;
        }
        if (Math.max(Math.abs(t.mx - m.mx), Math.abs(t.my - m.my)) <= 1) {
          const known = this.encTelegraphKnown(m);
          this.say(known
            ? `"Your fear is important to us." No telegraph — it just moved. (${atk.name}.)`
            : 'Something is right behind you, and a syrupy voice says: "Your fear is important to us."');
          this.tbDamage(t.key, S.combat.roll(atk.damage), m.name);
          this.audioEvent('impact', {});
          this.tbLearnPattern(m);
        } else {
          this.say('It rushes — and finds only empty air where you were. The line goes quiet.');
        }
        this.encSetPhase(m, 'hold'); m.smHold = 2;
        this.tbRefreshTelegraphUI(); this.tbEndCheck(); return;
      }

      // ---- CONTRACT GOLEM ("Terms & Conditions"): THE FINE PRINT ----
      // unfold → clause → bound. Speed 1 — just walk away. The attack
      // (direct, range 3) is undodgeable by movement once declared, but the
      // declaration only comes after 2 consecutive turns in proximity:
      // staying IS accepting. Leaving resets the clause. Never flees.
      if (this.cgIs(m)) {
        const ff = fifoFoe(); if (ff) foe = ff;
        if (!m.beamPhase || m.beamPhase === 'stalk') { this.encSetPhase(m, 'unfold'); m.cgClause = 0; }
        // post-resolve: the agreement discharged → back to unfolding
        if (m.cgDeclared && !m.telegraph) {
          m.cgDeclared = false; m.cgClause = 0;
          this.encSetPhase(m, 'unfold');
          this.say('The ink dries. The pages settle. It begins unfolding again — there is always more fine print.');
        }
        const t = foe.f;
        // speed 1: one deliberate step toward the list-head
        if (Math.max(Math.abs(t.mx - m.mx), Math.abs(t.my - m.my)) > (pat.range || 3)) {
          const stp = this.tbStepToward(m, t.mx, t.my, blocked, danger);
          if (stp) { m.mx = stp.x; m.my = stp.y; }
        }
        const d = Math.max(Math.abs(t.mx - m.mx), Math.abs(t.my - m.my));
        if (d <= (pat.range || 3)) {
          m.cgClause = (m.cgClause || 0) + 1;
          if (m.cgClause === 1) {
            this.encSetPhase(m, 'clause');
            this.say('"SECTION 7, SUBSECTION C..." Small text crawls up your legs. You can feel the clauses tightening. You should move.');
            this.audioEvent('paperRustle', {});
          } else if (!m.telegraph) {
            this.encSetPhase(m, 'bound');
            m.cgDeclared = true;
            const known = this.encTelegraphKnown(m);
            this.encDeclareDirect(m, t, known
              ? '"BY REMAINING IN PROXIMITY, YOU HAVE ACCEPTED." The agreement binds — no dodging it now. (You could have walked away. It moves one tile a turn.)'
              : '"BY REMAINING IN PROXIMITY," it rustles, "YOU HAVE ACCEPTED." The fine print tightens around you.');
            this.audioEvent('paperRustle', { binding: true });
          }
        } else {
          if ((m.cgClause || 0) > 0) this.say('The text loosens as you leave its reach. Proximity was the whole contract.');
          m.cgClause = 0;
          if (m.beamPhase !== 'unfold') this.encSetPhase(m, 'unfold');
          this.say('It unfolds — paper and ink and fine print, spreading across the ground toward you. So slowly. One tile a turn.');
          this.audioEvent('paperRustle', {});
        }
        this.tbRefreshTelegraphUI(); this.tbEndCheck(); return;
      }
      if (pat.type === 'ambush') {
        // speedbump: doesn't move. If ANYONE's adjacent, SNAP — no warning.
        // (The FIFO head might be farther off; the snap doesn't care about the queue.)
        let snapFoe = foe;
        if (snapFoe.d > 1) {
          const near = S.combat.nearestEnemy(f.fighters, m);
          if (near && near.d <= 1) snapFoe = near;
        }
        if (snapFoe.d <= 1) {
          const cells = S.combat.patternCells(pat, m.mx, m.my, snapFoe.f.mx, snapFoe.f.my);
          if (this.turtleIs(m)) {
            if (useFifo) this.encSetPhase(m, this.encPhaseFor(m, 'resolve'));
            const named = m.name !== ((m.mdef || {}).unknown || 'something moving');
            this.say(named
              ? `💥 The ${m.name} SNAPS! Its head is suddenly somewhere else.`
              : `💥 The boulder SNAPS — its head is suddenly somewhere else. No warning. There never is.`);
            const rsAudio = (this.encConfig(m) || {}).resolveAudio;
            if (rsAudio) this.audioEvent(rsAudio);
          } else {
            this.say(`💥 The ${this.encTheName(m)} SNAPS! No warning. There never is.`);
          }
          const hitKeys = new Set(cells.map(c => c.cx + ',' + c.cy));
          for (const o of f.fighters) {
            if (!o.alive || o.fled || o.key === m.key) continue;
            if (!S.combat.isFoe(m, o)) continue; // packmates aren't targets
            if (hitKeys.has(o.mx + ',' + o.my)) this.tbDamage(o.key, S.combat.roll(atk.damage), m.name);
          }
          this.tbLearnPattern(m);
        }
        this.tbEndCheck();
        return;
      }
      if (pat.type === 'rush') {
        // hushwolf: NO telegraph. Moves adjacent and hits NOW.
        // BROKEN: the pack's nerve is gone — half the time it circles wide, yipping.
        if (this.wolfIs(m) && m.wolfBroken && Math.random() < 0.5) {
          if (useFifo) this.encSetPhase(m, 'withdraw');
          this.say(`Yipping, ${m.name} circles wide — the pack's nerve is gone.`);
          this.tbEndCheck();
          return;
        }
        if (useFifo) this.encSetPhase(m, this.encPhaseFor(m, 'resolve'));
        for (let i = 0; i < m.speed; i++) {
          if (Math.max(Math.abs(foe.f.mx - m.mx), Math.abs(foe.f.my - m.my)) <= 1) break;
          const s = this.tbStepToward(m, foe.f.mx, foe.f.my, blocked, danger);
          if (!s) break;
          m.mx = s.x; m.my = s.y;
        }
        if (Math.max(Math.abs(foe.f.mx - m.mx), Math.abs(foe.f.my - m.my)) <= 1) {
          this.say(`The ${this.encTheName(m)} is on ${foe.f.kind === 'player' ? 'you' : foe.f.name} — no warning, just teeth.`);
          this.tbDamage(foe.f.key, S.combat.roll(atk.damage), m.name);
          this.tbLearnPattern(m);
        }
        this.tbEndCheck();
        return;
      }
      // standard: advance into range, then DECLARE (behavioral cue only).
      // The attack lands at the start of this monster's next turn. That's the dodge window.
      // HERON (statue): it doesn't advance. It waits — stillness is the whole animal.
      const heronStatue = this.heronIs(m) && !!((this.encConfig(m) || {}).statue);
      if (heronStatue) {
        if (useFifo) this.encSetPhase(m, this.encPhaseFor(m, 'idle'));
        const hd = Math.max(Math.abs(foe.f.mx - m.mx), Math.abs(foe.f.my - m.my));
        if (hd > 4) {
          // out of strike range: nothing. Occasionally the water goes wrong-flat.
          if (Math.random() < 0.15) this.say('The water goes wrong-flat where nothing stands. You look away. You look back. Still nothing.');
          this.tbRefreshTelegraphUI();
          this.tbEndCheck();
          return;
        }
      }
      // MOTH: it doesn't advance — it drifts, erratically, toward light.
      let approachHandled = false;
      // INFLUENCER: it doesn't advance on the queue — it chases its muse (the
      // player), relentlessly, and only declares the flash when close.
      // (Falls through to declare below; the generic approach loop is skipped.)
      let swarmChased = false;
      if (this.swarmIs(m)) {
        const pl = this.tbFighter('p');
        if (pl && pl.alive) {
          const pd = Math.max(Math.abs(pl.mx - m.mx), Math.abs(pl.my - m.my));
          if (pd > 3) {
            this.swarmChase(m);
            if (useFifo) this.encSetPhase(m, 'film');
            this.say('Click. Clickclickclick. It\'s still filming you. All of it is filming you.');
            this.tbRefreshTelegraphUI();
            if (this.tbEndCheck()) return;
            return;
          }
          this.swarmChase(m);
        }
        swarmChased = true;
      }
      if (!swarmChased && !heronStatue && this.mothIs(m)) approachHandled = this.tbMothApproach(m, foe, blocked);
      else if (!swarmChased && !heronStatue) for (let i = 0; i < m.speed; i++) {
        const d = Math.max(Math.abs(foe.f.mx - m.mx), Math.abs(foe.f.my - m.my));
        const want = this.encWantRange(m, pat);
        if (d <= want) break;
        const s = this.tbStepToward(m, foe.f.mx, foe.f.my, blocked, danger);
        if (!s) break;
        m.mx = s.x; m.my = s.y;
      }
      // MOTH: still drifting — no declare this turn.
      if (approachHandled) { this.tbRefreshTelegraphUI(); this.tbEndCheck(); return; }
      if (pat.type === 'direct') {
        const d = Math.max(Math.abs(foe.f.mx - m.mx), Math.abs(foe.f.my - m.my));
        if (d <= (pat.range || 3)) {
          m.telegraph = { kind: 'direct', targetKey: foe.f.key, dmg: atk.damage,
            attackName: atk.name, pattern: pat, turnsLeft: pat.windup || 1 };
          this.sayTelegraphOnce(m, '⚠ ' + this.tbTelegraphCue(m));
          this.audioEvent('telegraph', { urgency: m.telegraph.turnsLeft, pattern: 'direct', highbeam: (m.mdef || {}).id === 'gallowdeer' });
        } else {
          this.say(`The ${this.encTheName(m)} stalks closer. ${atk.telegraph || ''}`);
        }
      } else {
        let cells = S.combat.patternCells(pat, m.mx, m.my, foe.f.mx, foe.f.my);
        let aim = null, bdir = null, aimKey = null, bang = null;
        const dcfg = this.encConfig(m) || {};
        // BULLDOZE: the lane shreds trees, fences, brush — only real walls stop it.
        if (dcfg.bulldoze && pat.type === 'charge') cells = this.tbBulldozeCells(cells);
        // COMMIT: lock the lane now. It will not re-aim at resolve.
        if (dcfg.commitCharge) { aim = { x: foe.f.mx, y: foe.f.my }; aimKey = foe.f.key; }
        if (pat.sweep && (pat.type === 'beam' || pat.type === 'line')) {
          // SWEEPING BEAM: a ray FROM THE DEER that rotates toward you. It
          // locks its bearing at declare, then sweeps while it fires. Only
          // walls and real structures stop it — trees shred, and it travels
          // to the edge of the node. (Fighters never block: the beam goes
          // through them. That's the point.)
          const r = this.tbBeamCells(m.mx, m.my, foe.f.mx, foe.f.my);
          cells = r.cells; bdir = r.dir;
          aim = { x: foe.f.mx, y: foe.f.my }; aimKey = foe.f.key;
          bang = Math.atan2(foe.f.my - m.my, foe.f.mx - m.mx);
        } else if (pat.type === 'beam' || pat.type === 'line') {
          // BEAM/LINE: trees and rocks block the shot. The lane ends at the
          // first blocking terrain — break line of sight, break the beam.
          // (Fighters never block: the beam goes through them. That's the point.)
          const detail = this.genDetail(this.map.px, this.map.py);
          const cut = [];
          for (const c of cells) {
            const cell = detail[c.cy] && detail[c.cy][c.cx];
            if (cell && this.cellProps(cell).blocks) break;
            cut.push(c);
          }
          cells = cut;
        }
        const p0 = this.tbFighter('p');
        m.telegraph = { kind: 'squares', cells, dmg: atk.damage,
          attackName: atk.name, pattern: pat, turnsLeft: pat.windup || 1,
          threatenedPlayer: !!(p0 && p0.alive && cells.some(c => c.cx === p0.mx && c.cy === p0.my)),
          aim, dir: bdir, aimKey, angle: bang, firing: 0 };
        // DELEGATE: the announced line is drawn true to the aim — the target
        // is always on it. Wide, and exactly where it said.
        if (this.beastIs(m) && pat.type === 'charge') {
          m.telegraph.cells = this.beastLineCells(m.mx, m.my, foe.f.mx, foe.f.my, pat.length || 4, pat.width || 2);
          m.telegraph.threatenedPlayer = !!(p0 && p0.alive && m.telegraph.cells.some(c => c.cx === p0.mx && c.cy === p0.my));
        }
        // WITNESS: seeing it wind up teaches you its attack. The codex notes
        // the behavior — never the true name, never numbers.
        try {
          const me = this.ensureMonsterEntry(m.mdef.id);
          if (atk.name && !me.attacksSeen.includes(atk.name)) {
            me.attacksSeen.push(atk.name);
            if (me.stage === 'encountered') me.stage = 'observed';
          }
        } catch (e) {}
        this.sayTelegraphOnce(m, '⚠ ' + this.tbTelegraphCue(m));
        this.audioEvent('telegraph', { urgency: m.telegraph.turnsLeft, pattern: pat.type, beam: pat.type === 'beam' || pat.type === 'line', highbeam: (m.mdef || {}).id === 'gallowdeer' });
        // Declare phase: per-monster (batch 2's encDeclarePhase) where defined,
        // else the config phaseMap (batch 1's encPhaseFor). The deer gets 'aim' either way.
        if (useFifo) {
          const hasDeclare = this.mothIs(m) || this.toadIs(m) || this.humiceIs(m);
          this.encSetPhase(m, hasDeclare ? this.encDeclarePhase(m) : this.encPhaseFor(m, 'declare'));
        }
        this.audioEvent(dcfg.aggroAudio || 'deerAggro'); // BELLOW on declare: the beast itself must be audible (Steve heard only beam)
        if (dcfg.declareAudio) this.audioEvent(dcfg.declareAudio);
        // MOTH: the fold locks its facing — behind it, you're safe.
        if (this.mothIs(m)) {
          m.mothFacing = { x: Math.sign(foe.f.mx - m.mx) || 0, y: Math.sign(foe.f.my - m.my) || 1 };
          this.say('It hangs mid-air — turns to face you — and the wings begin to fold.');
          this.audioEvent('mothFlutter');
        }
        if (this.toadIs(m)) this.audioEvent('toadSwell');
        if (this.humiceIs(m) && (this.tbfight.humStacks || 0) >= 3) {
          this.say('The hum becomes a TIDE — teeth everywhere in the grass, all leaning your way.');
        }
        // BATCH 4: phases wear the monster's own names; the swarm's grudge
        // rides along into the damage.
        if (this.droneIs(m)) {
          if (useFifo) this.encSetPhase(m, 'project');
          this.audioEvent('droneHum');
        }
        if (this.swarmIs(m)) {
          if (useFifo) this.encSetPhase(m, 'build');
          if (m.escalation > 0) {
            const k = 1 + 0.15 * Math.min(m.escalation, 4);
            m.telegraph.dmg = [Math.round(atk.damage[0] * k), Math.round(atk.damage[1] * k)];
          }
          this.audioEvent('swarmShutters');
        }
        if (this.hornIs(m)) {
          if (useFifo) this.encSetPhase(m, 'inflate');
          this.audioEvent('hypeInflate');
        }
        if (this.beastIs(m)) {
          if (useFifo) this.encSetPhase(m, 'announce');
          this.audioEvent('delegateAnnounce');
        }
        this.audioEvent('deerAggro'); // BELLOW on declare: the deer itself must be audible (Steve heard only beam)
        if (isDeer) {
          this.say('It BELLOWS — wrong, too deep, like a foghorn heard through water. The sound sits in your teeth.');
        }
      }
      // SNAKE MOVEMENT (Steve 2026-10-05): ducks in a row. The head moves toward
      // the player (fast!); each segment follows the one ahead. Classic snake.
      // Only the head decides — segments just follow. This runs INSTEAD of
      // normal movement for snake segments.
      if (m.mdef && m.mdef.snake) {
        this.tbSnakeMove(m);
        this.tbSnakeContactDamage();
        this.tbRefreshTelegraphUI();
        this.tbEndCheck();
        return;
      }
    // PACK COHESION (Steve 2026-10-05): pack monsters stick together and
    // surround. If too far from the pack centroid, step toward it. If close
    // to the player, spread to surround (prefer tiles adjacent to player
      // that aren't occupied by packmates).
      if (m.mdef && m.mdef.pack > 1) {
        const packmates = f.fighters.filter(x => x.kind === 'monster' && x.alive && !x.fled && x.mdef && x.mdef.id === m.mdef.id && x.key !== m.key);
        if (packmates.length) {
          const cx = packmates.reduce((s, x) => s + x.mx, 0) / packmates.length;
          const cy = packmates.reduce((s, x) => s + x.my, 0) / packmates.length;
          const distToPack = Math.max(Math.abs(m.mx - cx), Math.abs(m.my - cy));
          const p = this.tbFighter('p');
          if (p && distToPack > 2) {
            // Too far from pack — step toward centroid
            const dx = Math.sign(cx - m.mx), dy = Math.sign(cy - m.my);
            const nx = m.mx + dx, ny = m.my + dy;
            if (nx >= 0 && nx <= 8 && ny >= 0 && ny <= 8 && !this.tbBlocked(nx, ny)) {
              m.mx = nx; m.my = ny;
            }
          } else if (p && Math.max(Math.abs(m.mx - p.mx), Math.abs(m.my - p.my)) <= 3) {
            // Near player — spread to surround (avoid stacking on packmates)
            const occupied = new Set(packmates.map(x => x.mx + ',' + x.my));
            let best = null, bestScore = -1;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const nx = m.mx + dx, ny = m.my + dy;
              if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
              if (this.tbBlocked(nx, ny)) continue;
              if (occupied.has(nx + ',' + ny)) continue;
              // Prefer tiles adjacent to player but not too close to packmates
              const dPlayer = Math.max(Math.abs(nx - p.mx), Math.abs(ny - p.my));
              const dPack = Math.min(...packmates.map(x => Math.max(Math.abs(nx - x.mx), Math.abs(ny - x.my))));
              const score = (dPlayer <= 1 ? 2 : 0) + Math.min(dPack, 3);
              if (score > bestScore) { bestScore = score; best = { x: nx, y: ny }; }
            }
            if (best) { m.mx = best.x; m.my = best.y; }
          }
        }
      }
      this.tbRefreshTelegraphUI();
      this.tbEndCheck();
    },

    tbEndCheck() {
      const f = this.tbfight;
      if (!f || f.over) return f ? f.over : false;
      const p = this.tbFighter('p');
      const monstersFighting = f.fighters.filter(x => x.kind === 'monster' && x.alive && !x.fled);
      const monstersAlive = f.fighters.some(x => x.kind === 'monster' && x.alive);
      if (!monstersFighting.length) { this.tbEnd(monstersAlive ? 'routed' : 'won'); return true; }
      if (p && (!p.alive || p.fled)) {
        if (!p.alive) {
          this.state.scholar.health = Math.max(0, p.hp);
          if (this.maybeCheatDeath()) {
            p.hp = this.state.scholar.health;
            if (p.hp > 0) { p.alive = true; this.say('You refuse to stay down. The fight goes on.'); return false; }
          }
          this.tbEnd('lost');
        } else {
          this.tbEnd('fled');
        }
        return true;
      }
      return false;
    },

    // rollAlienLoot: shared loot table for monster kills AND future show/
    // contest rewards (Steve 2026-10-05). mdef.loot = {chance, tier}.
    // Returns an item id or null. Chances are LOW by design — alien loot
    // should feel like a gift from a confused god, not a paycheck.
    // WAVE-CAPPED (Steve 2026-10-05): you can't get tier-2 loot from wave-1
    // monsters. The tier is capped by the monster's wave. No early jackpots.
    rollAlienLoot(mdef) {
      const loot = (mdef || {}).loot;
      if (!loot || !(loot.chance > 0)) return null;
      if (Math.random() >= loot.chance) return null;
      const wave = mdef.wave || 1;
      const maxTier = Math.min(loot.tier || 1, wave); // wave caps the tier
      // Find the highest available tier <= maxTier (fallback if tier missing)
      let tier = Math.max(1, maxTier);
      let pool = [];
      while (tier >= 1 && !pool.length) {
        pool = (this.data.items || []).filter(i => i.origin === 'alien' && (i.lootTier || 1) === tier);
        if (!pool.length) tier--;
      }
      if (!pool.length) return null;
      return pool[Math.floor(Math.random() * pool.length)].id;
    },
    tbEnd(result) {
      const f = this.tbfight;
      if (!f || f.over) return;
      f.over = true; f.result = result;
      // WAVE TRACKING (Steve 2026-10-05, revised): kills by wave unlock the
      // next wave (day-gated). The System watches — prove you can handle it.
      this.state.combatWins = this.state.combatWins || 0;
      this.state.combatLosses = this.state.combatLosses || 0;
      const waveBefore = this.unlockedWave();
      if (result === 'won') {
        this.state.combatWins++;
        // Record kills by wave for unlock gates
        for (const m of f.fighters) {
          if (m.kind === 'monster' && !m.alive && m.mdef) {
            this.recordWaveKill(m.mdef.id);
          }
        }
        // Leadership: force
        this.leadShift('force', 1);
      }
      else if (result === 'lost') this.state.combatLosses++;
      // Check for wave unlock (System escalation)
      const waveAfter = this.unlockedWave();
      if (waveAfter > waveBefore) {
        this.sysSay(`📺 RATINGS ARE UP! The producers are pleased. New casting directives incoming — Wave ${waveAfter} talent has been released into your sector.`);
        this.audioEvent('waveUnlock');
      }
      // AUDIO HYGIENE (Steve): killing the deer left the beam's hum playing.
      // NOTHING outlives its encounter — stop every sustained loop on ANY
      // ending (won, lost, fled, routed). combatEnd is idempotent.
      this.audioEvent('combatEnd');
      if (this.clearTelegraph) this.clearTelegraph();
      const s = this.state.scholar;
      const p = this.tbFighter('p');
      if (p) s.health = Math.max(0, p.hp);
      for (const v of f.fighters) {
        if (v.kind === 'villager' && v.alive && !v.fled) this.tbVillagerSyncPos(v);
      }
      if (result === 'won') {
        try { this.combatWitnessReact('kill'); } catch (e) {}
        // MONSTER REWARDS need a monster. A 'won' with no monster fighter
        // (e.g. a human-only fight that didn't route through the betrayal
        // end path) skips the carcass economy instead of crashing on
        // undefined.mdef (2026-10-05).
        const mf = f.fighters.find(x => x.kind === 'monster');
        const mdef = (mf && mf.mdef) || null;
        if (mdef) {
        this.state.codex.monsters = this.state.codex.monsters || {};
        const cur = this.state.codex.monsters[mdef.id] || {};
        this.state.codex.monsters[mdef.id] = Object.assign(cur, { stage: 'slain' });
        this.audioEvent('victory');
        this.sysSay(`WINNER! Style score: ${f.style || 0}. The gamblers ${((f.style || 0) >= 40) ? 'are ecstatic!' : 'nod approvingly.'}`);
        if (mdef.edible) {
          // ZERO-CALORIE FIX (Steve 2026-10-05): explicit nullish check — a
          // 0-calorie "do not eat" monster yields NO meat, not 1000 kcal of
          // phantom lunch. (mdef.edible.calories || 1000) turned inedible
          // robots into dinner. 0 stays 0.
          const kcal = (mdef.edible.calories == null) ? 1000 : mdef.edible.calories;
          if (kcal > 0) {
            const cuts = Math.max(1, Math.round(kcal / 800));
            s.inventory.push({ plantId: mdef.id + '_meat', units: cuts, kcalEach: Math.round(kcal / cuts), spoilDay: s.day + 3, name: mdef.name + ' meat', unit: 'cut', prep: mdef.edible.note || 'Cook it.', kg: 0.8 });
            this.say(`${mdef.edible.note || ''} (+${cuts} cuts, ${this.fmtKcal ? this.fmtKcal(kcal) : kcal + ' kcal'})`);
          } else if (mdef.edible.note) {
            this.say(mdef.edible.note);
          }
        }
        // ALIEN LOOT (Steve 2026-10-05): monsters are HIGH RISK / HIGH REWARD.
        // Low drop chance; loot tier scales with monster strength. The System
        // leaves confused gifts for impressive violence. Show/contest rewards
        // plug into rollAlienLoot(tier) when that system lands.
        try {
          const dropId = this.rollAlienLoot(mdef);
          if (dropId) {
            const def = (this.data.items || []).find(i => i.id === dropId);
            if (def) {
              s.inventory.push({ itemId: dropId, name: def.name, units: 1, kcalEach: def.kcalEach || 0, spoilDay: def.spoilDay || 9999, unit: 'piece', kg: def.kg || 0.3, alienLoot: true });
              this.say(`✨ ALIEN LOOT: ${def.name}. ${def.flavor || ''}${def.baseEffect ? ` (${def.baseEffect})` : ''}`);
            }
          }
        } catch (e) {}
        } // end monster-reward block
        this.notePlaystyle('bold');
        try { this.villageEvent('victory'); } catch (e) {}
        try { this.checkPromises('fight'); } catch (e) {}
        if (this.hasAbility('grave_robber') && Math.random() < 0.5) {
          const gear = ['bone knife', 'cracked helm', 'war horn', 'tooth necklace'];
          const g = gear[Math.floor(Math.random() * gear.length)];
          s.inventory.push({ name: g, kcalEach: 0, units: 1, spoilDay: 9999, unit: 'trophy', kg: 0.5 });
          this.say(`Grave robber: you take its ${g}. The dead don't need it.`);
        }
        for (const r of this.relicItems()) {
          const rdef = this.data.items.find(i => i.id === (r.itemId || r.id));
          if (rdef && rdef.class === 'sentimental') {
            r.bond = (r.bond || 0) + 3;
          }
        }
        // BOND PERCEPTION (Steve 2026-10-05): the bond grows whether you
        // understand it or not — but you only PERCEIVE it with knowledge.
        // Before the System teaches resonance harmonics, it's just clutching
        // something that matters. After, you feel the math. One line, not a
        // flood — and never raw "+3" spam.
        {
          const kept = this.relicItems().filter(r => {
            const rd = this.data.items.find(i => i.id === (r.itemId || r.id));
            return rd && rd.class === 'sentimental';
          });
          if (kept.length) {
            const names = kept.map(r => r.name).join(', ');
            if (this.sentimentTaught && this.sentimentTaught()) {
              const total = kept.reduce((s, r) => s + (r.bond || 0), 0);
              this.say(`You clutch your ${names}. You're still here. The resonance deepens. (bond ${total})`);
            } else {
              this.say(`You clutch your ${names}. You're still here.`);
            }
          }
        }
      } else if (result === 'routed') {
        this.notePlaystyle('cautious');
        try { const mm = f.fighters.find(x => x.kind === 'monster'); if (mm) this.identifyMonster(mm.monsterId); } catch (e) {}
        this.say('It got away. No meat, no trophy — but you\'re breathing, and now you know its moves.');
        this.sysSay(`It RAN! Style score: ${f.style || 0}. The gamblers wanted blood, but they'll settle for drama.`);
      } else if (result === 'fled') {
        this.notePlaystyle('cautious');
        try { this.combatWitnessReact('flee'); } catch (e) {}
        try { const mm = f.fighters.find(x => x.kind === 'monster'); if (mm) this.identifyMonster(mm.monsterId); } catch (e) {}
        // survivors scatter; monsters melt back into the woods
        this.say('You escape. The thicket keeps its secrets.');
        this.sysSay('And they\'re GONE! The gamblers who bet on a fight are furious. The ones who bet on running are rich.');
      } else if (result === 'lost') {
        this.audioEvent('defeat');
        this.sysSay('OH. Oh no. ...The gamblers are very quiet.');
        if (!this.over) { try { this.playerDeath('combat'); } catch (e) { this.over = true; } }
      }
      this.tbfight = null;
    },

    combatRound(cmd) {
      // OLD menu combat retired — the grid is the combat now.
      // Kept as a no-op shim so any stale caller doesn't crash.
      return null;
    },
    say(msg) {
      // DEDUP (Steve 2026-10-05): never say the exact same thing twice in a row.
      // Pack monsters declaring the same attack were spamming the log 4×.
      // This is a safety net — the per-attack dedup in sayTelegraphOnce is primary.
      const log = this.log;
      if (log.length > 0 && log[log.length - 1] === msg) return;
      log.push(msg); if (log.length > 40) log.shift();
    },
    // pickFresh(pool, key): cycle through narration lines without repeating
    // until every line has been used once. Repeating the same horror line
    // three times in one brawl reads as a bug, not a style. Keyed storage
    // lives on the fight object when one is active, else on a scratch map.
    pickFresh(pool, key) {
      const store = (this.tbfight && (this.tbfight._fresh = this.tbfight._fresh || {})) ||
        (this._freshScratch = this._freshScratch || {});
      let used = store[key] || (store[key] = []);
      let avail = pool.filter(l => !used.includes(l));
      if (!avail.length) { used = store[key] = []; avail = pool.slice(); }
      const pick = avail[Math.floor(Math.random() * avail.length)];
      used.push(pick);
      return pick;
    },

    // maybeCheatDeath: second_wind / phoenix_clause / molt. Called BEFORE death is final.
    // Returns true if death was cheated (caller must not set over).
    maybeCheatDeath() {
      const s = this.state.scholar;
      // molt: once per week, shed your skin. Heal to full — but lose all equipped gear.
      const week = Math.floor(s.day / 7);
      const moltUses = (s.moltWeek === week) ? (s.moltUses || 1) : 0;
      const moltMax = this.hasSynergy('refuses_death') ? 2 : 1;
      if (this.hasAbility('molt') && moltUses < moltMax && s.health <= 0) {
        s.moltWeek = week; s.moltUses = moltUses + 1;
        s.health = this.maxHealth();
        const eq = s.equipped || {};
        s.equipped = {};
        this.say('MOLT: your skin splits. You step out new, whole — and naked. All equipped gear lost in the old skin.');
        this.noteAbilityUse('molt');
        return true;
      }
      // second_wind: once per day, when you'd die, you don't. 1 HP, 500 kcal.
      // refuses_death synergy: twice per day. undying_fury: full restore mid-rage.
      const swUses = (s.secondWindDay === s.day) ? (s.secondWindUses || 1) : 0;
      const swMax = this.hasSynergy('refuses_death') ? 2 : 1;
      if (this.hasAbility('second_wind') && swUses < swMax && s.health <= 0) {
        s.secondWindDay = s.day; s.secondWindUses = swUses + 1;
        const furious = this.hasSynergy('undying_fury') && this.hasAbility('rage');
        // undying_fury: rage was active (health hit 0, which is below half). Log both as simultaneous.
        const wasRaging = this.hasAbility('rage');
        s.health = furious ? this.maxHealth() : 1; s.kcal = Math.max(s.kcal, 500);
        this.noteAbilityUse('second_wind');
        if (wasRaging) this.noteAbilityUse('rage');
        this.say(furious ? 'UNDYING FURY: death came for you mid-rage and you LAUGHED. FULL HEALTH. The rage does not end.' : `SECOND WIND: you should be dead. You refuse. (1 HP, 500 kcal.${swMax > 1 ? ` ${swMax - swUses - 1} use left today.` : ' Once today.'})`);
        return true;
      }
      // phoenix_clause: once per run. Explode, then respawn at Haven with 1 HP.
      // The System calls it 'great television.'
      if (this.hasAbility('phoenix_clause') && !s.phoenixUsed && s.health <= 0) {
        s.phoenixUsed = true;
        if (this.fight && this.fight.monster) {
          this.fight.monster.hp -= 60;
          this.say('PHOENIX CLAUSE: you EXPLODE — 60 damage to everything nearby.');
        }
        s.health = 1; s.kcal = 500;
        this.map.px = this.state.village.px ?? 3; this.map.py = this.state.village.py ?? 3;
        s.mx = 4; s.my = 4; this.fight = null; s.monster = null;
        this.say('You wake at Haven, 1 HP, ash in your mouth. The audience applauds. (phoenix_clause: once per run)');
        this.noteAbilityUse('phoenix_clause');
        return true;
      }
      return false;
    },

    // --- telemetry: every meaningful event, with state deltas. for diagnosing playtests. ---
    tele(type, data) {
      this.state.telemetry = this.state.telemetry || [];
      const s = this.state.scholar || {};
      this.state.telemetry.push(Object.assign({
        t: Date.now(), day: s.day || 0, part: DAY_PARTS[this.dayPart] || '?', type,
        kcal: Math.round(s.kcal || 0), hp: Math.round(s.health || 0),
        packKcal: (this.state.scholar ? this.state.scholar.inventory.reduce((t, i) => t + (i.units || 0) * (i.kcalEach || 0), 0) : 0),
        pantry: Math.round(this.state.village ? this.state.village.pantryKcal : 0),
      }, data || {}));
      if (this.state.telemetry.length > 300) this.state.telemetry.splice(0, this.state.telemetry.length - 300);
    },

    // fmtKcal: human-readable calories. <1000 → "850 kcal", ≥1000 → "2.4 Mcal".
    // One rule, everywhere. Big numbers stay readable, small ones stay precise.
    fmtKcal(n) {
      n = Math.round(n || 0);
      if (Math.abs(n) < 1000) return `${n} kcal`;
      return `${(n / 1000).toFixed(1)} Mcal`;
    },
    status() {
      const s = this.state.scholar;
      // One-time migration: the old separate reserve pool folds into the bar.
      if (this.migrateReserve) this.migrateReserve();
      // One-time migration: old per-species unfamiliar piles fold into lumps.
      if (this.migrateLumps) this.migrateLumps();
      return {
        day: s.day, dayPart: DAY_PARTS[this.dayPart], dayPartHint: DAY_PART_HINT[DAY_PARTS[this.dayPart]],
        // ACTION CLOCK: ticks for the UI day-timer. 512 ticks = the full day.
        dayTicks: s.dayTicks || 0, dayTicksMax: this.TIME.TICKS_PER_DAY,
        // DAY/NIGHT: continuous time for the sun/moon dial and night visuals.
        dayProgress: this.dayProgress(), lightLevel: Math.round(this.lightLevel() * 100) / 100,
        isNight: this.isNight(), systemArrived: !!this.state.systemArrived,
        dialGlitch: !!this.state.dialGlitch,
        ap: this.ap, health: Math.round(s.health), kcal: Math.round(s.kcal),
        hydration: Math.round(s.hydration), energy: Math.round(s.energy),
        // THE BANK: one pool. The bar IS the reserve — cap, banked, states.
        kcalCap: this.kcalCap ? this.kcalCap() : 2400,
        fullLine: this.fullLine ? this.fullLine() : 2400,
        banked: this.banked ? Math.round(this.banked()) : 0,
        feastState: this.feastState ? this.feastState() : 'empty',
        water: s.water || 0,
        // carried water, in liters (bottles are {liters, quality, source} objects —
        // never string-concat the raw array; that's how you get "[object Object]").
        waterL: Math.round(((s.water || []).reduce((t, b) => t + (b.liters || 1), 0)) * 10) / 10,
        waterCleanL: Math.round(((s.water || []).filter(b => b.quality === 'clean').reduce((t, b) => t + (b.liters || 1), 0)) * 10) / 10,
        inventory: s.inventory.map(i => ({ name: i.name, units: i.units, kcalEach: i.kcalEach, spoilDay: i.spoilDay })),
        invCount: s.inventory.reduce((t, i) => t + (i.units || 1), 0),
        invKcal: s.inventory.reduce((t, i) => t + (i.units || 0) * (i.kcalEach || 0), 0),
        // Pantry kcal computed from ITEMS, not a bucket. Unsafe food counts (it's there, it's risky).
        pantryKcal: Math.round((this.state.village.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0)),
        pantryDays: this.pantryDaysEstimate(),
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
        inCombat: !!this.tbfight,
        pendingEncounter: !!this.pendingEncounter,
        wanderer: this.wanderer ? { x: this.wanderer.x, y: this.wanderer.y } : null,
        log: this.log.slice(-6),
        codexCount: Object.keys(this.state.codex.plants).length,
        abilities: s.abilities,
        // open_book: villagers tell you their real trust level. You just know how to ask.
        villagerTrust: this.hasAbility('open_book') ? this.openBookInfo() : null,
      };
    },

    // openBookInfo: true trust levels + one secret fear each. Information is power.
    openBookInfo() {
      const v = this.state.village;
      return (this.data.villagers || []).filter(x => (v.roster || []).includes(x.id)).map(p => ({
        name: p.name.split(' ')[0],
        trust: Math.round((v.trust || {})[p.id] ?? 10),
        fear: p.secretFear || p.fear || 'being forgotten',
      }));
    },

    // KNOWLEDGE DISPLAY: names are earned, not given. Until L1, plants are descriptors.
    plantKnown(pid) {
      const e = (this.state.codex.plants || {})[pid];
      return !!(e && e.level >= 1);
    },
    // MONSTER FOOD SAFETY (Steve 2026-10-05): if you don't know it's safe,
    // the UI doesn't show edibility or calories. Learned via cautious testing,
    // villager word-of-mouth, or Codex. Stored on the monster codex entry.
    monsterFoodSafe(mid) {
      const e = (this.state.codex.monsters || {})[mid];
      return !!(e && e.foodSafe);
    },
    markMonsterFoodSafe(mid, how) {
      if (!this.state.codex.monsters) this.state.codex.monsters = {};
      const e = this.state.codex.monsters[mid] || {};
      e.foodSafe = true;
      e.foodSafeHow = how || 'tested';
      this.state.codex.monsters[mid] = e;
      // Reveal any matching meat already in inventory: now that you know,
      // the UI can show it. (Steve 2026-10-05: if you don't know, it doesn't show;
      // once you know, it does.)
      const reveal = (cont) => {
        if (!cont) return;
        for (const it of cont) {
          if (!it || it.foodKind !== 'meat') continue;
          const id = (it.plantId || '').replace(/^meat_/, '');
          if (id === mid && !it.edible) {
            const gross = it.hiddenKcal || 0;
            const per = Math.round(gross * 0.40 / 4); // standard yield
            it.edible = true;
            it.kcalEach = per;
            it.prep = '⚠️ Risky: raw meat. Cook it, or preserve it. Spoils in ~2 days.';
          }
        }
      };
      reveal(this.state.scholar.inventory);
    },
    plantLevel(pid) {
      const e = (this.state.codex.plants || {})[pid];
      return (e && e.level) || 0;
    },
    // USES ARE EARNED: every forageable has at least one real use, but
    // uselessness is ignorance, not a property of the plant. L2 unlocks the
    // primary use; L3 unlocks the rest. L0/L1: no uses known.
    plantUses(pid) {
      const p = this.data.plants.find(x => x.id === pid);
      if (!p || !p.uses) return [];
      const lvl = this.plantLevel(pid);
      return p.uses.filter(u => lvl >= (u.minLevel || 2));
    },
    plantUsesText(pid) {
      const uses = this.plantUses(pid);
      if (!uses.length) return '';
      return uses.map(u => `${u.kind}: ${u.note}`).join('; ');
    },
    // SPATIAL RECOGNITION: the land remembers what you took, and so do you.
    // Returning to a tile surfaces what you found here before, described with
    // your CURRENT knowledge — the "oh, THESE are the edible ones" moment.
    speciesRecognition(pid) {
      const p = this.data.plants.find(x => x.id === pid);
      if (!p) return '';
      const lvl = this.plantLevel(pid);
      const uses = this.plantUses(pid);
      const edible = uses.some(u => u.kind === 'food');
      if (lvl >= 2) {
        return `You recognize it — ${p.name.toLowerCase()}${edible ? ', one of the edible ones' : ''}.` +
          (uses.length ? ` Uses so far: ${uses.map(u => u.kind + ' (' + u.note + ')').join('; ')}.` : '');
      }
      if (lvl >= 1) return `The ${p.name} — you've gathered it here before.`;
      return `The ${(p.description || 'unfamiliar plant').toLowerCase()} from before — still unnamed.`;
    },
    // compact variant for the tile's "here" list
    speciesHereLine(pid) {
      const p = this.data.plants.find(x => x.id === pid);
      if (!p) return null;
      const lvl = this.plantLevel(pid);
      const edible = this.plantUses(pid).some(u => u.kind === 'food');
      if (lvl >= 2) return `${p.name.toLowerCase()} (known${edible ? ', edible' : ''})`;
      if (lvl >= 1) return `${p.name.toLowerCase()} (recognized)`;
      return `${(p.description || 'unfamiliar plant').toLowerCase()} (seen before, unnamed)`;
    },
    plantDisplayName(pid) {
      const p = this.data.plants.find(x => x.id === pid);
      if (!p) return 'unfamiliar plant matter';
      if (this.plantKnown(pid)) return p.name;
      return p.description || 'an unfamiliar plant';
    },
    itemDisplayName(it) {
      if (it && it.plantId) return this.plantDisplayName(it.plantId);
      return (it && it.name) || 'something';
    },
    // when a plant is identified, update any inventory stacks still showing descriptors
    refreshItemNames(pid) {
      const p = this.data.plants.find(x => x.id === pid);
      if (!p) return;
      for (const it of (this.state.scholar.inventory || [])) {
        if (it.plantId === pid) { it.name = p.name; if (p.preparation) it.prep = p.preparation; }
      }
    },
    // THE identification event. One path, every source. Names are earned here.
    // villagerLearnsPlant: THE knowledge-growth primitive. taught[] is what
    // villageEats reads for the knowledge factor — every identification,
    // teaching, and fireside share flows through here. One store, not three.
    villagerLearnsPlant(vid, pid, source) {
      const v = this.state.village;
      if (!v || !vid || !pid) return false;
      v.taught = v.taught || {};
      const list = v.taught[vid] = v.taught[vid] || [];
      if (list.includes(pid)) return false;
      list.push(pid);
      // keep the parallel food.js store in sync where it exists
      try {
        v.plantKnowledge = v.plantKnowledge || {};
        const pk = v.plantKnowledge[vid] = v.plantKnowledge[vid] || [];
        if (!pk.includes(pid)) pk.push(pid);
      } catch (e) {}
      return true;
    },
    identifyPlant(pid, source) {
      const p = this.data.plants.find(x => x.id === pid);
      if (!p || this.plantKnown(pid)) return false;
      // JOURNAL FRAMING (Steve 2026-10-05): pre-codex this is a handwritten
      // journal entry (word of mouth / your own work / jotted notes), not a
      // Codex record. journalName() already frames the UI; the flag lets
      // entries carry their provenance.
      const preCodex = !this.state.scholar.codexUnlocked;
      this.state.codex.plants[pid] = { identifiedDay: this.state.scholar.day, level: 1, harvests: 0, tastings: 0, by: source || 'observation', journal: preCodex };
      this.state.codex.encounters[pid] = 99;
      this.refreshItemNames(pid);
      this.integrate(source === 'taught' ? 2 : 3, source === 'taught' ? 'taught' : 'discovery');
      // celebration: identification is an EVENT, not a log line.
      // knowledgeLevels['1'] often starts with the name ("Chickweed. Low, tiny
      // white flowers.") — strip it so we don't print "Chickweed. Chickweed."
      let kl1 = p.knowledgeLevels['1'] || '';
      const namePrefix = p.name + '. ';
      if (kl1.startsWith(namePrefix)) kl1 = kl1.slice(namePrefix.length);
      else if (kl1.startsWith(p.name)) kl1 = kl1.slice(p.name.length).replace(/^[.\s:—-]+/, '');
      this.say(`\u2605 IDENTIFIED: ${p.name}. ${kl1} Uses unknown — harvest, taste, and learn.`);
      // SYSTEM VOICE GATE: before the System arrives (Day 7), identification is
      // diegetic only — people, tasting, books. The overlay never speaks first.
      if (this.state.systemArrived) {
        const sys = [
          'SYSTEM: Naming things. Very human. The audience approves.',
          'SYSTEM: Oh! It has a NAME. You all love names.',
          'SYSTEM: Catalogued. The Codex grows teeth.',
          'SYSTEM: Identification complete. You are 0.3% less lost.',
        ];
        this.say(sys[Math.floor(Math.random() * sys.length)]);
      }
      // THE VILLAGE LEARNS — SLOWLY (Steve 2026-10-05): knowledge used to hit
      // 60% of the village instantly. Now word of mouth is word of mouth: at
      // most one witness picks it up on the spot, and the rest learn over
      // days via spreadPlantKnowledge (daily tick). Your own taught[] syncs
      // with your codex (villageEats reads taught, not codex).
      try {
        const v = this.state.village;
        this.villagerLearnsPlant(this.villagerId, pid, source);
        const witnesses = (v.roster || []).filter(rid => rid !== this.villagerId);
        if (witnesses.length && Math.random() < 0.5) {
          const w = witnesses[Math.floor(Math.random() * witnesses.length)];
          if (this.villagerLearnsPlant(w, pid, 'observed')) {
            this.say(`${this.displayName(w)} was watching. Now they know ${p.name} too.`);
          }
        }
        // seed the slow rumor: this plant is "going around" now
        v.plantRumors = v.plantRumors || {};
        if (!v.plantRumors[pid]) v.plantRumors[pid] = { day: this.state.scholar.day };
      } catch (e) {}
      return true;
    },
    codexEntries() {
      return Object.keys(this.state.codex.plants).map(pid => {
        const p = this.data.plants.find(x => x.id === pid);
        const e = this.state.codex.plants[pid];
        if (!p || !e) return null;
        const lvl = e.level || 1;
        return { pid, name: p.name, level: lvl, kcal: p.caloriesPerUnit, unit: p.unit,
          prep: p.preparation, text: p.codex, knowledge: (p.knowledgeLevels || {})[String(lvl)] || '',
          uses: this.plantUsesText(pid),
          harvests: e.harvests || 0, tastings: e.tastings || 0 };
      }).filter(Boolean);
    },
    // plants you've met but not yet named — the Codex tracks your progress
    codexInProgress() {
      const th = (this.state.codex.learnThreshold || {});
      return Object.keys(this.state.codex.encounters || {}).filter(pid => !this.plantKnown(pid)).map(pid => {
        const p = this.data.plants.find(x => x.id === pid);
        if (!p) return null;
        return { pid, descriptor: p.description || 'an unfamiliar plant',
          enc: this.state.codex.encounters[pid] || 0, threshold: th[pid] || 3 };
      }).filter(Boolean);
    },
    // D-PAD SIDE (Steve 2026-10-05): user can lock D-pad to left or right.
    // Actions fill the other side. Default: right (right-handed).
    dpadSide() {
      return (this.state.settings && this.state.settings.dpadSide) || 'right';
    },
    setDpadSide(side) {
      this.state.settings = this.state.settings || {};
      this.state.settings.dpadSide = side === 'left' ? 'left' : 'right';
    },
  };

  global.Scattering = global.Scattering || {};
  global.Scattering.Game = Game;
  global.Scattering.DAY_PARTS = DAY_PARTS;
  global.Scattering.TILE_GLYPH = TILE_GLYPH;
  global.Scattering.TILE_NAME = TILE_NAME;
})(typeof window !== 'undefined' ? window : globalThis);
