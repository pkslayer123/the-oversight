#!/usr/bin/env node
// CONTEST PLAYTEST (Steve 2026-10-08) — play ALL 44 contests as a player.
//
// Covers, per contest:
//   TAKEN  — fire -> pending -> resolve -> play the grab sequence to its end
//   WATCH  — villager taken -> the watchable-show path with watcher agency
//   STUCK  — every phase must have >=1 choice (a modal with no way forward
//            is a stuck screen, NOT done); the sequence must terminate.
// Plus: grab-matrix (interruption from sleep/endDay, combat, conversation,
//   mid-expedition states), refuse path, multi-take, knowledge coaching,
//   hardened variant, static choice-branching analysis (theater vs real).
//
// HARNESS: full src/js/*.js list in index.html order, minus DOM-only
// app.js/sprites.js/tile-scenes.js/move-anim.js and minus drama.js.
// global.window stub for eval, deleted before play (sync combat path).
// RNG seeded (mulberry32, fixed default, SEED env override).
// READ-ONLY on src: this script reports bugs, it does not fix them.
//
// Exit code non-zero on any assertion failure.
// Run: node scripts/test-contest-play-20261008.js
//      SEED=7 node scripts/test-contest-play-20261008.js
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(read(f))) });
global.window = global; // equipment.js touches window at load
const _SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
 'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'];
// drama.js excluded: DOM at load. All Game.drama calls in contests.js are try/caught.
_SCRIPTS.forEach(f => eval(read(f)));
delete global.window; // sync combat path for tbAfterPlayerAction
const Game = globalThis.Scattering.Game;

// ---------- harness ----------
const transcript = [];
const note = t => { transcript.push(t); console.log(t); };
const results = [];
let passN = 0, failN = 0;
const ok = (name, cond, extra) => { results.push([name, !!cond]); if (cond) passN++; else failN++; if (!cond) note(`   [FAIL] ${name}${extra ? ' — ' + extra : ''}`); };
const trunc = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };
function drain() { const l = Game.log || []; const s = l.map(x => x.text || x).join(' '); l.length = 0; return s; }
function scene(t) { note('\n==== ' + t + ' ===='); }
const audioSeen = [];
Game.audio = new Proxy({}, { get: (t, name) => (d) => { audioSeen.push(String(name)); } });
Game.audioEvent = function (n) { audioSeen.push(String(n)); };

async function freshRun() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  drain();
}
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
      if (rid) { try { Game.npcSetNode(rid, Game.map.px, Game.map.py); } catch (e) {} v.positions[rid] = { mx: spot[0], my: spot[1] }; }
    });
  }
  drain();
  return ids;
}
const vname = id => { try { return Game.displayName(id); } catch (e) { return id; } };

// personas: 'brave' seeks aggressive labels, 'cautious' seeks defensive,
// 'middle' takes the middle index. 'refuse' is deliberately NOT a keyword.
const PICK_PAT = {
  brave: /aggress|charge|confront|attack|fight|strike|hold|stand your ground|impress|brave|bold|all in|push/i,
  cautious: /hide|wait|surrender|flee|quiet|watch|study|still|look away|space|careful|safe|hide/i,
};
function pickChoice(choices, persona) {
  if (persona === 'middle') return Math.floor((choices.length - 1) / 2);
  const pat = PICK_PAT[persona];
  const i = choices.findIndex(c => pat.test(c.label + ' ' + (c.sub || '')));
  return i >= 0 ? i : Math.floor((choices.length - 1) / 2);
}
// Drive the active contest to its end. Returns a ledger.
function playToEnd(contestId, persona, quiet) {
  const ledger = { phases: 0, choicesSeen: [], dmgTaken: 0, won: null, died: false, refused: false, stuck: false, lastText: '', texts: [], allText: '' };
  let guard = 0;
  while (Game.state.activeContest && Game.state.activeContest.phase !== 'done' && guard++ < 30) {
    const ac = Game.state.activeContest;
    const idx = ac.phaseIdx || 0;
    const phase = ac.phases[idx];
    if (!phase) { ledger.stuck = true; ok(contestId + ': phase ' + idx + ' exists (no stuck modal)', false); break; }
    if (!phase.choices || !phase.choices.length) { ledger.stuck = true; ok(contestId + ': phase ' + idx + ' has choices (no stuck modal)', false, 'choices=' + JSON.stringify(phase.choices)); break; }
    ledger.phases++;
    const ci = pickChoice(phase.choices, persona);
    const choice = phase.choices[ci];
    ledger.choicesSeen.push(choice.label);
    if (ledger.texts.length < 6) ledger.texts.push({ phase: idx, text: trunc(phase.text, 340), choices: phase.choices.map(c => c.label).join(' | '), picked: choice.label });
    const hpBefore = Game.state.scholar.health || 0;
    const res = Game.contestChoose(ci);
    const txt = drain();
    if (txt) { ledger.lastText = txt; ledger.allText += ' ' + txt; }
    ledger.dmgTaken += Math.max(0, hpBefore - (Game.state.scholar.health || 0));
    if (res && res.done) {
      ledger.won = res.outcome === 'won';
      ledger.died = res.outcome === 'died';
      ledger.refused = /refus/i.test(res.outcome || '');
      break;
    }
    if (res === null) { ledger.stuck = true; ok(contestId + ': contestChoose accepted the pick (no stuck modal)', false); break; }
  }
  if (guard >= 30) { ledger.stuck = true; ok(contestId + ': contest terminates within 30 phases', false); }
  return ledger;
}
// Static branching analysis: do the choices actually go different places?
function branchReport(contestId) {
  const contest = Game.contestPool().find(c => c.id === contestId);
  let phases;
  try { phases = Game.contestPlayable(contest); } catch (e) { return { err: String(e && e.message || e) }; }
  if (!phases) return { err: 'no phases' };
  let totalChoices = 0, distinctNexts = new Set(), effectKeys = new Set(), phasesNoChoices = 0;
  for (const p of phases) {
    const ch = p.choices || [];
    if (!ch.length) phasesNoChoices++;
    for (const c of ch) { totalChoices++; distinctNexts.add(String(c.next)); Object.keys(c.do || {}).forEach(k => effectKeys.add(k)); }
  }
  return { phases: phases.length, totalChoices, distinctNexts: distinctNexts.size, effects: [...effectKeys].sort().join(','), phasesNoChoices };
}

const verdicts = [];

// ---------- per-contest taken path ----------
async function actTaken(contest, persona) {
  const contestId = contest.id;
  scene('TAKEN — ' + contestId + ' (' + contest.name + ', ' + contest.cat + '/' + contest.risk + ', played ' + persona + ')');
  await freshRun(); const vids = setupContestDay(15);
  audioSeen.length = 0;
  Game.fireContest(contest);
  const pc = Game.state.pendingContest;
  ok(contestId + ': fireContest sets pendingContest', !!pc);
  ok(contestId + ': pendingContest carries participants[]', !!(pc && Array.isArray(pc.participants) && pc.participants.length >= 1));
  const atxt = drain();
  ok(contestId + ': announcement names the contest', atxt.includes(contest.name));
  ok(contestId + ': announcement names who is taken', /chosen|taken/i.test(atxt));
  ok(contestId + ': audio hook contestCall fires', audioSeen.includes('contestCall'));
  pc.participant = 'player'; pc.participants = ['player'];
  drain();
  Game.resolveContest();
  const ac = Game.state.activeContest;
  ok(contestId + ': resolveContest -> the interruption', !!ac);
  ok(contestId + ': audio hook contestTaken fires on the grab', audioSeen.includes('contestTaken'));
  const itxt = drain();
  const distinct = new RegExp(contest.name.split(/\s+/).filter(w => w.length > 3).slice(0, 2).join('|') || contest.name, 'i');
  ok(contestId + ': intro is contest-distinct, not generic', distinct.test(itxt), 'intro: ' + trunc(itxt, 100));
  const kBefore = Game.contestKnowledge(contestId);
  const led = playToEnd(contestId, persona, true);
  ok(contestId + ': the sequence terminates — no stuck modal', !led.stuck, 'phases=' + led.phases + ' via ' + led.choicesSeen.join(' > '));
  ok(contestId + ': aftermath legible (win/lose/die line)', /YOU WIN|— over\.|refus|death|killed|fed the|did not come home|Death Reel|THE AUDIENCE|survived/i.test(led.lastText), 'tail: ' + trunc(led.lastText.slice(-240), 150));
  ok(contestId + ': activeContest cleared after the sequence', !Game.state.activeContest);
  const kAfter = Game.contestKnowledge(contestId);
  ok(contestId + ': knowledge progresses from playing', kAfter.seen >= kBefore.seen + 1, 'seen ' + kBefore.seen + ' -> ' + kAfter.seen);
  ok(contestId + ': at least one beat fired audio', audioSeen.length >= 2, [...new Set(audioSeen)].join(','));
  for (const t of led.texts) { note(`   [p${t.phase}] ${t.text}`); note(`      ? ${t.choices}  → ${t.picked}`); }
  note(`   ⇒ outcome=${led.died ? 'DIED' : led.won ? 'WON' : led.refused ? 'REFUSED' : 'LOST'} phases=${led.phases} dmg~${Math.round(led.dmgTaken)} trauma=${Math.round(Game.state.scholar.trauma || 0)}`);
  note(`   ⇒ audio: ${[...new Set(audioSeen)].join(', ')}`);
  verdicts.push({ contest: contestId, path: 'taken', persona, outcome: led.died ? 'died' : led.won ? 'won' : led.refused ? 'refused' : 'lost', phases: led.phases, dmgTaken: Math.round(led.dmgTaken), audio: [...new Set(audioSeen)] });
}

// ---------- per-contest watch path ----------
async function actWatch(contest) {
  const contestId = contest.id;
  scene('WATCH — ' + contestId + ' (a villager is taken; you watch)');
  await freshRun(); const vids = setupContestDay(15);
  const vid = vids[0]; const vnm = vname(vid);
  audioSeen.length = 0;
  Game.contestInterruption(contest, [vid]);
  const ac = Game.state.activeContest;
  ok(contestId + ' watch: the show starts', !!ac);
  ok(contestId + ' watch: audio hook contestSpared (not-taken relief)', audioSeen.includes('contestSpared'));
  ok(contestId + ' watch: the taken one is the villager', ac && ac.participant === vid, 'participant=' + (ac && ac.participant));
  const kBefore = Game.contestKnowledge(contestId).seen;
  let guard = 0, stuck = false;
  const beatsTxt = [];
  let cheerSeen = false, studySeen = false, betSeen = false, comfortSeen = false;
  while (Game.state.activeContest && Game.state.activeContest.phase !== 'done' && guard++ < 30) {
    const a2 = Game.state.activeContest;
    const phase = a2.phases[a2.phaseIdx || 0];
    if (!phase || !phase.choices || !phase.choices.length) { stuck = true; ok(contestId + ' watch: every watch phase has choices', false); break; }
    beatsTxt.push(phase.text);
    const labels = phase.choices.map(c => c.label);
    // watcher persona: cheer first, study second, bet when affordable, comfort at the end
    const pref = [/cheer|shout a real warning|shout advice/i, /study/i, /bet 200/i, /go to them/i, /give them space/i]
      .map(re => labels.findIndex(l => re.test(l))).find(i => i >= 0);
    const ci = pref === undefined ? 0 : pref;
    const ch = phase.choices[ci];
    if (ch.do && ch.do.cheer) cheerSeen = true;
    if (ch.do && ch.do.study) studySeen = true;
    if (ch.do && ch.do.bet) betSeen = true;
    if (ch.do && ch.do.comfort) comfortSeen = true;
    const res = Game.contestChoose(ci);
    const txt = drain();
    if (beatsTxt.length <= 4) { note(`   👁️ "${ch.label}" → ${trunc(txt, 240)}`); }
    if (res && res.done) break;
    if (res === null) { stuck = true; ok(contestId + ' watch: watcher choice accepted', false); break; }
  }
  ok(contestId + ' watch: the show terminates', !stuck, 'beats=' + beatsTxt.length);
  const allBeats = beatsTxt.join('\n');
  ok(contestId + ' watch: the beats name the taken villager (' + vnm + ')', allBeats.includes(vnm), '— villagers must visibly participate');
  const distinct = new RegExp(contest.name.split(/\s+/).filter(w => w.length > 3).slice(0, 2).join('|') || contest.name, 'i');
  ok(contestId + ' watch: beats are contest-specific, not filler', distinct.test(allBeats), 'first beat: ' + trunc(beatsTxt[0] || '', 110));
  ok(contestId + ' watch: activeContest cleared', !Game.state.activeContest);
  const diedOnCam = !Game.isMember(vid);
  if (diedOnCam) {
    ok(contestId + ' watch: on-camera death is REAL (roster removal)', /gone|☠|death|didn\'t come home/i.test(transcript.join('\n')), vnm + ' died on camera');
  }
  note(`   ⇒ ${vnm} ${diedOnCam ? 'DIED ON CAMERA' : 'survived'} · cheer=${cheerSeen} study=${studySeen} bet=${betSeen} comfort=${comfortSeen}`);
  verdicts.push({ contest: contestId, path: 'watch', taken: vnm, diedOnCam, cheerSeen, studySeen, betSeen, comfortSeen });
}

// ---------- grab matrix: the interruption fires from real player states ----------
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
function P() { return Game.tbFighter('p'); }
function liveMonster() { const f = Game.tbfight; if (!f) return null; return f.fighters.find(x => x.kind === 'monster' && x.alive) || null; }

async function grabSleep() {
  scene('GRAB MATRIX — sleeping: pending contest fires via endDay (the real countdown path)');
  await freshRun(); setupContestDay(15);
  const contest = Game.contestPool().find(c => c.id === 'hide');
  Game.fireContest(contest);
  const pc = Game.state.pendingContest;
  pc.participant = 'player'; pc.participants = ['player'];
  pc.firesDay = Game.state.scholar.day; // countdown is up — tonight it happens
  drain();
  let threw = null;
  try { Game.endDay(); } catch (e) { threw = e; }
  ok('sleep grab: endDay runs without throwing', !threw, threw ? String(threw && threw.message || threw) : '');
  const ac = Game.state.activeContest;
  ok('sleep grab: the interruption fired on sleep', !!ac, 'no activeContest — the countdown resolved silently');
  if (ac) {
    const led = playToEnd('hide', 'cautious', true);
    ok('sleep grab: sequence plays to a clean end after sleep', !led.stuck && !Game.state.activeContest);
    ok('sleep grab: the day advanced (the contest happened overnight)', (Game.state.scholar.day || 0) >= 16, 'day=' + Game.state.scholar.day);
  }
}
async function grabCombat() {
  scene('GRAB MATRIX — mid-combat: interruption fires with a live fight on the grid');
  await freshRun(); setupContestDay(15, false);
  const s = Game.state.scholar;
  s.mx = 3; s.my = 4; s.monster = { id: 'hushwolf', mx: 5, my: 4 };
  drain();
  Game.startCombat('hushwolf'); drain();
  ok('combat grab: a fight is live', !!liveMonster());
  const contest = Game.contestPool().find(c => c.id === 'duel');
  let threw = null;
  try { Game.contestInterruption(contest, ['player']); } catch (e) { threw = e; }
  ok('combat grab: interruption fires mid-fight without throwing', !threw, threw ? String(threw && threw.message || threw) : '');
  ok('combat grab: the grab announces itself', /grabbed|chosen|offers you a choice|participate or refuse/i.test(drain()));
  const led = playToEnd('duel', 'middle', true);
  ok('combat grab: contest plays to a clean end', !led.stuck && !Game.state.activeContest);
  const stillLive = !!liveMonster();
  ok('combat grab: the fight is still there afterwards', stillLive, 'tbfight lost — the contest ate the combat');
  if (stillLive) {
    // the player can still act in the resumed fight
    const canAct = Game.tbIsPlayerTurn();
    ok('combat grab: the player can still act in the resumed fight', canAct);
  }
}
async function grabConversation() {
  scene('GRAB MATRIX — mid-conversation: interruption fires while talking to a villager');
  await freshRun(); const vids = setupContestDay(15);
  const vid = vids[0];
  let threw = null, convoWasActive = false;
  try {
    Game.startConvo(vid);
    drain();
    const ui = Game.convoUI ? Game.convoUI(vid) : null;
    convoWasActive = !!(ui && ui.active);
  } catch (e) { threw = e; }
  ok('convo grab: a conversation was live', convoWasActive, threw ? String(threw && threw.message || threw) : 'startConvo produced no active convo');
  const contest = Game.contestPool().find(c => c.id === 'moot');
  try { Game.contestInterruption(contest, ['player']); } catch (e) { threw = e; }
  ok('convo grab: interruption fires mid-conversation without throwing', !threw, threw ? String(threw && threw.message || threw) : '');
  const led = playToEnd('moot', 'middle', true);
  ok('convo grab: contest plays to a clean end', !led.stuck && !Game.state.activeContest);
  let uiAfter = null;
  try { uiAfter = Game.convoUI ? Game.convoUI(vid) : null; } catch (e) {}
  note('   convo UI after the contest: ' + (uiAfter ? ('active=' + !!uiAfter.active + ' transcript=' + ((uiAfter.transcript || []).length)) : 'no convoUI'));
}
async function grabExpedition() {
  scene('GRAB MATRIX — mid-expedition: interruption fires far from haven, mid-day');
  await freshRun(); setupContestDay(15);
  const s = Game.state.scholar;
  s.mx = 7; s.my = 7; // out on the map, away from haven
  try { if (Game.map) { Game.map.px = 12; Game.map.py = 12; } } catch (e) {}
  const contest = Game.contestPool().find(c => c.id === 'calorie_run');
  let threw = null;
  try { Game.contestInterruption(contest, ['player']); } catch (e) { threw = e; }
  ok('expedition grab: interruption fires mid-expedition without throwing', !threw, threw ? String(threw && threw.message || threw) : '');
  const led = playToEnd('calorie_run', 'middle', true);
  ok('expedition grab: contest plays to a clean end', !led.stuck && !Game.state.activeContest);
  ok('expedition grab: the player is still out where they were (not teleported)', (s.mx === 7 && s.my === 7), `mx=${s.mx} my=${s.my}`);
}

// ---------- special paths ----------
async function actRefuse(contestId) {
  scene('REFUSE — ' + contestId + ' (saying no is a sequence, not a skip)');
  await freshRun(); setupContestDay(15);
  const base = Game.contestPool().find(c => c.id === contestId);
  const contest = Object.assign({}, base, { givesChoice: true });
  Game.contestInterruption(contest, ['player']);
  const ac = Game.state.activeContest;
  const labels = ((ac && ac.phases[0] && ac.phases[0].choices) || []).map(c => c.label);
  ok(contestId + ' choice: participate AND refuse offered', labels.some(l => /participate/i.test(l)) && labels.some(l => /refuse/i.test(l)), labels.join(' / '));
  const ri = labels.findIndex(l => /refuse/i.test(l));
  const res = Game.contestChoose(ri);
  const txt = drain();
  ok(contestId + ' refuse: refusal is a played sequence, not a skip', /refus|say no|no on camera|galaxy|NOTED/i.test(txt), 'len=' + txt.length + ' tail=' + trunc(txt.slice(-200), 120));
  ok(contestId + ' refuse: the sequence ends cleanly', !Game.state.activeContest || Game.state.activeContest.phase === 'done');
}
async function actMulti(contestId) {
  scene('MULTI-TAKE — ' + contestId + ' (you + a villager; their fate is their own)');
  await freshRun(); const vids = setupContestDay(15);
  const contest = Game.contestPool().find(c => c.id === contestId);
  const vid = vids[1]; const vnm = vname(vid);
  Game.contestInterruption(contest, ['player', vid]);
  const t0 = drain();
  ok(contestId + ' multi: the others taken are NAMED', new RegExp(vnm).test(t0), 'take line: ' + trunc(t0, 120));
  const led = playToEnd(contestId, 'middle', true);
  drain();
  const allT = led.allText;
  ok(contestId + ' multi: ' + vnm + ' gets their own rolled fate', new RegExp(vnm + '.*(WON|survived|made it out|is back|walked out|didn\'t come home|is gone)', 'i').test(allT), 'fate line present');
}
async function actCoaching(contestId) {
  scene('KNOWLEDGE — ' + contestId + ' played twice, third run should coach');
  await freshRun(); setupContestDay(15);
  const contest = Game.contestPool().find(c => c.id === contestId);
  let allPlayText = '';
  Game.contestInterruption(contest, ['player']); allPlayText += ' ' + playToEnd(contestId, 'brave', true).allText; drain();
  Game.contestInterruption(contest, ['player']); allPlayText += ' ' + playToEnd(contestId, 'cautious', true).allText; drain();
  const k = Game.contestKnowledge(contestId);
  ok(contestId + ' knowledge: two plays reach level 2', k.level >= 2, 'level=' + k.level + ' seen=' + k.seen);
  ok(contestId + ' knowledge: coaching unlock line announced', /📚/.test(allPlayText));
  Game.contestInterruption(contest, ['player']);
  let itxt = drain();
  const ac3 = Game.state.activeContest;
  const p0 = ac3 && ac3.phases[0];
  if (p0 && (p0.choices || []).some(c => /participate/i.test(c.label))) {
    const pi = p0.choices.findIndex(c => /participate/i.test(c.label));
    Game.contestChoose(pi); itxt += ' ' + drain();
  }
  const cue = Game._cxCoaching(contest);
  ok(contestId + ' knowledge: coached intro carries the coaching cue', !!cue && itxt.includes(cue.slice(0, 30).trim()), 'cue: ' + trunc(cue, 80));
}
async function actHardened(contestId) {
  scene('HARDENED — ' + contestId + ' (repeat contest comes back worse)');
  await freshRun(); setupContestDay(15);
  const base = Game.contestPool().find(c => c.id === contestId);
  Game.state.scholar.day = 20;
  Game.state.contestsSeen = { [contestId]: 2 };
  const scaled = Game._contestScaled(base, 'hardened');
  ok(contestId + ': hardened variant renames', /hardened/i.test(scaled.name), scaled.name);
  ok(contestId + ': hardened variant bumps risk', scaled.risk !== base.risk || base.risk === 'extreme', `${base.risk} -> ${scaled.risk}`);
  Game.contestInterruption(scaled, ['player']);
  ok(contestId + ': hardened variant is announced', /hardened/i.test(drain()));
  const led = playToEnd(contestId, 'middle', true);
  ok(contestId + ': hardened sequence terminates', !led.stuck && !Game.state.activeContest);
}

// ---------- main ----------
(async () => {
  await Game.init();
  note('== SEED ' + SEED + ' ==');
  const pool = Game.contestPool();
  scene('ACT 0 — pool & gating');
  await freshRun(); setupContestDay(13);
  let eg = Game.contestEligible();
  ok('day 13: locked (unlock day 14+)', eg.eligible.length === 0, 'reason: ' + (eg.reason || ''));
  await freshRun(); setupContestDay(15);
  eg = Game.contestEligible();
  ok('day 15: player is eligible', eg.eligible.some(e => e.id === 'player'));
  ok('day 15: villagers are eligible (>=2)', eg.eligible.filter(e => e.id !== 'player').length >= 2);
  ok('contest pool is deep (>= 40 types)', pool.length >= 40, 'pool=' + pool.length);
  note('   pool: ' + pool.map(c => c.id).join(', '));

  scene('ACT 1 — static branching analysis (theater vs real choices)');
  const personas = ['brave', 'cautious', 'middle'];
  const branchTable = [];
  for (const c of pool) {
    const br = branchReport(c.id);
    branchTable.push({ id: c.id, cat: c.cat, risk: c.risk, ...br });
    ok(c.id + ': playable phases build without throwing', !br.err, br.err || `phases=${br.phases} choices=${br.totalChoices} nexts=${br.distinctNexts} effects=${br.effects}`);
    ok(c.id + ': every phase has >= 1 choice', (br.phasesNoChoices || 0) === 0, 'choiceless phases=' + br.phasesNoChoices);
    if ((br.distinctNexts || 0) < 3) note(`   [THIN] ${c.id}: only ${br.distinctNexts} distinct next-targets across ${br.totalChoices} choices — choices may be theater`);
  }
  note('\n   branching table (id | cat | risk | phases | choices | distinct-nexts | effects):');
  for (const b of branchTable) note(`   ${b.id} | ${b.cat} | ${b.risk} | ${b.phases} | ${b.totalChoices} | ${b.distinctNexts} | ${b.effects}`);

  scene('ACT 2 — every contest, played TAKEN');
  let i = 0;
  for (const c of pool) {
    await actTaken(c, personas[i % 3]); i++;
  }
  scene('ACT 3 — every contest, WATCHED (the watchable show)');
  for (const c of pool) {
    await actWatch(c);
  }
  scene('ACT 4 — the grab from every player state');
  await grabSleep();
  await grabCombat();
  await grabConversation();
  await grabExpedition();
  scene('ACT 5 — refuse / multi-take / knowledge / hardened');
  await actRefuse('pit');
  await actRefuse('auction');
  await actMulti('duel');
  await actMulti('auction');
  await actCoaching('pit');
  await actHardened('pit');

  scene('VERDICT');
  const audioAll = [...new Set(verdicts.flatMap(v => v.audio || []))];
  note('\n   audioEvent hooks fired during contests (read-only):');
  for (const a of audioAll) note('     · ' + a);
  note('\n   run verdicts:');
  for (const v of verdicts) note('     · ' + JSON.stringify(v));
  const fails = results.filter(r => !r[1]);
  note(`\n   assertions: ${passN} pass, ${failN} fail (of ${results.length})`);
  if (fails.length) { note('\n   FAILING ASSERTIONS:'); for (const f of fails) note('     · ' + f[0]); process.exitCode = 1; }
  else note('\n   ALL GREEN — contest playtest pass complete.');
})();
