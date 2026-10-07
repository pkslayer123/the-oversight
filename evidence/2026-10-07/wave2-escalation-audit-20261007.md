# Wave-2 escalation audit — "wave 2 on its own terms" (2026-10-07)

Base: `7ad831dce917ef98a1a3135bcb7f4e18c5bce796` (master). Audit performed
against `f21d9bfa56aeb1a7914dd2015394103cab613e17`; the intervening commit
(7ad831d, statickite telegraph-proof evidence only) touches none of
src/data/monsters.json, src/js/app.js, or docs/MONSTER-WAVES.md — verified via
`git diff --name-only`. All reads from a pristine HEAD extract
(`git archive HEAD`); the worktree/index were not touched.

Method: `scripts/audit-wave2-escalation-20261007.js` scores each wave-2 monster
(discovered dynamically — 13 at HEAD, not the 10 in the task brief) on 7
dimensions: HP/damage vs the doc band (HP 30–170, damage 12–34, seeded Monte
Carlo n=20000, mulberry32 seed 20261007), telegraph distinctness (global
duplicate census), phase system, bespoke audio hooks (resolved against the
app.js synth registry — missing aggroAudio falls back to `deerAggro`),
codex coverage (stages + knownCue + knownTactics), attack-pattern distinctness
vs wave-1 monsters sharing the pattern type, and armor/resistances.

Headline: **3 PASS / 10 NEEDS-WORK at HEAD.** No wave-2 monster is a strict
reskin (telegraphs are all bespoke and unique, all aggroAudio hooks resolve to
real synths — zero `deerAggro` fallbacks). The gaps are completion gaps
against the Highbeam Deer checklist, and every one is data-only.

## Verdicts

| Monster | Verdict | Escalation thesis |
|---|---|---|
| Static (voice_mimic_radio) | NEEDS-WORK | Weaponized trust — the lure IS the telegraph; you walk into the ambush yourself. |
| Grief Counselor (mirror_stag) | PASS | The deer, iterated — same chassis, but the charge wants you to SEE it coming; the wheel punishes the dodge. |
| Performance Review (review_drone) | PASS | The exam you cannot cram for — a 3-turn countdown with the firing line pre-drawn on the dirt. |
| Inspiration (bright_idea) | NEEDS-WORK | Greed as a targeting laser — the longer you admire it, the closer the detonation. |
| Nostalgia (memory_projector) | NEEDS-WORK | Homesickness with a firing solution — it holds you still with what you miss. |
| Extended Warranty (warranty_caller) | NEEDS-WORK | The call you cannot hang up on — it dials stationary targets; stillness is the tell. |
| The Understudy (understudy) | NEEDS-WORK | Your own build, turned around — it learns your favorite move and performs it back. |
| The Landlord (landlord) | NEEDS-WORK | The ground is the monster — leased tiles tax every round you stand still. |
| The Heckler (heckler) | NEEDS-WORK | Morale damage — shame stacks and the swing is incidental; answer back or end it fast. |
| The Paparazzo (paparazzo) | NEEDS-WORK | Four shots to the money shot — every photo makes the next one undodgeable. |
| The Union Rep (union_rep) | NEEDS-WORK | It does not fight, it organizes — the picket line is the damage. |
| The Moderator (moderator) | PASS | Wave-2 apex — content enforcement: muting and shadowban before removal. |
| The Static Kite (statickite) | NEEDS-WORK | Marked for broadcast — the scan zone is the telegraph; the dip is the melee window. |

## What's missing per NEEDS-WORK monster (all addressed by patches)

- **knownTactics absent on 11/13** (only mirror_stag + statickite have it) — the
  single biggest systemic gap: no learned-pattern coaching in the codex for
  nearly the whole wave. Affects: static, inspiration, nostalgia, warranty,
  understudy, landlord, heckler, paparazzo, union_rep.
- **Unwired bespoke audio**: synths exist in app.js but no encounter hook fires
  them — the resolve beat plays silent. static→staticBreak, inspiration→
  eurekaDetonate, nostalgia→projectorFire, understudy→understudyPerform,
  landlord→landlordEvict, heckler→hecklerHeadliner, paparazzo→paparazzoExclusive,
  union_rep→unionWalkout. (Warranty has no resolve synth; nothing to wire.)
- **Bare attack patterns** (identical data signature to wave-1's weakest):
  understudy/landlord/heckler/union_rep are `{"type":"direct"}` with zero params
  (wave-1 ducks are the same shape); paparazzo is `{"type":"burst"}` with no
  radius/windup (engine defaults radius 1). No grid-visual distinctness.
- **Below the doc damage band**: heckler [8,12] and statickite [10,16] vs the
  published 12–34 floor. (Heckler's real weapon is the SHAME mechanic, which is
  complete in code — the patch only lifts raw to the band floor.)

Deliberate, NOT patched: warranty_caller's bare `rush` — rush patterns never
declare (app.js: no rush telegraph bucket by design), so params would be inert;
its telegraph is the RING, documented in encounter text. The audit exempts rush
from the pattern-params rule for this reason.

Judgment call recorded: heckler/paparazzo/union_rep telegraphs are terse
(51–55ch) but voice-distinct, not generic — flagged WARN, not lengthened. The
Deer bar is distinctness, not word count.

## Patches

10 unified diffs against HEAD, data-only, in
`~/workspace/goals/the-scattering-roguelite-survival-game/hidden_files/wave2-escalation-patches-20261007/<monster>.diff`
(NOT applied — monsters.json is sibling-active; land when the tree cools).
Byte-spliced: each diff touches only its monster's block, file otherwise
byte-identical, escaped-emoji style preserved. All pass `git apply --check`.

Per patch: +knownTactics (grounded in each monster's weaknesses/knownCue);
+resolveAudio wiring to existing synths; bare directs gain `windup: 2`
(visible 2-turn telegraph; `turnsLeft: pat.windup || 1` is engine-consumed);
paparazzo gains `burst {radius 2, windup 2, burstStyle exposure + burstDesc}`
(radius/windup engine-consumed; unknown `exposure` style falls through to the
generic burst bucket per app.js — no crash, a sibling can add the voice later);
heckler/statickite damage lifted to band floor ([12,18]).

## Verification

- Audit on HEAD: 3/13 PASS.
- All 10 diffs applied to a scratch copy (`patch`, valid JSON, no cross-monster
  changes): **13/13 PASS**. Re-run:
  `node scripts/audit-wave2-escalation-20261007.js --file <monsters.json> --appjs <app.js>`

## Drift notes for the coordinator (not patched — out of scope)

- docs/MONSTER-WAVES.md is stale vs HEAD data: table lists 11 with old names
  (Influencer/Motivational Speaker/Customer Service/Terms & Conditions/Middle
  Manager); HEAD has The Paparazzo/The Heckler/Extended Warranty/The Understudy/
  The Landlord + The Union Rep + The Moderator (13 total). Task brief's "10
  monsters" is also stale.
- scripts/test-wave2.js references retired ids (camera_swarm, hype_horn,
  service_mimic, contract_golem, delegate_beast) and asserts pool counts that
  no longer match the 13-monster roster.
- app.js W2A_IDS still lists `camera_swarm`; delegate_beast routing references
  a retired id.
