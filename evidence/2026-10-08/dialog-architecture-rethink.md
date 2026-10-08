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

1. **One driver per conversation: the Scene.** Every conversation is a scene with a dramatic question (the want), a temperature (mood), a relationship (trust+memory), and a beat (what was just said). All four feed ONE menu pipeline. No parallel philosophies.
2. **The Ask/Answer Contract.** Every NPC question ships with: 2+ real answers, 1 free honest opt-out, and an inferable reason for asking. If the system can't offer a real choice, it doesn't ask.
3. **Honesty is never punished; rudeness is always legible.** Declining, not-knowing, and staying silent are free and graced. Being cruel, lying, or dodging when honesty was available is labeled as such and has proportionate social consequences. The player must be able to tell which kind of choice each option is FROM THE LABEL.
4. **Every choice moves something legible.** Trust, mood, knowledge, or memory — at least one, visible in the fiction. No dead choices. (Narrative-design rule: "I'll help you later" is not a meaningful choice.)
5. **Failure is content.** A refused favor, a deflected want, a blown probe — all produce story, never dead ends. (Disco Elysium: failing a check gives you the scene where you fail, and it's good.)
6. **Characters remember; the ledger is continuity.** What we talk about is driven by what happened (memory + world state), not by a topic menu. Re-asking after the world moved gets an acknowledgment, never a repeat. (The `t2clock` "it's different now" pattern becomes universal.)
7. **Questions come from character.** An NPC asks what THEY would ask — from their want, their fear, their relationship with you — not from a global pool of 36. The question IS the want surfacing.
8. **Silence is always an option.** "..." on every menu. NPCs notice per mood (the `convoMoodSilence` machinery already exists). Cheapest content, highest realism. (Oxenfree.)
9. **Knowledge gates everything, including conversation.** "If you don't know, it doesn't show" applies to dialogue: you can't ask about what you haven't heard, confront with what you can't prove, or teach what you don't know. (Outer Wilds: knowledge is the only progression.)
10. **One screen, no scroll, max ~6 options.** Mobile law is non-negotiable. Depth comes from the scene changing, not from longer menus.

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
     d. "..." (silence — always)
  3. subject change ("Can I ask you something else?") + leave — always last
```

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

- **Trust:** becomes truly slow and legible. Earned through want engagement, honesty, and remembered kindness — never farmed (reactDryCount rule kept and extended to all repeatable +trust verbs). The count-bypasses die, so trust MEANS something again.
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

## 8. Open questions for Steve (and the pending deep-research)

1. **Should the player ever be locked out of honesty?** E.g., mid-interrogation, mid-moot — are there scenes where "I'd rather not say" shouldn't be free? (Proposal: yes, but the scene must SAY SO — "they're waiting for an answer" — never silently.)
2. **How mean can the player be?** The cruelty verbs exist (bribery, threats, confrontation). Should cruelty have a dedicated menu section or stay contextual?
3. **Trust bypasses:** killing the count≥2/3/4 escape hatches makes deep topics purely trust-gated. Some villagers may take many conversations to open. Is that the right slowness?
4. Pending: deep-research findings on dialogue design — incorporate on arrival, especially anything on question-driven (vs topic-driven) conversation models and on failure-as-content economies.
