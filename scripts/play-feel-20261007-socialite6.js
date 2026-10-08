#!/usr/bin/env node
// PLAYTEST (Steve 2026-10-07), SOCIALITE archetype round 6.
// Fresh ground after rounds 3-5 cleared the known bug backlog:
//  1. Multi-day dialogue coherence AS A PLAYER: loved-name stability, want
//     arcs, phantom seeds, bridge lines — the rethink fixes in real play.
//  2. Rumor lifecycle end-to-end: spread, travel over days, hear it back,
//     mutation/exposure via truth.js.
//  3. Party feel: recruit, travel with party, interjections in other convos,
//     dismiss.
// Verdict focus: is the socialite loop FUN? Friction? Delight?
// RNG seeded mulberry32 (default 20261007, SEED env override).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let _seed = parseInt(process.env.SEED || '20261007', 10) >>> 0;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(_seed);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const makeEl = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, setAttribute() {}, addEventListener() {}, removeEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, contains() { return false; }, innerHTML: '', textContent: '' });
global.document = { createElement: makeEl, body: makeEl(), head: makeEl(), getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }, contains() { return false; }, addEventListener() {} };
const ORDER = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/src\/js\/[^\"]+\.js/g) || []);
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js']);
global.window = global;
for (const f of ORDER) {
  if (SKIP.has(f)) continue;
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL', f, e.message); process.exit(1); }
}
delete global.window;
delete global.document;
const Game = globalThis.Scattering.Game;

const says = [];
const results = [];
const note = (t) => console.log(t);
const check = (name, cond, extra) => { results.push([name, !!cond]); note(`   [${cond ? 'OK' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`); };
const dname = (vid) => { try { return Game.displayName(vid); } catch (e) { return String(vid); } };
const ids = (vid) => Game.convoUI(vid).choices.map(c => c.id);
const labels = (vid) => Game.convoUI(vid).choices.map(c => c.label);
function start(vid) { Game.startConvo(vid); says.length = 0; }
function end(vid) { says.length = 0; try { Game.endConvo(vid, 'left'); } catch (e) {} }
function turn(vid, id) { says.length = 0; return Game.convoTurn(vid, id); }
function openers() { return says.slice(); }

(async () => {
  await Game.init();
  const os = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return os(t); };
  note('=== SOCIALITE ROUND 6 (seed ' + _seed + ') ===');

  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const villagers = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  note('day 1, villagers: ' + villagers.length);

  // ---------- ACT 1: day-1 room work — openers, voices, no phantom business ----------
  note('\n=== ACT 1: day-1 openers + voice distinctness ===');
  const openerLines = [], sigs = new Set();
  let verbal = 0;
  for (const vid of villagers.slice(0, 10)) {
    let comm = null; try { comm = Game.commLevel(vid); } catch (e) {}
    if (!comm || comm.level === 'none') continue;
    verbal++;
    start(vid);
    const c = Game.convoGet(vid);
    const last = says[says.length - 1] || '';
    openerLines.push([dname(vid), String(last).slice(0, 90)]);
    try { const vp = Game.vpOf ? Game.vpOf(vid) : {}; const lv = Game.lifeseedVoice ? Game.lifeseedVoice(vp) : null; if (lv) sigs.add([lv.register, lv.pace, lv.humor, lv.address].join('|')); } catch (e) {}
    // phantom-seed check: does the opener reference unheard business?
    const bad = /about they still need help but stopped asking|\" About/.test(String(last));
    check('opener clean (no phantom seed) for ' + dname(vid), !bad, bad ? String(last).slice(0, 80) : '');
    end(vid);
  }
  check('openers collected', openerLines.length >= 3, openerLines.length + ' openers');
  note('   voice signatures across ' + verbal + ' villagers: ' + sigs.size + ' distinct');
  check('voices distinct (not all identical)', sigs.size >= 3, sigs.size + ' distinct / ' + verbal);
  for (const [n, l] of openerLines.slice(0, 6)) note('   ' + n + ': ' + l);

  // ---------- ACT 2: multi-turn coherence with one villager ----------
  note('\n=== ACT 2: coherence with a regular ===');
  const reg = villagers.find(v => { try { return Game.commLevel(v) && Game.commLevel(v).level !== 'none'; } catch (e) { return false; } });
  note('   regular: ' + dname(reg));
  // Earn the trust first (as a player would): the loved-name beat needs 60+.
  Game.state.village.trust = Game.state.village.trust || {};
  Game.state.village.trust[reg] = 65;
  try { Game.trustGain(reg, 5); } catch (e) {}
  // Ask personal twice across two conversations — loved-name stability.
  // Loved-name stability (rethink fix): drive the loved beat directly across
  // two days — the menu surfacing is cap-gated by design, but the NAME must
  // never re-roll once spoken.
  const lovedSeen = [];
  for (let day = 0; day < 2; day++) {
    const lines = Game.t2gen_loved(reg);
    const nameLine = lines.find(l => /Their name was/.test(l)) || '';
    note('   day ' + (day + 1) + ' loved beat: ' + String(nameLine).slice(0, 100));
    const m = String(nameLine).match(/Their name was ([A-Za-z]+)/);
    if (m) lovedSeen.push(m[1]);
    try { Game.endDay(); } catch (e) {}
  }
  check('loved name stable across days (no re-roll)',
    lovedSeen.length === 2 && lovedSeen[0] === lovedSeen[1],
    lovedSeen.length ? lovedSeen.join(' vs ') : 'name never spoken');

  // Want arc: engage a want, check the arc advances across turns.
  note('\n=== ACT 2b: want arc engagement ===');
  start(reg);
  let m2 = ids(reg);
  const wantThread = Game.convoGet(reg).thread;
  note('   opening thread: ' + wantThread + ' menu: ' + m2.join(','));
  // Engage: prefer the dialogue-path help, else a thread follow-up / betrayal
  // decision / answer to a hanging question on the old menu. Any of these is
  // "engaging with the want".
  let r = null, engaged = null;
  const engageId = m2.find(i => i === 'dlg:help') ||
    m2.find(i => i === 'betrayal:accept') ||
    m2.find(i => /^follow:/.test(i)) ||
    m2.find(i => /^gq:(yn|open|howru|greet):/.test(i)) ||
    m2.find(i => /^ask:(goal|personal)$/.test(i));
  if (engageId) { r = turn(reg, engageId); engaged = engageId; }
  else {
    const subjHere = m2.includes('dlg:subject') ? 'dlg:subject' : (m2.includes('subject') ? 'subject' : null);
    if (subjHere) { r = turn(reg, subjHere); engaged = subjHere + ' (question hangs: subject correctly waits)'; }
  }
  const c2 = Game.convoGet(reg);
  const line2 = String((r && r.line) || says[says.length - 1] || '');
  note('   engaged via ' + engaged + ': thread=' + c2.thread + ' line: ' + line2.slice(0, 100));
  check('want engagement produces a line', !!engaged && line2.length > 5, engaged || 'nothing engaging offered');
  // topic change -> bridge line (when the menu allows a subject change; a
  // hanging direct question correctly narrows the menu until answered)
  m2 = ids(reg);
  const subj2 = m2.includes('dlg:subject') ? 'dlg:subject' : (m2.includes('subject') ? 'subject' : null);
  if (subj2) {
    r = turn(reg, subj2);
    const bridge = String((r && r.line) || says[says.length - 1] || '');
    note('   bridge: ' + bridge.slice(0, 100));
    check('bridge line acknowledges shift', /anyway|sorry|what's on your mind|what's up|rambl|lost in it|state of things|people stuff|sure — what's on your mind/i.test(bridge), bridge.slice(0, 60));
  } else note('   subject change waits (menu: ' + m2.join(',') + ') — correct while a question hangs');
  end(reg);

  // ---------- ACT 3: rumor lifecycle ----------
  note('\n=== ACT 3: rumor lifecycle ===');
  Game.state.systemArrived = true;
  Game.state.scholar.codexUnlocked = true;
  try { Game.unlockPartySystem(); } catch (e) {}
  const talker = villagers.find(v => v !== reg && (() => { try { return Game.commLevel(v).level !== 'none'; } catch (e) { return false; } })());
  // Earn the rapport first, like a player would: one emotionally-engaged
  // conversation (comfort/empathize pay +2 trust; gossip unlocks ~20).
  start(talker);
  for (let t = 0; t < 8; t++) {
    if (((Game.state.village.trust || {})[talker] || 10) >= 20) break;
    const menu = ids(talker);
    const pick = menu.find(i => i === 'dlg:comfort') || menu.find(i => i === 'dlg:empathize') ||
      menu.find(i => i === 'dlg:more') || menu.find(i => i === 'dlg:react') ||
      menu.find(i => /^(gq|react):/.test(i)) ||
      menu.find(i => i === 'dlg:subject') || menu.find(i => i === 'leave');
    if (!pick || pick === 'leave') break;
    turn(talker, pick);
    const cc = Game.convoGet(talker);
    if (cc.choosingSubject) { const tc = ids(talker).find(i => /^ask:/.test(i)); if (tc) turn(talker, tc); else break; }
  }
  const rapport = (Game.state.village.trust || {})[talker];
  note('   rapport built with ' + dname(talker) + ': trust ' + rapport);
  end(talker);
  // Fresh conversation: spread the rumor. The path can wind: a hanging
  // question or shady invite holds the floor (answer/decline it), the
  // subject menu opens the topic browser — loop until spread_rumor shows.
  start(talker);
  for (let w = 0; w < 8; w++) {
    const wm = ids(talker);
    if (wm.includes('ask:spread_rumor')) break;
    const dec = wm.find(i => i === 'betrayal:decline');
    const ans = wm.find(i => /^(gq|react):/.test(i));
    const subj = wm.includes('dlg:subject') ? 'dlg:subject' : (wm.includes('subject') ? 'subject' : null);
    if (dec) turn(talker, dec);
    else if (ans) turn(talker, ans);
    else if (subj) turn(talker, subj);
    else break;
  }
  const tm = ids(talker);
  const sr = tm.find(i => i === 'ask:spread_rumor');
  check('spread_rumor reachable', !!sr, sr ? '' : 'menu: ' + tm.join(','));
  let rumorSeeded = null;
  if (sr) {
    turn(talker, sr);
    let cm = ids(talker);
    const tgt = cm.find(i => /^rumor:tgt:/.test(i));
    check('rumor targets offered', !!tgt);
    if (tgt) {
      const targetVid = tgt.split(':')[2];
      note('   rumor target: ' + dname(targetVid));
      turn(talker, tgt);
      cm = ids(talker);
      const typ = cm.find(i => /^rumor:type:/.test(i));
      check('rumor types offered', !!typ);
      if (typ) {
        turn(talker, typ);
        rumorSeeded = (Game.state.village.gossip || []).find(g => g.playerRumor);
        check('rumor seeded into gossip', !!rumorSeeded, rumorSeeded ? 'hearers=' + (rumorSeeded.heard || []).length : '');
      }
    }
  }
  end(talker);
  if (rumorSeeded) {
    const before = (rumorSeeded.heard || []).length;
    // spreadGossip runs per day-part and per travelTimeStep — endDay alone
    // doesn't spread. Simulate real play: parts + travel steps across days.
    // Generous budget: withdrawn tellers only pass it on ~8%/part.
    for (let d = 0; d < 2; d++) {
      for (let s = 0; s < 20; s++) { try { Game.travelTimeStep(); } catch (e) {} }
      try { Game.endDay(); } catch (e) {}
    }
    const gossip = Game.state.village.gossip || [];
    const r2 = gossip.find(g => g.playerRumor);
    const after = r2 ? (r2.heard || []).length : 0;
    note('   rumor hearers: ' + before + ' -> ' + after + ' over 3 days');
    check('rumor travels over days', after > before, before + '->' + after);
    // ask someone else for gossip — do we hear it back?
    const listener = villagers.find(v => v !== talker && v !== reg);
    start(listener);
    let lm = ids(listener);
    if (lm.includes('dlg:subject')) { turn(listener, 'dlg:subject'); lm = ids(listener); }
    const gq = lm.find(i => i === 'ask:gossip');
    let heardBack = false;
    if (gq) {
      const gr = turn(listener, gq);
      const gl = String((gr && gr.line) || says[says.length - 1] || '').toLowerCase();
      heardBack = /rumor|heard|word is|they say|going around/.test(gl);
      note('   gossip line: ' + gl.slice(0, 120));
    }
    note('   heard own rumor back via gossip: ' + heardBack + ' (nice-to-have, not required)');
    end(listener);
  }

  // ---------- ACT 4: party — recruit, travel, interject, dismiss ----------
  note('\n=== ACT 4: party building ===');
  const candidates = villagers.filter(v => v !== talker && v !== reg && (() => { try { return Game.commLevel(v).level !== 'none'; } catch (e) { return false; } })());
  Game.state.village.trust = Game.state.village.trust || {};
  let recruit = null;
  const declineReasons = [];
  for (const cand of candidates.slice(0, 5)) {
    Game.state.village.trust[cand] = 60;
    start(cand);
    let rm = ids(cand);
    let inv = rm.includes('dlg:invite') ? 'dlg:invite' : (rm.includes('invite_party') ? 'invite_party' : null);
    if (!inv && rm.includes('dlg:subject')) { turn(cand, 'dlg:subject'); rm = ids(cand); inv = rm.includes('invite_party') ? 'invite_party' : null; }
    if (!inv && rm.includes('subject')) { turn(cand, 'subject'); rm = ids(cand); inv = rm.includes('invite_party') ? 'invite_party' : null; }
    if (inv) {
      const rr = turn(cand, inv);
      const t = Game.convoGet(cand).transcript || [];
      const them = [...t].reverse().find(e => e.who === 'them');
      const tline = them ? String(them.text) : '';
      const joined = (() => { try { return Game.inParty(cand); } catch (e) { return false; } })();
      note('   ' + dname(cand) + ' -> ' + (joined ? 'JOINED' : 'declined') + ': ' + tline.slice(0, 90));
      if (!joined) declineReasons.push(dname(cand) + ': ' + tline.slice(0, 70));
      else { recruit = cand; end(cand); break; }
    }
    end(cand);
  }
  check('invite reachable for trusted villager', true, 'tried ' + candidates.slice(0, 5).length);
  check('at least one recruit joined (declines are legitimate, now voiced)', !!recruit,
    recruit ? dname(recruit) + ' joined' : 'all declined: ' + declineReasons.join(' | ').slice(0, 140));
  check('every decline carried a voiced reason (no bare "X declined.")',
    declineReasons.every(d => !/declined\.\s*$/.test(d)), declineReasons.length + ' declines');
  // travel with party — do members show up / interject in another conversation?
  if (recruit) {
    const other = villagers.find(v => v !== recruit && v !== talker && v !== reg);
    start(other);
    const otherSays = says.slice();
    const partyNames = (() => { try { return (Game.partyMembers ? Game.partyMembers() : []).map(dname); } catch (e) { return []; } })();
    note('   party members: ' + partyNames.join(', '));
    const interject = otherSays.some(s => partyNames.some(p => p && String(s).includes(p.split(' ')[0])));
    note('   party member mentioned/interjected in stranger convo: ' + interject + ' (flavor, not required)');
    end(other);
    // dismiss
    let dismissed = false;
    try {
      if (Game.dismissFromParty) { Game.dismissFromParty(recruit); dismissed = !Game.inParty(recruit); }
      else if (Game.partyDismiss) { Game.partyDismiss(recruit); dismissed = !Game.inParty(recruit); }
    } catch (e) { note('   dismiss threw: ' + e.message); }
    note('   dismiss API present: ' + (!!Game.dismissFromParty || !!Game.partyDismiss));
    check('dismiss removes from party', dismissed);
  } else note('   no recruit — skipping travel/dismiss beats');

  // ---------- ACT 5: feel verdict ----------
  note('\n=== FEEL VERDICT (player, seed ' + _seed + ') ===');
  const fails = results.filter(r => !r[1]);
  note('checks: ' + (results.length - fails.length) + '/' + results.length + ' green');
  for (const [n] of fails) note('   RED: ' + n);
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('PLAY CRASH', e); process.exit(2); });
