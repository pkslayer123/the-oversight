// @ontology
// system: sprites
// description: Custom SVG sprite registry for the visual identity law.
//   Every final form (known plant/item/monster) gets a unique sprite that
//   actually looks like the thing. Unknowns fall back through the taxonomy:
//   root (plant/tree/bush — what you see from far away) -> category
//   (berry bush — from examination) -> specific (blackberry — from codex).
// provides:
//   - Sprites.get(id) -> svg string or null
//   - Sprites.plantSprite(pid, depth) -> svg for chain depth
//   - Sprites.chainFor(pid) -> [root, category, specific]
// rules:
//   - (none documented)
// consumes:
//   - (none documented)
(function (global) {
  'use strict';
  const S = global.Scattering = global.Scattering || {};

  // All sprites: viewBox 0 0 32 32, designed to read at 32px grid size.
  const SPRITES = {
    generic_plant: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" class="sprite"><path d="M16 28 L16 14" stroke="#3f7a33" stroke-width="2" stroke-linecap="round"/><ellipse cx="11" cy="18" rx="4" ry="2.4" fill="#4da63f" transform="rotate(-25 11 18)"/><ellipse cx="21" cy="18" rx="4" ry="2.4" fill="#4da63f" transform="rotate(25 21 18)"/><ellipse cx="12" cy="12" rx="3" ry="2" fill="#578a45" transform="rotate(-15 12 12)"/><ellipse cx="20" cy="12" rx="3" ry="2" fill="#578a45" transform="rotate(15 20 12)"/></svg>`,
    generic_bush: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" class="sprite"><rect x="14.5" y="24" width="3" height="6" rx="1" fill="#5a4326"/><ellipse cx="10" cy="21" rx="6.5" ry="5.5" fill="#3d6b2f"/><ellipse cx="22" cy="21" rx="6.5" ry="5.5" fill="#3d6b2f"/><ellipse cx="16" cy="17.5" rx="8" ry="6.5" fill="#4a7d3a"/><ellipse cx="12" cy="15" rx="3.5" ry="2.5" fill="#578a45" opacity="0.8"/><ellipse cx="20" cy="16" rx="3" ry="2.2" fill="#578a45" opacity="0.8"/></svg>`,
    generic_tree: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" class="sprite"><rect x="14" y="18" width="4" height="12" rx="1.5" fill="#5a4326"/><ellipse cx="16" cy="12" rx="10" ry="8" fill="#3d6b2f"/><ellipse cx="11" cy="9" rx="5" ry="4" fill="#4a7d3a"/><ellipse cx="21" cy="10" rx="5" ry="4" fill="#4a7d3a"/><ellipse cx="16" cy="7" rx="4" ry="3" fill="#578a45" opacity="0.85"/></svg>`,
    berry_bush: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" class="sprite"><rect x="14.5" y="24" width="3" height="6" rx="1" fill="#5a4326"/><ellipse cx="10" cy="21" rx="6.5" ry="5.5" fill="#3d6b2f"/><ellipse cx="22" cy="21" rx="6.5" ry="5.5" fill="#3d6b2f"/><ellipse cx="16" cy="17.5" rx="8" ry="6.5" fill="#4a7d3a"/><g fill="#c0392b"><circle cx="11" cy="17" r="1.6"/><circle cx="15" cy="15" r="1.6"/><circle cx="19" cy="16" r="1.6"/><circle cx="22" cy="19" r="1.6"/><circle cx="13" cy="20" r="1.6"/><circle cx="18" cy="21" r="1.6"/><circle cx="21" cy="14" r="1.4"/><circle cx="9" cy="20" r="1.4"/></g><g fill="#e67e22" opacity="0.7"><circle cx="10.5" cy="16.5" r="0.6"/><circle cx="18.5" cy="15.5" r="0.6"/><circle cx="21.5" cy="18.5" r="0.6"/></g></svg>`,
    berry_plant: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" class="sprite"><path d="M16 28 L16 20 M16 24 L10 22 M16 24 L22 22" stroke="#3f7a33" stroke-width="1.6"/><g fill="#4da63f"><ellipse cx="10" cy="20" rx="3.5" ry="2.2" transform="rotate(-20 10 20)"/><ellipse cx="22" cy="20" rx="3.5" ry="2.2" transform="rotate(20 22 20)"/><ellipse cx="16" cy="18" rx="3.5" ry="2.2"/></g><g fill="#c0392b"><circle cx="12" cy="24" r="1.8"/><circle cx="20" cy="24" r="1.8"/><circle cx="16" cy="26" r="1.8"/></g><g fill="#e67e22" opacity="0.7"><circle cx="11.5" cy="23.5" r="0.6"/><circle cx="19.5" cy="23.5" r="0.6"/></g></svg>`,
    blackberry: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" class="sprite"><path d="M9 30 C11 22 13 16 15 10" stroke="#6b4a2a" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M23 30 C22 24 21 19 19 14" stroke="#6b4a2a" stroke-width="2.2" fill="none" stroke-linecap="round"/><polygon points="15,10 9,6 11,12 7,10 10,16 13,13" fill="#3f7a33" stroke="#2e5c26" stroke-width="0.8"/><polygon points="19,14 24,10 23,16 27,14 24,20 21,17" fill="#3f7a33" stroke="#2e5c26" stroke-width="0.8"/><polygon points="9,30 5,26 7,31 4,30 8,33" fill="#4a8a3c" stroke="#2e5c26" stroke-width="0.8"/><g><circle cx="22" cy="7" r="1.9" fill="#241a33"/><circle cx="19.8" cy="8.5" r="1.9" fill="#241a33"/><circle cx="24.2" cy="8.5" r="1.9" fill="#241a33"/><circle cx="20.5" cy="11" r="1.9" fill="#2e2242"/><circle cx="23.5" cy="11" r="1.9" fill="#2e2242"/><circle cx="22" cy="13" r="1.7" fill="#2e2242"/><circle cx="21" cy="9" r="1" fill="#5a4470" opacity="0.9"/><circle cx="23.2" cy="10.2" r="0.8" fill="#5a4470" opacity="0.9"/></g><g><circle cx="11" cy="20" r="1.7" fill="#241a33"/><circle cx="9" cy="21.5" r="1.7" fill="#2e2242"/><circle cx="13" cy="21.5" r="1.7" fill="#2e2242"/><circle cx="10.2" cy="23.5" r="1.6" fill="#2e2242"/><circle cx="12.5" cy="23.5" r="1.6" fill="#241a33"/><circle cx="10" cy="21" r="0.8" fill="#5a4470" opacity="0.9"/></g></svg>`,
    elderberry: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" class="sprite"><rect x="15" y="20" width="2.5" height="10" rx="1" fill="#5a4326"/><path d="M16 22 L9 18 M16 24 L23 20 M16 21 L10 24 M16 25 L22 27" stroke="#4a7d3a" stroke-width="1.6"/><ellipse cx="8" cy="17" rx="2.8" ry="1.6" fill="#3f7a33" transform="rotate(-25 8 17)"/><ellipse cx="24" cy="19" rx="2.8" ry="1.6" fill="#3f7a33" transform="rotate(25 24 19)"/><ellipse cx="9" cy="24.5" rx="2.6" ry="1.5" fill="#3f7a33" transform="rotate(20 9 24.5)"/><ellipse cx="23" cy="27.5" rx="2.6" ry="1.5" fill="#3f7a33" transform="rotate(-20 23 27.5)"/><path d="M16 14 L16 6" stroke="#4a7d3a" stroke-width="1.4"/><g fill="#1f1a2e"><circle cx="9" cy="8" r="1.3"/><circle cx="11.5" cy="7" r="1.3"/><circle cx="14" cy="6.5" r="1.3"/><circle cx="16.5" cy="6.5" r="1.3"/><circle cx="19" cy="7" r="1.3"/><circle cx="21.5" cy="8" r="1.3"/><circle cx="10.2" cy="9.8" r="1.3"/><circle cx="12.8" cy="9.2" r="1.3"/><circle cx="15.2" cy="9" r="1.3"/><circle cx="17.8" cy="9.2" r="1.3"/><circle cx="20.2" cy="9.8" r="1.3"/><circle cx="12" cy="11.2" r="1.2"/><circle cx="14.5" cy="11" r="1.2"/><circle cx="17" cy="11" r="1.2"/><circle cx="19.2" cy="11.2" r="1.2"/></g><circle cx="14" cy="7.5" r="0.6" fill="#6a5a80" opacity="0.8"/><circle cx="18" cy="8" r="0.6" fill="#6a5a80" opacity="0.8"/></svg>`,
    wild_strawberry: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" class="sprite"><path d="M16 28 L16 20 M16 24 L10 22 M16 24 L22 22" stroke="#3f7a33" stroke-width="1.6"/><g fill="#4da63f" stroke="#35702c" stroke-width="0.7"><ellipse cx="10" cy="18" rx="3.2" ry="2.4" transform="rotate(-20 10 18)"/><ellipse cx="16" cy="16" rx="3.2" ry="2.4"/><ellipse cx="22" cy="18" rx="3.2" ry="2.4" transform="rotate(20 22 18)"/><ellipse cx="8" cy="25" rx="2.8" ry="2.1" transform="rotate(-15 8 25)"/><ellipse cx="24" cy="25" rx="2.8" ry="2.1" transform="rotate(15 24 25)"/></g><g><circle cx="16" cy="12" r="1.2" fill="#fff"/><circle cx="13.8" cy="12" r="1.2" fill="#fff"/><circle cx="18.2" cy="12" r="1.2" fill="#fff"/><circle cx="14.8" cy="10.2" r="1.2" fill="#fff"/><circle cx="17.2" cy="10.2" r="1.2" fill="#fff"/><circle cx="16" cy="11.2" r="1" fill="#f5c518"/></g><g><path d="M11 27 c0-2 1.5-3.5 3-3.5 c1.5 0 3 1.5 3 3.5 c0 2 -1.5 4 -3 4 c-1.5 0 -3 -2 -3 -4z" fill="#d93a3a" stroke="#a02323" stroke-width="0.7"/><circle cx="12.5" cy="27" r="0.45" fill="#f5e6a0"/><circle cx="14.5" cy="28" r="0.45" fill="#f5e6a0"/><circle cx="13.5" cy="29.5" r="0.45" fill="#f5e6a0"/><path d="M21 26 c0-1.8 1.3-3 2.6-3 c1.3 0 2.6 1.2 2.6 3 c0 1.8 -1.3 3.4 -2.6 3.4 c-1.3 0 -2.6 -1.6 -2.6 -3.4z" fill="#d93a3a" stroke="#a02323" stroke-width="0.7"/><circle cx="22.8" cy="26" r="0.4" fill="#f5e6a0"/><circle cx="24.2" cy="27" r="0.4" fill="#f5e6a0"/></g><polygon points="14,23.5 13,21.5 15,22.5" fill="#3f7a33"/><polygon points="18,23.5 19,21.5 17,22.5" fill="#3f7a33"/></svg>`,
  };

  // Taxonomy chains: each plant defines its path from root to specific.
  // Root = cell type (what you see from far away). Category = examination.
  // Specific = codex L1+ (the final form).
  // New plants: add their chain here (or in plants.json `taxon` field).
  const CHAINS = {
    blackberry: ['bush', 'berry_bush', 'blackberry'],
    elderberry: ['bush', 'berry_bush', 'elderberry'],
    muscadine: ['bush', 'berry_bush', 'muscadine'],
    wild_strawberry: ['plant', 'berry_plant', 'wild_strawberry'],
  };

  // Root sprites by cell type.
  const ROOTS = { plant: 'generic_plant', bush: 'generic_bush', tree: 'generic_tree', bigtree: 'generic_tree' };

  function get(id) { return SPRITES[id] || null; }

  function chainFor(pid) {
    // Prefer plants.json `taxon` if present, else the local table.
    try {
      const data = (global.Scattering.Game && global.Scattering.Game.data) || {};
      const plants = data.plants || [];
      const p = plants.find(x => x.id === pid);
      if (p && Array.isArray(p.taxon) && p.taxon.length) return p.taxon;
    } catch (e) {}
    return CHAINS[pid] || null;
  }

  // plantSprite(pid, depth, cellType): sprite for the deepest earned node.
  // depth 0 = root (cell type), 1 = category (examined), 2 = specific (codex).
  function plantSprite(pid, depth, cellType) {
    const chain = chainFor(pid);
    if (chain && chain.length) {
      const node = chain[Math.min(depth, chain.length - 1)];
      if (SPRITES[node]) return SPRITES[node];
    }
    // Fallback: root sprite for the cell type.
    const root = ROOTS[cellType] || ROOTS.bush;
    return SPRITES[root] || null;
  }

  S.Sprites = { get, chainFor, plantSprite, has: (id) => !!SPRITES[id] };
})(globalThis);
