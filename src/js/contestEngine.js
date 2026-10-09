// @ontology
// system: contest-engine
// description: Real off-screen contest resolution for villager contestants. Every category resolves through a real process with the contestant's real stats — fights are fought (fieldFights.js), moots are argued (social stats, rounds), ordeals are endured (costs paid from real reserves). Never a single outcome table. (Steve 2026-10-08: "contests are to be played, not as RNG.")
// provides:
//   - contestResolveVillager(pid, contest, opts) -> {outcome, detail, log[]}
//   - contestResolveGroup(pids, contest, opts) -> {pid: {outcome, detail, log[]}}
//   - duelFight(a, b, opts) -> villager-vs-villager rounds
//   - contestBeastFor(wave, targetHp)
// rules:
//   - blood: pit/gauntlet/siege via fieldFight (real rounds, real stats); duel via duelFight (to the yield — death only on massive overkill); tithe via bleeding measures (demand vs health pool, temperament decides the rest). (code: bloodResolve)
//   - moot: caseScore = notability*2 + trust/10 + bravery/10 + temperament; p1 vs risk demand, p2 head-to-head with trust/notability tiebreaks. (code: mootResolve)
//   - endurance: ordeals with honest costs — starve (health/day), drop (legs/speed/stamina), maw (nerve vs demand), vigil (bravery vs fear), exchange (team relay). (code: enduranceResolve)
//   - other: stat-driven structured resolution, documented per category; chance is rigged theater (ratings-driven, deterministic). (code: otherResolve)
//   - deterministic: same villager + same contest + same state = same fate — ENFORCED, not aspirational. Every top-level resolution reseeds a private stream from (day, contest id, participants, stat snapshot) via _cxSeed/_cxWithSeed; roll() bypasses Scattering.combat.roll while _det is set; fieldFight draws from opts.rng. No Math.random anywhere in the resolution path — no hidden rolls, no save-scum (reloading replays the identical fate). The process is real; the player can't see the stats anyway (knowledge-gating). (code: _cxSeed, _cxWithSeed, Steve 2026-10-08; break-it 2026-10-08)
//   - cheer: watcher's cheer is a real performance modifier (braveryBonus in blood incl. duelFight, case lift in moot); the cheer input is capped at 0.15 as before (alien winMod applies after, as its own meddling). (code: contestResolveGroup, Steve 2026-10-08; break-it 2026-10-08)
// consumes:
//   - fieldFight (fieldFights.js), monsterWavePool, unlockedWave
//   - Game.agencyOf, Game.npcTemper, village health, scholar trust
//   - hurtVillager, displayName
/* CONTEST ENGINE — src/js/contestEngine.js
 *
 * Steve (2026-10-08): "No, contests are to be played, not as RNG."
 *
 * Villager contestants don't get dice tables. They get the real thing,
 * simulated off-screen with their real stats:
 * - Blood: real fights (fieldFights.js). The pit is a fight. The gauntlet
 *   is three fights. The duel is a fight to the yield.
 * - Moot: real social rounds. Your case is your deeds, your standing, your
 *   nerve. The audience is the jury and the jury can count.
 * - Endurance: real ordeals. Costs come out of real reserves — health,
 *   nerve, stamina. You have what you have.
 * - Everything else: stat-driven, structured, documented. Chance contests
 *   are rigged — the System is a TV producer, and the rigging follows the
 *   ratings. That's not a bug, it's the fiction, and it's written down.
 */
(function() {
  const G = globalThis.Scattering.Game;

  // Seeded-at-load RNG like the other sim modules (deterministic per load).
  var _s = 0xC0E7E5;
  // DETERMINISM ENFORCEMENT (break-it 2026-10-08): _det is true while a
  // top-level resolution runs under _cxWithSeed. roll() then draws only from
  // the seeded stream — never from Scattering.combat.roll (Math.random).
  // Same villager + same contest + same state = same fate. No hidden rolls,
  // no save-scum: reloading and re-resolving replays the identical fate.
  var _det = false;
  var R = function() {
    _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
    var t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  var roll = function(range) {
    if (_det) return range[0] + Math.floor(R() * (range[1] - range[0] + 1));
    try {
      const _g = typeof window !== 'undefined' ? window : global;
      if (_g.Scattering && _g.Scattering.combat && _g.Scattering.combat.roll)
        return _g.Scattering.combat.roll(range);
    } catch (e) {}
    return range[0] + Math.floor(R() * (range[1] - range[0] + 1));
  };
  var clamp = function(x, a, b) { return Math.max(a, Math.min(b, x)); };

  var methods = {
    // ---- villager stat read ----
    _cxStats: function(pid) {
      var hp = 100;
      try {
        const vh = (this.state.village || {}).health || {};
        if (vh[pid] !== undefined) hp = vh[pid];
      } catch (e) {}
      var bravery = 0, tracking = 0, survival = 0;
      try {
        const xp = ((this.agencyOf(pid) || {}).xp || {})[pid] || {};
        bravery = xp.bravery || 0; tracking = xp.tracking || 0; survival = xp.survival || 0;
      } catch (e) {}
      var trust = 10;
      try {
        const t = ((this.state.village || {}).trust || {})[pid];
        if (t !== undefined) trust = t;
      } catch (e) {}
      var nota = 0;
      try { nota = (this.notability(pid) || []).length; } catch (e) {}
      var temper = 'steady';
      try { temper = this.npcTemper(pid) || 'steady'; } catch (e) {}
      var wb = 0;
      try {
        const _g = typeof window !== 'undefined' ? window : global;
        const S = (_g.Scattering || {}).S || {};
        const vp = ((this.data.villagers || []).find(function(x) { return x.id === pid; }) || {});
        if (S.equipment && S.equipment.weaponBonusOf)
          wb = Math.round((S.equipment.weaponBonusOf(vp, this.data.items) || 0) / 2);
      } catch (e) {}
      var clever = false;
      try { clever = !!(((this.agencyState() || {}).potential || {})[pid] === 'clever'); } catch (e) {}
      var name = 'Someone';
      try { name = this.displayName(pid); } catch (e) {}
      return { hp: Math.max(1, hp), maxHp: 100, bravery, tracking, survival, trust, nota, temper, wb, clever, name };
    },

    // ---- determinism: seed from stable, save-persistent state ----
    // The seed is day + contest + participants + their stat snapshot. Same
    // state in, same fate out — across reloads, which is what closes the
    // save-scum vector (re-resolving after a reload replays the same fate).
    _cxSeed: function(pids, contest) {
      var day = 1;
      try { day = (this.state.scholar || {}).day || 1; } catch (e) {}
      var parts = [day, (contest && contest.id) || '?', pids.slice().sort().join('+')];
      for (const pid of pids.slice().sort()) {
        try {
          const s = this._cxStats(pid);
          parts.push([pid, s.hp, s.bravery, s.tracking, s.survival, s.trust, s.nota, s.temper, s.wb, s.clever ? 1 : 0].join(':'));
        } catch (e) { parts.push(String(pid)); }
      }
      var str = parts.join('|'), h = 2166136261;
      for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      return h >>> 0;
    },
    // Run fn with the module RNG reseeded from the resolution's seed and
    // _det set so roll() bypasses combat.roll. Restores prior state after —
    // nesting (duel inside group) is safe.
    _cxWithSeed: function(pids, contest, fn) {
      const seed = this._cxSeed(pids, contest);
      const prevS = _s, prevDet = _det;
      _s = seed; _det = true;
      try { return fn(); } finally { _s = prevS; _det = prevDet; }
    },

    // ---- wave-appropriate beast, System-matched ----
    // The System wants a fair fight for ratings: the beast's HP is matched
    // closest to the target. Wave-scoping comes from monsterWavePool()
    // (unlocked waves only); gauntlet/siege escalation comes from the
    // caller's targetHp scaling (0.7 + w*0.3) — not from the wave param,
    // which is kept for the documented signature.
    contestBeastFor: function(wave, targetHp) {
      var pool = [];
      try { pool = this.monsterWavePool ? this.monsterWavePool() : (this.data.monsters || []); }
      catch (e) { pool = this.data.monsters || []; }
      if (!pool.length) return null;
      var best = null, bestD = Infinity;
      for (const m of pool) {
        const hp = (m.hp && m.hp[1] !== undefined) ? (m.hp[0] + m.hp[1]) / 2 : 25;
        const d = Math.abs(hp - (targetHp || 60));
        if (d < bestD) { bestD = d; best = m; }
      }
      return best;
    },

    // ---- DUEL: villager vs villager, to the yield ----
    // Same round structure as fieldFight: tactical strike formula both
    // sides, morale breaks driven by wounds. "Not to the death — to the
    // yield": hitting 0 means yield (lost), unless the blow was massive
    // (≥60% of maxHp in one strike) — "accidents happen."
    // opts.braveryBonus (watcher's cheer / alien rigging) steadies or
    // shakes both duelists' arms — duels are blood, and blood gets the
    // cheer. Self-seeding: deterministic from the duelists and the day.
    duelFight: function(a, b, opts) {
      opts = opts || {};
      return this._cxWithSeed([a, b], { id: 'duel' }, () => {
      const bravBonus = opts.braveryBonus || 0;
      const sa = this._cxStats(a), sb = this._cxStats(b);
      var ha = sa.hp, hb = sb.hp;
      const rec = { rounds: 0, aTaken: 0, bTaken: 0, log: [] };
      const vBreak = function(s) {
        return clamp(0.5 - Math.min(0.3, (s.bravery + bravBonus) * 0.015)
          - (s.temper === 'bold' ? 0.1 : 0) + (s.temper === 'cautious' ? 0.1 : 0), 0.15, 0.6);
      };
      const ba = vBreak(sa), bb = vBreak(sb);
      for (let round = 1; round <= 15; round++) {
        rec.rounds = round;
        const first = R() < 0.5 ? 'a' : 'b';
        for (const side of [first, first === 'a' ? 'b' : 'a']) {
          if (ha <= 0 || hb <= 0) break;
          if (side === 'a') {
            const d = roll([4 + sa.wb, 8 + sa.wb]);
            hb -= d; rec.bTaken += d;
            if (hb <= 0) {
              if (d >= sb.maxHp * 0.6) return Object.assign(rec, { outcome: 'bDied', log: rec.log.concat([`${sa.name} lands a terrible blow — ${sb.name} doesn't get up.`]) });
              return Object.assign(rec, { outcome: 'bYield', log: rec.log.concat([`${sb.name} yields. ${sa.name} takes the duel.`]) });
            }
          } else {
            const d = roll([4 + sb.wb, 8 + sb.wb]);
            ha -= d; rec.aTaken += d;
            if (ha <= 0) {
              if (d >= sa.maxHp * 0.6) return Object.assign(rec, { outcome: 'aDied', log: rec.log.concat([`${sb.name} lands a terrible blow — ${sa.name} doesn't get up.`]) });
              return Object.assign(rec, { outcome: 'aYield', log: rec.log.concat([`${sa.name} yields. ${sb.name} takes the duel.`]) });
            }
          }
        }
        if (ha / sa.maxHp < ba && hb / sb.maxHp < bb)
          return Object.assign(rec, { outcome: 'doubleYield', log: rec.log.concat(['Both yield. The audience boos the cowardice and loves it.']) });
        if (ha / sa.maxHp < ba)
          return Object.assign(rec, { outcome: 'bWon', log: rec.log.concat([`${sa.name} breaks and yields. ${sb.name} takes the duel.`]) });
        if (hb / sb.maxHp < bb)
          return Object.assign(rec, { outcome: 'aWon', log: rec.log.concat([`${sb.name} breaks and yields. ${sa.name} takes the duel.`]) });
      }
      // round cap: the less-hurt takes it
      const out = (ha / sa.maxHp) >= (hb / sb.maxHp) ? 'aWon' : 'bWon';
      return Object.assign(rec, { outcome: out, log: rec.log.concat(['Fifteen rounds, no yield — the judges give it to the less-bloodied.']) });
      });
    },

    // ---- BLOOD ----
    _cxBlood: function(pid, contest, opts) {
      opts = opts || {};
      const id = contest.id;
      const log = [];
      // tithe: the altar demands measures. 10% maxHp each.
      // (break-it 2026-10-08: the old 'price' arm was dead code — price is a
      // moot-cat contest per data ("one villager, for the season"), so
      // cat-dispatch never routed it here, and the altar-bleeding fiction
      // contradicted the data fiction. Removed.)
      if (id === 'tithe') {
        const st = this._cxStats(pid);
        const demand = contest.risk === 'extreme' ? 6 : 4;
        const measure = Math.max(1, Math.round(st.maxHp * 0.10));
        const giveable = Math.floor((st.hp - 1) / measure);
        if (giveable >= demand) {
          try { this.hurtVillager(pid, demand * measure, 'contest'); } catch (e) {}
          log.push(`${st.name} bleeds ${demand} measures into the altar and walks out pale.`);
          return { outcome: 'won', detail: `bled ${demand} measures`, log };
        }
        // Bold + extreme: they give until collapse. "It keeps the rest."
        if ((st.temper === 'bold' || st.temper === 'intense') && contest.risk === 'extreme' && giveable > 0) {
          log.push(`${st.name} keeps bleeding past the pale. The altar keeps the rest.`);
          return { outcome: 'died', detail: 'bled out for the altar', log };
        }
        log.push(`${st.name} bleeds ${giveable} measures and falters. The System finds them wanting.`);
        try { if (giveable > 0) this.hurtVillager(pid, giveable * measure, 'contest'); } catch (e) {}
        return { outcome: 'lost', detail: `found wanting at ${giveable}/${demand}`, log };
      }
      // pit/gauntlet/siege: real fights.
      const waves = (id === 'gauntlet' || id === 'siege') ? 3 : 1;
      const wave = this.unlockedWave ? this.unlockedWave() : 1;
      for (let w = 1; w <= waves; w++) {
        const st = this._cxStats(pid);
        if (st.hp <= 0) return { outcome: 'died', detail: `fell on wave ${w}`, log };
        const beast = this.contestBeastFor(wave, st.hp * (0.7 + w * 0.3));
        if (!beast) return { outcome: 'lost', detail: 'no beast', log };
        let rec;
        // rng: R draws from the seeded resolution stream under _cxWithSeed
        // (deterministic); fieldFight bypasses combat.roll when rng is set.
        try { rec = this.fieldFight(pid, beast, null, { braveryBonus: opts.cheerBonus || 0, rng: R }); }
        catch (e) { return { outcome: 'lost', detail: 'fight failed', log }; }
        log.push(`Wave ${w}: ${rec.log[rec.log.length - 1] || rec.outcome} (${rec.rounds} rounds, ${rec.vTaken} taken)`);
        if (rec.vTaken > 0) { try { this.hurtVillager(pid, rec.vTaken, 'contest'); } catch (e) {} }
        if (rec.outcome === 'vDie') return { outcome: 'died', detail: `killed on wave ${w} by ${beast.id}`, log };
        if (rec.outcome === 'vFlee') {
          // Gauntlet: fleeing a wave is losing. Pit: driven off = lost.
          return { outcome: 'lost', detail: `driven off on wave ${w}`, log };
        }
        // vKill / mFlee / evade: through to the next wave (evade in the
        // arena means the beast wouldn't engage — the System sends another).
      }
      return { outcome: 'won', detail: waves > 1 ? `survived all ${waves} waves` : 'killed the beast', log };
    },

    // ---- MOOT ----
    _cxCaseScore: function(pid, cheerLift) {
      const st = this._cxStats(pid);
      const temperMod = { bold: 2, earnest: 2, prickly: 1, intense: 1, mischievous: 1, anxious: -1, cautious: -1 }[st.temper] || 0;
      return st.nota * 2 + st.trust / 10 + st.bravery / 10 + temperMod + (cheerLift || 0);
    },
    _cxMoot: function(pids, contest, opts) {
      opts = opts || {};
      const demand = { low: 6, medium: 9, high: 12, extreme: 15 }[contest.risk] || 9;
      const results = {};
      if (pids.length === 1) {
        const pid = pids[0];
        const score = this._cxCaseScore(pid, opts.cheerLift || 0);
        const st = this._cxStats(pid);
        if (score >= demand) return { [pid]: { outcome: 'won', detail: `case ${score.toFixed(1)} vs demand ${demand}`, log: [`${st.name} makes the case. The audience is the jury, and the jury can count.`] } };
        if (score >= demand * 0.6) return { [pid]: { outcome: 'lost', detail: `case ${score.toFixed(1)} vs demand ${demand}`, log: [`${st.name}'s case doesn't hold. The audience looks away.`] } };
        // The binding takes its due — but only where the fiction kills.
        if (contest.risk === 'high' || contest.risk === 'extreme')
          return { [pid]: { outcome: 'died', detail: `case collapsed at ${score.toFixed(1)}`, log: [`${st.name}'s case collapses. The System's displeasure is not metaphorical.`] } };
        return { [pid]: { outcome: 'lost', detail: `case ${score.toFixed(1)} vs demand ${demand}`, log: [`${st.name}'s case doesn't hold.`] } };
      }
      // head-to-head (lies, p2)
      const scores = pids.map(pid => ({ pid, score: this._cxCaseScore(pid, opts.cheerLift || 0) }));
      scores.sort((x, y) => y.score - x.score);
      const top = scores[0], second = scores[1];
      if (second && Math.abs(top.score - second.score) < 0.5) {
        // tiebreaks: trust, then notability (the System prefers the famous)
        const st = (pid) => this._cxStats(pid);
        let winner = top.pid;
        if (st(second.pid).trust !== st(top.pid).trust) winner = st(second.pid).trust > st(top.pid).trust ? second.pid : top.pid;
        else if (st(second.pid).nota !== st(top.pid).nota) winner = st(second.pid).nota > st(top.pid).nota ? second.pid : top.pid;
        for (const s of scores) results[s.pid] = { outcome: s.pid === winner ? 'won' : 'lost', detail: `tiebreak at ${s.score.toFixed(1)}`, log: [`The audience deadlocks. The System prefers ${this._cxStats(winner).name}.`] };
        return results;
      }
      for (const s of scores) results[s.pid] = { outcome: s.pid === top.pid ? 'won' : 'lost', detail: `${s.score.toFixed(1)}`, log: [] };
      return results;
    },

    // ---- ENDURANCE ----
    _cxEndurance: function(pids, contest) {
      const id = contest.id;
      const results = {};
      const stats = {};
      for (const pid of pids) stats[pid] = this._cxStats(pid);
      if (id === 'starve') {
        // 3 days × 15 health. Most days survived wins; ties → bravery.
        const days = {};
        for (const pid of pids) days[pid] = Math.max(0, Math.floor((stats[pid].hp - 20) / 15));
        const best = Math.max(...pids.map(pid => days[pid]));
        let winners = pids.filter(pid => days[pid] === best);
        if (winners.length > 1) {
          const bb = Math.max(...winners.map(pid => stats[pid].bravery));
          winners = winners.filter(pid => stats[pid].bravery === bb);
        }
        for (const pid of pids) {
          const dmg = Math.min(stats[pid].hp - 1, days[pid] * 15);
          if (dmg > 0) { try { this.hurtVillager(pid, dmg, 'contest'); } catch (e) {} }
          results[pid] = { outcome: winners.includes(pid) ? 'won' : 'lost', detail: `lasted ${days[pid]}/3 days`, log: [`${stats[pid].name} lasts ${days[pid]} days on nothing.`] };
        }
        return results;
      }
      // (break-it 2026-10-08: the old 'fetch' arm was dead code — fetch is a
      // weird-cat contest per data ("Bring Us Something Interesting"), so
      // cat-dispatch routes it to _cxOther, never here; the race-legs
      // fiction contradicted the data fiction. Removed.)
      if (id === 'drop') {
        // 3 legs. speed = 1 + survival/25. 10 hp/leg.
        // Collapse below 20 → lost. Fastest finisher wins.
        const legs = 3;
        const time = {};
        for (const pid of pids) {
          const st = stats[pid];
          const cost = legs * 10;
          if (st.hp - cost < 20) { time[pid] = Infinity; continue; }
          time[pid] = legs / (1 + st.survival / 25);
          try { this.hurtVillager(pid, cost, 'contest'); } catch (e) {}
        }
        const fin = pids.filter(pid => time[pid] !== Infinity);
        const winT = fin.length ? Math.min(...fin.map(pid => time[pid])) : Infinity;
        for (const pid of pids)
          results[pid] = { outcome: time[pid] === winT && winT !== Infinity ? 'won' : 'lost', detail: time[pid] === Infinity ? 'collapsed' : `${time[pid].toFixed(1)}`, log: [] };
        return results;
      }
      if (id === 'maw') {
        // 5 stages. nerve (bravery) vs demand 8+i*4. Holding costs half.
        // 3 pauses → it takes them.
        for (const pid of pids) {
          const st = stats[pid];
          let nerve = st.bravery, pauses = 0;
          const log = [];
          for (let i = 0; i < 5; i++) {
            const demand = 8 + i * 4;
            if (nerve >= demand) { nerve -= demand / 2; }
            else { pauses++; log.push(`${st.name} pauses. It counts.`); }
            if (pauses >= 3) { results[pid] = { outcome: 'died', detail: 'paused three times', log }; break; }
          }
          if (!results[pid]) results[pid] = { outcome: 'won', detail: 'walked all five stages', log: log.concat([`${st.name} doesn't stop. Not once.`]) };
        }
        return results;
      }
      if (id === 'vigil') {
        // 4 watches. fear 10+i*8 vs bravery (wears 5/watch).
        for (const pid of pids) {
          const st = stats[pid];
          let nerve = st.bravery;
          const log = [];
          let out = null;
          for (let i = 0; i < 4; i++) {
            const fear = 10 + i * 8;
            if (nerve <= 0) { out = { outcome: 'died', detail: 'the light went out', log: log.concat([`${st.name}'s nerve breaks. Below, something stops circling.`]) }; break; }
            if (nerve < fear) { out = { outcome: 'lost', detail: `abandoned on watch ${i + 1}`, log: log.concat([`${st.name} abandons the lamp on watch ${i + 1}.`]) }; break; }
            nerve -= 5;
          }
          results[pid] = out || { outcome: 'won', detail: 'held until dawn', log: [`${st.name} holds the post until dawn. The lamp never wavers.`] };
        }
        return results;
      }
      if (id === 'exchange') {
        // Team relay vs a rival village: 3 legs, most leg-wins takes it.
        // Rivals are generated with wave-scaled stats.
        const wave = this.unlockedWave ? this.unlockedWave() : 1;
        const rivals = [0, 1, 2].map(i => ({ hp: 90 + wave * 5, bravery: 15 + wave * 5, survival: 15 + wave * 5, nota: 1, name: 'rival ' + (i + 1) }));
        let ours = 0, theirs = 0;
        const log = [];
        pids.slice(0, 3).forEach((pid, i) => {
          const st = stats[pid], rv = rivals[i] || rivals[0];
          const ourT = 1 / (1 + st.survival / 25), theirT = 1 / (1 + rv.survival / 25);
          if (ourT <= theirT) { ours++; log.push(`${st.name} takes leg ${i + 1}.`); }
          else { theirs++; log.push(`${st.name} loses leg ${i + 1} to ${rv.name}.`); }
          try { this.hurtVillager(pid, 10, 'contest'); } catch (e) {}
        });
        const weWon = ours > theirs;
        for (const pid of pids) {
          if (!weWon) { try { this.hurtVillager(pid, 15, 'contest'); } catch (e) {} } // losers tithe
          results[pid] = { outcome: weWon ? 'won' : 'lost', detail: `relay ${ours}-${theirs}${weWon ? '' : ', tithed 15'}`, log: log.slice() };
        }
        return results;
      }
      // fallback: shouldn't happen
      for (const pid of pids) results[pid] = { outcome: 'lost', detail: 'unknown endurance', log: [] };
      return results;
    },

    // ---- OTHER CATEGORIES: stat-driven, documented ----
    _cxOther: function(pids, contest) {
      const id = contest.id, cat = contest.cat;
      const results = {};
      const stats = {};
      for (const pid of pids) stats[pid] = this._cxStats(pid);
      const diff = { low: 10, medium: 20, high: 30, extreme: 40 }[contest.risk] || 20;

      // FORAGE: real foraging — tracking + survival (+clever).
      if (cat === 'forage') {
        const y = {};
        for (const pid of pids) { const st = stats[pid]; y[pid] = st.tracking + st.survival + (st.clever ? 10 : 0); }
        const best = Math.max(...pids.map(pid => y[pid]));
        for (const pid of pids)
          results[pid] = { outcome: y[pid] === best ? 'won' : 'lost', detail: `yield ${y[pid]}`, log: [`${stats[pid].name} brings in ${y[pid]}.`] };
        return results;
      }
      // DETECTIVE: tracking + trust/5 (informants talk to the trusted) vs difficulty.
      if (cat === 'detective') {
        if (pids.length === 1) {
          const pid = pids[0], st = stats[pid];
          const solve = st.tracking + st.trust / 5;
          results[pid] = solve >= diff
            ? { outcome: 'won', detail: `solved at ${solve.toFixed(1)}`, log: [`${st.name} follows it to the end.`] }
            : { outcome: 'lost', detail: `stalled at ${solve.toFixed(1)} vs ${diff}`, log: [`${st.name} loses the thread.`] };
          return results;
        }
        const sc = {};
        for (const pid of pids) sc[pid] = stats[pid].tracking + stats[pid].trust / 5;
        const best = Math.max(...pids.map(pid => sc[pid]));
        for (const pid of pids) results[pid] = { outcome: sc[pid] === best ? 'won' : 'lost', detail: `${sc[pid].toFixed(1)}`, log: [] };
        return results;
      }
      // PUZZLE: clever potential + practical survival.
      if (cat === 'puzzle') {
        const sc = {};
        for (const pid of pids) { const st = stats[pid]; sc[pid] = (st.clever ? 15 : 0) + st.survival / 2 + st.tracking / 2; }
        if (pids.length === 1) {
          const pid = pids[0];
          results[pid] = sc[pid] >= diff
            ? { outcome: 'won', detail: `${sc[pid].toFixed(1)} vs ${diff}`, log: [`${stats[pid].name} sees it.`] }
            : { outcome: 'lost', detail: `${sc[pid].toFixed(1)} vs ${diff}`, log: [`${stats[pid].name} doesn't see it in time.`] };
          return results;
        }
        const best = Math.max(...pids.map(pid => sc[pid]));
        for (const pid of pids) results[pid] = { outcome: sc[pid] === best ? 'won' : 'lost', detail: `${sc[pid].toFixed(1)}`, log: [] };
        return results;
      }
      // WEIRD, by contest:
      if (id === 'hide') {
        // The seeker is a wave-2 predator. 3 evasion rounds with fieldFight's
        // real awareness formula; caught → a real fight.
        const seeker = (this.data.monsters || []).find(m => m.behavior === 'pack' && (m.wave || 1) === 2)
          || this.contestBeastFor(2, 40);
        for (const pid of pids) {
          const st = stats[pid];
          const log = [];
          let caught = false;
          for (let r = 0; r < 3 && !caught; r++) {
            // awareness, inverted: the contestant must NOT be noticed.
            const mNotice = (seeker.encounter && seeker.encounter.noticeRange) || 5;
            const spot = 0.35 + Math.min(0.30, (seeker.speed || 4) * 0.03) + 0.03 * mNotice - 0.015 * st.tracking;
            if (R() < clamp(spot, 0.05, 0.95)) {
              caught = true;
              log.push(`${st.name} is found on round ${r + 1}.`);
              let rec = null;
              try { rec = this.fieldFight(pid, seeker, null, { rng: R }); } catch (e) {}
              if (rec) {
                if (rec.vTaken > 0) { try { this.hurtVillager(pid, rec.vTaken, 'contest'); } catch (e2) {} }
                if (rec.outcome === 'vDie') results[pid] = { outcome: 'died', detail: 'found and killed', log };
                else results[pid] = { outcome: 'lost', detail: 'found', log: log.concat(['Found — but walking.']) };
              } else results[pid] = { outcome: 'lost', detail: 'found', log };
            }
          }
          if (!results[pid]) results[pid] = { outcome: 'won', detail: 'never found', log: [`${st.name} is never found. The seeker leaves hungry.`] };
        }
        return results;
      }
      if (id === 'beastmaster') {
        // Dominance, not murder: mFlee counts as won.
        for (const pid of pids) {
          const beast = this.contestBeastFor(1, 50);
          let rec = null;
          try { rec = this.fieldFight(pid, beast, null, { rng: R }); } catch (e) {}
          const st = stats[pid];
          if (!rec) { results[pid] = { outcome: 'lost', detail: 'no fight', log: [] }; continue; }
          if (rec.vTaken > 0) { try { this.hurtVillager(pid, rec.vTaken, 'contest'); } catch (e2) {} }
          if (rec.outcome === 'vDie') results[pid] = { outcome: 'died', detail: 'the beast was not impressed', log: rec.log.slice(-2) };
          else if (rec.outcome === 'vKill' || rec.outcome === 'mFlee') results[pid] = { outcome: 'won', detail: rec.outcome === 'mFlee' ? 'dominated' : 'slew', log: [`${st.name} masters the beast${rec.outcome === 'mFlee' ? ' — it yields' : ''}.`] };
          else results[pid] = { outcome: 'lost', detail: rec.outcome, log: [] };
        }
        return results;
      }
      // cookfight/impress/guest: making something — survival craft + showmanship.
      // (guest is a dinner: trust + temperament.)
      const sc = {};
      for (const pid of pids) {
        const st = stats[pid];
        sc[pid] = id === 'guest' ? st.trust / 5 + (st.temper === 'earnest' || st.temper === 'bold' ? 4 : 0)
          : st.survival / 2 + st.nota * 2 + (st.clever ? 5 : 0);
      }
      if (pids.length === 1) {
        const pid = pids[0];
        results[pid] = sc[pid] >= diff
          ? { outcome: 'won', detail: `${sc[pid].toFixed(1)} vs ${diff}`, log: [`${stats[pid].name} makes something the aliens have never felt.`] }
          : { outcome: 'lost', detail: `${sc[pid].toFixed(1)} vs ${diff}`, log: [`${stats[pid].name}'s making falls flat.`] };
        return results;
      }
      const best = Math.max(...pids.map(pid => sc[pid]));
      for (const pid of pids) results[pid] = { outcome: sc[pid] === best ? 'won' : 'lost', detail: `${sc[pid].toFixed(1)}`, log: [] };
      return results;
    },

    // ---- CHANCE: rigged theater ----
    // There are no fair lotteries on television. The System is a producer:
    // ratings declining → the famous win (give the audience what they want);
    // ratings rising → the dark horse wins (surprise!); flat → the trusted.
    // Deterministic from real state. Documented, not hidden.
    _cxChance: function(pids, contest) {
      const results = {};
      if (contest.id === 'auction') {
        // Everyone bids; everyone pays. Bid = min(hp-20, 10 + bravery/2 + nota*3).
        const bids = {};
        for (const pid of pids) {
          const st = this._cxStats(pid);
          bids[pid] = Math.min(st.hp - 20, 10 + st.bravery / 2 + st.nota * 3);
        }
        const winBid = Math.max(...pids.map(pid => bids[pid]));
        const winnerPid = pids.find(q => bids[q] === winBid);
        for (const pid of pids) {
          const pay = pid === winnerPid ? bids[pid] : Math.floor(bids[pid] / 2);
          if (pay > 0) { try { this.hurtVillager(pid, Math.min(pay, this._cxStats(pid).hp - 1), 'contest'); } catch (e) {} }
          results[pid] = { outcome: pid === winnerPid ? 'won' : 'lost', detail: `bid ${bids[pid]}, paid ${pay}`, log: [`${this._cxStats(pid).name} bids ${bids[pid]} — and pays.`] };
        }
        return results;
      }
      let trend = 0;
      try {
        const v = this.state.village || {};
        trend = (v.viewership || 0) - (v._lastWeekViewership || v.viewership || 0);
      } catch (e) {}
      const stats = {};
      for (const pid of pids) stats[pid] = this._cxStats(pid);
      let winner;
      let why;
      if (trend < -1) {
        winner = pids.reduce((a, b) => stats[a].nota >= stats[b].nota ? a : b);
        why = 'the ratings are slipping — the System gives the audience its favorite';
      } else if (trend > 1) {
        winner = pids.reduce((a, b) => stats[a].nota <= stats[b].nota ? a : b);
        why = 'the ratings are climbing — the System spends them on a surprise';
      } else {
        winner = pids.reduce((a, b) => stats[a].trust >= stats[b].trust ? a : b);
        why = 'a quiet night — the steadfast take it';
      }
      for (const pid of pids)
        results[pid] = { outcome: pid === winner ? 'won' : 'lost', detail: why, log: pid === winner ? [`${stats[pid].name} wins the ${contest.name}. ${why}.`] : [] };
      return results;
    },

    // ---- MAIN ENTRY ----
    // contestResolveVillager(pid, contest, opts) -> {outcome, detail, log[]}
    // opts: { cheerBonus } (blood bravery), { cheerLift } (moot case)
    contestResolveVillager: function(pid, contest, opts) {
      opts = opts || {};
      return this._cxWithSeed([pid], contest, () => {
      try {
        const cat = (contest || {}).cat;
        if (cat === 'blood') {
          // duel is head-to-head — needs the group; handled by resolveGroup.
          if (contest.id === 'duel') return { outcome: 'lost', detail: 'duel needs a partner', log: [] };
          return this._cxBlood(pid, contest, opts);
        }
        if (cat === 'moot') {
          const r = this._cxMoot([pid], contest, opts);
          return r[pid];
        }
        if (cat === 'endurance') {
          const r = this._cxEndurance([pid], contest);
          return r[pid];
        }
        if (cat === 'chance') {
          const r = this._cxChance([pid], contest);
          return r[pid];
        }
        const r = this._cxOther([pid], contest || {});
        return r[pid];
      } catch (e) {
        return { outcome: 'lost', detail: 'resolution failed: ' + e.message, log: [] };
      }
      });
    },

    // Group resolution for head-to-head / team contests.
    contestResolveGroup: function(pids, contest, opts) {
      opts = opts || {};
      return this._cxWithSeed(pids, contest || {}, () => {
      try {
        const cid = (contest || {}).id, cat = (contest || {}).cat;
        if (cid === 'duel') {
          if (pids.length >= 2) {
            // opts carry the watcher's cheer / alien rigging (braveryBonus)
            // — duels are blood, and blood gets the cheer (break-it 2026-10-08:
            // cheer previously never reached duelFight).
            const rec = this.duelFight(pids[0], pids[1], opts);
            const results = {};
            const apply = (pid, took) => { if (took > 0) { try { this.hurtVillager(pid, took, 'contest'); } catch (e) {} } };
            // Wounds are real in EVERY duel ending (break-it 2026-10-08:
            // death/double-yield previously applied no damage — the survivor
            // of a fatal duel walked away unwounded).
            apply(pids[0], rec.aTaken); apply(pids[1], rec.bTaken);
            if (rec.outcome === 'aWon') { results[pids[0]] = { outcome: 'won', detail: rec.rounds + ' rounds', log: rec.log }; results[pids[1]] = { outcome: 'lost', detail: 'yielded', log: [] }; }
            else if (rec.outcome === 'bWon') { results[pids[1]] = { outcome: 'won', detail: rec.rounds + ' rounds', log: rec.log }; results[pids[0]] = { outcome: 'lost', detail: 'yielded', log: [] }; }
            else if (rec.outcome === 'aDied') { results[pids[0]] = { outcome: 'died', detail: 'terrible blow', log: rec.log }; results[pids[1]] = { outcome: 'won', detail: 'accident', log: [] }; }
            else if (rec.outcome === 'bDied') { results[pids[1]] = { outcome: 'died', detail: 'terrible blow', log: rec.log }; results[pids[0]] = { outcome: 'won', detail: 'accident', log: [] }; }
            else { results[pids[0]] = { outcome: 'lost', detail: 'double yield', log: rec.log }; results[pids[1]] = { outcome: 'lost', detail: 'double yield', log: [] }; }
            return results;
          }
          // A duel needs a partner — matches the single-participant path.
          const r = {};
          for (const pid of pids) r[pid] = { outcome: 'lost', detail: 'duel needs a partner', log: [] };
          return r;
        }
        // (break-it 2026-10-08: group blood contests previously fell through
        // to _cxOther's generic "making" resolution — a multi-villager Pit
        // resolved as a cookfight ("makes something the aliens have never
        // felt"). Blood resolves per-villager through real fights.)
        if (cat === 'blood') {
          const results = {};
          for (const pid of pids) results[pid] = this._cxBlood(pid, contest, opts);
          return results;
        }
        if (cat === 'moot') return this._cxMoot(pids, contest, opts);
        if (cat === 'endurance') return this._cxEndurance(pids, contest);
        if (cat === 'chance') return this._cxChance(pids, contest);
        return this._cxOther(pids, contest || {});
      } catch (e) {
        const r = {};
        for (const pid of pids) r[pid] = { outcome: 'lost', detail: 'group resolution failed', log: [] };
        return r;
      }
      });
    },
  };
  Object.assign(G, methods);
})(typeof window !== 'undefined' ? window : global);
