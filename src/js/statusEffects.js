// @ontology
// system: statusEffects
// description: Data-driven status effect engine. Statuses (poison, disease, bleed, stun, fear, slow, burn) are declared in statusEffects.json; this module provides Game.applyStatus() as the single application path, Game.tickStatuses() for per-turn/per-dayPart ticks, and Game.cureStatus(). Stun-family bridges legacy stunned/stunFull fighter fields; poison/disease mirror s.poisons/s.diseases so herbal_remedy/purify keep working. Replaces ad-hoc status handling.
// provides:
//   - seDef(id)
//   - applyStatus(target, effectId, opts)
//   - tickStatuses(target, scope)
//   - cureStatus(target, effectId, source)
//   - hasStatus(target, id)
//   - seTickFighter(f)
//   - seMoveMod(f)
//   - seSteps(f)
//   - seFizzle(f)
// rules:
//   - single_entry: all status applications go through applyStatus — no direct field sets (code: applyStatus)
//   - never_silent: application, ticks, expiry, and cures all narrate via say() (code: applyStatus)
//   - bridge: stun-family writes legacy stunned/stunFull fields; poison/disease mirror s.poisons/s.diseases (code: applyStatus)
//   - legacy_countdown: stun-family turn countdown stays with existing consumption sites; engine tracks parallel turnsLeft (code: seTickFighter)
//   - resistible: resistMod is read via modTarget as an apply-chance multiplier (code: applyStatus)
// consumes:
//   - say, audioEvent, modTarget, tbEndCheck, monsterDisplayName, encSubject
/* STATUS EFFECTS — src/js/statusEffects.js
 *
 * Steve (2026-10-07): s.diseases/s.poisons were bare arrays with no tick,
 * duration, resistance, or cure framework. Fighter stun was three separate
 * ad-hoc implementations (player tbBeginTurn, villager tbVillagerTurn,
 * monster tbMonsterTurn) plus scattered application sites. This module is
 * the single engine: JSON declares, Game.applyStatus() executes.
 *
 * Targets: 'scholar' (dayPart-scale, persists in save) or a fighter object
 * (combat-scale, transient). Scholar statuses live on s.statuses; fighter
 * statuses on f.statuses.
 */
(function (_g) {
  'use strict';
  var G = (_g.Scattering && _g.Scattering.Game) ? _g.Scattering.Game : null;
  if (!G) return;

  // Display name for narration. Never throws.
  function seName(game, target) {
    try {
      if (target === 'scholar') return 'You';
      if (target && target.kind === 'player') return 'You';
      if (target && game.monsterDisplayName && target.mdef)
        return game.monsterDisplayName(target.mdef.id) || target.name || 'it';
      if (target && target.name) return target.name;
    } catch (e) {}
    return 'it';
  }
  function seVerb(name) { return name === 'You' ? 'are' : 'is'; }

  var methods = {
    // Look up a status definition from statusEffects.json.
    seDef: function (id) {
      try {
        var all = ((this.data || {}).statusEffects || {}).statuses || {};
        return all[id] || null;
      } catch (e) { return null; }
    },

    // The status list for a target. Initializes if missing. Never throws.
    seList: function (target) {
      try {
        if (target === 'scholar') {
          var s = this.state.scholar;
          if (!s) return [];
          s.statuses = s.statuses || [];
          return s.statuses;
        }
        if (!target || typeof target !== 'object') return [];
        target.statuses = target.statuses || [];
        return target.statuses;
      } catch (e) { return []; }
    },

    // Fill {name} {verb} {n} {source} {stacks} placeholders. Never throws.
    seFill: function (tpl, target, vars) {
      try {
        var name = seName(this, target);
        var out = String(tpl == null ? '' : tpl);
        out = out.split('{name}').join(name);
        out = out.split('{verb}').join(seVerb(name));
        if (vars) {
          for (var k in vars) out = out.split('{' + k + '}').join(String(vars[k]));
        }
        return out;
      } catch (e) { return String(tpl || ''); }
    },

    hasStatus: function (target, id) {
      var list = this.seList(target);
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return true;
      return false;
    },

    // Apply a status. opts: {turns, dayParts, chance, source, name, silent, verbose}.
    // Returns true if applied (or refreshed/stacked), false if resisted/immune/unknown.
    applyStatus: function (target, effectId, opts) {
      opts = opts || {};
      var def = this.seDef(effectId);
      if (!def) return false;
      var t = (target === 'scholar') ? null : target;
      var self = this;

      // Immunity (data-driven, e.g. elderCalm vs stun).
      if (def.immuneIf && t && t[def.immuneIf]) {
        if (!opts.silent) {
          try { this.say(seName(this, target) + ' is immune — ' + (opts.source || 'it') + ' has no hold. (' + def.name + ' resisted)'); } catch (e) {}
        }
        return false;
      }

      // Resistance: apply-chance multiplier via modTarget.
      var chance = (opts.chance != null) ? opts.chance : 1;
      if (def.resistMod) {
        try { chance *= this.modTarget(def.resistMod, 1); } catch (e) {}
      }
      if (chance < 1 && Math.random() >= chance) {
        if (!opts.silent && opts.verbose) {
          try { this.say(this.seFill('{name} {verb} resisting ' + def.name.toLowerCase() + '.', target, {})); } catch (e) {}
        }
        return false;
      }

      var list = this.seList(target);
      var dur = def.duration || {};
      var existing = null;
      for (var i = 0; i < list.length; i++) if (list[i].id === effectId) { existing = list[i]; break; }
      var entry;
      if (existing) {
        entry = existing;
        if (def.stacking && (entry.stacks || 1) < (def.maxStacks || 99)) {
          entry.stacks = (entry.stacks || 1) + 1;
        }
        if (dur.turns != null) entry.turnsLeft = (opts.turns != null) ? opts.turns : dur.turns;
        if (dur.dayParts != null) entry.dayPartsLeft = (opts.dayParts != null) ? opts.dayParts : dur.dayParts;
      } else {
        entry = { id: effectId, stacks: 1 };
        if (dur.turns != null) entry.turnsLeft = (opts.turns != null) ? opts.turns : dur.turns;
        if (dur.dayParts != null) entry.dayPartsLeft = (opts.dayParts != null) ? opts.dayParts : dur.dayParts;
        if (opts.name) entry.name = opts.name;
        list.push(entry);
      }

      // Legacy bridges: keep existing consumption code working.
      try {
        if (def.bridge) {
          if (target === 'scholar') {
            var s = this.state.scholar;
            if (s && def.bridge.legacy === 'diseases') {
              s.diseases = s.diseases || [];
              if (!existing) s.diseases.push({ name: opts.name || def.name, day: s.day });
            } else if (s && def.bridge.legacy === 'poisons') {
              s.poisons = s.poisons || [];
              if (!existing) s.poisons.push({ name: opts.name || def.name, day: s.day });
            }
          } else if (t) {
            if (def.bridge.legacyField) t[def.bridge.legacyField] = Math.max(t[def.bridge.legacyField] || 0, entry.turnsLeft || 1);
            if (def.bridge.legacyFullField) t[def.bridge.legacyFullField] = 1;
          }
        }
      } catch (e) {}

      if (!opts.silent) {
        try {
          this.say(this.seFill(def.applyText || ('{name} {verb} afflicted: ' + def.name + '.'), target, { source: opts.source || 'something in the dark', stacks: entry.stacks || 1 }));
          this.audioEvent('statusApplied', { id: effectId });
        } catch (e) {}
      }
      return true;
    },

    // Remove one status entry from a target's list. Returns the removed entry or null.
    seRemove: function (target, st) {
      var list = this.seList(target);
      var idx = list.indexOf(st);
      if (idx === -1) return null;
      list.splice(idx, 1);
      return st;
    },

    // Tick statuses for a target at a scope ('combat' = per-turn, 'dayPart').
    // Applies tick damage, decrements duration, expires. Never throws.
    tickStatuses: function (target, scope) {
      var list = this.seList(target);
      if (!list.length) return;
      var self = this;
      var isScholar = (target === 'scholar');
      list.slice().forEach(function (st) {
        var def = self.seDef(st.id);
        if (!def) { self.seRemove(target, st); return; }
        var want = (scope === 'dayPart') ? 'dayPart' : 'turn';
        if (def.tick && def.tick.per === want) {
          var n = 0;
          if (scope === 'dayPart') n = (def.tick.hp || 0) * (st.stacks || 1);
          else n = (def.tick.combatHp != null ? def.tick.combatHp : (def.tick.hp || 0)) * (st.stacks || 1);
          if (n > 0) {
            try {
              if (isScholar) {
                var s = self.state.scholar;
                s.health = Math.max(0, (s.health || 0) - n);
                self.say(self.seFill(def.tickText || '{name} {verb} hurting. (-{n} HP)', target, { n: n }));
              } else if (target && typeof target === 'object') {
                target.hp = Math.max(0, (target.hp || 0) - n);
                if (target.kind === 'player') {
                  try { self.state.scholar.health = Math.max(0, target.hp); } catch (e) {}
                }
                self.say(self.seFill(def.tickText || '{name} {verb} hurting. (-{n} HP)', target, { n: n }));
              }
            } catch (e) {}
          }
        }
        var key = (scope === 'dayPart') ? 'dayPartsLeft' : 'turnsLeft';
        if (st[key] != null) {
          st[key] -= 1;
          if (st[key] <= 0) {
            self.seRemove(target, st);
            try { self.say(self.seFill(def.expireText || ('{name} {verb} no longer ' + def.name.toLowerCase() + '.'), target, {})); } catch (e) {}
          }
        }
      });
    },

    // Combat tick for one fighter at turn start. Returns true if the fight ended.
    seTickFighter: function (f) {
      if (!f || !f.alive) return false;
      this.tickStatuses(f, 'combat');
      try {
        if ((f.hp || 0) <= 0 && this.tbEndCheck && this.tbEndCheck()) return true;
      } catch (e) {}
      return false;
    },

    // Cure a status (ability/item/rest). Clears engine + legacy bridges. Narrates.
    cureStatus: function (target, effectId, source) {
      var def = this.seDef(effectId);
      var list = this.seList(target);
      var removed = false;
      for (var i = list.length - 1; i >= 0; i--) {
        if (list[i].id === effectId) { list.splice(i, 1); removed = true; }
      }
      try {
        if (def && def.bridge) {
          if (target === 'scholar') {
            var s = this.state.scholar;
            if (s && def.bridge.legacy === 'diseases') s.diseases = [];
            if (s && def.bridge.legacy === 'poisons') s.poisons = [];
          } else if (target && typeof target === 'object') {
            if (def.bridge.legacyField) target[def.bridge.legacyField] = 0;
            if (def.bridge.legacyFullField) target[def.bridge.legacyFullField] = 0;
          }
        }
      } catch (e) {}
      if (removed) {
        try {
          this.say(this.seFill((def && def.cureText) || '{name} {verb} recovering.', target, { source: source || 'treatment' }));
          this.audioEvent('statusCured', { id: effectId });
        } catch (e) {}
      }
      return removed;
    },

    // Slow: movement multiplier for a fighter (1 = unaffected).
    seMoveMod: function (f) {
      try {
        var list = this.seList(f);
        var mod = 1;
        for (var i = 0; i < list.length; i++) {
          var def = this.seDef(list[i].id);
          if (def && def.effect === 'slow' && def.moveMult != null) mod *= def.moveMult;
        }
        return mod;
      } catch (e) { return 1; }
    },

    // Effective movement steps for monster step loops.
    seSteps: function (f) {
      var base = (f && f.speed) || 3;
      return Math.max(1, Math.floor(base * this.seMoveMod(f)));
    },

    // Fear: roll fizzleChance — the fighter is too afraid to act. Narrates.
    seFizzle: function (f) {
      try {
        var list = this.seList(f);
        for (var i = 0; i < list.length; i++) {
          var def = this.seDef(list[i].id);
          if (def && def.effect === 'fizzle') {
            var ch = (def.fizzleChance != null) ? def.fizzleChance : 0.5;
            if (Math.random() < ch) {
              this.say(this.seFill('{name} {verb} too afraid to close in — the turn slips.', f, {}));
              return true;
            }
          }
        }
      } catch (e) {}
      return false;
    },
  };
  Object.assign(G, methods);

  // Exposed for tests.
  _g.StatusEffects = { seName: seName };
})(typeof window !== 'undefined' ? window : global);
