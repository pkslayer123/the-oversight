#!/usr/bin/env node
// World map HTML visual test (Steve 2026-10-06)
// Renders the actual renderMap output to HTML for visual inspection.
// Run: node scripts/test-map-html.js
// Output: /tmp/map-test.html - open in browser to see the map

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// Mock minimal Game object for renderMap
global.Scattering = {
  TileScenes: {
    svgFor: (x, y, opts) => {
      const seen = opts && opts.seen;
      if (!seen) {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="0" y="0" width="64" height="64" rx="7" fill="#0d120d"/></svg>';
      }
      // Mock detailed scene: colored tile with some detail
      const colors = ['#241c12', '#1b2f1c', '#28331b', '#1a2830'];
      const c = colors[(x + y) % 4];
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="2" y="2" width="60" height="60" rx="8" fill="${c}"/><circle cx="32" cy="32" r="8" fill="#4a4a42" opacity="0.5"/></svg>`;
    }
  },
  TILE_GLYPH: {}
};

// Mock Game
global.Game = {
  tileAt: (x, y) => {
    // Mock tile data
    const types = ['forest_floor', 'grove', 'meadow', 'wetland'];
    return { type: types[(x + y) % 4] };
  },
  map: { px: 3, py: 3 },
  mapSeen: (x, y) => {
    // Mock: center 3x3 seen, rest not
    if (Math.abs(x - 3) <= 1 && Math.abs(y - 3) <= 1) return 'visited';
    return null;
  },
  state: {
    scholar: { mx: 4, my: 4 },
    otherVillages: []
  },
  data: { villagers: [], background_survivors: [] },
  villagerId: 'test',
  depletionClass: () => '',
};

// Load the actual renderMap function from app.js
// (extract it via regex - hacky but works for visual test)
const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const match = appSrc.match(/function renderMap\(st, tset\) \{([\s\S]*?)\n  \}\n/);
if (!match) {
  console.error('Could not find renderMap in app.js');
  process.exit(1);
}

// Create a test harness
const testHtml = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>World Map Test</title>
<link rel="stylesheet" href="${ROOT}/src/css/main.css">
<style>
  body { background: #1a1a2e; padding: 20px; }
  .mapoverlay-box { background: #1a1a2e; border: 1px solid #444; border-radius: 8px; padding: 16px; max-width: 400px; margin: 0 auto; }
  .mapoverlay-head { display: flex; justify-content: space-between; margin-bottom: 12px; color: #eee; }
  .minimap { background: #0d120d; border-radius: 4px; padding: 8px; }
</style>
</head>
<body>
<div class="mapoverlay-box">
  <div class="mapoverlay-head"><span>🗺️ World (mock)</span><button>✕</button></div>
  <div class="map minimap" id="map-container"></div>
</div>
<script>
// Mock functions needed by renderMap
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
function villagerSpriteHtml(vp) { return '<span>🧍</span>'; }
const S = globalThis.Scattering || {};
const Game = globalThis.Game;

// Paste renderMap here (simplified for test)
${match[0]}

// Run it
try {
  const st = { wanderer: null };
  const tset = new Set();
  const html = renderMap(st, tset);
  document.getElementById('map-container').innerHTML = html;
  console.log('Map rendered successfully');
} catch (e) {
  document.getElementById('map-container').innerHTML = '<p style="color:red">Error: ' + e.message + '</p>';
  console.error(e);
}
</script>
</body>
</html>
`;

fs.writeFileSync('/tmp/map-test.html', testHtml);
console.log('✅ Map test HTML: /tmp/map-test.html');
console.log('Open in browser to visually inspect the world map rendering.');
