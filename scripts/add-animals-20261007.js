#!/usr/bin/env node
/* Appends 6 new animals (indices 26-31) to src/data/animals.json.
   Thin pools: trail_edge biomes, small game, nocturnal predators,
   waterfowl/shore, night birds. Steve-flavored full data treatment. */
'use strict';
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '..', 'src', 'data', 'animals.json');
const animals = JSON.parse(fs.readFileSync(P, 'utf8'));
const ids = new Set(animals.map(a => a.id));

const NEW = [
  {
    "id": "eastern_chipmunk",
    "activity": "diurnal",
    "name": "Eastern Chipmunk",
    "scientific": "Tamias striatus",
    "biomes": ["forest_floor", "grove"],
    "description": "a chipmunk stuffing its cheeks, pausing mid-scamper to stare",
    "calories": 200,
    "difficulty": "easy",
    "method": ["trap", "chase"],
    "knowledgeLevels": {
      "1": "Chipmunk. Striped, cheek-pouched, quick. Half the squirrel's size.",
      "2": "Parts: tiny meat (tender), no useful hide. The cheek pouches are the tell — it's carrying food SOMEWHERE.",
      "3": "Hunt: it runs a fixed route — burrow to cache to burrow. Snare the run, not the animal. And when the chipmunks start stuffing in earnest, winter is close.",
      "4": "Mastery: never kill a chipmunk near its cache. Mark the caches instead — a chipmunk's winter pantry is a map of the forest's seed fall. You eat the map, not the mapper."
    },
    "unknown": "a striped blur darting between the roots, cheeks bulging like saddlebags",
    "emoji": "🐿️",
    "behavior": "skittish",
    "behaviorDesc": "Darts in short sprints, pausing to stand tall and check the world. Bolts straight for its burrow when pressed — and the burrow is never far.",
    "fleeDifficulty": "medium",
    "huntText": "It freezes upright, stripes bristling — then it's GONE, zigzagging low through the leaf litter toward a hole you hadn't noticed. Cut the angle or lose it.",
    "tell": "rises on its hind legs, dead still, watching you with its whole striped face.",
    "butcher": {},
    "killText": "About {kcal} kcal — two honest bites. The real lesson is the cheeks: follow a fat-cheeked chipmunk home sometime, and you'll find a cache worth more than the animal.",
    "diseaseVector": "Chipmunks carry ticks like everything else furry. Cook through.",
    "common": true,
    "regions": ["north_america"]
  },
  {
    "id": "american_mink",
    "activity": "nocturnal",
    "name": "American Mink",
    "scientific": "Neogale vison",
    "biomes": ["creek", "wetland", "trail_edge"],
    "description": "a dark mink flowing along the bank like poured water",
    "calories": 700,
    "difficulty": "hard",
    "method": ["trap", "bow"],
    "knowledgeLevels": {
      "1": "Mink. Dark, long, mean. It saw you long before you saw it.",
      "2": "Parts: lean dark meat, and the pelt — mink fur is the trade standard of the north woods, warm even wet.",
      "3": "Hunt: it patrols the waterline at night, nose down. It is a stalker, and it knows the ground better than you ever will. Box-trap the slide at dusk; it never takes the same route twice.",
      "4": "Mastery: mink go where the fish are. A mink on the bank means the creek is feeding — fish, frogs, crayfish. Hunt the mink's territory and you'll eat twice: once from the water, once from knowing where to look."
    },
    "unknown": "a dark ribbon of an animal slipping along the waterline, there and gone",
    "emoji": "🦡",
    "behavior": "stalker",
    "behaviorDesc": "A predator's predator. It hunts YOU with its eyes before you ever get a shot — tracks your movement, circles wide, and is gone before you finish deciding. Bold enough to stand its ground if cornered, and the teeth back it up.",
    "fleeDifficulty": "very_hard",
    "huntText": "You catch the dark slide along the bank — and then you realize it has stopped, head up, WATCHING you. It knows where you are. It always knew. Then it pours itself into the reeds.",
    "tell": "stops mid-slide, head raised, nose tasting the wind — deciding whether you are a threat or an idiot.",
    "butcher": { "hide": 1 },
    "killText": "About {kcal} kcal of dark lean meat — and the pelt. Mink fur is the north woods' money: warm when wet, light, worth more than the meal. Skin carefully.",
    "diseaseVector": "Mink run the same waterline as everything else — parasites possible. Cook through.",
    "common": true,
    "regions": ["north_america"]
  },
  {
    "id": "great_horned_owl",
    "activity": "nocturnal",
    "name": "Great Horned Owl",
    "scientific": "Bubo virginianus",
    "biomes": ["grove", "forest_floor"],
    "description": "a great horned owl on a dead limb, ear tufts up, watching",
    "calories": 900,
    "difficulty": "hard",
    "method": ["bow", "trap"],
    "knowledgeLevels": {
      "1": "Great horned owl. Ear tufts, silent wings, eyes like lanterns.",
      "2": "Parts: rich dark meat, big flight feathers. The silence is engineered — serrated feather edges kill the wing noise.",
      "3": "Hunt: it owns the night from a perch. Approach under cover; it hears a twig at fifty yards. If it turns its whole head to track you, you're made.",
      "4": "Mastery: an owl's perch is a hunting blind you can steal. Pellets at the base tell you what it eats — and what it eats tells you what's nearby. Read the pellets: mice, voles, skunks. The owl maps the night for you."
    },
    "unknown": "two lantern eyes in the dark above you, floating with no sound at all",
    "emoji": "🦉",
    "behavior": "stalker",
    "behaviorDesc": "Perches and owns the air. You don't hear it move — the wings are serrated for silence. When it decides you're prey rather than a problem, there is no warning. Just talons.",
    "fleeDifficulty": "very_hard",
    "huntText": "The eyes blink — once — and then the branch is empty. You never heard it go. Somewhere above you, wings beat without a whisper, and you are the thing being hunted until you prove otherwise.",
    "tell": "the head swivels the full way around, slow, and the ear tufts rise — it has decided about you.",
    "butcher": { "feather": 6 },
    "killText": "About {kcal} kcal — dark, rich meat. The flight feathers are silent-engineered; fletch arrows with them and they'll fly quiet too.",
    "diseaseVector": "Raptors can carry West Nile (mosquito-borne) and salmonella. Cook through.",
    "common": true,
    "regions": ["north_america"]
  },
  {
    "id": "green_heron",
    "activity": "crepuscular",
    "name": "Green Heron",
    "scientific": "Butorides virescens",
    "biomes": ["creek", "wetland"],
    "description": "a green heron standing statue-still at the water's edge",
    "calories": 800,
    "difficulty": "medium",
    "method": ["line", "hands"],
    "knowledgeLevels": {
      "1": "Green heron. Small for a heron, hunched, patient as stone.",
      "2": "Parts: good dark meat, long feathers. It fishes by standing still — and sometimes by dropping bait: feathers, bread, insects.",
      "3": "Hunt: it watches the water, never you. Wade in from upstream, slow — the moment the neck uncoils it's fishing, not fleeing, and you get one strike.",
      "4": "Mastery: a heron standing at one spot, day after day, is a fish census. Where it strikes, fish run thick. Fish the heron's hole after the heron leaves — it did the scouting for you."
    },
    "unknown": "a hunched gray-green statue at the water's edge, neck folded like a spring",
    "emoji": "🪶",
    "behavior": "sentinel",
    "behaviorDesc": "Stands at the waterline like a statue, utterly absorbed in the shallows. It barely notices you — until the neck uncoils in a strike faster than your eye. Explodes upward if you crowd it, all wings and outrage.",
    "fleeDifficulty": "hard",
    "huntText": "It hasn't moved a muscle since you arrived — and then the neck UNCOILS, a blur of spear-neck into the water, and it rises with a minnow wriggling. It is fishing. You are background.",
    "tell": "the folded neck starts to uncoil — a strike is coming, and it will not be at you.",
    "butcher": { "feather": 4 },
    "killText": "About {kcal} kcal — dark, honest meat. The long feathers are the prettier half of the kill. Clean it like a fish-eater: gut fast.",
    "diseaseVector": "Fish-eaters can carry parasites. Cook through.",
    "common": true,
    "regions": ["north_america"]
  },
  {
    "id": "big_brown_bat",
    "activity": "nocturnal",
    "name": "Big Brown Bat",
    "scientific": "Eptesicus fuscus",
    "biomes": ["grove", "trail_edge"],
    "description": "bats stitching the dusk, snapping up moths over the trail",
    "calories": 120,
    "difficulty": "medium",
    "method": ["trap"],
    "knowledgeLevels": {
      "1": "Big brown bats. They own the air at dusk — one bat eats a thousand mosquitoes a night.",
      "2": "Parts: almost no meat. The value is the colony: guano is the richest fertilizer in the woods, and a bat roost means a dry hollow tree.",
      "3": "Hunt: net the flight line at dusk where the trail narrows. They're fast but they fly the same corridor every night.",
      "4": "Mastery: never hunt the roost, harvest the flight line — and only a few. A bat colony is mosquito control for the whole camp. One bat is dinner; a hundred bats are a season without fever."
    },
    "unknown": "something stitching the dusk overhead, too fast to follow, snapping",
    "emoji": "🦇",
    "behavior": "flock",
    "behaviorDesc": "Emerges at dusk in a chattering column, each bat on its own erratic vector. Nearly impossible to track one — the flock is the defense. Lands only deep in crevices you can't reach.",
    "fleeDifficulty": "very_hard",
    "huntText": "The dusk tears open with wings — not one, a whole column of them, stitching the air above the trail in paths no eye can follow. Pick one. You can't. That's the point.",
    "tell": "the column funnels down the trail corridor — the flight line narrows, and for a breath they're predictable.",
    "butcher": {},
    "killText": "About {kcal} kcal — a mouthful, barely. The colony is worth more than any one bat: guano for the garden, and a thousand fewer mosquitoes a night per bat.",
    "diseaseVector": "Bats can carry rabies — never handle a live one with bare hands. Cook through.",
    "common": true,
    "regions": ["north_america"]
  },
  {
    "id": "eastern_coyote",
    "activity": "crepuscular",
    "name": "Eastern Coyote",
    "scientific": "Canis latrans",
    "biomes": ["meadow", "trail_edge"],
    "description": "a coyote trotting the trail's edge, pausing to look you over",
    "calories": 6000,
    "difficulty": "hard",
    "method": ["bow", "trap"],
    "knowledgeLevels": {
      "1": "Coyote. Bigger than the fox, smarter than the dog. It is sizing you up.",
      "2": "Parts: real meat (like lean pork), a warm pelt, strong bones. The howls at dusk are a pack roll-call — count the voices, know the pack.",
      "3": "Hunt: it learned your traps from watching. Move them, vary the set, or it walks around. At dusk it is bold; at dawn it is gone.",
      "4": "Mastery: coyotes are the woods' cleanup crew. Where they work, something died — follow a working pack at a distance and you'll find carcasses before the bones bleach. And a pack that loses its fear of people is a pack that needs to be taught it, fast."
    },
    "unknown": "a lanky gray shape loping the far treeline, pausing to watch you back",
    "emoji": "🐺",
    "behavior": "cunning",
    "behaviorDesc": "Circles, tests, learns. It watches your traps from the treeline and remembers them. The pack howls at dusk — and the voices move while they howl, so you never know how many there are. Bold when it's sure, gone when it isn't.",
    "fleeDifficulty": "dangerous",
    "huntText": "The lope stops. It turns, head low, and looks at you — really looks, weighing. Somewhere off in the dark, a second voice answers the first howl. You are being assessed.",
    "tell": "the trot breaks and the head drops low — it has stopped deciding and started acting.",
    "butcher": { "hide": 1, "bone": 1 },
    "killText": "About {kcal} kcal — like lean pork, and enough of it to matter. The pelt is warm and the howls go quiet for a night. Gut it fast and hang it high.",
    "diseaseVector": "Coyotes carry rabies and mange — never touch a live one, and cook the meat through.",
    "common": true,
    "regions": ["north_america"]
  }
];

let added = 0;
for (const n of NEW) {
  if (ids.has(n.id)) { console.error('SKIP duplicate id: ' + n.id); continue; }
  animals.push(n);
  added++;
}
// Match HEAD's exact style: older-Node JSON escaping (\uXXXX / surrogate
// pairs for astral chars), 2-space indent, trailing newline.
const esc = s => s.replace(/[\u0080-\uFFFF]/g,
  c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
fs.writeFileSync(P, esc(JSON.stringify(animals, null, 2)) + '\n');
console.log(`added ${added}, total ${animals.length}`);
