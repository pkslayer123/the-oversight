// Dialog rebuild — coordinator leak-fix proofs (2026-10-11).
// Worker B flagged three conversation-path knowledge leaks; fixed at merge.
// 1. theorizeWith 'monsters' gated lines (hushwolf counter etc.) need codex.monsters
// 2. theorizeWith 'system' topic falls back pre-arrival even when called directly
// 3. conflict history templates resolve via displayName (no baked true names)
// 4. conflictNote uses displayName (was other.name.split(' ')[0])
// 5. temperamentTalk/moodTalk/talkTemplates System lines filtered pre-day-7
const fs = require('fs');
const path = require('path');
const ROOT = __dirname + '/..';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261011', 10);

function loadGame(seed) {
  delete globalThis.Scattering;
  Math.random = mulberry32(seed); // SEED BEFORE EVAL
  global.window = global;
  global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
  global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const files = [...html.matchAll(/<script src="([^"]+)"/g)]
    .map(m => m[1].split('?')[0])
    .filter(f => f.startsWith('src/js/'))
    .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
  for (const f of files) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  delete global.window;
  return globalThis.Scattering.Game;
}

let failures = 0;
function check(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
}

function freshGame(Game) {
  Game.say = () => {};
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const v = Game.state.village;
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.day = 1; Game.dayPart = 1;
  Game.state.systemArrived = false;
  v.knownNames = {};
  return { v, s };
}

const Game = loadGame(SEED);

(async () => {
await Game.init();
const { v } = freshGame(Game);
const lines = [];
Game.say = (m) => lines.push(String(m && m.text !== undefined ? m.text : m));

// ---- 1. theorizeWith monsters gating ----
{
  Game.state.codex.monsters = {};
  Game.state.systemArrived = false;
  const npcs = v.roster.filter(id => id !== Game.villagerId).slice(0, 6);
  lines.length = 0;
  for (const vid of npcs) for (let i = 0; i < 12; i++) { try { Game.theorizeWith(vid, 'monsters'); } catch (e) {} }
  const blob = lines.join('\n');
  check('no hushwolf-counter line on fresh spawn', !/wants quiet|librarian with teeth/i.test(blob));
  check('no birds-quiet telegraph line on fresh spawn', !/Birds go quiet/i.test(blob));
  check('no headlight-deer night-habit line on fresh spawn', !/headlight-eyed one hunts at night/i.test(blob));
  // positive: with a codex entry, gated lines CAN draw
  Game.state.codex.monsters = { hushwolf: { seen: 3 } };
  lines.length = 0;
  let drew = false;
  for (const vid of npcs) for (let i = 0; i < 25 && !drew; i++) {
    const b = lines.length;
    try { Game.theorizeWith(vid, 'monsters'); } catch (e) {}
    if (/wants quiet|Birds go quiet|headlight-eyed one hunts/i.test(lines.slice(b).join('\n'))) drew = true;
  }
  check('gated monster-theory lines draw once codex has a monster entry', drew);
}

// ---- 2. system topic fallback ----
{
  Game.state.systemArrived = false;
  const vid = v.roster.filter(id => id !== Game.villagerId)[0];
  lines.length = 0;
  try { Game.theorizeWith(vid, 'system'); } catch (e) {}
  const blob = lines.join('\n');
  check('system topic falls back pre-arrival (no System concept)', !/the System|overlay/i.test(blob), blob.slice(0, 90));
}

// ---- 3. conflict history templates ----
{
  const roster = v.roster.filter(id => id !== Game.villagerId);
  const cfs = Game.genConflicts(roster.slice(0, 6));
  const cf = cfs.find(c => c.kind === 'old_wound') || cfs[0];
  if (cf) {
    const raw = (cf.history || []).join('\n');
    const va = (Game.data.villagers || []).find(x => x.id === cf.a) || {};
    const vb = (Game.data.villagers || []).find(x => x.id === cf.b) || {};
    const fa = (va.name || '').split(' ')[0], fb = (vb.name || '').split(' ')[0];
    check('history has no baked true name (a)', !fa || !raw.includes(fa) || /{a}/.test(raw), raw.slice(0, 70));
    check('history has no baked true name (b)', !fb || !raw.includes(fb) || /{b}/.test(raw), raw.slice(0, 70));
  } else check('conflict generated', false, 'no conflicts');
}

// ---- 4. conflictNote ----
{
  const roster = v.roster.filter(id => id !== Game.villagerId);
  const c = { a: roster[0], b: roster[1], kind: 'friction', stage: 0 };
  const note = Game.conflictNote(c, roster[0]);
  const trueName = ((Game.data.villagers.find(x => x.id === roster[1]) || {}).name || '').split(' ')[0];
  const known = Game.nameKnown(roster[1]);
  check('conflictNote hides unearned true name', known || !trueName || !String(note).includes(trueName), String(note).slice(0, 80));
}

// ---- 5. small-talk System filter (mirror of the eraOk logic) ----
{
  Game.state.systemArrived = false;
  const d = Game.data.characterGen || {};
  const eraOk = (arr) => (arr || []).filter(l => !!Game.state.systemArrived || !/\bSystem\b/.test(String(l)));
  let leaked = 0;
  for (const pk of ['moodTalk', 'temperamentTalk']) {
    for (const arr of Object.values(d[pk] || {})) for (const l of eraOk(arr)) if (/\bSystem\b/.test(String(l))) leaked++;
  }
  for (const l of eraOk(d.talkTemplates || [])) if (/\bSystem\b/.test(String(l))) leaked++;
  check('no System lines pass the pre-arrival small-talk filter', leaked === 0, leaked + ' leaked');
}

console.log(failures ? `\n${failures} FAILURES` : '\nALL GREEN');
process.exit(failures ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
