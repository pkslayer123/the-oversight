# Detective Archetype Playtest — 2026-10-07

**Role:** played as a PLAYER (seed 7, 11 villagers, full production script list in node harness).
**Report only. Nothing committed.**

## Feel verdict

The detective loop's **ending is excellent and its middle is solid, but its beginning is structurally starved.** Catching a liar through observation → doubt → soft probe → confrontation is genuinely dramatic and fair — the best social beat I've played in this game. But *getting* a doubt through the intended interview path (ask about their past → hear their story → ask around → cross-reference gossip) means fighting the conversation menu, not the mystery. As a player: **the deduction is fun when it fires, confusing to set up.** The UI never tells you which questions are detective tools, and the two most important ones (`ask:past`, `ask:gossip`) are effectively hidden behind the topic cap.

## The four questions

### 1. Hear a lie — can you tell? Is it fun to catch?

**Yes, and yes — with a caveat about *who* does the telling.** The lie delivery is natural: the cover story substitutes into interview lines ("Being a surgeon feels like a past life. Sometimes I wonder if I dreamed it.") and the observation tell was the single best "catching" moment of the session: *"Someone asked Divya about surgeon work. The answer was smooth — too smooth, like reciting. Then later, doing something a surgeon does without thinking, Divya fumbled it completely."* I chose to observe; I got a crack in the story. That's the detective fantasy working.

The caveat: **the game does the detecting, the player does the collecting.** When evidence exists, the game flags it loudly with ❓ beats and plain-spoken doubt entries — you never have to deduce. This is the right design call (knowledge-gated deduction would be opaque and frustrating), and the aha beats are genuinely thrilling. But it means the *player skill* is evidence-gathering, and the evidence-gathering verbs are the ones the menu hides (see friction #1).

Lies are rare (~1 in 11 villagers in my seed; design says ~1 in 5). The slip systems (18% mid-conversation slip, end-of-day verbal slips) never fired in 2 days of play — they're seasoning, not a reliable path. The reliable catch path is gossip cross-reference.

### 2. Cross-reference gossip — does it work? Satisfying?

**Works, and satisfying.** The pipeline (`ask:gossip` → 50% chance of NPC-gossip-about → 45–65% lie reveal, higher if you've already interviewed the target → `checkGossipClaim` → doubt) fired on my first real attempt and produced the session's best writing: *"A person, maybe 40s snorts. 'Hudson said that? Please. A line cook — I knew them from before. The story doesn't survive five minutes of scrutiny.'"* The doubt formed immediately: *"Hudson said 'surgeon' — but A person, maybe 40s says 'line cook'. One of them is wrong."*

Two design details deserve praise: the **detective bias** (gossip preferentially targets people you've actually interviewed — "the village answers the question you mean") and the **gossip-first lead** (if the village talks about someone before you've heard their story, you get an *actionable lead* doubt, not a contradiction: "You haven't heard their own story yet"). Both make the village feel like an information network, not a broadcast.

The one soft spot: ~50% of gossip asks return generic village talk. That's fine as texture, but combined with friction #1 it makes each successful cross-reference feel expensive.

### 3. Confront a liar — dramatic? Fair?

**The best beat of the loop. Dramatic *and* fair.**

Drama: the confront choice is kind-specific (*"You told me one thing, then another. What's going on?"* vs *"Someone told me something about you that doesn't match. Explain."*), and the confession I earned was perfect — *"Oh." A long pause. "I wasn't a surgeon. I was a locksmith. I was ashamed of the truth..."* — with temperament variants, motive speeches, smooth/clumsy deflections, and counter-attacks. Trust rose 29→35 on confession; the journal corrected itself; the village heard about it (reputation hit for the liar).

Fairness: the odds are motive-based and legible in hindsight (shame 65% → pathological 8%), evidence mechanically matters (+10% per extra evidence, +15% per prior deflection, +5% per soft probe, trust and temperament adjust), deflections keep the doubt *open* so you can press harder, and **false accusations clear cleanly with +3 trust** — accusing an honest villager is a misunderstanding, not a punishment. Consequences are social, never mechanical: exactly Steve's taste.

### 4. Doubt system — clear? Useful?

**Clear in the moment, useful mechanically, unexplained as a system.** Doubt text is plain-spoken with evidence listed (*saids "surgeon" (day 1); A person, maybe 40s says "line cook"*); the ❓ beats surface doubts dramatically in the moment; doubts live on the journal person page; and they're mechanically load-bearing — they unlock both the soft probe (`"That doesn't quite add up."`) and the confront choice, and accumulated evidence raises confess odds. The soft probe is a lovely middle gear: visible rattling, distinct lines, gentler than confrontation, and it makes the final confrontation easier.

What's missing: **nothing ever tells the player the system exists.** No codex primer, no journal hint that doubts resolve through confrontation, no explanation that soft probes mount evidence. A new player who forms their first doubt won't know what to do with it unless they happen to re-talk to that villager and notice the new menu choice.

## Delightful moments

- The observation tell quoted above — the single best-written "catch" in the session.
- The gossip takedown ("The story doesn't survive five minutes of scrutiny").
- The confession beat (quoted above), especially the motive line landing after the pause.
- The contradiction aha: *"❓ That's not what the person in their 30s, the tailor said last time. 'surgeon' then, 'doctor' now."* — the player FEELS it in the moment, per the design comment.
- The gossip-first lead: *"Village talk: the person in their 40s isn't really from Bogotá, Colombia, according to A woman, maybe 30s, with ink-stained fingers. You haven't heard the person in their 40s's own story yet."* — actionable, and correctly knowledge-gated (descriptors, not names).
- Knowledge gating held everywhere I checked: the journal records what they *told* you, `scrubLiesFromLine` prevents leaks, names are learned through conversation (verified: not known before first talk).
- The counter-attack: *"Wow." the person in their 20s looks hurt, then angry. "I share my food with you and this is what I get?"* — being wrong (or early) about a manipulator *stings*.

## Bugs / friction found

1. **MAJOR — `ask:past` is structurally starved in the subject menu.** The asks list is ordered `[personal, gossip, spread_rumor, goal, past, village, plans]` with a topic cap of 5 and fresh topics shown first. `ask:past` sits 5th, so it is unreachable — even at trust 60 — until the player exhausts all the small talk. I verified: trust 22 → absent; trust 27 → absent; trust 60 → absent. It only appears after `personal/gossip/spread_rumor/goal` are all marked asked. `ask:past` is *the* interview verb (it prefers occupation answers — "what did you do before?") and `ask:gossip` was similarly absent at trust 40. The detective's two primary evidence-gathering tools are hidden behind small talk. (Note: `ask:personal` is always available and *does* track claims, so the loop isn't fully broken — but `past` is the verb the design points at, and players will never find it.)
2. **Liar's mask undermines the confrontation moment.** During confrontation, the narrator's whoTag refers to the accused by their *claimed* occupation — *"the person in their 20s, the surgeon"* — while the player is accusing them of lying about being a surgeon. The mask is deliberate design (village knows the liar by their claim; flips after confession), but in the accusation moment the game appears to side against the player. Consider a neutral descriptor during confrontation.
3. **Only the first doubt gets a confront choice** (`doubts[0]`). A villager with two open doubts can only be confronted about one per conversation; the menu doesn't indicate another is waiting.
4. **Trust gates are unpredictable.** Gates sit at trust 20/35 but effective trust swings ±15 with mood, from a base of 10 — so questions appear and vanish between conversations with no explanation. As a player I couldn't tell *why* `ask:past` wasn't there; it read as random, not as "earn their trust."
5. *(Not a bug — my harness misread `getClaims(vid)` without a field arg; the game code always passes one. Noting so nobody chases it.)*

## Suggested fixes (short)

- Exempt `past`/`gossip` from the subject-menu topic cap, or reorder asks so the detective verbs come first. These are tools, not small talk.
- Neutral whoTag during confrontation; restore the mask after.
- Cycle confront choices through all open doubts, or label the choice with the doubt kind.
- A codex/journal primer: what a doubt is, that soft probes mount evidence, that confrontation resolves. One paragraph.
- Surface *why* a question is locked ("They don't trust you enough yet") instead of silently omitting it — the ±15 mood swing makes silent omission feel like a bug.

## Method

Seed 7, 11 villagers (1 natural liar); seeded an additional occupation lie (surgeon/locksmith, motive shame) for determinism. Played realistic rapport (chitchat → interview → observe → soft probe → confront), plus directed probes of gossip cross-reference, contradiction beats, deflect/counter-attack paths (forced RNG), and journal UI. Node harness, full production script list, window stub removed before play. Sibling workers active — repo state untouched, no commits.
