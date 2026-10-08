#!/usr/bin/env node
// CODEX ALIENS SECTION PROOF (Steve 2026-10-08).
//
// apCodexEntry (alienPlayers.js) writes gated entries into
// Game.state.codex.aliens — pre-reveal title='stranger', species/
// disposition='unknown', suspicion-only note; post-reveal the truth.
// This test proves the app.js codexScreen ALIENS section:
//   1. renders NOTHING until the player has an alien entry
//      (knowledge gating: if you don't know, it doesn't show)
//   2. pre-reveal renders only the gated fields — no alien truth leaks
//   3. post-reveal (3rd encounter auto-reveal) renders the truth
//   4. 5th encounter reaches 'understood' with motivation
//   5. codexScreen actually wires the section in
//   6. pepBurst dead refs (retired hype_horn) are gone from live code
//
// The section renderer is extracted from app.js source and eval'd, so the
// test exercises the SHIPPED template, not a copy.
//
// Usage: node scripts/test-codex-aliens-20261008.js (SEED override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED); // SEED BEFORE EVAL — modules capture Math.random at load
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'\"'\"']*\\.js' index.html | head -80", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); } });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

// Extract the SHIPPED section renderer from app.js and eval it.
function esc(s) { return String(s).replace(/</g, '&lt;'); } // matches app.js esc
const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const fnStart = appSrc.indexOf('function codexAliensSection(aliens)');
const fnEnd = appSrc.indexOf('function codexScreen()');
if (fnStart < 0 || fnEnd < 0 || fnEnd < fnStart) { console.log('FAIL: codexAliensSection not found in app.js'); process.exit(1); }
eval(appSrc.slice(fnStart, fnEnd));

const fails = [];
function check(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fails.push(name);
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.say = () => {}; Game.sysSay = () => {}; // harness: no DOM for speech

  const personas = Game.apPersonas();
  check('alien persona pool non-empty', personas.length > 0, personas.length + ' personas');
  const pid = personas[0].id;
  const truth = Game.apPersona(pid);

  // 1. Section invisible with no knowledge.
  check('empty aliens map -> empty section', codexAliensSection({}) === '');
  check('no entries yet -> empty section', codexAliensSection(Game.state.codex.aliens || {}) === '');

  // 2. Pre-reveal: one encounter via apOnCombatEnd (writes the codex entry).
  Game.apOnCombatEnd(pid, 'lost');
  let entry = (Game.state.codex.aliens || {})[pid];
  check('entry written after encounter', !!entry);
  check('pre-reveal title is stranger', entry.title === 'stranger', entry.title);
  check('pre-reveal species unknown', entry.species === 'unknown', entry.species);
  check('pre-reveal disposition unknown', entry.disposition === 'unknown', entry.disposition);
  check('pre-reveal stage encountered', entry.stage === 'encountered', entry.stage);
  let html = codexAliensSection(Game.state.codex.aliens);
  check('section now renders (ALIENS header)', html.includes('>ALIENS</h1>'));
  check('pre-reveal shows persona name (safe)', html.includes(esc(truth.name)));
  check('pre-reveal shows stranger', html.includes('stranger'));
  check('pre-reveal suspicion note present', html.includes('Moved wrong'));
  check('NO LEAK: real title absent pre-reveal', !html.includes(truth.title), truth.title);
  check('NO LEAK: real species absent pre-reveal', !html.includes(truth.species), truth.species);
  check('NO LEAK: no Motivation pre-reveal', !html.includes('Motivation:'));

  // 3. Post-reveal: 3rd encounter auto-reveals (pattern recognition).
  Game.apOnCombatEnd(pid, 'lost');
  Game.apOnCombatEnd(pid, 'lost');
  entry = Game.state.codex.aliens[pid];
  check('post-reveal stage identified', entry.stage === 'identified', entry.stage);
  check('post-reveal title is truth', entry.title === truth.title, entry.title);
  check('post-reveal species is truth', entry.species === truth.species, entry.species);
  html = codexAliensSection(Game.state.codex.aliens);
  check('post-reveal shows title', html.includes(esc(truth.title)));
  check('post-reveal shows species', html.includes(esc(truth.species)));
  check('post-reveal stage label identified', html.includes('identified'));

  // 4. Understood at 5 encounters.
  Game.apOnCombatEnd(pid, 'lost');
  Game.apOnCombatEnd(pid, 'lost');
  entry = Game.state.codex.aliens[pid];
  check('5 encounters -> understood', entry.stage === 'understood', entry.stage);
  html = codexAliensSection(Game.state.codex.aliens);
  check('understood shows motivation', html.includes('Motivation:'));

  // 5. codexScreen wires the section.
  check('codexScreen calls codexAliensSection',
    appSrc.includes('${codexAliensSection(Game.state.codex.aliens || {})}'));

  // 6. pepBurst dead refs gone from live code (retired hype_horn).
  const livePep = appSrc.split('\n').filter(l => /pepBurst/.test(l) && !/REMOVED|orphaned/.test(l));
  check('no live pepBurst references', livePep.length === 0, livePep.length + ' lines');
  check("STYLE_BUCKETS has no pep key", !/pep:\s*'pepBurst'/.test(appSrc));

  console.log(fails.length ? `\n${fails.length} FAILURES` : '\nALL GREEN');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(1); });
