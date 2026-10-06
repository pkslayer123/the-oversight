// KNOWLEDGE FEEL: plant arc — played as a player.
// Blind forage -> familiarity -> taught identification -> L2 (5 harvests) ->
// L3 (3 tastings) -> L4 (15 harvests). Plus: return-to-haven teaching moment
// reachability, and journal/codex framing pre-codex.
// Usage: node scripts/play-knowledge-feel-plant.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/corpses.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

function drain() { const l = Game.log.join('\n'); Game.log.length = 0; return l; }
function show(title, log, maxLines) {
  const lines = log.split('\n').filter(l => l.trim());
  console.log(`\n### ${title} (${lines.length} lines)`);
  for (const l of lines.slice(0, maxLines || 12)) console.log('  | ' + l.slice(0, 230));
  if (lines.length > (maxLines || 12)) console.log(`  ... (${lines.length - (maxLines || 12)} more)`);
}
function toWildNode() {
  const s = Game.state.scholar;
  const tiles = Game.map.tiles; let best = null;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const t = tiles[y][x];
    if (!t || t.type === 'haven' || t.type === 'ruin') continue;
    const d = Math.abs(x - 3) + Math.abs(y - 3);
    if (d < 2) continue;
    if (!best || d > best.d) best = { x, y, d };
  }
  Game.map.px = best.x; Game.map.py = best.y;
  tiles[best.y][best.x].visited = true; tiles[best.y][best.x].revealed = true;
  s.insideHaven = false; s.mx = 4; s.my = 4;
  // remember where the wilds are, so we can walk back after camp
  Game.__wildNode = { x: best.x, y: best.y };
}
function backToWild() {
  const w = Game.__wildNode;
  if (!w) return toWildNode();
  Game.map.px = w.x; Game.map.py = w.y;
  Game.state.scholar.insideHaven = false;
}
// stand next to the nearest forageable cell (like a player walking to green)
function moveToGreen() {
  const s = Game.state.scholar;
  const FORAGEABLE = { plant: 1, bush: 1, tree: 1, bigtree: 1 };
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const t = Game.tileAt(Game.map.px, Game.map.py);
  let best = null;
  for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    if (!FORAGEABLE[detail[cy][cx]]) continue;
    if (t.detailRegrow && t.detailRegrow[cx + ',' + cy]) continue;
    const d = Math.abs(cx - 4) + Math.abs(cy - 4);
    if (!best || d < best.d) best = { cx, cy, d };
  }
  if (best) { s.mx = Math.min(8, Math.max(0, best.cx)); s.my = Math.min(8, Math.max(0, best.cy)); }
  return !!best;
}
// THE SKILLED PLAY (Steve's design): post-identification, walk to THAT
// species' patch and forage deliberately. Finds cells of the given species.
function moveToSpecies(pid) {
  const s = Game.state.scholar;
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const t = Game.tileAt(Game.map.px, Game.map.py);
  let best = null;
  for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    const c = detail[cy] && detail[cy][cx];
    if (!c) continue;
    if (t.detailRegrow && t.detailRegrow[cx + ',' + cy]) continue;
    let sp = null;
    try { sp = Game.cellPlantSpecies(t, cx, cy, c); } catch (e) {}
    if (sp !== pid) continue;
    const d = Math.abs(cx - s.mx) + Math.abs(cy - s.my);
    if (!best || d < best.d) best = { cx, cy, d };
  }
  if (best) { s.mx = best.cx; s.my = best.cy; return true; }
  return false;
}
// advance days so stripped cells regrow (detailRegrow day+2)
function advanceDays(n) {
  for (let i = 0; i < n; i++) {
    Game.state.scholar.day++;
    try { Game.regrowTiles(); } catch (e) {}
  }
}

(async () => {
  await Game.init();
  console.log('=== KNOWLEDGE FEEL: PLANT ARC ===');
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  toWildNode();
  moveToGreen();
  drain();

  // ---------- BEAT 1: blind forage ----------
  console.log('\n--- BEAT 1: BLIND FORAGE (ignorant) ---');
  Game.doAction('forage');
  const f1log = drain();
  show('blind forage log', f1log, 14);
  console.log('pack after blind forage:');
  for (const it of (s.inventory || []).slice(0, 8)) {
    console.log('  -', JSON.stringify(Game.itemDisplayName(it)), '| kcalEach:', it.kcalEach, '| plantId:', it.plantId || '(none)');
  }
  const pids = [...new Set((s.inventory || []).map(i => i.plantId).filter(Boolean))];
  console.log('species foraged:', JSON.stringify(pids));
  console.log('codexInProgress (UNIDENTIFIED data):', JSON.stringify((Game.codexInProgress() || []).slice(0, 4).map(u => ({ pid: u.pid, enc: u.enc, threshold: u.threshold }))));

  // ---------- BEAT 2: familiarity through repeated foraging ----------
  console.log('\n--- BEAT 2: FAMILIARITY (forage, wait for regrow, repeat) ---');
  // track the MOST-ENCOUNTERED species (the abundant one on this node —
  // tracking a rare species stalls the arc and measures nothing)
  function mostSeen() {
    const enc = Game.state.codex.encounters || {};
    let best = null;
    for (const [id, n] of Object.entries(enc)) {
      if (Game.plantKnown(id)) continue;
      if (!best || n > best.n) best = { pid: id, n };
    }
    return best;
  }
  function tidyPack() {
    // simulate real play: eat down the pack so foraging isn't blocked
    const s = Game.state.scholar;
    s.kcal = 0;
    for (let i = s.inventory.length - 1; i >= 0; i--) {
      const it = s.inventory[i];
      if ((it.kcalEach || 0) > 0 && it.edible !== false && (it.units || 0) > 0 && !it.plantId) {
        try { Game.eatOne(i); } catch (e) {}
      }
    }
    // drop crafting materials ballast if still heavy
    for (let i = s.inventory.length - 1; i >= 0; i--) {
      const it = s.inventory[i];
      if (it.material && (it.units || 0) > 4) it.units = 4;
    }
  }
  let tracked = mostSeen();
  console.log('most-seen species:', JSON.stringify(tracked));
  if (!tracked) { console.log('NO species encountered — cannot run plant arc on this node'); process.exit(3); }
  let forages = 1;
  for (let round = 0; round < 8 && tracked && !Game.plantKnown(tracked.pid); round++) {
    advanceDays(3);
    tidyPack();
    moveToGreen();
    Game.doAction('forage');
    forages++;
    drain();
    tracked = mostSeen() || tracked;
    const enc = (Game.state.codex.encounters || {})[tracked.pid] || 0;
    const th = ((Game.state.codex.learnThreshold || {})[tracked.pid]);
    console.log(`  forage #${forages}: tracking=${tracked.pid} encounters=${enc} threshold=${th} known=${Game.plantKnown(tracked.pid)}`);
  }
  const pid = tracked.pid;
  const plant = Game.data.plants.find(p => p.id === pid);
  console.log('identified by foraging alone?', Game.plantKnown(pid), '(expect false — foraging never identifies, only teaches care)');
  const inprog = (Game.codexInProgress() || []).find(u => u.pid === pid);
  console.log('UNIDENTIFIED card data:', JSON.stringify(inprog));

  // ---------- BEAT 3a: SORTBAG — the camp ritual (self-identification) ----------
  console.log('\n--- BEAT 3a: SORTBAG AT CAMP (solo — "it clicks") ---');
  console.log('pre-sort: plantKnown(' + pid + ') =', Game.plantKnown(pid),
    '| fieldClick =', Game.plantFieldClick(pid));
  // haul to camp: atCamp needs map at village tile
  {
    const v = Game.state.village;
    Game.map.px = v.px ?? 3; Game.map.py = v.py ?? 3;
    Game.state.scholar.insideHaven = true;
  }
  console.log('atCamp:', Game.atCamp());
  // the lump is in the pack; sortBag takes (vid, idx, container)
  const lumpIdx = Game.state.scholar.inventory.findIndex(i => i.lump && i.lump[pid]);
  console.log('lump with ' + pid + ' at pack idx:', lumpIdx);
  drain();
  if (lumpIdx >= 0) Game.sortBag(null, lumpIdx, Game.state.scholar.inventory);
  else console.log('(no ' + pid + ' lump — it may have been split already)');
  show('sortBag solo', drain(), 10);
  console.log('post-sort: plantKnown(' + pid + ') =', Game.plantKnown(pid),
    '| level:', (Game.state.codex.plants[pid] || {}).level,
    '| by:', (Game.state.codex.plants[pid] || {}).by);
  console.log('\n--- BEAT 3: TAUGHT IDENTIFICATION (a different plant) ---');
  // set up a good teacher: a cook villager who knows this plant, high trust
  const v = Game.state.village;
  const teacherId = (v.roster || []).find(rid => rid !== Game.villagerId);
  const tv = Game.data.villagers.find(x => x.id === teacherId) || {};
  // pick a plant the player does NOT know (not the sortBag one)
  const teachPid = (Game.data.plants.map(p => p.id).find(id => !Game.plantKnown(id) && id !== pid)) || pid;
  console.log('teaching:', teachPid, '| teacher:', Game.displayName(teacherId), '| occupation:', tv.formerOccupation, '| trust:', (v.trust || {})[teacherId]);
  // force the setup: teacher knows the plant, is a cook, trusted
  v.taught[teacherId] = [...new Set([...(v.taught[teacherId] || []), teachPid])];
  tv.formerOccupation = 'cook';
  v.trust = v.trust || {}; v.trust[teacherId] = 45;
  // ensure shared language (commLevel full)
  drain();
  const taught = Game.teachPlant(teacherId, teachPid);
  show('teaching moment', drain(), 10);
  console.log('plantKnown now:', Game.plantKnown(teachPid), '| level:', (Game.state.codex.plants[teachPid] || {}).level);
  console.log('journal flag (pre-codex handwritten):', (Game.state.codex.plants[teachPid] || {}).journal, '| codexUnlocked:', !!s.codexUnlocked);
  console.log('pack now shows:', JSON.stringify(s.inventory.filter(i => i.plantId === teachPid).slice(0, 2).map(i => Game.itemDisplayName(i))));

  // ---------- BEAT 4: L2 via harvests (TARGETED foraging — the skilled play) ----------
  console.log('\n--- BEAT 4: L2 — 5 HARVESTS, TARGETED (yield +50%, uses unlocked) ---');
  let l2at = null;
  backToWild();
  for (let round = 0; round < 14; round++) {
    advanceDays(3);
    tidyPack();
    const found = moveToSpecies(pid);
    drain();
    Game.doAction('forage');
    const lg = drain();
    const e = (Game.state.codex.plants[pid] || {});
    if (!l2at) console.log(`  forage: patchFound=${found} harvests=${e.harvests || 0} level=${e.level} (tracking ${pid})`);
    if (e.level >= 2 && !l2at) {
      l2at = round + 1;
      show('L2 moment', lg.split('\n').filter(l => /Deeper knowledge|IDENTIFIED|★/.test(l)).join('\n'), 6);
      console.log('  uses now:', JSON.stringify((Game.plantUsesText(pid) || '').slice(0, 160)));
    }
    if (e.level >= 2) break;
  }
  console.log('targeted forage sessions to L2:', l2at);

  // ---------- BEAT 5: L3 via tastings ----------
  console.log('\n--- BEAT 5: L3 — EAT IT 3 TIMES (uses known, +5 health) ---');
  // find edible items of this plant in pack
  const edible = s.inventory.filter(i => i.plantId === pid && i.kcalEach > 0);
  console.log('edible units in pack:', edible.reduce((t, i) => t + (i.units || 0), 0));
  let l3at = null;
  for (let t = 0; t < 6; t++) {
    const idx = s.inventory.findIndex(i => i.plantId === pid && i.kcalEach > 0 && (i.units || 0) > 0);
    if (idx < 0) { console.log('  (no more edible units — topping up)'); s.inventory.push({ plantId: pid, name: plant.name, units: 3, kcalEach: plant.caloriesPerUnit || 50, edible: true, spoilDay: s.day + 3 }); continue; }
    drain();
    // eat one unit via Game.eatOne if available, else manual
    try { Game.eatOne(idx); } catch (e) { const it = s.inventory[idx]; it.units--; if (it.units <= 0) s.inventory.splice(idx, 1); }
    const lg = drain();
    const e = (Game.state.codex.plants[pid] || {});
    console.log(`  tasting #${t + 1}: tastings=${e.tastings || 0} level=${e.level}`);
    if (e.level >= 3 && !l3at) { l3at = t + 1; show('L3 moment', lg.split('\n').filter(l => /Deeper knowledge|★/.test(l)).join('\n'), 6); }
    if (e.level >= 3) break;
  }
  console.log('tastings to L3:', l3at);

  // ---------- BEAT 6: L4 mastery (TARGETED) ----------
  console.log('\n--- BEAT 6: L4 MASTERY — 15 HARVESTS AT L3, TARGETED ---');
  let l4at = null;
  for (let round = 0; round < 28; round++) {
    advanceDays(3);
    tidyPack();
    moveToSpecies(pid);
    drain();
    Game.doAction('forage');
    const lg = drain();
    const e = (Game.state.codex.plants[pid] || {});
    if (round % 4 === 0 || e.level >= 4) console.log(`  forage: harvests=${e.harvests || 0} level=${e.level}`);
    if (e.level >= 4 && !l4at) { l4at = round + 1; show('L4 moment', lg.split('\n').filter(l => /MASTERY|★/.test(l)).join('\n'), 6); }
    if (e.level >= 4) break;
  }
  console.log('targeted forage sessions L3->L4:', l4at);

  // ---------- BEAT 7: return-to-haven teaching moment reachability ----------
  console.log('\n--- BEAT 7: RETURN-TO-HAVEN "WHAT\'S THIS?" MOMENT ---');
  // Gate audit, no RNG: the moment needs (a) unprocessed haul, (b) a
  // villager with trust > 30, (c) who knows a plant you don't, (d) 50% RNG.
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s2 = Game.state.scholar;
  const v2 = Game.state.village;
  const myId = Game.villagerId;
  const trusts = (v2.roster || []).filter(r => r !== myId).map(r => (v2.trust || {})[r] || 0);
  console.log('day-1 trust distribution (need >30):', JSON.stringify(trusts));
  console.log('max trust:', Math.max(...trusts, 0), '| any villager > 30?', trusts.some(t => t > 30));
  // how fast can talk raise trust? simulate 10 talk actions on one villager
  const talkId = (v2.roster || []).find(r => r !== myId);
  console.log('talk target:', Game.displayName(talkId), '| start trust:', (v2.trust || {})[talkId]);
  // find the talk/trust function
  const t0 = (v2.trust || {})[talkId] || 0;
  for (let i = 0; i < 10; i++) {
    try {
      // talk is via conversation; approximate with the trust tick the teach path uses
      if (Game.bumpTrust) Game.bumpTrust(talkId, 2);
    } catch (e) {}
  }
  console.log('trust after 10 bumpTrust(+2):', (v2.trust || {})[talkId], '(bumpTrust is the forager-return path, not talk)');
  // Now the moment itself, gates forced met: trust 35, teacher knows, haul, RNG forced
  const teacherId7 = talkId;
  const otherPid = (Game.data.plants.find(p => !Game.plantKnown(p.id)) || {}).id;
  v2.taught[teacherId7] = [...new Set([...(v2.taught[teacherId7] || []), otherPid])];
  v2.trust[teacherId7] = 35;
  toWildNode();
  moveToGreen();
  Game.doAction('forage');
  s2.inventory.push({ plantId: otherPid, name: 'unknown lump', lump: {}, units: 4, foodState: 'unknown', edible: false, spoilDay: s2.day + 3, kcalEach: 0 });
  s2.insideHaven = true;
  const realRandom = Math.random;
  Math.random = () => 0.1; // force the 50% gate to hit — measuring REACHABILITY
  drain();
  try { Game.returnToVillage(); } catch (e) { console.log('return err:', e.message); }
  Math.random = realRandom;
  const rlog = drain();
  const teachHit = rlog.split('\n').filter(l => /Around the fire, you show your haul/i);
  const identifiedHit = rlog.split('\n').filter(l => /IDENTIFIED/i);
  console.log('gates met (trust 35, teacher knows, haul, RNG forced):');
  console.log('  "Around the fire, you show your haul":', teachHit.length > 0);
  console.log('  IDENTIFIED via moment:', identifiedHit.length > 0);
  if (teachHit.length) teachHit.slice(0, 4).forEach(l => console.log('    | ' + l.slice(0, 200)));
  if (identifiedHit.length) identifiedHit.slice(0, 2).forEach(l => console.log('    | ' + l.slice(0, 200)));

  console.log('\n=== PLANT ARC DONE ===');
})().catch(e => { console.error('FATAL', e); process.exit(2); });
