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
    wood:   { name: 'Wood log',    kg: 2.0 },
    branch: { name: 'Branch',      kg: 0.5 },
    stone:  { name: 'Stone',       kg: 0.3 },
    fiber:  { name: 'Plant fiber', kg: 0.1 },
  };
  const MAT_IDS = Object.keys(MAT_DEFS);

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
      return inv.filter(i => i.material === mat).reduce((t, i) => t + (i.units || 0), 0);
    },
    spendMaterial(mat, n) {
      let left = Math.floor(n || 0);
      if (left <= 0) return true;
      const inv = this.state.scholar.inventory || [];
      for (const item of inv) {
        if (item.material !== mat || left <= 0) continue;
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
      const n = 2 + Math.floor(Math.random() * 3);
      this.addMaterial('branch', n);
      this.say(`You work the ${wt.name} through the lower limbs. +${n} branches. The tree stands — it'll grow more.`);
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
      st.ledger.unshift({ day: day(), vid: vid || this.state.scholar.villagerId, kind, what, qty });
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
      if (n <= 0) { this.say(`You have no ${def.name.toLowerCase()} to give.`); return null; }
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
      this.say(`Set ${n} ${def.name.toLowerCase()}${n > 1 ? 's' : ''} in the village stash. The pile grows.`);
      return this.tickAction(2) || this.status();
    },
    takeMaterial(mat, n) {
      const def = MAT_DEFS[mat];
      if (!def) return null;
      const st = this.stashState();
      const have = st.materials[mat] || 0;
      n = Math.min(Math.floor(n || 0), have);
      if (n <= 0) { this.say(`The stash has no ${def.name.toLowerCase()}.`); return null; }
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
      this.say(`Took ${n} ${def.name.toLowerCase()}${n > 1 ? 's' : ''} from the stash.`);
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
        const who = e.vid ? String(this.displayName(e.vid)).split(' ')[0] : 'someone';
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
    cacheTheftChance(dist) {
      return 0.008 * Math.max(0.06, 1 - dist / 12);
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
      const desc = `${label} — buried at ${place}, day ${day()}`;
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
      if (c.found) { this.say('You dig where you buried it. Disturbed earth. Nothing. Someone got here first.'); caches.splice(i, 1); return this.tickAction(16) || this.status(); }
      // weight check
      const inv = this.state.scholar.inventory || [];
      const carry = inv.reduce((t2, it) => t2 + (it.kg || 0) * (it.units || 1), 0) + (this.waterWeight ? this.waterWeight() : 0);
      const max = this.carryCapacity ? this.carryCapacity() : 20;
      const need = c.items.reduce((t2, it) => t2 + (it.kg || 0) * (it.units || 1), 0);
      if (carry + need > max) { this.say("Too heavy to carry it all. Lighten your pack, come back."); return null; }
      for (const it of c.items) {
        if (it.material) this.addMaterial(it.material, it.units);
        else {
          const ex = inv.find(e => e.name === it.name && !e.material);
          if (ex) ex.units = (ex.units || 0) + (it.units || 1);
          else inv.push(Object.assign({}, it));
        }
      }
      caches.splice(i, 1);
      this.say(`Dug up: ${c.label}. Still yours.`);
      return this.tickAction(16) || this.status();
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
      const list = caches.length ? caches.map(c =>
        `<p class="small">📍 ${c.desc}${c.found ? ' — <b style="color:#e05c5c">DISTURBED</b>' : ''} ` +
        `<button class="btn ghost sm" data-cache-dig="${c.id}">${c.found ? 'Check' : 'Dig up'}</button></p>`
      ).join('') : '<p class="small" style="opacity:.6">No caches. Bury something and it\'ll be here.</p>';
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
          const first = String(this.displayName(giver)).split(' ')[0];
          this.say(`${first} left ${n} ${MAT_DEFS[mat].name.toLowerCase()}${n > 1 ? 's' : ''} by the stash. No announcement. That's how it works here.`);
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
          this.say(`The stash count is off. ${n} ${MAT_DEFS[mat].name.toLowerCase()}${n > 1 ? 's' : ''} missing. Nobody saw anything. Everybody suspects something.`);
          this.observe('stole');
        }
      }
      // CACHES: buried things are safer, not safe. Steve's rule: theft risk
      // falls with distance from any village/haven — bury far from people,
      // safer from people. ~0.8%/batch at the haven's doorstep → ~0.05%/batch far wild.
      const spots = [];
      if (this.state.village && this.state.village.x != null) spots.push(this.state.village);
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
        if (Math.random() < p) {
          c.found = true;
          c.items = [];
          this.say('You check your cache. Disturbed earth. Empty. Someone found it.');
          try {
            const cx2 = this.state.codex;
            cx2.places = cx2.places || [];
            cx2.places.push({ day: day(), text: `Cache robbed: ${c.label} — ${c.desc}` });
          } catch (e) {}
        }
      }
    } catch (e) {}
    return r;
  };

})();
