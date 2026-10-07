// @ontology
// system: villager-agency
// description: Villager AI. Villagers act on their own with goals, routines, and grid-visible daily rhythms.
// provides:
//   - agencyState(vid)
//   - agencyTick()
//   - agencyOf(vid)
//   - agencyScore(vid)
//   - recordDeed(vid, deed)
//   - startExpedition(vid)
//   - agencyDaylifeTick()
//   - daylifeOf(vid)
//   - daylifeLine(vid)
//   - daylifeWeight(vid, id, ctx)
//   - daylifePersonalityMult(vid, id)
//   - daylifeSignature(vid)
//   - villagerTileBadge(vid)
// rules:
//   - (daylife) at-Haven villagers get one activity per day-part, weighted by temperament, goal, occupation, age, needs, and village state (code: villager-agency.js)
//   - (daylife) grid positions nudge one cell per part, never onto the player, another villager, or a blocking cell (code: villager-agency.js)
//   - (daylife) the observed activity line prefixes the person sheet via the personActivityLine wrap; names stay knowledge-gated through displayName (code: villager-agency.js)
//   - (daylife) downtime is scheduled: ~28% of part transitions become breathers instead of new jobs (code: villager-agency.js)
// consumes:
//   - village.pantry (pantryKcalLive)
//   - scholar.dayPart
//   - genDetail()
//   - cellProps()
//   - dominantNeed()
//   - registerDeath()
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
 * 5. DAYLIFE — grid-visible daily rhythms. Once per day-part, every at-Haven
 *    villager gets an activity (fire-tending, mending, cooking, watching,
 *    resting, mourning...) derived from temperament, goal, occupation, age,
 *    needs, and village state. Positions nudge on the 9x9 grid, the person
 *    sheet shows what they're doing, downtime is scheduled in. Never blocks.
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

  // DAYLIFE_ACTS: the visible daily rhythms. parts = weight per day-part
  // [dawn, midday, dusk, night]. anchor = grid landmark to drift toward
  // ('fire' | 'hall' | 'water' | 'edge' | 'any'). line = observed present-tense
  // for the person sheet. say = rare ambient line when the player is at Haven.
  var DAYLIFE_ACTS = {
    // --- dawn ---
    rekindle_fire: { e: '🔥', parts: [4, 0, 0, 0], anchor: 'fire',
      line: function (P) { return P.They + ' ' + P.are + ' coaxing the fire back to life, breath slow and steady.'; },
      say: ['pokes the fire awake, not saying much yet.'] },
    quiet_hour: { e: '🌅', parts: [3, 0, 0, 0], anchor: 'edge',
      line: function (P) { return P.They + ' ' + P.are + ' sitting apart, watching the light come up.'; },
      say: ['watches the sun come up, alone with it.'] },
    early_forage: { e: '🌿', parts: [2, 1, 0, 0], anchor: 'edge',
      line: function (P) { return P.They + ' ' + P.are + ' already at the treeline, basket in hand.'; },
      say: ['heads for the treeline while the dew is still on.'] },
    // --- midday ---
    forage_near: { e: '🌿', parts: [0, 4, 2, 0], anchor: 'edge',
      line: function (P) { return P.They + ' ' + P.are + ' working the near patches, bending and straightening.'; },
      say: ['works the near patches, steady as rain.'] },
    mend_gear: { e: '🧵', parts: [0, 3, 2, 0], anchor: 'any',
      line: function (P) { return P.They + ' ' + P.are + ' mending straps and cordage, fingers quick.'; },
      say: function (P) { return 'mends gear, humming under ' + P.their + ' breath.'; } },
    cook_meal: { e: '🍲', parts: [1, 3, 0, 0], anchor: 'fire',
      line: function (P) { return P.They + ' ' + P.are + ' cooking, tasting, adjusting — the pot smells like survival.'; },
      say: function (P) { return 'tends the cookpot like it owes ' + P.them + ' money.'; } },
    chop_wood: { e: '🪓', parts: [0, 3, 1, 0], anchor: 'edge',
      line: function (P) { return P.They + ' ' + P.are + ' splitting wood, each swing landing true.'; },
      say: ['splits wood — the pile is getting respectable.'] },
    repair_hall: { e: '🔨', parts: [0, 3, 2, 0], anchor: 'hall',
      line: function (P) { return P.They + ' ' + P.are + ' fixing something in the hall, muttering at it fondly.'; },
      say: ['fixes the hall, one muttered curse at a time.'] },
    teach_kids: { e: '📖', parts: [0, 2, 0, 0], anchor: 'hall',
      line: function (P) { return P.They + ' ' + P.are + ' showing the young ones something worth knowing.'; },
      say: ['has the kids gathered, teaching something real.'] },
    haul_water: { e: '💧', parts: [0, 3, 2, 0], anchor: 'water',
      line: function (P) { return P.They + ' ' + P.are + ' hauling water, shoulders set against the weight.'; },
      say: ['hauls water without being asked.'] },
    tend_sick: { e: '🩹', parts: [0, 2, 2, 0], anchor: 'hall',
      line: function (P) { return P.They + ' ' + P.are + ' checking on the hurt, gentle and unhurried.'; },
      say: function (P) { return 'checks on the hurt — nobody asked ' + P.them + ' to.'; } },
    watch_ridge: { e: '👀', parts: [0, 2, 3, 0], anchor: 'edge',
      line: function (P) { return P.They + ' ' + P.are + ' standing the lookout, eyes on the far line.'; },
      say: ['stands the lookout, not missing much.'] },
    trade_talk: { e: '💬', parts: [0, 2, 2, 0], anchor: 'any',
      line: function (P) { return P.They + ' ' + P.are + ' trading news and stories with whoever stops.'; },
      say: ['trades stories for news, both directions.'] },
    // --- dusk ---
    cook_evening: { e: '🍲', parts: [0, 0, 4, 0], anchor: 'fire',
      line: function (P) { return P.They + ' ' + P.are + ' getting supper going — the smell pulls people in.'; },
      say: ['starts supper. The smell does half the talking.'] },
    tend_fire: { e: '🔥', parts: [0, 0, 3, 1], anchor: 'fire',
      line: function (P) { return P.They + ' ' + P.are + ' tending the fire, feeding it just enough.'; },
      say: ['tends the fire like it is a person.'] },
    story_fire: { e: '📜', parts: [0, 0, 3, 1], anchor: 'fire',
      line: function (P) { return P.They + ' ' + P.are + ' telling a story by the fire — people are leaning in.'; },
      say: ['tells a story by the fire. People lean in.'] },
    tune_gear: { e: '🎒', parts: [0, 0, 3, 0], anchor: 'any',
      line: function (P) { return P.They + ' ' + P.are + ' going over ' + P.their + ' pack by feel, readying for tomorrow.'; },
      say: ['repacks by feel, ready for tomorrow.'] },
    settle_quarrel: { e: '⚖️', parts: [0, 1, 2, 0], anchor: 'hall',
      line: function (P) { return P.They + ' ' + P.are + ' talking two people down from something stupid.'; },
      say: ['talks two people down from something stupid.'] },
    // --- night ---
    sleep_hall: { e: '😴', parts: [0, 0, 0, 12], anchor: 'hall',
      line: function (P) { return P.They + ' ' + P.are + ' asleep in the hall, breathing deep.'; },
      say: null },
    watch_night: { e: '🌙', parts: [0, 0, 0, 2], anchor: 'edge',
      line: function (P) { return P.They + ' ' + P.are + ' on night watch, still as a post.'; },
      say: ['takes the night watch without fanfare.'] },
    sit_quiet: { e: '🌌', parts: [0, 0, 1, 1.5], anchor: 'any',
      line: function (P) { return P.They + ' ' + P.are + ' sitting up with ' + P.their + ' thoughts, not sleeping.'; },
      say: ['sits up late, not sleeping, not talking.'] },
    tend_fire_late: { e: '🔥', parts: [0, 0, 0, 2], anchor: 'fire',
      line: function (P) { return P.They + ' ' + P.are + ' feeding the fire through the small hours.'; },
      say: ['keeps the fire alive through the small hours.'] },
    // --- downtime (scheduled, not a gap) ---
    sit_breather: { e: '🌾', parts: [1, 1, 1, 0.5], anchor: 'any',
      line: function (P) { return P.They + ' ' + P.are + ' taking a breather, watching the world go by.'; },
      say: ['takes a breather, watching the world go by.'] },
    // --- village-state reactions ---
    worry_stores: { e: '😟', parts: [1, 2, 2, 0], anchor: 'hall',
      line: function (P) { return P.They + ' ' + P.are + ' counting stores with ' + P.their + ' eyes, doing the math nobody likes.'; },
      say: ['counts the stores twice. Does not like the number.'] },
    mourn_quiet: { e: '🕯️', parts: [1, 2, 3, 1], anchor: 'fire',
      line: function (P) { return P.They + ' ' + P.are + ' quiet by the fire. The village is smaller than it was.'; },
      say: ['sits by the fire, quiet. The village is smaller now.'] },
    retell_story: { e: '📣', parts: [0, 2, 3, 1], anchor: 'fire',
      line: function (P) { return P.They + ' ' + P.are + ' retelling what happened out there — the story is growing legs.'; },
      say: ['retells the big story. It is growing legs.'] },
  };

  var DAYLIFE_SHORT = {
    rekindle_fire: 'fire', cook_meal: 'cooking', cook_evening: 'cooking',
    sleep_hall: 'asleep', watch_night: 'watch', watch_ridge: 'watch',
    forage_near: 'forage', early_forage: 'forage', tend_fire: 'fire',
    tend_fire_late: 'fire', story_fire: 'story', retell_story: 'story',
    teach_kids: 'teaching', haul_water: 'water', mend_gear: 'mending',
    repair_hall: 'repairing', chop_wood: 'wood', trade_talk: 'talking',
    sit_breather: 'resting', sit_quiet: 'quiet', quiet_hour: 'quiet',
    tune_gear: 'packing', tend_sick: 'tending', settle_quarrel: 'peacemaking',
    worry_stores: 'worried', mourn_quiet: 'mourning',
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
      a.daylife = a.daylife || {};       // vid -> { act, until, anchor }
      a.recentDeaths = a.recentDeaths || []; // [{ vid, day, part, name }]
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
      var hx = v.px ?? 3, hy = v.py ?? 3;
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
        var chance = prof === 'explorer' ? 0.09 : 0.045;
        if (a.potential[rid]) chance *= 1.6;
        if (R() < chance) this.startExpedition(rid, hx, hy, playerAtHaven);
      }
      // rising stars with the 'lead' goal: the village starts looking at them.
      // The existing contender-heat machinery takes it from there.
      try { this.agencyLeadershipTick(); } catch (e) {}
      // the village talks about what its people did. Ambient, honest.
      try { if (playerAtHaven && R() < 0.12) this.agencyDeedTalk(); } catch (e) {}
      // daily rhythms: who is doing what, where on the grid, right now.
      try { this.agencyDaylifeTick(); } catch (e) {}
    },
    startExpedition(vid, hx, hy, announce) {
      var a = this.agencyOf(vid);
      var st = this.agencyState();
      var maxD = this.npcMaxDist(vid);
      if (maxD < 1) return;
      // target: a node out there, at real distance
      var dist = 1 + Math.floor(R() * maxD);
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
      var d = pick(dirs);
      var tx = Math.max(0, Math.min(6, hx + d[0] * dist));
      var ty = Math.max(0, Math.min(6, hy + d[1] * dist));
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
        nx = Math.max(0, Math.min(6, nx)); ny = Math.max(0, Math.min(6, ny));
        try { this.npcSetNode(vid, nx, ny); } catch (e) {}
        var key = nx + ',' + ny;
        a.stats[vid].nodes[key] = true;
      }
      var dist = Math.abs(nx - hx) + Math.abs(ny - hy);
      // XP accrues just for being out there and paying attention
      var mult = st.potential[vid] ? 2 : 1;
      a.xp[vid].tracking += mult;
      a.xp[vid].survival += mult;
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
      var brave = a.xp[vid].bravery;
      var nm = '';
      try { nm = this.displayName(vid); } catch (e) { nm = 'Someone'; }
      var wave = m.wave || 1;
      // THE WILD COLLECTS FIRST: no matter how good you are, the far dark
      // has teeth. Skill decides what happens in a fair meeting — it doesn't
      // decide whether the meeting is fair. This is why sometimes they don't
      // come back, and why the village tells that story for a while.
      var r = R();
      var deathP = dist >= 2 ? 0.006 * Math.min(3, dist / 2) : 0;
      var hurtP = 0.04 + dist * 0.006;
      if (r < deathP) return this.expedDeath(vid, mName, nm, playerAtHaven);
      if (r < deathP + hurtP) return this.expedHurt(vid, mName, nm);
      // a fair meeting: skill decides
      var evade = 0.55 + Math.min(0.25, brave * 0.03) + (st.potential[vid] ? 0.08 : 0);
      var r2 = R();
      if (r2 < evade) {
        // saw it, gave it room, lived. That's a kind of knowledge.
        a.know[vid].monsters++;
        a.xp[vid].tracking += 2 * (st.potential[vid] ? 2 : 1);
        st.exped[vid].encounters.push('evaded ' + (m.id || 'it'));
        return;
      }
      if (wave <= 1 && r2 < evade + (1 - evade) * 0.5) {
        // fought and killed something small. A real deed.
        a.know[vid].monsters += 2;
        a.xp[vid].bravery += 3 * (st.potential[vid] ? 2 : 1);
        a.stats[vid].monsterKills++;
        st.exped[vid].encounters.push('killed ' + (m.id || 'it'));
        this.recordDeed(vid, 'monster_kill', `${nm} killed ${mName} out past the ridge — alone — and walked home.`, 10);
        return;
      }
      // driven off but unhurt — stood their ground
      a.xp[vid].bravery += 1;
      st.exped[vid].encounters.push('stood down ' + (m.id || 'it'));
      this.recordDeed(vid, 'stood_down', `${nm} stood down ${mName} and kept walking.`, 4);
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
      var hx = v.px ?? 3, hy = v.py ?? 3;
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
        var out = [];
        var rec = this.daylifeOf ? this.daylifeOf(vid) : null;
        if (rec && rec.act !== 'sleep_hall') out.push({ id: 'agency:ask_daylife', label: '"What are you working on?"' });
        var lessons = this.npcFieldLessons(vid);
        if (!lessons.length) return out;
        var v = this.state.village;
        if (v.explorerNews && v.explorerNews[vid] && v.explorerNews[vid].agency) {
          return [{ id: 'agency:ask_expedition', label: '"What did you see out there?"' }].concat(out);
        }
        return [{ id: 'agency:ask_field', label: '"Teach me something from the wild."' }].concat(out);
      } catch (e) { return []; }
    },
    agencyTurn(vid, choiceId) {
      var st = this.agencyState();
      var nm = '';
      try { nm = this.displayName(vid).split(' ')[0]; } catch (e) { nm = 'They'; }
      if (choiceId === 'agency:ask_daylife') {
        var rec = null;
        try { rec = this.daylifeOf(vid); } catch (e) {}
        var work = {
          cook_meal: '"Supper. Same job, different day. It matters more than it looks."',
          cook_evening: '"Supper. People eat together or they drift apart — I pick together."',
          rekindle_fire: '"Fire first. Everything else is negotiable."',
          tend_fire: '"Somebody has to feed it. Today that is me."',
          chop_wood: '"Wood. The pile does not lie about how the winter will go."',
          haul_water: '"Water. Heavy, boring, and the reason we are all still here."',
          mend_gear: '"Mending. Everything breaks; the trick is fixing it before it matters."',
          repair_hall: '"The hall. It keeps us, so I keep it."',
          watch_ridge: '"Watching. Boring is good. Boring means nothing is coming."',
          watch_night: '"Night watch. Sleep is for people somebody is watching over."',
          forage_near: '"Near patches. You learn what is close before you earn what is far."',
          tend_sick: '"Checking on people. Somebody should."',
          teach_kids: '"Teaching. They will need it longer than I will."',
          story_fire: '"Stories. How else do we remember what the fire already knows?"',
          trade_talk: '"News. A village that stops talking stops being one."',
          sit_breather: '"Resting. Even the fire banks its coals."',
          worry_stores: '"Counting. Somebody has to do the math nobody likes."',
          mourn_quiet: '"...Just sitting. Some days that is the whole job."',
          retell_story: '"Telling it again. The true parts get truer."',
          tune_gear: '"Packing for tomorrow. Tomorrow comes whether you are ready or not."',
          settle_quarrel: '"Peacemaking. Somebody has to be the adult in the room."',
        };
        var line = (rec && work[rec.act]) ? work[rec.act] : '"This. Whatever this is, somebody has to do it."';
        try { this.bumpTrust(vid, 1); } catch (e) {}
        return { line: line, choices: this.convoChoices(vid), ended: false };
      }
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

    // ---------- 6. DAYLIFE: grid-visible daily rhythms ----------
    // Steve's interface directive: villagers behave like monsters — visible in
    // the 9x9 grid with name + person emoji, going about their day turn-based
    // with downtime, never blocking the player.
    //
    // Once per day-part (via agencyTick), every at-Haven villager gets a
    // day-life activity: a visible behavior with a grid position, an observed
    // line for the person sheet (through the personActivityLine wrap), and
    // rarely an ambient say-line when you're there to hear it. Activities are
    // weighted by temperament, goal, occupation, age, needs, and village
    // state (pantry, recent deaths, big deeds) — people read as distinct
    // individuals, not clones. ~28% of part transitions become breathers:
    // downtime is part of the day, not a gap in it.
    //
    // GRID RULES (hard): positions nudge one cell per part, never onto the
    // player's cell, never onto another villager, never onto a blocking cell.
    // No scrolling-relevant changes — grid + person sheet only.
    agencyDaylifeTick() {
      if (this.over) return;
      var v = this.state.village, s = this.state.scholar;
      var a = this.agencyState();
      var hx = v.px ?? 3, hy = v.py ?? 3;
      var day = s.day || 0, part = this.dayPart || 0;
      var key = day + ':' + part;
      // village-state context, read once per part
      var pop = Math.max(1, (v.roster || []).length);
      var kcal = 0;
      try { kcal = this.pantryKcalLive ? this.pantryKcalLive(v) : 0; } catch (e) {}
      var pantryLow = kcal < 500 * pop;
      var deathRecent = false;
      try {
        for (var di = 0; di < a.recentDeaths.length; di++) {
          if ((day - a.recentDeaths[di].day) <= 2) { deathRecent = true; break; }
        }
      } catch (e) {}
      var deedRecent = false;
      try {
        for (var ai = a.ach.length - 1; ai >= 0; ai--) {
          if (a.ach[ai].mag >= 8 && (day - a.ach[ai].day) <= 2) { deedRecent = true; break; }
        }
      } catch (e) {}
      var playerAtHaven = false;
      try { playerAtHaven = (this.map.px === hx && this.map.py === hy); } catch (e) {}
      var withYou = [];
      try { withYou = this.travelingWith() || []; } catch (e) {}
      // the night watch: two villagers, rotating nightly, drawn from the
      // watchful. Everyone else sleeps. A village where half the roster
      // stands watch every night doesn't read as night.
      var watchers = [];
      if (part === 3) {
        try {
          var cands = [];
          var wroster = v.roster || [];
          for (var wi = 0; wi < wroster.length; wi++) {
            var wid = wroster[wi];
            if (wid === this.villagerId) continue;
            var wvp = null;
            try { wvp = this.vpOf(wid); } catch (e) {}
            if (wvp && wvp.dead) continue;
            var wn = null;
            try { wn = this.npcNode(wid); } catch (e) { continue; }
            if (!wn || wn.nx !== hx || wn.ny !== hy) continue;
            if (a.exped && a.exped[wid]) continue;
            cands.push([wid, this.daylifePersonalityMult(wid, 'watch_night')]);
          }
          cands.sort(function (x, y) { return y[1] - x[1]; });
          var n = Math.max(1, cands.length);
          var h = 0;
          try { h = this._hashStr ? this._hashStr('watch:' + day) : 0; } catch (e) {}
          var off = ((h % n) + n) % n;
          for (var k = 0; k < Math.min(2, cands.length); k++) watchers.push(cands[(off + k) % n][0]);
        } catch (e) {}
      }
      var ctx = {
        part: part, pantryLow: pantryLow, deathRecent: deathRecent,
        deedRecent: deedRecent, challenge: !!v.challenge, watchers: watchers,
      };
      var said = 0;
      var roster = v.roster || [];
      for (var i = 0; i < roster.length; i++) {
        var rid = roster[i];
        if (rid === this.villagerId) continue;
        var vp = null;
        try { vp = this.vpOf(rid); } catch (e) {}
        if (vp && vp.dead) continue;
        try { if (this.isEngaged(rid)) continue; } catch (e) {}
        if (withYou.indexOf(rid) !== -1) continue;
        if (a.exped && a.exped[rid]) continue; // out on expedition — that IS their day
        var node = null;
        try { node = this.npcNode(rid); } catch (e) { continue; }
        if (!node || node.nx !== hx || node.ny !== hy) continue;
        var rec = a.daylife[rid];
        if (rec && !this.daylifeExpired(rec, key)) { this.daylifeNudge(rid, rec); continue; }
        // downtime: a breather between jobs reads as a real day. (Not at
        // night — at night people sleep; the watch is a job, not a breather.)
        if (rec && rec.act !== 'sit_breather' && R() < (part === 3 ? 0.06 : 0.28)) {
          rec = this.daylifeSet(rid, 'sit_breather', key, 1);
        } else {
          rec = this.daylifeSet(rid, this.daylifePick(rid, ctx), key, 1);
        }
        // ambient say: the village sounds alive when you're there to hear it
        if (playerAtHaven && said < 2) {
          var def = DAYLIFE_ACTS[rec.act] || {};
          if (def.say && R() < 0.35) {
            said++;
            var nm = '';
            try { nm = this.displayName(rid).split(' ')[0]; } catch (e) { nm = 'Someone'; }
            var txt = def.say;
            if (typeof txt === 'function') { try { txt = [txt(this.daylifePro(rid))]; } catch (e) { txt = []; } }
            if (txt && txt.length) this.say((def.e || '🧍') + ' ' + nm + ' ' + pick(txt));
          }
        }
        this.daylifeNudge(rid, rec);
      }
    },
    daylifeSet(vid, actId, key, dur) {
      var a = this.agencyState();
      a.daylife[vid] = {
        act: actId,
        until: this.daylifeAdvanceKey(key, dur || 1),
        anchor: (DAYLIFE_ACTS[actId] || {}).anchor || 'any',
      };
      return a.daylife[vid];
    },
    daylifeAdvanceKey(key, n) {
      var p = String(key).split(':');
      var d = parseInt(p[0], 10) || 0, pt = parseInt(p[1], 10) || 0;
      pt += n;
      while (pt >= 4) { pt -= 4; d++; }
      return d + ':' + pt;
    },
    daylifeExpired(rec, key) {
      if (!rec || !rec.until) return true;
      var ua = String(rec.until).split(':'), ub = String(key).split(':');
      var da = parseInt(ua[0], 10) || 0, pa = parseInt(ua[1], 10) || 0;
      var db = parseInt(ub[0], 10) || 0, pb = parseInt(ub[1], 10) || 0;
      // an activity is valid for exactly its own part: expired once the
      // current part reaches or passes `until` (set one part ahead).
      return (db > da) || (db === da && pb >= pa);
    },
    // daylifeOf: the current activity record, or null if expired/absent.
    // JSON-safe: { act, until, anchor }. Lines are computed, never stored.
    daylifeOf(vid) {
      var a = this.agencyState();
      var rec = a.daylife[vid];
      if (!rec) return null;
      var s = this.state.scholar;
      var key = (s.day || 0) + ':' + (this.dayPart || 0);
      if (this.daylifeExpired(rec, key)) return null;
      return rec;
    },
    daylifePick(vid, ctx) {
      var ids = Object.keys(DAYLIFE_ACTS);
      var total = 0, acc = [];
      for (var i = 0; i < ids.length; i++) {
        var w = this.daylifeWeight(vid, ids[i], ctx);
        if (w > 0) { total += w; acc.push([ids[i], total]); }
      }
      if (!total) return 'sit_breather';
      var r = R() * total;
      for (var j = 0; j < acc.length; j++) if (r < acc[j][1]) return acc[j][0];
      return acc[acc.length - 1][0];
    },
    // daylifePersonalityMult: who this person is, answered by their fields.
    // Temperament, goal, occupation, age — no day-part, no village state.
    // Also ranks the villager's SIGNATURE (top-3 affinity acts, cached):
    // people have routines, and different people have different ones.
    daylifePersonalityMult(vid, id) {
      var w = 1;
      var temp = 'steady', goal = null, occ = '', age = 35;
      try {
        var vp = this.vpOf(vid) || {};
        var pers = vp.personality || {};
        temp = pers.temperament || 'steady';
        goal = vp.goal || this.npcGoal(vid);
        occ = vp.occupationId || vp.occupation || '';
        age = vp.age || 35;
      } catch (e) {}
      var mul = function (x) { w *= x; };
      // temperament: the day bends around who they are
      if (temp === 'bold') { if (id === 'watch_ridge' || id === 'watch_night' || id === 'early_forage') mul(2.2); }
      else if (temp === 'withdrawn') {
        if (id === 'quiet_hour' || id === 'sit_quiet') mul(2.6);
        if (id === 'trade_talk' || id === 'story_fire' || id === 'retell_story') mul(0.35);
      }
      else if (temp === 'gentle') { if (id === 'tend_sick' || id === 'teach_kids') mul(2.2); if (id === 'chop_wood') mul(0.6); }
      else if (temp === 'restless') { if (id === 'early_forage' || id === 'tend_fire_late' || id === 'forage_near') mul(2); if (id === 'sit_breather') mul(0.5); }
      else if (temp === 'intense') { if (id === 'repair_hall' || id === 'chop_wood' || id === 'haul_water') mul(2); }
      else if (temp === 'cautious') { if (id === 'watch_night' || id === 'watch_ridge') mul(2); if (id === 'early_forage') mul(0.5); }
      else if (temp === 'warm') { if (id === 'cook_meal' || id === 'cook_evening' || id === 'story_fire' || id === 'trade_talk') mul(1.8); }
      else if (temp === 'dry') { if (id === 'trade_talk') mul(2.2); }
      else if (temp === 'prickly') { if (id === 'trade_talk' || id === 'teach_kids') mul(0.6); if (id === 'mend_gear' || id === 'tune_gear') mul(1.6); }
      else if (temp === 'anxious') {
        if (id === 'worry_stores' || id === 'sit_quiet') mul(2.2);
        if (id === 'watch_ridge' || id === 'watch_night') mul(1.5);
        if (id === 'trade_talk' || id === 'story_fire') mul(0.6);
      }
      // goal: what they're reaching for shapes the hours
      if (goal === 'lead' && (id === 'settle_quarrel' || id === 'watch_ridge')) mul(2);
      if (goal === 'heal' && id === 'tend_sick') mul(2.6);
      if (goal === 'protect' && (id === 'watch_ridge' || id === 'watch_night')) mul(2.6);
      if (goal === 'explore' && (id === 'early_forage' || id === 'tune_gear')) mul(2);
      if (goal === 'prove' && (id === 'chop_wood' || id === 'haul_water')) mul(1.8);
      if (goal === 'escape' && (id === 'early_forage' || id === 'forage_near')) mul(1.6);
      if (goal === 'alone') {
        if (id === 'quiet_hour' || id === 'sit_quiet') mul(2.5);
        if (id === 'trade_talk' || id === 'story_fire' || id === 'retell_story') mul(0.4);
      }
      if (goal === 'feed') {
        if (id === 'cook_meal' || id === 'cook_evening') mul(2.5);
        if (id === 'forage_near' || id === 'worry_stores') mul(2);
      }
      if (goal === 'belong' && (id === 'trade_talk' || id === 'story_fire' || id === 'cook_evening')) mul(2);
      if (goal === 'remember' && (id === 'story_fire' || id === 'retell_story')) mul(2.2);
      if (goal === 'survive' && (id === 'forage_near' || id === 'chop_wood' || id === 'haul_water')) mul(1.8);
      if (goal === 'understand' && (id === 'watch_ridge' || id === 'trade_talk' || id === 'tune_gear')) mul(1.6);
      if (goal === 'family' && (id === 'trade_talk' || id === 'watch_ridge')) mul(1.8);
      // occupation: hands remember their trade
      if (/line_cook|baker|butcher|gardener|farmer|beekeeper|chef|bartender/.test(occ) && (id === 'cook_meal' || id === 'cook_evening')) mul(3);
      if (/er_nurse|paramedic|midwife|dentist|pharmacist|veterinarian|physical_therapist|army_medic/.test(occ) && id === 'tend_sick') mul(3);
      if (/carpenter|mechanic|plumber|electrician|welder|roofer|mason|hvac_tech|appliance_repair|locksmith|blacksmith|glazier/.test(occ) && id === 'repair_hall') mul(3);
      if (/police_officer|firefighter|soldier/.test(occ) && (id === 'watch_ridge' || id === 'watch_night')) mul(2.5);
      if (/esl_teacher|librarian|interpreter|social_worker/.test(occ) && (id === 'teach_kids' || id === 'settle_quarrel')) mul(2.5);
      if (/hunting_guide|fishing_guide|trail_crew|fisherman|forager|mushroom_grower|rancher|farmer/.test(occ) && (id === 'forage_near' || id === 'early_forage' || id === 'mend_gear')) mul(2);
      if (/tailor|sailor/.test(occ) && id === 'mend_gear') mul(2.5);
      if (/sailor|truck_driver/.test(occ) && id === 'haul_water') mul(2);
      if (/journalist|bartender/.test(occ) && id === 'trade_talk') mul(2.5);
      if (/artist|musician/.test(occ) && id === 'story_fire') mul(2.5);
      // age: elders teach and tell; the young carry and chop
      if (age > 55) { if (id === 'story_fire' || id === 'teach_kids' || id === 'sit_breather') mul(2.2); if (id === 'chop_wood' || id === 'haul_water') mul(0.4); }
      else if (age < 30) { if (id === 'chop_wood' || id === 'haul_water' || id === 'early_forage') mul(1.8); if (id === 'sit_breather') mul(0.6); }
      return w;
    },
    // daylifeSignature: this person's top-3 affinity acts — their routine.
    // Cached; deterministic. The signature boost is what makes villagers
    // read as distinct individuals instead of weighted mush.
    daylifeSignature(vid) {
      var a = this.agencyState();
      a._sig = a._sig || {};
      if (a._sig[vid]) return a._sig[vid];
      var ids = Object.keys(DAYLIFE_ACTS);
      var scores = [];
      for (var i = 0; i < ids.length; i++) {
        var def = DAYLIFE_ACTS[ids[i]];
        var span = (def.parts[0] || 0) + (def.parts[1] || 0) + (def.parts[2] || 0) + (def.parts[3] || 0);
        // (mult - 1): only genuine affinities rank. A villager with no strong
        // pulls gets a neutral fallback routine instead of amplified noise.
        scores.push([ids[i], (this.daylifePersonalityMult(vid, ids[i]) - 1) * (1 + span)]);
      }
      scores.sort(function (x, y) { return y[1] - x[1]; });
      var sig = [scores[0][0], scores[1][0], scores[2][0]];
      a._sig[vid] = sig;
      return sig;
    },
    // daylifeWeight: the full pick weight — day-part base, personality,
    // signature routine, needs, and village state.
    daylifeWeight(vid, id, ctx) {
      var def = DAYLIFE_ACTS[id];
      if (!def) return 0;
      var base = def.parts[ctx.part] || 0;
      if (base <= 0) return 0;
      var w = base * this.daylifePersonalityMult(vid, id);
      try {
        var sig = this.daylifeSignature(vid);
        if (sig.indexOf(id) !== -1) w *= 5;
      } catch (e) {}
      // night is for sleeping — unless you're on the watch rotation. The watch
      // is two people, not a temperament; everyone else sleeps. That's what
      // makes night read as night.
      if (id === 'sleep_hall') {
        var watchful = 1;
        try { watchful = this.daylifePersonalityMult(vid, 'watch_night'); } catch (e) {}
        w *= watchful > 1.5 ? 0.8 : 1.7;
      }
      if (id === 'watch_night') {
        var onWatch = !!(ctx.watchers && ctx.watchers.indexOf(vid) !== -1);
        w *= onWatch ? 3 : 0.12;
      }
      var need = null;
      try { need = this.dominantNeed(vid); } catch (e) {}
      // needs: the body gets a vote
      if (need === 'hunger' && (id === 'forage_near' || id === 'cook_meal' || id === 'cook_evening' || id === 'early_forage')) w *= 2;
      if (need === 'exhaustion' && (id === 'sit_breather' || id === 'sleep_hall' || id === 'sit_quiet')) w *= 2.5;
      if (need === 'fear' && (id === 'watch_ridge' || id === 'watch_night' || id === 'sit_quiet' || id === 'sleep_hall')) w *= 1.8;
      if (need === 'loneliness' && (id === 'trade_talk' || id === 'story_fire' || id === 'cook_evening')) w *= 2;
      if (need === 'grief' && (id === 'mourn_quiet' || id === 'sit_quiet')) w *= 2.5;
      // village state: the day reacts to what's real
      if (ctx.pantryLow) { if (id === 'worry_stores') w *= 4; if (id === 'forage_near' || id === 'early_forage') w *= 2; if (id === 'sit_breather') w *= 0.6; }
      if (ctx.deathRecent) { if (id === 'mourn_quiet') w *= 5; if (id === 'story_fire' || id === 'retell_story' || id === 'trade_talk') w *= 0.5; }
      if (ctx.deedRecent && id === 'retell_story') w *= 4;
      if (ctx.challenge && (id === 'trade_talk' || id === 'settle_quarrel' || id === 'watch_ridge')) w *= 2;
      return w;
    },
    // daylifeNudge: one cell per part toward the activity's anchor. Hard rules:
    // never onto the player, never onto another villager, never blocking.
    daylifeNudge(rid, rec) {
      try {
        var v = this.state.village;
        var pos = (v.positions || {})[rid];
        if (!pos) return;
        var anchor = this.daylifeAnchorCell((rec && rec.anchor) || 'any');
        var gx = anchor ? anchor.x : pos.mx, gy = anchor ? anchor.y : pos.my;
        var pmx = this.state.scholar.mx ?? 4, pmy = this.state.scholar.my ?? 4;
        var cands = [];
        for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) {
          if (!ox && !oy) continue;
          cands.push({ x: pos.mx + ox, y: pos.my + oy });
        }
        cands.sort(function (p, q) {
          var dp = Math.abs(p.x - gx) + Math.abs(p.y - gy);
          var dq = Math.abs(q.x - gx) + Math.abs(q.y - gy);
          return dp - dq;
        });
        for (var i = 0; i < cands.length; i++) {
          var c = cands[i];
          if (c.x < 0 || c.x > 8 || c.y < 0 || c.y > 8) continue;
          if (c.x === pmx && c.y === pmy) continue; // never on the player
          var taken = false;
          var pids = v.positions || {};
          for (var id in pids) {
            if (id !== rid && pids[id].mx === c.x && pids[id].my === c.y) { taken = true; break; }
          }
          if (taken) continue;
          var cell = this.daylifeCellAt(c.x, c.y);
          var blocked = false;
          try { blocked = cell != null && this.cellProps ? !!this.cellProps(cell).blocks : false; } catch (e) {}
          if (blocked) continue;
          pos.mx = c.x; pos.my = c.y;
          return;
        }
      } catch (e) {}
    },
    // daylifeAnchorCell: first fire/hall/water/tent cell in the Haven detail.
    // Cached per day — genDetail is cheap but there's no reason to rescan.
    daylifeAnchors() {
      var a = this.agencyState();
      var v = this.state.village;
      var key = (v.px ?? 3) + ',' + (v.py ?? 3) + ':' + (this.state.scholar.day || 0);
      if (a._anchorKey !== key) {
        a._anchorKey = key;
        a._anchors = {};
        try {
          var detail = this.genDetail ? this.genDetail(v.px ?? 3, v.py ?? 3) : null;
          var found = {};
          if (detail) {
            for (var y = 0; y < 9; y++) for (var x = 0; x < 9; x++) {
              var c = detail[y] && detail[y][x];
              if (typeof c !== 'string') continue;
              if (c === 'fire' && !found.fire) found.fire = { x: x, y: y };
              if ((c === 'hall' || c === 'lodge') && !found.hall) found.hall = { x: x, y: y };
              if (c === 'water' && !found.water) found.water = { x: x, y: y };
              if (c === 'tent' && !found.tent) found.tent = { x: x, y: y };
            }
          }
          a._anchors = found;
        } catch (e) { a._anchors = {}; }
      }
      return a._anchors || {};
    },
    daylifeAnchorCell(kind) {
      var an = this.daylifeAnchors();
      if (kind === 'fire') return an.fire || an.hall || null;
      if (kind === 'hall') return an.hall || an.fire || null;
      if (kind === 'water') return an.water || null;
      return null; // 'edge' and 'any': drift locally
    },
    daylifeCellAt(x, y) {
      try {
        var v = this.state.village;
        var detail = this.genDetail ? this.genDetail(v.px ?? 3, v.py ?? 3) : null;
        return detail && detail[y] && detail[y][x];
      } catch (e) { return null; }
    },
    daylifePro(vid) {
      var pro = 'they';
      try {
        var vv = (this.data.villagers || []).find(function (x) { return x.id === vid; }) || {};
        var h = this._hashStr ? this._hashStr(vid) : 0;
        pro = vv.pro || (['she', 'he', 'they'][((h % 3) + 3) % 3]);
      } catch (e) {}
      if (pro === 'she') return { They: 'She', their: 'her', them: 'her', are: 'is' };
      if (pro === 'he') return { They: 'He', their: 'his', them: 'him', are: 'is' };
      return { They: 'They', their: 'their', them: 'them', are: 'are' };
    },
    // daylifeLine: the observed activity line for the person sheet.
    // Quirk flavor is deterministic per part — no flicker between renders.
    daylifeLine(vid) {
      var rec = this.daylifeOf(vid);
      if (!rec) return '';
      var def = DAYLIFE_ACTS[rec.act];
      if (!def) return '';
      var P = this.daylifePro(vid);
      var line = '';
      try { line = def.line(P); } catch (e) { line = P.They + ' ' + P.are + ' busy.'; }
      try {
        var vp = this.vpOf(vid) || {};
        var q = (vp.personality || {}).quirk;
        var s = this.state.scholar;
        var h = this._hashStr ? this._hashStr(vid + ':' + (s.day || 0) + ':' + (this.dayPart || 0)) : 1;
        if (q && (((h % 4) + 4) % 4) === 0) line += ' ' + q.charAt(0).toUpperCase() + q.slice(1) + ' — as always.';
      } catch (e) {}
      return line;
    },
    // villagerTileBadge: compact grid badge for a villager's current activity.
    // FOLLOW-UP: app.js tile render doesn't call this yet (dirty sibling WIP,
    // not touched). One-line hook: in the villager cell branch, append
    // Game.villagerTileBadge(villagerId) to the tile label.
    villagerTileBadge(vid) {
      var rec = null;
      try { rec = this.daylifeOf(vid); } catch (e) {}
      if (!rec) return '';
      var def = DAYLIFE_ACTS[rec.act] || {};
      return (def.e || '🧍') + ' ' + (DAYLIFE_SHORT[rec.act] || 'busy');
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
    // daylife: the person sheet shows what they're doing, in plain observed
    // language, ahead of the need-based line. Names stay knowledge-gated
    // through displayName inside daylifeLine's callers.
    var _pal = G.personActivityLine;
    G.personActivityLine = function (vid) {
      var base = '';
      try { base = _pal ? _pal.call(this, vid) : ''; } catch (e) {}
      try {
        var line = this.daylifeLine ? this.daylifeLine(vid) : '';
        if (line) return line + (base ? ' ' + base : '');
      } catch (e) {}
      return base;
    };
    // daylife: recent deaths change the village's rhythm for a couple of days.
    // Recorded here so mourning is a reaction, not a schedule.
    var _rd = G.registerDeath;
    G.registerDeath = function (info) {
      var r = _rd ? _rd.call(this, info) : undefined;
      try {
        if (info && (info.kind === 'person' || info.kind === 'villager') && info.villagerId) {
          var a = this.agencyState();
          a.recentDeaths.push({
            vid: info.villagerId, day: this.state.scholar.day || 0,
            part: this.dayPart || 0, name: info.name || 'someone',
          });
          var cutoff = (this.state.scholar.day || 0) - 3;
          a.recentDeaths = a.recentDeaths.filter(function (d) { return d.day >= cutoff; });
        }
      } catch (e) {}
      return r;
    };
  })();
})();
