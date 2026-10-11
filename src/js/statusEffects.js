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
//   -- DISEASE REWORK (Steve 2026-10-09) --
//   - seIsDisease(id)
//   - isDiagnosed(target, id)
//   - diagnoseDisease(target, id, opts)
//   - diseaseLabel(target, st)
//   - diseaseDebuffs(target)
//   - partIdx()
//   - cureEffectFor(effectId, treatment)
//   - easeDisease(target, effectId, parts, source)
// rules:
//   - single_entry: all status applications go through applyStatus — no direct field sets (code: applyStatus)
//   - never_silent: application, ticks, expiry, and cures all narrate via say() (code: applyStatus)
//   - symptom_only: disease apply/tick/expire text never names the disease; the legacy s.diseases mirror stores the symptom label, not the true name (code: applyStatus)
//   - diagnosis_gated: the true name unlocks only via diagnoseDisease — medical ability, herb lore, or stethoscope (code: diagnoseDisease)
//   - two_pools: EVERY disease def carries pool 'mundane' (earthly vectors: water/food/wounds/ticks/mosquitoes) or 'alien' (monster bites, monster meat). The pools NEVER mix — seIsDisease admits mundane only; contractDisease refuses alien; cureStatus/diagnoseDisease/easeDisease refuse alien (mundane medicine never touches alien biology); alien diseases keep their own effects and transformations. (code: seIsDisease, contractDisease, cureStatus, diagnoseDisease, easeDisease)
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
        // MIRROR SYNC (break-it disease 2026-10-10): each engine entry gets a
        // session-unique seq, stamped onto its legacy mirror entry too. The
        // old seRemove/cureStatus used shift() / blanket-clear on the mirror
        // array, which dropped the WRONG entry when two diseases overlapped
        // (out-of-order expiry) or wiped a still-sick entry when curing one of
        // two — the herbal_remedy button then read "Not sick" while a disease
        // was still active (the mirror is the ability gate). Mirrors are now
        // removed by seq match, never by position.
        // SEQ RESEED (break-it persistence r8 2026-10-10): _seSeq is a
        // Game-level counter — it does NOT survive save/load (Game props are
        // deliberately unpersisted, pass-4). A fresh load reset it to
        // undefined, so the first post-load applyStatus re-minted seq 1 and
        // COLLIDED with a pre-load entry's seq — seDropMirror then removed
        // the WRONG legacy mirror (cure trichinosis, lose gutrot's mirror:
        // engine and the herbal_remedy/purify gate disagreed in both
        // directions). Reseed from the max live _seq (scholar + any live
        // fight fighters, whose statuses persist mid-fight) before minting,
        // so seqs stay unique across loads.
        if (this._seSeq == null) {
          var _mx = 0;
          try {
            var _lists = [];
            try { _lists.push(this.seList('scholar')); } catch (e0rs) {}
            if (this.tbfight && this.tbfight.fighters) {
              for (var _fi = 0; _fi < this.tbfight.fighters.length; _fi++) {
                var _ff = this.tbfight.fighters[_fi];
                if (_ff && Array.isArray(_ff.statuses)) _lists.push(_ff.statuses);
              }
            }
            for (var _li = 0; _li < _lists.length; _li++) {
              var _L = _lists[_li] || [];
              for (var _ei = 0; _ei < _L.length; _ei++) {
                var _sq = _L[_ei] && _L[_ei]._seq;
                if (typeof _sq === 'number' && _sq > _mx) _mx = _sq;
              }
            }
          } catch (e1rs) {}
          this._seSeq = _mx;
        }
        entry._seq = (this._seSeq = (this._seSeq || 0) + 1);
        list.push(entry);
      }

      // Legacy bridges: keep existing consumption code working.
      try {
        if (def.bridge) {
          if (target === 'scholar') {
            var s = this.state.scholar;
            if (s && def.bridge.legacy === 'diseases') {
              s.diseases = s.diseases || [];
              // SYMPTOM-ONLY MIRROR (disease rework 2026-10-09): the legacy
              // mirror must never carry the true disease name — nothing reads
              // .name for display, but the symptom label is the honest value.
              var mLabel = (def.symptomLabel || opts.name || def.name);
              if (!existing) s.diseases.push({ name: mLabel, day: s.day, seq: entry._seq });
            } else if (s && def.bridge.legacy === 'poisons') {
              s.poisons = s.poisons || [];
              if (!existing) s.poisons.push({ name: opts.name || def.name, day: s.day, seq: entry._seq });
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
      // SIM TELEMETRY (2026-10-09): disease contractions are analysis-grade —
      // pool matters (mundane vs alien min-max building blocks).
      try {
        if (this.tele && def && (def.pool === 'mundane' || def.pool === 'alien')) {
          this.tele('disease', { id: effectId, pool: def.pool, target: target, source: (opts && opts.source) || '?' });
        }
      } catch (e) {}
      return true;
    },

    // Remove one status entry from a target's list. Returns the removed entry or null.
    seRemove: function (target, st) {
      var list = this.seList(target);
      var idx = list.indexOf(st);
      if (idx === -1) return null;
      list.splice(idx, 1);
      // LEGACY BRIDGE (survivalist loop 2026-10-07): applyStatus pushes one
      // s.diseases/s.poisons mirror entry per engine entry. Natural expiry
      // (tickStatuses) used to leave the mirror behind — a ghost disease that
      // kept the journal badge on and the herbal_remedy/purify "cure" gates
      // open forever. Expiry drops the mirror with the engine entry.
      // MIRROR SYNC (break-it disease 2026-10-10): the old code used shift()
      // here — position, not identity. When two diseases overlapped and the
      // second-applied expired first (folk slowRoll targeting, different
      // durations), the mirror dropped the wrong entry: the engine was clean
      // but the mirror still claimed sickness, or vice versa. Now matched by
      // the entry's _seq (see applyStatus); pre-seq saves fall back to shift().
      this.seDropMirror(target, st);
      return st;
    },

    // Drop exactly one legacy mirror entry for an engine entry: seq match
    // when the entry was created by the current applyStatus (see _seq), else
    // the old shift() behavior for pre-seq saves. Never throws.
    seDropMirror: function (target, entry) {
      try {
        if (target !== 'scholar' || !entry) return;
        var def = this.seDef && this.seDef(entry.id);
        if (!def || !def.bridge) return;
        var key = def.bridge.legacy === 'diseases' ? 'diseases'
          : def.bridge.legacy === 'poisons' ? 'poisons' : null;
        if (!key) return;
        var s = this.state.scholar;
        if (!s || !Array.isArray(s[key]) || !s[key].length) return;
        var at = -1;
        if (entry._seq != null) {
          for (var i = 0; i < s[key].length; i++) {
            if (s[key][i] && s[key][i].seq === entry._seq) { at = i; break; }
          }
        }
        if (at === -1) at = 0; // pre-seq mirror: old behavior
        s[key].splice(at, 1);
      } catch (e) {}
    },

    // Tick statuses for a target at a scope ('combat' = per-turn, 'dayPart').
    // Applies tick damage, decrements duration, expires. Never throws.
    // DISEASE REWORK (2026-10-09): easedUntil (treatment holding — tick halved),
    // severe entries (escalation flag — deadlier tick), hydration drain
    // from fever debuffs, lockjaw spasms, lemons chronic aftermath on expiry.
    tickStatuses: function (target, scope) {
      var list = this.seList(target);
      if (!list.length) return;
      var self = this;
      var isScholar = (target === 'scholar');
      var pIdx = 0;
      try { pIdx = this.partIdx ? this.partIdx() : 0; } catch (e) {}
      list.slice().forEach(function (st) {
        var def = self.seDef(st.id);
        if (!def) { self.seRemove(target, st); return; }
        var want = (scope === 'dayPart') ? 'dayPart' : 'turn';
        var eased = !!(st.easedUntil && pIdx < st.easedUntil);
        if (def.tick && def.tick.per === want) {
          var baseHp = (st.severe && def.severe && def.severe.tickHp != null) ? def.severe.tickHp : (def.tick.hp || 0);
          var n = baseHp * (st.stacks || 1);
          if (eased) n = Math.floor(n / 2);
          var drain = (isScholar && def.debuff && def.debuff.hydrationDrain) ? def.debuff.hydrationDrain : 0;
          try {
            if (isScholar) {
              var s = self.state.scholar;
              if (n > 0) {
                s.health = Math.max(0, (s.health || 0) - n);
                var msg = self.seFill(def.tickText || '{name} {verb} hurting. (-{n} HP)', target, { n: n });
                if (drain > 0) msg += ' (-' + drain + ' hydration)';
                self.say(msg);
              } else if (eased) {
                var sym = (def.symptomLabel || def.name || 'it').toLowerCase();
                self.say(self.seFill('The ' + sym + ' eases a little \u2014 the treatment is holding.', target, {}));
              }
              if (drain > 0) s.hydration = Math.max(0, (s.hydration || 0) - drain);
              // LOCKJAW SPASM: the wire strikes at random.
              if (def.spasm && Math.random() < (def.spasm.chance || 0)) {
                var sd = def.spasm.dmg || 0;
                s.health = Math.max(0, (s.health || 0) - sd);
                self.say(self.seFill(def.spasm.text || '{name} {verb} seizing. (-{n} HP)', target, { n: sd }));
              }
            } else if (target && typeof target === 'object') {
              if (n > 0) {
                target.hp = Math.max(0, (target.hp || 0) - n);
                if (target.kind === 'player') {
                  try { self.state.scholar.health = Math.max(0, target.hp); } catch (e) {}
                }
                self.say(self.seFill(def.tickText || '{name} {verb} hurting. (-{n} HP)', target, { n: n }));
              }
            }
          } catch (e) {}
        }
        var key = (scope === 'dayPart') ? 'dayPartsLeft' : 'turnsLeft';
        if (st[key] != null) {
          st[key] -= 1;
          // TREMBLES LATE WARNING (break-it disease r10): ~2 days left.
          // Agency: settle what matters — the mantle is about to pass.
          if (isScholar && st.id === 'trembles' && st[key] === 8) {
            self.say('The tremor is moving inward now \u2014 hands, arms, the throat. Days, not weeks. Settle what matters. (the trembles: ~2 days left)');
          }
          if (st[key] <= 0) {
            // TREMBLES CERTAINTY (Steve 2026-10-09, break-it disease r10):
            // prion disease — no cure at any tier; slow (40 day-parts) and
            // CERTAIN. The old code just expired it like a cold, and the
            // expireText ("it never lets go") lied about the engine. When the
            // clock runs out the bearer dies; the mantle passes. Death-cheats
            // (phoenix) still hold at the threshold — the disease killed you,
            // the cheat is a separate system. (docs/DISEASES.md)
            if (isScholar && st.id === 'trembles') {
              try {
                self.seRemove(target, st);
                self.say('The tremor reaches all the way in and does not come back out. Your hands still first. Then everything else. It never lets go \u2014 it was never going to. (the trembles)');
                // BREAK-IT abilities 2026-10-10: a disease death is not a violent
                // one -- second_wind's spite-ration (+500 kcal) must not fire.
                if (self.maybeCheatDeath && !self.maybeCheatDeath('disease')) self.playerDeath('the trembles');
                else if (!self.maybeCheatDeath) self.playerDeath('the trembles');
              } catch (e) {}
              return;
            }
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
      // TWO POOLS (Steve 2026-10-09, break-it disease 2026-10-10): mundane
      // medicine never touches alien biology. The generic cure path is not a
      // back door around the pool law — alien conditions leave on their own
      // terms (meat-quirks expire; the warping viruses never do).
      if (def && def.pool === 'alien') {
        try { this.say('Earthly medicine doesn\u2019t touch alien biology \u2014 the ' + (def.name || effectId) + ' stays.'); } catch (e) {}
        return false;
      }
      var list = this.seList(target);
      var removed = false;
      var dropped = [];
      for (var i = list.length - 1; i >= 0; i--) {
        if (list[i].id === effectId) { dropped.push(list.splice(i, 1)[0]); removed = true; }
      }
      try {
        if (def && def.bridge) {
          if (target === 'scholar') {
            // MIRROR SYNC (break-it disease 2026-10-10): the old code
            // blanket-cleared s.diseases/s.poisons here. Curing one of two
            // active diseases wiped the OTHER's mirror too — the engine still
            // had it, but the mirror (which the herbal_remedy/purify buttons
            // and the journal badge read) said clean, and the button vanished
            // while you were still sick. Mirrors now drop only for the entries
            // actually removed, matched by _seq.
            for (var j = 0; j < dropped.length; j++) this.seDropMirror(target, dropped[j]);
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
        // SIM TELEMETRY (2026-10-09): cures pair with contractions for
        // disease-economy analysis (which pool, what cured it).
        try {
          if (this.tele && def && (def.pool === 'mundane' || def.pool === 'alien')) {
            this.tele('cured', { id: effectId, pool: def.pool, target: target, source: source || '?' });
          }
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

    // ============ DISEASE REWORK (Steve 2026-10-09) ============
    // Diseases never announce their names. Until diagnosed, a disease is its
    // symptoms; diagnosis (medical ability, herb lore, stethoscope, or a
    // medical villager's word) unlocks the true name, the class, and the cure.

    // Absolute dayPart index for easedUntil/chronic bookkeeping.
    partIdx: function () {
      try {
        var s = this.state.scholar || {};
        return (s.day || 0) * 4 + (this.dayPart || 0);
      } catch (e) { return 0; }
    },

    // Is this status id a disease (symptom-presented, diagnosis-gated)?
    seIsDisease: function (id) {
      var def = this.seDef(id);
      // TWO POOLS (Steve 2026-10-09): mundane only. Alien diseases (monster
      // bites, monster meat) are a separate pool with alien effects — they
      // are never diagnosed, eased, or cured by the mundane machinery.
      return !!(def && def.pool === 'mundane' && def.symptomLabel);
    },

    // Has this disease been diagnosed on this target?
    isDiagnosed: function (target, effectId) {
      try {
        if (target === 'scholar') {
          var s = this.state.scholar || {};
          s.diagnosed = s.diagnosed || {};
          return !!s.diagnosed[effectId];
        }
        if (target && typeof target === 'object') {
          target.diagnosed = target.diagnosed || {};
          return !!target.diagnosed[effectId];
        }
      } catch (e) {}
      return false;
    },

    // Diagnosis: unlock the true name. Narrates name + class + cure direction,
    // records in the codex. Never throws. Returns true.
    diagnoseDisease: function (target, effectId, opts) {
      opts = opts || {};
      var def = this.seDef(effectId);
      if (!def) return false;
      // TWO POOLS (break-it disease 2026-10-10): alien conditions are never
      // diagnosed by mundane medicine — there is no earthly name for them.
      // (The player reads them in the afflictions panel instead: what
      // happened, what changed, what it costs.)
      if (def.pool === 'alien') {
        if (!opts.silent) { try { this.say('No earthly diagnosis names this \u2014 it isn\u2019t a sickness of this earth.'); } catch (e) {} }
        return false;
      }
      try {
        if (target === 'scholar') {
          var s = this.state.scholar || {};
          s.diagnosed = s.diagnosed || {};
          s.diagnosed[effectId] = { day: s.day || 0, by: opts.by || 'you' };
          this.state.codex = this.state.codex || {};
          this.state.codex.diseases = this.state.codex.diseases || {};
          this.state.codex.diseases[effectId] = { diagnosed: s.day || 0, by: opts.by || 'you' };
        } else if (target && typeof target === 'object') {
          target.diagnosed = target.diagnosed || {};
          target.diagnosed[effectId] = true;
        }
      } catch (e) {}
      if (!opts.silent) {
        try {
          var cls = def['class'] || 'unknown';
          var clsHint = cls === 'bacterial' ? 'Antibiotics would end it.'
            : cls === 'parasitic' ? 'Antiparasitics would end it.'
            : cls === 'viral' ? 'No pill touches it \u2014 rest, water, care.'
            : 'Folk care and time.';
          var who = (target === 'scholar' || (target && target.kind === 'player')) ? 'You' : seName(this, target);
          this.say(who + (who === 'You' ? ' have' : ' has') + ' ' + def.name + '. ' +
            (def.diagnosedDesc || '') + ' (' + clsHint + ')' +
            (opts.by ? ' \u2014 diagnosed by ' + opts.by + '.' : ''));
          try { this.audioEvent('statusCured', { id: effectId }); } catch (e2) {}
        } catch (e) {}
      }
      return true;
    },

    // Display label for one status entry: symptom until diagnosed, true name after.
    // Poison and meat-quirks show their names (identifiable phenomena).
    diseaseLabel: function (target, st) {
      var def = this.seDef(st.id);
      if (!def) return { icon: '', label: st.id };
      if (def.symptomLabel && !this.isDiagnosed(target, st.id)) {
        return { icon: def.icon || '', label: def.symptomLabel };
      }
      return { icon: def.icon || '', label: def.name || st.id };
    },

    // Aggregated disease debuffs for a target: {hydrationDrain, kcalAbsorbMult, healMult, energyMult}.
    diseaseDebuffs: function (target) {
      var out = { hydrationDrain: 0, kcalAbsorbMult: 1, healMult: 1, energyMult: 1 };
      try {
        var list = this.seList(target);
        for (var i = 0; i < list.length; i++) {
          var def = this.seDef(list[i].id);
          if (!def || !def.debuff) continue;
          var db = def.debuff;
          out.hydrationDrain += (db.hydrationDrain || 0);
          if (db.kcalAbsorbMult) out.kcalAbsorbMult *= db.kcalAbsorbMult;
          if (db.healMult) out.healMult *= db.healMult;
          if (db.energyMult) out.energyMult *= (list[i].severe ? Math.min(db.energyMult, 0.5) : db.energyMult);
        }
      } catch (e) {}
      return out;
    },

    // Cure-table lookup: 'cure' | 'ease' | 'support' | 'no' (+ folk: 'slow'|'none').
    cureEffectFor: function (effectId, treatment) {
      var def = this.seDef(effectId);
      if (!def || !def.cure) return 'no';
      return def.cure[treatment] || 'no';
    },

    // Ease a disease entry: halve its tick for `parts` dayParts. Narrates.
    easeDisease: function (target, effectId, parts, source) {
      // TWO POOLS (break-it disease 2026-10-10): alien conditions are never
      // eased by mundane medicine either.
      try { var _ed = this.seDef && this.seDef(effectId); if (_ed && _ed.pool === 'alien') return false; } catch (e) {}
      try {
        var list = this.seList(target);
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === effectId) {
            var until = this.partIdx() + (parts || 2);
            list[i].easedUntil = Math.max(list[i].easedUntil || 0, until);
            if (source) this.say(this.seFill('{name} {verb} eased a little \u2014 ' + source + '.', target, {}));
            return true;
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
