# Role Audit — assigned roles vs personality potential (Steve 2026-10-06)

Steve's law: people-not-classes. A trader is someone who *happens to have an
entrepreneurial spirit*, not a role flag. His instinct ("I bet they're
systemic") was right — the trader wasn't alone.

## Ranked findings (worst first)

### 1. `villagerCompetence` — occupation as permanent destiny [WORST]
**File:** `src/js/game.js:3737` (`villagerCompetence(vid, task)`)

A villager's effectiveness at hunt/forage/wood/water/scout/patrol is a fixed
multiplier (0.7 / 1.0 / 1.4) from occupation keyword matching. A librarian
hunts at 0.7x **forever** — the function is pure, stateless, no XP input.

Credit: it does NOT gate assignment (anyone can be assigned anything; the UI
honestly says "not their strength..."). The rigidity is in permanence, not
access. But "every villager changes through lived events" is violated: fifty
days of hunting teaches the librarian nothing.

**Personality alternative:** competence starts from occupation (background
matters) but drifts with lived experience — per-person per-task experience
counters; the multiplier moves toward demonstrated performance. Hunters go
rusty without practice; librarians become woodsmen.

### 2. `specialistSkill` — occupation hard-gate on skill
**File:** `src/js/food.js:569` (`specialistSkill(person, task)`)

Skill starts at 0 and is set ONLY by occupation string matching against
SPECIALTIES. The XP path (`foodXp`) boosts skill only `if (skill > 0`) — a
person whose former occupation doesn't match can NEVER become a specialist,
no matter how much they practice. Gates `specialistsHere()` and who you can
ask to butcher/cook/preserve.

**Personality alternative:** skill starts 0 for everyone; occupation grants a
starting bonus; practice XP builds from zero. The specialist list then
reflects lived skill, not birth certificate.

### 3. `type: 'trader'` visitor role [KNOWN — hands off]
**File:** `src/js/betrayal.js:2007` + 10 gate sites (2054, 2061, 2068, 2072,
2187, 2288, 2339, 2354, 2360...)

Visitor type assigned at spawn gates all trade interactions. The scam worker
is actively in this file and has been briefed to de-role it — DO NOT TOUCH.

**Personality alternative (for their brief):** trading as verb —
`visitor.trading` intent + entrepreneurial-spirit trait, not a type flag.

### 4. `isHunter` flat bonus — permanent backstory buff
**File:** `src/js/encounters.js:1344,1369`

`+0.2` hunt find chance if 'hunter' appears in formerOccupation. Permanent,
practice-independent. (The tracker-ability path alongside it is the earned
alternative and is fine.)

**Personality alternative:** fold into the competence/XP system — hunters
start ahead, everyone can learn.

### 5. Dead `'scout'` visitor type
**File:** `src/js/betrayal.js:2007`

Picked in the type lottery, never referenced anywhere. Dead role flag —
remove with the trader de-roling.

### 6. Plant-knowledge seeding by occupation [MILD — probably fine]
**File:** `src/js/food.js:762-780`

Initial plant knowledge: botanist→3, forager→2, chef→1, anyone else 15%
chance of 1. This is *starting* knowledge — background informing the start
state is legitimate, and the 15% path means it's not exclusive. Borderline;
noted, no change recommended.

### 7. Membership applicant occupation preference [MILD — human, keep]
**File:** `src/js/membership.js:356-361`

Village scores applicants partly by useful occupation ("the village could
use one," +10). This is preference, not assignment — a village valuing a
doctor is human. Keep, but watch it doesn't harden into quotas.

## Verified clean (do not touch)
- **Ability kits** (`game.js:11454`): offered by week-1 *actions* + background, player chooses. Behavior-based. ✓
- **Techniques** (`food.js:119,132`): background grants head start; learnable by trial and watching. ✓
- **`*Known()` skills** (`game.js:6798+`): occupation background OR learned codex flag. ✓
- **lifeseed `occCategory`** (`game.js:1420`): *starting stats only* — "that body remembers," then play takes over. The correct pattern. ✓
- **Party roles** (`party-formal.js:93`): player-assigned tactical slots, not identity. ✓
- **No fixed cast**: no "the healer"/"the blacksmith" singleton lookups anywhere. ✓
- **Monsters**: no role/class flags in `monsters.json`. ✓
- **Teacher occupation** (`game.js:2323`): flavors teaching style via intelligence, doesn't gate. ✓

## The pattern
Wherever occupation appears as a *starting bonus with a learning path*, the
design is right. Wherever it appears as a *permanent multiplier with no XP
input* (`villagerCompetence`, `specialistSkill`, `isHunter`), it's a role
wearing a background's clothes. The fix in every case is the same shape:
background sets the start, lived experience moves the number.
