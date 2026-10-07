// test-hud-surfacing-20261007.js
// HUD surfacing: build archetype indicator, synergy hint surfacing,
// integration level display. Static assertions + functional smoke tests
// of the three render helpers (extracted from src/js/app.js, run with stubs).
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'app.js'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; console.log('  FAIL - ' + name); }
}

// ---------- static assertions ----------
console.log('static:');
ok(src.includes('function renderBuildIndicator()'), 'renderBuildIndicator defined');
ok(src.includes('function renderSynergyStirrings()'), 'renderSynergyStirrings defined');
ok(src.includes('function renderIntegrationLevel()'), 'renderIntegrationLevel defined');
ok(src.includes('${renderBuildIndicator()}') && src.includes('${renderSynergyStirrings()}') && src.includes('${renderIntegrationLevel()}'),
  'all three helpers injected into pack inline template');
ok(/renderBuildIndicator[\s\S]*?Game\.buildArchetype\(\)/.test(src), 'build indicator calls Game.buildArchetype()');
ok(/renderBuildIndicator[\s\S]*?Game\.buildBonus\(\)/.test(src), 'build indicator calls Game.buildBonus()');
ok(/renderSynergyStirrings[\s\S]*?discovery_method/.test(src), 'stirrings read discovery_method');
ok(/renderSynergyStirrings[\s\S]*?synergyAttempts/.test(src), 'stirrings read scholar.synergyAttempts');
ok(/renderSynergyStirrings[\s\S]*?dm\.tease1[\s\S]*?dm\.tease2[\s\S]*?dm\.hint/.test(src) || /dm\.hint/.test(src),
  'stirrings surface tease1/tease2/hint');
ok(/renderIntegrationLevel[\s\S]*?Game\.systemIntegrationLevel\(\)/.test(src), 'integration display calls Game.systemIntegrationLevel()');
ok(/renderIntegrationLevel[\s\S]*?linkedCodices/.test(src), 'integration display reads linkedCodices');
ok(src.includes('link 1 more codex for L3') || /link \$\{lvl \+ 1 - linked\} more codex for L\$\{lvl \+ 1\}/.test(src),
  'integration shows progress-to-next (link N more codex for L{n+1})');

// ---------- functional: extract helpers, eval with stubs ----------
function extract(name) {
  const start = src.indexOf('function ' + name + '()');
  if (start < 0) throw new Error('missing ' + name);
  let i = src.indexOf('{', start), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error('unbalanced braces in ' + name);
}
function makeScope(stubs) {
  const Game = stubs.Game || {};
  const esc = s => String(s).replace(/</g, '&lt;');
  const fns = {};
  for (const n of ['renderBuildIndicator', 'renderSynergyStirrings', 'renderIntegrationLevel']) {
    fns[n] = new Function('Game', 'esc', extract(n) + '\nreturn ' + n + ';')(Game, esc);
  }
  return fns;
}

console.log('functional:');
{
  // (a) specialist
  const f = makeScope({ Game: {
    buildArchetype: () => ({ type: 'specialist', pool: 'combat', avgLevel: 4 }),
    buildBonus: () => ({ desc: 'Specialist (combat L4): +25% to combat actions.' }),
  }});
  const html = f.renderBuildIndicator();
  ok(html.includes('Specialist') && html.includes('+25%') && html.includes('combat'), 'specialist badge shows pool + +25%');
}
{
  // (a) generalist
  const f = makeScope({ Game: {
    buildArchetype: () => ({ type: 'generalist', pools: ['combat', 'care', 'fieldcraft', 'social'] }),
    buildBonus: () => ({ desc: 'Generalist (4+ pools): +10% to everything.' }),
  }});
  const html = f.renderBuildIndicator();
  ok(html.includes('Generalist') && html.includes('+10%'), 'generalist badge shows +10%');
}
{
  // (a) no archetype -> nothing rendered (keeps HUD compact)
  const f = makeScope({ Game: { buildArchetype: () => null, buildBonus: () => null } });
  ok(f.renderBuildIndicator() === '', 'no archetype renders nothing');
}
{
  // (b) 2 attempts, requirements held -> hint visible
  const f = makeScope({ Game: {
    state: { scholar: { synergyAttempts: { apex_sense: 2 }, synergies: [] } },
    data: { synergies: [{ id: 'apex_sense', name: 'Apex Sense',
      requires: ['echo_location', 'tracker'], minLevel: 1,
      discovery_method: { type: 'sequential', hint: 'Echo first. Then hunt.', tease1: 't1', tease2: 't2' } }] },
    abilityLevel: () => 3,
  }});
  const html = f.renderSynergyStirrings();
  ok(html.includes('Echo first. Then hunt.') && html.includes('Apex Sense') && html.includes('(2/3)'),
    '2-attempt synergy surfaces name, (2/3) and the hint');
}
{
  // (b) sustained uses _days counter, tease1 at n=1
  const f = makeScope({ Game: {
    state: { scholar: { synergyAttempts: { sun_garden_days: 1 }, synergies: [] } },
    data: { synergies: [{ id: 'sun_garden', name: "Sun Eater's Garden",
      requires: ['green_thumb', 'photosynthesis'], minLevel: 1,
      discovery_method: { type: 'sustained', hint: 'Tend living things in the daylight.', tease1: 'Your hands tingled.', tease2: 'The garden hummed.' } }] },
    abilityLevel: () => 2,
  }});
  const html = f.renderSynergyStirrings();
  ok(html.includes('Your hands tingled.') && !html.includes('The garden hummed.'),
    'sustained day-1 shows tease1, not tease2');
}
{
  // (b) requirements not held -> hidden
  const f = makeScope({ Game: {
    state: { scholar: { synergyAttempts: { apex_sense: 2 }, synergies: [] } },
    data: { synergies: [{ id: 'apex_sense', name: 'Apex Sense', requires: ['echo_location', 'tracker'],
      discovery_method: { hint: 'x', tease2: 't2' } }] },
    abilityLevel: () => 0,
  }});
  ok(f.renderSynergyStirrings() === '', 'synergy with unheld requirements stays hidden');
}
{
  // (b) discovered synergy -> not a stirring
  const f = makeScope({ Game: {
    state: { scholar: { synergyAttempts: { apex_sense: 2 }, synergies: ['apex_sense'] } },
    data: { synergies: [{ id: 'apex_sense', name: 'Apex Sense', requires: [],
      discovery_method: { hint: 'x', tease2: 't2' } }] },
    abilityLevel: () => 3,
  }});
  ok(f.renderSynergyStirrings() === '', 'discovered synergy not shown as stirring');
}
{
  // (b) zero attempts -> hidden
  const f = makeScope({ Game: {
    state: { scholar: { synergyAttempts: {}, synergies: [] } },
    data: { synergies: [{ id: 'apex_sense', name: 'Apex Sense', requires: [],
      discovery_method: { hint: 'x', tease1: 't1' } }] },
    abilityLevel: () => 3,
  }});
  ok(f.renderSynergyStirrings() === '', 'synergy with no attempts stays hidden');
}
{
  // (c) L2 with 2 linked -> "link 1 more codex for L3"
  const f = makeScope({ Game: {
    state: { scholar: { linkedCodices: ['v1', 'v2'] }, systemArrived: true },
    systemIntegrationLevel: () => 2,
  }});
  const html = f.renderIntegrationLevel();
  ok(html.includes('L2') && html.includes('link 1 more codex for L3'), 'L2 shows level + progress to L3');
}
{
  // (c) L3 -> fully integrated
  const f = makeScope({ Game: {
    state: { scholar: { linkedCodices: ['v1', 'v2', 'v3'] }, systemArrived: true },
    systemIntegrationLevel: () => 3,
  }});
  ok(f.renderIntegrationLevel().includes('fully integrated'), 'L3 shows fully integrated');
}
{
  // (c) pre-arrival, L0 -> hidden (keeps HUD compact)
  const f = makeScope({ Game: {
    state: { scholar: { linkedCodices: [] } },
    systemIntegrationLevel: () => 0,
  }});
  ok(f.renderIntegrationLevel() === '', 'pre-arrival L0 renders nothing');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
