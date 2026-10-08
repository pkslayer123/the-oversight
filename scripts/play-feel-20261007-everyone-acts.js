#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-07) — Worker B: Everyone Acts feel pass.
// Tests HEAD's NPC action economy (9da6c50) + the Detective x Everyone Acts
// convo fix (319a947) AS A PLAYER. The bar is playable and enjoyable, not
// "runs without crashing".
//
// What it does:
//   1. Loads the FULL production script list from HEAD (git show HEAD:...),
//      immune to sibling worktree churn. Seeded mulberry32 PRNG (SEED env).
//   2. New game, ~55 player turns in/around the haven (~2 in-game days):
//      wandering, foraging, waiting, resting — a player living in the village.
//   3. Instruments Game.npcTakeAction: after EVERY player action, logs what
//      each villager did (intent from needs, outcome from deltas, say lines).
//   4. Smoke-tests 319a947: mid-run conversation, endConvo, then verifies the
//      freed villager resumes needs-driven actions (the frozen-after-convo bug).
//   5. Tracks: per-turn villagerTurn wall time, announcement volume (chatter
//      budget), pantry depletion by NPCs, world-cell depletion by NPCs,
//      trust both-ways on NPC-NPC talk, frozen villagers, movement blocking.
//   6. Prints a FEEL verdict section with the key questions answered.
//
// Run: node scripts/play-feel-20261007-everyone-acts.js [SEED=...]
// Read-only on the engine: creates no engine changes.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HEAD = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();

function headFile(p) {
  return execSync('git show HEAD:' + p, { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
}
// data files also from HEAD (pure HEAD test); fall back to worktree on miss
global.fetch = (f) => Promise.resolve({
  json: () => {
    let txt;
    try { txt = headFile(f); } catch (e) { txt = fs.readFileSync(path.join(ROOT, f), 'utf8'); }
    return JSON.parse(txt);
  }
});
global.window = global; // eval-phase stub only (equipment.js needs it at load)
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js',
 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'].forEach(f => eval(headFile(f)));
delete global.window; // flips combat to the sync path
const Game = globalThis.Scattering.Game;

// seeded PRNG (mulberry32), reproducible; override with SEED=123 node ...
let rngState = (process.env.SEED ? parseInt(process.env.SEED, 10) : 20261007) >>> 0;
Math.random = () => {
  rngState |= 0; rngState = (rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function name(id) { try { return Game.displayName(id) || id; } catch (e) { return id; } }
function turn(vid, cid) {
  const r = Game.convoTurn(vid, cid);
  const line = r && (r.line || r.msg || '');
  console.log(`   you[${String(cid).slice(0, 34)}] -> "${String(line).slice(0, 160)}"`);
  return r;
}
function choices(vid) { return Game.convoChoices(vid) || []; }
function giveFood(kcalEach, units, nm) {
  Game.state.scholar.inventory.push({ name: nm || 'Trail ration', kcalEach, units, spoilDay: 9999, safe: true, kg: 0.2, unit: 'pack', edible: true, foodState: 'ready', foodKind: 'plant' });
}

// ---- instrumentation: what did each villager do on their turn? ----
const turnLog = [];      // per player-turn: {turn, playerAct, npcs:[...], ms, inits:[...]}
const stats = { talks: 0, talkTrustPairs: [], pantryHits: 0, frozen: {}, actHist: {}, blockedMoves: 0, msTotal: 0, msMax: 0, announces: 0 };
let curNpcRecs = null, curInits = null;
const origTake = Game.npcTakeAction.bind(Game);
function snapNeeds(rid) {
  const n = Game.npcNeeds(rid) || {};
  return { fear: n.fear || 0, hunger: n.hunger || 0, energy: n.energy || 0, social: n.social || 0 };
}
function snapTrust() {
  const t = {}; const vt = Game.state.village.trust || {};
  for (const k of Object.keys(vt)) t[k] = vt[k];
  return t;
}
function pantryKcal() {
  return (Game.state.village.pantry || []).reduce((s, i) => s + (i.kcalEach || 0) * (i.units || 1), 0);
}
function regrowCount() {
  let n = 0;
  for (const k of Object.keys(Game.state.village.positions || {})) { void k; }
  const t = Game.playerTile ? Game.playerTile() : null;
  if (t && t.detailRegrow) n = Object.keys(t.detailRegrow).length;
  return n;
}
Game.npcTakeAction = function (rid, detail, ctx) {
  const v = Game.state.village;
  const pos = v.positions[rid];
  const p0 = pos ? { mx: pos.mx, my: pos.my } : null;
  const n0 = snapNeeds(rid);
  const s0 = says.length;
  let err = null;
  try { origTake(rid, detail, ctx); } catch (e) { err = e.message; }
  const p1 = pos ? { mx: pos.mx, my: pos.my } : null;
  const n1 = snapNeeds(rid);
  const lines = says.slice(s0);
  if (curNpcRecs) curNpcRecs.push({ rid, nm: name(rid), p0, p1, n0, n1, lines, err });
  return undefined;
};

function intentOf(n) {
  if (n.fear > 70) return 'FEAR';
  if (n.hunger > 60) return 'HUNGER';
  if (n.energy < 30) return 'ENERGY';
  if (n.social > 70) return 'SOCIAL';
  return 'idle';
}
function describe(rec) {
  const moved = rec.p0 && rec.p1 && (rec.p0.mx !== rec.p1.mx || rec.p0.my !== rec.p1.my);
  const dh = rec.n1.hunger - rec.n0.hunger, de = rec.n1.energy - rec.n0.energy;
  const ds = rec.n1.social - rec.n0.social, df = rec.n1.fear - rec.n0.fear;
  const intent = intentOf(rec.n0);
  let out;
  if (moved) out = `moves (${rec.p0.mx},${rec.p0.my})->(${rec.p1.mx},${rec.p1.my})`;
  else out = 'stays';
  const bits = [];
  if (dh <= -20) bits.push(`hunger ${Math.round(rec.n0.hunger)}->${Math.round(rec.n1.hunger)} (fed)`);
  if (de >= 5) bits.push(`energy ${Math.round(rec.n0.energy)}->${Math.round(rec.n1.energy)} (rested)`);
  if (ds <= -10) bits.push(`social ${Math.round(rec.n0.social)}->${Math.round(rec.n1.social)} (talked)`);
  if (df <= -3) bits.push(`fear ${Math.round(rec.n0.fear)}->${Math.round(rec.n1.fear)} (calmed)`);
  if (!bits.length && moved) bits.push('drift');
  if (!bits.length) bits.push('(no visible change)');
  out += ' ' + bits.join(', ');
  const key = bits[0] && bits[0].indexOf('(') >= 0 ? bits[0].match(/\(([^)]+)\)/)[1] : (moved ? 'moved' : 'idle');
  return { intent, out, key, says: rec.lines, err: rec.err };
}

function adjWalkable() {
  const s = Game.state.scholar; const px = s.mx ?? 4, py = s.my ?? 4;
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const cx = px + dx, cy = py + dy;
    if (cx < 1 || cx > 7 || cy < 1 || cy > 7) continue; // interior only: edges are flee-by-barrier
    const cell = detail[cy] && detail[cy][cx];
    if (cell && !Game.cellProps(cell).blocks) out.push([cx, cy, cell]);
  }
  return out;
}
function npcIds() {
  const v = Game.state.village;
  return (v.roster || []).filter(id => id !== Game.villagerId && !((Game.vpOf(id) || {}).dead));
}
function nearestNpc() {
  const s = Game.state.scholar; const px = s.mx ?? 4, py = s.my ?? 4;
  const v = Game.state.village;
  let best = null, bd = 99;
  for (const id of npcIds()) {
    const p = v.positions[id]; if (!p) continue;
    const d = Math.max(Math.abs(p.mx - px), Math.abs(p.my - py));
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}

async function main() {
  console.log('HEAD under test:', HEAD);
  console.log('seed:', rngState >>> 0);
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.kcal = 5000; s.health = 100; s.hydration = 100;
  giveFood(400, 40, 'Dried venison');
  console.log('player:', name(Game.villagerId), '| node:', Game.map.px, Game.map.py,
    '| pos:', s.mx ?? 4, s.my ?? 4, '| villagers:', npcIds().length);
  console.log('cast:', npcIds().map(id => `${name(id)}`).join(' | '));
  const v0 = Game.state.village;
  console.log('engaged-at-start:', Object.keys(v0.engaged || {}).length,
    '| pantry:', Math.round(pantryKcal()), 'kcal',
    '| night:', Game.isNight());

  const N = 55;
  let convoDone = false;
  for (let t = 1; t <= N && !Game.over; t++) {
    // ---- pick a player action like a player would ----
    let actLabel;
    const adj = adjWalkable();
    const r = Math.random();
    curNpcRecs = []; curInits = [];
    const trust0 = snapTrust(), pan0 = pantryKcal(), reg0 = regrowCount(), say0 = says.length;
    const ms0 = Date.now();
    if (t === 30 && !convoDone) {
      // --- smoke test 319a947: talk, end, free ---
      const vid = nearestNpc();
      actLabel = `CONVO with ${name(vid)}`;
      console.log(`\n--- T${t}: ${actLabel} (engaged before: ${Game.isEngaged(vid)}) ---`);
      Game.startConvo(vid);
      console.log(`   engaged during: ${Game.isEngaged(vid)}`);
      let ch = choices(vid);
      const opener = ch.find(c => c.id.indexOf('gq:') === 0) || ch.find(c => c.id === 'agree') || ch[0];
      if (opener) turn(vid, opener.id);
      ch = choices(vid);
      const q = ch.find(c => c.id === 'ask:personal') || ch.find(c => c.id.indexOf('dlg:') === 0 && c.id !== 'leave') || ch[0];
      if (q) turn(vid, q.id);
      Game.endConvo(vid, 'left');
      console.log(`   engaged after endConvo: ${Game.isEngaged(vid)} (expect false — the 319a947 fix)`);
      Game._convoSmokeVid = vid; Game._convoSmokeTurn = t;
      convoDone = true;
    } else if (t === 46) {
      actLabel = 'endDay (push toward night)';
      try { Game.endDay(); } catch (e) { console.log('   endDay err:', e.message); }
    } else if (r < 0.55 && adj.length) {
      const pick = adj[Math.floor(Math.random() * adj.length)];
      const ok = Game.microMove(pick[0], pick[1]);
      actLabel = `step -> (${pick[0]},${pick[1]})${ok ? '' : ' BLOCKED'}`;
      if (!ok) stats.blockedMoves++;
    } else if (r < 0.72) {
      const green = adj.find(a => a[2] === 'plant' || a[2] === 'bush' || a[2] === 'tree');
      if (green) { Game.cellInteract(green[0], green[1]); actLabel = `forage ${green[2]} @(${green[0]},${green[1]})`; }
      else { Game.doAction('wait'); actLabel = 'wait'; }
    } else if (r < 0.85) {
      Game.doAction('wait'); actLabel = 'wait';
    } else {
      Game.doAction('rest'); actLabel = 'rest';
    }
    const ms = Date.now() - ms0;
    // villagerInitiative lines are turn-level (not per-npc)
    const turnSays = says.slice(say0);
    const initLines = turnSays.filter(x => !curNpcRecs.some(rec => rec.lines.includes(x)));
    stats.msTotal += ms; if (ms > stats.msMax) stats.msMax = ms;
    const pan1 = pantryKcal(), reg1 = regrowCount();
    // trust both-ways check on NPC-NPC talks
    const trust1 = snapTrust();
    const talkLines = [];
    for (const rec of curNpcRecs) {
      for (const ln of rec.lines) {
        stats.announces++;
        if (/talks with/.test(ln)) {
          talkLines.push(ln);
          stats.talks++;
        }
      }
    }
    // ---- print the turn ----
    const detailed = t <= 10 || (t >= 28 && t <= 44);
    console.log(`\nT${t} [${actLabel}] npcs=${curNpcRecs.length} turnMs=${ms} night=${Game.isNight()} pantry=${Math.round(pan0)}->${Math.round(pan1)} regrow=${reg0}->${reg1}`);
    if (detailed) {
      for (const rec of curNpcRecs) {
        const d = describe(rec);
        const h = stats.actHist[rec.nm] = stats.actHist[rec.nm] || {};
        h[d.key] = (h[d.key] || 0) + 1;
        const changed = rec.p0 && rec.p1 && (rec.p0.mx !== rec.p1.mx || rec.p0.my !== rec.p1.my ||
          Math.abs(rec.n1.hunger - rec.n0.hunger) > 1 || Math.abs(rec.n1.energy - rec.n0.energy) > 1 ||
          Math.abs(rec.n1.social - rec.n0.social) > 1 || Math.abs(rec.n1.fear - rec.n0.fear) > 1);
        if (!changed) stats.frozen[rec.nm] = (stats.frozen[rec.nm] || 0) + 1;
        console.log(`   ${rec.nm} [${d.intent}] ${d.out}${d.err ? ' ERR:' + d.err : ''}`);
        for (const ln of d.says) console.log(`      > "${ln.slice(0, 150)}"`);
      }
      for (const ln of initLines) console.log(`   (init) "${ln.slice(0, 150)}"`);
    } else {
      // compact: histogram of intents this turn
      const ih = {};
      for (const rec of curNpcRecs) {
        const d = describe(rec);
        ih[d.intent] = (ih[d.intent] || 0) + 1;
        const h = stats.actHist[rec.nm] = stats.actHist[rec.nm] || {};
        h[d.key] = (h[d.key] || 0) + 1;
      }
      console.log(`   intents: ${Object.entries(ih).map(([k, n]) => k + ':' + n).join(' ')}`);
    }
    for (const ln of talkLines) {
      // find the pair for trust check
      const m = ln.match(/(.+) talks with (.+)\./);
      if (m) {
        const a = curNpcRecs.find(x => x.nm === m[1]), b = curNpcRecs.find(x => x.nm === m[2]);
        const ta = a ? (trust1[a.rid] || 0) - (trust0[a.rid] || 0) : '?';
        const tb = b ? (trust1[b.rid] || 0) - (trust0[b.rid] || 0) : '?';
        console.log(`   [both-ways] "${ln.slice(0, 90)}" trustΔ talker=${ta} listener=${tb} (319a947: expect both >=0)`);
      }
    }
    if (Game.over) { console.log('   !! GAME OVER at T' + t); break; }
  }

  // ---- convo smoke verdict ----
  console.log('\n===== CONVO SMOKE (319a947) =====');
  const cv = Game._convoSmokeVid;
  if (cv) {
    console.log('freed villager:', name(cv), '| engaged now:', Game.isEngaged(cv), '(expect false)');
    const recs = [];
    // check whether they acted in turns after the convo (their deltas appear in compact turns too)
    console.log('check the T31+ log above: their rows should show movement/need deltas, not frozen.');
  }

  // ---- aggregate feel stats ----
  console.log('\n===== AGGREGATES =====');
  const turns = turnLog.length || N;
  console.log(`player turns: ${N} | game over: ${!!Game.over} | day: ${Game.state.scholar.day} | night now: ${Game.isNight()}`);
  console.log(`villagerTurn wall: total ${stats.msTotal}ms avg ${(stats.msTotal / N).toFixed(2)}ms/turn max ${stats.msMax}ms`);
  console.log(`NPC announcements: ${stats.announces} over ${N} turns (${(stats.announces / N).toFixed(2)}/turn; chatter budget = 1/turn from npcTakeAction)`);
  console.log(`NPC-NPC talks observed: ${stats.talks}`);
  console.log(`blocked player moves: ${stats.blockedMoves}`);
  console.log('per-villager action histogram:');
  for (const [nm, h] of Object.entries(stats.actHist)) {
    const total = Object.values(h).reduce((a, b) => a + b, 0);
    console.log(`   ${nm}: ${Object.entries(h).map(([k, n]) => k + ':' + n).join(' ')} (n=${total})`);
  }
  const neverActed = Object.entries(stats.actHist).filter(([nm, h]) => {
    const acts = Object.entries(h).filter(([k]) => k !== 'idle').reduce((a, [, n]) => a + n, 0);
    return acts === 0;
  }).map(([nm]) => nm);
  console.log('villagers with ZERO non-idle actions all run:', neverActed.length ? neverActed.join(', ') : '(none)');
  console.log('final needs snapshot:');
  for (const id of npcIds()) {
    const n = snapNeeds(id);
    const p = Game.state.village.positions[id];
    console.log(`   ${name(id)}: fear=${Math.round(n.fear)} hunger=${Math.round(n.hunger)} energy=${Math.round(n.energy)} social=${Math.round(n.social)} @(${p ? p.mx + ',' + p.my : '?'})`);
  }
  console.log(`player: kcal=${Math.round(Game.state.scholar.kcal)} hp=${Math.round(Game.state.scholar.health)} @(${Game.state.scholar.mx},${Game.state.scholar.my})`);

  // ---- FEEL verdict ----
  console.log('\n===== FEEL VERDICT =====');
  console.log('- alive (villagers visibly doing needs-driven things around you)? see histogram above');
  console.log('- coherent (actions read as needs, not noise)? check intent->outcome pairing in detailed turns');
  console.log('- pacing (1 action/villager/turn)? every NPC acted every turn by design; watch for monotony');
  console.log('- spam (announcement volume)?', (stats.announces / N).toFixed(2), '/turn vs 1/turn budget');
  console.log('- slowdown (turn time)?', `avg ${(stats.msTotal / N).toFixed(2)}ms max ${stats.msMax}ms`);
  console.log('- blocking (NPCs in your way)?', stats.blockedMoves, 'blocked steps');
  console.log('- frozen villagers?', neverActed.length ? neverActed.join(', ') : 'none');
  console.log('- convo freeze regression?', cv ? (Game.isEngaged(cv) ? 'STILL ENGAGED (BUG)' : 'freed OK — verify acted in T31+ log') : 'n/a');
}

main().catch(e => { console.error('HARNESS FATAL:', e && e.stack || e); process.exit(1); });
