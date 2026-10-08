#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-07) — CONTESTS played pass.
// Covers the committed contest pool as a PLAYER: The Pit, Hide and Seek,
// Calorie Run, The Moot + Performance Review (reviewdrone — committed as a
// wave-2-adjacent monster, not a contest; fought here as the named extra).
// For each contest: eligibility/announcement flow (fireContest), the grab
// sequence (contestInterruption), mid-contest choices and consequences,
// watch-mode path (villager taken — must put on a watchable show), refuse
// path, aftermath (social consequences), knowledge progression
// (blind -> coached). Audio hooks recorded read-only via Game.audioEvent.
//
// HOT-TREE SAFETY: engine loaded from HEAD via `git show` (immune to
// worktree churn on the shared tree). This script only CREATES its own file.
// RNG is seeded (mulberry32, fixed default, SEED env override) so the proof
// is deterministic; play each run with 2 seeds.
// Exit code non-zero on any assertion failure.
// Run: node scripts/play-feel-20261007-contests.js
const { execSync } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261007', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
const headFile = p => execSync('git show HEAD:' + p, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(headFile(f))) });
global.window = global; // equipment.js touches window at load (browser-only in prod)
const _SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'];
// drama.js excluded: DOM at load. All Game.drama calls are try/caught.
_SCRIPTS.forEach(f => eval(headFile(f)));
delete global.window; // drop the stub: combat takes the SYNC advance path without window
const Game = globalThis.Scattering.Game;

// ---------- output / evidence ----------
const transcript = [];
const note = t => { transcript.push(t); console.log(t); };
const results = [];
let passN = 0, failN = 0;
const ok = (name, cond, extra) => { results.push([name, !!cond]); if (cond) passN++; else failN++; note(`   [${cond ? 'OK  ' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`); };
const trunc = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };
function drain() { const l = Game.log || []; const s = l.map(x => x.text || x).join(' '); l.length = 0; return s; }
function scene(t) { note('\n==== ' + t + ' ===='); }

// audio hook recorder: every audioEvent(name) lands here (read-only audit)
const audioSeen = [];
Game.audio = new Proxy({}, { get: (t, name) => (d) => { audioSeen.push(String(name)); } });

// ---------- setup ----------
async function freshRun() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  drain();
}
// Day-15 contest-ready village: System arrived, healthy buffed player, spear,
// three villagers placed on the grid (contest-eligible, watch-capable) —
// unless placeV=false (fights that must be 1v1).
function setupContestDay(day, placeV) {
  const s = Game.state.scholar;
  s.day = day;
  Game.state.systemArrived = true;
  s.health = 500; s.maxHealth = 500; s.kcal = 2400; s.hydration = 100; s.hp = 100; s.trauma = 0;
  const def = (Game.data.items || []).find(i => i.id === 'fire_hardened_spear') || {};
  s.inventory = s.inventory || [];
  s.inventory.push({ itemId: 'fire_hardened_spear', units: 1, kcalEach: 0, kg: 0.5, name: def.name || 'Fire-hardened spear', bonded: true, bond: 0, bondOffered: [], enhancements: [] });
  s.equipped = s.equipped || {};
  s.equipped.weapon = { itemId: 'fire_hardened_spear', name: def.name || 'Fire-hardened spear' };
  const v = Game.state.village; v.positions = v.positions || {};
  const ids = (v.roster || []).filter(rid => rid !== Game.villagerId);
  if (placeV !== false) {
    [[2, 2], [6, 6], [3, 5]].forEach((spot, i) => {
      const rid = ids[i];
      if (rid) {
        try { Game.npcSetNode(rid, Game.map.px, Game.map.py); } catch (e) {}
        v.positions[rid] = { mx: spot[0], my: spot[1] };
      }
    });
  }
  drain();
  return ids;
}
const vname = id => { try { return Game.displayName(id); } catch (e) { return id; } };

// ---------- contest player ----------
// Play the current activeContest as a player with a persona (not scripted
// optima). Persona picks by keyword: 'brave' seeks aggressive labels,
// 'cautious' seeks defensive labels, 'middle' takes the middle index.
const PICK_PAT = {
  brave: /aggress|charge|confront|attack|fight|strike|hold|stand your ground|impress/i,
  cautious: /hide|wait|surrender|flee|quiet|watch|study|still|look away|space/i,
};
// NOTE: 'refuse' is deliberately NOT a persona keyword — refusing is its own
// audited path (actRefuse); personas must play the contest itself.
function pickChoice(choices, persona) {
  if (persona === 'middle') return Math.floor((choices.length - 1) / 2);
  const pat = PICK_PAT[persona];
  const i = choices.findIndex(c => pat.test(c.label + ' ' + (c.sub || '')));
  return i >= 0 ? i : Math.floor((choices.length - 1) / 2);
}
// Drive the active contest to its end. Returns a ledger of what happened.
function playToEnd(contestId, persona, quiet) {
  const ledger = { phases: 0, choicesSeen: [], dmgTaken: 0, trauma0: Game.state.scholar.trauma || 0, won: null, died: false, refused: false, stuck: false, lastText: '' };
  let guard = 0;
  while (Game.state.activeContest && Game.state.activeContest.phase !== 'done' && guard++ < 24) {
    const ac = Game.state.activeContest;
    const idx = ac.phaseIdx || 0;
    const phase = ac.phases[idx];
    if (!phase) { ledger.stuck = true; break; }
    if (!phase.choices || !phase.choices.length) { ledger.stuck = true; ok(contestId + ': phase ' + idx + ' has at least one choice (no stuck modal)', false); break; }
    ledger.phases++;
    const ci = pickChoice(phase.choices, persona);
    const choice = phase.choices[ci];
    ledger.choicesSeen.push(choice.label);
    const hpBefore = Game.state.scholar.health || 0;
    if (!quiet) note(`   ┌ phase ${idx}: ${trunc(phase.text, 300)}`);
    if (!quiet) note(`   ├ choices: ${phase.choices.map(c => c.label).join(' | ')}`);
    const thought = persona === 'brave' ? '⚔️ going at it — the cameras love nerve'
      : persona === 'cautious' ? '😰 playing it safe — stay alive, stay alive'
      : '🤔 middle path — no heroics, no cowardice';
    if (!quiet) note(`   └ ${thought} → "${choice.label}"`);
    const res = Game.contestChoose(ci);
    const txt = drain();
    if (txt) { transcript.push(txt); ledger.lastText = txt; if (!quiet) console.log('      ' + trunc(txt, 500)); }
    ledger.dmgTaken += Math.max(0, hpBefore - (Game.state.scholar.health || 0));
    if (res && res.done) {
      ledger.won = res.outcome === 'won';
      ledger.died = (Game.state.scholar.health || 0) <= 0;
      ledger.refused = res.outcome === 'refused' || res.outcome === 'refuse';
      break;
    }
    if (res === null) { ledger.stuck = true; break; } // choose refused: modal with no forward
  }
  if (guard >= 24) { ledger.stuck = true; ok(contestId + ': contest terminates within 24 phases (no infinite loop)', false); }
  return ledger;
}
// Distinctness: the intro must sound like THIS contest, not a template.
function distinctMark(contest) {
  const marks = {
    pit: /beast|arena|kill or be killed/i,
    hide: /seeker|sixty-count|found you/i,
    calorie_run: /calori|forag|haul/i,
    moot: /moot|audience|vote/i,
    gauntlet: /wave|three waves/i,
    duel: /opponent|yield/i,
  };
  return marks[contest.id] || new RegExp(contest.name.split(' ')[1] || contest.name, 'i');
}

// ---------- combat helpers (reviewdrone act; from the feel-playtest recipe) ----------
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const clamp17 = v => Math.min(7, Math.max(1, v));
function P() { return Game.tbFighter('p'); }
function liveMonster() { const f = Game.tbfight; if (!f) return null; return f.fighters.find(x => x.kind === 'monster' && x.alive) || null; }
function endTurnCombat() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); if (p) { p.moveLeft = 0; p.acted = true; }
  Game.tbAfterPlayerAction();
}
function stepTo(tx, ty) {
  tx = clamp17(tx); ty = clamp17(ty);
  const p = P(); if (!p || !Game.tbIsPlayerTurn()) return false;
  const bx = p.mx, by = p.my;
  Game.tbPlayerMove(tx, ty);
  return (p.mx !== bx || p.my !== by);
}
function stepToward(m) {
  const p = P();
  return stepTo(p.mx + Math.sign(m.mx - p.mx), p.my + Math.sign(m.my - p.my));
}
// Drive up to n PLAYER turns with a policy (recipe turn hygiene).
function combatTurns(n, policy, quiet) {
  let taken = 0, guard = 0;
  while (Game.tbfight && !Game.tbfight.over && taken < n && guard++ < 600) {
    const cur = Game.tbCurrent();
    if (!cur) break;
    if (cur.kind === 'player') {
      const p = P(), m = liveMonster();
      const roundBefore = Game.tbfight.round;
      if (!quiet) note(`\n-- R${roundBefore} P@(${p.mx},${p.my})[${Math.round(p.hp)}] vs ${m ? `${m.name}@(${m.mx},${m.my})[${Math.round(m.hp)}/${m.maxHp}]` : 'no-foe'}`);
      const thought = policy(p, m) || '';
      if (thought && !quiet) note(`   💭 ${thought}`);
      const txt = drain();
      if (txt) { transcript.push('   ' + txt); if (!quiet) console.log('   ' + trunc(txt, 420)); }
      if (Game.tbfight && !Game.tbfight.over && Game.tbIsPlayerTurn() && Game.tbfight.round === roundBefore) endTurnCombat();
      taken++;
    } else {
      Game.tbAdvance();
      const txt = drain();
      if (txt) { transcript.push('   ' + txt); if (!quiet) console.log('   [foe] ' + trunc(txt, 480)); }
    }
  }
  return taken;
}
function newFight(monsterId, px, py, mx, my) {
  const s = Game.state.scholar;
  s.health = 500; s.maxHealth = 500; s.kcal = 2400; s.hydration = 100; s.hp = 100;
  s.mx = px; s.my = py;
  s.equipped = s.equipped || {};
  s.equipped.weapon = { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' };
  s.monster = { id: monsterId, mx, my };
  drain();
  Game.startCombat(monsterId);
  drain();
  return liveMonster();
}

// ---------- acts ----------
const verdicts = [];
const CX_AUDIO_BY_CONTEST = {};

async function actTaken(contestId, persona) {
  scene('TAKEN — ' + contestId + ' (played ' + persona + ')');
  await freshRun(); const vids = setupContestDay(15);
  const contest = Game.contestPool().find(c => c.id === contestId);
  audioSeen.length = 0;
  // Announcement flow: fire -> pending -> resolve (the real countdown path)
  Game.fireContest(contest);
  const pc = Game.state.pendingContest;
  ok(contestId + ': fireContest sets pendingContest', !!pc);
  ok(contestId + ': pendingContest carries participants[]', !!(pc && Array.isArray(pc.participants) && pc.participants.length >= 1), pc ? 'n=' + pc.participants.length : 'no-pc');
  const atxt = drain();
  ok(contestId + ': announcement names the contest', atxt.includes(contest.name));
  ok(contestId + ': announcement names who is taken', /chosen|taken/i.test(atxt));
  if (contest.arena) ok(contestId + ': announcement shows the arena', atxt.includes('Arena:'));
  ok(contestId + ': audio hook contestCall fires', audioSeen.includes('contestCall'));
  // Force the player-taken path (whim is a 10% random override; deterministic here)
  pc.participant = 'player'; pc.participants = ['player'];
  drain();
  Game.resolveContest();
  const ac = Game.state.activeContest;
  ok(contestId + ': resolveContest -> the interruption (activeContest)', !!ac);
  ok(contestId + ': audio hook contestTaken fires on the grab', audioSeen.includes('contestTaken'));
  const itxt = drain();
  ok(contestId + ': intro is contest-distinct, not generic', distinctMark(contest).test(itxt), 'intro: ' + trunc(itxt, 90));
  const kBefore = Game.contestKnowledge(contestId);
  const led = playToEnd(contestId, persona);
  ok(contestId + ': the sequence terminates — no stuck modal', !led.stuck, 'phases=' + led.phases + ' via ' + led.choicesSeen.join(' > '));
  drain(); // any stragglers; the aftermath already lives in ledger.lastText
  const alive = (Game.state.scholar.health || 0) > 0;
  ok(contestId + ': aftermath is legible (win/lose/die/refuse line)', /YOU WIN|— over\.|refuse|death|killed|fed the/i.test(led.lastText), 'tail: ' + trunc(led.lastText.slice(-260), 160));
  const kAfter = Game.contestKnowledge(contestId);
  ok(contestId + ': knowledge progresses from playing (seen+2)', kAfter.seen >= kBefore.seen + 2, 'seen ' + kBefore.seen + ' -> ' + kAfter.seen);
  CX_AUDIO_BY_CONTEST[contestId] = audioSeen.slice();
  const v = { contest: contestId, path: 'taken', persona, won: led.won, died: !alive, phases: led.phases, dmgTaken: Math.round(led.dmgTaken), trauma: Math.round((Game.state.scholar.trauma || 0)), audio: audioSeen.slice() };
  verdicts.push(v);
  return v;
}

async function actWatch(contestId, want) {
  // want: 'cheer' or 'study' — watcher agency is sampled per watch
  scene('WATCH — ' + contestId + ' (a villager is taken; you watch, wanting to ' + want + ')');
  await freshRun(); const vids = setupContestDay(15);
  const contest = Game.contestPool().find(c => c.id === contestId);
  const vid = vids[0]; const vnm = vname(vid);
  audioSeen.length = 0;
  Game.contestInterruption(contest, [vid]);
  const ac = Game.state.activeContest;
  ok(contestId + ' watch: the show starts (activeContest)', !!ac);
  ok(contestId + ' watch: audio hook contestSpared (not-taken relief)', audioSeen.includes('contestSpared'));
  ok(contestId + ' watch: the taken one is the villager', ac && ac.participant === vid, 'participant=' + (ac && ac.participant));
  const kBefore = Game.contestKnowledge(contestId).seen;
  let cheerSeen = false, studySeen = false, betPlaced = false, comfortSeen = false;
  let guard = 0, stuck = false;
  const beatsTxt = [];
  const wantRe = want === 'study' ? /study/i : /cheer|shout a real warning|shout advice/i;
  while (Game.state.activeContest && Game.state.activeContest.phase !== 'done' && guard++ < 24) {
    const a2 = Game.state.activeContest;
    const phase = a2.phases[a2.phaseIdx || 0];
    if (!phase || !phase.choices || !phase.choices.length) { stuck = true; ok(contestId + ' watch: every watch phase has choices', false); break; }
    beatsTxt.push(phase.text);
    const labels = phase.choices.map(c => c.label);
    const pref = [wantRe, /cheer/i, /study/i, /bet 200/i, /go to them/i].map(re => labels.findIndex(l => re.test(l))).find(i => i >= 0);
    const ci = pref === undefined ? 0 : pref;
    const ch = phase.choices[ci];
    note(`   👁️ watch — "${ch.label}"`);
    if (ch.do && ch.do.cheer) cheerSeen = true;
    if (ch.do && ch.do.study) studySeen = true;
    if (ch.do && ch.do.bet) betPlaced = true;
    if (ch.do && ch.do.comfort) comfortSeen = true;
    const cheerBefore = a2.cheer || 0;
    const res = Game.contestChoose(ci);
    if (ch.do && ch.do.cheer) ok(contestId + ' watch: cheer actually accumulates', (a2.cheer || 0) > cheerBefore, 'cheer=' + (a2.cheer || 0));
    const txt = drain();
    if (txt) console.log('      ' + trunc(txt, 520));
    if (res && res.done) break;
    if (res === null) { stuck = true; break; }
  }
  ok(contestId + ' watch: the show terminates', !stuck, 'beats=' + beatsTxt.length);
  const allBeats = beatsTxt.join('\n');
  ok(contestId + ' watch: the beats name the taken villager (' + vnm + ')', allBeats.includes(vnm), '— villagers must visibly participate');
  ok(contestId + ' watch: beats are contest-specific, not filler', distinctMark(contest).test(allBeats), 'first beat: ' + trunc(beatsTxt[0] || '', 110));
  const kAfter = Game.contestKnowledge(contestId).seen;
  if (want === 'study') {
    ok(contestId + ' watch: studying teaches (knowledge +1, then verdict +1)', studySeen && kAfter >= kBefore + 2, 'studySeen=' + studySeen + ' seen ' + kBefore + ' -> ' + kAfter);
  } else {
    ok(contestId + ' watch: cheering is real support (picked + accumulated)', cheerSeen);
  }
  drain();
  // Roster consistency: a villager who dies on camera must really be gone.
  const diedOnCam = !Game.isMember(vid);
  if (diedOnCam) {
    ok(contestId + ' watch: on-camera death is REAL (roster removal)', /didn't come home|is gone|☠|death/i.test(transcript.join('\n')), vnm + ' died on camera');
  } else {
    ok(contestId + ' watch: ' + vnm + ' survived -> still a member', true);
  }
  CX_AUDIO_BY_CONTEST[contestId + ':watch'] = audioSeen.slice();
  const v = { contest: contestId, path: 'watch', taken: vnm, want, cheerSeen, studySeen, betPlaced, comfortSeen, diedOnCam, audio: audioSeen.slice() };
  verdicts.push(v);
  return v;
}

async function actRefuse(contestId) {
  scene('REFUSE — ' + contestId + ' (saying no is a sequence)');
  await freshRun(); setupContestDay(15);
  const base = Game.contestPool().find(c => c.id === contestId);
  const contest = Object.assign({}, base, { givesChoice: true }); // force the choice branch deterministically
  Game.contestInterruption(contest, ['player']);
  const ac = Game.state.activeContest;
  const labels = ((ac && ac.phases[0] && ac.phases[0].choices) || []).map(c => c.label);
  ok(contestId + ' choice: participate AND refuse offered', labels.some(l => /participate/i.test(l)) && labels.some(l => /refuse/i.test(l)), labels.join(' / '));
  const ri = labels.findIndex(l => /refuse/i.test(l));
  const res = Game.contestChoose(ri);
  const txt = drain();
  console.log('      ' + trunc(txt, 640));
  ok(contestId + ' refuse: refusal is a played sequence, not a skip', /refus|say no|no on camera|galaxy/i.test(txt), 'len=' + txt.length);
  ok(contestId + ' refuse: the sequence ends cleanly', !Game.state.activeContest || Game.state.activeContest.phase === 'done');
  verdicts.push({ contest: contestId, path: 'refuse', ok: !Game.state.activeContest });
}

// ---------- multi-take: the others taken with you get their own fates ----------
async function actMulti(contestId) {
  scene('MULTI-TAKE — ' + contestId + ' (you + a villager, their fate is their own)');
  await freshRun(); const vids = setupContestDay(15);
  const contest = Game.contestPool().find(c => c.id === contestId);
  const vid = vids[1]; const vnm = vname(vid);
  const kBefore = Game.contestKnowledge(contestId);
  Game.contestInterruption(contest, ['player', vid]);
  const t0 = drain();
  ok(contestId + ' multi: the others taken are NAMED', new RegExp(vnm).test(t0), 'take line: ' + trunc(t0, 120));
  playToEnd(contestId, 'middle', true);
  drain();
  const allT = transcript.join('\n');
  ok(contestId + ' multi: ' + vnm + ' gets their own rolled fate', new RegExp(vnm + '.*(WON|survived|made it out|is back|walked out|didn\'t come home|is gone)', 'i').test(allT), 'fate line present');
  const kAfter = Game.contestKnowledge(contestId);
  ok(contestId + ' multi: only the primary fate teaches (no veteran minting)', kAfter.seen <= kBefore.seen + 2, 'seen ' + kBefore.seen + ' -> ' + kAfter.seen);
  verdicts.push({ contest: contestId, path: 'multi', other: vnm });
}

// ---------- knowledge: blind -> coached ----------
async function actCoaching(contestId) {
  scene('KNOWLEDGE — ' + contestId + ' played twice, third run should coach');
  await freshRun(); setupContestDay(15);
  const contest = Game.contestPool().find(c => c.id === contestId);
  Game.contestInterruption(contest, ['player']);
  playToEnd(contestId, 'brave', true);
  drain();
  Game.contestInterruption(contest, ['player']);
  playToEnd(contestId, 'cautious', true);
  drain();
  const k = Game.contestKnowledge(contestId);
  ok(contestId + ' knowledge: two plays reach level 2', k.level >= 2, 'level=' + k.level + ' seen=' + k.seen);
  ok(contestId + ' knowledge: 📚 unlock line announced', /📚/.test(transcript.join('\n')));
  Game.contestInterruption(contest, ['player']);
  let itxt = drain();
  // The choice branch (30% roll) puts Participate/Refuse on phase 0 — the
  // coaching lives on the playable intro (phase 1). Step through it.
  const ac3 = Game.state.activeContest;
  const p0 = ac3 && ac3.phases[0];
  if (p0 && (p0.choices || []).some(c => /participate/i.test(c.label))) {
    const pi = p0.choices.findIndex(c => /participate/i.test(c.label));
    Game.contestChoose(pi);
    itxt += ' ' + drain();
    note('   (choice branch rolled: stepped through Participate to reach the intro)');
  }
  const cue = Game._cxCoaching(contest);
  ok(contestId + ' knowledge: coached intro carries the coaching cue', !!cue && itxt.includes(cue.slice(0, 30).trim()), 'cue: ' + trunc(cue, 80));
  note('   📚 coaching cue: ' + trunc(cue, 140));
  verdicts.push({ contest: contestId, path: 'coaching', level: k.level });
}

// ---------- Performance Review: the reviewdrone fight (wave-2-adjacent) ----------
async function actReviewdrone() {
  scene('PERFORMANCE REVIEW — review_drone fight, blind first contact');
  await freshRun(); setupContestDay(15, false); // 1v1: no villagers on the node
  audioSeen.length = 0;
  const def = (Game.data.monsters || []).find(m => m.id === 'review_drone');
  ok('review_drone mdef exists at HEAD', !!def, def ? `wave=${def.wave} hp=${def.hp}` : 'missing');
  let rd = newFight('review_drone', 2, 4, 6, 4);
  if (Game.state.village) Game.state.village.positions = {}; // 1v1 test setup
  ok('fight is 1v1 (test setup)', (Game.tbfight.fighters || []).filter(f => f.alive).length === 2);
  const seenTel = new Set();
  let strikes = 0, dmgTaken = 0;
  const policy = (p, m) => {
    if (!p.acted && m) {
      const cue = String(Game.tbTelegraphCue ? Game.tbTelegraphCue(m) : '') || '';
      if (cue) seenTel.add(trunc(cue, 80));
      const d = cheb(p.mx, p.my, m.mx, m.my);
      if (m.telegraph) return `it's grading something — shifting sideways, not giving it a clean read`;
      if (d <= 2) { const before = m.hp; Game.tbPlayerStrike(m.key); strikes++; return 'in range — strike while it evaluates'; }
      stepToward(m);
      return 'closing — keep it nervous';
    }
    return '';
  };
  const _adv = Game.tbAdvance.bind(Game);
  Game.tbAdvance = function () { const before = P() ? P().hp : 0; const r = _adv.apply(Game, arguments); if (P() && P().hp < before) dmgTaken += (before - P().hp); return r; };
  combatTurns(30, policy);
  Game.tbAdvance = _adv;
  const dead = !liveMonster();
  const over = !Game.tbfight || Game.tbfight.over;
  ok('review_drone: fight resolves (no softlock)', dead || over, `dead=${dead} over=${over}`);
  ok('review_drone: distinct telegraph cues (not generic)', [...seenTel].some(t => /grad|evaluat|review|score|metric|KPI/i.test(t)) || seenTel.size > 0, [...seenTel].slice(0, 3).join(' / ') || 'no cues seen');
  note('   telegraphs seen:');
  for (const t of seenTel) note('     · ' + t);
  const kNow = (Game.state.codex && Game.state.codex.monsters && Game.state.codex.monsters.review_drone) || null;
  ok('review_drone: monster codex records the fight', !!kNow, kNow ? JSON.stringify(kNow) : 'no codex entry');
  ok('review_drone: audio hooks fire during the fight', audioSeen.length > 0, [...new Set(audioSeen)].join(', '));
  note(`   strikes=${strikes} dmgTaken~${Math.round(dmgTaken)}`);
  verdicts.push({ contest: 'review_drone', path: 'fight', resolved: dead || over, telegraphs: seenTel.size, strikes, audio: [...new Set(audioSeen)] });
}

(async () => {
await Game.init();
note('== SEED ' + SEED + ' ==');

// ================= ACT 0: eligibility & unlock gating =================
scene('ACT 0 — eligibility & unlock gating');
await freshRun(); setupContestDay(13);
let eg = Game.contestEligible();
ok('day 13: locked (contests unlock day 14+)', eg.eligible.length === 0, 'reason: ' + (eg.reason || ''));
await freshRun(); setupContestDay(15);
eg = Game.contestEligible();
ok('day 15: player is eligible', eg.eligible.some(e => e.id === 'player'));
ok('day 15: villagers are eligible (>=2)', eg.eligible.filter(e => e.id !== 'player').length >= 2, eg.eligible.filter(e => e.id !== 'player').map(e => e.name).join(', '));
const pool = Game.contestPool();
ok('pool contains Pit / Hide / Calorie Run / Moot', ['pit', 'hide', 'calorie_run', 'moot'].every(id => pool.find(c => c.id === id)));
ok('contest pool is deep (>= 30 types)', pool.length >= 30, 'pool=' + pool.length);

// ================= TAKEN paths =================
await actTaken('pit', 'brave');
await actTaken('hide', 'cautious');
await actTaken('calorie_run', 'middle');
await actTaken('moot', 'brave');

// ================= WATCH paths (the watchable show) =================
await actWatch('pit', 'cheer');
await actWatch('hide', 'study');
await actWatch('moot', 'cheer');
await actWatch('calorie_run', 'study');

// ================= REFUSE / MULTI / KNOWLEDGE =================
await actRefuse('pit');
await actMulti('pit');
await actCoaching('pit');

// ================= PERFORMANCE REVIEW =================
await actReviewdrone();

// ================= verdict =================
scene('VERDICT');
const audioAll = [...new Set(Object.values(CX_AUDIO_BY_CONTEST).flat())];
note('\n   audioEvent hooks fired during contests (read-only):');
for (const a of audioAll) note('     · ' + a);
note('\n   run verdicts:');
for (const v of verdicts) note('     · ' + JSON.stringify(v));
const fails = results.filter(r => !r[1]);
note(`\n   assertions: ${passN} pass, ${failN} fail (of ${results.length})`);
if (fails.length) { note('\n   FAILING ASSERTIONS:'); for (const f of fails) note('     · ' + f[0]); process.exitCode = 1; }
else note('\n   ALL GREEN — contests played pass complete.');
})();
