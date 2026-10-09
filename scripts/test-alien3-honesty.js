// BREAK-IT 3rd pass: honesty — copy vs engine, dead code (Steve 2026-10-08).
// ATTACKS:
//  1. BEAM SINGLE-SOURCE LIE: apHasBeam(pid) is documented as the "single
//     source of truth for 'fields a beam weapon' (everyone but Old Tam)",
//     but apMaybeBeamAttack keeps its OWN parallel beamNames table
//     (old_tam: null) and never calls apHasBeam. Two beam-user lists that
//     can diverge — add a persona or arm Tam and exactly one list updates.
//     FIX: apMaybeBeamAttack gates on apHasBeam; the table is display only.
//  2. ABILITY-KIT HONESTY: apAbilityKit's comment claims "These are real
//     abilities from the game's pool — they fight like players." False twice:
//     (a) 'pattern_recognition' (5 personas) and 'forage_identification'
//     (fenwick) are NOT in the ability pool; (b) tbAlienTurn never reads
//     fighter.abilities — the kit is flavor data, unused by the engine.
//     FIX: replace the two bogus ids with real pool abilities; correct the
//     comment to describe what the kit actually is.
//  3. apFavor() DEAD: zero runtime call sites (only the ontology header and
//     old tests reference it). The Alien Players lesson: wire it or remove it.
//     FIX: route the module's internal favor reads through apFavor().
//  4. FEED/GOSSIP GATES (expected to HOLD): apVillageGossip names only
//     ap.known personas; apEventFeed/apFeedMessage name human sleeve names
//     (consistent with the codex), never title/species/disposition pre-reveal.
// These assertions encode the FIXED behavior — (1)-(3) FAIL before the fix.
const H = require('./break-alien-harness.js');
const { Game, RNG } = H;
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.log('  FAIL: ' + msg); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

async function main() {
  await H.boot();
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'alienPlayers.js'), 'utf8');

  section('1. apMaybeBeamAttack is gated by apHasBeam (one list)');
  {
    const m = src.match(/apMaybeBeamAttack: function[\s\S]*?\n    \},/);
    assert(!!m, 'apMaybeBeamAttack found in source');
    const body = m ? m[0] : '';
    assert(/this\.apHasBeam\(pid\)/.test(body),
      'apMaybeBeamAttack calls apHasBeam(pid) as the beam gate (single source of truth)');
    // Behavioral: Tam never beams; every other combat persona can.
    RNG.reset(20261008);
    const s = H.fresh(50);
    Game.state.systemArrived = true;
    Game.state.waveKills = { 1: 10 };
    Game.isSafeTile = () => false;
    let tamBeams = 0, otherBeams = 0;
    for (const pid of ['vex_marlowe', 'countess_sable', 'rax_dentist', 'pip_quindle', 'sarge', 'dr_fenwick', 'old_tam']) {
      const f = { alienPid: pid, _enraged: true };
      Game.tbfight = { fighters: [f], _beamCooldown: 0, over: false };
      for (let i = 0; i < 40; i++) {
        RNG.reset((i * 2654435761 + pid.length * 97) >>> 0 || 1);
        H.clearLog();
        const r = Game.apMaybeBeamAttack(f);
        if (r) { if (pid === 'old_tam') tamBeams++; else otherBeams++; }
      }
    }
    Game.tbfight = null;
    assert(tamBeams === 0, 'old_tam never fires a beam (40 tries, enraged)');
    assert(otherBeams > 0, 'beam-capable personas do fire (' + otherBeams + ' fires)');
  }

  section('2. ability kits contain only real pool abilities');
  {
    const pool = new Set((Game.data.abilities || []).map(a => a.id));
    assert(pool.size > 0, 'ability pool loaded (' + pool.size + ')');
    const bad = [];
    for (const p of Game.apPersonas()) {
      const kit = Game.apAbilityKit(p.id) || [];
      for (const id of kit) if (!pool.has(id)) bad.push(p.id + ':' + id);
    }
    assert(bad.length === 0, 'every kit id is in the ability pool' + (bad.length ? ' (bad: ' + bad.join(', ') + ')' : ''));
    // The comment must not claim the engine fights with the kit.
    const k = src.match(/apAbilityKit: function[\s\S]{0,400}/);
    assert(!/they fight like players/i.test(k ? k[0] : '') || /does not/i.test(src),
      'apAbilityKit comment no longer claims engine use it does not have');
  }

  section('3. apFavor() is wired at runtime');
  {
    // Internal favor reads route through the public getter.
    const reads = (src.match(/this\.apFavor\(\)/g) || []).length;
    assert(reads >= 3, 'apFavor() has runtime call sites inside the module (' + reads + ' found)');
    assert(Game.apFavor() === 0, 'apFavor() reads 0 initially');
    Game.apAdjustFavor(25, 'test');
    assert(Game.apFavor() === 25, 'apFavor() reflects adjustments');
    Game.apState().fanClubs = { fight: 0, survival: 0, social: 0, showbiz: 0 }; Game.apSyncFavor(); // per-lane reset (audit-shows 2026-10-09)
  }

  section('4. feed/gossip knowledge gates hold');
  {
    RNG.reset(31337);
    const s = H.fresh(50);
    Game.state.systemArrived = true;
    Game.state.waveKills = { 1: 10 };
    Game.isSafeTile = () => false;
    const ap = Game.apState();
    // Met but NOT known: sleeve name may show (codex-consistent), alien truth must not.
    ap.met['vex_marlowe'] = { encounters: 3, bond: 0, lastOutcome: 'lost', lastDay: 49 };
    ap.lastGossipDay = -999; ap.lastFeedDay = -999;
    H.clearLog();
    for (let i = 0; i < 30; i++) {
      RNG.reset((i * 40503 + 11) >>> 0 || 1);
      try { Game.apVillageGossip(); } catch (e) {}
      try { Game.apEventFeed(); } catch (e) {}
    }
    const t = H.allText();
    const per = Game.apPersona('vex_marlowe');
    assert(t.indexOf(per.title) < 0, 'gossip/feed never leaks the alien title pre-reveal');
    assert(t.indexOf(per.species) < 0, 'gossip/feed never leaks the species pre-reveal');
    // The word "alien" must not appear as a truth-claim pre-reveal in these messages
    const alienClaims = t.split('\n').filter(l => /alien/i.test(l) && !/alien players/i.test(l));
    assert(alienClaims.length === 0, 'no raw "alien" truth-claims in gossip/feed pre-reveal');
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log(' - ' + f)); }
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
