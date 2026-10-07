// @ontology
// system: monsterBehaviors
// description: Data-driven monster behavior dispatch. Replaces per-species if/else branches in tbMonsterTurn with a behavior table (monsterBehaviors.json) + registered hook functions. Migrated species run verbatim-extracted logic from the registry; unmigrated species keep inline branches until proven.
// provides:
//   - monsterBehavior(id)
//   - mbRunPreTurn(m)
// rules:
//   - identical: migrated hooks are VERBATIM extractions from tbMonsterTurn — relocation, not redesign. Behavior must be bit-identical. (code: mbRunPreTurn)
//   - dispatch: monsterBehaviors.json declares preTurnHooks per monster id; the interpreter runs them in order. A hook returning true consumes the turn. (code: mbRunPreTurn)
//   - dead: hornIs/swarmIs/beastIs reference deleted monster ids (hype_horn/camera_swarm/delegate_beast) — those branches are dead code, NOT migrated. Flagged for Steve. (code: mbRunPreTurn)
//   - incremental: migrate species one at a time with differential tests. Do not bulk-migrate. (code: monsterBehavior)
// consumes:
//   - tbAntlerThrash, tbHumSwarmCheck, tbEndCheck, tbRefreshTelegraphUI, encUsesFifo, encScanThreats, encSetPhase, encPhaseFor, encConfig, encThreatQueue, tbFighter, say, saySituationOnce, audioEvent
/* MONSTER BEHAVIORS — src/js/monsterBehaviors.js
 *
 * Steve (2026-10-07, scaffold audit): tbMonsterTurn was 2,228 lines of
 * per-species if/else. This module + monsterBehaviors.json replaces the
 * dispatch with data. Each monster's behavior table declares ordered
 * preTurnHooks; the interpreter runs them. Hooks are verbatim extractions —
 * the same code, relocated. Behavior is IDENTICAL by construction.
 *
 * Migration pattern (for future workers):
 * 1. Add the species' hook names to its monsterBehaviors.json entry
 * 2. Extract the branch VERBATIM into a registered hook below
 * 3. Remove the inline branch from tbMonsterTurn
 * 4. Add differential test scenarios to test-monster-behaviors-20261007.js
 */
(function (_g) {
  'use strict';
  var G = (_g.Scattering && _g.Scattering.Game) ? _g.Scattering.Game : null;
  if (!G) return;

  // Named pre-turn hooks. Each takes (game, monster) and returns true if
  // the hook consumed the monster's turn (tbMonsterTurn should return).
  var hooks = {
    // HIGHBEAM (Steve 2026-10-05): closing in is risky EVERY turn, not just
    // while the beam fires. The antlers thrash anyone adjacent IN ADDITION
    // to whatever the deer is doing — you take damage standing next to it
    // AND the beam keeps coming. You get in, you hit, you get OUT.
    // Verbatim from tbMonsterTurn (gallowdeer branch).
    antlerThrash: function (game, m) {
      if (m.beamPhase !== 'firing') {
        game.tbAntlerThrash(m);
        if (game.tbEndCheck()) return true;
      }
      return false;
    },

    // BUNKER (speedbump): sealed in its shell. It doesn't act — it waits
    // you out. Nearly invulnerable; the answer is patience, not force.
    // Verbatim from tbMonsterTurn (speedbump_turtle branch).
    turtleBunker: function (game, m) {
      if ((m.turtleBunker || 0) > 0) {
        var useFifo = game.encUsesFifo(m);
        m.turtleBunker -= 1;
        if (m.turtleBunker <= 0) {
          m.bunkerNoted = false;
          if (useFifo) game.encSetPhase(m, game.encPhaseFor(m, 'idle'));
          game.say('The shell unseals with a soft pop. The bad attitude is back.');
        } else {
          game.say('The boulder sits. Sealed. Waiting you out.');
        }
        game.tbRefreshTelegraphUI();
        if (game.tbEndCheck()) return true;
        return true;
      }
      return false;
    },

    // HUMMICE: the swarm checks itself every turn — deaths drop voices,
    // distance thins the hum.
    // Verbatim from tbMonsterTurn (hummice branch).
    humSwarmCheck: function (game, m) {
      game.tbHumSwarmCheck(m);
      return false;
    },

    // CROWD OVERLOAD (drone): it can't grade a crowd. More live targets
    // than crowdLimit on the queue and the evaluation stalls out.
    // Bring friends. (The deer is unaffected.)
    // Verbatim from tbMonsterTurn (review_drone branch).
    droneCrowdOverload: function (game, m) {
      if (!game.encUsesFifo(m)) return false;
      var limit = ((game.encConfig(m) || {}).crowdLimit) || 2;
      var live = game.encThreatQueue(m).filter(function (k) {
        var t = game.tbFighter(k); return t && t.alive && !t.fled;
      });
      // ADAPTATION: after 1 recalc the drone narrows scope and grades
      // anyway (see the drone's bespoke block). Crowds buy time, not immunity.
      if (live.length > limit && (m.drRecalcs || 0) < 1) {
        m.drRecalcs = (m.drRecalcs || 0) + 1;
        m.telegraph = null;
        game.encSetPhase(m, 'recalc');
        game.say('📊 "TOO MANY SUBJECTS. EVALUATION PAUSED. RECALIBRATING." The drone backs off, overwhelmed by the crowd.');
        game.audioEvent('droneRecalc');
        game.tbRefreshTelegraphUI();
        if (game.tbEndCheck()) return true;
        return true;
      }
      return false;
    },
  };

  var methods = {
    // Look up a monster's behavior table entry.
    monsterBehavior: function (id) {
      return (((this.data || {}).monsterBehaviors || {}).behaviors || {})[id] || null;
    },

    // Run data-driven pre-turn hooks for a monster. Returns true if a hook
    // consumed the turn (caller should return from tbMonsterTurn).
    mbRunPreTurn: function (m) {
      var id = m && m.mdef && m.mdef.id;
      if (!id) return false;
      var beh = this.monsterBehavior(id);
      if (!beh || !beh.preTurnHooks || !beh.preTurnHooks.length) return false;
      for (var i = 0; i < beh.preTurnHooks.length; i++) {
        var fn = hooks[beh.preTurnHooks[i]];
        if (typeof fn !== 'function') continue;
        if (fn(this, m)) return true;
      }
      return false;
    },
  };
  Object.assign(G, methods);

  // Exposed for tests and future migrations.
  _g.MonsterBehaviorHooks = hooks;
})(typeof window !== 'undefined' ? window : global);
