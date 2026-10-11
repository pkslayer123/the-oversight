// Break-it alien players r13 (2026-10-10): hostile proof test.
// Catches: C1 wealth-stance flags knowledge-gated (mechanics), C2 favor
// why-copy names persona pre-reveal, C3 persona-package card/photo names
// persona pre-reveal. Holds: cooldowns, wacky-never-dinner, per-persona
// 3rd-encounter reveal, dead-code census.
const H = require('./break-alien-harness.js');
const { Game, RNG, fresh, sayText, sysText, clearLog } = H;

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; fails.push(name); console.log('FAIL: ' + name); }
}
function noNameLeak(text, pid, name) {
  return text.indexOf(name) === -1 && text.indexOf(pid) === -1;
}
function knownAlien(pid) { return !!((Game.apState().known || {})[pid]); }

async function main() {
  await H.boot();

  // ---------- C1: wealth stance flags must not depend on knowledge ----------
  for (const seed of [11, 22, 33]) {
    RNG.reset(seed); fresh(20);
    const ap = Game.apState();
    ap.known = {}; // pre-reveal: never met the truth
    // RICH persona (vex_marlowe) at 30% HP -> must enrage mechanically
    const vf = Game.apBuildFighter('vex_marlowe', 4, 4);
    vf.hp = Math.floor(vf.maxHp * 0.3);
    Game.apApplyWealthStance('vex_marlowe', vf);
    ok(vf._enraged === true, 'C1 s' + seed + ': pre-reveal rich persona enrages (canon wealth rule)');
    ok(Game.apWealthStance('vex_marlowe', vf) === 'enraged', 'C1 s' + seed + ': stance itself is enraged');
    // announcement stays gated: no theatrical naming pre-reveal
    const t1 = sayText();
    ok(noNameLeak(t1, 'vex_marlowe', 'Vex') || t1.indexOf('ENRAGED') === -1,
      'C1 s' + seed + ': no enrage announcement pre-reveal');
    // BROKE persona (pip_quindle) at 30% HP -> retreating stance + flag
    const pf = Game.apBuildFighter('pip_quindle', 4, 4);
    pf.hp = Math.floor(pf.maxHp * 0.3);
    const pst = Game.apApplyWealthStance('pip_quindle', pf);
    ok(pst === 'retreating', 'C1 s' + seed + ': pre-reveal broke persona stance retreating');
    ok(pf._wantsRetreat === true, 'C1 s' + seed + ': pre-reveal broke persona _wantsRetreat set');
    // POST-reveal the theatrical line DOES fire (announcement honesty kept)
    clearLog();
    ap.known.vex_marlowe = { day: 20, how: 'test' };
    const vf2 = Game.apBuildFighter('vex_marlowe', 4, 4);
    vf2.hp = Math.floor(vf2.maxHp * 0.3);
    Game.apApplyWealthStance('vex_marlowe', vf2);
    ok(vf2._enraged === true, 'C1 s' + seed + ': post-reveal rich persona still enrages');
    ok(sayText().indexOf('ENRAGED') !== -1, 'C1 s' + seed + ': post-reveal enrage announced');
  }

  // ---------- C2: favor why-copy must not name personas pre-reveal ----------
  for (const seed of [44, 55, 66]) {
    RNG.reset(seed); fresh(25);
    const ap = Game.apState();
    ap.known = {}; ap.met = {};
    clearLog();
    // simulate a won fight vs countess_sable, first encounter (no reveal)
    try { Game.apOnCombatEnd('countess_sable', 'won', { killed: false }); } catch (e) {}
    ok(!knownAlien('countess_sable'), 'C2 s' + seed + ': fight 1 does not reveal');
    const st = sysText() + '\n' + sayText();
    ok(noNameLeak(st, 'countess_sable', 'Sable'), 'C2 s' + seed + ': no persona name in favor feed pre-reveal (won)');
    clearLog();
    try { Game.apOnCombatEnd('countess_sable', 'fled', { killed: false }); } catch (e) {}
    const st2 = sysText() + '\n' + sayText();
    ok(noNameLeak(st2, 'countess_sable', 'Sable'), 'C2 s' + seed + ': no persona name in favor feed pre-reveal (fled)');
    // fight 3 DOES reveal, and then naming is honest
    clearLog();
    try { Game.apOnCombatEnd('countess_sable', 'won', { killed: false }); } catch (e) {}
    ok(knownAlien('countess_sable'), 'C2 s' + seed + ': 3rd encounter reveals (per-persona)');
    const st3 = sysText() + '\n' + sayText();
    ok(st3.indexOf('Sable') !== -1, 'C2 s' + seed + ': post-reveal naming resumes');
  }

  // ---------- C3: persona package cards must not name personas pre-reveal ----------
  for (const seed of [77, 88, 99]) {
    RNG.reset(seed); fresh(25);
    const ap = Game.apState();
    ap.known = {}; ap.met = {};
    // SADISTIC branch: only countess_sable met (encounters>=1 picks her)
    ap.met.countess_sable = { encounters: 2, bond: 0 };
    ap.lastPersonaPackageDay = -999;
    clearLog();
    let fired = false;
    for (let i = 0; i < 60 && !fired; i++) { try { fired = !!Game.apPersonaPackage(); } catch (e) {} }
    ok(fired, 'C3 s' + seed + ': sadistic package fires');
    ok(!knownAlien('countess_sable'), 'C3 s' + seed + ': package is not a reveal');
    const pt = sayText() + '\n' + sysText();
    ok(noNameLeak(pt, 'countess_sable', 'Countess Sable'), 'C3 s' + seed + ': no persona name on sadistic card/tracker line pre-reveal');
    // NEUTRAL branch: only pip_quindle met
    RNG.reset(seed + 1000); fresh(25);
    const ap2 = Game.apState();
    ap2.known = {}; ap2.met = {};
    ap2.met.pip_quindle = { encounters: 2, bond: 0 };
    ap2.lastPersonaPackageDay = -999;
    clearLog();
    fired = false;
    for (let i = 0; i < 60 && !fired; i++) { try { fired = !!Game.apPersonaPackage(); } catch (e) {} }
    ok(fired, 'C3 s' + seed + ': neutral package fires');
    const pt2 = sayText() + '\n' + sysText();
    ok(noNameLeak(pt2, 'pip_quindle', 'Pip Quindle'), 'C3 s' + seed + ': no persona name on neutral card/photo pre-reveal');
  }

  // ---------- HOLDS ----------
  for (const seed of [7, 8]) {
    RNG.reset(seed); fresh(30);
    const ap = Game.apState();
    const day = Game.state.scholar.day;
    // H-cooldowns: day-based, not gameable by repeat calls
    ap.lastDropDay = day; ok(Game.apDeadDrop() === false, 'H s' + seed + ': dead drop 1/3d');
    ap.lastFeedDay = day; ok(Game.apFeedMessage() === false, 'H s' + seed + ': feed 1/d');
    ap.lastBoonDay = day; ok(Game.apClubBoon() === false, 'H s' + seed + ': club boon 1/5d');
    ap.fanClubs = { fight: 80, survival: 0, social: 0, showbiz: 0 };
    ap.lastPackageDay = day; ok(Game.apCarePackage() === false, 'H s' + seed + ': care package 1/4d');
    // H-wacky: never dinner
    let wackyOk = true;
    for (let i = 0; i < 300; i++) {
      const g = Game.apWackyGift(3);
      if (g && (g.kcalEach || g.class === 'food')) { wackyOk = false; break; }
    }
    ok(wackyOk, 'H s' + seed + ': wacky gifts never dinner (300 draws)');
    // H-reveal is per-persona: two personas at 2 encounters, neither revealed
    ap.known = {}; ap.met = {};
    try { Game.apOnCombatEnd('vex_marlowe', 'won', {}); Game.apOnCombatEnd('vex_marlowe', 'lost', {}); } catch (e) {}
    try { Game.apOnCombatEnd('rax_dentist', 'won', {}); } catch (e) {}
    ok(!knownAlien('vex_marlowe') && !knownAlien('rax_dentist'), 'H s' + seed + ': 2 encounters each, neither revealed');
    try { Game.apOnCombatEnd('vex_marlowe', 'won', {}); } catch (e) {}
    ok(knownAlien('vex_marlowe') && !knownAlien('rax_dentist'), 'H s' + seed + ': 3rd reveals vex only, rax untouched');
    // H-beam: targeting convention still 'player'
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src/js/alienPlayers.js'), 'utf8');
    ok(/apBeamHit\('player'/.test(src), 'H s' + seed + ': beam targets player (telegraph/hit match)');
  }

  // H-dead-code: every flagged function has a real call site in the module
  const fs = require('fs'), path = require('path');
  const srcAll = fs.readFileSync(path.join(__dirname, '..', 'src/js/alienPlayers.js'), 'utf8');
  const body = srcAll.replace(/^    ap[A-Za-z]+: function[^]*?^    \},$/gm, ''); // crude: drop defs? keep simple below
  for (const fn of ['apPilotTaunt', 'apReadinessCheck', 'apDousePlayerFire', 'apWackyGift', 'apContactWarning', 'apStasisFieldLive', 'apBeamResistPieces', 'apBeamResistLevel']) {
    const calls = (srcAll.match(new RegExp('this\\.' + fn + '\\(', 'g')) || []).length;
    ok(calls >= 1, 'H deadcode: ' + fn + ' has ' + calls + ' call site(s)');
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fails.length) { console.log('failed checks:'); fails.forEach(f => console.log(' - ' + f)); }
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
