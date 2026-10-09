// @ontology
// system: convo-mood
// description: Per-conversation emotional state (rapport). Warmth and tension shift as you talk; mood is derived from who they are now, never stored per villager.
// provides:
//   - convoMoodInit(vid)
//   - convoMoodBand(vid)
//   - convoMoodShift(vid, delta)
//   - convoMoodFlush(vid)
//   - convoMoodBeat(from, to)
//   - convoMoodSilence(vid)
//   - convoMoodGoodbye(vid)
//   - convoMoodMod(vid)
//   - convoMoodReceptivity(vid)
// rules:
//   - mood_derived: c.mood is -3..3, re-initialized every startConvo from current trust + current npcMood; nothing is stored per villager (code: convo-mood.js, convoMoodInit; Steve 2026-10-06 unique-person law)
//   - mood_bands: warm >=2, friendly 1, neutral 0, cool -1, tense <=-2 (code: convo-mood.js, bandOf)
//   - warmth_from_trust: answer warmth derives from the sign of its trust delta — no separate data (code: conversation.js react: branches)
//   - band_beats: crossing a band boundary queues one stage-direction beat in c.heldBeats; the continuer reveals it after the turn's line (code: convo-mood.js, convoMoodShift/convoMoodFlush; Steve 2026-10-05 one-beat turns)
//   - receptivity: recent lived events (memory) decide guard/grace — guarded people absorb the first warming move, shown kindness absorbs the first cooling one (code: convo-mood.js, convoMoodReceptivity)
//   - mood_lingers: ending warm/tense nudges trust by the final mood value — but ONLY on a substantive conversation (c.substantive: at least one non-acknowledgment choice); agree-spam ("yeah" x3 + warm goodbye) earns the capped stipend, never the uncapped residue (code: conversation.js, endConvo; flag: convo-dialogue.js convoTurn wrapper; socialite break-it 2026-10-08)
// consumes:
//   - state.village.conv (c.mood, per-conversation only)
//   - village.trust, village.memory
//   - npcMood, npcTemper
// ============ CONVERSATION MOOD ============
// Every conversation has a temperature. It starts where the relationship
// and their current state put it — a grieving stranger starts cold, a
// grateful friend starts warm — and it moves as you talk. Agreeing warms.
// Dodging cools. Joking while they grieve lands badly. Silence means
// different things at different temperatures.
//
// Nothing here is stored per villager. The next conversation re-derives
// from who they are then: trust as it stands, needs as they are, memory
// of what's happened since. People change during a run; mood follows.
//
// Self-attaching module: loaded after conversation.js, adds Game methods.

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;

  // Bands, hottest first.
  function bandOf(m) {
    if (m >= 2) return 'warm';
    if (m === 1) return 'friendly';
    if (m === 0) return 'neutral';
    if (m === -1) return 'cool';
    return 'tense';
  }

  // convoMoodInit: where does this conversation START? Derived, never stored.
  // High trust starts warm; low trust starts cool. Their current npcMood
  // (grief, fear, cheer...) drags the start toward or away from you.
  Game.convoMoodInit = function (vid) {
    let m = 0;
    const trust = (this.state.village.trust || {})[vid] || 10;
    if (trust >= 75) m += 2;
    else if (trust >= 50) m += 1;
    else if (trust <= 5) m -= 1;
    let nm = 'steady';
    try { nm = this.npcMood(vid); } catch (e) {}
    if (nm === 'grieving' || nm === 'scared') m -= 1;
    else if (nm === 'cheerful' || nm === 'grateful') m += 1;
    return Math.max(-2, Math.min(2, m));
  };

  Game.convoMoodBand = function (vid) {
    const c = this.convoGet(vid);
    return bandOf((c && c.mood) || 0);
  };

  // convoMoodReceptivity: how open are they to warming RIGHT NOW, given
  // what's happened to them lately? Scored from lived memory (last 5 days),
  // not from personality — a warm person who's been hurt is guarded, and a
  // prickly person you were kind to softens. Returns -3..3.
  Game.convoMoodReceptivity = function (vid) {
    const WARM_KINDS = ['gift', 'private_gift', 'comforted', 'promise_kept',
      'shared_fear', 'shared_goal', 'hero', 'mediated', 'rally'];
    const HURT_KINDS = ['promise_broken', 'hostile', 'you_threatened',
      'confronted', 'ignored', 'rumor_about_them', 'suspects_you_stealing',
      'started_rumor', 'deal_refused', 'stingy_gift', 'deflected', 'slip',
      // WRONGLY_ACCUSED (detective playtest 2026-10-08): truth.js promises
      // "people remember being called a liar" and stores the memory — but it
      // was never read here, so a false accusation cost 2 trust and nothing
      // socially. Now it cools the relationship like any other hurt.
      'wrongly_accused'];
    let r = 0;
    try {
      const day = (this.state.scholar || {}).day || 0;
      const mem = ((this.state.village.memory || {})[vid]) || [];
      for (const m of mem) {
        if (day - (m.day || 0) > 5) continue;
        if (WARM_KINDS.indexOf(m.t) !== -1) r += 1;
        else if (HURT_KINDS.indexOf(m.t) !== -1) r -= 1;
      }
    } catch (e) {}
    return Math.max(-3, Math.min(3, r));
  };

  // convoMoodShift: move the temperature. Returns the new band.
  // Guard: a recently-hurt villager absorbs the first warming move per
  // conversation — they're not ready to let it in. Grace: recent kindness
  // absorbs the first cooling move — they give you the benefit of the doubt.
  // Band crossings queue a beat, flushed after the turn's line lands.
  Game.convoMoodShift = function (vid, delta) {
    if (!delta) return this.convoMoodBand(vid);
    const c = this.convoGet(vid);
    if (!c || !c.active) return this.convoMoodBand(vid);
    const rec = this.convoMoodReceptivity(vid);
    if (delta > 0 && rec < 0 && !c.moodGuardUsed) {
      c.moodGuardUsed = true;
      c.moodBeat = this.convoPickCycle(vid, 'moodguard', [
        'Something in them almost softens — then doesn\'t. Not yet.',
        'They hear the warmth in it. They\'re not ready to let it in.',
      ]) || 'They\'re not ready to let it in. Not yet.';
      return this.convoMoodBand(vid);
    }
    if (delta < 0 && rec > 0 && !c.moodGraceUsed) {
      c.moodGraceUsed = true;
      c.moodBeat = this.convoPickCycle(vid, 'moodgrace', [
        'That could have stung. They let it pass — you\'ve been kind before.',
        'They give you the benefit of the doubt. This time.',
      ]) || 'They give you the benefit of the doubt. This time.';
      return this.convoMoodBand(vid);
    }
    const before = bandOf(c.mood || 0);
    c.mood = Math.max(-3, Math.min(3, (c.mood || 0) + delta));
    const after = bandOf(c.mood);
    if (before !== after) c.moodBeat = this.convoMoodBeat(vid, before, after);
    return after;
  };

  // convoMoodFlush: say the queued beat after the turn's own line, so it
  // reads as their reaction settling in — never before what caused it.
  // convoMoodFlush: queue the beat behind the turn's line, so it reads as
  // their reaction settling in — never before what caused it, never
  // mid-turn. ONE-BEAT TURNS (Steve 2026-10-05): the continuer reveals it;
  // the goon emitter says it aloud when shown.
  Game.convoMoodFlush = function (vid) {
    const c = this.convoGet(vid);
    if (!c || !c.moodBeat) return;
    const beat = c.moodBeat;
    c.moodBeat = null;
    c.heldBeats = c.heldBeats || [];
    c.heldBeats.push({ text: beat });
  };

  // convoMoodBeat: one stage direction when the temperature visibly changes.
  // Rank order for pick: warm=4 friendly=3 neutral=2 cool=1 tense=0.
  Game.convoMoodBeat = function (vid, from, to) {
    const rank = { warm: 4, friendly: 3, neutral: 2, cool: 1, tense: 0 };
    const dir = (rank[to] || 0) > (rank[from] || 0) ? 'up' : 'down';
    const pools = {
      'up:warm': [
        'Something eases in their shoulders. They\'re really talking to you now.',
        'A warmth settles over the conversation — they lean in a little.',
      ],
      'up:friendly': [
        'They relax, a fraction. This is going well.',
        'Their voice loosens. The guardedness thins.',
      ],
      'up:neutral': [
        'The tension eases back to something ordinary.',
      ],
      'down:cool': [
        'A small chill settles between you. They\'re choosing words more carefully.',
        'They pull back half a step — not leaving, just... further.',
      ],
      'down:tense': [
        'The air goes tight. Their eyes narrow, just slightly.',
        'Something shutters in their face. Tread carefully.',
      ],
      'down:friendly': [
        'The ease drains out of it, a little.',
      ],
      'down:neutral': [
        'Whatever warmth was building cools to politeness.',
      ],
    };
    const pool = pools[dir + ':' + to] || ['The mood shifts, subtly.'];
    return this.convoPickCycle(vid, 'moodbeat:' + dir + ':' + to, pool) || pool[0];
  };

  // convoMoodSilence: saying nothing is always an option — but it means
  // different things at different temperatures. Warm: comfortable. Cold:
  // awful. Neutral: they fill it, because someone has to.
  Game.convoMoodSilence = function (vid) {
    const band = this.convoMoodBand(vid);
    if (band === 'warm') {
      return { shift: 1, line: this.convoPickCycle(vid, 'msil:warm', [
        'A comfortable quiet settles. They smile a little, and let it be.',
        'You say nothing. Neither do they, for a while — and it\'s fine.',
      ]) || 'A comfortable quiet settles.' };
    }
    if (band === 'cool') {
      return { shift: -1, line: this.convoPickCycle(vid, 'msil:cool', [
        'The silence stretches a beat too long. They study their hands.',
        'You don\'t answer. The quiet turns pointed.',
      ]) || 'The silence stretches a beat too long.' };
    }
    if (band === 'tense') {
      return { shift: 0, line: this.convoPickCycle(vid, 'msil:tense', [
        '"Did you need something?" Their voice is flat.',
        'Your silence lands wrong. They look away.',
      ]) || '"Did you need something?" Their voice is flat.' };
    }
    // friendly / neutral: they fill it.
    return { shift: 0, line: this.convoPickCycle(vid, 'msil:fill', [
      'They fill the quiet. "Anyway — where was I?"',
      '"You\'re a good listener, you know that?" A tired smile.',
      'They glance at the fire, then back. The quiet doesn\'t seem to bother them.',
    ]) || 'They fill the quiet.' };
  };

  // convoMoodGoodbye: the parting beat carries the temperature out the door.
  Game.convoMoodGoodbye = function (vid) {
    const band = this.convoMoodBand(vid);
    if (band === 'warm') {
      return this.convoPickCycle(vid, 'mbye:warm', [
        'They\'re smiling as you go. "Come back anytime."',
        '"This was good." They mean it.',
      ]) || null;
    }
    if (band === 'tense' || band === 'cool') {
      return this.convoPickCycle(vid, 'mbye:cold', [
        'They nod, already turning away.',
        '"Right. Well." That\'s the whole goodbye.',
      ]) || null;
    }
    return null;
  };

  // convoMoodMod: for success rolls elsewhere — a warm conversation opens
  // doors, a tense one closes them. -15..+15.
  Game.convoMoodMod = function (vid) {
    const c = this.convoGet(vid);
    return ((c && c.mood) || 0) * 5;
  };
})();
