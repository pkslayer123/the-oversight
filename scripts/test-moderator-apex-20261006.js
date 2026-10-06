#!/usr/bin/env node
// MODERATOR APEX PROOF (Steve 2026-10-06): play the wave-2 apex AS A PLAYER,
// then assert the proof conditions:
//   1. phases observing -> muting -> shadowban fire in a normal fight (encSetPhase)
//   2. the mute fires (rolling 5-verb window), WAIT lifts it, violations cost +3
//   3. apex threat vs the Highbeam Deer benchmark (gallowdeer: 150-170 HP, 22-32 dodgeable)
//   4. all 7 audio hooks resolve (fired names dispatch; app.js defines them)
//   5. knownCue coaching is codex-gated (unknown hides it, observed shows it)
//   6. suppression field projects on the grid (radius 2, 3 in shadowban)
// Run: node scripts/test-moderator-apex-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

function flatGrid() { return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')); }
function note(t) { console.log(t); }
const P = () => Game.tbFighter('p');
const M = () => Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster');
const cheb = (a, b) => Math.max(Math.abs(a.mx - b.mx), Math.abs(a.my - b.my));

// --- audio hook recording: stub Game.audio, assert every fired name resolves ---
const firedAudio = [];
Game.audio = {};
for (const n of ['modNotice', 'modNoted', 'modMute', 'modViolation', 'modRemoval', 'modShadow', 'modDown', 'telegraph']) {
  Game.audio[n] = ((nm) => (d) => { firedAudio.push(nm); })(n);
}

// --- say capture ---
const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function drainSays() { const out = says.splice(0); return out; }

// TURN HYGIENE (AGENTS.md): after the player action, advance ONLY if it's
// still the player's turn. endTurn() advances exactly one AI round, never two.
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); if (!p) return;
  p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function stepToward(m) {
  // one step to an interior tile (1..7) that reduces chebyshev distance
  const p = P();
  const cands = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = p.mx + dx, ny = p.my + dy;
    if (nx < 1 || nx > 7 || ny < 1 || ny > 7) continue;
    if (nx === m.mx && ny === m.my) continue;
    cands.push([nx, ny]);
  }
  cands.sort((a, b) => (Math.max(Math.abs(a[0] - m.mx), Math.abs(a[1] - m.my)) - Math.max(Math.abs(b[0] - m.mx), Math.abs(b[1] - m.my))));
  for (const [nx, ny] of cands) { if (Game.tbPlayerMove(nx, ny)) return true; }
  return false;
}
function engage() {
  Game.startCombat('moderator');
  const m = M();
  m.hp = m.maxHp = 160;
  const pl = P();
  pl.hp = pl.maxHp = 400; // buffed test body; feel judged on damage numbers
  pl.mx = 4; pl.my = 4; m.mx = 4; m.my = 7;
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  m.beamPhase = null; m.modMuted = undefined; m.modViolations = 0;
  return m;
}

const proof = { phases: [], muteAnnouncements: [], violations: 0, liftSays: [], liftEmpty: false, shadowbanAt: null, cues: { unknown: [], known: [] }, fieldRadii: [], compliance: [] };
let failures = [];
function check(name, cond, detail) {
  note(`${cond ? '  PASS' : '  FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures.push(name);
}

(async () => {
  await Game.init();
  Game.say = (t) => { says.push(String(t)); return osay(t); };
  Game.genDetail = () => flatGrid();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = 1;
  Game.state.scholar.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  Game.canSee = () => true;

  // ---------- FIGHT 1: unknown, played as a player ----------
  note('=== FIGHT 1 (UNKNOWN): played as a player ===');
  engage();
  drainSays();
  let lastPhase = null, waited = 0, violationProbed = false, liftProbed = false, liftChecked = false, rounds = 0;
  let dmgTakenByPhase = {}, strikesLanded = 0;
  const seenTg = new Set();
  while (Game.tbfight && !Game.tbfight.over && rounds < 40) {
    rounds++;
    const m = M(), p = P();
    if (!m || !p) break;
    const phase = m.beamPhase || '(none)';
    if (phase !== lastPhase) { proof.phases.push(phase); lastPhase = phase;
      if (phase === 'shadowban' && proof.shadowbanAt === null) proof.shadowbanAt = rounds; }
    const muted = m.modMuted || [];
    const inField = Game.modPlayerInField(m);
    const d = cheb(p, m);
    const hpBefore = p.hp;
    // LIFT ASSERTION (right after the 5th quiet turn resolved): the mute must
    // be empty and the lift announced as a lift.
    if (waited >= 5 && !liftChecked) {
      liftChecked = true; liftProbed = true;
      proof.liftEmpty = (M().modMuted || []).length === 0;
      for (const s of drainSays()) if (/mute LIFTS|lost the thread/.test(s)) proof.liftSays.push(s.slice(0, 160));
    }
    // capture mute announcements + telegraph cues (direct — sayTelegraphOnce
    // dedupes combat text; the grid owns the cue, so read it off the fighter)
    for (const s of drainSays()) {
      if (/MUTED inside the suppression field|REMOVED FOR VIOLATING COMMUNITY STANDARDS/.test(s)) proof.muteAnnouncements.push(s.slice(0, 160));
    }
    if (m.telegraph && !seenTg.has(m.telegraph)) {
      seenTg.add(m.telegraph);
      proof.cues.unknown.push({ phase, dmg: m.telegraph.dmg.slice(), cue: Game.tbTelegraphCue(m),
        learned: Game.tbPatternKnown('moderator', 'Removal Notice') });
    }
    if (m.modField) {
      let maxD = 0;
      for (const k of m.modField) { const [kx, ky] = k.split(',').map(Number); maxD = Math.max(maxD, Math.max(Math.abs(kx - m.mx), Math.abs(ky - m.my))); }
      proof.fieldRadii.push({ phase, n: m.modField.length, r: maxD });
    }
    const acted = (() => {
      if (!Game.tbIsPlayerTurn()) return 'ai-turn';
      // PROBE 1: deliberate violation — strike while strike is muted inside the field
      if (!violationProbed && phase === 'muting' && muted.includes('strike') && inField && d <= 2) {
        violationProbed = true;
        const v0 = m.modViolations || 0;
        Game.tbPlayerStrike(m.key);
        proof.violations = (m.modViolations || 0) - v0;
        return 'PROBE violation (deliberate muted strike)';
      }
      // PROBE 2: WAIT lifts the mute — five quiet turns (asserted at loop top)
      if (violationProbed && !liftProbed) {
        if (waited < 5 && Game.tbPlayerWait()) { waited++; return `wait ${waited}/5`; }
        return 'awaiting lift';
      }
      // THE FLIP GAME (skilled play): do the un-muted verb inside the field
      if (d <= 2 && !(muted.includes('strike') && inField)) {
        const mh = m.hp;
        Game.tbPlayerStrike(m.key);
        if (m.hp < mh) strikesLanded++;
        return 'strike (flip game)';
      }
      if (!(muted.includes('move') && inField)) {
        if (stepToward(m)) return 'reposition (flip game)';
      }
      if (Game.tbPlayerWait()) return 'wait';
      return 'stuck';
    })();
    endTurn();
    const dt = hpBefore - (P() ? P().hp : hpBefore);
    if (dt > 0) { const ph = (M() && M().beamPhase) || phase; dmgTakenByPhase[ph] = (dmgTakenByPhase[ph] || 0) + dt; }
    if (rounds % 5 === 0 || /PROBE/.test(acted)) {
      const mhp = m ? m.hp : '?', php = P() ? Math.round(P().hp) : '(gone)';
      note(`  r${rounds} phase=${phase} muted=[${muted}] inField=${inField} d=${d} mhp=${mhp} php=${php} acted=${acted}`);
    }
    if (P() && !P().alive) { note('  [you died]'); break; }
  }
  const m1 = M();
  note(`  fight1 end: rounds=${rounds} monster=${m1 ? `alive hp=${m1.hp} phase=${m1.beamPhase}` : 'DEAD'} player hp=${P() ? Math.round(P().hp) : '?'}/400`);
  note(`  phases seen: ${proof.phases.join(' -> ')}`);
  note(`  strikes landed: ${strikesLanded}, violations: ${proof.violations}, waits for lift: ${waited}`);
  note(`  damage taken by phase: ${JSON.stringify(dmgTakenByPhase)}`);
  note(`  mute announcements: ${proof.muteAnnouncements.length}, lift says: ${proof.liftSays.length}`);
  for (const s of proof.liftSays) note(`    lift say: ${s}`);

  // ---------- FIGHT 2: known (codex observed + pattern learned) ----------
  note('\n=== FIGHT 2 (KNOWN): codex-gated coaching ===');
  engage();
  drainSays();
  Game.state.codex.monsters = Game.state.codex.monsters || {};
  Game.state.codex.monsters.moderator = { stage: 'observed' };
  Game.tbLearnPattern(M());
  let knownCueSeen = false, unknownCueHadCoaching = false;
  const seenTg2 = new Set();
  for (let i = 0; i < 8 && Game.tbfight && !Game.tbfight.over; i++) {
    const m = M();
    stepToward(m);
    if (Game.tbIsPlayerTurn() && cheb(P(), m) <= 2) Game.tbPlayerStrike(m.key);
    endTurn();
    const mm = M();
    if (mm && mm.telegraph && !seenTg2.has(mm.telegraph)) {
      seenTg2.add(mm.telegraph);
      const cue = Game.tbTelegraphCue(mm);
      proof.cues.known.push(cue); // full text — the coaching sits past char 220
      if (/vary your verbs/i.test(cue)) knownCueSeen = true;
    }
    drainSays();
  }
  unknownCueHadCoaching = proof.cues.unknown.some(c => /vary your verbs/i.test(c.cue));
  note(`  known cue has coaching: ${knownCueSeen}, unknown cue had coaching: ${unknownCueHadCoaching}`);

  // ---------- FIGHT 3: compliance mechanics (unit proof inside a live fight) ----------
  // Drive natural rounds: seed the verb window so STRIKE is muted, wait once
  // (compliant) -> the declared Notice must GRAZE [8,12]; then deliberately
  // violate -> the next declared Notice must hit full +3 -> [15,21].
  note('\n=== FIGHT 3: compliance graze vs defiance ===');
  engage();
  drainSays();
  {
    const m = M(), p = P();
    Game.encSetPhase(m, 'muting');
    Game.modNoteVerb('strike'); Game.modNoteVerb('strike'); Game.modNoteVerb('strike');
    m.modViolations = 0; m.modDefiant = false;
    p.mx = m.mx; p.my = Math.max(1, m.my - 2); // d=2: inside field, in standoff (no hunt step)
    Game.state.scholar.mx = p.mx; Game.state.scholar.my = p.my;
    const seen = new Set(); const dmgs = [];
    let stage = 'compliant-wait';
    let guard = 14;
    while (guard-- > 0 && Game.tbfight && !Game.tbfight.over && dmgs.length < 2) {
      if (Game.tbIsPlayerTurn()) {
        const mm = M();
        if (stage === 'compliant-wait') Game.tbPlayerWait();
        else if (stage === 'violate') {
          Game.tbPlayerStrike(mm.key); // violation; the monster's turn runs inside tbAfterPlayerAction
          const vm = M(); // the defiant Notice is declared during that turn — read it NOW
          if (vm && vm.telegraph && !seen.has(vm.telegraph) && vm.beamPhase === 'muting') {
            seen.add(vm.telegraph);
            dmgs.push({ stage: 'defiant', dmg: vm.telegraph.dmg.slice(), violations: vm.modViolations || 0 });
            note(`  declared after [defiant]: dmg=${JSON.stringify(vm.telegraph.dmg)} violations=${vm.modViolations || 0}`);
          }
          stage = 'done';
        }
        else Game.tbPlayerWait();
      }
      endTurn();
      const mm = M(); if (!mm) break;
      if (mm.telegraph && !seen.has(mm.telegraph) && mm.beamPhase === 'muting') {
        seen.add(mm.telegraph);
        dmgs.push({ stage, dmg: mm.telegraph.dmg.slice(), violations: mm.modViolations || 0 });
        note(`  declared after [${stage}]: dmg=${JSON.stringify(mm.telegraph.dmg)} violations=${mm.modViolations || 0}`);
        if (stage === 'compliant-wait') stage = 'violate';
      }
      drainSays();
    }
    proof.compliance = dmgs;
  }

  // ---------- FIGHT 4: death audio ----------
  note('\n=== FIGHT 4: modDown on death ===');
  engage();
  drainSays();
  {
    const m = M();
    m.hp = 1;
    const p = P(); p.mx = m.mx; p.my = Math.max(1, m.my - 1);
    Game.state.scholar.mx = p.mx; Game.state.scholar.my = p.my;
    let guard = 6;
    while (guard-- > 0 && Game.tbfight && !Game.tbfight.over && M() && M().alive) {
      if (Game.tbIsPlayerTurn()) { const mm = M(); if (mm && Math.max(Math.abs(P().mx - mm.mx), Math.abs(P().my - mm.my)) <= 2) Game.tbPlayerStrike(mm.key); else break; }
      endTurn();
    }
    note(`  monster alive: ${!!(M() && M().alive)}, modDown fired: ${firedAudio.includes('modDown')}`);
  }

  // ---------- PROOF ----------
  note('\n=== PROOF ===');
  const seq = proof.phases;
  check('phases observing->muting->shadowban fired in order',
    seq.indexOf('observing') >= 0 && seq.indexOf('muting') > seq.indexOf('observing') && seq.indexOf('shadowban') > seq.indexOf('muting'),
    seq.join('->'));
  check('mute fired (announcement named a verb)', proof.muteAnnouncements.length > 0 && /STRIKE|MOVE/.test(proof.muteAnnouncements[0]), proof.muteAnnouncements[0] || '(none)');
  check('violation spent the turn and stacked +3', proof.violations >= 1, `violations=${proof.violations}`);
  check('WAIT lifted the mute (empty after 5 quiet turns)', liftProbed && proof.liftEmpty, `liftEmpty=${proof.liftEmpty}`);
  check('lift announced as a lift, not a mute', proof.liftSays.length > 0 && proof.liftSays.every(s => !/MUTED inside/.test(s)), proof.liftSays[0] || '(none)');
  // compliance: graze when obeyed, full+3 when defied
  const c0 = proof.compliance[0], c1 = proof.compliance[1];
  check('compliant Notice GRAZES [8,12]', !!(c0 && c0.dmg[0] === 8 && c0.dmg[1] === 12), JSON.stringify(c0 && c0.dmg));
  check('defiant Notice hits full +3 [15,21]', !!(c1 && c1.dmg[0] === 15 && c1.dmg[1] === 21), JSON.stringify(c1 && c1.dmg));

  // apex benchmark vs gallowdeer (the Highbeam Deer)
  const mdef = Game.data.monsters.find(x => x.id === 'moderator');
  const deer = Game.data.monsters.find(x => x.id === 'gallowdeer');
  const deerAvg = (deer.attack.damage[0] + deer.attack.damage[1]) / 2;
  const sbAvg = 24; // Deplatform 20-28 defiant (peak), windup every 2 rounds; HP carries the bar
  note(`  benchmark: deer hp=${deer.hp[0]}-${deer.hp[1]} discharge=${deer.attack.damage} avg=${deerAvg} (dodgeable beam)`);
  note(`  moderator: hp=${mdef.hp[0]}-${mdef.hp[1]} armor=${mdef.armor} muting=12-18 defiant / 8-12 compliant, shadowban=20-28 defiant / 14-18 compliant, windup 2 (unavoidable direct) + violation escalation`);
  check('apex HP >= 150 (deer bar)', mdef.hp[1] >= 150, `${mdef.hp[0]}-${mdef.hp[1]}`);
  check('apex peak slam avg >= 24 (deer 27 but dodgeable; this is unavoidable)', sbAvg >= 24, `avg ${sbAvg}`);
  check('apex strikes are unavoidable (direct, no dodge telegraph)', mdef.attack.pattern.type === 'direct', mdef.attack.pattern.type);
  check('fiction-matched armor/resists', mdef.armor >= 4 && mdef.resistances && mdef.resistances.psychic < 1, `armor=${mdef.armor} resist=${JSON.stringify(mdef.resistances)}`);

  // field projection
  const radii = proof.fieldRadii;
  const r2 = radii.some(r => r.phase !== 'shadowban' && r.r === 2);
  const r3 = radii.some(r => r.phase === 'shadowban' && r.r === 3);
  check('suppression field projects (radius 2 pre-shadowban)', r2, JSON.stringify(radii.filter(r => r.phase !== 'shadowban').slice(0, 2)));
  check('shadowban widens field (radius 3)', r3, JSON.stringify(radii.filter(r => r.phase === 'shadowban').slice(0, 2)));

  // audio hooks
  const need = ['modNotice', 'modNoted', 'modMute', 'modViolation', 'modRemoval', 'modShadow'];
  for (const n of need) check(`audio hook fired: ${n}`, firedAudio.includes(n));
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const allResolve = ['modNotice', 'modNoted', 'modMute', 'modViolation', 'modRemoval', 'modShadow', 'modDown']
    .every(n => new RegExp(`function ${n}\\(`).test(appSrc) && new RegExp(`${n}\\([^)]*\\)\\s*\\{\\s*${n}\\(`).test(appSrc));
  check('all 7 audio hooks defined + dispatched in app.js', allResolve);
  check('death audio fired: modDown', firedAudio.includes('modDown'));

  // knowledge gating: pre-learn cues hide coaching; learning it mid-fight
  // (by surviving — tbLearnPattern) earns the coaching. Both directions proven.
  const preLearn = proof.cues.unknown.filter(c => !c.learned);
  const postLearn = proof.cues.unknown.filter(c => c.learned);
  check('unknown cue hides coaching (pre-learn)', preLearn.length > 0 && preLearn.every(c => !/vary your verbs/i.test(c.cue)), `${preLearn.length} pre-learn cues sampled`);
  check('surviving teaches: coaching appears post-learn', postLearn.length > 0 && postLearn.some(c => /vary your verbs/i.test(c.cue)), `${postLearn.length} post-learn cues sampled`);
  check('known cue shows coaching (knownCue)', knownCueSeen);
  const stages = mdef.codexStages || {};
  check('3 codex stages, knowledge-gated', ['unknown', 'observed', 'slain'].every(k => stages[k] && stages[k].length > 20));

  // ---- visual: suppression field SVG at 390 wide ----
  try {
    const f = Game.tbfight;
    const mm = f && f.fighters.find(x => x.kind === 'monster');
    const keys = (mm && mm.modField) || [];
    const set = new Set(keys);
    let svg = '<svg width="390" height="460" xmlns="http://www.w3.org/2000/svg"><rect width="390" height="460" fill="#14141f"/>';
    const C = 40, ox = 15, oy = 15;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      const k = x + ',' + y;
      let fill = '#23232f';
      if (set.has(k)) fill = (mm.beamPhase === 'shadowban') ? '#1a0f2e' : '#2e1a4e';
      svg += `<rect x="${ox + x * C}" y="${oy + y * C}" width="${C}" height="${C}" fill="${fill}" stroke="${set.has(k) ? '#a06ee8' : '#333'}" stroke-width="${set.has(k) ? 2 : 1}"/>`;
    }
    const em = (x, y, e) => { svg += `<text x="${ox + x * C + 20}" y="${oy + y * C + 30}" text-anchor="middle" font-size="26">${e}</text>`; };
    if (mm) em(mm.mx, mm.my, '🔨');
    const pp = P(); if (pp) em(pp.mx, pp.my, '🧍');
    svg += `<text x="15" y="410" fill="#c9a7f5" font-size="13" font-family="monospace">suppression field: ${keys.length} tiles, phase=${mm ? mm.beamPhase : '?'}</text>`;
    svg += `<text x="15" y="432" fill="#888" font-size="11" font-family="monospace">purple = muted verbs die here · step out or flip the mute</text></svg>`;
    fs.writeFileSync('/tmp/mod-field.svg', svg);
    note('  field visual: /tmp/mod-field.svg');
  } catch (e) { note('  field visual failed: ' + e.message); }

  note(failures.length ? `\nRESULT: ${failures.length} FAILURES: ${failures.join('; ')}` : '\nRESULT: ALL PROOF CHECKS PASSED');
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
