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
      let p = 0.12; // base: most people don't lie about who they are
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
    getActiveLie(vid, topic) {
      const lies = this.npcLies(vid);
      if (!lies) return null;
      const field = topic === 'past' ? (lies.occupation ? 'occupation' : lies.origin ? 'origin' : null)
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

    // ---- claim tracking ----
    trackClaim(vid, field, claim) {
      const v = this.state.village;
      v.truthClaims = v.truthClaims || {};
      v.truthClaims[vid] = v.truthClaims[vid] || {};
      const arr = v.truthClaims[vid][field] = v.truthClaims[vid][field] || [];
      const last = arr[arr.length - 1];
      if (last && last.claim === claim) return; // same as before, no news
      // CONTRADICTION: they told you something different before
      if (last && last.claim !== claim) {
        this.addDoubt(vid, 'contradiction',
          this.doubtText(vid, 'contradiction', { field, old: last.claim, now: claim, oldDay: last.day }),
          [`said "${last.claim}" (day ${last.day})`, `now says "${claim}" (day ${day()})`]);
      }
      arr.push({ claim, day: day(), via: 'talk' });
      if (arr.length > 6) arr.shift();
    },

    getClaims(vid, field) {
      const tc = (this.state.village.truthClaims || {})[vid] || {};
      return tc[field] || [];
    },

    // ---- doubt system ----
    addDoubt(vid, kind, text, evidence) {
      const cx = this.state.codex;
      cx.doubts = cx.doubts || [];
      // don't duplicate the same doubt
      if (cx.doubts.some(d => !d.resolved && d.vid === vid && d.kind === kind && d.text === text)) return null;
      const doubt = {
        id: 'd_' + Math.random().toString(36).slice(2, 9),
        vid, kind, text, evidence: evidence || [], day: day(), resolved: false,
      };
      cx.doubts.push(doubt);
      // surface in the journal as a ❓ note — visible in the current UI
      try { this.journalLearn(vid, 'note', '❓ ' + text, { via: 'doubt', quiet: false }); } catch (e) {}
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
      const first = String(name).split(' ')[0];
      const sys = sysUp();
      if (kind === 'contradiction') {
        const fieldWord = detail.field === 'occupation' ? 'what they did before'
          : detail.field === 'origin' ? 'where they\'re from' : 'what they want';
        if (sys) return `CONTRADICTION: ${name} claimed "${detail.old}" then "${detail.now}" re: ${fieldWord}. Deception probability: HIGH.`;
        const variants = [
          `${first} told you ${detail.field === 'occupation' ? 'they were' : detail.field === 'origin' ? 'they were from' : 'they wanted'} "${detail.old}" — now it's "${detail.now}". Something doesn't add up.`,
          `You wrote down "${detail.old}". ${first} just said "${detail.now}". Same question, different answer.`,
          `"${detail.old}" — that's what ${first} said before. Now it's "${detail.now}". People misremember. People also lie.`,
        ];
        return variants[Math.floor(Math.random() * variants.length)];
      }
      if (kind === 'gossip') {
        if (sys) return `CROSS-REFERENCE FLAG: third-party account conflicts with ${name}'s self-report.`;
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
      const first = String(name).split(' ')[0];
      // costs time — watching is work
      try { this.tickAction(2); } catch (e) {}

      const lies = this.npcLies(vid);
      const intel = this.npcIntel ? this.npcIntel(vid).primary : 'steady';
      let detectChance = 0.25;
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
          [`claims "${lie.told}"`, `observed: ${tells}`]);
        try { this.remember(vid, 'observed', 'behavior didn\'t match their story'); } catch (e) {}
        return { ok: true, found: true, text: tells };
      }
      // honest observation — nothing wrong, which is itself information
      const calm = [
        `You watch ${first} for a while. They move like someone comfortable in their own story. Nothing feels off.`,
        `${first} doesn't know you're watching. What you see matches what they've told you.`,
        `An hour of watching ${first}. Either they're telling the truth, or they're very good.`,
      ];
      const line = calm[Math.floor(Math.random() * calm.length)];
      this.say(line);
      return { ok: true, found: false, text: line };
    },

    observationTell(vid, lie) {
      const vp = this.vpOf(vid);
      const first = String(this.displayName(vid)).split(' ')[0];
      const truth = lie.truth, told = lie.told;
      if (lie.field === 'occupation') {
        const tells = [
          `${first} claims to have been ${told === 'consultant' ? 'a consultant' : 'a ' + told}. But you watched them try to ${this.occTellVerb(truth)} — their hands didn't know the work. ${this.capFirst(truth)}s have stories in their hands. ${first}'s hands are blank.`,
          `Someone asked ${first} about ${told} work. The answer was smooth — too smooth, like reciting. Then later, doing something ${truth}s do without thinking, ${first} fumbled it completely.`,
          `${first} says "${told}". But their calluses, their posture, the way they hold a tool — that's not ${told} work. That's ${truth} work, or no work at all.`,
        ];
        return tells[Math.floor(Math.random() * tells.length)];
      }
      if (lie.field === 'origin') {
        const tells = [
          `${first} says they're from ${told}. But you heard them mention "${truth}" like it was home — then catch themselves.`,
          `${first} claims ${told}. Their accent slips sometimes. Not ${told}. Somewhere else.`,
        ];
        return tells[Math.floor(Math.random() * tells.length)];
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

    // ---- gossip cross-reference ----
    // When you hear gossip ABOUT someone, check it against their claims.
    checkGossipClaim(vid, field, heardValue, sourceVid) {
      const claims = this.getClaims(vid, field);
      if (!claims.length) return; // you don't know what they claimed yet
      const lastClaim = claims[claims.length - 1].claim;
      if (String(lastClaim).toLowerCase() === String(heardValue).toLowerCase()) return; // consistent
      const source = sourceVid ? this.displayName(sourceVid) : 'someone';
      this.addDoubt(vid, 'gossip',
        this.doubtText(vid, 'gossip', { claimed: lastClaim, heard: heardValue, source }),
        [`${this.displayName(vid)} claimed "${lastClaim}"`, `${source} says "${heardValue}"`]);
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
      if (tellerTrust < 25 && Math.random() < 0.6) return null; // don't know them well

      const options = [];
      // truth about occupation (if target is lying, teller might know the truth)
      if (lies && lies.occupation && !lies.occupation.confessed && Math.random() < 0.35) {
        options.push({ field: 'occupation', truth: lies.occupation.truth, lie: lies.occupation.told });
      }
      if (lies && lies.origin && !lies.origin.confessed && Math.random() < 0.30) {
        options.push({ field: 'origin', truth: lies.origin.truth, lie: lies.origin.told });
      }
      // mundane true facts (not about lies — just village talk)
      if (!options.length && Math.random() < 0.25 && vp.formerOccupation) {
        options.push({ field: 'occupation', truth: vp.formerOccupation, lie: null });
      }
      if (!options.length) return null;
      const g = options[Math.floor(Math.random() * options.length)];
      const teller = this.displayName(tellerVid);
      const target = this.displayName(targetVid);
      const first = String(target).split(' ')[0];
      let line;
      if (g.lie) {
        // teller knows the truth and it contradicts the lie
        const lines = [
          `"${first}? They told you they were ${/^[aeiou]/i.test(g.lie) ? 'an' : 'a'} ${g.lie}? Huh." ${teller} looks away. "${first} was ${/^[aeiou]/i.test(g.truth) ? 'an' : 'a'} ${g.truth}. Everyone knew."`,
          `"Don't repeat this, but ${first}'s story doesn't hold. ${/^[aeiou]/i.test(g.truth) ? 'An' : 'A'} ${g.truth}, back before. Not what they told you."`,
        ];
        line = lines[Math.floor(Math.random() * lines.length)];
      } else {
        line = `"${first}? ${/^[aeiou]/i.test(g.truth) ? 'An' : 'A'} ${g.truth}, back before. Solid person."`;
      }
      // cross-reference against what YOU were told
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
      const first = String(name).split(' ')[0];

      // find the lie behind this doubt
      const lies = this.npcLies(vid);
      let lie = null, lieField = null;
      if (lies) for (const [f, l] of Object.entries(lies)) {
        if (!l.confessed && doubt.evidence.some(e => String(e).includes(l.told))) { lie = l; lieField = f; break; }
      }
      // fallback: match by kind
      if (!lie && lies) {
        if (doubt.kind === 'contradiction' || doubt.kind === 'observation') {
          lie = lies.occupation || lies.origin || null;
          lieField = lie ? lie.field : null;
        } else if (doubt.kind === 'gossip') {
          lie = lies.occupation || lies.origin || lies.goal || null;
          lieField = lie ? lie.field : null;
        }
      }

      const evText = doubt.evidence.length ? doubt.evidence.join('; ') : 'things you\'ve noticed';
      let line, outcome;

      if (!lie) {
        // no lie behind this doubt — it was a misunderstanding. Honest clearing.
        const clears = [
          `"Oh — that? ${first} laughs, relieved. "No, no, you've got it wrong — let me explain..." And they do, and it makes sense, and you feel a little foolish for doubting them.`,
          `"Huh? Oh!" ${first} looks genuinely confused, then it clicks. "No — I see why you'd think that. Here's what actually happened..." The explanation holds together.`,
        ];
        line = clears[Math.floor(Math.random() * clears.length)];
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

      if (roll < confessP) {
        // CONFESSION
        lie.confessed = true;
        outcome = 'confessed';
        const truthWord = lieField === 'occupation' ? `I wasn't ${/^[aeiou]/i.test(lie.told) ? 'an' : 'a'} ${lie.told}. I was ${/^[aeiou]/i.test(lie.truth) ? 'an' : 'a'} ${lie.truth}`
          : lieField === 'origin' ? `I'm not from ${lie.told}. I'm from ${lie.truth}`
          : `I don't actually want ${lie.told}. I want ${lie.truth}`;
        const motiveLine = motive === 'shame' ? ' I was embarrassed. Everyone here was someone, and I was... that.'
          : motive === 'hiding' ? ' It\'s safer if people don\'t know. Please don\'t tell the others.'
          : motive === 'protection' ? ' I wasn\'t protecting myself. I was protecting someone else.'
          : motive === 'manipulation' ? ' I thought if you believed that, you\'d trust me faster. I\'m sorry. Or I\'m supposed to be.'
          : ' I don\'t know why I said it. It just came out. It always just comes out.';
        const reactions = {
          warm: `"Okay." ${first} looks down. "Okay, you got me. ${truthWord}.${motiveLine}" Their voice is small.`,
          gentle: `"Oh." A long pause. "${truthWord}.${motiveLine}" ${first} won't meet your eyes.`,
          prickly: `"Fine." Sharp. "You want the truth? ${truthWord}.${motiveLine} Happy now?"`,
          withdrawn: `A wall comes down, then — surprisingly — a door opens behind it. "${truthWord}.${motiveLine}" Quiet. Real.`,
          bold: `"Ha." Not amused. "${truthWord}.${motiveLine} There. You happy?"`,
        };
        line = reactions[temp] || `"${truthWord}.${motiveLine}"`;
        this.resolveDoubt(doubtId, `confessed: ${lie.truth} (was claiming ${lie.told})`);
        // correct the journal
        try {
          if (lieField === 'occupation') this.journalLearn(vid, 'occupation', lie.truth, { sure: true, via: 'confessed', quiet: true });
          if (lieField === 'goal') { const gdef = (this.data.characterGen.goals || []).find(g => g.id === lie.truth); if (gdef) this.journalLearn(vid, 'goal', { id: lie.truth, want: gdef.want }, { quiet: true }); }
        } catch (e) {}
        try { this.bumpTrust(vid, motive === 'pathological' ? -10 : 5); this.remember(vid, 'confession', 'told the truth when confronted'); } catch (e) {}
      } else if (roll < confessP + 0.35) {
        // DEFLECTION — smooth or clumsy depending on who they are
        outcome = 'deflected';
        const smooth = dark && dark.kind === 'malicious';
        const deflects = smooth ? [
          `"${first} smiles — unhurried. "You're imagining things. Stress does that out here." Smooth. Too smooth."`,
          `"Interesting theory." ${first} doesn't blink. "Why would I lie about that? Think about it." And somehow you're the one explaining yourself.`,
        ] : [
          `"What? No — I mean —" ${first} stumbles. "It's... it's complicated. Can we not do this right now?"`,
          `"You're wrong." Too fast. ${first} looks away. "Just... drop it, okay?"`,
        ];
        line = deflects[Math.floor(Math.random() * deflects.length)];
        doubt.evidence.push(`confronted (day ${day()}) — deflected${smooth ? ', smoothly' : ''}`);
        try { this.bumpTrust(vid, -3); this.remember(vid, 'deflected', 'dodged a confrontation'); } catch (e) {}
      } else {
        // COUNTER-ATTACK
        outcome = 'attacked';
        const attacks = [
          `"Why are you interrogating me?" ${first}'s voice goes cold. "We're all lying about something out here. You want to go first?"`,
          `"I don't have to explain myself to you." ${first} stands. "Ask around. See who trusts you after."`,
        ];
        line = attacks[Math.floor(Math.random() * attacks.length)];
        doubt.evidence.push(`confronted (day ${day()}) — turned hostile`);
        try {
          this.bumpTrust(vid, -8);
          this.applyRep(vid, { honest: -4 }, 1);
          this.remember(vid, 'hostile', 'turned on you when questioned');
        } catch (e) {}
      }
      return { ok: true, line, outcome };
    },

    // truthSlip(vid, lie): over days, details slip. Called from endDay.
    truthSlip(vid, lie) {
      if (!lie || lie.confessed) return;
      const first = String(this.displayName(vid)).split(' ')[0];
      const slips = {
        occupation: [
          `"${lie.told}, huh?" ${first} nods — then, an hour later, mentions something only ${/^[aeiou]/i.test(lie.truth) ? 'an' : 'a'} ${lie.truth} would know. They catch themselves. Too late.`,
          `${first} starts a story with "back when I was ${/^[aeiou]/i.test(lie.told) ? 'an' : 'a'} ${lie.told}..." then corrects to something else mid-sentence. The correction is worse than the slip.`,
        ],
        origin: [
          `${first} mentions "${lie.truth}" like it's home — then says "I mean, ${lie.told}." The pause is doing a lot of work.`,
        ],
        goal: [
          `${first} says they want ${lie.told}. But everything they DO points at ${lie.truth}.`,
        ],
      };
      const pool = slips[lie.field] || slips.occupation;
      const text = pool[Math.floor(Math.random() * pool.length)];
      this.say(`👀 ${text}`);
      this.addDoubt(vid, 'slip', this.doubtText(vid, 'slip', { text }),
        [`claimed "${lie.told}"`, `slipped: ${text.slice(0, 80)}...`]);
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

  // 1. convoAskTopic: substitute lies, track claims.
  // Temp-swap the truth with the lie so fillTalkLine AND journal.js's wrapper
  // both see the lie. The journal records what they TOLD you.
  const origAskTopic = Game.convoAskTopic;
  if (origAskTopic) Game.convoAskTopic = function (vid, topic) {
    const lie = this.getActiveLie(vid, topic);
    if (!lie) {
      const line = origAskTopic.call(this, vid, topic);
      // track truthful claims too (baseline for future contradictions)
      try {
        const vp = this.vpOf(vid);
        if (topic === 'past' && vp.formerOccupation) this.trackClaimSilent(vid, 'occupation', vp.formerOccupation);
        if (topic === 'past' && vp.homeRegion) this.trackClaimSilent(vid, 'origin', vp.homeRegion);
        if (topic === 'goal') this.trackClaimSilent(vid, 'goal', this.npcGoal(vid));
      } catch (e) {}
      return line;
    }
    const vp = this.vpOf(vid);
    const swaps = [];
    if (lie.field === 'occupation' && topic === 'past' && vp.formerOccupation) {
      swaps.push(['formerOccupation', vp.formerOccupation]); vp.formerOccupation = lie.told;
    }
    if (lie.field === 'origin' && topic === 'past' && vp.homeRegion) {
      swaps.push(['homeRegion', vp.homeRegion]); vp.homeRegion = lie.told;
    }
    if (lie.field === 'goal' && topic === 'goal' && vp.goal) {
      swaps.push(['goal', vp.goal]); vp.goal = lie.told;
    }
    let line;
    try { line = origAskTopic.call(this, vid, topic); }
    finally { for (const [k, val] of swaps) vp[k] = val; }
    // track the false claim (may trigger contradiction doubt)
    this.trackClaim(vid, lie.field, lie.told);
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
      if (!c.pendingQ) {
        const doubts = this.getDoubts(vid);
        if (doubts.length && !choices.some(ch => String(ch.id).indexOf('confront:') === 0)) {
          const d = doubts[0];
          const label = d.kind === 'contradiction'
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
      while (c.transcript.length > 8) c.transcript.shift();
      c.exchanges++;
      try { this.tickAction(2); } catch (e) {} // confrontation takes time
      this.say(`${this.displayName(vid)}: "${r.line}"`);
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
        for (const lie of Object.values(lies)) {
          if (lie.confessed) continue;
          // slips are rare but inevitable — lies decay
          if (Math.random() < 0.06) this.truthSlip(vid, lie);
        }
        // behavior observations: goal vs actions (rare, ambient)
        if (Math.random() < 0.04) this.behaviorCheck(vid);
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
        const first = String(this.displayName(vid)).split(' ')[0];
        this.addDoubt(vid, 'behavior',
          this.doubtText(vid, 'behavior', { text: `${first} says they want ${claimedGoal === 'belong' ? 'to belong' : 'to help'} — but you've seen them take more than their share. Words and hands telling different stories.` }),
          [`claims goal: ${claimedGoal}`, 'observed: selfish behavior']);
      }
      // claimed 'survive' (lay low) but picking fights → mismatch
      if (claimedGoal === 'survive' && recent.some(m => m.t === 'fight' || m.t === 'confronted')) {
        const first = String(this.displayName(vid)).split(' ')[0];
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
