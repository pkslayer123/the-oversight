#!/usr/bin/env node
// PROOF TEST: monster counters — structural bottleneck fix (Worker C, 2026-10-10).
// Diagnosis (evidence/2026-10-10/winrate-iteration.md rounds 3-4): 0/399
// counter-kills because NO monster def carried a `counter` field — the
// waveLedger.js monsterCounterKnown() discovery mechanic existed, the data
// didn't, and nothing ever set state.monsterCounters.
// Proves:
//   1. DATA: all 30 wave 1-2 defs carry counter {kind,trick,hint,reveal};
//      kinds are from the engine's vocabulary; waves 3-5 untouched (no
//      collision with the pending wave-4/5 signature-mechanics work);
//      schemas.json registers monster.counter.
//   2. BEFORE: monsterCounterKnown() is false for everything at start;
//      an undiscovered kill scores 1 (never less, never punished).
//   3. TRICK DISCOVERY in real combat: wounding the hushwolf lead, shouting
//      at a belltoad, waiting out a heckler -> discovered + beat fires.
//   4. ALL 14 trigger kinds fire via checkMonsterCounter (unit-level).
//   5. LEDGER BONUS: a counter-known kill scores 2 (perTypeCap 2 respected);
//      non-counter kills and counter-less monsters score 1, unaffected.
//   6. TALK CHANNEL: villageSlain 2+ -> askAbout 'beasttricks' teaches it.
//   7. No interference: a normal fight runs crash-free with hooks live.
// Green across seeds: SEED=N node scripts/test-structural-counters-20261011.js
const H = require('./sim-harness.js');
const SEED = parseInt(process.env.SEED || '20261011', 10);
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + name + (detail ? ' — ' + detail : '')); }
};

const KINDS = ['shout', 'offer_food', 'wait', 'move_windup', 'move_x2',
  'approach', 'sidestep', 'keep_distance', 'strike_lead', 'strike_windup',
  'strike_recovery', 'strike_first', 'strike_nonhead', 'fresh_weapon'];
const W12 = ['bulldozer', 'hushwolf', 'gallowdeer', 'mirrormoth', 'belltoad',
  'lockpick_raccoon', 'white_noise_heron', 'hummice', 'speedbump_turtle',
  'nightlight_catfish', 'ducks_in_a_row', 'glasswing', 'sunbasker',
  'nevermore', 'nightcourt', 'voice_mimic_radio', 'mirror_stag',
  'review_drone', 'bright_idea', 'memory_projector', 'warranty_caller',
  'understudy', 'landlord', 'heckler', 'paparazzo', 'union_rep', 'moderator',
  'statickite', 'giant_mosquito', 'alien_tick'];

function endTurn(Game) {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p');
  if (!p) return;
  p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function toPlayerTurn(Game, guardN) {
  let g = 0;
  while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && g++ < (guardN || 40)) {
    try { Game.tbAdvance(); } catch (e) { break; }
  }
  return !!(Game.tbfight && !Game.tbfight.over && Game.tbIsPlayerTurn());
}
function endCombat(Game) {
  if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; }
  try { Game.state.scholar.monster = null; } catch (e) {}
}

(async () => {
  const { Game } = await H.loadGame({ seed: SEED });
  await H.setupGame(Game);
  Game.depart();
  const s = Game.state.scholar;
  const byId = Object.fromEntries(Game.data.monsters.map(m => [m.id, m]));
  console.log('== STRUCTURAL COUNTERS PROOF, SEED ' + SEED + ' ==');

  // ---- 1. data ----
  ok('30 wave 1-2 ids present', W12.every(id => byId[id] && (byId[id].wave || 1) <= 2));
  let kindsOk = true, shapeOk = true;
  for (const id of W12) {
    const c = byId[id].counter;
    if (!c || !KINDS.includes(c.kind)) { kindsOk = false; console.log('    bad kind: ' + id); }
    if (!c || !c.trick || !c.hint || !c.reveal) { shapeOk = false; console.log('    bad shape: ' + id); }
  }
  ok('all 30 carry counter with a known kind', kindsOk);
  ok('all 30 carry trick+hint+reveal', shapeOk);
  ok('waves 3-5 untouched (no counter field)',
    Game.data.monsters.filter(m => (m.wave || 1) > 2).every(m => !m.counter));
  const schemas = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/schemas.json'), 'utf8'));
  ok('schemas.json registers monster.counter', schemas.monster.types.counter === 'object?');
  // every kind used has at least one monster
  const usedKinds = new Set(W12.map(id => byId[id].counter.kind));
  ok('engine vocabulary covers used kinds', [...usedKinds].every(k => KINDS.includes(k)),
    [...usedKinds].filter(k => !KINDS.includes(k)).join(','));

  // ---- 2. before: dormant ----
  ok('before: monsterCounterKnown(hushwolf) false', Game.monsterCounterKnown('hushwolf') === false);
  ok('before: monsterCounterKnown(bulldozer) false', Game.monsterCounterKnown('bulldozer') === false);
  Game.state.waveLedger = null; Game.state.monsterCounters = {};
  const pts0 = Game.scoreLedgerKill('bulldozer');
  ok('before: undiscovered kill scores 1', pts0 === 1 && Game.waveLedgerPoints(1) === 1,
    'got ' + pts0 + ' / ' + Game.waveLedgerPoints(1));

  const said = [];
  const origSay = Game.say;
  Game.say = (t) => { said.push(String(t)); try { return origSay.call(Game, t); } catch (e) {} };

  // ---- 3. trick discovery in real combat ----
  // 3a. hushwolf: wound the lead (strike_lead)
  try {
    s.health = 9000; s.mx = 4; s.my = 4;
    s.equipped = { melee: { itemId: 'fire_hardened_spear', name: 'spear' } };
    Game.state.monsterCounters = {};
    Game.startCombat('hushwolf');
    ok('hushwolf combat starts', !!Game.tbfight);
    if (Game.tbfight && toPlayerTurn(Game)) {
      const f = Game.tbfight;
      const lead = f.fighters.filter(x => x.kind === 'monster' && x.alive && !x.fled)
        .sort((a, b) => f.fighters.indexOf(a) - f.fighters.indexOf(b))[0];
      const p = Game.tbFighter('p');
      p.mx = Math.min(7, Math.max(1, lead.mx + 1)); p.my = Math.min(7, Math.max(1, lead.my));
      p.acted = false; p.moveLeft = 3;
      const before = said.length;
      const r = Game.tbPlayerStrike(lead.key);
      ok('strike on the lead lands', r === true);
      ok('strike_lead discovered', Game.monsterCounterKnown('hushwolf') === true);
      ok('discovery beat fired', said.slice(before).some(t => t.includes('COUNTER LEARNED')));
    } else ok('hushwolf reached player turn', false);
  } catch (e) { ok('hushwolf trick discovery', false, e.message); }
  endCombat(Game);

  // 3b. belltoad: shout breaks the chorus
  try {
    s.health = 9000;
    Game.state.monsterCounters = {};
    Game.startCombat('belltoad');
    ok('belltoad combat starts', !!Game.tbfight);
    if (Game.tbfight && toPlayerTurn(Game)) {
      const p = Game.tbFighter('p'); p.acted = false; p.moveLeft = 3;
      Game.tbPlayerShout();
      ok('shout discovered', Game.monsterCounterKnown('belltoad') === true);
    } else ok('belltoad reached player turn', false);
  } catch (e) { ok('belltoad trick discovery', false, e.message); }
  endCombat(Game);

  // 3c. heckler: WAIT to answer back
  try {
    s.health = 9000;
    Game.state.monsterCounters = {};
    Game.startCombat('heckler');
    ok('heckler combat starts', !!Game.tbfight);
    if (Game.tbfight && toPlayerTurn(Game)) {
      const p = Game.tbFighter('p'); p.acted = false; p.moveLeft = 3;
      Game.tbPlayerWait();
      ok('wait discovered', Game.monsterCounterKnown('heckler') === true);
    } else ok('heckler reached player turn', false);
  } catch (e) { ok('heckler trick discovery', false, e.message); }
  endCombat(Game);

  // ---- 4. all trigger kinds (unit-level, mock fight) ----
  const realTbFighter = Game.tbFighter;
  const fakeP = { key: 'p', kind: 'player', alive: true, mx: 4, my: 4 };
  Game.tbfight = { over: false, round: 3, fighters: [fakeP] };
  Game.tbFighter = (k) => (k === 'p' ? fakeP : null);
  const unit = (mid, ev, expect, label) => {
    Game.state.monsterCounters = {};
    const r = Game.checkMonsterCounter(mid, ev);
    ok(label, (r === true) === expect && (Game.monsterCounterKnown(mid) === expect),
      mid + ' ' + JSON.stringify(ev));
  };
  unit('bulldozer', { type: 'move', wasInLane: true, inLane: false }, true, 'sidestep fires');
  unit('bulldozer', { type: 'move', wasInLane: false, inLane: false }, false, 'sidestep needs the lane');
  unit('gallowdeer', { type: 'move', windup: true }, true, 'move_windup fires');
  unit('gallowdeer', { type: 'move', windup: false }, false, 'move_windup needs windup');
  unit('nightcourt', { type: 'move_x2' }, true, 'move_x2 fires');
  unit('speedbump_turtle', { type: 'round_end', dist: 2 }, true, 'keep_distance fires at 2');
  unit('speedbump_turtle', { type: 'round_end', dist: 1 }, false, 'keep_distance not at 1');
  unit('sunbasker', { type: 'strike', target: {}, windup: true }, true, 'strike_windup fires');
  unit('sunbasker', { type: 'strike', target: {}, windup: false }, false, 'strike_windup needs windup');
  unit('giant_mosquito', { type: 'strike', target: { _counterDischarged: true }, windup: false }, true, 'strike_recovery fires');
  unit('giant_mosquito', { type: 'strike', target: {}, windup: false }, false, 'strike_recovery needs discharge');
  unit('union_rep', { type: 'strike', target: {}, firstStrike: true }, true, 'strike_first fires');
  unit('union_rep', { type: 'strike', target: {}, firstStrike: false }, false, 'strike_first needs first');
  unit('ducks_in_a_row', { type: 'strike', target: { segmentIndex: 2 } }, true, 'strike_nonhead fires');
  unit('ducks_in_a_row', { type: 'strike', target: { segmentIndex: 0 } }, false, 'strike_nonhead not the head');
  unit('voice_mimic_radio', { type: 'move', windup: true, closer: true }, true, 'approach fires');
  unit('voice_mimic_radio', { type: 'move', windup: true, closer: false }, false, 'approach needs closer');
  unit('understudy', { type: 'strike', target: {}, freshWeapon: true }, true, 'fresh_weapon fires');
  unit('understudy', { type: 'strike', target: {}, freshWeapon: false }, false, 'fresh_weapon needs fresh');
  unit('lockpick_raccoon', { type: 'offer_food' }, true, 'offer_food fires');
  unit('belltoad', { type: 'shout' }, true, 'shout fires');
  unit('moderator', { type: 'wait' }, true, 'wait fires');
  unit('hushwolf', { type: 'wait' }, false, 'wrong kind does not fire');
  Game.tbFighter = realTbFighter;
  Game.tbfight = null;

  // ---- 5. ledger bonus ----
  Game.state.waveLedger = null; Game.state.monsterCounters = {};
  Game.scoreLedgerKill('bulldozer'); // undiscovered
  const w1a = Game.waveLedgerPoints(1);
  Game.discoverMonsterCounter('hushwolf', 'trick');
  ok('discoverMonsterCounter sets the known flag', Game.monsterCounterKnown('hushwolf') === true);
  const add = Game.scoreLedgerKill('hushwolf'); // counter-known
  ok('counter-kill scores 2', add === 2, 'got ' + add);
  ok('ledger totals 1+2', Game.waveLedgerPoints(1) === w1a + 2, 'got ' + Game.waveLedgerPoints(1));
  const add2 = Game.scoreLedgerKill('hushwolf'); // perTypeCap 2 reached
  ok('perTypeCap respected (no more points)', add2 === 0, 'got ' + add2);
  const w3before = Game.waveLedgerPoints(3);
  Game.scoreLedgerKill('spool'); // wave 3, no counter field at all
  ok('counter-less monster kill scores 1, unaffected',
    Game.waveLedgerPoints(3) === w3before + 1, 'got ' + (Game.waveLedgerPoints(3) - w3before));
  ok('discoverMonsterCounter refuses counter-less defs',
    Game.discoverMonsterCounter('spool', 'trick') === false);
  Game.state.waveLedger = null;

  // ---- 6. talk channel ----
  Game.state.monsterCounters = {};
  Game.state.villageSlain = { bulldozer: 2 };
  ok('counterTeachable finds the village-taught type',
    Game.counterTeachable() === 'bulldozer', 'got ' + Game.counterTeachable());
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const vid = roster[0];
  let taught = null;
  if (vid && Game.data.villagers.some(v => v.id === vid)) {
    const r = Game.askAbout(vid, 'beasttricks');
    taught = r && r.taught;
  }
  ok('askAbout beasttricks teaches the trick', taught === 'bulldozer', 'got ' + taught);
  ok('taught trick is known', Game.monsterCounterKnown('bulldozer') === true);
  Game.state.villageSlain = {};
  ok('counterTeachable null when nothing to teach', Game.counterTeachable() === null);

  // ---- 7. no interference: normal fight runs clean ----
  try {
    s.health = 9000;
    Game.startCombat('bulldozer');
    let g = 0, crashed = false;
    try {
      while (Game.tbfight && !Game.tbfight.over && g++ < 10) {
        if (Game.tbIsPlayerTurn()) {
          const p = Game.tbFighter('p');
          const foe = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive && !x.fled);
          if (foe && p) {
            p.mx = Math.min(7, Math.max(1, foe.mx + 1)); p.my = Math.min(7, Math.max(1, foe.my));
            p.acted = false; p.moveLeft = 3;
            try { Game.tbPlayerStrike(foe.key); } catch (e) {}
          }
          endTurn(Game);
        } else Game.tbAdvance();
      }
    } catch (e) { crashed = true; ok('fight crash-free with hooks live', false, e.message); }
    if (!crashed) ok('fight crash-free with hooks live', true);
  } catch (e) { ok('fight crash-free with hooks live', false, e.message); }
  endCombat(Game);
  Game.say = origSay;

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
