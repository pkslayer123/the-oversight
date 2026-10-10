#!/usr/bin/env node
// COMBAT BREAK-IT: dead-code / wiring checks (Steve 2026-10-08).
// Attacks:
//   D1. MODULE LOAD — every combat module is in index.html's script list
//       (the Alien Players lesson: built but never loaded = dead system).
//   D2. UNWIRED COMBAT ACTIONS — data-defined combat actions with no impl
//       must fail FAST: no turn spent, no kcal/hp paid, honest message.
//   D3. PLAYER VERB WIRING — every tbPlayer* combat verb has a UI call site.
const fs = require('fs');
const path = require('path');
const H = require('./combat-break-harness.js');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
  console.log('--- D1. combat modules loaded in index.html ---');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const m of ['src/js/engine/combat.js', 'src/js/monsterBehaviors.js',
                   'src/js/abilityActions.js', 'src/js/statusEffects.js']) {
    check(`D1 ${m} in index.html`, html.includes(m));
  }

  console.log('--- D3. player verbs wired to UI ---');
  const app = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  for (const v of ['tbPlayerStrike', 'tbPlayerWait', 'tbPlayerMove', 'tbPlayerStudy',
                   'tbPlayerShout', 'tbPlayerOfferFood', 'tbBarrierExit']) {
    check(`D3 ${v} has app.js call site`, app.includes(v + '('));
  }
  // BREAK-IT abilities 2026-10-10: tbPlayerScream is now reached through the
  // single entry point (useAbility) instead of a direct call — the c-scream
  // button routes via the data action, which owns the turn + the 20 kcal.
  check('D3 tbPlayerScream has app.js call site (via useAbility)',
    app.includes("useAbility('scream_cheese', 'scream')"));

  console.log('--- D2. unwired combat actions fail fast (no cost) ---');
  const Game = await H.newCombatReadyGame();
  const s = Game.state.scholar;
  const implSrc = fs.readFileSync(path.join(ROOT, 'src/js/abilityActions.js'), 'utf8');
  const implKeys = new Set([...implSrc.matchAll(/['"]([a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)['"]:/g)].map(m => m[1]));
  const combatActions = [];
  for (const a of Game.data.abilities) {
    for (const act of (a.actions || [])) {
      if ((act.context || 'explore') === 'combat') combatActions.push([a.id, act.id]);
    }
  }
  const unwired = combatActions.filter(([aid, actid]) => !implKeys.has(aid + '.' + actid));
  const wired = combatActions.filter(([aid, actid]) => implKeys.has(aid + '.' + actid));
  console.log(`    combat data actions: ${combatActions.length}, wired: ${wired.length}, unwired: ${unwired.length}`);
  for (const [aid, actid] of unwired) {
    const def = Game.data.abilities.find(a => a.id === aid) || {};
    (s.backgroundAbilities = s.backgroundAbilities || []).push({ id: aid, name: def.name || aid, level: 1, xp: 0 });
    const mk = H.synthFight(Game, 'bulldozer', { mhp: 60 });
    const p = Game.tbFighter('p');
    const kcalBefore = s.kcal, hpBefore = s.health;
    const msgs = []; const o = Game.say;
    Game.say = m => { msgs.push(String(m)); return o.call(Game, m); };
    const r = Game.activateAbility(aid + '.' + actid);
    Game.say = o;
    const honest = msgs.some(m => /isn't wired up yet/.test(m));
    check(`D2 ${aid}.${actid} fails fast: turn kept`, p.acted === false, `acted=${p.acted}`);
    check(`D2 ${aid}.${actid} fails fast: no kcal/hp paid`, s.kcal === kcalBefore && s.health === hpBefore);
    check(`D2 ${aid}.${actid} honest message`, honest, msgs.slice(-1)[0]);
    if (Game.tbfight) Game.tbEnd('fled');
    s.backgroundAbilities = s.backgroundAbilities.filter(a => a.id !== aid);
  }
  // Wired actions: must not throw, must narrate or succeed (impl ran).
  for (const [aid, actid] of wired) {
    const def = Game.data.abilities.find(a => a.id === aid) || {};
    (s.backgroundAbilities = s.backgroundAbilities || []).push({ id: aid, name: def.name || aid, level: 3, xp: 0 });
    const mk = H.synthFight(Game, 'bulldozer', { mhp: 60 });
    const msgs = []; const o = Game.say;
    Game.say = m => { msgs.push(String(m)); return o.call(Game, m); };
    let threw = null, r = null;
    try { r = Game.activateAbility(aid + '.' + actid); } catch (e) { threw = e; }
    Game.say = o;
    check(`D2 wired ${aid}.${actid} does not throw`, !threw, threw && threw.message);
    check(`D2 wired ${aid}.${actid} narrates or succeeds`, msgs.length > 0 || r !== false,
      `msgs=${msgs.length}, ret=${r}`);
    if (Game.tbfight) Game.tbEnd('fled');
    s.backgroundAbilities = s.backgroundAbilities.filter(a => a.id !== aid);
  }

  console.log(`\n${fail ? 'BROKEN' : 'HELD'} — ${pass} pass, ${fail} fail (seed ${H.SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
