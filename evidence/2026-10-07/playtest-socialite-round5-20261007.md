# Playtest Report — Socialite Archetype, Round 5
**Date:** 2026-10-07 (played ~15:45–16:15 CDT) | **Tester:** Muse (worker), played AS the player — seed 2026100715
**Focus:** verify the two round-4 blockers end-to-end after fixing them (invite_party dropped by subject menu; rumorDone never reset) + honest day-1 conversation feel
**Verdict up front:** both fixes verified green through the honest player path — the invite now survives the subject menu and the second rumor works. Also fixed a third socialite bug found along the way: the broker's homecoming silently consumed old-news awayLearned. Play script 10/10 green; the two remaining failing tests are pre-existing (stale harness / known flag), confirmed against HEAD.

## 1. Fixes (this run)

**Fix 1 — invite_party survives the subject menu (conversation.js ~2614).** The subject-menu early return discarded `choices` where the invite already sat. Now the invite is carried into the `sub` array before `leave`. Repro test `scripts/test-socialite-invite-subject-menu-20261007.js`: FAIL → ALL GREEN.

**Fix 2 — rumorDone resets per conversation (conversation.js startConvo).** Added `c.rumorDone = false; c.rumorTarget = null; c.rumorTargets = null;` alongside the other per-conversation resets. One rumor per person per conversation is the design (matches teachSkill/offeredHelp/askedTopics). Repro test `scripts/test-socialite-rumor-once-per-villager-20261007.js`: FAIL → ALL GREEN.

**Fix 3 — broker's return acknowledges old-news knowledge (game.js ~4874).** Found via `test-socialite-round3-20261007.js` (round-3 flag, still failing at HEAD): `returnToVillage` consumed `scholar.awayLearned` silently when a villager already knew the plant — violating the no-silent-actions rule. Now old-news plants get a fire beat naming them: `"Old news, friend. X showed us that one." Still: you carried it home. That's the job.` (Note: that test extracts the engine from HEAD at runtime, so it goes green only after this commit lands.)

## 2. What I played (scripts/play-feel-socialite-round5-20261007.js, 10/10)

- **Act 1 — honest day-1:** opening menus vary per person; subject-change offered after asks; trust 10→13 per full honest conversation; invite correctly absent below the trust-20 floor.
- **Act 2 — honest recruit:** browsed topics → dlg:subject → **invite_party present** (the previously-dead path) → declined at trust 25 with the designed contextual line ("Ask me again when we've survived something together") → joined on retry at trust 70, `travelingWith` includes the member. Decline and join paths both reach the engine.
- **Act 3 — two rumors, same partner, two conversations:** target selection offered both times; both seeded. The drama verb is back.
- **Act 4 — gossip:** answered a hanging generic question first (designed narrowing), then ask:gossip surfaced. Gossip echo beat still delightful when it lands.

## 3. Feel notes (non-bug)

- **Trust grind unchanged:** ~6 honest conversations reached trust 16; the floor-20 invite needs ~5–6 conversations per villager. On-theme (learning people pays), slow first hour. Same as round 4 — not new.
- **Deflector doors confirmed working:** a prickly villager never offered gossip in conversation 1 (topic cap 2, fresh `lately` + `personal` fill it) — the depth-gate design, gossip surfaces later. Right call to leave alone.
- **betrayal:accept/decline + confront:* in the subject menu:** the betrayal.js `convoChoices` wrap prepends these outside the base function, so pending invites/cases survive subject changes — correct, working as designed.
- **The decline line is good writing:** "I don't know you well enough for that. Ask me again when we've survived something together."

## 4. Regressions

- `test-gossip-rumors`, `test-gossip-drama`, `test-gossip-norepeat`, `test-brawler-drove-off-gossip-20261007`: green.
- `test-socialite-fixes.js` (1 fail) and `test-socialite-round3-20261007.js` (1 fail): confirmed pre-existing — the first fails identically on HEAD's conversation.js (stale 2026-10-04 harness vs the 2026-10-06 thread-coherence gate); the second is the broker bug fixed above (test reads HEAD, goes green post-commit).
