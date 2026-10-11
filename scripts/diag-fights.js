#!/usr/bin/env node
// diag-fights.js — per-fight and per-overnight player attrition (survival-attrition).
// SEEDS="1-10" node scripts/diag-fights.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame, runDays } = require('./sim-harness');
const { competent } = require('./policies/competent');

function parseSeeds(s) {
  const out = [];
  for (const part of String(s || '1-10').split(',')) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) { for (let i = +m[1]; i <= +m[2]; i++) out.push(i); }
    else if (part.trim()) out.push(+part.trim());
  }
  return out;
}

(async () => {
  const seeds = parseSeeds(process.env.SEEDS || '1-10');
  const days = parseInt(process.env.DAYS || '200', 10);
  const fights = [], overnights = [];
  for (const seed of seeds) {
    const { Game } = await loadGame({ seed, mode: 'competent' });
    await setupGame(Game);
    const origStart = Game.startCombat.bind(Game);
    let curFight = null;
    Game.startCombat = function (mid, opts) {
      const r = origStart(mid, opts);
      try {
        const s = Game.state.scholar || {};
        const f = Game.tbfight;
        const mids = f ? f.fighters.filter(x => x.kind === 'monster').map(x => x.monsterId + (x.veteran ? '(vet)' : '')) : [mid];
        curFight = { seed, day: s.day || 0, playerHpStart: Math.round(s.health || 0), mids, playerDied: false, playerHpEnd: null, rounds: null, over: null };
        fights.push(curFight);
      } catch (e) {}
      return r;
    };
    // watch for fight end: wrap tbEndCheck? simpler: detect in runDays loop via daily sample. Instead: wrap registerDeath
    const origDeath = Game.registerDeath.bind(Game);
    Game.registerDeath = function (opts) {
      opts = opts || {};
      if ((opts.villagerId || null) === Game.villagerId && curFight) curFight.playerDied = true;
      return origDeath(opts);
    };
    const origEndDay = Game.endDay.bind(Game);
    Game.endDay = function () {
      let rec = null;
      try {
        const s = Game.state.scholar || {};
        rec = {
          seed, day: s.day || 0, hpBefore: Math.round(s.health || 0),
          kcal: Math.round(s.kcal || 0), hyd: Math.round(s.hydration || 0),
          weather: Game.state.weather, inTent: !!s.insideTent,
          loc: Game.location || '?',
          dis: ((Game.seList && Game.seList('scholar')) || []).map(e => e.id).join(','),
        };
      } catch (e) {}
      const r = origEndDay();
      try {
        if (rec) {
          rec.hpAfter = Math.round((Game.state.scholar || {}).health || 0);
          rec.dmg = rec.hpBefore - rec.hpAfter;
          overnights.push(rec);
        }
      } catch (e) {}
      return r;
    };
    const policy = Object.assign({}, competent);
    const origDaily = policy.daily;
    policy.daily = (G, ctx) => {
      // snapshot open fight state at day boundary
      try {
        if (Game.tbfight && curFight && !curFight.rounds) {
          curFight.rounds = Game.tbfight.round || null;
          curFight.over = !!Game.tbfight.over;
        }
      } catch (e) {}
      if (origDaily) origDaily(G, ctx);
    };
    await runDays(Game, policy, { days });
  }
  // summarize fights
  console.log('fights:', fights.length);
  const byMonster = {};
  for (const f of fights) {
    for (const m of f.mids) {
      const k = m.replace(/\(vet\)/, '');
      byMonster[k] = byMonster[k] || { n: 0, died: 0, hpStart: [], hpLoss: [] };
      byMonster[k].n++;
      if (f.playerDied) byMonster[k].died++;
    }
  }
  const top = Object.entries(byMonster).sort((a, b) => b[1].n - a[1].n).slice(0, 15);
  console.log('monster | fights | playerDeaths | deathRate');
  for (const [m, s] of top) console.log(`${m} | ${s.n} | ${s.died} | ${(s.died / s.n * 100).toFixed(1)}%`);
  const diedFights = fights.filter(f => f.playerDied);
  const hpStarts = diedFights.map(f => f.playerHpStart);
  console.log('player-death fights:', diedFights.length, 'avg hp at fight start:', (hpStarts.reduce((a, b) => a + b, 0) / Math.max(1, hpStarts.length)).toFixed(1));
  // overnights: biggest damage events
  const big = overnights.filter(o => o.dmg > 0).sort((a, b) => b.dmg - a.dmg).slice(0, 25);
  console.log('\nbiggest overnight player damage events (dmg>0):');
  for (const o of big) console.log(`seed${o.seed} d${o.day} -${o.dmg} (${o.hpBefore}->${o.hpAfter}) kcal${o.kcal} hyd${o.hyd} ${o.weather} ${o.loc}${o.inTent ? '/tent' : ''} dis:[${o.dis}]`);
  const neg = overnights.filter(o => o.dmg > 0);
  console.log('overnight dmg events:', neg.length, '/', overnights.length, 'avg:', (neg.reduce((a, o) => a + o.dmg, 0) / Math.max(1, neg.length)).toFixed(1));
  fs.writeFileSync('/tmp/diag-fights.json', JSON.stringify({ fights, overnights }, null, 1));
})();
