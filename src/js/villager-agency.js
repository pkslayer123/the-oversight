// @ontology
// system: villager-agency
// description: Villager AI. Villagers act on their own with goals and routines.
// provides:
//   - agencyState(vid)
//   - agencyTick()
//   - agencyOf(vid)
//   - agencyScore(vid)
//   - recordDeed(vid, deed)
//   - startExpedition(vid)
// rules:
//   - (none documented)
// consumes:
//   - village.villagers
/* VILLAGER AGENCY — src/js/villager-agency.js
 *
 * Steve: "Villagers need to be encountering these and more as they wander
 * about the world... Some of them need to be like most our players would be.
 * Skilled, independent, generally benign, and willing to explore far and
 * really become someone in the world. I want people to feel like they can
 * be outshone by someone more talented and hardworking than they are,
 * someone more clever."
 *
 * Villagers are independent players, not set dressing. This module builds
 * on the existing npcNodeTravel away-system (game.js) with:
 *
 * 1. RANGING — real range profiles per villager (homebody / forager /
 *    wanderer / explorer), derived from temperament, goal, age, and
 *    occupation aptitude. Multi-day expeditions with real distance from
 *    Haven. Far = danger = sometimes they don't come back, and that's a
 *    story the village tells.
 * 2. INDEPENDENT PROGRESSION — explorers gain XP (tracking, survival,
 *    bravery), knowledge (plants, monsters, places), scars, and integration
 *    (fed into the existing npcLadderDaily so slot moments fire through the
 *    same visible beats). They come back CHANGED, with things to teach.
 * 3. OUTSHINING — deeds are recorded, scored, and surfaced honestly through
 *    gossip, say-lines, and show narration (recordMoment). A few villagers
 *    per game carry hidden high-potential seeds (talented / hardworking /
 *    clever) — never displayed, only visible through deeds. Rising stars
 *    with the 'lead' goal accumulate contender heat through the existing
 *    leadership machinery. Being outpaced by an NPC is a feature.
 * 4. INTEGRATION — the mantle: deeds earn trust, so the village's choice of
 *    successor (playerDeath sorts by trust) naturally favors the explorer
 *    who became someone.
 *
 * Nothing here is artificial: achievements come from the sim doing real
 * things (expedition legs, encounter rolls, returns), reported honestly.
 * The game never rubs it in — the village just talks about what happened.
 *
 * Self-attaching module. Load after ledger.js (recordMoment, playerDeath,
 * progState). Chain-safe wraps throughout.
 */
(function () {
  'use strict';
  var _g = (typeof globalThis !== 'undefined') ? globalThis : (typeof global !== 'undefined' ? global : {});
  var G = (_g.Scattering && _g.Scattering.Game) ? _g.Scattering.Game : null;
  if (!G) return;
  var R = Math.random;
  var pick = function (a) { return a[Math.floor(R() * a.length)]; };

  // Occupations whose hands know the wild. Ranging aptitude, not a class.
  var RANGY_OCC = {
    hunting_guide: 1, park_ranger: 1, wildlife_biologist: 1, forester: 1,
    surveyor: 1, trail_crew: 1, search_rescue: 1, fisherman: 1, farmer: 1,
    rancher: 1, geologist: 1, backpacking_guide: 1, smoke_jumper: 1,
  };

  var DEED_MAG = {
    monster_kill: 10, rescue: 8, cache_haul: 6, stood_down: 4,
    mapped_far: 3, survived_hurt: 2, taught: 1,
  };

  var methods = {

    // ---------- STATE ----------
    agencyState() {
      var v = this.state.village;
      v.agency = v.agency || {};
      var a = v.agency;
      a.profiles = a.profiles || {};
      a.potential = a.potential || {};
      a.exped = a.exped || {};
      a.know = a.know || {};
      a.xp = a.xp || {};
      a.tier = a.tier || {};
      a.scars = a.scars || {};
      a.ach = a.ach || [];
      a.stats = a.stats || {};
      a.teachable = a.teachable || {};
      // transfer high-potential seeds planted at genRoster time
      if (this._pendingPotential && !a._potTransferred) {
        for (var i = 0; i < this._pendingPotential.length; i++) {
          var e = this._pendingPotential[i];
          if (e && e.id) a.potential[e.id] = e.kind;
        }
        a._potTransferred = true;
      }
      return a;
    },
    agencyOf(vid) {
      var a = this.agencyState();
      if (!a.stats[vid]) a.stats[vid] = { expeditions: 0, monsterKills: 0, caches: 0, nodes: {} };
      if (!a.know[vid]) a.know[vid] = { plants: 0, monsters: 0, places: [] };
      if (!a.xp[vid]) a.xp[vid] = { tracking: 0, survival: 0, bravery: 0 };
      if (!a.tier[vid]) a.tier[vid] = 0;
      if (!a.scars[vid]) a.scars[vid] = [];
      return a;
    },

    // ---------- 1. RANGE PROFILES ----------
    // How far does this person go? Answered by who they are, not dice.
    npcRangingApt(vid) {
      var vp = this.vpOf(vid) || {};
      var score = 0;
      var occ = vp.occupationId || '';
      if (RANGY_OCC[occ]) score += 2;
      if (vp.knowsSnare) score += 1;
      try {
        var tags = [];
        var odef = (this.data.occupations || []).find(function (o) { return o.id === occ; }) || {};
        tags = odef.teachTags || [];
        if (tags.some(function (t) { return /track|forag|surviv|hunt|trail|wild/i.test(t); })) score += 2;
      } catch (e) {}
      var intel = vp.intelligence || {};
      if (intel.secondary === 'observant' || intel.primary === 'observant') score += 1;
      return score;
    },
    npcRangeProfile(vid) {
      var a = this.agencyState();
      if (a.profiles[vid]) return a.profiles[vid];
      var temp = 'steady';
      try { temp = this.npcTemper(vid); } catch (e) {}
      var goal = null;
      try { goal = this.npcGoal(vid); } catch (e) {}
      var vp = this.vpOf(vid) || {};
      var age = vp.age || 35;
      var score = 0;
      if (temp === 'bold' || temp === 'restless') score += 2;
      else if (temp === 'intense') score += 1;
      else if (temp === 'cautious' || temp === 'withdrawn') score -= 2;
      else if (temp === 'gentle') score -= 1;
      if (goal === 'explore') score += 2;
      else if (goal === 'prove' || goal === 'lead' || goal === 'escape') score += 1;
      else if (goal === 'heal' || goal === 'protect') score -= 1;
      if (age < 30) score += 1;
      else if (age > 55) score -= 2;
      else if (age > 45) score -= 1;
      score += this.npcRangingApt(vid);
      if (a.potential[vid]) score += 2; // the driven go farther
      var prof = score >= 5 ? 'explorer' : score >= 2 ? 'wanderer' : score >= -1 ? 'forager' : 'homebody';
      a.profiles[vid] = prof;
      return prof;
    },
    npcMaxDist(vid) {
      var p = this.npcRangeProfile(vid);
      return p === 'explorer' ? 6 : p === 'wanderer' ? 3 : p === 'forager' ? 1 : 0;
    },

    // ---------- 2. EXPEDITIONS ----------
    // Hooked after npcNodeTravel (once per day-part). Explorers and wanderers
    // leave for multi-day expeditions; legs resolve encounters with real stakes.
    agencyTick() {
      if (this.over) return;
      var v = this.state.village;
      var a = this.agencyState();
      var hx = v.px ?? 4, hy = v.py ?? 4;
      var roster = v.roster || [];
      var playerAtHaven = (this.map.px === hx && this.map.py === hy);
      for (var i = 0; i < roster.length; i++) {
        var rid = roster[i];
        if (rid === this.villagerId) continue;
        var vp = null;
        try { vp = this.vpOf(rid); } catch (e) {}
        if (vp && vp.dead) continue;
        try { if (this.isEngaged(rid)) continue; } catch (e) {}
        var ex = a.exped[rid];
        var away = (v.away || {})[rid];
        if (ex) {
          // base npcNodeTravel may have brought them home (duration elapsed)
          if (!away) { this.expeditionReturn(rid, playerAtHaven); continue; }
          this.expeditionLeg(rid, hx, hy, playerAtHaven);
          continue;
        }
        // at home: consider departing. Only wanderers/explorers range;
        // foragers use the base forage loop, homebodies stay.
        var prof = this.npcRangeProfile(rid);
        if (prof !== 'wanderer' && prof !== 'explorer') continue;
        var node = null;
        try { node = this.npcNode(rid); } catch (e) { continue; }
        if (!node || node.nx !== hx || node.ny !== hy) continue;
        var night = false;
        try { night = this.isNight(); } catch (e) {}
        if (night) continue;
        // OBJECTIVES (villager-objectives.js): the objective system owns the
        // door. Indoor-objective holders don't get expeditions, and expedition
        // launches respect the village danger level (tighten/defer territory
        // means nobody walks far today). Chain-safe: module may be absent.
        try {
          if (this.objOf) {
            var oo = this.objOf(rid);
            if (oo && oo.indoor && oo.state === 'indoor') continue;
          }
          if (this.objVillageDanger && this.objVillageDanger() >= 4) continue;
        } catch (e) {}
        var chance = prof === 'explorer' ? 0.09 : 0.045;
        if (a.potential[rid]) chance *= 1.6;
        if (R() < chance) this.startExpedition(rid, hx, hy, playerAtHaven);
      }
      // rising stars with the 'lead' goal: the village starts looking at them.
      // The existing contender-heat machinery takes it from there.
      try { this.agencyLeadershipTick(); } catch (e) {}
      // the village talks about what its people did. Ambient, honest.
      try { if (playerAtHaven && R() < 0.12) this.agencyDeedTalk(); } catch (e) {}
    },
    startExpedition(vid, hx, hy, announce) {
      var a = this.agencyOf(vid);
      var st = this.agencyState();
      // GEAR-UP + HEAL CHECK (Steve 2026-10-09): expeditions arm up from the
      // village's gear and don't walk out hurt when help is at hand. A hurt
      // villager with no healer sits this cycle out (rest, try tomorrow).
      try { if (this.villagerGearUp) this.villagerGearUp(vid, true); } catch (e) {}
      try {
        if (this.villagerHealCheck) {
          var nm0 = 'Someone';
          try { nm0 = this.displayName(vid).split(' ')[0]; } catch (e2) {}
          if (this.villagerHealCheck(vid, nm0)) return;
        }
      } catch (e) {}
      var maxD = this.npcMaxDist(vid);
      if (maxD < 1) return;
      // target: a node out there, at real distance
      var dist = 1 + Math.floor(R() * maxD);
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
      var d = pick(dirs);
      var tx = Math.max(0, Math.min(8, hx + d[0] * dist)); // 9x9 world (2026-10-07)
      var ty = Math.max(0, Math.min(8, hy + d[1] * dist)); // 9x9 world (2026-10-07)
      var duration = 8 + Math.floor(R() * 13); // 2-5 days of parts
      st.exped[vid] = {
        tx: tx, ty: ty, dist: dist, legs: 0,
        sinceDay: this.state.scholar.day, sincePart: this.dayPart,
        duration: duration, finds: [], encounters: [],
      };
      // mark away so the base loop treats them as gone (it handles the clock;
      // we handle the meaning). Base return just brings them home; we narrate.
      var v = this.state.village;
      v.away = v.away || {};
      v.away[vid] = {
        nx: tx, ny: ty, purpose: 'expedition',
        sinceDay: this.state.scholar.day, sincePart: this.dayPart, duration: duration,
      };
      try { this.npcSetNode(vid, tx > hx ? hx + 1 : tx < hx ? hx - 1 : hx, ty > hy ? hy + 1 : ty < hy ? hy - 1 : hy); } catch (e) {}
      a.stats[vid].expeditions++;
      var nm = '';
      try { nm = this.displayName(vid); } catch (e) { nm = 'Someone'; }
      if (announce) {
        var lines = [
          `${nm} shoulders a pack. "Going far this time. Don't wait up."`,
          `${nm} is leaving — not foraging. Really leaving. "I'll bring back something worth the walk."`,
          `"${dist > 3 ? 'Gone a while' : 'Out past the ridge'}," ${nm} says, already walking. "If I'm not back in a few days... well. I'll be back."`,
        ];
        this.say('🎒 ' + pick(lines));
      }
      try { this.seedGossip('departure', { who: vid }, []); } catch (e) {}
    },
    expeditionLeg(vid, hx, hy, playerAtHaven) {
      var st = this.agencyState();
      var a = this.agencyOf(vid);
      var ex = st.exped[vid];
      if (!ex) return;
      ex.legs++;
      // move a node toward the target (they're out there, living)
      var node = null;
      try { node = this.npcNode(vid); } catch (e) { return; }
      var nx = node.nx, ny = node.ny;
      if (nx !== ex.tx || ny !== ex.ty) {
        nx += Math.sign(ex.tx - nx); ny += Math.sign(ex.ty - ny);
        nx = Math.max(0, Math.min(8, nx)); ny = Math.max(0, Math.min(8, ny)); // 9x9 world (2026-10-07)
        try { this.npcSetNode(vid, nx, ny); } catch (e) {}
        var key = nx + ',' + ny;
        a.stats[vid].nodes[key] = true;
      }
      var dist = Math.abs(nx - hx) + Math.abs(ny - hy);
      // XP accrues just for being out there and paying attention
      var mult = st.potential[vid] ? 2 : 1;
      a.xp[vid].tracking += mult;
      a.xp[vid].survival += mult;
      // VILLAGER XP (Steve 2026-10-09): ranging the wild is field work.
      try { if (this.villagerGainXP) this.villagerGainXP(vid, 'field', 1, 'expedition'); } catch (e) {}
      // one encounter roll per leg, weighted by distance
      var roll = R();
      var mChance = 0.10 + dist * 0.035;
      if (roll < mChance) { this.expeditionMonster(vid, dist, playerAtHaven); return; }
      if (roll < mChance + 0.14) { this.expeditionCache(vid, dist); return; }
      if (roll < mChance + 0.14 + 0.22) { this.expeditionSign(vid, dist); return; }
      if (roll < mChance + 0.14 + 0.22 + 0.07) { this.expeditionStranger(vid, dist); return; }
      // tier check: sustained ranging changes people
      this.agencyTierCheck(vid, playerAtHaven);
    },
    // FIELD FIGHTS (Steve 2026-10-08): expedition meetings are real
    // blow-by-blow fights — real stats, the monster's real attack data.
    // The old flat death/hurt/evade/kill rolls are gone. The pre-fight
    // awareness check ("saw it, gave it room") stays — it decides contact,
    // not outcome. Once steel is crossed, the fight decides.
    expeditionMonster(vid, dist, playerAtHaven) {
      var a = this.agencyOf(vid);
      var st = this.agencyState();
      var pool = [];
      try { pool = this.monsterWavePool ? this.monsterWavePool() : (this.data.monsters || []); }
      catch (e) { pool = this.data.monsters || []; }
      if (!pool.length) return;
      var m = pick(pool);
      var mName = 'something';
      try { mName = this.encDescribeMonster ? this.encDescribeMonster(m) : (m.unknown || 'something'); } catch (e) {}
      var nm = '';
      try { nm = this.displayName(vid); } catch (e) { nm = 'Someone'; }
      var rec = this.fieldFight(vid, m, null, { awareness: true });
      var fightNote = rec.rounds + ' rounds' + (rec.vTaken ? ', ' + rec.vTaken + ' taken' : '');
      if (rec.outcome === 'evade') {
        // saw it, gave it room, lived. That's a kind of knowledge.
        a.know[vid].monsters++;
        a.xp[vid].tracking += 2 * (st.potential[vid] ? 2 : 1);
        st.exped[vid].encounters.push('evaded ' + (m.id || 'it'));
        return;
      }
      // contact: they fought. Fighting teaches, whatever the ending.
      // (2026-10-08: wins and drive-offs used to walk away unwounded —
      // the record said "44 taken" while health never moved. Every
      // outcome now pays the fight's real price through the hurt pipeline.)
      a.know[vid].monsters++;
      if (rec.outcome === 'vKill') {
        try { this.hurtVillager(vid, rec.vTaken, 'monster'); } catch (e) {}
        // WAVE GATE (break-it 2026-10-09): village-wide kill minimums —
        // see resolveWildMonsterEncounter. The expedition's kill counts too.
        try { this.recordWaveKill(m.id); } catch (e) {}
        // KILL LOOT (Steve 2026-10-09): the killer loots the body — the
        // System's gift goes in their pack and they re-equip on the spot.
        var lootNote = '';
        try {
          var dropId = this.villagerKillLoot ? this.villagerKillLoot(vid, m) : null;
          if (dropId) {
            var ldef = (this.data.items || []).find(function (d) { return d.id === dropId; }) || {};
            lootNote = ' Took ' + (ldef.name || 'something strange') + ' off the body.';
            if (this.villagerGearUp) this.villagerGearUp(vid, false);
          }
        } catch (e) {}
        a.know[vid].monsters++;
        a.xp[vid].bravery += 3 * (st.potential[vid] ? 2 : 1);
        a.stats[vid].monsterKills++;
        st.exped[vid].encounters.push('killed ' + (m.id || 'it') + ' (' + fightNote + ')' + (lootNote ? ' —' + lootNote : ''));
        this.recordDeed(vid, 'monster_kill', `${nm} killed ${mName} out past the ridge — alone — and walked home. ${fightNote}.`, 10);
        return;
      }
      if (rec.outcome === 'mFlee') {
        try { this.hurtVillager(vid, rec.vTaken, 'monster'); } catch (e) {}
        a.xp[vid].bravery += 1;
        st.exped[vid].encounters.push('stood down ' + (m.id || 'it') + ' (' + fightNote + ')');
        this.recordDeed(vid, 'stood_down', `${nm} stood down ${mName} and kept walking. ${fightNote}.`, 4);
        return;
      }
      if (rec.outcome === 'vDie') return this.expedDeath(vid, mName, nm, playerAtHaven);
      // vFlee: real wounds from the real fight, then the hurt pipeline
      try { this.hurtVillager(vid, rec.vTaken, 'monster'); } catch (e) {}
      return this.expedHurt(vid, mName + ' (' + fightNote + ')', nm);
    },
    expedHurt(vid, mName, nm) {
      var a = this.agencyOf(vid);
      var st = this.agencyState();
      var scar = pick(['a limp that comes back in the cold', 'three white lines across the forearm', 'a flinch at sudden movement', 'a missing tip of the left ear']);
      a.scars[vid].push(scar);
      a.xp[vid].bravery += 2;
      if (st.exped[vid]) {
        st.exped[vid].encounters.push('hurt');
        // cut the expedition short — the body insists
        st.exped[vid].duration = Math.min(st.exped[vid].duration, st.exped[vid].legs + 1);
      }
      this.recordDeed(vid, 'survived_hurt', `${nm} came back mauled by ${mName} and alive. ${scar.charAt(0).toUpperCase() + scar.slice(1)} now.`, 2);
    },
    expedDeath(vid, mName, nm, playerAtHaven) {
      var st = this.agencyState();
      var char = {};
      try { char = (this.data.villagers || []).find(function (x) { return x.id === vid; }) || {}; } catch (e) {}
      var v = this.state.village;
      try {
        this.registerDeath({ kind: 'villager', villagerId: vid, name: char.name || nm, cause: mName, killerId: null });
      } catch (e) {}
      try { this.removeVillager(vid, 'killed'); } catch (e) {}
      delete st.exped[vid];
      if (v.away) delete v.away[vid];
      try { this.seedGossip('death', { who: vid }, []); } catch (e) {}
      try { this.recordMoment(`${nm} didn't come back. ${mName}.`); } catch (e) {}
      if (playerAtHaven) this.say(`🕯️ Word comes back with a torn pack and no ${nm.split(' ')[0]}. ${mName}, out past the ridge. The fire is quieter tonight.`);
    },
    expeditionCache(vid, dist) {
      var st = this.agencyState();
      var kcal = Math.round((300 + R() * 900) * (1 + dist * 0.15));
      st.exped[vid].finds.push({ kcal: kcal });
      var a = this.agencyOf(vid);
      a.stats[vid].caches++;
      a.xp[vid].survival += 2 * (st.potential[vid] ? 2 : 1);
      if (kcal > 1200) {
        var nm = '';
        try { nm = this.displayName(vid); } catch (e) { nm = 'Someone'; }
        this.recordDeed(vid, 'cache_haul', `${nm} found a cache out there — enough to matter.`, 6);
      }
    },
    expeditionSign(vid, dist) {
      var a = this.agencyOf(vid);
      var st = this.agencyState();
      // reading the wild: plants, tracks, places. This is how knowledge grows.
      var what = R();
      if (what < 0.45) {
        a.know[vid].plants++;
        a.xp[vid].tracking += 1;
        if (a.know[vid].plants % 3 === 0) {
          st.teachable[vid] = st.teachable[vid] || [];
          st.teachable[vid].push({ topic: 'plants', day: this.state.scholar.day });
        }
      } else if (what < 0.75) {
        a.know[vid].monsters++;
      } else {
        var places = ['a burned farmhouse', 'an old trapline', 'a spring that runs clear', 'a ridge with a view for miles', 'a cellar full of jars'];
        var pl = pick(places);
        if (a.know[vid].places.indexOf(pl) === -1) a.know[vid].places.push(pl);
      }
      this.agencyTierCheck(vid, false);
    },
    expeditionStranger(vid, dist) {
      var a = this.agencyOf(vid);
      var nm = '';
      try { nm = this.displayName(vid); } catch (e) { nm = 'Someone'; }
      // someone else is out there. Sometimes that's a story.
      if (R() < 0.25) {
        this.recordDeed(vid, 'rescue', `${nm} found someone lost out past the ridge and walked them to shelter.`, 8);
      }
      a.xp[vid].survival += 1;
    },
    agencyTierCheck(vid, announce) {
      var a = this.agencyOf(vid);
      var st = this.agencyState();
      var xp = a.xp[vid];
      var total = xp.tracking + xp.survival + xp.bravery;
      var tier = total >= 120 ? 3 : total >= 60 ? 2 : total >= 25 ? 1 : 0;
      if (tier > a.tier[vid]) {
        a.tier[vid] = tier;
        // feed the visible ladder: their integration climbs, slot moments fire
        // through the existing beats (progression.js npcLadderDaily).
        try {
          var pg = this.progState();
          pg.npcInteg = pg.npcInteg || {};
          pg.npcInteg[vid] = (pg.npcInteg[vid] || 5) + 6;
        } catch (e) {}
        var nm = '';
        try { nm = this.displayName(vid); } catch (e) { nm = 'Someone'; }
        var lines = [
          `${nm} came back different. Quieter. Surer. The wild is writing on them.`,
          `Something in ${nm}'s eyes has changed. They've seen enough out there to stop being afraid of the dark.`,
          `${nm} doesn't boast. They don't have to. Everyone can see it.`,
        ];
        if (announce) this.say('◈ ' + pick(lines));
        try { this.seedGossip('changed', { who: vid }, []); } catch (e) {}
      }
    },
    expeditionReturn(vid, playerAtHaven) {
      var st = this.agencyState();
      var a = this.agencyOf(vid);
      var ex = st.exped[vid];
      delete st.exped[vid];
      if (!ex) return;
      var nm = '';
      try { nm = this.displayName(vid); } catch (e) { nm = 'Someone'; }
      // bring home the food
      var total = 0;
      for (var i = 0; i < (ex.finds || []).length; i++) total += ex.finds[i].kcal || 0;
      if (total > 0) {
        try { this.stockPantry(total, 'Expedition haul'); } catch (e) {}
      }
      var dist = ex.dist || 1;
      if (dist >= 4) this.recordDeed(vid, 'mapped_far', `${nm} walked farther than anyone's gone and came back with the map in their head.`, 3);
      try { this.bumpTrust(vid, 1); } catch (e) {}
      // the return is news, if you're there to see it
      if (playerAtHaven) {
        var bits = [];
        if (total > 0) bits.push(`+${total} kcal for the pantry`);
        if ((ex.encounters || []).length) bits.push(`${ex.encounters.length} ${ex.encounters.length === 1 ? 'story' : 'stories'}`);
        if (a.scars[vid].length) bits.push('a new scar');
        var suffix = bits.length ? ` (${bits.join(', ')})` : '. "Nothing out there but weather."';
        var dirs = ['north', 'south', 'east', 'west'];
        this.say(`🧭 ${nm} is back from ${dist >= 4 ? 'far past' : 'past'} the ${pick(dirs)}${suffix} (Ask them what they saw.)`);
      }
      // their knowledge is askable now
      var v = this.state.village;
      v.explorerNews = v.explorerNews || {};
      v.explorerNews[vid] = { day: this.state.scholar.day, agency: true, dist: dist };
      try { this.seedGossip('return', { who: vid }, []); } catch (e) {}
    },

    // ---------- 3. DEEDS & OUTSHINING ----------
    // recordDeed: the sim did something real. Report it honestly through
    // THREE channels (Steve's surfacing direction, 2026-10-04):
    //   1. THE LIVING CODEX — the village's book remembers who did what.
    //      Synced within the village; later multi-village sync reads this.
    //      A deed is a codex entry, not just a rumor.
    //   2. THE CONTEST — deeds move a villager's viewership. The leaderboard
    //      ranks villagers; being outshone becomes VISIBLE: she's above you.
    //   3. THE BROADCAST — big deeds air. The village watches the footage;
    //      the galaxy sees it too.
    // Gossip then points at things the player can VERIFY — check the codex,
    // check the board, remember the footage. That's what makes being
    // outshone undeniable instead of hearsay.
    //
    // Play-your-own-game (Steve's philosophy): public surfacing pushes
    // DIFFERENTIATION, not imitation. Deed texts celebrate distinct lanes
    // ("Mara's the one who walks far") — identity, not rank-chasing.
    recordDeed(vid, type, text, magnitude) {
      var st = this.agencyState();
      var mag = magnitude || DEED_MAG[type] || 2;
      st.ach.push({ vid: vid, type: type, text: text, mag: mag, day: this.state.scholar.day });
      if (st.ach.length > 50) st.ach = st.ach.slice(-50);
      var nm = '';
      try { nm = this.displayName(vid); } catch (e) { nm = 'Someone'; }
      // 1. codex entry — the village's memory, in the book
      try {
        var cx = this.state.codex = this.state.codex || {};
        cx.deeds = cx.deeds || [];
        cx.deeds.unshift({ vid: vid, type: type, text: text, mag: mag, day: this.state.scholar.day });
        cx.deeds = cx.deeds.slice(0, 40);
      } catch (e) {}
      // 2. contest viewership — the board moves
      try {
        var vv = this.state.village;
        vv.npcViewership = vv.npcViewership || {};
        vv.npcViewership[vid] = (vv.npcViewership[vid] || 0) + Math.max(1, Math.round(mag / 2));
      } catch (e) {}
      // 3. broadcast — the big ones air
      if (mag >= 8) { try { this.broadcastLine(text); } catch (e) {} }
      // the village's respect: deeds move reputation along social lines
      try {
        var dims = {};
        if (type === 'monster_kill' || type === 'stood_down') dims.brave = 8;
        if (type === 'cache_haul') dims.generous = 6;
        if (type === 'rescue') { dims.brave = 6; dims.generous = 6; }
        if (type === 'mapped_far') dims.brave = 4;
        this.seedGossip('deed', dims, []);
      } catch (e) {}
      // the show notices big plays — the audience is watching
      if (mag >= 8) { try { this.recordMoment(text); } catch (e) {} }
      // if you're at Haven, you hear about it. That's the outshining:
      // not a popup saying "an NPC is better than you" — just the village
      // talking, and you overhearing.
      var v = this.state.village;
      var hx = v.px ?? 4, hy = v.py ?? 4;
      var atHaven = false;
      try { atHaven = (this.map.px === hx && this.map.py === hy); } catch (e) {}
      if (atHaven && mag >= 4 && R() < 0.7) this.say('📣 ' + text);
    },
    // codexDeeds: the village's book of who did what. Read by the codex UI.
    codexDeeds() {
      try { return ((this.state.codex || {}).deeds || []).slice(); }
      catch (e) { return []; }
    },
    // npcViewership: per-villager contest score. Deeds move it; the board ranks it.
    npcViewership(vid) {
      try {
        var vv = this.state.village;
        vv.npcViewership = vv.npcViewership || {};
        if (vv.npcViewership[vid] == null) {
          vv.npcViewership[vid] = 5 + Math.floor((((vv.trust || {})[vid] || 10)) / 12);
        }
        return vv.npcViewership[vid];
      } catch (e) { return 5; }
    },
    // playerBoardScore: your own standing — notable moments plus what you've learned.
    playerBoardScore() {
      try {
        var pg = this.progState ? this.progState() : {};
        var n = ((pg.moments || []).length);
        var breadth = 0;
        try { breadth = this.codexBreadth ? this.codexBreadth() : 0; } catch (e) {}
        return 5 + n * 2 + Math.floor(breadth / 3);
      } catch (e) { return 5; }
    },
    // villagerBoard: THE contest board, per villager, high→low. The player is
    // a row like everyone else. She's above you — visible, verifiable.
    villagerBoard() {
      var rows = [];
      try {
        var self = this;
        var roster = (this.state.village.roster || []);
        for (var i = 0; i < roster.length; i++) {
          var id = roster[i];
          try { var vp = this.vpOf(id); if (vp && vp.dead) continue; } catch (e) {}
          var isYou = (id === this.villagerId);
          var nm = 'Someone';
          try { nm = isYou ? 'You' : this.displayName(id); } catch (e) {}
          var score = isYou ? this.playerBoardScore() : this.npcViewership(id);
          // trend: recent deeds rising?
          var recent = 0;
          try {
            var st = this.agencyState();
            for (var j = 0; j < st.ach.length; j++) {
              var d = st.ach[j];
              if (d.vid === id && (this.state.scholar.day - d.day) <= 3) recent += d.mag;
            }
          } catch (e) {}
          rows.push({ vid: id, name: nm, score: score, you: isYou, trend: recent >= 8 ? '▲' : '' });
        }
      } catch (e) {}
      rows.sort(function (a, b) { return b.score - a.score; });
      return rows;
    },
    agencyScore(vid) {
      var st = this.agencyState();
      var score = 0;
      for (var i = 0; i < st.ach.length; i++) if (st.ach[i].vid === vid) score += st.ach[i].mag;
      var s = (st.stats[vid] || {});
      score += (s.expeditions || 0) * 2 + (s.monsterKills || 0) * 8;
      score += Object.keys(s.nodes || {}).length;
      var a = st; // tier lives keyed by vid
      score += ((a.tier || {})[vid] || 0) * 4;
      return score;
    },
    // ambient: the village talks about its people. You overhear.
    agencyDeedTalk() {
      var st = this.agencyState();
      var recent = st.ach.filter(function (d) { return (this.state.scholar.day - d.day) <= 2; }.bind(this));
      if (!recent.length) return;
      var d = pick(recent);
      var roster = (this.state.village.roster || []).filter(function (id) { return id !== this.villagerId && id !== d.vid; }.bind(this));
      if (!roster.length) return;
      var teller = pick(roster);
      var tn = '', dn = '';
      try { tn = this.displayName(teller); dn = this.displayName(d.vid); } catch (e) { return; }
      var lines = [
        `You catch ${tn} telling the fire about ${dn}. "${d.text.split('—')[0].trim()}" The story's already growing.`,
        `${tn} shakes their head, admiring. "Did you hear what ${dn} did?" You hadn't. Now you have.`,
        `Someone's retelling it again — ${dn}, out past the ridge. ${tn} says "${dn} would've gone farther if we'd let them."`,
      ];
      // big deeds are verifiable: the gossip points at the codex and the board.
      if (d.mag >= 6) lines.push(`${tn} is going on about ${dn} again. "Don't believe me? It's in the Codex. Check the board — ${dn.split(' ')[0]}'s above half the village."`);
      this.say(pick(lines));
    },
    agencyLeadershipTick() {
      var v = this.state.village;
      if (v.challenge) return;
      var roster = v.roster || [];
      for (var i = 0; i < roster.length; i++) {
        var id = roster[i];
        if (id === this.villagerId) continue;
        var goal = null;
        try { goal = this.npcGoal(id); } catch (e) {}
        if (goal !== 'lead') continue;
        var score = this.agencyScore(id);
        if (score >= 20 && R() < 0.10) {
          v.heat = v.heat || {};
          v.heat[id] = (v.heat[id] || 0) + 1;
          var nm = '';
          try { nm = this.displayName(id); } catch (e) { nm = 'Someone'; }
          this.say(`${nm} doesn't say much lately. Doesn't have to — people are starting to look at them when decisions get made.`);
          if ((v.heat[id] || 0) >= 3 && !v.challenge) {
            v.challenge = { cid: id, task: 'forage', age: 0 };
            this.say(`${nm} steps closer. "We need to talk. About who's actually running things here."`);
          }
        }
      }
    },

    // ---------- 4. TEACHING: what they learned out there ----------
    // Explorers come back with knowledge the player can ask for. Earned,
    // specific, through conversation — never passive.
    npcFieldLessons(vid) {
      var st = this.agencyState();
      var lessons = [];
      var t = st.teachable[vid] || [];
      if (t.length) lessons.push({ topic: 'plants', n: t.length });
      var k = (st.know[vid] || {});
      if ((k.monsters || 0) >= 2) lessons.push({ topic: 'monsters', n: k.monsters });
      if ((k.places || []).length) lessons.push({ topic: 'places', n: k.places.length });
      var v = this.state.village;
      if (v.explorerNews && v.explorerNews[vid]) lessons.push({ topic: 'expedition', n: 1 });
      return lessons;
    },
    agencyChoices(vid) {
      try {
        var lessons = this.npcFieldLessons(vid);
        if (!lessons.length) return [];
        var v = this.state.village;
        if (v.explorerNews && v.explorerNews[vid] && v.explorerNews[vid].agency) {
          return [{ id: 'agency:ask_expedition', label: '"What did you see out there?"' }];
        }
        return [{ id: 'agency:ask_field', label: '"Teach me something from the wild."' }];
      } catch (e) { return []; }
    },
    agencyTurn(vid, choiceId) {
      var st = this.agencyState();
      var nm = '';
      try { nm = this.displayName(vid).split(' ')[0]; } catch (e) { nm = 'They'; }
      if (choiceId === 'agency:ask_expedition' || choiceId === 'agency:ask_field') {
        var v = this.state.village;
        var k = st.know[vid] || { plants: 0, monsters: 0, places: [] };
        var lines = [];
        if ((k.places || []).length) lines.push(`"${k.places[k.places.length - 1]} — I'll show you on the map sometime. It's real."`);
        if ((k.monsters || 0) >= 2) lines.push(`"Saw things with too many joints. Give them room. That's the whole lesson."`);
        if ((k.plants || 0) >= 3) {
          lines.push(`"The bitter greens by the creek — boil them twice. First water's a liar."`);
          // real teaching: one plant identification, earned through their ranging
          try { this.agencyTeachPlant(vid); } catch (e) {}
        }
        if (!lines.length) lines.push('"Weather. Mostly weather. Ask me again when I\'ve been farther."');
        if (v.explorerNews) delete v.explorerNews[vid];
        try { this.bumpTrust(vid, 2); } catch (e) {}
        try { this.recordDeed(vid, 'taught', `${nm} taught you something from the wild.`, 1); } catch (e) {}
        return { line: pick(lines), choices: this.convoChoices(vid), ended: false };
      }
      return null;
    },
    agencyTeachPlant(vid) {
      // an explorer teaches you one plant they actually learned. Concrete,
      // from the data pool, only if you don't know it yet.
      var plants = this.data.plants || [];
      var cx = this.state.codex || {};
      cx.plants = cx.plants || {};
      var cands = plants.filter(function (p) { return p && p.id && !((cx.plants[p.id] || {}).level >= 1); });
      if (!cands.length) return;
      var p = pick(cands);
      cx.plants[p.id] = { level: 1, source: 'taught' };
      var nm = '';
      try { nm = this.displayName(vid).split(' ')[0]; } catch (e) { nm = 'They'; }
      this.say(`📖 ${nm} shows you ${p.name || 'a plant'} — leaf, stem, smell. You won't forget it now. (Codex: ${p.name || 'plant'} identified.)`);
    },

    // ---------- 5. HIGH-POTENTIAL SEEDS ----------
    // A few villagers per game are talented, hardworking, clever — hidden.
    // Never displayed. Visible only through deeds. Given room, they become
    // someone. Watching it happen is the point.
    seedPotential(ids) {
      if (!ids || !ids.length) return;
      var kinds = ['talented', 'hardworking', 'clever'];
      var shuffled = ids.slice();
      for (var i = shuffled.length - 1; i > 0; i--) {
        var j = Math.floor(R() * (i + 1));
        var t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
      }
      var n = Math.min(3, shuffled.length);
      var seeds = [];
      for (var k = 0; k < n; k++) seeds.push({ id: shuffled[k], kind: kinds[k % kinds.length] });
      this._pendingPotential = seeds;
    },
  };

  Object.assign(G, methods);

  // ============ WRAPS (chain-safe) ============
  (function attach() {
    // after the base away-system runs each day-part, run the agency sim
    var _nnt = G.npcNodeTravel;
    G.npcNodeTravel = function () {
      if (_nnt) _nnt.call(this);
      try { this.agencyTick(); } catch (e) {}
    };
    // plant the hidden seeds at roster generation
    var _genRoster = G.genRoster;
    G.genRoster = function (origin) {
      var chars = _genRoster ? _genRoster.call(this, origin) : [];
      try {
        var ids = (chars || []).map(function (c) { return c.id; }).filter(Boolean);
        this.seedPotential(ids);
      } catch (e) {}
      return chars;
    };
    // the mantle: deeds earn trust, so the village's choice of successor
    // naturally favors the explorer who became someone. Permanent, small,
    // honest — the village remembers what you did.
    var _pd = G.playerDeath;
    G.playerDeath = function (cause) {
      try {
        var v = this.state.village;
        v.trust = v.trust || {};
        var roster = v.roster || [];
        for (var i = 0; i < roster.length; i++) {
          var id = roster[i];
          if (id === this.villagerId) continue;
          var bonus = Math.min(12, Math.floor(this.agencyScore(id) / 4));
          if (bonus > 0) v.trust[id] = Math.min(100, (v.trust[id] || 0) + bonus);
        }
      } catch (e) {}
      return _pd ? _pd.call(this, cause) : undefined;
    };
    // conversation: ask about the wild
    var _convoChoices = G.convoChoices;
    G.convoChoices = function (vid) {
      var base = _convoChoices ? _convoChoices.call(this, vid) : [];
      try {
        var extra = this.agencyChoices(vid);
        if (extra && extra.length) return extra.concat(base);
      } catch (e) {}
      return base;
    };
    var _convoTurn = G.convoTurn;
    G.convoTurn = function (vid, choiceId) {
      try {
        if (typeof choiceId === 'string' && choiceId.indexOf('agency:') === 0) {
          var r = this.agencyTurn(vid, choiceId);
          if (r) return r;
        }
      } catch (e) {}
      return _convoTurn ? _convoTurn.call(this, vid, choiceId) : undefined;
    };
  })();
})();
