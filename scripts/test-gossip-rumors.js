// Gossip rumor regression tests (playtest loop, socialite 2026-10-05).
// Bug: ask:gossip misattributed NPC-rumors ({who} dims) to the player —
// "Word is you're doing right by people" for a rumor about someone else.
// Also: 'departure' gossip seeded with zero hearers could never spread.
// Usage: node scripts/test-gossip-rumors.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
  await Game.init();
  const said = [];
  const gSay = Game.say.bind(Game);
  Game.say = (m) => { said.push(String(m)); return gSay(m); };

  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  const [subj, hearer, other] = roster;

  // ask "heard anything?" up to N times; the npcGossipAbout (50%) and
  // darkGossip (45%) branches may preempt the rumor-mill branch.
  function askUntil(vid, want, tries) {
    for (let i = 0; i < (tries || 40); i++) {
      said.length = 0;
      const r = Game.askAbout(vid, 'gossip');
      if (r && want(r, said.join(' '))) return { r, text: said.join(' ') };
    }
    return null;
  }

  // === 1. NPC rumor is attributed to the NPC, never to the player ===
  Game.seedGossip('stingy', { who: subj }, [hearer]);
  const hit1 = askUntil(hearer, (r) => r.gossip && r.aboutOther === subj);
  ok('rumor: stingy rumor surfaces with aboutOther set', !!hit1, hit1 ? '' : 'never surfaced');
  ok('rumor: line names the subject, not "you"', !!hit1 && !/you're doing right by people|About you/i.test(hit1.text),
    hit1 ? hit1.text.slice(0, 120) : '');
  ok('rumor: line mentions holding back', !!hit1 && /holding back/i.test(hit1.text),
    hit1 ? hit1.text.slice(0, 120) : '');

  // === 2. generous rumor gets its own line ===
  Game.seedGossip('generous', { who: other }, [hearer]);
  const hit2 = askUntil(hearer, (r) => r.gossip && r.aboutOther === other);
  ok('rumor: generous rumor surfaces about the right villager', !!hit2);
  ok('rumor: generous line is not player-praise', !!hit2 && !/you're doing right/i.test(hit2.text),
    hit2 ? hit2.text.slice(0, 120) : '');

  // === 3. departure gossip can spread (previously seeded with 0 hearers) ===
  // (checked before any player scandal exists — a live scandal about you
  // rightly jumps the queue ahead of third-party rumors)
  Game.seedGossip('departure', { who: subj }, [hearer, other]);
  const dep = v.gossip[v.gossip.length - 1];
  // spread is probabilistic per part — wait for it like a player would
  for (let i = 0; i < 30 && dep.heard.length <= 2; i++) Game.spreadGossip();
  ok('departure: spreads beyond initial hearers', dep.heard.length > 2, `heard=${dep.heard.length}`);
  const hit4 = askUntil(dep.heard[dep.heard.length - 1], (r) => r.gossip && r.aboutOther === subj && r.gossip.action === 'departure');
  ok('departure: rumor surfaces with walked-away line', !!hit4 && /walked away/i.test(hit4.text),
    hit4 ? hit4.text.slice(0, 140) : '');

  // === 4. player scandal still surfaces as the warning, jumps the queue ===
  // hearer now knows: stingy(subj), generous(other), departure(subj).
  // Seed an OLDER-dated player scandal and a FRESHER player praise;
  // scandal must win.
  Game.seedGossip('stole_food', { honest: -12, generous: -10 }, [hearer]);
  const scandal = v.gossip[v.gossip.length - 1];
  scandal.day = (Game.state.scholar.day || 1) - 1; // older than the rumors
  Game.seedGossip('gave_food', { kind: 10, generous: 8 }, [hearer]); // freshest, positive
  const hit3 = askUntil(hearer, (r) => r.gossip && !r.aboutOther && !r.none);
  ok('scandal: player gossip surfaces (not crowded out by rumors)', !!hit3);
  ok('scandal: negative-about-you jumps the queue over fresher praise',
    !!hit3 && hit3.r.gossip === scandal, hit3 ? 'got action=' + hit3.r.gossip.action : '');
  ok('scandal: warning line fires', !!hit3 && /saying things\. About you/i.test(hit3.text),
    hit3 ? hit3.text.slice(0, 120) : '');

  // === 5. no NaN rep pollution from {who} dims through spread ===
  let nanFound = false;
  for (const id of roster) {
    const rep = Game.repOf(id);
    for (const k of Object.keys(rep)) if (typeof rep[k] === 'number' && isNaN(rep[k])) nanFound = true;
  }
  ok('rumors: no NaN in any rep vector after spread', !nanFound);

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
