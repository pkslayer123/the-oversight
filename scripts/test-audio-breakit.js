// test-audio-breakit.js — break-it audio audit (Steve 2026-10-08).
// Adversarial static audit of the Game.audio system (CombatAudio IIFE, app.js):
//   1. EXPLOIT/HONESTY: every fired cue name resolves to a registered synth
//      (audioEvent literals, monsters.json *Audio config, drama.js
//      DRAMA_AUDIO_MATES, contests.js CX_BEAT_DEFS parts, dynamic 'wound'+wcap).
//   2. DEAD-CODE: every registered cue is reachable — direct fire, config,
//      drama mate, beat-def part, internal composition call, or public API
//      (isMuted/toggleMute/ensureAudio). Anything else is a dead synth.
//   3. SOFTLOCK: no awaits in the audio IIFE, dispatch is try/catch,
//      ensure() fails closed, Game.audioEvent no-ops without Game.audio.
//   4. HONESTY spot-checks: wound trio registered; levelup/passiveUnlock
//      honor the {quiet:true} contract.
// Usage: node scripts/test-audio-breakit.js [worktree|HEAD|<rev>]
//   default worktree = current files (after fix); HEAD = pre-fix baseline.
// Exit 0 when clean, 1 with findings listed.
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');

const target = process.argv[2] || 'worktree';
function readFile(rel) {
  if (target === 'worktree') return fs.readFileSync(path.join(REPO, rel), 'utf8');
  return execSync(`git -C ${REPO} show ${target}:${rel}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
const appSrc = readFile('src/js/app.js');
const gameSrc = readFile('src/js/game.js');

let pass = 0, fail = 0;
const findings = [];
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; findings.push(name + (extra ? ' — ' + extra : '')); console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

// ---------- isolate the CombatAudio IIFE ----------
const iifeStart = appSrc.indexOf('const CombatAudio = (() => {');
const iifeEnd = appSrc.indexOf('Game.audio = CombatAudio;');
ok('CombatAudio IIFE present in app.js', iifeStart >= 0 && iifeEnd > iifeStart);
const iife = appSrc.slice(iifeStart, iifeEnd);
// strip comments for call counting
const code = iife.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

// registry keys: 6-space-indented `name(` entries inside the IIFE's
// `    return { ... };` export block (NOT bare calls elsewhere in the IIFE)
const retStart = iife.indexOf('\n    return {');
ok('registry export block present', retStart >= 0);
const retEnd = iife.indexOf('\n    };', retStart);
const retBlock = iife.slice(retStart, retEnd);
const registered = new Set();
for (const m of retBlock.matchAll(/^\s{6}([A-Za-z0-9_]+)\(/gm)) registered.add(m[1]);
ok('registry non-trivial', registered.size > 100, 'got ' + registered.size);
console.log(`mode=${target}: registered cues = ${registered.size}`);

// ---------- collect every referenced cue name ----------
// 1. literal audioEvent('name') across engine + modules
const fired = new Set();
for (const rel of ['src/js/app.js', 'src/js/game.js', 'src/js/encounters.js', 'src/js/contests.js',
    'src/js/betrayal.js', 'src/js/truth.js', 'src/js/justice.js', 'src/js/food.js',
    'src/js/party.js', 'src/js/statusEffects.js', 'src/js/alienPlayers.js',
    'src/js/monsterBehaviors.js', 'src/js/engine/combat.js', 'src/js/engine/state.js',
    'src/js/engine/calories.js', 'src/js/engine/day.js', 'src/js/engine/forage.js',
    'src/js/engine/modifiers.js']) {
  let s; try { s = readFile(rel); } catch (e) { continue; }
  for (const m of s.matchAll(/(?:audioEvent|encAudio)\(\s*['"`]([A-Za-z0-9_]+)['"`]/g)) fired.add(m[1]);
}
// 2. dynamic 'wound' + wcap
for (const w of ['woundCunning', 'woundDesperate', 'woundEnraged']) fired.add(w);
// 3. monsters.json *Audio config
const monJson = readFile('src/data/monsters.json');
const configured = new Set();
for (const m of monJson.matchAll(/"(noticeAudio|aggroAudio|deathAudio|resolveAudio)"\s*:\s*"([A-Za-z0-9_]+)"/g)) configured.add(m[2]);
// 4. drama.js DRAMA_AUDIO_MATES values
const dramaSrc = readFile('src/js/drama.js');
const matesStart = dramaSrc.indexOf('const DRAMA_AUDIO_MATES = {');
const matesEnd = dramaSrc.indexOf('};', matesStart);
const mates = new Set();
for (const m of dramaSrc.slice(matesStart, matesEnd).matchAll(/:\s*'([A-Za-z0-9_]+)'/g)) mates.add(m[1]);
// 5. contests.js CX_BEAT_DEFS part names
const cxSrc = readFile('src/js/contests.js');
const beatStart = cxSrc.indexOf('const CX_BEAT_DEFS = {');
const beatEnd = cxSrc.indexOf('};', beatStart);
const beatParts = new Set();
for (const m of cxSrc.slice(beatStart, beatEnd).matchAll(/'([A-Za-z0-9_]+)'/g)) beatParts.add(m[1]);
// (beat keys like contestSort are lazily registered compositions — resolved by design)
const referenced = new Set([...fired, ...configured, ...mates, ...beatParts]);
console.log(`referenced names: fired=${fired.size} configured=${configured.size} dramaMates=${mates.size} beatParts=${beatParts.size} total=${referenced.size}`);

// ---------- attack 1+3: every referenced name must resolve ----------
const silent = [...referenced].filter(n => !registered.has(n));
ok('zero fired-but-silent hooks', silent.length === 0, silent.join(', '));

// ---------- attack 4: every registered cue must be reachable ----------
const PUBLIC_API = new Set(['isMuted', 'toggleMute', 'ensureAudio']);
const dead = [];
for (const n of registered) {
  if (PUBLIC_API.has(n)) continue;
  const inRefs = referenced.has(n);
  // internal composition: occurrences of `name(` beyond def + registry wrapper (def=1, wrapper key+body=2)
  const uses = (code.match(new RegExp('\\b' + n + '\\(', 'g')) || []).length;
  const internallyCalled = uses > 3;
  if (!inRefs && !internallyCalled) dead.push(n);
}
ok('zero dead registered synths (beyond public API)', dead.length === 0, dead.join(', '));
console.log('dead cues: ' + (dead.length ? dead.join(', ') : '(none)'));

// ---------- attack 2: softlock surface ----------
ok('no await inside the audio IIFE', !/\bawait\b/.test(code));
ok('ensure() fails closed on AudioContext failure', /catch \(e\) \{ return false; \}/.test(code));
ok('suspended contexts get resume()', /ctx\.state === 'suspended'/.test(code) && /ctx\.resume\(\)/.test(code));
const disp = gameSrc.match(/audioEvent\(name, data\) \{[\s\S]*?\n    \},/);
ok('game.js audioEvent dispatch is try/catch no-op',
  !!disp && /if \(this\.audio && typeof this\.audio\[name\] === 'function'\)/.test(disp[0]) && /catch \(e\) \{\}/.test(disp[0]));

// ---------- attack 3: honesty spot-checks ----------
for (const w of ['woundCunning', 'woundDesperate', 'woundEnraged'])
  ok(`dynamic wound cue registered: ${w}`, registered.has(w));
ok('levelup honors {quiet:true}', /function levelup\(d\)[\s\S]{0,400}?d && d\.quiet === false/.test(iife));
ok('passiveUnlock honors {quiet:true}', /function passiveUnlock\(d\)[\s\S]{0,400}?d && d\.quiet === false/.test(iife));
// drama audio gated pre-System (day-7 quiet): the gate sits above the audioFor dispatch
const dramaFn = gameSrc.slice(gameSrc.indexOf('drama(kind,'));
ok('drama() (incl. audio mates) gated on systemArrived', /if \(!this\.state\.systemArrived\) return;/.test(dramaFn.slice(0, 800)));

console.log(`\n--- break-it audio: ${pass} pass, ${fail} fail (mode=${target}) ---`);
process.exit(fail ? 1 : 0);
