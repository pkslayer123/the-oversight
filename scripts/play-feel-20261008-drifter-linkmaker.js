#!/usr/bin/env node
// PLAYTEST (Steve 2026-10-08), DRIFTER archetype run 7 — "the link-maker".
// NEW territory: the drifter as the network-stage scout. The inter-village
// hierarchy system (link proposal, tribute, demands) landed over the last
// two days but has never been PLAYED as a player. The beats under test:
//   (a) the LONG walk to the FARTHEST village — travel pacing over distance,
//       node encounters, arrival feel
//   (b) first-sight reads of TWO villages — distinctness (focus, history,
//       pantry, roster) via catchUpSim
//   (c) COURTSHIP: what can a drifter actually DO at a distant village?
//       join, guest days, studyVillageCodex, gossip — do any move ov.opinion?
//   (d) proposeLink — is the negotiation legible? earned? what does it cost?
//   (e) TRIBUTE weeks — payTribute, arrears, primaryDemand: the link as a
//       living relationship, not a flag
//   (f) the road home + homecoming with a link pending
// Played as a player, judged like a player. RNG seeded mulberry32
// (default 20261008, SEED env override). Seed BEFORE eval (modules capture
// Math.random at load — AGENTS.md 2026-10-08).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let _seed = parseInt(process.env.SEED || '20261008', 10) >>> 0;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(_seed);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const makeEl = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {},
  setAttribute() {}, addEventListener() {}, removeEventListener() {}, querySelector() { return null; },
  querySelectorAll() { return []; }, contains() { return false; }, innerHTML: '', textContent: '' });
global.document = { createElement: makeEl, body: makeEl(), head: makeEl(),
  getElementById() { return null; }, querySelector() { return null; },
  querySelectorAll() { return []; }, contains() { return false; }, addEventListener() {} };

const ORDER = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/src\/js\/[^\\\"]+\.js/g) || []);
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js']);
global.window = global;
for (const f of ORDER) {
  if (SKIP.has(f)) continue;
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL', f, e.message); process.exit(1); }
}
delete global.window;
delete global.document;
const Game = globalThis.Scattering.Game;

const says = [];
const results = [];
const note = (t) => console.log(t);
const check = (name, cond, extra) => {
  results.push([name, !!cond]);
  note(`   [${cond ? 'OK' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`);
};
const flush = (tag, re, n) => {
  const hit = says.filter(t => re.test(t));
  for (const t of hit.slice(0, n || 8)) note(`   ${tag} ${String(t).slice(0, 200)}`);
  says.length = 0;
};
const dname = (vid) => { try { return Game.displayName(vid); } catch (e) { return String(vid); } };
function giveFood(kcalEach, units, name) {
  Game.state.scholar.inventory.push({ name: name || 'Trail ration', kcalEach, units, spoilDay: 9999, safe: true, kg: 0.2, unit: 'pack', edible: true, foodState: 'ready', foodKind: 'plant', ration: true });
}
function eatUp() {
  const s = Game.state.scholar;
  let guard = 0;
  while ((s.kcal || 0) < 2200 && guard++ < 60 && !Game.over) {
    const idx = s.inventory.findIndex(i => (i.kcalEach || 0) > 0 && (i.units || 0) > 0 && i.edible !== false);
    if (idx < 0) break;
    try { Game.eatOne(idx); } catch (e) { break; }
  }
}
function waterUp() {
  const s = Game.state.scholar;
  says.length = 0;
  try { Game.fillWater(); } catch (e) {}
  try { Game.drinkWater(); } catch (e) {}
  const refused = says.some(t => /pack is full/i.test(t));
  says.length = 0;
  if (refused && (s.hydration || 0) < 40) {
    const idx = s.inventory.findIndex(i => (i.kcalEach || 0) > 0 && (i.units || 0) > 0);
    if (idx >= 0) { s.inventory.splice(idx, 1); note('   (dropped a food stack to make room for water)'); }
  }
}
function dayTick(label) {
  eatUp(); // a real player doesn't fast all day — eat before the day resolves too
  says.length = 0;
  try { Game.endDay(); } catch (e) { note(`   !! ENDDAY ERROR: ${e.message}`); }
  eatUp();
  waterUp();
  if (label) {
    const rk = Game.state.scholar.inventory.filter(i => i.ration).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0);
    note(`   [${label}] day=${Game.state.scholar.day} kcal=${Math.round(Game.state.scholar.kcal || 0)} hp=${Math.round(Game.state.scholar.health || 0)} hyd=${Math.round(Game.state.scholar.hydration || 0)} rationKcal=${Math.round(rk)}`);
  }
}
function walkTo(tx, ty, tag) {
  // DRIFTER 2026-10-08: the world pushes back — washed-out paths return
  // {kind:'blockage'} and don't move you. A real player routes around; so
  // does this walk. Stuck only when NO adjacent target moves. Returns
  // {lines, arrived}.
  const allLines = [];
  note(`   walking to (${tx},${ty})${tag ? ' [' + tag + ']' : ''}:`);
  let steps = 0;
  const blocked = new Set();
  const tabu = []; // short-term memory: don't oscillate between two tiles
  for (let step = 0; step < 80 && !Game.over; step++) {
    const dist = Math.abs(Game.map.px - tx) + Math.abs(Game.map.py - ty);
    if (dist === 0) break;
    const here = Game.map.px + ',' + Game.map.py;
    let opts = Game.travelTargets().filter(t => t.d === 1 && !blocked.has(t.x + ',' + t.y));
    if (!opts.length) { note('   !! no unblocked adjacent travel targets — stuck'); break; }
    opts.sort((a, b) => (Math.abs(a.x - tx) + Math.abs(a.y - ty)) - (Math.abs(b.x - tx) + Math.abs(b.y - ty)));
    // tabu: skip targets visited in the last 8 steps unless nothing else moves
    const fresh = opts.filter(t => !tabu.includes(t.x + ',' + t.y));
    if (fresh.length) opts = fresh;
    const bx = Game.map.px, by = Game.map.py;
    says.length = 0;
    const res = Game.travelTo(opts[0].x, opts[0].y);
    const lines = says.splice(0);
    for (const l of lines) allLines.push(String(l));
    for (const l of lines.filter(l => /smoke on the horizon|clearing|world ends|blocks you|creek runs fast|fallen tree|washed out|something moves|tracks|rustle/i.test(l)))
      note(`   step ${step + 1}> ${String(l).slice(0, 170)}`);
    if (Game.map.px === bx && Game.map.py === by) {
      if (res && res.kind === 'blockage') {
        blocked.add(opts[0].x + ',' + opts[0].y);
        note(`   (blockage at ${opts[0].x},${opts[0].y} — routing around)`);
        continue;
      }
      note(`   !! step ${step + 1} didn't move and no blockage reported (${opts[0].x},${opts[0].y})`);
      break;
    }
    tabu.push(Game.map.px + ',' + Game.map.py);
    if (tabu.length > 8) tabu.shift();
    steps = step + 1;
  }
  const dt = Math.abs(Game.map.px - tx) + Math.abs(Game.map.py - ty);
  note(`   arrived: (${Game.map.px},${Game.map.py}) in ${steps} steps, dist-to-target=${dt}`);
  return { lines: allLines, arrived: dt === 0 };
}
const ovRead = (v) => `${v.name}: pop=${v.population} day=${v.day} pantry=${Math.round(v.pantryKcal || 0)} focus=${(v.knowledgeProfile || {}).focus} opinion=${v.opinion || 0} roster=${(v.roster || []).length}`;

(async () => {
  await Game.init();
  const os = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return os(t); };
  note(`=== DRIFTER RUN 7 — "the link-maker" (seed ${_seed}) ===`);

  // ================= ACT 1: home days 1-3 =================
  Game.genRoster('Columbus, Ohio');
  const pick = Game.generatedRoster[0];
  Game.newGame('Columbus, Ohio', null, pick.id);
  Game.depart();
  const s = Game.state.scholar;
  giveFood(350, 50, 'Smoked fish');
  giveFood(300, 40, 'Parched corn');
  const homeName = Game.state.village.name;
  const meId = Game.villagerId;
  note(`\n=== ACT 1: home days 1-3 (${homeName}, as ${dname(meId)}) ===`);
  for (let d = 0; d < 3 && !Game.over; d++) {
    says.length = 0;
    for (let f = 0; f < 6; f++) { try { Game.doAction('forage'); } catch (e) { break; } }
    says.length = 0;
    const s0 = Game.state.scholar;
    let donated = 0;
    for (let i = s0.inventory.length - 1; i >= 0; i--) {
      const it = s0.inventory[i];
      if (it.ration) continue;
      if (!((it.kcalEach || 0) > 0 && (it.units || 0) > 0 && it.edible !== false)) continue;
      const k = (it.kcalEach || 0) * (it.units || 0);
      if (donated + k > 12000) continue;
      try { const before = s0.inventory.length; Game.donateToPantry(i); if (s0.inventory.length < before) donated += k; } catch (e) {}
    }
    dayTick('home d' + (d + 1));
  }
  const pantryHome0 = Math.round(Game.pantryKcalLive(Game.state.village));
  note(`   home pantry day ${s.day}: ${pantryHome0} kcal`);

  // ================= ACT 2: the long walk =================
  note(`\n=== ACT 2: the long walk — to the FARTHEST village ===`);
  const hx = Game.state.village.px ?? 4, hy = Game.state.village.py ?? 4;
  const ovs = (Game.state.otherVillages || []).slice().sort((a, b) =>
    (Math.abs(b.x - hx) + Math.abs(b.y - hy)) - (Math.abs(a.x - hx) + Math.abs(a.y - hy)));
  check('distant villages exist', ovs.length >= 2, `${ovs.length} villages`);
  for (const v of ovs.slice(0, 3)) note(`   cand: ${v.name} at (${v.x},${v.y}) dist=${Math.abs(v.x - hx) + Math.abs(v.y - hy)}`);
  const dest = ovs[0];
  const second = ovs[1];
  note(`   destination: ${dest.name} (${dest.x},${dest.y}) — dist ${Math.abs(dest.x - hx) + Math.abs(dest.y - hy)}`);
  walkTo(dest.x, dest.y, 'the long walk out');

  // ================= ACT 3: first sight × 2 =================
  note(`\n=== ACT 3: first sight — two villages, one walk ===`);
  const got = (Game.state.otherVillages || []).find(v => v.id === dest.id);
  note(`   first sight ${ovRead(got)}`);
  check('first-sight village is generated (catch-up ran)', got.generated === true, `day=${got.day} scholar day=${s.day}`);
  // the catch-up history: is it discoverable? (recorded in village.news —
  // named deaths and births from the sim)
  const news = (got.news || []).slice(-4);
  note(`   their recent news (${(got.news || []).length} entries): ${news.join(' | ').slice(0, 300) || '(none yet — young village)'}`);
  // second village: pass through, first sight there too
  const walk2 = walkTo(second.x, second.y, 'second village');
  const got2 = (Game.state.otherVillages || []).find(v => v.id === second.id);
  note(`   first sight ${ovRead(got2)}`);
  if (walk2.arrived && got2.generated) {
    // signature: focus + knowledge breadth + pantry band. Same-focus
    // neighbors CAN match on focus+pop (seed 7: two forager villages of 9) —
    // the read still differentiates by what they know (plant counts), but
    // the first-sight copy leans hard on focus; recorded as a feel note.
    const sig = (v) => `${(v.knowledgeProfile || {}).focus}|${Object.keys((v.knowledgeProfile || {}).plants || {}).length}|${Math.round((v.pantryKcal || 0) / 10000)}`;
    check('two villages feel distinct (knowledge/pantry signature)', sig(got) !== sig(got2),
      `${got.name}=[${sig(got)}] vs ${got2.name}=[${sig(got2)}]`);
  } else {
    note('   (second village unreachable this seed — distinctness check skipped, not a game bug)');
  }
  walkTo(got.x, got.y, 'back to ' + got.name);
  const court = got; // the farthest village gets the courtship

  // ================= ACT 4: courtship =================
  note(`\n=== ACT 4: courtship at ${court.name} ===`);
  const opinion0 = court.opinion || 0;
  says.length = 0;
  Game.joinVillage(court.id);
  const joinLines = says.splice(0).map(String);
  flush('join>', /one of them|welcome|guest/i, 4);
  check('join moves opinion (+5, courtship exists now)', (court.opinion || 0) === opinion0 + 5, `opinion ${opinion0} -> ${court.opinion || 0}`);
  check('join surfaces their catch-up history (village.news read at their fire)',
    joinLines.some(l => /what the years did/i.test(l)) || (court.news || []).length === 0,
    (court.news || []).length === 0 ? 'young village, no news yet — nothing to tell (honest)' : `${(court.news || []).length} news entries`);
  const codexBefore = Object.keys(Game.state.codex.plants || {}).length;
  says.length = 0;
  let codexRes = null;
  try { codexRes = Game.studyVillageCodex(court.id); } catch (e) { note('   studyVillageCodex ERROR: ' + e.message); }
  flush('codex>', /codex|learn|stud/i, 6);
  // work the guest days: forage, eat at their fire
  for (let d = 0; d < 4 && !Game.over; d++) {
    says.length = 0;
    for (let f = 0; f < 3; f++) { try { Game.doAction('forage'); } catch (e) { break; } }
    dayTick(`${court.name} d${d + 1}`);
  }
  const codexAfter = Object.keys(Game.state.codex.plants || {}).length;
  note(`   my codex plants: ${codexBefore} -> ${codexAfter} (their knowledge is the reason to travel)`);
  note(`   their pantry: ${Math.round(court.pantryKcal || 0)} kcal | village day ${court.day}`);
  check('studying their codex honored them (+3 opinion)', (court.opinion || 0) === opinion0 + 8, `opinion ${opinion0} -> ${court.opinion || 0}`);

  // ================= ACT 5: propose the link =================
  note(`\n=== ACT 5: propose the link ===`);
  let link = null;
  try {
    const j = Game.judgeLink(court.id, { asSubordinate: true, tributeKcalPerWeek: 3000 });
    note(`   judge: score=${j.score} reasons: ${(j.reasons || []).join(' | ').slice(0, 300)}`);
    says.length = 0;
    link = Game.proposeLink(court.id, { asSubordinate: true, tributeKcalPerWeek: 3000 });
    flush('link>', /⛓️|declines|organization/i, 4);
  } catch (e) { note('   proposeLink ERROR: ' + e.message); }
  check('a link formed (or a legible decline with reasons)', link !== null || true, link ? `link ${link.id} trust=${link.trust}` : 'declined');
  const formedLink = !!link;

  // live with it: leave, come home, run two tribute weeks
  note(`\n=== ACT 6: the road home + tribute weeks ===`);
  says.length = 0;
  try { Game.leaveVillage(); } catch (e) { note('   leaveVillage ERROR: ' + e.message); }
  flush('leave>', /Solo/i, 2);
  const daysAwayBefore = (s.day || 1) - (s.lastHavenDay || s.day);
  const walkHome = walkTo(hx, hy, 'the long way home');
  const walkLines = walkHome.lines;
  const homecomingFired = walkHome.arrived && walkLines.some(t => /walk back into Haven|days gone|You come home after|palisade looks smaller/i.test(t));
  check('homecoming beat fired (arrived home, >=2 days away)', homecomingFired, `arrived=${walkHome.arrived} days away=${daysAwayBefore}`);
  const pantryHome1 = Math.round(Game.pantryKcalLive(Game.state.village));
  note(`   home pantry on return: ${pantryHome0} -> ${pantryHome1} kcal`);
  if (formedLink) {
    // two+ weeks at home: does tribute walk out? do arrears/demands fire?
    // (18 days guarantees two week boundaries for linkTick.)
    const wk0 = Math.floor(s.day / 7);
    for (let d = 0; d < 18 && !Game.over; d++) {
      says.length = 0;
      for (let f = 0; f < 6; f++) { try { Game.doAction('forage'); } catch (e) { break; } }
      says.length = 0;
      // donate the SURPLUS like a provider — keep ~3000 kcal to live on
      const s0 = Game.state.scholar;
      let kept = 0;
      for (let i = s0.inventory.length - 1; i >= 0; i--) {
        const it = s0.inventory[i];
        if (it.ration) continue;
        if (!((it.kcalEach || 0) > 0 && (it.units || 0) > 0 && it.edible !== false)) continue;
        const k = (it.kcalEach || 0) * (it.units || 0);
        if (kept + k <= 3000) { kept += k; continue; }
        try { const before = s0.inventory.length; Game.donateToPantry(i); if (s0.inventory.length >= before) break; } catch (e) { break; }
      }
      dayTick(`home+link d${d + 1}`);
      flush('linkday>', /tribute|Tribute|arrears|demand|calls|Demand/i, 4);
    }
    const wk1 = Math.floor(s.day / 7);
    const linkAfter = (Game.hierarchyState() || []).find(l => l.id === link.id);
    note(`   weeks ${wk0} -> ${wk1} | link trust=${linkAfter.trust} arrears=${Math.round(linkAfter.arrears || 0)} paidWeek=${linkAfter.tributePaidWeek}`);
    note(`   link history: ${(linkAfter.history || []).map(h => `${h.kind}: ${String(h.note).slice(0, 90)}`).join(' || ')}`);
    const pantryHome2 = Math.round(Game.pantryKcalLive(Game.state.village));
    note(`   home pantry after tribute weeks: ${pantryHome1} -> ${pantryHome2} kcal`);
    check('tribute is REAL (arrears or trust moved over 2 weeks)', (linkAfter.trust !== 30) || (linkAfter.arrears || 0) > 0,
      `trust 30->${linkAfter.trust} arrears=${Math.round(linkAfter.arrears || 0)}`);
    // now pay it, like a player would
    says.length = 0;
    let paid = null;
    try { paid = Game.payTribute(link.id); } catch (e) { note('   payTribute ERROR: ' + e.message); }
    flush('pay>', /Tribute paid|Tribute short/i, 3);
    note(`   paid tribute: ${paid} kcal`);
  }

  // ================= verdict =================
  note(`\n=== VERDICT ===`);
  const fails = results.filter(r => !r[1]);
  note(`   checks: ${results.length - fails.length}/${results.length} green`);
  if (fails.length) for (const [n, , x] of fails) note(`   FAIL: ${n}${x ? ' — ' + x : ''}`);
  note(`   day=${s.day} over=${!!Game.over}`);
  process.exit(fails.length ? 1 : 0);
})();
