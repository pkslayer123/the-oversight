// util-roads.js — engagement roads for the utilization audit (bal-util, 2026-10-10).
// These model OBVIOUS competent-player behaviors that the canonical
// competent/progress policies predate (the systems are newer than the
// policies): answering an aid crisis when the village looks to you,
// interviewing/voting on petitioners at your fire, pursuing the System's
// dangled haven-tier bar, trying folk remedies when sick. They are used ONLY
// in the post-fix measurement (competent+roads), never silently merged into
// the canonical policies — the baseline matrix stays apples-to-apples.
'use strict';

function roadCrisis(Game, ctx) {
  try {
    if (!Game.aidCrisis) return;
    const c = Game.aidCrisis();
    if (!c || c.resolved) return;
    if ((c.calls || []).length) return; // already called once this crisis
    let links = [];
    try { links = Game.villageLinks ? (Game.villageLinks('haven') || []) : []; } catch (e) {}
    if (links.length) Game.callForHelp('runner');
    else Game.callForHelp('signal'); // no links: the beacon is the honest call
    ctx.crisisCalls = (ctx.crisisCalls || 0) + 1;
  } catch (e) {}
}

function roadPetition(Game, ctx) {
  try {
    const pet = Game.state.pendingPetition;
    if (!pet || pet.vote || pet.awaitingPlayerVote) return;
    if (Game.petitionInterview) {
      Game.petitionInterview(pet.id, 'why');
      Game.petitionInterview(pet.id, 'bring');
    }
    if (Game.conductPetitionMoot) Game.conductPetitionMoot(pet.id);
    // the moot turns to the player — vote with the room in your belly
    const p2 = Game.state.pendingPetition;
    if (p2 && p2.awaitingPlayerVote && Game.answerPetition) {
      let room = 0;
      try { room = Game.havenRoom(); } catch (e) {}
      Game.answerPetition(p2.id, room > 0 ? 'accept' : 'reject');
      ctx.petitionsAnswered = (ctx.petitionsAnswered || 0) + 1;
    }
  } catch (e) {}
}

function roadHaven(Game, ctx) {
  try {
    if (!Game.havenGrowthMeter || !Game.assignTask) return;
    const meter = Game.havenGrowthMeter();
    const next = meter && meter.next;
    if (!next || next.complete) return;
    const v = Game.state.village || {};
    const roster = (v.roster || []).filter(id => id !== Game.villagerId);
    const asg = v.assignments || {};
    // scarcest bar first — that's what the village gossips about too
    const bars = (next.bars || []).filter(b => !b.done && (b.key === 'wood' || b.key === 'stone'));
    bars.sort((a, b) => (a.have / a.req) - (b.have / b.req));
    if (!bars.length) return;
    const task = bars[0].key; // 'wood' | 'stone'
    const onTask = Object.keys(asg).filter(id => asg[id] === task).length;
    if (onTask >= 2) return;
    for (const vid of roster) {
      if ((v.assignments || {})[vid]) continue;
      try { Game.assignTask(vid, task, { via: 'in-person' }); } catch (e) {}
      ctx.havenPursuit = (ctx.havenPursuit || 0) + 1;
      const onNow = Object.keys(v.assignments || {}).filter(id => (v.assignments || {})[id] === task).length;
      if (onNow >= 2) break;
    }
  } catch (e) {}
}

function roadFolk(Game, ctx) {
  try {
    if (!Game.sickDiseases || !Game.folkRemedy) return;
    const sick = Game.sickDiseases();
    if (!sick.length) return;
    const day = (Game.state.scholar || {}).day || 0;
    if (ctx._folkDay === day) return;
    ctx._folkDay = day;
    // fluids if clean water, tea if plant matter, else rest — anyone can try
    const s = Game.state.scholar || {};
    const hasWater = ((s.water || []).some(b => b.quality === 'clean'));
    const hasHerb = ((s.inventory || []).some(i => (i.units || 0) > 0 && i.plantId && !String(i.plantId).startsWith('meat_')));
    Game.folkRemedy(hasWater ? 'fluids' : (hasHerb ? 'tea' : 'rest'));
    ctx.folkTries = (ctx.folkTries || 0) + 1;
  } catch (e) {}
}

// A competent player clicks the ability bar: heal when hurt, cure when sick,
// mediate when there's a dispute. The canonical policies predate the bar.
// Conservative: only strictly-beneficial-or-graceful activations.
function roadBar(Game, ctx) {
  try {
    if (!Game.activatableAbilities || !Game.activateAbility) return;
    const acts = Game.activatableAbilities() || [];
    const want = ['field_medicine', 'herbal_remedy', 'purify', 'mediator.mediate_dispute'];
    for (const id of want) {
      const a = acts.find(x => x.id === id);
      if (!a || !a.available) continue;
      try {
        Game.activateAbility(id);
        ctx.barUses = (ctx.barUses || 0) + 1;
      } catch (e) {}
    }
  } catch (e) {}
}

function withRoads(base) {
  const p = Object.assign({}, base);
  const origDaily = base.daily;
  const origUpkeep = base.upkeep;
  p.id = (base.id || 'custom') + '+roads';
  // roadCrisis rides upkeep (start of each day-part, before tickAction): a
  // raid-raised crisis can auto-resolve during the part ticks, so the daily
  // hook is too late to answer it.
  p.upkeep = function (Game, ctx) {
    if (origUpkeep) { try { origUpkeep(Game, ctx); } catch (e) {} }
    roadCrisis(Game, ctx);
  };
  p.daily = function (Game, ctx) {
    if (origDaily) { try { origDaily(Game, ctx); } catch (e) {} }
    roadCrisis(Game, ctx);
    roadPetition(Game, ctx);
    roadHaven(Game, ctx);
    roadFolk(Game, ctx);
    roadBar(Game, ctx);
  };
  return p;
}

module.exports = { withRoads, roadCrisis, roadPetition, roadHaven, roadFolk };
