// @ontology
// system: truth
// description: Truth/distortion. Claim-gossip corrects (tellers share the truth); action-gossip distorts per retelling (code: game.js seedGossip).
// provides:
//   - trackClaim(vid, topic, claim)
//   - getClaims(vid)
//   - makeLie(vid, topic)
//   - getActiveLie(vid)
//   - addDoubt(doubt)
//   - getDoubts()
//   - resolveDoubt(id)
//   - confrontDoubt(vid)
//   - npcGossipAbout(vid)
// rules:
//   - claim_gossip_shares_truth_no_distortion: true (code: npcGossipAbout)
//   - min_liars_per_village: 1 (code: newGame wrapper)
//   - verbal_slips_require_shared_language: true (code: endDay slip loop)
//   - observation_doubt_one_per_field: true (code: addDoubt)
//   - gossip_intel_forms_lead_without_claim: true (code: checkGossipClaim)
//   - gossip_exempt_from_teller_lie_scrub: true (code: convoAskTopic wrapper)
//   - confront_via_interpreter_when_bridged: true (code: convoChoices wrapper)
// consumes:
//   - village.gossip
// ============ TRUTH-FINDING ============
// People can lie. The Codex doesn't detect lies — it notices when things
// don't add up. Contradictions, gossip that conflicts, behavior that doesn't
// match the story. The player decides what it means.
//
// How it works:
// - Some NPCs lie (motivated: hiding, shame, manipulation, pathological).
//   Lies are generated at first talk, stored on the villager.
// - When they answer 'past'/'goal' topics, the lie is substituted for truth.
//   The journal records what they TOLD you, not the truth.
// - Claims are tracked per topic. New claim != old claim → doubt.
// - Gossip about someone is cross-referenced against their claims.
// - observePerson(vid): spend time watching. Behavior may contradict story.
// - Confrontation: "You told me X, but [evidence]." Personality-driven.
// - Doubts live in state.codex.doubts, surface in the journal as ❓ notes.
//
// Self-attaching module: wraps Game methods, no game.js edits.
// Load order: after conversation.js, journal.js, party.js. Before app.js.

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;

  const day = () => (Game.state.scholar || {}).day || 0;
  const sysUp = () => !!Game.state.systemArrived;

  // ---- occupation domains for plausible lies ----
  // A good lie is adjacent (nurse → paramedic). A bad lie is distant
  // (nurse → rodeo clown) — and creates its own doubt.
  const OCC_DOMAINS = {
    medical: ['ER nurse', 'paramedic', 'EMT', 'doctor', 'veterinarian', 'pharmacist', 'midwife', 'surgeon'],
    food: ['line cook', 'chef', 'butcher', 'baker', 'farmer', 'fishmonger', 'barista'],
    mechanical: ['mechanic', 'electrician', 'carpenter', 'plumber', 'welder', 'engineer', 'machinist'],
    outdoors: ['hunting guide', 'farmer', 'park ranger', 'fisher', 'logger', 'surveyor', 'rancher'],
    service: ['bartender', 'server', 'barber', 'housekeeper', 'retail clerk', 'delivery driver'],
    knowledge: ['teacher', 'ESL teacher', 'librarian', 'professor', 'researcher', 'journalist', 'writer'],
    uniformed: ['police officer', 'firefighter', 'paramedic', 'soldier', 'security guard', 'EMT'],
    office: ['accountant', 'lawyer', 'analyst', 'manager', 'receptionist', 'programmer'],
    craft: ['carpenter', 'tailor', 'jeweler', 'potter', 'blacksmith', 'weaver'],
    care: ['nurse', 'ER nurse', 'social worker', 'therapist', 'home aide', 'counselor'],
  };
  const occDomain = (name) => {
    const n = String(name || '').toLowerCase();
    for (const [d, list] of Object.entries(OCC_DOMAINS))
      if (list.some(o => o.toLowerCase() === n || n.includes(o.toLowerCase().split(' ')[0]))) return d;
    return null;
  };

  const methods = {

    // ---- line pools for detective dialogue (procedural depth: many voices, no repeats) ----
    // {first} is replaced with the villager's first name at render time.
    // drawTruthLine() never serves the same line twice in one game run:
    // per-pool, lines are drawn without replacement across ALL villagers
    // and only recycle after the whole pool is exhausted.
    truthLinePools: {
      deflectClumsy: [
        `"What? No — I mean —" {first} stumbles. "It's... it's complicated. Can we not do this right now?"`,
        `"You're wrong." Too fast. {first} looks away. "Just... drop it, okay?"`,
        `"I — I don't remember saying that." A beat. "People hear what they want to hear."`,
        `"That's not — that's not what happened." {first}'s hands won't stop moving. "You're twisting things."`,
        `"Ha. Funny." The laugh is dry. "Is this what we're doing now? Interrogations?"`,
        `"I already told you what happened." {first} crosses their arms. "Asking again doesn't change it."`,
        `"Nope. No." {first} shakes their head too fast. "I don't know where you're getting this."`,
        `A pause that's a beat too long. "I think you're confused," {first} says, not quite looking at you.`,
      ],
      deflectSmooth: [
        `{first} smiles — unhurried. "You're imagining things. Stress does that out here." Smooth. Too smooth.`,
        `"Interesting theory." {first} doesn't blink. "Why would I lie about that? Think about it." And somehow you're the one explaining yourself.`,
        `{first} tilts their head, genuinely curious. "Where did you hear that? Because somebody's playing you."`,
        `"Ask yourself who benefits." {first} shrugs. "I told you the truth. The question is whether you want it."`,
        `{first} laughs — soft, unbothered. "You know what this sounds like? Paranoia with extra steps."`,
        `"Memory's a funny thing out here." {first} taps their temple. "Yours included."`,
        `{first} doesn't even flinch. "If I were lying, do you really think you'd catch me?" Said lightly. Landed heavy.`,
        `"Prove it," {first} says, pleasant as anything. "No? Then we're done with this, I think."`,
      ],
      attacks: [
        `"Why are you interrogating me?" {first}'s voice goes cold. "We're all lying about something out here. You want to go first?"`,
        `"I don't have to explain myself to you." {first} stands. "Ask around. See who trusts you after."`,
        `"You think you know me?" {first} steps closer. "You don't. Back off."`,
        `"Careful." {first}'s voice drops. "Accusations have a way of sticking to the accuser."`,
        `"Done talking." {first} turns away. "Come back when you're not playing detective."`,
        `"Say that again where everyone can hear." A thin smile. "Or don't. Your call."`,
        `"Wow." {first} looks hurt, then angry. "I share my food with you and this is what I get?"`,
      ],
      // watching someone: quiet observation beats. No-repeat via drawTruthLine —
      // a player who watches the same person repeatedly shouldn't read the
      // same three sentences on loop.
      observeCalm: [
        `You watch {first} for a while. They move like someone comfortable in their own story. Nothing feels off.`,
        `{first} doesn't know you're watching. What you see matches what they've told you.`,
        `An hour of watching {first}. Either they're telling the truth, or they're very good.`,
        `You study {first} at the fire, at work, at rest. No tells. Either clean or careful — you can't tell which.`,
        `{first} laughs at something across the fire — unguarded, unperformed. Liars rehearse; that wasn't rehearsed.`,
        `You watch {first}'s hands while they work. Steady. People's hands tell on them eventually — these aren't telling.`,
        `A whole afternoon with {first} in your eyeline. They complain about the same things everyone complains about. Nothing hidden, or hidden well.`,
        `{first} catches you looking and just nods, easy. No flinch, no performance. Whatever they're holding, it isn't guilt.`,
      ],
      observeTellOcc: [
        // KNOWLEDGE GATING (Steve 2026-10-06): these lines used to name the
        // TRUE trade in the narrator's voice ("{truthCap} have stories in
        // their hands") — handing the player a truth they hadn't earned. The
        // observation earns a CRACK (the cover is false), never the truth.
        // The truth comes from slips, gossip, or confrontation.
        `{first} claims to have been a {told}. But you watched them try to {tellVerb} — their hands didn't know the work. People who've done that work have stories in their hands. {first}'s hands are blank.`,
        `Someone asked {first} about {told} work. The answer was smooth — too smooth, like reciting. Then later, doing something a {told} does without thinking, {first} fumbled it completely.`,
        `{first} says "{told}". But their calluses, their posture, the way they hold a tool — that's not {told} work. That's someone else's work, or no work at all.`,
        `{first} dropped the {told} act for half a second when they thought nobody was looking — something else showed through, quick as a blink. Not {told}. Gone before you could name it.`,
      ],
      observeTellOrigin: [
        // same gating as occupation: the crack, never the true origin word.
        `{first} says they're from {told}. But twice now they've named streets that don't exist in {told} — then gone very quiet.`,
        `{first} claims {told}. Their accent slips sometimes. Not {told}. Somewhere else.`,
        `You asked {first} about {told} — the streets, the weather, the way people talk. They answered wrong in a way a local never would.`,
        // POOL EXPANSION (Steve 2026-10-06): more cracks, same discipline —
        // the cover breaks, the truth stays hidden.
        `{first} says they're from {told}. But their hands go still when {told} comes up — the way people do when a name costs them something.`,
        `{first} claims {told}, but they flinched at the old place-names. Not recognition — dread. {told} is where they're from the way a wound is where you're from.`,
        `{first} told a story about {told} winters. Nobody from {told} would describe a winter like that. They've never been cold there — or they've never been there.`,
      ],
      clears: [
        `"Oh — that?" {first} laughs, relieved. "No, no, you've got it wrong — let me explain..." And they do, and it makes sense, and you feel a little foolish for doubting them.`,
        `"Huh? Oh!" {first} looks genuinely confused, then it clicks. "No — I see why you'd think that. Here's what actually happened..." The explanation holds together.`,
        `"Wait, wait —" {first} holds up a hand, smiling. "I can see exactly why that sounded wrong. No — it's like this..." The pieces slot into place. Of course.`,
        `{first} blinks, then groans. "Oh, that's my fault, I worded that terribly. What I meant was..." The real version is boring, which is how you know it's true.`,
        `"You know what, fair." {first} nods slowly. "I can see how that looked. But here's the thing..." And the thing is mundane, and verifiable, and fine.`,
      ],
      // confession motive lines: spoken inside the confession quote (first person)
      motiveShame: [
        ` I was embarrassed. Everyone here was someone, and I was... that.`,
        ` I was ashamed of the truth. Out here nobody asks, so I stopped telling.`,
        ` The truth felt small. The lie felt like someone worth keeping around.`,
        ` You don't know what it's like, being the only nobody in a camp of somebodies.`,
      ],
      motiveHiding: [
        ` It's safer if people don't know. Please don't tell the others.`,
        ` There are people from my old life I'd rather never find me. That's all.`,
        ` I keep my head down. Old habit. It kept me alive before; it keeps me alive now.`,
        ` The less of me is out there, the less can be used against me.`,
      ],
      motiveProtection: [
        ` I wasn't protecting myself. I was protecting someone else.`,
        ` If the wrong people know, it doesn't fall on me. It falls on them.`,
        ` Someone I love needed the lie more than I needed the truth.`,
        ` I weighed the lie against what the truth would cost them. The lie was cheaper.`,
      ],
      motiveManipulation: [
        ` I thought if you believed that, you'd trust me faster. I'm sorry. Or I'm supposed to be.`,
        ` I wanted an edge. You were new, you were listening, and I used it. I'm not proud of that.`,
        ` Everyone out here is selling something. I was selling a better version of me.`,
        // POOL EXPANSION (Steve 2026-10-06): the manipulation confession
        // stings most when it admits the player was only ever a means.
        ` I thought if you believed me, you'd keep me close. Close is safe. I wasn't thinking about you at all — I'm sorry for that part.`,
        ` You looked at me like I mattered, and I wanted to keep that. So I gave you someone worth looking at. That person isn't real. This one is — and it's worse, isn't it?`,
      ],
      motivePathological: [
        ` I don't know why I said it. It just came out. It always just comes out.`,
        ` The truth is there, somewhere. It just... never comes out first.`,
        ` I wish I could tell you why. I've asked myself that more times than you have.`,
        // POOL EXPANSION (Steve 2026-10-06): the compulsion reads as
        // self-awareness without self-control — unnerving, not cartoonish.
        ` Sometimes I can hear it not being true while it's leaving my mouth. I say it anyway. It's like watching someone else talk.`,
        ` I think I wanted to see if you'd believe it. Not you specifically — anyone. If someone believes it, it's real for a minute. That's the whole trick. I'm sorry.`,
      ],
      // stale doubt lines: the lie was already confessed — they don't confess twice
      staleConfessed: [
        `"We went over this," {first} says, a little tired. "I already told you the truth about that."`,
        `"That again?" {first} sighs. "I confessed that already. I'm not confessing it twice for dramatic effect."`,
        `{first} looks at you, level. "I told you the truth. You can keep poking it, but it's told."`,
        `"You're really going to make me say it again?" {first} rubs their face. "Fine — but it's the same truth as last time."`,
      ],
      // gossip contradiction lines: a teller knows the truth behind the
      // target's lie. These run through drawTruthLine's per-game no-repeat
      // so two villagers can't parrot each other verbatim about the same
      // target (that read as one script, not a village). {first} = target's
      // first name, {teller} = speaker's full name, {lieWord}/{truthWord} =
      // "a surgeon"/"from Denver" phrasing, {truthCap} = "A surgeon"/"From Denver".
      gossipHeard: [ // you already heard the target's claim — pointed question
        `"{first}? They told you they were {lieWord}? Huh." {teller} looks away. "{first} was {truthWord}. Everyone knew."`,
        `"Don't repeat this, but {first}'s story doesn't hold. {truthCap}, back before. Not what they told you."`,
        `{teller} snorts. "{first} said that? Please. {truthCap} — I knew them from before. The story doesn't survive five minutes of scrutiny."`,
        `"{first} told you that?" {teller} gives you a long look. "Then {first} told you wrong. {truthCap} — that's the one I know."`,
      ],
      gossipIntel: [ // straight intel — you hadn't heard the claim yet
        `"{first}?" {teller} lowers their voice. "Between us — they're not {lieWord}. They're {truthWord}. Don't say who told you."`,
        `"You didn't hear it from me, but {first}'s story doesn't hold. {truthCap}, back before."`,
        `"Funny you should ask." {teller} glances over their shoulder. "{first}'s been polishing that story. The unpolished version: {truthWord}. Keep my name out of it."`,
        `"{first}'s story has a fresh coat of paint." {teller} taps the table. "Scrape it off and you get {truthWord}. Just don't scrape it in front of them."`,
      ],
      slipOccupation: [
        // same gating rule: the slip earns a crack, not the narrator naming
        // the true trade ("something only a {atruth} would know" was a leak).
        `"{told}, huh?" {first} nods — then, an hour later, drops a shop-talk detail no {told} would ever get right. They catch themselves. Too late.`,
        `{first} starts a story with "back when I was {atold}..." then corrects to something else mid-sentence. The correction is worse than the slip.`,
        `Someone asks {first} a shop-talk question about {told} work. The pause before the answer is long enough to hear.`,
      ],
      slipOrigin: [
        `{first} mentions "{truth}" like it's home — then says "I mean, {told}." The pause is doing a lot of work.`,
        `{first} names a street, a diner, a high school — all in {truth}. Then catches your eye and goes very quiet.`,
      ],
      slipGoal: [
        // goal ids are raw ("belong") — truthSlip maps them through
        // goalWantText first, so these read as English, not ids.
        `{first} says they want {told}. But everything they DO says they want {truth}.`,
        `{first} claims {told} — then spends the whole evening doing the exact thing someone who wants {truth} would do.`,
      ],
      // cache-theft confessions: the robber admits it. {what} = what was stolen.
      // Per-game no-repeat applies here too — thieves don't share a script.
      theftConfess: [
        `"Okay." {first} looks down. "Okay. It was me. {what} — I was hungry and I... I'm sorry." Their voice is small.`,
        `"Oh." A long pause. "I didn't think it was anyone's. It's gone — I ate it days ago. I'm sorry."`,
        `"Fine." Sharp. "You want to hear it? I dug it up. I was starving and your hole was right there. Happy now?"`,
        `Quiet for a long time. Then, barely audible: "I took {what}. I won't do it again."`,
        `"Ha." Not amused. "So you figured it out. Yeah, I took {what}. What are you going to do about it?"`,
        `{first} won't meet your eyes. "I told myself finders keepers. It wasn't finders keepers. I'm sorry."`,
      ],
    },

    // drawTruthLine(poolKey, vid, vars): pick a line, avoid immediate repeats
    // for this villager. vars: {first, truth, told, atruth, atold}.
    drawTruthLine(poolKey, vid, vars) {
      const pool = this.truthLinePools[poolKey];
      if (!pool || !pool.length) return '';
      const vp = this.vpOf(vid) || {};
      vp.truthLineLast = vp.truthLineLast || {};
      // Per-game no-repeat: two villagers in one run never speak the same line.
      // (Steve: in-character, non-repeated dialogue.) The pool resets only
      // after every line has been used, so long games may eventually recycle.
      let used = null, lastIdx = -1;
      try {
        if (this.state) {
          this.state.truthLineUsed = this.state.truthLineUsed || {};
          used = this.state.truthLineUsed[poolKey] = this.state.truthLineUsed[poolKey] || [];
          if (used.length >= pool.length) {
            // Exhausted: recycle, but never the same line as the one that
            // ended the previous cycle (that would be an immediate repeat).
            lastIdx = used[used.length - 1];
            this.state.truthLineUsed[poolKey] = used = [];
          }
        }
      } catch (e) { used = null; }
      let idx = Math.floor(Math.random() * pool.length);
      if (used) {
        const fresh = [];
        for (let i = 0; i < pool.length; i++) if (!used.includes(i) && i !== lastIdx) fresh.push(i);
        idx = fresh.length ? fresh[Math.floor(Math.random() * fresh.length)] : idx;
        used.push(idx);
      } else if (pool.length > 1 && vp.truthLineLast[poolKey] === idx) {
        idx = (idx + 1) % pool.length;
      }
      vp.truthLineLast[poolKey] = idx;
      let line = pool[idx];
      const v = vars || {};
      const first = v.first || this.nameFirst(vid);
      line = line.split('{first}').join(first);
      if (v.truth) line = line.split('{truth}').join(v.truth);
      if (v.told) line = line.split('{told}').join(v.told);
      if (v.atruth) line = line.split('{atruth}').join(v.atruth);
      if (v.atold) line = line.split('{atold}').join(v.atold);
      // gossip-contradiction interpolation keys (npcGossipAbout)
      if (v.teller) line = line.split('{teller}').join(v.teller);
      if (v.lieWord) line = line.split('{lieWord}').join(v.lieWord);
      if (v.truthWord) line = line.split('{truthWord}').join(v.truthWord);
      if (v.truthCap) line = line.split('{truthCap}').join(v.truthCap);
      if (v.what) line = line.split('{what}').join(v.what);
      if (v.tellVerb) line = line.split('{tellVerb}').join(v.tellVerb);
      return line;
    },

    // ---- lie generation ----
    // npcLies(vid): lazy. Returns vp.lies or generates. Most people are
    // honest; liars have reasons.
    npcLies(vid) {
      const vp = this.vpOf(vid);
      if (!vp || !vp.id) return null;
      if (vp.lies !== undefined) return vp.lies;
      vp.lies = this.genLies(vp);
      return vp.lies;
    },

    genLies(vp) {
      const lies = {};
      // base: ~1 in 5 people bend the truth about who they are. Enough liars
      // that an active detective finds threads; few enough that most villagers
      // are just people. (Raised from 0.12 — dead villages teach nothing.)
      let p = 0.20;
      const dark = vp.personality && vp.personality.dark;
      if (dark && dark.kind === 'malicious') p += 0.50;
      if (dark && dark.kind === 'benign') p += 0.15;
      if (vp.goal === 'escape') p += 0.20;
      if (vp.goal === 'lead') p += 0.15;
      const temp = vp.personality && vp.personality.temperament;
      if (temp === 'prickly' || temp === 'withdrawn') p += 0.10;

      if (Math.random() > p) return lies; // honest person

      // motive shapes the lie and the confrontation
      let motive = 'hiding';
      const mr = Math.random();
      if (dark && dark.kind === 'malicious') motive = mr < 0.5 ? 'pathological' : 'manipulation';
      else if (vp.goal === 'escape') motive = 'hiding';
      else if (mr < 0.3) motive = 'shame';
      else if (mr < 0.5) motive = 'protection';
      else if (mr < 0.7) motive = 'manipulation';

      // pick 1-2 things to lie about
      const fields = [];
      const fr = Math.random();
      if (fr < 0.40) fields.push('occupation');
      else if (fr < 0.65) fields.push('origin');
      else if (fr < 0.90) fields.push('goal');
      if (Math.random() < 0.30 && fields.length < 2) {
        const others = ['occupation', 'origin', 'goal'].filter(f => !fields.includes(f));
        fields.push(others[Math.floor(Math.random() * others.length)]);
      }

      for (const f of fields) {
        const lie = this.makeLie(vp, f, motive);
        if (lie) lies[f] = lie;
      }
      return lies;
    },

    makeLie(vp, field, motive) {
      if (field === 'occupation') {
        const truth = vp.formerOccupation || 'survivor';
        const dom = occDomain(truth);
        const allOccs = (this.data.characterGen.occupations || []).map(o => o.name).filter(Boolean);
        let told;
        const goodLiar = Math.random() < 0.7; // most liars pick plausible covers
        if (goodLiar && dom) {
          const cands = (OCC_DOMAINS[dom] || []).filter(o => o.toLowerCase() !== truth.toLowerCase());
          told = cands.length ? cands[Math.floor(Math.random() * cands.length)] : null;
        }
        if (!told) {
          // bad lie or no domain: pick something distant (suspicious in itself)
          const cands = allOccs.filter(o => occDomain(o) !== dom && o.toLowerCase() !== truth.toLowerCase());
          told = cands.length ? cands[Math.floor(Math.random() * cands.length)] : 'consultant';
        }
        return { told, truth, motive, field };
      }
      if (field === 'origin') {
        const truth = vp.homeRegion || 'somewhere';
        // plausible: a nearby-sounding place, or a big city (hard to verify)
        const covers = ['Denver', 'Chicago', 'Portland', 'Austin', 'Nashville', 'Phoenix',
                        'Seattle', 'Boston', 'Atlanta', 'Minneapolis'];
        const told = covers.find(c => c !== truth) || 'somewhere out west';
        return { told, truth, motive, field };
      }
      if (field === 'goal') {
        const truth = vp.goal || 'survive';
        // cover with something benign and boring
        const covers = ['belong', 'survive', 'heal'];
        const told = covers.find(c => c !== truth) || 'survive';
        return { told, truth, motive, field };
      }
      return null;
    },

    // getActiveLie(vid, topic): returns the lie object if they're lying about
    // this topic RIGHT NOW, else null. Trust matters — but not for everyone.
    // 'personal' smalltalk covers occupation/origin too: the personal talk
    // lines are baked from the TRUE occupation at generation, so the wrapper
    // scrubs them (see lieScrubLine) — otherwise "I'd like to know you
    // better" hands the player the truth for free and breaks the detective
    // loop. (Steve 2026-10-06)
    getActiveLie(vid, topic) {
      const lies = this.npcLies(vid);
      if (!lies) return null;
      const field = (topic === 'past' || topic === 'personal') ? (lies.occupation ? 'occupation' : lies.origin ? 'origin' : null)
                  : topic === 'goal' ? (lies.goal ? 'goal' : null) : null;
      if (!field || !lies[field]) return null;
      const lie = lies[field];
      if (lie.confessed) return null; // they told the truth after confronting

      const trust = ((this.state.village.trust || {})[vid]) || 10;
      const dark = this.vpOf(vid).personality && this.vpOf(vid).personality.dark;
      // high trust → honesty, UNLESS pathological (they lie better when trusted)
      if (trust > 60 && !(dark && dark.kind === 'malicious' && lie.motive === 'pathological')) return null;
      if (trust > 30 && Math.random() < 0.5) return null; // warming up → sometimes honest
      return lie;
    },

    // lieScrubLine(line, truth, cover): replace the TRUTH occupation/origin
    // in a finished line with the cover story, the way a careful liar would.
    // Case-insensitive, whole-word(ish); tolerates a trailing plural.
    // (Steve 2026-10-06)
    lieScrubLine(line, truth, cover) {
      if (!line || !truth || !cover) return line;
      const esc = String(truth).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp('\\b' + esc + 's?\\b', 'gi');
      return String(line).replace(re, cover);
    },

    // scrubLiesFromLine(vid, line): run every finished talk line past all of
    // this person's UNCONFESSED occupation/origin lies, replacing the truth
    // with the cover. Baked lines carry {occ}/{origin} on ANY topic (goal
    // lines do: "I was {an_occ} in {origin}"), so the scrub can't be
    // topic-scoped — the round-2 personal-only scrub left siblings leaking
    // through 'goal' and every other topic. (Steve 2026-10-06)
    scrubLiesFromLine(vid, line) {
      if (!line) return line;
      try {
        const lies = this.npcLies(vid) || {};
        for (const f of ['occupation', 'origin']) {
          const lf = lies[f];
          if (lf && !lf.confessed && lf.truth && lf.told) line = this.lieScrubLine(line, lf.truth, lf.told);
        }
      } catch (e) {}
      return line;
    },

    // ---- claim tracking ----
    trackClaim(vid, field, claim) {
      const v = this.state.village;
      v.truthClaims = v.truthClaims || {};
      v.truthClaims[vid] = v.truthClaims[vid] || {};
      const arr = v.truthClaims[vid][field] = v.truthClaims[vid][field] || [];
      const last = arr[arr.length - 1];
      if (last && last.claim === claim) return; // same as before, no news
      // CONTRADICTION: they told you something different before.
      // THE AHA MOMENT: surface it dramatically in the moment.
      if (last && last.claim !== claim) {
        const first = this.firstRef(vid);
        // goal claims are raw ids — render the human phrase, never the id.
        const oldW = field === 'goal' ? this.goalWantText(last.claim) : last.claim;
        const nowW = field === 'goal' ? this.goalWantText(claim) : claim;
        const beats = field === 'goal'
          ? [`❓ Wait — ${first} said they wanted ${oldW} before. Now it's ${nowW}.`,
             `❓ That's not what ${first} said last time. Wanted ${oldW} then, ${nowW} now.`]
          : [`❓ Wait — ${first} told you "${oldW}" before. Now it's "${nowW}".`,
             `❓ That's not what ${first} said last time. "${oldW}" then, "${nowW}" now.`];
        try { this.say(beats[Math.floor(Math.random() * beats.length)]); } catch (e) {}
        this.addDoubt(vid, 'contradiction',
          this.doubtText(vid, 'contradiction', { field, old: last.claim, now: claim, oldDay: last.day }),
          [`said "${oldW}" (day ${last.day})`, `now says "${nowW}" (day ${day()})`]);
      }
      arr.push({ claim, day: day(), via: 'talk' });
      if (arr.length > 6) arr.shift();
    },

    getClaims(vid, field) {
      const tc = (this.state.village.truthClaims || {})[vid] || {};
      return tc[field] || [];
    },

    // ---- doubt system ----
    addDoubt(vid, kind, text, evidence, opts) {
      const cx = this.state.codex;
      cx.doubts = cx.doubts || [];
      opts = opts || {};
      // don't duplicate the same doubt
      if (cx.doubts.some(d => !d.resolved && d.vid === vid && d.kind === kind && d.text === text)) return null;
      // observation tells: one open doubt per (person, field). A second tell
      // about the same claimed background is mounting evidence for the SAME
      // doubt, not a new one — and evidence weight feeds the confrontation
      // odds (each piece beyond the first makes deflection harder).
      if (kind === 'observation' && opts.field) {
        const prior = cx.doubts.find(d => !d.resolved && d.vid === vid && d.kind === 'observation' && d.field === opts.field);
        if (prior) {
          for (const e of (evidence || [])) {
            if (!prior.evidence.some(x => String(x) === String(e))) prior.evidence.push(e);
          }
          return prior;
        }
      }
      const doubt = {
        id: 'd_' + Math.random().toString(36).slice(2, 9),
        vid, kind, text, evidence: evidence || [], day: day(), resolved: false,
      };
      if (opts.field) doubt.field = opts.field;
      cx.doubts.push(doubt);
      // surface in the journal as a ❓ note — visible in the current UI.
      // Honor opts.quiet: callers that already said the payload outright
      // (storage.js cache-theft gossip) pass quiet:true so the generic
      // "jotted down what they said" label doesn't double-post.
      try { this.journalLearn(vid, 'note', '❓ ' + text, { via: 'doubt', quiet: !!opts.quiet }); } catch (e) {}
      return doubt;
    },

    getDoubts(vid, includeResolved) {
      const doubts = (this.state.codex.doubts || []).filter(d => d.vid === vid);
      return includeResolved ? doubts : doubts.filter(d => !d.resolved);
    },

    allDoubts(includeResolved) {
      const doubts = this.state.codex.doubts || [];
      return includeResolved ? doubts : doubts.filter(d => !d.resolved);
    },

    resolveDoubt(doubtId, resolutionText) {
      const d = (this.state.codex.doubts || []).find(x => x.id === doubtId);
      if (!d) return;
      d.resolved = true;
      d.resolution = resolutionText;
      d.resolvedDay = day();
      try {
        const who = this.displayName(d.vid);
        this.say(sysUp()
          ? `✓ DOUBT RESOLVED — ${who}: ${resolutionText}`
          : `✓ You figured it out — ${who}: ${resolutionText}`);
      } catch (e) {}
    },

    doubtText(vid, kind, detail) {
      const name = this.displayName(vid);
      const first = this.firstRef(vid);
      const sys = sysUp();
      if (kind === 'contradiction') {
        const fieldWord = detail.field === 'occupation' ? 'what they did before'
          : detail.field === 'origin' ? 'where they\'re from' : 'what they want';
        // goal claims are stored as ids — render the human phrase in the journal
        const oldW = detail.field === 'goal' ? this.goalWantText(detail.old) : detail.old;
        const nowW = detail.field === 'goal' ? this.goalWantText(detail.now) : detail.now;
        if (sys) return `CONTRADICTION: ${name} claimed "${oldW}" then "${nowW}" re: ${fieldWord}. Deception probability: HIGH.`;
        const variants = [
          `${first} told you ${detail.field === 'occupation' ? 'they were' : detail.field === 'origin' ? 'they were from' : 'they wanted'} "${oldW}" — now it's "${nowW}". Something doesn't add up.`,
          `You wrote down "${oldW}". ${first} just said "${nowW}". Same question, different answer.`,
          `"${oldW}" — that's what ${first} said before. Now it's "${nowW}". People misremember. People also lie.`,
        ];
        return variants[Math.floor(Math.random() * variants.length)];
      }
      if (kind === 'gossip') {
        if (sys) return detail.claimed
          ? `CROSS-REFERENCE FLAG: third-party account conflicts with ${name}'s self-report.`
          : `INTEL: third-party account disputes ${name}'s background. Self-report not yet on file.`;
        if (!detail.claimed) {
          const w = detail.field === 'origin' ? `from ${detail.heard}`
            : `${/^[aeiou]/i.test(String(detail.heard)) ? 'an' : 'a'} ${detail.heard}`;
          return `${detail.source} says ${first} isn't really ${w} — or so the village talk goes. You haven't heard ${first}'s own story yet.`;
        }
        return `${first} said "${detail.claimed}" — but ${detail.source} says "${detail.heard}". One of them is wrong.`;
      }
      if (kind === 'observation') {
        if (sys) return `BEHAVIORAL ANOMALY: observed behavior inconsistent with ${name}'s claimed background.`;
        return detail.text;
      }
      if (kind === 'slip') {
        if (sys) return `VERBAL SLIP DETECTED: ${name} revealed information inconsistent with prior claims.`;
        return detail.text;
      }
      if (kind === 'behavior') {
        if (sys) return `GOAL/BEHAVIOR MISMATCH: ${name}'s actions diverge from stated objectives.`;
        return detail.text;
      }
      return `Something about ${first} doesn't add up.`;
    },

    // ---- observation ----
    // observePerson(vid): spend time watching. Costs ticks. May reveal that
    // behavior doesn't match the story. Observant minds are better at this.
    observePerson(vid) {
      const vp = this.vpOf(vid);
      if (!vp || !vp.id) return { ok: false };
      const name = this.displayName(vid);
      const first = this.firstRef(vid);
      // costs time — watching is work
      try { this.tickAction(2); } catch (e) {}

      const lies = this.npcLies(vid);
      const intel = this.npcIntel ? this.npcIntel(vid).primary : 'steady';
      let detectChance = 0.30;
      if (intel === 'observant') detectChance += 0.25;
      if (intel === 'social') detectChance += 0.15;
      if (intel === 'analytical') detectChance += 0.10;

      const lyingOcc = lies && lies.occupation && !lies.occupation.confessed;
      const lyingOrigin = lies && lies.origin && !lies.origin.confessed;

      if ((lyingOcc || lyingOrigin) && Math.random() < detectChance) {
        const field = lyingOcc ? 'occupation' : 'origin';
        const lie = lies[field];
        const tells = this.observationTell(vid, lie);
        this.addDoubt(vid, 'observation', this.doubtText(vid, 'observation', { text: tells }),
          [`claims "${lie.told}"`, `observed: ${tells}`], { field });
        try { this.remember(vid, 'observed', 'behavior didn\'t match their story'); } catch (e) {}
        return { ok: true, found: true, text: tells };
      }
      // honest observation — nothing wrong, which is itself information.
      // No-repeat pool: watching the same person on loop shouldn't recycle
      // the same three sentences.
      const line = this.drawTruthLine('observeCalm', vid);
      this.say(line);
      return { ok: true, found: false, text: line };
    },

    observationTell(vid, lie) {
      const first = this.nameFirst(vid);
      const told = lie.told;
      if (lie.field === 'occupation') {
        // {tellVerb} is what the CLAIMED trade's hands should know — generic
        // skill, never the true trade's name. The template never receives the
        // truth, so it can't leak it (knowledge gating, Steve 2026-10-06).
        return this.drawTruthLine('observeTellOcc', vid, {
          told, tellVerb: this.occTellVerb(told),
        });
      }
      if (lie.field === 'origin') {
        return this.drawTruthLine('observeTellOrigin', vid, { told });
      }
      return `Something ${first} does doesn't match something ${first} said.`;
    },

    occTellVerb(occ) {
      const o = String(occ || '').toLowerCase();
      if (o.includes('nurse') || o.includes('doctor') || o.includes('medic') || o.includes('emt')) return 'dress a wound';
      if (o.includes('cook') || o.includes('chef')) return 'handle a knife in the kitchen';
      if (o.includes('farm')) return 'work the soil';
      if (o.includes('mechanic') || o.includes('electrician')) return 'fix something mechanical';
      if (o.includes('hunt') || o.includes('fish')) return 'track an animal';
      if (o.includes('carpenter') || o.includes('build')) return 'work wood';
      return 'do the work they claim to know';
    },

    capFirst(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); },

    // nameFirst: a speakable subject for dialogue lines. displayName is
    // "A person, maybe 30s" pre-knowledge — splitting THAT gives "A"
    // ("Someone asked A about..."). firstRef gives the first name once
    // known, else the whoTag descriptor ("the woman in her 30s, the nurse").
    nameFirst(vid) {
      try {
        if (typeof this.firstRef === 'function') { const f = this.firstRef(vid); if (f) return f; }
      } catch (e) {}
      return String(this.displayName(vid));
    },

    // goalWantText(id): human-readable goal phrase for a goal id, e.g.
    // 'belong' → 'to belong somewhere'. Spoken lines must never use raw ids
    // ("I don't actually want belong" is broken English).
    goalWantText(id) {
      try {
        const g = (this.data.characterGen.goals || []).find(x => x.id === id);
        return g && g.want ? g.want : String(id);
      } catch (e) { return String(id); }
    },

    // ---- gossip cross-reference ----
    // When you hear gossip ABOUT someone, check it against their claims.
    checkGossipClaim(vid, field, heardValue, sourceVid) {
      const claims = this.getClaims(vid, field);
      const source = sourceVid ? this.displayName(sourceVid) : 'someone';
      const name = this.displayName(vid);
      const first = this.firstRef(vid);
      const w = field === 'origin' ? `from ${heardValue}`
        : `${/^[aeiou]/i.test(String(heardValue)) ? 'an' : 'a'} ${heardValue}`;
      if (!claims.length) {
        // LEAD WITHOUT A CLAIM (the gossip-first detective): the village told
        // you someone's story doesn't hold up before you ever heard their
        // version. Not a contradiction — a lead. But it's actionable: you can
        // go hear their story, then confront.
        const beats = [
          `❓ ${source} just told you something about ${first} — says they're not really ${w}. Worth remembering.`,
          `❓ Village talk: ${first} isn't really ${w}, according to ${source}. You haven't heard ${first}'s own story yet.`,
        ];
        try { this.say(beats[Math.floor(Math.random() * beats.length)]); } catch (e) {}
        this.addDoubt(vid, 'gossip',
          this.doubtText(vid, 'gossip', { heard: heardValue, source, field }),
          [`${source}: the truth is "${heardValue}"`, `you haven't heard ${first}'s own story yet`]);
        return;
      }
      const lastClaim = claims[claims.length - 1].claim;
      if (String(lastClaim).toLowerCase() === String(heardValue).toLowerCase()) return; // consistent
      // THE AHA MOMENT (Steve 2026-10-05): the player should FEEL the contradiction
      // in the moment, not discover it later in the journal. This is the detective's thrill.
      const beats = [
        `❓ Wait. ${first} told you "${lastClaim}". ${source} just said "${heardValue}". Those don't match.`,
        `❓ Hold on — "${lastClaim}"? That's what ${first} said. But ${source} says "${heardValue}".`,
        `❓ Something's off. You wrote down "${lastClaim}" for ${first}. ${source} just told you "${heardValue}".`,
      ];
      try { this.say(beats[Math.floor(Math.random() * beats.length)]); } catch (e) {}
      this.addDoubt(vid, 'gossip',
        this.doubtText(vid, 'gossip', { claimed: lastClaim, heard: heardValue, source }),
        [`${name} claimed "${lastClaim}"`, `${source} says "${heardValue}"`]);
    },

    // NPCs talk about each other. Sometimes what they say contradicts a claim.
    // Called when gossip is shared — gives NPCs a chance to reveal info.
    npcGossipAbout(tellerVid, targetVid) {
      const vp = this.vpOf(targetVid);
      if (!vp || !vp.id) return null;
      const lies = this.npcLies(targetVid);
      // what does the teller actually know? The truth, usually — villagers
      // talk. Liars get found out by their neighbors first.
      const tellerTrust = ((this.state.village.trust || {})[tellerVid]) || 10;
      if (tellerTrust < 15 && Math.random() < 0.5) return null; // barely know YOU — they clam up

      const options = [];
      // if you've already heard the target's story, you're asking a pointed
      // question — the teller is likelier to dish what they actually know.
      // (This is the detective's "ask around" working as advertised.)
      let heard = false;
      try {
        heard = (this.getClaims(targetVid, 'occupation') || []).length > 0 ||
          (this.getClaims(targetVid, 'origin') || []).length > 0;
      } catch (e) {}
      const lieP = heard ? 0.65 : 0.45;
      // truth about occupation (if target is lying, teller might know the truth)
      if (lies && lies.occupation && !lies.occupation.confessed && Math.random() < lieP) {
        options.push({ field: 'occupation', truth: lies.occupation.truth, lie: lies.occupation.told });
      }
      if (lies && lies.origin && !lies.origin.confessed && Math.random() < lieP) {
        options.push({ field: 'origin', truth: lies.origin.truth, lie: lies.origin.told });
      }
      // mundane true facts (not about lies — just village talk)
      if (!options.length && Math.random() < 0.25 && vp.formerOccupation) {
        options.push({ field: 'occupation', truth: vp.formerOccupation, lie: null });
      }
      if (!options.length) return null;
      const g = options[Math.floor(Math.random() * options.length)];
      const teller = this.displayName(tellerVid);
      const first = this.firstRef(targetVid);
      const an = (w) => /^[aeiou]/i.test(w) ? 'an' : 'a';
      // field-aware phrasing: "were a surgeon" vs "were from Denver"
      const lieWord = g.field === 'origin' ? `from ${g.lie}` : `${an(g.lie)} ${g.lie}`;
      const truthWord = g.field === 'origin' ? `from ${g.truth}` : `${an(g.truth)} ${g.truth}`;
      let line;
      if (g.lie) {
        // teller knows the truth and it contradicts the lie — but only frame
        // it as "they told YOU that" if you actually heard the claim. Otherwise
        // it's straight intel: the village polices its own lies.
        // Lines come from the per-game no-repeat pools — two villagers never
        // parrot the same line verbatim about one target.
        const heardClaim = this.getClaims(targetVid, g.field).length > 0;
        const truthCap = g.field === 'origin' ? `From ${g.truth}` : `${an(g.truth).replace(/^./, c => c.toUpperCase())} ${g.truth}`;
        line = this.drawTruthLine(heardClaim ? 'gossipHeard' : 'gossipIntel', tellerVid,
          { first, teller, lieWord, truthWord, truthCap });
      } else {
        line = `"${first}? ${an(g.truth).replace(/^./, c => c.toUpperCase())} ${g.truth}, back before. Solid person."`;
      }
      // cross-reference against what YOU were told (only when you heard a claim)
      if (g.lie) this.checkGossipClaim(targetVid, g.field, g.truth, tellerVid);
      return { line, target: targetVid, field: g.field, truth: g.truth, contradictsLie: !!g.lie };
    },

    // ---- confrontation ----
    // confrontDoubt(vid, doubtId): "You told me X, but [evidence]."
    // Personality-driven. Can resolve (truth) or deepen (better lies).
    confrontDoubt(vid, doubtId) {
      const doubt = (this.state.codex.doubts || []).find(d => d.id === doubtId);
      if (!doubt || doubt.resolved) return { ok: false, line: '"Never mind."' };
      const vp = this.vpOf(vid);
      const temp = this.npcTemper(vid);
      const dark = vp.personality && vp.personality.dark;
      const trust = ((this.state.village.trust || {})[vid]) || 10;
      const name = this.displayName(vid);
      const first = this.firstRef(vid);

      // find the lie behind this doubt
      const lies = this.npcLies(vid);
      let lie = null, lieField = null;
      if (lies) for (const [f, l] of Object.entries(lies)) {
        if (!l.confessed && doubt.evidence.some(e => String(e).includes(l.told))) { lie = l; lieField = f; break; }
      }
      // fallback: match by kind (live lies only — confessed ones are handled below)
      const liveLie = (f) => (lies && lies[f] && !lies[f].confessed) ? lies[f] : null;
      if (!lie && lies) {
        if (doubt.kind === 'contradiction' || doubt.kind === 'observation') {
          lie = liveLie('occupation') || liveLie('origin');
          lieField = lie ? lie.field : null;
        } else if (doubt.kind === 'gossip') {
          lie = liveLie('occupation') || liveLie('origin') || liveLie('goal');
          lieField = lie ? lie.field : null;
        }
      }

      const evText = doubt.evidence.length ? doubt.evidence.join('; ') : 'things you\'ve noticed';
      let line, outcome;

      // CACHE THEFT suspicion: the doubt carries the crime, not a lie about
      // backstory. The evidence IS the sighting. Handled on its own path —
      // a guilty thief must never resolve as "misunderstanding."
      if (doubt.theft) return this.confrontTheft(vid, doubtId);

      // The lie behind this doubt was already confessed: the doubt is stale.
      // They don't confess the same thing twice — they point that out.
      if (!lie && lies) {
        let stale = null;
        for (const [f, l] of Object.entries(lies)) {
          if (l.confessed && doubt.evidence.some(e => String(e).includes(l.told))) { stale = l; break; }
        }
        if (stale) {
          line = this.drawTruthLine('staleConfessed', vid);
          outcome = 'already-confessed';
          this.resolveDoubt(doubtId, 'stale doubt — the lie was already confessed');
          try { this.bumpTrust(vid, -1); } catch (e) {}
          return { ok: true, line, outcome };
        }
      }

      if (!lie) {
        // no lie behind this doubt — it was a misunderstanding. Honest clearing.
        line = this.drawTruthLine('clears', vid);
        outcome = 'cleared';
        this.resolveDoubt(doubtId, 'misunderstanding — they explained it');
        try { this.bumpTrust(vid, 3); } catch (e) {}
        return { ok: true, line, outcome };
      }

      // there IS a lie. How do they handle being caught?
      const motive = lie.motive;
      const roll = Math.random();

      // confess chance: honest/shame motive + decent trust → confession likely
      // malicious/pathological → almost never; they deflect or attack
      let confessP = 0.25;
      if (motive === 'shame') confessP = 0.65;
      else if (motive === 'hiding') confessP = 0.45;
      else if (motive === 'protection') confessP = 0.40;
      else if (motive === 'manipulation') confessP = 0.20;
      else if (motive === 'pathological') confessP = 0.08;
      confessP += (trust - 30) / 200; // trust helps
      if (temp === 'warm' || temp === 'gentle') confessP += 0.15;
      if (temp === 'prickly') confessP -= 0.15;
      // EVIDENCE WEIGHT (Steve 2026-10-05): mounting evidence makes deflection harder.
      // Each piece of evidence beyond the first adds +10%. Prior confrontations that
      // ended in deflection add +15% each — they know you're not dropping it.
      const evCount = (doubt.evidence || []).length;
      if (evCount > 1) confessP += Math.min(0.30, (evCount - 1) * 0.10);
      const priorDeflects = (doubt.evidence || []).filter(e => String(e).includes('deflected')).length;
      if (priorDeflects > 0) confessP += Math.min(0.30, priorDeflects * 0.15);
      // Multiple open doubts about the same person: the walls are closing in
      const otherDoubts = this.getDoubts(vid).filter(d => !d.resolved && d.id !== doubtId).length;
      if (otherDoubts > 0) confessP += Math.min(0.20, otherDoubts * 0.10);

      if (roll < confessP) {
        // CONFESSION
        lie.confessed = true;
        outcome = 'confessed';
        const truthWord = lieField === 'occupation' ? `I wasn't ${/^[aeiou]/i.test(lie.told) ? 'an' : 'a'} ${lie.told}. I was ${/^[aeiou]/i.test(lie.truth) ? 'an' : 'a'} ${lie.truth}`
          : lieField === 'origin' ? `I'm not from ${lie.told}. I'm from ${lie.truth}`
          : `I don't actually want ${this.goalWantText(lie.told)}. I want ${this.goalWantText(lie.truth)}`;
        const motiveLine = this.drawTruthLine(
          'motive' + motive.charAt(0).toUpperCase() + motive.slice(1), vid);
        // safety net: unknown motive → generic line
        const motiveSpeech = motiveLine || ` I don't know why I said it. It just came out.`;
        const reactions = {
          warm: `"Okay." ${first} looks down. "Okay, you got me. ${truthWord}.${motiveLine}" Their voice is small.`,
          gentle: `"Oh." A long pause. "${truthWord}.${motiveSpeech}" ${first} won't meet your eyes.`,
          prickly: `"Fine." Sharp. "You want the truth? ${truthWord}.${motiveSpeech} Happy now?"`,
          withdrawn: `A wall comes down, then — surprisingly — a door opens behind it. "${truthWord}.${motiveSpeech}" Quiet. Real.`,
          bold: `"Ha." Not amused. "${truthWord}.${motiveSpeech} There. You happy?"`,
        };
        line = reactions[temp] || `"${truthWord}.${motiveSpeech}"`;
        this.resolveDoubt(doubtId, `confessed: ${lie.truth} (was claiming ${lie.told})`);
        // correct the journal
        try {
          if (lieField === 'occupation') this.journalLearn(vid, 'occupation', lie.truth, { sure: true, via: 'confessed', quiet: true });
          if (lieField === 'origin') this.journalLearn(vid, 'backstory', `Admitted: from ${lie.truth} (said ${lie.told}).`, { via: 'confessed', quiet: true });
          if (lieField === 'goal') { const gdef = (this.data.characterGen.goals || []).find(g => g.id === lie.truth); if (gdef) this.journalLearn(vid, 'goal', { id: lie.truth, want: gdef.want }, { quiet: true }); }
        } catch (e) {}
        try { this.bumpTrust(vid, motive === 'pathological' ? -10 : 5); this.remember(vid, 'confession', 'told the truth when confronted'); } catch (e) {}
        // SOCIAL CONSEQUENCES (Steve 2026-10-05): the village learns. A caught liar's
        // reputation takes a hit — people talk. Manipulation/pathological hurts more.
        try {
          const v = this.state.village;
          v.gossip = v.gossip || [];
          const repHit = motive === 'manipulation' ? -6 : motive === 'pathological' ? -8 : -3;
          v.gossip.push({
            id: 'gossip_' + Math.random().toString(36).slice(2, 9),
            day: day(),
            dims: { who: vid, honest: repHit },
            text: `${name} admitted lying about ${lieField === 'occupation' ? 'what they did before' : lieField === 'origin' ? 'where they\'re from' : 'what they want'}. Said "${lieField === 'goal' ? this.goalWantText(lie.told) : lie.told}", actually "${lieField === 'goal' ? this.goalWantText(lie.truth) : lie.truth}".`,
            heard: [],
          });
          // Their reputation for honesty drops village-wide
          this.applyRep(vid, { honest: repHit }, 1);
        } catch (e) {}
      } else if (roll < confessP + 0.35) {
        // DEFLECTION — smooth or clumsy depending on who they are
        outcome = 'deflected';
        const smooth = dark && dark.kind === 'malicious';
        line = this.drawTruthLine(smooth ? 'deflectSmooth' : 'deflectClumsy', vid);
        doubt.evidence.push(`confronted (day ${day()}) — deflected${smooth ? ', smoothly' : ''}`);
        try { this.bumpTrust(vid, -3); this.remember(vid, 'deflected', 'dodged a confrontation'); } catch (e) {}
      } else {
        // COUNTER-ATTACK
        outcome = 'attacked';
        line = this.drawTruthLine('attacks', vid);
        doubt.evidence.push(`confronted (day ${day()}) — turned hostile`);
        try {
          this.bumpTrust(vid, -8);
          this.applyRep(vid, { honest: -4 }, 1);
          this.remember(vid, 'hostile', 'turned on you when questioned');
        } catch (e) {}
      }
      return { ok: true, line, outcome };
    },

    // confrontTheft(vid, doubtId): "I know you dug up my cache."
    // The doubt's theft marker names the crime; the sighting is real, so the
    // accused IS the robber. Temperament and trust decide confess / deflect /
    // hostile — mirroring the lie-confrontation odds, but a confession here
    // costs trust (honesty about stealing isn't the same as honesty).
    confrontTheft(vid, doubtId) {
      const doubt = (this.state.codex.doubts || []).find(d => d.id === doubtId);
      if (!doubt || doubt.resolved || !doubt.theft) return { ok: false, line: '"Never mind."' };
      const t = doubt.theft;
      const what = t.label || 'your buried food';
      const vp = this.vpOf(vid) || {};
      const temp = this.npcTemper(vid);
      const dark = (vp.personality || {}).dark;
      const trust = ((this.state.village.trust || {})[vid]) || 10;
      const first = this.nameFirst(vid);

      let confessP = 0.30;
      if (temp === 'warm' || temp === 'gentle') confessP += 0.20;
      if (temp === 'prickly' || temp === 'bold') confessP -= 0.10;
      if (dark && dark.kind === 'malicious') confessP = 0.05;
      confessP += (trust - 30) / 200;
      const roll = Math.random();
      let line, outcome;

      if (roll < confessP) {
        // CONFESSION — they did it, they say so. The food's gone (eaten days
        // ago); what you get is the truth, on the record, and the village
        // hears. Theft has a social price.
        outcome = 'confessed';
        line = this.drawTruthLine('theftConfess', vid, { first, what });
        if (!line) line = `"It was me. ${what} — I'm sorry."`;
        this.resolveDoubt(doubtId, `confessed: stole ${what} (day ${t.day})`);
        try {
          this.journalLearn(vid, 'note', `Admitted: stole ${what} — buried at ${t.place}, day ${t.day}.`, { via: 'confessed', quiet: true });
          this.bumpTrust(vid, -4);
          this.remember(vid, 'theft-confessed', `admitted stealing ${what}`);
        } catch (e) {}
      } else if (roll < confessP + 0.35) {
        // DEFLECTION — the doubt stays open; the evidence grows.
        outcome = 'deflected';
        const smooth = dark && dark.kind === 'malicious';
        line = this.drawTruthLine(smooth ? 'deflectSmooth' : 'deflectClumsy', vid);
        doubt.evidence.push(`confronted (day ${day()}) — deflected`);
        try { this.bumpTrust(vid, -3); this.remember(vid, 'deflected', 'dodged a theft accusation'); } catch (e) {}
      } else {
        // COUNTER-ATTACK
        outcome = 'attacked';
        line = this.drawTruthLine('attacks', vid);
        doubt.evidence.push(`confronted (day ${day()}) — turned hostile`);
        try {
          this.bumpTrust(vid, -8);
          this.applyRep(vid, { honest: -4 }, 1);
          this.remember(vid, 'hostile', 'turned on you when accused of theft');
        } catch (e) {}
      }
      return { ok: true, line, outcome };
    },
    truthSlip(vid, lie) {
      if (!lie || lie.confessed) return;
      const poolKey = lie.field === 'occupation' ? 'slipOccupation'
        : lie.field === 'origin' ? 'slipOrigin' : 'slipGoal';
      const isGoal = lie.field === 'goal';
      // goal claims are raw ids — render the human phrase, never the id
      // ("says they want belong" is broken English).
      const toldW = isGoal ? this.goalWantText(lie.told) : lie.told;
      const truthW = isGoal ? this.goalWantText(lie.truth) : lie.truth;
      const anTruth = /^[aeiou]/i.test(truthW) ? 'an' : 'a';
      const anTold = /^[aeiou]/i.test(toldW) ? 'an' : 'a';
      const text = this.drawTruthLine(poolKey, vid, {
        truth: truthW, told: toldW,
        atruth: isGoal ? truthW : anTruth + ' ' + truthW,
        atold: isGoal ? toldW : anTold + ' ' + toldW,
      });
      this.say(`👀 ${text}`);
      this.addDoubt(vid, 'slip', this.doubtText(vid, 'slip', { text }),
        [`claimed "${toldW}"`, `slipped: ${text.slice(0, 80)}...`]);
      try { this.remember(vid, 'slip', 'said something revealing'); } catch (e) {}
    },

    // ---- Codex UI ----
    doubtsHTML() {
      const doubts = this.allDoubts();
      if (!doubts.length) return '';
      const sys = sysUp();
      const cards = doubts.map(d => {
        const name = this.displayName(d.vid);
        const ev = (d.evidence || []).map(e => `<p class="small" style="opacity:.7">· ${e}</p>`).join('');
        const status = d.resolved
          ? `<p class="small" style="color:#8f8">✓ resolved: ${d.resolution || ''}</p>`
          : `<p class="small" style="color:#fd8}">❓ unresolved — confront them, watch them, or ask around</p>`;
        return `<div class="card codex"><h3>❓ ${name} <span class="small" style="opacity:.6">· ${d.kind}</span></h3>
          <p>${d.text}</p>${ev}${status}</div>`;
      }).join('');
      return `<h1 class="title" style="font-size:18px">${sys ? 'DOUBTS' : 'DOUBTS'}</h1>
        <p class="small"><i>${sys ? 'inconsistencies flagged by the Codex. the System notices everything.' : 'things that don\'t add up. your handwriting, getting less sure.'}</i></p>${cards}`;
    },
  };

  Object.assign(Game, methods);

  // ============ WRAPPERS ============

  // 0. fillTalkLine: THE choke point. Every baked villager line in the game
  // (openings, topic answers, "tell me more" beats, small talk, reactions)
  // fills {an_occ}/{occ}/{origin} here. Wrapping the entry points one by one
  // left siblings leaking — the pastdeep "tell me more" beat bypasses
  // convoAskTopic entirely. So the lie lives HERE: while an
  // occupation/origin/goal lie is unconfessed, the record fields read as the
  // COVER during the fill (correct "an"/"a" included), and the finished line
  // gets the scrub as a backstop. (Steve 2026-10-06)
  const origFillTalkLine = Game.fillTalkLine;
  if (origFillTalkLine) Game.fillTalkLine = function (line, v) {
    const vid = v && v.id;
    const lies = vid ? (this.npcLies(vid) || {}) : {};
    const swaps = [];
    try {
      for (const [f, key] of [['occupation', 'formerOccupation'], ['origin', 'homeRegion'], ['goal', 'goal']]) {
        const lf = lies[f];
        if (lf && !lf.confessed && v && v[key] && lf.told) { swaps.push([key, v[key]]); v[key] = lf.told; }
      }
    } catch (e) {}
    let out;
    try { out = origFillTalkLine.call(this, line, v); }
    finally { try { for (const [k, val] of swaps) v[k] = val; } catch (e) {} }
    try { return vid ? this.scrubLiesFromLine(vid, out) : out; }
    catch (e) { return out; }
  };

  // 0b. convoThreadBeat: the "tell me more" follow-up beats pick their pool
  // by the CURRENT goal (goalFollow[goal]) before fillTalkLine runs — a goal
  // liar would discuss their TRUE goal's follow-ups. The swap covers pool
  // selection; the fillTalkLine wrapper covers the fill. (Steve 2026-10-06)
  const origThreadBeat = Game.convoThreadBeat;
  if (origThreadBeat) Game.convoThreadBeat = function (vid) {
    const v = this.vpOf(vid);
    const lies = this.npcLies(vid) || {};
    const swaps = [];
    try {
      for (const [f, key] of [['occupation', 'formerOccupation'], ['origin', 'homeRegion'], ['goal', 'goal']]) {
        const lf = lies[f];
        if (lf && !lf.confessed && v && v[key] && lf.told) { swaps.push([key, v[key]]); v[key] = lf.told; }
      }
    } catch (e) {}
    try { return origThreadBeat.call(this, vid); }
    finally { try { for (const [k, val] of swaps) v[k] = val; } catch (e) {} }
  };

  // 1. convoAskTopic: substitute lies, track claims.
  // Temp-swap the truth with the lie so fillTalkLine AND journal.js's wrapper
  // both see the lie. The journal records what they TOLD you.
  const origAskTopic = Game.convoAskTopic;
  if (origAskTopic) Game.convoAskTopic = function (vid, topic) {
    const lie = this.getActiveLie(vid, topic);
    if (!lie) {
      const vp = this.vpOf(vid);
      const lies0 = this.npcLies(vid) || {};
      // temp-swap here too: the journal wrapper (inside origAskTopic)
      // records what they TOLD you — while a lie is live that's the cover,
      // on every topic, not just the lie's own topic.
      const swaps0 = [];
      try {
        for (const [f, key] of [['occupation', 'formerOccupation'], ['origin', 'homeRegion']]) {
          const lf = lies0[f];
          if (lf && !lf.confessed && vp && vp[key]) { swaps0.push([key, vp[key]]); vp[key] = lf.told; }
        }
      } catch (e) {}
      let raw;
      try { raw = origAskTopic.call(this, vid, topic); }
      finally { try { for (const [k, val] of swaps0) vp[k] = val; } catch (e) {} }
      // the line is scrubbed even on the "honest" branch: while a lie is
      // live, the cover is what they told you — the claim baseline must
      // match what the player heard, or a later contradiction beat would
      // name a truth the player never heard (knowledge leak).
      // GOSSIP EXEMPTION (detective playtest 2026-10-07): gossip lines are
      // ABOUT other villagers — the target's truth appears in them verbatim
      // (that IS the intel). Scrubbing the teller's cover over it corrupts
      // the evidence: a teller really from X gossips "they're from X" about
      // a target really from X, and the scrub rewrote X to the teller's
      // cover — the player heard the wrong intel while the journal doubt
      // recorded the right one. The speaker's own lines still scrub on
      // every other topic.
      const line = topic === 'gossip' ? raw : this.scrubLiesFromLine(vid, raw);
      // track truthful claims too (baseline for future contradictions)
      try {
        const occHeard = (lies0.occupation && !lies0.occupation.confessed) ? lies0.occupation.told : vp.formerOccupation;
        const orgHeard = (lies0.origin && !lies0.origin.confessed) ? lies0.origin.told : vp.homeRegion;
        if ((topic === 'past' || topic === 'personal') && vp.formerOccupation) this.trackClaimSilent(vid, 'occupation', occHeard);
        if ((topic === 'past' || topic === 'personal') && vp.homeRegion) this.trackClaimSilent(vid, 'origin', orgHeard);
        if (topic === 'goal') this.trackClaimSilent(vid, 'goal', this.npcGoal(vid));
      } catch (e) {}
      return line;
    }
    const vp = this.vpOf(vid);
    const swaps = [];
    if (lie.field === 'occupation' && (topic === 'past' || topic === 'personal') && vp.formerOccupation) {
      swaps.push(['formerOccupation', vp.formerOccupation]); vp.formerOccupation = lie.told;
    }
    if (lie.field === 'origin' && (topic === 'past' || topic === 'personal') && vp.homeRegion) {
      swaps.push(['homeRegion', vp.homeRegion]); vp.homeRegion = lie.told;
    }
    if (lie.field === 'goal' && topic === 'goal' && vp.goal) {
      swaps.push(['goal', vp.goal]); vp.goal = lie.told;
    }
    let line;
    try { line = origAskTopic.call(this, vid, topic); }
    finally { for (const [k, val] of swaps) vp[k] = val; }
    // SCRUB (Steve 2026-10-06, generalized round 3): baked talk lines carry
    // {occ}/{origin} on EVERY topic — 'personal' was just the first one
    // caught. The scrub runs against all live lies, every topic.
    line = this.scrubLiesFromLine(vid, line);
    // track the false claim (may trigger contradiction doubt)
    this.trackClaim(vid, lie.field, lie.told);
    // BAD LIARS SLIP IN CONVERSATION: non-pathological liars sometimes get
    // careless mid-answer — a wrong detail, a correction that's worse than
    // the slip. The better the liar, the rarer this is. This is how verbal
    // contradictions actually fire: not from perfect consistency, but from
    // imperfect people failing to maintain the story.
    const isPathological = lie.motive === 'pathological';
    const isManipulative = lie.motive === 'manipulation';
    let slipP = isPathological ? 0.02 : isManipulative ? 0.06 : 0.18;
    // stress makes liars worse: low trust, recent confrontation, fear
    try {
      const trust = ((this.state.village.trust || {})[vid]) || 10;
      if (trust < 20) slipP += 0.06;
      const mem = ((this.state.village.memory || {})[vid]) || [];
      if (mem.some(m => m.t === 'confronted' || m.t === 'deflected')) slipP += 0.08;
      if ((this.npcNeeds(vid).fear || 0) > 60) slipP += 0.06;
    } catch (e) {}
    if (Math.random() < slipP) {
      const first = this.nameFirst(vid);
      // the slip earns a crack, never the truth: naming the true trade here
      // ("something only a rancher would know") was the same narrator leak
      // as the old observeTellOcc lines (Steve 2026-10-06).
      const slips = [
        ' ...' + first + ' catches themself mid-sentence. "I mean \u2014 ' + lie.told + '. That\u2019s what I said." The correction lands wrong.',
        ' A detail doesn\u2019t fit. ' + first + ' said "' + lie.told + '" \u2014 but then mentions something no ' + lie.told + ' would ever say. They don\u2019t notice. You do.',
        ' "' + lie.told + '." ' + first + ' says it a little too firmly. Like they\u2019re convincing themself, not you.',
      ];
      const slipText = slips[Math.floor(Math.random() * slips.length)];
      line = line + slipText;
      // this IS a contradiction: they just undermined their own claim
      this.addDoubt(vid, 'slip',
        this.doubtText(vid, 'slip', { text: first + ' told you "' + lie.told + '" \u2014 but something they just said doesn\u2019t fit. A wrong detail, a bad correction.' }),
        ['claimed "' + lie.told + '"', 'slipped mid-conversation (day ' + day() + ')']);
      try { this.remember(vid, 'slip', 'said something revealing'); } catch (e) {}
      return line;
    }
    // liars sometimes over-explain — a tiny tell
    if (Math.random() < 0.12) {
      const tells = [' A beat too long on that answer.', ' They smile when they say it. It doesn\'t reach their eyes.'];
      return line + tells[Math.floor(Math.random() * tells.length)];
    }
    return line;
  };

  // trackClaimSilent: baseline without contradiction check (first claim can't contradict)
  Game.trackClaimSilent = function (vid, field, claim) {
    const v = this.state.village;
    v.truthClaims = v.truthClaims || {};
    v.truthClaims[vid] = v.truthClaims[vid] || {};
    const arr = v.truthClaims[vid][field] = v.truthClaims[vid][field] || [];
    const last = arr[arr.length - 1];
    if (!last || last.claim !== claim) arr.push({ claim, day: day(), via: 'talk' });
    if (arr.length > 6) arr.shift();
  };

  // 2. convoChoices: add confrontation when unresolved doubts exist.
  // Confrontation takes priority over topic asks — if you're doubting someone,
  // that's more urgent than small talk.
  const origChoices = Game.convoChoices;
  if (origChoices) Game.convoChoices = function (vid) {
    const choices = origChoices.call(this, vid);
    try {
      const c = this.convoGet(vid);
      // Confrontation needs shared words. You can't argue semantics
      // with someone via hand gestures — UNLESS a bilingual villager is
      // bridging (c.interpreter is set by the base nonverbal choices).
      // Then the confrontation goes through them, in translation.
      const nonverbal = c.thread === 'nonverbal';
      const bridged = nonverbal && !!c.interpreter;
      if (!c.pendingQ && (!nonverbal || bridged)) {
        const doubts = this.getDoubts(vid);
        if (doubts.length && !choices.some(ch => String(ch.id).indexOf('confront:') === 0)) {
          const d = doubts[0];
          const first = this.firstRef(vid);
          const via = bridged ? `(via ${this.firstRef(c.interpreter)}) ` : '';
          const label = bridged
            ? `${via}"Something about ${first} doesn't add up. Ask them — through you."`
            : d.kind === 'contradiction'
            ? `"You told me one thing, then another. What's going on?"`
            : d.kind === 'gossip'
            ? `"Someone told me something about you that doesn't match. Explain."`
            : `"I've been watching. Things don't add up. Talk to me."`;
          const item = { id: 'confront:' + d.id, label };
          // insert before 'leave'; if at cap, drop a topic ask to make room
          const leaveIdx = choices.findIndex(ch => ch.id === 'leave');
          const atIdx = leaveIdx >= 0 ? leaveIdx : choices.length;
          choices.splice(atIdx, 0, item);
          if (choices.length > 6) {
            const askIdx = choices.findIndex(ch => String(ch.id).indexOf('ask:') === 0);
            if (askIdx >= 0) choices.splice(askIdx, 1);
          }
        }
      }
    } catch (e) {}
    return choices;
  };

  // 3. convoTurn: handle confrontation choices.
  const origTurn = Game.convoTurn;
  if (origTurn) Game.convoTurn = function (vid, choiceId) {
    if (typeof choiceId === 'string' && choiceId.indexOf('confront:') === 0) {
      const doubtId = choiceId.slice('confront:'.length);
      const c = this.convoGet(vid);
      const r = this.confrontDoubt(vid, doubtId);
      const youSaid = '"I need to ask you something."';
      c.transcript.push({ who: 'you', text: youSaid });
      c.transcript.push({ who: 'them', text: r.line });
      while (c.transcript.length > 200) c.transcript.shift(); // HISTORY (Steve 2026-10-05): was 8 — destroyed conversation history and desynced the tap-advance. 200 keeps the whole conversation; memory is trivial.
      c.exchanges++;
      try { this.tickAction(1); } catch (e) {} // confrontation takes a moment
      this.sayLine(vid, r.line);
      if (r.outcome === 'attacked') { try { this.endConvo(vid, 'left'); return { line: r.line, choices: [], ended: true, transcript: c.transcript.slice() }; } catch (e) {} }
      return { line: r.line, choices: this.convoChoices(vid), ended: false, transcript: c.transcript.slice() };
    }
    return origTurn.call(this, vid, choiceId);
  };

  // 4. peopleJournal: inject doubts into each entry.
  // Also wrap journalPerson directly so doubts are available on direct calls.
  const origJP = Game.journalPerson;
  if (origJP) Game.journalPerson = function (vid) {
    const e = origJP.call(this, vid);
    try {
      e.doubts = this.getDoubts(vid, true);
      e.openDoubts = this.getDoubts(vid, false).length;
    } catch (err) {}
    return e;
  };
  const origPJ = Game.peopleJournal;
  if (origPJ) Game.peopleJournal = function () {
    const folks = origPJ.call(this);
    // journalPerson wrapper already injected doubts; this is a safety pass
    try {
      for (const f of folks) {
        if (!f.e.doubts) {
          f.e.doubts = this.getDoubts(f.vid, true);
          f.e.openDoubts = this.getDoubts(f.vid, false).length;
        }
      }
    } catch (e) {}
    return folks;
  };

  // 5. endDay: liars slip over time. Small chance per liar per day.
  const origEndDay = Game.endDay;
  if (origEndDay) Game.endDay = function () {
    const r = origEndDay.call(this);
    try {
      const roster = (this.state.village.roster || []).filter(id => id !== this.villagerId);
      for (const vid of roster) {
        const lies = this.npcLies(vid);
        if (!lies) continue;
        // VERBAL SLIPS need shared words. A slip is English speech you overheard
        // ("Hatsune told you X — but something they just said doesn't fit"). An NPC
        // you share no language with can't "tell" you anything; letting them slip
        // would both break the fiction and plant doubts you can never confront.
        // (Observation doubts can still form — behavior is visible in any tongue.)
        let noWords = false;
        try { noWords = this.commLevel(vid).level === 'none'; } catch (e) {}
        if (noWords) continue;
        for (const lie of Object.values(lies)) {
          if (lie.confessed) continue;
          // slips are rare but inevitable — lies decay. Bad liars decay faster.
          // (Pathological liars are good at this; everyone else leaks.)
          const slipRate = lie.motive === 'pathological' ? 0.05
            : lie.motive === 'manipulation' ? 0.10 : 0.17;
          if (Math.random() < slipRate) this.truthSlip(vid, lie);
        }
        // behavior observations: goal vs actions (ambient, more common now)
        if (Math.random() < 0.08) this.behaviorCheck(vid);
      }
    } catch (e) {}
    return r;
  };

  // 6. newGame: SOMEONE IS LYING. Every village gets at least one liar — the
  // detective loop dies in the ~5% of villages that roll zero liars at the
  // 0.20 base rate ("dead villages teach nothing" is why the rate was raised).
  // Runs after newGame so the roster and the player's pick are final: the
  // forced liar is never the player themself. Uses the normal genLies
  // machinery (motive/field logic) so the guaranteed liar is
  // indistinguishable from a rolled one.
  const origNewGame = Game.newGame;
  if (origNewGame) Game.newGame = function () {
    const r = origNewGame.apply(this, arguments);
    try {
      const v = this.state.village || {};
      const npcIds = (v.roster || []).filter(id => id !== this.villagerId);
      const isLiar = (id) => {
        const l = this.npcLies(id);
        return !!(l && Object.values(l).some(x => x && x.told));
      };
      if (npcIds.length && !npcIds.some(isLiar)) {
        const order = npcIds.slice().sort(() => Math.random() - 0.5);
        for (const id of order) {
          const vp = this.vpOf(id);
          if (!vp || !vp.id) continue;
          let guard = 0;
          while (guard++ < 12) {
            const lies = this.genLies(vp);
            vp.lies = lies;
            if (lies && Object.values(lies).some(x => x && x.told)) break;
          }
          const l = vp.lies || {};
          if (Object.values(l).some(x => x && x.told)) break;
        }
      }
    } catch (e) {}
    return r;
  };

  // behaviorCheck: does what they DO match what they SAY they want?
  Game.behaviorCheck = function (vid) {
    try {
      const claims = this.getClaims(vid, 'goal');
      if (!claims.length) return;
      const claimedGoal = claims[claims.length - 1].claim;
      const mem = ((this.state.village.memory || {})[vid]) || [];
      const recent = mem.slice(-5);
      // claimed 'belong' (community) but hoarding/stealing → mismatch
      if ((claimedGoal === 'belong' || claimedGoal === 'heal') &&
          recent.some(m => m.t === 'hoard' || m.t === 'stole' || m.t === 'betrayed')) {
        const first = this.nameFirst(vid);
        this.addDoubt(vid, 'behavior',
          this.doubtText(vid, 'behavior', { text: `${first} says they want ${claimedGoal === 'belong' ? 'to belong' : 'to help'} — but you've seen them take more than their share. Words and hands telling different stories.` }),
          [`claims goal: ${claimedGoal}`, 'observed: selfish behavior']);
      }
      // claimed 'survive' (lay low) but picking fights → mismatch
      if (claimedGoal === 'survive' && recent.some(m => m.t === 'fight' || m.t === 'confronted')) {
        const first = this.nameFirst(vid);
        this.addDoubt(vid, 'behavior',
          this.doubtText(vid, 'behavior', { text: `${first} says they just want to survive, keep their head down. But they keep picking fights. Survival isn't what they're after.` }),
          [`claims goal: ${claimedGoal}`, 'observed: aggressive behavior']);
      }
    } catch (e) {}
  };

  // 6. startConvo: generate lies on first meeting (so they're ready).
  const origStart = Game.startConvo;
  if (origStart) Game.startConvo = function (vid) {
    try { this.npcLies(vid); } catch (e) {}
    return origStart.call(this, vid);
  };

})();
