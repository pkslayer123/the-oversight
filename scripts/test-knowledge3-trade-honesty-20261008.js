// BREAK-IT knowledge (3rd pass): HONESTY — the trade_yes follow-up line.
// tradeKnowledge returns explicit outcome tokens ('ok','known','nothing',
// 'poor','taught-wrong','contested'). The handler must name the real reason:
// "come back when you can pay" is a lie when the refusal was "you already
// know it" or "you have nothing I don't know". Drives the REAL convoTurn
// with a staged pendingTrade.
'use strict';
const h = require('./break-monsters-harness.js');
const SEEDS = [6606, 7, 424242];

async function driveTradeYes(G, vid, pid, price) {
  const lines = [];
  const origSay = G.say;
  G.say = (l) => { lines.push(String(l)); };
  try {
    G.startConvo(vid);
    const c = G.convoGet(vid);
    c.thread = 'trade';
    c.pendingTrade = { pid, price };
    G.convoTurn(vid, 'trade_yes');
  } catch (e) {
    return { error: String(e && e.message || e) };
  } finally {
    G.say = origSay;
  }
  return { lines };
}

async function run(seed) {
  global.window = global;
  const G = await h.freshGame(seed);
  G.say = () => {};
  const v = G.state.village;
  const cand = (v.roster || []).find(id => id !== G.villagerId);
  if (!cand) return { seed, skip: 'no villagers' };
  const origIsTrader = G.isKnowledgeTrader;
  G.isKnowledgeTrader = (id) => id === cand ? true : (origIsTrader ? origIsTrader.call(G, id) : false);
  const pid = G.traderKnowledge(cand, true)[0];
  const p = (G.data.plants || []).find(x => x.id === pid);
  const out = {};

  // CASE 1: fresh trade succeeds -> "Pleasure doing business."
  v.trust[cand] = 40; G.state.scholar.kcal = 100000;
  let r = await driveTradeYes(G, cand, pid, 'food');
  if (r.error) return { seed, error: r.error };
  out.successLine = r.lines.some(l => l.includes('Pleasure doing business'));

  // CASE 2: already L3 -> honest "already know it" follow-up, NOT "come back when you can pay"
  G.state.codex.plants[pid].level = 3;
  r = await driveTradeYes(G, cand, pid, 'food');
  if (r.error) return { seed, error: r.error };
  const knownLine = r.lines.some(l => l.includes("Already know it cold"));
  const payLie = r.lines.some(l => l.includes('when you can pay'));
  out.knownHonest = knownLine && !payLie;

  // CASE 3: knowledge-price with nothing to offer -> "bring me something" follow-up
  const pid2 = G.traderKnowledge(cand, true)[1] || pid;
  v.trust[cand] = 10; // knowledge-price path
  // player knows nothing the trader lacks: wipe player plants except pid2's pool overlap
  G.state.codex.plants = {};
  r = await driveTradeYes(G, cand, pid2, 'knowledge');
  if (r.error) return { seed, error: r.error };
  const nothingLine = r.lines.some(l => l.includes("Bring me something I haven't seen"));
  const payLie2 = r.lines.some(l => l.includes('when you can pay'));
  out.nothingHonest = nothingLine && !payLie2;

  out.pid = pid; out.pname = p && p.name;
  return out;
}

async function main() {
  let fails = 0;
  for (const s of SEEDS) {
    const r = await run(s);
    r.seed = s;
    console.log(JSON.stringify(r));
    if (!r.skip && !(r.successLine && r.knownHonest && r.nothingHonest)) fails++;
  }
  console.log(fails ? `\n${fails} FAILED` : '\nALL GREEN');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
