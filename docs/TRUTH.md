# Truth-Finding

People can lie. The Codex doesn't detect lies — it notices when things don't add up.

## How it works

**Lies are generated, not scripted.** On first meeting, some NPCs get lies:
- Base rate ~12%. Higher for malicious psychos (+50%), benign weird (+15%),
  escape-goal (+20%), lead-goal (+15%), prickly/withdrawn (+10%).
- Lie about: occupation (plausible adjacent cover), origin, or goal (benign cover).
- Motive: hiding, shame, manipulation, pathological, protection.
- Max 2 lies per person, usually 1.

**The lie is substituted at the source.** When an NPC answers 'past'/'goal'
topics, `convoAskTopic` is wrapped: the villager's truth is temporarily swapped
with the lie, so both the spoken line AND the journal record what they TOLD you.
The truth is restored immediately after. Behavior (goals, needs) always uses truth.

**Trust gates honesty.** Low trust → they lie. High trust (>60) → truth,
UNLESS pathological (malicious psychos lie better when trusted). After a
confession, always truth.

## Finding the truth

1. **Contradictions** (automatic): new claim != old claim on same topic → doubt.
2. **Gossip cross-reference**: NPCs talk about each other. If what you hear
   conflicts with what you were told → doubt.
3. **Observation** (`observePerson(vid)`): spend 2 ticks watching. Behavior may
   contradict the story. Observant intelligence helps. Only fires on real lies.
4. **Slips** (ambient): each day, 6% chance per lie that details slip in conversation.
5. **Behavior checks** (ambient): claimed goal vs observed actions.
6. **Ask around**: social/intelligent NPCs share reads via gossip.

## Doubts

Stored in `state.codex.doubts`. Surfaced in the journal as ❓ notes.
Pre-System: handwritten unease ("Something doesn't add up...").
Post-System: precise flags ("CONTRADICTION DETECTED").

## Confrontation

Conversation choice appears when unresolved doubts exist:
"You told me one thing, then another. What's going on?"

Personality-driven outcomes:
- **Confess** (shame motive + trust → likely): truth revealed, journal corrected.
- **Deflect** (smooth if malicious, clumsy if not): doubt deepens.
- **Counter-attack**: relationship damage, they turn hostile.

If no lie behind the doubt, it's cleared as a misunderstanding — but a real
accusation that lands empty costs the accuser (rep dent, village gossip names
them). Tentative questions — behavior doubts, gossip leads formed before you
heard their story — clear neutrally: no accusation was made.

## Design notes

- This is a contradiction-noticer, not a lie detector. The player decides.
- Lies are rare enough that trust is the default. Paranoia is earned.
- The journal is the UI surface — doubts appear as notes until app.js gets
  a dedicated DOUBTS section (`Game.doubtsHTML()` is ready).
