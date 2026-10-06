const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..','..');
const FILES=['src/js/engine/state.js','src/js/engine/modifiers.js','src/js/engine/calories.js','src/js/engine/day.js','src/js/engine/forage.js','src/js/engine/combat.js','src/js/game.js','src/js/encounters.js','src/js/conversation.js','src/js/journal.js','src/js/party.js','src/js/party-formal.js','src/js/truth.js','src/js/contests.js','src/js/storage.js','src/js/perceive.js','src/js/carexplore.js','src/js/justice.js','src/js/food.js','src/js/betrayal.js','src/js/corpses.js','src/js/lifeseed.js','src/js/progression.js','src/js/ledger.js','src/js/villager-agency.js','src/js/codex-people.js','src/js/membership.js','src/js/hierarchy.js','src/js/debug-scenarios.js','src/js/build.js'];
(async()=>{
global.window=globalThis;
global.fetch=(f)=>Promise.resolve({json:()=>Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT,f),'utf8')))});
global.localStorage={_m:{},getItem(k){return this._m[k]??null;},setItem(k,v){this._m[k]=String(v);},removeItem(k){delete this._m[k];}};
for(const f of FILES) eval(fs.readFileSync(path.join(ROOT,f),'utf8')+'\n//# sourceURL='+f);
const Game=global.Scattering.Game; await Game.init();
Game.debugScenario('lockpick');
Game.startCombat('lockpick_raccoon');
const f=Game.tbfight;
// DON'T attack: just end player turns so the raccoon gets many turns, see if it steals
for(let i=0;i<10 && Game.tbfight && !Game.tbfight.over;i++){
  if(Game.tbIsPlayerTurn()){ try{Game.tbPlayerWait&&Game.tbPlayerWait();}catch(e){} try{Game.tbPlayerEndTurn();}catch(e){} }
  else { try{Game.tbAdvance();}catch(e){break;} }
}
const inv=(Game.state.scholar.inventory||[]).map(x=>x.name+':'+x.units).join(' | ');
console.log('INVENTORY AFTER:',inv);
console.log('FIGHT OVER:',Game.tbfight?Game.tbfight.over:'(null, ended)','result:',Game.tbfight&&Game.tbfight.result);
console.log('--- full log ---');
(Game.log||[]).forEach(l=>console.log(String(l).slice(0,140)));
})();
