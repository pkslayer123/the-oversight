// @ontology
// system: truth
// description: Truth/distortion. Claim-gossip corrects (tellers share the truth); action-gossip distorts per retelling (code: game.js seedGossip).
// provides:
//   - trackClaim(vid, topic, claim)
//   - getClaims(vid)
//   - lieLive(vid, lie)
//   - makeLie(vid, topic)
//   - getActiveLie(vid)
//   - addDoubt(doubt)
//   - getDoubts()
//   - resolveDoubt(id)
//   - closeDoubtsForGone(vid, how)
//   - confrontDoubt(vid)
//   - plotBehindDoubt(doubt, vid)
//   - npcGossipAbout(vid)
//   - doubtIsLead(doubt)
// rules:
//   - claim_gossip_shares_truth_no_distortion: true (code: npcGossipAbout)
//   - min_liars_per_village: 1 (code: newGame wrapper)
//   - verbal_slips_require_shared_language: true (code: endDay slip loop)
//   - observation_doubt_one_per_field: true (code: addDoubt)
//   - gossip_intel_forms_lead_without_claim: true (code: checkGossipClaim)
//   - gossip_exempt_from_teller_lie_scrub: true (code: convoAskTopic wrapper)
//   - confront_via_interpreter_when_bridged: true (code: convoChoices wrapper)
//   - confront_doubt_vid_match: true (code: confrontDoubt, confrontTheft)
//   - accuser_pays: deflected/attacked/cleared dent the accuser's rep IN A READ SLOT (r12 2026-10-10: the hearers' view of the player — the old applyRep(player) wrote to the unread self-view slot, pure theater); attacked/cleared seed village gossip naming the accuser (player-subject gossip routes to hearers); being right (confessed) costs nothing (code: confrontDoubt, confrontTheft, accuserPays)
//   - refusal_cooldown: a counter-attack refuses ALL confrontation for 2 days (villager-level, not per-doubt) — no reopen-and-re-accuse grind, even via a second open doubt; doubts planted after the blowup day are new business (code: confrontDoubt, confrontTheft, convoChoices wrapper)
//   - doubts_ui_honest: the doubts UI promises only confrontation as the resolution path — watching/asking gather threads, never close — and names the language block for nonverbal targets (code: doubtsHTML)
//   - dead_cant_confess: gone (dead/exiled/removed) villagers refuse confrontation cleanly (code: confrontDoubt, confrontTheft)
//   - gone_closes_doubts: removing a villager resolves their open doubts as unanswered — the question outlives them, never a permanently open thread (code: closeDoubtsForGone, removeVillager hook)
//   - contradiction_dedupe_pair: a re-flipped claim pair doesn't plant a second open contradiction doubt; the aha beat still fires (code: trackClaim)
//   - lead_windup_tentative: gossip leads formed before hearing their story never claim a contradiction with "what you told me" (code: confrontWindup)
//   - confront_needs_convo: the confront: turn refuses cleanly with no active conversation (code: convoTurn wrapper)
//   - trust_earns_truth: trust > 60 makes non-pathological liars speak the truth — every speech path gates on lieLive (code: lieLive, fillTalkLine wrapper, convoAskTopic wrapper)
//   - tentative_clears_neutral: behavior doubts, gossip leads, and engine-witnessed event observations (eventBacked) resolve with no false-accusation cost (code: confrontDoubt)
//   - plot_backed_doubts: a doubt tagged caseId with a live (open/dormant) case and the vid still a real participant (accused, or exposed fabricating accuser) resolves as 'pressed' — the accusation stands, they hold their story, the case record keeps what was earned; no false-accuser machinery ever fires on a real plot (code: plotBehindDoubt, confrontDoubt)
//   - windup_owns_the_accusation: the tentative no-lie windup ("help me understand it") applies ONLY to tentative kinds (behavior, gossip lead); a real accusation that lands empty keeps its accusatory windup so the 'cleared' punishment narrates the scene that played (code: confrontWindup, r13 2026-10-10)
//   - lead_expiry: a gossip lead stops being tentative once the story is heard — doubtIsLead checks the story-heard stamp, not just the stale "haven't heard" marker (code: doubtIsLead, confrontWindup, confrontDoubt, convoChoices)
//   - slip_crack_only: slip lines name the cover's crack, never the truth — origin/goal slips match the occupation discipline (code: truthLinePools slipOrigin/slipGoal)
//   - stale_before_field_fallback: a confessed lie matching the doubt's evidence resolves as already-confessed before any fallback; the fallback matches the doubt's own field only, never a kind-guess (code: confrontDoubt)
//   - observe_wariness_bites: true (code: observePerson — 'observed' memories (14d, hit or miss) cut detectChance 0.08 each, floor 0.05; observer's own intellect drives the bonus, not the target's)
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
        // CRACK ONLY (detective break-it 2026-10-09c): these used to name
        // the TRUE origin outright ("mentions '{truth}' like it's home") —
        // handing the player a truth they hadn't earned, and short-circuiting
        // the confrontation that should extract it. Same discipline as the
        // occupation slips: the cover breaks, the truth stays hidden until
        // gossip, observation, or a confession earns it.
        `{first} was talking about home — then stopped mid-sentence, recalibrated, and said "{told}" just a fraction too deliberately. Whatever home is, it isn't where that sentence started.`,
        `{first} let a place-name slip — somewhere that isn't {told} — then covered it with "{told}" so fast the cover was louder than the slip.`,
        `Someone mentioned {told} and {first} answered to it a beat late — like responding to a name that isn't quite yours.`,
      ],
      slipGoal: [
        // same gating as origin: the wanting shows, the word for it doesn't.
        `{first} says they want {told}. But they keep doing the exact thing someone who wants something else would do — and going quiet when anyone notices.`,
        `{first} claims {told} — then spends the whole evening oriented around something they won't name. The wanting is real. The word for it isn't "{told}".`,
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
      // CONFRONTATION WINDUP (flesh-out loop 2026-10-08): the accusation
      // LANDING. Stage direction only — these never name the lie's truth
      // (knowledge gating: the crack is yours to state; the truth is
      // theirs to give). Per-game no-repeat like every other pool.
      accuseFace: [
        `Something crosses their face — quick, then gone. The practiced expression clicks back into place.`,
        `They go very still. Not relaxed-still. Held-still.`,
        `A flicker at the corner of their mouth. Not quite a smile. Not quite anything.`,
        `Their eyes do the math before their mouth does. You can see the calculation happening.`,
        `The easy manner evaporates. What's left is watching you back.`,
        `They glance toward the fire, toward the others — checking who's listening.`,
      ],
      // CODEX-GATED SOCIAL COACHING (flesh-out loop 2026-10-08): these only
      // fire when the ledger says the player has LIVED the pattern. Never
      // advice about something they haven't survived yet.
      coachDeflect: [
        `You've seen the smooth deflect before — it buys them time, not truth. Thin evidence gets deflected. Bring one more thread before you go again.`,
        `The deflect is a move you know now. It works when what you have is thin. Make it thick.`,
      ],
      coachAttack: [
        `You know the counter-attack now — the anger IS the tell. It means the accusation landed. Don't flinch.`,
        `Last time, they came at you for asking. That's not innocence talking. Hold your ground.`,
      ],
      coachConfess: [
        `You've pulled a confession before — they come when the evidence is heavy. One thread isn't a rope.`,
        `Confessions need weight behind them. What you have right now is a thread. Find the rope.`,
      ],
      // PRESSED (detective playtest 2026-10-10): the line for a plot-backed
      // confrontation — the accusation is real (a live case), they hold their
      // story, nobody was wrong to ask. Stonewalling, not innocence.
      pressed: [
        `They hold your gaze. Say nothing you don't already know. The silence is doing a lot of work.`,
        `A long look. "Is that what you think?" — and then nothing else. The case file says otherwise.`,
        `They don't flinch. Don't explain, either. Some accusations you don't get to walk back — and some you shouldn't.`,
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

    // lieLive(vid, lie): is this lie actually being TOLD right now?
    // TRUTH.md promises "High trust (>60) → truth, UNLESS pathological
    // (malicious psychos lie better when trusted)". getActiveLie knew this,
    // but every speech path (fillTalkLine, convoThreadBeat, convoAskTopic,
    // scrubLiesFromLine) swapped the cover in on trust alone — a trusted
    // liar kept lying forever and the promise was dead code (detective
    // break-it 2026-10-09b). All speech paths gate on this now.
    lieLive(vid, lie) {
      if (!lie || lie.confessed) return false;
      try {
        const trust = ((this.state.village.trust || {})[vid]) || 10;
        const dark = this.vpOf(vid).personality && this.vpOf(vid).personality.dark;
        if (trust > 60 && !(dark && dark.kind === 'malicious' && lie.motive === 'pathological')) return false;
      } catch (e) {}
      return true;
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
          // lieLive (detective break-it 2026-10-09b): scrubbing a truthful
          // line would REWRITE the truth into the cover — only scrub live lies.
          if (lf && this.lieLive(vid, lf) && lf.truth && lf.told) line = this.lieScrubLine(line, lf.truth, lf.told);
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
        // CONTRADICTION DEDUPE (detective break-it 2026-10-09e): a trust
        // oscillation (cover at trust 10 → truth at 65 → cover at 10)
        // re-flips the same pair. The aha beat above still fires — they
        // really did flip again — but the journal must not carry two ❓
        // notes for one flip-flop: the doubtText variants are random, so
        // addDoubt's text-keyed dedupe misses. An open contradiction doubt
        // covering the same (field, old↔now) pair is the same thread.
        const pairOpen = (this.state.codex.doubts || []).some(d =>
          !d.resolved && d.vid === vid && d.kind === 'contradiction' && d.field === field &&
          (d.evidence || []).some(e => String(e).includes(String(last.claim)) || String(e).includes(String(oldW))) &&
          (d.evidence || []).some(e => String(e).includes(String(claim)) || String(e).includes(String(nowW))));
        if (!pairOpen) {
          this.addDoubt(vid, 'contradiction',
            this.doubtText(vid, 'contradiction', { field, old: last.claim, now: claim, oldDay: last.day }),
            [`said "${oldW}" (day ${last.day})`, `now says "${nowW}" (day ${day()})`],
            { field });
        }
      }
      arr.push({ claim, day: day(), via: 'talk' });
      if (arr.length > 6) arr.shift();
      try { this.stampHeardStory(vid, claim); } catch (e) {}
    },

    // GOSSIP-FIRST LEAD FOLLOW-UP (detective feel 2026-10-08): a lead doubt
    // formed before you heard their story carries "you haven't heard X's
    // own story yet" in its evidence. Once a claim is on file, stamp the
    // evidence so the doubt reads as a timeline instead of going stale.
    stampHeardStory(vid, claim) {
      const first = this.firstRef(vid);
      for (const d of (this.state.codex.doubts || [])) {
        if (d.resolved || d.vid !== vid || d.kind !== 'gossip') continue;
        if (d.evidence.some(e => String(e).includes("haven't heard")) &&
            !d.evidence.some(e => String(e).includes('heard their own story'))) {
          d.evidence.push(`heard ${first}'s own story (day ${day()}) — "${claim}"`);
        }
      }
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
      // CASE-BACKED / EVENT-BACKED (detective playtest 2026-10-10): doubts
      // planted by engine-verified events (a real ambush case, a witnessed
      // bribe) carry their provenance. The lie system (npcLies) can't see
      // that provenance — without the tag, confrontDoubt treats them as
      // baseless and brands the player a false accuser for being right.
      if (opts.caseId) doubt.caseId = opts.caseId;
      if (opts.eventBacked) doubt.eventBacked = true;
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

    // closeDoubtsForGone(vid, how): a villager removed from the roster
    // (killed, exiled, fled, ambushed) leaves their open doubts with NO
    // resolution path — confrontDoubt's gone guard refuses forever, no convo
    // can exist, the journal's ❓ notes sit unresolved permanently
    // (detective break-it 2026-10-09e S1: a softlocked detective thread plus
    // a UI promise — "confront them, watch them, or ask around" — that can
    // never be kept). The honest close: resolve each open doubt as
    // UNANSWERED. The player did not figure it out; the question outlives
    // them. Called from removeVillager (betrayal.js), the one removal
    // choke point.
    closeDoubtsForGone(vid, how) {
      try {
        const open = this.getDoubts(vid).filter(d => !d.resolved);
        if (!open.length) return 0;
        const goneWord = (how === 'killed' || how === 'ambushed') ? 'dead' : 'gone';
        const name = this.displayName(vid);
        const dayN = (this.state.scholar || {}).day || 0;
        for (const d of open) {
          d.resolved = true;
          d.resolution = `${name} is ${goneWord} — the question goes unanswered`;
          d.resolvedDay = dayN;
          try { this.journalLearn(vid, 'note', `❓✕ ${d.text} — ${name} is ${goneWord}. Unanswered.`, { via: 'gone', quiet: true }); } catch (e) {}
        }
        // said once, honestly: not "you figured it out" — you didn't.
        const line = sysUp()
          ? `${name.toUpperCase()} — GONE. ${open.length} open question${open.length > 1 ? 's' : ''} closed unanswered.`
          : `${name} is ${goneWord}. ${open.length === 1 ? 'One question you never got to ask' : 'Questions you never got to ask'} — closed, unanswered.`;
        try { this.say(line); } catch (e) {}
        return open.length;
      } catch (e) { return 0; }
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

    // doubtIsLead(doubt): is this gossip doubt still a LEAD (tentative)?
    // A lead forms before the player's heard their story ("you haven't heard
    // X's own story yet"). Once stampHeardStory records the hearing, the
    // contradiction is earned — the stale "haven't heard" marker must not
    // keep the doubt tentative forever, or the windup stays soft and clears
    // stay neutral for earned contradictions (detective break-it 2026-10-09c).
    doubtIsLead(doubt) {
      const ev = (doubt && doubt.evidence) || [];
      const marked = ev.some(e => /haven't heard/.test(String(e)));
      const heard = ev.some(e => /own story \(day/.test(String(e)));
      return marked && !heard;
    },

    // ---- observation ----
    // observePerson(vid): spend time watching. Costs ticks. May reveal that
    // behavior doesn't match the story. Observant minds are better at this.
    observePerson(vid) {
      const vp = this.vpOf(vid);
      if (!vp || !vp.id) return { ok: false };
      // GONE GUARD (detective break-it 2026-10-09d): the fled/exiled/dead
      // can't be watched. Without this, observing a removed villager spent
      // 2 ticks and planted observation doubts that could never be
      // confronted — confrontDoubt's gone guard refuses them forever, so
      // the doubt sat open and unresolvable: a softlocked detective thread.
      try {
        if (!this.npcIds().includes(vid)) return { ok: false, line: '"They\'re gone."' };
      } catch (e) {}
      const name = this.displayName(vid);
      const first = this.firstRef(vid);
      // costs time — watching is work
      try { this.tickAction(2); } catch (e) {}

      const lies = this.npcLies(vid);
      // OBSERVER'S intellect (detective playtest 2026-10-08d): the one doing
      // the watching is the player — the old code read the TARGET's intellect,
      // so an observant mark was EASIER to read (+0.25), backwards from the
      // comment and the fiction (sharp people notice the staring).
      const intel = this.npcIntel ? this.npcIntel(this.villagerId).primary : 'steady';
      let detectChance = 0.30;
      if (intel === 'observant') detectChance += 0.25;
      if (intel === 'social') detectChance += 0.15;
      if (intel === 'analytical') detectChance += 0.10;
      // WARINESS BITES (detective playtest 2026-10-08d): people who know
      // they're being watched hide their tells. Count 'observed' memories
      // from the last 14 days (written on every watch now, hit or miss —
      // see below), capped like convoDrift wariness; each point shaves 0.08
      // off the detect chance, floor 0.05. A first look is 30%; the third
      // watch of the same person is 14% and they're reading guarded. Looping
      // one villager settles near ~10 watches per tell — the liar's-den
      // "watching is work" feel — instead of ~3. Watching is work again.
      // Counted fresh from memories, not the cached drift (drift recomputes
      // at most once per day — a same-day spam loop would never feel it).
      let watches = 0;
      try {
        const day = (this.state.scholar || {}).day || 1;
        const mem = ((this.state.village || {}).memory || {})[vid] || [];
        watches = Math.min(3, mem.filter(m => m.t === 'observed' && day - (m.day || 0) <= 14).length);
      } catch (e) {}
      detectChance = Math.max(0.05, detectChance - 0.08 * watches);
      // LIE DETECTOR (break-it abilities 2026-10-10): the ability's
      // modifier was a dead target (truth.detect_chance, read nowhere).
      // It now speaks social.lie_detect (same channel as the knowledge
      // map's lie_detect) and the engine reads it here, capped at 0.95.
      try { detectChance = Math.min(0.95, detectChance + this.modTarget('social.lie_detect', 0)); } catch (e) {}

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
      // being watched leaves a trace even when you learn nothing — they
      // notice the staring. Feeds the wariness penalty above, so the trace
      // is mechanical, not just flavor.
      try { this.remember(vid, 'observed', 'you watched them for a while; they noticed'); } catch (e) {}
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
          [`${source}: the truth is "${heardValue}"`, `you haven't heard ${first}'s own story yet`],
          { field });
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
        [`${name} claimed "${lastClaim}"`, `${source} says "${heardValue}"`],
        { field });
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
    // ---- confrontation phase beats (flesh-out loop 2026-10-08) ----
    // A confrontation is a three-beat scene: ACCUSATION (windup — you lay
    // out what you've gathered, they hear it land) → REACTION (the existing
    // confess/deflect/attack) → AFTERMATH (the existing trust/gossip
    // consequences). Before, the windup was one generic line and the scene
    // jumped straight to the verdict. The accusation never names the lie's
    // TRUTH — only what the player gathered (the cover they were told, the
    // evidence they saw). Knowledge gating: if you don't know it, you can't
    // say it.
    socialLedger() {
      const cx = this.state.codex;
      cx.socialLessons = cx.socialLessons || { confront: 0, confessed: 0, deflected: 0, attacked: 0, cleared: 0, pressed: 0 };
      return cx.socialLessons;
    },
    noteSocialLesson(outcome) {
      try {
        const L = this.socialLedger();
        L.confront = (L.confront || 0) + 1;
        if (outcome && L[outcome] !== undefined) L[outcome]++;
      } catch (e) {}
    },
    // truthRefusal(vid): villager-level confrontation refusal. A counter-attack
    // refuses ALL confrontation for 2 days — the old per-doubt stamp let a
    // second open doubt bypass the cooldown entirely (detective playtest
    // 2026-10-10: "we're done with that" → immediate re-accuse about something
    // else — the grief loop the refusal was built to stop). Stored as
    // {until, day}: doubts planted AFTER the blowup day (new evidence
    // surfacing later) are new business and stay actionable.
    truthRefusal(vid) {
      try {
        const r = ((this.state.village || {}).truthRefused || {})[vid];
        return r && r.until ? r : null;
      } catch (e) { return null; }
    },
    truthRefuse(vid) {
      try {
        const v = this.state.village;
        v.truthRefused = v.truthRefused || {};
        v.truthRefused[vid] = { until: day() + 2, day: day() };
      } catch (e) {}
    },
    // refusalBlocks(vid, doubt): the villager-level refusal covers every doubt
    // planted on or before the blowup day. Later-planted doubts are new business.
    refusalBlocks(vid, doubt) {
      const r = this.truthRefusal(vid);
      if (!r || !(r.until > day())) return false;
      if (!doubt) return true;
      return (doubt.day || 0) <= r.day;
    },
    // the richest piece of gathered evidence, spoken aloud — bookkeeping
    // entries ("confronted (day 3) — deflected") don't count.
    confrontEvidenceText(doubt) {
      const ev = (doubt.evidence || []).filter(e => !/confronted \(day/.test(String(e)));
      let best = String((doubt.text || '')).trim();
      for (const e of ev) if (String(e).length > best.length) best = String(e);
      // evidence entries carry bookkeeping prefixes ("observed: ...") — the
      // player speaks the fact, not the label.
      best = best.replace(/^(observed|gossip|slip|contradiction)\s*:\s*/i, '');
      best = best.charAt(0).toUpperCase() + best.slice(1);
      if (best.length > 200) best = best.slice(0, 197) + '...';
      return best;
    },
    confrontWindup(vid, doubt, lie) {
      const first = this.firstRef(vid);
      const ev = this.confrontEvidenceText(doubt);
      const kind = doubt.kind;
      // beat 1 — YOU speak. Per-kind opener + the gathered evidence.
      // The theft path names the sighting; the lie paths name the cover and
      // the crack — never the truth behind it.
      let spoken;
      // the cover claim is always fair game — they told it to you themselves
      // (goal ids render as the human phrase, never the id). For a gossip
      // LEAD they didn't tell it to you — village talk did — so the windup
      // attributes it to talk, not to their mouth (detective 2026-10-09c).
      const isLeadForClaim = this.doubtIsLead(doubt);
      const claimBit = (lie && lie.told)
        ? (lie.field === 'goal'
          ? (isLeadForClaim ? ` Word is you wanted ${this.goalWantText(lie.told)}.` : ` You said you wanted ${this.goalWantText(lie.told)}.`)
          : (isLeadForClaim ? ` Word is you were ${/^[aeiou]/i.test(String(lie.told)) ? 'an' : 'a'} ${lie.told}.` : ` You said you were ${/^[aeiou]/i.test(String(lie.told)) ? 'an' : 'a'} ${lie.told}.`))
        : '';
      if (doubt.theft) {
        const t = doubt.theft;
        const what = t.label || 'my buried food';
        const where = t.place ? ` at ${t.place}` : '';
        spoken = `"My cache${where} — ${what}. The dirt was fresh, dug up the same day. And the trail led here. It was you."`;
      } else if (kind === 'contradiction') {
        spoken = `"You told me one thing, then another.${claimBit} ${ev}"`;
      } else if (kind === 'gossip') {
        // LEAD vs CONTRADICTION (detective break-it 2026-10-09): a gossip
        // lead formed before you heard their story must not claim a mismatch
        // with "what you told me" — they told you nothing. Tentative until
        // the contradiction is earned. doubtIsLead (2026-10-09c) expires the
        // lead once the story is heard — the stale "haven't heard" marker
        // no longer keeps it tentative forever.
        const isLead = this.doubtIsLead(doubt);
        spoken = isLead
          ? `"Someone said something about you, ${first}.${claimBit} ${ev} — I wanted to hear your side."`
          : `"Someone told me something about you that doesn't match what you told me.${claimBit} ${ev}"`;
      } else if (kind === 'slip') {
        spoken = `"You let something slip.${claimBit} ${ev}"`;
      } else {
        spoken = `"I've been watching, ${first}.${claimBit} ${ev}"`;
      }
      // TENTATIVE no-lie doubts get the tentative version — the player is asking,
      // not accusing (behavior doubts, gossip leads: they clear neutrally, no
      // accusation was made). A REAL accusation that lands empty keeps its
      // accusatory windup: the 'cleared' aftermath ("you called X a liar, and
      // you were wrong") must narrate the scene that actually played. Speaking
      // a tentative question and then punishing a false accusation is the
      // engine contradicting itself (detective r13 2026-10-10).
      const tentativeAsk = !lie && !doubt.theft &&
        (doubt.kind === 'behavior' || this.doubtIsLead(doubt));
      if (tentativeAsk) spoken = `"Something's been bothering me, ${first}. ${ev} — help me understand it."`;
      // beat 2 — their face, as it lands.
      const face = this.drawTruthLine('accuseFace', vid);
      // beat 3 — codex-gated coaching: only patterns the player has LIVED.
      const L = this.socialLedger();
      const priorDeflect = (doubt.evidence || []).some(e => /deflected/.test(String(e)));
      let coach = null;
      if (priorDeflect) {
        coach = `They've deflected you before. The evidence needs to be heavier this time — one more thread before you speak.`;
      } else if ((L.deflected || 0) >= 2) {
        coach = this.drawTruthLine('coachDeflect', vid);
      } else if ((L.attacked || 0) >= 1) {
        coach = this.drawTruthLine('coachAttack', vid);
      } else if ((L.confessed || 0) >= 1 && (doubt.evidence || []).length <= 1) {
        coach = this.drawTruthLine('coachConfess', vid);
      }
      const beats = [{ who: 'you', text: spoken }];
      if (face) beats.push({ who: 'narr', text: face });
      if (coach) beats.push({ who: 'narr', text: `*${coach}*` });
      try { this.audioEvent('liarConfront', { phase: 'tension' }); } catch (e) {}
      // say them in player-voice / narrator-voice, and land them in the
      // active convo transcript so the scene reads whole on replay.
      let c = null;
      try { c = this.convoGet(vid); } catch (e) {}
      for (const b of beats) {
        this.say(b.text);
        if (c && c.active) {
          c.transcript.push({ who: b.who, text: b.text });
          while (c.transcript.length > 200) c.transcript.shift();
        }
      }
      return beats;
    },

    // accuserPays(vid, outcome): ACCUSATIONS STICK TO THE ACCUSER
    // (detective break-it 2026-10-09). The game says it itself ("Accusations
    // have a way of sticking to the accuser"), but confrontDoubt used to move
    // only the VICTIM's trust/standing — the player paid nothing for any
    // accusation, true or false, and could grind a villager's trust to zero
    // across repeated confrontations. Now: a dodge stains you a little, a
    // public blowup or a proven-baseless accusation stains you publicly —
    // village gossip names you, and your honest/competent rep takes the hit.
    // Being RIGHT (confessed) costs nothing. Design call, documented in
    // scripts/test-detective-breakit-20261009.js.
    // DETECTIVE r12 (2026-10-10): the old code wrote the cost with
    // applyRep(me, ...) — repOf(player) is the player's SELF-view slot, which
    // nothing reads, and the seeded gossip (dims.who = player) routed back
    // into the same dead slot. The whole mechanic was theater: the 2026-10-09
    // proof test validated the dead write. Now the cost lands on the HEARERS
    // — their view of YOUR honesty/competence drops — and the seeded gossip
    // travels to further listeners (spreadGossip routes player-subject gossip
    // to hearers). Deflections also used to be SILENT (no afterSay): "no
    // silent actions" — the stain is narrated now.
    accuserPays(vid, outcome) {
      const me = this.villagerId;
      const name = this.displayName(vid);
      let hearers = [];
      try { hearers = this.npcIds().filter(id => id !== vid).slice(0, 3); } catch (e) {}
      let afterSay = null;
      try {
        if (outcome === 'deflected') {
          for (const h of hearers) this.applyRep(h, { honest: -2 }, 1, true);
          afterSay = `Word gets around: you pressed ${name}, and ${name} slid off every question. Pressing people who dodge you stains you a little.`;
        } else if (outcome === 'attacked') {
          for (const h of hearers) this.applyRep(h, { honest: -3, competent: -3 }, 1, true);
          this.seedGossip('confrontation', { who: me, honest: -6, competent: -4 }, hearers);
          afterSay = `Word gets around the fire: you pushed ${name} hard, and ${name} pushed back. People file that away.`;
        } else if (outcome === 'cleared') {
          for (const h of hearers) this.applyRep(h, { honest: -5 }, 1, true);
          this.seedGossip('false_accusation', { who: me, honest: -8 }, hearers);
          afterSay = `Word gets around: you called ${name} a liar, and you were wrong. That sticks to you, not them.`;
        }
      } catch (e) {}
      return afterSay;
    },

    // plotBehindDoubt(doubt, vid): is this doubt backed by a REAL, still-live
    // betrayal case naming this villager? (detective playtest 2026-10-10.)
    // showWounds / pressAccomplice / approachWeakest / the exposed-fabricator
    // doubt plant engine-verified facts — a real ambush, real inconsistencies,
    // a real confession, a caught lie. The lie system (npcLies) can't see them,
    // but the accusation is not baseless. A dismissed/acquitted/resolved case
    // no longer backs anything: the village's verdict stands, and the standard
    // path applies.
    plotBehindDoubt(doubt, vid) {
      try {
        if (!doubt || !doubt.caseId || !this.getCase) return null;
        const c = this.getCase(doubt.caseId);
        if (!c || (c.status !== 'open' && c.status !== 'dormant')) return null;
        if ((c.accused || []).includes(vid)) return c;
        if (vid === c.accuser && c.accuserExposed) return c; // caught fabricating
        return null;
      } catch (e) { return null; }
    },

    // confrontDoubt(vid, doubtId): "You told me X, but [evidence]."
    // Personality-driven. Can resolve (truth) or deepen (better lies).
    confrontDoubt(vid, doubtId) {
      const doubt = (this.state.codex.doubts || []).find(d => d.id === doubtId);
      if (!doubt || doubt.resolved) return { ok: false, line: '"Never mind."' };
      // IDENTITY GUARD (detective playtest 2026-10-08): the doubt must belong
      // to the person being confronted. Without this, confronting A with B's
      // doubt punished A (-trust, hostile memories), resolved B's doubt
      // (softlocking B's detective thread — the legitimate call then returns
      // "Never mind." forever), and the theft path made an INNOCENT villager
      // confess to B's crime, on the record, in the journal.
      if (doubt.vid !== vid) return { ok: false, line: '"Never mind."' };
      // GONE GUARD (detective break-it 2026-10-09): the dead/exiled/removed
      // can't be confronted. Without this, a theft doubt outlived its robber
      // and the corpse "turned hostile" — on the record, in the journal.
      try {
        if (!this.npcIds().includes(vid)) return { ok: false, line: '"Never mind."' };
      } catch (e) {}
      // REFUSAL (detective break-it 2026-10-09, widened 2026-10-10): after a
      // counter-attack they won't entertain confrontation for 2 days —
      // villager-level now, not per-doubt: a second open doubt used to
      // bypass the cooldown entirely. Doubts planted after the blowup day
      // (new evidence) are new business — refusalBlocks lets those through.
      if ((doubt.refusedUntil && day() < doubt.refusedUntil) || this.refusalBlocks(vid, doubt)) {
        const first = this.firstRef(vid);
        return { ok: false, outcome: 'refused', line: `"Not this again." ${first} turns away. "We're done with that."` };
      }
      const vp = this.vpOf(vid);
      const temp = this.npcTemper(vid);
      const dark = vp && vp.personality && vp.personality.dark;
      const trust = ((this.state.village.trust || {})[vid]) || 10;
      const name = this.displayName(vid);
      const first = this.firstRef(vid);

      // find the lie behind this doubt
      const lies = this.npcLies(vid);
      let lie = null, lieField = null;
      if (lies) for (const [f, l] of Object.entries(lies)) {
        if (!l.confessed && doubt.evidence.some(e => String(e).includes(l.told))) { lie = l; lieField = f; break; }
      }

      let line, outcome;

      // CACHE THEFT suspicion: the doubt carries the crime, not a lie about
      // backstory. The evidence IS the sighting. Handled on its own path —
      // a guilty thief must never resolve as "misunderstanding."
      if (doubt.theft) return this.confrontTheft(vid, doubtId);

      // The lie behind this doubt was already confessed: the doubt is stale.
      // They don't confess the same thing twice — they point that out.
      // (Checked BEFORE the fallback: the old order let the by-kind guess
      // confess a DIFFERENT live lie under a stale doubt's banner —
      // detective break-it 2026-10-09c C4.)
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

      // fallback: the doubt's evidence names no live cover. For gossip leads
      // that's by design (you haven't heard their story yet) — match the
      // live lie on the doubt's own field, if any. Field-blind guessing is
      // gone: it confessed unrelated lies (detective break-it 2026-10-09c C4).
      if (!lie && lies && doubt.field) {
        const lf = lies[doubt.field];
        if (lf && !lf.confessed && lf.told) { lie = lf; lieField = doubt.field; }
      }

      if (!lie) {
        // PLOT-BACKED (detective playtest 2026-10-10): the doubt names a real,
        // still-live betrayal case. The old code fell through to 'cleared' +
        // accuserPays and branded the player a false accuser ("you called X
        // a liar, and you were wrong") for accusing an actual attempted
        // murderer — the engine lying about what happened (H1). The
        // accusation stands: they hold their story, the case record keeps
        // what the player earned, and no false-accuser machinery fires.
        // Ever. Being right about a plot is not a punishable offense.
        const plotCase = this.plotBehindDoubt(doubt, vid);
        if (plotCase) {
          this.confrontWindup(vid, doubt, null);
          line = this.drawTruthLine('pressed', vid) ||
            `"${first} holds your gaze. Says nothing you don't already know."`;
          outcome = 'pressed';
          this.resolveDoubt(doubtId, 'pressed them on it — they held their story; the case record holds what you know');
          this.noteSocialLesson('pressed');
          try { this.bumpTrust(vid, -2); this.remember(vid, 'pressed', 'you confronted them about the plot and they held'); } catch (e) {}
          return { ok: true, line, outcome };
        }
        // TENTATIVE CLEARS (detective break-it 2026-10-09b): behavior doubts
        // and gossip leads were never accusations — the windup says so
        // ("Something's been bothering me... help me understand it" /
        // "I wanted to hear your side"). Running accuserPays('cleared') on
        // them branded the player a false accuser (honest -5 + village
        // gossip "you called X a liar, and you were wrong") for asking an
        // honest question — the engine narrating an accusation that never
        // happened (H1-class copy lie). Tentative clears resolve neutrally:
        // no accuser cost, no wrongly_accused memory. (Supersedes the
        // 2026-10-09 H2 reading that a behavior-doubt clear was a punishable
        // "baseless accusation" — the observation was real.)
        // EVENT-BACKED (detective playtest 2026-10-10): same class — doubts
        // planted by engine-witnessed events (a waver mid-ambush, a bribe
        // trace, a refused bribe offer) allege no backstory lie; the player
        // asked about something real they saw. "They explained it" is the
        // honest close — never a false-accusation brand.
        // Real accusations (contradiction/slip/observation/gossip-with-claim
        // doubts with nothing behind them) still sting: that WAS an offense.
        const tentative = doubt.kind === 'behavior' || this.doubtIsLead(doubt) || !!doubt.eventBacked;
        this.confrontWindup(vid, doubt, null);
        line = this.drawTruthLine('clears', vid);
        outcome = 'cleared';
        this.resolveDoubt(doubtId, tentative ? 'talked it through — they explained it' : 'misunderstanding — they explained it');
        this.noteSocialLesson('cleared');
        if (tentative) return { ok: true, line, outcome };
        const clearedAfterSay = this.accuserPays(vid, outcome);
        try {
          this.bumpTrust(vid, -2);
          this.remember(vid, 'wrongly_accused', 'you called them a liar and were wrong');
        } catch (e) {}
        return { ok: true, line, outcome, afterSay: clearedAfterSay };
      }

      // there IS a lie. How do they handle being caught?
      // the windup speaks the accusation first — the reaction follows.
      this.confrontWindup(vid, doubt, lie);
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
          // BREAK-IT (social r7 2026-10-09): subject-targeted gossip moves REP
          // only, never trust (r6 canon) — the trust consequence of this
          // confrontation already moved through bumpTrust above. The old
          // call's drift skimmed -2 off the confession's trust.
          this.applyRep(vid, { honest: repHit }, 1, true);
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
        // REFUSAL (detective break-it 2026-10-09, widened 2026-10-10): they
        // walk away from confrontation for 2 days — villager-level, not
        // per-doubt (a second open doubt used to bypass it). Set here, read
        // by the guard at the top and by the convoChoices wrapper.
        doubt.refusedUntil = day() + 2;
        this.truthRefuse(vid);
        try {
          this.bumpTrust(vid, -8);
          // BREAK-IT (social r7 2026-10-09): rep only — the -8 trust already
          // moved above; the old drift double-charged the counter-attack.
          this.applyRep(vid, { honest: -4 }, 1, true);
          this.remember(vid, 'hostile', 'turned on you when questioned');
        } catch (e) {}
      }
      this.noteSocialLesson(outcome);
      try { this.audioEvent('liarConfront', { outcome }); } catch (e) {}
      const afterSay = this.accuserPays(vid, outcome);
      return { ok: true, line, outcome, afterSay };
    },

    // confrontTheft(vid, doubtId): "I know you dug up my cache."
    // The doubt's theft marker names the crime; the sighting is real, so the
    // accused IS the robber. Temperament and trust decide confess / deflect /
    // hostile — mirroring the lie-confrontation odds, but a confession here
    // costs trust (honesty about stealing isn't the same as honesty).
    confrontTheft(vid, doubtId) {
      const doubt = (this.state.codex.doubts || []).find(d => d.id === doubtId);
      if (!doubt || doubt.resolved || !doubt.theft) return { ok: false, line: '"Never mind."' };
      // IDENTITY GUARD (detective playtest 2026-10-08): see confrontDoubt.
      // The accused must be the doubt's subject — never a bystander.
      if (doubt.vid !== vid) return { ok: false, line: '"Never mind."' };
      // GONE GUARD + REFUSAL (detective break-it 2026-10-09, refusal widened
      // 2026-10-10 to villager-level): see confrontDoubt.
      try {
        if (!this.npcIds().includes(vid)) return { ok: false, line: '"Never mind."' };
      } catch (e) {}
      if ((doubt.refusedUntil && day() < doubt.refusedUntil) || this.refusalBlocks(vid, doubt)) {
        const first = this.firstRef(vid);
        return { ok: false, outcome: 'refused', line: `"Not this again." ${first} turns away. "We're done with that."` };
      }
      // the accusation lands first (windup owns the tension beat) — then the reaction.
      this.confrontWindup(vid, doubt, null);
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
        // REFUSAL (detective break-it 2026-10-09, widened 2026-10-10 to
        // villager-level): see confrontDoubt.
        doubt.refusedUntil = day() + 2;
        this.truthRefuse(vid);
        try {
          this.bumpTrust(vid, -8);
          // BREAK-IT (social r7 2026-10-09): rep only — the -8 trust already
          // moved above; the old drift double-charged the counter-attack.
          this.applyRep(vid, { honest: -4 }, 1, true);
          this.remember(vid, 'hostile', 'turned on you when accused of theft');
        } catch (e) {}
      }
      this.noteSocialLesson(outcome);
      try { this.audioEvent('liarConfront', { outcome }); } catch (e) {}
      const afterSay = this.accuserPays(vid, outcome);
      return { ok: true, line, outcome, afterSay };
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
        [`claimed "${toldW}"`, `slipped: ${text.slice(0, 80)}...`],
        { field: lie.field });
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
        // HONEST (detective playtest 2026-10-10): watching and asking around
        // only gather threads — they never close a doubt. The old copy
        // promised three resolution paths ("confront them, watch them, or ask
        // around"); the engine has one player path: confrontation. And when
        // shared words are the block, say so — the menu silently omits
        // confrontation for nonverbal+unbridged targets, which left a ❓ the
        // player could never act on without knowing why.
        let unresHint = 'only a confrontation closes this — watching and asking around may turn up more threads';
        try {
          if (this.commLevel(d.vid).level === 'none')
            unresHint = 'you share no words with them yet — confrontation needs language, or someone here who can bridge';
        } catch (e) {}
        const status = d.resolved
          ? `<p class="small" style="color:#8f8">✓ resolved: ${d.resolution || ''}</p>`
          : `<p class="small" style="color:#fd8}">❓ unresolved — ${unresHint}</p>`;
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
        // lieLive (detective break-it 2026-10-09b): a trusted non-pathological
        // liar speaks the truth now — the cover swap must honor the trust gate.
        if (lf && this.lieLive(vid, lf) && v && v[key] && lf.told) { swaps.push([key, v[key]]); v[key] = lf.told; }
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
        // lieLive (detective break-it 2026-10-09b): see fillTalkLine wrapper.
        if (lf && this.lieLive(vid, lf) && v && v[key] && lf.told) { swaps.push([key, v[key]]); v[key] = lf.told; }
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
          // lieLive (detective break-it 2026-10-09b): trusted non-pathological
          // liars speak the truth — no cover swap, and the baseline below
          // records what was actually heard.
          if (lf && this.lieLive(vid, lf) && vp && vp[key]) { swaps0.push([key, vp[key]]); vp[key] = lf.told; }
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
      // track truthful claims too (baseline for future contradictions).
      // CONTRADICTION SYMMETRY (detective break-it 2026-10-09d): these used
      // to go through trackClaimSilent, so the contradiction rule never ran
      // here. A liar heard at low trust (cover on file) who earns trust past
      // 60 speaks the truth — and the claim log held [cover, truth] with no
      // doubt and no aha beat, violating TRUTH.md's "Contradictions
      // (automatic): new claim != old claim on same topic -> doubt." The
      // reverse direction (truth first, cover later) already fired via the
      // lie branch's trackClaim. trackClaim is silent for first claims, so
      // the baseline behavior is unchanged — only real transitions fire.
      try {
        // lieLive (detective break-it 2026-10-09b): the claim baseline must
        // record what the player HEARD — the truth when the lie is dormant,
        // never a cover the player was never told.
        const occHeard = (lies0.occupation && this.lieLive(vid, lies0.occupation)) ? lies0.occupation.told : vp.formerOccupation;
        const orgHeard = (lies0.origin && this.lieLive(vid, lies0.origin)) ? lies0.origin.told : vp.homeRegion;
        if ((topic === 'past' || topic === 'personal') && vp.formerOccupation) this.trackClaim(vid, 'occupation', occHeard);
        if ((topic === 'past' || topic === 'personal') && vp.homeRegion) this.trackClaim(vid, 'origin', orgHeard);
        if (topic === 'goal') this.trackClaim(vid, 'goal', this.npcGoal(vid));
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
        ['claimed "' + lie.told + '"', 'slipped mid-conversation (day ' + day() + ')'],
        { field: lie.field });
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
    try { this.stampHeardStory(vid, claim); } catch (e) {}
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
        // REFUSAL (detective break-it 2026-10-09, widened 2026-10-10): doubts
        // in the post-counter-attack cooldown don't offer confrontation —
        // villager-level now: a second open doubt can't bypass it. Doubts
        // planted after the blowup day are new business (refusalBlocks).
        const nowDay = (this.state.scholar || {}).day || 0;
        const doubts = this.getDoubts(vid).filter(d =>
          !(d.refusedUntil && nowDay < d.refusedUntil) && !this.refusalBlocks(vid, d));
        if (doubts.length && !choices.some(ch => String(ch.id).indexOf('confront:') === 0)) {
          const d = doubts[0];
          const first = this.firstRef(vid);
          const via = bridged ? `(via ${this.firstRef(c.interpreter)}) ` : '';
          const label = bridged
            ? `${via}"Something about ${first} doesn't add up. Ask them — through you."`
            : d.kind === 'contradiction'
            ? `"You told me one thing, then another. What's going on?"`
            : d.kind === 'gossip'
            // a LEAD has no mismatch yet — the menu must not promise one
            // (detective break-it 2026-10-09c C2; the windup already knew).
            ? (this.doubtIsLead(d)
              ? `"Someone said something about you. I wanted to hear your side."`
              : `"Someone told me something about you that doesn't match. Explain."`)
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
      // CONFRONT-NEEDS-CONVO (detective break-it 2026-10-09): the choice only
      // exists inside an active conversation. Without this, the turn applied
      // the whole confrontation (doubt resolution, trust moves, transcript
      // writes) to an inactive convo object — effects with no scene.
      if (!c.active) return { line: '"Not now — go talk to them first."', choices: [], ended: true, transcript: [] };
      // SUBSTANCE (socialite r8 2026-10-09): this early return never
      // reaches convo-dialogue.js's choke-point wrapper. A confrontation
      // is substantive engagement — mark it here.
      try { this.convoMarkSubstantive(vid, choiceId); } catch (e) {}
      // UNSPOOKEN BEATS (socialite 2026-10-10): this early return also
      // skips the base turn handler's held-beat filter — run the shared
      // choke point or queued beats never die here either.
      try { if (typeof this.convoDropUnspoken === 'function') this.convoDropUnspoken(vid, choiceId); } catch (e) {}
      const r = this.confrontDoubt(vid, doubtId);
      const youSaid = '"I need to ask you something."';
      c.transcript.push({ who: 'you', text: youSaid });
      c.transcript.push({ who: 'them', text: r.line });
      while (c.transcript.length > 200) c.transcript.shift(); // HISTORY (Steve 2026-10-05): was 8 — destroyed conversation history and desynced the tap-advance. 200 keeps the whole conversation; memory is trivial.
      c.exchanges++;
      try { this.tickAction(1); } catch (e) {} // confrontation takes a moment
      this.sayLine(vid, r.line);
      // the village-hears-about-it beat lands AFTER their reaction, not before.
      if (r.afterSay) { try { this.say(r.afterSay); } catch (e) {} }
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
