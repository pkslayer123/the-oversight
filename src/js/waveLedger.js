// @ontology
// system: waves
// description: The Wave Ledger — wave unlocks run on KILLS ONLY. Per wave, per village, per run, cumulative across player deaths (lives on state, not the scholar).
// provides:
//   - waveLedgerCfg()
//   - ledgerState()
//   - monsterCounterKnown(monsterId)
//   - scoreLedgerKill(monsterId)
//   - waveLedgerPoints(wave)
//   - ledgerProgressLine()
// rules:
//   - ledger_kills_only: true (code: waveLedger.js — scoreLedgerKill is fed ONLY by recordWaveKill; engagements/flees/evades score nothing)
//   - ledger_counter_convention: true (code: waveLedger.js — monsterCounterKnown: state.monsterCounters[id]===true AND the monster def carries a `counter` field; no def has one yet, so the mastery bonus is dormant — a kill never scores less than 1)
//   - ledger_per_type_cap: 2 (code: waveLedger.js — perTypeCap; breadth over farming)
//   - ledger_announce_idempotent: true (code: waveLedger.js — 50%/full beats fire once per wave via state._ledgerAnn50/_ledgerAnnFull)
//   - ledger_survives_scholar: true (code: waveLedger.js — ledgerState lives on this.state, not this.state.scholar)
//   - ledger_reverses_8730921c: true (code: game.js — unlockedWave is ledger-only; engagement lanes removed 2026-10-10, Steve's call; the endgame deed gate is untouched)
// NOTE: self-attaching module (Object.assign(Game, methods)). Load AFTER
// game.js (recordWaveKill calls scoreLedgerKill) and progression.js (the deed
// feed it is deliberately separate from). Index order: after progression.js.
(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;
  const methods = {
    // waveLedgerCfg: the levers, from src/data/wave-ledger.json. Defensive —
    // the ship loop may run a tree without the file; defaults match the JSON.
    waveLedgerCfg() {
      try {
        const d = (this.data && this.data.waveLedger) || {};
        return {
          pointsPerKill: d.pointsPerKill != null ? d.pointsPerKill : 1,
          pointsPerCounterKill: d.pointsPerCounterKill != null ? d.pointsPerCounterKill : 2,
          perTypeCap: d.perTypeCap != null ? d.perTypeCap : 2,
          barsPerWave: Object.assign({ 1: 5, 2: 5, 3: 4, 4: 3, 5: 2 }, d.barsPerWave || {}),
          dayFloor: d.dayFloor != null ? d.dayFloor : 25,
          wave2DayFloor: d.wave2DayFloor != null ? d.wave2DayFloor : 8,
          counterBonusEnabled: Object.assign({ 1: true, 2: true, 3: true, 4: true, 5: true }, d.counterBonusEnabled || {}),
        };
      } catch (e) {
        return { pointsPerKill: 1, pointsPerCounterKill: 2, perTypeCap: 2, barsPerWave: { 1: 5, 2: 5, 3: 4, 4: 3, 5: 2 }, dayFloor: 25, wave2DayFloor: 8, counterBonusEnabled: { 1: true, 2: true, 3: true, 4: true, 5: true } };
      }
    },
    // ledgerState: defensive init of the ledger. Lives on this.state (the
    // village+run), NOT this.state.scholar — a new adventurer inherits the
    // village's ledger. {1:{points:0,perType:{}},...} for waves 1..5.
    ledgerState() {
      try {
        const st = this.state || {};
        if (!st.waveLedger || typeof st.waveLedger !== 'object') st.waveLedger = {};
        for (let w = 1; w <= 5; w++) {
          const e = st.waveLedger[w];
          if (!e || typeof e !== 'object') st.waveLedger[w] = { points: 0, perType: {} };
          else {
            if (typeof e.points !== 'number') e.points = 0;
            if (!e.perType || typeof e.perType !== 'object') e.perType = {};
          }
        }
        return st.waveLedger;
      } catch (e) { return { 1: { points: 0, perType: {} } }; }
    },
    // monsterCounterKnown(monsterId): THE CONVENTION for the parallel
    // signature-mechanics loop (2026-10-10). The mastery bonus fires only when
    // BOTH hold: the player/village has discovered the counter
    // (state.monsterCounters[id] === true — set by the signature-mechanics
    // workers when the counter is discovered in play) AND the monster def
    // carries a `counter` field describing it. Verified 2026-10-10: NO monster
    // def has counter data yet — the bonus is DORMANT. A kill never scores
    // less than pointsPerKill; nothing is ever punished for not knowing.
    monsterCounterKnown(monsterId) {
      try {
        const known = (this.state && this.state.monsterCounters && this.state.monsterCounters[monsterId]) === true;
        if (!known) return false;
        const mdef = (this.data && this.data.monsters || []).find(m => m.id === monsterId);
        return !!(mdef && mdef.counter);
      } catch (e) { return false; }
    },
    // scoreLedgerKill(monsterId): the ledger feed choke point's scorer.
    // Called ONLY from recordWaveKill (game.js) — every kill path (player TB
    // kills, villager field-fight kills) flows through recordWaveKill, so the
    // ledger sees them all. Engagements (faced/fled/evaded) never call
    // recordWaveKill and score NOTHING.
    // points = counterKnown && counterBonusEnabled[wave] ? pointsPerCounterKill : pointsPerKill
    // capped by perTypeCap per monster id. Exception-guarded: scoring never
    // breaks a kill.
    scoreLedgerKill(monsterId) {
      try {
        if (!monsterId) return 0;
        const cfg = this.waveLedgerCfg();
        const mdef = (this.data && this.data.monsters || []).find(m => m.id === monsterId);
        if (!mdef) return 0;
        const wave = mdef.wave || 1;
        const L = this.ledgerState();
        const entry = L[wave];
        const counterKnown = this.monsterCounterKnown(monsterId);
        const bonusOn = !!(cfg.counterBonusEnabled && cfg.counterBonusEnabled[wave]);
        const points = (counterKnown && bonusOn) ? cfg.pointsPerCounterKill : cfg.pointsPerKill;
        const room = Math.max(0, cfg.perTypeCap - ((entry.perType[monsterId] | 0)));
        const add = Math.min(points, room);
        if (add > 0) {
          entry.perType[monsterId] = (entry.perType[monsterId] | 0) + add;
          entry.points += add;
          this._ledgerAnnounce(wave, entry.points, cfg);
        }
        return add;
      } catch (e) { return 0; }
    },
    // waveLedgerPoints(wave): the ledger's point total for that wave.
    waveLedgerPoints(wave) {
      try { return ((this.ledgerState()[wave] || {}).points | 0); } catch (e) { return 0; }
    },
    // _ledgerAnnounce: idempotent System beats at 50% and 100% of each wave's
    // bar. Televised, honest copy ("kills only — not near-misses").
    _ledgerAnnounce(wave, points, cfg) {
      try {
        const st = this.state || {};
        st._ledgerAnn50 = st._ledgerAnn50 || {};
        st._ledgerAnnFull = st._ledgerAnnFull || {};
        const bar = (cfg.barsPerWave || {})[wave] || 1;
        if (bar <= 0) return;
        if (points >= bar && !st._ledgerAnnFull[wave]) {
          st._ledgerAnnFull[wave] = true;
          st._ledgerAnn50[wave] = true;
          this.sysSay(`📺 WAVE LEDGER — wave ${wave}'s bar is full (${bar}/${bar} — kills only, not near-misses). The next wave opens when the day and scale floors pass.`);
        } else if (points >= bar / 2 && !st._ledgerAnn50[wave]) {
          st._ledgerAnn50[wave] = true;
          this.sysSay(`📺 WAVE LEDGER — wave ${wave} is halfway there (${points}/${bar} kills — the ledger counts kills only, not near-misses).`);
        }
      } catch (e) {}
    },
    // ledgerProgressLine: the persistent UI line for beatsRowHTML (app.js).
    // Shows the FIRST unfilled wave bar ("kills only", honest labels).
    // Returns '' when every bar is full or the ledger is unavailable.
    ledgerProgressLine() {
      try {
        const cfg = this.waveLedgerCfg();
        for (let w = 1; w <= 5; w++) {
          const bar = (cfg.barsPerWave || {})[w];
          if (!bar) continue;
          const pts = this.waveLedgerPoints(w);
          if (pts < bar) {
            const bonusOn = !!(cfg.counterBonusEnabled && cfg.counterBonusEnabled[w]);
            const ck = bonusOn ? '; counter kills +1' : '';
            return `📺 WAVE LEDGER — wave ${w}: ${pts}/${bar} kills (kills only${ck})`;
          }
        }
        return '';
      } catch (e) { return ''; }
    },
  };
  Object.assign(Game, methods);
})();
