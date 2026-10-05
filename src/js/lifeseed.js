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

      return {
        regionId: region.id,
        regionLabel: region.label,
        regionLand: region.land,
        hometown: town,
        workplace,
        people,
        places,
        event: fillBasic(pick(LS.events || ['a hard year'])),
        wound: fillBasic(pick(LS.wounds || ['a quiet grief'])),
        want: fillBasic(pick(LS.wants || ['keep going'])).replaceAll('{kin}', kinName()),
        skillOrigins,
      };
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
      bits.push(`${first} grew up in ${ls.hometown}, ${ls.regionLand}.`);
      if (p0) bits.push(`${p0.name.split(' ')[0]} — ${p0.relation} — ${p0.fate}.`);
      if (p1 && R() < 0.7) bits.push(`And ${p1.name.split(' ')[0]}, ${p1.relation}: ${p1.fate}.`);
      if (soEntries.length) {
        const [sk, how] = soEntries[0];
        const skName = { food: 'finding food', medicinal: 'patching people up', mending: 'fixing things', navigation: 'never getting lost', tracking: 'reading ground', trapping: 'traps', forecast: 'reading the sky' }[sk] || sk;
        bits.push(`${first} learned ${skName} ${how.charAt(0).toLowerCase() + how.slice(1)}.`);
      }
      bits.push(`${ls.event.charAt(0).toUpperCase() + ls.event.slice(1)} — that's the year everything changed, before the sky did.`);
      bits.push(`${ls.wound} What ${first} wants now is simple: ${ls.want}.`);
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
      } catch (e) { /* a thin seed is better than a crashed roster */ }
      return ch;
    };
  })();
})();
