// @ontology
// system: metaProgression
// description: Persistent cross-run achievement codex ("Records"). A per-device record of knowledge and content encountered across ALL runs — the meta incentive to replay until everything has been seen. New games start completely fresh; achievements NEVER grant power, knowledge, or items.
// provides:
//   - metaGet()
//   - metaSave()
//   - metaReset()
//   - metaUnlock(id)
//   - metaList()
//   - metaSummary()
//   - metaNotePlant(pid)
//   - metaNoteAnimal(aid)
//   - metaNoteMonster(mid)
//   - metaNoteMonsterNamed(mid)
//   - metaNoteWaveKill(monsterId)
//   - metaNoteWaveUnlocked(wave)
//   - metaNoteArc(n)
//   - metaNoteCrisis(kind)
//   - metaNoteContest(contestId, outcome)
//   - metaNotePlayerContest(outcome, watched)
//   - metaNoteTable(frame)
//   - metaNoteTableChoice(frame, choiceId)
//   - metaNoteLegend(outcome)
//   - metaNoteSystemArrival()
//   - metaNoteDisease(effectId)
//   - metaNoteCure(effectId)
// rules:
//   - read_only_power: achievements write ONLY to localStorage key oversight.meta.v1. They never touch game state, save slots, knowledge, or items. A fresh game is provably unaffected (code: every metaNote* writes store-only; test-meta-progression-20261010.js)
//   - corrupt_safe: corrupt stored JSON resets that key; nothing ever throws out of the meta layer (code: metaGet/metaSave try/catch)
//   - defensive_wrap: hooks wrap existing Game methods at load; an absent method is skipped silently; every hook is exception-guarded so a meta failure can never break gameplay (code: wrapHook)
//   - no_leak_hints: unmet achievements render as ??? with a vague hint, never content — "if you don't know, it doesn't show" (code: metaList, app.js recordsScreen)
//   - data_driven_thresholds: "encounter them all" tiers count against Game.data at check time, never hardcoded totals (code: metaNotePlant/metaNoteAnimal/metaNoteMonster)
// consumes:
//   - (none persistently — reads game state only transiently at event time; owns localStorage key oversight.meta.v1)
// ============ META PROGRESSION — THE CROSS-RUN RECORDS ============
// Steve's directive (2026-10-10): "We should have a meta progression outside
// the game of a completed codex. New games don't start with it but it's part
// of an achievement system. That way gives more incentive along with other
// meta progression to keep playing games until you've encountered all the
// knowledge in the game."
//
// So: a permanent per-device record of knowledge/content encountered across
// ALL runs. New games start completely fresh (no power/knowledge inheritance
// — the roguelite boundary holds); the achievement record is the incentive
// to replay until everything has been seen.
//
// Self-attaching module: Object.assign(Game, methods) + defensive wraps.
// Load after progression.js (placed after statusEffects.js so every hooked
// method — including applyStatus/cureStatus — exists at wrap time).
//
// Disease roster canon: docs/DISEASES.md — two pools, never mixed.

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;

  const STORE_KEY = 'oversight.meta.v1';

  // Disease canon (docs/DISEASES.md, 2026-10-09): two pools, never mixed.
  const MUNDANE_DISEASES = { gutrot: 1, trichinosis: 1, disease: 1, lockjaw: 1, wound_fever: 1, trembles: 1 };
  const ALIEN_DISEASES = { howlbelly: 1, gristlefit: 1, croakbelly: 1, shellgut: 1, witness_maw: 1, flockmind: 1, eurika: 1, east_nile: 1, lemons: 1 };

  // ---- achievement data: {id, cat, name, desc, hint} ----
  // Unmet achievements show as ??? with the hint only — never content.
  const CATS = [
    ['flora', '🌿 Flora'],
    ['fauna', '🐾 Fauna'],
    ['monsters', '👹 Monsters'],
    ['escalation', '📈 The Escalation'],
    ['show', '📺 The Show'],
    ['arcs', '◈ The Long Haul'],
    ['table', '🌌 The Table'],
    ['sickness', '🤒 Sickness'],
    ['milestones', '⭐ Milestones'],
  ];
  const ACH = [
    // flora
    { id: 'mp-first', cat: 'flora', name: 'First Word', desc: 'Identify your first plant.', hint: 'Learn a green thing\u2019s true name.' },
    { id: 'mp-10', cat: 'flora', name: 'Field Botanist', desc: 'Identify 10 different plants.', hint: 'Keep asking the green things who they are.' },
    { id: 'mp-25', cat: 'flora', name: 'Walking Herbarium', desc: 'Identify 25 different plants.', hint: 'More than half the green kingdom, named.' },
    { id: 'mp-all', cat: 'flora', name: 'The Whole Green', desc: 'Identify every plant species in the game.', hint: 'All of them. Every last leaf.' },
    // fauna
    { id: 'ma-first', cat: 'fauna', name: 'Meat, With a Name', desc: 'Learn your first animal.', hint: 'Learn what runs, and how it runs.' },
    { id: 'ma-12', cat: 'fauna', name: 'Tracker', desc: 'Learn 12 different animals.', hint: 'The herd is bigger than you think.' },
    { id: 'ma-30', cat: 'fauna', name: 'The Whole Herd', desc: 'Learn 30 different animals.', hint: 'Most of what walks, named.' },
    { id: 'ma-all', cat: 'fauna', name: 'Every Footprint', desc: 'Learn every animal in the game.', hint: 'All of them. Every last track.' },
    // monsters
    { id: 'mm-first', cat: 'monsters', name: 'First Contact', desc: 'Encounter your first monster and live to log it.', hint: 'Something is out there. Go find out. (Survive.)' },
    { id: 'mm-8', cat: 'monsters', name: 'Monster Watch', desc: 'Encounter 8 different monsters.', hint: 'The treeline has more surprises.' },
    { id: 'mm-20', cat: 'monsters', name: 'The Menagerie', desc: 'Encounter 20 different monsters.', hint: 'Most of what hunts, catalogued.' },
    { id: 'mm-all', cat: 'monsters', name: 'Complete Bestiary', desc: 'Encounter every monster in the game.', hint: 'All of them. Even the funny ones.' },
    { id: 'mm-named', cat: 'monsters', name: 'Name It to Tame It', desc: 'The village agrees on a monster\u2019s name through talk.', hint: 'Debate a beast\u2019s name until everyone agrees.' },
    { id: 'mm-named5', cat: 'monsters', name: 'The Naming Committee', desc: 'The village names 5 different monsters.', hint: 'Keep holding the moots. Keep voting.' },
    // escalation
    { id: 'mw-2', cat: 'escalation', name: 'It Notices You', desc: 'Face wave 2.', hint: 'Survive long enough and the show escalates.' },
    { id: 'mw-3', cat: 'escalation', name: 'It Gets Worse', desc: 'Face wave 3.', hint: 'The escalation has an escalation.' },
    { id: 'mw-4', cat: 'escalation', name: 'Apex Hour', desc: 'Face wave 4.', hint: 'The final form of the show\u2019s attention.' },
    { id: 'mw-k4', cat: 'escalation', name: 'Apex Slayer', desc: 'Kill a wave-4 creature.', hint: 'Kill the worst thing the show can send.' },
    { id: 'mw-25k', cat: 'escalation', name: 'Exterminator', desc: '25 monster kills across all runs.', hint: 'Keep killing. It keeps counting.' },
    // show
    { id: 'mc-first', cat: 'show', name: 'Taken', desc: 'Survive your first contest.', hint: 'The show will take you. Come back.' },
    { id: 'mc-win', cat: 'show', name: 'Champion', desc: 'Win a contest.', hint: 'Win one. The lights are warm.' },
    { id: 'mc-win5', cat: 'show', name: 'Fan Favorite', desc: 'Win 5 contests.', hint: 'The audience starts chanting your name.' },
    { id: 'mc-watch', cat: 'show', name: 'Student of the Game', desc: 'Study a contest from the stands.', hint: 'Watch someone else bleed. Learn.' },
    { id: 'mc-died', cat: 'show', name: 'Feed the Reels', desc: 'Die in the arena.', hint: 'The Death Reel needs content too.' },
    // arcs
    { id: 'ma2', cat: 'arcs', name: 'The Show Must Go On', desc: 'Reach Arc II — The Show.', hint: 'Keep the village alive. The sky will notice.' },
    { id: 'ma3', cat: 'arcs', name: 'Engines', desc: 'Reach Arc III — Engines.', hint: 'Become something worth compounding.' },
    { id: 'ma4', cat: 'arcs', name: 'The Inefficiency', desc: 'Reach Arc IV — The Inefficiency.', hint: 'The last arc. The point of all of it.' },
    // table
    { id: 'mt-table', cat: 'table', name: 'The Table', desc: 'Reach the galactic table and present humanity\u2019s case.', hint: 'Survive everything. Get a seat.' },
    { id: 'mt-f-indispensable', cat: 'table', name: 'The Indispensable', desc: 'Reach the table as the Indispensable.', hint: 'Become the one the galaxy needs.' },
    { id: 'mt-f-feared', cat: 'table', name: 'The Feared', desc: 'Reach the table as the Feared.', hint: 'Become the one the table fears.' },
    { id: 'mt-f-beloved', cat: 'table', name: 'The Beloved', desc: 'Reach the table as the Beloved.', hint: 'Become the audience\u2019s favorite.' },
    { id: 'mt-f-witness', cat: 'table', name: 'The Witness', desc: 'Reach the table as the Witness.', hint: 'Become the one who kept the list.' },
    { id: 'mt-f-defiant', cat: 'table', name: 'The Defiant', desc: 'Reach the table as the Defiant.', hint: 'Become the one who said no.' },
    { id: 'mt-f-assimilated', cat: 'table', name: 'The Assimilated', desc: 'Reach the table as the Assimilated.', hint: 'Become the comfortable one.' },
    { id: 'mt-choice', cat: 'table', name: 'The Last Word', desc: 'Make the final live choice.', hint: 'Choose, at the end of everything.' },
    // sickness
    { id: 'md-m1', cat: 'sickness', name: 'Shouldn\u2019t Have Drunk That', desc: 'Contract a mundane disease.', hint: 'Risk the creek. See what happens.' },
    { id: 'md-m3', cat: 'sickness', name: 'Frequent Patient', desc: 'Contract 3 different mundane diseases.', hint: 'Collect the earthly afflictions.' },
    { id: 'md-cure', cat: 'sickness', name: 'Walked It Off', desc: 'Cure or survive a mundane disease.', hint: 'Get sick. Get better. Tell the story.' },
    { id: 'md-a1', cat: 'sickness', name: 'Warped', desc: 'Contract an alien affliction.', hint: 'Eat the wrong meat. Get bitten. Change.' },
    { id: 'md-a3', cat: 'sickness', name: 'The Collection', desc: 'Contract 3 different alien afflictions.', hint: 'Let the alien biology in. Thrice.' },
    // milestones
    { id: 'mx-s7', cat: 'milestones', name: 'Day Seven', desc: 'The System arrives.', hint: 'Survive a week. Something arrives.' },
    { id: 'mx-crisis', cat: 'milestones', name: 'It Got Real', desc: 'Live through your first crisis.', hint: 'The worst day. Survive it.' },
    { id: 'mx-grave', cat: 'milestones', name: 'The First Grave', desc: 'Bury the village\u2019s first dead.', hint: 'Someone won\u2019t make it. Honor them.' },
    { id: 'mx-win', cat: 'milestones', name: 'A Story Worth Telling', desc: 'End a run with Haven standing.', hint: 'Finish a run. Leave a legend.' },
    { id: 'mx-death', cat: 'milestones', name: 'The Village Remembers', desc: 'End a run in death.', hint: 'Not every story ends standing.' },
  ];
  const ACH_BY_ID = {};
  for (const a of ACH) ACH_BY_ID[a.id] = a;

  // ---- storage: localStorage with in-memory fallback (node harness) ----
  const _mem = {};
  function storage() {
    try {
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch (e) {}
    return {
      getItem: k => (k in _mem ? _mem[k] : null),
      setItem: (k, v) => { _mem[k] = String(v); },
      removeItem: k => { delete _mem[k]; },
    };
  }

  function freshStore() {
    return {
      v: 1,
      unlocked: {},           // achId -> {at}
      seen: { plant: {}, animal: {}, monster: {}, monsterNamed: {}, contest: {}, crisis: {} },
      count: { monsterKills: 0, waveKills: {}, contestRuns: 0, contestWins: 0, contestSurvived: 0, contestWatched: 0, contestDeaths: 0 },
      disease: { contracted: {}, cured: {} },
      table: { frames: {}, choices: {} },
      arcs: {},
      waves: {},
      legend: { wins: 0, deaths: 0 },
      systemArrival: false,
    };
  }

  const methods = {
    // metaGet: load the store; corrupt data resets the key, never crashes.
    metaGet() {
      try {
        const raw = storage().getItem(STORE_KEY);
        if (!raw) return freshStore();
        const s = JSON.parse(raw);
        if (!s || typeof s !== 'object' || s.v !== 1) { this.metaReset(); return freshStore(); }
        // tolerate missing sub-objects from older writes
        const f = freshStore();
        for (const k of Object.keys(f)) if (s[k] !== undefined) f[k] = s[k];
        return f;
      } catch (e) {
        try { this.metaReset(); } catch (e2) {}
        return freshStore();
      }
    },
    // metaSave: write-through; failure (quota/private mode) is silent.
    metaSave(store) {
      try { storage().setItem(STORE_KEY, JSON.stringify(store || this._metaCache || freshStore())); }
      catch (e) {}
    },
    metaReset() {
      try { storage().removeItem(STORE_KEY); } catch (e) {}
      this._metaCache = freshStore();
    },
    _meta() {
      if (!this._metaCache) this._metaCache = this.metaGet();
      return this._metaCache;
    },
    _metaCommit() {
      // write-through so progress survives even if the tab dies mid-run
      this.metaSave(this._metaCache);
    },
    // metaUnlock(id): returns the def on first unlock, null otherwise.
    // NEVER touches game state — store-only by construction.
    metaUnlock(id) {
      const def = ACH_BY_ID[id];
      if (!def) return null;
      const s = this._meta();
      if (s.unlocked[id]) return null;
      s.unlocked[id] = { at: Date.now() };
      this._metaCommit();
      try { if (typeof Game.toast === 'function') Game.toast('\u{1F3C6} ' + def.name + ' \u2014 ' + def.desc); } catch (e) {}
      return def;
    },
    metaList() {
      const s = this._meta();
      return ACH.map(a => ({
        id: a.id, cat: a.cat, name: a.name, desc: a.desc, hint: a.hint,
        unlocked: !!s.unlocked[a.id],
        at: s.unlocked[a.id] ? s.unlocked[a.id].at : null,
      }));
    },
    metaSummary() {
      const s = this._meta();
      const byCat = {};
      for (const [cid, clabel] of CATS) byCat[cid] = { label: clabel, total: 0, unlocked: 0 };
      for (const a of ACH) {
        byCat[a.cat].total++;
        if (s.unlocked[a.id]) byCat[a.cat].unlocked++;
      }
      return { total: ACH.length, unlocked: Object.keys(s.unlocked).length, byCat };
    },

    // ---- event notes: each is store-only, exception-guarded by the wraps ----
    metaNotePlant(pid) {
      if (!pid) return;
      const s = this._meta();
      if (s.seen.plant[pid]) return;
      s.seen.plant[pid] = 1;
      const n = Object.keys(s.seen.plant).length;
      const total = ((this.data || {}).plants || []).length;
      if (n >= 1) this.metaUnlock('mp-first');
      if (n >= 10) this.metaUnlock('mp-10');
      if (n >= 25) this.metaUnlock('mp-25');
      if (total > 0 && n >= total) this.metaUnlock('mp-all');
      else this._metaCommit();
    },
    metaNoteAnimal(aid) {
      if (!aid) return;
      const s = this._meta();
      if (s.seen.animal[aid]) return;
      s.seen.animal[aid] = 1;
      const n = Object.keys(s.seen.animal).length;
      const total = ((this.data || {}).animals || []).length;
      if (n >= 1) this.metaUnlock('ma-first');
      if (n >= 12) this.metaUnlock('ma-12');
      if (n >= 30) this.metaUnlock('ma-30');
      if (total > 0 && n >= total) this.metaUnlock('ma-all');
      else this._metaCommit();
    },
    metaNoteMonster(mid) {
      if (!mid) return;
      const s = this._meta();
      if (s.seen.monster[mid]) return;
      s.seen.monster[mid] = 1;
      const n = Object.keys(s.seen.monster).length;
      const total = ((this.data || {}).monsters || []).length;
      if (n >= 1) this.metaUnlock('mm-first');
      if (n >= 8) this.metaUnlock('mm-8');
      if (n >= 20) this.metaUnlock('mm-20');
      if (total > 0 && n >= total) this.metaUnlock('mm-all');
      else this._metaCommit();
    },
    metaNoteMonsterNamed(mid) {
      if (!mid) return;
      const s = this._meta();
      if (s.seen.monsterNamed[mid]) return;
      s.seen.monsterNamed[mid] = 1;
      const n = Object.keys(s.seen.monsterNamed).length;
      if (n >= 1) this.metaUnlock('mm-named');
      if (n >= 5) this.metaUnlock('mm-named5');
      else this._metaCommit();
    },
    metaNoteWaveKill(monsterId) {
      const s = this._meta();
      s.count.monsterKills++;
      let wave = 0;
      try {
        const mdef = ((this.data || {}).monsters || []).find(m => m.id === monsterId);
        wave = (mdef && mdef.wave) || 0;
      } catch (e) {}
      if (wave > 0) {
        s.count.waveKills[wave] = (s.count.waveKills[wave] || 0) + 1;
        if (wave >= 4) this.metaUnlock('mw-k4');
      }
      if (s.count.monsterKills >= 25) this.metaUnlock('mw-25k');
      else this._metaCommit();
    },
    metaNoteWaveUnlocked(wave) {
      wave = wave | 0;
      if (wave < 1) return;
      const s = this._meta();
      if (s.waves[wave]) return;
      s.waves[wave] = 1;
      if (wave >= 2) this.metaUnlock('mw-2');
      if (wave >= 3) this.metaUnlock('mw-3');
      if (wave >= 4) this.metaUnlock('mw-4');
      else this._metaCommit();
    },
    metaNoteArc(n) {
      n = n | 0;
      if (n < 2) return;
      const s = this._meta();
      if (s.arcs[n]) return;
      s.arcs[n] = 1;
      if (n === 2) this.metaUnlock('ma2');
      else if (n === 3) this.metaUnlock('ma3');
      else if (n === 4) this.metaUnlock('ma4');
      else this._metaCommit();
    },
    metaNoteCrisis(kind) {
      const s = this._meta();
      const k = kind || 'unknown';
      let dirty = false;
      if (!s.seen.crisis[k]) { s.seen.crisis[k] = 1; dirty = true; }
      const any = Object.keys(s.seen.crisis).length > 0;
      if (any) this.metaUnlock('mx-crisis');
      if (k === 'first-grave') this.metaUnlock('mx-grave');
      else if (dirty) this._metaCommit();
    },
    metaNoteContest(contestId, outcome) {
      if (!contestId) return;
      const s = this._meta();
      if (!s.seen.contest[contestId]) {
        s.seen.contest[contestId] = { outcome: outcome || 'seen' };
        this._metaCommit();
      }
      if (outcome === 'watched' || outcome === 'studied') {
        s.count.contestWatched++;
        this.metaUnlock('mc-watch');
      } else this._metaCommit();
    },
    // metaNotePlayerContest(outcome, watched): the PLAYER's own contest fate.
    metaNotePlayerContest(outcome, watched) {
      const s = this._meta();
      if (watched) {
        s.count.contestWatched++;
        this.metaUnlock('mc-watch');
        return;
      }
      if (outcome === 'won') {
        s.count.contestRuns++; s.count.contestWins++; s.count.contestSurvived++;
        this.metaUnlock('mc-first');
        this.metaUnlock('mc-win');
        if (s.count.contestWins >= 5) this.metaUnlock('mc-win5');
        else this._metaCommit();
      } else if (outcome === 'lost' || outcome === 'survived') {
        s.count.contestRuns++; s.count.contestSurvived++;
        this.metaUnlock('mc-first');
      } else if (outcome === 'died') {
        s.count.contestRuns++; s.count.contestDeaths++;
        this.metaUnlock('mc-died');
      } else this._metaCommit();
    },
    metaNoteTable(frame) {
      if (!frame) return;
      const s = this._meta();
      s.table.frames[frame] = 1;
      this.metaUnlock('mt-table');
      if (ACH_BY_ID['mt-f-' + frame]) this.metaUnlock('mt-f-' + frame);
      else this._metaCommit();
    },
    metaNoteTableChoice(frame, choiceId) {
      const s = this._meta();
      if (frame && choiceId) s.table.choices[frame + ':' + choiceId] = 1;
      this.metaUnlock('mt-choice');
    },
    metaNoteLegend(outcome) {
      const s = this._meta();
      if (outcome === 'haven-endures' || outcome === 'table') {
        s.legend.wins++;
        this.metaUnlock('mx-win');
      } else if (outcome === 'died' || outcome === 'village-lost') {
        s.legend.deaths++;
        this.metaUnlock('mx-death');
      } else this._metaCommit();
    },
    metaNoteSystemArrival() {
      const s = this._meta();
      if (s.systemArrival) return;
      s.systemArrival = true;
      this.metaUnlock('mx-s7');
    },
    metaNoteDisease(effectId) {
      if (!effectId) return;
      const s = this._meta();
      const pool = MUNDANE_DISEASES[effectId] ? 'mundane' : (ALIEN_DISEASES[effectId] ? 'alien' : null);
      if (!pool) return;
      if (s.disease.contracted[effectId]) return;
      s.disease.contracted[effectId] = 1;
      const nm = Object.keys(s.disease.contracted).filter(id => MUNDANE_DISEASES[id]).length;
      const na = Object.keys(s.disease.contracted).filter(id => ALIEN_DISEASES[id]).length;
      if (nm >= 1) this.metaUnlock('md-m1');
      if (nm >= 3) this.metaUnlock('md-m3');
      if (na >= 1) this.metaUnlock('md-a1');
      if (na >= 3) this.metaUnlock('md-a3');
      else this._metaCommit();
    },
    metaNoteCure(effectId) {
      if (!effectId || !MUNDANE_DISEASES[effectId]) return;
      const s = this._meta();
      s.disease.cured[effectId] = 1;
      this.metaUnlock('md-cure');
    },
  };

  Object.assign(Game, methods);

  // ============ WRAPS ============
  // Defensive: an absent method is skipped silently; every hook is
  // exception-guarded so a meta failure can never break gameplay.
  function wrapHook(name, after, before) {
    const orig = Game[name];
    if (typeof orig !== 'function') return;
    Game[name] = function metaWrapped(...args) {
      let pre = null;
      if (before) { try { pre = before.call(this, args); } catch (e) {} }
      const r = orig.apply(this, args);
      if (after) { try { after.call(this, args, r, pre); } catch (e) {} }
      return r;
    };
  }

  (function attach() {
    // knowledge: plants
    wrapHook('identifyPlant', function (args) {
      const pid = args[0];
      try { if (this.state && this.state.codex && this.state.codex.plants && this.state.codex.plants[pid]) this.metaNotePlant(pid); } catch (e) {}
    });
    // knowledge: animals (_noteAnimalDepth returns false on no-op)
    wrapHook('_noteAnimalDepth', function (args, r) {
      if (r) this.metaNoteAnimal(args[0]);
    });
    // knowledge: monsters — every encounter, plus the wave it belongs to
    wrapHook('ensureMonsterEntry', function (args) {
      const mid = args[0];
      this.metaNoteMonster(mid);
      try {
        const mdef = ((this.data || {}).monsters || []).find(m => m.id === mid);
        if (mdef && mdef.wave) this.metaNoteWaveUnlocked(mdef.wave);
      } catch (e) {}
    });
    // the village agrees on a monster's name through talk
    wrapHook('monsterNamingCheck', function (args) {
      const mid = args[0];
      try {
        const e = ((this.state || {}).codex || {}).monsters || {};
        if (e[mid] && e[mid].villageName) this.metaNoteMonsterNamed(mid);
      } catch (e2) {}
    });
    // kills by wave (recordWaveKill already resolves the monster's wave)
    wrapHook('recordWaveKill', function (args) {
      this.metaNoteWaveKill(args[0]);
    });
    // escalation: unlockedWave is pure — record the max seen; a drop means a new run
    let _waveMax = 1;
    wrapHook('unlockedWave', function (args, r) {
      const w = r | 0;
      if (w < _waveMax) _waveMax = w; // new run starts at wave 1
      if (w > _waveMax) { _waveMax = w; this.metaNoteWaveUnlocked(w); }
    });
    // arcs
    wrapHook('arcBeat', function (args) {
      this.metaNoteArc(args[0]);
    });
    // crises
    wrapHook('noteCrisis', function (args) {
      this.metaNoteCrisis(args[0]);
    });
    // contest knowledge (watched/studied/learned)
    wrapHook('contestLearn', function (args) {
      this.metaNoteContest(args[0], args[1]);
    });
    // the player's own contest fate: won / lost / died
    wrapHook('_contestEnd', function (args) {
      const ac = args[0] || {};
      const watched = !!(ac.participant && ac.participant !== 'player');
      this.metaNotePlayerContest(args[1], watched);
    });
    wrapHook('_showEnd', function (args) {
      this.metaNotePlayerContest(args[1], true);
    });
    wrapHook('_contestDie', function () {
      this.metaNotePlayerContest('died', false);
    });
    // the table: frame reached (tableScene sets scholar.tableChoices)
    wrapHook('tableScene', function () {
      try {
        const tc = ((this.state || {}).scholar || {}).tableChoices;
        if (tc && tc.frame) this.metaNoteTable(tc.frame);
      } catch (e) {}
    });
    // the final live choice — capture BEFORE the original (it clears tableChoices)
    wrapHook('chooseTableOption', function (args, r, pre) {
      if (pre && pre.frame) this.metaNoteTableChoice(pre.frame, pre.choiceId);
    }, function (origArgs) {
      try {
        const tc = ((this.state || {}).scholar || {}).tableChoices;
        return tc ? { frame: tc.frame, choiceId: (origArgs && origArgs[0]) || null } : null;
      } catch (e) { return null; }
    });
    // legend: how the run ended
    wrapHook('recordLegend', function () {
      try {
        const lin = (this.lineage && this.lineage()) || [];
        const last = lin[lin.length - 1];
        if (last && last.outcome) this.metaNoteLegend(last.outcome);
      } catch (e) {}
    });
    // day-7 system arrival
    wrapHook('checkSystemArrival', function () {
      try { if (this.state && this.state.systemArrived) this.metaNoteSystemArrival(); } catch (e) {}
    });
    // diseases: the single application path (canon: two pools, never mixed).
    // applyStatus returns true only when the effect actually landed.
    wrapHook('applyStatus', function (args, r) {
      if (r && args[0] === 'scholar') this.metaNoteDisease(args[1]);
    });
    wrapHook('cureStatus', function (args, r) {
      if (r && args[0] === 'scholar') this.metaNoteCure(args[1]);
    });
  })();
})();
