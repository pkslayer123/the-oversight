// @ontology
// system: party
// description: Party system. Companions travel and fight with you.
// provides:
//   - inviteToParty(vid)
//   - dismissFromParty(vid)
//   - partyState()
//   - partyMembers()
//   - inParty(vid)
//   - partyCap()
//   - partyFull()
//   - partyTrustFloor()
//   - travelingWith()
//   - placePartyAtPlayer()
//   - partyBetrayalState(vid)
//   - betrayalIntent(vid)
// rules:
//   - (none documented)
// consumes:
//   - state.party
// ============ PARTY SYSTEM ============
// Formal parties are a SYSTEM UNLOCK (day 7+). Before that, people follow you
// informally — high trust, their own choice, no UI, no cap. Just relationships.
//
// The System gamifies what was already happening organically. That's the joke.
// It's also slightly invasive, which is very on-brand.
//
// PK IS ON. Both ways:
// - You can invite someone, lure them somewhere isolated, and kill them.
// - They can do the same to you. Trust is not safety. It's a number that
//   makes you FEEL safe. The most dangerous backstabber is the one you trust.
//
// Self-attaching module: loaded after game.js, adds/wraps Game methods.
// All game logic lives here — game.js is untouched (sibling agents own it).

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;

  const methods = {

    // ---------- STATE ----------

    partyState() {
      const v = this.state.village;
      v.party = v.party || [];
      v.followers = v.followers || [];
      v.betray = v.betray || {};
      if (v.partyMax == null) v.partyMax = 3;
      return v;
    },

    partyUnlocked() {
      // Steve's decision 2026-10-04: formal party = System arrival + real codex
      // unlock (same moment) + a very slight trust barrier per person — you
      // have to at least KNOW them.
      return !!(this.state.village.partyUnlocked && this.state.systemArrived && this.state.scholar.codexUnlocked);
    },

    partyMembers() {
      const v = this.partyState();
      return (v.party || []).filter(id => (v.roster || []).includes(id));
    },

    inParty(vid) {
      return this.partyMembers().includes(vid);
    },

    isFollower(vid) {
      const v = this.partyState();
      return (v.followers || []).includes(vid) && !this.inParty(vid);
    },

    partyCap() {
      return this.partyState().partyMax || 3;
    },

    partyFull() {
      return this.partyMembers().length >= this.partyCap();
    },

    // everyone traveling with you, formal or informal
    travelingWith() {
      const v = this.partyState();
      const set = new Set([...this.partyMembers(), ...(v.followers || [])]);
      return [...set].filter(id => (v.roster || []).includes(id));
    },

    // ---------- SYSTEM ARRIVAL: PARTY UNLOCK ----------
    // Wrapped onto checkSystemArrival below.

    unlockPartySystem() {
      const v = this.partyState();
      if (v.partyUnlocked) return;
      v.partyUnlocked = true;
      v.partyMax = 3;
      // The System formalizes what was already happening: followers become party.
      const converted = [];
      for (const fid of [...(v.followers || [])]) {
        if (v.party.length < v.partyMax && (v.roster || []).includes(fid)) {
          v.party.push(fid);
          converted.push(fid);
        }
      }
      v.followers = (v.followers || []).filter(id => !v.party.includes(id));
      this.say('🎉 "OH! One more thing! We noticed some of you have been... traveling together! In little groups! How ORGANIC! How INEFFICIENT!"');
      this.say('"So we made it OFFICIAL! The PARTY SYSTEM! Up to THREE companions! Formal! Tracked! With a UI! The audience can see your party composition now! Very important for the betting markets!"');
      if (converted.length) {
        const names = converted.map(id => this.displayName(id)).join(', ');
        this.say(`"We've auto-enrolled your current traveling companions: ${names}! You're welcome! (They can leave anytime. Probably.)"`);
      }
      this.say('"Choose wisely! Or don\'t! Betrayal arcs test VERY well with our demographics!"');
      this.say('A new option appears when you look at people: invite them to your party.');
      // the concept is learned — but the invite itself lives in conversation,
      // not on a button. You ask people. Like a person.
      try { this.discover('party'); } catch (e) {}
    },

    maybeRaisePartyCap() {
      const v = this.partyState();
      const day = this.state.scholar.day;
      if (day >= 14 && v.partyMax < 4) {
        v.partyMax = 4;
        this.say('📺 SYSTEM: "AUDIENCE EXPANSION! Your party cap is now FOUR! The people demanded bigger ensembles! Don\'t let us down!"');
      }
      if (day >= 30 && v.partyMax < 5) {
        v.partyMax = 5;
        this.say('📺 SYSTEM: "SEASON FINALE APPROACHES! Party cap raised to FIVE! Go out with a BANG! (Figuratively. Mostly.)"');
      }
    },

    // ---------- INVITES ----------
    // SLIGHT TRUST GATE (Steve 2026-10-04): the System formalizes a party, and
    // it insists you at least KNOW the person. Trust 20 — a conversation or
    // two above stranger. Trust still affects whether they SAY yes; this is
    // whether the System allows the formal invite at all.
    partyTrustFloor() { return 20; },

    inviteToParty(vid) {
      const v = this.partyState();
      const dname = this.displayName(vid);
      if (!this.state.systemArrived || !v.partyUnlocked) {
        return { ok: false, msg: 'There\'s no formal party yet. People just... come with you, or don\'t. (The System hasn\'t gamified friendship.)' };
      }
      if (!this.state.scholar.codexUnlocked) {
        return { ok: false, msg: 'The Codex isn\'t real yet. The System can\'t formalize what it can\'t track.' };
      }
      if (this.inParty(vid)) return { ok: false, msg: `${dname} is already in your party.` };
      if (this.partyFull()) {
        return { ok: false, msg: `Party's full (${this.partyCap()}). The System is very firm about this. Dismiss someone first.` };
      }
      if (!(v.roster || []).includes(vid)) return { ok: false, msg: 'They\'re not here.' }

      const trust = (v.trust && v.trust[vid]) || 10;
      if (trust < this.partyTrustFloor()) {
        return { ok: false, msg: `The System squints. "You don't really KNOW ${dname} yet. Talk to them first — the party UI needs a person, not a stranger." (Trust ${trust}/${this.partyTrustFloor()})` };
      }
      const temp = this.npcTemper(vid);
      const goal = this.npcGoal(vid);
      const mood = this.npcMood ? this.npcMood(vid) : 'steady';
      const vp = this.vpOf ? this.vpOf(vid) : {};

      // Backstabbers ALWAYS accept. They want proximity. This is the trap.
      const intent = this.betrayalIntent(vid);
      if (intent) {
        v.party.push(vid);
        v.followers = (v.followers || []).filter(id => id !== vid);
        this.setEngaged(vid, 2);
        const eager = [
          `"Yes. Absolutely. I've been hoping you'd ask." (A little too quickly.)`,
          `"Finally. I was wondering when you'd see my value."`,
          `"I'd love to. Lead the way." (They're already checking your pack.)`,
        ];
        const line = eager[Math.floor(Math.random() * eager.length)];
        this.say(`🤝 ${dname} joins your party. ${line}`);
        this.sysSay(`${dname.toUpperCase()} HAS JOINED THE PARTY! The audience coos!`);
        return { ok: true, msg: `${dname} joins your party.` };
      }

      // Acceptance: trust helps, personality and goals decide.
      let chance = 35 + trust * 0.4;
      if (temp === 'bold' || temp === 'warm') chance += 15;
      if (temp === 'prickly' || temp === 'withdrawn') chance -= 20;
      if (temp === 'cautious') chance -= 10;
      if (goal === 'alone') chance -= 40;
      if (goal === 'belong' || goal === 'protect' || goal === 'feed') chance += 15;
      if (goal === 'escape') chance -= 15;
      if (mood === 'scared' || mood === 'grieving') chance -= 10;
      if (mood === 'cheerful') chance += 10;
      chance = Math.max(5, Math.min(95, chance));

      if (Math.random() * 100 < chance) {
        v.party.push(vid);
        v.followers = (v.followers || []).filter(id => id !== vid);
        this.setEngaged(vid, 2);
        const yes = [
          `"Okay. Yeah. I trust you."`,
          `"Someone should watch your back. Might as well be me."`,
          `"Alright. But I'm not carrying your stuff."`,
          `"...Fine. This had better be worth it."`,
        ];
        const line = yes[Math.floor(Math.random() * yes.length)];
        this.say(`🤝 ${dname} joins your party. ${line}`);
        this.sysSay(`${dname.toUpperCase()} HAS JOINED THE PARTY!`);
        return { ok: true, msg: `${dname} joins your party.` };
      }
      // Refusal. Contextual, not a wall.
      const no = goal === 'alone'
        ? `"I work alone. Nothing personal. ...It's a little personal."`
        : trust < 30
          ? `"I don't know you well enough for that. Ask me again when we've survived something together."`
          : temp === 'cautious'
            ? `"Out there? With YOU leading? ...Let me think about it."`
            : `"Not right now. I've got my own things to handle."`;
      this.say(`${dname} shakes their head. ${no}`);
      return { ok: false, msg: `${dname} declined.` };
    },

    dismissFromParty(vid) {
      const v = this.partyState();
      const dname = this.displayName(vid);
      if (!this.inParty(vid)) return { ok: false, msg: 'They\'re not in your party.' };
      v.party = v.party.filter(id => id !== vid);
      this.bumpTrust(vid, -8);
      const temp = this.npcTemper(vid);
      const line = temp === 'prickly' || temp === 'bold'
        ? `"Fine. Your loss." (They'll remember this.)`
        : temp === 'warm' || temp === 'gentle'
          ? `"Oh. ...Okay. I understand." (They don't, quite.)`
          : `"Alright."`;
      this.say(`You ask ${dname} to leave the party. ${line}`);
      // Dismissal stings. Gossip may follow.
      if (Math.random() < 0.35) {
        this.seedGossip('dismissed', { generous: -8, honest: -4 }, [vid]);
      }
      return { ok: true, msg: `${dname} left the party.` };
    },

    npcLeavesParty(vid, reason) {
      const v = this.partyState();
      if (!this.inParty(vid)) return;
      v.party = v.party.filter(id => id !== vid);
      const dname = this.displayName(vid);
      const lines = {
        scared: `"I can't do this anymore. I'm sorry. I'm going back."`,
        angry: `"I'm done. Don't ask me why. You know why."`,
        goal: `"I need to handle something on my own. Don't wait up."`,
        trust: `"I don't trust you anymore. That's it. That's the whole reason."`,
      };
      this.say(`🚶 ${dname} leaves your party. ${lines[reason] || lines.goal}`);
      if (reason === 'angry' || reason === 'trust') this.bumpTrust(vid, -10);
    },

    // ---------- PRE-SYSTEM FOLLOWERS ----------
    // No UI. No cap. Just relationships. High trust + compatible goals.

    followerCheck() {
      const v = this.partyState();
      if (this.state.systemArrived) return; // post-System uses formal parties
      const fols = v.followers || [];
      if (fols.length >= 2) return;
      const trust = v.trust || {};
      for (const rid of (v.roster || [])) {
        if (rid === this.villagerId) continue;
        if (fols.includes(rid) || this.inParty(rid)) continue;
        if ((trust[rid] || 10) < 65) continue;
        if (this.npcGoal(rid) === 'alone') continue;
        if (Math.random() < 0.12) {
          v.followers.push(rid);
          const dname = this.displayName(rid);
          const lines = [
            `"I'm coming with you." (No discussion. Just fact.)`,
            `"You shouldn't go out there alone. I'm coming."`,
            `"I want to see what's out there too. Lead on."`,
          ];
          this.say(`🚶 ${dname}: ${lines[Math.floor(Math.random() * lines.length)]}`);
        }
      }
      // Followers drift off: trust cratered, or terror.
      for (const fid of [...(v.followers || [])]) {
        const t = (trust[fid] || 10);
        const n = this.npcNeeds(fid);
        if (t < 40 || (n && n.fear > 85)) {
          v.followers = v.followers.filter(id => id !== fid);
          this.say(`${this.displayName(fid)} hangs back. "I'll... catch up later." They don't.`);
        }
      }
    },

    // ---------- TRAVEL WITH PARTY ----------

    placePartyAtPlayer() {
      const v = this.partyState();
      v.positions = v.positions || {};
      const px = this.state.scholar.mx ?? 4, py = this.state.scholar.my ?? 4;
      let detail = null;
      try { detail = this.genDetail(this.map.px, this.map.py); } catch (e) {}
      const freeNear = () => {
        for (let r = 1; r <= 3; r++) {
          const opts = [];
          for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            const nx = px + dx, ny = py + dy;
            if (nx < 0 || nx > 8 || ny < 0 || ny > 8 || (nx === px && ny === py)) continue;
            if (detail) {
              const cell = detail[ny] && detail[ny][nx];
              if (cell && this.cellProps(cell).blocks) continue;
            }
            opts.push({ mx: nx, my: ny });
          }
          if (opts.length) return opts[Math.floor(Math.random() * opts.length)];
        }
        return { mx: px, my: py };
      };
      for (const vid of this.travelingWith()) {
        const spot = freeNear();
        v.positions[vid] = { mx: spot.mx, my: spot.my };
        // They're WITH you now — engaged, not wandering.
        this.setEngaged(vid, 3);
      }
    },

    // ---------- PARTY BANTER ----------
    // Members comment on things. They talk to each other, not just you.

    partyBanter(trigger) {
      const members = this.partyMembers();
      if (!members.length) return;
      if (Math.random() < 0.45) return; // not every time. restraint.
      const vid = members[Math.floor(Math.random() * members.length)];
      const dname = this.displayName(vid);
      const temp = this.npcTemper(vid);
      const pools = {
        travel: [
          `"Huh. Never been this way before."`,
          temp === 'cautious' ? `"This feels exposed. Let's not linger."` : `"Smell that? Something's different here."`,
          temp === 'bold' ? `"Finally. I was getting bored."` : `"Stay close, yeah?"`,
        ],
        combat: [
          `"Stay behind me!"`,
          temp === 'cautious' ? `"I didn't sign up for THIS."` : `"Come on then!"`,
          `"Watch its ${Math.random() < 0.5 ? 'left' : 'right'} side!"`,
        ],
        night: [
          `"I hate how quiet it gets."`,
          temp === 'warm' ? `"At least we're together."` : `"Eyes open."`,
        ],
        victory: [
          `"We make a good team."`,
          temp === 'dry' ? `"That was almost fun."` : `"Ha! Did you see that?!"`,
        ],
        food: [
          temp === 'practical' || temp === 'steady' ? `"We should ration this."` : `"I'm starving. Just saying."`,
        ],
      };
      const pool = pools[trigger];
      if (!pool || !pool.length) return;
      const line = pool[Math.floor(Math.random() * pool.length)];
      this.say(`💬 ${dname}: ${line}`);
      // Sometimes two members exchange a line. The party has its own life.
      if (members.length >= 2 && Math.random() < 0.3) {
        const other = members.find(id => id !== vid);
        const oname = this.displayName(other);
        const replies = [`"Agreed."`, `"You would say that."`, `"Ha!"`, `"...Yeah."`];
        this.say(`💬 ${oname}: ${replies[Math.floor(Math.random() * replies.length)]}`);
      }
    },

    // ---------- BETRAYAL ----------
    // Trust is not safety. Betrayal runs on personality + desperation +
    // opportunity. A high-trust backstab is MORE devastating, not less likely.

    // partyBetrayalState: per-villager party-betrayal record.
    // NOTE (2026-10-07): was `betrayalState(vid)` — shadowed by betrayal.js's
    // village-level `betrayalState()` (same name, Object.assign order) in the
    // full production module list. The shadow made every party caller read
    // the VILLAGE betrayal object: one global intent for all members, and
    // betrayalCueCheck crashed on undefined cuesSeen (swallowed by wrapper
    // try/catch, so cues silently never fired). Renamed to survive load order.
    partyBetrayalState(vid) {
      const v = this.partyState();
      v.betray[vid] = v.betray[vid] || { intent: false, evaluated: false, suspicion: 0, cuesSeen: [] };
      const bs = v.betray[vid];
      // repair legacy/malformed entries (e.g. written while the old name was
      // shadowed) so cues never crash on a missing array.
      if (!Array.isArray(bs.cuesSeen)) bs.cuesSeen = [];
      if (typeof bs.suspicion !== 'number') bs.suspicion = 0;
      return bs;
    },

    // Do they plan to betray you? Evaluated on join, re-evaluated when desperate.
    betrayalIntent(vid, force) {
      const bs = this.partyBetrayalState(vid);
      if (bs.evaluated && !force) return bs.intent;
      bs.evaluated = true;
      const temp = this.npcTemper(vid);
      const goal = this.npcGoal(vid);
      const needs = this.npcNeeds(vid);
      let score = 0;
      // Personality: the cold and the hungry-eyed.
      if (temp === 'prickly') score += 25;
      if (temp === 'intense') score += 20;
      if (temp === 'restless') score += 10;
      if (temp === 'warm' || temp === 'gentle') score -= 30;
      if (temp === 'steady') score -= 10;
      // Goals: desperation and ambition.
      if (goal === 'survive') score += 25;
      if (goal === 'lead') score += 20;
      if (goal === 'escape') score += 10;
      if (goal === 'belong' || goal === 'protect' || goal === 'feed') score -= 20;
      // Desperation: a starving person does starving-person math.
      if (needs && (needs.hunger || 0) > 80) score += 25;
      if (needs && (needs.fear || 0) > 85) score += 10;
      // DARK: the malicious ones were already doing this math. The benign
      // ones never do — they're unsettling, not dangerous.
      const dark = this.npcDark ? this.npcDark(vid) : null;
      if (dark && dark.kind === 'malicious') score += 45;
      // NOTE: trust is deliberately NOT a factor. High trust doesn't protect you.
      // The System finds this hilarious.
      const roll = Math.random() * 100;
      bs.intent = roll < score;
      return bs.intent;
    },

    reevaluateBetrayal() {
      // Desperation changes people. Re-check when the village is starving.
      const v = this.state.village;
      const pantryLow = (v.pantryKcal || 99999) < 2000;
      for (const vid of this.travelingWith()) {
        const bs = this.partyBetrayalState(vid);
        if (!bs.intent && pantryLow && Math.random() < 0.15) {
          this.betrayalIntent(vid, true);
        }
      }
    },

    // Is the moment right? Isolation + your weakness + something worth taking.
    betrayalOpportunity(vid) {
      const atHaven = this.map && this.map.px === 3 && this.map.py === 3;
      if (atHaven) return 0; // too many witnesses at home
      const vpos = (this.state.village.positions || {});
      let witnesses = 0;
      for (const [rid, pos] of Object.entries(vpos)) {
        if (rid === vid || rid === this.villagerId) continue;
        if (!(this.state.village.roster || []).includes(rid)) continue;
        witnesses++;
      }
      if (witnesses > 1) return 0;
      let score = 50; // isolated is already tempting
      const hp = this.state.scholar.health || 100;
      if (hp < 60) score += 25;
      if (hp < 30) score += 15;
      // What's in your pack? Worth killing for?
      const inv = this.state.scholar.inventory || [];
      const foodUnits = inv.filter(i => i.kcal > 0).reduce((a, i) => a + (i.units || 1), 0);
      if (foodUnits >= 5) score += 15;
      if (witnesses === 0) score += 10;
      return Math.min(100, score);
    },

    // Warning signs. NOT from the trust meter — from watching.
    // Observant/social player intelligences pick these up more often.
    betrayalCueCheck() {
      for (const vid of this.travelingWith()) {
        const bs = this.partyBetrayalState(vid);
        if (!bs.intent || bs.cuesSeen.length >= 3) continue;
        if (Math.random() > 0.18) continue;
        const dname = this.displayName(vid);
        const cues = [
          `${dname} has been watching your pack a little too closely.`,
          `${dname} keeps checking the treeline — not for monsters. For witnesses.`,
          `${dname} asked what's in your pack. Twice. Casually.`,
          `You catch ${dname} weighing something in their hand. A rock. They put it down when you look.`,
          `${dname} suggested splitting up. "Cover more ground." Alone. In the woods.`,
        ];
        const avail = cues.filter((_, i) => !bs.cuesSeen.includes(i));
        if (!avail.length) continue;
        const idx = cues.indexOf(avail[Math.floor(Math.random() * avail.length)]);
        bs.cuesSeen.push(idx);
        bs.suspicion = Math.min(100, bs.suspicion + 30);
        // Observant/social minds notice. Others might miss it.
        const sharp = this.playerSharp ? this.playerSharp() : false;
        if (sharp || Math.random() < 0.5) {
          this.say(`👁 ${cues[idx]} (Something feels off.)`);
        }
      }
    },

    playerSharp() {
      // Observant/social intelligence notices betrayal cues.
      // Check abilities and cognitive style.
      try {
        if (this.hasAbility('night_eyes') || this.hasAbility('eyes_in_back')) return true;
      } catch (e) {}
      return false;
    },

    // The NPC strikes. No more warnings.
    npcBetrays(vid) {
      if (this.tbfight) return; // not mid-fight
      const v = this.partyState();
      const dname = this.displayName(vid);
      this.say(`🔪 ${dname}'s expression changes. Not anger — arithmetic.`);
      const lines = [
        `"Nothing personal. I need what's in your pack more than you do."`,
        `"You should've seen this coming. That's the worst part — you COULD have."`,
        `"The System loves a betrayal arc. I'm just giving the audience what they want."`,
      ];
      this.say(`${dname}: ${lines[Math.floor(Math.random() * lines.length)]}`);
      // They're out of the party. They're a hostile now.
      v.party = (v.party || []).filter(id => id !== vid);
      v.followers = (v.followers || []).filter(id => id !== vid);
      this.startBetrayalCombat(vid, { aggressor: 'npc' });
    },

    // YOU strike first. The classic MMO move.
    playerAttacks(vid) {
      if (this.over) return false; // the dead don't start fights
      if (this.tbfight) { this.say('Not in the middle of a fight.'); return false; }
      const v = this.partyState();
      const dname = this.displayName(vid);
      const wasParty = this.inParty(vid);
      const wasFollower = this.isFollower(vid);
      this.say(`⚔ You turn on ${dname}.`);
      const lines = [
        `No warning. That's the point.`,
        `Your hands move before your conscience catches up.`,
        `They see it in your face a half-second before. Too late.`,
      ];
      this.say(lines[Math.floor(Math.random() * lines.length)]);
      v.party = (v.party || []).filter(id => id !== vid);
      v.followers = (v.followers || []).filter(id => id !== vid);
      this._betrayAggressor = 'player';
      this._betrayVictimWasParty = wasParty || wasFollower;
      this.startBetrayalCombat(vid, { aggressor: 'player' });
      return true;
    },

    // Betrayal combat: no monster. You, the betrayer, and whoever's still loyal.
    startBetrayalCombat(vid, opts) {
      opts = opts || {};
      const s = this.state.scholar;
      const px = s.mx ?? 4, py = s.my ?? 4;
      const vp = this.vpOf(vid);
      const detail = this.genDetail(this.map.px, this.map.py);
      const blocked = (x, y) => {
        const cell = detail[y] && detail[y][x];
        return this.cellProps(cell).blocks;
      };
      // BETRAYAL SPAWN (Steve 2026-10-06): every fighter gets their OWN tile.
      // Same stacking bug class as the uprising fix (justice.js ff9daaf): the
      // old code called freeSpotNear fresh per fighter with the same anchor
      // and no occupancy tracking, so the betrayer and every loyal party
      // member stacked on ONE tile. Door tiles are never spawn points: the
      // door is the player's way out, it stays clear.
      const taken = new Set([px + ',' + py]);
      const freeSpotNear = (cx, cy) => {
        for (let r = 1; r <= 4; r++) {
          for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || nx > 8 || ny < 0 || ny > 8 || taken.has(nx + ',' + ny)) continue;
            const cell = detail[ny] && detail[ny][nx];
            if (cell === 'door') continue; // the escape stays clear
            if (!blocked(nx, ny)) { taken.add(nx + ',' + ny); return { x: nx, y: ny }; }
          }
        }
        // No free tile in range: ring-offset fallback so fighters never stack.
        const fb = { x: Math.max(0, Math.min(8, cx + taken.size)), y: Math.max(0, Math.min(8, cy)) };
        taken.add(fb.x + ',' + fb.y);
        return fb;
      };
      const fighters = [];
      fighters.push({
        key: 'p', kind: 'player', name: 'You', emoji: '🧑',
        hp: s.health, maxHp: this.maxHealth ? this.maxHealth() : 100,
        speed: this.playerSpeed(), mx: px, my: py,
        alive: true, fled: false, moveLeft: 0, acted: false, aimed: false,
      });
      // The betrayer: hostile. Fights like a person — brave if bold, cautious if scared.
      const temp = this.npcTemper(vid);
      const bspot = freeSpotNear(px + 2, py);
      fighters.push({
        key: 'h_' + vid, kind: 'hostile', villagerId: vid,
        name: this.displayName(vid), emoji: '🔪',
        hp: 40, maxHp: 40, speed: 3, mx: bspot.x, my: bspot.y,
        alive: true, fled: false, moveLeft: 0, acted: false,
        ai: temp === 'bold' ? 'brave' : temp === 'cautious' ? 'cautious' : 'brave',
        betrayal: true,
      });
      // Loyal party members fight WITH you — against their former companion.
      for (const pid of this.partyMembers()) {
        if (pid === vid) continue;
        const pvp = this.vpOf(pid);
        const ptemp = this.npcTemper(pid);
        const pspot = freeSpotNear(px - 1, py + 1);
        fighters.push({
          key: 'v_' + pid, kind: 'villager', villagerId: pid,
          name: this.displayName(pid), emoji: '🧍',
          hp: 30, maxHp: 30, speed: 3, mx: pspot.x, my: pspot.y,
          alive: true, fled: false,
          ai: ptemp === 'bold' ? 'brave' : ptemp === 'cautious' ? 'cautious' : 'helpful',
          helped: false,
        });
      }
      this.tbfight = {
        fighters,
        order: (globalThis.Scattering.combat || {}).turnOrder
          ? globalThis.Scattering.combat.turnOrder(fighters)
          : fighters.map(f => f.key),
        turnIdx: 0, round: 1,
        over: false, result: null,
        betrayal: true, betrayer: vid, aggressor: opts.aggressor || 'npc',
      };
      try { this.villageEvent('betrayal'); } catch (e) {}
      // The opening is an ATTACK, not a murder — the outcome isn't known yet.
      // If it becomes a killing, the aftermath upgrades the village's read.
      try { this.observe(opts.aggressor === 'player' ? 'attack' : 'fight', { target: vid }); } catch (e) {}
      this.say(`⚔ BETRAYAL. ${opts.aggressor === 'player' ? 'You started this.' : 'They started this.'} Turn-based now.`);
      this.sysSay(opts.aggressor === 'player'
        ? 'OH!!! THE PLAYER IS DOING A MURDER!!! The audience is LOSING ITS MIND!!!'
        : 'BETRAYAL ARC!!! We CALLED it!!! The gamblers who bet on treachery are RICH!!!');
      this.audioEvent('combatStart');
      // Seed aftermath context at combat START so flee outcomes still resolve.
      this._lastBetrayal = {
        betrayer: vid, aggressor: opts.aggressor || 'npc',
        witnesses: fighters.filter(x => x.kind === 'villager' && x.alive).map(x => x.villagerId),
        betrayerDead: false,
      };
      this.tbBeginTurn();
      return this.tbfight;
    },

    // Aftermath: who saw, who tells, what it costs.
    betrayalAftermath() {
      const f = this._lastBetrayal;
      if (!f) return;
      const v = this.state.village;
      const betrayer = f.betrayer, aggressor = f.aggressor;
      const bname = this.displayName(betrayer);
      // Witnesses: surviving loyal party members who were in the fight.
      const witnesses = (f.witnesses || []).filter(id => (v.roster || []).includes(id));
      if (aggressor === 'player') {
        // DEAD vs ALIVE is the whole story: a fled or yielded victim is a
        // living witness, not a corpse. The journal must never confess to a
        // killing that didn't happen — it contradicts the fight two lines up.
        const dead = !!f.betrayerDead;
        if (witnesses.length) {
          if (dead) {
            this.seedGossip('murder', this.murderDims(betrayer), witnesses);
            this.say(`They saw. ${witnesses.map(id => this.displayName(id)).join(', ')} saw what you did. The village will hear.`);
          } else {
            // Assault, not murder — and the victim is alive to tell it themselves.
            this.seedGossip('attack', { honest: -25, generous: -20, brave: 5, competent: 0 }, witnesses);
            this.say(`They saw what you did to ${bname} — and ${bname} is alive to tell it. The village will hear.`);
          }
        } else if (dead) {
          // No witnesses. But the journal knows.
          v.unsolved = v.unsolved || [];
          v.unsolved.push({ who: betrayer, day: this.state.scholar.day });
          this.say(`${bname} is gone. No one saw. The woods keep your secret — for now.`);
          try {
            if (this.journalNote) this.journalNote('people', betrayer, `I killed them. No witnesses. I don't want to write why.`);
          } catch (e) {}
        } else {
          // No witnesses — but the victim ran, alive. They know what you did.
          // The village will notice the absence; you know exactly why.
          this.say(`${bname} ran. No one saw it happen — but THEY did. They're out there now, and they know exactly what you did.`);
          try {
            if (this.journalNote) this.journalNote('people', betrayer, `They got away. I beat them until they ran. If they talk, the village hears it from them first.`);
          } catch (e) {}
        }
        // Everyone's trust in you takes a hit once gossip spreads — handled by gossip dims.
        // Immediate: surviving party members lose trust NOW.
        for (const wid of witnesses) this.bumpTrust(wid, -25);
      } else {
        // NPC betrayed you. You survived (or your party killed them).
        if (witnesses.length) {
          this.seedGossip('betrayed', { honest: -5, competent: -10 }, witnesses);
          this.say(`The village hears how ${bname} turned on you. "You bring killers into your party," someone mutters.`);
          for (const wid of witnesses) this.bumpTrust(wid, -8);
        }
      }
      // The betrayer is dead or fled — clean up betrayal state.
      if (v.betray) delete v.betray[betrayer];
      this._lastBetrayal = null;
      this._betrayAggressor = null;
    },

    // ---------- LURE ----------
    // "Hey, I found something in the woods. Come see." Is it real? Or a trap?

    lureCheck() {
      const v = this.partyState();
      if (v.lure) return; // one lure at a time
      const atHaven = this.map && this.map.px === 3 && this.map.py === 3;
      if (!atHaven) return;
      for (const vid of this.travelingWith()) {
        const bs = this.partyBetrayalState(vid);
        if (!bs.intent) continue;
        if (Math.random() > 0.2) continue;
        const dname = this.displayName(vid);
        const lures = [
          `"Hey — I found something in the woods. North. Come see? Just us."`,
          `"There's a cache out there, I'm sure of it. Help me carry it back?"`,
          `"Walk with me? I need air. And... I want to show you something."`,
        ];
        v.lure = { vid, day: this.state.scholar.day };
        this.say(`🪤 ${dname}: ${lures[Math.floor(Math.random() * lures.length)]}`);
        this.say(`(They want you to go somewhere isolated. With them. You can feel the shape of it — or not.)`);
        break;
      }
    },

    // ---------- OPPORTUNITY SWEEP ----------
    // Called on travel arrival and batch turns. The world does its math.

    betrayalSweep() {
      if (this.tbfight) return; // never interrupt an active fight
      this.reevaluateBetrayal();
      this.betrayalCueCheck();
      this.lureCheck();
      // Does anyone strike?
      for (const vid of this.travelingWith()) {
        const bs = this.partyBetrayalState(vid);
        if (!bs.intent) continue;
        const opp = this.betrayalOpportunity(vid);
        if (opp >= 70 && Math.random() < 0.5) {
          this.npcBetrays(vid);
          return; // one betrayal at a time. obviously.
        }
      }
    },

    // ---------- UI HELPERS ----------

    partyButtonHtml(vid) {
      const v = this.partyState();
      const sys = !!this.state.systemArrived;
      let html = '';
      if (!sys) {
        // Pre-System: no formal party. But you can see who's following you.
        if (this.isFollower(vid)) {
          html += ` <span class="small" style="opacity:.6">🚶 following you</span>`;
        }
        return html;
      }
      if (!v.partyUnlocked) return html;
      if (this.inParty(vid)) {
        html += ` <span class="small" style="opacity:.7">👥 in your party</span>`;
        html += ` <button class="btn sm ghost" data-act="dismissParty">🚶 Ask to leave</button>`;
        // NOTE: no Attack button here anymore — attack lives on the person
        // card as a deliberate two-tap action. No duplication.
      } else if ((v.roster || []).includes(vid)) {
        // NOTE: no Invite button — invites happen in conversation
        // ("Want to come with me?"), discovered via the System unlock.
        // If the party is full, say so quietly.
        if (this.partyFull()) html += ` <span class="small" style="opacity:.6">👥 party full (${this.partyCap()}/${this.partyCap()})</span>`;
      }
      return html;
    },

    partyHud() {
      if (!this.partyUnlocked()) return '';
      const n = this.partyMembers().length;
      const names = this.partyMembers().map(id => this.displayName(id).split(' ')[0]).join(', ');
      return `<span class="small" style="opacity:.8" title="${names ? 'With you: ' + names : 'No companions'}">👥 ${n}/${this.partyCap()}</span>`;
    },

    // ---------- HOSTILE TURN ----------
    // A betrayer's combat AI: human, not monster. Closes distance, strikes,
    // flees when losing. Never heals you — that's the whole point.
    tbHostileTurn(h) {
      const f = this.tbfight;
      if (!f || f.over) return;
      const S_combat = globalThis.Scattering.combat || {};
      const blocked = (x, y) => this.tbBlocked(x, y) && !(x === h.mx && y === h.my);
      // nearest foe: you, or whoever's still loyal
      let foe = null, bestD = 99;
      for (const o of f.fighters) {
        if (!o.alive || o.fled || o.key === h.key) continue;
        if (o.kind !== 'player' && o.kind !== 'villager') continue;
        const d = Math.max(Math.abs(o.mx - h.mx), Math.abs(o.my - h.my));
        if (d < bestD) { bestD = d; foe = o; }
      }
      if (!foe) return;
      const hpFrac = h.hp / h.maxHp;
      const temp = this.npcTemper ? this.npcTemper(h.villagerId) : 'steady';
      const bold = temp === 'bold', cautious = temp === 'cautious';

      // BEG: first time they're really hurt, the person comes out.
      // Nobody wants to be here. Not even them.
      if (!h._begged && hpFrac < 0.6) {
        h._begged = true;
        const begs = [
          `"Please. Please don't —" ${h.name} is backing away, hands up.`,
          `"Stop! STOP!" ${h.name}'s voice cracks. They're crying now.`,
          `"I don't want to do this!" ${h.name} is shaking. Everyone is shaking.`,
        ];
        this.say(`🔪 ${begs[Math.floor(Math.random() * begs.length)]}`);
        // begging costs them the turn. they're not fighting right now.
        if (this.tbEndCheck()) return;
        return;
      }
      // YIELD: broken, they give up. Most human fights end here, not in death.
      // (Bold ones almost never yield. Cautious ones yield early.)
      const yieldAt = bold ? 0.12 : cautious ? 0.45 : 0.3;
      if (!h._yielded && hpFrac < yieldAt && Math.random() < 0.55) {
        h._yielded = true;
        h.yielded = true;
        const yields = [
          `${h.name} drops to their knees. "I yield. I YIELD. Please."`,
          `${h.name} throws their hands up. "Done. I'm done. You win." They're sobbing.`,
          `"No more." ${h.name} sinks down, done fighting. Done with all of it.`,
        ];
        this.say(`🔪 ${yields[Math.floor(Math.random() * yields.length)]}`);
        this.tbEnd('betrayal_yielded');
        return;
      }
      // FREEZE: panic locks them up. (Cautious freeze more.)
      const freezeCh = cautious ? 0.25 : bold ? 0.05 : 0.15;
      if (hpFrac < 0.5 && Math.random() < freezeCh) {
        const fr = [
          `${h.name} freezes. Just... stops. Staring at nothing.`,
          `${h.name} can't move. Panic has them by the throat.`,
        ];
        this.say(`🔪 ${fr[Math.floor(Math.random() * fr.length)]}`);
        if (this.tbEndCheck()) return;
        return;
      }
      // FLEE: losing badly? run. (existing)
      if (hpFrac < 0.3 && Math.random() < 0.4) {
        h.fled = true;
        this.say(`🔪 ${h.name} breaks and runs — sobbing, stumbling, gone into the trees.`);
        const v = this.state.village;
        v.fledBetrayers = v.fledBetrayers || [];
        v.fledBetrayers.push({ vid: h.villagerId, day: this.state.scholar.day });
        if (this.tbEndCheck()) return;
        return;
      }
      // DESPERATE FIGHT: they don't want this. Nobody does. But they're here.
      let moves = 0;
      while (moves < (h.speed || 3)) {
        const d = Math.max(Math.abs(foe.mx - h.mx), Math.abs(foe.my - h.my));
        if (d <= 1) break;
        const nx = h.mx + Math.sign(foe.mx - h.mx);
        const ny = h.my + Math.sign(foe.my - h.my);
        if (nx < 0 || nx > 8 || ny < 0 || ny > 8 || blocked(nx, ny)) break;
        h.mx = nx; h.my = ny; moves++;
      }
      const d2 = Math.max(Math.abs(foe.mx - h.mx), Math.abs(foe.my - h.my));
      if (d2 <= 1) {
        const dmg = S_combat.roll ? S_combat.roll([6, 12]) : 8;
        // Not cool verbs. Desperate ones.
        // NOTE on keying: templates are NAME-FREE ({n}/{t} placeholders) so
        // the fight-scoped pickFresh cycle ('humanRetaliate' on tbfight._fresh)
        // dedupes the TEMPLATE across speakers — no identical line from 2+
        // attackers in one scene, deterministically, until all 16 are used.
        // (Embedding h.name in the pool defeats the cycle: "Malik swings…"
        // !== "Rosa swings…" as tracked text. Per-fighter keys can't fix it
        // either: 4 attackers > N verbs, and random first-picks still collide.)
        // Pool is deep (16) so a full uprising brawl (~11-13 barks) never
        // exhausts it.
        const tgt = foe.kind === 'player' ? 'you' : foe.name;
        const verbs = [
          `{n} swings wildly at {t} — eyes shut, screaming.`,
          `{n} lashes out, panicking. It connects anyway. That's the worst part.`,
          `{n} fights like a cornered animal. Because that's what this is.`,
          `{n} throws themself at {t}, all elbows and terror.`,
          `{n} swings and misses, swings again — crying now, still swinging.`,
          `{n} gets a hand on {t} and doesn't let go. None of this is fighting. It's drowning.`,
          `{n} hits {t} with the flat panic of someone who has never done this before.`,
          `{n} screams while they swing — at {t}, at themselves, at the whole night.`,
          `{n} lunges, off-balance, desperate to end it before they have to feel it.`,
          `{n}'s hands are shaking so hard the blow lands sideways. It still lands.`,
          `{n} doesn't aim. Aiming would mean deciding. They just swing.`,
          `{n} catches {t} with a wild backhand and looks horrified at their own arm.`,
          `{n} barrels into {t} shoulder-first, the way you'd shove a door that's stuck.`,
          `{n} swings at {t} and keeps swinging after it lands, like stopping would be worse.`,
          `{n} grabs for {t}'s weapon hand and they go down together, scrabbling.`,
          `{n} strikes at {t} with a sound caught between a sob and a snarl.`,
        ];
        this.say(`🔪 ${this.pickFresh(verbs, 'humanRetaliate').replace('{n}', () => h.name).replace('{t}', () => tgt)}`);
        this.tbDamage(foe.key, dmg, h.name);
        // Hurting someone costs the hurter too. Even them.
      } else {
        // Same fight-scoped no-repeat semantics as the attack verbs above.
        const circ = [
          `{n} backs off, breathing hard, looking for a way out that isn't through you.`,
          `{n} circles — not hunting an opening. Looking for an exit.`,
          `{n} keeps their distance, eyes flicking past you to the dark behind you.`,
          `{n} feints toward you, then checks themself — they don't want to close.`,
          `{n} paces a wide arc, weapon low. Stalling. Hoping you'll run first.`,
          `{n} glances over their shoulder. Whatever they're looking for, it isn't you.`,
        ];
        this.say(`🔪 ${this.pickFresh(circ, 'humanCircle').replace('{n}', () => h.name)}`);
      }
      if (this.tbEndCheck()) return;
    },
  };

  // Attach.
  Object.assign(Game, methods);

  // ---------- WRAPPERS ----------
  // Hook into existing flows without editing game.js.

  const origCheckSystemArrival = Game.checkSystemArrival;
  Game.checkSystemArrival = function () {
    const wasArrived = !!this.state.systemArrived;
    const r = origCheckSystemArrival.call(this);
    // Party unlock fires on the same beat as arrival.
    if (this.state.systemArrived && !wasArrived) {
      try { this.unlockPartySystem(); } catch (e) {}
    }
    // Cap raises at progression milestones.
    if (this.state.systemArrived) {
      try { this.maybeRaisePartyCap(); } catch (e) {}
    }
    return r;
  };

  const origTravelTo = Game.travelTo;
  Game.travelTo = function (x, y, force) {
    const r = origTravelTo.call(this, x, y, force);
    try {
      // Party travels WITH you. They're at your new node, near you.
      this.placePartyAtPlayer();
      this.partyBanter('travel');
      // Arrival at a new node: betrayal math runs.
      this.betrayalSweep();
    } catch (e) {}
    return r;
  };

  const origStartCombat = Game.startCombat;
  Game.startCombat = function (monsterId) {
    const r = origStartCombat.call(this, monsterId);
    try {
      const f = this.tbfight;
      if (f && !f.betrayal) {
        // Party members are WITH you — they join even beyond the 4-square radius.
        const existing = new Set(f.fighters.map(x => x.villagerId).filter(Boolean));
        const detail = this.genDetail(this.map.px, this.map.py);
        const px = this.state.scholar.mx ?? 4, py = this.state.scholar.my ?? 4;
        for (const pid of this.partyMembers()) {
          if (existing.has(pid)) continue;
          const pos = (this.state.village.positions || {})[pid];
          const ptemp = this.npcTemper(pid);
          f.fighters.push({
            key: 'v_' + pid, kind: 'villager', villagerId: pid,
            name: this.displayName(pid), emoji: '🧍',
            hp: 30, maxHp: 30, speed: 3,
            mx: pos ? pos.mx : px, my: pos ? pos.my : py,
            alive: true, fled: false,
            ai: ptemp === 'bold' ? 'brave' : ptemp === 'cautious' ? 'cautious' : 'helpful',
            helped: false,
          });
        }
        if (f.fighters.some(x => x.kind === 'villager' && !existing.has(x.villagerId))) {
          f.order = (globalThis.Scattering.combat || {}).turnOrder
            ? globalThis.Scattering.combat.turnOrder(f.fighters)
            : f.fighters.map(x => x.key);
        }
        this.partyBanter('combat');
      }
    } catch (e) {}
    return r;
  };

  const origNpcBatchTurn = Game.npcBatchTurn;
  Game.npcBatchTurn = function () {
    const r = origNpcBatchTurn.call(this);
    try {
      // Pre-System: followers volunteer.
      this.followerCheck();
      // Betrayal math ticks in the background.
      if (Math.random() < 0.3) this.betrayalSweep();
      // Party members stay near you on batch turns — they travel WITH you,
      // not wander off. (Engagement already pins them; this is the leash.)
      const vpos = (this.state.village.positions || {});
      const px = this.state.scholar.mx ?? 4, py = this.state.scholar.my ?? 4;
      for (const vid of this.travelingWith()) {
        const pos = vpos[vid];
        if (!pos) continue;
        const d = Math.max(Math.abs(pos.mx - px), Math.abs(pos.my - py));
        if (d > 3) {
          // drift back toward you. they're with you, not gone.
          pos.mx = Math.max(0, Math.min(8, pos.mx + Math.sign(px - pos.mx)));
          pos.my = Math.max(0, Math.min(8, pos.my + Math.sign(py - pos.my)));
        }
      }
    } catch (e) {}
    return r;
  };

  const origTbVillagerFalls = Game.tbVillagerFalls;
  Game.tbVillagerFalls = function (t) {
    // Capture betrayal context BEFORE the original cleans up.
    const f = this.tbfight;
    const wasBetrayal = !!(f && f.betrayal);
    const vid = t.villagerId;
    const wasHostile = t.kind === 'hostile';
    // Who's still standing to witness?
    let witnesses = [];
    if (f) {
      witnesses = f.fighters
        .filter(x => x.kind === 'villager' && x.alive && x.villagerId !== vid)
        .map(x => x.villagerId);
    }
    const r = origTbVillagerFalls.call(this, t);
    try {
      const v = this.partyState();
      // Remove from party/followers — the dead don't travel.
      v.party = (v.party || []).filter(id => id !== vid);
      v.followers = (v.followers || []).filter(id => id !== vid);
      if (wasBetrayal) {
        this._lastBetrayal = Object.assign(this._lastBetrayal || {}, {
          betrayer: f.betrayer, aggressor: f.aggressor,
          betrayerDead: wasHostile, witnesses,
        });
        // Defer aftermath until combat fully resolves — see tbEnd wrapper.
      } else if (t.kind === 'villager') {
        // A party member died fighting monsters beside you. Grief, not suspicion.
        if (this._wasInParty && this._wasInParty[vid]) {
          this.say(`You carry the weight of it. They died beside you.`);
        }
      }
    } catch (e) {}
    return r;
  };

  // Track party membership at combat start for death messaging.
  const _origTbBeginTurn = Game.tbBeginTurn;
  Game.tbBeginTurn = function () {
    try {
      this._wasInParty = {};
      const f = this.tbfight;
      if (f) for (const x of f.fighters) {
        if (x.kind === 'villager' && x.villagerId) this._wasInParty[x.villagerId] = true;
      }
    } catch (e) {}
    return _origTbBeginTurn.call(this);
  };

  // Combat end: run betrayal aftermath.
  // tbEndCheck ends combat when no MONSTERS fight — a pure betrayal fight
  // would end instantly. Wrap it: in betrayal fights, hostiles are the enemy.
  const origTbEndCheck = Game.tbEndCheck;
  Game.tbEndCheck = function () {
    const f = this.tbfight;
    if (f && f.betrayal && !f.over) {
      const p = this.tbFighter('p');
      const hostilesAlive = f.fighters.some(x => x.kind === 'hostile' && x.alive && !x.fled);
      if (!hostilesAlive) {
        // Betrayer dead or fled. Resolve as a win (you survived) or routed.
        const betrayer = f.fighters.find(x => x.kind === 'hostile');
        this.tbEnd(betrayer && !betrayer.alive ? 'betrayal_won' : 'betrayal_routed');
        return true;
      }
      if (p && (!p.alive || p.fled)) {
        if (!p.alive) {
          this.state.scholar.health = Math.max(0, p.hp);
          if (this.maybeCheatDeath && this.maybeCheatDeath()) {
            p.hp = this.state.scholar.health;
            if (p.hp > 0) { p.alive = true; this.say('You refuse to stay down. The fight goes on.'); return false; }
          }
          this.tbEnd('lost');
        } else {
          this.tbEnd('fled');
        }
        return true;
      }
      return false;
    }
    return origTbEndCheck.call(this);
  };

  // tbEnd: betrayal results skip the monster-loot path (no mdef to read).
  const origTbEnd = Game.tbEnd;
  Game.tbEnd = function (result) {
    const f = this.tbfight;
    const wasBetrayalFight = !!(f && f.betrayal);
    if (wasBetrayalFight && (result === 'betrayal_won' || result === 'betrayal_routed' || result === 'betrayal_yielded')) {
      f.over = true; f.result = result;
      if (this.clearTelegraph) this.clearTelegraph();
      const s = this.state.scholar;
      const p = this.tbFighter('p');
      if (p) s.health = Math.max(0, p.hp);
      for (const v of f.fighters) {
        if (v.kind === 'villager' && v.alive && !v.fled) this.tbVillagerSyncPos(v);
      }
      // The one who yielded: alive, broken, in the village. Everyone knows.
      const yielder = f.fighters.find(x => x.kind === 'hostile' && x.yielded && x.alive);
      if (result === 'betrayal_yielded' && yielder) {
        const yname = this.displayName(yielder.villagerId);
        this.say(`${yname} is alive. Shaking. They won't look at you. Nobody will, for a while.`);
        this.sysSay('AND THEY YIELD! The audience... doesn\'t know how to feel about this one. The gamblers are refunding bets.');
        // Yielding is witnessed by everyone still standing — terror spreads.
        try {
          const wit = f.fighters.filter(x => x.kind === 'villager' && x.alive && !x.fled).map(x => x.villagerId);
          this.seedGossip('attack', { honest: -25, generous: -20, brave: 5, competent: 0 }, wit);
          for (const wid of wit) this.bumpTrust(wid, -20);
          // The yielder fears you now. That's a relationship now.
          this.bumpTrust(yielder.villagerId, -40);
        } catch (e) {}
        try { this.addTrauma(12); } catch (e) {}
        // They stay in the village. That's worse, somehow.
        this.tbfight = null;
        // The yield aftermath above is complete (terror seeded, trust cratered).
        // Skip the generic betrayalAftermath: it would narrate a killing that
        // didn't happen. Just clean up the betrayal state.
        try { const bv = this.state.village; if (bv.betray) delete bv.betray[yielder.villagerId]; } catch (e) {}
        this._lastBetrayal = null;
        this._betrayAggressor = null;
        return;
      }
      if (result === 'betrayal_won') {
        this.audioEvent('victory');
        const bname = f.betrayer ? this.displayName(f.betrayer) : 'them';
        if (f.aggressor === 'player') {
          this.say(`It's done. ${bname} is dead. Your hands won't stop shaking.`);
          // UNSOLVED (Steve 2026-10-06): a killing nobody saw leaves no heat —
          // the same rule unwitnessed murder follows (justiceHeat: the village
          // doesn't know, so no heat — the crime stays on the books for the
          // detective/moot path). The opening 'attack' crime was recorded at
          // fight start, before witnesses were knowable; if the victim died
          // unseen, mark it unsolved too. A living victim (yield/flee) tells
          // everyone themselves — those stay witnessed.
          try {
            const seen = f.fighters.some(x => x.kind === 'villager' && x.alive && !x.fled && x.villagerId && x.villagerId !== f.betrayer);
            if (!seen && f.betrayer) {
              const j = this.justiceState();
              for (const c of (j.crimes || [])) {
                if (c.type === 'attack' && c.victim === f.betrayer && !c.caseId && c.witnessed !== false) c.witnessed = false;
              }
            }
          } catch (e) {}
        } else {
          this.say(`${bname} is down. You survived their knife. Barely feels like winning.`);
        }
        this.sysSay('The audience is SILENT. Then: scattered applause. Betrayal arcs are complicated, emotionally.');
        try { this.checkPromises('fight'); } catch (e) {}
      } else {
        this.say('They got away. Into the trees. You\'ll be looking over your shoulder for a while.');
        this.sysSay('They RAN! The sequel writes itself! The gamblers are already taking odds on the rematch!');
        // A fled betrayer doesn't come home. They're out there now.
        const fled = f.fighters.find(x => x.kind === 'hostile' && x.fled && x.villagerId);
        if (fled) {
          const v = this.state.village;
          v.roster = (v.roster || []).filter(id => id !== fled.villagerId);
          if (v.positions) delete v.positions[fled.villagerId];
          v.party = (v.party || []).filter(id => id !== fled.villagerId);
          v.followers = (v.followers || []).filter(id => id !== fled.villagerId);
        }
      }
      // LOOT-AS-ACTION (Steve 2026-10-06): no auto-loot. The betrayal-kill path
      // missed the loot-as-action pass (f870716) — it vacuumed the victim's
      // pack straight into the player's inventory at tbEnd. Their carried
      // things go on the corpse instead; the player opens the pack
      // deliberately (corpseTakeItem/corpseUseItem/corpseEatItem). The corpse
      // was registered at the killing blow in tbDamage.
      try {
        const dead = f.fighters.find(x => x.kind === 'hostile' && !x.alive);
        if (dead && dead.villagerId && this.corpses) {
          const vp = this.vpOf(dead.villagerId);
          const carried = (vp && vp.items) || [];
          if (carried.length) {
            const corpse = this.corpses().find(c => c.kind === 'person' && c.villagerId === dead.villagerId && !c.buried);
            if (corpse) {
              for (const itemId of carried) {
                const idef = (this.data.items || []).find(i => i.id === itemId) || {};
                corpse.items.push({
                  plantId: itemId, itemId,
                  name: idef.name || String(itemId).replace(/_/g, ' '),
                  units: 1, kcalEach: idef.kcalEach || 0,
                  spoilDay: 9999, unit: 'piece', kg: idef.kg || 0.3,
                  prep: 'Carried. Now it is a question.',
                });
              }
              vp.items = [];
              this.say(`Their pack is there, on the body. What is in it is yours to take — or to leave with them.`);
            }
          }
        }
      } catch (e) {}
      this.tbfight = null;
      try { this.betrayalAftermath(); } catch (e) {}
      return;
    }
    const r = origTbEnd.call(this, result);
    // BETRAYAL FLEE (Steve 2026-10-06): game.js's flee-by-door path stashes
    // 'hostile' fighters as "waiting monsters" with id = monsterId. Betrayal
    // fighters are villagers — they have NO monsterId — so the stash holds
    // {id:undefined} and the next door exit calls startCombat(undefined),
    // which falls back to 'bulldozer': a phantom monster spawned by a social
    // fight (same bug class as the justice.js uprising fix, ff9daaf). The
    // betrayer is socially resolved by betrayalAftermath; strip the id-less
    // entries so no phantom spawns. Real monster stashes (from other fights)
    // pass through untouched.
    if (wasBetrayalFight && result === 'fled') {
      try {
        const st = this.state.doorFledMonsters;
        if (Array.isArray(st) && st.length) {
          const kept = st.filter(m => m && m.id);
          this.state.doorFledMonsters = kept.length ? kept : null;
        }
      } catch (e) {}
    }
    try {
      // Non-betrayal fight that had betrayal context pending: still run aftermath.
      if (this._lastBetrayal && !this.tbfight) this.betrayalAftermath();
    } catch (e) {}
    return r;
  };

  // tbDamage: hostile deaths never reach tbVillagerFalls (kind is 'hostile',
  // not 'villager'). Route them through so roster/party cleanup + aftermath run.
  const origTbDamage = Game.tbDamage;
  Game.tbDamage = function (targetKey, dmg, sourceLabel, sourceKey, opts) {
    const t = this.tbFighter(targetKey);
    const wasHostile = !!(t && t.kind === 'hostile' && t.alive);
    const r = origTbDamage.call(this, targetKey, dmg, sourceLabel, sourceKey, opts);
    try {
      if (wasHostile && t && !t.alive && !t._fallsHandled) {
        t._fallsHandled = true;
        this.tbVillagerFalls(t);
      }
    } catch (e) {}
    return r;
  };

  // tbAdvance routes non-player, non-villager fighters to tbMonsterTurn —
  // which crashes on hostiles (reads m.mdef.fleeAt of undefined). Route
  // hostiles to the human betrayer AI instead.
  const origTbAdvance = Game.tbAdvance;
  Game.tbAdvance = function () {
    const f = this.tbfight;
    if (!f || f.over) return origTbAdvance.call(this);
    if (!f.fighters.some(x => x.kind === 'hostile' && x.alive && !x.fled)) {
      return origTbAdvance.call(this);
    }
    // Betrayal fight: custom advancement with hostile routing.
    let guard = 0;
    while (guard++ < 60) {
      f.turnIdx++;
      if (f.turnIdx >= f.order.length) {
        f.turnIdx = 0; f.round++;
        this.sysSay(`ROUND ${f.round}!`);
        this.audioEvent('round', { round: f.round });
      }
      const c = this.tbFighter(f.order[f.turnIdx]);
      if (!c || !c.alive || c.fled) continue;
      if (c.kind === 'player') { this.tbBeginTurn(); return; }
      if (c.kind === 'villager') this.tbVillagerTurn(c);
      else if (c.kind === 'hostile') this.tbHostileTurn(c);
      else this.tbMonsterTurn(c);
      if (this.tbEndCheck()) return;
    }
  };

})();
