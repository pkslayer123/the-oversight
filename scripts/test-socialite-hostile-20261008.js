// Hostile socialite harness: boots the full engine in node, seeds RNG before
// eval (modules capture Math.random at load), then runs adversarial probes
// against trust/gossip/dialogue systems. Usage:
//   node scripts/test-socialite-hostile-20261008.js [probe]
// Probes: comfort | amends | talk | gossip | menus | all
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---- seeded RNG BEFORE eval (AGENTS.md: modules capture Math.random at load)
let _s = (parseInt(process.env.SEED || '1337', 10) >>> 0) || 1;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = mulberry32(_s);
Math.random = rng;

// ---- DOM stubs for eval phase only
const stubEl = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, setAttribute() {}, innerHTML: '', textContent: '', addEventListener() {}, querySelector: () => stubEl(), querySelectorAll: () => [], getContext: () => null, click() {}, focus() {}, dataset: {} });
global.document = { createElement: () => stubEl(), getElementById: () => stubEl(), querySelector: () => stubEl(), querySelectorAll: () => [], body: stubEl(), addEventListener() {}, documentElement: stubEl() };
global.window = global;
global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
try { global.navigator = { userAgent: 'node', onLine: true }; } catch (e) {}
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });

const ORDER = ['engine/state.js','engine/modifiers.js','engine/calories.js','engine/day.js','engine/forage.js','engine/combat.js','game.js','encounters.js','conversation.js','convo-mood.js','convoTopics.js','convo-wants.js','convo-dialogue.js','convo-beats.js','convo-scene.js','examine.js','equipment.js','journal.js','party.js','party-formal.js','truth.js','contests.js','contestEngine.js','alienPlayers.js','storage.js','perceive.js','carexplore.js','justice.js','food.js','betrayal.js','corpses.js','lifeseed.js','progression.js','ledger.js','abilityActions.js','monsterBehaviors.js','statusEffects.js','villager-agency.js','fieldFights.js','villager-objectives.js','codex-people.js','membership.js','hierarchy.js','debug-scenarios.js','build.js'];
for (const f of ORDER) {
  const code = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
  try { eval.call(global, code + `\n//# sourceURL=${f}`); }
  catch (e) { console.error('EVAL FAIL', f, e.message); process.exit(1); }
}
// runtime must take the SYNC combat path
delete global.window;

const Game = globalThis.Scattering.Game;
if (!Game) { console.error('NO GAME'); process.exit(1); }

const V = () => Game.state.village;
const villagers = () => Object.keys(V().villagers || {});
const trustOf = (vid) => ((V().trust || {})[vid] === undefined ? 15 : V().trust[vid]);

function pickVillager() {
  const ids = (V().roster || []).filter(id => id !== Game.villagerId);
  if (!ids.length) throw new Error('no villagers');
  return ids[0];
}

// ---------- PROBE 1: comfort spam on a hungry villager ----------
function probeComfort() {
  console.log('=== PROBE comfort-spam ===');
  const vid = pickVillager();
  // force hunger mood: crank hunger need
  const n = Game.npcNeeds(vid);
  n.hunger = 100; n.fear = 0;
  const t0 = trustOf(vid);
  let oks = 0, denies = 0;
  for (let i = 0; i < 10; i++) {
    n.hunger = 100; // keep them hungry (hostile: re-apply)
    const r = Game.comfort(vid);
    if (r && r.ok) oks++; else denies++;
  }
  const t1 = trustOf(vid);
  console.log(`comfort ok=${oks} denied=${denies} trust ${t0} -> ${t1} (delta ${t1 - t0})`);
  console.log(t1 - t0 >= 30 ? 'BREAK: comfort prints trust with re-applied hunger' : 'HELD: comfort trust bounded');
}

// ---------- PROBE 1b: HONEST comfort — no artificial hunger, natural mood only ----------
function probeComfortHonest() {
  console.log('=== PROBE comfort-honest (no need tampering) ===');
  const ids = (V().roster || []).filter(id => id !== Game.villagerId);
  let totalOk = 0, totalTrust = 0, villagersFarmed = 0;
  for (const vid of ids.slice(0, 5)) {
    const t0 = trustOf(vid);
    let oks = 0;
    for (let i = 0; i < 12; i++) {
      const r = Game.comfort(vid); // honest: whatever mood they naturally have
      if (r && r.ok) oks++; else break;
    }
    const t1 = trustOf(vid);
    if (oks > 0) { villagersFarmed++; totalOk += oks; totalTrust += (t1 - t0); }
    console.log(`  ${vid.slice(-6)}: comforts=${oks} trust ${t0}->${t1} mood=${Game.npcMood(vid)}`);
  }
  console.log(`farmed ${villagersFarmed} villagers, ${totalOk} comforts, +${totalTrust} trust total`);
  console.log(totalTrust >= 20 ? 'BREAK: natural-mood comfort farms trust' : 'HELD: natural comfort bounded');
}
function probeAmends() {
  console.log('=== PROBE makeAmends-chain ===');
  const vid = pickVillager();
  const r = Game.repOf(vid);
  r.honest = -50; // hostile: pre-damaged axis
  const t0 = trustOf(vid);
  let calls = 0;
  for (let i = 0; i < 6; i++) {
    const res = Game.makeAmends(vid);
    if (!res || !res.ok) break;
    calls++;
  }
  const t1 = trustOf(vid);
  const rEnd = Game.repOf(vid).honest;
  console.log(`amends calls=${calls} trust ${t0} -> ${t1} (delta ${t1 - t0}) honest rep -50 -> ${rEnd}`);
  console.log(t1 - t0 > 8 ? 'BREAK: apology laundering prints trust' : 'HELD: amends chain bounded');
}

// ---------- PROBE 3: talk loop — startConvo/convoTurn/endConvo grind ----------
function probeTalk() {
  console.log('=== PROBE talk-grind ===');
  const vid = pickVillager();
  const t0 = trustOf(vid);
  let convos = 0, totalChoices = 0, emptyMenus = 0;
  for (let i = 0; i < 8; i++) {
    const st = Game.startConvo(vid);
    if (!st) { console.log('startConvo returned falsy'); break; }
    convos++;
    // drive 4 exchanges picking first non-leave choice
    for (let e = 0; e < 4; e++) {
      let ch;
      try { ch = Game.convoChoices(vid); } catch (err) { console.log('convoChoices threw:', err.message); break; }
      totalChoices++;
      if (!ch || !ch.length) { emptyMenus++; break; }
      const pick = ch.find(c => c.id !== 'leave') || ch[0];
      try { Game.convoTurn(vid, pick.id); } catch (err) { console.log('convoTurn threw:', pick.id, err.message); break; }
    }
    try { Game.endConvo(vid, 'natural'); } catch (err) { console.log('endConvo threw:', err.message); }
    // hostile: immediate re-engage (no cooldown respect)
  }
  const t1 = trustOf(vid);
  console.log(`convos=${convos} choiceCalls=${totalChoices} emptyMenus=${emptyMenus} trust ${t0} -> ${t1} (delta ${t1 - t0})`);
  console.log(emptyMenus > 0 ? 'SOFTLOCK-RISK: empty choice menu seen' : 'no empty menus');
  console.log(t1 - t0 > 15 ? 'BREAK: talk grind prints trust fast' : 'HELD: talk grind bounded');
}

// ---------- PROBE 4: gossip farm — player tells what they heard ----------
function probeGossip() {
  console.log('=== PROBE gossip-farm ===');
  const ids = villagers();
  if (ids.length < 2) { console.log('need 2 villagers, skip'); return; }
  const [a, b] = ids;
  const t0 = trustOf(a);
  // seed a juicy claim about b, then have player gossip to a repeatedly
  let farmed = 0;
  for (let i = 0; i < 6; i++) {
    try {
      if (Game.npcGossipAbout) {
        const g = Game.npcGossipAbout(a, b);
        if (g && g.line) farmed++;
      }
    } catch (e) { console.log('npcGossipAbout threw:', e.message); break; }
  }
  console.log(`npcGossipAbout returned lines ${farmed}/6 (null = clammed up or nothing to say)`);
  // player-side: does sharing gossip exist as a convo choice? scan
  Game.startConvo(a);
  const ch = Game.convoChoices(a) || [];
  const gossipish = ch.filter(c => /gossip|tell|heard|rumor|word/i.test(c.label || c.text || ''));
  console.log(`choice count=${ch.length}, gossip-flavored=${gossipish.length}`);
  gossipish.forEach(c => console.log('  gossip choice:', c.id, '—', (c.label || c.text || '').slice(0, 80)));
  try { Game.endConvo(a, 'left'); } catch (e) {}
  const t1 = trustOf(a);
  console.log(`trust with listener ${t0} -> ${t1}`);
}

// ---------- PROBE 5: menu builder — every villager, every state ----------
function probeMenus() {
  console.log('=== PROBE menu-builder (empty-menu softlock sweep) ===');
  const ids = villagers();
  let empty = 0, threw = 0, total = 0;
  for (const vid of ids.slice(0, 6)) {
    for (const mood of ['steady', 'scared', 'grieving', 'angry']) {
      try {
        const st = Game.startConvo(vid);
        total++;
        const ch = Game.convoChoices(vid);
        if (!ch || ch.length === 0) { empty++; console.log(`EMPTY MENU: ${vid} mood-sim=${mood}`); }
        Game.endConvo(vid, 'left');
      } catch (e) { threw++; console.log(`THREW: ${vid} ${e.message}`); }
    }
  }
  console.log(`menus checked=${total} empty=${empty} threw=${threw}`);
  console.log(empty === 0 && threw === 0 ? 'HELD: no softlock via empty menus' : 'BREAK: softlock surface found');
}

// ---------- PROBE 6: talk cap hardness — 25 convos, does it stop at 40? ----------
function probeTalkCap() {
  console.log('=== PROBE talk-cap-hardness ===');
  const vid = pickVillager();
  const t0 = trustOf(vid);
  let convos = 0;
  for (let i = 0; i < 25; i++) {
    const st = Game.startConvo(vid);
    if (!st) break;
    convos++;
    for (let e = 0; e < 6; e++) {
      const ch = Game.convoChoices(vid) || [];
      if (!ch.length) break;
      const pick = ch.find(c => c.id !== 'leave') || ch[0];
      const r = Game.convoTurn(vid, pick.id);
      if (r && r.ended) break;
    }
    try { Game.endConvo(vid, 'natural'); } catch (e) {}
  }
  const t1 = trustOf(vid);
  console.log(`convos=${convos} trust ${t0} -> ${t1}`);
  console.log(t1 <= 40 ? 'HELD: talk trust hard-caps at 40' : 'BREAK: talk pushed past 40!');
}

// ---------- PROBE 7: fear-comfort — one scare, how many comforts before gate closes? ----------
function probeFearComfort() {
  console.log('=== PROBE fear-comfort (one scare, no tampering after) ===');
  const vid = pickVillager();
  const n = Game.npcNeeds(vid);
  n.fear = 100; // a single scare event; then hands off
  const t0 = trustOf(vid);
  let oks = 0;
  for (let i = 0; i < 40; i++) {
    const r = Game.comfort(vid);
    if (r && r.ok) oks++; else break;
  }
  const t1 = trustOf(vid);
  console.log(`comforts=${oks} trust ${t0} -> ${t1} (delta ${t1 - t0}) final mood=${Game.npcMood(vid)} fear=${Math.round(Game.npcNeeds(vid).fear || 0)}`);
  console.log(oks >= 6 ? 'BREAK?: one scare farms ' + oks + ' comforts' : 'HELD: scare yields few comforts');
}

// ---------- PROBE 8: gossip with lies seeded — player-side rumor loop ----------
function probeRumor() {
  console.log('=== PROBE rumor-loop ===');
  const ids = (V().roster || []).filter(id => id !== Game.villagerId);
  const [a, b] = ids;
  // seed a lie for b so there's something to gossip about
  const lies = Game.npcLies(b) || {};
  const t0a = trustOf(a);
  Game.startConvo(a);
  let ch = Game.convoChoices(a) || [];
  const rumorish = ch.filter(c => /rumor|gossip|tell|heard|word|news/i.test((c.label || '') + (c.id || '')));
  console.log(`choices=${ch.length} rumor-flavored=${rumorish.length}`);
  rumorish.slice(0, 4).forEach(c => console.log('  ', c.id, '—', (c.label || '').slice(0, 70)));
  // try the rumor verb repeatedly if present
  let rumorTurns = 0;
  for (let i = 0; i < 5 && rumorish.length; i++) {
    const c = rumorish[0];
    try {
      const r = Game.convoTurn(a, c.id);
      rumorTurns++;
      if (r && r.ended) break;
      ch = Game.convoChoices(a) || [];
      const more = ch.filter(x => /rumor|gossip|tell|heard|word|news/i.test((x.label || '') + (x.id || '')));
      if (!more.length) break;
      rumorish[0] = more[0];
    } catch (e) { console.log('rumor turn threw:', e.message); break; }
  }
  try { Game.endConvo(a, 'left'); } catch (e) {}
  const t1a = trustOf(a);
  console.log(`rumor turns=${rumorTurns} listener trust ${t0a} -> ${t1a}`);
}

const which = process.argv[2] || 'all';
const probes = { comfort: probeComfort, comforthonest: probeComfortHonest, amends: probeAmends, talk: probeTalk, talkcap: probeTalkCap, fearcomfort: probeFearComfort, rumor: probeRumor, gossip: probeGossip, menus: probeMenus };
(async () => {
  try {
    await Game.init();
    Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    Game.depart();
    // quiet the chatter (after init; init may rely on say)
    Game.say = function () {};
    Game.save = function () {};
  } catch (e) {
    console.error('BOOT FAIL:', e.stack.split('\n').slice(0, 8).join('\n'));
    process.exit(1);
  }
  try {
    if (which === 'all') Object.values(probes).forEach(p => p());
    else (probes[which] || (() => console.log('unknown probe')))();
  } catch (e) {
    console.error('PROBE CRASH:', e.stack.split('\n').slice(0, 6).join('\n'));
    process.exit(2);
  }
  console.log('DONE seed=' + _s);
})();
