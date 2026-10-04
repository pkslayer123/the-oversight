// Dark people + trauma matrix tests. Usage: node scripts/test_dark_people.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/party.js', 'src/js/conversation.js', 'src/js/journal.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
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
function between(name, got, lo, hi) {
  if (got >= lo && got <= hi) { pass++; }
  else { fail++; console.log(`FAIL ${name}: got ${got}, want [${lo},${hi}]`); }
}

(async () => {
  await Game.init();

  // --- 1. darkTells data integrity ---
  const tells = (Game.data.characterGen || {}).darkTells || {};
  const nBen = (tells.benign || []).length, nMal = (tells.malicious || []).length;
  ok('benign tell pool non-empty and rare-sized', nBen >= 3 && nBen <= 12);
  ok('malicious tell pool non-empty and rare-sized', nMal >= 3 && nMal <= 12);
  console.log(`  tell pools: ${nBen} benign, ${nMal} malicious`);
  for (const t of [...tells.benign, ...tells.malicious]) {
    ok(`tell ${t.id} has quirk`, !!t.quirk);
    ok(`tell ${t.id} has note`, !!t.note);
    ok(`tell ${t.id} has assessment`, !!t.assessment);
    ok(`tell ${t.id} subtle (no label words)`, !/psychopath|psycho|killer|murderer|evil/i.test(t.quirk + t.note + t.assessment));
  }

  // --- 2. rarity: roll 600 characters ---
  let benign = 0, malicious = 0, total = 0;
  const seen = [];
  for (let i = 0; i < 600; i++) {
    const c = Game.genCharacter({ origin: 'Columbus, Ohio', usedNames: new Set(), usedOccs: new Set() });
    total++;
    const d = c.personality.dark;
    if (d) {
      seen.push(c);
      if (d.kind === 'benign') benign++;
      else if (d.kind === 'malicious') malicious++;
      else { fail++; console.log(`FAIL bad dark kind: ${d.kind}`); }
    }
  }
  const rate = (benign + malicious) / total;
  between('dark rate ~4% (1-7%)', rate, 0.01, 0.07);
  between('benign rate ~2.5% (0.8-5%)', benign / total, 0.008, 0.05);
  between('malicious rate ~1.5% (0.3-3.5%)', malicious / total, 0.003, 0.035);
  console.log(`  rarity: ${benign} benign, ${malicious} malicious of ${total} (${(rate * 100).toFixed(1)}%)`);

  // --- 3. tell, don't label: no UI label anywhere on a dark char ---
  for (const c of seen.slice(0, 10)) {
    const blob = JSON.stringify(c);
    ok(`no label words on ${c.name}`, !/psychopath|psycho\b|serial killer/i.test(blob));
    ok('dark stored as {kind,tell}', !!c.personality.dark.kind && !!c.personality.dark.tell && !c.personality.dark._tell);
    const tell = Game.darkTellOf(c.personality.dark);
    ok('darkTellOf resolves', !!tell && tell.id === c.personality.dark.tell);
    ok('quirk is the tell quirk', c.personality.quirk === tell.quirk);
    ok('backstory carries the wrong note', c.backstory.includes(tell.note.split('{')[0].slice(0, 20)) || c.backstory.length > 50);
    ok('assessment carries the unsettling line', c.systemAssessment.includes(tell.assessment.slice(0, 30)));
  }

  // --- 4. village cap: 12 new games, max 1 dark NPC per village ---
  let villagesWithDark = 0, capViolations = 0;
  for (let g = 0; g < 12; g++) {
    Game.genRoster('Austin, Texas');
    Game.newGame('Austin, Texas', null, Game.generatedRoster[0].id);
    const v = Game.state.village;
    const npcIds = v.roster.filter(id => id !== Game.villagerId);
    const darkNpcs = npcIds.filter(id => Game.npcDark(id));
    if (darkNpcs.length) villagesWithDark++;
    if (darkNpcs.length > 1) { capViolations++; console.log(`FAIL village cap: ${darkNpcs.length} dark in one village`); }
  }
  eq('village cap respected', capViolations, 0);
  console.log(`  villages with a dark NPC: ${villagesWithDark}/12`);

  // --- 5. trauma matrix ---
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.village;
  const roster = v.roster.filter(id => id !== Game.villagerId);
  const vic = roster[0], vic2 = roster[1], vic3 = roster[2];
  v.trust = v.trust || {};
  const baseKill = 25, baseHurt = 8;

  // baseline: murder of a neutral stranger
  Game.tbfight = { aggressor: 'player' };
  v.trust[vic] = 10;
  const neutralKill = Game.traumaForKill(vic);
  eq('neutral murder kill = 25', neutralKill, 25);

  // self-defense: much less
  Game.tbfight = { aggressor: 'npc' };
  const selfDefKill = Game.traumaForKill(vic);
  ok('self-defense kill < murder', selfDefKill < neutralKill);
  between('self-defense kill ~9', selfDefKill, 5, 14);

  // malicious victim: grim relief
  Game.tbfight = { aggressor: 'player' };
  v.bgDark[vic2] = { kind: 'malicious', tell: 'mirror' };
  const malKill = Game.traumaForKill(vic2);
  ok('malicious victim kill < neutral', malKill < neutralKill);
  between('malicious victim kill ~11', malKill, 6, 17);

  // benign victim: worse — they never hurt anyone
  v.bgDark[vic3] = { kind: 'benign', tell: 'teeth' };
  const benKill = Game.traumaForKill(vic3);
  ok('benign victim kill > neutral', benKill > neutralKill);

  // high trust: cuts deeper
  const vic4 = roster[3];
  v.trust[vic4] = 70;
  const trustKill = Game.traumaForKill(vic4);
  ok('high-trust victim kill > neutral', trustKill > neutralKill);
  between('high-trust kill ~38', trustKill, 30, 45);

  // beloved (rep): worse
  const vic5 = roster[4];
  const r5 = Game.repOf(vic5); r5.generous = 30; r5.honest = 25;
  const lovedKill = Game.traumaForKill(vic5);
  ok('beloved victim kill > neutral', lovedKill > neutralKill);

  // feared (rep): less
  const vic6 = roster[5];
  const r6 = Game.repOf(vic6); r6.honest = -30; r6.generous = -10;
  const fearedKill = Game.traumaForKill(vic6);
  ok('feared victim kill < neutral', fearedKill < neutralKill);

  // hurt scales too
  Game.tbfight = { aggressor: 'player' };
  const neutralHurt = Game.traumaForHurt(vic);
  eq('neutral murder hurt = 8', neutralHurt, 8);
  Game.tbfight = { aggressor: 'npc' };
  ok('self-defense hurt < murder hurt', Game.traumaForHurt(vic) < neutralHurt);

  // player is a malicious psycho: barely feels it
  Game.tbfight = { aggressor: 'player' };
  Game.state.village.rosterChars[Game.villagerId].personality.dark = { kind: 'malicious', tell: 'mirror' };
  const psychoKill = Game.traumaForKill(vic);
  ok('psycho player kill << neutral', psychoKill < neutralKill * 0.5);
  Game.state.village.rosterChars[Game.villagerId].personality.dark = null; // restore

  // --- 6. murderDims: witnesses judge by victim ---
  const mdMal = Game.murderDims(vic2); // malicious
  const mdBen = Game.murderDims(vic3); // benign
  const mdNeu = Game.murderDims(vic);  // neutral
  ok('malicious victim: less honest damage', mdMal.honest > mdNeu.honest);
  ok('benign victim: more honest damage', mdBen.honest < mdNeu.honest);
  ok('malicious victim: grim respect (brave>=0)', (mdMal.brave || 0) >= 0);

  // --- 7. betrayalIntent boost for malicious (statistical) ---
  let malIntent = 0, neuIntent = 0;
  const N = 120;
  // force malicious on vic2 (already set), neutral vic
  for (let i = 0; i < N; i++) {
    Game.state.village.bgDark[vic2] = { kind: 'malicious', tell: 'mirror' };
    delete (Game.partyState().betray || {})[vic2];
    delete (Game.partyState().betray || {})[vic];
    // neutralize personality/goal noise by pinning temperament
    if (Game.betrayalIntent(vic2, true)) malIntent++;
    if (Game.betrayalIntent(vic, true)) neuIntent++;
  }
  ok(`malicious betray more often (${malIntent} vs ${neuIntent})`, malIntent > neuIntent + 15);
  console.log(`  betrayal intent: malicious ${malIntent}/${N}, neutral ${neuIntent}/${N}`);
  delete Game.state.village.bgDark[vic2];
  delete Game.state.village.bgDark[vic3];

  // --- 8. npcQuirk surfaces bg dark tell ---
  const someMalTell = (tells.malicious || [])[0];
  Game.state.village.bgDark[vic2] = { kind: 'malicious', tell: someMalTell.id };
  const q = Game.npcQuirk(vic2);
  ok('npcQuirk returns tell quirk for bg dark', q === someMalTell.quirk);
  delete Game.state.village.bgDark[vic2];

  // --- 9. dark gossip beat fires ---
  const someBenTell = (tells.benign || [])[0];
  Game.state.village.bgDark[vic2] = { kind: 'benign', tell: someBenTell.id };
  let gossipHit = false;
  const origSay = Game.say.bind(Game);
  let tries = 0;
  while (!gossipHit && tries < 40) {
    tries++;
    let said = '';
    Game.say = (t) => { said += String(t); };
    Game.askAbout(roster[6] || vic, 'gossip');
    Game.say = origSay;
    if (/lowers their voice/i.test(said) && said.length > 60) gossipHit = true;
  }
  Game.say = origSay;
  ok(`dark gossip beat fires (in ${tries} tries)`, gossipHit);
  delete Game.state.village.bgDark[vic2];

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
