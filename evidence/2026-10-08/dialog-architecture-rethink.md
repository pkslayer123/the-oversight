# Dialogue Architecture Rethink — The Oversight

Steve 2026-10-08: "Conversations are largely nonsense right now. People getting mad I didn't answer a question when I had no good answer option."

This is the proposal. The map (`dialog-architecture-map.md`) is the diagnosis; this is the prescription. Nothing here is implemented yet — Steve reviews first.

Note: parent agent is running a separate deep-research pass on dialogue design; its findings will be incorporated when they land. This doc is structured to absorb them (see §8).

## 1. Diagnosis in one page

Conversations feel like nonsense for three structural reasons, not one:

**a) Nobody is driving.** A conversation has five would-be drivers — the beat (what was just said), the want (what the NPC needs), the mood (how it feels), the topic (what we're discussing), the memory (what happened before) — and they don't talk to each other. Wants never touch mood. Mood never touches topics. The result reads as five people sharing one mouth.

**b) The menu lies.** Options don't always say what the player means (Veilguard's exact failure). Bespoke answers presume player facts (mechanical skill, stolen food, "yesterday"). The only honest move — deflecting — is framed as rude and punished. The NPC then performs disappointment at the player's "choice," when the system never offered a real one. That's what Steve felt: *the game blamed him for its own missing option.*

**c) Three architectures, one screen.** The topic grab-bag (conversation.js), the beat-responses (convo-dialogue.js, mostly dead), and the beat+topic matrix (convo-beats.js) are layered by load order. Questions have four separate machineries (pendingQ/reactiveQ/genericQ/player-asks). Consequences attach in six different places. No single place answers "what happens when the player picks X."

The honest-opt-out patch (paused, commit a92b30d) fixes (b) at the surface. It doesn't fix (a) or (c). This rethink does.

## 2. Principles (laws of the new architecture)

Steve's corrections, 2026-10-08 (folded in — these overrule the earlier draft):

1. **One driver per conversation: the Scene.** Every conversation is a scene with a dramatic question (the want), a temperature (mood), a relationship (trust+memory), and a beat (what was just said). All four feed ONE menu pipeline. No parallel philosophies.
2. **The Ask/Answer Contract.** Every NPC question ships with: 2+ real answers, 1 free honest opt-out, and an inferable reason for asking. If the system can't offer a real choice, it doesn't ask. (Extended: the answer set must include the mean moves where they fit — see 5.)
3. **Honesty is always available; honest words have weight.** The player is NEVER locked out of honesty — but honesty is not consequence-free, and that's the point. "I don't trust you" said honestly lands like it should: they hear it, and the relationship moves. The system never punishes you *for being honest* (no hidden penalty for picking the true option), but people react to what you actually said. "I'd rather not say" is a boundary, not an attack — low consequence, gracefully received. Lying stays available too — cheap now, expensive if caught. The earlier draft ("honesty is never punished") was too simple: consequences aren't punishments, they're the fiction working.
4. **Your character shapes your voice; your choices reshape it.** Each life's background sets the starting answer palette — a gentle farmer doesn't open with threats, a hard scavenger doesn't open with poetry. As you act kind or cruel in conversation, your disposition shifts and the palette follows. Kind players see kind framings naturally; cruel options don't vanish but read as out-of-character and cost more socially when used. Cruel players unlock meaner moves that fit who they've become. You become who you act like — the menu is the mirror. (Disco Elysium's thought-cabinet lineage: behavior shapes the moves, not just stats.)
5. **Mean must fit the room.** Cruel options appear where cruelty is plausible: toward enemies, rivals, low-trust strangers. Toward a friend who trusts you, cruelty isn't a menu option — it's a betrayal: bigger trust damage, longer memory, and the fiction names it. The menu never offers cartoon villainy; hostility toward an enemy is just honesty with teeth.
6. **Every choice moves something legible.** Trust, mood, knowledge, or memory — at least one, visible in the fiction. No dead choices. (Narrative-design rule: "I'll help you later" is not a meaningful choice.)
7. **Failure is content.** A refused favor, a deflected want, a blown probe — all produce story, never dead ends. (Disco Elysium: failing a check gives you the scene where you fail, and it's good.)
8. **Characters remember; the ledger is continuity.** What we talk about is driven by what happened (memory + world state), not by a topic menu. Re-asking after the world moved gets an acknowledgment, never a repeat. (The `t2clock` "it's different now" pattern becomes universal.)
9. **Questions come from character.** An NPC asks what THEY would ask — from their want, their fear, their relationship with you — not from a global pool of 36. The question IS the want surfacing.
10. **Silence is always an option.** "..." on every menu. NPCs notice per mood (the `convoMoodSilence` machinery already exists). Cheapest content, highest realism. (Oxenfree.) Kept cheap: one generic react per mood, not bespoke branches — unchosen options are dialogue's most expensive content.
11. **Knowledge gates everything, including conversation.** "If you don't know, it doesn't show" applies to dialogue: you can't ask about what you haven't heard, confront with what you can't prove, or teach what you don't know. (Outer Wilds: knowledge is the only progression.)
12. **Strangers get small talk.** Fresh conversations offer small talk + shared past history (things seen/heard in the world) only. Fears, hopes, secrets, confrontations, deep wants — trust-gated, earned slowly. The slowness is the design; the loops test the pacing (see §4).
13. **One screen, no scroll, max ~6 options.** Mobile law is non-negotiable. Depth comes from the scene changing, not from longer menus.

## 3. The architecture: one pipeline

### 3.1 The Scene (unifies want + mood + relationship + beat)

Replace the five non-communicating systems with one scene state, computed at conversation open and updated per turn:

```
scene = {
  want:   { id, stage }      // what they need from this conversation (existing 6 wants, fixed)
  mood:   -3..+3             // temperature (existing convo-mood, kept)
  bond:   { trust, tier,     // relationship: trust + voice tier (new/close) + lived memory score
            memory: [...] }
  beat:   { tag, topic }     // what was just said (existing beat tags, kept)
}
```

The want system keeps doing selection (it's good). The mood system keeps doing temperature (it's good). What's NEW is that they read and write each other:
- Refusing a favor (`dlg:cant`) → mood −1 AND writes a `deflected` memory entry (the `HURT_KINDS: 'deflected'` slot that was never wired gets wired).
- Engaging a want when mood is tense → the guard absorbs it (existing) AND the fiction names it.
- A seed-driven conversation (unfinished business) initializes mood one band cooler — you don't open warm when you owe someone an apology.
- Want resolution stops lying: deflect resolves as `deflected`, never `engaged` (fixes the mapped bug). Dead `repay`/`closeness` seeds get real wantIds or get cut.

### 3.2 One menu builder (kills the layer stack)

Delete the override chain. One function builds every menu:

```
buildMenu(vid):
  1. if direct question hangs (pendingQ/reactiveQ/genericQ) → answers first
     (existing machinery, kept — plus the honest opt-out, kept from the paused patch)
  2. else → options from the scene, in priority order:
     a. WANT options: engage / deflect (both always present while want is live;
        deflect is graceful, consequences named: "They'll remember you said no.")
     b. BEAT responses: 2 from the beat+topic matrix (kept from convo-beats.js)
     c. RELATIONSHIP options: gated by trust tier + relationship age (NOT convo count —
        the count≥2/3/4 bypasses die; intimacy is earned or it isn't)
     d. "..." (silence — always; one generic react per mood)
  3. subject change ("Can I ask you something else?") + leave — always last
```

Then the disposition filter runs over the whole menu (Principle 4): every candidate
option carries a `temper` tag (kind / neutral / cruel / honest-hard). The player's
current disposition (background baseline + moral trajectory from played choices)
reorders and gates:
- Options matching disposition surface naturally.
- Cruel options for a kind player (or kind options for a cruel one) don't vanish —
  they read as out-of-character: present but marked, and cost more socially when used.
  Becoming someone new must be possible; it just isn't free.
- Cruel options additionally require room-fit (Principle 5): vs enemies/rivals/low-trust
  they surface normally; vs high-trust friends they're suppressed unless the player
  has already chosen cruelty in the scene (escalation, not ambush).

Cap: 6 content options + subject + leave. The old topic grab-bag survives ONLY behind the explicit subject change (existing rule, kept).

What dies: the game.js:2192 stale `convoChoices`, the convo-dialogue.js dead `dialogueResponses` (turn handlers stay), the load-order override chain. One builder, one place to read.

### 3.3 The Ask/Answer Contract (fixes Steve's complaint structurally)

Every NPC question — bespoke, reactive, or generic — must satisfy the contract before it can be asked:

- **2+ real answers** that actually answer the question (coherence audit from the paused patch becomes a permanent data gate: a validate script refuses questions with <2 answers, empty labels, or non-answering answers).
- **1 free honest opt-out**, engine-guaranteed (the paused patch mechanism). Data authors can write bespoke ones; the engine never double-adds.
- **A reason to ask**, visible or inferable. The question should arrive attached to a want or a memory: the scared villager asks "are you scared?", the curious one asks about you after trust 40. Global-pool draws ("ask me something real" pulling q_regret from nowhere) get a bridging line that motivates the ask, or the pool gets retired in favor of want-driven questions.
- **Consequence legibility.** Labels carry their social weight: honest options read honest, kind options read kind, rude options read rude. No more "Deflect —" hiding behind em-dashes; the rude option says what it is.

### 3.4 Consequence model (one place)

All choice consequences flow through a single resolver:

```
resolveChoice(vid, choice):
  → trust delta (with the talk-cap-40 rule, kept)
  → mood delta (via convoMoodShift, kept)
  → knowledge effects (teach/learn/codex, kept)
  → memory write (remember(), kept — now including want outcomes)
  → fiction line (the NPC's reaction, which NAMES what moved:
    not "+2 trust" but "Something eases in their shoulders.")
```

The fiction always names the movement. Numbers never leak. (Existing practice in the best reacts — make it law.)

### 3.5 Memory-driven "what can we talk about"

The topic menu inverts: instead of "pick a subject," the game surfaces **what's alive** — open threads (kept), fresh memories (kept), want-driven questions (new), and world events (the `lately` system, kept and expanded). The subject-change menu becomes "things between us" rather than "things to ask about." The `t2clock` pattern (re-asking after change gets acknowledgment) applies to every repeated question, not just topic2.

## 4. How it serves the social-survival core

- **Trust:** becomes truly slow and legible. Earned through want engagement, honesty, and remembered kindness — never farmed (reactDryCount rule kept and extended to all repeatable +trust verbs). The count-bypasses die, so trust MEANS something again. Strangers get small talk + shared history only (Principle 12); deep topics are trust-tier gated. **The slowness needs testing:** the playtest loop gets a standing directive to pace-test stranger→acquaintance→confidant arcs and report where the gates feel wrong — too fast (cheap intimacy) or too slow (grinding).
- **Gossip:** the rumor thread and gossip asks keep their machinery, but gossip now flows through the scene: a villager with the `share_news` want GOSSIPS AT you; you can only spread what you've actually heard (knowledge gating). Distortion through retelling (existing) stays.
- **Knowledge:** conversation is a knowledge instrument. Teach/learn, naming debates, monster descriptors, the codex — all keep working, but now gated by the scene: you can't teach someone who's tense, can't confront without evidence (existing), can't ask about the System before it arrives (existing).

## 5. Coherence across 12 unique villagers

The existing identity plumbing is the answer and it stays: `voiceLine` (temperament+age+mods), `playerVoice` (the player's per-life identity), `t2fill` (backstory/fear/hope/quirk slots), prototypes (want/know/feel/secret), `convoPickCycle` (no-repeat pools). The rethink adds one rule: **no content is drawn from a global pool without passing through (identity × relationship × memory × world-state) first.** The 36 bespoke questions get want/memory attach conditions; until attached, they don't get asked.

## 6. Buildability

**Phase 1 — structural (this week):** one menu builder (delete dead layers); land the paused opt-out patch; fix deflect→engaged + dead seeds; wire want↔mood (refusals cool + write memory); kill count-bypasses; add "..." to every menu via convoMoodSilence. All in worktree isolation, proof-tested, as usual.

**Phase 2 — the Scene:** scene-state unification; consequence resolver; consequence legibility pass on labels; Ask/Answer contract as a validate gate; memory-driven "what's alive" menu.

**Phase 3 — character-driven questions:** want/memory attach conditions on the 36 questions; retire global-pool draws; "it's different now" universal.

Each phase is independently playable and shippable. Nothing here requires new art, new audio, or scrolling. The mobile one-screen law holds throughout.

## 7. What this deliberately does NOT do

- No LLM dialogue at runtime. Hand-authored + procedural, as now. (The research is clear-eyed: generative dialogue is great at surprise, terrible at canon control and progression structure. The Oversight's strength is its authored-procedural hybrid.)
- No dialogue timers (Oxenfree's interruption pressure doesn't fit a calm mobile game; the design keeps tap-advance).
- No voice acting assumptions. Text-first, as now.

## 8. Open questions for Steve (answered with research, 2026-10-08)

1. **Should the player ever be locked out of honesty?** Research answer: yes, but ONLY when the scene says so explicitly. The "But Thou Must" anti-pattern (Rennick & Roberts 2025) shows unmotivated coercion alienates players from their own character; the fix is motivating it in-fiction ("they're waiting for an answer") or escalating (ritual-refusal sequences), never repeating verbatim. Proposal stands: lockouts allowed, always legible, never silent.
2. **How mean can the player be?** Research answer: keep cruelty contextual, and label pragmatic intent + tone on every option (the paper's core prescription; DA2's wheel icons are the shipped example). ME telemetry: only ~8% picked renegade — a limited-but-right set satisfies more than a large-but-wrong one. Don't build a cruelty menu section; build honest tone labels.
3. **Trust bypasses:** killing the count≥2/3/4 escape hatches makes deep topics purely trust-gated. Research answer: slowness is fine IF the arc is legible. Citizen Sleeper's clocks make social investment visible without approval meters; Firewatch hides numbers entirely and lets regret do the work. So: kill the bypasses, but make relationship arcs legible (what's alive, what's owed, what's changed) — never show the numbers.

## 9. What the deep research changed (folded 2026-10-08)

Full report: 16 games/theory sources, research_notes/dialogue-realism-games-20261008-1002. Headline findings and what they do to this proposal:

**Confirms the proposal's direction:**
- **Hybrid wins.** Shipped practice converges on authored beats/pools selected by systemic managers (Valve response rules, Firewatch event log, Emily Short storylets) — exactly the Scene pipeline (§3). Pure trees and pure AI both lose.
- **Fail forward** (Disco Elysium): refused favors and blown probes must produce story, never dead ends. Already Principle 5 — now with precedent.
- **Hide the numbers** (Firewatch): stakes are warmth, teasing, devastating silence — regret beats stat loss. The consequence resolver (§3.4) naming movement in fiction is the right call; numbers never leak.
- **Event-logged coherence** (Firewatch, Valve memory bits): coherence from accumulated facts + specific situational lines, not tree position. The `t2clock` "it's different now" pattern going universal (§3.5) is the right move.

**Sharpens the proposal:**
- **Paraphrase mismatch is the #1 shipped failure** (Mass Effect wheel → Fallout 4; a 2M-download full-text mod is the community's verdict). Labels must convey pragmatic intent + tone above all — "the exact content being mostly irrelevant." This hardens the Ask/Answer Contract (§3.3): consequence legibility isn't polish, it's the load-bearing wall.
- **Adjacency pairs** (Rennick & Roberts 2025, corpus of 355 choices): end NPC turns with questions and players expect FEW options — economize there; invest option budget after NPC statements, where responses are unpredictable. 66% of real choices vary at the pragmatic level (accept/decline, politeness, truth/lie). Direct implication for our menus: cover the pragmatic moves honestly first; wording variety is secondary. This is why the honest opt-out matters more than more bespoke answers.
- **Filter pools, don't branch** (Emily Short on Mask of the Rose): draw each turn's options from a large pool filtered to what's suitable — the set is always in-character because unsuitable lines never surface. This is the mechanism for §5's rule: no global-pool content without passing through (identity × relationship × memory × world-state).
- **Silence: keep it cheap.** Oxenfree/Firewatch prove silence is a real choice NPCs should notice — but AdHoc's Dispatch cut it because <1% used it while each silent branch multiplied costs. Our "..." stays (convoMoodSilence machinery exists), but silent branches get ONE generic react per mood, not bespoke content. Unchosen options are dialogue's most expensive content.
- **"X will remember that" theater** (Telltale): promised memory rarely honored. Our remember() ledger must actually pay off in later lines — or stop promising. Every memory write needs a read site.
- **NPC Amnesia** is the named anti-pattern for dialogue not keyed to world-state — exactly what memory-driven topics (§3.5) kill.

**New idea worth stealing:**
- **Citizen Sleeper's distributed expression:** when "which dice I spend on you" IS the character statement, dialogue options only need emotional honesty, not verbatim fidelity. For us: the player's actions (who they seek out, what they do, what they bring) already carry expression — the dialogue menu doesn't have to bear the full load. Menus can be smaller and more honest when the game reads behavior elsewhere. (Supports the 6-option cap: depth from the scene changing, not longer menus.)
- **Disco Elysium's gate-by-truth:** skill thresholds hide options the character wouldn't plausibly take — the menu can't lie about who you are. Our identity plumbing (voiceLine, playerVoice, t2fill) is the seed; the Scene pipeline should filter options through it, not just voice them.

**Explicitly rejected for us:**
- Real-time/expiling dialogue (Oxenfree bubbles, Alpha Protocol 2–3s timers): timing pressure doesn't fit a calm mobile game; tap-advance stays. (Noted in §7; research confirms the tradeoff is real — illegible interruption is Oxenfree's own cited flaw.)
- LLM NPCs at runtime: the research deprioritized them as unshipped/experimental with known coherence problems (Façade's NLU lessons). Hand-authored + procedural stays (§7).
- Negotiation-as-combat abstraction (Griftlands): the Eurogamer caveat applies — when abstraction drifts from recognizable social action, the spreadsheet shows through. Our stakes stay social and legible.
