#!/usr/bin/env node
// FEEL PLAYTEST (2026-10-07), EXPLORER archetype — the OUT-AND-BACK expedition.
// Angle NOT covered by the corner-walk run (edge/map-fill) or the curiosity
// run (whisper→examine→reveal density): the RETURN trip. Exploration is
// two-way. Questions:
//   (a) does the return leg feel like a homecoming, or dead air / wallpaper?
//   (b) is arrival text identical on revisit (design: fixed per tile — does
//       that read as place identity, or monotony?)
//   (c) does ANYTHING new happen on revisit (whispers, discoveries, gossip
//       drift from travelTimeStep)?
//   (d) can a player navigate somewhere on purpose (targeted destination)?
// Seeded RNG (mulberry32, SEED env) for reproducibility.
// Engine read-only from HEAD extract (/tmp/headjs) — immune to worktree churn.
// Run: node scripts/play-feel-20261007-explorer-return.js
const fs = require('fs');
const path = require('path');
const WS = '/home/hatch/workspace/the-scattering';
const ROOT = '/tmp/headjs'; // HEAD-frozen engine
const SEED = parseInt(process.env.SEED || '20261007', 10);
(function seed() {
  let a = SEED >>> 0;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(WS, f), 'utf8'))) });
global.window = global; // equipment.js needs window at load
// FULL production list (index.html order), minus DOM-only modules
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/build.js',
 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window; // runtime checks must take the sync path
const Game = globalThis.Scattering.Game;
const Ex = globalThis.Scattering.Examine;

const says = [];
const results = [];
const note = (t) => console.log(t);
const check = (name, cond, detail) => {
  results.push([name, !!cond]);
  note(`   [${cond ? 'OK' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
};
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
const drain = () => says.splice(0);
function tileAt(x, y) { try { return Game.tileAt(x, y) || null; } catch (e) { return null; } }
function manhattan(a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]); }
const key = (x, y) => x + ',' + y;

// BFS over travelTargets (what the player can actually reach this turn),
// optionally avoiding blockedEdges ("ax,ay>bx,by").
function bfsPathAvoid(tx, ty, blockedEdges) {
  const start = key(Game.map.px, Game.map.py);
  const prev = { [start]: null };
  const q = [[Game.map.px, Game.map.py]];
  const here = key(tx, ty);
  while (q.length) {
    const [cx, cy] = q.shift();
    if (key(cx, cy) === here) break;
    // simulate position for travelTargets: temporarily set map pos
    const ox = Game.map.px, oy = Game.map.py;
    Game.map.px = cx; Game.map.py = cy;
    let targets = [];
    try { targets = Game.travelTargets(); } catch (e) { /* treat as no targets */ }
    Game.map.px = ox; Game.map.py = oy;
    for (const t of targets) {
      const k = key(t.x, t.y);
      if (blockedEdges && blockedEdges.has(key(cx, cy) + '>' + k)) continue;
      if (!(k in prev)) { prev[k] = [cx, cy]; q.push([t.x, t.y]); }
    }
  }
  if (!(here in prev)) return null;
  const path = [];
  let cur = [tx, ty];
  while (cur) { path.unshift(cur); cur = prev[key(cur[0], cur[1])]; }
  return path;
}
function bfsPath(tx, ty) { return bfsPathAvoid(tx, ty, null); }

// walk a node path, capturing say-text per hop. Returns legs [{to, text}].
// On a blocked/refused hop, routes AROUND the edge (BFS avoiding it) like a
// player would — never pushes through.
function walkPath(path, finalDest) {
  const legs = [];
  const blockedEdges = new Set();
  const queue = path.slice(1).map(p => [p[0], p[1]]);
  let guard = 80;
  while (queue.length && guard-- > 0) {
    const [tx, ty] = queue.shift();
    says.length = 0;
    let moved = false;
    try {
      const r = Game.travelTo(tx, ty);
      moved = (Game.map.px === tx && Game.map.py === ty);
      legs.push({ to: [Game.map.px, Game.map.py], text: drain().join('\n'), intended: [tx, ty], moved,
                  blocked: !!(r && r.blocked) });
    } catch (e) {
      says.push('THREW: ' + e.message);
      legs.push({ to: [Game.map.px, Game.map.py], text: drain().join('\n'), intended: [tx, ty], moved: false, blocked: false });
    }
    if (moved) continue;
    blockedEdges.add(key(Game.map.px, Game.map.py) + '>' + key(tx, ty));
    const dest = finalDest || [tx, ty];
    const alt = bfsPathAvoid(dest[0], dest[1], blockedEdges);
    if (alt && alt.length > 1) {
      queue.splice(0, 0, ...alt.slice(1).map(p => [p[0], p[1]]));
    } else break;
  }
  return legs;
}

function gossipCount() {
  const g = Game.state.gossip || {};
  return Object.keys(g).length;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.village.trust[Game.villagerId] = 70;
  note('=== EXPLORER OUT-AND-BACK 2026-10-07 (seed ' + SEED + ') ===');
  // discover actual world bounds from the generated map
  let W = 0, H = 0;
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (tileAt(x, y)) { W = Math.max(W, x + 1); H = Math.max(H, y + 1); }
  const hx = Game.map.px, hy = Game.map.py;
  note(`   world ${W}x${H}, haven @ (${hx},${hy})`);

  // pick a distant destination: prefer a ruin, else far corner-ish tile
  let dest = null, destKind = null;
  for (let y = 0; y < H && !dest; y++) for (let x = 0; x < W && !dest; x++) {
    const t = tileAt(x, y);
    if (t && t.type === 'ruin' && manhattan([x, y], [hx, hy]) >= 3) { dest = [x, y]; destKind = 'ruin'; }
  }
  if (!dest) { dest = [W - 1, 0]; destKind = 'corner'; }
  note(`   destination: ${destKind} @ (${dest})  manhattan=${manhattan([hx, hy], dest)}`);

  // --- ACT 1: OUTBOUND ---
  note('\n=== ACT 1: outbound leg ===');
  const g0 = gossipCount();
  const outPath = bfsPath(dest[0], dest[1]);
  check('destination reachable by BFS', !!outPath, outPath ? `${outPath.length - 1} hops` : 'UNREACHABLE');
  const out = outPath ? walkPath(outPath) : [];
  const arrived = Game.map.px === dest[0] && Game.map.py === dest[1];
  note(`   walked ${out.length} hops, arrived=${arrived}`);
  const g1 = gossipCount();
  const outChars = out.map(l => l.text).join(' ').length;
  note(`   outbound arrival text chars: ${outChars}; gossip ${g0}->${g1}`);
  const outSample = (out[0] && out[0].text || '').slice(0, 200).replace(/\n/g, ' / ');
  note(`   sample outbound arrival: "${outSample}"`);

  // --- ACT 2: poke the destination ---
  note('\n=== ACT 2: poke the destination ===');
  says.length = 0;
  let examined = 0;
  try {
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    outer: for (let cy = 0; cy < 9 && examined < 2; cy++) for (let cx = 0; cx < 9 && examined < 2; cx++) {
      const cell = detail[cy] && detail[cy][cx];
      if (['plant', 'bush', 'tree'].indexOf(cell) === -1) continue;
      Game.state.scholar.mx = Math.min(8, cx + 1); Game.state.scholar.my = cy;
      try { Ex.examinePlantCell(cx, cy); examined++; } catch (e) { /* ignore */ }
    }
  } catch (e) { says.push('POKE THREW: ' + e.message); }
  const pokeText = drain().join(' ');
  note(`   examined ${examined} features; poke text chars=${pokeText.length}`);

  // --- ACT 3: RETURN LEG — reverse the outbound path ---
  note('\n=== ACT 3: return leg (reverse path) ===');
  const retPath = outPath ? outPath.slice().reverse() : [[Game.map.px, Game.map.py]];
  const ret = walkPath(retPath);
  const retTexts = ret.map(l => l.text);
  const retChars = retTexts.join(' ').length;
  const silentLegs = retTexts.filter(t => !t.length).length;
  note(`   return legs=${retTexts.length} text chars=${retChars} silentLegs=${silentLegs}`);
  // per-node comparison: out leg i arrives at outPath[i+1]; return leg j
  // arrives at retPath[j+1] = outPath[len-1-j]. Same node when i+1 = len-1-j.
  let compare = 0, identical = 0, novelOnReturn = 0;
  const len = outPath ? outPath.length : 0;
  for (let i = 0; i < out.length && len; i++) {
    const j = (len - 2) - i;
    if (j < 0 || j >= retTexts.length) continue;
    const a = (out[i].text || '').trim(), b = (retTexts[j] || '').trim();
    if (!a && !b) continue;
    compare++;
    if (a === b) identical++;
    else if (a && b) novelOnReturn++;
  }
  note(`   comparable node-legs=${compare} verbatim-identical=${identical} different=${novelOnReturn}`);
  // DESIGN (verified): first visit gets the flavor paragraph; revisits get
  // only the travel line, plus fresh ambient beats (wildlife vignettes) on
  // some legs. So verbatim repeat should be ~0 AND return legs shouldn't be
  // silent — the novelty comes from new beats, not repeated flavor.
  const outFlavor = out.filter(l => (l.text || '').split('\n').length >= 3).length;
  const retBeats = retTexts.filter(t => /Movement|whisper|crow|flicker|chattering|Something moves/i.test(t)).length;
  note(`   outbound legs with flavor paragraph=${outFlavor}/${out.length} return legs with fresh beats=${retBeats}/${retTexts.length}`);
  check('first visit gets flavor', outFlavor >= Math.max(1, out.length - 2), `${outFlavor}/${out.length}`);
  check('revisit does NOT repeat flavor (no wallpaper)', identical === 0, `${identical} verbatim`);
  // ambient beats are seasoning, not guaranteed: on short returns (<=3 legs)
  // zero beats is fine; on longer returns at least one keeps the walk alive.
  const beatOk = retBeats >= 1 || retTexts.length <= 3;
  note(`   [${beatOk ? 'OK' : 'SOFT'}] revisit ambient-beat rate — ${retBeats}/${retTexts.length} return legs got fresh beats`);
  check('no silent return legs', silentLegs === 0, `${silentLegs} silent`);
  const returnJoined = retTexts.join('\n');
  const noveltyMarkers = ['whisper', 'Tracks', 'tracks', 'discover', 'Discover', '💡', '❓', '📜'];
  const novelBits = noveltyMarkers.filter(m => returnJoined.indexOf(m) !== -1);
  note(`   revisit novelty markers present: ${novelBits.join(', ') || '(none)'}`);
  const g2 = gossipCount();
  note(`   gossip ${g0} -> outbound ${g1} -> return ${g2} (travelTimeStep drift: ${g2 > g0 ? 'YES' : 'no'})`);

  // --- ACT 4: targeted navigation — to a known distant village ---
  // Villages live in state.otherVillages (x,y tile coords), not as tiles.
  note('\n=== ACT 4: targeted navigation ===');
  const start = [Game.map.px, Game.map.py];
  const others = (Game.state.otherVillages || []).filter(v => manhattan(start, [v.x, v.y]) >= 3);
  if (others.length) {
    const target = others[0];
    const mh = manhattan(start, [target.x, target.y]);
    const navPath = bfsPath(target.x, target.y);
    const nav = navPath ? walkPath(navPath, [target.x, target.y]) : [];
    const ok = Game.map.px === target.x && Game.map.py === target.y;
    const detours = nav.filter(l => l.blocked).length;
    note(`   target ${target.name} @ (${target.x},${target.y}) manhattan=${mh} bfsHops=${navPath ? navPath.length - 1 : 'n/a'} walked=${nav.length} detours=${detours} arrived=${ok}`);
    check('targeted navigation reaches destination', ok, `BFS path ${navPath ? navPath.length - 1 : '?'} hops, ${detours} blockage detour(s)`);
  } else { note('   no distant village in otherVillages on this worldgen — skipped'); }

  // --- ACT 5: map knowledge ---
  note('\n=== ACT 5: map knowledge ===');
  const seen = Game.state.scholar.seenTiles || {};
  const keys = Object.keys(seen);
  const kinds = {};
  keys.forEach(k => { kinds[seen[k].k] = (kinds[seen[k].k] || 0) + 1; });
  note(`   seenTiles=${keys.length} kinds=${JSON.stringify(kinds)}`);
  check('visited distinct from merely-seen', (kinds['v'] || 0) > 0, JSON.stringify(kinds));
  const havenSeen = seen[hx + ',' + hy];
  check('haven recorded as visited', !!(havenSeen && havenSeen.k === 'v'));

  note('\n=== EXPLORER OUT-AND-BACK COMPLETE ===');
  const fails = results.filter(r => !r[1]).map(r => r[0]);
  note(fails.length ? `FAILURES: ${fails.join('; ')}` : 'all checks passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
