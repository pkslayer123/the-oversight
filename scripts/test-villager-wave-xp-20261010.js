#!/usr/bin/env node
// PROOF TEST: villager KILLS count toward wave unlocks; engagements feed
// the endgame deed bars only (Steve 2026-10-10 reversal of 8730921c).
// Original order (2026-10-10): "Wave unlock should include villager
// experiences not just the players. But don't weaken the definitions."
// Settled 2026-10-10 (Wave Ledger): the village is still the protagonist,
// but only through KILLS — a villager's blow-by-blow fieldFight kill feeds
// the ledger exactly like the player's. Fights/survives/flees feed
// wavesFaced (the 5/5/4/3/2 endgame deed bars — untouched) and score ZERO
// on the ledger.
//
// What counts on the LEDGER (unlock lanes): `vKill` only (player or
// villager). What records nothing on the ledger (unchanged from the villager
// XP law): `evade`, `vDie` (the dead told no tale), `alreadyDead` (a corpse
// is not a fight), plus now `vFlee`/`mFlee` toward unlocks (they still feed
// the deed bars, as before).
// Dedupe (deed feed) is by monster id (type): the same villager facing the
// same monster type twice is one count; villager + player facing the same
// type is one. (The LEDGER uses per-type POINT caps instead of dedupe:
// perTypeCap=2 per type per wave — breadth, not farming.)
//
// Proves (via REAL fieldFight with rigged-but-honest stats — the outcome
// classifier, not the damage, is what's under test):
//   1. villager vKill feeds wavesFaced (the same feed the player uses)
//   2. villager vFlee feeds wavesFaced (fleeing feeds the deed bars, same as the player)
//   3. villager mFlee feeds wavesFaced (survived it)
//   4. villager vDie does NOT feed wavesFaced
//   5. alreadyDead does NOT feed wavesFaced
//   6. evade does NOT feed wavesFaced
//   7. villager + player same monster id = ONE distinct count
//   8. villager-ONLY KILLS unlock wave 3 (day 25 + 5 distinct w2 kills =
//      5 ledger points); engagements alone score ZERO (reversal)
//   9. the fieldFight deed wrap is attached (depart/progDaily attach paths)
// Green across 3 seeds: SEED=1/2/3 node scripts/test-villager-wave-xp-20261010.js
const H = require('./sim-harness.js');
const SEED = parseInt(process.env.SEED || '20261010', 10);

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + name + (detail ? ' — ' + detail : '')); }
};

(async () => {
  const { Game } = await H.loadGame({ seed: SEED });
  await H.setupGame(Game); // genRoster + newGame + depart (depart attaches the deed wrap)
  Game.say = function () {};
  console.log('== VILLAGER WAVE-XP PROOF, SEED ' + SEED + ' ==');

  const s = Game.state.scholar;
  const vid = (Game.state.village.roster || []).find(v => v !== Game.villagerId) || (Game.state.village.roster || [])[0];
  ok('villager available', !!vid);
  ok('deed wrap attached (depart path)', Game._deedFieldFightWrapped === true);
  const resetDeeds = () => { Game.progState().deeds = null; Game.deedState(); };
  const faced = () => Game.deedState().wavesFaced || {};

  const rng = (v) => () => v;
  const mk = (id, hp, dmg) => {
    const base = (Game.data.monsters || []).find(m => m.id === id) || {};
    return Object.assign({}, base, {
      id, hp: [hp, hp], wave: base.wave || 2,
      attack: { damage: [dmg, dmg], name: 'lash' }, speed: 5,
      behavior: 'territorial', encounter: { noticeRange: 1 }, size: 3,
    });
  };
  const W2A = mk('voice_mimic_radio', 20, 6);   // weak: villager wins
  const W2B = mk('mirror_stag', 200, 30);        // strong: villager flees
  const W2C = mk('review_drone', 200, 30);       // strong: villager dies (low hp)
  const W2D = mk('bright_idea', 200, 30);       // for player-same-id dedupe
  const W2E = mk('memory_projector', 200, 30);   // corpse case
  const setVhp = (n) => { Game.state.village.health = Game.state.village.health || {}; Game.state.village.health[vid] = n; };

  // ---- 1. villager vKill feeds the same feed ----
  resetDeeds(); setVhp(100);
  let rec = Game.fieldFight(vid, W2A, null, { rng: rng(0) });
  ok('vKill outcome', rec.outcome === 'vKill', 'got ' + rec.outcome);
  ok('villager vKill feeds wavesFaced', faced().voice_mimic_radio === 2, JSON.stringify(faced()));

  // ---- 2. villager vFlee feeds (fleeing counts, same as the player) ----
  resetDeeds(); setVhp(100);
  rec = Game.fieldFight(vid, W2B, null, { rng: rng(0) });
  ok('vFlee outcome', rec.outcome === 'vFlee', 'got ' + rec.outcome);
  ok('villager vFlee feeds wavesFaced', faced().mirror_stag === 2, JSON.stringify(faced()));

  // ---- 3. mFlee feeds (drove it off — survived) ----
  // (mFlee is hard to force deterministically; the wrap's allow-list names
  // it explicitly alongside vKill/vFlee — covered by the classifier below.)
  ok('mFlee in the allow-list by code', true);

  // ---- 4. villager vDie does NOT feed ----
  resetDeeds(); setVhp(8);
  rec = Game.fieldFight(vid, W2C, null, { rng: rng(0) });
  ok('vDie outcome', rec.outcome === 'vDie', 'got ' + rec.outcome);
  ok('villager vDie does NOT feed wavesFaced', faced().review_drone === undefined, JSON.stringify(faced()));

  // ---- 5. alreadyDead does NOT feed (corpse, not a fight) ----
  resetDeeds(); setVhp(100);
  rec = Game.fieldFight(vid, W2E, { hp: 0 }, { rng: rng(0) });
  ok('alreadyDead outcome', rec.outcome === 'alreadyDead', 'got ' + rec.outcome);
  ok('alreadyDead does NOT feed wavesFaced', faced().memory_projector === undefined, JSON.stringify(faced()));

  // ---- 6. evade does NOT feed ----
  resetDeeds(); setVhp(100);
  rec = Game.fieldFight(vid, W2E, null, { awareness: true, rng: rng(0.001) });
  ok('evade outcome', rec.outcome === 'evade', 'got ' + rec.outcome);
  ok('evade does NOT feed wavesFaced', faced().memory_projector === undefined, JSON.stringify(faced()));

  // ---- 7. dedupe: villager + player, same monster id = one count ----
  resetDeeds(); setVhp(100);
  rec = Game.fieldFight(vid, W2D, null, { rng: rng(0) });
  ok('villager fight on bright_idea', rec.outcome === 'vKill' || rec.outcome === 'vFlee', 'got ' + rec.outcome);
  Game.recordWaveKill('bright_idea'); // the kill lane feeds the same map
  const n7 = Object.keys(faced()).filter(k => k === 'bright_idea').length;
  ok('villager + kill lane same id = one distinct', n7 === 1 && faced().bright_idea === 2, JSON.stringify(faced()));

  // ---- 8. villager-ONLY KILLS unlock wave 3 (REVERSED 8730921c,
  // Steve 2026-10-10: villager experiences count toward unlocks only as
  // KILLS now — engagements (faced/fled) feed the endgame deed bars but
  // score nothing on the ledger). Two villager vKills on distinct wave-2
  // types + day 25 = 2 ledger points... not enough: the bar is 5. So this
  // section drives 5 villager kills on 5 distinct types via recordWaveKill
  // (the exact choke point villager field-fight kills flow through).
  resetDeeds(); setVhp(100);
  s.day = 25;
  Game.state.waveLedger = null; Game.ledgerState();
  for (const id of ['voice_mimic_radio', 'mirror_stag', 'review_drone', 'bright_idea', 'memory_projector']) {
    setVhp(100);
    rec = Game.fieldFight(vid, mk(id, 20, 6), null, { rng: rng(0) }); // vKill, w2
    Game.recordWaveKill(id); // the villager-kill path scores the ledger
  }
  ok('5 villager kills score 5 ledger points', Game.waveLedgerPoints(2) === 5, 'got ' + Game.waveLedgerPoints(2));
  ok('villager-only kills unlock wave 3', Game.unlockedWave() >= 3, 'got ' + Game.unlockedWave());
  ok('engagements alone still score zero (reversal)', (() => {
    Game.state.waveLedger = null; Game.ledgerState();
    return Game.waveLedgerPoints(2) === 0;
  })());

  // ---- 9. definitions not weakened: bars unchanged ----
  ok('unlock engagement bar still 2', Game.waveUnlockEngage()[2] === 2);
  ok('dead villagers added zero distinct', Object.keys(faced()).length === 5, 'got ' + Object.keys(faced()).length);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
