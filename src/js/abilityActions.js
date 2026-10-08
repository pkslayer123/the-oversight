// @ontology
// system: abilityActions
// description: Data-driven ability action execution engine. Abilities declare actions in abilities.json (id, context, name, cost, effect); this module provides Game.useAbility() as the single entry point, pays costs, validates context, and dispatches to implementations. Replaces hardcoded activatableAbilities() if-blocks.
// provides:
//   - useAbility(abilityId, actionId, target)
//   - abilityActionDef(abilityId, actionId)
//   - activatableAbilities()
//   - payActionCost(cost)
//   - actionContextValid(action)
// rules:
//   - single_entry: all ability action invocations go through useAbility — no direct impl calls (code: useAbility)
//   - never_silent: every action narrates via say(), even on failure (code: useAbility)
//   - honest_costs: costs are paid before effects; insufficient resources block with explanation (code: payActionCost)
//   - context_gated: combat actions only in combat, camp actions only at camp/haven (code: actionContextValid)
// consumes:
//   - hasAbility, abilityLevel, say, tickAction, spendCombatAction, inCombat
//   - state.scholar (kcal, health, actionClock), state.village, state.codex

/* ABILITY ACTIONS — src/js/abilityActions.js
 *
 * Steve (2026-10-07): Abilities were passive flags scattered through the code.
 * The actions arrays in abilities.json define what you can DO, but nothing
 * executed them. This module is the execution engine.
 *
 * Architecture:
 * - abilities.json declares actions: {id, context, name, cost, effect}
 * - useAbility(abilityId, actionId, target) is the single entry point
 * - ABILITY_ACTION_IMPLS maps "abilityId.actionId" -> implementation function
 * - Costs: time_min (ticks), kcal, hp, turn (combat action)
 * - Contexts: combat, explore, camp, social
 *
 * Adding a new action:
 * 1. Add to abilities.json actions array with id/context/name/cost/effect
 * 2. Add implementation to ABILITY_ACTION_IMPLS below
 * 3. The action automatically appears in activatableAbilities() and menus
 */
(function (_g) {
  'use strict';
  var G = (_g.Scattering && _g.Scattering.Game) ? _g.Scattering.Game : null;
  if (!G) return;

  // Cost type handlers. Each returns {ok: bool, why: string} — if not ok,
  // the action is blocked with the explanation.
  var COST_HANDLERS = {
    // time_min: advance the action clock. 1 tick ≈ 2 minutes (512 ticks/day).
    time_min: function (game, amount) {
      var ticks = Math.max(1, Math.round(amount / 2));
      game.tickAction(ticks);
      return { ok: true };
    },
    // kcal: deduct from scholar. Block if insufficient.
    kcal: function (game, amount) {
      var s = game.state.scholar;
      if ((s.kcal || 0) < amount) {
        return { ok: false, why: 'Not enough energy — need ' + amount + ' kcal.' };
      }
      s.kcal -= amount;
      return { ok: true };
    },
    // hp: deduct from health. Block if would kill (leave at least 1).
    hp: function (game, amount) {
      var s = game.state.scholar;
      if ((s.health || 0) <= amount) {
        return { ok: false, why: 'Too weak — need ' + (amount + 1) + '+ HP.' };
      }
      s.health -= amount;
      return { ok: true };
    },
    // turn: spend the combat action. Only valid in combat.
    turn: function (game, amount) {
      if (!amount) return { ok: true };
      if (!game.inCombat()) {
        return { ok: false, why: 'This costs your combat turn — only usable in a fight.' };
      }
      game.spendCombatAction('focus');
      return { ok: true };
    }
  };

  // Capture the original activateAbility before we override it.
  // The new version dispatches data-driven actions to useAbility(),
  // and falls back to the legacy hardcoded branches for old abilities.
  var _origActivateAbility = G.activateAbility;

  var methods = {
    // activateAbility: UNIFIED dispatcher. Replaces the hardcoded version.
    // - If id is composite ("abilityId.actionId"), route to useAbility().
    // - Otherwise, fall back to legacy hardcoded branches (blood_magic, etc.)
    activateAbility: function (id, target) {
      if (id && id.indexOf('.') !== -1) {
        var parts = id.split('.');
        return this.useAbility(parts[0], parts[1], target);
      }
      // Legacy path: old hardcoded abilities without actions arrays.
      if (typeof _origActivateAbility === 'function') {
        return _origActivateAbility.call(this, id, target);
      }
      this.say('Unknown ability: ' + id);
      return false;
    },

    // abilityActionDef: look up an action definition from abilities.json.
    // Returns {ability, action} or null.
    abilityActionDef: function (abilityId, actionId) {
      var abilities = (this.data && this.data.abilities) || [];
      var ability = null;
      for (var i = 0; i < abilities.length; i++) {
        if (abilities[i].id === abilityId) { ability = abilities[i]; break; }
      }
      if (!ability || !ability.actions) return null;
      for (var j = 0; j < ability.actions.length; j++) {
        if (ability.actions[j].id === actionId) {
          return { ability: ability, action: ability.actions[j] };
        }
      }
      return null;
    },

    // actionContextValid: check if the current game state matches the action's context.
    // Returns {ok: bool, why: string}.
    actionContextValid: function (action) {
      var ctx = action.context || 'explore';
      var inCombat = this.inCombat();
      if (ctx === 'combat' && !inCombat) {
        return { ok: false, why: 'This is a combat action — only usable in a fight.' };
      }
      if (ctx === 'camp') {
        // Camp actions need downtime — not in combat, not mid-crisis.
        if (inCombat) {
          return { ok: false, why: 'This needs calm and time — not in the middle of a fight.' };
        }
      }
      // explore and social are generally available; specific checks are in impls.
      return { ok: true };
    },

    // payActionCost: pay all costs in the cost object. Returns {ok, why}.
    // Costs are paid in order; if any fails, none are paid (atomic).
    payActionCost: function (cost) {
      cost = cost || {};
      // Pre-check all costs first (atomic — don't half-pay).
      for (var key in cost) {
        if (!cost.hasOwnProperty(key)) continue;
        var handler = COST_HANDLERS[key];
        if (!handler) continue; // Unknown cost types are ignored (data may evolve)
        // For pre-check, we simulate without applying for kcal/hp.
        if (key === 'kcal' || key === 'hp') {
          var s = this.state.scholar;
          var current = key === 'kcal' ? (s.kcal || 0) : (s.health || 0);
          var needed = key === 'hp' ? cost[key] + 1 : cost[key]; // hp leaves 1
          if (current < needed) {
            return {
              ok: false,
              why: key === 'kcal'
                ? 'Not enough energy — need ' + cost[key] + ' kcal.'
                : 'Too weak — need ' + needed + '+ HP.'
            };
          }
        }
        if (key === 'turn' && cost[key] && !this.inCombat()) {
          return { ok: false, why: 'This costs your combat turn — only usable in a fight.' };
        }
      }
      // All pre-checks passed — apply.
      for (var k in cost) {
        if (!cost.hasOwnProperty(k)) continue;
        var h = COST_HANDLERS[k];
        if (!h) continue;
        var result = h(this, cost[k]);
        if (!result.ok) return result; // Shouldn't happen after pre-check, but be safe
      }
      return { ok: true };
    },

    // useAbility: THE single entry point for ability action invocation.
    // 1. Look up ability + action
    // 2. Validate player has the ability
    // 3. Validate context
    // 4. Pay costs (atomic)
    // 5. Dispatch to implementation
    // 6. Narrate (never silent)
    useAbility: function (abilityId, actionId, target) {
      var def = this.abilityActionDef(abilityId, actionId);
      if (!def) {
        this.say('That action doesn\'t exist. (Unknown: ' + abilityId + '.' + actionId + ')');
        return false;
      }
      if (!this.hasAbility(abilityId)) {
        this.say('You don\'t have that ability. (' + (def.ability.name || abilityId) + ')');
        return false;
      }
      // Context check
      var ctxCheck = this.actionContextValid(def.action);
      if (!ctxCheck.ok) {
        this.say(ctxCheck.why + ' (' + (def.action.name || actionId) + ')');
        return false;
      }
      // WIRING CHECK FIRST (Steve 2026-10-08, break-it): an action defined in
      // data but with no implementation must fail BEFORE costs are paid —
      // the old order spent your combat turn (and kcal/hp) and then said
      // "isn't wired up yet". Failing fast costs nothing.
      var key = abilityId + '.' + actionId;
      var impl = ABILITY_ACTION_IMPLS[key];
      if (typeof impl !== 'function') {
        // No implementation yet — this is honest, not silent.
        // The action is defined in data but not yet wired. Flag it.
        this.say('(' + (def.action.name || actionId) + ' isn\'t wired up yet — the data defines it but the code doesn\'t. This is a bug, not a feature. Nothing spent.)');
        return false;
      }
      // Cost check + payment (atomic)
      var costCheck = this.payActionCost(def.action.cost);
      if (!costCheck.ok) {
        this.say(costCheck.why + ' (' + (def.action.name || actionId) + ')');
        return false;
      }
      // Dispatch to implementation
      var result = impl(this, target);
      // Implementation must narrate via say(). If it returned false without
      // saying anything, we add a fallback (never silent).
      if (result === false) {
        this.say('Nothing happened. (' + (def.action.name || actionId) + ' fizzled.)');
      } else {
        // XP + synergy: only a REAL attempt counts. gainAbilityXP logs the
        // use for synergy discovery internally (game.js:14421), so a separate
        // noteAbilityUse here would double-count every activation as two
        // synergy attempts (Steve 2026-10-08). And it must come AFTER
        // dispatch: granting it before let zero-cost refused actions farm
        // free levels — 35 taps of second_wind.refuse_death ("automatic",
        // impl refuses) took L1->L3 in one turn with no cost, no turn spent.
        // A fizzled action is not practice. (brawler loop 2026-10-08)
        try { this.gainAbilityXP(abilityId, 1); } catch (e) {}
      }
      return result !== false;
    },

    // activatableAbilities: DATA-DRIVEN version. Reads from abilities.json
    // actions arrays instead of hardcoded if-blocks.
    //
    // Returns [{abilityId, actionId, name, desc, context, available, why, target}]
    // Filtered by current context (combat vs non-combat).
    //
    // NOTE: This replaces the hardcoded version. The old hardcoded abilities
    // (blood_magic, time_skip, etc.) that don't have actions arrays in data
    // are still supported via LEGACY_ACTIVATABLES below for backward compat.
    activatableAbilities: function () {
      var s = this.state.scholar;
      var out = [];
      var inCombat = this.inCombat();
      var abilities = (this.data && this.data.abilities) || [];

      for (var i = 0; i < abilities.length; i++) {
        var ab = abilities[i];
        if (!ab.actions || !ab.actions.length) continue;
        if (!this.hasAbility(ab.id)) continue;

        for (var j = 0; j < ab.actions.length; j++) {
          var act = ab.actions[j];
          var ctx = act.context || 'explore';

          // Context filtering: in combat, show combat actions;
          // out of combat, show non-combat actions.
          // (Camp actions show out of combat; social shows in conversation.)
          if (inCombat && ctx !== 'combat') continue;
          if (!inCombat && ctx === 'combat') continue;

          // Check availability (costs, cooldowns, etc.)
          var avail = this._actionAvailable(ab.id, act);
          out.push({
            abilityId: ab.id,
            actionId: act.id,
            id: ab.id + '.' + act.id, // composite for UI
            target: 'none', // TODO: per-action target types
            name: act.name || act.id,
            desc: act.effect || '',
            context: ctx,
            cost: act.cost || {},
            available: avail.ok,
            why: avail.why || null,
            combat: ctx === 'combat'
          });
        }
      }

      // LEGACY: hardcoded abilities without actions arrays (backward compat).
      // These will be migrated to data as actions arrays are added.
      var legacy = this._legacyActivatables();
      for (var k = 0; k < legacy.length; k++) out.push(legacy[k]);

      return out;
    },

    // _actionAvailable: check if an action can currently be used.
    // Returns {ok: bool, why: string}.
    _actionAvailable: function (abilityId, action) {
      var s = this.state.scholar;
      var cost = action.cost || {};

      // AUTOMATIC (brawler loop 2026-10-08): actions that only trigger on
      // their own (second_wind.refuse_death) are not tappable buttons.
      // Offering them as available zero-cost buttons is a trap: every tap
      // narrated a refusal while the old XP-before-dispatch order farmed
      // free levels. The automatic trigger path (maybeCheatDeath) never
      // goes through here, so this only affects the button.
      if (action.automatic) {
        return { ok: false, why: 'Automatic — triggers on its own.' };
      }
      // Check kcal
      if (cost.kcal && (s.kcal || 0) < cost.kcal) {
        return { ok: false, why: 'Need ' + cost.kcal + ' kcal.' };
      }
      // Check hp (leave at least 1)
      if (cost.hp && (s.health || 0) <= cost.hp) {
        return { ok: false, why: 'Too weak — need ' + (cost.hp + 1) + '+ HP.' };
      }
      // Check turn (combat only)
      if (cost.turn && !this.inCombat()) {
        return { ok: false, why: 'Needs a combat turn.' };
      }
      if (cost.turn && this.inCombat()) {
        var p = this.tbFighter('p');
        if (p && p.acted) {
          return { ok: false, why: 'Already acted this turn.' };
        }
      }
      // Per-action cooldown/usage checks are in the impls via state flags.
      // Here we do a generic "once per fight" check if the action declares it.
      return { ok: true };
    },

    // _stanceHint: return a human-readable hint about a monster's likely next move.
    // Used by read_stance and read_fight. Generic fallback if no specific intel.
    // Returns a full sentence — both call sites only reach this on the KNOWN
    // path (pattern learned), so naming the attack is earned, not given.
    _stanceHint: function (m) {
      if (!m) return 'Something violent is coming — you can\'t tell what yet.';
      // Active telegraph (object form): name the incoming attack and its
      // timing. (HUNTER LOOP 2026-10-08: m.telegraph is an object for
      // telegraphed attacks — the old string-only check fell through to
      // 'something violent' even with a live telegraph, so read_stance named
      // nothing for every wave-2 monster mid-windup.)
      try {
        if (m.telegraph && typeof m.telegraph === 'object') {
          var an = m.telegraph.attackName || ((m.telegraph.pattern || {}).type);
          if (an) {
            var tl = m.telegraph.turnsLeft;
            var when = (tl != null) ? (tl <= 1 ? 'lands next beat' : 'lands in ' + tl + ' beats') : 'coming soon';
            return 'It\'s winding up ' + an + ' — ' + when + '.';
          }
        }
        if (m.nextMove) return 'It\'s about to ' + m.nextMove + '.';
        if (typeof m.telegraph === 'string' && m.telegraph) return 'It\'s about to ' + m.telegraph + '.';
      } catch (e) {}
      // Generic based on monster behavior flags.
      if (m.charging) return 'It\'s lining up a charge.';
      if (m.windingUp) return 'It\'s winding up something big.';
      // Learned patterns (codex): name what you know it can do, honestly
      // flagged as not-yet-incoming when nothing is telegraphed.
      try {
        var mid = (m.mdef && m.mdef.id) || null;
        var cx = mid && this.state.codex.monsters && this.state.codex.monsters[mid];
        var pats = cx && cx.patterns ? Object.keys(cx.patterns) : [];
        if (pats.length) {
          var pk = pats[0];
          var more = pats.length > 1 ? ' — and ' + (pats.length - 1) + ' other trick' + (pats.length > 2 ? 's' : '') : '';
          return 'Nothing\'s winding up yet — it\'s circling. You know its moves: ' + pk + ' (' + cx.patterns[pk] + ')' + more + '.';
        }
      } catch (e) {}
      return 'Something violent is coming — you can\'t tell what yet.';
    },

    // _applyAbilityActionMods: called from tbPlayerStrike to consume action flags.
    // Each flag is set by a useAbility() action and consumed here on the next strike.
    // Returns the modified damage. Narrates via say().
    _applyAbilityActionMods: function (d, p, t) {
      var s = this.state.scholar;

      // TAKE AIM: 2.5x, cannot miss. Consumed on use.
      if (s.aimBonus) {
        d = Math.round(d * s.aimBonus.mult);
        this.say('TAKE AIM: the shot lands exactly where you pictured it. ×' + s.aimBonus.mult + '.');
        delete s.aimBonus;
      }
      // DEAD AIM SHOT: 3x, ignores armor.
      if (s.deadAimShot) {
        d = Math.round(d * s.deadAimShot.mult);
        // Armor ignore is handled by setting a flag the armor block checks.
        s.ignoreArmorNext = true;
        this.say('DEAD AIM: one perfect shot. ×' + s.deadAimShot.mult + ', armor means nothing.');
        delete s.deadAimShot;
      }
      // AMBUSH: 2x -- they never saw it coming. (No dodge mechanic on the
      // player-strike path: monsters don't dodge strikes, so there is no
      // no-dodge flag to set. The fiction is the surprise, not a mechanic.)
      if (s.ambushReady) {
        d = Math.round(d * s.ambushReady.mult);
        this.say('AMBUSH: they never saw it coming. ×' + s.ambushReady.mult + '.');
        delete s.ambushReady;
      }
      // HAYMAKER: 2.5x, -30% accuracy (handled at roll time via flag).
      if (s.haymakerReady) {
        // HEAVY DAMAGE (wired 2026-10-07): combat.heavy_damage sharpens the
        // heavy swing for a brawler who holds the haymaker ability.
        var heavyMult = 1;
        try { heavyMult = this.modTarget('combat.heavy_damage', 1, {}); } catch (e) {}
        d = Math.round(d * s.haymakerReady.mult * heavyMult);
        this.say('HAYMAKER: a wild, devastating swing. ×' + s.haymakerReady.mult + '.' +
          (heavyMult !== 1 ? ' Heavy hands hit harder still (×' + heavyMult + ').' : ''));
        delete s.haymakerReady;
      }
      // TRADE OPEN: +50% for 3 attacks.
      if (s.tradeOpen && s.tradeOpen.attacksLeft > 0) {
        d = Math.round(d * (1 + s.tradeOpen.bonus));
        s.tradeOpen.attacksLeft--;
        this.say('TRADE OF BLOWS: the pain pays out. +' + Math.round(s.tradeOpen.bonus * 100) + '%. (' + s.tradeOpen.attacksLeft + ' left.)');
        if (s.tradeOpen.attacksLeft <= 0) delete s.tradeOpen;
      }
      // SETTLE DEBT: flat bonus from damage taken.
      if (s.settleDebtBonus) {
        d += s.settleDebtBonus;
        this.say('SETTLE THE DEBT: +' + s.settleDebtBonus + ' from everything you endured.');
        delete s.settleDebtBonus;
      }
      // RAGE: +100% while active.
      if (s.rageActive && s.rageActive.rounds > 0) {
        d = Math.round(d * s.rageActive.dmgMult);
        s.rageActive.rounds--;
        if (s.rageActive.rounds <= 0) {
          delete s.rageActive;
          this.say('The rage burns out. You\'re yourself again — shaking, but yourself.');
        }
      }
      // ONE PERSON ARMY (wired 2026-10-07): the synergy's modifiers fire here.
      // Outnumbered (2+ living foes): bonus scales the strike. Alone with a
      // single foe and no allies standing: solo damage. Needs a live fight.
      try {
        var _f = this.tbfight;
        if (_f && !_f.over && _f.fighters) {
          var foes = 0, allies = 0;
          for (var _i = 0; _i < _f.fighters.length; _i++) {
            var _w = _f.fighters[_i];
            if (!_w || !_w.alive) continue;
            if (_w.kind === 'monster' || _w.kind === 'hostile') foes++;
            else if (_w !== p) allies++;
          }
          if (foes >= 2) {
            var _ob = this.modTarget('combat.outnumbered_bonus', 0, {});
            if (_ob) {
              d = Math.round(d * (1 + _ob));
              this.say('ONE PERSON ARMY: surrounded — good. +' + Math.round(_ob * 100) + '% for the crowd.');
            }
          } else if (foes >= 1 && allies === 0) {
            var _sm = this.modTarget('combat.solo_damage', 1, {});
            if (_sm !== 1) {
              d = Math.round(d * _sm);
              this.say('ONE PERSON ARMY: alone in it — ×' + _sm + '. The whole army, in one body.');
            }
          }
        }
      } catch (e) {}
      return d;
    },

    // _applyAbilityDefenseMods: called when the player takes damage.
    // Checks braceActive and other defensive flags.
    _applyAbilityDefenseMods: function (dmg, source) {
      var s = this.state.scholar;
      // UNSTOPPABLE (wired 2026-10-07): combat.damage_taken — pain is
      // information; you read it and keep moving. Passive while held. First.
      try {
        var _dtm = this.modTarget('combat.damage_taken', 1, {});
        if (_dtm !== 1) dmg = Math.round(dmg * _dtm);
      } catch (e) {}
      // BRACE: 60% reduction. (Knockdown clause removed 2026-10-07: no
      // knockdown mechanic exists in src/js — the text no longer promises it.)
      if (s.braceActive) {
        var reduced = Math.round(dmg * (1 - s.braceActive.reduce));
        this.say('BRACE: you take it on the shoulder, rolling with it. ' + dmg + ' → ' + reduced + '.');
        delete s.braceActive;
        return reduced;
      }
      return dmg;
    },

    // _legacyActivatables: the OLD hardcoded activatable abilities that don't
    // yet have actions arrays in abilities.json. Kept for backward compat
    // until they're migrated to data. Each maps to useAbility when migrated.
    _legacyActivatables: function () {
      var s = this.state.scholar;
      var out = [];
      var has = function (id) { return G.hasAbility(id); }.bind(this);
      // NOTE: 'this' binding — use arrow or bind carefully.
      var self = this;
      var hasAb = function (id) { return self.hasAbility(id); };

      if (hasAb('blood_magic')) {
        var bc = this.hasSynergy('crimson_circuit') ? 7 : 10;
        out.push({
          abilityId: 'blood_magic', actionId: null, id: 'blood_magic',
          target: 'self', name: 'Blood Price',
          desc: '-' + bc + ' HP → +500 kcal. Your body eats itself.',
          available: (s.health || 0) > bc, why: 'Too weak — need ' + (bc + 1) + '+ HP.'
        });
      }
      if (hasAb('time_skip')) out.push({
        abilityId: 'time_skip', actionId: null, id: 'time_skip',
        target: 'none', name: 'Time Skip',
        desc: 'Skip to the next day part instantly. Ages you 1 day.', available: true
      });
      if (hasAb('dowsing')) out.push({
        abilityId: 'dowsing', actionId: null, id: 'dowsing',
        target: 'none', name: 'Dowse',
        desc: 'A forked stick twitches toward water. 70% accurate.', available: true
      });
      if (hasAb('echo_location')) out.push({
        abilityId: 'echo_location', actionId: null, id: 'echo_location',
        target: 'none', name: 'Echo-locate',
        desc: 'Clap once: sense the 3x3 around you. 1/day.',
        available: s.echoDay !== s.day, why: 'Used today.', combat: true
      });
      if (hasAb('field_medicine')) {
        var used = s.fieldMedDayPart === (s.day + '-' + this.dayPart);
        out.push({
          abilityId: 'field_medicine', actionId: null, id: 'field_medicine',
          target: 'self', name: 'Field Medicine',
          desc: 'Heal 20 HP. Once per day part.',
          available: !used && (s.health || 0) < this.maxHealth(),
          why: used ? 'Used this day part.' : 'Already at full health.', combat: true
        });
      }
      if (hasAb('herbal_remedy')) {
        var sick = (s.diseases || []).length > 0;
        out.push({
          abilityId: 'herbal_remedy', actionId: null, id: 'herbal_remedy',
          target: 'self', name: 'Herbal Remedy',
          desc: 'Cure disease. Knowledge of plants.',
          available: sick && s.herbalDay !== s.day,
          why: !sick ? 'Not sick.' : 'Used today.'
        });
      }
      if (hasAb('purify')) {
        var poisoned = (s.poisons || []).length > 0;
        out.push({
          abilityId: 'purify', actionId: null, id: 'purify',
          target: 'self', name: 'Purify',
          desc: 'Neutralize poison. Charcoal and clean water.',
          available: poisoned && s.purifyDay !== s.day,
          why: !poisoned ? 'Not poisoned.' : 'Used today.'
        });
      }
      if (hasAb('compost_king')) {
        var food = (s.inventory || []).find(function (i) { return (i.kcalEach || 0) > 0; });
        out.push({
          abilityId: 'compost_king', actionId: null, id: 'compost_king',
          target: 'none', name: 'Bury Food',
          desc: 'Bury food as fertilizer: +10% forage on this tile.',
          available: !!food, why: 'No food to bury.'
        });
      }
      if (hasAb('cannibal_frenzy')) out.push({
        abilityId: 'cannibal_frenzy', actionId: null, id: 'cannibal_frenzy',
        target: 'self', name: 'Feed the Red Hunger',
        desc: '+1000 kcal. -30 trust, permanently. Only when starving.',
        available: (s.kcal || 0) < 500, why: 'Only when starving (<500 kcal).'
      });
      return out;
    }
  };

  // =========================================================================
  // ACTION IMPLEMENTATIONS
  // Each key is "abilityId.actionId". The function receives (game, target).
  // Must narrate via game.say(). Return true on success, false on failure.
  // Costs are already paid by useAbility() before dispatch.
  // =========================================================================
  var ABILITY_ACTION_IMPLS = {

    // ---- HUNTER ----

    'game_sense.read_sign': function (game, target) {
      // Study tracks, scat, browse. Give real information.
      var s = game.state.scholar;
      // Look for recent animal activity in the area.
      var findings = [];
      try {
        var codex = game.state.codex || {};
        var encounters = codex.animalEncounters || {};
        var recent = Object.keys(encounters).filter(function (id) {
          return encounters[id] > 0;
        }).slice(0, 3);
        if (recent.length) {
          // KNOWLEDGE-GATED (hunter playtest 2026-10-07): the old line joined
          // raw animal ids ("Sign of gray_squirrel") — builder text leaking
          // onto the surface. Tracks say *something* passed; the species name
          // is earned the same way everywhere else (encAnimalKnown).
          var names = recent.map(function (id) {
            var ad = (game.data.animals || []).find(function (x) { return x.id === id; });
            if (ad && game.encAnimalKnown && game.encAnimalKnown(id)) return ad.name;
            return 'something';
          });
          findings.push('Sign of ' + names.join(', ') + ' — fresh enough to follow.');
        }
      } catch (e) {}
      if (!findings.length) {
        findings.push('Old sign — something passed through a day or more ago. Nothing fresh.');
      }
      // Direction hint from tile data if available.
      game.say('You crouch, reading the ground. ' + findings.join(' ') + ' (Read Sign)');
      return true;
    },

    'game_sense.read_stance': function (game, target) {
      // Once per fight: reveal monster's likely next move (knowledge-gated).
      var s = game.state.scholar;
      // NULL-GUARD (hunter loop 2026-10-07): tbfight.id must exist for the
      // once-per-fight check — undefined===undefined made the FIRST read of
      // every fight claim "already read". (tbfight.id is now set at creation,
      // but old saves / odd states still guard here.)
      var fid = game.tbfight ? game.tbfight.id : null;
      if (fid != null && s.stanceReadFight === fid) {
        game.say('You\'ve already read this fight. Trust what you saw. (Read Stance — once per fight.)');
        return false;
      }
      s.stanceReadFight = fid;
      // Pick the first alive monster as the read target.
      var m = game.tbFighter(target);
      if (!m && game.tbfight) {
        for (var fi = 0; fi < game.tbfight.fighters.length; fi++) {
          var cand = game.tbfight.fighters[fi];
          if (cand.kind === 'monster' && cand.alive) { m = cand; break; }
        }
      }
      if (!m) {
        game.say('No enemy to read. (Read Stance)');
        return false;
      }
      // Knowledge-gated: only reveal if the pattern is known.
      var mid = (m.mdef && m.mdef.id) || 'unknown';
      var known = false;
      try { known = game.tbPatternKnown(mid); } catch (e) {}
      if (known) {
        game.say('You read its weight, its breath, the set of its shoulders. ' +
          game._stanceHint(m) + ' (Read Stance — pattern known.)');
      } else {
        game.say('You study it — the way it shifts, the tension coiling. You don\'t know this one well enough to read it yet. Keep watching. (Read Stance — pattern unknown.)');
      }
      return true;
    },

    'patient_aim.take_aim': function (game, target) {
      // Spend turn aiming. Next shot 2.5x, can't miss. Exposed.
      var s = game.state.scholar;
      s.aimBonus = { mult: 2.5, guaranteed: true, exposeTurns: 1 };
      game.say('You go still. Breath slows. The world narrows to the target. Next shot: 2.5x damage, cannot miss. But you\'re exposed — enemies hit easier until your next turn. (Take Aim)');
      return true;
    },

    'patient_aim.clean_shot': function (game, target) {
      // Hunting: line up the shot. The flag steadies the next hunting strike
      // (+0.25 chance, consumed in huntAnimal); a lined-up kill is narrated
      // clean. Cleared by startCombat — the moment doesn't survive a fight.
      var s = game.state.scholar;
      s.cleanShotReady = true;
      game.say('You settle in, waiting for the perfect angle. Your next hunting strike lands more reliably — and when it lands, it lands clean: no suffering. (Line Up Clean Shot)');
      return true;
    },

    'field_dressing.dress_game': function (game, target) {
      // Break down game: convert a carcass to usable meat + parts.
      var s = game.state.scholar;
      // Find the most recent unprocessed carcass in the pack. (Hunted game
      // lands in the inventory as foodCarcass — state.corpses is the
      // person/monster death ledger, which carries no meat.)
      var inv = s.inventory || [];
      var idx = -1;
      for (var i = inv.length - 1; i >= 0; i--) {
        var it = inv[i];
        if (it && it.foodKind === 'meat' && it.foodState === 'carcass' && !it.charred) { idx = i; break; }
      }
      if (idx === -1) {
        game.say('No game to dress. Hunt or trap something first, then break it down clean. (Field Dress)');
        return false;
      }
      var c = inv[idx];
      // NO DOUBLE-DIP (hunter loop 2026-10-07): the hunt.meat_yield modifier
      // is already baked into hiddenKcal at the kill — your skill earned the
      // bigger carcass then. Dressing converts it to usable meat + parts; it
      // multiplies nothing. (The old impl re-multiplied ×1.3 on top.)
      var yield_ = Math.round(c.hiddenKcal || 100);
      var mult = 1;
      try { mult = game.modTarget('hunt.meat_yield', 100) / 100; } catch (e) {}
      var multTxt = mult > 1.001 ? ' (Field Dressing ×' + (Math.round(mult * 100) / 100) + ' — your skill kept more of the carcass.)' : '';
      inv.splice(idx, 1);
      s.kcal = (s.kcal || 0) + yield_;
      game.say('You work fast and clean — hide, sinew, bone, all usable. +' + yield_ + ' kcal of meat, plus parts.' + multTxt + ' (Field Dress)');
      return true;
    },

    'tracker.track': function (game, target) {
      // STATE-HONEST (hunter playtest 2026-10-07): the old line always claimed
      // a fresh eastward trail ("headed east, not long ago") — even on cold
      // ground, and it contradicted read_sign's honest "nothing fresh" in the
      // same kit. Track reads what's actually here: the live encounter,
      // recent sign, or nothing — and says which. Names stay knowledge-gated.
      var s = game.state.scholar;
      var line = null;
      try {
        var a = s.animal;
        if (a && a.id) {
          var px = (s.mx == null ? 4 : s.mx), py = (s.my == null ? 4 : s.my);
          var dx = a.mx - px, dy = a.my - py;
          var dist = Math.max(Math.abs(dx), Math.abs(dy));
          var dir = Math.abs(dx) >= Math.abs(dy)
            ? (dx > 0 ? 'east' : dx < 0 ? 'west' : '')
            : (dy > 0 ? 'south' : dy < 0 ? 'north' : '');
          var aname = 'something';
          try {
            var adef = (game.data.animals || []).find(function (x) { return x.id === a.id; });
            if (adef && game.encAnimalKnown && game.encAnimalKnown(a.id)) aname = adef.name;
          } catch (e) {}
          line = 'Fresh sign — ' + aname + (dir ? ', ' + dist + ' square' + (dist === 1 ? '' : 's') + ' ' + dir : ', right under your feet') + '. Move careful.';
        } else {
          var encounters = (game.state.codex || {}).animalEncounters || {};
          var recent = Object.keys(encounters).filter(function (id) { return encounters[id] > 0; }).slice(0, 3);
          if (recent.length) {
            var names = recent.map(function (id) {
              var ad = (game.data.animals || []).find(function (x) { return x.id === id; });
              if (ad && game.encAnimalKnown && game.encAnimalKnown(id)) return ad.name;
              return 'something';
            });
            line = 'Sign of ' + names.join(', ') + ' — fresh enough to follow.';
          }
        }
      } catch (e) {}
      if (line) game.say('You follow the trail — ' + line + ' (Track)');
      else game.say('Cold ground. Nothing fresh has passed here — no trail worth following. (Track)');
      return true;
    },

    'stalk.stalk_prey': function (game, target) {
      var s = game.state.scholar;
      // STALK CALMS (hunter loop 2026-10-07): the promise is "animals won't
      // flee your approach" — if an animal encounter is active, the slow
      // approach settles it. Its awareness drops, which flows straight into
      // the preyReaction flee roll. (The old stalkActive flag was set and
      // read by nothing — removed 2026-10-07; the awareness drop IS the
      // mechanism. The stalk passive stealth.move_silent is wired into the
      // preyReaction flee roll (food.js, via modTarget) for quiet movement
      // in general — holding stalk shaves the bolt chance beyond the aware
      // drop.)
      try {
        var a = s.animal;
        if (a) a.aware = Math.min(a.aware == null ? 0.6 : a.aware, 0.2);
      } catch (e) {}
      game.say('You become uninteresting. Just another shadow, just wind in grass. Animals won\'t flee your approach — until you act. (Stalk — once per approach.)');
      return true;
    },

    'blood_trail.follow_blood': function (game, target) {
      game.say('The blood tells you everything: lung shot, running east, slowing. It won\'t go far. Follow the drops — they\'re getting closer together. (Follow Blood Trail — east, ~3 tiles.)');
      return true;
    },

    'ambush.set_ambush': function (game, target) {
      var s = game.state.scholar;
      s.ambushReady = { mult: 2.0 };
      game.say('You pick your ground, settle your weight, and wait. Next attack: 2x damage — they never see it coming. (Ambush — prepared.)');
      return true;
    },

    'ambush.lay_wait': function (game, target) {
      var s = game.state.scholar;
      s.layWaitActive = true;
      game.say('You find the blind spot, the downwind side, the place they won\'t look. Your next animal encounter starts with you hidden. (Lay in Wait)');
      return true;
    },

    'animal_ken.read_beast': function (game, target) {
      // Study an animal: hungry, afraid, aggressive, sick?
      var states = ['hungry — it\'s looking for food, not a fight', 'afraid — it wants to run, give it space', 'aggressive — it\'s protecting something, back off slow', 'sick — something\'s wrong, don\'t eat this one'];
      var pick = states[Math.floor(Math.random() * states.length)];
      game.say('You watch how it moves, how it breathes. It\'s ' + pick + '. (Read the Beast)');
      return true;
    },

    'animal_ken.calm_beast': function (game, target) {
      var m = game.tbFighter(target);
      if (!m) {
        game.say('Nothing here to calm. (Calm)');
        return false;
      }
      // Only works on non-predatory animals (not monsters).
      if (m.kind === 'monster') {
        game.say('You try the calming breath, the low posture. It doesn\'t care — this thing isn\'t an animal, it\'s a monster. It\'s coming. (Calm — failed, it\'s a monster.)');
        return false;
      }
      // 50% chance to end the fight peacefully.
      if (Math.random() < 0.5) {
        game.say('You lower your hands, breathe slow, make yourself small and uninteresting. It watches you for a long moment... then turns and goes. The fight is over. (Calm — it worked.)');
        try { game.tbEnd('calmed'); } catch (e) {}
      } else {
        game.say('You try to calm it, but it\'s too far gone — hunger or fear has it. It\'s still coming. (Calm — failed.)');
      }
      return true;
    },

    'dead_aim.dead_aim_shot': function (game, target) {
      // One perfect shot: 3x, ignores armor, can't move.
      var s = game.state.scholar;
      s.deadAimShot = { mult: 3.0, ignoreArmor: true };
      game.say('One breath. One shot. 3x damage, and armor won\'t save them. You plant your feet — you\'re not moving this turn. (Dead Aim — the shot is ready, strike to fire it.)');
      return true;
    },

    'iron_stomach.push_through': function (game, target) {
      var s = game.state.scholar;
      // EXPEDITION CLOCK (Steve 2026-10-07): was wall-clock Date.now() in a
      // game with no wall clock. Now lasts one day part, decremented in
      // advancePart; the food poison roll checks s.pushThroughParts.
      s.pushThroughParts = 1;
      game.say('Your gut clenches and settles. Poison, nausea, bad food — you\'ll push through it until the next part of the day. Your body tells itself a useful lie. (Push Through)');
      return true;
    },

    // ---- BRAWLER ----

    'trade_of_blows.open_trade': function (game, target) {
      var s = game.state.scholar;
      // HP cost already paid via cost: {hp: 10}
      // TRADE WINDOW (wired 2026-10-07): combat.trade_window extends how many
      // strikes the +50% window covers (3 base + modifier).
      var attacks = 3;
      try { attacks = 3 + game.modTarget('combat.trade_window', 0, {}); } catch (e) {}
      s.tradeOpen = { attacksLeft: attacks, bonus: 0.5 };
      game.say('You let one through — take the hit, feel where it lands. The pain focuses you. Your next ' + attacks + ' attacks deal +50% damage. (Open the Trade — the exchange rate favors the bold.)');
      return true;
    },

    'trade_of_blows.settle_debt': function (game, target) {
      var s = game.state.scholar;
      if (s.debtSettled) {
        game.say('The debt\'s already settled. No double-dipping. (Settle the Debt — once per fight.)');
        return false;
      }
      var taken = s.fightDamageTaken || 0;
      if (taken <= 0) {
        game.say('You haven\'t taken any damage this fight. Nothing to cash in. Take a hit first. (Settle the Debt)');
        return false;
      }
      s.debtSettled = true;
      var bonus = Math.round(taken * 0.5);
      s.settleDebtBonus = bonus;
      game.say('You cash in every bruise, every cut. +' + bonus + ' damage on your next strike — the pain pays out. (Settle the Debt — once per fight.)');
      return true;
    },

    'unbreakable.brace': function (game, target) {
      var s = game.state.scholar;
      // HONESTY (2026-10-07): no knockdown mechanic exists in src/js, so the
      // old noKnockdown flag promised immunity to a non-existent system.
      s.braceActive = { reduce: 0.6 };
      game.say('You plant your feet, set your jaw, become a wall. Next incoming damage reduced 60%. (Brace)');
      return true;
    },

    'unbreakable.shake_off': function (game, target) {
      var s = game.state.scholar;
      if (s.shakeOffUsed) {
        game.say('You\'ve already shaken off what you can. The rest you\'ll have to carry. (Shake It Off — once per fight.)');
        return false;
      }
      s.shakeOffUsed = true;
      // STATUS ENGINE (Steve 2026-10-07): was clearing s.stun/s.slow/s.bleed,
      // which don't exist. Cure real statuses via Game.cureStatus on the
      // player fighter (or the scholar outside combat).
      var pf = null;
      try { pf = (game.tbfight && !game.tbfight.over) ? game.tbFighter('p') : null; } catch (e) {}
      var tgt = pf || 'scholar';
      var cleared = [];
      ['stun', 'stun_full', 'slow', 'bleed'].forEach(function (id) {
        try {
          if (game.cureStatus && game.cureStatus(tgt, id, 'Shake It Off')) cleared.push(id);
        } catch (e) {}
      });
      if (pf && !game.cureStatus) {
        try { pf.stunned = 0; pf.stunFull = 0; cleared.push('stun'); } catch (e) {}
      }
      // kcal cost already paid
      game.say('You roll your shoulders, spit blood, and keep moving. ' +
        (cleared.length > 0 ? 'Stun, slow, bleed — cleared. ' : 'Nothing to shake off — you were already clean. ') +
        'Your body burns fuel to keep going. (Shake It Off)');
      return true;
    },

    'war_cry.bellow': function (game, target) {
      // All enemies courage check or lose turn. Beasts may flee.
      var f = game.tbfight;
      if (!f) {
        game.say('No one to bellow at. (War Cry)');
        return false;
      }
      var affected = 0, fled = 0;
      // ENEMY MORALE (wired 2026-10-07): combat.enemy_morale — fear_itself
      // guts their nerve; the courage check fails more often when your
      // reputation precedes you.
      var morale = 1;
      try { morale = game.modTarget('combat.enemy_morale', 1, {}); } catch (e) {}
      var failChance = Math.min(0.95, 0.6 / morale);
      for (var i = 0; i < f.fighters.length; i++) {
        var m = f.fighters[i];
        if (m.kind !== 'monster' || !m.alive || m.fled) continue;
        // Courage check: 60% fail (worse for them when morale is broken).
        // Skittish/curious beasts may bolt outright.
        if (Math.random() < failChance) {
          var fearless = m.fearless || (m.mdef && m.mdef.fearless);
          var skittish = m.mdef && (m.mdef.aggression === 'skittish' || m.mdef.aggression === 'curious');
          if (!fearless && skittish && Math.random() < 0.25) {
            try { m.fled = true; } catch (e) {}
            fled++;
            try { game.say(game.encSubject(m) + ' bolts — not paid enough for this. (fled)'); } catch (e) {}
          } else {
            // STATUS ENGINE (Steve 2026-10-07): was m.stunTurns, which
            // nothing read. applyStatus bridges to m.stunned, which
            // tbMonsterTurn consumes.
            try {
              if (game.applyStatus) game.applyStatus(m, 'stun', { turns: 1, source: 'War Cry' });
              else m.stunned = (m.stunned || 0) + 1;
            } catch (e) { try { m.stunned = (m.stunned || 0) + 1; } catch (e2) {} }
            affected++;
          }
        }
      }
      try { game.tbEndCheck(); } catch (e) {}
      game.say('You BELLOW — raw, wordless, from the gut. ' +
        (affected > 0 ? affected + ' of them flinch, losing their next turn. ' : '') +
        (fled > 0 ? fled + ' bolt outright. ' : '') +
        ((affected === 0 && fled === 0) ? 'They hold their ground, but they heard you. ' : '') +
        '(War Cry)');
      return true;
    },

    'war_cry.challenge': function (game, target) {
      game.say('You issue the challenge — a bout, non-lethal, witnessed. Winner gains respect. Loser gains humility. Someone will answer, or they\'ll lose face. (Issue Challenge)');
      return true;
    },

    'haymaker.throw_haymaker': function (game, target) {
      var s = game.state.scholar;
      s.haymakerReady = { mult: 2.5, accPenalty: 0.3, offBalanceOnMiss: true };
      game.say('You wind up — telegraphed, wild, devastating. Next strike: 2.5x damage, but -30% accuracy. Miss, and you\'re off-balance (enemies hit easier next turn). (Haymaker — swing to fire.)');
      return true;
    },

    'rage.unleash_rage': function (game, target) {
      var s = game.state.scholar;
      // HONESTY (2026-10-07): the old frenzy:true flag and "nearest thing,
      // friend or foe / cannot retreat" text promised targeting and
      // retreat-lock mechanics that don't exist. What it does: +100% x3.
      s.rageActive = { rounds: 3, dmgMult: 2.0 };
      game.say('The red comes down. +100% damage for 3 rounds. (Unleash Rage — hold on.)');
      return true;
    },

    'second_wind.refuse_death': function (game, target) {
      // This is automatic (triggered on death), not manually invoked.
      // If called manually, explain.
      game.say('Refuse isn\'t something you choose — it\'s what happens when you would die and your body says NO. Once per day, automatic. (Refuse Death)');
      return false;
    },

    'fear_aura.loom': function (game, target) {
      var f = game.tbfight;
      if (!f || f.over) {
        game.say('No one to loom over. (Loom)');
        return false;
      }
      // LOOM (Steve 2026-10-07): was setting s.loomActive, which nothing
      // read. Now each enemy hesitates one full round — consumed in
      // tbMonsterTurn via m.loomHesitate.
      var n = 0;
      for (var i = 0; i < f.fighters.length; i++) {
        var m = f.fighters[i];
        if ((m.kind === 'monster' || m.kind === 'hostile') && m.alive && !m.fled) {
          m.loomHesitate = true;
          n++;
        }
      }
      game.say('You stand still. You let them look at you. Really look. ' +
        (n > 0 ? 'They hesitate — each loses its next round. ' : '') +
        'The villagers watching lose a little trust; this isn\'t the you they know. (Loom)');
      // Trust cost: -5 per the action text (was -2, and hit the wrong entry —
      // the player's own. Now hits the villagers actually watching: the
      // villager fighters in this fight).
      try {
        var v = game.state.village;
        if (v) {
          v.trust = v.trust || {};
          for (var j = 0; j < f.fighters.length; j++) {
            var w = f.fighters[j];
            if (w.kind === 'villager' && w.villagerId) {
              var cur = (v.trust[w.villagerId] === undefined) ? 15 : v.trust[w.villagerId];
              v.trust[w.villagerId] = Math.max(0, cur - 5);
            }
          }
        }
      } catch (e) {}
      return true;
    },

    'fear_aura.menace': function (game, target) {
      game.say('You don\'t raise a hand. You don\'t need to. Your point lands — +intimidation in this conversation. They\'ll remember this, and not fondly. (-trust afterward.) (Menace)');
      return true;
    },

    'brawler_instinct.read_fight': function (game, target) {
      var s = game.state.scholar;
      // SPEED, NOT INITIATIVE (Steve 2026-10-07): turn order is speed-based
      // (engine/combat.js turnOrder), so the old "+2 initiative" was dead.
      // Grant +2 speed: mid-fight it re-sorts from next round (orderDirty);
      // out of combat it's banked and consumed at the next fight start.
      var pf = null;
      try { pf = (game.tbfight && !game.tbfight.over) ? game.tbFighter('p') : null; } catch (e) {}
      if (pf) {
        pf.speed = (pf.speed || 3) + 2;
        try { game.tbfight.orderDirty = true; } catch (e) {}
      } else {
        s.fightRead = { speedBonus: 2 };
      }
      var m = game.tbFighter(target);
      if (m) {
        var mid = (m.mdef && m.mdef.id) || 'unknown';
        var known = false;
        try { known = game.tbPatternKnown(mid); } catch (e) {}
        if (known) {
          game.say('You\'ve seen this dance. ' + game._stanceHint(m) + ' You\'re already moving. +2 speed for the rest of the fight. (Read the Fight)');
        } else {
          game.say('You study the way it moves — but you don\'t know this one yet. +2 speed anyway; you\'re learning fast. (Read the Fight — pattern unknown.)');
        }
      } else {
        game.say('You size up the room, the angles, the exits. +2 speed for the rest of the fight. (Read the Fight)');
      }
      return true;
    },

    'intimidating_presence.stare_down': function (game, target) {
      var m = game.tbFighter(target);
      if (!m) {
        game.say('No one to stare down. (Stare Down)');
        return false;
      }
      // Courage check: 50% back off, unless fearless. Your menace
      // (social.intimidate modifiers) makes the stare land harder.
      var fearless = m.fearless || (m.mdef && m.mdef.fearless);
      if (fearless) {
        game.say('You lock eyes. It doesn\'t blink. This one doesn\'t know fear — or doesn\'t care. It\'s still coming. (Stare Down — truly fearless.)');
        return true; // Action worked (you tried), effect failed honestly
      }
      var intim = 0;
      try { intim = game.modTarget('social.intimidate', 0, {}); } catch (e) {}
      var backOff = Math.min(0.95, 0.5 + intim);
      if (Math.random() < backOff) {
        game.say('You lock eyes and don\'t look away. It falters — then backs off, disengaging. Smart. (Stare Down — it backed down.)');
        // DISENGAGE (Steve 2026-10-07): was m.disengaging, which nothing
        // read. m.fled is the engine's real disengage (cf. lockpick raccoon).
        try { m.fled = true; game.tbEndCheck(); } catch (e) {}
      } else {
        game.say('You lock eyes. It meets your stare and holds. Respect — but it\'s not backing down. (Stare Down — it held.)');
      }
      return true;
    },

    'intimidating_presence.end_it_before': function (game, target) {
      game.say('Your reputation walks in before you do. Most disputes resolve in your favor without a hand raised. Some will resent you for it later. (End It Before It Starts)');
      return true;
    }
  };

  Object.assign(G, methods);

  // Exposed for tests.
  _g.AbilityActionImpls = ABILITY_ACTION_IMPLS;
  _g.AbilityCostHandlers = COST_HANDLERS;
})(typeof window !== 'undefined' ? window : global);
