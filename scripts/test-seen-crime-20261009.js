#!/usr/bin/env node
// Proof: seen-crime rule + phoenix broadcast exception (Steve 2026-10-09).
// "Make sure theft is only punished if it's seen. Crimes aren't crimes unless
// people know or suspect them. Phoenix should maybe be the exception. Every
// time it's used, the whole village learns about it."
//
// (a) unseen theft, positions available, nobody in range -> zero trust/rep
//     movement, no gossip seeded (no witnesses, no tale to tell).
// (b) positions unavailable + empty party -> zero movement (the old fallback
//     auto-convicted the whole village). Ripple trust gate: a non-witness
//     group member gets ripple REP (suspicion) but NO ripple trust.
// (c) witnessed theft -> punished exactly as before (target + witness hits;
//     far villagers untouched directly; gossip seeded from witnesses).
// (d) gossip-seeded suspicion -> rep moves (damped), trust NEVER moves.
// (e) phoenix with ZERO present witnesses -> whole roster learns ACCURATELY
//     (memory, not gossip), roster-wide scaled trust hits, no distorted
//     phoenix_burn gossip seeded, fear half for broadcast viewers, murder
//     recorded as known.
// (f) volunteer phoenix -> village-wide honor, no hit, no burn gossip.
// Run: SEED=20261009 node scripts/test-seen-crime-20261009.js (x3 seeds)
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

function loadAll() {
  delete globalThis.Scattering;
  Math.random = mulberry32(SEED); // seeded BEFORE eval
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
  else { fail++; console.log('  FAIL ' + name + (detail ? ' -- ' + detail : '')); }
}
function sec(t) { console.log('\n### ' + t); }

let said = [];
Game.say = function (t) { said.push(String(t)); };

function freshGame() {
  Math.random = mulberry32(SEED);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar, v = Game.state.village;
  s.day = 15; Game.state.systemArrived = true;
  s.health = 100; s.hp = 100; s.kcal = 5000; s.energy = 100;
  s.mx = 4; s.my = 4;
  Game.state.over = false;
  v.trust = v.trust || {}; v.trustIn = {}; v.rep = {}; v.gossip = [];
  v.groups = []; v.memory = {}; v.dread = {};
  v.party = []; // nobody traveling with the player unless a test says so
  delete v.positions;
  said = [];
  return { s, v };
}
function villagers(n) {
  const v = Game.state.village;
  const ids = (v.roster || []).filter(id => id !== Game.villagerId).slice(0, n);
  v.roster = [Game.villagerId, ...ids];
  return ids;
}
function setTrust(map) {
  const v = Game.state.village;
  for (const [id, t] of Object.entries(map)) v.trust[id] = t;
}
function snapTrust(ids) {
  const t = Game.state.village.trust || {};
  const o = {};
  for (const id of ids) o[id] = (t[id] === undefined ? 15 : t[id]);
  return o;
}
function snapRep(ids) {
  const o = {};
  for (const id of ids) { const r = Game.repOf(id); o[id] = { ...r }; }
  return o;
}
function gossipActions() { return (Game.state.village.gossip || []).map(g => g.action); }

// ============ (a) unseen, positions available, nobody in range ============
sec('(a) unseen theft, positions available, nobody in range -> zero movement');
{
  freshGame();
  const [v1, v2] = villagers(2);
  setTrust({ [v1]: 20, [v2]: 20 });
  const v = Game.state.village;
  v.positions = { [v1]: { mx: 0, my: 0 }, [v2]: { mx: 0, my: 1 } }; // far from (4,4)
  const t0 = snapTrust([v1, v2]), r0 = snapRep([v1, v2]);
  Game.observe('theft', {});
  const t1 = snapTrust([v1, v2]), r1 = snapRep([v1, v2]);
  ok('no trust movement', JSON.stringify(t0) === JSON.stringify(t1), JSON.stringify([t0, t1]));
  ok('no rep movement', JSON.stringify(r0) === JSON.stringify(r1));
  ok('no gossip seeded (no witnesses, no tale)', !gossipActions().includes('theft'));
}

// ============ (b) no positions + empty party -> zero movement ============
sec('(b) no positions + empty party -> zero movement; ripple trust gated');
{
  freshGame();
  const [v1, v2] = villagers(2);
  setTrust({ [v1]: 20, [v2]: 20 });
  const v = Game.state.village;
  delete v.positions; v.party = [];
  const t0 = snapTrust([v1, v2]), r0 = snapRep([v1, v2]);
  Game.observe('theft', {});
  const t1 = snapTrust([v1, v2]), r1 = snapRep([v1, v2]);
  ok('no trust movement (was: whole village auto-convicted)', JSON.stringify(t0) === JSON.stringify(t1), JSON.stringify([t0, t1]));
  ok('no rep movement', JSON.stringify(r0) === JSON.stringify(r1));
  ok('no gossip seeded', !gossipActions().includes('theft'));
}
sec('(b2) ripple: non-witness group member gets rep, NOT trust');
{
  freshGame();
  const [v1, v2] = villagers(2);
  setTrust({ [v1]: 20, [v2]: 20 });
  const v = Game.state.village;
  // v1 near the scholar (witness), v2 far (not). Same social circle.
  v.positions = { [v1]: { mx: 4, my: 5 }, [v2]: { mx: 0, my: 0 } };
  v.groups = [{ kind: 'friends', members: [v1, v2] }];
  const t0 = snapTrust([v2]);
  Game.observe('theft', { target: v1, noGossip: true, trustMoved: true });
  const t1 = snapTrust([v2]);
  ok('non-witness group member: trust untouched', JSON.stringify(t0) === JSON.stringify(t1), JSON.stringify([t0, t1]));
  const repHonest = Game.repOf(v2).honest || 0;
  ok('non-witness group member: rep ripples on suspicion', repHonest < 0, 'honest=' + repHonest);
  const wTrust = (Game.state.village.trust || {})[v1];
  ok('witness+target still punished via rep', (Game.repOf(v1).honest || 0) < 0);
  void wTrust;
}

// ============ (c) witnessed theft -> punished as before ============
sec('(c) witnessed theft -> punished as before');
{
  freshGame();
  const [v1, v2] = villagers(2);
  setTrust({ [v1]: 20, [v2]: 20 });
  const v = Game.state.village;
  v.positions = { [v1]: { mx: 4, my: 5 }, [v2]: { mx: 0, my: 0 } };
  Game.observe('theft', { target: v1, trustMoved: true });
  ok('target rep hit (weight 1)', (Game.repOf(v1).honest || 0) <= -25, 'honest=' + Game.repOf(v1).honest);
  ok('far villager: no direct trust hit', (v.trust[v2] === undefined ? 15 : v.trust[v2]) === 20);
  ok('far villager: no direct rep hit yet', (Game.repOf(v2).honest || 0) === 0);
  ok('gossip seeded from the witness', gossipActions().includes('theft'));
  const g = v.gossip.find(g => g.action === 'theft');
  ok('gossip tellers are actual witnesses', g && g.heard.includes(v1) && !g.heard.includes(v2), JSON.stringify(g && g.heard));
}

// ============ (d) gossip suspicion -> rep only, never trust ============
sec('(d) gossip suspicion moves rep only, never trust');
{
  freshGame();
  const [v1, v2] = villagers(2);
  setTrust({ [v1]: 20, [v2]: 20 });
  const v = Game.state.village;
  v.positions = { [v1]: { mx: 4, my: 5 }, [v2]: { mx: 0, my: 0 } };
  Game.observe('theft', { target: v1, trustMoved: true, noGossip: false });
  // let the tale travel until v2 hears it (bounded; seeded RNG = deterministic)
  let heard = false;
  for (let i = 0; i < 40 && !heard; i++) {
    Game.spreadGossip();
    heard = (v.gossip || []).some(g => g.action === 'theft' && g.heard.includes(v2));
  }
  ok('tale reached the far villager', heard);
  if (heard) {
    ok('suspicion moves rep (damped)', (Game.repOf(v2).honest || 0) < 0, 'honest=' + Game.repOf(v2).honest);
    ok('suspicion NEVER moves trust', (v.trust[v2] === undefined ? 15 : v.trust[v2]) === 20, 'trust=' + v.trust[v2]);
  }
}

// ============ (e) phoenix broadcast, zero present witnesses ============
sec('(e) phoenix, zero witnesses -> whole roster learns accurately');
{
  freshGame();
  const s = Game.state.scholar, v = Game.state.village;
  s.abilities = ['phoenix_clause']; s.phoenixUses = 0;
  const [v1, v2] = villagers(2);
  setTrust({ [v1]: 20, [v2]: 20, [Game.villagerId]: 30 });
  v.party = []; v.npcAbilities = {}; v.dyingLinks = {}; v.lifeDebts = {};
  s.health = 0; s.hp = 0; said = [];
  const cheated = Game.maybeCheatDeath();
  ok('death cheated', cheated === true);
  const dead = [v1, v2].find(id => !(v.roster || []).includes(id));
  const viewer = [v1, v2].find(id => id !== dead);
  ok('one villager burned', !!dead && !!viewer);
  // accurate knowledge, not gossip
  const mem = (v.memory[viewer] || []).filter(m => m.t === 'phoenix_burn_seen');
  ok('viewer remembers accurately', mem.length > 0, JSON.stringify((v.memory[viewer] || []).map(m => m.t)));
  const vRec = (() => { try { return Game.displayName(dead); } catch (e) { return ''; } })();
  ok('memory names the victim', mem.some(m => (m.note || '').includes(vRec.split(' ')[0])), JSON.stringify(mem.map(m => m.note)));
  // roster-wide scaled trust hit (standing 20 -> -12)
  const tin = (v.trustIn[viewer] == null ? 30 : v.trustIn[viewer]);
  ok('viewer trust-in-player hit roster-wide', tin === 18, 'trustIn=' + tin);
  // no distorted gossip
  ok('no phoenix_burn gossip seeded', !gossipActions().includes('phoenix_burn'));
  ok('no phoenix_burn_npc gossip seeded', !gossipActions().includes('phoenix_burn_npc'));
  // public standing damped: 30 + round(-12/2)
  ok('public trust damped', v.trust[Game.villagerId] === 24, 'trust=' + v.trust[Game.villagerId]);
  // fear: half for broadcast viewers (full 10 -> 5)
  const dread = ((v.dread || {})[Game.villagerId] || {})[viewer] || 0;
  ok('broadcast viewer fear halved', dread === 5, 'dread=' + dread);
  // crime known by definition
  const crimes = (Game.justiceState ? Game.justiceState().crimes : []) || [];
  ok('murder recorded as known', crimes.some(c => c.type === 'murder' && c.witnessed !== false));
  // the show aired it
  ok('broadcast narrated', said.join(' ').includes('The show aired it'));
}

// ============ (f) volunteer phoenix -> honor, no hit ============
sec('(f) volunteer phoenix -> village-wide honor, no hit');
{
  freshGame();
  const s = Game.state.scholar, v = Game.state.village;
  s.abilities = ['phoenix_clause']; s.phoenixUses = 0;
  const [v1] = villagers(1);
  setTrust({ [v1]: 50, [Game.villagerId]: 30 }); // >=40 volunteers
  v.party = []; v.npcAbilities = {}; v.dyingLinks = {}; v.lifeDebts = {};
  s.health = 0; s.hp = 0; said = [];
  const cheated = Game.maybeCheatDeath();
  ok('death cheated via volunteer', cheated === true);
  ok('volunteer burned', !(v.roster || []).includes(v1));
  ok('no trust-in-player hits', Object.keys(v.trustIn || {}).length === 0, JSON.stringify(v.trustIn));
  ok('no burn gossip', !gossipActions().includes('phoenix_burn'));
  ok('honor narrated', said.join(' ').includes('gave willingly'));
  ok('player public trust intact', (v.trust[Game.villagerId] || 0) >= 30);
}

console.log(`\n${pass} passed, ${fail} failed (seed ${SEED})`);
process.exit(fail ? 1 : 0);
