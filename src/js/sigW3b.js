// @ontology
// system: sig-w3b
// description: Wave-3 batch-B signature combat mechanics (Steve 2026-10-10): Spool (records your first 3 turns, then replays them back at you — feed it heals and waits), Chorus Line (a visible 4/4 beat; the downbeat kicks — dance through it, move on the beat, flank it, or break the count with gravel; deafness hides the count but not the kick), Terms of Service (legible mid-fight clauses — object now at a small cost, accept and pay bigger later, or read enough to find the §0 loophole and dismiss it). Hooks interleave with the monster's normal attack — the generic encounter interpreter still runs.
// provides:
//   - spoolWatch(game, m)
//   - chorusBeat(game, m)
//   - tosClauses(game, m)
//   - tbSpoolExamineReel()
//   - tbChorusDance()
//   - tbChorusThrowGravel()
//   - tbTosRead()
//   - tbTosObject()
//   - tbTosAccept()
//   - tbTosInvokeLoophole()
//   - sigW3bCombatButtons()
//   - sigW3bFieldMonster(mdef, rec, ctx)
// rules:
//   - telegraph_honesty: every cue and say line describes what the mechanic actually does — the reel preview, the beat count, and the clause text ARE the mechanic, not flavor (code: spoolWatch)
//   - interleave: hooks add the signature layer around the generic interpreter — spool's replay and the chorus count own their turns outright (their telegraphs promise exactly that: harmless watching, then the replay; the count, then the kick); the ToS clause-writing alternates with the normal Clause attack (code: tosClauses)
//   - no_silent: every signature event narrates via say() — nothing happens quietly (code: tosClauses)
//   - counterplay_real: boring replays, dancing, gravel, reading, and the loophole all resolve through real fight state, never flags that lie (code: tbTosInvokeLoophole)
// consumes:
//   - say, tbDamage, addHealth, audioEvent
//   - hasStatus, applyStatus
//   - hasItem, consumeItem
//   - tbFighter, tbIsPlayerTurn, tbAfterPlayerAction, tbEndCheck
/* SIGNATURE MECHANICS, WAVE 3 BATCH B — src/js/sigW3b.js
 *
 * Steve (2026-10-10): the 26 wave-3/4/5 monsters shipped with copy-only
 * signature mechanics — telegraphs promising things the engine never ran.
 * This module builds three of them properly, in wave order:
 * spool -> chorus_line -> terms_of_service.
 *
 * ARCHITECTURE: hooks register into the global MonsterBehaviorHooks dict
 * (see src/js/monsterBehaviors.js); monsterBehaviors.json declares the
 * ordered preTurnHooks per monster id. A hook returning true consumed the
 * monster's turn; returning false lets the generic attack run. Spool and
 * Chorus Line own their turns outright (record/replay and the count ARE
 * their attacks — the telegraphs promise exactly that); the ToS hook only
 * consumes turns when it's writing a clause, otherwise the normal Clause
 * attack fires. Player
 * choices surface as Game.tb* methods + combat-panel buttons rendered by
 * sigW3bCombatButtons() (one insertion point in app.js). Villager
 * field-fights get the core loop through sigW3bFieldMonster(), called once
 * per round from fieldFights.js — the same hook path, simplified.
 *
 * DESIGN CALLS (Steve delegated — documented for overrule):
 * - Spool RECORD is exactly 3 player turns; classification priority is
 *   strike > heal > move > wait (acted + no moves left) > other-act >
 *   idle, measured from state deltas on the spool's own turn (no game.js
 *   edits needed). If the player wins initiative, the first turn is
 *   recovered retroactively from maxHp/position deltas — the lens was on.
 * - Chorus facing re-aims on beats 1-2 and FREEZES on beat 3 + the downbeat
 *   ("it can't turn fast") — step to the flank after the freeze and the
 *   kick sweeps past you.
 * - Deafness: the kick itself can deafen (25% on a full landing) — the line
 *   doesn't care that you can't hear it. That's the point.
 * - ToS accept-penalties are all mid-fight scheduled effects (no fight-end
 *   hooks): object = pay now, accept = pay bigger in N rounds, ignore =
 *   auto-accept after 3 ignored rounds with the pressure ratchet (clause
 *   interval 3 -> 2, floored at 2 — every-turn clauses would be a death
 *   spiral where the player can only answer paperwork).
 * - The §0 loophole dismisses via fled -> 'routed' (no meat, no trophy) —
 *   a non-violent resolution, not a kill.
 */
(function (_g) {
  'use strict';
  var G = (_g.Scattering && _g.Scattering.Game) ? _g.Scattering.Game : null;
  if (!G) return;
  // PROOF SWITCH (node proofs only): MECHANIC=off skips registration so the
  // BEFORE run goes red (mechanic absent) and the AFTER run goes green.
  try {
    if (typeof process !== 'undefined' && process.env && process.env.MECHANIC === 'off') return;
  } catch (e) {}
  var HB = _g.MonsterBehaviorHooks;
  if (!HB) return;

  // ---------------- shared ----------------
  function roll(range) {
    var a = range[0], b = range[1];
    return a + Math.floor(Math.random() * (b - a + 1));
  }
  function clampN(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function liveMonsters(game, id) {
    var f = game.tbfight;
    if (!f) return [];
    return f.fighters.filter(function (x) {
      return x.kind === 'monster' && x.alive && !x.fled && x.mdef && x.mdef.id === id;
    });
  }
  // screen coords: y grows downward, so dy < 0 is north.
  function compass(dx, dy) {
    var ns = dy < 0 ? 'north' : (dy > 0 ? 'south' : '');
    var ew = dx > 0 ? 'east' : (dx < 0 ? 'west' : '');
    if (ns && ew) return ns + '-' + ew;
    return ns || ew || 'right at you';
  }

  // ---------------- SPOOL ----------------
  var SPOOL_RECORD_TURNS = 3;
  function spoolKindLabel(e) {
    if (!e) return 'WAIT';
    if (e.kind === 'strike') return 'STRIKE (~' + e.dmg + ')';
    if (e.kind === 'heal') return 'HEAL (+' + e.amt + ')';
    if (e.kind === 'move') return 'MOVE';
    if (e.kind === 'act') return e.label || 'GESTURE';
    return 'WAIT';
  }
  function spoolReelLine(m) {
    return (m.spRec || []).map(function (e, i) {
      return (i + 1) + '. ' + spoolKindLabel(e);
    }).join('  ');
  }

  var sigHooks = {
    // SPOOL (Steve 2026-10-10): RECORD first — harmless, it watches. Then
    // REPLAY: it replays those recorded turns AT you. Feed it heals and
    // waits and the replay is medicine and silence.
    spoolWatch: function (game, m) {
      var f = game.tbfight;
      if (!f || f.over) return false;
      var p = game.tbFighter('p');
      if (!p || !p.alive) return false;
      m.spPhase = m.spPhase || 'record';
      m.spRec = m.spRec || [];
      m.spCycle = m.spCycle || 0;
      if (m.spPhase === 'record') {
        if (!m.spSnap) {
          // FIRST SPOOL TURN: seed the snapshot. If the player already acted
          // before the spool's first turn (they won initiative), recover
          // that turn retroactively from the HP/position deltas — the lens
          // was already on. (Before the first monster turn, only the player
          // has acted, so spool-HP loss is the player's strike.)
          var preDmg = Math.max(0, (m.maxHp || m.hp) - m.hp);
          var s0 = null;
          try { s0 = game.state.scholar; } catch (err) {}
          var preMoved = !!(s0 && (p.mx !== s0.mx || p.my !== s0.my));
          // CATCH 2b (r15): a turn-1 HEAL was misfiled as WAIT. Detect it
          // from the fight-start baseline (f.spBasePhp). Priority: strike >
          // heal > move > wait > act.
          var preHeal = 0;
          try {
            if (f.spBasePhp != null) preHeal = Math.max(0, p.hp - f.spBasePhp);
          } catch (errH) {}
          // CATCH 2 (r15): seq-gate the retroactive strike too.
          var preStrikeDmg = 0;
          try {
            var lst0 = f.sigLastStrike;
            if (lst0 && lst0.target === m.key && lst0.dmg > 0 && preDmg > 0) {
              if (lst0.seq != null) {
                preStrikeDmg = lst0.dmg;
                m.spAttrSeq = lst0.seq;
              } else {
                preStrikeDmg = preDmg;
              }
            }
          } catch (errS) {}
          var e0 = null;
          if (preStrikeDmg > 0) e0 = { kind: 'strike', dmg: preStrikeDmg };
          else if (preHeal > 0) e0 = { kind: 'heal', amt: preHeal };
          else if (preMoved) e0 = { kind: 'move', dx: Math.sign(p.mx - s0.mx), dy: Math.sign(p.my - s0.my) };
          else if (p.acted && p.moveLeft <= 0) e0 = { kind: 'wait' };
          else if (p.acted) e0 = { kind: 'act', label: 'GESTURE' };
          if (e0) {
            m.spRec.push(e0);
            try { game.audioEvent('spoolRecord', { n: m.spRec.length }); } catch (err) {}
            game.say('🎞 REC ● (' + m.spRec.length + '/' + SPOOL_RECORD_TURNS + ') — the spool\u2019s lens-eye never leaves you. It saw: ' + spoolKindLabel(e0) + '.');
          } else {
            game.say('The spool does nothing. A red eye blinks on — it is RECORDING you. (Harmless while it watches. Feed the tape carefully.)');
          }
        } else {
          var snap = m.spSnap;
          var dmg = Math.max(0, snap.mhp - m.hp);
          var heal = Math.max(0, p.hp - snap.php);
          var moved = (p.mx !== snap.px || p.my !== snap.py);
          // CATCH 2 (r15): attribute strike damage ONLY from the player's own
          // strike (f.sigLastStrike, seq-gated). HP loss from allies/DoTs is
          // NOT the player's swing — the lens watches YOU. Without seq info
          // (legacy), fall back to the HP delta.
          var myStrikeDmg = 0;
          try {
            var lst = f.sigLastStrike;
            if (lst && lst.target === m.key && lst.dmg > 0) {
              if (lst.seq != null && (m.spAttrSeq || 0) != null) {
                if (lst.seq > (m.spAttrSeq || 0)) {
                  myStrikeDmg = lst.dmg;
                  m.spAttrSeq = lst.seq;
                }
              } else if (dmg > 0) {
                myStrikeDmg = dmg; // legacy: no seq, trust the delta
              }
            }
          } catch (eAttr) {}
          var entry;
          if (myStrikeDmg > 0) entry = { kind: 'strike', dmg: myStrikeDmg };
          else if (heal > 0) entry = { kind: 'heal', amt: heal };
          else if (moved) entry = { kind: 'move', dx: Math.sign(p.mx - snap.px), dy: Math.sign(p.my - snap.py) };
          // WAIT DETECTION: tbPlayerWait spends the act AND zeroes movement.
          // Acted + no moves left + no other signature = a wait. (A study
          // after a full move misfiles as wait — both replays are harmless.)
          else if (p.acted && p.moveLeft <= 0) entry = { kind: 'wait' };
          else if (p.acted) entry = { kind: 'act', label: 'GESTURE' };
          else entry = { kind: 'wait' };
          m.spRec.push(entry);
          try { game.audioEvent('spoolRecord', { n: m.spRec.length }); } catch (err) {}
          game.say('🎞 REC ● (' + m.spRec.length + '/' + SPOOL_RECORD_TURNS + ') — the spool\u2019s lens-eye never leaves you. It saw: ' + spoolKindLabel(entry) + '.');
        }
        m.spSnap = { mhp: m.hp, php: p.hp, px: p.mx, py: p.my };
        if (m.spRec.length >= SPOOL_RECORD_TURNS) {
          m.spPhase = 'replay';
          game.say('The reels spin up — WHIRRR. LOADED: ' + spoolReelLine(m) + '. Watch the reel, not the tape. (Examine the reel to read exact numbers.)');
          try { game.audioEvent('spoolReplayStart', {}); } catch (err) {}
        }
        try { game.tbRefreshTelegraphUI(); } catch (err) {}
        if (game.tbEndCheck()) return true;
        return true; // watching consumes the turn — harmless by design
      }
      // ---- REPLAY: the tape plays your turns back at you ----
      if (!m.spRec.length) return false;
      if (m.spCycle > 0 && m.spCycle % m.spRec.length === 0) {
        game.say('The tape loops. LOADED: ' + spoolReelLine(m) + '.');
      }
      var e = m.spRec[m.spCycle % m.spRec.length];
      var tag = '▶ REPLAY ' + ((m.spCycle % m.spRec.length) + 1) + '/' + m.spRec.length;
      m.spCycle++;
      try { game.audioEvent('spoolReplay', { kind: e.kind }); } catch (err) {}
      if (e.kind === 'strike') {
        var d = Math.max(1, Math.round(e.dmg * (0.9 + Math.random() * 0.2)));
        var landed = game.tbDamage('p', d, 'the spool\u2019s replay', m.key);
        game.say(tag + ': STRIKE — the tape plays your own swing back at you. (' + landed + ')');
      } else if (e.kind === 'heal') {
        game.addHealth(e.amt);
        game.say(tag + ': HEAL — the tape plays your healing back. The same relief, secondhand. (+' + e.amt + ')');
      } else if (e.kind === 'move') {
        var nx = clampN(p.mx + (e.dx || 0), 1, 7);
        var ny = clampN(p.my + (e.dy || 0), 1, 7);
        var blocked = f.fighters.some(function (o) {
          return o !== p && o.alive && !o.fled && o.mx === nx && o.my === ny;
        });
        if (!blocked && (nx !== p.mx || ny !== p.my)) {
          p.mx = nx; p.my = ny;
          try { game.state.scholar.mx = nx; game.state.scholar.my = ny; } catch (err) {}
          game.say(tag + ': MOVE — the tape replays your step and the world tugs you along with it.');
        } else {
          game.say(tag + ': MOVE — the tape replays your step, but there\u2019s nowhere to go. The tug dies.');
        }
      } else if (e.kind === 'act') {
        game.say(tag + ': ' + (e.label || 'GESTURE') + ' — the spool parrots your move exactly. Nothing happens. It recorded a flourish.');
      } else {
        game.say(tag + ': WAIT — the spool holds perfectly still. Your own patience, played back at you.');
      }
      if (game.tbEndCheck()) return true;
      return true; // the replay IS its attack
    },

    // CHORUS LINE (Steve 2026-10-10): a visible 4/4 beat. Beats 1-3 count
    // down (the line re-aims); the downbeat kicks — an AoE aimed where the
    // line is FACING. Facing freezes on beat 3: it can't turn fast. Move on
    // the beat and the kick catches air; dance and you're untouchable (but
    // dancing is your whole turn); gravel breaks the count for a round.
    // Deafness hides the count, not the kick.
    chorusBeat: function (game, m) {
      var f = game.tbfight;
      if (!f || f.over) return false;
      var p = game.tbFighter('p');
      if (!p || !p.alive) return false;
      var deaf = false;
      try { deaf = !!(game.hasStatus && game.hasStatus('scholar', 'deaf')); } catch (err) {}
      if (!deaf) m.clDeafNoted = false;
      // arrhythmic disruption: the line stumbles, the count drops
      if ((m.clDisrupted || 0) > 0) {
        m.clDisrupted--;
        game.say('🪨 The chorus line stumbles over the scattered gravel — feet tangle, the count drops. (No beat. No kick.)');
        try { game.audioEvent('chorusStumble', {}); } catch (err) {}
        m.clLastPx = p.mx; m.clLastPy = p.my;
        if (game.tbEndCheck()) return true;
        return true;
      }
      m.clBeat = (m.clBeat || 0) + 1;
      var beat = ((m.clBeat - 1) % 4) + 1; // 1..4; the downbeat lands on 4
      var moved = (m.clLastPx !== undefined) && (p.mx !== m.clLastPx || p.my !== m.clLastPy);
      // facing: aims on beats 1-2, FROZEN on beat 3 and the downbeat.
      if (m.clFacing === undefined || beat <= 2) {
        m.clFacing = { x: Math.sign(p.mx - m.mx), y: Math.sign(p.my - m.my) };
        if (m.clFacing.x === 0 && m.clFacing.y === 0) m.clFacing = { x: 0, y: 1 };
      }
      var faceTxt = compass(m.clFacing.x, m.clFacing.y);
      try { game.audioEvent('chorusBeat', { beat: beat, downbeat: beat === 4 }); } catch (err) {}
      if (beat === 4) {
        // ---- DOWNBEAT: the kick ----
        // DANCE TOKEN: dancing protects the next monster phase, whatever
        // the turn order does to f.round (round-stamps proved order-
        // fragile). Each chorus monster consumes the token once.
        var dancing = (p.clDanceToken || 0) !== (m.clSeenDance || 0);
        if (dancing) m.clSeenDance = p.clDanceToken || 0;
        var atk = (m.mdef && m.mdef.attack) || {};
        var dmgRange = (atk.damage && atk.damage.length === 2) ? atk.damage : [30, 48];
        var base = roll(dmgRange);
        var targets = f.fighters.filter(function (o) {
          return o.alive && !o.fled && (o.kind === 'player' || o.kind === 'villager') &&
            Math.max(Math.abs(o.mx - m.mx), Math.abs(o.my - m.my)) <= 3;
        });
        if (!deaf) game.say('🥁 DOWNBEAT — the kick! (facing ' + faceTxt + ')');
        else if (!m.clDeafNoted) {
          m.clDeafNoted = true;
          game.say('You can\u2019t hear the music — but the floor thumps anyway. Something big is kicking.');
        }
        for (var i = 0; i < targets.length; i++) {
          var t = targets[i];
          var isP = (t.key === 'p');
          var dmult = 1, why = [];
          if (isP && dancing) {
            dmult = 0; why.push('dancing — untouchable');
          } else {
            var dx = t.mx - m.mx, dy = t.my - m.my;
            var dot = dx * m.clFacing.x + dy * m.clFacing.y;
            if (dot <= 0) { dmult *= 0.5; why.push('flank — the kick sweeps past'); }
            if (isP && moved) { dmult *= 0.25; why.push('moving ON the beat — it catches air'); }
          }
          var kdmg = Math.round(base * dmult);
          if (kdmg <= 0) {
            game.say('The kick passes ' + (isP ? 'under your feet' : 'wide of ' + t.name) + '. (' + why.join('; ') + ')');
            continue;
          }
          var landed = game.tbDamage(t.key, kdmg, 'the downbeat kick', m.key);
          game.say('The kick lands on ' + (isP ? 'you' : t.name) + ' for ' + landed + '.' + (why.length ? ' (' + why.join('; ') + ')' : ''));
          // the kick is LOUD — a full-force landing can deafen. The line
          // doesn't care that you can't hear it. That's the point.
          if (isP && dmult === 1 && !deaf && Math.random() < 0.25) {
            try { game.applyStatus('scholar', 'deaf', { turns: 3, source: 'the downbeat kick' }); } catch (err) {}
            game.say('Your ears ring, then go cotton-quiet. (DEAFENED — the beat count is gone, but the beat isn\u2019t.)');
          }
        }
        if (!targets.length) game.say('The kick sweeps empty floor.');
        m.clLastPx = p.mx; m.clLastPy = p.my;
        if (game.tbEndCheck()) return true;
        return true; // the kick IS the attack
      }
      // ---- beats 1-3: the count. The line keeps dancing closer — the
      // generic attack does NOT fire here (its "Downbeat!" narration on an
      // off-beat would be a lie: the downbeat is the kick, and only the
      // downbeat). The hook owns the whole turn: count + a slow advance.
      if (!deaf) {
        game.say('♪ BEAT ' + beat + '/4 — the line faces ' + faceTxt + '.' + (beat === 3 ? ' Downbeat next.' : ''));
      } else if (!m.clDeafNoted) {
        m.clDeafNoted = true;
        game.say('The music is gone — cotton quiet. But you can feel the floor thump. (Deaf: no beat count. The kick still comes.)');
      }
      // the line dances closer while it counts — positioning pressure, not
      // damage. One tile toward you if the tile is free.
      var sx = Math.sign(p.mx - m.mx), sy = Math.sign(p.my - m.my);
      var tx2 = m.mx + sx, ty2 = m.my + sy;
      var occupied = f.fighters.some(function (o) {
        return o !== m && o.alive && !o.fled && o.mx === tx2 && o.my === ty2;
      });
      if ((sx || sy) && tx2 >= 1 && tx2 <= 7 && ty2 >= 1 && ty2 <= 7 && !occupied) {
        m.mx = tx2; m.my = ty2;
        if (!deaf) game.say('The line shuffles a step closer, keeping the count.');
      }
      m.clLastPx = p.mx; m.clLastPy = p.my;
      if (game.tbEndCheck()) return true;
      return true; // the count IS the turn — the kick only lands on the downbeat
    },

    // TERMS OF SERVICE (Steve 2026-10-10): mid-fight it ADDS CLAUSES. Each
    // clause is legible glowing text and a real choice: OBJECT now at a
    // small cost, or ACCEPT and pay a bigger cost N rounds later. Ignored
    // clauses auto-accept after 2 rounds — the scroll unrolls toward you,
    // and the pressure ratchets. Read 3 clauses and the §0 loophole
    // appears: invoke it and the Scroll dismisses itself.
    tosClauses: function (game, m) {
      var f = game.tbfight;
      if (!f || f.over) return false;
      var p = game.tbFighter('p');
      if (!p || !p.alive) return false;
      if (!m.tosInit) {
        m.tosInit = true; m.tosTurns = 0; m.tosSince = 0; m.tosEvery = 3;
        m.tosRead = 0; m.tosActive = null; m.tosPending = [];
        m.tosPoolIdx = 0; m.tosLoopholeShown = false;
      }
      m.tosTurns++;
      // tick delayed accept-penalties
      var pend = m.tosPending || [];
      for (var i = pend.length - 1; i >= 0; i--) {
        pend[i].n--;
        if (pend[i].n <= 0) {
          var pd = pend[i].def;
          pend.splice(i, 1);
          tosFirePenalty(game, m, p, pd);
          if (!p.alive || (f.over)) { game.tbEndCheck(); return true; }
        }
      }
      // the unanswered clause: pressure ratchets. Three monster turns of
      // being ignored and the scroll takes it as consent — the player gets
      // a read turn and an answer turn; dawdling past that is ignoring it.
      var wrote = false;
      if (m.tosActive) {
        m.tosActive.waited = (m.tosActive.waited || 0) + 1;
        if (m.tosActive.waited >= 3) {
          var ac = m.tosActive;
          m.tosActive = null;
          game.say('📜 The scroll UNROLLS TOWARD YOU — ' + ac.def.num + ' takes effect unread. (AUTO-ACCEPTED. Reading is the defense.)');
          tosScheduleAccept(game, m, ac.def);
          m.tosEvery = Math.max(2, m.tosEvery - 1);
        }
      }
      // add a clause?
      m.tosSince++;
      if (!m.tosActive && m.tosSince >= m.tosEvery) {
        m.tosSince = 0;
        var def = tosNextClause(m);
        m.tosActive = { def: def, waited: 0, read: false };
        wrote = true;
        game.say('📜 The text on the scroll GLOWS — the glow runs along the words like a fuse: ' + def.text + ' (Read it, Object, or Accept — it won\u2019t wait more than 3 rounds.)');
        try { game.audioEvent('tosClause', { clause: def.id }); } catch (err) {}
      }
      if (game.tbEndCheck()) return true;
      return wrote; // writing consumes the turn; otherwise the Clause attack fires
    },
  };
  Object.assign(HB, sigHooks);

  // ---------------- Terms of Service: clause table ----------------
  var TOS_DEFS = [
    { id: 'tos_arbitration', num: '§3', title: 'ARBITRATION',
      text: '§3 ARBITRATION — \u201cAll disputes under this agreement resolve in the Scroll\u2019s favor.\u201d',
      fine: 'Object now: the Scroll files your protest and takes the top item of your pack as a filing fee (blood, −15 HP, if the pack is empty). Accept: the ruling seats in 2 rounds — the Scroll grows on precedent (+40 HP) and claims jurisdiction over your body (−10 max HP, this fight). Objectors are marked: the next clause comes 1 turn sooner.',
      object: { kind: 'item_or_blood' }, accept: { kind: 'arbitration', delay: 2 } },
    { id: 'tos_latefees', num: '§7', title: 'LATE FEES',
      text: '§7 LATE FEES — \u201cUnanswered clauses compound at ten percent per round.\u201d',
      fine: 'Object now: pay the fee, −60 kcal, done. Accept: in 3 rounds the bailiffs collect 15% of your carried kcal (min 40). Ignored clauses auto-accept after 3 rounds.',
      object: { kind: 'kcal', n: 60 }, accept: { kind: 'latefees', delay: 3 } },
    { id: 'tos_harvest', num: '§12', title: 'HARVEST',
      text: '§12 HARVEST — \u201cA share of carried provisions vests in the Scroll upon acceptance.\u201d',
      fine: 'Object now: tithe one food item from your pack (or 40 kcal if you carry no food). Accept: in 4 rounds the harvesters take 20% of your carried kcal (min 50). Ignored clauses auto-accept after 3 rounds.',
      object: { kind: 'food' }, accept: { kind: 'harvest', delay: 4 } },
    { id: 'tos_consent', num: '§21', title: 'RECORDING CONSENT',
      text: '§21 RECORDING CONSENT — \u201cYou consent to be recorded for quality assurance.\u201d',
      fine: 'Object now: smash the lens — it struggles (−12 HP). Accept: in 2 rounds it finishes studying the tape — a studied strike lands (+25 damage) and it grows harder to kill (+30 HP). Ignored clauses auto-accept after 3 rounds.',
      object: { kind: 'hp', n: 12 }, accept: { kind: 'consent', delay: 2 } },
    { id: 'tos_loophole', num: '§0', title: 'TERMINATION',
      text: '§0 TERMINATION — \u201cEither party may terminate this agreement at will by citing this section.\u201d',
      fine: 'There is no fine print. That\u2019s the loophole.',
      object: null, accept: null },
  ];
  function tosDefById(id) {
    for (var i = 0; i < TOS_DEFS.length; i++) if (TOS_DEFS[i].id === id) return TOS_DEFS[i];
    return null;
  }
  function tosNextClause(m) {
    // read enough and the loophole surfaces
    if (m.tosRead >= 3 && !m.tosLoopholeShown) {
      m.tosLoopholeShown = true;
      return tosDefById('tos_loophole');
    }
    var pool = ['tos_arbitration', 'tos_latefees', 'tos_harvest', 'tos_consent'];
    var def = tosDefById(pool[(m.tosPoolIdx || 0) % pool.length]);
    m.tosPoolIdx = (m.tosPoolIdx || 0) + 1;
    return def;
  }
  function tosScheduleAccept(game, m, def) {
    if (!def || !def.accept) return;
    m.tosPending = m.tosPending || [];
    m.tosPending.push({ n: def.accept.delay, def: def });
    var what = def.id === 'tos_arbitration' ? 'the ruling seats'
      : def.id === 'tos_latefees' ? 'the bailiffs collect'
      : def.id === 'tos_harvest' ? 'the harvesters come'
      : 'it finishes studying the tape';
    game.say('✅ ACCEPTED — ' + what + ' in ' + def.accept.delay + ' rounds.');
    try { game.audioEvent('tosAccept', { clause: def.id }); } catch (err) {}
  }
  function tosFirePenalty(game, m, p, def) {
    if (!def || !def.accept) return;
    var s = game.state.scholar;
    if (def.accept.kind === 'arbitration') {
      m.maxHp = (m.maxHp || m.hp) + 40; m.hp = Math.min(m.maxHp, m.hp + 40);
      p.maxHp = Math.max(1, (p.maxHp || 100) - 10); p.hp = Math.min(p.hp, p.maxHp);
      game.say('⚖️ The ruling seats: the Scroll swells on precedent (+40 HP); its jurisdiction settles over your body (−10 max HP, this fight).');
    } else if (def.accept.kind === 'latefees') {
      var loss = Math.max(40, Math.round((s.kcal || 0) * 0.15));
      s.kcal = Math.max(0, (s.kcal || 0) - loss);
      game.say('💸 The bailiffs collect: −' + loss + ' kcal of carried food. (LATE FEES)');
    } else if (def.accept.kind === 'harvest') {
      var cut = Math.max(50, Math.round((s.kcal || 0) * 0.20));
      s.kcal = Math.max(0, (s.kcal || 0) - cut);
      game.say('🌾 The harvesters take their share: −' + cut + ' kcal. (HARVEST)');
    } else if (def.accept.kind === 'consent') {
      m.maxHp = (m.maxHp || m.hp) + 30; m.hp = Math.min(m.maxHp, m.hp + 30);
      var landed = game.tbDamage('p', 25, 'the Scroll\u2019s studied strike', m.key);
      game.say('👁️ It finished studying the tape — it knew exactly where you\u2019d be. (' + landed + ') It grows harder to kill (+30 HP).');
    }
    try { game.audioEvent('tosPenalty', { clause: def.id }); } catch (err) {}
  }
  function tosActiveMonster(game) {
    var ms = liveMonsters(game, 'terms_of_service');
    for (var i = 0; i < ms.length; i++) if (ms[i].tosActive) return ms[i];
    return null;
  }
  function tosPayObject(game, p, def) {
    var s = game.state.scholar;
    var oc = def.object;
    if (!oc) return false;
    if (oc.kind === 'item_or_blood') {
      var inv = s.inventory || [];
      if (inv.length) {
        var it = inv[0], iid = it.itemId || it.id, nm = it.name || iid;
        game.consumeItem(iid, 1);
        game.say('✋ OBJECTION FILED — the Scroll takes the top of your pack as a filing fee: ' + nm + '.');
      } else {
        game.addHealth(-15);
        game.say('✋ OBJECTION FILED — your pack is empty. The Scroll takes blood instead. (−15 HP)');
      }
      return true;
    }
    if (oc.kind === 'kcal') {
      s.kcal = Math.max(0, (s.kcal || 0) - oc.n);
      game.say('✋ OBJECTION — you pay the fee now: −' + oc.n + ' kcal. Done.');
      return true;
    }
    if (oc.kind === 'hp') {
      game.addHealth(-oc.n);
      game.say('✋ OBJECTION — you smash the lens. It struggles. (−' + oc.n + ' HP)');
      return true;
    }
    if (oc.kind === 'food') {
      var inv2 = s.inventory || [];
      var fi = -1;
      for (var i = 0; i < inv2.length; i++) {
        var d = null;
        try { d = (game.data.items || []).find(function (x) { return x.id === (inv2[i].itemId || inv2[i].id); }); } catch (err) {}
        if ((d && d.kcalEach) || (inv2[i].kcalEach)) { fi = i; break; }
      }
      if (fi >= 0) {
        var fit = inv2[fi], fiid = fit.itemId || fit.id, fnm = fit.name || fiid;
        game.consumeItem(fiid, 1);
        game.say('✋ OBJECTION — you tithe from your pack: ' + fnm + '. The Scroll files it under HARVEST.');
      } else {
        s.kcal = Math.max(0, (s.kcal || 0) - 40);
        game.say('✋ OBJECTION — you carry no food. The Scroll takes 40 kcal off your reserves instead.');
      }
      return true;
    }
    return false;
  }

  // ---------------- player actions ----------------
  Object.assign(G, {
    // SPOOL: read the loaded reel frame by frame — exact numbers and order.
    // Costs the act. The auto-preview shows kinds; this shows everything.
    tbSpoolExamineReel() {
      const f = this.tbfight;
      if (!f || !this.tbIsPlayerTurn()) return false;
      const p = this.tbFighter('p');
      if (!p) return false;
      if (p.acted) { this.say('Already acted this turn.'); return false; }
      const m = liveMonsters(this, 'spool')[0];
      if (!m) { this.say('No spool here to read.'); return false; }
      p.acted = true;
      if ((m.spPhase || 'record') === 'record') {
        this.say('🎞 You study the reels — still recording, nothing loaded yet. (REC ' + (m.spRec || []).length + '/' + SPOOL_RECORD_TURNS + ')');
      } else {
        const lines = (m.spRec || []).map(function (e, i) {
          const det = e.kind === 'strike' ? 'hits you for ~' + e.dmg
            : e.kind === 'heal' ? 'heals you +' + e.amt
            : e.kind === 'move' ? 'tugs you one tile along your old step'
            : 'does nothing';
          return (i + 1) + '. ' + e.kind.toUpperCase() + ' → ' + det;
        });
        const next = ((m.spCycle || 0) % Math.max(1, (m.spRec || []).length)) + 1;
        this.say('🎞 You read the loaded reel, frame by frame: ' + lines.join(' · ') + '. Next up: ' + next + '/' + (m.spRec || []).length + '.');
      }
      this.tbAfterPlayerAction();
      return true;
    },

    // CHORUS LINE: dance on the beat — untouchable while you keep the
    // rhythm, but dancing is your whole turn. Real tradeoff.
    tbChorusDance() {
      const f = this.tbfight;
      if (!f || !this.tbIsPlayerTurn()) return false;
      const p = this.tbFighter('p');
      if (!p) return false;
      if (p.acted) { this.say('Already acted this turn.'); return false; }
      if (!liveMonsters(this, 'chorus_line').length) { this.say('Nothing here keeps a beat.'); return false; }
      p.acted = true;
      p.moveLeft = 0; // "dancing is all you do this turn" — no reposition while untouchable (CATCH 4, r15)
      // DANCE TOKEN (not a round stamp): protects the next monster phase
      // regardless of turn order. Each chorus monster consumes it once.
      p.clDanceToken = (p.clDanceToken || 0) + 1;
      this.say('💃 You find the downbeat and DANCE. Nothing can touch you while you keep the rhythm — but dancing is all you do this turn.');
      try { this.audioEvent('chorusDance', {}); } catch (err) {}
      this.tbAfterPlayerAction();
      return true;
    },

    // CHORUS LINE: throw gravel — arrhythmic, graceless, perfect. Breaks
    // the line's count for a round. Costs the act + one gravel.
    tbChorusThrowGravel() {
      const f = this.tbfight;
      if (!f || !this.tbIsPlayerTurn()) return false;
      const p = this.tbFighter('p');
      if (!p) return false;
      if (p.acted) { this.say('Already acted this turn.'); return false; }
      const lines = liveMonsters(this, 'chorus_line');
      if (!lines.length) { this.say('Nothing here keeps a beat.'); return false; }
      if (!this.hasItem('gravel')) { this.say('No gravel in your pack.'); return false; }
      this.consumeItem('gravel', 1);
      p.acted = true;
      for (const m of lines) m.clDisrupted = 1;
      this.say('🪨 You fling a handful of gravel across the floor — arrhythmic, graceless, perfect. The line\u2019s feet tangle on the next count.');
      try { this.audioEvent('gravelThrow', {}); } catch (err) {}
      this.tbAfterPlayerAction();
      return true;
    },

    // TERMS OF SERVICE: read the glowing clause — the fine print holds the
    // exact terms. Reading is the defense; read 3 and the loophole surfaces.
    tbTosRead() {
      const f = this.tbfight;
      if (!f || !this.tbIsPlayerTurn()) return false;
      const p = this.tbFighter('p');
      if (!p) return false;
      if (p.acted) { this.say('Already acted this turn.'); return false; }
      const m = tosActiveMonster(this);
      if (!m) { this.say('No glowing clause to read.'); return false; }
      const def = m.tosActive.def;
      if (m.tosActive.read) { this.say('You\u2019ve already read ' + def.num + ' — the fine print doesn\u2019t change.'); return false; }
      p.acted = true;
      m.tosActive.read = true;
      m.tosRead++;
      this.say('👁️ You read the fine print of ' + def.num + ' ' + def.title + ': ' + def.fine);
      if (m.tosRead === 3 && !m.tosLoopholeShown) {
        this.say('(Three clauses read. Somewhere in this scroll there has to be a way out — keep reading.)');
      }
      try { this.audioEvent('tosRead', {}); } catch (err) {}
      this.tbAfterPlayerAction();
      return true;
    },

    // TERMS OF SERVICE: object now — pay the small cost. Objectors are
    // marked: the next clause comes 1 turn sooner.
    tbTosObject() {
      const f = this.tbfight;
      if (!f || !this.tbIsPlayerTurn()) return false;
      const p = this.tbFighter('p');
      if (!p) return false;
      if (p.acted) { this.say('Already acted this turn.'); return false; }
      const m = tosActiveMonster(this);
      if (!m) { this.say('Nothing to object to.'); return false; }
      const def = m.tosActive.def;
      if (def.id === 'tos_loophole') { this.say('§0 has nothing to object to — only to invoke.'); return false; }
      if (!tosPayObject(this, p, def)) { this.say('The objection doesn\u2019t take.'); return false; }
      p.acted = true;
      m.tosActive = null;
      m.tosEvery = Math.max(2, m.tosEvery - 1);
      try { this.audioEvent('tosObject', {}); } catch (err) {}
      this.tbAfterPlayerAction();
      return true;
    },

    // TERMS OF SERVICE: accept — pay the bigger cost in N rounds.
    tbTosAccept() {
      const f = this.tbfight;
      if (!f || !this.tbIsPlayerTurn()) return false;
      const p = this.tbFighter('p');
      if (!p) return false;
      if (p.acted) { this.say('Already acted this turn.'); return false; }
      const m = tosActiveMonster(this);
      if (!m) { this.say('Nothing to accept.'); return false; }
      const def = m.tosActive.def;
      if (def.id === 'tos_loophole') { this.say('§0 isn\u2019t accepted — it\u2019s invoked.'); return false; }
      p.acted = true;
      tosScheduleAccept(this, m, def);
      m.tosActive = null;
      m.tosEvery = Math.max(2, m.tosEvery - 1);
      this.tbAfterPlayerAction();
      return true;
    },

    // TERMS OF SERVICE: cite §0 — terminate the agreement. The Scroll
    // dismisses itself. Non-violent, earned.
    tbTosInvokeLoophole() {
      const f = this.tbfight;
      if (!f || !this.tbIsPlayerTurn()) return false;
      const p = this.tbFighter('p');
      if (!p) return false;
      if (p.acted) { this.say('Already acted this turn.'); return false; }
      const m = tosActiveMonster(this);
      if (!m || !m.tosActive || m.tosActive.def.id !== 'tos_loophole') {
        this.say('No termination clause on the table.');
        return false;
      }
      p.acted = true;
      try { this.audioEvent('tosLoophole', {}); } catch (err) {}
      this.say('🕳 You cite §0 TERMINATION. The Scroll goes very still. It reads its own section twice. \u201c...TERMINATION ACCEPTED.\u201d It unrolls itself and leaves. (DISMISSED — no blood.)');
      m.fled = true;
      this.tbAfterPlayerAction();
      return true;
    },

    // Combat-panel buttons for the three mechanics. Called from app.js's
    // combat strip (one insertion point); wired by data-sigw3b in
    // wireCombatPanel. Returns '' when nothing applies.
    sigW3bCombatButtons() {
      const f = this.tbfight;
      if (!f || f.over) return '';
      let p = null;
      try { p = this.tbFighter('p'); } catch (e) {}
      const dis = (p && p.acted) ? 'disabled' : '';
      const out = [];
      const spool = liveMonsters(this, 'spool')[0];
      if (spool && spool.spPhase === 'replay') {
        out.push('<button class="self-btn" data-sigw3b="tbSpoolExamineReel" ' + dis + ' title="Read the loaded reel frame by frame — exact numbers, and what\u2019s next">🎞 Reel</button>');
      }
      if (liveMonsters(this, 'chorus_line').length) {
        out.push('<button class="self-btn" data-sigw3b="tbChorusDance" ' + dis + ' title="Dance on the beat — untouchable while you keep the rhythm, but dancing is your whole turn">💃 Dance</button>');
        let hasG = false;
        try { hasG = this.hasItem('gravel'); } catch (e) {}
        if (hasG) out.push('<button class="self-btn" data-sigw3b="tbChorusThrowGravel" ' + dis + ' title="Throw gravel — arrhythmic, breaks the line\u2019s count for a round">🪨 Gravel</button>');
      }
      const tm = tosActiveMonster(this);
      if (tm) {
        const d = tm.tosActive.def;
        if (!tm.tosActive.read) {
          out.push('<button class="self-btn" data-sigw3b="tbTosRead" ' + dis + ' title="Read the fine print — the exact terms">📜 Read</button>');
        }
        if (d.id === 'tos_loophole') {
          out.push('<button class="self-btn" data-sigw3b="tbTosInvokeLoophole" ' + dis + ' title="Cite §0 — terminate the agreement">🕳 §0</button>');
        } else {
          out.push('<button class="self-btn" data-sigw3b="tbTosObject" ' + dis + ' title="Object now — pay the small cost">✋ Object</button>');
          out.push('<button class="self-btn" data-sigw3b="tbTosAccept" ' + dis + ' title="Accept — pay the bigger cost later">✅ Accept</button>');
        }
      }
      return out.join('');
    },

    // Field-fight core loop (villager vs monster): the same hook path as the
    // tactical engine, simplified for the off-screen sim. Called once per
    // round from fieldFights.js's monster phase. Returns the adjusted
    // damage total for this member's hit. State lives on rec.sigW3b.
    sigW3bFieldMonster(mdef, rec, ctx) {
      ctx = ctx || {};
      const id = mdef && mdef.id;
      if (id !== 'spool' && id !== 'chorus_line' && id !== 'terms_of_service') return ctx.total;
      const st = rec.sigW3b || (rec.sigW3b = {});
      const round = ctx.round || 1;
      if (st.roundSeen === round && st.roundSeenId === id) return ctx.total;
      st.roundSeen = round; st.roundSeenId = id;
      const rr = ctx.rr || Math.random;
      const lroll = ctx.lroll || ((r) => r[0] + Math.floor(rr() * (r[1] - r[0] + 1)));
      let total = (typeof ctx.total === 'number') ? ctx.total : 0;
      const vName = ctx.vName || 'Someone';
      if (id === 'spool') {
        // record 3 rounds of the villager's damage, harmless; then the
        // tape plays their own strikes back at them.
        st.spRec = st.spRec || [];
        const dealt = Math.max(0, (rec.mDealt || 0) - (st.spDealtSeen || 0));
        st.spDealtSeen = rec.mDealt || 0;
        if (st.spRec.length < SPOOL_RECORD_TURNS) {
          st.spRec.push(dealt);
          rec.log.push('R' + round + ': the spool watches ' + vName + ' — recording (' + st.spRec.length + '/' + SPOOL_RECORD_TURNS + '). It does not attack.');
          return 0;
        }
        const back = Math.round(st.spRec[(st.spIdx || 0) % st.spRec.length] * (0.9 + rr() * 0.2));
        st.spIdx = (st.spIdx || 0) + 1;
        rec.log.push('R' + round + ': REPLAY — the spool plays ' + vName + '\u2019s own strike back (+' + back + ').');
        return total + back;
      }
      if (id === 'chorus_line') {
        // the count keeps off-screen too; the kick ONLY lands on the
        // downbeat (beats 1-3 the line is counting, not kicking — same
        // telegraph honesty as the tactical fight).
        st.clBeat = (st.clBeat || 0) + 1;
        const beat = ((st.clBeat - 1) % 4) + 1;
        if (beat === 4) {
          const atk = (mdef.attack || {}).damage || [30, 48];
          const kick = lroll(atk);
          rec.log.push('R' + round + ': DOWNBEAT — the chorus line\u2019s kick lands on ' + vName + ' (' + kick + '). No dancer out here to slip it.');
          return kick;
        }
        rec.log.push('R' + round + ': the chorus line keeps the count — beat ' + beat + '/4. (Counting, not kicking.)');
        return 0;
      }
      // ---- terms_of_service: clauses write themselves; villagers can't
      // read, so unanswered clauses auto-accept and the penalties land.
      st.tosTurns = (st.tosTurns || 0) + 1;
      st.tosSince = (st.tosSince || 0) + 1;
      st.tosEvery = st.tosEvery || 3;
      st.tosPend = st.tosPend || [];
      for (let i = st.tosPend.length - 1; i >= 0; i--) {
        st.tosPend[i].n--;
        if (st.tosPend[i].n <= 0) {
          const pd = st.tosPend[i].id;
          st.tosPend.splice(i, 1);
          if (pd === 'tos_arbitration') {
            st.tosArb = 6;
            rec.log.push('R' + round + ': the ruling seats — the scroll fights with precedent (its hits +30%, 6 rounds).');
          } else if (pd === 'tos_latefees') {
            rec.log.push('R' + round + ': the bailiffs collect — +12 on ' + vName + '. (LATE FEES)');
            total += 12;
          } else if (pd === 'tos_harvest') {
            rec.log.push('R' + round + ': the harvesters take their cut — +16 on ' + vName + '. (HARVEST)');
            total += 16;
          } else if (pd === 'tos_consent') {
            rec.log.push('R' + round + ': it studied the tape — a studied strike, +25 on ' + vName + '. (RECORDING CONSENT)');
            total += 25;
          }
        }
      }
      if ((st.tosArb || 0) > 0 && total > 0) { st.tosArb--; total = Math.round(total * 1.3); }
      if (st.tosActive) {
        st.tosWaited = (st.tosWaited || 0) + 1;
        if (st.tosWaited >= 3) {
          const ids = ['tos_arbitration', 'tos_latefees', 'tos_harvest', 'tos_consent'];
          const delays = { tos_arbitration: 2, tos_latefees: 3, tos_harvest: 4, tos_consent: 2 };
          rec.log.push('R' + round + ': the scroll unrolls toward ' + vName + ' — ' + st.tosActive + ' takes effect unread. (No one out here to read the fine print.)');
          st.tosPend.push({ n: delays[st.tosActive] || 3, id: st.tosActive });
          st.tosActive = null; st.tosWaited = 0;
          st.tosEvery = Math.max(2, st.tosEvery - 1);
        }
      }
      if (!st.tosActive && st.tosSince >= st.tosEvery) {
        st.tosSince = 0;
        const ids = ['tos_arbitration', 'tos_latefees', 'tos_harvest', 'tos_consent'];
        const titles = { tos_arbitration: '§3 ARBITRATION', tos_latefees: '§7 LATE FEES', tos_harvest: '§12 HARVEST', tos_consent: '§21 RECORDING CONSENT' };
        st.tosActive = ids[(st.tosIdx || 0) % ids.length];
        st.tosIdx = (st.tosIdx || 0) + 1;
        rec.log.push('R' + round + ': the scroll glows — a new clause writes itself: ' + titles[st.tosActive] + '. (Writing, not attacking.)');
        return 0;
      }
      return total;
    },
  });
  // CATCH 2b/cold-start (r15): capture baselines at fight start. spBasePhp
  // lets the spool's retroactive first-turn record detect a turn-1 HEAL
  // (heals were misfiled as WAIT). bufBasePos seeds the buffering's heading
  // baseline so a turn-1 move isn't read as "no heading".
  var _sigW3bStartCombat = G.startCombat;
  if (typeof _sigW3bStartCombat === 'function') {
    G.startCombat = function () {
      var out = _sigW3bStartCombat.apply(this, arguments);
      try {
        var f = this.tbfight;
        if (f && !f.over) {
          var p = this.tbFighter('p');
          if (p) {
            f.spBasePhp = p.hp;
            f.bufBasePos = { mx: p.mx, my: p.my };
          }
        }
      } catch (e) {}
      return out;
    };
  }
})(typeof window !== 'undefined' ? window : global);
