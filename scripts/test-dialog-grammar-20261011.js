#!/usr/bin/env node
// PROOF TEST (Worker C, dialog-layout 2026-10-11) — grammar sweep.
// Steve 2026-10-11: "1 Codex entries" — pluralization bugs in generated lines.
//
// Asserts:
//   1. Game.pluralize(n, singular, plural) unit behavior:
//      "1 day"/"2 days"/"0 days", irregulars ("1 child"/"2 children"),
//      consonant+y rule ("1 Blackberry"/"3 Blackberries")
//   2. Major builders with n=1 produce no "1 Xs":
//      - quest text: Game.questPlantRef(pid, 1)
//      - codex/journal lines: Game.journalStaleness() with forced gaps
//      - loot lines: covered by the static sweep (inline builders)
//      - travel text (homecoming beats): covered by the static sweep
//   3. Static sweep: every `${...} <plural-noun>` interpolation in src/js
//      is either routed through pluralize() or on the documented allowlist
//      (guarded ternaries, fixed-denominator "X/3 days", collective nouns,
//      body parts). Any NEW unhandled site fails the test.
//
// Run: node scripts/test-dialog-grammar-20261011.js
// (No seed needed — deterministic. Uses the standard eval harness.)

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};

// ================= 1. pluralize unit tests (no Game needed) =================
// Load just the helper by extracting it — avoids the full harness for part 1.
{
  const gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  ok('Game.pluralize is defined once', (gameSrc.match(/pluralize\(n, singular, plural\)/g) || []).length === 1);
  const m = gameSrc.match(/pluralize\(n, singular, plural\) \{([\s\S]*?)\n    \},/);
  ok('pluralize body extractable', !!m);
  const pluralize = new Function('n', 'singular', 'plural', m[1]);
  const T = [
    [1, 'day', undefined, '1 day'],
    [2, 'day', undefined, '2 days'],
    [0, 'day', undefined, '0 days'],
    [1, 'child', 'children', '1 child'],
    [2, 'child', 'children', '2 children'],
    [1, 'Codex entry', 'Codex entries', '1 Codex entry'],
    [2, 'Codex entry', 'Codex entries', '2 Codex entries'],
    [1, 'Blackberry', undefined, '1 Blackberry'],
    [3, 'Blackberry', undefined, '3 Blackberries'],
    [1, 'Dandelion', undefined, '1 Dandelion'],
    [2, 'Dandelion', undefined, '2 Dandelions'],
    [1, 'carcass', 'carcasses', '1 carcass'],
    [4, 'carcass', 'carcasses', '4 carcasses'],
    [1, 'villager', undefined, '1 villager'],
    [5, 'villager', undefined, '5 villagers'],
    [1, 'tick', undefined, '1 tick'],
    [8, 'tick', undefined, '8 ticks'],
    [1, 'deed', undefined, '1 deed'],
    [1, 'bar', undefined, '1 bar'],
    [7, 'bar', undefined, '7 bars'],
    [1, 'log', undefined, '1 log'],
    [1, 'unit', undefined, '1 unit'],
    [1, 'item', undefined, '1 item'],
    [1, 'fighter', undefined, '1 fighter'],
    [1, 'plant', undefined, '1 plant'],
    [1, 'person', 'people', '1 person'],
    [9, 'person', 'people', '9 people'],
  ];
  for (const [n, s, p, want] of T) {
    const got = pluralize(n, s, p);
    ok(`pluralize(${n}, ${JSON.stringify(s)}${p ? `, ${JSON.stringify(p)}` : ''}) === ${JSON.stringify(want)}`, got === want, `got ${JSON.stringify(got)}`);
  }
}

// ================= 2. builders with n=1 (full harness) =================
function makeRng(seed) {
  let a = seed | 0;
  const f = function () {
    a |= 0; a = a + 0x6D2B79F5 | 1;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  return f;
}
Math.random = makeRng(20261011); // BEFORE eval: modules capture Math.random at load
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js touches window at load
const SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/convo-scene.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'];
SCRIPTS.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

// bare day() is referenced by journal.js — shim it from scholar state if missing
if (typeof globalThis.day !== 'function') {
  globalThis.day = () => ((Game.state && Game.state.scholar && Game.state.scholar.day) || 1);
}

(async () => {
  await Game.init();
  delete global.window;

  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  const noBadPlural = (out) => !/\b1 [A-Za-z]+s\b/.test(out);

  // --- quest text: questPlantRef with qty=1 ---
  {
    const realKnown = Game.plantKnown, realCalled = Game.plantCalledName;
    Game.plantKnown = () => true;
    Game.plantCalledName = (pid) => ({ dandelion: 'Dandelion', blackberry: 'Blackberry' }[pid] || pid);
    try {
      const q1 = Game.questPlantRef('dandelion', 1);
      const q3 = Game.questPlantRef('dandelion', 3);
      const b1 = Game.questPlantRef('blackberry', 1);
      const b2 = Game.questPlantRef('blackberry', 2);
      ok('questPlantRef(dandelion, 1) === "1 Dandelion"', q1 === '1 Dandelion', q1);
      ok('questPlantRef(dandelion, 3) === "3 Dandelions"', q3 === '3 Dandelions', q3);
      ok('questPlantRef(blackberry, 1) === "1 Blackberry"', b1 === '1 Blackberry', b1);
      ok('questPlantRef(blackberry, 2) === "2 Blackberries"', b2 === '2 Blackberries', b2);
      ok('quest text has no "1 Xs"', [q1, q3, b1, b2].every(noBadPlural));
    } finally { Game.plantKnown = realKnown; Game.plantCalledName = realCalled; }
  }

  // --- codex/journal lines: journalStaleness with forced gaps ---
  {
    const d = globalThis.day();
    Game.state.codex.lastJournalTouch = { day: d - 2 };
    const s2 = Game.journalStaleness();
    Game.state.codex.lastJournalTouch = { day: d - 5 };
    const s5 = Game.journalStaleness();
    Game.state.codex.lastJournalTouch = null;
    const s0 = Game.journalStaleness();
    ok('journalStaleness gap=2 says "2 days"', /2 days/.test(s2), s2);
    ok('journalStaleness gap=5 says "5 days"', /5 days/.test(s5), s5);
    ok('journalStaleness fresh-day-1 says "1 day"', /1 day(?!s)/.test(s0), s0);
    ok('journal lines have no "1 Xs"', [s2, s5, s0].filter(Boolean).every(noBadPlural));
  }

  // ================= 3. static sweep =================
  // Every `${...} <plural-noun>` in src/js must be pluralize-routed or allowlisted.
  const NOUNS = 'days|entries|items|ticks|levels|lines|turns|villagers|deeds|choices|options|plants|herbs|nuts|roots|seeds|bars|portions|fighters|wounds|logs|units|tents|fires|people|children';
  const re = new RegExp('\\$\\{([^{}]+)\\}\\s+(' + NOUNS + ')\\b', 'g');
  // Allowlist: [regex-on-line, reason]
  const ALLOW = [
    [/lasted \$\{days\[pid\]\}\/3 days/, 'fixed-denominator "X/3 days" format'],
    [/> 1 \?/, 'ternary-guarded count (>1 branch only)'],
    [/people/, 'collective noun "people" (populations, crowds)'],
    [/\$\{[^}]+\} turns (you |toward |away)/, 'verb "turns", not the noun'],
    [/\$\{[^}]+\} plants their/, 'verb "plants", not the noun'],
    [/ago > 7 \?/, 'range-guarded: ago>=8, always plural'],
    [/ago <= 1 \?/, 'range-guarded: ago<=1 renders as last time'],
  ];
  const files = fs.readdirSync(path.join(ROOT, 'src/js')).filter(f => f.endsWith('.js'));
  const violations = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(line))) {
        const interp = m[1];
        if (interp.includes('pluralize(')) continue; // routed through the helper
        if (ALLOW.some(([rx]) => rx.test(line))) continue;
        violations.push(`${f}:${i + 1}: ${line.trim().slice(0, 110)}`);
      }
    });
  }
  ok('static sweep: no unhandled "${n} <plural>" interpolations', violations.length === 0,
    violations.slice(0, 8).join(' | ') + (violations.length > 8 ? ` (+${violations.length - 8} more)` : ''));

  console.log(`\ndialog-grammar: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
