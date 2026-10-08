// SOCIALITE run (2026-10-07, archetype 2): the PARTY as a social unit.
// Covered in earlier socialite runs: convo threads, dry-thread fix, rumor
// lifecycle end-to-end, gossip knowledge-gating, followers volunteering.
// NEW territory this run: the full party arc as a player —
//   (1) real conversations to earn trust (feel: is it a grind?)
//   (2) followers on expedition (banter, travel hooks)
//   (3) System arrival: formal party, naming the party, roles
//   (4) party in combat: orders, coordination, victory/death beats
//   (5) the dark social beat: betrayal intent -> cues -> the strike -> aftermath
//   (6) dismissal / someone walking away
// Played as a player, judged like a player. Run: node scripts/play-feel-20261007-socialite.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // eval-phase stub only (equipment.js needs it at load)
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js',
 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window; // flips combat to the sync path
const Game = globalThis.Scattering.Game;

let rngState = 20261007 >>> 0;
const realRandom = Math.random;
Math.random = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; };

const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function flush(tag, max = 14) {
  const n = Math.min(says.length, max);
  for (const t of says.splice(0, n)) console.log(`   | ${tag} ${String(t).slice(0, 175)}`);
  if (says.length) { console.log(`   | ${tag} ...(${says.length} more lines suppressed)`); says.length = 0; }
}
function name(id) { try { return Game.displayName(id) || id; } catch (e) { return id; } }
function turn(vid, cid) {
  const r = Game.convoTurn(vid, cid);
  const line = r && (r.line || r.msg || '');
  console.log(`  you[${String(cid).slice(0, 30)}] -> "${String(line).slice(0, 190)}"`);
  return r;
}
function choices(vid) { return Game.convoChoices(vid) || []; }
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p'); if (p) { p.moveLeft = 0; p.acted = true; }
  Game.tbAfterPlayerAction();
}

(async () => {
  await Game.init();
  Game.debugScenario('day1');
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  console.log('cast:', roster.slice(0, 6).map(id => `${name(id)}(${Game.npcTemper(id)})`).join(' | '));

  // ============ ACT 1: real conversations to earn trust ============
  console.log('\n=== ACT 1: earning trust through real talk ===');
  const A = roster.find(id => Game.npcGoal(id) !== 'alone') || roster[0];
  v.trust = v.trust || {};
  console.log('talking to', name(A), 'goal:', Game.npcGoal(A), 'trust now:', v.trust[A] || 0);
  Game.startConvo(A);
  // play a real thread: opener answer -> personal -> a beat -> a second topic -> subject change
  let ch = choices(A);
  let ans = ch.find(c => c.id.indexOf('gq:') === 0) || ch.find(c => c.id === 'agree') || ch.find(c => c.id === 'silence');
  if (ans) turn(A, ans.id);
  let tried = 0;
  const want = ['ask:personal', 'tell:about', 'ask:work', 'ask:family', 'ask:opinion', 'ask:mood'];
  while (tried < 8) {
    ch = choices(A);
    const c = want.map(w => ch.find(x => x.id === w)).find(Boolean) ||
              ch.find(x => x.id.indexOf('thread:') === 0) ||
              ch.find(x => x.id.indexOf('dlg:') === 0 && x.id !== 'leave');
    if (!c) break;
    turn(A, c.id);
    if (c.id.indexOf('dlg:more') === 0) tried += 3; else tried++;
    if (ch.some(x => x.id === 'leave')) break;
  }
  console.log('trust after talk:', v.trust[A] || 0);
  Game.endConvo(A, 'left');
  // Second villager: quick two beats
  const B = roster.find(id => id !== A && Game.npcGoal(id) !== 'alone') || roster[1];
  Game.startConvo(B);
  ch = choices(B);
  ans = ch.find(c => c.id.indexOf('gq:') === 0) || ch.find(c => c.id === 'agree');
  if (ans) turn(B, ans.id);
  ch = choices(B);
  const q = ch.find(c => c.id === 'ask:personal') || ch.find(c => c.id.indexOf('dlg:') === 0);
  if (q) turn(B, q.id);
  console.log(name(B), 'trust after 2 beats:', v.trust[B] || 0);
  Game.endConvo(B, 'left');

  // ============ ACT 2: followers volunteer, then an expedition ============
  console.log('\n=== ACT 2: followers ===');
  v.trust[A] = 82; v.trust[B] = 78;
  let fol = [];
  for (let i = 0; i < 80 && fol.length < 2; i++) { Game.followerCheck(); fol = (Game.partyState().followers || []); }
  console.log('followers:', fol.map(name).join(', ') || '(none volunteered in 80 checks)');
  console.log('travelingWith:', Game.travelingWith().map(name).join(', '));
  flush('fol');
  // travel out — the wrapper places party + banter + betrayal sweep
  console.log('map before:', Game.map.px, Game.map.py);
  Game.travelTo(5, 4, true);
  console.log('map after:', Game.map.px, Game.map.py);
  flush('trav');
  // a few npc batch turns to see followers' life around camp-in-the-field
  for (let i = 0; i < 3; i++) { try { Game.npcBatchTurn(); } catch (e) { console.log('batch err', e.message); } }
  flush('batch');

  // ============ ACT 3: System arrival — the formal party ============
  console.log('\n=== ACT 3: System arrival ===');
  Game.state.scholar.day = 7;
  Game.checkSystemArrival();
  flush('sys');
  console.log('party:', Game.partyMembers().map(name).join(', '), '| cap:', Game.partyCap());
  // name the party in-conversation
  const M = Game.partyMembers()[0];
  if (M) {
    Game.startConvo(M);
    ch = choices(M);
    console.log('party_name choice present:', ch.some(c => c.id === 'party_name'));
    const np = ch.find(c => c.id === 'party_name');
    if (np) {
      const r = turn(M, np.id);
      console.log('name options offered above');
      ch = choices(M);
      const pick = ch.find(c => c.id.indexOf('party_namepick:') === 0);
      console.log('namepick choice present:', !!pick, pick && pick.label && String(pick.label).slice(0, 60));
      if (pick) turn(M, pick.id);
    }
    console.log('party name now:', JSON.stringify(Game.partyName()));
    // roles
    ch = choices(M);
    const role = ch.find(c => c.id === 'party_role');
    console.log('party_role choice present:', !!role);
    if (role) {
      turn(M, role.id);
      ch = choices(M);
      const rp = ch.find(c => c.id.indexOf('party_rolepick:') === 0);
      console.log('rolepick choices:', ch.filter(c => c.id.indexOf('party_rolepick:') === 0).map(c => c.id).join(', ') || '(none)');
      if (rp) turn(M, rp.id);
      console.log('role of', name(M), ':', Game.roleOf(M));
    }
    Game.endConvo(M, 'left');
  }
  flush('party');

  // ============ ACT 4: party in combat ============
  console.log('\n=== ACT 4: party combat ===');
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear', range: 2 } };
  s.mx = 4; s.my = 4;
  Game.state.village.positions[M] = { mx: 3, my: 4 };
  const other = Game.partyMembers().find(id => id !== M);
  if (other) Game.state.village.positions[other] = { mx: 5, my: 4 };
  s.monster = { id: 'sunbasker', mx: 6, my: 4 };
  Game.startCombat('sunbasker');
  console.log('fighters:', (Game.tbfight.fighters || []).map(f => f.kind + ':' + (f.name || '').slice(0, 18)).join(' | '));
  flush('cbt');
  // give one order if available, then fight 3 rounds
  if (M) {
    const om = Game.orderMember ? null : null;
    const ords = ['distract', 'guard', 'attack', 'flank', 'retreat'];
    const r = Game.orderMember(M, ords[Math.floor(realRandom() * ords.length)]);
    console.log('orderMember result:', JSON.stringify(r && (r.msg || r.ok)));
  }
  let rounds = 0;
  while (Game.tbfight && !Game.tbfight.over && rounds++ < 8) {
    if (Game.tbIsPlayerTurn()) {
      const ms = Game.tbfight.fighters.filter(x => x.kind === 'monster' && x.alive);
      if (!ms.length) break;
      const t = ms[0];
      Game.tbPlayerStrike(t.key);
      const p = Game.tbFighter('p');
      if (Game.tbIsPlayerTurn() && p) { p.moveLeft = 0; p.acted = true; Game.tbAfterPlayerAction(); }
    } else Game.tbAdvance();
    const p = Game.tbFighter('p'); if (p) { p.hp = p.maxHp; }
    s.health = 500;
  }
  console.log('combat over?', !!(Game.tbfight && Game.tbfight.over), 'rounds:', rounds);
  flush('fight');
  try { Game.partyVictoryBeat(1); } catch (e) { console.log('victoryBeat err', e.message); }
  flush('vic');

  // ============ ACT 5: the dark beat — betrayal ============
  console.log('\n=== ACT 5: betrayal ===');
  const betrayer = Game.partyMembers()[0];
  if (betrayer) {
    console.log('candidate:', name(betrayer), 'temper:', Game.npcTemper(betrayer), 'goal:', Game.npcGoal(betrayer));
    // force intent so the arc is playable in this window
    const intent = Game.betrayalIntent(betrayer, true);
    console.log('intent forced to:', intent);
    // travel far from haven to create opportunity
    Game.travelTo(7, 7, true);
    console.log('at haven?', Game.map.px === 3 && Game.map.py === 3);
    // give the player something worth killing for
    s.inventory = s.inventory || [];
    s.inventory.push({ itemId: 'dried_meat', name: 'Dried meat', units: 6, kcalEach: 400, kcal: 2400 });
    s.health = 50; // weak — opportunity math
    let struck = false;
    for (let i = 0; i < 40 && !struck; i++) {
      Game.betrayalSweep();
      struck = !!Game.tbfight;
    }
    console.log('betrayal struck:', struck);
    flush('betr');
    if (struck) {
      console.log('fighters:', (Game.tbfight.fighters || []).map(f => f.kind + ':' + (f.name || '').slice(0, 16)).join(' | '));
      // talk beats exist? check combat choices/exchange first round, then resolve
      let br = 0;
      while (Game.tbfight && !Game.tbfight.over && br++ < 6) {
        if (Game.tbIsPlayerTurn()) { Game.tbPlayerStrike(Game.tbfight.fighters.find(x => x.kind !== 'player' && x.alive).key); }
        if (Game.tbfight && !Game.tbfight.over) { if (Game.tbIsPlayerTurn()) endTurn(); else Game.tbAdvance(); }
        const p2 = Game.tbFighter('p'); if (p2) p2.hp = p2.maxHp;
      }
      console.log('betrayal fight over?', !!(Game.tbfight && Game.tbfight.over));
      try { Game.betrayalAftermath(); } catch (e) { console.log('aftermath err', e.message); }
      flush('after');
    }
  }

  // ============ ACT 6: dismissal ============
  console.log('\n=== ACT 6: dismissal ===');
  const left = Game.partyMembers();
  console.log('party before dismissal:', left.map(name).join(', ') || '(empty)');
  for (const vid of [...left]) {
    const r = Game.dismissFromParty(vid);
    console.log('dismiss', name(vid), '->', JSON.stringify(String(r && (r.msg || r.ok) || '').slice(0, 160)));
  }
  flush('dis');
  console.log('party after:', (Game.partyMembers() || []).map(name).join(', ') || '(empty)');

  console.log('\nDONE');
})();
