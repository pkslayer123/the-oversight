#!/usr/bin/env node
// BRAWLER FEEL PASS (Steve 2026-10-07): play the theft arc end to end as a
// player — bury a cache, get robbed, hear the gossip, confront the thief —
// and judge whether the sequence reads as one coherent, weighty social
// scene. Exercises the restored liarConfront audio wiring through the REAL
// player path (convo choices -> confront:<doubtId>).
//
// Usage: node scripts/play-brawler-theft-arc-feel-20261008.js (SEED override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED);
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'\"'\"']*\\.js' index.html | head -80", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); } });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;
const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function note(t) { console.log(t); }
function flush(tag, max = 6) { const take = says.splice(0).slice(0, max); for (const t of take) note(`   | ${tag} ${String(t).slice(0, 200)}`); }

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const me = Game.state.scholar;
  note(`== DAY 1: I'm ${Game.displayName ? 'the scholar' : 'the scholar'}, burying jerky ==`);
  // Give myself something worth stealing, then bury it.
  me.inventory = me.inventory || [];
  me.inventory.push({ id: 'jerky1', name: 'jerky', kcalEach: 200, units: 4, spoilDay: 30, safe: true, kg: 0.1 });
  const c = Game.buryCache('food', me.inventory.length - 1, 4);
  note(`   buried: ${c ? c.label : 'FAILED'}`);
  flush('bury');

  // The robbery. resolveCacheRobbery plants the gossip/doubt only 50% — force
  // the trace path deterministically if the roll missed, and say so honestly.
  note(`\n== NIGHT: someone digs up the cache ==`);
  Game.resolveCacheRobbery(c);
  let doubt = (Game.state.codex.doubts || []).find(d => d.theft && !d.resolved);
  let forced = false;
  if (!doubt && c.robbedBy) { Game.plantCacheTheftSuspicion(c.robbedBy, c); forced = true; doubt = (Game.state.codex.doubts || []).find(d => d.theft && !d.resolved); }
  note(`   robbed by: ${c.robbedBy ? Game.displayName(c.robbedBy) : 'nobody (roll missed)'}${forced ? ' — trace FORCED (50% roll missed this seed)' : ''}`);
  flush('gossip');
  if (!doubt) { note('   NO DOUBT — arc dead-ends here. FAIL.'); process.exit(1); }

  // Player path: walk up to the accused and talk.
  const vid = c.robbedBy;
  note(`\n== I walk up to ${Game.displayName(vid)} ==`);
  Game.startConvo(vid);
  const choices = Game.convoChoices(vid) || [];
  const confront = choices.find(ch => ch.id === 'confront:' + doubt.id);
  note(`   choices offered: ${choices.map(ch => ch.id).join(' | ').slice(0, 220)}`);
  note(`   confrontation choice present: ${!!confront}`);
  const events = [];
  Game.audioEvent = (name, data) => { events.push(name + ':' + JSON.stringify(data)); };
  const turn = Game.convoTurn(vid, 'confront:' + doubt.id);
  note(`   outcome: ${turn && turn.outcome}`);
  flush('confront', 8);
  note(`   audio beats: ${events.join(' ; ') || '(none)'}`);
  note(`\n   trust now: ${((Game.state.village.trust || {})[vid])}, doubt resolved: ${(Game.state.codex.doubts || []).find(d => d.id === doubt.id).resolved}`);
  Game.endConvo(vid);
  note(`\n(done — seed ${SEED})`);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
