// Appends 5 new books to src/data/books.json covering the 12 plants added by
// the plants depth pass (spicebush, american_hazelnut, sunchoke, stinging_nettle,
// greenbrier, pokeweed, maypop, wild_cherry, serviceberry, groundnut,
// american_ginseng, wild_ginger). rare_herb stays intentionally uncovered.
//
// TEXT SURGERY, not re-serialization: the existing 28 entries stay byte-identical.
// The file is pure ASCII (non-ASCII escaped as \uXXXX); the new copy is ASCII-only.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const P = path.join(__dirname, '..', 'src', 'data', 'books.json');
const raw = fs.readFileSync(P, 'utf8');

if (!raw.endsWith('  }\n]\n')) {
  console.error('unexpected tail; aborting. tail=' + JSON.stringify(raw.slice(-40)));
  process.exit(1);
}
// sanity: no sibling edits since HEAD (append-only => the diff must add lines only)
const diff = execSync('git diff HEAD -- src/data/books.json', { cwd: path.join(__dirname, '..') }).toString();
const removed = diff.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---'));
if (removed.length) {
  console.error('sibling removed lines present; aborting.');
  removed.slice(0, 10).forEach(l => console.error(l));
  process.exit(1);
}

const entries = [
  {
    id: 'peddlers_sample_tin',
    name: "The Peddler's Sample Tin",
    description: "a dented sample tin, paper packets labeled in looping salesman's script, half the packets empty",
    plants: ['spicebush', 'american_hazelnut'],
    level: 2,
    flavor: "'Two for a song, friend. The song is extra.'",
  },
  {
    id: 'nanas_tuber_cards',
    name: "Nana's Tuber Cards",
    description: 'a rusted tin of index cards, every card in the same shaky pencil, every card about roots',
    plants: ['sunchoke', 'groundnut'],
    level: 2,
    flavor: "'Card 12: If the ground is still hard, wait. The waiting is the hard part.'",
  },
  {
    id: 'crayon_herbarium',
    name: 'The Crayon Herbarium',
    description: "a kid's sketchbook, green crayon tangles on every page, one plant circled in red",
    plants: ['stinging_nettle', 'greenbrier'],
    level: 2,
    flavor: "'The red-circled one is MEAN. The thorny one is just pointy.'",
  },
  {
    id: 'june_notebook',
    name: 'The June Notebook',
    description: 'a pocket notebook, June dates on every page, the cover stained dark purple',
    plants: ['maypop', 'wild_cherry', 'serviceberry'],
    level: 2,
    flavor: "'June 9: the birds got there first. June 10: earlier. June 11: EARLIER.'",
  },
  {
    id: 'wardens_notebook',
    name: "The Warden's Notebook",
    description: 'a warden\'s field notebook, three pages flagged with red tape, the rest blank',
    plants: ['pokeweed', 'american_ginseng', 'wild_ginger'],
    level: 3,
    flavor: "'Counted, not collected. Some pages stay blank on purpose.'",
  },
];

function esc(s) {
  // match the file's existing escaping style: pure ASCII, \uXXXX for non-ASCII
  return s.replace(/[\u0080-\uFFFF]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

const blocks = entries.map(e => {
  const plantLines = e.plants.map(p => `        "${p}"`).join(',\n');
  return [
    '  {',
    `    "id": "${e.id}",`,
    `    "name": ${JSON.stringify(e.name)},`,
    `    "description": ${JSON.stringify(esc(e.description))},`,
    '    "unlocks": {',
    '      "plants": [',
    plantLines,
    '      ],',
    `      "level": ${e.level}`,
    '    },',
    `    "flavor": ${JSON.stringify(esc(e.flavor))}`,
    '  }',
  ].join('\n');
});

// names/descriptions/flavors are ASCII-only already; esc() is belt-and-suspenders.
const out = raw.slice(0, -3) + ',\n' + blocks.join(',\n') + '\n]\n';
// raw ends '  }\n]\n' (6 chars: '  }\n' + ']\n'); slice(0,-3) drops ']\n', leaving '  }\n'.

// validate: parses, and non-ASCII check
if (/[^\x00-\x7F]/.test(out)) {
  console.error('non-ASCII byte introduced; aborting.');
  process.exit(1);
}
const parsed = JSON.parse(out);
if (parsed.length !== 33) {
  console.error('expected 33 entries, got ' + parsed.length);
  process.exit(1);
}
fs.writeFileSync(P, out);
console.log('appended 5 books; total entries:', parsed.length);
