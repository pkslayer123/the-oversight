// progress-policy.js — reconstruction of the r3 "progress" policy (2026-10-10).
// r3 described it as: competent base + five roads from the completion-gap crew:
// 1. channels keepsakes daily once taught
// 2. tells villagers about beasts (askAbout tellbeast/namebeast) + backs leading name
// 3. takes explorer lessons (agencyTurn ask_field)
// 4. grinds plants toward L3 (study bites: eat one safe bite of an L2 plant/day)
// 5. completes villager quests (unblocks the system-quest slot) via foraging,
//    answers the table when offered.
// Every road is best-effort and try/catch-guarded: a hostile Game API must
// never kill a run. Faithful-ish to r3; absolute values may shift slightly.
'use strict';
const REPO = '/home/hatch/workspace/worktrees/bal-survival';
const { competent } = require('./competent-orig');
const idle = require('./idle-orig');

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
    // road counters for the report
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

module.exports = { progress };
