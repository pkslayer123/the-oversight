// @ontology
// system: tools-stashes
// description: Tool prerequisites, raw materials, village stash ledger, personal caches. (Save/load lives in engine/state.js.)
// provides:
//   - MAT_DEFS (code: storage.js)
//   - hasToolItem(itemId)
//   - woodcutTier()
//   - canFell()
//   - canPrune()
//   - cutInfo()
//   - pruneBranches()
//   - gatherFallen()
//   - addMaterial(mat, n)
//   - spendMaterial(mat, n)
//   - takeMaterial(mat, n)
//   - materialCount(mat)
//   - donateMaterial(mat, n)
//   - donateTool(itemId)
//   - phoenixHonorDeposit(item): honored path for ashOf-tagged gear -- trust +8, honoring gossip (Steve 2026-10-09)
//   - takeTool(itemId)
//   - donateWeapon(idx) / takeWeapon(itemId) (armory section, Steve 2026-10-09)
//   - donateMedicine(idx) / takeMedicine(itemId) (pharmacy section, Steve 2026-10-09)
//   - isStashableWeapon(item), isMedicine(item) (section filters)
//   - isStashableTool(item)
//   - stashState()
//   - stashHtml()
//   - stashLog()
//   - stashLedgerText()
//   - _stashLedgers(vid)
//   - _stashItemLedgers(vid, section)
//   - _stashToolLedgers(vid)
//   - _stashItemGrant(vid, itemId, led)
//   - _stashTotalNet(vid)
//   - buryCache()
//   - digUpCache()
//   - takeFromCache(cacheId, itemIdx, qty)
//   - playerCaches()
//   - cachesHtml()
//   - cacheTheftChance()
//   - pickCacheRobber(village?)
//   - plantCacheTheftSuspicion(vid, c, village?)
//   - villageTrustLevel()
// rules:
//   - ash_gear_honored: depositing ashOf-tagged gear (from a phoenix ash-pile) at Haven honors the dead -- trust +8 + honoring gossip, gear enters village circulation; armor/misc have no deposit hook (no communal armor pile, canon) (code: phoenixHonorDeposit, Steve 2026-10-09)
//   - pharmacy_identity: stash entries keep medicine identity (medType, doses) and units -- a dosed bottle donated and returned comes back dosed and usable, never a brick; dosed medicine never merges in stacksMatch (dose pools are per-bottle) (code: _depositStashedItem, _takeStashedItem, stacksMatch, miser break-it 2026-10-10)
//   - no_midfight_storage: bury/dig/take-from-cache and all stash donate/take paths refuse mid-fight (tickAction no-ops in combat = free actions) and after death (code: buryCache, digUpCache, takeFromCache, donateMaterial, takeMaterial, donateTool, takeTool, _depositStashedItem, _takeStashedItem, miser break-it 2026-10-10)
//   - npc_consumes_honestly: NPC armory borrows take one unit (entry decremented); NPC pharmacy use spends one dose (entry spliced only at zero) (code: villagerGearUp, villagerHealCheck, miser break-it 2026-10-10)
// consumes:
//   - scholar.inventory
//   - state.codex
// ============ TOOLS, STASHES & CACHES ============
// Steve's rules, made mechanical:
//  1. Tool prerequisites: you can't fell a tree without an axe. A pruning
//     saw takes branches — it does NOT fell trunks. Actions hide when you
//     lack the tool; the world tells you what's missing, not a dead button.
//  2. Raw materials (branch, fiber, stone, wood log) are gathered and
//     stockpiled. Lightweight — foundation for future crafting, not a
//     crafting game.
//  3. Village stash at Haven: communal materials + spare tools, with a
//     ledger. In a good village nobody worries; in a bad village people
//     skim, hoard, and steal — and the ledger remembers.
//  4. Personal caches: bury goods, note the location in your Journal/Codex.
//     Anything unsecured can be found. Anything found can be taken.
//
// Self-attaching module: wraps Game.cutTree / Game.clearBrush /
// Game.npcBatchTurn, adds the rest. Load after truth.js, before app.js.

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;

  // woodcut tiers, low to high. Only 'fell' (axe-class) brings down a trunk.
  const TIER_RANK = { none: 0, whittle: 1, brush: 2, prune: 3, fell: 4 };

  const MAT_DEFS = {
    wood:   { name: 'Wood log',    plural: 'Wood logs',  kg: 2.0 },
    branch: { name: 'Branch',      plural: 'Branches',   kg: 0.5 },
    stone:  { name: 'Stone',       plural: 'Stones',     kg: 0.3 },
    fiber:  { name: 'Plant fiber', plural: 'Plant fiber', kg: 0.1 },
    // WATER FILTER CHAIN (2026-10-06): cloth/charcoal/container were recipe
    // materials with no obtainable source. Now: cloth weaves from fiber,
    // charcoal rakes from campfire ashes, containers are burned-hollow cups.
    cloth:     { name: 'Cloth',      plural: 'Cloth',       kg: 0.2 },
    charcoal:  { name: 'Charcoal',   plural: 'Charcoal',    kg: 0.3 },
    container: { name: 'Wooden cup', plural: 'Wooden cups', kg: 0.3 },
    // FORAGE-DROP materials: the sweep pushes these straight into the pack
    // (game.js). They need defs or donateMaterial/stash silently no-op.
    stick:  { name: 'Stick',       plural: 'Sticks',     kg: 0.2 },
    vine:   { name: 'Vine',        plural: 'Vines',      kg: 0.1 },
    // GEAR CRAFTING (Steve 2026-10-09): bark strips when gathering branches;
    // hide comes from butchered animals (corpse loot). Both feed the armor
    // recipes (bark_armor, hide_armor) through the one recipe system.
    bark:   { name: 'Bark strip',  plural: 'Bark strips', kg: 0.3 },
    hide:   { name: 'Rawhide',     plural: 'Rawhides',   kg: 1.0 },
  };
  const MAT_IDS = Object.keys(MAT_DEFS);
  // matName: 'branch' vs 'branches' — never 'branchs'.
  const matName = (mat, n) => {
    const d = MAT_DEFS[mat] || {};
    return String(n === 1 ? d.name : (d.plural || d.name)).toLowerCase();
  };

  const day = () => (Game.state.scholar || {}).day || 0;

  const methods = {

    // ---------- tools ----------
    // hasToolItem: is the item anywhere on you (inventory or equipped)?
    hasToolItem(itemId) {
      const s = this.state.scholar || {};
      const inv = s.inventory || [];
      if (inv.some(i => (i.itemId || i.id) === itemId)) return true;
      const eq = s.equipped || {};
      return Object.values(eq).some(e => e && (e.itemId || e.id) === itemId);
    },
    // woodcutTier: your best wood-cutting capability right now.
    // Reads the data-driven `tool.woodcut` tag in items.json.
    woodcutTier() {
      const s = this.state.scholar || {};
      const inv = s.inventory || [];
      let best = { tier: 'none', name: 'bare hands', itemId: null };
      const consider = (itemId, name) => {
        const def = (this.data.items || []).find(i => i.id === itemId);
        const t = def && def.tool && def.tool.woodcut;
        if (t && (TIER_RANK[t] || 0) > (TIER_RANK[best.tier] || 0)) {
          best = { tier: t, name: name || (def && def.name) || itemId, itemId };
        }
      };
      for (const i of inv) {
        const id = i.itemId || i.id;
        if (id) consider(id, i.name);
      }
      const eq = s.equipped || {};
      for (const e of Object.values(eq)) {
        if (e && (e.itemId || e.id)) consider(e.itemId || e.id, e.name);
      }
      return best;
    },
    // cutInfo: what can you do to this tree-like cell, and why not?
    // Used by the UI to hide impossible actions instead of showing dead buttons.
    cutInfo(cell) {
      const big = cell === 'bigtree';
      const t = this.woodcutTier();
      const rank = TIER_RANK[t.tier] || 0;
      const canFell = rank >= TIER_RANK.fell;
      const canPrune = rank >= TIER_RANK.prune;
      let hint = null;
      if (!canFell) {
        hint = t.tier === 'none'
          ? `You need an axe to fell this ${big ? 'giant' : 'tree'}.`
          : `Your ${t.name} can't fell ${big ? 'a giant' : 'this'} — it takes branches, not trunks. You need an axe.`;
      }
      return { canFell, canPrune, big, toolName: t.name, tier: t.tier, hint };
    },

    // ---------- materials ----------
    addMaterial(mat, n) {
      const def = MAT_DEFS[mat];
      n = Math.floor(n || 0);
      if (!def || n <= 0) return 0;
      const inv = this.state.scholar.inventory || (this.state.scholar.inventory = []);
      let e = inv.find(i => i.material === mat);
      if (e) e.units = (e.units || 0) + n;
      else inv.push({ material: mat, units: n, name: def.name, kcalEach: 0, spoilDay: 9999, kg: def.kg });
      return n;
    },
    materialCount(mat) {
      const inv = (this.state.scholar.inventory || []);
      // Steve 2026-10-06: old saves have wood without material field.
      // Check id/itemId as fallback for backward compatibility.
      return inv.filter(i => i.material === mat || i.id === mat || i.itemId === mat).reduce((t, i) => t + (i.units || 0), 0);
    },
    spendMaterial(mat, n) {
      let left = Math.floor(n || 0);
      if (left <= 0) return true;
      const inv = this.state.scholar.inventory || [];
      for (const item of inv) {
        // Steve 2026-10-06: backward compat for old saves (wood without material field)
        const isMat = item.material === mat || item.id === mat || item.itemId === mat;
        if (!isMat || left <= 0) continue;
        const take = Math.min(item.units || 0, left);
        item.units -= take; left -= take;
      }
      this.state.scholar.inventory = inv.filter(i => (i.units || 0) > 0 || !i.material);
      return left <= 0;
    },

    // ---------- woodcutting actions ----------
    // pruneBranches: the pruning saw's job. Limbs, not trunks. Tree survives.
    pruneBranches(cx, cy) {
      if (this.over) return null;
      const t = this.playerTile();
      const detail = this.genDetail(this.map.px, this.map.py);
      const cell = detail[cy] && detail[cy][cx];
      if (cell !== 'tree' && cell !== 'bigtree') { this.say('Nothing to prune there.'); return null; }
      const px = this.state.scholar.mx ?? 4, py = this.state.scholar.my ?? 4;
      if (Math.max(Math.abs(cx - px), Math.abs(cy - py)) > 1) { this.say('Too far. Step closer.'); return null; }
      const wt = this.woodcutTier();
      if ((TIER_RANK[wt.tier] || 0) < TIER_RANK.prune) {
        this.say(`You need a saw or axe to prune limbs. ${wt.name === 'bare hands' ? 'Your hands will only get you splinters.' : `Your ${wt.name} isn't up to it.`}`);
        return this.tickAction(2) || this.status();
      }
      this.state.scholar.kcal = Math.max(0, this.state.scholar.kcal - 30);
      // WOODLORE: the knowledgeable take the right limbs — seasoned, straight.
      const lore = this.woodloreKnown();
      let n = 2 + Math.floor(Math.random() * 3);
      if (lore) n = Math.ceil(n * 1.5);
      this.addMaterial('branch', n);
      this.say(lore
        ? `You work the ${wt.name} through the lower limbs, taking the seasoned ones. +${n} branches. The tree stands — it'll grow more.`
        : `You work the ${wt.name} through the lower limbs. +${n} branches. The tree stands — it'll grow more.`);
      // ACTION CLOCK: pruning = 1 chunk (32 ticks) + 30 kcal effort.
      return this.tickAction(32) || this.status();
    },
    // gatherFallen: deadfall. No tool needed — slow, honest, always available.
    gatherFallen(cx, cy) {
      if (this.over) return null;
      const t = this.playerTile();
      const detail = this.genDetail(this.map.px, this.map.py);
      const cell = detail[cy] && detail[cy][cx];
      if (cell !== 'tree' && cell !== 'bigtree' && cell !== 'bush' && cell !== 'thicket') {
        this.say('No deadfall here.');
        return null;
      }
      const px = this.state.scholar.mx ?? 4, py = this.state.scholar.my ?? 4;
      if (Math.max(Math.abs(cx - px), Math.abs(cy - py)) > 1) { this.say('Too far. Step closer.'); return null; }
      this.state.scholar.kcal = Math.max(0, this.state.scholar.kcal - 10);
      const n = 1 + (Math.random() < 0.3 ? 1 : 0);
      this.addMaterial('branch', n);
      this.say(`You gather fallen limbs from under the ${cell === 'bush' || cell === 'thicket' ? 'brush' : 'tree'}. +${n} branch${n > 1 ? 'es' : ''}. Slow, but free.`);
      // ACTION CLOCK: gathering deadfall = half chunk (16 ticks) + 10 kcal.
      return this.tickAction(16) || this.status();
    },

    // ---------- village stash ----------
    stashState() {
      const v = this.state.village;
      v.stash = v.stash || { materials: { wood: 0, branch: 0, stone: 0, fiber: 0 }, tools: [], weapons: [], medicine: [], ledger: [] };
      v.stash.materials = v.stash.materials || {};
      for (const m of MAT_IDS) if (v.stash.materials[m] === undefined) v.stash.materials[m] = 0;
      v.stash.tools = v.stash.tools || [];
      // ARMORY + PHARMACY (Steve 2026-10-09): the stash is sectioned by
      // filter. Weapons open armory, medicine opens pharmacy. Deposit-gated:
      // items become communal ONLY on deliberate deposit, never automatically.
      // Once deposited, any villager may take (including NPCs gearing up).
      v.stash.weapons = v.stash.weapons || [];
      v.stash.medicine = v.stash.medicine || [];
      v.stash.ledger = v.stash.ledger || [];
      return v.stash;
    },
    stashLog(kind, what, qty, vid) {
      const st = this.stashState();
      // vid omitted (undefined) = the player did it. Explicit null = anonymous
      // ("someone") — used by the closed-village skim, where NOBODY saw who
      // took it. Must not collapse to the player: the ledger blaming you for
      // a skim you didn't do breaks the whole social-deterrent loop.
      st.ledger.unshift({ day: day(), vid: vid === undefined ? this.state.scholar.villagerId : vid, kind, what, qty });
      if (st.ledger.length > 30) st.ledger.length = 30;
    },
    // _stashLedgers(vid): {gives, takes} — per-material unit counts for one
    // villager's stash traffic. Legacy saves stored a flat number per
    // villager; migrated to __legacy so old totals still count for the
    // hoarding rule while new traffic tracks per material.
    _stashLedgers(vid) {
      const v = this.state.village;
      v.stashGives = v.stashGives || {}; v.stashTakes = v.stashTakes || {};
      for (const key of ['stashGives', 'stashTakes']) {
        const cur = v[key][vid];
        if (typeof cur === 'number') v[key][vid] = { __legacy: cur };
        else if (!cur || typeof cur !== 'object') v[key][vid] = {};
      }
      return { gives: v.stashGives[vid], takes: v.stashTakes[vid] };
    },
    // _stashToolLedgers(vid): same, per tool itemId. Legacy numbers → __legacy.
    // MISER BREAK-IT 2026-10-09: generalized to _stashItemLedgers(vid,
    // section) — the armory/pharmacy sections landed 2026-10-09 with the
    // SAME hole the tool path had before the 2026-10-08 fix (+2 trust per
    // deposit, no take-back sting, no per-item ledgers). Measured farm:
    // deposit↔take-back of a kitchen knife printed +2 trust/cycle, +22
    // over 11 cycles. Weapons/medicine now mirror the tool rule exactly:
    // +2 on deposit, -5 sting on taking back your own un-returned gift.
    _stashItemLedgers(vid, section) {
      const v = this.state.village;
      const gk = 'stash' + section + 'Gives', tk = 'stash' + section + 'Takes';
      v[gk] = v[gk] || {}; v[tk] = v[tk] || {};
      for (const key of [gk, tk]) {
        const cur = v[key][vid];
        if (typeof cur === 'number') v[key][vid] = { __legacy: cur };
        else if (!cur || typeof cur !== 'object') v[key][vid] = {};
      }
      return { gives: v[gk][vid], takes: v[tk][vid] };
    },
    _stashToolLedgers(vid) { return this._stashItemLedgers(vid, 'Tool'); },
    // _stashItemGrant(vid, itemId, led): the +2 deposit grant for tools /
    // weapons / medicine, gated on net-positive contribution.
    // MISER BREAK-IT 2026-10-10: the old unconditional +2 minted infinite
    // trust via take-first cycles — take someone else's deposited item,
    // "donate" it back (+2), repeat; the take-back sting never fired because
    // takes always led gives (measured +10 over 5 cycles on all three
    // sections). Returning a borrowed item is not a donation: the grant
    // fires only when the donate raises this itemId's net above zero.
    _stashItemGrant(vid, itemId, led) {
      const netBefore = (led.gives[itemId] || 0) - (led.takes[itemId] || 0);
      led.gives[itemId] = (led.gives[itemId] || 0) + 1;
      const netAfter = netBefore + 1;
      const grant = 2 * Math.max(0, netAfter - Math.max(netBefore, 0));
      if (grant > 0) {
        const v = this.state.village;
        v.trust = v.trust || {};
        v.trust[vid] = Math.min(100, (v.trust[vid] === undefined ? 15 : v.trust[vid]) + grant);
      }
      return grant;
    },
    _stashTotalNet(vid) {
      const led = this._stashLedgers(vid);
      const sum = (o) => Object.values(o).reduce((t, x) => t + (x || 0), 0);
      return sum(led.gives) - sum(led.takes);
    },
    // villageTrustLevel: open (nobody worries), wary, closed (hoard and hide).
    villageTrustLevel() {
      const v = this.state.village;
      const ids = (v.roster || []).filter(id => id !== this.state.scholar.villagerId);
      if (!ids.length) return 'open';
      const t = v.trust || {};
      // NOTE (miser loop 2026-10-07): t[id] === undefined means "never set",
      // default 15. A villager at trust 0 is DISTRUSTED, not unset — the old
      // `t[id] || 15` counted them as 15 and lifted the average.
      const avg = ids.reduce((s, id) => s + (t[id] === undefined ? 15 : t[id]), 0) / ids.length;
      return avg >= 50 ? 'open' : avg >= 25 ? 'wary' : 'closed';
    },
    donateMaterial(mat, n) {
      // MID-FIGHT / OVER (miser break-it 2026-10-10): see buryCache.
      if (this.over) return null;
      if (this.inCombat && this.inCombat()) { this.say('Not mid-fight — finish it first.'); return null; }
      // PHYSICAL STORES (miser break-it 2026-10-08): the stash is in the hall —
      // takeMaterial already refuses remote hands ("The stash is in the hall.
      // Your hands are not."). Donating had no gate: the pack UI's Stash button
      // teleported materials into the hall from anywhere in the wilds. Same
      // gate, same honesty. 'remote' (Full Integration) still works.
      if (this.havenStoresAccess && this.havenStoresAccess() === 'none') {
        this.say('The stash is in the hall. Your hands are not.');
        return null;
      }
      const def = MAT_DEFS[mat];
      if (!def) return null;
      n = Math.min(Math.floor(n || 0), this.materialCount(mat));
      if (n <= 0) { this.say(`You have no ${matName(mat, 1)} to give.`); return null; }
      this.spendMaterial(mat, n);
      const st = this.stashState();
      st.materials[mat] = (st.materials[mat] || 0) + n;
      this.stashLog('give', def.name, n);
      const v = this.state.village, vid = this.state.scholar.villagerId;
      v.trust = v.trust || {};
      // TRUST FOLLOWS NET CONTRIBUTION (miser break-it 2026-10-08): the old
      // gross-haul grant (+1 per 10 units donated) farmed infinite trust via
      // donate-10/take-9 cycles — the take-back sting only fired at net<=0,
      // so parking net at +1 printed +1 trust per cycle forever (measured
      // +20 trust over 20 cycles). Grants now happen on 10-unit NET bands
      // per material: crossing a band upward grants, and takeMaterial
      // revokes band-for-band on the way back down. The farm nets zero.
      // Token donations still count — bands accumulate across small gifts.
      const led = this._stashLedgers(vid);
      const netBefore = (led.gives[mat] || 0) - (led.takes[mat] || 0);
      led.gives[mat] = (led.gives[mat] || 0) + n;
      const netAfter = netBefore + n;
      // GRANT ONLY ABOVE WATER (miser break-it 2026-10-10): the old formula
      // counted the 0-band crossing when digging out of debt (net -10 -> +5
      // minted +1 for repaying what you took). Repaying a debt restores; it
      // doesn't earn. Grants reward only net increases above zero.
      const tGain = Math.max(0, Math.floor(netAfter / 10) - Math.max(Math.floor(netBefore / 10), 0));
      if (tGain > 0) v.trust[vid] = Math.min(100, (v.trust[vid] === undefined ? 15 : v.trust[vid]) + tGain);
      this.observe('donate');
      this.say(`Set ${n} ${matName(mat, n)} in the village stash. The pile grows.`);
      return this.tickAction(2) || this.status();
    },
    takeMaterial(mat, n) {
      // MID-FIGHT / OVER (miser break-it 2026-10-10): see buryCache.
      if (this.over) return null;
      if (this.inCombat && this.inCombat()) { this.say('Not mid-fight — finish it first.'); return null; }
      if (this.havenStoresAccess && this.havenStoresAccess() === 'none') {
        this.say('The stash is in the hall. Your hands are not.');
        return null;
      }
      const def = MAT_DEFS[mat];
      if (!def) return null;
      const st = this.stashState();
      const have = st.materials[mat] || 0;
      n = Math.min(Math.floor(n || 0), have);
      if (n <= 0) { this.say(`The stash has no ${matName(mat, 1)}.`); return null; }
      // weight check — take what fits
      const inv = this.state.scholar.inventory || [];
      const carry = inv.reduce((t2, i) => t2 + (i.kg || 0) * (i.units || 1), 0) + (this.waterWeight ? this.waterWeight() : 0);
      const max = this.carryCapacity ? this.carryCapacity() : 20;
      const fits = Math.max(0, Math.floor((max - carry) / def.kg));
      if (fits <= 0) { this.say('Too heavy. Lighten your pack first.'); return null; }
      n = Math.min(n, fits);
      st.materials[mat] -= n;
      this.addMaterial(mat, n);
      this.stashLog('take', def.name, n);
      // SOCIAL: the ledger remembers. Takers who never give are noticed.
      const v = this.state.village, vid = this.state.scholar.villagerId;
      const led = this._stashLedgers(vid);
      const netBefore = (led.gives[mat] || 0) - (led.takes[mat] || 0);
      led.takes[mat] = (led.takes[mat] || 0) + n;
      const netAfter = netBefore - n;
      // TAKE-BACK STING (miser break-it 2026-10-08): fires only for the SAME
      // material you gave. Donating branch and taking stone is normal
      // communal use — the old flat-net check accused you of "taking back
      // what you gave" falsely. When the sting fires it is the WHOLE
      // take-back consequence (-5, mirroring the pantry rule): the band
      // revoke below is skipped, so taking back everything you gave costs
      // exactly the noticed -5, not revoke AND sting.
      const isTakeBack = (led.gives[mat] || 0) > 0 && netAfter <= 0;
      // BAND REVOKE (miser break-it 2026-10-08): withdrawing donated stock
      // unwinds the trust the donation earned, band for band. This is what
      // kills the donate-10/take-9 farm — every cycle nets zero trust.
      // (Skipped when the sting fires — see above.)
      const revoke = isTakeBack ? 0 : Math.max(0, Math.floor(netBefore / 10) - Math.floor(netAfter / 10));
      if (revoke > 0) {
        v.trust = v.trust || {};
        v.trust[vid] = Math.max(0, (v.trust[vid] === undefined ? 15 : v.trust[vid]) - revoke);
      }
      const totalNet = this._stashTotalNet(vid);
      if (totalNet < -20) {
        v.trust = v.trust || {};
        // NOTE (miser loop 2026-10-07): explicit undefined check — the old
        // `(v.trust[vid] || 15)` reset trust to 13 the take after hitting 0
        // (0 || 15 → 15-2), so stash-skimming trust could never bottom out.
        v.trust[vid] = Math.max(0, (v.trust[vid] === undefined ? 15 : v.trust[vid]) - 2);
        this.observe('hoard');
        if (Math.random() < 0.4) this.say('Someone watches you take from the stash. They say nothing. The ledger says everything.');
      }
      if (isTakeBack) {
        v.trust = v.trust || {};
        v.trust[vid] = Math.max(0, (v.trust[vid] === undefined ? 15 : v.trust[vid]) - 5);
        this.say('You took back what you gave. They noticed. Trust -5.');
      }
      this.say(`Took ${n} ${matName(mat, n)} from the stash.`);
      return this.tickAction(2) || this.status();
    },
    // donateTool / takeTool: spare tools live in the stash for anyone to use.
    // (Borrowing is trust-neutral in an open village; in a closed one it's noticed.)
    // phoenixHonorDeposit(item): the honored path for a phoenix victim's gear
    // (Steve 2026-10-09). An item taken from an ash-pile carries ashOf
    // provenance; depositing it at Haven brings it home -- the taking is
    // forgiven, the bringing is honored: meaningful trust, honoring gossip,
    // and the gear enters normal village circulation. Returns true when it
    // handled the deposit (caller skips its normal line). NOTE: only
    // tools/weapons/medicine have deposit hooks -- armor and misc gear have
    // no communal section (canon: no communal armor pile), so the honored
    // path can't complete for those; flagged, not built.
    phoenixHonorDeposit(item) {
      if (!item || !item.ashOf) return false;
      const v = this.state.village, vid = this.state.scholar.villagerId;
      v.trust = v.trust || {};
      v.trust[vid] = Math.min(100, (v.trust[vid] === undefined ? 15 : v.trust[vid]) + 8);
      let deadName = 'the dead';
      try { deadName = (this.displayName(item.ashOf) || 'the dead').split(' ')[0]; } catch (e) {}
      const iname = item.name || 'their gear';
      try {
        const heardBy = (this.witnesses ? (this.witnesses(6) || []) : []) || [];
        this.seedGossip('phoenix_honored', { who: vid, generous: 10, honest: 8 }, heardBy.slice(0, 4), true);
      } catch (e) {}
      this.say(`You brought ${deadName}'s ${iname} home to the village. The village saw you take it -- and saw you bring it back. (Trust +8.)`);
      try { this.journalNote && this.journalNote('village', 'phoenix', 'Brought ' + deadName + "'s " + iname + ' home. Honored.'); } catch (e) {}
      return true;
    },
    donateTool(idx) {
      // MID-FIGHT / OVER (miser break-it 2026-10-10): see buryCache.
      if (this.over) return null;
      if (this.inCombat && this.inCombat()) { this.say('Not mid-fight — finish it first.'); return null; }
      // PHYSICAL STORES (miser break-it 2026-10-08): same gate as donateMaterial
      // — tools don't teleport into the hall either.
      if (this.havenStoresAccess && this.havenStoresAccess() === 'none') {
        this.say('The stash is in the hall. Your hands are not.');
        return null;
      }
      const inv = this.state.scholar.inventory || [];
      const item = inv[idx];
      if (!item) return null;
      const id = item.itemId || item.id;
      const def = (this.data.items || []).find(i => i.id === id);
      const isTool = def && (def.class === 'tool' || (def.tool && (def.tool.woodcut || def.tool.pry)));
      if (!isTool) { this.say("That's not a tool the village can share."); return null; }
      if (item.bonded) { this.say("That's yours. Bonded. Not the village's."); return null; }
      // KEEPSAKE (miser break-it 2026-10-10): sentimental tools are yours in
      // a deeper sense — and the stash strips items to {itemId, name}, which
      // would destroy the sentimental charge. Refused here and hidden in the
      // UI (isStashableTool), mirroring the armory/pharmacy rule.
      if (this.isKeepsake && this.isKeepsake(item)) { this.say("That's yours. Not the village's."); return null; }
      inv.splice(idx, 1);
      const st = this.stashState();
      // UNITS (miser break-it 2026-10-10): the stash strips entries — a
      // merged 2-stack donated whole used to come back as one (the other
      // unit silently destroyed). The entry keeps its count now.
      st.tools.push({ itemId: id, name: item.name || def.name, units: item.units || 1 });
      this.stashLog('give', item.name || def.name, 1);
      const vid = this.state.scholar.villagerId;
      // ASH GEAR HONORED (Steve 2026-10-09): bringing a phoenix victim's
      // belongings home replaces the ordinary deposit grant. The say line
      // and the ontology header both promise +8 — the engine used to stack
      // the ordinary +2 underneath (+10). Now +8, as said.
      if (this.phoenixHonorDeposit && this.phoenixHonorDeposit(item)) {
        const tg = this._stashToolLedgers(vid);
        tg.gives[id] = (tg.gives[id] || 0) + 1;
        return this.tickAction(2) || this.status();
      }
      // TAKE-BACK TRACKING (miser loop 2026-10-08; per-tool miser break-it
      // 2026-10-08): donating then re-taking the same tool farmed +2 trust
      // per cycle. The old flat counter ALSO accused you of taking back YOUR
      // tool when you borrowed a different one — tracked per itemId now.
      // GRANT GATED (miser break-it 2026-10-10): +2 only for net-positive
      // contribution — returning a borrowed tool is not a donation.
      const tg = this._stashToolLedgers(vid);
      this._stashItemGrant(vid, id, tg);
      this.say(`Left your ${item.name || def.name} in the stash. Anyone who needs it can take it.`);
      return this.tickAction(2) || this.status();
    },
    takeTool(itemId) {
      // MID-FIGHT / OVER (miser break-it 2026-10-10): see buryCache.
      if (this.over) return null;
      if (this.inCombat && this.inCombat()) { this.say('Not mid-fight — finish it first.'); return null; }
      if (this.havenStoresAccess && this.havenStoresAccess() === 'none') {
        this.say('The stash is in the hall. Your hands are not.');
        return null;
      }
      const st = this.stashState();
      const i = st.tools.findIndex(t => t.itemId === itemId);
      if (i < 0) { this.say("It's not there anymore."); return null; }
      const def = (this.data.items || []).find(x => x.id === itemId) || {};
      // WEIGHT (miser break-it 2026-10-09): every other take path
      // (takeMaterial, takeFromPantry, digUpCache, takeFromCache) refuses an
      // over-capacity take — takeTool didn't, so borrowing at a full pack
      // silently overfilled it (measured 22.2kg carried vs 20kg max).
      // Checked BEFORE the splice: a refused take leaves the stash untouched.
      // UNITS (miser break-it 2026-10-10): weigh the whole entry, not one.
      const inv = this.state.scholar.inventory || [];
      const carry = inv.reduce((t2, it) => t2 + (it.kg || 0) * (it.units || 1), 0) + (this.waterWeight ? this.waterWeight() : 0);
      const max = this.carryCapacity ? this.carryCapacity() : 20;
      const takeUnits = st.tools[i].units || 1;
      if (carry + (def.kg || 0.8) * takeUnits > max) { this.say(`Too heavy for the ${st.tools[i].name}. Lighten your pack first.`); return null; }
      const [tool] = st.tools.splice(i, 1);
      inv.push({ itemId, name: tool.name, units: takeUnits, kcalEach: 0, kg: def.kg || 0.8 });
      this.stashLog('take', tool.name, 1);
      // TAKE-BACK (miser break-it 2026-10-08): only when you take a tool YOU
      // left and haven't re-taken. Borrowing a DIFFERENT tool is normal
      // communal use — the old flat net accused you falsely ("You took back
      // the tool you left" when you took the saw, gave the axe). Kills the
      // donate/take +2 farm the same as before: re-taking your own gift is
      // noticed, -5.
      const v2 = this.state.village, vid2 = this.state.scholar.villagerId;
      const tg2 = this._stashToolLedgers(vid2);
      const gaveThis = (tg2.gives[itemId] || 0) - (tg2.takes[itemId] || 0);
      tg2.takes[itemId] = (tg2.takes[itemId] || 0) + 1;
      if (gaveThis > 0) {
        v2.trust = v2.trust || {};
        v2.trust[vid2] = Math.max(0, (v2.trust[vid2] === undefined ? 15 : v2.trust[vid2]) - 5);
        this.say('You took back the tool you left. They noticed. Trust -5.');
      }
      const lvl = this.villageTrustLevel();
      if (lvl === 'closed' && Math.random() < 0.5) {
        this.say(`You take the ${tool.name}. In this village, people notice who takes tools.`);
        this.observe('hoard');
      } else {
        this.say(`Took the ${tool.name}${takeUnits > 1 ? ` ×${takeUnits}` : ''} from the stash. Bring ${takeUnits > 1 ? 'them' : 'it'} back when you're done.`);
      }
      return this.tickAction(2) || this.status();
    },
    // isStashableWeapon / isMedicine: section filters for the stash.
    // Armory = weapons, pharmacy = medicine. Same deposit-gated rules as tools.
    isStashableWeapon(item) {
      if (!item || item.bonded) return false;
      // KEEPSAKE (miser break-it 2026-10-10): the armory strips items to
      // {itemId, name} — a keepsake deposited there would lose its
      // sentimental charge. Hidden in the UI; the engine (_depositStashedItem)
      // already refuses.
      if (this.isKeepsake && this.isKeepsake(item)) return false;
      const id = item.itemId || item.id;
      const def = (this.data.items || []).find(i => i.id === id);
      return !!(def && def.class === 'weapon');
    },
    isMedicine(item) {
      if (!item) return false;
      const id = item.itemId || item.id || '';
      const def = (this.data.items || []).find(i => i.id === id) || {};
      return !!(def.healAmount || /bandage|poultice|medfoam|salve|antibiotic|remedy|tonic/i.test(id + ' ' + (def.name || '')));
    },
    // _depositStashedItem(idx, section, kindLabel): shared spine for weapon /
    // medicine deposits. Mirrors donateTool's gates: physical stores, bonded,
    // ledger, trust. Deposit is the consent that makes an item communal.
    _depositStashedItem(idx, section, kindLabel) {
      // MID-FIGHT / OVER (miser break-it 2026-10-10): see buryCache.
      if (this.over) return null;
      if (this.inCombat && this.inCombat()) { this.say('Not mid-fight — finish it first.'); return null; }
      if (this.havenStoresAccess && this.havenStoresAccess() === 'none') {
        this.say('The stash is in the hall. Your hands are not.');
        return null;
      }
      const inv = this.state.scholar.inventory || [];
      const item = inv[idx];
      if (!item) return null;
      if (item.bonded || (this.isKeepsake && this.isKeepsake(item))) {
        this.say("That's yours. Not the village's.");
        return null;
      }
      // SECTION FILTER (miser break-it 2026-10-09): the UI gates with
      // isStashableWeapon/isMedicine, but the engine accepted ANY item —
      // a branch went into the armory as a "weapon" and minted +2 trust,
      // with the say message lying about it ("Left your Branch in the
      // armory."). Enforce at the engine level, refuse honestly.
      const sectionOk = section === 'weapons' ? this.isStashableWeapon(item)
        : section === 'medicine' ? this.isMedicine(item) : true;
      if (!sectionOk) {
        this.say(`The ${kindLabel} doesn't take ${item.name || 'that'}.`);
        return null;
      }
      inv.splice(idx, 1);
      const id = item.itemId || item.id;
      const def = (this.data.items || []).find(i => i.id === id) || {};
      const st = this.stashState();
      // PHARMACY IDENTITY (miser break-it 2026-10-10): the stash used to
      // strip entries to {itemId, name} — a dosed medicine came back from
      // the pharmacy as an unusable brick (medType/doses gone; the
      // affliction UI requires both). Medicine keeps its dosing; every
      // section keeps its units (a merged 2-stack donated whole must come
      // back whole, not as one).
      const entry = { itemId: id, name: item.name || def.name || id,
        kg: item.kg != null ? item.kg : (def.kg || 0.3), units: item.units || 1 };
      if (section === 'medicine') { entry.medType = item.medType; entry.doses = item.doses; }
      st[section].push(entry);
      this.stashLog('give', item.name || def.name || id, 1);
      const vid = this.state.scholar.villagerId;
      const il = this._stashItemLedgers(vid, section === 'weapons' ? 'Weapon' : 'Medicine');
      // ASH GEAR HONORED (Steve 2026-10-09): bringing a phoenix victim's
      // belongings home replaces the ordinary deposit grant (+8 as said,
      // not +8 stacked on the ordinary +2).
      if (this.phoenixHonorDeposit && this.phoenixHonorDeposit(item)) {
        il.gives[id] = (il.gives[id] || 0) + 1;
        return this.tickAction(2) || this.status();
      }
      // GRANT GATED (miser break-it 2026-10-10): +2 only for net-positive
      // contribution — returning a borrowed weapon/medicine is not a
      // donation (see _stashItemGrant).
      this._stashItemGrant(vid, id, il);
      this.say(`Left your ${item.name || def.name} in the ${kindLabel}. Anyone who needs it can take it.`);
      return this.tickAction(2) || this.status();
    },
    donateWeapon(idx) { return this._depositStashedItem(idx, 'weapons', 'armory'); },
    donateMedicine(idx) { return this._depositStashedItem(idx, 'medicine', 'pharmacy'); },
    // _takeStashedItem(section, itemId, kindLabel): shared spine for takes.
    _takeStashedItem(section, itemId, kindLabel) {
      // MID-FIGHT / OVER (miser break-it 2026-10-10): see buryCache.
      if (this.over) return null;
      if (this.inCombat && this.inCombat()) { this.say('Not mid-fight — finish it first.'); return null; }
      if (this.havenStoresAccess && this.havenStoresAccess() === 'none') {
        this.say('The stash is in the hall. Your hands are not.');
        return null;
      }
      const st = this.stashState();
      const pile = st[section] || [];
      const i = pile.findIndex(t => t.itemId === itemId);
      if (i < 0) { this.say("It's not there anymore."); return null; }
      const def = (this.data.items || []).find(x => x.id === itemId) || {};
      const inv = this.state.scholar.inventory || [];
      const carry = inv.reduce((t2, it) => t2 + (it.kg || 0) * (it.units || 1), 0) + (this.waterWeight ? this.waterWeight() : 0);
      const max = this.carryCapacity ? this.carryCapacity() : 20;
      // UNITS (miser break-it 2026-10-10): weigh the whole entry, not one.
      const takeUnits = pile[i].units || 1;
      if (carry + (def.kg || 0.5) * takeUnits > max) { this.say(`Too heavy for the ${pile[i].name}. Lighten your pack first.`); return null; }
      const [entry] = pile.splice(i, 1);
      // PHARMACY IDENTITY (miser break-it 2026-10-10): restore what the
      // deposit preserved — medType/doses/units. A dosed bottle comes home
      // dosed, usable from the pack exactly as before.
      const back = { itemId, name: entry.name, units: takeUnits, kcalEach: 0, kg: def.kg || entry.kg || 0.5 };
      if (entry.medType) { back.medType = entry.medType; back.doses = entry.doses; }
      inv.push(back);
      this.stashLog('take', entry.name, 1);
      // TAKE-BACK (miser break-it 2026-10-09): mirrors the tool rule —
      // re-taking your own un-returned deposit is noticed, -5. Taking
      // someone else's gift is normal communal use. Kills the
      // deposit↔take-back +2 trust farm that printed +22 over 11 cycles.
      const v2 = this.state.village, vid2 = this.state.scholar.villagerId;
      const il2 = this._stashItemLedgers(vid2, section === 'weapons' ? 'Weapon' : 'Medicine');
      const gaveThis = (il2.gives[itemId] || 0) - (il2.takes[itemId] || 0);
      il2.takes[itemId] = (il2.takes[itemId] || 0) + 1;
      if (gaveThis > 0) {
        v2.trust = v2.trust || {};
        v2.trust[vid2] = Math.max(0, (v2.trust[vid2] === undefined ? 15 : v2.trust[vid2]) - 5);
        this.say(`You took back the ${entry.name} you left. They noticed. Trust -5.`);
      }
      this.say(`Took the ${entry.name}${takeUnits > 1 ? ` ×${takeUnits}` : ''} from the ${kindLabel}.`);
      return this.tickAction(2) || this.status();
    },
    takeWeapon(itemId) { return this._takeStashedItem('weapons', itemId, 'armory'); },
    takeMedicine(itemId) { return this._takeStashedItem('medicine', itemId, 'pharmacy'); },
    stashLedgerText(n) {
      const st = this.stashState();
      const rows = (st.ledger || []).slice(0, n || 5);
      if (!rows.length) return 'Nothing yet. The stash is new.';
      return rows.map(e => {
        // firstRef, not displayName.split(' ')[0]: unknown villagers render
        // as "A person, maybe 30s, ..." whose first word is bare "A" — the
        // ledger must distinguish people even before names are learned.
        const who = e.vid ? this.firstRef(e.vid) : 'someone';
        const verb = e.kind === 'give' ? 'left' : 'took';
        return `day ${e.day}: ${who} ${verb} ${e.qty}× ${e.what}`;
      }).join('\n');
    },
    // stashHtml: compact Haven-panel section. Buttons carry data attrs; app.js wires them.
    stashHtml() {
      const st = this.stashState();
      const lvl = this.villageTrustLevel();
      const lvlNote = lvl === 'open' ? 'an open pile — nobody worries here'
        : lvl === 'wary' ? 'kept tidy, watched a little'
        : 'counted carefully. trust is thin here';
      const rows = MAT_IDS.map(m => {
        const have = st.materials[m] || 0;
        const carried = this.materialCount(m);
        return `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">` +
          `<span class="small" style="flex:1">${MAT_DEFS[m].name} — <b>${have}</b> in stash${carried ? ` · you carry ${carried}` : ''}</span>` +
          (carried ? `<button class="btn ghost sm" data-stash-give="${m}">Give all</button>` : '') +
          (have ? `<button class="btn ghost sm" data-stash-take="${m}">Take 5</button>` : '') +
          `</div>`;
      }).join('');
      const tools = (st.tools || []).map(t =>
        `<span class="small">🔧 ${t.name}${(t.units || 1) > 1 ? ` ×${t.units}` : ''} <button class="btn ghost sm" data-stash-tool="${t.itemId}">Take</button></span>`
      ).join(' · ') || '<span class="small" style="opacity:.6">no spare tools</span>';
      // ARMORY + PHARMACY (Steve 2026-10-09): section filters on the same
      // stash. Weapons open armory, medicine opens pharmacy — deposit-gated,
      // takeable by any villager once deposited.
      const weapons = (st.weapons || []).map(t =>
        `<span class="small">⚔️ ${t.name}${(t.units || 1) > 1 ? ` ×${t.units}` : ''} <button class="btn ghost sm" data-stash-weapon="${t.itemId}">Take</button></span>`
      ).join(' · ') || '<span class="small" style="opacity:.6">no weapons</span>';
      const medicine = (st.medicine || []).map(t =>
        `<span class="small">💊 ${t.name}${(t.units || 1) > 1 ? ` ×${t.units}` : ''}${t.doses != null ? ` (${t.doses} dose${t.doses === 1 ? '' : 's'})` : ''} <button class="btn ghost sm" data-stash-med="${t.itemId}">Take</button></span>`
      ).join(' · ') || '<span class="small" style="opacity:.6">no medicine</span>';
      return `<p class="small" style="margin-top:8px"><b>📦 Village stash</b> <span style="opacity:.6">(${lvlNote})</span></p>` +
        rows +
        `<p class="small">🔧 Spare tools: ${tools}</p>` +
        `<p class="small">⚔️ Armory: ${weapons}</p>` +
        `<p class="small">💊 Pharmacy: ${medicine}</p>` +
        `<p class="small" style="opacity:.6;white-space:pre-line">${this.stashLedgerText(3)}</p>`;
    },

    // ---------- personal caches ----------
    playerCaches() {
      const s = this.state.scholar;
      s.caches = s.caches || [];
      return s.caches;
    },
    // cacheTheftChance(dist): Steve's rule — personal-cache theft risk falls
    // with Manhattan distance from the nearest village/haven.
    // DAILY RATE (Steve 2026-10-07): was per-batch (~0.8%/batch compounded to
    // near-certain robbery over a season); now per-day. ~0.8%/day at the
    // haven's doorstep → ~0.05%/day far wild. Far caches usually survive the
    // season; near caches are a real gamble. The miser promise holds.
    cacheTheftChance(dist) {
      return 0.008 * Math.max(0.06, 1 - dist / 12);
    },
    // dailyCacheCheck(): one theft roll per cache per day (called from endDay).
    // Buried things are safer, not safe — but far wild is now actually safer.
    dailyCacheCheck() {
      try {
        const spots = [];
        // MISER BREAK-IT 2026-10-08: past villages (fork/join archives) stay
        // in the world with their hungry mouths. The old code rolled only
        // against the CURRENT village — bury near old Haven, fork, and your
        // caches became unrobbable: measured at the wrong (far) distance AND
        // the robber pool was the new founder-only roster (→ null robber, no
        // trace ever). Spots carry their village so the NEAREST village's
        // roster supplies the culprit at the honest distance.
        if (this.state.village) spots.push({ x: this.state.village.px ?? 4, y: this.state.village.py ?? 4, v: this.state.village });
        for (const ov of (this.state.otherVillages || [])) spots.push({ x: ov.x, y: ov.y, v: ov });
        for (const pv of (this.state.pastVillages || [])) {
          if (pv) spots.push({ x: pv.px ?? 4, y: pv.py ?? 4, v: pv });
        }
        for (const c of this.playerCaches()) {
          if (c.found) continue;
          const cn = c.node || {};
          let nearest = Infinity, nearV = null;
          for (const s of spots) {
            const d = Math.abs((s.x || 0) - (cn.x || 0)) + Math.abs((s.y || 0) - (cn.y || 0));
            if (d < nearest) { nearest = d; nearV = s.v || null; }
          }
          if (!isFinite(nearest)) nearest = 5;
          const p = this.cacheTheftChance(nearest);
          if (Math.random() < p) this.resolveCacheRobbery(c, nearV);
        }
      } catch (e) {}
    },
    // buryCache(kind, key, qty): kind 'material' (key = mat id) or 'food' (key = inventory idx).
    buryCache(kind, key, qty) {
      // MID-FIGHT / OVER (miser break-it 2026-10-10): tickAction no-ops in
      // combat, so burying mid-fight cost 0 ticks instead of the promised
      // 32 — a free action. Same class as the boilWater mid-fight guard.
      // The dead don't bury.
      if (this.over) return null;
      if (this.inCombat && this.inCombat()) { this.say('Not mid-fight — finish it first.'); return null; }
      qty = Math.floor(qty || 0);
      if (qty <= 0) { this.say('Bury what, exactly?'); return null; }
      const items = [];
      let label = '';
      if (kind === 'material') {
        const def = MAT_DEFS[key];
        if (!def) return null;
        qty = Math.min(qty, this.materialCount(key));
        if (qty <= 0) { this.say(`You have no ${def.name.toLowerCase()} to bury.`); return null; }
        this.spendMaterial(key, qty);
        items.push({ material: key, units: qty, name: def.name, kcalEach: 0, spoilDay: 9999, kg: def.kg });
        label = `${qty}× ${def.name}`;
      } else if (kind === 'food') {
        const inv = this.state.scholar.inventory || [];
        const it = inv[key];
        if (!it || (it.kcalEach || 0) <= 0) { this.say("That's not food."); return null; }
        // UNIT COERCION (break-it camps-4 2026-10-08): same class as the miser
        // takeFromCache catch. A unit-less/corrupt item went `it.units -= qty`
        // -> NaN, survived every bury (`NaN <= 0` is false), and minted 1 unit
        // per bury FOREVER from one phantom item. Coerce once: corrupt entries
        // collapse to exactly one honest unit, never an infinite.
        it.units = Math.max(1, Math.floor(it.units || 1));
        qty = Math.min(qty, it.units || 1);
        const kcal = (it.kcalEach || 0) * qty;
        // FULL PROCESSING STATE (miser break-it 2026-10-09): the old
        // subset-push silently stripped diseaseRisk/poisonRisk/needsCooking/
        // foodState — burying raw risky meat and digging it up came back
        // CLEAN: a free disease bypass (measured 0.35 sick chance -> 0) and
        // toxin laundering (poisoned meat feedable risk-free). Same field
        // contract as pantryAdd/takenStack — what goes into the earth comes
        // back out of it, unchanged. Risk objects are copied: a partial bury
        // leaves a pack stack behind, and the two must not alias.
        const riskCopy = (r) => (r ? Object.assign({}, r) : r);
        items.push({
          name: it.name, kcalEach: it.kcalEach, units: qty,
          spoilDay: it.spoilDay, safe: it.safe, kg: it.kg, unit: it.unit,
          plantId: it.plantId, foodKind: it.foodKind, foodState: it.foodState,
          edible: it.edible, hiddenKcal: it.hiddenKcal, rawKcal: it.rawKcal,
          cookedKcal: it.cookedKcal, diseaseRisk: riskCopy(it.diseaseRisk),
          poisonRisk: riskCopy(it.poisonRisk), needsCooking: it.needsCooking,
          // TRICHINOSIS (break-it food 2026-10-10): the earth doesn't cure
          // worms — parasiteRisk rides the same contract, copied not aliased.
          parasiteRisk: riskCopy(it.parasiteRisk),
          wellMade: it.wellMade, burnt: it.burnt, prep: it.prep,
          bonded: it.bonded, keepsake: it.keepsake, stolen: it.stolen,
        });
        it.units -= qty;
        if (it.units <= 0) inv.splice(inv.indexOf(it), 1);
        label = `${qty}× ${it.name} (${this.fmtKcal ? this.fmtKcal(kcal) : kcal + ' kcal'})`;
      } else return null;
      const node = { x: this.map.px, y: this.map.py };
      let place = 'here';
      try { place = this.nodeEpithet(node.x, node.y) || 'here'; } catch (e) {}
      // BEARING (Steve 2026-10-06): the journal is your memory, and "forest
      // floor" exists on forty tiles. The note needs the walk back — how
      // far, which way from Haven — or two caches at one node are
      // indistinguishable in the list until you dig.
      let bearing = '';
      try {
        const hv = this.state.village || {};
        const dx = node.x - (hv.px ?? 4), dy = node.y - (hv.py ?? 4);
        const d = Math.abs(dx) + Math.abs(dy);
        if (d > 0) bearing = `, ${d} tile${d === 1 ? '' : 's'} ` +
          (dy < 0 ? 'north' : dy > 0 ? 'south' : '') +
          (dx > 0 ? 'east' : dx < 0 ? 'west' : '') + ' of Haven';
      } catch (e) {}
      const desc = `${label} — buried at ${place}${bearing}, day ${day()}`;
      const caches = this.playerCaches();
      caches.push({
        id: 'c' + day() + '_' + Math.random().toString(36).slice(2, 7),
        node, desc, label, items, found: false, day: day(),
      });
      // LOCATION MEMORY: journal first, codex after the System. Steve's rule.
      try {
        const cx = this.state.codex;
        cx.places = cx.places || [];
        cx.places.push({ day: day(), text: desc });
      } catch (e) {}
      this.say(`Buried. ${desc}. Only you know — and your ${this.journalName()}.`);
      this.say(`📓 ${this.journalName()}: noted — ${desc}`);
      // ACTION CLOCK: digging a hole = 1 chunk (32 ticks).
      return this.tickAction(32) || this.status();
    },
    digUpCache(id) {
      // MID-FIGHT / OVER (miser break-it 2026-10-10): see buryCache.
      if (this.over) return null;
      if (this.inCombat && this.inCombat()) { this.say('Not mid-fight — finish it first.'); return null; }
      const caches = this.playerCaches();
      const i = caches.findIndex(c => c.id === id);
      if (i < 0) return null;
      const c = caches[i];
      // LOCATION: a cache is where you buried it. No digging it up from
      // the hall couch — you walk back out there like everyone else.
      const cn = c.node || {};
      if (cn.x !== this.map.px || cn.y !== this.map.py) {
        let where = 'somewhere else';
        try { where = this.nodeEpithet(cn.x, cn.y) || where; } catch (e) {}
        this.say(`Not here. Your ${this.journalName()} says: ${c.desc || ('buried at ' + where)}.`);
        return null;
      }
      if (c.found) {
        this.say('You dig where you buried it. Disturbed earth. Nothing. Someone got here first.');
        // DISCOVERY (Steve 2026-10-06): this hole is where the player LEARNS
        // the cache was robbed. The codex entry lands here — not at robbery
        // time, when the player was nodes away and knew nothing.
        c.discovered = true;
        try {
          const cxd = this.state.codex;
          cxd.places = cxd.places || [];
          cxd.places.push({ day: day(), text: `Cache robbed: ${c.desc}` });
        } catch (e) {}
        caches.splice(i, 1);
        return this.tickAction(16) || this.status();
      }
      // SPOILAGE UNDERGROUND: the earth doesn't stop time. Perishables rot in
      // a buried cache just like in your pack — you find out when you dig, at
      // the hole, not the morning after. Materials never rot. The lesson is
      // the loop: bury dried and smoked goods; eat the fresh stuff fast.
      // BONUS-AWARE (break-it food 2026-10-09): the old raw `spoilDay <= today`
      // check destroyed food the pack would still call edible when the scholar
      // has preservation_instinct. One boundary everywhere: isSpoiled().
      const good = [], bad = [];
      for (const it of c.items) {
        const spoiled = !it.material && this.isSpoiled(it);
        (spoiled ? bad : good).push(it);
      }
      const badNames = bad.map(it => `${it.units || 1}× ${it.name}`).join(', ');
      if (!good.length) {
        this.say(`You dig up your cache. ${badNames} — all gone bad underground. You leave ${bad.length === 1 ? 'it' : 'them'} for the worms.`);
        caches.splice(i, 1);
        return this.tickAction(16) || this.status();
      }
      if (bad.length) this.say(`You dig where you buried it. ${badNames} went bad underground — left for the worms.`);
      // weight check (only what you're actually carrying home)
      const inv = this.state.scholar.inventory || [];
      const carry = inv.reduce((t2, it) => t2 + (it.kg || 0) * (it.units || 1), 0) + (this.waterWeight ? this.waterWeight() : 0);
      const max = this.carryCapacity ? this.carryCapacity() : 20;
      const need = good.reduce((t2, it) => t2 + (it.kg || 0) * (it.units || 1), 0);
      if (carry + need > max) { this.say("Too heavy to carry it all. Lighten your pack, come back."); return null; }
      for (const it of good) {
        if (it.material) this.addMaterial(it.material, it.units);
        else {
          // FUNGIBILITY (break-it food 2026-10-08): merge only into a truly
          // identical stack — name-only merging laundered kcalEach upward and
          // dropped diseaseRisk here too.
          const ex = inv.find(e => !e.material && this.stacksMatch(e, it));
          if (ex) ex.units = (ex.units || 0) + (it.units || 1);
          else inv.push(Object.assign({}, it));
        }
      }
      caches.splice(i, 1);
      const dugLabel = good.map(it => {
        const kcal = (it.kcalEach || 0) * (it.units || 1);
        return kcal > 0 ? `${it.units || 1}× ${it.name} (${this.fmtKcal ? this.fmtKcal(kcal) : kcal + ' kcal'})` : `${it.units || 1}× ${it.name}`;
      }).join(', ');
      this.say(`Dug up: ${dugLabel}. Still yours.`);
      return this.tickAction(16) || this.status();
    },
    // takeFromCache(cacheId, itemIdx, qty): draw rations from a buried cache
    // without digging it all up. Location-gated like digUpCache — you walk
    // back out there like everyone else. Weight-checked on the PORTION, not
    // the whole cache: a winter stockpile shouldn't brick because it's heavy,
    // and a miser with a full pack can still draw a few days' food.
    // A take attempted on a robbed cache discovers the theft at the hole —
    // reaching into the earth IS checking it (same rule as digUpCache).
    takeFromCache(cacheId, itemIdx, qty) {
      // MID-FIGHT / OVER (miser break-it 2026-10-10): see buryCache.
      if (this.over) return null;
      if (this.inCombat && this.inCombat()) { this.say('Not mid-fight — finish it first.'); return null; }
      const caches = this.playerCaches();
      const c = caches.find(x => x.id === cacheId);
      if (!c) return null;
      // LOCATION: a cache is where you buried it. No drawing rations from
      // the hall couch — you walk back out there like everyone else.
      const cn = c.node || {};
      if (cn.x !== this.map.px || cn.y !== this.map.py) {
        let where = 'somewhere else';
        try { where = this.nodeEpithet(cn.x, cn.y) || where; } catch (e) {}
        this.say(`Not here. Your ${this.journalName()} says: ${c.desc || ('buried at ' + where)}.`);
        return null;
      }
      if (c.found) {
        // DISCOVERY (Steve 2026-10-06): the hole is where the player LEARNS.
        this.say('You scrape at the buried spot. Disturbed earth. Nothing. Someone got here first.');
        c.discovered = true;
        try {
          const cxd = this.state.codex;
          cxd.places = cxd.places || [];
          cxd.places.push({ day: day(), text: `Cache robbed: ${c.desc}` });
        } catch (e) {}
        caches.splice(caches.indexOf(c), 1);
        return this.tickAction(8) || this.status();
      }
      const it = c.items[itemIdx];
      // STALE INDEX (miser break-it 2026-10-09): a dead index returned a
      // silent null — the Take button swallowed the tap with zero feedback.
      // No silent actions.
      if (!it) { this.say('Nothing there to take.'); return null; }
      // UNIT COERCION (miser break-it 2026-10-08): a cache item with missing
      // or NaN units went `it.units -= qty` → NaN, survived every take, and
      // yielded 1 unit per take FOREVER (measured 3 takes → 3 units from a
      // unit-less item). Coerce once: corrupt entries collapse to exactly
      // one honest unit, never an infinite.
      it.units = Math.max(1, Math.floor(it.units || 1));
      qty = Math.min(Math.floor(qty || 0), it.units || 1);
      if (qty <= 0) { this.say('Take how many?'); return null; }
      // SPOILAGE UNDERGROUND: same rule as digUpCache — the rotted portion
      // goes to the worms, the rest stays buried. Bonus-aware (break-it food
      // 2026-10-09): preservation_instinct applies underground too — the pack
      // rule and the cache rule are the same rule.
      if (!it.material && this.isSpoiled(it)) {
        this.say(`${qty}× ${it.name} went bad underground — left for the worms.`);
        it.units -= qty;
        if (it.units <= 0) c.items.splice(itemIdx, 1);
        if (!c.items.length) caches.splice(caches.indexOf(c), 1);
        return this.tickAction(8) || this.status();
      }
      // weight check — on what you're actually carrying home, not the cache
      const inv = this.state.scholar.inventory || [];
      const carry = inv.reduce((t2, i) => t2 + (i.kg || 0) * (i.units || 1), 0) + (this.waterWeight ? this.waterWeight() : 0);
      const max = this.carryCapacity ? this.carryCapacity() : 20;
      const need = (it.kg || 0) * qty;
      if (carry + need > max) { this.say('Too heavy for that much. Take less, or lighten your pack.'); return null; }
      it.units -= qty;
      if (it.material) this.addMaterial(it.material, qty);
      else {
        // FUNGIBILITY (break-it food 2026-10-08): merge only into a truly
        // identical stack — name-only merging laundered kcalEach upward and
        // dropped diseaseRisk here too.
        const ex = inv.find(e => !e.material && this.stacksMatch(e, Object.assign({}, it, { units: qty })));
        if (ex) ex.units = (ex.units || 0) + qty;
        else inv.push(Object.assign({}, it, { units: qty }));
      }
      const left = it.units;
      if (left <= 0) c.items.splice(itemIdx, 1);
      if (!c.items.length) caches.splice(caches.indexOf(c), 1);
      this.say(`Took ${qty}× ${it.name} from the cache${left > 0 ? `. ${left}× stays buried.` : '.'}`);
      return this.tickAction(8) || this.status();
    },
    // pickCacheRobber(village): the culprit is a real villager, weighted by
    // appetite. Selfish sharers and low-trust villagers are likelier; a
    // villager whose goal is survival is hungrier than most. Never the
    // player. Optional village override: after a fork/join, a cache near an
    // OLD village is robbed by one of ITS people, not the new haven's.
    pickCacheRobber(village) {
      const v = village || this.state.village || {};
      const roster = (v.roster || []).filter(id => id !== this.state.scholar.villagerId);
      if (!roster.length) return null;
      const weights = roster.map(id => {
        let wt = 1;
        try {
          const vp = (this.vpOf && this.vpOf(id)) || {};
          const pers = vp.personality || {};
          if (pers.sharing === 'selfish') wt += 2;
          else if (pers.sharing === 'pragmatic' || pers.sharing === 'hoarder') wt += 1;
          else if (pers.sharing === 'generous') wt = Math.max(0.2, wt - 0.7);
          const trust = ((v.trust || {})[id]) || 15;
          if (trust < 10) wt += 1;
          if (this.npcGoal && this.npcGoal(id) === 'survive') wt += 0.5;
        } catch (e) {}
        return wt;
      });
      let r = Math.random() * weights.reduce((a, b) => a + b, 0), i = 0;
      while (i < roster.length - 1 && (r -= weights[i]) > 0) i++;
      return roster[i];
    },
    // plantCacheTheftSuspicion: a witness saw the robber out by the cache.
    // Plants an 'observation' doubt on the TRUE robber with a theft marker —
    // the detective loop (confrontDoubt) can work it from there.
    plantCacheTheftSuspicion(vid, c, village) {
      const v = village || this.state.village || {};
      const others = (v.roster || []).filter(id => id !== vid && id !== this.state.scholar.villagerId);
      if (!others.length) return null;
      const witness = others[Math.floor(Math.random() * others.length)];
      const cn = c.node || {};
      let place = 'the wilds';
      try { place = this.nodeEpithet(cn.x, cn.y) || place; } catch (e) {}
      const wName = this.displayName(witness);
      const rName = this.displayName(vid);
      const text = `${wName} mentioned seeing ${rName} out by ${place} around day ${day()} — pack heavy, walking fast. Your cache at ${place} was robbed around then.`;
      // SAID OUTRIGHT (Steve 2026-10-06, miser loop): every other gossip path
      // in truth.js says the payload with ❓ before planting the doubt.
      // addDoubt alone only journals a generic "jotted down what they said"
      // label — the player would see DISTURBED on the caches screen with no
      // in-fiction idea why, and the gut-punch never lands. The gossip tells
      // the player outright, so the DISTURBED marker is knowledge-consistent
      // from here on. quiet:true keeps the generic label from double-posting.
      try { this.say(`❓ ${text}`); } catch (e) {}
      const d = this.addDoubt(vid, 'observation', text,
        [`${wName} saw them near ${place} (day ${day()})`, `cache robbed: ${c.label}`],
        { quiet: true });
      if (d) d.theft = { cacheId: c.id, label: c.label, place, day: day(), witness };
      c.discovered = true;
      return d;
    },
    // isStashableTool: can this inventory item be donated as a shared tool?
    isStashableTool(item) {
      if (!item || item.bonded) return false;
      // KEEPSAKE (miser break-it 2026-10-10): the stash strips tools to
      // {itemId, name} — a keepsake donated there would lose its sentimental
      // charge. Hidden in the UI; the engine (donateTool) refuses.
      if (this.isKeepsake && this.isKeepsake(item)) return false;
      const id = item.itemId || item.id;
      const def = (this.data.items || []).find(i => i.id === id);
      return !!(def && (def.class === 'tool' || (def.tool && (def.tool.woodcut || def.tool.pry))));
    },
    // cachesHtml: inline-view body for the stash/caches screen.
    cachesHtml() {
      const caches = this.playerCaches();
      // A robbed cache the player hasn't discovered yet looks untouched — the
      // DISTURBED marker is knowledge, and if you don't know, it doesn't show.
      // (Steve 2026-10-06: the marker used to appear the instant the robbery
      // fired, nodes away. Now it appears when gossip names it or when the
      // player digs.) The button reads "Check" once the player knows.
      const list = caches.length ? caches.map(c => {
        const disturbed = c.found && c.discovered;
        const head = `<p class="small">📍 ${c.desc}${disturbed ? ' — <b style="color:#e05c5c">DISTURBED</b>' : ''} ` +
          `<button class="btn ghost sm" data-cache-dig="${c.id}">${disturbed ? 'Check' : 'Dig up'}</button></p>`;
        // RATION DRAWER (miser): take some without digging it all up. One
        // qty input per cache, a Take per item — mirrors the bury form below.
        const items = (!c.found && (c.items || []).length) ? `<div style="margin:2px 0 8px 16px">` +
          c.items.map((it, idx) => {
            const kcal = (it.kcalEach || 0) * (it.units || 1);
            const nm = `${it.units || 1}× ${it.name}${kcal > 0 ? ` (${this.fmtKcal ? this.fmtKcal(kcal) : kcal + ' kcal'})` : ''}`;
            return `<span class="small">${nm} <button class="btn ghost sm" data-cache-take="${c.id}:${idx}">Take</button></span>`;
          }).join(' · ') +
          ` <input id="take-qty-${c.id}" type="number" min="1" value="1" style="width:44px" class="small" title="how many">` +
          `</div>` : '';
        return head + items;
      }).join('') : '<p class="small" style="opacity:.6">No caches. Bury something and it\'ll be here.</p>';
      // bury form: materials you carry + food you carry
      const inv = this.state.scholar.inventory || [];
      const mats = MAT_IDS.filter(m => this.materialCount(m) > 0)
        .map(m => `<option value="material:${m}">${MAT_DEFS[m].name} ×${this.materialCount(m)}</option>`).join('');
      const foods = inv.map((it, idx) => (it.kcalEach || 0) > 0 && (it.units || 0) > 0
        ? `<option value="food:${idx}">${it.name} ×${it.units}</option>` : '').join('');
      const opts = mats + foods;
      const form = opts
        ? `<div style="display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap">
             <select id="bury-what" class="small">${opts}</select>
             <input id="bury-qty" type="number" min="1" value="1" style="width:52px" class="small">
             <button class="btn sm" id="bury-go">Bury here</button>
           </div>
           <p class="small" style="opacity:.6">Takes a chunk of the day. Buried things can still be found — nothing is perfectly safe.</p>`
        : '<p class="small" style="opacity:.6">Nothing to bury. Gather something first.</p>';
      return `<p class="small"><b>📍 Your caches</b></p>${list}<p class="small" style="margin-top:8px"><b>Bury something here</b></p>${form}`;
    },
  };

  Object.assign(Game, methods);

  // ---- wrap cutTree: tool prerequisite. No axe, no felling. ----
  const origCutTree = Game.cutTree;
  if (origCutTree) Game.cutTree = function (cx, cy) {
    try {
      const detail = this.genDetail(this.map.px, this.map.py);
      const cell = detail[cy] && detail[cy][cx];
      if (cell === 'tree' || cell === 'bigtree') {
        const ci = this.cutInfo(cell);
        if (!ci.canFell) {
          this.say(ci.hint + (ci.canPrune ? ' You could prune branches instead.' : ''));
          // sizing it up costs a moment, not a day-part.
          return this.tickAction(2) || this.status();
        }
      }
    } catch (e) {}
    return origCutTree.call(this, cx, cy);
  };

  // ---- override clearBrush: tools change the work. Fiber from the stripping. ----
  const origClearBrush = Game.clearBrush;
  Game.clearBrush = function (cx, cy) {
    if (this.over) return null;
    const t = this.playerTile();
    const detail = this.genDetail(this.map.px, this.map.py);
    const cell = detail[cy] && detail[cy][cx];
    if (cell !== 'bush') { this.say('Nothing to clear there.'); return null; }
    const px = this.state.scholar.mx ?? 4, py = this.state.scholar.my ?? 4;
    if (Math.max(Math.abs(cx - px), Math.abs(cy - py)) > 1) { this.say('Too far. Step closer.'); return null; }
    const wt = this.woodcutTier();
    const rank = TIER_RANK[wt.tier] || 0;
    // machete is MADE for this; an axe helps; bare hands are slow.
    const ticks = rank >= TIER_RANK.brush ? 16 : rank >= TIER_RANK.fell ? 24 : 64;
    const kcal = rank >= TIER_RANK.brush ? 20 : rank >= TIER_RANK.fell ? 30 : 50;
    this.state.scholar.kcal = Math.max(0, this.state.scholar.kcal - kcal);
    this.addWood(1); // brushwood
    const fiber = 1 + Math.floor(Math.random() * 2);
    this.addMaterial('fiber', fiber);
    detail[cy][cx] = 'grass';
    const key = cx + ',' + cy;
    if (t.secrets) delete t.secrets[key];
    if (t.modifiers) delete t.modifiers[key];
    if (t.bushSpecies) delete t.bushSpecies[key];
    if (t.stock > 0) t.stock--;
    const toolNote = rank >= TIER_RANK.brush ? ` The ${wt.name} makes short work of it.` : rank === 0 ? ' By hand. Slow.' : '';
    this.say(`You clear the brush. +1 wood (brushwood), +${fiber} fiber.${toolNote} Easier walking here now.`);
    try { this.checkQuest('terraform'); } catch (e) {}
    return this.tickAction(ticks) || this.status();
  };

  // ---- wrap npcBatchTurn: the stash lives, caches get found. ----
  const origNpcBatchTurn = Game.npcBatchTurn;
  if (origNpcBatchTurn) Game.npcBatchTurn = function () {
    const r = origNpcBatchTurn.call(this);
    try {
      const v = this.state.village;
      const roster = (v.roster || []).filter(id => id !== this.state.scholar.villagerId);
      const lvl = this.villageTrustLevel();
      const st = this.stashState();
      // OPEN village: people contribute. Someone leaves wood by the pile.
      if (lvl === 'open' && roster.length && Math.random() < 0.06) {
        const giver = roster[Math.floor(Math.random() * roster.length)];
        const mat = Math.random() < 0.6 ? 'branch' : 'wood';
        const n = 1 + Math.floor(Math.random() * 3);
        st.materials[mat] = (st.materials[mat] || 0) + n;
        this.stashLog('give', MAT_DEFS[mat].name, n, giver);
        if (Math.random() < 0.5) {
          // firstRef: "A left 2 branches..." reads as a bug; the descriptor
          // ("the woman in her 30s") lets the player recognize the giver.
          const first = this.firstRef(giver);
          this.say(`${first} left ${n} ${matName(mat, n)} by the stash. No announcement. That's how it works here.`);
        }
      }
      // CLOSED village: the pile gets skimmed. The ledger notices, even if no one saw.
      if (lvl === 'closed' && roster.length && Math.random() < 0.05) {
        const mats = MAT_IDS.filter(m => (st.materials[m] || 0) > 0);
        if (mats.length) {
          const mat = mats[Math.floor(Math.random() * mats.length)];
          const n = Math.min(st.materials[mat], 1 + Math.floor(Math.random() * 2));
          st.materials[mat] -= n;
          // THE SKIMMER IS REAL (miser loop 2026-10-08): like cache robbery,
          // the thief is a villager with a name, not weather. If the player is
          // at the hall they might SEE it — a witnessed skim plants a real
          // doubt the detective loop (confrontDoubt) can work. Unseen, the
          // ledger just says "someone", and the keeper's only verb is to pull
          // the pile back out before it bleeds dry.
          let robber = null, seen = false;
          try {
            robber = this.pickCacheRobber();
            seen = !!(robber && this.state.scholar.insideHaven && Math.random() < 0.35);
          } catch (e) {}
          if (seen) {
            this.stashLog('take', MAT_DEFS[mat].name, n, robber);
            const rName = this.displayName(robber);
            const wtext = `You saw ${rName} palm ${n} ${matName(mat, n)} from the village stash and slide it into their pack.`;
            this.say(`👁️ ${wtext}`);
            try {
              const d = this.addDoubt(robber, 'observation', wtext,
                [`saw them take ${n}× ${MAT_DEFS[mat].name} from the stash (day ${day()})`, 'closed-village skim'],
                { quiet: true, field: 'stash_skim' });
              if (d) d.theft = { kind: 'stash', label: `${n}× ${MAT_DEFS[mat].name}`, day: day(), witness: 'you' };
            } catch (e) {}
            this.say('The stash count is off — and this time you know exactly where it went.');
          } else {
            this.stashLog('take', MAT_DEFS[mat].name, n, null); // vid null = someone
            this.say(`The stash count is off. ${n} ${matName(mat, n)} missing. Nobody saw anything. Everybody suspects something.`);
          }
          this.observe('stole');
        }
      }
      // CACHES: moved to daily roll in endDay (Steve 2026-10-07) — the per-batch
      // gate compounded to near-certain robbery over a season, making the
      // miser promise (bury far for winter) unreachable. Now one roll per day.
    } catch (e) {}
    return r;
  };

  // resolveCacheRobbery(c, village): the theft itself. Attached to Game
  // directly (next to the wrap that calls it) so tests can drive it without
  // the per-batch gate; the gate (Math.random() < p) stays in npcBatchTurn.
  // village: the nearest village to the cache (dailyCacheCheck) — after a
  // fork/join that's an archived village, and the robber comes from ITS
  // roster. Defaults to the current village for direct callers.
  Game.resolveCacheRobbery = function (c, village) {
    c.found = true;
    c.items = [];
    // THE ROBBER IS REAL: someone in the village did this. Selfish
    // mouths and low-trust villagers are likelier; anyone can be hungry.
    // (Steve: theft allowed, socially punished — the punishment needs a
    // name to land on, so the crime keeps its culprit.)
    const robber = this.pickCacheRobber(village);
    if (robber) c.robbedBy = robber;
    // DISCOVERY, NOT ANNOUNCEMENT (Steve 2026-10-06): the player learns at
    // the hole (digUpCache) or through gossip (the trace below plants a real
    // doubt). No instant say — the old "You check your cache" fired while
    // the player sat in the hall, nodes away, having checked nothing — and
    // the codex entry no longer lands before the player could know.
    // A TRACE, SOMETIMES: the woods are big, but people talk. A witness
    // mentions seeing the robber out there — a real sighting of the real
    // culprit, delivered as gossip, which is how information travels.
    // Not always: sometimes nobody saw anything and the earth keeps it.
    if (robber && Math.random() < 0.5) {
      try { this.plantCacheTheftSuspicion(robber, c, village); } catch (e) {}
    }
  };

})();
