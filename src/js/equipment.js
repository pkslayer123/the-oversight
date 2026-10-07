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
// rules:
//   - one_per_body_slot: each main slot holds exactly one item; full sets occupy all five body slots via the torso key with fullSet flag (code: autoEquip, Steve 2026-10-06)
//   - set_vs_pieces_arc: riot set (30) beats early junk (~17) but loses to optimized pieces (~57); coordination bonus (+2/piece) rewards fitted gear (code: coordinationBonus, compareSetVsPieces, Steve 2026-10-06)
//   - equip_from_inventory: equipment comes from the person's own items, never conjured (code: autoEquip, Steve 2026-10-06)
//   - personality_flavor: showoffs pick flashy, pragmatists pick practical, cautious picks defensive (code: equipScore, Steve 2026-10-06)
//   - threat_is_diegetic: threat reads from visible gear, not UI chrome (code: threatLevel, Steve 2026-10-06)
//   - head_is_fun: head slot takes anything — a camp pot is a valid helmet (code: equipScore, Steve 2026-10-06)
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

  function gearDescription(v) {
    const eq = (v && v.equipped) || {};
    const parts = [];
    if (eq.weapon) parts.push(`wielding ${eq.weapon.name}`);
    if (eq.torso && eq.torso.fullSet) parts.push(`head-to-toe in ${eq.torso.name}`);
    else {
      if (eq.torso) parts.push(`wearing ${eq.torso.name}`);
      const others = ['head', 'legs', 'hands', 'feet'].filter(s => eq[s]).map(s => eq[s].name);
      if (others.length) parts.push(others.join(', '));
    }
    const misc = MISC_SLOTS.filter(s => eq[s]).map(s => eq[s].name);
    if (misc.length) parts.push(`carrying ${misc.join(', ')}`);
    if (!parts.length) return 'carrying nothing threatening';
    return parts.join('; ');
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
    migrateEquipment,
  };
})();
