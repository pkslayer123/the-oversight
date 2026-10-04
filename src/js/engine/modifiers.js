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
    return ctx && ctx[k] === v;
  }

  // Gather modifiers from a scholar's abilities + relics + injuries.
  // abilitiesData: the abilities.json array. In slice 1 this is passed in;
  // later it comes from a content registry.
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
      if (a && a.modifiers) out.push(...a.modifiers);
    });
    // relics and injuries hook in here in later slices (same shape)
    return out;
  }

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

  global.Scattering = global.Scattering || {};
  global.Scattering.modifiers = { resolve, collectModifiers, checkCondition };
  global.Scattering.hasAbility = hasAbility;
  global.Scattering.abilityLevel = abilityLevel;
})(typeof window !== 'undefined' ? window : globalThis);
