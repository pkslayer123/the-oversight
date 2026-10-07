// @ontology
// system: equipment
// description: Villagers and the player wear and equip items across body-part slots (head, torso, legs, hands, feet, weapon — one item each) plus misc trinket slots. Full-set items (riot gear) cover all body slots at once: strong and simple early, outpaced by optimized individual pieces mid-late game. AI equips intelligently with personality flavor. Equipped gear renders on sprites and affects combat. Threat is readable at grid distance from the gear itself.
// provides:
//   - autoEquip(v, itemDefs) -> equip best gear (set-vs-pieces decision + personality)
//   - slotForItem(def) -> main slot for an item, or null
//   - isFullSet(itemId) -> boolean
//   - equipScore(itemId, slot, personality, itemDefs) -> numeric score
//   - armorOf(v, itemDefs) -> total protection (pieces + coordination, or set)
//   - coordinationBonus(v) -> +2 per fitted piece beyond the first
//   - compareSetVsPieces(v, itemDefs) -> { setTotal, piecesTotal, winner } for UI
//   - weaponBonusOf(v, itemDefs) -> melee bonus from equipped weapon
//   - threatLevel(v, itemDefs) -> 0-3: unarmed, carrying, armored, dangerous
//   - threatLabel(level) -> readable label
//   - gearDescription(v) -> prose for examine/person card
//   - migrateEquipment(person) -> old-save migration (armor -> torso)
//   - weaponKind(def) -> spear|blade|axe|bow|blunt|other render hint
//   - armorTier(protection) -> light|medium|heavy render hint
//   - headKind(def) -> pot|cap|helmet|other render hint
//   - wearOf(entry)/wearWord(entry)/applyWear(entry,n)/mendWear(entry,n)/isFragile(entry) -> condition arc (cosmetic, never silently nerfs stats)
//   - addProvenance(entry,prov)/provenancePhrase(entry) -> maker/event/place tags (unique-person law: gear has history)
//   - inspectPiece(entry,def,knowledge)/inspectGear(v,itemDefs,knowledge) -> knowledge-gated gear inspection, blind-but-honest
//   - gearWord(entry)/gearStory(entry,knowledge)/gearDescriptionK(v,knowledge) -> prose weaving wear + story
//   - swapCost(slot,context)/midCombatSwapText(slot) -> named, honest swap costs
//   - threatNote(v,itemDefs) -> wear-honesty note beside threatLabel
//   - toolKind(def)/toolFellsTrees(kind)/toolForagesWood(kind) -> data-layer tool-gating hooks for game.js/app.js
//   - improvDef(improvId)/improvVerdict(improvId,know)/pickImprovTool(job,know)/improvWearMult(kind) -> honest improvised tools (sharp rock, sturdy stick, bone shard, flint flake); blind-but-honest discovery
//   - toolKnowName(level)/toolProfileOf(def)/toolUsesText(def)/toolKnowledgeText(def,level) -> per-item tool knowledge: name -> uses -> technique -> maintenance; UI reveals only what is earned
//   - earnToolKnowledge(itemId,level,how)/techniqueFactor(def,level) -> knowledge earned by use/watch/teach; technique speeds work and says so
//   - toolTimeFactor(entry,def,know)/toolConditionText(entry,def,know) -> dull tools are slower and say so; condition costs TIME, never stats
//   - snapRisk(entry)/trySnap(entry,rng) -> cracked handles can snap, always telegraphed, never a surprise
//   - mendText(entry,def,toolKnow) -> repair know-how gated on maintenance knowledge; improv tools are replaced, not mended
//   - lendTool(entry,lender,borrower)/borrowUnasked(entry,taker,owner)/markObserved(entry,witness)/returnTool(entry) -> tools as social objects; theft allowed, observed, remembered
//   - toolSocialText(entry)/toolHistory(entry) -> readable social state + carried history (weaves into provenance)
//   - missingToolOptions(action,have,know,biomeName) -> honest options when the ideal tool is missing: improvise / borrow / go-without, each with named costs
//   - IMPROV_TOOLS -> data table: the four honest improvised tools
//   - TOOL_KNOW_LEVELS -> data table: tool knowledge level names (stranger/named/uses/technique/maintenance)
// rules:
//   - one_per_body_slot: each main slot holds exactly one item; full sets occupy all five body slots via the torso key with fullSet flag (code: autoEquip, Steve 2026-10-06)
//   - set_vs_pieces_arc: riot set (30) beats early junk (~17) but loses to optimized pieces (~57); coordination bonus (+2/piece) rewards fitted gear (code: coordinationBonus, compareSetVsPieces, Steve 2026-10-06)
//   - equip_from_inventory: equipment comes from the person's own items, never conjured (code: autoEquip, Steve 2026-10-06)
//   - personality_flavor: showoffs pick flashy, pragmatists pick practical, cautious picks defensive (code: equipScore, Steve 2026-10-06)
//   - threat_is_diegetic: threat reads from visible gear, not UI chrome (code: threatLevel, Steve 2026-10-06)
//   - head_is_fun: head slot takes anything — a camp pot is a valid helmet (code: equipScore, Steve 2026-10-06)
//   - wear_is_readable: wear stages readable at a glance (pristine/worn/battered/patched/makeshift), woven into gearDescription; wear is cosmetic honesty and NEVER a silent stat nerf — armorOf/weaponBonusOf untouched (code: wearWord, gearDescriptionK, Steve 2026-10-05)
//   - gear_has_history: equipped entries may carry maker/event/place tags; descriptions weave them once knowledge is earned (code: addProvenance, gearStory, Steve 2026-10-05)
//   - blind_inspection_is_honest: knowledge 0 shows condition and admits the unread history; maker at 1, full story at 2 (code: inspectPiece, Steve 2026-10-05)
//   - swap_costs_named: mid-combat swaps cost an action and say so; explore/haven costs named too (code: swapCost, Steve 2026-10-05)
//   - tool_gating_data_layer: axe fells, pruning saw forages branches but never fells large trees; hand saw works but slow; game.js/app.js wire the hooks (code: toolKind, toolFellsTrees, Steve 2026-10-04)
//   - improv_is_honest: improvised tools name their deficits and are never silently equal to real tools; blind discovery admits not knowing; improv wears 2x (code: improvVerdict, pickImprovTool, improvWearMult, Steve 2026-10-07)
//   - tool_knowledge_earned: tool knowledge is earned per item: name -> uses -> technique -> maintenance; technique only by use, maintenance only by teaching; UI reveals only what is earned (code: toolKnowledgeText, earnToolKnowledge, Steve 2026-10-07)
//   - condition_costs_time: a dull tool is slower and says so; wear costs TIME, never stats — armorOf/weaponBonusOf untouched (code: toolTimeFactor, Steve 2026-10-07)
//   - snap_is_telegraphed: only cracked/fragile tools can snap; the crack is always announced before it can happen (code: snapRisk, trySnap, Steve 2026-10-07)
//   - mend_gated: repair know-how needs maintenance knowledge; improvised tools are replaced, not mended (code: mendText, Steve 2026-10-07)
//   - tools_are_social: lending builds bond; taking unasked is allowed, observable, and remembered; social history weaves into provenance (code: lendTool, borrowUnasked, markObserved, returnTool, Steve 2026-10-07)
//   - scarcity_is_honest: when the ideal tool is missing the game offers improvise / borrow / go-without, each with named costs; non-viable options say why instead of pretending (code: missingToolOptions, Steve 2026-10-07)
// consumes:
//   - Game.data.items (weapon/armor definitions)
//   - state.scholar.equipped (player equipment)

(function () {
  'use strict';
  const S = window.S = window.S || {};

  // Main body-part slots: ONE item each. Weapon is a main slot too.
  const MAIN_SLOTS = ['head', 'torso', 'legs', 'hands', 'feet', 'weapon'];
  // Misc slots: trinkets, charms — multiples fine.
  const MISC_SLOTS = ['misc1', 'misc2', 'misc3'];
  const BODY_SLOTS = ['head', 'torso', 'legs', 'hands', 'feet'];

  // Slot mapping by item ID. Kept HERE (not in items.json) to avoid
  // conflicts with the hot data tree. New items default via name heuristics.
  const SLOT_BY_ID = {
    knit_cap: 'head',
    camo_jacket: 'torso', bark_armor: 'torso', leather_jacket: 'torso',
    military_vest: 'torso', padded_cloth: 'torso', hide_armor: 'torso',
    swat_vest: 'torso', rain_poncho: 'torso', flannel_shirt: 'torso',
    denim_jacket: 'torso', rain_shell: 'torso',
    canvas_pants: 'legs',
    work_gloves: 'hands',
    good_boots: 'feet', wool_socks: 'feet', running_shoes: 'feet',
  };

  // Full-set items: ONE item covering ALL body slots at once.
  // Strong and simple early game; outpaced by optimized pieces later.
  const FULL_SETS = {
    riot_gear: { slots: ['head', 'torso', 'legs', 'hands', 'feet'], label: 'riot gear' },
  };

  function isFullSet(itemId) { return !!FULL_SETS[itemId]; }
  function fullSetSlots(itemId) { return (FULL_SETS[itemId] || {}).slots || []; }

  // Render hints — so sprites don't need item-data access.
  function weaponKind(def) {
    const n = String((def && def.name) || '').toLowerCase();
    const id = String((def && def.id) || '').toLowerCase();
    const s = n + ' ' + id;
    if (/spear|pike|staff|pole/.test(s)) return 'spear';
    if (/bow|sling/.test(s)) return 'bow';
    if (/axe|hatchet|machete/.test(s)) return 'axe';
    if (/knife|blade|sword|dagger|machete/.test(s)) return 'blade';
    if (/club|bat|hammer|mace|wrench|pipe/.test(s)) return 'blunt';
    return 'other';
  }
  function armorTier(protection) {
    if (protection >= 25) return 'heavy';
    if (protection >= 10) return 'medium';
    return 'light';
  }
  function headKind(def) {
    const n = String((def && def.name) || '').toLowerCase();
    if (/pot|bucket|pan|bowl|colander/.test(n)) return 'pot';
    if (/helmet|hard hat/.test(n)) return 'helmet';
    if (/cap|hat|hood|bandana/.test(n)) return 'cap';
    return 'other';
  }

  // Which main slot does this item want? null = not equipable to a main slot.
  function slotForItem(def) {
    if (!def) return null;
    if (def.class === 'weapon' && def.weapon) return 'weapon';
    if (FULL_SETS[def.id]) return 'torso'; // full sets anchor on torso with fullSet flag
    if (SLOT_BY_ID[def.id]) return SLOT_BY_ID[def.id];
    if (def.armor) {
      const n = String(def.name || '').toLowerCase();
      if (/cap|hat|hood|helmet|bandana|pot|bucket/.test(n)) return 'head';
      if (/pant|trouser|legging|skirt/.test(n)) return 'legs';
      if (/glove|mitt/.test(n)) return 'hands';
      if (/boot|shoe|sandal|socks?/.test(n)) return 'feet';
      return 'torso';
    }
    return null;
  }

  function defOf(itemDefs, itemId) {
    if (!itemDefs || !itemId) return null;
    return itemDefs.find(i => i.id === itemId) || null;
  }

  function itemIdOf(entry) {
    if (!entry) return null;
    if (typeof entry === 'string') return entry;
    return entry.itemId || entry.id || null;
  }

  // Score an item for a slot. Higher = better pick.
  function equipScore(itemId, slot, personality, itemDefs) {
    const def = defOf(itemDefs, itemId);
    if (!def) return -1;
    const temp = (personality && personality.temperament) || 'steady';
    const sharing = (personality && personality.sharing) || 'balanced';
    let score = 0;

    if (slot === 'weapon') {
      if (def.class !== 'weapon' || !def.weapon) return -1;
      score = (def.weapon.bonus || 0) * 10;
      if (temp === 'bold' || temp === 'fierce') score += (def.weapon.bonus || 0) * 3;
      if (sharing === 'showoff') score += (def.bondThresholds ? 15 : 0);
      if (def.weapon.range > 1) score += 5;
    } else if (BODY_SLOTS.includes(slot)) {
      if (!def.armor && slot !== 'head') return -1;
      if (slot === 'head' && !def.armor) {
        score = 2;
        const n = String(def.name || '').toLowerCase();
        if (/pot|bucket|pan|bowl|colander|helmet/.test(n)) score += 25;
        if (/cap|hat|hood|bandana/.test(n)) score += 15;
        if (temp === 'playful' || sharing === 'showoff') score += 10;
        if (temp === 'stern' || temp === 'stoic') score -= 8;
        return score;
      }
      score = (def.armor.protection || 0) * 10;
      if (temp === 'cautious' || temp === 'anxious') score += (def.armor.protection || 0) * 5;
      if (sharing === 'pragmatic') score += 3;
      if (FULL_SETS[def.id]) score += 20;
    }
    return score;
  }

  // Coordination bonus: fitted individual pieces work together.
  // +2 per body-slot piece beyond the first. Full sets get none.
  function coordinationBonus(v) {
    const eq = (v && v.equipped) || {};
    if (eq.torso && eq.torso.fullSet) return 0;
    let n = 0;
    for (const s of BODY_SLOTS) if (eq[s]) n++;
    return n > 1 ? (n - 1) * 2 : 0;
  }

  function armorOf(v, itemDefs) {
    const eq = (v && v.equipped) || {};
    if (eq.torso && eq.torso.fullSet) {
      const def = defOf(itemDefs, eq.torso.itemId);
      return (def && def.armor && def.armor.protection) || 0;
    }
    let total = 0;
    for (const s of BODY_SLOTS) {
      const e = eq[s];
      if (!e) continue;
      const def = defOf(itemDefs, e.itemId);
      if (def && def.armor) total += def.armor.protection || 0;
    }
    return total + coordinationBonus(v);
  }

  function weaponBonusOf(v, itemDefs) {
    const w = v && v.equipped && v.equipped.weapon;
    if (!w) return 0;
    const def = defOf(itemDefs, w.itemId);
    return (def && def.weapon && def.weapon.bonus) || 0;
  }

  // Set-vs-pieces comparison for the UI crossover moment.
  function compareSetVsPieces(v, itemDefs) {
    const ids = (v.items || []).map(itemIdOf).filter(Boolean);
    let bestSet = null, setTotal = 0;
    for (const id of ids) {
      if (!FULL_SETS[id]) continue;
      const def = defOf(itemDefs, id);
      const prot = (def && def.armor && def.armor.protection) || 0;
      if (prot > setTotal) { setTotal = prot; bestSet = id; }
    }
    let piecesTotal = 0;
    for (const slot of BODY_SLOTS) {
      let best = 0;
      for (const id of ids) {
        if (FULL_SETS[id]) continue;
        const def = defOf(itemDefs, id);
        if (!def || !def.armor) continue;
        if (slotForItem(def) !== slot) continue;
        best = Math.max(best, def.armor.protection || 0);
      }
      piecesTotal += best;
    }
    const pieceCount = BODY_SLOTS.filter(s => {
      return ids.some(id => { const d = defOf(itemDefs, id); return d && d.armor && slotForItem(d) === s && !FULL_SETS[id]; });
    }).length;
    if (pieceCount > 1) piecesTotal += (pieceCount - 1) * 2;

    let winner = 'none';
    if (bestSet && piecesTotal > 0) winner = piecesTotal > setTotal ? 'pieces' : 'set';
    else if (bestSet) winner = 'set';
    else if (piecesTotal > 0) winner = 'pieces';
    return { setTotal, piecesTotal, setId: bestSet, winner };
  }

  // Auto-equip from inventory. Personality shapes the set-vs-pieces call.
  function autoEquip(v, itemDefs) {
    if (!v) return {};
    const personality = v.personality || {};
    const temp = personality.temperament || 'steady';
    const sharing = personality.sharing || 'balanced';
    const equipped = {};
    const used = new Set();
    const ids = (v.items || []).map(itemIdOf).filter(Boolean);

    let bestW = null, bestWS = -1;
    for (const id of ids) {
      const s = equipScore(id, 'weapon', personality, itemDefs);
      if (s > bestWS) { bestWS = s; bestW = id; }
    }
    if (bestW && bestWS > 0) {
      const def = defOf(itemDefs, bestW);
      equipped.weapon = { itemId: bestW, name: def.name, wkind: weaponKind(def) };
      used.add(bestW);
    }

    const cmp = compareSetVsPieces(v, itemDefs);
    let useSet = false;
    if (cmp.setId) {
      if (sharing === 'showoff' && cmp.winner === 'set' && cmp.piecesTotal >= cmp.setTotal * 0.8) {
        useSet = false;
      } else {
        useSet = cmp.winner === 'set';
      }
      if ((temp === 'stern' || sharing === 'pragmatic') && cmp.setTotal >= cmp.piecesTotal * 0.9) useSet = true;
    }
    if (useSet && cmp.setId) {
      const def = defOf(itemDefs, cmp.setId);
      equipped.torso = { itemId: cmp.setId, name: def.name, fullSet: true,
        armorTier: armorTier((def.armor || {}).protection || 0) };
      used.add(cmp.setId);
    } else {
      for (const slot of BODY_SLOTS) {
        let best = null, bestS = -1;
        for (const id of ids) {
          if (used.has(id)) continue;
          const def = defOf(itemDefs, id);
          if (!def) continue;
          const wantSlot = slotForItem(def);
          if (slot === 'head') {
            if (wantSlot && wantSlot !== 'head') continue;
          } else if (wantSlot !== slot) continue;
          const s = equipScore(id, slot, personality, itemDefs);
          if (s > bestS) { bestS = s; best = id; }
        }
        if (best && bestS > 0) {
          const def = defOf(itemDefs, best);
          const entry = { itemId: best, name: def.name };
          if (def.armor) entry.armorTier = armorTier(def.armor.protection || 0);
          if (slot === 'head') entry.headKind = headKind(def);
          equipped[slot] = entry;
          used.add(best);
        }
      }
    }

    const miscPool = ids.filter(id => {
      if (used.has(id)) return false;
      const def = defOf(itemDefs, id);
      if (!def) return false;
      if (def.class === 'weapon') return false;
      if (def.armor) return false;
      return true;
    });
    miscPool.sort((a, b) => {
      const da = defOf(itemDefs, a), db = defOf(itemDefs, b);
      const ba = (da.bondThresholds || []).length, bb = (db.bondThresholds || []).length;
      return bb - ba;
    });
    MISC_SLOTS.forEach((slot, i) => {
      if (miscPool[i]) {
        const def = defOf(itemDefs, miscPool[i]);
        equipped[slot] = { itemId: miscPool[i], name: def.name };
      }
    });

    v.equipped = equipped;
    return equipped;
  }

  function threatLevel(v, itemDefs) {
    const wb = weaponBonusOf(v, itemDefs);
    const ar = armorOf(v, itemDefs);
    const eq = (v && v.equipped) || {};
    const fullSet = eq.torso && eq.torso.fullSet;
    if (fullSet || (wb >= 20 && ar >= 25)) return 3;
    if (wb > 0 && ar > 0) return 2;
    if (wb > 0) return 1;
    return 0;
  }

  function threatLabel(level) {
    return ['unarmed', 'carrying', 'armored', 'dangerous'][level] || 'unarmed';
  }

  // ---- Wear, provenance, inspection, friction, tool-gating (Steve 2026-10-05) ----
  //
  // WIRING POINTS FOR game.js / app.js (both sibling-owned — do NOT implement here):
  //   - applyWear(entry, n): call after combat (weapon +2 per fight, armor +1 per hit
  //     taken), after fell/forage use (tool +1 per use), and after hard travel.
  //   - mendWear(entry, n): call from repair/mend actions at haven.
  //   - inspectGear(v, itemDefs, knowledgeFn): wire into the examine / person-card UI
  //     behind the existing knowledge gate ("if you don't know, it doesn't show").
  //     knowledgeFn(entry, def) -> 0|1|2; pass a plain number for a fixed level.
  //   - gearDescriptionK(v, knowledge): person-card prose with story woven in when earned.
  //   - swapCost(slot, 'combat'): wire into the swap UI; spend via the existing
  //     combat-action mechanism (spendCombatAction). The cost is NAMED, never silent.
  //   - toolFellsTrees(toolKind(def)) / toolForagesWood(toolKind(def)): wire into the
  //     fell-tree / forage-branch action gating. def.toolKind overrides heuristics.
  //   - threatNote(v, itemDefs): show beside threatLabel when wear flatters the rating.

  // Condition arc: 0 = factory fresh, 100 = held together by hope.
  // Wear is COSMETIC HONESTY: it never touches armorOf/weaponBonusOf. A battered
  // vest protects exactly what its stats say — the player just SEES the battering.
  const WEAR_STAGES = [
    { max: 10, word: 'pristine' },
    { max: 35, word: 'worn' },
    { max: 65, word: 'battered' },
    { max: 90, word: 'patched' },
    { max: 101, word: 'makeshift' },
  ];

  function wearOf(entry) {
    const w = entry && typeof entry.wear === 'number' ? entry.wear : 0;
    if (w < 0) return 0;
    if (w > 100) return 100;
    return w;
  }

  function wearWord(entry) {
    const w = wearOf(entry);
    for (const st of WEAR_STAGES) if (w < st.max) return st.word;
    return 'makeshift';
  }

  // Returns the new wear word so callers can narrate the change ("it's getting battered").
  function applyWear(entry, amount) {
    if (!entry || typeof entry !== 'object') return wearWord(entry);
    entry.wear = wearOf(entry) + (amount || 0);
    if (entry.wear >= 100) { entry.wear = 100; entry.fragile = true; }
    return wearWord(entry);
  }

  function mendWear(entry, amount) {
    if (!entry || typeof entry !== 'object') return wearWord(entry);
    entry.wear = Math.max(0, wearOf(entry) - (amount || 0));
    if (entry.wear < 100) delete entry.fragile;
    return wearWord(entry);
  }

  function isFragile(entry) {
    return !!(entry && (entry.fragile || wearOf(entry) >= 100));
  }

  // Provenance: gear has history (unique-person law). prov = { maker, event, place }.
  function addProvenance(entry, prov) {
    if (!entry || typeof entry !== 'object') return entry;
    entry.prov = Object.assign({}, entry.prov, prov);
    return entry;
  }

  function provenancePhrase(entry, knowledge) {
    const p = (entry && entry.prov) || {};
    const k = knowledge | 0;
    const bits = [];
    if (k >= 1 && p.maker) bits.push(`made by ${p.maker}`);
    if (k >= 2) {
      if (p.event) bits.push(`carried through ${p.event}`);
      if (p.place) bits.push(`from ${p.place}`);
    }
    return bits.join(', ');
  }

  // A piece's display name with wear woven in. Pristine gear reads EXACTLY as
  // before — wear only ever ADDS words, so old saves render identically.
  function gearWord(entry) {
    if (!entry || !entry.name) return 'gear';
    const w = wearWord(entry);
    let s = w === 'pristine' ? entry.name : `${w} ${entry.name}`;
    if (isFragile(entry)) s += ' (held together by hope)';
    return s;
  }

  // Story woven into description prose, knowledge-gated. Default knowledge 0:
  // "if you don't know, it doesn't show."
  function gearStory(entry, knowledge) {
    const ph = provenancePhrase(entry, knowledge | 0);
    return ph ? ` — ${ph}` : '';
  }

  function gearDescriptionK(v, knowledge) {
    const eq = (v && v.equipped) || {};
    const k = knowledge | 0;
    const parts = [];
    if (eq.weapon) parts.push(`wielding ${gearWord(eq.weapon)}${gearStory(eq.weapon, k)}`);
    if (eq.torso && eq.torso.fullSet) parts.push(`head-to-toe in ${gearWord(eq.torso)}${gearStory(eq.torso, k)}`);
    else {
      if (eq.torso) parts.push(`wearing ${gearWord(eq.torso)}${gearStory(eq.torso, k)}`);
      const others = ['head', 'legs', 'hands', 'feet'].filter(s => eq[s])
        .map(s => gearWord(eq[s]) + gearStory(eq[s], k));
      if (others.length) parts.push(others.join(', '));
    }
    const misc = MISC_SLOTS.filter(s => eq[s]).map(s => gearWord(eq[s]) + gearStory(eq[s], k));
    if (misc.length) parts.push(`carrying ${misc.join(', ')}`);
    if (!parts.length) return 'carrying nothing threatening';
    return parts.join('; ');
  }

  // Knowledge-gated inspection of one piece. Condition is ALWAYS visible —
  // you can see battering. Maker/story only with earned knowledge. Blind is honest.
  function inspectPiece(entry, def, know) {
    const name = (entry && entry.name) || (def && def.name) || 'gear';
    const w = wearWord(entry);
    const p = (entry && entry.prov) || {};
    const k = (typeof know === 'function' ? know(entry, def) : know) | 0;
    const parts = [`${name}: ${w}.`];
    if (p.maker || p.event || p.place) {
      if (k <= 0) {
        parts.push(`You can see it's ${w}, but you can't read its history — the maker, the story, all of it. Someone who knows gear would tell you.`);
      } else {
        if (p.maker) parts.push(`Made by ${p.maker}.`);
        if (k >= 2) {
          if (p.event) parts.push(`Carried through ${p.event}.`);
          if (p.place) parts.push(`From ${p.place}.`);
        } else if (p.event || p.place) {
          parts.push(`There's more story in it you haven't earned yet.`);
        }
      }
    }
    if (isFragile(entry)) parts.push(`It will not survive much more of this.`);
    return parts.join(' ');
  }

  function inspectGear(v, itemDefs, know) {
    const eq = (v && v.equipped) || {};
    const out = [];
    for (const s of MAIN_SLOTS.concat(MISC_SLOTS)) {
      if (!eq[s]) continue;
      out.push({ slot: s, text: inspectPiece(eq[s], defOf(itemDefs, itemIdOf(eq[s])), know) });
    }
    return out;
  }

  // Equip friction: swapping gear costs are VISIBLE and HONEST. context:
  // 'combat' | 'explore' | 'haven'. The mid-combat cost is NAMED, never silent.
  function swapCost(slot, context) {
    if (context === 'combat') return {
      actionCost: true,
      timeText: 'your action',
      text: `Swapping ${slot} mid-fight costs your action — no free hands in a fight.`,
    };
    if (context === 'explore') return {
      actionCost: false,
      timeText: 'a few minutes',
      text: `Swapping ${slot} out here takes a few minutes of fumbling.`,
    };
    return {
      actionCost: false,
      timeText: 'none',
      text: `Swapping ${slot} at haven costs nothing but a moment.`,
    };
  }

  function midCombatSwapText(slot) {
    return swapCost(slot, 'combat').text;
  }

  // Wear-honesty note to show BESIDE threatLabel (threatLabel itself unchanged):
  // worn gear can make the label flatter the person.
  function threatNote(v, itemDefs) {
    const eq = (v && v.equipped) || {};
    const battered = BODY_SLOTS.concat(['weapon'])
      .filter(s => eq[s] && wearOf(eq[s]) >= 65);
    if (!battered.length) return '';
    const names = battered.map(s => eq[s].name).join(', ');
    return `The threat label flatters them — ${names} ${battered.length === 1 ? 'is' : 'are'} barely holding together.`;
  }

  // ---- Tool-gating data layer ----
  // Tool-gated actions resolve through the equipped tool. def.toolKind (when set
  // in item data) wins; otherwise name/id heuristics. Design: an axe fells a tree;
  // a pruning saw forages branches but NEVER fells a large tree; a hand saw works
  // on trees but it's a big job ('slow').
  const TOOL_FAMILIES = ['felling-axe', 'hand-saw', 'pruning-saw', 'machete', 'knife', 'shovel', 'club',
    'improv-edge', 'improv-club', 'improv-dig', 'none'];

  function toolKind(def) {
    if (!def) return 'none';
    if (def.toolKind && TOOL_FAMILIES.includes(def.toolKind)) return def.toolKind;
    // Improvised tools declare themselves (def.improvId) or read by name.
    // IMPROV_TOOLS is declared below; this runs at call time, after init.
    if (def.improvId && IMPROV_TOOLS[def.improvId]) return IMPROV_TOOLS[def.improvId].kind;
    const n = String(def.name || '').toLowerCase();
    const id = String(def.id || '').toLowerCase();
    const s = n + ' ' + id;
    if (/sharp rock|flint|knapped stone/.test(s)) return 'improv-edge';
    if (/bone shard|splintered bone/.test(s)) return 'improv-edge';
    if (/sturdy stick|stout branch|stout stick/.test(s)) return 'improv-club';
    if (/pruning saw|pruner|lopper/.test(s)) return 'pruning-saw';
    if (/axe|hatchet/.test(s)) return 'felling-axe';
    if (/saw/.test(s)) return 'hand-saw';
    if (/machete/.test(s)) return 'machete';
    if (/knife|dagger/.test(s)) return 'knife';
    if (/shovel|spade/.test(s)) return 'shovel';
    if (/club|bat|hammer|mace|wrench|pipe/.test(s)) return 'club';
    return 'none';
  }

  // true = can fell, 'slow' = can but it's a big job, false = honest no.
  function toolFellsTrees(kind) {
    if (kind === 'felling-axe') return true;
    if (kind === 'hand-saw') return 'slow';
    return false;
  }

  function toolForagesWood(kind) {
    return ['pruning-saw', 'felling-axe', 'hand-saw', 'machete', 'improv-edge'].includes(kind);
  }

  // Honest one-line verdict for action gating UI, e.g. "A pruning saw can't fell
  // a big tree — it forages branches."
  function toolVerdict(def, action) {
    const kind = toolKind(def);
    const name = (def && def.name) || 'this tool';
    if (action === 'fell') {
      const r = toolFellsTrees(kind);
      if (r === true) return `${name} can fell it.`;
      if (r === 'slow') return `${name} can fell it, but it's a big job — slow going.`;
      if (kind === 'pruning-saw') return `${name} can't fell a big tree — it forages branches.`;
      return `${name} isn't the tool for felling.`;
    }
    if (action === 'forage-wood') {
      return toolForagesWood(kind)
        ? `${name} works for gathering wood.`
        : `${name} isn't the tool for gathering wood.`;
    }
    return `${name}: no verdict for ${action}.`;
  }

  // ---- Improvised tools, tool knowledge, condition beats, social tools, scarcity (Steve 2026-10-07) ----
  //
  // WIRING POINTS FOR game.js / app.js (both sibling-owned — do NOT implement here):
  //   - improvWearMult(toolKind(def)): multiply the applyWear amount for tool use.
  //     Improvised tools wear twice as fast, and say so.
  //   - techniqueFactor(def, toolKnowLevel): multiply the action's time cost by
  //     this (0.8 once technique is earned). The speed-up is NAMED in
  //     toolKnowledgeText, never silent.
  //   - toolTimeFactor(entry, def, know): multiply the action's time cost by
  //     factor; show notes[] to the player so the slowdown is explained, never
  //     silent. know is a level 0-4 or a knowledge fn.
  //   - trySnap(entry, rng): call after a tool use when snapRisk(entry) is
  //     'cracked' or 'critical'. On snapped:true the tool broke (entry.broken);
  //     narrate text and offer the mend/replace path via mendText.
  //   - lendTool / borrowUnasked / markObserved / returnTool: call from the
  //     give/take/witness systems; toolSocialText(entry) renders the state.
  //   - missingToolOptions(action, have, know, biomeName): feed the action-gating
  //     UI when the ideal tool is missing; each option names its cost.
  //   - earnToolKnowledge(itemId, level, how): call with 'used' | 'watched' |
  //     'taught' from practice/observe/teach events; store the returned level
  //     per item on the knower.

  function capFirst(s) {
    s = String(s || '');
    return s ? s[0].toUpperCase() + s.slice(1) : s;
  }

  function isImprovKind(kind) {
    return kind === 'improv-edge' || kind === 'improv-club' || kind === 'improv-dig';
  }

  // ---- 1. Improvised tools ----
  //
  // Honest pre-tool options for the tool-less early game. NEVER silently equal
  // to the real thing: every improvised tool names its deficits out loud, wears
  // twice as fast, and an improv-edge will never fell a tree no matter how much
  // you believe in it.
  const IMPROV_TOOLS = {
    'sharp-rock': {
      id: 'sharp-rock', name: 'sharp rock', kind: 'improv-edge', replaces: 'knife',
      canDo: ['cut branches', 'skin small game', 'shave tinder'],
      cantDo: ['fell a tree', 'split wood', 'last a season'],
      deficits: ['duller than any real knife — cuts slower', 'chips as it works: wears twice as fast', 'one bad twist and the edge is gone'],
      techniqueTip: 'Short strokes, let the edge bite — it chips less when you stop forcing it.',
      mendTip: "You don't mend a sharp rock — you find another one. That is the whole maintenance manual.",
    },
    'sturdy-stick': {
      id: 'sturdy-stick', name: 'sturdy stick', kind: 'improv-club', replaces: 'club',
      canDo: ['prod and poke', 'dig shallow soil', 'drive small stakes'],
      cantDo: ['cut anything', 'split wood', 'survive a real fight intact'],
      deficits: ['flexes on impact — hits softer', 'can crack on a hard hit', 'no edge at all, obviously'],
      techniqueTip: "Thrust, don't swing wild — the stick survives longer when it lands straight.",
      mendTip: "You don't mend a stick — you find a straighter one.",
    },
    'bone-shard': {
      id: 'bone-shard', name: 'bone shard', kind: 'improv-edge', replaces: 'knife',
      canDo: ['scrape hides', 'cut soft plants', 'carve soft wood'],
      cantDo: ['fell a tree', 'pry anything', 'cut cordage cleanly'],
      deficits: ['splinters under sideways force', 'short — keeps your hands close to the work', 'wears twice as fast'],
      techniqueTip: 'Draw cuts only, never pry — sideways force is how bone splinters.',
      mendTip: "You don't mend bone — you butcher another meal.",
    },
    'flint-flake': {
      id: 'flint-flake', name: 'flint flake', kind: 'improv-edge', replaces: 'knife',
      canDo: ['cut cleanly — once or twice', 'skin game', 'strike sparks'],
      cantDo: ['lever or pry anything', 'fell a tree', 'forgive mistakes'],
      deficits: ['razor edge, glass heart — one bad twist snaps it', 'tiny grip, careful fingers', 'wears twice as fast'],
      techniqueTip: 'One confident draw cut. Hesitation snaps it.',
      mendTip: "You don't mend flint — you knapp another flake.",
    },
  };

  function improvDef(improvId) { return IMPROV_TOOLS[improvId] || null; }

  // Knowledge-gated discovery. know 0: blind but honest — the person admits they
  // don't know. know >= 1: the deficits are named, so the choice is informed.
  function improvVerdict(improvId, know) {
    const t = improvDef(improvId);
    if (!t) return 'That is not a tool anyone recognizes.';
    const k = know | 0;
    if (k <= 0) return `It's a ${t.name}. Might work. You'll find out — that's the honest truth of it.`;
    return `A ${t.name} stands in for a ${t.replaces}. ` +
      `It will: ${t.canDo.join('; ')}. It will not: ${t.cantDo.join('; ')}. ` +
      `The price: ${t.deficits.join('; ')}.`;
  }

  // Which improvised tool fits the job? Knowledge picks; ignorance admits it.
  // Returns { pick, blind, text }. A blind pick is null — the game never pretends
  // the ignorant person knew which one to grab.
  function pickImprovTool(job, know) {
    const k = know | 0;
    const table = {
      cut: 'sharp-rock', skin: 'sharp-rock', tinder: 'flint-flake',
      scrape: 'bone-shard', dig: 'sturdy-stick', hit: 'sturdy-stick',
    };
    if (k <= 0) {
      return { pick: null, blind: true,
        text: "You don't know which of these would help — a rock? a stick? Grab one and find out." };
    }
    const pick = table[job] || 'sharp-rock';
    const t = improvDef(pick);
    return { pick, blind: false,
      text: `For ${job}, reach for the ${t.name}. ${capFirst(t.techniqueTip)} ${improvVerdict(pick, k)}` };
  }

  // Improvised tools wear twice as fast. Wiring point for tool-use wear calls.
  function improvWearMult(kind) {
    return isImprovKind(kind) ? 2 : 1;
  }

  // ---- 2. Tool knowledge progression ----
  //
  // Knowing WHAT a tool can do is earned per item: name -> uses -> technique ->
  // maintenance. The UI reveals only what knowledge earns ("if you don't know,
  // it doesn't show"). Technique is earned by practice, never granted;
  // maintenance is learned by being taught.
  const TOOL_KNOW_LEVELS = ['stranger', 'named', 'uses', 'technique', 'maintenance'];

  function toolKnowName(level) {
    const k = Math.max(0, Math.min(4, level | 0));
    return TOOL_KNOW_LEVELS[k];
  }

  // The honest capability card of each real tool family: what it can do, what it
  // honestly cannot, and what it costs you to use it.
  const TOOL_PROFILES = {
    'felling-axe': {
      label: 'felling axe',
      canDo: ['fell a tree', 'split firewood', 'drive wedges'],
      cantDo: ['dig', 'do fine work', 'fit quietly in a pack'],
      deficits: ['heavy — you feel every swing by evening'],
      technique: 'Limb first, then read the lean and cut with it — your swings land where you mean them.',
      mend: 'File the edge back, oil it against rust, and re-wedge the head if it loosens.',
    },
    'hand-saw': {
      label: 'hand saw',
      canDo: ['fell a tree — slowly, honestly', 'cut planks', 'trim branches'],
      cantDo: ['split wood', 'work fast'],
      deficits: ['slow on big trees — it admits it'],
      technique: 'Long strokes, let the teeth do it — forcing it binds the blade.',
      mend: 'Set the teeth straight and oil the blade; a bound saw is a slow saw.',
    },
    'pruning-saw': {
      label: 'pruning saw',
      canDo: ['cut branches', 'clear brush', 'harvest poles'],
      cantDo: ['fell a big tree — never', 'split wood'],
      deficits: ['small by design — reach is short'],
      technique: 'Cut on the pull, steady rhythm — it eats branches.',
      mend: 'Clean sap off the teeth and keep it dry; it is a small precise thing.',
    },
    'machete': {
      label: 'machete',
      canDo: ['clear brush', 'cut branches', 'defend yourself'],
      cantDo: ['fell a big tree cleanly', 'do fine work'],
      deficits: ['no finesse — it is a long knife with opinions'],
      technique: 'Swing through, not at — the weight does the work.',
      mend: 'Hone the long edge; a machete lives or dies by its edge.',
    },
    'knife': {
      label: 'knife',
      canDo: ['cut cordage', 'skin game', 'carve', 'whittle'],
      cantDo: ['fell a tree', 'split wood', 'dig far'],
      deficits: ['not a wood tool, whatever you tell yourself'],
      technique: 'Cut away from yourself, sharp angle — the knife barely notices the work.',
      mend: 'Strop it little and often; a knife is its edge.',
    },
    'shovel': {
      label: 'shovel',
      canDo: ['dig', 'move earth', 'chop roots'],
      cantDo: ['cut wood', 'fell anything'],
      deficits: ['long and awkward to carry'],
      technique: 'Foot on the shoulder, lift with the legs — trenches happen.',
      mend: 'Keep the edge dressed and the handle tight; a loose shovel is a blister factory.',
    },
    'club': {
      label: 'club',
      canDo: ['hit things', 'drive stakes', 'look serious'],
      cantDo: ['cut anything', 'do anything delicate'],
      deficits: ['not a tool at all, really'],
      technique: 'Hips first — the club is just the period at the end of the sentence.',
      mend: 'Sand the splinters and bind the grip; clubs are simple and honest.',
    },
  };

  function toolProfileOf(def) {
    const kind = toolKind(def);
    return TOOL_PROFILES[kind] || null;
  }

  // The honest capability card for any tool def, improv or real.
  // { label, canDo, cantDo, deficits, technique, mend } or null for non-tools.
  function toolUsesText(def) {
    if (def && def.improvId && IMPROV_TOOLS[def.improvId]) {
      const t = IMPROV_TOOLS[def.improvId];
      return { label: t.name, canDo: t.canDo, cantDo: t.cantDo, deficits: t.deficits,
               technique: t.techniqueTip, mend: t.mendTip };
    }
    const p = toolProfileOf(def);
    if (!p) return null;
    return { label: p.label, canDo: p.canDo, cantDo: p.cantDo, deficits: p.deficits || [],
             technique: p.technique, mend: p.mend };
  }

  // Knowledge-gated tool description. Each level reveals strictly more; higher
  // levels are never leaked early.
  function toolKnowledgeText(def, level) {
    const k = Math.max(0, Math.min(4, level | 0));
    const name = (def && def.name) || 'this tool';
    if (k <= 0) return "An unfamiliar tool. You don't know its name, let alone its uses — and the game won't pretend otherwise.";
    if (k === 1) return `That's a ${name}. You know its name. Nothing more — yet.`;
    const u = toolUsesText(def);
    if (!u) return `That's a ${name}. You know its name. Nobody's shown you the rest.`;
    let s = `${capFirst(u.label)}: it can — ${u.canDo.join('; ')}. It cannot — honestly — ${u.cantDo.join('; ')}.`;
    if (u.deficits.length) s += ` The price: ${u.deficits.join('; ')}.`;
    if (k >= 3) s += ` Technique: ${u.technique} Your work with it goes faster, and you can feel why.`;
    if (k >= 4) s += ` Keeping it: ${u.mend}`;
    return s;
  }

  // How tool knowledge advances. 'used': practice, caps at technique (3) —
  // technique is earned, never granted. 'watched': caps at uses (2). 'taught':
  // good teaching unlocks fast, the only road to maintenance (4).
  // Returns { level, text } — the text narrates the gain honestly.
  function earnToolKnowledge(itemId, level, how) {
    const cur = Math.max(0, Math.min(4, level | 0));
    let next = cur, note = '';
    if (how === 'taught') {
      next = Math.min(4, cur + 2);
      note = 'Shown properly, it clicks — good teaching unlocks fast.';
    } else if (how === 'watched') {
      next = Math.min(2, cur + 1);
      note = 'Watching teaches the shape of it, not the feel.';
    } else if (how === 'used') {
      next = Math.min(3, cur + 1);
      note = 'Your hands learn what watching cannot — technique is earned, never granted.';
    } else {
      return { level: cur, text: 'Nothing learned from that.' };
    }
    if (next === cur) return { level: cur, text: 'Nothing new — you already know this much.' };
    return { level: next, text: `${note} ${capFirst(String(itemId))} knowledge: ${toolKnowName(next)}.` };
  }

  // Time multiplier for a tool action once technique is earned. NAMED in
  // toolKnowledgeText — never a silent speed-up. Non-tools and the untaught: 1.
  function techniqueFactor(def, level) {
    if ((level | 0) >= 3 && toolUsesText(def)) return 0.8;
    return 1;
  }

  // ---- 3. Wear with visible consequences ----
  //
  // Wear was cosmetic honesty; tools now also FEEL their condition. The rule
  // holds: condition costs TIME, never stats — armorOf/weaponBonusOf are
  // untouched. A dull axe is slower and says so. A cracked handle can snap —
  // telegraphed, never a surprise nerf.

  // { factor, notes[] }: multiply the tool action's time cost by factor, and SHOW
  // notes[] to the player. know 0-1 gets honest-but-unnamed ("something's off");
  // know 2+ gets the mechanism named. Tools only — armor/weapons keep the
  // cosmetic arc.
  function toolTimeFactor(entry, def, know) {
    const k = typeof know === 'function' ? (know(entry, def) | 0) : (know | 0);
    if (!toolUsesText(def)) return { factor: 1, notes: [] };
    const w = wearOf(entry);
    const notes = [];
    let factor = 1;
    if (w >= 90) {
      factor = 2;
      notes.push(k >= 2
        ? 'The edge is gone — every stroke drags. This will take twice as long, and you can feel why.'
        : "This is taking far longer than it should. Something's wrong with the tool — someone who knows tools could tell you what.");
    } else if (w >= 65) {
      factor = 1.5;
      notes.push(k >= 2
        ? 'The tool is dull — slower going, half again as long. Sharpen it when you can.'
        : 'Slower than it should be. The tool feels tired.');
    }
    const risk = snapRisk(entry);
    if (risk !== 'none') {
      notes.push(k >= 1
        ? 'The handle is cracked — one bad swing could snap it. You can see the crack; it is not hiding.'
        : "Something feels wrong in the handle. It might not survive this.");
    }
    return { factor, notes };
  }

  // Prose condition readout for the examine UI. Condition is always visible —
  // you can see battering — but the WHY is knowledge-gated.
  function toolConditionText(entry, def, know) {
    const name = (entry && entry.name) || (def && def.name) || 'the tool';
    const bits = [`${capFirst(name)}: ${wearWord(entry)}.`];
    const tf = toolTimeFactor(entry, def, know);
    for (const n of tf.notes) bits.push(n);
    return bits.join(' ');
  }

  // Snap risk: 'none' | 'cracked' | 'critical'. Only cracked+ tools can snap,
  // and the crack is always announced by toolConditionText/inspectPiece first.
  function snapRisk(entry) {
    const w = wearOf(entry);
    if (isFragile(entry) || w >= 100) return 'critical';
    if (w >= 90) return 'cracked';
    return 'none';
  }

  // Resolve one tool use against the snap risk. rng is injectable for tests;
  // defaults to Math.random. Returns { snapped, text }. A snap is never a
  // surprise: risk 'none' tools cannot snap, and cracked tools warned you.
  function trySnap(entry, rng) {
    const risk = snapRisk(entry);
    const roll = typeof rng === 'function' ? rng() : Math.random();
    const p = risk === 'critical' ? 0.25 : risk === 'cracked' ? 0.08 : 0;
    if (p > 0 && roll < p) {
      if (entry && typeof entry === 'object') { entry.broken = true; entry.wear = 100; entry.fragile = true; }
      return { snapped: true, text: 'The handle snaps clean through. You saw it coming — the crack was right there.' };
    }
    return { snapped: false,
      text: risk === 'none' ? 'It holds.' : 'It holds — this time. The crack is still there.' };
  }

  // Repair know-how, gated on maintenance knowledge (level 4). Below that the
  // game is honest: you'd be guessing. Improvised tools are never mended —
  // they're replaced, and the game says so.
  function mendText(entry, def, toolKnow) {
    const name = (entry && entry.name) || (def && def.name) || 'the tool';
    const k = toolKnow | 0;
    const kind = toolKind(def);
    if (isImprovKind(kind)) {
      return `You don't mend a ${name} — you find another one. That is the whole maintenance manual, and it's honest.`;
    }
    const u = toolUsesText(def);
    if (k >= 4 && u) return `You know how to bring it back: ${u.mend}`;
    if (k >= 4) return 'You know tools well enough to work this one back into shape with time and care.';
    return "You'd be guessing at the repair. Someone who knows tools — really knows them — could show you, and then you'd know.";
  }

  // ---- 4. Borrowed / lent tools as social objects ----
  //
  // Theft is allowed; it is also observable, and the game remembers. Lending
  // builds bond. Every social event is written into the tool's history, which
  // weaves into provenance — tools carry who held them.

  function toolSocialOf(entry) {
    if (entry && entry.social && typeof entry.social === 'object') return entry.social;
    return null;
  }

  function ensureSocial(entry) {
    if (!entry || typeof entry !== 'object') return null;
    if (!entry.social || typeof entry.social !== 'object') entry.social = { state: 'owned', history: [] };
    if (!Array.isArray(entry.social.history)) entry.social.history = [];
    return entry.social;
  }

  function pushToolHistory(entry, ev) {
    const s = ensureSocial(entry);
    if (s) s.history.push(ev);
    return entry;
  }

  // Lend a tool. Returns narration. The loan is recorded on the tool itself.
  function lendTool(entry, lender, borrower) {
    if (!entry || typeof entry !== 'object') return 'No tool to lend.';
    const s = ensureSocial(entry);
    s.state = 'lent'; s.from = lender; s.to = borrower; s.unasked = false;
    pushToolHistory(entry, `${lender} lent it to ${borrower}`);
    addProvenance(entry, { event: `lent to ${borrower}` });
    return `${lender} lends the ${entry.name || 'tool'} to ${borrower}. Borrowed tools come back — that's the deal everyone understands.`;
  }

  // Take a tool without asking. Allowed. Recorded. If anyone saw, they saw —
  // the social punishment is the village's business; equipment just tells the
  // truth. Returns { text, observed }.
  function borrowUnasked(entry, taker, owner) {
    if (!entry || typeof entry !== 'object') return { text: 'No tool to take.', observed: [] };
    const s = ensureSocial(entry);
    s.state = 'taken'; s.from = owner; s.to = taker; s.unasked = true; s.observedBy = [];
    pushToolHistory(entry, `${taker} took it from ${owner} without asking`);
    return { text: `${taker} takes the ${entry.name || 'tool'} without asking. Nobody has stopped them — yet. If anyone saw, they saw.`,
             observed: s.observedBy };
  }

  // Record a witness. Only meaningful for unasked takings.
  function markObserved(entry, witness) {
    const s = toolSocialOf(entry);
    if (!s || !s.unasked) return '';
    if (!s.observedBy.includes(witness)) s.observedBy.push(witness);
    return `${witness} saw.`;
  }

  // Bring a tool home. Returns narration; the history stays on the tool.
  function returnTool(entry) {
    const s = toolSocialOf(entry);
    if (!s || (s.state !== 'lent' && s.state !== 'taken')) return 'It was never out.';
    const who = s.to;
    const wasTaken = s.state === 'taken';
    pushToolHistory(entry, `${who} returned it`);
    addProvenance(entry, { event: `borrowed by ${who}, returned` });
    s.state = 'returned'; s.from = null; s.to = null; s.unasked = false;
    return wasTaken
      ? `${who} returns the ${entry.name || 'tool'}. Returning it doesn't un-take it — people remember.`
      : `${who} returns the ${entry.name || 'tool'}. Debts like this are how trust gets built.`;
  }

  // Readable social state for the examine UI. Empty string when nothing to say.
  function toolSocialText(entry) {
    const s = toolSocialOf(entry);
    if (!s || s.state === 'owned' || s.state === 'returned') return '';
    const name = (entry && entry.name) || 'tool';
    if (s.state === 'lent') return `On loan: ${s.from} lent the ${name} to ${s.to}.`;
    if (s.state === 'taken') {
      const seen = (s.observedBy && s.observedBy.length)
        ? ` ${s.observedBy.join(', ')} saw.`
        : ' Nobody saw — that anyone admits.';
      return `Taken, not borrowed: ${s.to} took the ${name} from ${s.from} without asking.${seen}`;
    }
    return '';
  }

  // The tool's carried social history, oldest first.
  function toolHistory(entry) {
    const s = toolSocialOf(entry);
    return (s && s.history.slice()) || [];
  }

  // ---- 5. Tool scarcity pressure ----
  //
  // The right tool isn't always available. When the ideal tool is missing, the
  // game offers honest options — improvise, borrow, go without — each with its
  // costs named. A non-viable option says WHY instead of pretending.
  // have = { kinds: [...] } — tool kinds the party can lay hands on right now.
  // Returns [] when the party already has what the action needs.
  function missingToolOptions(action, have, know, biomeName) {
    const kinds = (have && have.kinds) || [];
    const has = (k) => kinds.includes(k);
    const k = know | 0;
    const where = biomeName ? ` out here in the ${biomeName}` : '';
    const opts = [];
    const push = (id, label, cost, honestNote, viable) =>
      opts.push({ id, label, cost, honestNote, viable: !!viable });

    if (action === 'fell') {
      if (has('felling-axe') || has('hand-saw')) return [];
      push('improvise', 'Improvise a felling tool', '—',
        k >= 1
          ? 'Nothing improvises a fell. A sharp rock will not drop a big tree, and anyone who tells you otherwise is selling something.'
          : "You're not sure anything you could grab would drop this tree. You're right to hesitate.",
        false);
      push('borrow', 'Borrow an axe',
        'a social debt — they will remember',
        'Worth asking around. If nobody nearby has one to lend, this road is closed.',
        true);
      push('branches', 'Gather fallen branches instead',
        `more time, less wood — but honest work${where}`,
        'No axe needed. Hands and patience.',
        true);
      push('go-without', 'Leave the tree standing',
        'no wood today',
        'Sometimes the honest answer is not yet.',
        true);
    } else if (action === 'forage-wood') {
      if (['pruning-saw', 'felling-axe', 'hand-saw', 'machete', 'improv-edge'].some(has)) return [];
      push('improvise', 'Knapp a sharp rock',
        'twice the wear, slower cutting — and it says so',
        'A sharp rock cuts branches. It chips. That is the deal, stated up front.',
        true);
      push('hands', 'Break branches by hand',
        'slow, hard on the hands',
        'No tool at all. It works. It hurts. Both true.',
        true);
      push('go-without', 'Skip the wood run',
        'no wood today',
        'Sometimes the honest answer is not yet.',
        true);
    } else if (action === 'dig') {
      if (has('shovel') || has('improv-dig')) return [];
      push('improvise', 'Dig with a sturdy stick',
        'shallow only, twice the wear — and it says so',
        k >= 1
          ? 'A stick moves loose soil. It will not break ground a shovel would laugh at.'
          : "A stick might move some dirt. You don't know how far that goes.",
        true);
      push('borrow', 'Borrow a shovel',
        'a social debt — they will remember',
        'Worth asking around.',
        true);
      push('go-without', 'Leave the ground unbroken',
        'no digging today',
        'Sometimes the honest answer is not yet.',
        true);
    } else {
      push('go-without', 'Do without', '—', 'No honest options for this yet.', true);
    }
    return opts;
  }

  function gearDescription(v) {
    return gearDescriptionK(v, 0);
  }

  function migrateEquipment(person) {
    if (!person) return;
    const eq = person.equipped;
    if (!eq) return;
    if (eq.armor && !eq.torso) {
      eq.torso = eq.armor;
      delete eq.armor;
    }
  }

  S.equipment = {
    MAIN_SLOTS, MISC_SLOTS, BODY_SLOTS,
    isFullSet, fullSetSlots, slotForItem,
    weaponKind, armorTier, headKind,
    equipScore, coordinationBonus, armorOf, weaponBonusOf,
    compareSetVsPieces, autoEquip,
    threatLevel, threatLabel, gearDescription,
    wearOf, wearWord, applyWear, mendWear, isFragile,
    addProvenance, provenancePhrase,
    gearWord, gearStory, gearDescriptionK,
    inspectPiece, inspectGear,
    swapCost, midCombatSwapText, threatNote,
    toolKind, toolFellsTrees, toolForagesWood, toolVerdict,
    IMPROV_TOOLS, TOOL_KNOW_LEVELS,
    improvDef, improvVerdict, pickImprovTool, improvWearMult,
    toolKnowName, toolProfileOf, toolUsesText, toolKnowledgeText,
    earnToolKnowledge, techniqueFactor,
    toolTimeFactor, toolConditionText, snapRisk, trySnap, mendText,
    lendTool, borrowUnasked, markObserved, returnTool, toolSocialText, toolHistory,
    missingToolOptions,
    migrateEquipment,
  };
})();
