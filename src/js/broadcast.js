// @ontology
// system: broadcast
// description: The television mechanism — BROADCAST MODE. When a show, contest watch-beat, ratings summons, or Death Reel moment airs, the game becomes a TV screen: entry title card, persistent LIVE bug, broadcast-treated grid (scanlines + vignette + screen frame), running alien commentary in a ticker, lower-third name cards, CUT TO transitions, crowd reactions. Entry and exit are ALWAYS explicit — the player never wonders whether they're playing or watching. TV never kills (canon).
// provides:
//   - broadcastStart(kind, meta) -> bool (entry card + frame on; idempotent)
//   - broadcastBeat(beatName, ac) -> line|null (commentary tied to the actual beat)
//   - broadcastEnd() -> bool (exit card + frame off; idempotent)
//   - broadcastReplay() (Death Reel slow-mo treatment + commentary, inside a live broadcast)
//   - broadcastLowerThird(name, title) (playful lower-third name card)
//   - broadcastTickerHTML() -> html (commentary ticker bar for the modal)
//   - broadcastWatching(ac) -> bool (player is watching, not in it)
//   - broadcastCrowd(mood) -> emoji (crowd-reaction row)
//   - BROADCAST_LINES (commentary pools — two alien voices; NAMES ARE STEVE'S COINAGE, flagged)

(function attachBroadcast() {
  const G = globalThis.Scattering.Game;

  // COMMENTATOR NAMES ARE STEVE'S COINAGE (flagged 2026-10-09). Until he
  // names them, they go by role titles.
  const PBP = '🎙️ PLAY-BY-PLAY';
  const COLOR = '🎨 COLOR';

  // BROADCAST_LINES: the comedy engine is aliens profoundly misunderstanding
  // humans — food bafflement, fear confusion, sleep, hugs, social ritual.
  // Register: big brother + chilling benefactor + disdain (the chill is the
  // scary part). Each entry: [voice, text]. {show} is replaced with the show
  // name, {name} with the pulled villager's display name.
  G.BROADCAST_LINES = {
    declare: [
      [PBP, 'And we are LIVE across seventeen systems! Tonight: {show}. Try to contain yourselves.'],
      [COLOR, 'Do they know we can see them? ...They do? And they continue? Fascinating.'],
      [PBP, 'The cameras are warm, the audience is restless, and someone in sector nine just spilled their nutrient paste.'],
      [COLOR, 'Remind me why they put flavored matter in their mouths. For PLEASURE? The file says pleasure.'],
      [PBP, "Tonight's subject was chosen by our infallible metrics. There is no appeal. There is only television."],
      [COLOR, 'I have studied the "hug." Two humans press their front parts together to signal... safety? I remain unconvinced.'],
    ],
    pull: [
      [PBP, 'The cameras have CHOSEN. There is no higher honor. There is also no appeal.'],
      [COLOR, "Why this one? The metrics say 'watchability.' I asked what that means. They told me to stop asking."],
      [PBP, '{name} is going on television! The village will talk about this for DAYS.'],
      [COLOR, 'Popular is not good, little ones. Popular is just what we like to see. Remember that.'],
    ],
    tension: [
      [PBP, 'The tension is — wait, is that fear? The little ones are leaking fear from their faces again.'],
      [COLOR, 'Why is the small one vibrating? Is it broken? Should we fix it? ...We are not supposed to fix them. Right.'],
      [PBP, 'Something is about to happen. I can feel it in my secondary cortex.'],
      [COLOR, 'They keep touching each other. With their HANDS. On purpose. For comfort?? The file says "hug." I do not like it.'],
      [PBP, 'The chat is screaming. I do not know what the chat wants. The chat never knows what it wants.'],
      [COLOR, 'It sleeps a THIRD of its life. A third! Imagine the ratings if it just... did not.'],
    ],
    triumph: [
      [PBP, 'INCREDIBLE! The galaxy is on its feet! Well — those of us with feet.'],
      [COLOR, 'It did the thing! Should we be proud? I feel something. Is this pride? Log it.'],
      [PBP, 'The numbers are SPIKING. Somewhere a producer is crying nutrient paste.'],
      [COLOR, 'We helped, obviously. Our benevolence is the real story here.'],
    ],
    embarrassment: [
      [PBP, 'Oh no. Oh no no no. The clip of this will outlive the star it is orbiting.'],
      [COLOR, 'It is experiencing... what is the word... "shame." Delicious. The audience LOVES shame.'],
      [COLOR, 'We should help it. ...No wait, the manual says the shame IS the content.'],
      [PBP, 'The village will quote this back at them forever. We made sure of it. You are welcome.'],
    ],
    deathreel: [
      [PBP, '📼 And now — the Death Reel. Let us watch them almost die. Again. In slow motion.'],
      [COLOR, 'This is the one where it ran from the small furry thing. Play it twice.'],
      [PBP, 'Every frame is a reminder: we keep them alive for moments like this. Benevolence!'],
      [COLOR, 'Freeze it there. Look at its face. That is the face of "content."'],
    ],
    summons: [
      [PBP, 'BREAKING: the numbers are soft and the System is NERVOUS. Someone will provide a moment.'],
      [COLOR, 'We need a STUNT. Something with fire. They like fire. Everything likes fire.'],
      [PBP, 'Refuse on camera, and the refusal IS the show. There is no outside the show.'],
    ],
    together: [
      [COLOR, 'The whole group, together. Like a... what do they call it... "family." Aww. Disgusting. Keep watching.'],
      [PBP, 'A watch party! The snacks are real. The stakes are not. This is the good part of being watched.'],
      [COLOR, 'They share food VOLUNTARILY. No cameras forced this. ...The cameras are here, but still.'],
    ],
    // REFUSED (break-it shows r2 2026-10-10): the outcome beat for a
    // refused summons/show ('SHOW_REFUSED') used to fall through
    // classifyBeat into the generic pool — the commentators called a
    // defiant no with a shrug, against the "tied to the actual result,
    // never a generic line" rule. A refusal is its own kind of content;
    // it gets its own commentary.
    refused: [
      [PBP, 'They said NO. On camera. In front of everyone. Is the broadcast still running? It is still running.'],
      [COLOR, 'The refusal IS the content. We have filed their defiance under: interesting. We will watch them harder now.'],
      [PBP, 'The System does not punish refusals. The System REMEMBERS refusals. Different thing. Probably.'],
      [COLOR, 'It looked straight into the lens and said no. I felt something. Disdain? No — ...interest. Log it.'],
    ],
    generic: [
      [PBP, 'The galaxy watches. The galaxy judges. The galaxy snacks.'],
      [COLOR, 'Note: they wave at the cameras now. They have learned. I am so proud. So, so proud.'],
      [PBP, 'Stay tuned. There is no other channel. There has never been another channel.'],
    ],
  };

  // beat name -> commentary type. Tied to the ACTUAL beat being presented,
  // never a random generic line.
  function classifyBeat(beatName) {
    const b = String(beatName || '');
    if (/deathreel|replay|judging/i.test(b)) return 'deathreel';
    if (/summons/i.test(b)) return 'summons';
    if (/declare|pull/i.test(b)) return 'declare';
    if (/escalate|climax/i.test(b)) return 'tension';
    if (/won|triumph|fans/i.test(b)) return 'triumph';
    if (/lost|shame|embarrass/i.test(b)) return 'embarrassment';
    if (/refus/i.test(b)) return 'refused'; // the no is the content — never a generic shrug
    if (/mixed|both|together|watch/i.test(b)) return 'together';
    if (/win/i.test(b)) return 'triumph';
    if (/lose/i.test(b)) return 'embarrassment';
    return 'generic';
  }

  function fill(line, ctx) {
    return String(line)
      .split('{show}').join((ctx && ctx.showName) || 'the show')
      .split('{name}').join((ctx && ctx.name) || 'our guest');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // broadcastStart(kind, meta): the frame goes ON. kind: 'show' |
  // 'contest-watch' | 'summons'. meta: {showId, showName, participant}.
  // Idempotent — calling twice updates meta, never double-fires the card.
  G.broadcastStart = function(kind, meta) {
    meta = meta || {};
    const st = this.state || {};
    if (st.broadcast && st.broadcast.live) {
      st.broadcast.kind = kind || st.broadcast.kind;
      if (meta.showName) st.broadcast.showName = meta.showName;
      if (meta.participant) st.broadcast.participant = meta.participant;
      return true;
    }
    st.broadcast = {
      live: true,
      kind: kind || 'show',
      showId: meta.showId || null,
      showName: meta.showName || 'the show',
      participant: meta.participant || 'together',
      ticker: [],
      lineIdx: 0,
    };
    this.state = st;
    // The frame: grid becomes a TV screen (CSS reads body.broadcasting).
    try {
      if (typeof document !== 'undefined' && document.body) {
        document.body.classList.add('broadcasting');
      }
    } catch (e) {}
    // Entry: title card via the drama overlay (~2s), then the persistent frame.
    try { this.drama('broadcast', { type: 'entry', showName: st.broadcast.showName, kind: kind }); } catch (e) {}
    const pname = meta.participant === 'player' ? 'YOU'
      : meta.participant === 'together' ? 'the whole village'
      : (meta.participant ? this.displayName(meta.participant) : 'tonight\'s guest');
    this.sysSay(`📺 ● LIVE — ${st.broadcast.showName}. ${pname} ${meta.participant === 'together' ? 'are' : 'is'} on television.`);
    this.sysSay('📺 You are WATCHING. This is a scene playing out — not your life. Nobody dies on television. That is the rule. Probably.');
    // Lower third for a pulled villager.
    if (meta.participant && meta.participant !== 'player' && meta.participant !== 'together') {
      try { this.broadcastLowerThird(this.displayName(meta.participant), this.broadcastGuestTitle()); } catch (e) {}
      try { this.broadcastBeat('__pull', { name: this.displayName(meta.participant) }); } catch (e) {}
    }
    return true;
  };

  // broadcastBeat(beatName, ac): commentary follows the beat being
  // presented. Returns the [voice, text] line, or null when not live.
  // Deterministic rotation (lineIdx) — tests are reproducible, and the
  // variety comes from the beats themselves, not a dice roll.
  G.broadcastBeat = function(beatName, ctx) {
    const st = this.state || {};
    const bc = st.broadcast;
    if (!bc || !bc.live) return null;
    let type = classifyBeat(beatName);
    // '__pull' is the synthetic pull beat — always the pull pool.
    if (beatName === '__pull') type = 'pull';
    const pool = (this.BROADCAST_LINES && this.BROADCAST_LINES[type]) || this.BROADCAST_LINES.generic;
    const raw = pool[bc.lineIdx % pool.length];
    bc.lineIdx++;
    const line = [raw[0], fill(raw[1], {
      showName: bc.showName,
      name: (ctx && ctx.name) || (bc.participant && bc.participant !== 'player' && bc.participant !== 'together'
        ? this.displayName(bc.participant) : 'our guest'),
    })];
    // CUT TO: the camera language — every new beat is a new shot.
    const cut = (type === 'declare' || type === 'pull') ? '🎬 CUT TO: ' : '';
    bc.ticker.push({ voice: line[0], text: cut + line[1], type: type, crowd: this.broadcastCrowd(type) });
    if (bc.ticker.length > 6) bc.ticker.splice(0, bc.ticker.length - 6);
    try { this.sysSay(`📺 ${line[0]}: ${cut}${line[1]}`); } catch (e) {}
    return line;
  };

  // broadcastCrowd(mood): the crowd-reaction row — villager emoji reacting.
  G.broadcastCrowd = function(mood) {
    const rows = {
      triumph: '👏🎉🤩👏',
      embarrassment: '😬😱🤭',
      tension: '😲😰👀',
      deathreel: '👀📼😱',
      declare: '👀🍿👀',
      pull: '😲👏😲',
      summons: '😬👀',
      together: '🍿😊👏',
      refused: '😲🤫👀',
      generic: '👀',
    };
    return rows[mood] || rows.generic;
  };

  // broadcastReplay(): the Death Reel moment — slow-mo treatment inside a
  // live broadcast. Called from _contestVerdict's judging beat.
  G.broadcastReplay = function() {
    const st = this.state || {};
    if (!st.broadcast || !st.broadcast.live) return false;
    try { this.drama('broadcast', { type: 'replay' }); } catch (e) {}
    this.broadcastBeat('__replay', {});
    return true;
  };

  // broadcastLowerThird(name, title): "MARA — Villager, Doomed" style.
  // Titles stay playful — the show's tone, not a threat display.
  G.broadcastLowerThird = function(name, title) {
    try { this.drama('broadcast', { type: 'lowerthird', name: name, title: title }); } catch (e) {}
    return true;
  };

  // Playful guest titles for pulled villagers. Rotating, deterministic.
  G.broadcastGuestTitle = function() {
    const titles = [
      'Villager, Doomed', 'Local Legend (Pending)', 'Audience Favorite?',
      'Here Against Their Will', 'Snack Provider', 'Galaxy\'s New Friend',
      'Doomed But Make It TV', 'The Metrics Have Spoken',
    ];
    const st = this.state || {};
    const bc = st.broadcast || {};
    return titles[(bc.lineIdx || 0) % titles.length];
  };

  // broadcastEnd(): the frame comes OFF. ALWAYS explicit — the exit card
  // fires, the LIVE bug lifts, the grid is a grid again. Idempotent.
  G.broadcastEnd = function() {
    const st = this.state || {};
    const bc = st.broadcast;
    if (!bc || !bc.live) return false;
    st.broadcast = null;
    try {
      if (typeof document !== 'undefined' && document.body) {
        document.body.classList.remove('broadcasting');
      }
    } catch (e) {}
    try { this.drama('broadcast', { type: 'exit' }); } catch (e) {}
    this.sysSay('📺 Broadcast over — back to your life.');
    return true;
  };

  // broadcastWatching(ac): is the player watching (not in it)?
  G.broadcastWatching = function(ac) {
    if (!ac) return false;
    const p = ac.participant;
    return p !== 'player';
  };

  // broadcastTickerHTML(): the commentary ticker bar, rendered into the
  // contest modal by app.js. Pure render — safe to call every frame.
  G.broadcastTickerHTML = function() {
    const st = this.state || {};
    const bc = st.broadcast;
    if (!bc || !bc.live || !bc.ticker.length) return '';
    const items = bc.ticker.slice(-3).map(t =>
      `<span class="ticker-item"><span class="ticker-voice">${esc(t.voice)}</span> ${esc(t.text)} <span class="ticker-crowd">${esc(t.crowd)}</span></span>`
    ).join('<span class="ticker-sep"> ● </span>');
    // Duplicated for the seamless marquee loop (translateX -50%).
    const loop = items + '<span class="ticker-sep"> ● </span>' + items;
    return `<div class="broadcast-ticker"><span class="ticker-live">📺 LIVE</span><div class="ticker-scroll"><div class="ticker-inner">${loop}</div></div></div>`;
  };
})();
