// @ontology
// system: signature-wave3a
// description: Wave-3 batch-A signature combat mechanics (Steve 2026-10-10): The Redactor (point-then-redact cycle with decoy/quiet counterplay), Gavel (trial with mid-trial motions + frontal sound-block shield), The Focus Group (audible visible ratings, damageable mouth-head parts, marking eye-heads, boredom walkout). Hooks register into MonsterBehaviorHooks; player verbs are tracked via light wraps; damage modifiers route through one tbDamage wrap. Telegraph honesty: every telegraph states the real next effect.
// provides:
//   - sigRedactor(game, m)
//   - sigGavel(game, m)
//   - sigFocusGroup(game, m)
//   - sigFocusEye(game, m)
//   - tbPlayerDodge()
//   - tbPlayerGavelObject()
//   - tbPlayerGavelRecess()
//   - tbPlayerGavelConfess()
//   - sigCombatButtonsHTML(mons, p)
//   - sigCombatAct(act)
//   - sigFieldMonster(mdef, member, ctx, opts, rec)
// rules:
//   - point_before_redact: the redactor's handles point at a named target a full round before the redaction lands; the point is narrated + phase-badged, never silent. (code: sigRedactor)
//   - loudest_first: a carried decoy (items.json decoy:true) is redacted before anything else, and is destroyed doing it. (code: sigRedactorChooseTarget)
//   - quiet_starves: two consecutive player turns with no aggressive verb starve the redactor (its attacks weaken); a third starves it out of the fight. (code: sigOnPlayerTurnStart)
//   - trial_procedure: the gavel accuses (consuming its turn), waits a full round, then the verdict falls; object/recess/confess are real mid-trial motions with real costs (fame / the action / the record). (code: sigGavel)
//   - frontal_shield: strikes from the gavel's facing arc hit the sound-block (x0.35); flanking bypasses — position matters. (code: sigOffenseMods)
//   - ratings_honest: the focus group's loved/hated slate is announced every round and pinned in the combat menu; loved is buffed-and-answered, hated is safe-but-suppressed. (code: sigFocusGroup)
//   - mouths_first: mouth-head parts are the damageable core — popping all three kills the group; eye-heads only mark and cannot be struck down. (code: sigDamageWrap)
//   - boredom_walks: three consecutive boring player turns and the group loses interest and leaves; rage locks the walkout off. (code: sigOnPlayerTurnStart)
//   - offscreen_real: villager field fights run the same signatures through sigFieldMonster — villagers face the real fight, not a summary. (code: sigFieldMonster)
// consumes:
//   - Game.tbfight
//   - Game.say
//   - Game.tbFighter
//   - Game.tbDamage
//   - Game.tbIsPlayerTurn
//   - Game.tbBeginTurn
//   - Game.tbEndCheck
//   - Game.tbRefreshTelegraphUI
//   - Game.encSetPhase
//   - Game.encUsesFifo
//   - Game.equippedWeapon
//   - Game.progState
//   - Game.havenViewership
//   - Game.bumpTrust
//   - Game.recordMoment
//   - Game.useAbility
//   - Scattering.combat
/* SIGNATURE MECHANICS, WAVE 3 BATCH A — src/js/sigW3a.js
 *
 * Steve (2026-10-10): build all 26 wave-3/4/5 signature monster mechanics
 * properly, in wave order, one at a time. Telegraph honesty is the law.
 *
 * Batch A: THE REDACTOR, GAVEL, THE FOCUS GROUP.
 *
 * Architecture: hooks register into the global MonsterBehaviorHooks dict
 * (declared per monster in src/data/monsterBehaviors.json, run via
 * mbRunPreTurn at the top of tbMonsterTurn). This module never edits
 * game.js — it wraps methods (the journal.js pattern) and registers hooks
 * (the partyTactics.js pattern). Set MECHANIC=off in node to skip all
 * registration (proof-test BEFORE mode).
 */
(function (_g) {
  'use strict';
  var G = (_g.Scattering && _g.Scattering.Game) ? _g.Scattering.Game : null;
  if (!G) return;

  // MECHANIC=off: skip ALL registration — the proof scripts' BEFORE mode.
  var MECHANIC_ON = true;
  try {
    if (typeof process !== 'undefined' && process.env && process.env.MECHANIC === 'off') MECHANIC_ON = false;
  } catch (e) {}

  function say(game, text) {
    try { game.say(text); } catch (e) {}
  }

  function roll2(range) {
    try {
      var c = (_g.Scattering || {}).combat;
      if (c && typeof c.roll === 'function') return c.roll(range);
    } catch (e) {}
    return range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function mdefId(m) { return (m && m.mdef && m.mdef.id) || null; }
  function isRedactor(m) { return m && m.kind === 'monster' && mdefId(m) === 'redactor'; }
  function isGavel(m) { return m && m.kind === 'monster' && mdefId(m) === 'gavel'; }
  function isFocusLead(m) { return m && m.kind === 'monster' && mdefId(m) === 'focus_group'; }
  function isFocusEye(m) { return !!(m && mdefId(m) === 'focus_group_eye'); } // kind-agnostic: eyes spawn as kind 'ally'

  function liveFighter(game, pred) {
    try {
      var f = game.tbfight;
      if (!f || f.over) return null;
      for (var i = 0; i < f.fighters.length; i++) {
        var x = f.fighters[i];
        if (x && x.alive && !x.fled && pred(x)) return x;
      }
    } catch (e) {}
    return null;
  }
  function sigLiveRedactor(game) { return liveFighter(game, isRedactor); }
  function sigFocusLead(game) { return liveFighter(game, isFocusLead); }
  function sigLiveGavelTrial(game) {
    try {
      var f = game.tbfight;
      if (!f || f.over) return null;
      for (var i = 0; i < f.fighters.length; i++) {
        var x = f.fighters[i];
        if (isGavel(x) && x.alive && !x.fled && x.sigG && x.sigG.trial) return x;
      }
    } catch (e) {}
    return null;
  }

  // ---- player verb tracking -------------------------------------------
  // Verbs are recorded per successful player action; evaluated per turn at
  // the next tbBeginTurn. Aggressive verbs feed the redactor's starve
  // clock; boring verbs feed the focus group's walkout clock.
  var AGGRESSIVE = { strike: 1, scream: 1, ability: 1, flip: 1, shout: 1 };
  var BORING = { wait: 1, study: 1, offer: 1, talk: 1 };
  function sigIsAggressive(v) { return !!AGGRESSIVE[v]; }
  function sigIsBoring(v) { return !!BORING[v]; }

  function sigNoteVerb(game, verb) {
    try {
      var f = game.tbfight;
      if (!f || f.over) return;
      f.sigTurnVerbs = f.sigTurnVerbs || [];
      f.sigTurnVerbs.push(verb);
      f.sigVerbCounts = f.sigVerbCounts || {};
      f.sigVerbCounts[verb] = (f.sigVerbCounts[verb] || 0) + 1;
    } catch (e) {}
  }

  function sigVerbName(v) {
    if (v === 'dodge') return 'DODGE (move)';
    return String(v || '').toUpperCase();
  }

  // Runs at the START of each player turn, evaluating the turn that just ended.
  function sigOnPlayerTurnStart(game) {
    var f = null;
    try { f = game.tbfight; } catch (e) {}
    if (!f || f.over) return;
    var p = null;
    try { p = game.tbFighter('p'); } catch (e) {}
    // A focused dodge covers your turn through the monsters' answers — a new
    // turn means a new round: the stance comes down.
    if (p) { p.sigDodging = false; p.sigDodgeAnswered = false; }
    if (!f.sigHadTurn) { f.sigHadTurn = true; f.sigTurnVerbs = []; return; }
    var verbs = f.sigTurnVerbs || [];
    f.sigTurnVerbs = [];
    // REDACTOR: quiet turns starve it.
    var red = sigLiveRedactor(game);
    if (red) {
      var R = red.sigR || (red.sigR = { phase: 'drift', target: null, quiet: 0, starved: false, cycle: 0, cool: 0, weakNoted: false });
      var aggressive = false;
      for (var i = 0; i < verbs.length; i++) if (sigIsAggressive(verbs[i])) { aggressive = true; break; }
      if (aggressive) {
        if (R.starved) say(game, 'The bar steadies — it found something loud to redact. (No longer starving.)');
        R.quiet = 0; R.starved = false; R.weakNoted = false;
      } else {
        R.quiet++;
        if (R.quiet === 2 && !R.starved) {
          R.starved = true;
          say(game, 'The bar thins, flickers — nothing left loud enough to redact. It is STARVING. (Its attacks weaken; starve it one more turn and it flees.)');
        }
      }
    }
    // FOCUS GROUP: boring turns bore it out.
    var lead = sigFocusLead(game);
    if (lead && lead.sigFG && !lead.sigFG.neverBored) {
      var boring = verbs.length === 0;
      if (!boring) {
        boring = true;
        for (var j = 0; j < verbs.length; j++) if (!sigIsBoring(verbs[j])) { boring = false; break; }
      }
      if (boring) {
        lead.sigFG.bored++;
        if (lead.sigFG.bored >= 3) {
          say(game, 'The murmur thins... wanders... "Next." They\'re leaving. Stay boring. (The Focus Group loses interest and LEAVES.)');
          for (var k = 0; k < f.fighters.length; k++) {
            var o = f.fighters[k];
            if (o && o.alive && !o.fled && (isFocusLead(o) || isFocusEye(o))) o.fled = true;
          }
          try { game.tbEndCheck(); } catch (e) {}
        } else {
          say(game, 'The murmur thins... (' + lead.sigFG.bored + '/3 boring rounds — they\'re losing interest. Stay boring.)');
        }
      } else if (lead.sigFG.bored > 0) {
        lead.sigFG.bored = 0;
        say(game, 'The murmur perks up — oh, something\'s HAPPENING. (Boredom reset.)');
      }
    }
  }

  // ---- THE REDACTOR ----------------------------------------------------
  // Each cycle: POINT (names the target, a full round of warning) then
  // REDACT. Rotation: weapon -> last turn -> footing, but a carried decoy
  // is ALWAYS redacted first (it redacts the loudest thing). Two quiet
  // turns starve it; a third starves it out of the fight.

  function sigFindDecoy(game) {
    try {
      var inv = (game.state.scholar || {}).inventory || [];
      var defs = game.data.items || [];
      for (var i = 0; i < inv.length; i++) {
        var it = inv[i];
        if (!it) continue;
        var def = null;
        for (var j = 0; j < defs.length; j++) {
          if (defs[j].id === it.itemId) { def = defs[j]; break; }
        }
        if (def && def.decoy) return { item: it, def: def, name: def.name || 'decoy' };
      }
    } catch (e) {}
    return null;
  }

  function sigRedactorChooseTarget(game, m) {
    var R = m.sigR;
    // Loudest first: the decoy.
    var decoy = sigFindDecoy(game);
    if (decoy) return { kind: 'decoy', label: 'your ' + decoy.name, item: decoy.item };
    var w = null;
    try { w = game.equippedWeapon ? game.equippedWeapon() : null; } catch (e) {}
    var hasWeapon = !!(w && !w.unarmed);
    var f = null;
    try { f = game.tbfight; } catch (e) {}
    var lastStrike = f && f.sigLastStrike;
    var order = (R.cycle || 0) % 3;
    if (order === 0 && hasWeapon) return { kind: 'weapon', label: 'your ' + (w.name || 'weapon') };
    if (order <= 1 && lastStrike && lastStrike.dmg > 0) {
      var t = null;
      try { t = game.tbFighter(lastStrike.target); } catch (e) {}
      if (t && t.alive && !t.fled) return { kind: 'lastTurn', label: 'your last turn', strike: lastStrike };
    }
    return { kind: 'footing', label: 'your footing' };
  }

  function sigRedactorShove(game, m) {
    var f = null, p = null;
    try { f = game.tbfight; p = game.tbFighter('p'); } catch (e) {}
    if (!f || !p) return;
    var opts = [];
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      var nx = p.mx + dx, ny = p.my + dy;
      // Interior tiles only — the grid edges are the flee-by-barrier.
      if (nx < 1 || nx > 7 || ny < 1 || ny > 7) continue;
      var blocked = false;
      for (var i = 0; i < f.fighters.length; i++) {
        var o = f.fighters[i];
        if (o !== p && o.alive && !o.fled && o.mx === nx && o.my === ny) { blocked = true; break; }
      }
      if (!blocked) opts.push([nx, ny]);
    }
    if (!opts.length) {
      say(game, 'The handles grab your FOOTING — but there is nowhere to put you. The redaction slips.');
      return;
    }
    var pick = opts[Math.floor(Math.random() * opts.length)];
    p.mx = pick[0]; p.my = pick[1];
    try { game.state.scholar.mx = pick[0]; game.state.scholar.my = pick[1]; } catch (e) {}
    say(game, 'The handles grab your FOOTING — the ground under you is redacted. You are somewhere else now.');
  }

  function sigRedactorRedact(game, m) {
    var R = m.sigR;
    var f = null, p = null;
    try { f = game.tbfight; p = game.tbFighter('p'); } catch (e) {}
    var t = R.target;
    if (R.starved) {
      say(game, 'It tries to redact — but it is starving. The handles close on nothing.');
    } else if (!t) {
      say(game, 'The handles grasp — and find nothing worth redacting.');
    } else if (t.kind === 'decoy') {
      try {
        var inv = game.state.scholar.inventory || [];
        var ix = inv.indexOf(t.item);
        if (ix >= 0) inv.splice(ix, 1);
      } catch (e) {}
      say(game, 'The handles close on ' + t.label + ' — and it goes QUIET. Forever. The redaction took the loudest thing. (Decoy consumed.)');
    } else if (t.kind === 'weapon' && p) {
      var wname = String(t.label).replace(/^your /, '');
      p.sigRedactWeapon = { untilRound: (f ? f.round : 0) + 2, name: wname, told: false };
      say(game, 'The handles close around ' + t.label + ' — REDACTED. For two rounds it is just a shape in your hands. (Strikes are unarmed.)');
    } else if (t.kind === 'footing') {
      sigRedactorShove(game, m);
    } else if (t.kind === 'lastTurn' && t.strike) {
      var tgt = null;
      try { tgt = game.tbFighter(t.strike.target); } catch (e) {}
      if (tgt && tgt.alive && !tgt.fled && t.strike.dmg > 0) {
        tgt.hp = Math.min(tgt.maxHp, tgt.hp + t.strike.dmg);
        var tnm = 'it';
        try { tnm = (game.encShortLabel && game.encShortLabel(tgt)) || tgt.name || 'it'; } catch (e2) {}
        say(game, 'The Redactor redacts your last turn — the wound on ' + tnm + ' un-writes itself. It never happened. (+' + t.strike.dmg + ' HP)');
      } else {
        say(game, 'It reaches for your last turn — but there is nothing solid to un-write. It redacts your footing instead.');
        sigRedactorShove(game, m);
      }
    }
    R.target = null;
    R.phase = 'drift';
    R.cycle = (R.cycle || 0) + 1;
    R.cool = 1; // one drift turn between cycles — the bar re-sets its handles
    try { if (game.encUsesFifo(m)) game.encSetPhase(m, 'redact'); } catch (e) {}
  }

  function sigRedactorHook(game, m) {
    var f = null;
    try { f = game.tbfight; } catch (e) {}
    if (!f || f.over) return false;
    if (!m.sigR) m.sigR = { phase: 'drift', target: null, quiet: 0, starved: false, cycle: 0, cool: 0, weakNoted: false };
    var R = m.sigR;
    // Starved out: nothing left loud enough to redact.
    if (R.starved && R.quiet >= 3) {
      say(game, 'The bar thins to a line, then to nothing. Nothing left loud enough to redact. It starves — and goes.');
      m.fled = true;
      try { if (game.encUsesFifo(m)) game.encSetPhase(m, 'drift'); } catch (e) {}
      try { game.tbEndCheck(); } catch (e2) {}
      return true;
    }
    if (R.phase === 'point' && R.target) {
      sigRedactorRedact(game, m);
      try { game.tbRefreshTelegraphUI(); } catch (e) {}
      try { if (game.tbEndCheck()) return true; } catch (e2) {}
      return false;
    }
    if (R.cool > 0) { R.cool--; return false; }
    // POINT — a full round of warning. The handles ARE the telegraph.
    var target = sigRedactorChooseTarget(game, m);
    R.target = target;
    R.phase = 'point';
    say(game, 'Its white edge-handles grab toward ' + target.label + ' — POINTING. Whatever it points at goes quiet. The handles ARE the telegraph. (Redaction lands next round.)');
    try { if (game.encUsesFifo(m)) game.encSetPhase(m, 'point'); } catch (e) {}
    try { game.audioEvent('redactorPoint'); } catch (e2) {}
    try { game.tbRefreshTelegraphUI(); } catch (e3) {}
    return false;
  }

  // ---- GAVEL -----------------------------------------------------------
  // It holds a TRIAL from the player's event log: ACCUSE (consumes its
  // turn, names a real logged action), a full round for mid-trial motions,
  // then the VERDICT falls. Bound by procedure: OBJECT (cite precedent —
  // costs 3 viewership), DEMAND RECESS (delays one round, once per trial),
  // CONFESS FIRST (smaller hit, but witnesses remember). Frontal strikes
  // hit the sound-block shield (x0.35); flanking bypasses it.

  function sigGavelPickCrime(game, m) {
    var moments = null;
    try {
      var pg = game.progState ? game.progState() : null;
      moments = (pg && pg.moments) || [];
    } catch (e) {}
    // Always the freshest footage — the most recent thing you did. A
    // confession stays on top until you do something worse: it follows you.
    if (moments && moments.length) {
      var pick = moments[0];
      return 'Day ' + pick.day + ': ' + pick.text;
    }
    return 'EXISTING WITHOUT A PERMIT (the docket is empty — the System is confident you will do something)';
  }

  function sigGavelHook(game, m) {
    var f = null;
    try { f = game.tbfight; } catch (e) {}
    if (!f || f.over) return false;
    if (!m.sigG) {
      m.sigG = { trial: null, cool: 1, facing: null, lastMx: m.mx, lastMy: m.my, trials: 0 };
      try {
        var p0 = game.tbFighter('p');
        if (p0) m.sigG.facing = { x: Math.sign(p0.mx - m.mx), y: Math.sign(p0.my - m.my) };
      } catch (e) {}
    }
    var g = m.sigG;
    // Facing tracks movement: the block guards where it last walked.
    if (m.mx !== g.lastMx || m.my !== g.lastMy) {
      g.facing = { x: Math.sign(m.mx - g.lastMx), y: Math.sign(m.my - g.lastMy) };
      g.lastMx = m.mx; g.lastMy = m.my;
    }
    if (g.trial) {
      var trial = g.trial;
      if (trial.delayed) {
        trial.delayed = false;
        say(game, '⏳ RECESS. The gavel lowers — the verdict waits one more round. (It WILL fall.)');
        try { if (game.encUsesFifo(m)) game.encSetPhase(m, 'accuse'); } catch (e) {}
        return true;
      }
      var dmg = roll2([40, 60]);
      var mult = trial.objected ? 0.5 : trial.confessed ? 0.4 : 1;
      dmg = Math.max(1, Math.round(dmg * mult));
      if (trial.confessed) {
        say(game, '🔨 THE VERDICT FALLS: "' + trial.crime + '" — GUILTY. You confessed first; the gavel falls lighter. But everyone heard. (' + dmg + ')');
      } else if (trial.objected) {
        say(game, '🔨 THE VERDICT FALLS: "' + trial.crime + '" — GUILTY. (Objection sustained — softened to ' + dmg + '.)');
      } else {
        say(game, '🔨 THE VERDICT FALLS: "' + trial.crime + '" — GUILTY. (' + dmg + ')');
      }
      try { game.tbDamage('p', dmg, "the Gavel's VERDICT", m.key); } catch (e) {}
      g.trial = null;
      g.cool = 2;
      try { if (game.encUsesFifo(m)) game.encSetPhase(m, 'verdict'); } catch (e2) {}
      try { game.audioEvent('gavelVerdict'); } catch (e3) {}
      try { if (game.tbEndCheck()) return true; } catch (e4) {}
      return true;
    }
    if (g.cool > 0) { g.cool--; return false; }
    // ACCUSE — it names your crime first, a full round before the verdict.
    g.trials = (g.trials || 0) + 1;
    var crime = sigGavelPickCrime(game, m);
    g.trial = { crime: crime, objected: false, recessUsed: false, confessed: false, delayed: false };
    try {
      var p = game.tbFighter('p');
      if (p) g.facing = { x: Math.sign(p.mx - m.mx), y: Math.sign(p.my - m.my) };
    } catch (e) {}
    say(game, '⚖️ "THE ACCUSED WILL RISE." The Gavel has been reviewing footage of you. It names your crime: "' + crime + '" The sound-block swings forward. The verdict falls NEXT round. (⚖️ Object — cite precedent · ⏳ Demand recess · 🙏 Confess first)');
    try { if (game.encUsesFifo(m)) game.encSetPhase(m, 'accuse'); } catch (e2) {}
    try { game.audioEvent('gavelAccuse'); } catch (e3) {}
    return true;
  }

  // ---- THE FOCUS GROUP -------------------------------------------------
  // 5-7 floating heads: three all mouth (the lead fighter carries two
  // mouth-head PARTS — popping all three kills the group), the rest all
  // eye (separate fighters; they mark, they don't attack, they can't be
  // struck down). Every round the murmur DELIBERATES audibly: a loved and a
  // hated verb, announced and pinned in the combat menu. Loved is buffed by
  // the System but ANSWERED by a mouth-head; hated is safe but suppressed.
  // Three boring rounds and they lose interest and LEAVE. Rage locks the
  // walkout off — rage is delicious.

  var FG_EYE_MDEF = {
    id: 'focus_group_eye', name: 'Eye-head', emoji: '👁️',
    hp: [1, 1], speed: 3, behavior: 'swarm', wave: 3, pierce: 0,
    attack: { name: 'Watch', damage: [0, 0], telegraph: 'It watches.', pattern: { type: 'direct' }, damageType: 'psychic' },
  };

  function sigFocusSpawnEyes(game, m) {
    var f = null;
    try { f = game.tbfight; } catch (e) {}
    if (!f) return 0;
    // Heads: the lead (mouth) + 2 mouth-parts on the lead + eyes = 5-7.
    var nEyes = 2 + Math.floor(Math.random() * 3);
    var placed = 0;
    for (var i = 0; i < nEyes; i++) {
      var nx = m.mx, ny = m.my, found = false;
      for (var tries = 0; tries < 12 && !found; tries++) {
        var cx = Math.max(1, Math.min(7, m.mx + Math.floor(Math.random() * 5) - 2));
        var cy = Math.max(1, Math.min(7, m.my + Math.floor(Math.random() * 5) - 2));
        var occ = false;
        for (var k = 0; k < f.fighters.length; k++) {
          var o = f.fighters[k];
          if (o.alive && !o.fled && o.mx === cx && o.my === cy) { occ = true; break; }
        }
        if (!occ) { nx = cx; ny = cy; found = true; }
      }
      var key = 'fg_eye_' + (i + 1);
      var dupe = 1;
      try {
        while (game.tbFighter(key)) { dupe++; key = 'fg_eye_' + (i + 1) + '_' + dupe; }
      } catch (e) {}
      f.fighters.push({
        key: key, kind: 'monster', mdef: FG_EYE_MDEF,
        name: 'an eye-head', emoji: '👁️',
        mx: nx, my: ny, hp: 1, maxHp: 1,
        alive: true, fled: false, speed: 3, moveLeft: 3, acted: false,
      });
      try {
        if (f.order.indexOf(key) < 0) f.order.push(key);
      } catch (e2) {}
      placed++;
    }
    return placed;
  }

  var FG_RATED = ['strike', 'dodge', 'wait'];

  function sigFocusGroupHook(game, m) {
    var f = null;
    try { f = game.tbfight; } catch (e) {}
    if (!f || f.over) return false;
    if (!m.sigFG) {
      var slice = Math.max(20, Math.round(m.hp / 3));
      m.sigFG = { mouths: [slice, slice, slice], rating: null, marked: null, markedRound: -1, bored: 0, neverBored: false };
      var nEyes = sigFocusSpawnEyes(game, m);
      var heads = 3 + nEyes;
      say(game, '👥 ' + heads + ' heads rise out of the murmur — three all MOUTH, the rest all EYE. "Ooh, a new one. Show us something." (Kill the mouth-heads — the eyes only mark you.)');
      try { if (game.encUsesFifo(m)) game.encSetPhase(m, 'murmur'); } catch (e) {}
    }
    // DELIBERATE — the ratings are audible and honest.
    var loved = FG_RATED[Math.floor(Math.random() * FG_RATED.length)];
    var hated = FG_RATED[Math.floor(Math.random() * FG_RATED.length)];
    var guard = 0;
    while (hated === loved && guard++ < 10) hated = FG_RATED[Math.floor(Math.random() * FG_RATED.length)];
    m.sigFG.rating = { loved: loved, hated: hated };
    say(game, '📊 THE MURMUR DELIBERATES — you can HEAR it: they LOVE your ' + sigVerbName(loved) + ', they HATE your ' + sigVerbName(hated) + '. (Loved: the System buffs it — but the mouths ANSWER it. Hated: safe, but suppressed.)');
    try { if (game.encUsesFifo(m)) game.encSetPhase(m, 'deliberate'); } catch (e) {}
    return false;
  }

  function sigFocusEyeHook(game, m) {
    var f = null;
    try { f = game.tbfight; } catch (e) {}
    if (!f || f.over) return false;
    var lead = sigFocusLead(game);
    if (!lead || !lead.alive || lead.fled) { m.fled = true; return true; }
    var SG = lead.sigFG;
    if (!SG) return true;
    // One mark per round — the rest just watch.
    if (SG.markedRound === f.round) return true;
    SG.markedRound = f.round;
    var counts = f.sigVerbCounts || {};
    var verb = 'strike', best = -1;
    for (var i = 0; i < FG_RATED.length; i++) {
      var v = FG_RATED[i];
      if ((counts[v] || 0) > best) { best = counts[v]; verb = v; }
    }
    SG.marked = verb;
    say(game, 'An eye-head\'s lens fixes on your ' + verb.toUpperCase() + '. Marked — (marked actions get rated harder.)');
    return true;
  }

  // ---- damage integration ----------------------------------------------
  // One tbDamage wrap carries all signature offense/defense modifiers, so
  // the generic interpreter, abilities, and ally strikes all flow through
  // the same honest math.

  function sigIsStrikeSource(game, sourceLabel, sourceKey) {
    if (sourceLabel === 'you') return true;
    try {
      var f = game.tbfight;
      if (!f || !sourceLabel) return false;
      for (var i = 0; i < f.fighters.length; i++) {
        var x = f.fighters[i];
        if (x && x.kind === 'villager' && x.alive && x.name === sourceLabel) return true;
      }
    } catch (e) {}
    return false;
  }

  function sigStrikeAttacker(game, sourceLabel) {
    try {
      if (sourceLabel === 'you') return game.tbFighter('p');
      var f = game.tbfight;
      if (!f) return null;
      for (var i = 0; i < f.fighters.length; i++) {
        var x = f.fighters[i];
        if (x && x.kind === 'villager' && x.alive && x.name === sourceLabel) return x;
      }
    } catch (e) {}
    return null;
  }

  function sigMouthsAlive(SG) {
    var ms = (SG && SG.mouths) || [];
    var n = 0;
    for (var i = 0; i < ms.length; i++) if (ms[i] > 0) n++;
    return n;
  }

  function sigOffenseMods(game, t, dmg, sourceLabel, sourceKey) {
    if (!t || !(dmg > 0)) return dmg;
    var f = null;
    try { f = game.tbfight; } catch (e) {}
    if (!f) return dmg;
    var out = dmg;
    // 1. GAVEL sound-block: frontal strikes ring off it.
    if (t.kind === 'monster' && mdefId(t) === 'gavel' && t.alive && sigIsStrikeSource(game, sourceLabel, sourceKey)) {
      var atk = sigStrikeAttacker(game, sourceLabel);
      var gc = (t.sigG || {}).facing;
      if (atk && gc && (gc.x || gc.y)) {
        var dot = (atk.mx - t.mx) * gc.x + (atk.my - t.my) * gc.y;
        if (dot > 0) {
          out = Math.max(1, Math.round(out * 0.35));
          say(game, 'The sound-block swings forward — the strike rings off it. (Frontal — flank it.)');
        }
      }
    }
    // 2. FOCUS GROUP: Deliberation weakens as mouths pop; answered dodges bite harder.
    if ((t.kind === 'player' || t.kind === 'villager') && sourceKey) {
      var src = null;
      try { src = game.tbFighter(sourceKey); } catch (e) {}
      if (src && isFocusLead(src) && src.alive && /deliberation/i.test(String(sourceLabel || ''))) {
        var alive = sigMouthsAlive(src.sigFG);
        if (alive < 3) out = Math.max(1, Math.round(out * (alive / 3)));
      }
      try {
        var p0 = game.tbFighter('p');
        if (t.kind === 'player' && p0 && p0.sigDodging && p0.sigDodgeAnswered && src &&
            (isFocusLead(src) || isFocusEye(src))) {
          out = Math.max(1, Math.round(out * 1.3));
        }
      } catch (e2) {}
    }
    // 3. FOCUS GROUP ratings on the player's strike.
    if (sourceLabel === 'you' && SIG_IN_STRIKE && (t.kind === 'monster' || t.kind === 'hostile')) {
      var lead = sigFocusLead(game);
      if (lead && lead.alive && !lead.fled && lead.sigFG && lead.sigFG.rating) {
        var RT = lead.sigFG.rating, marked = lead.sigFG.marked === 'strike';
        if (RT.hated === 'strike') {
          out = Math.max(1, Math.round(out * (marked ? 0.55 : 0.7)));
          say(game, 'The System boos your strike — suppressed. (They hate it. Safe, but weak.)');
        } else if (RT.loved === 'strike') {
          out = Math.max(1, Math.round(out * (marked ? 1.45 : 1.3)));
          say(game, 'The System LOVES your strike — it lands harder. (The mouths will answer.)');
        }
      }
    }
    // 4. REDACTOR starve weaken.
    if ((t.kind === 'player' || t.kind === 'villager') && sourceKey) {
      var src2 = null;
      try { src2 = game.tbFighter(sourceKey); } catch (e) {}
      if (src2 && isRedactor(src2) && src2.alive && src2.sigR && src2.sigR.starved) {
        out = Math.max(1, Math.round(out * 0.5));
        if (!src2.sigR.weakNoted) {
          src2.sigR.weakNoted = true;
          say(game, 'Starved — its Redact lands weakly.');
        }
      }
    }
    return out;
  }

  // Module-level re-entry flag: marks tbDamage calls issued by a real strike.
  var SIG_IN_STRIKE = false;

  // ---- Game methods -----------------------------------------------------

  var methods = {
    // DODGE: a real combat action, surfaced vs the focus group. Focus on
    // evasion: +dodge until your next turn, but you can't strike.
    tbPlayerDodge() {
      var f = null;
      try { f = this.tbfight; } catch (e) {}
      if (!f || !this.tbIsPlayerTurn()) return false;
      var p = null;
      try { p = this.tbFighter('p'); } catch (e2) {}
      if (!p) return false;
      if (p.acted) { say(this, 'Already acted this turn.'); return false; }
      p.acted = true; p.moveLeft = 0;
      var bonus = 0.35, answered = false;
      var lead = sigFocusLead(this);
      var RT = lead && lead.sigFG && lead.sigFG.rating;
      if (RT) {
        if (RT.loved === 'dodge') { bonus = 0.5; answered = true; }
        else if (RT.hated === 'dodge') { bonus = 0.2; }
        if (lead.sigFG.marked === 'dodge') bonus = RT.loved === 'dodge' ? 0.65 : RT.hated === 'dodge' ? 0.1 : bonus;
      }
      p.sigDodging = true; p.sigDodgeBonus = bonus; p.sigDodgeAnswered = answered;
      say(this, 'You drop low, eyes on the mouths — DODGING. (+' + Math.round(bonus * 100) + '% dodge until your next turn.' +
        (answered ? ' They LOVE it — the mouths are already answering.' : '') + ')');
      sigNoteVerb(this, 'dodge');
      try { this.tbAfterPlayerAction(); } catch (e3) {}
      return true;
    },

    // GAVEL mid-trial motions. Each spends the action; refusals don't.
    tbPlayerGavelObject() {
      var f = null;
      try { f = this.tbfight; } catch (e) {}
      if (!f || !this.tbIsPlayerTurn()) return false;
      var p = null;
      try { p = this.tbFighter('p'); } catch (e2) {}
      if (!p || p.acted) { say(this, 'Already acted this turn.'); return false; }
      var g = sigLiveGavelTrial(this);
      if (!g) { say(this, 'No trial is in session. (The Gavel isn\'t accusing anyone.)'); return false; }
      if (g.sigG.trial.objected) { say(this, 'You already objected this trial. (One objection per trial — procedure.)'); return false; }
      p.acted = true; p.moveLeft = 0;
      g.sigG.trial.objected = true;
      var cur = 0;
      try { cur = this.havenViewership ? this.havenViewership() : 0; } catch (e3) {}
      try { this.state.village.viewership = Math.max(0, cur - 3); } catch (e4) {}
      say(this, 'You OBJECT — cite precedent. "SUSTAINED," the Gavel rumbles, annoyed. The audience groans at the procedure. (-3 viewership — fame is the price of law. The verdict lands softer.)');
      sigNoteVerb(this, 'object');
      try { this.tbAfterPlayerAction(); } catch (e5) {}
      return true;
    },

    tbPlayerGavelRecess() {
      var f = null;
      try { f = this.tbfight; } catch (e) {}
      if (!f || !this.tbIsPlayerTurn()) return false;
      var p = null;
      try { p = this.tbFighter('p'); } catch (e2) {}
      if (!p || p.acted) { say(this, 'Already acted this turn.'); return false; }
      var g = sigLiveGavelTrial(this);
      if (!g) { say(this, 'No trial is in session. (The Gavel isn\'t accusing anyone.)'); return false; }
      if (g.sigG.trial.recessUsed) { say(this, '"DENIED." The court is losing patience. (One recess per trial.)'); return false; }
      p.acted = true; p.moveLeft = 0;
      g.sigG.trial.recessUsed = true;
      g.sigG.trial.delayed = true;
      say(this, 'You DEMAND A RECESS. "…GRANTED." The gavel hovers, then lowers. The verdict waits one more round. (It WILL fall.)');
      sigNoteVerb(this, 'recess');
      try { this.tbAfterPlayerAction(); } catch (e3) {}
      return true;
    },

    tbPlayerGavelConfess() {
      var f = null;
      try { f = this.tbfight; } catch (e) {}
      if (!f || !this.tbIsPlayerTurn()) return false;
      var p = null;
      try { p = this.tbFighter('p'); } catch (e2) {}
      if (!p || p.acted) { say(this, 'Already acted this turn.'); return false; }
      var g = sigLiveGavelTrial(this);
      if (!g) { say(this, 'No trial is in session. (The Gavel isn\'t accusing anyone.)'); return false; }
      if (g.sigG.trial.confessed) { say(this, 'You already confessed. (It\'s on the record.)'); return false; }
      p.acted = true; p.moveLeft = 0;
      var trial = g.sigG.trial;
      trial.confessed = true;
      try { if (this.recordMoment) this.recordMoment('Confessed before the Gavel: ' + String(trial.crime).slice(0, 100)); } catch (e3) {}
      try {
        for (var i = 0; i < f.fighters.length; i++) {
          var o = f.fighters[i];
          if (o && o.kind === 'villager' && o.alive && !o.fled && o.villagerId && this.bumpTrust) {
            this.bumpTrust(o.villagerId, -2, 'confessed before the Gavel');
          }
        }
      } catch (e4) {}
      say(this, 'You confess first — out loud, where everyone can hear. The gavel pauses. It will fall lighter. But witnesses remember. (The confession is on the record.)');
      sigNoteVerb(this, 'confess');
      try { this.tbAfterPlayerAction(); } catch (e5) {}
      return true;
    },

    // Combat-menu surface for signature mechanics. Rendered by app.js's
    // combatActionsHTML via the shared hook point (all batches reuse it).
    sigCombatButtonsHTML(mons, p) {
      var f = null;
      try { f = this.tbfight; } catch (e) {}
      if (!f || f.over || !p) return '';
      var html = '';
      try {
        if (!this.tbIsPlayerTurn()) return '';
      } catch (e2) { return ''; }
      // GAVEL trial motions.
      var g = sigLiveGavelTrial(this);
      if (g) {
        var tr = g.sigG.trial;
        html += '<div class="sig-strip">⚖️ TRIAL: &ldquo;' + escHtml(String(tr.crime).slice(0, 70)) + '&rdquo; — verdict next round.</div>';
        if (!p.acted) {
          html += '<button class="self-btn" data-sig-act="gavel-object"' + (tr.objected ? ' disabled' : '') +
            ' title="Cite precedent — objection sustained, verdict softened. Costs 3 viewership (fame).">⚖️ Object</button>';
          html += '<button class="self-btn" data-sig-act="gavel-recess"' + (tr.recessUsed ? ' disabled' : '') +
            ' title="Demand a recess — the verdict waits one more round.">⏳ Recess</button>';
          html += '<button class="self-btn" data-sig-act="gavel-confess"' +
            ' title="Confess first — smaller hit, but witnesses remember.">🙏 Confess</button>';
        }
      }
      // FOCUS GROUP ratings + dodge.
      var lead = sigFocusLead(this);
      if (lead && lead.sigFG && lead.sigFG.rating) {
        var RT = lead.sigFG.rating;
        html += '<div class="sig-strip">📊 RATINGS — LOVE: ' + escHtml(sigVerbName(RT.loved)) +
          ' · HATE: ' + escHtml(sigVerbName(RT.hated)) +
          (lead.sigFG.marked ? ' · MARKED: ' + escHtml(String(lead.sigFG.marked).toUpperCase()) : '') + '</div>';
        if (!p.acted && !p.sigDodging) {
          html += '<button class="self-btn" data-sig-act="dodge" title="Dodge — focus on evasion: +35% dodge until your next turn. The ratings may change the math.">🌀 Dodge</button>';
        }
      }
      // REDACTOR pointing.
      var red = sigLiveRedactor(this);
      if (red && red.sigR && red.sigR.phase === 'point' && red.sigR.target) {
        html += '<div class="sig-strip">👉 POINTING at ' + escHtml(red.sigR.target.label) + ' — redaction lands next round.</div>';
      }
      return html;
    },

    sigCombatAct(act) {
      if (act === 'gavel-object') return this.tbPlayerGavelObject();
      if (act === 'gavel-recess') return this.tbPlayerGavelRecess();
      if (act === 'gavel-confess') return this.tbPlayerGavelConfess();
      if (act === 'dodge') return this.tbPlayerDodge();
      return false;
    },

    // ---- villager field fights --------------------------------------
    // The same signatures, off-screen. ctx = { vHp, wb } (mutable);
    // opts = { vid, vName, mName, round, RR, lroll }; rec = fight record.
    // Returns true when the signature consumed this member's action.
    sigFieldMonster(mdef, member, ctx, opts, rec) {
      var id = (mdef && mdef.id) || null;
      try {
        if (id === 'redactor') return sigFieldRedactor(this, member, ctx, opts, rec);
        if (id === 'gavel') return sigFieldGavel(this, member, ctx, opts, rec);
        if (id === 'focus_group') return sigFieldFocus(this, member, ctx, opts, rec);
      } catch (e) {}
      return false;
    },
  };

  function sigFieldRedactor(game, member, ctx, opts, rec) {
    var S = member.sigR || (member.sigR = { phase: 'drift', cycle: 0, target: null, vDealtMark: 0, baseWb: null, wbUntil: -1 });
    if (S.baseWb === null) S.baseWb = ctx.wb;
    if (opts.round <= S.wbUntil) ctx.wb = Math.max(0, S.baseWb - 2);
    if (S.phase === 'point') {
      var t = S.target;
      if (t === 'weapon') {
        S.wbUntil = opts.round + 2;
        ctx.wb = Math.max(0, S.baseWb - 2);
        rec.log.push('R' + opts.round + ': the Redactor redacts ' + opts.vName + '\'s weapon — their strikes weaken for two rounds.');
      } else {
        var undone = rec.mDealt - S.vDealtMark;
        if (undone > 0) {
          member.hp = Math.min(member.maxHp, member.hp + undone);
          rec.log.push('R' + opts.round + ': the Redactor redacts ' + opts.vName + '\'s last turn — the wounds un-write. (+' + undone + ')');
        } else {
          rec.log.push('R' + opts.round + ': the Redactor reaches for ' + opts.vName + '\'s last turn — nothing solid to un-write.');
        }
      }
      S.phase = 'drift'; S.cycle++; S.vDealtMark = rec.mDealt;
      return false;
    }
    // POINT
    S.target = (S.cycle % 2 === 0 && ctx.wb > 0) ? 'weapon' : 'lastTurn';
    S.phase = 'point';
    S.vDealtMark = rec.mDealt;
    rec.log.push('R' + opts.round + ': the Redactor\'s handles point at ' + opts.vName + '\'s ' +
      (S.target === 'weapon' ? 'weapon' : 'last turn') + ' — the redaction lands next round.');
    return false;
  }

  function sigFieldGavel(game, member, ctx, opts, rec) {
    var S = member.sigG || (member.sigG = { trial: null, cool: 1 });
    if (S.trial) {
      if (S.trial.delayed) {
        S.trial.delayed = false;
        rec.log.push('R' + opts.round + ': RECESS. The gavel lowers — the verdict waits one more round.');
        return true;
      }
      var dmg = opts.lroll([40, 60]);
      ctx.vHp -= dmg; rec.vTaken += dmg;
      rec.log.push('R' + opts.round + ': 🔨 THE VERDICT FALLS: "' + S.trial.crime + '" — GUILTY. ' + opts.vName + ' takes ' + dmg + '.');
      S.trial = null; S.cool = 2;
      return true;
    }
    if (S.cool > 0) { S.cool--; return false; }
    S.trial = { crime: 'COUNT ONE: RAISING A HAND AGAINST THE COURT — ' + opts.vName + ' struck the court in round ' + opts.round + ' (the footage is this fight)', delayed: false };
    rec.log.push('R' + opts.round + ': ⚖️ "THE ACCUSED WILL RISE." The Gavel reviews the footage — "' + S.trial.crime + '" The verdict falls next round.');
    return true;
  }

  function sigFieldFocus(game, member, ctx, opts, rec) {
    var S = member.sigFG || (member.sigFG = { vDealtMark: 0 });
    // The villager only strikes: the murmur alternates love/hate for violence.
    var loved = (opts.round % 2 === 0);
    var dealt = rec.mDealt - S.vDealtMark;
    if (loved) {
      var bonus = Math.round(dealt * 0.3);
      if (bonus > 0) member.hp = Math.max(0, member.hp - bonus);
      var counter = opts.lroll([8, 12]);
      ctx.vHp -= counter; rec.vTaken += counter;
      rec.log.push('R' + opts.round + ': 📊 the murmur LOVES the violence — the System eggs ' + opts.vName + ' on (+' + bonus + '). A mouth-head answers (' + counter + ').');
    } else {
      var supp = Math.round(dealt * 0.3);
      if (supp > 0) member.hp = Math.min(member.maxHp, member.hp + supp);
      rec.log.push('R' + opts.round + ': 📊 the murmur is BORED by the violence — the System boos it (−' + supp + ', suppressed but safe).');
    }
    S.vDealtMark = rec.mDealt;
    return false;
  }

  // ---- installation ------------------------------------------------------

  if (MECHANIC_ON) {
    Object.assign(G, methods);

    // Hook registrations (run via mbRunPreTurn; declared per monster in
    // src/data/monsterBehaviors.json). Non-consuming unless noted.
    var SIG_HOOKS = {
      sigRedactor: function (game, m) { return sigRedactorHook(game, m); },
      sigGavel: function (game, m) { return sigGavelHook(game, m); },
      sigFocusGroup: function (game, m) { return sigFocusGroupHook(game, m); },
      // Eye-heads only mark — their whole turn is the lens. Consumes.
      sigFocusEye: function (game, m) { return sigFocusEyeHook(game, m); },
    };
    var HB = _g.MonsterBehaviorHooks;
    if (HB) Object.assign(HB, SIG_HOOKS);

    // ---- verb-tracking wraps ----
    function wrapVerb(name, verb) {
      var orig = G[name];
      if (typeof orig !== 'function') return;
      G[name] = function () {
        var r = orig.apply(this, arguments);
        try { if (r && this.tbfight && !this.tbfight.over) sigNoteVerb(this, verb); } catch (e) {}
        return r;
      };
    }
    wrapVerb('tbPlayerWait', 'wait');
    wrapVerb('tbPlayerMove', 'move');
    wrapVerb('tbPlayerStudy', 'study');
    wrapVerb('tbPlayerScream', 'scream');
    wrapVerb('tbPlayerGravityWell', 'ability');
    wrapVerb('tbPlayerShout', 'shout');
    wrapVerb('tbPlayerOfferFood', 'offer');
    wrapVerb('tbPlayerTalk', 'talk');
    wrapVerb('tbPlayerFlip', 'flip');

    // Strike: eye-head interception + last-strike record + strike flag.
    var origStrike = G.tbPlayerStrike;
    if (typeof origStrike === 'function') {
      G.tbPlayerStrike = function (targetKey) {
        var f = null, t = null;
        try { f = this.tbfight; t = f ? this.tbFighter(targetKey) : null; } catch (e) {}
        if (t && isFocusEye(t) && t.alive && !t.fled && f && !f.over) {
          var p = null;
          try { p = this.tbFighter('p'); } catch (e2) {}
          try { if (!this.tbIsPlayerTurn()) return false; } catch (e3) { return false; }
          if (!p) return false;
          if (p.acted) { say(this, 'Already acted this turn.'); return false; }
          p.acted = true; p.moveLeft = 0;
          say(this, 'The eye-head blinks aside — it only watches. (Eye-heads don\'t attack. Kill the MOUTHS.)');
          sigNoteVerb(this, 'strike');
          try { this.tbAfterPlayerAction(); } catch (e4) {}
          return true;
        }
        var hpBefore = t ? t.hp : 0;
        SIG_IN_STRIKE = true;
        var r;
        try { r = origStrike.apply(this, arguments); }
        finally { SIG_IN_STRIKE = false; }
        try {
          if (r && f && !f.over) {
            sigNoteVerb(this, 'strike');
            var t2 = this.tbFighter(targetKey);
            f.sigLastStrike = { target: targetKey, dmg: Math.max(0, hpBefore - (t2 ? t2.hp : hpBefore)), round: f.round };
          }
        } catch (e5) {}
        return r;
      };
    }

    // Abilities: verb + the rage lock for the focus group walkout.
    var origUseAbility = G.useAbility;
    if (typeof origUseAbility === 'function') {
      G.useAbility = function () {
        var r = origUseAbility.apply(this, arguments);
        try {
          var f = this.tbfight;
          if (r && f && !f.over) {
            sigNoteVerb(this, 'ability');
            var aid = String(arguments[0] || '');
            if (/rage/i.test(aid)) {
              f.sigRaged = true;
              var lead = sigFocusLead(this);
              if (lead && lead.sigFG && !lead.sigFG.neverBored) {
                lead.sigFG.neverBored = true;
                say(this, 'The murmur SPIKES — rage is DELICIOUS. They will never leave a brawler. (Boredom is off the table.)');
              }
            }
          }
        } catch (e) {}
        return r;
      };
    }

    // Turn-level evaluation: quiet-starve + boredom walkout + dodge expiry.
    var origBegin = G.tbBeginTurn;
    if (typeof origBegin === 'function') {
      G.tbBeginTurn = function () {
        try {
          var c = this.tbCurrent ? this.tbCurrent() : null;
          if (c && c.kind === 'player') sigOnPlayerTurnStart(this);
        } catch (e) {}
        return origBegin.apply(this, arguments);
      };
    }

    // Redactor weapon redaction: the redacted item is just a shape.
    var origEquipped = G.equippedWeapon;
    if (typeof origEquipped === 'function') {
      G.equippedWeapon = function () {
        var w = origEquipped.call(this);
        try {
          var f = this.tbfight, p = null;
          if (f && !f.over) p = this.tbFighter('p');
          if (p && p.sigRedactWeapon && !w.unarmed) {
            var RW = p.sigRedactWeapon;
            if (f.round < RW.untilRound) {
              return { name: RW.name + ' (redacted)', bonus: 0, type: 'melee', range: 1, ammo: null, unarmed: true, redacted: true };
            } else if (!RW.told) {
              RW.told = true;
              say(this, 'Your ' + RW.name + ' un-redacts — the word comes back.');
            }
          }
        } catch (e) {}
        return w;
      };
    }

    // The single incoming/outgoing damage integration point.
    var origTbDamage = G.tbDamage;
    if (typeof origTbDamage === 'function') {
      G.tbDamage = function (targetKey, dmg, sourceLabel, sourceKey, opts) {
        var t = null;
        try { t = this.tbFighter(targetKey); } catch (e) {}
        var adj = dmg;
        try { adj = sigOffenseMods(this, t, adj, sourceLabel, sourceKey); } catch (e2) { adj = dmg; }
        // Focused dodge resolves before armor/footwork.
        try {
          if (t && t.kind === 'player' && t.sigDodging && (t.sigDodgeBonus || 0) > 0 && adj > 0) {
            if (Math.random() < t.sigDodgeBonus) {
              say(this, 'You slip aside — the dodge lands clean. (+' + Math.round(t.sigDodgeBonus * 100) + '% dodge)');
              return 0;
            }
          }
        } catch (e3) {}
        var dealt = origTbDamage.call(this, targetKey, adj, sourceLabel, sourceKey, opts);
        // Mouth-head parts: strikes wound the current mouth too. Overflow
        // carries to the next mouth so mouths and the body stay in lockstep.
        var fgMouthKill = false;
        try {
          if (t && isFocusLead(t) && dealt > 0 && sigIsStrikeSource(this, sourceLabel, sourceKey)) {
            var SG = t.sigFG || {};
            var mouths = SG.mouths || [];
            var spill = dealt;
            for (var i = 0; i < mouths.length && spill > 0; i++) {
              if (mouths[i] <= 0) continue;
              mouths[i] -= spill;
              if (mouths[i] <= 0) {
                spill = -mouths[i];
                mouths[i] = 0;
                var left = sigMouthsAlive(SG);
                say(this, 'A mouth-head pops like a soap bubble. The murmur dips. (' + left + ' mouth' +
                  (left === 1 ? '' : 's') + ' left — Deliberation weakens.)');
                if (left <= 0) fgMouthKill = true;
              } else spill = 0;
            }
          }
        } catch (e4) {}
        try {
          if (fgMouthKill) {
            say(this, 'The last mouth pops. Without mouths there are no ratings — the Focus Group comes apart.');
            var f2 = this.tbfight || {};
            var flist = f2.fighters || [];
            for (var k = 0; k < flist.length; k++) {
              var o = flist[k];
              if (o && isFocusEye(o) && o.alive && !o.fled) o.fled = true;
            }
            if (t && t.alive) origTbDamage.call(this, targetKey, Math.max(1, t.hp), 'the popping mouths', t.key, { quiet: true });
          }
        } catch (e5) {}
        // Loved-strike answer: a mouth-head bites back.
        try {
          if (t && t.kind === 'monster' && dealt > 0 && sigIsStrikeSource(this, sourceLabel, sourceKey)) {
            var lead = sigFocusLead(this);
            if (lead && lead.alive && !lead.fled && lead.sigFG && lead.sigFG.rating &&
                lead.sigFG.rating.loved === 'strike') {
              var marked = lead.sigFG.marked === 'strike';
              say(this, 'ANSWERED — a mouth-head bites back mid-rating. (They loved your strike.)');
              origTbDamage.call(this, 'p', roll2(marked ? [12, 18] : [8, 12]), 'an answering mouth-head', lead.key);
            }
          }
        } catch (e6) {}
        return dealt;
      };
    }
  }
})(typeof window !== 'undefined' ? window : global);
