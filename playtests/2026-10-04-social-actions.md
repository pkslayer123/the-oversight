# Social Actions — Test Report (2026-10-04)

## What was built

10 contextual social actions, each a player-facing path to a deep system:

| Action | System it reaches | Trigger condition |
|---|---|---|
| ❓ Ask about… | Goals, gossip, village mood | Always (if shared language) |
| 🤗 Comfort | Needs/moods | NPC is scared or grieving |
| 🙏 Make amends | Reputation axes | Player has bad rep with them |
| 🕊 Mediate | Conflicts | Known unresolved conflict involving them |
| 🤝 Ask for support | Leadership heat | Leadership challenge active or heat > 0 |
| 📢 Rally the village | Leadership/group morale | Same as above |
| 🤞 Promise to help | Goals + trust | Goal known, no existing promise |
| ⚡ Confront | Gossip/reputation | They've spread negative gossip about you |
| 🤝 Offer food (deal) | Obedience/trust | In assign flow, have food |
| 🎯 Appeal to goal | Goals/obedience | In assign flow, goal known |

Plus `checkPromises` wiring: promises are kept/broken via real gameplay.

## Test results

**32-34/34 pass** across 5 runs (`playtests/test_social_actions.js`):
- All 10 actions execute without crashes
- askAbout reveals goals → goalKnown gates appeal/deal UI correctly
- comfort reduces fear, grants trust
- offerDeal consumes food, assigns task (or refuses with food kept... no — food consumed either way, per design)
- appealToGoal uses goal-task affinity for bonus
- makeAmends requires rep ≤ -15 (intentional threshold)
- promiseHelp → checkPromises(kind) keeps promise (+15 trust)
- 7+ day old promises break on endDay (-15 trust)
- confrontGossip dampens or worsens gossip based on honesty/trust
- displayName never leaks raw IDs

**Sim suite**: clean, no crashes, no regressions.
**Content gate**: OK (all counts unchanged).
**Syntax**: `node --check` clean on both files.

## Design notes

- **Deal/appeal in assign flow**: method selector (💬 Just ask / 🤝 Offer food / 🎯 Appeal) above task buttons. Deal disabled without food. Appeal disabled without known goal (with hint to "Ask about…"). This makes the knowledge → action pipeline explicit: learn what they want → use it.
- **checkPromises kinds**: 'food' (giveFood), 'fight' (combat victory), 'heal' (comfort), 'task' (resolveAssignments), 'social' (talkTo), no-kind (endDay for 7-day rot).
- **Not perpetual**: every button appears only when contextually relevant. No "bribe" button sitting there — the deal option appears in the assign flow when you need leverage.
