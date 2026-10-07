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
//   - takeTool(itemId)
//   - isStashableTool(item)
//   - stashState()
//   - stashHtml()
//   - stashLog()
//   - stashLedgerText()
//   - buryCache()
//   - digUpCache()
//   - takeFromCache(cacheId, itemIdx, qty)
//   - playerCaches()
//   - cachesHtml()
//   - cacheTheftChance()
//   - pickCacheRobber()
//   - plantCacheTheftSuspicion()
//   - villageTrustLevel()
// rules:
//   - (none documented)
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
      v.stash = v.stash || { materials: { wood: 0, branch: 0, stone: 0, fiber: 0 }, tools: [], ledger: [] };
      v.stash.materials = v.stash.materials || {};
      for (const m of MAT_IDS) if (v.stash.materials[m] === undefined) v.stash.materials[m] = 0;
      v.stash.tools = v.stash.tools || [];
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
    // villageTrustLevel: open (nobody worries), wary, closed (hoard and hide).
    villageTrustLevel() {
      const v = this.state.village;
      const ids = (v.roster || []).filter(id => id !== this.state.scholar.villagerId);
      if (!ids.length) return 'open';
      const t = v.trust || {};
      const avg = ids.reduce((s, id) => s + (t[id] || 15), 0) / ids.length;
      return avg >= 50 ? 'open' : avg >= 25 ? 'wary' : 'closed';
    },
    donateMaterial(mat, n) {
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
      v.trust[vid] = Math.min(100, (v.trust[vid] || 15) + 1);
      v.stashGives = v.stashGives || {};
      v.stashGives[vid] = (v.stashGives[vid] || 0) + n;
      this.observe('donate');
      this.say(`Set ${n} ${matName(mat, n)} in the village stash. The pile grows.`);
      return this.tickAction(2) || this.status();
    },
    takeMaterial(mat, n) {
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
      v.stashGives = v.stashGives || {}; v.stashTakes = v.stashTakes || {};
      v.stashTakes[vid] = (v.stashTakes[vid] || 0) + n;
      const net = (v.stashGives[vid] || 0) - (v.stashTakes[vid] || 0);
      if (net < -20) {
        v.trust = v.trust || {};
        v.trust[vid] = Math.max(0, (v.trust[vid] || 15) - 2);
        this.observe('hoard');
        if (Math.random() < 0.4) this.say('Someone watches you take from the stash. They say nothing. The ledger says everything.');
      }
      this.say(`Took ${n} ${matName(mat, n)} from the stash.`);
      return this.tickAction(2) || this.status();
    },
    // donateTool / takeTool: spare tools live in the stash for anyone to use.
    // (Borrowing is trust-neutral in an open village; in a closed one it's noticed.)
    donateTool(idx) {
      const inv = this.state.scholar.inventory || [];
      const item = inv[idx];
      if (!item) return null;
      const id = item.itemId || item.id;
      const def = (this.data.items || []).find(i => i.id === id);
      const isTool = def && (def.class === 'tool' || (def.tool && (def.tool.woodcut || def.tool.pry)));
      if (!isTool) { this.say("That's not a tool the village can share."); return null; }
      if (item.bonded) { this.say("That's yours. Bonded. Not the village's."); return null; }
      inv.splice(idx, 1);
      const st = this.stashState();
      st.tools.push({ itemId: id, name: item.name || def.name });
      this.stashLog('give', item.name || def.name, 1);
      const v = this.state.village, vid = this.state.scholar.villagerId;
      v.trust = v.trust || {};
      v.trust[vid] = Math.min(100, (v.trust[vid] || 15) + 2);
      this.say(`Left your ${item.name || def.name} in the stash. Anyone who needs it can take it.`);
      return this.tickAction(2) || this.status();
    },
    takeTool(itemId) {
      if (this.havenStoresAccess && this.havenStoresAccess() === 'none') {
        this.say('The stash is in the hall. Your hands are not.');
        return null;
      }
      const st = this.stashState();
      const i = st.tools.findIndex(t => t.itemId === itemId);
      if (i < 0) { this.say("It's not there anymore."); return null; }
      const [tool] = st.tools.splice(i, 1);
      const def = (this.data.items || []).find(x => x.id === itemId) || {};
      const inv = this.state.scholar.inventory || [];
      inv.push({ itemId, name: tool.name, units: 1, kcalEach: 0, kg: def.kg || 0.8 });
      this.stashLog('take', tool.name, 1);
      const lvl = this.villageTrustLevel();
      if (lvl === 'closed' && Math.random() < 0.5) {
        this.say(`You take the ${tool.name}. In this village, people notice who takes tools.`);
        this.observe('hoard');
      } else {
        this.say(`Took the ${tool.name} from the stash. Bring it back when you're done.`);
      }
      return this.tickAction(2) || this.status();
    },
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
        `<span class="small">🔧 ${t.name} <button class="btn ghost sm" data-stash-tool="${t.itemId}">Take</button></span>`
      ).join(' · ') || '<span class="small" style="opacity:.6">no spare tools</span>';
      return `<p class="small" style="margin-top:8px"><b>📦 Village stash</b> <span style="opacity:.6">(${lvlNote})</span></p>` +
        rows +
        `<p class="small">🔧 Spare tools: ${tools}</p>` +
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
        if (this.state.village) spots.push({ x: this.state.village.px ?? 3, y: this.state.village.py ?? 3 });
        for (const ov of (this.state.otherVillages || [])) spots.push(ov);
        for (const c of this.playerCaches()) {
          if (c.found) continue;
          const cn = c.node || {};
          let nearest = Infinity;
          for (const s of spots) {
            const d = Math.abs((s.x || 0) - (cn.x || 0)) + Math.abs((s.y || 0) - (cn.y || 0));
            if (d < nearest) nearest = d;
          }
          if (!isFinite(nearest)) nearest = 5;
          const p = this.cacheTheftChance(nearest);
          if (Math.random() < p) this.resolveCacheRobbery(c);
        }
      } catch (e) {}
    },
    // buryCache(kind, key, qty): kind 'material' (key = mat id) or 'food' (key = inventory idx).
    buryCache(kind, key, qty) {
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
        qty = Math.min(qty, it.units || 1);
        const kcal = (it.kcalEach || 0) * qty;
        items.push({ name: it.name, kcalEach: it.kcalEach, units: qty, spoilDay: it.spoilDay, safe: it.safe, kg: it.kg, unit: it.unit });
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
        const dx = node.x - (hv.px ?? 3), dy = node.y - (hv.py ?? 3);
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
      const today = day();
      const good = [], bad = [];
      for (const it of c.items) {
        const spoiled = !it.material && it.spoilDay !== undefined && it.spoilDay !== null && it.spoilDay <= today;
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
          const ex = inv.find(e => e.name === it.name && !e.material);
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
      if (!it) return null;
      qty = Math.min(Math.floor(qty || 0), it.units || 1);
      if (qty <= 0) { this.say('Take how many?'); return null; }
      // SPOILAGE UNDERGROUND: same rule as digUpCache — the rotted portion
      // goes to the worms, the rest stays buried.
      const today = day();
      if (!it.material && it.spoilDay !== undefined && it.spoilDay !== null && it.spoilDay <= today) {
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
        const ex = inv.find(e => e.name === it.name && !e.material);
        if (ex) ex.units = (ex.units || 0) + qty;
        else inv.push(Object.assign({}, it, { units: qty }));
      }
      const left = it.units;
      if (left <= 0) c.items.splice(itemIdx, 1);
      if (!c.items.length) caches.splice(caches.indexOf(c), 1);
      this.say(`Took ${qty}× ${it.name} from the cache${left > 0 ? `. ${left}× stays buried.` : '.'}`);
      return this.tickAction(8) || this.status();
    },
    // pickCacheRobber: the culprit is a real villager, weighted by appetite.
    // Selfish sharers and low-trust villagers are likelier; a villager whose
    // goal is survival is hungrier than most. Never the player.
    pickCacheRobber() {
      const v = this.state.village || {};
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
    plantCacheTheftSuspicion(vid, c) {
      const v = this.state.village || {};
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
          this.stashLog('take', MAT_DEFS[mat].name, n, null); // vid null = someone
          this.say(`The stash count is off. ${n} ${matName(mat, n)} missing. Nobody saw anything. Everybody suspects something.`);
          this.observe('stole');
        }
      }
      // CACHES: moved to daily roll in endDay (Steve 2026-10-07) — the per-batch
      // gate compounded to near-certain robbery over a season, making the
      // miser promise (bury far for winter) unreachable. Now one roll per day.
    } catch (e) {}
    return r;
  };

  // resolveCacheRobbery(c): the theft itself. Attached to Game directly (next
  // to the wrap that calls it) so tests can drive it without the per-batch
  // gate; the gate (Math.random() < p) stays in npcBatchTurn.
  Game.resolveCacheRobbery = function (c) {
    c.found = true;
    c.items = [];
    // THE ROBBER IS REAL: someone in the village did this. Selfish
    // mouths and low-trust villagers are likelier; anyone can be hungry.
    // (Steve: theft allowed, socially punished — the punishment needs a
    // name to land on, so the crime keeps its culprit.)
    const robber = this.pickCacheRobber();
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
      try { this.plantCacheTheftSuspicion(robber, c); } catch (e) {}
    }
  };

})();
