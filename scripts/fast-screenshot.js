#!/usr/bin/env node
// Fast mobile screenshot (Steve 2026-10-05)
// Uses local Chromium headless — much faster than browser tasks.
// Usage: node scripts/fast-screenshot.js [url] [output.png] [scenario]
//
// Examples:
//   node scripts/fast-screenshot.js  # title screen
//   node scripts/fast-screenshot.js "https://pkslayer123.github.io/the-oversight/?debug=1" shot.png headlight

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const CHROME = '/opt/meta-chromium/chrome';
const URL = process.argv[2] || 'https://pkslayer123.github.io/the-oversight/';
const OUTPUT = process.argv[3] || '/tmp/oversight-shot.png';
const SCENARIO = process.argv[4] || null;

// Build a JS snippet to run after page load
let evalJs = '';
if (SCENARIO) {
  evalJs = `
    (function() {
      // Wait for Game to be ready, then run scenario
      const iv = setInterval(() => {
        if (window.Scattering && window.Scattering.Game && window.Scattering.Game.debugScenario) {
          clearInterval(iv);
          window.Scattering.Game.debugScenario('${SCENARIO}');
        }
      }, 500);
      setTimeout(() => clearInterval(iv), 10000);
    })();
  `;
}

const cmd = [
  CHROME,
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  '--window-size=390,844',
  `--screenshot=${OUTPUT}`,
  '--virtual-time-budget=8000',
  URL,
].join(' ');

console.log('Taking screenshot...');
console.log('URL:', URL);
if (SCENARIO) console.log('Scenario:', SCENARIO);

try {
  execSync(cmd, { stdio: 'pipe', timeout: 30000 });
  if (fs.existsSync(OUTPUT)) {
    const stats = fs.statSync(OUTPUT);
    console.log(`✅ Screenshot: ${OUTPUT} (${Math.round(stats.size/1024)}KB)`);
  } else {
    console.log('❌ Screenshot file not created');
    process.exit(1);
  }
} catch (e) {
  console.log('❌ Chrome failed:', e.message);
  process.exit(1);
}
