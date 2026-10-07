// @ontology
// system: convo-wants
// description: Want-driven conversation architecture. Every conversation has an NPC want that gives it direction; beats acknowledge what the player said; endings plant seeds for next time.
// provides:
//   - Game.WANT_BEAT_TAGS / Game.wantBeatTag(wid) -> canonical want ID -> beat tag map (consumed by convo-beats.js)
//   - convoSelectWant(vid) -> want object
//   - convoWantOpener(vid, want) -> {line, thread}
//   - convoComposeBeat(vid, rawBeat, playerSaid) -> composed beat that acknowledges the player
//   - convoPlantSeed(vid, seed)
//   - convoCheckSeeds(vid) -> pending seed or null
//   - convoAdvanceWant(vid, playerChoiceKind)
//   - convoTeachSkill(vid) -> {key, name, origin} from their lifeseed skill origins
//   - convoOpinionMatter(vid) -> live-village matter weighing on them
//   - convoPrideDeed(vid) -> the good thing they did, from their memory
// rules:
//   - want_driven: every conversation selects one NPC want at start; the want shapes the opening and provides beats (code: convoSelectWant, Steve 2026-10-06)
//   - ten_wants: share_news, ask_favor, seek_comfort, warn_you, curious, just_company + offer_teach, ask_opinion, make_amends, show_pride (code: WANTS, expanded 2026-10-07)
//   - want_epistemics: a want's lines name only what the NPC actually knows — warn_you names their own threat memory, opinion matters come from live village state, pride deeds from their memory (code: WANTS openers/engage, 2026-10-07)
//   - beat_acknowledgment: NPC beats must acknowledge the player's last utterance before delivering new content — no non-sequiturs (code: convoComposeBeat, Steve 2026-10-06)
//   - want_beat_tagged: want-surfaced beats land through the untagged goon continuer, so the convoTurn wrapper stamps c.lastBeat + the transcript entry with the want's true tag when the opener delivers (code: convoTurn wrapper, 2026-10-07)
//   - seeds: unresolved wants plant seeds; next conversation opens with the seed (code: convoPlantSeed/convoCheckSeeds, Steve 2026-10-06)
//   - arc: want stages 0 (unspoken) -> 1 (surfaced) -> 2 (engaged) -> 3 (resolved); endings record the resolution (code: convoAdvanceWant, Steve 2026-10-06)
//   - want_engagement: engaging dlg: replies advance a surfaced+delivered want to stage 2 and queue its engage beat on the continuer (one-beat turns hold); declines move it to stage 3 with the deflect beat queued — unless the dlg: handler already spoke the beat. The mapper (convoWantEngage) runs in the OUTERMOST convoTurn wrapper because the dialogue layer intercepts dlg: choices and returns early (code: convo-wants.js, convo-beats.js, Steve 2026-10-07)
// consumes:
//   - village.villagers
//   - state.convos
//   - npcNeeds (hunger/fear/social/energy)
//   - vpOf(vid) -> villager char incl. lifeseed
//   - displayName(vid)
// ============ CONVERSATION WANTS ============
// Structural rethink (Steve 2026-10-06): conversations were a reactive
// choice-menu with no direction — the NPC had nothing they wanted, beats
// didn't respond to what the player said, and endings evaporated.
//
// Now: every conversation has an NPC WANT. The want is selected from their
// needs, personality, unresolved seeds, and recent events. It gives the
// conversation a shape: the want surfaces, the player engages or deflects,
// and the ending plants a seed for next time.
//
// Beats go through convoComposeBeat, which ensures the NPC's line
// acknowledges what the player just said before delivering new content.
// No more non-sequiturs: if you ask about their past, they don't answer
// with a burdock lesson.

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;

  // ============ WANT DEFINITIONS ============
  // Each want: what the NPC wants from this conversation.
  // - pick(vid): weight for selection (higher = more likely)
  // - opener(vid): the opening line when this want drives the conversation
  // - thread: the conversation thread this want lives in
  // - engage(vid): beat when the player engages with the want
  // - deflect(vid): beat when the player deflects/ignores it
  // - resolve(vid, how): what happens at the end; returns a seed or null
  const WANTS = {
    share_news: {
      thread: 'small',
      pick(vid) {
        // They've seen something, heard something — bursting to tell.
        // More likely if they haven't talked in a while.
        const c = Game.convoGet(vid);
        const daysSince = (Game.state.scholar.day || 0) - (c.lastDay || 0);
        return daysSince > 2 ? 3 : 1;
      },
      opener(vid) {
        const news = [
          '"You\'ll never guess what I saw by the treeline."',
          '"Okay, so — something happened this morning."',
          '"Have you heard? No? Good, I get to tell you first."',
          '"I\'ve been holding this in all day. You\'re the first person I\'m telling."',
        ];
        return Game.convoPickCycle(vid, 'want:news:open', news);
      },
      engage(vid) {
        return Game.convoPickCycle(vid, 'want:news:engage', [
          '"Right? I knew you\'d get it. Nobody else listens like that."',
          '"See, this is why I tell you things."',
          '"I knew you\'d want to hear that one. I know my audience."',
        ]);
      },
      deflect(vid) {
        return '"Oh. Right. Never mind — it\'s probably nothing." They look a little deflated.';
      },
      resolve(vid, how) {
        if (how === 'engaged') return null; // fully shared, no seed
        // They didn't get to tell you — they'll try again.
        return { wantId: 'share_news', note: 'still bursting with news they never got to share' };
      },
    },
    ask_favor: {
      thread: 'personal',
      pick(vid) {
        // High need drives favors: hungry, scared, tired.
        try {
          const n = Game.npcNeeds(vid);
          if (n.hunger > 70 || n.fear > 70 || n.energy < 30) return 4;
        } catch (e) {}
        return 1;
      },
      opener(vid) {
        try {
          const n = Game.npcNeeds(vid);
          if (n.hunger > 70) return '"I hate to ask, but — do you have anything to eat? Anything at all?"';
          if (n.fear > 70) return '"Can you — would you stay close tonight? I don\'t want to be alone when it gets dark."';
          if (n.energy < 30) return '"I\'m running on empty. Could you take my watch for a bit?"';
        } catch (e) {}
        return Game.convoPickCycle(vid, 'want:favor:open', [
          '"There\'s something I\'ve been meaning to ask you."',
          '"Could you do something for me? It\'s not big. Probably."',
        ]);
      },
      engage(vid) {
        return Game.convoPickCycle(vid, 'want:favor:engage', [
          '"Thank you. Seriously — thank you. I wouldn\'t ask if it wasn\'t important."',
          '"You have no idea what that means. Thank you."',
        ]) || '"Thank you. Seriously — thank you."';
      },
      deflect(vid) {
        return Game.convoPickCycle(vid, 'want:favor:deflect', [
          '"No, yeah, of course. Forget I asked." They won\'t forget. They\'ll just stop asking.',
          '"It\'s fine. I\'ll manage." They say it like they don\'t believe it.',
        ]) || '"No, yeah, of course. Forget I asked."';
      },
      resolve(vid, how) {
        if (how === 'engaged') {
          // They owe you now — that's a seed.
          return { wantId: 'repay', note: 'they owe you for the favor — it weighs on them' };
        }
        return { wantId: 'ask_favor', note: 'they still need help but stopped asking' };
      },
    },
    seek_comfort: {
      thread: 'personal',
      pick(vid) {
        try {
          const n = Game.npcNeeds(vid);
          if (n.fear > 60) return 3;
        } catch (e) {}
        // Grieving or scared mood also drives this.
        try {
          const m = Game.npcMood(vid);
          if (m === 'grieving' || m === 'scared') return 3;
        } catch (e) {}
        return 0.5;
      },
      opener(vid) {
        return Game.convoPickCycle(vid, 'want:comfort:open', [
          '"Do you ever — no. Never mind." They don\'t look away, though. They want you to ask.',
          '"I\'m not okay. I\'m saying it out loud so it\'s real: I\'m not okay."',
          '"Can I just... sit here? I don\'t need advice. I just don\'t want to be alone with it."',
        ]);
      },
      engage(vid) {
        return Game.convoPickCycle(vid, 'want:comfort:engage', [
          '"It helps. Just — saying it out loud to someone who\'s actually listening. It helps."',
          '"I don\'t feel fixed. But I feel less alone in it. That counts."',
        ]) || '"It helps. Just — saying it out loud. It helps."';
      },
      deflect(vid) {
        return '"Right. Sorry. I\'m fine." They are very obviously not fine.';
      },
      resolve(vid, how) {
        if (how === 'engaged') return null;
        return { wantId: 'seek_comfort', note: 'they\'re still not okay, still haven\'t said it' };
      },
    },
    warn_you: {
      thread: 'small',
      pick(vid) {
        // They know something dangerous. More likely after monster activity.
        try {
          const v = Game.state.village;
          if ((v.recentAttacks || 0) > 0) return 3;
        } catch (e) {}
        return 0.5;
      },
      opener(vid) {
        // KNOWLEDGE-GATED (2026-10-07): they name only what they actually
        // know — their own recent threat memory. No second-hand certainty:
        // a rumor is framed as a rumor, never as witnessed fact.
        try {
          const day = (Game.state.scholar || {}).day || 0;
          const mem = ((Game.state.village.memory || {})[vid]) || [];
          const threat = mem.filter(m => day - (m.day || 0) <= 5)
            .find(m => /threat|attack|monster|treeline/i.test((m.t || '') + ' ' + (m.note || '')));
          if (threat && threat.note) {
            return Game.convoPickCycle(vid, 'want:warn:open:known', [
              '"Listen — about ' + threat.note + '. I was there. Hear me before you go back out."',
              '"' + threat.note + ' — that was real, and I don\'t want you walking into it blind."',
            ]) || '"Listen. I need you to hear this before you go back out there."';
          }
        } catch (e) {}
        return Game.convoPickCycle(vid, 'want:warn:open', [
          '"Listen. I need you to hear this before you go back out there."',
          '"I don\'t know what it was — I\'m not going to pretend I do. But stay off the far paths tonight."',
          '"Word is something\'s moving out there. That\'s all I\'ve got — rumor, not witnessed. Still. Careful."',
        ]);
      },
      engage(vid) {
        return Game.convoPickCycle(vid, 'want:warn:engage', [
          '"Good. Just — be careful. I mean it."',
          '"Thank you. I\'d rather warn ten people for nothing than miss the one who needed it."',
        ]) || '"Good. Just — be careful. I mean it."';
      },
      deflect(vid) {
        return '"...Suit yourself. Don\'t say I didn\'t try."';
      },
      resolve(vid, how) {
        return null; // warning delivered or not, no seed
      },
    },
    curious: {
      thread: 'personal',
      pick(vid) {
        // They want to know about YOU. More likely at higher trust.
        try {
          const t = (Game.state.village.trust || {})[vid] || 10;
          if (t >= 40) return 2;
        } catch (e) {}
        return 1;
      },
      opener(vid) {
        return Game.convoPickCycle(vid, 'want:curious:open', [
          '"Can I ask you something? Something real?"',
          '"I realize I don\'t actually know much about you."',
          '"What\'s the one thing nobody here knows about you? You don\'t have to answer. I just wonder."',
        ]);
      },
      engage(vid) {
        return Game.convoPickCycle(vid, 'want:curious:engage', [
          '"Huh. I wouldn\'t have guessed that about you."',
          '"Filed away. I like knowing the real version."',
        ]) || '"Huh. I wouldn\'t have guessed that about you."';
      },
      deflect(vid) {
        return '"Fair enough. Some things aren\'t for sharing."';
      },
      resolve(vid, how) {
        if (how === 'engaged') {
          // Now they know something real — that deepens things.
          return { wantId: 'closeness', note: 'they learned something real about you — it changed things' };
        }
        return null;
      },
    },
    just_company: {
      thread: 'small',
      pick(vid) {
        try {
          const n = Game.npcNeeds(vid);
          if (n.social > 70) return 3;
        } catch (e) {}
        return 1;
      },
      opener(vid) {
        return Game.convoPickCycle(vid, 'want:company:open', [
          '"Hey. Got a minute? No reason. Just — hey."',
          '"Mind if I just sit with you for a bit?"',
          '"Don\'t mind me. I just wanted to be near people for a while."',
        ]);
      },
      engage(vid) {
        return Game.convoPickCycle(vid, 'want:company:engage', [
          '"This is nice. Just — being around people. I forget how much I need it."',
          '"Thanks. Company without an agenda. I\'d forgotten that was a thing."',
        ]) || '"This is nice. Just — being around people."';
      },
      deflect(vid) {
        return '"Oh. Yeah, of course. I\'ll — I\'ll go."';
      },
      resolve() { return null; },
    },
    // ---- NEW WANTS (Steve 2026-10-07: expand the smallest pool) ----
    offer_teach: {
      thread: 'small',
      pick(vid) {
        // They have something to pass on — higher at real trust, higher
        // when their lifeseed says they actually know something.
        let w = 1;
        try {
          const t = (Game.state.village.trust || {})[vid] || 10;
          if (t >= 40) w += 2;
          const vp = Game.vpOf(vid);
          const so = vp && vp.lifeseed && vp.lifeseed.skillOrigins;
          if (so && Object.keys(so).length) w += 1;
        } catch (e) {}
        return w;
      },
      opener(vid) {
        const skill = Game.convoTeachSkill(vid);
        const what = skill ? skill.name : 'a thing or two';
        // Origin-first phrasing: the origin is a bare phrase ("haying
        // season at the clinic", "in Mara's kitchen"), so it leads —
        // "I learned X haying season" would garble.
        const where = skill && skill.origin
          ? skill.origin.charAt(0).toUpperCase() + skill.origin.slice(1) + ' — that\'s where I learned ' + skill.name + '.'
          : null;
        return Game.convoPickCycle(vid, 'want:teach:open', [
          '"I could show you ' + what + ', if you want. Properly — not the half version."',
          '"You ever learn ' + what + '? I could teach you. I\'m good at it — or I was, once."',
          '"' + (where || 'I know a few things worth knowing.') + ' Want me to show you?"',
        ]);
      },
      engage(vid) {
        const skill = Game.convoTeachSkill(vid);
        const origin = skill && skill.origin ? ' I learned it ' + skill.origin + '.' : '';
        return Game.convoPickCycle(vid, 'want:teach:engage', [
          '"Good.' + origin + ' Watch my hands — that\'s where the whole thing lives."',
          '"Good. Here\'s the first thing' + (skill ? ' about ' + skill.name : '') + ': slow is smooth, smooth is fast. Try it."',
        ]) || '"Good. Watch closely — I\'ll only show you once."';
      },
      deflect(vid) {
        return Game.convoPickCycle(vid, 'want:teach:deflect', [
          '"...Right. Everyone\'s busy. The offer stands."',
          '"Okay. It\'s there if you ever want it."',
        ]) || '"...Right. Everyone\'s busy. The offer stands."';
      },
      resolve(vid, how) {
        if (how === 'engaged') return null;
        return { wantId: 'offer_teach', note: 'they still want to teach you what they know' };
      },
    },
    ask_opinion: {
      thread: 'personal',
      pick(vid) {
        // A live village matter makes them want counsel. Weight by events —
        // grief, tension, hunger, or a conflict they're personally in.
        try {
          const v = Game.state.village;
          const t = (v.trust || {})[vid] || 10;
          if (t < 25) return 0.5;
          let w = 1;
          if ((v.grief || 0) > 0) w += 2;
          if (Object.values(v.heat || {}).some(h => h > 0)) w += 2;
          const hungry = (v.roster || []).filter(id => {
            try { return (Game.npcNeeds(id).hunger || 0) > 70; } catch (e) { return false; }
          }).length;
          if (hungry > 2) w += 2;
          const cf = (v.conflicts || []).find(x => !x.resolved && (x.a === vid || x.b === vid));
          if (cf) w += 2;
          return w;
        } catch (e) {}
        return 1;
      },
      opener(vid) {
        // The matter is generated from the live village — never invented.
        const matter = Game.convoOpinionMatter(vid);
        return Game.convoPickCycle(vid, 'want:opinion:open', [
          '"Can I ask your take on something? ' + matter + ' I keep going back and forth."',
          '"' + matter + ' What would you do? I need someone who isn\'t in the middle of it."',
          '"I need a second head on this. ' + matter + '"',
        ]);
      },
      engage(vid) {
        return Game.convoPickCycle(vid, 'want:opinion:engage', [
          '"That\'s... actually helpful. I hadn\'t looked at it that way."',
          '"Hm. Okay. I\'m going to sit with that."',
          '"Good. That\'s a real answer — most people just tell me what I want to hear."',
        ]) || '"Thanks. That helps, honestly."';
      },
      deflect(vid) {
        return Game.convoPickCycle(vid, 'want:opinion:deflect', [
          '"Never mind — probably unfair to put it on you. I\'ll figure it out."',
          '"Forget it. I shouldn\'t outsource my conscience."',
        ]) || '"Never mind — probably unfair to put it on you."';
      },
      resolve(vid, how) {
        if (how === 'engaged') return null;
        return { wantId: 'ask_opinion', note: 'they never got your counsel on what\'s weighing on them' };
      },
    },
    make_amends: {
      thread: 'personal',
      pick(vid) {
        // Guilt drives this — their own recent wrongs, read from memory.
        try {
          const day = (Game.state.scholar || {}).day || 0;
          const mem = ((Game.state.village.memory || {})[vid]) || [];
          const guilt = mem.filter(m => day - (m.day || 0) <= 7)
            .some(m => /theft_done|started_rumor|promise_broken|confronted|stingy_gift|deal_refused/i.test(m.t || ''));
          if (guilt) return 4;
        } catch (e) {}
        return 0.3;
      },
      opener(vid) {
        return Game.convoPickCycle(vid, 'want:amends:open', [
          '"I did something. I haven\'t told anyone. ...Can I tell you?"',
          '"There\'s something I did that I can\'t stop thinking about. I need to say it out loud."',
          '"If I told you I did something I\'m not proud of — would you still be sitting here?"',
        ]);
      },
      engage(vid) {
        return Game.convoPickCycle(vid, 'want:amends:engage', [
          '"Thank you for hearing it. I\'m going to make it right — I just needed to say it first."',
          '"Saying it doesn\'t fix it. But it\'s a start. I\'ll do the rest."',
        ]) || '"Thank you. I needed one person to know."';
      },
      deflect(vid) {
        return Game.convoPickCycle(vid, 'want:amends:deflect', [
          '"...Yeah. Forget it. It\'s probably too late anyway."',
          '"No. You\'re right not to ask. Some things should stay buried."',
        ]) || '"...Yeah. Forget it."';
      },
      resolve(vid, how) {
        if (how === 'engaged') return { wantId: 'amends_owed', note: 'they confessed something to you — now they have to make it right' };
        return { wantId: 'make_amends', note: 'they still haven\'t confessed what they did' };
      },
    },
    show_pride: {
      thread: 'small',
      pick(vid) {
        // They did something good and want one witness — from memory.
        try {
          const day = (Game.state.scholar || {}).day || 0;
          const mem = ((Game.state.village.memory || {})[vid]) || [];
          const good = mem.filter(m => day - (m.day || 0) <= 5)
            .some(m => /promise_kept|mediated|hero|saved|gift|comforted|ally/i.test(m.t || ''));
          if (good) return 3;
        } catch (e) {}
        return 0.5;
      },
      opener(vid) {
        return Game.convoPickCycle(vid, 'want:pride:open', [
          '"I did something good yesterday. Is it terrible that I want someone to know?"',
          '"Nobody saw it, so it doesn\'t count — that\'s the rule, right? ...Can I tell you anyway?"',
          '"I\'m proud of something and I feel guilty about being proud. That\'s where we are."',
        ]);
      },
      engage(vid) {
        const deed = Game.convoPrideDeed(vid);
        return Game.convoPickCycle(vid, 'want:pride:engage', [
          '"' + deed + 'Thanks for letting me say it. I don\'t need a medal — I just needed one witness."',
        ]) || '"Thanks for letting me say it."';
      },
      deflect(vid) {
        return Game.convoPickCycle(vid, 'want:pride:deflect', [
          '"...Never mind. Forget I said anything."',
          '"It\'s stupid. Bragging about decency. Forget it."',
        ]) || '"...Never mind."';
      },
      resolve() { return null; },
    },
  };

  // ============ WANT -> BEAT TAG MAP (canonical) ============
  // convo-beats.js consumes Game.wantBeatTag — never duplicate this mapping
  // there. offer_teach is an offer (they offer you a lesson); ask_opinion is
  // news (they lay out the matter); make_amends is feeling (vulnerable);
  // show_pride is news (they're telling you something good).
  Game.WANT_BEAT_TAGS = {
    share_news: 'news', ask_favor: 'offer', seek_comfort: 'feeling',
    warn_you: 'news', curious: 'question', just_company: 'small',
    offer_teach: 'offer', ask_opinion: 'news', make_amends: 'feeling',
    show_pride: 'news',
  };
  Game.wantBeatTag = function (wid) {
    return (Game.WANT_BEAT_TAGS || {})[wid] || 'offer';
  };

  const methods = {
    // convoSelectWant: pick the NPC's want for this conversation.
    // Priority: unresolved seeds > high needs > personality > random.
    convoSelectWant(vid) {
      // 1. Seeds first — unfinished business takes priority.
      const seed = this.convoCheckSeeds(vid);
      if (seed && WANTS[seed.wantId]) {
        return { id: seed.wantId, def: WANTS[seed.wantId], fromSeed: true, seedNote: seed.note };
      }
      // 2. Weight by needs and context.
      let best = null, bestW = -1;
      for (const [id, def] of Object.entries(WANTS)) {
        let w = 0;
        try { w = def.pick.call(this, vid); } catch (e) { w = 0; }
        // Small random factor so it's not deterministic.
        w += Math.random() * 0.5;
        if (w > bestW) { bestW = w; best = id; }
      }
      if (!best) best = 'just_company';
      return { id: best, def: WANTS[best], fromSeed: false };
    },

    // convoWantOpener: the opening line when a want drives the conversation.
    // Returns {line, thread}. Falls back to the normal opener if no want.
    convoWantOpener(vid, want) {
      if (!want || !want.def) return null;
      let line = null;
      try { line = want.def.opener.call(this, vid); } catch (e) { line = null; }
      if (!line) return null;
      return { line, thread: want.def.thread || 'small', wantId: want.id };
    },

    // convoComposeBeat: THE NON-SEQUITUR FIX.
    // Every NPC beat goes through here. It takes the raw beat and the
    // player's last utterance, and ensures the beat acknowledges what the
    // player said before delivering new content.
    //
    // playerSaid: { kind, label, topic } — what the player just chose/said
    // rawBeat: the beat the old system would have delivered
    //
    // The composition: if the raw beat already references the player's
    // input (contains a response to their question/statement), pass through.
    // Otherwise, prepend a brief acknowledgment that bridges to the beat.
    convoComposeBeat(vid, rawBeat, playerSaid) {
      if (!rawBeat) return rawBeat;
      if (!playerSaid || !playerSaid.label) return rawBeat;
      // If the beat is already a direct answer (reactive/generic answers,
      // question answers), it was composed as a response — pass through.
      if (playerSaid.isAnswer) return rawBeat;
      // Acknowledgment bridges: short, natural, voice-aware.
      // These acknowledge WITHOUT answering — the beat still delivers
      // its content, but now it follows the player's line of thought.
      const label = String(playerSaid.label).toLowerCase();
      let ack = null;
      if (/tell me more|go on|more/i.test(playerSaid.label)) {
        // They're asking for more — no ack needed, the beat IS more.
        return rawBeat;
      }
      if (playerSaid.topic) {
        // Player asked about a topic — acknowledge the question.
        const topicAcks = [
          '"Good question." ',
          '"Huh. Let me think about that." ',
          '"You want to know about that? Okay." ',
        ];
        ack = topicAcks[Math.floor(Math.random() * topicAcks.length)];
      } else if (/you|your/i.test(label) && label.length < 60) {
        // Player asked about THEM — acknowledge being asked.
        ack = '"Me? Okay." ';
      }
      if (!ack) return rawBeat;
      // Voice the acknowledgment through their voice, then the beat.
      try {
        return this.voiceLine(vid, ack) + ' ' + rawBeat.replace(/^"/, '').replace(/"$/, '');
      } catch (e) {
        return ack + rawBeat;
      }
    },

    // convoAdvanceWant: track the want's progress based on player behavior.
    // playerKind: 'engage' | 'deflect' | 'ignore'
    // Moves stage 0->1 (surfaced) -> 2 (engaged) -> 3 (resolved).
    convoAdvanceWant(vid, playerKind) {
      const c = this.convoGet(vid);
      if (!c.want) return;
      const want = c.want;
      if (playerKind === 'engage') {
        if (want.stage < 2) want.stage = 2;
        // Engaging delivers the want's engage beat.
        try {
          const beat = want.def.engage.call(this, vid);
          if (beat) {
            c.transcript.push({ who: 'them', text: beat });
            this.sayLine(vid, beat);
          }
        } catch (e) {}
      } else if (playerKind === 'deflect') {
        try {
          const beat = want.def.deflect.call(this, vid);
          if (beat) {
            c.transcript.push({ who: 'them', text: beat });
            this.sayLine(vid, beat);
          }
        } catch (e) {}
        want.stage = 3;
        want.resolution = 'deflected';
      }
    },

    // convoPlantSeed: record unfinished business for next conversation.
    // seed: { wantId, note, day }
    convoPlantSeed(vid, seed) {
      if (!seed || !seed.wantId) return;
      const v = this.state.village;
      v.convoSeeds = v.convoSeeds || {};
      v.convoSeeds[vid] = {
        wantId: seed.wantId,
        note: seed.note || '',
        day: this.state.scholar.day || 0,
      };
    },

    // convoCheckSeeds: is there unfinished business with this NPC?
    // Returns the seed or null. Seeds expire after 7 days.
    convoCheckSeeds(vid) {
      const v = this.state.village;
      const seed = (v.convoSeeds || {})[vid];
      if (!seed) return null;
      const now = this.state.scholar.day || 0;
      if (now - (seed.day || 0) > 7) {
        delete v.convoSeeds[vid];
        return null;
      }
      return seed;
    },

    // convoResolveWant: called at endConvo. Determines the resolution
    // and plants a seed if the want is unresolved.
    convoResolveWant(vid, how) {
      const c = this.convoGet(vid);
      if (!c.want || !c.want.def) return;
      const want = c.want;
      // If they never engaged (stage < 2), the want is unresolved.
      const resolution = want.stage >= 2 ? 'engaged' : (how === 'left' ? 'abandoned' : 'unresolved');
      want.stage = 3;
      want.resolution = resolution;
      let seed = null;
      try {
        seed = want.def.resolve.call(this, vid, resolution);
      } catch (e) {}
      if (seed) this.convoPlantSeed(vid, seed);
      // Clear the consumed seed if this want came from one.
      if (want.fromSeed) {
        try { delete this.state.village.convoSeeds[vid]; } catch (e) {}
      }
    },
  };

  Object.assign(Game, methods);

  // ============ HOOKS ============
  // Layer the want system onto the existing conversation flow.
  // We wrap startConvo (want selection + opener) and endConvo (resolution + seeds).
  // The beat composition hook integrates into convoTurn via convoBeatOf.

  const _startConvo = Game.startConvo;
  Game.startConvo = function (vid) {
    // Select the want BEFORE the original startConvo runs, so we can
    // override the opener if the want has one.
    let want = null;
    try { want = this.convoSelectWant(vid); } catch (e) {}
    const result = _startConvo.call(this, vid);
    if (!result || result.ended) return result;
    // If the want has a bespoke opener and this isn't a seed-driven
    // conversation that already set its tone, layer it in.
    // (We don't replace the original opener — we let the want shape
    // the SECOND beat, so the greeting stays natural and the want
    // surfaces organically after hello.)
    if (want && want.def) {
      const c = this.convoGet(vid);
      c.want = { id: want.id, def: want.def, stage: 0, fromSeed: !!want.fromSeed };
      // If this want came from a seed, surface it immediately —
      // they have unfinished business and it shows.
      if (want.fromSeed) {
        try {
          const opener = this.convoWantOpener(vid, want);
          if (opener && opener.line) {
            const seedLine = `"About ${want.seedNote || 'last time'} — " ` +
              opener.line.replace(/^"/, '').replace(/"$/, '') + '"';
            c.transcript.push({ who: 'them', text: seedLine });
            this.sayLine(vid, seedLine);
            result.line = seedLine;
            c.want.stage = 1; // surfaced
            // Tag it — this bypasses the tagged generators in convo-beats.js
            // just like the held-beat path, so stamp the tag here directly.
            // The opener IS the delivered line here, so mark it tagged for
            // the engagement mapper below.
            try {
              const tag = Game.wantBeatTag(want.id);
              c.lastBeat = { tag, topic: 'want', line: seedLine };
              const te = c.transcript[c.transcript.length - 1];
              if (te) { te.beat = tag; te.topic = 'want'; }
              c.want.beatTagged = true;
            } catch (e) {}
          }
        } catch (e) {}
      }
    }
    return result;
  };

  const _endConvo = Game.endConvo;
  Game.endConvo = function (vid, how) {
    // Resolve the want and plant seeds BEFORE the original endConvo
    // clears the conversation state.
    try { this.convoResolveWant(vid, how); } catch (e) {}
    return _endConvo.call(this, vid, how);
  };

  // ============ WANT SURFACING ============
  // The want surfaces organically after the greeting — not as the opener
  // (that's abrupt), but as the second or third beat. We wrap convoTurn:
  // after the normal turn completes, if the want is still unspoken (stage 0)
  // and enough exchanges have passed, the NPC brings it up.
  const _convoTurn = Game.convoTurn;
  Game.convoTurn = function (vid, choiceId) {
    const result = _convoTurn.call(this, vid, choiceId);
    if (!result || result.ended) return result;
    try {
      const c = this.convoGet(vid);
      if (c.want && c.want.stage === 0 && (c.exchanges || 0) >= 1) {
        // Time to surface the want. Queue it as a held beat so it lands
        // on the continuer — natural, not interruptive.
        const opener = this.convoWantOpener(vid, c.want);
        if (opener && opener.line) {
          c.heldBeats = c.heldBeats || [];
          // Don't duplicate if already queued.
          const already = c.heldBeats.some(h => h.wantSurface);
          if (!already) {
            c.heldBeats.push({ text: opener.line, wantSurface: true });
            c.want.stage = 1; // surfaced
            // Remember the exact opener text so we can tag the beat when it
            // lands (below). The goon continuer delivers held beats verbatim.
            c.want.openerText = opener.line;
            // The want's thread becomes the conversation thread if the
            // player engages — but we don't force it yet.
          }
        }
      }
      // WANT BEAT TAGGING (Steve 2026-10-07): a want-surfaced held beat
      // lands through the goon continuer, bypassing the tagged generators
      // in convo-beats.js — so c.lastBeat would still describe the OLD
      // beat and replies would answer the wrong thing. When the queued
      // opener is delivered (its exact text is the newest them-line), stamp
      // c.lastBeat and the transcript entry with the want's true tag.
      if (c.want && c.want.openerText && !c.want.beatTagged) {
        const t = c.transcript || [];
        const lastThem = [...t].reverse().find(e => e.who === 'them');
        if (lastThem && String(lastThem.text) === String(c.want.openerText)) {
          const tag = Game.wantBeatTag(c.want.id);
          c.lastBeat = { tag, topic: 'want', line: String(lastThem.text) };
          lastThem.beat = tag;
          lastThem.topic = 'want';
          c.want.beatTagged = true;
        }
      }
      // BEAT COMPOSITION: wrap the returned line through the composer
      // so it acknowledges what the player just said.
      // We track the player's choice from the choiceId.
      if (result.line && choiceId && choiceId !== 'goon' && choiceId !== 'leave') {
        const playerSaid = this.convoPlayerSaid(vid, choiceId);
        if (playerSaid) {
          const composed = this.convoComposeBeat(vid, result.line, playerSaid);
          if (composed && composed !== result.line) {
            result.line = composed;
            // Update the transcript's last them-entry too.
            const t = c.transcript;
            for (let i = t.length - 1; i >= 0; i--) {
              if (t[i].who === 'them') { t[i].text = composed; break; }
            }
          }
        }
      }
    } catch (e) {}
    return result;
  };

  // convoWantEngage: advance the want arc from a player's dlg: reply.
  // Called by the OUTERMOST convoTurn wrapper (convo-beats.js) because the
  // dialogue layer intercepts every 'dlg:' choice and returns early — a
  // mapper inside the wants wrapper would never see them.
  // Engaging replies move a surfaced, delivered want to stage 2; the
  // want's own engage beat queues behind the turn's line (one-beat turns
  // hold) unless the dlg: handler already spoke it (engageSpoken).
  // Declines move it to stage 3 with the deflect beat queued.
  Game.convoWantEngage = function (vid, choiceId) {
    try {
      const c = this.convoGet(vid);
      if (!c.want || c.want.stage !== 1 || !c.want.beatTagged) return;
      if (!choiceId || choiceId.indexOf('dlg:') !== 0) return;
      const dlg = choiceId.slice(4);
      const ENGAGE = ['more', 'react', 'help', 'details', 'learn', 'comfort', 'empathize', 'askwhy'];
      const DEFLECT = ['cant', 'later'];
      const queueWantBeat = (kind) => {
        try {
          const fn = c.want.def && c.want.def[kind];
          if (!fn) return;
          const b = fn.call(this, vid);
          if (b) {
            c.heldBeats = c.heldBeats || [];
            if (!c.heldBeats.some(h => h.wantEngage)) c.heldBeats.push({ text: b, wantEngage: true });
          }
        } catch (e) {}
      };
      if (ENGAGE.indexOf(dlg) !== -1) {
        c.want.stage = 2; // engaged
        if (!c.want.engageSpoken) queueWantBeat('engage');
      } else if (DEFLECT.indexOf(dlg) !== -1) {
        c.want.stage = 3; // deflected
        c.want.resolution = 'deflected';
        queueWantBeat('deflect');
      }
    } catch (e) {}
  };

  // convoPlayerSaid: reconstruct what the player just said from the choiceId.
  // Returns { label, topic, isAnswer } for the beat composer.
  Game.convoPlayerSaid = function (vid, choiceId) {
    try {
      const c = this.convoGet(vid);
      // Ask-topic choices carry the topic.
      if (choiceId.indexOf('ask:') === 0) {
        const topic = choiceId.slice(4);
        return { label: 'ask:' + topic, topic, isAnswer: false };
      }
      // Answers to their questions are already responses — pass through.
      if (choiceId.indexOf('ans:') === 0 || choiceId.indexOf('react:') === 0 ||
          choiceId.indexOf('gq:') === 0) {
        return { label: choiceId, isAnswer: true };
      }
      // Follow-ups reference the topic.
      if (choiceId.indexOf('follow:') === 0) {
        const parts = choiceId.split(':');
        return { label: 'follow:' + parts[1], topic: parts[1], isAnswer: false };
      }
      return { label: choiceId, isAnswer: false };
    } catch (e) { return null; }
  };

  // convoTeachSkill: what can this villager actually teach? From their
  // lifeseed skill origins (who taught THEM, and where) — never invented
  // wholesale. Returns {key, name, origin} or null.
  Game.convoTeachSkill = function (vid) {
    try {
      const vp = this.vpOf(vid);
      const ls = vp && vp.lifeseed;
      const so = (ls && ls.skillOrigins) || {};
      const keys = Object.keys(so);
      if (keys.length) {
        const k = keys[Math.floor(Math.random() * keys.length)];
        const names = {
          food: 'finding food', medicinal: 'patching people up', mending: 'fixing things',
          navigation: 'never getting lost', tracking: 'reading ground',
          trapping: 'traps', forecast: 'reading the sky',
        };
        return { key: k, name: names[k] || k, origin: so[k] };
      }
    } catch (e) {}
    return null;
  };

  // convoOpinionMatter: the thing weighing on them, generated from the LIVE
  // village — grief, a conflict they're in, tension, hunger. Never invented.
  Game.convoOpinionMatter = function (vid) {
    try {
      const v = this.state.village;
      if ((v.grief || 0) > 0) {
        const corpses = v.corpses || [];
        const recent = corpses[corpses.length - 1];
        const nm = recent ? String(recent.name || '').split(' ')[0] : null;
        return nm ? 'Since ' + nm + ' died — how do we honor them properly?' : 'How do we grieve properly when there\'s still work to do?';
      }
      const cf = (v.conflicts || []).find(x => !x.resolved && (x.a === vid || x.b === vid));
      if (cf) {
        let onm = 'them';
        try { const oid = cf.a === vid ? cf.b : cf.a; onm = this.displayName(oid).split(' ')[0]; } catch (e) {}
        return 'This thing with ' + onm + ' — do I bend, or hold my ground?';
      }
      if (Object.values(v.heat || {}).some(h => h > 0)) return 'Everyone\'s picking sides and I don\'t want to. Is staying out of it cowardice?';
      const hungry = (v.roster || []).filter(id => {
        try { return id !== this.villagerId && (this.npcNeeds(id).hunger || 0) > 70; }
        catch (e) { return false; }
      }).length;
      if (hungry > 2) return 'People are going hungry and the stores won\'t stretch. Who eats first — how do you even decide that?';
    } catch (e) {}
    return 'Whether I\'m pulling my weight here. Honestly — am I?';
  };

  // convoPrideDeed: the good thing they did, in their own words — from
  // their memory, never invented.
  Game.convoPrideDeed = function (vid) {
    try {
      const day = (this.state.scholar || {}).day || 0;
      const mem = ((this.state.village.memory || {})[vid]) || [];
      const good = mem.filter(m => day - (m.day || 0) <= 5)
        .find(m => /promise_kept|mediated|hero|saved|gift|comforted|ally/i.test(m.t || ''));
      if (good && good.note) {
        const nm = good.note;
        const map = {
          promise_kept: 'I kept my word — ' + nm + '. ',
          mediated: 'I talked people down — ' + nm + '. ',
          hero: nm + ' — I was there. ',
          saved: 'I saved ' + nm + '. ',
          gift: 'I gave ' + nm + ' what I had. ',
          comforted: 'I sat with someone who was scared — ' + nm + '. ',
          ally: 'I stood up for someone — ' + nm + '. ',
        };
        if (map[good.t]) return map[good.t];
        return 'I did right by someone — ' + nm + '. ';
      }
    } catch (e) {}
    return 'I did the right thing when nobody was watching. ';
  };

})();

