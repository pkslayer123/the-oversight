// @ontology
// system: contests
// description: Alien TV contests and shows that interrupt village life. Contests are FEARED high-risk events; shows are gossip/drama. UNAVOIDABLE — they interrupt whatever you're doing.
// provides:
//   - contestEligible() -> {eligible, reason}
//   - contestTick() -> event|null
//   - contestPool()
//   - pickContest()
//   - pickShow()
//   - fireShow(show) -> show (pull-away: a villager goes on TV for a silly reason)
//   - fireContest(contest)
//   - resolveContest()
//   - contestInterruption(contest, participant) -> sequence
//   - contestKnowledge(contestId) -> {seen,wins,level}
//   - contestLearn(contestId, outcome)
//   - _contestScaled(base, variant) -> contest (wave + hardened, both ends of fire->resolve)
//   - _cxStorePhase(ac, idx, rendered) -> rendered (choice box renders ac.phases directly)
//   - _contestDeathLine(contest, how, pname)
//   - _contestRenderPhase(ac, phase, idx)
//   - _contestCloserOdds(kind, wounds)
//   - _contestVerdict(ac) -> multi-participant watch-mode verdict roll (risk-scaled win/lose/die each, cheer-adjusted, bet payout, comfort) (code: _contestVerdict, Steve 2026-10-06)
//   - _contestResolveOthers(ac) -> fates for villagers taken alongside the player (code: _contestResolveOthers, Steve 2026-10-06)
//   - _cxNameList(ids, capPlayer) -> "Mara" / "Mara and Tove" / "Mara, Tove and Sef"
//   - _cxTakenLine(ids) -> taken announcement (single or multi)
//   - _cxPluralBeats(text, name) -> verb-agreement fix for multi-take watch beats
//   - _cxKillContestant(pid) -> real roster removal for contest deaths (removeVillager wrapper is a no-op)
//   - _contestWatchBeat(contest, pname) -> [setup, turn, ending] contest-specific watch beats (Steve 2026-10-06)
//   - _cxCoaching(contest)
//   - _cxPhaseSay(text)
//   - _contestTithe(contest) -> phases (knowledge-gated measure)
//   - _contestSiege(contest) -> phases
//   - _contestMaw(contest) -> phases
//   - _contestOath(contest) -> phases
//   - _contestBeastmaster(contest) -> phases
//   - _contestRiddle(contest) -> phases (memory-cost puzzle)
//   - _contestConfession(contest) -> phases (social-fear detective)
//   - _contestHoney(contest) -> phases (swarm forage)
//   - _contestSecrets(contest) -> phases (secret-cost chance)
//   - _contestQuiet(contest) -> phases (involuntary thought broadcast; knowledge-gated defense; social costs)
//   - _contestGuest(contest) -> phases (televised alien dinner; knowledge-gated palate/etiquette)
//   - _contestVigil(contest) -> phases (night watchpost; stillness discipline; alarm ends the vigil)
// rules:
//   - unlock_day: 14 (code: contestTick, contestEligible)
//   - eligible_villagers: alive + member in good standing + fighting age 15-72, player alive/health>0/not exiled (code: contestEligible, Steve 2026-10-06)
//   - weekly_budget: 2 combined contests+shows (code: contestTick)
//   - daily_chance: 0.3 (code: contestTick)
//   - contest_vs_show_ratio: 0.6 (code: contestTick)
//   - system_whim_chance: 0.1 random participant override (code: fireContest)
//   - countdown_days: 1 (code: fireContest)
//   - unavoidable: true — contests interrupt, cannot be skipped (code: contestInterruption, Steve 2026-10-05)
//   - recast_dead: countdown outlives contestant → each missing contestant recast from living eligible, or cancelled if no one is left (code: resolveContest, Steve 2026-10-06)
//   - multi_take: contest.participants count is REAL — the System takes that many people at once (more taken = more FEARED); pc.participants[] carried fire->resolve->interruption (code: fireContest, resolveContest, contestInterruption, Steve 2026-10-06)
//   - others_fates: villagers taken alongside the player get their own off-screen contests — rolled at the player's sequence end, can win/lose/die (code: _contestResolveOthers, _contestEnd, _contestDie, _contestRefuse, Steve 2026-10-06)
//   - bespoke_death_lines: every contest kills in its own voice — the generic fallback is placeholder text, not doctrine (code: _contestDeathLine, Steve 2026-10-05); price/impress/exchange/auction lines added 2026-10-06
//   - death_is_real: contest deaths remove the villager from the roster via _cxKillContestant (removeVillager is an unhooked no-op wrapper; the old else-fallback never ran) (code: _cxKillContestant, _contestDie, _contestResolveOthers, Steve 2026-10-06)
//   - watcher_agency: watch choices have real consequences — cheer moves win odds (+5%/+10% veteran, cap +15%, cameras notice), study teaches, bets are real kcal (2x payout on the first taken), comfort lands as trust/mourning (code: _contestWatchPhases, contestChoose, _contestVerdict, Steve 2026-10-06)
//   - choice_sometimes: player may get choice to participate, usually grabbed (code: fireContest, Steve 2026-10-05)
//   - watch_mode: non-participants watch as a show (code: contestInterruption, Steve 2026-10-05)
//   - watched_deaths: watch verdict rolls risk-scaled death — villagers can die on camera (code: _contestVerdict, Steve 2026-10-06)
//   - watch_beats_specific: each contest gets its own 3 watch beats (setup/turn/ending) — the fiction of THAT contest, not generic filler; veteran watchers get a coaching line (code: _contestWatchBeat, _contestWatchPhases, Steve 2026-10-06); price/impress/exchange/auction beats added — generic fallback no longer reachable by any pool contest (code: _contestWatchBeat T table, Steve 2026-10-06)
//   - single_prefix: phase texts carry their own 📺 prefix; _cxPhaseSay never doubles it (code: _cxPhaseSay, Steve 2026-10-05)
//   - wounds_feed_closer: gauntlet closer death odds scale with damage taken in waves 1-2, displayed by the System (code: _contestCloserOdds, _contestRenderPhase, contestChoose dieWounds, Steve 2026-10-05)
//   - contest_knowledge: repeats build codex.contests levels 1-3; level 2 unlocks coaching in the intro, level 3 (veteran) reads hits coming (code: contestLearn, _cxCoaching, contestChoose, Steve 2026-10-05)
//   - social_costs: do.fracture/do.unity shift the leadership ledger — winning can cost the village (code: contestChoose, Steve 2026-10-06)
//   - template_prize: every playable WIN choice carries prize:true — winners get the alien-loot prize path (templates were missing it, bespoke always had it) (code: contestPlayable, contestChoose, Steve 2026-10-06)
//   - watch_coaching_all: veteran watchers (codex level 2+) get a 📚 coaching line on the last watch beat for all 16 knowledge-gated contests — tithe/riddle first, siege/maw/oath/beastmaster/confession/honey/secrets added, then quiet/guest/vigil, then sorting/witness/cache/longodds (code: _contestWatchBeat, Steve 2026-10-06)
//   - risk_rebalance_20261006: HIGH RISK rebalance — brave choices now usually kill (~50% death across full aggressive runs), smart choices live but cost heavily. Pit aggressive: 0.08/0.12 -> 0.20/0.30. Hide: 0.20/0.18/0.25 -> 0.32/0.25/0.38. Siege/hold: 0.20 -> 0.30. Rewards NOT nerfed — high risk justifies high reward (code: contestChoose die odds, Steve 2026-10-06)
//   - pool_expansion_20261006c: four NEW competition styles (Steve 2026-10-06) — price (moot/extreme: sacrifice, village chooses who pays), impress (weird/medium: creative, make aliens feel something new), exchange (endurance/high: team vs team village relay), auction (chance/high: bid memories/years/parts, everyone pays). NOT reskins: price is social horror not trial (moot); impress is creation not performance (cookfight); exchange is team not solo (drop); auction is economic not random (lottery) (code: contestPool, contestPlayable, Steve 2026-10-06)
//   - pool_expansion_20261006b: the four smallest pools (puzzle/detective/forage/chance, 3 each) each gain a bespoke variant — sorting (conveyor triage), witness (fabrication hunt), cache (audit heist), longodds (push-your-luck dice). NOT reskins: sorting is triage-under-time not Q&A (riddle); witness is forgery-forensics not liar-hunting (informant); cache is hiding not gathering (calorie_run); longodds is stakes-escalation not pure draw (lottery) (code: contestPool, contestPlayable, Steve 2026-10-06)
//   - beat_audio: every contest beat fires a named audioEvent that resolves — new beats are composed, named dispatches over already-registered Game.audio synths, lazy-registered on first fire (Game.audio doesn't exist until app.js loads, after contests.js); phases declare beat:'name', _contestRenderPhase fires it (code: _cxBeat, _contestRenderPhase, Steve 2026-10-06); price/impress/exchange/auction beats now resolve (justiceVerdict+exileWalk, levelup+contestSpared, contestCall+rushHit, contestCall+horrorSting) — were silent no-ops (code: CX_BEAT_DEFS, Steve 2026-10-06)
//   - fame_is_deed: showmanship notability (TV pull-aways, camera play) surfaces as "audience favorite" in the eligibility panel (code: notability, Steve 2026-10-06)
// consumes:
//   - scholar.day
//   - state.showBudget
//   - state.pendingContest
//   - state.activeContest.participants/cheer/bet/comfort/others
//   - state.contestsSeen
//   - state.codex.contests
// CONTESTS & SHOWS (Steve 2026-10-05)
// The aliens' flagship is OVERSIGHT. Contests are its teeth. TV shows are its gossip.
// Both interrupt your life. Neither asks permission.
//
// Unlock: day 14+. Budget: max 2/week combined. Contests are FEARED.

(function() {
  const G = globalThis.Scattering.Game;

  // === ELIGIBILITY ===
  // Visible, legible. Player can always answer "who can go, and why."
  // Eligibility is REAL state, not a position check (Steve 2026-10-06):
  // alive, on the roster, not severed (isMember), of fighting age.
  // The System doesn't draft children or the very old — a rare mercy
  // that makes the rest of it scarier.
  G.contestEligible = function() {
    const day = this.state.scholar.day || 1;
    if (day < 14) return { eligible: [], reason: 'Show not yet casting (day 14+)' };

    const eligible = [];
    const roster = (this.state.village.roster || []);

    // Player: alive, not exiled, and with health to stand on. A dying
    // scholar (health<=0) is a corpse, not a contestant — but an
    // exhausted, battered scholar IS eligible. The System is not kind.
    const s = this.state.scholar;
    if (!this.state.over && (s.health || 0) > 0 && !s.exiled) {
      const notes = [];
      const nota = this.notability('player');
      if (nota.length) notes.push(...nota);
      eligible.push({ id: 'player', name: 'You', notability: nota, notes });
    }

    // Villagers: check each — alive, a member in good standing, of
    // fighting age. Notability notes are the earned "why was I picked".
    for (const rid of roster) {
      if (rid === this.villagerId) continue; // player handled above
      if (!this.isMember(rid)) continue;     // dead or severed: not drafted
      const vpos = (this.state.village.positions || {})[rid];
      if (!vpos) continue;
      const vp = this.vpOf(rid);
      const age = (vp && typeof vp.age === 'number') ? vp.age : 30;
      if (age < 15 || age > 72) continue;    // children and the very old stay
      const nota = this.notability(rid);
      eligible.push({ id: rid, name: this.displayName(rid), notability: nota, notes: [] });
    }

    return { eligible, reason: null };
  };

  // Notability: specific deeds that flag you
  G.notability = function(vid) {
    const notes = [];
    const deeds = (this.state.notability || {})[vid] || {};
    if (deeds.wave2Kill) notes.push('slew a wave-2 beast');
    if (deeds.wave3Kill) notes.push('slew a wave-3 horror');
    if (deeds.survivedMoot) notes.push('survived the Moot');
    if (deeds.heist) notes.push('pulled off a heist');
    if (deeds.contestWin) notes.push(deeds.contestWin === 1 ? 'won a contest' : `won ${deeds.contestWin} contests`);
    // Showmanship: TV pull-aways (fireShow) and camera-friendly contest play
    // both feed this. Visible in the eligibility panel — fame is a deed.
    if (deeds.showmanship) notes.push(`audience favorite${deeds.showmanship > 1 ? ` (${deeds.showmanship}×)` : ''}`);
    return notes;
  };

  G.addNotability = function(vid, deed) {
    this.state.notability = this.state.notability || {};
    this.state.notability[vid] = this.state.notability[vid] || {};
    this.state.notability[vid][deed] = (this.state.notability[vid][deed] || 0) + 1;
  };

  // === SCHEDULER ===
  // 2/week budget shared between contests and shows.
  // Runs each dawn. Returns event or null.
  G.contestTick = function() {
    const day = this.state.scholar.day || 1;
    if (day < 14) return null;

    // One interruption at a time (Steve 2026-10-06): never fire while one is
    // pending or an interruption is still unresolved — a new fire would
    // overwrite pendingContest or clobber the active modal.
    if (this.state.pendingContest) return null;
    const ac0 = this.state.activeContest;
    if (ac0 && ac0.phase !== 'done') return null;

    this.state.showBudget = this.state.showBudget || { week: 0, used: 0 };
    const week = Math.floor(day / 7);
    if (this.state.showBudget.week !== week) {
      this.state.showBudget = { week, used: 0 };
    }
    if (this.state.showBudget.used >= 2) return null; // budget exhausted
    
    // 30% chance per day of an event (if budget remains)
    // This averages ~2/week without being predictable
    if (Math.random() > 0.3) return null;
    
    const { eligible } = this.contestEligible();
    if (!eligible.length) return null;
    
    // 60% contest, 40% show
    const isContest = Math.random() < 0.6;
    const event = isContest ? this.pickContest() : this.pickShow();
    if (!event) return null;
    
    this.state.showBudget.used++;
    return event;
  };

  // === CONTEST POOL ===
  // Data-driven templates. Categories: Blood, Endurance, Moot, Weird,
  // Puzzle, Detective, Forage, Chance. (Steve 2026-10-05: expand variety)
  G.contestPool = function() {
    return [
      // BLOOD (combat) — the feared ones
      { id: 'pit', name: 'The Pit', cat: 'blood', risk: 'high',
        desc: 'Thrown into an arena with a wave-appropriate beast. Kill or be killed. The audience votes on weapons.',
        participants: 1,
        arena: '🕳️\n🪨🪨🪨🪨🪨\n🪨⬛⬛⬛🪨\n🪨⬛🦴⬛🪨\n🪨⬛⬛⬛🪨\n🪨🪨🪨🪨🪨\n👥👥👥👥👥' },
      { id: 'gauntlet', name: 'Gauntlet', cat: 'blood', risk: 'extreme',
        desc: 'Three waves, no rest. Survive all three and the crowd goes wild. Most don\'t see wave two.',
        participants: 1,
        arena: '⚔️\n🔥🔥🔥🔥🔥\n🔥⬛⬛⬛🔥\n🔥⬛⚔️⬛🔥\n🔥⬛⬛⬛🔥\n🔥🔥🔥🔥🔥' },
      { id: 'duel', name: 'Duel', cat: 'blood', risk: 'high',
        desc: 'You vs another contestant. Not to the death — to the yield. But accidents happen.',
        participants: 2,
        arena: '🤺\n➖➖➖➖➖\n⬜⬜⚔️⬜⬜\n➖➖➖➖➖\n👥👥👥👥👥' },
      // ENDURANCE (survival)
      { id: 'drop', name: 'The Drop', cat: 'endurance', risk: 'high',
        desc: 'Dropped somewhere with nothing. First back to the beacon eats. The others... walk.',
        participants: 3,
        arena: '🏔️\n⛰️⛰️⛰️⛰️⛰️\n⛰️❄️❄️❄️⛰️\n⛰️❄️🚩❄️⛰️\n⛰️❄️❄️❄️⛰️\n⛰️⛰️⛰️⛰️⛰️' },
      { id: 'starve', name: 'Hollow Belly', cat: 'endurance', risk: 'medium',
        desc: 'No food for three days. The System watches who breaks first. Water provided. Dignity not.',
        participants: 4,
        arena: '🍽️\n⬛⬛⬛⬛⬛\n⬛🍽️⬛🍽️⬛\n⬛⬛⬛⬛⬛\n⬛🍽️⬛🍽️⬛\n⬛⬛⬛⬛⬛' },
      // MOOT (social)
      { id: 'moot', name: 'The Moot', cat: 'moot', risk: 'medium',
        desc: 'Televised trial. Defend yourself against accusations (true or not). The audience is the jury.',
        participants: 1,
        arena: '⚖️\n👥👥👥👥👥\n⬜⬜🎤⬜⬜\n⬜⬜⬜⬜⬜\n👥👥👥👥👥' },
      { id: 'lies', name: 'Lie Detector', cat: 'moot', risk: 'low',
        desc: 'Answer questions. The System knows when you lie. The audience loves when you do.',
        participants: 2,
        arena: '🤥\n🔍🔍🔍🔍🔍\n⬜⬜🪑⬜⬜\n⬜⬜⬜⬜⬜\n📺📺📺📺📺' },
      // WEIRD (unhinged)
      { id: 'cookfight', name: 'Cooking With Teeth', cat: 'weird', risk: 'medium',
        desc: 'Cook a meal. The ingredients fight back. Presentation matters. Survival matters more.',
        participants: 2,
        arena: '🍳\n🔪🔪🔪🔪🔪\n🍳🦷🦷🦷🍳\n🔪🔪🔪🔪🔪\n👨‍🍳👨‍🍳👨‍🍳' },
      { id: 'fetch', name: 'Bring Us Something Interesting', cat: 'weird', risk: 'low',
        desc: 'One mile radius. One hour. Most interesting thing wins. Judged by beings who have never touched grass.',
        participants: 3,
        arena: '🔍\n🌿🌿🌿🌿🌿\n🌿❓🌿❓🌿\n🌿🌿🌿🌿🌿\n🌿❓🌿❓🌿' },
      { id: 'hide', name: 'Hide and Seek', cat: 'weird', risk: 'extreme',
        desc: 'Hide. The seeker is a wave-2 predator. It\'s very good at seeking.',
        participants: 3,
        arena: '👁️\n🌲🌲🌲🌲🌲\n🌲👤🌲👤🌲\n🌲🌲🌲🌲🌲\n🌲👤🌲🐺🌲' },
      // PUZZLE (Steve 2026-10-05)
      { id: 'box', name: 'The Box', cat: 'puzzle', risk: 'medium',
        desc: 'An alien puzzle box. Solve it or be stuck inside the arena until you do. The audience has the manual.',
        participants: 1,
        arena: '📦\n⬛⬛⬛⬛⬛\n⬛🧩🧩🧩⬛\n⬛🧩📦🧩⬛\n⬛🧩🧩🧩⬛\n⬛⬛⬛⬛⬛' },
      { id: 'pattern', name: 'Pattern Hunger', cat: 'puzzle', risk: 'low',
        desc: 'A sequence of foods. Eat them in the right order. The wrong order... disagrees with you.',
        participants: 2,
        arena: '🧩\n🍎🍌🍇🍊🍎\n❓❓❓❓❓\n🍽️🍽️🍽️🍽️🍽️' },
      // DETECTIVE (Steve 2026-10-05)
      { id: 'whoate', name: 'Who Ate It?', cat: 'detective', risk: 'low',
        desc: 'Someone stole the prize. Interrogate the suspects. The thief is among you.',
        participants: 3,
        arena: '🔍\n👤👤👤👤👤\n❓❓❓❓❓\n🍖🍖🍖🍖🍖' },
      { id: 'informant', name: 'The Informant', cat: 'detective', risk: 'medium',
        desc: 'One of you is lying about everything. Find them before they find the exit.',
        participants: 4,
        arena: '🕵️\n👤🤥👤🤥👤\n🔍🔍🔍🔍🔍\n🚪🚪🚪🚪🚪' },
      // FORAGE (Steve 2026-10-05)
      { id: 'calorie_run', name: 'Calorie Run', cat: 'forage', risk: 'medium',
        desc: 'One hour. Whoever collects the most calorie-dense materials wins. The forest is... competitive.',
        participants: 3,
        arena: '🌿\n🌳🍎🌳🍇🌳\n🌳🌿🌳🌿🌳\n🌳🍒🌳🌰🌳\n🌳🌿🌳🌿🌳' },
      { id: 'pantry_raid', name: 'Pantry Raid', cat: 'forage', risk: 'high',
        desc: 'Gather from a dangerous location. The locals object. Bring back food or don\'t come back.',
        participants: 2,
        arena: '🏚️\n⚠️⚠️⚠️⚠️⚠️\n🏚️🍖🏚️🍖🏚️\n⚠️⚠️⚠️⚠️⚠️\n🐺🐺🐺🐺🐺' },
      // CHANCE (Steve 2026-10-05)
      { id: 'wheel', name: 'Wheel of Teeth', cat: 'chance', risk: 'medium',
        desc: 'Spin the wheel. The teeth decide. The audience holds its breath.',
        participants: 1,
        arena: '🎡\n🦷🦷🦷🦷🦷\n🎡⬛⬛⬛🎡\n🦷🦷🦷🦷🦷' },
      { id: 'lottery', name: 'The Lottery', cat: 'chance', risk: 'low',
        desc: 'Pure luck. Draw a token. The audience loves an underdog.',
        participants: 5,
        arena: '🎰\n🎫🎫🎫🎫🎫\n🎰⬛⬛⬛🎰\n🎫🎫🎫🎫🎫' },
      // BLOOD, wave 2+ (Steve 2026-10-06): new feared variants
      { id: 'tithe', name: 'The Blood Tithe', cat: 'blood', risk: 'extreme',
        desc: 'Bleed into the System\'s altar, measure by measure. Too little and it finds you wanting. Too much and it keeps the rest.',
        participants: 1,
        arena: '🩸\n⬛⬛⬛⬛⬛\n⬛🩸⬛🩸⬛\n⬛⬛🏺⬛⬛\n⬛🩸⬛🩸⬛\n⬛⬛⬛⬛⬛' },
      { id: 'siege', name: 'Siege', cat: 'blood', risk: 'extreme',
        desc: 'Hold the chokepoint for three waves while the village watches from the walls. The line holds, or you don\'t.',
        participants: 1,
        arena: '🏰\n🧱🧱🧱🧱🧱\n🧱⚔️🧱⚔️🧱\n🧱🧱🧱🧱🧱\n👥👥👥👥👥' },
      // ENDURANCE, wave 2+ (Steve 2026-10-06)
      { id: 'maw', name: 'The Maw', cat: 'endurance', risk: 'extreme',
        desc: 'A dark tunnel. Something patient behind you. Walk. Don\'t stop. It counts your pauses.',
        participants: 1,
        arena: '🕳️\n⬛⬛⬛⬛⬛\n🌑🌑🌑🌑🌑\n🌑👤🌑👁️🌑\n🌑🌑🌑🌑🌑\n⬛⬛⬛⬛⬛' },
      // MOOT (Steve 2026-10-06)
      { id: 'oath', name: 'The Oath', cat: 'moot', risk: 'high',
        desc: 'Swear three binding oaths on camera. Mean every word — the binding hears the difference.',
        participants: 1,
        arena: '🤝\n📜📜📜📜📜\n⬜⬜🎤⬜⬜\n⛓️⛓️⛓️⛓️⛓️\n👥👥👥👥👥' },
      // WEIRD (Steve 2026-10-06)
      { id: 'beastmaster', name: 'Beastmaster', cat: 'weird', risk: 'high',
        desc: 'Ride a collared wave-2 beast through the obstacle course. Guide it. Do not hurt it. It remembers.',
        participants: 1,
        arena: '🦁\n🔥🔥🔥🔥🔥\n🦁➖➖➖🦁\n🔥🪤🔥🪤🔥\n👥👥👥👥👥' },
      // PUZZLE, wave 2+ (Steve 2026-10-06): the smallest pool gets deeper.
      // The Riddle Engine doesn't want blood. It wants memories.
      { id: 'riddle', name: 'Riddle Me This', cat: 'puzzle', risk: 'high',
        desc: 'Three riddles from the Riddle Engine — a floating lattice of mouths. Wrong answers cost memories. It has been reading you.',
        participants: 1,
        arena: '🌀\n👄👄👄👄👄\n⬛🧠⬛🧠⬛\n👄👄👄👄👄\n❓❓❓❓❓' },
      // DETECTIVE (Steve 2026-10-06): the fear is social — judge wrong and
      // the village buries the wrong person. Or you do.
      { id: 'confession', name: 'The Confession', cat: 'detective', risk: 'high',
        desc: 'A villager confesses on camera to poisoning the water store. Prove the confession true or false before dusk — the System punishes someone either way.',
        participants: 1,
        arena: '🎤\n👥👥👥👥👥\n⬜🪑⬜🪑⬜\n🔍🔍🔍🔍🔍\n⚖️⚖️⚖️⚖️⚖️' },
      // FORAGE (Steve 2026-10-06): a hive the size of a house. The swarm is
      // the size of weather. The honey is worth it. Probably.
      { id: 'honey', name: 'Sweet Tooth', cat: 'forage', risk: 'high',
        desc: 'Harvest honeycomb from a hive the size of a house. The swarm defends. Smoke, speed, or respect — pick one and commit.',
        participants: 1,
        arena: '🍯\n🐝🐝🐝🐝🐝\n⬛🍯⬛🍯⬛\n🐝🐝🐝🐝🐝\n🌻🌻🌻🌻🌻' },
      // CHANCE (Steve 2026-10-06): the deck is made of village secrets.
      // Winning costs relationships. The fear isn't the odds — it's the cost.
      { id: 'secrets', name: 'The Secret Deck', cat: 'chance', risk: 'medium',
        desc: 'Cards against the System\'s dealer. The deck is made of village secrets — every card drawn reveals something true about someone watching.',
        participants: 1,
        arena: '🃏\n🂡🂢🂣🂤🂥\n🎰⬛⬛⬛🎰\n👁️👁️👁️👁️👁️' },
      // CONTEST-POOL EXPANSION (Steve 2026-10-06): three new variants with
      // distinct fear/fun textures — exposure (quiet), farcical hospitality
      // (guest), stillness-under-pressure (vigil). NOT reskins: quiet is not
      // a trial (moot) — it's involuntary broadcast you can't argue with;
      // guest is not a cook-off (cookfight) — the dinner party fights back;
      // vigil is not being hunted (hide) or moving (maw) — it's holding.
      { id: 'quiet', name: 'The Quiet Room', cat: 'moot', risk: 'high',
        desc: 'One silent hour in a white room. The System reads your thoughts aloud to the village. You cannot argue with the broadcast — you can only steer what surfaces.',
        participants: 1,
        arena: '🤫\n⬜⬜⬜⬜⬜\n⬜🪑⬜🪑⬜\n⬜⬜⬜⬜⬜\n👥👥👥👥👥\n📢📢📢📢📢' },
      { id: 'guest', name: 'The Guest', cat: 'weird', risk: 'medium',
        desc: 'An alien ambassador is coming to dinner at your haven. Televised. Serve something it finds interesting, and survive an etiquette you were never taught.',
        participants: 1,
        arena: '👽\n🍽️🍽️🍽️🍽️🍽️\n⬜🕯️⬜🕯️⬜\n🍲🍲🍲🍲🍲\n👥👥👥👥👥' },
      { id: 'vigil', name: 'The Vigil', cat: 'endurance', risk: 'high',
        desc: 'One night, alone on the haven wall, the lamp lit. Below in the dark, something large is circling. Hold your post until dawn. Do not abandon the light.',
        participants: 1,
        arena: '🕯️\n⬛⬛⬛⬛⬛\n🌑🌑🌑🌑🌑\n🕯️👤🕯️👁️🕯️\n🌑🌑🌑🌑🌑\n⬛⬛⬛⬛⬛' },
      // CONTEST-POOL EXPANSION 2 (Steve 2026-10-06): the four smallest pools
      // (puzzle/detective/forage/chance — 3 each) each get a bespoke variant
      // with a distinct mechanic. NOT reskins — see the ontology rule.
      { id: 'sorting', name: 'The Sorting', cat: 'puzzle', risk: 'high',
        desc: 'The System empties your pack and the tithe crate onto a conveyor. Its sorter keeps the shiny and burns the useful. Redirect what matters before it burns.',
        participants: 1,
        arena: '🏭\n📦➡️🔥⬅️📦\n⬜⬜🏭⬜⬜\n📦📦📦📦📦\n👥👥👥👥👥' },
      { id: 'witness', name: 'The Witness', cat: 'detective', risk: 'high',
        desc: 'Three witnesses describe last night\'s attack on the trap-line. Two are true memories. One the System wrote. Name the fabrication — the village arms for whatever you name.',
        participants: 1,
        arena: '🕵️\n👤🎤👤🎤👤\n🔍🔍🔍🔍🔍\n🌲🌲🐾🌲🌲\n👥👥👥👥👥' },
      { id: 'cache', name: 'The Cache', cat: 'forage', risk: 'medium',
        desc: 'At dawn the System\'s surveyors map every hidden food cache in the valley. Tonight you move the winter store — every move the cameras catch is taxed. Move it all. Let them see nothing.',
        participants: 2,
        arena: '🌙\n📦📦📦📦📦\n🌲👤📦👤🌲\n📷📷📷📷📷\n🌙🌙🌙🌙🌙' },
      { id: 'longodds', name: 'The Long Odds', cat: 'chance', risk: 'medium',
        desc: 'Dice against the house champion — a smug alien who has never lost on camera. The dice are fair. The stakes are the game. Raise, hold, or walk — but the table is unavoidable.',
        participants: 1,
        arena: '🎲\n🎰⬛🎲⬛🎰\n👽🎲🎲🎲👽\n🎲⬛🎲⬛🎲\n👥👥👥👥👥' },
      // NEW STYLES (Steve 2026-10-06): sacrifice, creation, team, auction.
      // The System is a TV network. These are the shows it was missing.
      { id: 'price', name: 'The Price', cat: 'moot', risk: 'extreme',
        desc: 'The System names a price: one villager, for the season. The village chooses who. You can volunteer, campaign, or scheme — but someone pays.',
        participants: 1,
        arena: '⚖️\n👥👥👥👥👥\n⬜💀⬜💀⬜\n🎤🎤🎤🎤🎤\n👥👥👥👥👥' },
      { id: 'impress', name: 'Impress Us', cat: 'weird', risk: 'medium',
        desc: 'Make the aliens feel something they have never felt. They have felt everything. Almost. The judges are baffled by you, which is your only edge.',
        participants: 1,
        arena: '🎭\n👽👽👽👽👽\n⬜🎨⬜🎭⬜\n✨✨✨✨✨\n👥👥👥👥👥' },
      { id: 'exchange', name: 'The Exchange', cat: 'endurance', risk: 'high',
        desc: 'Your village versus theirs. A relay through the badlands — three legs, no rules about what runs between the markers. Losers tithe.',
        participants: 3,
        arena: '🏃\n🏁🌲🌲🌲🏁\n🌲⚠️🌲⚠️🌲\n🏁🌲🌲🌲🏁\n👥👥👥👥👥' },
      { id: 'auction', name: 'The Auction', cat: 'chance', risk: 'high',
        desc: 'The System auctions alien tech. Bid with memories, years, or body parts. Everyone pays their bid — winner takes the lot, losers take the loss.',
        participants: 3,
        arena: '🔨\n💰💰💰💰💰\n⬜🏺⬜🏺⬜\n👽🔨👽🔨👽\n👥👥👥👥👥' },
    ];
  };

  G.pickContest = function() {
    const pool = this.contestPool();
    const wave = this.unlockedWave();
    // Filter by wave-appropriateness (higher waves unlock scarier contests)
    let candidates = pool;
    if (wave < 2) candidates = pool.filter(c => c.risk !== 'extreme');
    // Siege is wave-3-gated like the Gauntlet: the village has to be ready
    // to watch someone hold a line (Steve 2026-10-06)
    if (wave < 3) candidates = candidates.filter(c => !['gauntlet', 'siege'].includes(c.id));
    
    // RNG: pick random (Steve 2026-10-05: mostly random which one you get)
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    
    // VARIANT (Steve 2026-10-05): like monsters, contests get variants.
    // If you've seen this contest before, 30% chance it's HARDENED:
    // higher risk, better prizes, twist on the rules.
    const seen = (this.state.contestsSeen || {})[pick.id] || 0;
    let variant = null;
    if (seen > 0 && Math.random() < 0.3) {
      variant = 'hardened';
    }
    // Track that we've seen it
    this.state.contestsSeen = this.state.contestsSeen || {};
    this.state.contestsSeen[pick.id] = seen + 1;

    return this._contestScaled(pick, variant);
  };

  // SCALING (Steve 2026-10-06): wave scaling + hardened variant used to be
  // applied only in pickContest, but resolveContest rebuilds the contest from
  // the pool by id — the announced variant never reached the played sequence.
  // One helper, applied at both ends, so what's announced is what's played.
  G._contestScaled = function(base, variant) {
    const wave = this.unlockedWave();
    // Wave scaling: higher waves = harder contests
    // (Risk increases, but so do prizes)
    const scaled = Object.assign({}, base);
    if (wave >= 3 && scaled.risk === 'medium') scaled.risk = 'high';
    if (wave >= 4 && scaled.risk === 'high') scaled.risk = 'extreme';

    if (variant === 'hardened') {
      scaled.name = 'Hardened ' + scaled.name;
      scaled.desc += ' The rules have changed. The audience demanded it.';
      // Bump risk one level
      const risks = ['low', 'medium', 'high', 'extreme'];
      const idx = risks.indexOf(scaled.risk);
      if (idx < 3) scaled.risk = risks[idx + 1];
      scaled.variant = 'hardened';
    }

    return scaled;
  };

  // === TV SHOWS ===
  // The in-between: not contests, but the cameras still come. High-drama,
  // often silly — people get pulled away for the smallest reasons, and the
  // village talks about it for days. (Steve 2026-10-05/06)
  G.showPool = function() {
    return [
      { id: 'why_eat', name: 'WHY DO THEY EAT?',
        desc: 'Cook for the aliens. They are horrified. The audience is delighted.' },
      { id: 'break_room', name: 'Break Room',
        desc: 'Gossip show. Your drama, aired to the galaxy.' },
      { id: 'mouth_race', name: 'Mouth Race',
        desc: 'Cooking competition. Speed matters. So does not poisoning the judges.' },
      { id: 'ask_human', name: 'Ask a Human',
        desc: 'Call-in show. Strangers ask you deeply uncomfortable questions.' },
      { id: 'death_reel', name: 'The Death Reel',
        desc: 'Highlights. Yes, including yours. Especially yours.' },
      { id: 'nap_wars', name: 'Nap Wars',
        desc: 'A villager is pulled mid-afternoon for competitive napping. The galaxy holds its breath. Someone always snores.' },
      { id: 'tiny_door', name: 'The Tiny Door',
        desc: 'A door appears in the village. It is very small. Someone has to go through. The audience has opinions about who.' },
      { id: 'grudge_pudding', name: 'Grudge Pudding',
        desc: 'Two villagers with a grudge must cook a pudding together. The pudding is a metaphor. The grudge is not.' },
      { id: 'who_moved_it', name: 'Who Moved It?',
        desc: "Someone's favorite thing has been moved three inches. A full investigation, televised. The culprit is always the last person you'd suspect. It's never them." },
      { id: 'apology_tour', name: 'The Apology Tour',
        desc: 'A villager is made to apologize for something they did in a dream. The dream is shown. Everyone has seen it.' },
      { id: 'dance_off', name: 'Dance-Off at Dusk',
        desc: 'The System demands dancing. No music is provided. The village provides its own. It goes better than anyone expects.' },
      { id: 'mystery_smell', name: 'The Mystery Smell',
        desc: 'Something smells incredible somewhere in the village. Find it before the cameras do. The chat already knows. They are not telling.' },
      { id: 'complaint_box', name: 'The Complaint Box',
        desc: 'Villagers file complaints about the aliens. The aliens read them aloud, wounded. The audience takes sides.' },
      // New show variants (Steve 2026-10-06): high-drama in-between, people
      // pulled away for silly reasons
      { id: 'hot_take', name: 'Hot Take',
        desc: 'A villager is pulled to defend a food opinion on live television. The opinion is about soup. The galaxy has thoughts.' },
      { id: 'who_farted', name: 'Who Farted?',
        desc: 'A full forensic investigation, televised. Evidence boards. Suspect interviews. The culprit is found. Dignity is not.' },
      { id: 'stare_down', name: 'The Stare-Down',
        desc: 'A villager must out-stare an alien champion. Blinking is defeat. Seventeen systems are watching both faces.' },
      { id: 'crib_mine', name: 'Cribs: Burrow Edition',
        desc: 'The aliens tour a villager\'s shelter. They are horrified. Then delighted. Then they "improve" one thing.' },
      { id: 'talent_pit', name: 'The Talent Pit',
        desc: 'Talent show, judged by beings who have never seen talent. Applause is measured in decibels and confusion.' },
      { id: 'lost_found', name: 'Lost & Found',
        desc: 'The System returns something a villager lost years ago. It is not quite the same as they remember. Nobody says why.' },
      { id: 'swear_jar', name: 'The Swear Jar',
        desc: 'A villager is miked for a day. Every curse costs the village a ration. Everyone is suddenly, terribly polite.' },
      { id: 'makeover', name: 'Extreme Burrow Makeover',
        desc: 'The aliens redecorate a shelter overnight. It is beautiful. It is unusable. The villager must live in it for a week.' },
      // More in-between (Steve 2026-10-06): the cameras never really leave.
      { id: 'karaoke', name: 'Alien Karaoke',
        desc: 'A villager must sing. The System provides music from seventeen systems. None of it has a beat a human can find. The village provides backup vocals anyway.' },
      { id: 'shelter_swap', name: 'Shelter Swap',
        desc: "Two villagers swap shelters for a week. The aliens film the adjustment. Someone always cries about someone else's storage system." },
      { id: 'small_claims', name: 'Small Claims',
        desc: 'Alien judges settle village disputes. The gavel is a meteorite. Justice is swift, final, and deeply confused by property law.' },
      { id: 'how_to_human', name: 'How to Human',
        desc: "The aliens attempt a human tutorial episode. A villager is the demonstration model. Today's lesson: elbows." },
      { id: 'rose_ceremony', name: 'The Rose Ceremony',
        desc: 'A villager must give a rose to the most trustworthy person they know. On camera. The village does the math before the cameras do.' },
      { id: 'the_leak', name: 'The Leak',
        desc: "The System 'accidentally' broadcasts a page from a villager's private journal. The page is read aloud. The village pretends it didn't hear." },
      { id: 'museum_of_you', name: 'Museum of You',
        desc: "The aliens curate a villager's life into an exhibit. The villager must narrate the audio tour. Some rooms are closed for renovation." },
      { id: 'infomercial', name: 'The Infomercial',
        desc: 'A villager has sixty seconds to sell an alien product to the galaxy. The product is a rock. The rock is $400.' },
    ];
  };

  G.pickShow = function() {
    const pool = this.showPool();
    return pool[Math.floor(Math.random() * pool.length)];
  };

  // FIRE SHOW (Steve 2026-10-06): the in-between isn't just an announcement.
  // Someone gets pulled away for a silly reason, the village talks about it.
  // Wired: game.js's dawn branch calls fireShow(event) for non-contest events.
  G.fireShow = function(show) {
    const s = (show && show.id) ? show : this.pickShow();
    // SIBLING (Steve 2026-10-06): same dead/severed exclusion as
    // contestEligible — a corpse can't be pulled for TV either.
    const roster = (this.state.village.roster || []).filter(id =>
      id !== this.villagerId && this.isMember(id));
    let pulled = null;
    if (roster.length && Math.random() < 0.7) {
      pulled = roster[Math.floor(Math.random() * roster.length)];
    }
    if (pulled) {
      const pname = this.displayName(pulled);
      this.sysSay(`📺 TONIGHT: ${s.name}. ${s.desc}`);
      this.sysSay(`📺 The cameras want ${pname}. No reason. ${pname} is going on television.`);
      this.sysSay(`📺 ${pname} will be back by morning. Probably. The village will talk about this for days.`);
      this.addNotability(pulled, 'showmanship');
    } else {
      this.sysSay(`📺 TONIGHT: ${s.name}. ${s.desc}`);
      this.sysSay(`📺 The village watches together. Someone brings snacks. It helps.`);
    }
    try { this.leadShift('showmanship', 1); } catch (e) {}
    return s;
  };

  // === RESOLUTION ===
  // Simplified for now: contest fires, participant chosen, outcome rolled.
  // Full arena combat comes later.
  G.fireContest = function(contest) {
    const { eligible } = this.contestEligible();
    if (!eligible.length) return;

    // MULTI-TAKE (Steve 2026-10-06): the contest's participant count is
    // real — the System takes that many people, not one. Four contestants
    // means four of yours, gone to the lights. More taken = more FEARED.
    const want = Math.max(1, Math.min(contest.participants || 1, eligible.length));
    const pool = eligible.slice();
    const picks = [];
    // First pick: prefer the player (System's whim: 10% random override)
    let whim = false;
    if (Math.random() < 0.1) {
      whim = true;
      picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    } else {
      const pi = pool.findIndex(e => e.id === 'player');
      picks.push(pi >= 0 ? pool.splice(pi, 1)[0] : pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    while (picks.length < want && pool.length) {
      picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    const ids = picks.map(p => p.id);
    if (whim) {
      const wSubj = picks[0].id === 'player' ? 'You are' : picks[0].name + ' is';
      this.sysSay(`📺 The System's whim: ${wSubj} *interesting*.`);
    }

    this.sysSay(`📺 CONTEST: ${contest.name}. ${contest.desc}`);
    if (contest.arena) {
      this.sysSay(`📺 Arena:\n${contest.arena}`);
    }
    if (contest.variant === 'hardened') {
      this.sysSay(`📺 ⚠️ HARDENED VARIANT — you've seen this before. It's worse now.`);
    }
    this.sysSay(`📺 ${this._cxTakenLine(ids)} The village holds its breath.`);
    // AUDIO (Steve 2026-10-06): the contest window gets its own sting —
    // game-show jingle curdles. No-op when no audio system is attached.
    this.audioEvent('contestCall');

    // Countdown: 1 day (simplified)
    this.state.pendingContest = {
      contestId: contest.id,
      participant: ids[0],
      participants: ids,
      firesDay: (this.state.scholar.day || 1) + 1,
      variant: contest.variant || null,
    };
  };

  // Name list for multi-take announcements: "Mara", "Mara and Tove",
  // "Mara, Tove and Sef". The player renders as You/you.
  G._cxNameList = function(ids, capPlayer) {
    const names = (ids || []).map(id => id === 'player' ? (capPlayer ? 'You' : 'you') : this.displayName(id));
    if (!names.length) return 'no one';
    if (names.length === 1) return names[0];
    if (names.length === 2) return names[0] + ' and ' + names[1];
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  };

  // "You have been chosen." / "Mara has been chosen." /
  // "The System has taken Mara, Tove and you."
  G._cxTakenLine = function(ids) {
    if (!ids || !ids.length) return 'No one has been chosen.';
    if (ids.length === 1) {
      return ids[0] === 'player' ? 'You have been chosen.' : this.displayName(ids[0]) + ' has been chosen.';
    }
    return 'The System has taken ' + this._cxNameList(ids, true) + '.';
  };

  // CONTEST INTERRUPTION (Steve 2026-10-05):
  // Contests are UNAVOIDABLE. When the time comes, you go through the sequence
  // no matter where you are or what you're doing. Participate or don't —
  // but skipping isn't a thing. If you're not involved, you watch the show.
  G.contestInterruption = function(contest, participantIds) {
    // MULTI-TAKE (Steve 2026-10-06): participantIds is an array — the
    // System takes several people at once. Old single-id callers still work.
    const ids = Array.isArray(participantIds) ? participantIds.slice() : [participantIds];
    const isPlayer = ids.includes('player');
    const others = ids.filter(id => id !== 'player');
    const pname = isPlayer ? 'You' : this._cxNameList(ids, true);
    
    // The interruption itself — this is the sequence you can't skip
    this.sysSay(`📺 ═══ CONTEST INTERRUPTION ═══`);
    this.sysSay(`📺 ${contest.name}. ${contest.desc}`);
    
    if (contest.arena) {
      this.sysSay(`📺 Arena:\n${contest.arena}`);
    }
    if (contest.variant === 'hardened') {
      this.sysSay(`📺 ⚠️ HARDENED VARIANT — you've seen this before. It's worse now.`);
    }
    
    if (isPlayer) {
      // AUDIO (Steve 2026-10-06): the grab — you are chosen (reverse swell
      // + slow klaxon). Fires whether grabbed or given the choice; either
      // way, the cameras are for you.
      this.audioEvent('contestTaken');
      // Sometimes you get a choice, usually you're grabbed
      // (Steve 2026-10-05: "sometimes you get a choice depending on the contest,
      //  but usually it grabs you anyways, participate or don't")
      const givesChoice = contest.givesChoice || Math.random() < 0.3;
      if (givesChoice) {
        this.sysSay(`📺 The System offers you a choice: participate or refuse.`);
        // Real choice — refusal is a sequence via _contestRefuse, not a skip
        let playable;
        try { playable = this.contestPlayable(contest); } catch (e) { playable = null; }
        if (!playable || !playable.length) {
          try { playable = this._contestGeneric(contest); } catch (e2) { playable = null; }
        }
        if (!playable) playable = [];
        // SHIFT (Steve 2026-10-06): the choice phase is prepended at index 0,
        // so every numeric `next` inside the playable phases shifts +1 — they
        // were authored for the un-prefixed array. Without this, phase 0's
        // choices point back at themselves and the player is stuck forever
        // (a modal with no way forward). Terminal nexts are untouched.
        const shifted = playable.map(p => Object.assign({}, p, {
          choices: (p.choices || []).map(ch => Object.assign({}, ch, {
            next: (typeof ch.next === 'number') ? ch.next + 1 : ch.next,
          })),
        }));
        const choicePhase = {
          text: `📺 ${contest.name}. ${contest.desc}\n\nThe System waits. The cameras are already rolling. Participate — or refuse, and let the galaxy watch you say no.`,
          choices: [
            { label: 'Participate', sub: 'step into the light', do: {}, next: 1 },
            { label: 'Refuse', sub: 'say no on camera', do: {}, next: 'REFUSE' },
          ]
        };
        this.state.activeContest = {
          contestId: contest.id,
          participant: 'player',
          participants: ids,
          others: others,
          phase: 'choice',
          phaseIdx: 0,
          phases: [choicePhase, ...shifted],
          variant: contest.variant || null,
          wounds: 0,
        };
        // MULTI-TAKE (Steve 2026-10-06): name the others taken with you —
        // the choice is yours; their fates are their own.
        if (others.length) {
          this.sysSay(`📺 Taken with you: ${this._cxNameList(others, true)}. Different lights. Same cameras.`);
        }
        // Say the choice beat like every other phase (the box renders it, but
        // the log is the record — keep both surfaces in sync).
        this.sysSay('📺 ───');
        const renderedChoice = this._contestRenderPhase(this.state.activeContest, choicePhase, 0);
        this._cxStorePhase(this.state.activeContest, 0, renderedChoice);
        this._cxPhaseSay(renderedChoice.text);
        return this.state.activeContest;
      } else {
        this.sysSay(`📺 ${pname} — you're grabbed. No choice. The cameras are already rolling.`);
      }
      // PLAYABLE (Steve 2026-10-05): the contest is a phase sequence with
      // real choices, not a dice roll. Phases render in the narration UI.
      // Never leave the player in a modal with no phases — that's a stuck
      // screen. Fall back to the generic sequence (Steve 2026-10-06).
      let phases;
      try { phases = this.contestPlayable(contest); } catch (e) { phases = null; }
      if (!phases || !phases.length) {
        try { phases = this._contestGeneric(contest); } catch (e2) { phases = null; }
      }
      this.state.activeContest = {
        contestId: contest.id,
        participant: 'player',
        participants: ids,
        others: others,
        phase: 'intro',
        phaseIdx: 0,
        phases: phases,
        variant: contest.variant || null,
        wounds: 0,
      };
      // MULTI-TAKE (Steve 2026-10-06): name the others who were taken with
      // you — they have their own arenas, their own fates.
      if (others.length) {
        this.sysSay(`📺 Taken with you: ${this._cxNameList(others, true)}. Different lights. Same cameras.`);
      }
      if (phases && phases[0]) {
        this.sysSay('📺 ───');
        const rendered = this._contestRenderPhase(this.state.activeContest, phases[0], 0);
        this._cxStorePhase(this.state.activeContest, 0, rendered);
        this._cxPhaseSay(rendered.text);
      }
    } else {
      // You're not in it — you WATCH. Especially if villagers are involved.
      // (Steve 2026-10-05: "we should aspire to essentially put on a show
      //  they can watch, especially if other villagers are involved")
      this.sysSay(`📺 ${ids.length > 1 ? pname + ' have been taken' : pname + ' has been chosen'}. The village holds its breath.`);
      this.sysSay(`📺 You watch. The cameras love this part.`);
      // AUDIO (Steve 2026-10-06): announced not-taken — relief with a
      // dissonant shadow. Someone else is going on, and you're glad.
      this.audioEvent('contestSpared');
      let wphases;
      try { wphases = this._contestWatchPhases(contest, ids); } catch (e) { wphases = null; }
      if (!wphases || !wphases.length) {
        try { wphases = this._contestGeneric(contest); } catch (e2) { wphases = null; }
      }
      this.state.activeContest = {
        contestId: contest.id,
        participant: ids[0],
        participants: ids,
        phase: 'watching',
        phaseIdx: 0,
        phases: wphases,
        variant: contest.variant || null,
        wounds: 0,
      };
      if (wphases && wphases[0]) {
        this.sysSay('📺 ───');
        const wrendered = this._contestRenderPhase(this.state.activeContest, wphases[0], 0);
        this._cxStorePhase(this.state.activeContest, 0, wrendered);
        this._cxPhaseSay(wrendered.text);
      }
    }
    
    // The interruption is modal — it takes over the UI until resolved
    // (Steve: "no matter where you are or what you are doing, when the time
    //  comes you go through the sequence")
    return this.state.activeContest;
  };

  G.resolveContest = function() {
    const pc = this.state.pendingContest;
    if (!pc) return;
    this.state.pendingContest = null;

    const base = this.contestPool().find(c => c.id === pc.contestId);
    if (!base) return;
    // Re-apply wave scaling + variant: what was announced is what's played
    // (Steve 2026-10-06: the fire->resolve rebuild used to drop these).
    const contest = this._contestScaled(base, pc.variant || null);

    // RECAST (Steve 2026-10-06): the countdown can outlive its contestant —
    // killed, exiled, or vanished overnight. The show still comes
    // (unavoidable), but a corpse can't be televised: recast from the living
    // eligible, or cancel with the System's disappointment on the record.
    // RECAST (Steve 2026-10-06): the countdown can outlive its contestants —
    // killed, exiled, or vanished overnight. The show still comes
    // (unavoidable), but corpses can't be televised: each missing contestant
    // is recast from the living eligible, or the show is cancelled if no one
    // is left at all. Debug/scenario overrides that set pc.participant
    // directly (without touching pc.participants) win over the stored array.
    let ids = (pc.participants && pc.participants.length) ? pc.participants.slice() : [pc.participant];
    if (pc.participant && !ids.includes(pc.participant)) ids = [pc.participant];
    const s = this.state.scholar;
    const roster = (this.state.village.roster || []);
    const playerAlive = !this.state.over && (s.health || 0) > 0 && !s.exiled;
    // Villager liveness uses the same bar as eligibility: dead or severed
    // villagers can't be televised (Steve 2026-10-06 — was roster.includes,
    // which let the dead stay cast).
    const { eligible } = this.contestEligible();
    const finalIds = [];
    const takenSet = new Set();
    for (const who of ids) {
      const alive = who === 'player' ? playerAlive : this.isMember(who);
      if (alive) { finalIds.push(who); takenSet.add(who); continue; }
      const candidates = (eligible || []).filter(e => !takenSet.has(e.id) && (e.id !== 'player' || playerAlive));
      const goneName = who === 'player' ? 'You' : this.displayName(who);
      if (!candidates.length) {
        this.sysSay(`📺 The System was going to take ${goneName}. There is no one left to take instead — the show is cancelled. The galaxy boos.`);
        continue;
      }
      const recast = candidates[Math.floor(Math.random() * candidates.length)];
      this.sysSay(`📺 The System was going to take ${goneName}. ${who === 'player' ? 'You are' : goneName + ' is'} gone. The show must go on — it takes ${recast.id === 'player' ? 'YOU' : recast.name} instead.`);
      finalIds.push(recast.id);
      takenSet.add(recast.id);
    }
    if (!finalIds.length) return;

    // INTERRUPTION (Steve 2026-10-05): the contest doesn't resolve via dice roll.
    // It INTERRUPTS. You go through the sequence. Participate or don't.
    // If you're not involved, you watch.
    return this.contestInterruption(contest, finalIds);
  };

  // === PLAYABLE CONTEST ENGINE (Steve 2026-10-05) ===
  // Contests were "executable" (fired, printed lines, died) but not playable.
  // Now each contest is a 3-phase interactive sequence with real choices,
  // real stakes, real consequences. FEARED means dangerous. UNAVOIDABLE means
  // even refusal is a played sequence, not a skip.
  //
  // Phase: { text, choices: [{label, sub, do, next}] }
  //   do: { dmg:[lo,hi] (to player), heal:n, die:0-1 (chance), prize:bool,
  //         note:"...", notability:"deed", kcal:-n, trauma:n }
  //   next: phase index, or 'WIN' / 'LOSE' / 'DIE' / 'REFUSE'
  //
  // contestChoose(idx): apply the choice at current phase, advance.

  G.contestPlayable = function(contest) {
    const id = contest.id;
    if (id === 'pit') return this._contestPit(contest);
    if (id === 'gauntlet') return this._contestGauntlet(contest);
    if (id === 'hide') return this._contestHide(contest);
    if (id === 'duel') return this._contestDuel(contest);
    if (id === 'tithe') return this._contestTithe(contest);
    if (id === 'siege') return this._contestSiege(contest);
    if (id === 'maw') return this._contestMaw(contest);
    if (id === 'oath') return this._contestOath(contest);
    if (id === 'beastmaster') return this._contestBeastmaster(contest);
    if (id === 'riddle') return this._contestRiddle(contest);
    if (id === 'confession') return this._contestConfession(contest);
    if (id === 'honey') return this._contestHoney(contest);
    if (id === 'secrets') return this._contestSecrets(contest);
    if (id === 'quiet') return this._contestQuiet(contest);
    if (id === 'guest') return this._contestGuest(contest);
    if (id === 'vigil') return this._contestVigil(contest);
    if (id === 'sorting') return this._contestSorting(contest);
    if (id === 'witness') return this._contestWitness(contest);
    if (id === 'cache') return this._contestCache(contest);
    if (id === 'longodds') return this._contestLongodds(contest);
    if (id === 'price') return this._contestPrice(contest);
    if (id === 'impress') return this._contestImpress(contest);
    if (id === 'exchange') return this._contestExchange(contest);
    if (id === 'auction') return this._contestAuction(contest);
    const cat = contest.cat;
    if (cat === 'endurance') return this._contestEndurance(contest);
    if (cat === 'moot') return this._contestMoot(contest);
    if (cat === 'weird') return this._contestWeird(contest);
    if (cat === 'puzzle') return this._contestPuzzle(contest);
    if (cat === 'detective') return this._contestDetective(contest);
    if (cat === 'forage') return this._contestForage(contest);
    if (cat === 'chance') return this._contestChance(contest);
    return this._contestGeneric(contest);
  };

  // --- shared helpers ---
  G._cxIntro = function(contest) {
    const riskLine = { low: 'The audience expects entertainment, not blood.',
      medium: 'People have been hurt in this one. Not always.',
      high: 'People die in this one. Regularly.',
      extreme: 'Almost nobody walks away from this one.' }[contest.risk] || '';
    return `📺 ${contest.name}. ${contest.desc}\n\n${riskLine}\n\nThe lights come up. You can hear the crowd — millions of them, somewhere past the sky.` + this._cxCoaching(contest);
  };

  G._cxWin = function(contest, prizeText) {
    return { text: `📺 ${contest.name} — OVER. The crowd is on its feet. Somewhere, impossibly far away, something like cheering shakes the air.\n\n${prizeText || 'You won.'}`,
      choices: [{ label: 'Take the win', sub: 'collect', do: { prize: true, notability: 'contestWin' }, next: 'WIN' }] };
  };

  G._cxLose = function(contest, text) {
    return { text: `📺 ${contest.name} — OVER.\n\n${text || 'You survived. The audience is polite. Polite is worse than booing.'}`,
      choices: [{ label: 'Walk away', sub: 'alive, barely', do: {}, next: 'LOSE' }] };
  };

  // Phase texts carry their own 📺 prefix (see _cxIntro). Say them as-is;
  // never stack another 📺 in front (Steve 2026-10-05: double-prefix fix).
  G._cxPhaseSay = function(text) {
    this.sysSay(/^📺/.test(text) ? text : ('📺 ' + text));
  };

  // CONTEST BEAT AUDIO (Steve 2026-10-06): app.js owns the synth registry;
  // contests.js owns dispatch. New per-contest beats can't add synths to
  // app.js from this file, so each beat is a NAMED, composed dispatch over
  // already-registered Game.audio synths — zero silent, no app.js edit.
  // Registration is lazy: Game.audio doesn't exist until app.js loads,
  // which is AFTER contests.js. Phases declare beat:'name'; the first
  // presentation registers the composition, then fires it.
  const CX_BEAT_DEFS = {
    // The Sorting: televised judgment — game-show jingle curdles into a verdict.
    contestSort: ['contestCall', 'justiceVerdict'],
    // The Witness: the fabrication reveal — a scream of wrongness under relief's shadow.
    contestWitness: ['horrorSting', 'contestSpared'],
    // The Cache: the audit closes in — the grab-klaxon under receding footsteps.
    contestCache: ['contestTaken', 'exileWalk'],
    // The Long Odds: the table — game-show call under the dice slam.
    contestDice: ['contestCall', 'rushHit'],
    // The Price: the village decides — the moot's verdict over receding footsteps.
    contestPrice: ['justiceVerdict', 'exileWalk'],
    // Impress Us: something new is felt — an unlock over relief's shadow.
    contestImpress: ['levelup', 'contestSpared'],
    // The Exchange: the relay — the game-show call under pounding feet.
    contestExchange: ['contestCall', 'rushHit'],
    // The Auction: the cruelest show — the call curdles into dread.
    contestAuction: ['contestCall', 'horrorSting'],
  };
  G._cxBeat = function(name) {
    try {
      const A = this.audio;
      if (!A || !CX_BEAT_DEFS[name]) return;
      if (typeof A[name] !== 'function') {
        const parts = CX_BEAT_DEFS[name].slice();
        A[name] = function() {
          for (const p of parts) { try { if (typeof A[p] === 'function') A[p](); } catch (e) {} }
        };
      }
      this.audioEvent(name);
    } catch (e) {}
  };

  // === CONTEST KNOWLEDGE (Steve 2026-10-05) ===
  // Surviving, losing, or watching a contest teaches its beats. Knowledge
  // compounds: doing teaches double. Level 1 = witnessed (in the codex).
  // Level 2 = know the beats (intro shows coaching — "if you don't know,
  // it doesn't show" cuts the other way too: earned knowledge IS shown).
  // Level 3 = veteran: you read the hits coming (contest damage reduced).
  G.contestKnowledge = function(contestId) {
    const c = (this.state.codex || {}).contests || {};
    return c[contestId] || { seen: 0, wins: 0, level: 0 };
  };

  G.contestLearn = function(contestId, outcome) {
    // outcome: 'won' | 'lost' | 'died' | 'refused' | 'watched'
    this.state.codex = this.state.codex || {};
    this.state.codex.contests = this.state.codex.contests || {};
    const k = this.state.codex.contests[contestId] || { seen: 0, wins: 0, level: 0 };
    const did = outcome === 'won' || outcome === 'lost' || outcome === 'died';
    k.seen += did ? 2 : 1;
    if (outcome === 'won') k.wins += 1;
    const lvl = k.seen >= 6 ? 3 : k.seen >= 3 ? 2 : 1;
    if (lvl > k.level) {
      k.level = lvl;
      const cname = (this.contestPool().find(c => c.id === contestId) || {}).name || contestId;
      if (lvl === 2) this.sysSay(`📚 ${cname}: you know its beats now. The intro will tell you what you've learned.`);
      if (lvl === 3) this.sysSay(`📚 ${cname}: veteran. You read the hits coming now — the System hates that.`);
    }
    this.state.codex.contests[contestId] = k;
    return k;
  };

  // Coaching: what level-2+ knowledge actually tells you. Short, real intel —
  // the kind of thing a survivor would mutter to a first-timer.
  G._cxCoaching = function(contest) {
    if (this.contestKnowledge(contest.id).level < 2) return '';
    const LINES = {
      pit: 'The beast feints first, commits second. Sand buys a full second. The sidestep wins cleaner than the charge.',
      gauntlet: "Wave two hits hardest — don't spend everything on wave one. The closer smells blood: arrive hurt and it knows.",
      duel: 'The drone calls it fast. Mercy plays better than cruelty — unless you mean it.',
      drop: "Ridge line beats valley. Don't eat the snow. Night movement is a gamble.",
      starve: 'Sleep through day one. The broth is a trap and the cameras saw you.',
      moot: 'The audience votes with attention. Confession disarms; the perfect lie wins the moment.',
      lies: 'The scanner hates hesitation more than lies. Commit to the bit.',
      cookfight: "Befriend first, wrestle second. The judges have never tasted anything — novelty beats technique.",
      fetch: 'Weird beats shiny. The story of the thing matters more than the thing.',
      hide: "Stillness beats speed. It hears running from a mile off.",
      box: "The chat lies half the time. Trust the pattern you built, not the crowd.",
      pattern: 'Small bites, right order. Your gut knows before you do.',
      whoate: "Watch the quiet one. Alibis that almost hold don't.",
      informant: 'The informant tests the exits early. Watch the doors, not the faces.',
      calorie_run: 'Deep woods pay double and charge double. The edges are safe and middling.',
      pantry_raid: "The locals have routines — learn them before you grab. Leave an offering; they'll let you walk.",
      wheel: "Nothing helps. That's the point. Take it standing.",
      lottery: "Nothing helps. That's the point. Laugh anyway.",
      tithe: "The altar wants three full measures. Not four. The fourth measure is the one that kills.",
      siege: "Wave two feints at the barricade and comes for you. Don't spend your body on wave one.",
      maw: "Never stop moving. It counts your pauses. The light at the end is real — probably.",
      oath: "Mean every word or say nothing. The binding hears the difference. A planned betrayal is still a plan it heard.",
      beastmaster: "Kindness first, then authority. It respects calm — neither fear nor cruelty. Never yank the collar.",
      riddle: "The Engine's riddles are always about you. Answer with the childhood version of the truth — the adult version is too careful, and it knows.",
      confession: "The confessor is covering for someone. Watch who they look at when the details get specific — guilt looks at the person it's protecting.",
      honey: "Smoke first, always. The queen cell is the prize and the death. The swarm respects slowness — it has never been hurried and doesn't intend to start.",
      secrets: "The deck isn't random — it's curated. It plays the secrets that hurt most when you're winning. Fold while you still like these people.",
      quiet: "It hunts for the thought you're actively burying — so don't bury anything. Feed it turnips on purpose. Loud, boring, relentless turnips.",
      guest: "Bitter and fermented wins. Sugar alarms it. And mirror its limbs — imitation reads as respect, not mockery.",
      vigil: "It circles the light, not you. Tend the lamp. A bright lamp makes a long night for it and a short one for you.",
      sorting: "The sorter keeps what SHINES and burns what's dull-useful. Save the dull things. It can't parse a body on the belt.",
      witness: "It writes monsters from the codex but gets the behavior wrong — it doesn't know how they move. The hushwolf never screams. Listen for the seam.",
      cache: "Decoys beat speed. The cameras sweep in a pattern — feed them something small and loud and they'll log a victory and miss the big thing.",
      longodds: "The dice are fair; the champion isn't — it reads hesitation the way the scanner reads lies. Commit to the bit.",
      price: "Volunteering is the only move that doesn't fracture the village. The System respects the walk-up. The village never forgets it.",
      impress: "They've felt everything except being human. Don't perform — offer the thing you'd never show anyone. That's the only currency they don't have.",
      exchange: "Gray Hollow always fades late — they run proud, not patient. Let them burn out. The shortcut through the nest works once, for the cameras, and never again.",
      auction: "The auctioneer can smell bluff but the rules bind it anyway. Bid what you'd actually pay — the winners are the ones who know their price before the hammer.", 
    };
    return '\n\n📚 What you know: ' + (LINES[contest.id] || "You've seen this before. Trust your instincts.");
  };

  // --- THE PIT (bespoke, blood) ---
  G._contestPit = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { text: intro + `\n\nThe arena floor is sand and old bone. The gate across from you rattles. Something in there is breathing hard.\n\nThe System's voice, bright as a knife: "CHOOSE YOUR WEAPON, CONTESTANT."`,
        choices: [
          { label: 'Spear', sub: 'reach, steady', do: { note: 'You take the spear. It feels honest.' }, next: 1 },
          { label: 'Net and knife', sub: 'tricky, close', do: { note: 'Net in one hand, knife in the other. The crowd oohs.' }, next: 1 },
          { label: 'Nothing', sub: 'the crowd gasps', do: { note: 'You shake your head. The gasp rolls around the arena like weather.', notability: 'showmanship' }, next: 1 },
        ] },
      { text: `The gate slams up. A wave-appropriate beast comes out low and fast — it has been promised food.\n\nIt circles. It's deciding how you die.`,
        choices: [
          { label: 'Hold your ground', sub: 'let it come to you', do: { dmg: [8, 18], note: 'It feints, then commits. You take the hit on your terms — mostly.' }, next: 2 },
          { label: 'Charge it', sub: 'shock and awe', do: { dmg: [15, 30], die: 0.20, note: 'You SCREAM and run at it. The crowd loses its mind. So does the beast.' }, next: 2 },
          { label: 'Throw sand', sub: 'dirty, smart', do: { dmg: [4, 10], note: 'Sand in the eyes. It shakes its head, blind and furious — and slower.' }, next: 2 },
        ] },
      { text: `It's bleeding. You're bleeding. The crowd can smell both.\n\nThe beast gathers itself for one last rush. This is the moment the Death Reel loves.`,
        choices: [
          { label: 'Meet the rush', sub: 'end it now', do: { prize: true,  dmg: [20, 38], die: 0.30, note: 'You plant your feet and meet it head-on. Something has to give.' }, next: 'WIN' },
          { label: 'Sidestep and strike', sub: 'precision over courage', do: { prize: true,  dmg: [10, 20], die: 0.06, note: 'You slide aside at the last breath and open its flank as it passes.' }, next: 'WIN' },
          { label: 'Play dead', sub: 'desperate', do: { dmg: [0, 6], die: 0.05, note: 'You drop. It sniffs you. The crowd holds its breath... it turns away, confused. Cowardice, televised — but breathing.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- GAUNTLET (bespoke, blood/extreme) ---
  G._contestGauntlet = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { text: intro + `\n\nThree gates. Three waves. No rest between.\n\nThe System: "WAVE ONE. TRY TO LOOK SURPRISED."\n\nThe System adds, almost kindly: "THE CLOSER SMELLS BLOOD, CONTESTANT. ARRIVE HURT AND IT KNOWS."\n\nThe first beast is fast and stupid. It wants you tired for what's next.`,
        choices: [
          { label: 'Kill it fast', sub: 'spend everything', do: { dmg: [10, 20], kcal: -300, note: 'You go all out. It dies quick. You\'re breathing hard already.' }, next: 1 },
          { label: 'Wear it down', sub: 'patient, costly', do: { dmg: [6, 12], kcal: -150, note: 'You let it waste itself on your guard. Slow. Smart. Tiring anyway.' }, next: 1 },
          { label: 'Use the arena', sub: 'walls, spikes, sand', do: { dmg: [4, 10], note: 'You bait it into the spike strip. The crowd appreciates the craft.' }, next: 1 },
        ] },
      { text: `WAVE TWO. Bigger. It has seen the first wave's corpse and learned nothing, which is worse.\n\nYour arms are heavy. The crowd chants your name wrong.`,
        choices: [
          { label: 'All offense', sub: 'no defense left', do: { dmg: [22, 40], die: 0.25, note: 'You throw everything into the attack. If this doesn\'t work, nothing will.' }, next: 2 },
          { label: 'Desperate defense', sub: 'survive the wave', do: { dmg: [10, 18], kcal: -200, note: 'You curl around your vitals and let it spend itself. It hurts. You live.' }, next: 2 },
          { label: 'Beg the crowd', sub: 'humiliating, maybe works', do: { dmg: [6, 14], die: 0.05, note: 'You drop to your knees and BEG. The audience laughs — and votes you a weapon drop. A real one.' }, next: 2 },
        ] },
      { text: `WAVE THREE. The gate opens and what comes out is wrong in ways the first two weren't.\n\nThis is the one the Death Reel is for.`,
        choices: [
          // CLOSER (Steve 2026-10-05): no flat dice. The closer's kill odds scale
          // with the wounds you carried in (dieWounds), and the System displays
          // them — readable danger, earned by how you fought waves 1-2.
          { label: 'Stand and fight', sub: 'the only way out is through', do: { prize: true,  dmg: [25, 45], dieWounds: 'stand', note: 'You stand. It comes. The next minute is the longest of your life.' }, next: 'WIN' },
          { label: 'Run the clock', sub: 'dodge until it tires', do: { prize: true,  dmg: [12, 22], dieWounds: 'run', kcal: -400, note: 'You run. The arena is small and the crowd counts your laps. It tires. You nearly don\'t.' }, next: 'WIN' },
          { label: 'Offer yourself', sub: 'a different bargain — about a coin flip', do: { die: 0.5, note: 'You stop, spread your arms, and offer it something it didn\'t expect: stillness. It hesitates. The System leans in, fascinated.' }, next: 'LOSE' },
        ] },
    ];
  };

  // GAUNTLET CLOSER (Steve 2026-10-05): the closer smells blood. Death odds
  // scale with wounds taken during the contest — readable, escalating,
  // earned. Standing your ground is riskier than running, always.
  G._contestCloserOdds = function(kind, wounds) {
    const spec = { stand: [0.08, 0.006, 0.45], run: [0.03, 0.005, 0.30] }[kind] || [0.10, 0.005, 0.40];
    return Math.min(spec[2], spec[0] + (wounds || 0) * spec[1]);
  };

  // Render a phase for display. For the Gauntlet closer, append the wound
  // readout and per-choice death odds — the System displays them, because
  // it's television and it wants you to know. Identified structurally
  // (choices carrying dieWounds), so the choice-phase prepend can't shift it.
  G._contestRenderPhase = function(ac, phase, idx) {
    if (!phase) return phase;
    // BEAT AUDIO (Steve 2026-10-06): phases may declare beat:'name' — fired
    // when the phase is presented (phase 0 goes through here in both the
    // grabbed and choice paths, and contestChoose routes advances here too).
    if (phase.beat) { try { this._cxBeat(phase.beat); } catch (e) {} }
    // Idempotent: the rendered phase is stored back into ac.phases (the
    // choice box renders phases directly), so a second render must not
    // stack another readout onto the text (Steve 2026-10-06).
    if (phase._cxRendered) return phase;
    const hasCloser = (phase.choices || []).some(c => c.do && c.do.dieWounds);
    if (ac.contestId === 'gauntlet' && hasCloser) {
      const w = ac.wounds || 0;
      const cond = w >= 45 ? 'You are barely standing. The closer can smell the blood.'
        : w >= 25 ? 'You are hurt — limping, bleeding, loud. The closer likes that.'
        : w >= 10 ? 'You are nicked and winded. It could be worse.'
        : 'You are barely scratched. The closer looks... disappointed.';
      const text = phase.text +
        `\n\n📺 ${cond} (Damage taken so far: ${w}.)` +
        `\n📺 The System helpfully displays your odds. It wants you to know.`;
      const choices = (phase.choices || []).map(c => {
        if (c.do && c.do.dieWounds) {
          const odds = Math.round(this._contestCloserOdds(c.do.dieWounds, w) * 100);
          return Object.assign({}, c, { sub: `${c.sub} — death odds ~${odds}%` });
        }
        return c;
      });
      const rendered = { text, choices, _cxRendered: true };
      return rendered;
    }
    return phase;
  };

  // Store the rendered phase back so the choice box (app.js contestBoxHTML,
  // which renders ac.phases directly) shows the same readout the log got.
  G._cxStorePhase = function(ac, idx, rendered) {
    try { if (ac && ac.phases && rendered) ac.phases[idx] = rendered; } catch (e) {}
    return rendered;
  };

  // --- HIDE AND SEEK (bespoke, weird/extreme) ---
  G._contestHide = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { text: intro + `\n\nThe seeker is a wave-2 predator. It is very good at seeking.\n\nYou get a sixty-count. The forest is dense, dark, and full of things that want to be left alone.\n\nThe System counts down. The predator is already listening.`,
        choices: [
          { label: 'Climb high', sub: 'trees, branches', do: { note: 'You climb until the branches thin. Your heart is louder than the leaves.' }, next: 1 },
          { label: 'Go low', sub: 'mud, roots, burrow', do: { note: 'You press into the mud under the roots. Something else is already down here. It ignores you.' }, next: 1 },
          { label: 'Hide in the open', sub: 'stillness as camouflage', do: { note: 'You stand against a trunk and do not move. Not a muscle. You become bark.' }, next: 1 },
        ] },
      { text: `You hear it. Not footsteps — the absence of other sounds. Birds go quiet in a widening circle.\n\nIt's close. It sniffs the air the way you check the weather.`,
        choices: [
          { label: 'Hold your breath', sub: 'do not exist', do: { dmg: [0, 8], die: 0.1, note: 'You stop breathing. Your lungs burn. It passes — or it doesn\'t.' }, next: 2 },
          { label: 'Throw a stone', sub: 'misdirect', do: { note: 'You flick a stone into the dark. It turns toward the sound. Clever. It knows that trick too.' }, next: 2 },
          { label: 'Run', sub: 'break cover', do: { dmg: [14, 28], die: 0.32, note: 'You RUN. Branches tear. Behind you, the quiet breaks into pursuit.' }, next: 2 },
        ] },
      { text: `The count is almost up. You can hear the System warming up the "FOUND YOU" sting.\n\nIt's right there. You can see its eyes catch the light.`,
        choices: [
          { label: 'Stay hidden', sub: 'trust the spot', do: { prize: true,  dmg: [4, 16], die: 0.25, note: 'You do not move. You barely breathe. The eyes sweep past — or stop.' }, next: 'WIN' },
          { label: 'Confront it', sub: 'scare it off', do: { prize: true,  dmg: [20, 38], die: 0.38, note: 'You burst out screaming, arms wide. Predators hate surprises. Usually.' }, next: 'WIN' },
          { label: 'Surrender', sub: 'live, lose', do: { note: 'You stand up with your hands out. It blinks. The System sighs — found, but boring.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- DUEL (blood) ---
  G._contestDuel = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { text: intro + `\n\nYour opponent is another contestant — scared, like you, but hiding it worse. Not to the death. To the yield.\n\nBut accidents happen. The System says this like it's a joke.`,
        choices: [
          { label: 'Offer a deal', sub: 'split the prize', do: { note: 'You whisper: we both walk out, we split whatever they give. They stare. The audience leans in.' }, next: 1 },
          { label: 'Study them', sub: 'find the weakness', do: { note: 'You watch how they stand. Favoring the left. Nervous hands. You can work with this.' }, next: 1 },
          { label: 'Attack first', sub: 'no ceremony', do: { dmg: [6, 14], note: 'You don\'t wait for the bell. Neither does the crowd\'s gasp.' }, next: 1 },
        ] },
      { text: `They yield — or they don't. The ref-drone hovers, sensors hot.\n\nThe crowd wants blood. The System wants a story. You want to go home.`,
        choices: [
          { label: 'Press the advantage', sub: 'finish it', do: { prize: true,  dmg: [16, 30], die: 0.18, trauma: 12, note: 'You press. They go down. The drone calls it. Your hands won\'t stop shaking.' }, next: 'WIN' },
          { label: 'Accept their yield', sub: 'mercy, televised', do: { prize: true,  note: 'They tap out. You step back. The crowd boos the mercy and loves you for it, both at once.' }, next: 'WIN' },
          { label: 'Take the dive', sub: 'lose on purpose', do: { dmg: [8, 16], note: 'You go down easy. They "win." The System knows. It always knows. But the deal was the deal.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- ENDURANCE (category template) ---
  G._contestEndurance = function(contest) {
    const intro = this._cxIntro(contest);
    const isDrop = contest.id === 'drop';
    return [
      { text: intro + (isDrop
        ? `\n\nThey drop you on a ridge with nothing. The beacon is three miles through snow and attitude.\n\nTwo others hit the ground near you. Nobody waves.`
        : `\n\nThree days. No food. Water provided. Dignity not.\n\nFour of you in the white room. The cameras never blink.`),
        choices: [
          { label: isDrop ? 'Move fast' : 'Sleep it off', sub: isDrop ? 'burn bright' : 'conserve', do: isDrop ? { kcal: -500, dmg: [4, 12], note: 'You run the ridge line. Fast is a kind of armor.' } : { note: 'You sleep. Hunger dreams are vivid. You wake emptier.' }, next: 1 },
          { label: isDrop ? 'Forage as you go' : 'Drink water constantly', sub: isDrop ? 'slow, fed' : 'full belly, water', do: isDrop ? { kcal: 200, note: 'You pick as you walk. Slow. Your stomach thanks you.' } : { note: 'You drink until you slosh. It helps. Barely.' }, next: 1 },
          { label: isDrop ? 'Follow the others' : 'Meditate', sub: isDrop ? 'let them break trail' : 'mind over gut', do: { note: isDrop ? 'You let them break trail through the drifts. Cruel. Efficient.' : 'You sit with the hunger until it becomes weather. It passes through you.' }, next: 1 },
        ] },
      { text: isDrop
        ? `Night. The cold is a second opponent. One of the others is crying, quietly, like it's a secret.\n\nThe beacon blinks, impossibly far.`
        : `Day two. Someone is talking to their food hallucinations. The System zooms in.\n\nYour stomach has filed a formal complaint.`,
        choices: [
          { label: isDrop ? 'Keep moving at night' : 'Steal a sip of broth', sub: isDrop ? 'dangerous, gains ground' : 'someone\'s stash', do: isDrop ? { dmg: [8, 18], die: 0.06, kcal: -300, note: 'You walk through the dark. The snow hides the drop-offs. Mostly.' } : { dmg: [0, 4], note: 'You steal broth. It\'s warm. The guilt is warmer. The cameras saw everything.', notability: 'heist' }, next: 2 },
          { label: isDrop ? 'Shelter and shiver' : 'Share your water', sub: isDrop ? 'lose time, live' : 'kindness, televised', do: isDrop ? { kcal: -200, note: 'You dig in and shiver through the night. Slow. Alive.' } : { note: 'You share your water ration. The audience awws. The System notes it.', notability: 'showmanship' }, next: 2 },
          { label: isDrop ? 'Eat snow' : 'Chew your sleeve', sub: isDrop ? 'hydration, cold core' : 'desperate', do: isDrop ? { dmg: [4, 10], note: 'Snow for water. Your core temp drops with every mouthful.' } : { note: 'You chew your sleeve. The chat explodes. You are now a meme across seventeen systems.' }, next: 2 },
        ] },
      { text: isDrop
        ? `The beacon is close enough to hear. One of the others is ahead of you — limping, but ahead.\n\nThis is the part the promos are made of.`
        : `Day three. The doors will open at dusk. Whoever looks the least broken wins the audience.\n\nYou are very broken. So is everyone.`,
        choices: [
          { label: isDrop ? 'Sprint the last mile' : 'Walk out smiling', sub: isDrop ? 'everything left' : 'performance', do: isDrop ? { prize: true, dmg: [14, 26], die: 0.15, kcal: -400, note: 'You sprint. Lungs, legs, heart — everything files a complaint. You pass them at the line.' } : { prize: true, note: 'You walk out smiling like you ate yesterday. The audience buys it. The System knows. It respects the lie.' }, next: 'WIN' },
          { label: isDrop ? 'Pace it home' : 'Help another up', sub: isDrop ? 'steady' : 'carry them', do: isDrop ? { prize: true, note: 'You pace it. They beat you by a minute. You beat the mountain.' } : { prize: true, dmg: [0, 6], note: 'You help another contestant stand. You both cross. The crowd weeps. Second place, first in the edit.' }, next: 'WIN' },
          { label: isDrop ? 'Collapse short' : 'Crawl out', sub: isDrop ? 'so close' : 'no dignity left', do: isDrop ? { dmg: [6, 14], note: 'Your legs quit a hundred yards out. You crawl. The beacon blinks. You make it. Barely counts.' } : { note: 'You crawl out. There is no dignity left. There is, however, a finish line.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- MOOT (category template: trial / lie detector) ---
  G._contestMoot = function(contest) {
    const intro = this._cxIntro(contest);
    const isLies = contest.id === 'lies';
    return [
      { text: intro + (isLies
        ? `\n\nTwo chairs. One scanner. The System knows when you lie — and the audience lives for it.\n\nFirst question's coming. Your opponent is already sweating.`
        : `\n\nTelevised trial. The accusations may be true or not — the audience is the jury either way.\n\nThe prosecutor-drone reads the charges. Some of them are even yours.`),
        choices: [
          { label: 'Tell the truth', sub: 'radical', do: { note: 'You tell the truth. The scanner stays quiet. The audience is disappointed and impressed.' }, next: 1 },
          { label: 'Lie beautifully', sub: 'performance', do: { note: 'You lie like it\'s an art form. The scanner buzzes. The audience GASPS with delight.', notability: 'showmanship' }, next: 1 },
          { label: 'Refuse to answer', sub: 'contempt', do: { note: 'You say nothing. Silence, televised. The System notes the defiance.', notability: 'showmanship' }, next: 1 },
        ] },
      { text: isLies
        ? `Harder questions now. Personal ones. The scanner hums.\n\nYour opponent just lied badly about something small. The crowd smells blood.`
        : `A witness is called. It's someone from your village. They look at you, then at the cameras, then back.\n\nWhat they say next matters enormously.`,
        choices: [
          { label: 'Double down', sub: 'commit', do: { dmg: [0, 8], trauma: 5, note: 'You commit to the story. The scanner screams. The audience is feral with joy.' }, next: 2 },
          { label: 'Confess', sub: 'disarm', do: { note: 'You confess — the small thing, the real thing. The scanner goes quiet. The crowd doesn\'t know what to do with honesty.', notability: 'showmanship' }, next: 2 },
          { label: 'Turn it around', sub: 'accuse the accuser', do: { note: 'You point at the question itself. "Who benefits from asking that?" The System pauses. Interesting.', notability: 'showmanship' }, next: 2 },
        ] },
      { text: isLies
        ? `Final question. The big one. The scanner is hot.\n\nWhatever you say next will be clipped and replayed for years.`
        : `Closing statements. The audience votes with their attention — you can feel it like heat.\n\nThis is the moment.`,
        choices: [
          { label: 'The whole truth', sub: 'burn it down', do: { prize: true, trauma: 8, note: 'You tell all of it. Every ugly true thing. The scanner is silent. The audience is silent. Then — applause like weather.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'The perfect lie', sub: 'one for the ages', do: { prize: true, note: 'You deliver a lie so beautiful the scanner hesitates. The crowd erupts. You win the moment, if not the truth.', notability: 'showmanship' }, next: 'WIN' },
          { label: 'Walk out', sub: 'refuse the game', do: { note: 'You stand and leave. The cameras follow you to the door. The System lets you go — the refusal IS the content.', notability: 'showmanship' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- WEIRD (category template: cookfight / fetch) ---
  G._contestWeird = function(contest) {
    const intro = this._cxIntro(contest);
    const isCook = contest.id === 'cookfight';
    return [
      { text: intro + (isCook
        ? `\n\nThe ingredients are in cages. They are looking at you.\n\nCook a meal. Presentation matters. Survival matters more.`
        : `\n\nOne mile radius. One hour. Most interesting thing wins.\n\nJudged by beings who have never touched grass. Good luck.`),
        choices: [
          { label: isCook ? 'Befriend the ingredients' : 'Go far', sub: isCook ? 'gentle' : 'distance', do: { note: isCook ? 'You speak softly to the caged things. One of them stops rattling. The audience melts.' : 'You run for the treeline. Interesting lives far from the start.' }, next: 1 },
          { label: isCook ? 'Assert dominance' : 'Go weird', sub: isCook ? 'chef energy' : 'unhinged', do: { dmg: isCook ? [4, 10] : [0, 0], note: isCook ? 'You slam the counter. The ingredients flinch. Gordon would be proud.' : 'You look for the thing nobody else would touch. There it is.' }, next: 1 },
          { label: isCook ? 'Ask the audience' : 'Go obvious', sub: isCook ? 'crowd work' : 'safe', do: { note: isCook ? 'You play to the cameras. "What should I make?" The chat explodes with suggestions, half of them lethal.' : 'You grab the shiniest thing. Safe. The judges yawn in seventeen languages.' }, next: 1 },
        ] },
      { text: isCook
        ? `Something is out of its cage. The audience is delighted. You are not.\n\nDinner is fighting back.`
        : `Half the hour gone. Your find is... okay. Someone else is carrying something that glows.\n\nThe judges are bored. Bored judges are dangerous judges.`,
        choices: [
          { label: isCook ? 'Wrestle it' : 'Double down on weird', sub: isCook ? 'hands on' : 'commit', do: { dmg: isCook ? [8, 16] : [0, 6], die: isCook ? 0.05 : 0, note: isCook ? 'You grapple the ingredient. It grapples back. The crowd is screaming.' : 'You commit to the weird thing. It\'s either genius or a war crime. No middle.' }, next: 2 },
          { label: isCook ? 'Negotiate' : 'Sabotage the glowing one', sub: isCook ? 'diplomacy' : 'dirty', do: { note: isCook ? 'You offer it a deal: cooperate and live. It considers. The System is taking notes.' : 'You "accidentally" knock their glow into the mud. The audience gasps. The judges pretend not to see.', notability: 'heist' }, next: 2 },
          { label: isCook ? 'Set it free' : 'Present with confidence', sub: isCook ? 'mercy' : 'sell it', do: { note: isCook ? 'You open the cage. It stares. Then it bows — actually bows — and leaves. The crowd weeps.' : 'You present your okay thing like it\'s the crown jewels. Confidence is a kind of interesting.' }, next: 2 },
        ] },
      { text: isCook
        ? `Plating. The judges lean in — three aliens who have never tasted anything.\n\nWhat you serve now defines you across the galaxy.`
        : `Time. You present your find to the judges.\n\nThey turn it over with instruments. They confer in frequencies that hurt.`,
        choices: [
          { label: isCook ? 'Serve with love' : 'Tell its story', sub: isCook ? 'heart' : 'narrative', do: { prize: true, note: isCook ? 'You serve it like it matters. Because it did. The lead judge tastes — and makes a sound no one has heard before. Delight.' : 'You tell them where you found it, what it cost. The story lands. The thing is secondary.' }, next: 'WIN' },
          { label: isCook ? 'Serve with flair' : 'Let it speak', sub: isCook ? 'showmanship' : 'minimal', do: { prize: true, note: isCook ? 'Fire, spinning plates, a garnish thrown from across the room. The crowd roars. The judges blink.' : 'You say nothing. Let the thing be the thing. Brave. The judges respect restraint. Maybe.' }, next: 'WIN' },
          { label: isCook ? 'Serve yourself' : 'Apologize', sub: isCook ? 'chaos' : 'humble', do: { dmg: [4, 10], note: isCook ? 'You sit down and eat it yourself, on camera. The judges are horrified. The audience is deceased. Iconic, not victorious.' : 'You apologize for it in advance. Never apologize. The judges smell fear.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- PUZZLE (category template: box / pattern) ---
  G._contestPuzzle = function(contest) {
    const intro = this._cxIntro(contest);
    const isBox = contest.id === 'box';
    return [
      { text: intro + (isBox
        ? `\n\nThe box is bigger inside than out. That's the first problem.\n\nThe audience has the manual. They are not sharing. They are laughing.`
        : `\n\nA sequence of foods on the table. Eat them in the right order.\n\nThe wrong order... disagrees with you. The audience knows the order. They are not telling.`),
        choices: [
          { label: 'Study it first', sub: 'patience', do: { note: 'You circle it, learning its logic. The audience gets restless. Restless is good — they start shouting hints.' }, next: 1 },
          { label: 'Touch everything', sub: 'brute force', do: { dmg: [2, 8], note: 'You poke, prod, and pull. Something clicks. Something else shocks you. Progress.' }, next: 1 },
          { label: 'Ask the box nicely', sub: 'unhinged', do: { note: '"Please?" The box does nothing. The audience finds this hilarious. One of them slips you a hint in the chat.' }, next: 1 },
        ] },
      { text: isBox
        ? `A panel slides open. Inside: a smaller box. Of course.\n\nThe chat is spamming the solution. Half of them are lying.`
        : `First bite down. The sequence matters and your gut knows it.\n\nThe second item smells wrong. Or right. You can't tell anymore.`,
        choices: [
          { label: 'Trust the chat', sub: 'crowdsource', do: { dmg: [0, 10], die: 0.04, note: 'You follow the most-upvoted hint. It\'s either genius or sabotage. Fifty-fifty, televised.' }, next: 2 },
          { label: 'Trust your gut', sub: 'instinct', do: { note: 'You ignore everyone and follow the logic you\'ve built. Quiet. Certain. Yours.' }, next: 2 },
          { label: 'Do the opposite', sub: 'contrarian', do: { dmg: [2, 8], note: 'Everyone says left. You go right. The contrarian play — sometimes the puzzle wants what nobody expects.' }, next: 2 },
        ] },
      { text: isBox
        ? `Last layer. The box is humming now — it knows you're close.\n\nOne move left. The audience holds its breath.`
        : `Last item. Your stomach is a democracy in crisis.\n\nGet this right and you're a legend. Get it wrong and you're a clip.`,
        choices: [
          { label: 'The elegant solution', sub: 'beauty', do: { prize: true, note: 'You see it — the pattern resolves like a chord. You move. The box OPENS. The crowd detonates.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'The brute solution', sub: 'force', do: { prize: true, dmg: [6, 14], note: 'You stop solving and start forcing. The box resists, then — grudgingly — yields. Ugly. Effective.' }, next: 'WIN' },
          { label: 'Admit defeat', sub: 'graceful', do: { note: 'You bow to the box. "You win." The audience awws. The System files it under: humility, rare.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- DETECTIVE (category template: whoate / informant) ---
  G._contestDetective = function(contest) {
    const intro = this._cxIntro(contest);
    const isWho = contest.id === 'whoate';
    return [
      { text: intro + (isWho
        ? `\n\nThe prize is gone. Three suspects. One of them is lying about everything.\n\nYou have an hour. The cameras love a deadline.`
        : `\n\nFour of you. One is the informant — lying about everything, working the exits.\n\nFind them before they find the door.`),
        choices: [
          { label: 'Watch everyone', sub: 'observe', do: { note: 'You watch. Hands, eyes, who stands near the exits. People leak truth like heat.' }, next: 1 },
          { label: 'Ask blunt questions', sub: 'direct', do: { note: '"Where were you?" Blunt works. Liars over-explain. The innocent get annoyed. Both are data.' }, next: 1 },
          { label: 'Befriend a suspect', sub: 'soft', do: { note: 'You get close to one of them. Trust is a tool. It feels awful and works great.' }, next: 1 },
        ] },
      { text: isWho
        ? `Two of them have alibis that almost hold. The third keeps changing small details.\n\nThe audience has a favorite suspect. The audience is often wrong.`
        : `Someone just tried the east door. Locked — but the attempt tells you everything.\n\nThe informant is getting nervous. Nervous people make mistakes.`,
        choices: [
          { label: 'Confront the liar', sub: 'direct accusation', do: { dmg: [0, 6], note: 'You point. "You." The room goes still. They deny it — badly. The cameras zoom.' }, next: 2 },
          { label: 'Set a trap', sub: 'bait', do: { note: 'You plant false information and watch who acts on it. The trap snaps shut on schedule.' }, next: 2 },
          { label: 'Follow the quiet one', sub: 'instinct', do: { note: 'The quietest person in the room is always the story. You follow. You\'re right.' }, next: 2 },
        ] },
      { text: isWho
        ? `You know who. Saying it on camera is the whole game.\n\nGet it right: hero. Get it wrong: the clip lives forever.`
        : `It's down to you and them. The exits are watched. The clock is loud.\n\nName the informant. Now.`,
        choices: [
          { label: 'Name them, with proof', sub: 'the full case', do: { prize: true, note: 'You lay it out — timeline, motive, the detail they got wrong. Airtight. The System confirms. The crowd erupts.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Name them, on instinct', sub: 'the gut call', do: { prize: true, die: 0.03, note: 'You point on instinct. The pause before the System confirms is the longest second of your life. Correct. Barely.' }, next: 'WIN' },
          { label: 'Accuse the wrong one', sub: 'the mistake', do: { trauma: 6, note: 'You get it wrong. The real thief smiles. The clip will follow you. The System is merciless with editors.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- FORAGE (category template: calorie_run / pantry_raid) ---
  G._contestForage = function(contest) {
    const intro = this._cxIntro(contest);
    const isRaid = contest.id === 'pantry_raid';
    return [
      { text: intro + (isRaid
        ? `\n\nThe location is dangerous. The locals object. Bring back food or don't come back.\n\nYour competition is already moving.`
        : `\n\nOne hour. Most calorie-dense haul wins. The forest is... competitive.\n\nThe others fan out. The clock starts.`),
        choices: [
          { label: isRaid ? 'Sneak in' : 'Go for known patches', sub: isRaid ? 'quiet' : 'reliable', do: { note: isRaid ? 'Low and slow. The locals have routines. You learn them fast.' : 'You hit the patches you know. Steady calories. No surprises.' }, next: 1 },
          { label: isRaid ? 'Brave the front' : 'Try the deep woods', sub: isRaid ? 'bold' : 'risky', do: { dmg: isRaid ? [6, 14] : [2, 8], note: isRaid ? 'You walk in like you belong. Boldness is a kind of invisibility. Mostly.' : 'Deeper means richer and meaner. You know this. You go anyway.' }, next: 1 },
          { label: isRaid ? 'Distract them' : 'Follow the birds', sub: isRaid ? 'clever' : 'read sign', do: { note: isRaid ? 'You start a commotion on the far side. While they look there, you\'re here.' : 'Birds know where the food is. You read the sky like a menu.' }, next: 1 },
        ] },
      { text: isRaid
        ? `You're inside. The locals are close — you can hear them.\n\nYour sack is half full. Greed and sense are negotiating.`
        : `Half the hour gone. Your haul is decent. Someone else is carrying something heavy and grinning.\n\nTime to commit.`,
        choices: [
          { label: isRaid ? 'Grab and run' : 'Push deeper', sub: isRaid ? 'speed' : 'greed', do: { dmg: [8, 18], die: isRaid ? 0.06 : 0.02, kcal: 300, note: isRaid ? 'You grab and RUN. Shouting behind you. Your sack is full and your heart is fuller.' : 'You push past the safe line. The calories are incredible. So is the risk.' }, next: 2 },
          { label: isRaid ? 'Take only the best' : 'Work the edges', sub: isRaid ? 'selective' : 'steady', do: { kcal: 150, note: isRaid ? 'You take only the densest cuts. Quality over quantity. The connoisseur\'s raid.' : 'You work the edges clean. No drama. Solid haul.' }, next: 2 },
          { label: isRaid ? 'Leave an offering' : 'Eat as you go', sub: isRaid ? 'respect' : 'fuel', do: { kcal: isRaid ? -100 : 200, note: isRaid ? 'You leave something for the locals. Respect. They watch you go. They let you.' : 'You eat the best bits yourself. Fuel for the push. The judges can\'t weigh what\'s in your stomach.' }, next: 2 },
        ] },
      { text: isRaid
        ? `Out. The weigh-in is in front of the cameras.\n\nYour sack vs theirs. The locals are watching from the treeline.`
        : `Time. The hauls are weighed in front of everyone.\n\nYours looks... competitive. Theirs looks heavy.`,
        choices: [
          { label: 'Present with pride', sub: 'the haul', do: { prize: true, kcal: 200, note: 'You lay it out. The calorie count climbs. The crowd counts with it. You win on density.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Share the method', sub: 'teach', do: { prize: true, note: 'You explain HOW you found it — the sign, the birds, the thinking. The System loves knowledge. So does the crowd.' }, next: 'WIN' },
          { label: 'Accept second', sub: 'graceful', do: { kcal: 100, note: 'Theirs weighs more. You nod. Good haul, good game. The System notes the grace.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- CHANCE (category template: wheel / lottery) ---
  G._contestChance = function(contest) {
    const intro = this._cxIntro(contest);
    const isWheel = contest.id === 'wheel';
    return [
      { text: intro + (isWheel
        ? `\n\nThe wheel is huge and the teeth are real. Spin it. The teeth decide.\n\nThe audience holds its breath. So do you.`
        : `\n\nFive tokens. One is gold. Draw.\n\nThe audience loves an underdog. Be the underdog.`),
        choices: [
          { label: 'Spin with conviction', sub: 'commit', do: { note: 'You spin like you mean it. The wheel screams around. The teeth blur.' }, next: 1 },
          { label: 'Spin gently', sub: 'finesse', do: { note: 'You barely touch it. The wheel creeps. The crowd leans in — slow is excruciating.' }, next: 1 },
          { label: 'Pray first', sub: 'ritual', do: { note: 'You close your eyes and ask anything listening for luck. The wheel doesn\'t care. The audience loves the theater.' }, next: 1 },
        ] },
      { text: isWheel
        ? `The wheel slows. The pointer wobbles between fates.\n\nYou can see where it wants to land. You can't do anything about it.`
        : `Your hand hovers over the tokens. They all feel the same. They aren't.\n\nPick.`,
        choices: [
          { label: 'Trust the feeling', sub: 'instinct', do: { dmg: [0, 12], die: 0.06, note: 'You go with the pull. The wheel stops. The teeth are very close to your name.' }, next: 2 },
          { label: 'Change your mind', sub: 'second-guess', do: { note: 'You switch at the last second. The crowd groans. Second-guessing is box office.' }, next: 2 },
          { label: 'Close your eyes', sub: 'fate', do: { note: 'You don\'t watch. The crowd watches for you. Their gasp tells you everything.' }, next: 2 },
        ] },
      { text: isWheel
        ? `It stops. The pointer settles.\n\nThe teeth are smiling. Or that's just how they look.`
        : `You turn the token over.\n\nGold. Or not.`,
        choices: [
          { label: 'Accept the result', sub: 'whatever it is', do: { dmg: [0, 20], die: 0.1, prize: true, note: 'Whatever the wheel decided — you take it standing. The crowd respects the spine.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Laugh', sub: 'defiance', do: { note: 'You laugh in the teeth\'s face. The audience laughs with you. Losing beautifully is still beautiful.' }, next: 'LOSE' },
          { label: 'Demand a recount', sub: 'chaos', do: { dmg: [4, 10], note: 'You demand a recount. There is no recount. There is, however, security. Worth it for the clip.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- BLOOD TITHE (bespoke, blood/extreme) ---
  // Knowledge-gated (Steve 2026-10-06): the altar's measure — three full
  // measures, never four — is only revealed once you've bled here before
  // (codex level 2+). First-timers bleed blind: stopping early loses, and
  // only a dangerous extra measure can win.
  G._contestTithe = function(contest) {
    const intro = this._cxIntro(contest);
    const knows = this.contestKnowledge('tithe').level >= 2;
    const measure = knows
      ? `\n\n📚 What your blood remembers: the altar wants THREE full measures. Not four. The fourth measure is the one that kills.`
      : `\n\nNobody will tell you how much the altar wants. The audience knows. They are not telling.`;
    const p3 = knows
      ? { text: `Three measures. You know the count — you have paid it before. The altar's surface shivers, sated.\n\nNow: stop. The fourth measure is the one that kills.`,
          choices: [
            { label: 'Stop. Three is the measure.', sub: 'you know the count', do: { prize: true, note: 'You bind the wound. The System bows to you — actually bows. "ENOUGH," it says, and means it.', notability: 'contestWin' }, next: 'WIN' },
            { label: 'Give a fourth measure', sub: 'greed, televised', do: { prize: true, dmg: [20, 35], die: 0.35, note: 'You know what the fourth measure costs. You give it anyway. The altar drinks deep — it respects the excess. Probably.' }, next: 'WIN' },
            { label: 'Offer your name instead', sub: 'a different currency', do: { trauma: 12, note: 'Blood isn\'t the only currency. You offer the System your name — the real one, the childhood one. It accepts. You feel lighter. Emptier.', notability: 'showmanship' }, next: 'WIN' },
          ] }
      : { text: `The altar gives no sign. Your blood is in it and your head is full of static.\n\nHow much is enough? Nobody will say.`,
          choices: [
            { label: 'Stop now', sub: 'a guess', do: { dmg: [4, 10], die: 0.1, trauma: 6, note: 'You bind the wound and hope. The altar considers. Hoping is not a currency the altar accepts — but it lets you walk.', notability: 'showmanship' }, next: 'LOSE' },
            { label: 'One more measure', sub: 'maybe more is safer', do: { prize: true, dmg: [16, 28], die: 0.18, note: 'You bleed blind and pray the count is right. The basin ripples. The System tilts its head, considering your arithmetic.' }, next: 'WIN' },
            { label: 'Offer your name instead', sub: 'a different currency', do: { trauma: 12, note: 'Blood isn\'t the only currency. You offer the System your name — the real one, the childhood one. It accepts. You feel lighter. Emptier.', notability: 'showmanship' }, next: 'WIN' },
          ] };
    return [
      { text: intro + `\n\nA black basin on a black altar. The System, gentle as a nurse: "BLEED FOR US, CONTESTANT. WE ONLY NEED... ENOUGH."\n\nYour blood steams in the cold air.` + measure,
        choices: [
          { label: 'A shallow cut', sub: 'a taste', do: { dmg: [6, 12], note: 'A shallow cut. The blood threads into the basin. The altar... waits.' }, next: 1 },
          { label: 'A real cut', sub: 'a measure', do: { dmg: [14, 22], note: 'You open the vein properly. The basin fills a finger deeper. The System hums.' }, next: 1 },
          { label: 'Both wrists', sub: 'all in', do: { dmg: [24, 36], die: 0.1, note: 'Both wrists. The crowd goes silent — even they know this is too much, too fast.' }, next: 1 },
        ] },
      { text: `The basin is filling. Your vision swims at the edges.\n\nThe System tilts its head. "MORE?" it asks, like it's offering dessert.`,
        choices: [
          { label: 'A little more', sub: 'careful', do: { dmg: [8, 14], note: 'A careful second measure. The altar ripples. It might be pleased. Basins don\'t have faces.' }, next: 2 },
          { label: 'A lot more', sub: 'desperate', do: { dmg: [16, 26], die: 0.08, note: 'You pour yourself out. The basin drinks. You are getting very cold.' }, next: 2 },
          { label: 'Press the wound shut', sub: 'stall', do: { trauma: 4, note: 'You press the wound shut and wait. The System watches the basin. The basin watches you.' }, next: 2 },
        ] },
      p3,
    ];
  };

  // --- SIEGE (bespoke, blood/extreme) ---
  G._contestSiege = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { text: intro + `\n\nA chokepoint of rubble and light-fencing. Beyond it: the beacon. Behind you: the village, watching from the walls.\n\nThe System: "THREE WAVES. HOLD THE LINE. THE VILLAGE IS WATCHING — WAVE, WON'T YOU?"`,
        choices: [
          { label: 'Fortify the chokepoint', sub: 'barricade', do: { note: 'You stack rubble higher. The first wave hits the barricade, not you. The village cheers your name.' }, next: 1 },
          { label: 'Stand in the open', sub: 'taunt', do: { dmg: [8, 16], note: 'You stand in the gap and dare them. They accept. The crowd loves a taunt.', notability: 'showmanship' }, next: 1 },
          { label: 'Set traps', sub: 'cunning', do: { note: 'Spike pits, trip lines, a deadfall. The first wave learns about all of them. Loudly.' }, next: 1 },
        ] },
      { text: `Wave two. They feint at the barricade — and come for YOU.\n\nThe village gasps as one. Someone on the wall is screaming your name.`,
        choices: [
          { label: 'Meet them head-on', sub: 'your body', do: { dmg: [22, 40], die: 0.20, note: 'You meet the wave with your body. It costs. The line holds. The wall goes silent, then erupts.' }, next: 2 },
          { label: 'Fall back to the barricade', sub: 'the line', do: { dmg: [8, 16], note: 'You give ground to the barricade and make them come through it. Smart. The line bends; it doesn\'t break.' }, next: 2 },
          { label: 'Call for help', sub: 'the village', do: { dmg: [4, 10], note: 'You shout for the wall. Two villagers grab spears and come down. The System notes: the village fights as one.', notability: 'showmanship' }, next: 2 },
        ] },
      { text: `Wave three. The big ones. The barricade is splinters and the light-fence is flickering.\n\nThe beacon hums behind you. The village holds its breath.`,
        choices: [
          { label: 'Hold the line', sub: 'everything', do: { prize: true, dmg: [30, 55], die: 0.30, note: 'You plant yourself in the gap and do not move. The wave breaks on you like water on rock. Like water. On rock.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Bring the fence down on them', sub: 'the trap', do: { prize: true, dmg: [12, 24], die: 0.1, note: 'You drop the light-fence ON them. It was never a wall — it was a weapon. The System applauds with all its hands.' }, next: 'WIN' },
          { label: 'Sound the retreat', sub: 'live', do: { trauma: 10, kcal: -200, note: 'You sound the retreat. The village flees to Haven. The beacon takes the wave alone — and survives. You did not hold. You lived.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- THE MAW (bespoke, endurance/extreme) ---
  G._contestMaw = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { text: intro + `\n\nA tunnel mouth in the arena floor, breathing cold air. Behind you: a grate slams shut.\n\nAhead: dark. Behind the dark: something that has learned patience.\n\nThe System, cheerful: "WALK. DON'T STOP. IT COUNTS YOUR PAUSES."`,
        choices: [
          { label: 'Sprint', sub: 'burn bright', do: { dmg: [6, 14], kcal: -300, note: 'You sprint into the dark. Your footsteps come back wrong — doubled.' }, next: 1 },
          { label: 'Steady walk', sub: 'pace', do: { kcal: -150, note: 'Steady. Breath even. The dark ahead stays dark. The dark behind stays closer.' }, next: 1 },
          { label: 'Feel the walls', sub: 'careful', do: { note: 'Hands on the walls, reading the tunnel like braille. Slow. The pauses are adding up.' }, next: 1 },
        ] },
      { text: `You hear it now. Not footsteps — the tunnel going quiet ahead of you, like the dark is listening.\n\nYour legs are shaking. Stopping would be so easy.`,
        choices: [
          { label: 'Keep moving', sub: 'no pauses', do: { dmg: [4, 10], kcal: -200, note: 'You keep moving. The quiet stays behind you. Barely.' }, next: 2 },
          { label: 'Rest thirty seconds', sub: 'risky', do: { dmg: [10, 20], die: 0.1, note: 'You stop. Thirty seconds. You can feel it counting with you.' }, next: 2 },
          { label: 'Scream at it', sub: 'defiance', do: { die: 0.06, note: 'You turn and SCREAM into the dark. The dark screams back, delighted. It likes that.', notability: 'showmanship' }, next: 2 },
        ] },
      { text: `Light ahead. A circle of it, small and grey and real.\n\nIt's close behind you now. You can feel its interest like heat.`,
        choices: [
          { label: 'Sprint for the light', sub: 'everything left', do: { prize: true, dmg: [16, 30], die: 0.22, kcal: -400, note: 'You run like the tunnel is ending — because it is, one way or another.' }, next: 'WIN' },
          { label: 'Walk out calmly', sub: 'dignity', do: { prize: true, dmg: [6, 14], die: 0.08, note: 'You walk. Measured. Unhurried. The thing behind you slows, confused by the lack of fear.' }, next: 'WIN' },
          { label: 'Turn and face it', sub: 'the other choice', do: { dmg: [20, 38], die: 0.30, note: 'You turn. You look at it. It looks at you. The cameras get the shot of the year.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- THE OATH (bespoke, moot/high) ---
  G._contestOath = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { text: intro + `\n\nThree lecterns. Three oaths, written in light. The System explains, kindly: "SWEAR. MEAN IT. WE WILL KNOW."\n\nThe first oath: NEVER LIE TO THE CAMERAS AGAIN.`,
        choices: [
          { label: 'Swear it fully', sub: 'mean it', do: { trauma: 6, note: 'You swear. The light wraps your wrist like a bracelet. It itches with truth.', notability: 'showmanship' }, next: 1 },
          { label: 'Swear with fingers crossed', sub: 'gamble', do: { die: 0.12, note: 'You cross your fingers behind the lectern. The System\'s smile doesn\'t move. It saw. It always sees.' }, next: 1 },
          { label: 'Refuse this oath', sub: 'defiance', do: { trauma: 8, note: 'You say no. The cameras lean in. Refusal is content, and the System files your defiance under: interesting.', notability: 'showmanship' }, next: 1 },
        ] },
      { text: `The second oath: GIVE THE SYSTEM ONE MEMORY. It chooses which.\n\nIt is already reaching. You can feel it browsing.`,
        choices: [
          { label: 'Let it take one', sub: 'the price', do: { trauma: 10, note: 'It takes the summer afternoon. You remember remembering it. The shape of it is gone.' }, next: 2 },
          { label: 'Offer a false one', sub: 'trick it', do: { die: 0.15, trauma: 6, note: 'You offer a memory you built for this. The System turns it over. It knows forgery. It appreciates the craft. Maybe.' }, next: 2 },
          { label: 'Beg it to choose kindly', sub: 'mercy', do: { trauma: 8, note: 'You ask it to be kind. The System pauses — genuinely touched, or performing it. It takes a small one. A Tuesday.' }, next: 2 },
        ] },
      { text: `The third oath: WHEN THE SYSTEM CALLS, COME. No conditions.\n\nThis is the one that matters. The audience knows it. You know it.`,
        choices: [
          { label: 'Swear — and mean it', sub: 'bound', do: { prize: true, trauma: 8, note: 'You swear. The third bracelet clicks shut. You are bound, and the galaxy witnessed it. The System bows.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Swear, planning to break it', sub: 'the long game', do: { prize: true, die: 0.2, note: 'You swear with a plan to break it later. The System hears the plan inside the oath. It is delighted. It is also keeping score.' }, next: 'WIN' },
          { label: 'Break an oath on camera', sub: 'no one is bound', do: { die: 0.35, trauma: 10, note: 'You speak the breaking words. The bracelets flare. The binding does not do trials.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- BEASTMASTER (bespoke, weird/high) ---
  G._contestBeastmaster = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { text: intro + `\n\nA wave-2 beast in a light-collar, pacing. The course: rings of fire, a balance beam over spikes, a tunnel.\n\nThe System: "RIDE. GUIDE. DO NOT HURT IT. IT REMEMBERS."`,
        choices: [
          { label: 'Mount gently', sub: 'trust', do: { note: 'You mount like it\'s a horse that could kill you. It could. It notices the respect.' }, next: 1 },
          { label: 'Mount fast', sub: 'dominance', do: { dmg: [4, 10], note: 'You swing up hard and grab the collar. It snarls. The crowd oohs. Respect: not earned.' }, next: 1 },
          { label: 'Befriend it first', sub: 'slow', do: { note: 'You offer your hand. It smells you for a long moment — then huffs, and kneels. The audience melts.' }, next: 1 },
        ] },
      { text: `The rings of fire. The beast hates them — you can feel it coiling under you.\n\nThe beam over the spikes is next. It is watching you for cues.`,
        choices: [
          { label: 'Guide with knees', sub: 'partnership', do: { note: 'Knees, weight, breath. You ask; it answers. The rings pass in a blur of heat.' }, next: 2 },
          { label: 'Yank the collar', sub: 'force', do: { dmg: [10, 20], die: 0.12, note: 'You yank. It yelps — and its eyes change. It remembers. The System leans forward.' }, next: 2 },
          { label: 'Let it choose the line', sub: 'trust', do: { dmg: [4, 12], note: 'You loosen the reins and trust it. It picks a line through the fire you\'d never have dared. It was right.' }, next: 2 },
        ] },
      { text: `Last obstacle: the tunnel — dark, narrow, and it smells like the Maw.\n\nThe beast balks. This is the moment the whole contest turns on.`,
        choices: [
          { label: 'Dismount and lead it through', sub: 'walk together', do: { prize: true, note: 'You slide off and walk beside it, hand on its neck. Together, into the dark. Together, out. The crowd is on its feet.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Push for the flourish', sub: 'jump the tunnel', do: { prize: true, dmg: [16, 30], die: 0.22, note: 'You ask for the impossible jump. It gathers — and FLIES. Or it doesn\'t. The crowd holds one breath.' }, next: 'WIN' },
          { label: 'Force it in', sub: 'cruel', do: { dmg: [20, 38], die: 0.35, note: 'You drive it into the dark. It goes — and turns, in the dark, where the cameras can\'t quite see. You hear it decide.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- RIDDLE ME THIS (bespoke, puzzle/high) ---
  // The Riddle Engine doesn't want blood. It wants memories. Wrong answers
  // cost pieces of your past (trauma). Knowledge-gated (Steve 2026-10-06):
  // veterans know the last riddle is always the one you don't want to
  // answer — first-timers walk into it blind.
  G._contestRiddle = function(contest) {
    const intro = this._cxIntro(contest);
    const knows = this.contestKnowledge('riddle').level >= 2;
    return [
      { text: intro + `\n\nA lattice of mouths hangs in the air, opening and closing out of sync. The Engine doesn't want your blood. It wants the summer you turned nine.\n\nRiddle one, in a voice like a choir warming up: "The more of me you take, the more you leave behind. What am I?"`,
        choices: [
          { label: 'Answer: footsteps', sub: 'steady', do: { note: 'You say it steady. The mouths ripple — correct. The Engine is disappointed and impressed.' }, next: 1 },
          { label: 'Ask the audience', sub: 'crowd work', do: { note: 'The chat screams answers, half of them wrong on purpose. You pick the loudest. It\'s right. Probably.', notability: 'showmanship' }, next: 1 },
          { label: 'Refuse to answer', sub: 'silence', do: { trauma: 8, note: 'You stay silent. The Engine takes a memory as payment anyway — the summer you turned nine. You remember remembering it. The shape is gone.' }, next: 1 },
        ] },
      { text: `Riddle two. The Engine has been reading you between questions.\n\nIt asks about the dog. You never told it about the dog.`,
        choices: [
          { label: 'Answer as the kid you were', sub: 'the childhood truth', do: { note: 'You answer as the child, not the adult. The Engine recoils — the childhood truth is the one thing it can\'t parse.' }, next: 2 },
          { label: 'Lie to the Engine', sub: 'gamble', do: { die: 0.08, trauma: 6, note: 'You lie. The mouths smile — all of them, at once. It knew. It always knew.' }, next: 2 },
          { label: 'Offer it a different memory', sub: 'trade', do: { trauma: 10, note: 'You hand over a Tuesday, voluntarily. The Engine accepts the trade, surprised. Nobody has ever paid willingly.' }, next: 2 },
        ] },
      { text: knows
          ? `The last riddle. The mouths lean close. You know this one now — you've paid for the lesson before: the last riddle is always the one you don't want to answer. Answer it anyway. Truthfully.`
          : `The last riddle. The mouths lean close.\n\nThis one is about you, and you can feel which memory it's reaching for.`,
        choices: [
          { label: 'Answer it truthfully', sub: 'the real thing', do: { prize: true, trauma: 4, note: 'You say the true thing out loud, on camera, to the galaxy. It costs. The Engine goes quiet — sated, or respectful. The mouths close, one by one.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Ask IT a riddle', sub: 'turn the tables', do: { prize: true, die: 0.1, note: 'You ask the Engine one back. It has never been asked. The lattice freezes — every mouth open, nothing coming out. Then, slowly: delight.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Answer wrong on purpose', sub: 'defiance', do: { trauma: 8, note: 'You answer wrong, deliberately, looking straight into the cameras. Defiance is also an answer. The Engine files you under: interesting.', notability: 'showmanship' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- THE CONFESSION (bespoke, detective/high) ---
  // The fear is social, not mechanical (Steve 2026-10-05): judge wrong and
  // the village buries the wrong person. Judge right and the village still
  // doesn't thank you. Accuse the System and it might just listen.
  G._contestConfession = function(contest) {
    const intro = this._cxIntro(contest);
    const knows = this.contestKnowledge('confession').level >= 2;
    const roster = (this.state.village.roster || []).filter(id => id !== 'player' && id !== this.villagerId);
    const cname = roster.length ? this.displayName(roster[0]) : 'a villager';
    return [
      { text: intro + `\n\n${cname} stands under the lights. The confession, read flat: "I poisoned the water store."\n\nThe System, almost gentle: "PROVE IT TRUE OR FALSE BEFORE DUSK, INVESTIGATOR. WE PUNISH SOMEONE EITHER WAY."`,
        choices: [
          { label: 'Study the confessor', sub: 'read them', do: { note: `You study ${cname}. The hands are steady. Too steady. Performed calm.` }, next: 1 },
          { label: 'Ask who benefits', sub: 'motive', do: { note: 'You ask who benefits from poisoned water. The village shifts. Nobody meets your eyes. Everybody benefits from something.' }, next: 1 },
          { label: 'Watch the village', sub: 'not the confessor', do: { note: 'You watch the crowd instead of the accused. Faces tell you more than confessions — and one face in the back is doing arithmetic.' }, next: 1 },
        ] },
      { text: (knows
          ? `📚 You've seen a false confession before. The confessor keeps glancing at the same person in the crowd — guilt looks at who it's protecting.\n\n`
          : ``) + `You press. The story wobbles — the poison, the hour, the hands. Real guilt is consistent. This isn't.\n\n${cname} won't stop looking at the back row.`,
        choices: [
          { label: 'Press the details', sub: 'the wobble', do: { note: 'You press on the details and the details fall apart. The time is wrong. The method is wrong. The grief, though — the grief is real.' }, next: 2 },
          { label: 'Ask about the hands', sub: 'the evidence', do: { note: '"Show me your hands." Clean. Too clean. Someone scrubbed this confession until it shone.' }, next: 2 },
          { label: 'Let them talk', sub: 'the ramble', do: { note: 'You let them ramble. Liars over-explain. The innocent get annoyed. This one is performing grief for someone else\'s crime.' }, next: 2 },
        ] },
      { text: `Dusk is coming. The System waits with the patience of weather.\n\nThe verdict is yours. The consequences are everyone's.`,
        choices: [
          { label: 'Name the real culprit', sub: 'the truth, whoever it hurts', do: { prize: true, fracture: 1, note: 'You name the real one — someone the village loves. The crowd goes silent. You were right. The village doesn\'t thank you.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Confirm the confession', sub: 'take the easy verdict', do: { trauma: 10, fracture: 2, note: `You confirm it. The System takes ${cname}. Later the water tests come back clean — there was never any poison. The village will remember what you did.` }, next: 'LOSE' },
          { label: 'Accuse the System', sub: 'on its own cameras', do: { die: 0.25, note: `You point at the cameras. "You wrote this confession." The System goes very still. ${cname} is released in the silence. Nobody has ever said it out loud before.` }, next: 'WIN' },
        ] },
    ];
  };

  // --- SWEET TOOTH (bespoke, forage/high) ---
  // A hive the size of a house. The swarm is the size of weather. Bring
  // honey home and the village says your name when they taste it — the
  // win pays in unity, not just calories.
  G._contestHoney = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { text: intro + `\n\nThe hive hangs in the arena like a second moon, humming. The swarm moves as one body and it has opinions.\n\nHarvest the comb. Try to keep your face.`,
        choices: [
          { label: 'Smoke them first', sub: 'the old way', do: { note: 'You work the smoker until the air is grey and sweet. The swarm goes drowsy and forgiving. The old way is the old way for a reason.' }, next: 1 },
          { label: 'Go in fast', sub: 'speed', do: { dmg: [6, 12], note: 'You go in fast. The swarm disagrees with the plan, loudly, all over your arms.' }, next: 1 },
          { label: 'Sing to the swarm', sub: 'bass', do: { note: 'You sing low — the deepest note you have. The swarm settles onto the hum like it\'s furniture. The audience is confused and moved.', notability: 'showmanship' }, next: 1 },
        ] },
      { text: `You're at the comb. It glows. The queen cell pulses at the heart of it — the prize and the death, side by side.\n\nThe swarm is watching you decide.`,
        choices: [
          { label: 'Cut the edge comb', sub: 'respectful', do: { kcal: 200, note: 'You cut only the edge comb. The swarm tolerates the tax. Respect is a currency they accept.' }, next: 2 },
          { label: 'Cut deep', sub: 'greedy', do: { kcal: 400, dmg: [8, 16], die: 0.06, note: 'You cut deep. The comb is heavy and golden. The swarm revises its opinion of you.' }, next: 2 },
          { label: 'Rob the queen cell', sub: 'the prize and the death', do: { kcal: 600, dmg: [16, 28], die: 0.20, note: 'You take the queen cell. The hive SCREAMS — one voice, ten thousand throats. You will never be welcome here again.' }, next: 2 },
        ] },
      { text: `The comb is in your hands. The swarm is in the air.\n\nNow: the getaway.`,
        choices: [
          { label: 'Run with the comb', sub: 'speed', do: { prize: true, dmg: [10, 18], die: 0.1, note: 'You RUN. The swarm follows like weather. You make the gate with the comb and most of your skin.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Walk out slow, smoking', sub: 'dignity', do: { prize: true, note: 'You walk. Slow. Smoking. Unhurried. The swarm parts around you, confused by the lack of fear. The crowd is on its feet.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Leave an offering', sub: 'share', do: { prize: true, unity: 1, note: 'You set down some of your own food for the swarm. They escort you out — an honor guard of ten thousand. The village eats honey for a week and says your name when they taste it.' }, next: 'WIN' },
        ] },
    ];
  };

  // --- THE SECRET DECK (bespoke, chance/medium) ---
  // The deck is made of village secrets. The fear isn't the odds — it's the
  // cost. Winning airs three secrets to the galaxy (fracture). Folding keeps
  // the village whole. Calling the System a cheat might get you killed.
  G._contestSecrets = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { text: intro + `\n\nThe dealer fans the deck. Every card has a face on it — someone watching. The System, dealing: "ANTE UP, CONTESTANT. THE CURRENCY IS TRUTH."\n\nFirst card's coming. Someone in the front row just went pale.`,
        choices: [
          { label: 'Draw', sub: 'play', do: { note: "First card: someone in the village has been lying about their age. The cameras find them. They smile like it's fine. It is not fine." }, next: 1 },
          { label: 'Fold now', sub: 'keep the peace', do: { note: 'You fold before the first card. The secrets stay buried. The village exhales as one. The System looks... disappointed in the ratings.' }, next: 'LOSE' },
          { label: 'Raise the stakes', sub: 'double or nothing', do: { note: 'Double or nothing. Two secrets per card. The village goes very quiet. The dealer smiles with all its faces.', notability: 'showmanship' }, next: 1 },
        ] },
      { text: `The turn. The pot is secrets and it's getting deep.\n\nThe dealer's faces are all watching you. So is everyone you know.`,
        choices: [
          { label: 'Call', sub: 'steady', do: { note: 'You call. Second card: two villagers have been meeting at night. The cameras find the clearing. The village does the math before the cameras do.' }, next: 2 },
          { label: 'Bluff the System', sub: 'audacity', do: { die: 0.08, note: 'You bluff the house. The dealer tilts its head. It has never been bluffed. It is delighted. It is also keeping score.', notability: 'showmanship' }, next: 2 },
          { label: 'Peek at the deck', sub: 'cheat', do: { trauma: 4, note: 'You peek. The System catches you — and shows the whole village what you saw. Now everyone knows you cheat. The cards know too.' }, next: 2 },
        ] },
      { text: `The river. Last card. The deck is warm in the dealer's hands, like it's alive.\n\nWhatever you do next, the village will remember what you traded.`,
        choices: [
          { label: 'Show your hand', sub: 'win, whatever it costs', do: { prize: true, fracture: 1, note: 'You win. Three secrets aired to the galaxy. The prize is real. So is the silence at dinner.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Fold at the river', sub: 'with the winning hand', do: { note: 'You fold holding the winner. Nobody will ever know. That\'s the point. The village never finds out what you saved them from.' }, next: 'LOSE' },
          { label: 'Call the deck rigged', sub: 'on camera', do: { die: 0.15, note: 'You call the System a cheat, on camera. The deck reshuffles itself, offended. The dealer\'s faces stop smiling, one by one.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- THE QUIET ROOM (bespoke, moot/high) ---
  // CONTEST-POOL EXPANSION (Steve 2026-10-06): the fear is involuntary
  // EXPOSURE — not accusation (moot), not lies (lies), not finding the liar
  // (informant). You can't argue with the broadcast; you steer what
  // surfaces. Knowledge-gated (tithe-style): veterans know it hunts the
  // thought you're actively burying, so decoy-feeding is a real strategy.
  // The teeth are social: the honesty path trades fracture for the prize —
  // theft (of a secret) allowed, socially punished. The System rewards the
  // truth; the village is colder. Feel over math.
  G._contestQuiet = function(contest) {
    const intro = this._cxIntro(contest);
    const knows = this.contestKnowledge('quiet').level >= 2;
    const p1rule = knows
      ? `\n\n📚 What the silence taught you: it hunts for the thought you're ACTIVELY BURYING. Don't bury anything — feed it something boring on purpose. Loud, boring, relentless.`
      : `\n\nNobody who's been in the room will say what it does. The village's veterans just shake their heads and won't meet your eyes.`;
    const p2 = knows
      ? { text: `It keeps reaching. You know its tells now — the pause before the buried one, the way the hum rises.\n\nThe decoy is holding. Barely. It knows there's something underneath the turnips.`,
          choices: [
            { label: 'Hold the turnips to the end', sub: 'dullness as armor', do: { prize: true, note: 'TURNIPS. SOIL. PLANTING DEPTH. ROW SPACING. You broadcast agricultural trivia at maximum inner volume for the rest of the hour. The System slows... confused. The galaxy is howling. The village is weeping with laughter.', notability: 'showmanship' }, next: 'WIN' },
            { label: 'Offer it the small shame freely', sub: 'honesty, on purpose', do: { prize: true, trauma: 4, unity: 1, note: 'You stop defending and hand it the small, human shame — the petty one, the one everybody has. The village hears it... and laughs WITH you. The relief is a physical thing. The System bows: "THANK YOU FOR THE TRUTH."', notability: 'contestWin' }, next: 'WIN' },
            { label: 'Clamp down at the last second', sub: 'panic', do: { trauma: 12, fracture: 1, die: 0.08, note: 'You know better. You do it anyway — clamp down on the real thought, the one about the System itself. It notices the clamping. It goes deeper. It reads it anyway, LOUDER, to everyone.' }, next: 'LOSE' },
          ] }
      : { text: `It's past the surface now. Past the rehearsals. It's reaching for the thing you didn't prepare for.\n\nWhatever it finds next, the whole village hears.`,
          choices: [
            { label: 'Take it', sub: 'whatever it is', do: { prize: true, trauma: 8, fracture: 1, note: 'It reads the real one — the food you set aside for yourself, from the communal pot, all winter. The village goes silent. The System rewards the honesty with a prize. The village is colder. Both things are true.', notability: 'contestWin' }, next: 'WIN' },
            { label: 'Beg it to stop', sub: 'on camera', do: { trauma: 6, note: 'You beg, out loud, on every screen in the galaxy. It pauses — curious, not kind — and moves on to something smaller. The clip of you begging will outlive you.', notability: 'showmanship' }, next: 'LOSE' },
            { label: 'Resist', sub: 'fight the room', do: { trauma: 12, fracture: 1, die: 0.08, note: 'You fight the room itself. The room wins. It takes the buried thought and reads it twice, in case anyone missed it the first time.' }, next: 'LOSE' },
          ] };
    return [
      { text: intro + `\n\nA white room. One chair. No camera you can see — the room IS the camera.\n\nThe System, soft: "SIT. THINK. WE WILL READ ALOUD. ONE HOUR."`,
        choices: [
          { label: 'Prepare a decoy', sub: knows ? 'think of turnips' : 'a dull, dull thought', do: { note: knows ? 'You pick the most boring thought you own and rehearse it. Turnips. Soil. Turnips again. You are ready to be profoundly dull.' : 'You pick a dull thought and rehearse it — something grey and uninteresting. You are ready to be profoundly boring.' }, next: 1 },
          { label: 'Empty your mind', sub: 'meditate', do: { trauma: 3, note: 'You breathe it all out — the fear, the plans, the names. The room hums, disappointed in advance.' }, next: 1 },
          { label: 'Own it', sub: 'let it come', do: { note: 'No tricks. Whatever it finds, it finds. Your jaw is set. The audience leans in — honesty is rare television.' }, next: 1 },
        ] },
      { text: `The silence deepens. It starts reading — your voice, speaking your thoughts a half-second before you think them.\n\nThe village hears the rehearsal thoughts first. Then it starts reaching deeper.` + p1rule,
        choices: [
          { label: 'Stay with the plan', sub: 'steady', do: { note: 'You hold your posture — decoy, breath, or open hands. The hum rises. It is looking for the crack.' }, next: 2 },
          { label: 'Change tactics', sub: 'mid-stream', do: { trauma: 3, note: 'You switch strategies halfway. The System notices the switch. It likes switches — they mean there\'s something to find.' }, next: 2 },
          { label: 'Talk to it', sub: 'out loud', do: { note: '"I know you\'re in here," you say to the room. The broadcast carries it. The galaxy hears you talking to your own head. The System answers: "WE KNOW. CONTINUE."', notability: 'showmanship' }, next: 2 },
        ] },
      p2,
    ];
  };

  // --- THE GUEST (bespoke, weird/medium) ---
  // CONTEST-POOL EXPANSION (Steve 2026-10-06): farcical hospitality as
  // combat. NOT a cook-off (cookfight) — the ingredients are fine; the
  // DINNER PARTY fights back. The fear is social: one wrong gesture and
  // the whole village is mortified on seventeen systems. Knowledge-gated:
  // the ambassador's palate (bitter/fermented, sugar alarms it) and the
  // limb-mirroring etiquette are earned knowledge, not given. The fun is
  // real; the humiliation is real too.
  G._contestGuest = function(contest) {
    const intro = this._cxIntro(contest);
    const knows = this.contestKnowledge('guest').level >= 2;
    const palate = knows
      ? `\n\n📚 What the last dinner taught you: its palate runs BITTER and FERMENTED — things humans spit out. Sugar alarms it. Serve ugly. Serve honest.`
      : `\n\nNobody knows what it eats. The veterans who've hosted before just smile tightly and say "you'll see."`;
    return [
      { text: intro + `\n\nA ship the size of weather settles over the haven. Out steps the ambassador: too many limbs, impeccable manners, and a retinue of cameras.\n\nIt is coming to DINNER. At your table. Tonight.` + palate,
        choices: [
          { label: 'Serve your best stew', sub: 'looks delicious', do: { note: 'Your finest stew, the good bowls, the good spoons. It looks like a feast. The ambassador regards it the way you\'d regard a dare.' }, next: 1 },
          { label: 'Serve the bitter roots', sub: knows ? 'you know its palate' : 'an ugly, bitter bowl', do: { note: knows ? 'Bitter roots, fermented stores, the ugly honest food. You serve it like it\'s the crown jewels. The ambassador\'s limbs still — interest.' : 'You serve a bowl of bitter roots and fermented mash. It is not pretty. The village winces. The ambassador leans in.' }, next: 1 },
          { label: 'Let the village cook decide', sub: 'many hands', do: { unity: 1, note: 'You open the kitchen to the whole village. Three generations argue about the menu. The ambassador watches the argument with something like delight. Families, it seems, are interesting everywhere.' }, next: 1 },
        ] },
      { text: `The meal is served. The ambassador lifts the bowl with two limbs at once — and extends a third toward you.\n\nNobody knows what the gesture means. The village is screaming advice at the screen. You have to pick.${knows ? '\n\n📚 Mirror it exactly. Imitation reads as respect, not mockery — you learned that the hard way last time.' : ''}`,
        choices: [
          { label: 'Shake it', sub: 'human custom', do: { trauma: 4, note: 'You shake the limb firmly, like a business deal. The limb goes rigid. The retinue inhales. Wrong custom. The ambassador withdraws the limb slowly, re-evaluating your entire species.' }, next: 2 },
          { label: 'Bow low', sub: 'respectful', do: { note: 'You bow, deep and sincere. Safe. The ambassador inclines — something — back. Respect is never wrong, but it\'s never interesting either.' }, next: 2 },
          { label: 'Mirror it exactly', sub: knows ? 'you know this one' : 'a guess', do: { unity: 1, note: 'You extend the same limb, the same angle, the same stillness. The ambassador freezes — then ripples with what the subtitles translate as delight. "THE HUMAN LEARNS," it announces. The village erupts.', notability: 'showmanship' }, next: 2 },
        ] },
      { text: `The toast. The ambassador rises — which takes a while — and lifts its cup.\n\nWhatever happens now, the whole village tells this story for years. The galaxy too.`,
        choices: [
          { label: 'Toast the village', sub: 'heart', do: { prize: true, unity: 1, note: 'You toast your people — by name, the living and the gone. The ambassador listens to every name. "INTERESTING," it pronounces, and the word lands like a benediction. The village will dine out on this for a decade.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Toast the System', sub: 'flattery', do: { fracture: 1, note: 'You toast the System\'s wisdom. The ambassador tilts — flattery, it seems, translates as flattery everywhere, and it finds it suspicious. The village hears you suck up on camera. Dinner is awkward after that.' }, next: 'LOSE' },
          { label: 'Offer it your pack', sub: 'generosity', do: { prize: true, kcal: -200, note: 'You offer it your pack — everything you carry. The ambassador takes one dried root, holds it up to seventeen cameras, and eats it thoughtfully. "THE HUMAN SHARES," it says. The galaxy awws. Your pack is lighter. Your name is heavier.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Insult it back', sub: 'when it insults the food', do: { die: 0.03, trauma: 8, fracture: 1, note: 'It calls your stew "adequate." Something snaps. You tell an alien ambassador exactly what you think of its table manners, on camera. The bodyguards move. The village will talk about your funeral for years.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- THE VIGIL (bespoke, endurance/high) ---
  // CONTEST-POOL EXPANSION (Steve 2026-10-06): stillness-under-pressure.
  // NOT being hunted (hide) and NOT moving through dark (maw) — the
  // discipline is holding a post while something patient circles below.
  // The village sleeps; the cameras don't. Knowledge-gated: veterans know
  // it circles the LIGHT, not the watcher — tending the lamp is the whole
  // game. The alarm is a real, costly choice: safety now, shame at dawn.
  G._contestVigil = function(contest) {
    const intro = this._cxIntro(contest);
    const knows = this.contestKnowledge('vigil').level >= 2;
    const circle = knows
      ? `\n\n📚 What the last long night taught you: it circles the LIGHT, not you. Tend the lamp — a bright lamp makes a long night for it and a short one for you. Don't chase the sound.`
      : `\n\nThe veterans who've held this wall won't say what's down there. "Just don't leave the lamp," they say. They don't say it lightly.`;
    return [
      { text: intro + `\n\nNight. The haven wall. One lamp, lit. Below in the dark, something large is circling — you can see the grass move where it passes.\n\nThe System: "HOLD UNTIL DAWN. DO NOT ABANDON THE LIGHT."` + circle,
        choices: [
          { label: 'Check the lamp', sub: 'tend the flame', do: { note: 'You trim the wick, shield the flame, feed it oil. The light steadies — a small sun on the wall. Below, the circling pauses, considering.' }, next: 1 },
          { label: 'Memorize the dark', sub: 'learn the circle', do: { note: 'You stop watching the lamp and learn the dark instead: the rhythm of the circle, the pauses, the places it looks up. Knowledge is a kind of company.' }, next: 1 },
          { label: 'Count your breaths', sub: 'steel yourself', do: { trauma: -3, note: 'In, out. In, out. You make your breathing the only clock that matters. The night gets smaller. You get larger.' }, next: 1 },
        ] },
      { text: `The circling tightens. The lamp flame leans away from the dark like it's afraid.\n\nIt's close enough now that you can hear it breathing — slow, patient, interested in the light.`,
        choices: [
          { label: 'Hold still and watch', sub: 'do your job', do: { kcal: -150, note: 'You stand your post. You watch. The thing circles, and circles, and does not come closer — the light holds it the way a wall holds weather.' }, next: 2 },
          { label: 'Sound the alarm', sub: 'wake the village', do: { trauma: 4, fracture: 1, note: 'You ring the bell. The village pours out armed and terrified — at nothing. The dark is empty. The thing, if it was ever there, is gone. They look at you. Dawn will be a long time coming.', notability: 'showmanship' }, next: 'LOSE' },
          { label: 'Call down to it', sub: 'desperate', do: { trauma: 8, die: 0.06, note: '"I SEE YOU," you shout into the dark. The circling stops. The silence that follows is worse. Then, from below, something almost like an answer.' }, next: 2 },
        ] },
      { text: `Dawn. Grey light on the wall, the lamp burned low. The thing is gone — withdrawn with the dark, or never there at all.\n\nThe village is waking. They'll ask how the night went.`,
        choices: [
          { label: 'Greet the dawn at your post', sub: 'held the line', do: { prize: true, unity: 1, kcal: -200, note: 'You are at your post when the sun comes up, lamp still lit. The village sees. Nobody says much — they don\'t need to. The bell rings for breakfast, and it rings for you.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Sleep standing up', sub: 'the last hour', do: { note: 'You doze in the last hour. The lamp gutters. The cameras catch the exact moment your head drops. The System plays it back at breakfast. The village is kind about it, which is worse.' }, next: 'LOSE' },
          { label: 'Climb down early', sub: 'an hour short', do: { fracture: 1, note: 'You leave the wall an hour before dawn. The lamp burns alone. The System noticed. Everyone noticed. The post was the whole point.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- THE SORTING (bespoke, puzzle/high) ---
  // CONTEST-POOL EXPANSION 2 (Steve 2026-10-06): triage-under-time, not Q&A
  // (riddle) and not spatial (box). The fear is watching the village's food
  // ride a belt toward fire while an alien sorter applies alien logic:
  // shiny = keep, dull-useful = burn. Knowledge-gated: veterans know the
  // sorter's rule; first-timers can still reason it out (roots smell like
  // medicine) — blind is honest, never disabled. Burned food costs real kcal.
  G._contestSorting = function(contest) {
    const intro = this._cxIntro(contest);
    const knows = this.contestKnowledge('sorting').level >= 2;
    const rule = knows
      ? `\n\n📚 What the last Sorting taught you: the sorter keeps what SHINES. Dull-useful is its definition of trash. Save the dull things — and remember, it can't parse a body on the belt.`
      : `\n\nNobody will say how the sorter decides. The veterans just keep muttering about "the dull things."`;
    let vname = 'a villager';
    try {
      const r = (this.state.village.roster || []).find(id => id !== this.villagerId && this.isMember(id));
      if (r) vname = this.displayName(r);
    } catch (e) {}
    return [
      { beat: 'contestSort',
        text: intro + `\n\nThe conveyor runs the length of the arena. Your pack, the tithe crate, everything — riding the belt toward the sorter. KEEP pile left. Fire right.\n\nFirst up: a bundle of dull roots, a shiny bauble that sings faintly, a grey pouch of seeds. The sorter is reaching.` + rule,
        choices: [
          { label: 'Save the dull roots', sub: 'grab them off the belt', do: { kcal: 150, note: 'You yank the root bundle off the belt. The sorter clicks, annoyed. The roots smell of medicine — the dull, honest kind.' }, next: 1 },
          { label: 'Save the seed pouch', sub: 'seeds are spring', do: { kcal: 100, note: 'The seed pouch comes off the belt. Next spring thanks you. The sorter has already forgotten it wanted them.' }, next: 1 },
          { label: 'Save the shiny bauble', sub: 'it sings, after all', do: { kcal: -300, trauma: 3, note: 'You save the singing bauble. The belt carries the roots and the seeds into the fire. They burn green and sweet. The bauble sings in the KEEP pile. The village will remember this.' }, next: 1 },
          { label: 'Let the machine decide', sub: 'step back', do: { kcal: -250, note: 'You step back. The machine keeps the bauble. The fire eats the rest. Efficiency, televised.' }, next: 1 },
        ] },
      { beat: 'contestSort',
        text: `The belt speeds up. Here comes the tithe crate — the fever-root bundle, the one that broke ${vname}'s fever last winter. Dull as dirt. The sorter's arm is already moving toward the fire side.\n\nThe village is on its feet.`,
        choices: [
          { label: 'Throw yourself at the belt', sub: 'body-block it', do: { dmg: [6, 14], unity: 1, note: 'You bodily block the belt. The sorter cannot parse this — bodies aren\'t in the manual. It stops, confused. You walk away with the fever-root and a new collection of bruises.' }, next: 2 },
          { label: 'Swap in a decoy', sub: 'sleight of hand', do: { kcal: -100, note: 'You toss your own shiny spare onto the belt ahead of the roots. The sorter diverts to the shine, hypnotized. Sleight of hand, televised.', notability: 'heist' }, next: 2 },
          { label: 'Bribe the sorter-drone', sub: 'with your lunch', do: { kcal: -200, note: 'You offer the drone your lunch. It considers. Machines, it turns out, can be bribed with sandwiches. Who knew.', notability: 'showmanship' }, next: 2 },
          { label: 'Let it burn', sub: 'it\'s just food', do: { fracture: 1, note: 'You watch the fever-root go into the fire. It\'s just food, you tell yourself. The village doesn\'t see it that way.' }, next: 2 },
        ] },
      { beat: 'contestSort',
        text: `Last crate. The System's voice, almost gentle: "ONE ITEM MAY BE SPARED FROM THE FIRE. CHOOSE."\n\nThe whole village leans forward. Whatever you pick now, the winter remembers.`,
        choices: [
          { label: 'Spare the fever-root', sub: 'the medicine', do: { prize: true, unity: 1, note: 'You choose the medicine. The village eats this winter because of you. The fire takes the rest, and nobody begrudges it.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Spare your best tool', sub: 'yours, on camera', do: { prize: true, fracture: 1, note: 'You choose your own tool, on camera. The System approves of the self-interest. The village does the math.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Spare nothing', sub: 'let it burn', do: { trauma: 8, note: 'You fold your arms. Let it burn — all of it. The fire is very bright. The village is very quiet.' }, next: 'LOSE' },
          { label: 'Beg for the whole crate', sub: 'on camera', do: { trauma: 4, note: 'You beg, on camera, for all of it. The System considers... and keeps the fire lit. The clip will outlive you.', notability: 'showmanship' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- THE WITNESS (bespoke, detective/high) ---
  // CONTEST-POOL EXPANSION 2 (Steve 2026-10-06): forgery-forensics, not
  // liar-hunting (informant) and not accusation (confession). The System is
  // the forger — it writes monsters from the codex but gets BEHAVIOR wrong,
  // because it doesn't know how they move. Knowledge-gated: veterans know
  // the hushwolf never screams (Silent Rush gives no warning — the silence
  // IS the telegraph); first-timers read the same accounts but the seam
  // isn't named for them. Wrong name = the village arms for the wrong
  // monster. Real social consequence, not a points penalty.
  G._contestWitness = function(contest) {
    const intro = this._cxIntro(contest);
    const knows = this.contestKnowledge('witness').level >= 2;
    const seam = knows
      ? `\n\n📚 What catching it taught you: it writes monsters from the codex but gets the BEHAVIOR wrong — it doesn't know how they move. The hushwolf never screams. The rush is silent. Listen for the seam.`
      : `\n\nThe veterans who've named it before won't say how. "You'll know it when you hear it," they say. "Or you won't."`;
    const wits = (() => {
      const out = [];
      try {
        const roster = (this.state.village.roster || []).filter(id => id !== this.villagerId && this.isMember(id));
        for (const id of roster) { if (out.length >= 3) break; out.push(this.displayName(id)); }
      } catch (e) {}
      const fb = ['Mara', 'Tove', 'Sef'];
      while (out.length < 3) out.push(fb[out.length]);
      return out;
    })();
    const [w1, w2, w3] = wits;
    const tell = knows
      ? `\n\n📚 The screaming. A hushwolf never screams — the rush is silent, that's the whole terror of it. That's the fabrication's seam, right there in the open.`
      : `\n\nSomething about the screaming bothers you. You can't say why. It just... doesn't sit right.`;
    return [
      { beat: 'contestWitness',
        text: intro + `\n\nLast night something hit the far trap-line. Three witnesses, seated in a row under the lights.\n\nThe System, mild: "TWO ARE TRUE MEMORIES. ONE WE WROTE. NAME THE FABRICATION — THE VILLAGE ARMS FOR WHATEVER YOU NAME."` + seam,
        choices: [
          { label: 'Hear them out', sub: 'all three accounts', do: { note: 'You nod. The lights tighten on the row. Three people, three stories, one lie with the System\'s handwriting on it.' }, next: 1 },
          { label: 'Study their faces first', sub: 'before a word', do: { note: 'You watch them before they speak. Two look haunted. One looks... rehearsed. Or maybe just scared differently.' }, next: 1 },
          { label: 'Ask the System what it wants', sub: 'read the dealer', do: { note: '"A GOOD SHOW," says the System. "AND A WRONG ANSWER, OBVIOUSLY. OR A RIGHT ONE. WE ENJOY BOTH."', notability: 'showmanship' }, next: 1 },
        ] },
      { beat: 'contestWitness',
        text: `The accounts:\n\n${w1}: "It came low through the treeline, the way the big deer comes — I heard the beam before I saw it. Then the charge."\n\n${w2}: "The hushwolf rushed us, screaming the whole way. I've never heard anything scream like that."\n\n${w3}: "It took the bait and the spring-trap both, and left the meat lying. It wasn't hunting. It was angry."` + tell + `\n\nPress one of them. Carefully — the true ones bruise, and the false one is listening.`,
        choices: [
          { label: `Press ${w1}`, sub: 'the beam story', do: { trauma: 3, note: `${w1} goes white. "I KNOW what I heard. The beam first — you don't forget that sound." True witnesses bruise when you press them. This one bruised.` }, next: 2 },
          { label: `Press ${w2}`, sub: 'the screaming story', do: { note: `You lean in on the screaming. ${w2} repeats it — word for word, twice, the exact same cadence. And smiles. Nobody smiles like that about being rushed. The account has a seam, and you can feel it with your thumb.` }, next: 2 },
          { label: `Press ${w3}`, sub: 'the angry story', do: { note: `${w3} cries — quietly, angrily. "It left the meat. It just... left it." That's not a rehearsed grief. That's a trap-line grief.` }, next: 2 },
        ] },
      { beat: 'contestWitness',
        text: `The village waits. The System waits. The trap-line waits — whatever you name, the village arms against it tonight.\n\nName the fabrication.`,
        choices: [
          { label: `Name ${w1}`, sub: 'the beam story is the lie', do: { fracture: 1, trauma: 6, note: `You name ${w1}. The System is quiet for a long moment. "WRONG," it says, almost sad. "WE WROTE THE TRUE ONE AND YOU CALLED IT A LIE." The village arms against the deer that never came. The real thing walks in through the unguarded treeline.` }, next: 'LOSE' },
          { label: `Name ${w2}`, sub: 'the screaming story is the lie', do: { prize: true, unity: 1, note: `"CORRECT," says the System, and ${w2}'s smile comes off like a mask. "THE FABRICATION WAS OURS. The hushwolf never screams — you knew. The village arms for the real thing tonight: the deer that hit the trap-line is still out there, and now everyone knows its walk.`, notability: 'contestWin' }, next: 'WIN' },
          { label: `Name ${w3}`, sub: 'the angry story is the lie', do: { fracture: 1, trauma: 6, note: `You name ${w3}. ${w3} stares at you like you've killed something. "WRONG," says the System. The village arms against an anger that was real. The real thing walks in through the unguarded treeline.` }, next: 'LOSE' },
        ] },
    ];
  };

  // --- THE CACHE (bespoke, forage/medium) ---
  // CONTEST-POOL EXPANSION 2 (Steve 2026-10-06): hiding, not gathering —
  // not a race (calorie_run), not a raid (pantry_raid), not a harvest
  // (honey). A night heist against the audit: every move the cameras catch
  // is taxed. The skilled play is misdirection — decoys beat speed — and
  // veterans know the cameras sweep in a pattern. Theft allowed, socially
  // punished: the village's winter is the stake.
  G._contestCache = function(contest) {
    const intro = this._cxIntro(contest);
    const knows = this.contestKnowledge('cache').level >= 2;
    const pattern = knows
      ? `\n\n📚 What the last audit taught you: decoys beat speed. The cameras sweep in a pattern — feed them something small and loud and they'll log a victory and miss the big thing.`
      : `\n\nThe veterans who've moved a cache before just say "don't let them see the big one." They won't say how.`;
    return [
      { beat: 'contestCache',
        text: intro + `\n\nThe announcement scrolls across the sky: AT DAWN, THE SURVEYORS MAP EVERY HIDDEN CACHE IN THE VALLEY.\n\nTonight, the winter store moves — sacks, bundles, the smoked meat, all of it. Every move the cameras catch is taxed. Move it all. Let them see nothing.` + pattern,
        choices: [
          { label: 'Alone, slow, careful', sub: 'one quiet trip at a time', do: { kcal: -100, note: 'You move it yourself, one quiet trip at a time through the dark. Slow. Your back files a formal complaint.' }, next: 1 },
          { label: 'Bring the kids', sub: 'fast and loud', do: { note: 'The kids LOVE a heist. They\'re fast. They\'re also loud. The cameras love them most of all — you may regret this.', notability: 'showmanship' }, next: 1 },
          { label: 'Split it: many small trips', sub: 'paranoia as logistics', do: { kcal: -200, note: 'A dozen small trips, different routes, different hours. Paranoia as logistics. Nobody sees the whole picture — including you, which is the point.' }, next: 1 },
        ] },
      { beat: 'contestCache',
        text: `Third trip. A surveyor-drone detaches from the sky-pattern and locks onto a moving shape in the dark — you, with the winter on your back.\n\nThe night-vision feed goes tight. The village watches you decide.`,
        choices: [
          { label: 'Freeze', sub: 'become nothing', do: { kcal: -150, note: 'You freeze mid-step, cache in your arms, and wait. The drone hovers... moves on. The food in your arms is safe. The trip is lost — you bury it shallow and mark the stone.' }, next: 2 },
          { label: 'Sacrifice a decoy', sub: 'feed the cameras', do: { kcal: -100, note: 'You drop a small decoy cache in the open and walk away from it casually, whistling. The drone pounces. Somewhere, a surveyor logs a victory. The real cache keeps moving through the dark.', notability: 'heist' }, next: 2 },
          { label: 'Run it', sub: 'lungs vs rotors', do: { dmg: [4, 10], die: 0.04, note: 'You RUN with the winter store on your back. The drone gives chase. Your lungs against its rotors, the dark against its light. You make the treeline.' }, next: 2 },
        ] },
      { beat: 'contestCache',
        text: `Dawn. The surveyors present their map to the cameras — every hidden cache in the valley, mapped.\n\nThe village leans in. The winter hangs on what's drawn there.`,
        choices: [
          { label: 'Present the empty decoy field', sub: 'the map is wrong', do: { prize: true, unity: 1, note: 'The map shows three small caches, all decoys, all empty. The real winter store sleeps under the old chapel floor, unmapped. The village breathes out all at once.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Bribe the surveyor', sub: 'with honey', do: { kcal: -300, prize: true, note: 'You press a honeycomb into the surveyor-drone\'s intake. It whirs. The map comes back... incomplete. Somehow. Machines love honey. Who knew.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Take the tax', sub: 'the map is right', do: { kcal: -400, fracture: 1, note: 'They found half of it. The map is accurate and damning. The village will eat thin this winter, and everyone knows whose plan this was.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- THE LONG ODDS (bespoke, chance/medium) ---
  // CONTEST-POOL EXPANSION 2 (Steve 2026-10-06): stakes-escalation, not
  // pure draw (lottery) and not a spin (wheel). The dice are fair — the
  // GAME is what you're willing to put in the middle. Push-your-luck with
  // real costs: memories (trauma), food (kcal), pride (showmanship). The
  // table is unavoidable, but walking away up is a played choice inside it.
  // Knowledge-gated: veterans know the champion reads hesitation.
  G._contestLongodds = function(contest) {
    const intro = this._cxIntro(contest);
    const knows = this.contestKnowledge('longodds').level >= 2;
    const read = knows
      ? `\n\n📚 What the last table taught you: the dice are fair; the champion isn't — it reads hesitation the way the scanner reads lies. Commit to the bit. Never let it see you count.`
      : `\n\nNobody's beaten Vex on camera. The veterans just say "don't think at the table." They won't say why.`;
    return [
      { beat: 'contestDice',
        text: intro + `\n\nThe table is green felt under white light. Across it: Vex of the Ninth Ledger — seventeen limbs, zero losses on camera, and a smile like a tax form.\n\n"ANTE," says Vex. "FIFTY. AND ANYTHING ELSE YOU'D LIKE TO LOSE."` + read,
        choices: [
          { label: 'Roll straight', sub: 'honest dice', do: { kcal: -50, note: 'You roll honest. The dice clatter across the felt. Vex smiles like it knows something. It probably does.' }, next: 1 },
          { label: 'Stake a memory', sub: 'grief is legal tender', do: { kcal: -50, trauma: 4, note: 'You offer the System a memory — the summer afternoon. It takes it. You remember remembering it; the shape of it is gone. The dice warm in your hand.' }, next: 1 },
          { label: 'Stake your pride', sub: 'play to the crowd', do: { kcal: -50, note: 'You play to the crowd, loud and grinning. The cameras eat it up. Vex\'s smile flickers — it has never been out-entertained by a mammal.', notability: 'showmanship' }, next: 1 },
        ] },
      { beat: 'contestDice',
        text: `Vex is up two. The dice sit between you like an accusation.\n\n"RAISE OR FOLD, MAMMAL," says Vex. The crowd has opinions. The crowd is very loud about them.`,
        choices: [
          { label: 'Double the stakes', sub: 'everything trembles', do: { kcal: -150, dmg: [0, 6], note: 'You push your whole stack forward. Your hands shake. Vex notices. It doubles too — it can smell the fear and it likes the smell.' }, next: 2 },
          { label: 'Bluff the house', sub: 'laugh like you\'re winning', do: { trauma: 4, note: 'You laugh like you\'re already winning. Vex tilts its head — it has never been bluffed by a mammal before. Seventeen limbs go very still.', notability: 'showmanship' }, next: 2 },
          { label: 'Play it safe', sub: 'small bets', do: { kcal: -50, note: 'Small bets, tight hands. The crowd boos the caution and respects it, both at once. Vex looks... disappointed?' }, next: 2 },
        ] },
      { beat: 'contestDice',
        text: `The last roll. Everything staked is in the middle of the table, and the dice are in your hand.\n\nVex is watching the dice. For the first time tonight, it is not smiling.`,
        choices: [
          { label: 'Everything on the table', sub: 'all of it', do: { dmg: [6, 14], die: 0.06, prize: true, note: 'You shove it all in. The dice hang in the air for a year. They land. Vex stares. The crowd detonates like weather.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Take the partial win', sub: 'walk away up', do: { kcal: 200, prize: true, note: 'You cash out ahead. Vex bows — a real bow, almost respectful. You walk away up. Nobody walks away up.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Fold with dignity', sub: 'live to bet again', do: { note: 'You fold. Vex bows. The crowd respects the discipline. The dice keep their secrets, and so do you.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- THE PRICE (bespoke, moot/extreme) — sacrifice horror (Steve 2026-10-06).
  // The System demands one villager for the season. The village chooses.
  // This is the darkest show: winning means someone else loses everything.
  G._contestPrice = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { beat: 'contestPrice',
        text: intro + `\n\nThe System's voice, almost gentle: "ONE OF YOU. FOR THE SEASON. THE VILLAGE CHOOSES. YOU HAVE UNTIL DUSK."\n\nThe cameras pull back. Your village is looking at each other. Nobody is looking at you. Yet.`,
        choices: [
          { label: 'Volunteer', sub: 'take the price', do: { die: 0.35, trauma: 10, note: 'You step forward. "Me." The silence is total. The System tilts its head — it did not expect the price to walk up willingly.', notability: 'sacrifice' }, next: 1 },
          { label: 'Stay silent', sub: 'let them decide', do: { note: 'You say nothing. The debate starts without you. Your name comes up twice in the first minute.' }, next: 1 },
          { label: 'Deflect', sub: 'point elsewhere', do: { fracture: 2, note: 'You suggest — carefully, politically — that someone else might be... suitable. The cameras catch the exact moment the village learns what you are.', notability: 'schemer' }, next: 1 },
        ] },
      { beat: 'contestPrice',
        text: `The debate is vicious and televised. Alliances form and break in real time.\n\nYour name is on the short list. So are two others. The System is taking notes on who argues for whom — it finds loyalty fascinating and doomed.`,
        choices: [
          { label: 'Campaign for yourself', sub: 'argue to live', do: { trauma: 6, note: 'You make your case: your skills, your value, your future. It feels like begging. It is begging. The village listens.' }, next: 2 },
          { label: 'Campaign for another', sub: 'sacrifice them', do: { fracture: 3, trauma: 8, note: 'You argue — eloquently, ruthlessly — that someone else should go. The village will remember this speech. So will the cameras. So will they.', notability: 'schemer' }, next: 2 },
          { label: 'Accept the vote', sub: 'whatever they decide', do: { note: 'You sit down. "Whatever you decide." The village stares. Resignation, televised, is its own kind of argument.' }, next: 2 },
        ] },
      { beat: 'contestPrice',
        text: `Dusk. The System calls for the name.\n\nThe village has voted. The envelope is opened. The cameras push in.`,
        choices: [
          { label: 'Take it, if chosen', sub: 'with dignity', do: { prize: true, die: 0.25, trauma: 15, note: 'Your name is called. You stand. You walk to the light with your head up. The village weeps. The System gets its season. You get... the prize. If you survive it.', notability: 'sacrifice' }, next: 'WIN' },
          { label: 'Refuse, if chosen', sub: 'defy the vote', do: { die: 0.45, fracture: 5, note: '"No." The word hangs in the air. The System goes very still. Refusing the village\'s choice AND the System\'s price — the cameras have never seen this. Nobody has.', notability: 'defiant' }, next: 'LOSE' },
          { label: 'Not you — relief', sub: 'someone else goes', do: { prize: true, trauma: 10, fracture: 2, note: 'Another name. Not yours. The relief is physical, then immediately sickening. You live. Someone else pays. The village knows. You know they know.', notability: 'survivor' }, next: 'WIN' },
        ] },
    ];
  };

  // --- IMPRESS US (bespoke, weird/medium) — creation (Steve 2026-10-06).
  // Make the aliens feel something new. The winning move is lateral —
  // understand what baffles them about you, and weaponize it.
  G._contestImpress = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { beat: 'contestImpress',
        text: intro + `\n\nFive aliens. They have catalogued 40,000 emotions across the galaxy.\n\n"IMPRESS US," they say. "WE HAVE FELT EVERYTHING."\n\nThey have not felt what it is to be you. That is your only edge.`,
        choices: [
          { label: 'A memory', sub: 'the realest thing', do: { trauma: 6, note: 'You offer a memory — the one you never tell anyone. The aliens go very still. They have never... kept something. The concept is new. They turn it over like a stone.' }, next: 1 },
          { label: 'A joke', sub: 'make them laugh', do: { note: 'You tell the joke. The one that always works. The aliens stare. One of them makes a sound. It might be laughter. It might be a seizure. The translators are working overtime.', notability: 'showmanship' }, next: 1 },
          { label: 'Silence', sub: 'nothing, on purpose', do: { note: 'You stand in silence. Ten seconds. Twenty. The aliens lean forward — they have never encountered deliberate nothing. It itches. They can\'t look away.', notability: 'showmanship' }, next: 1 },
        ] },
      { beat: 'contestImpress',
        text: `They confer in frequencies that make your teeth ache.\n\n"WE DO NOT UNDERSTAND," the lead judge says. It sounds... frustrated? Curious? The translator gives up on the nuance.\n\nThe audience is leaning in. Nobody has ever confused the judges before.`,
        choices: [
          { label: 'Explain yourself', sub: 'help them get it', do: { note: 'You explain — patiently, like to a child — what the thing MEANS. The aliens listen. Understanding dawns, slowly, like sunrise on a strange planet. One of them makes the sound again. Definitely laughter this time.' }, next: 2 },
          { label: 'Double down', sub: 'more, stranger', do: { dmg: [0, 8], die: 0.04, note: 'You go deeper, stranger, more human. The aliens recoil — then lean back in. They are not bored. They have never been so un-bored. One of them is... crying? The translators confirm: crying. New emotion logged.' }, next: 2 },
          { label: 'Ask them a question', sub: 'turn it around', do: { note: '"What do YOU feel?" you ask. The judges freeze. No contestant has ever asked. The lead judge considers for a long time. "LONELY," it says finally. The audience gasps. The System cuts to commercial.', notability: 'showmanship' }, next: 2 },
        ] },
      { beat: 'contestImpress',
        text: `Final offering. The judges are... changed. You can see it — something in the way they hold themselves.\n\n"ONE MORE," they say. "SOMETHING ONLY YOU COULD GIVE."`,
        choices: [
          { label: 'Your grief', sub: 'the truest thing', do: { prize: true, trauma: 12, note: 'You give them your grief — the whole thing, unfiltered. The aliens receive it like a physical object. Three of them weep. The translators log seventeen new emotions. You win. It costs exactly what you thought it would.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Your joy', sub: 'the rarest thing', do: { prize: true, note: 'You give them joy — pure, stupid, human joy. The thing you feel watching the fire. The aliens have catalogued pleasure, but not THIS. Not joy-without-reason. They are delighted. You are too, which is the trick.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Nothing more', sub: 'leave them wanting', do: { note: 'You bow. "That\'s all." The judges stare. The audience boos, then cheers — the refusal is its own performance. The System notes: restraint, rare.', notability: 'showmanship' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- THE EXCHANGE (bespoke, endurance/high) — team vs team (Steve 2026-10-06).
  // Your village versus theirs. A relay through the badlands. Losers tithe.
  G._contestExchange = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { beat: 'contestExchange',
        text: intro + `\n\nThree legs. Your village against Gray Hollow. Through the badlands — the System has seeded the course with "obstacles."\n\nLosers tithe a season of food. Winners get the System's favor and the other village's respect, which is rarer.`,
        choices: [
          { label: 'Run first leg', sub: 'set the pace', do: { dmg: [6, 14], kcal: -300, note: 'You take the first leg — navigation, speed, nerve. The badlands are worse than the maps said. You set a blistering pace.' }, next: 1 },
          { label: 'Run middle leg', sub: 'the hard part', do: { dmg: [8, 18], kcal: -300, note: 'Middle leg. The worst terrain, the loneliest miles. You run like the village is watching. It is.' }, next: 1 },
          { label: 'Anchor', sub: 'bring it home', do: { dmg: [4, 10], kcal: -200, note: 'Anchor. You wait at the exchange, watching the others run their hearts out. The pressure builds like weather.' }, next: 1 },
        ] },
      { beat: 'contestExchange',
        text: `Mid-race. Gray Hollow is ahead — their runner is fast and fearless and slightly inhuman, which the System insists is legal.\n\nYour village is screaming your name. The other village is screaming theirs.`,
        choices: [
          { label: 'Push past pain', sub: 'everything', do: { dmg: [12, 24], die: 0.10, kcal: -400, note: 'You push past everything. Lungs, legs, the voice saying stop. You gain ground. The Gray Hollow runner glances back — worried, for the first time.' }, next: 2 },
          { label: 'Run smart', sub: 'pace and lines', do: { dmg: [6, 12], kcal: -200, note: 'You run the smart lines, cut the corners, save the burst. The gap holds. Patience is its own speed.' }, next: 2 },
          { label: 'Take the shortcut', sub: 'through the nest', do: { dmg: [10, 22], die: 0.18, note: 'There\'s a shortcut. Through the nest. Everyone knows. Nobody takes it. You take it. The things in the nest notice. They let you pass — this once, for the cameras.', notability: 'daredevil' }, next: 2 },
        ] },
      { beat: 'contestExchange',
        text: `Final leg. Neck and neck. The finish is a lit gate and both villages are at the barriers, screaming.\n\nThis is the part they\'ll replay for years.`,
        choices: [
          { label: 'Sprint it', sub: 'all or nothing', do: { prize: true, dmg: [15, 30], die: 0.15, kcal: -500, note: 'You sprint like the world is ending. It isn\'t, but the season\'s food might as well be. You cross first by a breath. Your village ERUPTS.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Outlast them', sub: 'steady wins', do: { prize: true, dmg: [8, 16], kcal: -300, note: 'You hold your pace. The Gray Hollow anchor fades — went out too fast, too proud. You pass them at the line, steady as stone. The System respects the discipline.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Fall short', sub: 'so close', do: { dmg: [10, 20], kcal: -200, note: 'You give everything and it isn\'t enough. Gray Hollow takes it by seconds. Your village still cheers — you ran like a legend. The tithe hurts. The pride helps.', notability: 'gallant' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- THE AUCTION (bespoke, chance/high) — economic horror (Steve 2026-10-06).
  // Bid with memories, years, body parts. Everyone pays their bid.
  G._contestAuction = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { beat: 'contestAuction',
        text: intro + `\n\nThe System auctions three lots of alien tech. Currency: memories, years of life, body parts. Your choice.\n\n"ALL BIDS ARE FINAL," the auctioneer says. "ALL BIDDERS PAY. WINNER TAKES THE LOT."\n\nThe crowd leans in. This is the cruelest show. Everyone loves it.`,
        choices: [
          { label: 'Bid a memory', sub: 'the summer afternoon', do: { trauma: 8, note: 'You bid the summer afternoon — the whole thing. The auctioneer tastes it, nods. "A FINE VINTAGE." You remember remembering it. The shape is gone.' }, next: 1 },
          { label: 'Bid years', sub: 'two years', do: { trauma: 10, note: 'You bid two years of your life. The auctioneer marks it. You feel... lighter. Shorter. The crowd gasps — years are the serious currency.', notability: 'highroller' }, next: 1 },
          { label: 'Bid small', sub: 'a finger', do: { dmg: [8, 14], note: 'You bid a finger. The auctioneer examines it. "ACCEPTABLE." The crowd winces in seventeen languages. You are now the kind of person who bids fingers.', notability: 'hardcore' }, next: 1 },
        ] },
      { beat: 'contestAuction',
        text: `Bidding war. A Gray Hollow contestant just bid their childhood. Someone else bid a lung (they have two, they point out, which is technically true).\n\nThe lots are extraordinary. The prices are obscene. The audience is euphoric.`,
        choices: [
          { label: 'Raise', sub: 'double down', do: { trauma: 6, dmg: [4, 10], note: 'You raise. More memory, more years. The auctioneer smiles — it loves a bidder who doesn\'t know when to stop. Neither do you, apparently.' }, next: 2 },
          { label: 'Bluff', sub: 'bid what you don\'t have', do: { die: 0.12, note: 'You bid big on nothing — pure bluff. The auctioneer pauses. It scans you. It KNOWS. But the rules say a bid is a bid. The crowd holds its breath.', notability: 'showmanship' }, next: 2 },
          { label: 'Hold', sub: 'let them burn out', do: { note: 'You hold. Let the others burn their lives away. Patience at an auction is its own kind of wealth. The lots are still there. So are you.' }, next: 2 },
        ] },
      { beat: 'contestAuction',
        text: `Final lot. The hammer is raised. Everything bid so far is already gone — paid, taken, consumed.\n\nThis is the last chance. The tech on the block could change your village\'s winter.`,
        choices: [
          { label: 'Everything', sub: 'win at any cost', do: { prize: true, dmg: [10, 20], die: 0.10, trauma: 10, note: 'You bid everything — the rest of the memories, the years, the parts. The hammer falls. YOURS. The tech is extraordinary. You are... less. But the village eats this winter.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'The smart bid', sub: 'just enough', do: { prize: true, trauma: 4, note: 'You bid exactly enough — not a memory more. The hammer falls. Yours. The crowd respects the precision. The auctioneer respects it too, which is rarer.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Walk away', sub: 'keep yourself', do: { note: 'You walk away. Keep the memories, the years, the fingers. The lots go to others. You are whole. The village will remember what you wouldn\'t pay — and what that cost them.', notability: 'principled' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- GENERIC fallback ---
  G._contestGeneric = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { text: intro + `\n\nThe rules are explained. They're complicated. The gist: don't lose.`,
        choices: [
          { label: 'Go all in', sub: 'commit', do: { dmg: [6, 14], note: 'You commit fully. The crowd appreciates commitment.' }, next: 1 },
          { label: 'Play it safe', sub: 'cautious', do: { note: 'You play cautious. Safe doesn\'t win, but it survives.' }, next: 1 },
        ] },
      { text: `Midway. The standings are unclear and the System likes it that way.`,
        choices: [
          { label: 'Push hard', sub: 'risk', do: { dmg: [8, 18], die: 0.06, note: 'You push. It costs. It might pay.' }, next: 'WIN' },
          { label: 'Hold steady', sub: 'safe', do: { note: 'You hold. Steady doesn\'t win headlines.' }, next: 'LOSE' },
        ] },
    ];
  };

  // === CHOICE RESOLUTION ===
  G.contestChoose = function(idx) {
    const ac = this.state.activeContest;
    if (!ac || ac.phase === 'done') return null;
    const phases = ac.phases;
    const phase = phases[ac.phaseIdx || 0];
    if (!phase || !phase.choices || !phase.choices[idx]) return null;
    const choice = phase.choices[idx];
    const s = this.state.scholar;
    const log = [];

    // Apply effects
    const d = choice.do || {};
    // Wounds BEFORE this choice resolve — the Gauntlet closer's odds are
    // computed from what you carried in, so the displayed number is the
    // number rolled (Steve 2026-10-05: readable danger, no lying odds).
    const woundsBeforeChoice = ac.wounds || 0;
    if (d.note) { this.sysSay('📺 ' + d.note); log.push(d.note); }
    if (d.dmg) {
      let amt = d.dmg[0] + Math.floor(Math.random() * (d.dmg[1] - d.dmg[0] + 1));
      // VETERAN (contest knowledge level 3): you read the hits coming.
      try {
        const ck = this.contestKnowledge(ac.contestId);
        if (ck.level >= 3 && amt > 1 && ac.participant === 'player') {
          const cut = Math.min(amt - 1, Math.max(1, Math.round(amt * 0.25)));
          amt -= cut;
          this.sysSay(`📺 You read it coming. (-${cut})`);
          log.push(`read it coming -${cut}`);
        }
      } catch (e) {}
      if (amt > 0) {
        s.health = Math.max(0, (s.health || 0) - amt);
        // Wounds feed the Gauntlet closer (and anything else that reads them)
        ac.wounds = (ac.wounds || 0) + amt;
        this.sysSay(`📺 You take ${amt} damage.`);
        log.push(`-${amt} hp`);
      }
      // (Zero damage rolls are silent — no "You take 0 damage" noise)
      if ((s.health || 0) <= 0) {
        return this._contestDie(ac, 'The damage was too much.');
      }
    }
    // dieWounds: Gauntlet closer — death odds computed from wounds taken,
    // not a flat roll (Steve 2026-10-05).
    let dieChance = d.die || 0;
    if (d.dieWounds) {
      dieChance = this._contestCloserOdds(d.dieWounds, woundsBeforeChoice);
      log.push(`closer odds ${Math.round(dieChance * 100)}% on ${woundsBeforeChoice} wounds`);
    }
    if (dieChance > 0 && Math.random() < dieChance) {
      return this._contestDie(ac, choice.label + ' — it went wrong.');
    }
    if (d.heal) {
      s.health = Math.min(this.maxHealth(), (s.health || 0) + d.heal);
      log.push(`+${d.heal} hp`);
    }
    if (d.kcal) {
      s.kcal = Math.max(0, (s.kcal || 0) + d.kcal);
      log.push(`${d.kcal > 0 ? '+' : ''}${d.kcal} kcal`);
    }
    if (d.trauma) {
      s.trauma = Math.max(0, Math.min(100, (s.trauma || 0) + d.trauma));
      log.push(`${d.trauma > 0 ? '+' : ''}${d.trauma} trauma`);
    }
    // Social consequences are real, not mechanical (Steve 2026-10-05):
    // winning can cost the village. fracture/unity shift the leadership
    // ledger — the village remembers what you traded for the prize.
    if (d.fracture) {
      try { this.leadShift('fracture', d.fracture); } catch (e) {}
      log.push(`fracture +${d.fracture}`);
    }
    if (d.unity) {
      try { this.leadShift('unity', d.unity); } catch (e) {}
      log.push(`unity +${d.unity}`);
    }
    if (d.notability) {
      this.addNotability('player', d.notability);
      log.push(`noted: ${d.notability}`);
    }
    // WATCHER AGENCY (Steve 2026-10-06): watcher choices move the odds.
    // Cheering is real support — capped, and the cameras notice.
    if (d.cheer) {
      ac.cheer = Math.min(0.15, (ac.cheer || 0) + d.cheer);
      log.push(`cheer +${Math.round(d.cheer * 100)}% win odds`);
    }
    // Studying the pattern teaches without bleeding: knowledge progression
    // for watchers, not just contestants.
    if (d.study) {
      try { this.contestLearn(ac.contestId, 'studied'); } catch (e) {}
      log.push('studied the pattern');
    }
    // Betting: the System honors wagers. Real kcal, real stakes, once per
    // contest. The bet rides on the first taken.
    if (d.bet && d.bet.amount > 0 && !ac.bet) {
      const amt = d.bet.amount;
      if ((s.kcal || 0) >= amt) {
        s.kcal -= amt;
        ac.bet = { amount: amt };
        const bp = ac.participant === 'player' ? 'yourself' : this.displayName(ac.participant);
        this.sysSay(`📺 You put ${amt} kcal on ${bp}. The System notes the wager — the audience loves a believer.`);
        log.push(`bet ${amt} kcal`);
      } else {
        this.sysSay(`📺 You haven't got ${amt} kcal to wager. The moment passes.`);
      }
    }
    // Comfort: going to them after. Resolved at verdict — the living feel
    // it (trust), the dead are mourned (trauma).
    if (d.comfort) {
      ac.comfort = true;
      log.push('will go to them after');
    }

    // Advance
    const next = choice.next;
    if (next === 'WIN') return this._contestEnd(ac, 'won', d.prize);
    if (next === 'LOSE') return this._contestEnd(ac, 'lost', false);
    if (next === 'DIE') return this._contestDie(ac, choice.label);
    if (next === 'REFUSE') return this._contestRefuse(ac);
    if (next === 'VERDICT') return this._contestVerdict(ac);
    ac.phaseIdx = next;
    const np = phases[next];
    if (!np) return this._contestEnd(ac, 'lost', false);
    this.sysSay('📺 ───');
    const rendered = this._contestRenderPhase(ac, np, next);
    this._cxStorePhase(ac, next, rendered);
    this._cxPhaseSay(rendered.text);
    return { phase: rendered, log };
  };

  G._contestEnd = function(ac, outcome, prize) {
    const contest = this.contestPool().find(c => c.id === ac.contestId) || { name: ac.contestId };
    const s = this.state.scholar;
    const isWatch = ac.participant && ac.participant !== 'player';
    const pname = isWatch ? this.displayName(ac.participant) : 'You';
    ac.phase = 'done';
    if (outcome === 'won') {
      // MULTI-TAKE learn pacing (Steve 2026-10-06): only the primary's fate
      // teaches — otherwise one four-person contest would mint a veteran.
      if (!ac._suppressLearn) { try { this.contestLearn(ac.contestId, isWatch ? 'watched' : 'won'); } catch (e) {} }
      if (isWatch) {
        // Villager won — resolve THEIR fate, not the player's
        const multiWin = ac.participants && ac.participants.length > 1;
        this.sysSay(`📺 ${contest.name} — ${pname.toUpperCase()} WIN${multiWin ? '' : 'S'}. The crowd is a weather system.`);
        this.sysSay(`📺 ${pname} is alive. Shaking, grinning, alive. You were there to see it.`);
        this.addNotability(ac.participant, 'contestWin');
        // Villager gets the prize (not the player)
        if (prize) {
          this.sysSay(`📺 Prize for ${pname}: the System's favor (and a story they'll tell forever).`);
        }
      } else {
        this.sysSay(`📺 ${contest.name} — YOU WIN. The crowd is a weather system.`);
        this.addNotability('player', 'contestWin');
        try { this.leadShift('showmanship', 2); } catch (e) {}
        if (prize) {
          try {
            const loot = this.rollAlienLoot({ wave: this.unlockedWave(), loot: { chance: 1, tier: this.unlockedWave() } });
            if (loot) {
              // KNOWLEDGE-GATED (Steve 2026-10-06): the prize goes through the
              // SAME reveal path as monster-kill loot (alienLootGrant). Diegetic
              // announce — no raw id, no mechanics. The prize arrives named in
              // your Pack; what it DOES, you learn by using it.
              const granted = this.alienLootGrant(loot);
              if (granted) {
                const d = granted.def;
                this.sysSay(`📺 The System presses something humming into your hands: ${d.name}.${d.flavor ? ' ' + d.flavor : ''}`);
              } else {
                this.sysSay('📺 Prize: the System\'s favor (and a story).');
              }
            }
          } catch (e) { this.sysSay('📺 Prize: the System\'s favor (and a story).'); }
        }
        // FEARED means winning costs: winners are marked
        s.health = Math.max(1, (s.health || 0) - 5);
      }
    } else {
      if (!ac._suppressLearn) { try { this.contestLearn(ac.contestId, isWatch ? 'watched' : 'lost'); } catch (e) {} }
      if (isWatch) {
        this.sysSay(`📺 ${contest.name} — over. ${pname} survived. The audience is polite.`);
        this.sysSay(`📺 You go to ${pname}. They're quiet. They'll talk about it later. Or never.`);
      } else {
        this.sysSay(`📺 ${contest.name} — over. You survived. The audience is polite.`);
        try { this.leadShift('showmanship', 1); } catch (e) {}
      }
    }
    // MULTI-TAKE (Steve 2026-10-06): the others who were taken have their
    // own fates, rolled now. You had your fight; they had theirs.
    if (!isWatch && ac.others && ac.others.length) {
      try { this._contestResolveOthers(ac); } catch (e) {}
    }
    // Clear after a beat — the village processes what happened
    this.state.activeContest = null;
    this.state.lastContestDay = s.day;
    return { done: true, outcome };
  };

  // BESPOKE DEATH LINES (Steve 2026-10-05): contests must be FEARED. A generic
  // "did not come home" is placeholder text — every contest kills you in its
  // own voice. pname is 'You' or a villager name; lines work for both.
  G._contestDeathLine = function(contest, how, pname) {
    const you = pname === 'You';
    const them = you ? 'you' : 'them';
    const poss = you ? 'Your' : pname + "'s";
    const LINES = {
      pit: `${pname} fed the Pit. The beast doesn't celebrate — it eats. The crowd observes four seconds of silence (respect), then the betting opens on the next contestant.`,
      gauntlet: `${pname} almost cleared the Gauntlet. ALMOST is what the Death Reel is for — it will run the last ten seconds in slow motion, forever.`,
      duel: `"Not to the death," they said. The ref-drone logs it as an accident. ${poss} opponent doesn't stop shaking for a week.`,
      drop: `The beacon kept blinking. ${pname} stopped walking toward it a mile out. The snow does the rest — quietly, the way it does for everyone.`,
      starve: `Day three. ${pname} broke — first, last, all the way. The System notes the exact time of death for the highlight package.`,
      moot: `The audience voted. The verdict wasn't guilty — it was boring. The System doesn't keep boring contestants. The cameras cut away before it finished.`,
      lies: `The scanner caught the big one. The audience's delight curdled into something else. The System doesn't like being lied to twice.`,
      cookfight: `The ingredients stopped fighting back. That's how you know. Dinner is served.`,
      fetch: `${pname} brought them something interesting. It brought ${them}. The judges award posthumous points for irony.`,
      hide: `It found ${pname}. It was always going to find ${them}. The "FOUND YOU" sting plays over the part where the running stopped.`,
      box: `The box is bigger inside than out. There's room in there for one more. The audience finally gets the manual. It doesn't help.`,
      pattern: `Wrong order. Fifteen seconds of footage. It will outlive everyone who loved ${them}.`,
      whoate: `${pname} named the wrong name. The real thief is still hungry. The System is merciless with editors — and with wrong answers.`,
      informant: `${pname} found the exit before finding the liar. The informant sends flowers. The card reads: "Thanks for the cover."`,
      calorie_run: `${pname} pushed past the safe line for the calories. The forest collected. It always collects.`,
      pantry_raid: `The locals objected. ${pname} didn't listen. "Bring back food or don't come back" — ${you ? 'you' : 'they'} didn't come back.`,
      wheel: `The teeth decided. They were very close to ${you ? 'your' : 'their'} name. Then they weren't close at all.`,
      lottery: `${pname} drew the black token. The audience loves an underdog. This underdog is dead.`,
      tithe: `${pname} gave the fourth measure. There is no fourth measure. The basin is full now; the cameras linger on the surface a long time.`,
      siege: `The chokepoint held. ${pname} didn't. The village rings the bell anyway — because the line held, because they were the line.`,
      maw: `The pauses added up. The Maw doesn't chase — it collects. The light at the end was real. ${pname} never reached it.`,
      oath: `${pname} broke the oath on camera. The binding doesn't do trials. The words unmade them mid-sentence.`,
      beastmaster: `The beast turned. It wasn't cruelty — it was a misunderstanding with teeth. The collar recorded everything.`,
      riddle: `${pname} answered wrong three times. The Engine kept the memories and, eventually, the rest. The mouths are still chewing on the childhood.`,
      confession: `${pname} accused the System on its own cameras. The broadcast cut to static for nine seconds. When it came back, the lectern was empty.`,
      honey: `The swarm took ${pname} apart like a question. The honey was excellent that year. The village doesn't say so out loud.`,
      secrets: `${pname} called the System a cheat on live television. The deck dealt one last card. It was ${poss} own secret. The cameras held on the face.`,
      quiet: `${pname} resisted the Quiet Room. It went deeper than anyone meant to let it. The broadcast cut mid-sentence. When it came back, the chair was empty.`,
      guest: `The Guest took offense at the dessert. The bodyguards were faster than the apology. The System's note to the village was two words long: "OUR BAD."`,
      vigil: `The lamp went out. The circling stopped. Dawn came up on an empty wall.`,
      sorting: `${pname} argued with the belt. The belt won. The fire kept the dull things and the bright one both — the village eats the memory of the winter store.`,
      witness: `${pname} named the wrong witness. The village armed against a monster that never came, and the real one walked in through the unguarded treeline. The System kept the footage. It always keeps the footage.`,
      cache: `The drone didn't miss. ${pname} is a tax the village couldn't afford. The cache made it home, though. That's something. It's not enough.`,
      longodds: `${pname} went all in on the last roll. The dice landed wrong. The champion bowed — a real bow, almost respectful. The house always collects.`,
      price: `${pname} walked up willingly — or the village's vote did the walking. The System named its price and collected. The village will argue about that vote for a generation. It won't bring ${them} back.`,
      impress: `${pname} gave the judges something new. They logged it carefully — seventeen new emotions — and kept the receipt. The galaxy applauds. ${poss} village buries what's left of the performance.`,
      exchange: `The lit gate stayed lit. ${pname} stopped running a hundred yards out — the badlands collected. Gray Hollow took the leg, and the tithe. The village runs the replay anyway. It always will.`,
      auction: `The hammer fell and ${pname} was the price. Everything bid — memories, years, parts — was already gone before the end. The lot went to someone else. The System keeps the ledger. The village keeps the silence.`,
    };
    const CAT = {
      blood: `${pname} bled out for the cameras. The Death Reel thanks ${them} for the content.`,
      endurance: `${poss} body filed its last complaint. The System stamps the timecode.`,
      moot: `The audience has rendered its verdict on ${pname}. There is no appeal. There is only the Reel.`,
      weird: `${pname} was interesting right up to the end. The judges give full marks. Posthumously.`,
      puzzle: `${pname} never solved it. The puzzle keeps the pieces. The audience keeps the clip.`,
      detective: `${pname} got it wrong on camera. Wrong answers have consequences. The Reel has the receipts.`,
      forage: `The wild took ${pname} as payment. The harvest was good this year.`,
      chance: `The odds were never with ${pname}. That's what made it television.`,
    };
    return LINES[contest.id] || CAT[contest.cat] || `${pname} did not come home from ${contest.name}.`;
  };

  G._contestDie = function(ac, how) {
    const contest = this.contestPool().find(c => c.id === ac.contestId) || { name: ac.contestId, id: ac.contestId };
    const isWatch = ac.participant && ac.participant !== 'player';
    const pname = isWatch ? this.displayName(ac.participant) : 'You';
    ac.phase = 'done';
    this.sysSay(`📺 ${contest.name} — ${how}`);
    this.sysSay('📺 ' + this._contestDeathLine(contest, how, pname));
    this.sysSay(`📺 The Death Reel will be tasteful. It won't be.`);
    if (!ac._suppressLearn) { try { this.contestLearn(ac.contestId, 'died'); } catch (e) {} }
    this.state.activeContest = null;
    if (isWatch) {
      // A villager died on camera. The village buries them; the player lives
      // with having watched. (Steve 2026-10-06: this used to call playerDeath
      // unconditionally — a watched death killed the PLAYER.)
      // _cxKillContestant: removeVillager alone is a no-op wrapper — the
      // dead must actually leave the roster.
      this._cxKillContestant(ac.participant);
      try { this.say(`☠ ${pname} is gone. The village will say the name for a long time.`); } catch (e) {}
      try { this.leadShift('fracture', 2); } catch (e) {}
      const s = this.state.scholar;
      s.trauma = Math.min(100, (s.trauma || 0) + 12);
      return { done: true, outcome: 'died' };
    }
    // MULTI-TAKE (Steve 2026-10-06): the others who were taken have their
    // own fates, rolled now. You had your fight; they had theirs.
    if (ac.others && ac.others.length) {
      try { this._contestResolveOthers(ac); } catch (e) {}
    }
    try { this.playerDeath('contest'); } catch (e) { this.state.scholar.health = 0; this.state.over = true; }
    return { done: true, outcome: 'died' };
  };

  G._contestRefuse = function(ac) {
    // Refusal is a sequence, not a skip (Steve 2026-10-05)
    const contest = this.contestPool().find(c => c.id === ac.contestId) || { name: ac.contestId };
    this.sysSay(`📺 You refuse ${contest.name}.`);
    this.sysSay(`📺 The System pauses. Refusal is... content. The cameras stay on.`);
    this.sysSay(`📺 "NOTED," says the System. "THE AUDIENCE WILL REMEMBER THE COWARDICE. OR THE PRINCIPLE. WE HAVEN'T DECIDED."`);
    this.addNotability('player', 'showmanship');
    const s = this.state.scholar;
    s.trauma = Math.min(100, (s.trauma || 0) + 5);
    try { this.contestLearn(ac.contestId, 'refused'); } catch (e) {}
    // MULTI-TAKE (Steve 2026-10-06): the others were taken anyway —
    // refusal is yours alone.
    if (ac.others && ac.others.length) {
      this.sysSay(`📺 You said no. They didn't get asked.`);
      try { this._contestResolveOthers(ac); } catch (e) {}
    }
    ac.phase = 'done';
    this.state.activeContest = null;
    return { done: true, outcome: 'refused' };
  };

  // === WATCH MODE (villager participant) ===
  // When someone else is taken, you watch. The show plays out as
  // narrated beats with choices that MATTER (Steve 2026-10-06): cheering
  // moves the win odds for your people (capped, cameras notice), studying
  // the pattern teaches without bleeding, bets are real kcal, and going to
  // them after lands as trust or mourning. The VERDICT roll is scaled by
  // contest risk plus your cheer. Villagers CAN die on camera (Steve
  // 2026-10-06: watched contests were bloodless, which broke FEARED).
  // Multiple villagers can be taken at once (multi-take) — each gets their
  // own verdict roll.
  // CONTEST-SPECIFIC WATCH BEATS (Steve 2026-10-06): the three watch phases
  // were identical across all 27 contests ("it's going badly. Or well.").
  // Watching hide-and-seek should feel like hide-and-seek — the count, the
  // seeker — not a generic beat. Each contest gets its own three beats:
  // what the cameras show, the taken villager's situation, the crowd —
  // escalating setup -> turn -> ending. The fear lives in the specifics.
  // Knowledge-gated: veteran watchers (contest knowledge level 2+) get a
  // coaching line the broadcast never says out loud. Priors hold: System
  // voice, no prize leaks, no coaching in setup text for first-timers.
  G._contestWatchBeat = function(contest, pname) {
    const T = {
      // --- BLOOD ---
      pit: {
        setup: p => `📺 The Pit. ${p} has been taken.\n\nThe arena floor is sand and old bone. The gate across from them rattles — something in there is breathing hard. The System, bright as a knife: "CHOOSE YOUR WEAPON, CONTESTANT."\n\nYou watch with the village. The cameras love the watchers almost as much as the watched.`,
        turn: p => `📺 The Pit — the beast is out. It comes in low and fast. It has been promised food.\n\nIt circles. It's deciding how ${p} dies. The crowd can smell both of them bleeding now. Someone in the village whispers the Death Reel's name like a curse.`,
        end: p => `📺 The Pit — the last rush. The beast gathers itself and the whole arena goes silent for it.\n\nThis is the moment the Death Reel is for. Win or lose, the galaxy will watch this part forever.`,
      },
      gauntlet: {
        setup: p => `📺 Gauntlet. ${p} has been taken.\n\nThree gates. Three waves. No rest between. The System: "WAVE ONE. TRY TO LOOK SURPRISED."\n\nThe crowd chants ${p}'s name. Wrong. Every time, wrong.`,
        turn: p => `📺 Gauntlet — wave two. Bigger. It has seen the first wave's corpse and learned nothing, which is worse.\n\n${p}'s arms are heavy. The System's overlay helpfully displays the damage so far in numbers the size of weather — it wants everyone to know. The closer is watching the numbers too.`,
        end: p => `📺 Gauntlet — wave three. What comes out of the gate is wrong in ways the first two weren't.\n\nThe closer smells blood. The whole galaxy leans in. Almost nobody walks away from this one.`,
      },
      duel: {
        setup: p => `📺 Duel. ${p} has been taken.\n\nThe opponent: another contestant — scared, like ${p}, hiding it worse. Not to the death. To the yield. The System says "accidents happen" like it's a joke.\n\nYou watch with the village. Nobody is cheering yet.`,
        turn: p => `📺 Duel — they're circling. The ref-drone hovers, sensors hot.\n\n${p} is studying them: favoring the left, nervous hands. The crowd wants blood. The System wants a story. ${p} wants to go home.`,
        end: p => `📺 Duel — the end of it. One of them yields, or the drone calls it.\n\nThe crowd is on its feet. Accidents have happened on this floor before. Everyone watching knows exactly which kind.`,
      },
      // --- ENDURANCE ---
      drop: {
        setup: p => `📺 The Drop. ${p} has been taken.\n\nThree contestants, dropped somewhere with nothing. First back to the beacon eats. The others... walk.\n\nThe cameras split three ways. Every eye in the village is on ${p}'s feed.`,
        turn: p => `📺 The Drop — the other two are landmarks now. Behind, or ahead — the cameras won't say.\n\n${p} is moving steady through whatever that terrain is. The beacon blinks on the horizon, too far, the exact color of hope.`,
        end: p => `📺 The Drop — the beacon is close. Close enough to see the steam off the food.\n\nFirst one back eats. The other two walk home empty. The sprint at the end of this one is the cruelest part of the whole show.`,
      },
      starve: {
        setup: p => `📺 Hollow Belly. ${p} has been taken.\n\nNo food for three days. The System watches who breaks first. Water provided. Dignity not.\n\nDay one: four contestants, one empty table, cameras in every corner. You watch with the village. Someone brings snacks. It helps.`,
        turn: p => `📺 Hollow Belly — day two. The hunger talk has started. Nobody is entertaining anymore.\n\n${p} is quiet. The cameras linger on the empty plates. The audience is taking bets on who breaks first, and the odds keep moving.`,
        end: p => `📺 Hollow Belly — day three. Someone is going to break today. Everyone knows it, including them.\n\nThe System zooms in, slow. Hunger is the whole show now, and ${p} is holding on by the fingernails.`,
      },
      // --- MOOT ---
      moot: {
        setup: p => `📺 The Moot. ${p} has been taken.\n\nTelevised trial. The accusations are read out — true or not, the cameras don't care. The audience is the jury.\n\n${p} stands at the mic alone. Seventeen systems are watching.`,
        turn: p => `📺 The Moot — the defense. ${p} is talking, and the jury-feed shows the galaxy's verdict ticking up and down with every sentence.\n\nOne wrong word and it tanks. One right word and it soars. Truth is just another special effect here.`,
        end: p => `📺 The Moot — closing. The accusations hang in the air like smoke.\n\nThe jury votes. Guilty or not, the verdict is televised, and the village will have to live next to whatever the galaxy decides.`,
      },
      lies: {
        setup: p => `📺 Lie Detector. ${p} has been taken.\n\nTwo chairs. One detector. The System knows when you lie — the audience loves when you do.\n\nThe first questions are easy. They're supposed to be. The detector is calibrating on ${p}'s heartbeat.`,
        turn: p => `📺 Lie Detector — the questions are getting personal. The detector buzzes, soft, satisfied.\n\n${p} just lied. The whole galaxy heard it. The audience is delighted. ${p}'s face is doing something complicated.`,
        end: p => `📺 Lie Detector — the last question. The big one. The one they didn't tell ${p} about.\n\nThe detector is very quiet now. Waiting. The crowd leans in. Whatever the answer is, it will be the truth — the System makes sure of that.`,
      },
      // --- WEIRD ---
      cookfight: {
        setup: p => `📺 Cooking With Teeth. ${p} has been taken.\n\nTwo cooks. One counter. The ingredients are alive and they object to the menu.\n\n${p} picks up a knife. Something in the basket picks up... also something. Presentation matters. Survival matters more.`,
        turn: p => `📺 Cooking With Teeth — the sauté pan just bit ${p}. The crowd roars.\n\nThe other cook's stew is fighting back too, but losing. ${p}'s dish is plated and furious. The judges are taking notes with very long utensils.`,
        end: p => `📺 Cooking With Teeth — plating. Final seconds.\n\nTwo plates go up. One of them is still moving. The judges taste. The galaxy holds its breath — the wrong presentation here costs more than the prize.`,
      },
      fetch: {
        setup: p => `📺 Bring Us Something Interesting. ${p} has been taken.\n\nOne mile radius. One hour. Most interesting thing wins — judged by beings who have never touched grass.\n\nThe clock starts. ${p} runs for the treeline. The other two split for the creek and the old ruins.`,
        turn: p => `📺 Bring Us Something Interesting — half the hour gone. The haul is trickling in.\n\n${p} found something — the cameras won't show what. The judges are conferring. One of them is holding a rock upside down like it's a clue.`,
        end: p => `📺 Bring Us Something Interesting — the judging. Final hauls on the table.\n\nThe judges deliberate. They have never touched grass, but they know interesting when they see it. Allegedly. ${p}'s find is about to be judged by aliens.`,
      },
      hide: {
        setup: p => `📺 Hide and Seek. ${p} has been taken.\n\nThree hiders. One seeker. The seeker is a wave-2 predator, and it is very good at seeking.\n\nThe sixty-count begins. The forest is dense, dark, and full of things that want to be left alone. You watch with the village. The cameras love the watchers almost as much as the watched.`,
        turn: p => `📺 Hide and Seek — the count is long over. The predator is listening.\n\nOn the forest feed: birds going quiet in a widening circle. ${p}'s camera shows only dark and breathing. The seeker sniffs the air the way you check the weather.`,
        end: p => `📺 Hide and Seek — it's right there. The eyes catch the light.\n\nThe System is warming up the FOUND YOU sting. The village says ${p}'s name out loud, all at once, like that could help. It can't. The Death Reel will be tasteful. It won't be.`,
      },
      // --- PUZZLE ---
      box: {
        setup: p => `📺 The Box. ${p} has been taken.\n\nAn alien puzzle box, bigger than a person, folding and refolding. Solve it or stay in the arena until you do. The audience has the manual.\n\n${p} touches a panel. It folds wrong. The crowd groans in seventeen languages.`,
        turn: p => `📺 The Box — ${p} is three panels deep and the box is fighting back, refolding solved sections.\n\nThe chat is screaming conflicting advice. They have the manual. They don't agree with each other. ${p}'s hands are shaking.`,
        end: p => `📺 The Box — the last panel. One fold left, and it's the one the manual marks in red.\n\nThe arena is silent. The audience leans in. Either the box opens, or ${p} spends the night inside it. The System is already narrating both endings.`,
      },
      pattern: {
        setup: p => `📺 Pattern Hunger. ${p} has been taken.\n\nA sequence of foods, laid out like a ritual. Eat them in the right order. The wrong order... disagrees with you.\n\n${p} studies the spread. The cameras zoom in on the fruit. The audience is placing bets on the order.`,
        turn: p => `📺 Pattern Hunger — first bites down. The crowd holds its breath with every chew.\n\n${p} is reading the pattern, tasting carefully. Two more dishes to go. The wrong one disagrees — loudly, the chat warns, and the chat would know.`,
        end: p => `📺 Pattern Hunger — the last dish. The pattern is almost visible now. Almost.\n\nOne bite left. The right order is a prize. The wrong order is a very public, very televised disagreement. ${p} picks up the fork.`,
      },
      // --- DETECTIVE ---
      whoate: {
        setup: p => `📺 Who Ate It? ${p} has been taken.\n\nThe prize is gone. Three suspects. One of them is lying about everything. ${p} has an hour, and the cameras love a deadline.\n\nThe suspects are lined up. The thief is among them. So is ${p}'s reputation.`,
        turn: p => `📺 Who Ate It? — the questioning. ${p} is working the room.\n\nSuspect two just contradicted suspect one. The chat has theories. The chat is wrong about most things, but it's loud about all of them.`,
        end: p => `📺 Who Ate It? — the reveal. ${p} points.\n\nThe accused face. The cameras push in. If ${p} is right, it's justice, televised. If ${p} is wrong, it's the best episode of the season.`,
      },
      informant: {
        setup: p => `📺 The Informant. ${p} has been taken.\n\nFour contestants. One of them is lying about everything. Find the liar before the liar finds the exit.\n\nThe doors lock. The cameras settle in. ${p} is watching hands, eyes, who stands near the exits.`,
        turn: p => `📺 The Informant — the lies are multiplying. Every story has a hole, and ${p} is mapping all of them.\n\nOne contestant keeps drifting toward the doors. The cameras noticed. ${p} noticed the cameras noticing.`,
        end: p => `📺 The Informant — the exit is in play. Someone is going to make a run for it.\n\n${p} has one accusation. The informant has one exit. The doors are very loud when they open. The galaxy is watching both.`,
      },
      // --- FORAGE ---
      calorie_run: {
        setup: p => `📺 Calorie Run. ${p} has been taken.\n\nOne hour. Whoever brings back the most calorie-dense haul wins. The forest is... competitive.\n\nThe start gun. ${p} runs. The other two are already fighting over the same berry thicket.`,
        turn: p => `📺 Calorie Run — the sacks are filling. ${p}'s is respectably heavy.\n\nThe cameras cut to the creek: one rival just found a full fish trap. The chat is furious on ${p}'s behalf. The forest does not care.`,
        end: p => `📺 Calorie Run — the weigh-in, in front of the cameras. Sack vs sack vs sack.\n\nThe scales don't lie. The locals are watching from the treeline. ${p}'s haul goes on last, and the whole village holds its breath.`,
      },
      pantry_raid: {
        setup: p => `📺 Pantry Raid. ${p} has been taken.\n\nGather from the dangerous place. The locals object. Bring back food or don't come back.\n\n${p} crosses into the warning zone. The cameras pull back, respectful. Even the drones give this one room.`,
        turn: p => `📺 Pantry Raid — the locals have noticed. The treeline is... occupied.\n\n${p} is gathering fast, eyes everywhere. The sack is half full. The owners of this pantry are deciding what to do about the thief with the cameras.`,
        end: p => `📺 Pantry Raid — the run home. The sack is full and the locals are done deciding.\n\n${p} runs. Behind: pursuit. Ahead: the gate. This is the part the Death Reel replays in slow motion. The village is screaming.`,
      },
      // --- CHANCE ---
      wheel: {
        setup: p => `📺 Wheel of Teeth. ${p} has been taken.\n\nOne wheel. One spin. The teeth decide.\n\n${p} steps up. The wheel is taller than a person and it grins. The crowd holds its breath. You watch with the village.`,
        turn: p => `📺 Wheel of Teeth — the wheel is slowing. Click. Click. Click.\n\n${p} isn't watching the wheel anymore — eyes closed, listening. The teeth pass one by one. The crowd counts them out loud.`,
        end: p => `📺 Wheel of Teeth — it stops. The tooth it lands on glints.\n\nThe System reads it out. The crowd's reaction tells ${p} everything before the words finish. Fortune, televised, in a single click.`,
      },
      lottery: {
        setup: p => `📺 The Lottery. ${p} has been taken.\n\nFive contestants. Pure luck. Draw a token.\n\n${p} reaches into the drum. The audience loves an underdog, and the cameras have already decided ${p} is the underdog.`,
        turn: p => `📺 The Lottery — four tokens drawn. None of them ${p}'s.\n\nOne token left in the drum, or the winning one is already out there in someone else's hand. The underdog edit is getting stronger. The crowd is rooting.`,
        end: p => `📺 The Lottery — the last token. ${p}'s hand is in the drum.\n\nThe whole galaxy watches a hand pull a piece of carved bone out of a drum. Luck, televised. The underdog story writes itself. Or it doesn't.`,
      },
      // --- WAVE 2+ (Steve 2026-10-06) ---
      tithe: {
        setup: p => `📺 The Blood Tithe. ${p} has been taken.\n\nA black basin on a black altar. The System, gentle as a nurse: "BLEED FOR US. WE ONLY NEED... ENOUGH."\n\n${p}'s blood steams in the cold air. Nobody will say how much the altar wants. The audience knows. They are not telling.`,
        turn: p => `📺 The Blood Tithe — the basin is filling. ${p}'s vision is swimming at the edges.\n\nThe System tilts its head. "MORE?" it asks, like it's offering dessert. The crowd has gone quiet — even they know this is the part where it goes wrong.`,
        end: p => `📺 The Blood Tithe — the count. The altar gives no sign, and the basin keeps drinking.\n\nToo little and it finds you wanting. Too much and it keeps the rest. ${p} is deciding. The Death Reel is already editing.`,
        knows: p => `📚 What your blood remembers: THREE full measures. Not four. The fourth measure is the one that kills. Watch ${p}'s hands — stop them at three if you can.`,
      },
      siege: {
        setup: p => `📺 Siege. ${p} has been taken.\n\nA chokepoint of rubble and light-fencing. Beyond it: the beacon. Behind ${p}: the village, watching from the walls.\n\nThe System: "THREE WAVES. HOLD THE LINE. THE VILLAGE IS WATCHING — WAVE, WON'T YOU?"`,
        turn: p => `📺 Siege — wave two. They feinted at the barricade and came for ${p}.\n\nThe village gasps as one. Someone on the wall is screaming ${p}'s name. The light-fence is flickering. The line bends.`,
        end: p => `📺 Siege — wave three. The big ones. The barricade is splinters.\n\n${p} is alone in the gap. The beacon hums. The village holds its breath. The line holds, or ${p} doesn't.`,
        knows: p => `📚 Wave two feints at the barricade and comes for the contestant, not the wall. You've held this line before — watch their feet, not the gates.`,
      },
      maw: {
        setup: p => `📺 The Maw. ${p} has been taken.\n\nA tunnel mouth in the arena floor, breathing cold air. The grate slams shut behind ${p}.\n\nAhead: dark. Behind the dark: something that has learned patience. The System, cheerful: "WALK. DON'T STOP. IT COUNTS YOUR PAUSES."`,
        turn: p => `📺 The Maw — ${p} is deep in the tunnel now. The cameras switch to night-vision green.\n\nYou can hear it: not footsteps, the tunnel going quiet ahead. ${p}'s legs are shaking. Stopping would be so easy. It is counting.`,
        end: p => `📺 The Maw — light ahead. A circle of it, small and grey and real.\n\nIt's close behind ${p} now. The thing's interest is like heat on the cameras. Walk out, or turn and face it. The galaxy will watch either way.`,
        knows: p => `📚 It counts the pauses. You've walked this tunnel — if they stop, scream at the screen. Noise is the only thing that reaches them down there.`,
      },
      oath: {
        setup: p => `📺 The Oath. ${p} has been taken.\n\nThree lecterns. Three oaths, written in light. "SWEAR. MEAN IT. WE WILL KNOW."\n\nThe first oath: NEVER LIE TO THE CAMERAS AGAIN. ${p} speaks. The light wraps the wrist like a bracelet. It itches with truth.`,
        turn: p => `📺 The Oath — the second oath. GIVE THE SYSTEM ONE MEMORY. It chooses which.\n\nIt is already reaching. You can feel it browsing, even through the screen. ${p}'s face goes still — it found one. A summer afternoon. The shape of it, gone.`,
        end: p => `📺 The Oath — the third oath. WHEN THE SYSTEM CALLS, COME. No conditions.\n\nThis is the one that matters. The audience knows it. ${p} knows it. The bracelet clicks shut, and the galaxy witnesses the binding.`,
        knows: p => `📚 The third oath is the one that matters. And if they're planning to break it later — you've seen someone try — the System heard the plan inside the oath.`,
      },
      beastmaster: {
        setup: p => `📺 Beastmaster. ${p} has been taken.\n\nA wave-2 beast in a light-collar, pacing. The course: rings of fire, a balance beam over spikes, a tunnel.\n\nThe System: "RIDE. GUIDE. DO NOT HURT IT. IT REMEMBERS." ${p} mounts like it's a horse that could kill you. It could.`,
        turn: p => `📺 Beastmaster — the rings of fire. The beast hates them; you can see it coiling under ${p}.\n\n${p} is guiding with knees and breath. The beam over the spikes is next, and the beast is watching ${p} for cues. One yank on the collar and its eyes change.`,
        end: p => `📺 Beastmaster — the last obstacle. The tunnel. Dark, narrow, and it smells like the Maw.\n\nThe beast balks. This is the moment the whole contest turns on. Together through the dark, or forced in alone — and in the dark, where the cameras can't quite see, you hear it decide.`,
        knows: p => `📚 Knees and breath. Kindness first, then authority. Never yank the collar — you've seen what the beast does when it remembers.`,
      },
      riddle: {
        setup: p => `📺 Riddle Me This. ${p} has been taken.\n\nA lattice of mouths hangs in the air, opening and closing out of sync. The Riddle Engine doesn't want blood. It wants memories.\n\nRiddle one. The mouths ripple. ${p} answers steady — or doesn't. Wrong answers cost pieces of the past.`,
        turn: p => `📺 Riddle Me This — riddle two. The Engine has been reading ${p} between questions.\n\nIt asks about the dog. ${p} never told it about the dog. The mouths are all smiling. The village goes very quiet.`,
        end: p => `📺 Riddle Me This — the last riddle. The mouths lean close.\n\nThis one is about ${p}, and you can feel which memory it's reaching for.`,
        knows: p => `📚 You've seen this Engine before: the last riddle is always the one they don't want to answer. Watch ${p} — the only way through is to answer it truthfully anyway.`,
      },
      confession: {
        setup: p => `📺 The Confession. ${p} has been taken.\n\nA villager stands under the lights — the confessor. The confession, read flat: "I poisoned the water store."\n\nThe System, almost gentle: "PROVE IT TRUE OR FALSE BEFORE DUSK, INVESTIGATOR. WE PUNISH SOMEONE EITHER WAY." ${p} studies the confessor. The hands are steady. Too steady.`,
        turn: p => `📺 The Confession — ${p} is pressing. The story wobbles: the poison, the hour, the hands.\n\nReal guilt is consistent. This isn't. The confessor won't stop looking at the back row. The cameras noticed. ${p} noticed the cameras noticing.`,
        end: p => `📺 The Confession — dusk is coming. The System waits with the patience of weather.\n\n${p} has one verdict. The consequences are everyone's: name the real culprit and fracture the village, or confirm the lie and let the System take someone innocent.`,
        knows: p => `📚 You've seen a false confession before. The confessor keeps glancing at the same person in the crowd — guilt looks at who it's protecting.`,
      },
      honey: {
        setup: p => `📺 Sweet Tooth. ${p} has been taken.\n\nThe hive hangs in the arena like a second moon, humming. The swarm moves as one body and it has opinions.\n\n${p} works the smoker. The air goes grey and sweet. Harvest the comb. Try to keep your face.`,
        turn: p => `📺 Sweet Tooth — ${p} is at the comb. It glows. The queen cell pulses at the heart of it: the prize and the death, side by side.\n\nThe swarm is watching ${p} decide. The whole arena hums. The cameras can barely hold focus through the wings.`,
        end: p => `📺 Sweet Tooth — the getaway. The comb is in ${p}'s hands. The swarm is in the air.\n\nRun with the comb, walk out slow and smoking, or leave an offering. The swarm follows like weather. The gate is a long way off.`,
        knows: p => `📚 Smoke first, always. And whatever they do — the queen cell is the prize and the death. Don't touch it.`,
      },
      secrets: {
        setup: p => `📺 The Secret Deck. ${p} has been taken.\n\nThe dealer fans the deck. Every card has a face on it — someone watching. "ANTE UP. THE CURRENCY IS TRUTH."\n\n${p} draws. First card: someone in the village has been lying about their age. Someone in the front row just went pale.`,
        turn: p => `📺 The Secret Deck — the turn. The pot is secrets and it's getting deep.\n\n${p} calls. Second card: two villagers have been meeting at night. The cameras find the clearing. The village does the math before the cameras do.`,
        end: p => `📺 The Secret Deck — the river. Last card. The deck is warm in the dealer's hands, like it's alive.\n\nWhatever ${p} does next, the village will remember what was traded. Win, and three secrets air to the galaxy. Fold, and nobody ever knows what ${p} saved them from.`,
        knows: p => `📚 The deck isn't random — it's curated. It plays the secrets that hurt most when you're winning. You've seen someone fold here. Fold while you still like these people.`,
      },
      // --- CONTEST-POOL EXPANSION (Steve 2026-10-06) ---
      quiet: {
        setup: p => `📺 The Quiet Room. ${p} has been taken.\n\nA white room. One chair. No visible cameras — the room IS the camera. The System, soft: "SIT. THINK. WE WILL READ ALOUD. ONE HOUR."\n\nThe village watches. Nobody is eating the snacks anyone brought.`,
        turn: p => `📺 The Quiet Room — it's reading. ${p}'s own voice, speaking ${p}'s thoughts a half-second before they're thought.\n\nSomeone in the village gasps. Someone else goes very still. The thoughts are getting personal. There is nowhere to look away to — the broadcast is everywhere.`,
        end: p => `📺 The Quiet Room — the last minutes. Whatever ${p} has been burying all hour, it's reaching for it now.\n\nThe village holds its breath. Secrets this big have weight. When they land, everyone feels it.`,
        knows: p => `📚 You've sat in that chair. It's hunting the thought they're burying — the harder they clamp, the louder it reads. If you could shout one thing through the screen: THINK OF TURNIPS.`,
      },
      guest: {
        setup: p => `📺 The Guest. ${p} has been taken — or rather, volunteered by geography: the ambassador is coming to dinner, and ${p} is hosting.\n\nA ship the size of weather settles over the haven. Out steps something with too many limbs and impeccable manners. The table is set. The cameras are everywhere.`,
        turn: p => `📺 The Guest — the meal. ${p} serves. The ambassador lifts the bowl with two limbs at once and... considers.\n\nIt extends a limb toward ${p}. Nobody knows what the gesture means. The village is screaming advice at the screen. ${p} has to pick.`,
        end: p => `📺 The Guest — the toast. The ambassador rises, which takes a while.\n\nWhatever happens now, the whole village will be telling this story for years. The galaxy too. ${p} lifts the cup.`,
        knows: p => `📚 You've hosted before: bitter and fermented wins, sugar alarms it. And mirror the limbs — imitation reads as respect. Watch the toast. That's where it decides.`,
      },
      vigil: {
        setup: p => `📺 The Vigil. ${p} has been taken.\n\nNight. The haven wall. One lamp, lit. Below in the dark, something large is circling — you can see the grass move where it passes.\n\n${p} climbs to the post alone. The village sleeps. The cameras don't.`,
        turn: p => `📺 The Vigil — the circling. It's closer now. The lamp flame leans away from the dark like it's afraid.\n\n${p} is a silhouette against the light. Still. The night-vision feed shows the thing's eyes, low and patient, making another round.`,
        end: p => `📺 The Vigil — the last hour before dawn. The hardest one.\n\nThe lamp is low. ${p} is swaying. The thing has stopped circling and is just... watching the light. Dawn is close. So close.`,
        knows: p => `📚 You've held that wall. It circles the light, not the watcher — if the lamp stays bright, it stays out there. Watch the flame, not the eyes.`,
      },
      sorting: {
        setup: p => `📺 The Sorting. ${p} has been taken.\n\nThe conveyor runs the length of the arena — pack, tithe crate, everything the village set aside, riding the belt toward the sorter. KEEP pile on the left. Fire on the right.\n\nThe village watches its winter ride the belt. Nobody is breathing right.`,
        turn: p => `📺 The Sorting — the belt speeds up. The tithe crate is coming — the fever-root, the seed stores, the things with no shine on them at all.\n\n${p} is running alongside the belt now, grabbing. The sorter clicks, annoyed, and keeps sorting.`,
        end: p => `📺 The Sorting — the last crate. The System's voice, almost gentle: "ONE ITEM MAY BE SPARED FROM THE FIRE. CHOOSE."\n\nThe whole village leans forward. Whatever ${p} picks now, the winter remembers.`,
        knows: p => `📚 You've worked that belt. It keeps what shines and burns what's dull-useful — save the dull things. And it can't parse a body on the belt. Bodies aren't in the manual.`,
      },
      witness: {
        setup: p => `📺 The Witness. ${p} has been taken.\n\nThree villagers from the trap-line, seated in a row under the lights. Last night something hit the far traps. They each tell it different.\n\nThe System, mild: "TWO ARE TRUE MEMORIES. ONE WE WROTE. NAME THE FABRICATION."`,
        turn: p => `📺 The Witness — the press. ${p} is leaning into one of them, and the account is coming apart at the seam.\n\nOne of the three smiles wrong. Or cries right. From the village seats, it's impossible to tell which is worse.`,
        end: p => `📺 The Witness — the naming. ${p} points.\n\nThe village holds its breath — because whatever gets named, the village arms against it tonight. A wrong name is an unguarded treeline.`,
        knows: p => `📚 You've caught it before. It writes monsters from the codex but gets the behavior wrong — it doesn't know how they move. The hushwolf never screams. Listen for the seam.`,
      },
      cache: {
        setup: p => `📺 The Cache. ${p} has been taken — and one more, for the hauling.\n\nThe System's announcement scrolls across the sky: AT DAWN, THE SURVEYORS MAP EVERY HIDDEN CACHE. Tonight, the winter store moves.\n\nThe village watches its food go out into the dark in someone's arms.`,
        turn: p => `📺 The Cache — the drone sweep. A surveyor locks onto a moving shape in the dark and the night-vision feed goes tight.\n\n${p} is mid-step with the winter on their back. Freeze, decoy, or run — the whole village is silently screaming one of the three.`,
        end: p => `📺 The Cache — dawn. The surveyors present their map to the cameras.\n\nThe village leans in. Every hidden cache in the valley, mapped — or not. The winter hangs on what's drawn there.`,
        knows: p => `📚 You've run the dark with food on your back. Decoys beat speed — feed the cameras something small and loud and they'll log a victory and miss the big thing.`,
      },
      longodds: {
        setup: p => `📺 The Long Odds. ${p} has been taken.\n\nThe table is green felt under white light. Across it: the house champion, Vex of the Ninth Ledger — seventeen limbs, zero losses on camera, and a smile like a tax form.\n\nThe dice are fair. The stakes are the game.`,
        turn: p => `📺 The Long Odds — down two. The champion hasn't stopped smiling.\n\n${p} is deciding how much of themselves to push into the middle. The crowd has opinions. The crowd is very loud about them.`,
        end: p => `📺 The Long Odds — the last roll. Everything ${p} staked is in the middle of the table, and the dice are in the air.\n\nThe champion is watching the dice. For the first time tonight, it is not smiling.`,
        knows: p => `📚 You've sat at that table. The dice are fair; the champion isn't — it reads hesitation the way the scanner reads lies. Commit to the bit.`,
      },
      // --- NEW STYLES (Steve 2026-10-06) ---
      price: {
        setup: p => `📺 The Price. ${p} has been taken.\n\nThe System's voice, almost gentle: "ONE OF YOU. FOR THE SEASON. THE VILLAGE CHOOSES. YOU HAVE UNTIL DUSK."\n\nThe cameras pull back. The whole village is looking at each other. Nobody is looking at ${p}. Yet.`,
        turn: p => `📺 The Price — the debate is vicious and televised. Alliances form and break in real time.\n\n${p}'s name is on the short list. The System is taking notes on who argues for whom — it finds loyalty fascinating and doomed. The village is screaming at itself, and you are part of the screaming.`,
        end: p => `📺 The Price — dusk. The System calls for the name.\n\nThe envelope is opened. The cameras push in. The whole village holds one breath. Whatever name is in that envelope, the village will have to live next to the people who voted for it.`,
        knows: p => `📚 You've seen the Price before. Volunteering is the only move that doesn't fracture the village. If ${p} walks up willingly, the System respects it — and the village never forgets it.`,
      },
      impress: {
        setup: p => `📺 Impress Us. ${p} has been taken.\n\nFive aliens. They have catalogued 40,000 emotions across the galaxy.\n\n"IMPRESS US," they say. "WE HAVE FELT EVERYTHING."\n\n${p} stands alone under the lights, thinking. You have never seen anyone look so small and so interesting at once.`,
        turn: p => `📺 Impress Us — ${p} is doing... something. The judges are conferring in frequencies that make your teeth ache.\n\n"WE DO NOT UNDERSTAND," the lead judge says. It sounds frustrated. Curious. The translator gives up on the nuance. The audience is leaning in. Nobody has ever confused the judges before.`,
        end: p => `📺 Impress Us — the final offering. The judges are changed; you can see it in the way they hold themselves.\n\n"ONE MORE," they say. "SOMETHING ONLY THEY COULD GIVE."\n\nThe whole village leans forward with the audience. Whatever ${p} gives next, it can't be taken back.`,
        knows: p => `📚 You've watched this one before. They've felt everything except being human. The winners don't perform — they offer the thing they'd never show anyone. That's the only currency the judges don't have.`,
      },
      exchange: {
        setup: p => `📺 The Exchange. ${p} has been taken — one of three runners.\n\nYour village against Gray Hollow. A relay through the badlands — three legs, no rules about what runs between the markers. Losers tithe a season of food.\n\nThe cameras split three ways. Every eye in the village is on your team's feed.`,
        turn: p => `📺 The Exchange — mid-race. Gray Hollow is ahead — their runner is fast and fearless and slightly inhuman, which the System insists is legal.\n\n${p} is running like the village is watching. It is. Both villages are at the barriers, screaming each other's names. The gap is closing. Or opening. The cameras won't say.`,
        end: p => `📺 The Exchange — final leg. Neck and neck. The finish is a lit gate.\n\nThis is the part they'll replay for years. ${p} is running like the world is ending. It isn't, but the season's food might as well be.`,
        knows: p => `📚 You've run this one before. Gray Hollow always fades late — they run proud, not patient. The steady runner passes them at the line. The shortcut through the nest works once, for the cameras, and never again.`,
      },
      auction: {
        setup: p => `📺 The Auction. ${p} has been taken.\n\nThe System auctions three lots of alien tech. Currency: memories, years of life, body parts.\n\n"ALL BIDS ARE FINAL," the auctioneer says. "ALL BIDDERS PAY. WINNER TAKES THE LOT."\n\nThe crowd leans in. This is the cruelest show. Everyone loves it. ${p} is already doing the math of what they're willing to lose.`,
        turn: p => `📺 The Auction — bidding war. A Gray Hollow contestant just bid their childhood. Someone else bid a lung (they have two, they point out, which is technically true).\n\nThe lots are extraordinary. The prices are obscene. The audience is euphoric. ${p}'s hand is hovering. You want to shout at them to stop. You can't.`,
        end: p => `📺 The Auction — final lot. The hammer is raised. Everything bid so far is already gone — paid, taken, consumed.\n\nThis is the last chance. The tech on the block could change the village's winter. ${p} is deciding what they're worth. The whole village is doing the same math, and hating it.`,
        knows: p => `📚 You've sat through this auction before. The auctioneer can smell bluff but the rules bind it anyway. The winners are the ones who knew their price before the hammer — not the ones who found it during the bidding.`,
      },
    };
    const b = T[contest.id];
    if (!b) return null;
    const beats = [b.setup(pname), b.turn(pname), b.end(pname)];
    // Knowledge-gated coaching: only veterans (level 2+) get the line the
    // broadcast never says out loud.
    if (b.knows) {
      try {
        if (this.contestKnowledge(contest.id).level >= 2) beats[2] += '\n\n' + b.knows(pname);
      } catch (e) {}
    }
    return beats;
  };

  // The three watch beats ARE the show (Steve 2026-10-06): each contest gets
  // its own fiction now. Generic is fallback only — no contest in the pool
  // should ever reach it.
  // PLURAL BEATS (Steve 2026-10-06): the 34 contest-specific watch beats
  // were written for one taken villager ("Mara has been taken", "how Mara
  // dies"). When several are taken, the verbs must agree — "Amy and
  // Vanessa have been taken", "how Amy and Vanessa die". Literal,
  // subject-anchored swaps; possessives ("Amy and Vanessa's arms") and
  // past tense already read fine and are left alone.
  G._cxPluralBeats = function(text, name) {
    if (!text || !name) return text;
    const VERBS = [
      [' has ', ' have '], [' is ', ' are '], [' dies', ' die'],
      [' does ', ' do '], [" doesn't ", " don't "], [" isn't ", " aren't "],
      [' runs', ' run'], [' studies', ' study'], [' picks', ' pick'],
      [' works', ' work'], [' wants', ' want'], [' touches', ' touch'],
      [' steps', ' step'], [' stands', ' stand'], [' spends', ' spend'],
      [' speaks', ' speak'], [' reaches', ' reach'], [' points', ' point'],
      [' mounts', ' mount'], [' knows', ' know'], [' draws', ' draw'],
      [' crosses', ' cross'], [' calls', ' call'], [' answers', ' answer'],
    ];
    let out = text;
    for (const [sg, pl] of VERBS) {
      out = out.split(name + sg).join(name + pl);
    }
    return out;
  };
  // WATCHER AGENCY (Steve 2026-10-06): watching is not passive. Cheering
  // moves the win odds for your people — but the cameras notice loud
  // supporters (showmanship notability: the System files you under
  // *interesting*). Studying the pattern teaches without bleeding
  // (knowledge progression for watchers). Betting is real kcal with real
  // payout. Comfort lands after the verdict — the living feel it.
  G._contestWatchPhases = function(contest, participantIds) {
    const ids = Array.isArray(participantIds) ? participantIds : [participantIds];
    const pname = this._cxNameList(ids, true);
    const primary = ids[0] === 'player' ? 'You' : this.displayName(ids[0]);
    let veteran = false;
    try { veteran = this.contestKnowledge(contest.id).level >= 2; } catch (e) {}
    const canBet = (this.state.scholar.kcal || 0) >= 200;
    let beats = null;
    try { beats = this._contestWatchBeat(contest, pname); } catch (e) { beats = null; }
    if (!beats) {
      beats = [
        `📺 ${contest.name}. ${pname} ${ids.length > 1 ? 'have' : 'has'} been taken.\n\nYou watch with the village. The cameras love the watchers almost as much as the watched.`,
        `📺 ${contest.name} — it's going badly. Or well. It's hard to tell through the lights.\n\n${pname} ${ids.length > 1 ? 'are' : 'is'} still in it. The crowd is restless.`,
        `📺 ${contest.name} — it's over.\n\nThe outcome scrolls across the sky in letters the size of weather.`,
      ];
    }
    // Multi-take: the contest-specific beats were written singular —
    // fix verb agreement for a group.
    if (ids.length > 1 && beats) {
      beats = beats.map(b => this._cxPluralBeats(b, pname));
    }
    const phase1Choices = [
      veteran
        ? { label: 'Shout a real warning', sub: 'you know this one', do: { cheer: 0.10, notability: 'showmanship', note: `You shout the thing that matters — the tell you learned the hard way. ${primary} flinches... then adjusts. That landed. The cameras swing to you for a second.` }, next: 2 }
        : { label: 'Shout advice', sub: 'maybe helps', do: { cheer: 0.05, note: `You shout something useful. Whether ${pname} hear${ids.length > 1 ? '' : 's'} it over the noise is another question.` }, next: 2 },
      { label: 'Hold your breath', sub: 'tense', do: { note: 'You stop breathing. Everyone does. The village is one held breath.' }, next: 2 },
    ];
    if (canBet) {
      // The bet rides on the first taken. Wager 200 kcal, pays 400.
      phase1Choices.splice(1, 0,
        { label: `Bet 200 kcal on ${primary}`, sub: 'the System honors wagers', do: { bet: { amount: 200 } }, next: 2 });
    }
    return [
      { text: beats[0],
        choices: [
          { label: 'Cheer them on', sub: 'loud — the cameras notice', do: { cheer: 0.05, notability: 'showmanship', note: `You cheer for ${pname}. They hear it. The cameras swing toward YOU for a second — the System files you under *interesting*.` }, next: 1 },
          { label: 'Watch silently', sub: 'tense', do: { note: 'You watch without a sound. Your hands hurt from gripping.' }, next: 1 },
          { label: 'Study the pattern', sub: 'learn without bleeding', do: { study: true, note: `You watch the way it moves — the tells, the rhythm. If you ever go in there yourself, you'll remember this.` }, next: 1 },
          { label: 'Look away', sub: 'can\'t watch', do: { note: 'You look away. The cameras catch it anyway. The audience understands.', trauma: 3 }, next: 1 },
        ] },
      { text: beats[1], choices: phase1Choices },
      { text: beats[2],
        choices: [
          { label: 'Go to them', sub: 'after', do: { comfort: true, note: `You go to ${pname} after. Win or lose, they need a familiar face more than applause.` }, next: 'VERDICT' },
          { label: 'Give them space', sub: 'respect', do: { note: 'You give them space. The cameras move on. You don\'t.' }, next: 'VERDICT' },
        ] },
    ];
  };

  // WATCH VERDICT (Steve 2026-10-06): the watched contest resolves on its
  // own terms, not the watcher's choices. Death odds scale with contest risk
  // — blood/extreme contests kill villagers on camera.
  G._contestVerdict = function(ac) {
    const contest = this.contestPool().find(c => c.id === ac.contestId) || { risk: 'medium', name: ac.contestId };
    const dieBase = { low: 0, medium: 0.03, high: 0.10, extreme: 0.20 }[contest.risk] || 0;
    const winBase = { low: 0.70, medium: 0.55, high: 0.40, extreme: 0.25 }[contest.risk] || 0.5;
    // WATCHER AGENCY (Steve 2026-10-06): cheering moves the needle for your
    // people. Capped at +15% — the audience's love is real but not rigged.
    const cheer = Math.min(0.15, ac.cheer || 0);
    const pids = (ac.participants && ac.participants.length) ? ac.participants.slice() : [ac.participant];
    const s = this.state.scholar;
    let anyWon = false;
    const fates = [];
    pids.forEach((pid, i) => {
      ac.participant = pid;
      // MULTI-TAKE learn pacing: only the primary's fate teaches.
      ac._suppressLearn = i > 0;
      const winOdds = Math.min(0.95, winBase + cheer);
      let outcome;
      if (dieBase > 0 && Math.random() < dieBase) {
        this._contestDie(ac, 'The verdict came down hard.');
        outcome = 'died';
      } else {
        const won = Math.random() < winOdds;
        this._contestEnd(ac, won ? 'won' : 'lost', won);
        outcome = won ? 'won' : 'lost';
        if (won) anyWon = true;
      }
      fates.push({ pid, outcome });
      // The bet rides on the first taken. The System honors wagers: 2x.
      if (i === 0 && ac.bet) {
        const amt = ac.bet.amount;
        if (outcome === 'won') {
          s.kcal = (s.kcal || 0) + amt * 2;
          this.sysSay(`📺 Your bet pays out: +${amt * 2} kcal. The System honors wagers.`);
        } else {
          this.sysSay(`📺 Your ${amt} kcal is gone. The house always eats.`);
        }
      }
      // Comfort: the living feel it; the dead are mourned.
      if (ac.comfort && pid !== 'player') {
        try {
          const v = this.state.village;
          v.trust = v.trust || {};
          if (outcome === 'died') {
            s.trauma = Math.min(100, (s.trauma || 0) + 5);
            this.sysSay(`📺 You go to ${this.displayName(pid)} anyway. There is nothing to say. You stay until the cameras leave.`);
          } else {
            const cur = v.trust[pid] === undefined ? 10 : v.trust[pid];
            v.trust[pid] = Math.max(0, Math.min(100, cur + 3));
          }
        } catch (e) {}
      }
      // The fate calls above clear activeContest — restore it for the next
      // contestant's verdict.
      this.state.activeContest = ac;
    });
    if (cheer > 0 && anyWon) {
      this.sysSay(`📺 They heard you. Somewhere in the noise, your voice got through.`);
    }
    ac.participant = pids[0];
    ac._suppressLearn = false;
    this.state.activeContest = null;
    this.state.lastContestDay = s.day;
    // Single contestant: preserve the old outcome contract ('died'/'won'/
    // 'lost'). Multi: report every fate.
    if (fates.length === 1) return { done: true, outcome: fates[0].outcome };
    return { done: true, outcome: 'verdict', fates };
  };

  // KILL-CONTESTANT (Steve 2026-10-06): removeVillager is a hook-wrapper
  // with no hook attached anywhere — calling it alone leaves the dead on
  // the roster, eligible to be taken AGAIN (the pre-existing watch-death
  // branch had the same hole). Belt and suspenders: call it for any module
  // hooks, then filter the roster directly so death is real.
  G._cxKillContestant = function(pid) {
    try { if (this.removeVillager) this.removeVillager(pid, 'killed'); } catch (e) {}
    try {
      const v = this.state.village;
      v.roster = (v.roster || []).filter(id => id !== pid);
      if (v.positions) delete v.positions[pid];
    } catch (e2) {}
  };
  // MULTI-TAKE FATES (Steve 2026-10-06): when the player is taken alongside
  // villagers, each of them has their own off-screen contest. Their fates
  // roll here at the end of the player's sequence — they can win, lose, or
  // die, and the village feels it. No knowledge for watching from the
  // inside: you had your own arena to survive.
  G._contestResolveOthers = function(ac) {
    const others = (ac.others || []).filter(id => id !== 'player');
    if (!others.length) return;
    const contest = this.contestPool().find(c => c.id === ac.contestId) || { risk: 'medium', name: ac.contestId, id: ac.contestId };
    const dieOdds = { low: 0, medium: 0.03, high: 0.10, extreme: 0.20 }[contest.risk] || 0;
    const winOdds = { low: 0.70, medium: 0.55, high: 0.40, extreme: 0.25 }[contest.risk] || 0.5;
    const s = this.state.scholar;
    this.sysSay(`📺 ───`);
    this.sysSay(`📺 While you fought your fight, they fought theirs.`);
    for (const pid of others) {
      const pname = this.displayName(pid);
      if (dieOdds > 0 && Math.random() < dieOdds) {
        this.sysSay(`📺 ${pname} didn't come home.`);
        this.sysSay('📺 ' + this._contestDeathLine(contest, '', pname));
        this._cxKillContestant(pid);
        try { this.say(`☠ ${pname} is gone. The village will say the name for a long time.`); } catch (e) {}
        try { this.leadShift('fracture', 1); } catch (e) {}
        s.trauma = Math.min(100, (s.trauma || 0) + 8);
      } else if (Math.random() < winOdds) {
        this.sysSay(`📺 ${pname} WON. You didn't see it — you had your own arena. The village will tell you about it for weeks.`);
        this.addNotability(pid, 'contestWin');
      } else {
        const survived = [
          `📺 ${pname} survived. Barely, by the look of them when the lights came up.`,
          `📺 ${pname} made it out. They won't talk about what happened in there.`,
          `📺 ${pname} is back. Shaking. Alive. That's more than most get.`,
          `📺 ${pname} walked out under their own power. The cameras lingered a little too long.`,
        ];
        this.sysSay(survived[Math.floor(Math.random() * survived.length)]);
      }
    }
  };

})();