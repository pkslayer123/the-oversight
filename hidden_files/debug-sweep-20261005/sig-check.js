const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..','..');
const FILES=['src/js/engine/state.js','src/js/engine/modifiers.js','src/js/engine/calories.js','src/js/engine/day.js','src/js/engine/forage.js','src/js/engine/combat.js','src/js/game.js','src/js/encounters.js','src/js/conversation.js','src/js/journal.js','src/js/party.js','src/js/party-formal.js','src/js/truth.js','src/js/contests.js','src/js/storage.js','src/js/perceive.js','src/js/carexplore.js','src/js/justice.js','src/js/food.js','src/js/betrayal.js','src/js/corpses.js','src/js/lifeseed.js','src/js/progression.js','src/js/ledger.js','src/js/villager-agency.js','src/js/codex-people.js','src/js/membership.js','src/js/hierarchy.js','src/js/debug-scenarios.js','src/js/build.js'];
const SCEN=process.argv[2];
(async()=>{
global.window=globalThis;
global.fetch=(f)=>Promise.resolve({json:()=>Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT,f),'utf8')))});
global.localStorage={_m:{},getItem(k){return this._m[k]??null;},setItem(k,v){this._m[k]=String(v);},removeItem(k){delete this._m[k];}};
for(const f of FILES) eval(fs.readFileSync(path.join(ROOT,f),'utf8')+'\n//# sourceURL='+f);
const Game=global.Scattering.Game; await Game.init();
Game.debugScenario(SCEN);
const s=Game.state.scholar; const mid=s.monster&&s.monster.id;
Game.startCombat(mid);
const f0=Game.tbfight;
const me=f0.fighters.find(x=>x.key==='p');
const m0=f0.fighters.find(x=>x.kind==='monster');
me.mx=m0.mx-1; me.my=m0.my; // adjacent
// wait-only: let the monster have many turns
for(let i=0;i<14 && Game.tbfight && !Game.tbfight.over;i++){
  if(Game.tbIsPlayerTurn()){ try{Game.tbPlayerWait&&Game.tbPlayerWait();}catch(e){} try{Game.tbPlayerEndTurn();}catch(e){} }
  else { try{Game.tbAdvance();}catch(e){console.log('ADV ERR',e.message);break;} }
}
console.log('OVER:',Game.tbfight?Game.tbfight.over:'(null)','result:',Game.tbfight&&Game.tbfight.result,'playerHp:',me.hp+'/'+me.maxHp);
console.log('--- log ---');
(Game.log||[]).forEach(l=>console.log(String(l).slice(0,150)));
})();
