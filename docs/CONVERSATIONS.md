# Conversations

Real back-and-forth dialogue. Built because Steve said: "They just talk at me,
there's no conversation happening."

## The problem it solves

The old `talkTo` returned one NPC line per tap. The player clicked "Talk" and
got talked at — a vending machine, not a conversation.

## How it works

**Player response choices, always.** Every NPC line comes with 3–6 player
responses: follow-ups, topic questions, reactions (agree / joke / stay silent),
changing the subject, offering help, or leaving. Never just "continue".

**Conversation threads.** Topics develop over multiple exchanges:
- `goal` — what they want (uses existing goal lines + new depth-2 follow-ups per goal)
- `past` — their old life (occupation/origin templates + follow-ups)
- `village` — how everyone's holding up (generated from live needs/moods/heat)
- `plans` — what they'll do tomorrow
- `request` / `grief` / `cheer` / `recall` — single-beat contextual threads

"Tell me more." goes deeper until the thread is honestly exhausted — then they
say so ("I've told you everything I know about that") instead of looping.

**NPCs ask YOU questions.** Six questions (origin, plans, fears, missing,
trust, worldview), gated by trust and mood. The first conversation with someone
always includes one — strangers are curious. Your answers are remembered
(`conv.answered`) and referenced later ("You told me you're from...").

**Emotional arc.** Each conversation has an energy budget (2–6 exchanges, from
temperament + social need). When it's spent, the NPC signals a natural ending
("I should get back to it — but this was nice.") and the conversation closes.
Short is fine: a 3-exchange conversation that feels real beats a 10-exchange
loop.

**Context-aware openings.** Priority: their pending talk request → remembering
what you told them → village grief/cheer → their goal (if they trust you
enough) → mood/temperament small talk → honest "we've covered it".

**No repeats, ever.** `convoPick` tracks said lines by TEXT across ALL threads
per villager (robust to pool changes from mood/rep shifts). Generic pools
(exits, "told you everything", acknowledgment filler) cycle in varying order.

**Language.** No shared language → the conversation is nonverbal (gesture
choices with varying outcomes). Partial → normal conversation.

**Silence and leaving are options.** Not every interaction needs to be
productive. NPCs fill silence in character.

## Costs & effects

- 10 kcal per conversation (charged on open — cheaper than the old per-tap cost,
  encouraging real exchanges)
- Trust +3 on natural end (same 40-cap as before: words only go so far)
- Eases their social need, diplomat XP, `observe('talk')`, promise checks,
  conflict fallout (favoritism noticed, old wounds unfold) — all preserved

## Files

- `src/js/conversation.js` — the engine, self-attaching to `Game`
  (overrides `talkTo` with a delegator; all `convo*` methods)
- `src/data/characterGen.json` → `convo` key — questions, exits, follow-ups,
  silence/joke/agree reactions
- `src/js/app.js` — person card renders transcript + choice buttons
- `playtests/test_conversations.js` — 28 tests, all passing

## Tuning levers

- `convoBudget` — conversation length
- Question probability (0.4/turn after the first-convo guarantee)
- `minTrust` per question in characterGen.json
- Goal-share trust thresholds by temperament in `convoOpening`
