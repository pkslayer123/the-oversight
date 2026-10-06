// Conversation interface tests: interrupt button, tap-tax, HTML structure.
// Usage: node scripts/test-conversation-interface2.js
// (test-conversation-interface.js is the tap-flow analysis)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}` + (extra ? ' — ' + extra : '')); }
}

// Static checks on app.js source (no DOM needed)
const appJs = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');

ok('interrupt button rendered in dialogueBoxHTML',
  appJs.includes('dlg-interrupt') && appJs.includes('chatInterrupt'));
ok('interrupt wired in wireDialogueBox',
  appJs.includes("getElementById('dlg-interrupt')"));
ok('chatInterrupt jumps to end (msgIndex = length - 1)',
  /chatInterrupt[\s\S]{0,800}?msgIndex = (c\.transcript\.length|Math\.max\(0, n - 1\))/.test(appJs));
ok('interrupt costs trust (-2)',
  appJs.includes('c.interrupted') && /trust\[vid\].*- 2/.test(appJs));
ok('interrupt has escalating reaction for 2nd+ interruption',
  appJs.includes('c.interrupted >= 2'));
ok('interrupt reaction added to transcript',
  appJs.includes("c.transcript.push({ who: 'them', text: r })"));

// CSS checks
const css = fs.readFileSync(path.join(ROOT, 'src/css/main.css'), 'utf8');
ok('interrupt button styled', css.includes('.dlg-interrupt'));
ok('advance row uses flex layout', css.includes('.dlg-advance'));

// The old tap-tax analysis still documents the problem this solves
console.log('\nNote: scripts/test-conversation-interface.js measures the tap-tax');
console.log('that the interrupt button addresses (was 2.4 reading-taps per choice).');

console.log(`\n=== RESULTS: ${pass} pass, ${fail} fail ===`);
process.exit(fail ? 1 : 0);
