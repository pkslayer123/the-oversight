// @ontology
// system: party-formal
// description: Formal party mechanics. Roles, formations.
// provides:
// rules:
//   - (none documented)
//   - turn_guard: convoTurn rejects non-string choice ids with null (UI-safe) instead of throwing on .indexOf (code: convoTurn, 2026-10-06)
// consumes:
//   - state.party
// ============ OFFICIAL PARTY SYSTEM ============
// The party, formalized. Before this, people just traveled with you —
// followers, informal, no name, no roles. The OFFICIAL PARTY is what happens
// when the stakes get too big for that.
//
// Steve's direction (2026-10-04): the game should ANTICIPATE the party.
// Late Show into Network, the sim presents a threat explicitly too big for
// one person — and the party is the answer to a question the game asked.
// Not a timer. A need.
//
// What "official" means:
// - a NAME. The System announces it. The codex records it. The audience bets on it.
// - ROLES, not classes: point, healer, carrier, talker, scout. Declared,
//   distinct, one of each. People, not classes.
// - COMMITMENT: joining/leaving a named party has social weight. The village reacts.
// - SHARED RISK: party members can die. The corpse and mantle systems handle
//   the rest; this module adds the party's grief.
// - SHARED REWARDS: the deed goes in the codex under the party's name.
//
// Coordination: roles ARE the coordination interface. Assign a role and the
// party coordinates intelligently in fights (healer carries the wounded,
// point flanks, scout warns). Manual orders override via orderMember().
// Bigger threats: threat assessment gates the suggestion. Multiple threats:
// split the party — one team per threat, real risk on both sides.
//
// Self-attaching module: loaded after party.js, ledger.js, villager-agency.js.
// All game logic lives here — game.js is untouched (sibling agents own it).
// Every cross-module call is guarded: this module works even when ledger,
// agency, or corpses aren't loaded (tests, partial builds).

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;

  // ---------- ROLES ----------
  // Declared, not assigned by the System. One of each per party — a role is
  // a promise to the others, and you can't promise the same thing twice.
  const PARTY_ROLES = {
    point:   { name: 'Point',   desc: 'First in. Hits harder (+3 strike), draws the eye.', icon: '🗡️' },
    healer:  { name: 'Healer',  desc: 'Carries the wounded, patches them up (+6 heal).', icon: '🩹' },
    carrier: { name: 'Carrier', desc: 'Hauls. Carry order reaches further, steadier hands.', icon: '🎒' },
    talker:  { name: 'Talker',  desc: 'The face. People join easier, leaving hurts less.', icon: '🗣️' },
    scout:   { name: 'Scout',   desc: 'Sees trouble first. Warns the party on the road.', icon: '👁️' },
  };

  // ---------- NAME GENERATION ----------
  // The System names things for television. A party member names things from
  // the heart. The player picks. All three are honest about what they are.
  const SYS_NAMES = [
    'THE PROTAGONISTS', 'FINAL GIRLS CLUB', 'MEAT AND FRIENDS',
    'THE NIGHT SHIFT', 'APEX SNACKS', 'PLOT ARMOR', 'THE ENSEMBLE',
  ];
  const MEMBER_NAMES = [
    'The Hearth', 'The Thornbacks', 'The Long Walk', 'The Firetenders',
    'The Second Try', 'The Unlost', 'The Kept Promise',
  ];

  const methods = {

    // ---------- STATE ----------

    partyFormalState() {
      const v = this.state.village;
      if (!v.partyRoles) v.partyRoles = {};
      if (!v.partySplits) v.partySplits = [];
      return v;
    },

    partyName() {
      return this.state.village.partyName || null;
    },

    partyNamed() {
      return !!this.partyName();
    },

    roleOf(vid) {
      return (this.partyFormalState().partyRoles || {})[vid] || null;
    },

    partyRoster() {
      // members with roles, for display
      const st = this.partyFormalState();
      return this.partyMembers().map(vid => ({
        vid, name: this.displayName(vid), role: st.partyRoles[vid] || null,
      }));
    },

    // ---------- THREAT ASSESSMENT ----------
    // Is this threat too big for one person? The game does the math the
    // player feels in their gut. Power = hp x damage. Solo = your health x
    // your best weapon, plus a little for every ability slot you've earned.

    threatPower(mdef) {
      if (!mdef) return 0;
      const hp = Array.isArray(mdef.hp) ? (mdef.hp[0] + mdef.hp[1]) / 2 : (mdef.hp || 30);
      const dmgArr = (mdef.attack || {}).damage;
      const dmg = Array.isArray(dmgArr) ? (dmgArr[0] + dmgArr[1]) / 2 : (dmgArr || 8);
      return hp * dmg;
    },

    soloPower() {
      const s = this.state.scholar;
      const hp = s.health || 100;
      // best weapon damage — proxy via inventory; unarmed baseline 8
      let weapon = 8;
      try {
        const inv = s.inventory || [];
        for (const it of inv) {
          const d = (it.dmg || it.damage || 0);
          if (d > weapon) weapon = d;
        }
        if (s.equipped && (s.equipped.dmg || s.equipped.damage)) {
          weapon = Math.max(weapon, s.equipped.dmg || s.equipped.damage);
        }
      } catch (e) {}
      let slots = 0;
      try { slots = ((this.progState && this.progState().slots) || []).length || 0; } catch (e) {}
      return hp * weapon + slots * 60;
    },

    // ratio > 1.5: this thing will kill you alone. That's the game's cue.
    assessThreat(mdef) {
      const threat = this.threatPower(mdef);
      const solo = Math.max(1, this.soloPower());
      return { threat, solo, ratio: threat / solo };
    },

    // ---------- THE SUGGESTION ----------
    // The game anticipates. When the ratio says "too big" — or when two
    // threats coincide — someone says it out loud. A trusted companion says
    // it like a friend. The System says it like a producer. Either way, the
    // party stops being an accident and starts being a decision.

    partyThreatCheck(monsterId) {
      if (!this.partyUnlocked || !this.partyUnlocked()) return;
      const v = this.partyFormalState();
      const mdef = (this.data.monsters || []).find(m => m.id === monsterId);
      if (!mdef) return;
      const { ratio } = this.assessThreat(mdef);
      const multi = this.countActiveThreats() >= 2;
      if (ratio < 1.5 && !multi) return;
      if (v.partySuggested === 'named' && this.partyNamed()) return; // already answered
      if (v.partySuggested && !multi) return; // said it once; don't nag
      const reason = multi ? 'multi' : 'big';
      v.partySuggested = this.partyNamed() ? 'named' : reason;
      this.suggestParty(reason, mdef);
    },

    countActiveThreats() {
      // distinct live threats the party can see: monsters in the current
      // fight, plus the monster on the node (scholar.monster).
      const seen = new Set();
      try {
        const f = this.tbfight;
        if (f) for (const x of f.fighters) {
          if (x.kind === 'monster' && x.alive && !x.fled) seen.add(x.key);
        }
        const sm = (typeof this.playerMonster === 'function') ? this.playerMonster() : this.state.scholar.monster;
        if (sm && sm.id) seen.add('node:' + sm.id);
      } catch (e) {}
      return seen.size;
    },

    suggestParty(reason, mdef) {
      // who says it: the most trusted traveling companion, or the System.
      const travelers = (this.travelingWith ? this.travelingWith() : [])
        .filter(id => id !== this.villagerId);
      let speaker = null, bestTrust = 50;
      for (const vid of travelers) {
        const t = ((this.state.village.trust || {})[vid] || 10);
        if (t > bestTrust) { bestTrust = t; speaker = vid; }
      }
      const mname = mdef ? this.monsterDisplayName(mdef.id) : 'whatever that is';
      if (speaker) {
        const nm = this.displayName(speaker);
        const lines = reason === 'multi'
          ? `"There's two of them. We can't do this scattered — we need a real team. A named one. People fight harder for a name."`
          : `"${mname} — look at it. One of us alone doesn't walk away from that. But all of us? With a plan? ...We should name this. Us. Make it official."`;
        this.say(`🤝 ${nm}: ${lines}`);
      } else {
        const line = reason === 'multi'
          ? `"OHHHH, MULTIPLE THREATS! The audience is FERAL! You know what this calls for? A TEAM! A NAMED TEAM! The betting markets NEED a named team!"`
          : `"THREAT ASSESSMENT: that thing out-rates a solo contestant by a LOT! The audience wants a TEAM! Name your party! Give us something to chant! (No pressure. Some pressure.)"`;
        this.sysSay(`📺 SYSTEM: ${line}`);
      }
      this.say(`(The game is telling you something: this is bigger than one person. Talk to your companions — "We should name this. Us.")`);
    },

    // ---------- NAMING ----------
    // Three options. The System's (television), a companion's (heart), plain.
    // The player picks. The pick is the commitment.

    partyNameOptions() {
      const sys = SYS_NAMES[Math.floor(Math.random() * SYS_NAMES.length)];
      const travelers = (this.travelingWith ? this.travelingWith() : [])
        .filter(id => id !== this.villagerId && this.inParty && this.inParty(id));
      let member = null;
      if (travelers.length) {
        const vid = travelers[Math.floor(Math.random() * travelers.length)];
        member = {
          name: MEMBER_NAMES[Math.floor(Math.random() * MEMBER_NAMES.length)],
          by: vid, byName: this.displayName(vid),
        };
      }
      return [
        { name: sys, by: 'system' },
        member || { name: MEMBER_NAMES[Math.floor(Math.random() * MEMBER_NAMES.length)], by: 'you' },
        { name: 'The Company', by: 'plain' },
      ];
    },

    nameParty(name) {
      const v = this.partyFormalState();
      name = String(name || '').trim().slice(0, 28);
      if (!name) return { ok: false, msg: 'Give it a name.' };
      if (!this.partyUnlocked || !this.partyUnlocked()) {
        return { ok: false, msg: 'There is no party to name yet.' };
      }
      const members = this.partyMembers();
      if (!members.length) return { ok: false, msg: 'Name it when there is an us.' };
      const old = v.partyName;
      v.partyName = name;
      v.partyFormed = this.state.scholar.day;
      v.partySuggested = 'named';
      const names = members.map(id => this.displayName(id)).join(', ');
      this.say(`🤝 "${name}." It hangs in the air a moment — then ${names.split(', ')[0]} grins. It's real now. It has a name, which means it can be lost.`);
      try { this.sysSay(`📺 "${name.toUpperCase()}!!" The audience CHANTS it! The betting markets light up! Official!`); } catch (e) {}
      try { if (this.broadcastLine) this.broadcastLine(`${name} is official. ${names}.`); } catch (e) {}
      try { if (this.recordMoment) this.recordMoment(`${name} named their party: ${names}.`); } catch (e) {}
      // shared reward: the founding is a deed under the party's name
      try {
        if (this.recordDeed) this.recordDeed(members[0], 'party_founded', `${name} was named — ${names}. A team, on purpose.`, 6);
      } catch (e) {}
      // leading: the vector notices
      try { if (this.ledgerAdd) { this.ledgerAdd('brokerage', 2); this.ledgerAdd('unified', 1); } } catch (e) {}
      try { if (this.journalNote) this.journalNote('people', 'party', `We named us: ${name}.`); } catch (e) {}
      return { ok: true, name, renamed: !!old };
    },

    disbandParty() {
      const v = this.partyFormalState();
      if (!v.partyName) return { ok: false, msg: 'There is nothing to disband.' };
      const name = v.partyName;
      v.partyName = null; v.partyRoles = {};
      this.say(`"${name}" — said out loud one last time, then let go. Nobody chants it now.`);
      try { if (this.recordMoment) this.recordMoment(`${name} disbanded.`); } catch (e) {}
      return { ok: true };
    },

    // ---------- ROLES ----------
    // Declared, not assigned. One of each — a role is a promise.

    assignRole(vid, role) {
      const v = this.partyFormalState();
      if (!PARTY_ROLES[role]) return { ok: false, msg: 'No such role.' };
      if (!this.inParty || !this.inParty(vid)) return { ok: false, msg: 'They are not in your party.' };
      const holder = Object.keys(v.partyRoles).find(id => v.partyRoles[id] === role && id !== vid);
      if (holder) {
        const hname = this.displayName(holder);
        this.say(`${hname} nods, stepping back. "${PARTY_ROLES[role].name} is yours now." (Roles are promises. There's only one of each.)`);
        delete v.partyRoles[holder];
      }
      v.partyRoles[vid] = role;
      const nm = this.displayName(vid);
      const R = PARTY_ROLES[role];
      this.say(`🤝 ${nm} is ${R.icon} ${R.name} now. ${R.desc}`);
      try {
        if (this.recordDeed && this.partyNamed()) {
          this.recordDeed(vid, 'party_role', `${nm} took the ${R.name} role in ${v.partyName}.`, 2);
        }
      } catch (e) {}
      return { ok: true, role };
    },

    clearRole(vid) {
      const v = this.partyFormalState();
      delete v.partyRoles[vid];
      return true;
    },

    roleBonus(role) {
      return PARTY_ROLES[role] || null;
    },

    // ---------- COORDINATION ORDERS ----------
    // Manual override. Roles drive the default behavior (see tbVillagerTurn
    // wrapper); orders are the player's hand on the wheel for one round.
    // distract: draw its eye. flank: hit it where it isn't looking.
    // carry: get the wounded out. hold: stand like a wall.

    orderMember(vid, order) {
      const valid = ['distract', 'flank', 'carry', 'hold', null];
      if (valid.indexOf(order) === -1 && order !== undefined) {
        return { ok: false, msg: 'distract, flank, carry, or hold.' };
      }
      if (!this.inParty || !this.inParty(vid)) return { ok: false, msg: 'They are not in your party.' };
      const f = this.tbfight;
      if (!f || f.over) return { ok: false, msg: 'No fight to coordinate.' };
      const fighter = f.fighters.find(x => x.kind === 'villager' && x.villagerId === vid && x.alive && !x.fled);
      if (!fighter) return { ok: false, msg: 'They are not in this fight.' };
      fighter.order = order || null;
      const nm = this.displayName(vid);
      const lines = {
        distract: `"Hey! OVER HERE!" ${nm} bangs steel on steel, making a show of it.`,
        flank: `${nm} nods and starts circling — wide, quiet, patient.`,
        carry: `"I've got them." ${nm} moves toward the worst of it.`,
        hold: `${nm} plants their feet. "Come on then."`,
      };
      if (order) this.say(`📣 ${lines[order]}`);
      return { ok: true, order };
    },

    // order execution — called from the tbVillagerTurn wrapper before default AI
    execOrder(v, f) {
      const order = v.order;
      if (!order) return false;
      v.order = null; // one round. the moment passes.
      const nm = v.name;
      const role = this.roleOf(v.villagerId);
      const S_combat = (globalThis.Scattering.combat || {});
      const blocked = (x, y) => this.tbBlocked(x, y) && !(x === v.mx && y === v.my);
      const foes = f.fighters.filter(o => o.alive && !o.fled && o.key !== v.key && S_combat.isFoe && S_combat.isFoe(v, o));
      if (!foes.length) return true; // nothing to coordinate against
      const nearest = foes.slice().sort((a, b) =>
        Math.max(Math.abs(a.mx - v.mx), Math.abs(a.my - v.my)) - Math.max(Math.abs(b.mx - v.mx), Math.abs(b.my - v.my)))[0];

      if (order === 'distract') {
        // close distance, make noise. the queue notices noise.
        let moves = 0;
        while (moves < (v.speed || 3)) {
          const d = Math.max(Math.abs(nearest.mx - v.mx), Math.abs(nearest.my - v.my));
          if (d <= 2) break;
          const nx = v.mx + Math.sign(nearest.mx - v.mx);
          const ny = v.my + Math.sign(nearest.my - v.my);
          if (nx < 0 || nx > 8 || ny < 0 || ny > 8 || blocked(nx, ny)) break;
          v.mx = nx; v.my = ny; moves++;
        }
        this.tbVillagerSyncPos(v);
        // jump the threat queue: noise gets noticed (not pain — presence)
        try {
          if (this.encUsesFifo && this.encUsesFifo(nearest)) {
            const q = this.encThreatQueue(nearest);
            const i = q.indexOf(v.key);
            if (i > 0) q.splice(i, 1);
            if (q[0] !== v.key) q.unshift(v.key);
            this.say(`🔔 ${nm} has its full attention now. That's the job. That's the risk.`);
          } else {
            this.say(`🔔 ${nm} draws it off — shouting, waving, gloriously alive.`);
          }
        } catch (e) {}
        return true;
      }
      if (order === 'flank') {
        // get opposite the monster's current target, then the strike lands ×1.5
        let tgt = null;
        try { tgt = (this.encUsesFifo && this.encUsesFifo(nearest)) ? this.encCurrentTarget(nearest) : null; } catch (e) {}
        const anchor = tgt || this.tbFighter('p');
        let moves = 0;
        while (moves < (v.speed || 3)) {
          // step to the far side of the foe relative to the anchor
          const dx = Math.sign(v.mx - nearest.mx) || 1;
          const dy = Math.sign(v.my - nearest.my) || 0;
          const nx = v.mx + dx, ny = v.my + dy;
          if (nx < 0 || nx > 8 || ny < 0 || ny > 8 || blocked(nx, ny)) break;
          const ad = anchor ? Math.max(Math.abs(anchor.mx - nearest.mx), Math.abs(anchor.my - nearest.my)) : 0;
          const vd = Math.max(Math.abs(nx - nearest.mx), Math.abs(ny - nearest.my));
          v.mx = nx; v.my = ny; moves++;
          if (vd <= 1 && ad >= 1) break;
        }
        this.tbVillagerSyncPos(v);
        v.flanking = true;
        this.say(`🗡️ ${nm} is behind it now. It doesn't know. Yet.`);
        return true;
      }
      if (order === 'carry') {
        // the most wounded ally under half health
        const allies = f.fighters.filter(o => o.alive && !o.fled && o.key !== v.key &&
          (o.kind === 'player' || o.kind === 'villager'));
        const wounded = allies
          .filter(o => o.hp < (o.maxHp || 100) * 0.5)
          .sort((a, b) => (a.hp / (a.maxHp || 100)) - (b.hp / (b.maxHp || 100)))[0];
        if (!wounded) { this.say(`${nm} looks for someone to carry. Everyone's standing. Good.`); return true; }
        // move adjacent
        let moves = 0;
        const reach = role === 'carrier' ? (v.speed || 3) + 1 : (v.speed || 3);
        while (moves < reach) {
          const d = Math.max(Math.abs(wounded.mx - v.mx), Math.abs(wounded.my - v.my));
          if (d <= 1) break;
          const nx = v.mx + Math.sign(wounded.mx - v.mx);
          const ny = v.my + Math.sign(wounded.my - v.my);
          if (nx < 0 || nx > 8 || ny < 0 || ny > 8 || blocked(nx, ny)) break;
          v.mx = nx; v.my = ny; moves++;
        }
        const d = Math.max(Math.abs(wounded.mx - v.mx), Math.abs(wounded.my - v.my));
        if (d <= 1) {
          // drag them 2 tiles from the nearest foe
          for (let s = 0; s < 2; s++) {
            const ax = Math.sign(v.mx - nearest.mx), ay = Math.sign(v.my - nearest.my);
            const nx = v.mx + ax, ny = v.my + ay;
            if (nx < 0 || nx > 8 || ny < 0 || ny > 8 || blocked(nx, ny)) break;
            v.mx = nx; v.my = ny; wounded.mx = nx; wounded.my = ny;
          }
          this.tbVillagerSyncPos(v);
          const heal = (role === 'healer' ? 12 : 6);
          wounded.hp = Math.min(wounded.maxHp || 100, wounded.hp + heal);
          if (wounded.kind === 'player') this.state.scholar.health = Math.max(0, wounded.hp);
          const wname = wounded.kind === 'player' ? 'you' : wounded.name;
          this.say(`🩹 ${nm} hauls ${wname} clear of it (+${heal} HP). "Breathe. I've got you."`);
        } else {
          this.say(`${nm} can't reach them in time.`);
        }
        return true;
      }
      if (order === 'hold') {
        v.holding = true;
        this.say(`🛡️ ${nm} sets like a wall. "Through me, then."`);
        return true;
      }
      return false;
    },

    // role-driven defaults: no manual order? the role decides.
    roleDefaultOrder(v, f) {
      const role = this.roleOf(v.villagerId);
      if (!role) return null;
      const allies = f.fighters.filter(o => o.alive && !o.fled && o.key !== v.key &&
        (o.kind === 'player' || o.kind === 'villager'));
      const wounded = allies.some(o => o.hp < (o.maxHp || 100) * 0.5);
      if ((role === 'healer' || role === 'carrier') && wounded) return 'carry';
      if (role === 'point') {
        // point flanks when there's a clear current target that isn't them
        try {
          const foe = f.fighters.find(o => o.kind === 'monster' && o.alive && !o.fled);
          if (foe && this.encUsesFifo && this.encUsesFifo(foe)) {
            const cur = this.encCurrentTarget(foe);
            if (cur && cur.key !== v.key) return 'flank';
          }
        } catch (e) {}
      }
      return null;
    },

    // ---------- SPLIT THE PARTY ----------
    // Two threats. One party. The show's cruelty and the game's spice.
    // You divide — and both halves are weaker for it. Real risk, both sides.

    detectSplitOpportunity() {
      const f = this.tbfight;
      if (!f || f.over) return [];
      const foes = f.fighters.filter(o => o.kind === 'monster' && o.alive && !o.fled);
      if (foes.length < 2) return [];
      return foes.map(o => ({ key: o.key, name: o.name, mdef: o.mdef }));
    },

    offerSplit() {
      const foes = this.detectSplitOpportunity();
      if (foes.length < 2) return null;
      // THREAT READ (Steve 2026-10-05): group the pack — four hum-mice are one
      // threat, not four. Correct count, diegetic language, no debug leak.
      const byId = {};
      for (const t of foes) { const id = (t.mdef || {}).id || t.key; (byId[id] = byId[id] || []).push(t); }
      const groups = Object.values(byId);
      const gnames = groups.map(g => (g.length > 1 ? `${g[0].name} (\u00d7${g.length})` : g[0].name));
      const n = groups.length;
      const threatWord = n === 1 ? 'One threat' : n === 2 ? 'Two threats' : n === 3 ? 'Three threats' : `${n} threats`;
      const members = this.partyMembers().map(id => this.displayName(id)).join(', ');
      const text = `\u26a0\ufe0f ${threatWord}: ${gnames.join(' and ')} \u2014 all here, all now.\n` +
        `Your party: ${members || 'just you'}. You are outnumbered \u2014 fight like it.`;
      this.say(text);
      return foes;
    },

    // send teamVids (NPC vids) to handle threatKey; you stay with the rest.
    // their fight resolves in the sim — with real stakes.
    splitParty(threatKey, teamVids) {
      const f = this.tbfight;
      if (!f || f.over) return { ok: false, msg: 'No fight to split.' };
      const foe = f.fighters.find(o => o.key === threatKey && o.kind === 'monster' && o.alive);
      if (!foe) return { ok: false, msg: 'That threat is not here.' };
      teamVids = (teamVids || []).filter(vid => this.inParty && this.inParty(vid));
      if (!teamVids.length) return { ok: false, msg: 'Send someone. (Them, not you — you hold this one.)' };
      const names = teamVids.map(id => this.displayName(id));
      this.say(`⚠️ SPLIT. ${names.join(', ')} ${names.length > 1 ? 'peel' : 'peels'} off toward the ${foe.name} — and you're alone with what's left. The party is two parties now. Both smaller. Both in it.`);
      // remove them from this fight; they go handle theirs
      const gone = new Set(teamVids.map(vid => 'v_' + vid));
      f.fighters = f.fighters.filter(x => !gone.has(x.key));
      try {
        const S_combat = (globalThis.Scattering.combat || {});
        if (S_combat.turnOrder) f.order = S_combat.turnOrder(f.fighters);
      } catch (e) {}
      // their fight resolves now, elsewhere, without you
      const outcome = this.resolveSplitTeam(teamVids, foe.mdef || {}, foe.name);
      const v = this.partyFormalState();
      v.partySplits.push({
        day: this.state.scholar.day, threat: foe.name,
        team: teamVids.slice(), outcome: outcome.result,
      });
      return { ok: true, outcome };
    },

    resolveSplitTeam(teamVids, mdef, mname) {
      // team power vs threat power. honest sim, real stakes.
      const n = teamVids.length;
      const teamPower = n * 30 * (6 + 2 * n);
      const threatPower = Math.max(1, this.threatPower(mdef) / 50);
      const ratio = teamPower / threatPower;
      const roll = Math.random();
      let result, detail;
      const names = teamVids.map(id => this.displayName(id));
      if (ratio > 1.5 || (ratio > 1.0 && roll < 0.7)) {
        result = 'won';
        const hurt = roll < 0.3 ? teamVids[Math.floor(Math.random() * n)] : null;
        detail = `${names.join(', ')} brought down the ${mname}${hurt ? ` — ${this.displayName(hurt)} is hurt, but walking` : ', clean'}.`;
      } else if (ratio > 0.7) {
        result = 'costly';
        const hurt = teamVids[Math.floor(Math.random() * n)];
        detail = `They killed it. It cost them: ${this.displayName(hurt)} is badly hurt. The ${mname} is dead; so nearly was someone.`;
      } else {
        result = 'lost';
        const dead = roll < 0.5 ? teamVids[Math.floor(Math.random() * n)] : null;
        if (dead) {
          const dname = this.displayName(dead);
          detail = `The ${mname} was too much. ${dname} didn't come back.`;
          this.applySplitDeath(dead, mname);
        } else {
          detail = `They couldn't hold it — ${names.join(', ')} ${n > 1 ? 'fled' : 'fled'}, hurt and lucky to be breathing. The ${mname} is still out there.`;
        }
      }
      this.say(`📣 Elsewhere: ${detail}`);
      try {
        const mag = result === 'won' ? 7 : 8; // losses air. the show loves a cost.
        if (this.recordDeed) this.recordDeed(teamVids[0], 'party_split_' + result, `${this.partyName() || 'The party'} split — ${detail}`, mag);
      } catch (e) {}
      try { if (this.ledgerAdd && result !== 'lost') this.ledgerAdd('might', 2); } catch (e) {}
      return { result, detail, team: teamVids.slice() };
    },

    applySplitDeath(vid, mname) {
      const v = this.state.village;
      try {
        if (this.registerDeath) {
          this.registerDeath({ kind: 'person', villagerId: vid, name: this.displayName(vid), cause: 'split-fight: ' + mname, witnesses: [] });
        }
      } catch (e) {}
      try { if (this.removeVillager) this.removeVillager(vid, 'killed'); } catch (e) {
        v.roster = (v.roster || []).filter(id => id !== vid);
      }
      v.party = (v.party || []).filter(id => id !== vid);
      const st = this.partyFormalState();
      delete st.partyRoles[vid];
      this.say(`🕯️ ${this.displayName(vid)} died holding the other threat — so you didn't have to. The party carries their name now.`);
      try {
        if (this.recordDeed) this.recordDeed(vid, 'party_loss', `${this.displayName(vid)} died holding the line apart from the party. ${this.partyName() || 'The party'} carries the name.`, 9);
      } catch (e) {}
    },

    // ---------- PARTY DEATH BEAT ----------
    // the corpse and mantle systems do the mechanics. this is the grief.

    partyDeathBeat(vid) {
      if (!this.inParty || !this.inParty(vid)) return;
      const v = this.state.village;
      v.party = (v.party || []).filter(id => id !== vid);
      const st = this.partyFormalState();
      const role = st.partyRoles[vid];
      delete st.partyRoles[vid];
      const nm = this.displayName(vid);
      const pname = this.partyName();
      this.say(`🕯️ ${nm} is gone.${role ? ` The ${PARTY_ROLES[role].name} — the role sits empty now, and nobody reaches for it.` : ''}${pname ? ` ${pname} is smaller. It keeps the name. It carries ${nm.split(' ')[0]} in it, the way a bell keeps ringing.` : ''}`);
      try {
        if (this.recordDeed) this.recordDeed(vid, 'party_loss', `${nm} died beside the party${pname ? ' — ' + pname + ' carries the name' : ''}.`, 8);
      } catch (e) {}
    },

    // ---------- EXPEDITIONS ----------
    // the party as a unit. composition matters: a scout sees trouble first;
    // numbers mean safety. the villager-agency ranging system moves NPCs;
    // this is the player's half — traveling with a party changes the road.

    partyExpeditionBonus() {
      const traveling = (this.travelingWith ? this.travelingWith() : [])
        .filter(id => id !== this.villagerId && this.inParty && this.inParty(id));
      const st = this.partyFormalState();
      const roles = traveling.map(id => st.partyRoles[id]).filter(Boolean);
      return {
        count: traveling.length,
        scout: roles.indexOf('scout') !== -1,
        point: roles.indexOf('point') !== -1,
        safety: Math.min(3, traveling.length), // bodies between you and it
      };
    },

    // ---------- SHARED VICTORY ----------
    // the deed goes in the codex under the party's name.

    partyVictoryBeat(monstersDown) {
      const members = this.partyMembers();
      if (!members.length) return;
      const pname = this.partyName();
      const mnames = monstersDown.join(', ');
      if (pname) {
        this.say(`🏆 ${pname} did that. Not one hero — the whole shape of them, moving together. The village will hear this one with the name attached.`);
      }
      try {
        if (this.recordDeed) {
          this.recordDeed(members[0], 'party_kill',
            `${pname ? pname + ' — ' : ''}${members.map(id => this.displayName(id)).join(', ')} brought down ${mnames}. Together.`, 8);
        }
      } catch (e) {}
      try { if (this.ledgerAdd) this.ledgerAdd('might', 1); } catch (e) {}
      // the audience loves a party. viewership for everyone.
      try { if (this.sysSay) this.sysSay(`📺 "${pname ? pname.toUpperCase() : 'THE PARTY'} WINS!!" The crowd goes WILD! Team merch is already selling!`); } catch (e) {}
    },

    // ---------- CONVERSATION UI ----------
    // naming and roles live in conversation — you ask people, like a person.

    partyConvoChoices(vid, choices, MAXC) {
      try {
        if (!this.partyUnlocked || !this.partyUnlocked()) return;
        if (!this.inParty || !this.inParty(vid)) return;
        if (!Array.isArray(choices)) return;
        const v = this.partyFormalState();
        const item = !v.partyName
          ? { id: 'party_name', label: '"We should name this. Us."' }
          : { id: 'party_role', label: '"Let\'s talk roles."' };
        if (choices.some(c => c.id === item.id)) return;
        if (choices.length < MAXC) {
          choices.push(item);
          return;
        }
        // No room — but naming the party / assigning roles outranks small
        // talk. Splice in near the top ('more'/invite territory), displace
        // the last non-'leave' choice, keep 'leave' last and the list bounded.
        choices.splice(1, 0, item);
        while (choices.length > MAXC) {
          const li = choices.findIndex(c => c.id === 'leave');
          let rm = choices.length - 1;
          if (li === choices.length - 1) rm = choices.length - 2;
          if (rm <= 1) break;
          choices.splice(rm, 1);
        }
      } catch (e) {}
    },

    partyConvoTurn(vid, choiceId, c) {
      // returns {line, youSaid} or null if not ours
      const v = this.partyFormalState();
      if (choiceId === 'party_name') {
        const opts = this.partyNameOptions();
        c.pendingPartyNames = opts.map(o => o.name);
        const optLines = opts.map((o, i) => {
          const by = o.by === 'system' ? '📺 the System suggests' : o.by === 'plain' ? 'or plain' : `${o.byName} suggests`;
          return `${i + 1}. "${o.name}" (${by})`;
        }).join('\n');
        try { this.convoDeepTick(vid); } catch (e) {}
        return {
          line: `"A name. Okay." You say it out loud, trying the shape of it:\n${optLines}\n(Which one? It'll stick.)`,
          youSaid: '"We should name this. Us."',
          _partyNamePick: true,
        };
      }
      if (choiceId.indexOf('party_namepick:') === 0) {
        const idx = parseInt(choiceId.split(':')[1], 10) || 0;
        const names = c.pendingPartyNames || [];
        const name = names[idx] || names[0];
        if (!name) return { line: '"...Never mind."', youSaid: null };
        const r = this.nameParty(name);
        try { this.convoDeepTick(vid); } catch (e) {}
        return { line: r.ok ? null : r.msg, youSaid: `"${name}."` };
      }
      if (choiceId === 'party_role') {
        const roles = Object.keys(PARTY_ROLES).map(k => {
          const holder = Object.keys(v.partyRoles).find(id => v.partyRoles[id] === k);
          const held = holder && holder !== vid ? ` (held by ${this.displayName(holder).split(' ')[0]})` : '';
          const mine = v.partyRoles[vid] === k ? ' ← you have this' : '';
          return `${PARTY_ROLES[k].icon} ${k}${held}${mine} — ${PARTY_ROLES[k].desc}`;
        }).join('\n');
        try { this.convoDeepTick(vid); } catch (e) {}
        return {
          line: `"Roles. Not ranks — promises."\n${roles}\n(Which one is ${this.displayName(vid).split(' ')[0]}?)`,
          youSaid: '"Let\'s talk roles."',
          _partyRolePick: true,
        };
      }
      if (choiceId.indexOf('party_rolepick:') === 0) {
        const role = choiceId.split(':')[1];
        const r = this.assignRole(vid, role);
        try { this.convoDeepTick(vid); } catch (e) {}
        return { line: r.ok ? null : r.msg, youSaid: `"${role}."` };
      }
      return null;
    },

    // ---------- DISPLAY ----------

    partyCardHtml() {
      const v = this.partyFormalState();
      const members = this.partyRoster();
      if (!members.length && !v.partyName) return '';
      const name = v.partyName ? `<b>${v.partyName}</b>` : '<i>unnamed party</i>';
      const rows = members.map(m => {
        const r = m.role ? ` ${PARTY_ROLES[m.role].icon} ${PARTY_ROLES[m.role].name}` : '';
        return `<div>${m.name}${r}</div>`;
      }).join('');
      return `<div class="party-card">${name}${rows}</div>`;
    },
  };

  // Attach.
  Object.assign(Game, methods);

  // ---------- WRAPPERS ----------

  // startCombat: threat assessment. the game anticipates.
  const origStartCombat = Game.startCombat;
  Game.startCombat = function (monsterId) {
    const r = origStartCombat.call(this, monsterId);
    try { this.partyThreatCheck(monsterId); } catch (e) {}
    try {
      const foes = this.detectSplitOpportunity ? this.detectSplitOpportunity() : [];
      if (foes.length >= 2) this.offerSplit();
    } catch (e) {}
    return r;
  };

  // tbVillagerTurn: coordination. manual order first, role default second,
  // default AI last. roles ARE the coordination interface.
  const origTbVillagerTurn = Game.tbVillagerTurn;
  Game.tbVillagerTurn = function (fighter) {
    try {
      if (fighter && fighter.kind === 'villager' && fighter.villagerId &&
          this.inParty && this.inParty(fighter.villagerId) && this.tbfight && !this.tbfight.over) {
        if (fighter.order) {
          if (this.execOrder(fighter, this.tbfight)) { if (this.tbEndCheck()) return; return; }
        }
        const def = this.roleDefaultOrder(fighter, this.tbfight);
        if (def) {
          fighter.order = def;
          if (this.execOrder(fighter, this.tbfight)) { if (this.tbEndCheck()) return; return; }
        }
      }
    } catch (e) {}
    return origTbVillagerTurn.call(this, fighter);
  };

  // tbDamage: flank strikes land ×1.5; holders take ×0.6.
  const origTbDamage = Game.tbDamage;
  Game.tbDamage = function (targetKey, dmg, sourceLabel, sourceKey, opts) {
    try {
      const atk = sourceKey ? this.tbFighter(sourceKey) : null;
      if (atk && atk.flanking && atk.kind === 'villager') {
        atk.flanking = false;
        dmg = Math.round(dmg * 1.5);
        try { this.say(`🗡️ ${atk.name} strikes from behind — where it wasn't looking. (${dmg})`); } catch (e) {}
      }
      const tgt = targetKey ? this.tbFighter(targetKey) : null;
      if (tgt && tgt.holding && tgt.kind === 'villager') {
        tgt.holding = false;
        const before = dmg;
        dmg = Math.round(dmg * 0.6);
        try { this.say(`🛡️ ${tgt.name} takes it on braced arms. (${before}→${dmg})`); } catch (e) {}
      }
      // point role: +3 on strikes they make themselves
      if (atk && atk.kind === 'villager' && atk.villagerId && this.roleOf &&
          this.roleOf(atk.villagerId) === 'point' && !atk.flanking) {
        // flanking already got its bonus; point adds to plain strikes
        if (sourceLabel && /strike/i.test(sourceLabel)) {
          dmg = dmg + 3;
        }
      }
    } catch (e) {}
    return origTbDamage.call(this, targetKey, dmg, sourceLabel, sourceKey, opts);
  };

  // tbEnd: clear per-fight order flags; party victory beat on monster kills.
  const origTbEnd = Game.tbEnd;
  Game.tbEnd = function (result) {
    const f = this.tbfight;
    const monstersDown = f ? f.fighters
      .filter(x => x.kind === 'monster' && !x.alive)
      .map(x => x.name || 'the thing') : [];
    const r = origTbEnd.call(this, result);
    try {
      const st = this.partyFormalState();
      // orders don't survive the fight
      if (f) for (const x of f.fighters) { x.order = null; x.flanking = false; x.holding = false; }
      const lost = /lost|fled|routed/i.test(result || '');
      if (!lost && monstersDown.length && st && (this.partyMembers().length || this.partyNamed())) {
        this.partyVictoryBeat(monstersDown);
      }
    } catch (e) {}
    return r;
  };

  // tbVillagerFalls: the party's grief. corpse/mantle do the mechanics.
  const origTbVillagerFalls = Game.tbVillagerFalls;
  Game.tbVillagerFalls = function (t) {
    const wasInParty = !!(t && t.kind === 'villager' && t.villagerId && this.inParty && this.inParty(t.villagerId));
    const r = origTbVillagerFalls.call(this, t);
    try { if (wasInParty) this.partyDeathBeat(t.villagerId); } catch (e) {}
    return r;
  };

  // checkEncounter: a scout traveling with the party sees trouble first.
  const origCheckEncounter = Game.checkEncounter;
  Game.checkEncounter = function () {
    let had = null;
    try { const _pmh = (typeof this.playerMonster === 'function') ? this.playerMonster() : this.state.scholar.monster; had = _pmh ? _pmh.id : null; } catch (e) {}
    const r = origCheckEncounter.call(this);
    try {
      const _pmn = (typeof this.playerMonster === 'function') ? this.playerMonster() : this.state.scholar.monster;
      const now = _pmn ? _pmn.id : null;
      if (now && now !== had) {
        const bonus = this.partyExpeditionBonus ? this.partyExpeditionBonus() : null;
        if (bonus && bonus.scout) {
          const scouts = this.partyMembers().filter(id => this.roleOf(id) === 'scout');
          const nm = scouts.length ? this.displayName(scouts[0]).split(' ')[0] : 'Your scout';
          this.say(`👁️ ${nm} freezes — hand up. "Something's out there. Big. We see it before it sees us — that's our edge. Use it."`);
        }
      }
    } catch (e) {}
    return r;
  };

  // npcBatchTurn: daily party suggestion when threats coincide (multi-threat
  // can build outside combat); named-party commitment weight on dismiss.
  const origNpcBatchTurn2 = Game.npcBatchTurn;
  Game.npcBatchTurn = function () {
    const r = origNpcBatchTurn2.call(this);
    try {
      if (this.partyUnlocked && this.partyUnlocked() && this.countActiveThreats && this.countActiveThreats() >= 2) {
        const v = this.partyFormalState();
        if (!v.partySuggested || v.partySuggested === 'big') {
          v.partySuggested = 'multi';
          this.suggestParty('multi', null);
        }
      }
    } catch (e) {}
    return r;
  };

  // dismissFromParty: leaving a NAMED party costs more. commitment has weight.
  const origDismiss = Game.dismissFromParty;
  Game.dismissFromParty = function (vid) {
    const named = this.partyNamed && this.partyNamed();
    const r = origDismiss.call(this, vid);
    try {
      if (r && r.ok && named) {
        const v = this.state.village;
        const st = this.partyFormalState();
        const hadRole = st.partyRoles[vid];
        delete st.partyRoles[vid];
        this.bumpTrust(vid, -4); // on top of the base -8
        const pname = v.partyName;
        this.say(`Casting someone out of a named party is its own kind of violence. "${pname}" — said without ${this.displayName(vid).split(' ')[0]} in it, for the first time.`);
        if (Math.random() < 0.5) {
          this.seedGossip('dismissed', { generous: -10, honest: -6 }, [vid]);
        }
      }
    } catch (e) {}
    return r;
  };

  // followerCheck: a talker in the traveling party makes people join easier.
  const origFollowerCheck = Game.followerCheck;
  Game.followerCheck = function () {
    // talker bonus: nudge trust temporarily? no — cleaner: run the check,
    // then run it once more if a talker travels with you. two chances.
    const r = origFollowerCheck.call(this);
    try {
      const st = this.partyFormalState();
      const traveling = (this.travelingWith ? this.travelingWith() : []);
      const hasTalker = traveling.some(id => st.partyRoles[id] === 'talker');
      if (hasTalker && !this.state.systemArrived) {
        return origFollowerCheck.call(this);
      }
    } catch (e) {}
    return r;
  };

  // convoChoices: naming + roles live in conversation.
  const origConvoChoices = Game.convoChoices;
  Game.convoChoices = function (vid) {
    const choices = origConvoChoices.call(this, vid);
    try {
      // partyConvoChoices handles crowding itself (splices in, displaces small talk).
      if (Array.isArray(choices)) {
        this.partyConvoChoices(vid, choices, 7);
      }
    } catch (e) {}
    return choices;
  };

  // convoTurn: handle our choice ids, shaped like the original's return.
  const origConvoTurn = Game.convoTurn;
  Game.convoTurn = function (vid, choiceId) {
    // GUARD (2026-10-06): a missing/garbage choice id used to throw
    // TypeError on choiceId.indexOf and kill the whole chat. Every other
    // wrapper type-checks; this one didn't. Null is UI-safe (closes chat).
    if (typeof choiceId !== 'string' || !choiceId) return null;
    if (choiceId === 'party_name' || choiceId.indexOf('party_namepick:') === 0 ||
        choiceId === 'party_role' || choiceId.indexOf('party_rolepick:') === 0) {
      const c = this.convoGet(vid);
      if (!c || !c.active) return null;
      const res = this.partyConvoTurn(vid, choiceId, c);
      if (!res) return origConvoTurn.call(this, vid, choiceId);
      // name-pick / role-pick present sub-choices instead of ending the beat
      if (res._partyNamePick) {
        const opts = (c.pendingPartyNames || []).map((n, i) => ({ id: 'party_namepick:' + i, label: `"${n}."` }));
        opts.push({ id: 'leave', label: '"...Let me think."' });
        return { line: res.line, choices: opts, ended: false, transcript: c.transcript.slice() };
      }
      if (res._partyRolePick) {
        const opts = Object.keys(PARTY_ROLES).map(k => ({ id: 'party_rolepick:' + k, label: `${PARTY_ROLES[k].icon} ${PARTY_ROLES[k].name}` }));
        opts.push({ id: 'leave', label: '"...Later."' });
        return { line: res.line, choices: opts, ended: false, transcript: c.transcript.slice() };
      }
      return { line: res.line, choices: this.convoChoices(vid), ended: false, transcript: c.transcript.slice() };
    }
    return origConvoTurn.call(this, vid, choiceId);
  };

  // partyButtonHtml: show the name and role on the person card. display only.
  const origPartyButtonHtml = Game.partyButtonHtml;
  Game.partyButtonHtml = function (vid) {
    let html = '';
    try { html = origPartyButtonHtml.call(this, vid); } catch (e) {}
    try {
      const st = this.partyFormalState();
      const role = st.partyRoles[vid];
      if (role && PARTY_ROLES[role]) {
        html += ` <span class="small" style="opacity:.7">${PARTY_ROLES[role].icon} ${PARTY_ROLES[role].name}</span>`;
      }
      if (this.inParty && this.inParty(vid) && st.partyName) {
        html += ` <span class="small" style="opacity:.5">${st.partyName}</span>`;
      }
    } catch (e) {}
    return html;
  };

})();
