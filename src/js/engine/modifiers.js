// @ontology
// system: modifier-pipeline
// description: The scalability core. Every computed value resolves base -> collect modifiers -> apply adds, then multiplies -> final. Also provides provenance (describeModifiers), knowledge-gated visibility (visibleFor), stacking honesty (diminish curves), and content validation (validateModifiers).
// provides:
//   - resolve(base, target, modifiers, context)
//   - checkCondition(cond, ctx)
//   - levelOf(entry)
//   - scaledValue(m, level)
//   - collectModifiers(scholar, abilitiesData)
//   - hasAbility(scholar, id)
//   - abilityLevel(scholar, id)
//   - collectKnowledgeModifiers(codexSkills, knowledgeData)
//   - hasKnowledgeUnlock(codexSkills, knowledgeData, unlockId)
//   - describeModifiers(target, modifiers, context, knowledgeCtx)
//   - visibleFor(modifier, knowledgeCtx)
//   - describeTarget(target)
//   - validateModifiers(modifiers)
// rules:
//   - resolve applies adds first, then multiplies: (base + adds) * mul. Modifiers without a diminish declaration behave exactly as before (code: modifiers.js).
//   - Multiplicative stacking is across distinct sources; additive stacking is per add (same-source adds stack linearly) (code: modifiers.js).
//   - diminish declarations are data, not engine special-cases: soft caps approach the cap asymptotically, hard caps clamp (code: modifiers.js).
//   - describeModifiers only lists modifiers that resolve() would actually apply (target match + condition pass) (code: modifiers.js).
//   - Knowledge-gated visibility never leaks numbers: an unknown source renders as a vague line, never a value (code: modifiers.js).
// consumes:
//   - (none documented)
/* The modifier pipeline — the scalability core.
   Every computed value resolves through here:
     base → collect active modifiers → apply adds, then multiplies → final.
   Abilities, relics, injuries, and conditions all speak this one language,
   so new content never touches engine code.

   DEPTH (Steve 2026-10-05): provenance, knowledge-gated visibility, stacking
   honesty. All additive and API-compatible:
     - describeModifiers(): every number the pipeline applies can be explained
       in human words (Steve's rule: no silent numbers).
     - visibleFor(): "if you don't know, it doesn't show" — a modifier whose
       source the scholar hasn't identified renders vague, never numeric.
     - diminish: content declares stacking limits in data (soft/hard caps);
       validateModifiers() flags pathological declarations for the pipeline. */
(function (global) {
  'use strict';

  // A modifier: {target, op: 'add'|'multiply', value, condition?}
  // condition is a string like "biome:se_woodlands" — evaluated by the caller.
  //
  // Provenance (optional): {label, source, level}
  //   label: human display name, e.g. "Keen Nose (Mira's kit)" or "Iron Rations".
  //   source: machine tag, e.g. "ability:keen_nose", "relic:Iron Rations",
  //           "knowledge:forage_id", "injury:sprained_ankle".
  //   level: the ability/skill level that produced the scaled value.
  //
  // Knowledge gate (optional): {knownBy}
  //   knownBy: a key string ("ability:keen_nose", "codex:monsters/hushwolf"),
  //   or a predicate fn(knowledgeCtx) -> boolean. Engine never imports game
  //   state; the caller supplies the knowledge context.
  //
  // Stacking honesty (optional): {diminish, diminishCap, diminishGroup}
  //   diminish: 'soft' | 'hard'. Modifiers sharing a diminish group combine
  //   with diminishing returns instead of linear stacking.
  //   diminishCap: the asymptote (soft) or clamp (hard). Defaults below.
  //   diminishGroup: explicit group name; defaults to target|op|kind.

  function resolve(base, target, modifiers, context) {
    let add = 0, mul = 1;
    const groups = {}; // diminish groups, applied after the plain pipeline
    for (const m of modifiers || []) {
      if (m.target !== target) continue;
      if (m.condition && context && !checkCondition(m.condition, context)) continue;
      if (m.diminish && DIMINISH[m.diminish]) {
        const key = m.diminish + '|' + (m.diminishGroup || (m.target + ':' + m.op));
        (groups[key] = groups[key] || []).push(m);
        continue;
      }
      if (m.op === 'add') add += m.value;
      else if (m.op === 'multiply') mul *= m.value;
    }
    for (const key of Object.keys(groups)) {
      const g = groups[key];
      const kind = g[0].diminish, op = g[0].op;
      const cap = g[0].diminishCap != null ? g[0].diminishCap : DIMINISH_DEFAULT_CAP[kind][op === 'multiply' ? 'mul' : 'add'];
      if (op === 'multiply') mul *= diminishMul(g, kind, cap);
      else add += diminishAdd(g, kind, cap);
    }
    return (base + add) * mul;
  }

  // DIMINISH: stacking-honesty curves. Min-maxing is welcome; only true
  // infinite stacking is prevented, and only when content opts in via data.
  //   soft: total bonus B approaches cap asymptotically: 1 + B/(1+B/C).
  //         Five identical ×1.5 forages with soft cap 1.0 give ×1.83, not ×7.6.
  //   hard: total bonus B clamps at the cap: 1 + min(B, C).
  const DIMINISH = { soft: true, hard: true };
  const DIMINISH_DEFAULT_CAP = {
    soft: { mul: 1.0, add: 50 },  // mul: bonus can't exceed +100% effective; add: +50
    hard: { mul: 0.5, add: 25 },
  };

  function diminishMul(group, kind, cap) {
    let bonus = 0;
    for (const m of group) bonus += (m.value - 1);
    if (kind === 'hard') bonus = Math.min(bonus, cap);
    else bonus = cap * bonus / (cap + Math.abs(bonus)); // soft asymptote at cap
    return 1 + bonus;
  }

  function diminishAdd(group, kind, cap) {
    let total = 0;
    for (const m of group) total += m.value;
    if (kind === 'hard') {
      return Math.max(-cap, Math.min(cap, total));
    }
    return cap * total / (cap + Math.abs(total)); // soft asymptote at ±cap
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
  //
  // PROVENANCE: every collected modifier carries source/label/level so
  // describeModifiers can explain it. knownBy defaults to the source key —
  // callers wire knowledgeCtx to decide visibility.
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
          out.push(Object.assign({}, m, {
            value: scaledValue(m, lvl),
            source: m.source || ('ability:' + id),
            label: m.label || (a.name || id),
            level: lvl,
            knownBy: m.knownBy || ('ability:' + id),
          }));
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
        (RELIC_MOD_MAP[eid] || []).forEach(m => relics.push(Object.assign(
          { source: 'relic:' + (it.name || eid), label: m.label || (it.name || eid), knownBy: m.knownBy || ('relic:' + eid) },
          m
        )));
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
    // LOOT-AUDIT WIRING (Steve 2026-10-07): 27 enhancements that existed in
    // data but did nothing. Wired from their effect metadata.
    resolve: [{ target: 'morale.break_immunity', op: 'add', value: 1 }],
    anchor: [{ target: 'despair.anchor', op: 'add', value: 1 }],
    many_pockets: [{ target: 'carry.weight_mult', op: 'multiply', value: 1.15 }],
    forest_scent: [{ target: 'monster.detect_chance', op: 'add', value: -0.08 }],
    warm_bones: [{ target: 'travel.cost_mult', op: 'multiply', value: 0.9 }],
    stay_put: [{ target: 'healing.amount', op: 'add', value: 4 }],
    rain_funnel: [{ target: 'water.rain_catch', op: 'add', value: 1 }],
    light_feet: [{ target: 'combat.dodge_chance', op: 'add', value: 0.05 }],
    butchers_friend: [{ target: 'hunt.meat_yield', op: 'multiply', value: 1.15 }],
    smoke_keeper: [{ target: 'food.spoilage_days', op: 'add', value: 1 }],
    calm_stone: [{ target: 'drama.resolve_bonus', op: 'add', value: 4 }],
    true_measure: [{ target: 'craft.success', op: 'multiply', value: 1.15 }],
    patient_wire: [{ target: 'hunt.trap_catch', op: 'add', value: 0.08 }],
    glass_eye: [{ target: 'hunt.find_chance', op: 'add', value: 0.1 }],
    hot_stone: [{ target: 'cook.kcal', op: 'multiply', value: 1.1 }],
    field_guide: [{ target: 'forage.learn_threshold', op: 'multiply', value: 0.9 }],
    tasters_spoon: [{ target: 'food.poison_chance', op: 'multiply', value: 0.7 }],
    grey_cloak: [{ target: 'travel.encounter_chance', op: 'multiply', value: 0.75 }],
    winter_lining: [{ target: 'travel.cost_mult', op: 'multiply', value: 0.92 }],
    quiet_soles: [{ target: 'monster.hear_mult', op: 'multiply', value: 0.85 }],
    spare_plating: [{ target: 'armor.flat', op: 'add', value: 2 }],
    lucky_coin: [{ target: 'luck.global', op: 'multiply', value: 1.15 }],
    come_home: [{ target: 'health.max_add', op: 'add', value: 10 }],
    ledger_of_debts: [{ target: 'drama.resolve_bonus', op: 'add', value: 5 }],
    hearth_song: [{ target: 'rest.energy', op: 'multiply', value: 1.2 }],
    mothers_compass: [{ target: 'trust.gain_mult', op: 'multiply', value: 1.3 }],
    harvest_memory: [{ target: 'forage.gift_chance', op: 'add', value: 0.05 }],
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
            out.push(...mapper(val).map(m => Object.assign(
              { source: 'knowledge:' + skillId, label: m.label || (k.name || skillId), knownBy: m.knownBy || ('knowledge:' + skillId) },
              m
            )));
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

  // ---------------------------------------------------------------------------
  // PROVENANCE: describeModifiers — no silent numbers.
  // Returns human-readable lines for every modifier resolve() would apply to
  // the target in this context, e.g.:
  //   "Forage yield ×1.5 — Keen Nose (Mira's kit), L2"
  //   "+40 kcal — Iron Rations relic"
  // Modifiers without label/source fall back to "an unnamed effect".
  // Knowledge-gated modifiers (see visibleFor) render as a single vague line
  // per target — never with numbers.
  // knowledgeCtx: { knows(key) } | Set | array | plain object of known keys.
  // ---------------------------------------------------------------------------
  const TARGET_LABELS = {
    'forage.yield': 'Forage yield', 'forage.rare_find_chance': 'Rare find chance',
    'hunt.success': 'Hunt success', 'hunt.find': 'Game found',
    'cook.kcal': 'Cooking yield', 'travel.kcal': 'Travel energy', 'travel.encounter': 'Travel encounters',
    'travel.lost': 'Getting lost', 'rest.energy': 'Rest recovery', 'trust.gain_mult': 'Trust gained',
    'fire.fuel': 'Fire fuel use', 'fire.success': 'Fire-starting', 'fire.heat': 'Fire heat',
    'heal.amount': 'Healing', 'combat.damage': 'Combat damage', 'combat.crit': 'Crit chance',
    'combat.ambush_avoid': 'Ambush avoidance', 'food.spoil': 'Food spoilage',
    'social.lie_detect': 'Lie detection', 'social.conflict_resolve': 'Conflict resolution',
    'psych.fear_resist': 'Fear resistance', 'village.morale': 'Village morale',
    'weather.warning': 'Storm warning', 'scout.find': 'Scouting', 'scavenge.find': 'Scavenging',
    'party.damage': 'Party damage', 'party.coord': 'Party coordination',
    'health.disease_resist': 'Disease resistance', 'system.favor': 'System favor',
    'shelter.warmth': 'Shelter warmth', 'luck.global': 'Luck',
  };

  function describeTarget(target) {
    if (TARGET_LABELS[target]) return TARGET_LABELS[target];
    return String(target).split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1).replace(/_/g, ' ')).join(' ');
  }

  function fmtNum(v) {
    // 1.5 -> "1.5", 1.333 -> "1.33", 40 -> "40"
    const r = Math.round(v * 100) / 100;
    return String(r);
  }

  function describeEffect(m) {
    // The numeric half of a line: "×1.5", "+40 kcal", "×0.6".
    const unit = m.unit ? ' ' + m.unit : '';
    if (m.op === 'multiply') return '×' + fmtNum(m.value) + unit;
    const sign = m.value >= 0 ? '+' : '−';
    return sign + fmtNum(Math.abs(m.value)) + unit;
  }

  function describeProvenance(m) {
    // The source half of a line: "Keen Nose (Mira's kit), L2".
    const label = m.label || 'an unnamed effect';
    const lvl = (m.level && m.level > 1) ? ', L' + m.level : '';
    return label + lvl;
  }

  function describeModifiers(target, modifiers, context, knowledgeCtx) {
    const lines = [];
    const known = [], hidden = [];
    for (const m of modifiers || []) {
      if (m.target !== target) continue;
      if (m.condition && context && !checkCondition(m.condition, context)) continue;
      (visibleFor(m, knowledgeCtx) ? known : hidden).push(m);
    }
    for (const m of known) {
      lines.push(describeTarget(target) + ' ' + describeEffect(m) + ' — ' + describeProvenance(m));
    }
    if (hidden.length) {
      lines.push(describeHidden(target, hidden));
    }
    return lines;
  }

  function describeHidden(target, hidden) {
    // Knowledge-gated: honest about direction, silent about magnitude.
    // Never leaks numbers, names, or counts.
    let help = 0, hinder = 0;
    for (const m of hidden) {
      const helps = (m.op === 'multiply' && m.value > 1) || (m.op === 'add' && m.value > 0);
      const hinders = (m.op === 'multiply' && m.value < 1) || (m.op === 'add' && m.value < 0);
      if (helps && !hinders) help++;
      else if (hinders && !helps) hinder++;
      else { help++; hinder++; } // neutral op: could go either way, say nothing precise
    }
    const t = describeTarget(target).toLowerCase();
    if (help > 0 && hinder === 0) return 'Something is helping your ' + t + '…';
    if (hinder > 0 && help === 0) return 'Something is weighing on your ' + t + '…';
    return 'Something unseen is affecting your ' + t + '…';
  }

  // ---------------------------------------------------------------------------
  // KNOWLEDGE-GATED VISIBILITY: visibleFor — "if you don't know, it doesn't show."
  // A modifier with no knownBy gate is always visible. Otherwise the caller
  // supplies knowledgeCtx as data — engine never imports game state:
  //   { knows: (key) => boolean }  — a predicate hook the caller wires
  //   Set | array | plain object   — a set of known keys
  // knownBy may itself be a predicate fn(knowledgeCtx) -> boolean.
  // ---------------------------------------------------------------------------
  function visibleFor(modifier, knowledgeCtx) {
    if (!modifier || !modifier.knownBy) return true; // nothing gated: visible
    if (typeof modifier.knownBy === 'function') {
      try { return !!modifier.knownBy(knowledgeCtx); } catch (e) { return false; }
    }
    const key = modifier.knownBy;
    if (knowledgeCtx == null) return false; // gated but no knowledge to judge by: hidden
    if (typeof knowledgeCtx.knows === 'function') return !!knowledgeCtx.knows(key);
    if (typeof knowledgeCtx.has === 'function') return !!knowledgeCtx.has(key); // Set/Map
    if (Array.isArray(knowledgeCtx)) return knowledgeCtx.indexOf(key) !== -1;
    if (typeof knowledgeCtx === 'object') return !!knowledgeCtx[key];
    return false;
  }

  // ---------------------------------------------------------------------------
  // STACKING HONESTY: validateModifiers — content-pipeline lint.
  // Returns an array of human-readable findings (empty = clean). Findings are
  // prefixed 'error:' (pathological, will corrupt results) or 'warn:'
  // (suspicious, worth a content review).
  // ---------------------------------------------------------------------------
  function validateModifiers(modifiers) {
    const findings = [];
    (modifiers || []).forEach((m, i) => {
      const tag = 'modifier[' + i + ']';
      if (!m || typeof m !== 'object') { findings.push('error: ' + tag + ' is not an object'); return; }
      if (!m.target) findings.push('error: ' + tag + ' has no target');
      if (m.op !== 'add' && m.op !== 'multiply') {
        findings.push('error: ' + tag + ' has invalid op ' + JSON.stringify(m.op));
      }
      if (typeof m.value !== 'number' || Number.isNaN(m.value)) {
        findings.push('error: ' + tag + ' has non-numeric value ' + JSON.stringify(m.value));
      } else if (!Number.isFinite(m.value)) {
        findings.push('error: ' + tag + ' has non-finite value ' + String(m.value));
      } else {
        if (m.op === 'multiply' && m.value === 0) {
          findings.push('error: ' + tag + ' multiplies by zero — zeroes the whole target');
        }
        if (m.op === 'multiply' && Math.abs(m.value - 1) > 50) {
          findings.push('warn: ' + tag + ' multiplies by ' + m.value + ' — extreme, check intent');
        }
        if (m.op === 'add' && Math.abs(m.value) > 1000000) {
          findings.push('warn: ' + tag + ' adds ' + m.value + ' — extreme, check intent');
        }
      }
      if (m.diminish && !DIMINISH[m.diminish]) {
        findings.push('error: ' + tag + ' has unknown diminish kind ' + JSON.stringify(m.diminish));
      }
      if (typeof m.knownBy === 'string' && m.knownBy === m.target) {
        findings.push('error: ' + tag + ' knownBy references its own target — self-gated, never visible');
      }
      if (m.condition != null && typeof m.condition !== 'string') {
        findings.push('error: ' + tag + ' condition is not a string');
      }
      if (typeof m.knownBy === 'string' && m.id && m.knownBy === m.id) {
        findings.push('error: ' + tag + ' knownBy references its own id — self-gated, never visible');
      }
    });
    // An explicit diminishGroup must not mix add and multiply ops — the group
    // applies one curve, and a mixed group would silently mis-apply it.
    const groupOps = {};
    (modifiers || []).forEach((m, i) => {
      if (!m || typeof m !== 'object' || !m.diminishGroup) return;
      const seen = groupOps[m.diminishGroup] || (groupOps[m.diminishGroup] = {});
      seen[m.op] = true;
      if (seen.add && seen.multiply) {
        findings.push('error: diminishGroup ' + JSON.stringify(m.diminishGroup) +
          ' mixes add and multiply ops — split the group');
        delete groupOps[m.diminishGroup]; // report once
      }
    });
    return findings;
  }

  global.Scattering = global.Scattering || {};
  global.Scattering.modifiers = {
    resolve, collectModifiers, checkCondition, collectKnowledgeModifiers, hasKnowledgeUnlock,
    describeModifiers, visibleFor, describeTarget, validateModifiers,
    levelOf, scaledValue,
  };
  global.Scattering.hasAbility = hasAbility;
  global.Scattering.abilityLevel = abilityLevel;
})(typeof window !== 'undefined' ? window : globalThis);
