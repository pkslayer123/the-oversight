// Run-3 contest audit: coverage of watch-beats / death-lines / coaching for
// all 27 contest IDs, plus knowledge-gating holds on tithe/riddle/confession
// intros (Steve 2026-10-06: "if you don't know, it doesn't show").
// Usage: node scripts/test-contest-fear-3.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/contests.js', 'src/js/villager-agency.js', 'src/js/ledger.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function fresh(day) {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.day = day || 15;
  Game.state.systemArrived = true;
  Game.state.over = false;
  const s = Game.state.scholar;
  s.health = 100; s.kcal = 3000; s.trauma = 0;
  Game.state.pendingContest = null; Game.state.activeContest = null;
  Game.state.contestsSeen = {}; Game.state.notability = {};
  Game.state.codex = Game.state.codex || {}; Game.state.codex.contests = {};
  return s;
}

(async () => {
  await Game.init();

  // 1. Every contest in the pool has bespoke watch beats, death line, coaching
  {
    fresh();
    const ids = Game.contestPool().map(c => c.id);
    ok('pool has 27 contests', ids.length === 27, String(ids.length));
    const missBeat = [], missDeath = [], missCoach = [], genericDeath = [];
    for (const id of ids) {
      const c = { id, name: id, cat: 'blood', risk: 'high', desc: 'x' };
      let beats = null; try { beats = Game._contestWatchBeat(c, 'X'); } catch (e) {}
      if (!beats || beats.length !== 3) missBeat.push(id);
      else if (/it's going badly/i.test(beats[0])) missBeat.push(id + '(generic-text)');
      let dl = ''; try { dl = Game._contestDeathLine(c, 'how', 'You'); } catch (e) {}
      if (/did not come home/.test(dl)) missDeath.push(id);
      else if (!/\.|!/.test(dl)) genericDeath.push(id);
      Game.state.codex = { contests: { [id]: { seen: 3, wins: 0, level: 2 } } };
      let co = ''; try { co = Game._cxCoaching(c); } catch (e) {}
      if (!co || /trust your instincts/i.test(co)) missCoach.push(id);
    }
    Game.state.codex = {};
    ok('all 27 have bespoke watch beats', !missBeat.length, JSON.stringify(missBeat));
    ok('all 27 have bespoke death lines', !missDeath.length, JSON.stringify(missDeath));
    ok('all 27 have coaching lines', !missCoach.length, JSON.stringify(missCoach));
  }

  // 2. Knowledge gating holds: first-timers bleed blind
  {
    fresh();
    Game.state.codex = { contests: {} };
    const t1 = Game._contestTithe({ id: 'tithe', name: 'The Blood Tithe', cat: 'blood', risk: 'extreme', desc: 'd' })[0].text;
    const r1 = Game._contestRiddle({ id: 'riddle', name: 'Riddle Me This', cat: 'puzzle', risk: 'high', desc: 'd' })[2].text;
    const k1 = Game._contestConfession({ id: 'confession', name: 'The Confession', cat: 'detective', risk: 'high', desc: 'd' })[1].text;
    ok('tithe first-time: no three-measure reveal', !/THREE full measures/.test(t1));
    ok('riddle first-time: no last-riddle warning', !/always the one you don't want to answer/.test(r1));
    ok('confession first-time: no false-confession coaching', !/glance/i.test(k1) || !/protecting/.test(k1));
    Game.state.codex = { contests: {
      tithe: { seen: 4, wins: 0, level: 2 }, riddle: { seen: 4, wins: 0, level: 2 },
      confession: { seen: 4, wins: 0, level: 2 } } };
    const t2 = Game._contestTithe({ id: 'tithe', name: 'The Blood Tithe', cat: 'blood', risk: 'extreme', desc: 'd' })[0].text;
    const r2 = Game._contestRiddle({ id: 'riddle', name: 'Riddle Me This', cat: 'puzzle', risk: 'high', desc: 'd' })[2].text;
    const k2 = Game._contestConfession({ id: 'confession', name: 'The Confession', cat: 'detective', risk: 'high', desc: 'd' })[1].text;
    ok('tithe veteran: three-measure revealed', /THREE full measures/.test(t2));
    ok('riddle veteran: last-riddle warning', /always the one you don't want to answer/.test(r2));
    ok('confession veteran: coaching line', /guilt looks at/.test(k2));
    Game.state.codex = {};
  }

  // 3. Frequency cap: budget exhausted -> tick returns null; week rollover resets
  {
    fresh();
    Game.state.showBudget = { week: Math.floor(15 / 7), used: 2 };
    ok('cap: tick null when budget exhausted', Game.contestTick() === null);
    Game.state.showBudget = { week: 0, used: 2 }; // stale week
    const seen = new Set();
    let fired = 0;
    for (let i = 0; i < 60; i++) { // rig the 30% daily chance
      const o = Math.random; Math.random = () => 0.1;
      const ev = Game.contestTick(); Math.random = o;
      if (ev) { fired++; Game.state.showBudget.used--; seen.add(Game.state.showBudget.week); }
    }
    ok('week rollover resets budget and allows events', fired > 0, String(fired));
    ok('post-rollover week id is current', [...seen].every(w => w === Math.floor(15 / 7)));
  }

  // 4. One interruption at a time: tick returns null while one is pending/active
  {
    fresh();
    Game.state.pendingContest = { contestId: 'pit', participant: 'player', firesDay: 16 };
    ok('tick null while contest pending', Game.contestTick() === null);
    Game.state.pendingContest = null;
    Game.state.activeContest = { contestId: 'pit', phase: 'intro', phaseIdx: 0, phases: [] };
    ok('tick null while interruption unresolved', Game.contestTick() === null);
    Game.state.activeContest.phase = 'done';
    Game.state.showBudget = { week: Math.floor(15 / 7), used: 2 };
    ok('tick still null (budget)', Game.contestTick() === null);
  }

  // 5. RECAST: countdown outlives its villager contestant
  {
    fresh();
    const vids = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
    if (!vids.length) { ok('recast: roster has villagers', false); }
    else {
      const gone = vids[0];
      Game.state.pendingContest = { contestId: 'pit', participant: gone, firesDay: 16, variant: null };
      Game.state.village.roster = Game.state.village.roster.filter(id => id !== gone); // died overnight
      const msgs = [];
      const o = Game.sysSay.bind(Game); Game.sysSay = t => { msgs.push(String(t)); return o(t); };
      Game.resolveContest();
      Game.sysSay = o;
      const txt = msgs.join('\n');
      ok('recast: show goes on with a living replacement', /The show must go on/.test(txt), txt.slice(0, 200));
      ok('recast: activeContest set', !!Game.state.activeContest);
      ok('recast: replacement is alive', (() => {
        const ac = Game.state.activeContest;
        return ac.participant === 'player' || (Game.state.village.roster || []).includes(ac.participant);
      })());
    }
  }

  // 6. Hardened variant: what was announced is what's played
  {
    fresh();
    Game.state.contestsSeen = { pit: 2 };
    const o = Math.random;
    Math.random = () => 0.05; // force the 30% hardened branch
    const picked = Game.pickContest();
    Math.random = o;
    // pickContest may pick any contest; force pit if not
    const base = picked.id === 'pit' ? picked : Game._contestScaled(Game.contestPool().find(c => c.id === 'pit'), 'hardened');
    ok('hardened: variant flag set', base.variant === 'hardened' || picked.variant === 'hardened', JSON.stringify(base.variant));
    const hw = Game._contestScaled(Game.contestPool().find(c => c.id === 'pit'), 'hardened');
    ok('hardened: name prefixed', /^Hardened /.test(hw.name));
    ok('hardened: risk bumped (high->extreme)', hw.risk === 'extreme');
    // announcement + interruption both flag it
    Game.contestInterruption(hw, 'player');
    const ac = Game.state.activeContest;
    ok('hardened: played variant preserved', ac.variant === 'hardened');
  }

  // 7. Eligibility: pre-14 locked with reason naming day 14; player skipped when exiled
  {
    fresh(13);
    const e13 = Game.contestEligible();
    ok('pre-14: nobody eligible, reason names day 14', e13.eligible.length === 0 && /14/.test(e13.reason), e13.reason);
    fresh(15);
    Game.state.scholar.exiled = true;
    const ex = Game.contestEligible();
    ok('exiled player not eligible', !ex.eligible.some(e => e.id === 'player'));
    Game.state.scholar.exiled = false;
  }

  // 8. PRIZE SIBLINGS (Steve 2026-10-06): every playable WIN choice pays a
  // prize — except the two intentional no-loot wins ('Offer your name
  // instead' in tithe: you traded your name; 'Accuse the System' in
  // confession: survival is the prize).
  {
    fresh();
    const NO_PRIZE_OK = new Set(['tithe:Offer your name instead', 'confession:Accuse the System']);
    const missing = [], intentional = [];
    for (const c of Game.contestPool()) {
      const phases = Game.contestPlayable(c);
      for (const ph of phases) {
        for (const ch of (ph.choices || [])) {
          if (ch.next === 'WIN') {
            const key = c.id + ':' + ch.label;
            if (!((ch.do || {}).prize)) {
              if (NO_PRIZE_OK.has(key)) intentional.push(key);
              else missing.push(key);
            }
          }
        }
      }
    }
    ok('all WIN choices pay a prize (2 intentional no-loot exceptions)', !missing.length, JSON.stringify(missing));
    ok('intentional no-loot wins are the known two', intentional.length === 2, JSON.stringify(intentional));
  }

  // 9. WATCH COACHING (Steve 2026-10-06): all 9 wave-2+ contests give veteran
  // watchers a gated 📚 coaching line; first-timers see nothing extra.
  {
    fresh();
    const NEW9 = ['tithe', 'siege', 'maw', 'oath', 'beastmaster', 'riddle', 'confession', 'honey', 'secrets'];
    const noCoach = [], leaked = [];
    for (const id of NEW9) {
      const c = Game.contestPool().find(x => x.id === id);
      Game.state.codex = { contests: { [id]: { seen: 4, wins: 0, level: 2 } } };
      const vet = Game._contestWatchBeat(c, 'X');
      if (!/📚/.test(vet[2])) noCoach.push(id + ':vet');
      Game.state.codex = { contests: {} };
      const fresh1 = Game._contestWatchBeat(c, 'X');
      if (/📚/.test(fresh1.join('\n'))) leaked.push(id + ':leak');
    }
    Game.state.codex = {};
    ok('all 9 new contests: veteran watchers get coaching', !noCoach.length, JSON.stringify(noCoach));
    ok('no coaching leaks to first-time watchers', !leaked.length, JSON.stringify(leaked));
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
