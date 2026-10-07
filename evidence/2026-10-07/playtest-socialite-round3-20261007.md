# Playtest Report — Socialite Archetype, Round 3
**Date:** 2026-10-07 (played ~14:45–15:45 CDT) | **Build:** 09155ea (dispatch base; re-verified at 1c96eaa after the revert repair — see §8)
**Tester:** Muse (worker), played AS the player — seeded mulberry32, not scripted execution
**Verdict up front:** the homecoming knowledge-broker loop is **GOOD, borderline great** — the single best socialite beat in the build. Walking back into Haven after days away, the fire gathering for what you learned out there ("Show us. Slowly."), the teaching moment over the haul, the village learning human-to-human by the fire — this is Steve's "key teaching moment" working as designed. One deterministic bug (broker's return goes silent on "old news" — failing test committed), plus two minor design notes. Playable? Yes. Enjoyable? The return-home beat is the most emotionally rewarding loop I've played in this game.

**Scope note (why this is round 3):** rounds 2 (ability acquisition/trials/synergies/codex study) and 4 (party building + spread_rumor) were audited today. The moot/exile/ambush/liars scenarios were play-audited today (social-scenarios-playtest-notes), contests were play-audited today. Never played: the **return-home loop** — the staging, the teaching moment, the broker's return, fireside teaching, wrong teaching. That's the socialite's daily knowledge-broker loop, and it's round 3.

---

## 1. What I played and how

**Harness** (AGENTS.md lessons): pristine engine via `git archive HEAD` into a fresh temp dir (engine read-only — never the dirty worktree); full `index.html` script order eval'd minus DOM-only `app.js`/`sprites.js`/`tile-scenes.js`/`move-anim.js`; `global.window = global` for eval then deleted before playing (sync combat path); minimal `document` stub for drama.js load; seeded mulberry32 (default 20261007, also ran 777, 31337). `Game.say` captured into a log. Proof script: `scripts/play-feel-socialite-round3-20261007.js` — **27/27 green at seeds 20261007, 777, 31337**.

**Played as:** Finn Pascual, lawyer (mediator + open_book — the socialite kit).

- **Act 1 — Setup:** new game, depart.
- **Act 2 — Honest expedition:** traveled 3 tiles out (genuine `playerAtHaven() == false`; note: `playerAtHaven()` is proximity ≤1, so adjacent tiles still count as "home" — the expedition must go 2+ out), foraged honestly via `_cellInteract` taps, identified **cattail** while away (queued `awayLearned`, no home rumor, no witness line — the presence gate holds), ate honestly, `endDay` × 2, stayed alive.
- **Act 3 — The return:** walked home node-to-node; arrival on the haven tile fired `returnToVillage` honestly.
- **Act 4 — 12 home days:** seeded one fireside entry (a villager's forage discovery), ran `endDay`s, watched the ambient teaching.
- **Act 5 — The teaching moment:** 4 honest conversations first (trust 18 — below the 30 gate), then labeled setup (trust→40, partner knows something I don't), foraged a real haul, walked home.
- **Act 6 — Wrong teaching:** forced an honest-mistake `wrongAbout` entry, ran `teachPlant`.
- **Act 7 — Knowledge-gating sweep** over all teaching lines.

## 2. The return (Act 3) — the money beat

Walking back in after 2 days away, the game said:

> *You come home after 2 days. The smell of the cookfire does something to your chest you don't examine. "You're thinner," someone says. "You're still here," you say.*
> *That night at the fire, they ask where you've been. You tell them — and what you learned out there: Cattail. Someone leans closer to the light. "Show us. Slowly." The knowledge is home now. It'll get around.*
> *1 unprocessed haul onto the counter — the clock is ticking.*

This is the socialite fantasy delivered: the drifter's bridge (knowledge comes home WITH you, never teleports — verified: no rumor seeded while away, no witness line, `awayLearned` queued; rumor seeded only on return), the pantry staging ("You keep a day's food…"), the prep-stash counter line with its spoilage clock. Every press of the loop says something. **This beat is done and it's lovely.**

## 3. Fireside teaching (Act 4) — the village learns without you

Over 12 home days, one seeded discovery produced exactly one teaching (35%/part gate, entry consumed after):

> *You were listening. Now you know Dandelion too.*

`taughtAround` marked, **11/11 villagers** learned it human-to-human, and I learned it by listening (60% presence-gated chance — I got lucky this seed; missing it is honest too). The village gets smarter slowly on its own — the "slow background growth that saves the village" comment is real. No leaks: the teacher was named by descriptor ("A person, maybe 40s, with a crooked nose") since I hadn't learned their name — knowledge gating holds even in ambient sim lines.

## 4. The teaching moment (Act 5) — "Around the fire, you show your haul"

> *Around the fire, you show your haul.*
> *Malik tries to explain. "It looks... a bit like that?" You're not sure. (5 encounters)*

The moment fired (50% gate — hit this seed). The teacher was a non-expert (infantry), so: **partial teaching by design** — encounters 1→2 toward the familiarity threshold, not an instant unlock. Per Steve's rule ("good teaching unlocks instantly; poor teaching gives only a partial reveal") this is correct, and the encounters track is mechanically real (feeds `bumpPlantFamiliarity` → sortBag identification). Trust interplay is honest: 4 real conversations earned trust 18; the moment needs >30 — reachable (~6–8 conversations) but you have to invest, which is thematically right (they teach you when they trust you). The moment also builds trust with diminishing returns (capped at 40 — "talk gets you to 40, beyond that you need actions").

**Design note:** the moment picks a random trust>30 candidate; it doesn't prefer good teachers (cook/chef/hunter/medic with full comms) who would give the instant-unlock beat. The partial path is honest and mechanically meaningful, but the moment's drama ("you show your haul") slightly over-promises when the teacher shrugs. Consider preferring expert teachers when available — engine owner's call.

## 5. Wrong teaching (Act 6) — the fire spreads wrongness, honestly

> *★ IDENTIFIED (maybe): Blackberry. Malik is sure — "Blackberry, see the leaves?" — and you have no reason to doubt them. Yet.*
> *📓 Codex: Malik taught me Blackberry (taught).*

The "(maybe)" framing, the `wrongAs` codex record, the journal note — the bad-knowledge beat is fully honest with the player while the character stays fooled. The contested path (when you know better) marks the disagreement and opens the call-out conversation. No silent actions anywhere in this loop.

## 6. Bugs found

**1. (minor, failing test) Broker's return goes silent on "old news."** If every away-learned plant is already known by someone at home, `returnToVillage` consumes `awayLearned` with zero acknowledgment — no fire beat, no rumor, no line. The player did the knowledge-bridging work (identified in the wild, hauled it home) and can't tell whether the return worked. Same effort as a true novelty (full fire beat), zero feedback, no explanation. The code comment says "old news at home — no fanfare" — the intent is fine, but silence isn't: one honest line ("You tell them about the dandelion — old news, they laugh; someone already showed them.") would close it.
Repro: `scripts/test-socialite-round3-20261007.js` — **FAILS deterministically** (seed 20261007: "3 return lines, zero mention Dandelion"; seed 777: same with Cattail). Engine-owner territory (game.js) — flagged, not fixed.

**2. (design note) Pooling explanation never fires on unprocessed-only first hauls.** "We pool food here" is gated on `give.length` (finished food pooled). A new forager bringing only raw plants gets the prep-stash counter line but never learns the food is pooled. Defensible (nothing was pooled) but the first-return intent ("someone explains the pooling") misses the most common early-game case.

**3. (trivial wart)** "You keep a day's food (310 kcal) and unload 0 kcal into Haven's pantry." — the unload-0 phrasing reads awkward when the whole day's food is kept. Honest, just clumsy.

## 7. Feel verdict — is the homecoming loop fun?

**Yes — it's the best loop in the socialite's kit.** The return-home beat has a real emotional shape: days-away homecoming line → the fire gathers for your knowledge → the haul gets staged with visible clocks → the teaching moment may fire. Each piece names its costs and consequences, nothing is silent, knowledge gates everything (names, rumors, teaching), and the village visibly gets smarter with or without you. Combined with rounds 2/4 (conversation, party, rumor), the socialite is now a complete, playable archetype: talk → trust → gossip/party/rumor → travel → learn → **bring it home** → the village grows. The last link was the one nobody had played, and it's the one that makes the rest matter.

**Delights worth keeping:** "Someone leans closer to the light. 'Show us. Slowly.'", "You're thinner," someone says. "You're still here," you say.", the prep-stash "clock is ticking", the (maybe) on wrong teaching.

## 8. CRITICAL infra alert: cda7946 stale-base revert (repaired during this run)

While this audit ran, HEAD moved 09155ea → cda7946 → eb87e38 → … → 1c96eaa. The **cda7946 "Version bump" commit swept the sibling's staged cleanup AND a stale worktree**: game.js lost **2,537 lines** (the entire drifter broker loop — `awayLearned` ×6 refs → 0, presence-gated identify, the broker fire beat), conversation.js −794, drama.js −905, contests.js −599, encounters.js −192, justice.js −144; abilityActions.js, monsterBehaviors.js, statusEffects.js dropped from the tree. ~99 "Steve 2026-10-07" systems reverted. eb87e38 ("Restore … deleted by version-bump sweep") restored only 2 files — the game.js reverts went unnoticed. **Repaired during this run** by 7b49fc5 ("Bulk restore: revert cda7946 stale-tree damage") + d4bf101 + efc1ec1; HEAD 1c96eaa verified healthy (broker block present, 41 src/js files, this audit's scripts re-run green). The audit above was played against 09155ea (dispatch base, pre-revert); the repro test extracts HEAD at runtime and now passes its harness checks at the repaired HEAD, failing only on the §6.1 bug as designed. Lesson for the loop: the "grep HEAD for your feature markers after every sibling commit" rule needs to run on version-bump commits too — the bump is the most dangerous commit on this tree.
