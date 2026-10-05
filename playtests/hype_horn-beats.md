# hype_horn — encounter beat capture

> Text capture from a scripted node sim (`scripts/play-monbatch4.js hype_horn`),
> not a live browser session. The sim drives real game turns and prints exactly
> what the player would read in the log, with the grid state at each beat.
> Played 2026-10-04.

## Monster
**Motivational Speaker** (hype_horn) — something in the dusk, shouting
encouragement at top volume. It believes in you SO MUCH it hurts. Literally.
FIFO encouragement queue; big slow burst (radius 3, windup 3 — get clear);
deflates in a crowd; hunts in packs; follows.

## Beat 1 — first sighting
```
[grid] you=(4,4) hp=100 | foe=(7,4) hp=52 phase=stalk | queue=p
  ⚔ SOMETHING IN THE DUSK, SHOUTING ENCOURAGEMENT AT TOP VOLUME! You're on your own.
```

## Beat 2 — telegraph: it inflates (pre-knowledge: diegetic)
```
[grid] you=(4,4) hp=100 | foe=(7,4) hp=52 phase=inflate 🎈 INFLATING | queue=p
  ⚠ 📣 "YOU'VE GOT THIS!" It inflates — throat, chest, the whole resonating chamber swelling like a bagpipe of pure encouragement. The encouragement is about to become physical. Distance is self-care.
```
The player gets CLEAR — 4 squares out.

## Beat 3 — the pep talk escalates, one shout per beat
```
[grid] you=(4,0) hp=100 | foe=(7,4) hp=52 phase=encourage 📣 PEP TALK | queue=p
  📣 "YOU'RE A WINNER!" It's swelling — the air ripples. GET CLEAR.
  📣 "NEVER GIVE UP!" It's swelling — the air ripples. GET CLEAR.
```

## Beat 4 — climax: detonation, dodged by distance
```
[grid] you=(4,0) hp=100 | foe=(7,4) hp=52 phase=deflate 🎈💨 DEFLATED | queue=p
  💥 Pep Talk!
  You're not where it landed. Clean dodge.
  📖 Codex: Pep Talk — hits everything close around it. You won't forget this.
  It sags, spent — the encouragement took everything out of it.
```
Radius 3 is the biggest burst going; 4 squares of distance beats it. The
counterplay is pure positioning — no tricks, just respect the blast.

## Beat 5 — post-knowledge: the coaching unlocks
```
  ⚠ 📣 "YOU'VE GOT THIS!" It inflates — … Pep Talk: burst radius 3, the biggest burst going. Slow windup — GET CLEAR, four squares or more. You know this one: Pep Talk hits everything close around it.
```

## Beat 6 — crowd: it can't encourage a crowd
With two villagers beside the player the FIFO queue fills, then:
```
  It winces mid-sentence — then rounds on A person, maybe 60s. "PAIN IS JUST WEAKNESS LEAVING THE BODY!"
  Too close. It whirls on A person, maybe 60s: "I BELIEVE IN YOU!" — proximity overrules the pep-talk queue.
  📣 "YOU'RE ALL WINNERS, I'M JUST—" It deflates. It only does one-on-one.
```
phase=deflate 🎈💨 DEFLATED, windup cancelled, 2-turn cooldown. Bring friends —
it only does one-on-one.

## Playtester's notes
- The three-beat inflation ("YOU'VE GOT THIS!" → "YOU'RE A WINNER!" →
  "NEVER GIVE UP!") is the funniest windup of the four and the most legible:
  you always know exactly how much encouragement is left.
- Differentiated from the drone's crowd-overload: the drone *pauses* (recalibrates,
  tries again); the horn *deflates* (loses the charge entirely, 2-turn cooldown).
- You can tell which monster this is from the capture: 📣 patter, the inflation
  arc, the deflation. Identity is unmistakable.
