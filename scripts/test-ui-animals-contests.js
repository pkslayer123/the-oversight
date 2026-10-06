// UI wiring test — worker B (Steve 2026-10-06):
//   - prey phase badges: Game.encPreyPhase/encPreyPhaseBadge contract that
//     app.js renders on grid cells (compact symbol) and popups (full string)
//   - 📺 OVERSIGHT panel: Game.contestEligible() contract the panel consumes
//     (eligible + notability pre/post day-14), and the app.js wiring itself
//     (static source checks — app.js boots with DOM, can't eval in node)
//   - glasswing trap shadow: app.js guards Game.glasswingTrapCells() and
//     renders faint → darker → almost black
// Usage: node scripts/test-ui-animals-contests.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/contests.js', 'src/js/encounters.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);

// ---------- 1-5. prey phase contract (what the badges render from) ----------
ok('badge: winded -> "😮‍💨 winded"', Game.encPreyPhaseBadge({ pstate: 'winded' }) === '😮‍💨 winded');
ok('badge: bolt -> "💨 bolting"', Game.encPreyPhaseBadge({ pstate: 'bolt' }) === '💨 bolting');
ok('badge: wary -> "⚠ wary"', Game.encPreyPhaseBadge({ pstate: 'wary' }) === '⚠ wary');
ok('badge: graze -> "grazing" (no grid badge)', Game.encPreyPhaseBadge({ pstate: 'graze' }) === 'grazing');
ok('phase: playing_dead passes through', Game.encPreyPhase({ pstate: 'playing_dead' }) === 'playing_dead');

// ---------- 6-8. contestEligible contract (what OVERSIGHT renders) ----------
Game.state.scholar.day = 1;
const pre = Game.contestEligible();
ok('pre-day-14: no eligible, reason names day 14',
  pre.eligible.length === 0 && /day 14/.test(pre.reason || ''));
Game.state.scholar.day = 14;
Game.addNotability('player', 'wave2Kill');
const post = Game.contestEligible();
const me = post.eligible.find(e => e.id === 'player');
ok('day 14+: player eligible', !!me);
ok('day 14+: notability deeds present as strings',
  !!me && Array.isArray(me.notability) && me.notability.some(n => /wave-2 beast/.test(n)));

// ---------- 9-13. app.js static wiring ----------
const app = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');

// grid cell: compact badge symbol mapped from encPreyPhase, guarded
const gridBadge = /typeof Game\.encPreyPhase === 'function'/.test(app) &&
  /preybadge/.test(app) && /wary: '⚠'/.test(app);
ok('grid cell renders guarded prey-phase badge symbol', gridBadge);

// popup: full badge string via encPreyPhaseBadge, guarded
ok('cell popup includes guarded encPreyPhaseBadge',
  /typeof Game\.encPreyPhaseBadge === 'function'/.test(app));

// trap shadow: guarded typeof call + darkening ladder faint->darker->almost black
const trapGuard = /typeof Game\.glasswingTrapCells === 'function'/.test(app);
const trapDark = /0\.22, 0\.42, 0\.68/.test(app) && /gwtrap/.test(app) && /gwtrap-splash/.test(app);
ok('trap shadow guarded on Game.glasswingTrapCells', trapGuard);
ok('trap shadow darkens faint→darker→almost black + splash marked', trapDark);
// trap popup: diegetic observation only, no coaching
const trapPopup = /A shadow on the ground —/.test(app) && /Something is falling/.test(app);
ok('trap popup names the shadow (diegetic, no coaching)', trapPopup);

// ---------- 14. OVERSIGHT panel wiring ----------
const oversight = /function oversightPanel\(\)/.test(app) &&
  /\$\{oversightPanel\(\)\}/.test(app) &&
  /Game\.contestEligible/.test(app) &&
  /notability\.join/.test(app) &&
  /📺 OVERSIGHT/.test(app);
ok('codex screen includes 📺 OVERSIGHT panel on contestEligible+notability', oversight);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
})();
