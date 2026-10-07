// Test: Contest drama wiring (Steve 2026-10-07)
// Verifies that contest drama methods exist and the wiring calls are present.

const fs = require('fs');
const path = require('path');

const dramaPath = path.join(__dirname, '..', 'src', 'js', 'drama.js');
const contestsPath = path.join(__dirname, '..', 'src', 'js', 'contests.js');

const drama = fs.readFileSync(dramaPath, 'utf8');
const contests = fs.readFileSync(contestsPath, 'utf8');

let passed = 0;
let failed = 0;

function check(name, cond) {
  if (cond) {
    console.log(`✓ ${name}`);
    passed++;
  } else {
    console.log(`✗ ${name}`);
    failed++;
  }
}

// Drama methods exist
check('contestAnnounce method exists', drama.includes('contestAnnounce(contestName'));
check('contestCheer method exists', drama.includes('contestCheer(integration'));
check('contestBoo method exists', drama.includes('contestBoo(integration'));
check('contestJudging method exists', drama.includes('contestJudging(integration'));
check('contestWinner method exists', drama.includes('contestWinner(name'));
check('contestLoser method exists', drama.includes('contestLoser(name'));
check('contestFlash dispatcher exists', drama.includes("spec.type selects the moment"));

// CSS classes exist
check('drama-contest-announce CSS', drama.includes('.drama-contest-announce'));
check('drama-cheer CSS', drama.includes('.drama-cheer'));
check('drama-boo CSS', drama.includes('.drama-boo'));
check('drama-judge-dim CSS', drama.includes('.drama-judge-dim'));
check('drama-confetti CSS', drama.includes('.drama-confetti'));
check('drama-loser-heart CSS', drama.includes('.drama-loser-heart'));

// Ontology updated
check('ontology lists contestAnnounce', drama.includes('//   - contestAnnounce:'));
check('ontology lists contestWinner', drama.includes('//   - contestWinner:'));

// Contests wiring
check('fireContest wires announce', contests.includes("type: 'announce'"));
check('_contestEnd wires winner', contests.includes("type: 'winner'"));
check('_contestDie wires loser', contests.includes("type: 'loser'"));
check('contestChoose wires cheer', contests.includes("type: 'cheer'"));
check('_contestVerdict wires judging', contests.includes("type: 'judging'"));

// Integration scaling
check('announce scales with integration', drama.includes('2200 + (integration * 400)'));
check('cheer scales count', drama.includes('3 + integration * 2'));
check('winner scales confetti', drama.includes('8 + integration * 4'));

// Uses Game.drama, not Drama directly
check('contests uses this.drama', contests.includes("this.drama('contest'"));
check('contests does not call Drama directly', !contests.includes('Scattering.Drama.contest'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
