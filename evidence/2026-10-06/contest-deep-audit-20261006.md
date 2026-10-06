# Deep Contest Audit — 2026-10-06

Steve's 7 questions, answered by PLAYING (10 contests deep + 34 completable sweep + 40 win/lose sims).

## 1. Are contests LIVING like everything else?

**Yes.** They use real villagers by name (Kayden stands under the lights), reference the actual village, and the multi-take system pulls real roster members. Deaths remove real villagers — the village feels it. The Confession I played used a real villager name and the water store the player actually depends on. This isn't bolted on.

## 2. Fully playable and functional?

**Yes.** All 34 contests completable, no stuck states (verified programmatically). Every contest resolves to won/lost/died. The two documented bugs are fixed:
- "won 1 contest(s)" → "won a contest" / "won N contests"
- Flat survivor line → 4 varied lines

## 3. Winnable?

**Yes, and earned.** Pit aggressive: 18/20 wins (90%). But winning costs — you take real damage, and the death chance is real (2/20 died). Gauntlet reckless: 12/20 wins. Winning isn't free; it's bought with HP, kcal, and risk. The smart play (sidestep in pit, run the clock in gauntlet) wins more reliably than the brave play — which is correct design.

## 4. Loseable?

**Yes, and losses hurt.** Confession: I lost and an innocent villager was taken by the System. Gauntlet reckless: 8/20 lost. Deaths are real — villagers die, trauma goes up, the village fractures. Losing a contest isn't "try again" — it's a scar.

## 5. Worth playing?

**Yes.** Prizes are real (alien loot path on wins). Knowledge compounds (codex levels 1-3, coaching unlocks, veteran damage reduction). Notability feeds the eligibility panel. Bets pay 2x. Even watching teaches. There's always a reason to engage beyond "it's mandatory."

## 6. Enjoyable to play?

**Honestly: yes, with variance.** The bespoke contests (pit, gauntlet, confession, cookfight, moot) have distinct voices and real tension. The Confession is the standout — genuine detective work with a gut-punch. Cookfight is funny without being silly. The template-based ones (endurance/moot/weird/puzzle/detective/forage/chance generics) are competent but thinner — they work, they don't sing. The 4 new bespoke variants (sorting, witness, cache, longodds) are a clear step up from the templates they replaced.

**Dull spots:** The generic template contests feel samey after the bespoke ones. The "watch mode" for non-participants is functional but passive.

## 7. Do they fit the game's themes?

**Yes.** OVERSIGHT as televised spectacle: the System's voice is perfect (bright as a knife, almost kindly). Survival logistics: calorie_run, pantry_raid, honey tie directly to food. Knowledge→power: contest knowledge levels, coaching, veteran reads. Desperate violence: pit and gauntlet feel desperate, not heroic — you're surviving, not dominating.

## Bugs fixed this run
- `contests.js:134` — "won 1 contest(s)" → proper pluralization
- `_contestResolveOthers` — flat survivor line → 4 varied lines

## Test results
`scripts/test-contests-deep-20261006.js` — 47/47 green
- 10 contests played deep across types
- 34/34 completable, no stuck states
- Pit: 18W/2D in 20 (winnable, deadly)
- Gauntlet: 12W/8L in 20 (winnable, loseable)
