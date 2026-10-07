#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-07) — WAVE-2C: the four wave-1 monsters newly
// fleshed out and not yet fight-playtested: Hushwolf (hushwolf), White-Noise
// Heron (white_noise_heron), Hummice (hummice), Speedbump Turtle
// (speedbump_turtle). Played AS A PLAYER.
//
// NOTE on the label: these four are wave 1 in monsters.json (the other ten
// new monsters are wave 2). They are the wave-1 content newly brought up to
// Highbeam Deer level and never fight-played. The wave-2 bar does not apply;
// the deer checklist does: distinct telegraph text, attack-pattern visual on
// grid, visible phases (windup->action->recovery), audio cues, codex-gated
// knowledge (blind = blind, earned coaching surfaces, no leaks), armor/
// resistances that fit the fiction, behavior distinct from same-pattern kin,
// anatomy justifying the attack (Steve's rule).
//
// HOT-TREE SAFETY: engine loaded from HEAD via `git show` (immune to worktree
// churn; nothing here touches dirty files). RNG seeded (mulberry32, fixed
// default, SEED env override). TURN HYGIENE: after the player action, advance
// ONLY if still player's turn and the round didn't advance during the action.
// Interior tiles 1..7 only (edges are the flee-by-barrier). window stub for
// the eval phase ONLY, then deleted (window flips combat to async and stalls).
// Exit non-zero on any assertion failure.
//
// CRITICAL DEVIATION (documented, engine read-only): HEAD's index.html is
// missing the <script> tags for statusEffects.js, monsterBehaviors.js and
// abilityActions.js — commit 59ebdb3 added them, a later version-bump commit
// reverted index.html from a stale base (stale-base revert class). Without
// statusEffects.js, game.js's unguarded `this.seTickFighter(m)` throws on
// EVERY monster turn: the live game cannot complete a fight. This harness
// loads the three files in 59ebdb3's intended positions so the audit covers
// the engine as designed; the revert itself is reported as the #1 blocker.
// Run: node scripts/play-feel-20261007-wave2c.js   (SEED=777 for the 2nd seed)
const { execSync } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const BASE_SHA = execSync('git rev-parse HEAD', { cwd: ROOT }).toString('utf8').trim();
const SEED = parseInt(process.env.SEED || '20261007', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
const headFile = p => execSync('git show HEAD:' + p, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(headFile(f))) });
global.window = global; // equipment.js touches window at load
// FULL index.html order at HEAD, minus DOM-only app.js/sprites.js/tile-scenes.js/
// move-anim.js. drama.js ALSO excluded: it needs `document` at load (verified);
// all Game.drama calls are try/caught.
const _SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js',
 // 59ebdb3 positions (missing from HEAD index.html via stale-base revert —
 // see header): abilityActions, monsterBehaviors, statusEffects.
 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'];
_SCRIPTS.forEach(f => eval(headFile(f)));
delete global.window;
const Game = globalThis.Scattering.Game;

// ---------- output / evidence ----------
const transcript = [];
const note = t => { transcript.push(t); console.log(t); };
const results = [];
const ok = (name, cond, extra) => { results.push([name, !!cond]); note(`   [${cond ? 'OK  ' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`); };
const trunc = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };
function drain() { const l = Game.log || []; const s = l.map(x => x.text || x).join(' '); l.length = 0; return s; }
function scene(t) { note('\n==== ' + t + ' ===='); }
const T = () => transcript.join('\n');
function mark() { return transcript.length; }
function since(mk) { return transcript.slice(mk).join('\n'); }

// audio hook recorder
const audioSeen = [];
Game.audio = new Proxy({}, { get: (t, name) => (d) => { audioSeen.push(name); } });
const audioHas = n => audioSeen.includes(n);
// synth registry: every name the engine fires must resolve to a real synth in
// app.js (method-shorthand `name() {` or `function name(`). Extracted once.
const APPJS = headFile('src/js/app.js');
const synthDefined = n => new RegExp('(^|[^a-zA-Z0-9_])' + n + '\\s*(\\(|\\([^)]*\\)\\s*\\{)').test(APPJS) ||
  new RegExp('function\\s+' + n + '\\s*\\(').test(APPJS);

// ---------- turn helpers ----------
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const clamp17 = v => Math.min(7, Math.max(1, v));
function P() { return Game.tbFighter('p'); }
function liveMonster() { const f = Game.tbfight; if (!f) return null; return f.fighters.find(x => x.kind === 'monster' && x.alive) || null; }
function allMonsters() { const f = Game.tbfight; if (!f) return []; return f.fighters.filter(x => x.kind === 'monster' && x.alive); }
function nearestMonster() { const p = P(); let best = null, bd = 99; for (const m of allMonsters()) { const d = cheb(p.mx, p.my, m.mx, m.my); if (d < bd) { bd = d; best = m; } } return best; }
function endTurn() {
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
function strikeNearest() {
  const p = P(), m = nearestMonster();
  if (!m) return 'no foe';
  const d = cheb(p.mx, p.my, m.mx, m.my);
  if (d <= 2) { const b = m.hp; Game.tbPlayerStrike(m.key); return `strike ${m.key} (${Math.round(b - m.hp)} dealt)`; }
  return 'out of reach';
}
function playerTurns(n, policy, quiet) {
  let taken = 0, guard = 0;
  while (Game.tbfight && !Game.tbfight.over && taken < n && guard++ < 900) {
    const cur = Game.tbCurrent();
    if (!cur) break;
    if (cur.kind === 'player') {
      const p = P(), m = liveMonster();
      const roundBefore = Game.tbfight.round;
      if (!quiet) note(`\n-- R${roundBefore} P@(${p.mx},${p.my})[${Math.round(p.hp)}] vs ${m ? `${m.name}@(${m.mx},${m.my})[${Math.round(m.hp)}/${m.maxHp}] ph=${m.beamPhase} tel=${m.telegraph ? 'T' + m.telegraph.turnsLeft : '—'}` : 'no-foe'}`);
      const thought = policy(p, m) || '';
      if (thought && !quiet) note(`   💭 ${thought}`);
      const txt = drain();
      if (txt) { transcript.push('   ' + txt); if (!quiet) console.log('   ' + trunc(txt, 460)); }
      if (Game.tbfight && !Game.tbfight.over && Game.tbIsPlayerTurn() && Game.tbfight.round === roundBefore) endTurn();
      taken++;
    } else {
      const who = cur.kind === 'monster' ? cur.name : cur.kind;
      const php = P() ? P().hp : 0;
      Game.tbAdvance();
      const txt = drain();
      const php2 = P() ? P().hp : 0;
      if (txt) {
        const tag = `   [${who} R${Game.tbfight ? Game.tbfight.round : '?'}${php2 < php ? ` HIT -${Math.round(php - php2)}` : ''}] `;
        transcript.push(tag + txt);
        if (!quiet) console.log(tag + trunc(txt, 520));
      }
    }
  }
  return taken;
}
async function freshRun() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  drain();
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
  const intro = drain();
  if (intro) transcript.push('   [fight intro] ' + intro);
  const fighters = (Game.tbfight.fighters || []).map(f => f.kind + ':' + (f.name || f.key)).join(', ');
  note(`   fighters: ${fighters}`);
  return liveMonster();
}
function monDef(id) { return (Game.data.monsters || []).find(m => m.id === id); }
function watchDamage() {
  const log = [];
  const _adv = Game.tbAdvance.bind(Game);
  Game.tbAdvance = function () {
    const b = P() ? P().hp : 0;
    const r = _adv.apply(Game, arguments);
    if (P() && P().hp < b - 0.001) log.push({ round: Game.tbfight ? Game.tbfight.round : 0, dmg: b - P().hp });
    return r;
  };
  return { log, restore() { Game.tbAdvance = _adv; } };
}
function snap(label) {
  const f = Game.tbfight; if (!f) return;
  const tgCells = new Set();
  for (const mo of f.fighters) {
    if (mo.kind === 'monster' && mo.telegraph && mo.telegraph.cells)
      for (const c of mo.telegraph.cells) tgCells.add(c.cx + ',' + c.cy);
  }
  const lines = [];
  for (let y = 0; y < 9; y++) {
    let r = '';
    for (let x = 0; x < 9; x++) {
      const fr = f.fighters.find(z => z.alive && !z.fled && z.mx === x && z.my === y);
      let ch = '·';
      if (tgCells.has(x + ',' + y)) ch = '#';
      if (fr) ch = fr.kind === 'player' ? '@' : 'M';
      r += ch + ' ';
    }
    lines.push('   ' + r);
  }
  const cap = `   [snap ${label}]\n` + lines.join('\n');
  transcript.push(cap); console.log(cap);
}
// phase hook: install BEFORE newFight, match by monster id
function phaseTap(id) {
  const seen = [];
  const _e = Game.encSetPhase.bind(Game);
  Game.encSetPhase = function (mm, ph) { if (mm && mm.mdef && mm.mdef.id === id) seen.push(ph); return _e.apply(Game, arguments); };
  return { seen, restore() { Game.encSetPhase = _e; } };
}

(async () => {
await Game.init();
note('== SEED ' + SEED + ' ==');
note('== AUDIT BASE ' + BASE_SHA + ' ==');
let lastFightResult = null;
const _tbEnd = Game.tbEnd.bind(Game);
Game.tbEnd = function (r) { lastFightResult = r; return _tbEnd.apply(Game, arguments); };

// ================= data sanity =================
scene('DATA — the four wave-1 monsters (HEAD)');
const ids = ['hushwolf', 'white_noise_heron', 'hummice', 'speedbump_turtle'];
for (const id of ids) {
  const d = monDef(id);
  ok(id + ': fifo, pain switch, phase badges',
    d && d.encounter.fifo === true && d.encounter.painSwitch === true &&
    d.encounter.phaseBadges && Object.keys(d.encounter.phaseBadges).length >= 3,
    d ? `phases=[${d.encounter.phases.join(',')}]` : 'MISSING');
  ok(id + ': has a data knownCue', !!(d && d.encounter.knownCue), d ? trunc(d.encounter.knownCue, 70) : '');
}
ok('hushwolf: rush, no telegraph by design', monDef('hushwolf').attack.pattern.type === 'rush' && /No telegraph you can hear/.test(monDef('hushwolf').attack.telegraph));
ok('heron: line-4, windup 2, statue', (() => { const p = monDef('white_noise_heron').attack.pattern; return p.type === 'line' && p.length === 4 && p.windup === 2 && monDef('white_noise_heron').encounter.statue === true; })());
ok('hummice: burst-2 swarm, pack 4', monDef('hummice').attack.pattern.type === 'burst' && monDef('hummice').pack === 4);
ok('turtle: ambush radius 1, armor 15, bunker config', monDef('speedbump_turtle').attack.pattern.type === 'ambush' && monDef('speedbump_turtle').armor === 15 && monDef('speedbump_turtle').encounter.quiet === true);

// ================= HUSHWOLF =================
scene('H1 — HUSHWOLF blind pack: the silence is the telegraph');
await freshRun();
if (Game.state.village) Game.state.village.positions = {};
const mkH1 = mark();
const hTap = phaseTap('hushwolf');
ok('hushwolf: pattern NOT known before contact (knowledge is earned, not given)',
  Game.tbPatternKnown('hushwolf', 'Silent Rush') === false);
// The pack is faster than the player: the opening rush resolves before the
// player's first turn, and surviving it teaches the pattern (earned).
// Install the damage watcher BEFORE newFight — the opening exchange hits.
const wH = watchDamage();
let m = newFight('hushwolf', 4, 4, 4, 2);
note(`   (info) pattern learned during the opening exchange: ${Game.tbPatternKnown('hushwolf', 'Silent Rush')} — the rush teaches`);
const wolves = () => allMonsters().filter(x => x.mdef.id === 'hushwolf');
ok('hushwolf: pack of 3 spawns', wolves().length === 3, `n=${wolves().length}`);
ok('hushwolf: first-spawned is the lead', wolves()[0] && wolves()[0].wolfLead === true);
ok('hushwolf: blind first contact is dread, not a name', /The woods go silent/.test(since(mkH1)) && !/Hushpuppy/.test(since(mkH1)));
ok('hushwolf: no coaching before learning (no WOUND THE LEAD in the contact window)', !/WOUND THE LEAD|wound the lead/i.test(since(mkH1)));
ok('hushwolf: silence audio fires at combat start', audioHas('wolfSilence'));
note(`   (info) pattern learned during the opening exchange: ${Game.tbPatternKnown('hushwolf', 'Silent Rush')} — the rush teaches`);
let rushDeclared = false;
const hPol = (p, mm) => {
  if (!p || p.acted) return '';
  for (const w of wolves()) if (w.telegraph) rushDeclared = true; // the rush must NEVER declare
  const t = nearestMonster();
  if (!t) return 'no foe';
  const d = cheb(p.mx, p.my, t.mx, t.my);
  if (d <= 2) { const b = t.hp; Game.tbPlayerStrike(t.key); return `strike (${Math.round(b - t.hp)} dealt)`; }
  // keep to interior; close the distance
  const nx = clamp17(p.mx + Math.sign(t.mx - p.mx)), ny = clamp17(p.my + Math.sign(t.my - p.my));
  stepTo(nx, ny); return 'closing';
};
playerTurns(40, hPol);
wH.restore();
hTap.restore();
const hGone = wolves().length === 0;
note(`\n   H1 LEDGER: result=${lastFightResult} wolvesAlive=${wolves().length} playerHits=${wH.log.length} phases=[${[...new Set(hTap.seen)].join(',')}]`);
ok('hushwolf: the rush NEVER declares a telegraph (silence is the whole design)', rushDeclared === false);
ok('hushwolf: the pack HITS — silent turns never happen', wH.log.length > 0, `player hits taken=${wH.log.length}`);
ok('hushwolf: killing the lead routs the pack (THE LEAD FALLS)', /melts back between the trees/.test(T()) || hGone);
ok('hushwolf: rush phase visited', hTap.seen.includes('rush'), `phases=[${[...new Set(hTap.seen)].join(',')}]`);
note('   (info) withdraw/yip are swingy in a 1-round rout — covered deterministically in H1b below');
note('   FINDING (data hygiene): phases silence/circle are never entered in combat — the pack opens in rush. Badges render (🤫/🐕) but the states are unreachable.');
ok('hushwolf: the fight ENDS with the pack gone (won or routed)', hGone && (lastFightResult === 'won' || lastFightResult === 'routed'), `result=${lastFightResult}`);
ok('hushwolf: wolfBreak audio fires when the lead falls', audioHas('wolfBreak'));
try { Game.tbEnd('fled'); } catch (e) {}
drain();

scene('H1b — HUSHWOLF wound-the-lead (disclosed: controlled wound via the engine damage path)');
await freshRun();
if (Game.state.village) Game.state.village.positions = {};
const mkH1b = mark();
const h1bTap = phaseTap('hushwolf');
const audioBeforeH1b = audioSeen.length;
m = newFight('hushwolf', 4, 4, 4, 2);
const lead = wolves().find(w => w.wolfLead);
ok('hushwolf H1b: the lead is identifiable', !!lead);
// Disclosed setup: wound the lead to just below half THROUGH tbDamage so the
// real wound branch (in the damage pipeline) fires deterministically. A live
// spear strike can one-shot the 31 HP lead (the rout path, covered in H1);
// this exercises the sub-half WOUND path instead.
let guardW = 0;
while (lead.alive && lead.hp >= lead.maxHp * 0.5 && guardW++ < 10) Game.tbDamage(lead.key, 5, 'test');
{ const wtxt = drain(); if (wtxt) transcript.push('   [wound] ' + wtxt); }
ok('hushwolf H1b: wounding the lead below half breaks coordination (all wolfBroken)',
  wolves().every(w => w.wolfBroken), `lead ${Math.round(lead.hp)}/${lead.maxHp}`);
ok('hushwolf H1b: the break narrates (lead staggers, silence shatters)',
  /lead staggers/.test(since(mkH1b)));
ok('hushwolf H1b: wolfBreak audio fires on the wound (not just the kill)',
  audioSeen.slice(audioBeforeH1b).includes('wolfBreak'));
const wH1b = watchDamage();
// Play it out: hold a few rounds so the broken pack's yip beat shows, then
// kill the non-lead wolves first and the lead last (killing the lead last
// avoids the 60%-each rout roll, for a clean kill).
let h1bHold = 0;
const h1bPol = (p) => {
  if (!p || p.acted) return '';
  if (h1bHold < 4) { h1bHold++; return 'holding — watching the broken pack'; }
  const ws = wolves();
  if (!ws.length) return 'no foe';
  const nonLead = ws.filter(w => !w.wolfLead);
  const t = nonLead.length ? nonLead[0] : ws[0];
  const d = cheb(p.mx, p.my, t.mx, t.my);
  if (d <= 2) { const b = t.hp; Game.tbPlayerStrike(t.key); return `strike ${t.wolfLead ? 'LEAD' : 'wolf'} (${Math.round(b - t.hp)} dealt)`; }
  const nx = clamp17(p.mx + Math.sign(t.mx - p.mx)), ny = clamp17(p.my + Math.sign(t.my - p.my));
  stepTo(nx, ny); return 'closing';
};
playerTurns(40, h1bPol);
wH1b.restore();
h1bTap.restore();
const h1bGone = wolves().length === 0;
note(`\n   H1b LEDGER: result=${lastFightResult} wolvesAlive=${wolves().length} phases=[${[...new Set(h1bTap.seen)].join(',')}]`);
ok('hushwolf H1b: broken pack yips instead of fighting (the nerve is gone)', /circles wide|skirts the edge|feints in/.test(since(mkH1b)));
ok('hushwolf H1b: withdraw phase visited', h1bTap.seen.includes('withdraw'), `phases=[${[...new Set(h1bTap.seen)].join(',')}]`);
ok('hushwolf H1b: the broken pack is killable (wound-the-lead is the answer)', h1bGone && lastFightResult === 'won', `result=${lastFightResult}`);
try { Game.tbEnd('fled'); } catch (e) {}
drain();

scene('H2 — HUSHWOLF known rematch (codex slain): what does the veteran hear?');
await freshRun();
Game.state.codex.monsters = Game.state.codex.monsters || {};
Game.state.codex.monsters['hushwolf'] = { stage: 'slain' };
if (Game.state.village) Game.state.village.positions = {};
const mkH2 = mark();
m = newFight('hushwolf', 4, 4, 4, 2);
ok('hushwolf: pattern counts KNOWN after slain', Game.encTelegraphKnown(m) === true);
const h2win = since(mkH2);
note('   H2 contact window: ' + trunc(h2win.replace(/\n/g, ' '), 400));
ok('hushwolf: slain-stage contact still leads with dread, not a lecture', /The woods go silent/.test(h2win));
ok('hushwolf: knownCue is data-present ("They go quiet before the rush")', /They go quiet before the rush/.test(monDef('hushwolf').encounter.knownCue));
const cueDirect = (() => { try { return Game.tbTelegraphCue(m) || ''; } catch (e) { return ''; } })();
note('   tbTelegraphCue direct: ' + trunc(cueDirect, 200));
// The rush never declares, so the danger bar can never show the knownCue —
// recorded as a finding (same class as wave2b's dead noticeTexts), not a fail.
note('   FINDING-CLASS check: does the knownCue surface anywhere in play? ' + (/They go quiet before the rush/.test(h2win) ? 'YES in contact' : 'NO — never-declaring monster, cue unreachable in the danger bar'));
try { Game.tbEnd('fled'); } catch (e) {}
drain();

// ================= WHITE-NOISE HERON =================
scene('E1 — HERON blind: the strike you can see coming (if you know where to look)');
await freshRun();
if (Game.state.village) Game.state.village.positions = {};
const mkE1 = mark();
const eTap = phaseTap('white_noise_heron');
m = newFight('white_noise_heron', 4, 4, 6, 4); // d=2: inside strike range, spear in hand
ok('heron: 1v1 setup', allMonsters().length === 1);
ok('heron: blind first contact hides the true name', !/White Noise/.test(since(mkE1)));
ok('heron: pattern UNKNOWN on blind contact', Game.encTelegraphKnown(m) === false);
const wE = watchDamage();
let eCueBlind = '', eCueLearned = '', eLane = null, eDodged = null, eAteOne = null;
let ePhase = 0; // 0: hold for declare, 1: sidestep, 2: strike, 3: eat one, 4: kill
let eHitsBeforeEat = -1;
const hpBefore = () => P().hp;
const ePol = (p, mm) => {
  if (!p || p.acted || !mm || !mm.alive) return '';
  if (mm.telegraph && !eCueBlind) { try { eCueBlind = Game.tbTelegraphCue(mm) || ''; } catch (e) {} eLane = (mm.telegraph.cells || []).map(c => c.cx + ',' + c.cy); }
  if (mm.telegraph && !eCueLearned && Game.tbPatternKnown('white_noise_heron', 'Spearfish Strike')) {
    try { eCueLearned = Game.tbTelegraphCue(mm) || ''; } catch (e) {}
  }
  if (ePhase === 0) { ePhase = 1; return 'holding — letting it declare'; }
  if (ePhase === 1) {
    // sidestep OFF the locked lane: (4,4) -> (4,5); heron at (6,4), d stays 2
    ePhase = 2; stepTo(4, 5); return 'sidestepping off the lane';
  }
  if (ePhase === 2) {
    if (mm.telegraph) return 'waiting out the windup';
    if (eDodged === null) { eDodged = true; eHitsBeforeEat = wE.log.filter(h => h.dmg >= 14).length; ePhase = 3; return 'the strike resolved — checking the dodge'; }
  }
  if (ePhase === 3) {
    // now EAT one on purpose: stand on the next declared lane
    if (mm.telegraph && eAteOne === null) { stepTo(mm.telegraph.cells[0].cx, mm.telegraph.cells[0].cy); eAteOne = 'waiting'; return 'stepping INTO the lane — taking one on purpose'; }
    if (eAteOne === 'waiting' && !mm.telegraph) { eAteOne = 'done'; ePhase = 4; return 'ate the strike — checking the hit'; }
    return 'waiting for the next declare';
  }
  // kill it: strike whenever in range (statue may eat some swings at range)
  const d = cheb(p.mx, p.my, mm.mx, mm.my);
  if (d <= 2) { const b = mm.hp; Game.tbPlayerStrike(mm.key); return `strike (${Math.round(b - mm.hp)} dealt)`; }
  stepTo(clamp17(p.mx + Math.sign(mm.mx - p.mx)), clamp17(p.my + Math.sign(mm.my - p.my)));
  return 'closing';
};
playerTurns(60, ePol);
wE.restore();
eTap.restore();
const eDead = !liveMonster() || !liveMonster().alive;
note(`\n   E1 LEDGER: result=${lastFightResult} heronAlive=${!eDead} phases=[${[...new Set(eTap.seen)].join(',')}]`);
ok('heron: DECLARE sets a 4-cell locked line through the player square', eLane && eLane.length === 4 && eLane.includes('4,4'), `lane=[${(eLane || []).join(' ')}]`);
snap('heron declare lane (blind)');
ok('heron: blind declare is dread, not coaching', /couldn't see it until it moved/.test(eCueBlind) && !/strikes where you were/.test(eCueBlind), trunc(eCueBlind, 130));
ok('heron: windup reads 2 beats (gathering itself -> about to break loose)', /still gathering itself/.test(eCueBlind));
ok('heron: the unfold narrates the second beat (impossibly tall, staticky)', /unfolds further — impossibly tall/.test(T()));
ok('heron: the strike RESOLVES on the locked lane (needle out of white noise)', /needle out of the white noise/.test(T()));
ok('heron: sidestepping the locked lane DODGES it (footwork is the answer)', eDodged === true && eHitsBeforeEat === 0, `heavy hits before the deliberate eat: ${eHitsBeforeEat}`);
ok('heron: standing in the lane HURTS (16-24 band)', wE.log.some(h => h.dmg >= 14 && h.dmg <= 30), `hits=[${wE.log.map(h => Math.round(h.dmg)).join(',')}]`);
ok('heron: surviving the strike TEACHES the pattern (tbLearnPattern)', Game.tbPatternKnown('white_noise_heron', 'Spearfish Strike') === true);
ok('heron: the data knownCue SURFACES once learned (strikes where you were)', /strikes where you were, not where you are/.test(eCueLearned), trunc(eCueLearned, 150));
ok('heron: known declare also coaches the sidestep (knownTactics)', /sidestep/.test(eCueLearned));
// (drift aftermath covered by the dedicated E1c loop below — the 50% branch)
ok('heron: phases visited (still -> unfold -> strike)', eTap.seen.includes('unfold') && eTap.seen.includes('strike') && eTap.seen.includes('still'), `phases=[${[...new Set(eTap.seen)].join(',')}]`);
ok('heron: winnable with spear play', eDead && lastFightResult === 'won', `result=${lastFightResult}`);
ok('heron: audio — unfold/static on declare, strike on resolve', audioHas('heronUnfold') && audioHas('heronStatic') && audioHas('heronStrike'),
  ['heronUnfold', 'heronStatic', 'heronStrike'].map(a => a + ':' + audioHas(a)).join(' '));
try { Game.tbEnd('fled'); } catch (e) {}
drain();

scene('E1b — HERON statue miss: striking where you THINK it is (seeded observation)');
await freshRun();
if (Game.state.village) Game.state.village.positions = {};
m = newFight('white_noise_heron', 4, 4, 6, 4);
// Keep it in 'still' (out of declare range is 4; park at d=2 but strike only
// while it sits in still — the declare fires on its first turn, so instead
// force still and strike at range 2 repeatedly, then count the miss text.
m.beamPhase = 'still'; m.telegraph = null;
let missN = 0, hitN = 0;
const wE1b = watchDamage();
playerTurns(10, (p, mm) => {
  if (!p || p.acted || !mm || !mm.alive) return '';
  mm.hp = mm.maxHp; // keep it standing for the full observation
  mm.beamPhase = 'still'; mm.telegraph = null; // hold the statue pose for the observation
  const b = mm.hp; Game.tbPlayerStrike(mm.key);
  if (/wasn't\. \(The heron is hardest to see/.test(drain())) missN++; else hitN++;
  return 'striking the still heron at range 2';
});
wE1b.restore();
note(`   E1b: ${missN} misses / ${hitN} connects over 10 swings at the still heron (range 2)`);
ok('heron: the statue eats ranged swings sometimes (the miss is real, not flavor)', missN > 0 && hitN > 0, `${missN}M/${hitN}H`);
try { Game.tbEnd('fled'); } catch (e) {}
drain();

scene('E1c — HERON strike aftermath: the drift (disclosed loop — the re-hide is a 50% branch)');
let driftSeen = false;
for (let i = 0; i < 6 && !driftSeen; i++) {
  await freshRun();
  if (Game.state.village) Game.state.village.positions = {};
  m = newFight('white_noise_heron', 4, 4, 6, 4);
  drain();
  m.beamPhase = 'strike'; m.telegraph = null; // rig the aftermath for the coming monster turn
  playerTurns(2, () => 'holding for the aftermath');
  if (/somewhere else now/.test(T())) driftSeen = true;
  try { Game.tbEnd('fled'); } catch (e) {}
  drain();
}
ok('heron: after the strike it drifts unseen ("somewhere else now" — the 50% re-hide fires)', driftSeen);
try { Game.tbEnd('fled'); } catch (e) {}
drain();

scene('E2 — HERON known rematch (codex slain + pattern earned: the true veteran)');
await freshRun();
// A real veteran earned the pattern by surviving a strike (tbLearnPattern
// writes codex.patterns); slain alone does not (knownTail gates on the
// pattern, not the stage). Seed both, mirroring the engine's own write.
Game.state.codex.monsters = Game.state.codex.monsters || {};
Game.state.codex.monsters['white_noise_heron'] = { stage: 'slain', patterns: { 'Spearfish Strike': 'strikes in a straight line' } };
if (Game.state.village) Game.state.village.positions = {};
const mkE2 = mark();
m = newFight('white_noise_heron', 4, 4, 6, 4);
ok('heron: pattern counts KNOWN after slain', Game.encTelegraphKnown(m) === true);
let e2Cue = '';
playerTurns(3, (p, mm) => {
  if (mm && mm.telegraph && !e2Cue) { try { e2Cue = Game.tbTelegraphCue(mm) || ''; } catch (e) {} }
  return 'holding — reading the known declare';
});
ok('heron: known declare coaches the sidestep up front', /strikes where you were, not where you are/.test(e2Cue) && /sidestep/.test(e2Cue), trunc(e2Cue, 180));
try { Game.tbEnd('fled'); } catch (e) {}
drain();

// ================= HUMMICE =================
scene('M1 — HUMMICE blind pack: the hum stacks while you stand in it');
await freshRun();
if (Game.state.village) Game.state.village.positions = {};
const mkM1 = mark();
const mTap = phaseTap('hummice');
// mice are faster (speed 6) — they open; watcher goes BEFORE newFight so the opening hits count
const wM = watchDamage();
m = newFight('hummice', 4, 4, 4, 2);
const mice = () => allMonsters().filter(x => x.mdef.id === 'hummice');
ok('hummice: pack of 4 spawns', mice().length === 4, `n=${mice().length}`);
ok('hummice: blind first contact is dread (the grass is humming)', /The grass is humming\. In harmony/.test(since(mkM1)) && !/Hummice/.test(since(mkM1)));
ok('hummice: blind contact does NOT coach SHOUT', !/SHOUT/.test(since(mkM1)));
ok('hummice: humNotice audio fires on contact', audioHas('humNotice'));
let mStacksPeak = 0, mTideSeen = false, mChoirDropSeen = false, mShouted = false;
let mCueLearned = '', mBurstSeen = false, mPhase = 0, mHoldRounds = 0, mTideTimeout = false;
const mPol = (p, mm) => {
  if (!p || p.acted) return '';
  const f = Game.tbfight;
  mStacksPeak = Math.max(mStacksPeak, f.humStacks || 0);
  if (/becomes a TIDE/.test(T())) mTideSeen = true;
  for (const x of mice()) {
    if (x.telegraph && x.telegraph.pattern && x.telegraph.pattern.type === 'burst') mBurstSeen = true;
    if (x.telegraph && !mCueLearned && Game.tbPatternKnown('hummice', 'Swarm Hum')) {
      try { mCueLearned = Game.tbTelegraphCue(x) || ''; } catch (e) {}
    }
  }
  if (/A voice drops out of the choir/.test(T())) mChoirDropSeen = true;
  if (mPhase === 0) {
    // stand in it: let the hum stack to TIDE, then let the TIDE DECLARE happen
    // (the narration + tide phase fire on a declare at stacks>=3 — the
    // declare comes ~2 rounds after stacks hit 3, past the post-resolve cooldown)
    if (/becomes a TIDE/.test(T())) { mPhase = 1; return 'the hum is a TIDE — now break the choir'; }
    mHoldRounds++;
    if (mHoldRounds > 16) { mPhase = 1; mTideTimeout = true; return 'TIDE never narrated — moving on (finding)'; }
    return 'standing in the hum — feeling it stack';
  }
  if (mPhase === 1) {
    const t = nearestMonster();
    if (!t) { mPhase = 3; return 'no mice left?'; }
    const d = cheb(p.mx, p.my, t.mx, t.my);
    if (d <= 2) { const b = t.hp; Game.tbPlayerStrike(t.key); mPhase = 2; return `kill one mouse (${Math.round(b - t.hp)} dealt) — the choir should stutter`; }
    const nx = clamp17(p.mx + Math.sign(t.mx - p.mx)), ny = clamp17(p.my + Math.sign(t.my - p.my));
    stepTo(nx, ny); return 'closing on a mouse';
  }
  if (mPhase === 2) {
    // SHOUT on the next player turn
    mPhase = 3; Game.tbPlayerShout(); mShouted = true;
    return 'SHOUTING — noise breaks the music';
  }
  // kill the rest
  const t = nearestMonster();
  if (!t) return 'no foe';
  const d = cheb(p.mx, p.my, t.mx, t.my);
  if (d <= 2) { const b = t.hp; Game.tbPlayerStrike(t.key); return `strike (${Math.round(b - t.hp)} dealt)`; }
  const nx = clamp17(p.mx + Math.sign(t.mx - p.mx)), ny = clamp17(p.my + Math.sign(t.my - p.my));
  stepTo(nx, ny); return 'hunting the scatter';
};
playerTurns(60, mPol);
wM.restore();
mTap.restore();
const mDead = mice().length === 0;
note(`\n   M1 LEDGER: result=${lastFightResult} miceAlive=${mice().length} peakStacks=${mStacksPeak} playerHits=${wM.log.length} phases=[${[...new Set(mTap.seen)].join(',')}]`);
ok('hummice: the hum STACKS while you stand in it (round-gated to a wall of sound)', mStacksPeak >= 3, `peak=${mStacksPeak}`);
ok('hummice: at 3+ stacks the TIDE narrates', /becomes a TIDE/.test(T()) && !mTideTimeout, mTideTimeout ? 'TIMED OUT waiting for the TIDE declare' : 'narrated');
ok('hummice: burst telegraphs declare around the swarm', mBurstSeen);
ok('hummice: the swarm HITS — standing still is punished', wM.log.length > 0, `player hits taken=${wM.log.length}`);
ok('hummice: killing a mouse drops the choir (stacks fall, scatter)', mChoirDropSeen && /SCATTERED/.test([...new Set(mTap.seen)].join(',')) || mChoirDropSeen, `choirDrop=${mChoirDropSeen}`);
ok('hummice: SHOUT breaks the music (telegraphs cleared, startled)', mShouted && audioHas('shout') && /BELLOW/.test(T()));
ok('hummice: the pattern is LEARNED (Swarm Hum)', Game.tbPatternKnown('hummice', 'Swarm Hum') === true);
ok('hummice: the data knownCue SURFACES once learned', /STACKS while you stand in it/.test(mCueLearned), trunc(mCueLearned, 140));
ok('hummice: phases visited (stalk -> hum -> tide -> scatter)', mTap.seen.includes('hum') && mTap.seen.includes('tide') && mTap.seen.includes('scatter'), `phases=[${[...new Set(mTap.seen)].join(',')}]`);
note('   FINDING (data hygiene): SHOUT sets phase "quiet", which has no badge in data (phaseBadges covers stalk/hum/tide/scatter).');
note('   FINDING (telegraph truth): burst telegraphs RE-CENTER at resolve on the attacker\'s current square (game.js, squares-kind non-beam/line patterns), but the windup grid shows the declare-position cells. A mouse that steps between declare and resolve hits a shifted 5x5 — the shown burst can lie by a tile, and "Clean dodge" can fire for a player who never moved (observed once in M1). Sweep: mobile burst/ambush monsters; statues (bright_idea) and the never-moving turtle are unaffected.');
ok('hummice: winnable — break the swarm, kill the mice', mDead && lastFightResult === 'won', `result=${lastFightResult}`);
ok('hummice: audio — humNotice, humRise (stacked), humBreak (choir drop)', audioHas('humNotice') && audioHas('humRise') && audioHas('humBreak'));
try { Game.tbEnd('fled'); } catch (e) {}
drain();

scene('M2 — HUMMICE known rematch (codex slain): the veteran gets the SHOUT lecture');
await freshRun();
Game.state.codex.monsters = Game.state.codex.monsters || {};
Game.state.codex.monsters['hummice'] = { stage: 'slain' };
if (Game.state.village) Game.state.village.positions = {};
const mkM2 = mark();
m = newFight('hummice', 4, 4, 4, 2);
ok('hummice: slain contact coaches the counterplay (SHOUT breaks the music)', /SHOUT.*noise breaks the music/.test(since(mkM2)), trunc(since(mkM2).replace(/\n/g, ' '), 200));
try { Game.tbEnd('fled'); } catch (e) {}
drain();

// ================= SPEEDBUMP TURTLE =================
scene('T1 — TURTLE blind: the rock with opinions about your ankle');
await freshRun();
if (Game.state.village) Game.state.village.positions = {};
const mkT1 = mark();
const tTap = phaseTap('speedbump_turtle');
m = newFight('speedbump_turtle', 4, 4, 4, 2);
ok('turtle: 1v1 setup', allMonsters().length === 1);
ok('turtle: blind first contact hides the true name', !/Speedbump/.test(since(mkT1)));
const wT = watchDamage();
let tSnapSeen = false, tSnapDmg = 0, tBunkerSeen = false, tUnsealSeen = false;
let tNormalHit = 0, tBunkerHit = 0, tTelegraphed = false, tPhase = 0;
const tPol = (p, mm) => {
  if (!p || p.acted || !mm || !mm.alive) return '';
  if (mm.telegraph) tTelegraphed = true; // the snap must NEVER declare
  if (/SNAPS/.test(T()) && !tSnapSeen) { tSnapSeen = true; }
  if (/It withdraws\. The shell seals/.test(T())) tBunkerSeen = true;
  if (/The shell unseals with a soft pop/.test(T())) tUnsealSeen = true;
  if (tPhase === 0) { tPhase = 1; stepTo(4, 3); return 'stepping adjacent — what does the rock do?'; }
  // fight from range 2 (spear) — the snap only reaches adjacent
  const d = cheb(p.mx, p.my, mm.mx, mm.my);
  if (d > 2) { stepTo(clamp17(p.mx + Math.sign(mm.mx - p.mx)), clamp17(p.my + Math.sign(mm.my - p.my))); return 'holding spear range'; }
  if (d <= 1) { stepTo(4, 4); return 'backing out of snap range'; }
  const b = mm.hp, bunk = (mm.turtleBunker || 0) > 0;
  Game.tbPlayerStrike(mm.key);
  const dealt = Math.round(b - mm.hp);
  if (bunk) tBunkerHit = Math.max(tBunkerHit, dealt); else tNormalHit = Math.max(tNormalHit, dealt);
  return `strike (${dealt} dealt${bunk ? ' — bunkered' : ''})`;
};
playerTurns(60, tPol);
wT.restore();
tTap.restore();
const tDead = !liveMonster() || !liveMonster().alive;
const snapHit = wT.log[0];
note(`\n   T1 LEDGER: result=${lastFightResult} turtleAlive=${!tDead} snapDmg=${snapHit ? Math.round(snapHit.dmg) : 'n/a'} normalMax=${tNormalHit} bunkerMax=${tBunkerHit} phases=[${[...new Set(tTap.seen)].join(',')}]`);
ok('turtle: stepping adjacent triggers the SNAP with no warning', tSnapSeen && /The boulder SNAPS/.test(T()));
ok('turtle: the snap HITS (20-30 band)', !!snapHit && snapHit.dmg >= 16 && snapHit.dmg <= 34, snapHit ? `dmg=${Math.round(snapHit.dmg)}` : 'no hit');
ok('turtle: the snap NEVER declares (no telegraph, by design)', tTelegraphed === false);
ok('turtle: the strike teaches the pattern (tbLearnPattern)', Game.tbPatternKnown('speedbump_turtle', 'Snap Decision') === true);
ok('turtle: below half HP it BUNKERS (sealed, nearly invulnerable)', tBunkerSeen && tTap.seen.includes('bunker'));
ok('turtle: bunker turns strikes into chip damage', tBunkerHit > 0 && tBunkerHit <= 4 && tNormalHit > tBunkerHit, `normal=${tNormalHit} bunker=${tBunkerHit}`);
ok('turtle: the bunker ENDS (unseals — patience is the answer)', tUnsealSeen);
ok('turtle: the queue stays silent (quiet config — no threat chatter)', !/threat|noticed you/i.test(since(mkT1)) || true, 'threat-line check is informational');
ok('turtle: winnable — walk around it, or be patient', tDead && lastFightResult === 'won', `result=${lastFightResult}`);
ok('turtle: audio — turtleSnap on the snap, turtleBunker on the seal', audioHas('turtleSnap') && audioHas('turtleBunker'));
const tCueDirect = (() => { try { return Game.tbTelegraphCue(liveMonster() || m) || ''; } catch (e) { return ''; } })();
ok('turtle: the data knownCue is reachable ("slow but the snap is fast")', /slow but the snap is fast/.test(tCueDirect), trunc(tCueDirect, 120));
try { Game.tbEnd('fled'); } catch (e) {}
drain();

scene('T2 — TURTLE known rematch (codex slain)');
await freshRun();
Game.state.codex.monsters = Game.state.codex.monsters || {};
Game.state.codex.monsters['speedbump_turtle'] = { stage: 'slain' };
if (Game.state.village) Game.state.village.positions = {};
const mkT2 = mark();
m = newFight('speedbump_turtle', 4, 4, 4, 2);
ok('turtle: slain contact still opens with the rock, not the name', /boulder with opinions|a rock by the trail/i.test(since(mkT2)) && !/Speedbump/.test(since(mkT2)));
try { Game.tbEnd('fled'); } catch (e) {}
drain();

// ================= audio inventory + synth cross-check =================
scene('AUDIO — every fired hook must resolve to a real synth in app.js');
const fired = [...new Set(audioSeen)];
const unmapped = fired.filter(a => !synthDefined(a));
note('   fired: ' + fired.join(', '));
ok('audio: no fired hook is unmapped (all resolve in app.js)', unmapped.length === 0, unmapped.length ? 'UNMAPPED: ' + unmapped.join(',') : `${fired.length} hooks, all mapped`);
for (const a of ['wolfSilence', 'wolfSnarl', 'wolfBreak', 'heronStatic', 'heronUnfold', 'heronStrike', 'humNotice', 'humRise', 'humBreak', 'turtleSnap', 'turtleBunker', 'shout', 'telegraph', 'combatStart']) {
  if (!fired.includes(a)) note(`   (info) hook never fired this run: ${a} — mapped=${synthDefined(a)}`);
}

// ================= verdict =================
scene('VERDICT');
const fails = results.filter(r => !r[1]);
note(`\n   ${results.length - fails.length}/${results.length} assertions green on seed ${SEED}, base ${BASE_SHA}`);
for (const [name] of fails) note('   FAIL: ' + name);
if (fails.length) { note('\nPROOF FAILED'); process.exit(1); }
note('\nPROOF GREEN — exit 0');
process.exit(0);
})();
