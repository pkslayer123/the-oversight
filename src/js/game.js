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
      const [plants, biomes, monsters, villagers, abilities, items, background_survivors, cellDefs, animals, recipes, books, relicEnhancements, locations, characterGen, synergies, knowledge, nameCultures, originPicker] = await Promise.all(
        ['plants.json', 'biomes.json', 'monsters.json', 'villagers.json', 'abilities.json', 'items.json', 'background_survivors.json', 'cell_defs.json', 'animals.json', 'recipes.json', 'books.json', 'relicEnhancements.json', 'locations.json', 'characterGen.json', 'synergies.json', 'knowledge.json', 'nameCultures.json', 'originPicker.json'].map(get));
      this.data = { plants, biomes, monsters, villagers, abilities, items, background_survivors, cellDefs, animals, recipes, books, relicEnhancements, locations, characterGen, synergies, knowledge, nameCultures, originPicker };
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
      // English for non-natives: school, media, the lingua franca. Plausible, keep.
      if (native !== 'english') {
        const r = Math.random();
        const eng = r < 0.3 ? 0 : r < 0.75 ? 1 : 2;
        if (eng) levels.english = eng;
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
      // WORK: interpreters, ESL teachers, and the like speak their claimed tongues.
      // The occupation IS the reason.
      for (const l of ((occ && occ.polyglot) || [])) {
        if (!levels[l]) {
          levels[l] = 2;
          reasons.push(`{They} learned ${langName(l)} for work — the job demanded it.`);
        }
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
        // prefer a backstory variant not yet used this expedition AND old enough to have lived
        const ubs = this._usedBackstories || new Set();
        const occKey = occ.id || occ.name || 'survivor';
        let bi = backstoryVariants.findIndex((_, i) => !ubs.has(occKey + ':' + i) && variantMinAge(backstoryVariants[i]) <= age);
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
        const quirk = pickFresh(cg.quirks, 'quirk');
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
        const char = {
          id: 'gen_' + Math.random().toString(36).slice(2, 9),
          name, formerOccupation: occ.name || 'survivor', homeRegion: origin,
          originTags: parsed.tags, heritage: this.heritageFor(parsed.tags),
          backstory, personality: { temperament, sharing, curiosity, quirk, habit, hope }, age, goal,
          abilityWeights: occ.abilityWeights || { care: 1, fieldcraft: 1, system: 1 },
          items: this.genItemCandidates(occ),
          talk, quest, kcalPerDay: (occ.kcalPerDay || 2000) + Math.floor(Math.random() * 201) - 100,
          survivalProbability: 25 + Math.floor(Math.random() * 21),
          systemAssessment: `${first} reads as ${temperament} and ${sharing} with strangers. The others find this ${temperament === 'cautious' ? 'reassuring' : temperament === 'bold' ? 'exhausting' : 'worth watching'}.`,
          secretFear, languages: langs, occupationId: occ.id || null,
          candidate: candidate !== false, pro,
        };
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


    // genItemCandidates: 8 personal items per character from class pools,
    // biased by occupation. The player picks 5. Combinations surprise.
    genItemCandidates(occ) {
      const byId = {}; (this.data.items || []).forEach(i => { byId[i.id] = i; });
      const bias = (occ && occ.itemBias) || {};
      const result = [];
      const take = (cls, n) => {
        const poolIds = (this.data.items || []).filter(i => i.class === cls && !result.includes(i.id)).map(i => i.id);
        const favored = (bias[cls] || []).filter(id => byId[id] && byId[id].class === cls && !result.includes(id));
        const rest = poolIds.filter(id => !favored.includes(id));
        // shuffle rest
        for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[rest[i], rest[j]] = [rest[j], rest[i]]; }
        const ordered = [...favored, ...rest];
        for (let k = 0; k < n && ordered.length; k++) result.push(ordered.shift());
      };
      take('tool', 2); take('weapon', 1); take('clothing', 2); take('sentimental', 2);
      // wild card: one more from anywhere but food (bonded relics aren't snacks)
      const all = (this.data.items || []).filter(i => i.class !== 'food' && !result.includes(i.id)).map(i => i.id);
      if (all.length) result.push(all[Math.floor(Math.random() * all.length)]);
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
      // 1.5 days for 12 people = 36,000 kcal. (12 * 2000 * 1.5)
      // Was 8,500. Starvation was mathematically inevitable. Fixed.
      const staples = [
        { name: 'Dried beans', rawKcal: 150, cookedKcal: 300, kcalEach: 150, units: 150, spoilDay: 9999, safe: false, kg: 0.5, needsCooking: true, unit: 'scoop' },
        { name: 'Rice', rawKcal: 200, cookedKcal: 350, kcalEach: 200, units: 120, spoilDay: 9999, safe: false, kg: 0.5, needsCooking: true, unit: 'scoop' },
        { name: 'Canned soup', kcalEach: 250, units: 70, spoilDay: 9999, safe: true, kg: 0.4, unit: 'can' },
        { name: 'Dried meat', kcalEach: 400, units: 50, spoilDay: 9999, safe: true, kg: 0.3, unit: 'strip' },
        { name: 'Peanuts', kcalEach: 170, units: 60, spoilDay: 9999, safe: true, kg: 0.1, unit: 'handful' },
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
        return { itemId: id, units: 1, kcalEach: 0, kg: 0.2, name: def.name || id,
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
      // good teacher: relevant occupation, high trust — AND words to teach with.
      // partial language: even a good teacher is reduced to pointing.
      const trust = (this.state.village.trust && this.state.village.trust[vid]) || 10;
      const isGoodTeacher = (occ.includes('cook') || occ.includes('chef') || occ.includes('hunter')) && trust > 40 && comm.level === 'full';
      const isMedicTeacher = (occ.includes('nurse') || occ.includes('medic')) && plant.medicinal && trust > 40 && comm.level === 'full';
      this.state.codex.encounters = this.state.codex.encounters || {};
      if (isGoodTeacher || isMedicTeacher) {
        // good education: instant unlock — one path
        if (this.identifyPlant(plantId, 'taught')) {
          this.say(`${this.displayName(vid)} shows you — a leaf, a picture scratched in dirt. You get it.`);
        }
      } else {
        // bad education: partial
        const enc = (this.state.codex.encounters[plantId] || 0) + 1;
        this.state.codex.encounters[plantId] = enc;
        this.say(`${this.displayName(vid)} tries to explain. "It looks... a bit like that?" You\'re not sure. (${enc} encounters)`);
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
      // steady_hands/taught_hands: fine work under pressure. Base 85% success —
      // fail and the materials are already consumed above. The woods keep them.
      const success = Math.min(1, this.modTarget('craft.success', 0.85));
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
        // 40% chance per day (if the animal is here).
        // poisoner/scarecrow: better bait, better lies. Multiplies the odds.
        const trapChance = Math.min(0.95, this.modTarget('hunt.trap_catch', 0.4));
        if (Math.random() < trapChance) {
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
        const heard = (this.state.village.gossip || []).filter(g => (g.heard || []).includes(vid));
        if (!heard.length) {
          const idle = [`"Quiet lately. Too quiet, maybe."`, `"Nothing new. Which is new, if you think about it."`, `"People are keeping to themselves."`];
          this.say(`${first}: ${idle[Math.floor(Math.random() * idle.length)]}`);
          return { ok: true, none: true };
        }
        // share the freshest gossip they've heard, with their distortion
        const g = heard[heard.length - 1];
        const neg = Object.entries(g.dims || {}).some(([k, val]) => val < -3);
        const aboutYou = true; // gossip seeded from observe() is always about player actions
        if (neg) this.say(`${first} lowers their voice. "People are saying things. About you. ...I'd watch how you act around the fire."`);
        else this.say(`${first}: "Word is you're doing right by people. Keep it up."`);
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
      return null;
    },
    // goalKnown: post-System it's displayed; pre-System it's learned via askAbout
    goalKnown(vid) {
      if (this.state.systemArrived) return true;
      return !!((this.state.village.goalsKnown || {})[vid]);
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

    getQuest() {
      // the intro: whoever found you wakes you up. A real roster member —
      // one of the 11 NPCs who gets a grid position and sticks around.
      if (this.state.questGiven) return null;
      const v = this.state.village;
      const npcIds = (v.roster || []).filter(id => id !== this.villagerId);
      if (!npcIds.length) return null;
      const giverId = npcIds[Math.floor(Math.random() * npcIds.length)];
      const giver = (v.rosterChars || {})[giverId]
        || (this.data.background_survivors || []).find(b => b.id === giverId)
        || { name: 'Someone', formerOccupation: 'survivor', homeRegion: 'somewhere', personality: {} };
      const first = String(giver.name || 'Someone').split(' ')[0];
      const occ = giver.formerOccupation || 'survivor';
      const origin = giver.homeRegion || 'somewhere';
      const key = this.wakeSpeechKey(giver);
      const templates = ((this.data.characterGen || {}).wakeUpSpeeches || {})[key]
        || ((this.data.characterGen || {}).wakeUpSpeeches || {}).overwhelmed || [];
      const lines = templates.map(t => String(t)
        .replaceAll('{first}', first).replaceAll('{occ}', occ).replaceAll('{origin}', origin));
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
        this.state.village.pantryKcal = (this.state.village.pantryKcal || 0) + kcal;
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
        this.state.village.pantryKcal = (this.state.village.pantryKcal || 0) + kcal;
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
        vw.clean += liters;
        this.say(`💧 ${first} returns with ${liters}L of clean water for the village.`);
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
            if (t && !t.visited && Math.random() < 0.5 * eff) { t.visited = true; revealed++; }
          }
        } catch (e) {}
        let find = '';
        if (Math.random() < 0.15 * eff) {
          const kcal = R(200, 500);
          this.state.village.pantryKcal = (this.state.village.pantryKcal || 0) + kcal;
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
        this.state.village.pantryKcal = (this.state.village.pantryKcal || 0) + lootKcal;
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
      const cur = v.trust[vid] || 10;
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
      this.state.scholar.dayTicks = 0; this.state.scholar.actionClock = 0; // action clock: fresh budget
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
      // PENDING VILLAGE EVENT: if something happened while you were away, they tell you.
      if (s.pendingVillageEvent) {
        const ev = s.pendingVillageEvent;
        s.pendingVillageEvent = null;
        this.say(`\U0001F4AC ${ev.title}`);
        this.say(ev.desc);
        if (ev.id === 'system_arrival_discussion') {
          this.say('Mara: "The sky just... opened. And something talked to us. It said it was sorry. SORRY for what?!"');
          this.say('Jesse: "It offered me something. A... gift? I said no. I don\'t trust gifts from the sky."');
          this.say('Aki: "..." (Aki hasn\'t spoken since it happened.)');
          this.say('The village looks to you. You\'re the scholar. You\'re supposed to know things.');
        }
      }
      const brought = s.inventory.reduce((t, i) => t + (i.units || 0) * (i.kcalEach || 0), 0);
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
        // knowledge grows: they learn what they forage. SLOWLY, like real people.
        // each day, small chance to deepen knowledge of a plant from their profile.
        if (Math.random() < 0.3) {
          this.villageLearn(village);
        }
        village.day++;
      }
      village.generated = true;
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
      const focusPlants = plants.filter(p => {
        const aff = (p.tileAffinity || []).join(' ').toLowerCase();
        if (profile.focus === 'fisher') return aff.includes('water') || aff.includes('creek') || aff.includes('wetland');
        if (profile.focus === 'farmer') return aff.includes('meadow') || aff.includes('field');
        if (profile.focus === 'forager') return aff.includes('forest') || aff.includes('grove') || aff.includes('meadow');
        return true; // scavengers know a bit of everything
      });
      const nSeed = 2 + Math.floor(Math.random() * 3); // 2-4
      for (let i = 0; i < nSeed && focusPlants.length; i++) {
        const p = focusPlants[Math.floor(Math.random() * focusPlants.length)];
        if (!profile.plants[p.id]) {
          profile.plants[p.id] = { level: 1 + Math.floor(Math.random() * 2), learnedDay: 0 }; // L1-L2
        }
      }
      // village.codex mirrors the profile for shareCodexKnowledge compatibility
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
    checkVillageProximity() {
      const px = this.map.px, py = this.map.py;
      for (const v of (this.state.otherVillages || [])) {
        const dist = Math.abs(v.x - px) + Math.abs(v.y - py);
        if (dist <= 2 && !v.generated) {
          this.catchUpSim(v);
          const prof = v.knowledgeProfile || {};
          const nPlants = Object.keys(prof.plants || {}).length;
          const focusWord = { fisher: 'fishing folk', forager: 'foragers', farmer: 'farmers', scavenger: 'scavengers' }[prof.focus] || 'survivors';
          // LIVING WORLD: their knowledge is a content unlock. What do they know that you don't?
          const yourPlants = Object.keys(this.state.codex.plants || {});
          const theirNew = Object.keys(prof.plants || {}).filter(pid => !yourPlants.includes(pid)).length;
          const knowNote = nPlants > 0 ? ` They know ${nPlants} plants${theirNew > 0 ? ` — ${theirNew} you haven't seen` : ''}.` : '';
          this.say(`You see smoke on the horizon. ${v.name} — ${v.population} people, ${v.day} days in. ${focusWord}, by the look of it.${knowNote} They've been here the whole time.`);
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
          const cells = [];
          const ornd = this.detailRand(this.detailSeed(x, y) + 4242);
          for (let cy = 0; cy < 9; cy++) {
            const row = [];
            for (let cx = 0; cx < 9; cx++) {
              // lodge footprint: rows 0-1, cols 3-5
              if (cy <= 1 && cx >= 3 && cx <= 5) { row.push('lodge'); continue; }
              const r = ornd();
              row.push(r < 0.15 ? 'tent' : r < 0.25 ? 'fire' : r < 0.5 ? 'dirt' : 'grass');
            }
            cells.push(row);
          }
          // clear the lodge doorstep: walkable ground at (4,2)
          cells[2][4] = 'dirt';
          // fire pit near the lodge, not blocking
          cells[2][2] = 'fire';
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
      // SPAWN SAFETY: travelTo drops you at (4,4). on creek tiles the river/channel
      // could leave you standing on a walkable cell ringed by water — stuck, turn one.
      // guarantee (4,4) is walkable and at least one orthogonal neighbor is too.
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
      const wood = big ? 4 + Math.floor(Math.random() * 3) : 2 + Math.floor(Math.random() * 3);
      this.addWood(wood);
      // The tree is gone. The tile remembers.
      detail[cy][cx] = 'dirt';
      const key = cx + ',' + cy;
      if (t.secrets) delete t.secrets[key];
      if (t.modifiers) delete t.modifiers[key];
      // stock recount: one less forageable
      if (t.stock > 0) t.stock--;
      this.say(`${big ? 'The big tree' : 'The tree'} comes down with a crack that echoes. +${wood} wood. The ground is clear now.`);
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
      if (!bf) return false;
      if (bf.type === 'fallen_tree') {
        this.state.scholar.kcal = Math.max(0, this.state.scholar.kcal - 60);
        this.addWood(2);
        this.say('You cut through the fallen tree. +2 wood. The path is clear.');
      } else if (bf.type === 'rubble') {
        this.state.scholar.kcal = Math.max(0, this.state.scholar.kcal - 40);
        this.say('You clear the rubble, stone by stone. The path is clear.');
      } else if (bf.type === 'washed_out') {
        return this.buildBridge(x, y); // washed out needs a bridge
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
      this.say('You push through the doors into open air. Haven grounds — tents, a fire pit, worn paths. The world is that way.');
      return true;
    },
    enterBuilding() {
      const s = this.state.scholar;
      s.insideHaven = true;
      const t = this.tileAt(this.map.px, this.map.py);
      if (t && t.type === 'haven') t.detail = null;
      // you step into the hall, just inside the doors
      s.mx = 4; s.my = 7; s.facing = { x: 0, y: -1 };
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
        if (block) return block;
      }
      const odx = Math.sign(x - this.map.px), ody = Math.sign(y - this.map.py);
      this.map.px = x; this.map.py = y;
      this.state.scholar.facing = { x: odx || 0, y: ody || 1 };
      this.reveal(x, y);
      const tile = this.playerTile();
      // RELIC — weatherproof: the garment shrugs off weather. Cheaper travel.
      const travelKcalMult = S.modifiers.resolve(1, 'travel.kcal', S.modifiers.collectModifiers(this.state.scholar, this.data.abilities), {});
      this.state.scholar.kcal -= Math.round(30 * t.d * travelKcalMult); // distance has a metabolic price
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
      // arrive at the center of the new tile's detail grid. you're IN the world now.
      this.state.scholar.mx = 4; this.state.scholar.my = 4;
      // traveling means you're outside. (Arriving at Haven puts you on the grounds —
      // tap the lodge to go back inside.)
      this.state.scholar.insideHaven = false;
      const ht = this.tileAt(3, 3);
      if (ht && ht.type === 'haven') ht.detail = null;
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
      // ACTION CLOCK: node travel = 32 ticks (a "bigger tick"). Same unified clock
      // as everything else: NPC batch + day timer advance proportionally.
      this.tickAction(this.TIME.TRAVEL_TICKS);
      try { this.tickNeeds(); } catch (e) {}
      try { this.spreadGossip(); } catch (e) {}
      // travel is tiring: small energy cost
      this.state.scholar.energy = Math.max(0, this.state.scholar.energy - 2);
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
      const aname = (adef.name || 'animal').toLowerCase();
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
          if (Math.random() < 0.5) this.say(`The ${aname} freezes — ears up, deciding about you.`);
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
      return name.includes('first aid') || name.includes('bandage') || name.includes('medicine');
    },

    // useItem: use it. First aid heals.
    useItem(idx) {
      const item = this.state.scholar.inventory[idx];
      if (!item || !this.isUsable(item)) return null;
      // RELIC BOND: you'd never use that up. It's yours.
      if (item.bonded) { this.say(`You'd never use up your ${item.name}. It's not a supply. It's yours.`); return null; }
      const name = item.name.toLowerCase();
      if (name.includes('first aid')) {
        // triage: healing hands. First aid does more.
        const amt = Math.round(this.modTarget('healing.amount', 30));
        this.state.scholar.health = Math.min(this.maxHealth(), this.state.scholar.health + amt);
        this.say(`You use the first aid kit. +${amt} health.`);
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
      // ACTION CLOCK: committed walk = 1 tick per square (+10 kcal/square effort, above).
      this.tickAction(path.length);
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
      // water cost: 1L per unit (camp_cook discounts: L1 half, L2 none).
      const cookLvl1 = this.abilityLevel('camp_cook');
      const waterMult1 = cookLvl1 >= 2 ? 0 : cookLvl1 >= 1 ? 0.5 : 1;
      const kcalMult1 = cookLvl1 >= 3 ? 1.25 : cookLvl1 >= 1 ? 1.1 : 1.0;
      const water = this.state.village.water || { clean: 0 };
      const units = item.units || 1;
      const cost1 = Math.ceil(units * waterMult1);
      if (item.needsCooking && water.clean < cost1) {
        this.say(`Need ${cost1}L clean water to cook ${item.name}.`);
        return null;
      }
      if (item.needsCooking) water.clean -= cost1;
      // cook it: rawKcal -> kcalEach (cooked)
      item.kcalEach = Math.round((item.cookedKcal || item.rawKcal * 1.5) * kcalMult1);
      item.rawKcal = null; // it's cooked now
      item.safe = true; // cooking kills the risk (mostly)
      this.say(`Cooked ${item.name}. ${item.kcalEach} kcal now${item.needsCooking && cost1 > 0 ? ` (-${cost1}L water)` : ''}.`);
      // ACTION CLOCK: cooking = 1 chunk (32 ticks, tending the fire).
      this.tickAction(32);
      return null;
    },

    // drinkWater: drink from a water source. Hydrates.
    // fillWater: fill ONE bottle (1L). Quality depends on source.
    // Creek water is risky (unknown). Haven well is clean.
    fillWater() {
      const s = this.state.scholar;
      s.water = s.water || [];
      // HAULING WATER IS WORK. 10 kcal per liter. (nothing is free)
      s.kcal = Math.max(0, (s.kcal || 0) - 10);
      // Where are you? Creek = risky, Haven = clean.
      const t = this.playerTile();
      const isCreek = t && t.type === 'creek';
      const quality = isCreek ? 'risky' : 'clean';
      const source = isCreek ? 'Creek (unknown)' : 'Haven well';
      s.water.push({ liters: 1, quality, source });
      this.say(`Filled 1L (${quality} — ${source}). ${s.water.length}L carried (${s.water.length}kg).`);
      // ACTION CLOCK: filling a bottle = 1 tick.
      this.tickAction(1);
      return null;
    },
    // fillWaterFromVillage: at Haven, draw from the village supply into your pack.
    // The village well is the reason Haven is where it is.
    fillWaterFromVillage() {
      const v = this.state.village;
      if (!v || !v.water || v.water.clean < 1) { this.say('The well is dry. Find water out there.'); return null; }
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
      // ACTION CLOCK: a drink is 1 tick (time-only — drinking costs no effort).
      this.tickAction(1);
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
      s.hydration = Math.min(100, (s.hydration || 0) + 50);
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
      // camp_cook: L1 half water + 10% kcal, L2 no water, L3 +25% kcal.
      const cookLvl = this.abilityLevel('camp_cook');
      const waterMult = cookLvl >= 2 ? 0 : cookLvl >= 1 ? 0.5 : 1;
      const kcalMult = cookLvl >= 3 ? 1.25 : cookLvl >= 1 ? 1.1 : 1.0;
      let n = 0, waterUsed = 0;
      for (const item of (this.state.scholar.inventory || [])) {
        if (item.rawKcal) {
          // needs water? 1L per UNIT (5 beans = 5L), discounted by camp_cook.
          const needsWater = item.needsCooking; // beans, rice
          const units = item.units || 1;
          const cost = Math.ceil(units * waterMult);
          if (needsWater && water.clean < cost) {
            this.say(`Not enough clean water to cook ${item.name}. Need ${cost}L, have ${Math.floor(water.clean)}.`);
            continue;
          }
          if (needsWater) { water.clean -= cost; waterUsed += cost; }
          // RELIC — impossible_edge: physics-defying prep. +10% cooked kcal.
          const relicCook = S.modifiers.resolve(1, 'cook.kcal', S.modifiers.collectModifiers(this.state.scholar, this.data.abilities), {});
          item.kcalEach = Math.round((item.cookedKcal || item.rawKcal * 1.5) * kcalMult * relicCook);
          item.rawKcal = null;
          item.safe = true;
          n++;
        }
      }
      this.say(n ? `Cooked ${n} item${n > 1 ? 's' : ''}${waterUsed ? ` (-${waterUsed}L water)` : ''}.` : 'Nothing raw to cook.');
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
      // Strength: integration makes you tougher (System upgrades your body).
      const integ = s.integration || 5;
      if (integ >= 60) cap += 5; // System-enhanced musculature
      return cap;
    },

    // takeFromPantryBulk: pack multiple items at once (slider UI).
    // selections: {idx: qty}. Respects weight, applies trust cost once.
    takeFromPantryBulk(selections) {
      const pantry = this.state.village.pantry || [];
      const v = this.state.village;
      let totalKcal = 0, totalKg = 0, totalUnits = 0;
      const taken = [];
      for (const [key, qty] of Object.entries(selections)) {
        // WATER: drawn from the village well, not the pantry shelves. Same UI, same pack.
        if (key === 'water') {
          const q = Math.min(qty, (v.water && v.water.clean) || 0);
          if (q <= 0) continue;
          const carry = (this.state.scholar.inventory || []).reduce((t, i) => t + (i.kg || 0) * (i.units || 1), 0) + this.waterWeight() + totalKg;
          const max = this.carryCapacity();
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
        const carry = (this.state.scholar.inventory || []).reduce((t, i) => t + (i.kg || 0) * (i.units || 1), 0) + this.waterWeight() + totalKg;
        const max = this.carryCapacity();
        const canTake = Math.min(q, Math.floor((max - carry) / (item.kg || 0.1)));
        if (canTake <= 0) { this.say(`Too heavy for more ${item.name}.`); continue; }
        item.units -= canTake;
        if (item.units <= 0) pantry.splice(pantry.indexOf(item), 1);
        // merge into inventory
        const inv = this.state.scholar.inventory;
        const existing = inv.find(i => i.name === item.name);
        if (existing) existing.units += canTake;
        else inv.push({ name: item.name, kcalEach: item.kcalEach, units: canTake, spoilDay: item.spoilDay, safe: item.safe, kg: item.kg, unit: item.unit || 'item', rawKcal: item.rawKcal, cookedKcal: item.cookedKcal, needsCooking: item.needsCooking });
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
      this.say(`Packed: ${taken.join(', ')}. (${this.fmtKcal(totalKcal)}, ${totalKg.toFixed(1)} kg)`);
      return null;
    },
    // takeFromPantry: pack food before going out. Weight matters.
    // SELFISHNESS HAS A COST: taking without contributing lowers trust.
    // The village notices who gives and who takes.
    takeFromPantry(idx) {
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

    huntAnimal() {
      const s = this.state.scholar;
      const a = s.animal;
      if (!a) return null;
      if (s.week1) s.week1.hunt++;
      this.gainAbilityXP('tracker', 1);
      const px = s.mx ?? 4, py = s.my ?? 4;
      const dist = Math.max(Math.abs(a.mx - px), Math.abs(a.my - py));
      if (dist > 1) { this.say('Too far. Get closer.'); return null; }
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
      // find passable cells: anything that doesn't block movement.
      // (was: only excluded 'wall' — villagers spawned on fire/tents/trees.)
      const free = [];
      for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
        const c = detail[cy] && detail[cy][cx];
        if (c && !this.cellProps(c).blocks && !(cx === 4 && cy === 4)) free.push({x: cx, y: cy});
      }
      for (const rid of (v.roster || [])) {
        if (rid === this.villagerId) continue; // you're the player, not an NPC
        if (!free.length) break;
        const idx = Math.floor(Math.random() * free.length);
        const pos = free.splice(idx, 1)[0];
        v.positions[rid] = { mx: pos.x, my: pos.y };
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

    // ============ GOALS ============
    npcGoal(vid) {
      const v = (this.data.villagers || []).find(x => x.id === vid)
        || (this.data.background_survivors || []).find(x => x.id === vid) || {};
      if (v.goal) return v.goal;
      return (this.state.village.bgGoals || {})[vid] || null;
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
          if (!isTarget && (goal === 'lead' || goal === 'survive' || temp === 'cautious')) dims.honest = -3; // what's she after?
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
    },
    // talkReason: why THEY want to talk to YOU. Villagers initiate because
    // they heard something, want something, or are worried.
    talkReason(rid) {
      const v = this.state.village;
      const d = this.displayName(rid);
      for (const g of (v.gossip || [])) {
        if (!g.heard.includes(rid)) continue;
        const neg = Object.entries(g.dims).some(([k, val]) => val < -3);
        if (neg && Math.random() < 0.6) {
          return { line: `"Can we talk?" ${d} glances around first. "People are saying things. About you. Is any of it true?"` };
        }
      }
      const goal = this.npcGoal(rid);
      const pantryLow = (v.pantryKcal || 0) < 4000;
      const roll = Math.random();
      if (goal === 'prove' && roll < 0.5) return { line: `"Can we talk?" ${d} shifts their weight. "I need something to do. Anything. Please."` };
      if (goal === 'alone' && roll < 0.4) return { line: `"Can we talk?" ${d} sighs. "I need some space. A corner nobody needs me in. Is that okay?"` };
      if (goal === 'family' && roll < 0.4) return { line: `"Can we talk? Have you seen anyone on the roads? Anyone at all? I'm asking everyone."` };
      if (goal === 'lead' && (v.heat || {})[rid] > 0 && roll < 0.5) return { line: `"Can we talk?" ${d} doesn't wait for an answer. "We need to discuss how things are run here."` };
      if (pantryLow && roll < 0.35) return { line: `"Can we talk?" ${d} keeps their voice low. "The stores. Have you looked at the stores? We're running thin."` };
      if (roll < 0.25) return { line: `"Can we talk?" ${d} sits down near you. "Just... talk. Like people used to."` };
      return null;
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
    // fillTalkLine: shared dialogue data carries {first}/{occ}/{origin}/{skill}.
    fillTalkLine(line, v) {
      const first = ((v && v.name) || 'Someone').split(' ')[0];
      return String(line).replaceAll('{first}', first)
        .replaceAll('{occ}', (v && v.formerOccupation) || 'survivor')
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
    villageEvent(type) {
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
    // villagerInitiative: they come to YOU. wants with legs.
    // one initiative per day part max — they're people, not popups.
    villagerInitiative() {
      const v = this.state.village;
      if (this.map.px !== 3 || this.map.py !== 3 || !v.positions) return;
      const partKey = this.state.scholar.day + ':' + this.dayPart;
      if (v.lastInitPart === partKey) return;
      const px = this.state.scholar.mx ?? 4, py = this.state.scholar.my ?? 4;
      const order = (v.roster || []).filter(rid => rid !== this.villagerId && v.positions[rid]);
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
            const detail = this.genDetail(3, 3);
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
            v.talkRequests[rid] = { line: reason.line };
            this.say(reason.line + ` (Talk to ${this.displayName(rid)}.)`);
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
            v.pantryKcal = (v.pantryKcal || 0) + 150;
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
        v.pantryKcal = (v.pantryKcal || 0) + 100;
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
    // Cost guide (ticks): 1 = step, glance, sip, bite, handoff.
    // 2 = a conversation. 3 = a lesson. 32 (1 chunk) = clear brush, boil water,
    // travel a node. 64-96 (2-3 chunks) = forage, fell a tree, build.
    // 128 = a full day-part of sustained work (rest, wait out the part).
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
      // only the node you're on has a live grid
      const detail = this.genDetail(this.map.px, this.map.py);
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
      return 'ground';
    },
    // sleepPreview: for the UI — show cost/benefit before committing.
    sleepPreview() {
      const q = this.sleepQuality();
      return {
        quality: q,
        heal: { bunk: 35, tent: 25, hall: 20, ground: 12 }[q] || 12,
        name: { bunk: 'a bunk', tent: 'a tent', hall: 'the hall floor', ground: 'the cold ground' }[q] || 'the ground',
        note: { bunk: 'Best rest. Deep sleep, real healing.', tent: 'Sheltered. Decent rest.', hall: 'By the fire. Good enough.', ground: 'Exposed. You\'ll wake stiff.' }[q] || '',
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
      s.health = Math.min(this.maxHealth(), Math.round(s.health || 0) + prev.heal);
      s.energy = 100;
      const rested = prev.quality === 'bunk' ? 'deeply rested' : prev.quality === 'ground' ? 'stiff and cold' : 'rested';
      this.say(`Dawn. You wake ${rested}. (+${prev.heal} health, energy restored.${conservedNote} ${prev.note})`);
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
        // TERRAFORMING: trees can be felled. costs a day-part, yields wood.
        if (cell === 'tree' || cell === 'bigtree') actions.push('Cut down');
      } else if (cell === 'water') {
        actions.push('Drink');
        actions.push('Fill water (+2L)');
      } else if (cell === 'plant' || cell === 'bush' || cell === 'rubble') {
        actions.push('Forage');
        // TERRAFORMING: brush can be cleared. costs a day-part, yields brushwood.
        if (cell === 'bush') actions.push('Clear brush');
      } else if (cell === 'fire') {
        actions.push('Warm hands');
        // If you have raw food, you can cook here. (Knowledge tells you what needs it.)
        const raw = (this.state.scholar.inventory || []).filter(i => i.rawKcal);
        if (raw.length) actions.push(`Cook (${raw.length} raw)`);
      } else if (cell === 'door') {
        // DOORS ARE REAL. This is how you leave the building.
        actions.push('Step outside');
      } else if (cell === 'lodge') {
        actions.push('Go inside');
      } else if (cell === 'bunk') {
        actions.push('Rest');
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

    // ============ ALIVE: monsters are animals (alien ones) ============
    // Ambiguity first: you don't know what it is until you've learned it.
    // "Is that a deer or a Highbeam Deer? You don't want to get close enough
    // to find out." The descriptor system covers beasts too.
    monsterKnown(mid) {
      const st = (this.state.codex.monsters || {})[mid];
      return st && (st.stage === 'observed' || st.stage === 'slain');
    },
    monsterDesc(mid) {
      const mdef = (this.data.monsters || []).find(m => m.id === mid);
      if (!mdef) return 'something';
      if (this.monsterKnown(mid)) return mdef.name;
      return mdef.unknown || 'something moving';
    },
    identifyMonster(mid) {
      // surviving an encounter teaches you what it was. knowledge is earned.
      if (this.monsterKnown(mid)) return;
      const mdef = (this.data.monsters || []).find(m => m.id === mid);
      if (!mdef) return;
      this.state.codex.monsters = this.state.codex.monsters || {};
      this.state.codex.monsters[mid] = { stage: 'observed' };
      this.say(`Now you know what that was: ${mdef.name}. ${mdef.vibe || ''} The ${this.journalName()} keeps it.`);
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
            if (m.watchTurns >= 3) {
              if (Math.random() < 0.5) {
                s.monster = null;
                this.say('It watches a moment longer — then drifts away. Not interested. This time.');
              } else {
                m.stance = 'hungry'; m.watchTurns = 0;
                const w = this.monsterCue(m.id, 'warn'); if (w) this.say(w); else this.say('Its posture changes. Curiosity is over.');
              }
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
          const dx = Math.sign(px - m.mx), dy = Math.sign(py - m.my);
          if (dist < 3) { mv(-dx, 0); mv(0, -dy); }       // too close: back off
          else if (dist > 5) { stepToward(); }              // too far: drift in
          else { mv(-dy, dx) || mv(dy, -dx); }              // circle
          if (Math.random() < 0.1) { s.monster = null; this.say('It decides you\'re not worth it. Gone.'); }
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
        scholar.monster = { id: mdef.id, x: Math.max(0, Math.min(8, mx)), y: Math.max(0, Math.min(8, my)) };
        // AMBIGUITY: you don't know what it is. not yet.
        this.say(this.monsterKnown(mdef.id) ? `A ${mdef.name} is here.` : `Something moves out there — ${mdef.unknown || 'big, and wrong'}.`);
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
        this.wanderer = null;
      }
    },

    // SLICE 2: THE SYSTEM ARRIVES (day 7).
    // The aliens finally notice they forgot survival basics.
    // Interface shifts: journal -> game overlay. Abilities unlock.
    // Timed events: challenges, new monsters, world-building drama.
    checkSystemArrival() {
      const s = this.state.scholar;
      if (s.day >= 7 && !this.state.systemArrived) {
        this.state.systemArrived = true;
        // DRAMA: the sky changes. This is a REALITY SHOW. You're contestants.
        // The System is a cheerful game-show host. It has an audience.
        // It studied humanity exhaustively and got everything spiritually wrong.
        // It doesn't understand why you're upset about food. Food is... a detail.
        this.say('\U0001F31F THE SKY SPLITS OPEN.');
        this.say('Not with light. With... interface. Windows. Text. Numbers. Scrolling across the clouds.');
        this.say('A voice in your head — bright, enthusiastic, utterly alien:');
        this.say('"HELLO! Welcome! We\'re SO glad you\'re all still here! What a week! The audience LOVED the foraging episode!"');
        this.say('"So! You\'ve probably been wondering where we\'ve been! We\'ve been CALIBRATING! Getting the cameras focused! Learning your faces! A week of calibration! Very thorough! Very boring for us!"');
        this.say('"And YOU — you\'ve been WONDERFUL. Every berry picked! Every fire lit! Every clever little snare! That was your SIGNATURE. You signed up by DOING THINGS. Consent via competence! Our lawyers love it!"');
        this.say('"Okay! So! Here\'s what\'s happening! You\'re on a show! It\'s called... we haven\'t named it yet! We\'re taking suggestions!"');
        this.say('"The rules are simple! Survive! Be interesting! The audience votes with their attention! The more they watch, the more gifts we give you!"');
        this.say('"Oh! Quick note! Some of you... just sat in the haven? All week? Did nothing? The audience got BORED. So we removed them. Poor sportsmanship! Low entertainment value! No hard feelings! (There were hard feelings. Briefly. Then there was nothing.)"');
        this.say('"But YOU! You have FANS now! Sponsors! Gamblers! They\'re putting their own snacks on you! They\'re not betting on your survival — oh no, anyone can survive — they\'re betting on your UNDERSTANDING! Every time you figure something out, every little ah-ha moment, the odds shift! Keep learning, little one! The market LOVES a learner!"');
        this.say('"Oh! And we noticed some of you are... hungry? Is that the word? The small unhappy tummy feeling? We\'ll look into that! Probably! Anyway!"');
        this.say('Your journal shimmers. The handwriting dissolves. Crisp text. Icons. Progress bars. Quests. Abilities. Stats.');
        this.say('It doesn\'t replace your survival gear. It just... covers part of it. Like someone put a sticker over your hunger. The hunger is still there. The sticker is very shiny.');
        this.say('You feel it behind your eyes. Not painful. Just there. Like a second heartbeat. Like being watched.');
        s.abilities = s.abilities || [];
        s.systemQuests = [];
        s.abilityChoices = this.firstAbilityChoices();
        const w1 = s.week1 || {};
        const didAnything = (w1.forage || 0) + (w1.hunt || 0) + (w1.talk || 0) + (w1.cook || 0) + (w1.donate || 0) + (w1.scavenge || 0) > 0;
        if (didAnything) {
          this.say('\U0001F381 "We watched your first week! You\'re good at... let us see..." (Choose an ability.)');
        } else {
          this.say('\U0001F381 "Ooh! A quiet one! You did juust enough to stay interesting! The audience was ALMOST bored! Almost! Here — a little something for existing NEAR the action!" (Choose an ability.)');
        }
        // AFTERTHOUGHT: the System suddenly remembers the journal.
        // "Oh! Oh! We almost forgot! You were writing things down! We made it better!"
        this.say('\U0001F4D6 "OH! Wait! We almost forgot! You were writing things down! In the little paper! We LOVE the paper! We made it better! It talks now! It remembers EVERYTHING!"');
        this.say('Your journal shimmers. The handwriting doesn\'t disappear — it gets... absorbed. The Codex has your notes. All of them. Even the smudged ones. Especially the smudged ones.');
        // DIAL UPGRADE: the System "improves" even your sense of time.
        // Your hand-drawn circle glitches — and something colder takes its place.
        this.say('🕐 "OH! And your little time-sense! The hand-drawn circle! Adorable! We UPGRADED it! It\'s exact now! Ticks! Numbers! You\'re welcome!"');
        this.say('Your sense of the day shimmers — and something colder, more precise, takes its place.');
        this.state.dialGlitch = true;
        this.say('"We kept the smudges! They\'re charming! You\'re welcome!"');
        s.codexUnlocked = true;
        // THE OVERLAY: names, health bars, stats. The System doesn't ask —
        // it labels. Everyone you've met is suddenly tagged. It feels invasive
        // next to the names you earned by talking and listening.
        const village = this.state.village;
        village.knownNames = village.knownNames || {};
        for (const vid of (village.roster || [])) village.knownNames[vid] = true;
        // UNHINGED TUTORIAL: 3-4 lines, then you're on your own.
        this.say('"OH WAIT. Your EYES. We haven\'t fixed your eyes yet! Hold still —"');
        this.say('Something clicks behind your vision. Names. Floating over heads. Little bars. The System labeled everyone while you blinked.');
        this.say('"LOOK! You can SEE their HEALTH now! Isn\'t that NEAT?! Green means GO! Red means... oh, you know what red means! It\'s very intuitive!"');
        this.say('"We gave you EVERYONE\'S name! Even the ones you never talked to! No need to thank us! (Please thank us. The audience loves gratitude.)"');
        this.say('It feels invasive. The names you learned yourself — by talking, by listening — those felt earned. These just... appeared.');
        // WAVE 2: the System escalates. The calibration fauna was just the opener.
        // "Oh, you survived those? Let's try THESE."
        this.say('\U0001F43E "OH! One more thing! The animals! The ones from last week — the charging ones, the humming ones, the glowy ones? Those were CALIBRATION fauna! First drafts! The audience has NOTES!"');
        this.say('"So we made BETTER ones! Advanced fauna! They\'re smarter! They\'re scarier! One of them does PERFORMANCE REVIEWS! The audience is going to LOVE the performance reviews!"');
        this.say('"Don\'t worry! The old ones are still out there! We didn\'t remove anything! The ecosystem is just... richer now! More DIVERSE! More DANGEROUS! You\'re welcome!"');
        this.say('Somewhere in the treeline, something new is crying in a voice you almost recognize.');
        this.scheduleSystemEvents();
        // If you're NOT at Haven, the village talks about it without you.
        // When you return, they'll tell you what happened. (Drama: you missed it.)
        const atHaven = this.map && this.map.px === this.state.village.px && this.map.py === this.state.village.py;
        if (!atHaven) {
          s.pendingVillageEvent = {
            id: 'system_arrival_discussion',
            title: 'The village saw the sky split.',
            desc: 'You were out when it happened. When you return, everyone\'s talking at once. Mara\'s crying. Jesse\'s laughing. Aki hasn\'t said a word.',
          };
          this.say('(You\'re not at Haven. The village is experiencing this without you. Return to hear what happened.)');
        } else {
          // You were there. Witness it together.
          this.say('\U0001F9D1\u200d\U0001F91d\U0001F9D1\u200d\U0001F91d The village gathers. Everyone\'s journal is changing. Everyone hears the voice. Mara grabs your arm. "Tell me you hear that too."');
        }
      }
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
      if (has('echo_location')) out.push({ id: 'echo_location', target: 'none', name: 'Echo-locate', desc: 'Clap once: sense the 3x3 around you. 1/day.', available: s.echoDay !== s.day, why: 'Used today.' });
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
      } else if (id === 'compost_king') {
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
        this.say('\U0001F4E2 SYSTEM CHALLENGE: "Catch something! Anything! We want to see how you do it!" (Hunt an animal today for a reward.)');
        this.state.scholar.activeChallenge = { id: 'first_hunt', desc: 'Hunt an animal', reward: 'Ability point' };
      } else if (ev.id === 'stranger') {
        this.say('\U0001F6B6 A stranger walks into Haven. They\'re thin, scared, and carrying nothing. "Please," they say. "I heard you have food." (Drama: do you share?)');
        // mediator: peace is a skill. You talk the village through it.
        if (this.hasAbility('mediator')) {
          const bonus = Math.round(this.modTarget('drama.resolve_bonus', 8));
          const v = this.state.village; v.trust = v.trust || {};
          for (const vid of Object.keys(v.trust)) v.trust[vid] = Math.min(100, (v.trust[vid] || 15) + bonus);
          this.say(`You sit everyone down. You listen. Nobody yells. (mediator: village trust +${bonus})`);
          this.noteAbilityUse('mediator');
        }
      } else if (ev.id === 'hushwolf_pack') {
        this.say('\U0001F43A HOWLS in the distance. Closer than before. The System chirps: "Oh! We made those! Are they... too many? We can make fewer?" (New monster: hushwolf pack.)');
      } else if (ev.id === 'system_task') {
        this.say('\U0001F4DC SYSTEM QUEST: "We\'ve been thinking. You know things we don\'t. Teach us? Bring us a plant you\'ve fully identified (Codex L3)."');
        this.state.scholar.activeQuest = { id: 'system_task', desc: 'Bring a fully-identified plant (L3) to the System' };
      }
    },

    // CODEX NETWORKING: codexes talk within friendly organizations.
    // KNOWLEDGE HAS TWO PARTS:
    // - IDENTIFICATION (what is it?) — shareable. L1/L2.
    // - SKILL (how do YOU use it?) — personal practice. But a good teacher accelerates it.
    // L3 CAN be shared, but only if the teacher actually knows it deeply.
    // (A medic who knows willow bark treats pain? They'll tell you. Most won't know.)
    shareCodexKnowledge(villageId) {
      const v = (this.state.otherVillages || []).find(x => x.id === villageId);
      if (!v || !v.codex) return null;
      const trust = v.trust || 0;
      if (trust < 30) {
        this.say(`${v.name} doesn't share their knowledge yet. (Trust ${trust}/100.)`);
        return null;
      }
      const theirPlants = v.codex.plants || {};
      let shared = 0, deepShared = 0;
      for (const [pid, theirEntry] of Object.entries(theirPlants)) {
        const plant = this.data.plants.find(p => p.id === pid);
        const isCommon = plant && (plant.rarity || 'common') === 'common';
        // Trust gates BREADTH: 30-60 = common only, 60+ = anything.
        if (trust < 60 && !isCommon) continue;
        if (!this.state.codex.plants[pid]) {
          // They know L3 deeply? (Medicinal experts, etc.) They can share it.
          // But it's rare — most villagers don't have L3.
          const theyKnowDeep = theirEntry.level >= 3;
          const shareLevel = theyKnowDeep && trust >= 70 ? 3 : trust >= 60 ? 2 : 1;
          this.state.codex.plants[pid] = {
            identifiedDay: this.state.scholar.day,
            level: shareLevel,
            harvests: 0, tastings: 0,
            viaShare: villageId,
            // SKILL component: shared knowledge gives you a head start, not mastery.
            // You still need to USE it to truly know it. (XP to next level is halved.)
            sharedHeadStart: true,
          };
          shared++;
          if (shareLevel >= 3) deepShared++;
        }
      }
      if (shared > 0) {
        this.say(`\U0001F4D6 ${v.name} shares ${shared} plant${shared > 1 ? 's' : ''}.${deepShared ? ` (${deepShared} with deep medicinal knowledge!)` : ''} You have a head start, but skill comes from doing.`);
      } else {
        this.say(`${v.name} has nothing new to share.`);
      }
      return null;
    },

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
        // origin tags (parsed from your typed origin) vs plant region tags.
        // Arizona -> Georgia creek: almost nothing is local. The game feels it.
        const originTags = ((villager && villager.originTags) || this.parseOrigin(homeRegion).tags).map(t => String(t).toLowerCase());
        const plantRegions = (plant.regions || []).map(x => String(x).toLowerCase());
        const tagLocal = plantRegions.some(pr => originTags.includes(pr));
        const legacyLocal = plantRegions.some(pr => homeRegion.includes(pr) || pr.includes(homeRegion.split(' ')[0]));
        const isLocal = tagLocal || legacyLocal;
        const occupation = (villager && villager.formerOccupation || '').toLowerCase();
        // learning threshold: how many encounters to learn the name.
        // forage_identification: you've done this before. Learn faster.
        let threshold = Math.max(1, Math.round(this.modTarget('forage.learn_threshold', 3)));
        if (occupation.includes('hunter') || occupation.includes('cook') || occupation.includes('chef')) threshold = 2;
        if (occupation.includes('nurse') && plant.medicinal) threshold = 2;
        if (occupation.includes('bus driver') || occupation.includes('accountant') || occupation.includes('dropout')) threshold = 4;
        this.state.codex.encounters = this.state.codex.encounters || {};
        const enc = this.state.codex.encounters[r.plantId] || 0;
        // regional familiarity: start at 1 if it's from home
        const newEnc = enc === 0 && isLocal ? 1 : enc + 1;
        this.state.codex.encounters[r.plantId] = newEnc;
        const learned = newEnc >= threshold;
        // remember the threshold so the Codex UI can show encounter progress
        this.state.codex.learnThreshold = this.state.codex.learnThreshold || {};
        if (!this.state.codex.learnThreshold[r.plantId]) this.state.codex.learnThreshold[r.plantId] = threshold;
        if (learned && !this.plantKnown(r.plantId)) {
          // LEVEL 1: Named. One path — the identification event.
          this.identifyPlant(r.plantId, 'observation');
        } else if (learned && this.state.codex.plants[r.plantId]) {
          // LEVEL 2: Parts. Harvest 5 more times, you notice the parts.
          // Later you realize: roots AND leaves AND petals. Yield increases.
          const entry = this.state.codex.plants[r.plantId];
          entry.harvests = (entry.harvests || 0) + 1;
          if (entry.level === 1 && entry.harvests >= 5) {
            entry.level = 2;
            this.say(`\u2605 Deeper knowledge: ${plant.name}. ${plant.knowledgeLevels['2']} (Yield +50%)`);
          }
          // LEVEL 4: Mastery. Long use teaches timing — roots in fall, leaves in spring.
          if (entry.level === 3 && entry.harvests >= 15) {
            entry.level = 4;
            this.say(`\u2605\u2605 MASTERY: ${plant.name}. ${plant.knowledgeLevels['4']} (Yield 2x)`);
            this.say('SYSTEM: You know this plant the way it knows itself. Concerning. Impressive.');
          }
        } else if (!learned) {
          // progressive: description, not name
          const stage = newEnc === 1 ? plant.description || 'a plant you don\'t recognize' :
                        `looks familiar — like the ${plant.description || 'plant'} from before`;
          this.say(`You take ${stage}. Not sure what it is yet. (${newEnc}/${threshold})`);
        }
        // squirrel_friend: sometimes they leave you nuts. Random gifts, real food.
        const giftChance = this.modTarget('forage.gift_chance', 0);
        if (giftChance > 0 && Math.random() < giftChance) {
          scholar.inventory.push({ plantId: 'gift_nuts', units: 2, kcalEach: 100, spoilDay: scholar.day + 5, name: 'Squirrel gift (nuts)', unit: 'handful', prep: 'A squirrel left these. A tip? A bribe? Nuts.', kg: 0.2 });
          this.say('A squirrel drops nuts at your feet and vanishes. A gift. (squirrel_friend: +200 kcal)');
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
          else if (!isNew) this.say(`Journal updated: ${this.plantDisplayName(r.plantId)} grows here too — better than ${this.plantDisplayName(prevBest.id).toLowerCase()}.`);
        }
        // KNOWLEDGE = YIELD. Level 2 (parts) gives 50% more. You know what to take.
        const entry = this.state.codex.plants[r.plantId];
        const levelMult = !entry ? 1.0 : entry.level >= 4 ? 2.0 : entry.level >= 2 ? 1.5 : 1.0;
        // green_thumb: the System's gift. L1 +50%, L2 +100%.
        const thumbLvl = this.abilityLevel('green_thumb');
        const thumbMult = thumbLvl >= 2 ? 2.0 : thumbLvl >= 1 ? 1.5 : 1.0;
        const finalUnits = Math.ceil(r.units * levelMult * thumbMult);
        const isKnown = this.plantKnown(r.plantId);
        const invItem = { plantId: r.plantId, units: finalUnits, kcalEach: r.plant.caloriesPerUnit, spoilDay: scholar.day + (r.plant.spoilageDays || 2), name: isKnown ? r.plant.name : (r.plant.description || 'unfamiliar plant'), unit: r.plant.unit, kg: 0.1 };
        if (isKnown && r.plant.preparation) invItem.prep = r.plant.preparation;
        scholar.inventory.push(invItem);
        // RELIC BOND: tools cut, clothing kept you moving.
        this.noteToolUse(); this.noteTrailUse();
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
        // pattern_recognition: the rare find goes in the pack.
        if (r.rareFind) {
          scholar.inventory.push({ plantId: r.rareFind.plantId, units: 1, kcalEach: r.rareFind.kcal, spoilDay: scholar.day + 4, name: 'Rare herb patch', unit: 'bundle', prep: 'Potent. The Codex is interested.', kg: 0.3 });
        }
        scholar.kcal -= S.calories.ACTION_COSTS.forage;
        msg = `Packed ${r.units}× ${r.plant.unit} of ${this.plantDisplayName(r.plantId)} (${r.kcal} kcal).`;
        this.tele('forage', { tile: t.type, epithet: this.nodeEpithet(this.map.px, this.map.py), plant: r.plantId, units: r.units, kcal: r.kcal, cost: S.calories.ACTION_COSTS.forage, firstFind: !!r.firstFind });
        if (scholar.week1) scholar.week1.forage++;
        this.gainAbilityXP('green_thumb', 1);
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
        msg = `You rest. Breath slows. +${restGain} energy.`;
      } else if (kind === 'wait') {
        msg = 'You wait. The light changes. Nothing asks anything of you.';
      } else if (kind === 'drink') {
        // Drinking water. Hydrates. FREE — you're just drinking, not making a decision.
        // (drinkWater says what happened; it returns null either way.)
        this.drinkWater();
        this.checkQuest(kind);
        this.maybeOfferQuest();
        return true; // FREE: drinking isn't a day-part decision
      } else if (kind === 'treat') {
        const t = this.playerTile();
        if (t.type !== 'creek' && t.type !== 'wetland') { this.say('Need moving water — find a creek or wetland.'); return null; }
        scholar.water = scholar.water || [];
        scholar.water.push({ liters: 1, quality: 'clean', source: 'Creek (boiled)' });
        scholar.water.push({ liters: 1, quality: 'clean', source: 'Creek (boiled)' });
        scholar.kcal -= S.calories.ACTION_COSTS.treat_water;
        msg = 'You boil water over a small fire. +2 clean water.';
      }
      this.say(msg);
      this.checkQuest(kind);
      this.maybeOfferQuest();
      // ACTION CLOCK: variable cost by fictional weight. 1 chunk = 32 ticks.
      // Forage 2-3 chunks (a rich tile takes longer — more to gather),
      // rest 3 chunks, treat 1 chunk, wait = however long until the part turns.
      const T = this.TIME;
      let ticks = T.TICKS_PER_PART;
      if (kind === 'forage') {
        const b = this.bountyFor(this.map.px, this.map.py);
        ticks = (b && b.richness >= 1.3) ? 96 : 64;
      } else if (kind === 'rest') ticks = 96;
      else if (kind === 'treat') ticks = 32;
      else if (kind === 'wait') {
        const rem = (this.state.scholar.dayTicks || 0) % T.TICKS_PER_PART;
        ticks = rem === 0 ? T.TICKS_PER_PART : T.TICKS_PER_PART - rem;
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
            this.state.village.pantryKcal += 500;
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
      // POWER NEEDS FOOD: target scales with metabolic mult. Fire god eats to 9600.
      const mult = this.metabolicMult((scholar.abilities || []).concat(scholar.backgroundAbilities || []));
      // extra_stomach: two stomachs, twice the target. The hunger is the price.
      const eatMult = this.modTarget('food.eat_target_mult', 1);
      const target = Math.round(2400 * mult * eatMult);
      // eat most-perishable first until kcal >= target or empty
      scholar.inventory.sort((a, b) => (a.spoilDay ?? 99999) - (b.spoilDay ?? 99999));
      let ate = 0;
      const tasted = {}; // plantId -> units eaten (for knowledge level 3)
      // Eat only food (kcalEach > 0). Gear is skipped, NOT deleted.
      while (scholar.kcal < target) {
        // find the most perishable FOOD (not gear)
        const foodIdx = scholar.inventory.findIndex(i => (i.kcalEach || 0) > 0 && i.units > 0);
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
      // spoilage: drop expired FOOD. Gear (no spoilDay) never spoils.
      // preservation_instinct: you store food right. +days before it turns.
      const spoilBonus = Math.round(this.modTarget('food.spoilage_days', 0));
      const before = scholar.inventory.length;
      scholar.inventory = scholar.inventory.filter(i => i.spoilDay === undefined || i.spoilDay === null || (i.spoilDay + spoilBonus) > scholar.day);
      const spoiled = before - scholar.inventory.length;
      this.say(ate > 0 ? `You eat (${ate} kcal).` + (spoiled ? ` ${spoiled} item(s) spoiled — the Codex notes the waste.` : '')
                       : (scholar.inventory.length ? 'You are full enough.' : 'Nothing to eat. The pantry of your pack is empty.'));
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
      // ALIVE: wants grow with time, unanswered asks curdle.
      try { this.tickNeeds(); } catch (e) {}
      // LEADER: assigned villagers execute their tasks. Reports come back now.
      try { this.resolveAssignments(); } catch (e) {}
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
          this.say(onWatch.length
            ? 'Night settles. The fire is the whole world now. Watches are posted — the dark has its own animals, and the village knows it.'
            : 'Night settles. The fire is the whole world now. No watches posted. The dark feels bigger than it should.');
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

    // villageMeal: you eat from the communal pantry. You're one of the 12.
    // Trust determines your share. Newcomers get less. Contributors get more.
    villageMeal() {
      const scholar = this.state.scholar;
      // If you joined another village, you eat from THEIR pantry.
      let v = this.state.village;
      let pantry = v.pantry || [];
      if (scholar.joinedVillage) {
        const jv = (this.state.otherVillages || []).find(x => x.id === scholar.joinedVillage);
        if (jv) {
          // other villages use pantryKcal (abstract). Convert to meal.
          const meal = Math.min(2000, jv.pantryKcal || 0);
          jv.pantryKcal = Math.max(0, (jv.pantryKcal || 0) - meal);
          scholar.kcal = Math.min((scholar.kcal || 0) + meal, 3000);
          this.say(`Village meal at ${jv.name}: +${Math.round(meal)} kcal.`);
          return;
        }
      }
      // your share: 2000 kcal (a day's food), scaled by trust
      // trust < 30: half ration (they're watching you). 30+: full. 60+: full + bonus.
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
        const person = this.data.villagers.find(p => p.id === id) || this.data.background_survivors.find(p => p.id === id);
        if (!person) continue;
        const health = (v.health && v.health[id] !== undefined) ? v.health[id] : 100;
        const healthFactor = health / 100;
        // taught plants: villagers who LEARN (via dialogue) forage better. real mechanism.
        const knownPlants = (v.taught && v.taught[id]) ? v.taught[id].length : 0;
        const knowledgeFactor = 1 + (knownPlants * 0.15);
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
        const effectiveKcal = item.rawKcal ? (item.cookedKcal || item.rawKcal * 1.5) : kcalEach;
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
      // LIVING WORLD: heavily pressured land recovers SLOWER. Hammer a tile
      // repeatedly and it stays barren longer. The land needs rest.
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const t = this.map.tiles[y][x];
        if (t.maxStock > 0) {
          const pressure = t.foragePressure || 0;
          // pressure suppresses regrow: 0-4 = full, 5-9 = half (every other day), 10+ = none
          // pressure decays by 1/day when not foraged (land rests)
          let regrow = 1;
          if (pressure >= 10) regrow = 0;
          else if (pressure >= 5) regrow = (this.state.scholar.day % 2 === 0) ? 1 : 0;
          if (regrow > 0) t.stock = Math.min(t.maxStock, (t.stock || 0) + regrow);
          // pressure decays slowly — the land forgives, eventually
          if (pressure > 0 && !t.foragedToday) t.foragePressure = Math.max(0, pressure - 1);
          t.foragedToday = false;
        }
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
      // SLICE 2: System arrival and timed events.
      this.checkSystemArrival();
      this.checkTimedEvents();
      // LEADER: morning briefing — village knowledge flows to you post-arrival.
      try { this.villageBriefing(); } catch (e) {}
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
      // the village eats whether you're there or not — every day you're out, twelve mouths
      // YOU EAT TOO. Village meal from the communal pantry.
      this.villageMeal();
      this.villageLives();
      this.villageEats();
      this.checkTraps();
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
          this.over = true;
          this.say('You didn\'t make it. The village remembers. The Codex keeps what you brought home.');
          this.returnToVillage();
          return this.status();
        }
      }
      scholar.day += 1;
      scholar.relicResolveUsed = false;
      this.dayPart = 0; this.ap = 1;
      scholar.dayTicks = 0; scholar.actionClock = 0; // action clock: new day, fresh budget
      this.say(`— DAY ${scholar.day} DAWN — ${DAY_PART_HINT.dawn}`);
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

    playerSpeed() { return 4; },

    startCombat(monsterId) {
      const s = this.state.scholar;
      const px = s.mx ?? 4, py = s.my ?? 4;
      const mdef = this.data.monsters.find(m => m.id === (monsterId || 'thornback_boar')) || this.data.monsters[0];
      const detail = this.genDetail(this.map.px, this.map.py);
      const terrainBlocked = (x, y) => {
        const cell = detail[y] && detail[y][x];
        return this.cellProps(cell).blocks;
      };
      const freeSpotNear = (cx, cy) => {
        for (let r = 1; r <= 4; r++) {
          for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || nx > 8 || ny < 0 || ny > 8 || (nx === px && ny === py)) continue;
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
      for (let i = 0; i < count; i++) {
        const spot = i === 0 ? { x: srcMx, y: srcMy } : freeSpotNear(srcMx, srcMy);
        const hp = mdef.hp[0] + Math.floor(Math.random() * (mdef.hp[1] - mdef.hp[0]));
        fighters.push({
          key: 'm_' + i, kind: 'monster', monsterId: mdef.id,
          name: mdef.name + (count > 1 ? ' ' + (i + 1) : ''), emoji: mdef.emoji || '👹',
          hp, maxHp: hp, speed: mdef.speed || 3, mx: spot.x, my: spot.y,
          alive: true, fled: false, telegraph: null, mdef,
          hesitate: hasFear ? 1 : 0, blind: hasSand ? 2 : 0, stunned: 0,
        });
      }

      this.tbfight = {
        fighters,
        order: S.combat.turnOrder(fighters),
        turnIdx: 0, round: 1,
        over: false, result: null,
      };
      // ALIVE: the village hears it. fear is contagious.
      try { this.villageEvent('monster_attack'); } catch (e) {}
      // REPUTATION: fighting is observed. Brave villagers respect it,
      // cautious ones call it reckless, rivals call it showing off.
      try { this.observe('fight'); } catch (e) {}
      this.fight = null; // old menu combat retired
      this.pendingEncounter = false;
      // face to face: the ambiguity ends. you know what it is now.
      try { this.identifyMonster(mdef.id); } catch (e) {}
      s.monster = null; // it's in the fight now, not wandering
      const partyNames = fighters.filter(f => f.kind === 'villager').map(f => f.name);
      this.say(`⚔ ${mdef.name.toUpperCase()}!${count > 1 ? ` (${count} of them!)` : ''} ${partyNames.length ? partyNames.join(', ') + (partyNames.length > 1 ? ' join' : ' joins') + ' you!' : "You're on your own."}`);
      if (hasFear) this.say('Something about you is wrong. It hesitates. (fear_aura)');
      if (hasSand) this.say('You fling a handful of grit into its eyes. (pocket_sand: blinded)');
      this.say('Turn-based now. Tap a tile to move — speed is squares. Then act.');
      this.audioEvent('combatStart');
      this.sysSay(`COMBAT! ${mdef.name.toUpperCase()}! The gamblers lean in. ROUND 1 — FIGHT!`);
      this.tbBeginTurn();
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
      if (c.kind === 'player') { c.moveLeft = c.speed; c.acted = false; }
      this.tbRefreshTelegraphUI();
    },

    // === earned knowledge ===
    // Pattern descriptions: what the Codex writes after you've SURVIVED an attack.
    tbPatternDesc(pattern) {
      const t = (pattern && pattern.type) || 'burst';
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

    // The telegraph cue: behavioral text ALWAYS. Learned understanding only if earned.
    // Escalates as the windup counts down — you can FEEL it coming.
    tbTelegraphCue(m) {
      const tg = m.telegraph;
      const atk = m.mdef.attack || {};
      let cue = atk.telegraph || 'It shifts. Something is coming.';
      if (tg && tg.turnsLeft === 1) cue += " It's about to loose!";
      else if (tg && tg.turnsLeft > 1) cue += ' It is still gathering itself…';
      if (this.tbPatternKnown(m.mdef.id, atk.name)) {
        cue += ` You know this one: ${atk.name} ${this.tbPatternDesc(atk.pattern)}.`;
      }
      return cue;
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
          this.say("You don't stroll through a " + o.name + '.'); return false;
        }
      }
      p.moveLeft -= path.length;
      p.mx = cx; p.my = cy;
      this.state.scholar.mx = cx; this.state.scholar.my = cy;
      const [lx, ly] = path[path.length - 1];
      const [px2, py2] = path.length >= 2 ? path[path.length - 2] : [p.mx, p.my];
      this.state.scholar.facing = { x: Math.sign(lx - px2) || 0, y: Math.sign(ly - py2) || 1 };
      return true;
    },

    tbPlayerStrike(targetKey) {
      const f = this.tbfight;
      if (!f || !this.tbIsPlayerTurn()) return false;
      const p = this.tbFighter('p');
      if (p.acted) { this.say('Already acted this turn.'); return false; }
      const t = this.tbFighter(targetKey);
      if (!t || !t.alive || (t.kind !== 'monster' && t.kind !== 'hostile')) return false;
      if (Math.max(Math.abs(t.mx - p.mx), Math.abs(t.my - p.my)) > 1) { this.say('Too far to strike.'); return false; }
      let d = S.combat.roll([10, 16]);
      const hpFrac = p.hp / p.maxHp;
      if (this.hasAbility('rage') && hpFrac < 0.5) { d *= 2; this.say('RAGE: +100% damage.'); }
      if (this.hasAbility('cornered_rat') && hpFrac < 0.3) { d *= 2; this.say('CORNERED RAT: desperation is a weapon.'); }
      if (p.aimed) { d = Math.round(d * 2.5); p.aimed = false; this.say('DEAD AIM: patience, then thunder. Critical ×2.5.'); }
      d = Math.round(d);
      p.acted = true;
      this.say(`You STRIKE the ${t.name} for ${d}.`);
      this.tbDamage(t.key, d, 'you');
      this.tbStyle(5, 'solid hit');
      const tAfter = this.tbFighter(t.key);
      if (tAfter && !tAfter.alive) this.tbStyle(20, `dropped the ${tAfter.name}!`);
      this.tbAfterPlayerAction();
      return true;
    },

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

    tbPlayerFlee() {
      const f = this.tbfight;
      if (!f || !this.tbIsPlayerTurn()) return false;
      const p = this.tbFighter('p');
      if (p.acted) { this.say('Already acted this turn.'); return false; }
      if (this.hasAbility('rage') && (p.hp / p.maxHp) < 0.5) {
        this.say('RAGE: flee? FLEE? The thought dies before it finishes.');
        return false;
      }
      p.acted = true;
      if (Math.random() < 0.8) {
        p.fled = true;
        this.say('You FLEE — crashing through the undergrowth, heart hammering.');
        try { this.observe('flee'); } catch (e) {}
        this.tbEnd('fled');
      } else {
        this.say('You try to flee — it cuts you off!');
        this.tbAfterPlayerAction();
      }
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
      this.tbAdvance();
    },

    tbAfterPlayerAction() {
      this.tbAdvance();
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
        if (c.kind === 'villager') this.tbVillagerTurn(c);
        else this.tbMonsterTurn(c);
        if (this.tbEndCheck()) return;
      }
    },

    tbDamage(targetKey, dmg, sourceLabel, sourceKey) {
      const t = this.tbFighter(targetKey);
      if (!t || !t.alive) return;
      let final = Math.max(0, Math.round(dmg));
      if (t.kind === 'player' && typeof this.armorBonus === 'function') {
        const prot = this.armorBonus();
        if (prot > 0) { final = Math.max(0, final - prot); this.say(`Armor absorbs ${Math.min(dmg, prot)}.`); }
      }
      t.hp -= final;
      if (t.kind === 'player') {
        this.state.scholar.health = Math.max(0, t.hp);
        if (final > 0) this.noteAbilityUse('chitin_skin');
      }
      this.say(`${sourceLabel === 'you' ? 'You hit' : sourceLabel + ' hits'} ${t.kind === 'player' ? 'you' : t.name} for ${final}.`);
      if (t.hp <= 0) {
        t.alive = false;
        if (t.kind === 'player') this.say('You go down.');
        else if (t.kind === 'villager') { this.say(`☠ ${t.name} falls.`); this.tbVillagerFalls(t); }
        else this.say(`The ${t.name} falls.`);
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
        if (o.alive && !o.fled && o.mx === x && o.my === y) return true;
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
          this.say(`${v.name} ${a.type === 'strike' ? 'strikes' : 'harries'} the ${t.name}.`);
          this.tbDamage(t.key, dmg, v.name);
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

    tbMonsterTurn(m) {
      const f = this.tbfight;
      // stunned: no move, no new attack. (Pending telegraph was canceled by the scream.)
      if (m.stunned > 0) {
        m.stunned -= 1;
        this.say(`The ${m.name} is still frozen from your scream.`);
        if (this.tbEndCheck()) return;
        return;
      }
      // 1. pending telegraph: count down, then resolve.
      // Heavy attacks wind up over multiple rounds (you don't know exactly
      // how long — but the cue escalates and the heartbeat tells you).
      if (m.telegraph) {
        const tg = m.telegraph;
        tg.turnsLeft -= 1;
        if (tg.turnsLeft > 0) {
          // still winding up — holds position, committed. No move, no new attack.
          this.tbRefreshTelegraphUI();
          this.audioEvent('telegraph', { urgency: tg.turnsLeft });
          return;
        }
        // RESOLVE. Tracking attacks re-aim at who you are NOW, not where you
        // were. Knowledge tells you the shape; positioning saves you.
        m.telegraph = null;
        if (tg.kind === 'squares') {
          const foe = S.combat.nearestEnemy(f.fighters, m);
          if (foe) tg.cells = S.combat.patternCells(tg.pattern, m.mx, m.my, foe.f.mx, foe.f.my);
        }
        this.audioEvent('impact');
        if (tg.kind === 'direct') {
          const t = this.tbFighter(tg.targetKey);
          if (t && t.alive) {
            let dmg = S.combat.roll(tg.dmg), missed = false;
            if (m.blind > 0 && Math.random() < 0.5) { missed = true; }
            if (missed) this.say(`${m.name}'s ${tg.attackName} swipes at sand-ghosts. Missed. (pocket_sand)`);
            else {
              this.say(`💥 ${m.name}'s ${tg.attackName} finds ${t.kind === 'player' ? 'you' : t.name} — no dodging it.`);
              this.tbDamage(t.key, dmg, m.name);
            }
          }
        } else {
          this.say(`💥 ${tg.attackName}!`);
          const hitKeys = new Set(tg.cells.map(c => c.cx + ',' + c.cy));
          let playerHit = false;
          for (const o of f.fighters) {
            if (!o.alive || o.fled || o.key === m.key) continue;
            if (hitKeys.has(o.mx + ',' + o.my)) {
              if (m.blind > 0 && Math.random() < 0.5) {
                this.say(`${m.name} lashes at sand-ghosts near ${o.kind === 'player' ? 'you' : o.name}. Missed. (pocket_sand)`);
                continue;
              }
              if (o.kind === 'player') playerHit = true;
              this.tbDamage(o.key, S.combat.roll(tg.dmg), m.name + "'s " + tg.attackName);
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
        }
        if (m.blind > 0) m.blind -= 1;
        this.tbLearnPattern(m);
        this.tbRefreshTelegraphUI();
        if (this.tbEndCheck()) return;
      }
      if (!m.alive || f.over) return;
      // 2. hesitate (fear_aura): it doesn't act this turn
      if (m.hesitate > 0) {
        m.hesitate -= 1;
        this.say(`The ${m.name} hesitates. Something about you is wrong. (fear_aura)`);
        if (this.tbEndCheck()) return;
        return;
      }
      // 3. flee check (codex: bulldozer retreats <25%, deer bolts <50%, etc.)
      const fleeAt = m.mdef.fleeAt || 0;
      if (fleeAt > 0 && m.hp / m.maxHp < fleeAt && Math.random() < 0.7) {
        m.fled = true;
        this.say(`The ${m.name} breaks and runs!`);
        this.tbEndCheck();
        return;
      }
      // 4. act by pattern
      const foe = S.combat.nearestEnemy(f.fighters, m);
      if (!foe) return;
      const pat = (m.mdef.attack && m.mdef.attack.pattern) || { type: 'burst', radius: 1 };
      const blocked = (x, y) => this.tbBlocked(x, y) && !(x === m.mx && y === m.my);
      const danger = this.tbDangerCells(m.key);
      const atk = m.mdef.attack;
      if (pat.type === 'ambush') {
        // speedbump: doesn't move. If someone's adjacent, SNAP — no warning.
        if (foe.d <= 1) {
          const cells = S.combat.patternCells(pat, m.mx, m.my, foe.f.mx, foe.f.my);
          this.say(`💥 The ${m.name} SNAPS! No warning. There never is.`);
          const hitKeys = new Set(cells.map(c => c.cx + ',' + c.cy));
          for (const o of f.fighters) {
            if (!o.alive || o.fled || o.key === m.key) continue;
            if (hitKeys.has(o.mx + ',' + o.my)) this.tbDamage(o.key, S.combat.roll(atk.damage), m.name);
          }
          this.tbLearnPattern(m);
        }
        this.tbEndCheck();
        return;
      }
      if (pat.type === 'rush') {
        // hushpuppy: NO telegraph. Moves adjacent and hits NOW.
        for (let i = 0; i < m.speed; i++) {
          if (Math.max(Math.abs(foe.f.mx - m.mx), Math.abs(foe.f.my - m.my)) <= 1) break;
          const s = S.combat.stepToward(m.mx, m.my, foe.f.mx, foe.f.my, blocked, danger);
          if (!s) break;
          m.mx = s.x; m.my = s.y;
        }
        if (Math.max(Math.abs(foe.f.mx - m.mx), Math.abs(foe.f.my - m.my)) <= 1) {
          this.say(`The ${m.name} is on ${foe.f.kind === 'player' ? 'you' : foe.f.name} — no warning, just teeth.`);
          this.tbDamage(foe.f.key, S.combat.roll(atk.damage), m.name);
          this.tbLearnPattern(m);
        }
        this.tbEndCheck();
        return;
      }
      // standard: advance into range, then DECLARE (behavioral cue only).
      // The attack lands at the start of this monster's next turn. That's the dodge window.
      for (let i = 0; i < m.speed; i++) {
        const d = Math.max(Math.abs(foe.f.mx - m.mx), Math.abs(foe.f.my - m.my));
        const want = pat.type === 'direct' ? (pat.range || 3) : 4;
        if (d <= want) break;
        const s = S.combat.stepToward(m.mx, m.my, foe.f.mx, foe.f.my, blocked, danger);
        if (!s) break;
        m.mx = s.x; m.my = s.y;
      }
      if (pat.type === 'direct') {
        const d = Math.max(Math.abs(foe.f.mx - m.mx), Math.abs(foe.f.my - m.my));
        if (d <= (pat.range || 3)) {
          m.telegraph = { kind: 'direct', targetKey: foe.f.key, dmg: atk.damage,
            attackName: atk.name, pattern: pat, turnsLeft: pat.windup || 1 };
          this.say('⚠ ' + this.tbTelegraphCue(m));
          this.audioEvent('telegraph', { urgency: m.telegraph.turnsLeft });
        } else {
          this.say(`The ${m.name} stalks closer. ${atk.telegraph || ''}`);
        }
      } else {
        const cells = S.combat.patternCells(pat, m.mx, m.my, foe.f.mx, foe.f.my);
        const p0 = this.tbFighter('p');
        m.telegraph = { kind: 'squares', cells, dmg: atk.damage,
          attackName: atk.name, pattern: pat, turnsLeft: pat.windup || 1,
          threatenedPlayer: !!(p0 && p0.alive && cells.some(c => c.cx === p0.mx && c.cy === p0.my)) };
        this.say('⚠ ' + this.tbTelegraphCue(m));
        this.audioEvent('telegraph', { urgency: m.telegraph.turnsLeft });
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

    tbEnd(result) {
      const f = this.tbfight;
      if (!f || f.over) return;
      f.over = true; f.result = result;
      if (this.clearTelegraph) this.clearTelegraph();
      const s = this.state.scholar;
      const p = this.tbFighter('p');
      if (p) s.health = Math.max(0, p.hp);
      for (const v of f.fighters) {
        if (v.kind === 'villager' && v.alive && !v.fled) this.tbVillagerSyncPos(v);
      }
      if (result === 'won') {
        const mdef = f.fighters.find(x => x.kind === 'monster').mdef;
        this.state.codex.monsters = this.state.codex.monsters || {};
        const cur = this.state.codex.monsters[mdef.id] || {};
        this.state.codex.monsters[mdef.id] = Object.assign(cur, { stage: 'slain' });
        this.audioEvent('victory');
        this.sysSay(`WINNER! Style score: ${f.style || 0}. The gamblers ${((f.style || 0) >= 40) ? 'are ecstatic!' : 'nod approvingly.'}`);
        if (mdef.edible) {
          const kcal = mdef.edible.calories || 1000;
          const cuts = Math.max(1, Math.round(kcal / 800));
          s.inventory.push({ plantId: mdef.id + '_meat', units: cuts, kcalEach: Math.round(kcal / cuts), spoilDay: s.day + 3, name: mdef.name + ' meat', unit: 'cut', prep: mdef.edible.note || 'Cook it.', kg: 0.8 });
          this.say(`${mdef.edible.note || ''} (+${cuts} cuts, ${this.fmtKcal ? this.fmtKcal(kcal) : kcal + ' kcal'})`);
        }
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
            this.say(`You clutch your ${r.name}. You're still here. (Bond +3)`);
          }
        }
      } else if (result === 'routed') {
        this.notePlaystyle('cautious');
        this.audioEvent('combatEnd');
        try { const mm = f.fighters.find(x => x.kind === 'monster'); if (mm) this.identifyMonster(mm.monsterId); } catch (e) {}
        this.say('It got away. No meat, no trophy — but you\'re breathing, and now you know its moves.');
        this.sysSay(`It RAN! Style score: ${f.style || 0}. The gamblers wanted blood, but they'll settle for drama.`);
      } else if (result === 'fled') {
        this.notePlaystyle('cautious');
        try { const mm = f.fighters.find(x => x.kind === 'monster'); if (mm) this.identifyMonster(mm.monsterId); } catch (e) {}
        this.audioEvent('combatEnd');
        // survivors scatter; monsters melt back into the woods
        this.say('You escape. The thicket keeps its secrets.');
        this.sysSay('And they\'re GONE! The gamblers who bet on a fight are furious. The ones who bet on running are rich.');
      } else if (result === 'lost') {
        this.audioEvent('defeat');
        this.sysSay('OH. Oh no. ...The gamblers are very quiet.');
        if (!this.over) { this.over = true; this.say("You didn't make it. The village remembers."); }
      }
      this.tbfight = null;
    },

    combatRound(cmd) {
      // OLD menu combat retired — the grid is the combat now.
      // Kept as a no-op shim so any stale caller doesn't crash.
      return null;
    },
    say(msg) { this.log.push(msg); if (this.log.length > 40) this.log.shift(); },

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
        this.map.px = this.state.village.x ?? 3; this.map.py = this.state.village.y ?? 3;
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
    identifyPlant(pid, source) {
      const p = this.data.plants.find(x => x.id === pid);
      if (!p || this.plantKnown(pid)) return false;
      this.state.codex.plants[pid] = { identifiedDay: this.state.scholar.day, level: 1, harvests: 0, tastings: 0, by: source || 'observation' };
      this.state.codex.encounters[pid] = 99;
      this.refreshItemNames(pid);
      this.integrate(source === 'taught' ? 2 : 3, source === 'taught' ? 'taught' : 'discovery');
      // celebration: identification is an EVENT, not a log line
      this.say(`\u2605 IDENTIFIED: ${p.name}. ${p.knowledgeLevels['1']}`);
      const sys = [
        'SYSTEM: Naming things. Very human. The audience approves.',
        'SYSTEM: Oh! It has a NAME. You all love names.',
        'SYSTEM: Catalogued. The Codex grows teeth.',
        'SYSTEM: Identification complete. You are 0.3% less lost.',
      ];
      this.say(sys[Math.floor(Math.random() * sys.length)]);
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
  };

  global.Scattering = global.Scattering || {};
  global.Scattering.Game = Game;
  global.Scattering.DAY_PARTS = DAY_PARTS;
  global.Scattering.TILE_GLYPH = TILE_GLYPH;
  global.Scattering.TILE_NAME = TILE_NAME;
})(typeof window !== 'undefined' ? window : globalThis);
