#!/usr/bin/env node
// Proof: phoenix rework (Steve 2026-10-09) + bidirectional agency extension.
// Base: lethal + phoenix_clause burns a RANDOM living villager (ash-death, no
// corpse); player emerges at the victim's location with 1 HP. No villagers /
// no village -> death sticks, honestly. Trust hits scaled by relationship,
// dread via fear, gossip to non-witnesses, justice sees a witnessed murder,
// 2nd+ use with low standing -> exile. Villagers ARE the cap (no once-per-run).
// Extension: Link Beat narrates every trigger; devotion volunteers (>=40);
// resentment/fear protests (played 3-beat struggle, 400 kcal + trauma/beat);
// a villager holding the clause can burn YOU -> give yourself (succession +
// life-debt) or pull away (struggle; win = bearer true death, lose = you
// burn + bearer trust collapse).
// Run: SEED=20261009 node scripts/test-phoenix-rework-20261009.js (x3 seeds)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261009', 10);
const rng = mulberry32(SEED);

function loadAll() {
  delete globalThis.Scattering;
  Math.random = rng; // seeded BEFORE eval (load-time captures stay deterministic)
  global.window = global;
  global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
  global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const files = [...html.matchAll(/<script src="([^"]+)"/g)]
    .map(m => m[1].split('?')[0])
    .filter(f => f.startsWith('src/js/'))
    .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
  for (const f of files) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  delete global.window;
  // data: populate SCATTER_DATA the way the break-it harnesses do
  global.SCATTER_DATA = {};
  for (const f of fs.readdirSync(path.join(ROOT, 'src/data'))) {
    if (!f.endsWith('.json')) continue;
    const key = f.replace(/\.json$/, '');
    try { global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8')); } catch (e) {}
  }
  const G = globalThis.Scattering.Game;
  G.data = global.SCATTER_DATA;
  return G;
}
const Game = loadAll();

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function sec(t) { console.log('\n### ' + t); }

let said = [];
const _say = Game.say;
Game.say = function (t) { said.push(String(t)); };

// fresh game with a controlled village
function freshGame() {
  rng.reset || (rng.reset = null);
  // re-seed: mulberry32 has no reset; recreate
  Math.random = mulberry32(SEED);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar, v = Game.state.village;
  s.day = 15; Game.state.systemArrived = true;
  s.health = 100; s.hp = 100; s.kcal = 5000; s.energy = 100;
  s.abilities = ['phoenix_clause'];
  s.phoenixUses = 0;
  Game.state.over = false;
  Game.state.phoenixLink = null;
  v.trust = v.trust || {}; v.trustIn = {};
  v.npcAbilities = {}; v.dyingLinks = {}; v.lifeDebts = {};
  said = [];
  return { s, v };
}
function villagers(n) {
  const v = Game.state.village;
  const ids = (v.roster || []).filter(id => id !== Game.villagerId).slice(0, n);
  // shrink roster to exactly player + n villagers for determinism
  v.roster = [Game.villagerId, ...ids];
  return ids;
}
function setTrust(map) {
  const v = Game.state.village;
  for (const [id, t] of Object.entries(map)) v.trust[id] = t;
}
function setParty(ids) { Game.state.village.party = ids.slice(); }
function triggerLethal() {
  const s = Game.state.scholar;
  s.health = 0; s.hp = 0;
  said = [];
  return Game.maybeCheatDeath();
}

// ============ (a) lethal blow, 3 villagers -> one random ash-death ============
sec('(a) lethal blow burns exactly one random villager; player at their location, 1 HP');
{
  freshGame();
  const [v1, v2, v3] = villagers(3);
  setTrust({ [v1]: 30, [v2]: 20, [v3]: 10, [Game.villagerId]: 30 }); // none volunteer (>=40), none protest (<=5)
  setParty([v1, v2]); // witnesses
  // give the victim a location so we can check respawn-at-location
  const vp = Game.vpOf(v3) || {}; vp.mx = 7; vp.my = 2;
  const cheated = triggerLethal();
  const v = Game.state.village, s = Game.state.scholar;
  const dead = [v1, v2, v3].filter(id => !v.roster.includes(id));
  ok('death cheated', cheated === true);
  ok('exactly one villager dead', dead.length === 1, 'dead=' + dead.length);
  ok('player alive', !Game.state.over && Game.villagerId);
  ok('player at 1 HP', s.health === 1 && s.hp === 1, 'hp=' + s.hp);
  // no lootable corpse for the victim (ashes)
  const corpses = (Game.corpses() || []).filter(c => c.villagerId === dead[0]);
  ok('no lootable corpse (ash)', corpses.length === 0);
  // death knowledge fired: fallen memorial has the ash death
  ok('ash death memorialized', (v.fallen || []).some(f => f.villagerId === dead[0] && /ash/.test(f.cause)));
  // Link Beat narrated (no silent burn)
  ok('Link Beat narrated', said.some(t => /PHOENIX LINK/.test(t)), said.slice(0, 3).join(' | ').slice(0, 120));
  // player respawned at victim's location (if victim had one)
  if (dead[0] === v3) ok('respawn at victim location', s.mx === 7 && s.my === 2, `mx=${s.mx},my=${s.my}`);
  // phoenix uses tracked, cap is villagers not once-per-run
  ok('phoenixUses tracked', s.phoenixUses === 1);
  ok('no once-per-run flag', s.phoenixUsed == null);
}

// ============ (b) no villagers -> death sticks ============
sec('(b) no villagers: phoenix fizzles, death sticks, honest message');
{
  freshGame();
  villagers(0);
  const s = Game.state.scholar;
  const cheated = triggerLethal();
  ok('death NOT cheated', cheated === false);
  ok('honest fizzle message', said.some(t => /no one left to burn for you/i.test(t)), said.join(' | ').slice(0, 160));
}

// ============ (c) witness trust deltas: high vs low relationship ============
sec('(c) witness trust deltas scaled by relationship');
{
  freshGame();
  const [v1, v2, v3] = villagers(3);
  setTrust({ [v1]: 50, [v2]: 10, [Game.villagerId]: 30 });
  // NOTE: v1 at 50 would volunteer; for a clean delta measurement call the
  // resolve path directly with a fixed victim (v3), witnesses v1+v2.
  setParty([v1, v2]);
  said = [];
  Game.phoenixResolveBurn(true, null, v3, {});
  const v = Game.state.village;
  const d1 = (v.trustIn[v1] || 0) - 30, d2 = (v.trustIn[v2] || 0) - 30;
  ok('high-standing witness: small hit (-3)', d1 === -3, 'delta=' + d1);
  ok('low-standing witness: large hit (-16)', d2 === -16, 'delta=' + d2);
  ok('devoted framing in narration', said.some(t => /gave willingly/i.test(t)));
  // dread: fear recorded on witnesses
  let fear1 = 0, fear2 = 0;
  try { fear1 = Game.fearOf(v1, Game.villagerId); fear2 = Game.fearOf(v2, Game.villagerId); } catch (e) {}
  ok('dread on witnesses', fear1 > 0 && fear2 > 0, `fear=${fear1},${fear2}`);
  // justice saw a witnessed murder
  const crimes = (Game.justiceState().crimes || []).filter(c => c.type === 'murder' && c.victim === v3);
  ok('justice: witnessed murder recorded', crimes.length >= 1);
  // gossip seeded for non-witnesses
  ok('gossip seeded', (v.gossip || []).some(g => g.action === 'phoenix_burn'));
}

// ============ (d) 2nd use + low standing -> exile ============
sec('(d) second use with low standing triggers exile');
{
  freshGame();
  const [v1] = villagers(1);
  setTrust({ [v1]: 10, [Game.villagerId]: 10 }); // low standing
  setParty([]);
  const s = Game.state.scholar;
  s.phoenixUses = 1; // this trigger is the 2nd
  said = [];
  const cheated = triggerLethal();
  ok('death cheated (burn happened)', cheated === true);
  ok('exile proceedings fired', s.exiled === true, 'exiled=' + s.exiled);
  ok('exile narrated', said.some(t => /burn somewhere else/i.test(t)));
}
sec('(d2) 2nd use with HIGH standing -> no exile');
{
  freshGame();
  const [v1] = villagers(1);
  setTrust({ [v1]: 10, [Game.villagerId]: 60 }); // high standing
  setParty([]);
  const s = Game.state.scholar;
  s.phoenixUses = 1;
  said = [];
  triggerLethal();
  ok('no exile at high standing', s.exiled !== true);
  ok('"this time" warning narrated', said.some(t => /This time/i.test(t)));
}

// ============ (e) card text states the cost ============
sec('(e) abilities.json states the cost plainly');
{
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/abilities.json'), 'utf8'));
  const abs = Array.isArray(d) ? d : d.abilities;
  const a = abs.find(x => x.id === 'phoenix_clause');
  const txt = a.description + ' ' + a.flavor;
  ok('card found', !!a);
  ok('states random villager cost', /RANDOM living villager/i.test(txt));
  ok('states no-corpse/ash', /no corpse|only ash/i.test(txt));
  ok('states death sticks', /death sticks/i.test(txt));
  ok('states exile risk', /exile/i.test(txt));
  ok('no once-per-run language', !/once per run/i.test(txt));
}

// ============ (f) villager-bearer: player is the chosen one ============
sec('(f1) villager-bearer chooses player -> choice beat fires');
{
  freshGame();
  const [bearer] = villagers(1);
  Game.npcGrantAbility(bearer, 'phoenix_clause');
  setTrust({ [bearer]: 20, [Game.villagerId]: 20 });
  // roster = player + bearer only -> the random pick MUST be the player
  said = [];
  Game.removeVillager(bearer, 'killed');
  const L = Game.state.phoenixLink;
  ok('link started, death held', !!L && L.stage === 'choice');
  ok('bearer still on roster (held, not dead)', Game.state.village.roster.includes(bearer));
  ok('choice beat narrated', said.some(t => /chosen YOU/i.test(t)));
  const acts = Game.phoenixLinkActions();
  ok('both options offered', acts.some(a => a.id === 'phoenix:give') && acts.some(a => a.id === 'phoenix:pullaway'));
}
sec('(f2) give yourself -> succession + life-debt');
{
  freshGame();
  const [bearer, other] = villagers(2);
  Game.npcGrantAbility(bearer, 'phoenix_clause');
  setTrust({ [bearer]: 20, [other]: 30, [Game.villagerId]: 20 });
  const oldId = Game.villagerId;
  Game.removeVillager(bearer, 'killed');
  said = [];
  Game.phoenixChooseGive();
  const v = Game.state.village;
  ok('scholar died -> successor continues', Game.villagerId !== oldId && !Game.state.over, 'new=' + Game.villagerId);
  ok('successor is not the bearer (higher trust chosen)', Game.villagerId === other);
  ok('bearer lives', v.roster.includes(bearer));
  ok('life-debt tracked', v.lifeDebts && v.lifeDebts[bearer] && v.lifeDebts[bearer].owedTo === Game.villagerId, JSON.stringify(v.lifeDebts && v.lifeDebts[bearer]));
  // office transfer: 20*0.6=12, then +10 honor = 22
  ok('village honors (+10 trust)', (v.trust[Game.villagerId] || 0) === 22, 'trust=' + v.trust[Game.villagerId]);
  ok('give narrated', said.some(t => /step into the link/i.test(t)));
}
sec('(f3) pull away -> struggle WIN: bearer true death, player lives');
{
  freshGame();
  const [bearer] = villagers(1);
  Game.npcGrantAbility(bearer, 'phoenix_clause');
  setTrust({ [bearer]: 20, [Game.villagerId]: 20 });
  const oldId = Game.villagerId;
  Game.state.scholar.kcal = 5000;
  Game.removeVillager(bearer, 'killed');
  Game.phoenixChoosePullAway();
  ok('struggle stage', Game.state.phoenixLink && Game.state.phoenixLink.stage === 'struggle');
  Game.phoenixStruggleHold(); Game.phoenixStruggleHold(); Game.phoenixStruggleHold();
  const v = Game.state.village;
  ok('bearer true death', !v.roster.includes(bearer));
  ok('player lives', Game.villagerId === oldId && !Game.state.over);
  ok('struggle cost paid (1200 kcal)', Game.state.scholar.kcal === 3800, 'kcal=' + Game.state.scholar.kcal);
  ok('link cleared', !Game.state.phoenixLink);
}
sec('(f4) pull away -> struggle LOSE: player burns, bearer trust collapse');
{
  freshGame();
  const [bearer] = villagers(1);
  Game.npcGrantAbility(bearer, 'phoenix_clause');
  setTrust({ [bearer]: 20, [Game.villagerId]: 20 });
  const oldId = Game.villagerId;
  Game.removeVillager(bearer, 'killed');
  Game.phoenixChoosePullAway();
  said = [];
  Game.phoenixStruggleRelease('choice'); // yield
  const v = Game.state.village;
  ok('player burned -> succession', Game.villagerId !== oldId && !Game.state.over);
  ok('bearer lives', v.roster.includes(bearer));
  ok('bearer trust collapse (0)', (v.trust[bearer] || 0) === 0, 'trust=' + v.trust[bearer]);
  ok('coercion gossip seeded', (v.gossip || []).some(g => g.action === 'phoenix_coercion'));
}

// ============ (g) devotion volunteers ============
sec('(g) high-devotion villager volunteers: replaces random pick, no horror');
{
  freshGame();
  const [v1, v2, v3] = villagers(3);
  setTrust({ [v1]: 55, [v2]: 20, [v3]: 10, [Game.villagerId]: 30 });
  setParty([v2, v3]); // witnesses
  said = [];
  const cheated = triggerLethal();
  const v = Game.state.village, s = Game.state.scholar;
  ok('death cheated', cheated === true);
  ok('volunteer (most devoted) burned', !v.roster.includes(v1), 'roster=' + v.roster.join(','));
  ok('others live', v.roster.includes(v2) && v.roster.includes(v3));
  ok('volunteer narrated', said.some(t => /steps INTO it/i.test(t)));
  // no horror trust hit for witnesses
  const d2 = (v.trustIn[v2] == null ? 30 : v.trustIn[v2]) - 30;
  ok('no horror trust hit', d2 === 0, 'delta=' + d2);
  ok('honor gossip seeded', (v.gossip || []).some(g => g.action === 'phoenix_volunteer'));
  ok('player alive at 1 HP', s.health === 1);
}

// ============ (h) resentful chosen villager protests ============
sec('(h1) protest -> struggle WIN (hold 3 beats): victim burns');
{
  freshGame();
  const [v1] = villagers(1);
  setTrust({ [v1]: 3, [Game.villagerId]: 30 }); // resentful -> protests
  setParty([]);
  Game.state.scholar.kcal = 5000;
  said = [];
  const cheated = triggerLethal();
  ok('death held for struggle', cheated === true);
  ok('struggle pending', Game.state.phoenixLink && Game.state.phoenixLink.stage === 'struggle');
  ok('protest narrated', said.some(t => /fighting the link/i.test(t)));
  Game.phoenixStruggleHold(); Game.phoenixStruggleHold(); Game.phoenixStruggleHold();
  const v = Game.state.village;
  ok('protester burned', !v.roster.includes(v1));
  ok('player alive', !Game.state.over && Game.state.scholar.health === 1);
}
sec('(h2) protest -> struggle LOSE (release): bearer (player) true death');
{
  freshGame();
  const [v1] = villagers(1);
  setTrust({ [v1]: 3, [Game.villagerId]: 30 });
  setParty([]);
  const oldId = Game.villagerId;
  triggerLethal();
  Game.phoenixStruggleRelease('choice'); // let them go
  ok('player true death -> succession', Game.villagerId !== oldId && !Game.state.over);
  ok('protester lives', Game.state.village.roster.includes(v1));
}
sec('(h3) struggle is played not RNG: weak player cannot hold');
{
  freshGame();
  const [v1] = villagers(1);
  setTrust({ [v1]: 3, [Game.villagerId]: 30 });
  setParty([]);
  Game.state.scholar.kcal = 100; // can't afford a beat
  triggerLethal();
  const oldId = Game.villagerId;
  Game.phoenixStruggleHold(); // should fail -> release path -> true death
  ok('broke player cannot hold -> true death', Game.villagerId !== oldId && !Game.state.over);
}

// ============ second_wind untouched ============
sec('second_wind untouched (Refuses Death synergy intact)');
{
  freshGame();
  villagers(2);
  const s = Game.state.scholar;
  s.abilities = ['second_wind', 'phoenix_clause'];
  s.health = 0; s.hp = 0;
  said = [];
  const cheated = Game.maybeCheatDeath();
  ok('second_wind still cheats first', cheated === true && /SECOND WIND/i.test(said.join(' ')));
}

Game.say = _say;
console.log(`\n==== phoenix-rework: ${pass} pass, ${fail} fail (seed ${SEED}) ====`);
process.exit(fail ? 1 : 0);
