// @ontology
// system: perceive
// description: Perception system. Proximity hints, spotting.
// provides:
//   - perceptionHints()
// rules:
//   - danger_hint_derives_from_tile: the danger hint reads the player-tile monster via playerMonster(), never the possibly-stale scholar.monster alias (code: perceptionHints, explorer break-it 2026-10-09)
// consumes:
//   - scholar.perception
// ============ PERCEPTION HINTS ============
// Peripheral vision, not UI. When you're standing next to something
// interesting, you notice it — quietly, without tapping anything.
//
// A single subtle line under the grid. No popups, no flashing, no demanding
// attention. It cycles as you move (that's the point: the world tells you
// things because you're THERE), but each render is just quiet text.
//
// Priority: danger > person > cache > stash > resource > flavor.
// Most interesting/urgent hint wins; the rest wait their turn.
// Observant characters notice more (3 hints, finer detail); everyone else
// gets the top 2.
//
// Knowledge is respected: monsters show their learned name only if the
// Codex knows them; people show names only if socially learned. What you
// carry matters too: the tree hint knows whether you have an axe.
//
// Self-attaching module: adds Game.perceptionHints(), no game.js edits.
// Load order: after storage.js (woodcutTier, villageStash, playerCaches).
// Before app.js (which renders the line).

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;

  // ---- player intelligence: observant minds notice more ----
  function playerIntel() {
    try {
      const c = (Game.generatedRoster || []).find(x => x.id === Game.villagerId);
      if (c && c.intelligence) return c.intelligence;
    } catch (e) {}
    return { primary: 'steady', secondary: 'practical' };
  }
  function isObservant() {
    const i = playerIntel();
    return i.primary === 'observant' || i.secondary === 'observant';
  }

  const MAT_PLURAL = { wood: 'logs', branch: 'branches', stone: 'stones', fiber: 'fiber' };

  // perceptionHints(): [{text, priority}] sorted, capped. Strings only
  // leave this function — app.js renders them verbatim (escaped).
  Game.perceptionHints = function () {
    const hints = [];
    if (this.state.over || this.tbfight) return [];
    const s = this.state.scholar || {};
    const px = s.mx ?? 4, py = s.my ?? 4;
    const observant = isObservant();
    const push = (text, priority) => { if (text) hints.push({ text, priority }); };
    const cheb = (x1, y1, x2, y2) => Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));

    // ---- DANGER: monster close by (knowledge-gated name) ----
    try {
      // STALE-ALIAS HARDENING (explorer break-it 2026-10-09): derive from the
      // tile, like every other render path — teleports that bypass travelTo
      // (returnToVillage PIN, exile pins, debug) don't re-sync scholar.monster.
      const mon = (typeof this.playerMonster === 'function') ? this.playerMonster() : s.monster;
      if (mon) {
        const mx = mon.mx ?? mon.x, my = mon.my ?? mon.y;
        if (mx >= 0 && mx <= 8 && my >= 0 && my <= 8) {
          const d = cheb(mx, my, px, py);
          if (d <= 1 || (observant && d <= 2)) {
            const known = this.monsterKnown ? this.monsterKnown(mon.id) : false;
            const desc = this.monsterDesc ? this.monsterDesc(mon.id) : 'something moving';
            push(known ? `A ${desc} is close.` : `Something moves nearby — ${desc}.`, 100);
          }
        }
      }
    } catch (e) {}

    // ---- PERSON: who's next to you, what they're doing ----
    try {
      const vpos = (this.state.village || {}).positions || {};
      let best = null, bestD = 99;
      for (const rid of Object.keys(vpos)) {
        if (rid === this.villagerId) continue;
        const p = vpos[rid] || {};
        const d = cheb(p.mx, p.my, px, py);
        if (d <= 1 && d < bestD) { best = rid; bestD = d; }
      }
      if (best) {
        const act = this.personActivityLine ? this.personActivityLine(best) : null;
        const who = this.displayName ? this.displayName(best) : 'Someone';
        push(act ? `${who} — ${act}` : `${who} is nearby.`, 80);
      }
    } catch (e) {}

    // ---- CACHE: your buried goods on this ground ----
    try {
      if (this.playerCaches) {
        const here = this.playerCaches().filter(c => c.node && c.node.x === this.map.px && c.node.y === this.map.py);
        if (here.some(c => c.found)) push(`Disturbed earth nearby. Someone dug here.`, 65);
        else if (here.length) push(`Something of yours is buried on this ground.`, 60);
      }
    } catch (e) {}

    // ---- STASH: the village pile, at Haven ----
    // HAVEN COORD (fix 2026-10-07): tile type, not coordinates.
    try {
      let atHavenStash = false;
      try { const t = this.playerTile(); atHavenStash = !!(t && (t.type === 'haven' || t.isHaven)); } catch (e) {}
      if (atHavenStash && typeof this.stashState === 'function') {
        const st = this.stashState();
        const mats = st.materials || {};
        const parts = [];
        for (const m of ['branch', 'wood', 'stone', 'fiber']) {
          const n = mats[m] || 0;
          if (n > 0) parts.push(`${n} ${MAT_PLURAL[m] || m}`);
        }
        if ((st.tools || []).length) parts.push(`${st.tools.length} tool${st.tools.length > 1 ? 's' : ''}`);
        if (parts.length) push(`The village stash: ${parts.join(', ')}.`, 55);
      }
    } catch (e) {}

    // ---- RESOURCE: trees, water, and forageables, tool-aware ----
    try {
      const detail = this.genDetail(this.map.px, this.map.py);
      const tile = this.playerTile ? this.playerTile() : null;
      const mods = (tile && tile.modifiers) || {};
      const regrow = (tile && tile.detailRegrow) || {};
      let treeSaid = false, waterSaid = false, forageSaid = false;
      for (let dy = -1; dy <= 1 && !(treeSaid && waterSaid && forageSaid); dy++) {
        for (let dx = -1; dx <= 1 && !(treeSaid && waterSaid && forageSaid); dx++) {
          const cx = px + dx, cy = py + dy;
          if (cx < 0 || cx > 8 || cy < 0 || cy > 8) continue;
          const row = detail[cy];
          const cell = row && row[cx];
          const mod = mods[cx + ',' + cy] || {};
          const depleted = !!regrow[cx + ',' + cy];
          if (!treeSaid && cell === 'bigtree') {
            // TREE SPECIES GATING (Steve 2026-10-06): name only if known —
            // treeLevel, same as the bush branch's codex.plants level check.
            const species = (mod.species && this.treeLevel(mod.species) >= 1) ? mod.species : 'tree';
            let t;
            if (typeof this.cutInfo === 'function') {
              // cutInfo (storage.js): canFell / canPrune / toolName, data-driven.
              const ci = this.cutInfo('bigtree');
              if (ci.canFell) t = `A mature ${species}. Your ${String(ci.toolName || 'axe').toLowerCase()} could fell this.`;
              else if (ci.canPrune) t = `A mature ${species}. Too big for the ${String(ci.toolName || 'saw').toLowerCase()} — but the branches are in reach.`;
              else t = `A mature ${species}. You'd need an axe to fell it.`;
            } else {
              const wt2 = (typeof this.woodcutTier === 'function') ? (this.woodcutTier().tier || 'none') : 'none';
              if (wt2 === 'fell') t = `A mature ${species}. Your axe could fell this.`;
              else if (wt2 === 'prune' || wt2 === 'brush') t = `A mature ${species}. Too big for what you're carrying — but the branches are in reach.`;
              else t = `A mature ${species}. You'd need an axe to fell it.`;
            }
            if (observant && mod.health === 'diseased') t += ` It looks diseased.`;
            else if (observant && mod.health === 'healthy') t += ` Healthy — good timber.`;
            push(t, 50);
            treeSaid = true;
          } else if (!waterSaid && cell === 'water') {
            if (mod.flow === 'stagnant' || mod.clarity === 'murky') {
              const w = mod.flow === 'stagnant' ? 'stagnant' : 'murky';
              push(`The water here looks ${w}.`, 45);
              waterSaid = true;
            }
          } else if (!forageSaid && (cell === 'plant' || cell === 'bush' || cell === 'tree')) {
            // FORAGEABLES: the most common thing you notice. Quiet, specific.
            // Depleted ones read as picked-clean, not as bounty.
            if (depleted) {
              push(cell === 'plant' ? `Picked-over ground here. It needs time.` : `This ${cell} is picked clean. It'll recover.`, 42);
            } else if (cell === 'bush') {
              const bs = (tile.bushSpecies || {})[cx + ',' + cy];
              const codex = (this.state.codex || {}).plants || {};
              if (bs && codex[bs] && codex[bs].level >= 1) {
                const pdef = (this.data.plants || []).find(p => p.id === bs) || {};
                push(`A ${pdef.name || bs} bush, heavy with fruit.`, 48);
              } else if (bs) {
                push(`A berry bush. You don't know which kind yet.`, 48);
              } else {
                push(`A bush with berries. Worth a closer look.`, 44);
              }
            } else if (cell === 'plant') {
              push(`Something green and low-growing. Might be edible.`, 44);
            } else {
              // TREE SPECIES GATING (Steve 2026-10-06): name only if known —
              // the bush branch 10 lines above gates on codex.plants level; the
              // tree branch gets the same treatment via treeLevel.
              const sp = (mod.species && this.treeLevel(mod.species) >= 1) ? mod.species : 'nut tree';
              const art = /^[aeiou]/i.test(sp) ? 'An' : 'A';
              push(`${art} ${sp}. There might be nuts.`, 44);
            }
            forageSaid = true;
          }
        }
      }
    } catch (e) {}

    // ---- ANIMAL: normal wildlife, close ----
    try {
      const ani = s.animal;
      if (ani) {
        const d = cheb(ani.mx, ani.my, px, py);
        if (d <= 1) {
          const adef = (this.data.animals || []).find(a => a.id === ani.id) || {};
          // DESCRIPTOR GATING: no true names pre-knowledge. The strange
          // descriptor carries its own article ("a huge shelled shape...").
          const desc = (typeof this.encDescribeAnimal === 'function')
            ? this.encDescribeAnimal(adef) : 'something moving';
          const cap = (typeof this.encCap === 'function') ? this.encCap(desc) : desc;
          push(`${cap} is close, watching you.`, 40);
        }
      }
    } catch (e) {}

    // ---- CURIOSITY: the world hides things — tracks, old camps, strange
    // growths, hollows, remnants. Standing right next to one surfaces a
    // whisper, not a label. The player still has to examine the exact cell
    // to learn what it is. Once revealed, the whisper goes quiet.
    // (Without this, examine is a blind 2-tick lottery across 81 cells —
    // tedium, not exploration.)
    try {
      if (typeof this.tileFeature === 'function') {
        const detail = this.genDetail(this.map.px, this.map.py);
        const examined = (this.state.codex || {}).examined || {};
        const curiosityLines = {
          tracks: 'The ground here looks disturbed. Worth a closer look.',
          oldcamp: 'Something about this spot feels... used. Lived in.',
          strange: 'The ground here is wrong in a way you can\'t name.',
          remnant: 'That rubble doesn\'t look accidental.',
          hollow: 'That tree has a dark hollow at its base.',
          banktracks: 'The mud at the bank looks trampled.',
        };
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const cx = px + dx, cy = py + dy;
            if (cx < 0 || cx > 8 || cy < 0 || cy > 8) continue;
            const row = detail[cy];
            const cell = row && row[cx];
            if (!cell) continue;
            const feat = this.tileFeature(this.map.px, this.map.py, cx, cy, cell);
            if (!feat) continue;
            const featKey = `${this.map.px},${this.map.py},${cx},${cy}:feat`;
            if (examined[featKey]) continue;
            if (curiosityLines[feat]) { push(curiosityLines[feat], 37); }
            dy = 2; // one whisper at a time
            break;
          }
        }
      }
    } catch (e) {}

    hints.sort((a, b) => b.priority - a.priority);
    return hints.slice(0, observant ? 3 : 2).map(h => h.text);
  };
})();
