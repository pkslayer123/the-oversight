// Conversation pacing tests: hesitation + graduated costs.
// Usage: node scripts/test-conversation-pacing.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/convo-mood.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js'
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
function inRange(name, v, lo, hi) {
  ok(`${name} in [${lo},${hi}] (got ${v})`, v >= lo && v <= hi);
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  ok('roster has NPCs', roster.length >= 3);
  const A = roster[0];

  // --- 1. Hesitation bounds ---
  for (let i = 0; i < 50; i++) {
    const ms = Game.convoHesitationMs(A, 'ask:goal', false);
    inRange('hesitation bounded', ms, 200, 950);
  }
  // personality variance: find a bold/intense/restless NPC and a cautious/withdrawn/steady one
  const temps = {};
  for (const id of roster) { const t = Game.npcTemper(id); (temps[t] = temps[t] || []).push(id); }
  const fastId = (temps.bold || temps.intense || temps.restless || [])[0];
  const slowId = (temps.cautious || temps.withdrawn || temps.steady || [])[0];
  if (fastId && slowId) {
    let fastSum = 0, slowSum = 0;
    for (let i = 0; i < 30; i++) {
      fastSum += Game.convoHesitationMs(fastId, 'agree', false);
      slowSum += Game.convoHesitationMs(slowId, 'agree', false);
    }
    ok('impulsive temperaments hesitate less on average', fastSum < slowSum);
  } else {
    console.log('(skip temperament comparison: roster lacks both fast and slow temperaments)');
    pass++;
  }
  // deep beats hesitate longer than small talk, same person
  let deepSum = 0, lightSum = 0;
  for (let i = 0; i < 30; i++) {
    deepSum += Game.convoHesitationMs(A, 'theorize', false);
    lightSum += Game.convoHesitationMs(A, 'agree', false);
  }
  ok('deep beats hesitate longer than small talk', deepSum > lightSum);
  // opening is quicker than a mid-convo turn
  let openSum = 0, turnSum = 0;
  for (let i = 0; i < 30; i++) {
    openSum += Game.convoHesitationMs(A, null, true);
    turnSum += Game.convoHesitationMs(A, 'agree', false);
  }
  ok('openings hesitate less than turns', openSum < turnSum);

  // --- 2. Graduated costs ---
  const kcal0 = Game.state.scholar.kcal || 0;
  const ticks0 = Game.state.scholar.dayTicks || 0;
  const st = Game.startConvo(A);
  ok('startConvo returns state', !!st);
  const kcal1 = Game.state.scholar.kcal || 0;
  const ticks1 = Game.state.scholar.dayTicks || 0;
  eq('open conversation costs 1 tick', ticks1 - ticks0, 1);
  eq('open conversation costs 10 kcal', kcal0 - kcal1, 10);

  // find a deep choice and a light choice from the real choice list
  const choices = Game.convoChoices(A).map(c => c.id);
  const deepId = choices.find(id => /^(ask:|theorize|more)/.test(id));
  const lightId = choices.find(id => /^(agree|joke|silence)$/.test(id));
  ok('has a deep choice to test', !!deepId);
  // light choices (agree/joke/silence) only appear when choice slots are free

  if (deepId) {
    // theorize carries its own 2-tick "real thinking" cost; plain topic asks are 1.
    const want = deepId === 'theorize' ? 3 : 1;
    const t0 = Game.state.scholar.dayTicks || 0;
    Game.convoTurn(A, deepId);
    const t1 = Game.state.scholar.dayTicks || 0;
    eq(`deep beat '${deepId}' costs ${want} tick(s)`, t1 - t0, want);
  }
  if (lightId) {
    const t0 = Game.state.scholar.dayTicks || 0;
    const k0 = Game.state.scholar.kcal || 0;
    Game.convoTurn(A, lightId);
    const t1 = Game.state.scholar.dayTicks || 0;
    const k1 = Game.state.scholar.kcal || 0;
    eq('small talk costs 0 ticks', t1 - t0, 0);
    eq('small talk costs 0 kcal', k0 - k1, 0);
  }

  // --- 3. Full-conversation affordability ---
  // Fresh NPC, simulate a 6-exchange deep conversation; total should be small.
  const B = roster[1];
  const kcalB0 = Game.state.scholar.kcal || 0;
  const ticksB0 = Game.state.scholar.dayTicks || 0;
  Game.startConvo(B);
  let guard = 0;
  while (guard++ < 6) {
    const ch = Game.convoChoices(B).map(c => c.id);
    const pick = ch.find(id => /^(ask:|theorize|more)/.test(id)) || ch.find(id => /^(agree|joke|silence)$/.test(id)) || 'leave';
    const r = Game.convoTurn(B, pick);
    if (!r || r.ended) break;
  }
  const ticksUsed = (Game.state.scholar.dayTicks || 0) - ticksB0;
  const kcalUsed = kcalB0 - (Game.state.scholar.kcal || 0);
  ok(`6-exchange conversation is affordable (ticks=${ticksUsed}, kcal=${kcalUsed})`, ticksUsed <= 8 && kcalUsed <= 15);
  ok('conversation does not eat a day-part (128 ticks)', ticksUsed < 128);

  // --- 4. Game state unaffected by hesitation (UI-only) ---
  // convoTurn still advances transcript/exchanges immediately.
  const C = roster[2];
  Game.startConvo(C);
  const c0 = Game.convoGet(C);
  const ex0 = c0.exchanges;
  const chC = Game.convoChoices(C).map(c => c.id);
  const pickC = chC.find(id => /^(ask:|theorize)/.test(id)) || 'agree';
  Game.convoTurn(C, pickC);
  eq('exchanges advance immediately (hesitation is UI-only)', Game.convoGet(C).exchanges, ex0 + 1);
  ok('transcript has the new response immediately', (Game.convoGet(C).transcript || []).length > 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
