// WAVE-2 FIXES + WARRANTY CALLER (Steve 2026-10-06).
// 1. delegate_beast: no duplicate audio (delegateAnnounce/delegateCharge/
//    delegateCircle aliased the manager* synths and played them 2-3x per beat)
// 2. service_mimic: fire-suppression line deduped via saySituationOnce
// 3. service_mimic: data knownCue now surfaces (codex-gated) in the watching beat
// 4. tbBatch4Cue: dead service_mimic/contract_golem branches removed
// 5. warranty_caller (NEW wave-2 rush monster): dial→ring→pitch→redial;
//    ring tell is knowledge-gated; moving 2+ tiles drops the call;
//    pain = bad connection = redial; it fights (deals damage).
// Run: node scripts/test-wave2-fixes-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const MDEFS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function flatGrid() { return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')); }
const said = [];
let firedAudio = [];
const P = () => Game.tbFighter('p');
const M = () => Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster');
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); if (p) { p.moveLeft = 0; p.acted = true; }
  Game.tbAfterPlayerAction();
}
function startFight(id, px, py) {
  said.length = 0; firedAudio = [];
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genDetail = () => flatGrid();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.dayPart = 1;
  const s = Game.state.scholar; s.health = 500;
  Game.canSee = () => true;
  Game.startCombat(id);
  const m = M(); if (!m) return null;
  m.hp = m.maxHp = 4000;
  const pl = P(); pl.hp = pl.maxHp = 9000;
  pl.mx = px !== undefined ? px : Math.max(0, m.mx - 3); pl.my = py !== undefined ? py : m.my;
  s.mx = pl.mx; s.my = pl.my;
  return m;
}
function learn(id) {
  const d = MDEFS.find(x => x.id === id);
  Game.state.codex = Game.state.codex || {}; Game.state.codex.monsters = Game.state.codex.monsters || {};
  const c = (Game.state.codex.monsters[id] = {});
  c.patterns = {}; c.patterns[d.attack.name] = 'test';
}

(async () => {
  await Game.init();
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); return origSay(t); };
  const origAE = Game.audioEvent.bind(Game);
  Game.audioEvent = (n, o) => { firedAudio.push(String(n)); return origAE(n, o); };

  console.log('\n== 1: delegate_beast audio dedup ==');
  {
    const m = startFight('delegate_beast');
    ok(!!m, 'beast fight starts');
    // drive two full cycles: circle -> announce -> charge -> debrief
    for (let i = 0; i < 24 && Game.tbfight && !Game.tbfight.over; i++) endTurn();
    const ann = firedAudio.filter(a => a === 'managerAnnounce').length;
    const dAnn = firedAudio.filter(a => a === 'delegateAnnounce').length;
    const dChg = firedAudio.filter(a => a === 'delegateCharge').length;
    const dCir = firedAudio.filter(a => a === 'delegateCircle').length;
    ok(dAnn === 0, 'delegateAnnounce never fires (alias of managerAnnounce)', 'fired ' + dAnn);
    ok(dChg === 0, 'delegateCharge never fires (alias of managerCharge)', 'fired ' + dChg);
    ok(dCir === 0, 'delegateCircle never fires (bespoke branch owns the circle)', 'fired ' + dCir);
    ok(ann >= 1, 'managerAnnounce still fires on declare', 'fired ' + ann);
    ok(firedAudio.includes('managerCharge'), 'managerCharge fires on resolve');
    // one circle sound per cycle: managerCircle count <= charge cycles + 1
    const cir = firedAudio.filter(a => a === 'managerCircle').length;
    const chg = firedAudio.filter(a => a === 'managerCharge').length;
    ok(cir <= chg + 1, `one circle beat per cycle (circles=${cir}, charges=${chg})`);
  }

  console.log('\n== 2: service_mimic fire-suppression dedup ==');
  {
    const m = startFight('service_mimic');
    // put fire next to the player and hold still for 6 turns
    const g = Game.genDetail(); const pl = P();
    // genDetail is stubbed to flatGrid; override per-call won't persist — instead
    // patch the grid via Game.cellProps? Simplest: stub genDetail to include fire.
    Game.genDetail = () => { const gr = flatGrid(); gr[pl.my][pl.mx] = 'fire'; return gr; };
    said.length = 0;
    for (let i = 0; i < 6; i++) endTurn();
    const n = said.filter(l => /experiencing— experiencing/.test(l)).length;
    ok(n === 1, 'fire-suppression line speaks once while the fire stays put', 'spoke ' + n + 'x');
  }

  console.log('\n== 3: service_mimic knownCue surfaces when learned ==');
  {
    const kc = MDEFS.find(x => x.id === 'service_mimic').encounter.knownCue;
    // unknown: watching lines carry no coaching
    let m = startFight('service_mimic');
    M().smWatch = 3; // deterministic: guarantee watching beats (harness only)
    said.length = 0;
    for (let i = 0; i < 3 && M() && M().beamPhase !== 'dialing'; i++) endTurn();
    const unknownSaid = said.join('\n');
    ok(unknownSaid.includes('watching') || /Hello\?|important to us|fear volumes/.test(unknownSaid), 'unknown mimic: watching beats ran');
    ok(!unknownSaid.includes(kc), 'unknown mimic: no knownCue in watching lines');
    // known: coaching appears
    m = startFight('service_mimic'); learn('service_mimic');
    M().smWatch = 3;
    said.length = 0;
    for (let i = 0; i < 3 && M() && M().beamPhase !== 'dialing'; i++) endTurn();
    const knownSaid = said.join('\n');
    ok(knownSaid.includes(kc), 'learned mimic: knownCue surfaces in watching beat');
  }

  console.log('\n== 4: tbBatch4Cue dead branches gone ==');
  {
    const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
    ok(!/mid === 'service_mimic'\) \{/.test(src), 'no service_mimic branch in tbBatch4Cue');
    ok(!/mid === 'contract_golem'\) \{/.test(src), 'no contract_golem branch in tbBatch4Cue');
    // the 4 live branches still work
    const m = startFight('review_drone');
    for (let i = 0; i < 6 && !(M() && M().telegraph); i++) endTurn();
    const cue = M() && M().telegraph ? Game.tbTelegraphCue(M()) : '';
    ok(/CORRECTIVE BEAM/.test(cue), 'drone batch4 cue intact');
  }

  console.log('\n== 5: warranty_caller — the call ==');
  {
    const d = MDEFS.find(x => x.id === 'warranty_caller');
    ok(!!d && d.wave === 2, 'def exists, wave 2');
    ok(d.attack.pattern.type === 'rush', 'pattern rush');
    ok(!!(d.encounter && d.encounter.knownCue && d.encounter.aggroAudio), 'encounter complete (aggroAudio + knownCue)');
    const m = startFight('warranty_caller');
    ok(!!m, 'fight starts');
    ok(typeof Game.wcIs === 'function' && Game.wcIs(m), 'wcIs predicate');
    // harness reset: the ambush turn inside startCombat already ran a
    // dial->ring with pre-placement positions; restart the call cleanly.
    m.beamPhase = null; m.wcDialPos = null; m.wcLastHp = m.hp;
    said.length = 0;
    // drive: dial -> ring -> pitch -> redial, player holds still -> pitch hits
    const phases = [];
    const p0 = P().hp;
    for (let i = 0; i < 12 && Game.tbfight && !Game.tbfight.over; i++) {
      const ph = M() && M().beamPhase;
      if (ph && phases[phases.length - 1] !== ph) phases.push(ph);
      endTurn();
    }
    ok(phases.includes('dial') && phases.includes('ring') && phases.includes('pitch') && phases.includes('redial'),
      'phase cycle dial→ring→pitch→redial', phases.join('→'));
    ok(p0 - P().hp > 0, 'it fights: dealt damage to a stationary player', 'dealt ' + (p0 - P().hp));
    // the ring tell is dread when unknown (no coaching leak)
    const kc = d.encounter.knownCue;
    const ringLines = said.filter(l => /ringing for you/.test(l));
    ok(ringLines.length > 0, 'unknown ring tell spoken', 'found ' + ringLines.length);
    ok(ringLines.length > 0 && !ringLines.join(' ').includes(kc), 'unknown ring: dread, no coaching');
  }

  console.log('\n== 6: warranty_caller — moving drops the call ==');
  {
    const m = startFight('warranty_caller');
    m.beamPhase = null; m.wcDialPos = null; m.wcLastHp = m.hp;
    said.length = 0;
    // wait for ring phase, then move 3 tiles perpendicular (away from the dial spot)
    for (let i = 0; i < 6 && M() && M().beamPhase !== 'ring'; i++) endTurn();
    ok(M() && M().beamPhase === 'ring', 'reached ring phase');
    const dialPos = M().wcDialPos;
    ok(!!dialPos, 'dial position recorded');
    if (Game.tbIsPlayerTurn()) {
      const pl = P(); pl.moveLeft = 9;
      for (let k = 0; k < 3; k++) { if (!Game.tbPlayerMove(pl.mx, pl.my + 1)) break; }
      const p2 = P(); p2.moveLeft = 0; p2.acted = true; Game.tbAfterPlayerAction();
    }
    const moved = Math.max(Math.abs(P().mx - dialPos.x), Math.abs(P().my - dialPos.y));
    ok(moved >= 2, 'player moved 2+ tiles from dial position', 'moved ' + moved);
    endTurn(); // monster turn: ring -> dropped
    ok(M() && M().beamPhase === 'redial', 'call dropped -> redial', 'phase=' + (M() && M().beamPhase));
    ok(/CALL DROPPED/.test(said.join('\n')), 'call-drop narrated');
  }

  console.log('\n== 7: warranty_caller — knowledge gating + pain ==');
  {
    const d = MDEFS.find(x => x.id === 'warranty_caller');
    const kc = d.encounter.knownCue;
    const m = startFight('warranty_caller'); learn('warranty_caller');
    m.beamPhase = null; m.wcDialPos = null; m.wcLastHp = m.hp;
    said.length = 0;
    for (let i = 0; i < 6 && M() && M().beamPhase !== 'pitch'; i++) endTurn();
    ok(M() && M().beamPhase === 'pitch', 'reached pitch (ring ran)');
    ok(said.join('\n').includes(kc), 'learned: knownCue coaching in the ring tell');
    // pain = bad connection: hurt it during ring, it redials instead of pitching
    const m2 = startFight('warranty_caller');
    m2.beamPhase = null; m2.wcDialPos = null; m2.wcLastHp = m2.hp;
    said.length = 0;
    for (let i = 0; i < 6 && M() && M().beamPhase !== 'ring'; i++) endTurn();
    ok(M() && M().beamPhase === 'ring', 'at ring phase');
    M().hp -= 10; // pain
    ok(Game.tbIsPlayerTurn(), 'player turn before pain response');
    endTurn();
    ok(M() && M().beamPhase === 'redial', 'pain -> bad connection -> redial', 'phase=' + (M() && M().beamPhase));
    ok(/BAD CONNECTION/.test(said.join('\n')), 'bad connection narrated');
  }

  console.log(`\nasserts: pass=${pass} fail=${fail}`);
  process.exit(fail ? 1 : 0);
})();
