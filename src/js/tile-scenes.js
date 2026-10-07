// @ontology
// system: tile-scenes
// description: Composes each world-map tile as a miniature auto-composed SVG scene: terrain base + a simplified sampling of detail-grid cells (structures, water, trees, plants as mini shapes) + entity markers for player/villagers/monster/animal when they occupy the tile. Cached per tile on tile._sceneCache, keyed by a cheap state fingerprint; re-rendered only when meaningful state changes. Fog-of-war aware: unseen tiles render a blank dark square. Terminal aesthetic, string building only (no DOM), ~64x64 viewBox readable at 40px.
// provides:
//   - svgFor(x, y, opts) -> SVG string for the tile (opts.seen decides fog)
//   - invalidate(x, y) -> drop the cached scene for one tile
//   - invalidateAll() -> drop cached scenes for all tiles
//   - touch(x, y) -> bump the tile's scene version so the next svgFor re-renders
// rules:
//   - fog_is_blank: svgFor with opts.seen falsy returns a blank dark square and never generates detail (code: svgFor, Steve 2026-10-06)
//   - cache_is_keyed: cache entries live on tile._sceneCache as {key, svg}; the key fingerprints tile type + quantized stock + scene version + entity signature (code: fingerprint, Steve 2026-10-06)
//   - touch_is_the_bump: forage/harvest/structure-build call touch(x, y) to force re-render; stock quantization alone is too coarse for visual freshness (code: touch, Steve 2026-10-06)
//   - miniature_not_sprite: detail cells render as simple shapes, never full sprites — this is a 40px-readable miniature (code: markerFor, Steve 2026-10-06)
//   - entities_are_local: player/villager/animal markers only render on the player's tile, from detail-grid mx/my coords (code: entityMarkers, Steve 2026-10-06)
//   - no_monster_markers: the map shows geography only, never live monster positions (code: entityMarkers, Steve 2026-10-06)
//   - no_dom: composition is pure string building; safe to call from hot paths and off-thread tests (code: compose, Steve 2026-10-06)
// consumes:
//   - Game.tileAt, Game.genDetail (detail-grid generation)
//   - Game.map.px/py (player tile), Game.state.scholar (mx,my,animal)
//   - Game.state.worldMonsters (NOT rendered on map — geography only, Steve 2026-10-06)
//   - Game.state.village.positions (villager detail-grid positions)
// ============ TILE SCENES: miniature SVG scenes per world-map tile ============
// Steve 2026-10-06: "start the real SVG project" — tiles as auto-composed SVG
// miniature scenes (terrain base + what's actually on the tile), cached per
// tile, re-rendered only when meaningful state changes.
(function (global) {
  'use strict';
  const S = global.Scattering = global.Scattering || {};
  const G = () => S.Game;

  const FOG_FILL = '#0d120d'; // matches .tile.fog in src/css/main.css
  const SIZE = 64;
  const CELL = SIZE / 9; // detail cells are a 9x9 grid

  // Terrain base colors per tile type - MINECRAFT STYLE (Steve 2026-10-06).
  // Bright, saturated, readable geography. Not dark terminal.
  const TILE_BASE = {
    // TRUE MINECRAFT PALETTE (Steve 2026-10-06) - unmistakably bright, saturated.
    forest_floor: { base: '#8a5a3a', tex: '#9a6a45', dot: '#7a4a2a' },
    forest:       { base: '#5a8a3a', tex: '#6a9a45', dot: '#4a7a2a' },
    grove:        { base: '#7cbd6b', tex: '#8acd7b', dot: '#6cad5b' },
    meadow:       { base: '#7cbd6b', tex: '#8acd7b', dot: '#6cad5b' },
    field:        { base: '#a0d060', tex: '#b0e070', dot: '#90c050' },
    thicket:      { base: '#4a8a3a', tex: '#5a9a45', dot: '#3a7a2a' },
    wetland:      { base: '#5aa0b0', tex: '#6ab0c0', dot: '#4a90a0' },
    swamp:        { base: '#5aa0b0', tex: '#6ab0c0', dot: '#4a90a0' },
    creek:        { base: '#4a9ad0', tex: '#5aaae0', dot: '#3a8ac0' },
    water:        { base: '#4a9ad0', tex: '#5aaae0', dot: '#3a8ac0' },
    river:        { base: '#4a9ad0', tex: '#5aaae0', dot: '#3a8ac0' },
    trail_edge:   { base: '#c0a060', tex: '#d0b070', dot: '#b09050' },
    trail:        { base: '#c0a060', tex: '#d0b070', dot: '#b09050' },
    path:         { base: '#c0a060', tex: '#d0b070', dot: '#b09050' },
    ruin:         { base: '#9a9a9a', tex: '#aaaaaa', dot: '#8a8a8a' },
    haven:        { base: '#7cbd6b', tex: '#8acd7b', dot: '#6cad5b' },
  };
  const FALLBACK_BASE = { base: '#7aaa4a', tex: '#8aba5a', dot: '#5a8a3a' }; // bright meadow, never dark

  // Structure cell -> mini-shape fill.
  const STRUCT_FILL = {
    lodge: '#8a6a3c', tent: '#7a6a52', fire: '#e07b2a', wall: '#4a4a4e',
    rubble: '#3a3a3e', bridge: '#6a5a3a', door: '#5a4a2a', bunk: '#5a6a7a',
    gym: '#6a5a4a', class: '#5a6a5a',
  };
  // Cells we never draw (bare ground / interior floor).
  const SKIP_CELL = { dirt: 1, grass: 1, hall: 1 };

  function seedRand(n) {
    let s = (n >>> 0) || 1;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  const r1 = (n) => Math.round(n * 10) / 10;
  const cx2x = (cx) => r1((cx + 0.5) * CELL);
  const cy2y = (cy) => r1((cy + 0.5) * CELL);

  function blankSvg() {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<rect x="0" y="0" width="64" height="64" rx="7" fill="' + FOG_FILL + '"/></svg>';
  }

  // Deterministic texture speckle for the terrain base.
  function texture(x, y, pal) {
    const rnd = seedRand(x * 131 + y * 17 + 7);
    let s = '';
    for (let i = 0; i < 6; i++) {
      const px = r1(4 + rnd() * 56), py = r1(4 + rnd() * 56);
      const fill = rnd() < 0.5 ? pal.tex : pal.dot;
      s += '<circle cx="' + px + '" cy="' + py + '" r="' + r1(1.1 + rnd() * 1.2) + '" fill="' + fill + '"/>';
    }
    return s;
  }

  // One mini-shape per interesting detail cell. cell = detail string, x/y = pixel center.
  function markerFor(cell, x, y) {
    if (SKIP_CELL[cell] || !cell) return '';
    const sf = STRUCT_FILL[cell];
    if (sf) {
      if (cell === 'tent') {
        return '<path d="M' + r1(x - 3.2) + ' ' + r1(y + 2.6) + ' L' + x + ' ' + r1(y - 2.8) +
          ' L' + r1(x + 3.2) + ' ' + r1(y + 2.6) + ' Z" fill="' + sf + '"/>';
      }
      if (cell === 'fire') {
        return '<circle cx="' + x + '" cy="' + y + '" r="2.8" fill="' + sf + '"/>' +
          '<circle cx="' + x + '" cy="' + y + '" r="1.2" fill="#ffd27a"/>';
      }
      if (cell === 'rubble') {
        return '<circle cx="' + r1(x - 1.4) + '" cy="' + r1(y + 0.8) + '" r="1.4" fill="' + sf + '"/>' +
          '<circle cx="' + r1(x + 1.2) + '" cy="' + r1(y - 0.6) + '" r="1.1" fill="' + sf + '"/>';
      }
      return '<rect x="' + r1(x - 2.8) + '" y="' + r1(y - 2.8) + '" width="5.6" height="5.6" rx="1" fill="' + sf + '"/>';
    }
    if (cell === 'water') {
      return '<rect x="' + r1(x - 3) + '" y="' + r1(y - 3) + '" width="6" height="6" rx="1.6" fill="#2a6a8a" opacity="0.85"/>';
    }
    if (cell === 'bigtree') {
      return '<circle cx="' + x + '" cy="' + y + '" r="3.4" fill="#1e4a24"/>' +
        '<circle cx="' + r1(x - 0.8) + '" cy="' + r1(y - 0.8) + '" r="1.2" fill="#2f6a34"/>';
    }
    if (cell === 'tree') {
      return '<circle cx="' + x + '" cy="' + y + '" r="2.5" fill="#24542b"/>';
    }
    if (cell === 'bush') {
      return '<circle cx="' + x + '" cy="' + y + '" r="2" fill="#3a7a3a"/>';
    }
    if (cell === 'plant') {
      return '<circle cx="' + x + '" cy="' + y + '" r="1.4" fill="#55a04e"/>';
    }
    return '';
  }

  // Priority for sampling: structures > water > trees > undergrowth.
  function cellPriority(cell) {
    if (STRUCT_FILL[cell]) return 0;
    if (cell === 'water') return 1;
    if (cell === 'bigtree' || cell === 'tree') return 2;
    if (cell === 'plant' || cell === 'bush') return 3;
    return 9;
  }

  // Sample up to MAX detail markers from the 9x9 grid. Stock trims plant/bush
  // markers so a foraged-out tile visibly thins.
  function detailMarkers(detail, stockFrac) {
    const found = [];
    for (let cy = 0; cy < 9; cy++) {
      for (let cx = 0; cx < 9; cx++) {
        const row = detail[cy];
        const cell = row && row[cx];
        if (SKIP_CELL[cell] || !cell) continue;
        found.push({ cell, cx, cy, p: cellPriority(cell), edible: cell === 'plant' || cell === 'bush' });
      }
    }
    if (!found.length) return '';
    found.sort((a, b) => a.p - b.p || (a.cy * 9 + a.cx) - (b.cy * 9 + b.cx));
    const MAX = 16;
    const keep = [];
    for (const f of found) {
      if (keep.length >= MAX) break;
      keep.push(f);
    }
    const edibles = keep.filter(k => k.edible);
    const keepEdible = Math.max(edibles.length > 0 ? 1 : 0, Math.ceil(edibles.length * stockFrac));
    let edibleSeen = 0;
    let s = '';
    for (const k of keep) {
      if (k.edible) {
        edibleSeen++;
        if (edibleSeen > keepEdible) continue; // foraged out: fewer green dots
      }
      s += markerFor(k.cell, cx2x(k.cx), cy2y(k.cy));
    }
    return s;
  }

  function entityMarkers(g, x, y) {
    if (!g || !g.map) return '';
    const st = g.state || {};
    const sch = st.scholar || {};
    const onPlayerTile = (g.map.px === x && g.map.py === y);
    let s = '';
    const dot = (mx, my, shape) => {
      if (typeof mx !== 'number' || typeof my !== 'number') return '';
      return shape(cx2x(Math.max(0, Math.min(8, mx))), cy2y(Math.max(0, Math.min(8, my))));
    };
    const diamond = (mx, my) => dot(mx, my, (px, py) =>
      '<path d="M' + px + ' ' + r1(py - 3) + ' L' + r1(px + 3) + ' ' + py +
      ' L' + px + ' ' + r1(py + 3) + ' L' + r1(px - 3) + ' ' + py + ' Z" fill="#e04040"/>');
    // NO MONSTER MARKERS (Steve 2026-10-06): the map is the map. It shows
    // geography, not live monster positions. Monster tracking is a future
    // codex/ability feature (hunt or combat affinity), not a map default.
    if (!onPlayerTile) return s;
    // player: white dot with ring
    s += dot(sch.mx != null ? sch.mx : 4, sch.my != null ? sch.my : 4, (px, py) =>
      '<circle cx="' + px + '" cy="' + py + '" r="3.6" fill="none" stroke="#ffffff" stroke-width="1.2"/>' +
      '<circle cx="' + px + '" cy="' + py + '" r="2" fill="#ffffff"/>');
    // villagers: soft green dots
    const vpos = (st.village && st.village.positions) || {};
    for (const rid of Object.keys(vpos)) {
      const pos = vpos[rid] || {};
      s += dot(pos.mx, pos.my, (px, py) =>
        '<circle cx="' + px + '" cy="' + py + '" r="2.2" fill="#a8d5a2" stroke="#3a5a3a" stroke-width="0.8"/>');
    }
    // animal: small brown dot
    if (sch.animal) {
      s += dot(sch.animal.mx, sch.animal.my, (px, py) =>
        '<circle cx="' + px + '" cy="' + py + '" r="1.8" fill="#a07040"/>');
    }
    return s;
  }

  function compose(g, t, x, y) {
    // ROBUST (Steve 2026-10-06): the generator must not fail. If detail
    // isn't available, show the base terrain — never blank, never throw.
    try {
      const pal = TILE_BASE[t.type] || FALLBACK_BASE;
      let detail = null;
      try {
        detail = t.detail;
        if (!detail && g.genDetail) detail = g.genDetail(x, y);
      } catch (e) { detail = null; }
      const stockFrac = (typeof t.stock === 'number' && typeof t.maxStock === 'number' && t.maxStock > 0)
        ? Math.max(0, Math.min(1, t.stock / t.maxStock)) : 1;
      let svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
        '<rect x="0.5" y="0.5" width="63" height="63" rx="7" fill="' + pal.base + '"/>';
      try { svg += texture(x, y, pal); } catch (e) {}
      try { if (detail) svg += detailMarkers(detail, stockFrac); } catch (e) {}
      try { svg += entityMarkers(g, x, y); } catch (e) {}
      svg += '</svg>';
      return svg;
    } catch (e) {
      // Absolute last resort: solid terrain color, never blank.
      const pal = FALLBACK_BASE;
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
        '<rect x="0.5" y="0.5" width="63" height="63" rx="7" fill="' + pal.base + '"/></svg>';
    }
  }

  function fingerprint(g, t, x, y) {
    const stock = (typeof t.stock === 'number' && typeof t.maxStock === 'number' && t.maxStock > 0)
      ? Math.round((t.stock / t.maxStock) * 10) : 10;
    const ver = t._sceneVer || 0;
    // Entity signature: rounded detail-grid coords so the cache busts when
    // anyone moves; villagers are rid->pos pairs on the player tile.
    // No monster positions in fingerprint (Steve 2026-10-06): map shows
    // geography only, not live monsters.
    let wms = '';
    let ent = '';
    if (g && g.map && g.map.px === x && g.map.py === y && g.state) {
      const sch = g.state.scholar || {};
      const vpos = (g.state.village && g.state.village.positions) || {};
      const vps = Object.keys(vpos).sort().map(rid => {
        const p = vpos[rid] || {};
        return rid + ':' + Math.round(p.mx || 0) + ',' + Math.round(p.my || 0);
      }).join(';');
      ent = [Math.round(sch.mx != null ? sch.mx : 4), Math.round(sch.my != null ? sch.my : 4),
        sch.animal ? (Math.round(sch.animal.mx) + ',' + Math.round(sch.animal.my)) : '-',
        vps].join('|');
    }
    return [t.type, stock, ver, wms, ent].join('|');
  }

  function safeTile(g, x, y) {
    if (!g || !g.map || !g.map.tiles) return null;
    if (typeof x !== 'number' || typeof y !== 'number' || x < 0 || y < 0 || x > 6 || y > 6) return null;
    const row = g.map.tiles[y];
    return row ? row[x] || null : null;
  }

  // svgFor(x, y, opts) -> SVG string. opts.seen decides fog-of-war.
  function svgFor(x, y, opts) {
    const g = G();
    // Steve 2026-10-06: allow passing tile directly via opts.tile.
    // The G() lookup fails in production for unknown reasons; app.js has
    // valid tile data via Game.tileAt(), so use it if provided.
    const t = (opts && opts.tile) || safeTile(g, x, y);
    const seen = !!(opts && opts.seen);
    if (!t || !seen) return blankSvg(); // fog: never generate detail, never leak
    const key = fingerprint(g, t, x, y);
    const c = t._sceneCache;
    if (c && c.key === key) return c.svg;
    const svg = compose(g, t, x, y);
    t._sceneCache = { key, svg };
    return svg;
  }

  function invalidate(x, y) {
    const g = G();
    const t = safeTile(g, x, y);
    if (t) delete t._sceneCache;
  }

  function invalidateAll() {
    const g = G();
    if (!g || !g.map || !g.map.tiles) return;
    for (let y = 0; y < g.map.tiles.length; y++) {
      const row = g.map.tiles[y] || [];
      for (let x = 0; x < row.length; x++) {
        if (row[x]) delete row[x]._sceneCache;
      }
    }
  }

  // touch(x, y): bump the scene version so the next svgFor re-renders.
  // Call after forage/harvest/structure-build/tile change.
  function touch(x, y) {
    const g = G();
    const t = safeTile(g, x, y);
    if (t) t._sceneVer = (t._sceneVer || 0) + 1;
  }

  S.TileScenes = { svgFor, invalidate, invalidateAll, touch, FOG_FILL };
})(globalThis);
// Force deploy 2026-10-07
