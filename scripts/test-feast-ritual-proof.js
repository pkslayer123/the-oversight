// PROOF: the feast as a ritual (feast-surge flesh-out 2026-10-10, Worker A).
// - feast deducts REAL pantry kcal (delta == spent, served sums to spent)
// - menu preview is honest (preview itemIds == served itemIds)
// - guest list affects quality (rich full -> legendary; rich 2-guest -> fine;
//   berry full -> fine via the legend gate)
// - invited vs showed up is real (sick/hostile skip with honest reasons)
// - broadcast beats fire when the System has arrived; pre-System the feast
//   is untelevised but still works
// - no-food feast is refused honestly; unarmed feast is ALLOWED (design call:
//   the feast is the social engine, arming is optional; an armed surge is
//   CONSUMED as the devotion payoff)
// - devotion arming preserved: channelSentiment arming untouched; an armed
//   surge is spent by the feast and marks feastSurgeUsed
// - grantFeastBuff(feast) contract call: {quality 0..2, served [{itemId,kcal}],
//   guests [ids], daypart}
// Each scenario boots a FRESH game (the village sim kills villagers across
// evenings — a shared game decays by the late scenarios; the freshness is
// test hygiene, not engine behavior).
// SEED env override. Run: node scripts/test-feast-ritual-proof.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED); // BEFORE eval: modules capture Math.random at load

let pass = 0, fail = 0;
const check = (name, fn) => { try { fn(); pass++; console.log('  ok -', name); } catch (e) { fail++; console.log('  FAIL -', name, '::', e.message); } };

// ---------- boot the full engine ----------
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"]*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: { classList: { remove() {}, add() {} } } };
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; // sync combat path (AGENTS.md)
const G = globalThis.Scattering.Game;

const said = [];
G.say = (m) => { said.push(String(m)); };
G.sysSay = (m) => { said.push(String(m)); };
const buffCalls = [];
G.grantFeastBuff = (feast) => { buffCalls.push(feast); };

// freshGame(): a new village, day 1, full pantry, player at haven.
function freshGame() {
  G.genRoster('Columbus, Ohio');
  G.newGame('Columbus, Ohio', null, G.generatedRoster[0].id);
  G.depart();
  said.length = 0; buffCalls.length = 0;
  const s = G.state.scholar, v = G.state.village;
  const me = G.villagerId;
  assert.ok(G.playerAtHaven(), 'fresh game not at haven');
  assert.ok((v.roster || []).length >= 6, 'fresh roster too small');
  return { s, v, me };
}
const hereGuests = (v) => G.feastPlan().guests.filter(g => g.status === 'here').map(g => g.vid);

const berryPantry = () => [{ name: 'Berries', kcalEach: 100, units: 300, foodKind: 'plant', foodState: 'raw' }];
const richPantry = () => [
  // sized so a full-village draw (4,800) takes all four stacks: the draw is
  // smallest-first, so the turkey leads and the variety + centerpiece land.
  { name: 'Smoked turkey leg', kcalEach: 100, units: 12, foodKind: 'meat', foodState: 'smoked' },
  { name: 'Dried berries', kcalEach: 100, units: 12, foodKind: 'plant', foodState: 'dried' },
  { name: 'Stewed roots', kcalEach: 150, units: 8, foodKind: 'plant', foodState: 'cooked' },
  { name: 'Travel bread', kcalEach: 200, units: 6, foodKind: 'plant', foodState: 'baked' },
]; // 4 distinct, 4,800 kcal total, centerpiece present

(async () => {
  await G.init();
  console.log(`== feast ritual proof (seed ${SEED}) ==`);

  // ---- 1. pre-System berry feast: real cost, honest served, contract ----
  {
    const { s, v, me } = freshGame();
    assert.ok(!G.state.systemArrived, 'System should not have arrived on day 1');
    v.pantry = berryPantry();
    const pre = G.hostFeast();
    check('unarmed pre-System feast is allowed (design: no arming required)', () => {
      assert.ok(pre.ok, 'refused: ' + pre.why);
      assert.strictEqual(pre.televised, false, 'pre-System should not televise');
      assert.deepStrictEqual(pre.beats, [], 'no beats pre-System');
    });
    check('real pantry deduction: delta == spent, served sums to spent', () => {
      assert.strictEqual(pre.spent, 4800, 'expected cost 4800, got ' + pre.spent);
      const sumServed = pre.served.reduce((t, x) => t + x.kcal, 0);
      assert.strictEqual(sumServed, pre.spent, `served ${sumServed} != spent ${pre.spent}`);
      assert.strictEqual(G.pantryKcalLive(v), 30000 - pre.spent, 'pantry not lighter by spent');
    });
    check('served is honest: a berry feast says berries', () => {
      assert.ok(pre.served.length === 1 && pre.served[0].itemId === 'berries', JSON.stringify(pre.served));
      assert.ok(pre.servedList[0].name === 'Berries', 'display name lost');
    });
    check('berry full-village feast is FINE (legend gate: no story on the table)', () => {
      assert.strictEqual(pre.quality, 1, 'quality=' + pre.quality + ' score=' + pre.score);
      assert.strictEqual(pre.score, 3, 'score=' + pre.score + ' ' + JSON.stringify(pre.factors));
    });
    check('contract call fired with the documented shape', () => {
      assert.strictEqual(buffCalls.length, 1, 'grantFeastBuff not called once');
      const f = buffCalls[0];
      assert.ok(f.quality >= 0 && f.quality <= 2, 'quality out of range');
      assert.ok(Array.isArray(f.served) && f.served.every(x => typeof x.itemId === 'string' && typeof x.kcal === 'number'), 'served malformed');
      assert.ok(Array.isArray(f.guests) && f.guests.length === pre.showed.length, 'guests mismatch');
      assert.ok(!f.guests.includes(me), 'host should not be in guests');
      assert.strictEqual(typeof f.daypart, 'number', 'daypart missing');
      assert.deepStrictEqual(Object.keys(f).sort(), ['daypart', 'guests', 'quality', 'served'], 'contract drift: ' + Object.keys(f).join(','));
    });
    check('no silent actions: the feast narrates with cost', () => {
      const t = said.join(' ');
      assert.ok(/FEAST/.test(t) && /kcal from the pantry/.test(t), 'no feast narration');
    });
  }

  // ---- 2. invited vs showed up ----
  {
    const { s, v } = freshGame();
    v.pantry = richPantry();
    const hg = hereGuests(v);
    assert.ok(hg.length >= 4, 'need 4 here-guests, have ' + hg.length);
    const sickVid = hg[2], hostileVid = hg[3];
    v.health = v.health || {}; v.health[sickVid] = 20;
    v.trust = v.trust || {}; v.trust[hostileVid] = 0;
    const repSkip = G.hostFeast({ guests: hg });
    check('sick villager skips honestly', () => {
      assert.ok(repSkip.ok, 'refused: ' + repSkip.why);
      assert.ok(!repSkip.showed.includes(sickVid), 'sick villager showed up');
      const sk = repSkip.skipped.find(k => k.vid === sickVid);
      assert.ok(sk && /tent|feverish/.test(sk.why), 'no honest reason: ' + JSON.stringify(sk));
    });
    check('hostile villager refuses honestly', () => {
      const sk = repSkip.skipped.find(k => k.vid === hostileVid);
      assert.ok(sk && /fire/.test(sk.why), 'no honest reason: ' + JSON.stringify(sk));
      assert.ok(!repSkip.showed.includes(hostileVid), 'hostile villager showed up');
    });
    check('planning UI data marks the sick and hostile', () => {
      s.feastDay = -1; // the plan is pure, but it refuses on feastDay
      const p = G.feastPlan();
      assert.ok(p.ok, 'plan refused: ' + p.why);
      const gs = p.guests.find(g => g.vid === sickVid), gh = p.guests.find(g => g.vid === hostileVid);
      assert.strictEqual(gs.status, 'sick', 'sick not marked');
      assert.strictEqual(gh.status, 'hostile', 'hostile not marked');
      assert.ok(Array.isArray(p.away), 'away list missing');
    });
  }

  // ---- 3. menu preview honesty + guest list affects quality ----
  {
    const { v } = freshGame();
    v.pantry = richPantry();
    const plan = G.feastPlan();
    check('menu preview matches what the fire gets', () => {
      assert.ok(plan.ok, 'plan refused: ' + plan.why);
      const rep = G.hostFeast();
      assert.ok(rep.ok, 'refused: ' + rep.why);
      const prevIds = plan.menu.map(m => m.itemId).sort();
      const servedIds = rep.served.map(x => x.itemId).sort();
      assert.deepStrictEqual(servedIds, prevIds, `preview ${prevIds} vs served ${servedIds}`);
      assert.ok(rep.servedList.some(x => x.meat), 'centerpiece meat not detected');
    });
  }
  {
    const { v } = freshGame();
    v.pantry = richPantry();
    const richFull = G.hostFeast();
    check('rich full-village feast is LEGENDARY', () => {
      assert.ok(richFull.ok, 'refused: ' + richFull.why);
      assert.strictEqual(richFull.quality, 2, `quality=${richFull.quality} score=${richFull.score} factors=${JSON.stringify(richFull.factors)}`);
      assert.strictEqual(richFull.qualityName, 'a LEGENDARY feast');
    });
  }
  {
    const { v } = freshGame();
    v.pantry = richPantry();
    const two = hereGuests(v).slice(0, 2);
    assert.ok(two.length === 2, 'need 2 here-guests');
    const richSmall = G.hostFeast({ guests: two });
    check('rich 2-guest feast is FINE (legend needs witnesses) — guest list affects quality', () => {
      assert.ok(richSmall.ok, 'refused: ' + richSmall.why);
      assert.strictEqual(richSmall.quality, 1, `quality=${richSmall.quality} score=${richSmall.score}`);
      assert.strictEqual(richSmall.factors.invitedN, 2, 'invited count wrong');
    });
  }

  // ---- 4. televised when the System has arrived ----
  {
    const { v } = freshGame();
    v.pantry = richPantry();
    G.state.systemArrived = true;
    const tv = G.hostFeast();
    check('broadcast beats fire (declare, spread, outcome)', () => {
      assert.ok(tv.ok, 'refused: ' + tv.why);
      assert.strictEqual(tv.televised, true, 'not televised');
      assert.ok(tv.beats.length >= 3, 'beats=' + tv.beats.length);
      assert.ok(tv.beats.some(b => /LIVE/.test(b) || /FEAST/.test(b)), 'no declare beat: ' + tv.beats[0]);
    });
    check('broadcast frame closes after the feast', () => {
      assert.ok(!(G.state.broadcast && G.state.broadcast.live), 'broadcast still live');
    });
    check('feast beats use the feast pool (food-bafflement, not generic)', () => {
      const t = said.join(' ');
      assert.ok(/nutrient paste|flavored matter|SHARING/.test(t), 'no feast-pool commentary found');
    });
    G.state.systemArrived = false;
  }

  // ---- 5. devotion arming: preserved and consumed as payoff ----
  {
    const { s, v } = freshGame();
    v.pantry = richPantry();
    s.prog = s.prog || {}; s.prog.feastSurge = 2.0;
    const armed = G.hostFeast();
    check('armed surge is spent BY the feast (devotion payoff)', () => {
      assert.ok(armed.ok, 'refused: ' + armed.why);
      assert.strictEqual(armed.surgeSpent, 2.0, 'surgeSpent=' + armed.surgeSpent);
      assert.strictEqual(s.prog.feastSurge, false, 'arming not consumed');
      assert.strictEqual(s.prog.feastSurgeUsed, true, 'deed not marked');
    });
    check('the payoff is narrated, not silent', () => {
      assert.ok(/the feast was the weapon/.test(said.join(' ')), 'no surge payoff narration');
    });
  }

  // ---- 6. honest refusals ----
  {
    const { s, v, me } = freshGame();
    v.pantry = [];
    const noFood = G.hostFeast();
    check('no-food feast refused honestly (says why)', () => {
      assert.ok(!noFood.ok, 'empty pantry feast allowed!');
      assert.ok(/pantry holds/i.test(noFood.why), 'why: ' + noFood.why);
    });
  }
  {
    const { v, me } = freshGame();
    v.pantry = richPantry();
    v.away = {}; (v.roster || []).forEach(id => { if (id !== me) v.away[id] = true; });
    const noGuests = G.hostFeast();
    check('no-guests feast refused honestly', () => {
      assert.ok(!noGuests.ok, 'guestless feast allowed!');
      assert.ok(/Nobody is here/.test(noGuests.why), 'why: ' + noGuests.why);
    });
  }
  {
    const { s, v } = freshGame();
    v.pantry = richPantry();
    const first = G.hostFeast();
    assert.ok(first.ok, 'first feast refused: ' + first.why);
    check('one feast per day still holds', () => {
      const twice = G.hostFeast();
      assert.ok(!twice.ok && /One feast a day/.test(twice.why), 'double feast allowed: ' + twice.why);
    });
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL:', e); process.exit(1); });
