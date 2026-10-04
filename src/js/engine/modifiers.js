/* The modifier pipeline — the scalability core.
   Every computed value resolves through here:
     base → collect active modifiers → apply adds, then multiplies → final.
   Abilities, relics, injuries, and conditions all speak this one language,
   so new content never touches engine code. */
(function (global) {
  'use strict';

  // A modifier: {target, op: 'add'|'multiply', value, condition?}
  // condition is a string like "biome:se_woodlands" — evaluated by the caller.

  function resolve(base, target, modifiers, context) {
    let add = 0, mul = 1;
    for (const m of modifiers || []) {
      if (m.target !== target) continue;
      if (m.condition && context && !checkCondition(m.condition, context)) continue;
      if (m.op === 'add') add += m.value;
      else if (m.op === 'multiply') mul *= m.value;
    }
    return (base + add) * mul;
  }

  function checkCondition(cond, ctx) {
    const [k, v] = cond.split(':');
    // Loose compare: ctx values may be numbers (e.g. round:1).
    return ctx && String(ctx[k]) === String(v);
  }

  // Gather modifiers from a scholar's abilities + relics + injuries.
  // abilitiesData: the abilities.json array. In slice 1 this is passed in;
  // later it comes from a content registry.
  // LEVEL SCALING: a modifier with scale:'level' grows with the ability's level.
  //   multiply: value^level (×1.5 at L1 → ×2.25 at L2)
  //   add: value*level
  // Without scale, the modifier applies flat (L1 values). Background abilities
  // level through use too, so they scale the same way.
  function levelOf(entry) {
    return (entry && entry.level) || 1;
  }

  function scaledValue(m, level) {
    if (!m.scale || m.scale !== 'level' || level <= 1) return m.value;
    if (m.op === 'multiply') return Math.pow(m.value, level);
    return m.value * level; // add
  }

  function collectModifiers(scholar, abilitiesData) {
    const out = [];
    const byId = {};
    (abilitiesData || []).forEach(a => { byId[a.id] = a; });
    // abilities may be string IDs (legacy) or objects {id, level, xp} (slice 2+).
    // background abilities count too — they're still abilities.
    const all = (scholar.abilities || []).concat(scholar.backgroundAbilities || []);
    all.forEach(entry => {
      const id = (entry && entry.id) || entry;
      const a = byId[id];
      if (a && a.modifiers) {
        const lvl = levelOf(entry);
        for (const m of a.modifiers) {
          out.push(Object.assign({}, m, { value: scaledValue(m, lvl) }));
        }
      }
    });
    // RELICS: bonded relic enhancements speak the same modifier language.
    // Each enhancement maps to real game targets (see RELIC_MOD_MAP).
    // resolve/anchor are special-cased in game.js (not plain modifiers).
    const relics = [];
    const relicHolders = (scholar.inventory || []).concat(Object.values(scholar.equipped || {}));
    relicHolders.forEach(it => {
      if (!it || !it.bonded) return;
      (it.enhancements || []).forEach(eid => {
        (RELIC_MOD_MAP[eid] || []).forEach(m => relics.push(Object.assign({ source: 'relic:' + (it.name || eid) }, m)));
      });
    });
    out.push(...relics);
    // injuries hook in here in later slices (same shape)
    return out;
  }

  // Relic enhancement -> real game modifier targets.
  // The data files use evocative targets (task.speed, despair.anchor);
  // this table grounds them in mechanics the engine actually reads.
  const RELIC_MOD_MAP = {
    efficient_action: [{ target: 'forage.yield', op: 'multiply', value: 1.25 }],
    never_fails: [{ target: 'hunt.success', op: 'add', value: 0.10 }],
    impossible_edge: [{ target: 'cook.kcal', op: 'multiply', value: 1.10 }],
    weatherproof: [{ target: 'travel.kcal', op: 'multiply', value: 0.9 }],
    second_skin: [{ target: 'rest.energy', op: 'multiply', value: 1.3 }],
    ghost_weave: [{ target: 'travel.encounter', op: 'multiply', value: 0.6 }],
    quiet_luck: [{ target: 'forage.yield', op: 'multiply', value: 1.1 }],
    // --- variability expansion: hidden/rare, affinity, and secret evolutions ---
    whisper_edge: [{ target: 'travel.encounter', op: 'multiply', value: 0.7 }],
    storm_cloth: [{ target: 'travel.kcal', op: 'multiply', value: 0.85 }],
    unseen_hand: [{ target: 'forage.yield', op: 'multiply', value: 1.15 }],
    careful_hands: [{ target: 'forage.yield', op: 'multiply', value: 1.2 }],
    blood_remembers: [{ target: 'hunt.success', op: 'add', value: 0.15 }],
    quick_spark: [{ target: 'forage.yield', op: 'multiply', value: 1.15 }],
    trail_ghost: [{ target: 'travel.encounter', op: 'multiply', value: 0.6 }],
    steady_ground: [{ target: 'travel.kcal', op: 'multiply', value: 0.9 }],
    open_hearth: [{ target: 'trust.gain_mult', op: 'multiply', value: 1.25 }],
    unbreakable: [{ target: 'rest.energy', op: 'multiply', value: 1.2 }],
    her_handwriting: [{ target: 'trust.gain_mult', op: 'multiply', value: 1.5 }],
    last_message: [{ target: 'rest.energy', op: 'multiply', value: 1.5 }],
    inheritance: [{ target: 'trust.gain_mult', op: 'multiply', value: 1.5 }],
    old_ghost: [{ target: 'hunt.success', op: 'add', value: 0.2 }],
    // resolve (morale.break_immunity): once/day ignore starvation health damage — game.js
    // anchor (despair.anchor): hold at 1 HP once/30 days — game.js
  };

  // hasAbility: does this scholar hold the ability? Works for string IDs and objects,
  // system abilities and background abilities. Returns the entry (or level via .level).
  function hasAbility(scholar, id) {
    const all = (scholar.abilities || []).concat(scholar.backgroundAbilities || []);
    return all.find(entry => ((entry && entry.id) || entry) === id) || null;
  }

  function abilityLevel(scholar, id) {
    const e = hasAbility(scholar, id);
    return e ? (e.level || 1) : 0;
  }

  // KNOWLEDGE MODIFIERS: skills from the knowledge taxonomy feed the same pipeline.
  // Knowledge isn't separate from powers — it AMPLIFIES them.
  // Takes codex.skills {skillId: {level}} and knowledge data, returns modifier objects.
  // Mechanical keys map to modifier targets (same language as abilities/relics).
  const KNOWLEDGE_MOD_MAP = {
    // key in knowledge.json mechanical -> modifier target
    'fuel_save': (v) => [{ target: 'fire.fuel', op: 'multiply', value: 1 - v }],
    'fire_success': (v) => [{ target: 'fire.success', op: 'add', value: v }],
    'fire_heat': (v) => [{ target: 'fire.heat', op: 'add', value: v }],
    'heal_bonus': (v) => [{ target: 'heal.amount', op: 'add', value: v }],
    'hunt_find': (v) => [{ target: 'hunt.find', op: 'add', value: v }],
    'hunt_success': (v) => [{ target: 'hunt.success', op: 'add', value: v }],
    'trap_success': (v) => [{ target: 'trap.success', op: 'add', value: v }],
    'combat_crit': (v) => [{ target: 'combat.crit', op: 'add', value: v }],
    'combat_damage': (v) => [{ target: 'combat.damage', op: 'multiply', value: 1 + v }],
    'spoil_slow': (v) => [{ target: 'food.spoil', op: 'multiply', value: 1 - v }],
    'trust_gain': (v) => [{ target: 'trust.gain_mult', op: 'multiply', value: 1 + v }],
    'lie_detect': (v) => [{ target: 'social.lie_detect', op: 'add', value: v }],
    'conflict_resolve': (v) => [{ target: 'social.conflict_resolve', op: 'add', value: v }],
    'fear_resist': (v) => [{ target: 'psych.fear_resist', op: 'add', value: v }],
    'village_morale': (v) => [{ target: 'village.morale', op: 'add', value: v }],
    'storm_warning': (v) => [{ target: 'weather.warning', op: 'add', value: v }],
    'ambush_avoid': (v) => [{ target: 'combat.ambush_avoid', op: 'add', value: v }],
    'scout_find': (v) => [{ target: 'scout.find', op: 'add', value: v }],
    'scavenge_find': (v) => [{ target: 'scavenge.find', op: 'add', value: v }],
    'travel_lost': (v) => [{ target: 'travel.lost', op: 'add', value: v }],
    'party_damage': (v) => [{ target: 'party.damage', op: 'multiply', value: 1 + v }],
    'party_coord': (v) => [{ target: 'party.coord', op: 'add', value: v }],
    'disease_resist': (v) => [{ target: 'health.disease_resist', op: 'add', value: v }],
    'system_favor': (v) => [{ target: 'system.favor', op: 'add', value: v }],
    'shelter_warmth': (v) => [{ target: 'shelter.warmth', op: 'add', value: v }],
  };

  function collectKnowledgeModifiers(codexSkills, knowledgeData) {
    const out = [];
    if (!codexSkills || !knowledgeData) return out;
    for (const [skillId, entry] of Object.entries(codexSkills)) {
      const k = knowledgeData.find(x => x.id === skillId);
      if (!k || !k.mechanical) continue;
      const level = (entry && entry.level) || 1;
      // mechanical effects are keyed by level: {"1": {...}, "2": {...}}
      // apply all levels up to current (cumulative)
      for (let l = 1; l <= level; l++) {
        const mech = k.mechanical[String(l)];
        if (!mech) continue;
        for (const [key, val] of Object.entries(mech)) {
          if (key === 'unlock') continue; // unlocks are handled separately, not as modifiers
          const mapper = KNOWLEDGE_MOD_MAP[key];
          if (mapper) {
            out.push(...mapper(val).map(m => Object.assign({ source: 'knowledge:' + skillId }, m)));
          }
        }
      }
    }
    return out;
  }

  // hasKnowledgeUnlock: does the scholar's knowledge unlock a specific action?
  function hasKnowledgeUnlock(codexSkills, knowledgeData, unlockId) {
    if (!codexSkills || !knowledgeData) return false;
    for (const [skillId, entry] of Object.entries(codexSkills)) {
      const k = knowledgeData.find(x => x.id === skillId);
      if (!k || !k.mechanical) continue;
      const level = (entry && entry.level) || 1;
      for (let l = 1; l <= level; l++) {
        const mech = k.mechanical[String(l)];
        if (mech && mech.unlock === unlockId) return true;
      }
    }
    return false;
  }

  global.Scattering = global.Scattering || {};
  global.Scattering.modifiers = { resolve, collectModifiers, checkCondition, collectKnowledgeModifiers, hasKnowledgeUnlock };
  global.Scattering.hasAbility = hasAbility;
  global.Scattering.abilityLevel = abilityLevel;
})(typeof window !== 'undefined' ? window : globalThis);
