# Break-it: alien players — r13 (2026-10-10, night)

Target index 7, round 13. Attacked `src/js/alienPlayers.js` (2868 lines, 76 methods).
Read docs/CANON.md first, then the alienPlayers section of docs/ONTOLOGY.md
(knowledge_alien_word, knowledge_persona_names, wealth, lifeline_player_only,
death_permanent, salvage_kill_only), plus prior evidence r4/r6/r7/r11/r12 so
nothing was re-litigated. index.html still loads alienPlayers.js (line 47) —
the 2026-10-08 dead-code fix is intact.

Proof: `scripts/test-break-alien-20261010-r13.js` — **75 checks, all green.**
Red→green demonstrated: pre-fix, exactly the 18 catch checks fail (6 per
catch × 3 seeds); post-fix 75/75. Regression: r6 75/75, r7 252/252, r11 54/54,
r12 126/126, economy 10/10, decay-20261008 52/52 — all green after the
harness-parity + stale-setup fixes below. Ontology: 63/63 validated.

## Catches (3), all fixed

**C1 — wealth-stance mechanics were knowledge-gated (mechanics bug, canon
(wealth) violation).** `apApplyWealthStance` set `fighter._enraged` and
`fighter._wantsRetreat` ONLY inside the `apKnowsAlien(pid)` announcement gate.
A rich persona (Vex/Sable/Rax) fought pre-reveal NEVER enraged: no 1.5× damage
(encounters.js:2739/2774), no beam +0.2 chance (alienPlayers.js:2629) — on
fights 1–2, the sadistic trio were mechanically tamer than the canon promises
("rich never retreat and enrage when hurt — death is an inconvenience"). The
retreat half was masked because `tbAlienTurn` re-computes stance directly
(knowledge-free), but the enrage half had no such backup. Fix: flags set
unconditionally; only the theatrical lines stay gated. Post-reveal the
"ENRAGED" announcement still fires (proven in test).

**C2 — favor why-copy named the persona pre-reveal (knowledge leak).**
`apOnCombatEnd`'s favor block passed `'defeated ' + p.name` / `'lost to ' +
p.name` / `'fled from ' + p.name` into `apAdjustFavor`, which sysSays the
why-copy when |n|≥3 — putting "defeated Countess Sable" on the System feed on
fight 1–2. r11's sweep of "~30 p.name surfaces" missed it because the name
flows through the `why` parameter. Fix: gate on `apKnowsAlien(pid)` → "the
stranger" pre-reveal (the 3rd-encounter reveal runs earlier in the same
function, so fight 3 names honestly — proven in test).

**C3 — persona-package cards/photos named the persona pre-reveal (knowledge
leak, same class as r11's group-banter fix).** `apPersonaPackage`: the sadistic
card read `"With love, Countess Sable."` and the tracker line named them; the
neutral card/photo named them too — all on encounter 1, before the 3rd-encounter
reveal. r7's comment claimed "the signed cover name stays — they signed the
card," but there ARE no cover names in the data (the exact assumption r11's H4
disproved for banter). Fix: pre-reveal the sadistic card is unsigned ("The
card reads: 'With love.' No name. You don't like that." — the creep is the
point), the tracker line says "whoever sent this," the neutral card is
unsigned loopy handwriting and the photo is of "someone." Post-reveal copy
unchanged.

## Held — real attacks that resisted

- **Cooldown gaming (save/load, repeat triggers):** dead-drop 3d, feed 1d,
  care-package 4d, club-boon 5d, persona-package 6d, group 14d, lifeline 7d —
  all keyed on `scholar.day`, all recorded only on success (after chance
  rolls), all global not per-persona. No day-decrement path exists; save/load
  can't rewind them (proven: same-day re-calls all return false).
- **Beam vs the 2026-10-09 armor model:** beams deliberately bypass the
  diminishing-returns formula with their own 0.7^n resist model — the fiction
  ("The beam doesn't care about your armor") and the copy agree, and
  `apBeamResistPieces` only counts equipped armor with `beamResist` or
  bond≥25 sentimental armor. By design, honest, not an exploit.
- **Broke-retreat "free wins":** retreat ends 'won' (+4/+6 fight favor) but
  sporting rules (2d/persona, enforced in both roll paths + recorded on
  successful start) bound it; favor clamps ±100 with 1/day drift. No farm.
- **Group-chain softlocks:** player death mid-chain disperses (consume-first,
  r11); persona death mid-chain still chains the next fighter (design);
  refused starts announce dispersal honestly (r11). Stasis: `apStasisFieldLive`
  is false when the fielder dies/flees/ends (re-verified); tbBarrierExit is
  the only mid-combat flee path and the stasis wrap consumes it by design (a
  stasis fight is a fight to the death — stated, not silent).
- **Playground villager kills:** random non-dead villager excluding the
  player; death goes through registerDeath+removeVillager like every other
  death path. No villager is quest-essential (unique-person law), contacts are
  bonuses — no dead end. Contact warnings stay vague-by-design (r7 verdict
  holds: no timeline, no mechanic promised).
- **Wacky gifts "never dinner":** `apWackyGift` filters `!it.kcalEach &&
  it.class !== 'food'` — 300 draws across tiers, zero dinner.
- **3rd-encounter reveal is per-persona:** two personas at 2 encounters stay
  hidden; the third fight reveals only that persona (proven).
- **Beam targeting:** `apMaybeBeamAttack` calls `apBeamHit('player', …)` —
  matches the "beam weapons are for the player" copy; engine key 'p'
  resolution holds (r8 fix intact).
- **Dead-code census:** all 76 methods have ≥1 runtime call site (internal
  `this.fn(` or external). Flagged: apPilotTaunt (tbAfter wrap), apReadinessCheck
  (apEncounterEligible wrap — genuinely wired, not debug-only), apDousePlayerFire
  (raid path), apWackyGift (care package + club boon), apContactWarning
  (apDailyTick), apStasisFieldLive (barrier-exit wrap), apBeamResistPieces/Level
  (beam path + readiness). No dead exports.
- **Persona names in other modules:** encounters.js dread-projector source is
  gated; broadcast/contest "aliens" copy refers to the broadcasters (diegetic
  Oversight fiction), not the fighter identities — not a leak.

## Sibling sweep — infrastructure (same bug class, fixed)

- **Harness/index.html parity drift (the r7 lesson, again):** 11 node-safe
  modules shipped in index.html since the harness was last synced
  (waveLedger, feastBuff, partyTactics, sigW3a/b/c, metaProgression,
  havenGrowth, comms, safetynets, villageAgency). The harness now matches
  index.html order exactly (minus the DOM-only five) and carries a PARITY RULE
  comment.
- **Stale `waveKills` setups (Steve 2026-10-10: unlockedWave moved to the wave
  ledger):** six suites set `state.waveKills={1:10}` expecting wave 2 — now
  silently ineligible, so apDailyTick/apRollEncounter/apContestInterference
  early-returned and tests failed (or worse, passed vacuously). Fixed the setup
  in r6, r7, r12, economy, and decay-20261008 suites (`ledgerState()[1].points
  = 5`). ~14 older scripts still carry the pattern — flagged for the
  coordinator, not rewritten (most are superseded by r6–r13 suites; the
  2026-10-08 integration suite also references removed contest APIs and is
  genuinely obsolete).
- **Two brittle assertions repaired in the decay suite:** beam-damage
  expectation ignored the HP floor (`p.hp === 100-dealt` fails when dealt>100
  — now `Math.max(0, …)`); economy suite's `total > 0` was impossible with
  startKcal=3000 > kcalCap 2400 (first grant clamps 3000→2400 — test artifact,
  the cap is correct one-economy behavior; starts at 0 now).

## Minor nit (noted, not changed)

- apVillageGossip has a hardcoded "Mara" in a gossip line ("Mara swears she
  met a stranger…") — a phantom villager if no Mara exists in the village.
  Gossip-flavor fiction, low value to churn; flagging for a copy pass rather
  than fixing unilaterally.

## Landing

- Files changed: src/js/alienPlayers.js (3 fixes), scripts/break-alien-harness.js
  (parity), scripts/test-break-alien-20261010-r13.js (new, 75 checks),
  scripts/test-alien-r12-breakit.js / test-alien-r7-breakit-20261009.js /
  test-alien-breakit-20261009.js / test-alien-break-economy.js /
  test-break-alien-20261008.js (stale-setup repairs).
- No [needs-eyes]: C1 changes combat mechanics pre-reveal (rich personas now
  actually enrage on fights 1–2 — harder early alien fights), but it's a
  canon-conformance fix, no UI/feel surface change. Coordinator's call whether
  Steve should know his first two Vex fights just got meaner.
- Worktree contains only committed work after landing (to be verified).
