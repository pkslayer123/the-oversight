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
// rules:
//   - examine_never_names: examine output never contains the species name unless plantKnown (code: examineDescription, Steve 2026-10-06)
//   - examine_is_cheap: examine costs time + tiny kcal, never harvests (code: examinePlantCell, Steve 2026-10-06)
//   - observation_precedes_recognition: identifyPlant on an observed species fires the recognition beat (code: recognitionBeat, Steve 2026-10-06)
//   - quality_varies: botanist/herbalist/green_thumb deepen the vague description (code: examineQuality, Steve 2026-10-06)
//   - forage_also_observes: harvesting records an observation too — handling teaches (code: observePlant via doAction, Steve 2026-10-06)
// consumes:
//   - state.codex.observations
//   - state.codex.plants (plantKnown)
//   - Game.data.plants (description, taxon, seasons, tileAffinity, lookalikeNote)
//   - state.map cell species (plantSpecies/bushSpecies/tree per tile)
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
    let desc = p.description || 'a plant';
    // strip any accidental name leak: description should never start with the name
    if (desc.toLowerCase().indexOf(p.name.toLowerCase()) === 0) {
      desc = desc.slice(p.name.length).replace(/^[\s.:—-]+/, '');
      if (!desc) desc = 'a plant';
    }
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
        // SPECIES-NAME SCRUB (examine_never_names; break-it knowledge
        // 2026-10-08): the old scrub only replaced the examined plant's full
        // name. Notes also leak the plant's own FIRST name-word ("Shagbark
        // hickory is the sweet one", "Thorns + tendrils = greenbrier") and
        // OTHER species' names or first words ("young hickory sprouts" =
        // Hickory Nuts) — true names the player hasn't earned. Scrub the
        // examined plant's full name and first name-word (>=6 chars) with
        // 'it', and any other UNKNOWN species' full name / first name-word
        // with 'a lookalike'. Species the player KNOWS keep their names —
        // earned knowledge isn't censored.
        const escRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const firstWord = n => String(n || '').split(/[\s-]+/)[0] || '';
        let note = String(p.lookalikeNote).split('.')[0];
        note = note.replace(new RegExp(escRe(p.name), 'gi'), 'it');
        if (firstWord(p.name).length >= 6) {
          note = note.replace(new RegExp('\\b' + escRe(firstWord(p.name)) + '\\b', 'gi'), 'it');
        }
        try {
          for (const o of (g.data.plants || [])) {
            if (!o || o.id === pid || !o.name) continue;
            if (g.plantKnown && g.plantKnown(o.id)) continue;
            note = note.replace(new RegExp('\\b' + escRe(o.name) + '\\b', 'gi'), 'a lookalike');
            if (firstWord(o.name).length >= 6) {
              note = note.replace(new RegExp('\\b' + escRe(firstWord(o.name)) + '\\b', 'gi'), 'a lookalike');
            }
          }
        } catch (e2) {}
        const nm = p.name.toLowerCase();
        // replace name mentions with "it" (case-insensitive)
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
    // DESCRIPTIONS CARRY THEIR OWN ARTICLE ("a tree with compound leaves…")
    // — strip it where the template supplies "The". (forager loop
    // 2026-10-08: "The a tree…" read aloud at the campfire. Same bug class
    // as the 2026-10-07 "This a tree" fix.)
    const descNoArt = desc.replace(/^(a|an|the)\s+/, '');
    const who = teacherName || 'someone';
    const whoPoss = teacherName ? `${who}'s` : "the teacher's";
    const lines = [
      `The ${descNoArt} — THAT's what ${who} was describing. ${p.name}. It clicks like a key turning.`,
      `You see it again in your mind: ${desc}. ${whoPoss} words land on the memory like a label. ${p.name}. Of course.`,
      `${p.name}. The ${descNoArt} you've been looking at for days finally has a name, and now you'll never unsee it.`,
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
  };
})(globalThis);
