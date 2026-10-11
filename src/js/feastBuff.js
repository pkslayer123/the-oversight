// @ontology
// system: feastSurge
// description: Feast Surge — the TIMED BUFF (Worker B, 2026-10-10, Steve: "Okay build carefully"). Replaces the retired on-strike feastBurn trigger: a feast grants a buff window that decays at the next dawn. During the window, strikes AND ability resolutions read the feasted multiplier. The devotion arming (scholar.prog.feastSurge) is the gate — the buff only grants when armed.
// provides:
//   - grantFeastBuff(feast)
//   - feastedActive()
//   - feastedBuffState()
//   - feastedMult()
//   - feastedForm(abilityId, actionId)
//   - applyFeastedForm(abilityId, actionId, target, preHp)
//   - noteFeastedCombatUse()
//   - clearFeastBuff(expired)
//   - feastedLine()
//   - feastSurgeCfg()
// rules:
//   - devotion_gate: the buff grants ONLY when scholar.prog.feastSurge is armed (code: grantFeastBuff)
//   - timed_not_trigger: the buff is a window until next dawn, never an on-strike burn (code: grantFeastBuff, feastedActive)
//   - no_double_stack: re-feasting while feasted REFRESHES (better quality wins, expiry extends) — never stacks (code: grantFeastBuff)
//   - honest_use_marking: feastSurgeUsed marks ONLY on real combat use (strike or ability while feasted, inCombat); a feast that warms no blades spends no devotion (code: noteFeastedCombatUse)
//   - clean_expiry: expiry is lazy-evaluated against absolute (untilDay, untilPart) — save/load mid-buff is clean, no phantom buffs (code: feastedActive)
//   - generic_forms: feasted ability variants are data-driven (feast-surge.json twists) through generic handlers — never hand-written per-ability mechanics (code: applyFeastedForm)
//   - telegraph_honesty: every buff label states the true effective multiplier (code: grantFeastBuff, feastedLine, tbDamage hook in game.js)
//   - arc4_hotter: Arc IV's arc4burn multiplies the granted buff and is stated in the grant line (code: grantFeastBuff)
// consumes:
//   - state.scholar (feastBuff, prog.feastSurge, prog.feastSurgeUsed, day, health)
//   - dayPart, inCombat, tbFighter, addHealth, say, save
//   - Game.data.feastSurge (src/data/feast-surge.json)
// NOTE: self-attaching module (Object.assign(Game, methods)). Load AFTER
// game.js. The strike/ability uplift hooks live at their call sites
// (game.js tbDamage player-source hook; abilityActions.js useAbility +
// activateAbility wrappers) and call into these methods defensively.
// Index order: after waveLedger.js.
(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;
  const methods = {
    // feastSurgeCfg: the levers, from src/data/feast-surge.json. Defensive —
    // the ship loop may run a tree without the file; defaults match the JSON.
    feastSurgeCfg() {
      try {
        const d = (this.data && this.data.feastSurge) || {};
        const b = d.buff || {};
        return {
          duration: b.duration || 'until_next_dawn',
          partsPerDay: b.partsPerDay || 4,
          qualityNames: Object.assign(
            { 0: 'a simple feast', 1: 'a proper feast', 2: 'a legendary spread' },
            b.qualityNames || {}
          ),
          qualityUplift: Object.assign({ 0: 1.2, 1: 1.35, 2: 1.5 }, b.qualityUplift || {}),
          surgeDefault: b.surgeDefault != null ? b.surgeDefault : 1.5,
          feastMinimums: d.feastMinimums || { minFeastKcal: 1500, minGuests: 3 },
          refeast: d.refeast || { policy: 'refresh', quality: 'best' },
          twists: d.twists || {},
        };
      } catch (e) {
        return {
          duration: 'until_next_dawn', partsPerDay: 4,
          qualityNames: { 0: 'a simple feast', 1: 'a proper feast', 2: 'a legendary spread' },
          qualityUplift: { 0: 1.2, 1: 1.35, 2: 1.5 }, surgeDefault: 1.5,
          feastMinimums: { minFeastKcal: 1500, minGuests: 3 },
          refeast: { policy: 'refresh', quality: 'best' }, twists: {},
        };
      }
    },

    // grantFeastBuff(feast): Worker A's feast event calls this with
    // { quality: 0..2, served: [{itemId, kcal}], guests: [ids], daypart }.
    // Validates the devotion gate, sets buff state with absolute dawn expiry,
    // returns the granted buff or an honest refusal. NEVER stacks: a live
    // buff is refreshed (better quality wins, window extends to next dawn).
    grantFeastBuff(feast) {
      const cfg = this.feastSurgeCfg();
      const s = this.state.scholar || {};
      feast = feast || {};
      try {
        const armed = (s.prog || {}).feastSurge;
        if (!armed) {
          const why = 'The feast is warm and good — full bellies, loud laughter — but no keepsake was channeled. The surge must be armed before a feast can carry it: hold a keepsake and channel first. (Feast buff refused: devotion gate.)';
          this.say('🍖 ' + why);
          return { granted: false, why };
        }
        let q = Math.round(feast.quality != null ? feast.quality : 0);
        if (!(q >= 0)) q = 0;
        q = Math.max(0, Math.min(2, q));
        const surge = (typeof armed === 'number' && armed > 0) ? armed : cfg.surgeDefault;
        // ARC IV (progression.js): "the feast was the weapon" pays off — the
        // System finally sees that eating is the engine, and feasted buffs
        // burn hotter from here. Stated in the grant line, never silent.
        const arcBurn = (typeof s.arc4burn === 'number' && s.arc4burn > 1) ? s.arc4burn : 1;
        const arcNote = arcBurn > 1 ? ' Arc IV burns hotter.' : '';
        const effMult = (uplift, sg) => Math.round(uplift * sg * arcBurn * 100) / 100;
        const day = s.day || 0;
        const untilDay = day + 1, untilPart = 0; // next dawn, always
        const existing = this.feastedBuffState();
        if (existing) {
          // REFEAST = REFRESH (design call 2026-10-10): the window extends to
          // the next dawn and the better quality wins. The multiplier is
          // recomputed, never multiplied onto itself — no double-feast.
          // (If the old buff was already used in combat, the arming was
          // consumed, so this branch is unreachable without fresh devotion.)
          const nq = Math.max(existing.quality || 0, q);
          const nuplift = cfg.qualityUplift[nq] || 1;
          existing.quality = nq;
          existing.uplift = nuplift;
          existing.surge = surge;
          existing.mult = effMult(nuplift, surge);
          existing.untilDay = untilDay;
          existing.untilPart = untilPart;
          const parts = Math.max(1, (untilDay - day) * cfg.partsPerDay - this.dayPart);
          this.say(`🍖 The feast carries you on — the fire is stoked higher, not doubled. FEASTED ×${existing.mult} until dawn (${parts} ${parts === 1 ? 'part' : 'parts'} left): ${cfg.qualityNames[nq]}.${arcNote} (Re-feast refreshes; it never stacks.)`);
          try { this.save(); } catch (e) {}
          return { granted: true, refreshed: true, mult: existing.mult, untilDay, untilPart, quality: nq };
        }
        const uplift = cfg.qualityUplift[q] || 1;
        const mult = effMult(uplift, surge);
        s.feastBuff = {
          day, part: this.dayPart, quality: q, uplift, surge, mult,
          untilDay, untilPart, used: false,
          served: feast.served || [], guests: feast.guests || [],
        };
        const parts = Math.max(1, (untilDay - day) * cfg.partsPerDay - this.dayPart);
        const devNote = surge > 1 ? ` A channeled keepsake feeds the flames (devotion ×${surge}).` : '';
        this.say(`🍖 FEASTED ×${mult} until dawn (${parts} ${parts === 1 ? 'part' : 'parts'} left): ${cfg.qualityNames[q]}.${devNote}${arcNote} Strikes and abilities hit with the feast behind them.`);
        try { this.save(); } catch (e) {}
        return { granted: true, refreshed: false, mult, untilDay, untilPart, quality: q };
      } catch (e) {
        return { granted: false, why: 'grant failed: ' + (e && e.message) };
      }
    },

    // feastedActive: the buff is live. Expiry is lazy: the buff carries an
    // absolute (untilDay, untilPart=dawn); once the day reaches untilDay it
    // is cleared with its fade line, exactly once. Save/load safe — a buff
    // saved mid-window is still valid after Continue (dawn hasn't come); a
    // buff whose dawn passed is gone, never phantom.
    feastedActive() {
      try {
        const s = this.state.scholar || {};
        const b = s.feastBuff;
        if (!b || typeof b !== 'object') return false;
        const day = s.day || 0;
        if (day >= (b.untilDay || 0)) {
          this.clearFeastBuff(true);
          return false;
        }
        return true;
      } catch (e) { return false; }
    },

    // feastedBuffState: the live buff object, or null.
    feastedBuffState() {
      try {
        return this.feastedActive() ? (this.state.scholar || {}).feastBuff : null;
      } catch (e) { return null; }
    },

    // feastedMult: the true effective multiplier while feasted, else 1.
    // qualityUplift × devotion surge — one number for strikes and abilities.
    feastedMult() {
      const b = this.feastedBuffState();
      return b ? (b.mult || 1) : 1;
    },

    // clearFeastBuff(expired): drop the buff. The fade line fires once, only
    // on real expiry — never on manual clears.
    clearFeastBuff(expired) {
      try {
        const s = this.state.scholar || {};
        if (!s.feastBuff) return;
        delete s.feastBuff;
        if (expired) this.say("The feast's fire burns low — the buff fades with the night. (Feasted expired.)");
      } catch (e) {}
    },

    // feastedLine: the visible countdown for the status row. Honest label:
    // true mult, parts remaining, what it does.
    feastedLine() {
      try {
        const b = this.feastedBuffState();
        if (!b) return '';
        const cfg = this.feastSurgeCfg();
        const s = this.state.scholar || {};
        const parts = Math.max(0, ((b.untilDay || 0) - (s.day || 0)) * cfg.partsPerDay - this.dayPart);
        return `FEASTED ×${b.mult} — strikes & abilities uplifted · until dawn (${parts} ${parts === 1 ? 'part' : 'parts'} left)`;
      } catch (e) { return ''; }
    },

    // feastedForm(abilityId, actionId): the feasted variant of a known
    // ability — almost-evolved, with a timer. { mult, twist }. Default is
    // clean uplift (no twist); twists come from feast-surge.json, keyed
    // 'abilityId.actionId' with fallback to 'abilityId'.
    feastedForm(abilityId, actionId) {
      const cfg = this.feastSurgeCfg();
      const twists = (cfg && cfg.twists) || {};
      const key = actionId ? abilityId + '.' + actionId : abilityId;
      const twist = (twists[key] || twists[abilityId]) || null;
      return { mult: this.feastedMult(), twist };
    },

    // _feastPreHp: snapshot for heal measurement. Fighter HP is the live pool
    // mid-combat (addHealth routes there); scholar.health out of combat.
    _feastPreHp() {
      try {
        const s = this.state.scholar || {};
        let fighter = null;
        try {
          if (this.inCombat && this.inCombat() && this.tbFighter) {
            const p = this.tbFighter('p');
            fighter = p ? (p.hp || 0) : null;
          }
        } catch (e) {}
        return { scholar: s.health || 0, fighter };
      } catch (e) { return { scholar: 0, fighter: null }; }
    },
    _feastHpTotal() {
      try {
        const s = this.state.scholar || {};
        let t = s.health || 0;
        try {
          if (this.inCombat && this.inCombat() && this.tbFighter) {
            const p = this.tbFighter('p');
            if (p) t = p.hp || 0;
          }
        } catch (e) {}
        return t;
      } catch (e) { return 0; }
    },

    // applyFeastedForm(abilityId, actionId, target, preHp): called after a
    // SUCCESSFUL ability resolution while feasted (useAbility + the legacy
    // activateAbility branch). Generic uplift already applied at the damage
    // funnels; here the data-driven TWIST runs — the wacky almost-evolved
    // bit, where the fiction supports it. Also the combat-use marker: any
    // ability resolved in combat while feasted counts as real use.
    applyFeastedForm(abilityId, actionId, target, preHp) {
      try {
        if (!this.feastedActive()) return;
        if (this.inCombat && this.inCombat()) this.noteFeastedCombatUse();
        const form = this.feastedForm(abilityId, actionId);
        const tw = form.twist;
        if (!tw || !tw.kind) return;
        if (tw.kind === 'heal_bonus') this._feastHealBonus(tw, preHp);
        else if (tw.kind === 'status_extend') this._feastStatusExtend(tw);
      } catch (e) {}
    },

    // _feastHealBonus: the feasted form of a heal — measure what the ability
    // actually healed, then grant the bonus on top, stating the TRUE landed
    // number (addHealth may clamp at max).
    _feastHealBonus(tw, preHp) {
      try {
        let gained = 0;
        if (preHp) {
          const s = this.state.scholar || {};
          gained += Math.max(0, (s.health || 0) - (preHp.scholar || 0));
          if (preHp.fighter != null) {
            try {
              const p = this.tbFighter ? this.tbFighter('p') : null;
              if (p) gained += Math.max(0, (p.hp || 0) - preHp.fighter);
            } catch (e) {}
          }
        }
        gained = Math.round(gained);
        if (gained <= 0) return;
        const want = Math.max(1, Math.round(gained * ((tw.pct || 50) / 100)));
        const before = this._feastHpTotal();
        try { this.addHealth(want); } catch (e) {}
        const landed = Math.max(0, Math.round(this._feastHpTotal() - before));
        if (landed <= 0) return;
        const line = String(tw.line || 'Feasted: +{bonus} HP.').replace('{bonus}', String(landed));
        this.say(line);
      } catch (e) {}
    },

    // _feastStatusExtend: the feasted form holds the ability's status longer.
    // Extends the engine entry AND any legacy parallel field (stun's
    // m.stunned, blind's m.blind) so the tracks stay in sync. Fires only if
    // at least one foe was actually extended — never a lie.
    _feastStatusExtend(tw) {
      try {
        const st = tw.status, rounds = tw.rounds || 1;
        if (!st) return;
        const f = this.tbfight;
        if (!f || !f.fighters) return;
        let n = 0;
        for (const m of f.fighters) {
          if (!m || !m.alive || m.fled) continue;
          if (m.kind !== 'monster' && m.kind !== 'hostile') continue;
          let has = false;
          try { has = this.hasStatus ? !!this.hasStatus(m, st) : false; } catch (e) {}
          if (!has && !(typeof m[st] === 'number' && m[st] > 0)) continue;
          try {
            const list = this.seList ? this.seList(m) : [];
            for (const e of list) {
              if (e.id === st && e.turnsLeft != null) { e.turnsLeft += rounds; n++; break; }
            }
            if (typeof m[st] === 'number' && m[st] > 0) { m[st] += rounds; n++; }
            else if (st === 'stun' && typeof m.stunned === 'number') { m.stunned += rounds; n++; }
          } catch (e) {}
        }
        if (n > 0) this.say(tw.line || `Feasted: the ${st} holds ${rounds} round longer.`);
      } catch (e) {}
    },

    // noteFeastedCombatUse: the buff's first real combat use — a player
    // strike or an ability resolved while feasted and in combat. Marks
    // feastSurgeUsed (Arc IV deed-gate requirement) and spends the devotion
    // arming. Idempotent. A feast that warms no blades marks nothing and
    // spends nothing — the devotion stays armed for the next feast.
    noteFeastedCombatUse() {
      try {
        if (!this.inCombat || !this.inCombat()) return;
        const s = this.state.scholar || {};
        const b = s.feastBuff;
        if (!b || b.used) return;
        b.used = true;
        if (s.prog) { s.prog.feastSurge = false; s.prog.feastSurgeUsed = true; }
        try { this.save(); } catch (e) {}
      } catch (e) {}
    },
  };
  Object.assign(Game, methods);
})();
