// @ontology
// system: care-explore
// description: Care and exploration decisions. Care was a vending machine — now it requires real choices: comfort has 11 approaches with honest consequences, food gifts carry social weight and can be stolen from the commons, and examination gates feature depth on knowledge.
// provides:
//   - giveFood(vid, amount, opts)
//   - comfort(vid, approach)
//   - giveFoodOptions()
//   - giveFoodSourceOptions()
//   - comfortOptions(vid)
//   - examineCell(cx, cy)
//   - tileFeature(nx, ny, cx, cy, cell)
//   - lingerCell(cx, cy)
//   - followTracks(cx, cy)
//   - markForLater(cx, cy, note)
//   - fieldMarksList()
// rules:
//   - comfort approaches have real tradeoffs: guard/ritual/listen cost 2 ticks, guard costs 12 energy, tough/distract can backfire and lower trust (code: carexplore.js Game.comfort)
//   - failed comfort in public is witnessed and remembered by onlookers (code: carexplore.js Game.comfort social signal)
//   - giveFood amounts carry social meaning: scraps can insult the proud, best is remembered, public gifts breed resentment in the unfed hungry (code: carexplore.js Game.giveFood)
//   - stealing from the commons to give food is allowed and socially punished: public theft costs trust with witnesses and records a crime (code: carexplore.js Game.giveFood steal)
//   - hidden tile features reveal depth by knowledge skill level; ignorant scholars get honest hints, never silence (code: carexplore.js featureText)
//   - examine/linger/follow-tracks/mark name their time and energy costs; blind actions stay honest, never disabled (code: carexplore.js Game.lingerCell Game.followTracks Game.markForLater)
// consumes:
//   - scholar.energy
//   - village.needs
//   - village.commons
//   - codex.skills
//   - codex.fieldMarks
// ============ CARE & EXPLORE ============
// Steve: "Back to decisions." Care was a vending machine — one click, no
// texture. Now giving food and comforting are DECISIONS with tradeoffs.
//
// And the exploration verb: a dedicated EXAMINE action for deep inspection.
// Perception tells you "a mature oak" because you're there. Examining tells
// you the bark is scarred on the north side and something large rubbed
// against it. Every examination is a small story.
//
// Self-attaching module: overrides Game.giveFood / Game.comfort with
// decision-based versions, adds Game.examineCell. No game.js edits.
// Load order: after game.js, conversation.js, storage.js. Before app.js.
//
// DESIGN — CARE AS DECISIONS:
//
// GIVE FOOD: how much? The world decides public/private (witnesses).
//   - scraps (1 unit, the dregs): cheap for you — the proud may take it as
//     an insult. To the starving it's still food.
//   - a bite (1 unit): small. If they're starving, it can insult.
//   - a meal (3 units): solid. The honest default.
//   - your finest (1 unit, best stack): the highest cost to you, the
//     deepest gratitude. They'll remember what you gave up.
//   - until full: real cost, real gratitude.
//   - SOURCE: your pack (honest) or skim the commons pot (theft). Theft is
//     allowed — and socially punished. Seen = the village punishes you.
//     Unseen = the recipient knows what you are.
//   - PUBLIC (witnesses): reputation moves. Generosity is visible — and
//     creates expectation. Others will ask. And the hungry who watched
//     someone else get fed will REMEMBER being passed over.
//   - PRIVATE (alone): deeper trust, no reputation. But secrets have weight.
//
// COMFORT: what do you SAY? Personality matching matters. Every approach
// names its cost — time, energy, or risk. Comfort that fails has honest
// consequences, not silent ones.
//   - sit in silence: always safe, small. (1 tick)
//   - reassure: needs trust, or it rings hollow. (1 tick)
//   - be practical: lands for practical minds, cold otherwise. (1 tick)
//   - share your own fear: vulnerable. Deep if it lands, awkward if not. (1 tick)
//   - give them space: respecting boundaries IS care. (1 tick)
//   - distract: cheap redirection. Lands for light temperaments (warm,
//     gentle, bold, restless); flat for others; callous in real grief —
//     and a wrong read is remembered. (1 tick)
//   - keep watch: the oldest comfort. Costs your time AND your energy. An
//     exhausted guard is a liability, not a comfort. (2 ticks, 12 energy)
//   - hard truth: "we don't have time for this." Snaps them out of it IF
//     you've earned the right — otherwise it's cruelty, witnessed. (1 tick)
//   - small ritual: breathing together, naming the lost. For grief, this is
//     the real medicine. (2 ticks)
//   - listen: "tell me." Opens them up if they trust you; prying at a closed
//     door teaches them to lock it. Teaches you about people. (2 ticks)
//   - warm food: the oldest medicine. Costs real food from your pack. (1 tick + 1 food)
//   - grieving ≠ scared: reassurance misses grief; practicality misses sorrow.
//   - harshness witnessed is reputation too: fail in public and onlookers
//     remember what they saw.
//
// DESIGN — EXAMINE:
//   - 2 ticks, time-only. Adjacent cells only.
//   - Depth: first examine = surface. Repeat (or observant) = deeper.
//   - KNOWLEDGE DEPTH: hidden features reveal by skill level (featureText).
//     An ignorant scholar sees honest hints — "if you don't know, it doesn't
//     show" — but blind actions are never disabled, never silent.
//   - Feeds knowledge: track_read, track_human, old_world_cache,
//     system_theology. 4 encounters = learnSkill (existing pattern).
//   - The world hides things: tracks, old camps, strange growths, remnants,
//     hollows. Deterministic per tile (seeded hash) so they're consistent.
//   - Discoveries: examining can FIND things — caches, story beats.
//
// DESIGN — EXPLORE BEATS (the linger/move-on decision):
//   - linger: a careful second look (2 ticks). Surfaces a hidden feature you
//     walked past. Honest when there's nothing: "nothing but what you saw."
//   - follow tracks: requires found, readable tracks. (2 ticks, 5 energy).
//     The trail can go cold (honest), lead to a find, or arrive somewhere
//     that teaches you who runs this ground.
//   - mark for later: fix a spot in memory (1 tick). Some places deserve a
//     second visit. fieldMarksList() reads them back.

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;

  // ---- deterministic hash for tile features ----
  // FNV-1a: the old polynomial hash (h*31+c) differed by exactly the last
  // digit between vertically adjacent cells, so h%100 for a whole column sat
  // in a 7-wide window — features striped vertically (3 tracks cells in a
  // column, a line of oldcamps). FNV avalanches; neighbors decorrelate.
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // ---- helpers ----
  function edibleStacks() {
    const day = Game.state.scholar.day;
    return (Game.state.scholar.inventory || []).filter(i =>
      (i.kcalEach || 0) > 0 && (i.units || 0) > 0 && !i.bonded &&
      !(i.spillDay !== undefined && i.spillDay <= day) &&
      !(i.spoilDay !== undefined && i.spoilDay <= day));
  }
  function npcTemper(vid) {
    try { return Game.npcTemper ? Game.npcTemper(vid) : 'steady'; }
    catch (e) { return 'steady'; }
  }
  function npcIntelPrimary(vid) {
    try { return (Game.npcIntel(vid) || {}).primary || 'steady'; }
    catch (e) { return 'steady'; }
  }
  function trustOf(vid) {
    return ((Game.state.village.trust || {})[vid]) || 10;
  }
  function setTrust(vid, v) {
    const t = Game.state.village.trust || (Game.state.village.trust = {});
    t[vid] = Math.max(0, Math.min(100, Math.round(v)));
  }
  function isPublic(vid) {
    // PUBLIC = someone else can see. Witnesses within 3 = there.
    try {
      const wit = Game.witnesses(3) || [];
      return wit.some(id => id !== vid && id !== Game.villagerId);
    } catch (e) { return false; }
  }

  // ---- knowledge-depth machinery (Steve 2026-10-07) ----
  // Every hidden feature has a governing knowledge skill. The reveal is
  // sight-gated: level 0 = honest hints ("if you don't know, it doesn't
  // show"), level 1 = what it is, level 2+ = inference — what it MEANS.
  // Blind is never disabled, never silent. Just honest about its limits.
  const FEATURE_SKILL = {
    tracks: 'track_read', banktracks: 'track_read', hollow: 'track_read',
    oldcamp: 'track_human', strange: 'system_theology', remnant: 'old_world_cache',
  };
  function skillLevel(id) {
    const sk = ((Game.state || {}).codex || {}).skills || {};
    return ((sk[id] || {}).level) || 0;
  }
  function featureKnowledge(feature) {
    // [skillId, encounters] fed when a feature is revealed
    if (feature === 'tracks') return [['track_read', 2]];
    if (feature === 'banktracks') return [['track_read', 2], ['nocturnal_patterns', 1]];
    if (feature === 'oldcamp') return [['track_human', 2]];
    if (feature === 'strange') return [['system_theology', 2]];
    if (feature === 'remnant') return [['old_world_cache', 2]];
    if (feature === 'hollow') return [['track_read', 1]];
    return [];
  }
  // knowledge feeding — examining teaches. 4 encounters = learnSkill (the
  // existing codex pattern). Module-level so examineCell, lingerCell and
  // followTracks all feed the same way.
  function feedExamKnowledge(skillId, amt) {
    Game.state.codex.encounters = Game.state.codex.encounters || {};
    const cur = (Game.state.codex.skills || {})[skillId];
    if (cur && (cur.level || 0) >= 1) return;
    Game.state.codex.encounters[skillId] = (Game.state.codex.encounters[skillId] || 0) + amt;
    const enc = Game.state.codex.encounters[skillId];
    if (enc >= 4 && Game.learnSkill) {
      Game.learnSkill(skillId, 1, 'examining');
    } else if (enc >= 2) {
      const k = (Game.data.knowledge || []).find(x => x.id === skillId);
      if (k) Game.say(`(Studying this teaches you. ${k.name}: ${enc}/4)`);
    }
  }
  // featureText: the sight-gated reveal. Called AFTER feeding knowledge, so
  // studying something can teach you mid-examination — you figure it out
  // WHILE looking, which is exactly how learning works.
  function featureText(feature, key) {
    const lvl = skillLevel(FEATURE_SKILL[feature] || 'track_read');
    if (feature === 'tracks') {
      if (lvl < 1) return `The ground here is disturbed — something passed through. That's all you can honestly say. Your eyes aren't trained for this yet. (Studying tracks teaches track_read.)`;
      const kinds = [
        `Three toes, deep impression, heading north. Something heavy, moving with purpose. The stride is long — it wasn't hurrying, it just covers ground.`,
        `Small paired prints, bounding. Rabbit — or something that wants you to think rabbit. You note the claw marks. Rabbits don't leave those.`,
        `A drag mark through the grass, and beside it, prints too light to be the thing doing the dragging. Something was carried. Something that didn't want to go.`,
      ];
      let t = `You crouch. The ground here has a story. ${kinds[hashStr(key) % kinds.length]}`;
      if (lvl >= 2) t += ` Heavy, unhurried — whatever made these wasn't hunting. It was commuting. You file that away.`;
      return t;
    }
    if (feature === 'banktracks') {
      if (lvl < 1) return `The mud at the water's edge is churned up. Something comes here to drink. What, you can't say — not yet.`;
      let t = `Wait — at the muddy edge: prints. Three toes, splayed wide. Too big for any bird you know. They come down to the water at night, whatever they are. You memorize the shape.`;
      if (lvl >= 2) t += ` The print edges are softened by morning dew — they drink in the dark, and they're regular about it.`;
      return t;
    }
    if (feature === 'oldcamp') {
      if (lvl < 1) return `A fire pit, cold for days. Someone camped here. Beyond that — how many, how long, which way they went — you don't know how to read what's left.`;
      let t = `A fire pit, cold for days. Ash, a broken strap, a tin can with the label worried off. Someone camped here. Left in a hurry — or left not caring. You look for which direction they went. The grass doesn't say.`;
      if (lvl >= 2) t += ` But the ash does: it's scattered east — kicked, not wind-blown. And the strap was cut, not broken. They left in a hurry, and they left east.`;
      return t;
    }
    if (feature === 'strange') {
      // the strangeness is visible to anyone — honest wonder is the L0 text.
      let t = `The grass here grows in a spiral. The blades are blue at the tips, fading to green at the root — like the color is draining upward, or raining down. This isn't right. This isn't any kind of right. You step back. It keeps growing in its spiral, indifferent to your opinion.`;
      if (lvl >= 1) t += ` This has the System's fingerprints on it — too precise to be natural, too pointless to be anything else.`;
      if (lvl >= 2) t += ` A calibration scar. The System is learning this biome the way a child learns a face — by touching it wrong first.`;
      return t;
    }
    if (feature === 'remnant') {
      if (lvl < 1) return `Under the fresh breakage: older stone. Older than the Scattering — you're fairly sure — but you can't read it further than that.`;
      let t = `Under the fresh breakage: older stone. Concrete, rebar rusted to lace. This isn't Scattering rubble — this is BEFORE. Someone built here. Lived here. The moss has had years. You sit with that for a moment — the world had a before, and it had befores before that.`;
      if (lvl >= 2) t += ` The rebar pattern says load-bearing wall. This was a building — people lived or worked here, on purpose, for years. Decades, maybe.`;
      return t;
    }
    return `You look closer. There's something here, but you can't quite read it yet.`;
  }

  // ================================================================
  // GIVE FOOD — a decision, not a button.
  // amount: 'bite' | 'meal' | 'full'
  // ================================================================
  const _origGiveFood = Game.giveFood;
  Game.giveFood = function (vid, amount, opts) {
    amount = amount || 'meal';
    opts = opts || {};
    const source = opts.source || 'pack'; // 'pack' = your food; 'store' = skim the commons (theft)
    const v = (this.data.villagers || []).find(x => x.id === vid)
      /* unified: hydrated seeds are in villagers */;
    if (!v) return null;

    const steal = source === 'store';
    const stacks = edibleStacks();
    const first = this.displayName(vid);
    const n = this.npcNeeds(vid);
    const hunger = n.hunger || 0;
    const trust = trustOf.call(this, vid);
    const pub = isPublic.call(this, vid);
    const temp = npcTemper.call(this, vid);
    const goal = this.npcGoal ? this.npcGoal(vid) : null;

    // how much can we actually give? The supply is your pack — or the
    // commons pot, if you're stealing.
    const totalUnits = stacks.reduce((s, i) => s + (i.units || 0), 0);
    // THEFT, wired in concretely: the commons pot belongs to everyone.
    // Skimming it to feed one person is allowed — and punished. Seen =
    // the village punishes you. Unseen = the recipient knows what you are.
    const commons = steal ? (this.state.village.commons = this.state.village.commons || { units: 12 }) : null;
    const supply = steal ? (commons.units || 0) : totalUnits;
    if (steal && supply <= 0) { this.say("The commons pot is scraped clean. There's nothing to steal."); return null; }
    let units = 1;
    if (amount === 'meal') units = Math.min(3, supply);
    else if (amount === 'full') units = Math.min(supply, Math.ceil(hunger / 25) + 1);

    // take the food — from your pack, or from the commons pot
    let taken = 0, takenName = null, takenKcal = 0;
    if (steal) {
      taken = Math.min(units, commons.units);
      commons.units -= taken;
      takenName = 'commons rations';
      takenKcal = taken * 120;
    } else {
      if (!stacks.length) { this.say("You have no food to give."); return null; }
      // scraps = the dregs (lowest kcal stack); best = your finest (highest).
      // Amounts carry social meaning: what you give says what you think of them.
      const ordered = stacks.slice().sort((a, b) => (a.kcalEach || 0) - (b.kcalEach || 0));
      const pick = amount === 'scraps' ? ordered[0] : amount === 'best' ? ordered[ordered.length - 1] : null;
      if (pick) {
        const take = Math.min(pick.units, units);
        pick.units -= take; taken += take; takenKcal += take * (pick.kcalEach || 0);
        takenName = pick.name;
      } else {
        for (const st of stacks) {
          if (taken >= units) break;
          const take = Math.min(st.units, units - taken);
          st.units -= take; taken += take; takenKcal += take * (st.kcalEach || 0);
          if (!takenName) takenName = st.name;
        }
      }
      this.state.scholar.inventory = this.state.scholar.inventory.filter(i => (i.units || 0) > 0);
    }
    if (taken === 0) { this.say("You have no food to give."); return null; }

    // ---- the decision's consequences ----
    const hungerRelief = amount === 'bite' ? 25 : amount === 'meal' ? 60 : 120;
    n.hunger = Math.max(0, hunger - hungerRelief);

    let trustGain = amount === 'bite' ? 4 : amount === 'meal' ? 10
      : amount === 'scraps' ? 3 : amount === 'best' ? 18 : 16;
    let note = null;
    const req = (this.state.village.requests || {})[vid];

    // STARVING + BITE = insult risk. A crumb to a starving person can sting.
    const starving = hunger > 70;
    if (amount === 'bite' && starving && Math.random() < 0.4) {
      trustGain = 1;
      note = 'stingy';
      this.say(`${first} looks at the ${takenName}. A long pause. "That's... it?" They eat it anyway. Hunger doesn't leave room for pride, but it leaves room for memory.`);
      this.remember(vid, 'stingy_gift', 'gave a bite to a starving person');
    }

    // SCRAPS: the dregs. To the proud it's an insult; to the starving it's
    // still food. Either way, you both know what you gave.
    if (amount === 'scraps' && !req && Math.random() < (temp === 'proud' || temp === 'prickly' ? 0.7 : 0.4)) {
      trustGain = 1;
      note = 'scraps';
      this.say(`${first} looks at the ${takenName} — the dregs, and you both know it. "Thanks," they say, in a tone that means the opposite. Hunger will make them eat it. Memory will make them remember who gave it.`);
      this.remember(vid, 'given_scraps', 'gave them the dregs of the pack');
    }

    // BEST: your finest. Costs you the most, means the most.
    if (amount === 'best' && !note) {
      this.remember(vid, 'gave_the_best', `gave them your finest (${takenName})`);
    }

    // PRIVATE gifts cut deeper — no audience, just two people.
    if (!pub) {
      trustGain = Math.round(trustGain * 1.5);
      this.remember(vid, 'private_gift', `gave ${amount} with no one watching`);
    }

    // THEFT CONSEQUENCES — allowed, punished. (Steve: theft allowed,
    // socially punished — this is the wiring.)
    if (steal) {
      note = note || 'stolen';
      try { this.recordCrime('theft', { victim: 'village', caught: pub }); } catch (e) {}
      if (pub) {
        try { this.observe('theft', { target: vid }); } catch (e) {}
        const wits = ((this.witnesses && this.witnesses(3)) || []).filter(w => w !== vid && w !== this.villagerId);
        wits.forEach(w => {
          try { this.bumpTrust(w, -15); this.remember(w, 'saw_you_steal', `stole from the commons to feed ${first}`); } catch (e) {}
        });
        trustGain = Math.max(1, trustGain - 6);
        this.remember(vid, 'complicit_in_theft', 'accepted stolen commons food');
        this.say(`You take from the commons pot — openly — and hand it to ${first}. The watching faces go hard. Food given is kindness. Food STOLEN is a statement, and the whole village just heard it.`);
      } else {
        trustGain = Math.round(trustGain * 0.75);
        this.remember(vid, 'knows_you_steal', 'knows you skim from the commons');
        this.say(`No one sees. You skim from the commons pot and press it into ${first}'s hands. They eat — and they know exactly where it came from. Gratitude, tangled with something colder.`);
      }
    }

    // answered ask = gratitude (keep the existing beat)
    if (req && req.type === 'food') {
      delete this.state.village.requests[vid];
      this.remember(vid, 'gift', 'answered their hunger');
      if (!note) this.say(`${first} eats like it's the first time. "Thank you," they say, quiet. "I won't forget this."`);
    } else if (!note) {
      this.remember(vid, 'gift', `unasked-for food (${amount}${steal ? ', stolen' : ''})`);
    }

    setTrust.call(this, vid, trust + this.trustGainMult(trustGain));

    // PUBLIC: the village watches. Generosity is visible — and it creates
    // expectation. Feed people publicly and the hungry will come asking.
    // And the hungry who watched someone ELSE get fed will remember it.
    if (pub) {
      if (!steal) this.observe('give_food', { target: vid });
      if (amount === 'meal' || amount === 'full' || amount === 'best') {
        this.state.village.foodExpectation = true;
      }
      if (!note && !req) {
        this.say(`You give ${first} ${taken > 1 ? taken + ' portions of' : 'some'} ${takenName}${pub ? ', with the village watching' : ''}. They look at you differently now.`);
      }
      if (!steal) {
        const others = (this.state.village.roster || []).filter(id => id !== vid && id !== this.villagerId);
        const resentful = [];
        others.forEach(oid => {
          try {
            if (((this.npcNeeds(oid) || {}).hunger || 0) > 60) {
              this.remember(oid, 'passed_over', `watched you feed ${first} while they went hungry`);
              // -6: the observe('give_food') generosity bump gives witnesses
              // +4, so resentment must clear that to land net-negative.
              try { this.bumpTrust(oid, -6); } catch (e) {}
              resentful.push(oid);
            }
          } catch (e) {}
        });
        if (resentful.length && !note && !req) {
          this.say(`${this.displayName(resentful[0])} watches. Says nothing. Hunger is quiet, but it has a memory.`);
        }
      }
    } else if (!note && !req) {
      this.say(`Just you and ${first}. You press ${taken > 1 ? taken + ' portions of' : 'some'} ${takenName} into their hands. No one sees. That matters, somehow.`);
    }

    try { this.checkPromises('food'); } catch (e) {}
    this.socialTick(vid);
    this.tickAction(1); // a handoff is quick — the food is the real cost
    this.save();
    return { ok: true, amount, units: taken, public: pub, trustGain, stolen: steal };
  };

  // ================================================================
  // COMFORT — what do you SAY? Approach matters.
  // approach: 'silent' | 'reassure' | 'practical' | 'share' | 'space'
  // ================================================================
  const _origComfort = Game.comfort;
  Game.comfort = function (vid, approach) {
    approach = approach || 'silent';
    const mood = this.npcMood(vid);
    if (mood !== 'scared' && mood !== 'grieving' && mood !== 'hungry') {
      this.say("They don't need comforting right now.");
      return null;
    }
    const first = this.displayName(vid);
    const n = this.npcNeeds(vid);
    const trust = trustOf.call(this, vid);
    const intel = npcIntelPrimary.call(this, vid);
    const temp = npcTemper.call(this, vid);
    const grieving = mood === 'grieving';
    const pub = isPublic.call(this, vid);

    let fearDelta = 0, trustDelta = 0, line = '', ticks = 1;

    if (approach === 'silent') {
      // always safe. Presence is the whole thing.
      fearDelta = -20; trustDelta = 4;
      line = `You sit with ${first} for a while. Don't say much. Sometimes that's the whole thing.`;
    } else if (approach === 'reassure') {
      // "you're okay" — needs trust, misses grief.
      if (grieving) {
        fearDelta = -12; trustDelta = 3;
        line = `"Hey. You're okay." ${first} nods, but the grief doesn't move. They're not scared — they're sad. Reassurance lands beside the point.`;
      } else if (trust >= 30) {
        fearDelta = -35; trustDelta = 8;
        line = `"Hey. You're okay. We're okay." ${first} breathes out, shaky. "Yeah. Yeah, okay."`;
      } else {
        fearDelta = -10; trustDelta = 2;
        line = `"You're okay." The words hang there, thin. ${first} doesn't quite believe you yet — but the fact that you tried counts for something.`;
      }
    } else if (approach === 'practical') {
      // "here's what we do" — lands for practical minds, cold otherwise.
      const lands = intel === 'practical' || intel === 'analytical';
      if (grieving && !lands) {
        fearDelta = -8; trustDelta = 2;
        line = `You start talking logistics — what needs doing, who's on watch. ${first} stares past you. Grief doesn't want a plan. It wants a witness.`;
      } else if (lands) {
        fearDelta = -30; trustDelta = 8;
        line = `"Here's what we do." You lay it out, step by step. ${first}'s breathing steadies as the plan takes shape. Action is an antidote.`;
      } else {
        fearDelta = -15; trustDelta = 4;
        line = `You talk through what's next, practical and steady. ${first} listens. It doesn't fix the feeling, but it gives the feeling somewhere to go.`;
      }
    } else if (approach === 'share') {
      // vulnerable. Deep if it lands, awkward if it doesn't.
      if (trust >= 40) {
        fearDelta = -30; trustDelta = 10;
        line = `You tell ${first} about the time you were truly afraid — the real version, not the brave one. Something unclenches in them. "Me too," they whisper. And just like that, you're not alone in it.`;
        this.remember(vid, 'shared_fear', 'you were honest about being afraid');
      } else {
        fearDelta = -15; trustDelta = 2;
        line = `You try to share something real, but the trust isn't there yet — it comes out wrong, too soon. ${first} looks away. The moment passes, a little bruised.`;
      }
    } else if (approach === 'space') {
      // respecting boundaries IS care.
      fearDelta = 0; trustDelta = 6;
      line = `"I'll be right over there if you need me." You give ${first} room. Later, they find you. "Thanks," they say. "For not... you know. For not pushing."`;
      this.remember(vid, 'given_space', 'respected their need for distance');
    } else if (approach === 'distract') {
      // cheap redirection. Personality matching matters: light souls
      // (warm, gentle, bold, restless) can laugh through fear; withdrawn
      // ones just find it noise. And at a graveside it's callous — a wrong
      // read that's remembered.
      if (grieving) {
        fearDelta = 5; trustDelta = -3;
        line = `You try to lighten it — a joke, a distraction. ${first}'s face closes. Wrong moment. Wrong read. The silence afterward is worse than the one before.`;
        this.remember(vid, 'tone_deaf', 'tried to joke when it was serious');
      } else if (['warm', 'gentle', 'bold', 'restless'].includes(temp)) {
        fearDelta = -25; trustDelta = 5;
        line = `You steer ${first} sideways — a story, a silly observation, anything but the fear. It works. Laughter is a doorway; fear has to go around it.`;
      } else {
        fearDelta = -10; trustDelta = 1;
        line = `You try to lighten the mood. ${first} manages something almost like a smile — the effort counts, even if the joke doesn't quite land. Cheap comfort, cheap results.`;
      }
    } else if (approach === 'guard') {
      // "I'll keep watch." Protection has a price: your time AND your energy.
      // An exhausted guard is a liability, not a comfort — the game says so.
      const energy = this.state.scholar.energy === undefined ? 100 : this.state.scholar.energy;
      if (energy < 15) {
        this.say(`You want to offer a watch, but you're running on fumes. An exhausted guard is a liability, not a comfort. You say so, honestly — ${first} nods. The honesty lands better than the watch would have.`);
        return null;
      }
      this.state.scholar.energy = Math.max(0, energy - 12);
      ticks = 2;
      if (grieving) {
        fearDelta = -10; trustDelta = 5;
        line = `"I'll keep watch. You don't have to think about anything." Grief isn't afraid of the dark — but being guarded still lands. Someone standing between you and the world. That counts.`;
      } else {
        fearDelta = -40; trustDelta = 10;
        line = `"Sleep. I'll keep watch." You mean it, and ${first} can tell. The fear drains out of them like water. Protection is the oldest comfort there is.`;
        this.remember(vid, 'stood_watch', 'kept watch while they rested');
      }
    } else if (approach === 'tough') {
      // "We don't have time for this." High risk, high reward. You need to
      // have EARNED the right to say it — otherwise it's just cruelty.
      if (trust >= 50) {
        fearDelta = -45; trustDelta = 5;
        line = `"Hey. Look at me. We're still here, and we don't have time to fall apart — so we won't." Blunt. True. ${first} blinks, then breathes. "Okay," they say. "Okay."`;
      } else {
        fearDelta = 12; trustDelta = -8;
        line = `"We don't have time for this." The words land like a slap. ${first} stares at you — you haven't earned the right to say that yet. The fear gets worse, and now there's hurt under it.`;
        this.remember(vid, 'harsh_words', 'told them to get over it');
      }
    } else if (approach === 'ritual') {
      // breathing together, naming the lost. For grief, this is the real
      // medicine. Takes time — rituals can't be rushed.
      ticks = 2;
      if (grieving) {
        fearDelta = -35; trustDelta = 12;
        line = `You sit close and breathe with ${first} — slow, together. Then you say the name of who they lost, out loud, like it matters. Because it does. ${first} cries, and it's the good kind of crying.`;
        this.remember(vid, 'shared_ritual', 'grieved together, properly');
      } else {
        fearDelta = -12; trustDelta = 4;
        line = `You breathe with ${first}, slow and deliberate — a small ritual against the fear. It doesn't fix anything. But the rhythm helps. Rhythms are older than fear.`;
      }
    } else if (approach === 'listen') {
      // "Tell me." Asking is cheap; hearing is not. If they trust you,
      // they open up — and you learn about people. If not, prying at a
      // closed door teaches them to lock it.
      ticks = 2;
      if (trust >= 20) {
        fearDelta = -30; trustDelta = 10;
        line = `"Tell me," you say. And ${first} does — it comes out in a rush, the whole tangled knot of it. You listen. Really listen. Halfway through, their hands stop shaking.`;
        this.remember(vid, 'told_you', 'told you what was really wrong');
        feedExamKnowledge('read_people', 1);
      } else {
        fearDelta = 6; trustDelta = -2;
        line = `"Tell me what's wrong." ${first} looks at you for a long moment — and says nothing. The trust isn't there yet. Prying at a closed door just teaches them to lock it.`;
      }
    } else if (approach === 'warmth') {
      // warm food as comfort — the oldest medicine. Costs real food.
      const stacks = edibleStacks();
      if (!stacks.length) {
        this.say(`You'd press something warm into ${first}'s hands, but your pack is empty. The gesture dies before it's born.`);
        return null;
      }
      const st = stacks[0];
      st.units -= 1;
      this.state.scholar.inventory = this.state.scholar.inventory.filter(i => (i.units || 0) > 0);
      fearDelta = -15; trustDelta = 6;
      n.hunger = Math.max(0, (n.hunger || 0) - 20);
      line = `You press something warm into ${first}'s hands — ${st.name}. They hold it like it's more than food. Sometimes it is. The shaking eases.`;
      this.remember(vid, 'warm_food', 'comforted them with warm food');
    } else {
      // unknown approach: honest, never silent.
      this.say(`You try something — but it doesn't come together. ${first} waits. The moment passes, a little awkward.`);
      return null;
    }

    n.fear = Math.max(0, (n.fear || 0) + fearDelta);
    n.social = Math.max(0, (n.social || 0) - 15);
    setTrust.call(this, vid, trust + trustDelta);

    this.say(line);
    this.remember(vid, 'comforted', `via ${approach} when ${mood}`);
    this.observe('comfort', { target: vid });
    // SOCIAL SIGNAL: comfort happens in front of people. Kindness witnessed
    // is reputation — and harshness witnessed is too. Fail in public and
    // the onlookers remember what they saw.
    if (pub && trustDelta < 0) {
      const wits = (this.witnesses ? this.witnesses(3) : []) || [];
      wits.forEach(w => {
        if (w === vid || w === this.villagerId) return;
        try { this.remember(w, 'saw_harsh_comfort', `saw you be harsh with ${first}`); } catch (e) {}
      });
    }
    this.notePlaystyle('social');
    try { this.checkPromises('heal'); } catch (e) {}
    this.socialTick(vid);
    this.tickAction(ticks);
    this.save();
    return { ok: true, approach, fearDelta, trustDelta, ticks };
  };

  // ================================================================
  // EXAMINE — the exploration verb. Deep inspection.
  // Perception is automatic ("a mature oak"). Examining is deliberate:
  // "the bark is scarred on the north side — something large rubbed here."
  // 2 ticks, time-only. Adjacent cells. Depth grows with repeats.
  // ================================================================

  // what the world hides: deterministic per tile so it's consistent.
  // CURIOSITY DENSITY (tuned 2026-10-05): whispers must be invitations, not
  // wallpaper. ~11 features/tile meant "disturbed ground" at every stop —
  // obtrusive, against the standing rule that the cycling display stays
  // unobtrusive. Halved: ~5 per tile, roughly one whisper every other stop.
  Game.tileFeature = function (nx, ny, cx, cy, cell) {
    const h = hashStr(`${nx},${ny},${cx},${cy}`) % 100;
    const isHaven = (nx === 3 && ny === 3);
    if (cell === 'dirt' || cell === 'grass') {
      if (h < 6) return 'tracks';
      if (h < 9 && !isHaven) return 'oldcamp';
      if (h < 11) return 'strange';
    } else if (cell === 'rubble') {
      if (h < 4) return 'remnant';
    } else if (cell === 'tree' || cell === 'bigtree') {
      if (h < 3) return 'hollow';
    } else if (cell === 'water') {
      if (h < 4) return 'banktracks';
    }
    return null;
  };

  Game.examineCell = function (cx, cy) {
    const s = this.state.scholar;
    const px = s.mx ?? 4, py = s.my ?? 4;
    const dist = Math.max(Math.abs(cx - px), Math.abs(cy - py));
    if (dist > 1) { this.say('Too far. Step closer.'); return null; }

    const detail = this.genDetail(this.map.px, this.map.py);
    const row = detail[cy];
    const cell = row && row[cx];
    if (!cell) { this.say('Nothing there to examine.'); return null; }
    const key = `${this.map.px},${this.map.py},${cx},${cy}`;
    const t = this.playerTile();
    const mod = (t.modifiers || {})[cx + ',' + cy];
    const secret = (t.secrets || {})[cx + ',' + cy];

    // depth: first examine = surface, repeats (or observant) go deeper
    this.state.codex.examined = this.state.codex.examined || {};
    const depth = (this.state.codex.examined[key] || 0) + 1;
    this.state.codex.examined[key] = depth;
    const deep = depth >= 2;

    // knowledge feeding: module-level feedExamKnowledge (shared with
    // lingerCell/followTracks). Called BEFORE the reveal, so studying can
    // teach you mid-examination — the sight gates on the new level.

    const observant = (() => {
      try {
        const i = this.npcIntel(this.villagerId) || {};
        return i.primary === 'observant' || i.secondary === 'observant';
      } catch (e) { return false; }
    })();

    const feature = this.tileFeature(this.map.px, this.map.py, cx, cy, cell);
    const featKey = key + ':feat';
    const featKnown = (this.state.codex.examined || {})[featKey];

    let text = '';

    // ---- TREE / BIGTREE ----
    if (cell === 'tree' || cell === 'bigtree') {
      // TREE SPECIES GATING (Steve 2026-10-06): name only if known — the same
      // treeName() gate the game.js interact path uses. Unknown trees stay
      // "a tree" / "an old giant"; no "oak-like" hints.
      const rawSpecies = (mod && mod.species) || null;
      const knownSpecies = rawSpecies ? this.treeName(rawSpecies) : null;
      const species = knownSpecies || (cell === 'bigtree' ? 'an old giant' : 'a tree');
      const health = (mod && mod.health) || 'healthy';
      if (!deep) {
        text = `${species.charAt(0).toUpperCase() + species.slice(1)}, ${health}. `;
        text += cell === 'bigtree'
          ? `It was old before the Scattering. The canopy swallows the light.`
          : `Young enough to still be reaching. Old enough to have opinions.`;
      } else {
        text = `You circle the ${species.replace(/^(a|an)\s+/i, '')}. `;
        const scars = hashStr(key + 'scars') % 3;
        if (scars === 0) text += `Bark scarred on the north side — something large rubbed against it, hard. Old marks, healed over. Whatever did it hasn't been back in a while. `;
        else if (scars === 1) text += `Claw marks, shoulder-high. Not fresh — the bark's grown back around them. You memorize the pattern without meaning to. `;
        else text += `The roots grip a stone that's too square to be natural. Someone placed it. Long ago. `;
        if (mod && mod.ivy) text += `Ivy climbs the trunk, thick as rope. `;
        text += `Higher up: a nest, or what's left of one.`;
      }
      if (feature === 'hollow' && !featKnown) {
        this.state.codex.examined[featKey] = 1;
        feedExamKnowledge('track_read', 1);
        const sight = skillLevel('track_read');
        if (sight < 1) {
          text += ` And — a hollow at the base, half-hidden by roots. Could be nothing. Could be something's bedroom. You can't read it yet.`;
          this.say(text);
        } else {
          // a hollow tree — sometimes it holds something
          const loot = hashStr(key + 'loot') % 100;
          if (loot < 30) {
            text += ` And — wait. A hollow at the base, half-hidden by roots. Inside: a tin box, rusted shut. You work it open: wire, a fishing hook, a photograph of people you'll never meet. Someone hid this. Someone who isn't coming back.`;
            if (sight >= 2) text += ` The dust inside is undisturbed except for your hands. Whoever hid this is long gone.`;
            this.say(text);
            // small material find
            try {
              if (this.addMaterial) { this.addMaterial('fiber', 2); }
            } catch (e) {}
            this.remember && this.remember(null, 'found_cache', 'hollow tree cache');
          } else {
            text += ` And — a hollow at the base, half-hidden by roots. Empty. But the leaves inside are pressed flat, like something slept here. Recently.`;
            if (sight >= 2) text += ` The pressed patch is big — bigger than you. You decide what that means.`;
            this.say(text);
          }
        }
      } else {
        this.say(text);
      }
      // TREE SPECIES LEARNING (Steve 2026-10-06): no one hands you tree names —
      // you earn them by studying. Deep-examining an unknown species teaches it
      // after 3 careful studies (bark, needles/cones, the whole look); earlier
      // studies plant the hint that a name is close. Study counts per species,
      // so learning transfers across individual trees.
      if (deep && rawSpecies && !knownSpecies) {
        const study = (this.state.codex.treeStudy = this.state.codex.treeStudy || {});
        study[rawSpecies] = (study[rawSpecies] || 0) + 1;
        if (study[rawSpecies] >= 3) {
          this.state.codex.trees = this.state.codex.trees || {};
          this.state.codex.trees[rawSpecies] = {
            level: 1,
            learnedDay: (this.state.scholar || {}).day || 0,
            via: 'deep study',
          };
          const cap = rawSpecies.charAt(0).toUpperCase() + rawSpecies.slice(1);
          this.say(`${cap}. You've stared at this bark long enough — the needles, the cones, the way it holds itself. ${cap}. You know it now, and you'll know it everywhere.`);
          delete study[rawSpecies];
        } else if (study[rawSpecies] === 2) {
          this.say(`You study the bark, the needles, what's dropped underneath. A pattern is settling in — the name of this one is close. One more careful look should do it.`);
        }
      }
      feedExamKnowledge('track_read', observant ? 2 : 1);
    }
    // ---- WATER ----
    else if (cell === 'water') {
      const desc = mod ? `${mod.flow || 'still'}, ${mod.clarity || 'murky'}` : 'water';
      if (!deep) {
        text = `Water: ${desc}. You watch it for a while. Water tells you about everything upstream.`;
      } else {
        text = `You study the water. ${desc}. `;
        const up = hashStr(key + 'up') % 3;
        if (up === 0) text += `There's a green tint at the edges — algae, or something upstream feeding it. `;
        else if (up === 1) text += `The current pulls east. Anything upstream ends up here eventually. Good to know, and slightly worrying. `;
        else text += `Clear near the bank, darker in the middle. Deep enough to hide in. Or be hidden in. `;
        text += `At the bank: reeds bent flat in one spot. Something drinks here regularly. Something that doesn't want to be seen doing it.`;
      }
      this.say(text);
      if (feature === 'banktracks' && !featKnown) {
        this.state.codex.examined[featKey] = 1;
        feedExamKnowledge('track_read', 2);
        feedExamKnowledge('nocturnal_patterns', 1);
        this.say(featureText('banktracks', key));
      } else {
        feedExamKnowledge('track_read', 1);
      }
    }
    // ---- RUBBLE ----
    else if (cell === 'rubble') {
      if (!deep) {
        text = `Rubble. Broken pieces of something that used to be whole. You shift a few chunks — nothing useful on the surface.`;
      } else {
        text = `You work through the rubble carefully. `;
      }
      if (feature === 'remnant' && !featKnown) {
        this.state.codex.examined[featKey] = 1;
        feedExamKnowledge('old_world_cache', 2);
        text += featureText('remnant', key);
        this.say(text);
        // remnants sometimes hide old-world caches
        if (hashStr(key + 'cache') % 100 < 25) {
          this.say(`And in a cracked foundation stone: a hollow. Inside, wrapped in oilcloth that's somehow held: a multi-tool, pitted but whole. The old world, reaching forward.`);
          try {
            if (this.addMaterial) this.addMaterial('stone', 1);
          } catch (e) {}
        }
      } else {
        if (deep) text += `Just broken rock and dust. But even dust was something, once.`;
        this.say(text);
        feedExamKnowledge('old_world_cache', 1);
      }
    }
    // ---- DIRT / GRASS ----
    else if (cell === 'dirt' || cell === 'grass') {
      if (feature === 'tracks' && !featKnown) {
        this.state.codex.examined[featKey] = 1;
        feedExamKnowledge('track_read', 2);
        this.say(featureText('tracks', key));
      } else if (feature === 'oldcamp' && !featKnown) {
        this.state.codex.examined[featKey] = 1;
        feedExamKnowledge('track_human', 2);
        this.say(featureText('oldcamp', key));
      } else if (feature === 'strange' && !featKnown) {
        this.state.codex.examined[featKey] = 1;
        feedExamKnowledge('system_theology', 2);
        this.say(featureText('strange', key));
        try {
          // JOURNAL PACING (Steve 2026-10-05): passive observation doesn't
          // auto-record pre-codex. Post-codex the Codex remembers for you.
          // Pre-codex, queue a manual jot — the player writes it down deliberately.
          if (this.state.scholar.codexUnlocked) {
            if (this.journalLearn) this.journalLearn('place', 'strange growth', 'spiral grass, blue-tipped');
          } else if (this.queueJotNote) {
            this.queueJotNote('spiral grass, blue-tipped', 'The spiral grass, blue-tipped, growing wrong.');
          }
        } catch (e) {}
      } else if (!deep) {
        const empties = [
          `Ground. Dirt, grass, the usual negotiations between them. Nothing demands your attention.`,
          `You scan the ground. Nothing but ground being ground.`,
          `Dirt and grass. The world, at rest. For now.`,
        ];
        this.say(empties[hashStr(key) % empties.length]);
      } else {
        const deeps = [
          `You look closer. Ants, doing ant things with total commitment. A beetle that looks prehistoric. The small world doesn't care about the big one.`,
          `Closer still: the grass is grazed short in patches. Something eats here. Something careful — it takes a little from a lot of places, never enough to notice. Smart.`,
          `You find a feather. Barred brown and white. Too big for the birds you've seen. You tuck it away — evidence of something.`,
        ];
        this.say(deeps[hashStr(key) % deeps.length]);
        feedExamKnowledge('track_read', 1);
      }
    }
    // ---- BUSH / PLANT ----
    else if (cell === 'bush' || cell === 'plant') {
      // SIBLING HARDENING (Steve 2026-10-06): never read mod.species here —
      // bush species live in tile.bushSpecies (gated on codex.plants level
      // in perceive.js), so the examine branch stays generic by construction.
      // No species name can leak through this path, present or future.
      const species = cell === 'bush' ? 'a bush' : 'a plant';
      if (!deep) {
        text = `${species.charAt(0).toUpperCase() + species.slice(1)}. You look it over — leaves, stems, the way it holds itself.`;
      } else {
        text = `You really look at the ${species.replace(/^(a|an)\s+/i, '')}. The leaf arrangement, the stem color at the joints, what's growing nearby — plants keep company, and the company tells you about the soil, the water, the light. `;
        const note = hashStr(key) % 3;
        if (note === 0) text += `Something's been browsing it — clean bites, deer-high. This patch feeds something.`;
        else if (note === 1) text += `New growth at the tips, pale green. It's happy here. Remember this spot.`;
        else text += `A spider's web between two stems, perfect geometry. The bush is an ecosystem, not a plant.`;
      }
      this.say(text);
      feedExamKnowledge('track_read', 1);
    }
    // ---- TENT ----
    else if (cell === 'tent') {
      const condition = (secret && secret.condition) || 'standing';
      if (!deep) {
        text = condition === 'shredded'
          ? `A shredded tent. Wind and teeth did this. You can read the violence in the tears.`
          : `A tent, ${condition}. Someone's shelter. Someone's home, for a while.`;
      } else {
        text = condition === 'shredded'
          ? `You study the tears. Claws — wide-spaced, deep. Not frantic: deliberate. Whatever did this wasn't hunting. It was making a point. You decide not to linger.`
          : `You look closer. The ground inside is worn smooth in one spot — someone slept here many nights. There's a smell of old smoke. Whoever they were, they kept a careful camp. You wonder if they're still careful, wherever they are.`;
      }
      this.say(text);
      feedExamKnowledge('track_human', 1);
      feedExamKnowledge('read_people', 1);
    }
    // ---- FIRE ----
    else if (cell === 'fire') {
      if (!deep) {
        this.say(`Fire. Heat, light, the oldest technology. You warm your hands.`);
      } else {
        this.say(`You watch the fire the way you've learned to watch things. The wood it's burning — someone split that, recently, with something sharp. The stone ring is deliberate, maintained. This fire is tended. This fire means someone's home.`);
        feedExamKnowledge('track_human', 1);
      }
    }
    // ---- WALL / DOOR / BRIDGE ----
    else if (cell === 'wall' || cell === 'door' || cell === 'bridge') {
      const descs = {
        wall: deep ? `You run your hand along the wall. Old construction — you can feel the seams. Someone built this to last, and it has.` : `A wall. It divides here from there, and it's serious about it.`,
        door: deep ? `The door's hinges are worn bright from use. Many hands, many times. Doors are biographies.` : `A door. Closed things, open things — the eternal question.`,
        bridge: deep ? `You test the planks. Solid, mostly. Someone maintains this crossing. Someone who needs it — which means someone comes through here.` : `A bridge. The only way across, which makes it important to everyone.`,
      };
      this.say(descs[cell] || 'You look it over.');
      if (deep) feedExamKnowledge('track_human', 1);
    }
    // ---- HALL / BUNK / LODGE — home has texture. Examining the inside of
    // Haven reads the people, not the architecture: whose mug is whose,
    // how someone folds a blanket, where twelve people put their lives.
    else if (cell === 'hall' || cell === 'bunk' || cell === 'lodge') {
      const inmates = (() => {
        try {
          return (this.data.villagers || []).filter(v => v.id && v.id !== this.villagerId).slice(0, 4);
        } catch (e) { return []; }
      })();
      const firstName = (v) => { try { return String(this.displayName(v.id)).split(' ')[0]; } catch (e) { return 'someone'; } };
      if (cell === 'hall') {
        if (!deep) {
          let t = `The hall. The fire pit at the center, the cookpot black with use, herbs hanging where the smoke keeps them dry. `;
          if (inmates.length >= 2) {
            t += `A shelf by the door holds the tin mugs — each marked, each claimed. ${firstName(inmates[0])}'s is dented from a drop nobody mentions. ${firstName(inmates[1])}'s is scrubbed to a shine. You know whose is whose now. That's what living here does.`;
          } else {
            t += `A shelf by the door holds the tin mugs — each marked, each claimed. You know whose is whose now. That's what living here does.`;
          }
          text = t;
        } else {
          // CHARACTER READING: blanket folds, seat choices — the hall's memory.
          let t = `You look at the hall the way you've started looking at everything: for the story under the surface. `;
          if (inmates.length >= 2) {
            const a = firstName(inmates[0]), b = firstName(inmates[1]);
            const folds = ['military corners', 'a tight roll', 'a loose heap'];
            t += `The bedrolls along the wall tell you things. ${a} folds theirs into ${folds[hashStr(key + 'fa') % 3]} — order is a comfort. ${b}'s is ${folds[hashStr(key + 'fb') % 3]}. `;
          }
          t += `The table edge is scored with tally marks nobody admits to carving — meals shared, watches kept. Twelve people live here. The hall remembers all of them, even the ones who are gone.`;
          text = t;
        }
        this.say(text);
        feedExamKnowledge('track_human', observant ? 2 : 1);
      } else if (cell === 'bunk') {
        if (!deep) {
          text = `The sleeping row. Bedrolls in a line along the wall, boots tucked underneath, the whole quiet machinery of twelve people trying to rest at once.`;
        } else {
          const small = ['a smooth river stone', 'a photograph, folded soft at the creases', 'a strip of cloth too worn to be clothing and too kept to throw away', 'a pencil stub'];
          const who = inmates.length ? firstName(inmates[hashStr(key + 'who') % inmates.length]) : 'someone';
          text = `You look closer — carefully, the way you'd want someone to look at yours. A bedroll with ${small[hashStr(key) % small.length]} tucked at the head. ${who}'s, probably. Nobody says what they carry to sleep. But everybody carries something.`;
        }
        this.say(text);
        feedExamKnowledge('track_human', 1);
      } else { // lodge
        if (!deep) {
          text = `The lodge room. The threshold — coats on pegs, boots by the door, the worn step where every arrival and departure passes. You came through here. So did everyone.`;
        } else {
          text = `You study the step. The wood is dished in the middle from years of boots — before the Scattering, this was someone's something, and now it's the place twelve people come home to. There's mud on it from this morning's patrol. The world outside leaves tracks on the inside too.`;
        }
        this.say(text);
        feedExamKnowledge('track_human', 1);
      }
    }
    // ---- BUILDING ROOMS (pre-Burn interiors): gym, class, office, bay,
    // dock, sanct, base. The old world, room by room. Looking is how you
    // learn what the before was for.
    else if (['gym','class','office','bay','dock','sanct','base','apt','cube','break','conf','lobby'].includes(cell)) {
      const rooms = {
        gym: ['A gymnasium. The floor lines are still there under the dust — courts for games with rules nobody needs anymore.', 'Bleachers, folded up and rusting. A deflated ball in the corner, chewed by something that didn\'t care what it was. This room was for joy, once.'],
        class: ['A classroom. Desks in rows, facing a whiteboard gone gray with age. Chalk trays, empty.', 'On one desk: initials carved deep, the letters uneven. A kid, bored, decades before the end. The lesson didn\'t take. The carving did.'],
        office: ['An office. Cubicles like a maze nobody runs. Dead terminals, screens dark since the Burn.', 'A drawer hangs open. Inside: a stapler, dried-out pens, a stress ball shaped like the planet. Someone\'s whole working life, reduced to desk junk.'],
        bay: ['A garage bay. Oil stains in the concrete like a map of old repairs. The doors are buckled shut.', 'Tools scattered where they fell — wrenches, a jack, a socket set someone clearly loved. Whoever worked here kept their bay like a promise.'],
        dock: ['A loading dock. The smell of old diesel is still in the concrete. Pallets stacked and never shipped.', 'Shipping labels curled on the floor — addresses for places that don\'t exist anymore. Whatever was supposed to leave here never did.'],
        sanct: ['A sanctuary. Rows of seats facing a raised platform. The quiet here is older than the Scattering.', 'Someone left a hymnal open on a seat. The page is warped from rain through the broken roof. You don\'t read it. It doesn\'t need reading.'],
        base: ['A utility room. Pipes, valves, a breaker panel with half the switches taped over. The bones of a building.', 'Stenciled on the wall: NO SMOKING. The paint outlasted the rule, the smokers, and the building\'s owners.'],
        apt: ['An apartment. Kitchen, a couch facing where a television was. Someone lived a whole life in this square.', 'A closet with clothes still on hangers — folded by hands that didn\'t know they were folding for the last time.'],
        cube: ['A cubicle farm. Fabric walls, dead monitors, a mug with a faded logo. Work, the old religion.', 'Sticky notes on one partition, the ink bled to ghosts. Reminders for a meeting that never happened.'],
        break: ['A break room. A dead refrigerator, a microwave with the door hanging open. The smell of very old coffee.', 'A rota on the wall — who cleans the fridge, whose turn. The most ordinary document in the world. It survived everything.'],
        conf: ['A conference room. A long table, chairs pushed back like everyone left in a hurry. They probably did.', 'A whiteboard with a half-erased diagram. Strategy, or sales targets. Whatever it was, it stopped mattering mid-sentence.'],
        lobby: ['A lobby. A reception desk, a sign-in book with the last page half full. Visitors, once.', 'The directory board lists companies on floors that no longer have floors. Everyone in this building was somebody going somewhere.'],
      };
      const r = rooms[cell] || [`A room. The old world, being ordinary at you.`];
      text = deep ? (r[1] || r[0]) : r[0];
      this.say(text);
      feedExamKnowledge('old_world_cache', deep ? 2 : 1);
    }
    else {
      this.say(`You look at the ${cell} for a while. It declines to be interesting.`);
    }

    this.tickAction(2); // examining is time-only — looking, not labor
    this.save();
    return { ok: true, cell, depth, feature: featKnown ? null : feature };
  };

  // expose the amounts for UI. Every option names its cost (no silent actions).
  Game.giveFoodOptions = function () {
    const stacks = edibleStacks();
    const total = stacks.reduce((s, i) => s + (i.units || 0), 0);
    return [
      { id: 'scraps', label: '🥄 Scraps (1)', units: Math.min(1, total), desc: 'The dregs of your pack. Cheap for you — but the proud may take it as an insult. 1 tick.' },
      { id: 'bite', label: '🍽️ A bite (1)', units: Math.min(1, total), desc: 'Small. Enough to notice, not enough to matter — unless they\'re starving, when it can sting. 1 tick.' },
      { id: 'meal', label: '🍲 A meal (3)', units: Math.min(3, total), desc: 'Solid. The honest default. Costs you real food. 1 tick.' },
      { id: 'best', label: '🏆 Your finest (1)', units: Math.min(1, total), desc: 'Your best food, given away. The highest cost to you — and the deepest gratitude. 1 tick.' },
      { id: 'full', label: '💝 Until they\'re full', units: total, desc: 'Generous. Real cost to you. They won\'t forget this. 1 tick.' },
    ].filter(o => o.units > 0);
  };

  // where the food comes from. Pack = honest. Commons = theft (allowed, punished).
  Game.giveFoodSourceOptions = function () {
    // the commons pot exists whether or not anyone has stolen from it yet
    const pot = (this.state.village.commons = this.state.village.commons || { units: 12 });
    const commons = pot.units || 0;
    return [
      { id: 'pack', label: '🎒 From your own pack', desc: 'Your food, your choice. Honest. No one can call it theft.' },
      { id: 'store', label: '🏚️ Skim the commons pot', desc: commons > 0
        ? `Theft, plainly — ${commons} units in the pot. Seen = the village punishes you (-15 trust with witnesses). Unseen = the recipient knows what you are.`
        : 'The commons pot is empty. Nothing to steal.' },
    ];
  };

  Game.comfortOptions = function (vid) {
    const mood = this.npcMood(vid);
    const trust = trustOf.call(this, vid);
    const intel = npcIntelPrimary.call(this, vid);
    const energy = this.state.scholar.energy === undefined ? 100 : this.state.scholar.energy;
    const grieving = mood === 'grieving';
    return [
      { id: 'silent', label: '🪑 Sit with them in silence (1 tick)', desc: 'Always safe. Presence is the whole thing.' },
      { id: 'reassure', label: '💬 "You\'re okay" (1 tick)', desc: trust >= 30 ? 'They trust you enough to believe it.' : 'Might ring hollow — they don\'t know you well yet.' + (grieving ? ' And they\'re grieving, not scared.' : '') },
      { id: 'practical', label: '📋 "Here\'s what we do" (1 tick)', desc: (intel === 'practical' || intel === 'analytical') ? 'They think in plans. This will land.' : 'Practical comfort for an emotional moment — risky.' },
      { id: 'share', label: '💔 Share your own fear (1 tick)', desc: trust >= 40 ? 'Vulnerable. They\'ll meet you there.' : 'Too soon — it could come out wrong.' },
      { id: 'space', label: '🚪 Give them space (1 tick)', desc: '"I\'ll be here if you need me." Respecting boundaries is care too.' },
      { id: 'distract', label: '😅 Lighten the mood (1 tick)', desc: grieving ? 'Dangerous — joking at grief reads as callous, and they\'ll remember.' : 'Cheap and fast. Lands for warm, gentle, bold, restless souls; flat for others.' },
      { id: 'guard', label: '🛡️ Keep watch while they rest (2 ticks, 12 energy)', desc: energy < 15 ? 'You\'re too exhausted — an exhausted guard is a liability, not a comfort.' : 'The oldest comfort. Protection you can feel.' },
      { id: 'tough', label: '🪨 Hard truth: "we don\'t have time" (1 tick)', desc: trust >= 50 ? 'You\'ve earned the right to say this. It will snap them out of it.' : 'You haven\'t earned this yet — it could backfire badly, in front of everyone.' },
      { id: 'ritual', label: '🕯️ A small ritual, together (2 ticks)', desc: grieving ? 'For grief, this is the real medicine. Breathe together. Name the lost.' : 'Breathing together. Small, but rhythms are older than fear.' },
      { id: 'listen', label: '👂 "Tell me" — really listen (2 ticks)', desc: trust >= 20 ? 'They\'ll open up. Listening teaches you about people.' : 'They won\'t open up yet — prying teaches them to lock the door.' },
      { id: 'warmth', label: '🍵 Warm food as comfort (1 tick + 1 food)', desc: 'The oldest medicine. Costs real food from your pack.' },
    ];
  };

  // ================================================================
  // LINGER — a careful second look. 2 ticks, time-only.
  // The linger/move-on decision: stay with a cell and look longer.
  // Surfaces a hidden feature you walked past the first time. Honest
  // when there's nothing: "nothing but what you already saw."
  // ================================================================
  Game.lingerCell = function (cx, cy) {
    const s = this.state.scholar;
    const px = s.mx === undefined || s.mx === null ? 4 : s.mx;
    const py = s.my === undefined || s.my === null ? 4 : s.my;
    const dist = Math.max(Math.abs(cx - px), Math.abs(cy - py));
    if (dist > 1) { this.say('Too far. Step closer.'); return null; }

    const detail = this.genDetail(this.map.px, this.map.py);
    const row = detail[cy];
    const cell = row && row[cx];
    if (!cell) { this.say('Nothing there to linger over.'); return null; }
    const key = `${this.map.px},${this.map.py},${cx},${cy}`;

    const feature = this.tileFeature(this.map.px, this.map.py, cx, cy, cell);
    const featKey = key + ':feat';
    const featKnown = (this.state.codex.examined || {})[featKey];

    let found = false;
    if (feature && !featKnown) {
      (this.state.codex.examined = this.state.codex.examined || {})[featKey] = 1;
      featureKnowledge(feature).forEach(([sk, amt]) => feedExamKnowledge(sk, amt));
      this.say(`You linger, looking longer — and there it is, what you walked past the first time. ${featureText(feature, key)}`);
      found = true;
    } else {
      this.say(`You linger a while, looking carefully. ${feature ? 'Nothing here beyond what you already found.' : 'Nothing here but what you already saw. The world keeps its secrets for another day.'}`);
    }

    this.tickAction(2); // lingering is time-only — looking, not labor
    this.save();
    return { ok: true, found, feature: found ? feature : null };
  };

  // ================================================================
  // FOLLOW TRACKS — requires found, readable tracks. 2 ticks + 5 energy.
  // The trail can go cold (honest), lead to a find, or ARRIVE somewhere
  // that teaches you who runs this ground. Deterministic per tile.
  // ================================================================
  Game.followTracks = function (cx, cy) {
    const s = this.state.scholar;
    const px = s.mx === undefined || s.mx === null ? 4 : s.mx;
    const py = s.my === undefined || s.my === null ? 4 : s.my;
    const dist = Math.max(Math.abs(cx - px), Math.abs(cy - py));
    if (dist > 1) { this.say('Too far. Step closer.'); return null; }

    const detail = this.genDetail(this.map.px, this.map.py);
    const row = detail[cy];
    const cell = row && row[cx];
    if (!cell) { this.say('Nothing there to follow.'); return null; }
    const key = `${this.map.px},${this.map.py},${cx},${cy}`;

    const feature = this.tileFeature(this.map.px, this.map.py, cx, cy, cell);
    const featKey = key + ':feat';
    const featKnown = (this.state.codex.examined || {})[featKey];
    if ((feature !== 'tracks' && feature !== 'banktracks') || !featKnown) {
      this.say(`No trail here you can read. Find tracks first — examine the ground, and know enough to read what you find.`);
      return null;
    }

    const energy = s.energy === undefined ? 100 : s.energy;
    if (energy < 5) { this.say("You're too wiped to follow anything. The tracks will keep."); return null; }
    s.energy = Math.max(0, energy - 5);

    const dir = hashStr(key + 'trackdir') % 4;
    const dnames = ['north', 'east', 'south', 'west'];
    const dx = [0, 1, 0, -1][dir], dy = [-1, 0, 1, 0][dir];
    // stay on interior tiles (1..7): grid edges are the flee-by-barrier
    s.mx = Math.max(1, Math.min(7, px + dx));
    s.my = Math.max(1, Math.min(7, py + dy));

    const roll = hashStr(key + 'trackout') % 100;
    let outcome;
    if (roll < 55) {
      outcome = 'cold';
      this.say(`You follow the tracks ${dnames[dir]}, careful and quiet. Halfway across, the ground hardens and the signs scatter — whatever made these knew how to stop being followed. The trail goes cold. You learn the shape of a dead end.`);
      feedExamKnowledge('track_read', 1);
    } else if (roll < 80) {
      outcome = 'find';
      const finds = [
        'a shed antler, gnawed at the base — bone, if you need it',
        'a cache of nuts, buried and forgotten by something with more pressing concerns',
        'a dropped snare, still set — someone\'s trap, someone\'s bad day',
      ];
      const fi = hashStr(key + 'trackfind') % finds.length;
      this.say(`You follow the tracks ${dnames[dir]} — and find where something bedded down: ${finds[fi]}. The trail's loss is your gain.`);
      try {
        if (fi === 0 && this.addMaterial) this.addMaterial('bone', 1);
        else if (fi === 1) (s.inventory = s.inventory || []).push({ itemId: 'tracknuts', name: 'Cached nuts', units: 2, kcalEach: 90, kg: 0.1 });
        else if (this.addMaterial) this.addMaterial('fiber', 1);
      } catch (e) {}
      feedExamKnowledge('track_read', 2);
    } else {
      outcome = 'sign';
      this.say(`You follow the tracks ${dnames[dir]} — and the trail doesn't end, it ARRIVES. A wallow. A rubbing post worn smooth. Territory, marked and meant. Whatever made these tracks lives here, and it wants things to know. You back away quietly — and you understand something new about who runs this ground.`);
      feedExamKnowledge('track_read', 2);
      feedExamKnowledge('system_theology', 1);
    }

    this.tickAction(2);
    this.save();
    return { ok: true, direction: dnames[dir], outcome };
  };

  // ================================================================
  // MARK FOR LATER — fix a spot in memory. 1 tick.
  // Some places deserve a second visit. fieldMarksList() reads them back.
  // ================================================================
  Game.markForLater = function (cx, cy, note) {
    const s = this.state.scholar;
    const px = s.mx === undefined || s.mx === null ? 4 : s.mx;
    const py = s.my === undefined || s.my === null ? 4 : s.my;
    const dist = Math.max(Math.abs(cx - px), Math.abs(cy - py));
    if (dist > 1) { this.say('Too far. Step closer.'); return null; }

    const detail = this.genDetail(this.map.px, this.map.py);
    const row = detail[cy];
    const cell = row && row[cx];
    if (!cell) { this.say('Nothing there to mark.'); return null; }
    const key = `${this.map.px},${this.map.py},${cx},${cy}`;

    this.state.codex.fieldMarks = this.state.codex.fieldMarks || {};
    const cleanNote = String(note || '').slice(0, 60);
    this.state.codex.fieldMarks[key] = { day: s.day || 0, cell, note: cleanNote };
    this.say(`You fix this spot in your memory${cleanNote ? ` — "${cleanNote}"` : ''}. Some places deserve a second visit. You'll come back.`);

    this.tickAction(1);
    this.save();
    return { ok: true, key };
  };

  Game.fieldMarksList = function () {
    return Object.assign({}, (this.state.codex || {}).fieldMarks || {});
  };

})();
