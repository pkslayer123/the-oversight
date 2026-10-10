// @ontology
// system: field-fights
// description: Off-screen blow-by-blow fights for villager-vs-monster meetings. Real rounds, real stats, the monster's real attack data — never an outcome table. (Steve 2026-10-08: "It should be a fight. A hard one.")
// provides:
//   - fieldFight(vid, mdef, m, opts)
// rules:
//   - rounds: initiative by speed each round; the monster acts with its real attack data (name, damage range, pattern, pack, thrash); the villager strikes with the tactical formula roll([4+wb, 8+wb]), wb = round(wbonus/2). (code: fieldFight)
//   - morale: flee is driven by wounds + bravery + temperament, never a flat roll. (code: fieldFight)
//   - pack: the lead IS the world-monster entity (members[0]) — wound it and the pack breaks, kill it and the pack dies/scatters with it; members never promote. (code: fieldFight)
//   - hard: an average villager vs a real monster usually gets hurt, driven off, or killed. (code: fieldFight)
//   - record: every fight returns rounds, wounds both ways, and outcome — feeds deeds, gossip, scars. (code: fieldFight)
//   - cheap: round cap 15, no grid, no UI. (code: fieldFight)
//   - alreadyDead: a world-monster entity with hp<=0 is a corpse, not a fight — early exit, no rewards. (code: fieldFight)
//   - awareness: the pre-fight evade check ("saw it, gave it room") decides contact, not outcome. (code: fieldFight)
//   - determinism: opts.rng supplies every random draw (the contest engine's seeded resolution stream) — without it, Math.random/combat.roll exactly as before; the live path is untouched. (code: fieldFight, break-it 2026-10-08)
//   - gear: the villager re-equips at fight entry (villagerGearUp, acquire=false — deterministic, no mid-fight crafting) and strikes with the tactical formula; equipped armor absorbs via diminishing returns (r = P/(P+20); absorb = round(hit*r), at least 1 gets through) — mirroring the tactical engine, never full immunity. (code: fieldFight, 2026-10-09)
// consumes:
//   - Scattering.combat.roll
//   - village health, agency xp, equipment, monsters data
/* FIELD FIGHTS — src/js/fieldFights.js
 *
 * Steve (2026-10-08): "Why are you treating monster encounters like rng?
 * It should be a fight. A hard one." Villager-vs-monster meetings are not
 * outcome tables — not flat, not stat-weighted. They are blow-by-blow
 * fights with real stats and the monster's real behaviors, resolved
 * off-screen in ticks.
 *
 * What "real" means here:
 * - The monster acts with its REAL attack data from monsters.json: name,
 *   damage range, pattern, speed, pack, wave. The Highbeam Deer's antler
 *   thrash (roll([10,16]), every turn, in addition to the beam) is ported
 *   verbatim from tbAntlerThrash — closing in has a price here too.
 * - The villager strikes with the TACTICAL formula, verbatim:
 *   roll([4+wb, 8+wb]), wb = round(wbonus/2) ("helpers, not heroes").
 * - Initiative is speed vs speed every round (monster mdef.speed vs the
 *   villager's tactical speed 3).
 * - Fleeing is morale, not dice: wounds taken vs bravery XP and
 *   temperament. Monsters break too — wound the lead and the pack's
 *   coordination breaks (their documented weakness).
 *
 * Deliberate scope boundaries (documented, not oversights):
 * - No grid/telegraphs: off-screen fights have no squares to dodge on.
 *   Pattern type flavors the record text, not the math.
 * (2026-10-09: the old "no armor modeling" boundary is gone — villagers
 * wear armor now, and the fight respects it with the tactical engine's
 * own flat reduction.)
 * - Pack members beyond the lead are ephemeral: the world-monster entity
 *   persists the lead's wounds; the pack scatters or dies with it.
 *
 * Every fight returns a record: rounds, wounds both ways, outcome, and a
 * short log. Callers feed it to deeds, gossip, scars, corpses. No silent
 * outcomes.
 *
 * Self-attaching module. Load after villager-agency.js (uses agency xp).
 * Chain-safe: all Game methods are called via this.* at fight time.
 */
(function (_g) {
  'use strict';
  var G = (_g.Scattering && _g.Scattering.Game) ? _g.Scattering.Game : null;
  if (!G) return;
  var R = Math.random;
  var roll = function (range) {
    try {
      if (_g.Scattering && _g.Scattering.combat && _g.Scattering.combat.roll)
        return _g.Scattering.combat.roll(range);
    } catch (e) {}
    return range[0] + Math.floor(R() * (range[1] - range[0] + 1));
  };
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };

  var MAX_ROUNDS = 15;

  var methods = {
    // fieldFight(vid, mdef, m, opts) -> record
    //   vid: villager id. mdef: monster definition (monsters.json).
    //   m: world-monster entity or null (ephemeral meeting). Wounds persist
    //      onto m.hp when the monster lives.
    //   opts.awareness: run the pre-fight evade check ("saw it, gave it
    //      room"). Decides CONTACT, not outcome.
    // Returns: { outcome, rounds, vTaken, mDealt, vHpLeft, mHpLeft,
    //   packCount, log[] }
    //   outcome: 'evade' | 'vKill' | 'mFlee' | 'vFlee' | 'vDie'
    fieldFight: function (vid, mdef, m, opts) {
      opts = opts || {};
      mdef = mdef || {};
      // DETERMINISM (contest engine, break-it 2026-10-08): off-screen
      // contest resolution must be deterministic (same state -> same fate,
      // no hidden rolls, no save-scum). opts.rng supplies EVERY random draw
      // in the fight; without it the live path is untouched (module R /
      // combat.roll, i.e. Math.random, exactly as before).
      var RR = opts.rng || R;
      var lroll = opts.rng ? function (range) { return range[0] + Math.floor(RR() * (range[1] - range[0] + 1)); } : roll;
      var rec = {
        outcome: null, rounds: 0, vTaken: 0, mDealt: 0,
        vHpLeft: 0, mHpLeft: 0, packCount: 1, log: [],
        allyDealt: 0, calledHelp: false, fleeHopeless: null, fleeHpFrac: null,
        everWinning: false, everHopeless: false, minHpFrac: 1,
      };
      // GEAR-UP (Steve 2026-10-09): re-equip only, never acquisition — a
      // fighter doesn't whittle a spear mid-fight. Deterministic (autoEquip
      // has no RNG), so seeded contest fights stay deterministic.
      try { if (this.villagerGearUp) this.villagerGearUp(vid, false); } catch (e) {}
      var atk = mdef.attack || {};
      var dmgRange = (atk.damage && atk.damage.length === 2) ? atk.damage : [6, 10];
      var atkName = atk.name || 'attack';
      var mSpeed = mdef.speed || 3;
      var wave = mdef.wave || 1;
      var packN = Math.max(1, mdef.pack || 1);

      // ---- villager stats (real) ----
      var vv = this.state.village || {};
      var vHpMax = 100;
      var vHp = (vv.health && vv.health[vid] !== undefined) ? vv.health[vid] : 100;
      if (vHp > vHpMax) vHpMax = vHp;
      var bravery = 0, temper = 'steady', potential = false, wb = 0, varmor = 0;
      try { bravery = (((this.agencyOf(vid) || {}).xp || {})[vid] || {}).bravery || 0; } catch (e) {}
      // CONTESTS (Steve 2026-10-08): the crowd's roar steadies the arm —
      // watcher's cheer arrives as real bravery, not win-odds.
      try { if (opts.braveryBonus) bravery += opts.braveryBonus; } catch (e) {}
      try { temper = this.npcTemper(vid) || 'steady'; } catch (e) {}
      try { potential = !!((this.agencyState() || {}).potential || {})[vid]; } catch (e) {}
      try {
        var S = _g.S || ((_g.Scattering || {}).S) || {};
        var vp = ((this.data.villagers || []).find(function (x) { return x.id === vid; }) ||
                  (this.data.background_survivors || []).find(function (x) { return x.id === vid; })) || {};
        // RANGED COUNTS (2026-10-09): off-screen fights have no grid, so
        // range is meaningless — a spear is a spear. Melee + ranged both
        // contribute, halved like the tactical engine's "helpers, not heroes"
        // rule (wb = round((melee+ranged)/2)). threatLevel sums the two
        // WITHOUT halving — that's a threat rating, not a damage formula.
        if (S.equipment && S.equipment.weaponBonusOf)
          wb = Math.round(((S.equipment.weaponBonusOf(vp, this.data.items, 'melee') || 0) +
                           (S.equipment.weaponBonusOf(vp, this.data.items, 'ranged') || 0)) / 2);
        // ARMOR (Steve 2026-10-09): equipped armor absorbs, mirroring the
        // tactical engine's diminishing-returns curve (r = P/(P+20)).
        // Villagers wear armor now — the fight must respect it.
        if (S.equipment && S.equipment.armorOf)
          varmor = S.equipment.armorOf(vp, this.data.items) || 0;
      } catch (e) {}

      // ---- monster stats (real) ----
      var hpDef = mdef.hp || [20, 20];
      var members = [];
      for (var pi = 0; pi < packN; pi++) {
        var php = (m && pi === 0 && m.hp !== undefined && m.hp !== null) ? m.hp : lroll(hpDef);
        var pmax = (m && pi === 0 && m.maxHp) ? m.maxHp : Math.max(php, hpDef[1] || hpDef[0]);
        members.push({ hp: php, maxHp: pmax, alive: php > 0 });
      }
      rec.packCount = packN;
      var mBreak = wave >= 2 ? 0.15 : 0.25; // nastier things hold longer

      var vAlive = vHp > 0;
      var mName = 'something';
      try { mName = this.monsterNoun ? this.monsterNoun(mdef.id) : (mdef.id || 'something'); } catch (e) {}
      var vName = 'Someone';
      try { vName = this.displayName ? this.displayName(vid).split(' ')[0] : 'Someone'; } catch (e) {}

      // ALREADY DEAD (break-it combat 2026-10-09): a world-monster entity
      // with hp<=0 is a corpse, not a fight. Reachable: a vFlee round can
      // coincide with the lead falling, so the world keeps a 0-hp monster.
      // Without this, the next encounter "killed" it again — full cheer,
      // +trust, and a hero deed for beating a body. No rewards for a corpse.
      if (m && m.hp !== undefined && m.hp !== null && m.hp <= 0) {
        rec.outcome = 'alreadyDead';
        rec.rounds = 0; rec.vTaken = 0; rec.mDealt = 0;
        rec.vHpLeft = vHp; rec.mHpLeft = 0;
        rec.log.push(vName + ' finds the ' + mName + ' already dead — nothing to fight.');
        return rec;
      }

      // ---- awareness: contact check, not outcome ----
      // REAL inputs, not a flat roll: the villager's tracking XP (paying
      // attention) vs the monster's stealth profile (behavior, speed,
      // notice range, size). A hushwolf (pack, fast, long notice range)
      // is nearly impossible to spot first — the silence is the weapon.
      // A bulldozer (territorial, big, loud) is often heard coming.
      if (opts.awareness) {
        var tracking = 0;
        try { tracking = (((this.agencyOf(vid) || {}).xp || {})[vid] || {}).tracking || 0; } catch (e) {}
        var mBehavior = mdef.behavior || 'territorial';
        var behaviorMod = { ambush: -0.15, pack: -0.10, swarm: -0.05, snake: -0.05,
          territorial: 0.05, curious: 0.05, drifter: 0.10 }[mBehavior];
        if (behaviorMod === undefined) behaviorMod = 0;
        var mNotice = (mdef.encounter && mdef.encounter.noticeRange) || 5;
        var mSize = mdef.size || 1;
        var evade = 0.35 + Math.min(0.30, tracking * 0.01) + behaviorMod
          - 0.02 * mSpeed - 0.03 * mNotice + 0.05 * mSize
          + (potential ? 0.05 : 0);
        evade = clamp(evade, 0.05, 0.90);
        if (RR() < evade) {
          rec.outcome = 'evade';
          rec.vHpLeft = vHp; rec.mHpLeft = members[0].hp;
          rec.log.push(vName + ' saw the ' + mName + ' in time and gave it room.');
          return rec;
        }
        rec.log.push(vName + ' walks straight into the ' + mName + '. No avoiding it.');
      }

      // ---- rounds ----
      // RISK TOLERANCE (Steve 2026-10-09): flee is a SITUATIONAL decision, not
      // a flat HP line. "Maybe die today or definitely die tomorrow" — after
      // day 7 the System taught them the waves only get harder, so they hold
      // longer. Armed villagers trust their gear; allies nearby steady them.
      // Nobody's damage or stats change — hand to hand is supposed to be hard.
      // Death packs are just where gear logically ends up, never a goal.
      var vBreak = clamp(0.5 - Math.min(0.3, bravery * 0.015) - (temper === 'bold' ? 0.1 : 0) + (temper === 'cautious' ? 0.1 : 0), 0.15, 0.6);
      var holdBonus = 0;
      if (wb > 0) holdBonus += 0.08;                        // armed: trust the gear
      var allies = Math.max(0, opts.allies || 0);
      var allyVids = (opts.allyVids || []).slice(0, 2);
      holdBonus += Math.min(0.12, allies * 0.04);            // allies nearby steady them
      var day = 0;
      try { day = (this.state.scholar || {}).day || 0; } catch (e) {}
      if (day >= 7) holdBonus += 0.08;                       // post-System desperation
      vBreak = clamp(vBreak - holdBonus, 0.05, 0.6);
      // PARTY-UP (Steve 2026-10-09): when the trajectory turns hopeless and
      // help is near, they shout instead of scattering. One ally answers per
      // fight — a second pair of hands, off-balance, exposed (no armor).
      var helpCalled = false, allyIn = false, allyHp = 0;
      var allyMax = 70, allyVid = null, allyName = 'Someone';
      for (var round = 1; round <= MAX_ROUNDS; round++) {
        rec.rounds = round;
        var mInit = mSpeed + RR() * 2, vInit = 3 + RR() * 2;
        var mFirst = mInit >= vInit;
        var acted = [mFirst ? 'm' : 'v', mFirst ? 'v' : 'm'];
        for (var ai = 0; ai < 2; ai++) {
          if (acted[ai] === 'm') {
            // every live pack member acts — pack hunters hunt as a pack
            for (var mi = 0; mi < members.length; mi++) {
              if (members[mi].hp <= 0 || !vAlive) continue;
              var d = lroll(dmgRange);
              // HIGHBEAM (verbatim behavior): the antlers thrash anyone
              // adjacent IN ADDITION to the beam. Closing in has a price.
              var thrash = 0;
              if (mdef.id === 'gallowdeer') thrash = lroll([10, 16]);
              var total = d + thrash;
              // PARTY-UP: the pack splits its attention — the ally who rushed
              // in is exposed (no armor) and draws some of the hits.
              var hittingAlly = allyIn && allyHp > 0 && RR() < 0.4;
              if (!hittingAlly && varmor > 0 && total > 0) {
                // ARMOR (Steve 2026-10-09): diminishing-returns curve,
                // mirroring the tactical engine — every point of protection
                // matters, full immunity unreachable, at least 1 lands.
                // Same pierce hook (mdef.pierce, 0 = none).
                var pierce = 0;
                try { pierce = (mdef && mdef.pierce) || 0; } catch (e) {}
                var effP = varmor * (1 - Math.min(0.9, Math.max(0, pierce)));
                var r = effP / (effP + 20);
                var absorbed = Math.min(total - 1, Math.round(total * r));
                total = total - absorbed;
                rec.log.push(vName + "'s gear absorbs " + absorbed + '.');
              }
              if (hittingAlly) {
                allyHp -= total;
                rec.log.push('R' + round + ': ' + atkName + ' hits ' + allyName + ' for ' + total + ' (' + Math.max(0, allyHp) + ' left)');
                if (allyHp <= 0) {
                  allyIn = false;
                  rec.log.push(allyName + ' goes down!');
                  try { if (allyVid && this.hurtVillager) this.hurtVillager(allyVid, 30, 'monster'); } catch (e) {}
                }
              } else {
                vHp -= total; rec.vTaken += total;
                rec.log.push('R' + round + ': ' + atkName + ' hits ' + vName + ' for ' + total + ' (' + Math.max(0, vHp) + ' left)');
              }
            }
          } else {
            if (!vAlive) continue;
            var lead = null;
            for (var li = 0; li < members.length; li++) { if (members[li].hp > 0) { lead = members[li]; break; } }
            if (!lead) break;
            var vd = lroll([4 + wb, 8 + wb]); // tactical formula, verbatim
            lead.hp -= vd; rec.mDealt += vd;
            if (lead.hp <= 0) lead.alive = false;
            rec.log.push('R' + round + ': ' + vName + ' strikes for ' + vd + ' (' + Math.max(0, lead.hp) + ' left)');
            // the ally fights too — a second pair of hands, off-balance from
            // rushing in. A new combatant, not a buff to anyone's stats.
            if (allyIn && allyHp > 0 && lead.hp > 0) {
              var ad = lroll([3, 6]);
              lead.hp -= ad; rec.mDealt += ad; rec.allyDealt += ad;
              if (lead.hp <= 0) lead.alive = false;
              rec.log.push('R' + round + ': ' + allyName + ' strikes for ' + ad + ' (' + Math.max(0, lead.hp) + ' left)');
            }
          }
        }
        // ---- morale: situational, never a flat roll ----
        if (vHp <= 0) { vAlive = false; rec.outcome = 'vDie'; break; }
        if (vHp / vHpMax < rec.minHpFrac) rec.minHpFrac = vHp / vHpMax;
        // SITUATIONAL MORALE (Steve 2026-10-09): after a couple of rounds the
        // trajectory is legible. Winning -> commit (only the floor breaks
        // them). Hopeless and alone -> believable flight. Hopeless with help
        // near -> shout instead of scattering.
        var fleeAt = vBreak, hopeless = false, winning = false;
        if (round >= 2) {
          var mlead = null;
          for (var lj = 0; lj < members.length; lj++) { if (members[lj].hp > 0) { mlead = members[lj]; break; } }
          if (mlead) {
            var vDpr = rec.mDealt / round, mDpr = rec.vTaken / round;
            var rtk = mlead.hp / Math.max(1, vDpr);  // rounds to drop the lead
            var rtd = vHp / Math.max(1, mDpr);       // rounds until the villager drops
            hopeless = rtd < rtk * 0.6;              // drops long before the lead falls
            winning = rtk <= rtd * 1.1;              // drops the lead first (or trades)
            if (winning) rec.everWinning = true;
            if (hopeless) rec.everHopeless = true;
          }
        }
        if (winning) {
          fleeAt = 0.05;
        } else if (hopeless && !helpCalled && allies > 0 && allyVids.length) {
          helpCalled = true; allyIn = true; allyHp = allyMax;
          allyVid = allyVids.shift(); allies--;
          try { allyName = (this.displayName ? this.displayName(allyVid).split(' ')[0] : 'Someone'); } catch (e) {}
          rec.calledHelp = true;
          rec.log.push(vName + ' is losing — shouts for help! ' + allyName + ' charges in!');
          try { if (this.bumpTrust) this.bumpTrust(allyVid, 1); } catch (e) {}
        } else if (hopeless && helpCalled && !allyIn) {
          // help came and went down — now it's truly hopeless
          rec.outcome = 'vFlee'; rec.fleeHopeless = true; rec.fleeHpFrac = vHp / vHpMax; break;
        }
        if ((vHp / vHpMax) < fleeAt) { rec.outcome = 'vFlee'; rec.fleeHopeless = hopeless; rec.fleeHpFrac = vHp / vHpMax; break; }
        // THE LEAD FALLS: the pack coordinates through the lead animal —
        // the world-monster entity IS members[0]. Wound it below the break
        // line and the pack breaks (mFlee); kill it and the pack dies or
        // scatters with it — members never promote to a second lead.
        // (Tactical-engine parity: "without the lead, the pack melts away";
        // data: hushwolf weakness "broken coordination (wound the lead)".)
        if (members[0].hp <= 0) {
          rec.outcome = 'vKill';
          for (var mj = 0; mj < members.length; mj++) { members[mj].hp = 0; members[mj].alive = false; }
          rec.log.push('The lead falls — the pack\'s coordination shatters. The rest scatter or die.');
          break;
        }
        if ((members[0].hp / members[0].maxHp) < mBreak) { rec.outcome = 'mFlee'; break; }
      }
      if (!rec.outcome) {
        // round cap: the worse-off side disengages
        var vFrac = vHp / vHpMax, mFrac = members[0].hp / members[0].maxHp;
        rec.outcome = (vFrac <= mFrac) ? 'vFlee' : 'mFlee';
        rec.log.push('Neither gives after ' + MAX_ROUNDS + ' rounds — the worse-off side disengages.');
      }

      rec.vHpLeft = Math.max(0, vHp);
      rec.mHpLeft = Math.max(0, members[0].hp);
      // wounds persist onto the world entity — part of the world, not RNG
      try { if (m && rec.outcome !== 'vKill') m.hp = rec.mHpLeft; } catch (e) {}
      // VILLAGER XP (Steve 2026-10-09): fighting teaches. Kills teach double.
      // (vDie earns nothing -- the dead are done learning.)
      try {
        if (vid && vid !== 'player' && this.villagerGainXP) {
          if (rec.outcome === 'vKill') this.villagerGainXP(vid, 'combat', 2, 'monster kill');
          else if (rec.outcome === 'vFlee' || rec.outcome === 'mFlee') this.villagerGainXP(vid, 'combat', 1, 'survived a fight');
          else if (rec.outcome === 'evade') this.villagerGainXP(vid, 'field', 1, 'read the signs');
        }
      } catch (e) {}
      return rec;
    },

    // fieldFightSummary(rec, vName, mName) -> one honest sentence for gossip/news
    fieldFightSummary: function (rec, vName, mName) {
      var r = rec.rounds;
      if (rec.outcome === 'alreadyDead')
        return 'The ' + mName + ' was already dead when ' + vName + ' found it — old news, not a kill.';
      if (rec.outcome === 'vKill')
        return vName + ' killed the ' + mName + ' alone — ' + r + ' rounds, ' + rec.vTaken + ' taken. Word travels fast.';
      if (rec.outcome === 'mFlee')
        return vName + ' stood down the ' + mName + ' and kept walking — ' + r + ' rounds, bloodied but breathing.';
      if (rec.outcome === 'vFlee')
        return 'The ' + mName + ' mauled ' + vName + ' (-' + rec.vTaken + ' health) over ' + r + ' rounds. They\'re lucky to be breathing.';
      if (rec.outcome === 'vDie')
        return 'The ' + mName + ' killed ' + vName + ' in ' + r + ' rounds. The village mourns.';
      return vName + ' met the ' + mName + ' and walked away from it.';
    },
  };
  Object.assign(G, methods);
})(typeof window !== 'undefined' ? window : global);
