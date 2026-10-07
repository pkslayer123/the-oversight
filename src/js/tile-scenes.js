// @ontology
// system: tile-scenes
// description: Composes each world-map tile as a miniature auto-composed SVG scene: full-bleed terrain base + a per-biome signature layer (edge-to-edge bands/canopy/pools so adjacent tiles read as a continuous world) + texture speckle + a simplified sampling of detail-grid cells (structures, water, trees, plants as mini shapes) + entity markers for player/villagers/animal when they occupy the tile + an additive day-part tint. Cached per tile on tile._sceneCache, keyed by a cheap state fingerprint; re-rendered only when meaningful state changes. Fog-of-war aware: unseen tiles render a blank dark square; "glimpse" tiles (seen from afar, not explored) render terrain only under a veil — if you don't know, it doesn't show. Terminal aesthetic, string building only (no DOM), ~64x64 viewBox readable at 40px.
// provides:
//   - svgFor(x, y, opts) -> SVG string for the tile. opts.seen decides fog; opts.tile may carry the tile directly; opts.dayPart (0-3 dawn/midday/dusk/night, default 1) tints the scene; opts.glimpse (bool, default false) renders terrain-only under a veil (no detail markers).
//   - invalidate(x, y) -> drop the cached scene for one tile
//   - invalidateAll() -> drop cached scenes for all tiles
//   - touch(x, y) -> bump the tile's scene version so the next svgFor re-renders
// rules:
//   - fog_is_blank: svgFor with opts.seen falsy returns a blank dark square (#0d120d) and never generates detail; app.js detects the blank via that exact fill, so no other render may use it (code: svgFor, blankSvg, Steve 2026-10-06)
//   - glimpse_is_terrain_only: opts.glimpse renders base + signature + texture under a dark veil, never detail markers or entities — seen-from-afar reveals terrain, not contents (code: compose, Steve 2026-10-07)
//   - daypart_is_additive: opts.dayPart only adds a tint overlay; default 1 (midday) renders exactly the pre-tint look, and callers that pass no dayPart are unaffected (code: compose, Steve 2026-10-07)
//   - cache_is_keyed: cache entries live on tile._sceneCache as {key, svg}; the key fingerprints tile type + quantized stock + scene version + dayPart + glimpse + entity signature (code: fingerprint, Steve 2026-10-06)
//   - touch_is_the_bump: forage/harvest/structure-build call touch(x, y) to force re-render; stock quantization alone is too coarse for visual freshness (code: touch, Steve 2026-10-06)
//   - miniature_not_sprite: detail cells render as simple shapes, never full sprites — this is a 40px-readable miniature (code: markerFor, Steve 2026-10-06)
//   - signature_is_biome: every tile type gets a signature layer (canopy blobs, crop rows, water bands, pools, wall fragments) drawn edge-to-edge where it helps adjacent tiles read continuously; biome must be recognizable by silhouette + palette alone at 40px (code: signature, Steve 2026-10-07)
//   - full_bleed_world: the terrain rect is full-bleed (0,0,64,64, no rounding) so the map reads as a world, not a grid of icons (code: compose, Steve 2026-10-07)
//   - entities_are_local: player/villager/animal markers only render on the player's tile, from detail-grid mx/my coords, drawn after the day tint so they stay readable at night (code: entityMarkers, Steve 2026-10-06)
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
// Steve 2026-10-07: visual polish pass — biome signature layers, full-bleed
// terrain, day-part tints, glimpse (terrain-only) knowledge gating.
(function (global) {
  'use strict';
  const S = global.Scattering = global.Scattering || {};
  const G = () => S.Game;

  const FOG_FILL = '#0d120d'; // matches .tile.fog in src/css/main.css — NEVER use in non-fog renders
  const SIZE = 64;
  const CELL = SIZE / 9; // detail cells are a 9x9 grid

  // Terrain base colors per tile type - MINECRAFT STYLE (Steve 2026-10-06).
  // Bright, saturated, readable geography. Not dark terminal.
  // (Unchanged 2026-10-07: app.js fallback palette must keep matching.)
  const TILE_BASE = {
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

  // Structure cell -> mini-shape fill. Brightened 2026-10-07 for 40px readability.
  const STRUCT_FILL = {
    lodge: '#9a7a44', tent: '#8a7a5e', fire: '#e07b2a', wall: '#55555a',
    rubble: '#4a4a4e', bridge: '#7a6a44', door: '#6a5a34', bunk: '#6a7a8a',
    gym: '#7a6a54', class: '#6a7a66',
  };
  // Cells we never draw (bare ground / interior floor).
  const SKIP_CELL = { dirt: 1, grass: 1, hall: 1 };

  // Day-part tint overlays: [fill, opacity]. null = no tint. Steve 2026-10-07.
  // Night fill is deliberately NOT #0d120d (that exact color means "fog/blank"
  // to app.js — see fog_is_blank).
  const DAY_TINT = [
    { fill: '#ff9a4a', op: 0.14 }, // dawn: warm wash
    null,                          // midday: today's look, untouched
    { fill: '#8a4a9a', op: 0.18 }, // dusk: violet wash
    { fill: '#0a1440', op: 0.50 }, // night: deep blue dim
  ];
  const GLIMPSE_VEIL = '#151f18'; // dark green-grey — never #0d120d

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

  // Per-biome signature layer: the shapes that make a biome recognizable at
  // 40px. Bands (river/creek/trail/field rows) are drawn edge-to-edge so
  // adjacent same-biome tiles read continuously — a world, not icons.
  function signature(type, x, y) {
    const rnd = seedRand(x * 911 + y * 37 + 13);
    const R = (a, b) => a + rnd() * (b - a);
    let s = '';
    const dot = (px, py, r, fill, op) =>
      '<circle cx="' + r1(px) + '" cy="' + r1(py) + '" r="' + r1(r) + '" fill="' + fill + '"' +
      (op != null ? ' opacity="' + op + '"' : '') + '/>';
    const hband = (cy, h, fill, op) =>
      '<rect x="0" y="' + r1(cy - h / 2) + '" width="64" height="' + r1(h) + '" fill="' + fill + '"' +
      (op != null ? ' opacity="' + op + '"' : '') + '/>';
    switch (type) {
      case 'river': {
        const cy = 32 + R(-5, 5);
        hband(cy, R(15, 19), '#3a8ac0');
        hband(cy + R(-2, 2), R(5, 7), '#6ac0e8', 0.75); // bright current line
        break;
      }
      case 'creek': {
        const y0 = 32 + R(-5, 5), w1 = R(-10, 10), w2 = R(-10, 10), y1 = y0 + R(-6, 6);
        s += '<path d="M-2 ' + r1(y0) + ' C 20 ' + r1(y0 + w1) + ', 44 ' + r1(y0 + w2) +
          ', 66 ' + r1(y1) + '" stroke="#3a8ac0" stroke-width="5" fill="none" stroke-linecap="round"/>';
        s += '<path d="M-2 ' + r1(y0) + ' C 20 ' + r1(y0 + w1) + ', 44 ' + r1(y0 + w2) +
          ', 66 ' + r1(y1) + '" stroke="#8ad0f0" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.7"/>';
        break;
      }
      case 'water': {
        for (let i = 0; i < 5; i++) {
          const wx = R(6, 50), wy = R(8, 56), w = R(6, 12);
          s += '<path d="M' + r1(wx) + ' ' + r1(wy) + ' q' + r1(w / 4) + ' ' + r1(-3) +
            ' ' + r1(w / 2) + ' 0 t' + r1(w / 2) + ' 0" stroke="#8ad0f0" stroke-width="1.8" fill="none" opacity="0.65"/>';
        }
        break;
      }
      case 'trail': case 'path': case 'trail_edge': {
        const cy = 32 + R(-4, 4);
        hband(cy, 13, '#cfa96a');
        hband(cy - 3.4, 2.2, '#9a7848', 0.8); // wheel ruts
        hband(cy + 3.4, 2.2, '#9a7848', 0.8);
        break;
      }
      case 'field': {
        for (let i = 0; i < 4; i++) {
          const ry = 12 + i * 13 + R(-2, 2);
          s += '<line x1="0" y1="' + r1(ry) + '" x2="64" y2="' + r1(ry) + '" stroke="#7aa844" ' +
            'stroke-width="2.6" stroke-dasharray="7 4" opacity="0.6"/>';
        }
        break;
      }
      case 'forest': {
        for (let i = 0; i < 3; i++) {
          const px = R(12, 52), py = R(12, 52), pr = R(7, 9.5);
          s += dot(px, py, pr, '#2c5c30');
          s += dot(px - pr * 0.3, py - pr * 0.3, pr * 0.38, '#3f7a45');
        }
        break;
      }
      case 'grove': {
        for (let i = 0; i < 4; i++) {
          const px = 16 + (i % 2) * 32 + R(-4, 4), py = 16 + Math.floor(i / 2) * 32 + R(-4, 4);
          s += dot(px, py, 5.5, '#357a3c');
          s += dot(px - 1.6, py - 1.6, 2, '#4c9a52');
        }
        break;
      }
      case 'thicket': {
        for (let i = 0; i < 9; i++) s += dot(R(6, 58), R(6, 58), R(2.6, 3.6), '#1f4a26');
        for (let i = 0; i < 4; i++) s += dot(R(6, 58), R(6, 58), 1.2, '#3a7a3a');
        break;
      }
      case 'meadow': {
        for (let i = 0; i < 10; i++) {
          const px = R(4, 60), py = R(4, 60);
          s += '<path d="M' + r1(px) + ' ' + r1(py) + ' l-1.6 -3.4 M' + r1(px) + ' ' + r1(py) +
            ' l0 -4 M' + r1(px) + ' ' + r1(py) + ' l1.6 -3.4" stroke="#4f9a4f" stroke-width="1.5" fill="none"/>';
        }
        const flowers = ['#ffffff', '#ffd94a', '#ff9a9a', '#ffffff'];
        for (let i = 0; i < 4; i++) s += dot(R(6, 58), R(6, 58), 1.2, flowers[i % 4]);
        break;
      }
      case 'forest_floor': {
        const litter = ['#a8763e', '#c49a5a', '#7a4a2a', '#b08a4e'];
        for (let i = 0; i < 14; i++) s += dot(R(3, 61), R(3, 61), R(1.4, 2.6), litter[i % 4]);
        break;
      }
      case 'wetland': {
        for (let i = 0; i < 3; i++) {
          const px = R(12, 52), py = R(14, 50);
          s += '<ellipse cx="' + r1(px) + '" cy="' + r1(py) + '" rx="' + r1(R(8, 12)) + '" ry="' + r1(R(5, 7)) +
            '" fill="#6fc4e0" opacity="0.8"/>';
          s += dot(px - 3, py - 2, 1.4, '#ffffff', 0.8); // clear-water glint
        }
        for (let i = 0; i < 6; i++) {
          const px = R(6, 58), py = R(10, 54);
          s += '<line x1="' + r1(px) + '" y1="' + r1(py) + '" x2="' + r1(px + R(-2, 2)) + '" y2="' + r1(py - R(7, 11)) +
            '" stroke="#3f7a4a" stroke-width="1.8"/>';
        }
        break;
      }
      case 'swamp': {
        for (let i = 0; i < 3; i++) {
          const px = R(12, 52), py = R(14, 50);
          s += '<ellipse cx="' + r1(px) + '" cy="' + r1(py) + '" rx="' + r1(R(8, 12)) + '" ry="' + r1(R(5, 7)) +
            '" fill="#3f6a58" opacity="0.85"/>'; // murk — wetland's twin, but stagnant
        }
        for (let i = 0; i < 6; i++) {
          const px = R(6, 58), py = R(10, 54);
          s += '<line x1="' + r1(px) + '" y1="' + r1(py) + '" x2="' + r1(px + R(-2, 2)) + '" y2="' + r1(py - R(7, 11)) +
            '" stroke="#2c4a34" stroke-width="1.8"/>';
        }
        for (let i = 0; i < 4; i++) s += dot(R(6, 58), R(6, 58), 2, '#9ab0a0', 0.45); // mist
        break;
      }
      case 'ruin': {
        for (let i = 0; i < 2; i++) {
          const px = R(10, 44), py = R(10, 44), w = R(9, 13), h = R(5, 7);
          s += '<rect x="' + r1(px) + '" y="' + r1(py) + '" width="' + r1(w) + '" height="' + r1(h) +
            '" fill="#6a6a6e" rx="1"/>';
          s += '<path d="M' + r1(px) + ' ' + r1(py) + ' l' + r1(w * 0.4) + ' -3 l' + r1(w * 0.6) + ' 3 Z" fill="#7d7d82"/>';
        }
        break;
      }
      case 'haven': {
        // warm heart of the village — layered glow (app.js draws 🏘️ over this tile anyway)
        s += dot(32, 32, 15, '#ffd27a', 0.16) + dot(32, 32, 9, '#ffd27a', 0.20) + dot(32, 32, 4.5, '#ffd27a', 0.28);
        break;
      }
      default: break; // unknown types: base + texture only
    }
    return s;
  }

  // Deterministic texture speckle for the terrain base (biome-aware density).
  function texture(x, y, pal, type) {
    const rnd = seedRand(x * 131 + y * 17 + 7);
    const N = type === 'forest_floor' ? 10 : type === 'water' ? 4 : 6;
    let s = '';
    for (let i = 0; i < N; i++) {
      const px = r1(2 + rnd() * 60), py = r1(2 + rnd() * 60);
      const fill = rnd() < 0.5 ? pal.tex : pal.dot;
      s += '<circle cx="' + px + '" cy="' + py + '" r="' + r1(1.1 + rnd() * 1.2) + '" fill="' + fill + '"/>';
    }
    return s;
  }

  // One mini-shape per interesting detail cell. cell = detail string, x/y = pixel center.
  // Brightened 2026-10-07: every marker must survive 40px against its base.
  function markerFor(cell, x, y) {
    if (SKIP_CELL[cell] || !cell) return '';
    const sf = STRUCT_FILL[cell];
    if (sf) {
      if (cell === 'tent') {
        return '<path d="M' + r1(x - 3.2) + ' ' + r1(y + 2.6) + ' L' + x + ' ' + r1(y - 2.8) +
          ' L' + r1(x + 3.2) + ' ' + r1(y + 2.6) + ' Z" fill="' + sf + '"/>';
      }
      if (cell === 'fire') {
        return '<circle cx="' + x + '" cy="' + y + '" r="3" fill="' + sf + '"/>' +
          '<circle cx="' + x + '" cy="' + y + '" r="1.5" fill="#ffe09a"/>';
      }
      if (cell === 'rubble') {
        return '<circle cx="' + r1(x - 1.4) + '" cy="' + r1(y + 0.8) + '" r="1.5" fill="' + sf + '"/>' +
          '<circle cx="' + r1(x + 1.2) + '" cy="' + r1(y - 0.6) + '" r="1.2" fill="#5a5a5e"/>';
      }
      return '<rect x="' + r1(x - 2.8) + '" y="' + r1(y - 2.8) + '" width="5.6" height="5.6" rx="1" fill="' + sf + '"/>';
    }
    if (cell === 'water') {
      return '<rect x="' + r1(x - 3) + '" y="' + r1(y - 3) + '" width="6" height="6" rx="1.6" fill="#2a7ab8" opacity="0.9"/>' +
        '<circle cx="' + r1(x - 1) + '" cy="' + r1(y - 1) + '" r="0.9" fill="#bfe4f8"/>';
    }
    if (cell === 'bigtree') {
      return '<circle cx="' + x + '" cy="' + y + '" r="3.8" fill="#265c2e"/>' +
        '<circle cx="' + r1(x - 1) + '" cy="' + r1(y - 1) + '" r="1.4" fill="#4c8a52"/>';
    }
    if (cell === 'tree') {
      return '<circle cx="' + x + '" cy="' + y + '" r="2.8" fill="#2f6b36"/>' +
        '<circle cx="' + r1(x - 0.7) + '" cy="' + r1(y - 0.7) + '" r="1" fill="#5aa060"/>';
    }
    if (cell === 'bush') {
      return '<circle cx="' + x + '" cy="' + y + '" r="2.2" fill="#3f8a42"/>' +
        '<circle cx="' + r1(x - 0.6) + '" cy="' + r1(y - 0.6) + '" r="0.8" fill="#5aa860"/>';
    }
    if (cell === 'plant') {
      return '<circle cx="' + x + '" cy="' + y + '" r="1.5" fill="#5cb85c"/>' +
        '<circle cx="' + r1(x - 0.4) + '" cy="' + r1(y - 0.4) + '" r="0.6" fill="#8ad88a"/>';
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

  // A few stars after the night tint so the night sky reads (Steve 2026-10-07).
  function nightStars(x, y) {
    const rnd = seedRand(x * 331 + y * 71 + 5);
    let s = '';
    for (let i = 0; i < 4; i++) {
      s += '<circle cx="' + r1(4 + rnd() * 56) + '" cy="' + r1(4 + rnd() * 56) +
        '" r="0.8" fill="#ffffff" opacity="0.85"/>';
    }
    return s;
  }

  function compose(g, t, x, y, dayPart, glimpse) {
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
      // FULL-BLEED (Steve 2026-10-07): no rounding — the map reads as a world,
      // not a grid of icons.
      let svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">' +
        '<rect x="0" y="0" width="64" height="64" fill="' + pal.base + '"/>';
      try { svg += signature(t.type, x, y); } catch (e) {}
      try { svg += texture(x, y, pal, t.type); } catch (e) {}
      // GLIMPSE (Steve 2026-10-07): seen from afar, not explored — terrain
      // only under a veil. If you don't know, it doesn't show.
      if (glimpse) {
        svg += '<rect x="0" y="0" width="64" height="64" fill="' + GLIMPSE_VEIL + '" opacity="0.5"/>';
        svg += '</svg>';
        return svg;
      }
      try { if (detail) svg += detailMarkers(detail, stockFrac); } catch (e) {}
      // DAY-PART TINT (Steve 2026-10-07): additive overlay; midday (1) = no tint.
      const tint = DAY_TINT[dayPart] || null;
      if (tint) svg += '<rect x="0" y="0" width="64" height="64" fill="' + tint.fill + '" opacity="' + tint.op + '"/>';
      if (dayPart === 3) { try { svg += nightStars(x, y); } catch (e) {} }
      try { svg += entityMarkers(g, x, y); } catch (e) {}
      svg += '</svg>';
      return svg;
    } catch (e) {
      // Absolute last resort: solid terrain color, never blank.
      const pal = FALLBACK_BASE;
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">' +
        '<rect x="0" y="0" width="64" height="64" fill="' + pal.base + '"/></svg>';
    }
  }

  function fingerprint(g, t, x, y, dayPart, glimpse) {
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
    return [t.type, stock, ver, dayPart, glimpse ? 'g' : '', wms, ent].join('|');
  }

  function safeTile(g, x, y) {
    if (!g || !g.map || !g.map.tiles) return null;
    if (typeof x !== 'number' || typeof y !== 'number' || x < 0 || y < 0 || x > 8 || y > 8) return null; // 9x9 world (2026-10-07)
    const row = g.map.tiles[y];
    return row ? row[x] || null : null;
  }

  // svgFor(x, y, opts) -> SVG string. opts.seen decides fog-of-war.
  // Additive opts (Steve 2026-10-07, default = today's behavior):
  //   opts.dayPart: 0 dawn / 1 midday / 2 dusk / 3 night (default 1)
  //   opts.glimpse: true -> terrain-only veil (seen from afar, not explored)
  function svgFor(x, y, opts) {
    const g = G();
    // Steve 2026-10-06: allow passing tile directly via opts.tile.
    // The G() lookup fails in production for unknown reasons; app.js has
    // valid tile data via Game.tileAt(), so use it if provided.
    const t = (opts && opts.tile) || safeTile(g, x, y);
    const seen = !!(opts && opts.seen);
    if (!t || !seen) return blankSvg(); // fog: never generate detail, never leak
    const dayPart = (opts && typeof opts.dayPart === 'number')
      ? Math.max(0, Math.min(3, Math.round(opts.dayPart))) : 1;
    const glimpse = !!(opts && opts.glimpse);
    const key = fingerprint(g, t, x, y, dayPart, glimpse);
    const c = t._sceneCache;
    if (c && c.key === key) return c.svg;
    const svg = compose(g, t, x, y, dayPart, glimpse);
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
