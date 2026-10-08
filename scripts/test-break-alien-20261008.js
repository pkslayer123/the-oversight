// BREAK-IT: alien players system (Steve 2026-10-08 — adversarial mode).
// Attacks: favor-economy exploits, rate-limit enforcement, group-encounter
// dead code, same-rival sporting-rule bypass, beam-resist readout dead code,
// knowledge-gating honesty, beam engineKey honesty, lifeline watch-mode honesty.
// Seeded (mulberry32-style LCG installed pre-eval); SEED env override; each
// scenario runs across 3 seeds. Aggregate assertions — no single-roll flakes.
const H = require('./break-alien-harness.js');
const { Game, RNG } = H;

let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.log('  FAIL: ' + msg); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

const SEED = parseInt(process.env.SEED || '20261008', 10);

// Prime a game where alien encounters are genuinely eligible.
function eligibleGame(day, seed) {
  RNG.reset(seed === undefined ? SEED : seed);
  const s = H.fresh(day || 45);
  Game.state.waveKills = { 1: 10 }; // wave 2 unlocked (day>=8 + 4 wave-1 kills)
  Game.state.systemArrived = true;
  Game.state.systemIntegration = 2;
  Game.state.party = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]; // readiness: 75 + day25 = 100
  Game.isSafeTile = () => false; // test on a wild tile (depart is safe)
  s.day = day || 45;
  return s;
}

// apDailyTick (decay, drops, feed) only runs when apEligible: post-System + wave 2.
function tickEligible() {
  H.fresh(30);
  Game.state.waveKills = { 1: 10 };
  Game.state.systemArrived = true;
}

async function main() {
  await H.boot();

  // ------------------------------------------------------------------
  section('A1. EXPLOIT — favor clamping + decay (economy bounds)');
  // ------------------------------------------------------------------
  for (const seed of [SEED, SEED + 1, SEED + 2]) {
    RNG.reset(seed); tickEligible();
    const ap = Game.apState();
    Game.apAdjustFavor(1000, 'test'); assert(Game.apFavor() === 100, 'seed ' + seed + ': favor clamps at +100');
    Game.apAdjustFavor(-1000, 'test'); assert(Game.apFavor() === -100, 'seed ' + seed + ': favor clamps at -100');
    // Decay: 60 daily ticks pull toward 0 from both extremes
    Game.apState().favor = 100;
    for (let d = 0; d < 60; d++) { Game.state.scholar.day++; Game.apDailyTick(); }
    const f1 = Game.apFavor();
    assert(f1 <= 45, 'seed ' + seed + ': +100 decays toward 0 over 60d (got ' + f1 + ')');
    Game.apState().favor = -100;
    for (let d = 0; d < 60; d++) { Game.state.scholar.day++; Game.apDailyTick(); }
    const f2 = Game.apFavor();
    assert(f2 >= -45, 'seed ' + seed + ': -100 decays toward 0 over 60d (got ' + f2 + ')');
  }

  // ------------------------------------------------------------------
  section('A2. EXPLOIT — rate limits: care package 1/4d, dead drop 1/3d, feed 1/d');
  // ------------------------------------------------------------------
  for (const seed of [SEED, SEED + 1, SEED + 2]) {
    RNG.reset(seed); tickEligible();
    const ap = Game.apState();
    ap.favor = 100; // max favor: packages as generous as they get
    const s = Game.state.scholar;
    const kcal0 = s.kcal || 0;
    let fired = 0;
    for (let i = 0; i < 10; i++) if (Game.apCarePackage()) fired++;
    assert(fired === 1, 'seed ' + seed + ': 10 same-day apCarePackage calls fire exactly once (got ' + fired + ')');
    const kcal1 = s.kcal || 0;
    assert(kcal1 - kcal0 < 1500, 'seed ' + seed + ': one package < 1500 kcal (got ' + (kcal1 - kcal0) + ')');
    // Dead drop: hammer the daily tick 20x on the same day
    RNG.reset(seed); tickEligible();
    const s2 = Game.state.scholar; const k0 = s2.kcal || 0;
    for (let i = 0; i < 20; i++) Game.apDailyTick();
    const gained = (s2.kcal || 0) - k0;
    // One dead drop max (200-500) + one package possible (favor may climb via ticks? no — favor starts 0, package needs 20)
    assert(gained <= 1200, 'seed ' + seed + ': 20 same-day apDailyTick calls gain <= 1200 kcal (got ' + gained + ')');
    // Favor stays < 20 after a day of ticks (no free packages at favor 0)
    assert(Game.apFavor() < 20, 'seed ' + seed + ': favor after 20 ticks still < 20 (got ' + Game.apFavor() + ')');
  }

  // ------------------------------------------------------------------
  section('A3. EXPLOIT — contest-win favor farming stays bounded');
  // ------------------------------------------------------------------
  {
    // Worst case a hostile player can sustain: a win every 3 days (+4),
    // decay -1/day. 90 days of perfect farming.
    RNG.reset(SEED); tickEligible();
    const ap = Game.apState();
    for (let d = 0; d < 90; d++) {
      Game.state.scholar.day++;
      if (d % 3 === 0) Game.apAdjustFavor(4, 'farmed win');
      Game.apDailyTick();
    }
    const f = Game.apFavor();
    assert(f <= 45, '90d of +4/3d win farming keeps favor <= 45 (got ' + f + ') — tier-3 packages (70+) unreachable by farming');
  }

  // ------------------------------------------------------------------
  section('A4. SOFTLOCK — apStartEncounter edge cases');
  // ------------------------------------------------------------------
  {
    RNG.reset(SEED); H.fresh(30);
    Game.state.waveKills = { 1: 10 };
    assert(Game.apStartEncounter('bogus_pid') === false, 'invalid pid returns false');
    assert(!Game.state.alienEncounter, 'invalid pid leaves no encounter state');
    assert(Game.apStartEncounter(null) === false, 'null pid returns false');
    assert(Game.apStartEncounter(undefined) === false, 'undefined pid returns false');
    // Non-combat persona (wren) — apIsCombat false
    assert(Game.apIsCombat('wren') === false, 'wren is non-combat');
    // startAlienCombat refuses when already in combat
    Game.tbfight = { over: false, fighters: [] };
    assert(Game.inCombat() === true, 'test rig: inCombat true');
    assert(Game.startAlienCombat({ key: 'x' }) === null, 'startAlienCombat refuses mid-combat');
    Game.tbfight = null;
    assert(Game.inCombat() === false, 'combat cleared, no stuck tbfight');
  }

  // ------------------------------------------------------------------
  section('A5. HONESTY — knowledge gating pre-reveal (no alien-truth leaks)');
  // ------------------------------------------------------------------
  for (const seed of [SEED, SEED + 1, SEED + 2]) {
    RNG.reset(seed); H.fresh(30);
    Game.state.waveKills = { 1: 10 };
    const personas = Game.apPersonas().filter(p => Game.apIsCombat(p.id));
    let leak = null;
    for (const p of personas) {
      // Pre-reveal: nothing known
      H.clearLog();
      Game.apCombatIntro(p.id);
      for (const sit of ['onHit', 'onHurt', 'onWinning', 'onLosing', 'unhinged']) {
        Game.apCombatLine(p.id, sit);
        Game.apSayCombat(p.id, sit, 1.0);
      }
      Game.apCodexEntry(p.id);
      const txt = H.allText();
      for (const secret of [p.title, p.species, p.disposition]) {
        if (secret && txt.indexOf(secret) >= 0) { leak = p.id + ' leaks "' + secret + '" pre-reveal'; break; }
      }
      if (leak) break;
      // The word "alien" must not appear pre-reveal (suspicion is fine, conclusion is not)
      if (/alien/i.test(txt)) { leak = p.id + ' says "alien" pre-reveal'; break; }
    }
    assert(!leak, 'seed ' + seed + ': pre-reveal surfaces leak nothing (' + (leak || 'clean') + ')');
    // Post-reveal the truth IS sayable (gating is a gate, not a gag)
    RNG.reset(seed); H.fresh(30);
    Game.state.waveKills = { 1: 10 };
    Game.apRevealAlien('vex_marlowe', 'test reveal');
    H.clearLog();
    Game.apCombatIntro('vex_marlowe');
    assert(/Vex Marlowe/.test(H.allText()), 'seed ' + seed + ': post-reveal intro names the persona');
  }

  // ------------------------------------------------------------------
  section('A6. HONESTY — beam actually lands (engineKey fix holds)');
  // ------------------------------------------------------------------
  for (const seed of [SEED, SEED + 1, SEED + 2]) {
    RNG.reset(seed); H.fresh(30);
    Game.tbfight = { over: false, fighters: [{ key: 'p', alive: true, hp: 100, maxHp: 100, name: 'You' }] };
    H.clearLog();
    const dealt = Game.apBeamHit('player', 0, 'test beam', { damageType: 'alien_beam' });
    const p = Game.tbFighter('p');
    assert(dealt > 0 && p.hp === 100 - dealt, 'seed ' + seed + ': apBeamHit("player") damages engine fighter p (' + dealt + ' dmg)');
    assert(/beam damage/.test(H.allText()), 'seed ' + seed + ': beam announces damage (no silent whiff)');
    Game.tbfight = null;
  }

  // ------------------------------------------------------------------
  section('A7. HONESTY — benevolent lifeline fires ONLY for the player');
  // ------------------------------------------------------------------
  {
    // 200 trials in watch mode (player NOT a participant): deathSave must never fire.
    let watchSaves = 0, playerSaves = 0;
    for (let i = 0; i < 200; i++) {
      RNG.reset(SEED + i); H.fresh(30);
      Game.state.waveKills = { 1: 10 };
      Game.state.systemIntegration = 2;
      const ap = Game.apState();
      ap.met['old_tam'] = { encounters: 5, bond: 5, lastOutcome: 'won' }; // bonded benevolent
      ap.lastLifelineDay = -999;
      const r1 = Game.apContestInterference({ participant: 'villager_x', participants: ['villager_x'] });
      if (r1 && r1.deathSave) watchSaves++;
      const ap2 = Game.apState(); ap2.lastLifelineDay = -999;
      // (break-it 2026-10-08: the player's death-roll call passes
      // {forPlayer:true} — the verdict-style call without it must NOT fire
      // the lifeline, even with the player in participants.)
      const r2 = Game.apContestInterference({ participant: 'player', participants: ['player'] }, { forPlayer: true });
      if (r2 && r2.deathSave) playerSaves++;
    }
    assert(watchSaves === 0, 'lifeline never fires in watch mode over 200 trials (got ' + watchSaves + ')');
    assert(playerSaves > 0, 'lifeline CAN fire for the player (fired ' + playerSaves + '/200)');
  }

  // ------------------------------------------------------------------
  section('A8. AFTER — group encounters wired into the encounter phase');
  // ------------------------------------------------------------------
  {
    let rollCalls = 0, startCalls = 0;
    const _roll = Game.apRollGroupEncounter, _start = Game.apStartGroupEncounter;
    Game.apRollGroupEncounter = function () { rollCalls++; return _roll.apply(this, arguments); };
    Game.apStartGroupEncounter = function () { startCalls++; return _start.apply(this, arguments); };
    let startEncounterCalls = 0;
    const _se = Game.apStartEncounter;
    Game.apStartEncounter = function () { startEncounterCalls++; return true; };
    for (let i = 0; i < 300; i++) {
      eligibleGame(45, SEED + i);
      const ap = Game.apState();
      // Two established rivals — group-eligible by the book
      ap.met['vex_marlowe'] = { encounters: 3, bond: 0, lastOutcome: 'lost' };
      ap.met['countess_sable'] = { encounters: 4, bond: 0, lastOutcome: 'lost' };
      ap.lastGroupDay = -999;
      try { Game.checkEncounter(); } catch (e) {}
    }
    Game.apRollGroupEncounter = _roll; Game.apStartGroupEncounter = _start;
    Game.apStartEncounter = _se;
    console.log('  (after) apStartEncounter calls (sanity): ' + startEncounterCalls);
    console.log('  (after) apRollGroupEncounter calls over 300 eligible rolls: ' + rollCalls);
    console.log('  (after) apStartGroupEncounter calls: ' + startCalls);
    assert(rollCalls > 0, 'group roll is consulted by the encounter phase (' + rollCalls + ' calls)');
    assert(startCalls > 0, 'group encounters actually start (' + startCalls + ' starts)');
  }

  // ------------------------------------------------------------------
  section('A9. AFTER — same-rival sporting rule enforced in weighted pool');
  // ------------------------------------------------------------------
  {
    // Vex fought YESTERDAY. Sporting rule: min 2 days between hunts by the same persona.
    let vexPicked = 0, trials = 0;
    for (let i = 0; i < 400; i++) {
      RNG.reset(9000 + i); H.fresh(30);
      Game.state.waveKills = { 1: 10 };
      Game.state.systemIntegration = 2;
      Game.state.party = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      Game.isSafeTile = () => false;
      const ap = Game.apState();
      const day = Game.state.scholar.day;
      ap.met['vex_marlowe'] = { encounters: 3, bond: 0, lastOutcome: 'lost' };
      ap.lastHuntDay['vex_marlowe'] = day - 1; // fought yesterday
      // Force the roll to succeed: stub Math.random for the chance gate only
      const realNext = RNG.next.bind(RNG);
      let calls = 0;
      Math.random = function () { calls++; return calls <= 2 ? 0.0 : realNext(); };
      let pid = null;
      try { pid = Game.apRollEncounter(); } catch (e) {}
      Math.random = realNext;
      if (pid) { trials++; if (pid === 'vex_marlowe') vexPicked++; }
    }
    console.log('  (after) vex re-picked 1 day after last hunt: ' + vexPicked + '/' + trials);
    assert(trials > 50, 'rolls still succeed via fallback pool (' + trials + ')');
    assert(vexPicked === 0, 'yesterday\'s rival never re-picked (' + vexPicked + '/' + trials + ')');
  }

  // ------------------------------------------------------------------
  section('A10. AFTER — apBeamResistText wired as pre-fight warning');
  // ------------------------------------------------------------------
  {
    let calls = 0;
    const _t = Game.apBeamResistText;
    Game.apBeamResistText = function () { calls++; return _t.apply(this, arguments); };
    RNG.reset(SEED); H.fresh(30);
    Game.state.waveKills = { 1: 10 };
    Game.state.systemIntegration = 2;
    Game.state.party = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    Game.apRevealAlien('vex_marlowe', 'test');
    Game.apCombatIntro('vex_marlowe');
    Game.tbfight = { over: false, fighters: [{ key: 'p', alive: true, hp: 100, maxHp: 100, name: 'You' }] };
    Game.apBeamHit('player', 0, 'test', { damageType: 'alien_beam' });
    Game.tbfight = null;
    for (let i = 0; i < 30; i++) { Game.state.scholar.day++; try { Game.apDailyTick(); } catch (e) {} }
    Game.apRevealAlien('countess_sable', 'test');
    try { Game.apStartEncounter('countess_sable'); } catch (e) {}
    try { if (Game.inCombat()) Game.tbEnd('fled'); } catch (e) {}
    Game.apBeamResistText = _t;
    console.log('  (after) apBeamResistText calls: ' + calls);
    assert(calls >= 1, 'apBeamResistText fires as pre-fight warning when the alien is known (' + calls + ' calls)');
  }

  console.log('\n----\npass=' + pass + ' fail=' + fail);
  if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log(' - ' + f)); }
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
