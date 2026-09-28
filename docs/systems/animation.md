# Animation and locomotion

Gaits, legs, tails, clips and taunts: how the animator poses a body and the measured rules each part obeys.

These notes were the body of CLAUDE.md, which is now an index into this
folder. Each entry names the mechanism, why it is built that way, what was
measured, and the tool that checks it — most of it was learned by breaking it.

- WHICH WAY THE LEGS POINT is not always which way the body faces
  (`Animator.legFrame`). In target lock a mech strafes and back-pedals with its
  chest on the enemy; the whole body used to turn as one, so a strafe played a
  forward stride translated sideways and a BACK-PEDAL played a forward stride
  translated backwards — the planted foot travelling WITH him instead of pushing
  against the ground. Measured on titanus, stance-foot drift along the direction
  of travel: forward -5.5 u/s (pushing back, correct), backwards +5.2 (the
  moonwalk), strafe -0.01 (a pure skate). These are robots, so the fix is the
  one a person cannot do: `ctx.drift` is the angle from facing to travel, the
  HIPS take it (they are the rig root, so the legs follow) and the TORSO gives
  the same angle back, leaving the lower body walking where it is going and the
  upper body still aiming. Aimed nearly straight back there is nothing left to
  turn toward, so beyond `LEG_BACK_ON` the drift is measured against the
  REVERSED facing and the walk cycle runs BACKWARDS instead — a 180° back-pedal
  is 0° of leg turn and a reversed stride. After: backwards -4.3, strafe -2.7,
  both pushing the right way. HUMANOIDS ONLY, gated on the gait
  (`standard`/`sprint`) plus a roster opt-out `strafeLegs: false` — a crab does
  not counter-rotate its waist (cranky), and jerry (`arthropod`) and fenrir
  (`quad`) are excluded by their gaits.
  A STRAFE NEVER REVERSES, and READ THE LINE OFF A CLOCK FACE, because that is
  how the complaint arrives: noon is his facing, 3 is a pure right strafe, 6 is
  straight back. It was at a quarter turn (3 o'clock!), which made "sideways with
  a little bit of backwards" a backwards walk; moving it to 150° put it exactly
  on 5 O'CLOCK, one of the most-held directions there is (retreat while
  circling), so it sat on the boundary and flipped in and out. It is 170° now
  (`LEG_BACK_ON`, leaving at 150° — 20° of hysteresis so it cannot flutter), and
  the hips are allowed the full 170° of turn to reach it. Everything up to and
  including 5 o'clock faces the way it is travelling with the cycle running
  FORWARD; only very nearly 6 flips. Measured on titanus, stance-foot drift along
  travel (negative = pushing against the ground) with legTurn / cycle direction:
  0° -3.95, 0 / + · 60° -3.93, +60 / + · 120° -4.61, +120 / + · 150° -5.55,
  +150 / + · 165° -5.79, +165 / + · 180° -4.67, 0 / -. No moonwalk anywhere.
  Crossing it is a real half-turn of the pelvis — the two answers put the legs on
  opposite sides of the body, so nothing makes it free — and it is DAMPED like
  any other leg turn (~25°/frame at the peak, ~0.4s), reading as the mech
  pivoting his lower body to back off. Coming to a stop UNWINDS rather than
  crossing, or every halt mid-retreat would spin the legs a half turn.
- GAITS ARE DATA (`src/mechs/gaits.js`): the walk/run cycle is a NAMED table —
  `standard` (the default), `sprint` (the fast tier: viper, tempest, wraith),
  `arthropod` (jerry), `hexapod` (cranky), `quad` (fenrir), `knuckle` (konga)
  and `trike` (tritone).
  A roster def names one with `gait: '<id>'` and mechs SHARE them, so tuning a
  gait moves every mech that runs it.
  A GAIT MAY BE A VARIANT OF ANOTHER: `base: '<id>'` makes it that gait plus the
  keys it overrides (group by group, key by key), resolved once at load so
  everything downstream sees one flat table (`gaitBaseOf`/`gaitHeirsOf` remember
  who came from where; `formatGait` emits `base` plus only the differences, so
  the workbench's paste-back loop keeps the inheritance instead of silently
  freezing a copy).
  …AND A GAIT MAY BE TWO TABLES. `runLegs`/`runAnkle`/`runArms`/`runBody` are a
  second copy of the four pose groups, and `effectiveGait(gait, ratio)`
  CROSSFADES the gait from the first into the second over the same speed band
  the quadruped layer fades in on (`gallopBlend` — `quad.onset` to
  `onset + quad.blend`). That is for a body that does a DIFFERENT thing fast
  rather than the same thing faster: FENRIR is `base: 'sprint'` at the bottom
  (he jogs like a runner — measured identical to sprint) morphing into the
  owner's hand-tuned wolf gallop at the top (measured BIT-IDENTICAL, every
  joint, every phase, from ratio 0.75 up — EXCEPT THE ANKLES, deliberately: the
  foot is the one part of the old gallop not worth restoring, so `runAnkle`
  names only the back-extension angle and the rest of the group stays sprint's,
  which is what `hang 0.26` on an airborne paw buys. A run table that names two
  keys morphs two keys).
  …AND FOR FENRIR IT IS NOT A MIXTURE BUT A STATE. `quad.snap` (seconds) turns
  the crossfade from a function of SPEED into a transition he PASSES THROUGH:
  past `quad.onset` he commits to four legs over `snap` seconds, below it he
  commits back, and the only time he is in between is while that blend runs — no
  throttle leaves him permanently half-wolf (measured: q = 0 at every settled
  speed up to 45%, 1 from 50%, and hysteresis holds the state on the way back
  down so a body sitting on the threshold cannot shiver between gaits). The
  memory lives in `Animator.gallopState`, which hands the number to
  `gallopBlend` through `effectiveGait`'s 4th argument and `env.quadQ`; leave it
  out — as every stateless caller does, the workbench's dial sweep included —
  and you get the speed ramp `quad.blend` always described. `snap: 0` is off,
  which is every other gait. It is flagged `runtime: true` in the schema,
  because it is neither a pose term nor the phase rate and no sweep can see it:
  the workbench OFFERS a runtime dial rather than measuring it dead.
  The `run*` groups are DERIVED from
  the four they mirror, so a new dial appears in both and in the workbench with
  no edit anywhere. Everything downstream must run on `effectiveGait`, phase
  rate included — the animator caches it per frame in `_gait`, the adapter
  resolves it inside `evaluate`/`phaseRate` — or half the body gets the jog's
  numbers and half the run's. `applyGait()` is the whole cycle and is
  PURE — the animator runs it and so does the gait workbench, so what is tuned
  there is what ships. Each dial has a `*Run` twin (`base + run * ratio`), which
  is how one gait walks politely and sprints hard. Add a dial by adding it to
  `GAIT_SCHEMA` + reading it in `applyGait` — the workbench's sliders, its
  "which dial moves this limb" logic and `tools/wbconfig.mjs` all derive from
  the schema. THE FOOT IS NOT A CURVE — it is THREE STATES, and `applyToeHang`
  (the last pass, after the gallop layer) blends between them from weights read
  off the POSE, never off a phase window: **stance** (sole flat on the ground —
  the `footFlat`/`ankle.level` ask, the only world-space rule), **push-off**
  (planted but BEHIND: the toe stays down while the leg straightens and the heel
  lifts, so the foot drives to `ankle.push` + `pushRun` relative to the shin, and
  ~90° is what a real push-off reaches) and **air** (nothing holds a foot at an
  angle to the world, so it hangs at its RESTING angle to the shin plus
  `ankle.hang` — ~15° for a runner, 0 for a walk). The last two are JOINT-space,
  stated against the shin, so one number lands the same on a boot, a talon and a
  paw. "Is this foot down" is MEASURED where the body was calibrated
  (`Animator.soleClearanceBySide`, handed over as `env.footClr`) and inferred from
  the leg geometry otherwise — a deep-booted heavy stands with its ankle a fifth
  of a body height up, so ankle height alone calls a planted foot raised. The
  gallop overrides it again for fenrir, whose hinds both leave the ground at once.
  WHO IS ON WHICH BEAT is two dials, `legs.phase` and `arms.phase` (radians,
  0 on every shipped gait). `ph` is the beat and the BODY stays on it (bob, yaw,
  roll, lean); each limb pair rides its own clock offset from it, keeping its own
  L/R alternation, so what the dials move is which leg an arm answers to — π
  swaps the pair outright. On a FORELEG gait (arthropod) the claw's plant/lift
  window, elbow fold and wrist levelling all ride the arm clock too, which is
  what makes "land the right claw with the left leg" a single number: measured on
  jerry, 0 puts each claw down with the foot on its own side (8% of a cycle
  apart) and π puts it on the diagonal (3%). `node tools/gaitprobe.mjs <mech>`
  prints that table — REACH-DOWN, the phase each limb sits lowest RELATIVE TO
  THE HIPS (the body's own bob is common to every limb and swamps the absolute
  height; on jerry it made all four bottom out together whatever the dials said)
  taken from a one-harmonic fit rather than the lowest sample (a claw sits within
  a few percent of its floor for a third of the cycle, and argmin inside a
  plateau hops about and reads as "the dial did nothing"), alongside each limb's
  absolute CLEARANCE so a landing can be told from a wave.
  Judge it with `node tools/gaitprobe.mjs` (`ankleAir°` ~0 = the airborne foot is
  at its resting line; `toeFwd` is the bound on how far forward its toes still
  point).
  MORE THAN TWO LEGS: `hex` is an OPTIONAL group, built exactly like `tail` —
  bones that are not the 15 game joints, so the rig is MEASURED once
  (`hexLegsOf`) and a pure pass (`applyHexGait`) writes their angles into the
  pose target, which `Animator.applyHexPose` puts on the rig's own bones AFTER
  the retarget. CRANKY is the body: his six crab legs are all real bones and the
  BACK pair carries the game leg joints (`thighL/kneeL/ankleL/footL` IS his
  back-left leg), so two of the six ride the ordinary stride — foot rules
  included — and the other four ride `hex` off the SAME phase. Two things are
  derived rather than authored, because either one wrong is invisible in the
  numbers and obvious on screen: WHICH AXIS IS FORWARD and WHICH TRIPOD each leg
  is in (rank down the body from where the hip actually sits, then alternate by
  rank and again by side: front-left + mid-right + back-left, then the other
  three).
  AN ARTHROPOD ROTATES ITS LEGS, IT DOES NOT PUSH OFF THEM, and that is `hex.yaw`
  — the one dial the rest of cranky's table is arranged around. A leg has TWO
  ways to carry its foot forward and `hexLegsOf` measures both lever arms: turn
  it about the body's LATERAL axis and it swings under the hip like a pendulum (a
  push-off; the lever is how far the foot hangs BELOW the hip), turn it about the
  body's UP axis and it swings ROUND the hip, flat, like a hand on a clock face
  (the lever is how far the foot sits OUT from it). `yaw` mixes the two on all
  six — the four directly, the back pair by taking that share of its thigh pitch
  back out and putting the same swing in as thigh yaw, in JOINT space before the
  foot rule runs so no ankle is levelled against a leg that has moved. It COSTS
  GROUND: on cranky's legs the yaw lever is a third to a half of the pitch one,
  so 60% yaw takes about a third off the step and `cadence` pays for it
  (0.70 -> 0.48). It also costs LIFT — a pendulum raises its own foot at both
  ends of the arc for free and a flat swing does not — so `hex.lift`/`fold` went
  up by half again with it. Judge it with
  `node tools/hexprobe.mjs <mech> [throttle]`, which reports every leg's `keep` —
  the foot's measured fore-aft travel over the ground the cadence says one step
  covers. THE ROSTER'S OWN BASELINE IS 0.73 (what titanus measures at every
  speed), not 1.00; cranky's old bolted-on crab walk measured 0.04, which is what
  "wiggling his legs and floating along" is worth as a number. It also reports
  SHELL HEAVE twice — running, and stepped phase by phase — because the
  pelvis-follows-the-feet loop is deliberately slow, so a probe that parks the
  cycle at each phase and lets it settle reports a heave nothing on screen ever
  does (cranky: 2.6% running, 18.5% stepped), and asserts the two properties any
  gait-driven leg must have: pause freezes it (the gait phase is its only clock)
  and standing returns it to the rig's rest angles.
  THE TRAILING FLICK (`adductTrail`) is the one dial that is NOT a plain phase
  function: it rolls the KNEE (so the shin and paw tuck in under a hip that stays
  put) toward the midline only while that foot is BEHIND AND OFF THE GROUND — the flick after toe-off — and fades as the leg swings forward,
  so the foot lands at its normal width and takes the weight there. It is gated on
  `air * back` from `footStates()`, the same two weights the foot rule uses, where
  `air` is the MEASURED sole clearance (`Animator.soleClearanceBySide`) wherever
  the body has been calibrated. That gate IS the design: pulling a PLANTED foot
  sideways is a skate, and multiplying by `air` makes it impossible rather than
  unlikely (footprobe's stance slip is unchanged at the shipped values).
  Judge a change with `node tools/gaitprobe.mjs <mech> [throttle]
  [vsGait]` (foot reach/stride/lift/track/lean measured off the posed model,
  diffed against another gait) and `node tools/gaitsheet.mjs <mech> out.png
  [throttle] [frames] [vsGait]` (the cycle as a filmstrip, comparison ghost in
  every frame).
- SOME LIMBS ARE CARRIED, NOT SWUNG, and then the gait dials are not where they
  live. The `arms.*` group is a jogger's counter-swing; a theropod's forelimbs
  do not pump, so `SIGNATURES.saurion` ASSIGNS his shoulders, elbows and wrists
  at speed (`SAURION_CARRY` in signatures.js — one table, five numbers, lerped
  in on the speed ratio) and that assignment is why the workbench greys most of
  his arm rows. HIS ARMS USED TO FALL BACK AS HE RAN, which is what makes it
  worth stating: measured as the rendered hand against the shoulder along his own
  facing (`node tools/scratch/armcarry.mjs <mech> [throttle]`, fraction of body
  height), standing carried the hand 0.256 AHEAD of the shoulder — the alert
  Jurassic-Park half-raise his rest pose authors — and breaking into a run
  DROPPED it to 0.075 with the elbow at -0.06, behind the joint it hangs off. The
  run carry was pitched less forward than his own standing stance. It is 0.248 /
  elbow +0.073 now: the sprint holds the carriage the stance sets instead of
  letting it go. NEGATIVE SHOULDER PITCH IS FORWARD (the same sign as thigh
  pitch — see the counter-swing note in gaits.js), so the fix is a BIGGER
  magnitude, which is the one thing easy to get backwards here.
- THE TAIL IS GAIT DATA (`tail` dial group in gaits.js, `applyTailGait`,
  `Animator.applyTailPose`). A tail is NOT one of the 15 game joints: nothing
  retargets onto it, and only a custom rig even has one (fenrir's blade is
  `tail0`…`tail5` off the hips). It used to be three hard-coded sines in
  glbanim's fenrir `post` hook; it is now seven dials tuned against the live
  body in `/workbench/?edit=gait`, and the group is OPTIONAL — a gait with no
  `tail` block shows no tail dials and leaves the chain exactly as the rig
  sculpted it, which is every gait but `quad`.
  WHAT IT IS TRYING TO LOOK LIKE is weight on the end of a rope: the wag is
  driven off the GAIT PHASE rather than a clock, so it beats with the stride,
  and each segment further out runs further BEHIND that phase (`lag`) — what you
  see is a WAVE TRAVELLING OUTWARD and a tip that trails, not a rigid blade
  swinging as one. Measured on fenrir at 100%: sweep per segment 6.4° at the
  root climbing to 24.7° at the tip, tip lagging the root by ~2 frames.
  `lift` runs at twice the wag's rate (over-and-back once a stride sideways, up
  and down twice); `idle` is the slow drift added on top, because the gait phase
  barely advances at a standstill and a wag driven purely by it leaves a
  standing wolf looking dead.
  STRAIGHTENING IS MEASURED, not authored: a tail's resting curve lives in the
  rig's BONE POSITIONS, not in any rotation, so there is no number to turn down.
  `tailChainOf` reads the chain once and works out how far each segment turns
  away from the one before it, and `straight` cancels that fraction back out.
  The angles it measures are the ones a rotation about Y and about Z actually
  ADD (`atan2(y, x)`, `atan2(-z, x)`) rather than a friendly-sounding
  elevation/heading pair — get that wrong and the sign flips with which way the
  chain points, which is how the first version CURLED fenrir's tail into a hook
  instead of laying it out.
  It runs after the retarget (`adapter.sync` never writes non-joint bones) and
  is smoothed for free, because the keys go into the same `tgt` the rest of the
  pose does. The dials sweep in the workbench like any other — the adapter seeds
  `tail0…` in `evaluate` and hands over the chain via `env.tail`, plus `tailT`
  (a second along the tail's own clock) so `idle`, which is a RATE, has
  something a fixed-phase pose can measure.
- FENRIR'S GALLOP is a `quad` block over the biped layer, and its hind drive is
  ADDITIVE on top of `applyGait` while the front drive REPLACES what the biped
  layer did (`lerp(..., q)`). That asymmetry matters when tuning: the hinds carry
  sprint's swing at the BIPED phase plus the gallop's at `ph * quad.stride`, so
  the two beat against each other and a hind dial moves less than its number
  suggests. The gallop's hind shape is six dials — `hindSwing`/`hindCarry` (the
  thigh's sweep and where the middle of it sits), `hindFold`/`hindKneeCarry` (the
  stifle), `hockSnap`/`hockCarry` (the paw) — where the three `*Carry` ones were
  hard-coded constants until a wolf needed them. Judge with `tools/gaitprobe.mjs
  fenrir 1` (watch `sole min`: his paws were 20.9% of body height UNDER the floor
  when the hind stride outgrew the body drop) and the filmstrip.
- A fighter grown at RUNTIME (colossus' COLOSSAL FORM ult scales him 4×) must
  tell the animation layer: `animator.sizeMul = <factor>`. Everything in
  animator.js is authored in the model's own local units, so without it the
  legs keep their small-body TIMING over four times the distance — four
  strides per stride's worth of ground, feet skating and jump-cutting. It
  scales the walk cadence (full 1/sizeMul — a planted foot must sweep at
  ground speed), the leg smoothing + a hard angular cap (1/√sizeMul — dynamic
  similarity: big limbs swing slower), and the pelvis foot-follow, whose
  world-measured clearance has to be divided back into local units or the
  correction loop runs at gain × sizeMul and rings. Measure any of it with
  `node tools/footprobe.mjs <mech> <scale>`.
- A CLIP'S `hit` EVENT MUST FIRE WHERE THE WEAPON IS, NOT WHERE THE KEY IS.
  Authoring the hit on the strike keyframe assumes the body arrives the instant
  the key does; it does not, because the animator SMOOTHS toward each target and
  the rendered pose lags the clip by a fixed wall-clock amount. A gentle swing
  hides it — a fast one does not. Jerry's claw rake travels 114° in 0.12s, and
  on the key the claw was still up over his own back, so every light whiffed
  while the hit test stayed perfectly correct about a claw that was not there.
  `node tools/striketime.mjs <mech> [clips]` is the check: it prints where the
  striking hand IS at each hit event, in the mech's own frame, beside where that
  hand's forward peak actually lands. Together = healthy; peak later = move the
  event by the gap.
- TAUNTS ARE PER-MECH (`*_TAUNT` raws in src/mechs/clips/<id>.js, compiled into
  `GLB_CLIP_VARIANTS` under the name `taunt` and hung off each mech's glbanim
  `clipOverrides`). The shared taunt is a beckoning arm — right for a humanoid
  brawler, meaningless on a crab, a wolf or a hologram. 16 of the roster carry
  their own; the procedural build of the same mech keeps the shared one, and
  every check keyed on the clip NAME still matches because they all compile as
  `taunt`. Judge one with `node tools/clipsheet.mjs <mech> taunt [out.png]
  [frames] [front|q|side|back]` — the clip as a filmstrip, stepped
  DETERMINISTICALLY at 1/60 from t=0 for every frame, which is the only way to
  read a one-shot under a renderer running 20x slow.
  FIVE THINGS BIT, IN ORDER. (1) A limb has to ARRIVE somewhere, and the angle
  that gets it there is not always the obvious one: konga's chest beat is
  shoulder YAW, because his arms are the longest on the roster and the
  pitch-and-roll a biped beats its chest with swings those hands clean over his
  own head. Measure it (hand world position against the chest bone) rather than
  eyeballing degrees. (2) Clip values on LEGS/TORSO/HEAD are ADDITIVE over
  restPose (`Animator.restBias`) while ARMS are ABSOLUTE. (3) A clip track
  REPLACES what the gait wrote, so fenrir's tail whip is a `post` pass on his
  profile — keyed into the clip it would flatten the droop and the measured
  straightening for the length of the howl. (4) WHERE A WEAPON'S TIP ENDS UP is
  not where a joint is, and it must be MEASURED off the geometry: viper's blades
  are fused to his forearms, and "arms behind the back with the tips touching"
  was solved by sweeping shoulder pitch/yaw/roll x elbow and scoring the REAL
  tip — the farthest skinned vertex the forearm/hand owns, taken into the hand
  bone's local frame once and carried by the bone through every candidate.
  Estimating it instead as "about a hand-length past the hand" was off by a
  factor of two and picked a pose that crossed the blades in an X over his
  shoulder blades. (5) FORWARD IS POSITIVE, on every rig, for both pitch levers:
  `torso` and `hipsRot` positive tip a mech onto its own facing and the head
  takes a NEGATIVE offset to lift the face back up (`node
  tools/scratch/leansign.mjs <mech> [bone]` measures it). MEASURE A BONE ABOVE
  THE PIVOT, though — wraith's loom shipped leaning AWAY from you for a release
  because the probe read his HANDS, and a rotation about the torso joint carries
  everything above it forward and everything below it back, so hands hanging at
  y 2.5 under a torso joint at y 4.8 travel the wrong way and invert the sign.
  Read the head or the hood, never a hanging limb.
  AND SOME TAUNTS ARE NOT POSES. Four are effects, each driven off
  `Fighter.taunting()` (is the clip named `taunt` playing) and nothing else,
  which is what makes "a hit interrupts it" free — a hit plays hitFlinch over
  the top and every effect unwinds on its own next frame, with no cancel hook to
  keep in step. INFERNO vents instead of burning (`stackToot`, burners held dark
  — chimneys and back tanks straight up in WORLD space, hand torches along their
  own +Z, because a torch is aimable and a chimney is not). NULLBOT breaks the
  RENDER (`holoTaunt`, roster `holoTaunt`) — a stutter, not a fade. TEMPEST
  crawls with static (`arcTaunt`, roster `arcTaunt.nodes` — each arc picks a
  random PAIR of hot points and endpoints are re-resolved every spawn, since the
  arms are moving; and every arc is BOWED out along his facing until the middle
  of its path clears his chest — `arcTaunt.bow`, LightningPool's `bow` option —
  because a straight line between the two shoulder stacks is a light show that
  happens entirely on his back, where the camera never is. Measured: endpoints
  at -0.6 and -2.2 along his facing, path midpoint +1.65). WRAITH LOOMS
  (`growTaunt`, roster `tauntGrow: 1.6` — the same levers colossus' ult pulls,
  `Animator.sizeMul` included) with a gale blown through his cloak
  (`swayCloak`'s `wind`), half-transparent with cold wisps coming off him. THE
  POSE IS TWO KEYS AND STAYS OUT OF THE WAY: he draws himself up and tips
  SLIGHTLY forward (10.4° at the hips against a 5° torso counter) and holds that
  to the last frame — it used to keep folding over you to 46° of spine, which is
  a second effect competing with the growth for the same silhouette, and the one
  that reads at arena distance is the size. THE HOLD IS THE ONLY PART THAT HAS
  BEEN SHORTENED (`dur` 2.9 -> 2.3): he reaches the lean at 1.396s either way,
  and what came off is 40% of the 1.50s he then spent standing in a pose that
  had stopped changing. Cutting into the RISE instead would only make the growth
  snap, and everything downstream is timed off `dur`, so the dispersal simply
  arrives sooner.
  THERE IS NO WAY BACK DOWN: a symmetric ramp made the whole
  thing a bellows, so the instant the taunt ends the FIGHTER is back at his own
  size on the SAME frame — hitbox, height and `sizeMul` all belong to a body in
  a fight, and half a second of giant hurtbox nothing can be hit by loses
  rounds.
  …AND THE GIANT IS HANDED OVER RATHER THAN DELETED (`Fighter.disperseGiant`).
  It used to vanish on that frame with the bats spawned where it had stood,
  which asks the eye to take a disappearance and a swarm as one event and reads
  as a pop. The apparition is now PEELED OFF as a frozen shell — baked exactly
  as drawn, pose and size and all (`bakePoseShell`, poseshell.js) — into the
  world's scene, and over `WRAITH_DISPERSE.dur` (0.5s) it keeps GROWING
  (`swell` 1.45 on top of `tauntGrow`, so 2.3x him at the last visible frame)
  while it fades, as the mech fades up inside it. So there are TWO WRAITHS on
  screen for the whole crossfade, which is the point: one arriving at normal
  size, one leaving at twice the height it started. The growth has to CONTINUE
  through the dissolve — a shape that stops growing and then fades reads as a
  fade, one still expanding as it thins reads as coming apart.
  THREE THINGS THAT ARE NOT FREE HERE. The fade is LINEAR, deliberately: the
  first version faded on the square, which had spent two thirds of its
  visibility a third of the way in (measured 0.14 at the halfway point, 0.02 at
  0.42s) and put a dark smear on screen instead of a second body. The shell
  keeps HIS OWN materials, cloned — a flat spectre material is right for Ghost
  Protocol, which is a projection, and wrong for the thing you have been looking
  at for three seconds; cloned because a shared one would fade the real mech too
  (the trap `setOpacity` documents for glacier's ice). And it is scaled about
  HIS FEET (the bake's `origin`), or a body that doubles in size grows toward
  the world origin instead of upward.
  `WRAITH_DISPERSE.minK` is the interruption guard: a hit swaps the taunt for
  the flinch clip and can do it on the first frame, and handing over from an
  apparition that never grew is half a second of the player's own body faded out
  while he is being hit. Under that much growth the old instant path runs.
  THE FLOCK IS TWO RATES AND THE JUMP BETWEEN THEM IS THE EFFECT. `trickle`
  (0.14s, jittered so it is never metronomic) peels single bats off him for the
  WHOLE taunt — he is coming apart the entire time he stands there — and
  `burst` (2.5x) multiplies what leaves during the dispersal, which is released
  in `waves` across the fade rather than all on the first frame. So the ending
  is an ESCALATION rather than an announcement: measured live in the pool, 5 ->
  10 -> 11 bats through the loom, still 10 at the handover, then 59 and 83.
  Both halves go through the same `Effects.batSwarm` — one call, one set of
  numbers, the only difference is how many — which
  breaks it into black bats that climb away (a body-shaped spawn volume, so what
  comes apart is the shape that was standing there). THE POOL HAS TO HOLD BOTH
  AT ONCE: a pool is a ring buffer, so emitting past `cap` overwrites the oldest
  LIVE particle, and at 120 the burst ate the trickle it is supposed to be a
  jump from (260 now; a bat lives up to 2.4s, so the two deliberately overlap).
  The bats are a NORMAL-blended
  pool — an additive black sprite is nothing at all — off a 2x2 wing-position
  atlas (`batTexture`) looped by ParticlePool's `flap` (atlas loops per SECOND;
  the old `cell: -1` walks the frames once over the particle's whole life, which
  is right for a puff and useless for a wing). Size them off a picture: at 0.55
  of body scale a bat is a fleck that reads as dust, 1.8 is legible. GLACIER freezes SOLID
  (`iceTaunt`, roster `tauntIce`): he CROSS-FADES into the block over half a
  second with the frost thickening as it takes him, and thaws in 0.16s with the
  whole cloud at once — freezing is something he does, thawing is something that
  happens to him, a fist included. THE ICE GOES BEFORE THE TAUNT DOES: it used
  to vanish as the clip ended, which put the thaw and his first moving frame on
  the same instant and read as the block turning into a mech mid-stride. The
  schedule is `GLACIER_FREEZE` in src/mechs/clips/glacier.js — `still` seconds standing
  there frozen in the fog, then `relax` seconds unwinding — and BOTH the clip
  and iceTaunt read it, because the block vanishing and the pose on screen when
  it does are one event (measured: block gone at 2.30s, joint movement 0.00 for
  the whole second after, unwinding from 3.30). The burst is `frostBurst`,
  seeded through the PRISM's own bounding box rather than a ball at his waist —
  a sphere round his navel left the top and corners clear, so a tall block
  disappeared out of a low cloud. THREE TRAPS IN THAT ONE, all the same shape —
  the thing standing in for the body lives INSIDE the body's own group.
  `fighter.group` IS `mech.group` (aliased in the constructor), so hiding the
  mech takes the block with it; `setOpacity` walks that same group, so fading
  the mech to 0 faded the block to 0 too and he simply vanished (it skips
  `_ice` now); and `Box3.setFromObject` does not skip invisible children, so the
  block is unioned from MESHES only, with the yaw dropped first (world-axis
  bounds on a body standing at 45 degrees are half again too wide and centred
  off to one side). Size it off the GEOMETRY, not `baseHeight` — glacier's mesh
  is 8.9 tall against a baseHeight of 7.1, and the difference is his head.
  (`MeshPhysicalMaterial.transmission` is a trap here too — it renders through a
  pass this scene does not run, so the first block was perfectly correct and
  completely invisible.)
- A HELD CLIP IS AS STUCK AS A LOOPING ONE. `hold: true` pins an action at its
  last frame instead of fading it, so it outlives its move forever — and if it
  keys the LEGS the locomotion layer has nothing left to drive and the mech
  slides about frozen. Fighter's state-exit already stopped a LOOPING clip;
  it stops a held one too. (Measured on tritone after a cannon volley, whose
  `tritoneBrace` keys hips, thighs, knees and ankles: 44 units of walking with
  0.000 rad of knee swing.)
- SOME ARMS ARE WEAPONS HELD IN FRONT, and the shared clip library does not
  know it (`foreCarry` in a roster def, applied by `defClipVariants` in
  animations.js). Every shared clip is authored for a humanoid brawler, whose
  NEUTRAL is `shoulder: 0` — arms hanging at the sides — and who throws an arm
  back for balance whenever it crouches, lands, flinches or gets up. On a
  RAPTOR that points the weapons backwards: measured on saurion
  (`node tools/scratch/armband.mjs <mech>`, hand offset from its own shoulder),
  the shared neutral put his hand 0.11 of a body height BEHIND the shoulder and
  the intro/getup crouch 0.16 behind, against +0.26 for his own rest carry.
  `foreCarry: { pitch: [lo, hi], elbow: [lo, hi] }` clamps every clip's
  shoulder and elbow PITCH into a measured band — saurion's is [-150, -30] /
  [-120, -45], where -30 is where the elbow crosses in front of the shoulder
  and -150 where a raised arm starts travelling back over his own head (which
  is what victory and groundPound were doing at -165 and -168).
  CLAMPED IN THE DATA, AT COMPILE TIME, and that is the design: a runtime
  clamp fights the clip silently, so the pose workbench shows one thing and the
  body does another and every measurement taken off the clip is of something
  that never plays. Clamped keys still interpolate (a clamped key is a key),
  and a clip already inside the band comes back UNTOUCHED — the variant map
  only carries clips that moved — so a mech's own forms are unaffected and a
  claw CHAMBERED before a rake, the one time a forelimb legitimately travels
  back, stays as authored. Judge it with `node tools/armaudit.mjs <mech>`,
  which plays every clip the mech can play and measures the hand and elbow
  against their own shoulder IN THE CHEST'S FRAME — a body pitched 60° forward
  while dying has every forward-carried arm reading as behind it in world
  terms, and that is the body falling over, not the arm going back. Saurion:
  14 of 23 clips carried an arm behind before, 0 after.
