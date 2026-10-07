// @ontology
// system: lifeseed
// description: Procedural foundation. Procedural depth before more systems.
// provides:
//   - genCharacter(opts)
//   - genLifeseed()
//   - genPersonalPool(vid)
//   - lifeseedKin(vid)
//   - lifeseedText(vid)
//   - resolveKeepsakeText(item)
//   - genLifeseedVoice(char, ls)
//   - lifeseedVoice(char)
//   - lifeseedWoundTone(wound)
//   - genLifeseedKnowhow(char, ls)
//   - lifeseedKnowhow(char)
//   - lifeseedPlantKnowhow(char, plantRegions)
//   - recordLifeseedEvent(char, evt)
//   - lifeseedMood(char, day)
//   - lifeseedCurrentDay()
// rules:
//   - seed_identity_depth: every seed carries voice + knowhow + lived[] at generation; identity depth is seed-level, never a hardcoded cast (code: genLifeseed)
//   - voice_coherence: voice topics name ONLY seed people/places — the coherence guarantee extends to conversation seeds (code: genLifeseedVoice)
//   - lived_events_shift_identity: run events shift want/mood; wantHistory preserves the arc so a person is not the same throughout a run (code: recordLifeseedEvent)
//   - per_life_familiarity: regional familiarity is per-life data — a coastal forager knows shore plants cold and is blind inland (code: lifeseedPlantKnowhow)
// consumes:
//   - state.seed
//   - Game.data.lifeseeds
//   - Game.data.plants
//   - Game.data.characterGen
//   - state.scholar.day
// ============ LIFESEEDS: the procedural foundation ============
// Steve's rule (2026-10-04): procedural depth BEFORE more systems. Every
// character gets a lifeseed — a region anchor, named people, named places,
// events, skill origins, a wound, a want. Backstories, keepsakes, flashbacks
// and motives all read from the SAME seed. That's the coherence guarantee:
// if she's from coastal Maine, her keepsake isn't a desert rock and her
// flashback isn't set in Arizona.
//
// Sections:
//  1. region anchor (from origin tags — the origin is authoritative)
//  2. people (culture-fitting names, never the character's own first name)
//  3. places, events, skill origins, wound, want
//  4. texture paragraph woven into the backstory
//  5. keepsake resolution ({kin}/{place}/{first} filled from the seed)
//  6. NPC keepsake observation line
//  7. personal pool (one per character, majority semantic)
//  8. voice profile (register/pace/humor/topics/taboos — seed-derived
//     conversation seeds for downstream conversation code; data + accessors
//     only, lifeseed.js never rewires consumers)
//  9. knowhow (per-life regional familiarity weights: cold/strange plant tags)
// 10. lived events (run events shift want/mood; wantHistory keeps the arc)
//
// Self-attaching module: Object.assign(Game, methods) + wraps genCharacter.
// Load after game.js. Data: src/data/lifeseeds.json (added to the fetch list).

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;
  const R = Math.random;
  const pick = (a) => a[Math.floor(R() * a.length)];

  const methods = {

    // ---------- 1. REGION ANCHOR ----------
    // The origin is authoritative: match its tags to a region. No tag match
    // (foreign origins, free text) -> "far from here", still coherent.
    lifeseedRegion(char) {
      const LS = this.data.lifeseeds || {};
      const regions = LS.regions || [];
      const tags = (char.originTags || []).map(t => String(t).toLowerCase());
      const tagWords = tags.map(t => new Set(t.split(/[^a-z]+/).filter(Boolean)));
      for (const r of regions) {
        if (r.id === 'far_away') continue;
        const mts = (r.matchTags || []).map(m => String(m).toLowerCase());
        // word-set match: every word of the matchTag must appear in some tag's
        // words. ("coast" must NOT match "west coast" — that was a real bug.)
        const hit = mts.some(mt => {
          const mw = mt.split(/[^a-z]+/).filter(Boolean);
          return tagWords.some(tw => mw.every(w => tw.has(w)));
        });
        if (hit) return r;
      }
      return regions.find(r => r.id === 'far_away') || {
        id: 'far_away', label: 'far from here', land: 'streets you still dream about',
        towns: ['the old city'], workplaces: ['the workshop'],
      };
    },

    // ---------- 2. PEOPLE ----------
    // Culture-fitting names via the same generator as the character — a
    // brother from the same origin sounds like he's from the same place.
    // Never the character's own first name.
    lifeseedKinName(char, usedFirsts, rel) {
      const ownFirst = char.name.split(' ')[0];
      // relations carry gender: a grandfather isn't named Hana.
      const fem = ['mother', 'sister', 'daughter', 'grandmother', 'aunt', 'grandchildren'];
      const masc = ['father', 'brother', 'son', 'grandfather', 'uncle'];
      const want = fem.includes(rel) ? 'f' : masc.includes(rel) ? 'm' : null;
      for (let g = 0; g < 40; g++) {
        try {
          const nr = this.genNameForOrigin(char.homeRegion, false);
          const nm = nr && nr.name ? nr.name : null;
          if (!nm) continue;
          const f = nm.split(' ')[0];
          if (f === ownFirst || (usedFirsts || []).includes(f)) continue;
          if (want && this.guessNameGender) {
            const gg = this.guessNameGender(f, nr.cultureId);
            if (gg !== want && gg !== 'u') continue;
          }
          return nm;
        } catch (e) { /* fall through */ }
      }
      return want === 'f' ? 'Mary Ellis' : 'James Carter';
    },

    // ---------- 3. THE SEED ----------
    genLifeseed(char) {
      const LS = this.data.lifeseeds || {};
      const region = this.lifeseedRegion(char);
      const first = char.name.split(' ')[0];
      const town = pick(region.towns || ['the old town']);
      const workplace = pick(region.workplaces || ['the shop']);
      const usedFirsts = [];
      // places first: kin fates can reference them ({place}).
      const places = [];
      for (const pk of (LS.places || [])) {
        if (places.length >= 2) break;
        places.push({
          kind: pk.kind,
          name: String(pick(pk.names || ['somewhere']))
            .replaceAll('{first}', first).replaceAll('{town}', town)
            .replaceAll('{workplace}', workplace).replaceAll('{street}', '5th'),
        });
      }
      const placeName = (kind) => {
        const p = places.find(x => x.kind === kind) || places[0];
        return p ? p.name : 'somewhere';
      };
      const fillBasic = (t) => String(t)
        .replaceAll('{first}', first)
        .replaceAll('{town}', town)
        .replaceAll('{workplace}', workplace)
        .replaceAll('{place}', placeName());

      // people: cover the keepsake kin first (so flashbacks never name a
      // stranger), then fill out to 3 with distinct relations.
      const kinPool = [...(LS.kin || [])];
      const usedRel = new Set();
      const people = [];
      const needRels = [];
      for (const id of (char.items || [])) {
        const def = (this.data.items || []).find(i => i.id === id);
        const rel = def && def.kin;
        if (def && def.class === 'sentimental' && rel && rel !== 'none' && !needRels.includes(rel)) needRels.push(rel);
      }
      const takeKin = (rel) => {
        if (usedRel.has(rel)) return;
        usedRel.add(rel);
        const tmpl = kinPool.find(k => k.relation === rel) || pick(kinPool);
        const nm = this.lifeseedKinName(char, usedFirsts, tmpl.relation);
        usedFirsts.push(nm.split(' ')[0]);
        people.push({ name: nm, relation: tmpl.relation, fate: fillBasic(pick(tmpl.fates || ['is somewhere out there'])) });
      };
      for (const rel of needRels) takeKin(rel);
      let guard = 0;
      while (people.length < 3 && guard++ < 40) {
        const cands = kinPool.filter(k => !usedRel.has(k.relation));
        if (!cands.length) break;
        takeKin(pick(cands).relation);
      }

      // places: chosen above (kin fates reference them).
      const kinName = (rel) => {
        const p = people.find(x => x.relation === rel) || people[0];
        return p ? p.name.split(' ')[0] : 'someone';
      };

      // skill origins: 2, grounded in people and places.
      const soKeys = Object.keys(LS.skillOrigins || {});
      const skillOrigins = {};
      for (let i = 0; i < 2 && soKeys.length; i++) {
        const k = soKeys.splice(Math.floor(R() * soKeys.length), 1)[0];
        const tmpl = pick(LS.skillOrigins[k]);
        skillOrigins[k] = fillBasic(tmpl)
          .replaceAll('{kin}', kinName())
          .replaceAll('{place}', placeName());
      }

      // The seed itself — then the identity-depth layers attach below.
      // Voice, knowhow, and the lived-event record are generated FROM this
      // seed, so every person carries them and no two carry the same ones.
      const ls = {
        regionId: region.id,
        regionLabel: region.label,
        regionLand: region.land,
        hometown: town,
        workplace,
        people,
        places,
        event: fillBasic(pick(LS.events || ['a hard year'])).replaceAll('{kin}', kinName()),
        wound: fillBasic(pick(LS.wounds || ['a quiet grief'])).replaceAll('{kin}', kinName()),
        want: fillBasic(pick(LS.wants || ['keep going'])).replaceAll('{kin}', kinName()),
        skillOrigins,
      };
      try {
        ls.voice = this.genLifeseedVoice(char, ls);
        ls.knowhow = this.genLifeseedKnowhow(char, ls);
      } catch (e) { /* a thin seed is better than a crashed roster */ }
      ls.lived = [];
      ls.moodMods = [];
      ls.wantHistory = [];
      ls.changed = [];
      return ls;
    },

    // ---------- 8. VOICE PROFILE ----------
    // Steve 2026-10-06 (unique-person law): conversation must generate FROM
    // identity — per-life background, backstory, lived events — never a fixed
    // cast or static personalities. This section is DATA + ACCESSORS only:
    // a voice profile generated from the seed that downstream conversation
    // code can read. Topics name only seed people/places (the coherence
    // guarantee extends here); taboos grow out of the wound; register/pace/
    // humor grow out of temperament + wound tone. Nothing here is dialogue
    // copy for the player — these are seeds, hints, and deflection lines.
    lifeseedWoundTone(wound) {
      const w = String(wound || '').toLowerCase();
      if (/(doesn't talk|never speak|never mention|buried|died|dead|lost |lost\b|gone\b|last winter)/.test(w)) return 'grief';
      if (/(fault|should have|left them|abandoned|walked away|left \w+ at the)/.test(w)) return 'guilt';
      if (/(afraid|fear|fright|winter|hunger|starv|cold took)/.test(w)) return 'fear';
      if (/(took |stole|burned|broke |lied|cheated|betray)/.test(w)) return 'anger';
      return 'quiet';
    },

    // A short euphemism for the wound — what the taboo label names without
    // naming the wound itself ("won't talk about the last winter...").
    lifeseedWoundEuphemism(wound, first) {
      let w = String(wound || '').replace(/\{first\}/g, '').trim();
      // the wound was already filled: strip a leading "<First> " so the taboo
      // reads "won't talk about the last winter…" not "won't talk about
      // marcus left anna…".
      if (first) w = w.replace(new RegExp('^' + String(first).replace(/[^a-z]/gi, '') + '\\b\\s*', 'i'), '');
      w = w.replace(/^(doesn't|does not|never|can't|cannot|won't|wouldn't)\s+(talk about|speak of|mention|say much about)\s+/i, '');
      w = w.charAt(0).toLowerCase() + w.slice(1);
      const words = w.split(/\s+/);
      const short = words.slice(0, 7).join(' ');
      return words.length > 7 ? short + '…' : short;
    },

    genLifeseedVoice(char, ls) {
      const temperament = ((char.personality || {}).temperament || 'steady').toLowerCase();
      const tone = this.lifeseedWoundTone(ls.wound);
      const first = char.name.split(' ')[0];
      const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

      // register: how they talk. Temperament-biased, wound-aware.
      const REGISTER_BY_TEMP = {
        steady: ['plainspoken', 'plainspoken', 'formal'],
        bold: ['effusive', 'plainspoken', 'wry'],
        cautious: ['laconic', 'halting', 'plainspoken'],
        warm: ['effusive', 'effusive', 'plainspoken'],
        prickly: ['laconic', 'wry'],
        restless: ['effusive', 'plainspoken', 'wry'],
        dry: ['wry', 'wry', 'laconic'],
        gentle: ['plainspoken', 'halting', 'effusive'],
        intense: ['formal', 'plainspoken', 'laconic'],
        withdrawn: ['laconic', 'laconic', 'halting'],
        anxious: ['halting', 'halting', 'laconic'],
      };
      const register = pick((REGISTER_BY_TEMP[temperament] || REGISTER_BY_TEMP.steady));

      const PACE = { restless: 'quick', anxious: 'quick', bold: 'quick', withdrawn: 'slow', gentle: 'slow' };
      const pace = PACE[temperament] || 'measured';

      let humor = 'none';
      if (temperament === 'dry') humor = 'dry';
      else if (temperament === 'warm') humor = 'warm';
      else if ((tone === 'grief' || tone === 'guilt') && ['bold', 'prickly', 'restless'].includes(temperament)) humor = 'gallows';

      const ADDRESS = {
        warm: 'friend', dry: 'chief', bold: 'pal', gentle: 'you (softly)',
        prickly: 'you', anxious: 'you (carefully)', withdrawn: 'you (rarely)',
      };
      const address = ADDRESS[temperament] || 'you';

      // topics: 3-5, each naming a seed person or place. Weight shapes how
      // often downstream code should surface them; the want-topic is rarer
      // (aspirations surface less than people do).
      const topics = [];
      const pushTopic = (id, label, hint, weight) => {
        if (topics.length < 5 && !topics.some(t => t.id === id)) topics.push({ id, label, hint, weight: weight == null ? 1 : weight });
      };
      const H = {
        plainspoken: {
          kin: [(pn, fate) => `"${pn}? ${cap(fate)}."`, (pn, fate) => `"${pn} — ${fate}. That's the whole of it."`],
          home: [(t, land) => `"${t}. ${cap(land)} — it's in me."`, (t) => `"Grew up in ${t}. Still miss it."`],
          work: [(w) => `"Put in my time at ${w}."`, (w) => `"${cap(w)}. Honest work."`],
          skill: [(s) => `"${cap(s)}? Hands learned it. That's all."`, (s, h) => `"${cap(s)} — ${h}."`],
          want: [(x) => `"${cap(x)}. Simple as that."`],
        },
        laconic: {
          kin: [(pn, fate) => `"${pn}." A pause. "${cap(fate)}."`, (pn, fate) => `"Don't ask twice. ${cap(fate)}."`],
          home: [(t) => `"${t}."`, (t) => `"Home was ${t}. Was."`],
          work: [(w) => `"Worked ${w}."`],
          skill: [(s) => `"${cap(s)}. Learned it young."`],
          want: [(x) => `"${cap(x)}."`],
        },
        effusive: {
          kin: [(pn, fate) => `"Oh, ${pn}! ${cap(fate)} — ask ${first} anything."`, (pn, fate) => `"${pn} — ${fate}, and ${first} could go on all day."`],
          home: [(t) => `"${t}! ${cap(first)} could draw it blindfolded."`, (t, land) => `"${t}! ${cap(land)}, and every bit of it home."`],
          work: [(w) => `"${cap(w)}! ${cap(first)} loved that place."`],
          skill: [(s, h) => `"${cap(s)}! ${cap(h)} — best lessons ${first} ever got."`],
          want: [(x) => `"${cap(x)}! ${cap(first)} thinks about it every day."`],
        },
        wry: {
          kin: [(pn, fate) => `"${pn}. ${cap(fate)} — the family newsletter writes itself."`, (pn, fate) => `"Ah, ${pn}. ${cap(fate)}. Long story."`],
          home: [(t, land) => `"${t}. Come for the ${land}; stay because the sky broke."`, (t) => `"${t}. You'd love it. Everybody says that."`],
          work: [(w) => `"${cap(w)}. Character-building, they said."`],
          skill: [(s, h) => `"${cap(s)}. ${cap(h)} — mostly by doing it wrong first."`],
          want: [(x) => `"${cap(x)}. Modest dreams ${first} has."`],
        },
        formal: {
          kin: [(pn, fate, rel) => `"My ${rel}, ${pn}. ${cap(fate)}."`, (pn, fate) => `"${pn}. ${cap(fate)}. I don't discuss it lightly."`],
          home: [(t, land) => `"I was raised in ${t}, among the ${land}."`],
          work: [(w) => `"I was employed at ${w}."`],
          skill: [(s, h) => `"I learned ${s} ${h}."`],
          want: [(x) => `"What I want now is ${x}."`],
        },
        halting: {
          kin: [(pn, fate) => `"${pn}… ${cap(fate)}. Sorry. Still lands wrong."`, (pn, fate) => `"${pn}… ${cap(fate)}."`],
          home: [(t, land) => `"${t}… ${cap(land)}. It feels far."`],
          work: [(w) => `"${w}… it was work. It was something."`],
          skill: [(s, h) => `"${cap(s)}… ${h}. I think."`],
          want: [(x) => `"${cap(x)}… if ${first} gets the chance."`],
        },
      };
      const reg = H[register] || H.plainspoken;
      const land = ls.regionLand || 'the old land';
      for (const p of (ls.people || []).slice(0, 2)) {
        const pn = p.name.split(' ')[0];
        const rel = p.relation;
        const hint = pick(reg.kin)(pn, p.fate, rel);
        pushTopic('kin:' + rel.replace(/\s+/g, '_'), `Ask about ${pn} (${rel})`, hint, 1);
      }
      pushTopic('home', `Ask about ${ls.hometown}`, pick(reg.home)(ls.hometown, land), 1);
      pushTopic('work', `Ask about ${ls.workplace}`, pick(reg.work)(ls.workplace), 0.8);
      const soEntries = Object.entries(ls.skillOrigins || {});
      if (soEntries.length) {
        const [sk, how] = soEntries[0];
        const skName = { food: 'finding food', medicinal: 'patching people up', mending: 'fixing things', navigation: 'never getting lost', tracking: 'reading ground', trapping: 'traps', forecast: 'reading the sky' }[sk] || sk;
        const howLower = how.charAt(0).toLowerCase() + how.slice(1);
        pushTopic('skill:' + sk, `Ask how ${first} learned ${skName}`, pick(reg.skill)(skName, howLower), 0.8);
      }
      pushTopic('want', `Ask what ${first} is hoping for`, pick(reg.want)(ls.want), 0.5);

      // taboos: what they will NOT talk about, grown from the wound.
      const taboos = [];
      const euph = this.lifeseedWoundEuphemism(ls.wound, first);
      const DEFLECT = {
        plainspoken: `${first} changes the subject.`,
        laconic: `"No."`,
        effusive: `"Oh — not that. Anything but that."`,
        wry: `${first} makes a joke that doesn't land, and moves on.`,
        formal: `"I'd rather not discuss it."`,
        halting: `${first} goes quiet.`,
      };
      const deflect = DEFLECT[register] || DEFLECT.plainspoken;
      const addTaboo = (id, label) => { if (taboos.length < 2) taboos.push({ id, label, deflect }); };
      if (tone === 'grief') addTaboo('taboo:loss', `Won't talk about ${euph}`);
      else if (tone === 'guilt') addTaboo('taboo:guilt', `Won't talk about ${euph}`);
      else if (tone === 'anger' && R() < 0.6) addTaboo('taboo:anger', `Won't talk about ${euph}`);
      else if (tone === 'fear' && R() < 0.5) addTaboo('taboo:fear', `Gets quiet about ${euph}`);

      const BASE_MOOD = { grief: 'melancholy', guilt: 'heavy', fear: 'uneasy', anger: 'simmering', quiet: 'steady' };
      return {
        register, pace, humor, address,
        baseMood: BASE_MOOD[tone] || 'steady',
        woundTone: tone,
        topics, taboos,
      };
    },

    // Accessor: the voice profile for a character (player or villager seed).
    lifeseedVoice(char) {
      const ls = char && char.lifeseed;
      return (ls && ls.voice) || null;
    },

    // ---------- 9. KNOWHOW ----------
    // Per-life regional familiarity as DATA the knowledge system can read.
    // The fiction: a coastal Maine forager knows shore plants cold and is
    // blind inland. Plant region vocab (plants.json: regions) is small, so
    // the mapping is region -> plant tags known cold vs found strange.
    // lifeseedPlantKnowhow(char, plantRegions) answers per plant:
    // 'cold' (home ground), 'known' (passable), 'strange' (blind).
    genLifeseedKnowhow(char, ls) {
      const AFFINITY = {
        new_england:      { cold: ['georgia'], strange: ['pacific_nw'] },
        pacific_northwest:{ cold: ['pacific_nw'], strange: ['georgia', 'ohio', 'columbus'] },
        deep_south:       { cold: ['georgia'], strange: ['pacific_nw'] },
        midwest:          { cold: ['ohio', 'columbus'], strange: ['pacific_nw'] },
        great_plains:     { cold: ['ohio'], strange: ['pacific_nw', 'georgia'] },
        southwest:        { cold: [], strange: ['ohio', 'georgia', 'pacific_nw', 'columbus'] },
        mountain_west:    { cold: ['pacific_nw'], strange: ['georgia'] },
        mid_atlantic:     { cold: ['georgia', 'ohio'], strange: ['pacific_nw'] },
        west_coast:       { cold: ['pacific_nw'], strange: ['georgia', 'ohio'] },
        far_away:         { cold: [], strange: ['ohio', 'georgia', 'pacific_nw', 'columbus'] },
        alaska:           { cold: [], strange: ['ohio', 'georgia', 'pacific_nw', 'columbus'] },
        hawaii:           { cold: [], strange: ['ohio', 'georgia', 'pacific_nw', 'columbus'] },
        florida:          { cold: ['georgia'], strange: ['pacific_nw', 'ohio'] },
        ozarks:           { cold: ['georgia', 'ohio'], strange: ['pacific_nw'] },
      };
      const aff = AFFINITY[ls.regionId] || AFFINITY.far_away;
      const cold = [...aff.cold], strange = [...aff.strange];
      const plants = (this.data && this.data.plants) || [];
      const tagHit = (tags, pr) => (pr || []).some(r => tags.includes(String(r).toLowerCase()));
      const coldPlantIds = plants.filter(p => tagHit(cold, p.regions)).map(p => p.id);
      const strangePlantIds = plants.filter(p => tagHit(strange, p.regions) && !tagHit(cold, p.regions)).map(p => p.id);
      const frac = plants.length ? coldPlantIds.length / plants.length : 0;
      return {
        regionId: ls.regionId,
        cold, strange, coldPlantIds, strangePlantIds,
        tier: frac > 0.4 ? 'local' : frac >= 0.15 ? 'visitor' : 'stranger',
      };
    },

    lifeseedKnowhow(char) {
      const ls = char && char.lifeseed;
      return (ls && ls.knowhow) || null;
    },

    lifeseedPlantKnowhow(char, plantRegions) {
      const kh = this.lifeseedKnowhow(char);
      if (!kh) return 'known';
      const pr = (plantRegions || []).map(x => String(x).toLowerCase());
      if (pr.some(r => kh.cold.includes(r))) return 'cold';
      if (pr.some(r => kh.strange.includes(r))) return 'strange';
      return 'known';
    },

    // ---------- 10. LIVED EVENTS ----------
    // The unique-person law again: "not always the same person throughout a
    // run. Voice, mood, and topics evolve with what's happened." Run events
    // land here via recordLifeseedEvent — mood shifts (transient, day-bound),
    // want shifts (durable, with history), and a one-line changed-arc for
    // the codex/scholar. Lifeseed-side data + accessors; consumers rewire
    // themselves when ready.
    lifeseedCurrentDay() {
      try {
        return (this.state && this.state.scholar && this.state.scholar.day) || 0;
      } catch (e) { return 0; }
    },

    recordLifeseedEvent(char, evt) {
      const ls = char && char.lifeseed;
      if (!ls) return null;
      const e = evt || {};
      const day = e.day != null ? e.day : this.lifeseedCurrentDay();
      const first = char.name.split(' ')[0];
      const subject = e.subject ? String(e.subject) : null;
      const KINDS = {
        death_of_kin:   { mood: 'grieving', days: 6, wantShift: true },
        death_witnessed:{ mood: 'shaken', days: 3 },
        betrayal:       { mood: 'wary', days: 5, wantShift: true },
        hunger_survived:{ mood: 'hollow', days: 2, wantShift: true },
        kill:           { mood: 'haunted', days: 4, wantShift: true },
        spared:         { mood: 'steady', days: 1 },
        feast_shared:   { mood: 'buoyant', days: 1 },
        exile:          { mood: 'adrift', days: 7, wantShift: true },
        welcomed:       { mood: 'warmed', days: 2 },
        kindness:       { mood: 'warmed', days: 2, wantShift: true },
        theft_victim:   { mood: 'bitter', days: 3 },
        theft_done:     { mood: 'ashamed', days: 3, wantShift: true },
        loss:           { mood: 'grieving', days: 4, wantShift: true },
      };
      const spec = KINDS[e.kind] || { mood: 'steady', days: 1 };
      const entry = { kind: e.kind || 'event', subject, note: String(e.note || ''), day };
      ls.lived = ls.lived || [];
      ls.lived.push(entry);
      if (ls.lived.length > 12) ls.lived = ls.lived.slice(-12);

      ls.moodMods = ls.moodMods || [];
      ls.moodMods.push({ mood: spec.mood, until: day + spec.days, kind: entry.kind });
      if (ls.moodMods.length > 6) ls.moodMods = ls.moodMods.slice(-6);

      // want shift: the event rewrites what they want. History keeps the arc.
      const EVENT_WANTS = {
        death_of_kin: [
          'make sure nobody else goes hungry the way {subject} did',
          'keep {subject}\'s memory alive — out loud, to anyone who listens',
          'find somewhere safe enough that {subject} would have lived',
        ],
        betrayal: [
          'never be caught empty-handed again',
          'trust slower, and check twice',
          'build something nobody can take from {first}',
        ],
        hunger_survived: [
          'never feel that hollow again',
          'learn every edible thing within walking distance',
          'keep a full pack, always',
        ],
        kill: [
          'make the killing mean something',
          'never draw first again',
          'carry the weight of it without going numb',
        ],
        exile: [
          'build something nobody can take',
          'find people who choose {first}',
          'prove the ones who cast {first} out wrong',
        ],
        kindness: [
          'pay it forward before the week is out',
          'remember {subject}\'s name right',
        ],
        theft_done: [
          'make it right with whoever {first} stole from',
          'never need to steal again',
        ],
        loss: [
          'get back what was lost, or something like it',
          'stop losing people',
        ],
      };
      const CHANGED = {
        death_of_kin: () => `Since ${subject || 'the death'} ${subject ? 'died' : 'happened'}, ${first} carries it everywhere.`,
        death_witnessed: () => `After watching someone die, ${first} is quieter at fires.`,
        betrayal: () => `Since ${subject || 'someone'} turned, ${first} checks twice.`,
        hunger_survived: () => `After going hungry, ${first} never wastes a bite.`,
        kill: () => `After the killing, ${first} sleeps less.`,
        spared: () => `After choosing mercy, ${first} stands a little taller.`,
        feast_shared: () => `After the shared feast, ${first} laughs easier.`,
        exile: () => `Cast out, ${first} learned to travel light.`,
        welcomed: () => `Welcomed in, ${first} is learning to stay.`,
        kindness: () => `After ${subject || 'a stranger'}'s kindness, ${first} pays it forward.`,
        theft_victim: () => `Robbed, ${first} sleeps with one eye open.`,
        theft_done: () => `After stealing, ${first} avoids mirrors.`,
        loss: () => `After the loss, ${first} holds things loosely — or not at all.`,
      };
      ls.changed = ls.changed || [];
      const changedFn = CHANGED[entry.kind] || (() => `After ${entry.kind.replace(/_/g, ' ')}, ${first} changed a little.`);
      ls.changed.push({ day, kind: entry.kind, line: changedFn() });
      if (ls.changed.length > 12) ls.changed = ls.changed.slice(-12);

      if (spec.wantShift && EVENT_WANTS[entry.kind]) {
        const tmpl = pick(EVENT_WANTS[entry.kind]);
        const kin = this.lifeseedKin(char, null);
        const to = tmpl.replaceAll('{subject}', subject || 'someone').replaceAll('{first}', first).replaceAll('{kin}', kin);
        ls.wantHistory = ls.wantHistory || [];
        ls.wantHistory.push({ from: ls.want, to, day, kind: entry.kind });
        ls.want = to;
      }
      return entry;
    },

    // Current mood: base (from the wound) unless a lived-event modifier is
    // still active. Latest active modifier wins.
    lifeseedMood(char, day) {
      const ls = char && char.lifeseed;
      if (!ls) return 'steady';
      const d = day != null ? day : this.lifeseedCurrentDay();
      const voice = ls.voice;
      const base = (voice && voice.baseMood) || 'steady';
      const active = (ls.moodMods || []).filter(m => d < m.until);
      // prune expired while we're here (keeps the record honest)
      if (active.length !== (ls.moodMods || []).length) ls.moodMods = active;
      return active.length ? active[active.length - 1].mood : base;
    },

    lifeseedKin(char, rel) {
      const ls = char.lifeseed;
      if (!ls) return 'someone';
      const p = (ls.people || []).find(x => x.relation === rel) || ls.people[0];
      return p ? p.name.split(' ')[0] : 'someone';
    },

    // ---------- 4. TEXTURE PARAGRAPH ----------
    // 3-4 sentences woven from the seed, appended to the backstory. Specific
    // people, specific places, a skill with an origin, a wound, a want.
    lifeseedText(char) {
      const ls = char.lifeseed;
      if (!ls) return '';
      const first = char.name.split(' ')[0];
      const p0 = ls.people[0];
      const p1 = ls.people[1];
      const soEntries = Object.entries(ls.skillOrigins || {});
      const bits = [];
      // Steve 2026-10-06: backgrounds were "messed up, repetitive, and weird" —
      // em-dash fragments, colon splices, and "What X wants now is simple" on
      // every character. Natural sentences, varied structures, name-anchored
      // (no pronouns to get wrong).
      bits.push(`${first} grew up in ${ls.hometown}, ${ls.regionLand}.`);
      if (p0) {
        const pn = p0.name.split(' ')[0];
        const kinLine = [
          `${first}'s ${p0.relation} ${pn} ${p0.fate}.`,
          `${pn}, ${first}'s ${p0.relation}, ${p0.fate}.`,
        ][Math.floor(R() * 2)];
        bits.push(kinLine.charAt(0).toUpperCase() + kinLine.slice(1));
      }
      if (p1 && R() < 0.7) {
        const pn = p1.name.split(' ')[0];
        const kin2 = [
          `${first}'s ${p1.relation} ${pn} ${p1.fate}.`,
          `${pn} — ${first}'s ${p1.relation} — ${p1.fate}.`,
        ][Math.floor(R() * 2)];
        bits.push(kin2.charAt(0).toUpperCase() + kin2.slice(1));
      }
      if (soEntries.length) {
        const [sk, how] = soEntries[0];
        const skName = { food: 'finding food', medicinal: 'patching people up', mending: 'fixing things', navigation: 'never getting lost', tracking: 'reading ground', trapping: 'traps', forecast: 'reading the sky' }[sk] || sk;
        const howLower = how.charAt(0).toLowerCase() + how.slice(1);
        bits.push(`${first} learned ${skName} ${howLower}.`);
      }
      const eventCap = ls.event.charAt(0).toUpperCase() + ls.event.slice(1);
      const eventLine = [
        `${eventCap} — that's the year everything changed, before the sky did.`,
        `${eventCap}, and everything changed that year, before the sky did.`,
        `Then ${eventCap.charAt(0).toLowerCase() + eventCap.slice(1)}, and nothing was the same after.`,
      ][Math.floor(R() * 3)];
      bits.push(eventLine);
      const wantLine = [
        `${ls.wound} What ${first} wants now is simple: ${ls.want}.`,
        `${ls.wound} These days ${first} wants to ${ls.want}.`,
        `${ls.wound} ${first} keeps coming back to one thing: ${ls.want}.`,
      ][Math.floor(R() * 3)];
      bits.push(wantLine);
      return bits.join(' ');
    },

    // ---------- 5. KEEPSAKE RESOLUTION ----------
    // Fill {kin}/{first}/{place} in item memories and reveal notes from the
    // character's seed. No unreplaced placeholders ever reach the player.
    resolveKeepsakeText(char, def, text) {
      const ls = char.lifeseed;
      const first = char.name.split(' ')[0];
      const kin = (def && def.kin && def.kin !== 'none' && ls) ? this.lifeseedKin(char, def.kin) : 'someone';
      const place = ls && ls.places[0] ? ls.places[0].name : 'somewhere';
      return String(text || '')
        .replaceAll('{kin}', kin)
        .replaceAll('{first}', first)
        .replaceAll('{place}', place);
    },

    // ---------- 6. NPC KEEPSAKE OBSERVATION ----------
    // Their keepsakes are visible to the observant — and lootable from corpses.
    npcKeepsakeLine(vid) {
      try {
        const vp = (this.data.villagers || []).find(v => v.id === vid);
        if (!vp) return '';
        const keeps = (vp.items || [])
          .map(id => (this.data.items || []).find(i => i.id === id))
          .filter(d => d && d.class === 'sentimental');
        if (!keeps.length) return '';
        const names = keeps.slice(0, 2).map(d => d.name).join(' and ');
        return `💛 They carry ${names} — the kind of thing nobody carries by accident.`;
      } catch (e) { return ''; }
    },

    // ---------- 7. PERSONAL POOL ----------
    // ONE pool per character (Steve 2026-10-05): majority semantic (5, drawn
    // from the actual lifeseed — kin, occupation, wound, want, skill),
    // minority utility (3, occupation-biased). Semantic items are among the
    // best in the game via the bond -> enhancement -> secret evolution rails.
    // The player still picks 5 from the 8 — a real choice, not an assignment.
    // No random loot: every semantic item has a plausible connection to its
    // owner's backstory, enforced by the tag fields (occCategories, woundKeys,
    // wantKeys, skillKeys, kin).
    occCategory(occName) {
      const n = String(occName || '').toLowerCase();
      const cats = {
        medical: ['er nurse', 'paramedic', 'midwife', 'dentist', 'pharmacist', 'veterinarian', 'physical therapy aide', 'army medic'],
        food: ['line cook', 'butcher', 'baker', 'chef', 'farmer', 'community gardener', 'mushroom grower', 'rancher', 'fisherman', 'fishing guide', 'wild food forager', 'vintner', 'bartender'],
        craft: ['carpenter', 'mechanic', 'electrician', 'plumber', 'locksmith', 'welder', 'roofer', 'mason', 'hvac tech', 'appliance repair tech', 'blacksmith', 'glazier', 'tailor'],
        outdoors: ['hunting guide', 'trail crew lead', 'sailor', 'bush pilot', 'truck driver', 'beekeeper', 'exterminator'],
        service: ['esl teacher', 'interpreter', 'librarian', 'social worker', 'mortician', 'firefighter', 'police officer', 'emergency dispatcher'],
        creative: ['street artist', 'musician', 'journalist', 'lawyer', 'programmer'],
      };
      for (const [cat, names] of Object.entries(cats)) {
        if (names.some(x => n.includes(x))) return cat;
      }
      return 'service'; // unknown trade -> service (people-facing)
    },

    genPersonalPool(char) {
      const items = this.data.items || [];
      const byId = {};
      items.forEach(i => { byId[i.id] = i; });
      const ls = char.lifeseed || {};
      const pool = [];
      const semCount = { n: 0 };
      const push = (id, isSem) => {
        if (!id || !byId[id] || pool.includes(id)) return false;
        pool.push(id);
        if (isSem) semCount.n++;
        return true;
      };
      const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; };

      // 1-2. KIN KEEPSAKES: sentimental items whose kin EXACTLY matches a lifeseed
      // person (the lifeseed audit enforces exact kin coverage — no near-misses).
      const relations = (ls.people || []).map(p => String(p.relation || '').toLowerCase());
      const kinKeeps = shuffle(items.filter(i => i.class === 'sentimental' && i.kin && i.kin !== 'none' &&
        relations.includes(String(i.kin).toLowerCase())));
      for (const k of kinKeeps.slice(0, 2)) push(k.id, true);

      // 3. OCCUPATION piece: the trade they carried with them.
      const occCat = this.occCategory(char.formerOccupation);
      const occPieces = shuffle(items.filter(i => (i.occCategories || []).includes(occCat)));
      if (occPieces.length) push(occPieces[0].id, true);

      // 4. WOUND / WANT piece: what haunts them, what drives them.
      const woundT = String(ls.wound || '').toLowerCase();
      const wantT = String(ls.want || '').toLowerCase();
      const wwPieces = shuffle(items.filter(i =>
        (i.woundKeys || []).some(k => woundT.includes(String(k).toLowerCase())) ||
        (i.wantKeys || []).some(k => wantT.includes(String(k).toLowerCase()))));
      for (const w of wwPieces) { if (push(w.id, true)) break; }

      // 5. SKILL piece: what their hands learned, and where.
      const skKeys = Object.keys(ls.skillOrigins || {});
      const skPieces = shuffle(items.filter(i => (i.skillKeys || []).some(k => skKeys.includes(k))));
      for (const s of skPieces) { if (push(s.id, true)) break; }

      // Top up semantic to 5 from the keepsake pool — always a keepsake with
      // a memory, never filler. Kin-exact or kinless only (audit enforces it).
      // (A thin seed still gets a personal pool.)
      if (semCount.n < 5) {
        const fill = shuffle(items.filter(i => i.class === 'sentimental' && !pool.includes(i.id) &&
          (!i.kin || i.kin === 'none' || relations.includes(String(i.kin).toLowerCase()))));
        for (const f of fill) { if (semCount.n >= 5) break; push(f.id, true); }
      }

      // 6-8. UTILITY (the minority): occupation-biased tools of survival.
      const occ = ((this.data.characterGen || {}).occupations || [])
        .find(o => String(o.name || '').toLowerCase() === String(char.formerOccupation || '').toLowerCase()) || {};
      const bias = occ.itemBias || {};
      const take = (cls, n) => {
        const poolIds = items.filter(i => i.class === cls && !pool.includes(i.id)).map(i => i.id);
        const favored = (bias[cls] || []).filter(id => byId[id] && byId[id].class === cls && !pool.includes(id));
        const rest = shuffle(poolIds.filter(id => !favored.includes(id)));
        const ordered = [...favored, ...rest];
        for (let k = 0; k < n && ordered.length; k++) push(ordered.shift(), false);
      };
      take('tool', 1); take('weapon', 1); take('clothing', 1);

      return { pool, semantic: semCount.n };
    },

    // ---------- AUDIT ----------
    // The foundation guard: generate N characters, assert depth + coherence.
    // Called by scripts/test-lifeseed.js.
    auditLifeseeds(n) {
      const errors = [];
      const seen = new Set();
      const LS = this.data.lifeseeds || {};
      const allTowns = [];
      for (const r of (LS.regions || [])) for (const t of (r.towns || [])) allTowns.push({ town: t.toLowerCase(), region: r.id });
      // shared registries, like genRoster: no repeats within one cast
      const usedNames = new Set(), usedOccs = new Set();
      for (let i = 0; i < (n || 50); i++) {
        let ch;
        try {
          ch = this.genCharacter({ origin: 'Columbus, Ohio', forceCultureMatch: false, candidate: true, usedNames, usedOccs });
        } catch (e) { errors.push(`gen ${i}: threw ${e.message}`); continue; }
        if (!ch) { errors.push(`gen ${i}: null char`); continue; }
        // names unique
        if (seen.has(ch.name)) errors.push(`duplicate name: ${ch.name}`);
        seen.add(ch.name);
        const firsts = [...seen].map(x => x.split(' ')[0]);
        if (firsts.filter(f => f === ch.name.split(' ')[0]).length > 1) errors.push(`duplicate first name: ${ch.name}`);
        const ls = ch.lifeseed;
        if (!ls) { errors.push(`${ch.name}: no lifeseed`); continue; }
        // seed completeness
        for (const k of ['regionLabel', 'hometown', 'event', 'wound', 'want']) {
          if (!ls[k]) errors.push(`${ch.name}: lifeseed missing ${k}`);
        }
        if ((ls.people || []).length < 2) errors.push(`${ch.name}: fewer than 2 lifeseed people`);
        if ((ls.places || []).length < 1) errors.push(`${ch.name}: no lifeseed places`);
        // kin names are real and not the character
        for (const p of (ls.people || [])) {
          if (!p.name || p.name.split(' ').length < 1) errors.push(`${ch.name}: kin with no name`);
          if (p.name.split(' ')[0] === ch.name.split(' ')[0]) errors.push(`${ch.name}: kin shares own first name`);
        }
        // keepsake kin coverage: every sentimental candidate's kin relation exists in the seed
        for (const id of (ch.items || [])) {
          const def = (this.data.items || []).find(x => x.id === id);
          if (def && def.class === 'sentimental' && def.kin && def.kin !== 'none') {
            const has = (ls.people || []).some(p => p.relation === def.kin);
            if (!has) errors.push(`${ch.name}: keepsake ${id} needs kin '${def.kin}', seed lacks it`);
          }
        }
        // region coherence: no other region's towns named in the texture
        const text = ((ch.backstory || '') + ' ' + (ls.event || '')).toLowerCase();
        for (const t of allTowns) {
          if (t.region !== ls.regionId && t.town.length > 3 && text.includes(t.town)) {
            errors.push(`${ch.name}: region contradiction — '${t.town}' (${t.region}) in a ${ls.regionId} story`);
          }
        }
        // no unreplaced placeholders in backstory
        if (/\{[a-z]+\}/.test(ch.backstory || '')) errors.push(`${ch.name}: unreplaced placeholder in backstory`);
      }
      return { errors: errors.slice(0, 40), total: errors.length, checked: n || 50 };
    },
  };

  Object.assign(Game, methods);

  // ============ WRAPS ============
  (function attach() {
    const _genCharacter = Game.genCharacter;
    Game.genCharacter = function (opts) {
      const ch = _genCharacter ? _genCharacter.call(this, opts) : null;
      if (!ch) return ch;
      try {
        ch.lifeseed = this.genLifeseed(ch);
        const texture = this.lifeseedText(ch);
        if (texture) ch.backstory = (ch.backstory || '') + ' ' + texture;
        // PERSONAL POOL (Steve 2026-10-05): one pool per character, majority
        // semantic, drawn from the lifeseed. Replaces the generic class-based
        // candidates — the player still picks 5 from 8.
        try {
          const pp = this.genPersonalPool(ch);
          if (pp && pp.pool && pp.pool.length >= 5) {
            ch.items = pp.pool;
            ch.personalPoolSemantic = pp.semantic;
          }
        } catch (e) { /* generic pool stands if the seed is thin */ }
      } catch (e) { /* a thin seed is better than a crashed roster */ }
      return ch;
    };
  })();
})();
