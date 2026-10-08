#!/usr/bin/env node
// DEAD-CODE AUDIT: every Game.* function provided by the social modules must
// have at least one call site (outside its own defining file) or be a known
// entry point (UI-called / debug / test-called). Reports orphans.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const SOCIAL = [
  'src/js/conversation.js', 'src/js/convo-mood.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/convo-scene.js',
  'src/js/convoTopics.js', 'src/js/betrayal.js', 'src/js/justice.js',
  'src/js/party-formal.js', 'src/js/hierarchy.js', 'src/js/membership.js',
  'src/js/codex-people.js', 'src/js/villager-agency.js',
];
// known UI/debug/test entry points that need no in-code caller
const ENTRY = new Set([
  'startConvo', 'convoTurn', 'endConvo', 'convoUI', 'convoChoices',
  'callMoot', 'castPlayerVote', 'bribeVoter', 'exposeBribery', 'investigateBribery',
  'petitionVillage', 'villageCard', 'villageCardAction', 'joinVillageReal',
  'probationTick', 'drift', 'driftTick', 'exilePlayer', 'villageTalk', 'villageShareFood',
  'promiseHelp', 'checkPromises', 'confrontGossip', 'bumpTrust',
  'validateAskContract', 'resolveConsequence', 'getScene',
]);

const allJs = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { if (f !== '_archive') walk(p); }
    else if (f.endsWith('.js')) allJs.push(p);
  }
})(path.join(ROOT, 'src/js'));

const orphans = [];
for (const rel of SOCIAL) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const names = new Set();
  // object-literal methods: `  name(args) {` and `name: function`
  for (const m of src.matchAll(/^\s{2,4}([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{/gm)) names.add(m[1]);
  for (const m of src.matchAll(/Game\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*function/g)) names.add(m[1]);
  for (const m of src.matchAll(/^\s{2,4}([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*function/gm)) names.add(m[1]);
  for (const name of names) {
    if (ENTRY.has(name)) continue;
    if (/^[A-Z_]+$/.test(name)) continue; // constants
    let calls = 0;
    const pat = new RegExp(`\\.${name}\\s*\\(|\\b${name}\\s*\\(`, 'g');
    const defPat = new RegExp(`^\\s{2,4}${name}\\s*\\([^)]*\\)\\s*\\{|Game\\.${name}\\s*=\\s*function|^\\s{2,4}${name}\\s*:\\s*function`);
    for (const f of allJs) {
      const other = fs.readFileSync(f, 'utf8');
      const lines = other.split('\n');
      for (const line of lines) {
        if (defPat.test(line)) continue; // the definition itself
        // reset lastIndex for global regex reuse
        pat.lastIndex = 0;
        const hits = line.match(pat);
        if (hits) calls += hits.length;
      }
    }
    if (calls === 0) orphans.push(`${rel.split('/').pop()} :: ${name}`);
  }
}
console.log('social Game functions with ZERO external call sites:', orphans.length);
for (const o of orphans.sort()) console.log('  ORPHAN', o);
process.exit(0);
