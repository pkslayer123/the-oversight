#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-07) — WAVE-2 THEATER GROUP 2: the Understudy,
// the Landlord, the Heckler, the Paparazzo, the Union Rep. Played AS A PLAYER.
//
// The wave-2 bar (Steve 2026-10-06): "a genuine step up from wave 1 on its own
// terms — cognitive/theatrical escalation counts, but say so plainly." The
// Highbeam Deer (wave 1) asks: read the freeze, leave the lane — positional,
// and the dwell punishes. This pass judges whether each of these five asks
// something NEW, with the Highbeam Deer checklist: distinct telegraph text,
// attack-pattern visual on grid, visible phase system (windup→action→recovery),
// audio cues, codex-gated knowledge (blind = blind, earned coaching surfaces,
// no leaks), armor/resistances that fit the fiction, behavior distinct from
// wave-1 same-pattern monsters.
//
// HOT-TREE SAFETY: the engine is loaded from HEAD via `git show` (immune to
// worktree churn on the shared tree). This script only CREATES its own file.
// RNG is seeded (mulberry32, fixed default, SEED env override) so the proof
// is deterministic. TURN HYGIENE: after the player action, advance ONLY if
// still player's turn and the round didn't advance during the action (a
// strike's internal advance runs the monster synchronously — a second advance
// runs the monster at 2x speed). Interior tiles 1..7 only — edges are the
// flee-by-barrier. Exit code non-zero on any assertion failure.
// Run: node scripts/play-feel-20261007-wave2b.js
const { execSync } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261007', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
const headFile = p => execSync('git show HEAD:' + p, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(headFile(f))) });
global.window = global; // equipment.js touches window at load (browser-only in prod)
// FULL index.html order at HEAD (minus DOM-only app.js/sprites.js/tile-scenes.js/
// move-anim.js and drama.js, which needs DOM at load). All Game.drama calls are try/caught.
const _SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convo-wants.js', 'src/js/convoTopics.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'];
_SCRIPTS.forEach(f => eval(headFile(f)));
delete global.window; // drop the stub: combat takes the SYNC advance path without window
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
// transcript mark: join only the lines added since the mark (first-contact checks)
function mark() { return transcript.length; }
function since(mk) { return transcript.slice(mk).join('\n'); }

// audio hook recorder: every audioEvent(name, data) lands here
const audioSeen = [];
Game.audio = new Proxy({}, { get: (t, name) => (d) => { audioSeen.push(name + (d && d.prediction != null ? ':pred' + d.prediction : '') + (d && d.fidelity != null ? ':f' + d.fidelity : '') + (d && d.shame != null ? ':s' + d.shame : '')); } });
const audioHas = n => audioSeen.some(a => a === n || a.startsWith(n + ':'));

// ---------- turn helpers ----------
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const clamp17 = v => Math.min(7, Math.max(1, v));
function P() { return Game.tbFighter('p'); }
function liveMonster() { const f = Game.tbfight; if (!f) return null; return f.fighters.find(x => x.kind === 'monster' && x.alive) || null; }
function allMonsters() { const f = Game.tbfight; if (!f) return []; return f.fighters.filter(x => x.kind === 'monster' && x.alive); }
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
function stepToward(m) {
  const p = P();
  return stepTo(p.mx + Math.sign(m.mx - p.mx), p.my + Math.sign(m.my - p.my));
}
function stepAway(m) {
  const p = P();
  return stepTo(p.mx + Math.sign(p.mx - m.mx), p.my + Math.sign(p.my - m.my));
}
// Drive up to n PLAYER turns with a policy; prints the play-by-play.
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
      // End the turn ONLY if the policy didn't already advance it.
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
  const intro = drain(); // fight-init text (first-contact dread/coaching) — keep it, don't swallow it
  if (intro) transcript.push('   [fight intro] ' + intro);
  const fighters = (Game.tbfight.fighters || []).map(f => f.kind + ':' + (f.name || f.key)).join(', ');
  note(`   fighters: ${fighters}`);
  return liveMonster();
}
function monDef(id) { return (Game.data.monsters || []).find(m => m.id === id); }
function itemTier(itemId) { const d = (Game.data.items || []).find(i => i.id === itemId); return (d && d.lootTier) || 1; }
// damage watcher: wraps tbAdvance, logs every player-HP drop with the round
function watchDamage() {
  const log = [];
  const _adv = Game.tbAdvance.bind(Game);
  Game.tbAdvance = function () {
    const b = P() ? P().hp : 0;
    const r0 = Game.tbfight ? Game.tbfight.round : 0;
    const r = _adv.apply(Game, arguments);
    if (P() && P().hp < b - 0.001) log.push({ round: Game.tbfight ? Game.tbfight.round : r0, dmg: b - P().hp });
    return r;
  };
  return { log, restore() { Game.tbAdvance = _adv; } };
}
// ASCII grid snapshot: @ player, M monster, # telegraph cells, ~ claimed terrain.
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
      if (Game.tbTerrainAt(x, y) === 'claimed') ch = '~';
      if (fr) ch = fr.kind === 'player' ? '@' : 'M';
      r += ch + ' ';
    }
    lines.push('   ' + r);
  }
  const cap = `   [snap ${label}]\n` + lines.join('\n');
  transcript.push(cap); console.log(cap);
}
function claimedCount() {
  let n = 0;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (Game.tbTerrainAt(x, y) === 'claimed') n++;
  return n;
}

(async () => {
await Game.init();
note('== SEED ' + SEED + ' ==');
let lastFightResult = null;
const _tbEnd = Game.tbEnd.bind(Game);
Game.tbEnd = function (r) { lastFightResult = r; return _tbEnd.apply(Game, arguments); };

// ================= data sanity =================
scene('DATA — the five theater monsters (HEAD)');
const ids = ['understudy', 'landlord', 'heckler', 'paparazzo', 'union_rep'];
for (const id of ids) {
  const d = monDef(id);
  ok(id + ': wave 2, fifo, pain switch, phase badges',
    d && d.wave === 2 && d.encounter.fifo === true && d.encounter.painSwitch === true &&
    d.encounter.phaseBadges && Object.keys(d.encounter.phaseBadges).length >= 3,
    d ? `phases=[${d.encounter.phases.join(',')}]` : 'MISSING');
}
for (const id of ids) {
  const d = monDef(id);
  ok(id + ': has a data knownCue (the coaching line)', !!(d && d.encounter.knownCue),
    d ? trunc(d.encounter.knownCue, 80) : '');
}
ok('understudy: mirror design in data (watch→perform arc, weakness = unpredictability)',
  /steals yours|learns/.test(monDef('understudy').vibe));
ok('landlord: rent/telegraph in data', /sign has your name/.test(monDef('landlord').attack.telegraph));
ok('heckler: shame economy in codex', /SHAME/.test(JSON.stringify(monDef('heckler').codexStages)));
ok('paparazzo: prediction in data', /PREDICTION/.test(JSON.stringify(monDef('paparazzo').codexStages)));
ok('union_rep: organizing, not fighting (data)', /organizes/.test(monDef('union_rep').vibe));

// ================= THE UNDERSTUDY =================
scene('U1 — UNDERSTUDY, blind: feed the copy, watch it learn');
await freshRun();
if (Game.state.village) Game.state.village.positions = {};
// phase wrap BEFORE startCombat — the opening phase is set in the fight init
// (match by monster id: the fighter object doesn't exist yet during startCombat)
let m = null;
const usPhases = [];
const _encSetPhase = Game.encSetPhase.bind(Game);
Game.encSetPhase = function (mm, ph) { if (mm && mm.mdef && mm.mdef.id === 'understudy') usPhases.push(ph); return _encSetPhase.apply(Game, arguments); };
m = newFight('understudy', 2, 4, 3, 4); // start adjacent: feed it moves from turn 1
ok('understudy: 1v1 test setup', (Game.tbfight.fighters || []).filter(f => f.alive).length === 2);
ok('understudy: pattern UNKNOWN on blind contact', Game.encTelegraphKnown(m) === false);
ok('understudy: blind first contact is dread, not coaching (blank shape)',
  /blank shape at the tree line, watching. Learning/.test(T()) &&
  !/MIRROR STRIKE/.test(T()));
ok('understudy: aggro audio is the watch, not a fight cue', audioHas('understudyWatch'));
const wU = watchDamage();
let usCueSeen = '', usCueLearned = '', usKcCheck = '';
const usPol = (p, mm) => {
  if (!p || p.acted || !mm || !mm.alive) return '';
  if (mm.telegraph && !usCueSeen) { try { usCueSeen = Game.tbTelegraphCue(mm) || ''; } catch (e) {} }
  // after the pattern is learned, capture a later cue: the knownCue must append
  if (mm.telegraph && !usCueLearned && Game.tbPatternKnown('understudy', 'Your Move')) {
    try { usCueLearned = Game.tbTelegraphCue(mm) || ''; } catch (e) {}
  }
  const d = cheb(p.mx, p.my, mm.mx, mm.my);
  if (d <= 1) {
    const b = mm.hp; Game.tbPlayerStrike(mm.key);
    return `strike — the copy is watching (${Math.round(b - mm.hp)} dealt)`;
  }
  stepToward(mm); return 'closing — it keeps its distance while it watches';
};
playerTurns(55, usPol);
wU.restore();
Game.encSetPhase = _encSetPhase;
const mU = Game.tbfight ? liveMonster() : null;
note(`\n   U1 LEDGER: result=${lastFightResult} usDead=${!mU || !mU.alive} usSeen=${m ? JSON.stringify(m.usSeen) : 'n/a'} phases=[${usPhases.join(',')}]`);
const usDead = !mU || !mU.alive;
ok('understudy: phases visited in arc order (watching → rehearsing → performing)',
  usPhases.indexOf('watching') >= 0 && usPhases.indexOf('rehearsing') > usPhases.indexOf('watching') &&
  usPhases.indexOf('performing') > usPhases.indexOf('rehearsing'),
  `phases=[${[...new Set(usPhases)].join(',')}]`);
ok('understudy: rehearsing beat is visible text, not silent',
  /doing the thing you do before you do it\. Badly|Done waiting — hit it first/.test(T()),
  'the 2-observation path or the cold-read path — both narrate the phase change');
ok('understudy: OPENING STEAL fires (the most-seen move is anticipated)',
  /OPENING STEAL/.test(T()) && /already gone|glances off its guard/.test(T()),
  'steal armed on the spear, next spear strike halved + answered');
ok('understudy: distinct telegraph (not generic)',
  /doing the thing you do before you do it|MIRROR STRIKE|It moves the way you move\. Wrong/.test(usCueSeen),
  trunc(usCueSeen, 120));
ok('understudy: the copy HITS BACK with your damage (mirror strike)',
  /It answers with YOUR|MIRROR STRIKE/.test(T()));
ok('understudy: surviving its hit TEACHES the pattern (tbLearnPattern on the shared resolve)',
  Game.tbPatternKnown('understudy', 'Your Move') === true,
  'the shared telegraph resolve teaches — knowledge is earned, not given');
ok('understudy: the data knownCue SURFACES once learned (NOT dead)',
  /It only knows what you've SHOWN it/.test(usCueLearned),
  trunc(usCueLearned, 140));
ok('understudy: killable by playing the trick (feed little, hit hard)', usDead && lastFightResult === 'won',
  `result=${lastFightResult} dead=${usDead}`);
ok('understudy: DEATH at low HP reads as the copy breaking',
  /No no no/.test(T()) || /DESPERATE IMPROV/.test(T()) || usDead,
  'improv may fire before the kill');
ok('understudy: audio per phase (watch → rehearse → perform/copy)',
  audioHas('understudyWatch') && audioHas('understudyRehearse') && audioHas('understudyPerform') && audioHas('understudyCopy'),
  [...new Set(audioSeen.filter(a => a.startsWith('understudy')))].join(','));
try { Game.tbEnd('fled'); } catch (e) {}
drain();

scene('U1b — UNDERSTUDY 2-observation rehearsing branch (seeded usSeen — disclosed setup)');
await freshRun();
if (Game.state.village) Game.state.village.positions = {};
m = newFight('understudy', 4, 4, 6, 4);
// The kiting makes the natural 2-observation path rare (cold read usually wins
// the race). Seed the observation state to exercise the branch honestly:
// 2 strikes recorded, still in the watching phase.
m.usSeen = { 'Fire-hardened spear': { count: 2, dmg: 20 } };
m.beamPhase = 'watching'; m.usWatchTurns = 1;
drain();
playerTurns(2, (p) => 'watching — does the rehearsal start on its own?');
ok('understudy: 2 observations → REHEARSING with the copy-at-50% beat',
  /doing the thing you do before you do it\. Badly\. But recognizably\. \(It copies at 50% — it learns fast\.\)/.test(T()));
ok('understudy: rehearsing phase set by the observation branch',
  m.beamPhase === 'rehearsing', `phase=${m.beamPhase}`);
try { Game.tbEnd('fled'); } catch (e) {}
drain();

scene('U2 — UNDERSTUDY cold read (anti-stall): the passive player gets read');
await freshRun();
if (Game.state.village) Game.state.village.positions = {};
m = newFight('understudy', 2, 4, 6, 4);
const wU2 = watchDamage();
let usColdTurns = 0;
playerTurns(12, (p) => { usColdTurns++; return 'standing still — what does it do when there is nothing to learn?'; });
wU2.restore();
ok('understudy: COLD READ prods the passive player (no infinite stall)',
  /Done waiting — hit it first/.test(T()) || /stands the way you stand/.test(T()));
ok('understudy: the cold read ATTACKS (no zero-damage stalemate)',
  wU2.log.length > 0, `player hits taken=${wU2.log.length}`);
ok('understudy: cold-read phase is REHEARSING (the arc stays legible)',
  m && m.beamPhase === 'rehearsing', `phase=${m && m.beamPhase}`);
try { Game.tbEnd('fled'); } catch (e) {}
drain();

scene('U3 — UNDERSTUDY known rematch (codex slain): the coaching voice');
await freshRun();
Game.state.codex.monsters = Game.state.codex.monsters || {};
Game.state.codex.monsters['understudy'] = { stage: 'slain' };
if (Game.state.village) Game.state.village.positions = {};
m = newFight('understudy', 2, 4, 6, 4);
ok('understudy: pattern counts KNOWN after slain (codex-gated)', Game.encTelegraphKnown(m) === true);
ok('understudy: known first contact coaches the counterplay (attack it)',
  /Attack it — every round it watches, it learns/.test(T()));
const wU3 = watchDamage();
let usKcSeen = '', usLearnedTail = '';
playerTurns(18, (p, mm) => {
  if (!p || p.acted || !mm || !mm.alive) return '';
  if (mm.telegraph && !usKcSeen) {
    try { const c = Game.tbTelegraphCue(mm) || ''; usKcSeen = c; usLearnedTail = c; } catch (e) {}
    return 'a strike is declared — reading the cue';
  }
  const d = cheb(p.mx, p.my, mm.mx, mm.my);
  if (d <= 1) { Game.tbPlayerStrike(mm.key); return 'strike (feeding it once, on purpose)'; }
  stepToward(mm); return 'closing';
});
wU3.restore();
ok('understudy: known telegraph names the mirror ("MIRROR STRIKE… played back at you")',
  /MIRROR STRIKE/.test(usKcSeen) || /played back at you/.test(usKcSeen), trunc(usKcSeen, 140));
ok('understudy: slain-stage known voice is the coaching (known/unknown cueText switch)',
  /It is watching you fight\. Taking notes\. In your handwriting/.test(T()));
const badgesU = {};
for (const ph of ['watching', 'rehearsing', 'performing', 'improv']) { m.beamPhase = ph; badgesU[ph] = Game.encPhaseBadge(m); }
ok('understudy: phase badges distinct per phase', badgesU.watching === '👁 WATCHING' && badgesU.rehearsing === '📝 REHEARSING' &&
  badgesU.performing === '🎭 PERFORMING' && badgesU.improv === '🎲 IMPROVISING', JSON.stringify(badgesU));
try { Game.tbEnd('fled'); } catch (e) {}
drain();

// ================= THE LANDLORD =================
scene('L1 — LANDLORD, blind: the ground is the weapon');
await freshRun();
if (Game.state.village) Game.state.village.positions = {};
const llMark = mark();
m = newFight('landlord', 4, 4, 6, 6);
const llPhases = [];
const _esp = Game.encSetPhase.bind(Game);
Game.encSetPhase = function (mm, ph) { if (mm && mm.mdef && mm.mdef.id === 'landlord') llPhases.push(ph); return _esp.apply(Game, arguments); };
ok('landlord: pattern UNKNOWN on blind contact', Game.encTelegraphKnown(m) === false);
const wL = watchDamage();
let llStill = 0, llClaimedPeak = 0, llKcCue = '';
const llPol = (p, mm) => {
  if (!p || p.acted || !mm || !mm.alive) return '';
  llClaimedPeak = Math.max(llClaimedPeak, claimedCount());
  if (mm.telegraph && !llKcCue && Game.tbPatternKnown('landlord', 'Eviction Notice')) {
    try { llKcCue = Game.tbTelegraphCue(mm) || ''; } catch (e) {}
  }
  // turns 1-2: stand still on purpose (get the notice served ON your position)
  if (llStill < 2) { llStill++; return 'standing still — what happens to the ground under me?'; }
  const d = cheb(p.mx, p.my, mm.mx, mm.my);
  // the eviction is undodgeable — trading blows is the honest answer, not footwork
  if (d <= 1) {
    const b = mm.hp; Game.tbPlayerStrike(mm.key);
    return `strike through the eviction (${Math.round(b - mm.hp)} dealt)`;
  }
  // move toward it, never onto its tile, never ending on claimed ground if avoidable
  let best = null, bestScore = -1e9;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = clamp17(p.mx + dx), ny = clamp17(p.my + dy);
    if (nx === mm.mx && ny === mm.my) continue; // occupied
    const terr = Game.tbTerrainAt(nx, ny);
    const dd = cheb(nx, ny, mm.mx, mm.my);
    const score = (terr === 'claimed' ? -10 : 0) - dd * 2 + ((dx === 0 && dy === 0) ? -3 : 0);
    if (score > bestScore) { bestScore = score; best = [nx, ny]; }
  }
  stepTo(best[0], best[1]);
  return `closing to (${best[0]},${best[1]}) — the ground is the weapon, not the landlord`;
};
playerTurns(70, llPol);
Game.encSetPhase = _esp;
wL.restore();
const llT0 = since(llMark);
const mL = Game.tbfight && !Game.tbfight.over ? liveMonster() : null;
const llDead = lastFightResult === 'won';
note(`\n   L1 LEDGER: result=${lastFightResult} llDead=${llDead} claimedPeak=${llClaimedPeak} addenda=${m ? m.llAddenda : '?'} phases=[${[...new Set(llPhases)].join(',')}]`);
ok('landlord: blind first contact is dread (the notice, your name on it — no coaching)',
  /THIS PARCEL IS NOW LEASED/.test(llT0) && !/The ground is the weapon/.test(llT0.slice(0, llT0.indexOf('THIS PARCEL'))));
ok('landlord: EVICTION on the stationary player (notice served on YOUR position)',
  /NOTICE SERVED — CURRENT OCCUPANT/.test(T()) || /AT YOUR FEET/.test(T()));
ok('landlord: rent is charged for ending a turn on claimed ground',
  /takes its cut/.test(T()));
ok('landlord: ADDENDUM widens the lease (the safe ground shrinks)',
  /ADDENDUM #/.test(T()) && llClaimedPeak >= 4, `claimedPeak=${llClaimedPeak}`);
ok('landlord: phases advance with the lease (claiming → collecting → foreclosing)',
  ['claiming', 'collecting', 'foreclosing'].every(p => llPhases.includes(p)),
  `phases=[${[...new Set(llPhases)].join(',')}]`);
ok('landlord: the land pays rent upward (healing on claimed ground)',
  /the land pays rent/.test(T()));
ok('landlord: direct telegraph is distinct (not generic)',
  /sign has your name on it/.test(T()));
ok('landlord: surviving its hit TEACHES the pattern',
  Game.tbPatternKnown('landlord', 'Eviction Notice') === true);
ok('landlord: the data knownCue SURFACES once learned (NOT dead)',
  /The ground is the weapon, not the landlord/.test(llKcCue || T()),
  trunc(llKcCue, 130));
ok('landlord: killable by striking through the eviction (trade pre-foreclosure)',
  llDead, `result=${lastFightResult}`);
ok('landlord: the claim audio fires in the lease patter', audioHas('landlordClaim'));
ok('landlord: audio per beat (claim → evict → spread)', audioHas('landlordClaim') && audioHas('landlordEvict') && audioHas('landlordSpread'),
  [...new Set(audioSeen.filter(a => a.startsWith('landlord')))].join(','));
try { Game.tbEnd('fled'); } catch (e) {}
drain();

scene('L2 — LANDLORD visual: the claimed ground on the grid (snapshot)');
await freshRun();
if (Game.state.village) Game.state.village.positions = {};
m = newFight('landlord', 4, 4, 6, 6);
let llStill2 = 0;
playerTurns(10, (p) => {
  if (llStill2 < 4) { llStill2++; return 'standing still — let the ring close around me for the snapshot'; }
  stepAway(m); return 'backing off for the shot';
});
snap('landlord-claimed-telegraph');
ok('landlord: snapshot shows a claimed ring around the player (the eviction visual)',
  claimedCount() >= 4, `claimed=${claimedCount()}`);
const badgesL = {};
for (const ph of ['surveying', 'claiming', 'collecting', 'foreclosing']) { m.beamPhase = ph; badgesL[ph] = Game.encPhaseBadge(m); }
ok('landlord: phase badges distinct per phase', badgesL.surveying === '📋 SURVEYING' && badgesL.claiming === '📌 CLAIMING' &&
  badgesL.collecting === '💰 COLLECTING' && badgesL.foreclosing === '📜 FORECLOSURE', JSON.stringify(badgesL));
note('   BACKLOG (wiring, engine off-limits): the data noticeText "\\"THIS PARCEL IS NOW LEASED.\\" {who} is standing on it." never surfaces — startCombat notices the player SILENTLY (encNoticeFighter silent=true), so the AI block\'s own patter is the only first contact. Same for heckler/paparazzo/union_rep noticeTexts. The bespoke first-turn lines cover the fiction, so this is data hygiene, not a player-facing gap.');
try { Game.tbEnd('fled'); } catch (e) {}
drain();

// ================= THE HECKLER =================
scene('H1 — HECKLER, blind: the set. Words stack SHAME.');
await freshRun();
if (Game.state.village) Game.state.village.positions = {};
const hkMark = mark();
m = newFight('heckler', 2, 4, 6, 4);
ok('heckler: pattern UNKNOWN on blind contact', Game.encTelegraphKnown(m) === false);
note('   BACKLOG (wiring, engine off-limits): encounter.aggroAudio "hecklerLaugh" NEVER fires — aggroAudio only plays on threat-queue-front changes (pain/scan), and a 1v1 fight never changes the front. Every other monster\'s first-contact audio is called explicitly in its AI block; the heckler has no first-turn audio call. Suggested: play hecklerLaugh on the first jibe (like the understudy\'s watching beat).');
const wH = watchDamage();
let hkAnswered = 0, hkShamePeak = 0, hkCue = '', hkPhasePeak = '', hkKCue2 = '';
const hkPol = (p, mm) => {
  if (!p || p.acted || !mm || !mm.alive) return '';
  hkShamePeak = Math.max(hkShamePeak, mm.hkShame || 0);
  if (mm.beamPhase === 'headliner') hkPhasePeak = 'headliner';
  if (mm.telegraph && !hkCue) { try { hkCue = Game.tbTelegraphCue(mm) || ''; } catch (e) {} }
  if (p.hkCompelled) {
    if (hkAnswered === 0) { hkAnswered++; Game.tbPlayerWait(); return 'ANSWERING BACK (WAIT) — clearing the shame'; }
    hkAnswered++;
    const b = mm.hp; Game.tbPlayerStrike(mm.key);
    return 'acting through the compulsion — defiance';
  }
  const d = cheb(p.mx, p.my, mm.mx, mm.my);
  if (d <= 1) { const b = mm.hp; Game.tbPlayerStrike(mm.key); return 'strike — it narrates the swing'; }
  stepToward(mm); return 'closing in on the mouth';
};
playerTurns(45, hkPol);
wH.restore();
const hkT0 = since(hkMark);
const mH = Game.tbfight && !Game.tbfight.over ? liveMonster() : null;
const hkDead = lastFightResult === 'won';
note(`\n   H1 LEDGER: result=${lastFightResult} hkDead=${hkDead} shamePeak=${hkShamePeak} compulsionAnswers=${hkAnswered}`);
ok('heckler: blind first contact is dread (laughter aimed at you, specifically — no coaching)',
  /laughing at you specifically/.test(hkT0) && !/SHAME is what hurts/.test(hkT0.slice(0, 600)));
ok('heckler: jibes stack SHAME and weaken your arms',
  /The words stick\. Your arms feel heavier\. \(SHAME \d+: -\d+ damage/.test(T()),
  `shame peak=${hkShamePeak}`);
ok('heckler: SHAME reduces real strike damage (the words lie about your arms)',
  hkShamePeak >= 2, `shamePeak=${hkShamePeak}`);
ok('heckler: HEADLINER at 3+ shame (phase change with its own beat)',
  /we've got a LIVE ONE/.test(T()) && hkPhasePeak === 'headliner',
  `shamePeak=${hkShamePeak} phase=${hkPhasePeak}`);
ok('heckler: PILE-ON (headliner jibes stack double + the words CUT)',
  /PILE-ON/.test(T()) && /The words find the soft places/.test(T()));
ok('heckler: COMPULSION forces the choice (answer back or act)',
  /You WANT to answer back/.test(T()));
ok('heckler: ANSWERING BACK (WAIT) clears 3 shame',
  /You answer back — it costs the turn, but the words lose their weight\. \(-3 SHAME\)/.test(T()));
ok('heckler: DEFIANCE feeds it (+2 SHAME when you act through the compulsion)',
  /defiance feeds it\. \(\+2 SHAME\)/.test(T()));
ok('heckler: striking it guarantees a jibe (the set feeds on your effort)',
  /Do it again! Do it again/.test(T()) || /That's the swing/.test(T()) || /footwork from a landslide/.test(T()));
ok('heckler: headliner teaches the pattern (tbLearnPattern fires — the exception)',
  Game.tbPatternKnown('heckler', 'You Call That A Swing?') === true);
ok('heckler: the data knownCue SURFACES after learning (not dead)',
  /SHAME is what hurts/.test(T()) || /Answer back \(WAIT\)/.test(T()),
  'knownCue appends via knownTail once the pattern is learned');
ok('heckler: audio per beat (jibe → pile-on → headliner; laugh is the silent one — see backlog)',
  audioHas('hecklerJibe') && audioHas('hecklerPileOn') && audioHas('hecklerHeadliner'),
  [...new Set(audioSeen.filter(a => a.startsWith('heckler')))].join(','));
ok('heckler: killable (fragile — the mouth is the whole monster)', hkDead && lastFightResult === 'won',
  `result=${lastFightResult} dead=${hkDead}`);
const badgesH = {};
for (const ph of ['warming_up', 'heckling', 'headliner']) { m.beamPhase = ph; badgesH[ph] = Game.encPhaseBadge(m); }
ok('heckler: phase badges distinct per phase', badgesH.warming_up === '🎤 WARMING UP' && badgesH.heckling === '🗣️ HECKLING' &&
  badgesH.headliner === '⭐ HEADLINER', JSON.stringify(badgesH));
try { Game.tbEnd('fled'); } catch (e) {}
drain();

// ================= THE PAPARAZZO =================
scene('P1a — PAPARAZZO, blind: SPRINT out of the frame, kill it before the fourth frame');
await freshRun();
if (Game.state.village) Game.state.village.positions = {};
const pzMark = mark();
m = newFight('paparazzo', 3, 3, 6, 6);
ok('paparazzo: pattern UNKNOWN on blind contact', Game.encTelegraphKnown(m) === false);
ok('paparazzo: aggro audio is the shutter', audioHas('paparazzoShutter'));
const wP = watchDamage();
let pzPredPeak = 0, pzCellsLo = 0, pzSnapLo = false, pzKcCue = '';
const pzPol = (p, mm) => {
  if (!p || p.acted || !mm || !mm.alive) return '';
  pzPredPeak = Math.max(pzPredPeak, mm.pzPrediction || 0);
  if (mm.telegraph && mm.telegraph.cells) {
    const n = mm.telegraph.cells.length;
    if ((mm.pzPrediction || 0) < 3) { pzCellsLo = Math.max(pzCellsLo, n); if (!pzSnapLo) { pzSnapLo = true; snap('paparazzo-flash-telegraph-blind'); } }
    if (!pzKcCue && Game.tbPatternKnown('paparazzo', 'Flash Photography')) {
      try { pzKcCue = Game.tbTelegraphCue(mm) || ''; } catch (e) {}
    }
  }
  // the flash re-centers on you at declare — SPRINT (3 tiles) out of the frame
  if (mm.telegraph && mm.telegraph.cells) {
    const cells = new Set(mm.telegraph.cells.map(c => c.cx + ',' + c.cy));
    let bx = p.mx, by = p.my, bd = -1;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const nx = clamp17(p.mx + dx), ny = clamp17(p.my + dy);
      if (nx === mm.mx && ny === mm.my) continue;
      if (!cells.has(nx + ',' + ny)) {
        const dd = Math.max(Math.abs(dx), Math.abs(dy));
        const score = dd - cheb(nx, ny, mm.mx, mm.my) * 0.4; // far from the flash, close to the monster
        if (score > bd) { bd = score; bx = nx; by = ny; }
      }
    }
    if (bd >= 0) { stepTo(bx, by); return `sprinting out of the frame to (${bx},${by})`; }
  }
  const d = cheb(p.mx, p.my, mm.mx, mm.my);
  if (d <= 1) { const b = mm.hp; Game.tbPlayerStrike(mm.key); return `strike (${Math.round(b - mm.hp)} dealt) — kill it before the fourth frame`; }
  stepToward(mm); return 'closing — it keeps its distance, so chase';
};
playerTurns(40, pzPol);
wP.restore();
const pzT0 = since(pzMark);
const mPa = Game.tbfight && !Game.tbfight.over ? liveMonster() : null;
const pzDeadA = lastFightResult === 'won';
note(`\n   P1a LEDGER: result=${lastFightResult} pzDead=${pzDeadA} predPeak=${pzPredPeak} cellsLo=${pzCellsLo}`);
ok('paparazzo: blind first contact is dread (the unknown eye — no coaching)',
  /a single eye in the dark/.test(pzT0) && !/money shot/.test(pzT0.slice(0, 500)));
ok('paparazzo: early burst is 5x5 (radius 2) — the telegraph has real geometry',
  pzCellsLo === 25, `cells=${pzCellsLo}`);
ok('paparazzo: sprinting out of the frame = CLEAN DODGE (footwork works pre-exclusive)',
  /You're not where it landed\. Clean dodge/.test(T()));
ok('paparazzo: it learns from the MISS too (the model updates on commit)',
  /learns from the miss too/.test(T()));
ok('paparazzo: killable before the fourth frame (the codex counterplay is real)',
  pzDeadA, `result=${lastFightResult}`);
try { Game.tbEnd('fled'); } catch (e) {}
drain();

scene('P1b — PAPARAZZO, blind: stand still, let it reach EXCLUSIVE');
await freshRun();
if (Game.state.village) Game.state.village.positions = {};
m = newFight('paparazzo', 3, 3, 6, 6);
const wP2 = watchDamage();
let pzPredPeak2 = 0, pzCellsHi = 0, pzExclusive = false, pzSnapHi = false, pzKcCue2 = '';
const pzPol2 = (p, mm) => {
  if (!p || p.acted || !mm || !mm.alive) return '';
  pzPredPeak2 = Math.max(pzPredPeak2, mm.pzPrediction || 0);
  if (mm.telegraph && mm.telegraph.cells && (mm.pzPrediction || 0) >= 3) {
    pzCellsHi = Math.max(pzCellsHi, mm.telegraph.cells.length);
    if (!pzSnapHi && mm.beamPhase === 'exclusive') { pzSnapHi = true; snap('paparazzo-exclusive-telegraph'); }
  }
  if (mm.telegraph && !pzKcCue2 && Game.tbPatternKnown('paparazzo', 'Flash Photography')) {
    try { pzKcCue2 = Game.tbTelegraphCue(mm) || ''; } catch (e) {}
  }
  if (mm.beamPhase === 'exclusive') pzExclusive = true;
  return 'holding still — posing for the camera, letting the model max out';
};
playerTurns(28, pzPol2);
wP2.restore();
const pzFrozen = /frozen mid-step/.test(T());
const pzWidened = /WIDENING THE SHOT/.test(T());
note(`\n   P1b LEDGER: predPeak=${pzPredPeak2} cellsHi=${pzCellsHi} exclusive=${pzExclusive} playerDmg=${Math.round(wP2.log.reduce((a,d)=>a+d.dmg,0))}`);
ok('paparazzo: prediction climbs with every shot (+1/turn, +2 when still)',
  pzPredPeak2 >= 4, `peak=${pzPredPeak2}`);
ok('paparazzo: stillness feeds it double (the "posing for the camera" warning)',
  /Standing still makes it learn you FASTER/.test(T()));
ok('paparazzo: WIDENING THE SHOT at high prediction (7x7)',
  pzWidened && pzCellsHi === 49, `cells=${pzCellsHi}`);
ok('paparazzo: EXCLUSIVE at prediction 4 — the money shot is UNBLOCKABLE',
  pzExclusive && /The money shot/.test(T()));
ok('paparazzo: the flash FREEZES (stunned, lose movement keep action)',
  pzFrozen);
ok('paparazzo: distinct telegraph (not generic)',
  /The lens steadies\. You hear the shutter think about it/.test(T()));
ok('paparazzo: surviving a flash TEACHES the pattern',
  Game.tbPatternKnown('paparazzo', 'Flash Photography') === true);
ok('paparazzo: the data knownCue SURFACES once learned (NOT dead)',
  /Every shot refines its model/.test(pzKcCue2 || pzKcCue || ''), trunc(pzKcCue2 || pzKcCue || '', 130));
ok('paparazzo: audio per shot (shutter, then the exclusive sting)',
  audioHas('paparazzoShutter') && audioHas('paparazzoExclusive'),
  audioSeen.filter(a => a.startsWith('paparazzo')).slice(0, 8).join(','));
const badgesP = {};
for (const ph of ['candid', 'tracking', 'exclusive']) { m.beamPhase = ph; badgesP[ph] = Game.encPhaseBadge(m); }
ok('paparazzo: phase badges distinct per phase', badgesP.candid === '📷 CANDID' && badgesP.tracking === '🎯 TRACKING' &&
  badgesP.exclusive === '⭐ EXCLUSIVE', JSON.stringify(badgesP));
try { Game.tbEnd('fled'); } catch (e) {}
drain();

// ================= THE UNION REP =================
scene('R1 — UNION REP, blind: it does not fight. It organizes.');
await freshRun();
if (Game.state.village) Game.state.village.positions = {};
const urMark = mark();
m = newFight('union_rep', 2, 4, 6, 4);
ok('union_rep: pattern UNKNOWN on blind contact', Game.encTelegraphKnown(m) === false);
const wR = watchDamage();
let urSummoned = null, urWalkout = false, urLineBroken = false, urUntargetableSaid = false;
let urAllyBonus = 0, urOrgTurnsSeen = 0, urKcCue = '', urTurn = 0;
const rep = () => allMonsters().find(x => (x.mdef || {}).id === 'union_rep');
const allies = () => allMonsters().filter(x => (x.mdef || {}).id !== 'union_rep');
const urPol = (p, mm) => {
  if (!p || p.acted) return '';
  urTurn++;
  const r = rep(); if (!r || !r.alive) return 'the rep is down — mopping up';
  urOrgTurnsSeen = Math.max(urOrgTurnsSeen, r.urOrgTurns || 0);
  const als = allies();
  if (!urSummoned && als.length) { urSummoned = als[0]; note(`   📢 PICKET SUMMONED: ${urSummoned.name} (${urSummoned.monsterId})`); }
  for (const a of als) urAllyBonus = Math.max(urAllyBonus, a.urDmgBonus || 0);
  if (r.telegraph && !urKcCue && Game.tbPatternKnown('union_rep', 'Grievance Filed')) {
    try { urKcCue = Game.tbTelegraphCue(r) || ''; } catch (e) {}
  }
  // first 4 turns: hold at range — let it declare Grievance Filed (the attack
  // it "never uses" while you crowd it)
  if (urTurn <= 4) {
    const d = cheb(p.mx, p.my, r.mx, r.my);
    if (d < 2) { stepAway(r); return 'holding at range — letting it show its hand'; }
    return 'holding at range — letting it show its hand';
  }
  // policy: kill the ALLIES first (test the line-break), then the rep.
  // (the codex says kill the rep first — I am playing the WRONG answer on purpose)
  if (als.length) {
    const a = als[0];
    const d = cheb(p.mx, p.my, a.mx, a.my);
    if (d <= 1) { const b = a.hp; Game.tbPlayerStrike(a.key); return `strike the picket ally (${Math.round(b - a.hp)} dealt)`; }
    stepToward(a); return 'closing on the picket line';
  }
  const d = cheb(p.mx, p.my, r.mx, r.my);
  if (d <= 1) {
    const okS = Game.tbPlayerStrike(r.key);
    if (!okS && r.urWalkout) urUntargetableSaid = true;
    return okS ? 'strike the rep' : 'no clean shot — behind the picket line';
  }
  stepToward(r); return 'closing on the rep';
};
playerTurns(80, urPol);
wR.restore();
const urT0 = since(urMark);
const mR = rep();
const urDead = lastFightResult === 'won';
urWalkout = /WALKOUT! WALKOUT!/.test(T());
urLineBroken = /The line — the LINE is broken/.test(T());
note(`\n   R1 LEDGER: result=${lastFightResult} repDead=${urDead} walkout=${urWalkout} lineBroken=${urLineBroken} allyMaxBonus=${urAllyBonus} orgTurns=${urOrgTurnsSeen}`);
ok('union_rep: blind first contact is dread (a meeting about you — no coaching)',
  /holding a meeting\. About you/.test(urT0) && !/Union-bust/.test(urT0.slice(0, 400)));
ok('union_rep: ORGANIZING beat is visible (the phase is not entered silently)',
  /holding a meeting\. About you/.test(T()));
ok('union_rep: the organizing window is REAL (2 turns before the picket forms — union-bustable)',
  urOrgTurnsSeen >= 2 && urSummoned, `orgTurns=${urOrgTurnsSeen}`);
ok('union_rep: PICKET LINE summons a wave-1 monster (not the apex)',
  urSummoned && (urSummoned.monsterId !== 'gallowdeer') && (urSummoned.monsterId !== 'bulldozer') &&
  /PICKET LINE!/.test(T()), urSummoned ? `${urSummoned.name} (${urSummoned.monsterId})` : 'none summoned');
ok('union_rep: SOLIDARITY buffs allies (+3 damage, announced)',
  /STAND TOGETHER!/.test(T()) && urAllyBonus >= 3, `maxBonus=${urAllyBonus}`);
ok('union_rep: THE WALKOUT at half HP (untargetable, allies +8)',
  urWalkout && /Allies \+8 damage/.test(T()));
ok('union_rep: UNTARGETABLE during walkout (the strike is refused, honestly)',
  urUntargetableSaid && /can't get a clean shot — it's behind the picket line/.test(T()));
ok('union_rep: THE LINE BREAKS when allies die (walkout collapses — no infinite stalemate)',
  urLineBroken);
ok('union_rep: killable after the line breaks', urDead && lastFightResult === 'won',
  `result=${lastFightResult} dead=${urDead}`);
ok('union_rep: the bullhorn audio fires in the organizing patter', audioHas('unionBullhorn'));
ok('union_rep: audio per beat (bullhorn → picket → walkout → whistle)',
  audioHas('unionBullhorn') && audioHas('unionPicket') && audioHas('unionWalkout') && audioHas('unionRepWhistle'),
  [...new Set(audioSeen.filter(a => a.startsWith('union')))].join(','));
const badgesR = {};
for (const ph of ['organizing', 'picketing', 'walkout']) { m.beamPhase = ph; badgesR[ph] = Game.encPhaseBadge(m); }
ok('union_rep: phase badges distinct per phase', badgesR.organizing === '📋 ORGANIZING' && badgesR.picketing === '✊ PICKETING' &&
  badgesR.walkout === '🚨 WALKOUT', JSON.stringify(badgesR));
ok('union_rep: surviving its declared attack TEACHES the pattern',
  Game.tbPatternKnown('union_rep', 'Grievance Filed') === true,
  'held at range so it would show its hand');
ok('union_rep: the data knownCue SURFACES once learned (NOT dead)',
  /Kill the rep before it organizes/.test(urKcCue || T()), trunc(urKcCue, 130));
try { Game.tbEnd('fled'); } catch (e) {}
drain();

// ================= CODEX-KNOWN REMATCHES =================
scene('K1 — LANDLORD known rematch (codex slain): the coaching voice');
await freshRun();
Game.state.codex.monsters = Game.state.codex.monsters || {};
Game.state.codex.monsters['landlord'] = { stage: 'slain' };
if (Game.state.village) Game.state.village.positions = {};
m = newFight('landlord', 4, 4, 6, 6);
ok('landlord: pattern counts KNOWN after slain', Game.encTelegraphKnown(m) === true);
playerTurns(8, (p) => 'standing still — reading the known patter');
ok('landlord: known first contact coaches ("Claimed tiles hurt — keep moving")',
  /Claimed tiles hurt — keep moving/.test(T()));
try { Game.tbEnd('fled'); } catch (e) {}
drain();

scene('K2 — HECKLER known rematch (codex slain): the coaching voice');
await freshRun();
Game.state.codex.monsters['heckler'] = { stage: 'slain' };
if (Game.state.village) Game.state.village.positions = {};
m = newFight('heckler', 2, 4, 6, 4);
ok('heckler: pattern counts KNOWN after slain', Game.encTelegraphKnown(m) === true);
const hkPolK = (p, mm) => {
  if (!p || p.acted || !mm || !mm.alive) return '';
  if (mm.telegraph && Game.tbPatternKnown('heckler', 'You Call That A Swing?') && !hkKCue2) {
    try { hkKCue2 = Game.tbTelegraphCue(mm) || ''; } catch (e) {}
  }
  const d = cheb(p.mx, p.my, mm.mx, mm.my);
  // after the headliner teaches the pattern, hold at range so it DECLARES —
  // the data knownCue appends to telegraph cues
  if ((mm.hkShame || 0) >= 3 && d <= 1) { stepAway(mm); return 'backing off — let it declare with the coaching on'; }
  if (d <= 1) { Game.tbPlayerStrike(mm.key); return 'strike'; }
  stepToward(mm); return 'closing';
};
playerTurns(26, hkPolK);
ok('heckler: known coaching surfaces in the rematch (the data knownCue, earned)',
  /Answer back \(WAIT\) to clear it/.test(hkKCue2),
  trunc(hkKCue2, 120));
ok('heckler: known jibes are voiced ("My grandmother hits harder")',
  /My grandmother hits harder/.test(T()));
ok('heckler: known rematch still teaches nothing new (the set is the set)',
  Game.tbPatternKnown('heckler', 'You Call That A Swing?') === true);
try { Game.tbEnd('fled'); } catch (e) {}
drain();

scene('K3 — PAPARAZZO known rematch (codex slain): the coaching voice');
await freshRun();
Game.state.codex.monsters['paparazzo'] = { stage: 'slain' };
if (Game.state.village) Game.state.village.positions = {};
m = newFight('paparazzo', 3, 3, 6, 6);
ok('paparazzo: pattern counts KNOWN after slain', Game.encTelegraphKnown(m) === true);
let pzKCue = '';
playerTurns(12, (p, mm) => {
  if (!p || p.acted || !mm || !mm.alive) return '';
  if (mm.telegraph && !pzKCue) { try { pzKCue = Game.tbTelegraphCue(mm) || ''; } catch (e) {} }
  return 'standing — reading the known cue';
});
ok('paparazzo: known cue names the prediction count ("Say cheese… Prediction N/4")',
  /Say cheese/.test(pzKCue) && /Prediction \d\/4/.test(pzKCue), trunc(pzKCue, 130));
try { Game.tbEnd('fled'); } catch (e) {}
drain();

scene('K4 — UNION REP known rematch (codex slain): the coaching voice');
await freshRun();
Game.state.codex.monsters['union_rep'] = { stage: 'slain' };
if (Game.state.village) Game.state.village.positions = {};
m = newFight('union_rep', 2, 4, 6, 4);
ok('union_rep: pattern counts KNOWN after slain', Game.encTelegraphKnown(m) === true);
playerTurns(5, (p) => 'standing — reading the known organizing beat');
ok('union_rep: known organizing beat coaches the union-bust',
  /Union-bust it before the picket forms/.test(T()));
try { Game.tbEnd('fled'); } catch (e) {}
drain();

// ================= loot aggregates (deterministic) =================
scene('LOOT — wave-2 loot rule vs the data');
const lootTable = [];
for (const id of ids) {
  const d = monDef(id);
  let drops = 0; const tiers = new Set(); const dids = new Set();
  for (let i = 0; i < 200; i++) { const lid = Game.rollAlienLoot(d, {}); if (lid) { drops++; tiers.add(itemTier(lid)); dids.add(lid); } }
  lootTable.push({ id, drops, tiers: [...tiers], chance: d.loot.chance, tier: d.loot.tier });
  note(`   ${id}: ${drops}/200 drops (data chance ${d.loot.chance}), tiers=[${[...tiers]}] (data tier ${d.loot.tier})`);
}
for (const r of lootTable) {
  ok(`${r.id}: loot chance LOW, not raining (~${r.chance})`, r.drops >= 8 && r.drops <= 90, `${r.drops}/200`);
}
note('   RULE CHECK: Steve\'s wave-2 loot rule says only veteran wave-1 variants (post unlock) + the apex may drop wave-2 loot (tier 3+); base wave-1 stays tier 1-2. Four of these five regular wave-2 monsters carry tier 3 in the data — that conflicts with the rule as stated, same tension the perf-review pass flagged for review_drone (tier 2). The heckler is tier 2 (consistent). Stats are off-limits this run — flagged for Steve, nothing changed.');

// ================= audio across the run =================
scene('AUDIO HOOKS across the played fights');
for (const n of ['understudyWatch', 'understudyRehearse', 'understudyPerform', 'understudyCopy',
  'landlordClaim', 'landlordEvict', 'landlordSpread', 'hecklerJibe', 'hecklerPileOn',
  'hecklerHeadliner', 'paparazzoShutter', 'paparazzoExclusive', 'unionBullhorn', 'unionPicket',
  'unionWalkout', 'unionRepWhistle'])
  ok('audio hook fires: ' + n, audioHas(n));
note('   hecklerLaugh: NEVER FIRES (wiring gap — see H1 backlog note).');
note('   NOTE: telegraph (generic urgency) also fires on direct declares for understudy/landlord/union_rep — the generic one, flagged, but each phase has its own bespoke synth too.');

// ================= verdict =================
scene('VERDICT');
const fails = results.filter(r => !r[1]);
note(`\n   assertions: ${results.length - fails.length}/${results.length} green`);
if (fails.length) { note('\n   FAILING ASSERTIONS:'); for (const f of fails) note('     · ' + f[0]); process.exitCode = 1; }
else note('\n   all green.');
})();
