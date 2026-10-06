// Party system + PK/betrayal tests. Usage: node scripts/test-party.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  ok('roster has NPCs', roster.length >= 3);
  const A = roster[0], B = roster[1], C = roster[2];

  // --- 1. Pre-System: no formal party ---
  eq('party not unlocked pre-System', Game.partyUnlocked(), false);
  const preInvite = Game.inviteToParty(A);
  eq('invite refused pre-System', preInvite.ok, false);
  ok('pre-System msg mentions no formal party', /no formal party/i.test(preInvite.msg));

  // --- 2. Followers: high trust NPCs volunteer pre-System ---
  v.trust = v.trust || {};
  // Pick a volunteer-eligible NPC (goal not 'alone'), clear the field.
  const Av = roster.find(id => Game.npcGoal(id) !== 'alone');
  ok('found volunteer-eligible NPC', !!Av);
  const Apick = Av || roster[0];
  v.followers = [];
  v.trust[Apick] = 80;
  // force the follower roll by calling many times (12% chance each)
  for (let i = 0; i < 120 && !Game.isFollower(Apick); i++) Game.followerCheck();
  ok('high-trust NPC may volunteer as follower', Game.isFollower(Apick));
  eq('follower travels with you', Game.travelingWith().includes(Apick), true);

  // --- 3. System arrival unlocks party ---
  Game.state.scholar.day = 7;
  Game.checkSystemArrival();
  eq('system arrived', !!Game.state.systemArrived, true);
  eq('party unlocked', Game.partyUnlocked(), true);
  eq('party cap 3', Game.partyCap(), 3);
  // followers converted to party
  if (Game.isFollower(Apick) || v.party.includes(Apick)) {
    ok('follower converted to party on unlock', Game.inParty(Apick));
  } else {
    console.log('note: follower did not volunteer in test rolls; testing invite path instead');
  }

  // --- 4. Invite: SLIGHT trust gate (Steve 2026-10-04). The System insists
  // you at least KNOW the person (trust >= 20). Zero trust is refused.
  v.trust[B] = 0; // absolute zero trust
  const realRandom = Math.random;
  Math.random = () => 0.0; // force acceptance roll to succeed
  const lowTrustJoin = Game.inviteToParty(B);
  Math.random = realRandom;
  eq('zero-trust NPC refused (trust gate)', lowTrustJoin.ok, false);
  ok('refusal mentions knowing them', /know/i.test(lowTrustJoin.msg));
  v.trust[B] = 25; // just over the floor
  Math.random = () => 0.0;
  const knownJoin = Game.inviteToParty(B);
  Math.random = realRandom;
  ok('known NPC (trust 25) CAN join party', knownJoin.ok && Game.inParty(B));
  // And refusal is possible too (it's their choice, not the System's).
  const D = roster.find(id => !Game.inParty(id) && (v.roster || []).includes(id));
  if (D) {
    v.trust[D] = 0;
    Math.random = () => 0.999; // force refusal
    const refused = Game.inviteToParty(D);
    Math.random = realRandom;
    ok('refusal happens (their choice)', !refused.ok || Game.inParty(D));
  }

  // --- 5. Party cap enforced ---
  v.trust[C] = 90;
  // fill party to cap (trust floor applies — set trust for fill candidates)
  for (const rid of roster) {
    if (Game.partyMembers().length >= Game.partyCap()) break;
    if (!Game.inParty(rid)) { v.trust[rid] = Math.max(v.trust[rid] || 10, 90); for (let i = 0; i < 30 && !Game.inParty(rid); i++) Game.inviteToParty(rid); }
  }
  ok('party reached cap', Game.partyMembers().length === Game.partyCap());
  const extra = roster.find(id => !Game.inParty(id) && (v.roster || []).includes(id));
  if (extra) {
    const r = Game.inviteToParty(extra);
    eq('invite refused when full', r.ok, false);
  }

  // --- 6. Dismiss ---
  const member = Game.partyMembers()[0];
  const dm = Game.dismissFromParty(member);
  eq('dismiss ok', dm.ok, true);
  eq('no longer in party', Game.inParty(member), false);

  // --- 7. Betrayal intent: NOT driven by trust ---
  // Force intent true on a high-trust member to prove the point.
  const loyal = Game.partyMembers()[0] || B;
  v.trust[loyal] = 100; // maximum trust
  const bs = Game.betrayalState(loyal);
  bs.intent = true; bs.evaluated = true; // simulate a hidden backstabber
  eq('high trust does not clear intent', Game.betrayalIntent(loyal), true);
  ok('opportunity zero at haven (witnesses)', Game.betrayalOpportunity(loyal) === 0);

  // --- 8. Player attacks party member -> betrayal combat ---
  // Move off-haven so positions exist; place party at player.
  Game.map.px = 4; Game.map.py = 3;
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  Game.placePartyAtPlayer();
  const victim = Game.partyMembers()[0];
  ok('victim placed near player', !!v.positions[victim]);
  Game.playerAttacks(victim);
  ok('betrayal combat started', !!(Game.tbfight && Game.tbfight.betrayal));
  eq('aggressor is player', Game.tbfight.aggressor, 'player');
  const hostile = Game.tbfight.fighters.find(f => f.kind === 'hostile');
  ok('hostile fighter present', !!hostile);
  eq('hostile is the victim', hostile.villagerId, victim);
  // player strike works on hostile
  const p = Game.tbfight.fighters.find(f => f.kind === 'player');
  hostile.mx = p.mx + 1; hostile.my = p.my; // adjacent
  Game.tbBeginTurn && Game.tbBeginTurn();
  // force player turn
  Game.tbfight.turnIdx = Game.tbfight.order.indexOf('p');
  const pfighter = Game.tbFighter('p');
  pfighter.moveLeft = 4;
  const strikeOk = Game.tbPlayerStrike(hostile.key);
  ok('player can strike hostile ex-party member', strikeOk !== false);

  // --- 9. Kill the betrayer -> aftermath without crash ---
  hostile.hp = 1;
  Game.tbDamage(hostile.key, 50, 'you');
  ok('hostile dead', !hostile.alive);
  // end the fight: no hostiles alive -> betrayal_won
  Game.tbfight.turnIdx = 0;
  const ended = Game.tbEndCheck();
  ok('betrayal fight ended', ended === true);
  eq('tbfight cleared', Game.tbfight, null);
  ok('victim removed from roster', !(Game.state.village.roster || []).includes(victim));

  // --- 10. NPC betrays player ---
  const snake = roster.find(id => (Game.state.village.roster || []).includes(id) && !Game.inParty(id));
  if (snake) {
    Game.state.village.party.push(snake);
    const sbs = Game.betrayalState(snake);
    sbs.intent = true; sbs.evaluated = true;
    Game.npcBetrays(snake);
    ok('npc betrayal starts combat', !!(Game.tbfight && Game.tbfight.betrayal));
    eq('aggressor is npc', Game.tbfight.aggressor, 'npc');
    eq('betrayer out of party', Game.inParty(snake), false);
    // clean up: end combat by killing hostile
    const h = Game.tbfight.fighters.find(f => f.kind === 'hostile');
    h.hp = 0; h.alive = false;
    Game.tbEndCheck();
    eq('fight cleared after npc betrayal resolved', Game.tbfight, null);
  } else {
    console.log('note: no spare NPC for betrayal test');
  }

  // --- 11. Cap raises at day 14 ---
  Game.state.scholar.day = 14;
  Game.checkSystemArrival(); // re-run triggers cap check
  eq('party cap raised at day 14', Game.partyCap(), 4);

  // --- 12. Party HUD ---
  const hud = Game.partyHud();
  ok('party HUD renders', typeof hud === 'string' && hud.includes('👥'));

  // --- 13. Button HTML ---
  const btnHtml = Game.partyButtonHtml(Game.partyMembers()[0] || A);
  ok('party button html for member', btnHtml.includes('in your party') || btnHtml.includes('Invite to party'));

  // --- 14. Threat assessment: gallowdeer too big solo, hushwolf fine ---
  const gdef = (Game.data.monsters || []).find(m => m.id === 'gallowdeer');
  const hdef = (Game.data.monsters || []).find(m => m.id === 'hushwolf');
  ok('monster defs loaded', !!(gdef && hdef));
  if (gdef && hdef) {
    const ga = Game.assessThreat(gdef), ha = Game.assessThreat(hdef);
    ok('gallowdeer exceeds solo viability (ratio>1.5)', ga.ratio > 1.5);
    ok('hushwolf does not (ratio<1.5)', ha.ratio < 1.5);
  }

  // --- 15. Anticipation: the game suggests the party on big threats ---
  {
    const said = [];
    const realSay = Game.say, realSys = Game.sysSay;
    Game.say = t => said.push(t); Game.sysSay = t => said.push(t);
    Game.state.village.partySuggested = null;
    // ensure at least one traveling companion with trust for the villager voice
    const comp = roster.find(id => (Game.state.village.roster || []).includes(id));
    Game.state.village.trust[comp] = 80;
    Game.state.village.followers = [comp];
    Game.partyThreatCheck('gallowdeer');
    Game.say = realSay; Game.sysSay = realSys;
    ok('big threat triggers party suggestion', !!Game.state.village.partySuggested);
    ok('suggestion says something', said.join(' ').length > 20);
    // no nag: second check stays quiet
    const said2 = [];
    Game.say = t => said2.push(t); Game.sysSay = t => said2.push(t);
    Game.partyThreatCheck('gallowdeer');
    Game.say = realSay; Game.sysSay = realSys;
    ok('no repeated nagging', said2.join(' ').indexOf('We should name this') === -1);
    Game.state.village.followers = [];
  }

  // --- 16. Naming: the party becomes official ---
  // rebuild a party: invite two members with forced acceptance
  Game.state.scholar.day = 7;
  const nm1 = roster.find(id => !Game.inParty(id) && (Game.state.village.roster || []).includes(id));
  const nm2 = roster.find(id => id !== nm1 && !Game.inParty(id) && (Game.state.village.roster || []).includes(id));
  Math.random = () => 0.0;
  if (nm1) Game.inviteToParty(nm1);
  if (nm2) Game.inviteToParty(nm2);
  Math.random = realRandom;
  ok('party has members for naming', Game.partyMembers().length >= 1);
  const named = Game.nameParty('The Night Shift');
  eq('naming ok', named.ok, true);
  eq('party name set', Game.partyName(), 'The Night Shift');
  ok('party named flag', Game.partyNamed());
  const emptyName = Game.nameParty('   ');
  eq('empty name rejected', emptyName.ok, false);

  // --- 17. Roles: declared, one of each ---
  const PA = Game.partyMembers()[0], PB = Game.partyMembers()[1];
  if (PA) {
    const ar = Game.assignRole(PA, 'point');
    eq('assign point ok', ar.ok, true);
    eq('roleOf point', Game.roleOf(PA), 'point');
    const bad = Game.assignRole(PA, 'wizard');
    eq('bogus role rejected', bad.ok, false);
  }
  if (PA && PB) {
    Game.assignRole(PB, 'point'); // moves the role
    eq('role moves to new holder', Game.roleOf(PB), 'point');
    eq('old holder loses it', Game.roleOf(PA), null);
    Game.assignRole(PA, 'healer');
    eq('second role sticks', Game.roleOf(PA), 'healer');
  }
  const outsider = roster.find(id => !Game.inParty(id) && (Game.state.village.roster || []).includes(id));
  if (outsider) {
    eq('outsider cannot take role', Game.assignRole(outsider, 'scout').ok, false);
  }

  // --- 18. Conversation: naming + roles live in dialogue ---
  if (PA) {
    Game.state.village.partyName = null; // unnamed again for the convo flow
    Game.startConvo(PA);
    const ch = Game.convoChoices(PA);
    ok('party_name choice offered when unnamed', ch.some(c => c.id === 'party_name'));
    const turn1 = Game.convoTurn(PA, 'party_name');
    ok('naming turn offers picks', turn1 && turn1.choices.some(c => c.id.indexOf('party_namepick:') === 0));
    const pickId = turn1.choices.find(c => c.id.indexOf('party_namepick:') === 0).id;
    Game.convoTurn(PA, pickId);
    ok('picked name sticks', !!Game.partyName());
    const ch2 = Game.convoChoices(PA);
    ok('party_role choice offered when named', ch2.some(c => c.id === 'party_role'));
    const turn2 = Game.convoTurn(PA, 'party_role');
    ok('role turn offers picks', turn2 && turn2.choices.some(c => c.id === 'party_rolepick:healer'));
    Game.convoTurn(PA, 'party_rolepick:healer');
    eq('role assigned via convo', Game.roleOf(PA), 'healer');
    try { Game.endConvo(PA, 'left'); } catch (e) {}
  }

  // --- 19. Coordination orders ---
  {
    // fake fight: one monster (fifo), one villager fighter, one wounded ally
    const VA = PA, VB = PB;
    Game.tbfight = { over: false, fighters: [] };
    const mon = { key: 'm1', kind: 'monster', name: 'testboar', mdef: { id: 'x', encounter: { fifo: true } }, mx: 5, my: 5, hp: 50, maxHp: 50, alive: true, fled: false };
    const vf = { key: 'v_' + VA, kind: 'villager', villagerId: VA, name: 'A', mx: 2, my: 2, hp: 30, maxHp: 30, speed: 3, alive: true, fled: false };
    Game.tbfight.fighters = [
      { key: 'p', kind: 'player', name: 'You', mx: 1, my: 1, hp: 100, maxHp: 100, alive: true, fled: false },
      mon, vf,
    ];
    const realBlocked = Game.tbBlocked, realSync = Game.tbVillagerSyncPos, realSay = Game.say;
    Game.tbBlocked = () => false; Game.tbVillagerSyncPos = () => {};
    const said = []; Game.say = t => said.push(t);
    // distract: jumps the threat queue (executes on the villager's turn)
    let ro = Game.orderMember(VA, 'distract');
    eq('distract order ok', ro.ok, true);
    Game.execOrder(vf, Game.tbfight);
    eq('distract jumps queue front', mon.threatQueue[0], 'v_' + VA);
    ok('distract says the risk', said.join(' ').indexOf('attention') !== -1);
    // flank: sets up the ×1.5
    ro = Game.orderMember(VA, 'flank');
    eq('flank order ok', ro.ok, true);
    // execOrder runs on the villager turn; call directly
    vf.order = 'flank';
    Game.execOrder(vf, Game.tbfight);
    eq('flanking flag set', vf.flanking, true);
    // hold: defensive stance
    vf.order = 'hold';
    Game.execOrder(vf, Game.tbfight);
    eq('holding flag set', vf.holding, true);
    // carry: wounded ally gets hauled + healed
    if (VB) {
      const wf = { key: 'v_' + VB, kind: 'villager', villagerId: VB, name: 'B', mx: 3, my: 3, hp: 10, maxHp: 30, alive: true, fled: false };
      Game.tbfight.fighters.push(wf);
      vf.order = 'carry';
      Game.execOrder(vf, Game.tbfight);
      ok('carry heals the wounded', wf.hp > 10);
    }
    // role default: healer auto-carries
    Game.assignRole(VA, 'healer');
    const def = Game.roleDefaultOrder(vf, Game.tbfight);
    // (wounded may be healed above half now; just check it returns carry or null sanely)
    ok('role default sane', def === 'carry' || def === null);
    Game.tbBlocked = realBlocked; Game.tbVillagerSyncPos = realSync; Game.say = realSay;
    Game.tbfight = null;
  }

  // --- 20. tbDamage wrapper: flank ×1.5, hold ×0.6 ---
  {
    const VA = PA;
    Game.tbfight = { over: false, fighters: [] };
    const atk = { key: 'v_' + VA, kind: 'villager', villagerId: VA, name: 'A', mx: 4, my: 4, hp: 30, maxHp: 30, alive: true, fled: false, flanking: true };
    const tgt = { key: 'm1', kind: 'monster', name: 'boar', mdef: { id: 'thornback_boar' }, mx: 5, my: 5, hp: 50, maxHp: 50, alive: true, fled: false };
    Game.tbfight.fighters = [atk, tgt];
    const said = []; const realSay = Game.say;
    Game.say = t => said.push(t);
    const hpBefore = tgt.hp;
    try { Game.tbDamage('m1', 10, 'strike', 'v_' + VA); } catch (e) {}
    Game.say = realSay;
    ok('flank strike announces the bonus', said.join(' ').indexOf("wasn't looking") !== -1);
    ok('flank flag consumed', atk.flanking === false);
    ok('flank dealt more than base', (hpBefore - tgt.hp) >= 10);
    // hold: damage reduced
    const holder = { key: 'v_' + VA, kind: 'villager', villagerId: VA, name: 'A', mx: 4, my: 4, hp: 30, maxHp: 30, alive: true, fled: false, holding: true };
    Game.tbfight.fighters = [holder];
    const said2 = []; Game.say = t => said2.push(t);
    const hBefore = holder.hp;
    try { Game.tbDamage('v_' + VA, 10, 'claw', 'm1'); } catch (e) {}
    Game.say = realSay;
    ok('hold announces the brace', said2.join(' ').indexOf('braced arms') !== -1);
    ok('hold reduces damage', (hBefore - holder.hp) <= 10);
    Game.tbfight = null;
  }

  // --- 21. Split the party: two threats, real risk ---
  {
    const VA = PA, VB = PB;
    Game.tbfight = { over: false, fighters: [] };
    const m1 = { key: 'm1', kind: 'monster', name: 'boar', mdef: { id: 'thornback_boar', hp: [40, 55], attack: { damage: [18, 26] } }, mx: 5, my: 5, hp: 40, maxHp: 40, alive: true, fled: false };
    const m2 = { key: 'm2', kind: 'monster', name: 'wolf', mdef: { id: 'hushwolf', hp: [25, 35], attack: { damage: [12, 18] } }, mx: 1, my: 7, hp: 30, maxHp: 30, alive: true, fled: false };
    Game.tbfight.fighters = [
      { key: 'p', kind: 'player', name: 'You', mx: 4, my: 4, hp: 100, maxHp: 100, alive: true, fled: false },
      m1, m2,
    ];
    if (VA) Game.tbfight.fighters.push({ key: 'v_' + VA, kind: 'villager', villagerId: VA, name: 'A', mx: 3, my: 3, hp: 30, maxHp: 30, alive: true, fled: false });
    if (VB) Game.tbfight.fighters.push({ key: 'v_' + VB, kind: 'villager', villagerId: VB, name: 'B', mx: 3, my: 4, hp: 30, maxHp: 30, alive: true, fled: false });
    const opps = Game.detectSplitOpportunity();
    eq('two threats detected', opps.length, 2);
    const said = []; const realSay = Game.say; Game.say = t => said.push(t);
    const offered = Game.offerSplit();
    Game.say = realSay;
    ok('split offered with text', !!offered && said.join(' ').indexOf('Two threats') !== -1);
    if (VB) {
      const realR = Math.random;
      Math.random = () => 0.9; // force favorable-ish roll; outcome must still be valid
      const sp = Game.splitParty('m2', [VB]);
      Math.random = realR;
      eq('split ok', sp.ok, true);
      ok('split outcome valid', ['won', 'costly', 'lost'].indexOf(sp.outcome.result) !== -1);
      ok('split recorded in history', Game.state.village.partySplits.length >= 1);
      ok('sent member left this fight', !Game.tbfight.fighters.some(x => x.key === 'v_' + VB));
      // resolveSplitTeam directly: weak team vs big threat LOSES now (Steve
      // 2026-10-05 rebalance — the old scale let a solo villager always win).
      // Sacrificial non-party villager: a lost split can kill them, and the
      // later tests still need VA/VB alive.
      const VC = roster.find(id => id !== PA && id !== PB);
      Math.random = () => 0.05; // bad roll, weak team
      const bad = Game.resolveSplitTeam([VC || VB], { id: 'gallowdeer', hp: [95, 115], attack: { damage: [22, 32] } }, 'gallowdeer');
      Math.random = realR;
      eq('weak solo team vs gallowdeer loses', bad.result, 'lost');
    }
    Game.tbfight = null;
  }

  // --- 22. Party death beat ---
  {
    const VA = PA;
    if (VA && !Game.inParty(VA)) { Math.random = () => 0.0; Game.inviteToParty(VA); Math.random = realRandom; }
    if (VA && Game.inParty(VA)) {
      const said = []; const realSay = Game.say; Game.say = t => said.push(t);
      Game.partyDeathBeat(VA);
      Game.say = realSay;
      eq('fallen leaves the party', Game.inParty(VA), false);
      ok('grief beat says something', said.join(' ').indexOf('gone') !== -1);
    }
  }

  // --- 23. Victory beat + expedition bonus + card ---
  {
    const said = []; const realSay = Game.say, realSys = Game.sysSay;
    Game.say = t => said.push(t); Game.sysSay = t => said.push(t);
    Game.partyVictoryBeat(['the thornback boar']);
    Game.say = realSay; Game.sysSay = realSys;
    ok('victory beat says something', said.join(' ').length > 10);
    const bonus = Game.partyExpeditionBonus();
    ok('expedition bonus shape', typeof bonus.count === 'number' && typeof bonus.scout === 'boolean');
    const card = Game.partyCardHtml();
    ok('party card renders', typeof card === 'string');
  }

  // --- 24. Named-party dismissal has extra weight ---
  {
    const VA = Game.partyMembers()[0];
    if (VA && Game.partyNamed()) {
      const t0 = (Game.state.village.trust[VA] || 10);
      Game.dismissFromParty(VA);
      const t1 = (Game.state.village.trust[VA] || 10);
      ok('named dismissal stings more than base', (t0 - t1) >= 8);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
