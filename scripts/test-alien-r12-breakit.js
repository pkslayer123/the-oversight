// BREAK-IT r12: alien players — dead-persona farming + outcome-line honesty.
// (Steve 2026-10-10 directive: hostile player, full code knowledge.)
//
// ATTACKS:
//   1. EXPLOIT: kill a persona (apOnCombatEnd won+killed) — the engine never
//      marks them dead, so the corpse re-enters EVERY selection pool:
//      apRollEncounter, apMaybeActivate, apRollGroupEncounter, apPersonaPackage,
//      apDeadDrop (Old Tam), apEventFeed, apFeedMessage, apContestInterference
//      (rigging AND the benevolent lifeline), apVillageGossip, and the
//      playground itself (dead-but-active personas keep killing villagers).
//      Each re-kill re-grants +4/+6 favor and another armor-salvage roll.
//   2. SOFTLOCK: dead-but-active persona in apPlaygroundTick acts from beyond
//      the grave (kill/raid/burn). Also: apStartEncounter phantom check.
//   3. HONESTY: apOnCombatEnd outcome lines are INVERTED — player 'won' plays
//      the persona's victoryLines (the loser gloating "Magnificent. Truly. The
//      moment the light went out"), player 'lost' plays defeatLines ("You BEAT
//      me!"). And a KILLED persona still speaks.
//   4. DEAD-CODE: every provides-listed function must exist on Game and the
//      module must be live (loaded in index.html + hooked).
//
// Assertions encode FIXED behavior. Run: SEED=1 node scripts/test-alien-r12-breakit.js
const H = require('./break-alien-harness.js');
const { Game, RNG } = H;

let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.log('  FAIL: ' + msg); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

const SEEDS = [20261010, 20261011, 20261012];
const COMBAT = ['vex_marlowe', 'countess_sable', 'rax_dentist', 'pip_quindle', 'sarge', 'dr_fenwick', 'old_tam'];

function eligibleGame(seed, day) {
  RNG.reset(seed);
  H.fresh(day || 45);
  Game.state.systemArrived = true;
  Game.state.systemIntegration = 2;
  Game.isSafeTile = () => false;
  Game.state.waveKills = { 1: 10 };
  const s = Game.state.scholar;
  s.day = day || 45; s.kcal = 3000; s.health = 100;
  Game.state.party = [{ id: 'a' }, { id: 'b' }];
  H.clearLog();
  return s;
}

// Kill a persona the honest way: through apOnCombatEnd with killed:true.
function killPersona(pid) {
  Game.apOnCombatEnd(pid, 'won', { killed: true });
}

async function main() {
  await H.boot();

  for (const seed of SEEDS) {
    console.log('\n########## SEED ' + seed + ' ##########');

    section('EXPLOIT 1: a killed persona must be marked dead');
    {
      eligibleGame(seed, 45);
      const ap = Game.apState();
      killPersona('vex_marlowe');
      const rec = ap.met['vex_marlowe'] || {};
      assert(rec.dead === true, 'seed ' + seed + ': met.vex_marlowe.dead is true after a kill');
    }

    section('EXPLOIT 2: dead personas leave the encounter pools');
    {
      eligibleGame(seed, 45);
      const ap = Game.apState();
      killPersona('vex_marlowe');
      // Sporting-rule everyone else out so the dead persona is the ONLY
      // candidate left: before the fix it gets re-picked (farming).
      const today = Game.state.scholar.day;
      for (const pid of COMBAT) {
        if (pid === 'vex_marlowe') continue;
        ap.lastHuntDay[pid] = today;
      }
      let repicked = 0;
      for (let i = 0; i < 300; i++) {
        const pid = Game.apRollEncounter();
        if (pid === 'vex_marlowe') repicked++;
      }
      assert(repicked === 0, 'seed ' + seed + ': dead vex re-rolled ' + repicked + '/300 (want 0)');
    }
    {
      eligibleGame(seed, 45);
      const ap = Game.apState();
      killPersona('sarge');
      // Everyone else active: the dead persona is the only activation
      // candidate left.
      const active = Game.apActive();
      for (const pid of COMBAT) {
        if (pid === 'sarge') continue;
        active[pid] = { enteredDay: 40, lastActionDay: 44 };
      }
      ap.lastActivateDay = 40;
      const before = Object.keys(Game.apActive()).length;
      const got = Game.apMaybeActivate();
      assert(got !== 'sarge', 'seed ' + seed + ': apMaybeActivate returned dead sarge (' + got + ')');
      assert(before === Object.keys(Game.apActive()).length || got === null || (got && !Game.apState().met[got].dead),
        'seed ' + seed + ': activation never arms a corpse');
    }
    {
      eligibleGame(seed, 45);
      const ap = Game.apState();
      // Two established rivals, one dead: no group should form around a corpse.
      ap.met['vex_marlowe'] = { encounters: 3, dead: true, lastOutcome: 'won' };
      ap.met['sarge'] = { encounters: 3, lastOutcome: 'won' };
      ap.lastGroupDay = -999;
      let withCorpse = 0, anyGroup = 0;
      for (let i = 0; i < 400; i++) {
        const g = Game.apRollGroupEncounter();
        if (g) { anyGroup++; if (g.indexOf('vex_marlowe') >= 0) withCorpse++; }
      }
      assert(anyGroup === 0, 'seed ' + seed + ': group rolled ' + anyGroup + 'x with only 1 living rival (want 0)');
      assert(withCorpse === 0, 'seed ' + seed + ': corpse in group ' + withCorpse + 'x (want 0)');
    }
    {
      eligibleGame(seed, 45);
      const ap = Game.apState();
      ap.met = { 'vex_marlowe': { encounters: 2, dead: true, lastOutcome: 'won' } };
      ap.lastPersonaPackageDay = -999;
      let fromDead = 0;
      for (let d = 45; d < 75; d++) {
        Game.state.scholar.day = d;
        const r = Game.apPersonaPackage();
        if (r) fromDead++;
      }
      assert(fromDead === 0, 'seed ' + seed + ': persona packages from dead vex: ' + fromDead + ' (want 0)');
    }
    {
      eligibleGame(seed, 45);
      const ap = Game.apState();
      ap.met = { 'old_tam': { encounters: 2, bond: 2, dead: true, lastOutcome: 'won' } };
      ap.lastDropDay = -999; ap.wrenDrops = 0;
      // Wren (who can never die) would legitimately drop — remove her from
      // the candidate list for this test so ONLY dead Old Tam could qualify.
      const _plist = Game.data.alienPlayers;
      Game.data.alienPlayers = _plist.filter(p => p.id !== 'wren');
      let deadDrops = 0;
      for (let d = 45; d < 75; d++) {
        Game.state.scholar.day = d;
        const before = H.allText();
        Game.apDeadDrop();
        const after = H.allText();
        if (after.length > before.length) deadDrops++;
      }
      Game.data.alienPlayers = _plist;
      assert(deadDrops === 0, 'seed ' + seed + ': dead drops from dead Old Tam: ' + deadDrops + ' (want 0)');
    }

    section('EXPLOIT 3: the dead do not rig contests or save lives');
    {
      eligibleGame(seed, 45);
      const ap = Game.apState();
      ap.met = { 'vex_marlowe': { encounters: 3, dead: true, lastOutcome: 'lost' } };
      ap.known['vex_marlowe'] = 'test';
      ap.lastRigDay = -999;
      let rigged = 0;
      for (let i = 0; i < 60; i++) {
        ap.lastRigDay = -999;
        const r = Game.apContestInterference({ participants: ['player'] }, {});
        if (r && r.winMod < 0) rigged++;
      }
      assert(rigged === 0, 'seed ' + seed + ': dead vex rigged ' + rigged + '/60 contests (want 0)');
    }
    {
      eligibleGame(seed, 45);
      const ap = Game.apState();
      ap.met = { 'old_tam': { encounters: 3, bond: 3, dead: true, lastOutcome: 'won' } };
      ap.lastLifelineDay = -999;
      let saved = 0;
      for (let i = 0; i < 60; i++) {
        ap.lastLifelineDay = -999;
        const r = Game.apContestInterference({ participants: ['player'] }, { forPlayer: true });
        if (r && r.deathSave) saved++;
      }
      assert(saved === 0, 'seed ' + seed + ': dead Old Tam lifelined ' + saved + '/60 deaths (want 0)');
    }

    section('EXPLOIT 4: the dead do not gossip or haunt the feed');
    {
      eligibleGame(seed, 45);
      const ap = Game.apState();
      ap.met = { 'vex_marlowe': { encounters: 3, dead: true, lastOutcome: 'lost' } };
      ap.known['vex_marlowe'] = 'test';
      ap.lastFeedDay = -999;
      ap.fanClubs = { fight: 0, survival: 0, social: 0, showbiz: 0 };
      Game.apSyncFavor();
      let named = 0;
      for (let i = 0; i < 40; i++) {
        ap.lastFeedDay = -999;
        H.clearLog();
        Game.apFeedMessage();
        if (/VEX MARLOWE/i.test(H.allText())) named++;
      }
      assert(named === 0, 'seed ' + seed + ': dead vex gossiped on feed ' + named + '/40 (want 0)');
    }
    {
      eligibleGame(seed, 45);
      const ap = Game.apState();
      ap.met = { 'vex_marlowe': { encounters: 3, dead: true, lastOutcome: 'lost' } };
      ap.lastFeedDay = -999;
      let rivalLines = 0;
      for (let i = 0; i < 40; i++) {
        ap.lastFeedDay = -999;
        H.clearLog();
        Game.apEventFeed();
        if (/vex/i.test(H.allText())) rivalLines++;
      }
      assert(rivalLines === 0, 'seed ' + seed + ': dead rival on event feed ' + rivalLines + '/40 (want 0)');
    }
    {
      eligibleGame(seed, 45);
      const ap = Game.apState();
      ap.known = { 'countess_sable': 'test' };
      ap.met = { 'countess_sable': { encounters: 3, dead: true, lastOutcome: 'lost' } };
      let talked = 0;
      for (let i = 0; i < 40; i++) {
        H.clearLog();
        Game.apVillageGossip();
        if (/sable/i.test(H.allText())) talked++;
      }
      assert(talked === 0, 'seed ' + seed + ': villagers gossip about dead Sable ' + talked + '/40 (want 0)');
    }

    section('SOFTLOCK 1: a killed active persona leaves the playground');
    {
      eligibleGame(seed, 45);
      const active = Game.apActive();
      active['countess_sable'] = { enteredDay: 40, lastActionDay: 44 };
      killPersona('countess_sable');
      assert(!Game.apActive()['countess_sable'], 'seed ' + seed + ': dead Sable removed from active');
      let acted = 0;
      for (let i = 0; i < 60; i++) {
        const r = Game.apPlaygroundAction('countess_sable');
        if (r) acted++;
      }
      assert(acted === 0, 'seed ' + seed + ': dead Sable acted ' + acted + '/60 (want 0)');
    }
    {
      // apPlaygroundTick must never act a dead pid even if one lingers.
      eligibleGame(seed, 45);
      const ap = Game.apState();
      const active = Game.apActive();
      active['rax_dentist'] = { enteredDay: 40, lastActionDay: 44 };
      ap.met['rax_dentist'] = { encounters: 1, dead: true };
      let acted = 0;
      for (let i = 0; i < 60; i++) {
        const r = Game.apPlaygroundAction('rax_dentist');
        if (r) acted++;
      }
      assert(acted === 0, 'seed ' + seed + ': lingering dead Rax acted ' + acted + '/60 (want 0)');
    }

    section('HONESTY 1: outcome lines are not inverted, the dead do not speak');
    {
      eligibleGame(seed, 45);
      const ap = Game.apState();
      ap.known['vex_marlowe'] = 'test';
      const per = Game.apPersona('vex_marlowe');
      // Player WON (drove them off, not killed): the persona LOST — defeat lines.
      H.clearLog();
      Game.apOnCombatEnd('vex_marlowe', 'won', { killed: false });
      const wonText = H.allText();
      const defeatSaid = (per.defeatLines || []).some(l => wonText.indexOf(l.slice(0, 20)) >= 0);
      const victorySaid = (per.victoryLines || []).some(l => wonText.indexOf(l.slice(0, 20)) >= 0);
      assert(defeatSaid, 'seed ' + seed + ': player-won plays the persona\'s DEFEAT line');
      assert(!victorySaid, 'seed ' + seed + ': player-won does NOT play the persona\'s victory line');
    }
    {
      eligibleGame(seed, 45);
      const ap = Game.apState();
      ap.known['sarge'] = 'test';
      const per = Game.apPersona('sarge');
      // Player LOST: the persona WON — victory lines.
      H.clearLog();
      Game.apOnCombatEnd('sarge', 'lost', {});
      const lostText = H.allText();
      const victorySaid = (per.victoryLines || []).some(l => lostText.indexOf(l.slice(0, 20)) >= 0);
      const defeatSaid = (per.defeatLines || []).some(l => lostText.indexOf(l.slice(0, 20)) >= 0);
      assert(victorySaid, 'seed ' + seed + ': player-lost plays the persona\'s VICTORY line');
      assert(!defeatSaid, 'seed ' + seed + ': player-lost does NOT play the persona\'s defeat line');
    }
    {
      eligibleGame(seed, 45);
      const ap = Game.apState();
      ap.known['rax_dentist'] = 'test';
      // KILLED: the dead do not give post-fight quotes. A death beat instead.
      H.clearLog();
      Game.apOnCombatEnd('rax_dentist', 'won', { killed: true });
      const killText = H.allText();
      assert(!/🎭 Rax "The Dentist": "/.test(killText), 'seed ' + seed + ': dead Rax speaks no post-fight line');
      assert(/goes still|not coming back/i.test(killText), 'seed ' + seed + ': the kill is announced honestly');
    }

    section('EXPLOIT 5: favor cannot be farmed off a corpse');
    {
      eligibleGame(seed, 45);
      const ap = Game.apState();
      ap.fanClubs = { fight: 0, survival: 0, social: 0, showbiz: 0 };
      Game.apSyncFavor();
      killPersona('vex_marlowe'); // +6, legit: you killed a sadistic alien
      const afterOne = Game.apFanLane('fight');
      assert(afterOne === 6, 'seed ' + seed + ': first kill grants +6 fight favor (got ' + afterOne + ')');
      // The corpse cannot be re-fought, so no second grant is reachable.
      assert(Game.apState().met['vex_marlowe'].dead === true, 'seed ' + seed + ': re-kill unreachable (dead flag)');
    }

    section('DEAD-CODE: the module is loaded, hooked, and every provides fn exists');
    {
      eligibleGame(seed, 45);
      const provides = ('apState apPersonas apPersona apEligible apEncounterEligible apRollEncounter ' +
        'apBuildFighter apAbilityKit apAlienTech apStartEncounter apCombatIntro apCombatLine apSayCombat ' +
        'apCombatChatter apPilotTaunt apWealthOf apIsCombat apWealthStance apApplyWealthStance apProgressRate ' +
        'apProgressLevel apProgressiveKit apProgressiveTech apGroupEligible apRollGroupEncounter apGroupBanter ' +
        'apStartGroupEncounter apOnCombatEnd apDailyTick apActive apPlaygroundTick apMaybeActivate apMaybeDeactivate ' +
        'apPlaygroundAction apPlaygroundKill apPlaygroundBurn apPlaygroundRaid apPlaygroundRookieMistake ' +
        'apPlaygroundDuel apFactionAligned apVillagerFear apBeamResistPieces apBeamResistLevel apBeamResistText ' +
        'apReadinessCheck apHasBeam apStasisFieldLive apBeamHit apArmorName apMaybeBeamAttack apIsArsonist ' +
        'apExperience apFavor apFanLane apTopLane apClubName apAdjustFavor apPackageClubLine apClubBoon ' +
        'apDeadDrop apFeedMessage apContestInterference apPersonaPackage apEventFeed apCodexEntry apVillageGossip ' +
        'apContactedVillager apContactWarning apKnowsAlien apRevealAlien apCarePackage apWackyGift apGrantItem ' +
        'apDousePlayerFire').split(' ');
      let missing = [];
      for (const fn of provides) {
        if (typeof Game[fn] !== 'function') missing.push(fn);
      }
      assert(missing.length === 0, 'seed ' + seed + ': missing provides fns: ' + missing.join(','));
      assert(provides.length === 74, 'seed ' + seed + ': provides count ' + provides.length + ' (want 74)');
      // Hooks: the module self-wires into the engine.
      assert(Game.tbEnd !== undefined, 'seed ' + seed + ': tbEnd wrap installed');
      // Runtime smoke: safe calls return sane values.
      assert(Array.isArray(Game.apPersonas()) && Game.apPersonas().length === 8, 'seed ' + seed + ': 8 personas');
      assert(Game.apEligible() === true, 'seed ' + seed + ': apEligible true post-System wave2');
      assert(Game.apEncounterEligible() === true, 'seed ' + seed + ': apEncounterEligible true off safe tile');
      assert(typeof Game.apFavor() === 'number', 'seed ' + seed + ': apFavor numeric');
      assert(Game.apTopLane() === 'showbiz', 'seed ' + seed + ': top lane defaults showbiz');
      assert(Game.apBeamResistLevel() === 'none', 'seed ' + seed + ': no gear = no resist');
      assert(/CRITICAL/.test(Game.apBeamResistText()), 'seed ' + seed + ': resist text honest at 0 pieces');
      const rc = Game.apReadinessCheck();
      assert(rc && typeof rc.ready === 'boolean' && Array.isArray(rc.reasons), 'seed ' + seed + ': readiness check shaped');
      assert(Game.apProgressLevel('vex_marlowe') === 0, 'seed ' + seed + ': level 0 before encounters');
      assert(Game.apStasisFieldLive() === false, 'seed ' + seed + ': no stasis field outside a fight');
      assert(Game.apDousePlayerFire() === false, 'seed ' + seed + ': no fire to douse = false, not a lie');
      assert(Game.apGroupEligible() === false, 'seed ' + seed + ': group ineligible without rivals');
      const w = Game.apWackyGift(3);
      assert(!w || (!w.kcalEach && w.class !== 'food'), 'seed ' + seed + ': wacky gift never dinner');
      // apDailyTick runs the whole off-screen machine without throwing.
      try { Game.apDailyTick(); assert(true, 'seed ' + seed + ': apDailyTick runs'); }
      catch (e) { assert(false, 'seed ' + seed + ': apDailyTick threw: ' + e.message); }
      // apStartEncounter with a refused fight leaves no phantom state.
      const _sac = Game.startAlienCombat;
      Game.startAlienCombat = () => null;
      const ok = Game.apStartEncounter('pip_quindle');
      Game.startAlienCombat = _sac;
      assert(ok === false && !Game.state.alienEncounter, 'seed ' + seed + ': refused start leaves no phantom alienEncounter');
    }
  }

  console.log('\n==================');
  console.log('PASS: ' + pass + '  FAIL: ' + fail);
  if (failures.length) console.log('failures:\n - ' + failures.join('\n - '));
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
