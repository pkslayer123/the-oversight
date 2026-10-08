// BREAK-IT: beam damage honesty (Steve 2026-10-08).
// ATTACKS:
//   1. apBeamHit('player', ...) must damage the ENGINE's player fighter ('p'),
//      not silently whiff on a 'player' key that doesn't exist (the
//      2026-10-08 engineKey fix — re-verify it holds).
//   2. Resistance math: 0 pieces ~ lethal (90-110% maxHp); each piece x0.7.
//      Verify a 1-piece and 5-piece case against the formula.
//   3. apBeamResistPieces honesty: alien armor (beamResist) counts; bonded
//      sentimental ARMOR (bond>=25, equipped) counts; inventory-sitting
//      sentimental gear does NOT; weapons never count.
//   4. The pre-fight readout (apBeamResistText) fires once, only for a KNOWN
//      beam-user (held from 2026-10-08 — re-verify, plus pre-reveal silence).
// Seeded; deterministic assertions where the engine is deterministic.
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

function eligibleGame(seed) {
  RNG.reset(seed);
  const s = H.fresh(45);
  Game.state.systemArrived = true;
  Game.state.systemIntegration = 2;
  Game.isSafeTile = () => false;
  Game.state.waveKills = { 1: 10 };
  s.day = 45; s.hp = 100; s.maxHp = 100; s.health = 100;
  return s;
}
function endFight() {
  try { if (Game.tbfight && !Game.tbfight.over) Game.tbEnd('fled'); } catch (e) {}
  try { delete Game.state.alienEncounter; } catch (e) {}
}
function startFight(pid) {
  endFight(); H.clearLog();
  const ok = Game.apStartEncounter(pid);
  return ok && Game.tbfight && !Game.tbfight.over ? Game.tbfight : null;
}

async function main() {
  await H.boot();

  section('beam hits the engine player fighter (no silent whiff)');
  {
    eligibleGame(SEED);
    // Oversized HP pool: beam damage can exceed 100, and the engine clamps
    // at 0 — compare against an unclamped pool instead.
    Game.state.scholar.maxHp = 1000;
    Game.state.scholar.health = 1000;
    Game.apState().known['vex_marlowe'] = 'test';
    const f = startFight('vex_marlowe');
    assert(!!f, 'setup: vex fight live');
    const p = f.fighters.find(x => x.key === 'p');
    const hpBefore = p.hp;
    // No resistant gear: expect ~lethal (90-110% of maxHp = 900-1100).
    let dealt = 0;
    try { dealt = Game.apBeamHit('player', 0, 'test beam', { damageType: 'alien_beam' }); } catch (e) { console.log('  threw ' + e.message); }
    assert(p.hp < hpBefore, 'player fighter hp dropped (' + hpBefore + ' -> ' + p.hp + ')');
    assert(dealt === hpBefore - p.hp || (p.hp === 0 && dealt >= hpBefore),
      'reported damage matches hp delta (' + dealt + ', overkill clamps at 0)');
    assert(dealt >= 900 && dealt <= 1100, '0 pieces: nearly lethal, dealt ' + dealt + ' of maxHp 1000');
    assert(Game.state.scholar._beamHorrorSeen === true, 'horror beat fired on first unresisted hit');
    endFight();
  }

  section('resistance math: each piece x0.7');
  {
    eligibleGame(SEED + 1);
    Game.apState().known['vex_marlowe'] = 'test';
    const s = Game.state.scholar;
    // Equip ONE alien helm (beamResist) in the head slot.
    s.equipped = { head: { itemId: 'alien_helm', id: 'alien_helm' } };
    const pieces = Game.apBeamResistPieces();
    assert(pieces.length === 1 && pieces[0].source === 'alien', '1 alien piece counted (source alien)');
    assert(Game.apBeamResistLevel() === 'partial', 'level partial at 1 piece');
    const f = startFight('vex_marlowe');
    const p = f.fighters.find(x => x.key === 'p');
    const hpBefore = p.hp;
    const dealt = Game.apBeamHit('player', 0, 'test beam', { damageType: 'alien_beam' });
    // base = round(100 * (0.9 + r*0.2)) with seeded r; final = round(base*0.7)
    console.log('  dealt with 1 piece: ' + dealt + ' (hp ' + hpBefore + ' -> ' + p.hp + ')');
    assert(dealt >= Math.round(90 * 0.7) && dealt <= Math.round(110 * 0.7),
      '1 piece: damage in [63,77], got ' + dealt);
    endFight();
  }

  section('pieces honesty: bonded sentimental armor counts, inventory does not');
  {
    eligibleGame(SEED + 2);
    const s = Game.state.scholar;
    const items = Game.data.items || [];
    const sentArmor = items.find(it => it.class === 'sentimental' && it.armor);
    console.log('  sentimental armor in data: ' + (sentArmor && sentArmor.id));
    if (sentArmor) {
      // Equipped + bonded -> counts.
      s.equipped = { torso: { itemId: sentArmor.id, id: sentArmor.id, bond: 30 } };
      let n = Game.apBeamResistPieces().length;
      assert(n === 1, 'bonded (30) sentimental armor equipped counts');
      // Bond too low -> does not count.
      s.equipped = { torso: { itemId: sentArmor.id, id: sentArmor.id, bond: 10 } };
      n = Game.apBeamResistPieces().length;
      assert(n === 0, 'bond 10 (< 25) sentimental armor does NOT count');
      // Sitting in inventory -> does not count.
      s.equipped = {};
      s.inventory = [{ itemId: sentArmor.id, id: sentArmor.id, bond: 99 }];
      n = Game.apBeamResistPieces().length;
      assert(n === 0, 'bonded sentimental armor in INVENTORY does not count (must be equipped)');
    } else {
      console.log('  (no sentimental armor in items.json — skipping bonded checks)');
    }
    // Weapon never counts even if "bonded".
    const weapon = items.find(it => it.class === 'sentimental' && it.weapon);
    if (weapon) {
      const s2 = Game.state.scholar;
      s2.equipped = { torso: { itemId: weapon.id, id: weapon.id, bond: 99 } };
      const n = Game.apBeamResistPieces().length;
      assert(n === 0, 'sentimental WEAPON never counts as beam resistance');
      s2.equipped = {};
    }
  }

  section('pre-fight readout: once, known beam-users only');
  {
    eligibleGame(SEED + 3);
    const s = Game.state.scholar;
    // Unknown persona: no readout (would name the alien truth).
    delete Game.apState().known['dr_fenwick'];
    H.clearLog();
    Game.apStartEncounter('dr_fenwick');
    let said = H.sayText();
    assert(!/BEAM VULNERABILITY|Beam resistance/.test(said), 'pre-reveal: no beam readout for unknown persona');
    endFight();
    // Known beam-user: readout fires once.
    Game.apState().known['dr_fenwick'] = 'test';
    H.clearLog();
    Game.apStartEncounter('dr_fenwick');
    said = H.sayText();
    assert(/BEAM VULNERABILITY|Beam resistance/.test(said), 'known beam-user: readout fires');
    endFight();
    H.clearLog();
    Game.apStartEncounter('dr_fenwick');
    said = H.sayText();
    assert(!/BEAM VULNERABILITY|Beam resistance/.test(said), 'readout fires only once per player');
    endFight();
    // Old Tam has no beam: no readout even when known.
    Game.apState().known['old_tam'] = 'test';
    s._beamReadoutSeen = false;
    H.clearLog();
    Game.apStartEncounter('old_tam');
    said = H.sayText();
    assert(!/BEAM VULNERABILITY|Beam resistance/.test(said), 'old Tam (no beam): no readout');
    endFight();
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('HARNESS FAIL', e); process.exit(2); });
