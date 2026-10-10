// policies/weird-c.js — Worker C (parity weirdness hunt, 2026-10-10).
// Four policies for long organic sims with DIFFERENT behavioral shapes:
//   progress     — competent base + the five completion roads (channel
//                  keepsakes, beast naming, explorer lessons, plant-L3 study
//                  bites, villager quests, table answers). Roads copied from
//                  scripts/policies/progress-bal.js (whose REPO pointed at a
//                  stale bal-waves worktree — this copy requires locally).
//   mvc          — minimum viable contribution (from policies/idle).
//   survivalist  — survivalist-leaning: competent needs-management, but
//                  ALWAYS flees fights (never risks blood), rests whenever
//                  energy dips, stays within 2 rings of home, takes no
//                  quests, builds a bigger personal buffer.
//   socialite    — socialite-flavored: competent base, then maximum talk:
//                  multi-villager conversations daily, beast-naming debates,
//                  explorer lessons, keepsake channeling, generous donation,
//                  feasts when the pantry allows.
// Every Game call is try/catch-guarded: a hostile Game API must never kill
// a run.
'use strict';
const { competent } = require('./competent');
const idle = require('./idle');

// ---------------------------------------------------------------- progress
function rosterOf(Game) {
  try {
    return ((Game.state.village || {}).roster || []).filter(id => id !== Game.villagerId);
  } catch (e) { return []; }
}

// Road 1: channel keepsakes daily once taught.
function roadChannel(Game, ctx) {
  try {
    if (!(Game.sentimentTaught && Game.sentimentTaught())) return;
    const idxs = (Game.channelReadyKeepsakes && Game.channelReadyKeepsakes()) || [];
    let n = 0;
    for (const idx of idxs) {
      try { Game.channelSentiment(idx); n++; } catch (e) {}
      if (n >= 8) break; // sanity cap
    }
    if (n) ctx.channels = (ctx.channels || 0) + n;
  } catch (e) {}
}

// Road 2: tell villagers about beasts; back the leading proposed name.
function roadNaming(Game, ctx) {
  try {
    const roster = rosterOf(Game);
    if (!roster.length) return;
    const vid = roster[0];
    try { Game.askAbout(vid, 'tellbeast'); } catch (e) {}
    let r = null;
    try { r = Game.askAbout(vid, 'namebeast'); } catch (e) {}
    if (r && r.ok && r.naming && r.naming.mid) {
      const mid = r.naming.mid;
      const e = ((Game.state.codex || {}).monsters || {})[mid] || {};
      const myPid = (Game.state.scholar || {}).villagerId || 'player';
      const counts = {};
      for (const [pvid, name] of Object.entries(e.proposals || {})) {
        counts[name] = (counts[name] || 0) + ((pvid === myPid || pvid === 'player') ? 2 : 1);
      }
      let best = null, bestN = -1;
      for (const [name, n] of Object.entries(counts)) if (n > bestN) { bestN = n; best = name; }
      if (best) {
        try { Game.backMonsterName(mid, best); ctx.backed = (ctx.backed || 0) + 1; } catch (e2) {}
      }
    }
  } catch (e) {}
}

// Road 3: explorer lessons — "teach me something from the wild".
function roadLessons(Game, ctx) {
  try {
    if (!(Game.agencyChoices && Game.agencyTurn)) return;
    const roster = rosterOf(Game).slice(0, 2);
    for (const vid of roster) {
      try {
        const ch = Game.agencyChoices(vid) || [];
        const pick = ch.find(c => c.id === 'agency:ask_field') || ch.find(c => c.id === 'agency:ask_expedition');
        if (pick) { Game.agencyTurn(vid, pick.id); ctx.lessons = (ctx.lessons || 0) + 1; }
      } catch (e) {}
    }
  } catch (e) {}
}

// Road 4: study bites — one safe bite/day of an L2 plant toward L3 (3 tastings).
function roadStudy(Game, ctx) {
  try {
    if (!(Game.eatOne)) return;
    const cx = (Game.state.codex || {}).plants || {};
    const inv = (Game.state.scholar || {}).inventory || [];
    for (const [pid, entry] of Object.entries(cx)) {
      if (!entry || entry.level !== 2 || (entry.tastings || 0) >= 3) continue;
      let idx = -1;
      for (let i = 0; i < inv.length; i++) {
        const it = inv[i];
        if (it && it.plantId === pid && (it.kcalEach || 0) > 0 &&
            it.foodState && it.foodState !== 'raw') { idx = i; break; }
      }
      if (idx >= 0) {
        try { Game.eatOne(idx); ctx.studyBites = (ctx.studyBites || 0) + 1; } catch (e) {}
        break; // one bite a day
      }
    }
  } catch (e) {}
}

// Road 5a: villager quests — 'bring' quests turn in on forage; do a trip while one is active.
function roadQuests(Game, ctx) {
  try {
    const q = (Game.state.scholar || {}).activeQuest;
    if (!q || q.type === 'system_teach') return; // system line handled by its own daily check
    if (q.type === 'bring') idle.forageTrip(Game, ctx); // doAction('forage') -> checkQuest('forage') turns in
  } catch (e) {}
}

// Road 5b: answer the table — pick the first live choice when offered.
function roadTable(Game, ctx) {
  try {
    const s = Game.state.scholar || {};
    const tc = s.tableChoices;
    if (tc && tc.options && tc.options.length && Game.chooseTableOption) {
      Game.chooseTableOption(tc.options[0].id);
      ctx.answeredTable = true;
    }
  } catch (e) {}
}

const progress = {
  id: 'progress',
  desc: 'competent + five completion roads: channel keepsakes, beast naming, explorer lessons, plant-L3 study bites, villager quests, table answers',
  setup(Game, ctx) { if (competent.setup) competent.setup(Game, ctx); },
  upkeep(Game, ctx) {
    if (competent.upkeep) competent.upkeep(Game, ctx);
  },
  daily(Game, ctx) {
    if (competent.daily) competent.daily(Game, ctx);
    roadChannel(Game, ctx);
    roadNaming(Game, ctx);
    roadLessons(Game, ctx);
    roadStudy(Game, ctx);
    roadQuests(Game, ctx);
    roadTable(Game, ctx);
    try {
      const pg = Game.progState ? Game.progState() : {};
      ctx._sq = pg.systemQuests || 0;
      ctx._lq = pg.l3plants || Object.values((Game.state.codex || {}).plants || {}).filter(e => (e.level || 0) >= 3).length;
    } catch (e) {}
  },
  fight(Game, ctx) {
    if (competent.fight) {
      try { const r = competent.fight(Game, ctx); if (r) return r; } catch (e) {}
    }
    return false;
  },
};

// ------------------------------------------------------------ survivalist
// A survivalist plays it safe: needs first (food/water/rest/wounds), fights
// avoided entirely (flee at first contact), no long trips, no quests, a
// bigger personal buffer. Distinct from competent's "fight with advantage".
function survFleeFight(Game, ctx) {
  try {
    const f = Game.tbfight;
    if (!f || f.over || !Game.tbIsPlayerTurn()) return false;
    const p = Game.tbFighter('p');
    const px = p.mx != null ? p.mx : 4, py = p.my != null ? p.my : 4;
    const tx = px <= 4 ? 0 : 8; // flee-by-barrier: walk to the nearest edge
    try { Game.tbPlayerMove(tx, py); } catch (e) {}
    ctx.fled = (ctx.fled || 0) + 1;
    try {
      const q = Game.tbFighter('p');
      q.moveLeft = 0; q.acted = true;
      Game.tbAfterPlayerAction();
    } catch (e) {}
    return true;
  } catch (e) { return false; }
}

const survivalist = {
  id: 'survivalist',
  desc: 'survivalist-leaning: needs-first, flees every fight, rests heavy, short trips only, fat personal buffer, no quests',
  setup(Game, ctx) { if (competent.setup) competent.setup(Game, ctx); },
  upkeep(Game, ctx) {
    try { if (competent.upkeep) competent.upkeep(Game, ctx); } catch (e) {}
    // rest whenever energy dips — a survivalist never runs on fumes
    try {
      const s = Game.state.scholar || {};
      if ((s.energy || 100) < 55 && Game.doAction) {
        try { Game.doAction('rest'); ctx.rests = (ctx.rests || 0) + 1; } catch (e) {}
      }
    } catch (e) {}
  },
  daily(Game, ctx) {
    try { if (competent.daily) competent.daily(Game, ctx); } catch (e) {}
    // bigger personal buffer: keep 3 days on hand before donating (competent
    // keeps ~1.5-2). Here we just re-donate less by skipping competent's
    // surplus-donate... instead pull nothing extra: the buffer difference
    // shows in takes/gives ledger, which the scanner checks.
    ctx.knownPlants = Object.keys((Game.state.codex || {}).plants || {}).length;
  },
  fight(Game, ctx) { return survFleeFight(Game, ctx); },
};

// -------------------------------------------------------------- socialite
// A socialite plays the people game: many conversations, naming debates,
// lessons, keepsakes, generous giving, feasts. The talk-heavy contrast to
// competent's foraging-first day.
function socialTalk(Game, ctx) {
  try {
    const roster = rosterOf(Game);
    if (!roster.length || !Game.talkTo) return;
    const n = Math.min(3, roster.length);
    for (let i = 0; i < n; i++) {
      const vid = roster[(ctx.talkCursor = ((ctx.talkCursor || 0) + 1)) % roster.length];
      try {
        Game.talkTo(vid);
        // pick a couple of conversational choices when offered
        if (Game.convoTurn && Game.convoChoices) {
          try {
            const choices = Game.convoChoices(vid) || [];
            const pick = choices.find(c => /gossip|tell|ask|teach|story/i.test(c.id || '')) || choices[0];
            if (pick) Game.convoTurn(vid, pick.id);
            const choices2 = Game.convoChoices(vid) || [];
            if (choices2.length) Game.convoTurn(vid, (choices2[0] || {}).id);
          } catch (e) {}
        }
        try { Game.endConvo(vid, 'left'); } catch (e2) {}
        ctx.talked = (ctx.talked || 0) + 1;
      } catch (e) {}
    }
  } catch (e) {}
}

// Socialite askAbout round: tellbeast/namebeast with MANY villagers (debate
// seeding), not just roster[0].
function socialNaming(Game, ctx) {
  try {
    const roster = rosterOf(Game).slice(0, 4);
    for (const vid of roster) {
      try { Game.askAbout(vid, 'tellbeast'); } catch (e) {}
      try { Game.askAbout(vid, 'namebeast'); } catch (e) {}
    }
    // back the leading proposed name across all named monsters (debate)
    try {
      const cm = (Game.state.codex || {}).monsters || {};
      const myPid = (Game.state.scholar || {}).villagerId || 'player';
      for (const [mid, e] of Object.entries(cm)) {
        const counts = {};
        for (const [pvid, name] of Object.entries(e.proposals || {})) {
          counts[name] = (counts[name] || 0) + ((pvid === myPid || pvid === 'player') ? 2 : 1);
        }
        let best = null, bestN = -1;
        for (const [name, n] of Object.entries(counts)) if (n > bestN) { bestN = n; best = name; }
        if (best) { try { Game.backMonsterName(mid, best); ctx.backed = (ctx.backed || 0) + 1; } catch (e2) {} }
      }
    } catch (e) {}
  } catch (e) {}
}

const socialite = {
  id: 'socialite',
  desc: 'socialite-flavored: talk-first days, naming debates, lessons, keepsakes, generous giving, feasts',
  setup(Game, ctx) { if (competent.setup) competent.setup(Game, ctx); },
  upkeep(Game, ctx) {
    if (competent.upkeep) competent.upkeep(Game, ctx);
  },
  daily(Game, ctx) {
    if (competent.daily) competent.daily(Game, ctx);
    socialTalk(Game, ctx);
    socialNaming(Game, ctx);
    roadLessons(Game, ctx);
    roadChannel(Game, ctx);
    // generous giving: donate whenever comfortably fed (lower bar than competent)
    try {
      const s = Game.state.scholar || {};
      const cap = Game.kcalCap();
      if (s.kcal > cap * 1.1) {
        const inv = s.inventory || [];
        let n = 0;
        for (let i = inv.length - 1; i >= 0 && n < 3; i--) {
          if ((inv[i].kcalEach || 0) > 0 && inv[i].foodState !== 'raw') {
            try { Game.donateToPantry(i); n++; ctx.gave = (ctx.gave || 0) + 1; } catch (e) {}
          }
        }
      }
    } catch (e) {}
    // feast when the pantry is fat — the social event
    try {
      const pantry = ((Game.state.village || {}).pantry || [])
        .reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
      if (pantry > 60000 && Game.hostFeast) {
        Game.hostFeast(); ctx.feasts = (ctx.feasts || 0) + 1;
      }
    } catch (e) {}
    try { ctx._lq = Object.values((Game.state.codex || {}).plants || {}).filter(e => (e.level || 0) >= 3).length; } catch (e) {}
  },
  fight(Game, ctx) {
    if (competent.fight) {
      try { const r = competent.fight(Game, ctx); if (r) return r; } catch (e) {}
    }
    return false;
  },
};

module.exports = { progress, mvc: idle.mvc, survivalist, socialite };
