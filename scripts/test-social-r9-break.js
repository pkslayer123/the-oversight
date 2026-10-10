// BREAK-IT social r9 (2026-10-09): hostile-player attack battery on social systems.
// BEFORE: ghost quests, phantom witnesses, votes from exile, double exiles,
//   promises rotting on ghosts. AFTER: all closed, proven here.
// Run: node scripts/test-social-r9-break.js (SEED=... optional)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261009', 10);
function mulberry32(seed) {
  let s = seed >>> 0;
  const f = function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.reset = (ns) => { s = ns >>> 0; }; return f;
}
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js', 'src/js/drama.js']);
[...html.matchAll(/src\/js\/[^\/\\\"]+\.js|src\/js\/engine\/[^\/\\\"]+\.js/g)].map(m => m[0]).filter(f => !SKIP.has(f))
  .forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

(async () => {
  await Game.init();
  Game.debugScenario('day1');
  const S = Game.state, v = S.village, s = S.scholar;
  const me = Game.villagerId;
  const npcs = () => (v.roster || []).filter(id => id !== me);
  if (npcs().length < 4) { console.log('SKIP: not enough villagers'); process.exit(0); }
  const fails = [];
  const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' — ' + extra : '')); if (!cond) fails.push(name); };
  const quiet = Game.say; Game.say = () => {}; Game.sysSay = () => {};

  // ============ E1: conversation trust farm — words alone cap at 40 ============
  {
    const vid = npcs()[0];
    v.trust = v.trust || {}; v.trust[vid] = 10;
    for (let i = 0; i < 200; i++) Game.resolveConsequence(vid, { trust: 3, temper: 'kind', name: 'farm' });
    check('E1 resolver trust farm caps at 40', v.trust[vid] <= 40, `trust=${v.trust[vid]}`);
  }

  // ============ E2: endConvo spam without a real convo pays nothing ============
  {
    const vid = npcs()[1];
    v.trust = v.trust || {}; v.trust[vid] = 10;
    for (let i = 0; i < 20; i++) { try { Game.endConvo(vid); } catch (e) {} }
    check('E2 endConvo spam pays nothing', v.trust[vid] === 10, `trust=${v.trust[vid]}`);
  }

  // ============ S1: GHOST QUEST — giver removed, quest lapses, no turn-in ============
  {
    const giver = npcs()[2];
    s.activeQuest = { type: 'bring', plant: 'dandelion', qty: 3, reward: 'pantry',
      giver, giverName: Game.npcName(giver), text: 'x' };
    s.inventory = [{ plantId: 'dandelion', units: 3, id: 'dandelion' }];
    let said = []; Game.say = (m) => said.push(String(m));
    Game.removeVillager(giver, 'killed');
    const lapsed = !s.activeQuest;
    const saidAloud = said.some(m => /gone|dead|errand/i.test(m));
    // even if the player forages anyway, nothing completes
    s.activeQuest = { type: 'bring', plant: 'dandelion', qty: 3, reward: 'pantry', giver, giverName: 'Ghost', text: 'x' };
    said = []; Game.say = (m) => said.push(String(m));
    Game.checkQuest('forage');
    const ghostPaid = said.some(m => /✅/.test(m));
    const guardLapsed = !s.activeQuest;
    const guardSaid = said.some(m => /lapses|gone/i.test(m));
    Game.say = () => {};
    check('S1 ghost quest lapses on giver removal', lapsed && saidAloud, `lapsed=${lapsed} said=${saidAloud}`);
    check('S1 checkQuest guard lapses stale-giver quests (old saves)', guardLapsed && !ghostPaid && guardSaid,
      `lapsed=${guardLapsed} paid=${ghostPaid} said=${guardSaid}`);
  }

  // ============ S4: PHANTOM WITNESS — exiled NPC can't testify ============
  {
    const ghost = npcs()[0];
    v.positions = v.positions || {};
    s.mx = 4; s.my = 4;
    v.positions[ghost] = { mx: 5, my: 4 };
    v.nodePos = v.nodePos || {}; v.nodePos[ghost] = { nx: Game.map.px, ny: Game.map.py };
    Game.say = () => {};
    Game.removeVillager(ghost, 'exiled');
    const posGone = !v.positions[ghost];
    const nodeGone = !(v.nodePos || {})[ghost];
    const wit = Game.witnesses(6) || [];
    let said = []; Game.say = (m) => said.push(String(m));
    for (let i = 0; i < 8; i++) { try { Game.combatWitnessReact('start'); } catch (e) {} }
    Game.say = () => {};
    const ghostName = (() => { try { return Game.npcName(ghost); } catch (e) { return null; } })();
    const ghostSpoke = ghostName && said.some(m => m.includes(ghostName));
    check('S4 exile clears grid+node position', posGone && nodeGone, `pos=${posGone} node=${nodeGone}`);
    check('S4 exiled not in witnesses()', !wit.includes(ghost), `wit=${JSON.stringify(wit).slice(0, 80)}`);
    check('S4 the gone do not speak at fights', !ghostSpoke, `lines=${said.length}`);
  }

  // ============ S5: VOTE FROM EXILE — moot doesn't wait ============
  {
    // fabricate a minimal open case with a pending player vote
    const acc = npcs()[0];
    const c = { id: 't-exile-vote', charge: 'theft', accused: [acc], accuser: npcs()[1],
      status: 'open', belief: {}, bribes: [], exposedBribes: [],
      trial: { present: npcs().slice(0, 3), votes: [], guilty: 1, playerVoter: true, awaitingPlayerVote: true } };
    const bs = Game.betrayalState(); bs.cases = bs.cases || []; bs.cases.push(c);
    s.exiled = true;
    let said = []; Game.say = (m) => said.push(String(m));
    let res = null, threw = null;
    try { res = Game.castPlayerVote(c.id, true); } catch (e) { threw = e.message; }
    Game.say = () => {};
    const finalized = !c.trial.awaitingPlayerVote && (res && (res.resolved || res.acquitted || res.trial !== undefined || true));
    const saidHonest = said.some(m => /exiled/i.test(m));
    s.exiled = false;
    const ci = bs.cases.indexOf(c); if (ci >= 0) bs.cases.splice(ci, 1);
    check('S5 exiled player vote finalizes without them', !threw && finalized && saidHonest,
      `threw=${threw} finalized=${finalized} honest=${saidHonest}`);
  }

  // ============ S6: no double exile entry ============
  {
    const vid = 'probe-double-exile';
    (v.roster = v.roster || []).push(vid);
    v.exiles = v.exiles || [];
    const before = v.exiles.filter(e => e && e.vid === vid).length;
    Game.say = () => {};
    Game.removeVillager(vid, 'exiled');
    Game.removeVillager(vid, 'exiled'); // accused exiled off-ladder, then sentenced at moot
    const after = v.exiles.filter(e => e && e.vid === vid).length;
    check('S6 single exile record per villager', after === before + 1, `before=${before} after=${after}`);
  }

  // ============ S7: promise to the removed is released, never rots ============
  {
    const vid = npcs()[0];
    v.promises = v.promises || {};
    v.promises[vid] = { goal: 'belong', day: s.day - 8, kept: false }; // past rot age
    v.trust = v.trust || {}; v.trust[vid] = 30;
    let said = []; Game.say = (m) => said.push(String(m));
    Game.removeVillager(vid, 'killed');
    const released = v.promises[vid] && v.promises[vid].kept === 'released';
    const saidRelease = said.some(m => /unkeepable|promise/i.test(m));
    Game.checkPromises('talk', null); // communal sweep must not touch it
    const stillReleased = v.promises[vid].kept === 'released';
    const trustUnmoved = v.trust[vid] === 30;
    Game.say = () => {};
    check('S7 promise released on removal', released && saidRelease, `released=${released}`);
    check('S7 released promise never rots or "keeps"', stillReleased && trustUnmoved,
      `state=${v.promises[vid].kept} trust=${v.trust[vid]}`);
  }

  // ============ S8: player exile lapses giver-anchored quests ============
  {
    const giver = npcs()[0];
    s.activeQuest = { type: 'bring', plant: 'dandelion', qty: 3, reward: 'pantry',
      giver, giverName: Game.npcName(giver), text: 'x' };
    let said = []; Game.say = (m) => said.push(String(m));
    try { Game.exilePlayer('moot'); } catch (e) { said.push('THREW:' + e.message); }
    const lapsed = !s.activeQuest;
    const honest = said.some(m => /old fire|exile/i.test(m));
    // reset exile state for subsequent checks
    s.exiled = false;
    try { Game.justiceState().exiled = false; } catch (e) {}
    Game.say = () => {};
    check('S8 exile lapses giver-anchored quest', lapsed && honest && !said.some(m => /^THREW/.test(m)),
      `lapsed=${lapsed} honest=${honest}`);
  }

  // ============ H2: callMoot(nonexistent) is a safe no-op ============
  {
    let ret = 'n/a', threw = null;
    try { ret = Game.callMoot('no-such-case', me); } catch (e) { threw = e.message; }
    check('H2 callMoot(nonexistent) returns null', !threw && ret === null, `ret=${ret}`);
  }

  // ============ D1: ledger's 3 dead functions still have no callers ============
  {
    const jsFiles = fs.readdirSync(path.join(ROOT, 'src/js')).filter(f => f.endsWith('.js'));
    const dead = [];
    for (const n of ['shareFood', 'hoardFood', 'hearGossipAboutSelf']) {
      let ncall = 0;
      for (const f of jsFiles) {
        for (const l of fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8').split('\n')) {
          const t = l.trim();
          if (t.startsWith('//') || t.startsWith('*') || t.startsWith(n + '(') || t.startsWith(n + ':')) continue;
          if (l.includes(n + '(')) ncall++;
        }
      }
      if (ncall) dead.push(`${n}:${ncall}`);
    }
    console.log('  D1 dead ledger fns with callers: ' + (dead.join(', ') || 'none'));
    check('D1 no new callers on dead ledger fns', dead.length === 0, dead.join(','));
  }

  Game.say = quiet;
  console.log(fails.length ? `\n${fails.length} FAILURES: ${fails.join('; ')}` : '\nALL GREEN');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
