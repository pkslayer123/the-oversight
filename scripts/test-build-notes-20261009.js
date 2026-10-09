// Proof: build-notes.json is valid, append-only newest-first, wired into Game.init and the title screen.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } };

const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/build-notes.json'), 'utf8'));
check('json is an array', Array.isArray(json));
check('all entries have version+date+notes', json.every(e => e.version && e.date && Array.isArray(e.notes) && e.notes.length > 0));
check('newest first (dates non-increasing)', json.every((e, i) => i === 0 || e.date <= json[i - 1].date));
check('file kept small (<=15 entries)', json.length <= 15);
check('notes are player-facing (no dev jargon)', !json.some(e => e.notes.some(n => /jest|seed|proof test|commit|sw\.js|numstat/i.test(n))));

const game = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
check("game.js fetches build-notes.json", game.includes("'build-notes.json'"));
check("game.js stores as buildNotes", /buildNotes\s*:\s*buildNotes|buildNotes\s*\}/.test(game) || game.includes('cooking, buildNotes'));

const app = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
check('app.js has buildNotesHtml', app.includes('function buildNotesHtml()'));
check('render caps at 12 entries', app.includes('slice(0, 12)'));
check('title screen has toggle', app.includes('id="b-notes"') && app.includes("What's new"));
check('toggle collapsed by default', /id="build-notes" style="display:none/.test(app));
check('html escapes note text', app.includes('esc(n)') && app.includes('esc(e.date'));

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
