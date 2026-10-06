// @ontology
// system: examine-recognition
// description: Examine action + observation memory + recognition. Looking closely at a plant is cheap (time, tiny kcal); foraging costs more energy. Examining yields a vague description (never the name) and creates an observation memory. When someone later teaches you that species, the observation CLICKS — the vague description resolves into the name. That's what unlocks the visual change (sprite depth 1→2).
// provides:
//   - observePlant(pid, via) -> record an observation memory
//   - observationOf(pid) -> observation record or null
//   - observedPlant(pid) -> boolean: any observation exists
//   - examineQuality() -> 1-3 based on perception skill
//   - examineDescription(pid, quality) -> vague description, never leaks the name
//   - examinePlantCell(cx, cy) -> the Examine action (cheap look, no harvest)
//   - recognitionBeat(pid, teacherName) -> revelation narration on identify
//   - plantVisualDepth(pid) -> 0 unknown, 1 examined, 2 known
//   - scrubName(text, name) -> gated text with every name mention removed
//   - learnDifficulty(pid) -> {tier, reason}: how hard THIS character finds it
//   - teachQuality(teacherVid, pid, opts) -> 0-3: quality of a teaching moment
//   - teachPlant(pid, teacherVid, opts) -> the haven teaching moment (applies)
// rules:
//   - examine_never_names: examine output never contains the species name unless plantKnown (code: scrubName, Steve 2026-10-06)
//   - examine_is_cheap: examine costs time + tiny kcal, never harvests (code: examinePlantCell, Steve 2026-10-06)
//   - observation_precedes_recognition: identifyPlant on an observed species fires the recognition beat (code: recognitionBeat, Steve 2026-10-06)
//   - quality_varies: botanist/herbalist/green_thumb deepen the vague description (code: examineQuality, Steve 2026-10-06)
//   - forage_also_observes: harvesting records an observation too — handling teaches (code: observePlant via doAction, Steve 2026-10-06)
//   - teaching_quality_gates_depth: good teaching needs knowledge + trust + showing; hearsay caps at partial (code: teachQuality, Steve 2026-10-06)
//   - foreign_plants_resist_telling: hard-difficulty plants can't be learned by hearsay — they must be SHOWN (code: teachPlant, Steve 2026-10-06)
//   - shown_properly_lands_deep: Q3 teaching grants uses (level 2), not just the name (code: teachPlant, Steve 2026-10-06)
//   - integration_surface: game.js calls in via Scattering.Examine.teachPlant(pid, vid, {shown, hearsay}) and Game.teachPlant (alias); the haven-haul beat is the intended caller (code: teachPlant, Steve 2026-10-06)
// consumes:
//   - state.codex.observations
//   - state.codex.plants (plantKnown)
//   - Game.data.plants (description, taxon, seasons, tileAffinity, lookalikeNote)
//   - Game.plantLevel
//   - Game.identifyPlant
//   - Game.personDepth
//   - Game.vpOf
//   - Game.parseOrigin
//   - state.map cell species (plantSpecies/bushSpecies/tree per tile)
//   - state.village.plantKnowledge
// ============ EXAMINE + RECOGNITION ============
// Steve 2026-10-06: "I should be able to examine more things instead of just
// foraging them. Come away with vague plant descriptions. This should be the
// foundation of recognizing a plant when someone reveals knowledge to you at
// a later date. That's what unlocks visual change."
(function (global) {
  'use strict';
  const S = global.Scattering = global.Scattering || {};
  const G = () => S.Game;

  // observePlant(pid, via): record an observation memory. The game knows the
  // true species; the player only gets the vague description. Quality is the
  // best observation quality so far — a skilled look replaces a casual one.
  function observePlant(pid, via) {
    const g = G(); if (!g || !pid) return null;
    g.state.codex = g.state.codex || {};
    g.state.codex.observations = g.state.codex.observations || {};
    const obs = g.state.codex.observations[pid] || { count: 0, firstDay: null, lastDay: null, quality: 0, via: [] };
    const q = examineQuality();
    obs.count += 1;
    const day = (g.state.scholar && g.state.scholar.day) || 0;
    if (obs.firstDay === null) obs.firstDay = day;
    obs.lastDay = day;
    if (q > obs.quality) obs.quality = q;
    if (via && obs.via.indexOf(via) === -1) obs.via.push(via);
    g.state.codex.observations[pid] = obs;
    return obs;
  }

  function observationOf(pid) {
    const g = G(); if (!g || !pid) return null;
    return ((g.state.codex || {}).observations || {})[pid] || null;
  }

  function observedPlant(pid) {
    return !!observationOf(pid);
  }

  // examineQuality: 1 = casual glance, 2 = careful look, 3 = expert read.
  // Botanists and herbalists see more in the same plant. Green thumb helps.
  function examineQuality() {
    const g = G(); if (!g) return 1;
    let q = 1;
    try {
      // player villager record (vpOf), not state.villager
      const vp = (g.vpOf && g.villagerId) ? g.vpOf(g.villagerId) : {};
      const occ = String(vp.formerOccupation || '').toLowerCase();
      if (/botanist|herbalist/.test(occ)) q += 1;
      if (g.abilityLevel && g.abilityLevel('green_thumb') >= 1) q += 1;
      if (g.abilityLevel && g.abilityLevel('tracker') >= 2) q += 1; // trackers read sign
    } catch (e) {}
    return Math.min(3, q);
  }

  // examineDescription(pid, quality): the vague description. NEVER the name
  // unless the species is already known. Quality deepens the observation:
  // Q1 = what it looks like; Q2 = + when/where; Q3 = + the TYPE you'd
  // recognize again + lookalike caution.
  function examineDescription(pid, quality) {
    const g = G(); if (!g) return 'a plant.';
    const p = (g.data.plants || []).find(x => x.id === pid);
    if (!p) return 'a plant.';
    // KNOWN: no need for vagueness — you know what it is.
    if (g.plantKnown && g.plantKnown(pid)) {
      return `${p.name}. ${(p.knowledgeLevels || {})['1'] || p.description || ''}`.trim();
    }
    const q = quality || examineQuality();
    // scrubName: the name is earned knowledge — remove every mention,
    // leading or mid-string, any casing. Data gets edited by content
    // workers who don't know this rule; the scrub is the backstop.
    let desc = scrubName(p.description || 'a plant', p.name);
    let out = desc.charAt(0).toUpperCase() + desc.slice(1);
    if (!/[.!?]$/.test(out)) out += '.';
    if (q >= 2) {
      const bits = [];
      if (p.seasons && p.seasons.length) bits.push(`in ${p.seasons.join('/')} season`);
      if (p.tileAffinity && p.tileAffinity.length) {
        const hab = p.tileAffinity[0].replace(/_/g, ' ');
        bits.push(`favoring ${hab}`);
      }
      if (bits.length) out += ` Noted ${bits.join(', ')}.`;
    }
    if (q >= 3) {
      // the TYPE: taxon[1] is the category (berry_bush, etc.) — you'd know it again
      const taxon = p.taxon || [];
      if (taxon.length >= 2) {
        const cat = String(taxon[1]).replace(/_/g, ' ');
        out += ` You'd recognize the type again — ${cat}.`;
      }
      if (p.lookalikeNote) {
        // caution, not identification: something to watch for.
        // Scrub the species name — the note must never leak it.
        let note = String(p.lookalikeNote).split('.')[0];
        const nm = p.name.toLowerCase();
        // replace name mentions with "it" (case-insensitive)
        note = note.replace(new RegExp(p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), 'it');
        if (note.toLowerCase().indexOf(nm) === -1 && note.trim()) {
          out += ` Caution: ${note.charAt(0).toLowerCase() + note.slice(1)}.`;
        }
      }
    }
    return out;
  }

  // resolveCellSpecies(cx, cy): the TRUE species of a plant/bush/tree cell.
  // The game knows; the player may not.
  function resolveCellSpecies(cx, cy) {
    const g = G(); if (!g) return null;
    const t = g.playerTile();
    const detail = g.genDetail(g.map.px, g.map.py);
    const cell = detail[cy] && detail[cy][cx];
    const key = cx + ',' + cy;
    if (cell === 'bush') {
      // ensure a species is assigned (revealBush assigns + chain-reveals)
      if (g.revealBush) return g.revealBush(cx, cy);
      return (t.bushSpecies || {})[key] || null;
    }
    if (cell === 'plant') {
      return (t.plantSpecies || {})[key] || null;
    }
    if (cell === 'tree' || cell === 'bigtree') {
      const mod = t.modifiers && t.modifiers[key];
      // tree species aren't plant pids — return a pseudo-id for observation
      if (mod && mod.species) return 'tree_' + mod.species;
      return null;
    }
    return null;
  }

  // examinePlantCell(cx, cy): the EXAMINE action. Cheap look, no harvest.
  // Time + tiny kcal. Yields a vague description + observation memory.
  function examinePlantCell(cx, cy) {
    const g = G(); if (!g) return null;
    const t = g.playerTile();
    const detail = g.genDetail(g.map.px, g.map.py);
    const cell = detail[cy] && detail[cy][cx];
    const px = g.state.scholar.mx ?? 4, py = g.state.scholar.my ?? 4;
    if (Math.max(Math.abs(cx - px), Math.abs(cy - py)) > 1) { g.say('Too far. Step closer.'); return null; }
    if (['plant', 'bush', 'tree', 'bigtree'].indexOf(cell) === -1) { g.say('Nothing to examine there.'); return null; }

    const pid = resolveCellSpecies(cx, cy);
    // TREE pseudo-ids: describe generically, still record the look
    if (pid && String(pid).indexOf('tree_') === 0) {
      const species = pid.slice(5);
      const known = g.treeName ? g.treeName(species) : null;
      // treeName returns null/generic when unknown (species gating)
      if (known && known !== 'tree') {
        g.say(`A ${known}. You've looked closely — you'd know this tree again.`);
      } else {
        g.say('A tree. Bark, branches, leaves. Nothing you can name — but you looked properly, and you\'d recognize this one again.');
      }
      observePlant(pid, 'examine');
      g.state.scholar.kcal = Math.max(0, (g.state.scholar.kcal || 0) - 15);
      return g.tickAction(8) || g.status();
    }
    if (!pid) { g.say('You look closely. Green, growing, unremarkable — or remarkable in a way you can\'t name yet.'); return g.tickAction(8) || g.status(); }

    const obs = observePlant(pid, 'examine');
    const desc = examineDescription(pid, obs.quality);
    const p = (g.data.plants || []).find(x => x.id === pid);
    const alreadyKnown = g.plantKnown && g.plantKnown(pid);

    if (alreadyKnown) {
      g.say(`You examine it: ${desc}`);
    } else if (obs.count === 1) {
      g.say(`You crouch and look properly. ${desc} You don't know its name — but you'll remember this one.`);
    } else if (obs.count === 2) {
      g.say(`You look again, closer this time. ${desc} Familiar now. Still nameless.`);
    } else {
      g.say(`You know this plant by sight, if not by name. ${desc} (${obs.count} observations)`);
    }
    // EXAMINE IS CHEAP: a few minutes of looking, barely any energy.
    // Foraging is the expensive one — that's the tradeoff Steve wanted.
    g.state.scholar.kcal = Math.max(0, (g.state.scholar.kcal || 0) - 15);
    return g.tickAction(8) || g.status();
  }

  // recognitionBeat(pid, teacherName): called from identifyPlant when the
  // species was observed BEFORE it was named. The vague description CLICKS.
  // This is the revelation — not a database unlock.
  function recognitionBeat(pid, teacherName) {
    const g = G(); if (!g) return false;
    const obs = observationOf(pid);
    if (!obs) return false;
    const p = (g.data.plants || []).find(x => x.id === pid);
    if (!p) return false;
    const desc = (p.description || 'a plant').toLowerCase();
    const who = teacherName || 'someone';
    const whoPoss = teacherName ? `${who}'s` : "the teacher's";
    const lines = [
      `The ${desc} — THAT's what ${who} was describing. ${p.name}. It clicks like a key turning.`,
      `You see it again in your mind: ${desc}. ${whoPoss} words land on the memory like a label. ${p.name}. Of course.`,
      `${p.name}. The ${desc} you've been looking at for days finally has a name, and now you'll never unsee it.`,
      `You've crouched over ${desc} a dozen times without a word for it. ${who} says ${p.name} like it was obvious. Now it is.`,
      `All those nameless lookings — ${desc}, ${desc} again — resolve at once. ${p.name}. Your memory rearranges itself around the word.`,
      `${p.name}. The ${desc} finally has a name, and the name has a taste and a smell attached now. ${who} taught you more than a word.`,
    ];
    g.say(`\u{1F4A1} ` + lines[Math.floor(Math.random() * lines.length)]);
    // RECOGNITION HAS TEETH: examined-first identification starts deeper.
    // You did the fieldwork — the lesson lands harder.
    try {
      const e = (g.state.codex.plants || {})[pid];
      if (e && obs.count >= 3 && e.level === 1) {
        // three+ observations = real familiarity: bonus encounter credit
        g.state.codex.encounters[pid] = 99;
      }
    } catch (err) {}
    return true;
  }

  // scrubName(text, name): remove EVERY mention of the species name from
  // gated text — leading, mid-string, any casing. The name is earned
  // knowledge; a description that says it anywhere teaches it for free.
  // (Data evolves — descriptions get edited by content workers who don't
  // know this rule. The scrub is the backstop, not the data.)
  function scrubName(text, name) {
    if (!text || !name) return text || '';
    const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return String(text).replace(new RegExp(esc, 'gi'), 'this plant');
  }

  // learnDifficulty(pid): how hard is this species for THIS character to
  // learn? Three inputs: regional familiarity (plant.regions vs the
  // character's origin tags — the same data game.js parseOrigin produces),
  // the species' idDifficulty, and the character's background (green
  // backgrounds read plants faster). Returns {tier, reason, homeGround}.
  // The reason is honest coaching — it tells the player WHY learning is
  // hard, never the answer. Blind but honest.
  function learnDifficulty(pid) {
    const g = G();
    const blank = { tier: 'even', reason: '', homeGround: false };
    if (!g) return blank;
    const p = (g.data.plants || []).find(x => x.id === pid);
    if (!p) return blank;
    let vp = {};
    try { vp = (g.vpOf && g.villagerId) ? (g.vpOf(g.villagerId) || {}) : {}; } catch (e) {}
    let tags = [];
    try {
      if (vp.originTags && vp.originTags.length) tags = vp.originTags;
      else if ((vp.homeRegion || vp.origin) && g.parseOrigin) {
        tags = (g.parseOrigin(vp.homeRegion || vp.origin).tags || []);
      } else if (g.state && g.state.scholar && g.state.scholar.originTags) {
        tags = g.state.scholar.originTags;
      }
    } catch (e) {}
    const tl = tags.map(t => String(t).toLowerCase());
    const regions = (p.regions || []).map(r => String(r).toLowerCase());
    const homeGround = tl.length > 0 && regions.some(r => tl.includes(r));
    let greenBg = false;
    try {
      const occ = String(vp.formerOccupation || '').toLowerCase();
      greenBg = /botanist|herbalist|forager|gardener|naturalist|ranger/.test(occ);
      if (!greenBg && g.abilityLevel) greenBg = (g.abilityLevel('green_thumb') || 0) >= 1;
    } catch (e) {}
    const idd = p.idDifficulty || 2;
    let score = 0;
    if (homeGround) score -= 1; else if (tl.length) score += 1; // foreign ground costs
    if (greenBg) score -= 1;
    score += (idd >= 3 ? 1 : idd <= 1 ? -1 : 0);
    const tier = score <= -1 ? 'easy' : score >= 2 ? 'hard' : 'even';
    let reason = '';
    if (tier === 'hard') {
      reason = tl.length
        ? `Nobody where you're from knew this plant — it'll take proper showing, not just telling.`
        : `This one's foreign to you — it'll take proper showing, not just telling.`;
    } else if (tier === 'easy') {
      reason = homeGround
        ? `This is home ground for you — things like this grew where you're from. You'll pick it up fast.`
        : `You've got the eye for this one — it won't take much.`;
    }
    return { tier, reason, homeGround, idd };
  }

  // teacherKnowsPlant(vid, pid): what the teacher actually knows. 0 = nothing,
  // 1 = named (village plantKnowledge mirror), 2 = deep (occupation or lived
  // familiarity). Teachers can't give what they don't have.
  function teacherKnowsPlant(vid, pid) {
    const g = G(); if (!g || !vid || !pid) return 0;
    try {
      if (g.villagerKnowsPlant) {
        const r = g.villagerKnowsPlant(vid, pid);
        if (r) return (r.level || 1) >= 2 ? 2 : 1;
      }
    } catch (e) {}
    try {
      const pk = ((g.state.village || {}).plantKnowledge || {})[vid] || [];
      if (pk.indexOf(pid) !== -1) return 1;
    } catch (e) {}
    return 0;
  }

  function teacherDepth(vid) {
    try { const g = G(); if (g && g.personDepth) return (g.personDepth(vid) || {}).level || 0; }
    catch (e) {}
    return 0;
  }

  function teacherIsGreen(vid) {
    try {
      const g = G();
      const vp = (g.vpOf && vid) ? (g.vpOf(vid) || {}) : {};
      return /botanist|herbalist|forager|gardener|naturalist/.test(String(vp.formerOccupation || '').toLowerCase());
    } catch (e) { return false; }
  }

  // teachQuality(teacherVid, pid, opts): 0-3. The teaching moment's quality.
  //   0 — they don't know it either. Nothing to teach.
  //   1 — poor: hearsay, second-hand, or a teacher who barely knows it.
  //   2 — decent: they know it and tell you straight. Name only.
  //   3 — good: they know it DEEP, they trust you enough to take the time,
  //       and there's a specimen in hand (opts.shown — the haven-haul
  //       moment). Shown properly, not just told.
  // opts.hearsay caps at 1: a rumor never lands deep, however well told.
  function teachQuality(teacherVid, pid, opts) {
    const g = G(); if (!g || !teacherVid || !pid) return 0;
    opts = opts || {};
    const tk = teacherKnowsPlant(teacherVid, pid);
    if (tk <= 0) return 0;
    let q = 1;
    if (tk >= 2 || teacherIsGreen(teacherVid)) q += 1; // they know it deep
    if (opts.shown) q += 1;                            // specimen in hand
    if (teacherDepth(teacherVid) >= 2) q += 1;          // they'll take the time
    q = Math.min(3, q);
    if (opts.hearsay) q = Math.min(1, q);
    return q;
  }

  function teacherName(vid) {
    const g = G();
    try { if (g.personFirst) { const n = g.personFirst(vid); if (n && n !== 'them') return n; } } catch (e) {}
    try { if (g.displayName) return g.displayName(vid); } catch (e) {}
    return 'your teacher';
  }

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const TEACH_GOOD = [
    (p, t) => `${t} doesn't just tell you — they put it in your hand. "Rub it. Smell. Now — tiny taste, corner of the leaf, not a bite." ${p.name}. Taught properly, it sticks like a burr.`,
    (p, t) => `"Watch," ${t} says, and goes through the parts one by one — what's food, what's medicine, what's trouble. ${p.name}. You'll never unsee it now.`,
    (p, t) => `${t} makes you do it yourself: pick it, break it, smell the break. "${p.name}." Their hands correct yours twice. The third time, you get it right.`,
    (p, t) => `No lecture. ${t} cooks a little of it right there — this part raw, that part boiled — and talks while your mouth learns. ${p.name}. The lesson has a flavor now.`,
  ];
  const TEACH_OK = [
    (p, t) => `"That's ${p.name}," ${t} says, pointing. No specimen, no tasting — just the name, tossed over like a coin. You'll have to handle it yourself to learn the rest.`,
    (p, t) => `${t} names it for you — ${p.name} — the way you'd name a street in passing. The name's yours now. The rest you'll earn in the field.`,
    (p, t) => `${p.name}. ${t} tells you straight and moves on. A solid naming, nothing more — the plant still has secrets.`,
  ];
  const TEACH_POOR = [
    (p, t) => `"${p.name}, I think. Somebody said." ${t} shrugs. That's the whole lesson: a name with no weight behind it. Take it with salt until your own hands confirm it.`,
    (p, t) => `You get the name third-hand: ${p.name}. It arrives like gossip — possibly true, certainly thin. You'll believe it when you've seen it growing yourself.`,
    (p, t) => `${t} half-remembers: "${p.name}? Something like that." The name lands crooked. You'll need a better teacher — or the plant itself — to straighten it.`,
  ];
  const TEACH_FAIL = [
    (p, t, reason) => `${t} tries to describe it, and the words slide right off. ${reason} Some things can't be told; they have to be shown.`,
    (p, t, reason) => `It doesn't stick. ${reason} You nod politely and retain nothing. Next time: bring the plant, not the story.`,
    (p, t, reason) => `"It's... green? With — you'll know it when —" ${t} gives up. ${reason} A specimen in hand would change everything.`,
  ];
  const TEACH_DEEPEN = [
    (p, t) => `"You know the name," ${t} says. "Now learn the parts." They show you what you were missing — slowly, properly.`,
    (p, t) => `${t} watches you handle the ${p.name} and corrects your grip. "Like this. Now you actually know it."`,
  ];
  const TEACH_REFRESHER = [
    (p, t) => `${t} starts to teach you ${p.name} and stops — you already know this one. You compare notes instead, and both of you learn a little.`,
  ];

  // teachPlant(pid, teacherVid, opts): THE teaching moment. The haven-haul
  // beat — someone shows you a plant they brought home — calls in here.
  // opts: {shown: bool (specimen in hand), hearsay: bool (second-hand)}.
  // Applies knowledge through Game.identifyPlant when available (falls back
  // to a direct codex write for standalone use), then narrates the beat.
  // Returns {taught, quality, level, reason}.
  function teachPlant(pid, teacherVid, opts) {
    const g = G();
    const out = { taught: false, quality: 0, level: 0, reason: '' };
    if (!g) return out;
    opts = opts || {};
    const p = (g.data.plants || []).find(x => x.id === pid);
    if (!p) { out.reason = 'no such plant'; return out; }
    const q = teachQuality(teacherVid, pid, opts);
    out.quality = q;
    const t = teacherName(teacherVid);
    const diff = learnDifficulty(pid);
    const known = g.plantKnown ? g.plantKnown(pid) : false;

    // They don't know it either — honest, not silent.
    if (q <= 0) {
      g.say(`${t} doesn't know that one either — you'd both be guessing.`);
      out.reason = 'teacher does not know it';
      return out;
    }

    // Already known: teaching deepens instead of naming.
    if (known) {
      const lvl = g.plantLevel ? g.plantLevel(pid) : 1;
      out.level = lvl;
      if (lvl < 2 && q >= 2) {
        try {
          g.state.codex.plants[pid].level = 2;
          out.level = 2; out.taught = true; out.deepened = true;
          g.say(pick(TEACH_DEEPEN)(p, t));
          const kl2 = (p.knowledgeLevels || {})['2'];
          if (kl2) g.say(`\u{1F4A1} Deeper: ${p.name} — ${kl2}`);
        } catch (e) { out.taught = true; }
      } else {
        out.taught = true;
        g.say(pick(TEACH_REFRESHER)(p, t));
      }
      return out;
    }

    // Poor teaching of a foreign plant: it doesn't stick. This is the
    // "shown, not told" law made visible — the game tells you WHY and what
    // would work, instead of silently granting half-knowledge.
    if (q <= 1 && diff.tier === 'hard' && !opts.shown) {
      g.say(pick(TEACH_FAIL)(p, t, diff.reason));
      out.reason = 'did not stick — needs showing, not telling';
      return out;
    }

    // Apply: the name is earned now.
    const applyIdentify = () => {
      if (g.identifyPlant) return g.identifyPlant(pid, opts.hearsay ? 'hearsay' : 'taught', t);
      try {
        g.state.codex = g.state.codex || {};
        g.state.codex.plants = g.state.codex.plants || {};
        g.state.codex.plants[pid] = {
          identifiedDay: (g.state.scholar || {}).day || 0, level: 1,
          harvests: 0, tastings: 0, by: opts.hearsay ? 'hearsay' : 'taught',
        };
        return true;
      } catch (e) { return false; }
    };
    if (!applyIdentify()) { out.reason = 'identify failed'; return out; }

    if (q >= 3) {
      // GOOD TEACHING, SHOWN PROPERLY: the lesson lands deep — uses
      // unlocked now, not three harvests from now.
      try {
        g.state.codex.plants[pid].level = 2;
        out.level = 2;
      } catch (e) { out.level = 1; }
      g.say(pick(TEACH_GOOD)(p, t));
      const kl2 = (p.knowledgeLevels || {})['2'];
      if (kl2) g.say(`\u{1F4A1} ${p.name} — ${kl2}`);
      out.taught = true;
    } else if (q === 2) {
      g.say(pick(TEACH_OK)(p, t));
      out.taught = true; out.level = 1;
    } else {
      g.say(pick(TEACH_POOR)(p, t));
      out.taught = true; out.level = 1; out.hearsay = true;
    }
    return out;
  }

  // plantVisualDepth(pid): 0 = unknown (generic), 1 = examined (category),
  // 2 = known (specific). Drives sprite depth + grid glyphs.
  function plantVisualDepth(pid) {
    const g = G(); if (!g || !pid) return 0;
    if (g.plantKnown && g.plantKnown(pid)) return 2;
    if (observedPlant(pid)) return 1;
    return 0;
  }

  S.Examine = {
    observePlant, observationOf, observedPlant,
    examineQuality, examineDescription, resolveCellSpecies,
    examinePlantCell, recognitionBeat, plantVisualDepth,
    scrubName, learnDifficulty, teachQuality, teachPlant,
  };

  // Game.teachPlant: alias so game.js beats call Game.teachPlant(pid, vid,
  // opts) without reaching through the Scattering namespace.
  try {
    const gg = G();
    if (gg && !gg.teachPlant) gg.teachPlant = function (pid2, vid2, opts2) { return teachPlant(pid2, vid2, opts2); };
  } catch (e) {}
})(globalThis);
