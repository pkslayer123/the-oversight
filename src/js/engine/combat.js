/* Combat engine — slice 1. One command per round.
   Monster declares telegraph → player answers → resolve.
   Pure logic; UI lives in app.js. */
(function (global) {
  'use strict';

  // Monster moves for slice 1 (Bulldozer). Data-driven later.
  const MOVES = {
    charge: { name: 'China-Shop Charge', dmg: [18, 26], hint: 'Lowers its head, paws the earth. It is not going around the tree.' },
    trample: { name: 'Trample', dmg: [8, 14], hint: 'It whirls, lashing out at everything close.' },
  };

  function newFight(monster, scholar) {
    const S = global.Scattering;
    return {
      monster: { id: monster.id, name: monster.name, hp: monster.hp[0] + Math.floor(Math.random() * (monster.hp[1] - monster.hp[0])), maxHp: monster.hp[1] },
      scholarHp: scholar.health,
      round: 0,
      telegraph: 'charge', // first round always the signature
      studied: false,
      aimed: false,   // dead_aim: studied round 1 -> crit round 2
      blind: S.hasAbility(scholar, 'pocket_sand') ? 2 : 0,   // pocket_sand: blinded 2 rounds
      hesitate: S.hasAbility(scholar, 'fear_aura') ? 1 : 0,   // fear_aura: monsters hesitate
      stunned: 0,     // scream_cheese: stunned rounds
      log: [],
    };
  }

  function roll(range) { return range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1)); }

  // Player command → resolve one round. Returns {over, result, log[]}.
  // command: strike | harry | brace | study | flee
  function round(fight, command, scholar, abilitiesData) {
    const S = global.Scattering;
    const mods = S.modifiers.collectModifiers(scholar, abilitiesData || []);
    const log = [];
    fight.round += 1;

    const move = MOVES[fight.telegraph];
    let dmgToMonster = 0, dmgToScholar = 0, fled = false;

    // --- player action ---
    const hpFrac = scholar.maxHealth ? scholar.health / 100 : scholar.health / 100;
    if (command === 'strike') {
      let d = roll([10, 16]);
      // patient_aim now lives in the modifier pipeline (combat.strike_damage, condition round:1).
      // rage: below half health, +100% damage. You attack the nearest thing — friend or foe.
      // (In the wilds there's only foe. The System notes your restraint. For now.)
      if (S.hasAbility(scholar, 'rage') && hpFrac < 0.5) {
        d *= 2; scholar.kcal = Math.max(0, (scholar.kcal || 0) - 20);
        log.push('RAGE: +100% damage. (-20 kcal)');
      }
      // cornered_rat: below 30% health, desperation is a weapon. +100% damage.
      if (S.hasAbility(scholar, 'cornered_rat') && hpFrac < 0.3) {
        d *= 2; log.push('CORNERED RAT: desperation is a weapon. +100% damage.');
      }
      // dead_aim: studied round 1, thunder round 2. Guaranteed critical.
      if (fight.aimed) {
        d = Math.round(d * 2.5); fight.aimed = false;
        log.push('DEAD AIM: patience, then thunder. Critical ×2.5.');
      }
      dmgToMonster = Math.round(S.modifiers.resolve(d, 'combat.strike_damage', mods, { round: fight.round }));
      log.push(`You STRIKE for ${dmgToMonster}.`);
    } else if (command === 'scream') {
      // scream_cheese: so loud it curdles milk. Stuns 1 round. 1/day.
      const today = scholar.day;
      if (S.hasAbility(scholar, 'scream_cheese') && scholar.screamDay !== today) {
        scholar.screamDay = today; fight.stunned = 1;
        log.push('You SCREAM. Milk curdles somewhere. The monster freezes. (stunned 1 round)');
      } else log.push('Your throat is raw. No scream left today.');
      dmgToMonster = 0;
    } else if (command === 'harry') {
      dmgToMonster = roll([4, 8]);
      log.push(`You HARRY for ${dmgToMonster}, staying mobile.`);
    } else if (command === 'brace') {
      log.push('You BRACE. Hold the line.');
    } else if (command === 'study') {
      fight.studied = true;
      if (fight.round === 1 && S.hasAbility(scholar, 'dead_aim')) {
        fight.aimed = true;
        log.push('You STUDY it. Breath slow. The shot is already taken — it just hasn\'t happened yet. (dead_aim armed)');
      } else log.push('You STUDY it. The Codex drinks in the details.');
    } else if (command === 'flee') {
      // rage: you don't flee. The very idea is insulting.
      if (S.hasAbility(scholar, 'rage') && hpFrac < 0.5) {
        log.push('RAGE: flee? FLEE? The thought dies before it finishes.');
      } else if (Math.random() < 0.8) {
        fled = true;
        log.push('You FLEE — crashing through the undergrowth, heart hammering.');
      } else {
        log.push('You try to flee — it cuts you off!');
      }
    }

    // --- monster action (unless fled) ---
    if (!fled) {
      let incoming = roll(move.dmg);
      let handled = false; // stun/hesitate/blind fully resolve the monster's turn
      // scream_cheese: stunned. It doesn't act.
      if (fight.stunned > 0) {
        fight.stunned -= 1; incoming = 0; handled = true;
        log.push(`${move.name} — it's still frozen from your scream.`);
      }
      // fear_aura: it hesitates. One round, on the house.
      else if (fight.hesitate > 0) {
        fight.hesitate -= 1; incoming = 0; handled = true;
        log.push(`${move.name} — it hesitates. Something about you is wrong. (fear_aura)`);
      }
      // pocket_sand: blinded. 50% miss.
      else if (fight.blind > 0) {
        fight.blind -= 1;
        if (Math.random() < 0.5) { incoming = 0; handled = true; log.push(`${move.name} — it swings at sand-ghosts. Missed. (pocket_sand)`); }
      }
      // harry dodge: base 50%, adrenaline_control/cornered_rat add more.
      let dodge = S.modifiers.resolve(0.5, 'combat.dodge_chance', mods, {});
      if (S.hasAbility(scholar, 'cornered_rat') && hpFrac < 0.3) dodge += 0.25;
      if (!handled && command === 'harry' && Math.random() < Math.min(0.95, dodge)) {
        incoming = 0;
        log.push(`${move.name} — you slip aside. Missed.`);
      } else if (!handled && command === 'brace') {
        incoming = Math.ceil(incoming / 2);
        log.push(`${move.name} hits your guard for ${incoming}.`);
        if (fight.telegraph === 'charge') { // simple riposte
          const rip = 4;
          dmgToMonster += rip;
          log.push(`It impales itself on your braced line! +${rip} (riposte)`);
        }
      } else if (!handled && command === 'study') {
        log.push(`${move.name} — ${incoming} damage while you watch and learn.`);
      } else if (!handled) {
        log.push(`${move.name} hits for ${incoming}.`);
      }
      dmgToScholar = incoming;
    }

    // ARMOR: best protection in inventory reduces damage.
    // Bark (10) -> military vest (40). The System will make these obsolete.
    let protection = 0;
    // (scholar items don't carry defs here — check via global Game if available)
    if (typeof Game !== 'undefined' && Game.armorBonus) {
      protection = Game.armorBonus();
    }
    dmgToScholar = Math.max(0, dmgToScholar - protection);
    if (protection > 0 && incoming > 0) log.push(`Armor absorbs ${Math.min(incoming, protection)}.`);

    fight.monster.hp -= dmgToMonster;
    fight.scholarHp -= dmgToScholar;

    // --- next telegraph ---
    if (fight.monster.hp > 0 && !fled) {
      // simple pattern: charge, then trample if charge missed/dodged, else charge again
      fight.telegraph = (fight.telegraph === 'charge' && dmgToScholar === 0) ? 'trample' : 'charge';
      const next = MOVES[fight.telegraph];
      log.push(fight.studied
        ? `Next: ${next.name} — ${next.hint}`
        : `It shifts. ${next.name} incoming — you can't quite read it.`);
    }

    const over = fled || fight.monster.hp <= 0 || fight.scholarHp <= 0;
    const result = fled ? 'fled' : fight.monster.hp <= 0 ? 'won' : fight.scholarHp <= 0 ? 'lost' : null;
    return { over, result, log, dmgToMonster, dmgToScholar };
  }

  global.Scattering = global.Scattering || {};
  global.Scattering.combat = { newFight, round, MOVES };
})(typeof window !== 'undefined' ? window : globalThis);
