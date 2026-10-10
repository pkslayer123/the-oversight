// policies/socialite.js — a social-play style: talks constantly, hosts
// feasts, conducts petition moots, answers aid calls, works the moot and
// gossip circuits, sends aid cries when able, appoints the switchboard.
// Built on competent (survives), with social actions layered on top.
'use strict';
const { competent } = require('./competent');

function socialDaily(Game, ctx) {
  try {
    const vv = Game.state.village || {};
    const roster = (vv.roster || []).filter(id => id !== Game.villagerId);
    // talk to several villagers per day — and actually TAKE the conversation
    // choices (agency:ask_expedition etc.), so villager teaching paths fire.
    if (Game.talkTo && roster.length) {
      const n = Math.min(roster.length, 3);
      for (let i = 0; i < n; i++) {
        const vid = roster[Math.floor(Math.random() * roster.length)];
        try {
          Game.talkTo(vid);
          let choices = [];
          try { choices = Game.convoChoices(vid) || []; } catch (e) {}
          const agency = choices.find(c => c && c.id && String(c.id).indexOf('agency:') === 0);
          if (agency && Game.convoTurn) {
            try { Game.convoTurn(vid, agency.id); ctx.socialLessons = (ctx.socialLessons || 0) + 1; } catch (e) {}
          }
        } catch (e) {}
        try { Game.endConvo(vid, 'left'); } catch (e2) {}
        ctx.socialTalks = (ctx.socialTalks || 0) + 1;
      }
    }
  } catch (e) {}
  // host a feast when the pantry can take it (every ~7 days)
  try {
    const day = (Game.state.scholar || {}).day || 0;
    if (day > 6 && day % 7 === 0 && Game.hostFeast) {
      Game.hostFeast();
      ctx.socialFeasts = (ctx.socialFeasts || 0) + 1;
    }
  } catch (e) {}
  // conduct petition moots whenever one is pending
  try {
    const pet = Game.state ? Game.state.pendingPetition : null;
    if (pet && pet.id) {
      try { Game.conductPetitionMoot(pet.id); ctx.socialMoots = (ctx.socialMoots || 0) + 1; } catch (e) {}
      try { Game.answerPetition(pet.id, 'accept'); } catch (e) {}
    }
    const q = Game.state ? (Game.state.petitionQueue || []) : [];
    for (const p of q.slice(0, 2)) {
      try { Game.conductPetitionMoot(p.id); ctx.socialMoots = (ctx.socialMoots || 0) + 1; } catch (e) {}
      try { Game.answerPetition(p.id, 'accept'); } catch (e) {}
    }
  } catch (e) {}
  // send an aid cry when in crisis and able
  try {
    if (Game.aidCrisis && Game.aidCrisis() && Game.callForHelp) {
      const cries = Game.aidCryAbilities ? Game.aidCryAbilities() : [];
      if (cries.length) { Game.callForHelp('cry', { abilityId: cries[0].id }); ctx.socialCries = (ctx.socialCries || 0) + 1; }
      else { Game.callForHelp('signal', {}); ctx.socialCries = (ctx.socialCries || 0) + 1; }
    }
  } catch (e) {}
  // appoint the switchboard once available
  try {
    if (Game.switchboardAvailable && Game.switchboardAvailable() && !Game.switchboard() && Game.appointSwitchboard) {
      const cands = Game.switchboardCandidates ? Game.switchboardCandidates() : [];
      if (cands.length) { Game.appointSwitchboard(cands[0].vid || cands[0].id); ctx.socialSwitch = 1; }
    }
  } catch (e) {}
  // (villager wants/initiative flow through villagerTurn/villagerInitiative
  // automatically; the policy answers by talking — covered above.)
}

const socialite = Object.assign({}, competent, {
  id: 'socialite',
  desc: 'social player: competent survival + talks, feasts, moots, aid cries, switchboard',
  daily(Game, ctx) {
    if (competent.daily) competent.daily(Game, ctx);
    socialDaily(Game, ctx);
  },
});

module.exports = { socialite };
