// policies/winseek.js — WIN-SEEKING policy (Worker E, 2026-10-10).
// Actively pursues the galactic-table deed gate (Steve's order: "run games
// that SEEK to complete the game"). Built on the competent survival base,
// but every passive instinct is inverted into a pursuing one:
//
//  1. WAVE DEED BARS (5/5/4/3/2 distinct fought) — SEEK encounters (hunting
//     patrols to far wild tiles), ENGAGE every fight (never flee at start;
//     flee only near-death). Facing counts — you stood on the grid.
//  2. 3 CONTESTS SURVIVED — boost notability/viewership (arena deeds), always
//     PARTICIPATE when grabbed, play to survive (never refuse).
//  3. NATIONAL+ SCALE — court villages actively: proposeLink as subordinate
//     (Steve: joining as a valued subordinate is legitimate), accept
//     counter-offers, answer the national beat (never refuse/walk).
//  4. 3 CRISES — weather them: respond to raids, feed through famine,
//     treat disease. Don't dodge the beat.
//  5. SENTIMENT TAUGHT (auto at integ 60) + FEAST SURGE USED — channel
//     keepsakes daily, host feasts weekly, channel at surge, use feastburn.
//  6. INTEGRATION ≥3 (stage 3) — system quests, trials, teaching, naming,
//     books. Play-weighted integration is the engine.
//
// Every road is best-effort and try/catch-guarded: a hostile Game API must
// never kill a run.
'use strict';
const { competent } = require('./competent');
const idle = require('./idle');

function rosterOf(Game) {
  try {
    return ((Game.state.village || {}).roster || []).filter(id => id !== Game.villagerId);
  } catch (e) { return []; }
}

// ---------- ROAD 1: HUNT — seek encounters, engage fights ----------

// Hunting patrol: travel to far wild tiles to trigger checkEncounter rolls.
// ~3x/week (day % 7 in [1,3,5]) — every fight is death risk, so patrols are
// deliberate, not daily. More tile entries = more spawn rolls (pity clock
// makes sustained travel ~16%/entry effective).
function huntPatrol(Game, ctx) {
  try {
    const s = Game.state.scholar;
    const day = s.day || 1;
    if (![1, 3, 5].includes(day % 7)) return;
    if (ctx._patrolDay === day) return; // once per day (upkeep runs 3x/day)
    ctx._patrolDay = day;
    if ((s.kcal || 0) < (Game.kcalCap ? Game.kcalCap() * 0.4 : 800)) return; // don't hunt starving
    // WAVE-TARGETED: only patrol if some unlocked wave's deed bar is unfilled.
    // No deed value = no death risk.
    try {
      const g = Game.deedGateReady ? Game.deedGateReady() : null;
      if (g) {
        const bars = [g.w1 >= 5, g.w2 >= 5, g.w3 >= 4, g.w4 >= 3, g.w5 >= 2];
        const uw = Game.unlockedWave ? Game.unlockedWave() : 1;
        let need = false;
        for (let w = 1; w <= uw; w++) if (!bars[w - 1]) { need = true; break; }
        if (!need) return;
      }
    } catch (e) {}
    const hx = Game.map.px, hy = Game.map.py;
    const cands = [];
    for (const tt of (Game.travelTargets() || [])) {
      const t = Game.tileAt(tt.x, tt.y);
      if (!t || t.type === 'haven') continue;
      let blocked = false;
      try { blocked = !!Game.travelBlockage(tt.x, tt.y); } catch (e) {}
      if (blocked) continue;
      cands.push({ x: tt.x, y: tt.y, d: tt.d });
    }
    // prefer FAR tiles (more entries en route? no — travelTo is direct;
    // far tiles are simply different ground, more rolls across the patrol)
    cands.sort((a, b) => b.d - a.d);
    let visited = 0;
    for (const c of cands.slice(0, 4)) {
      if (Game.over) break;
      try { Game.travelTo(c.x, c.y); } catch (e) { break; }
      if (Game.over || Game.tbfight) break;
      if (Game.map.px !== c.x || Game.map.py !== c.y) continue;
      visited++;
      // look around: perception may surface the monster; forage the patch too
      try { Game.doAction('forage', {}); } catch (e) {}
      if (Game.over || Game.tbfight) break;
    }
    if (visited) {
      ctx.patrols = (ctx.patrols || 0) + 1;
      try { Game.travelTo(hx, hy); } catch (e) {}
    }
  } catch (e) {}
}

// Fight handler: ENGAGE. Strike the weakest monster; flee only near death.
// (competent flees bad matchups at fight start — win-seeking needs the
// deed bars filled, and facing counts. A dead scholar respawns as another
// villager; a fled fight still records.)
function winseekFight(Game, ctx) {
  try {
    const f = Game.tbfight;
    if (!f || f.over || !Game.tbIsPlayerTurn()) return false;
    const p = Game.tbFighter('p');
    const hpPct = (p.hp || 0) / Math.max(1, p.maxHp || p.hp || 1);
    const endTurn = () => {
      try {
        const q = Game.tbFighter('p');
        q.moveLeft = 0; q.acted = true;
        Game.tbAfterPlayerAction();
      } catch (e) {}
    };
    const flee = () => {
      try {
        const px = p.mx != null ? p.mx : 4, py = p.my != null ? p.my : 4;
        const tx = px <= 4 ? 0 : 8;
        try { Game.tbPlayerMove(tx, py); ctx.fled = (ctx.fled || 0) + 1; } catch (e) {}
      } catch (e) {}
      endTurn();
      return true;
    };
    // FIGHT-START (runs once per fight): snapshot faced-before (startCombat
    // records the deed immediately, so by handler time EVERYTHING looks
    // faced — we flee only if it was faced BEFORE this fight), then assess.
    if (ctx._fightObj !== f) {
      ctx._fightObj = f;
      ctx._fledThisFight = false;
      try {
        const faced = (Game.deedState ? Game.deedState().wavesFaced : {}) || {};
        const monsters = f.fighters.filter(x => x.kind === 'monster' && (x.hp || 0) > 0);
        // Remove this fight's monsters from the snapshot (they were just added)
        ctx._facedBefore = Object.assign({}, faced);
        for (const m of monsters) delete ctx._facedBefore[m.monsterId];
      } catch (e) { ctx._facedBefore = {}; }
      // NEW-FIGHT ASSESSMENT (the deed records at startCombat even if we
      // flee on turn 1): don't bleed in fights we can't win. Win-seeking is
      // BOLDER than competent: engage up to 3.5x HP.
      try {
        const monsters = f.fighters.filter(x => x.kind === 'monster' && (x.hp || 0) > 0);
        let totalMhp = 0, maxWave = 1;
        for (const m of monsters) {
          totalMhp += m.maxHp || m.hp || 0;
          const md = ((Game.data || {}).monsters || []).find(d => d.id === m.monsterId);
          if (md && md.wave) maxWave = Math.max(maxWave, md.wave);
        }
        const pmax = p.maxHp || 100;
        const outmatched = totalMhp > 3.5 * pmax ||
          (maxWave >= 2 && hpPct < 0.6) ||
          hpPct < 0.5;
        if (outmatched && monsters.length) {
          ctx.fledBad = (ctx.fledBad || 0) + 1;
          return flee();
        }
      } catch (e) {}
    }
    // WAVE-TARGETED: only risk death for waves with unfilled deed bars.
    // The bars are 5/5/4/3/2 — once a wave's bar is filled, its monsters are
    // just death risk with no deed value. Flee those.
    try {
      const g = Game.deedGateReady ? Game.deedGateReady() : null;
      if (g) {
        const bars = [0, 5, 5, 4, 3, 2]; // index by wave
        const counts = [0, g.w1, g.w2, g.w3, g.w4, g.w5];
        const monsters = f.fighters.filter(x => x.kind === 'monster' && (x.hp || 0) > 0);
        const allFilled = monsters.length && monsters.every(m => {
          const md = ((Game.data || {}).monsters || []).find(d => d.id === m.monsterId);
          const w = (md && md.wave) || 1;
          return (counts[w] || 0) >= (bars[w] || 99);
        });
        if (allFilled) {
          ctx.fledFilled = (ctx.fledFilled || 0) + 1;
          return flee();
        }
      }
    } catch (e) {}
    // ALREADY-FACED: a skilled player recognizes beasts from the Monster
    // Codex — no reason to risk death re-fighting a known quantity.
    try {
      const facedBefore = ctx._facedBefore || {};
      const monsters = f.fighters.filter(x => x.kind === 'monster' && (x.hp || 0) > 0);
      if (monsters.length && monsters.every(m => facedBefore[m.monsterId])) {
        ctx.fledKnown = (ctx.fledKnown || 0) + 1;
        return flee();
      }
    } catch (e) {}
    // Near-death: walk to the edge (flee-by-barrier). The deed recorded at
    // fight start; staying is just a death.
    if (hpPct < 0.3) return flee();
    const alive = f.fighters.filter(x => x.kind === 'monster' && (x.hp || 0) > 0);
    if (!alive.length) return false;
    alive.sort((a, b) => (a.hp || 0) - (b.hp || 0));
    const tgt = alive[0];
    const px = p.mx != null ? p.mx : 4, py = p.my != null ? p.my : 4;
    const tmx = tgt.mx != null ? tgt.mx : 4, tmy = tgt.my != null ? tgt.my : 4;
    // Close the distance first (striking out of range is a no-op).
    try {
      const w = (Game.equippedWeapon && Game.equippedWeapon()) || { range: 1 };
      const d0 = Math.max(Math.abs(tmx - px), Math.abs(tmy - py));
      if (d0 > (w.range || 1)) {
        const occupied = new Set(
          f.fighters.filter(x => x.alive && x.key !== 'p').map(x => x.mx + ',' + x.my));
        let bx = null, by = null, bd = 1e9;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          const cx = tmx + dx, cy = tmy + dy;
          if (cx < 0 || cx > 8 || cy < 0 || cy > 8) continue;
          if (occupied.has(cx + ',' + cy)) continue;
          const dd = Math.max(Math.abs(cx - px), Math.abs(cy - py));
          if (dd < bd) { bd = dd; bx = cx; by = cy; }
        }
        if (bx != null) { try { Game.tbPlayerMove(bx, by); } catch (e) {} }
        endTurn();
        return true;
      }
    } catch (e) {}
    try { Game.tbPlayerStrike(tgt.key); ctx.struck = (ctx.struck || 0) + 1; } catch (e) {}
    endTurn();
    return true;
  } catch (e) { return false; }
}

// ---------- ROAD 2: CONTESTS — always participate, play to survive ----------
// The harness's driveContests picks choice 0; the choice phase is
// [Participate, Refuse], so 0 = participate. We just make sure never to
// refuse and track participation.
function contestRoad(Game, ctx) {
  try {
    const ac = Game.state.activeContest;
    if (!ac) return;
    ctx.sawContest = (ctx.sawContest || 0) + 1;
  } catch (e) {}
}

// ---------- ROAD 3: SCALE — court villages actively ----------

// The climb: build opinion through lived contact. Cheapest reliable lever
// the policy can pull repeatedly: study their codex (honoring knowledge)
// and deeds on the broadcast happen via contests. Joining them is expensive
// (leaves Haven). We do what we can from home.
function courtshipClimb(Game, ctx) {
  try {
    const ovs = Game.state.otherVillages || [];
    for (const ov of ovs) {
      if (!ov || ov.id === 'haven') continue;
      if (!Game.knowsVillage || !Game.knowsVillage(ov)) continue;
      if (Game.linkWith && Game.linkWith(ov.id)) continue; // already linked
      if ((ov.opinion || 0) >= 25) continue; // courted enough
      // Study their book: honoring their knowledge moves opinion.
      try {
        if (Game.studyVillageCodex) { Game.studyVillageCodex(ov.id); ctx.climb = (ctx.climb || 0) + 1; }
      } catch (e) {}
    }
  } catch (e) {}
}

// Propose links: as subordinate (legitimate road — valued subordinate) with
// generous tribute. Accept counter-offers. Try peer roads too.
function diplomacyRoad(Game, ctx) {
  try {
    // Answer a pending counter-offer FIRST — the table is set.
    if (Game.state.pendingCounter && Game.answerCounter) {
      try {
        Game.answerCounter('accept');
        ctx.counterAccepted = (ctx.counterAccepted || 0) + 1;
      } catch (e) {}
    }
    // Answer the national beat — never refuse, never walk. Pick the
    // first non-refuse option the shape offers.
    if (Game.state.pendingNational && Game.answerNationalChoice) {
      try {
        const shape = Game.state.pendingNational.shape;
        const pick = shape === 'lead' ? 'feast'
          : shape === 'conquest' ? 'mercy'
          : shape === 'belong' ? 'swear'
          : shape === 'covenant' ? 'pact'
          : shape === 'trade' ? 'sign' : 'feast';
        Game.answerNationalChoice(pick);
        ctx.nationalAnswered = (ctx.nationalAnswered || 0) + 1;
      } catch (e) {}
    }
    const ovs = Game.state.otherVillages || [];
    let proposals = 0;
    for (const ov of ovs) {
      if (proposals >= 2) break; // don't spam; one or two a day
      if (!ov || ov.id === 'haven') continue;
      if (!Game.knowsVillage || !Game.knowsVillage(ov)) continue;
      if (Game.linkWith && Game.linkWith(ov.id)) continue;
      if (Game.state.pendingCounter) break; // answer it first (next day)
      if ((ov.opinion || 0) <= -20) continue; // closed door
      const score = (() => { try { return Game.judgeLink(ov.id, { asSubordinate: true, tributeKcalPerWeek: 4000 }).score; } catch (e) { return 0; } })();
      try {
        if (score >= 35) {
          // Propose as subordinate — the BELONG road. Generous tribute.
          Game.proposeLink(ov.id, { asSubordinate: true, tributeKcalPerWeek: 5000 });
          ctx.proposed = (ctx.proposed || 0) + 1;
          proposals++;
        } else if (score >= 20 && Game.proposeCovenant) {
          // Peer road fallback: covenant of equals.
          Game.proposeCovenant(ov.id);
          ctx.proposedPeer = (ctx.proposedPeer || 0) + 1;
          proposals++;
        }
      } catch (e) {}
    }
    // Pay tribute on subordinate links: +3 trust/week, no arrears. The
    // BELONG road needs trust >= 60, no arrears, 21+ days.
    try {
      const links = Game.hierarchyState ? Game.hierarchyState() : [];
      for (const l of links) {
        if (!l || l.status !== 'active' || l.subordinate !== 'haven') continue;
        if (Game.payTribute) {
          try { Game.payTribute(l.id); ctx.tributePaid = (ctx.tributePaid || 0) + 1; } catch (e) {}
        }
      }
    } catch (e) {}
  } catch (e) {}
}

// ---------- ROAD 4: CRISES — weather them, don't dodge ----------
// Crises fire reactively; the policy's job is to SURVIVE them well:
//  - hunger-winter: keep the pantry deep (forage + preserve aggressively)
//  - breach/raid: fight the raiders (winseekFight engages)
//  - disease: treat the sick (competent's disease avoidance covers vectors)
//  - schism/blood-on-air: social — moots, comfort
// The main lever here is pantry depth + not fleeing the village.
function crisisRoad(Game, ctx) {
  try {
    const pg = Game.progState ? Game.progState() : {};
    const crises = Object.keys(pg.crises || {});
    ctx.crisesSeen = crises.length;
    // Famine buffer: preserve food aggressively when the pantry is thin.
    const v = Game.state.village || {};
    const pantryKcal = (() => {
      try {
        return (v.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
      } catch (e) { return 0; }
    })();
    if (pantryKcal < 8000) {
      try { if (Game.doAction) Game.doAction('preserve', {}); } catch (e) {}
    }
  } catch (e) {}
}

// ---------- ROAD 5: SENTIMENT + FEAST SURGE ----------

function sentimentRoad(Game, ctx) {
  try {
    if (!(Game.sentimentTaught && Game.sentimentTaught())) return;
    const idxs = (Game.channelReadyKeepsakes && Game.channelReadyKeepsakes()) || [];
    let n = 0;
    for (const idx of idxs) {
      try { Game.channelSentiment(idx); n++; } catch (e) {}
      if (n >= 6) break;
    }
    if (n) ctx.channels = (ctx.channels || 0) + n;
  } catch (e) {}
}

// Host a feast weekly-ish (pantry permitting), then use feastburn in fights.
// feastSurgeUsed is set when the surge actually burns in combat.
function feastRoad(Game, ctx) {
  try {
    const s = Game.state.scholar || {};
    const day = s.day || 1;
    const pg = s.prog || {};
    if (pg.feastSurgeUsed) return; // deed done
    if ((day - (ctx._lastFeastDay || 0)) < 7) return;
    if (Game.playerAtHaven && !Game.playerAtHaven()) return;
    const v = Game.state.village || {};
    const have = (() => {
      try { return Game.pantryKcalLive ? Game.pantryKcalLive(v) : 0; } catch (e) { return 0; }
    })();
    const present = ((v.roster || []).filter(id => id !== Game.villagerId)).length;
    const cost = Math.max(1500, 400 * (present + 1));
    if (have < cost * 1.5) return; // keep a buffer — don't feast into famine
    try {
      const r = Game.hostFeast();
      if (typeof r === 'string' && r.indexOf('held') >= 0) {
        ctx._lastFeastDay = day;
        ctx.feasts = (ctx.feasts || 0) + 1;
      }
    } catch (e) {}
  } catch (e) {}
}

// ---------- ROAD 6: INTEGRATION (stage ≥ 3 needs integ ≥ 80) ----------
// Play-weighted: system quests, trials, teaching, naming, books.

function integrationRoad(Game, ctx) {
  try {
    const s = Game.state.scholar || {};
    if ((s.integration || 0) >= 80) return;
    // System quests: answer/complete the active one; ask for a new one.
    try {
      const q = s.activeQuest;
      if (q && q.type === 'system_teach' && Game.checkQuest) {
        Game.checkQuest('teach');
        ctx.sq = (ctx.sq || 0) + 1;
      }
    } catch (e) {}
    try {
      if (Game.offerSystemQuest && !s.activeQuest) {
        Game.offerSystemQuest('event');
        ctx.sqOffered = (ctx.sqOffered || 0) + 1;
      }
    } catch (e) {}
    // Trials: complete when offered.
    try {
      const pg = s.prog || {};
      if (pg.trial && Game.completeTrial) {
        Game.completeTrial();
        ctx.trials = (ctx.trials || 0) + 1;
      }
    } catch (e) {}
    // Teach a villager something (taught = +2 integration).
    try {
      const roster = rosterOf(Game).slice(0, 2);
      for (const vid of roster) {
        if (Game.teachVillager) { Game.teachVillager(vid); ctx.taught = (ctx.taught || 0) + 1; break; }
      }
    } catch (e) {}
    // Name beasts: monster named = +5 integration (also codex breadth).
    try {
      const roster = rosterOf(Game);
      if (roster.length && Game.askAbout) {
        const r = Game.askAbout(roster[0], 'namebeast');
        if (r && r.ok && r.naming && r.naming.mid && Game.backMonsterName) {
          try { Game.backMonsterName(r.naming.mid, r.naming.mid); } catch (e2) {}
          ctx.named = (ctx.named || 0) + 1;
        }
      }
    } catch (e) {}
  } catch (e) {}
}

// ---------- TABLE ----------

function tableRoad(Game, ctx) {
  try {
    const s = Game.state.scholar || {};
    const tc = s.tableChoices;
    if (tc && tc.options && tc.options.length && Game.chooseTableOption) {
      Game.chooseTableOption(tc.options[0].id);
      ctx.answeredTable = true;
    }
  } catch (e) {}
}

const winseek = {
  id: 'winseek',
  desc: 'win-seeking: hunts monsters, courts villages, plays contests, drives integration/feast/sentiment toward the table',
  setup(Game, ctx) { if (competent.setup) competent.setup(Game, ctx); },
  upkeep(Game, ctx) {
    if (competent.upkeep) competent.upkeep(Game, ctx);
    huntPatrol(Game, ctx); // road 1: seek encounters (upkeep, so the harness
                           // drives any fights via driveFights/driveContests)
    contestRoad(Game, ctx);
  },
  daily(Game, ctx) {
    if (competent.daily) competent.daily(Game, ctx);
    courtshipClimb(Game, ctx);   // road 3a: the climb
    diplomacyRoad(Game, ctx);    // road 3b: propose/answer
    crisisRoad(Game, ctx);       // road 4: weather
    sentimentRoad(Game, ctx);    // road 5a: channel keepsakes
    feastRoad(Game, ctx);        // road 5b: feast weekly
    integrationRoad(Game, ctx);  // road 6: integ → 80
    tableRoad(Game, ctx);        // answer the table
    // road counters for the report
    try {
      const pg = Game.progState ? Game.progState() : {};
      ctx._sq = pg.systemQuests || 0;
      ctx._integ = (Game.state.scholar || {}).integration || 0;
    } catch (e) {}
  },
  fight(Game, ctx) {
    try { if (winseekFight(Game, ctx)) return true; } catch (e) {}
    return false;
  },
  contest(Game, ctx) {
    // Always participate (choice 0). Never refuse.
    return false; // let the harness default pick choice 0 = Participate
  },
};

module.exports = { winseek };
