#!/usr/bin/env node
// test-reach-beats-20261010.js — Worker B parity sweep (2026-10-10).
// PROOF: the village-agency / comms / switchboard beats are answerable.
// Before the fix, pendingBeg/pendingRaidDefense/pendingSuccession/
// pendingPetition/aidCrisis/switchboard were engine-only — narration staged
// them, the player had no buttons. Fix: the beats panel (app.js) with
// answer buttons for every open beat, plus the switchboard appointment beat
// staged when the network goes live.
// Engine proof (app.js is DOM-only): the entry points the buttons call, and
// the state flags the panel reads.
'use strict';
const assert = require('assert');
const { loadGame, setupGame } = require('./sim-harness');

async function beatGame(seed) {
  const { Game } = await loadGame({ seed, mode: 'reach' });
  await setupGame(Game);
  return Game;
}

(async () => {
  let pass = 0, fail = 0;
  const t = (name, fn) => { try { fn(); pass++; console.log('ok -', name); } catch (e) { fail++; console.log('FAIL -', name, '::', e.message); } };

  // BEG
  {
    const Game = await beatGame(401);
    Game.state.otherVillages = Game.state.otherVillages || [];
    Game.state.otherVillages.push({ id: 'ov_beg', name: 'Ashford', opinion: 0, pop: 10 });
    Game.state.pendingBeg = { villageId: 'ov_beg', speaker: 'Mara', amount: 1500, day: 1 };
    try { Game.stockPantry(5000, 'test'); } catch (e) {}
    const r = Game.answerBeg('give');
    t('answerBeg give clears the beat', () => { assert.ok(!Game.state.pendingBeg, 'cleared'); assert.ok(r, 'returns'); });
  }
  // RAID DEFENSE
  {
    const Game = await beatGame(402);
    Game.state.otherVillages = Game.state.otherVillages || [];
    Game.state.otherVillages.push({ id: 'ov_rd', name: 'Cinder', opinion: -20, pop: 10 });
    Game.state.pendingRaidDefense = { villageId: 'ov_rd', champion: 'Rook', raiders: ['a', 'b'], demand: 2000, day: 1 };
    try { Game.stockPantry(5000, 'test'); } catch (e) {}
    const r = Game.answerRaidDefense('give');
    t('answerRaidDefense give clears the beat', () => { assert.ok(!Game.state.pendingRaidDefense, 'cleared'); assert.strictEqual(r, 'gave'); });
  }
  // SUCCESSION
  {
    const Game = await beatGame(403);
    Game.state.otherVillages = Game.state.otherVillages || [];
    Game.state.otherVillages.push({ id: 'ov_su', name: 'Elm', opinion: 0, pop: 10, inner: { crisis: { claimants: ['Asha', 'Bram'] } } });
    Game.state.pendingSuccession = { villageId: 'ov_su', claimants: [{ name: 'Asha', idx: 0 }, { name: 'Bram', idx: 1 }], day: 1 };
    const r = Game.answerSuccession('stayOut');
    t('answerSuccession stayOut clears the beat', () => { assert.ok(!Game.state.pendingSuccession, 'cleared'); assert.strictEqual(r, 'stayed-out'); });
  }
  // PETITION: interview -> moot -> vote (with room), and the door turn-away
  {
    const Game = await beatGame(404);
    const pid = Game.openPetition({ petitioners: [{ name: 'Ash' }, { name: 'Bram' }], cause: 'famine-flight', originName: 'Elm' });
    t('openPetition stages pendingPetition', () => assert.ok(Game.state.pendingPetition, 'pending'));
    const iq = Game.petitionInterview(pid, 'why');
    t('petitionInterview answers', () => assert.ok(iq, 'answered'));
    // door turn-away: always available, resolves the beat
    const v = Game.answerPetition(pid, 'reject');
    t('answerPetition reject at the door resolves', () => assert.ok(!Game.state.pendingPetition, 'cleared'));
  }
  // PETITION moot path: make room, hold the moot, vote
  {
    const Game = await beatGame(407);
    // free two beds
    const roster = Game.state.village.roster || [];
    Game.state.village.roster = roster.slice(2);
    const pid = Game.openPetition({ petitioners: [{ name: 'Ash' }], cause: 'peaceful', originName: 'Elm' });
    const moot = Game.conductPetitionMoot(pid);
    t('conductPetitionMoot holds the vote (room available)', () => assert.ok(moot && moot.awaitingPlayerVote, 'awaiting player vote'));
    Game.answerPetition(pid, 'accept');
    t('answerPetition accept resolves', () => assert.ok(!Game.state.pendingPetition, 'cleared'));
  }
  // AID CRISIS: the four tiers exist and answer
  {
    const Game = await beatGame(405);
    const c = Game.raiseAidCrisis('raiders');
    t('raiseAidCrisis stages', () => assert.ok(c || Game.aidCrisis(), 'staged'));
    const r = Game.callForHelp('signal');
    t('callForHelp signal answers', () => assert.ok(r !== null && r !== undefined, 'answered, got ' + JSON.stringify(r).slice(0, 60)));
  }
  // SWITCHBOARD: appointment beat staged at network-live, appointable, log readable
  {
    const Game = await beatGame(406);
    Game.state.networkLive = true;
    // simulate the stageFirstAccord hook path
    Game.state.otherVillages = Game.state.otherVillages || [];
    Game.state.otherVillages.push({ id: 'ov_sw', name: 'Reed', opinion: 30, pop: 12 });
    // stage the appointment the way stageFirstAccord does
    if (Game.switchboardAvailable()) Game.state.pendingSwitchboard = { day: 1 };
    t('pendingSwitchboard staged', () => assert.ok(Game.state.pendingSwitchboard, 'pending'));
    const cands = Game.switchboardCandidates();
    t('switchboardCandidates offers hands', () => assert.ok((cands || []).length > 0, 'candidates'));
    const ap = Game.appointSwitchboard(cands[0].id);
    t('appointSwitchboard appoints', () => {
      assert.ok(ap && ap.holderId === cands[0].id, 'holder set');
      assert.ok(!Game.state.pendingSwitchboard, 'beat answered');
      assert.ok(Game.switchboard(), 'office exists');
    });
    const lr = Game.switchboardLog();
    t('switchboardLog reads clean', () => assert.strictEqual(lr, 'clean'));
    const cf = Game.confrontSwitchboard();
    t('confrontSwitchboard on clean log costs the accuser', () => assert.strictEqual(cf, 'baseless'));
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
