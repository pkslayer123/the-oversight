// test-round2-hud-20261007.js — Round 2 HUD polish proof (Steve 2026-10-07).
// Node-based structural + functional test of the app.js HUD layer only.
// No game.js logic is exercised or changed here.
//
// Run: node scripts/test-round2-hud-20261007.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const repo = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(repo, 'src/js/app.js'), 'utf8');

let passed = 0;
function ok(cond, msg) {
  assert(cond, 'FAIL: ' + msg);
  passed++;
  console.log('  ok -', msg);
}

// ---------- 1. static: functions exist ----------
for (const fn of ['renderBuildIndicator', 'renderSynergyStirrings', 'renderIntegrationLevel',
                  'feedbackInner', 'feedbackHTML', '_synTeaseSet', '_isSynTeaseLine']) {
  ok(src.includes('function ' + fn + '('), fn + '() defined in app.js');
}

// ---------- 2. static: nothing orphaned ----------
// the three HUD renderers must be called in the pack inline view
const invInline = src.slice(src.indexOf('function renderInvInline('));
const invBlock = invInline.slice(0, invInline.indexOf('function renderMap(') === -1 ? 4000 : 4000);
for (const fn of ['renderBuildIndicator()', 'renderSynergyStirrings()', 'renderIntegrationLevel()']) {
  ok(invInline.slice(0, 5000).includes('${' + fn + '}'), fn + ' rendered in renderInvInline (pack view)');
}
// feedback card must render under the action bars (expedition screen + movement sync)
const fbCalls = (src.match(/\$\{feedbackHTML\(\)\}/g) || []).length;
ok(fbCalls >= 2, 'feedbackHTML() rendered under action bars (' + fbCalls + ' call sites: expeditionScreen + syncAfterMove)');
// app-side feedbackMark/feedbackLines fallback present (engine lacks them)
ok(src.includes('APP-SIDE FALLBACK'), 'app-side Game.feedbackMark/feedbackLines fallback present');
ok(src.includes("typeof Game.feedbackMark !== 'function'"), 'fallback does not clobber an engine definition');

// ---------- 3. functional: eval extracted renderers against stubbed Game ----------
function extract(name) {
  const start = src.indexOf('function ' + name + '(');
  assert(start !== -1, 'extract: ' + name + ' not found');
  let i = src.indexOf('{', start), depth = 0, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  assert(end !== -1, 'extract: ' + name + ' body not closed');
  return src.slice(start, end);
}
function esc(s) { return String(s).replace(/</g, '&lt;'); }

// stub Game: specialist (3 combat abilities, avg L3) + one stirring synergy
const TEASE1 = 'For a heartbeat, the world had edges made of sound.';
const TEASE2 = 'The echo came back wrong.';
const HINT = 'Echo first. Then hunt. Let your ears guide your eyes.';
function makeGame() {
  return {
    log: [],
    state: {
      scholar: {
        abilities: ['strike', 'dodge', 'powerblow', 'firstaid'],
        synergyAttempts: { apex_sense: 1 },
        synergies: [],
        linkedCodices: ['haven'],
      },
      systemArrived: true,
    },
    data: { synergies: [{
      id: 'apex_sense', name: 'Apex Sense', minLevel: 1,
      requires: ['tracker', 'echo_location'],
      discovery_method: { type: 'sequential', tease1: TEASE1, tease2: TEASE2, hint: HINT },
    }] },
    abilityLevel: (id) => ({ strike: 3, dodge: 3, powerblow: 3, firstaid: 1, tracker: 2, echo_location: 2 }[id] || 0),
    buildArchetype: () => ({ type: 'specialist', pool: 'combat', avgLevel: 3 }),
    buildBonus: () => ({ desc: 'Specialist (combat L3): +25% to combat actions. Mastery has its rewards.' }),
    systemIntegrationLevel: () => 1,
  };
}
const Game = makeGame();

// eval the renderers in this scope (they reference `esc` and `Game`)
for (const fn of ['renderBuildIndicator', 'renderSynergyStirrings', 'renderIntegrationLevel',
                  '_synTeaseSet', '_isSynTeaseLine', 'feedbackInner']) {
  eval(extract(fn));
}
// stub feedbackLines for feedbackInner: log tail since last mark
let _mark = 0;
Game.feedbackLines = () => Game.log.slice(_mark);

// --- build indicator: specialist feels rewarding ---
let html = renderBuildIndicator();
ok(html.includes('Combat Specialist'), 'specialist shows pool name + "Specialist"');
ok(html.includes('+25%'), 'specialist shows +25%');
ok(!html.startsWith('<p class="small"><b>Build:</b>'), 'no flat "Build:" label anymore');
ok(html.length < 400 && !html.includes('\n'), 'compact single line (' + html.length + ' chars)');
console.log('     ->', html.slice(0, 120) + '...');

// --- build indicator: generalist ---
Game.buildArchetype = () => ({ type: 'generalist', pools: ['combat', 'care', 'fieldcraft', 'craft'] });
html = renderBuildIndicator();
ok(html.includes('Versatile Generalist') && html.includes('+10%'), 'generalist variant renders with +10%');
// --- build indicator: no archetype -> hidden ---
Game.buildArchetype = () => null;
ok(renderBuildIndicator() === '', 'no archetype -> renders nothing');

// --- synergy stirrings: attempt 1 shows tease1, NOT the full hint (knowledge gating) ---
Game.buildArchetype = () => ({ type: 'specialist', pool: 'combat', avgLevel: 3 });
html = renderSynergyStirrings();
ok(html.includes('Apex Sense'), 'stirring synergy named');
ok(html.includes(TEASE1), 'attempt-1 tease surfaces');
ok(!html.includes(HINT), 'attempt 1 does NOT leak the full hint');
ok(html.includes('●') && html.includes('○'), 'progress pips shown');

// --- attempt 2: tease2 + hint allowed ---
Game.state.scholar.synergyAttempts = { apex_sense: 2 };
html = renderSynergyStirrings();
ok(html.includes(TEASE2) && html.includes(HINT), 'attempt 2 shows tease2 + hint');

// --- integration level ---
Game.state.scholar.linkedCodices = ['haven'];
html = renderIntegrationLevel();
ok(html.includes('●○○'), 'L1 pips ●○○');
ok(html.includes('study 1 more village codex'), 'next-step progress shown');
ok(html.includes('village power on the map'), 'L1 "what the System sees" flavor');
Game.state.scholar.linkedCodices = ['haven', 'a', 'b'];
Game.systemIntegrationLevel = () => 3;
html = renderIntegrationLevel();
ok(html.includes('●●●') && html.includes('fully integrated'), 'L3 fully integrated');
Game.state.systemArrived = false;
Game.state.scholar.linkedCodices = [];
Game.systemIntegrationLevel = () => 0;
ok(renderIntegrationLevel() === '', 'pre-System L0 renders nothing');

// --- feedbackInner: tease lines become a distinct styled block ---
Game.state.systemArrived = true;
Game.state.scholar.synergyAttempts = { apex_sense: 1 };
Game.log = ['You strike the brute.', TEASE1, 'It staggers back.'];
Game.feedbackLines = () => Game.log.slice(0); // mark at 0
const fb = feedbackInner();
ok(fb.includes('fb-syntease'), 'tease line wrapped in fb-syntease block');
ok(fb.includes('🌀'), 'tease block carries the 🌀 marker');
ok(fb.includes('class="fb-line">You strike the brute.<'), 'ordinary lines stay plain fb-line');
Game.log = ['You forage quietly.'];
Game.feedbackLines = () => Game.log.slice(0);
ok(!feedbackInner().includes('fb-syntease'), 'no tease present -> no tease block');

console.log('\nPASS: ' + passed + ' checks green');
