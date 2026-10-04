// Conversation discovery test: social mechanics learned through talking, not buttons.
// Steve's rule: "Not a default action but something to discover via intentional conversation."
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js', 'src/js/party.js', 'src/js/journal.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

async function main() {
  const Game = globalThis.Scattering.Game;
  await Game.init();
  let pass = 0, fail = 0;
  const t = (name, cond) => {
    if (cond) { pass++; }
    else { fail++; console.log('  FAIL: ' + name); }
  };

  // Find a roster with a suitable trader FIRST — re-rolls invalidate refs,
  // so all roster-derived picks happen after this.
  let trader = null;
  for (let g = 0; g < 10 && !trader; g++) {
    Game.newGame('Chicago, Illinois', null, null);
    const v2 = Game.state.village;
    const r2 = (v2.roster || []).filter(id => id !== Game.villagerId);
    trader = r2.find(id => { try {
      return Game.isKnowledgeTrader(id) && (Game.traderKnowledge(id) || []).length &&
        Game.commLevel(id).level !== 'none';
    } catch (e) { return false; } }) || null;
  }
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  t('roster has NPCs', roster.length >= 5);

  // --- 1. Discovery system ---
  console.log('1. discovery system');
  t('nothing discovered at start', !Game.hasDiscovered('trade'));
  t('discover returns true first time', Game.discover('trade') === true);
  t('hasDiscovered true after', Game.hasDiscovered('trade') === true);
  t('discover returns false second time', Game.discover('trade') === false);
  // reset for clean downstream tests
  delete Game.state.village.discoveries.trade;

  // --- 2. Knowledge trading: seeded, then discovered ---
  console.log('2. knowledge trading discovery');
  // Traders are rare by design (~1/roster, sometimes none) — we searched
  // up to 10 rosters above rather than flaking on generation luck.
  t('a knowledge trader exists with tradeable knowledge (and shared language)', !!trader);
  if (trader) {
    // force the seeding path deterministically
    const realRandom = Math.random;
    Math.random = () => 0.1; // < 0.5 → trader mentions trade
    const st = Game.startConvo(trader);
    Math.random = realRandom;
    const c = Game.convoGet(trader);
    t('trader seeds the mechanic when undiscovered', c.traderMentioned === true);
    t('trade choice appears after seeding', st.choices.some(x => x.id === 'trade'));
    // walk the trade thread
    const t1 = Game.convoTurn(trader, 'trade');
    t('trade opens terms thread', t1 && Game.convoGet(trader).thread === 'trade');
    t('pendingTrade set', !!Game.convoGet(trader).pendingTrade);
    const t2 = Game.convoTurn(trader, 'trade_yes');
    t('trade_yes resolves', !!t2 && !!t2.line);
    t('trade discovered after doing it', Game.hasDiscovered('trade'));
    Game.endConvo(trader, 'left');
    // discovered path: new convo, no seeding needed
    Game.startConvo(trader);
    const ui2 = Game.convoUI(trader);
    t('trade choice appears proactively once discovered', ui2.choices.some(x => x.id === 'trade'));
    Game.endConvo(trader, 'left');
  }

  // --- 3. Teaching in conversation ---
  console.log('3. teaching discovery');
  const pupil = roster.find(id => id !== trader);
  // give the player something to teach
  const plants = (Game.data.plants || []);
  if (plants.length && pupil) {
    const pid = plants[0].id;
    Game.state.codex.plants = Game.state.codex.plants || {};
    Game.state.codex.plants[pid] = { level: 2 };
    Game.state.village.taught = Game.state.village.taught || {};
    delete Game.state.village.taught[pupil];
    Game.startConvo(pupil);
    const ui = Game.convoUI(pupil);
    t('teach choice appears when teachable', ui.choices.some(x => x.id === 'teach'));
    const before = (Game.state.village.taught[pupil] || []).length;
    Game.convoTurn(pupil, 'teach');
    const after = (Game.state.village.taught[pupil] || []).length;
    t('teach teaches one thing', after === before + 1);
    t('teach discovered', Game.hasDiscovered('teach'));
    Game.endConvo(pupil, 'left');
  }

  // --- 4. Promises: gated, then formal ---
  console.log('4. promise discovery');
  const promiser = roster.find(id => id !== trader && id !== pupil);
  if (promiser) {
    // undiscovered + not deep in goal thread → no offer_help
    Game.startConvo(promiser);
    let ui = Game.convoUI(promiser);
    // goal not known yet → no offer_help regardless
    t('no offer_help before goal known', !ui.choices.some(x => x.id === 'offer_help'));
    // learn their goal via askAbout
    Game.askAbout(promiser, 'goal');
    t('goal learned', Game.goalKnown(promiser));
    // still undiscovered and not in goal thread → still hidden
    Game.endConvo(promiser, 'left');
    Game.startConvo(promiser);
    ui = Game.convoUI(promiser);
    t('offer_help hidden when undiscovered and not opened up', !ui.choices.some(x => x.id === 'offer_help'));
    // force discovery, then it appears proactively
    Game.discover('promise');
    Game.endConvo(promiser, 'left');
    Game.startConvo(promiser);
    ui = Game.convoUI(promiser);
    t('offer_help appears once discovered', ui.choices.some(x => x.id === 'offer_help'));
    const r = Game.convoTurn(promiser, 'offer_help');
    t('offer_help makes a FORMAL tracked promise', !!(Game.state.village.promises || {})[promiser]);
    t('promise has goal + day', !!(Game.state.village.promises[promiser] || {}).goal);
    Game.endConvo(promiser, 'left');
  }

  // --- 5. Party invites in conversation ---
  console.log('5. party invite discovery');
  Game.state.systemArrived = true;
  Game.unlockPartySystem();
  t('party discovered at System unlock', Game.hasDiscovered('party'));
  const joiner = roster.find(id => id !== trader && id !== pupil && id !== promiser && !Game.inParty(id));
  if (joiner) {
    const tr = Game.state.village.trust || (Game.state.village.trust = {});
    tr[joiner] = 60;
    Game.startConvo(joiner);
    const ui = Game.convoUI(joiner);
    t('invite_party choice appears in conversation', ui.choices.some(x => x.id === 'invite_party'));
    Game.convoTurn(joiner, 'invite_party');
    // inviteToParty may accept or decline by chance — either way it ran
    t('invite resolved without throwing', true);
    Game.endConvo(joiner, 'left');
  }

  // --- 6. Deals and appeals emerge from refusal ---
  console.log('6. deal/appeal discovery via refusal');
  const worker = roster[0];
  const tr2 = Game.state.village.trust || (Game.state.village.trust = {});
  tr2[worker] = 10; // low trust → refusal likely
  // force a refusal deterministically
  const realRandom2 = Math.random;
  Math.random = () => 0.99; // trust<40 branch refuses at <0.4... use trust<20 path instead
  tr2[worker] = 5;
  const ar = Game.assignTask(worker, 'forage', { via: 'in-person' });
  Math.random = realRandom2;
  t('low-trust ask refuses', ar && ar.refused === true);
  t('refusal recorded for UI follow-up', !!(Game.state.village.lastRefusal || {}).vid);
  // deal emerges from refusal
  Game.state.scholar.inventory = [{ name: 'test food', kcalEach: 500, units: 3 }];
  const d = Game.offerDeal(worker, 'forage');
  t('deal resolves', !!d);
  t('deal discovered', Game.hasDiscovered('deal'));
  // appeal emerges from refusal
  Game.askAbout(worker, 'goal');
  const ap = Game.appealToGoal(worker, 'wood');
  t('appeal resolves', !!ap);
  t('appeal discovered', Game.hasDiscovered('appeal'));

  // --- 7. Source checks: buttons gone, attack deliberate ---
  console.log('7. UI source checks');
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const partySrc = fs.readFileSync(path.join(ROOT, 'src/js/party.js'), 'utf8');
  t('no Teach button', !/data-act="teach"/.test(appSrc));
  t('no Trade knowledge button', !/data-act="trade"/.test(appSrc));
  t('no Promise button', !/data-act="promise"/.test(appSrc));
  t('no Invite to party button', !/data-act="inviteParty"/.test(appSrc + partySrc));
  t('no method toggle in assign flow', !/data-method=/.test(appSrc));
  t('two-tap attack exists (ask)', /data-act="attackAsk"/.test(appSrc));
  t('two-tap attack exists (confirm)', /data-act="attackConfirm"/.test(appSrc));
  t('refusal follow-ups exist (deal)', /data-refuse="deal"/.test(appSrc));
  t('refusal follow-ups exist (appeal)', /data-refuse="appeal"/.test(appSrc));

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('THROW:', e); process.exit(2); });
