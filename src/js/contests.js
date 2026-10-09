// @ontology
// system: contests
// description: Alien TV contests and shows that interrupt village life. Contests are FEARED high-risk events; shows are gossip/drama. UNAVOIDABLE — they interrupt whatever you're doing.
// provides:
//   - contestEligible() -> {eligible, reason}
//   - contestTick() -> event|null
//   - contestPool()
//   - pickContest()
//   - pickShow()
//   - fireShow(show) -> show (played TV beat: the pull can land on the player, a villager, or the village together — modal via the contest phase engine)
//   - showPhases(show, who) -> played phases for a player show pull
//   - showWatchPhases(show, pid) -> watch beat when a villager is pulled (cheer/heckle/comfort)
//   - showTogetherPhases(show) -> communal watch-together beat
//   - showResolveVillager(pid, show, opts) -> {outcome, score} (deterministic: fans/shame/both)
//   - _showVillagerEnd(ac) -> lands a villager's show (fans/shame/both + gossip)
//   - _showEnd(ac, outcome, prize) -> lands a player/village show or ratings summons (fans/shame/both/refused)
//   - _showGossip(how, pid, showName) -> seeds show gossip (REP, never trust)
//   - _showGenericBeat(show) -> fallback played beat for shows without an authored beat
//   - SHOW_BEATS -> per-show played beats (all 30 pool shows authored)
//   - fireRatingsSummons() -> played ratings-stunt summons modal
//   - ratingsSummonsPhases() -> the summons beat (stunt / phone it in / refuse)
//   - _cxFanLane(contest) -> fan-club lane for a contest category
//   - fireContest(contest)
//   - resolveContest()
//   - contestInterruption(contest, participant) -> sequence
//   - contestKnowledge(contestId) -> {seen,wins,level}
//   - contestLearn(contestId, outcome)
//   - _contestScaled(base, variant) -> contest (wave + hardened, both ends of fire->resolve)
//   - _cxScaledContest(ac) -> contest (scaled copy for end paths: variant + wave scaling re-applied from ac.variant, so announced == resolved)
//   - _cxStorePhase(ac, idx, rendered) -> rendered (choice box renders ac.phases directly)
//   - _contestDeathLine(contest, how, pname)
//   - _contestRenderPhase(ac, phase, idx)
//   - _contestArena(ac, spec, log) -> suspends modal, starts real tactical fight; _contestArenaAfter(arc, result) resumes via tbEnd hook (code: _contestArena, Steve 2026-10-08)
//   - _contestVerdict(ac) -> multi-participant watch-mode verdict via real contest engine (contestResolveGroup); cheer is performance not odds (code: _contestVerdict, Steve 2026-10-08; SUPERSEDES the 2026-10-06 risk-scaled roll)
//   - _contestResolveOthers(ac) -> fates for villagers taken alongside the player via contestResolveVillager (code: _contestResolveOthers, Steve 2026-10-08)
//   - _cxNameList(ids, capPlayer) -> "Mara" / "Mara and Tove" / "Mara, Tove and Sef"
//   - _cxTakenLine(ids) -> taken announcement (single or multi)
//   - _cxPluralBeats(text, name) -> verb-agreement fix for multi-take watch beats
//   - _cxKillContestant(pid) -> real roster removal for contest deaths (removeVillager wrapper is a no-op)
//   - _cxGossip(how, pid, contestName) -> seeds contest-outcome gossip so the village talks about wins/deaths (Steve 2026-10-08)
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
//   - eligible_villagers: alive + member in good standing + fighting age 15-72 + health > 20 (gravely wounded out per docs/CONTESTS.md; break-it 2026-10-09); player alive/health>0/not exiled (code: contestEligible, Steve 2026-10-06)
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
//   - watcher_agency: watch choices have real consequences — cheer is real performance (bravery in blood, case-lift in moot, cap +15%, cameras notice), study teaches, bets are real kcal (2x payout on the first taken), comfort lands as trust/mourning (code: _contestWatchPhases, contestChoose, _contestVerdict, Steve 2026-10-06; cheer-as-performance Steve 2026-10-08)
//   - choice_sometimes: player may get choice to participate, usually grabbed (code: fireContest, Steve 2026-10-05)
//   - watch_mode: non-participants watch as a show (code: contestInterruption, Steve 2026-10-05)
//   - watched_fates_real: watch-mode contestants resolve through the real contest engine (contestResolveGroup) — fights fought, moots argued, ordeals endured. No outcome tables (code: _contestVerdict, contestEngine.js, Steve 2026-10-08); SUPERSEDES watched_deaths (risk-tier rolls)
//   - watch_beats_specific: each contest gets its own 3 watch beats (setup/turn/ending) — the fiction of THAT contest, not generic filler; veteran watchers get a coaching line (code: _contestWatchBeat, _contestWatchPhases, Steve 2026-10-06); price/impress/exchange/auction beats added — generic fallback no longer reachable by any pool contest (code: _contestWatchBeat T table, Steve 2026-10-06)
//   - single_prefix: phase texts carry their own 📺 prefix; _cxPhaseSay never doubles it (code: _cxPhaseSay, Steve 2026-10-05)
//   - played_not_rng: "contests are to be played, not as RNG" (Steve 2026-10-08) — flat die: death rolls REMOVED from all phases; death comes from real damage (health→0), real fights (arena), or deterministic pursuit (Maw). SUPERSEDES risk_rebalance_20261006 and wounds_feed_closer (Gauntlet is now 3 real arena waves; wounds carry as health, not odds) (code: contestChoose, Steve 2026-10-08)
//   - arena_fights: Blood pit/gauntlet/siege send the player into REAL tactical fights — contest modal suspends (arenaSuspended), grid becomes arena, tbEnd resumes via _contestArenaAfter (won→next wave/WIN, lost→death processed, fled→LOSE+shame). Weapon choices grant real items (code: _contestArena, _contestArenaAfter, contestChoose d.arena/d.grantWeapon, tbEnd hook, Steve 2026-10-08); duel/tithe stay phase-engine (tb has no villager enemies; tithe is a ritual) — documented, not hidden
//   - moot_standing: moot is argued not rolled — rhetorical standing (trust/10 + notability×2 base, sway per choice) vs System demand; deterministic judgment (code: _contestMoot, contestChoose MOOT_JUDGE, Steve 2026-10-08)
//   - maw_pursuit: the Maw is a deterministic pursuit — distance 3, choices move it, 0 = caught (death). No rolls (code: _contestMaw, contestChoose MAW_JUDGE, Steve 2026-10-08)
//   - ratings_casting: the System wants its stars — picks weighted by notabilityWeight (ONE shared weight: depth + impact, Steve 2026-10-09), 10% whim dark-horse path (uniform, announced). The lead pick is weighted too when the player isn't castable (break-it 2026-10-09: the old lead fallback was uniform and unannounced, so fame never mattered for a solo lead). Recast honors the bias (code: fireContest, resolveContest, Steve 2026-10-08)
//   - ratings_scheduling: scheduling driven by ratings/drama — base 0.25/day, +0.15 viewership declining, -0.10 ratings high/rising, +0.10 recent death/fracture; clamp 0.05–0.60; 2/week budget holds; 75% contest share when ratings dip (code: contestTick, Steve 2026-10-08; DIP-SIGNAL FIX audit-shows 2026-10-09: the dip was compared AFTER _lastWeekViewership was overwritten — always false, the 75% branch was dead; now computed once from the trend)
//   - contest_knowledge: repeats build codex.contests levels 1-3; level 2 unlocks coaching in the intro, level 3 (veteran) reads hits coming (code: contestLearn, _cxCoaching, contestChoose, Steve 2026-10-05)
//   - social_costs: do.fracture/do.unity shift the leadership ledger — winning can cost the village (code: contestChoose, Steve 2026-10-06)
//   - template_prize: every playable WIN choice carries prize:true — winners get the alien-loot prize path (templates were missing it, bespoke always had it; tithe/confession/generic stragglers fixed break-it 2026-10-08; moot 'Walk out'->MOOT_JUDGE win fixed break-it 2026-10-09) (code: contestPlayable, contestChoose, Steve 2026-10-06)
//   - arena_reentry_guard: while the contest modal is suspended for a real arena fight, contestChoose drops all input ({arena:true}) and _contestArena refuses a second start — a double-tap race used to re-fire startCombat (clobbering state.arenaContest mid-fight) and re-grant grantWeapon choices (code: contestChoose, _contestArena, break-it 2026-10-09)
//   - winner_share_pantryadd: a villager's watched win puts the winner's share through pantryAdd — the pantry cap is real, pantryKcal stays in sync; a full pantry gets the honest "eaten on the spot" line, never a silent overfill (code: _contestEnd, break-it 2026-10-09)
//   - hardened_real: the hardened variant is mechanically real, not a paper tiger. What was announced ("It's worse now") is what's played AND resolved: the scaled contest (not the pool base) is used at every end path (_cxScaledContest), so hardened risk reaches the engine in watched verdicts and the name resolves as "Hardened X"; phase damage is x1.25 at the contestChoose choke point; arena beasts run one wave hotter; hardened prize rolls are hotter (code: _cxScaledContest, contestChoose, _contestArena, _contestEnd, break-it 2026-10-09)
//   - prize_table: a player win rolls a real contest prize table, not a guaranteed drop — 60% chance of alien loot (75% hardened), loot tier capped at 3, tier 4 only at a low rate (25%) for extreme-risk wins at wave 4. The old {chance:1, tier:wave} mapped monster wave straight onto loot tier (the forbidden wave->tier conflation) and handed a guaranteed apex item per wave-4 win vs 12% off an actual apex kill (code: _contestEnd, break-it 2026-10-09)
//   - watch_coaching_all: veteran watchers (codex level 2+) get a 📚 coaching line on the last watch beat for all 16 knowledge-gated contests — tithe/riddle first, siege/maw/oath/beastmaster/confession/honey/secrets added, then quiet/guest/vigil, then sorting/witness/cache/longodds (code: _contestWatchBeat, Steve 2026-10-06)
//   - risk_rebalance_20261006: HIGH RISK rebalance — brave choices now usually kill (~50% death across full aggressive runs), smart choices live but cost heavily. Pit aggressive: 0.08/0.12 -> 0.20/0.30. Hide: 0.20/0.18/0.25 -> 0.32/0.25/0.38. Siege/hold: 0.20 -> 0.30. Rewards NOT nerfed — high risk justifies high reward (code: contestChoose die odds, Steve 2026-10-06)
//   - pool_expansion_20261006c: four NEW competition styles (Steve 2026-10-06) — price (moot/extreme: sacrifice, village chooses who pays), impress (weird/medium: creative, make aliens feel something new), exchange (endurance/high: team vs team village relay), auction (chance/high: bid memories/years/parts, everyone pays). NOT reskins: price is social horror not trial (moot); impress is creation not performance (cookfight); exchange is team not solo (drop); auction is economic not random (lottery) (code: contestPool, contestPlayable, Steve 2026-10-06)
//   - pool_expansion_20261007: the three smallest pools (puzzle/detective/forage, 4 each) each gain two bespoke variants — lockpick (vault-lock, weight-order tumblers), wrongmap (the System lies about water), alibi (alibi chain, false link vouches loudest), echo (two tellings, noon adds danger), tidepool (tide clock, third gull-cry), windfall (rot race, preservation order). NOT reskins: lockpick is tension-and-listening not folding (box); wrongmap is terrain-truth not Q&A (riddle); alibi is chain-breaking not liar-hunting (informant); echo is version-drift not fabrication-hunt (witness); tidepool is an environmental clock not a race (calorie_run); windfall is preservation triage not harvest (honey) (code: contestPool, contestPlayable, Steve 2026-10-05)
//   - pool_expansion_20261006b: the four smallest pools (puzzle/detective/forage/chance, 3 each) each gain a bespoke variant — sorting (conveyor triage), witness (fabrication hunt), cache (audit heist), longodds (push-your-luck dice). NOT reskins: sorting is triage-under-time not Q&A (riddle); witness is forgery-forensics not liar-hunting (informant); cache is hiding not gathering (calorie_run); longodds is stakes-escalation not pure draw (lottery) (code: contestPool, contestPlayable, Steve 2026-10-06)
//   - beat_audio: every contest beat fires a named audioEvent that resolves — new beats are composed, named dispatches over already-registered Game.audio synths, lazy-registered on first fire (Game.audio doesn't exist until app.js loads, after contests.js); phases declare beat:'name', _contestRenderPhase fires it (code: _cxBeat, _contestRenderPhase, Steve 2026-10-06); price/impress/exchange/auction beats now resolve (justiceVerdict+exileWalk, levelup+contestSpared, contestCall+rushHit, contestCall+horrorSting) — were silent no-ops (code: CX_BEAT_DEFS, Steve 2026-10-06); the 30 older contests now have per-phase composed beats contest<Id>Declare|Escalate|Climax|Resolve in CX_BEAT_DEFS, named by _cxB (Steve 2026-10-08); _contestEnd/_contestDie/_contestRefuse fire the Resolve beat (code: CX_BEAT_DEFS, _cxB, Steve 2026-10-08); the participate/refuse choice screen fires the small shared contestChoice beat (droneCorrect+lineCut), never a contest's Declare beat — firing Declare there double-stings on Participate and plays the bespoke sting on Refuse (code: contestInterruption choicePhase, Steve 2026-10-08)
//   - no_intro_repeat: the choice-phase text must not re-say contest name+desc (contestInterruption says it two lines earlier); it says only "The System waits." (code: contestInterruption, Steve 2026-10-08)
//   - countdown_announced: the warning names the grab ("at dawn, one more day"); the grab lands a dread beat first ("It is today") (code: fireContest, resolveContest, Steve 2026-10-08)
//   - gossip_aftermath: contest outcomes seed village gossip (contest_won/contest_survived/contest_died) via _cxGossip — news travels by mouth, distorted by retelling, not broadcast; villagers only (code: _cxGossip, _contestEnd, _contestDie, _contestResolveOthers, Steve 2026-10-08)
//   - fan_favor_contests: televised wins move the fan club (+4 player, +2 villager); a player win can shake loose a fan care package (code: _contestEnd, Steve 2026-10-08)
//   - fan_favor_lanes: televised wins move the club that watched them — blood→fight, endurance→survival, moot→social, everything else→showbiz (code: _cxFanLane, _contestEnd, audit-shows 2026-10-09)
//   - show_playable: shows are PLAYED beats, not announcements — the pull can land on the player (showPhases), a villager (showWatchPhases + deterministic showResolveVillager), or the village together (showTogetherPhases); every pool show has an authored beat in SHOW_BEATS, with _showGenericBeat as fallback (code: fireShow, SHOW_BEATS, audit-shows 2026-10-09)
//   - show_casting: notability-first — the pull goes to the notable (ONE shared notabilityWeight: depth + impact, Steve 2026-10-09); zero-deed villagers never pulled while notables exist; NO default-together — with nobody notable the pull goes to the SCHOLAR ("the cameras don't know these people yet"); together episodes fire ONLY on triggers (viewership milestone +5); 10% whim announced and constrained to notables; exact ties share the top band (code: showCastPull, showEligible, notabilityWeight, Steve 2026-10-09)
//   - show_no_death: TV doesn't kill — show/summons damage clamps at 1 HP and DIE terminals land as a bad night; shows are lower-stakes than contests by canon (code: contestChoose, docs/CONTESTS.md)
//   - villager_show_fates: a pulled villager comes home with fans or shame, sometimes both — deterministic score (2 base + 2/showmanship notability + stable per-villager hash + player cheer), fans>=7, shame<=3, else both; gossip seeds the village talk (code: showResolveVillager, _showVillagerEnd, audit-shows 2026-10-09)
//   - show_favor: show beats move the showbiz fan club via do.fanLane ({lane, n, why} or bare n); shame still moves it +1, said out loud — the galaxy loves a trainwreck (code: contestChoose, _showEnd, _showVillagerEnd, audit-shows 2026-10-09)
//   - ratings_summons: when viewership dips, 20% of scheduled TV is a played ratings summons — do the stunt (real cost, wacky gift, showbiz favor, shakes a care package loose), phone it in, or refuse on camera; canon basis is the OVERSIGHT design (Steve 2026-10-04), no doc covers it (code: contestTick, fireRatingsSummons, audit-shows 2026-10-09)
//   - summons_budget: ratings summons consume the shared 2/week TV budget like contests and shows (code: contestTick)
//   - villager_prize_real: a watched villager win grants real pantry rations ("Winner's share"), not a placeholder line (code: _contestEnd, Steve 2026-10-08)
//   - win_tax_announced: the -5 hp winner's mark is said out loud, never silent — a hidden HP tax is a lie (code: _contestEnd, Steve 2026-10-08)
//   - fame_is_deed: showmanship notability (TV pull-aways, camera play) surfaces as "audience favorite" in the eligibility panel (code: notability, Steve 2026-10-06)
//   - broadcast_hooks: BROADCAST MODE entry/exit/beat hooks — fireShow, fireRatingsSummons, and the contest watch branch call broadcastStart; all 7 activeContest=null end paths call broadcastEnd (idempotent); _contestRenderPhase routes phase.beat into broadcastBeat; _contestVerdict fires broadcastReplay; show phases declare beat names; _showEnd/_showVillagerEnd call the outcome beat (code: broadcast.js, Steve 2026-10-09)
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
      // GRAVELY WOUNDED (break-it 2026-10-09 r4; docs/CONTESTS.md): canon
      // says the gravely wounded are ineligible. 20 HP is the engine's own
      // survival floor (drop/starve reserve) — at or below it you're not a
      // contestant, you're a casualty waiting for a timeslot.
      const vhp = ((this.state.village.health || {})[rid] !== undefined)
        ? this.state.village.health[rid] : 100;
      if (vhp <= 20) continue;
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

  // NOTABILITY WEIGHT (Steve 2026-10-09): ONE shared casting weight for
  // contests (ratings_casting) and shows (showCastPull). Depth AND impact
  // count now — the old 1 + distinctNoteTypes×2 is gone.
  //   W = 1 + 2 × Σ over deed types Σ over repeats (impact_t × depthMult_k)
  // depthMult halves per repeat of the SAME deed: 1st ×1, 2nd ×0.5,
  // 3rd ×0.25, 4th+ ×0.125 (floored — the galaxy gets bored, not blind).
  // All multipliers are powers of two, so float equality on ties is exact.
  G.NOTABILITY_IMPACT = {
    wave3Kill: 4,    // slew a wave-3 horror — the biggest thing filmed
    wave2Kill: 3,    // slew a wave-2 beast — high
    survivedMoot: 2, // survived the Moot
    heist: 2,        // pulled off a heist
    contestWin: 2,   // won a contest — a real deed, every time
    showmanship: 1,  // a TV appearance — the aliens' small change
    // Any other tracked deed ('unboxed on camera', 'trial of the long
    // stalk', 'trial of stone', …): impact 1 — no metadata, no invention.
  };
  G.notabilityWeight = function(vid) {
    const deeds = (this.state.notability || {})[vid] || {};
    let s = 0;
    for (const t of Object.keys(deeds)) {
      const n = deeds[t] | 0;
      if (n <= 0) continue;
      const impact = (this.NOTABILITY_IMPACT[t] != null) ? this.NOTABILITY_IMPACT[t] : 1;
      for (let k = 0; k < n; k++) {
        s += impact * (k === 0 ? 1 : k === 1 ? 0.5 : k === 2 ? 0.25 : 0.125);
      }
    }
    return 1 + 2 * s;
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

    // RATINGS-DRIVEN (Steve 2026-10-08): the 30%/day flat roll is gone. The
    // System schedules television like a producer:
    // - base 0.25/day
    // - viewership declining week-over-week: +0.15 (desperate for numbers)
    // - ratings high and rising: -0.10 (coasts on the glow)
    // - recent death or fracture: +0.10 (it smells a story)
    // Clamped 0.05–0.60. Budget (2/week) still caps it. Contests are bigger
    // TV than shows — the contest share rises when ratings dip.
    let chance = 0.25;
    // RATINGS DIP (audit-shows 2026-10-09): computed ONCE from the trend,
    // before _lastWeekViewership is overwritten below. The old code compared
    // v.viewership < v._lastWeekViewership AFTER the update — always false,
    // so the "75% contest when the numbers are bad" branch was dead.
    let ratingsDipping = false;
    try {
      const v = this.state.village || {};
      const now = (typeof this.havenViewership === 'function') ? this.havenViewership() : (v.viewership || 0);
      const lastWeek = v._lastWeekViewership;
      if (lastWeek !== undefined && lastWeek !== null) {
        const trend = now - lastWeek;
        if (trend < -1) { chance += 0.15; ratingsDipping = true; }
        else if (trend > 2) chance -= 0.10;
      }
      v._lastWeekViewership = now;
      const day = this.state.scholar.day || 1;
      const recentDeath = (v.fallen || []).some(f => day - (f.day || 0) <= 3);
      let fracture = false;
      try { fracture = (this.ledger() || {}).fracture > 0; } catch (e) {}
      if (recentDeath || fracture) chance += 0.10;
    } catch (e) {}
    chance = Math.max(0.05, Math.min(0.60, chance));
    if (Math.random() > chance) return null;

    const { eligible } = this.contestEligible();
    if (!eligible.length) return null;

    // 60% contest, 40% show — 75% contest when the numbers are bad.
    let contestShare = 0.6;
    if (ratingsDipping) contestShare = 0.75;
    // RATINGS SUMMONS (audit-shows 2026-10-09): when the numbers go soft the
    // System doesn't just schedule harder — 20% of the time it summons YOU
    // for a promo stunt instead. Canon: OVERSIGHT design (Steve 2026-10-04:
    // "Ratings summons (promos/stunts, small gifts, ties to care packages)")
    // — no doc covers it; noted here, not invented silently. Played via
    // fireRatingsSummons, inside the same 2/week budget.
    if (ratingsDipping && Math.random() < 0.20) {
      this.state.showBudget.used++;
      return { id: '__summons' };
    }
    const isContest = Math.random() < contestShare;
    const event = isContest ? this.pickContest() : this.pickShow();
    if (!event) return null;
    
    this.state.showBudget.used++;
    return event;
  };

  // === CONTEST POOL ===
  // Data-driven templates. Categories: Blood, Endurance, Moot, Weird,
  // Puzzle, Detective, Forage, Chance. (Steve 2026-10-05: expand variety)
  // === CONTEST POOL ===
  // DATA-DRIVEN (Steve 2026-10-07): Contest definitions live in
  // src/data/contests.json. To add a new contest, add an entry there —
  // no code changes needed. Each entry:
  //   {id, name, cat, risk, desc, participants, arena}
  // Categories: Blood, Endurance, Moot, Weird, Puzzle, Detective, Forage, Chance.
  G.contestPool = function() {
    return (this.data && this.data.contests) || [];
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
      { id: 'moot', name: 'The Moot',
        desc: 'Televised trials and debates. The village holds court on camera; the galaxy is the jury.' },
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

  // SHOW ELIGIBLE (Steve 2026-10-09): who CAN be pulled for TV. Same gates
  // as contestEligible (alive, member in good standing, age, gravely-wounded
  // floor) — a corpse can't be pulled for TV either — minus the grid-position
  // requirement: a TV pull takes you away, it doesn't need you standing
  // somewhere. Returns [{id, name, notability[]}]; id 'player' = the scholar.
  G.showEligible = function() {
    const eligible = [];
    const s = this.state.scholar || {};
    if (!this.state.over && (s.health || 0) > 0 && !s.exiled) {
      eligible.push({ id: 'player', name: 'You', notability: this.notability('player') });
    }
    const roster = (this.state.village.roster || []);
    for (const rid of roster) {
      if (rid === this.villagerId) continue; // player handled above
      if (!this.isMember(rid)) continue;     // dead or severed: not pulled
      const vp = this.vpOf(rid);
      const age = (vp && typeof vp.age === 'number') ? vp.age : 30;
      if (age < 15 || age > 72) continue;    // children and the very old stay
      const vhp = ((this.state.village.health || {})[rid] !== undefined)
        ? this.state.village.health[rid] : 100;
      if (vhp <= 20) continue;               // gravely wounded: not a star
      eligible.push({ id: rid, name: this.displayName(rid), notability: this.notability(rid) });
    }
    return eligible;
  };

  // SHOW CAST PULL (Steve 2026-10-09): notability-first casting. The aliens
  // want their stars. Rules, in order:
  // 1. MILESTONE: viewership all-time high by a real margin (+5) — the
  //    village gathers to watch itself be watched. A trigger, never a roll.
  // 2. NO DEFAULT-TOGETHER: when nobody is notable, the pull goes to the
  //    SCHOLAR — the audience follows the protagonist; the show is
  //    introducing its cast. ("The cameras don't know these people yet.
  //    They know YOU.") If the scholar isn't eligible, fall back to
  //    together — can't pull a corpse.
  // 3. THE FLOOR: zero-weight villagers (no deeds) are never pulled while
  //    notables exist. The aliens don't point cameras at the unwatched.
  // 4. WHIM: 10%, uniform among NOTABLES only, announced — same shape as
  //    the contest whim (alien whimsy), but unpopular people are never
  //    randomly chosen, period.
  // 5. THE RULE: highest notabilityWeight wins — depth and impact count,
  //    the SAME weight as contest ratings_casting. Exact ties share the
  //    top band: tiny RNG among equals only ("the cameras couldn't decide").
  // Fame's price: more notability → more pulls → more embarrassment risk.
  // Obscurity is safety — a legitimate player tradeoff, not an exploit.
  // Returns {who: 'player'|vid|'together', why, note}.
  G.showCastPull = function() {
    const cands = this.showEligible();
    const v = this.state.village || {};
    // Milestone: new all-time viewership high by a real margin (+5, not +1
    // noise). The bar ratchets — peak updates whenever exceeded.
    let now = 0;
    try { now = (typeof this.havenViewership === 'function') ? this.havenViewership() : (v.viewership || 0); } catch (e) {}
    if (v._peakViewership == null) v._peakViewership = now;
    const milestone = now >= v._peakViewership + 5;
    if (now > v._peakViewership) v._peakViewership = now;
    if (milestone) {
      return { who: 'together', why: 'milestone', note: null };
    }
    const weighted = cands.map(c => ({ c, w: this.notabilityWeight(c.id) }));
    const notable = weighted.filter(x => x.w > 1);
    if (!notable.length) {
      const scholar = cands.find(c => c.id === 'player');
      if (scholar) return { who: 'player', why: 'debut', note: null };
      return { who: 'together', why: 'no-cast', note: null };
    }
    if (Math.random() < 0.10) {
      const pick = notable[Math.floor(Math.random() * notable.length)];
      return { who: pick.c.id, why: 'whim', note: (pick.c.notability || [])[0] || null };
    }
    let maxW = -1;
    for (const x of notable) if (x.w > maxW) maxW = x.w;
    const band = notable.filter(x => x.w === maxW);
    const pick = band[Math.floor(Math.random() * band.length)];
    return { who: pick.c.id, why: band.length > 1 ? 'tie' : 'star',
             note: (pick.c.notability || [])[0] || null, band: band.length };
  };

  G.pickShow = function() {
    const pool = this.showPool();
    return pool[Math.floor(Math.random() * pool.length)];
  };

  // FIRE SHOW (Steve 2026-10-06; PLAYABLE audit-shows 2026-10-09): the
  // in-between is a played beat, not an announcement. The old version
  // printed three lines and a notability tick — and never pulled the
  // player, so shows were unreachable as play. Now: the pull can land on
  // the player (played modal via showPhases), a villager (the player gets a
  // watch beat with real choices; the villager comes home with fans or
  // shame — sometimes both, per docs/CONTESTS.md), or the village together
  // (one communal beat). Wired: game.js's dawn branch calls fireShow(event)
  // for non-contest events.
  G.fireShow = function(show) {
    const s = (show && show.id) ? show : this.pickShow();
    this.sysSay(`📺 TONIGHT: ${s.name}. ${s.desc}`);
    // Who gets pulled — NOTABILITY-FIRST (Steve 2026-10-09; code:
    // showCastPull). The flat 30/40/30 die roll is gone: the aliens want
    // their stars, the pull is exposure not a prize, and popular isn't
    // good — it's just what the aliens like to see.
    const cast = this.showCastPull();
    const who = cast.who; // 'player' | villagerId | 'together'
    let phases = null;
    if (who === 'player') {
      if (cast.why === 'debut') {
        this.sysSay(`📺 The cameras don't know these people yet. They know YOU. Somebody has to be first on the screen.`);
      } else {
        if (cast.why === 'whim') this.sysSay(`📺 The System's whim: you are *interesting*.`);
        else if (cast.why === 'tie') this.sysSay(`📺 The cameras couldn't decide — they chose you.`);
        this.sysSay(`📺 The cameras want YOU — ${cast.note || 'the galaxy knows your name'}.`);
      }
      this.sysSay(`📺 That's not an honor. It's just what the aliens like to see. You're going on television.`);
      try { this.audioEvent('contestTaken'); } catch (e) {}
      phases = this.showPhases(s, 'player');
    } else if (who === 'together') {
      if (cast.why === 'milestone') {
        this.sysSay(`📺 Biggest audience yet — the whole galaxy is watching tonight. The village gathers to watch itself be watched. Someone brings snacks. It helps.`);
      } else {
        this.sysSay(`📺 The village watches together. Someone brings snacks. It helps.`);
      }
      phases = this.showTogetherPhases(s);
    } else {
      const pname = this.displayName(who);
      if (cast.why === 'whim') {
        this.sysSay(`📺 The System's whim: ${pname} is *interesting*.`);
      } else if (cast.why === 'tie') {
        this.sysSay(`📺 The cameras couldn't decide — they chose ${pname}.`);
      }
      this.sysSay(`📺 The cameras want ${pname} — ${cast.note || 'the galaxy knows their name'}. Not an honor. Just what the aliens like to see.`);
      this.sysSay(`📺 ${pname} will be back by morning. Probably. The village will talk about this for days.`);
      try { this.audioEvent('contestTaken'); } catch (e) {}
      phases = this.showWatchPhases(s, who);
    }
    if (!phases || !phases.length) {
      // Never leave the player in a modal with no phases — that's a stuck
      // screen (same rule as contests). Fall back to the old announcement.
      this.addNotability(who === 'together' ? 'player' : who, 'showmanship');
      try { this.leadShift('showmanship', 1); } catch (e) {}
      return s;
    }
    this.state.activeContest = {
      kind: 'show',
      showId: s.id,
      showName: s.name,
      participant: who,
      phase: 'intro',
      phaseIdx: 0,
      phases: phases,
      variant: null,
      wounds: 0,
    };
    this.sysSay('📺 ───');
    // BROADCAST MODE (Steve 2026-10-09): the show gets the TV frame —
    // entry card, LIVE bug, commentary. The frame, not the beats, is new.
    try { this.broadcastStart('show', { showId: s.id, showName: s.name, participant: who }); } catch (e) {}
    const rendered = this._contestRenderPhase(this.state.activeContest, phases[0], 0);
    this._cxStorePhase(this.state.activeContest, 0, rendered);
    this._cxPhaseSay(rendered.text);
    return s;
  };

  // SHOW GOSSIP (audit-shows 2026-10-09): like _cxGossip but for the TV
  // shows — the village talks about who went on, who got fans, who got
  // shame. Same machinery (gossip moves REP, never trust).
  G._showGossip = function(how, pid, showName) {
    try {
      if (!pid || pid === 'player') return;
      const v = this.state.village;
      v.gossip = v.gossip || [];
      const day = (this.state.scholar || {}).day || 1;
      const partKey = day + ':show:' + (showName || '') + ':' + how + ':' + pid;
      if (v.gossip.some(g => g.partKey === partKey)) return;
      const heard = [];
      const roster = (v.roster || []).filter(id => id !== this.villagerId && id !== pid);
      if (roster.length) heard.push(roster[Math.floor(Math.random() * roster.length)]);
      v.gossip.push({ action: 'show_' + how, dims: { who: pid }, heard,
        distortion: 0, day, partKey, noTrust: false, source: 'show' });
    } catch (e) {}
  };

  // SHOW PHASES (audit-shows 2026-10-09): the player's played beat for a
  // show pull. One phase, three choices with real costs — then a terminal
  // WIN/LOSE/MIXED that _showEnd lands as fans, shame, or both (canon:
  // "comes home with fans or with shame — sometimes both").
  G.showPhases = function(show, who) {
    const beat = (this.SHOW_BEATS || {})[show.id] || this._showGenericBeat(show);
    const choices = (beat.choices || []).map(c => ({
      label: c.label, sub: c.sub,
      do: Object.assign({ note: c.note }, c.do || {}),
      next: c.end === 'won' ? 'WIN' : (c.end === 'lost' ? 'LOSE' : 'MIXED'),
    }));
    return [{ beat: 'showDeclare', text: beat.setup, choices }];
  };

  // SHOW WATCH PHASES (audit-shows 2026-10-09): a villager was pulled — the
  // player watches with agency (contest watch-mode pattern). Cheering is
  // real support (feeds the deterministic resolution), heckling is noticed
  // by the cameras, going to them after lands. Terminal SHOW_VILLAGER.
  G.showWatchPhases = function(show, pid) {
    const pname = this.displayName(pid);
    return [{
      beat: 'showWatchDeclare',
      text: `📺 ${show.name} — ${pname} is on.\n\n${show.desc}\n\nYou watch with the village. The cameras love the watchers almost as much as the watched — what you do in the crowd is content too.`,
      choices: [
        { label: 'Cheer them on', sub: 'real support', do: { note: `You cheer until your throat hurts. ${pname} hears it — everyone hears it.`, cheer: 0.05, fanLane: { lane: 'showbiz', n: 1, why: 'cheering for ' + pname } }, next: 'SHOW_VILLAGER' },
        { label: 'Heckle', sub: 'the cameras notice', do: { note: `You heckle. The crowd laughs. ${pname} will remember this.`, notability: 'showmanship', heckle: true }, next: 'SHOW_VILLAGER' },
        { label: 'Watch quietly', sub: 'then go to them', do: { note: `You watch every second. Whatever happens, you'll be there after.`, comfort: true }, next: 'SHOW_VILLAGER' },
      ],
    }];
  };

  // SHOW TOGETHER PHASES (audit-shows 2026-10-09): no pull — the village
  // watches together. One communal beat, still a choice, still costs.
  G.showTogetherPhases = function(show) {
    return [{
      beat: 'showTogetherDeclare',
      text: `📺 ${show.name} — the village watches together.\n\n${show.desc}\n\nSomeone brought snacks. It helps. The chat is already arguing about everything.`,
      choices: [
        { label: 'Bring the good snacks', sub: '150 kcal, worth it', do: { kcal: -150, note: 'You bring out the good stuff. The village settles in around you. This is the good part of being watched.', unity: 1, fanLane: { lane: 'showbiz', n: 1, why: 'watch-party snacks' } }, next: 'WIN' },
        { label: 'Watch from the doorway', sub: 'keep your distance', do: { note: 'You watch from the doorway, half in the dark. The show is fine. The company is better.' }, next: 'LOSE' },
      ],
    }];
  };

  // SHOW RESOLVE VILLAGER (audit-shows 2026-10-09): the pulled villager's
  // fate — DETERMINISTIC, documented, no outcome table. Score = 2 base +
  // 2 per showmanship notability (the gossip lane has its own celebrities —
  // fame is the skill here) + a stable per-villager hash 0..2 (some people
  // are just good TV) + player cheer (0..6, capped like contest cheer).
  // fans >= 7, shame <= 3, else both. The village talks about it either way.
  G.showResolveVillager = function(pid, show, opts) {
    opts = opts || {};
    let hash = 0;
    const key = String(pid) + ':' + String((show && show.id) || show);
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) % 997;
    const deeds = ((this.state.notability || {})[pid]) || {};
    const cheer = Math.round((opts.cheer || 0) * 40);
    const heckle = opts.heckle ? -2 : 0;
    const score = 2 + (deeds.showmanship || 0) * 2 + (hash % 3) + cheer + heckle;
    const outcome = score >= 7 ? 'fans' : (score <= 3 ? 'shame' : 'both');
    return { outcome, score };
  };

  // SHOW VILLAGER END (audit-shows 2026-10-09): lands the watched villager's
  // show — fans, shame, or both (docs/CONTESTS.md). The galaxy's love is
  // real even for a trainwreck: shame still moves the showbiz club +1, said
  // out loud. Gossip seeds so the village talks about it for days.
  G._showVillagerEnd = function(ac) {
    const pid = ac.participant;
    const pname = this.displayName(pid);
    const showName = ac.showName || 'the show';
    let r = null;
    try { r = this.showResolveVillager(pid, { id: ac.showId }, { cheer: ac.cheer || 0, heckle: !!ac.heckle }); } catch (e) {}
    const outcome = (r && r.outcome) || 'both';
    ac.phase = 'done';
    try { this.broadcastEnd(); } catch (e) {} // BROADCAST MODE: the frame always lifts explicitly (Steve 2026-10-09)
    this.state.activeContest = null;
    this.sysSay('📺 ───');
    if (outcome === 'fans' || outcome === 'both') {
      this.sysSay(`📺 ${pname} was MADE for this. The chat is already making clips. ${pname} comes home with fans — messages, art, a following.`);
      this.addNotability(pid, 'showmanship');
      try { if (this.apAdjustFavor) this.apAdjustFavor(2, pname + ' shone on ' + showName, 'showbiz'); } catch (e) {}
      this._showGossip('fans', pid, showName);
    }
    if (outcome === 'shame' || outcome === 'both') {
      this.sysSay(`📺 It went... badly. The clip of ${pname} will outlive all of you. ${pname} comes home with shame — and, somehow, fans anyway. The galaxy loves a trainwreck.`);
      try { if (this.apAdjustFavor) this.apAdjustFavor(1, pname + "'s beautiful disaster on " + showName, 'showbiz'); } catch (e) {}
      this._showGossip('shame', pid, showName);
    }
    if (ac.comfort) this.sysSay(`📺 You go to ${pname} after. They're quiet. They'll talk about it later. Or never.`);
    else this.sysSay(`📺 The village will talk about this for days.`);
    try { this.leadShift('showmanship', 1); } catch (e) {}
    // BROADCAST MODE: the commentators call the villager's fate.
    try { this.broadcastBeat('SHOW_VILLAGER_' + String(outcome).toUpperCase(), ac); } catch (e) {}
    return { done: true, outcome: 'show_' + outcome };
  };

  // SHOW END (audit-shows 2026-10-09): lands the player's (or village's)
  // show — fans, shame, or both. Lower-stakes than contests, higher
  // embarrassment (docs/CONTESTS.md). A prize, when earned, is a wacky
  // alien curio — never dinner (canon).
  G._showEnd = function(ac, outcome, prize) {
    const beat = (this.SHOW_BEATS || {})[ac.showId] || {};
    const s = this.state.scholar;
    const who = ac.participant;
    const isPlayer = who === 'player';
    const isSummons = ac.kind === 'summons';
    const showName = ac.showName || 'the show';
    ac.phase = 'done';
    try { this.broadcastEnd(); } catch (e) {} // BROADCAST MODE: the frame always lifts explicitly (Steve 2026-10-09)
    this.state.activeContest = null;
    this.sysSay('📺 ───');
    const sayFavor = (n, why) => { try { if (this.apAdjustFavor) this.apAdjustFavor(n, why, 'showbiz'); } catch (e) {} };
    if (outcome === 'won') {
      this.sysSay('📺 ' + (isSummons ? `Stunt delivered. The numbers tick up in real time — you can SEE the galaxy lean in. The System is already cutting the promo.`
        : (beat.win || `You were good. Genuinely good. The chat is making clips.`)));
      if (isPlayer || isSummons) {
        this.addNotability('player', 'showmanship');
        sayFavor(isSummons ? 3 : 2, (isSummons ? 'ratings stunt' : 'show: ' + showName));
        try { this.leadShift('showmanship', 1); } catch (e) {}
      } else {
        try { this.leadShift('unity', 1); } catch (e) {}
      }
      // The stunt shakes a care package loose (canon: summons tie to care
      // packages). Rate-limited inside apCarePackage — may whiff honestly.
      if (isSummons) { try { if (this.apCarePackage) this.apCarePackage(); } catch (e) {} }
    } else if (outcome === 'lost') {
      this.sysSay('📺 ' + (isSummons ? `You phoned it in and seventeen systems could tell. The numbers don't move. The System makes a note.`
        : (beat.lose || `It went badly. The clip will outlive you. But the galaxy loves a trainwreck — the shame comes with fans attached.`)));
      if (isPlayer || isSummons) {
        this.addNotability('player', 'showmanship');
        sayFavor(1, 'beautiful disaster: ' + showName);
      }
    } else if (outcome === 'mixed') {
      this.sysSay('📺 ' + (beat.mixed || `Both. Fans AND shame, in the same broadcast. The chat can't decide whether to crown you or roast you, so it does both.`));
      if (isPlayer) {
        this.addNotability('player', 'showmanship');
        sayFavor(2, 'show: ' + showName);
        try { this.leadShift('showmanship', 1); } catch (e) {}
      }
    } else { // refused
      this.sysSay(`📺 You say no — on camera, clearly, where everyone can see it. The refusal IS the content. The System files your defiance under: interesting.`);
      if (isPlayer || isSummons) {
        this.addNotability('player', 'showmanship');
        sayFavor(isSummons ? -2 : -1, 'refused ' + (isSummons ? 'the ratings summons' : showName));
      }
    }
    // BROADCAST MODE: the commentators call the outcome — tied to the
    // actual result, never a generic line.
    try { this.broadcastBeat('SHOW_' + String(outcome).toUpperCase(), ac); } catch (e) {}
    // Prize: a wacky alien curio, real and usable (apGrantItem), never
    // dinner. If the vault is shy, say so — never a silent pocket.
    if (prize && (isPlayer || isSummons)) {
      try {
        const items = this.data.items || [];
        const cands = items.filter(it => it.origin === 'alien' && (it.tier || 1) <= 1);
        const gift = cands.length ? cands[Math.floor(Math.random() * cands.length)] : null;
        if (gift && this.apGrantItem) {
          this.apGrantItem(gift.id);
          this.sysSay(`📺 The System presses something humming into your hands: ${gift.name || gift.id}. It's wacky. It's yours.`);
        } else {
          this.sysSay('📺 Prize: the System\'s favor (and a story). The vault was feeling shy tonight.');
        }
      } catch (e) { this.sysSay('📺 Prize: the System\'s favor (and a story).'); }
    }
    return { done: true, outcome: 'show_' + outcome };
  };

  // === RATINGS SUMMONS ===
  // (audit-shows 2026-10-09): when the numbers go soft, the System doesn't
  // just schedule harder — it SUMMONS you for a promo stunt. Canon basis:
  // the OVERSIGHT design (Steve 2026-10-04: "Ratings summons (promos/stunts,
  // small gifts, ties to care packages)") — no doc covers it, so this is
  // noted, not invented silently. Played, not announced: do the stunt (real
  // cost, real gift, showbiz favor, shakes a care package loose), phone it
  // in, or refuse on camera (a sequence, with consequences).
  G.fireRatingsSummons = function() {
    this.sysSay(`📺 RATINGS SUMMONS — the numbers are soft and the System is nervous.`);
    this.sysSay(`📺 "WE NEED A MOMENT. YOU WILL PROVIDE THE MOMENT." The cameras are already rolling.`);
    try { this.audioEvent('contestTaken'); } catch (e) {}
    const phases = this.ratingsSummonsPhases();
    this.state.activeContest = {
      kind: 'summons',
      showId: '__summons',
      showName: 'Ratings Summons',
      participant: 'player',
      phase: 'intro',
      phaseIdx: 0,
      phases: phases,
      variant: null,
      wounds: 0,
    };
    this.sysSay('📺 ───');
    // BROADCAST MODE (Steve 2026-10-09): the summons airs too.
    try { this.broadcastStart('summons', { showId: '__summons', showName: 'Ratings Summons', participant: 'player' }); } catch (e) {}
    const rendered = this._contestRenderPhase(this.state.activeContest, phases[0], 0);
    this._cxStorePhase(this.state.activeContest, 0, rendered);
    this._cxPhaseSay(rendered.text);
    return this.state.activeContest;
  };

  G.ratingsSummonsPhases = function() {
    return [{
      text: `📺 The brief: a promo stunt, live, sixty seconds, for the ratings. The System suggests interpretive dance about the food supply. The chat suggests worse.\n\nYour body is the budget. Your dignity is the marketing spend.`,
      choices: [
        { label: 'Do the stunt', sub: '200 kcal, full commitment', do: { kcal: -200, trauma: 4, note: 'You commit completely — dance, pratfall, a speech about turnips that somehow lands. The numbers tick UP while you\'re still moving. The System is delighted in seventeen languages.', prize: true }, next: 'WIN' },
        { label: 'Phone it in', sub: 'minimum viable effort', do: { trauma: 2, note: 'You do the smallest possible version. A wave. A nod. The chat clocks it instantly — "HE\'S PHONING IT IN" trends in four systems.' }, next: 'LOSE' },
        { label: 'Refuse on camera', sub: 'the no is the content', do: { note: 'You look straight into the lens and say no. The silence that follows is the most-watched nine seconds of the week.' }, next: 'REFUSE' },
      ],
    }];
  };

  // SHOW BEATS (audit-shows 2026-10-09): every show in the pool gets a
  // played beat — setup + three choices with real costs, landing as fans,
  // shame, or both. Lower-stakes than contests, higher embarrassment
  // (docs/CONTESTS.md). do.fanLane moves the showbiz fan club; costs are
  // kcal/trauma/notability, all said out loud.
  G.SHOW_BEATS = {
    why_eat: {
      setup: `📺 WHY DO THEY EAT? — the studio kitchen.\n\nSeventeen systems are watching a human boil water like it's a sacrament. The judges have never eaten. They are about to learn. The ingredients are real. The horror will be too.`,
      choices: [
        { label: 'Cook the comfort dish', sub: 'the one your grandmother made', end: 'won', note: 'You cook it the slow way, the right way. Halfway through, one of the judges makes a sound like a kettle learning to cry. The audience is on its feet.', do: { kcal: -150, fanLane: { n: 3, why: 'comfort cooking on WHY DO THEY EAT?' } } },
        { label: 'Cook the weird one', sub: 'fermented, alarming', end: 'mixed', note: 'You serve the fermented thing. The judges recoil — then lean back in, fascinated. Horror and delight, same bite. The chat can\'t look away.', do: { trauma: 3, fanLane: { n: 2, why: 'horror cooking on WHY DO THEY EAT?' } } },
        { label: 'Lecture about chewing', sub: 'explain instead of cook', end: 'lost', note: 'You explain mastication for nine minutes. The judges take notes. The audience learns nothing and the chat roasts you in four languages.', do: { trauma: 2, fanLane: { n: 1, why: 'the chewing lecture' } } },
      ],
      win: `The judges don't understand food. But they understand YOU now, a little. Fan art of your grandmother's dish is already circulating.`,
      lose: `The lecture airs. It is, technically, television. Your village will quote it back at you forever.`,
      mixed: `The weird dish trends overnight. Half the galaxy is horrified. The other half wants the recipe. You get both kinds of famous.`,
    },
    break_room: {
      setup: `📺 Break Room — the green room couch.\n\nThe host knows about the thing. The thing you did. The cameras are already rolling, and the audience can smell a confession coming.`,
      choices: [
        { label: 'Own it', sub: 'confession, televised', end: 'mixed', note: 'You say it plainly, on the couch, to everyone. The host goes quiet — they wanted squirming, not honesty. The audience doesn\'t know whether to applaud.', do: { trauma: 4, fanLane: { n: 2, why: 'the couch confession' } } },
        { label: 'Deflect with gossip', sub: 'someone else\'s drama', end: 'won', note: 'You pivot so smoothly the host doesn\'t notice until it\'s too late. Someone ELSE\'s drama fills the segment. The village will have opinions about whose.', do: { fracture: 1, fanLane: { n: 2, why: 'the great deflection' } } },
        { label: 'Walk out', sub: 'leave the couch', end: 'lost', note: 'You stand up mid-question and walk. The cameras follow you all the way to the door. The host calls it "powerful." You call it Tuesday.', do: { trauma: 3, fanLane: { n: -1, why: 'walked out of Break Room' } } },
      ],
      win: `The deflection is studied in media classes on three worlds. Your drama stays yours. Someone else's doesn't.`,
      lose: `The walkout clip plays on loop. Powerful, they say. You say nothing, which only makes it worse.`,
      mixed: `The confession lands wrong and right at once. Strangers write to say it helped. Villagers give you looks. Both, forever.`,
    },
    mouth_race: {
      setup: `📺 Mouth Race — sixty seconds, a mystery basket, one rival.\n\nThe other cook is already plating. The judges have very long utensils and no patience. Speed matters. So does not poisoning the judges.`,
      choices: [
        { label: 'Speed, no fear', sub: 'burners up, fingers down', end: 'won', note: 'You move like a kitchen fire. Something sizzles, something singes — including you, slightly — and the plate lands with two seconds left. The judges blink.', do: { kcal: -100, dmg: [0, 4], fanLane: { n: 3, why: 'won the Mouth Race' } } },
        { label: 'Slow and perfect', sub: 'lose the race, win the dish', end: 'mixed', note: 'You ignore the clock and cook the thing properly. The buzzer finds you mid-garnish. The judges taste anyway — and go very quiet.', do: { fanLane: { n: 2, why: 'the perfect late plate' } } },
        { label: 'Sabotage (lightly)', sub: 'a pinch of chaos', end: 'lost', note: 'You "accidentally" salt their station. The cameras catch the exact moment. The judges catch it too. The audience gasps, then boos, then laughs — at you.', do: { trauma: 5, fanLane: { n: -2, why: 'caught salting the rival' } } },
      ],
      win: `Your plate wins on speed AND merit. The rival shakes your hand through gritted teeth. The galaxy replays the final garnish.`,
      lose: `The sabotage airs in slow motion. You are the villain of the week. Villains get fan mail too — the wrong kind.`,
      mixed: `You lost the race and won the tasting. The judges argue about it for the rest of the episode. So does the chat.`,
    },
    ask_human: {
      setup: `📺 Ask a Human — the hotline is open.\n\nSeventeen systems. The first caller asks about your childhood. The second asks about your taxes. The third asks what grief tastes like. There is no screening process.`,
      choices: [
        { label: 'Answer honestly', sub: 'all of it, true', end: 'mixed', note: 'You answer the grief one truthfully. The line goes quiet across seventeen systems. Then the messages start — thousands of strangers saying "me too."', do: { trauma: 5, fanLane: { n: 3, why: 'the honest hour on Ask a Human' } } },
        { label: 'Answer with jokes', sub: 'deflect with charm', end: 'won', note: 'You turn every question into a bit. The taxes question becomes a five-minute routine. The galaxy laughs so hard the hotline crashes twice.', do: { fanLane: { n: 2, why: 'the comedy hour' } } },
        { label: 'Hang up', sub: 'end the call', end: 'lost', note: 'You hang up on a caller mid-sentence. The dial tone is the loudest sound on television that night. The System replays it.', do: { trauma: 3, fanLane: { n: -1, why: 'hung up on the galaxy' } } },
      ],
      win: `You are, briefly, the funniest human alive. The village quotes your taxes bit for weeks.`,
      lose: `The hang-up is the clip. Nine seconds of dial tone, forever. Strangers send you phones.`,
      mixed: `The honest answer breaks the show open. Fans AND the kind of attention that follows you to the well. Both.`,
    },
    death_reel: {
      setup: `📺 The Death Reel — tonight: YOUR greatest hits.\n\nThe falls. The screams. The time you ran from a squirrel. The village is watching WITH you, on the same couch, and nobody is looking away.`,
      choices: [
        { label: 'Narrate it yourself', sub: "director's commentary", end: 'mixed', note: '"Here\'s where I realize the squirrel is winning." Your commentary is so good the reel becomes a different show — funnier, sadder, yours.', do: { trauma: 3, fanLane: { n: 3, why: 'narrated their own Death Reel' } } },
        { label: 'Laugh along', sub: 'with the village', end: 'won', note: 'You laugh first and loudest, and the village laughs WITH you instead of at you. The reel can\'t hurt someone who\'s already in on the joke.', do: { unity: 1, fanLane: { n: 2, why: 'laughed with the reel' } } },
        { label: 'Leave the room', sub: 'don\'t watch', end: 'lost', note: 'You leave. The cameras follow. The reel plays to your empty chair, and the galaxy watches you not watching. It\'s the saddest thing on TV tonight.', do: { trauma: 5, fanLane: { n: 1, why: 'the empty chair' } } },
      ],
      win: `The village adopts your commentary as canon. "The squirrel is winning" becomes a saying. You are in on every joke now.`,
      lose: `The empty-chair episode wins awards. You do not attend the ceremony.`,
      mixed: `Your narration makes the reel art. It also makes it permanent. Strangers quote your worst moments back at you, lovingly.`,
    },
    moot: {
      setup: `📺 The Moot — the village holds a trial, on camera.\n\nThe charge is read aloud. It might even be yours. The jury is seventeen systems of beings who have never been accused of anything. Your village fills the gallery. Everyone is performing, a little.`,
      choices: [
        { label: 'Argue the case', sub: 'rhetoric, televised', end: 'won', note: 'You argue like the galaxy is the jury — because it is. The points land. The prosecutor-drone objects to your charisma. Overruled, by applause.', do: { fanLane: { n: 3, why: 'won the televised trial' }, notability: 'showmanship' } },
        { label: 'Confess everything', sub: 'disarm the court', end: 'mixed', note: 'You confess — all of it, plainly, on the record. The court does not know what to do with honesty. The audience does: it leans in.', do: { trauma: 4, fanLane: { n: 2, why: 'the televised confession' } } },
        { label: 'Accuse the accuser', sub: 'turn it around', end: 'lost', note: 'You point at the prosecutor-drone. "Who watches the watchers?" The court finds this contemptuous. The galaxy finds it delicious. The verdict does not go your way.', do: { trauma: 3, fracture: 1, fanLane: { n: 1, why: 'contempt of the televised court' } } },
      ],
      win: `Acquitted, applauded, archived. Law students on three worlds study your closing. The village quotes it back at you, badly, forever.`,
      lose: `Guilty, televised. The sentence is community service and the clip. Mostly the clip.`,
      mixed: `The confession breaks the format. The trial becomes a conversation. Nobody is acquitted, nobody is condemned, and the galaxy cannot stop talking about it.`,
    },
    nap_wars: {
      setup: `📺 Nap Wars — the arena is a couch.\n\nThe event: sleep, on camera, while the galaxy watches. Scoring on speed of onset, depth, and artistic snoring. Someone always snores.`,
      choices: [
        { label: 'Commit to the nap', sub: 'sleep like the dead', end: 'won', note: 'You are out in ninety seconds. Deep, total, magnificent sleep. The judges weep. The sleep scientists in the audience take notes.', do: { heal: 5, fanLane: { n: 2, why: 'the ninety-second nap' } } },
        { label: 'Fake it', sub: 'act asleep', end: 'lost', note: 'You fake it. The snore gives you away — it\'s rhythmic, performative, wrong. The judges confer. The verdict: "theater."', do: { trauma: 2, fanLane: { n: 1, why: 'the fake nap' } } },
        { label: 'Snore operatically', sub: 'weaponized', end: 'won', note: 'You snore in movements. Allegro, adagio, a finale that rattles the set. The judges have never seen anything like it. Neither has anyone.', do: { fanLane: { n: 3, why: 'the snore symphony' }, notability: 'showmanship' } },
      ],
      win: `You are the nap champion. The village treats you with new respect. Sleep has never been so televised.`,
      lose: `"Theater," the judges rule. The clip of your fake snore is used in acting classes as a warning.`,
    },
    tiny_door: {
      setup: `📺 The Tiny Door — a door, knee-high, in the middle of the village.\n\nIt appeared at noon. It is very small. Someone has to go through. The audience has opinions about who, and the chat has a poll.`,
      choices: [
        { label: 'Go through', sub: 'headfirst, obviously', end: 'won', note: 'You fold yourself through. Inside: a pantry of alien snacks, a tiny chair, and a note that says "WE KNEW IT WOULD BE YOU."', do: { prize: true, fanLane: { n: 2, why: 'went through the Tiny Door' } } },
        { label: 'Send the drone', sub: 'let the System look', end: 'lost', note: 'You send a drone. It comes back with footage of snacks and a tiny chair. The chat\'s verdict is unanimous: coward.', do: { trauma: 2, fanLane: { n: -1, why: 'droned the Tiny Door' } } },
        { label: 'Widen the door', sub: 'make it human-sized', end: 'mixed', note: 'You spend the afternoon with a saw. The door is now a door. The mystery is gone but the snacks are accessible. The audience mourns the mystery.', do: { kcal: -100, fanLane: { n: 1, why: 'de-mysteried the door' } } },
      ],
      win: `The tiny chair is yours now. The note goes in the journal. The galaxy approves of your knees.`,
      lose: `The drone footage airs without you in it. You are a footnote in your own episode.`,
      mixed: `Practical. Boring. Correct. The snacks are real, which is more than mystery ever gave anyone.`,
    },
    grudge_pudding: {
      setup: `📺 Grudge Pudding — you and your favorite rival have a grudge.\n\nThe System knows. Everyone knows. You must cook a pudding together, on camera. The pudding is a metaphor. The grudge is not.`,
      choices: [
        { label: 'Cook it out', sub: 'stir until it\'s over', end: 'won', note: 'Somewhere between the custard and the crust, the grudge runs out of fuel. The pudding is perfect. You split it on camera and the village exhales.', do: { unity: 1, fanLane: { n: 2, why: 'the pudding truce' } } },
        { label: 'Cook to win', sub: 'perfect pudding, intact grudge', end: 'mixed', note: 'Your half is flawless. Their half is flawless. You do not speak except about temperatures. The pudding wins awards. The grudge continues, televised.', do: { fanLane: { n: 2, why: 'the cold war pudding' }, fracture: 1 } },
        { label: 'Salt their half', sub: 'petty, televised', end: 'lost', note: 'You salt their half on camera, clearly, deliberately. The judges taste it. The galaxy tastes your pettiness. The pudding is ruined and so, briefly, are you.', do: { trauma: 4, fanLane: { n: -1, why: 'salted the pudding' } } },
      ],
      win: `The truce holds past the credits. The pudding recipe enters the village canon.`,
      lose: `The salted pudding airs in slow motion. You apologize for weeks. The pudding does not forgive.`,
      mixed: `A perfect pudding and a perfect standoff. The audience picks sides. The village does too.`,
    },
    who_moved_it: {
      setup: `📺 Who Moved It? — your favorite thing is three inches left of where it was.\n\nThe System is treating this like a murder. Evidence tags. A timeline. A detective with seventeen eyes. The culprit is always the last person you'd suspect.`,
      choices: [
        { label: 'Solve it properly', sub: 'evidence board, interviews', end: 'won', note: 'You dust for prints. You interview the village. You find the culprit (it was the wind, plus a goat). The detective bows to you.', do: { fanLane: { n: 2, why: 'solved the three inches' } } },
        { label: 'Accuse dramatically', sub: 'point, on camera', end: 'mixed', note: 'You accuse the elder, loudly, wrongly. The real culprit confesses laughing. The galaxy loves a wrong accusation delivered with total confidence.', do: { fracture: 1, fanLane: { n: 1, why: 'the great wrong accusation' } } },
        { label: 'Move it back silently', sub: 'case closed', end: 'lost', note: 'You move it back when no one\'s looking. The episode ends in eleven minutes. The System is furious. The audience is asleep.', do: { fanLane: { n: -1, why: 'the boring solution' } } },
      ],
      win: `The detective requests you by name next time. Your evidence board is archived. The goat is unrepentant.`,
      lose: `Eleven minutes. The shortest episode in the show's history. Your name is a verb for it now.`,
      mixed: `Wrong, loud, beloved. The elder forgives you on camera. The clip trends for a week.`,
    },
    apology_tour: {
      setup: `📺 The Apology Tour — you must apologize for something you did in a dream.\n\nThe dream is shown. Everyone has seen it. The dream-you did the thing with total confidence. The real you must now answer for it.`,
      choices: [
        { label: 'Apologize sincerely', sub: 'for a dream', end: 'mixed', note: '"I\'m sorry my subconscious did that." You mean it, which is the absurd part. The audience doesn\'t know whether to laugh or cry, so it does both.', do: { trauma: 4, unity: 1, fanLane: { n: 2, why: 'the dream apology' } } },
        { label: 'Apologize to the dream', sub: 'address dream-you', end: 'won', note: 'You turn to the screen and address your dream-self directly: "We need to talk." The galaxy has never seen anything like it. Dream-you looks ashamed.', do: { fanLane: { n: 3, why: 'confronted their dream-self' } } },
        { label: 'Refuse — it was a dream', sub: 'stand your ground', end: 'lost', note: 'You refuse. "It was a DREAM." The System replays the dream. The village watches you watch yourself. Your ground is not as firm as you thought.', do: { trauma: 5, fanLane: { n: -1, why: 'refused the dream apology' } } },
      ],
      win: `Dream-you apologizes back, in the edit. The segment wins awards. Therapists across the galaxy assign it.`,
      lose: `The replay airs uncut. You will never live it down. Dreams are forever now.`,
      mixed: `A sincere apology for an unreal crime. It shouldn't work. It does. Strangers write to you about their dreams.`,
    },
    dance_off: {
      setup: `📺 Dance-Off at Dusk — the System demands dancing.\n\nNo music is provided. The village provides its own — drums, spoons, someone's excellent whistling. It goes better than anyone expects.`,
      choices: [
        { label: 'Dance like it\'s a ritual', sub: 'full body, full heart', end: 'won', note: 'You dance like the harvest depends on it. Sweat, dust, the spoons keeping time. The judges don\'t understand it and can\'t look away.', do: { kcal: -150, fanLane: { n: 3, why: 'the dusk dance' } } },
        { label: 'Lead the village', sub: 'everyone, now', end: 'won', note: 'You pull the whole village in. A line dance, ragged and joyful, under the cameras. The galaxy has never seen anything less rehearsed or more real.', do: { unity: 1, fanLane: { n: 2, why: 'the village line dance' } } },
        { label: 'Stand still, arms crossed', sub: 'refuse the rhythm', end: 'lost', note: 'You stand perfectly still while the village dances around you. It is, technically, a choice. The cameras hold on your face for a full minute.', do: { trauma: 3, fanLane: { n: 1, why: 'the stillness' } } },
      ],
      win: `The dance becomes a village tradition. Dusk, spoons, dust. The galaxy tunes in for it now.`,
      lose: `The stillness is the clip. A minute of your face, unmoving, while joy happens around you. It haunts.`,
    },
    mystery_smell: {
      setup: `📺 The Mystery Smell — something smells incredible somewhere in the village.\n\nFind it before the cameras do. The chat already knows what it is. They are not telling. They are enjoying this.`,
      choices: [
        { label: 'Follow your nose', sub: 'trust the senses', end: 'won', note: 'You track it like a hound — around the hall, behind the stores — to a crate of alien catering, still warm, left by "mistake." Dinner is served.', do: { kcal: 200, prize: true, fanLane: { n: 2, why: 'found the mystery smell' } } },
        { label: 'Ask the chat', sub: 'they know', end: 'lost', note: 'You ask the chat. The chat lies, beautifully, in twelve directions at once. You dig up a compost heap on live TV. The smell was never there.', do: { trauma: 3, fanLane: { n: 1, why: 'the compost incident' } } },
        { label: 'Cook something better', sub: 'out-smell the mystery', end: 'mixed', note: 'You fire up your own pot and out-cook the mystery. The village eats YOUR food while the cameras hunt the smell. Both smells trend.', do: { kcal: -200, fanLane: { n: 2, why: 'the smell-off' } } },
      ],
      win: `The catering crate feeds the village. "Mistake," the System says. Nobody believes it. Everybody eats.`,
      lose: `The compost incident. The chat's directions were perfect and perfectly wrong. You can still smell it.`,
      mixed: `Two incredible smells, one village. The smell-off is declared a draw. Everyone eats twice.`,
    },
    complaint_box: {
      setup: `📺 The Complaint Box — your complaint is being read aloud.\n\nBy a seven-foot alien. Who is visibly hurt. "IT SAYS HERE," the alien reads, voice wobbling, "'THE SHOW IS TOO LOUD.'"`,
      choices: [
        { label: 'Stand by it', sub: 'yes, too loud', end: 'won', note: '"Yes. Too loud." The alien wilts. The audience — which has also thought it — erupts. Complaints triple by morning.', do: { fanLane: { n: 2, why: 'stood by the complaint' }, notability: 'showmanship' } },
        { label: 'Soften it live', sub: 'diplomacy, on camera', end: 'mixed', note: '"What I meant was, the loudness has... character." The alien perks up. The audience boos the softening and loves you for the kindness, both at once.', do: { unity: 1, fanLane: { n: 1, why: 'the softened complaint' } } },
        { label: 'File another one', sub: 'right now, on air', end: 'won', note: 'You pull out a SECOND complaint and read it yourself. "The chairs." The alien sits down, wounded, in the chair in question. The galaxy howls.', do: { trauma: 3, fanLane: { n: 2, why: 'the second complaint' } } },
      ],
      win: `The complaint box overflows for a week. The show gets quieter. The chairs get better. You did that.`,
      lose: ``,
      mixed: `The alien sends you a personal note: "NOTED." with seventeen underlines. The village frames it.`,
    },
    hot_take: {
      setup: `📺 Hot Take — defend a food opinion on live television.\n\nYour position: soup is a beverage. The galaxy has thoughts. The galaxy is wrong. Prove it.`,
      choices: [
        { label: 'Argue with science', sub: 'kcal as rhetoric', end: 'won', note: 'You cite viscosity, serving temperature, vessel design. The science is sound. The galaxy is furious. The galaxy is also taking notes.', do: { fanLane: { n: 2, why: 'the soup thesis' } } },
        { label: 'Argue with passion', sub: 'weep about broth', end: 'mixed', note: 'You weep, actually weep, about a broth from your childhood. The panel doesn\'t know what to do. The audience does: it cries with you.', do: { trauma: 2, fanLane: { n: 3, why: 'the broth tears' } } },
        { label: 'Concede', sub: 'soup is food, fine', end: 'lost', note: 'You concede at the first commercial break. "Fine. Soup is food." The galaxy wins. Your village will never let you hear the end of it.', do: { trauma: 4, fanLane: { n: -1, why: 'conceded the soup' } } },
      ],
      win: `The soup thesis is taught, debated, memed. Beverage. The galaxy knows it now.`,
      lose: `The concession airs. "Fine. Soup is food." Four words that follow you forever.`,
      mixed: `The broth tears break the panel. Half the galaxy is converted. The other half is concerned about you.`,
    },
    who_farted: {
      setup: `📺 Who Farted? — a full forensic investigation, televised.\n\nEvidence boards. Suspect interviews. Airflow modeling. It was you. Everyone will know by the end of the hour. The only question is how.`,
      choices: [
        { label: 'Confess early', sub: 'efficient dignity loss', end: 'mixed', note: '"It was me." Eleven minutes in. The investigators are furious — they had forty more minutes of content. The audience respects the efficiency.', do: { trauma: 3, fanLane: { n: 2, why: 'the early confession' } } },
        { label: 'Run a real investigation', sub: 'frame the wind', end: 'won', note: 'You build the case against the wind with total commitment — diagrams, witness testimony, a reenactment. The wind is convicted. You walk free.', do: { fanLane: { n: 3, why: 'the wind did it' } } },
        { label: 'Blame the System', sub: 'it was the aliens', end: 'lost', note: '"The System did it." The System heard. The System replays the audio with enhancement. The System is very good at audio.', do: { trauma: 4, fanLane: { n: -1, why: 'blamed the System' } } },
      ],
      win: `The wind is formally charged. You are exonerated on every screen in the galaxy. Justice is served.`,
      lose: `The enhanced audio airs. There is no coming back from enhanced audio.`,
      mixed: `An early confession, gracefully done. The investigators forgive you on camera. The village does not.`,
    },
    stare_down: {
      setup: `📺 The Stare-Down — out-stare an alien champion.\n\nBlinking is defeat. The champion has four eyelids and no mercy. Seventeen systems are watching both faces.`,
      choices: [
        { label: 'Do not blink', sub: 'become the stare', end: 'won', note: 'You do not blink for six minutes. Your eyes water. The champion\'s fourth eyelid twitches — once — and that\'s enough. The galaxy erupts.', do: { trauma: 4, fanLane: { n: 3, why: 'won the Stare-Down' } } },
        { label: 'Blink strategically', sub: 'a tactical blink', end: 'lost', note: 'You blink at minute two and call it strategy. The champion does not call it strategy. Nobody calls it strategy.', do: { trauma: 2, fanLane: { n: 1, why: 'the tactical blink' } } },
        { label: 'Make them laugh first', sub: 'unhinged offense', end: 'mixed', note: 'You cross your eyes. The champion\'s composure cracks — a sound like a dropped chandelier. You lose on a technicality and win the crowd outright.', do: { fanLane: { n: 2, why: 'broke the champion' } } },
      ],
      win: `Six minutes, no blinks. The champion requests a rematch. Your eyes take a day to forgive you.`,
      lose: `The tactical blink is studied as a failure. Two minutes. The galaxy saw.`,
      mixed: `Disqualified, beloved. The crossed-eyes moment is the most-clipped second of the season.`,
    },
    crib_mine: {
      setup: `📺 Cribs: Burrow Edition — the aliens are touring your shelter.\n\nThey are horrified. Then delighted. Then they "improve" one thing. You get to watch.`,
      choices: [
        { label: 'Give the tour proudly', sub: 'this is my home', end: 'won', note: '"And THIS is where I keep the good rocks." Your pride is so total the aliens are charmed despite themselves. The episode is wholesome. Nobody expected wholesome.', do: { fanLane: { n: 2, why: 'the proud tour' } } },
        { label: 'Hide the embarrassing shelf', sub: 'too late', end: 'mixed', note: 'You try to block the shelf. The camera drone goes around you. The shelf — its contents, its organization system — airs in 4K. The chat is kind. The chat is devastating.', do: { trauma: 3, fanLane: { n: 2, why: 'the shelf' } } },
        { label: 'Let them improve it', sub: 'whatever they do', end: 'lost', note: 'They "improve" your bed into a sculpture. It is beautiful. It is unusable. You must live in it for a week. The galaxy watches you try.', do: { trauma: 2, fanLane: { n: 1, why: 'the sculpture bed' } } },
      ],
      win: `The good rocks get their own fan following. Your shelter is declared "aspirational." You laugh for a week.`,
      lose: `The sculpture bed. Seven nights. The galaxy watches you sleep on art. Your back files a complaint.`,
      mixed: `The shelf airs. It is, somehow, endearing. Strangers organize their shelves like yours now.`,
    },
    talent_pit: {
      setup: `📺 The Talent Pit — talent show, judged by beings who have never seen talent.\n\nYour slot is next. Applause is measured in decibels and confusion. The act before you juggled weather.`,
      choices: [
        { label: 'Your real talent', sub: 'the true thing', end: 'won', note: 'You do the thing you\'re actually good at. The judges have no frame for it — so they feel it instead. Confusion, then delight, then the loudest almost-applause of the night.', do: { fanLane: { n: 3, why: 'the real talent' }, notability: 'showmanship' } },
        { label: 'A talent you invented', sub: 'tonight only', end: 'mixed', note: 'You invent "competitive pebble admiration" on the spot. The judges can\'t tell it\'s new. The audience can, and loves the audacity.', do: { fanLane: { n: 2, why: 'pebble admiration' } } },
        { label: 'Stage fright, televised', sub: 'freeze', end: 'lost', note: 'You freeze. Full, total, televised freeze. The judges wait. The galaxy waits. You bow and walk off to the kindest applause ever given.', do: { trauma: 6, fanLane: { n: 1, why: 'the brave freeze' } } },
      ],
      win: `The judges demand an encore. You give one. Pebble admiration gets its own episode.`,
      lose: `The freeze is the clip — but the applause is real. Strangers write to say the freeze helped them.`,
      mixed: `A brand-new talent, born on TV. The judges add it to the official list. It was never a thing before tonight.`,
    },
    lost_found: {
      setup: `📺 Lost & Found — the System returns something you lost years ago.\n\nIt's yours. From before all this. It is not quite the same as you remember. Nobody says why.`,
      choices: [
        { label: 'Take it back', sub: 'it\'s yours', end: 'mixed', note: 'You take it. It\'s heavier than you remember, or you\'re weaker, or both. The difference — the not-quite-sameness — sits in your chest all episode.', do: { trauma: 3, prize: true, fanLane: { n: 2, why: 'reclaimed the lost thing' } } },
        { label: 'Ask what changed', sub: 'demand answers', end: 'lost', note: '"What did you DO to it?" The System changes the subject with enormous skill. The audience notices the dodge. You don\'t get answers. You get a segment.', do: { trauma: 4, fanLane: { n: 1, why: 'asked too much' } } },
        { label: 'Thank them on camera', sub: 'grace', end: 'won', note: 'You thank them, simply, and mean it. The alien presenting it looks... moved? Something in its posture changes. The galaxy sees it too.', do: { fanLane: { n: 2, why: 'the gracious thank-you' } } },
      ],
      win: `The thank-you trends. The alien sends a follow-up note. It is almost warm. Almost.`,
      lose: `No answers. The dodge airs. You lie awake wondering about the not-quite-sameness. So does everyone.`,
      mixed: `It's yours again, changed and unchanged. You carry it. The village understands without asking.`,
    },
    swear_jar: {
      setup: `📺 The Swear Jar — you're miked for a day.\n\nEvery curse costs the village a ration. Everyone is suddenly, terribly polite. The village is watching you like a hawk watches a field mouse.`,
      choices: [
        { label: 'Go full silent film', sub: 'mime, grace, effort', end: 'won', note: 'You communicate entirely in mime for a full day. It is exhausting and magnificent. The village weeps laughing. Zero curses. Zero rations lost.', do: { kcal: -100, fanLane: { n: 3, why: 'the silent day' } } },
        { label: 'Curse in the old tongue', sub: 'a loophole', end: 'mixed', note: 'You curse fluently in your grandmother\'s language. The System\'s filter doesn\'t know it. The village does. The jar stays empty and the galaxy learns new words.', do: { fanLane: { n: 2, why: 'the loophole' } } },
        { label: 'Slip once', sub: 'one ration', end: 'lost', note: 'Hour eleven. A stubbed toe. One perfect curse, broadcast to seventeen systems. A ration, gone. The village forgives you. The jar does not.', do: { kcal: -150, trauma: 3, fanLane: { n: 1, why: 'the slip' } } },
      ],
      win: `The silent day enters village legend. Mimes are attempted at dinner for weeks. All of them worse than yours.`,
      lose: `The slip airs in slow motion. The ration is mourned. Your toe is fine. Your pride is not.`,
      mixed: `The loophole holds. The System updates its filters by morning. Your grandmother would be proud.`,
    },
    makeover: {
      setup: `📺 Extreme Burrow Makeover — you wake up redecorated.\n\nThe aliens did your shelter overnight. It is beautiful. It is unusable. You must live in it for a week. The reveal is being filmed.`,
      choices: [
        { label: 'Live in it graciously', sub: 'a week of art', end: 'won', note: 'You live in the beautiful unusable shelter with total grace. You learn to sleep diagonally. The galaxy admires your commitment to the bit.', do: { fanLane: { n: 2, why: 'the gracious week' } } },
        { label: 'Fix it on camera', sub: 'un-improve it', end: 'mixed', note: 'You start moving furniture back while the cameras roll. The aliens watch, wounded, as you "ruin" their art. The audience takes your side immediately.', do: { kcal: -100, fanLane: { n: 2, why: 'the un-improvement' } } },
        { label: 'Sleep outside', sub: 'protest', end: 'lost', note: 'You sleep outside for a week in protest. It rains twice. The beautiful shelter sits empty, perfect, useless. The galaxy finds this very funny.', do: { trauma: 2, fanLane: { n: 1, why: 'the protest' } } },
      ],
      win: `Diagonal sleeping becomes a trend. The shelter is photographed for alien magazines. You are gracious in every one.`,
      lose: `A week outside. The rain. The perfect empty shelter. The galaxy's favorite comedy of the season.`,
      mixed: `The un-improvement airs. "FUNCTION," you explain, moving a chair. The chat chants it. FUNCTION.`,
    },
    karaoke: {
      setup: `📺 Alien Karaoke — you must sing.\n\nThe System provides music from seventeen systems. None of it has a beat a human can find. The village provides backup vocals anyway.`,
      choices: [
        { label: 'Sing your heart out', sub: 'no beat, no fear', end: 'won', note: 'You sing against the beat, around the beat, in open defiance of the beat. It shouldn\'t work. The village\'s backup vocals catch you and carry you home.', do: { trauma: 2, fanLane: { n: 3, why: 'the beatless ballad' } } },
        { label: 'Let the village carry you', sub: 'everyone sings', end: 'won', note: 'You start, the village joins, and soon it\'s a chorus — ragged, loud, joyful. The aliens record it. They don\'t understand it. They play it twice.', do: { unity: 1, fanLane: { n: 2, why: 'the village chorus' } } },
        { label: 'Read the lyrics as poetry', sub: 'spoken word', end: 'mixed', note: 'You read the alien lyrics as dead-serious poetry. "MOON OF SEVEN HUNGRY LIGHTS." A judge weeps. Nobody knows what the song was supposed to be.', do: { fanLane: { n: 2, why: 'the poetry reading' } } },
      ],
      win: `The ballad is requested at every gathering after. The beat remains unfound. Nobody minds.`,
      lose: ``,
      mixed: `"MOON OF SEVEN HUNGRY LIGHTS" becomes a saying. The judge's tears are the clip. Poetry wins.`,
    },
    shelter_swap: {
      setup: `📺 Shelter Swap — you're living in someone else's shelter for a week.\n\nThe aliens film the adjustment. Someone always cries about someone else's storage system. This week, the someone might be you.`,
      choices: [
        { label: 'Embrace it', sub: 'their weird, your week', end: 'won', note: 'You learn their system, sleep in their bed, cook in their pot. By day three it feels almost like yours. The cameras capture you defending their storage to the village.', do: { fanLane: { n: 2, why: 'the gracious swap' } } },
        { label: 'Cry about their storage', sub: 'the required crying', end: 'mixed', note: 'Day four. The storage system breaks you. You cry, on camera, about jars. The other villager cries about YOUR jars. The galaxy finds this deeply moving.', do: { trauma: 3, fanLane: { n: 2, why: 'the jar tears' } } },
        { label: 'Sneak back nightly', sub: 'just to check', end: 'lost', note: 'You sneak back to your own shelter every night. The night-vision cameras catch all of it. The audience names the segment "HOMESICK."', do: { fanLane: { n: -1, why: 'the sneaking' } } },
      ],
      win: `You return the shelter cleaner than you found it. The swap is declared a triumph. Jars are respected now.`,
      lose: `"HOMESICK" airs for a week. Your own bed missed you. The galaxy adopts you.`,
      mixed: `The jar tears unite the village. Everyone's storage is a little weird. Everyone cries a little.`,
    },
    small_claims: {
      setup: `📺 Small Claims — alien judges settle your village dispute.\n\nThe case: someone borrowed your thing and "forgot." The gavel is a meteorite. Justice is swift, final, and deeply confused by property law.`,
      choices: [
        { label: 'Argue the case', sub: 'your thing, your rules', end: 'won', note: 'You present the case with exhibits, a timeline, and a witness (the goat). The judges confer. The meteorite falls in your favor. The thing comes home.', do: { fanLane: { n: 2, why: 'won in Small Claims' } } },
        { label: 'Settle out of court', sub: 'split the difference', end: 'mixed', note: 'You settle in the hallway, on camera. Shared custody of the thing. The judges are disappointed — they wanted the meteorite. The village approves.', do: { unity: 1, fanLane: { n: 1, why: 'the hallway settlement' } } },
        { label: 'Contempt of court', sub: 'laugh at the gavel', end: 'lost', note: 'You laugh at the meteorite gavel. The courtroom goes silent across seventeen systems. The judges confer for a long time. The ruling is... creative.', do: { trauma: 4, fanLane: { n: 1, why: 'contempt of the meteorite' } } },
      ],
      win: `The thing comes home. The goat's testimony is entered into the record. Property law remains confused.`,
      lose: `The creative ruling involves the thing, the goat, and a week of community service. The galaxy replays your laugh.`,
      mixed: `Shared custody. The hallway handshake is the clip — two villagers, one thing, no meteorite required.`,
    },
    how_to_human: {
      setup: `📺 How to Human — the aliens attempt a human tutorial episode.\n\nYou are the demonstration model. Today's lesson: elbows. Tomorrow, allegedly: knees.`,
      choices: [
        { label: 'Demonstrate enthusiastically', sub: 'elbows, with joy', end: 'won', note: 'You demonstrate elbows like it\'s the most important joint in the body. Bending! Carrying! Leaning thoughtfully! The aliens take seventeen pages of notes.', do: { fanLane: { n: 3, why: 'the elbow masterclass' } } },
        { label: 'Improvise the curriculum', sub: 'today: knees?!', end: 'mixed', note: 'You go off-script into knees. The presenters panic — knees are TOMORROW\'s lesson. The galaxy loves a rebel academic.', do: { fanLane: { n: 2, why: 'the knees incident' } } },
        { label: 'Go limp', sub: 'uncooperative prop', end: 'lost', note: 'You go completely limp. "THE MODEL IS BROKEN," the presenter announces. You are carried off by drones. It is the funniest thing on TV that night.', do: { trauma: 2, fanLane: { n: 1, why: 'the broken model' } } },
      ],
      win: `The elbow masterclass is archived as the definitive text. Aliens practice elbows now. Badly.`,
      lose: `"THE MODEL IS BROKEN" trends. You are carried everywhere in clips. Your dignity files a complaint.`,
      mixed: `The knees incident. Tomorrow's lesson, today. The presenters recover. The galaxy does not forget.`,
    },
    rose_ceremony: {
      setup: `📺 The Rose Ceremony — one rose, one choice.\n\nGive it to the most trustworthy person you know. On camera. The village does the math before the cameras do.`,
      choices: [
        { label: 'Give it truly', sub: 'the real most-trustworthy', end: 'won', note: 'You give it to the person who deserves it, and say why, plainly. They cry. The village nods — the math checked out. The galaxy awws in seventeen languages.', do: { unity: 1, fanLane: { n: 2, why: 'the true rose' } } },
        { label: 'Give it strategically', sub: 'politics, televised', end: 'mixed', note: 'You give it to the person it HELPS to give it to. The village sees exactly what you did. The galaxy sees romance. Both are watching.', do: { fracture: 1, fanLane: { n: 1, why: 'the strategic rose' } } },
        { label: 'Eat the rose', sub: 'unhinged', end: 'won', note: 'You eat the rose. On camera. Deliberately. "Trust is earned, not given," you say, chewing. The galaxy has never loved anyone more.', do: { trauma: 2, fanLane: { n: 3, why: 'ate the rose' } } },
      ],
      win: `The true rose is pressed in the journal. The village's math was right. Some things are simple.`,
      lose: ``,
      mixed: `The strategic rose works and everyone knows it worked. Politics, televised. The village keeps score.`,
    },
    the_leak: {
      setup: `📺 The Leak — the System "accidentally" broadcasts a page from your private journal.\n\nIt's your handwriting. It's being read aloud. The village pretends it didn't hear. The village heard.`,
      choices: [
        { label: 'Claim it proudly', sub: 'yes, I wrote that', end: 'mixed', note: '"Yes. I wrote that. Every word." The village stops pretending it didn\'t hear. Someone squeezes your shoulder. The galaxy leans in.', do: { trauma: 4, fanLane: { n: 3, why: 'claimed the leaked page' }, notability: 'showmanship' } },
        { label: 'Deny everything', sub: 'not my handwriting', end: 'lost', note: '"That\'s not mine." It is obviously yours. The handwriting analysis airs. The denial is the clip. The page is the truth.', do: { trauma: 5, fanLane: { n: 1, why: 'denied the page' } } },
        { label: 'Read along', sub: 'duet with the System', end: 'won', note: 'You read along with the broadcast, in harmony with the System\'s voice. A duet. It shouldn\'t work. The galaxy is enchanted.', do: { fanLane: { n: 2, why: 'the journal duet' } } },
      ],
      win: `The duet is replayed for weeks. Your journal becomes the village's favorite literature. You lock the next one.`,
      lose: `The denial airs next to the handwriting analysis. There is no surviving this. The page survives everything.`,
      mixed: `Claimed, proudly. The shame and the fans arrive together, as they always do with the truth.`,
    },
    museum_of_you: {
      setup: `📺 Museum of You — the aliens curated your life into an exhibit.\n\nYou must narrate the audio tour. Some rooms are closed for renovation. The audience wants the closed rooms.`,
      choices: [
        { label: 'Narrate honestly', sub: 'the open rooms, true', end: 'mixed', note: 'You narrate the open rooms without flinching — the good, the wreckage, all of it. The audio tour becomes the most-borrowed recording in the galaxy.', do: { trauma: 4, fanLane: { n: 3, why: 'the honest tour' } } },
        { label: 'Skip the closed rooms', sub: 'renovation, sorry', end: 'lost', note: 'You glide past every closed door. "Renovation." The audience presses against the glass. The closed rooms become the whole story.', do: { fanLane: { n: 1, why: 'skipped the closed rooms' } } },
        { label: 'Open one closed room', sub: 'the bravest TV', end: 'won', note: 'You open ONE closed door, on camera, and narrate what\'s inside. The galaxy goes completely silent. Then the messages start. Thousands of them.', do: { trauma: 8, fanLane: { n: 4, why: 'opened the closed room' }, notability: 'showmanship' } },
      ],
      win: `The opened room changes the show. Strangers write to say it changed them. You don't regret it. Most days.`,
      lose: `The closed rooms trend without you. Speculation fills every silence you left. It is worse than the truth.`,
      mixed: `The honest tour. No closed doors opened, none needed. The wreckage, narrated kindly, becomes something like art.`,
    },
    infomercial: {
      setup: `📺 The Infomercial — sixty seconds to sell a rock.\n\nThe product is a rock. The rock is $400. The galaxy is watching. Go.`,
      choices: [
        { label: 'Sell the dream', sub: 'this rock changes lives', end: 'won', note: 'You sell the rock like it\'s destiny. "This rock has SEEN things." Orders flood in from four systems. The rock sells out. It\'s a rock.', do: { fanLane: { n: 3, why: 'sold the $400 rock' } } },
        { label: 'Sell it honestly', sub: "it's a rock", end: 'mixed', note: '"It\'s a rock. It\'s $400. I don\'t know why either." The honesty breaks the format. The galaxy respects it enormously and buys twelve.', do: { fanLane: { n: 2, why: 'the honest pitch' } } },
        { label: 'Buy it yourself', sub: 'take the rock', end: 'mixed', note: 'You buy the rock yourself, on air, for $400. "I\'ve always wanted this specific rock." It\'s your rock now. The galaxy is delighted by your commitment.', do: { prize: true, trauma: 2, fanLane: { n: 1, why: 'bought the rock' } } },
      ],
      win: `The rock sells out. A second rock is commissioned. You get a percentage. The percentage is also a rock.`,
      lose: ``,
      mixed: `Twelve rocks sold on honesty. Your rock sits on your shelf, $400 of pure commitment.`,
    },
  };

  // SHOW GENERIC BEAT (audit-shows 2026-10-09): fallback if a show id has no
  // authored beat — still played, never an announcement. The pool is data;
  // the beat is the contract.
  G._showGenericBeat = function(show) {
    return {
      setup: `📺 ${show.name} — you're on.\n\n${show.desc}\n\nThe cameras are rolling. The galaxy is watching. Be interesting.`,
      choices: [
        { label: 'Give it everything', sub: 'full commitment', end: 'won', note: 'You throw yourself into it completely. The audience can tell the difference between effort and coasting, and this is effort.', do: { kcal: -100, trauma: 2, fanLane: { n: 2, why: 'show: ' + show.name } } },
        { label: 'Play it cool', sub: 'understated', end: 'mixed', note: 'You underplay everything. Half the audience finds it magnetic. The other half finds it boring. Both are loud about it.', do: { fanLane: { n: 1, why: 'show: ' + show.name } } },
        { label: 'Freeze up', sub: 'televised nerves', end: 'lost', note: 'The cameras get to you. You freeze, thaw, freeze again. The galaxy finds it relatable, which is worse than finding it good.', do: { trauma: 4, fanLane: { n: 1, why: 'show: ' + show.name } } },
      ],
      win: `You were interesting. The chat says so, which is the only review that matters.`,
      lose: `The freeze airs. Relatable, they say. You'd rather be good.`,
      mixed: `Magnetic to half, boring to half. The argument IS the episode.`,
    };
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
    // RATINGS (Steve 2026-10-08; depth+impact Steve 2026-10-09): the System
    // wants its stars — picks are weighted by notabilityWeight (depth and
    // impact count, shared with show casting), not uniform. The 10% whim
    // below stays the documented dark-horse path: uniform random, announced
    // as the System's whim.
    const weightedPick = () => {
      let totalW = 0;
      const weights = pool.map(e => {
        const w = this.notabilityWeight(e.id);
        totalW += w;
        return w;
      });
      let r = Math.random() * totalW;
      let si = 0;
      for (; si < pool.length - 1; si++) { r -= weights[si]; if (r <= 0) break; }
      return pool.splice(si, 1)[0];
    };
    // First pick: prefer the player (the System's surest star). If the
    // player isn't castable, the lead is drawn weighted like every other
    // pick — fame matters for the lead too. (break-it contest 2026-10-09:
    // the old fallback was uniform and unannounced, so notability only
    // ever weighted the co-stars — a famous villager had no edge for a
    // solo lead.)
    let whim = false;
    if (Math.random() < 0.1) {
      whim = true;
      picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    } else {
      const pi = pool.findIndex(e => e.id === 'player');
      picks.push(pi >= 0 ? pool.splice(pi, 1)[0] : weightedPick());
    }
    while (picks.length < want && pool.length) picks.push(weightedPick());
    const ids = picks.map(p => p.id);
    if (whim) {
      const wSubj = picks[0].id === 'player' ? 'You are' : picks[0].name + ' is';
      this.sysSay(`📺 The System's whim: ${wSubj} *interesting*.`);
    } else if (picks.length > 1 && picks.slice(1).every(p => (p.notability || []).length > 0)) {
      this.sysSay(`📺 The System wants its stars tonight.`);
    }

    this.sysSay(`📺 CONTEST: ${contest.name}. ${contest.desc}`);
    if (contest.arena) {
      this.sysSay(`📺 Arena:\n${contest.arena}`);
    }
    if (contest.variant === 'hardened') {
      this.sysSay(`📺 ⚠️ HARDENED VARIANT — you've seen this before. It's worse now.`);
    }
    this.sysSay(`📺 ${this._cxTakenLine(ids)} The village holds its breath.`);
    // COUNTDOWN DREAD (Steve 2026-10-08): the announcement never said WHEN
    // the grab happens — the countdown was invisible, so there was no dread.
    // One day. Named. The village holds its breath for a reason now.
    this.sysSay(`📺 The grab comes at dawn. One more day. Sleep if you can.`);
    // AUDIO (Steve 2026-10-06): the contest window gets its own sting —
    // game-show jingle curdles. No-op when no audio system is attached.
    this.audioEvent('contestCall');
    // DRAMA (Steve 2026-10-07): contest announcement is a TV moment —
    // full-screen banner. Gated by systemArrived inside Game.drama.
    try {
      let integ = 0;
      try { integ = this.systemIntegrationLevel ? this.systemIntegrationLevel() : 0; } catch (e2) {}
      this.drama('contest', { type: 'announce', name: contest.name, integration: integ });
    } catch (e) {}

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
          // DEDUPE (Steve 2026-10-08): contestInterruption already said
          // name+desc above — the choice phase must not repeat it verbatim.
          // The choice screen gets the small contestChoice beat, never the
          // contest's own Declare beat (Steve 2026-10-08): firing Declare
          // here double-stings when the player participates, and plays the
          // bespoke sting even when they refuse.
          beat: 'contestChoice',
          text: `📺 The System waits. The cameras are already rolling.\n\nParticipate — or refuse, and let the galaxy watch you say no.`,
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
      // BROADCAST MODE (Steve 2026-10-09): watching a contest is television.
      try { this.broadcastStart('contest-watch', { showId: contest.id, showName: contest.name, participant: ids[0] }); } catch (e) {}
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
      // Recast honors the same ratings bias as casting (Steve 2026-10-08).
      let totalW = 0;
      const weights = candidates.map(e => {
        const w = 1 + ((e.notability || []).length * 2);
        totalW += w;
        return w;
      });
      let rr = Math.random() * totalW, ri = 0;
      for (; ri < candidates.length - 1; ri++) { rr -= weights[ri]; if (rr <= 0) break; }
      const recast = candidates[ri];
      this.sysSay(`📺 The System was going to take ${goneName}. ${who === 'player' ? 'You are' : goneName + ' is'} gone. The show must go on — it takes ${recast.id === 'player' ? 'YOU' : recast.name} instead.`);
      finalIds.push(recast.id);
      takenSet.add(recast.id);
    }
    if (!finalIds.length) return;

    // COUNTDOWN DREAD (Steve 2026-10-08): the grab was announced yesterday;
    // today the cameras are already here. One beat of dread before the
    // interruption lands — the village has been holding its breath all day.
    this.sysSay(`📺 It is today. You dreamed about the cameras. Everyone did. The village is very quiet.`);
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
    if (id === 'lockpick') return this._contestLockpick(contest);
    if (id === 'wrongmap') return this._contestWrongmap(contest);
    if (id === 'alibi') return this._contestAlibi(contest);
    if (id === 'echo') return this._contestEcho(contest);
    if (id === 'tidepool') return this._contestTidepool(contest);
    if (id === 'windfall') return this._contestWindfall(contest);
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
  // BESPOKE SET (Steve 2026-10-08): six beats carry their own synths now
  // (altarCurdle/hungerGnaw/predatorListen/teethTick/mindMoth/engineVoices),
  // defined + registered in app.js's audio section by the contest-synths
  // worker; the beat defs below reference them by name like any hook.
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
    // The Iron Pantry: the lock — the call under the click of the tumbler.
    contestLock: ['contestCall', 'levelup'],
    // The Wrong Map: the lie on paper — a call over a wrongness.
    contestMap: ['contestCall', 'contestSpared'],
    // The Alibi Chain: breaking it — the verdict under relief's shadow.
    contestAlibi: ['justiceVerdict', 'contestSpared'],
    // The Echo: two tellings — a scream of wrongness under relief's shadow.
    contestEcho: ['horrorSting', 'contestSpared'],
    // The Tide Clock: the water — the grab-klaxon under pounding feet.
    contestTide: ['contestTaken', 'rushHit'],
    // Windfall: the rot race — the call under an unlock.
    contestWind: ['contestCall', 'levelup'],
    // The Price: the village decides — the moot's verdict over receding footsteps.
    contestPrice: ['justiceVerdict', 'exileWalk'],
    // Impress Us: something new is felt — an unlock over relief's shadow.
    contestImpress: ['levelup', 'contestSpared'],
    // The Exchange: the relay — the game-show call under pounding feet.
    contestExchange: ['contestCall', 'rushHit'],
    // The Auction: the cruelest show — the call curdles into dread.
    contestAuction: ['contestCall', 'horrorSting'],
    // pit: gladiator pit — fanfare curdles; quiet circling then the wrong-deep bellow; the rush lands wrong; the kill thud under victory
    contestPitDeclare: ['hecklerHeadliner', 'contestCall'],
    contestPitEscalate: ['woundCunning', 'deerAggro'],
    contestPitClimax: ['chargeImpact', 'horrorSting'],
    contestPitResolve: ['victory', 'monsterDown'],
    // gauntlet: three waves: the countdown; the pounding accelerates; the closer locks on; smash under victory
    contestGauntletDeclare: ['droneCount', 'contestCall'],
    contestGauntletEscalate: ['woundEnraged', 'swarmEscalate'],
    contestGauntletClimax: ['lockonTick', 'chargeImpact'],
    contestGauntletResolve: ['victory', 'crash'],
    // duel: a human duel: quarter-tone fanfare; the ref-drone ticks; the flinch; the line cuts out (the accident)
    contestDuelDeclare: ['trialFanfare', 'contestCall'],
    contestDuelEscalate: ['lockonTick', 'hecklerTaunt'],
    contestDuelClimax: ['chargeImpact', 'monsterHurt'],
    contestDuelResolve: ['victory', 'lineCut'],
    // drop: snow beacon: storm warning under the count; winded in the hush; the final sprint breaks; receding footsteps
    contestDropDeclare: ['stormFront', 'droneCount'],
    contestDropEscalate: ['animalPant', 'nightcourtSilence'],
    contestDropClimax: ['rushHit', 'crash'],
    contestDropResolve: ['victory', 'exileWalk'],
    // starve: the white room: muzak; hunger takes hold (hungerGnaw — the gut-growl); encouragement detonates; relief with its shadow
    contestStarveDeclare: ['contestCall', 'holdMusic'],
    contestStarveEscalate: ['hungerGnaw', 'lineCut'],
    contestStarveClimax: ['hypeDetonate', 'shout'],
    contestStarveResolve: ['victory', 'contestSpared'],
    // moot: televised trial: fanfare over the charges; drums compress; verdict with wrongness; the cameras move on
    contestMootDeclare: ['trialFanfare', 'paperRustle'],
    contestMootEscalate: ['confront', 'justiceVerdict'],
    contestMootClimax: ['justiceVerdict', 'horrorSting'],
    contestMootResolve: ['lineCut', 'exileWalk'],
    // lies: the scanner: bureaucratic beep; the room goes quiet; the scream bitcrushed; verdict, line cut
    contestLiesDeclare: ['droneCorrect', 'contestCall'],
    contestLiesEscalate: ['liarConfront', 'lineCut'],
    contestLiesClimax: ['staticScream', 'modViolation'],
    contestLiesResolve: ['justiceVerdict', 'lineCut'],
    // cookfight: caged ingredients: the System studies cooking; the snap and the scold; the judge tastes wrong; the butcher's beat
    contestCookfightDeclare: ['systemCooking', 'contestCall'],
    contestCookfightEscalate: ['catfishSnap', 'animalChatter'],
    contestCookfightClimax: ['eurekaTick', 'horrorSting'],
    contestCookfightResolve: ['victory', 'animalButcher'],
    // fetch: most interesting: the meadow whistle; rummaging and clever chitter; the find brightens; the trader arrives
    contestFetchDeclare: ['animalWhistle', 'contestCall'],
    contestFetchEscalate: ['animalRustle', 'lockpickChitter'],
    contestFetchClimax: ['eurekaTick', 'hypeInflate'],
    contestFetchResolve: ['victory', 'traderArrive'],
    // hide: wave-2 predator: the count over deliberate hush (predatorListen — it is already listening); absence of sound, then ticks; the snap, the scream; the night takes it back
    contestHideDeclare: ['droneCount', 'predatorListen'],
    contestHideEscalate: ['nightcourtSilence', 'woundCunning'],
    contestHideClimax: ['ambushSnap', 'staticScream'],
    contestHideResolve: ['victory', 'nightcourtClimb'],
    // box: nested boxes: clever chitter; the idea brightens over paper; the box opens, the crowd detonates; unlock, line cut
    contestBoxDeclare: ['lockpickChitter', 'contestCall'],
    contestBoxEscalate: ['eurekaTick', 'paperRustle'],
    contestBoxClimax: ['eurekaDetonate', 'victory'],
    contestBoxResolve: ['lineCut', 'passiveUnlock'],
    // pattern: the sequence: cooking over muzak; the gut disagrees; the chord resolves — or breaks; victory, spent
    contestPatternDeclare: ['systemCooking', 'holdMusic'],
    contestPatternEscalate: ['statusApplied', 'lineCut'],
    contestPatternClimax: ['eurekaTick', 'crash'],
    contestPatternResolve: ['victory', 'animalPant'],
    // whoate: whodunnit: paper over the call; the liar confronted; named on camera; victory over the filed case
    contestWhoateDeclare: ['paperRustle', 'contestCall'],
    contestWhoateEscalate: ['liarConfront', 'lineCut'],
    contestWhoateClimax: ['justiceVerdict', 'horrorSting'],
    contestWhoateResolve: ['victory', 'paperRustle'],
    // informant: exits watched: CONTENT UNDER REVIEW; quiet, clever, counting; the trap snaps; out the exits
    contestInformantDeclare: ['modNotice', 'contestCall'],
    contestInformantEscalate: ['woundCunning', 'droneCount'],
    contestInformantClimax: ['ambushSnap', 'horrorSting'],
    contestInformantResolve: ['victory', 'exileWalk'],
    // calorie_run: the hour: the count over the meadow; pushing through; the weigh-in detonates; victory, winded
    contestCalorieRunDeclare: ['droneCount', 'animalWhistle'],
    contestCalorieRunEscalate: ['animalRustle', 'rushHit'],
    contestCalorieRunClimax: ['eurekaTick', 'hypeDetonate'],
    contestCalorieRunResolve: ['victory', 'animalPant'],
    // pantry_raid: the locals object — shouting and scolding; the locals' shouts behind your dopplering scamper; the objection lands; out with the sack
    contestPantryRaidDeclare: ['shout', 'animalChatter'],
    contestPantryRaidEscalate: ['shout', 'animalBolt'],
    contestPantryRaidClimax: ['ambushSnap', 'crash'],
    contestPantryRaidResolve: ['victory', 'exileWalk'],
    // wheel: Wheel of Teeth: the spin brightens; the ticks brighten (teethTick — wet resonance, the last tick too long), the counting gets heavier; the stop smashes; the teeth smile — or don't
    contestWheelDeclare: ['contestCall', 'eurekaCharge'],
    contestWheelEscalate: ['teethTick', 'round'],
    contestWheelClimax: ['eurekaDetonate', 'crash'],
    contestWheelResolve: ['victory', 'hypeDeflate'],
    // lottery: the tokens: swell and count; muzak under the hover; the token turns over; victory deflates
    contestLotteryDeclare: ['hypeInflate', 'droneCount'],
    contestLotteryEscalate: ['holdMusic', 'lineCut'],
    contestLotteryClimax: ['ambushSnap', 'eurekaDetonate'],
    contestLotteryResolve: ['victory', 'hypeDeflate'],
    // tithe: the altar: something wrong takes hold in muzak (altarCurdle — the notes sag, the pedal was never in the key); erratic stabs under the heartbeat; the fourth measure; the basin lingers
    contestTitheDeclare: ['statusApplied', 'altarCurdle'],
    contestTitheEscalate: ['woundDesperate', 'heartbeat'],
    contestTitheClimax: ['horrorSting', 'lineCut'],
    contestTitheResolve: ['victory', 'horrorSting'],
    // siege: hold the line: the whistle; the village roars through the bullhorn; the splintering scream; stomp and wail
    contestSiegeDeclare: ['unionRepWhistle', 'contestCall'],
    contestSiegeEscalate: ['shout', 'unionBullhorn'],
    contestSiegeClimax: ['crash', 'woundEnraged'],
    contestSiegeResolve: ['victory', 'unionWalkout'],
    // maw: the tunnel: the quiet; the pauses add up in ticks; the light — or the snap; the dark takes it back
    contestMawDeclare: ['nightcourtSilence', 'contestCall'],
    contestMawEscalate: ['nightcourtSilence', 'woundCunning'],
    contestMawClimax: ['catfishSnap', 'staticScream'],
    contestMawResolve: ['victory', 'nightcourtClimb'],
    // oath: the binding: called to answer; the System reaching, bitcrushed; WE WILL KNOW; bound and counted
    contestOathDeclare: ['confront', 'contestCall'],
    contestOathEscalate: ['lineCut', 'modViolation'],
    contestOathClimax: ['modNotice', 'horrorSting'],
    contestOathResolve: ['victory', 'round'],
    // beastmaster: the collar: snort under fanfare; panting under the targeting ticks; the turn; the footage is filed
    contestBeastmasterDeclare: ['animalSnort', 'hecklerHeadliner'],
    contestBeastmasterEscalate: ['animalPant', 'lockonTick'],
    contestBeastmasterClimax: ['ambushSnap', 'woundEnraged'],
    contestBeastmasterResolve: ['victory', 'paperRustle'],
    // riddle: the Engine: the mouths almost sound like someone you know (engineVoices — lullaby cadence, one extra beat); the static breaks
    contestRiddleDeclare: ['engineVoices', 'contestCall'],
    contestRiddleClimax: ['staticCry', 'horrorSting'],
    contestRiddleResolve: ['victory', 'staticBreak'],
    // confession: the lectern: the liar confronted; accuse the System on its own cameras; the static screams
    // riddle: the Engine's counting — the idea brightens under a relay clunk.
    contestRiddleEscalate: ['eurekaTick', 'droneCount'],
    // confession: the room goes quiet while the verdict builds.
    contestConfessionEscalate: ['lineCut', 'justiceVerdict'],
    contestConfessionDeclare: ['liarConfront', 'contestCall'],
    contestConfessionClimax: ['justiceVerdict', 'modViolation'],
    contestConfessionResolve: ['victory', 'staticScream'],
    // honey: the swarm: excited clicking; shutters accelerate; the swarm takes apart; the swarm disperses
    contestHoneyDeclare: ['swarmBuild', 'contestCall'],
    contestHoneyEscalate: ['swarmEscalate', 'hypeInflate'],
    contestHoneyClimax: ['ambushSnap', 'swarmFlash'],
    contestHoneyResolve: ['victory', 'hypeDeflate'],
    // secrets: the deck: paper over muzak; the pot deepens, the counting heavier; the last card; the deck deals once more
    contestSecretsDeclare: ['paperRustle', 'holdMusic'],
    contestSecretsEscalate: ['round', 'lineCut'],
    contestSecretsClimax: ['staticScream', 'crash'],
    contestSecretsResolve: ['victory', 'paperRustle'],
    // quiet: the room: hush over muzak; your voice ahead of your thoughts (mindMoth — it reads the buried one); released into the night
    contestQuietDeclare: ['nightcourtSilence', 'holdMusic'],
    contestQuietEscalate: ['mindMoth', 'lineCut'],
    contestQuietClimax: ['staticScream', 'horrorSting'],
    contestQuietResolve: ['victory', 'nightcourtClimb'],
    // guest: the dinner: almost-right fanfare over the cooking lesson; the taste; the toast turns; dinner is served
    contestGuestDeclare: ['trialFanfare', 'systemCooking'],
    contestGuestEscalate: ['eurekaTick', 'horrorSting'],
    contestGuestClimax: ['trialFanfare', 'horrorSting'],
    contestGuestResolve: ['victory', 'systemCooking'],
    // vigil: the watchpost: hush over the count; drone under the ticks; storm and static at dawn; dawn on the wall
    contestVigilDeclare: ['nightcourtSilence', 'droneCount'],
    contestVigilEscalate: ['droneHum', 'woundCunning'],
    contestVigilClimax: ['stormFront', 'staticScream'],
    contestVigilResolve: ['victory', 'nightcourtLand'],
    // generic: fallback arc: the call; the counting; the wrongness; the win
    contestGenericDeclare: ['contestCall'],
    contestGenericEscalate: ['round'],
    contestGenericClimax: ['horrorSting'],
    contestGenericResolve: ['victory'],
    // The choice: participate or refuse — the System waits. Bureaucratic
    // beep, then the cut. Small on purpose: a contest's own Declare beat
    // belongs to the contest, never to the choice screen — firing it here
    // would double-sting on Participate and play the bespoke sting even
    // when the player refuses (Steve 2026-10-08).
    contestChoice: ['droneCorrect', 'lineCut'],
  };

  // Beat naming (Steve 2026-10-08): the 30 older contests get per-phase
  // composed beats named contest<Id>Declare|Escalate|Climax|Resolve.
  // Defined in CX_BEAT_DEFS above; unknown names no-op in _cxBeat, so
  // watch/generic paths can call this blind.
  G._cxB = function(contestId, kind) {
    const camel = String(contestId || '').replace(/_([a-z])/g, function(m, c) { return c.toUpperCase(); });
    const cap = camel.charAt(0).toUpperCase() + camel.slice(1);
    return 'contest' + cap + kind;
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
      lockpick: "The tumblers set in weight order — heavy to light, never 1-2-3. Force the door and the lock eats the attempt. Patience eats dinner.",
      wrongmap: "The System's maps always lie about WATER — it draws rivers where the ground is dry. Trust the terrain, not the ink.",
      alibi: "The false link vouches first and loudest. Pull the chain gently — every link you stress fractures something.",
      echo: "The noon telling always adds DANGER — bravery for the cameras. The dawn telling is the scared truth. Believe the scared one.",
      tidepool: "Third gull-cry, you turn back. No fourth pool is worth the causeway. The deep pools pay double and the tide charges double.",
      windfall: "Berries rot first — eat them. Meat smokes, fish dries, fruit keeps. Work the rot order, not the haul order.", 
    };
    return '\n\n📚 What you know: ' + (LINES[contest.id] || "You've seen this before. Trust your instincts.");
  };

  // --- THE PIT (bespoke, blood) ---
  G._contestPit = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { beat: 'contestPitDeclare', text: intro + `\n\nThe arena floor is sand and old bone. The gate across from you rattles. Something in there is breathing hard.\n\nThe System's voice, bright as a knife: "CHOOSE YOUR WEAPON, CONTESTANT."`,
        choices: [
          { label: 'Spear', sub: 'reach, steady — yours to keep', do: { grantWeapon: 'hunting_spear', note: 'You take the spear. It feels honest.' }, next: 1 },
          { label: 'Net and knife', sub: 'tricky, close — yours to keep', do: { grantWeapon: 'stone_knife', note: 'Knife in hand. No net — the System winks. "WE RAN OUT." The crowd oohs.' }, next: 1 },
          { label: 'Nothing', sub: 'the crowd gasps', do: { note: 'You shake your head. The gasp rolls around the arena like weather.', notability: 'showmanship' }, next: 1 },
        ] },
      { beat: 'contestPitEscalate', text: `The gate slams up. A wave-appropriate beast comes out low and fast — it has been promised food.\n\nIt circles. It's deciding how you die.\n\nThis is a real fight now. Your weapon, your health, your call — the grid is the arena.`,
        choices: [
          { label: 'Enter the pit', sub: 'a real fight', do: { arena: { waves: 1 }, note: 'You step onto the sand. The gate slams behind you.' }, next: 2 },
        ] },
      // Phase 2 is unreachable by choice (the arena resolves WIN/LOSE/DIE
      // via tbEnd) — kept as the System's epitaph if the feed glitches.
      { beat: 'contestPitClimax', text: `The sand settles. Whatever happened in the pit, the crowd saw it.`,
        choices: [
          { label: 'Breathe', sub: '', do: { note: 'You breathe.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- GAUNTLET (bespoke, blood/extreme) ---
  G._contestGauntlet = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { beat: 'contestGauntletDeclare', text: intro + `\n\nThree gates. Three waves. No rest between.\n\nThe System: "WAVE ONE. TRY TO LOOK SURPRISED."\n\nThe System adds, almost kindly: "THE CLOSER SMELLS BLOOD, CONTESTANT. ARRIVE HURT AND IT KNOWS."\n\nThe first beast is fast and stupid. It wants you tired for what's next.\n\nThese are real fights. Your health carries between waves — there is no rest, no healing. The grid is the arena.`,
        choices: [
          { label: 'Take a spear', sub: 'yours to keep', do: { grantWeapon: 'hunting_spear', note: 'You take a spear. Three waves. No rest.' }, next: 1 },
          { label: 'Go as you are', sub: 'what you brought', do: { note: 'You keep what you brought. The crowd respects it, or pities it.', notability: 'showmanship' }, next: 1 },
        ] },
      { beat: 'contestGauntletEscalate', text: `The first gate rattles. Then the second. Then the third.\n\nThree waves. No rest. Whatever you are when the third one falls, that's what walks out.`,
        choices: [
          { label: 'Begin', sub: 'three waves, no rest', do: { arena: { waves: 3 }, note: 'You step out. The first gate slams up.' }, next: 2 },
        ] },
      // Unreachable by choice (the arena chains waves via tbEnd) — the
      // System's epitaph if the feed glitches.
      { beat: 'contestGauntletClimax', text: `The sand settles. Three gates, three silences.`,
        choices: [
          { label: 'Breathe', sub: '', do: { note: 'You breathe.' }, next: 'LOSE' },
        ] },
    ];
  };

  // GAUNTLET CLOSER (Steve 2026-10-05): the closer smells blood. Death odds
  // scale with wounds taken during the contest — readable, escalating,
  // earned. Standing your ground is riskier than running, always.
  // Render a phase for display.
  G._contestRenderPhase = function(ac, phase, idx) {
  // BEAT AUDIO (Steve 2026-10-06): phases may declare beat:'name' — fired
    if (!phase) return phase;
    // BEAT AUDIO (Steve 2026-10-06): phases may declare beat:'name' — fired
    // when the phase is presented (phase 0 goes through here in both the
    // grabbed and choice paths, and contestChoose routes advances here too).
    if (phase.beat) { try { this._cxBeat(phase.beat); } catch (e) {} }
    // BROADCAST MODE (Steve 2026-10-09): commentary follows the beats —
    // the line is picked from the pool for THIS beat type, never generic.
    try {
      if (phase.beat && this.state && this.state.broadcast && this.state.broadcast.live) {
        this.broadcastBeat(phase.beat, this.state.activeContest || {});
      }
    } catch (e) {}
    // Idempotent: the rendered phase is stored back into ac.phases (the
    // choice box renders phases directly), so a second render must not
    // stack another readout onto the text (Steve 2026-10-06).
    if (phase._cxRendered) return phase;
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
      { beat: 'contestHideDeclare', text: intro + `\n\nThe seeker is a wave-2 predator. It is very good at seeking.\n\nYou get a sixty-count. The forest is dense, dark, and full of things that want to be left alone.\n\nThe System counts down. The predator is already listening.`,
        choices: [
          { label: 'Climb high', sub: 'trees, branches', do: { note: 'You climb until the branches thin. Your heart is louder than the leaves.' }, next: 1 },
          { label: 'Go low', sub: 'mud, roots, burrow', do: { note: 'You press into the mud under the roots. Something else is already down here. It ignores you.' }, next: 1 },
          { label: 'Hide in the open', sub: 'stillness as camouflage', do: { note: 'You stand against a trunk and do not move. Not a muscle. You become bark.' }, next: 1 },
        ] },
      { beat: 'contestHideEscalate', text: `You hear it. Not footsteps — the absence of other sounds. Birds go quiet in a widening circle.\n\nIt's close. It sniffs the air the way you check the weather.`,
        choices: [
          { label: 'Hold your breath', sub: 'do not exist', do: { dmg: [0, 8], note: 'You stop breathing. Your lungs burn. It passes — or it doesn\'t.' }, next: 2 },
          { label: 'Throw a stone', sub: 'misdirect', do: { note: 'You flick a stone into the dark. It turns toward the sound. Clever. It knows that trick too.' }, next: 2 },
          { label: 'Run', sub: 'break cover', do: { dmg: [14, 28], note: 'You RUN. Branches tear. Behind you, the quiet breaks into pursuit.' }, next: 2 },
        ] },
      { beat: 'contestHideClimax', text: `The count is almost up. You can hear the System warming up the "FOUND YOU" sting.\n\nIt's right there. You can see its eyes catch the light.`,
        choices: [
          { label: 'Stay hidden', sub: 'trust the spot', do: { prize: true,  dmg: [4, 16], note: 'You do not move. You barely breathe. The eyes sweep past — or stop.' }, next: 'WIN' },
          { label: 'Confront it', sub: 'scare it off', do: { prize: true,  dmg: [20, 38], note: 'You burst out screaming, arms wide. Predators hate surprises. Usually.' }, next: 'WIN' },
          { label: 'Surrender', sub: 'live, lose', do: { note: 'You stand up with your hands out. It blinks. The System sighs — found, but boring.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- DUEL (blood) ---
  G._contestDuel = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { beat: 'contestDuelDeclare', text: intro + `\n\nYour opponent is another contestant — scared, like you, but hiding it worse. Not to the death. To the yield.\n\nBut accidents happen. The System says this like it's a joke.`,
        choices: [
          { label: 'Offer a deal', sub: 'split the prize', do: { note: 'You whisper: we both walk out, we split whatever they give. They stare. The audience leans in.' }, next: 1 },
          { label: 'Study them', sub: 'find the weakness', do: { note: 'You watch how they stand. Favoring the left. Nervous hands. You can work with this.' }, next: 1 },
          { label: 'Attack first', sub: 'no ceremony', do: { dmg: [6, 14], note: 'You don\'t wait for the bell. Neither does the crowd\'s gasp.' }, next: 1 },
        ] },
      // ESCALATE (Steve 2026-10-08): the duel was declare→climax with no
      // middle — the contestDuelEscalate beat existed but no phase declared
      // it. The exchange of blows is the fight the crowd paid for.
      { beat: 'contestDuelEscalate', text: `The bell — a sound like a dropped pan in a cathedral.\n\nYou circle. They circle. The ref-drone ticks off the seconds, loud enough for the cheap seats, while the crowd picks sides and heckles both of you.`,
        choices: [
          { label: 'Trade blows', sub: 'honest', do: { dmg: [10, 20], note: 'You trade. Clean hits, both ways. The crowd respects the honesty. Your ribs file a complaint.' }, next: 2 },
          { label: 'Fight dirty', sub: 'win ugly', do: { dmg: [6, 14], trauma: 4, note: 'Sand, elbows, the ref-drone\'s blind spot. The crowd winces and cheers at the same time. Your opponent won\'t forget this.' }, next: 2 },
          { label: 'Talk them down', sub: 'mid-fight, unhinged', do: { note: '"Yield and we split it — I mean it this time." They almost laugh. Almost. The ref-drone ticks on, unimpressed.' }, next: 2 },
        ] },
      { beat: 'contestDuelClimax', text: `They yield — or they don't. The ref-drone hovers, sensors hot.\n\nThe crowd wants blood. The System wants a story. You want to go home.`,
        choices: [
          { label: 'Press the advantage', sub: 'finish it', do: { prize: true,  dmg: [16, 30], trauma: 12, note: 'You press. They go down. The drone calls it. Your hands won\'t stop shaking.' }, next: 'WIN' },
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
      { beat: this._cxB(contest.id, 'Declare'), text: intro + (isDrop
        ? `\n\nThey drop you on a ridge with nothing. The beacon is three miles through snow and attitude.\n\nTwo others hit the ground near you. Nobody waves.`
        : `\n\nThree days. No food. Water provided. Dignity not.\n\nFour of you in the white room. The cameras never blink.`),
        choices: [
          { label: isDrop ? 'Move fast' : 'Sleep it off', sub: isDrop ? 'burn bright' : 'conserve', do: isDrop ? { kcal: -500, dmg: [4, 12], note: 'You run the ridge line. Fast is a kind of armor.' } : { note: 'You sleep. Hunger dreams are vivid. You wake emptier.' }, next: 1 },
          { label: isDrop ? 'Forage as you go' : 'Drink water constantly', sub: isDrop ? 'slow, fed' : 'full belly, water', do: isDrop ? { kcal: 200, note: 'You pick as you walk. Slow. Your stomach thanks you.' } : { note: 'You drink until you slosh. It helps. Barely.' }, next: 1 },
          { label: isDrop ? 'Follow the others' : 'Meditate', sub: isDrop ? 'let them break trail' : 'mind over gut', do: { note: isDrop ? 'You let them break trail through the drifts. Cruel. Efficient.' : 'You sit with the hunger until it becomes weather. It passes through you.' }, next: 1 },
        ] },
      { beat: this._cxB(contest.id, 'Escalate'), text: isDrop
        ? `Night. The cold is a second opponent. One of the others is crying, quietly, like it's a secret.\n\nThe beacon blinks, impossibly far.`
        : `Day two. Someone is talking to their food hallucinations. The System zooms in.\n\nYour stomach has filed a formal complaint.`,
        choices: [
          { label: isDrop ? 'Keep moving at night' : 'Steal a sip of broth', sub: isDrop ? 'dangerous, gains ground' : 'someone\'s stash', do: isDrop ? { dmg: [8, 18], kcal: -300, note: 'You walk through the dark. The snow hides the drop-offs. Mostly.' } : { dmg: [0, 4], note: 'You steal broth. It\'s warm. The guilt is warmer. The cameras saw everything.', notability: 'heist' }, next: 2 },
          { label: isDrop ? 'Shelter and shiver' : 'Share your water', sub: isDrop ? 'lose time, live' : 'kindness, televised', do: isDrop ? { kcal: -200, note: 'You dig in and shiver through the night. Slow. Alive.' } : { note: 'You share your water ration. The audience awws. The System notes it.', notability: 'showmanship' }, next: 2 },
          { label: isDrop ? 'Eat snow' : 'Chew your sleeve', sub: isDrop ? 'hydration, cold core' : 'desperate', do: isDrop ? { dmg: [4, 10], note: 'Snow for water. Your core temp drops with every mouthful.' } : { note: 'You chew your sleeve. The chat explodes. You are now a meme across seventeen systems.' }, next: 2 },
        ] },
      { beat: this._cxB(contest.id, 'Climax'), text: isDrop
        ? `The beacon is close enough to hear. One of the others is ahead of you — limping, but ahead.\n\nThis is the part the promos are made of.`
        : `Day three. The doors will open at dusk. Whoever looks the least broken wins the audience.\n\nYou are very broken. So is everyone.`,
        choices: [
          { label: isDrop ? 'Sprint the last mile' : 'Walk out smiling', sub: isDrop ? 'everything left' : 'performance', do: isDrop ? { prize: true, dmg: [14, 26], kcal: -400, note: 'You sprint. Lungs, legs, heart — everything files a complaint. You pass them at the line.' } : { prize: true, note: 'You walk out smiling like you ate yesterday. The audience buys it. The System knows. It respects the lie.' }, next: 'WIN' },
          { label: isDrop ? 'Pace it home' : 'Help another up', sub: isDrop ? 'steady' : 'carry them', do: isDrop ? { prize: true, note: 'You pace it. They beat you by a minute. You beat the mountain.' } : { prize: true, dmg: [0, 6], note: 'You help another contestant stand. You both cross. The crowd weeps. Second place, first in the edit.' }, next: 'WIN' },
          { label: isDrop ? 'Collapse short' : 'Crawl out', sub: isDrop ? 'so close' : 'no dignity left', do: isDrop ? { dmg: [6, 14], note: 'Your legs quit a hundred yards out. You crawl. The beacon blinks. You make it. Barely counts.' } : { note: 'You crawl out. There is no dignity left. There is, however, a finish line.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- MOOT (category template: trial / lie detector) ---
  G._contestMoot = function(contest) {
    const intro = this._cxIntro(contest);
    const isLies = contest.id === 'lies';
    // RHETORICAL STANDING (Steve 2026-10-08): the moot is argued, not rolled
    // and not "pick WIN to win". Your social capital (trust, fame) sets the
    // base; each rhetorical choice moves it. The climax is judged against a
    // threshold — deterministic, stats-driven, choice-driven.
    let base = 0;
    try {
      const s = this.state.scholar || {};
      base = Math.round((s.trust || 50) / 10) + ((s.notability || []).length * 2);
    } catch (e) {}
    const demand = { low: 8, medium: 12, high: 16, extreme: 20 }[contest.risk] || 12;
    return [
      { beat: this._cxB(contest.id, 'Declare'), text: intro + (isLies
        ? `\n\nTwo chairs. One scanner. The System knows when you lie — and the audience lives for it.\n\nFirst question's coming. Your opponent is already sweating.`
        : `\n\nTelevised trial. The accusations may be true or not — the audience is the jury either way.\n\nThe prosecutor-drone reads the charges. Some of them are even yours.`),
        choices: [
          { label: 'Tell the truth', sub: 'radical', do: { note: isLies ? 'You tell the truth. The scanner stays quiet. The audience is disappointed and impressed.' : 'You tell the truth. The jury box leans forward as one. The audience is disappointed and impressed.', sway: 3 }, next: 1 },
          { label: 'Lie beautifully', sub: 'performance', do: { note: isLies ? 'You lie like it\'s an art form. The scanner buzzes. The audience GASPS with delight.' : 'You lie like it\'s an art form. The prosecutor-drone objects. The audience GASPS with delight.', notability: 'showmanship', sway: 4 }, next: 1 },
          { label: 'Refuse to answer', sub: 'contempt', do: { note: isLies ? 'You say nothing. Silence, televised. The System notes the defiance.' : 'You say nothing. Silence, televised. The jury shifts in its seats. The System notes the defiance.', notability: 'showmanship', sway: 1 }, next: 1 },
        ] },
      { beat: this._cxB(contest.id, 'Escalate'), text: isLies
        ? `Harder questions now. Personal ones. The scanner hums.\n\nYour opponent just lied badly about something small. The crowd smells blood.`
        : `A witness is called. It's someone from your village. They look at you, then at the cameras, then back.\n\nWhat they say next matters enormously.`,
        choices: [
          { label: 'Double down', sub: 'commit', do: { dmg: [0, 8], trauma: 5, note: isLies ? 'You commit to the story. The scanner screams. The audience is feral with joy.' : 'You commit to the story. The prosecutor-drone replays your own words back at you. The audience is feral with joy.', sway: 2 }, next: 2 },
          { label: 'Confess', sub: 'disarm', do: { note: isLies ? 'You confess — the small thing, the real thing. The scanner goes quiet. The crowd doesn\'t know what to do with honesty.' : 'You confess — the small thing, the real thing. The jury doesn\'t know what to do with honesty. Nobody does.', notability: 'showmanship', sway: 3 }, next: 2 },
          { label: 'Turn it around', sub: 'accuse the accuser', do: { note: isLies ? 'You point at the question itself. "Who benefits from asking that?" The System pauses. Interesting.' : 'You point at the charges themselves. "Who benefits from asking that?" The prosecutor-drone pauses. Interesting.', notability: 'showmanship', sway: 4 }, next: 2 },
        ] },
      { beat: this._cxB(contest.id, 'Climax'), text: isLies
        ? `Final question. The big one. The scanner is hot.\n\nWhatever you say next will be clipped and replayed for years.`
        : `Closing statements. The audience votes with their attention — you can feel it like heat.\n\nThis is the moment.`,
        choices: [
          { label: 'The whole truth', sub: 'burn it down', do: { prize: true, trauma: 8, note: isLies ? 'You tell all of it. Every ugly true thing. The scanner is silent. The audience is silent. Then — applause like weather.' : 'You tell all of it. Every ugly true thing. The jury is silent. Then — applause like weather.', notability: 'contestWin', sway: 5 }, next: 'MOOT_JUDGE' },
          { label: 'The perfect lie', sub: 'one for the ages', do: { prize: true, note: isLies ? 'You deliver a lie so beautiful the scanner hesitates. The crowd erupts. You win the moment, if not the truth.' : 'You deliver a lie so beautiful the jury forgets to breathe. The crowd erupts. You win the moment, if not the truth.', notability: 'showmanship', sway: 5 }, next: 'MOOT_JUDGE' },
          // WALK-OUT PRIZE (break-it contest 2026-10-09): refusing the game
          // (sway -3) almost never wins — but a towering standing still can.
          // A WIN is a WIN: the winners-get-prizes contract (template_prize)
          // holds even for defiance the System found interesting.
          { label: 'Walk out', sub: 'refuse the game', do: { prize: true, note: 'You stand and leave. The cameras follow you to the door. The System lets you go — the refusal IS the content.', notability: 'showmanship', sway: -3 }, next: 'MOOT_JUDGE' },
        ] },
    ].map((ph, i) => {
      // Stash the judging parameters on the first phase (the engine reads them).
      if (i === 0) { ph._mootBase = base; ph._mootDemand = demand; }
      return ph;
    });
  };

  // --- WEIRD (category template: cookfight / fetch) ---
  G._contestWeird = function(contest) {
    const intro = this._cxIntro(contest);
    const isCook = contest.id === 'cookfight';
    return [
      { beat: this._cxB(contest.id, 'Declare'), text: intro + (isCook
        ? `\n\nThe ingredients are in cages. They are looking at you.\n\nCook a meal. Presentation matters. Survival matters more.`
        : `\n\nOne mile radius. One hour. Most interesting thing wins.\n\nJudged by beings who have never touched grass. Good luck.`),
        choices: [
          { label: isCook ? 'Befriend the ingredients' : 'Go far', sub: isCook ? 'gentle' : 'distance', do: { note: isCook ? 'You speak softly to the caged things. One of them stops rattling. The audience melts.' : 'You run for the treeline. Interesting lives far from the start.' }, next: 1 },
          { label: isCook ? 'Assert dominance' : 'Go weird', sub: isCook ? 'chef energy' : 'unhinged', do: { dmg: isCook ? [4, 10] : [0, 0], note: isCook ? 'You slam the counter. The ingredients flinch. Gordon would be proud.' : 'You look for the thing nobody else would touch. There it is.' }, next: 1 },
          { label: isCook ? 'Ask the audience' : 'Go obvious', sub: isCook ? 'crowd work' : 'safe', do: { note: isCook ? 'You play to the cameras. "What should I make?" The chat explodes with suggestions, half of them lethal.' : 'You grab the shiniest thing. Safe. The judges yawn in seventeen languages.' }, next: 1 },
        ] },
      { beat: this._cxB(contest.id, 'Escalate'), text: isCook
        ? `Something is out of its cage. The audience is delighted. You are not.\n\nDinner is fighting back.`
        : `Half the hour gone. Your find is... okay. Someone else is carrying something that glows.\n\nThe judges are bored. Bored judges are dangerous judges.`,
        choices: [
          { label: isCook ? 'Wrestle it' : 'Double down on weird', sub: isCook ? 'hands on' : 'commit', do: { dmg: isCook ? [8, 16] : [0, 6], die: isCook ? 0.05 : 0, note: isCook ? 'You grapple the ingredient. It grapples back. The crowd is screaming.' : 'You commit to the weird thing. It\'s either genius or a war crime. No middle.' }, next: 2 },
          { label: isCook ? 'Negotiate' : 'Sabotage the glowing one', sub: isCook ? 'diplomacy' : 'dirty', do: { note: isCook ? 'You offer it a deal: cooperate and live. It considers. The System is taking notes.' : 'You "accidentally" knock their glow into the mud. The audience gasps. The judges pretend not to see.', notability: 'heist' }, next: 2 },
          { label: isCook ? 'Set it free' : 'Present with confidence', sub: isCook ? 'mercy' : 'sell it', do: { note: isCook ? 'You open the cage. It stares. Then it bows — actually bows — and leaves. The crowd weeps.' : 'You present your okay thing like it\'s the crown jewels. Confidence is a kind of interesting.' }, next: 2 },
        ] },
      { beat: this._cxB(contest.id, 'Climax'), text: isCook
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
      { beat: this._cxB(contest.id, 'Declare'), text: intro + (isBox
        ? `\n\nThe box is bigger inside than out. That's the first problem.\n\nThe audience has the manual. They are not sharing. They are laughing.`
        : `\n\nA sequence of foods on the table. Eat them in the right order.\n\nThe wrong order... disagrees with you. The audience knows the order. They are not telling.`),
        choices: [
          { label: isBox ? 'Study it first' : 'Smell everything first', sub: isBox ? 'patience' : 'the nose knows', do: { note: isBox ? 'You circle it, learning its logic. The audience gets restless. Restless is good — they start shouting hints.' : 'You work the line with your nose. The second item smells like trouble. Or dessert. The nose is not sure.' }, next: 1 },
          { label: isBox ? 'Touch everything' : 'Nibble the smallest', sub: isBox ? 'brute force' : 'test', do: { dmg: [2, 8], note: isBox ? 'You poke, prod, and pull. Something clicks. Something else shocks you. Progress.' : 'You nibble the smallest piece first. Your stomach considers it. The audience holds its breath. So do you.' }, next: 1 },
          { label: isBox ? 'Ask the box nicely' : 'Ask the audience', sub: 'unhinged', do: { note: isBox ? '"Please?" The box does nothing. The audience finds this hilarious. One of them slips you a hint in the chat.' : '"What would YOU eat first?" The chat explodes. Half of them are trying to kill you. The other half are worse.' }, next: 1 },
        ] },
      { beat: this._cxB(contest.id, 'Escalate'), text: isBox
        ? `A panel slides open. Inside: a smaller box. Of course.\n\nThe chat is spamming the solution. Half of them are lying.`
        : `First bite down. The sequence matters and your gut knows it.\n\nThe second item smells wrong. Or right. You can't tell anymore.`,
        choices: [
          { label: 'Trust the chat', sub: 'crowdsource', do: { dmg: [0, 10], note: isBox ? 'You follow the most-upvoted hint. It\'s either genius or sabotage. Fifty-fifty, televised.' : 'You follow the most-upvoted order. It\'s either genius or sabotage. Fifty-fifty, televised.' }, next: 2 },
          { label: 'Trust your gut', sub: 'instinct', do: { note: isBox ? 'You ignore everyone and follow the logic you\'ve built. Quiet. Certain. Yours.' : 'You ignore everyone and follow what your stomach says. Quiet. Certain. Yours.' }, next: 2 },
          { label: isBox ? 'Do the opposite' : 'Eat out of order', sub: 'contrarian', do: { dmg: [2, 8], note: isBox ? 'Everyone says left. You go right. The contrarian play — sometimes the puzzle wants what nobody expects.' : 'Everyone says the berries last. You eat the berries NOW. The contrarian play — sometimes the gut wants what nobody expects.' }, next: 2 },
        ] },
      { beat: this._cxB(contest.id, 'Climax'), text: isBox
        ? `Last layer. The box is humming now — it knows you're close.\n\nOne move left. The audience holds its breath.`
        : `Last item. Your stomach is a democracy in crisis.\n\nGet this right and you're a legend. Get it wrong and you're a clip.`,
        choices: [
          { label: isBox ? 'The elegant solution' : 'The elegant sequence', sub: 'beauty', do: { prize: true, note: isBox ? 'You see it — the pattern resolves like a chord. You move. The box OPENS. The crowd detonates.' : 'You see it — the order resolves like a chord. You eat. Nothing disagrees. The crowd detonates.', notability: 'contestWin' }, next: 'WIN' },
          { label: isBox ? 'The brute solution' : 'Eat it all at once', sub: 'force', do: { prize: true, dmg: [6, 14], note: isBox ? 'You stop solving and start forcing. The box resists, then — grudgingly — yields. Ugly. Effective.' : 'You stop sequencing and just EAT. Your stomach objects, then — grudgingly — settles. Ugly. Effective.' }, next: 'WIN' },
          { label: isBox ? 'Admit defeat' : 'Push the plate away', sub: 'graceful', do: { note: isBox ? 'You bow to the box. "You win." The audience awws. The System files it under: humility, rare.' : 'You push the plate away. "I concede." The audience awws. The System files it under: humility, rare.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- DETECTIVE (category template: whoate / informant) ---
  G._contestDetective = function(contest) {
    const intro = this._cxIntro(contest);
    const isWho = contest.id === 'whoate';
    return [
      { beat: this._cxB(contest.id, 'Declare'), text: intro + (isWho
        ? `\n\nThe prize is gone. Three suspects. One of them is lying about everything.\n\nYou have an hour. The cameras love a deadline.`
        : `\n\nFour of you. One is the informant — lying about everything, working the exits.\n\nFind them before they find the door.`),
        choices: [
          { label: 'Watch everyone', sub: 'observe', do: { note: 'You watch. Hands, eyes, who stands near the exits. People leak truth like heat.' }, next: 1 },
          { label: 'Ask blunt questions', sub: 'direct', do: { note: '"Where were you?" Blunt works. Liars over-explain. The innocent get annoyed. Both are data.' }, next: 1 },
          { label: 'Befriend a suspect', sub: 'soft', do: { note: 'You get close to one of them. Trust is a tool. It feels awful and works great.' }, next: 1 },
        ] },
      { beat: this._cxB(contest.id, 'Escalate'), text: isWho
        ? `Two of them have alibis that almost hold. The third keeps changing small details.\n\nThe audience has a favorite suspect. The audience is often wrong.`
        : `Someone just tried the east door. Locked — but the attempt tells you everything.\n\nThe informant is getting nervous. Nervous people make mistakes.`,
        choices: [
          { label: 'Confront the liar', sub: 'direct accusation', do: { dmg: [0, 6], note: 'You point. "You." The room goes still. They deny it — badly. The cameras zoom.' }, next: 2 },
          { label: 'Set a trap', sub: 'bait', do: { note: 'You plant false information and watch who acts on it. The trap snaps shut on schedule.' }, next: 2 },
          { label: 'Follow the quiet one', sub: 'instinct', do: { note: 'The quietest person in the room is always the story. You follow. You\'re right.' }, next: 2 },
        ] },
      { beat: this._cxB(contest.id, 'Climax'), text: isWho
        ? `You know who. Saying it on camera is the whole game.\n\nGet it right: hero. Get it wrong: the clip lives forever.`
        : `It's down to you and them. The exits are watched. The clock is loud.\n\nName the informant. Now.`,
        choices: [
          { label: 'Name them, with proof', sub: 'the full case', do: { prize: true, note: 'You lay it out — timeline, motive, the detail they got wrong. Airtight. The System confirms. The crowd erupts.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Name them, on instinct', sub: 'the gut call', do: { prize: true, note: 'You point on instinct. The pause before the System confirms is the longest second of your life. Correct. Barely.' }, next: 'WIN' },
          { label: 'Accuse the wrong one', sub: 'the mistake', do: { trauma: 6, note: 'You get it wrong. The real thief smiles. The clip will follow you. The System is merciless with editors.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- FORAGE (category template: calorie_run / pantry_raid) ---
  G._contestForage = function(contest) {
    const intro = this._cxIntro(contest);
    const isRaid = contest.id === 'pantry_raid';
    return [
      { beat: this._cxB(contest.id, 'Declare'), text: intro + (isRaid
        ? `\n\nThe location is dangerous. The locals object. Bring back food or don't come back.\n\nYour competition is already moving.`
        : `\n\nOne hour. Most calorie-dense haul wins. The forest is... competitive.\n\nThe others fan out. The clock starts.`),
        choices: [
          { label: isRaid ? 'Sneak in' : 'Go for known patches', sub: isRaid ? 'quiet' : 'reliable', do: { note: isRaid ? 'Low and slow. The locals have routines. You learn them fast.' : 'You hit the patches you know. Steady calories. No surprises.' }, next: 1 },
          { label: isRaid ? 'Brave the front' : 'Try the deep woods', sub: isRaid ? 'bold' : 'risky', do: { dmg: isRaid ? [6, 14] : [2, 8], note: isRaid ? 'You walk in like you belong. Boldness is a kind of invisibility. Mostly.' : 'Deeper means richer and meaner. You know this. You go anyway.' }, next: 1 },
          { label: isRaid ? 'Distract them' : 'Follow the birds', sub: isRaid ? 'clever' : 'read sign', do: { note: isRaid ? 'You start a commotion on the far side. While they look there, you\'re here.' : 'Birds know where the food is. You read the sky like a menu.' }, next: 1 },
        ] },
      { beat: this._cxB(contest.id, 'Escalate'), text: isRaid
        ? `You're inside. The locals are close — you can hear them.\n\nYour sack is half full. Greed and sense are negotiating.`
        : `Half the hour gone. Your haul is decent. Someone else is carrying something heavy and grinning.\n\nTime to commit.`,
        choices: [
          { label: isRaid ? 'Grab and run' : 'Push deeper', sub: isRaid ? 'speed' : 'greed', do: { dmg: [8, 18], die: isRaid ? 0.06 : 0.02, kcal: 300, note: isRaid ? 'You grab and RUN. Shouting behind you. Your sack is full and your heart is fuller.' : 'You push past the safe line. The calories are incredible. So is the risk.' }, next: 2 },
          { label: isRaid ? 'Take only the best' : 'Work the edges', sub: isRaid ? 'selective' : 'steady', do: { kcal: 150, note: isRaid ? 'You take only the densest cuts. Quality over quantity. The connoisseur\'s raid.' : 'You work the edges clean. No drama. Solid haul.' }, next: 2 },
          { label: isRaid ? 'Leave an offering' : 'Eat as you go', sub: isRaid ? 'respect' : 'fuel', do: { kcal: isRaid ? -100 : 200, note: isRaid ? 'You leave something for the locals. Respect. They watch you go. They let you.' : 'You eat the best bits yourself. Fuel for the push. The judges can\'t weigh what\'s in your stomach.' }, next: 2 },
        ] },
      { beat: this._cxB(contest.id, 'Climax'), text: isRaid
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
      { beat: this._cxB(contest.id, 'Declare'), text: intro + (isWheel
        ? `\n\nThe wheel is huge and the teeth are real. Spin it. The teeth decide.\n\nThe audience holds its breath. So do you.`
        : `\n\nFive tokens. One is gold. Draw.\n\nThe audience loves an underdog. Be the underdog.`),
        choices: [
          { label: isWheel ? 'Spin with conviction' : 'Draw with conviction', sub: 'commit', do: { note: isWheel ? 'You spin like you mean it. The wheel screams around. The teeth blur.' : 'You reach in like the token owes you money. The drum turns. The audience leans.' }, next: 1 },
          { label: isWheel ? 'Spin gently' : 'Feel them out', sub: 'finesse', do: { note: isWheel ? 'You barely touch it. The wheel creeps. The crowd leans in — slow is excruciating.' : 'You run your fingers over the tokens, feeling for weight, warmth, anything. They all feel the same. They aren\'t.' }, next: 1 },
          { label: 'Pray first', sub: 'ritual', do: { note: isWheel ? 'You close your eyes and ask anything listening for luck. The wheel doesn\'t care. The audience loves the theater.' : 'You close your eyes and ask anything listening for luck. The drum doesn\'t care. The audience loves the theater.' }, next: 1 },
        ] },
      { beat: this._cxB(contest.id, 'Escalate'), text: isWheel
        ? `The wheel slows. The pointer wobbles between fates.\n\nYou can see where it wants to land. You can't do anything about it.`
        : `Your hand hovers over the tokens. They all feel the same. They aren't.\n\nPick.`,
        choices: [
          { label: 'Trust the feeling', sub: 'instinct', do: { dmg: [0, 12], note: isWheel ? 'You go with the pull. The wheel stops. The teeth are very close to your name.' : 'You go with the pull and close your fist around one. The dealer watches. The dealer knows.' }, next: 2 },
          { label: 'Change your mind', sub: 'second-guess', do: { note: 'You switch at the last second. The crowd groans. Second-guessing is box office.' }, next: 2 },
          { label: 'Close your eyes', sub: 'fate', do: { note: 'You don\'t watch. The crowd watches for you. Their gasp tells you everything.' }, next: 2 },
        ] },
      { beat: this._cxB(contest.id, 'Climax'), text: isWheel
        ? `It stops. The pointer settles.\n\nThe teeth are smiling. Or that's just how they look.`
        : `You turn the token over.\n\nGold. Or not.`,
        choices: [
          { label: 'Accept the result', sub: 'whatever it is', do: { dmg: [0, 20], prize: true, note: isWheel ? 'Whatever the wheel decided — you take it standing. The crowd respects the spine.' : 'Whatever the token says — you take it standing. The crowd respects the spine.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Laugh', sub: 'defiance', do: { note: isWheel ? 'You laugh in the teeth\'s face. The audience laughs with you. Losing beautifully is still beautiful.' : 'You laugh at the token. The audience laughs with you. Losing beautifully is still beautiful.' }, next: 'LOSE' },
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
      ? { beat: 'contestTitheClimax', text: `Three measures. You know the count — you have paid it before. The altar's surface shivers, sated.\n\nNow: stop. The fourth measure is the one that kills.`,
          choices: [
            { label: 'Stop. Three is the measure.', sub: 'you know the count', do: { prize: true, note: 'You bind the wound. The System bows to you — actually bows. "ENOUGH," it says, and means it.', notability: 'contestWin' }, next: 'WIN' },
            { label: 'Give a fourth measure', sub: 'greed, televised', do: { prize: true, dmg: [20, 35], note: 'You know what the fourth measure costs. You give it anyway. The altar drinks deep — it respects the excess. Probably.' }, next: 'WIN' },
            { label: 'Offer your name instead', sub: 'a different currency', do: { prize: true, trauma: 12, note: 'Blood isn\'t the only currency. You offer the System your name — the real one, the childhood one. It accepts. You feel lighter. Emptier.', notability: 'showmanship' }, next: 'WIN' },
          ] }
      : { beat: 'contestTitheClimax', text: `The altar gives no sign. Your blood is in it and your head is full of static.\n\nHow much is enough? Nobody will say.`,
          choices: [
            { label: 'Stop now', sub: 'a guess', do: { dmg: [4, 10], trauma: 6, note: 'You bind the wound and hope. The altar considers. Hoping is not a currency the altar accepts — but it lets you walk.', notability: 'showmanship' }, next: 'LOSE' },
            { label: 'One more measure', sub: 'maybe more is safer', do: { prize: true, dmg: [16, 28], note: 'You bleed blind and pray the count is right. The basin ripples. The System tilts its head, considering your arithmetic.' }, next: 'WIN' },
            { label: 'Offer your name instead', sub: 'a different currency', do: { prize: true, trauma: 12, note: 'Blood isn\'t the only currency. You offer the System your name — the real one, the childhood one. It accepts. You feel lighter. Emptier.', notability: 'showmanship' }, next: 'WIN' },
          ] };
    return [
      { beat: 'contestTitheDeclare', text: intro + `\n\nA black basin on a black altar. The System, gentle as a nurse: "BLEED FOR US, CONTESTANT. WE ONLY NEED... ENOUGH."\n\nYour blood steams in the cold air.` + measure,
        choices: [
          { label: 'A shallow cut', sub: 'a taste', do: { dmg: [6, 12], note: 'A shallow cut. The blood threads into the basin. The altar... waits.' }, next: 1 },
          { label: 'A real cut', sub: 'a measure', do: { dmg: [14, 22], note: 'You open the vein properly. The basin fills a finger deeper. The System hums.' }, next: 1 },
          { label: 'Both wrists', sub: 'all in', do: { dmg: [24, 36], note: 'Both wrists. The crowd goes silent — even they know this is too much, too fast.' }, next: 1 },
        ] },
      { beat: 'contestTitheEscalate', text: `The basin is filling. Your vision swims at the edges.\n\nThe System tilts its head. "MORE?" it asks, like it's offering dessert.`,
        choices: [
          { label: 'A little more', sub: 'careful', do: { dmg: [8, 14], note: 'A careful second measure. The altar ripples. It might be pleased. Basins don\'t have faces.' }, next: 2 },
          { label: 'A lot more', sub: 'desperate', do: { dmg: [16, 26], note: 'You pour yourself out. The basin drinks. You are getting very cold.' }, next: 2 },
          { label: 'Press the wound shut', sub: 'stall', do: { trauma: 4, note: 'You press the wound shut and wait. The System watches the basin. The basin watches you.' }, next: 2 },
        ] },
      p3,
    ];
  };

  // --- SIEGE (bespoke, blood/extreme) ---
  G._contestSiege = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { beat: 'contestSiegeDeclare', text: intro + `\n\nA chokepoint of rubble and light-fencing. Beyond it: the beacon. Behind you: the village, watching from the walls.\n\nThe System: "THREE WAVES. HOLD THE LINE. THE VILLAGE IS WATCHING — WAVE, WON'T YOU?"\n\nThree waves. No rest. Real fights — your health carries between them.`,
        choices: [
          { label: 'Fortify the chokepoint', sub: 'barricade', do: { note: 'You stack rubble higher. The village cheers your name from the walls.' }, next: 1 },
          { label: 'Take a spear', sub: 'yours to keep', do: { grantWeapon: 'hunting_spear', note: 'You take a spear from the rack. The line will hold.' }, next: 1 },
          { label: 'Stand in the open', sub: 'taunt', do: { note: 'You stand in the gap and dare them. The crowd loves a taunt.', notability: 'showmanship' }, next: 1 },
        ] },
      { beat: 'contestSiegeEscalate', text: `The waves are coming. They feint at the barricade — and come for YOU.\n\nThe village gasps as one. Someone on the wall is screaming your name.\n\nThree waves. Hold the line.`,
        choices: [
          { label: 'Hold the line', sub: 'three waves, real fights', do: { arena: { waves: 3 }, note: 'You plant yourself in the gap. The first wave comes.' }, next: 2 },
        ] },
      // Unreachable by choice (the arena chains waves via tbEnd).
      { beat: 'contestSiegeClimax', text: `The beacon hums behind you. The village holds its breath.`,
        choices: [
          { label: 'Breathe', sub: '', do: { note: 'You breathe.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- THE MAW (bespoke, endurance/extreme) ---
  G._contestMaw = function(contest) {
    const intro = this._cxIntro(contest);
    // PURSUIT (Steve 2026-10-08): the Maw is not a slot machine. The thing
    // is BEHIND you at distance 3. Every choice moves it — sprint pulls
    // ahead (costs body), steady holds, slow/rest let it close. Distance 0
    // means caught: death, not a roll. You stopped too many times.
    return [
      { beat: 'contestMawDeclare', text: intro + `\n\nA tunnel mouth in the arena floor, breathing cold air. Behind you: a grate slams shut.\n\nAhead: dark. Behind the dark: something that has learned patience.\n\nThe System, cheerful: "WALK. DON'T STOP. IT COUNTS YOUR PAUSES."\n\nIt starts three lengths behind you. Every pause is a length.`,
        choices: [
          { label: 'Sprint', sub: 'burn bright', do: { dmg: [6, 14], kcal: -300, mawDist: 1, note: 'You sprint into the dark. Your footsteps come back wrong — doubled. But you\'re pulling ahead.' }, next: 1 },
          { label: 'Steady walk', sub: 'pace', do: { kcal: -150, mawDist: 0, note: 'Steady. Breath even. The dark ahead stays dark. The dark behind stays where it is.' }, next: 1 },
          { label: 'Feel the walls', sub: 'careful', do: { mawDist: -1, note: 'Hands on the walls, reading the tunnel like braille. Slow. It gains a length.' }, next: 1 },
        ] },
      { beat: 'contestMawEscalate', text: `You hear it now. Not footsteps — the tunnel going quiet ahead of you, like the dark is listening.\n\nYour legs are shaking. Stopping would be so easy.`,
        choices: [
          { label: 'Keep moving', sub: 'no pauses', do: { dmg: [4, 10], kcal: -200, mawDist: 0, note: 'You keep moving. The quiet stays behind you. Barely.' }, next: 2 },
          { label: 'Rest thirty seconds', sub: 'risky', do: { mawDist: -2, note: 'You stop. Thirty seconds. You can feel it counting with you — and closing.' }, next: 2 },
          { label: 'Scream at it', sub: 'defiance', do: { mawDist: -1, note: 'You turn and SCREAM into the dark. The dark screams back, delighted. It likes that. It\'s closer now.', notability: 'showmanship' }, next: 2 },
        ] },
      { beat: 'contestMawClimax', text: `Light ahead. A circle of it, small and grey and real.\n\nIt's close behind you now. You can feel its interest like heat.`,
        choices: [
          { label: 'Sprint for the light', sub: 'everything left', do: { prize: true, dmg: [16, 30], kcal: -400, mawDist: 1, note: 'You run like the tunnel is ending — because it is, one way or another.' }, next: 'MAW_JUDGE' },
          { label: 'Walk out calmly', sub: 'dignity', do: { prize: true, dmg: [6, 14], mawDist: 0, note: 'You walk. Measured. Unhurried. The thing behind you slows, confused by the lack of fear.' }, next: 'MAW_JUDGE' },
          { label: 'Turn and face it', sub: 'the other choice', do: { mawDist: -99, note: 'You turn. You look at it. It looks at you. The cameras get the shot of the year — and then it has you.' }, next: 'MAW_JUDGE' },
        ] },
    ].map((ph, i) => {
      if (i === 0) { ph._mawDist = 3; }
      return ph;
    });
  };

  // --- THE OATH (bespoke, moot/high) ---
  G._contestOath = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { beat: 'contestOathDeclare', text: intro + `\n\nThree lecterns. Three oaths, written in light. The System explains, kindly: "SWEAR. MEAN IT. WE WILL KNOW."\n\nThe first oath: NEVER LIE TO THE CAMERAS AGAIN.`,
        choices: [
          { label: 'Swear it fully', sub: 'mean it', do: { trauma: 6, note: 'You swear. The light wraps your wrist like a bracelet. It itches with truth.', notability: 'showmanship' }, next: 1 },
          { label: 'Swear with fingers crossed', sub: 'gamble', do: { trauma: 10, note: 'You cross your fingers behind the lectern. The System\'s smile doesn\'t move. It saw. It always sees.' }, next: 1 },
          { label: 'Refuse this oath', sub: 'defiance', do: { trauma: 8, note: 'You say no. The cameras lean in. Refusal is content, and the System files your defiance under: interesting.', notability: 'showmanship' }, next: 1 },
        ] },
      { beat: 'contestOathEscalate', text: `The second oath: GIVE THE SYSTEM ONE MEMORY. It chooses which.\n\nIt is already reaching. You can feel it browsing.`,
        choices: [
          { label: 'Let it take one', sub: 'the price', do: { trauma: 10, note: 'It takes the summer afternoon. You remember remembering it. The shape of it is gone.' }, next: 2 },
          { label: 'Offer a false one', sub: 'trick it', do: { trauma: 14, note: 'You offer a memory you built for this. The System turns it over. It knows forgery. It appreciates the craft. Maybe.' }, next: 2 },
          { label: 'Beg it to choose kindly', sub: 'mercy', do: { trauma: 8, note: 'You ask it to be kind. The System pauses — genuinely touched, or performing it. It takes a small one. A Tuesday.' }, next: 2 },
        ] },
      { beat: 'contestOathClimax', text: `The third oath: WHEN THE SYSTEM CALLS, COME. No conditions.\n\nThis is the one that matters. The audience knows it. You know it.`,
        choices: [
          { label: 'Swear — and mean it', sub: 'bound', do: { prize: true, trauma: 8, note: 'You swear. The third bracelet clicks shut. You are bound, and the galaxy witnessed it. The System bows.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Swear, planning to break it', sub: 'the long game', do: { prize: true, note: 'You swear with a plan to break it later. The System hears the plan inside the oath. It is delighted. It is also keeping score.' }, next: 'WIN' },
          { label: 'Break an oath on camera', sub: 'no one is bound', do: { dmg: [20, 35], trauma: 10, note: 'You speak the breaking words. The bracelets flare. The binding does not do trials.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- BEASTMASTER (bespoke, weird/high) ---
  G._contestBeastmaster = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { beat: 'contestBeastmasterDeclare', text: intro + `\n\nA wave-2 beast in a light-collar, pacing. The course: rings of fire, a balance beam over spikes, a tunnel.\n\nThe System: "RIDE. GUIDE. DO NOT HURT IT. IT REMEMBERS."`,
        choices: [
          { label: 'Mount gently', sub: 'trust', do: { note: 'You mount like it\'s a horse that could kill you. It could. It notices the respect.' }, next: 1 },
          { label: 'Mount fast', sub: 'dominance', do: { dmg: [4, 10], note: 'You swing up hard and grab the collar. It snarls. The crowd oohs. Respect: not earned.' }, next: 1 },
          { label: 'Befriend it first', sub: 'slow', do: { note: 'You offer your hand. It smells you for a long moment — then huffs, and kneels. The audience melts.' }, next: 1 },
        ] },
      { beat: 'contestBeastmasterEscalate', text: `The rings of fire. The beast hates them — you can feel it coiling under you.\n\nThe beam over the spikes is next. It is watching you for cues.`,
        choices: [
          { label: 'Guide with knees', sub: 'partnership', do: { note: 'Knees, weight, breath. You ask; it answers. The rings pass in a blur of heat.' }, next: 2 },
          { label: 'Yank the collar', sub: 'force', do: { dmg: [10, 20], note: 'You yank. It yelps — and its eyes change. It remembers. The System leans forward.' }, next: 2 },
          { label: 'Let it choose the line', sub: 'trust', do: { dmg: [4, 12], note: 'You loosen the reins and trust it. It picks a line through the fire you\'d never have dared. It was right.' }, next: 2 },
        ] },
      { beat: 'contestBeastmasterClimax', text: `Last obstacle: the tunnel — dark, narrow, and it smells like the Maw.\n\nThe beast balks. This is the moment the whole contest turns on.`,
        choices: [
          { label: 'Dismount and lead it through', sub: 'walk together', do: { prize: true, note: 'You slide off and walk beside it, hand on its neck. Together, into the dark. Together, out. The crowd is on its feet.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Push for the flourish', sub: 'jump the tunnel', do: { prize: true, dmg: [16, 30], note: 'You ask for the impossible jump. It gathers — and FLIES. Or it doesn\'t. The crowd holds one breath.' }, next: 'WIN' },
          { label: 'Force it in', sub: 'cruel', do: { dmg: [20, 38], note: 'You drive it into the dark. It goes — and turns, in the dark, where the cameras can\'t quite see. You hear it decide.' }, next: 'LOSE' },
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
      { beat: 'contestRiddleDeclare', text: intro + `\n\nA lattice of mouths hangs in the air, opening and closing out of sync. The Engine doesn't want your blood. It wants the summer you turned nine.\n\nRiddle one, in a voice like a choir warming up: "The more of me you take, the more you leave behind. What am I?"`,
        choices: [
          { label: 'Answer: footsteps', sub: 'steady', do: { note: 'You say it steady. The mouths ripple — correct. The Engine is disappointed and impressed.' }, next: 1 },
          { label: 'Ask the audience', sub: 'crowd work', do: { note: 'The chat screams answers, half of them wrong on purpose. You pick the loudest. It\'s right. Probably.', notability: 'showmanship' }, next: 1 },
          { label: 'Refuse to answer', sub: 'silence', do: { trauma: 8, note: 'You stay silent. The Engine takes a memory as payment anyway — the summer you turned nine. You remember remembering it. The shape is gone.' }, next: 1 },
        ] },
      { beat: 'contestRiddleEscalate', text: `Riddle two. The Engine has been reading you between questions.\n\nIt asks about the dog. You never told it about the dog.`,
        choices: [
          { label: 'Answer as the kid you were', sub: 'the childhood truth', do: { note: 'You answer as the child, not the adult. The Engine recoils — the childhood truth is the one thing it can\'t parse.' }, next: 2 },
          { label: 'Lie to the Engine', sub: 'gamble', do: { trauma: 12, note: 'You lie. The mouths smile — all of them, at once. It knew. It always knew.' }, next: 2 },
          { label: 'Offer it a different memory', sub: 'trade', do: { trauma: 10, note: 'You hand over a Tuesday, voluntarily. The Engine accepts the trade, surprised. Nobody has ever paid willingly.' }, next: 2 },
        ] },
      { beat: 'contestRiddleClimax', text: knows
          ? `The last riddle. The mouths lean close. You know this one now — you've paid for the lesson before: the last riddle is always the one you don't want to answer. Answer it anyway. Truthfully.`
          : `The last riddle. The mouths lean close.\n\nThis one is about you, and you can feel which memory it's reaching for.`,
        choices: [
          { label: 'Answer it truthfully', sub: 'the real thing', do: { prize: true, trauma: 4, note: 'You say the true thing out loud, on camera, to the galaxy. It costs. The Engine goes quiet — sated, or respectful. The mouths close, one by one.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Ask IT a riddle', sub: 'turn the tables', do: { prize: true, note: 'You ask the Engine one back. It has never been asked. The lattice freezes — every mouth open, nothing coming out. Then, slowly: delight.', notability: 'contestWin' }, next: 'WIN' },
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
      { beat: 'contestConfessionDeclare', text: intro + `\n\n${cname} stands under the lights. The confession, read flat: "I poisoned the water store."\n\nThe System, almost gentle: "PROVE IT TRUE OR FALSE BEFORE DUSK, INVESTIGATOR. WE PUNISH SOMEONE EITHER WAY."`,
        choices: [
          { label: 'Study the confessor', sub: 'read them', do: { note: `You study ${cname}. The hands are steady. Too steady. Performed calm.` }, next: 1 },
          { label: 'Ask who benefits', sub: 'motive', do: { note: 'You ask who benefits from poisoned water. The village shifts. Nobody meets your eyes. Everybody benefits from something.' }, next: 1 },
          { label: 'Watch the village', sub: 'not the confessor', do: { note: 'You watch the crowd instead of the accused. Faces tell you more than confessions — and one face in the back is doing arithmetic.' }, next: 1 },
        ] },
      { beat: 'contestConfessionEscalate', text: (knows
          ? `📚 You've seen a false confession before. The confessor keeps glancing at the same person in the crowd — guilt looks at who it's protecting.\n\n`
          : ``) + `You press. The story wobbles — the poison, the hour, the hands. Real guilt is consistent. This isn't.\n\n${cname} won't stop looking at the back row.`,
        choices: [
          { label: 'Press the details', sub: 'the wobble', do: { note: 'You press on the details and the details fall apart. The time is wrong. The method is wrong. The grief, though — the grief is real.' }, next: 2 },
          { label: 'Ask about the hands', sub: 'the evidence', do: { note: '"Show me your hands." Clean. Too clean. Someone scrubbed this confession until it shone.' }, next: 2 },
          { label: 'Let them talk', sub: 'the ramble', do: { note: 'You let them ramble. Liars over-explain. The innocent get annoyed. This one is performing grief for someone else\'s crime.' }, next: 2 },
        ] },
      { beat: 'contestConfessionClimax', text: `Dusk is coming. The System waits with the patience of weather.\n\nThe verdict is yours. The consequences are everyone's.`,
        choices: [
          { label: 'Name the real culprit', sub: 'the truth, whoever it hurts', do: { prize: true, fracture: 1, note: 'You name the real one — someone the village loves. The crowd goes silent. You were right. The village doesn\'t thank you.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Confirm the confession', sub: 'take the easy verdict', do: { trauma: 10, fracture: 2, note: `You confirm it. The System takes ${cname}. Later the water tests come back clean — there was never any poison. The village will remember what you did.` }, next: 'LOSE' },
          { label: 'Accuse the System', sub: 'on its own cameras', do: { prize: true, note: `You point at the cameras. "You wrote this confession." The System goes very still. ${cname} is released in the silence. Nobody has ever said it out loud before.` }, next: 'WIN' },
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
      { beat: 'contestHoneyDeclare', text: intro + `\n\nThe hive hangs in the arena like a second moon, humming. The swarm moves as one body and it has opinions.\n\nHarvest the comb. Try to keep your face.`,
        choices: [
          { label: 'Smoke them first', sub: 'the old way', do: { note: 'You work the smoker until the air is grey and sweet. The swarm goes drowsy and forgiving. The old way is the old way for a reason.' }, next: 1 },
          { label: 'Go in fast', sub: 'speed', do: { dmg: [6, 12], note: 'You go in fast. The swarm disagrees with the plan, loudly, all over your arms.' }, next: 1 },
          { label: 'Sing to the swarm', sub: 'bass', do: { note: 'You sing low — the deepest note you have. The swarm settles onto the hum like it\'s furniture. The audience is confused and moved.', notability: 'showmanship' }, next: 1 },
        ] },
      { beat: 'contestHoneyEscalate', text: `You're at the comb. It glows. The queen cell pulses at the heart of it — the prize and the death, side by side.\n\nThe swarm is watching you decide.`,
        choices: [
          { label: 'Cut the edge comb', sub: 'respectful', do: { kcal: 200, note: 'You cut only the edge comb. The swarm tolerates the tax. Respect is a currency they accept.' }, next: 2 },
          { label: 'Cut deep', sub: 'greedy', do: { kcal: 400, dmg: [8, 16], note: 'You cut deep. The comb is heavy and golden. The swarm revises its opinion of you.' }, next: 2 },
          { label: 'Rob the queen cell', sub: 'the prize and the death', do: { kcal: 600, dmg: [16, 28], note: 'You take the queen cell. The hive SCREAMS — one voice, ten thousand throats. You will never be welcome here again.' }, next: 2 },
        ] },
      { beat: 'contestHoneyClimax', text: `The comb is in your hands. The swarm is in the air.\n\nNow: the getaway.`,
        choices: [
          { label: 'Run with the comb', sub: 'speed', do: { prize: true, dmg: [10, 18], note: 'You RUN. The swarm follows like weather. You make the gate with the comb and most of your skin.', notability: 'contestWin' }, next: 'WIN' },
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
      { beat: 'contestSecretsDeclare', text: intro + `\n\nThe dealer fans the deck. Every card has a face on it — someone watching. The System, dealing: "ANTE UP, CONTESTANT. THE CURRENCY IS TRUTH."\n\nFirst card's coming. Someone in the front row just went pale.`,
        choices: [
          { label: 'Draw', sub: 'play', do: { note: "First card: someone in the village has been lying about their age. The cameras find them. They smile like it's fine. It is not fine." }, next: 1 },
          { label: 'Fold now', sub: 'keep the peace', do: { note: 'You fold before the first card. The secrets stay buried. The village exhales as one. The System looks... disappointed in the ratings.' }, next: 'LOSE' },
          { label: 'Raise the stakes', sub: 'double or nothing', do: { note: 'Double or nothing. Two secrets per card. The village goes very quiet. The dealer smiles with all its faces.', notability: 'showmanship' }, next: 1 },
        ] },
      { beat: 'contestSecretsEscalate', text: `The turn. The pot is secrets and it's getting deep.\n\nThe dealer's faces are all watching you. So is everyone you know.`,
        choices: [
          { label: 'Call', sub: 'steady', do: { note: 'You call. Second card: two villagers have been meeting at night. The cameras find the clearing. The village does the math before the cameras do.' }, next: 2 },
          { label: 'Bluff the System', sub: 'audacity', do: { note: 'You bluff the house. The dealer tilts its head. It has never been bluffed. It is delighted. It is also keeping score.', notability: 'showmanship' }, next: 2 },
          { label: 'Peek at the deck', sub: 'cheat', do: { trauma: 4, note: 'You peek. The System catches you — and shows the whole village what you saw. Now everyone knows you cheat. The cards know too.' }, next: 2 },
        ] },
      { beat: 'contestSecretsClimax', text: `The river. Last card. The deck is warm in the dealer's hands, like it's alive.\n\nWhatever you do next, the village will remember what you traded.`,
        choices: [
          { label: 'Show your hand', sub: 'win, whatever it costs', do: { prize: true, fracture: 1, note: 'You win. Three secrets aired to the galaxy. The prize is real. So is the silence at dinner.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Fold at the river', sub: 'with the winning hand', do: { note: 'You fold holding the winner. Nobody will ever know. That\'s the point. The village never finds out what you saved them from.' }, next: 'LOSE' },
          { label: 'Call the deck rigged', sub: 'on camera', do: { trauma: 8, note: 'You call the System a cheat, on camera. The deck reshuffles itself, offended. The dealer\'s faces stop smiling, one by one.' }, next: 'LOSE' },
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
      ? { beat: 'contestQuietClimax', text: `It keeps reaching. You know its tells now — the pause before the buried one, the way the hum rises.\n\nThe decoy is holding. Barely. It knows there's something underneath the turnips.`,
          choices: [
            { label: 'Hold the turnips to the end', sub: 'dullness as armor', do: { prize: true, note: 'TURNIPS. SOIL. PLANTING DEPTH. ROW SPACING. You broadcast agricultural trivia at maximum inner volume for the rest of the hour. The System slows... confused. The galaxy is howling. The village is weeping with laughter.', notability: 'showmanship' }, next: 'WIN' },
            { label: 'Offer it the small shame freely', sub: 'honesty, on purpose', do: { prize: true, trauma: 4, unity: 1, note: 'You stop defending and hand it the small, human shame — the petty one, the one everybody has. The village hears it... and laughs WITH you. The relief is a physical thing. The System bows: "THANK YOU FOR THE TRUTH."', notability: 'contestWin' }, next: 'WIN' },
            { label: 'Clamp down at the last second', sub: 'panic', do: { trauma: 12, fracture: 1, note: 'You know better. You do it anyway — clamp down on the real thought, the one about the System itself. It notices the clamping. It goes deeper. It reads it anyway, LOUDER, to everyone.' }, next: 'LOSE' },
          ] }
      : { beat: 'contestQuietClimax', text: `It's past the surface now. Past the rehearsals. It's reaching for the thing you didn't prepare for.\n\nWhatever it finds next, the whole village hears.`,
          choices: [
            { label: 'Take it', sub: 'whatever it is', do: { prize: true, trauma: 8, fracture: 1, note: 'It reads the real one — the food you set aside for yourself, from the communal pot, all winter. The village goes silent. The System rewards the honesty with a prize. The village is colder. Both things are true.', notability: 'contestWin' }, next: 'WIN' },
            { label: 'Beg it to stop', sub: 'on camera', do: { trauma: 6, note: 'You beg, out loud, on every screen in the galaxy. It pauses — curious, not kind — and moves on to something smaller. The clip of you begging will outlive you.', notability: 'showmanship' }, next: 'LOSE' },
            { label: 'Resist', sub: 'fight the room', do: { trauma: 12, fracture: 1, note: 'You fight the room itself. The room wins. It takes the buried thought and reads it twice, in case anyone missed it the first time.' }, next: 'LOSE' },
          ] };
    return [
      { beat: 'contestQuietDeclare', text: intro + `\n\nA white room. One chair. No camera you can see — the room IS the camera.\n\nThe System, soft: "SIT. THINK. WE WILL READ ALOUD. ONE HOUR."`,
        choices: [
          { label: 'Prepare a decoy', sub: knows ? 'think of turnips' : 'a dull, dull thought', do: { note: knows ? 'You pick the most boring thought you own and rehearse it. Turnips. Soil. Turnips again. You are ready to be profoundly dull.' : 'You pick a dull thought and rehearse it — something grey and uninteresting. You are ready to be profoundly boring.' }, next: 1 },
          { label: 'Empty your mind', sub: 'meditate', do: { trauma: 3, note: 'You breathe it all out — the fear, the plans, the names. The room hums, disappointed in advance.' }, next: 1 },
          { label: 'Own it', sub: 'let it come', do: { note: 'No tricks. Whatever it finds, it finds. Your jaw is set. The audience leans in — honesty is rare television.' }, next: 1 },
        ] },
      { beat: 'contestQuietEscalate', text: `The silence deepens. It starts reading — your voice, speaking your thoughts a half-second before you think them.\n\nThe village hears the rehearsal thoughts first. Then it starts reaching deeper.` + p1rule,
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
      { beat: 'contestGuestDeclare', text: intro + `\n\nA ship the size of weather settles over the haven. Out steps the ambassador: too many limbs, impeccable manners, and a retinue of cameras.\n\nIt is coming to DINNER. At your table. Tonight.` + palate,
        choices: [
          { label: 'Serve your best stew', sub: 'looks delicious', do: { note: 'Your finest stew, the good bowls, the good spoons. It looks like a feast. The ambassador regards it the way you\'d regard a dare.' }, next: 1 },
          { label: 'Serve the bitter roots', sub: knows ? 'you know its palate' : 'an ugly, bitter bowl', do: { note: knows ? 'Bitter roots, fermented stores, the ugly honest food. You serve it like it\'s the crown jewels. The ambassador\'s limbs still — interest.' : 'You serve a bowl of bitter roots and fermented mash. It is not pretty. The village winces. The ambassador leans in.' }, next: 1 },
          { label: 'Let the village cook decide', sub: 'many hands', do: { unity: 1, note: 'You open the kitchen to the whole village. Three generations argue about the menu. The ambassador watches the argument with something like delight. Families, it seems, are interesting everywhere.' }, next: 1 },
        ] },
      { beat: 'contestGuestEscalate', text: `The meal is served. The ambassador lifts the bowl with two limbs at once — and extends a third toward you.\n\nNobody knows what the gesture means. The village is screaming advice at the screen. You have to pick.${knows ? '\n\n📚 Mirror it exactly. Imitation reads as respect, not mockery — you learned that the hard way last time.' : ''}`,
        choices: [
          { label: 'Shake it', sub: 'human custom', do: { trauma: 4, note: 'You shake the limb firmly, like a business deal. The limb goes rigid. The retinue inhales. Wrong custom. The ambassador withdraws the limb slowly, re-evaluating your entire species.' }, next: 2 },
          { label: 'Bow low', sub: 'respectful', do: { note: 'You bow, deep and sincere. Safe. The ambassador inclines — something — back. Respect is never wrong, but it\'s never interesting either.' }, next: 2 },
          { label: 'Mirror it exactly', sub: knows ? 'you know this one' : 'a guess', do: { unity: 1, note: 'You extend the same limb, the same angle, the same stillness. The ambassador freezes — then ripples with what the subtitles translate as delight. "THE HUMAN LEARNS," it announces. The village erupts.', notability: 'showmanship' }, next: 2 },
        ] },
      { beat: 'contestGuestClimax', text: `The toast. The ambassador rises — which takes a while — and lifts its cup.\n\nWhatever happens now, the whole village tells this story for years. The galaxy too.`,
        choices: [
          { label: 'Toast the village', sub: 'heart', do: { prize: true, unity: 1, note: 'You toast your people — by name, the living and the gone. The ambassador listens to every name. "INTERESTING," it pronounces, and the word lands like a benediction. The village will dine out on this for a decade.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Toast the System', sub: 'flattery', do: { fracture: 1, note: 'You toast the System\'s wisdom. The ambassador tilts — flattery, it seems, translates as flattery everywhere, and it finds it suspicious. The village hears you suck up on camera. Dinner is awkward after that.' }, next: 'LOSE' },
          { label: 'Offer it your pack', sub: 'generosity', do: { prize: true, kcal: -200, note: 'You offer it your pack — everything you carry. The ambassador takes one dried root, holds it up to seventeen cameras, and eats it thoughtfully. "THE HUMAN SHARES," it says. The galaxy awws. Your pack is lighter. Your name is heavier.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Insult it back', sub: 'when it insults the food', do: { trauma: 8, fracture: 1, note: 'It calls your stew "adequate." Something snaps. You tell an alien ambassador exactly what you think of its table manners, on camera. The bodyguards move. The village will talk about your funeral for years.' }, next: 'LOSE' },
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
      { beat: 'contestVigilDeclare', text: intro + `\n\nNight. The haven wall. One lamp, lit. Below in the dark, something large is circling — you can see the grass move where it passes.\n\nThe System: "HOLD UNTIL DAWN. DO NOT ABANDON THE LIGHT."` + circle,
        choices: [
          { label: 'Check the lamp', sub: 'tend the flame', do: { note: 'You trim the wick, shield the flame, feed it oil. The light steadies — a small sun on the wall. Below, the circling pauses, considering.' }, next: 1 },
          { label: 'Memorize the dark', sub: 'learn the circle', do: { note: 'You stop watching the lamp and learn the dark instead: the rhythm of the circle, the pauses, the places it looks up. Knowledge is a kind of company.' }, next: 1 },
          { label: 'Count your breaths', sub: 'steel yourself', do: { trauma: -3, note: 'In, out. In, out. You make your breathing the only clock that matters. The night gets smaller. You get larger.' }, next: 1 },
        ] },
      { beat: 'contestVigilEscalate', text: `The circling tightens. The lamp flame leans away from the dark like it's afraid.\n\nIt's close enough now that you can hear it breathing — slow, patient, interested in the light.`,
        choices: [
          { label: 'Hold still and watch', sub: 'do your job', do: { kcal: -150, note: 'You stand your post. You watch. The thing circles, and circles, and does not come closer — the light holds it the way a wall holds weather.' }, next: 2 },
          { label: 'Sound the alarm', sub: 'wake the village', do: { trauma: 4, fracture: 1, note: 'You ring the bell. The village pours out armed and terrified — at nothing. The dark is empty. The thing, if it was ever there, is gone. They look at you. Dawn will be a long time coming.', notability: 'showmanship' }, next: 'LOSE' },
          { label: 'Call down to it', sub: 'desperate', do: { trauma: 8, note: '"I SEE YOU," you shout into the dark. The circling stops. The silence that follows is worse. Then, from below, something almost like an answer.' }, next: 2 },
        ] },
      { beat: 'contestVigilClimax', text: `Dawn. Grey light on the wall, the lamp burned low. The thing is gone — withdrawn with the dark, or never there at all.\n\nThe village is waking. They'll ask how the night went.`,
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
          { label: 'Run it', sub: 'lungs vs rotors', do: { dmg: [4, 10], note: 'You RUN with the winter store on your back. The drone gives chase. Your lungs against its rotors, the dark against its light. You make the treeline.' }, next: 2 },
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
          { label: 'Everything on the table', sub: 'all of it', do: { dmg: [6, 14], prize: true, note: 'You shove it all in. The dice hang in the air for a year. They land. Vex stares. The crowd detonates like weather.', notability: 'contestWin' }, next: 'WIN' },
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
          { label: 'Volunteer', sub: 'take the price', do: { dmg: [20, 30], trauma: 10, note: 'You step forward. "Me." The silence is total. The System tilts its head — it did not expect the price to walk up willingly.', notability: 'sacrifice' }, next: 1 },
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
          { label: 'Take it, if chosen', sub: 'with dignity', do: { prize: true, dmg: [25, 40], trauma: 15, note: 'Your name is called. You stand. You walk to the light with your head up. The village weeps. The System gets its season. You get... the prize. If you survive it.', notability: 'sacrifice' }, next: 'WIN' },
          { label: 'Refuse, if chosen', sub: 'defy the vote', do: { dmg: [30, 45], fracture: 5, note: '"No." The word hangs in the air. The System goes very still. Refusing the village\'s choice AND the System\'s price — the cameras have never seen this. Nobody has.', notability: 'defiant' }, next: 'LOSE' },
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
          { label: 'Double down', sub: 'more, stranger', do: { dmg: [0, 8], note: 'You go deeper, stranger, more human. The aliens recoil — then lean back in. They are not bored. They have never been so un-bored. One of them is... crying? The translators confirm: crying. New emotion logged.' }, next: 2 },
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
          { label: 'Push past pain', sub: 'everything', do: { dmg: [12, 24], kcal: -400, note: 'You push past everything. Lungs, legs, the voice saying stop. You gain ground. The Gray Hollow runner glances back — worried, for the first time.' }, next: 2 },
          { label: 'Run smart', sub: 'pace and lines', do: { dmg: [6, 12], kcal: -200, note: 'You run the smart lines, cut the corners, save the burst. The gap holds. Patience is its own speed.' }, next: 2 },
          { label: 'Take the shortcut', sub: 'through the nest', do: { dmg: [10, 22], note: 'There\'s a shortcut. Through the nest. Everyone knows. Nobody takes it. You take it. The things in the nest notice. They let you pass — this once, for the cameras.', notability: 'daredevil' }, next: 2 },
        ] },
      { beat: 'contestExchange',
        text: `Final leg. Neck and neck. The finish is a lit gate and both villages are at the barriers, screaming.\n\nThis is the part they\'ll replay for years.`,
        choices: [
          { label: 'Sprint it', sub: 'all or nothing', do: { prize: true, dmg: [15, 30], kcal: -500, note: 'You sprint like the world is ending. It isn\'t, but the season\'s food might as well be. You cross first by a breath. Your village ERUPTS.', notability: 'contestWin' }, next: 'WIN' },
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
          { label: 'Bluff', sub: 'bid what you don\'t have', do: { note: 'You bid big on nothing — pure bluff. The auctioneer pauses. It scans you. It KNOWS. But the rules say a bid is a bid. The crowd holds its breath.', notability: 'showmanship' }, next: 2 },
          { label: 'Hold', sub: 'let them burn out', do: { note: 'You hold. Let the others burn their lives away. Patience at an auction is its own kind of wealth. The lots are still there. So are you.' }, next: 2 },
        ] },
      { beat: 'contestAuction',
        text: `Final lot. The hammer is raised. Everything bid so far is already gone — paid, taken, consumed.\n\nThis is the last chance. The tech on the block could change your village\'s winter.`,
        choices: [
          { label: 'Everything', sub: 'win at any cost', do: { prize: true, dmg: [10, 20], trauma: 10, note: 'You bid everything — the rest of the memories, the years, the parts. The hammer falls. YOURS. The tech is extraordinary. You are... less. But the village eats this winter.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'The smart bid', sub: 'just enough', do: { prize: true, trauma: 4, note: 'You bid exactly enough — not a memory more. The hammer falls. Yours. The crowd respects the precision. The auctioneer respects it too, which is rarer.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Walk away', sub: 'keep yourself', do: { note: 'You walk away. Keep the memories, the years, the fingers. The lots go to others. You are whole. The village will remember what you wouldn\'t pay — and what that cost them.', notability: 'principled' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- THE IRON PANTRY (bespoke, puzzle/high) ---
  // CONTEST-POOL EXPANSION 3 (Steve 2026-10-05): tension-and-listening, not
  // folding (box), not Q&A (riddle), not triage (sorting). Five tumblers
  // that set in WEIGHT order — heavy to light, never 1-2-3. Knowledge-gated:
  // veterans know the order; first-timers only know to listen. Force jams
  // the lock and the whole contest becomes about the jam. The fear isn't the
  // puzzle — it's the village watching you starve politely through glass.
  G._contestLockpick = function(contest) {
    const intro = this._cxIntro(contest);
    const knows = this.contestKnowledge('lockpick').level >= 2;
    const rule = knows
      ? `\n\n📚 What the last lock taught you: the tumblers set in WEIGHT order — heavy to light, never 1-2-3. Listen for the weight. Force one and the whole lock eats the attempt.`
      : `\n\nThe veterans who've picked one before won't say the order. "You'll hear it," they say. "Or you'll jam it, and then you'll hear THAT."`;
    return [
      { beat: 'contestLock',
        text: intro + `\n\nA vault door the size of weather. Behind a glass panel: a full pantry — grain, smoked meat, winter itself, stacked and lit like a museum.\n\nFive tumblers. One hour of air in the anteroom. The System, almost gentle: "PICK IT. EAT. THE CAMERAS LOVE HUNGER."` + rule,
        choices: [
          { label: 'Press your ear to the door', sub: 'listen first', do: { note: 'You press your ear to the cold metal and work the first tumbler with a wire. Click. Heavy. Then click. Lighter. The lock is telling you something — if you listen the way it wants to be heard.' }, next: 1 },
          { label: 'Try 1-2-3-4-5', sub: 'the rookie sequence', do: { dmg: [4, 10], note: 'One, two — the tumblers turn easily. Three — resistance. Four — a grinding you feel in your teeth. The lock goes sullen. It remembers attempts.' }, next: 1 },
          { label: 'Oil the mechanism', sub: 'slow and kind', do: { kcal: -100, note: 'You work oil into the mechanism from your kit, slow as weather. The tumblers turn sweeter. The audience boos — slow is excruciating. The lock, though. The lock likes it.' }, next: 1 },
        ] },
      { beat: 'contestLock',
        text: `Three tumblers set. Two to go. The heavy ones are down — the remaining two feel light as breath, and light is harder.\n\nThe hour is half gone. The pantry glows through the glass. The village can smell it, which is the whole point of the glass.`,
        choices: [
          { label: 'Trust the weight order', sub: 'heavy to light', do: { note: 'Heavy to light. You set the fourth tumbler by feel — it seats with a click like a promise kept. The fifth turns. The door breathes.' }, next: 2 },
          { label: 'Rush the last two', sub: 'force it', do: { dmg: [6, 14], note: 'You rush. The fourth tumbler turns — then the lock BITES. Something inside shifts wrong. The door doesn\'t open, but it doesn\'t mock you either. It waits. You have one attempt left before the mechanism seizes.' }, next: 2 },
          { label: 'Back off and re-listen', sub: 'start the weight again', do: { note: 'You back off, breathe, and start the listening all over. The audience groans. The tumblers don\'t care about the audience. They turn. They turn true.' }, next: 2 },
        ] },
      { beat: 'contestLock',
        text: `One tumbler left. Or one jam left — it depends on how the last hour went.\n\nThe pantry is a painting of food behind glass. The village is very quiet.`,
        choices: [
          { label: 'Set the last tumbler', sub: 'gentle, by weight', do: { prize: true, kcal: 400, note: 'You set it — gentle, by weight, the way the lock asked to be heard. The vault door swings open. The village EATS tonight. The cameras catch someone crying into a grain sack. Good television. Better dinner.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Force the door', sub: 'break it open', do: { prize: true, dmg: [10, 20], note: 'You stop picking and start breaking. The lock fights, then — grudgingly, screaming — yields. The door hangs crooked. The pantry is open. Ugly. Effective. Edible.' }, next: 'WIN' },
          { label: 'Walk away from the lock', sub: 'the glass stays closed', do: { trauma: 6, note: 'You step back from the door. The pantry stays behind glass, glowing, uneaten. The village watches the food it can\'t have. The System files the footage under: restraint, rare.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- THE WRONG MAP (bespoke, puzzle/medium) ---
  // CONTEST-POOL EXPANSION 3 (Steve 2026-10-05): terrain-truth, not Q&A
  // (riddle) and not conveyor triage (sorting). The System hands you a map
  // with exactly one lie in it — and it always lies about WATER. It draws
  // rivers where the ground is dry. Knowledge-gated: veterans know to
  // distrust the blue; first-timers have to find the contradiction by
  // walking. The skilled play is boots, not ink. The fear: digging at the
  // X in front of the whole valley and finding nothing.
  G._contestWrongmap = function(contest) {
    const intro = this._cxIntro(contest);
    const knows = this.contestKnowledge('wrongmap').level >= 2;
    const rule = knows
      ? `\n\n📚 What the last map taught you: the System always lies about WATER. It draws rivers where the ground is dry. Trust the terrain, not the ink.`
      : `\n\nThe veterans who've read its maps before just say "don't trust the blue." They won't say why.`;
    let partner = 'the other contestant';
    try {
      const r = (this.state.village.roster || []).find(id => id !== this.villagerId && this.isMember(id));
      if (r) partner = this.displayName(r);
    } catch (e) {}
    return [
      { beat: 'contestMap',
        text: intro + `\n\nA map of the valley, drawn in alien ink that moves when you aren't looking. Buried alien rations, marked with an X. Exactly one thing on the map is a lie.\n\nYou and ${partner} have until the light goes.` + rule,
        choices: [
          { label: 'Study the map', sub: 'read it close', do: { note: 'You study it until the ink stops moving. The ridge lines check out. The treeline checks out. The river... the river runs through a valley you KNOW is dry. Or the map knows something you don\'t.' }, next: 1 },
          { label: 'Walk the terrain first', sub: 'boots, not ink', do: { note: 'You walk. The ridge is where the map says. The treeline is where the map says. You reach the river\'s supposed bank and find dust. Dust, and old shell beds. This river has been dead for years.' }, next: 1 },
          { label: 'Ask what they see', sub: 'two pairs of eyes', do: { note: `${partner} points at the X. "It\'s too clean," they say. "Everything else on this map is a little wrong. The X is perfect. Nobody\'s perfect on purpose."` }, next: 1 },
        ] },
      { beat: 'contestMap',
        text: `The contradiction, found: the river is the lie. It's been dry for years — the map drew it wet anyway.\n\nSo where's the X? If the river's wrong, the X measured FROM the river is wrong too. The real site is somewhere along the dry bed, offset by the lie.`,
        choices: [
          { label: 'Dig where the water isn\'t', sub: 'offset from the lie', do: { kcal: 200, note: 'You pace the dry bed off from the false river and dig where the X WOULD be if the map told the truth about water. Your shovel hits metal on the third hole. The camera drone drops ten feet for the close-up.' }, next: 2 },
          { label: 'Dig at the X', sub: 'trust the ink', do: { trauma: 4, note: 'You dig at the X. Dust. More dust. The light is going and the hole is empty — the lie was the whole map. The System calls it, very politely. The whole valley watched you dig at a rumor.' }, next: 'LOSE' },
          { label: 'Split up the dry bed', sub: 'cover the offset', do: { note: `You and ${partner} split the dry bed into grids and work them fast. Two shovels, one truth. ${partner} whoops from the far grid — metal on metal.` }, next: 2 },
        ] },
      { beat: 'contestMap',
        text: `The cache is up — alien ration tins, sealed, stamped with a date from before the scattering.\n\nOne tin for the finding. The rest for whoever the System says the rest is for.`,
        choices: [
          { label: 'Open it for the village', sub: 'the find feeds everyone', do: { prize: true, unity: 1, kcal: 300, note: 'You crack the cache for the village. Ration tins, real food, on camera. The lie on the map doesn\'t matter anymore — the truth in the ground does.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Split it with your partner', sub: 'finders share', do: { prize: true, kcal: 400, note: `You and ${partner} split it down the middle, finders' share, on camera. The village will hear about this. Some of them will approve. The smart ones will.` }, next: 'WIN' },
          { label: 'Leave it buried', sub: 'the map wins', do: { note: 'You cover it back up. Let the lie keep its rations. You walk away, and the cameras don\'t know what to do with someone who won and refused the prize.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- THE ALIBI CHAIN (bespoke, detective/medium) ---
  // CONTEST-POOL EXPANSION 3 (Steve 2026-10-05): chain-breaking, not
  // liar-hunting (informant) and not accusation (confession). Five
  // villagers, each vouched for by the next, a chain ending at midnight.
  // One link is false. The false link vouches FIRST and LOUDEST — that's
  // the knowledge gate. The fear is social: every link you pull fractures
  // something, and the village has to live with the chain you leave.
  G._contestAlibi = function(contest) {
    const intro = this._cxIntro(contest);
    const knows = this.contestKnowledge('alibi').level >= 2;
    const rule = knows
      ? `\n\n📚 What the last chain taught you: the false link vouches FIRST and LOUDEST. Pull the chain gently — every link you stress fractures something the village has to live with.`
      : `\n\nThe veterans who've broken a chain before won't say how they spot the false link. "You'll hear it," they say. "It's always the loudest one. Or it isn't."`;
    const names = (() => {
      const out = [];
      try {
        const roster = (this.state.village.roster || []).filter(id => id !== this.villagerId && this.isMember(id));
        for (const id of roster) { if (out.length >= 5) break; out.push(this.displayName(id)); }
      } catch (e) {}
      const fb = ['Mara', 'Tove', 'Sef', 'Rill', 'Dun'];
      while (out.length < 5) out.push(fb[out.length]);
      return out;
    })();
    const [n1, n2, n3, n4, n5] = names;
    return [
      { beat: 'contestAlibi',
        text: intro + `\n\nThe chain, read aloud:\n\n${n1} vouches for ${n2}. ${n2} vouches for ${n3}. ${n3} vouches for ${n4}. ${n4} vouches for ${n5}.\n\nOne of those vouches is a lie. The System: "FIND THE FALSE LINK BEFORE MIDNIGHT. THE VILLAGE SLEEPS UNDER WHATEVER YOU LEAVE STANDING."` + rule,
        choices: [
          { label: `Pull the first link: ${n1}`, sub: 'start at the loud end', do: { note: `You pull ${n1} first — the one who vouched loudest and earliest. ${n1} goes very still. "I SAW them," ${n1} says, too fast. The chain rattles.` }, next: 1 },
          { label: `Pull the middle link: ${n3}`, sub: 'the quiet center', do: { note: `You pull ${n3}, the quiet middle. ${n3} looks exhausted, not guilty. "I was asleep," ${n3} says. "Ask the lamp. It was lit. I was awake and then I wasn't." Honest, or well-rehearsed — you can't tell yet.` }, next: 1 },
          { label: 'Watch who vouches loudest', sub: 'before you touch anything', do: { note: `You don't pull anything yet. You watch. ${n1} is already retelling the vouch to anyone who'll listen — louder each time, like volume is evidence. The others are quiet. Quiet people are either innocent or patient.` }, next: 1 },
        ] },
      { beat: 'contestAlibi',
        text: `Midnight is coming. The chain is under tension now — every link you've touched is stressed, and the village can see the stress.\n\n${n1} is still vouching, louder. ${n2} has gone quiet. The false link is in here somewhere, holding the whole thing up.`,
        choices: [
          { label: `Press ${n1}`, sub: 'the loud one', do: { fracture: 1, note: `You press ${n1} on the details — the hour, the lamp, the door. The vouch comes apart like wet paper. ${n1} was never there. The chain was built on a loud voice and nobody checked. The village heard all of it.` }, next: 2 },
          { label: `Follow the timeline`, sub: 'hours, not voices', do: { note: `You stop listening to voices and start checking hours. The lamp was lit at nine. ${n3} says they slept at ten. ${n1}'s vouch covers midnight. The hours don't fit ${n1} at all — the loud link is the false link.` }, next: 2 },
          { label: 'Offer them an out', sub: 'confess quietly', do: { note: `You offer the chain a quiet way out: "If someone was covering for someone, say so now, privately." Silence. Then ${n1}'s voice, smaller: "...I didn't want them in trouble." The chain exhales. The village heard the exhale too.` }, next: 2 },
        ] },
      { beat: 'contestAlibi',
        text: `The false link, found: ${n1}. The vouch was a kindness that became a lie that became a chain.\n\nNow: how you name it, on camera, is the whole rest of the contest.`,
        choices: [
          { label: `Name ${n1}, gently`, sub: 'kindness, televised', do: { prize: true, unity: 1, note: `You name ${n1} gently — a person who lied for someone, not against anyone. The village hears the difference. The chain breaks clean. ${n1} cries. The village holds them anyway.`, notability: 'contestWin' }, next: 'WIN' },
          { label: `Name ${n1}, publicly`, sub: 'the full spotlight', do: { prize: true, fracture: 1, note: `You name ${n1} in the full spotlight, every detail. The village gets its truth and its fracture in the same breath. ${n1} doesn't come to the fire for a week.` }, next: 'WIN' },
          { label: 'Let the chain stand', sub: 'midnight passes', do: { trauma: 4, note: `You let midnight pass. The chain stands — all of it, including the lie. The village sleeps under a false vouch. The System files it under: mercy, expensive.` }, next: 'LOSE' },
        ] },
    ];
  };

  // --- THE ECHO (bespoke, detective/high) ---
  // CONTEST-POOL EXPANSION 3 (Steve 2026-10-05): version-drift, not
  // fabrication-hunt (witness) and not liar-hunting (informant). ONE
  // witness, TWO tellings — dawn and noon — and the details moved between
  // them. The knowledge gate: the noon telling always adds DANGER, bravery
  // for the cameras. The dawn telling is the scared truth. The social fear:
  // accuse a real witness of performing and the village eats them alive;
  // bless the performance and the village arms for a danger that isn't real.
  G._contestEcho = function(contest) {
    const intro = this._cxIntro(contest);
    const knows = this.contestKnowledge('echo').level >= 2;
    const rule = knows
      ? `\n\n📚 What the last echo taught you: the noon telling always adds DANGER — bravery for the cameras. The dawn telling is the scared truth. Believe the scared one.`
      : `\n\nThe veterans who've heard an echo before just say "believe the first one." They won't say why the second one changed.`;
    let wit = 'the witness';
    try {
      const r = (this.state.village.roster || []).find(id => id !== this.villagerId && this.isMember(id));
      if (r) wit = this.displayName(r);
    } catch (e) {}
    return [
      { beat: 'contestEcho',
        text: intro + `\n\n${wit} saw something last night at the far traps. Told it twice.\n\nDAWN: "It was big. I heard it breathing. I hid. I don't know what it was."\n\nNOON: "It was BIG — came right at the traps, I stood my ground, it saw me and turned. I think I scared it."\n\nThe details moved. The cameras were at the noon telling. They were not at the dawn one.` + rule,
        choices: [
          { label: 'Line up the two tellings', sub: 'find what moved', do: { note: 'You line them up word for word. Dawn: hid, didn\'t know. Noon: stood ground, scared it. What moved is the danger — and who was brave inside it. The noon version has an audience. The dawn version has fear.' }, next: 1 },
          { label: 'Ask about the dawn', sub: 'the scared telling', do: { note: `You ask about the dawn — quietly, no cameras. ${wit}'s voice drops. "I hid," they say. "I hid and I was ashamed of hiding, so at noon I..." The sentence trails off. The shame is doing the talking now.` }, next: 1 },
          { label: 'Ask about the noon', sub: 'the brave telling', do: { note: `You ask about the noon version, on camera. ${wit} brightens — performs it again, bigger. The audience loves it. You watch the performance happen in real time and feel a little sick.` }, next: 1 },
        ] },
      { beat: 'contestEcho',
        text: `The village is splitting. Half believes the noon telling — arms for a monster that charged the traps. Half heard the dawn one and is quietly terrified of something that just... breathed, out there, in the dark.\n\nWhat you say next decides which village wakes up tomorrow.`,
        choices: [
          { label: 'Press the added danger', sub: 'name the performance', do: { fracture: 1, note: `You press on the added danger — gently, but on camera. ${wit} breaks a little. "I was ASHAMED," they say. "Of hiding." The village hears it. The performance ends. The shame is real and so is the relief.` }, next: 2 },
          { label: 'Give them a way out', sub: 'private truth', do: { note: `You give ${wit} a private way out: "The dawn one was the true one, wasn't it." A nod. Off camera. You carry the truth back yourself — the witness keeps their dignity, and the village gets the scared, true version.` }, next: 2 },
          { label: 'Let them perform', sub: 'the crowd loves it', do: { trauma: 3, note: `You let the noon telling stand. The crowd loves it. The village arms for a charging monster that never charged anything. Somewhere out there, the real thing — the breathing thing — goes unwatched.` }, next: 2 },
        ] },
      { beat: 'contestEcho',
        text: `The verdict, televised: which telling was true.\n\nThe village waits. ${wit} waits. The cameras wait — they love this part most of all.`,
        choices: [
          { label: 'Say it plainly: the dawn was true', sub: 'believe the scared one', do: { prize: true, unity: 1, note: `You say it plainly: the dawn telling was the true one. ${wit} hid, and was ashamed, and performed bravery for the cameras. The village exhales — the danger was smaller than the performance. ${wit} is forgiven by dinner. Shame is a universal language.`, notability: 'contestWin' }, next: 'WIN' },
          { label: 'Bless the noon telling', sub: 'the brave version wins', do: { fracture: 2, trauma: 4, note: `You bless the noon telling. The village arms for a monster that charged the traps — a monster that doesn't exist. The real thing, the breathing thing, walks the treeline unopposed all week. The cameras got a great show.` }, next: 'LOSE' },
          { label: 'Say both are true enough', sub: 'split the difference', do: { trauma: 2, note: `You split the difference. Both tellings get to live. The village gets half a truth and a whole confusion. The System files it under: diplomacy, televised, useless.` }, next: 'LOSE' },
        ] },
    ];
  };

  // --- THE TIDE CLOCK (bespoke, forage/high) ---
  // CONTEST-POOL EXPANSION 3 (Steve 2026-10-05): an environmental clock,
  // not a race against others (calorie_run), not a raid (pantry_raid), not
  // a harvest (honey), not a heist (cache). The tide returns on a schedule
  // and the causeway drowns. Knowledge-gated: the third gull-cry means
  // turn back — veterans know; first-timers learn it from the water.
  // High risk because the water is honest about what it does to people.
  G._contestTidepool = function(contest) {
    const intro = this._cxIntro(contest);
    const knows = this.contestKnowledge('tidepool').level >= 2;
    const rule = knows
      ? `\n\n📚 What the last tide taught you: third gull-cry, you turn back. No fourth pool is worth the causeway. The deep pools pay double and the tide charges double.`
      : `\n\nThe veterans who've worked a tide before just keep counting gull-cries. They won't say what number they're counting to.`;
    return [
      { beat: 'contestTide',
        text: intro + `\n\nThe tidal pools at the causeway's end — crab, mussel, urchin, a whole drowned pantry, exposed for one low tide.\n\nThe water is already coming back. It does not hurry. It does not need to. You have until the causeway goes under.` + rule,
        choices: [
          { label: 'Work the deep pools', sub: 'rich and risky', do: { kcal: 250, dmg: [4, 12], note: 'You work the deep pools — the rich ones, the far ones. Crab the size of your head. Mussels by the handful. The water is at your ankles. Then your calves. You are getting rich and the tide is getting closer.' }, next: 1 },
          { label: 'Work the shallow pools', sub: 'steady, near the road', do: { kcal: 150, note: 'You work the shallow pools near the causeway — steady, unglamorous, close to the way home. The haul is honest. The water is honest too: it\'s rising.' }, next: 1 },
          { label: 'Set baskets, come back', sub: 'traps do the waiting', do: { kcal: 100, note: 'You set baited baskets in the deep pools and retreat to high ground. Let the traps do the waiting — traps don\'t drown. The cameras find this boring. The tide finds it irrelevant.' }, next: 1 },
        ] },
      { beat: 'contestTide',
        text: `First gull-cry. Then the second. The causeway is wet stone now, the pools merging into one rising sheet.\n\nYour sack is heavy. The deep pools are still giving. The water is at your knees.`,
        choices: [
          { label: 'Push one more pool', sub: 'greed vs water', do: { kcal: 300, dmg: [8, 18], note: 'One more pool. The richest one, of course. You fill the sack to bursting. The water is at your thighs and moving like it has somewhere to be. You have somewhere to be too: OUT.' }, next: 2 },
          { label: 'Start back now', sub: 'the smart money leaves', do: { kcal: 100, note: 'You start back. The smart money leaves before the third cry. Your sack is respectably heavy. The causeway is slick and the current is pulling at your boots, but you are moving toward dinner.' }, next: 2 },
          { label: 'Throw the heavy basket ahead', sub: 'lighten and run', do: { kcal: -150, note: 'You hurl the heaviest basket ahead onto high rock and run light. Half the haul, all of the life. The basket lands. You land right after it. The water takes the causeway behind you like it was always going to.' }, next: 2 },
        ] },
      { beat: 'contestTide',
        text: `THIRD GULL-CRY. The causeway is going under — white water over black stone, the pools gone, the whole flat drowning in real time.\n\nYou are on it. The far side is a long, wet run.`,
        choices: [
          { label: 'Run the causeway', sub: 'faster than the water', do: { prize: true, kcal: 400, dmg: [10, 22], note: 'You RUN. Water to the knees, then the waist, the sack held high like an offering. The far rocks. Your feet find them. You come out of the water hauling dinner for the whole village, soaked to the soul, grinning like a maniac. The crowd detonates.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Wade it, slow and sure', sub: 'the water wins slowly', do: { prize: true, kcal: 200, note: 'You wade — slow, braced, letting the water have its hurry. It takes an hour. It takes half your haul to the current. What arrives is enough. The village eats. You sleep for a day.' }, next: 'WIN' },
          { label: 'Drop the haul and run', sub: 'live, empty-handed', do: { trauma: 5, note: 'You drop the sack and RUN. The water takes the haul — crab, mussel, urchin, all of it, back to the sea. You make the rocks empty-handed and breathing. The cameras respect the choice. The village will eat something else tonight.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- WINDFALL (bespoke, forage/medium) ---
  // CONTEST-POOL EXPANSION 3 (Steve 2026-10-05): preservation triage, not
  // harvest (honey), not a race (calorie_run), not hiding (cache). A storm
  // dropped a fortune and ALL of it is rotting on camera. The clock is
  // spoilage. Knowledge-gated: the rot order — berries first, then meat to
  // smoke, fish to dry, fruit keeps longest. Work the rot order, not the
  // haul order. The skilled play is processing, not gathering.
  G._contestWindfall = function(contest) {
    const intro = this._cxIntro(contest);
    const knows = this.contestKnowledge('windfall').level >= 2;
    const rule = knows
      ? `\n\n📚 What the last windfall taught you: berries rot first — eat them. Meat smokes, fish dries, fruit keeps longest. Work the rot order, not the haul order.`
      : `\n\nThe veterans who've beaten the rot before just mutter "rot order, not haul order." They won't explain what that means until you've lost a haul to it.`;
    return [
      { beat: 'contestWind',
        text: intro + `\n\nThe storm's leavings, spread across the meadow: berry bushes stripped and scattered, a downed deer, a stranded fish haul flopping in a cut-off pool, fruit everywhere.\n\nAll of it is rotting. Right now. On camera. The System, cheerful: "BEAT THE ROT. EAT, DRY, HAUL. THE CLOCK IS SPOILAGE."` + rule,
        choices: [
          { label: 'Eat the berries now', sub: 'rot order first', do: { kcal: 250, note: 'You eat the berries — handfuls of them, right there in the meadow, on camera. They\'re perfect for another hour and gone after that. The audience watches you eat like it\'s a sport. It kind of is.' }, next: 1 },
          { label: 'Smoke the meat', sub: 'the deer won\'t wait', do: { kcal: 150, note: 'You get a smoke fire going under the deer meat fast. Smoke first, questions later. The meat will keep for weeks now. The cameras love the fire — fire is always good television.' }, next: 1 },
          { label: 'Haul everything raw', sub: 'haul order, not rot order', do: { kcal: 300, note: 'You haul it all raw — fast, greedy, impressive. The pile is enormous. The pile is also already softening at the edges. The veterans in the village are wincing.' }, next: 1 },
        ] },
      { beat: 'contestWind',
        text: `The sun climbs. The berries are going. The fish pool is warming — the stranded fish won't survive the afternoon, and neither will their freshness.\n\nThe meadow smells like a decision.`,
        choices: [
          { label: 'Dry the fish', sub: 'salt, sun, speed', do: { kcal: 200, note: 'You gut and split the fish and get them drying in the sun, salted from your kit. Fish dried today feeds the village in deep winter. The rot loses this round.' }, next: 2 },
          { label: 'Keep hauling', sub: 'more pile', do: { kcal: 150, note: 'You keep hauling — more pile, bigger pile. Some of it is turning as you stack it. The audience is doing rot-math in the chat. The chat is right.' }, next: 2 },
          { label: 'Share the method', sub: 'teach on camera', do: { unity: 1, note: 'You narrate the rot order on camera — berries, smoke, dry, fruit last. The other contestants hear it. The village hears it. Knowledge, televised, beats a bigger pile.' }, next: 2 },
        ] },
      { beat: 'contestWind',
        text: `Last light. What's saved is saved; what's rotting is compost with an audience.\n\nThe System tallies: preserved vs lost. The village watches the numbers.`,
        choices: [
          { label: 'Present the preserved haul', sub: 'smoked, dried, kept', do: { prize: true, kcal: 400, note: 'You lay it out: smoked venison, dried fish, the last of the fruit, berries eaten at their peak. The rot got some. The rot did not get the winter. The village eats for weeks because you worked the rot order.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Eat the victory', sub: 'the feast, now', do: { prize: true, kcal: 500, note: 'You call the feast — right there, in the meadow, everything at its peak, the village invited. Some of it won\'t keep. All of it will be remembered. The cameras stay for dessert.' }, next: 'WIN' },
          { label: 'Let the rest rot', sub: 'the pile wins', do: { kcal: -200, trauma: 3, note: 'You let the rest go. The big raw pile slumps in the sun. The cameras got the whole slow disaster. The village will find berries in odd places for weeks — and remember who let the deer turn.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- GENERIC fallback ---
  G._contestGeneric = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { beat: 'contestGenericDeclare', text: intro + `\n\nThe rules are explained. They're complicated. The gist: don't lose.`,
        choices: [
          { label: 'Go all in', sub: 'commit', do: { dmg: [6, 14], note: 'You commit fully. The crowd appreciates commitment.' }, next: 1 },
          { label: 'Play it safe', sub: 'cautious', do: { note: 'You play cautious. Safe doesn\'t win, but it survives.' }, next: 1 },
        ] },
      { beat: 'contestGenericClimax', text: `Midway. The standings are unclear and the System likes it that way.`,
        choices: [
          { label: 'Push hard', sub: 'risk', do: { dmg: [8, 18], prize: true, note: 'You push. It costs. It might pay.' }, next: 'WIN' },
          { label: 'Hold steady', sub: 'safe', do: { note: 'You hold. Steady doesn\'t win headlines.' }, next: 'LOSE' },
        ] },
    ];
  };

  // === CHOICE RESOLUTION ===
  G.contestChoose = function(idx) {
    const ac = this.state.activeContest;
    if (!ac || ac.phase === 'done') return null;
    // ARENA RE-ENTRY (break-it contest 2026-10-09): while the modal is
    // suspended for a real tactical fight, choice input is dead — a
    // double-tap race (or any re-entrant call) used to re-run the arena
    // choice's effects: startCombat fired AGAIN, clobbering
    // state.arenaContest mid-fight (phantom fight), and any grantWeapon on
    // the same choice re-granted. The fight resumes via _contestArenaAfter;
    // nothing else may run until then. Proof: scripts/test-break-contest-20261009.js E1.
    if (ac.arenaSuspended) return { arena: true };
    const phases = ac.phases;
    const phase = phases[ac.phaseIdx || 0];
    if (!phase || !phase.choices || !phase.choices[idx]) return null;
    const choice = phase.choices[idx];
    // MOOT (Steve 2026-10-08): seed rhetorical standing from social capital
    // on the first beat — the argument starts where your reputation does.
    if (phase._mootBase !== undefined && ac.standing === undefined) {
      ac.standing = phase._mootBase;
      ac._mootDemand = phase._mootDemand || 12;
    }
    // MAW (Steve 2026-10-08): the thing starts three lengths behind.
    if (phase._mawDist !== undefined && ac.mawDist === undefined) {
      ac.mawDist = phase._mawDist;
    }
    const s = this.state.scholar;
    const log = [];

    // Apply effects
    const d = choice.do || {};
    // ARENA WEAPON (Steve 2026-10-08): the System's "choose your weapon" is
    // a real grant — a real item, equipped, yours to keep. The System
    // doesn't reclaim props.
    if (d.grantWeapon) {
      try {
        const def = (this.data.items || []).find(i => i.id === d.grantWeapon);
        if (def) {
          const s2 = this.state.scholar;
          s2.inventory = s2.inventory || [];
          const entry = { itemId: def.id, name: def.name, units: 1, unit: 'piece', kg: def.kg || 1 };
          s2.inventory.push(entry);
          s2.equipped = s2.equipped || {};
          s2.equipped.weapon = { itemId: def.id, name: def.name };
          this.sysSay(`📺 You take the ${def.name}. It feels honest. It's yours now.`);
          log.push(`armed: ${def.name}`);
        }
      } catch (e) {}
    }
    // RHETORICAL STANDING (Steve 2026-10-08): moot choices move the needle.
    // Deterministic — the argument is the argument.
    if (typeof d.sway === 'number') {
      ac.standing = (ac.standing || 0) + d.sway;
    }
    // MAW PURSUIT (Steve 2026-10-08): the thing gains or loses ground.
    // Distance 0 = caught. Not a roll — you stopped too many times.
    if (typeof d.mawDist === 'number' && ac.mawDist !== undefined) {
      ac.mawDist += d.mawDist;
      if (ac.mawDist <= 0) {
        this.sysSay('📺 It doesn\'t rush. It just... arrives. The tunnel goes quiet in a new way.');
        return this._contestDie(ac, 'the Maw');
      }
    }
    // ARENA FIGHT (Steve 2026-10-08): contests are played, not RNG. A Blood
    // contest's fight is a REAL tactical fight — the contest modal suspends,
    // the grid becomes the arena, and tbEnd resumes the contest.
    if (d.arena) {
      return this._contestArena(ac, d.arena, log);
    }
    if (d.note) { this.sysSay('📺 ' + d.note); log.push(d.note); }
    if (d.dmg) {
      let amt = d.dmg[0] + Math.floor(Math.random() * (d.dmg[1] - d.dmg[0] + 1));
      // HARDENED (break-it contest 2026-10-09): the variant is announced as
      // worse ("It's worse now") — but no phase builder reads variant, so
      // the paper tiger gets teeth here, at the one choke point every
      // phase's damage flows through. Moot demand already scales via risk.
      if (ac.variant === 'hardened') amt = Math.ceil(amt * 1.25);
      // SHOWS (audit-shows 2026-10-09): TV doesn't kill. Shows are
      // lower-stakes than contests by canon (docs/CONTESTS.md) — a Mouth
      // Race burn leaves you at 1 HP and ends the bit, never a death line.
      if ((ac.kind === 'show' || ac.kind === 'summons') && amt > 0) {
        amt = Math.min(amt, Math.max(0, (s.health || 0) - 1));
      }
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
        // BENEVOLENT LIFELINE (break-it 2026-10-08, real 2026-10-08): the
        // flat death rolls are gone — death comes from real damage. The
        // lifeline now guards the real killing blow: a save converts the
        // death into a loss. The sequence still runs.
        let saved = false;
        try {
          if (typeof this.apContestInterference === 'function') {
            const itf = this.apContestInterference(ac, { forPlayer: true }) || {};
            saved = !!itf.deathSave;
          }
        } catch (e) { saved = false; }
        if (saved) {
          // HONEST (break-it 2026-10-08): the save used to leave you at 0 HP —
          // the next endDay's health<=0 check then killed you anyway ("the
          // night"). A save that doesn't save is a lie. The killing blow
          // missed: you live, barely.
          s.health = Math.max(1, Math.round((this.maxHealth ? this.maxHealth() : 100) * 0.1));
          return this._contestEnd(ac, 'lost', false);
        }
        return this._contestDie(ac, 'The damage was too much.');
      }
    }
    // DEATH ROLLS REMOVED (Steve 2026-10-08): "contests are to be played,
    // not as RNG." The die:/dieWounds flat chances are gone — death comes
    // from real damage (above), real fights (arena), or deterministic
    // pursuit (Maw). No slot machine.
    if (d.heal) {
      s.health = Math.min(this.maxHealth(), (s.health || 0) + d.heal);
      log.push(`+${d.heal} hp`);
    }
    if (d.kcal) {
      // BANK CAP (break-it food r3 2026-10-08): contest prizes are a kcal
      // source like any other — no bypassing the cap (same class as
      // blood_magic's fix). Negative deltas still floor at 0.
      s.kcal = Math.min(this.kcalCap(), Math.max(0, (s.kcal || 0) + d.kcal));
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
    // FAN CLUBS PER LANE (audit-shows 2026-10-09): do.fanLane moves a
    // specific audience club — {lane, n, why} or a bare number (showbiz).
    if (d.fanLane !== undefined && d.fanLane !== null) {
      try {
        const fl = (typeof d.fanLane === 'object') ? d.fanLane : { n: d.fanLane };
        if ((fl.n || 0) && typeof this.apAdjustFavor === 'function') {
          this.apAdjustFavor(fl.n, fl.why || ('show: ' + (ac.showName || ac.showId || 'TV')), fl.lane || 'showbiz');
        }
      } catch (e) {}
    }
    // WATCHER HECKLE (audit-shows 2026-10-09): heckling a villager's show
    // is noticed — it dings their deterministic resolution (read in
    // _showVillagerEnd) and the village remembers the cruelty.
    if (d.heckle) {
      ac.heckle = true;
      log.push('heckled — the cameras noticed');
    }
    // WATCHER AGENCY (Steve 2026-10-06): watcher choices move performance.
    // Cheering is real support — capped, and the cameras notice.
    if (d.cheer) {
      ac.cheer = Math.min(0.15, (ac.cheer || 0) + d.cheer);
      log.push(`cheer +${Math.round(d.cheer * 100)} — they heard you`);
      // DRAMA (Steve 2026-10-07): cheering gets gold sparkles — the audience sees you
      try {
        let integ = 0;
        try { integ = this.systemIntegrationLevel ? this.systemIntegrationLevel() : 0; } catch (e2) {}
        this.drama('contest', { type: 'cheer', integration: integ });
      } catch (e) {}
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
    // SHOWS (audit-shows 2026-10-09): show/summons modals ride the same
    // phase engine but land in _showEnd (fans/shame), never the contest
    // prize/death paths. TV doesn't kill: DIE becomes a bad night.
    const isShowKind = ac.kind === 'show' || ac.kind === 'summons';
    if (next === 'WIN') return isShowKind ? this._showEnd(ac, 'won', d.prize) : this._contestEnd(ac, 'won', d.prize);
    if (next === 'LOSE') return isShowKind ? this._showEnd(ac, 'lost', false) : this._contestEnd(ac, 'lost', false);
    if (next === 'MIXED') return this._showEnd(ac, 'mixed', d.prize);
    if (next === 'SHOW_VILLAGER') return this._showVillagerEnd(ac);
    if (next === 'DIE') return isShowKind ? this._showEnd(ac, 'lost', false) : this._contestDie(ac, choice.label);
    if (next === 'REFUSE') return isShowKind ? this._showEnd(ac, 'refused', false) : this._contestRefuse(ac);
    if (next === 'VERDICT') return this._contestVerdict(ac);
    // MOOT JUDGMENT (Steve 2026-10-08): the argument is scored — standing
    // (social capital + rhetorical choices) vs the System's demand.
    // Deterministic. The case is the case.
    if (next === 'MOOT_JUDGE') {
      const standing = ac.standing || 0;
      const demand = ac._mootDemand || 12;
      this.sysSay(`📺 The jury leans back. The System tallies the attention.`);
      if (standing >= demand) {
        this.sysSay(`📺 Your case held. The applause says so before the System does.`);
        return this._contestEnd(ac, 'won', d.prize);
      }
      this.sysSay(`📺 Your case didn't hold. The silence says so before the System does.`);
      return this._contestEnd(ac, 'lost', false);
    }
    // MAW JUDGMENT (Steve 2026-10-08): if you're still ahead of it when the
    // light comes, you walk out. The cost was the body, not the dice.
    if (next === 'MAW_JUDGE') {
      if ((ac.mawDist || 0) > 0) {
        this.sysSay(`📺 You break into the light. Behind you, the tunnel exhales — disappointed, patient, already waiting for the next one.`);
        return this._contestEnd(ac, 'won', d.prize);
      }
      return this._contestDie(ac, 'the Maw');
    }
    ac.phaseIdx = next;
    const np = phases[next];
    if (!np) return this._contestEnd(ac, 'lost', false);
    this.sysSay('📺 ───');
    const rendered = this._contestRenderPhase(ac, np, next);
    this._cxStorePhase(ac, next, rendered);
    this._cxPhaseSay(rendered.text);
    return { phase: rendered, log };
  };

  // SCALED-AT-RESOLVE (break-it contest 2026-10-09): every end-path refetches
  // the contest from the pool — but the pool copy is the BASE. The hardened
  // variant (announced aloud as "worse") and wave scaling live only in the
  // scaled copy. Re-resolve from ac.variant so what was announced is what's
  // played AND what's resolved: hardened risk reaches the engine in the
  // watched paths, and the name reads "Hardened Pit" at the death line and
  // the winner's call — never a quiet downgrade to "Pit".
  G._cxScaledContest = function(ac) {
    try {
      const base = this.contestPool().find(c => c.id === ac.contestId);
      if (base) return this._contestScaled(base, ac.variant || null);
    } catch (e) {}
    return { name: ac.contestId, id: ac.contestId, risk: 'medium' };
  };

  // ARENA FIGHTS (Steve 2026-10-08): "contests are to be played, not as RNG."
  // A Blood contest's fight is a REAL tactical fight. The contest modal
  // suspends (arenaSuspended — app.js won't render it), the grid becomes the
  // arena, and tbEnd resumes the contest via _contestArenaAfter.
  //
  // spec: { waves: n } — beasts are picked wave-appropriate at fight time.
  G._contestArena = function(ac, spec, log) {
    log = log || [];
    // Belt-and-suspenders with the contestChoose guard above: a direct
    // re-call while suspended must not start a second fight either.
    if (ac.arenaSuspended) return { arena: true, log };
    const n = Math.max(1, Math.min(3, (spec && spec.waves) || 1));
    const wave = this.unlockedWave ? this.unlockedWave() : 1;
    const beasts = [];
    try {
      const pool = this.monsterWavePool ? this.monsterWavePool() : (this.data.monsters || []);
      for (let i = 0; i < n; i++) {
        // Escalate: later waves run hotter. HARDENED (break-it contest
        // 2026-10-09): the announced variant runs one wave hotter — "worse"
        // is real in the arena too.
        const hot = (i > 0 ? 1 : 0) + (ac.variant === 'hardened' ? 1 : 0);
        const cands = pool.filter(m => (m.wave || 1) <= wave + hot);
        const src = cands.length ? cands : pool;
        beasts.push(src[Math.floor(Math.random() * src.length)].id);
      }
    } catch (e) {}
    if (!beasts.length) {
      this.sysSay('📺 The gate rattles... and sticks. The System is mortified. The fight is postponed — you live, for now.');
      return this._contestEnd(ac, 'lost', false);
    }
    this.sysSay('📺 The world goes white for a breath — the System moves you. The grid under your feet is sand and old bone now.');
    this.sysSay(`📺 ${n > 1 ? n + ' gates. ' + n + ' waves.' : 'One gate. One beast.'} The crowd is a held breath.`);
    try { this.audioEvent('contestTaken'); } catch (e) {}
    ac.arenaSuspended = true;
    this.state.arenaContest = { contestId: ac.contestId, waves: beasts, waveIdx: 0 };
    log.push(`arena: ${beasts.length} wave(s)`);
    try {
      this.startCombat(beasts[0]);
    } catch (e) {
      // startCombat throws loudly on unknown ids — fail loudly, unsuspend.
      this.state.arenaContest = null;
      ac.arenaSuspended = false;
      this.sysSay('📺 The beast never comes. The System apologizes with unusual sincerity. The contest is void.');
      return this._contestEnd(ac, 'lost', false);
    }
    return { arena: true, log };
  };

  // tbEnd lands here (game.js hook). The fight was real; so is the outcome.
  G._contestArenaAfter = function(arc, result) {
    const ac = this.state.activeContest;
    if (!ac) return;
    ac.arenaSuspended = false;
    const contest = this._cxScaledContest(ac);
    if (result === 'won') {
      arc.waveIdx++;
      if (arc.waveIdx < arc.waves.length) {
        const wn = arc.waveIdx + 1;
        this.sysSay(`📺 WAVE ${wn}. The gate opens again. What comes out has seen the corpses and learned nothing, which is worse.`);
        ac.arenaSuspended = true;
        this.state.arenaContest = arc;
        try { this.startCombat(arc.waves[arc.waveIdx]); }
        catch (e) {
          this.state.arenaContest = null;
          ac.arenaSuspended = false;
          return this._contestEnd(ac, 'won', true);
        }
        return;
      }
      this.sysSay('📺 Silence — then the weather system. You are still standing.');
      return this._contestEnd(ac, 'won', true);
    }
    if (result === 'lost') {
      // tbEnd already ran playerDeath — the death is processed. Close the
      // show without re-killing: death line, then done.
      this.sysSay(`📺 ${contest.name} — the beast.`);
      try { this.sysSay('📺 ' + this._contestDeathLine(contest, 'the arena', 'You')); } catch (e) {}
      this.sysSay('📺 The Death Reel will be tasteful. It won\'t be.');
      ac.phase = 'done';
      try { this.broadcastEnd(); } catch (e) {} // BROADCAST MODE: the frame always lifts explicitly (Steve 2026-10-09)
    this.state.activeContest = null;
      if (ac.others && ac.others.length) {
        try { this._contestResolveOthers(ac); } catch (e) {}
      }
      return { done: true, outcome: 'died' };
    }
    // fled / routed: you left the arena breathing. The crowd saw.
    this.sysSay('📺 You run. The gate is there and you take it. The crowd\'s disappointment is a physical weight.');
    try { this.addNotability('player', 'showmanship'); } catch (e) {}
    return this._contestEnd(ac, 'lost', false);
  };

  // FAN LANE BY CONTEST (audit-shows 2026-10-09): televised wins move the
  // club that watched them — Blood→fight, Endurance→survival, Moot→social,
  // everything else (Weird/Puzzle/Detective/Forage/Chance)→showbiz.
  G._cxFanLane = function(contest) {
    const cat = (contest && contest.cat) || '';
    if (cat === 'blood') return 'fight';
    if (cat === 'endurance') return 'survival';
    if (cat === 'moot') return 'social';
    return 'showbiz';
  };

  G._contestEnd = function(ac, outcome, prize) {
    const contest = this._cxScaledContest(ac);
    const s = this.state.scholar;
    const isWatch = ac.participant && ac.participant !== 'player';
    const pname = isWatch ? this.displayName(ac.participant) : 'You';
    ac.phase = 'done';
    // RESOLVE AUDIO (Steve 2026-10-08): the contest's resolution beat lands
    // whether it was won, lost, died, or refused.
    try { this._cxBeat(this._cxB(ac.contestId, 'Resolve')); } catch (e) {}
    // AUDIO HYGIENE (break-it audio r4, Steve 2026-10-09): contest beats can
    // start sustained audio (contestTitheEscalate fires 'heartbeat') — no
    // contest-end path stopped it, so it thumped forever after the show.
    try { this.audioEvent('heartbeatStop'); } catch (e) {}
    if (outcome === 'won') {
      // DRAMA (Steve 2026-10-07): winning is a TV moment — confetti + hero card
      try {
        let integ = 0;
        try { integ = this.systemIntegrationLevel ? this.systemIntegrationLevel() : 0; } catch (e2) {}
        this.drama('contest', { type: 'winner', name: pname, integration: integ });
      } catch (e) {}
      // MULTI-TAKE learn pacing (Steve 2026-10-06): only the primary's fate
      // teaches — otherwise one four-person contest would mint a veteran.
      if (!ac._suppressLearn) { try { this.contestLearn(ac.contestId, isWatch ? 'watched' : 'won'); } catch (e) {} }
      if (isWatch) {
        // Villager won — resolve THEIR fate, not the player's
        const multiWin = ac.participants && ac.participants.length > 1;
        this.sysSay(`📺 ${contest.name} — ${pname.toUpperCase()} WIN${multiWin ? '' : 'S'}. The crowd is a weather system.`);
        this.sysSay(`📺 ${pname} is alive. Shaking, grinning, alive. You were there to see it.`);
        this.addNotability(ac.participant, 'contestWin');
        // GOSSIP (Steve 2026-10-08): the village will talk about this win.
        this._cxGossip('won', ac.participant, contest.name);
        // ALIEN PLAYERS (Steve 2026-10-08; lanes audit-shows 2026-10-09): a
        // televised win moves the fan club that watched it (blood→fight,
        // endurance→survival, moot→social, else showbiz).
        try { if (this.apAdjustFavor) this.apAdjustFavor(2, pname + ' won ' + contest.name + ' on camera', this._cxFanLane(contest)); } catch (e) {}
        // Villager gets the prize (not the player) — REAL, not a line: the
        // winner brings home alien rations the whole village feels.
        // (Steve 2026-10-08: "the System's favor (and a story)" was a
        //  placeholder prize.)
        if (prize) {
          try {
            const pday = (this.state.scholar || {}).day || 1;
            const share = { name: "Winner's share (alien rations)", kcalEach: 300, units: 2, spoilDay: pday + 9, safe: true };
            // PANTRY CAP (break-it contest 2026-10-09): the winner's share
            // goes through pantryAdd like every other finished-food grant —
            // the cap is real, and pantryKcal stays in sync. The old direct
            // push bypassed both (silent overfill, stale pantryKcal).
            const canAdd = (typeof this.pantryAdd === 'function');
            const added = canAdd ? this.pantryAdd(share) : false;
            if (added) {
              this.sysSay(`📺 Prize for ${pname}: the winner's share — alien rations for the pantry. The village eats tonight.`);
            } else if (canAdd) {
              this.sysSay(`📺 Prize for ${pname}: the winner's share — alien rations. The pantry is full to bursting, so the village eats them on the spot, laughing.`);
            } else {
              const vv = this.state.village;
              vv.pantry = vv.pantry || [];
              vv.pantry.push(share);
              this.sysSay(`📺 Prize for ${pname}: the winner's share — alien rations for the pantry. The village eats tonight.`);
            }
          } catch (e2) {
            this.sysSay(`📺 Prize for ${pname}: the System's favor (and a story they'll tell forever).`);
          }
        }
      } else {
        this.sysSay(`📺 ${contest.name} — YOU WIN. The crowd is a weather system.`);
        this.addNotability('player', 'contestWin');
        try { this.leadShift('showmanship', 2); } catch (e) {}
        // ALIEN PLAYERS (Steve 2026-10-08; lanes audit-shows 2026-10-09):
        // winning on camera moves the fan club that watched it — the crowd
        // watched, and the crowd has opinions. A televised win can also
        // shake loose a fan care package (rate-limited inside).
        try { if (this.apAdjustFavor) this.apAdjustFavor(4, 'won ' + contest.name + ' on camera', this._cxFanLane(contest)); } catch (e) {}
        try { if (this.apCarePackage) this.apCarePackage(); } catch (e) {}
        if (prize) {
          try {
            // CONTEST PRIZE TABLE (break-it contest 2026-10-09): high risk /
            // high reward, but tier 4 stays gated. The old call mapped
            // monster wave straight onto loot tier ({chance:1, tier:wave}) —
            // the forbidden wave->tier conflation — and handed a GUARANTEED
            // apex-tier item on every wave-4 win (monsters give 12% off an
            // actual apex kill). Now: 60% chance of alien loot, tier capped
            // at 3, and tier 4 only at a low rate for extreme-risk wins at
            // wave 4 — hardest challenges, on their own terms. Hardened
            // wins roll hotter (the audience demanded it).
            const wave = this.unlockedWave();
            const isExtreme = contest.risk === 'extreme';
            let prizeTier = Math.min(3, wave);
            let prizeChance = ac.variant === 'hardened' ? 0.75 : 0.6;
            if (isExtreme && wave >= 4 && Math.random() < 0.25) prizeTier = 4;
            const loot = this.rollAlienLoot({ wave, loot: { chance: prizeChance, tier: prizeTier } });
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
            } else {
              // HONEST (break-it contest 2026-10-09): the prize table can
              // whiff — a win with prize:true must still SAY what happened,
              // never silently pocket the prize.
              this.sysSay('📺 Prize: the System\'s favor (and a story). The vault was feeling shy tonight.');
            }
          } catch (e) { this.sysSay('📺 Prize: the System\'s favor (and a story).'); }
        }
        // FEARED means winning costs: winners are marked. Said out loud —
        // a silent HP tax is a lie (break-it 2026-10-08).
        s.health = Math.max(1, (s.health || 0) - 5);
        this.sysSay('📺 The lights take their cut. Winning marks you. (-5 health.)');
      }
    } else {
      if (!ac._suppressLearn) { try { this.contestLearn(ac.contestId, isWatch ? 'watched' : 'lost'); } catch (e) {} }
      if (isWatch) {
        this.sysSay(`📺 ${contest.name} — over. ${pname} survived. The audience is polite.`);
        // GOSSIP (Steve 2026-10-08): surviving is news too — the village
        // talks about who came back and how they looked.
        this._cxGossip('survived', ac.participant, contest.name);
        // WATCH-COMFORT (Steve 2026-10-06): "Give them space" must be honored.
        if (ac.comfort) this.sysSay(`📺 You go to ${pname}. They're quiet. They'll talk about it later. Or never.`);
        else this.sysSay(`📺 You give ${pname} space. The cameras move on. You don't.`);
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
    try { this.broadcastEnd(); } catch (e) {} // BROADCAST MODE: the frame always lifts explicitly (Steve 2026-10-09)
    this.state.activeContest = null;
    // (break-it 2026-10-09 r4: the old state.lastContestDay write was dead
    // code — written here and in _contestVerdict, read nowhere. Removed.)
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
      lockpick: `${pname} forced the last tumbler. The lock had one more trick than the pantry had food. The vault ate the sound of it — which is the cruelest thing a door can do.`,
      wrongmap: `${pname} dug at the X. The map kept its promise exactly once — the lie. The rations are still out there, buried under the truth nobody checked.`,
      alibi: `${pname} pulled the wrong link and the chain held. The village trusts the lie now — it's the only version left standing. ${poss} name is the one the chain remembers.`,
      echo: `${pname} accused the noon telling and the cameras agreed. The witness is gone — not dead, worse: disbelieved forever. The System kept both tellings. It plays them back to back, on a loop.`,
      tidepool: `${pname} heard the third gull-cry and kept gathering. The tide doesn't negotiate. The pools are rich this year — everyone says so. Nobody says it out loud.`,
      windfall: `${pname} chased the rot and the rot won. The storm's fortune is compost now, and the cameras got the whole slow disaster. The village still finds berries in odd places.`,
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
    const contest = this._cxScaledContest(ac);
    const isWatch = ac.participant && ac.participant !== 'player';
    const pname = isWatch ? this.displayName(ac.participant) : 'You';
    ac.phase = 'done';
    this.sysSay(`📺 ${contest.name} — ${how}`);
    this.sysSay('📺 ' + this._contestDeathLine(contest, how, pname));
    this.sysSay(`📺 The Death Reel will be tasteful. It won't be.`);
    try { this._cxBeat(this._cxB(ac.contestId, 'Resolve')); } catch (e) {}
    // AUDIO HYGIENE (break-it audio r4, Steve 2026-10-09): see _contestEnd —
    // sustained beat audio (tithe's heartbeat) must die with the contest.
    try { this.audioEvent('heartbeatStop'); } catch (e) {}
    // DRAMA (Steve 2026-10-07): death on camera gets the sympathetic dim
    try {
      let integ = 0;
      try { integ = this.systemIntegrationLevel ? this.systemIntegrationLevel() : 0; } catch (e2) {}
      this.drama('contest', { type: 'loser', name: pname, integration: integ });
    } catch (e) {}
    if (!ac._suppressLearn) { try { this.contestLearn(ac.contestId, 'died'); } catch (e) {} }
    try { this.broadcastEnd(); } catch (e) {} // BROADCAST MODE: the frame always lifts explicitly (Steve 2026-10-09)
    this.state.activeContest = null;
    if (isWatch) {
      // A villager died on camera. The village buries them; the player lives
      // with having watched. (Steve 2026-10-06: this used to call playerDeath
      // unconditionally — a watched death killed the PLAYER.)
      // GOSSIP (Steve 2026-10-08): a death on camera is the biggest news the
      // village will get all week — seed it before the roster removal so the
      // name still resolves.
      this._cxGossip('died', ac.participant, contest.name);
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
    // DEATH-PATH INVARIANT (break-it persistence-2 2026-10-08): every
    // transition to over=true must wipe the save in the same tick. The old
    // fallback wrote this.state.over (a flag nothing else ever sets — the
    // game reads Game.over) with no wipe: a throwing playerDeath left a live
    // save behind AND a split-brain zombie (Game.over=false, state.over=true
    // persisted across load). Now it matches the other four death catches.
    try { this.playerDeath('contest'); } catch (e) { this.over = true; try { this.wipe(); } catch (e2) {} }
    return { done: true, outcome: 'died' };
  };

  G._contestRefuse = function(ac) {
    // Refusal is a sequence, not a skip (Steve 2026-10-05)
    const contest = this._cxScaledContest(ac);
    this.sysSay(`📺 You refuse ${contest.name}.`);
    this.sysSay(`📺 The System pauses. Refusal is... content. The cameras stay on.`);
    this.sysSay(`📺 "NOTED," says the System. "THE AUDIENCE WILL REMEMBER THE COWARDICE. OR THE PRINCIPLE. WE HAVEN'T DECIDED."`);
    this.addNotability('player', 'showmanship');
    const s = this.state.scholar;
    s.trauma = Math.min(100, (s.trauma || 0) + 5);
    try { this.contestLearn(ac.contestId, 'refused'); } catch (e) {}
    // MULTI-TAKE (Steve 2026-10-06): the others were taken anyway —
    // refusal is yours alone.
    ac._refused = true;
    if (ac.others && ac.others.length) {
      this.sysSay(`📺 You said no. They didn't get asked.`);
      try { this._contestResolveOthers(ac); } catch (e) {}
    }
    try { this._cxBeat(this._cxB(ac.contestId, 'Resolve')); } catch (e) {}
    // AUDIO HYGIENE (break-it audio r4, Steve 2026-10-09): see _contestEnd —
    // sustained beat audio (tithe's heartbeat) must die with the contest.
    try { this.audioEvent('heartbeatStop'); } catch (e) {}
    ac.phase = 'done';
    try { this.broadcastEnd(); } catch (e) {} // BROADCAST MODE: the frame always lifts explicitly (Steve 2026-10-09)
    this.state.activeContest = null;
    return { done: true, outcome: 'refused' };
  };

  // === WATCH MODE (villager participant) ===
  // When someone else is taken, you watch. The show plays out as
  // narrated beats with choices that MATTER (Steve 2026-10-06): cheering
  // steadies your people (capped, cameras notice), studying
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
      // --- CONTEST-POOL EXPANSION 3 (Steve 2026-10-05) ---
      lockpick: {
        setup: p => `📺 The Iron Pantry. ${p} has been taken.\n\nA vault door the size of weather. Behind glass: a full pantry, lit like a museum. Five tumblers. One hour of air.\n\n${p} presses an ear to the cold metal. The lock is talking. Whether ${p} speaks its language is the whole contest.`,
        turn: p => `📺 The Iron Pantry — three tumblers set. The heavy ones are down; the light ones fight.\n\n${p} is listening the way you listen to a sick animal — close, patient, braced. The pantry glows through the glass. The village can smell it. That's the point of the glass.`,
        end: p => `📺 The Iron Pantry — one tumbler left. Or one jam.\n\nThe whole village is holding its breath. Dinner is one click away, or it's a painting of food behind glass. ${p}'s hands are shaking. The lock doesn't care.`,
        knows: p => `📚 You've picked this lock. Heavy to light — that's the order. If ${p} forces it now, shout. The lock eats the attempt, and then the whole thing is about the jam.`,
      },
      wrongmap: {
        setup: p => `📺 The Wrong Map. ${p} has been taken — with a partner, and a map, and a lie.\n\nThe map moves when you don't look at it. The X marks buried alien rations. Exactly one thing on it is a lie.\n\n${p} studies the ink. The cameras study ${p}. The valley holds still, keeping its secret.`,
        turn: p => `📺 The Wrong Map — the contradiction. ${p} is standing on what the map calls a riverbank, holding dust.\n\nThe river is the lie. It's been dry for years. So the X, measured from the river, is wrong too. ${p} is pacing the dry bed, doing the map's own math back at it.`,
        end: p => `📺 The Wrong Map — the digging. Shovels in the dry bed, the whole valley watching.\n\nSomewhere under that dust: alien ration tins, or nothing. The map kept its promise exactly once — the lie. The truth is under the shovel, or it isn't.`,
        knows: p => `📚 You've read its maps. It always lies about WATER. ${p} knows — watch them work the dry bed. The blue on the map is a rumor. The dust is the truth.`,
      },
      alibi: {
        setup: p => `📺 The Alibi Chain. ${p} has been taken.\n\nFive villagers. Each vouches for the next, a chain ending at midnight. One link is false.\n\nThe chain is read aloud. ${p} listens. The village listens to ${p} listening — because whatever chain ${p} leaves standing, the village sleeps under.`,
        turn: p => `📺 The Alibi Chain — the pulling. ${p} is working the links, and the links are stressed.\n\nOne of them is vouching louder than ever — volume as evidence. The others have gone quiet. Quiet people are either innocent or patient. The village is taking notes on all of them.`,
        end: p => `📺 The Alibi Chain — midnight is coming. The false link is in there, holding the whole thing up.\n\n${p} has one naming. Name it right and the chain breaks clean. Name it wrong and the village trusts a lie — it's the only version left standing.`,
        knows: p => `📚 You've broken a chain. The false link vouches first and loudest — watch the loud one. And how ${p} names it matters as much as the naming: gently, or the village fractures with the truth.`,
      },
      echo: {
        setup: p => `📺 The Echo. ${p} has been taken.\n\nOne witness. Two tellings. Dawn: "I hid. I don't know what it was." Noon: "I stood my ground. I think I scared it."\n\nThe details moved between tellings. The cameras were at the noon one. ${p} has to find what the teller added for them.`,
        turn: p => `📺 The Echo — the lining-up. ${p} has the two tellings side by side, word for word.\n\nWhat moved is the danger — and who was brave inside it. The witness is performing the noon version again, bigger, for the cameras. ${p} is watching the performance happen in real time.`,
        end: p => `📺 The Echo — the verdict. Which telling was true.\n\nThe village is splitting down the middle. Half arms for a monster that charged. Half is quietly terrified of something that just breathed in the dark. ${p}'s word decides which village wakes up tomorrow.`,
        knows: p => `📚 You've heard an echo. The noon telling always adds DANGER — bravery for the cameras. Believe the scared one. Watch ${p} — if they bless the performance, the village arms for nothing.`,
      },
      tidepool: {
        setup: p => `📺 The Tide Clock. ${p} has been taken — with a partner, and a sack, and a drowning causeway.\n\nThe tidal pools are rich: crab, mussel, urchin, a drowned pantry exposed for one low tide. The water is already coming back.\n\n${p} wades in. The tide doesn't negotiate. The cameras love a deadline.`,
        turn: p => `📺 The Tide Clock — the water is at ${p}'s knees. The deep pools are still giving.\n\nFirst gull-cry. Then the second. ${p}'s sack is heavy and the causeway is wet stone. The village is counting cries out loud, all at once, like that could help. It can't.`,
        end: p => `📺 The Tide Clock — THIRD GULL-CRY. The causeway is going under, white water over black stone.\n\n${p} is on it. The far side is a long, wet run. The sack is dinner for the whole village — or it's an anchor. This is the part the Death Reel replays in slow motion.`,
        knows: p => `📚 You've worked a tide. Third gull-cry, turn back — no fourth pool is worth the causeway. ${p} knows. Whether they listen is the whole contest.`,
      },
      windfall: {
        setup: p => `📺 Windfall. ${p} has been taken — with two others, and a meadow full of rot.\n\nThe storm dropped a fortune: berries, a downed deer, stranded fish, fruit everywhere. All of it rotting, right now, on camera.\n\n${p} stands in the middle of it, doing triage. The clock is spoilage.`,
        turn: p => `📺 Windfall — the sun climbs. The berries are going. The fish pool is warming.\n\n${p} is working the rot order — berries eaten, meat smoking, fish drying. Or hauling it all raw, fast and greedy. The meadow smells like a decision. The chat is doing rot-math. The chat is right.`,
        end: p => `📺 Windfall — last light. What's saved is saved; what's rotting is compost with an audience.\n\nThe System tallies: preserved vs lost. ${p}'s pile is laid out — smoked, dried, kept, or slumped. The village watches the numbers. Winter watches harder.`,
        knows: p => `📚 You've beaten the rot. Berries first, meat to smoke, fish to dry, fruit keeps. ${p} is working the rot order — watch the smoking fire. That's where the winter is.`,
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
  // steadies your people — but the cameras notice loud
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
      { beat: this._cxB(contest.id, 'Declare'), text: beats[0],
        choices: [
          { label: 'Cheer them on', sub: 'loud — the cameras notice', do: { cheer: 0.05, notability: 'showmanship', note: `You cheer for ${pname}. They hear it. The cameras swing toward YOU for a second — the System files you under *interesting*.` }, next: 1 },
          { label: 'Watch silently', sub: 'tense', do: { note: 'You watch without a sound. Your hands hurt from gripping.' }, next: 1 },
          { label: 'Study the pattern', sub: 'learn without bleeding', do: { study: true, note: `You watch the way it moves — the tells, the rhythm. If you ever go in there yourself, you'll remember this.` }, next: 1 },
          { label: 'Look away', sub: 'can\'t watch', do: { note: 'You look away. The cameras catch it anyway. The audience understands.', trauma: 3 }, next: 1 },
        ] },
      { beat: this._cxB(contest.id, 'Escalate'), text: beats[1], choices: phase1Choices },
      { beat: this._cxB(contest.id, 'Climax'), text: beats[2],
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
    // DRAMA (Steve 2026-10-07): the verdict is a judging moment — slow-mo
    try {
      let integ = 0;
      try { integ = this.systemIntegrationLevel ? this.systemIntegrationLevel() : 0; } catch (e2) {}
      this.drama('contest', { type: 'judging', integration: integ });
    } catch (e) {}
    // BROADCAST MODE (Steve 2026-10-09): the Death Reel moment — inside a
    // live broadcast, the verdict gets the replay treatment.
    try { this.broadcastReplay(); } catch (e) {}
    const contest = this._cxScaledContest(ac);
    // WATCHER AGENCY (Steve 2026-10-06, real 2026-10-08): cheering moves
    // your people — as real performance, not odds. Steadies the arm in
    // blood, lifts the case in moot. Capped — love is real but not rigged.
    const cheer = Math.min(0.15, ac.cheer || 0);
    // ALIEN PLAYERS (Steve 2026-10-08): fan favor and alien meddling bend the
    // verdict — sadistic rigging, benevolent lifelines, crowd mood. Bends
    // performance and beats; the sequence still runs (contest interruption
    // law holds: participation is unavoidable, interference never skips it).
    let apInt = null;
    try { if (this.apContestInterference) apInt = this.apContestInterference(ac) || null; } catch (e) { apInt = null; }
    // (break-it 2026-10-08: the old apDeathSave branch is gone — the
    // benevolent lifeline fires only at the player's own death roll
    // (forPlayer:true), so a verdict-path deathSave is always false. A
    // villager's played death is never converted by a hidden roll.)
    // SADISTIC RIGGING (real 2026-10-08): was -0.12 win odds; now a real
    // performance penalty — the judges are against them.
    const apRig = (apInt && apInt.winMod) || 0;
    const pids = (ac.participants && ac.participants.length) ? ac.participants.slice() : [ac.participant];
    const s = this.state.scholar;
    let anyWon = false;
    const fates = [];
    // PLAYED NOT RNG (Steve 2026-10-08): contestants resolve through the
    // real contest engine — fights are fought, moots are argued, ordeals
    // are endured. The risk-tier tables are gone. Cheer is now a real
    // performance modifier (steadies the arm, lifts the case), not odds.
    const cheerBonus = Math.round(cheer * 100) + Math.round(apRig * 100);
    const cheerLift = cheer * 20 + apRig * 20;
    let outcomes = null;
    try {
      if (typeof this.contestResolveGroup === 'function')
        outcomes = this.contestResolveGroup(pids.filter(pid => pid !== 'player'), contest, { cheerBonus, cheerLift });
    } catch (e) { outcomes = null; }
    pids.forEach((pid, i) => {
      ac.participant = pid;
      // MULTI-TAKE learn pacing: only the primary's fate teaches.
      ac._suppressLearn = i > 0;
      let outcome;
      if (pid === 'player') {
        // The player never watches their own contest — defensive fallback
        // to the old odds would be a lie; resolve as lost.
        this._contestEnd(ac, 'lost', false);
        outcome = 'lost';
      } else if (outcomes && outcomes[pid]) {
        const r = outcomes[pid];
        if (r.log) r.log.forEach(t => this.sysSay('📺 ' + t));
        // (break-it 2026-10-08: no lifeline conversion here — see above.)
        if (r.outcome === 'died') {
          this._contestDie(ac, r.detail || 'The verdict came down hard.');
          outcome = 'died';
        } else {
          const won = r.outcome === 'won';
          this._contestEnd(ac, won ? 'won' : 'lost', won);
          outcome = won ? 'won' : 'lost';
          if (won) anyWon = true;
        }
      } else {
        // Engine missing — fail loudly, never silently roll.
        this.sysSay(`📺 The System's feed cuts out on ${this.displayName(pid)}. Something is wrong with the broadcast.`);
        this._contestEnd(ac, 'lost', false);
        outcome = 'lost';
      }
      fates.push({ pid, outcome });
      // The bet rides on the first taken. The System honors wagers: 2x.
      if (i === 0 && ac.bet) {
        const amt = ac.bet.amount;
        if (outcome === 'won') {
          // BANK CAP (break-it food r3 2026-10-08): the payout is a kcal
          // grant — it respects the cap like every other source.
          s.kcal = Math.min(this.kcalCap(), (s.kcal || 0) + amt * 2);
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
    try { this.broadcastEnd(); } catch (e) {} // BROADCAST MODE: the frame always lifts explicitly (Steve 2026-10-09)
    this.state.activeContest = null;
    // (break-it 2026-10-09 r4: the old state.lastContestDay write was dead
    // code — read nowhere. Removed.)
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
  // GOSSIP AFTERMATH (Steve 2026-10-08): contest news travels by mouth, not
  // broadcast — the village talks about who went, who won, who died, who
  // survived. Seeded as first-hand talk from a witness; spreadGossip
  // distorts it from there along social lines. Per-pid partKey so
  // multi-take outcomes never dedupe each other away. Villagers only — the
  // player's own fate is already on the record (notability, ledger).
  G._cxGossip = function(how, pid, contestName) {
    try {
      if (!pid || pid === 'player') return;
      const v = this.state.village;
      v.gossip = v.gossip || [];
      const day = (this.state.scholar || {}).day || 1;
      const partKey = day + ':contest:' + (contestName || '') + ':' + how + ':' + pid;
      if (v.gossip.some(g => g.partKey === partKey)) return;
      const heard = [];
      const roster = (v.roster || []).filter(id => id !== this.villagerId && id !== pid);
      if (roster.length) heard.push(roster[Math.floor(Math.random() * roster.length)]);
      v.gossip.push({ action: 'contest_' + how, dims: { who: pid }, heard,
        distortion: 0, day, partKey, noTrust: false, source: 'contest' });
    } catch (e) {}
  };
  // MULTI-TAKE FATES (Steve 2026-10-06): when the player is taken alongside
  // villagers, each of them has their own off-screen contest. Their fates
  // roll here at the end of the player's sequence — they can win, lose, or
  // die, and the village feels it. No knowledge for watching from the
  // inside: you had your own arena to survive.
  G._contestResolveOthers = function(ac) {
    const others = (ac.others || []).filter(id => id !== 'player');
    if (!others.length) return;
    const contest = this._cxScaledContest(ac);
    const s = this.state.scholar;
    this.sysSay(`📺 ───`);
    // REFUSAL-HONEST (Steve 2026-10-06): if the player refused, they fought
    // no fight — say so.
    this.sysSay(ac._refused
      ? `📺 While you stood your ground and said no, they fought theirs.`
      : `📺 While you fought your fight, they fought theirs.`);
    for (const pid of others) {
      // LIVENESS (break-it 2026-10-09 r4): an earlier fate in this same
      // loop can kill a later contestant (duel partner casting). The dead
      // don't fight — their fate was already announced on camera.
      if (!this.isMember(pid)) continue;
      const pname = this.displayName(pid);
      // PLAYED NOT RNG (Steve 2026-10-08): their arena ran the real engine
      // too — fights fought, cases argued, ordeals endured. No tables.
      let r = null;
      try {
        if (typeof this.contestResolveVillager === 'function')
          r = this.contestResolveVillager(pid, contest, {});
      } catch (e) { r = null; }
      if (r && r.log) r.log.forEach(t => this.sysSay('📺 ' + t));
      if (!r) {
        this.sysSay(`📺 ${pname}'s feed cuts out. Something is wrong with the broadcast.`);
        this._cxGossip('survived', pid, contest.name);
        continue;
      }
      if (r.outcome === 'died') {
        this.sysSay(`📺 ${pname} didn't come home.`);
        this.sysSay('📺 ' + this._contestDeathLine(contest, r.detail || '', pname));
        // GOSSIP (Steve 2026-10-08): their arena, their fate, the village's news.
        this._cxGossip('died', pid, contest.name);
        this._cxKillContestant(pid);
        try { this.say(`☠ ${pname} is gone. The village will say the name for a long time.`); } catch (e) {}
        try { this.leadShift('fracture', 1); } catch (e) {}
        s.trauma = Math.min(100, (s.trauma || 0) + 8);
      } else if (r.outcome === 'won') {
        this.sysSay(`📺 ${pname} WON. You didn't see it — you had your own arena. The village will tell you about it for weeks.`);
        this.addNotability(pid, 'contestWin');
        this._cxGossip('won', pid, contest.name);
      } else {
        const survived = [
          `📺 ${pname} survived. Barely, by the look of them when the lights came up.`,
          `📺 ${pname} made it out. They won't talk about what happened in there.`,
          `📺 ${pname} is back. Shaking. Alive. That's more than most get.`,
          `📺 ${pname} walked out under their own power. The cameras lingered a little too long.`,
        ];
        this.sysSay(survived[Math.floor(Math.random() * survived.length)]);
        this._cxGossip('survived', pid, contest.name);
      }
    }
  };

})();