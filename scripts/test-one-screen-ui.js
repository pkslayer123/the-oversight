// One-screen UI audit test: verify the layout changes hold.
// - #inlineslot is immediately after .ord-grid in DOM
// - No scrollIntoView calls in app.js
// - No #announce, #tileinfo, #x-share in game screen
// - Log shows max 3 lines
// - Person card has collapsible details

const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../src/js/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../src/css/main.css'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ FAIL: ${name}`); }
}

console.log('One-screen UI audit:');

// 1. No scroll-snapping
check('no scrollIntoView in app.js', !appJs.includes('scrollIntoView'));

// 2. inlineslot right after grid in DOM
const gridIdx = appJs.indexOf('class="detail ord-grid"');
const slotIdx = appJs.indexOf('id="inlineslot"');
const ctxIdx = appJs.indexOf('class="ord-ctx"');
const selfIdx = appJs.indexOf('class="ord-self"');
const statusIdx = appJs.indexOf('class="ord-status"');
check('inlineslot exists', slotIdx > 0);
check('inlineslot after grid', slotIdx > gridIdx);
check('inlineslot before context bar', slotIdx < ctxIdx);
// 2b. Action order (Steve): status bars -> personal actions -> environment.
// DOM order matches so the sequence holds even if flex ordering fails.
check('status bar before self bar in DOM', statusIdx > 0 && statusIdx < selfIdx);
check('self bar before context bar in DOM', selfIdx < ctxIdx);
check('CSS: ord-status order 1', /\.ord-status\s*\{\s*order:\s*1/.test(css));
check('CSS: ord-self before ord-ctx', /\.ord-self\s*\{\s*order:\s*5\.5/.test(css) && /\.ord-ctx\s*\{\s*order:\s*6/.test(css));
check('CSS: self buttons 48px touch targets', css.includes('min-height: 48px'));

// 3. Killed elements
check('no #announce in game screen', !appJs.includes('id="announce"'));
check('no #tileinfo div', !appJs.includes('id="tileinfo"'));
check('no game-screen share link', !appJs.includes('ord-share'));
check('no x-share wiring', !appJs.includes("getElementById('x-share')"));

// 4. Log shows 3 lines
check('log slices last 3', appJs.includes('st.log.slice(-3)'));

// 5. Person card collapsible
check('person details collapsible', appJs.includes('class="person-details"'));

// 6. Tutorial dismissible
check('tutorial uses localStorage', appJs.includes('oversight_tutorial_done'));
check('taphint has dismiss button', appJs.includes('taphint-x'));

// 7. CSS order: inline right after grid
check('CSS: ord-inline order 5', /\.ord-inline\s*\{\s*order:\s*5/.test(css));
check('CSS: ord-grid order 4', /\.ord-grid\s*\{\s*order:\s*4/.test(css));
check('CSS: no ord-daypart', !css.includes('.ord-daypart'));
check('CSS: no ord-tileinfo', !css.includes('.ord-tileinfo'));
check('CSS: no ord-share', !css.includes('.ord-share'));

// 8. Compact buttons
check('CSS: 2-col button grid', css.includes('.inlinecard .inline-btns .btn.sm'));

// 9. Log shrunk
check('CSS: log max-height reduced', css.includes('max-height: 84px'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
