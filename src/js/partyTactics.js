// @ontology
// system: party-tactics
// description: Party-aware monster tactics (Steve 2026-10-10, PROGRESSION.md settled law #8: "Monsters are party-aware"). Pack hunters, party-splitters, and group punishers — tactics that scale, not flat bigger numbers. Every behavior keys off the player-side fighter count (>= 3): solo scouts face the same monsters as fair duels; parties face coordination.
// provides:
//   - tbPartySideCount()
//   - tbPackSpawnCount(mdef, partyN)
//   - tbPackmates(m)
//   - tbFlankBonus(m, target)
//   - tbIsolatedFighter()
//   - tbDensestFighter(radius)
//   - tbPartyCentroid()
//   - tbTacticalFoe(m, foe)
//   - tbIdeaDrift(m)
//   - tbRaiseEvictionWall(m, cells)
//   - tbClearEvictionWall()
//   - tbEvictionWallCells()
//   - tbWallActive()
//   - tbStaticCallOut(m)
//   - tbLuredAllyTurn(v)
//   - tbMostShamedFighter()
// rules:
//   - party_gate: every tactic keys off tbPartySideCount() >= minParty (default 3). Solo/duo fights never see pack tactics, splitters, or AoE-punish drift. (code: tbFlankBonus, tbTacticalFoe, tbIdeaDrift, tbStaticCallOut, tbEvictionWallCells)
//   - data_driven: which monsters do what lives in mdef.tactics (monsters.json), not in branches here. This module is the interpreter. (code: tbPackSpawnCount, tbTacticalFoe)
//   - blow_by_blow: tactics modify targeting, movement, and damage inside the real turn/round structure — never an outcome table. (code: all)
//   - telegraph_honest: the eviction wall warns its exact cells one round before it rises; the Eureka drift recomputes its telegraph cells when it moves. (code: tbRaiseEvictionWall, tbIdeaDrift)
//   - monsters_ignore_terrain: the eviction wall blocks player-side fighters only — it is the landlord's weapon, and monsters ignore terrain. (code: tbBlockedFor patch in game.js)
// consumes:
//   - Game.tbfight (fighters: mx, my, kind, alive, fled)
//   - Game.warnCells, Game.tbTerraform, Game.tbTerrainAt, Game.tbCanOccupy, Game.tbBlockedFor
//   - Game.tbStepToward, Game.tbFighter, Game.tbRefreshTelegraphUI, Game.tbVillagerSyncPos
//   - Game.encTelegraphKnown, Game.vmVoiceName, Game.audioEvent, Game.say
//   - Scattering.combat (patternCells)
//   - window.MonsterBehaviorHooks (hook registration surface for packTactics, landlordEviction, staticCallOut)
/* PARTY TACTICS — src/js/partyTactics.js
 *
 * Steve (2026-10-10): "bigger, badder, lethal — designed for parties." The
 * roster threatens individuals; a 4-6 person party trivializes most of it.
 * The answer is tactics that scale, not flat bigger numbers — static numbers
 * punish solo foragers and get trivialized by parties alike.
 *
 * Three tactic families, all data-driven from mdef.tactics:
 *
 * PACK HUNTERS (hushwolf, heckler, reunion):
 * - Spawn scales with your party: solo 2 wolves / party 4; solo 1 heckler /
 *   party 3; the Reunion mirrors your party (max 3). Solo scouts keep a fair
 *   duel. (tbPackSpawnCount, wired into startCombat)
 * - Flanking: each packmate adjacent to the target adds +flank damage, capped.
 *   (tbFlankBonus, applied at damage time — hushwolf rush, direct resolves)
 * - Focus the isolated: a party member 3+ tiles from the group draws the
 *   pack's full attention. Stay together. (packTactics hook -> m.packFocusKey)
 * - Pile-on: hecklers all pile their shame onto the most-shamed fighter.
 *
 * PARTY-SPLITTERS (landlord, voice_mimic_radio):
 * - EVICTION WALL (landlord): every 4 rounds against 3+ fighters, a wall is
 *   telegraphed through the densest cluster (exact cells, one round's
 *   warning), then rises for 3 rounds — player-side movement blocked, one
 *   service-entrance gap left open. Pick your side before it rises.
 * - THE CALL GOES OUT (Static): once per fight against 3+ fighters, the
 *   radio cries in a voice one of YOUR people would run toward and lures the
 *   nearest ally off alone for 2 rounds. A hand on their shoulder (move
 *   adjacent) breaks it — or end the radio.
 *
 * GROUP PUNISHERS (bright_idea, chorus_line):
 * - GREED DRIFT (Inspiration): while brightening against 3+ fighters, the
 *   Idea drifts toward the party centroid — the burst follows it. Spread out
 *   and it loses the scent.
 * - AIM DENSITY (Chorus Line): against 3+ fighters the Downbeat walks toward
 *   the densest cluster instead of the nearest fighter. Spread out.
 */
(function (_g) {
  'use strict';
  var G = (_g.Scattering && _g.Scattering.Game) ? _g.Scattering.Game : null;
  if (!G) return;
  var SC = _g.Scattering || {};

  function cheb(ax, ay, bx, by) { return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); }
  function sideOf(o) { return o && (o.kind === 'player' || o.kind === 'villager'); }
  function aliveSide(f) {
    return (f.fighters || []).filter(function (o) { return sideOf(o) && o.alive && !o.fled; });
  }
  function tacticsOf(mdef) { return ((mdef || {}).tactics) || {}; }

  var methods = {
    // Living player-side fighters in the current fight (player + allies).
    tbPartySideCount: function () {
      var f = this.tbfight;
      if (!f) return 1;
      return Math.max(1, aliveSide(f).length);
    },

    // DATA-DRIVEN SPAWN (party tactics 2026-10-10): how many of this monster
    // arrive, from mdef.tactics.packSpawn. partyN = player + allies joining.
    // No tactics.packSpawn -> legacy mdef.pack (belltoad's delayed chorus,
    // hummice swarm, field fights — untouched).
    tbPackSpawnCount: function (mdef, partyN) {
      var t = tacticsOf(mdef).packSpawn;
      if (!t) return (mdef.pack || 1);
      if (t.mirror) return Math.max(1, Math.min(t.max || 3, partyN || 1));
      if ((partyN || 1) >= 3) return (t.party != null ? t.party : (mdef.pack || 1));
      return (t.solo != null ? t.solo : (mdef.pack || 1));
    },

    // Living packmates of m (same species), excluding m itself.
    tbPackmates: function (m) {
      var f = this.tbfight;
      if (!f || !m || !m.mdef) return [];
      var id = m.mdef.id;
      return f.fighters.filter(function (o) {
        return o !== m && o.kind === 'monster' && o.alive && !o.fled &&
          o.mdef && o.mdef.id === id;
      });
    },

    // FLANK (party tactics 2026-10-10): each living packmate adjacent to the
    // target adds +flank damage, capped at flankCap. Party-gated: no flanking
    // a lone scout. Computed at damage time — never stale.
    tbFlankBonus: function (m, target) {
      var pt = tacticsOf(m && m.mdef).packTactics;
      if (!pt || !pt.flank) return 0;
      if (this.tbPartySideCount() < 3) return 0;
      if (!target || !target.alive || target.fled) return 0;
      var n = 0;
      var mates = this.tbPackmates(m);
      for (var i = 0; i < mates.length; i++) {
        if (cheb(mates[i].mx, mates[i].my, target.mx, target.my) <= 1) n++;
      }
      return Math.min(pt.flankCap || 99, n * pt.flank);
    },

    // The straggler: the player-side fighter whose nearest other player-side
    // fighter is 3+ tiles away. Null when the party is together or small.
    tbIsolatedFighter: function () {
      var f = this.tbfight;
      if (!f) return null;
      var side = aliveSide(f);
      if (side.length < 3) return null;
      var worst = null, worstD = -1;
      for (var i = 0; i < side.length; i++) {
        var nearest = Infinity;
        for (var j = 0; j < side.length; j++) {
          if (i === j) continue;
          nearest = Math.min(nearest, cheb(side[i].mx, side[i].my, side[j].mx, side[j].my));
        }
        if (nearest >= 3 && nearest > worstD) { worstD = nearest; worst = side[i]; }
      }
      return worst;
    },

    // The player-side fighter with the most player-side fighters within
    // radius — the densest cluster's representative.
    tbDensestFighter: function (radius) {
      var f = this.tbfight;
      if (!f) return null;
      var side = aliveSide(f);
      if (!side.length) return null;
      var best = side[0], bestN = -1;
      for (var i = 0; i < side.length; i++) {
        var n = 0;
        for (var j = 0; j < side.length; j++) {
          if (cheb(side[i].mx, side[i].my, side[j].mx, side[j].my) <= radius) n++;
        }
        if (n > bestN) { bestN = n; best = side[i]; }
      }
      return bestN >= 2 ? best : null;
    },

    // Centroid of the living player-side fighters.
    tbPartyCentroid: function () {
      var f = this.tbfight;
      if (!f) return null;
      var side = aliveSide(f);
      if (!side.length) return null;
      var sx = 0, sy = 0;
      for (var i = 0; i < side.length; i++) { sx += side[i].mx; sy += side[i].my; }
      return { x: sx / side.length, y: sy / side.length };
    },

    // TACTICAL TARGET OVERRIDE (party tactics 2026-10-10): called from the
    // generic foe-selection section. Returns a replacement {f, d} or null.
    // - focusIsolated: pack hunters run down the straggler (hook sets
    //   m.packFocusKey; bespoke branches read it too).
    // - aimDensity: the Chorus Line's Downbeat walks toward the densest
    //   cluster instead of the nearest fighter (its burst is self-centered,
    //   so the walk IS the aim).
    tbTacticalFoe: function (m, foe) {
      if (this.tbPartySideCount() < 3) return null;
      var t = tacticsOf(m && m.mdef);
      if (t.packTactics && t.packTactics.focusIsolated && m.packFocusKey) {
        var pf = this.tbFighter(m.packFocusKey);
        if (pf && pf.alive && !pf.fled && sideOf(pf)) {
          return { f: pf, d: cheb(m.mx, m.my, pf.mx, pf.my) };
        }
      }
      if (t.aoePunish && t.aoePunish.type === 'aimDensity') {
        var rep = this.tbDensestFighter(2);
        if (rep && (!foe || rep.key !== foe.f.key)) {
          return { f: rep, d: cheb(m.mx, m.my, rep.mx, rep.my) };
        }
      }
      return null;
    },

    // The most-shamed living player-side fighter (heckler pile-on target).
    tbMostShamedFighter: function () {
      var f = this.tbfight;
      if (!f) return null;
      var best = null, bestS = 0;
      for (var i = 0; i < f.fighters.length; i++) {
        var o = f.fighters[i];
        if (!sideOf(o) || !o.alive || o.fled) continue;
        var s = o.hkShamedByPack || 0;
        if (s > bestS) { bestS = s; best = o; }
      }
      return best;
    },

    // GREED DRIFT (party tactics 2026-10-10): the Inspiration drifts toward
    // the party centroid while brightening — greed as a targeting laser, and
    // its self-centered burst follows it. Spread out (nobody within 2 of the
    // centroid) and it loses the scent. Telegraph cells recompute — the grid
    // never lies about where the burst will land.
    tbIdeaDrift: function (m) {
      var ap = tacticsOf(m && m.mdef).aoePunish;
      if (!ap || ap.type !== 'driftToCluster') return;
      if (this.tbPartySideCount() < (ap.minParty || 3)) return;
      var tg = m.telegraph;
      if (!tg || tg.kind !== 'squares') return;
      var c = this.tbPartyCentroid();
      if (!c) return;
      var f = this.tbfight;
      var clustered = aliveSide(f).some(function (o) {
        return cheb(o.mx, o.my, c.x, c.y) <= 2;
      });
      if (!clustered) {
        if (!m.biDriftLost) {
          m.biDriftLost = true;
          this.say('The light wavers, pulled in too many directions — it holds still, uncertain. (Spread out: it lost the scent.)');
        }
        return;
      }
      m.biDriftLost = false;
      var dx = Math.sign(Math.round(c.x) - m.mx), dy = Math.sign(Math.round(c.y) - m.my);
      if (!dx && !dy) return;
      var nx = m.mx + dx, ny = m.my + dy;
      if (!this.tbCanOccupy(m, nx, ny)) return;
      m.mx = nx; m.my = ny;
      var pat = ((m.mdef || {}).attack || {}).pattern || { type: 'burst', radius: 2 };
      var cells = (SC.combat || {}).patternCells
        ? SC.combat.patternCells(pat, m.mx, m.my, m.mx, m.my) : [];
      tg.cells = cells;
      var p0 = this.tbFighter('p');
      tg.threatenedPlayer = !!(p0 && p0.alive && cells.some(function (cc) {
        return cc.cx === p0.mx && cc.cy === p0.my;
      }));
      this.warnCells(cells, tg.turnsLeft || 1);
      this.say('The glow leans toward the crowd — toward all of you. It is drifting closer. (It follows the group. SPREAD OUT.)');
      this.tbRefreshTelegraphUI();
    },

    // EVICTION WALL (party tactics 2026-10-10): the landlord's party-splitter.
    // Plan: pick the line through the densest cluster (orientation that best
    // splits the party), warn its exact cells one round ahead. Raise: next
    // landlord turn, terraform the cells (3-round duration), shove anyone
    // still standing on the line aside, leave the service-entrance gap open.
    tbEvictionWallCells: function () {
      var f = this.tbfight;
      if (!f) return null;
      var side = aliveSide(f);
      if (side.length < 3) return null;
      var cx = 0, cy = 0, i;
      for (i = 0; i < side.length; i++) { cx += side[i].mx; cy += side[i].my; }
      cx /= side.length; cy /= side.length;
      var best = null;
      for (var h = 0; h < 2; h++) {
        var horiz = h === 0, a = 0, b = 0;
        for (i = 0; i < side.length; i++) {
          var v = horiz ? side[i].my - cy : side[i].mx - cx;
          if (v < -0.5) a++; else if (v > 0.5) b++;
        }
        var score = Math.min(a, b);
        if (!best || score > best.score) best = { horiz: horiz, score: score };
      }
      if (!best || best.score < 1) return null;
      var lineC = best.horiz ? Math.round(cy) : Math.round(cx);
      var cells = [];
      for (i = 0; i <= 8; i++) {
        var x = best.horiz ? i : lineC, y = best.horiz ? lineC : i;
        if (this.tbTerrainAt(x, y)) continue; // first layer wins — warn only what will rise
        cells.push({ cx: x, cy: y });
      }
      if (cells.length < 3) return null;
      // THE SERVICE ENTRANCE: one gap, nearest the centroid — the wall
      // divides, it doesn't entomb.
      var gap = 0, gapD = Infinity;
      for (i = 0; i < cells.length; i++) {
        var d = cheb(cells[i].cx, cells[i].cy, cx, cy);
        if (d < gapD) { gapD = d; gap = i; }
      }
      var gapCell = cells.splice(gap, 1)[0];
      return { cells: cells, gap: gapCell };
    },

    tbRaiseEvictionWall: function (m, plan) {
      var f = this.tbfight;
      if (!f || !plan) return;
      var wallKeys = [];
      for (var i = 0; i < plan.cells.length; i++) {
        var c = plan.cells[i];
        if (this.tbTerrainAt(c.cx, c.cy)) continue;
        this.tbTerraform(c.cx, c.cy, 'eviction_wall');
        wallKeys.push(c.cx + ',' + c.cy);
      }
      // Shove anyone still on the line — the rising concrete shoulders them
      // aside. Nobody gets entombed by a telegraph they slept through.
      for (var k = 0; k < f.fighters.length; k++) {
        var o = f.fighters[k];
        if (!o.alive || o.fled) continue;
        if (wallKeys.indexOf(o.mx + ',' + o.my) < 0) continue;
        var placed = false;
        for (var r = 1; r <= 3 && !placed; r++) {
          for (var dy = -r; dy <= r && !placed; dy++) {
            for (var dx = -r; dx <= r && !placed; dx++) {
              var nx = o.mx + dx, ny = o.my + dy;
              if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
              if (this.tbTerrainAt(nx, ny) === 'eviction_wall') continue;
              if (this.tbBlockedFor(o, nx, ny)) continue;
              o.mx = nx; o.my = ny; placed = true;
            }
          }
        }
        if (o.kind === 'player' && this.state && this.state.scholar) {
          this.state.scholar.mx = o.mx; this.state.scholar.my = o.my;
        }
        if (o.kind === 'villager' && this.tbVillagerSyncPos) {
          try { this.tbVillagerSyncPos(o); } catch (e) {}
        }
      }
      f.evictionWall = { cells: wallKeys, expires: f.round + 3 };
      var g = plan.gap;
      this.say('"EVICTION." The wall comes up — concrete and signage, straight through your group. (3 rounds. The service entrance stays open' +
        (g ? ' at [' + g.cx + ',' + g.cy + ']' : '') + '.)');
      try { this.audioEvent('landlordEvict', {}); } catch (e) {}
      this.tbRefreshTelegraphUI();
    },

    tbClearEvictionWall: function () {
      var f = this.tbfight;
      if (!f || !f.evictionWall) return;
      var tf = f.terraform || {};
      for (var i = 0; i < f.evictionWall.cells.length; i++) {
        var k = f.evictionWall.cells[i];
        if (tf[k] === 'eviction_wall') delete tf[k];
      }
      f.evictionWall = null;
      this.say('The eviction wall sinks back into the dirt, signs and all. (The lease on the wall expired.)');
      this.tbRefreshTelegraphUI();
    },

    tbWallActive: function () {
      var f = this.tbfight;
      return (f && f.evictionWall) || null;
    },

    // THE CALL GOES OUT (party tactics 2026-10-10): the Static's party-
    // splitter. Once per fight, against 3+ fighters, the radio spends its
    // whole turn crying in a voice one of YOUR people would run toward — the
    // nearest ally is LURED for 2 rounds and walks toward the crying on
    // their turns. Counterplay: move adjacent (a hand on their shoulder
    // breaks it) or end the radio. Consumes the turn.
    tbStaticCallOut: function (m) {
      var f = this.tbfight;
      if (!f || f.over) return false;
      var sp = tacticsOf(m && m.mdef).split;
      if (!sp || sp.type !== 'allyLure') return false;
      if (m.vmCallOutUsed) return false;
      if (m.telegraph) return false;
      if (this.tbPartySideCount() < (sp.minParty || 3)) return false;
      var allies = f.fighters.filter(function (o) {
        return o.kind === 'villager' && o.alive && !o.fled && !o.vmLured;
      });
      if (allies.length < 2) return false;
      var self = this;
      allies.sort(function (a, b) {
        return cheb(m.mx, m.my, a.mx, a.my) - cheb(m.mx, m.my, b.mx, b.my);
      });
      var tgt = allies[0];
      m.vmCallOutUsed = true;
      tgt.vmLured = { by: m.key, turns: 2 };
      var vname = 'someone they love';
      try { vname = this.vmVoiceName(m, tgt) || vname; } catch (e) {}
      var vdisp = (vname === 'you') ? 'your own voice' : vname;
      this.say('"HELP ME! PLEASE!" — the voice is ' + vdisp + ', crying from the dark. ' +
        'But ' + tgt.name + ' is already moving toward it. ' +
        '(' + tgt.name + ' is LURED — 2 rounds. Move adjacent — a hand on their shoulder — to break it.)');
      try { this.audioEvent('staticCry', { close: true }); } catch (e) {}
      this.tbRefreshTelegraphUI();
      return true;
    },

    // A lured ally's turn: they walk toward the crying, and only that.
    // Returns true when the turn was handled here (no normal AI).
    tbLuredAllyTurn: function (v) {
      var lure = v.vmLured;
      if (!lure) return false;
      var f = this.tbfight;
      var p = this.tbFighter('p');
      // A hand on their shoulder breaks it — checked before they move.
      if (p && p.alive && !p.fled && cheb(p.mx, p.my, v.mx, v.my) <= 1) {
        v.vmLured = null;
        this.say(v.name + ' feels your hand on their shoulder and stops. The voice is just static again. (The lure breaks.)');
        return false;
      }
      var src = f && f.fighters.find(function (o) { return o.key === lure.by; });
      if (!src || !src.alive || src.fled) {
        v.vmLured = null; // the radio is gone — the voice dies with it
        return false;
      }
      var blocked = function (x, y) { return !this.tbCanOccupy(v, x, y); }.bind(this);
      var danger = null;
      try { danger = this.tbDangerCells(); } catch (e) {}
      var moved = 0;
      for (var i = 0; i < (v.speed || 3); i++) {
        if (cheb(v.mx, v.my, src.mx, src.my) <= 1) break;
        var s = this.tbStepToward(v, src.mx, src.my, blocked, danger);
        if (!s) break;
        v.mx = s.x; v.my = s.y; moved++;
      }
      if (moved && this.tbVillagerSyncPos) {
        try { this.tbVillagerSyncPos(v); } catch (e) {}
      }
      lure.turns -= 1;
      if (lure.turns <= 0) {
        v.vmLured = null;
        this.say(v.name + ' shakes their head clear — the voice fades into static. (The lure wears off.)');
      } else {
        this.say(v.name + ' walks toward the crying — they can\'t not. (LURED — ' +
          lure.turns + ' round' + (lure.turns === 1 ? '' : 's') +
          ' left. Move adjacent to break it.)');
      }
      this.tbRefreshTelegraphUI();
      return true;
    },
  };

  Object.assign(G, methods);

  // Pre-turn hook registrations (run via mbRunPreTurn; declared per monster
  // in src/data/monsterBehaviors.json). Non-consuming unless noted.
  var HB = _g.MonsterBehaviorHooks;
  if (HB) {
    // PACK TACTICS: pick the straggler / pile-on target before the bespoke
    // branch selects its foe. Never consumes the turn. Committed attacks
    // (active telegraphs) keep their target — the pack doesn't re-aim
    // mid-windup.
    HB.packTactics = function (game, m) {
      var f = game.tbfight;
      if (!f || f.over) return false;
      var pt = tacticsOf(m && m.mdef).packTactics;
      if (!pt) return false;
      if (game.tbPartySideCount() < 3) {
        m.packFocusKey = null; m.tactPileTarget = null; return false;
      }
      if (pt.focusIsolated && !m.telegraph) {
        var iso = game.tbIsolatedFighter();
        m.packFocusKey = iso ? iso.key : null;
        if (iso && !m.tactFocusSaid) {
          m.tactFocusSaid = true;
          game.say('The pack\'s heads turn as one — toward ' +
            (iso.kind === 'player' ? 'you' : iso.name) +
            '. The straggler. (They run down the isolated — stay together.)');
        }
      }
      if (pt.pileOn && !m.telegraph) {
        var mates = game.tbPackmates(m);
        if (mates.length) {
          var tgt = game.tbMostShamedFighter();
          m.tactPileTarget = tgt ? tgt.key : null;
        } else { m.tactPileTarget = null; }
      }
      return false;
    };

    // LANDLORD EVICTION: raise a pending wall at turn start, expire old
    // walls, or plan a new one. Never consumes the turn — the notice was the
    // cost; the wall is the consequence.
    HB.landlordEviction = function (game, m) {
      var f = game.tbfight;
      if (!f || f.over) return false;
      var sp = tacticsOf(m && m.mdef).split;
      if (!sp || sp.type !== 'evictionWall') return false;
      if (game.tbWallActive() && f.round >= f.evictionWall.expires) {
        game.tbClearEvictionWall();
      }
      if (m.llWallPending && m.llWallPending.round < f.round) {
        game.tbRaiseEvictionWall(m, m.llWallPending);
        m.llWallPending = null;
        return false;
      }
      if (m.telegraph || game.tbWallActive() || m.llWallPending) return false;
      if (game.tbPartySideCount() < (sp.minParty || 3)) return false;
      if (f.round - (m.llWallLastRound || 0) < (sp.everyRounds || 4)) return false;
      var plan = game.tbEvictionWallCells();
      if (!plan) return false;
      m.llWallPending = { cells: plan.cells, gap: plan.gap, round: f.round };
      m.llWallLastRound = f.round;
      game.warnCells(plan.cells, 1);
      var known = false;
      try { known = game.encTelegraphKnown(m); } catch (e) {}
      game.say(known
        ? '"REZONING." The ground cracks along a straight line through your group — the wall goes up next round. (Move off the line, or pick your side. The service entrance stays open.)'
        : 'The landlord hammers a LONG row of signs in a straight line. The ground under the line starts to crack. Something is coming up.');
      try { game.audioEvent('landlordEvict', {}); } catch (e) {}
      game.tbRefreshTelegraphUI();
      return false;
    };

    // STATIC CALL-OUT: consumes the turn when the call goes out.
    HB.staticCallOut = function (game, m) {
      return game.tbStaticCallOut(m);
    };
  }
})(typeof window !== 'undefined' ? window : global);
