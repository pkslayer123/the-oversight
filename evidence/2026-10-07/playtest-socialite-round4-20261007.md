# Playtest Report — Socialite Archetype, Round 4
**Date:** 2026-10-07 (played ~09:00–09:45 CDT) | **Build:** b372ec6 (committed master)
**Tester:** Muse (worker), played AS the player — seed 20261007
**Focus:** party building end-to-end (the archetype's headline verb) + spread_rumor live feel
**Verdict up front:** the party *mechanics* are good and the fiction around them is good — trust floor with the System-squints line, backstabbers accepting "a little too quickly," dismissal stinging −8 trust with gossip fallout. But **the invite button is nearly unreachable through honest conversation**, and **the drama verb dies after one use per person**. The socialite's two signature moves are both cut at the menu layer. Two deterministic bugs, both in conversation.js (drama sibling's territory — flagged, not fixed), each with a failing test.

---

## 1. What I played and how

Clean worktree of committed b372ec6 (main tree has 407 dirty sibling files — untouched). Harness: index.html script order eval'd minus DOM-only, window/document stubs, seeded RNG.

- **Act 1 — Day 1, work the room:** 5 conversations as Malik Walker (infantry). No intro choice in the opening menu (dialogue layer fronts everything); names knowledge-gated (descriptors → names). Trust gains ~2–6 per blind conversation — reaching the trust-20 party floor takes several real conversations per villager.
- **Act 2 — Days 2–8:** endDay fast-forward (with eating). Day-7 System arrival → partyUnlocked, codexUnlocked, party discovered. All on schedule.
- **Act 3 — Recruit:** trust 11–23 after honest play → invite absent (correct: below floor). Then trust forced to 60 → **invite still absent after dlg:subject** (Bug 1).
- **Act 4/5 — Party direct:** inviteToParty/​dismissFromParty via API — all good (see §4).
- **Act 6 — spread_rumor live:** full flow works — prompt, target pick, type pick, seeded with first hearer, traveled to 10 hearers in 30 spread ticks. Feels like a real drama verb.
- **Act 7 — rumorDone:** second rumor with the same partner → dangling prompt, no targets (Bug 2).

## 2. Bug 1 (major): `invite_party` dropped by the subject-menu early return

The invite push (conversation.js ~2544) runs and succeeds — instrumented, all gates true, push executed. But the subject-menu branch (~2602) builds a **fresh `sub` array and returns it**, discarding the `choices` array that already holds `invite_party`. Since the dialogue layer fronts *every* conversation, the honest player path (open → "can I ask you something else?") is exactly the path that drops the invite. It only survives accidentally when a hanging question (gqActive/reactiveDef) skips the early return.

The opening menu does offer `dlg:invite` contextually — but only on warm beats (news/small/feeling/share tags). Miss the opening beat, browse topics first, and the invite is gone for the whole conversation. The design comment at the push site says the invite "must never be crowded out by small talk" — the early return violates it.

Repro test: `scripts/test-socialite-invite-subject-menu-20261007.js` — FAILS (invite absent after dlg:subject at trust 60, party unlocked+discovered).

## 3. Bug 2 (major): `rumorDone` never reset — one rumor per villager per game

`c.rumorDone = true` on rumor completion (~3322); never cleared in startConvo or endConvo. Second conversation with the same partner: `ask:spread_rumor` shows the prompt "Oh? Who are we talking about?" (topic handler doesn't check rumorDone) but the `!c.rumorDone` gate (~2477) suppresses all `rumor:tgt:` choices — menu falls back to goon/gq-answers/joke/ask/leave. The drama verb dangles mid-sentence with no way forward. For the socialite's signature move, one use per person per game is clearly wrong.

Repro test: `scripts/test-socialite-rumor-once-per-villager-20261007.js` — FAILS deterministically (rumorDone=true persists, no targets on second attempt).

## 4. Party mechanics feel (direct API — the part that works)

- Trust floor: "The System squints. 'You don't really KNOW Carmen yet…'" — characterful, clear, correct.
- Decline at trust 40: "Not right now. I've got my own things to handle." Fine.
- Joins: "Someone should watch your back. Might as well be me." / backstabber "a little too quickly" — good.
- Dismissal: −8 trust, flat "Alright." for a close friend (weaker than the prickly/warm variants), 35% gossip seeding.
- travelingWith includes party members; cap 3 → 4 at day 14 → 5 at day 30.
- Verdict: the system is fun-shaped and nearly done. It just needs its button.

## 5. Feel notes (non-bug)

- **Trust grind:** blind first conversations gain ~2 trust each; the trust-20 floor needs ~5 conversations per villager if you pick asks blindly. Better asks (Megan hit 30) pay more — the skilled play is learning people, which is on-theme, but the first hour feels like button-mashing until the dialogue layer teaches you who's who.
- **Rumor travel is delightful:** hearing your own rumor come back via someone else's gossip ask is the single best socialite beat in the build.
- **No intro verb:** the opening menu never offers an introduction; names arrive via asks. Round 2 reported intro-gated names; the current flow still works but the "introduce yourself" moment is implicit.

## 6. Delights worth keeping

The System-squints trust floor, backstabber-eager join lines, rumor traveling the village and coming back through gossip, the day-7 arrival beats. The writing is still carrying.

---

**For the drama sibling:** two failing tests, both conversation.js, both deterministic, both menu-layer (not engine):
1. `scripts/test-socialite-invite-subject-menu-20261007.js` — subject menu drops invite_party.
2. `scripts/test-socialite-rumor-once-per-villager-20261007.js` — rumorDone never reset.
Suggested shape (their call): include the invite in the `sub` array / move the invite block after the subject-menu branch; reset `rumorDone` (and check `rumorTarget(s)`) in startConvo.
