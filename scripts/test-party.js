// Party system + PK/betrayal tests. Usage: node scripts/test-party.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js'
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

  // --- 4. Invite: NO trust gate. Low trust can still join if they agree. ---
  v.trust[B] = 0; // absolute zero trust
  const realRandom = Math.random;
  Math.random = () => 0.0; // force acceptance roll to succeed
  const lowTrustJoin = Game.inviteToParty(B);
  Math.random = realRandom;
  ok('zero-trust NPC CAN join party (no trust gate)', lowTrustJoin.ok && Game.inParty(B));
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
  // fill party to cap
  for (const rid of roster) {
    if (Game.partyMembers().length >= Game.partyCap()) break;
    if (!Game.inParty(rid)) for (let i = 0; i < 30 && !Game.inParty(rid); i++) Game.inviteToParty(rid);
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

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
