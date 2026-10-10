// Detective adversarial r12 (2026-10-10): "accusations stick to the accuser" —
// hostile player verbs: false accusations without cost, silent punishments,
// grief loops, softlocks, copy-vs-engine honesty.
//
// Suspect: accuserPays() writes the accuser's cost into repOf(player) — the
// player's SELF-view slot, which nothing reads — and seeds village gossip
// with dims.who=player, which spreadGossip routes back into the same dead
// slot. The D1 mechanic ("Word gets around... People file that away") may be
// pure theater: no villager's view of the player ever moves.
//
// Run: node scripts/attack-detective-20261010.js (SEED=... optional)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261010', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ a >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seeded BEFORE eval: modules capture Math.random at load
global.SCATTER_DATA = {};
for (const f of fs.readdirSync(path.join(ROOT, 'src/data'))) {
  if (!f.endsWith('.json')) continue;
  try { global.SCATTER_DATA[f.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8')); } catch (e) {}
}
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
['src/js/engine/state.js','src/js/engine/modifiers.js','src/js/engine/calories.js',
 'src/js/engine/day.js','src/js/engine/forage.js','src/js/engine/combat.js',
 'src/js/game.js','src/js/encounters.js','src/js/conversation.js','src/js/convo-mood.js',
 'src/js/convoTopics.js','src/js/convo-wants.js','src/js/convo-dialogue.js','src/js/convo-beats.js',
 'src/js/convo-scene.js','src/js/examine.js','src/js/equipment.js','src/js/journal.js',
 'src/js/party.js','src/js/party-formal.js','src/js/truth.js','src/js/contests.js',
 'src/js/contestEngine.js','src/js/alienPlayers.js','src/js/storage.js','src/js/perceive.js',
 'src/js/carexplore.js','src/js/justice.js','src/js/food.js','src/js/betrayal.js','src/js/corpses.js',
 'src/js/lifeseed.js','src/js/progression.js','src/js/ledger.js','src/js/abilityActions.js',
 'src/js/monsterBehaviors.js','src/js/statusEffects.js','src/js/villager-agency.js',
 'src/js/fieldFights.js','src/js/villager-objectives.js','src/js/codex-people.js',
 'src/js/membership.js','src/js/hierarchy.js','src/js/debug-scenarios.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;
const say = () => { const l = Game.log || []; const s = l.map(x => x.text || x).join(' '); l.length = 0; return s; };
function fresh() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100; s.mx = 4; s.my = 4;
  say();
  return s;
}
const playerId = () => Game.villagerId;
const trustOf = (vid) => { const t = (Game.state.village.trust || {})[vid]; return t === undefined ? 10 : t; };
// hearers: the exact 3 NPCs accuserPays seeds its gossip with
const hearersOf = (vid) => Game.npcIds().filter(id => id !== vid).slice(0, 3);
const viewOfPlayer = (vid) => Object.assign({}, Game.repOf(vid)); // vid's view of the PLAYER (the read slot)
function liarWithOccLie() {
  const ids = Game.npcIds().filter(id => id !== playerId());
  for (const id of ids) {
    const lies = Game.npcLies(id);
    if (lies && lies.occupation && !lies.occupation.confessed) return { vid: id, lie: lies.occupation };
  }
  const vid = ids[0];
  const vp = Game.vpOf(vid);
  vp.lies = vp.lies || {};
  vp.lies.occupation = Game.makeLie(vp, 'occupation', 'hiding');
  return { vid, lie: vp.lies.occupation };
}
function plantOccDoubt(vid, lie) {
  return Game.addDoubt(vid, 'observation', `test doubt for ${vid}`,
    [`claims "${lie.told}"`, "observed: hands don't know the work"], { field: 'occupation' });
}
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
// force a deterministic confrontation outcome: 'deflected' | 'attacked' | 'confessed'
// NOTE: Math.random is stubbed during the call, so the stub must stay a VALID
// pool index (0..1) — drawTruthLine picks lines with it. 'confessed' is forced
// by boosting confessP above 1 (shame + warm + trust 100), never by a negative roll.
function forceOutcome(vid, doubt, want) {
  const realRandom = Math.random, realTemper = Game.npcTemper;
  const lies = Game.npcLies(vid);
  const saved = {};
  for (const [f, l] of Object.entries(lies || {})) { saved[f] = l.motive; l.motive = want === 'confessed' ? 'shame' : 'pathological'; }
  Game.npcTemper = () => (want === 'confessed' ? 'warm' : 'prickly');
  if (want === 'confessed') Game.state.village.trust[vid] = 100;
  else if ((Game.state.village.trust[vid] || 10) <= 0) Game.state.village.trust[vid] = 10;
  // deflected: confessP ~= 0.08 - 0.10 - 0.15 = -0.17; roll 0.0 lands in the
  // deflect band without zeroing trust. attacked: 0.99. confessed: confessP
  // ~= 0.65 + 0.35 + 0.15 = 1.15 > 1, roll 0.5 confesses on the merits.
  Math.random = () => (want === 'deflected' ? 0.0 : want === 'attacked' ? 0.99 : 0.5);
  let r;
  try { r = Game.confrontDoubt(vid, doubt.id); }
  finally { Math.random = realRandom; Game.npcTemper = realTemper; for (const [f, m] of Object.entries(saved)) if (lies[f]) lies[f].motive = m; }
  say();
  return r;
}
// hearers outside the victim's groups — isolates the accuser-pays cost from
// the counter-attack's own group ripple (applyRep(victim, {honest:-4}))
function outsideHearers(vid) {
  const groups = (Game.state.village.groups || []).filter(g => g.members.includes(vid));
  const mates = new Set();
  for (const g of groups) g.members.forEach(m => mates.add(m));
  return hearersOf(vid).filter(h => !mates.has(h));
}

// ============ E1: counter-attack — does any VILLAGER's view of the player move? ============
(function () {
  console.log('E1: attacked — "people file that away" must be mechanical, not theater');
  fresh();
  const { vid, lie } = liarWithOccLie();
  const d = plantOccDoubt(vid, lie);
  const hs0 = outsideHearers(vid);
  const hs = (hs0.length ? hs0 : hearersOf(vid)).slice(0, 3);
  const before = hs.map(h => (Game.repOf(h).honest || 0) + (Game.repOf(h).competent || 0));
  const r = forceOutcome(vid, d, 'attacked');
  // let the seeded gossip travel 3 days
  const parts = ['morning', 'afternoon', 'evening', 'night'];
  for (let day = 0; day < 3; day++) { for (const p of parts) { Game.dayPart = p; Game.spreadGossip(); } Game.state.scholar.day++; }
  say();
  const after = hs.map(h => (Game.repOf(h).honest || 0) + (Game.repOf(h).competent || 0));
  const moved = hs.filter((h, i) => after[i] < before[i]);
  console.log(`    outcome=${r.outcome} hearer view-of-player honest+competent: [${before}] -> [${after}]`);
  check('E1a counter-attack happened', r.outcome === 'attacked', r.outcome);
  check('E1b at least one villager thinks worse of the player (not just self-rep)',
    moved.length > 0, `moved=${moved.length}/${hs.length} hearers`);
  const gossip = (Game.state.village.gossip || []).filter(g => g.dims && g.dims.who === playerId());
  check('E1c village gossip names the accuser', gossip.length > 0, 'none');
})();

// ============ E2: baseless accusation — 'cleared' must cost for real ============
(function () {
  console.log('E2: cleared (baseless) — the price must land in a read slot');
  fresh();
  const ids = Game.npcIds().filter(id => id !== playerId());
  let honest = null;
  for (const id of ids) { const l = Game.npcLies(id); if (!l || !Object.values(l).some(x => x && x.told && !x.confessed)) { honest = id; break; } }
  if (!honest) { honest = ids[0]; Game.vpOf(honest).lies = {}; }
  const d = Game.addDoubt(honest, 'observation', 'test baseless', ['claims "baker"', 'observed: something off']);
  const hs = hearersOf(honest);
  const before = hs.map(h => Game.repOf(h).honest || 0);
  const r = Game.confrontDoubt(honest, d.id);
  say();
  const after = hs.map(h => Game.repOf(h).honest || 0);
  const moved = hs.filter((h, i) => after[i] < before[i]);
  console.log(`    outcome=${r.outcome} hearer honest view-of-player: [${before}] -> [${after}]`);
  check('E2a resolves as cleared', r.outcome === 'cleared', r.outcome);
  check('E2b false accuser pays in a READ slot (hearers think less of them)',
    moved.length > 0, `moved=${moved.length}/3`);
})();

// ============ E3: deflection grief loop — bounded AND priced AND narrated ============
(function () {
  console.log('E3: deflection grind — must terminate, cost, and say so');
  fresh();
  const { vid, lie } = liarWithOccLie();
  const d = plantOccDoubt(vid, lie);
  const hs = hearersOf(vid);
  const h0 = hs.map(h => Game.repOf(h).honest || 0);
  let rounds = 0, outcomes = [], narratedCost = false;
  for (let i = 0; i < 30; i++) {
    if (d.resolved) break;
    const r = forceOutcome(vid, d, 'deflected');
    rounds++;
    outcomes.push(r.outcome);
    if (r.ok === false) break;
    // the deflection must TELL the player it stained them (no silent actions)
    if (r.outcome === 'deflected' && /stain|sticks to you|word gets around/i.test(r.afterSay || '')) narratedCost = true;
    if (r.outcome !== 'deflected') break; // evidence weight forced the issue
  }
  say();
  const h1 = hs.map(h => Game.repOf(h).honest || 0);
  const paid = hs.filter((h, i) => h1[i] < h0[i]).length;
  console.log(`    rounds=${rounds} outcomes=${outcomes.join(',')} hearer honest: [${h0}] -> [${h1}] narrated=${narratedCost}`);
  check('E3a deflection loop terminates (evidence weight forces confession)', d.resolved && outcomes[outcomes.length - 1] === 'confessed',
    `rounds=${rounds} last=${outcomes[outcomes.length - 1]}`);
  check('E3b every deflection dented a hearer (griefing has a price)', paid > 0 && rounds <= paid + 1,
    `rounds=${rounds} hearers-dented=${paid}`);
  check('E3c the price is narrated, not silent', narratedCost, 'no stain line in afterSay');
  check('E3d victim trust not ground to zero for free', !(trustOf(vid) <= 0 && paid === 0),
    `trust=${trustOf(vid)} paid=${paid}`);
})();

// ============ S1: cooldown on doubt A, fresh doubt B — no crash, no double-grind weirdness ============
(function () {
  console.log('S1: refused doubt A + fresh doubt B on the same villager');
  fresh();
  const { vid, lie } = liarWithOccLie();
  const dA = plantOccDoubt(vid, lie);
  const r1 = forceOutcome(vid, dA, 'attacked');
  say();
  const dB = Game.addDoubt(vid, 'slip', 'test second doubt', ['let something slip about the cover'], { field: 'occupation' });
  let threw = false, rA = null, rB = null;
  try {
    rA = Game.confrontDoubt(vid, dA.id); // still cooling down
    rB = Game.confrontDoubt(vid, dB.id); // fresh doubt
  } catch (e) { threw = true; }
  say();
  console.log(`    A=${rA && rA.outcome} B=${rB && rB.outcome} threw=${threw}`);
  check('S1a no throw', !threw);
  check('S1b cooling doubt still refuses', rA && rA.ok === false && rA.outcome === 'refused',
    JSON.stringify(rA && { ok: rA.ok, outcome: rA.outcome }));
  check('S1c fresh doubt confronts cleanly (separate thread, no softlock)', rB && rB.ok === true,
    JSON.stringify(rB && { ok: rB.ok, outcome: rB.outcome }));
})();

// ============ S2: observePerson on a removed villager ============
(function () {
  console.log('S2: observePerson on a gone villager');
  fresh();
  const vid = Game.npcIds().filter(id => id !== playerId())[0];
  try { Game.removeVillager(vid, 'killed'); } catch (e) {}
  say();
  let threw = false, r = null;
  try { r = Game.observePerson(vid); } catch (e) { threw = true; r = { err: String(e.message).slice(0, 60) }; }
  say();
  console.log(`    threw=${threw} result=${JSON.stringify(r && { ok: r.ok, line: String(r.line || r.err || '').slice(0, 60) })}`);
  check('S2a no throw observing the gone', !threw, r && r.err);
  check('S2b refuses cleanly', r && r.ok === false, JSON.stringify(r && { ok: r.ok }));
})();

// ============ H1: freeloadGossip must not destroy the rep object ============
(function () {
  console.log('H1: freeloadGossip rep write');
  fresh();
  const vid = Game.npcIds().filter(id => id !== playerId())[0];
  Game.repOf(vid).generous = 20; // something to lose
  let threw = false;
  try { Game.freeloadGossip(vid); } catch (e) { threw = true; }
  say();
  const slot = Game.state.village.rep[vid];
  const isObj = slot && typeof slot === 'object' && !Array.isArray(slot);
  console.log(`    threw=${threw} slot=${isObj ? JSON.stringify(slot).slice(0, 60) : String(slot)}`);
  check('H1a no throw', !threw);
  check('H1b rep slot stays an object (no NaN wipe)', isObj, 'slot=' + String(slot).slice(0, 40));
  check('H1c the talk actually dents standing', isObj && (slot.generous || 0) < 20, 'generous=' + (isObj && slot.generous));
})();

// ============ H2: where does the CAUGHT LIAR's rep hit land? (documents r6-pinned routing) ============
(function () {
  console.log('H2: confession — gossip names the liar; record where the rep lands');
  fresh();
  const { vid, lie } = liarWithOccLie();
  const d = plantOccDoubt(vid, lie);
  const r = forceOutcome(vid, d, 'confessed');
  say();
  const liarView = Game.repOf(vid).honest || 0; // liar's view of the PLAYER
  const goss = (Game.state.village.gossip || []).filter(g => g.dims && g.dims.who === vid);
  console.log(`    outcome=${r.outcome} repOf(liar).honest=${liarView} (liar's view of PLAYER) gossipNamingLiar=${goss.length}`);
  check('H2a confession happened', r.outcome === 'confessed', r.outcome);
  check('H2b village gossip records the caught liar', goss.length > 0, 'none');
  // NOTE (cross-loop, for socialite): the rep write lands in repOf(liar) =
  // "how the liar sees YOU" — the codex will show the LIAR as seeing the
  // player as scheming, and makeAmends will treat it as "they think poorly
  // of you". The village's view of the LIAR has no slot in the per-viewer
  // rep system. Routing is r6-pinned; not changing it here.
  check('H2c (documented inversion) liar-view-of-player slot moved, village-view-of-liar has no slot',
    liarView < 0, `repOf(liar).honest=${liarView}`);
})();

console.log(`\n${pass} passed, ${fail} failed (seed ${SEED})`);
process.exit(fail ? 1 : 0);
