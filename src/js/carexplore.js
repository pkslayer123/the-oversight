// @ontology
// system: care-explore
// description: Care and exploration decisions. Care was a vending machine — now it requires real choices.
// provides:
//   - giveFood(vid, amount)
//   - comfort(vid, approach)
//   - giveFoodOptions()
//   - comfortOptions(vid)
//   - examineCell(cx, cy)
//   - tileFeature(nx, ny, cx, cy, cell)
// rules:
//   - (none documented)
// consumes:
//   - scholar.energy
//   - village.needs
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
//   - a bite (1 unit): small. If they're starving, it can insult.
//   - a meal (3 units): solid. The honest default.
//   - until full: real cost, real gratitude.
//   - PUBLIC (witnesses): reputation moves. Generosity is visible — and
//     creates expectation. Others will ask.
//   - PRIVATE (alone): deeper trust, no reputation. But secrets have weight.
//
// COMFORT: what do you SAY? Personality matching matters.
//   - sit in silence: always safe, small.
//   - reassure: needs trust, or it rings hollow.
//   - be practical: lands for practical minds, cold otherwise.
//   - share your own fear: vulnerable. Deep if it lands, awkward if not.
//   - give them space: respecting boundaries IS care.
//   - grieving ≠ scared: reassurance misses grief; practicality misses sorrow.
//
// DESIGN — EXAMINE:
//   - 2 ticks, time-only. Adjacent cells only.
//   - Depth: first examine = surface. Repeat (or observant) = deeper.
//   - Feeds knowledge: track_read, track_human, old_world_cache,
//     system_theology. 4 encounters = learnSkill (existing pattern).
//   - The world hides things: tracks, old camps, strange growths, remnants,
//     hollows. Deterministic per tile (seeded hash) so they're consistent.
//   - Discoveries: examining can FIND things — caches, story beats.

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

  // ================================================================
  // GIVE FOOD — a decision, not a button.
  // amount: 'bite' | 'meal' | 'full'
  // ================================================================
  const _origGiveFood = Game.giveFood;
  Game.giveFood = function (vid, amount) {
    amount = amount || 'meal';
    const v = (this.data.villagers || []).find(x => x.id === vid)
      || (this.data.background_survivors || []).find(x => x.id === vid);
    if (!v) return null;

    const stacks = edibleStacks();
    if (!stacks.length) { this.say("You have no food to give."); return null; }

    const first = this.displayName(vid);
    const n = this.npcNeeds(vid);
    const hunger = n.hunger || 0;
    const trust = trustOf.call(this, vid);
    const pub = isPublic.call(this, vid);
    const temp = npcTemper.call(this, vid);
    const goal = this.npcGoal ? this.npcGoal(vid) : null;

    // how much can we actually give?
    const totalUnits = stacks.reduce((s, i) => s + (i.units || 0), 0);
    let units = 1;
    if (amount === 'meal') units = Math.min(3, totalUnits);
    else if (amount === 'full') units = Math.min(totalUnits, Math.ceil(hunger / 25) + 1);

    // take the food — best stacks first (lowest kcal? no: use oldest/spoiling first is complex; just take in order)
    let taken = 0, takenName = stacks[0].name, takenKcal = 0;
    for (const st of stacks) {
      if (taken >= units) break;
      const take = Math.min(st.units, units - taken);
      st.units -= take; taken += take; takenKcal += take * (st.kcalEach || 0);
      if (!takenName) takenName = st.name;
    }
    this.state.scholar.inventory = this.state.scholar.inventory.filter(i => (i.units || 0) > 0);
    if (taken === 0) { this.say("You have no food to give."); return null; }

    // ---- the decision's consequences ----
    const hungerRelief = amount === 'bite' ? 25 : amount === 'meal' ? 60 : 120;
    n.hunger = Math.max(0, hunger - hungerRelief);

    let trustGain = amount === 'bite' ? 4 : amount === 'meal' ? 10 : 16;
    let note = null;

    // STARVING + BITE = insult risk. A crumb to a starving person can sting.
    const starving = hunger > 70;
    if (amount === 'bite' && starving && Math.random() < 0.4) {
      trustGain = 1;
      note = 'stingy';
      this.say(`${first} looks at the ${takenName}. A long pause. "That's... it?" They eat it anyway. Hunger doesn't leave room for pride, but it leaves room for memory.`);
      this.remember(vid, 'stingy_gift', 'gave a bite to a starving person');
    }

    // PRIVATE gifts cut deeper — no audience, just two people.
    if (!pub) {
      trustGain = Math.round(trustGain * 1.5);
      this.remember(vid, 'private_gift', `gave ${amount} with no one watching`);
    }

    // answered ask = gratitude (keep the existing beat)
    const req = (this.state.village.requests || {})[vid];
    if (req && req.type === 'food') {
      delete this.state.village.requests[vid];
      this.remember(vid, 'gift', 'answered their hunger');
      if (!note) this.say(`${first} eats like it's the first time. "Thank you," they say, quiet. "I won't forget this."`);
    } else if (!note) {
      this.remember(vid, 'gift', `unasked-for food (${amount})`);
    }

    setTrust.call(this, vid, trust + this.trustGainMult(trustGain));

    // PUBLIC: the village watches. Generosity is visible — and it creates
    // expectation. Feed people publicly and the hungry will come asking.
    if (pub) {
      this.observe('give_food', { target: vid });
      if ((amount === 'meal' || amount === 'full')) {
        this.state.village.foodExpectation = true;
      }
      if (!note && !req) {
        this.say(`You give ${first} ${taken > 1 ? taken + ' portions of' : 'some'} ${takenName}${pub ? ', with the village watching' : ''}. They look at you differently now.`);
      }
    } else if (!note && !req) {
      this.say(`Just you and ${first}. You press ${taken > 1 ? taken + ' portions of' : 'some'} ${takenName} into their hands. No one sees. That matters, somehow.`);
    }

    try { this.checkPromises('food'); } catch (e) {}
    this.socialTick(vid);
    this.tickAction(1); // a handoff is quick — the food is the real cost
    this.save();
    return { ok: true, amount, units: taken, public: pub, trustGain };
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

    let fearDelta = 0, trustDelta = 0, line = '';

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
    }

    n.fear = Math.max(0, (n.fear || 0) + fearDelta);
    n.social = Math.max(0, (n.social || 0) - 15);
    setTrust.call(this, vid, trust + trustDelta);

    this.say(line);
    this.remember(vid, 'comforted', `via ${approach} when ${mood}`);
    this.observe('comfort', { target: vid });
    this.notePlaystyle('social');
    try { this.checkPromises('heal'); } catch (e) {}
    this.socialTick(vid);
    this.tickAction(1);
    this.save();
    return { ok: true, approach, fearDelta, trustDelta };
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

    // knowledge feeding helper
    const feedKnowledge = (skillId, amt) => {
      this.state.codex.encounters = this.state.codex.encounters || {};
      const cur = (this.state.codex.skills || {})[skillId];
      if (cur && (cur.level || 0) >= 1) return;
      this.state.codex.encounters[skillId] = (this.state.codex.encounters[skillId] || 0) + amt;
      const enc = this.state.codex.encounters[skillId];
      if (enc >= 4 && this.learnSkill) {
        this.learnSkill(skillId, 1, 'examining');
      } else if (enc >= 2) {
        const k = (this.data.knowledge || []).find(x => x.id === skillId);
        if (k) this.say(`(Studying this teaches you. ${k.name}: ${enc}/4)`);
      }
    };

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
        // a hollow tree — sometimes it holds something
        const loot = hashStr(key + 'loot') % 100;
        if (loot < 30) {
          text += ` And — wait. A hollow at the base, half-hidden by roots. Inside: a tin box, rusted shut. You work it open: wire, a fishing hook, a photograph of people you'll never meet. Someone hid this. Someone who isn't coming back.`;
          this.say(text);
          // small material find
          try {
            if (this.addMaterial) { this.addMaterial('fiber', 2); }
          } catch (e) {}
          this.remember && this.remember(null, 'found_cache', 'hollow tree cache');
        } else {
          text += ` And — a hollow at the base, half-hidden by roots. Empty. But the leaves inside are pressed flat, like something slept here. Recently.`;
          this.say(text);
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
      feedKnowledge('track_read', observant ? 2 : 1);
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
        this.say(`Wait — at the muddy edge: prints. Three toes, splayed wide. Too big for any bird you know. They come down to the water at night, whatever they are. You memorize the shape.`);
        feedKnowledge('track_read', 2);
        feedKnowledge('nocturnal_patterns', 1);
      } else {
        feedKnowledge('track_read', 1);
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
        text += `Under the fresh breakage: older stone. Concrete, rebar rusted to lace. This isn't Scattering rubble — this is BEFORE. Someone built here. Lived here. The moss has had years. You sit with that for a moment — the world had a before, and it had befores before that.`;
        this.say(text);
        feedKnowledge('old_world_cache', 2);
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
        feedKnowledge('old_world_cache', 1);
      }
    }
    // ---- DIRT / GRASS ----
    else if (cell === 'dirt' || cell === 'grass') {
      if (feature === 'tracks' && !featKnown) {
        this.state.codex.examined[featKey] = 1;
        const kinds = [
          `Three toes, deep impression, heading north. Something heavy, moving with purpose. The stride is long — it wasn't hurrying, it just covers ground.`,
          `Small paired prints, bounding. Rabbit — or something that wants you to think rabbit. You note the claw marks. Rabbits don't leave those.`,
          `A drag mark through the grass, and beside it, prints too light to be the thing doing the dragging. Something was carried. Something that didn't want to go.`,
        ];
        text = kinds[hashStr(key) % kinds.length];
        this.say(`You crouch. The ground here has a story. ${text}`);
        feedKnowledge('track_read', 2);
      } else if (feature === 'oldcamp' && !featKnown) {
        this.state.codex.examined[featKey] = 1;
        text = `A fire pit, cold for days. Ash, a broken strap, a tin can with the label worried off. Someone camped here. Left in a hurry — or left not caring. You look for which direction they went. The grass doesn't say.`;
        this.say(text);
        feedKnowledge('track_human', 2);
      } else if (feature === 'strange' && !featKnown) {
        this.state.codex.examined[featKey] = 1;
        text = `The grass here grows in a spiral. The blades are blue at the tips, fading to green at the root — like the color is draining upward, or raining down. This isn't right. This isn't any kind of right. You step back. It keeps growing in its spiral, indifferent to your opinion.`;
        this.say(text);
        feedKnowledge('system_theology', 2);
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
        feedKnowledge('track_read', 1);
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
      feedKnowledge('track_read', 1);
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
      feedKnowledge('track_human', 1);
      feedKnowledge('read_people', 1);
    }
    // ---- FIRE ----
    else if (cell === 'fire') {
      if (!deep) {
        this.say(`Fire. Heat, light, the oldest technology. You warm your hands.`);
      } else {
        this.say(`You watch the fire the way you've learned to watch things. The wood it's burning — someone split that, recently, with something sharp. The stone ring is deliberate, maintained. This fire is tended. This fire means someone's home.`);
        feedKnowledge('track_human', 1);
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
      if (deep) feedKnowledge('track_human', 1);
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
        feedKnowledge('track_human', observant ? 2 : 1);
      } else if (cell === 'bunk') {
        if (!deep) {
          text = `The sleeping row. Bedrolls in a line along the wall, boots tucked underneath, the whole quiet machinery of twelve people trying to rest at once.`;
        } else {
          const small = ['a smooth river stone', 'a photograph, folded soft at the creases', 'a strip of cloth too worn to be clothing and too kept to throw away', 'a pencil stub'];
          const who = inmates.length ? firstName(inmates[hashStr(key + 'who') % inmates.length]) : 'someone';
          text = `You look closer — carefully, the way you'd want someone to look at yours. A bedroll with ${small[hashStr(key) % small.length]} tucked at the head. ${who}'s, probably. Nobody says what they carry to sleep. But everybody carries something.`;
        }
        this.say(text);
        feedKnowledge('track_human', 1);
      } else { // lodge
        if (!deep) {
          text = `The lodge room. The threshold — coats on pegs, boots by the door, the worn step where every arrival and departure passes. You came through here. So did everyone.`;
        } else {
          text = `You study the step. The wood is dished in the middle from years of boots — before the Scattering, this was someone's something, and now it's the place twelve people come home to. There's mud on it from this morning's patrol. The world outside leaves tracks on the inside too.`;
        }
        this.say(text);
        feedKnowledge('track_human', 1);
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
      feedKnowledge('old_world_cache', deep ? 2 : 1);
    }
    else {
      this.say(`You look at the ${cell} for a while. It declines to be interesting.`);
    }

    this.tickAction(2); // examining is time-only — looking, not labor
    this.save();
    return { ok: true, cell, depth, feature: featKnown ? null : feature };
  };

  // expose the amounts for UI
  Game.giveFoodOptions = function () {
    const stacks = edibleStacks();
    const total = stacks.reduce((s, i) => s + (i.units || 0), 0);
    return [
      { id: 'bite', label: '🍽️ A bite (1)', units: Math.min(1, total), desc: 'Small. Enough to notice, not enough to matter — unless they\'re starving, when it can sting.' },
      { id: 'meal', label: '🍲 A meal (3)', units: Math.min(3, total), desc: 'Solid. The honest default. Costs you real food.' },
      { id: 'full', label: '💝 Until they\'re full', units: total, desc: 'Generous. Real cost to you. They won\'t forget this.' },
    ].filter(o => o.units > 0);
  };

  Game.comfortOptions = function (vid) {
    const mood = this.npcMood(vid);
    const trust = trustOf.call(this, vid);
    const intel = npcIntelPrimary.call(this, vid);
    return [
      { id: 'silent', label: '🪑 Sit with them in silence', desc: 'Always safe. Presence is the whole thing.' },
      { id: 'reassure', label: '💬 "You\'re okay"', desc: trust >= 30 ? 'They trust you enough to believe it.' : 'Might ring hollow — they don\'t know you well yet.' + (mood === 'grieving' ? ' And they\'re grieving, not scared.' : '') },
      { id: 'practical', label: '📋 "Here\'s what we do"', desc: (intel === 'practical' || intel === 'analytical') ? 'They think in plans. This will land.' : 'Practical comfort for an emotional moment — risky.' },
      { id: 'share', label: '💔 Share your own fear', desc: trust >= 40 ? 'Vulnerable. They\'ll meet you there.' : 'Too soon — it could come out wrong.' },
      { id: 'space', label: '🚪 Give them space', desc: '"I\'ll be here if you need me." Respecting boundaries is care too.' },
    ];
  };

})();
