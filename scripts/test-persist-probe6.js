// PROBE 6: save-blob size — is quota pressure realistic? Report, don't fail.
'use strict';
freshGame();
G.save();
const key = G.state.runKey;
const blob = storage.getItem(key);
console.log('total blob bytes:', blob.length);
const s = JSON.parse(blob);
function sizeOf(v) { try { return JSON.stringify(v).length; } catch (e) { return -1; } }
const parts = [
  ['run.map', s.run && s.run.map],
  ['village', s.village],
  ['codex', s.codex],
  ['scholar', s.scholar],
  ['run.log', s.run && s.run.log],
  ['run.tbfight', s.run && s.run.tbfight],
  ['rest-of-state', (function(){ const c = Object.assign({}, s); delete c.run; delete c.village; delete c.codex; delete c.scholar; return c; })()],
];
for (const [n, v] of parts) console.log(' ', n, sizeOf(v), 'bytes');
// localStorage typical quota 5MB
console.log('fraction of 5MB quota:', (blob.length / (5 * 1024 * 1024) * 100).toFixed(2) + '%');
process.exit(0);
