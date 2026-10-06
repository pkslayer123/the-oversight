// Debug scenario spoiler guard (Steve 2026-10-05).
// Scenario setup text is PLAYER-FACING. It sets the scene; it never coaches
// tactics. The scenario name in the debug menu is the tester's briefing.
// This test fails if any scenario's Game.say contains tactical coaching.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src/js/debug-scenarios.js'), 'utf8');

let fail = 0;
// Tactical coaching patterns: imperatives, mechanic reveals, meta-talk.
// These tell the player HOW to fight, not WHAT they see.
const BLOCKED = [
  /get behind/i, /strike the/i, /\bnever wade/i, /\bbreak the chorus/i,
  /kill one, split/i, /or SHOUT/i, /FIRST ENCOUNTER/i, /your codex learns/i,
  /only goes FORWARD/i, /won't chase you/i, /notices anyone too close/i,
  /first in first out/i, /\bMOVE\.$/, /weakness is/i, /aim for the/i,
  /don't let it/i, /keep your distance/i, /attack from/i,
  // hunter-intro classes (2026-10-06): weapon/difficulty prescriptions, free-pass
  // promises, mechanic imperatives. Scene-setting only.
  /best bet/i, /difficulty/i, /\+[0-9]+ (helps|bonus|to hit|damage)/i,
  /walk up to/i, /reach in/i, /need to fish/i, /you.{0,3}ll need to/i,
  /watch what it does/i,
];

const lines = src.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.includes('Game.say')) continue;
  for (const pat of BLOCKED) {
    if (pat.test(line)) {
      fail++;
      console.log(`FAIL line ${i + 1}: tactical coaching detected`);
      console.log(`  ${line.trim().slice(0, 100)}`);
      console.log(`  pattern: ${pat}`);
    }
  }
}

if (fail) {
  console.log(`\n${fail} spoiler violation(s). Scenario text must be scene-setting only.`);
  process.exit(1);
} else {
  console.log('OK: no tactical coaching in scenario setup text.');
}
