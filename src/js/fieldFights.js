// @ontology
// system: field-fights
// description: Off-screen blow-by-blow fights for villager-vs-monster meetings. Real rounds, real stats, the monster's real attack data — never an outcome table. (Steve 2026-10-08: "It should be a fight. A hard one.")
// provides:
//   - fieldFight(vid, mdef, m, opts)
// rules:
//   - rounds: initiative by speed each round; the monster acts with its real attack data (name, damage range, pattern, pack, thrash); the villager strikes with the tactical formula roll([4+wb, 8+wb]), wb = round(wbonus/2). (code: fieldFight)
//   - morale: flee is driven by wounds + bravery + temperament, never a flat roll. (code: fieldFight)
//   - hard: an average villager vs a real monster usually gets hurt, driven off, or killed. (code: fieldFight)
//   - record: every fight returns rounds, wounds both ways, and outcome — feeds deeds, gossip, scars. (code: fieldFight)
//   - cheap: round cap 15, no grid, no UI. (code: fieldFight)
//   - awareness: the pre-fight evade check ("saw it, gave it room") decides contact, not outcome. (code: fieldFight)
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
 * - No armor modeling: the tactical engine's own villager strikes apply
 *   raw rolls; this matches.
 * - No grid/telegraphs: off-screen fights have no squares to dodge on.
 *   Pattern type flavors the record text, not the math.
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
    //   outcome: 'evade' | 'vKill' | 'mFlee' | 'vFlee' | 'vDie' | 'standoff'
    fieldFight: function (vid, mdef, m, opts) {
      opts = opts || {};
      mdef = mdef || {};
      var rec = {
        outcome: null, rounds: 0, vTaken: 0, mDealt: 0,
        vHpLeft: 0, mHpLeft: 0, packCount: 1, log: [],
      };
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
      var bravery = 0, temper = 'steady', potential = false, wb = 0;
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
        if (S.equipment && S.equipment.weaponBonusOf)
          wb = Math.round((S.equipment.weaponBonusOf(vp, this.data.items) || 0) / 2);
      } catch (e) {}

      // ---- monster stats (real) ----
      var hpDef = mdef.hp || [20, 20];
      var members = [];
      for (var pi = 0; pi < packN; pi++) {
        var php = (m && pi === 0 && m.hp !== undefined && m.hp !== null) ? m.hp : roll(hpDef);
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
        if (R() < evade) {
          rec.outcome = 'evade';
          rec.vHpLeft = vHp; rec.mHpLeft = members[0].hp;
          rec.log.push(vName + ' saw the ' + mName + ' in time and gave it room.');
          return rec;
        }
        rec.log.push(vName + ' walks straight into the ' + mName + '. No avoiding it.');
      }

      // ---- rounds ----
      var vBreak = clamp(0.5 - Math.min(0.3, bravery * 0.015) - (temper === 'bold' ? 0.1 : 0) + (temper === 'cautious' ? 0.1 : 0), 0.15, 0.6);
      for (var round = 1; round <= MAX_ROUNDS; round++) {
        rec.rounds = round;
        var mInit = mSpeed + R() * 2, vInit = 3 + R() * 2;
        var mFirst = mInit >= vInit;
        var acted = [mFirst ? 'm' : 'v', mFirst ? 'v' : 'm'];
        for (var ai = 0; ai < 2; ai++) {
          if (acted[ai] === 'm') {
            // every live pack member acts — pack hunters hunt as a pack
            for (var mi = 0; mi < members.length; mi++) {
              if (members[mi].hp <= 0 || !vAlive) continue;
              var d = roll(dmgRange);
              // HIGHBEAM (verbatim behavior): the antlers thrash anyone
              // adjacent IN ADDITION to the beam. Closing in has a price.
              var thrash = 0;
              if (mdef.id === 'gallowdeer') thrash = roll([10, 16]);
              var total = d + thrash;
              vHp -= total; rec.vTaken += total;
              rec.log.push('R' + round + ': ' + atkName + ' hits ' + vName + ' for ' + total + ' (' + Math.max(0, vHp) + ' left)');
            }
          } else {
            if (!vAlive) continue;
            var lead = null;
            for (var li = 0; li < members.length; li++) { if (members[li].hp > 0) { lead = members[li]; break; } }
            if (!lead) break;
            var vd = roll([4 + wb, 8 + wb]); // tactical formula, verbatim
            lead.hp -= vd; rec.mDealt += vd;
            if (lead.hp <= 0) lead.alive = false;
            rec.log.push('R' + round + ': ' + vName + ' strikes for ' + vd + ' (' + Math.max(0, lead.hp) + ' left)');
          }
        }
        // ---- morale: wounds drive it, never a flat roll ----
        if (vHp <= 0) { vAlive = false; rec.outcome = 'vDie'; break; }
        if ((vHp / vHpMax) < vBreak) { rec.outcome = 'vFlee'; break; }
        var leadAlive = null;
        for (var lj = 0; lj < members.length; lj++) { if (members[lj].hp > 0) { leadAlive = members[lj]; break; } }
        if (!leadAlive) {
          // lead down: broken coordination — the pack's documented weakness
          rec.outcome = 'vKill';
          for (var mj = 0; mj < members.length; mj++) { members[mj].hp = 0; members[mj].alive = false; }
          break;
        }
        if ((leadAlive.hp / leadAlive.maxHp) < mBreak) { rec.outcome = 'mFlee'; break; }
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
      return rec;
    },

    // fieldFightSummary(rec, vName, mName) -> one honest sentence for gossip/news
    fieldFightSummary: function (rec, vName, mName) {
      var r = rec.rounds;
      if (rec.outcome === 'vKill')
        return vName + ' killed the ' + mName + ' alone — ' + r + ' rounds, ' + rec.vTaken + ' taken. Word travels fast.';
      if (rec.outcome === 'mFlee')
        return vName + ' stood down the ' + mName + ' and kept walking — ' + r + ' rounds, bloodied but breathing.';
      if (rec.outcome === 'vFlee' || rec.outcome === 'standoff')
        return 'The ' + mName + ' mauled ' + vName + ' (-' + rec.vTaken + ' health) over ' + r + ' rounds. They\'re lucky to be breathing.';
      if (rec.outcome === 'vDie')
        return 'The ' + mName + ' killed ' + vName + ' in ' + r + ' rounds. The village mourns.';
      return vName + ' met the ' + mName + ' and walked away from it.';
    },
  };
  Object.assign(G, methods);
})(typeof window !== 'undefined' ? window : global);
