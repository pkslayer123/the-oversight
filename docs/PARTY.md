# Party System & Betrayal

## Design

**Parties are a System unlock (day 7).** Before the System arrives, there is no
"party" concept — people just follow you or don't, based on trust and their own
goals. No UI, no cap. Just relationships.

The System gamifies what was already happening organically. It finds this
hilarious. It also auto-enrolls your current followers, because of course it does.

## Trust is not safety

There is **no trust gate** on party invites. Anyone can join if they agree.
Trust affects whether they SAY yes — not whether the System allows it.

Betrayal runs on **personality + goals + desperation + opportunity**. Trust is
deliberately NOT a factor. A high-trust backstab is just as possible as a
low-trust one — and more devastating, because you didn't see it coming.

The most dangerous backstabber is the one you trust completely.

## Mechanics

### Invites (post-System)
- Person card → "Invite to party" (cap 3 at unlock, 4 at day 14, 5 at day 30)
- Acceptance: base 35 + trust×0.4, modified by temperament, goal, mood
- Backstabbers ALWAYS accept — they want proximity
- Refusals are contextual ("I work alone", "I don't know you well enough")

### Followers (pre-System)
- Trust ≥ 65 + compatible goal → may volunteer ("I'm coming with you")
- Max 2, no UI. They drift off if trust craters or terror spikes

### Traveling
- Party + followers are placed near you on every node travel
- Batch turns leash them within 3 squares — they travel WITH you, not wander off
- Party banter on travel/combat: personality-driven lines, members talk to each other

### Combat
- Party members auto-join fights even beyond the normal 4-square radius
- They're with you. That's the point.

### Betrayal (both directions)

**NPC betrays you:**
- Intent: prickly/intense temperaments, survive/lead/escape goals, starvation
- Opportunity: isolated node (not Haven), you're wounded, pack looks valuable
- Warning cues: "She's been watching your pack." — from observation, never the trust meter
- Lures: "I found something in the woods. Come see? Just us."
- Trigger: betrayal combat, betrayer as hostile fighter

**You betray them:**
- Person card → "Attack" (always available, pre- and post-System)
- The classic MMO move: lure them out, kill them, take their stuff
- Loot the fallen: some of their carried items
- Witnesses → 'murder' gossip (honest -40, generous -25), trust craters
- No witnesses → unsolved death, journal knows

**Aftermath:**
- Betrayer killed: self-defense is understood, but "you bring killers" costs trust
- Betrayer flees: removed from roster, recorded — they're out there now
- Fled/killed betrayers don't come home

## Tuning
- `partyMax`: 3 → 4 (day 14) → 5 (day 30)
- Betrayal opportunity threshold: 70/100
- Cue chance: 18% per sweep, max 3 cues per NPC
- All in `src/js/party.js` — self-attaching module, game.js untouched
