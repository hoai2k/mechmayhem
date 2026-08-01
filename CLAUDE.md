# ROBOTWORLD — agent onboarding

Browser 3D mech arena fighter (Three.js + Vite, plain ES modules, no TS).
12 mechs, 12 destructible arenas, 4-player local multiplayer (KB + Xbox
pads), AI opponents, procedural everything (models, textures, animation,
audio). Progress history: `TASKS.md`.

## Commands

- `npm run dev` → http://localhost:5173 · `npm run build` (must stay green)
- Headless screenshot: `node tools/shot.mjs "<url>" out.png <waitMs>` —
  SwiftShader runs the game ~20× slow; use waits from MECH_ART_GUIDE §4 and
  VIEW the images, don't assume.
- Combat crash soak: `node tools/soak.mjs "http://localhost:5173/?battle=neon&p1=titanus&p2=viper&auto=1&diff=ace"`
- Debug URLs: `?showcase` (12-mech lineup) · `?showcase=<id>&anim=<clip|walk|none>`
  (single mech, judging camera) · `?battle=<arena>&p1=<id>&p2=<id>[&p3..p4][&auto=1][&diff=ace][&forcesplit=1]`
  · `?rigtest` (GLB retarget math check) · `?showall=1` (force SETTINGS → SHOW
  ALL ROBOTS on for the session)
- WORKBENCHES LIVE ON THEIR OWN PAGE: `/workbench/?edit=<tool>&mech=<id>` —
  `animation` (procedural-vs-GLB action comparison + anchor editor),
  `pose` (joints + clip keyframes), `gait` (the walk/run cycle's own dials),
  `level` (THE ARENA EDITOR — see below),
  `skin` (bone-island repair),
  `skindebug` (the SKIN AUDIT — see below), `rig`
  (hand-placed skeletons), `collider` (what combat hits), `props`
  (the IMPORTED ARENA PROP MODELS, original vs optimized in twin viewports
  sharing one camera — `?edit=props&prop=<name>`, no `&mech=`). A bare
  `/workbench/` (or an unknown `?edit=`) lands on a card-per-tool front page
  with screenshots (`workbench/landing.js`; re-shoot with
  `node tools/wbthumbs.mjs`). `&variant=alt`
  (legacy `&alt=1`) opens a mech's alternate build. The OLD urls
  (`?debug=models|pose|skin|collider`, `?rigedit=<id>`) still work — they
  redirect, carrying their params, so every tools/*.mjs script and bookmark is
  unaffected.
- The workbench code is a separate tree (`workbench/`) that knows the game
  ONLY through a config object: `workbench/config/contract.js` documents the
  whole surface, `workbench/adapters/robotworld/` fills it in by DERIVING from
  live game data (roster, clips, joint order, rig registry, manifest) — add a
  mech or a clip and the workbenches pick it up with no edit there.
  `node tools/wbconfig.mjs` proves nothing has been hand-copied. Tools under
  `workbench/tools/` import no game code at all. See `workbench/README.md`.
- SKIN DEBUG (`/workbench/?edit=skindebug&mech=<id>`) is the AUDIT workbench: it
  plays every clip a mech can play (plus its rest stance), CPU-skins the model at
  each sampled frame, and ranks every place the skin fails — `stretch` (an edge
  dragged past its built length), `pinch` (an edge collapsed — the LBS candy
  wrapper), `tear` (a weld seam pulled apart, which opens a crack through the
  model). Only edges whose two ends carry DIFFERENT weights are sampled, since
  nothing else can change length; the reference is the BIND pose, and the rest
  stance is scanned as its own clip so skin that is already broken standing
  still is one finding rather than a mark on all forty. A FINDING IS A PLACE ON
  THE MODEL, not a place in a clip: spots that touch on the mesh are merged and
  each finding lists the clips it fails in (dropdown), because one bad weight
  fails in every animation that moves that bone and forty rows all fixed by one
  rebind is not a list anyone can work. ◀ ▶ (or arrow keys) walk the findings,
  SPACE plays the clip at 0.1-1x with the failing edges highlighted live on the
  deforming geometry, H toggles the highlight, F frames the spot; findings can be
  marked fixed/ignored (localStorage). The three buttons hand the fix to the tool
  that owns it, in a new tab — **Edit skin** with the failing island already
  selected (`&vert=`) and the clip in its wiggle picker, **Edit rig**, **Edit
  pose** on that clip at that frame (`&clip=&t=`). **Load from manifest**
  re-reads `models/manifest.json` and drops the cached GLBs (skinOps are baked
  into the shared geometry once), so a save from the skin workbench next door is
  picked up and re-scanned without losing your place. Headless twin:
  `node tools/skindebug.mjs <mech> [--json out.json]`. The maths lives in
  `workbench/tools/stretchscan.js`; the narrower CLI probes
  (`tools/skinstretch.mjs`, `tools/cliptear.mjs`, `tools/stretchaudit.mjs`)
  still answer their own questions.
- WORKBENCHES ON A PHONE (`workbench/ui/mobile.js`): on a SMALL TOUCH screen —
  coarse pointer AND a narrow viewport, both, so a touchscreen laptop and a
  narrow desktop window are unaffected (`?mobile=1` forces it on for testing,
  `?mobile=0`/`?desktop` off) — the animation and gait workbenches invert their
  layout. The panel is the whole screen on a phone, and the model, which is the
  thing you opened the tool to look at, is a sliver beside it. So: a slim BAR
  across the top carries the mech picker (the tool's own `<select>`, MOVED into
  it rather than copied — one control, one state) plus the ONE dial that tool is
  about (animation: an action dropdown standing in for the nine-button grid,
  which needs a press to hold and a dropdown has none — so `walk`/`block`/
  `ranged` stay held while selected and everything else is a press and a release;
  gait: the throttle), and a ⚙ button. The rest of the screen is the viewer,
  driven by OrbitControls' standard gestures (one finger rotate, two pan +
  pinch-zoom). ⚙ raises the WHOLE panel as a bottom sheet — every dial the
  desktop has, unchanged, dismissed with Done/scrim/Esc — so nothing is removed
  on mobile, only put away. Desktop is byte-identical: `setupMobileChrome`
  returns `{active:false}` and does nothing at all unless the layout test passes.
- Every workbench side panel (skin/models/pose/collider/rigedit + the level
  editor's two) is RESIZABLE: drag its outer edge, double-click the handle to
  reset, width remembered per tool (`src/dev/panelui.js`, which also styles
  their scrollbars). Widen it when a bone/op name ellipsizes.
- Workbenches: `?debug=models[&mech=<id>]` — procedural-vs-GLB ACTION
  comparison (trigger any move on both at once, slow-mo, live anchor editor).
  `?debug=pose[&mech=<id>][&model=glb|proc][&clip=<name>][&key=<n>|&t=<s>]` —
  pose a single mech by joint: load one of THAT mech's own clip poses as a
  starting point,
  CLICK A JOINT IN THE VIEWPORT (the dots, or just the body part — nearest
  joint wins; R/T rotate/translate, G local/world, Esc deselect) and drag the
  gizmo. It EDITS THE CLIP, not just a pose: the loaded clip becomes its authored
  key list again, a drag is written into whichever key you're parked on, and the
  scrubber plays YOUR version back. Drag the scrubber and clip time runs smoothly
  (the motion preview); let go and it SNAPS to the nearest key, since a key is the
  only place an edit can be stored — between keys the readout says `between keys`
  and nothing is editable. PLAY (beside the key steppers, or Space) runs the clip
  at 1× on a loop through the real animator — pausing snaps back to the nearest
  key. ◀ key / key ▶ step them, key times are listed under the
  slider, `&key=<n>`/`&t=<s>` deep-link one, and it opens on the LAST key (the
  held pose of a hold/loop clip, the RECOVERY of a one-shot strike). The KEY
  TRACK under the scrubber edits the key LIST itself: DRAG a diamond to move
  that key in time (clamped between its neighbours), RIGHT-CLICK bare track for
  "New keyframe" (born EMPTY, so it changes nothing until you drag a joint on
  it), RIGHT-CLICK a diamond or press DEL/BACKSPACE to delete it. Amber = the
  selected key, green = differs from the shipped clip; all of it is undoable
  and reported in the export (`movedFrom`, `addedKey`, `deletedKeys`). An edit is
  stored as the DELTA you dragged applied to what the key AUTHORS — never the
  on-screen numbers assigned outright, since signature motion and rest bias ride
  on top of those — and keys stay SPARSE, so only the joints you touched are
  added. "Revert clip edits" restores the shipped clip. "Copy pose" then exports
  the WHOLE key list: `keys[]` with a per-joint `changed: {from, to}` on each
  edited key, `editedKeys`, and `js` — the key list already formatted for
  `animations.js`. UNDO/REDO (Ctrl/⌘+Z · Ctrl/⌘+Shift+Z or Ctrl+Y, plus buttons)
  covers every edit, reset and clip swap; steps are deduped by content, so
  scrubbing and key-stepping never flood the stack, and a mech/GLB/alt rebuild
  clears it (different rig, so old transforms mean nothing).
  "Bind patch" emits the GLB manifest
  `boneCorrections`/`bonePos`. "Apply constraints" (default on) is the
  animation framework's rule — rotation only, hips may also translate — so
  limbs can't be stretched into a pose no clip could reproduce.
  `?debug=collider[&mech=<id>][&model=glb|proc][&clip=<name>][&at=hit]
  [&dummy=<dist|0>][&ball=0]` — what combat actually HITS: the measured
  hurtbox capsules (green), the legacy `hitRadius` ball they replaced (red),
  and the swept striking limb at a clip's hit frame (yellow), against a
  second mech at an adjustable distance. `contain`/`bloat` in the readout
  are the fit metrics; `node tools/hurtboxfit.mjs` prints them for the whole
  roster on both routes, and `node tools/hitprobe.mjs "<battle url>"` reports
  the new melee test against the old one on a real fight.
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
- A RETREAT IS NOT A RUN (`Fighter.backpedalT`, `TUNING.movement.backMult`).
  Full speed is only for legs that can push against the ground going forward, so
  as the intended direction swings behind the body the speed cap ramps down to
  `backMult` (0.7 x the WALK cap) and the sprint multiplier fades out with it —
  a dead-straight back-pedal is a fast walk at 0.44 of the run, whether or not B
  is held. The ramp starts at `LEG_BACK_OFF`, so everything the legs can still
  face costs nothing; measured on titanus (walk 20.7, run 33.2): 0-150° 33.2 ·
  160° 26.1 · 165° 22.9 · 170° 19.9 · 180° 14.5. Only target lock can produce it — free camera
  turns the body to face travel, so the offset is ~0 and it never engages.
- GAITS ARE DATA (`src/mechs/gaits.js`): the walk/run cycle is a NAMED table —
  `standard` (the default), `sprint` (the fast tier: viper, tempest, wraith,
  nova) and `quad` (fenrir).
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
- THE GAIT WORKBENCH (`/workbench/?edit=gait&mech=<id>`) runs one mech ON THE
  SPOT with every gait dial live. THREE speed knobs, deliberately separate:
  THROTTLE (how fast the mech is moving — what `ratio` and the foot cadence
  read), GAME SPEED (the player-facing ROBOT SPEED setting, 50-200%) and
  ANIMATION SPEED (slow-motion for reading a fast cycle; changes nothing about
  the gait). Pause + a phase scrubber (`[`/`]`) freeze a moment of the stride; a
  phase-locked GHOST (OFF by default — `&compare=1` or the checkbox brings it in;
  a second body halves the room the first one gets) runs the SHIPPED gait beside
  the mech — or any other gait,
  which is how a mech is moved between gaits with eyes open. The mech dropdown
  names each mech's gait, the panel lists every other mech running it (click one
  to load that body with your edits intact — edits belong to the gait, not the
  mech), and CLICKING A LIMB then DRAGGING IT tunes the dial behind it: the tool
  measures d(joint)/d(dial) at that phase, works out which way that pushes the
  limb on screen and projects the drag onto it. (There WAS a second editing mode,
  JOINT ROTATIONS, which authored `gait.keys` by hand through a gizmo; it went
  unused and is gone. The DATA side survives untouched — `applyGaitKeys` still
  runs and "Output gait" still carries any `keys` a gait has — so a gait file
  that carries them is unaffected; there is just no UI that writes them.)
  EVERY DIAL GROUP OPENS SHUT: sixty-odd dials across nine groups is a wall, so
  you open the one limb you came to tune.
  ONLY THE DIALS THAT MOVE THIS BODY are shown. A gait is one table shared by
  every mech that names it, but a gait is not one PASS: fenrir's gallop layer
  overwrites both arms outright once its blend is full (~75% throttle up), so
  every `arms.*` row is a slider that cannot move him however far it is dragged,
  while the same rows are live on titanus — and a `*Run` twin is dead at a
  standstill by construction. Rather than a hand-maintained "which dials apply to
  whom" table, the tool MEASURES it (`scanEffects`): the whole pipeline is run at
  this mech's own numbers with each dial at the bottom, middle and top of its
  range, and a dial that moves no joint anywhere in the cycle by more than ~0.25°
  is inert HERE and hidden. THE CADENCE PAIR IS MEASURED DIFFERENTLY, because it
  poses nothing: `legs.cadence`/`cadenceCap` set how fast the phase ADVANCES, and
  a pose sampled at a fixed phase cannot see that, so they are swept through
  `phaseRate` instead and counted inert under a 1% change. They used to be
  EXEMPTED from the scan outright, which made them the one kind of dial that
  could never be reported dead — and on fenrir at full gallop that is exactly
  what they are (the crossfade hands the phase rate to `runLegs.cadence`), so his
  whole "Legs — the stride" group was two live-looking sliders that did nothing.
  Untick "only dials that move this mech" and they come
  back greyed, each carrying the throttle band it DOES work in ("only works below
  75%"), which is the useful half of "does nothing". Clicking a limb whose dials
  are all inert says so. Same measurement on the
  command line: `node tools/gaitdials.mjs <mech> [throttle]` — and note
  `&throttle=0` is a real standstill now (`Number('0') || 1` used to quietly open
  it at full speed, so 0 and 1 reported the same answer).
  TYPING beats the slider: a dial's
  number box takes values PAST the slider's ends (the range is the sane band, not
  a limit) and marks itself amber when it is outside what the handle can reach.
  **Output gait** downloads a paste-ready `GAITS` block with every changed dial
  listed from -> to.
  FOOTPRINTS (on by default, `&prints=0` off) run the GROUND instead of the
  mech: each plant stamps a print where the foot landed and the floor, prints
  and grid together, scrolls backward at the real ground speed. The gap between
  two prints of the same foot is the stride MEASURED rather than derived (the
  readout prints both, and they agreeing is the no-skate proof), the sideways
  offset is the track, and a stance foot sliding off its own print is a cadence
  that doesn't match the speed.
- SKINNING A BONE CHAIN (`node tools/tailskin.mjs <mech> [--prefix tail]
  [--band 0.35] [--root hips]`): a chain like fenrir's blade-tail is easy to
  skin badly, and the bad way is the obvious one — each segment's geometry
  handed rigidly to its own bone. That is five hard bands with a seam at every
  joint: the tail bends in five visible kinks and the BASE cannot articulate at
  all, because the geometry where it meets the body is welded half to `hips` and
  half to `tail0` with nothing between. The tool projects every vertex the chain
  ALREADY owns onto the chain's own polyline, which gives it a position measured
  in segments, and weights it from where it sits: rigid mid-segment, a smooth
  blend reaching 50/50 exactly at each joint, and — before the first bone — a
  blend into the body bone the chain hangs off, which is what lets the very base
  bend rather than tear. Only the vertices the current skinOps already give the
  chain are looked at, so it cannot touch the rest of the body; it emits the
  WHOLE skinOps list with the chain's ops replaced in place and every other op
  passed through, and prints it as a patch (nothing writes). Measured on fenrir:
  10 tail findings / 74.2 severity -> 10 / 19.8, worst single 14.2 -> 4.2, every
  non-tail finding byte-identical.
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
- THE MANNEQUIN (`src/mechs/mannequin.js`) is a REFERENCE HUMANOID on the game's
  own 15 joints — same hierarchy, same measurements as the mech it stands in for
  (`factory.buildRig`/`computeDims`), built as a genuine SkinnedMesh with real
  weights: one flat colour per bone (WARM = left, COOL = right, darker further
  out the limb), a foot with a real heel behind the ankle and a toe box in front,
  a nose and eyes on the head, a thumb on each hand. It answers "where is this
  part SUPPOSED to be" in four workbenches: **gait** and **pose** offer it as a
  third BUILD button beside GLB/Procedural (it runs the mech's own gait and
  poses the same clips — per-mech signature motion is off, so what you see is the
  shared engine); **skin** has a `Mannequin reference` box that loads it as the
  subject, read-only, to show the layout a repaired bind is aiming at (one
  contiguous island per bone, seam at each joint, a narrow blend band across it);
  **rig** ghosts it over the raw model at the model's own height as an X-RAY with
  every joint NAMED on screen (`config.reference.mannequin/labels`), which is how
  "the ankle is above and forward of the heel" stops being a guess — and there it
  wears TWO HATS, switched by the `match this rig's bones` box under it: ticked
  (the default) it stands in YOUR bone positions, the humanoid your skeleton
  describes, following live as you drag; unticked it stands in its own canonical
  stance, the answer key for where each joint belongs. Both halves of a joint are
  matched — position lands on the bone, rotation aims the segment at the next
  joint down, so it bends its knee instead of sliding its shin.
  It is also A SUBJECT IN ITS OWN RIGHT — **MANNEQUIN** sits at the bottom of
  every workbench's mech dropdown, under the rule with the work-in-progress
  mechs, so it can be opened on its own. It is NOT game content: `MANNEQUIN_DEF`
  lives in mannequin.js, never in ROSTER, so mech select, RANDOM picks, CPU picks
  and the title line-up have never heard of it. The adapter declares it
  (`catalogue.reference()`), which is how `tools/wbconfig.mjs` still proves the
  catalogue matches ROSTER, how the ACTION workbench leaves it out (it drives real
  Fighters, and a reference body has no moves), and how skin/rig refuse to save
  over it. In the rig editor its own canonical skeleton IS the rig — 15 bones
  already where they belong, as the answer key for the mech you are rigging.
  Combat's hurtbox measures it too: `measureHurtbox` picks the SKIN path off the
  model's shape (`boneMap` + `skeleton`) rather than off "is it a GLB", so the
  reference body reports its 15 capsules — no shipped mech's numbers move
  (`node tools/hurtboxfit.mjs` is byte-identical before and after).
- WELDED PARTS — when no reskinning can fix it: an auto-mesher returns ONE
  shell, so two parts that sit close at bind pose (jerry's claw-arm wrists
  against his shell) get triangles running between them. Rebinding cannot help,
  the geometry itself says they are one surface, and the loser is dragged across
  the arena. `seamCuts` in a manifest entry cuts them apart
  (`src/mechs/seamcut.js`, applied straight after skinOps so it reads the FINAL
  weights): `"seamCuts": [{"a":["handL","handR"],"b":["torso"],"cap":true}]`.
  Each bridging triangle goes to the side carrying more of its weight, corners
  belonging to the other side become DUPLICATE vertices bound to the side that
  took them, cross-side weights are stripped, and both rims are CAPPED with a
  lid (own vertices, own flat normal, wound from the rim's own directed edges).
  Nothing moves at bind pose — the duplicates sit on top of the originals — so a
  poster/showcase render is untouched; the cut only appears when the joint does.
  Distinct from reskin.js' `cutWelds`, which DELETES the triangles: that is right
  for a hidden membrane spanning an air gap (rhino), wrong for visible shell.
  The skin audit knows a deliberate split from a crack (`seamId`/`seamSide` on
  the geometry) and skips it, reporting the count instead.
  Find them with `node tools/weldmap.mjs <mech> --list` (every bone pair that
  shares a triangle despite being far apart in the skeleton — a real armour
  joint is 1 link, an elbow welded to a thigh is 4) and `node tools/weldmap.mjs
  <mech> --pairs a~b` to render one: the welded triangles highlighted at bind
  pose beside the frame that abuses them most. Pairs already separated by a
  seamCut drop off the list, so it doubles as the check that a cut worked.
- DROPPED GEOMETRY — when the model is standing in for something the ENGINE
  does better: `"dropBones": ["stackL","stackR"]` in a manifest entry DELETES
  every triangle owned by those bones and CAPS the rim it opens
  (`src/mechs/dropgeo.js`, run right after skinOps + seamCuts, so it reads the
  final weights). Ownership is the dominant weight, the same rule seamcut and
  the skin audit use; the rim is walked in POSITION-WELDED space (an auto-mesh
  splits vertices at every uv seam, so an unwelded rim is a handful of open arcs
  and capping those leaves daylight through the model) and each connected rim
  fans to its own centre vertex, bound to the bone most of the rim already
  answers to. The BONES STAY — they carry no skin but still ride the animation,
  which is what the effect that replaces the geometry hangs off.
  INFERNO is the worked example: his chimneys used to end in two sculpted
  tongues of flame, frozen at whatever angle the sculptor left them. The drop
  takes them off and seals the mouths; the manifest hangs `stackL`/`stackR`
  ANCHORS on the same bones (any key in `muzzles` becomes an anchor of that
  name), and the roster's `stackFx` block feeds `src/mechs/stackfx.js` —
  flickering tongues, embers, and a smoke column emitted with no horizontal
  speed of its own, so he walks out from under it and it reads as a TRAIL.
  THE BURNER IS NOT A COMBAT THING, which is why the emission lives in
  stackfx.js and not in fighter.js: it takes a plain `mech` plus the pools to
  emit into, so the MENUS burn too — mech select and the title line-up are
  models with no Fighter around them (`MenuStage.syncBurners`, feeding
  `BurnerFx` from effects.js, a flame/ember/glow pool set with NO SMOKE POOL).
  Smoke is off wherever there is nowhere to trail to: the menus by construction,
  and the warm-up sandbox by `world.sandbox` (a robot on a plinth inside its own
  leash radius just ends up in a fog bank). A POSTER still shows cold pipes —
  it is a PNG — so mech select burns only once the real body is in.
- Alternate GLBs: a manifest entry may carry a standalone `alt` sub-entry —
  a second model, or the same model on a staged custom rig. `?debug=skin`,
  `?debug=pose`, `?debug=collider` and `?rigedit` all show an **Edit
  Alternate GLB** checkbox for any mech that has one (off by default;
  `&alt=1` in the URL; `?debug=models` reaches the same build through its
  COMPARE TO dropdown, which stands alt beside the primary). When a mech's
  custom rig lives ONLY on its `alt` (rhino), `?rigedit=<id>` opens
  that build instead of refusing, with the box ticked and disabled. Shared
  logic: `src/dev/altpick.js`. (INFERNO's alt is the other way round now: his
  hand-rigged build was PROMOTED to primary and the old Tripo auto-rig entry is
  the alt, kept as a retired reference.)
- Every mech dropdown goes through `subjectSelect` (`workbench/ui/subjectpick.js`),
  which orders them ALPHABETICALLY and puts the `hidden` work-in-progress mechs
  under a rule at the end — the catalogue's own order is the roster's design
  order, which is right for a line-up and useless for finding one mech in
  seventeen. Tools that want bare ids instead of display names pass
  `label: (id) => id`; the ordering rule stays in one place either way.
- Workbench chrome is shared: `src/dev/panelui.js` owns the resizable panel,
  its scrollbars AND the coloured title bar every workbench wears (pose
  green · skin orange · animation purple · rig blue · collider cyan · gait
  amber, with a
  live `mech · ALT · GLB` subtitle) — add a tool to `WORKBENCHES` and pass
  `workbench:'<id>'` to `setupDevPanel`. The chevron beside the title SWITCHES
  WORKBENCH, carrying the current mech (and its staged variant) over; each
  `WORKBENCHES` entry names its `?edit=` id in `tool`, which is why two keys
  can keep their old names (`models` = animation, `rigedit` = rig). `src/dev/mechpick.js` owns the mech
  dropdown: `mechSelect()` for tools that rebuild in place, `gotoMech()` for
  `?rigedit`, which builds its world around one id and so switches by
  navigating.
- THE RIG EDITOR'S **T POSE** box (`/workbench/?edit=rig`) drives the whole
  skeleton into a canonical T — arms straight out along the shoulder line, legs
  straight down — which is the one-frame answer to "how accurately can this rig
  pose the mech": an ankle on a hock or a thigh aimed outboard shows up
  immediately, and the mannequin beside it (above) holds the same T as the shape
  it was aiming at. A body with no humanoid T (cranky's pincers, his leg arches)
  will stretch, and that IS the reading.
  IT IS EDITABLE, which is the point — judge the neutral pose and fix it in the
  same place. A drag under the T pose is still a BIND edit: the gizmo only ever
  writes `bone.position`, which IS the bind offset from the parent (the pose sets
  rotations and nothing else), and it writes it in the parent's POSED frame, so
  you push the limb where you want it while looking at the limb. On release the
  editor drops every rotation, reads the positions back at the bind pose, re-binds
  the skin THERE and re-applies the T — so the pose is never baked into the bind,
  and the mesh deforming live under the drag is feedback, not a save. The lateral
  axis comes from the rig's own shoulder (then hip) line, so it works whichever
  way a mesh faces.
- WHICH WAY THE REFERENCE FACES: the mannequin is built in the GAME's frame
  (`factory.buildRig` — faces +z, left at -x) while a rig file is authored in the
  RAW GLB's bind space, which faces +x with left at +z (the manifest `yawOffset`
  reconciles them at runtime, and the rig editor shows the raw asset, before it
  applies). Ghosted in unturned, the reference stood at 90 degrees to the mech —
  facing sideways on its own, feet and head pointing across the body while
  matching. `alignMannequinFacing` asks both bodies which way THEIR OWN left is
  (`up x left = forward`) and yaws the group by the difference, which also gets
  the MANNEQUIN-as-subject case right (the frames already agree; the answer is 0).
- RIG EDITOR EDITS ARE DRAFTS: every drag/undo/add/delete goes to localStorage
  (`saveDraft`, key `rigedit:<id>`), and the rig leaves through **Export rig ▶**.
  Nothing writes the rig file. (When it did, that writer and this one were both
  called `saveRig` — two declarations, one scope, later one wins — so every drag
  silently rewrote `src/mechs/rigs/<id>.rig.js` and fired Vite's HMR under the
  edit.)
- **JOINT OFFSET** mode in the rig editor (the button beside `Move`) authors
  `boneCorrections` by hand: the gizmo ROTATES instead of translating, and what
  you turn is stored as that joint's offset — degrees `[x,y,z]`, listed in the
  panel with a ✕ per joint and copied out as a manifest patch. It is how a rig
  says something bone positions cannot: "this thigh RESTS splayed, take 10
  degrees out of it before any clip plays". Edits persist as a draft
  (`rigcorr:<id>`).
- THE RIG EDITOR'S VIEW IS A PURE FUNCTION OF ITS DATA, and this is the rule to
  keep. Two things describe a rig — `rigObj` (bind bone positions, exported to
  the rig file) and `corrections` (joint offsets, exported to the manifest) — and
  everything on screen is those two plus two VIEW flags: which pose (`bind` /
  `tpose`) and whether the offsets are previewed. `renderView()` rebuilds every
  bone rotation from scratch each time (identity -> pose -> offsets), so it is
  idempotent; nothing captures a pose into a variable, because that is exactly
  what went wrong before — a captured "base" taken off bones that already wore
  the offsets folded them in, and every toggle laid them on again until the legs
  crossed. What falls out is what a user should be able to assume:
  A VIEW NEVER CHANGES THE RIG · switching pose or preview is always reversible ·
  the editing MODE is not a view flag at all, so Move ↔ Joint offset cannot move
  a joint. Two invariants keep it true: anything that READS bone positions or
  RE-BINDS the skin must run inside `atPlainBind()` (positions are read in world
  space, so a rotation anywhere up the chain would be measured into the rig file,
  and a rebind under a rotation bakes that rotation into the skin for good), and
  the offsets preview must be ON before a rotate drag (a turn is measured from
  the pose, so an unseen offset would be silently replaced rather than added to).
  Both are enforced in code; keep them that way.
- BONE ROTATION: a rig file carries POSITIONS ONLY, and adding a rest rotation to
  one would change nothing — `applyCustomRig` rebinds the skin at rest
  (`rebindRest`) and `RigAdapter` captures a rest offset per bone
  (`offset = jointWorld⁻¹ · boneWorld`), so both halves cancel it out exactly.
  The rotation lever that DOES work is `boneCorrections` in the manifest: degrees
  `[x,y,z]` per joint, post-multiplied in bone-LOCAL space after the retarget.
  It applies to custom-rig mechs too (the one place RigAdapter is constructed
  reads it). On a custom rig every bone rests unrotated, so bone-local x is the
  mesh's forward axis and a rotation about it is exactly adduction — which is how
  viper's running splay was fixed: `thighL [10,0,0]` / `thighR [-10,0,0]` took his
  standing knee lean from 12.5° outboard to 2.5° and the knee-lift peak from 44°
  to 21°/37°. Measure it with `node tools/legsplay.mjs <mech>` — and measure the
  BONES, which is what that tool does: the retarget drives bone ORIENTATION from
  the game's clean humanoid, but bone POSITIONS are the rig's own, so the virtual
  joints can read 10° inboard while the rendered legs are 15° out.
- NO WORKBENCH WRITES TO THE REPO. Every tool EXPORTS its edit as text you can
  read — `?edit=skin` **Export ops ▶** (a manifest patch), `?edit=rig` **Export
  rig ▶** (the bones array) and **Copy offsets ▶** (a `boneCorrections` patch) —
  and a human or an agent applies it. There was a save path once (the tools
  POSTed to `/__rw/manifest` and `/__rw/rig`, which the dev server spliced into
  `public/models/manifest.json` and `src/mechs/rigs/<id>.rig.js`); it was removed
  because a write you cannot see is a write you cannot trust. The SPLICING
  FORMATTERS remain and are how a pasted patch should be applied:
  `tools/manifestfmt.mjs` replaces one value in the JSON text (so a one-op change
  is a one-line diff, not an 80k-line reformat) and `tools/rigfmt.mjs` replaces
  only the `bones` array, keeping the header, `skinSpan`/`cutWelds` and the
  in-array comments. Edits still persist as localStorage DRAFTS while you work
  (`rigedit:<id>`, `rigcorr:<id>`), so a reload keeps them.
  SKIN OPS LEAVE PINNED. `{"comp":N}` is an ordinal into the proximity partition
  the CURRENT rig draws, so a rig edit renumbers it onto other geometry without a
  word (jerry's back once landed on his foot this way; a viper skin patch
  authored on the previous rig came back selecting his elbows). The workbench
  still WORKS in islands, but Export runs `pinSkinOps` (skinops.js) first and
  writes the vertex list each island meant — a vertex index is a property of the
  geometry, which no rig can renumber. Ops that arrive from elsewhere still
  carrying `comp` ids are only valid against the rig they were authored on: check
  them with `node tools/skindebug.mjs <mech>` before and after (the severity
  total moves the wrong way when they have shifted).
- SKIN WORKBENCH **Debug output ▶** downloads ONE self-contained HTML file for
  handing a deformation problem to someone else: two screenshots of the current
  frame (shaded + bone colours), the full tool state (mech, build, selected
  island, what is wiggling, live ops, camera) and the STRETCH MEASUREMENT at
  that exact moment — every edge over the limits, ranked, each named by vertex,
  bone and island, plus a by-bone-pair summary. The raw JSON is embedded in a
  `<script type="application/json">` block, so the file reads by eye and parses
  by machine. NOTE the caveat it prints in red: the skin workbench renders the
  RAW file (skinOps only), so `seamCuts` are NOT applied there and geometry the
  GAME has already separated still stretches in that view — wiggling jerry's
  elbow swings his hand, whose weld to the torso is cut in game and intact
  here. The panel says so whenever the loaded entry has seam cuts; judge a cut
  in Skin Debug, not in the skin workbench. (There was a "View with seam cuts"
  toggle here that swapped a CUT read-only copy of the geometry in, plus a "What
  moves?" (M) report of which bones' vertices travel. Both are gone: the preview
  bought a mode where nothing could be edited — the cut renumbers vertices, so
  every write had to be blocked — and neither answered the question as well as
  Skin Debug, which plays every clip. The warning note stays; the toggle does
  not.)
- Skin workbench selections: click = the bone-island under the cursor ·
  SHIFT-click = the BLEND PATCH (the run of geometry sharing that vertex's own
  bone plus a minority weight on another — the bit of torso that wiggles with
  an arm) · `Absorb enclaves` (E) hands every limb-bound island that sits
  inside another bone's region to the bone around it (`skinops.enclaveScan`).
  PAINT GEOMETRY (P) has three brushes: S/M/L round brush · **Loop** (screen
  lasso, paints the region verts you can SEE inside it) · **Slice** (the same
  lasso cutting THROUGH the model — near side, far side and anything buried
  between, for geometry you'd otherwise have to orbit around; the outline
  draws amber instead of violet to say so). In paint mode **C** re-picks the
  COLOR and **R** re-picks the REGION — the two you reach for mid-stroke — and
  the bone list doubles as the colour palette.
  A REBIND CAN BE ANSWERED TWO WAYS. "Rebind → click target" (Q) arms it, and
  then EITHER clicking that part on the model (fast when you can see the right
  part — it takes whatever bone owns that spot) OR clicking the bone's NAME in
  the list (exact, and it reaches a bone with no geometry left to click)
  completes it. The list header and its border go amber while it is armed. The
  bone list sits ABOVE the ops list, since it is the one you work in.
- SURFACE WALKING (`src/combat/climb.js`, dials in `TUNING.climb`) belongs to
  whichever roster def carries a `climb` block — today only JERRY, who PAID for
  it with his jets (`stats.noHover: true` empties the hover tank, so his second
  airborne A-press falls through to the ball tuck) and got the roster's biggest
  jump in the same trade. fighter.js owns four call sites and no logic.
  HE DOES NOT WALK ON THE FLOOR, HE WALKS ON THE WORLD: up a facade, over its
  lip, across the roof, down the far side, over the crates on the way, with no
  mode change and no scripted move anywhere in it.
  THE MODEL IS A FIELD, not a surface. Every frame the walker asks one question
  — what is near my feet — and answers it by gathering the live chunks, settled
  rubble, prop cylinders and terrain within `def.climb.reach` body-heights and
  reducing them to two numbers: `n`, the distance-weighted average outward
  normal (weight is `(1-d/range)²`, so what he stands ON outvotes what he walks
  PAST), and `cp`, the nearest point on any of it. That is the whole thing.
  THREE RULES FALL OUT OF IT. (1) ORIENTATION IS THE FIELD: `up` damps toward
  `n` at `tiltRate` and `fwd` damps toward his travel at `faceRate`, and the
  body frame is built from those two, so it is continuous BY CONSTRUCTION —
  there is no case analysis that can disagree with itself and nothing that can
  snap, because both vectors only ever move by a damp. (2) INPUT IS MAPPED
  THROUGH THE SAME ROTATION: the stick arrives as a world XZ direction and is
  turned by `Q = (world up -> body up)`, which is the identity on the floor (so
  ground movement is untouched to the bit) and a quarter turn on a wall, where
  "push away from the camera" becomes "climb". One rotation drives movement,
  facing AND the chase camera, which is why they cannot drift apart. (3) THE
  FEET ARE PULLED to `cp` at `stickRate` and never teleported to it, with
  de-penetration keeping the body out of geometry.
  EVERY CORNER IS THEN ARITHMETIC. Walk at a wall and its weight grows, so `n`
  tilts, so the same forward push starts carrying him up. Reach the top and the
  roof enters the field and takes over. Step past the far lip and the only
  thing in reach is the EDGE, whose normal rotates continuously from up to
  outward as he crosses it — so he tips over and walks down, with no wrap
  special case. Measured over one held stick: ground -> wall -> terrace ->
  wall -> roof -> far lip -> 49 units down, worst single-frame body rotation
  7.1° and ZERO unexplained movement.
  FLAT GROUND IS NOT CLIMBING, and that line keeps the feature cheap: the
  walker only takes over when something NOT flat is genuinely underfoot
  (`flatCos`), and gives the body back once it is upright again over flat
  footing — so dash, knockdown, the landing and the jump arc all stay with
  applyPhysics, and a mech walking about the arena runs none of this. (The
  arena's step-over is GONE with it: `Fighter.stepUp` and its hooks in
  destructible.js/arena.js were the "clips the building and hops up one block"
  artifact, and the walker subsumes them — a knee-high crate is just a surface
  with a gentle normal.)
  THE LIMBS ARE A SPIDER STEPPER (`conformClimbLimbs`, run after the GLB
  retarget has synced so it writes the bones a rigged model renders). Each limb
  has a HOME — the nearest surface to the spot under its own root, led along
  the travel — and lives in one of three states: PLANTED (tip pinned to its
  plant point, however the body moves), SWINGING (a lifted arc to a new home
  when the plant falls `step.len` x reach behind, or the limb nears full
  stretch), or AIRBORNE (home beyond full extension l1+l2, measured live off
  the bones: the limb reaches, gently, and plants nothing — weird poses are
  allowed, impossible ones are not). Diagonal pairs (ankleL+handR /
  ankleR+handL) swing together and alternate — a trot — and because homes come
  from geometry and travel, THE SAME RULE IS THE SIDEWAYS AND BACKWARD GAITS:
  strafing right, the right limbs lead because their homes do; backing up, the
  roles reverse because the travel did. No direction is special. The stepper
  owns the limbs whenever he is surfaced (every structure — which is where feet
  used to float over uneven tops), and on OPEN GROUND under target lock past
  `scuttleDrift` rad of strafe/backpedal: the crab scuttle. Plain running on
  open ground stays the animator's. Debug it with the `limbs=` column in
  `tools/climbprobe.mjs` (P/S/A per limb, every sample).
  BODY STABILITY is two dampings and a throttle: `normRate` pre-filters the
  field normal before the body follows it at `tiltRate` (a block seam becomes a
  lean, not a flicker), and while the frame is still TURNING toward the
  filtered normal, translation is throttled (`turnSlow`/`turnFloor`) — a
  surfaced body also never exceeds the fast-walk pace (`D.speed` x walk;
  running belongs to open ground). Stability over speed on complex territory.
  The other half of the look is the CROUCH in `def.climb.pose`: a mech STANDING
  on a wall is not climbing it, since a standing body's hands are 5.4 units off
  the floor.
  THE WAY OFF IS THE JUMP. A direction held is a real leap that way
  (`leapMult`/`leapRise`, with a `leapOut` floor of outward speed so a stick
  aimed back into the face still clears it); nothing held is a plain LET GO —
  no push, no arc, straight down like any other mech, with `_climbRelease`
  stopping the face he is sliding past from catching him again (it expires on
  landing or in open air, never on the jump button, which fires in the same
  frame that sets it).
  THE CLIMB CAMERA (camera.js, `CLIMB_CAM`) INTEGRATES — it never takes its
  orientation from a surface, because surfaces are discontinuous and cameras
  must not be. It keeps a persistent orbit direction (mech -> eye) and each
  frame turns it a bounded number of degrees along a great circle toward a goal
  blended from his own up (smoothed again, slower than the body), world up
  (the horizon bias — you watch from above-and-outside, and the screen never
  rolls), and the reverse of his travel (it trails him). A deadband ignores
  seam jitter, and the rate cap makes a FLIP impossible by construction: the
  only path from behind one face to behind the other is the smooth crane over
  the building. Engaged/released by an eased blend seeded from where the
  camera already is, with the ordinary azimuth synced underneath so the
  hand-back lands on the view the player is looking at. It runs in BOTH camera
  paths (the solo combined view and the split chase cams), TARGET LOCK never
  steers the orbit while he is surfaced (the lock chases a bearing built from
  yaw, and a wall-walker's yaw is whatever the stick last said — the whirling
  camera was exactly that), and the occlusion fade stays OFF for a climbing
  player's view: you cannot read a climb against a wall you can see through.
  THE CPU DOES NOT SURFACE-WALK (`climbStep` returns early for `isAI`): nothing
  in ai.js can want height, so a latched CPU would climb whatever it walked
  into and then sit up a tower pressing forward.
  Judge it with `node tools/climbprobe.mjs "<battle url>"` — five scripted
  scenarios, every frame measured, reporting the WORST single-frame body
  rotation (a damp cannot exceed a few degrees; a plane swap used to flip it
  90°) and the worst unexplained movement (the step-over used to show up here
  as a 2.8-unit hop), plus each hand's and foot's distance to the nearest solid
  — and `node tools/climbshot.mjs <out-prefix>` for the pictures.
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
- WHERE THE ANKLE BONE GOES: at the TOP OF THE SOLE PLATE — about `0.32 * scale`
  above the sole (~4.5% of body height), NOT at the lowest point of the
  geometry. It is the hinge the gait rolls the foot around, so it needs a foot
  underneath it: `Animator.calibrateFeet` measures `footDepth` (ankle above
  sole) and DAMPS the authored heel roll by `convention/depth` when the bone
  sits high (`ankleGain`, floor 0.25, plus a `footFlat` levelling ask), while at
  `depth <= 0.02` it gives up and keeps the default. `ankleGain 1.00` +
  `footFlat 0` is the target. `node tools/ankleprobe.mjs [mech …] [--chains]`
  measures sole/ankle/depth/gain for every mech on both sides and FAILS on any
  bone at or below its sole (nothing is, today); `--chains` prints the whole leg
  with each bone's share of the FOOT PLATE, which is what distinguishes an ankle
  MIS-MAPPED onto a hock (fix with `boneOverrides` — no weight moves, as
  saurion's `bone_8` -> `bone_9`) from one merely placed high (fix in the rig
  file — vulcan, wraith). Neither fix is free: moving an ankle re-draws the
  proximity partition around it, so measure `tools/skindebug.mjs` before and
  after and expect to reject some (titanus 3158 -> 11661, glacier +18%, cranky
  +32% — all left as found). `buildSkeletonBones` clamps a custom rig's bones to
  y >= 0 so a rig edit can't bury a foot under the arena floor.
- Hitboxes: `src/combat/hurtbox.js`. Bone-bound capsules measured off each
  model's own geometry, so they follow the animation; melee resolves on the
  striking hand/foot (clip `strikeArm` / `strikeLimb`, else the extremity
  leading furthest forward), and bullets/beams test the swept segment.
  `Fighter.hitRadius` is unchanged and still owns AoE falloff + broad phase.
  THE PART TABLE DESCRIBES A HUMANOID, and `bucketsFromSkin` folds every
  non-game bone UP into its nearest named ancestor — right for a finger, a
  disaster for a body that is not a humanoid (cranky's four extra crab legs all
  landed in the `hips` bucket, which then could not contain any of them). So any
  bone carrying >=1% of the mesh that the 15 joints cannot name gets its OWN
  capsule, `x:<bone>`, derived from the skin so a new rig is covered the day it
  lands. ADDITIVE — the ancestor keeps its geometry, so no existing capsule
  changes; taking it away instead was measured and cost nine mechs their
  containment. Extras are capped at half the torso radius (they are appendages;
  uncapped, a capsule at the end of a spear bloats the target). Judge it with
  `node tools/hurtboxfit.mjs` (contain must not fall, bloat should sit near 1.0)
  and `node tools/hitprobe.mjs` A/B'd against a stashed copy — the connect rate
  swings ±5 points run to run, so a single run proves nothing.
- MELEE AUTO-AIM steers a live swing on BOTH axes, in `fighter.js`:
  `aimStrikeAt` laterally (torso twist + palm clamp) and `elevateStrikeAt` in
  HEIGHT — the striking limb is pulled into the target's CHEST-TO-CROWN band
  (`MELEE.AIM_LO`/`AIM_HI`) by pitching its shoulder (punch), thigh (kick) or
  torso (bite), so blows land on the upper body instead of a waist or thin
  air. A swing already arriving in the band is left as authored. Judge it with
  `node tools/aimheight.mjs "<battle url>"` (a fight played twice, servo off
  vs on, every landed blow reported as a fraction of the victim's height) and
  `node tools/aimshot.mjs <attacker> <victim> <out> [light|heavy] [dist]`
  (the impact frame frozen side-on, both ways).
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
- Paint jobs (`src/mechs/colorscheme.js` — 11 schemes, cycled in mech select):
  a scheme is a PAINT TARGET (hue + a saturation floor OR ceiling + the
  LIGHTNESS the paint wants), never a plain hue swap. The lightness is what
  makes the white/black/silver mechs work: each mech's armor is dragged 80% of
  the way to the scheme's value, so WRAITH's EMBER is really red instead of
  still black, while a mech already in the midtones barely moves. One source of
  truth for both routes — the procedural path rewrites `skin.primary.base/base2`
  and pbrtex re-synthesizes, `recolorglb.js` runs the SAME `schemeSat`/
  `schemeLum` over the baked GLB textures. Which pixels count as "the paint" is
  per-mech (`neutralMix`): a vivid mech's armor is its saturated stock-hue
  family; a near-grey mech's armor is the NEUTRAL pixels and its few saturated
  ones are accents to protect. Judge a change with
  `node tools/schemesheet.mjs <mech> out.png <schemeIdxCsv>`.
- FIRE IN THE TEAM COLOUR (`colorscheme.js` schemeFire / `fireTintOf`): a
  repainted mech's FLAMES answer to the paint — inferno in AMETHYST breathing
  purple, in VERDANT green — but only where it reads as a deliberate colour.
  White, silver, black and brown are what ordinary fire looks like against soot,
  and tinting those just looks broken, so the rule comes off the scheme's own
  numbers rather than a hand-kept list: a scheme tints when it has a chromatic
  FLOOR (`minS`) and is not desaturating on top of it (`satMul >= 0.8`, which is
  what excludes UMBER). MIDNIGHT/IVORY/SILVER cap saturation instead of flooring
  it and fall out on the first test. TIDE's blue gas flame used to be a
  hard-coded `fireCool(def)` boolean; it comes out of the same formula now.
  TWO MECHANISMS, because there are two kinds of flame. The SHADER fires
  (FlameFX cards, the fire tornado's shells, the jet tube) take the four ramp
  stops as uniforms — dark base, body, bright, white heart — generated at the
  scheme's hue from one profile, so every colour is the same fire. The SPRITE
  fires (the particle pools) cannot: `flameAtlasTexture` bakes the orange ramp
  into its own pixels with red pinned at 255, so multiplying a tint over it
  gives mud. Those rotate the sampled texture's HUE instead (`hue` on
  ParticlePool.emit, `aMisc.z`), which moves the whole baked ramp together and
  keeps the hot core hot. 0 = untouched, so every untinted particle in the game
  is bit-identical.
- Work-in-progress mechs: a roster def flagged `hidden: true` (currently
  AEGIS + NOVA) is kept out of the GAME's roster — mech select, RANDOM
  picks, CPU picks, title line-up — until SETTINGS → SHOW ALL ROBOTS is
  turned on (persisted in `rw.showAllRobots`). Every workbench (`?showcase`,
  `?rigedit`, pose/skin tools, `?battle=...`, the level editor) always sees
  the full `ROSTER`, so iteration is unaffected. Game code that offers mechs
  must go through `playableRoster()` / `isPlayable()` from `roster.js`.
- MECH-SELECT POSTERS (`public/posters/`, `src/ui/posters.js`): flipping
  through the roster shows a pre-rendered PNG per mech and builds no model;
  the real body appears after 0.7s of rest or on lock-in. A poster stands in
  for THE GLB (the default body — so that is what it must be rendered from,
  with alpha), framed through the select stage's own camera
  (`menustage.aimPreviewCamera`) and recorded as a world-space box off the
  mech's feet, which the runtime projects live so one render serves 1-4
  pickers. Regenerate with `node tools/posters.mjs` after any change to a
  mech's model, rig, rest pose or scale; it refuses to write a procedural or
  opaque poster. A NAMED run (`node tools/posters.mjs viper rhino`) MERGES into
  `posters.json` — it used to rewrite the map from empty, which deleted every
  other mech's box, and a mech with no box has no poster at all as far as
  `posterMeta` is concerned (mech select quietly goes back to building a model
  per keypress, with the unused .png still sitting on disk). Check the handover
  with
  `node tools/postercheck.mjs viper cranky,jerry <4 ids>` — it reports
  poster-vs-model drift in pixels per slot at each player count. NOTE any
  harness that builds preview mechs must `await loadManifest()` first, or
  `manifestHasGlb()` answers false and the stage quietly shows procedural.
- BAKING A MECH (`node tools/bake-glb.mjs <id> [--apply]`) folds every runtime
  edit — custom rig, skinOps, `seamCuts`, reparent, stretch, bonePos, rig posts —
  INTO the .glb, strips those manifest fields and deletes the rig file, leaving
  one revertible commit. `--apply` first archives the untouched asset to
  `public/models/source/<file>.glb` (once — a re-bake never overwrites the true
  original) and writes `public/models/source/<id>.edits.json`: every folded field
  with its values, plus the rig file's text, so a baked model stays explainable
  without digging through git. Paths come from the entry's `url`, not from the
  mech id (jerry's primary model is `mech_jerry_alt.glb`). A dry run restores the
  tree even if a step throws. THE BUILT-IN FIDELITY CHECK ONLY SEES THE 15
  JOINTS — it cannot see skinning or a glbanim `post` hook that stopped firing,
  so after a bake also run `tools/skindebug.mjs <id>` (same findings?),
  `tools/weldmap.mjs <id> --list` (same welds?) and re-render the poster.
  A baked model keeps its seam record as `rwSeam` mesh extras, so the skin audit
  still knows a deliberate split from a crack.
- Model set: the GLBs in `public/models/manifest.json` are the DEFAULT for
  every mech; `?debug=fallback` forces the procedural roster (also the
  automatic fallback for a mech with no manifest entry or a broken GLB).
  `?debug=3d` is the old opt-in flag and still means GLBs.
- ARENA PROP COST: props are an object-count problem, not a triangle one (they
  were ~45-80% of a frame's draw calls for 3% of its triangles, because each is
  a pile of small meshes and the toroidal wrap clones the lot into 8 neighbour
  cells). Three levers, each revertible on its own:
  `mergePropMeshes` (src/arena/props.js) bakes each placed prop's meshes
  together by material — after the colliders are measured, before the ghost
  clones — and `?props=raw` turns it off; `node tools/propopt.mjs [--apply]`
  shrinks the imported prop GLBs, keeping the untouched originals in
  `public/models/props/source/` (`--restore --apply` puts them back); and
  `preloadPropModels(themePropNames(theme))` fetches only the models the arena
  places instead of all twenty. The GLB diet is SIZE-PRESERVING: the decimation
  error budget tightens per model until the bounding box matches the original
  (`node tools/propopt.mjs --audit` proves it for all twenty, and FAILS on
  drift). Judge the models in `/workbench/?edit=props` — original and optimized
  in twin viewports with one shared camera, with triangle/texture/VRAM/file
  deltas and a size check; the mesh merge is judged by flipping `?props=raw`
  on a battle URL, since it changes draw calls and not pixels.
- THE ARENA EDITOR (`/workbench/?edit=level`) EDITS THE SHIPPED ARENAS, not just blank
  canvases. Pick one of the 12 from the top-bar dropdown and it is BAKED: the
  arena is built for real, exactly as a match builds it, and every massed
  tower, every prop with its own yaw and seed, the lanes, hills, bridges,
  pools and the elevated loop come back as objects you can click. The `seed ⟳`
  button rerolls that arena's layout; `?edit=level&arena=<theme>` opens one
  directly, `&seed=<n>` picks the layout, `&theme=<id>` still means a BLANK
  level on that theme and `&load=<name>` still edits
  `public/levels/<name>.json`. `?battle=<theme>&level=<name>` plays one.
  IT IS A WORKBENCH like the rest: it lives at `/workbench/?edit=level`, imports
  no game code, and reaches arenas / themes / props / the palette / the level
  format / the playtest hand-off through `config.arena` (contract.js documents
  it, `workbench/adapters/robotworld/` answers it, and the palette of placeable
  things is adapter data in `arenapalette.js`). The old game-page url
  `?edit=level` redirects here carrying `arena`/`seed`/`load`/`theme`. So the
  GAME PAGE now carries no authoring surface at all, and a `RW_DIST=1` build —
  which drops the /workbench/ page — contains none of the editor.
  `Arena` writes its `recipe` ONLY when the theme says `recordRecipe` (the
  adapter's `arena.build()` is the one caller that does): a match has no use for
  the placement list and should not be building it.
  THE BAKE READS A BUILT ARENA rather than re-running the generator: `Arena`
  writes every building and prop it places into `arena.recipe` as it places
  them (raw tint — the authored path re-applies `tintFor`), Terrain already
  keeps its lanes/hills/bridges/patches/viaduct as plain data, and
  `src/arena/bake.js` assembles the level from both. So there is no second
  copy of the generation rules to drift when the scatter is tuned. Prove the
  round trip with `node tools/arenabake.mjs` — it bakes all 12, rebuilds each
  through `themeFromLevel`, and diffs what combat can touch (chunks, props,
  hazards, every terrain feature). Note it deliberately does NOT count
  `propBodies`: a prop's collider is measured off its built bounding box and
  props swap in a generated GLB the moment one finishes streaming, so the same
  theme at the same seed already disagrees with itself by a body or two.
  Three things the format grew for this: a building may carry `cells` (an
  explicit massing silhouette) instead of nx/ny/nz, a level may carry a
  resolved `viaduct` block (`L.viaduct` is no longer forced to null, and
  `r0` pins the ramp positions), and viaduct PIERS are now placed for authored
  levels too — they are derived from the deck, so they are never recorded into
  the recipe or a bake would leave a second set behind.
  INTERACTION IS ON SCREEN, not in a panel: click to select, shift-click to
  add, shift-drag empty ground to marquee · DRAG a selected object to move it
  and the whole selection travels · ALT-drag leaves a copy behind · a small
  toolbar rides above the selection (turn / copy / delete / properties) · R
  turns the selection about its own centre. THE GIZMO IS ROTATE-ONLY — a
  translate gizmo sits exactly on top of the thing you want to grab and eats
  the drag, which is what it did. The palette is a drawer behind ＋ ADD and the
  properties panel only exists while something is selected.
  Editor: `src/editor/`, loader + authored-placement format:
  `src/arena/level.js`.

## Mech art pipeline — READ `docs/MECH_ART_GUIDE.md` FIRST

That guide is the master manual for turning concept images into in-game
mechs (both routes: external rigged-GLB services and the free in-engine
sculpted route), including **§5 THE CONTRACT** — per-mech joints/anchors
that combat silently depends on. Never rebuild a design without it.

## Architecture map

- `src/core/` — engine (renderer/loop/post-FX), pbrtex (PBR skin synth),
  textures (canvas tex), audio (WebAudio synth), music (the battle
  soundtrack: every file in `src/music/` is a song, listed by the `rw-music`
  vite plugin, filename = title — drop one in and it joins the rotation.
  STREAMED, not bundled: copied to `dist/music/`, fetched on demand.
  `?music=0` or a `RW_NO_MUSIC=1` build turns it off), utils.
  THREE TUNING LAYERS, don't confuse them: `tuning.js` = the GAMEPLAY DIALS
  every mech shares (stamina durations, pace, dash, guard arc, hit reactions
  — the file to edit for feel; costs are stated as SECONDS/fractions of a
  full bar and the per-second rates are derived), `config.js` = PLAYER
  settings the settings menu writes (robot speed, round time, music volume,
  persisted to localStorage), `mechs/roster.js` = PER-MECH balance.
  PUPPET ANY OF IT LIVE from the console — `rw.help()`: `rw.set(<CONFIG
  path>, v)` lands immediately (CONFIG is read at the point of use);
  `rw.tune(<TUNING path>, v)` stores a session override and reloads, because
  fighter.js snapshots nearly all of TUNING into module consts at load and a
  live write there silently does nothing (`?tune=a.b:1,c.d:2` is the same
  thing in a URL, `rw.tunes()`/`rw.untune()` list and drop them). An UNKNOWN
  url param now warns with a did-you-mean instead of being ignored —
  `core/knobs.js` owns the list and `node tools/params.mjs` fails if it drifts
  from what the source actually reads.
- `src/mechs/` — roster.js (ALL stats/palettes/skins/moves — balance lives
  here), designs/<id>.js (one file per mech; parallel-agent-safe), parts.js
  (sculpting vocabulary + Assembler), factory.js (rig + materials),
  animations.js + animator.js (pose-blend engine), gltf.js + rigadapter.js
  (GLB loading + humanoid retargeting), roster `skin` blocks drive pbrtex
- PER-ROUTE animation: when a move only works on ONE of a mech's two models,
  author it as a `GLB_CLIP_VARIANTS` entry compiled under the SHARED clip's name
  and point the mech's glbanim profile `clipOverrides` at it. The roster keeps the
  shared name, so every check keyed on `def.heavyClip`/`isPlaying`/the mirror
  alternation matches either build and the procedural one keeps the default.
  Colossus is the worked example (clap on the GLB, pound procedurally) — and note
  a clip in `SMASH_MIRRORS` needs its `*Mirror` name overridden too, or half the
  swings fall through to the shared clip
- `src/combat/` — fighter.js (state machine), specials.js (24 specials/ults
  by id), projectiles.js, effects.js (pooled VFX)
- `src/arena/` — themes.js (12 arena configs), arena.js, destructible.js
  (instanced chunk buildings), props.js
- `src/game/` — boot.js (screen flow), world.js, match.js, camera.js
  (combine/split), input.js, ai.js, predict.js (menu-idle prefetch: pre-ROLLS
  the RANDOM arena / robots / next song so the menus can consume the same
  values it downloaded — `?prefetch=0` off); `src/ui/` — menus.js, hud.js
- `public/models/manifest.json` — drop rigged GLBs here to override any
  mech's procedural model (auto-fallback if missing/broken)

## House rules

- Before committing: `git config user.email noreply@anthropic.com && git config user.name Claude`.
- Parallel agents may only fan out over `src/mechs/designs/<id>.js` and
  `src/arena/{themes,props}.js` — everything else is shared, single-writer.
- Verify visually (screenshots) before claiming art changes work; verify
  `npx vite build` + a soak before claiming combat changes work.
- RE-RIGGING NEVER LOSES ANCHORS. Muzzles/anchors in `manifest.json` are
  hand-placed by the owner: a new or edited rig re-expresses them on the new
  bones with the SAME rest-pose world position + aim, it never drops them or
  leaves them on stale numbers. Only a brand-new GLB with no authored muzzles
  may fall back to auto-generated ones. Prove it with
  `node tools/anchorkeep.mjs <id>` (`--remap R=<bone>,L=<bone>` emits the
  preserved numbers) — see MECH_ART_GUIDE §5.
- ALWAYS finish a task by merging your feature branch into `main` and
  pushing `main` — the owner plays off `main`, so work left on a branch is
  work they can't see. Push the branch too, then
  `git fetch origin main && git checkout -B main origin/main &&
  git merge --no-ff <branch>`, re-run the build, and push. (There is a
  stale local `main` with an unrelated history in some clones — always
  re-point at `origin/main` rather than trusting whatever `main` is
  checked out.)
