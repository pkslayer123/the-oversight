#!/usr/bin/env node
// Proof: phoenix gear (Steve 2026-10-09) -- "What happens to their gear?"
// plus the bearer-exclusion rule ("phoenix cannot burn phoenix") and the
// funeral custom (village norm: pocket it or bring it home).
//
// (a) burn a villager with known gear incl. one sentimental -> ash-pile at
//     the site holds exactly the non-sentimental CARRIED gear; the
//     sentimental is gone (burns with them).
// (b) take/leave per item works through the loot UI (corpseTakeItem); taken
//     items carry ashOf provenance.
// (c) stashed gear is NOT teleported to the ash site.
// (d) give-yourself -> death pack intact + ashes narration line.
// (e) no path silently deletes gear (carried non-sentimental gear is either
//     on the pile or in someone's inventory).
// (f) ash-pile narration states the village norm.
// (g) taking the victim's gear as the one who burned them -> strictly worse
//     consequence than ordinary death-pack looting, measured via rep/trust.
// (h) depositing ash gear at Haven -> honored: trust reward fires and the
//     gear lands in village stores.
// (i) two clause-holders + one plain villager -> the plain one is always
//     the victim across runs (holders never picked).
// (j) only holders left -> death sticks, honest message.
// (k) a holder whose clause was already spent (revoked) IS eligible again.
// Run: SEED=20261009 node scripts/test-phoenix-gear-20261009.js (x3 seeds)
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
const _say = Game.say;
Game.say = function (t) { said.push(String(t)); };

function freshGame() {
  Math.random = mulberry32(SEED);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar, v = Game.state.village;
  s.day = 15; Game.state.systemArrived = true;
  s.health = 100; s.hp = 100; s.kcal = 5000; s.energy = 100;
  s.abilities = ['phoenix_clause'];
  s.phoenixUses = 0;
  s.mx = 4; s.my = 4;
  Game.state.over = false;
  Game.state.phoenixLink = null;
  v.trust = v.trust || {}; v.trustIn = {}; v.rep = {};
  v.npcAbilities = {}; v.dyingLinks = {}; v.lifeDebts = {}; v.gossip = [];
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
function recOf(vid) {
  return (Game.data.villagers || []).find(x => x.id === vid)
    || (Game.data.background_survivors || []).find(x => x.id === vid);
}
function giveGear(vid, items, stashed) {
  const rec = recOf(vid);
  rec.items = items;
  if (stashed) rec.stashed = stashed;
}
function triggerLethal() {
  const s = Game.state.scholar;
  s.health = 0; s.hp = 0;
  said = [];
  return Game.maybeCheatDeath();
}
function ashCorpseFor(vid) {
  return (Game.corpses() || []).find(c => c.ash && c.villagerId === vid);
}
const GEAR = [
  { itemId: 'multitool', name: 'Multitool', units: 1, kg: 0.4 },
  { itemId: 'hunting_spear', name: 'Hunting spear', units: 1, kg: 1.2 },
];
const SENT = { itemId: 'daughters_drawing', name: "Daughter's drawing", units: 1, kg: 0.1 };

// ============ (a) ash-pile holds exactly non-sentimental carried gear ============
sec('(a) ash-pile holds exactly the non-sentimental carried gear');
{
  freshGame();
  const [v1] = villagers(1);
  setTrust({ [v1]: 20, [Game.villagerId]: 30 });
  giveGear(v1, [...GEAR, { ...SENT }], [{ itemId: 'lighter', name: 'Lighter', units: 1, kg: 0.1 }]);
  const vp = Game.vpOf(v1) || {}; vp.mx = 4; vp.my = 4;
  const cheated = triggerLethal();
  ok('death cheated', cheated === true);
  const c = ashCorpseFor(v1);
  ok('ash-pile exists and is flagged', !!(c && c.ash === true));
  const ids = (c.items || []).map(i => i.itemId || i.id);
  ok('carried tool on the pile', ids.includes('multitool'), ids.join(','));
  ok('carried weapon on the pile', ids.includes('hunting_spear'), ids.join(','));
  ok('sentimental NOT on the pile (burns with them)', !ids.includes('daughters_drawing'), ids.join(','));
  ok('stashed gear NOT teleported', !ids.includes('lighter'), ids.join(','));
  ok('ash records who burned them', c.ashBearer === Game.villagerId, 'ashBearer=' + c.ashBearer);
}

// ============ (b) take/leave per item; ashOf provenance ============
sec('(b) take/leave per item through corpseTakeItem');
{
  freshGame();
  const [v1] = villagers(1);
  setTrust({ [v1]: 20, [Game.villagerId]: 30 });
  giveGear(v1, [...GEAR]);
  const vp = Game.vpOf(v1) || {}; vp.mx = 4; vp.my = 4;
  triggerLethal();
  const c = ashCorpseFor(v1);
  const s = Game.state.scholar;
  const idx = (c.items || []).findIndex(i => (i.itemId || i.id) === 'multitool');
  const taken = Game.corpseTakeItem(c.id, idx);
  ok('take one item', !!taken);
  const inv = s.inventory.find(i => (i.itemId || i.id) === 'multitool');
  ok('taken item carries ashOf provenance', !!(inv && inv.ashOf === v1), 'ashOf=' + (inv && inv.ashOf));
  const rest = (c.items || []).filter(i => (i.units == null ? 1 : i.units) > 0).map(i => i.itemId || i.id);
  ok('other item stays on the pile (leave works)', rest.includes('hunting_spear') && !rest.includes('multitool'), rest.join(','));
}

// ============ (c) stashed gear stays where it was ============
sec('(c) stashed gear stays where it was');
{
  freshGame();
  const [v1] = villagers(1);
  setTrust({ [v1]: 20, [Game.villagerId]: 30 });
  giveGear(v1, [...GEAR], [{ itemId: 'lighter', name: 'Lighter', units: 1, kg: 0.1 }]);
  triggerLethal();
  const c = ashCorpseFor(v1);
  const ids = (c.items || []).map(i => i.itemId || i.id);
  ok('stash not on the ash-pile', !ids.includes('lighter'));
  ok('stash still on their record', (recOf(v1).stashed || []).some(i => (i.itemId || i.id) === 'lighter'));
}

// ============ (d) give-yourself: death pack intact + ashes line ============
sec('(d) give-yourself keeps the death pack; ashes narrated');
{
  freshGame();
  const [v1] = villagers(1);
  setTrust({ [v1]: 20, [Game.villagerId]: 30 });
  Game.npcGrantAbility(v1, 'phoenix_clause');
  const s = Game.state.scholar;
  const oldId = Game.villagerId;
  s.inventory = [{ itemId: 'multitool', name: 'Multitool', units: 1, kg: 0.4 }];
  said = [];
  Game.removeVillager(v1, 'killed'); // fires the villager's link; player is the only pick
  ok('choice beat offered', !!Game.state.phoenixLink && Game.state.phoenixLink.stage === 'choice');
  said = [];
  Game.phoenixChooseGive();
  const newId = Game.villagerId;
  ok('succession happened', newId !== oldId && !Game.state.over, oldId + ' -> ' + newId);
  const dc = (Game.corpses() || []).find(c => c.villagerId === oldId);
  ok('death pack corpse exists', !!dc);
  const ids = ((dc && dc.items) || []).map(i => i.itemId || i.id);
  ok('death pack intact on the corpse', ids.includes('multitool'), ids.join(','));
  ok('ashes narrated (fiction matches mechanic)', said.some(t => /ashes/i.test(t)), said.join(' | ').slice(0, 140));
}

// ============ (e) no path silently deletes gear ============
sec('(e) gear accounting: nothing silently vanishes');
{
  freshGame();
  const [v1] = villagers(1);
  setTrust({ [v1]: 20, [Game.villagerId]: 30 });
  giveGear(v1, [...GEAR, { ...SENT }]);
  const vp = Game.vpOf(v1) || {}; vp.mx = 4; vp.my = 4;
  triggerLethal();
  const c = ashCorpseFor(v1);
  for (let k = (c.items || []).length - 1; k >= 0; k--) Game.corpseTakeItem(c.id, k);
  const s = Game.state.scholar;
  const carried = ['multitool', 'hunting_spear']; // non-sentimental carried
  let accounted = 0;
  for (const gid of carried) {
    const onPile = (c.items || []).some(i => (i.itemId || i.id) === gid && (i.units == null ? 1 : i.units) > 0);
    const inPack = (s.inventory || []).some(i => (i.itemId || i.id) === gid);
    if (onPile || inPack) accounted++;
  }
  ok('every non-sentimental carried item accounted for', accounted === carried.length, accounted + '/' + carried.length);
}

// ============ (f) the norm is stated ============
sec('(f) ash-pile narration states the village norm');
{
  freshGame();
  const [v1] = villagers(1);
  setTrust({ [v1]: 20, [Game.villagerId]: 30 });
  giveGear(v1, [...GEAR]);
  triggerLethal();
  const c = ashCorpseFor(v1);
  const desc = Game.corpseDesc(c);
  ok('norm: belongs to the village', /belongs to the village/.test(desc), desc.slice(0, 120));
  ok('norm: both paths visible', /bring it home/.test(desc) && /pocket it/i.test(desc));
}

// ============ (g) taking the victim's gear: worst when you burned them ============
sec('(g) taking from the ashes: worst when you burned them');
{
  function lootScenario(mode) {
    // mode: 'ordinary' | 'ash-stranger' | 'ash-burner'
    freshGame();
    const [v1, w] = villagers(2);
    setTrust({ [v1]: 20, [w]: 20, [Game.villagerId]: 30 });
    const v = Game.state.village, s = Game.state.scholar;
    v.positions = { [w]: { mx: 4, my: 4 }, [v1]: { mx: 4, my: 4 } };
    s.mx = 4; s.my = 4;
    let c;
    if (mode === 'ordinary') {
      c = Game.registerDeath({ kind: 'villager', villagerId: v1, name: 'V1', mx: 4, my: 4, cause: 'test',
        items: [{ itemId: 'multitool', name: 'Multitool', units: 1, kg: 0.4, kcalEach: 0, spoilDay: 9999 }] });
      Game.removeVillager(v1, 'killed');
    } else {
      giveGear(v1, [{ itemId: 'multitool', name: 'Multitool', units: 1, kg: 0.4 }]);
      const vp = Game.vpOf(v1) || {}; vp.mx = 4; vp.my = 4;
      triggerLethal(); // player burned v1
      c = ashCorpseFor(v1);
      if (mode === 'ash-stranger') c.ashBearer = 'someone-else';
    }
    const repBefore = { ...(Game.repOf(w)) };
    const trustBefore = v.trust[w];
    Game.corpseTakeItem(c.id, 0);
    const repAfter = Game.repOf(w);
    return {
      dHonest: (repAfter.honest || 0) - (repBefore.honest || 0),
      dTrust: (v.trust[w] || 0) - (trustBefore || 0),
    };
  }
  const ordinary = lootScenario('ordinary');
  const stranger = lootScenario('ash-stranger');
  const burner = lootScenario('ash-burner');
  ok('ordinary looting moves honest down', ordinary.dHonest < 0, 'd=' + ordinary.dHonest);
  ok('ash looting is worse than ordinary', stranger.dHonest < ordinary.dHonest, stranger.dHonest + ' < ' + ordinary.dHonest);
  ok('burner taking their own victim: worst of all', burner.dHonest < stranger.dHonest, burner.dHonest + ' < ' + stranger.dHonest);
  ok('trust follows the same order',
    burner.dTrust <= stranger.dTrust && stranger.dTrust <= ordinary.dTrust,
    'ordinary=' + ordinary.dTrust + ' stranger=' + stranger.dTrust + ' burner=' + burner.dTrust);
}

// ============ (h) honored deposit at Haven ============
sec('(h) bringing ash gear home is honored');
{
  freshGame();
  const [v1] = villagers(1);
  setTrust({ [v1]: 20, [Game.villagerId]: 30 });
  giveGear(v1, [{ itemId: 'multitool', name: 'Multitool', units: 1, kg: 0.4 }]);
  const vp = Game.vpOf(v1) || {}; vp.mx = 4; vp.my = 4;
  triggerLethal();
  const c = ashCorpseFor(v1);
  Game.corpseTakeItem(c.id, 0);
  const s = Game.state.scholar, v = Game.state.village;
  let haven = null;
  for (let y = 0; y < 7 && !haven; y++) for (let x = 0; x < 7; x++) {
    if (Game.map.tiles[y][x].type === 'haven') haven = { x, y };
  }
  ok('haven tile exists', !!haven);
  Game.map.px = haven.x; Game.map.py = haven.y;
  s.insideHaven = true;
  ok('stores accessible inside hall', Game.havenStoresAccess() === 'inside');
  const idx = (s.inventory || []).findIndex(i => i.ashOf === v1);
  ok('ashOf-tagged tool in pack', idx >= 0);
  const trustBefore = v.trust[Game.villagerId] || 0;
  said = [];
  const r = Game.donateTool(idx);
  ok('deposit accepted', r !== null);
  const st = Game.stashState();
  ok('gear in village stores', (st.tools || []).some(t => t.itemId === 'multitool'));
  ok('trust reward fired', (v.trust[Game.villagerId] || 0) - trustBefore >= 8, 'delta=' + ((v.trust[Game.villagerId] || 0) - trustBefore));
  ok('honoring gossip seeded', (v.gossip || []).some(g => g.action === 'phoenix_honored'));
  ok('honor narrated', said.some(t => /bring it back/i.test(t)), said.join(' | ').slice(0, 140));
}

// ============ (i) clause-holders are never picked ============
sec('(i) two holders + one plain villager: the plain one always burns');
{
  let holderBurned = 0, runs = 0;
  for (let run = 0; run < 5; run++) {
    freshGame();
    const [v1, v2, v3] = villagers(3);
    setTrust({ [v1]: 20, [v2]: 20, [v3]: 20, [Game.villagerId]: 30 });
    Game.npcGrantAbility(v1, 'phoenix_clause');
    Game.npcGrantAbility(v2, 'phoenix_clause');
    const holders = new Set([v1, v2]);
    triggerLethal();
    const dead = [v1, v2, v3].filter(id => !Game.state.village.roster.includes(id));
    runs++;
    if (dead.some(d => holders.has(d))) holderBurned++;
    ok('run ' + run + ': plain villager burned', dead.length === 1 && dead[0] === v3, 'dead=' + dead.join(','));
  }
  ok('no holder burned in ' + runs + ' runs', holderBurned === 0);
}

// ============ (j) only holders left -> death sticks ============
sec('(j) only holders left: death sticks, honest message');
{
  freshGame();
  const [v1, v2] = villagers(2);
  setTrust({ [v1]: 20, [v2]: 20, [Game.villagerId]: 30 });
  Game.npcGrantAbility(v1, 'phoenix_clause');
  Game.npcGrantAbility(v2, 'phoenix_clause');
  const cheated = triggerLethal();
  ok('death NOT cheated', cheated === false);
  ok('honest "only its own" message', said.some(t => /only its own/i.test(t)), said.join(' | ').slice(0, 160));
}

// ============ (k) spent holder is eligible again ============
sec('(k) spent holder is eligible as a victim again');
{
  freshGame();
  const [v1] = villagers(1);
  setTrust({ [v1]: 20, [Game.villagerId]: 30 });
  Game.npcGrantAbility(v1, 'phoenix_clause');
  Game.npcRevokeAbility(v1, 'phoenix_clause'); // spent: already triggered once
  ok('clause revoked (spent)', !Game.npcHasAbility(v1, 'phoenix_clause'));
  const cheated = triggerLethal();
  const dead = [v1].filter(id => !Game.state.village.roster.includes(id));
  ok('death cheated: spent holder is a valid victim', cheated === true && dead.length === 1);
}

Game.say = _say;
console.log(`\n==== phoenix-gear: ${pass} pass, ${fail} fail (seed ${SEED}) ====`);
process.exit(fail ? 1 : 0);
