#!/usr/bin/env python3
"""
World map visual test - lightweight (Steve 2026-10-06)
Composites TileScenes SVG tiles into a single image, no browser.
Run: python3 scripts/render-map-tiles.py
Output: /tmp/map-tiles.png
"""

import subprocess
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent

# Node script to generate the 49 tile SVGs using actual TileScenes code
NODE_SCRIPT = """
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';

global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')))
});

// Load tile-scenes
const src = fs.readFileSync(path.join(ROOT, 'src/js/tile-scenes.js'), 'utf8');
eval(src);

const TS = globalThis.Scattering.TileScenes;

// Mock Game with test data
globalThis.Scattering.Game = {
  map: {
    px: 3, py: 3,
    tiles: []
  },
  state: {
    scholar: { mx: 4, my: 4 },
    village: { positions: {} }
  },
  tileAt: function(x, y) {
    if (!this.map.tiles[y]) return null;
    return this.map.tiles[y][x];
  }
};

// Generate 7x7 test tiles with different terrain types
const types = ['forest_floor', 'grove', 'meadow', 'wetland', 'creek', 'haven', 'ruin'];
for (let y = 0; y < 7; y++) {
  globalThis.Scattering.Game.map.tiles[y] = [];
  for (let x = 0; x < 7; x++) {
    // Center 3x3 is "seen", rest is fog
    const seen = Math.abs(x - 3) <= 1 && Math.abs(y - 3) <= 1;
    globalThis.Scattering.Game.map.tiles[y][x] = {
      type: types[(x + y * 3) % types.length],
      x, y,
      revealed: seen
    };
  }
}

// Mock mapSeen
globalThis.Scattering.Game.mapSeen = (x, y) => {
  if (Math.abs(x - 3) <= 1 && Math.abs(y - 3) <= 1) return 'visited';
  return null;
};

// Generate SVGs for all 49 tiles
const tiles = [];
for (let y = 0; y < 7; y++) {
  for (let x = 0; x < 7; x++) {
    const seen = globalThis.Scattering.Game.mapSeen(x, y);
    try {
      const svg = TS.svgFor(x, y, { seen: !!seen });
      tiles.push({ x, y, svg, seen: !!seen });
    } catch (e) {
      tiles.push({ x, y, svg: null, error: e.message, seen: !!seen });
    }
  }
}

console.log(JSON.stringify(tiles));
"""

def main():
    # Run Node to get the tile SVGs
    result = subprocess.run(
        ['node', '-e', NODE_SCRIPT],
        capture_output=True,
        text=True,
        timeout=30
    )
    if result.returncode != 0:
        print(f"Node failed: {result.stderr[:500]}")
        sys.exit(1)
    
    tiles = json.loads(result.stdout)
    
    # Composite into a single SVG (7x7 grid, each tile 64x64)
    TILE_SIZE = 64
    GRID_SIZE = 7 * TILE_SIZE
    
    svg_parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{GRID_SIZE}" height="{GRID_SIZE}" viewBox="0 0 {GRID_SIZE} {GRID_SIZE}">']
    svg_parts.append(f'<rect width="{GRID_SIZE}" height="{GRID_SIZE}" fill="#0a0a0a"/>')
    
    errors = []
    for t in tiles:
        x, y = t['x'], t['y']
        svg = t.get('svg')
        if not svg:
            errors.append(f"Tile ({x},{y}): {t.get('error', 'no SVG')}")
            # Draw red X for failed tiles
            px, py = x * TILE_SIZE, y * TILE_SIZE
            svg_parts.append(f'<rect x="{px}" y="{py}" width="{TILE_SIZE}" height="{TILE_SIZE}" fill="#ff0000" opacity="0.3"/>')
            svg_parts.append(f'<text x="{px+32}" y="{py+32}" text-anchor="middle" fill="white" font-size="12">ERR</text>')
            continue
        
        # Extract inner content from the tile SVG and position it
        # Tile SVGs are 64x64 viewBox, we place at (x*64, y*64)
        px, py = x * TILE_SIZE, y * TILE_SIZE
        # Remove outer svg tags, wrap in <g> with transform
        inner = svg
        # Find content between <svg...> and </svg>
        import re
        m = re.search(r'<svg[^>]*>(.*)</svg>', inner, re.DOTALL)
        if m:
            content = m.group(1)
            svg_parts.append(f'<g transform="translate({px},{py})">{content}</g>')
        else:
            svg_parts.append(f'<g transform="translate({px},{py})">{inner}</g>')
    
    svg_parts.append('</svg>')
    composite = '\n'.join(svg_parts)
    
    # Save composite SVG
    with open('/tmp/map-composite.svg', 'w') as f:
        f.write(composite)
    
    # Convert to PNG
    try:
        import cairosvg
        cairosvg.svg2png(bytestring=composite.encode(), write_to='/tmp/map-tiles.png', scale=2)
        print("✅ Map tiles rendered: /tmp/map-tiles.png")
        print(f"   Composite SVG: /tmp/map-composite.svg")
        if errors:
            print(f"\n⚠️  {len(errors)} tiles failed:")
            for e in errors[:5]:
                print(f"     {e}")
        else:
            print("\n✅ All 49 tiles rendered successfully")
        
        # Check: are seen tiles different from unseen?
        seen_count = sum(1 for t in tiles if t['seen'] and t.get('svg'))
        unseen_count = sum(1 for t in tiles if not t['seen'] and t.get('svg'))
        print(f"\n   Seen tiles with SVG: {seen_count}")
        print(f"   Unseen tiles with SVG: {unseen_count}")
        
    except Exception as e:
        print(f"PNG conversion failed: {e}")
        print("SVG saved at /tmp/map-composite.svg")

if __name__ == '__main__':
    main()
