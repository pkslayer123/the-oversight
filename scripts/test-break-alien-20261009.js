// BREAK-IT r5: alien players (2026-10-09) — hostile adversarial pass.
// Catches fixed this run:
//   B1. HONESTY — beam was a BONUS attack, not a replacement. apMaybeBeamAttack
//       fired from a tbAfterPlayerAction wrap AFTER the alien's normal strike
//       (tbAlienTurn), contradicting the "replaces their normal attack" design.
//       Fix: the roll moved into tbAlienTurn (replaces the strike); the wrap
//       was removed; the cooldown tick moved with the roll. Also the beam
//       announcement named the persona pre-reveal ("Vex raises Vex's phase
//       lance") while the fighter card says "Stranger" — now knowledge-gated.
//   B2. HONESTY/EXPLOIT — armor salvage fired when a broke persona RETREATED:
//       encounters.js tbEndCheck ends a fled-hostile fight 'won', and
//       apOnCombatEnd salvaged armor 60% of the time with copy claiming
//       "from their body. It's warm." Sibling honesty: monster 'routed' gives
//       "no meat, no trophy" (game.js). Fix: salvage is kill-only
//       (tbEnd wrap passes {killed}, apOnCombatEnd gates on opts.killed).
//   B3. HONESTY — the System feed named a sadistic rival ("VEX MARLOWE was
//       overheard...") but revealed them only 30% of the time; the other 70%
//       you HEARD the name while the system still said "Stranger". Fix:
//       naming on the feed IS the reveal path — it fires whenever the naming
//       message is actually heard.
// Seeded (RNG installed pre-eval by the harness); SEED env override; 3 seeds.
// NOTE: apFeedMessage reads global Math.random at call time, so the feed
// tests script it directly and restore the harness RNG afterwards.
const fs = require('fs');
const path = require('path');
const H = require('./break-alien-harness.js');
const { Game, RNG } = H;

let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.log('  FAIL: ' + msg); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

const SEED = parseInt(process.env.SEED || '20261009', 10);
const SEEDS = [SEED, SEED + 1, SEED + 2];

function prime() {
  H.fresh(45);
  Game.state.waveKills = { 1: 10 };
  Game.state.systemArrived = true;
  Game.state.systemIntegration = 2;
}

function alienItemCount() {
  return (Game.state.scholar.inventory || []).filter(
    it => it && /^alien_/.test(it.itemId || '')).length;
}

async function main() {
  await H.boot();

  // ------------------------------------------------------------------
  section('B1a. HONESTY — beam placement: roll lives in tbAlienTurn, wrap gone');
  // ------------------------------------------------------------------
  const encSrc = fs.readFileSync(path.join(H.ROOT, 'src/js/encounters.js'), 'utf8');
  const apSrc = fs.readFileSync(path.join(H.ROOT, 'src/js/alienPlayers.js'), 'utf8');
  const tbAlienTurn = encSrc.slice(encSrc.indexOf('G.tbAlienTurn = function'));
  assert(tbAlienTurn.indexOf('apMaybeBeamAttack(m)') !== -1,
    'tbAlienTurn rolls the beam (replaces the strike)');
  assert(apSrc.indexOf('var _tbAfterBeam') === -1,
    'the post-turn bonus-beam tbAfterPlayerAction wrap is gone');
  const wrapCount = (apSrc.match(/G\.tbAfterPlayerAction = function/g) || []).length;
  assert(wrapCount === 1, 'exactly one tbAfterPlayerAction wrap remains (chatter), got ' + wrapCount);

  // ------------------------------------------------------------------
  section('B1b. HONESTY — beam fires (unit): damage lands, cooldown set');
  // ------------------------------------------------------------------
  for (const seed of SEEDS) {
    prime();
    Game.apRevealAlien('vex_marlowe', 'test');
    const pF = { key: 'p', alive: true, hp: 100, maxHp: 100, name: 'You' };
    const aF = { key: 'ap_vex_marlowe', kind: 'hostile', alienPid: 'vex_marlowe', alive: true, fled: false, _enraged: false };
    Game.tbfight = { fighters: [pF, aF], over: false, _beamCooldown: 0 };
    H.clearLog();
    // One reset, then repeated rolls (the LCG's consecutive seeds are
    // correlated — resetting per attempt would re-roll ~the same value).
    RNG.reset(seed);
    let fired = false, tries = 0;
    while (!fired && tries < 60) {
      Game.tbfight._beamCooldown = 0;
      pF.hp = 100; pF.alive = true;
      fired = Game.apMaybeBeamAttack(aF);
      tries++;
    }
    assert(fired, 'seed ' + seed + ': beam fires within 60 seeded rolls');
    assert(pF.hp < 100, 'seed ' + seed + ': beam damage actually lands (hp ' + pF.hp + ')');
    assert(Game.tbfight._beamCooldown === 3, 'seed ' + seed + ': cooldown set to 3 on fire');
    const again = Game.apMaybeBeamAttack(aF);
    assert(again === false, 'seed ' + seed + ': immediate re-fire blocked by cooldown');
    const said = H.sayText();
    assert(/Vex/.test(said), 'seed ' + seed + ': known persona named in the beam telegraph');
    Game.tbfight = null; // dissolve the fake unit-test fight
  }

  // ------------------------------------------------------------------
  section('B1c. HONESTY — beam telegraph is knowledge-gated pre-reveal');
  // ------------------------------------------------------------------
  for (const seed of SEEDS) {
    prime();
    // NOT revealed: ap.known empty
    const pF = { key: 'p', alive: true, hp: 100, maxHp: 100, name: 'You' };
    const aF = { key: 'ap_vex_marlowe', kind: 'hostile', alienPid: 'vex_marlowe', alive: true, fled: false, _enraged: false };
    Game.tbfight = { fighters: [pF, aF], over: false, _beamCooldown: 0 };
    H.clearLog();
    RNG.reset(seed);
    let fired = false, tries = 0;
    while (!fired && tries < 60) {
      Game.tbfight._beamCooldown = 0;
      pF.hp = 100; pF.alive = true;
      fired = Game.apMaybeBeamAttack(aF);
      tries++;
    }
    assert(fired, 'seed ' + seed + ': beam fires pre-reveal within 60 rolls');
    const said = H.sayText();
    assert(!/Vex/.test(said) && !/phase lance/i.test(said),
      'seed ' + seed + ': pre-reveal telegraph names no one ("' + said.split('\n')[0] + '")');
    assert(/stranger/i.test(said) && /beam weapon/i.test(said),
      'seed ' + seed + ': pre-reveal telegraph stays generic');
    Game.tbfight = null; // dissolve the fake unit-test fight
  }

  // ------------------------------------------------------------------
  section('B1d. HONESTY — no beam on the opening turn (player moves first)');
  // ------------------------------------------------------------------
  for (const seed of SEEDS) {
    prime();
    RNG.reset(seed);
    Game.apRevealAlien('vex_marlowe', 'test');
    Game.state.waveKills = { 1: 10 };
    Game.state.party = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    Game.isSafeTile = () => false;
    H.clearLog();
    const started = Game.apStartEncounter('vex_marlowe');
    assert(started === true, 'seed ' + seed + ': alien fight starts');
    assert(Game.tbfight && Game.inCombat(), 'seed ' + seed + ': fight is live after start');
    assert(!/🔆/.test(H.sayText()), 'seed ' + seed + ': opening turn fires no beam before the player moves');
    const aF = Game.tbfight.fighters.find(f => f.alienPid);
    assert(aF && (aF.apTurns || 0) >= 1, 'seed ' + seed + ': alien took its opening turn');
    // A later turn: the beam CAN replace the strike. (apTurns=3 -> the turn
    // counter hits 4, dodging the every-3rd-turn heavy declare.)
    aF.apTurns = 3;
    const pF = Game.tbFighter('p');
    const hp0 = pF.hp;
    const realR = Math.random;
    Math.random = () => 0.0; // force the 40% sadistic roll to fire
    H.clearLog();
    Game.tbAlienTurn(aF);
    Math.random = realR;
    assert(pF.hp < hp0, 'seed ' + seed + ': turn 2 beam replaces the strike (hp ' + hp0 + ' -> ' + pF.hp + ')');
    assert(/🔆/.test(H.sayText()), 'seed ' + seed + ': turn-2 beam telegraph said');
    Game.tbfight = null; // dissolve the test fight
  }

  // ------------------------------------------------------------------
  section('B2. HONESTY/EXPLOIT — armor salvage is kill-only, never on flee');
  // ------------------------------------------------------------------
  for (const seed of SEEDS) {
    // FLED ("won" because the broke persona retreated): no salvage, ever.
    prime();
    Game.apRevealAlien('pip_quindle', 'test');
    Game.apState().met['pip_quindle'] = { encounters: 1, bond: 0 };
    RNG.reset(seed);
    H.clearLog();
    const inv0 = Game.state.scholar.inventory.length;
    for (let i = 0; i < 30; i++) {
      Game.apOnCombatEnd('pip_quindle', 'won', { killed: false });
    }
    assert(alienItemCount() === 0,
      'seed ' + seed + ': 30 drove-off "wins" yield ZERO alien armor');
    assert(!/strip/i.test(H.sayText()),
      'seed ' + seed + ': no "strip from their body" copy for a fled opponent');
    assert(Game.state.scholar.inventory.length >= inv0,
      'seed ' + seed + ': inventory untouched by drove-off wins');
    // KILLED: salvage fires sometimes, and the drop is a real item.
    prime();
    Game.apRevealAlien('vex_marlowe', 'test');
    Game.apState().met['vex_marlowe'] = { encounters: 1, bond: 0 };
    let salvaged = 0;
    RNG.reset(seed); // one reset: the stream advances per iteration
    for (let i = 0; i < 40; i++) {
      const before = alienItemCount();
      H.clearLog();
      Game.apOnCombatEnd('vex_marlowe', 'won', { killed: true });
      if (alienItemCount() > before) {
        salvaged++;
        const got = (Game.state.scholar.inventory || []).filter(
          it => it && /^alien_/.test(it.itemId || '')).pop();
        assert(typeof got.name === 'string' && got.name.length > 0 && got.units >= 1,
          'seed ' + seed + ' iter ' + i + ': salvaged armor is a real item (name+units)');
      }
    }
    assert(salvaged > 0,
      'seed ' + seed + ': 40 real kills yield at least one armor salvage (got ' + salvaged + ')');
    // Back-compat: omitted opts defaults to no salvage (safe default).
    prime();
    Game.apRevealAlien('vex_marlowe', 'test');
    Game.apState().met['vex_marlowe'] = { encounters: 1, bond: 0 };
    RNG.reset(seed);
    for (let i = 0; i < 10; i++) Game.apOnCombatEnd('vex_marlowe', 'won');
    assert(alienItemCount() === 0, 'seed ' + seed + ': omitted opts => no salvage (safe default)');
  }

  // ------------------------------------------------------------------
  section('B3. HONESTY — feed naming IS the reveal (no 70% Stranger gap)');
  // ------------------------------------------------------------------
  const harnessRandom = Math.random;
  for (const seed of SEEDS) {
    // Force the rival-gossip message to be the one heard: gate pass, no wren
    // whisper, pick index 0 (rival gossip is pushed first).
    prime();
    Game.apState().met['vex_marlowe'] = { encounters: 1, bond: 0 };
    Game.apState().lastFeedDay = -999;
    H.clearLog();
    const script = [0.1, 0.9, 0.0];
    Math.random = () => script.shift() || 0;
    const r1 = Game.apFeedMessage();
    Math.random = harnessRandom;
    assert(r1 === true, 'seed ' + seed + ': feed message goes out');
    assert(/VEX MARLOWE/.test(H.sysText()),
      'seed ' + seed + ': the rival is named on the feed');
    assert(Game.apKnowsAlien('vex_marlowe') === true,
      'seed ' + seed + ': hearing the name on the feed reveals them (no Stranger gap)');
    // And when a generic message is picked instead, no reveal fires.
    prime();
    Game.apState().met['vex_marlowe'] = { encounters: 1, bond: 0 };
    Game.apState().lastFeedDay = -999;
    H.clearLog();
    const script2 = [0.1, 0.9, 0.9]; // pick index 1: generic audience line
    Math.random = () => script2.shift() || 0;
    Game.apFeedMessage();
    Math.random = harnessRandom;
    assert(Game.apKnowsAlien('vex_marlowe') === false,
      'seed ' + seed + ': a generic feed line does not reveal anyone');
  }

  // ------------------------------------------------------------------
  section('B4. REGRESSION GUARDS — source pins for the three fixes');
  // ------------------------------------------------------------------
  assert(apSrc.indexOf('opts.killed') !== -1, 'apOnCombatEnd gates salvage on opts.killed');
  assert(apSrc.indexOf('alienKilled') !== -1, 'tbEnd wrap detects killed vs fled');
  assert(apSrc.indexOf('msgPids') !== -1, 'apFeedMessage tracks which message names whom');
  assert(tbAlienTurn.indexOf('replaces the strike') !== -1 || tbAlienTurn.indexOf('REPLACES the strike') !== -1,
    'tbAlienTurn documents the beam-replaces-strike design');

  console.log('\npass: ' + pass + '  fail: ' + fail);
  if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log(' - ' + f)); }
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
