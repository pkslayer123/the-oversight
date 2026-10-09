// @ontology
// system: equipment
// description: Explicit gear slot system. Weapons: melee (1), ranged (1). Body: head, torso, legs, hands, shoes (1 each). Accessories: 4 non-exclusive slots for anything that doesn't fit a body part. Full-body sets (riot gear) equip to torso and block head/legs/shoes (greyed out in UI); hands and accessories stay usable. Sentimental gear has assigned slots like everything else and only accrues bond while EQUIPPED. AI equips intelligently with personality flavor. Equipped gear renders on sprites and affects combat. Threat is readable at grid distance from the gear itself.
// provides:
//   - autoEquip(v, itemDefs) -> equip best gear (set-vs-pieces decision + personality)
//   - slotForItem(def) -> main slot for an item, or null
//   - isFullSet(itemId, def) -> boolean
//   - blockedSlots(equipped) -> slots blocked by full-body gear (for UI grey-out)
//   - slotLabel(slot) -> display name
//   - equipScore(itemId, slot, personality, itemDefs) -> numeric score
//   - armorOf(v, itemDefs) -> total protection (pieces + coordination, or set)
//   - coordinationBonus(v) -> +2 per fitted piece beyond the first
//   - compareSetVsPieces(v, itemDefs) -> { setTotal, piecesTotal, winner } for UI
//   - weaponBonusOf(v, itemDefs, slot) -> weapon bonus from equipped melee/ranged
//   - meleeWeaponOf(v, itemDefs) / rangedWeaponOf(v, itemDefs) -> equipped weapon entries
//   - threatLevel(v, itemDefs) -> 0-3: unarmed, carrying, armored, dangerous
//   - threatLabel(level) -> readable label
//   - gearDescription(v) -> prose for examine/person card
//   - migrateEquipment(person) -> old-save migration (armor->torso, weapon->melee, feet->shoes, misc->acc)
//   - weaponKind(def) -> spear|blade|axe|bow|blunt|other render hint
//   - isRangedWeapon(def) -> boolean (range > 1 or bow/sling)
//   - armorTier(protection) -> light|medium|heavy render hint
//   - headKind(def) -> pot|cap|helmet|other render hint
//   - isAccessory(def) -> boolean (fits no main slot)
// rules:
//   - namespace_bridge: published to window.S AND global.Scattering (code: bridge below, 2026-10-09 — game.js consumes Scattering; window.S-only publish silently disabled autoEquip everywhere).
//   - explicit_slots: melee, ranged, head, torso, legs, hands, shoes (1 each) + acc1-4 (non-exclusive). Every equipable item has exactly one assigned slot (code: slotForItem, Steve 2026-10-07)
//   - weapon_split: range > 1 or bow/sling -> ranged slot; everything else -> melee (code: isRangedWeapon, slotForItem, Steve 2026-10-07)
//   - full_body_blocks: full-body sets (def.fullBody or FULL_SETS) equip to torso and block head/legs/shoes only — hands and accessories stay usable. Blocked slots grey out in UI (code: blockedSlots, Steve 2026-10-07)
//   - sentimental_slots: sentimental gear has assigned slots like all other gear; bond accrues ONLY while equipped (code: SENTIMENTAL_SLOTS, Steve 2026-10-07)
//   - one_per_slot: each main slot holds exactly one item (code: autoEquip, Steve 2026-10-06)
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

  // GEAR SLOTS (Steve 2026-10-07): explicit slot system.
  // Weapons: melee (1), ranged (1). Body: head, torso, legs, hands, shoes (1 each).
  // Accessories: 4 non-exclusive slots for anything that doesn't fit a body part.
  const MELEE_SLOT = 'melee';
  const RANGED_SLOT = 'ranged';
  const BODY_SLOTS = ['head', 'torso', 'legs', 'hands', 'shoes'];
  const ACC_SLOTS = ['acc1', 'acc2', 'acc3', 'acc4'];
  const MAIN_SLOTS = ['melee', 'ranged', 'head', 'torso', 'legs', 'hands', 'shoes'];
  const ALL_SLOTS = MAIN_SLOTS.concat(ACC_SLOTS);
  // Slots a full-body set blocks when equipped on torso.
  // Hands stay free (gloves over riot gear is fine); accessories always work.
  const FULL_BODY_BLOCKED = ['head', 'legs', 'shoes'];
  // Legacy slot names -> current (save migration).
  const SLOT_ALIASES = { weapon: 'melee', feet: 'shoes', misc1: 'acc1', misc2: 'acc2', misc3: 'acc3', armor: 'torso' };

  const SLOT_LABELS = {
    melee: 'Melee weapon', ranged: 'Ranged weapon',
    head: 'Headgear', torso: 'Torso', legs: 'Legs', hands: 'Hands', shoes: 'Shoes',
    acc1: 'Accessory', acc2: 'Accessory', acc3: 'Accessory', acc4: 'Accessory',
  };
  function slotLabel(slot) { return SLOT_LABELS[slot] || slot; }

  // Slot mapping by item ID. Kept HERE (not in items.json) to avoid
  // conflicts with the hot data tree. New items default via name heuristics.
  // def.slot on the item definition wins over this map.
  const SLOT_BY_ID = {
    knit_cap: 'head',
    camo_jacket: 'torso', bark_armor: 'torso', leather_jacket: 'torso',
    military_vest: 'torso', padded_cloth: 'torso', hide_armor: 'torso',
    swat_vest: 'torso', rain_poncho: 'torso', flannel_shirt: 'torso',
    denim_jacket: 'torso', rain_shell: 'torso',
    canvas_pants: 'legs',
    work_gloves: 'hands',
    good_boots: 'shoes', wool_socks: 'shoes', running_shoes: 'shoes',
    alien_boots: 'shoes',
    alien_helm: 'head',
    alien_carapace: 'torso',
    alien_greaves: 'legs',
    alien_gauntlets: 'hands',
    // SENTIMENTAL GEAR (Steve 2026-10-07): assigned slots like all other gear.
    // Most keepsakes are accessories; garments map to body slots.
    reading_glasses: 'head', dispatchers_headset: 'head',
    hoodie: 'torso',
    spare_socks: 'shoes', boot_stone: 'shoes',
  };

  // Full-set items: equip to torso, block head/legs/shoes.
  // Data flag def.fullBody === true also works (preferred for new items).
  const FULL_SETS = {
    riot_gear: { slots: ['head', 'torso', 'legs', 'shoes'], label: 'riot gear' },
  };

  function isFullSet(itemId, def) {
    if (def && def.fullBody) return true;
    return !!FULL_SETS[itemId];
  }
  function fullSetSlots(itemId, def) {
    if (FULL_SETS[itemId]) return FULL_SETS[itemId].slots;
    if (def && def.fullBody) return ['head', 'torso', 'legs', 'shoes'];
    return [];
  }
  // blockedSlots: which slots are currently blocked by full-body gear.
  // For UI grey-out. Takes the equipped map.
  function blockedSlots(equipped) {
    const eq = equipped || {};
    const torso = eq.torso;
    if (!torso || !torso.itemId) return [];
    let def = null;
    try {
      const items = (typeof Game !== 'undefined' && Game.data && Game.data.items) || [];
      for (let i = 0; i < items.length; i++) if (items[i].id === torso.itemId) { def = items[i]; break; }
    } catch (e) {}
    if (!isFullSet(torso.itemId, def)) return [];
    return FULL_BODY_BLOCKED.slice();
  }
  function isSlotBlocked(slot, equipped) {
    return blockedSlots(equipped).indexOf(slot) !== -1;
  }

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
  // isRangedWeapon: range > 1 or bow/sling in the name. Everything else is melee.
  function isRangedWeapon(def) {
    if (!def || !def.weapon) return false;
    if (def.class !== 'weapon' && def.class !== 'sentimental') return false;
    if ((def.weapon.range || 1) > 1) return true;
    const s = String(def.name || '').toLowerCase() + ' ' + String(def.id || '').toLowerCase();
    return /bow|sling|rifle|pistol|crossbow/.test(s);
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

  // Which slot does this item want? null = accessory candidate (not a main slot).
  // Priority: def.slot (explicit) > weapon split > full-body > SLOT_BY_ID >
  // sentimental assignment > armor heuristics > null.
  function slotForItem(def) {
    if (!def) return null;
    if (def.slot && ALL_SLOTS.indexOf(def.slot) !== -1) return def.slot;
    if (def.weapon && (def.class === 'weapon' || def.class === 'sentimental')) {
      return isRangedWeapon(def) ? RANGED_SLOT : MELEE_SLOT;
    }
    if (isFullSet(def.id, def)) return 'torso'; // full sets anchor on torso
    if (SLOT_BY_ID[def.id]) return SLOT_BY_ID[def.id];
    if (def.armor) {
      const n = String(def.name || '').toLowerCase();
      if (/cap|hat|hood|helmet|bandana|pot|bucket/.test(n)) return 'head';
      if (/pant|trouser|legging|skirt/.test(n)) return 'legs';
      if (/glove|mitt/.test(n)) return 'hands';
      if (/boot|shoe|sandal|socks?/.test(n)) return 'shoes';
      return 'torso';
    }
    return null;
  }
  // isAccessory: fits no main slot — goes in acc1-4.
  function isAccessory(def) {
    if (!def) return false;
    if (def.class === 'weapon') return false;
    if (def.armor) return false;
    if (isFullSet(def.id, def)) return false;
    return slotForItem(def) === null;
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

    if (slot === 'melee' || slot === 'ranged') {
      if (def.class !== 'weapon' || !def.weapon) return -1;
      const wantRanged = slot === 'ranged';
      if (isRangedWeapon(def) !== wantRanged) return -1;
      score = (def.weapon.bonus || 0) * 10;
      if (temp === 'bold' || temp === 'fierce') score += (def.weapon.bonus || 0) * 3;
      if (sharing === 'showoff') score += (def.bondThresholds ? 15 : 0);
      if (slot === 'ranged') score += 5; // ranged is versatile
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
      if (isFullSet(def.id, def)) score += 20;
    } else if (ACC_SLOTS.includes(slot)) {
      // Accessories: sentimental keepsakes score by bond depth; tools by utility.
      if (def.class === 'sentimental') score = 10 + (def.bondThresholds ? 10 : 0);
      else if (def.tool) score = 8;
      else score = 3;
      if (sharing === 'showoff' && def.class === 'sentimental') score += 12;
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

  function weaponBonusOf(v, itemDefs, slot) {
    const eq = (v && v.equipped) || {};
    const w = slot ? eq[slot] : (eq.melee || eq.weapon);
    if (!w) return 0;
    const def = defOf(itemDefs, w.itemId);
    return (def && def.weapon && def.weapon.bonus) || 0;
  }
  function meleeWeaponOf(v) {
    const eq = (v && v.equipped) || {};
    return eq.melee || eq.weapon || null;
  }
  function rangedWeaponOf(v) {
    const eq = (v && v.equipped) || {};
    return eq.ranged || null;
  }

  // Set-vs-pieces comparison for the UI crossover moment.
  function compareSetVsPieces(v, itemDefs) {
    const ids = (v.items || []).map(itemIdOf).filter(Boolean);
    let bestSet = null, setTotal = 0;
    for (const id of ids) {
      const def = defOf(itemDefs, id);
      if (!isFullSet(id, def)) continue;
      const prot = (def && def.armor && def.armor.protection) || 0;
      if (prot > setTotal) { setTotal = prot; bestSet = id; }
    }
    let piecesTotal = 0;
    for (const slot of BODY_SLOTS) {
      let best = 0;
      for (const id of ids) {
        const def = defOf(itemDefs, id);
        if (!def || !def.armor) continue;
        if (isFullSet(id, def)) continue;
        if (slotForItem(def) !== slot) continue;
        best = Math.max(best, def.armor.protection || 0);
      }
      piecesTotal += best;
    }
    const pieceCount = BODY_SLOTS.filter(s => {
      return ids.some(id => { const d = defOf(itemDefs, id); return d && d.armor && slotForItem(d) === s && !isFullSet(id, d); });
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

    // Weapons: best melee and best ranged independently.
    for (const wslot of ['melee', 'ranged']) {
      let bestW = null, bestWS = -1;
      for (const id of ids) {
        const s = equipScore(id, wslot, personality, itemDefs);
        if (s > bestWS) { bestWS = s; bestW = id; }
      }
      if (bestW && bestWS > 0) {
        const def = defOf(itemDefs, bestW);
        equipped[wslot] = { itemId: bestW, name: def.name, wkind: weaponKind(def) };
        used.add(bestW);
      }
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

    // Accessories: sentimental keepsakes and tools that fit no main slot.
    const accPool = ids.filter(id => {
      if (used.has(id)) return false;
      const def = defOf(itemDefs, id);
      if (!def) return false;
      return isAccessory(def) || slotForItem(def) === null;
    });
    // Also allow explicitly slotted accessories (def.slot in acc1-4).
    const slottedAcc = ids.filter(id => {
      if (used.has(id)) return false;
      const def = defOf(itemDefs, id);
      return def && def.slot && ACC_SLOTS.indexOf(def.slot) !== -1;
    });
    const pool = slottedAcc.concat(accPool.filter(id => slottedAcc.indexOf(id) === -1));
    pool.sort((a, b) => {
      const da = defOf(itemDefs, a), db = defOf(itemDefs, b);
      const ba = (da.bondThresholds || []).length, bb = (db.bondThresholds || []).length;
      return bb - ba;
    });
    ACC_SLOTS.forEach((slot, i) => {
      if (pool[i]) {
        const def = defOf(itemDefs, pool[i]);
        equipped[slot] = { itemId: pool[i], name: def.name };
        used.add(pool[i]);
      }
    });

    v.equipped = equipped;
    return equipped;
  }

  function threatLevel(v, itemDefs) {
    const wb = weaponBonusOf(v, itemDefs, 'melee') + weaponBonusOf(v, itemDefs, 'ranged');
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
    if (eq.melee) parts.push(`wielding ${eq.melee.name}`);
    else if (eq.weapon) parts.push(`wielding ${eq.weapon.name}`);
    if (eq.ranged) parts.push(`with ${eq.ranged.name} ready`);
    if (eq.torso && eq.torso.fullSet) parts.push(`head-to-toe in ${eq.torso.name}`);
    else {
      if (eq.torso) parts.push(`wearing ${eq.torso.name}`);
      const others = ['head', 'legs', 'hands', 'shoes'].filter(s => eq[s]).map(s => eq[s].name);
      if (others.length) parts.push(others.join(', '));
    }
    const acc = ACC_SLOTS.filter(s => eq[s]).map(s => eq[s].name);
    if (acc.length) parts.push(`carrying ${acc.join(', ')}`);
    if (!parts.length) return 'carrying nothing threatening';
    return parts.join('; ');
  }

  // migrateEquipment: old saves -> new slot system.
  // armor->torso, weapon->melee (or ranged if ranged), feet->shoes, misc1-3->acc1-4.
  function migrateEquipment(person) {
    if (!person) return;
    const eq = person.equipped;
    if (!eq) return;
    const move = (from, to) => { if (eq[from] && !eq[to]) { eq[to] = eq[from]; delete eq[from]; } };
    move('armor', 'torso');
    move('feet', 'shoes');
    move('misc1', 'acc1'); move('misc2', 'acc2'); move('misc3', 'acc3');
    if (eq.weapon && !eq.melee && !eq.ranged) {
      // Ranged weapons migrate to ranged; everything else to melee.
      let ranged = false;
      try {
        const items = (typeof Game !== 'undefined' && Game.data && Game.data.items) || [];
        const def = items.find(i => i.id === eq.weapon.itemId);
        if (def && ((def.weapon && def.weapon.range > 1) || /bow|sling/i.test(def.name || ''))) ranged = true;
      } catch (e) {}
      eq[ranged ? 'ranged' : 'melee'] = eq.weapon;
      delete eq.weapon;
    }
  }

  S.equipment = {
    MELEE_SLOT, RANGED_SLOT, BODY_SLOTS, ACC_SLOTS, MAIN_SLOTS, ALL_SLOTS,
    FULL_BODY_BLOCKED, SLOT_ALIASES,
    slotLabel, isFullSet, fullSetSlots, blockedSlots, isSlotBlocked,
    slotForItem, isAccessory, isRangedWeapon,
    weaponKind, armorTier, headKind,
    equipScore, coordinationBonus, armorOf, weaponBonusOf,
    meleeWeaponOf, rangedWeaponOf,
    compareSetVsPieces, autoEquip,
    threatLevel, threatLabel, gearDescription,
    migrateEquipment,
  };

  // NAMESPACE BRIDGE (2026-10-09): equipment.js published only to window.S,
  // but game.js and most systems consume global.Scattering — so
  // Scattering.equipment was undefined and every `if (S.equipment)` guard in
  // game.js silently skipped: autoEquip NEVER ran, and every villager fought
  // unarmed with a weapon in their pack. Publish to the canonical namespace
  // too. window.S keeps working for its existing consumers (app.js UI,
  // fieldFights).
  try {
    var _g2 = (typeof globalThis !== 'undefined') ? globalThis : window;
    _g2.Scattering = _g2.Scattering || {};
    _g2.Scattering.equipment = S.equipment;
  } catch (e) {}
})();
