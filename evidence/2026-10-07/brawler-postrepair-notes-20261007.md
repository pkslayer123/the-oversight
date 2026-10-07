# Brawler path POST-REPAIR verification — 2026-10-07 (Steve 2026-10-05)

Post-repair verification of the brawler ability path at HEAD `934169e`
(post repair `2907a57` which re-applied the 8 data actions reverted by
stale-tree revert `7b49fc5`). Read-only run against a pristine extract
(`git archive HEAD`, /tmp/headjs-brawler); the worktree carried a sibling's
cherry-pick in progress and was not touched for reads.

## Proof result

`scripts/test-brawler-reverify-20261007.js` (Worker 2's script, at HEAD) run
at seeds 7 and 42: **36 ok, 9 FAIL — identical both seeds.**

The 9 FAILs are the script's STALE PINS, not a new regression. Worker 2 wrote
the script pre-repair (`b64986a`, before `2907a57`), pinning the broken state
as the expected state:
- Section A check 2 ("8 actions ABSENT from HEAD data") fails because all 8
  ARE now present.
- Section F ("useAbility rejects the 8") fails because the defs now resolve;
  in that run the kit had been dropped by section D, so the failure message
  was "You don't have that ability" rather than the expected "doesn't exist".

Direct reachability probe (fresh harness, abilities granted): all 8 restored
actions resolve via `abilityActionDef`, are owned via `hasAbility`, execute
through `useAbility` with narration, and have real implementations (none
report "isn't wired up yet"):
- `iron_stomach.push_through` ret=true, narrates, costs 30 kcal (explore)
- `second_wind.refuse_death` ret=false outside combat — honest refusal
  ("This is a combat action — only usable in a fight"); manual invocation
  explains it is automatic-on-death, never silent
- `rage.unleash_rage`, `fear_aura.loom`, `brawler_instinct.read_fight`,
  `intimidating_presence.stare_down` — honest combat-context refusals outside
  combat; all execute in-fight
- `fear_aura.menace`, `intimidating_presence.end_it_before` ret=true with
  narration (social context)
- `stare_down` targeted: 50% disengage fires via `m.fled` (engine's real
  disengage), fearless monsters honestly immune; no-target use honestly says
  "No one to stare down"

## Per-finding verdicts

(a) All 15 data actions present and reachable via useAbility with narration
(the repair) — **FIXED**. 15/15 in `abilities.json` at HEAD; 7/7 section-B
live-fight checks green (trade window, settle_debt fires after real damage,
haymaker 2.5x consumed, brace 60% reduction fires, shake_off clears real
fighter stun via cureStatus, bellow writes the engine `stunned` field and eats
a monster turn, challenge narrates flavor-only). No silent actions observed.

(b) 3 brawler synergies lacking `discovery_method` — **STILL BROKEN**.
unstoppable / fear_itself / one_person_army never unlock via play
(`checkSynergyDiscovery` skips them). Forced unlock works (ceremony fires).
Synergy machinery is fine: `requires_any` honored, empty-requires
always-active bug fixed, synergy-leg path evaluates via discovery not
abilityLevel. Missing: discovery_method on the 3 data entries.

(c) 10/10 brawler modifiers unconsumed — **STILL BROKEN**. Zero engine
consumers for combat.trade_window, combat.knockdown_resist,
combat.stun_duration, combat.heavy_damage, combat.damage_taken,
combat.morale_break_resist, social.intimidate, combat.enemy_morale,
combat.outnumbered_bonus, combat.solo_damage.

(d) Per-fight flag leaks — **STILL BROKEN**. rageActive, tradeOpen,
debtSettled, shakeOffUsed all survive into the next fight. Partial
improvement: fightDamageTaken now resets on startCombat (the stale-99 ledger
bug is gone; only opener damage remains).

(e) Brace "cannot be knocked down" text vs engine — **PARTIAL**. The 60%
reduction is wired and fires in combat ("BRACE: you take it on the shoulder").
But there is NO knockdown mechanic anywhere in src/js — `braceActive.noKnockdown`
is set and read by nothing. The text promises immunity to a system that
doesn't exist (vacuously true, untestable). Either knockdown needs to exist or
the text should drop the clause.

(f) unleash_rage frenzy targeting — **PARTIAL**. +100% damage for 3 rounds
works, rounds count down, cost honest (turn + 60 kcal), narration names the
tradeoff. But `frenzy: true` is set and read by nothing: no forced
nearest-target (friend-or-foe) and no retreat lock. The narration makes
promises the engine doesn't keep.

## Play-feel judgment (as a player, full 15-action kit vs gallowdeer)

The restored loop plays as a real game loop with genuine decisions:
scout with read_fight (+2 speed, costs the turn) → open_trade (pay 10 HP for
+50% x3 strikes) → cash bruises with settle_debt → brace the answer (60% DR)
→ bellow to buy a turn (engine stun, monster skips) → wind up haymaker
(telegraphed 2.5x) → stare_down for a 50% disengage when winning, or
unleash_rage when desperate (double damage, 3 rounds). Every action narrates
("You focus — that costs your action." prefix), costs are named and paid
(turns, 30–60 kcal, 10 HP), refusals are honest ("This is a combat action —
only usable in a fight"), nothing is silent.

Vs the Highbeam Deer bar: the loop has phase feel (scout → trade → cash in →
finish) and distinct telegraph text per action, and the brawler identity
(pain-trading economy + crowd control + finishers) is clearly distinct from
other kits. Gaps vs the bar: no player-side grid attack-pattern visuals
(monster-side concerns like beam sweeps don't apply), audio cues not verifiable
in node, and the unwired promises in (e)/(f) plus undiscoverable synergies (b)
and dead modifiers (c) are the remaining distance. The loop is playable and
enjoyable in the harness — it needs a real phone playtest pass to judge fun,
not just mechanics.

## Flags for the coordinator

1. Worker 2's proof script now pins the BROKEN state in sections A.2 and F;
   post-repair it reads as 9 FAIL. Any future re-run needs the pins inverted
   (expect present / expect execution) or the report will keep looking red.
2. Section F's "You don't have that ability" detail line is a harness
   artifact: section D drops the granted kit and doesn't re-grant before F.
   Real gameplay (abilities held) executes fine — verified in the direct probe.
3. (e)/(f) are text-vs-engine promise mismatches (knockdown immunity,
   frenzy targeting, retreat lock) — design call whether to build the
   mechanics or trim the text.
