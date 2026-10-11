// @ontology
// system: sig-w3c
// description: Wave 3 batch C signature combat mechanics (Steve 2026-10-10). THE CALLBACK wears a dead villager's face (funeral / name-it counterplay, borrowed moves). BUFFERING exists 3 seconds in the past (honest future-telegraphs, afterimage frames, pre-dodge or stand still). AD BREAK pauses the fight for a sponsored ad (progress bar, skip beat scaled by audience favor, look away, killable sponsor-creature).
// provides:
//   - cbHook (registered as MonsterBehaviorHooks.cbFace)
//   - bufHook (registered as MonsterBehaviorHooks.bufMirage)
//   - adHook (registered as MonsterBehaviorHooks.adBreak)
//   - sponsorClingHook (registered as MonsterBehaviorHooks.sponsorCling)
//   - Game.tbPlayerFuneral()
//   - Game.tbPlayerNameIt()
//   - Game.tbPlayerCloseEyes()
//   - Game.tbPlayerSkipAd()
//   - Game.tbPlayerLookAway()
//   - Game.sigW3cCombatButtons(mons, p)
//   - Game.sigW3cWireCombat(on, rerender)
//   - Game.sigW3cFieldRound(mdef, vid, round, rec, sigFx, ctx)
// rules:
//   - telegraph_honesty: every signature announcement describes exactly what the hook executes next (code: bufAnnounce -> bufExecutePending, adBar).
//   - face_never_living: the Callback's face is picked from corpse records only, excluding current roster members (code: sigPickFace).
//   - no_silent_actions: every signature beat narrates through game.say, including misses and refusals (code: all hooks and tbPlayer* actions).
//   - signature_interleaves: hooks add the signature layer; the generic encounter interpreter still runs on off-beats (code: hooks return false when not consuming).
// consumes:
//   - tbFighter, tbIsPlayerTurn, tbAfterPlayerAction, tbDamage, tbEndCheck, tbRefreshTelegraphUI, encSubject, corpses, convLineLog, havenViewership, say
/* SIG W3C — src/js/sigW3c.js
 *
 * Wave 3 batch C signature mechanics (Steve 2026-10-10 directive: build all
 * 26 wave-3/4/5 signature mechanics properly, in wave order, one at a time;
 * telegraph honesty is the law). Three monsters, three mechanics:
 *
 * 1. THE CALLBACK (ambush): wears the face of an ACTUAL dead villager from
 *    the run's corpse record (never a living villager; "a stranger" if no
 *    dead). Speaks in their voice with real village lines. Uses their moves
 *    (borrowed from their npcAbilities kit, telegraphed by whose face it
 *    wears). Counterplay: the FUNERAL (speak to it AS the person, say
 *    goodbye properly -> it loses coherence and comes apart, non-violent)
 *    or NAME IT AS NOT THEM (borrowed moves gone + a wound of truth).
 *
 * 2. BUFFERING (drifter): exists 3 seconds in the past. Its telegraphs
 *    ANNOUNCE its next action truthfully ("IT WILL STEP LEFT" -> it steps
 *    left). Afterimages trail it; the faintest frame is the real present.
 *    Player strikes hit the brightest frame by default -> MISS (you hit
 *    where it was). Counterplay: CLOSE YOUR EYES (next strike finds the
 *    faintest frame, but you don't see its announcements), or STAND
 *    PERFECTLY STILL (its predicted strike aims at your heading; no
 *    heading, no hit), or strike in the sync window right after it moves
 *    (frames snap together for one player turn).
 *
 * 3. AD BREAK (passive): periodically PAUSES the fight for an ad — progress
 *    bar, repositions + heals while you watch. SKIP AD beat appears as a
 *    real combat choice (earlier when the audience likes you: viewership
 *    scales it). LOOK AWAY starves the ad (halved gains) but your next
 *    strike is blind. A killable SPONSOR-CREATURE rides the glyph; killing
 *    it shortens the ad.
 */
(function (_g) {
  'use strict';
  var G = (_g.Scattering && _g.Scattering.Game) ? _g.Scattering.Game : null;
  if (!G) return;

  // MECHANIC=off (proof harness): skip ALL registration so the proof script
  // goes RED on the mechanic's absence, then green with it on. Guarded for
  // the browser (no process there) — the live game always registers.
  var SIGW3C_OFF = (typeof process !== 'undefined' && process && process.env && process.env.MECHANIC === 'off');

  function clamp8(n) { return Math.max(0, Math.min(8, n)); }
  function roll(range) {
    if (!range || range.length !== 2) return 8;
    return range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
  }
  function dmgRangeOf(m) {
    try {
      var r = m && m.mdef && m.mdef.attack && m.mdef.attack.damage;
      if (r && r.length === 2) return r;
    } catch (e) {}
    return [30, 50];
  }
  function liveMonster(game, id) {
    var f = game.tbfight;
    if (!f) return null;
    for (var i = 0; i < f.fighters.length; i++) {
      var x = f.fighters[i];
      if (x.mdef && x.mdef.id === id && x.alive && !x.fled) return x;
    }
    return null;
  }

  // ------------------------------------------------------------------
  // THE CALLBACK
  // ------------------------------------------------------------------

  // sigPickFace(game): the face is a REAL dead villager from this run's
  // corpse record — a name the player knew (prefer deaths they know about),
  // never anyone on the current living roster. Falls back to "a stranger".
  function sigPickFace(game) {
    var corpses = [];
    try {
      corpses = (game.corpses ? game.corpses() : []).filter(function (c) {
        return c && (c.kind === 'villager' || c.kind === 'person') && c.name && c.name !== 'someone';
      });
    } catch (e) {}
    var roster = [];
    try { roster = ((game.state || {}).village || {}).roster || []; } catch (e) {}
    var dead = corpses.filter(function (c) { return roster.indexOf(c.villagerId) === -1; });
    var known = dead.filter(function (c) { return c.deathKnown; });
    var pool = known.length ? known : dead;
    if (!pool.length) return { name: 'a stranger', vid: null, stranger: true, line: null, abilities: [], cause: null };
    var c = pool[Math.floor(Math.random() * pool.length)];
    // A REAL line they said: the village-wide conversation memory
    // (convLineLog tracks line text -> day last said, village-wide).
    var line = null;
    try {
      var lines = (typeof game.convLineLog === 'function') ? Object.keys(game.convLineLog()) : [];
      if (lines.length) line = lines[Math.floor(Math.random() * lines.length)];
    } catch (e) {}
    var abs = [];
    try { abs = ((((game.state || {}).village || {}).npcAbilities || {})[c.villagerId] || []); } catch (e) {}
    return { name: c.name, vid: c.villagerId || null, stranger: false, line: line, abilities: abs.slice(), cause: c.cause || null };
  }

  function cbAbilityName(game, id) {
    try {
      var list = game.data.abilities || [];
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name || id;
    } catch (e) {}
    return id;
  }

  // The dead villager's signature, borrowed. Maps a few combat-legible
  // abilities to real effects; anything else (or nothing) becomes a
  // generic borrowed swing in their stance.
  function cbBorrowedAbility(face) {
    var abs = (face && face.abilities) || [];
    var mapped = ['pocket_sand', 'rage', 'adrenaline_surge', 'cannibal_frenzy', 'blood_magic', 'scream_cheese', 'time_skip'];
    for (var i = 0; i < abs.length; i++) if (mapped.indexOf(abs[i]) !== -1) return abs[i];
    return abs.length ? abs[0] : null;
  }

  function cbEnsureFace(game, m) {
    if (!m.cbFace) {
      m.cbFace = sigPickFace(game);
      m.cbAbility = cbBorrowedAbility(m.cbFace);
      var face = m.cbFace;
      var subj = game.encSubject ? game.encSubject(m) : 'The Callback';
      game.say(subj + ' wears ' + face.name + '\'s face. The face is too symmetrical. The eyes don\'t track you — they don\'t track anything.');
      if (face.line) game.say('It speaks — in their voice, saying things they said: "' + face.line + '"');
      else game.say('It speaks — in their voice. Small talk. The kind of nothing people say when they\'re alive.');
      game.say('The wrongness is the telegraph. (The Callback wears the dead. Speak the funeral — or name it as NOT them.)');
      try { game.tbRefreshTelegraphUI(); } catch (e) {}
    }
    return m.cbFace;
  }

  function cbSpeak(game, m) {
    var face = m.cbFace || { name: 'them' };
    var bits = [
      'It says your name the way ' + face.name + ' said it.',
      face.line ? 'In their voice, half-remembered: "' + face.line + '"' : 'It hums something tuneless. ' + face.name + ' used to hum.',
      'The mouth smiles. ' + face.name + '\'s smile was never that even.',
    ];
    game.say(bits[Math.floor(Math.random() * bits.length)]);
  }

  function cbBorrowedMove(game, m) {
    var p = game.tbFighter('p');
    if (!p || !p.alive) return false;
    var face = m.cbFace || { name: 'them' };
    var ab = m.cbAbility;
    var abName = ab ? cbAbilityName(game, ab) : null;
    game.say('The face shifts — you recognize the stance. It moves like ' + face.name + ' moved.' +
      (abName ? ' It uses ' + abName + ', the way they did.' : ''));
    var dmg = 0;
    if (ab === 'pocket_sand') {
      p.blindTurns = Math.max(p.blindTurns || 0, 2);
      game.say('Sand — ' + face.name + '\'s sand — in your eyes. (Blinded 2 turns.)');
      dmg = game.tbDamage('p', roll([10, 16]), face.name + '\'s pocket sand', m.key);
    } else if (ab === 'rage' || ab === 'adrenaline_surge' || ab === 'cannibal_frenzy') {
      dmg = game.tbDamage('p', roll([35, 55]), face.name + '\'s fury', m.key);
    } else if (ab === 'blood_magic') {
      m.hp = Math.max(1, (m.hp || 1) - 10);
      game.say('It pays in its own borrowed blood. The face pales.');
      dmg = game.tbDamage('p', roll([30, 45]), face.name + '\'s blood price', m.key);
    } else if (ab === 'scream_cheese') {
      game.say('It screams — ' + face.name + '\'s scream, wrong in every particular.');
      dmg = game.tbDamage('p', roll([20, 30]), face.name + '\'s scream', m.key);
    } else if (ab === 'time_skip') {
      dmg = game.tbDamage('p', roll([18, 26]), face.name + '\'s stolen moment', m.key);
      if (p.alive) { game.say('It skips — and is suddenly somewhere else, mid-swing.'); dmg += game.tbDamage('p', roll([18, 26]), face.name + '\'s stolen moment', m.key); }
    } else {
      dmg = game.tbDamage('p', roll([25, 40]), face.name + '\'s borrowed swing', m.key);
    }
    try { game.tbRefreshTelegraphUI(); } catch (e) {}
    if (game.tbEndCheck && game.tbEndCheck()) return true;
    return true;
  }

  function cbDissolve(game, m) {
    m.cbDissolve = (m.cbDissolve == null ? 2 : m.cbDissolve);
    var face = m.cbFace || { name: 'them' };
    m.cbDissolve -= 1;
    if (m.cbDissolve <= 0) {
      // Final dispersal: the funeral is complete. Non-violent end.
      game.say('The last of the face comes off like a mask — and there\'s nothing under it anymore. ' +
        face.name + ' is gone, properly this time. What\'s left is quiet.');
      game.tbDamage(m.key, (m.hp || 1) + 1, 'coming apart', null, { quiet: true });
      try { game.tbRefreshTelegraphUI(); } catch (e) {}
      if (game.tbEndCheck && game.tbEndCheck()) return true;
      return true;
    }
    game.say('It falters. The too-symmetrical face sags like wet paper. In ' + face.name + '\'s voice, thinning: ' +
      (face.line ? '"' + face.line + '" — ' : '') + 'and then, quieter, in something like relief: "thank you."');
    var dmg = Math.max(1, Math.ceil((m.hp || 1) / 2));
    game.tbDamage(m.key, dmg, 'coming apart', null, { quiet: true });
    try { game.tbRefreshTelegraphUI(); } catch (e) {}
    if (game.tbEndCheck && game.tbEndCheck()) return true;
    return true;
  }

  function cbHook(game, m) {
    var f = game.tbfight;
    if (!f || f.over) return false;
    cbEnsureFace(game, m);
    // THE FUNERAL: it loses coherence — it can't act, it just comes apart.
    // Non-violent resolution, earned.
    if (m.cbCoherence === 0) return cbDissolve(game, m);
    m.cbTurns = (m.cbTurns || 0) + 1;
    if (!m.cbNamed && m.cbTurns % 3 === 0) cbSpeak(game, m);
    // Borrowed moves die with the naming: "it can't hold their moves anymore."
    // The borrowed beat consumes the turn; a pending generic wind-up honestly
    // waits it out (its countdown pauses while the hook consumes).
    if (!m.cbNamed && m.cbTurns % 4 === 2) return cbBorrowedMove(game, m);
    return false;
  }

  // ------------------------------------------------------------------
  // BUFFERING
  // ------------------------------------------------------------------

  function sigMirageOn(t) { return !!(t && !t.bufSynced); }

  function bufAnnounce(game, m, p, dx, dy) {
    if (m.bufAlt == null) m.bufAlt = false; // predict first, then alternate
    var eyesShut = !!(p && (p.bufEyesClosed || 0) > 0);
    var hidden = 'Your eyes are closed. Somewhere, frames stutter. (You can\'t see its next move.)';
    if (!m.bufAlt) {
      // PREDICTED STRIKE — honest: the cell is computed now and struck next turn.
      if (dx === 0 && dy === 0) {
        m.bufPending = { type: 'whiff' };
        game.say(eyesShut ? hidden : '"IT WILL STRIKE WHERE YOU ARE HEADING." You have no heading — you are perfectly still. It has nothing to catch.');
      } else {
        var px = clamp8(p.mx + dx), py = clamp8(p.my + dy);
        m.bufPending = { type: 'predict', x: px, y: py };
        game.say(eyesShut ? hidden : '"IT WILL STRIKE (' + px + ', ' + py + ') — WHERE YOU ARE HEADING." The faintest frame leans that way. (Move, or stand still — it can\'t catch what isn\'t moving.)');
      }
    } else {
      // ANNOUNCED STEP — honest: it will move exactly here.
      var dirs = [
        { dx: -1, dy: 0, n: 'left' }, { dx: 1, dy: 0, n: 'right' },
        { dx: 0, dy: -1, n: 'up' }, { dx: 0, dy: 1, n: 'down' },
      ].filter(function (d) { return m.mx + d.dx >= 0 && m.mx + d.dx <= 8 && m.my + d.dy >= 0 && m.my + d.dy <= 8; });
      var d0 = dirs.length ? dirs[Math.floor(Math.random() * dirs.length)] : { dx: 0, dy: 0, n: 'in place' };
      m.bufPending = { type: 'step', dx: d0.dx, dy: d0.dy, n: d0.n };
      game.say(eyesShut ? hidden : '"IT WILL STEP ' + d0.n.toUpperCase() + '." The afterimages smear toward ' + d0.n + '.');
    }
    m.bufAlt = !m.bufAlt;
    try { game.tbRefreshTelegraphUI(); } catch (e) {}
    return true; // the announcement IS the turn (wind-up)
  }

  function bufExecute(game, m, p) {
    var pend = m.bufPending;
    m.bufPending = null;
    if (pend.type === 'step') {
      m.bufEchoes = [{ x: m.mx, y: m.my }].concat(m.bufEchoes || []).slice(0, 2);
      m.mx = clamp8(m.mx + pend.dx);
      m.my = clamp8(m.my + pend.dy);
      game.say('It steps ' + pend.n + ' — exactly where it said it would. Three frames trail it; the faintest one is HERE. (Sync window — strike now.)');
    } else if (pend.type === 'predict') {
      var hit = !!(p && p.alive && p.mx === pend.x && p.my === pend.y);
      if (hit) {
        game.say('It strikes (' + pend.x + ', ' + pend.y + ') — where you were heading. It was honest. You walked into the honest thing.');
        game.tbDamage('p', roll(dmgRangeOf(m)), 'Catch Up', m.key);
      } else {
        game.say('It strikes (' + pend.x + ', ' + pend.y + ') — empty air. You weren\'t heading there after all.');
      }
    } else {
      game.say('It flails at the air beside you — no heading, no motion, nothing to catch. (Stand still: it can\'t catch what isn\'t moving.)');
    }
    // SYNC WINDOW: right after it moves, the frames snap together — strikes
    // land normally until its next turn.
    m.bufSynced = true;
    m.bufCd = 2;
    try { game.tbRefreshTelegraphUI(); } catch (e) {}
    if (game.tbEndCheck && game.tbEndCheck()) return true;
    return true;
  }

  function bufHook(game, m) {
    var f = game.tbfight;
    if (!f || f.over) return false;
    var p = game.tbFighter('p');
    // The sync window was the player's intervening turn — it lapses now.
    if (m.bufSynced) m.bufSynced = false;
    // Track the player's net movement across the turn boundary: this is the
    // heading Buffering reads.
    var dx = 0, dy = 0;
    if (p) {
      var prev = p._bufPrevPos;
      if (prev) { dx = p.mx - prev.mx; dy = p.my - prev.my; }
      p._bufPrevPos = { mx: p.mx, my: p.my };
    }
    if (m.bufPending) return bufExecute(game, m, p);
    // NOTE: no m.telegraph yield here — buffering's generic ('ambush') never
    // telegraphs, and telegraph-yielding deadlocks against patterns that
    // re-declare every turn (see adHook). A stale wind-up simply waits out
    // the signature beat (its countdown pauses while the hook consumes).
    if ((m.bufCd || 0) > 0) { m.bufCd -= 1; return false; } // generic attack interleaves
    return bufAnnounce(game, m, p, dx, dy);
  }

  // ------------------------------------------------------------------
  // AD BREAK
  // ------------------------------------------------------------------

  function adBar(ad) {
    var done = Math.floor(ad.progress || 0);
    var total = Math.max(1, Math.ceil(ad.total || 1));
    var s = '';
    for (var i = 0; i < total; i++) s += (i < done ? '▓' : '░');
    return 'AD ' + s + ' (' + done + '/' + total + ')';
  }

  function adDismissSponsor(game, m, why) {
    if (!m.adSponsorKey) return;
    try {
      var s = game.tbFighter(m.adSponsorKey);
      if (s && s.alive && !s.fled) {
        s.fled = true;
        game.say(why || 'The sponsor-creature tips its tiny hat and rides the folding glyph away. (No ad, no sponsor.)');
      }
    } catch (e) {}
    m.adSponsorKey = null;
  }

  function adSpawnSponsor(game, m) {
    var f = game.tbfight;
    if (!f) return;
    m.adCount = (m.adCount || 0) + 1;
    var skey = 'ad_sponsor_' + m.adCount;
    m.adSponsorKey = skey;
    m.adSponsorSlain = false;
    try {
      f.fighters.push({
        key: skey, kind: 'monster', name: 'Sponsor-creature', emoji: '🧚',
        mdef: { id: 'ad_sponsor', name: 'Sponsor-creature' },
        hp: 40, maxHp: 40, speed: 1,
        mx: m.mx, my: m.my,
        alive: true, fled: false, telegraph: null,
        moveLeft: 0, acted: false, clingSaid: false,
      });
      var idx = f.order.indexOf(m.key);
      if (idx >= 0) f.order.splice(idx + 1, 0, skey);
      else f.order.push(skey);
    } catch (e) {}
  }

  function adHook(game, m) {
    var f = game.tbfight;
    if (!f || f.over) return false;
    var p = game.tbFighter('p');
    // SPONSOR SLAIN: killing the sponsor-creature shortens the ad.
    if (m.adActive && m.adSponsorKey && !m.adSponsorSlain) {
      var sp = game.tbFighter(m.adSponsorKey);
      if (sp && !sp.alive) {
        m.adSponsorSlain = true;
        m.adActive.progress += 2;
        game.say('The sponsor-creature pops like a soap bubble. The ad stutters — the bar JUMPS forward. (Killing the sponsor shortens the ad.)');
      }
    }
    if (m.adActive) {
      var ad = m.adActive;
      var lookAway = !!(p && (p.adLookAway || 0) > 0);
      // THE AD'S POWER IS THAT YOU WATCH: looking away starves it.
      // Heal is 3%/tick (design call 2026-10-10, revised: 5% then 4% both
      // stalemated unarmed players — DPS 7.7/round vs heal 5.7/round left no
      // margin and fights ran 185-201+ rounds. 3% keeps the ad threatening
      // for geared players while letting even unarmed fights terminate).
      ad.progress += lookAway ? 0.5 : 1;
      var heal = Math.round((m.maxHp || 300) * 0.03 * (lookAway ? 0.5 : 1));
      if (heal > 0) m.hp = Math.min(m.maxHp || 9999, (m.hp || 0) + heal);
      // Reposition: it drifts — up to 2 cells away from the player — but never
      // beyond its own striking distance. The ad is a pause, not an exit:
      // drifting out of reach would trip the engine's disengage rule
      // ("no one in reach, no one chasing") and fizzle the fight.
      if (p) {
        for (var step = 0; step < 2; step++) {
          var nx = clamp8(m.mx + Math.sign(m.mx - p.mx));
          var ny = clamp8(m.my + Math.sign(m.my - p.my));
          if (Math.max(Math.abs(nx - p.mx), Math.abs(ny - p.my)) > 3) break;
          m.mx = nx; m.my = ny;
        }
      }
      game.say(adBar(ad) + (lookAway
        ? ' You\'re not watching — it heals slower, starved of attention.' + (heal > 0 ? ' (+' + heal + ' hp)' : '')
        : ' ...and you watch.') + (heal > 0 && !lookAway ? ' (+' + heal + ' hp)' : ''));
      if (ad.progress >= ad.total) {
        m.adActive = null;
        m.adCd = 4;
        adDismissSponsor(game, m, '"Thanks for watching." The glyph folds away, sponsor and all.');
      } else if (ad.progress >= ad.skipAt && !ad.skipOffered) {
        ad.skipOffered = true;
        game.say('⏭ SKIP AD is available. (Patience — or look away.)');
      }
      try { game.tbRefreshTelegraphUI(); } catch (e) {}
      if (game.tbEndCheck && game.tbEndCheck()) return true;
      return true;
    }
    // START THE AD. It pre-empts any pending generic wind-up — the pause is
    // the point, and the pre-emption is narrated so the vanished telegraph
    // is never a lie. (The generic re-declares every turn, so "wait for a
    // clean turn" would deadlock — telegraphs are perpetually pending.)
    m.adCd = (m.adCd == null ? 3 : m.adCd) - 1;
    if (m.adCd > 0) return false; // generic attack interleaves
    var preempted = !!m.telegraph;
    m.telegraph = null;
    // START THE AD. The bar is the telegraph. Skip comes sooner when the
    // audience likes you (viewership tiers). The skip beat always arrives one
    // tick before the bar fills — patience is a real strategy, and favor
    // makes the whole ad shorter (the beat comes sooner in absolute terms).
    var vw = 0;
    try { vw = (typeof game.havenViewership === 'function') ? game.havenViewership() : 0; } catch (e) {}
    var tier = vw >= 25 ? 2 : vw >= 12 ? 1 : 0;
    var total = Math.max(2, 4 - tier);
    m.adActive = { progress: 0, total: total, skipAt: Math.max(1, total - 1), skipOffered: false };
    adSpawnSponsor(game, m);
    if (preempted) game.say('The glyph unfolds mid-wind-up — the attack dies unspent, pre-empted by the break. (The ad pauses everything.)');
    game.say('⏸ AD BREAK. A giant glyph unfolds overhead — PROGRESS BAR: ' + adBar(m.adActive) +
      '. During the pause it repositions and heals, and you watch. ' +
      (tier > 0 ? '(The audience likes you — the sponsor is already nervous.) ' : '') +
      '(Kill the sponsor-creature riding the glyph to shorten it — or look away: the ad\'s power is that you WATCH.)');
    try { game.tbRefreshTelegraphUI(); } catch (e) {}
    if (game.tbEndCheck && game.tbEndCheck()) return true;
    return true;
  }

  function sponsorClingHook(game, m) {
    var f = game.tbfight;
    if (!f || f.over) return false;
    // No ad, no sponsor: ride the glyph out.
    var host = null;
    for (var i = 0; i < f.fighters.length; i++) {
      var x = f.fighters[i];
      if (x.mdef && x.mdef.id === 'ad_break' && x.adSponsorKey === m.key) { host = x; break; }
    }
    if ((!host || !host.alive || !host.adActive) && !m.fled && m.alive) {
      m.fled = true;
      game.say('The sponsor-creature tips its tiny hat and rides the folding glyph away. (No ad, no sponsor.)');
      try { game.tbRefreshTelegraphUI(); } catch (e) {}
      if (game.tbEndCheck && game.tbEndCheck()) return true;
      return true;
    }
    if (host) { m.mx = host.mx; m.my = host.my; } // ride the glyph
    if (!m.clingSaid && Math.random() < 0.4) {
      m.clingSaid = true;
      game.say('The sponsor-creature waves a tiny pennant. It looks thrilled to be here.');
    }
    try { game.tbRefreshTelegraphUI(); } catch (e) {}
    if (game.tbEndCheck && game.tbEndCheck()) return true;
    return true;
  }

  // ------------------------------------------------------------------
  // STRIKE INTERCEPT — the mirage, the closed eyes, the averted gaze
  // ------------------------------------------------------------------

  // sigStrikePre(game, targetKey): runs before the real tbPlayerStrike.
  // Returns {handled:true, value} to short-circuit, or null to fall through.
  function sigStrikePre(game, targetKey) {
    var f = game.tbfight;
    if (!f || f.over) return null;
    if (!game.tbIsPlayerTurn || !game.tbIsPlayerTurn()) return null;
    var p = game.tbFighter('p');
    if (!p || p.acted) return null;
    var t = game.tbFighter(targetKey);
    if (!t || !t.alive || t.fled) return null;
    var tid = t.mdef && t.mdef.id;
    var eyes = (p.bufEyesClosed || 0) > 0;
    var away = (p.adLookAway || 0) > 0;
    function consume(msg) {
      p.acted = true;
      if (p.bufEyesClosed > 0) p.bufEyesClosed -= 1;
      if (p.adLookAway > 0) p.adLookAway -= 1;
      game.say(msg);
      game.tbAfterPlayerAction();
      return { handled: true, value: true };
    }
    if (tid === 'buffering') {
      if (eyes) {
        // Closed eyes: swing at where it IS — the faintest frame. Falls
        // through to the real strike (the mirage can't fool shut eyes).
        game.say('You swing at where it IS — the faintest frame, not the projection.');
        return null;
      }
      if (sigMirageOn(t)) {
        if (away) return consume('You swing without looking — at frames you can\'t even see. The blow passes through light and noise. (Look away: you can\'t aim at what you won\'t watch.)');
        return consume('Your strike passes through the BRIGHTEST frame — light and noise. It was already gone; that frame is the past. (The faintest frame is the real present — close your eyes and swing at where it IS, or strike right after it moves.)');
      }
      game.say('The frames are snapped together — for one heartbeat it is all HERE. You strike.');
      return null;
    }
    if (eyes || away) {
      // Blind to everything else: the price of closed eyes / averted gaze.
      if (Math.random() < 0.5) {
        return consume(eyes
          ? 'You swing blind — the world is dark and swimmy. Missed. (Closed eyes find only the Buffering\'s faintest frame.)'
          : 'You swing without looking. Missed. (Look away: the ad starves — but so does your aim.)');
      }
      game.say(eyes ? 'Eyes closed, you swing on memory — and connect.' : 'You swing without looking — and connect anyway.');
      return null;
    }
    return null;
  }

  // ------------------------------------------------------------------
  // PLAYER COMBAT ACTIONS
  // ------------------------------------------------------------------

  var playerActions = {
    // THE FUNERAL: speak to it AS the person. Say goodbye properly.
    // It loses coherence -> non-violent resolution (it comes apart).
    tbPlayerFuneral: function () {
      var f = this.tbfight;
      if (!f || f.over || !this.tbIsPlayerTurn()) return false;
      var p = this.tbFighter('p');
      if (!p) return false;
      if (p.acted) { this.say('Already acted this turn.'); return false; }
      var m = liveMonster(this, 'callback');
      if (!m) { this.say('There\'s nothing here wearing the dead.'); return false; }
      if (m.cbCoherence === 0) { this.say('You already said goodbye. It\'s coming apart — let it.'); return false; }
      cbEnsureFace(this, m);
      var face = m.cbFace;
      p.acted = true;
      this.say('You look at the too-symmetrical face — at the eyes that don\'t track — and you speak to ' + face.name + ', not to it.');
      this.say('"I know you\'re gone, ' + face.name + '.' +
        (face.line ? ' You used to say "' + face.line + '" — I remember.' : ' I remember you.') +
        ' You don\'t have to wear this anymore. Goodbye."');
      this.say('Something in it breaks — cleanly, like ice going out on a river. It loses coherence.');
      m.cbCoherence = 0;
      m.cbDissolve = 2;
      try { this.tbRefreshTelegraphUI(); } catch (e) {}
      this.tbAfterPlayerAction();
      return true;
    },

    // NAME IT AS NOT THEM: the village's naming debate as combat.
    // Borrowed moves die; the truth wounds it.
    tbPlayerNameIt: function () {
      var f = this.tbfight;
      if (!f || f.over || !this.tbIsPlayerTurn()) return false;
      var p = this.tbFighter('p');
      if (!p) return false;
      if (p.acted) { this.say('Already acted this turn.'); return false; }
      var m = liveMonster(this, 'callback');
      if (!m) { this.say('There\'s nothing here wearing the dead.'); return false; }
      if (m.cbNamed) { this.say('Naming it again changes nothing — the words are already said.'); return false; }
      cbEnsureFace(this, m);
      var face = m.cbFace;
      p.acted = true;
      this.say('"You are NOT ' + face.name + '. ' + face.name + ' is dead. You are grief wearing a face. Take it OFF."');
      this.say('The stance falters. It stops using their voice — what\'s left is just wrong, with nothing to hide behind. (Its borrowed moves are gone.)');
      m.cbNamed = true;
      this.tbDamage(m.key, 15, 'the naming', 'p');
      try { this.tbRefreshTelegraphUI(); } catch (e) {}
      this.tbAfterPlayerAction();
      return true;
    },

    // CLOSE YOUR EYES: blind yourself for a round. Your next strike finds
    // the faintest frame — but you won't see its announcements until then,
    // and you're blind to everything else.
    tbPlayerCloseEyes: function () {
      var f = this.tbfight;
      if (!f || f.over || !this.tbIsPlayerTurn()) return false;
      var p = this.tbFighter('p');
      if (!p) return false;
      if (p.acted) { this.say('Already acted this turn.'); return false; }
      if (!liveMonster(this, 'buffering')) { this.say('You close your eyes. Nothing here is made of afterimages — you open them again, feeling silly.'); return false; }
      p.acted = true;
      p.bufEyesClosed = (p.bufEyesClosed || 0) + 1;
      this.say('You close your eyes. The afterimages go out like candles — there\'s only the faint tug of where it IS. (Your next strike will find the faintest frame. You won\'t see its announcements until then.)');
      try { this.tbRefreshTelegraphUI(); } catch (e) {}
      this.tbAfterPlayerAction();
      return true;
    },

    // SKIP AD: the beat appears when the bar is nearly full — sooner when
    // the audience likes you.
    tbPlayerSkipAd: function () {
      var f = this.tbfight;
      if (!f || f.over || !this.tbIsPlayerTurn()) return false;
      var p = this.tbFighter('p');
      if (!p) return false;
      if (p.acted) { this.say('Already acted this turn.'); return false; }
      var m = liveMonster(this, 'ad_break');
      if (!m || !m.adActive) { this.say('There\'s no ad playing.'); return false; }
      if (m.adActive.progress < m.adActive.skipAt) { this.say('The skip button hasn\'t appeared yet. (Patience — wait for the skip beat. Or look away.)'); return false; }
      p.acted = true;
      adDismissSponsor(this, m, '⏭ SKIP AD. The glyph folds itself away, offended. ("Thanks for—" gone.)');
      m.adActive = null;
      m.adCd = 4;
      this.say('Silence. Blessed, unsponsored silence. The fight resumes.');
      try { this.tbRefreshTelegraphUI(); } catch (e) {}
      this.tbAfterPlayerAction();
      return true;
    },

    // LOOK AWAY: the ad's power is that you WATCH. Starve it — but your
    // next strike is blind.
    tbPlayerLookAway: function () {
      var f = this.tbfight;
      if (!f || f.over || !this.tbIsPlayerTurn()) return false;
      var p = this.tbFighter('p');
      if (!p) return false;
      if (p.acted) { this.say('Already acted this turn.'); return false; }
      var m = liveMonster(this, 'ad_break');
      if (!m || !m.adActive) { this.say('There\'s no ad playing — nothing to look away from.'); return false; }
      if ((p.adLookAway || 0) > 0) { this.say('You\'re already looking away.'); return false; }
      p.acted = true;
      p.adLookAway = 1;
      this.say('You look away. The ad\'s power is that you WATCH — and you\'re not watching. (Its gains starve while you look away. Your next strike will be blind.)');
      try { this.tbRefreshTelegraphUI(); } catch (e) {}
      this.tbAfterPlayerAction();
      return true;
    },
  };

  // ------------------------------------------------------------------
  // COMBAT MENU SURFACE (app.js calls these; one insertion point each)
  // ------------------------------------------------------------------

  var menuSurface = {
    sigW3cCombatButtons: function (mons, p) {
      if (!p || p.acted) return '';
      function live(id) {
        for (var i = 0; i < mons.length; i++) {
          var x = mons[i];
          if (x.mdef && x.mdef.id === id && x.alive && !x.fled) return x;
        }
        return null;
      }
      var out = '';
      var cb = live('callback');
      if (cb) {
        if (cb.cbCoherence !== 0) out += '<button class="self-btn" id="c-funeral" title="Speak to it AS the person. Say goodbye properly. (The funeral)">🕯 Funeral</button>';
        if (!cb.cbNamed) out += '<button class="self-btn" id="c-nameit" title="Name it as NOT them — the village\'s naming debate as combat.">📛 Name it</button>';
      }
      if (live('buffering')) out += '<button class="self-btn" id="c-closeeyes" title="Close your eyes — your next strike finds the faintest frame, but you won\'t see its announcements.">🙈 Close eyes</button>';
      var ad = live('ad_break');
      if (ad && ad.adActive) {
        if (ad.adActive.progress >= ad.adActive.skipAt) out += '<button class="self-btn" id="c-skipad" title="Skip the ad.">⏭ Skip ad</button>';
        out += '<button class="self-btn" id="c-lookaway" title="Look away — the ad\'s power is that you WATCH. Its gains starve; your next strike is blind.">👀 Look away</button>';
      }
      return out;
    },
    sigW3cWireCombat: function (on, rerender) {
      var Gm = G;
      on('c-funeral', function () { Gm.tbPlayerFuneral(); rerender(); });
      on('c-nameit', function () { Gm.tbPlayerNameIt(); rerender(); });
      on('c-closeeyes', function () { Gm.tbPlayerCloseEyes(); rerender(); });
      on('c-skipad', function () { Gm.tbPlayerSkipAd(); rerender(); });
      on('c-lookaway', function () { Gm.tbPlayerLookAway(); rerender(); });
    },
  };

  // ------------------------------------------------------------------
  // FIELD FIGHTS — the same hook path, translated to the abstract model
  // ------------------------------------------------------------------

  function sigW3cFieldRound(mdef, vid, round, rec, sigFx, ctx) {
    if (!mdef || !rec || !sigFx || !ctx) return;
    var id = mdef.id;
    function log(t) { rec.log.push(t); }
    if (id === 'callback') {
      var face = sigPickFace(G);
      if (round === 1) log('R1: It wears ' + face.name + '\'s face. The eyes don\'t track. (' + ctx.vName + ' knew that walk — and knows they\'re dead.)');
      if (round % 3 === 0) {
        var b = ctx.lroll([10, 18]);
        sigFx.mDmgBonus += b;
        log('R' + round + ': the face shifts — ' + face.name + '\'s stance. It borrows their swing (+' + b + ').');
      }
    } else if (id === 'buffering') {
      sigFx.vMiss = true; // the mirage: strikes land on the bright frame
      if (round === 1) log('R1: Afterimages trail it; the faintest frame is the real present. (' + ctx.vName + '\'s strikes may catch only where it was.)');
      if (round % 3 === 0) {
        var pb = ctx.lroll([15, 25]);
        sigFx.mDmgBonus += pb;
        log('R' + round + ': "IT WILL STRIKE WHERE THEY\'RE HEADING." ' + ctx.vName + ' keeps pressing in — it lands (+' + pb + ').');
      }
    } else if (id === 'ad_break') {
      if (round % 4 === 0) {
        var members = ctx.members || [];
        var lead = members[0];
        if (lead && lead.hp > 0) {
          var heal = Math.round((lead.maxHp || 300) * 0.06);
          lead.hp = Math.min(lead.maxHp || 9999, lead.hp + heal);
          log('R' + round + ': ⏸ AD BREAK ▓▓▓▓ (4/4) — it repositions and heals +' + heal + ', and ' + ctx.vName + ' watches.');
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // REGISTRATION
  // ------------------------------------------------------------------

  if (!SIGW3C_OFF) {
    var HB = _g.MonsterBehaviorHooks;
    if (HB) {
      HB.cbFace = cbHook;
      HB.bufMirage = bufHook;
      HB.adBreak = adHook;
      HB.sponsorCling = sponsorClingHook;
    }
    Object.assign(G, playerActions);
    Object.assign(G, menuSurface);
    G.sigW3cFieldRound = sigW3cFieldRound;
    // Strike intercept: the mirage fools open eyes; closed eyes find the
    // faintest frame; averted gaze can't aim. Chain-safe wrapper.
    var _sigStrike0 = G.tbPlayerStrike;
    if (typeof _sigStrike0 === 'function') {
      G.tbPlayerStrike = function (targetKey) {
        var pre = null;
        try { pre = sigStrikePre(this, targetKey); } catch (e) { pre = null; }
        if (pre && pre.handled) return pre.value;
        var actedBefore = false;
        try { var p0 = this.tbFighter('p'); actedBefore = !!(p0 && p0.acted); } catch (e) {}
        var out = _sigStrike0.call(this, targetKey);
        try {
          var p1 = this.tbFighter('p');
          if (p1 && p1.acted && !actedBefore) {
            if (p1.bufEyesClosed > 0) p1.bufEyesClosed -= 1;
            if (p1.adLookAway > 0) p1.adLookAway -= 1;
          }
        } catch (e) {}
        return out;
      };
    }
  }
})(typeof window !== 'undefined' ? window : global);
