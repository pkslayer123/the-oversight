# The Oversight — Systems Index

**Last updated:** 2026-10-05
**Purpose:** Tabulated map of every system, where it lives, what data it uses, and what depends on it. Read this before modifying any system.

---

## File Map

| File | Lines | System | Description |
|------|-------|--------|-------------|
| `src/js/game.js` | 16,272 | **God file** | Core game class. 556 methods. See method ranges below. |
| `src/js/app.js` | ~8,000 | UI shell | Screen router, mobile layout, D-pad, action panels, narration |
| `src/js/engine/state.js` | — | State | Save/load, state schema |
| `src/js/engine/day.js` | — | Time | Day parts, tick advancement, calendar |
| `src/js/engine/forage.js` | — | Forage | Tile foraging, depletion, regrowth |
| `src/js/engine/combat.js` | — | Combat engine | Turn-based combat core |
| `src/js/engine/calories.js` | — | Energy | Kcal economy, metabolism |
| `src/js/engine/modifiers.js` | — | Modifiers | `modTarget()` resolution, stacking rules |
| `src/js/food.js` | 1,599 | Food reality | Carcasses, cooking, spoilage, processing |
| `src/js/contests.js` | — | Contests | Contest/show system, eligibility, resolution |
| `src/js/conversation.js` | — | Dialogue | Conversation engine, gossip |
| `src/js/villager-agency.js` | 752 | NPC AI | Villager goals, autonomy, task assignment |
| `src/js/justice.js` | 720 | Justice | Theft detection, punishment, reputation |
| `src/js/party.js` | 1,150 | Party | Party formation, management |
| `src/js/party-formal.js` | 946 | Party formal | Formal party mechanics |
| `src/js/truth.js` | 1,009 | Truth/lies | Deception, doubt, confrontation |
| `src/js/ledger.js` | 751 | Ledger | Resource tracking, village economy |
| `src/js/hierarchy.js` | 567 | Hierarchy | Leadership, challenges, social rank |
| `src/js/corpses.js` | 493 | Corpses | Death handling, body management |
| `src/js/betrayal.js` | — | Betrayal | Betrayal mechanics |
| `src/js/membership.js` | 672 | Membership | Village membership, exile |
| `src/js/progression.js` | 596 | Progression | XP, levels, unlocks |
| `src/js/storage.js` | 624 | Storage | Inventory, pantry, stashes |
| `src/js/journal.js` | 254 | Journal | Player notes, pre-codex knowledge |
| `src/js/codex-people.js` | — | People codex | NPC knowledge tracking |
| `src/js/perceive.js` | 233 | Perception | Proximity hints, sensory info |
| `src/js/encounters.js` | 479 | Encounters | Wild encounters, monster spawns |
| `src/js/lifeseed.js` | 401 | Lifeseed | Run seeds, RNG |
| `src/js/carexplore.js` | — | Car explore | Vehicle exploration |
| `src/js/move-anim.js` | 156 | Animation | Movement animations |
| `src/js/debug-scenarios.js` | 811 | Debug | Test scenarios, loadouts |

---

## game.js Method Ranges

The god file. Methods are grouped by system in roughly this order:

### Character Generation (lines 90–680)
| Range | Methods | Description |
|-------|---------|-------------|
| 90–130 | `parseOrigin`, `familiarityTier`, `heritageFor` | Origin parsing |
| 131–170 | `randomLandingZone`, `locParams`, `cultureForOrigin` | Spawn location |
| 169–235 | `genNameForOrigin`, `guessNameGender` | Name generation |
| 271–370 | `levelsOf`, `genCultureLanguages` | Language system |
| 372–570 | `genCharacter` | Full character generation |
| 572–620 | `genRoster` | Village roster generation |
| 620–643 | `genItemCandidates` | Starting items |
| 643–685 | `genConflicts` | Initial NPC conflicts |

### Stats & Progression (lines 756–870)
| Range | Methods | Description |
|-------|---------|-------------|
| 756–777 | `practice`, `stat` | Stat improvement |
| 803–837 | `checkPassiveUnlock`, `passiveBonus`, `dominantPlaystyle` | Passive abilities |

### Conversation (lines 1302–2125)
| Range | Methods | Description |
|-------|---------|-------------|
| 1302–1383 | `talkTo`, `vpOf`, `convoGet`, `convoBudget`, `convoPick` | Convo setup |
| 1383–1480 | `convoOpening`, `convoThreadHasMore`, `convoThreadBeat` | Thread management |
| 1523–1680 | `convoAskTopic`, `convoChoices`, `startConvo` | Topic system |
| 1679–1830 | `convoTurn`, `endConvo`, `convoConflictFallout` | Turn resolution |
| 1856–2050 | `convoUI`, `nonverbalRead`, `nonverbalGesture`, `nonverbalDraw` | Nonverbal comm |
| 2047–2125 | `teachPlant` | Knowledge transfer |

### Crafting & Traps (lines 2125–2260)
| Range | Methods | Description |
|-------|---------|-------------|
| 2125–2197 | `craft`, `learnRecipe` | Crafting system |
| 2197–2260 | `setTrap`, `checkTraps` | Trap system. **Trap catch:** `modTarget('hunt.trap_catch', 0.4)` capped at 0.95 |

### Social Actions (lines 2302–3170)
| Range | Methods | Description |
|-------|---------|-------------|
| 2302–2360 | `edibleCount`, `giveFood`, `packKcal`, `packSpend` | Food sharing |
| 2377–2452 | `stealFrom`, `theftNoticeSweep` | Theft |
| 2452–2530 | `intimidate` | Intimidation |
| 2522–2570 | `offerDeal`, `goalTaskAffinity`, `appealToGoal` | Deals |
| 2627–2850 | `askAbout` | Information gathering |
| 2876–2980 | `comfort`, `makeAmends`, `mediateConflict` | Conflict resolution |
| 2976–3170 | `rallyVillage`, `askSupport`, `yieldChallenge`, `standGround`, `promiseHelp` | Leadership |

### Village Management (lines 3297–3490)
| Range | Methods | Description |
|-------|---------|-------------|
| 3297–3346 | `villageAction`, `delegateTasks` | Village actions |
| 3346–3490 | `villagerCompetence`, `checkObedience`, `trustTaskMult`, `assignTask` | Task assignment |

### Combat — Turn-Based (lines 13242–15930)
| Range | Methods | Description |
|-------|---------|-------------|
| 13242–13281 | `tbAfterPlayerAction`, `tbAdvance` | Turn advancement |
| 13281–13365 | `tbSnakeMove`, `tbSnakeSplit`, `tbSnakeContactDamage` | Snake monsters |
| 13385–13605 | `tbDamage` | Damage resolution |
| 13605–13703 | `tbVillagerFalls`, `tbVillagerSyncPos`, `tbDangerCells`, `tbBlocked`, `tbVillagerTurn` | Villager combat |
| 13703–13960 | `deerIs`, `boarIs`, `wolfIs`, ... `encDeclarePhase` | Monster type checks & phases |
| 13957–14663 | `tbMothApproach`, `tbHumSwarmCheck`, `tbChorusJoin`, `tbLockpickTurn`, `tbCatfishTurn`, `tbPlayerShout`, `tbPlayerOfferFood` | Monster-specific AI |
| 14663–15773 | `tbMonsterTurn` | Main monster AI dispatcher |
| 15773–15930 | `tbEndCheck`, `rollAlienLoot`, `tbEnd`, `combatRound` | Combat resolution |

### Abilities (lines 10363–10420)
| Range | Methods | Description |
|-------|---------|-------------|
| 10363 | `blood_magic` | -10 HP → +500 kcal. No cooldown. **Synergy:** Field Medicine |
| 10400 | `field_medicine` | +20 HP, -100 kcal, once/day part. **Prevents:** Blood Magic infinite loop |
| 10405 | `herbal_remedy` | Cures disease, once/day |
| 10410 | `purify` | Cures poison, once/day |

### Utility (lines 15933–16272)
| Range | Methods | Description |
|-------|---------|-------------|
| 15933–16007 | `say`, `pickFresh`, `maybeCheatDeath`, `tele` | Core utilities |
| 16021–16087 | `fmtKcal`, `status`, `openBookInfo` | Display helpers |
| 16097–16234 | `plantKnown`, `plantLevel`, `plantUses`, `identifyPlant`, `villagerLearnsPlant` | Plant knowledge |
| 16234–16272 | `codexEntries`, `codexInProgress`, `dpadSide`, `setDpadSide` | Codex & UI prefs |

---

## Data Files

| File | Used by | Description |
|------|---------|-------------|
| `abilities.json` | `game.js` (abilities), `modifiers.js` | All player/NPC abilities. **Modifiers** use `modTarget()` |
| `animals.json` | `game.js` (traps, hunting), `food.js` | Animal definitions, kcal values |
| `biomes.json` | `game.js` (generation), `forage.js` | Biome definitions |
| `items.json` | `game.js` (inventory), `storage.js` | Item definitions |
| `knowledge.json` | `game.js` (identify), `journal.js` | Knowledge levels |
| `monsters.json` | `game.js` (combat), `encounters.js` | Monster definitions |
| `plants.json` | `game.js` (forage), `food.js` | Plant definitions, edible parts |
| `recipes.json` | `game.js` (craft) | Crafting recipes |
| `synergies.json` | `game.js` (abilities) | Ability synergy definitions |
| `villagers.json` | `game.js` (generation) | Villager templates |

---

## Key Cross-System Dependencies

```
Abilities → Modifiers → modTarget() → Combat/Forage/Traps
Food → Calories → Health → Combat
Knowledge → Forage → Food → Power
Conversation → Trust → Leadership → Village Actions
Traps → Animals → Food → Carcasses → Cooking
Disease/Poison → Herbal Remedy/Purify → Health
Blood Magic ←→ Field Medicine (synergy, not exploit)
```

---

## Ability Modifier Targets (tabulated)

| Target | Base | Used in | Abilities that modify it |
|--------|------|---------|-------------------------|
| `hunt.trap_catch` | 0.4 (cap 0.95) | `checkTraps()` L2237 | Poisoner (×1.5), Scarecrow (×2.0) |
| `healing.amount` | 5 (rest) | Rest action | Triage (×?) |
| `forage.yield` | varies | `forage.js` | Forage ID, Game Sense |

---

## Status Effects (tabulated)

| Status | Producer | Cure | Consequence |
|--------|----------|------|-------------|
| Disease | Raw food events (`diseaseRisk`) | Herbal Remedy | Recorded in `scholar.diseases[]`, -HP |
| Poison | Belltoad throat sac (`poisonRisk`, 50%) | Purify | Recorded in `scholar.poisons[]`, -10 HP |

**GAP:** Poison has a cure but no producer. Need to add poison sources or remove Purify.

---

## Maintenance Rules

1. **New systems go in new files**, not game.js. game.js is frozen for new systems.
2. **New abilities go in `abilities.json`** with runtime branches in game.js abilities section.
3. **Every modifier target must be tabulated** in the Ability Modifier Targets table above.
4. **Every status effect must have:** producer, cure, and consequence. No orphans.
5. **Every data file change** must note its consumers in the Data Files table.
6. **Tests:** `scripts/test-*.js` for each system. Run before commit.
