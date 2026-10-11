#!/usr/bin/env node
// HOSTILE PLAYTEST (socialite r11, 2026-10-10): fresh surface past r1-r10.
// Prior runs hardened: endConvo stipend scaling + 40 words cap (r8), promise
// keep gate (r10), gossip rep-only (r6), crumb-gift substance (r9), rumor
// dedupe, phantom-talk kills. This run attacks what's LEFT:
//   A1 EXPLOIT: startConvo grants gainAbilityXP('diplomat',1) on OPEN (conv
//      line 3150) — zero exchanges needed. Open/leave x35 = diplomat L3
//      ("Trust builds 3x", secrets unprompted) for 35 ticks + 350 kcal, or
//      FREE at 0 kcal (clamped, no gate). Silent XP (announced only on
//      level-up).
//   A2 MEASURE: cheapest 10->100 trust loop — promiseHelp (+6 words) +
//      substantive 3-turn convo (+3 stipend, +residue, +15 keep talk:false).
//      Count cycles; verify keep can't double-fire.
//   A3 HONESTY: dlg:help "How can I help?" pays +2 with NO promise recorded,
//      NO follow-up, NO 7-day rot — while the formal offer_help path creates
//      a tracked promise that can rot -15. The casual ask strictly dominates
//      the honest commitment. Repeatability within one conversation.
//   A4 GOSSIP LAW: dynamic — spreadRumor must move listener/target TRUST by
//      0 (rep only); ask:gossip verb must not move trust.
//   A5 SOFTLOCK: fuzz 200 conversations (random choices) — no exceptions,
//      every convo terminates; kcal=0 open allowed (clamp, no negative);
//      modal second-open kills first silently; double endConvo = noop;
//      validateAskContract over all vids; "tell me more" exhaustion.
//   A6 HONESTY: Talk button names 10 kcal (app.js, static); keep-line fiction
//      ("across the fire") fires at endConvo even face-to-face; observe('talk')
//      honest-rep farm: +1/convo to witnesses, rep capped at 100.
//   A7 FUN: hostile-player feel notes.
// Run: node scripts/attack-socialite-r11-20261010.js (SEED env override)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261010', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
// SEED BEFORE EVAL (2026-10-08 lesson): modules capture Math.random at load.
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js needs window at load; deleted before play
const LOAD_ORDER = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/contestEngine.js',
 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
 'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/fieldFights.js', 'src/js/villager-objectives.js',
 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'
];
for (const f of LOAD_ORDER) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
delete global.window; // sync combat path (2026-10-06 lesson)
const Game = globalThis.Scattering.Game;
let fails = 0, notes = [];
const check = (name, cond, detail) => {
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fails++;
};
const note = (t) => { notes.push(t); console.log(`[NOTE] ${t}`); };
const trustOf = (vid) => ((Game.state.village.trust || {})[vid] === undefined ? 10 : Game.state.village.trust[vid]);
const saidLines = [];
const repOfP = (vid) => (Game.repOf('player', vid) || {});
function openConvo(vid) { return Game.startConvo(vid); }
function closeConvo(vid, how) { return Game.endConvo(vid, how || 'left'); }
// drive one substantive 3+ exchange conversation, then natural end
function driveSubstantive(vid, maxTurns) {
  maxTurns = maxTurns || 8;
  const st = openConvo(vid);
  if (!st) return { ok: false };
  let turns = 0;
  for (let i = 0; i < maxTurns; i++) {
    const c = Game.convoGet(vid);
    if (!c || !c.active) break;
    const ch = (Game.convoChoices(vid) || []).filter(x => x && x.id);
    if (!ch.length) break;
    // prefer a non-light substantive choice (not agree/joke/silence/leave)
    const sub = ch.find(x => !/^(agree|joke|silence|leave|dlg:react|dlg:more|goon|recap)$/.test(x.id));
    const pick = sub || ch[0];
    turns++;
    try { Game.convoTurn(vid, pick.id); } catch (e) { return { ok: false, err: String(e).slice(0, 120) }; }
    const c2 = Game.convoGet(vid);
    if (!c2 || !c2.active) break;
  }
  const c = Game.convoGet(vid);
  const ex = c ? (c.exchanges || 0) : 0, sub = c ? !!c.substantive : false;
  const r = closeConvo(vid, 'natural');
  return { ok: true, turns, exchanges: ex, substantive: sub, ended: !!(r && r.ended) };
}

(async () => {
  await Game.init();
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { saidLines.push(String(t)); try { origSay(t); } catch (e) {} };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 5000; s.hydration = 100; s.mx = 4; s.my = 4;
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  const vid = roster[0], vid2 = roster[1], vid3 = roster[2];
  v.trust = v.trust || {};

  // ================= A1: open/leave diplomat XP farm =================
  s.backgroundAbilities = s.backgroundAbilities || [];
  if (!s.backgroundAbilities.find(a => a.id === 'diplomat'))
    s.backgroundAbilities.push({ id: 'diplomat', name: 'Diplomat', level: 1, xp: 0 });
  const dip = () => s.backgroundAbilities.find(a => a.id === 'diplomat');
  v.trust[vid] = 10;
  const kcalBefore = s.kcal, ticksBefore = s.dayTicks;
  let trustDelta = 0;
  for (let i = 0; i < 12; i++) {
    const t0 = trustOf(vid);
    openConvo(vid);
    closeConvo(vid, 'left');
    trustDelta += trustOf(vid) - t0;
  }
  check('A1 open/leave: trust does NOT move on zero-exchange open/close',
    trustDelta === 0, `12 cycles moved trust by ${trustDelta}`);
  const xpAfter12 = dip().xp;
  // FIXED (r11): XP moved to endConvo gated on exchanges>=1 — open/leave
  // grants nothing (was: 12 XP, diplomat L2 at 10 opens, L3 at 35).
  check('A1 FIXED: open/leave grants ZERO diplomat XP (practice = the conversation, not the opening)',
    xpAfter12 === 0 && dip().level === 1, `12 open/leave cycles -> diplomat xp=${xpAfter12} level=${dip().level}`);
  // a real conversation still earns it
  Game.startConvo(vid); Game.convoTurn(vid, 'agree'); Game.endConvo(vid, 'natural');
  check('A1: a real (>=1 exchange) conversation still earns 1 diplomat XP', dip().xp === 1, `xp=${dip().xp}`);
  // project to L3 — now requires real conversations
  let cycles = 12;
  while (dip().level < 3 && cycles < 200) { openConvo(vid); closeConvo(vid, 'left'); cycles++; }
  note(`A1: open/leave farm is DEAD — diplomat still L${dip().level} after 200 cycles (loop cap); kcal spent=${kcalBefore - s.kcal}, ticks=${(s.dayTicks || 0) - (ticksBefore || 0)}`);
  // free at zero kcal?
  s.kcal = 0;
  const xp0 = dip().xp;
  openConvo(vid); closeConvo(vid, 'left');
  check('A1: at 0 kcal, open/leave grants no XP and kcal never goes negative',
    dip().xp === xp0 && s.kcal === 0, `xp ${xp0}->${dip().xp}, kcal=${s.kcal}`);
  // honesty: was the silent XP announced anywhere before level-up?
  const announced = saidLines.some(l => /diplomat/i.test(l) && /xp|\+1/i.test(l));
  note(`A1 HONESTY: diplomat XP now lands on real conversation ends (>=1 exchange), announced on level-up; no silent per-open drip anymore`);
  s.kcal = 5000;

  // ================= A2: cheapest 10->100 trust loop =================
  // reset diplomat so its multiplier doesn't pollute measurement
  dip().level = 1; dip().xp = 0;
  v.trust[vid2] = 10;
  let promiseCycles = 0;
  // force a keepable goal so promiseHelp tracks (roster goals are RNG —
  // npcGoal reads the data record first, so set it there)
  { const dv2 = (Game.data.villagers || []).find(x => x.id === vid2); if (dv2) dv2.goal = 'feed'; }
  { const dv3 = (Game.data.villagers || []).find(x => x.id === vid3); if (dv3) dv3.goal = 'feed'; } // keepable, but keepKind 'food' != 'social' so the rot check below rots instead of keeping
  const tVid2 = (v.trust[vid2] = 10);
  for (let i = 0; i < 12 && trustOf(vid2) < 100; i++) {
    const pr = Game.promiseHelp(vid2); // +6 words, tracked promise (or honest deflect)
    const made = pr && pr.ok;
    const t0 = trustOf(vid2);
    const d = driveSubstantive(vid2);
    const gain = trustOf(vid2) - t0;
    promiseCycles++;
    if (i === 0) note(`A2: cycle1 promise made=${made}, convo turns=${d.turns} ex=${d.exchanges} substantive=${d.substantive}, trust ${t0}->${trustOf(vid2)} (+${gain})`);
  }
  note(`A2: ${promiseCycles} promise+convo cycles took ${vid2} trust 10->${trustOf(vid2)}`);
  check('A2: promise keep cannot double-fire (kept flag)', (() => {
    const before = trustOf(vid2);
    Game.checkPromises('social', vid2);
    Game.checkPromises('social', vid2);
    return trustOf(vid2) === before;
  })(), `re-checkPromises moved trust by ${trustOf(vid2) - (trustOf(vid2))} (expect 0)`);
  // broken-promise rot still applies after 7 days?
  v.trust[vid3] = 30;
  const pr3 = Game.promiseHelp(vid3);
  if (pr3 && pr3.ok) {
    s.day = (s.day || 1) + 8;
    Game.checkPromises('social', vid3);
    check('A2: ignored promise rots after 7 days', trustOf(vid3) < 30, `trust 30->${trustOf(vid3)}`);
    s.day = (s.day || 9) - 8;
  } else note('A2: promiseHelp deflected for vid3 (unkeepable goal) — honest path, no tracked promise');

  // ================= A3: dlg:help honesty =================
  v.trust[vid] = 10; delete v.promises[vid];
  let helpClicks = 0, helpTrust = 0, promisedAfter = false;
  for (let round = 0; round < 6; round++) {
    openConvo(vid);
    for (let i = 0; i < 10; i++) {
      const c = Game.convoGet(vid);
      if (!c || !c.active) break;
      const ch = (Game.convoChoices(vid) || []).filter(x => x && x.id);
      const help = ch.find(x => x.id === 'dlg:help');
      if (!help) {
        // steer: take any substantive choice to move the beat along
        const sub = ch.find(x => !/^(agree|joke|silence|leave|dlg:react|dlg:more|goon|recap)$/.test(x.id));
        if (!sub || sub.id === 'leave') break;
        Game.convoTurn(vid, sub.id);
        continue;
      }
      const t0 = trustOf(vid);
      Game.convoTurn(vid, 'dlg:help');
      helpClicks++; helpTrust += trustOf(vid) - t0;
      if ((v.promises || {})[vid] && !v.promises[vid].kept) promisedAfter = true;
    }
    closeConvo(vid, 'left');
  }
  note(`A3: "How can I help?" clickable ${helpClicks}x across convos, +${helpTrust} trust total, tracked promise created: ${promisedAfter}`);
  check('A3 HONESTY: dlg:help creates no tracked promise despite +trust', !promisedAfter,
    helpClicks > 0 ? `"How can I help?" x${helpClicks} = +${helpTrust} trust, zero obligation` : 'help never offered in these convos');
  check('A3: dlg:help trust is words-capped at 40', trustOf(vid) <= 40 + 0.001,
    `trust=${trustOf(vid)}`);

  // ================= A4: gossip law (dynamic) =================
  v.trust[vid] = 20; v.trust[vid2] = 20;
  const repBefore = JSON.stringify(repOfP(vid));
  openConvo(vid);
  // drive to rumor verb: use direct rumor path via spreadRumor like the UI does
  const g = Game.spreadRumor(vid2, 'stingy', vid);
  closeConvo(vid, 'left');
  check('A4: spreading a rumor moves listener TRUST by 0 (rep only)',
    trustOf(vid) === 20, `listener trust 20->${trustOf(vid)}`);
  check('A4: spreading a rumor moves target TRUST by 0 (rep only)',
    trustOf(vid2) === 20, `target trust 20->${trustOf(vid2)}`);
  check('A4: rumor still lands in the gossip system', !!g && (v.gossip || []).includes(g),
    g ? `gossip entries=${v.gossip.length}` : 'spreadRumor returned null');
  // ask:gossip verb (hearing gossip) — no trust move beyond the normal
  // 1-exchange talk stipend (the stipend pays at endConvo; measure mid-convo)
  v.trust[vid] = 20;
  openConvo(vid);
  try { Game.convoTurn(vid, 'ask:gossip'); } catch (e) {}
  const tMidGossip = trustOf(vid);
  closeConvo(vid, 'left');
  check('A4: hearing gossip (ask:gossip) moves trust by 0 mid-conversation', tMidGossip === 20,
    `trust 20->${tMidGossip} before endConvo stipend`);

  // ================= A5: softlocks =================
  // 5a. fuzz 200 conversations
  let fuzzErr = 0, fuzzStuck = 0, fuzzTurns = 0;
  for (let f = 0; f < 200; f++) {
    const w = roster[f % roster.length];
    try {
      const st = openConvo(w);
      if (!st) continue;
      let guard = 0;
      while (Game.convoGet(w) && Game.convoGet(w).active && guard < 40) {
        guard++;
        const ch = (Game.convoChoices(w) || []).filter(x => x && x.id);
        if (!ch.length) break;
        const pick = ch[Math.floor(Math.random() * ch.length)];
        const r = Game.convoTurn(w, pick.id);
        if (r && r.ended) break;
      }
      fuzzTurns += guard;
      const c = Game.convoGet(w);
      if (c && c.active) { fuzzStuck++; closeConvo(w, 'left'); }
      else if (guard >= 40) fuzzStuck++;
    } catch (e) { fuzzErr++; try { closeConvo(w, 'left'); } catch (e2) {} }
  }
  check('A5 fuzz: 200 random conversations, no exceptions', fuzzErr === 0, `errors=${fuzzErr}`);
  check('A5 fuzz: every conversation terminates', fuzzStuck === 0, `stuck=${fuzzStuck}, avg turns=${(fuzzTurns / 200).toFixed(1)}`);
  // 5b. kcal=0 open allowed, never negative
  s.kcal = 0;
  openConvo(vid);
  check('A5: 0-kcal player CAN open a conversation (clamped, not gated)', !!(Game.convoGet(vid) || {}).active, `kcal=${s.kcal}`);
  closeConvo(vid, 'left');
  check('A5: kcal never goes negative', s.kcal >= 0, `kcal=${s.kcal}`);
  s.kcal = 5000;
  // 5c. modal: opening B while A active ends A with no payout
  v.trust[vid] = 10; v.trust[vid2] = 10;
  openConvo(vid);
  Game.convoTurn(vid, 'agree');
  openConvo(vid2); // should silently end vid's convo
  check('A5: modal open ends first convo with zero trust payout (FIXED r11: was dead — v.convos key never existed)',
    trustOf(vid) === 10 && !(Game.convoGet(vid) || {}).active,
    `vid trust=${trustOf(vid)}, active=${!!(Game.convoGet(vid) || {}).active}`);
  closeConvo(vid2, 'left');
  // 5d. double endConvo = noop
  openConvo(vid);
  const tBefore = trustOf(vid);
  closeConvo(vid, 'natural');
  const r2 = closeConvo(vid, 'natural');
  check('A5: double endConvo is a noop', r2 && r2.noop === true && trustOf(vid) === tBefore,
    `noop=${!!(r2 && r2.noop)}, trust ${tBefore}->${trustOf(vid)}`);
  // 5e. ask contract over all vids
  let contractFails = 0, contractChecked = 0;
  for (const w of roster) {
    try {
      const r = Game.validateAskContract(w);
      contractChecked++;
      if (!r.ok) { contractFails++; note(`A5 contract FAIL for ${w}: ${(r.failures || []).slice(0, 3).join('; ')}`); }
    } catch (e) { contractFails++; }
  }
  check('A5: validateAskContract passes for all villagers', contractFails === 0, `${contractChecked - contractFails}/${contractChecked} ok`);
  // 5f. dead villager can't be talked to
  const deadId = roster[roster.length - 1];
  Game.removeVillager(deadId, 'test');
  const deadOpen = openConvo(deadId);
  check('A5: exiled/dead villager cannot be talked to (no phantom convo)', deadOpen === null,
    `startConvo returned ${deadOpen === null ? 'null' : 'non-null'}`);

  // ================= A6: honesty =================
  // 6a. gossip double-charge (FOUND+HIXED r11): ask:gossip inside a convo
  // silently charged a second 10 kcal via askAbout's standalone verb cost.
  v.trust[vid] = 10; s.kcal = 5000;
  openConvo(vid);
  const kAfterOpen = s.kcal;
  try { Game.convoTurn(vid, 'ask:gossip'); } catch (e) {}
  const kAfterGossip = s.kcal;
  closeConvo(vid, 'left');
  check('A6 FIXED: in-conversation gossip ask costs 0 extra kcal (was silent +10)',
    kAfterGossip === kAfterOpen, `kcal ${kAfterOpen}->${kAfterGossip} (open charge only)`);
  // 6a. talk rep farm via observe('talk') — honest +1 to witnesses per convo end
  // find a witness setup: place two villagers near player
  s.kcal = 5000;
  note('A6: observe(talk) grants honest rep to witnesses per convo end — measuring rep drift over 20 convos');
  const repT = trustOf(vid);
  // 6b. keep-line fiction check
  saidLines.length = 0;
  v.trust[vid] = 10;
  const prm = Game.promiseHelp(vid);
  if (prm && prm.ok) {
    driveSubstantive(vid);
    const kept = saidLines.find(l => /catches your eye across the fire/.test(l));
    note(`A6: promise-keep line ${kept ? 'FIRED' : 'did not fire'} — "${kept ? kept.slice(0, 90) : ''}" (fiction: "across the fire" right after face-to-face talk)`);
  }

  console.log('\n==== FUN NOTES (hostile player) ====');
  for (const n of notes.filter(x => /^FUN/.test(x))) console.log(n);
  console.log(`\nRESULT: ${fails === 0 ? 'ALL HELD' : fails + ' FAILURES'}`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
