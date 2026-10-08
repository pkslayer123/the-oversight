#!/usr/bin/env node
// PROOF: flee-a-betrayal truth (brawler adversarial loop 2026-10-08).
//
// BEFORE (pristine HEAD): when the PLAYER fled a betrayal fight they started
// (p.fled + tbEnd('fled') via the tbEndCheck wrapper, or door/barrier flee),
// the aftermath narrated the VICTIM fleeing:
//   - shared 'fled' path said "You escape. The thicket keeps its secrets."
//     (monster fiction for a person fight),
//   - no-witness aftermath said "X ran. No one saw it happen — but THEY did.
//     They're out there now, and they know exactly what you did.",
//   - the journal confessed "I beat them until they ran" — a lie: the player
//     ran, the victim stayed in the village.
// AFTER: the player's flight is carried on f.playerFled into the aftermath,
//   which narrates YOU running, the journal tells it straight, and the
//   thicket line is swapped for person-fight fiction. The betrayer-fled path
//   ('betrayal_routed') is untouched.
// Usage: node scripts/test-brawler-flee-truth-20261008.js
//        TEST_ROOT=/tmp/pristine node scripts/test-brawler-flee-truth-20261008.js
//        (SEED env override; deterministic default)
const fs = require('fs');
const path = require('path');
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261008', 10);
Math.random = mulberry32(SEED); // BEFORE eval: modules capture Math.random at load
const ROOT = process.env.TEST_ROOT || path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
// Full production module list in index.html order (AGENTS.md: never a short list).
const { execSync } = require('child_process');
const order = execSync("grep -o 'src/js/[^\"'\"'\"']*\\.js' index.html | head -80", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); } });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
const clearSays = () => says.splice(0);
const journalNotes = () => {
  const notes = ((Game.state.codex || {}).notes || []).map(n => n.text || '');
  const fromSays = says.filter(s => /^📓/.test(s)).map(s => s.replace(/^📓 (Journal|Codex): /, ''));
  return notes.concat(fromSays);
};
async function freshGame() {
  await Game.init();
  Game.genRoster('Fleer');
  Game.newGame('Fleer', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.tickAction = () => {};
  const s = Game.state.scholar; s.kcal = 9000; s.hydration = 100; s.health = 100;
  Game.state.systemArrived = false;
  clearSays();
}
const others = () => Game.state.village.roster.filter(id => id !== Game.villagerId);

(async () => {
  console.log('--- 1. player flees a betrayal fight they started (no witnesses) ---');
  await freshGame();
  const victim = others()[0];
  Game.playerAttacks(victim);
  check('1.0 betrayal fight started', !!Game.tbfight && Game.tbfight.betrayal);
  clearSays();
  const p = Game.tbFighter('p');
  p.fled = true; // the player's flight (door/barrier set this the same way)
  try { Game.tbEndCheck(); } catch (e) { check('1.x tbEndCheck threw', false, e.message); }
  check('1.1 fight closed', !Game.tbfight);
  const text = says.join(' || ');
  check('1.2 no monster-fiction thicket line', !/thicket keeps its secrets/.test(text), text.slice(0, 200));
  check('1.3 person-fight flight line present', /You run\. The fight/.test(text), text.slice(0, 300));
  check('1.4 does NOT claim the victim ran', !/No one saw it happen/.test(text), text.slice(0, 300));
  check('1.5 journal does NOT lie about beating them', !journalNotes().some(j => /beat them until they ran/.test(j)),
    journalNotes().join(' // ').slice(0, 200));
  check('1.6 journal tells the flight straight', journalNotes().some(j => /started a fight with .* and ran/.test(j)),
    journalNotes().join(' // ').slice(0, 200));
  check('1.7 victim still in the village (they did not run)', others().includes(victim));

  console.log('--- 2. betrayer flees (regression: routed path untouched) ---');
  await freshGame();
  const victim2 = others()[0];
  Game.playerAttacks(victim2);
  clearSays();
  const h = Game.tbfight.fighters.find(x => x.kind === 'hostile');
  h.fled = true;
  try { Game.tbEndCheck(); } catch (e) { check('2.x tbEndCheck threw', false, e.message); }
  check('2.1 fight closed', !Game.tbfight);
  const text2 = says.join(' || ');
  check('2.2 betrayer removed from roster', !others().includes(victim2));
  check('2.3 routed fiction (they got away) present', /got away|looking over your shoulder/.test(text2), text2.slice(0, 200));

  console.log('--- 3. player kills betrayer (regression: won path untouched) ---');
  await freshGame();
  const victim3 = others()[0];
  Game.playerAttacks(victim3);
  const hh = Game.tbfight.fighters.find(x => x.kind === 'hostile');
  clearSays();
  try { Game.tbDamage(hh.key, 9999, 'test', 'p', {}); } catch (e) { check('3.x tbDamage threw', false, e.message); }
  try { Game.tbEndCheck(); } catch (e) { check('3.x tbEndCheck threw', false, e.message); }
  check('3.1 fight closed after kill', !Game.tbfight);
  const text3 = says.join(' || ');
  check('3.2 kill narration present (no flight fiction)', /is dead|hands won't stop shaking/.test(text3), text3.slice(0, 200));
  check('3.3 no flight line in a kill', !/You run\. The fight/.test(text3));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
