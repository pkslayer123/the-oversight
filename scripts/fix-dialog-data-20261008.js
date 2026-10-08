// Data fixes for dialog honest-opt-out (Steve 2026-10-08).
// Surgical text replacements on characterGen.json — exact-match asserted,
// no full JSON re-serialization (avoids whole-file churn).
const fs = require('fs');
const path = 'src/data/characterGen.json';
let t = fs.readFileSync(path, 'utf8');
let n = 0;
function rep(oldStr, newStr, note) {
  const count = t.split(oldStr).length - 1;
  if (count !== 1) throw new Error('MATCH ' + count + ' (want 1) for: ' + note + ' :: ' + oldStr.slice(0, 80));
  t = t.replace(oldStr, newStr);
  n++;
  console.log('ok:', note);
}

// 1. q_origin a_deflect: guilt-trip react -> graceful acceptance
rep(
  '"react": "A pause. \\"Okay.\\" Something shutters, just slightly. They wanted to know you."',
  '"react": "\\"Okay.\\" A nod. \\"Some things you keep. I get that.\\""',
  'q_origin a_deflect guilt-trip'
);
// 2. q_teach_me a_tell: backwards react (NPC "shows you" when YOU teach THEM) + woodcraft presumption
rep(
  '"label": "\\"Okay. Watch my hands. This is how you tell if wood\'s seasoned enough to burn clean...\\""',
  '"label": "\\"Okay — here\'s one small useful thing I know. Watch.\\""',
  'q_teach_me a_tell label'
);
rep(
  '"react": "They show you, patient. You feel the knowledge land — small, solid, yours now."',
  '"react": "They watch, intent, then try it themselves. \\"Huh. That actually works.\\" A grin — student and teacher trade places for a minute."',
  'q_teach_me a_tell backwards react'
);
// 3. q_skill a_tell: mechanical-skill presumption
rep(
  '"label": "\\"I can fix almost anything mechanical. People are surprised.\\""',
  '"label": "\\"I\'m better with my hands than people expect. You\'ll see.\\""',
  'q_skill a_tell presumption'
);
// 4. q_guilty a_tell: food-theft presumption (mirror q_fight's no-details pattern)
rep(
  '"label": "\\"I took food from someone who needed it more. I tell myself I\'d do it again. I\'m not sure.\\""',
  '"label": "\\"Yes. I don\'t want to get into what. But yes.\\""',
  'q_guilty a_tell presumption'
);
// 5. q_kindness a_tell: presumes the event happened to the player
rep(
  '"label": "\\"Shared their food when they didn\'t have enough either. Didn\'t make a thing of it. Just... did it.\\""',
  '"label": "\\"I\'ve watched people share food they couldn\'t spare. Quiet. No performance. Just... did it.\\""',
  'q_kindness a_tell presumption'
);
// 6. q_laugh_memory a_tell: "Yesterday" presumption
rep(
  '"label": "\\"Yesterday. Someone tripped over nothing and we all lost it. It felt like stealing.\\""',
  '"label": "\\"Recently — someone tripped over nothing and we all lost it. It felt like stealing.\\""',
  'q_laugh_memory a_tell presumption'
);
// 7. q_alone_time a_deflect react: judgy ("Cold, but practical... don't forget how to be a person")
rep(
  '"react": "\\"Practical. Cold, but practical. Just don\'t forget how to be a person in the meantime.\\""',
  '"react": "\\"Practical. Fair — the woods aren\'t kind to wanderers. Just... come back for the fire sometimes, yeah?\\""',
  'q_alone_time a_deflect judgy react'
);
// 8. q_fight a_deflect react: "something stays in the air"
rep(
  '"react": "\\"You\'re right. I\'m sorry. Forget I asked.\\" They let it go, but something stays in the air."',
  '"react": "\\"You\'re right. I\'m sorry. Forget I asked.\\" And they mean it — the subject drops, clean."',
  'q_fight a_deflect sting'
);
// 9. q_first_memory a_deflect react: "a little too fast"
rep(
  '"react": "\\"Curious. Sorry. Forget I asked.\\" They change the subject, a little too fast."',
  '"react": "\\"Curious, is all. Sorry — forget I asked.\\" They let it go, easy."',
  'q_first_memory a_deflect sting'
);
// 10. q_stay a_deflect react: "the fact that you went there"
rep(
  '"react": "\\"No, no — just asking. But the fact that you went there... keep me posted, yeah?\\""',
  '"react": "\\"No, no — just asking. Idle curiosity, I swear.\\""',
  'q_stay a_deflect guilt prod'
);

// 11. honest_opt_out flags on genuine boundary/can't-answer data answers
// (engine appends its own opt-out only when none is flagged).
const flags = [
  ['q_theory', 'a_shrug'], ['q_regret', 'a_vague'], ['q_guilty', 'a_vague'],
  ['q_first_memory', 'a_vague'], ['q_first_week', 'a_blur'], ['q_dream', 'a_none'],
  ['q_stay', 'a_vague'], ['q_left_behind', 'a_unknown'], ['q_plan', 'a_quiet'],
  ['q_useful', 'a_learning'], ['q_before_skill', 'a_vague'], ['q_laugh', 'a_nothing'],
  ['q_quiet', 'a_leave'], ['q_hands', 'a_deflect'], ['q_origin', 'a_deflect'],
];
for (const [qid, aid] of flags) {
  // Scope to the question's own block: first "id": "aid", after "id": "qid".
  // Guard: the span must not cross into another question ("id": "q_...").
  const qRe = new RegExp('"id": "' + qid + '"[\\s\\S]*?"id": "' + aid + '",');
  let done = false;
  t = t.replace(qRe, (m) => {
    if (done) return m;
    const innerQ = (m.match(/"id": "q_[a-z_]+"/g) || []).length;
    if (innerQ !== 1) throw new Error('flag span crosses questions for ' + qid + '/' + aid);
    done = true;
    const needle = '"id": "' + aid + '",';
    const idx = m.lastIndexOf(needle);
    return m.slice(0, idx) + needle + '\n            "honest_opt_out": true,' + m.slice(idx + needle.length);
  });
  if (!done) throw new Error('no match for flag ' + qid + '/' + aid);
  n++;
  console.log('ok: flag', qid + '/' + aid);
}

fs.writeFileSync(path, t);
console.log('TOTAL REPLACEMENTS:', n);
// validate JSON still parses and question/answer counts are intact
const cg = JSON.parse(t);
const qs = cg.convo.questions;
console.log('questions:', qs.length, '| answers:', qs.reduce((s, q) => s + q.answers.length, 0));
