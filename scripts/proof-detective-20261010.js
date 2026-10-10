// Hostile-detective attacks (playtest loop 2026-10-10).
// A1 EXPLOIT: re-confrontation grind — every press must cost the accuser; refusal must hold.
// A2 SOFTLOCK: lead doubt on a nonverbal villager with no on-node interpreter — can it ever resolve?
// A3 HONESTY: tentative clears must cost nothing; doubtsHTML must not promise what the engine can't deliver.
// Full index.html load order minus DOM-only modules. RNG seeded BEFORE eval.
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
const SEED = parseInt(process.env.SEED || '20261010', 10);
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-beats.js',
 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
 'src/js/broadcast.js', 'src/js/contestEngine.js', 'src/js/alienPlayers.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/corruption.js', 'src/js/lifeseed.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js',
 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js', 'src/js/villager-agency.js',
 'src/js/fieldFights.js', 'src/js/villager-objectives.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

let checks = 0, failures = 0;
function check(cond, label, extra) {
  checks++;
  if (!cond) { failures++; console.log(`  FAIL ${label}${extra ? ' — ' + extra : ''}`); }
  else console.log(`  ok   ${label}${extra ? ' — ' + extra : ''}`);
}
const osay = Game.say.bind(Game);
Game.say = (t) => osay(t);
function clearLog() { if (Game.log) Game.log.length = 0; }
function forceRand(v) { const real = Math.random; Math.random = () => v; return () => { Math.random = real; }; }

async function main() {
  console.log(`seed=${SEED}`);
  await Game.init();
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100; s.mx = 4; s.my = 4;
  clearLog();

  const me = Game.villagerId;
  const npcs = Game.npcIds().filter(id => id !== me);
  // trustOf: a real 0 must stay 0 (the `|| 10` bug resurrected hated villagers — brawler 2026-10-08)
  const trustOf = (vid) => { const t = (Game.state.village.trust || {})[vid]; return t === undefined ? 10 : t; };
  const repHonest = (vid) => Game.repOf(vid).honest;

  // ---------- A1: every press costs the accuser ----------
  console.log('\n== A1: accusation grind ==');
  const liar = npcs[0];
  const vp = Game.vpOf(liar);
  // pathological + prickly: confessP deeply negative at trust 10, forced rolls land deterministically
  vp.personality = { temperament: 'prickly', dark: { kind: 'malicious' } };
  vp.lies = { occupation: { told: 'paramedic', truth: 'surgeon', motive: 'pathological', field: 'occupation' } };
  (Game.state.village.trust = Game.state.village.trust || {})[liar] = 10;
  const d1 = Game.addDoubt(liar, 'contradiction', 'test contradiction',
    ['now says "paramedic"'], { field: 'occupation' });
  clearLog();
  check(!!d1 && !d1.resolved, 'A1 setup: doubt planted');
  // the engine's own hearers (accuserPays picks npcIds().slice(0,3) minus the target)
  const engineHearers = Game.npcIds().filter(id => id !== liar).slice(0, 3);
  // one forced deflection: accuser pays, victim trust drains, doubt stays open
  let firstDelta = null;
  {
    const repBefore = engineHearers.map(repHonest);
    const un = forceRand(0.0);
    const r = Game.confrontDoubt(liar, d1.id);
    un(); clearLog();
    const repAfter = engineHearers.map(repHonest);
    check(r.outcome === 'deflected', 'A1: forced deflection', r.outcome);
    // rep moves -2 per hearer plus 40% group ripples — the invariant is: every press costs
    check(repAfter.every((v, i) => v < repBefore[i]), 'A1: every hearer docks the accuser on a press',
      repBefore.join(',') + ' -> ' + repAfter.join(','));
    firstDelta = repBefore.map((v, i) => v - repAfter[i]);
    check(trustOf(liar) === 7, 'A1: victim trust drains on deflect', 'trust=' + trustOf(liar));
    check(!d1.resolved, 'A1: doubt stays open after deflection');
    check(typeof r.afterSay === 'string' && r.afterSay.length > 0, 'A1: the stain is narrated (no silent actions)');
  }
  // accuserPays is per-press, not per-doubt: 3 more direct presses, 3 more stains
  {
    const repBefore = engineHearers.map(repHonest);
    Game.accuserPays(liar, 'deflected'); Game.accuserPays(liar, 'deflected'); Game.accuserPays(liar, 'deflected');
    const repAfter = engineHearers.map(repHonest);
    check(repAfter.every((v, i) => v === repBefore[i] - 3 * firstDelta[i]),
      'A1: repeated presses keep costing (no free re-accuse)',
      repBefore.join(',') + ' -> ' + repAfter.join(','));
  }

  // REFUSAL (widened 2026-10-10): counter-attack refuses ALL confrontation for 2 days,
  // villager-level — a second open doubt must not bypass it. New doubts planted after
  // the blowup are new business.
  const dayX = Game.state.scholar.day || 0;
  {
    const un = forceRand(0.99); // >= confessP+0.35 -> attacked
    const r = Game.confrontDoubt(liar, d1.id);
    un(); clearLog();
    check(r.outcome === 'attacked', 'A1: forced counter-attack', r.outcome);
    check(d1.refusedUntil > 0, 'A1: per-doubt refusal stamp set', 'refusedUntil=' + d1.refusedUntil);
    const vr = Game.truthRefusal(liar);
    check(!!vr && vr.until === dayX + 2, 'A1-FIX: villager-level refusal recorded', JSON.stringify(vr));
    const r2 = Game.confrontDoubt(liar, d1.id);
    clearLog();
    check(r2.outcome === 'refused' && !r2.ok, 'A1: same-doubt re-press during cooldown refused', r2.outcome);
  }
  // second doubt, SAME day: still refused (the loophole)
  vp.lies.origin = { told: 'Denver', truth: 'Gary', motive: 'hiding', field: 'origin' };
  vp.lies.goal = { told: 'belong', truth: 'escape', motive: 'hiding', field: 'goal' };
  const d2 = Game.addDoubt(liar, 'contradiction', 'test contradiction 2',
    ['said "Gary"', 'now says "Denver"'], { field: 'origin' });
  {
    const c = Game.convoGet(liar);
    c.active = true; c.thread = 'talk'; c.pendingQ = null; c.interpreter = null;
    const menu = Game.convoChoices(liar);
    check(!menu.some(ch => ch.id === 'confront:' + d2.id), 'A1-FIX: menu withholds confront on 2nd doubt during refusal',
      'choices=' + menu.map(x => x.id).join(','));
    const r3 = Game.confrontDoubt(liar, d2.id);
    clearLog();
    check(r3.outcome === 'refused' && !r3.ok, 'A1-FIX: engine refuses 2nd-doubt press during refusal', r3.outcome);
  }
  // new business: a doubt planted AFTER the blowup day stays actionable
  Game.state.scholar.day = dayX + 1;
  const d3 = Game.addDoubt(liar, 'contradiction', 'test contradiction 3',
    ['now wants "belong"'], { field: 'goal' });
  {
    const un = forceRand(0.3);
    const r = Game.confrontDoubt(liar, d3.id);
    un(); clearLog();
    check(r.ok === true && r.outcome !== 'refused', 'A1-FIX: doubt planted after refusal day is new business',
      'outcome=' + r.outcome);
  }
  // cooldown expiry: old doubts become actionable again
  Game.state.scholar.day = dayX + 3;
  {
    const un = forceRand(0.3);
    const r = Game.confrontDoubt(liar, d2.id);
    un(); clearLog();
    check(r.ok === true && r.outcome !== 'refused', 'A1-FIX: refusal expires after 2 days', 'outcome=' + r.outcome);
  }

  // ---------- A2: nonverbal villager, lead doubt, no interpreter ----------
  console.log('\n== A2: nonverbal target softlock ==');
  const mute = npcs[1];
  // npcLangs prefers person.languages (data.villagers) over bgLangs — set both.
  for (const id of npcs) {
    const p = Game.data.villagers.find(v => v.id === id);
    if (p) p.languages = { native: 'english' };
  }
  const pm = Game.data.villagers.find(v => v.id === mute);
  if (pm) pm.languages = { native: 'xhosa' };
  Game.state.village.bgLangs = Game.state.village.bgLangs || {};
  for (const id of npcs) Game.state.village.bgLangs[id] = { native: 'english' };
  Game.state.village.bgLangs[mute] = { native: 'xhosa' };
  check(Game.commLevel(mute).level === 'none', 'A2 setup: target nonverbal to player', Game.commLevel(mute).level);
  check(Game.findInterpreter(mute, 'xhosa') === null, 'A2 setup: no on-node interpreter');
  const teller = npcs[2];
  Game.checkGossipClaim(mute, 'origin', 'Chicago', teller);
  clearLog();
  const lead = Game.getDoubts(mute).find(d => d.kind === 'gossip');
  check(!!lead, 'A2 setup: gossip lead doubt planted', lead && lead.text.slice(0, 60));
  const c2 = Game.convoGet(mute);
  c2.active = true; c2.thread = 'nonverbal'; c2.pendingQ = null; c2.interpreter = null;
  const menu2 = Game.convoChoices(mute);
  check(!menu2.some(ch => String(ch.id).indexOf('confront:') === 0),
    'A2: confront choice silently omitted for nonverbal+unbridged', 'choices=' + menu2.map(x => x.id).join(','));
  Game.observePerson(mute); clearLog();
  check(!lead.resolved && Game.getDoubts(mute).length > 0, 'A2: doubt still open — watching adds, never resolves');
  Game.langExposureGain(mute, 'xhosa', 3);
  check(Game.langExposure('xhosa') >= 3, 'A2: exposure gain registers (escape hatch exists)', 'exposure=' + Game.langExposure('xhosa'));

  // ---------- A3: tentative clears cost nothing ----------
  console.log('\n== A3: honesty of tentative clears ==');
  const leadT = npcs[3];
  Game.state.village.bgLangs[leadT] = { native: 'english' };
  Game.checkGossipClaim(leadT, 'occupation', 'baker', teller);
  clearLog();
  const gdoubt = Game.getDoubts(leadT).find(d => d.kind === 'gossip' && !d.resolved);
  check(!!gdoubt && Game.doubtIsLead(gdoubt), 'A3 setup: lead doubt');
  const hRep0 = repHonest(npcs[4]);
  const tLead0 = trustOf(leadT);
  const c3 = Game.convoGet(leadT);
  c3.active = true; c3.thread = 'talk'; c3.pendingQ = null; c3.interpreter = null;
  const r4 = Game.confrontDoubt(leadT, gdoubt.id);
  clearLog();
  const mem = ((Game.state.village.memory || {})[leadT] || []).some(m => m.t === 'wrongly_accused');
  check(r4.outcome === 'cleared' && gdoubt.resolved && repHonest(npcs[4]) === hRep0 && trustOf(leadT) === tLead0 && !mem,
    'A3: tentative (lead) clear costs nothing',
    `outcome=${r4.outcome} rep ${hRep0}->${repHonest(npcs[4])} trust ${tLead0}->${trustOf(leadT)}`);

  // ---------- A3b: journal promise honesty ----------
  const src = fs.readFileSync(path.join(ROOT, 'src/js/truth.js'), 'utf8');
  check(!src.includes('❓ unresolved — confront them, watch them, or ask around'),
    'A3b-FIX: doubtsHTML no longer promises watch/ask-around as resolution');
  check(src.includes('only a confrontation closes this'),
    'A3b-FIX: doubtsHTML names confrontation as the one resolution path');
  check(src.includes('you share no words with them yet'),
    'A3b-FIX: doubtsHTML names the language block for nonverbal targets');
  // render check: the nonverbal lead doubt's card carries the language hint
  {
    const html = Game.doubtsHTML();
    check(html.includes('you share no words with them yet'),
      'A3b-FIX: rendered doubts card explains the blocked confrontation');
  }

  console.log(`\n${checks - failures}/${checks} checks passed.`);
  if (failures) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
