# People Journal

Facts about people fill into a journal as you learn them. Built because Steve
said: "it feels hard to learn anything about people and that learning goes
nowhere."

## What it is

Every NPC gets a journal entry. Facts fill in as you learn them:
- **name** — when they tell you, you overhear it, or exchange it in gestures
- **occupation** — from the "what did you do before?" thread (certain) or
  observation (uncertain: "I think she's a nurse?")
- **goal** — from "what do you want?" (certain)
- **languages** — discovered in first conversation
- **backstory** — snippets ("From Chicago, Illinois.")
- **traits** — personality observations, temperament shows through after a
  couple of real talks; deeds (gifts, rescues) mined from village memory
- **promises** — made / kept / broken, with ✓ ○ ✗
- **notes** — anything else jotted down

Unknown fields render as "?" with handwritten uncertainty pre-System.
Relationship is derived live (trust band in plain words).

## Voice

- Pre-System: your handwriting. Uncertain, personal.
  "I think she's a nurse?" / "You don't know their name yet."
- Post-System: the Codex gets precise and invasive.
  "OCC: Nurse · GOAL: Find family · LANG: 🇺🇸 English"

## Reward

Every genuinely new fact fires a small log line:
`📓 Journal: learned Chloe's name.` / `📓 Codex: learned what they want. Filed.`

## Files

- `src/js/journal.js` — self-attaching module. Wraps `revealName`,
  `convoAskTopic`, `askAbout`, `startConvo`, `promiseHelp`, `checkPromises`,
  `endDay`. No game.js edits.
- `src/js/app.js` — `peopleSection()` in the Codex screen, after SKILLS.
- `playtests/test_journal.js` — 24 tests.

## Tuning

- Certainty: pass `sure:false` for guesses, `sure:true` for told facts.
- Trait mining in the `endDay` wrap: add more memory types as they're added.
