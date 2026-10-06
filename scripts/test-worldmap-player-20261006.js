// Proof: world map player tile is unmistakable (Steve 2026-10-06).
// A playtester "can't see which square she is on in the world map."
// The player tile must have programmatically detectable distinct markers.
const fs = require('fs');
const path = require('path');

const repo = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name); }
}

// 1. CSS: .minimap .tile.me has pulsing outline + glow (not flat green)
const css = fs.readFileSync(path.join(repo, 'src/css/main.css'), 'utf8');
check('CSS has .minimap .tile.me rule', css.includes('.minimap .tile.me'));
check('player tile has white outline', /\.minimap\s+\.tile\.me\s*\{[^}]*outline:\s*3px solid #fff/.test(css));
check('player tile has glow box-shadow', /\.minimap\s+\.tile\.me\s*\{[^}]*box-shadow:[^}]*var\(--acc\)/.test(css));
check('player tile has pulse animation', /\.minimap\s+\.tile\.me\s*\{[^}]*animation:\s*mepulse/.test(css));
check('mepulse keyframes defined', css.includes('@keyframes mepulse'));
check('mepulse animates box-shadow', /@keyframes mepulse\s*\{[^}]*box-shadow/s.test(css));

// 2. CSS: youface arrow is big, white, high-contrast
check('CSS has .youface rule', css.includes('.mface.youface'));
check('youface is white', /\.mface\.youface\s*\{[^}]*color:\s*#fff/.test(css));
check('youface is larger than base mface', /\.mface\.youface\s*\{[^}]*font-size:\s*1\.5em/.test(css));

// 3. JS: renderMap marks player tile with data-you + aria-label + youface class
const appjs = fs.readFileSync(path.join(repo, 'src/js/app.js'), 'utf8');
check('renderMap adds data-you="1" to player tile', appjs.includes('data-you="1"'));
check('renderMap adds aria-label "You are here"', appjs.includes('aria-label="You are here"'));
check('renderMap uses youface class on player arrow', appjs.includes('mface youface'));

// 4. JS: player tile still gets ' me' class (backwards compat)
check('renderMap still applies me class', /isP \? ' me' : ''/.test(appjs));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
