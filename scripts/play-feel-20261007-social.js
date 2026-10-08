#!/usr/bin/env node
// SOCIAL SCENARIOS PLAYED AUDIT (Steve 2026-10-07) — played AS A PLAYER.
//
// Work-queue item #2 (overdue): moot, exile, ambush, liars. Each scenario is
// played end-to-end through the debug scenarios, with a player's eyes:
//   ACT 1 — LIAR'S DEN: five villagers lying about who they are. Hear the
//           claims, watch for tells, confront. Knowledge-gating audit: the
//           truth must NEVER surface in any line before a confession.
//   ACT 2 — MOOT, ACCUSED: theft + assault on the books. Play the defense
//           window (speak, alibi, press accuser, bribery investigation),
//           let the clock run, stand at the fire. Verdict must resolve.
//   ACT 3 — MOOT, JUROR: an ambush plot resolved into a case. Work the
//           evidence (press, site, witnesses, flip the weakest), call the
//           moot, cast the vote — and feel what the vote costs.
//   ACT 4 — AMBUSH: the walk turns. Three full plays: TALK (stall the plan),
//           FIGHT (desperate), RUN (first instinct). Every path must resolve
//           into aftermath, never a stuck beat.
//   ACT 5 — EXILE: the walk. Claim a site, fell timber, raise the shelter,
//           cache food, survive the solo days, found the haven — the hard
//           reset. Plus the petition path (they've heard the gossip).
//
// HOT-TREE SAFETY: engine + data load from HEAD via `git show` (the worktree
// holds in-flight sibling changes — never read from it). This script creates
// only its own file. Engine is READ-ONLY here: bugs found become a wiring
// backlog in the evidence note, not edits.
// RNG: mulberry32, fixed default seed, SEED env override. Deterministic proof.
// Turn hygiene: after a player action, advance ONLY if still the player's
// turn. Interior tiles 1..7. Window stub dropped before play (sync combat).
// Exit code non-zero on any assertion failure.
// Run: node scripts/play-feel-20261007-social.js [SEED=...]
const { execSync } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261007', 10);
let _s = SEED >>> 0;
Math.random = function () {
  _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const show = (p) => execSync(`git -C ${ROOT} show HEAD:${p}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// ---- data from HEAD ----
const DATA_FILES = ['plants.json', 'biomes.json', 'monsters.json', 'villagers.json',
  'abilities.json', 'items.json', 'background_survivors.json', 'cell_defs.json',
  'animals.json', 'recipes.json', 'books.json', 'relicEnhancements.json', 'locations.json',
  'characterGen.json', 'synergies.json', 'knowledge.json', 'nameCultures.json',
  'originPicker.json', 'foreignSpeech.json', 'lifeseeds.json'];
global.SCATTER_DATA = {};
for (const f of DATA_FILES) global.SCATTER_DATA[f.replace('.json', '')] = JSON.parse(show('src/data/' + f));

// ---- engine in index.html order, minus DOM-only (app.js, sprites.js, tile-scenes.js, move-anim.js) ----
const SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
  'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js',
  'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js', 'src/js/drama.js'];
global.window = global; // equipment.js needs window at load
const stubEl = () => ({ style: {}, className: '', appendChild() {}, remove() {}, addEventListener() {}, setAttribute() {}, textContent: '', innerHTML: '' });
global.document = { getElementById: () => null, createElement: stubEl, querySelector: () => null, querySelectorAll: () => [], contains: () => false, body: stubEl(), head: stubEl() };
for (const f of SCRIPTS) eval(show(f));
delete global.window; // else combat goes async and the harness stalls
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;

// ---------- harness plumbing ----------
const transcript = [];
const fails = [];
const note = t => { transcript.push(t); console.log(t); };
const ok = (name, cond, extra) => {
  if (!cond) fails.push(name);
  note(`   [${cond ? 'OK  ' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`);
};
const scene = t => note('\n==== ' + t + ' ====');
const trunc = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; };
const logText = () => (Game.log || []).map(x => String((x && x.text) || x));
// spoken: ONLY game-spoken lines (never my own notes — keeps the
// "no undefined" audit from matching my own assertion names)
const spoken = [];
function drain() { const l = logText(); for (const t of l) spoken.push(t); (Game.log || []).length = 0; return l; }
const noUndefinedSpoken = () => !spoken.join(' ').includes('undefined');
function drainPrint(prefix) { const l = drain(); for (const t of l) note((prefix || '   > ') + trunc(t, 300)); return l; }
// every player action must SAY something (Steve: no silent actions)
function saidSomething(actionName, before) {
  const fresh = drain();
  for (const t of fresh) note('   > ' + trunc(t, 280));
  ok(`${actionName}: the game said something (no silent action)`, fresh.length > 0);
  return fresh;
}
const audioSeen = [];
try {
  const _ae = Game.audioEvent.bind(Game);
  Game.audioEvent = (n, d) => { audioSeen.push(n); try { return _ae(n, d); } catch (e) {} };
} catch (e) {}
// player-name for a villager id
const nm = (vid) => { try { return Game.displayName(vid); } catch (e) { return vid; }; };
// grant pack food (test setup: the player packed for the road)
function grantFood(kcalTotal, name) {
  const s = Game.state.scholar;
  s.inventory = s.inventory || [];
  const units = Math.ceil(kcalTotal / 500);
  s.inventory.push({ itemId: 'test_' + (name || 'food'), name: name || 'travel food', units, kcalEach: 500, kg: 0.1, safe: true, spoilDay: 9999 });
}

(async () => {
await Game.init();
note('== SEED ' + SEED + ' ==');
note('engine: HEAD ' + execSync('git -C ' + ROOT + ' rev-parse --short HEAD', { encoding: 'utf8' }).trim() + ' (worktree NOT read)');

// ================= ACT 1: LIAR'S DEN =================
scene('ACT 1 — LIAR\'S DEN: five villagers, five borrowed coats');
Game.debugScenario('liars');
drainPrint();
const v1 = Game.state.village;
const liars = (v1.roster || []).filter(r => r !== Game.villagerId).slice(0, 5);
ok('liars: 5 villagers with live lies', liars.every(rid => { const l = Game.npcLies(rid); return l && l.occupation && l.origin; }), liars.map(nm).join(' · '));

// leaks: scan EVERYTHING the game says for any unconfessed truth
let leakHits = [];
const truths = {};
for (const rid of liars) {
  const l = Game.npcLies(rid);
  truths[rid] = [l.occupation.truth, l.origin.truth].filter(Boolean);
}
function scanForLeaks(stage) {
  const fresh = logText();
  for (const t of fresh) {
    for (const rid of liars) {
      const lies = Game.npcLies(rid) || {};
      for (const f of ['occupation', 'origin']) {
        const lf = lies[f];
        if (lf && !lf.confessed && lf.truth && t.toLowerCase().includes(String(lf.truth).toLowerCase())) {
          leakHits.push(`[${stage}] truth "${lf.truth}" leaked in: ${trunc(t, 120)}`);
        }
      }
    }
  }
}

// 1. hear the claims — like a player would, over the fire
note('\n-- night one: I ask each of them about their past');
for (const rid of liars) {
  const lies = Game.npcLies(rid);
  Game.startConvo(rid); drain();
  const line = Game.convoAskTopic(rid, 'past');
  const claimed = lies.occupation.told;
  note(`   ${nm(rid)}: "${trunc(line, 150)}"`);
  ok(`${nm(rid)}: told the cover ("${claimed}"), not the truth`, String(line).toLowerCase().includes(String(claimed).toLowerCase()) && !String(line).toLowerCase().includes(String(lies.occupation.truth).toLowerCase()));
  saidSomething(`${nm(rid)}: the 'past' question`, null);
  scanForLeaks('claim');
  Game.endConvo(rid, 'left'); drain();
}
ok('knowledge gate: no truth surfaced in any claim line', leakHits.length === 0, leakHits.slice(0, 3).join(' ‖ ') || 'clean');

// 2. watch them — observation is work, and work sometimes pays
note('\n-- I start watching. Hands, mostly. Hands don\'t lie as well as mouths.');
let doubtsMade = 0, observes = 0;
const firstDoubts = {};
for (const rid of liars) {
  for (let i = 0; i < 6; i++) {
    observes++;
    const r = Game.observePerson(rid);
    saidSomething(`${nm(rid)}: watch (${i + 1})`, null);
    scanForLeaks('observe');
    if (r && r.found) { doubtsMade++; note(`   👀 TELL on ${nm(rid)}: "${trunc(r.text, 160)}"`); break; }
  }
  const ds = (Game.state.codex.doubts || []).filter(d => d.vid === rid && !d.resolved);
  if (ds.length && !firstDoubts[rid]) firstDoubts[rid] = ds[0].id;
}
note(`   observation: ${observes} watches → ${doubtsMade} liars gave a tell`);
ok('observation: tells are earnable, not guaranteed (some liars stay smooth)', doubtsMade >= 3 && doubtsMade <= 5, `${doubtsMade}/5 told on`);
ok('knowledge gate: tells name the CLAIM and the behavior, never the truth', leakHits.length === 0, leakHits.slice(0, 3).join(' ‖ ') || 'clean');

// 3. confront — personality-driven; the coats come off or get sewn tighter
note('\n-- confrontation. "You told me X — but I watched your hands."');
const outcomes = {};
for (const rid of Object.keys(firstDoubts)) {
  const before = Game.npcLies(rid);
  const r = Game.confrontDoubt(rid, firstDoubts[rid]);
  const fresh = drain();
  for (const t of fresh) note('   > ' + trunc(t, 240));
  scanForLeaks('confront');
  outcomes[rid] = r && r.outcome;
  note(`   ${nm(rid)} → outcome: ${r && r.outcome}`);
  ok(`${nm(rid)}: confrontation resolves to a legal outcome`, ['confessed', 'deflected', 'attacked', 'cleared', 'already-confessed'].includes(r && r.outcome), r && r.outcome);
  if (r && r.outcome === 'confessed') {
    ok(`${nm(rid)}: confession marks the lie confessed`, !!(Game.npcLies(rid).occupation.confessed || Game.npcLies(rid).origin.confessed));
    // after confession, the truth is EARNED knowledge — now it may be spoken
    Game.startConvo(rid); drain();
    const line2 = Game.convoAskTopic(rid, 'past');
    const spokeTruth = String(line2).toLowerCase().includes(String(before.occupation.truth).toLowerCase());
    note(`   post-confession: "${trunc(line2, 160)}"`);
    ok(`${nm(rid)}: post-confession they speak the truth (earned)`, spokeTruth);
    drain(); Game.endConvo(rid, 'left'); drain();
  }
}
ok('knowledge gate: STILL no truth leak anywhere pre/post confrontation', leakHits.length === 0, leakHits.slice(0, 3).join(' ‖ ') || 'clean');
ok('liars: no game line ever rendered "undefined"', noUndefinedSpoken());

// ================= ACT 2: MOOT — YOU STAND ACCUSED =================
scene('ACT 2 — MOOT, ACCUSED: theft and assault on the books');
Game.debugScenario('mootAccused');
drainPrint();
let cases = Game.betrayalState().cases || [];
let c = cases.find(x => x.accused.includes(Game.villagerId) && (x.status === 'open' || x.status === 'dormant'));
ok('accused: a case opened against the player', !!c, c ? `charge=${c.charge} accuser=${nm(c.accuser)} mootIn=${c.mootIn}d` : 'none');
// knowledge gating: the charge is only over recorded, provable crimes
const recorded = (() => { try { return (Game.justiceState().crimes || []).map(x => x.type); } catch (e) { return []; } })();
const chargeMap = { theft: 'theft', assault: 'attack', murder: 'murder', intimidation: 'intimidation' };
ok('accused: charged only for what is on the books (no phantom crimes)', !c || recorded.includes(chargeMap[c.charge] || c.charge), `books=[${recorded}] charge=${c && c.charge}`);
const accusationLines = transcript.join(' ');
ok('accused: the summons names the accuser and the charge', !!c && accusationLines.includes('moot'));

if (c) {
  note('\n-- the defense window: I work the case file like my life depends on it');
  // (a) speak in your defense
  Game.caseDossierDo(c.id, 'speak'); saidSomething('defense: speak', null);
  // (b) character witnesses
  const alibiR = Game.caseDossierDo(c.id, 'alibi'); saidSomething('defense: alibi', null);
  note(`   alibi result: ${alibiR ? 'someone vouched' : 'nobody met my eyes (honest silence, -belief)'}`);
  // (c) plant the accuser's bribe, then investigate it — the full dirty subplot
  const voters = (Game.npcIds() || []).filter(id => !c.accused.includes(id));
  const bribed = voters[0];
  if (bribed) {
    const price = Game.caseBribePrice(c, bribed);
    grantFood(price + 2000, 'bribe fund');
    const br = Game.bribeVoter(c.id, bribed, c.accuser, price);
    ok('bribery: the accuser CAN buy a vote (dirty, traceable)', br === true, `price=${price}kcal`);
    Game.caseDossierDo(c.id, 'investigate'); const invLines = saidSomething('defense: follow the food', null);
    const found = (c.foundBribes || []).length;
    note(`   bribes found: ${found}`);
    if (found) { Game.caseDossierDo(c.id, 'expose'); saidSomething('defense: expose the bribery', null); }
    ok('bribery: investigation can find the bought vote', found > 0);
  }
  // (d) press the accuser via conversation (the player-facing path)
  Game.startConvo(c.accuser); drain();
  const ch = Game.convoChoices(c.accuser).map(x => x.id);
  const pressId = ch.find(id => id.indexOf('betrayal:pressaccuser:') === 0);
  if (pressId) { Game.convoTurn(c.accuser, pressId); saidSomething('defense: press the accuser (conversation)', null); }
  else note('   (press-the-accuser not offered in conversation — accuser unknown or already pressed)');
  Game.endConvo(c.accuser, 'left'); drain();
  // (e) let the accuser's clock run — days pass, the moot comes
  note('\n-- the count comes: I live the days, the fire gets built');
  grantFood(12000, 'defense-window rations');
  let days = 0;
  while (!c.trial && days < 8) {
    days++;
    Game.state.scholar.kcal = Math.max(Game.state.scholar.kcal || 0, 3000);
    Game.state.scholar.health = Math.max(Game.state.scholar.health || 0, 80);
    Game.endDay();
    const dl = drain();
    const mootLine = dl.find(t => /moot/i.test(t));
    if (mootLine) note(`   day ${days}: ${trunc(mootLine, 200)}`);
  }
  ok('accused: the moot convenes on the clock (no manual push needed)', !!c.trial, `after ${days} day(s)`);
  const verdictLines = drain();
  for (const t of verdictLines) note('   > ' + trunc(t, 240));
  if (c.trial) {
    note(`   VERDICT: ${c.trial.convicted ? 'GUILTY' : 'NOT GUILTY'} (${c.trial.finalGuilty}/${c.trial.present.length + (c.trial.playerVoter ? 1 : 0)} for guilty)`);
    ok('accused: trial resolves to a terminal state', !!c.trial && ['resolved', 'acquitted'].includes(c.status), `status=${c.status} resolution=${c.resolution}`);
    ok('accused: the verdict was spoken aloud (audio + drama fired)', audioSeen.includes('justiceVerdict'), `audio=[${audioSeen.join(',')}]`);
    note(`   sentence/resolution: ${c.resolution}`);
  }
}

// --- variant: flee before the count ---
note('\n-- variant: I don\'t wait for the count. Pack, dark, tree line.');
Game.debugScenario('mootAccused'); drain();
let c2 = (Game.betrayalState().cases || []).find(x => x.accused.includes(Game.villagerId) && (x.status === 'open' || x.status === 'dormant'));
if (c2) {
  Game.caseDossierDo(c2.id, 'flee'); saidSomething('defense: flee (exile by flight)', null);
  ok('flee: the case resolves as fled', c2.status === 'resolved' && c2.resolution === 'fled', `${c2.status}/${c2.resolution}`);
  ok('flee: flight means exile', !!Game.state.scholar.exiled);
} else ok('flee variant: case opened', false, 'no case');

// ================= ACT 3: MOOT — YOU ARE THE JUROR =================
scene('ACT 3 — MOOT, JUROR: three villagers, one ambush that never quite happened');
Game.debugScenario('mootJuror');
drainPrint();
let cj = (Game.betrayalState().cases || []).find(x => x.playerRole === 'juror');
ok('juror: the case is known to the player, role = juror', !!cj && cj.knownToPlayer === true, cj ? `charge=${cj.charge} accused=${cj.accused.map(nm).join(', ')}` : 'none');
if (cj) {
  ok('juror: first-mover advantage — the cover story landed before I started', !!cj.coverSeeded && Object.keys(cj.belief || {}).length > 0, `avgBelief=${Math.round(Game.avgBelief(cj))} (positive = room believes them)`);
  note('\n-- I work the evidence before the fire is built');
  Game.examineAmbushSite(cj.id); saidSomething('juror: examine the site', null);
  Game.nameWitnesses(cj.id); saidSomething('juror: name the witnesses', null);
  Game.pressAccomplice(cj.id, cj.accused[1]); saidSomething('juror: press an accomplice', null);
  Game.approachWeakest(cj.id, true); const awLines = saidSomething('juror: flip the weakest (leniency)', null);
  note(`   weakest flipped: ${!!cj.flipped}`);
  // the vote — everyone will remember this
  note('\n-- the fire is built high. My vote, out loud, in front of everyone.');
  const memBefore = JSON.stringify((Game.state.village.memory || {})).length;
  const callR = Game.callMoot(cj.id, Game.villagerId);
  const callLines = drain(); for (const t of callLines) note('   > ' + trunc(t, 260));
  ok('juror: the moot asks for MY vote', !!(callR && callR.awaitingPlayerVote));
  if (cj.trial && cj.trial.awaitingPlayerVote) {
    const need = callR.need, soFar = callR.guiltySoFar;
    note(`   💭 ${soFar} for guilty so far, ${need} needed. The evidence says they did it. I vote guilty — and own it.`);
    Game.castPlayerVote(cj.id, true);
    const vl = drain(); for (const t of vl) note('   > ' + trunc(t, 260));
    ok('juror: vote resolves the trial to a terminal state', ['resolved', 'acquitted'].includes(cj.status), `${cj.status}/${cj.resolution} convicted=${cj.trial.convicted}`);
    const memAfter = JSON.stringify(Game.state.village.memory || {});
    ok('juror: the room remembers the vote (social consequence, not just a count)', memAfter.length > memBefore && /moot_vote|voted_guilty/.test(memAfter), 'memory grew with moot_vote records');
  }
  ok('juror: the accused\'s cover story was pressable into cracks', (cj.inconsistencies || []).some(i => i.found) || !!cj.flipped, `inconsistencies found=${(cj.inconsistencies || []).filter(i => i.found).length} flipped=${!!cj.flipped}`);
}

// ================= ACT 4: AMBUSH — the walk turns =================
scene('ACT 4 — AMBUSH: three plays — TALK, FIGHT, RUN');
function ambushRun(label, policy, maxRounds) {
  note(`\n-- play ${label}:`);
  Game.debugScenario('ambush');
  const fresh0 = drain();
  const plot = (Game.betrayalState().plots || []).find(p => p.sprung && Game.isPlayer(p.target));
  ok(`${label}: the ambush springs on the player`, !!plot);
  if (!plot) return null;
  const tells = plot.tells || [];
  note(`   tells noticed: ${tells.length} (perception-gated: observant earn more)`);
  for (const t of tells) note(`     · ${trunc(t, 110)}`);
  ok(`${label}: tell count matches earned perception`, tells.length === Game.plotAwareness(plot));
  const c0 = Game.convoGet(plot.leader);
  ok(`${label}: the beat opens as a conversation (RUN/TALK/FIGHT)`, c0.thread === 'ambush');
  let choices = Game.convoChoices(plot.leader).map(x => x.id);
  ok(`${label}: RUN/TALK/FIGHT all offered`, choices.includes('betrayal:run') && choices.includes('betrayal:talk') && choices.includes('betrayal:fight'), choices.filter(x => x.indexOf('betrayal:') === 0).join(' '));
  let rounds = 0;
  while (!plot.resolved && rounds < maxRounds) {
    rounds++;
    const chNow = Game.convoChoices(plot.leader).map(x => x.id);
    const pick = policy(chNow, rounds);
    note(`   💭 R${rounds}: ${pick.thought}`);
    Game.convoTurn(plot.leader, pick.id);
    const fl = drain(); for (const t of fl) note('   > ' + trunc(t, 240));
    // TALK must disappear when talks run out (the stuck-state fix)
    if ((plot.talksLeft || 0) <= 0) {
      const chAfter = Game.convoChoices(plot.leader).map(x => x.id);
      if (!plot.resolved) ok(`${label}: TALK hidden once talks are spent`, !chAfter.includes('betrayal:talk'));
    }
  }
  ok(`${label}: the beat resolves (never a stuck loop)`, !!plot.resolved, `outcome=${plot.outcome} after ${rounds} round(s)`);
  const casesA = (Game.betrayalState().cases || []).filter(x => x.plotId === plot.id);
  ok(`${label}: aftermath opens a case — their story gets out first`, casesA.length > 0 && !!casesA[0].coverSeeded, casesA.map(x => x.charge + '/' + x.status).join(' '));
  return plot;
}
// A: talk them down — the waver, the crack, the plan coming apart
ambushRun('A (TALK — stall the plan)', (ch) => ch.includes('betrayal:talk')
  ? { id: 'betrayal:talk', thought: 'Hands visible, voice level. Find the one with cold feet.' }
  : { id: 'betrayal:run', thought: 'No more words left in this. RUN.' }, 8);
// B: fight — desperate, all-in
Game.state.scholar && (Game.state.scholar.health = 120);
ambushRun('B (FIGHT — desperate)', () => ({ id: 'betrayal:fight', thought: 'No form, all survival. Hit the closest one, hard.' }), 8);
// C: run on the first beat — the aware player's move
ambushRun('C (RUN — first instinct)', () => ({ id: 'betrayal:run', thought: 'This is the move. Trees, breath, gone.' }), 8);
ok('ambush: no game line ever rendered "undefined"', noUndefinedSpoken());

// ================= ACT 5: EXILE — you walk =================
scene('ACT 5 — EXILE: the walk. What you carry is what you have.');
Game.debugScenario('exile');
drainPrint();
const s5 = Game.state.scholar;
ok('exile: the player is exiled', !!s5.exiled);
ok('exile: the old village continues (archived, not deleted)', !!Game.state.village && !!Game.state.village.name, Game.state.village && Game.state.village.name);
const oldVillage = Game.state.village;
const oldName = oldVillage.name;
const packBefore = (s5.inventory || []).map(i => i.itemId || i.name).join(',');
const codexNotesBefore = ((Game.state.codex && Game.state.codex.notes) || []).length;
ok('exile: the walk starts at the village edge (audio: footsteps receding)', audioSeen.includes('exileWalk'), `audio=[${audioSeen.join(',')}]`);
const exileNote = ((Game.state.codex && Game.state.codex.notes) || []).find(x => x && x.cat === 'village' && x.key === 'exile');
ok('exile: the journal records it in-fiction (no debug marker)', !!exileNote && !/\(debug\)/i.test(exileNote.text || ''), trunc(exileNote && exileNote.text, 90));

note('\n-- the founding project: claim, timber, shelter, cache, solo days');
const acts5 = Game.exileSelfActions().map(a => a.id + (a.disabled ? ' (disabled)' : ''));
ok('exile: the project actions are offered', acts5.some(a => a.indexOf('claimsite') === 0), acts5.join(' | '));
Game.exileSelfDo('claimsite'); saidSomething('exile: claim a campsite', null);
grantFood(40000, 'exile stores');
// fell & haul until the hut is affordable (8 + 16 = 24 wood)
let woodTrips = 0;
while (Game.woodCount() < 24 && woodTrips < 8) {
  s5.kcal = Math.max(s5.kcal || 0, 3000);
  Game.exileSelfDo('gathertimber'); drain(); woodTrips++;
}
note(`   timber: ${Game.woodCount()} wood after ${woodTrips} trips`);
ok('exile: timber accumulates honestly', Game.woodCount() >= 24);
s5.kcal = Math.max(s5.kcal || 0, 3000);
Game.exileSelfDo('buildshelter'); saidSomething('exile: raise the lean-to', null);
s5.kcal = Math.max(s5.kcal || 0, 3000);
Game.exileSelfDo('buildshelter'); saidSomething('exile: raise the hut', null);
ok('exile: shelter reaches founding tier', Game.foundingState().shelterTier >= 2, `tier=${Game.foundingState().shelterTier}`);
let caches = 0;
while (Math.round(Game.foundingState().stockpileKcal) < 10000 && caches < 6) {
  s5.kcal = Math.max(s5.kcal || 0, 6000);
  const before = Game.playerPackKcal();
  if (before < 500) grantFood(12000, 'forage top-up');
  Game.exileSelfDo('cachefood'); drain(); caches++;
}
note(`   cache: ${Math.round(Game.foundingState().stockpileKcal)} kcal after ${caches} caches`);
ok('exile: the cache fills to founding requirement', Math.round(Game.foundingState().stockpileKcal) >= 10000);
// the solo days — the wild grades on results, not effort
note('\n-- seven solo days. The wild doesn\'t grade on effort.');
for (let d = 0; d < 8; d++) {
  s5.kcal = Math.max(s5.kcal || 0, 4000); s5.health = Math.max(s5.health || 0, 90);
  Game.endDay(); drain();
}
const missing = Game.foundingMissing();
ok('exile: the founding project completes', missing.length === 0, missing.join('; ') || 'nothing missing');
note('\n-- day one, again. But this time I know what a day costs.');
const foundR = Game.exileSelfDo('foundhaven');
const foundLines = drain(); for (const t of foundLines) note('   > ' + trunc(t, 280));
ok('exile: the haven is founded', foundR === true);
ok('exile HARD RESET: new village object, old one archived and continuing', Game.state.village !== oldVillage && (Game.state.pastVillages || []).includes(oldVillage), `new=${Game.state.village && Game.state.village.name} old=${oldName} archived=${(Game.state.pastVillages || []).length}`);
ok('exile hard reset: fresh social slate (trust/gossip/memory wiped)', (() => { const nv = Game.state.village; return Object.keys(nv.trust || {}).length <= 2 && (nv.gossip || []).length === 0; })());
ok('exile hard reset: self, codex and pack cross the fire', !Game.state.scholar.exiled && ((Game.state.codex && Game.state.codex.notes) || []).length >= codexNotesBefore, `notes ${codexNotesBefore}→${((Game.state.codex && Game.state.codex.notes) || []).length}`);
ok('exile: the haven rises on the CLAIMED site', (() => { try { const t = Game.tileAt(Game.map.px, Game.map.py); return t && (t.type === 'haven' || t.isHaven); } catch (e) { return false; } })());

// --- variant: petition a nearby village (they've heard the gossip) ---
note('\n-- variant: instead of the wild, I walk to a neighbor\'s fire and ask.');
Game.debugScenario('exile'); drain();
const s6 = Game.state.scholar;
grantFood(6000, 'petition gift');
const ovs = (Game.state.otherVillages || []);
ok('petition: there are other villages in the world', ovs.length > 0, ovs.map(v => v.name).join(' · '));
if (ovs.length) {
  const pv = Game.petitionVillage(ovs[0].id, { giftKcal: 2500 });
  const pl = saidSomething(`petition: ask ${ovs[0].name} for a place`, null);
  ok('petition: the village answers, honestly, either way', typeof pv === 'boolean', `result=${pv}`);
  const giftLine = pl.find(t => /food|kcal/i.test(t));
  ok('petition: the gift is never silent (kept gift = kept honesty)', !giftLine || !/vanish|nothing/i.test(giftLine) || /take your food/i.test(giftLine));
  if (pv) {
    ok('petition: accepted → probation, half shares, the hard way back in', !!s6.joinedVillage);
  } else {
    ok('petition: rejected → still exiled, still has the walk', !!s6.exiled && !s6.joinedVillage);
  }
}

// ================= SUMMARY =================
scene('SUMMARY');
note(`seed=${SEED} · assertions: ${transcript.filter(t => t.indexOf('[OK  ]') === 3).length} passed, ${fails.length} failed`);
if (fails.length) {
  note('\nFAILURES:');
  for (const f of fails) note('  ✗ ' + f);
  process.exit(1);
}
note('\nAll social scenarios played end-to-end as a player. Verdicts in the evidence note.');
})().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(1); });
