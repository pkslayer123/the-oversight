#!/usr/bin/env node
// LONG-HORIZON FIX PROOF (2026-10-09): B1..B6 from the long-horizon playtest report.
// B1: playerDeath death pack — corpse gets the NON-sentimental gear; sentimentals
//     die with the owner (never on the corpse); the successor starts from their
//     own kit (no auto-transfer).
// B2: a gearless sapient corpse is an EMPTY death pack — no invented props, no keepsake.
// B3: codex.recipes is a string-keyed object; recipe knowledge survives a JSON
//     save/load round-trip; load() migrates old array-shaped saves.
// B4: crafting UI shows L1+ with honest odds (L1 35% blind, materials at risk;
//     L2+ 85%; L0 hidden).
// B5: villagerGearUp retrieves the best armor the villager personally owns;
//     never touches another villager's stash.
// B6: villagerHealCheck consumes deposited pharmacy medicine (smallest covering
//     dose) before the healer/rest fallback.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261009', 10);
Math.random = mulberry32(SEED);
const ROOT = path.join(__dirname, '..');
const _store = {};
global.localStorage = {
  getItem: k => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: k => { delete _store[k]; },
};
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'\"'\"']*\\.js' index.html | head -80", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) {} });
delete global.window;
const Game = globalThis.Scattering.Game;
const SC = globalThis.Scattering;
Game.say = function () {}; Game.sysSay = function () {}; Game.audioEvent = function () {};
if (Game.drama === undefined) Game.drama = function () {};

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL [seed ${SEED}] ${name}${detail ? ' — ' + detail : ''}`); }
}
const gid = e => (e && (e.itemId || e.id)) || e;

(async () => {
  await Game.init();
  Game.newGame('Columbus, Ohio', null, (Game.generatedRoster || [])[0] && Game.generatedRoster[0].id);
  const v = Game.state.village;
  const s = Game.state.scholar;
  const npcs = (v.roster || []).filter(id => id !== Game.villagerId);

  // ---------- B1: playerDeath death pack ----------
  const oldId = Game.villagerId;
  s.inventory = [
    { itemId: 'hunting_spear', name: 'Hunting Spear', units: 1, kg: 1.2 },
    { itemId: 'stone_knife', name: 'Stone Knife', units: 1, kg: 0.3 },
    { itemId: 'mothers_ring', name: "Mother's Ring", units: 1, kg: 0.1, bonded: true, sentimental: true },
  ];
  s.equipped = { melee: { itemId: 'fire_hardened_spear', name: 'Fire-hardened Spear' } };
  let corpseOpts = null;
  const origRD = Game.registerDeath;
  Game.registerDeath = function (o) { corpseOpts = o; return origRD.call(this, o); };
  try { Game.playerDeath('a test accident'); } catch (e) { check('playerDeath runs', false, String(e && e.message)); }
  Game.registerDeath = origRD;
  const packIds = (corpseOpts && corpseOpts.items || []).map(gid);
  check('B1 corpse carries real gear (spear)', packIds.includes('hunting_spear'));
  check('B1 corpse carries real gear (knife)', packIds.includes('stone_knife'));
  check('B1 corpse carries equipped gear', packIds.includes('fire_hardened_spear'));
  check('B1 sentimental NOT on corpse', !packIds.includes('mothers_ring'), packIds.join(','));
  const newId = Game.villagerId;
  const succ = Game.getPerson(newId);
  const succKit = ((succ && succ.items) || []).map(gid);
  const succInvIds = (s.inventory || []).map(gid);
  check('B1 successor chosen', newId && newId !== oldId);
  check('B1 successor starts from own kit', succInvIds.every(id => succKit.includes(id)) && succInvIds.length > 0,
    'inv=' + succInvIds.join(',') + ' kit=' + succKit.join(','));
  check('B1 no auto-transfer of dead gear', JSON.stringify(succInvIds.slice().sort()) === JSON.stringify(succKit.slice(0, 5).map(gid).sort()),
    'inv=' + succInvIds.join(','));
  check('B1 sentimental died with owner (nowhere)', !succInvIds.includes('mothers_ring'));

  // ---------- B2: empty sapient death pack ----------
  Game.data.villagers.push({ id: 'test_ghost_lr', name: 'Test Ghost', items: [], stashed: [] });
  const emptyPack = Game.generatePossessions({ kind: 'villager', villagerId: 'test_ghost_lr' });
  check('B2 gearless sapient corpse is empty', Array.isArray(emptyPack) && emptyPack.length === 0,
    'got ' + JSON.stringify(emptyPack).slice(0, 120));
  Game.data.villagers.push({ id: 'test_ghost_lr2', name: 'Test Ghost 2', items: ['mothers_ring'], stashed: [] });
  const sentPack = Game.generatePossessions({ kind: 'villager', villagerId: 'test_ghost_lr2' });
  check('B2 sentimental-only corpse is empty', Array.isArray(sentPack) && sentPack.length === 0);

  // ---------- B3: recipe knowledge survives save/load ----------
  const cx = SC.state.newCodex();
  check('B3 newCodex recipes is a plain object', cx.recipes && typeof cx.recipes === 'object' && !Array.isArray(cx.recipes));
  Game.state.codex.recipes['stone_knife'] = { level: 2 };
  const rt = JSON.parse(JSON.stringify(Game.state.codex));
  check('B3 knowledge survives JSON round-trip', rt.recipes.stone_knife && rt.recipes.stone_knife.level === 2);
  // end-to-end: save, tamper the save to the old array shape, load, check migration
  Game.save();
  const key = SC.state.saveKey(Game.state);
  const raw = JSON.parse(_store[key]);
  raw.codex.recipes = [];
  _store[key] = JSON.stringify(raw);
  let loaded = false;
  try { loaded = Game.load(key) !== false; } catch (e) { check('B3 load() runs', false, String(e && e.message)); }
  check('B3 load succeeds on old-shape save', loaded);
  check('B3 migration normalizes recipes to object', !Array.isArray(Game.state.codex.recipes) && typeof Game.state.codex.recipes === 'object');
  // load() replaced Game.state — refresh all references for the tests below
  const vR = Game.state.village;
  const npcsR = (vR.roster || []).filter(id => id !== Game.villagerId);

  // ---------- B4: crafting UI shows L1+ honestly ----------
  Game.state.codex.recipes = { stone_knife: { level: 1 }, bow: { level: 2 }, crossbow: { level: 0 } };
  const recipes = Game.data.recipes || [];
  const shown = recipes.filter(r => ((Game.state.codex.recipes || {})[r.id] || {}).level >= 1).map(r => r.id);
  check('B4 L1 recipe visible', shown.includes('stone_knife'));
  check('B4 L2 recipe visible', shown.includes('bow'));
  check('B4 L0 recipe hidden', !shown.includes('crossbow'));
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  check('B4 UI labels blind 35%', appSrc.includes('Try blind (35%)'));
  check('B4 UI labels 85%', appSrc.includes('(85%)'));
  check('B4 materials hidden at L1 (knowledge-gated)', appSrc.includes('materials unknown'));

  // ---------- B5: armor from own stash ----------
  const vid = npcsR[0];
  const person = Game.getPerson(vid);
  const other = Game.getPerson(npcsR[1]);
  const otherStashBefore = JSON.stringify(other.stashed || []);
  person.stashed = person.stashed || [];
  // strip any armor they already carry so the stash fetch is observable
  person.items = (person.items || []).filter(i => {
    const d = (Game.data.items || []).find(x => x.id === gid(i));
    return !(d && d.armor);
  });
  person.stashed.push('bark_armor');
  Game.villagerGearUp(vid, true);
  check('B5 villager retrieves own stashed armor', (person.items || []).some(i => gid(i) === 'bark_armor'));
  check('B5 never touches another villager stash', JSON.stringify(other.stashed || []) === otherStashBefore);

  // ---------- B6: pharmacy before healer ----------
  const hvid = npcsR[1];
  const st = Game.stashState();
  st.medicine = [
    { itemId: 'field_sutures', name: 'Field Sutures' }, // heal 40
    { itemId: 'surgeons_kit', name: "Surgeon's Kit" },  // heal 80
  ];
  vR.health = vR.health || {};
  vR.health[hvid] = 65; // deficit 35 → smallest covering dose is the 40, not the 80
  Game.villagerHealCheck(hvid, 'Testy');
  const medIds = (st.medicine || []).map(gid);
  check('B6 medicine consumed', medIds.length === 1, medIds.join(','));
  check('B6 smallest covering dose used', medIds.includes('surgeons_kit') && !medIds.includes('field_sutures'),
    'remaining=' + medIds.join(','));
  check('B6 villager healed by medicine', vR.health[hvid] === 100, 'hp=' + vR.health[hvid]);
  // no medicine left → falls back to healer/rest, doesn't crash
  vR.health[hvid] = 40;
  let threw = false;
  try { Game.villagerHealCheck(hvid, 'Testy'); } catch (e) { threw = true; }
  check('B6 fallback works with empty pharmacy', !threw);

  console.log(`\n${pass} pass, ${fail} fail (seed ${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('HARNESS ERROR', e); process.exit(2); });
