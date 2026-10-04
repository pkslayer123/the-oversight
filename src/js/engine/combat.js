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
    return {
      monster: { id: monster.id, name: monster.name, hp: monster.hp[0] + Math.floor(Math.random() * (monster.hp[1] - monster.hp[0])), maxHp: monster.hp[1] },
      scholarHp: scholar.health,
      round: 0,
      telegraph: 'charge', // first round always the signature
      studied: false,
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
    if (command === 'strike') {
      let d = roll([10, 16]);
      // Patient Aim: first strike ×2
      if (fight.round === 1 && S.hasAbility(scholar, 'patient_aim')) {
        d *= 2; log.push('Jesse doesn\'t blink. One shot. (Patient Aim ×2)');
      }
      dmgToMonster = Math.round(S.modifiers.resolve(d, 'combat.strike_damage', mods, {}));
      log.push(`You STRIKE for ${dmgToMonster}.`);
    } else if (command === 'harry') {
      dmgToMonster = roll([4, 8]);
      log.push(`You HARRY for ${dmgToMonster}, staying mobile.`);
    } else if (command === 'brace') {
      log.push('You BRACE. Hold the line.');
    } else if (command === 'study') {
      fight.studied = true;
      log.push('You STUDY it. The Codex drinks in the details.');
    } else if (command === 'flee') {
      if (Math.random() < 0.8) {
        fled = true;
        log.push('You FLEE — crashing through the undergrowth, heart hammering.');
      } else {
        log.push('You try to flee — it cuts you off!');
      }
    }

    // --- monster action (unless fled) ---
    if (!fled) {
      let incoming = roll(move.dmg);
      if (command === 'harry' && Math.random() < 0.5) {
        incoming = 0;
        log.push(`${move.name} — you slip aside. Missed.`);
      } else if (command === 'brace') {
        incoming = Math.ceil(incoming / 2);
        log.push(`${move.name} hits your guard for ${incoming}.`);
        if (fight.telegraph === 'charge') { // simple riposte
          const rip = 4;
          dmgToMonster += rip;
          log.push(`It impales itself on your braced line! +${rip} (riposte)`);
        }
      } else if (command === 'study') {
        log.push(`${move.name} — ${incoming} damage while you watch and learn.`);
      } else {
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
