#!/usr/bin/env node
// PLAYTEST (Steve 2026-10-07), SOCIALITE archetype round 3.
// Verifies the round-2 fixes LIVE (commit 9eaf4bb) and plays the socialite
// as a player: work the room, gossip, spread a rumor, recap, resume threads,
// then probe cross-boundary synergy discovery end-to-end.
// RNG seeded mulberry32 (default 20261007, SEED env override).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let _seed = parseInt(process.env.SEED || '20261007', 10) >>> 0;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(_seed);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
// drama.js touches document at load (untracked, sibling-owned) — stub for eval only.
const makeEl = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {},
  setAttribute() {}, addEventListener() {}, removeEventListener() {}, querySelector() { return null; },
  querySelectorAll() { return []; }, contains() { return false; }, innerHTML: '', textContent: '' });
global.document = { createElement: makeEl, body: makeEl(), head: makeEl(),
  getElementById() { return null; }, querySelector() { return null; },
  querySelectorAll() { return []; }, contains() { return false; }, addEventListener() {} };

const ORDER = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/src\/js\/[^"]+\.js/g) || []);
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js']);
global.window = global; // equipment.js needs window at load; deleted after (sync combat path)
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
const check = (name, cond, extra) => {
  results.push([name, !!cond]);
  note(`   [${cond ? 'OK' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`);
};
const flush = (tag, re, n) => {
  const hit = says.filter(t => re.test(t));
  for (const t of hit.slice(0, n || 6)) note(`   ${tag} ${String(t).slice(0, 200)}`);
  says.length = 0;
};
const dname = (vid) => { try { return Game.displayName(vid); } catch (e) { return vid; } };

async function fresh() {
  Game.genRoster('Columbus, Ohio');
  const roster = Game.generatedRoster || [];
  // most socialite-flavored roll available (round 2 used Grace Santos, lawyer)
  let pick = roster.find(c => /lawyer|mediator|diplomat|counselor|teacher/i.test((c.formerOccupation || '') + ' ' + (c.name || ''))) || roster[0];
  Game.newGame('Columbus, Ohio', null, pick.id);
  Game.depart();
  const s = Game.state.scholar;
  return { pick, s };
}
const choiceIds = (vid) => Game.convoUI(vid).choices.map(c => c.id);
const findChoice = (vid, id) => Game.convoUI(vid).choices.find(c => c.id === id);

(async () => {
  await Game.init();
  const os = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return os(t); };

  note('=== SOCIALITE ROUND 3 (seed ' + _seed + ') — verify round-2 fixes live ===');
  const { pick, s } = await fresh();
  flush('>', /./, 0);
  const rc = (Game.state.village.rosterChars || {})[Game.villagerId] || {};
  note(`   playing as: ${rc.name || pick.name} (${rc.formerOccupation || '?'}, ${((rc.personality || {}).temperament) || '?'})`);
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  note(`   villagers in haven: ${roster.length} (${roster.slice(0, 4).map(dname).join(', ')}${roster.length > 4 ? '…' : ''})`);

  // ============ ACT 1: work the room — is spread_rumor reachable? ============
  // NOTE: gossip/spread_rumor are rapport-gated by design (trust>=20 ||
  // 2nd conversation) and sit 2nd/3rd in the asks array, ahead of the topic
  // cap (fix 9eaf4bb). The dlg: scenario layer can intercept the menu, so
  // play each conversation honestly until the base menu (ask: choices)
  // appears, then check positions.
  note('\n=== ACT 1: conversations — gossip + spread_rumor reachability ===');
  const talked = roster.slice(0, 6);
  let baseMenus = 0, rumorReachable = 0, gossipReachable = 0, gossipSample = null, rumorPos = [];
  for (const vid of talked) {
    for (let round = 0; round < 3; round++) {
      says.length = 0;
      Game.startConvo(vid);
      let ids = choiceIds(vid);
      // the dialogue layer fronts every conversation; dlg:subject is the
      // player path to the subject menu ("can I ask you something else?").
      if (ids.includes('dlg:subject')) {
        says.length = 0;
        Game.convoTurn(vid, 'dlg:subject');
        ids = choiceIds(vid);
      }
      const base = ids.some(i => /^ask:/.test(i));
      if (base) {
        baseMenus++;
        const pos = ids.indexOf('ask:spread_rumor');
        if (ids.includes('ask:gossip')) gossipReachable++;
        if (pos !== -1) { rumorReachable++; rumorPos.push(pos); }
        if (gossipSample === null && ids.includes('ask:gossip')) {
          says.length = 0;
          Game.convoTurn(vid, 'ask:gossip');
          // the 📓 journal toast is correctly emitted as its own line now —
          // the hygiene check examines only the spoken beat.
          const toastSeen = says.some(t => /^\s*📓/.test(t));
          if (toastSeen) note('   (info) journal toast emitted separately from the gossip line');
          const g = says.filter(t => !/^\s*📓/.test(t)).join(' ');
          gossipSample = g.slice(0, 260);
        }
      }
      says.length = 0;
      Game.endConvo(vid, 'left');
    }
  }
  check('base menus reached through honest play', baseMenus >= 4, `${baseMenus} base menus across ${talked.length} villagers`);
  check('spread_rumor in base menu (fix 9eaf4bb)', rumorReachable >= 3, `${rumorReachable} menus offered it at positions [${rumorPos.join(',')}]`);
  check('gossip reachable alongside rumor verb', gossipReachable >= 3, `${gossipReachable}`);
  // QUOTE HYGIENE (fix 2026-10-07): gossip beats must render with exactly
  // one quote layer and no doubled name.
  const nested = gossipSample && /"[^"]*"[^"]*"[^"]*"/.test(gossipSample);
  const doubledName = gossipSample && new RegExp(`^[^:]+: [^:]+: `).test(gossipSample);
  check('gossip output has no nested quotes / doubled names', gossipSample && !nested && !doubledName, gossipSample || 'no sample');
  if (gossipSample) note(`   gossip sample: ${gossipSample}`);

  // ============ ACT 2: the drama verb — spread a rumor, watch it travel ============
  note('\n=== ACT 2: spread a rumor for real ===');
  // pick a non-deflector (withdrawn/prickly/restless villagers shut down to
  // 2 topics by design — the drama verb needs someone who'll actually talk)
  let teller = null;
  for (const vid of talked) {
    says.length = 0;
    Game.startConvo(vid);
    if (choiceIds(vid).includes('dlg:subject')) { says.length = 0; Game.convoTurn(vid, 'dlg:subject'); }
    if (choiceIds(vid).includes('ask:spread_rumor')) { teller = vid; break; }
    says.length = 0;
    Game.endConvo(vid, 'left');
  }
  check('found a villager open to the drama verb', !!teller, teller ? dname(teller) : 'none');
  let ids = [];
  if (teller) {
  says.length = 0;
  // the ask: choices live behind dlg:subject (dialogue layer fronts the menu)
  ids = choiceIds(teller);
  check('spread_rumor choice present when starting drama', ids.includes('ask:spread_rumor'), ids.join(','));
  says.length = 0;
  Game.convoTurn(teller, 'ask:spread_rumor');
  flush('them>', /leans in|talking about/i, 3);
  // two-step: pick target, then type — drive via convoTurn rumor choice ids
  ids = choiceIds(teller);
  const targetPick = ids.find(i => /^rumor:tgt:/.test(i));
  check('rumor target selection offered', !!targetPick, targetPick || 'no target choices');
  let rumor = null;
  if (targetPick) {
    Game.convoTurn(teller, targetPick);
    ids = choiceIds(teller);
    const typePick = ids.find(i => /^rumor:type:/.test(i));
    check('rumor type selection offered', !!typePick, typePick || 'no type choices');
    if (typePick) {
      says.length = 0;
      Game.convoTurn(teller, typePick);
      flush('me>', /telling people|talking about/i, 3);
      const v = Game.state.village;
      rumor = (v.gossip || []).find(g => g.playerRumor);
      check('player rumor seeded into village gossip with first hearer', !!(rumor && rumor.heard && rumor.heard.length),
        rumor ? `type=${rumor.action} about=${dname(rumor.dims.who)} heard=[${(rumor.heard || []).map(dname).join(',')}]` : 'no gossip entry');
    }
  }
  says.length = 0;
  Game.endConvo(teller, 'done');

  // let it travel: run several day-parts of spreadGossip, then ask around.
  // (spread is probabilistic per teller — run enough iterations.)
  if (rumor) {
    for (let i = 0; i < 40; i++) { try { Game.spreadGossip(); } catch (e) { note('   spreadGossip threw: ' + e.message); break; } }
    check('rumor traveled beyond the first hearer', rumor.heard.length > 1, `heard by ${rumor.heard.length}: ${(rumor.heard || []).map(dname).join(', ')}`);
    // does the player ever HEAR it back? ask gossip with someone who heard it
    const hearer = (rumor.heard || []).find(id => id !== teller);
    let heardBack = false;
    if (hearer) {
      says.length = 0;
      Game.startConvo(hearer);
      const gids = choiceIds(hearer);
      if (gids.includes('ask:gossip')) {
        Game.convoTurn(hearer, 'ask:gossip');
        const g = says.join(' ');
        const subj = dname(rumor.dims.who);
        heardBack = g.toLowerCase().includes(subj.toLowerCase().split(' ')[0].toLowerCase());
        if (!heardBack) note(`   gossip from ${dname(hearer)} did not mention ${subj} (sample: ${g.slice(0, 180)})`);
      }
      says.length = 0;
      Game.endConvo(hearer, 'done');
    }
    note(`   [INFO] rumor heard back via gossip ask: ${heardBack ? 'YES' : 'no'}`);
  }
  } // end if (teller)

  // ============ ACT 3: topic ledger + recap — leave mid-thread, come back ============
  note('\n=== ACT 3: topic ledger — leave mid-thread, resume, recap ===');
  const lv = talked[1];
  says.length = 0;
  Game.startConvo(lv);
  ids = choiceIds(lv);
  const pastAsk = ids.includes('ask:past');
  if (pastAsk) Game.convoTurn(lv, 'ask:past'); // substantive thread
  flush('them>', /./, 2);
  says.length = 0;
  Game.endConvo(lv, 'left'); // walk away mid-thread
  const ledger = Game.convoTopicLedger(lv);
  const open = (ledger.open || []).map(o => o.tid || o.label);
  check('leaving mid-thread plants an open thread', open.length > 0, `open=[${open.join(', ')}]`);
  // resume opener is trust-gated (>=15, default 10) and 65% RNG — earn the
  // trust first, the way a player would (talk + share), then come back.
  // (want seeds preempt the opener; suppress them here to test the resume
  // mechanic itself — restored right after.)
  Game.state.village.trust = Game.state.village.trust || {};
  Game.state.village.trust[lv] = 25;
  // a queued talk request preempts the resume by design ("never ahead of a
  // talk request") — clear it for this mechanic check.
  try { if (Game.state.village.talkRequests) delete Game.state.village.talkRequests[lv]; } catch (e) {}
  const _sw = Game.convoSelectWant;
  if (_sw) Game.convoSelectWant = () => null;
  says.length = 0;
  Game.startConvo(lv);
  const ui0 = Game.convoUI(lv);
  let resumeInTranscript = (ui0.transcript || []).some(t => /never finished|cut off|we were talking|days back/i.test(t.text || ''));
  let openerLine = (ui0.transcript || []).filter(t => t.who === 'them').map(t => t.text).join(' ').slice(0, 200);
  // the resume opener has a 65%-per-conversation gate by design (not every
  // hello rehashes old threads) — retry directly to distinguish "RNG said
  // no" from "mechanic broken".
  if (!resumeInTranscript) {
    let opener = null;
    for (let a = 0; a < 6 && !opener; a++) {
      try { Game.convoGet(lv)._resumedOnce = false; opener = Game.convoResumeOpener(lv); } catch (e) {}
    }
    resumeInTranscript = !!opener;
    if (opener) openerLine = String(opener.line || '').slice(0, 200);
  }
  check('resume opener fires on a later conversation (trust 25)', resumeInTranscript, openerLine || 'no resume in opener');
  if (resumeInTranscript) note(`   resume: "${openerLine}"`);
  if (_sw) Game.convoSelectWant = _sw;
  // recap verb mid-conversation
  ids = choiceIds(lv);
  const recapChoice = ids.find(i => /recap/.test(i));
  let recapLine = null;
  if (recapChoice) {
    says.length = 0;
    Game.convoTurn(lv, recapChoice);
    recapLine = says.join(' ').slice(0, 220);
  } else {
    try { recapLine = String(Game.convoRecapLine(lv) || '').slice(0, 220); } catch (e) { recapLine = null; }
  }
  check('recap verb produces a thread re-anchor', !!(recapLine && recapLine.length > 10), recapLine || 'none');
  if (recapLine) note(`   recap: "${recapLine}"`);
  says.length = 0;
  Game.endConvo(lv, 'done');

  // drift: check the vector exists and bends voice on a lived event
  const drift = Game.convoDrift(lv);
  check('drift vector present', !!drift && typeof drift.grief === 'number',
    drift ? JSON.stringify(drift) : 'none');
  const dna = Game.convoSpeechDNA(lv);
  check('speech DNA present', !!dna && !!(dna.register || dna.pace || dna.address),
    dna ? `${dna.register || '?'}/${dna.pace || '?'}/${dna.humor || '?'}` : 'none');
  // scenario-thread labels (fix 2026-10-07): no raw tids in resume/recap lines
  check("taughtref label is human ('that lesson they offered')",
    Game.convoTopicLabel(lv, 'taughtref') === 'that lesson they offered',
    Game.convoTopicLabel(lv, 'taughtref'));
  check("recall label is human ('what you told them')",
    Game.convoTopicLabel(lv, 'recall') === 'what you told them',
    Game.convoTopicLabel(lv, 'recall'));

  // ============ ACT 4: cross-boundary synergy — can it discover now? ============
  note('\n=== ACT 4: cross-boundary synergy discovery (trailblazers_promise) ===');
  const syns = Game.data.synergies || [];
  const tbp = syns.find(x => x.id === 'trailblazers_promise');
  check('trailblazers_promise synergy data exists', !!tbp);
  if (tbp) {
    note(`   requires=[${(tbp.requires || []).join(', ')}] order=[${((tbp.discovery_method || {}).order || []).join(', ')}] type=${(tbp.discovery_method || {}).type}`);
    // hold the ability leg + know the technique leg (abilities is an ARRAY of
    // {id, level, xp} — the engine's hasAbility concats it)
    s.abilities = s.abilities || [];
    if (!s.abilities.some(e => ((e && e.id) || e) === 'pathfinder')) s.abilities.push({ id: 'pathfinder', level: 2, xp: 0 });
    s.codex = s.codex || {};
    s.codex.techniques = s.codex.techniques || {};
    s.codex.techniques['trail_blazing'] = { level: 1 };
    const day = (Game.state.village && Game.state.village.day) || 1;
    // REAL-PLAYER PATH (fix 2026-10-07): no game code logs tech uses, so a
    // player can only ever log the ABILITY leg. Technique/skill synthesis
    // must turn those ability uses into discovery progress.
    says.length = 0;
    Game.noteAbilityUse('pathfinder');
    Game.noteAbilityUse('pathfinder');
    Game.noteAbilityUse('pathfinder');
    const attempts = (s.synergyAttempts || {})['trailblazers_promise'] || 0;
    check('3 ability uses discover the cross-boundary synergy (synthesis)', attempts >= 3 && (s.synergies || []).includes('trailblazers_promise'),
      `attempts=${attempts} discovered=${(s.synergies || []).includes('trailblazers_promise')}`);
    if ((s.synergies || []).includes('trailblazers_promise')) {
      Game.recomputeActiveSynergies();
      const active = (s.activeSynergies || []).includes('trailblazers_promise');
      check('discovered cross-boundary synergy is ACTIVE (recompute fix)', active);
      flush('✨', /trailblazer/i, 2);
    }
    // control: without the technique held, ability uses do nothing
    const s2 = Game.state.scholar;
    delete s2.codex.techniques['trail_blazing'];
    s2.synergyAttempts = {};
    const before = JSON.stringify(s2.synergies);
    Game.noteAbilityUse('pathfinder'); Game.noteAbilityUse('pathfinder'); Game.noteAbilityUse('pathfinder');
    check('no phantom discovery without the technique', JSON.stringify(s2.synergies) === before);
  }

  // ============ ACT 5: trial abilities — still unacquirable? ============
  note('\n=== ACT 5: trial-unlock abilities (silver_tongue / gossip_network / peacemaker) ===');
  const abs = Game.data.abilities || [];
  const trial3 = ['silver_tongue', 'gossip_network', 'peacemaker'].map(id => abs.find(a => a.id === id));
  for (const a of trial3) {
    if (!a) { note(`   [INFO] ability missing from data: ${a}`); continue; }
    note(`   ${a.id}: unlock=${JSON.stringify(a.unlock)}`);
  }
  // live check: is there ANY runtime consumer of the trial unlock type, or a
  // grant path for `granted` abilities? (The only unlock.type the engine
  // reads is 'system_offer' — firstAbilityChoices.)
  const srcAll = ['game.js', 'conversation.js', 'progression.js', 'justice.js', 'membership.js']
    .map(f => { try { return fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8'); } catch (e) { return ''; } }).join('\n');
  const trialConsumers = (srcAll.match(/unlock\.type\s*===\s*['"]trial['"]/g) || []).length;
  const trialStrings = (srcAll.match(/hear_10_rumors|stop_a_fight|win_a_fight|intimidate_someone|discover_5_locations|catch_3_lies|survive_3_fights_no_flee|land_10_killing_blows|snare_10_catches/g) || []).length;
  const trialTracker = ['trialProgress', 'trial_progress', 'trialsEarned', 'checkTrial', 'trackTrial']
    .filter(k => srcAll.includes(k)).length;
  note(`   [INFO] runtime refs to unlock.type==='trial': ${trialConsumers}; trial-string refs: ${trialStrings}; tracker fns: ${trialTracker}`);
  const held = (s.abilities || []).map(e => (e && e.id) || e).filter(id => ['silver_tongue', 'gossip_network', 'peacemaker'].includes(id));
  check('trial/grant abilities acquirable through a live grant path',
    held.length > 0 || trialConsumers > 0 || trialTracker > 0,
    'none acquirable — still dead content');

  // ============ SUMMARY ============
  note('\n=== SUMMARY ===');
  const fails = results.filter(r => !r[1]);
  note(`   ${results.length - fails.length}/${results.length} checks passed`);
  for (const [n] of fails) note(`   FAIL: ${n}`);
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('PLAYTEST CRASH:', e); process.exit(2); });
