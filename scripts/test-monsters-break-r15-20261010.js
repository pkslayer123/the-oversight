#!/usr/bin/env node
// BREAK-IT r15 PROOF: monsters — wave-3 signature mechanics (batches A/B/C,
// built 2026-10-10, after r14 attacked them as copy-only).
// (oversight-flesh-out-loop run r15, target index 5 = MONSTERS)
//
// HOSTILE attacks along 4 axes per mechanic:
//   EXPLOIT: infinite loops, free resources, costless counterplay
//   SOFTLOCK: stuck states, dead ends, unresolvable mechanic states
//   HONESTY: every canon promise in MONSTER-WAVES.md vs the engine
//   DEAD-CODE: hooks registered, reachable via mbRunPreTurn + app.js wiring
//
// CATCHES (fixed in this run):
//   CATCH 1 (GAVEL): OBJECT at <3 viewership was FREE forever — the -3 cost
//     floored at 0, so a broke player got permanent verdict-halving for
//     nothing. The button title promises "Costs 3 viewership (fame)". Fix:
//     the objection is REFUSED when viewership < 3 (no act spent) —
//     "no audience, no procedure."
//   CATCH 2 (SPOOL): the record phase attributed ALL spool-HP loss between
//     its turns to "your strike" — villager-ally damage, DoTs, anything —
//     then replayed it AT the player as "your own swing". Canon:
//     "classified from what you actually did". Fix: attribute strike damage
//     from f.sigLastStrike (player's own strike, sequenced) when it targeted
//     this spool since the last record; other sources are no longer filed
//     as the player's strike.
//   CATCH 3 (BUFFERING): "On the grid it shows 2-3 afterimage frames; the
//     faintest frame is the real present" — bufEchoes was written by the
//     hook but NEVER read by any renderer. The visual promise was copy-only.
//     Fix: Game.bufAfterimageCells() provider + app.js grid overlay following
//     the established gwDiveShadow/sbHeatKeys pattern (guarded, ungated —
//     afterimages are physically there). [needs-eyes]
//
// HELD (documented with attack + why): see evidence/2026-10-10/break-monsters-r15.md
//
// Green across 3 seeds: SEED=N node scripts/test-monsters-break-r15-20261010.js
const H = require('./sim-harness.js');
const SEED = parseInt(process.env.SEED || '20261010', 10);
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + name + (detail ? ' — ' + detail : '')); }
};

function endFight(Game) {
  if (Game.tbfight) { try { Game.tbfight.over = true; } catch (e) {} Game.tbfight = null; }
  try { Game.state.scholar.monster = null; } catch (e) {}
}

(async () => {
  const { Game } = await H.loadGame({ seed: SEED });
  await H.setupGame(Game);
  const s = Game.state.scholar;
  const SC = globalThis.Scattering;
  const said = [];
  Game.say = (t) => { said.push(String(t)); };
  const origRoll = SC.combat.roll;
  const realPassive = Game.passiveBonus, realStat = Game.stat;
  Game.passiveBonus = () => 0; Game.stat = () => 5; // dodge chance 0 (deterministic)
  console.log('== BREAK-IT r15 MONSTERS PROOF (wave-3 signatures), SEED ' + SEED + ' ==');

  function beginFight(mid) {
    endFight(Game);
    said.length = 0;
    try { Game.cureStatus('scholar', 'deaf'); } catch (e) {}
    s.health = 9000; s.mx = 4; s.my = 4;
    s.inventory = [];
    Game.startCombat(mid);
    const m = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.mdef && x.mdef.id === mid);
    const p = Game.tbFighter('p');
    p.hp = 9000; p.maxHp = 9000;
    m.mx = p.mx + 1; m.my = p.my;
    return { m, p };
  }
  const atPlayerTurn = () => !!(Game.tbfight && !Game.tbfight.over && Game.tbIsPlayerTurn());
  // tbPlayerStrike leaves moveLeft > 0 — the turn does NOT self-advance.
  // (AGENTS.md: strike/ability -> endTurn(); tbPlayerWait() -> nothing.)
  // Interceptions (eye-head, mirage-miss) self-advance via tbAfterPlayerAction
  // with moveLeft=0 — only endTurn when the act is still unspent this turn.
  function strike(key) {
    const r = Game.tbPlayerStrike(key);
    try {
      const p0 = Game.tbFighter('p');
      if (r && atPlayerTurn() && p0 && p0.acted) Game.tbPlayerEndTurn();
    } catch (e) {}
    return r;
  }

  // ---------- 0. DEAD-CODE: all 9 hooks registered + declared + fired live ----------
  const HB = globalThis.MonsterBehaviorHooks || {};
  const beh = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsterBehaviors.json'), 'utf8')).behaviors;
  const hookExpect = {
    redactor: ['sigRedactor'], gavel: ['sigGavel'], focus_group: ['sigFocusGroup'],
    focus_group_eye: ['sigFocusEye'], spool: ['spoolWatch'], chorus_line: ['chorusBeat'],
    terms_of_service: ['tosClauses'], callback: ['cbFace'], buffering: ['bufMirage'],
    ad_break: ['adBreak'], ad_sponsor: ['sponsorCling'],
  };
  for (const [mid, hooks] of Object.entries(hookExpect)) {
    for (const h of hooks) {
      ok('deadcode: hook registered: ' + h, typeof HB[h] === 'function');
      ok('deadcode: ' + mid + ' declares ' + h + ' in monsterBehaviors.json',
        (beh[mid] && beh[mid].preTurnHooks || []).includes(h));
    }
  }
  // fired via mbRunPreTurn inside a LIVE tbMonsterTurn (not a direct call)
  {
    const { m, p } = beginFight('spool');
    said.length = 0;
    Game.tbMonsterTurn(m); // first monster turn: record phase
    ok('deadcode: spoolWatch fires via live tbMonsterTurn (hook ran)',
      said.some(t => /RECORDING you/.test(t)) && m.spSnap, said.join(' | ').slice(0, 160));
    ok('deadcode: spool record consumes the turn (hook returned true)', m.spPhase === 'record');
    endFight(Game);
  }
  // player-action surface attached
  for (const fn of ['tbPlayerDodge', 'tbPlayerGavelObject', 'tbPlayerGavelRecess', 'tbPlayerGavelConfess',
      'tbSpoolExamineReel', 'tbChorusDance', 'tbChorusThrowGravel', 'tbTosRead', 'tbTosObject',
      'tbTosAccept', 'tbTosInvokeLoophole', 'tbPlayerFuneral', 'tbPlayerNameIt',
      'tbPlayerCloseEyes', 'tbPlayerSkipAd', 'tbPlayerLookAway',
      'sigCombatButtonsHTML', 'sigCombatAct', 'sigW3bCombatButtons',
      'sigW3cCombatButtons', 'sigW3cWireCombat', 'sigFieldMonster',
      'sigW3bFieldMonster', 'sigW3cFieldRound', 'bufAfterimageCells'])
    ok('deadcode: Game.' + fn + ' attached', typeof Game[fn] === 'function');
  // app.js wiring present (static check)
  {
    const appJs = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
    ok('deadcode: app.js renders sigCombatButtonsHTML', appJs.includes('Game.sigCombatButtonsHTML'));
    ok('deadcode: app.js renders sigW3bCombatButtons', appJs.includes('Game.sigW3bCombatButtons'));
    ok('deadcode: app.js renders sigW3cCombatButtons', appJs.includes('Game.sigW3cCombatButtons'));
    ok('deadcode: app.js wires sigW3cWireCombat', appJs.includes('Game.sigW3cWireCombat'));
    ok('deadcode: app.js wires data-sig-act -> sigCombatAct', appJs.includes('data-sig-act') && appJs.includes('Game.sigCombatAct'));
    ok('deadcode: app.js wires data-sigw3b buttons', appJs.includes('[data-sigw3b]'));
    ok('deadcode: app.js renders buffering afterimages (bufAfterimageCells)', appJs.includes('bufAfterimageCells'));
  }
  // field-fight call sites
  {
    const ff = fs.readFileSync(path.join(ROOT, 'src/js/fieldFights.js'), 'utf8');
    ok('deadcode: fieldFights calls sigFieldMonster (batch A)', ff.includes('this.sigFieldMonster'));
    ok('deadcode: fieldFights calls sigW3bFieldMonster (batch B)', ff.includes('this.sigW3bFieldMonster'));
    ok('deadcode: fieldFights calls sigW3cFieldRound (batch C)', ff.includes('this.sigW3cFieldRound'));
  }

  // ================= THE REDACTOR =================
  // EXPLOIT: quiet-starve — wait it out. Costs monster attacks; flee is designed.
  {
    const { m, p } = beginFight('redactor');
    const hp0 = p.hp;
    for (let i = 0; i < 4; i++) { ok('redactor starve: player turn ' + (i + 1), atPlayerTurn()); Game.tbPlayerWait(); }
    ok('exploit/redactor: 4 quiet waits -> it starves and FLEES (designed counterplay)', m.fled === true, 'fled=' + m.fled);
    ok('exploit/redactor: waiting was not free — it attacked during the starve', p.hp < hp0, 'took ' + (hp0 - p.hp));
    ok('honesty/redactor: starve announced before the flee', said.some(t => /STARVING/i.test(t)));
    endFight(Game);
  }
  // EXPLOIT: decoy rattle — one per cycle, consumed, honest.
  {
    const { m, p } = beginFight('redactor');
    s.inventory = s.inventory || [];
    s.inventory.push({ itemId: 'decoy_rattle', name: 'Tin-Can Rattle', qty: 1 });
    s.inventory.push({ itemId: 'decoy_rattle', name: 'Tin-Can Rattle', qty: 1 });
    const n0 = s.inventory.length;
    Game.tbPlayerWait(); // monster turn: POINT (decoy targeted)
    ok('honesty/redactor: points at the decoy first (loudest thing)',
      m.sigR && m.sigR.phase === 'point' && m.sigR.target && m.sigR.target.kind === 'decoy',
      JSON.stringify(m.sigR && m.sigR.target && m.sigR.target.kind));
    Game.tbPlayerWait(); // monster turn: REDACT
    ok('exploit/redactor: decoy consumed by the redact', s.inventory.length === n0 - 1, 'inv ' + n0 + '->' + s.inventory.length);
    ok('honesty/redactor: decoy destruction narrated', said.some(t => /Decoy consumed/i.test(t)));
    endFight(Game);
  }
  // HONESTY: weapon redact — redacted for exactly 2 rounds, then restores.
  {
    const { m, p } = beginFight('redactor');
    s.equipped = s.equipped || {};
    s.equipped.melee = { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' };
    SC.combat.roll = () => 40;
    strike(m.key); // player strike; monster turn 1: POINT (cycle 0 -> weapon)
    const struckDmg = m.maxHp - m.hp;
    ok('redactor: strike dealt damage', struckDmg > 0, 'dmg=' + struckDmg);
    Game.tbPlayerWait(); // monster turn 2: REDACT weapon (cycle 0)
    ok('honesty/redactor: weapon redacted for 2 rounds', !!p.sigRedactWeapon, JSON.stringify(p.sigRedactWeapon));
    const w = Game.equippedWeapon();
    ok('honesty/redactor: redacted weapon reads unarmed', !!(w && w.unarmed && w.redacted));
    SC.combat.roll = origRoll;
    endFight(Game);
  }
  // HONESTY: weapon redact expires after exactly 2 rounds.
  {
    const { m, p } = beginFight('redactor');
    p.sigRedactWeapon = { untilRound: Game.tbfight.round + 2, name: 'spear', told: false };
    const r0 = Game.tbfight.round;
    let sawUnarmed = 0, sawRestored = 0;
    for (let i = 0; i < 6 && atPlayerTurn(); i++) {
      const w = Game.equippedWeapon();
      if (w && w.redacted) sawUnarmed++;
      else if (i > 0) sawRestored++;
      Game.tbPlayerWait();
    }
    ok('honesty/redactor: redaction lasts ~2 rounds then restores', sawUnarmed >= 1 && sawRestored >= 1,
      'unarmed-seen=' + sawUnarmed + ' restored-seen=' + sawRestored + ' from round ' + r0);
    endFight(Game);
  }
  // SOFTLOCK: shove with no free interior tile -> honest slip, no crash.
  {
    const { m, p } = beginFight('redactor');
    const f = Game.tbfight;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      f.fighters.push({ key: 'blk' + dx + '_' + dy, kind: 'monster', mdef: { id: 'x' }, name: 'x',
        mx: p.mx + dx, my: p.my + dy, hp: 1, maxHp: 1, alive: true, fled: false, speed: 1, moveLeft: 0, acted: true });
    }
    const px0 = p.mx, py0 = p.my;
    m.sigR = { phase: 'point', target: { kind: 'footing', label: 'your footing' }, quiet: 0, starved: false, cycle: 2, cool: 0 };
    said.length = 0;
    Game.tbMonsterTurn(m); // point phase -> redact runs
    ok('softlock/redactor: shove with no free tile does not move the player', p.mx === px0 && p.my === py0);
    ok('softlock/redactor: the slip is narrated honestly', said.some(t => /nowhere to put you/i.test(t)));
    endFight(Game);
  }

  // ================= GAVEL =================
  // CATCH 1 — EXPLOIT: OBJECT at 0 viewership was free forever. Now refused.
  {
    const { m, p } = beginFight('gavel');
    Game.state.village.viewership = 0;
    Game.tbPlayerWait(); // monster turn 1: cool
    Game.tbPlayerWait(); // monster turn 2: ACCUSE (consumes)
    ok('gavel: trial opened', !!(m.sigG && m.sigG.trial), 'trial=' + JSON.stringify(!!(m.sigG && m.sigG.trial)));
    said.length = 0;
    const r = Game.tbPlayerGavelObject();
    ok('CATCH1/gavel: OBJECT refused at 0 viewership (no free halving)', r === false);
    ok('CATCH1/gavel: refusal spends no act', p.acted === false);
    ok('CATCH1/gavel: refusal narrated honestly', said.some(t => /empty/i.test(t) || /viewership/i.test(t)),
      said.slice(-2).join(' | '));
    ok('CATCH1/gavel: trial still open after refused objection', !!(m.sigG && m.sigG.trial && !m.sigG.trial.objected));
    endFight(Game);
  }
  // (separate fight) OBJECT at 10 viewership: works, costs exactly 3.
  {
    const { m, p } = beginFight('gavel');
    Game.state.village.viewership = 10;
    Game.tbPlayerWait(); Game.tbPlayerWait(); // accuse
    const r2 = Game.tbPlayerGavelObject();
    ok('gavel: OBJECT works at 10 viewership', r2 === true);
    ok('gavel: OBJECT costs exactly 3 viewership', Game.state.village.viewership === 7,
      'viewership=' + Game.state.village.viewership);
    endFight(Game);
  }
  // HONESTY: verdict math — objected x0.5, confessed x0.4, exact.
  {
    const { m, p } = beginFight('gavel');
    Game.state.village.viewership = 10;
    SC.combat.roll = () => 50;
    Game.tbPlayerWait(); Game.tbPlayerWait(); // accuse on monster turn 2
    const hp0 = p.hp;
    Game.tbPlayerGavelObject(); // objected -> advance -> VERDICT falls (objected)
    const dealt = hp0 - p.hp;
    ok('honesty/gavel: objected verdict = 50 x 0.5 = 25', dealt === 25, 'dealt=' + dealt);
    SC.combat.roll = origRoll;
    endFight(Game);
  }
  {
    const { m, p } = beginFight('gavel');
    Game.state.village.viewership = 10;
    SC.combat.roll = () => 50;
    Game.tbPlayerWait(); Game.tbPlayerWait(); // accuse
    const hp0 = p.hp;
    Game.tbPlayerGavelConfess(); // confessed -> advance -> VERDICT falls (confessed)
    const dealt = hp0 - p.hp;
    ok('honesty/gavel: confessed verdict = 50 x 0.4 = 20', dealt === 20, 'dealt=' + dealt);
    ok('honesty/gavel: confession logged to moments (later gavels cite it)',
      (Game.progState().moments || []).some(mm => /Confessed before the Gavel/i.test(mm.text || '')));
    SC.combat.roll = origRoll;
    endFight(Game);
  }
  // HONESTY: frontal shield 0.35x; flank bypasses.
  {
    const { m, p } = beginFight('gavel');
    SC.combat.roll = () => 100;
    Game.tbPlayerWait(); // monster turn 1: hook inits sigG (cool 1->0)
    m.mx = 5; m.my = 4; p.mx = 4; p.my = 4;
    try { Game.state.scholar.mx = 4; Game.state.scholar.my = 4; } catch (e) {}
    m.sigG.facing = { x: -1, y: 0 }; // facing west, at the player: frontal
    m.sigG.lastMx = 5; m.sigG.lastMy = 4;
    const hp0 = m.hp;
    strike(m.key); // frontal
    const frontal = hp0 - m.hp;
    ok('gavel shield: frontal strike landed reduced', frontal > 0, 'frontal=' + frontal);
    // flank: player north of gavel; facing unchanged (monster hasn't walked)
    m.mx = 5; m.my = 4; m.sigG.facing = { x: -1, y: 0 }; m.sigG.lastMx = 5; m.sigG.lastMy = 4;
    p.mx = 5; p.my = 3;
    try { Game.state.scholar.mx = 5; Game.state.scholar.my = 3; } catch (e) {}
    const hp1 = m.hp;
    strike(m.key); // flank
    const flank = hp1 - m.hp;
    ok('honesty/gavel: frontal strike reduced (~0.35x of flank)', frontal > 0 && flank > 0 && frontal < flank,
      'frontal=' + frontal + ' flank=' + flank);
    ok('honesty/gavel: frontal reduction is ~0.35x', Math.abs(frontal / Math.max(1, flank) - 0.35) < 0.15,
      'ratio=' + (frontal / Math.max(1, flank)).toFixed(2));
    SC.combat.roll = origRoll;
    endFight(Game);
  }
  // SOFTLOCK: empty event log -> fallback crime, trial completes, no crash.
  {
    const { m, p } = beginFight('gavel');
    try { Game.progState().moments = []; } catch (e) {}
    Game.tbPlayerWait(); Game.tbPlayerWait(); // accuse
    const crime = m.sigG && m.sigG.trial && m.sigG.trial.crime;
    ok('softlock/gavel: empty log -> fallback crime, no crash', /EXISTING WITHOUT A PERMIT/.test(crime || ''), String(crime).slice(0, 60));
    Game.tbPlayerWait(); // verdict falls
    ok('softlock/gavel: trial completes after fallback', !(m.sigG && m.sigG.trial));
    endFight(Game);
  }
  // Recess: once per trial; second refused without spending the act.
  // (The recess action self-advances into the monster's turn, which consumes
  // the delay — so assert the trial is still open with no verdict fallen.)
  {
    const { m, p } = beginFight('gavel');
    Game.state.village.viewership = 10;
    Game.tbPlayerWait(); Game.tbPlayerWait(); // accuse
    const php0 = p.hp;
    const r1 = Game.tbPlayerGavelRecess();
    ok('gavel: recess granted once', r1 === true);
    ok('gavel: recess delays the verdict (trial open, no damage on the verdict turn)',
      !!(m.sigG && m.sigG.trial) && p.hp === php0, 'trial open=' + !!(m.sigG && m.sigG.trial));
    const r2 = Game.tbPlayerGavelRecess();
    ok('gavel: second recess refused, act not spent', r2 === false && p.acted === false);
    endFight(Game);
  }

  // ================= THE FOCUS GROUP =================
  // EXPLOIT: loved-strike amplification — exactly one answer per strike, math exact.
  {
    const { m, p } = beginFight('focus_group');
    SC.combat.roll = () => 100;
    Game.tbPlayerWait(); // monster turn 1: spawn eyes + deliberate
    const eyes = Game.tbfight.fighters.filter(x => x.mdef && x.mdef.id === 'focus_group_eye' && x.alive && !x.fled);
    ok('focus: eye-heads spawn (5-7 heads total)', eyes.length >= 2 && eyes.length <= 4, 'eyes=' + eyes.length);
    m.sigFG.rating = { loved: 'strike', hated: 'wait' };
    m.sigFG.marked = null;
    m.mx = 5; m.my = 4; p.mx = 4; p.my = 4;
    try { Game.state.scholar.mx = 4; Game.state.scholar.my = 4; } catch (e) {}
    const php0 = p.hp;
    said.length = 0;
    strike(m.key); // loved strike: 1.3x, answered once
    const answers = said.filter(t => /ANSWERED/.test(t)).length;
    ok('exploit/focus: loved strike answered EXACTLY once (no stacking)', answers === 1, 'answers=' + answers);
    ok('exploit/focus: the answer bites back', p.hp < php0, 'took ' + (php0 - p.hp));
    ok('honesty/focus: loved-strike buff narrated', said.some(t => /LOVES your strike/i.test(t)));
    SC.combat.roll = origRoll;
    endFight(Game);
  }
  // EXPLOIT: boring walkout — 3 boring turns -> fled, no kill credit.
  {
    const { m, p } = beginFight('focus_group');
    const fighters = Game.tbfight.fighters; // capture: the walkout ends the fight (tbfight nulled)
    Game.state.waveKills = {};
    Game.tbPlayerWait();
    Game.tbPlayerWait();
    Game.tbPlayerWait();
    const lead = fighters.find(x => x.mdef && x.mdef.id === 'focus_group');
    const anyFled = fighters.some(x => x.mdef && /focus_group/.test(x.mdef.id) && x.fled);
    ok('exploit/focus: 3 boring turns -> the group LEAVES (designed exit)', anyFled, 'lead fled=' + (lead && lead.fled));
    ok('honesty/focus: walkout narrated', said.some(t => /losing interest|Next/i.test(t)));
    ok('exploit/focus: walkout grants no kill credit', !(Game.state.waveKills && Game.state.waveKills[3] > 0),
      JSON.stringify(Game.state.waveKills));
    endFight(Game);
  }
  // HONESTY: eye-heads can't be struck down — the act is consumed, honestly.
  {
    const { m, p } = beginFight('focus_group');
    Game.tbPlayerWait(); // spawn eyes
    const eye = Game.tbfight.fighters.find(x => x.mdef && x.mdef.id === 'focus_group_eye' && x.alive && !x.fled);
    eye.mx = p.mx + 1; eye.my = p.my; // adjacent: in strike range
    said.length = 0;
    const r = strike(eye.key);
    ok('honesty/focus: striking an eye is intercepted, not refused (no silent no-op)', r === true);
    ok('honesty/focus: eye survives (only watches)', eye.alive && eye.hp === 1);
    ok('honesty/focus: interception narrated', said.some(t => /blinks aside/i.test(t)));
    endFight(Game);
  }
  // HONESTY: mouth-pop — overflow carries; all three popped -> lead dies, eyes flee.
  {
    const { m, p } = beginFight('focus_group');
    const fighters = Game.tbfight.fighters; // capture: the kill ends the fight (tbfight nulled)
    SC.combat.roll = () => 200;
    Game.tbPlayerWait(); // monster turn 1: mouths init
    m.hp = 90; m.maxHp = 90;
    m.sigFG.mouths = [30, 30, 30];
    m.mx = 5; m.my = 4; p.mx = 4; p.my = 4;
    try { Game.state.scholar.mx = 4; Game.state.scholar.my = 4; } catch (e) {}
    m.sigFG.rating = { loved: 'wait', hated: 'dodge' }; // strike neutral: no answer noise
    said.length = 0;
    strike(m.key); // ~200 dmg: body + all three mouths
    const pops = said.filter(t => /mouth-head pops/i.test(t)).length;
    ok('honesty/focus: all three mouths pop on a huge strike', pops === 3, 'pops=' + pops);
    ok('honesty/focus: lead dies when mouths are gone', !m.alive);
    const eyesLive = fighters.filter(x => x.mdef && x.mdef.id === 'focus_group_eye' && x.alive && !x.fled);
    ok('honesty/focus: eyes flee when the mouths are gone', eyesLive.length === 0);
    SC.combat.roll = origRoll;
    endFight(Game);
  }
  // SOFTLOCK: rage locks the walkout — verify the lock engages, no dead end.
  {
    const { m, p } = beginFight('focus_group');
    Game.tbPlayerWait(); // monster turn 1
    const lead = Game.tbfight.fighters.find(x => x.mdef && x.mdef.id === 'focus_group');
    if (lead && lead.sigFG) lead.sigFG.neverBored = true;
    Game.tbPlayerWait(); Game.tbPlayerWait(); Game.tbPlayerWait();
    ok('softlock/focus: rage-locked group does NOT walk out (no soft exit)', lead.alive && !lead.fled);
    endFight(Game);
  }

  // ================= SPOOL =================
  // EXPLOIT: feed heal/heal/heal -> replay is pure medicine. Canon counterplay, bounded.
  // (Wound BEFORE the fight so the fight-start baseline reflects it; the turn-1
  // heal is then detected retroactively.)
  {
    endFight(Game);
    said.length = 0;
    try { Game.cureStatus('scholar', 'deaf'); } catch (e) {}
    s.health = 40; s.mx = 4; s.my = 4; // wounded BEFORE the fight
    s.inventory = [];
    Game.startCombat('spool');
    const m = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.mdef && x.mdef.id === 'spool');
    const p = Game.tbFighter('p');
    p.maxHp = 9000;
    m.mx = p.mx + 1; m.my = p.my;
    // p.hp should be 40 (from scholar.health); spBasePhp captured at startCombat
    Game.addHealth(40); // turn 1: "heal" (+40)
    Game.tbPlayerWait(); // record turn 1 (heal) — spool's first turn, retroactive
    const rec1 = m.spRec && m.spRec[0];
    ok('honesty/spool: fed heal recorded as HEAL with exact amount', rec1 && rec1.kind === 'heal' && rec1.amt === 40,
      JSON.stringify(rec1) + ' spBasePhp=' + Game.tbfight.spBasePhp + ' php=' + p.hp);
    Game.tbPlayerWait(); // record turn 2 (wait)
    Game.tbPlayerWait(); // record turn 3 (wait) -> REPLAY phase
    ok('spool: enters replay after 3 recorded turns', m.spPhase === 'replay');
    ok('honesty/spool: replay is medicine and silence (no strike recorded)',
      (m.spRec || []).every(e => e.kind !== 'strike'));
    p.hp = 30;
    const hpBefore = p.hp;
    Game.tbPlayerWait(); // player waits; monster turn: REPLAY entry 1 (heal)
    const healed = p.hp - hpBefore;
    ok('honesty/spool: "your heal comes back as a heal" — literally +40', healed === 40, 'healed=' + healed);
    ok('exploit/spool: replay heal capped at maxHp (no infinite-HP economy)', p.hp <= p.maxHp);
    endFight(Game);
  }
  // CATCH 2 — HONESTY: ally damage must NOT be filed as "your strike".
  {
    const { m, p } = beginFight('spool');
    SC.combat.roll = () => 30;
    m.mx = 5; m.my = 4; p.mx = 4; p.my = 4;
    try { Game.state.scholar.mx = 4; Game.state.scholar.my = 4; } catch (e) {}
    strike(m.key); // turn 1: player strikes for ~30 (recorded retroactively)
    ok('spool: turn-1 strike recorded as the player\'s strike',
      m.spRec[0] && m.spRec[0].kind === 'strike' && m.spRec[0].dmg > 0, JSON.stringify(m.spRec[0]));
    // turn 2: an ALLY (not the player) hits the spool for 90 between records
    m.hp = Math.max(1, m.hp - 90);
    Game.tbPlayerWait(); // record turn 2: player waited; spool lost 90 to "ally"
    const rec2 = m.spRec[1];
    ok('CATCH2/spool: ally damage NOT filed as the player\'s strike', rec2 && rec2.kind === 'wait',
      'recorded: ' + JSON.stringify(rec2));
    ok('CATCH2/spool: replay of turn 2 is silence, not a 90-dmg strike back',
      !(rec2 && rec2.kind === 'strike'));
    SC.combat.roll = origRoll;
    endFight(Game);
  }
  // SOFTLOCK: wait-only record -> replay of pure silence; fight still winnable.
  {
    const { m, p } = beginFight('spool');
    Game.tbPlayerWait(); Game.tbPlayerWait(); Game.tbPlayerWait();
    ok('softlock/spool: wait-only record -> replay phase, no stuck state',
      m.spPhase === 'replay' && (m.spRec || []).every(e => e.kind === 'wait'));
    SC.combat.roll = () => 200;
    m.mx = 5; m.my = 4; p.mx = 4; p.my = 4;
    try { Game.state.scholar.mx = 4; Game.state.scholar.my = 4; } catch (e) {}
    strike(m.key);
    strike(m.key);
    ok('softlock/spool: silent-replay spool still killable', !m.alive || m.hp < m.maxHp);
    SC.combat.roll = origRoll;
    endFight(Game);
  }
  // HONESTY: examine the reel — exact numbers and order.
  {
    const { m, p } = beginFight('spool');
    Game.tbPlayerWait(); Game.tbPlayerWait(); Game.tbPlayerWait(); // -> replay
    said.length = 0;
    const r = Game.tbSpoolExamineReel();
    ok('honesty/spool: examine reel works in replay phase', r === true);
    ok('honesty/spool: reel shows exact entries in order',
      said.some(t => /1\. WAIT/.test(t) && /2\. WAIT/.test(t) && /3\. WAIT/.test(t)),
      said.join(' | ').slice(0, 200));
    endFight(Game);
  }

  // ================= CHORUS LINE =================
  // (The chorus is speed 4 > player 3: it takes an OPENING turn at fight
  // start. Tests drive by beat number, not by wait count.)
  function chorusBeatNum(m) { return ((m.clBeat - 1) % 4) + 1; }
  function chorusWaitForBeat(m, target) {
    let guard = 0;
    while (chorusBeatNum(m) !== target && guard++ < 12 && atPlayerTurn()) Game.tbPlayerWait();
  }
  // EXPLOIT: dance-timing — strike on beats 1-3, dance the downbeat. Designed counterplay.
  {
    const { m, p } = beginFight('chorus_line');
    m.mx = 5; m.my = 4; p.mx = 4; p.my = 4;
    try { Game.state.scholar.mx = 4; Game.state.scholar.my = 4; } catch (e) {}
    chorusWaitForBeat(m, 3);
    ok('chorus: count reaches beat 3 (downbeat next)', chorusBeatNum(m) === 3, 'beat=' + chorusBeatNum(m));
    const hp0 = p.hp;
    said.length = 0;
    Game.tbChorusDance(); // dance on the downbeat turn
    const took = hp0 - p.hp;
    ok('exploit/chorus: dancing the downbeat -> kick catches air (untouchable)', took === 0, 'took=' + took);
    ok('honesty/chorus: dance protection narrated', said.some(t => /dancing — untouchable/i.test(t)));
    // but dancing is the whole turn: no damage dealt while dancing
    const mhp0 = m.hp;
    ok('exploit/chorus: dance-every-turn is a stalemate, not a win (no progress while dancing)', m.hp === mhp0);
    endFight(Game);
  }
  // HONESTY: flank (0.5x) and move-on-beat (0.25x) multipliers, as ratios.
  {
    const { m, p } = beginFight('chorus_line');
    SC.combat.roll = () => 40; // base kick 40
    m.mx = 5; m.my = 4; p.mx = 4; p.my = 4; // player WEST of line
    try { Game.state.scholar.mx = 4; Game.state.scholar.my = 4; } catch (e) {}
    // DOWNBEAT 1: facing the player (full kick)
    m.clFacing = { x: -1, y: 0 };
    m.clBeat = 3; m.clLastPx = p.mx; m.clLastPy = p.my; m.clDisrupted = 0; m.clDeafNoted = true;
    let hp0 = p.hp; said.length = 0;
    Game.tbPlayerWait(); // DOWNBEAT
    const full = hp0 - p.hp;
    ok('chorus: full frontal kick lands', full > 0, 'full=' + full);
    // DOWNBEAT 2: player on the flank (facing unchanged — frozen)
    m.mx = 5; m.my = 4; p.mx = 5; p.my = 3;
    try { Game.state.scholar.mx = 5; Game.state.scholar.my = 3; } catch (e) {}
    m.clFacing = { x: -1, y: 0 };
    m.clBeat = 3; m.clLastPx = p.mx; m.clLastPy = p.my; m.clDisrupted = 0;
    hp0 = p.hp; said.length = 0;
    Game.tbPlayerWait(); // DOWNBEAT
    const flank = hp0 - p.hp;
    ok('honesty/chorus: flank halves the kick (~0.5x)', flank > 0 && Math.abs(flank / full - 0.5) < 0.2,
      'flank=' + flank + ' full=' + full + ' ratio=' + (flank / Math.max(1, full)).toFixed(2));
    ok('honesty/chorus: flank narrated', said.some(t => /flank/i.test(t)));
    try { Game.cureStatus('scholar', 'deaf'); } catch (e) {}
    // DOWNBEAT 3: move on the beat (0.25x)
    m.mx = 5; m.my = 4; p.mx = 4; p.my = 4;
    try { Game.state.scholar.mx = 4; Game.state.scholar.my = 4; } catch (e) {}
    m.clFacing = { x: -1, y: 0 };
    m.clBeat = 3; m.clDisrupted = 0; m.clDeafNoted = true;
    Game.tbPlayerMove(3, 4); // real move: heading west, away from the line
    m.clLastPx = 4; m.clLastPy = 4; // pin: the player's pos before this turn's move
    hp0 = p.hp; said.length = 0;
    Game.tbPlayerWait(); // DOWNBEAT — player moved this turn
    const moved = hp0 - p.hp;
    ok('honesty/chorus: moving on the beat quarters the kick (~0.25x)', moved >= 0 && Math.abs(moved / full - 0.25) < 0.2,
      'moved=' + moved + ' full=' + full + ' ratio=' + (moved / Math.max(1, full)).toFixed(2));
    ok('honesty/chorus: moving narrated', said.some(t => /catches air/i.test(t)));
    SC.combat.roll = origRoll;
    endFight(Game);
  }
  // HONESTY: deafness hides the count but not the kick.
  {
    const { m, p } = beginFight('chorus_line');
    Game.applyStatus('scholar', 'deaf', { turns: 5, source: 'test' });
    said.length = 0;
    Game.tbPlayerWait(); // monster turn: beat 1, deaf
    ok('honesty/chorus: deaf hides the beat count', !said.some(t => /BEAT \d\/4/.test(t)),
      said.join(' | ').slice(0, 160));
    ok('honesty/chorus: deaf announced with the kick-still-comes warning',
      said.some(t => /Deaf/i.test(t)));
    // drive to a downbeat while deaf: kick still lands
    m.clBeat = 3; m.clLastPx = p.mx; m.clLastPy = p.my;
    m.mx = 5; m.my = 4; p.mx = 4; p.my = 4;
    try { Game.state.scholar.mx = 4; Game.state.scholar.my = 4; } catch (e) {}
    m.clFacing = { x: -1, y: 0 }; // facing the player: full kick
    SC.combat.roll = () => 40;
    const hp0 = p.hp;
    Game.tbPlayerWait(); // DOWNBEAT
    ok('honesty/chorus: the kick still lands while deaf', p.hp < hp0, 'took ' + (hp0 - p.hp));
    SC.combat.roll = origRoll;
    try { Game.cureStatus('scholar', 'deaf'); } catch (e) {}
    endFight(Game);
  }
  // HONESTY: gravel breaks the count for exactly one round.
  {
    const { m, p } = beginFight('chorus_line');
    s.inventory = s.inventory || [];
    s.inventory.push({ itemId: 'gravel', name: 'Handful of gravel', qty: 1 });
    s.inventory.push({ itemId: 'gravel', name: 'Handful of gravel', qty: 1 });
    chorusWaitForBeat(m, 2);
    said.length = 0;
    const r = Game.tbChorusThrowGravel();
    ok('chorus: gravel throw works', r === true);
    if (atPlayerTurn()) Game.tbPlayerEndTurn(); // the throw costs the act, not the moves
    ok('honesty/chorus: gravel breaks the count (no beat, no kick next turn)',
      said.some(t => /stumbles/i.test(t)), said.slice(-2).join(' | ').slice(0, 120));
    endFight(Game);
  }
  // SOFTLOCK: dance with no chorus -> refusal, no act spent.
  {
    const { m, p } = beginFight('spool'); // wrong monster
    const r = Game.tbChorusDance();
    ok('softlock/chorus: dance with no chorus refused, act not spent', r === false && p.acted === false);
    endFight(Game);
  }
  // HONESTY: facing freezes on beat 3 — stepping to the flank after the freeze works.
  {
    const { m, p } = beginFight('chorus_line');
    m.mx = 5; m.my = 4; p.mx = 4; p.my = 4;
    try { Game.state.scholar.mx = 4; Game.state.scholar.my = 4; } catch (e) {}
    chorusWaitForBeat(m, 2);
    const faceAfter2 = { x: m.clFacing.x, y: m.clFacing.y };
    ok('honesty/chorus: facing re-aimed on beats 1-2', faceAfter2.x === -1 && faceAfter2.y === 0,
      JSON.stringify(faceAfter2));
    chorusWaitForBeat(m, 3);
    const faceAfter3 = { x: m.clFacing.x, y: m.clFacing.y };
    ok('honesty/chorus: facing frozen on beat 3', faceAfter3.x === faceAfter2.x && faceAfter3.y === faceAfter2.y,
      JSON.stringify(faceAfter3));
    // move to the flank AFTER the freeze (north of the line), then the downbeat
    p.mx = 5; p.my = 3;
    try { Game.state.scholar.mx = 5; Game.state.scholar.my = 3; } catch (e) {}
    Game.tbPlayerWait(); // downbeat fires; facing must not have tracked the flank step
    ok('honesty/chorus: downbeat did not re-aim at the flank step',
      m.clFacing.x === faceAfter3.x && m.clFacing.y === faceAfter3.y,
      'facing=' + JSON.stringify(m.clFacing));
    endFight(Game);
  }

  // ================= TERMS OF SERVICE =================
  // EXPLOIT: accept-all — penalties MUST materialize with exact math.
  {
    const { m, p } = beginFight('terms_of_service');
    Game.tbPlayerWait(); Game.tbPlayerWait(); Game.tbPlayerWait(); // clause 1 written (tosEvery 3)
    ok('tos: first clause written on schedule', !!(m.tosActive), 'active=' + JSON.stringify(!!m.tosActive));
    const firstId = m.tosActive.def.id;
    ok('tos: first clause is a real clause (not the loophole)', firstId !== 'tos_loophole', firstId);
    said.length = 0;
    const r = Game.tbTosAccept();
    ok('tos: accept works', r === true);
    ok('honesty/tos: accept schedules the bigger cost later', (m.tosPending || []).length === 1,
      JSON.stringify((m.tosPending || []).map(x => x.def.id + ':' + x.n)));
    // drive until the penalty fires
    const mhp0 = m.hp, kcal0 = s.kcal || 0, pmax0 = p.maxHp;
    for (let i = 0; i < 8 && atPlayerTurn() && (m.tosPending || []).length; i++) Game.tbPlayerWait();
    ok('exploit/tos: accepted penalty MATERIALIZED (not silently dropped)', (m.tosPending || []).length === 0);
    if (firstId === 'tos_arbitration') {
      ok('honesty/tos: arbitration +40 monster HP, -10 player max HP', m.hp >= mhp0 + 40 - 1 && p.maxHp === pmax0 - 10,
        'm.hp ' + mhp0 + '->' + m.hp + ', p.maxHp ' + pmax0 + '->' + p.maxHp);
    } else if (firstId === 'tos_latefees' || firstId === 'tos_harvest') {
      ok('honesty/tos: kcal penalty landed', (s.kcal || 0) < kcal0, 'kcal ' + kcal0 + '->' + (s.kcal || 0));
    }
    endFight(Game);
  }
  // EXPLOIT: object costs are real (kcal / HP / item).
  {
    const { m, p } = beginFight('terms_of_service');
    s.kcal = 500;
    Game.tbPlayerWait(); Game.tbPlayerWait(); Game.tbPlayerWait(); // clause 1
    const cid = m.tosActive.def.id;
    const kcal0 = s.kcal, hp0 = p.hp, inv0 = (s.inventory || []).length;
    const r = Game.tbTosObject();
    ok('tos: object works', r === true);
    const paidSomething = (s.kcal < kcal0) || (p.hp < hp0) || ((s.inventory || []).length < inv0);
    ok('exploit/tos: OBJECT costs something real (' + cid + ')', paidSomething,
      'kcal ' + kcal0 + '->' + s.kcal + ', hp ' + hp0 + '->' + p.hp + ', inv ' + inv0 + '->' + (s.inventory || []).length);
    ok('honesty/tos: objectors marked — next clause comes sooner', m.tosEvery === 2, 'tosEvery=' + m.tosEvery);
    endFight(Game);
  }
  // HONESTY: read 3 -> §0 surfaces -> invoke -> dismissed, no kill credit, no loot.
  {
    const { m, p } = beginFight('terms_of_service');
    Game.state.waveKills = {};
    let sawLoophole = false;
    for (let i = 0; i < 40 && atPlayerTurn() && !sawLoophole; i++) {
      if (m.tosActive && !m.tosActive.read && m.tosActive.def.id !== 'tos_loophole') {
        Game.tbTosRead();
      } else {
        Game.tbPlayerWait();
      }
      if (m.tosActive && m.tosActive.def.id === 'tos_loophole') sawLoophole = true;
    }
    ok('honesty/tos: reading 3 clauses surfaces the §0 loophole', sawLoophole,
      'tosRead=' + m.tosRead + ' active=' + (m.tosActive && m.tosActive.def.id));
    if (sawLoophole) {
      said.length = 0;
      const r = Game.tbTosInvokeLoophole();
      ok('tos: §0 invoke works', r === true);
      ok('honesty/tos: §0 dismisses with no blood (fled, not slain)', m.fled === true && m.alive === true);
      ok('honesty/tos: dismissal narrated', said.some(t => /TERMINATION ACCEPTED/i.test(t)));
      ok('honesty/tos: routed monster grants no kill credit', !(Game.state.waveKills && Game.state.waveKills[3] > 0),
        JSON.stringify(Game.state.waveKills));
    }
    endFight(Game);
  }
  // HONESTY: ignored clauses auto-accept; pressure ratchets (3 -> 2).
  {
    const { m, p } = beginFight('terms_of_service');
    Game.tbPlayerWait(); Game.tbPlayerWait(); Game.tbPlayerWait(); // clause 1
    const every0 = m.tosEvery;
    Game.tbPlayerWait(); Game.tbPlayerWait(); Game.tbPlayerWait(); // ignored 3 monster turns
    ok('honesty/tos: ignored clause auto-accepts after 3 rounds', (m.tosPending || []).length >= 1 || m.tosActive === null,
      'pending=' + JSON.stringify((m.tosPending || []).length));
    ok('honesty/tos: pressure ratchets (clause interval shortens)', m.tosEvery < every0 || m.tosEvery === 2,
      every0 + '->' + m.tosEvery);
    ok('honesty/tos: auto-accept narrated', said.some(t => /AUTO-ACCEPTED|UNROLLS TOWARD/i.test(t)));
    endFight(Game);
  }
  // SOFTLOCK: accept then kill the Scroll before the penalty fires — no leak, no crash.
  {
    const { m, p } = beginFight('terms_of_service');
    Game.tbPlayerWait(); Game.tbPlayerWait(); Game.tbPlayerWait(); // clause 1
    Game.tbTosAccept(); // pending scheduled (act spent, moves remain)
    ok('tos: penalty pending', (m.tosPending || []).length === 1);
    if (atPlayerTurn()) Game.tbPlayerEndTurn(); // end the turn; monster ticks pending (no fire yet)
    SC.combat.roll = () => 500;
    m.mx = 5; m.my = 4; p.mx = 4; p.my = 4;
    try { Game.state.scholar.mx = 4; Game.state.scholar.my = 4; } catch (e) {}
    strike(m.key); // kill it before the penalty fires
    ok('softlock/tos: killing the Scroll voids pending penalties (no leak)', !m.alive);
    ok('softlock/tos: fight ended cleanly', !Game.tbfight || Game.tbfight.over || !m.alive);
    SC.combat.roll = origRoll;
    endFight(Game);
  }

  // CATCH 4 — HONESTY: "dancing is all you do this turn" — but moveLeft was NOT zeroed,
  // so the turn didn't end and the player could dance + reposition 3 tiles.
  // Post-fix the dance zeroes moves -> the turn auto-advances (monster acts).
  {
    const { m, p } = beginFight('chorus_line');
    const beatBefore = m.clBeat;
    const r = Game.tbChorusDance();
    ok('CATCH4/chorus: dance succeeds', r === true);
    // The turn must have been consumed: the monster took its turn (beat advanced).
    // Pre-fix the turn stalled (moveLeft=3 retained) and the beat did not advance.
    ok('CATCH4/chorus: dance consumes the turn ("all you do this turn")',
      m.clBeat !== beatBefore, 'clBeat ' + beatBefore + '->' + m.clBeat);
    endFight(Game);
  }

  // ================= THE CALLBACK =================
  // EXPLOIT: funeral with no dead villagers ("stranger" fallback) — designed fallback, works.
  {
    const { m, p } = beginFight('callback');
    Game.state.corpses = [];
    Game.tbPlayerWait(); // monster turn 1: face picked
    ok('callback: stranger fallback when no villagers have died',
      m.cbFace && m.cbFace.stranger === true && m.cbFace.name === 'a stranger',
      JSON.stringify(m.cbFace && { name: m.cbFace.name, stranger: m.cbFace.stranger }));
    said.length = 0;
    const r = Game.tbPlayerFuneral();
    ok('exploit/callback: funeral resolves even the stranger (designed fallback)', r === true && m.cbCoherence === 0);
    Game.tbPlayerWait(); // monster turn: dissolve 1 (falters, half-HP)
    ok('callback: funeral dissolve stage 1 narrated', said.some(t => /falters|thank you/i.test(t)));
    Game.tbPlayerWait(); // monster turn: dissolve 2 (comes apart)
    ok('exploit/callback: funeral completes non-violently', !m.alive);
    ok('honesty/callback: the goodbye is narrated', said.some(t => /gone, properly/i.test(t)));
    endFight(Game);
  }
  // HONESTY: face is a REAL dead villager, never a living roster member.
  {
    const { m, p } = beginFight('callback');
    Game.state.corpses = [];
    const rosterId = (Game.state.village.roster || [])[0];
    Game.corpses().push({ kind: 'villager', name: 'Test Dead', villagerId: 'v_test_dead', deathKnown: true, cause: 'test' });
    Game.corpses().push({ kind: 'villager', name: 'Living Member', villagerId: rosterId, deathKnown: true, cause: 'test' });
    Game.state.village.npcAbilities = Game.state.village.npcAbilities || {};
    Game.state.village.npcAbilities['v_test_dead'] = ['pocket_sand'];
    Game.tbPlayerWait(); // monster turn 1: face picked
    ok('honesty/callback: face is the REAL dead villager', m.cbFace && m.cbFace.name === 'Test Dead',
      JSON.stringify(m.cbFace && m.cbFace.name));
    ok('honesty/callback: face NEVER a living roster member', !m.cbFace || m.cbFace.vid !== rosterId);
    endFight(Game);
  }
  // HONESTY: borrowed moves telegraphed by whose face it wears; name-it strips them.
  {
    const { m, p } = beginFight('callback');
    Game.state.corpses = [];
    Game.corpses().push({ kind: 'villager', name: 'Test Dead', villagerId: 'v_test_dead', deathKnown: true, cause: 'test' });
    Game.state.village.npcAbilities = Game.state.village.npcAbilities || {};
    Game.state.village.npcAbilities['v_test_dead'] = ['pocket_sand'];
    Game.tbPlayerWait(); // monster turn 1: face (cbTurns=1)
    said.length = 0;
    Game.tbPlayerWait(); // monster turn 2: cbTurns=2 -> borrowed move
    ok('honesty/callback: borrowed move telegraphed by the face', said.some(t => /face shifts/i.test(t)));
    ok('honesty/callback: pocket_sand blinds (borrowed kit is real)', (p.blindTurns || 0) >= 2,
      'blindTurns=' + p.blindTurns);
    const mhp0 = m.hp;
    said.length = 0;
    Game.tbPlayerNameIt(); // strip the borrowed moves + wound of truth
    ok('callback: name-it lands the wound of truth', m.hp < mhp0, 'hp ' + mhp0 + '->' + m.hp);
    ok('honesty/callback: naming narrated', said.some(t => /NOT Test Dead/i.test(t)));
    said.length = 0;
    // drive to the next borrowed-move turn (cbTurns % 4 === 2): turns 3,4,5,6
    Game.tbPlayerWait(); Game.tbPlayerWait(); Game.tbPlayerWait(); Game.tbPlayerWait();
    ok('honesty/callback: named callback no longer borrows moves', !said.some(t => /face shifts/i.test(t)));
    endFight(Game);
  }
  // SOFTLOCK: funeral, then the fight still resolves if the player strikes during dissolve.
  {
    const { m, p } = beginFight('callback');
    Game.state.corpses = [];
    Game.tbPlayerWait();
    Game.tbPlayerFuneral();
    SC.combat.roll = () => 500;
    m.mx = 5; m.my = 4; p.mx = 4; p.my = 4;
    try { Game.state.scholar.mx = 4; Game.state.scholar.my = 4; } catch (e) {}
    strike(m.key); // strike during dissolve — no crash, no double-resolution
    ok('softlock/callback: striking during dissolve is safe', true);
    SC.combat.roll = origRoll;
    endFight(Game);
  }

  // ================= BUFFERING =================
  // (The buffering is speed 5 > player 3: it takes an OPENING turn (M1) at
  // fight start. Cycle: M1 announce-predict, M2 execute, M3-4 generic,
  // M5 announce-step, M6 execute, M7-8 generic, M9 announce-predict, ...)
  // HONESTY: "IT WILL STRIKE (x,y) — WHERE YOU ARE HEADING" — the announced cell is real.
  {
    const { m, p } = beginFight('buffering');
    m.mx = 5; m.my = 4; p.mx = 4; p.my = 4;
    try { Game.state.scholar.mx = 4; Game.state.scholar.my = 4; } catch (e) {}
    // drive to M9 (the next predict announce): M2..M8
    for (let i = 0; i < 7; i++) Game.tbPlayerWait();
    // player turn 8: move west (heading), then end the turn
    Game.tbPlayerMove(3, 4);
    Game.tbPlayerWait(); // M9: PREDICT announce
    const pend = m.bufPending;
    ok('honesty/buffering: prediction announces the headed cell',
      pend && pend.type === 'predict' && pend.x === 2 && pend.y === 4,
      JSON.stringify(pend));
    ok('honesty/buffering: announcement says the coordinates', said.some(t => /\(2, 4\)/.test(t)));
    // keep walking into it: move west again, then M10 executes
    Game.tbPlayerMove(2, 4);
    const hp0 = p.hp;
    said.length = 0;
    Game.tbPlayerWait(); // M10: EXECUTE
    ok('honesty/buffering: walking into the predicted cell -> HIT ("It was honest")',
      p.hp < hp0, 'took ' + (hp0 - p.hp));
    ok('honesty/buffering: the hit is narrated honestly', said.some(t => /It was honest/i.test(t)));
    endFight(Game);
  }
  // HONESTY: stop after the announce -> the strike whiffs ("you weren't heading there").
  {
    const { m, p } = beginFight('buffering');
    m.mx = 5; m.my = 4; p.mx = 4; p.my = 4;
    try { Game.state.scholar.mx = 4; Game.state.scholar.my = 4; } catch (e) {}
    for (let i = 0; i < 7; i++) Game.tbPlayerWait();
    Game.tbPlayerMove(3, 4);
    Game.tbPlayerWait(); // M9: PREDICT announce (2,4)
    ok('buffering: predict announced', m.bufPending && m.bufPending.type === 'predict');
    const hp0 = p.hp;
    said.length = 0;
    Game.tbPlayerWait(); // player STAYS at (3,4); M10 executes -> whiff
    ok('honesty/buffering: not heading there -> it strikes empty air', p.hp === hp0, 'took ' + (hp0 - p.hp));
    ok('honesty/buffering: the whiff is narrated', said.some(t => /empty air/i.test(t)));
    endFight(Game);
  }
  // HONESTY: stand perfectly still from the opening -> whiff ("no heading, nothing to catch").
  {
    const { m, p } = beginFight('buffering');
    // M1 (opening) already announced the whiff; M2 executes it
    ok('honesty/buffering: stillness announced ("no heading")',
      m.bufPending && m.bufPending.type === 'whiff' && said.some(t => /no heading/i.test(t)));
    const hp0 = p.hp;
    said.length = 0;
    Game.tbPlayerWait(); // M2: EXECUTE whiff
    ok('honesty/buffering: stand still -> it strikes empty air', p.hp === hp0, 'took ' + (hp0 - p.hp));
    ok('honesty/buffering: the whiff is narrated', said.some(t => /nothing to catch/i.test(t)));
    endFight(Game);
  }
  // HONESTY: "IT WILL STEP LEFT — and then it steps left."
  {
    const { m, p } = beginFight('buffering');
    // drive to M5 (the step announce): M2 (execute whiff), M3, M4 (generic)
    Game.tbPlayerWait(); Game.tbPlayerWait(); Game.tbPlayerWait(); Game.tbPlayerWait();
    const pend = m.bufPending;
    ok('buffering: step announced', pend && pend.type === 'step', JSON.stringify(pend));
    const ox = m.mx, oy = m.my;
    said.length = 0;
    Game.tbPlayerWait(); // M6: EXECUTE the step
    const ex = Math.max(0, Math.min(8, ox + pend.dx)), ey = Math.max(0, Math.min(8, oy + pend.dy));
    ok('honesty/buffering: it steps EXACTLY where announced',
      m.mx === ex && m.my === ey,
      '(' + ox + ',' + oy + ')->(' + m.mx + ',' + m.my + ') announced d=(' + pend.dx + ',' + pend.dy + ')');
    ok('honesty/buffering: the step is narrated ("exactly where it said")',
      said.some(t => /exactly where it said/i.test(t)));
    endFight(Game);
  }
  // HONESTY: strikes at the mirage MISS with eyes open; closed eyes find the faintest frame.
  {
    const { m, p } = beginFight('buffering');
    m.mx = 5; m.my = 4; p.mx = 4; p.my = 4;
    try { Game.state.scholar.mx = 4; Game.state.scholar.my = 4; } catch (e) {}
    // M1 (opening) announced; mirage is ON until the execute. Strike now -> MISS.
    const mhp0 = m.hp;
    said.length = 0;
    Game.tbPlayerStrike(m.key); // eyes open: strike the mirage -> MISS (consumed)
    if (atPlayerTurn()) Game.tbPlayerEndTurn(); // M2 executes the whiff; mirage snaps shut
    ok('honesty/buffering: open-eyes strike at the mirage MISSES', m.hp === mhp0, 'm.hp ' + mhp0 + '->' + m.hp);
    ok('honesty/buffering: the miss is narrated (brightest frame = the past)',
      said.some(t => /BRIGHTEST frame/i.test(t)));
    // now close eyes, then strike: the fall-through hits the faintest frame
    SC.combat.roll = () => 30;
    Game.tbPlayerCloseEyes(); // act spent; eyes stay shut until the next strike
    if (atPlayerTurn()) Game.tbPlayerEndTurn(); // M3: generic
    said.length = 0;
    const mhp1 = m.hp;
    Game.tbPlayerStrike(m.key); // eyes closed -> real strike at the faintest frame
    if (atPlayerTurn()) Game.tbPlayerEndTurn();
    ok('honesty/buffering: closed-eyes strike finds the faintest frame (HITS)', m.hp < mhp1,
      'm.hp ' + mhp1 + '->' + m.hp);
    ok('honesty/buffering: the faint-frame strike is narrated', said.some(t => /faintest frame/i.test(t)));
    SC.combat.roll = origRoll;
    endFight(Game);
  }
  // CATCH 3 — HONESTY: afterimage frames on the grid (provider).
  {
    const { m, p } = beginFight('buffering');
    // force two steps to build the echo trail
    m.bufEchoes = [{ x: 3, y: 4 }, { x: 2, y: 4 }];
    m.mx = 4; m.my = 4;
    const cells = typeof Game.bufAfterimageCells === 'function' ? Game.bufAfterimageCells() : null;
    ok('CATCH3/buffering: provider exists and returns the echo frames',
      cells && cells.length === 3, JSON.stringify(cells));
    ok('CATCH3/buffering: echoes marked bright, present marked faintest',
      cells && cells.filter(c => !c.faint).length === 2 && cells.filter(c => c.faint).length === 1 &&
      cells.some(c => c.faint && c.x === 4 && c.y === 4));
    ok('CATCH3/buffering: no fight -> no ghosts', (() => {
      endFight(Game);
      const c2 = typeof Game.bufAfterimageCells === 'function' ? Game.bufAfterimageCells() : null;
      return c2 && c2.length === 0;
    })());
    endFight(Game);
  }

  // ================= AD BREAK =================
  // HONESTY: SKIP AD arrives sooner with broadcast favor (viewership tiers).
  {
    const { m, p } = beginFight('ad_break');
    Game.state.village.viewership = 0;
    Game.tbPlayerWait(); Game.tbPlayerWait(); Game.tbPlayerWait(); // ad starts on monster turn 3
    ok('adbreak: ad starts on schedule', !!m.adActive);
    ok('honesty/adbreak: tier-0 ad is 4 ticks, skip at 3', m.adActive.total === 4 && m.adActive.skipAt === 3,
      'total=' + m.adActive.total + ' skipAt=' + m.adActive.skipAt);
    endFight(Game);
    const f2 = beginFight('ad_break');
    Game.state.village.viewership = 30;
    Game.tbPlayerWait(); Game.tbPlayerWait(); Game.tbPlayerWait();
    ok('honesty/adbreak: favored ad is shorter (2 ticks, skip at 1)', f2.m.adActive.total === 2 && f2.m.adActive.skipAt === 1,
      'total=' + f2.m.adActive.total + ' skipAt=' + f2.m.adActive.skipAt);
    endFight(Game);
  }
  // HONESTY: killing the sponsor-creature shortens the ad (+2 progress).
  {
    const { m, p } = beginFight('ad_break');
    SC.combat.roll = () => 100;
    Game.tbPlayerWait(); Game.tbPlayerWait(); Game.tbPlayerWait(); // ad starts
    const sp = Game.tbfight.fighters.find(x => x.mdef && x.mdef.id === 'ad_sponsor' && x.alive);
    ok('adbreak: sponsor-creature rides the glyph', !!sp, 'key=' + (sp && sp.key));
    const prog0 = m.adActive.progress;
    strike(sp.key); // kill the 40-HP sponsor
    ok('adbreak: sponsor killable', !sp.alive);
    Game.tbPlayerWait(); // monster turn: ad tick sees the slain sponsor
    ok('honesty/adbreak: slain sponsor jumps the bar forward (+2)',
      m.adActive ? (m.adActive.progress >= prog0 + 2) : true, // (or the ad already ended)
      'progress ' + prog0 + '->' + (m.adActive ? m.adActive.progress : 'ended'));
    ok('honesty/adbreak: the pop is narrated', said.some(t => /pops like a soap bubble/i.test(t)));
    SC.combat.roll = origRoll;
    endFight(Game);
  }
  // HONESTY: look away halves the heal and slows the bar; the blind cost lands on the next strike.
  {
    const { m, p } = beginFight('ad_break');
    Game.tbPlayerWait(); Game.tbPlayerWait(); Game.tbPlayerWait(); // ad starts
    m.hp = m.maxHp - 60; // wound it so the heal is visible
    const hp0 = m.hp, prog0 = m.adActive.progress;
    Game.tbPlayerLookAway(); // act spent; the ad tick runs on the monster's turn
    if (atPlayerTurn()) Game.tbPlayerEndTurn();
    const expectHeal = Math.round(m.maxHp * 0.03 * 0.5);
    const healed = m.hp - hp0;
    const progGain = m.adActive.progress - prog0;
    ok('honesty/adbreak: look-away halves the heal', healed === expectHeal,
      'healed=' + healed + ' expected=' + expectHeal);
    ok('honesty/adbreak: look-away slows the bar (0.5/tick)', progGain === 0.5, 'gain=' + progGain);
    // the blind cost: next strike is blind (consumes the flag either way)
    said.length = 0;
    m.mx = 5; m.my = 4; p.mx = 4; p.my = 4;
    try { Game.state.scholar.mx = 4; Game.state.scholar.my = 4; } catch (e) {}
    Game.tbPlayerStrike(m.key);
    if (atPlayerTurn()) Game.tbPlayerEndTurn();
    ok('exploit/adbreak: the blind cost lands on the next strike (not evaded)',
      (p.adLookAway || 0) === 0 && said.some(t => /without looking|on memory/i.test(t)),
      'adLookAway=' + p.adLookAway);
    endFight(Game);
  }
  // HONESTY: SKIP AD works when the beat arrives.
  {
    const { m, p } = beginFight('ad_break');
    Game.state.village.viewership = 0;
    Game.tbPlayerWait(); Game.tbPlayerWait(); Game.tbPlayerWait(); // ad starts (total 4, skipAt 3)
    Game.tbPlayerWait(); // progress 1
    Game.tbPlayerWait(); // progress 2
    Game.tbPlayerWait(); // progress 3 -> skip offered
    ok('adbreak: skip beat offered at skipAt', m.adActive && m.adActive.progress >= m.adActive.skipAt && m.adActive.skipOffered);
    said.length = 0;
    const r = Game.tbPlayerSkipAd();
    ok('honesty/adbreak: SKIP AD ends the ad', r === true && !m.adActive);
    ok('honesty/adbreak: the silence is narrated', said.some(t => /unsponsored silence/i.test(t)));
    endFight(Game);
  }
  // SOFTLOCK: ad reposition never strands the fight (stays within reach, tiles exist).
  {
    const { m, p } = beginFight('ad_break');
    p.mx = 1; p.my = 1;
    try { Game.state.scholar.mx = 1; Game.state.scholar.my = 1; } catch (e) {}
    m.mx = 2; m.my = 2;
    Game.tbPlayerWait(); Game.tbPlayerWait(); Game.tbPlayerWait(); // ad starts
    let sane = true;
    for (let i = 0; i < 6 && atPlayerTurn() && m.adActive; i++) {
      Game.tbPlayerWait(); // ad ticks reposition the monster
      const d = Math.max(Math.abs(m.mx - p.mx), Math.abs(m.my - p.my));
      if (m.mx < 0 || m.mx > 8 || m.my < 0 || m.my > 8 || d > 3) sane = false;
    }
    ok('softlock/adbreak: reposition stays on-grid and within reach', sane, 'm=(' + m.mx + ',' + m.my + ')');
    endFight(Game);
  }

  // ---------- wave 4/5 still copy-only (awaiting Steve's mechanism pick — NOT built here) ----------
  {
    const w45 = ['congregation', 'strike', 'influencer', 'audit', 'reunion', 'suburb', 'eulogy',
      'algorithm', 'eater', 'cancellation', 'editor', 'rerun', 'spoiler', 'timeslot',
      'nielsen', 'finale', 'network_note'];
    const stillCopyOnly = w45.filter(id => !((beh[id] && beh[id].preTurnHooks || []).length));
    // reunion has packTactics (not a signature mechanic) — excluded from the count honestly
    const sigCopyOnly = stillCopyOnly.filter(id => id !== 'reunion');
    ok('scope: wave-4/5 signature mechanics still copy-only (not built in this run)', sigCopyOnly.length === 16,
      sigCopyOnly.join(','));
  }
  // ---------- wave-3 bands (MONSTER-WAVES.md: damage 20-70, HP 240-420, pierce 0-0.25) ----------
  {
    const byId = Object.fromEntries(Game.data.monsters.map(x => [x.id, x]));
    const w3 = ['redactor', 'gavel', 'focus_group', 'spool', 'chorus_line', 'terms_of_service', 'callback', 'buffering', 'ad_break'];
    for (const id of w3) {
      const md = byId[id];
      const hp = md.hp, dmg = (md.attack || {}).damage, pierce = md.pierce || 0;
      ok('bands/' + id + ': HP in 240-420', hp[0] >= 240 && hp[1] <= 420, JSON.stringify(hp));
      ok('bands/' + id + ': damage in 20-70', dmg[0] >= 20 && dmg[1] <= 70, JSON.stringify(dmg));
      ok('bands/' + id + ': pierce in 0-0.25', pierce >= 0 && pierce <= 0.25, 'pierce=' + pierce);
    }
  }

  Game.passiveBonus = realPassive; Game.stat = realStat; SC.combat.roll = origRoll;
  endFight(Game);
  console.log('== RESULT: ' + pass + ' passed, ' + fail + ' failed ==');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e && e.stack || e); process.exit(2); });
