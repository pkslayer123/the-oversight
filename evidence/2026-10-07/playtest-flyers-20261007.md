# Flyers play-audit — 2026-10-07 (Worker 2, flesh-out loop)

## Verdicts (up front)
- **Nevermore — PASS the Highbeam Deer bar.** Playable and enjoyable.
- **Nightcourt — PASS the Highbeam Deer bar.** Playable and enjoyable. The double-dive is the strongest flyer signature of the three.
- **Static Kite — PASS the Highbeam Deer bar.** Playable and enjoyable. Zone control reads clearly; the dip punish is the most satisfying punish window of the three.

All three were never play-audited before. Proof script `scripts/test-flyers-20261007.js`:
195 assertions, exit 0, green across 6 seeds (20261007, 20262016, 20270183, 4242, 5251, 13418).
Any phase/telegraph regression exits non-zero.

## How I played
- Engine: pristine `git archive HEAD` extract (NOT the dirty worktree). HEAD moved twice
  mid-run (09155ea → eb87e38 → efc1ec1, sibling commits interleaved, including a 50-file
  bulk restore of stale-tree damage); re-extracted and re-ran the full proof against
  the final HEAD efc1ec1. Full index.html module order minus DOM-only app.js/sprites.js/
  tile-scenes.js/move-anim.js and drama.js (touches `document` at load). Seeded mulberry32.
- Played AS THE PLAYER: dodged telegraphs (interior tiles 1..7), punished windows,
  tested hit-paths (stood in the telegraph) and miss-paths (dodged), verified the
  melee-refusal while airborne and the sling-as-ranged-answer.
- Correction to the dispatch brief: it swapped nightcourt/statickite. Per monsters.json
  at HEAD, **nightcourt is the wave-1 owl** (roost→dive→redive→grounded) and **statickite
  is the wave-2 System artifact** (rise→mark→transmit→recover). Audited per the data.

## Vs the deer bar
| criterion | nevermore | nightcourt | statickite |
|---|---|---|---|
| distinct telegraph text | shadow detaches → black lane | silence + growing moon-shadow | ground lights up in scan-grid |
| pattern visual on grid | 3-length lane, committed | single tile, committed | 3×3 zone, committed |
| phase system visible | PERCHED/STRAFING/GROUNDED badges | ROOSTING/DIVING/SECOND HEARING/SPENT | RISING/MARKING/TRANSMITTING/RECOVERING |
| distinct behavior | only flyer that LANDS; voices of the dead | double-dive, re-aims at your new tile | never lands; dips to transmit instead |
| knowledge gating | unknown: shadow line; known: "MOVE OFF IT" | unknown: "No sound…"; 2nd warning always coached | unknown: framing line; known: "TWO beats. MOVE" |

## Phase cycles (all asserted in the proof script)
- **Nevermore:** perch (high, melee refused honestly — "high overhead — out of reach," 0 dmg)
  → strafe (3 cells, 1-beat windup) → grounded (1 turn on hit for 14–22, 2 turns on miss)
  → climbs → perch. Grounded punish announces +50%.
- **Nightcourt:** roost → dive (1 tile; faster owl ambush-opens when in range) → on a MISS
  it turns mid-air ("It TURNS, mid-air, impossibly") and re-dives next turn, re-aimed at
  the player's CURRENT tile → two misses → SPENT, grounded 2 turns → roost. A landed
  dive (12–18) skips the redive and grounds it directly. Grounded punish announces +50%.
- **Static Kite:** rise → mark (3×3, 2-beat windup — "the mark is the mercy") → transmit
  (zone damage 10–16 sonic + DIPS LOW, melee-vulnerable, +50% while low, one player turn)
  → recover (climbs, 2-turn cooldown, drifts, doesn't mark) → rise. NEVER grounds.
  Sling (range 4) reaches it while high — the ranged answer is real; spear is refused.

## Feel notes (not bugs)
1. **Audio silence (known gap, engine owner — do not re-audit):** kiteUnfold, nevermoreUnfold,
   nightcourtTurn, nightcourtDive are data-declared but have no synths; the declare path
   goes fully silent (truthy values bypass the deerAggro fallback). What DID fire and
   sounded right per the audio log: nevermoreCroak/Strafe/Land/Climb, nightcourtSilence/
   Land/Climb, kiteHum/Mark/Broadcast/Transmit/Climb.
2. **Kite 'rise' is nearly unobservable at fight start:** it marks on its first turn at
   d≤6, and max spawn distance keeps it in range — the drift only reads during recover.
   Not a bug (opening with the mark is dramatic), but the data comment oversells "rise."
3. **Nightcourt's "IMMEDIATE" redive** actually declares on its next turn (one player-turn
   gap). Reads fine in play — the turn text sells the impossibility.
4. **nevermoreVoice() is real:** it speaks with the run's actual dead villagers' names
   ("—told you the creek was—"). The fiction is implemented, not flavor text.
5. **Footwork passive** can slip a telegraph while standing still — working as designed;
   the proof script neuters it (agi 3, no passives) to assert the telegraph→damage
   pipeline deterministically.

## Hazards / handoffs for the parent
- **abilityActions.js was MISSING from HEAD eb87e38** — deleted by the version-bump sweep
  in cda7946 and never restored (eb87e38 restored monsterBehaviors.js + statusEffects.js
  only); index.html still referenced it. The sibling's bulk restore (7b49fc5, now in
  efc1ec1) has since restored it — verified present at efc1ec1. Live-breaker resolved
  by the sibling; NOT touched by me. (My earlier harness runs extracted the file from
  cda7946^ into the /tmp extract only.)
- Shared tree still very dirty (399 status entries at commit time); sibling's staged
  cleanup still armed in the shared index. I touched nothing but my two new files.
- No engine files edited. No push (per instructions).
