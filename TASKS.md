# ROBOTWORLD — 3D Mech Battle Game — Task Tracker

Browser-based 3D mech arena fighter in the spirit of **Override: Mech City Brawl**.
12 unique mechs, destructible city arenas, local multiplayer (keyboard + Xbox
controllers via Gamepad API), AI opponents.

> **Process note:** This file is the source of truth for progress. Update the
> checkboxes and the "Current status" section after every phase and commit it,
> so work can resume cleanly if a session is interrupted.

## Current status

- **Phase:** ALL 10 PHASES COMPLETE ✅ — game shipped on this branch
- **Next action:** playtesting feedback / tuning
- **Latest:** THE STEPPER STOPS FLICKERING: LONGER STRIDES, FRONT LIMBS
  ANTICIPATE, TWO LIMBS STAY DOWN. Owner: "Jerry's legs are moving a bit too
  fast (looks like flickering) when climbing... reach them a bit further and
  when moving in a direction first move the closest foot (aiming for the
  anticipated location based on the direction/speed of movement) and stretch
  each limb longer in anticipation... If the robot stops moving, the feet can
  shift locations to find a more comfortable position relative to the body, but
  while moving the front legs should anticipate the next location and the back
  legs should just follow based on where the body moves" — plus, on the support
  rule: "the emergency would only be if a single limb had a plant. He should be
  okay with only 2 feet planted at a time while climbing."
  FRONT vs BACK is measured against the travel direction (is this limb's root
  ahead of the body?), so the same rule covers forwards, up, sideways and
  backwards and the roles swap by themselves on a reverse. Front limbs take
  `step.lead` (0.13 -> 0.26s) of velocity and splay wider with speed
  (`step.stretch`); back limbs take `leadBack` 0.04 and get a much longer leash
  before they must step (`lenBack` 0.90 vs `len` 0.48 -> 0.62 x reach), because
  landing already behind means the front limb's threshold re-steps them within
  two frames.
  WHO GOES FIRST: the survey/step split is now two passes, so the pair carrying
  the limb furthest off its home starts, with the thumb on the scale for the
  FRONT ones.
  THE SUPPORT FLOOR replaces the old per-limb emergency: a limb lifts only if
  two others stay planted, and one with no plant to give up may always lift. A
  plant past full extension may jump the pair queue but not the floor.
  ANTI-FLICKER: the home is damped (`homeRate`), a fresh plant is held
  (`dwell`), and — the misdiagnosis worth remembering — "plant far from home"
  used to count as an emergency that bypassed the pair gate, and since that
  error grows at body speed it fired several times a second. An emergency that
  frequent is the cadence, not an emergency.
  Also: the composed probe offset (splay + drop + lead) is clamped into full
  extension, or all three add up on a fast body and every ladder rung fails
  over good ground (measured: both legs reading AIRBORNE through a full-speed
  backpedal).
  Measured (climbprobe): on the wall at most two limbs swinging, usually one,
  two-to-three always planted; `PPPP` with tip errors 0.08-0.67 at a standstill;
  worst per-frame body rotation and unexplained movement unchanged; rendered
  split-screen pass clean. KNOWN ROUGH EDGE, unchanged by this pass: the
  open-ground crab scuttle still reads AIRBORNE on a limb pair at full speed
  (the arms on a strafe, the legs on a backpedal) — that is flat ground, not a
  structure, and it predates this work.
- **Previous:** THE TUCK BECOMES BLOCK'S ALONE, JERRY FLIES, AND FLIGHT GROWS A
  BOOSTER FLAME ON ANCHORS. Owner: "let's not have A button do the
  descending-from-flying shield/flip anymore, let's just let the block button do
  it, so the action is more optional and less error prone. Also, let's have
  Jerry able to fly too. Also for flying in general, can we generate a
  white/yellow booster fire effect that comes out of the robots' feet when they
  fly. Add that as a muzzle so that I can move it to other locations for
  specific robots."
  THE TUCK: A had four meanings (jump, double-jump, ignite the jets, and — tank
  empty and falling — curl into the descent ball), so the ball arrived by
  accident every time a flight ran dry. The fourth is deleted; `startAirRoll`
  takes no argument, the only way in is BLOCK pressed AIRBORNE, and it is held
  by BLOCK plus the stamina that funds it.
  JERRY FLIES: `stats.noHover: true` off his def. The flag stays supported (no
  mech sets it now) because "this frame has no jets" is a real design choice.
  THE FLAME (`effects.booster` + `Fighter.boosterJets`): a white-hot heart at
  the nozzle, two short yellow flipbook tongues down the exhaust and a spit of
  sparks — a torch, not `fire()`'s burning fuel, with the atlas's baked orange
  ramp walked up into yellow by a hue rotation rather than a tint over it.
  IT COMES OUT OF ANCHORS: every build now carries `boostL`/`boostR` under the
  soles (factory.js + gltf.js), and boosterJets burns EVERY anchor whose name
  starts with `boost` — so moving a mech's thrusters is anchor work in the
  animation workbench plus a pasted `muzzles` entry, and `boostBack` (etc.) in
  that entry just gives it more nozzles. Aim follows the muzzle rule: an
  authored `rot` exhausts along the anchor's own +Z, no rot thrusts down the
  BODY's -Y — the right default for a foot jet, since an ankle's local axes
  rotate with every step.
- **Previous:** THE ROOFTOP CAMERA GETS A POLE CLAMP AND THE PLAYER'S HANDS; THE
  LIMBS REACH OUT. Owner feedback on the spider pass: on top of a building the
  camera parks straight overhead where the pitch stick does nothing and yaw just
  spins ("perhaps it's gimbal lock" — it is: a spherical orbit AT the pole has
  no defined azimuth), and the feet plant too close under his center — limbs
  should PREFER extending outward, inward being the pole-hug last resort, with
  the symmetric spread evening the extensions out around the body.
  THE CAMERA (`CLIMB_CAM`): the goal's POLAR angle (off his up) is clamped away
  from both poles (`polarMin`/`polarMax`), its azimuth falls back to wherever the
  camera already is when the goal itself is vertical (the rooftop case — that is
  what keeps yaw meaningful up there), and the player's pitch stick slides a
  persistent polar offset while yaw turns the orbit about his up directly — the
  camera can always be pulled down to a near-horizontal view, from anywhere, and
  stays where it is put. Wired in both paths: the split chase reads its own
  stick, the solo view taps raw look pulses in `applyLook` (the blended-away
  offsets are unreadable while the climb cam owns the orbit).
  THE LIMBS: each carries a SPLAY (its outboard direction in the body frame,
  feet biased back, hands forward) and the home search is a LADDER out along it
  — outermost rung first (`step.spread` x reach), walking inward only when the
  outer rungs have no reachable surface. A building face answers the first rung
  and the limb plants EXTENDED; a pole fails the outer rungs and the grip closes
  in. Measured by the probe's new `spr=` column (mean planted-tip distance from
  the body center).
- **Previous:** THE CLIMB CAMERA INTEGRATES, THE LIMBS BECAME A SPIDER. Owner
  reports: the camera "kind of flips around so you get confused" going up and
  over a building; feet float in the air as a neutral pose on uneven ground; the
  body flickers between orientations on complex territory.
  THE CAMERA (`CLIMB_CAM`, camera.js): the flip had two sources — under target
  lock, `azimuthBehind` chases a bearing built from yaw, and a wall-walker's yaw
  is whatever the stick last said (the orbit whirled); unlocked, the camera never
  came around the building at all, so he vanished behind it (the fade is off for
  climbers by design) and every manual correction read as a flip. The fix is the
  gravity-game rule: a camera never takes orientation FROM a surface — it
  INTEGRATES. A persistent orbit direction turns a bounded number of degrees per
  frame along a great circle toward a goal blended from his smoothed up + world
  up + the reverse of his travel, with a deadband for seam jitter. A flip is
  impossible by construction; going over a roof is one crane move. Runs in BOTH
  camera paths (solo combined + split chase), lock never steers while surfaced,
  azimuth synced underneath so the hand-back is seamless.
  THE LIMBS (`conformClimbLimbs` rewritten as a stepper): each limb has a HOME
  (nearest surface under its own root, led by travel) and is PLANTED (pinned),
  SWINGING (lifted arc, `step.time`), or AIRBORNE (home beyond full extension
  l1+l2 measured live — the limb reaches, plants nothing). Diagonal pairs
  alternate — a trot — and because homes come from geometry and travel, the same
  rule IS the sideways and backward gaits: no direction is special. Measured on
  the wall: SPPS<->PSSP alternation, tips 0-0.3 from the surface, PPPP when
  stopped — feet planted at rest instead of floating. Also the crab scuttle on
  open ground under target lock past `scuttleDrift` of strafe/backpedal (probe
  scenarios 6-7); plain ground running stays the animator's.
  THE BODY: `normRate` pre-filters the field normal (a seam is a lean, not a
  flicker; worst per-frame body turn measured 6.9 -> 3.0-4.6 deg), translation
  throttled while the frame is still turning (`turnSlow`/`turnFloor`), and a
  surfaced body is capped at fast-walk pace — stability over speed.
  Debug surface: the `limbs=` P/S/A column in tools/climbprobe.mjs (a dedicated
  workbench panel was considered and deferred — the stepper is procedural, not
  gait-table data, so the gait workbench cannot host it without a new adapter).
- **Previous:** CLIMBING REBUILT AS A SURFACE WALKER, from scratch. The owner's
  report: walking Jerry into a building clipped it, hopped him up one block, made
  the building turn transparent, and flipped his facing between forward and
  upward. Every one of those is the same root cause — the old code ATTACHED TO
  ONE PLANE, and a single plane cannot express a corner, so every corner was a
  discontinuity with a scripted special case bolted over it.
  THE NEW MODEL NEVER NAMES A SURFACE. Each frame it asks what is near his feet
  and reduces the answer to a FIELD: `n`, the distance-weighted average outward
  normal of every live chunk, settled rubble block, prop cylinder and patch of
  terrain in reach, and `cp`, the nearest point on any of it. His `up` damps
  toward `n` (literally "the average orientation his feet indicate"), his stick
  is rotated by the same `Q = world-up -> body-up` (identity on the floor, a
  quarter turn on a wall), and his feet are eased to a standoff off the surface.
  That is the whole thing — and every corner in the arena becomes arithmetic:
  walking at a wall grows the wall's weight until forward IS up; stepping past a
  roof lip leaves only the EDGE in reach, whose normal rotates from up to outward
  as he crosses it, so he tips over and walks down with no wrap special case.
  MEASURED on one held stick: ground -> wall -> terrace -> wall -> roof -> far lip
  -> 49 units down, worst single-frame body rotation **7.1 degrees** and **zero**
  unexplained movement (the probe now measures continuity every frame, which is
  the thing that was actually broken).
  DELETED: `Fighter.stepUp` and its hooks in destructible.js/arena.js — that was
  literally the "hops up one block"; the walker subsumes it, since a knee-high
  crate is just a surface with a gentle normal. Also `arena.climbProbe`,
  `propClimbProbe`, `destructo.climbProbe`/`columnTop`/`columnBase`, and the
  attach/top-out/wrap phases.
  THE CAMERA NO LONGER GHOSTS HIS BUILDING: you cannot read a climb against a
  wall you can see through, so the occlusion fade is skipped for a view whose own
  player is surface-walking, and the chase ORBIT is rotated into his frame by the
  same `upRotation` — the offset that sits behind-and-above a mech on the ground
  sits outside-and-behind one on a facade. Moved, never rolled: screen up stays
  world up, so a vertical climb reads as moving up the screen, which is what the
  stick does too.
  One real bug found by the rewritten probe: the stick-pull targeted the sample
  point rather than the standoff, burying his feet 0.5 units under the pavement.
- **Previous:** THE CLIMBING MODE IS GONE — Jerry is simply always climbing, which
  is both what the owner asked for and a lot less machinery. Walk into anything
  too tall to step over and he takes it; JUMP at one and he lands on it, contact
  alone, nothing held and nothing pressed. Deleted with the mode: the grab press
  and its timer, the stick-at-rest exit clock, the airborne direction gate, the
  stamina drain on the grip, and the LIGHT-attack grip (which existed to stop the
  rest clock dropping him — with no clock, letting go of the stick already leaves
  him holding on, so LIGHT goes back to being his attack).
  THE JUMP IS NOW THE WHOLE EXIT, and it reads the stick: a DIRECTION HELD is a
  real leap that way (`leapMult`/`leapRise`, with a `leapOut` floor of outward
  speed so a stick aimed back into the face still clears it rather than
  re-latching); NOTHING HELD is a plain let-go — no push, no arc, he drops
  straight down like anyone else, and a `_climbRelease` latch stops the face he is
  sliding past from re-grabbing him on the way down (it clears when he lands or
  jumps again). The jump also works DURING the lip haul now: that is half a second
  of scripted travel, and swallowing the input for it was half a second of dead
  controller. Verified by probe: full traverse on one stick hold (up three tiers,
  across, wrap over the top, 49 units down, walk on), stick released mid-wall
  parks him at y=6.10 with feet 0.0-0.1 off the face indefinitely, and both jumps.
- **Previous:** CLIMBING IS A MODE now, and nothing about it snaps. The rework, on
  owner feedback ("orientation gets weird after climbing a little bit", "only a
  little push", "climb over everything until the stick rests"):
  ORIENTATION — the climb code no longer writes `f.yaw` anywhere. On the wall the
  body faces the way it is TRAVELLING (up climbing, sideways scuttling, head-first
  DOWN descending), reached by the same damp a ground turn uses; the horizontal
  heading underneath stays with the ordinary stick-driven yaw servo, so both ends
  of the ground↔wall slerp are always live, damped frames — attach, detach and
  top-out are all the turn a player already knows. The two hard snaps (yaw forced
  to face the wall on attach, and again at the lip) are gone, and when the blend
  finishes the group's rotation is squared off once, so no residual tilt can
  linger in the euler channels `rotation.y = yaw` never touches.
  THE MODE — in: a LITTLE push into a face (`grabSeconds` 0.34 -> **0.15**), or
  jumping at a building with a direction held (latches on impact; no direction
  and he bounces off like anyone else). Out: the stick at rest for `restSeconds`
  (0.25) — back to standing or falling, whatever the spot he is in would do.
  While it is on he climbs EVERYTHING he touches: walls with no gate, lips hauled
  over, and walking off a roof edge WRAPS him straight over onto the face below,
  head-first — the edge crouch/decision window is deleted wholesale. Holding
  LIGHT on a wall is the GRIP: he stays put (no punch), ignores the rest clock,
  and keeps the mode on release if the stick is held. A still springs him off,
  and the mode survives it, so jump-and-regrab works.
  Two real bugs the probe caught on the way: the attached re-probe took the
  first non-null of its two heights instead of the NEAREST face, which switched
  a descent below a terrace onto the tower three units behind it; and the
  bottom-of-face check would snap him UP onto a column base above his feet —
  the ledge he had just wrapped over — making a once-a-frame teleport loop at
  every terrace lip. Verified end to end by `tools/climbprobe.mjs` scenarios:
  push-up-over-across-wrap-down-walk-on in one stick hold, rest-exit mid-wall,
  mid-air latch from a jump, and the light grip. Files: `src/combat/climb.js`
  (rewritten), `src/core/tuning.js`, `src/combat/fighter.js`, tools.
- **Previous:** JERRY CLIMBS BUILDINGS, and has no jets. The trade: `noHover` empties
  his hover tank (his second airborne A-press now falls straight through to the
  ball tuck, which is what an empty tank has always meant), his jump goes 24 ->
  **30** — the biggest on the roster by a clear margin — and a new `climb` block on
  his def opens `src/combat/climb.js`.
  A WALL IS A FLOOR THAT POINTS SIDEWAYS: the body's UP is the surface's outward
  normal and its FORWARD is the direction of travel along it, which on the ground
  reads as the ordinary standing frame, so the transition is one slerp and his own
  walk cycle run in that frame IS the climb. He latches only if the stick keeps
  pushing squarely into a face for 0.34s (walking into a wall stays walking into a
  wall, and knockback can never stick him to one); anything shorter than 0.85 body
  heights isn't a wall at all and he STEPS OVER it; A springs him off; the stamina
  bar pays for the grip. At the lip he hauls himself over and comes upright.
  Walking off a roof stops at the lip in a CROUCH — hold the direction through the
  window and he turns over the edge and climbs down that face, tap A or steer away
  and he drops.
  The claws and boots are put ON the surface by two-bone IK after the GLB retarget
  (feet weighted by proximity so the planted one of a stride is pinned and the
  swinging one still swings, hands with a floor under that), and the other half of
  that is a CROUCH in the climb pose: a mech standing on a wall is not climbing it,
  because a standing body's hands are 5.4 units off the floor. Measured on the
  neon tower: hands 5.4 -> ~1.0 off the face, planted foot ~0.3, tilt reaching a
  clean 1.0. One thing in the animator had to learn the difference —
  `soleClearanceBySide` measured foot height in WORLD y, which on a wall reads the
  distance out from the face and inverts every foot rule the gait runs on; it now
  measures along the body's own up (identical on the floor).
  The CPU does not climb: nothing in ai.js can want height. Files:
  `src/combat/climb.js` (new), `src/core/tuning.js` (`TUNING.climb`),
  `src/mechs/roster.js` (jerry), `src/combat/fighter.js` (four call sites),
  `src/arena/destructible.js` + `src/arena/arena.js` (`climbProbe`, step-over),
  `src/mechs/animator.js`, `tools/climbprobe.mjs` + `tools/climbshot.mjs` (new).
- **Previous:** `sprint.adductTrail` 0.15 -> **0.215**, the owner's value from the
  gait workbench (tuned on viper at full throttle). Measured across the four
  mechs that run sprint: the trailing paw comes to 0.267 of wraith's 0.776 stance
  width, 0.476 of tempest's 0.913, 0.062 of nova's 0.187 — and -0.008 on viper,
  which is the centre line to within a rounding error, since he is the body it
  was tuned on. Every mech's PLANTED width is unchanged, which is the check that
  matters: the flick is still gated on `air * back`, so nothing is dragged
  sideways while it carries weight.
- **Previous:** FENRIR'S GALLOP, PUT BACK — and an apology owed with it. His tuned
  quad block was rewritten in parallel to inherit `base: 'sprint'` with the stride
  shaping moved into `quad.hindReach`/`hindExtend`, and the result put him on his
  belly: paws **20.9% of body height under the floor** and the hind knee dragging
  at y 0.00. His own values are back as a SELF-CONTAINED block (reach 1.2, extend
  -1.5, the full legs/ankle/arms/body he had tuned), with `quad.onset` kept from
  the rework since it only decides the speed the gallop fades in at, not its
  shape. Then the two asks: **a 180-degree hind stride** (`hindSwing` 0.62 -> 1.80,
  measured **93° -> 179°** peak-to-peak on the thigh) and the floor cleared
  underneath it (`hindCarry` -0.35, `hindKneeCarry` 0.90, `drop` 0.32 -> 0.30 —
  paw low point -0.41 -> +0.28, knee low point -0.00 -> +0.08, gaitprobe sole min
  **-20.9% -> -1.2%**). The three hard-coded hind constants are DIALS now
  (`hindCarry`, `hindKneeCarry`, `hockCarry`) and `hindFold` accepts negatives, so
  the rest is tunable in the workbench instead of in the source.
  NOT DONE, and stated rather than buried: the hind knee still reads BELOW the
  hip-to-hock line (it is above the paw for 38% of the cycle), so "the back knee
  flicks up" is not there yet. The measure that would confirm it is a shape
  judgement, not a number, and the dials to reach it are now on screen —
  `hindKneeCarry` lifts the stifle, `hindCarry` slides the middle of the stride.
  Also: `adductTrail` now rolls the KNEE instead of the thigh, at the owner's ask
  — the shin and paw tuck in under a hip that stays put, which is the shape a
  runner's trailing leg makes. Re-measured and re-tuned for the weaker per-unit
  effect (standard 0.18 -> 0.25, sprint 0.10 -> 0.15): viper's trailing paw comes
  to 28% of his stance width with the knee unmoved at 0.398, and every planted
  sample is still untouched.
- **Previous:** THE TRAILING LEG FLICKS IN NOW, on `standard` and `sprint`. A
  running mech used to keep its rear leg out at hip width all the way through the
  extension, which reads bow-legged; it now swings toward the midline as it comes
  off the ground behind the body and returns to its normal width before it lands.
  New dial `legs.adductTrail` (`standard` 0.18, `sprint` 0.10, quad left at 0),
  and it is NOT a phase function like the rest of the table: it is gated on
  **`air * back`** from `footStates()` — the same weights the foot rule uses,
  where `air` is the MEASURED sole clearance. That gate is the whole design.
  Pulling a PLANTED foot sideways is a skate, so the multiply by `air` makes it
  impossible rather than unlikely: viper's stance slip 23.3 -> 21.7 and titanus'
  10.2 -> 10.5 (both inside run-to-run noise), and a phase-by-phase readout shows
  every planted sample identical to the last decimal while the airborne rear ones
  come in — viper's trailing foot 0.57 -> 0.12 units off the centre line with the
  landing foot unmoved at 0.38. Values were chosen per gait by measuring the most
  sensitive body in each (glacier for standard, viper for sprint) so nobody's
  trailing foot CROSSES the midline. Also in: the owner's gait export —
  `sprint.adductRun` 0.07 -> 0 (the track narrowing viper no longer needs now his
  legs are rigged straight). Its `quad.legs.extend` 0 -> -1.5 was NOT applied and
  should not be: the same export's structure was superseded in parallel — `quad`
  now inherits `base: 'sprint'` and the gallop's own stride shaping moved into
  `quad.hindReach`/`hindExtend`, where that intent already ships as **-1.66**.
  Applied to `legs.extend` in the new structure it would have hit fenrir's JOG,
  which is deliberately sprint verbatim. Fenrir also keeps `adductTrail: 0`: the
  flick is a sprinter's tuck and his hinds are already shaped by the gallop.
  ONE ANSWER RECORDED WITH IT: an ankle cannot be moved by hand in the gait
  workbench's keyframe mode and should not be — bone lengths are fixed, so a foot
  moves by rotating the hip and knee. Keys are per-joint ROTATION corrections, the
  gizmo does appear on `thighL`/`kneeL` when they are clicked in the viewport (the
  ankle is refused, with an explanation, whenever the foot rule owns it), and a
  key on the thigh's roll at one phase is the hand-authored version of exactly
  what `adductTrail` now does for the whole gait.
- **Previous:** THE RIG EDITOR'S VIEW IS NOW A PURE FUNCTION OF ITS DATA, which is
  the refactor those pose/offset bugs kept asking for. Two things describe a rig
  — `rigObj` (bind positions) and `corrections` (joint offsets) — and what you see
  is those two plus two VIEW flags: which pose, and whether offsets are previewed.
  `renderView()` rebuilds every bone rotation from scratch (identity -> pose ->
  offsets) so it is idempotent, and NOTHING captures a pose into a variable any
  more; the old captured "base" was the bug factory (taken off bones that already
  wore the offsets, it folded them in, and every toggle laid them on again). The
  rules the owner asked for now hold by construction, and there is a test that
  walks all 8 states of (pose x offsets x mode) three times and asserts each one
  reproduces to four decimals: **a view never changes the rig · pose and preview
  toggles are always reversible · the MODE is not a view flag at all, so Move ↔
  Joint offset cannot move a joint.** Two invariants keep it honest —
  `atPlainBind()` wraps anything that reads positions or re-binds the skin (a
  rotation up the chain would otherwise be measured into the rig file, and a
  rebind under one bakes it into the skin for good, which is what was quietly
  happening while offsets were previewed in Move mode), and a rotate drag turns
  the preview on first, since a turn is measured from the pose and an unseen
  offset would be replaced rather than added to. `showOffsets` is its own
  checkbox, off by default: the default view is the rig as the asset really is.
  **AND THE SAVE-TO-DISK PATH IS GONE FROM EVERY WORKBENCH**, at the owner's
  request and to its benefit. `POST /__rw/manifest`, `/__rw/rig` and
  `/__rw/changes` are removed from vite.config.js, `workbench/ui/save.js` is
  deleted, and the adapter no longer carries a `save` for rigs, skin ops,
  anchors or corrections. Every tool exports instead — **Export ops ▶**, **Export
  rig ▶**, **Copy offsets ▶** — as text a human can read before it lands
  anywhere, which is the point: a write you cannot see is a write you cannot
  trust. `tools/manifestfmt.mjs` and `tools/rigfmt.mjs` stay: they are how a
  pasted patch gets spliced in without reformatting the file around it.
- **Previous:** THE JOINT OFFSET MODE HAD VIPER STANDING PIGEON-TOED, twice over,
  and both halves are fixed. (1) ACCUMULATION: `captureBase()` snapshots the pose
  the offsets are layered onto, and it was being called from bones that were
  already wearing them — so the base absorbed the offsets and the next apply laid
  them on again. Startup did it once in `rebuild()` and again straight after (20
  degrees per thigh instead of 10, feet touching), and every toggle of the mode
  did it once more, which is the legs crossing further each time. There is now a
  single entry point, `applyPose()` — clear every rotation, pose (bind or T),
  capture the base from THAT, lay the offsets over it — and nothing else may call
  `captureBase`/`applyCorrections`. It is idempotent: the measured world position
  of both ankles is now byte-identical across four toggles and a T-pose round
  trip. (2) WHERE THEY ARE PREVIEWED: 10 degrees at a hip swings an ankle most of
  a foot's width, so previewing offsets in the plain MOVE view — the one view
  whose job is placing bones against the asset as it really is — is what made the
  stance look clamped even at the correct 10. They now show in JOINT OFFSET mode
  only; Move shows the true rig (ankles back at their own z 1.8 rather than 0.9)
  with the panel noting how many offsets are waiting, and the T pose stays clean
  because offsets DOUBLE-COUNT there (the T has already aimed every limb straight,
  so taking the splay out again crosses the legs — measured: ankles at z ±0.70,
  exactly under the thighs, once the double-count is gone). The lesson for the
  next probe: the earlier test checked the stored NUMBERS, which were right the
  whole time. It is the rendered position that was wrong, so measure that.
- **Previous:** THE GAIT WORKBENCH GETS KEYFRAMES — the escape hatch for a shape no
  dial can reach. A gait has no frames, but it has a PHASE, and that is enough to
  hang corrections off: `gait.keys` is `[{ ph, pose: { joint: [x,y,z]° } }]`,
  ADDITIVE over whatever the cycle produced and interpolated around the loop (the
  last key wraps to the first, because a cycle is a circle and not a timeline —
  `applyGaitKeys`). The panel has a **Dials / Keyframes** switch: in Keyframes the
  cycle parks, a key track appears (click to park on a key, right-click to
  delete, "+ key here" to add one — born EMPTY, so it changes nothing until a
  joint moves), and clicking a joint attaches a rotate GIZMO whose drag is stored
  against that phase. THE CONSTRAINTS STILL WIN: keys run BEFORE the foot rule, so
  an ankle the rule owns at that phase (a raised foot hangs off its shin) refuses
  the gizmo and the panel explains why instead of letting a drag quietly do
  nothing. "Output gait" carries the keys, so a hand fix hands over like any other
  tuning. Verified headless: a 40° elbow key moves the live pose by 39.5°, the key
  round-trips through the export, and an ankle at a raised phase is refused.
- **Previous:** THE FOOT IS THREE STATES, NOT A CURVE — reworked from the owner's
  description of what a foot actually does. `applyToeHang` now blends between
  **stance** (sole flat on the ground: the `footFlat`/`ankle.level` ask, the only
  world-space rule of the three), **push-off** (planted but BEHIND — the toe stays
  down while the leg straightens and the heel comes up, so the foot drives to
  `ankle.push` + `pushRun` RELATIVE TO THE SHIN, ~90° at speed) and **air**
  (nothing holds a foot at an angle to the world: it hangs at its RESTING angle to
  the shin, plus `ankle.hang` — 15° for the sprint gait, 0 for a walk). The last
  two are joint-space, so one number lands the same on titanus' boot, viper's
  talon and fenrir's paw.
  Two things this fixed that the previous version got wrong: the toe-off was fired
  from a PHASE window (`pushPhase`, now gone) that was ~100° late — measured on
  titanus, it peaked at 295° when his sole had left the ground at ~200° — and
  "is this foot up" was inferred from leg geometry, which cannot tell a lifted
  foot from a body squatting over a planted one. It is now MEASURED per foot
  (`Animator.soleClearanceBySide`, new, handed to the gait as `env.footClr`)
  wherever the model was calibrated, inferred only where it wasn't (procedural
  bodies, and fenrir, whose gallop declares its own flight phase because both his
  hinds leave the ground together). `node tools/gaitprobe.mjs` reports `ankleAir°`
  (distance from the resting line while airborne — 0.0 on viper, 0.0 on titanus)
  beside `toeFwd`. Also in: the owner's `sprint` kneePhase 1.15 → 1.93 and
  `standard` roll 0.5 → 0.51.
- **Previous:** VIPER'S ANKLES MOVED UP TO THE PIVOT (owner's rig, y 0.03 -> 0.08
  mesh-local on both ankles, spliced in through `tools/rigfmt.mjs` so the header,
  `skinSpan: 'child'` and the in-array comments survived). It is the anatomical
  placement for a digitigrade foot and it reads right; the honest cost is that
  the engine's own convention is `0.32 * scale` above the sole (~4.5% of body
  height) and this is 9.1%, so `calibrateFeet` now measures footDepth 0.63
  against 0.32 and hands the gait **ankleGain 1.00 -> 0.51** with **footFlat
  0 -> 1.00**: the authored heel roll and toe-off run at half amplitude and the
  sole is levelled. Nothing else moved much — skin audit 914.0 -> 940.8 (+3%),
  gait sole min -1.3% -> -1.0% (so the foot is NOT clipping), stride and track
  unchanged, poster drift 14px, soak clean. The middle ground, if the halved roll
  ever reads as flat-footed, is an ankle around y 0.045.
  **AND A JOINT OFFSET MODE** in the rig editor, beside `Move`: the gizmo rotates
  and what you turn is stored as that joint's `boneCorrections` entry — the one
  rotation a rig can carry, since a rest rotation on the bones themselves cancels
  out. It is how the rig says "this thigh RESTS splayed, take it out before any
  clip plays", which is exactly what viper needed. The panel lists the offsets
  with a ✕ each, saves to the MANIFEST (not the rig file) or copies the patch,
  keeps a draft in localStorage, and layers the offsets on top of whatever pose
  is showing — bind or T — the way the game layers them on the retarget. Verified
  headless: startup reads the shipped `{thighL:[10,0,0], thighR:[-10,0,0]}`, a
  further 8° rotation lands as `[18,0,0]`, the bone's rig position is untouched,
  and the draft survives a reload. The capability is declared in the contract
  (`rig.corrections`), so an adapter without one simply hides the button.
- **Previous:** THE T POSE IS EDITABLE, and two bugs behind it are fixed. Dragging a
  bone under the T pose now edits its BIND position through the pose: the gizmo
  only ever writes `bone.position` (which IS the bind offset — the pose sets
  rotations and nothing else) in the parent's POSED frame, so you push the limb
  where you want it while looking at the limb; on release the editor drops the
  rotations, reads the positions back at the bind pose, re-binds the skin THERE,
  and re-applies the T. The pose is never baked into the bind, and the mesh
  deforming under the drag is feedback rather than a save. Verified end to end:
  a drag of kneeL by -0.03 in z under the T pose lands as bind `0.12 -> 0.09`,
  the tool stays in the T, and the rig FILE is untouched.
  **THE REFERENCE WAS FACING SIDEWAYS** because the mannequin is built in the
  GAME's frame (faces +z, left -x) while a rig file is authored in the raw GLB's
  bind space (faces +x, left +z) — 90 degrees apart, which is exactly what the
  manifest's `yawOffset` reconciles at runtime and the rig editor never applied.
  Both bodies are now asked which way their own left is (`up x left = forward`)
  and the group is yawed by the difference; the MANNEQUIN-as-subject case still
  comes out 0. That fixed the feet pointing across the mech while matching too:
  the bones with no child to aim at (ankles, hands, head) keep their bind
  orientation, so they were wearing the reference's own 90-degree error.
  **AND A REAL ONE UNDERNEATH:** the rig editor had TWO functions called
  `saveRig` in one scope — the localStorage draft saver and the one that POSTs
  `src/mechs/rigs/<id>.rig.js` to the dev server. The later declaration wins, so
  EVERY drag, undo, add and delete had been writing the rig file, which then
  fired Vite's HMR and reloaded the tool mid-edit (that is what kept resetting
  the T pose), while the documented localStorage draft was never written at all.
  Now `saveDraft` vs `saveRigToFile`: a drag persists a draft that survives a
  reload, and only the button touches the file. Check your tree for rig files you
  did not mean to change.
- **Previous:** THE RIG EDITOR CAN NOW SHOW YOU WHAT THE RIG DOES, not just where
  its bones sit. Two boxes: **match this rig's bones** under the mannequin (on by
  default) stands the reference humanoid in YOUR bone positions instead of its own
  canonical stance — position lands on the bone, rotation aims each segment at the
  next joint, so it bends its knee rather than sliding its shin, and it follows
  live as you drag. **T pose** drives the whole skeleton into a canonical T (arms
  along the shoulder line, legs down, lateral taken off the rig's OWN shoulder
  line so it works whichever way the mesh faces). It is a view, not an edit —
  rotation only, positions untouched, gizmo detached while on. Titanus and viper
  hold a clean T; cranky stretches, and that IS the reading (a crab has no T).
  BONE ROTATION IN THE RIG FILE WOULD BE A NO-OP, which is worth writing down:
  `applyCustomRig` rebinds the skin at rest and `RigAdapter` captures
  `offset = jointWorld⁻¹ · boneWorld` per bone, so a bind rotation R appears on
  both sides and cancels exactly. The lever that works is `boneCorrections`
  (manifest, degrees per joint, post-multiplied in bone-local space after the
  retarget) — and it reaches custom-rig mechs too.
  VIPER'S RUNNING SPLAY IS FIXED WITH IT: `thighL [10,0,0]` / `thighR [-10,0,0]`.
  The cause was in the rig, not the gait — his knee bone sits 0.05 outboard of his
  thigh, a 12° lean built into every pose, and the knee lift then swings the shin
  out along that oblique axis. New probe `node tools/legsplay.mjs <mech>` measures
  it ON THE BONES (the virtual joints read 10° INBOARD at full speed while the
  rendered legs are 15° out, because the retarget drives orientation and the rig
  owns position): standing knee lean **12.5° -> 2.5°**, knee-lift peak **44°/47°
  -> 21°/37°**. Skin audit 923.4 -> 914.0, so it costs nothing. Change the 10 to
  taste — 6 halves it, 12 stands him dead vertical.
- **Previous:** A RAISED REAR FOOT POINTS ITS TOES BACK, IN EVERY GAIT — the
  trailing foot used to hang in the air with its sole level and its toes pointing
  forward, as if it were still standing on a floor that isn't there. Two things
  did it: the flat-sole rule cancelled the leg chain for the WHOLE cycle instead
  of only while the foot was down, and nothing ever asked the foot to hang.
  `applyToeHang` (gaits.js) is now the last word on a stride, after the gallop
  layer, and it SOLVES rather than nudges: `ankle.hang` is the angle below
  horizontal the toes should reach (π/2 = straight down, more = back) and the pass
  subtracts what the hips, thigh and knee already contribute, so ONE number lands
  the same on titanus' boot, viper's talon and fenrir's paw. Measured as the
  forward component of the foot's own axis while it is behind the hips AND lifted
  (`node tools/gaitprobe.mjs` reports it as `toeFwd`, and it is a new permanent
  check): colossus **+0.89 → -0.17**, viper +0.98 → -0.17, titanus -0.17,
  fenrir's hind paw **+0.99 → -0.22**. The window is read off the POSE, not the
  phase — leg behind its rest direction AND foot off its standing height, both
  required — which is what keeps a foot that is still PUSHING from having its toe
  driven through the pavement (colossus' worst sole clearance is -0.044 of body
  height, against -0.039 before the rule and -0.149 when the lift test was
  missing) and what makes it work for fenrir, whose hinds are driven by the biped
  layer and by a gallop running at its own rate. Also in: the owner's tuning for
  `standard` (reach 0 -> 0.51, extend 0 -> 0.47, adduct 0 -> 0.08) and for `quad`
  (reach 0 -> 1.2, adduct 0 -> 0.085), and the gait workbench's number boxes now
  accept values PAST the slider ends (marked amber) so extremes can be tried
  without widening the slider.
- **Previous:** ANKLE HEIGHT AUDITED ACROSS THE WHOLE ROSTER, and the answer was not
  the one expected. An ankle bone is the hinge the gait rolls the foot around, so
  it belongs at the TOP OF THE SOLE PLATE — not at the lowest point of the
  geometry. `Animator.calibrateFeet` measures `footDepth` (ankle above sole) and
  damps the authored heel roll by `convention/depth` when the bone sits high
  (`ankleGain`, floor 0.25) — but it also gives up entirely at `depth <= 0.02`,
  and a hinge level with the ground has nothing left under it to roll. The target
  is therefore `0.32 * scale`, ~4.5% of body height, which is what `ankleGain 1.00`
  and `footFlat 0` mean. New tool: `node tools/ankleprobe.mjs [mech …] [--chains]`
  measures sole/ankle/depth/gain per mech per side, lists every bone at or below
  its sole (and FAILS on one), and with `--chains` prints the whole leg with each
  bone's share of the foot plate — which is how a mis-mapped ankle is told from a
  badly-placed one. **NOTHING is underground:** no bone on any of the 17 mechs
  sits at or below its own sole at rest. `buildSkeletonBones` (reskin.js) now
  clamps a custom rig's bones to y >= 0 and warns, so a future rig edit dragging
  an ankle onto the floor cannot bury the geometry under it.
  THREE MECHS FIXED, and every candidate measured rather than assumed:
  **vulcan** ankle y 0.10 -> 0.043 (depth 0.850 -> 0.366, gain 0.44 -> **1.00**,
  skin audit 464.7 -> 463.0), **wraith** off the hock, y 0.155 -> 0.048 (0.98 ->
  0.26, gain 0.32 -> **1.00**, audit 1455.2 -> **1431.2**), and **saurion**, whose
  ankle was MAPPED to the hock (`bone_8`, 1.64 above the sole) while `bone_9` sits
  at 0.31 and owns 100% of the foot plate — a `boneOverrides` remap, so no weight
  moves (gain 0.25 -> **1.00**, audit 859.8 -> **816.9**). Plant is unchanged:
  `footprobe` stance slip 12.97 -> 13.72 (vulcan) and 17.94 -> 17.67 (wraith).
  THREE REJECTED WITH NUMBERS, because the skin would not take it: **titanus**
  (audit 3158 -> **11661** at y 0.045, still 10085 at 0.09 — the boot shaft falls
  to the knee and the foot's three bones collapse onto one another), **glacier**
  (+18% for a 0.006 move; its sole weights are on a knife edge) and **cranky**,
  the crab, whose "ankle" is the top of a leg arch 54% of the way up the body:
  renaming it `hockL` and promoting the tip bone is weight-identical by
  construction, and the tip rolling at full gain still cost +32% (1246 -> 1645) —
  and his hexapod profile owns the legs at speed anyway. Left as found, with the
  observation recorded that his `footL`/`shinL` hurtbox capsules therefore sit
  mid-body and point upwards. The seven stock-skeleton mechs whose auto-rig simply
  placed the ankle high (rhino 12.4%, frogger 11.1%, jerry 9.8%, nullbot 9.2%,
  tempest 7.2%, nova, aegis) have NO better bone to map to — `--chains` shows the
  high bone owning 100% of the foot plate in every case — and lowering a pivot on
  a baked-weight skeleton needs a rebind, which the titanus/cranky results say
  would more likely cost skin than buy roll. Measured, listed, not guessed at.
  Also: **viper's re-authored skin patch is in** — 19 ops, all pinned vertex
  lists, audit **1500.9 -> 923.4 (-38%)**, worst finding 270.2 -> 79.1.
  AND A POSTER BUG FELL OUT OF IT: `tools/posters.mjs <ids>` built its index from
  an EMPTY map and rewrote `posters.json` wholesale, so every named run deleted
  the other mechs' boxes — and a mech with no box has no poster at all
  (`posterMeta` returns null and mech select goes back to building a model per
  keypress, the exact cost the posters exist to avoid, with the .png still on
  disk looking fine). The committed index had been whittled down to ONE entry,
  viper. The tool now MERGES, and all 17 posters were re-rendered so every mech
  has its box back. Single-picker drift is 1-15px across the roster. Note for
  whoever next reads `postercheck`: with 2+ pickers SLOT 0 reports a large
  negative R drift (vulcan 153px, jerry 136px, cranky 121px — untouched mechs
  included) while every other slot stays under 10px, so that number is a harness
  artifact rather than the handover.
- **Previous:** VIPER'S NEW RIG IS IN — and it is worth it for the animation: the
  ankle bone moved from the high hock (y 0.135 mesh-local, 0.92 world above the
  sole) down beside the sole (y 0.03, 0.21 world), so `calibrateFeet` now measures
  footDepth 0.206 against 0.925 and hands the gait `ankleGain 1.0` where it used
  to hand it **0.35**, with `footFlat` 1.0 → **0**. Viper's heel roll and toe-off
  were being damped to a third of their authored amplitude and then levelled flat
  again; they now run as written, and the sole still sits on the floor (-0.7% of
  body height at its lowest). The skin audit likes the rig too:
  `node tools/skindebug.mjs viper` total severity **1863.5 → 1500.9** (-19%) with
  no new at-rest breakage. Anchors kept per the house rule — the muzzles ride
  elbowR/handL, both bones moved, so the offsets were re-expressed to hold their
  rest-pose world position: drift 0.145 / 0.128 units → **0.0005** (aim within
  0.85°, which is the bone's own rest orientation and not something a manifest
  number can express). The blade-trail anchors were left alone on purpose: they
  ARE `bladeLtip`/`bladeRtip` at offset [0,0,0], so following the tip the author
  moved is the intent. Poster re-rendered; `postercheck` puts viper at 15px of
  silhouette drift (jerry already ships at 20). Hurtbox 15/15, contain 77%,
  bloat 0.93x. Build green, soak clean.
  **THE SKIN PATCH THAT CAME WITH IT WAS NOT SHIPPED**, with numbers: 9 of its 14
  ops select islands by `{"comp":N}`, which is an ordinal into the partition the
  OLD rig drew (69 islands; the new rig draws 47). Under the new rig those ids
  land on his elbows and horn — comp 25, meant for `thighL`, selects geometry
  0.049 from `elbowL` — and the audit total goes **1500.9 → 2872.5**. Translating
  every comp back to the vertex list it meant under the old rig recovers most of
  it (1794.8) but is still worse than the new rig with NO ops at all, which is
  what shipped. `pinSkinOps` (skinops.js) now makes the workbench write vertex
  lists instead of `comp` ordinals on Save/Export, so a future hand-off cannot
  drift this way; `tools/gaitprobe.mjs` also got a warm-up pass (its swing ranges
  were sampling the cold-start transient and swinging by up to 2x run to run).
- **Previous:** THE MANNEQUIN IS ALSO A SUBJECT — it now sits at the bottom of
  every workbench's mech dropdown, under the rule with the work-in-progress
  mechs, so the reference body can be opened on its own rather than only as a
  build of some mech. It is emphatically NOT game content: `MANNEQUIN_DEF` lives
  in mannequin.js and never enters ROSTER, so mech select, RANDOM, CPU picks and
  the title line-up cannot see it. The adapter DECLARES it
  (`catalogue.reference()`) instead of smuggling it in, which is what lets
  `tools/wbconfig.mjs` keep proving the catalogue matches ROSTER (it subtracts
  declared reference ids and prints them), lets the ACTION workbench leave it out
  (it drives real Fighters and a reference body has no moves), and lets skin/rig
  refuse to save over it. In the RIG EDITOR its own canonical skeleton is the rig
  — 15 bones already where they belong, the answer key for whatever mech you are
  rigging. One shared-code change came with it: `measureHurtbox` now picks the
  SKIN path off the MODEL'S SHAPE (`boneMap` + `skeleton`) rather than off "is it
  a GLB", so the mannequin reports its 15 capsules; `node tools/hurtboxfit.mjs`
  is byte-identical across the whole roster before and after, and a soak is clean.
- **Previous:** A MANNEQUIN TO CHECK THE ANIMATION AGAINST, AND FOOTPRINTS ON THE
  GROUND — two answers to "what is this SUPPOSED to look like". (1) The
  MANNEQUIN (`src/mechs/mannequin.js`): a reference humanoid on the game's own 15
  joints, same hierarchy and same measurements as the mech it stands in for,
  built as a real SkinnedMesh with real weights — one flat colour per bone (warm
  = left, cool = right), a foot with a heel BEHIND the ankle and a toe box in
  front, a nose and eyes, a thumb per hand. The gait and pose workbenches offer
  it as a third BUILD button (it runs that mech's own gait and poses the same
  clips); the skin workbench loads it read-only as the reference bind — one
  contiguous island per bone, the seam at each joint, a narrow blend band across
  it, which is the layout a repair is aiming at; the rig editor ghosts it over
  the raw model as an X-RAY with every joint NAMED on screen, so "the ankle is
  the joint above and forward of the heel" is a thing you can see rather than a
  thing you have to be told. (2) FOOTPRINTS in the gait workbench: the mech runs
  on the spot, so the GROUND runs instead — every plant stamps a print where the
  foot landed and the whole floor scrolls backward at the real ground speed. The
  gap between two prints of the same foot is the stride MEASURED off the
  footfalls; the readout shows it beside the value derived from the cadence, and
  the two agreeing (6.47 vs 6.4 u on viper at 55% throttle) is a no-skate proof
  that used to need a probe script. Track width falls out of the same trail
  (0.35 u on tempest's sprint — nearly single-file, which is what `adduct` is
  for).
- **Previous:** ARMS COUNTER-SWING THE LEGS (they were marching WITH them) —
  every mech in the game walked and ran with its left arm going forward
  alongside its left leg. The shared engine's line was `shoulderL += armSwing *
  sinR` while the leg was `thighL += -swing * sinL`, and since shoulder pitch
  runs the same way as thigh pitch (negative = forward), `sinR = -sinL` put the
  arm in phase with its OWN leg instead of opposite it — a wind-up toy, not a
  runner. The arms now ride their own side's sine, so left leg forward means
  left arm back, which is what cancels the leg's angular momentum about the
  spine. Measured on viper at full throttle (hand vs foot fore/aft, relative to
  the hips): left foot +1.07 with left hand +2.12 before, +1.07 with **-0.60**
  after. `node tools/gaitprobe.mjs` now reports `armPhase r`, the correlation
  between a foot's fore/aft travel and the SAME side's hand over a whole cycle:
  -0.96 (it must be negative), so this cannot silently come back. The elbow
  pump and the arm-cross yaw were reading the opposite arm's phase for the same
  reason and now name it (`armFwdL/R`) rather than relying on the double
  negative. Nothing else moved: same amplitudes, same cadence, same legs. The
  gait workbench also frames a body off its POSED JOINTS now, so a quadruped
  (fenrir, whose skull is at knee height and whose body is three times as long
  as it is tall) is framed by its length instead of cropped.
- **Previous:** GAITS ARE DATA NOW, AND THE FAST MECHS RUN — the walk/run cycle
  left animator.js and became a named, shared TABLE (`src/mechs/gaits.js`): a
  roster def says `gait: 'sprint'`, several mechs share one, and tuning it moves
  all of them. `standard` reproduces the old block EXACTLY (proved term by term
  against the previous code over a phase/ratio sweep — zero difference), so
  every mech that names no gait is untouched; FENRIR's gallop is the same table
  with a `quad` block. The new `sprint` gait (VIPER, TEMPEST, WRAITH, NOVA) is
  what the fast tier was missing: an asymmetric stride that REACHES ahead and
  finishes behind, feet tracking near the midline instead of straddling a
  shoulder-width base, higher knee drive, harder toe-off, bent arms driving
  from tucked-in shoulders, and the frame pitched into it. Measured with the new
  `node tools/gaitprobe.mjs <mech> [throttle] [vsGait]` (foot travel off the
  real posed model, as a fraction of body height): viper stride 60.2% → 71.2%,
  foot reach 21.3% → 29.1%, lift 35.2% → 43.7%, track 10.2% → 7.2%, lean
  22.9° → 33.2°, arm swing 70° → 82°, and the sole sits no deeper against the
  floor than before. And it is all editable in a new **GAIT WORKBENCH**
  (`/workbench/?edit=gait`): run any mech on the spot at any throttle, ROBOT
  SPEED and slow-motion, freeze and scrub the cycle, drag a limb to tune the
  dial behind it, ghost the shipped gait (or any other gait) phase-locked
  beside it, then "Output gait" for a paste-ready block. See the section at the
  end of this file.
- **Previous:** NULLBOT SHOOTS FORWARD, OFF EITHER CLAW — his Null Pointer was
  leaving the barrel at ~75° of PITCH (straight up, 105° off the target):
  the muzzle anchors ride the hand joints, whose own +Z sits ~73° up in his
  shoot pose, and their authored `rot` of [12,0,0] barely touched it. Both
  muzzles now carry rot [107,0,0], measured off the live anchor at the fire
  frame on both routes; median miss angle 105° -> 9.8°. He also alternates
  claws shot to shot now (`glitch` joined the twin/mirrored weapon lists), so
  the bolt leaves the hand the mirrored clip just punched out.
- **Earlier:** JERRY'S SKINNING UN-SHIFTED — his back/legs were smearing in
  motion because manifest `{"comp":N}` skinOps are numbered against the rig's
  own proximity islands, and moving `strutMidL/R` into the cannon pods
  repartitioned them (126 -> 142 islands): every old id then selected DIFFERENT
  geometry (the op meant to bind his back to `tail` was grabbing 471 verts of
  his left FOOT). Each comp op is now stored as the explicit vertex list it
  meant, so no future bone move can shift it. Worst per-vertex stretch in a
  walk 162x -> 29x, heavy 420x -> 36x (`node tools/skinstretch.mjs <mech>
  [clip]`, new). The pods also moved from `hips` to `torso` — bolted to the
  shell, they no longer tear their own seam as the shell pitches.
- **Older:** JERRY'S BILGE SPIT — his ranged weapon is now a short burst of
  BLACK STICKY GOO out of the cannon pods (CRANKY's pressurized stream in tar,
  thrown much further; gunks like FROGGER's slime on impact, in black). The
  pods are their own rig bones now (`strutMidL/R` moved into the barrels, with
  the pod geometry skinned to them and the muzzle anchors riding them), so a
  glbanim post hook swings the FIRING pod onto his facing and the burst ranges
  off it, alternating sides shot to shot. Goo wads (his and FROGGER's) are no
  longer spheres: a lit, glossy liquid SLUG flying head-first with a droplet
  tearing off the tail.
- **Older:** JERRY TUCKS, NEVER SPINS — roster defs can flag `tuckOnly` to
  join the heavies' no-spin somersault regardless of combat weight; JERRY
  (storey-tall shrimp shell on a 0.45 stat line, and a GLB whose leg bones
  under-fold so a spin never read as a ball on him) is the first user.
  rollpivot: spin 0, headR=footR 0.52. Soak clean.
- **Older still:** ROLL-STABLE CAMERA — during the air somersault the pivot
  slide makes the fighter's own `pos` (the group origin) orbit the ball's
  centre at the spin rate, and every camera that framed `pos` inherited
  that orbit as jiggle. `Fighter.focusPos()` exposes the un-slid base the
  physics integrates (smooth through the whole tumble; exactly `pos`
  otherwise) and camera.js frames that everywhere — combined centroid,
  solo focus, split chase, lock azimuth, occlusion probes. Measured by
  driving the real CameraSystem through a descending spin: the camera
  target's max second difference is 0.0094/frame — exactly gravity's own
  g·dt², zero residual jitter. JERRY also got a `ballPose` (his splayed
  grasshopper rest bias wrapped the shared tuck to a 184° knee fold with
  feet thrown wide; tools/rollpivot.mjs head/foot circle ratio 2.0 → 1.6,
  centre drift −27% — the rest is the GLB rig under-folding its leg
  bones, out of a pose override's reach).
- **Previous:** AUTO-AIMED BLOWS GO FOR THE CHEST AND HEAD — melee auto-aim now
  steers a punch, kick or bite in HEIGHT as well as laterally, onto the
  target's chest-to-crown band instead of their waist or over their head.
  See the section at the end of this file.
- **Previous:** BUILDINGS ONLY GHOST WHEN THEY REALLY HIDE YOU — the
  see-through fade tested the camera→body segments against each building's
  BOUNDING BOX, which is full of air the building doesn't own: an overhang,
  an L-shape notch, a setback, or a blown-open face all counted as solid, so
  a building went transparent while the mech stood in plain sight beside it.
  Worse, `b.aabb` is fixed at construction, so a half-demolished tower kept
  the full-height box forever. Now the box is only a BROAD PHASE and the
  decision is made against the chunks actually standing (`_chunksBlock`),
  with the sample grid widened from 5 points to 12 (3 wide × 4 tall over the
  silhouette) and the rule changed from "all samples blocked" to
  "≥90% blocked". Measured with new `tools/fadeprobe.mjs`: standing under an
  overhang blocks 3/12 of the body and no longer fades (the box test scored
  12/12); a gutted building no longer fades at all; genuinely standing
  behind a building still fades (12/12). Cost is held at 0.12ms/frame
  (from 0.06 baseline, 0.39 before the early-out) because box-blocked is a
  strict upper bound on chunk-blocked, so the chunk walk is skipped the
  moment too many samples miss the box.
- **Previous:** PERF PASS + ADAPTIVE SPLIT FX — split-screen post FX is now a
  TRI-STATE (SETTINGS → SPLIT-SCREEN FX): DEFAULT runs them and drops them
  for the session if real frame time stays above ~22ms for ~3s (after a 2s
  warm-up grace for shader compilation), ALWAYS ON forces them, OFF is the
  old plain path; the DEFAULT line reads "(OFF — SLOW)" once the watchdog has
  pulled them. Then a measured perf audit (new `tools/perfprobe.mjs` for CPU
  per subsystem, `tools/drawprobe.mjs` for draw calls per frame). Findings and
  fixes: (1) THE VIADUCT was the single biggest cost in the game — ~50
  segments × 5 meshes = ~250 objects per cell, ×9 wrap ghosts = 2,250 meshes;
  it is now 3 INSTANCED meshes total with the ghosts folded in as instances
  and destruction zero-scaling a segment's copies. (2) three re-renders the
  SHADOW MAP on every render() call, so split-screen paid the whole shadow
  pass (~125 calls, ~0.9M triangles) once PER VIEW for an identical map —
  now rendered once per frame (`shadowMap.autoUpdate` off + `needsUpdate`).
  (3) two real per-frame allocations removed (a Vector3 per fighter in the
  camera, one per projectile). Result: 1381 → 552 draw calls per frame
  (terrain meshes per cell 269 → 19); a 4-player split frame goes from
  ~5,500 draw calls to ~1,800. CPU side was already healthy: 1.1ms per
  world.update at 4 fighters, dominated by fighter.update (0.24ms each).
  Largest remaining item, if it ever matters: prop ghosts (~253 calls).
- **Previous:** BALL TUCK + LANDINGS — the air somersault curls into a real
  tight-ball clip (per-body-type via roster `ballPose`; large bots tuck
  without spinning), LT pressed airborne buys the same tuck on stamina,
  and every fall now lands through a stretch → crouch → recover landing
  animation. See the section at the end of this file.
- **Previous:** POST FX IN LOCAL MULTIPLAYER — split-screen used to skip
  post-processing entirely (a plain scissored `renderer.render` per view), so
  a 2–4 player game had no bloom, no FXAA and, as of the previous change, no
  distance haze blur. Each viewport now runs its OWN post chain
  (`engine._viewChain`), sized to that viewport: the scene render happens at
  the view's aspect and the final pass writes into the view's rect, because
  `setRenderTarget(null)` restores the viewport/scissor set for that view.
  One shared full-canvas chain could NOT work — the scene would render at the
  full aspect and be squeezed into a half rect, and bloom would bleed across
  the split line (a bloom pass treats its whole buffer as one image). Total
  pixel work is roughly one full-screen chain (each view is a fraction of the
  screen) but per-pass overhead multiplies, so `?postfx=single`
  (CONFIG.splitPostFx) restores the old plain path on hardware that
  struggles. Verified on 2P side-by-side, 2P stacked and 4P quadrants.
- **Previous:** DISTANCE BLUR + CITY DENSITY — two fixes to "the fog looks
  wrong". (1) three's fog only lerps colour, so a far tower went grey with a
  razor silhouette. `src/core/hazeblur.js` adds a HazeRenderPass (it IS the
  scene render, into a target carrying its own depth texture) that blurs each
  fragment by how deep into the fog band it sits, tapering back to zero past
  the fog wall so the sky pano and horizon strip stay crisp. Radius scales
  with resolution; `engine.hazeStrength` is the tuning dial. NOTE: only the
  composer path runs it — split-screen renders scissored views directly and
  has always skipped post (bloom, FXAA too). (2) The real cause of "buildings
  in my line of sight are fogged": `tools/sightprobe.mjs` measured 18 of 36
  sightlines running clear to the wrap seam, so what those corridors showed
  was the NEXT TILE's city, correctly fogged. Buildings per arena 18 → up to
  30, placement now reaches into the previously-empty seam ring, and the
  destructible instance layout was changed so a chunk's 9 wrap copies are
  CONTIGUOUS — `mesh.count` tracks the built city instead of the whole
  budget, which made raising capacity (2200 → 3600) cost memory rather than
  per-frame vertex work. Open sightlines now 6–9 of 36; chunk use 1683–2844.
  Two dead ends worth remembering: hanging a shared depth texture on the
  composer's ping-pong targets makes the GPU see a feedback loop and render
  black, and resizing a render target that owns a depth texture leaves the
  depth attachment stale (samples as 1.0, so nothing ever blurs) — the pass
  reallocates instead.
- **Previous:** ULT FOUNTAINS — ultimates are no longer charged by dealing or
  taking damage; golden powerup fountains (combat/fountains.js) well up
  around the arena every CONFIG.fountains.interval seconds (board cap =
  live robots × perRobot, both in config), preferring interesting ground:
  40% building rooftops (≤20m so they're jumpable, via the destructible
  grid's live top cells), 25% terrain features (hilltops, bridge and
  viaduct decks), 35% open floor — never the spawn plaza, never hazard
  lanes/patches, never inside props. Stand in one: golden geyser + rings +
  a second of sparkles shed off the robot, one charge in the pouch (max 2,
  fountain drains and wells up elsewhere; a roof fountain whose floor is
  blown out drains too). `f.ultCharges` is the resource; `f.ult` (0|1)
  mirrors "has one" so AI triggers, the soak harness's forced meters and
  Infinite Ults all keep working; charges reset per round like the meter
  did. HUD: the ult bar is replaced by two ★ badges (faint empty / gold
  held / blazing while the spent ult fires — dev harness prints ★s too).
  AI with an empty pouch detours to ground-level fountains between fights.
  Verified end-to-end with new tools/fountaintest.mjs (spawn cap, collect,
  cap-at-2, spend, flash timer), badge CSS screenshot-checked, ace soaks
  clean on neon 4P + harbor.
- **Previous:** BUILDING DONORS BAKED + DEV-HARNESS PARITY FIX — the 8 Tripo
  massing donors voxelize into exactly the intended silhouettes (stepped
  temple pyramid with shrine, works hall + boiler tower, offset hab stacks,
  terraced mill, crowned towers — `node tools/voxbake.mjs` prints per-floor
  ASCII occupancy maps to prove it). Voxelization is now OFFLINE: voxbake
  runs the game's own voxelizer headless and writes
  `public/models/buildings/<name>.vox.json` (2.6–6 KB each, per-cell tints
  included); runtime prefers the bake — no GLB download (~3.3 MB skipped),
  no parse, no rasterization — and falls back to live voxelization only for
  a donor dropped in without re-baking. Also fixed a real parity hole: the
  `?battle=` dev harness (battletest.js) built its arena WITHOUT the prop /
  building preloads, so every dev screenshot and soak silently exercised
  procedural fallbacks while the menu-flow game showed GLBs — several
  props are close enough to their procedural stand-ins that screenshot
  verification didn't catch it. battletest now awaits both preloads
  (mirroring boot.js), verified by probing the scene graph: prop groups
  carry a single GLB child, donor buildings claim sites (chunk counts
  1028→1430 uptown, 795→1248 ruins; capacity 2200 holds). Crater test on a
  donor pyramid: 15 chunks out, tiers intact, no false collapse; ace soaks
  clean on ruins + uptown 4P.
- **Previous:** TRIPO PROPS LIVE + MASSED BUILDINGS — (1) the 20 Tripo prop
  GLBs are integrated: optimized with gltf-transform (37→13 MB, 1024
  textures, meshopt — a first pass wrote glTF-JSON sidecars whose texture
  names collided across all 20 models; redone as true binary GLBs),
  multi-body colliders remap onto each swapped model's real footprint, spin
  hooks that lost their named part are dropped, and direct ?battle= URLs
  give the preload 8s so no model is silently left procedural. (2) Buildings
  stopped being rectangular prisms: `DestructibleSystem.addBuildingCells`
  builds from ANY occupancy-cell grid (support cascade/collapse/fade
  untouched — they were always grid-generic), `src/arena/massing.js`
  generates theme-flavored silhouettes (setback towers with spires, slabs
  with fins, L-shapes, ziggurats, pagodas with legal 1-cell eave overhangs,
  clerestory warehouses, boiler-tower works, offset module stacks, bunkers,
  terraces — THEME_MASSING maps all 12 arenas), and `src/arena/buildglb.js`
  voxelizes Tripo massing donors (public/models/buildings/, manifest with 8
  named slots + prompts in ARENA_ASSET_PROMPTS.md §4) into the same grid
  with texture-sampled per-cell tints — surface rasterization + outside
  flood fill, shell-only, orphan-guarded. Chunk capacity 1400→2200; live
  counts 727–1133. Verified: chunk-count telemetry in skyshot, new
  tools/smashtest.mjs carves a crater (105→97 alive, no false collapse),
  ace soaks clean on ruins/neon-4P/frozen, build green.
- **Previous:** GENERATED SKIES + TEXTURES WIRED UP — the owner's asset drop
  (12 equirect sky panoramas 4096×2048, 12 alpha horizon strips 4096×512,
  8 seamless prop textures) is now doing real work in every arena, and the
  three clashes it exposed are fixed: the procedural skyline boxes are the
  FALLBACK only (with a generated horizon they stood in front of it as flat
  fog-coloured slabs), the horizon ring got a vertical alpha ramp + T-axis
  clamp (repeat-wrapping bled its opaque haze row into its transparent rim,
  drawing a dotted line across the sky), and the procedural aurora curtains
  are skipped when a pano paints their own (frozen was hanging pastel
  rectangles over its own aurora). Also wired the unused `prop_metal_painted`
  plate into the heavy plant (crane, magnet crane, crusher, drill rig,
  snowcat) and named every prop group `prop:<name>` so `tools/skyshot.mjs`
  (new: aims a camera by pitch/yaw or frames a named prop) can inspect them.
  All 12 arenas eyeballed at sky pitch; ace soaks clean on frozen (4P) and
  ruins; `tools/wbconfig.mjs` still PASSes.
- **Previous:** LONG SIGHT LINES ACROSS THE SEAM — the view now runs almost a
  full wrap period in every direction (corners included), so you see roughly
  an extra arena-width of the looped world instead of a wall of haze. The
  world was always ghost-tiled ±1 cell and fighters are never cloned, so
  nothing here risks seeing yourself mirrored; what blocked the view was
  three fixed constants, all now derived from the cell period P:
  fog (`near..0.92P`, was capped at a flat 400), the ground + painted overlay
  planes (`3P` wide with texel density preserved, were a flat 700 that ended
  mid-view), and the camera-locked skyline silhouette, which sat at 230–340
  and cut straight through the real tiled city — it now sits at 0.88–1.08P,
  scaled to keep its apparent size, where it only tints the haze band. The
  optional horizon-strip ring follows at `max(620, 1.6P)`. Nothing is drawn
  that wasn't drawn before (the ghost tiles were always in the scene, merely
  fogged out), so the cost is unchanged.
- **Previous:** ARENA REDESIGN PASS — all 12 arenas rebuilt as real
  battlegrounds with theme-true set pieces, on three new terrain systems
  (`src/arena/terrain.js`): **patches** (tiling-safe circular lakes / lava
  lakes / swamp / frozen lakes / lawns / ash fields, live hazards like lanes),
  a **viaduct** (an endless raised highway/monorail loop following a periodic
  centerline around the whole wrap cell — walk under it, board it at two ramp
  dips, blow out deck segments, topple its piers and the span comes down),
  and prop placement upgrades in arena.js: **clump** nests (groves, container
  canyons — dense pockets vs open ground), **on:'water'** placement (trawlers
  and buoys float ON the harbor basins with a new `bob` sway hook), and
  **multi-body colliders** (`userData.bodies`) so gates/arches/gantry legs
  are individually solid and walk-through-able — shooting one leg fells the
  whole structure. ~30 new realistic prop builders (torii gate, blast
  furnace, gantry crane, buried mech hand, icebreaker, great gate, sphinx,
  shuttle, basalt columns...), every theme re-authored with a sparse spawn
  plaza / mid cover / dense-outskirts + one hero landmark, and several
  arenas grew (harbor 120, uptown 116, frozen/ruins 112 effective radius).
  Optional generated-asset hooks with full procedural fallback: sky
  panoramas + distant-horizon strips (`src/textures/sky/`), pack textures on
  key props (`texMat`), and **Tripo GLB prop overrides**
  (`public/models/props/` + manifest, auto-scaled by `fit` height, visuals
  swapped at placement while gameplay hooks stay) — prompts for all of it in
  `docs/ARENA_ASSET_PROMPTS.md`. Verified: build green, 12/12 arena
  screenshots eyeballed, ace soaks clean on neon / volcano (4P) / harbor,
  level editor + authored levels unaffected (authored levels drop the
  seeded viaduct/patches; `k:'patch'` objects supported in level JSON).
- **Previous:** COLOR SCHEMES now work on the WHITE/BLACK/SILVER mechs, and two
  new achromatic paint jobs. A scheme used to be a hue swap that kept each
  pixel's own lightness, which only works on a mech with chroma to swap and a
  midtone value to keep: FENRIR (silver), WRAITH (near-black), RHINO + SAURION
  (gunmetal) and GLACIER (pale ice) came out of every scheme looking like
  themselves. Two fixes, both in `src/mechs/colorscheme.js` so the procedural
  and baked-GLB routes stay in lockstep: a scheme now also names the LIGHTNESS
  its paint wants and each mech is dragged 80% of the way there (so a black
  mech's EMBER is genuinely red, just the darkest red on the field), and
  `recolorglb.js` picks which texture pixels are "the paint" per mech —
  a vivid mech's armor is its saturated stock-hue family, a near-grey mech's
  armor is the NEUTRAL pixels with the saturated ones (RHINO's red horn,
  SAURION's red eyes) protected instead. Plus IVORY (warm matte bone-white)
  and SILVER (polished metal — raises GLB metalness / procedural metalPaint),
  taking the cycle to 11. Also: dev pages never cleared the index.html boot
  splash, so every `tools/shot.mjs` screenshot of a workbench was a picture of
  the title curtain (`src/dev/index.js`), and `tools/schemesheet.mjs` shoots one
  mech across schemes into a single strip.
- **Also:** per-mech HITBOXES (`src/combat/hurtbox.js`). Every mech was one
  1.7×scale sphere; it is now a set of bone-bound capsules measured off the
  model's own geometry (GLB: skinned verts bucketed by dominant bone; proc:
  meshes under each rig joint), so the shape matches the silhouette AND
  follows the animation. Melee resolves on the STRIKING LIMB — a swept
  capsule from elbow/knee to just past the fist/foot — instead of a ball
  hung off the sternum, and bullets/beams test the swept step against the
  capsules. `hitRadius` is untouched (AoE falloff, camera). New workbench
  `?debug=collider`, plus `tools/hurtboxfit.mjs` (per-mech fit audit) and
  `tools/hitprobe.mjs` (new-vs-old melee comparison on a live fight).
- **Also:** INFERNO custom rig (`rigs/inferno.rig.js`), staged on his manifest
  `alt` entry so the shipped mech is unchanged — 24 hand-placed bones, zero
  far-hierarchy seam edges (the Tripo rig had 19), worst clip stretch 0.108 vs
  0.208, and a complete 15/15 hurtbox against the primary's 9/15. `?debug=skin`
  and `?rigedit` gained an **Edit Alternate GLB** checkbox (`src/dev/altpick.js`);
  `?rigedit` opens the alt automatically when only that build has a rig.
  Fixed `Assembler.custom` ignoring a per-axis `s` — jerry's three torso seam
  bands had a NaN world matrix and never rendered.
- **Anchor preservation applied to the alt-staged rigs.** Inferno's alt was
  58° off — its flamethrower fired sideways — because the new muzzles were
  authored on the nozzle bones from scratch instead of solved to reproduce the
  primary's world pose. Re-solved with `tools/anchorkeep.mjs --remap`; inferno
  and rhino now both PASS. Rhino's alt also had no pinned `modelScale`, so it
  rendered at a different size and the comparison was meaningless. anchorkeep
  now reports both of those conditions and downgrades to ADVISORY where a
  difference is legitimate (different model, or a rig already promoted).
- **Inferno alt skin patch** (owner-authored, ?debug=skin): 1852 verts of the
  lower chest rebound from `hips` to `torso`. Cost, over the clips inferno
  actually plays: worst cross-bone stretch 0.108 -> 0.148 (`dead`), vs the
  Tripo primary's 0.208.
- **cliptear's `Nx` ratio is not a stable statistic** — it is stretch over the
  worst edge's BIND length, so when that edge is near-zero-length the ratio
  swings wildly (two identical runs: 112x and 108x; an earlier pair read 403x
  and 143x). Read the ABSOLUTE stretch, which is stable to ~0.001. Its
  "worst clips" list also spans every clip in the game, not the ones this mech
  plays — of inferno's top 12, only `dead`, `heavy` and `groundPound` are his.
- **Branch:** `claude/3d-mech-battle-game-uxps6q`

## Tech stack

- Three.js + Vite, ES modules, no TypeScript.
- All 3D models built procedurally (armor-plate construction, PBR materials,
  canvas-generated textures: plating, grime, decals, emissive trims).
- Procedural pose-based animation system (keyframe poses + blending) driving a
  bone hierarchy of Object3D joints.
- Custom lightweight physics (capsule vs AABB, ballistic debris) — no physics lib.
- WebAudio procedural SFX + synth music, no audio assets.
- Post-processing: bloom (emissives), FXAA, vignette for the AAA look.

## Phases

### Phase 1 — Project scaffold & engine core ✅
- [x] Vite + Three.js project scaffold (`package.json`, `vite.config.js`, `index.html`)
- [x] Renderer, scene, camera, resize handling, fixed-step game loop
- [x] Lighting rig (key/fill/rim + hemisphere), PCF soft shadows
- [x] Post-processing stack: UnrealBloom + FXAA + vignette
- [x] Procedural texture generator (armor plating, grime, hazard stripes, decals)
- [x] Math/easing/utils, object pools

### Phase 2 — Mech construction kit & 12 mech designs ✅
- [x] Part library: armor plates, joints, pistons, thrusters, antennae, cockpits, weapon meshes
- [x] Rig builder: full joint hierarchy (root/hips/torso/head/shoulders/elbows/wrists/hips/knees/ankles)
- [x] Material system: per-mech PBR palettes + emissive accent trims
- [x] 12 unique mech designs (silhouette, weapons, personality):
  - [x] 1. TITANUS — colossal brawler, rocket-fists (heavy)
  - [x] 2. VULCAN — gatling gunner, ammo-belt berserker (ranged)
  - [x] 3. AEGIS — shield paladin, energy lance (defense)
  - [x] 4. VIPER — twin-blade assassin, serpentine (speed)
  - [x] 5. NOVA — plasma archmage, floating cannon arrays (caster)
  - [x] 6. RHINO — charging bull, seismic horn (charger)
  - [x] 7. TEMPEST — storm dancer, lightning whips (electric)
  - [x] 8. FENRIR — wolf chassis, claw frenzy (feral melee)
  - [x] 9. COLOSSUS — walking artillery, mortar barrage (siege)
  - [x] 10. WRAITH — stealth sniper, phase cloak (sniper)
  - [x] 11. INFERNO — flame juggernaut, napalm (fire)
  - [x] 12. GLACIER — cryo fortress, freeze beam (ice)

### Phase 3 — Animation system & full move sets ✅
- [x] Pose/keyframe animation engine with blending & layers
- [x] Locomotion: idle (breathing/personality ticks), walk, run, jump, dash, air fall, land
- [x] Combat anims: light combo (3 hits), heavy attack, ranged fire, block, hit-stagger, launch, knockdown, get-up
- [x] Special & ultimate attack anims (unique per mech)
- [x] Personality: intro taunts, victory poses, idle fidgets

### Phase 4 — Combat system ✅
- [x] Health/energy/ult meters, damage & knockback model, hit-stop
- [x] Melee hitboxes with combo chains
- [x] Projectile system (bullets, rockets, plasma, mortar arcs, beams, flame cones)
- [x] Blocking, dodging (i-frames), launcher attacks
- [x] Per-mech specials (cooldown) + ultimates (meter)
- [x] VFX: muzzle flashes, impacts, explosions, sparks, smoke, shockwaves, trails

### Phase 5 — Destructible city arenas ✅
> USER NOTES: industrial landscapes with a steampunk edge (smokestacks, gears,
> brass/copper, steam vents) + matching soundscape; keep anime dynamism and
> colorful mech cores. Slightly battle-worn look on materials.
- [x] City generator: streets, sidewalks, props, skyline backdrop
- [x] Destructible buildings (chunk-based: facade panels shear off, structure collapses)
- [x] Debris physics (ballistic chunks, bounce, fade), dust clouds
- [x] Collateral damage from attacks & mech bodies
- [x] Theme-driven arena framework (sky/fog/lighting/ground/buildings/props/ambient particles as data)
- [x] 12 UNIQUE ARENAS (user request): Neon District (night), Ironworks Foundry
      (steampunk), Uptown (day), Harbor Docks (dusk), Sky Terrace (rooftop),
      Scrapyard (rust), Crystal Quarry, Volcanic Forge, Frozen Outpost,
      Desert Ruins, Jungle Temple, Orbital Platform
- [x] Steam vents / gears / industrial props, ambient particles per theme
- [x] NOTE: after framework + first 3 themes, spawn parallel agent to author
      remaining themes in src/arena/themes.js while main session builds
      AI/input/camera/menus (disjoint files)

### Phase 6 — AI opponents ✅
- [x] AI controller: approach/strafe/spacing, attack selection, blocking, dodging
- [x] Special/ultimate usage logic
- [x] Difficulty levels (Rookie / Veteran / Ace)

### Phase 7 — Input & local multiplayer ✅
- [x] Keyboard mappings (P1: WASD+..., P2: arrows+...)
- [x] Gamepad API: Xbox controller mapping, hot-plug, rumble (vibrationActuator)
- [x] Up to 4 local players (any mix of human/AI), free-for-all
- [x] LEGO-style dynamic camera: combined third-person view when players are
      close, splits into per-player chase views when they separate (hysteresis,
      up to 4 viewports), glowing dividers
- [x] Fullscreen toggle (key + menu)

### Phase 8 — Game flow, HUD & menus ✅
- [x] Title screen
- [x] Mech select (rotating 3D showcase, personality blurb, stats)
- [x] Arena select
- [x] Round system (best-of-3), KO logic, intro/outro sequences
- [x] HUD: health/energy/ult bars, portraits, round pips, announcements
- [x] Pause menu, results screen, rematch

### Phase 9 — Audio ✅
- [x] WebAudio SFX synth: impacts, gunfire, explosions, servo whirs, footsteps
- [x] Announcer-style stingers (synth), menu blips
- [x] Dynamic music (menu theme + battle theme, synth arps/bass/drums)

### Phase 10 — Polish & ship ✅
- [x] Performance pass (instanced chunks/debris, pooled particles/projectiles, merged mech geometry, ~66 draw calls in 4-way split)
- [x] Balance pass across 12 mechs (soak-tested all move sets, flame nerf)
- [x] README with controls & how to run
- [x] Final build verification (`vite build`) + browser smoke test & screenshots (docs/)

## Progress log

- 2026-07-06: Repo initialized. Task plan laid out.
- 2026-07-06: Phase 1 complete (scaffold, engine, post FX, textures, utils).
- 2026-07-06: Phase 2 complete (part kit, rig, materials, 12 designs verified
  via browser screenshot). User notes added: dynamic combine/separate camera,
  fullscreen, battle-worn look, steampunk-industrial arena + soundscape.
- 2026-07-06: Phases 3-8 complete: animation, combat (specials/ults/projectiles/
  VFX), destructible arena framework + 12 themes, AI, input (KB+Xbox), dynamic
  split camera, full menu/match flow. Verified end-to-end in browser.
  Spawned agents: audio system + arena theme deepening. README written.
- 2026-07-06: Audio agent delivered 49 SFX + 4 music tracks (committed). Arena
  agent delivered 33 new props + lighting pass on all 12 themes (committed).
  Full-match soak: menus → battle → 2 rounds → results, zero errors. Pause/
  quit teardown verified. Production build passes. Screenshots in docs/.
  ALL PHASES COMPLETE — SHIPPED.

## Phase 11 — AI character pipeline (user request, 2026-07-06)

- [x] Runtime GLB character pipeline: manifest-driven loading
  (public/models/manifest.json), skinned-clone per fighter, height/ground
  normalization, procedural fallback when a model is missing/broken
- [x] RigAdapter: convention-free humanoid retargeting (world-space rotation
  offsets, T-pose/A-pose bind presets, Mixamo-style bone-name auto-mapping,
  boneOverrides escape hatch) — the FULL existing animation set drives any
  standard rigged GLB
- [x] ?rigtest harness: synthetic Mixamo-convention T-pose skeleton;
  verified 15/15 bones map, rest/walk/heavy retarget correctly
- [x] docs/CHARACTER_PIPELINE.md (workflow: images -> Meshy/Tripo/Mixamo ->
  manifest) + docs/canonical-prompts.md (12 style-locked prompt sheets)
- [ ] AWAITING USER: canonical images (or an imagegen API key), and a
  Meshy/Tripo API key OR user-provided rigged GLBs — then wire real models

## Phase 12 — Image-to-mech hand-built pipeline + VULCAN pilot (2026-07-06)

- [x] PBR skin synthesizer (src/core/pbrtex.js): albedo + normal (Sobel over
  synthetic height) + roughness/metalness maps from layered procedural noise
  (fBm paint, Worley chip clusters, BSP panel lines, rivets, scratches, grime)
- [x] Skin-recipe hook in factory (def.skin drives materials); decal plates
  via Assembler.custom (text/emblem rendering, re-weathered)
- [x] VULCAN rebuilt to the canonical concept image: twin gatling forearms,
  quad missile towers w/ red lenses, crested head w/ orange visor, bone-white
  + oxide-red battle-worn plate, VULCAN chest decal, 07X shin markings
- [x] tools/palette.mjs: k-means palette extraction from concept PNGs ->
  suggested skin recipe (validated: matched hand-picked palette within ~2%)
- [x] docs/IMAGE_TO_MECH.md pipeline guide; docs/vulcan-rebuilt.png pilot
- [ ] User judgment on pilot quality -> roll pipeline across remaining mechs
  and/or go the Meshy/Tripo GLB route (pipeline for that also ready)
- 2026-07-06: VULCAN v2 sculpted rebuild (user feedback: rounded/exact forms):
  added curved-form vocabulary to parts kit (bulgeLathe, facetBulge,
  beveledPlate + shield/rhomb outlines, capsules), rebuilt VULCAN fully
  bespoke — bulging chest over pinched waist, barrel thighs, rhomboid faceted
  forearms, beveled shield plates. Verified idle/walk/heavy + battle soak +
  lineup regression. Vocabulary ready to roll across remaining 11 mechs.
- 2026-07-06: ALL 12 mechs now sculpted: 3 parallel agents rebuilt the
  remaining 11 (heavies/lights/casters) with the lathe/facet/beveled-plate
  vocabulary; TITANUS rebuilt to the user's canonical concept image (gorilla
  proportions, hazard pauldrons, radial reactor core, twin radiator towers).
  Verified: per-mech idle/walk/attack screenshots, 3x 120s ace-AI soaks
  covering all 12 (zero crashes), full menu flow, production build.
- 2026-07-06: Durable documentation pass: docs/MECH_ART_GUIDE.md (master
  operator manual: route decision tree, image reading, sculpting vocabulary,
  verification loop, per-mech combat CONTRACT, pitfalls), CLAUDE.md (session
  onboarding), tools/shot.mjs + tools/soak.mjs moved in-repo (playwright-core
  devDep), tools/img2glb.mjs (best-effort Meshy/Tripo API client with
  verify-docs-first caveats). Any future AI session can continue the
  image->mech work from these alone.
- 2026-07-06: ALL 12 MECHS AT CANONICAL-IMAGE FIDELITY. User supplied concept
  images for every mech; six parallel agents rebuilt the remaining 11 to
  image-derived specs (banner-pod AEGIS, crescent-halo NOVA, horn-blade VIPER,
  carapace-dome RHINO, V-cannon COLOSSUS, crystal GLACIER, lightning-crest
  TEMPEST, furnace-face INFERNO, reaper WRAITH, werewolf FENRIR). All
  palettes/skins measured from images; visual specs archived in
  docs/canonical/SPECS.md (PNGs to be committed by user). Verified: per-mech
  idle/walk/attack, 3x ace soaks (zero crashes), menu flow, build green.

## Phase 13 — Multiplayer UX + combat audit (user request, 2026-07-11)

- [x] Always-split multiplayer view: removed combined<->split hysteresis; 2+
  humans render permanent per-player viewports (solo/spectator keeps the
  cinematic combined cam). 2P layout toggles side-by-side <-> stacked at
  runtime (pause-menu item + F9), persisted in localStorage. Dividers per
  layout; HUD plates repositioned into each player's viewport
  (hud.positionPlates); chase cams ray-pull in front of buildings
  (arena.raySolid) so a viewport is never buried in geometry.
- [x] Controller-native menus: direction keys now match visual layout
  (setup: LEFT/RIGHT picks the player card, UP/DOWN changes it); stick/dpad
  and held keys auto-repeat (380ms delay / 150ms interval, Input._navRepeat);
  sub-frame taps still register. MECH SELECT is fully simultaneous: every
  human gets their own colored cursor, lock/unlock (A/B), per-player compact
  info cards, multi-mech 3D previews on player-colored rings
  (MenuStage.showPreviews); battle auto-advances 450ms after last lock.
  kb2 no longer shares plain Enter with kb1 for confirm.
- [x] Attack-connect audit across all 12 mechs (new tools/attackmatrix.mjs
  forces ranged/special/ult vs a circle-strafing victim and asserts damage):
  - missileVolley + starfall: pop-up projectiles now RETARGET the nearest
    living enemy when their captured target dies/clears (projectiles.js
    retarget flag) — no more skyward fireworks.
  - bulletHurricane fired over everyone's head (muzzle y~7.2 vs target
    center ~3.8): ring now pitches down to chest height and every 3rd round
    tracks the nearest enemy.
  - wave (AEGIS lance) launched too high: spawn height capped at chest level.
  - barrage re-aims EACH shell at launch with per-shell flight-time lead;
    mortar/bigBertha/judgment lead the victim's velocity; pounce leads its
    landing; direct-fire ranged now leads moving targets by flight time
    (hitscan unchanged) — strafing no longer hard-counters slow projectiles.
  - AI: self-AoE specials/ults (groundPound, staticField, supernova,
    backdraft, absoluteZero) gated by their radius, shard bucketed mid-range.
  Matrix: ALL 36 attack channels connect (wraith special = cloak, by design).
- Verified: attackmatrix ALL CONNECT, 3x 120s ace soaks (4P/3P/4P, zero
  crashes), headless 2-keyboard menu flow -> battle -> F9 flip -> pause
  (screenshots viewed), vite build green.
- 2026-07-11: Per-player cameras: each split viewport now starts directly
  BEHIND its own player (spawn yaw + pi, verified exact) instead of a shared
  south azimuth, and the RIGHT STICK orbits that player's camera (az/el, per
  viewport; solo combined view feeds the look offsets). Touch drag steers the
  touch player's own viewport in split. Taunt moved RS-click -> VIEW button
  so stick clicks can't misfire while steering. Verified: headless orbit +
  behind-init math checks, 2P menu flow screenshots, soak, build green.
- 2026-07-11: Movement & world feel pass (user request):
  - Faster walks (+20% global), longer dashes (x4.2 speed, 0.3s) that STRAFE
    (dash keeps facing a nearby enemy = combat sidesteps), higher jumps
    (+18%), and HOVER JETS: second jump press + hold flies; lighter mechs
    get more fuel (up to ~2.8s) and stronger climb (verified: viper apex ~39
    vs colossus ~12); fuel refills on the ground; jet glow/smoke FX.
  - Attack animations made dynamic: full-body twist (hipsRot), side leans,
    deeper coils, tiptoe launches, outBack overshoot on strikes across
    lights/heavy/shoot/casts/brace/lunge/charge/burst/flurry/spinFire/
    groundPound/shieldBash. All durations + event times unchanged (combat
    balance untouched). Verified via showcase screenshots.
  - Arenas DOUBLED (bounds x2, building count x2 w/ 4 in-field cover, prop
    rings + fog + skyline + shadow extent scaled, spawns widened to 34).
  - Camera see-through: buildings crossing any follow-cam->mech segment
    dither-fade to 25% (per-instance aFade attribute + shader patch, eased,
    per building) for split chase cams and the solo chase cam; replaces the
    ray pull-in. Verified with staged occlusion screenshot.
- 2026-07-11: Controller-first setup defaults: with 2+ pads connected the
  first two player slots default to the first two controllers (1 pad ->
  P1 pad vs AI); hot-connecting a pad on the setup screen re-applies
  defaults unless the player already customized slots. Gamepads are now
  numbered by their order among CONNECTED controllers (pads at browser
  indices 1&2 read GAMEPAD 1/2, not 2/3). Verified with stubbed gamepads.
- 2026-07-11: Missiles/camera/lean/pause polish (user request):
  - Guided missiles easier to dodge: homing switched to LEAD pursuit with a
    terminal COMMIT (last ~0.15s flies straight, so a timed dash sidesteps
    it; steady strafing still gets hit); turn rates trimmed (volley 4.8,
    starfall 4.0). Guided dmg down (volley 26->22, starfall 38->34);
    dumb-fire ordnance up (rocket 70->82, shell 48->56, mortar 60->68,
    barrage 45->50). attackmatrix: ALL CONNECT.
  - Flying camera: solo frame rides up with the hovering player; split
    chase look-target follows the flyer (worst on-screen NDC 0.33/0.52 at
    apex, verified).
  - Run/fly lean: stronger forward lean + whole-body pitch while running
    (head compensates); hover flight pitches Iron-Man-forward with speed,
    legs trailing. Verified via screenshots.
  - Pause menu gained a FULLSCREEN item.
- 2026-07-11: Combat control overhaul (user request):
  - Punches angle inward toward the centerline (shoulder-z cross-body aim)
    so wide-armed mechs connect visually.
  - Kinetic momentum bonus: melee dmg/knock scale with attacker speed above
    walking pace (up to +70%) — dash-punches and dive hits reward momentum.
  - Aerial heavy = PLUNGE: the smash rides down (accelerated fall) and
    detonates a ground shockwave on landing, damage scaling with fall speed.
  - Fly-fighting: attacks and blocking work while hovering (jets stay lit
    through attack state); blocking no longer requires being grounded.
  - Aiming: NO horizontal auto-aim on ranged fire — humans fire where the
    camera points (intent.aimYaw), AI squares up to its target as its aiming
    model; only vertical assist remains when an enemy is down the barrel
    (dot>0.86). Mortar ranges its arc to the barrel target. Homing stays
    exclusive to B-button specials (missile volley / starfall).
  - Strafe-lock button: hold LB (kb1 Q / kb2 Num7) to face the camera aim
    while moving sideways. ULT moved to D-pad UP (D-pad up no longer moves).
  - Sound toggle: speaker button bottom-right on all menus + pause; SOUND
    ON/OFF item in pause menu; persisted (rw.muted).
  - attackmatrix updated: ranged tested vs an approaching victim (aim
    correctness) since strafing now legitimately dodges dumb-fire; specials/
    ults still tested vs circle-strafe. ALL CONNECT; 2 soaks clean; hover-
    attack/air-block/plunge/strafe-lock all verified headlessly.
- 2026-07-11: Ammo, escape jump, toroidal arenas (user request):
  - AMMO for burst weapons: gatling 160 / flame 130 rounds; dry click at 0;
    4 glowing crates spawn per battle (full refill on touch, 14s respawn);
    AI detours to crates when dry and holds fire; HUD shows AMMO count
    ("FIND A CRATE" when empty); refills between rounds.
  - ESCAPE JUMP: press JUMP while knocked down to spring clear (input dir or
    backward, 0.9s i-frames) — breaks knockdown loops. AI uses it too.
  - TOROIDAL ARENAS: no walls; space wraps at ±bounds*1.35 (seam sits in the
    foggy empty ring). Fighter/projectile positions fold; nearest-image
    deltas everywhere (enemy queries, AI pursuit, melee, explosions,
    shockwaves, projectile collision/homing, artillery lead, camera framing
    & behind-az). The wrapping player's camera shifts with them — verified
    max 0.02 NDC on-screen jump/frame through the seam (sub-pixel). Enemies
    re-encountered at regular intervals; boundary ring/pylons removed.
  - Verified: wraptest (seam/ammo/escape), attackmatrix ALL CONNECT, 2 ace
    soaks clean, menu flow clean, crate screenshot viewed, build green.
- 2026-07-11: THREE NEW MECHS wired (CRANKY crab / SAURION raptor / FROGGER
  slime-frog): full roster kits (water cannon+geyser+riptide; razor plumes+
  sickle rush+extinction; slime slinger+quad barrage+royal ribbit), new
  ranged types water/feather/slime, AI buckets, 15-mech 4-column select
  grid, canonical image specs archived. Design files sculpted per-image by
  parallel agents (designs/cranky|saurion|frogger.js).
- 2026-07-11: TEXTURE PACK integration: CONFIG.useTextures (default ON,
  ?textures=0 off) + src/core/texload.js (import.meta.glob loader).
  Grounds per arena (tinted toward theme), building facades per style
  (emissive windows, whisper tints), mech armor from neutral-gray pack
  albedos tinted by palette (worn/heavy/clean/bare-steel selection by
  recipe, gunmetal frame bucket). Missing files auto-fallback procedural.
  Round-2 gap/redo prompt appended to docs/TEXTURE_GEN_PROMPT.md
  (4 missing grounds, kaleidoscope regen, glass facade redo).
- 2026-07-11: SEAMLESS WRAP v2 (toroidal rendering): destructible chunks
  ghost-tiled into 8 neighbor cells inside one InstancedMesh (stride
  blocks; kills/fades mirror to ghosts), props cloned at 8 offsets,
  skyline camera-locked as an infinite backdrop (was the "grey buildings"
  pop), dynamic entities (fighters/projectiles/pickups) shifted to their
  nearest image per viewport before each render and restored after
  (engine.onBeforeView/onAfterView), fog capped at 400 so nothing beyond
  the ±1-cell tiling shows. Verified: standing at the seam looking across
  shows the city + opponent exactly as if walking through; entity shift
  math exact (150.4 == expected); soak + menu flow clean.
- 2026-07-11: CRANKY/SAURION/FROGGER design bodies sculpted (by the lead —
  the parallel agents were stopped with the interrupted turn): crab shell
  dome + pincers + shoulder water cannons/tanks + decor crab legs; raptor
  skull/crest/feather fans/3-joint feathered tail/sickle toes/red seam
  glows; frog dome-eyes/slime visor + drips/quad slime guns/webbed feet
  (translucent MeshPhysical slime). Verified: showcase iterations viewed,
  daylight trio lineup viewed, 15-mech attackmatrix ALL CONNECT (titanus 0
  was test variance — reruns 58/115), 2 ace soaks with the trio, menu flow
  clean, build green.
- 2026-07-11: COMBAT DEPTH BATCH: universal ammo (every ranged weapon has a
  per-weapon count; crates refill ALL mechs — the new trio previously had
  no ammoMax so pickups silently skipped them; 6 crates, 10s respawn,
  wider pickup radius) · DUCK (hold C / Num8 / L-stick click; slows
  movement, shrinks+lowers hitbox, animator squat — FROGGER duckDepth 1.0
  goes ankle-low, saurion 0.75) · SAURION velociraptor rework (torso/head
  restPose pitch kept through clips via restBias, deeper leg crouch,
  animated counterbalancing tail in signature(), much bigger sickle toe
  claws + flanking toe spikes, special is now a true pounce: ballistic
  leap onto the led target, toe-claw slam + 2 pinned rakes + bleed) ·
  FROGGER 4 real arms (upper cannons rebuilt as shoulder2/elbow2 joint
  chains; signature() mirrors lower-arm motion onto them so all four pump
  in every move; muzzles ride the elbows) · BUILDINGS: rooftop landing
  (collideFighter exposed-top support w/ landing FX; shockwaves are
  height-relative so rooftop slams connect), unstable collapse (killChunk
  re-checks 5 neighbors; <45% chunks alive or <40% of the ground floor →
  bottom-up forced rubble cascade), projectile substep vs walls (no
  tunneling) + stronger chip damage (1.4x, r2.2) · CAMERA: player-only
  see-through (per steer), fade 0.15, and HARD framing anchor — centroid
  may pull at most 9u off the solo player, split-cam look-ahead capped at
  8u/9u vertical so the player's mech is never lost. Verified: 15-mech
  attackmatrix ALL CONNECT (saurion special 110), rooftop/duck/ammo/
  collapse functional probe green, 2 ace soaks, showcase + battle shots.
- 2026-07-11: FOLLOW-UPS: single-shot weapons never spent ammo (only
  channel weapons decremented) so they sat at full forever and crates
  ignored them — doRanged now decrements on every shot (verified 26→21→
  refill 26) · per-view cameras follow ONLY their own character: split-cam
  look target is the player alone (no enemy lean), solo combined cam
  centers dead-on the player (no centroid pull, max dist 34) — the mech
  can no longer drift off-center · COLOR SCHEMES: 4 paint jobs per mech
  (STOCK/EMBER/TIDE/MIDNIGHT via hue-force/darken of skin.primary base
  colors + menu tint + glow; works in both texture-tint and procedural
  paths). Cycle with X (pad) / R (kb1) / Num4·M (kb2) / 🎨 COLOR (touch)
  in mech select — pre- or post-lock; lock-in auto-bumps duplicates so
  same-mech players always differ (battle start re-checks, AI included);
  swatch row on the info card, scheme name in the chips, live recolored
  stage preview; &c1..c4 debug params. Verified: 4 titanus in 4 schemes
  screenshot clearly distinct, attackmatrix ALL CONNECT, ace soak clean.
- 2026-07-11: MENU MERGE + COMBAT/MODEL BATCH.
  · UNIFIED FIGHTER SELECT: folded the old BATTLE SETUP screen into mech
    select. Title → one screen. Controllers auto-join on connect; any
    unassigned pad/keyboard JOINS by pressing confirm; an ＋ADD PLAYER card
    cycles kb1/kb2/pads/CPU-tiers/off (click), CPU cards cycle difficulty /
    remove. Everyone picks mech + color live; B leaves (frees the slot);
    start needs ≥2 fighters all locked. SetupScreen deleted; players-bar UI +
    CSS added; slots round-trip so returning restores the line-up.
  · BLOCK TIERS: per-mech blockMult (fraction that leaks past a guard) —
    Cranky 0.04 & Rhino 0.05 strongest, Aegis 0.06, heavies ~0.09-0.10,
    lights (Viper/Wraith) 0.20. Knock scales with it. Verified Cranky
    blocked 4 vs 74 unblocked.
  · CROUCH DYNAMIC: an attack thrown while DUCKING lands LOW and slips under
    a STANDING block (full dmg); crouch yourself to block low. Duck now
    persists through the attack while held so the strike registers as low.
    AI crouches vs a turtling blocker. Verified 74 through / 4 blocked.
  · SAURION GUARD-BREAK: stats.guardBreak 0.6 → its hits shatter a raised
    guard ~60% (orange spark, extra hitstun). Verified 24/40.
  · RHINO HELD CHARGE: bull rush now rolls as long as B is HELD (min 0.85s
    lunge so a tap still connects), up to a 5s cap; steers toward the enemy,
    can re-hit; ends instantly on release. AI holds it. Matrix special 126.
  · SAURION buffs: HP 900→1080; raptor pounce leap 22→44 (doubled) with a
    higher, longer arc + a reliable landing slam (groundShockwave) then two
    pinning toe-claw rakes with bleed.
  · MODELS/ANIM: Cranky's hands rebuilt as real crab claws — bulbous
    propodus off the wrist + fixed lower finger + a hinged upper dactyl
    (jawL/R joints the animator gapes at rest and SNAPS shut on a strike),
    no more "held geometry". Frogger's four arms now gait as one creature:
    the upper cannon-pair counter-swing the lower pair (alternating pump)
    with an idle bob, not 2 arms + static props. Saurion gets researched
    raptor locomotion: a stride-synced travelling S-wave down the tail
    (segments phase-lagged, amp scaling with speed, raised at rest → leveling
    behind at speed) for angular-momentum counterbalance, plus head
    stabilization that cancels the body's yaw sway to hold the gaze level.
  Verified: build green, attackmatrix ALL CONNECT (rhino special 126,
  saurion 58, titanus-ranged-0 was variance → 114 on rerun), 4-way ace soak
  clean (3 KOs, no crash), select-flow drive-through (title→pick→lock→arena),
  functional probes for block/crouch/guardbreak/charge + tail-wave/jaw-snap,
  showcase + battle screenshots viewed.
- 2026-07-11: RHINO CHARGE FIX + DESTRUCTION BATCH.
  · RHINO HELD CHARGE (real): intent.special was an edge (one frame), so the
    "hold to charge" never actually held — added intent.specialHeld
    (kb/pad/touch held state) and bullRush now reads it, charging up to 5s
    while B is down (min 0.85s lunge on a tap), ending ~0.17s after release.
    Verified 5.18s held / 0.17s release. AI holds it a few seconds then lets
    go. During the charge Rhino drops onto ALL FOURS and gallops (animator
    'rhino' case pitches the frame down, arms become pounding front legs,
    legs gallop opposite phase) via ctx.charging.
  · EXPLOSIVE TANKS: fuelTank props are now flammable — hazard-chevron glow,
    userData.explosive {r,hp}. Registered in arena.explosives. A fighter
    running into one, a projectile striking it, or any blast in range cooks
    it off: fireball + rising embers + burning fire-patch crater, AoE that
    scorches nearby fighters (up to ~70 dmg, knock/launch, 3.5s burn),
    cracks nearby building chunks, and chain-reacts other tanks. Pulled
    tanks into the play area (ring 16-34, count 4) across the 4 themes that
    have them. Verified detonate → 55 dmg + burn on a neighbor.
  · COLLAPSE → INTERACTABLE RUBBLE: a building that structurally collapses no
    longer just vanishes into a dust puff — every chunk drops as a FULL-SIZE
    block (new bounded rubble system, cap 200) that tumbles under gravity,
    lands, bounces once, then SETTLES flat as solid rubble. Fighters push
    against settled blocks and can stand/land on top of them (collideFighter
    extended). Verified 33/33 blocks settle at rest height and a mech dropped
    on one lands on its top face (standsOnRubble). Fixed a latent aliasing
    bug: killChunk's `vel` aliased the shared _p temp that hideChunk clobbers
    to (0,-500,0), so collapse debris/rubble were being launched at ±500 —
    now the impulse is captured before hideChunk.
  Verified: build green, attackmatrix ALL CONNECT, two ace soaks (4-way
  foundry + harbor) clean, functional probe (charge/tank/rubble/stand-on)
  all pass, screenshots of the quad-gallop charge, tank blast embers, and a
  settled rubble pile.
- 2026-07-11: AIM/FADE/CHARGE/SHIELD FIXES.
  · NO AUTO-POINTING for humans: faceNearestEnemyIfClose is AI-only now —
    aimed moves (specials/ults/beams, always=true) snap to the player's OWN
    camera aim (aimYaw), plain melee strikes along current facing, dash no
    longer swings a human to face the enemy. specials.aimDir(): humans fire
    along their yaw (vertical assist only when a target is within ~15° of
    the barrel); fenrir pounce / saurion pounce lead-aim only for AI (humans
    leap along their aim, with a range clamp when the target is already on
    the aim line); bullRush steering AI-only. Verified: melee leaves yaw
    untouched; special with aimYaw faces the aim, not the enemy.
  · TRANSPARENCY ONLY WHEN OCCLUDING: buildings were fading ghost copies —
    writeFade stamped all 9 wrap copies whenever the base building crossed
    the camera→player segment, so a building across the seam (nowhere near
    the line of sight) went glassy. setOccluders now tests EACH tiled copy's
    shifted AABB and fades copies independently (per-copy fadeTarget/fade
    arrays; writeFade(b, g, v)). Verified: base copy fades, its 8 ghosts
    stay solid, far segments fade nothing.
  · BULL RUSH ENDS ON HIT: the charge stops the moment it connects (one
    clean launch + 0.45s recovery), runs to the 5s cap only if nothing is
    hit. Verified: hit at 0.57s ends it (63 dmg), no-target run 5.02s.
  · AEGIS SHIELD: while blocking, the shield joint's rotation now CANCELS
    the whole arm chain (parent world-quat inverse x root quat + brace
    tilt, slerped) so the face presents square to the front instead of
    turning upside-down/backward; out of block it eases back to the natural
    forearm carry. Verified with front-on carry + block screenshots.
  Verified: build green, attackmatrix ALL CONNECT (AI aiming untouched),
  3-way ace soak clean, logic probe 10/10 checks.
- 2026-07-11: LAZY FOLLOW-CAM: while a mech runs roughly along its facing
  (vel·facing > 0.3, speed > 3) and the camera control is idle, the orbit
  azimuth damps around to sit BEHIND the character — in the solo combined
  cam (rate 2.0; falls back to the enemy-relative framing when idle) and in
  every split chase cam (rate scales with speed). Any right-stick input or
  touch drag owns the camera: it suppresses the follow while held plus a
  0.6s grace after release (3s for touch drags), and the solo cam's
  enemy-based auto framing now also waits out manual look instead of
  drifting beneath the player's drag. Verified: running west converges the
  azimuth to exactly yaw+PI; a held manual look stays put while running.
- 2026-07-11: BLASTS/GAITS/PER-VIEW FADE.
  · TANK EXPLOSIONS bigger in every way: blast radius 8+r*2.5 (~13.5-16, was
    ~8-10; touch trigger now uses the tank's PHYSICAL bodyR so it doesn't
    pop from range), staged fireball (ground burst 1.35r + golden core +
    delayed mushroom crown at top+4), expanding ground ring, 30 fire-column
    glows + black smoke, shake 1.3, dmg 95 @center w/ knock 24 / launch 11 /
    3.8s burn, building damage 200 @ 0.85r, fire patch 0.6r for 6.5s.
    Verified: 35 dmg + burn at 9u (old radius barely reached).
  · QUADRUPED AMBLE: roster gait:'quad' (TITANUS gorilla, RHINO bull,
    FENRIR wolf, CRANKY crab) — as the run picks up (ratio>0.4→0.75 blend)
    the frame pitches over the arms, which become pounding front legs on
    the opposite beat of the hinds; head stays on the horizon; deeper hind
    crouch + stride-rate bound. Layered in the locomotion pass so action
    clips still blend over it; rhino's full-override charge gallop remains.
    Verified: titanus knuckle-runs, fenrir lopes (screenshots).
  · STRICTLY PER-VIEW SEE-THROUGH: fades were stamped into the ONE shared
    fade attribute, so in split-screen a building faded for P1's camera also
    rendered glassy in P2's viewport (where it only occluded an opponent).
    Occluder segments now carry their view's camera; fade targets/easing are
    per (view, tiled copy) on each building, and applyViewFade() stamps the
    attribute in engine.onBeforeView right before EACH view renders — a
    building is transparent only in the viewport of the player it hides.
    Verified: same chunk reads 0.15 in view A, 1.0 in view B / unknown cams.
  Verified: build green, attackmatrix ALL CONNECT, 4-way quad-mech ace soak.
- 2026-07-11: NEW MECH — JERRY (16th fighter), from docs/canonical/
  mech_jerry.png. Giant robo-shrimp on grasshopper legs: bulging stepped
  carapace lathe w/ olive seam bands + shingled back plates, serrated
  rostrum, stalk eyes, joint-driven whip antennae, a 6-arm wriggling claw
  nest (armS0-2 L/R joints), forearm cannon pods with red bores + live
  flea critters at the muzzles, wide-splayed grasshopper legs (spring
  pistons, segmented spur tibias) + rear strut pair (legD joints).
  · FLEA SYSTEM (src/combat/fleas.js): his ammo is ALIVE. Fired fleas fly
    an arc; on a miss they land, twitch through a nervous pause, then hop
    erratically (scatter-steered toward prey, tightening as they close),
    squash/stretch on land/launch. On contact they ATTACH to the victim,
    ride the body wriggling, bite for exactly 3s (burn-style drain, ult
    gain for Jerry, red spark ticks), then pop. Wander life 6.5s (paused
    while attached). Wired: world.fleas (update/clearTransient/view-wrap
    shift), fireRanged 'flea', AI range 14, matrix roster.
  · Moves: Flea Pod ranged (ammo 14), Brine Swarm special (6 fleas),
    TIDAL PLAGUE ult (spring-crouch → 34-vel mega-leap → landing quake +
    ring of 10 fleas).
  · CROUCH-THEN-LAUNCH: stats.jumpWindup (0.18s) — generic spring-loader
    in fighter.js: jump press slams duckT to full crouch, then releases a
    jump-24 launch (highest in the game).
  · CREEPY SIGNATURE: randomized nerve timer SNAPS antennae to new angles
    (fast-ease twitch, never sway), head cocks in sharp tilts, the claw
    nest ripples in a wave down the segments and flares while firing,
    rear struts creep against the stride and scrabble mid-air.
  Verified: showcase iterations viewed (rest + walk), functional probe
  (windup 0.18s/full crouch/peak 11.6; flea attach→34 full bite; miss →
  4 hops zig-zag to prey → attach; swarm 6; ult ring 10), 16-mech
  attackmatrix ALL CONNECT, 2 ace soaks clean, battle screenshot.
- 2026-07-11: OCCLUSION STRICTNESS + TWO-WAY FOLLOW + GAIT SPRING.
  · FULL-BODY OCCLUSION TEST: a touched/grazed building was fading because
    ONE center segment (pad 1.5) clipped its padded AABB. Occlusion probes
    now carry 5 samples spread across the whole mech (center, both flanks,
    head, feet; pad 0.3) and a building copy fades only when it blocks
    EVERY sample — touching it, or clipping one shoulder behind a corner,
    keeps it solid. Verified: touch=1.0, corner-graze=1.0, full block=0.15.
  · TWO-WAY LAZY FOLLOW: the follow now reads the mech as moving AWAY or
    TOWARD the camera. Away → damps to the back view as before; charging AT
    the camera (beyond ~123°) → holds/damps to the FRONT view instead of
    whipping 180° around. Hysteresis (enter 2.15 rad / stay 1.25 rad)
    biases toward the back view; flipping run direction snaps the target
    naturally. Both solo + split cams. Verified front view while running at
    the cam, back view after turning away.
  · GAITS: TITANUS is a biped again (quad flag removed — rhino/fenrir/
    cranky keep it). Quad amble hind legs now properly articulated: cyclic
    thigh drive, deep gathering knee flexion (0.5+0.6 on the beat) and an
    ankle push-off snap. Biped walk de-stiffened: soft stance knee bend
    (never locked), bigger swing-phase knee lift, and a trailing-leg
    plantar-flex TOE-OFF so mechs push off the ground; bob rides the beat.
  Verified: 16-mech attackmatrix ALL CONNECT (jerry ranged up to 34 with
  the flatter flea launch), ace soak clean, walk screenshots (fenrir
  gathered haunches, titanus biped stride) viewed.
- 2026-07-11: FOOT PLANTING + WOLF LOPE + GAIT ASSIGNMENTS.
  · NO MORE SKATING: gait phase used a canned stride length, so foot sweep
    speed never matched translation (titanus mid-stance slide ~7.6 u/s).
    Cadence is now derived from geometry — dφ/dt = speed / (legReach·swing)
    with legReach = (thighLen+shinLen)·0.92 — anchoring the stance foot's
    backward sweep to exact ground speed. Measured mid-stance foot speed:
    titanus 0.6 vs body 8.6 (93% planted), viper 1.6 vs 16.2. Steps now
    plant and push from one spot; cadence also scales naturally with leg
    length. (Capped at 14 rad/s.)
  · FENRIR WOLF LOPE: the generic quad amble became a canine transverse
    gallop — both hinds drive TOGETHER (near-in-phase, deep gathering knee
    flexion, ankle snap) while both fronts lead by ~half a cycle, reaching
    far forward EXTENDED (elbow straightens on the reach, folds on the
    pull-through), with a spine gather/extend cycle riding the bound.
  · Gait assignments: CRANKY and RHINO are bipeds again for normal running
    (rhino keeps the all-fours gallop during his bull-rush charge); FENRIR
    is now the only gait:'quad' mech.
  · TEMPEST DE-STIFFENED: he had no restPose (dead-straight legs). Athletic
    rest crouch added (thigh -13 / knee 24 / ankle -11) — combined with the
    stance-bend + toe-off from the previous pass, his walk reads sprung.
  Verified: measured foot-plant numbers above, walk screenshots (fenrir
  reach-extended lope, tempest bent-knee stride), 16-mech attackmatrix ALL
  CONNECT, 3-way ace soak clean.
- 2026-07-12: MOVE FLAVOR PASS — five signature-move reworks.
  · TEMPEST STATIC OVERLOAD: recentered a little in FRONT of him
    (fwd radius·0.55). A heavy dark storm cloud gathers overhead (two waves
    of churning smoke at y≈13) and visible lightning hammers DOWN out of it:
    every bot caught in the area eats a strike (same 70 dmg + slow), plus 7
    scattered ground strikes. Each bolt = hot beam core + two jagged arcs +
    impact flash + ground ring.
  · CRANKY GEYSER: now telegraphed — 0.85s warning at the target spot
    (expanding pulse rings + ground-boil bubbles that churn harder as it
    primes) so the opponent can evade, THEN the eruption: water column of
    ~66 upward droplets in three pulses + fan spray + mist plume + launch
    (same numbers, aimed with the longer lead).
  · CRANKY RANGED → HYDRO HOSE: continuous firehose channel from his water
    cannons (type 'hose', 7 dmg/tick @ 0.075s cd, range 20, ammo 150,
    knock-shove 3.4). Ticks alternate muzzleL/muzzleR so both arms blast; a
    drooping jet beam + pressurized droplets + splash on the soaked victim.
  · CRANKY HEAVY → CLAW SNAP: new 'clawSnap' clip (roster heavyClip) —
    claws spread WIDE then scissor shut in one violent snap (hit + metallic
    clack + shake at the snap). Jaw signature still gnashes through it.
  · SAURION SICKLE POUNCE → true raptor kill-leap: new 'pounceLeap' airtime
    pose (legs cocked under the body, sickles raised, arms swept back) and
    the ballistic arc is now REAL — the land-poll re-asserts vx/vz each
    tick because air-control damping was bleeding the leap to ~30% of its
    distance (lands 4.3 of 14 units; found via trace). On landing: prey
    within 5.2·scale → LATCH: he rides them for 0.72s pinned at claw range
    ('biteLatch' loop, head-snap impulses), initial 62 heavy hit + bleed,
    two ripping bites (0.3×), then kicks off backward and springs clear.
    NO prey → he just gathers into a crouch (duckT), dust puff, and stands
    back up — zero whiff damage.
  Verified: 16-mech attackmatrix ALL CONNECT (saurion special 106 with the
  all-or-nothing latch; cranky hose 288 @ test dist 8; known flaky titanus
  ranged / jerry special passed on rerun), 3-way ace soak clean (tempest/
  cranky/saurion), screenshots of every rework viewed (storm cloud + down
  bolts, geyser warn rings + column launching titanus, hose spray + soak
  splash, snap launching titanus, latch ride, whiff crouch with 0 dmg).
- 2026-07-12: CHARACTER KIT PASS — six feature reworks.
  · GLACIER CRYO BEAM: first beam contact FREEZES the victim solid for
    0.55s — the whole body blanks to frost-white (per-material color +
    emissive lerp, exact originals restored) then thaws back over ~0.5s;
    a 1.8s re-freeze grace means sustained beam slows instead of
    perma-locking. takeHit no longer knocks a frozen victim out of the
    frozen state (the next beam tick used to instantly break its own ice).
  · INFERNO FLAMETHROWER: the bell nozzles point along the hand's +Z, so
    the channel pose tipped the torch skyward — the wrist now counter-
    pitches while firing (via tgt, smoothed) so the torch aims straight
    down the fire line; flames beefed to a wide orange wash + hot fast
    yellow core + bright throat glow.
  · WRAITH: ranged is NIGHT SWARM — 3 flapping bat silhouettes (new 'bat'
    projectile: flat double-sided wings, flap scale cycle, figure-8 hunt
    wobble, homing when down the barrel, normal blending so the dark
    bodies actually show). Ghost Protocol is a real GHOST WALK: a baked
    white additive spectre of his current pose glides forward as long as B
    is held (body locked, min 0.9s commit, 5s / 58-unit cap), ripping
    through anyone it overlaps (60 dmg once each); on release he teleports
    INTO the spectre (dash trails + ring + 0.35s grace). attackmatrix
    expectZero emptied — wraith special now deals damage.
  · COLOSSUS: mortar shots alternate left/right cannon with a MIRRORED
    brace animation (new mirrorRaw() clip transform → 'braceL'; fireRanged
    lobs from the matching muzzle).
  · NOVA: the broken halo's glow SWELLS toward apex alignment and dims
    past it (cos cycle on halo spin, driving glowSoft/glow2 emissive);
    while lit her plasma lances fire bigger and hotter (up to +35% dmg,
    +45% splash, +75% projectile size at full glow).
  · WALL GRAB + CLIMB (all mechs): an airborne punch HELD (X) when the
    fist meets a building face GRABS the wall instead of cracking it —
    the mech hangs (hangGrab pose, gravity off), drops on release, gets
    knocked off if hit or if the chunk dies, and JUMP springs off the
    wall so punch-hold again grabs higher: jump → grab → jump → grab
    climbing. New lightHeld intent (kb/pad/touch), destructible.grabProbe
    face query, fighter hang state.
  · Fixed latent animator bug: signature-case writes to standard joints
    were clobbered by applyPose (smoothing owns them) — Rhino's bull-rush
    all-fours gallop now actually applies, written into tgt.
  Verified: 16-mech attackmatrix ALL CONNECT (wraith special 50 was
  expectZero, ranged 176-198 bats, nova ranged 133 glow-boosted, colossus
  109/112 alternating), ace soak clean (wraith/glacier/inferno), probe
  numerics (freeze state + white 1.0 mid-freeze and 0.2 decaying after,
  handRx 1.55 while flaming, 3 bats in flight, ghost glide pos lock + 50
  dmg + teleport to spectre, _altSide toggling shot to shot, climb log
  hang y=2.0 → spring → hang y=3.9), screenshots viewed (pure-white
  frozen titanus, forward torch jet, white spectre + locked wraith,
  teleport arrival, nova bright-vs-dim halo, titanus hanging mid-wall).
- 2026-07-12: FEEDBACK PASS — aiming, Cranky, Saurion, Glacier, Fenrir.
  · WEAPONS NEVER TURN THE MECH (humans): firing/specials/ults no longer
    snap the body to the camera yaw — every attack goes along the mech's
    CURRENT facing, movement owns the orientation (faceAim + the
    faceNearestEnemyIfClose human branch are now AI-only). Verified: yaw
    held at 0 through a full hose burst with aimYaw pinned 90° away.
  · CRANKY HOSE: cannons stay LOW — new 'shootLow' channel clip (roster
    channelClip) keeps the arms angled down-forward (-40°, was -86°
    overhead) with a braced shell. Cranky's scuttle roll + hydro recoil
    signature also actually apply now (were writing joints post-clobber).
  · CRANKY CLAW SNAP: reworked — both claws spread WIDE to the sides then
    CLAMP together at the centerline (shoulder yaw sweep + elbow fold),
    instead of just raising them.
  · SAURION SICKLE POUNCE: bird-of-prey rework. Leap is much taller
    (vy 21, ~1.24s hang). The latch now requires coming down ON TOP of the
    victim — contact HIGH on their body (0.35-1.6× height, tight radius)
    while descending; he then PERCHES on their shoulders (pinned at
    +0.55× prey height), feet clamped, hammering three fast pecks
    ('biteLatch' reworked into a hunched gripping crouch with a rear-back /
    strike-down head cycle), then springs off. A stooping-hawk dive
    correction curves the fall onto strafing prey (this is what makes it
    land). Ground landing is still a plain crouch recovery, zero damage.
  · GLACIER CRYO BEAM: no more discrete freeze from the beam — the victim
    is frost-WHITE for exactly as long as the beam is on them
    (_beamWhiteT re-armed per tick, fast ramp both ways) while tick
    flinches shake them; colors thaw right back after. Frozen-solid
    white-out retained only for the absolute-zero ult. Verified whites
    over the beam: [1,1,1,1,1,1,1,0.4,0,0].
  · FENRIR SPRINT: rotary-gallop rebuild — fronts EXACTLY half a cycle
    against the hinds (the old ~115° lead read as limping), slight rotary
    lag inside each pair, longer stride (0.85× cadence), frame ridden low
    with a near-constant back angle (subtle arch/heave only), fronts
    stretch arrow-straight on the reach and fold tight on recovery, hinds
    sweep hugely with knees gathering under the chest and an ankle snap.
  Verified: 16-mech attackmatrix ALL CONNECT (saurion special 107 with the
  on-top-only latch), ace soak clean (saurion/cranky/fenrir), probe
  numerics + screenshots (yaw-hold hose with low arms, clamp launch,
  saurion perched on aegis at y 3.8 pecking, beam-white timeline, four
  gallop phases with a level back).
- 2026-07-12: Jerry's fleas hop 2x higher — ground-hop launch vy 10-16 →
  14-23 (peak height doubles; velocity scales by √2, not 2, since
  h = v²/2g). Verified: attackmatrix ALL CONNECT (jerry ranged 34 /
  special 26-41 — attach reliability held despite the longer, floatier
  arcs; titanus ranged flake passed on rerun at 114).
- 2026-07-12: SHOULDER SOCKETS — several designs (Glacier among them) had
  chest geometry narrower than the rig's shoulder joint offset, leaving
  the arms floating free of the body. buildMech now bridges EVERY mech's
  shoulder joints to the torso automatically: a tapered axle from inside
  the chest out to the joint, a dark collar ring, and a fixed socket ball
  at the pivot the arm visibly rotates in (all scaled by mech scale/bulk,
  added after the design assembles so it works for all 16 without touching
  design files). Verified: glacier close-up (gap gone), full 16-mech
  showcase lineup (no protruding stubs — jerry's is hidden inside his
  carapace), slim-frame wraith close-up, build green, no page errors.
- 2026-07-12: ARENA HAZARDS + GEYSER BLOWOUT.
  · SPIKE HAZARDS: obsidian spike clusters (volcano) now CUT — any bot
    walking into a cluster takes 14 contact damage and gets SHOVED hard
    back out (knock 20 + outward velocity + brief launch, 0.8s per-bot
    re-hit cooldown, sparks + slash). Generic registry: props tag
    userData.spikes, arena.updateHazards ticks them.
  · CAMPFIRES: new stone-ring campfire prop (crossed logs, ember bed,
    small flame) placed in ruins/jungle/frozen (3 each). ATTACKING one —
    melee or any blast (hook in arena.damageSphere) — flares it into a
    7s burning ground patch (13 dps) with a flare-up fountain + ring +
    flame sfx; it can be re-lit after burning out. Verified: one punch
    lit it, a bot walking through burned for 66.
  · CRANKY GEYSER: radius DOUBLED 5.5 → 11, and the eruption now opens
    with a brief HUGE fountain — 60 tall fast jets (vy 24-40) across the
    whole area on top of the existing column pulses (beam column width
    capped so it stays a column). Verified: victim 9 units off the aim
    line still launched.
  Verified: 16-mech attackmatrix ALL CONNECT, volcano ace soak clean
  (spike hazards live), probe numerics (spike dmg 12 + shove to 6.9u at
  23 u/s; campfire lit + patch + walk-through burn; off-axis geyser
  launch), screenshots viewed (geyser blowout column, lit campfire).
- 2026-07-12: SHOULDER AXLES v2 + COLOSSUS SKYLINE TOSS + GRAB FEEL.
  · SHOULDER CONNECTORS FIXED FOR REAL: six designs push their shoulder
    joints wider than the rig default (glacier +0.55s — why his arms still
    floated; also rhino/inferno/colossus/aegis/fenrir, cranky moves y/z).
    The factory axle now reads each joint's ACTUAL post-design position
    and bridges it to the torso with a DARK cylindrical axle + collar +
    socket ball. Verified: glacier close-up + mid-walk-swing shot, gap
    closed on both.
  · COLOSSUS SPECIAL → SKYLINE TOSS (grab & throw): replaces Fire Mission.
    He seizes a bot in his front cone (4.5·scale reach), hoists them
    OVERHEAD — laid flat ACROSS the press on their side, wrestling
    body-slam style (rolled -1.45 rad, perpendicular to his facing, new
    grabReach/liftHold/throwHeave clips) — then HURLS them far (36 u/s
    held through flight against air drag; ~23 units open-field, or a
    satisfying wall smack). 85 dmg split grab/throw; cargo has i-frames
    mid-lift; the slam roll unwinds on landing/interrupt. Whiff = short
    recovery. AI gates it at melee range (SELF_AOE set).
  · WALL GRAB v2: grabbing no longer snaps position or facing — the mech
    freezes EXACTLY where and how the punch connected (fist may intersect
    the wall: that's the grip). Releasing grants a 0.35s coyote window
    where a mid-air jump still fires — so climbing flows as jump, grab,
    release, jump, grab. Verified: grab with yaw unchanged, release,
    air-jump, re-grab 2.7 units higher.
  Verified: 16-mech attackmatrix ALL CONNECT (colossus special 71 via the
  grab; titanus-ranged/jerry-special known flakes passed on rerun), ace
  soak clean (colossus/glacier), probe numerics + screenshots (dark axle
  bridging glacier's pauldrons at rest and mid-walk, viper carried flat
  overhead, roll 0 after landing).
- 2026-07-12: NOVA HALO FIXED + TITANUS SLAM KIT + SMOOTH CARRY.
  · NOVA HALO GLOW, ACTUALLY VISIBLE: the pulse was firing but the only
    halo geometry in the pulsing bucket was four TINY tip gems — the
    crescent bodies were plain white/teal, so the "glow" read as nothing.
    The crescent inlay arcs are now glowSoft strips (the ring itself
    surges), tip gems doubled in size, and the pulse curve hardened to
    0.35 + 3.6·g² (near-dark trough 0.36 → blazing 3.7+ at apex). Power
    now rides dmgMult so ALL her attacks (melee, plasma, starfall) hit
    +35% at full alignment; plasma/starfall orbs also swell in size.
    Verified: apex screenshot (both crescents aligned at the top, blazing
    magenta) vs trough (dim strips), intensity 0.36 → 3.72.
  · TITANUS: special B is now SKYLINE SLAM (the same grab → overhead
    body-slam carry → far throw as Colossus, 88 dmg), and RT became his
    old Seismic Slam ground pound (52 dmg, radius 9, knock 18, 1.6s cd,
    NO ammo — it's a quake, not a projectile; AI brawls at range 4).
    Side effect: the flaky titanus-ranged matrix case (rocket) is gone.
  · SMOOTH CARRY: the lift jiggle came from 0.05s schedule-tick pinning —
    gravity sagged the victim between ticks and each tick snapped them
    back. Victims now carry a per-frame _carry state handled in their own
    update: smoothstep hoist from the grab point up to overhead (~0.24s,
    no teleport pop), per-frame pin + roll-flat blend, auto-release on
    carrier death/state break. Verified y-trace over the lift: monotonic
    0 → 8.1 with ZERO downward dips.
  Verified: 16-mech attackmatrix ALL CONNECT (titanus ranged 30 pound /
  special 74 slam; nova special 88 with swollen orbs), ace soak clean
  (titanus/nova), screenshots viewed (blazing vs dim halo, titanus press).
- 2026-07-12: CINEMATIC KO FINISHERS (~7s) + enable_finishers config.
  · When a round is won by a KILL (never on timeout), the winner and the
    corpse become cinePuppets and a per-mech execution plays on a
    locked-off cinematic camera before the normal round-end flow resumes
    (match state 'finisher'; K.O. sting up front, no double slow-mo).
  · Finisher system (src/game/finisher.js): tiny timeline — at() one-shot
    beats, hold() per-frame spans (approach glides, carries, topples,
    camera orbits; later holds win). Camera shots orbit the action center
    and every distance scales with the combatants' stature. Shared beats:
    approach stride, spark/shake/hit-stop hits, victim flinch/knockdown,
    finale burst, hero-pose triumph shot.
  · 16 bespoke scenes. Highlights: COLOSSUS/TITANUS hoist the corpse
    overhead, hurl it down and quake it flat under three slams before
    reaching to the sky; SAURION leaps onto the face, rides them down
    under a 7-bite frenzy, springs off, looks around and grooms; GLACIER
    freeze-whites them and shatters the statue; RHINO gallops straight
    through; WRAITH uncloaks behind them for a railgun execution as bats
    spiral out; NOVA drops three stars under a blazing pinned halo; VIPER
    blink-flurries all four sides; TEMPEST pins them under his storm;
    FENRIR mauls and howls; CRANKY triple-clamps then geysers the wreck
    skyward; INFERNO immolates; VULCAN shreds point-blank; AEGIS bashes
    then calls the judgment pillar; FROGGER gunk-barrage + squash-hop;
    JERRY empties the flea nest onto the corpse.
  · CONFIG.enable_finishers (src/core/config.js), URL ?finishers=0 off.
  · PREVIEW MODE: ?finisherdemo=1 (alias ?debug=finisher) on the battle
    harness loops P1 executing P2 forever — pick robot/enemy/arena via
    the usual p1/p2/battle params. The dev harness also fires real
    finishers on last-kill KOs.
  · Engine capture mode for tooling: engine.paused + engine.step(dt)
    steps the sim deterministically while RAF keeps presenting.
  Verified: 16-mech attackmatrix ALL CONNECT, ace soak clean WITH the
  finisher firing on the KO, colossus/saurion demo frame reviews (lift +
  slam beats, saurion riding the fallen mech mid-bite), per-mech videos
  captured via tools stepping (delivered separately).

45. FINISHER ITERATION V2 — contact-true, wilder, choosable ✅
  · Every hit now LANDS and every big hit BASHES the corpse around:
    new Finisher.vicBash (bounce arc + slide + spin) and trackCenter
    (camera glued to wherever the body ends up).
  · TITANUS/COLOSSUS chase the wreck between quake-pounds (winner
    re-squares to 2.0×scale from the LIVE body each frame — probe shows
    exact smash range at all 3 impacts) and each pound punts it away.
  · SAURION crouches low: special perch dropped to 0.32×height, deeper
    biteLatch crouch, and the finisher ride ends glued to the fallen
    chest at ~1.1u (was floating at 1.5+ above).
  · JERRY: THE PLAGUE — 10 thrown + ~150 cling fleas in ten waves
    blanket the victim (FleaSystem clingTo/clingT cosmetic latch mode,
    tolerates corpses), thrashing until they collapse under the swarm.
  · WRAITH: soul off the chain — baked additive spectre (makeSpectre/
    dropSpectre) rakes THROUGH the victim 4× back and forth on a side
    profile cam, then re-forms and rails the wreck.
  · Dialed up the rest: viper 5-blink cage + air-tracking cam, vulcan
    walking shred-back, aegis pillar launch + crash, nova stars bash 3
    directions, rhino wide banking turn + SECOND trample, tempest 5
    jolting bolts, fenrir circular corpse-drag + fling, glacier statue
    skitters away shedding ice, cranky tracking clamps + 14u geyser
    launch, frogger true pancake squash (scale restore in end()).
  · Body-slam bug: fighter separation now skips _carry/cinePuppet pairs
    (carrier was shoved backwards through the whole lift).
  · NOVA halo glows on BOTH faces (back inlay torus) so the owner sees
    the alignment pulse from behind.
  · ?debug=finisher now routes to the demo (main.js) + WIN/VIC/MAP
    dropdown chooser reloads straight into any configuration.
  Verified: build green; paused-engine probes (colossus smash range =
  2×scale ×3, saurion rideY 1.1, jerry 157 fleas/147 attached, wraith
  spectre 0→11→0→11→0, rhino double-trample trace, frogger squash
  0.42→1.0); 16-mech attackmatrix ALL CONNECT (jerry flake rerun ✓);
  ace soak crash-free; chooser UI screenshot reviewed. Follow-up from
  frame review: chasing winners could block the fixed-azimuth shots, so
  smash/walk-down/drag phases now use camAction — a smoothed camera that
  rides perpendicular to the LIVE winner↔victim line (framing A/B'd on
  the titanus smash phase). Scenes are reviewed in-browser via
  ?debug=finisher (no video pass).

46. FINISHER DEMO CHOOSER CLICKS + HANDS-TRUE BODY SLAM CARRY ✅
  · #ui-root has pointer-events:none — the ?debug=finisher WIN/VIC/MAP
    dropdowns opted back in with pointer-events:auto (clicks now work,
    each change reloads straight into that configuration).
  · The lifted bot now rests IN the thrower's hands, everywhere: new
    Fighter.palmsMid (world midpoint of the handL/handR joints, works for
    procedural + GLB rigs, overhead fallback) and Fighter.carryPoint
    (subtracts the victim's feet→torso offset through their CURRENT
    rotation so the torso rides the palms exactly at any roll angle).
    Wired into the per-frame _carry pin (main-game grab-throw for
    Titanus/Colossus), the throw release (launches straight out of the
    palms), and the finisher lift + heave holds (which also now blend
    from the victim's real position instead of snapping).
  Verified: probes show torso→palms distance 0.29 at the top of the
  finisher hoist and 0.11 mid-carry in the live special (was ~5 — the
  old fixed "head-height + 0.6" float), throw velocity intact; chooser
  click probe reloads with the picked mech; 16-mech attackmatrix ALL
  CONNECT (jerry flake rerun ✓); colossus ace soak crash-free; lift
  frame reviewed.

47. HANDS-TRUE CARRY, GROUNDED CORPSES, AIMED HARDWARE, FX OVERHAUL ✅
  · Lift-and-throw: victim grips into the hands in ~0.15s then RIDES the
    liftHold arm swing (constant contact); clampPalmsTo IK servo narrows
    the palms to exactly the body's width (probe: sep 2.05 = want, torso
    0.3 from palm mid through the whole hoist). Throw launches out of the
    palms. Same path drives the game special and the finisher.
  · Floating corpses fixed: finisher holds get a guaranteed k=1 closing
    tick + end() ground clamps (all 8 probed mechs rest at y=0).
  · levelHands wrist counter-pitch: vulcan gatling pods, inferno torch
    bells and cranky pincers now track the arm's aim (stretch along the
    arm when fully raised) instead of pitching skyward.
  · Rhino charges BIPEDAL: heavy forward lean, pumping tucked arms.
  · Finisher reworks: AEGIS reaches to the heavens -> 10 spears of light;
    NOVA ring spin-up -> apex ignition -> 9 lances converging from every
    compass direction; WRAITH hurls the ghost FORWARD, blinks to the far
    side, wheels round and hurls it back (4 passes, spectre re-baked per
    launch); TEMPEST boxes the victim in with dark clouds above/behind/
    left/right and 7 bolts rake in from every direction; FENRIR's
    flurry now lands on a STANDING victim who only drops at its end.
  · Camera pass: establishing shot moved to a front-side quarter, titanus
    lift shot is now a FRONT hero angle (victim in the hands, not back
    armor), saurion bite cam low front, aegis skyward reach front-low,
    jerry side shots — no script films square through the winner's back.
  · FX overhaul: ParticlePool color ramps (color2) + a normally-blended
    `drops` pool for LIQUIDS. Fire is layered now (white core -> orange
    tongues -> deep red + embers + rising black smoke) for inferno's
    thrower, fire patches, explosions. Cranky's hose/geyser pour real
    WATER (heavy blue-ramp droplets + foam + mist + splash-on-hit).
    Frogger's gunk is thick green GOOP (sagging drips off the bolt,
    splatter + ooze + splat rings). Lightning is THICK now — segmented
    glowing bolts with a white core and a forked branch — and every bolt
    leaves staticCling crackle arcing over the victim while the charge
    bleeds off (zap ranged, storm special, ult strikes, finisher).
  Verified: build green; close-range FX stills reviewed (fire wash, water
  column, slime splatter, thick forked bolt, cloud-ring strike); fenrir
  standing-flurry + titanus front lift frames reviewed; 16-mech
  attackmatrix ALL CONNECT; tempest-vs-cranky ace soak crash-free.

48. FINISHER FEEDBACK ROUND: SPACING, SWARM, NECK BITES, SIDEWAYS SLAM ✅
  · FENRIR plants at claw's reach (2.8u) with the victim standing IN
    FRONT catching the end of every swipe (was overlapping them); the
    drag circle re-phased so the grab point matches where the bodies are.
  · JERRY now SHOOTS 100 fleas (ten alternating-cannon bursts of ten,
    lobbed arcs raining over/around/onto the mark) and the swarm does the
    rest on its own: fleas.spawn speed option, hop/latch treat cinePuppet
    corpses as prey. Probe: 92/100 latched before the collapse.
  · Attached fleas FOLLOW the victim down: cling points ride the full
    group rotation (quaternion) AND detect knockdown/dead poses, sliding
    down + along the now-horizontal body (carpet maxY 5.2 -> 2.4 after
    the fall). Matches gameplay behavior everywhere.
  · SAURION bites the NECK: finisher rides with jaws locked at the
    collar — the neck stays pinned at stage center and the body swings
    flat beneath it (probe: 0.00 horizontal drift from the throat);
    bite sparks fly from the collar. Game special perch is now
    height*0.8 - his own reach, clamped to [0.22, 0.62]*prey height —
    bites land at the neck without contortion on any prey size.
  · BODY SLAM is truly sideways at ANY facing: the roll moved to the
    Z-axis under the carrier's yaw (Euler XYZ made an X-roll lie along a
    fixed WORLD axis), so the victim lies head-off-one-palm,
    legs-off-the-other (probe: body axis 0.00 along facing, 0.99 along
    the hand line). Applies to the game special and the finisher; all
    unwind paths reset the new axis.
  Verified: build green; numeric probes above; fenrir flurry gap 2.8
  constant; titanus sideways-lift still reviewed; 16-mech attackmatrix
  ALL CONNECT; colossus-vs-saurion ace soak (slam + perch under AI)
  crash-free.

49. LUSCIOUS ELEMENTAL FX: FLIPBOOKS, ATLASES, SPRITE INTAKE ✅
  · Particle engine upgraded: texture ATLASES with per-particle rotation
    + spin, alpha fade-in curves (no more popping), color ramps — the
    "fading circle" era is over. All CPU-simmed, one draw call per pool.
  · FIRE is a 16-frame LOOPING turbulence flipbook (each flame licks
    through the loop as it rises/cools white->orange->deep red) baked
    from fractal value noise; explosions roll flipbook fireballs.
  · SMOKE is a 2x2 atlas of distinct billowy fractal puffs that tumble
    (spin) and fade in — soot, dust, mist, steam all tinted variants.
  · WATER droplets have a baked specular glint + darker belly (wet bead
    look), spinning as they arc; foam flecks + fine mist ride along.
  · SLIME is a 2x2 atlas of lumpy noise-warped glossy blobs with
    satellite drips — projectile trails, splats and the finisher all use
    the goop pool now.
  · ICE: crystalline six-armed sparkles for glacier's beam + frost vapor.
  · Optional sprite intake: drop PNGs + public/sprites/manifest.json to
    override any slot (fire/smoke/droplet/goop/ice/spark/glow), with
    atlas dims and CHROMAKEY intake — "luma" (alpha from brightness, for
    additive sprites on black) or "#rrggbb" keying with soft tolerance
    and despill. Missing/broken manifest = procedural look stays.
    docs/SPRITES.md has the manifest format + image-generator prompts.
  Verified: build green; stills reviewed (fireball wash + pilot flames,
  water beads with glints in the geyser column, lumpy slime globs);
  16-mech attackmatrix ALL CONNECT; inferno-vs-frogger ace soak
  (fire + goop under AI combat) crash-free.

50. SPRITE PACK VERIFIED LIVE + SOFT HITS (NO CHIP STUN-LOCK) ✅
  · The five committed sprites (fire flipbook, smoke puffs, droplet,
    slime blobs, ice sparkle) all load through the chromakey intake:
    every slot reports ok, pool textures swap to the 1254px images with
    correct atlas grids, and in-game stills show real flame tongues,
    glossy water beads in the geyser, lumpy slime splats. The loader now
    records per-slot outcomes in effects.spriteStatus for debugging.
    (On software renderers the async load can take ~20s/sprite; on real
    GPUs it's sub-second.)
  · SOFT HITS: rapid-tick weapons (flame cone, cryo beam, gatling
    bullets, hose stream, ground-fire patches) no longer apply hitstun.
    The body still rocks under fire and knockback still shoves, but the
    target KEEPS CONTROL and can break away instead of standing there
    eating the whole magazine. Probe: 20 flame-cadence ticks leave the
    victim in 'normal' state and they covered 15.3u while under fire;
    a regular punch still stuns.
  Verified: build green; sprite status + texture-swap probe; element
  stills reviewed; soft/hard state probe; 16-mech attackmatrix ALL
  CONNECT; vulcan-vs-inferno ace soak (both soft weapons) crash-free.

51. DESTRUCTIBLE PROPS, THROWN-BOT WRECKAGE + SUBSTANCE JETS ✅
  · Arena props (lamps, signs, crates, ...) now have measured cylinder
    colliders + hp and DESTROY into rubble blocks, dust and sparks, with
    the break mirrored across all 8 toroidal ghost copies. Fighters
    collide with them; punches, projectiles and damage spheres break
    them (explosive tanks still detonate through their own path).
  · Body-slam throws wreck what they hit: a launched bot projects its
    damage sphere ahead of its flight path, cracks buildings AND props,
    and takes up to 85 impact damage itself (soft hit, 0.6s cooldown).
  · SUBSTANCE REDESIGN: Cranky's hose and Inferno's flamethrower are now
    continuous tube-mesh JETS — a 16-ring tube rebuilt along a ballistic
    arc each tick, skinned with scrolling 2-layer fractal noise — with
    droplet spray / fire tongues riding the stream. Frogger fires 3-glob
    slime bursts (lumpy noise-displaced icosahedra) that splat ground
    PUDDLES and stick dripping BLOTCHES onto victims. Water splash foam
    dimmed + point sprites size-capped: the bloom white-out is gone.
  · HEAVY STRIKE AIM: during the strike descent (fists below shoulders)
    the torso yaw-servos the palms' azimuth onto the victim (cap ±0.6
    rad) and the palm clamp narrows the fists to body width, so a landed
    pound visibly lands on the body instead of straddling it. Probe:
    impact-frame fist-to-victim distance improves in every scenario
    (e.g. colossus right fist 3.17 → 2.39) and never regresses.
  Verified: build green; prop collide/break + ghost-mirror probe; throw
  crash probe (2 chunks broken, 40 self-damage); stream/glob/pound
  stills reviewed; clean-victim convergence matrix (stale-intent probe
  bug found + fixed in the harness).

52. LEVEL DESIGN PASS: TERRAIN LAYER FOR ALL 12 ARENAS ✅
  · New src/arena/terrain.js, driven by theme.layout data in themes.js:
    every arena now has painted ground LANES (roads, lava rivers, water
    channels, oil slicks, crystal veins, ice rivers, dry riverbeds, deck
    traffic stripes) baked into a cell-periodic overlay texture. Lane
    centerlines are at + amp*sin(TAU*along/P) — periodic in the wrap
    cell by construction, so every lane that exits one arena edge
    re-enters exactly opposite (the tiling contract holds).
  · HAZARD LANES are live gameplay: lava ticks burn damage + embers
    (probe: 17.5 dmg standing in the flow), water/oil bog movement down
    with splash/smoke FX.
  · HILLS: walkable truncated-cone mounds (snow drifts, dunes, slag,
    mining terraces; octagonal glow-edged deck pads on skyterrace/
    orbital). The collision surface IS the visual cone — mechs walk up
    and down smoothly (probe: fighter stands at exactly hill height and
    rides the slope) and props placed on a hillside get their Y lifted
    to the surface so nothing floats.
  · BRIDGES: destructible causeways spanning the streams (basalt over
    lava, skywalks, mossy stone) — full-height segmented blocks with
    ramped ends, ghost-cloned across the seam. Blow segments out and
    fighters fall through the gap (probe: explosion kills segments,
    <45% left collapses the rest, fighter dropped from deck to ground);
    rubble spawns via the destructible system.
  · BUILDING CLUSTERS: city blocks / factory compounds / camps placed on
    an axis-aligned mini-grid per cluster (one landmark tower each) with
    the road grid running between them, plus scattered solo cover. All
    sites avoid lanes, hills, bridges and the spawn plaza.
  · SPAWN CLEARING: a guaranteed building-free plaza (r=38) around the
    origin — fighters always spawn on a painted ring marking with clear
    sight lines to each other. Ammo crates avoid lava/bridges and bob at
    terrain height.
  Verified: build green; screenshots of uptown/neon/volcano/quarry/
  harbor/foundry/orbital reviewed (roads+plaza rings+clusters+lava
  causeways all read correctly); physics probe on hills/bridges/lava;
  ace soaks crash-free on volcano, neon, jungle, frozen, skyterrace,
  scrapyard, ruins.

53. SIGNATURE MELEE IDENTITIES + FINISHER POLISH ✅
  · VIPER fights with SWORDS now: new blade-led combo clips (horizontal
    cross-cut, rising reverse cut, lunging skewer) and a kesa-giri heavy —
    the elbow stays near-straight so the forearm energy daggers LEAD every
    move, with green glow trails riding the blade tips through each swing.
    The finisher's blink cage cycles the sword forms and ends on the
    kesa-giri launcher instead of the generic punch clips.
  · AEGIS fights spear-and-board: light combo stabs the lance from BEHIND a
    raised shield guard (the shield arm never punches), and the heavy
    plants the shield, sweeps the spear to full vertical — and a summoned
    PILLAR OF LIGHT hammers down on the strike point (beam + ring + light
    motes; the melee sphere still carries the damage).
  · TITANUS + COLOSSUS haymakers: new bigPunch clips wind the fist ALL the
    way back with a full-body coil before letting loose (slower cadence),
    and their punch knockback roughly TRIPLED (jabs 15-18, heavies 36-38)
    so a landed punch sends people across the block — no other mech's
    fists move fighters like that.
  · NOVA glow overhaul: halo emissive range amped (glowSoft 0.25→6.75,
    whole glow kit + halo scale swell with apex), star-motes orbit the
    staff apex sized by ring brightness, halo sheds sparks at full burn,
    apex plasma shots detonate off the staff tip with a flash that scales
    with power — and apex attacks now hit 2X (dmgMult 1+1.0·novaGlow,
    was 1+0.35).
  · FROGGER finisher: the gunk barrage (8 splats walking up the body) now
    STICKS blotches per hit, then a final coat mummifies the victim
    head-to-toe (slimeCoat: torso/head/arms/legs) standing in their own
    puddle — THEN the stomp. effects.blotchOn generalized (any joint,
    size/life/height band).
  Verified: build green; showcase stills of viperSlash1/viperStab (blade-
  led ✓), aegisStab1/aegisSummon (spear visible, shield guard ✓),
  bigPunch1 wind-up, nova halo blaze; finisher probe (frogger: 34 blotches
  visible pre-stomp, viper/aegis: no missing clips, all complete); ace
  soaks crash-free: viper-aegis, titanus-colossus, nova-frogger.

54. GAMEPAD CONTROL REMAP: CHARGE-DASH, TARGET LOCK, BUMPER/TRIGGER SWAP ✅
  · PAD B → CROUCH & CHARGED DASH: hold to crouch and root in place while
    a dash charge winds up (3s cap, ring pulses tighten as it builds, white
    flash at full wind); release with a direction held to dash that way —
    speed scales to 1.95x, dash duration and i-frames scale too (probe:
    56.7 base / 77.6 half-charge / 102.6 full) — release with no direction
    simply cancels back to standing. RB's old instant dash is gone from
    pads (keyboard SHIFT dash unchanged).
  · PAD LB → TARGET LOCK (replaces strafe-lock): while held the mech
    acquires the nearest enemy, squares up and STAYS squared (sideways
    movement becomes a natural strafe), a color-coded reticle pulses under
    the target, and the camera — combined solo orbit AND per-player split
    chase cams — swings behind the player to keep the target dead ahead
    (right stick still overrides in split). Aim follows for free since
    shots fire along facing.
  · RB → ranged attack, RT → special (B's old job), LT stays block.
  · Docs updated: README controls table + new B/LB explainer paragraphs,
    pause-menu CONTROLS legend rewritten (per-button pad lines).
  Verified: build green; fighter-level probe (crouch roots at duckT 1.0,
  vel 0; charge caps at 3.0; scaled release speeds; cancel returns to
  normal/standing; lock faces the enemy with 0.00 yaw error, acquires and
  releases cleanly); ace soak crash-free.

55. SIGNATURE HEAVIES FOR SIX MECHS + THROWN WEAPONS + SUBSTANCE FIXES ✅
  · Six mechs traded the generic pound for a signature Y-attack, powered by
    a new per-mech heavy kit in fighter.js: heavySpin (post-pose joint
    whirl that winds down onto whole turns), heavyDrive (forward flight /
    leaps during a clip window), heavyFlare (scaling a design group), and
    heavyFx ('fx'/'hit' event hooks for charge beats and impact bursts):
    - AEGIS: spear raised overhead and SPUN like a rotor blade (hand joint
      whirls at 30 rad/s), then a full-body lunge drives it home.
    - VIPER: ninja coil, then a flat corkscrew DRILL flight — body
      horizontal, both blades speared forward, barrel-rolling (hips spin)
      while heavyDrive flies her ~12u through the target.
    - NOVA: reaches skyward, a shaft of starlight strikes the staff
      (fx beat), then she hammers it down — area burst + groundShockwave
      around the impact, all scaled by her halo glow.
    - TEMPEST: arms fling wide and the frame spins up into a tornado
      (two hit beats, dmg re-split 74→42/beat) with cyan debris + dust
      spiraling around the vortex (heavyAura).
    - FENRIR: the whole spiked mane — now on its own 'mane' joint — FLARES
      2.4x like a porcupine and he leaps (heavyDrive up 8), ramming the
      bladed ruff through the target.
    - WRAITH: the tattered cloak — now on a 'cloak' joint with six wingtip
      anchors — spreads into a wing-wall 2.6x wide/1.9x tall and every
      wingtip fires a red laser converging on the mark.
  · THROWN WEAPONS: Viper's ranged is now Fang Throw (a sword tumbling
    end-over-end — new 'blade' projectile) and Aegis' is Dawn Javelin (the
    lance hurled point-first — new 'spear' projectile). Both weapons
    (lance refactored onto its own 'lance' joint) vanish from the grip and
    RE-FORGE over half a second with a glow shimmer (regrowWeapon).
  · FROGGER's Quad Gunk Barrage now lobs lumpy slime GLOBS (goop-flagged,
    count 8→11) that splat puddles and stick blotches like the ranged
    version — probe: 11 puddles on the ground after one barrage.
  · CRANKY's geyser erupts as an actual WATER column: the additive light
    beam is gone, replaced by the coherent jet-tube substance system
    (16 refresh ticks, churning surface) over the existing droplet
    fountain — probe: 1 live water jet, 0 light beams.
  Verified: build green; showcase stills (aegis raise, nova sky-reach,
  viper coil, tempest spread); battle probes (mane 2.37x mid-leap, cloak
  2.59x spread, drill spin 6.5rad + 4.3u flight, whirl 9rad, ALL heavies
  land: 99/53/93/66/86/91 dmg; blade+spear projectiles + regrow 0→1.0;
  geyser jet live) — ace soaks crash-free on all four matchups.

56. FULLSCREEN FINISHER CINEMATICS + REAL BOT PORTRAIT ICONS ✅
  · Finishers now take the WHOLE SCREEN: when a KO cinematic starts during
    a split-screen match, the viewports (and divider) drop away for one
    fullscreen cinematic view — rendered through the post-FX composer —
    and the split restores itself the frame the finisher ends. Verified
    with forcesplit: pre-KO frame is true split (draws:355, divider),
    mid-finisher frame is one fullscreen close-up (draws:1, no divider).
  · The emoji placeholder icons (👊🔫⚡...) are replaced everywhere by real
    rendered BOT PORTRAITS: tools/thumbs.mjs captures a head-and-torso
    square of each of the 16 mechs from the showcase camera into
    public/thumbs/<id>.png, and src/ui/icons.js inlines them (rounded,
    rim-lit, emoji fallback via onerror) across the roster grid, player
    cards, mech info card, results champion banner and battle HUD plates.
  · docs/ICON_PROMPTS.md: a master style prompt + 16 per-character prompt
    lines (with roster palette hexes) for generating flat badge icons with
    an image generator, as a hand-authored alternative to the renders —
    drop-in replacements for the same thumbs/<id>.png files.
  Verified: build green; mech-select screenshot shows all 16 portrait
  tiles; finisher split/fullscreen frames reviewed; ace soak crash-free.

57. GENERATED FACTION BADGES INTEGRATED AS THE ROSTER ICONS ✅
  · The AI-generated 4x4 badge sheet (from docs/ICON_PROMPTS.md) is sliced
    into public/thumbs/<id>.png and now serves as every mech's icon —
    seismic fist, gatling flash, dawn shield, crossed fangs, halo star,
    charging horn, lightning tornado, claw-torn moon, artillery rook, eye
    in crosshair, grinning flame, shard snowflake, pincer geyser, sickle
    claw, slime splat, shrimp swarm — replacing the rendered portraits.
  · New tools/slicebadges.mjs: slices any future badge sheet via Chromium
    canvas (no native image deps), auto-detecting each tile's glowing rim
    bounding box so uneven sheet margins can't drift the crops, and writes
    256px PNGs in roster order.
  Verified: mech-select screenshot shows all 16 badges crisp in the grid,
  info card, and player bar.

58. SAURION: TRUE VELOCIRAPTOR STANCE & GAIT ✅
  · Rest pose rebuilt to the Jurassic Park read: legs SET APART and
    staggered (lead leg deeper-coiled), shoulders DROPPED with forearms
    half-raised in front and wrists curled so the claws hang ready, spine
    pitched over the digitigrade crouch with the head craned up alert.
  · Idle: coiled-and-alert overlay — weight rocks between the staggered
    feet, claws flex, and the head ticks in sharp scanning snaps instead
    of the generic humanoid sway.
  · Run: raptor carriage in the animator — body levels and stretches with
    the head spearing forward eyes-level, the arms LEAVE the humanoid
    counter-swing for the classic tucked half-raised carry (small gallop
    bob), and the stride lengthens with extra knee drive. Extra pitch kept
    small: rest 27° + locomotion lean already stack.
  Verified: idle + two run-phase stills reviewed (alert stagger stance,
  stretched run with tucked claws); saurion-vs-fenrir ace soak crash-free.

59. SIGNATURE COMBAT STANCES: EVERY MECH READY TO BATTLE BY DEFAULT ✅
  · New combat-ready layer in the animator: every mech carries a
    def.combatPose (additive deltas over restPose) matched to its martial
    style, and WEARS IT BY DEFAULT — titanus/colossus heavyweight boxing
    guards, aegis shield-up spear-chambered, glacier's double forearm
    wall, viper's low ninja crouch (lead blade out, rear chambered),
    tempest's fencer point, nova's staff guard, vulcan's guns-low ready,
    rhino's linebacker set, fenrir's wolf pounce-set, wraith's side-on
    skulk, inferno's leveled torches, cranky's raised-claw crab threat,
    saurion's deepened raptor coil (rest legs also spread wider — the old
    stagger was too subtle), frogger/jerry spring-loaded coils.
  · Behavior: the stance is the default carriage; only after 5s of
    standing genuinely still does the frame ease into the plain rest
    stance (probe: readyK 1.0 at 1s still, 0.01 at 7s, back to 0.77
    within 0.7s of moving). At running speed the stance yields to the
    gait (arms belong to the run), and it softens airborne.
  · Selector previews, the title lineup and the showcase pass alwaysReady
    so mechs pose combat-ready there permanently.
  Verified: six stance stills reviewed (titanus guard, viper blades,
  aegis shield, tempest point, fenrir crouch, saurion raptor); battle
  probe of the 5s relax cycle; ace soak crash-free.

60. STANCE REVERTS, MOVING CHARGE-DASH, DROP SHADOWS, ATTACK WIND-UPS ✅
  · Combat stances REVERTED to plain neutral for aegis, colossus, titanus,
    vulcan, nova and glacier (combatPose removed); the other ten keep
    their signature ready stances + 5s relax behavior.
  · PAD B charge-dash now works ON THE MOVE: holding B no longer roots the
    mech — standing still crouches and winds the coil at full rate, moving
    keeps full run speed but winds at 0.35x (probe: 7.8u covered in the
    first second of a moving charge, 0.35 charge vs 1.0/s standing;
    release still dashes/cancels as before). README + pause legend updated.
  · DROP SHADOWS: every fighter carries a soft dark disc pinned to the
    ground directly below them (terrain-aware — hills/bridge decks),
    shrinking slightly and DARKENING airborne so it reads as the landing
    marker for flights (probe: shadow sits at ground through a 3.6u jump,
    opacity 0.24 grounded / 0.34 airborne).
  · WIND-UPS: light1/light2 (shared jab & cross), viperSlash1/2 and
    aegisStab1/2 now start from rest and PULL BACK through an explicit
    chamber key before the strike (hit lands ~0.1s later per swing) —
    every physical hit in the game now telegraphs before it lands
    (heavies, uppercut, claw snap and haymakers already did).
  Verified: build green; titanus-neutral + mid-chamber stills reviewed;
  behavior probe (moving charge, crouch rates, dash release, shadow
  tracking); ace soak crash-free.

61. SHADOW-DOT REMOVAL, TEMPEST BUFFS, AEGIS SWING FORMS + HOLD-CHARGE WHIRL ✅
  · The drop-shadow disc is REMOVED (it read as a black dot); renderer
    shadows carry placement again.
  · TEMPEST: Static Overload storms now drop well AHEAD of him (0.95r,
    was 0.55r) and every bolt ELECTRIFIES — 0.85s servo-lock stun + jolt
    shudder + longer static crackle on top of the slow. The tornado heavy
    now TRAVELS (drive 9→18, probe: 9.8u covered while spinning), and its
    beats knock down like other heavies (knock 16, launch 9 — probe:
    victim launched, both beats connected for 88).
  · AEGIS melee re-authored as SWINGS: flat right-to-left sweep and a
    high overhead chop (arcs, not spear-in-fist punches), pierce kept as
    the lunging combo ender — and the shield arm NEVER lifts: one steady
    low-front guard pose in every clip, plus the animator's face-forward
    shield brace now applies through all aegis attack forms, not just
    blocking.
  · AEGIS heavy is HOLD-TO-CHARGE: the overhead rotor-whirl loops while Y
    is held, banking power to a 2.4s cap (ring pulses tighten, white
    flash at full), and releasing Y fires the lunge with the banked
    power — dmg 0.8x..1.6x, knock up to 1.9x, drive speed boosted (probe:
    tap 67 dmg vs full hold 172). New intent.heavyHeld on all devices.
  Verified: build green; swing + whirl-hold stills (shield square in
  front in both); probes above; aegis-vs-tempest ace soak crash-free.

62. AI DIFFICULTY TONE-DOWN + HOLD-A FINISHER SKIP ✅
  · Diagnosed WHY the AI felt unbeatable — three compounding edges:
    (1) block/dodge probabilities were rolled PER FRAME (veteran's 0.38
    at 60fps ≈ blocks/dodges nearly every attack), (2) the AI aim snap
    in faceNearestEnemyIfClose was pixel-perfect every frame, and
    (3) attack/fire intents were issued EVERY FRAME, so the AI attacked
    and shot at the maximum rate the state machine allowed.
  · ai.js DIFFICULTY rebuilt: blockP/dodgeP are now PER-SECOND reaction
    rates (rookie 0.5/0.4 · veteran 1.4/1.0 · ace 3.2/2.2), a triggered
    block is HELD 0.35–0.7s (one-frame blocks did nothing), new aimErr
    (radians of yaw error on every aim snap: 0.3/0.16/0.05) and pace
    (gap multiplier between attack beats: 1.7/1.15/0.75).
  · Melee now swings on PACED beats with hesitation whiffs (err rolls a
    skipped beat), ranged fires in 0.5–1.2s BURSTS with real cooldown
    pauses between them instead of a continuous max-rate hose.
  · fighter.js faceNearestEnemyIfClose applies f._aimErr as random yaw
    error, so AI melee/shots can genuinely miss like a human's would.
  · FINISHER SKIP: hold A (Space/Enter on keyboard, jump on touch) for
    1s during a KO cinematic to skip it — a green Ⓐ chip with an
    animated conic progress ring + "SKIP" label appears while held,
    charge decays when released. README + pause CONTROLS legend updated.
  Verified: build green; probe: veteran block rate fell to 7% of attacked
  frames, aimErr 0.16 live on fighters, 10s AI-v-AI exchange traded
  damage both ways (1084 vs 570 hp); skip fired at 0.98s of held Space
  and cleared the finisher; skip-UI screenshot reviewed; veteran and ace
  soaks crash-free with clean KOs.

63. AEGIS SPEAR-FORWARD FORMS + JAVELIN THROW · TITANUS ROCKET FIST · CHARGED PUNCHES/POUNDS ✅
  · Found WHY Aegis read as "punching with a spear": the lance lies along
    the HAND's local +Z, so a forward-thrust arm leaves the tip pointing
    straight UP out of the fist. New identity handR.x ~= -(shoulderX +
    elbowX) keeps the point ON the target line — all three lights are now
    true spear forms (level mid thrust, high line driven over the shield
    rim, lunging skewer), and the pierce/lunge got the same hand fix so
    the heavy lunge leads point-first too. Shield never leaves guard.
  · AEGIS ranged re-authored as a real JAVELIN THROW (aegisThrow clip):
    chambers the lance level past the ear and whips it forward at chest
    height (fire at full reach) instead of the old raised-arm sky shot.
    New def.rangedClip plumbing lets any mech override its shoot clip.
  · TITANUS ranged is now the ROCKET FIST: the right fist detaches on a
    straight punch (fistLaunch clip), flies out ~26u as a boomerang
    projectile, swings around and homes back to his wrist — hitting
    enemies on BOTH legs (hit ledger cleared at the turn), punching
    through buildings/props, and re-attaching with a spark on the catch.
    The hand hides while it's out and RB is locked until it's home.
  · TITANUS + COLOSSUS charged strikes: HOLD X keeps the haymaker wound
    at the hip (punchHold loop, trembling, glow crackle tell, ring flash
    at the 1.8s cap) and releasing throws it with banked power — probe:
    tap 41 dmg vs full 81, full charge launches. HOLD Y keeps the pound
    raised overhead (poundHold) via the same hold-release machinery as
    the aegis whirl; full pound landed 141 and knocked down. Charge ring
    color now uses each mech's glow color.
  Verified: build green; probe (fist round trip + hand restore + refire
  lock, punch tap/full, pound, aegis throw spawn level at chest height);
  stills reviewed (stab thrust tip-forward, both hold poses); ace and
  veteran soaks crash-free with clean KOs.

64. CHARGE-UP FLICKER TELL ON POWER-BANKING LIMBS ✅
  · New per-limb "overcharge" sheath: while any hold is banking power, a
    reddish ADDITIVE shell (an inflated twin of each part, riding the same
    joint transforms) flickers over exactly the limbs doing the work —
    the wound-up haymaker arm (hold X), both raised pound arms (hold Y),
    the dash-charging legs (hold B), and AEGIS' whirling lance.
  · The blink accelerates as the charge fills (3 -> 25 Hz phase rate,
    probe: 0.108 -> 0.293 phase/frame across one punch hold) and brightens
    with it (0.16 -> 0.66 peak opacity), shifting white-hot at the cap —
    "more power is coming" reads at a glance before the strike lands.
  · fighter.updateChargeGlow watches all four charge kinds each frame and
    tears the shells down the instant the hold releases, breaks, or the
    fighter dies/resets. def.chargeGlow picks the limb set (aegis 'lance',
    titanus/colossus 'arms'); hold caps hoisted to shared constants.
  Verified: build green; probe (right shells per kind: 12 punch arm / 24
  pound arms / 24 legs / 6 lance, rate + opacity ramps, clean teardown on
  release for all four); 1080p battle still shows the lance streaking red
  mid-whirl; ace soak crash-free with a clean KO.

65. ROCKET FIST WEARS THE REAL FIST ✅
  · The fist projectile no longer flies as a glowing additive box: at
    launch the round is dressed in a live CLONE of Titanus' actual handR
    fist geometry (same PBR materials), recentered on its knuckle mass
    and riding the carrier so faceVel keeps the knuckles punching
    forward on both legs of the boomerang. Charge-flicker shells are
    stripped from the clone; the smoke exhaust trail stays. Generic
    spec.skin plumbing in projectiles (attached on spawn, detached on
    death) so any future projectile can wear real geometry.
  Verified: build green; mid-flight still shows the dark segmented fist
  crossing the gap (hand hidden on the mech); ace soak crash-free.

66. CHARGE FLICKER = NEAR-MAX WARNING · BLUE DASH · FIST-CATCH REACH ✅
  · The charge sheath no longer lights on any power gain: it stays dark
    until ~70% of the hold cap, then ramps blink rate and brightness over
    the final stretch to 100% (white-hot at cap) — it now MEANS "maximum
    is close", not "charging". Probe: nothing at 50-56%, strobing at 92%+.
  · Dash charge strobes BLUE (0x2470ff, icy at cap) on the legs; attack
    holds keep the red.
  · ROCKET FIST catch: the returning fist now homes on Titanus' WRIST
    (not his chest), and ~0.4s before arrival it cues reachForFist — he
    squares toward the incoming fist and plays a new upper-body fistCatch
    clip, right arm reaching straight out so the fist re-docks onto the
    extended wrist mid-reach, then the arm settles.
  Verified: build green; probe (gating thresholds, colors, catch clip
  fired during return, hand re-docked); ace soak crash-free.

67. SELF-THROWN AMMO-FREE · SAURION KICK/BITE/SPINES · WRAITH WING-RISE · FENRIR FLARE-IN-FLIGHT · GRAB WHIFF REFUND ✅
  · Mechs that throw THEIR OWN hardware no longer run on ammo: Aegis'
    javelin and Viper's fang throw lost their ammo pools (the rocket
    fist never had one) — the weapon regrows, the crates are for guns.
  · SAURION fights with his FEET now: all three lights are sickle
    toe-claw KICKS (right snap, left snap, leaping downward claw slash —
    saurionKick1/2/3, authored rest-relative so the raptor crouch
    carries through). His heavy is a lunging BITE: coils back deep onto
    the haunches, head craned away, then the whole frame springs forward
    (heavyDrive, probe: 6.7u covered) and the jaws snap down through the
    target. His ranged is now Spine Volley: a brace of blade-spines
    flung off the forearm — his own plumage, no ammo.
  · WRAITH's laser heavy got its drama: the cloak is now split onto
    cloakL/cloakR wing joints (design change; wing anchors ride them)
    and a new generic def.heavyRaise post-pose mechanic ROLLS the two
    spike-wing halves outward and up — fanning open like wings until the
    blades stand above his head (mesh tops rise from y5.6 to y11.4) —
    before the wing-tips fire (lasers pushed 0.62 -> 0.88 into a longer
    1.45s clip with a second charge sting).
  · FENRIR's porcupine flare now happens DURING the leap instead of
    before it: flare window moved to the flight (t0 0.29), so the spikes
    grow all jump long and peak at the moment of impact (probe: mane x1
    on the ground, x1.5 mid-flight, x2.1 at the hit).
  · Body-slam grabs (TITANUS/COLOSSUS Skyline Slam/Toss): a WHIFFED grab
    is no longer spent — missing everyone refunds the cooldown to a
    token 0.75s recovery (probe: whiff cd 0.18 vs landed 7.25).
  Verified: build green; probes above (kicks 89 dmg combo, spikes x2
  from the arm, no ammo fields on throwers); kick/bite stills + raised
  wing-fan still reviewed; two ace/veteran soaks crash-free, clean KOs.

68. HOLD-RB AIMED SHOTS + CROSSHAIR · WRAITH HOVER-LEAN · EAGLE KICKS ✅
  · RANGED IS AIMED NOW (humans, single-shot weapons): pressing RB/R no
    longer fires instantly — it raises a crosshair at the player's
    viewport center and the shot launches on RELEASE, flying at the
    world point under the reticle. CameraSystem.aimPointFor resolves the
    camera ray against enemies (airborne included), buildings, then the
    ground, so up/down aiming works (probe: released spear at an
    airborne target left with velY +19.6). The mech squares to the shot
    on release; a whiffed-in-hitstun aim cancels. Channel weapons
    (gatling/flame/hose) and the AI keep instant fire. Mortar lobs drop
    exactly on the crosshair. New intent.rangedHeld on all devices; HUD
    draws one crosshair per human, centered per split viewport (probe:
    shown while aiming, hidden on release). Docs updated.
  · WRAITH's laser heavy now LIFTS OFF and leans INTO the mark — hovering
    with legs trailing and torso pitched forward — instead of the old
    backward arch, while the wings fan up and fire.
  · SAURION's kicks are EAGLE kicks: the sickle claw whips up to head
    height (thigh ~105 deg, leg snapped straight) with the torso swung
    back to counterweight, on all three combo steps.
  Verified: build green; aim/crosshair/finisher probes; kick + hover
  stills reviewed.

69. FOUR FINISHERS RE-CHOREOGRAPHED (COLOSSUS, TITANUS, INFERNO, VULCAN) ✅
  · COLOSSUS: hoists the mark overhead (as before), then — one arm,
    never letting go — SMASHES the body into the dirt beside him,
    right side, left side, right again, whipping it over the top each
    time; then a single-hand hurl sends the wreck flying flat, and the
    strongman pose lands (castRaise).
  · TITANUS: seize, hoist, hurl to the dirt (unchanged) — then instead
    of pounding he JUMPS ON TOP of the wreck (pounceLeap arc onto the
    body) and TRAMPLES it: four alternating-foot stomps (new stomp/
    stomp2 clips) with the body pinned under him, and he strikes the
    arms-to-the-sky pose still standing on the corpse.
  · INFERNO: the flame jet now SWEEPS the victim head-to-toe (aim point
    scans their body three full passes), flame tongues thicken all over
    the frame as it burns, and the paint CARBONIZES to black
    (fighter.applyCharring lerps every material to char 0x14100d —
    restored on round reset). Then the burnt-out shell CRUMBLES: folds
    to the ground and sags into the dirt while the pyre keeps raging
    (fire patch + flame tongues + smoke through the whole victory pose).
  · VULCAN: arms flung up and out, both gatlings pour ~90 tracers
    skyward in a full dome; the mark looks around lost (head snaps,
    confused turns) as the camera pulls WAY back — then on one beat the
    ENTIRE swarm whips around and homes in together, hammering the mark
    in a single simultaneous barrage (custom swarm sim with per-round
    tracer streaks and impact sparks) — crumble, triumphant pose.
  Verified: build green; all four scripts probed to completion headless
  (charring hit full black 0x14100d mid-script); vulcan+saurion ace and
  inferno+colossus veteran soaks crash-free with clean KOs.

70. FINISHER RAGDOLLS · TITANUS STOMP FIX · COLOSSUS HAND-LOCK · VULCAN SWARM POLISH ✅
  · RAGDOLL SYSTEM for finisher victims: two limp looping poses
    (ragdollAir for carried/whipped bodies, ragdoll for downed sprawls —
    loops NEVER fade back to standing) plus acceleration-driven flailing
    in Finisher.update: any sharp velocity change jolts shoulders/thighs/
    head with additive impulses, so smashed bodies flail like ragdolls.
    vicDown() now ragdollizes, so EVERY finisher's fallen victim goes
    limp and stays down; the ledger clears at scene end.
  · TITANUS STOMP FIX: the stomped victim no longer "stands back up" —
    the culprit was vicFlinch() replacing the held knockdown clip with
    hitFlinch, which faded back to the standing rest pose. Stomps (and
    the landing) now use additive joint impulses that shudder the pinned
    wreck without touching its pose clip (probe: victim's action clip
    stayed 'ragdoll' through all four stomps, zero clip breaks).
  · COLOSSUS HAND-LOCK: the victim is now LOCKED to his right fist —
    vic.pos follows handR's world position every frame — and two new
    one-arm clips (colossusSlamR: overhead -> dirt beside his right leg;
    colossusSlamL: overhead -> ACROSS the body to his left) swing the
    body exactly where the hand goes: right side, left side, right
    again, then the one-hand hurl. Probe: max hand-to-body XZ gap over
    the whole smash loop was 1.4u (transition frames between swings).
  · VULCAN SWARM POLISH (user feedback): tracers are battle-scale now —
    a fat bright head glow with a trailing tail streak per round (was a
    faint dot); he fires from a new vulcanSpray pose — weight rocked
    back, right gatling flung casually up PAST his shoulder — while
    rhythmic torso/head heaves make him visibly LAUGH through the spray;
    and the converging barrage DETONATES on the mark: every 4th round a
    real explosion, sparks between, on top of the finale burst.
  Verified: build green; ragdoll/hand-lock/clip-hold probes; frozen
  stills reviewed (titanus mid-stomp standing ON the sprawled wreck,
  colossus with the ragdolled body riding his raised fist, vulcan spray
  pose with the tracer swarm curving in); ace soak crash-free.

71. CRANKY GEYSER REBUILT AS A LAYERED WATER SIM (user request) ✅
  · New src/combat/geyserfx.js: reusable GeyserFX — the standard
    real-time geyser fake (researched: column-mesh + particle layers,
    never a fluid solve). Two nested shader shells (vertex-noise churn,
    dual noise scrolling up the column, deep-blue -> aerated-foam ramp,
    rim foaming, noise-eroded ragged crown) + Effects-pool layers:
    risers, ballistic droplet crown, fall-back splash donut, mist, base
    surge, foam rings, wet puddle. Lifecycle: boiling telegraph ->
    spring-overshoot burst -> pulsing sustain (random pressure surges)
    -> drain-down collapse (ejection stops, spray rains out).
  · specials.js geyser() now spawns GeyserFX (~140 lines of hand-rolled
    burst particles deleted); damage unchanged: same 0.85s evadable
    telegraph, one heavy hit at blowout. roster.js: duration: 6 — the
    full show runs 6s (warn 0.85 + sustain 4.2 + collapse 0.95).
    world.geysers list ticks live instances; clearTransient disposes.
  · ?geyser dev page (src/dev/geysertest.js): looping hot-spring
    diorama; &t=<sec> warps + freezes for headless shots; &orbit=0.
  Verified: build green; cranky-vs-viper ace soak crash-free (clean
  KO); demo cycle stills reviewed at 4 phases; in-battle eruption
  screenshot via fast-forward probe (column reads at gameplay cam).

72. NULLBOT — 17TH MECH: THE FATAL EXCEPTION (user request, canonical images supplied) ✅
  · NEW MECH from docs/canonical/mech_null.png: tall void-black shard-armor
    frame (designs/nullbot.js) — crown horns, TWIN red eyes, red null-sigil
    (Ø ring + slash) burning proud of the chest, spike-stacked pauldrons,
    back spine-fan, clawed hands/feet, serrated fins — plus small glow2
    "corruption shard" chips bolted at wrong angles all over the shell.
    Ambient scare kit: the animator strobes the shards like a failing
    display (random wrong colors), the head snaps in micro-ticks between
    dead stillness, and fighter.updateNullbotAura pops multicolor square
    data-flecks (new glitchCellsTexture atlas + pixels particle pool) off
    random joints with rare one-beat full-shell color tears.
  · GLITCH STATUS SYSTEM (fighter.js): nullbot's ordinary-looking punches,
    the nullBackhand heavy (launches the victim flying) and the Null
    Pointer bolt each convert a PART of the victim into flickering data —
    a corruption spot pinned to a random joint + a stack, kept for the
    WHOLE round. The 10th stack OVERLOADS: 3s fully engulfed ('glitched'
    state — servos locked, spasming, dense fleck shroud, shell strobing
    wrong colors) taking DOUBLE damage; then every stack clears and the
    count restarts. Probe-verified: 9 stacks no-overload, 10th locks,
    156 = 100×2×(1-armor) while engulfed, stays locked under hits,
    clears to normal + 0 stacks at 3s, resetForRound wipes everything.
  · MOVES: Null Pointer ranged (tumbling voxel-knot projectile, glitch
    trail, color-strobing shard), SEGFAULT special (de-rez dash-through,
    +1 stack per victim), SYSTEM CRASH ult (corruption nova, tri-color
    rings + shard rain, +3 stacks), AI range/AoE gating wired.
  · FINISHER — SYSTEM FAILURE: stalks in, hoists the victim one-handed
    while corruption floods them (tint strobe + fleck shroud), drops the
    husk, turns square into a locked-off lens shot... and PUNCHES THE
    CAMERA: a full SYSTEM FAILURE bluescreen (matches docs/canonical/
    null_bluescreen_of_death.png — fatal exception text, NULLBOT.EXE,
    stop codes, NULLIFYING SYSTEM 100%, GOODBYE., animated corruption
    bars + scanlines) holds for 3 s before the scene ends. Finisher class
    gained a cleanups[] hook so end()/skip always tear the overlay down.
  Verified: idle/walk/backhand/lineup/battle screenshots judged; finisher
  probed at t=3.0 (engulf), 4.1 (lens turn), 6.0 (bluescreen, full text
  legible); nullbot-vs-viper and titanus-vs-nullbot ace soaks crash-free;
  select-screen thumb generated; npx vite build green.

73. INFERNO FIRE REBUILT AS SHADER-CARD FLAMES (user request) ✅
  · New src/combat/flamefx.js: FlameFX — researched real-time fire
    recipe (fire is an eroded shader, not fading particles). Billboarded
    cards run a domain-distorted teardrop mask: two noise octaves racing
    up at different rates shear the silhouette (tongues WRITHE), erosion
    rises with height + card age (tips tear, dying tongues burn out
    bottom-up), gradient map red skirt -> orange -> yellow -> small
    white heart. Persistent flickering core cards + transient tongues,
    ember/smoke garnish, optional flicker light (off in combat — light
    count changes recompile materials). NORMAL blending, not additive:
    additive fire vanished against bright daylight arenas.
  · Wired in: fire patches (Inferno special firewall + ult ring) are one
    FlameFX each (world.addFirePatch; extinguish-then-dispose lifecycle;
    clearTransient cleans). Flamethrower bolder: fatter stream tube
    (r0 .32/r1 2.2) + FlameFX pair per player — nozzle flames riding the
    aim (setPose/rekindle) and an impact fire blooming where it lands.
    Old flipbook-blob fire() retained only for embers/finisher pyre.
  · ?fire dev page: side-by-side old vs new; &t warp + freeze; &orbit=0.
  Verified: build green; inferno-vs-cranky ace soak crash-free; night
  demo stills + GIF reviewed; daylight uptown battle probes show patches
  and mid-channel flamethrower reading at gameplay camera.

74. BLACK QUILLS · LONGER ROCKET FIST · LB LOCK-AIM CROSSHAIR · COLOSSUS FEET-GRIP STRETCH SLAMS ✅
  · SAURION's ranged is now a fan of BLACK QUILLS thrown off BOTH hands/
    forearms: new 'quill' projectile (long flattened cone, normal-blended
    matte black so it reads as a dark blade, with a faint ember trail via
    new spec.trailColor) — three per throw, alternating hands.
  · TITANUS' Rocket Fist flies a real distance now: turnaround range 26
    -> 42 (probe: 84 units round trip), speed 42 -> 46. (Its early turns
    were also partly the old RB-aim pitching it into the ground — gone.)
  · HOLD-RB AIM REMOVED — ranged fires instantly on press again. In its
    place: LB LOCK-AIM. While target lock is held, a LIGHT crosshair
    (thin 28px reticle) drifts onto the locked enemy — a damped tracker,
    so camera swings and enemy dashes pull it off the body for a beat
    until it catches up — and any ranged attack fired during the lock
    flies at the crosshair's world point, height included (probe: quill
    fired at an airborne lock left with velY +20). Gatling streams also
    track it. CameraSystem.aimPointFor replaced by cameraFor (the HUD
    projects _lockAim through the player's own camera into their split
    viewport). Docs updated.
  · COLOSSUS finisher is the FEET-GRIP STRETCH SWING now: his fist holds
    the victim by the ankles (fighter origin = feet, locked to handR),
    and each slower one-second swing carries the stretched body clear
    OVER him — head sweeping a huge arc, momentarily pointing skyward —
    before cracking it HEAD-FIRST into the dirt beside his right leg,
    across to his left, then right again (deepened slam poses put the
    fist low; probe: head at y1.3-1.4 on impact, body roll alternating
    -2.2/+1.6/-1.6). Sparks/dust/rings land at the HEAD's world position,
    the camera pulled back (dist 16) so the whole swing reads, and the
    one-hand hurl + castRaise pose close it out.
  Verified: build green; probes above (3 quills instant-fire, aim-hold
  machinery gone, lock-aim set/cleared, colossus script completes);
  frozen impact still reviewed (body bashed down beside his right leg,
  dust at the head); ace soak crash-free with a clean KO.

75. FIST SLAMS CONVERGE ON THE TARGET (user request) ✅
  · Wide-shoulder bots were visually missing slim targets with their
    pounds — both fists landing to the LEFT and RIGHT of the body. Root
    cause: the hold-release path (titanus/colossus poundSlam, and the
    charged haymaker releases) never engaged the existing _strikeAim
    victim-tracking, so no torso steer and no palm convergence ran.
  · New fighter.trackStrikeVictim() helper wired into BOTH release paths
    (and doHeavy now shares it): the post-pose servo steers the torso
    onto the victim's azimuth and clampPalmsTo squeezes the fists onto
    the body through the swing.
  · Convergence strengthened for wide frames: target palm separation
    0.9/1.05r -> 0.8/0.95r, shoulder-travel cap 1.0 -> 1.3 rad, servo
    rate 0.12 -> 0.15, torso steer cap 0.6 -> 0.7 rad.
  Verified: build green; probe (titanus pound on an off-axis viper:
  hands 6.26 apart at rest -> 1.6 at the slam, palm midpoint 0.36 from
  the victim, 85 dmg landed); frozen impact still shows both fists
  together on the strike line; ace soak crash-free with a clean KO.

76. NULLBOT GLITCH LOOK V2 — LOCALIZED RENDERING FAILURE (user feedback) ✅
  · User: don't flash the opponent's whole body — corruption must appear
    AT the hit body part, looking like 2D JPEG noise / TV static / RGB
    tears. New glitchNoiseTexture (macroblock grid, RGB channel-split
    scan bars, fine static on transparent ground) + a glitch-patch system
    in Effects: camera-facing sprites pinned to the struck joint that
    flicker on a hard duty cycle, jitter, stretch (scanline strips vs
    noise blocks) and re-tile a fresh sub-window of the sheet every few
    frames — that part of the enemy visibly stops rendering correctly.
  · Every glitch stack pins one persistent patch to the exact part hit
    (round-long, cleared by clearGlitchOn); the 10-stack overload now
    covers EVERY body part in bigger patches for the 3s stun instead of
    tint-strobing; all whole-body color flashing removed for victims.
    NULLBOT's own ambient swapped to wandering per-part patches too, and
    the finisher engulf corrupts the victim part-by-part (patches ramp
    in faster and faster) with no tint wash.
  Verified: close-cam probes at 6/8 stacks (distinct static patches on
  waist/hip/knee/thigh), 10-stack engulf (23 live patches, no wash),
  finisher engulf re-probed; both ace soaks crash-free; build green.

77. FIRE/WATER TECH ROLLED OUT EVERYWHERE + GEYSER SCALD (user request) ✅
  · Finishers: CRANKY's launch column is a real GeyserFX (0.4s boil under
    the wreck, erupts at the launch beat; fx-only entry — no scald in the
    cinematic) replacing the old beam+particle spout. INFERNO's torch now
    uses the bold flamethrower recipe: fat tube + FlameFX nozzle tongues,
    and the VICTIM is a growing FlameFX burning source while they char
    (parked in w.flameJets['fin'] so the world ticks/extinguishes it);
    pyre fire() blobs dropped — the 4.25s fire patch is already FlameFX.
  · Hose cannons upgraded with geyser tech: STREAM_FRAG gained an
    aeration ramp (uFoam/uFoamAmt — water churns white downstream, same
    trick as the column shader) and the hose fires TWO shells: aerated
    outer stream + dense white 'watercore' heart (new JET_STYLES entry).
  · Geyser scald: w.geysers entries are now {fx, owner, dmg, radius,
    launch, tick}; while erupting, anyone inside the column (radius*0.55)
    takes dmg*0.2 soft hits every 0.4s with a half launch + splash, for
    the FULL spray duration. Big blowout hit at eruption unchanged.
  Verified: build green; cranky-vs-inferno ace soak crash-free (scald
  ticks land — inferno ground to 9hp/KO'd); finisher-demo probes shot
  mid-scene: geyser column behind the launch, victim engulfed in tongues.

78. NULLBOT GLITCH V3 — ON-TOP, DENSER, BODY-COLOR SMEARS · LEVITATION FINISHER (user feedback) ✅
  · Patches are true 2D screen artifacts now: depthTest OFF + renderOrder 9,
    so corruption always draws ON TOP of the character — from the back,
    through plating, from any angle (front/back probes confirmed).
  · Denser & more prominent: two patches per stack (big tear + satellite),
    the 10-stack overload lays a two-layer blanket (22 patches), bigger
    scale ranges, higher flicker duty, faster NULLBOT ambient. Patches now
    "decode" ~1/3 of the time in the colors of the armor they're obscuring
    (victim primary/accent/glow via opts.colors; NULLBOT's own use his glow
    channels since his shell is near-black) — smeared displaced texture
    data, mixed with raw static and hard channel colors.
  · Finisher re-choreographed: the mark is LEVITATED out at arm's length
    (3.6 units clear of NULLBOT — no hugging) and rises ~2.3 units into
    the air while long-lived patches accumulate ever faster; at 4.2s a
    final two-layer blanket makes them completely unrecognizable — and
    then the lens-turn, the camera punch, and the SYSTEM FAILURE
    bluescreen (still a full 3s; scene now 8.0s).
  Verified: front+back close-cam probes at 7 stacks (17 patches, drawn
  over the body from both sides, gold/white body-color smears visible);
  finisher probed at rise/full-cover/bluescreen; both ace soaks
  crash-free; build green.

79. MEGA-BATCH: MENUS, LOADING, FINISHERS, SIGNATURE-MOVE REWORKS (user requests) ✅
  · Glitch stun: no more 2x damage while stunned (helpless is enough).
    NULLBOT finisher leaves the corruption ON the wreck after the BSOD —
    the corpse lies there glitching until the next round resets it.
  · AEGIS javelin: ranged throw re-animated as a true overhand javelin
    (cock high above the shoulder, arch back, step-through release).
  · AEGIS Bulwark Bash reworked: shield held OVERHEAD spinning face-up
    (like his spear heavy), then a forward smash — shield squares up
    face-front and GROWS to ~full bot height (joint scaleFx 1.75x) as it
    strikes. Generic _spinFx/_scaleFx post-pose hooks added to fighter.
  · VIPER special replaced: Phantom Strike → BLADE CYCLONE, an IG-11
    walking whirlwind — legs keep striding forward (upper:true clip)
    while the torso spins 21 rad/s with both blades out, re-hitting
    everyone in the spiral every 0.22s.
  · SAURION quills now stick in the victim (bone-attached, 2.4-3.4s).
  · GLACIER finisher re-choreographed: spray until the victim is frozen
    SOLID WHITE with hands surrendered in the air, walk up, one dainty
    tap — and the statue shatters into 18 tumbling white-ice chunks that
    settle into a rubble pile (persists as debris until next round).
  · Finisher cameras: headSafe() clamp on every camShot/camAction/triumph
    — no midsection close-ups; look target lifts until the tallest head
    fits the lens (per-fighter distance aware). LB lock-aim crosshair now
    tracks the target's HEAD (0.88h) instead of the midsection.
  · Arena select: RANDOM tile at top-left — visible roulette (2 laps +
    ease-out lap) before landing on the chosen board. Grid is a bounded,
    scrollable region (13 cards never clip off-screen; selection
    auto-scrolls into view).
  · Roster select: RANDOM cell (❓) as the last tile — question-mark
    preview, color choice kept (it tints the dealt bots), and a NEW
    random robot is dealt EVERY ROUND (match.onRoundStart re-deal).
  · Ready gate: after the last player locks in, the game WAITS — a
    pulsing banner asks for one more confirm (A/Enter) so late players
    can still tweak colors. While locked: DPad UP adds a CPU (random
    veteran), DPad DOWN removes one. Sparse slots (e.g. P1+P4 only)
    verified to start correctly.
  · Pre-match warmup/loading screen: per-fighter camera strips (2/3/4
    splits) with each bot shadow-boxing + its intro quote, board title
    ("NOW ENTERING <ARENA>") up top, until the texture loader has been
    idle 0.45s (min 3.4s / cap 9s) — kills the texture pop-in at round 1.
  · Select-screen responsiveness: heading hops to the top-right corner
    when vertical space is tight (<=730px), hint bar reserves its own
    strip, roster grid is bounded + scrollable with auto-scroll, pause
    panels get max-height + scroll.
  Verified: build green; ace soaks (viper/aegis, glacier/saurion,
  nullbot/glacier post-changes) crash-free; E2E keyboard probes of the
  full menu flow (ready gate, RANDOM pick dealing nullbot, roulette to
  jungle, warmup screen, sparse-slot start); finisher probes show frozen
  surrender/tap/rubble-pile beats with heads in frame; fx probes confirm
  shield 1.75x smash, 2 stuck quills, cyclone spin, overhand javelin;
  warmup framed COLOSSUS whole.

## Phase 14 — Ultimates deep pass (user request, 2026-07-17)

- **All 17 ultimates redesigned** as big area statements (specials.js ULTS
  rewritten; roster ult params + AI self-AoE gating updated to match):
  · TITANUS Meteor Breaker: sky-reach, then 14 burning rocks hammer a wide
    zone ahead — each a fire blast that leaves burning craters.
  · VULCAN Bullet Hurricane: torso-spin sprays 100 rounds into ORBIT around
    him; the whirlwind rides along until an enemy strays close, then every
    round folds onto them over one last rotation.
  · AEGIS Judgement: 10 light beams up from the spear, "JUDGEMENT . . ."
    spelled out on the banner, then a 50/50 verdict — GUILTY is a pillar of
    light that lifts and erases the victim (uncredited kill, no finisher);
    INNOCENT does nothing.
  · VIPER Serpent Storm: coil + leap; 60 snakes burst out radially and
    slither down the prey — first fang pins them (refreshed hitstun) while
    the brood piles on.
  · NOVA Supernova: white flash, sun swells to 2x her height, collapses to
    half her size, detonates across a huge radius (caster immune).
  · RHINO Stampede: 10-strong baked-shell herd charges the line, trampling
    (herd-wide per-victim hit window) and wrecking facades.
  · TEMPEST Thunderfall: black cloud deck descends over a 15u zone around
    him; everyone inside eats 5 strikes/sec for ~2.6s.
  · FENRIR Wild Hunt: one howl, then 20 crouch-pitched Fenrir shells gallop
    every which way through a 20u zone, biting on contact.
  · COLOSSUS Colossal Form: grows to 4x height for 9s — walks through the
    fight crushing contacts, cracking buildings, thunder footfalls.
  · WRAITH Death Gaze: eye swells red, pours a widening searchlight cone;
    whoever it catches gets the narrowed eye-to-face killing beam.
  · INFERNO Fire Tornado: wandering, growing flame funnel that belches fire
    patches and hurls its first catch into the sky.
  · GLACIER Absolute Zero: flash-freezes a 14u sheet ahead; enemies on it
    whiteout, chip-tick, and skate (new `slip` status: traction 9 -> 1.1).
  · CRANKY Tsunami: curled water wall rises behind him and sweeps 48u
    forward, one heavy carried hit per victim, wrecks props.
  · SAURION Raptor Pack: 3 real AI ('ace') Saurion clones — world.minions
    with owner alliance (no friendly fire, excluded from rounds/finishers,
    can't ult) — fight for 18s or until killed.
  · FROGGER Sonic Croak: croak blast paralyzes everything in 15u (per-frame
    re-pinned hitstun + servo shudder), damage lands on release.
  · JERRY Flea Circus: 20 baked Jerry shells ricochet around like fleas,
    biting on bump.
  · NULLBOT System Crash: the ARENA de-rezzes — all reachable arena
    materials scramble to blocky wrong colors for 7s; enemies randomly fall
    through the floor and re-enter from the sky, taking landing damage.
- **Infra:** world.addUpdater(tick,end) per-frame entity driver with
  guaranteed cleanup (round sweep + finisher interrupt + re-entrancy safe);
  world minion registry; fighter allyOf/isMinion; hud 'banner' event;
  wraith `eye` anchor; bakeShell() pose-baked clone helper.
- **Meter:** ult charge fills 2x faster (all four gain sites).
- **Debug:** `?debug=ultimates` — humans and AI fire ults without charge.
- **Tooling:** tools/ultshot.mjs — pins both bots, force-fires P1's ult,
  fast-forwards the world synchronously, screenshots at frame marks.
- Verified: build green; ace ult-spam soaks of all 12+5 matchups (2P + 4P)
  crash-free incl. raptor-minion rounds; normal-mode soak green; screenshots
  of all 17 ults VIEWED (meteors falling + craters burning, orbit swarm,
  judgement beams + guilty rapture, snake brood + pinned prey, sun swell,
  herd of 10, storm strikes, wolf pack of 20, 4x giant, red gaze beam,
  tornado launch, white sheet + slipping, wave wall mid-sweep, 3 raptors
  brawling, croak rings + paralysis, 20 hopping jerries, hot-pink corrupted
  city + sky re-entry).

## Phase 14b — Settings menu + Infinite Ultimates toggle (2026-07-17)

- New SettingsScreen (menus.js): modal panel that floats over any screen,
  keyboard/pad/mouse/touch navigable, relabeling toggle rows.
- Entry points: ⚙️ gear button beside the 🔊 button (bottom-right, hidden
  during live combat like the mute button), and a SETTINGS item in the
  pause menu.
- Settings inside: SOUND ON/OFF (moved out of the pause menu) and
  INFINITE ULTIMATES ON/OFF — persisted to localStorage (rw.infiniteUlts)
  via setInfiniteUltimates(); flips CONFIG.debugUltimates live, so it takes
  effect mid-match. ?debug=ultimates still forces it for a session.
- FULLSCREEN and the SPLIT layout toggle stay at their existing top-level
  spots (title + pause menus).
- Verified: build green; E2E probes — gear opens panel on the title screen,
  click-toggle flips the label and persists to localStorage, ESC closes;
  full keyboard flow into a battle, pause → SETTINGS opens the panel over
  the pause menu, ESC returns to the pause menu with the battle still
  paused. Screenshots VIEWED.

## Phase 14c — Ultimate refinements round 2 (user request, 2026-07-17)

- VIPER Serpent Storm: snakes 2x wider / 2.3x longer; every bite now also
  injects VENOM — a new `poison` status (burn-style drain with green
  weeping-mote FX instead of flames), refreshed per bite.
- NOVA Supernova: the star has GRAVITY — enemies inside ~2.6x radius are
  dragged toward the core through the swell (22/s²) and harder through the
  collapse (52/s²), with infall streak FX; the final detonation radius
  DOUBLED (u.radius * 2).
- WRAITH Death Gaze: the searchlight now keeps hunting until it catches
  someone (12s failsafe cap; ends early if nobody's left), holding his ult
  lock alive per-frame; AI sweeps the light onto prey. The caught victim
  GLOWS furnace-red (pulsing whole-body tint) for the whole burn, restored
  cleanly after (updater end()). Damage 250 -> 330.
- COLOSSUS Colossal Form: cameras zoom out to match the 4x frame — combined
  cam grows framing radius/center/dist caps by the giant factor
  (scale / body.scale, so normal fights are untouched), split chase cams
  scale their whole envelope; and giant strikes now aim the hit sphere at
  the VICTIM's level (or street level) instead of his towering mid-chest,
  so near-misses at 4x don't whiff clean over everyone's head.
- TITANUS Meteor Breaker: every rock in a volley now rides one shared
  storm wind — slanted entry from a single quarter of the sky (~30°
  descent) instead of vertical drops.
- Verified: build green; ace ult-spam soaks of the five affected matchups
  crash-free; screenshots VIEWED (slanted meteor streaks from one quarter,
  fat green snake brood, victim red-hot under the gaze beam then restored,
  whole 4x giant framed with viper at his feet, viper dragged 14u into the
  supernova core); scripted probe confirms giant punch (59) and slam (112)
  connect on a street-level target.

78. TIDAL WAVE + FIRE TORNADO PROTOTYPES (user request — ult candidates) ⏳
  · src/combat/wavefx.js: TidalWaveFX — breaking-wave WALL (research:
    waves are trochoid-profile meshes, foam driven by steepness, never
    particles): ring-sector wall expanding outward; vertex shader builds
    the profile (forward toe, concave face, crest lip hooking over) with
    a noise-ragged crest line; frag scrolls dual noise UP the face,
    foams crest/toe/streaks, erodes the lip into fingers. A churned
    "flood" disc of scrolling foam fills the ring interior. Particles:
    crest spray thrown forward, toe churn, mist, wet foam trail decals.
  · src/combat/nadofx.js: FireTornadoFX — fire whirl (research: nested
    tapered cylinders with HELICAL noise pan + vertex wobble): two
    counter-rate shells, funnel profile (tight waist, flared top), axis
    sway figure-eight, whole funnel ROAMS (wander); FlameFX gradient +
    erosion (solid subtraction floor keeps the waist orange, not white);
    ember spiral on tangential velocities, FlameFX burning base, smoke
    crown flung off the flare. NORMAL blending (daylight lesson).
  · ?ultfx=wave / ?ultfx=nado demo pages (cycle, &t warp+freeze, &orbit=0).
  NOT wired into RIPTIDE / Inferno's ult yet — awaiting user judgment.
  Verified: build green; stills + GIFs reviewed over 3 tuning rounds.

80. INFERNO ULT = ROAMING FIRE TORNADO + TSUNAMI MODE (user request) ✅/⏳
  · INFERNO ULT (merged with the concurrent FIRE TORNADO gameplay from
    the ults-refinement branch): their hunt/sweep design (funnel chases
    the nearest enemy, grows, swallows the catch and spirals them into
    the sky, fire-patch trail, arena damage) now DRIVEN through a
    FireTornadoFX — helical shader shells + ember spiral + burning base
    replace the old glow-ribbon particles. Funnel height caps at 3x
    Inferno's height; FX lifecycle owned by world.tornados (extinguish
    on catch-throw/timeout/round sweep), steering via new setPose() and
    live radius/height on FireTornadoFX.
  · CRITICAL FIX found via the tsunami: WAVE_VERT and NADO_VERT built
    local positions but used viewMatrix without the model transform —
    both meshes rendered at the WORLD ORIGIN when spawned anywhere else
    (demos at 0,0,0 masked it; in-battle tornados would have broken).
    Both now use modelViewMatrix.
  · TidalWaveFX TSUNAMI mode (?ultfx=tsunami, prototype — awaiting user
    judgment): dir+width opts turn the ring into ONE straight wall
    travelling along dir — mid-front bows forward, flood becomes a
    rectangle dragged behind the front, all emitters go front-relative.
  Verified: build green; inferno-vs-cranky ace soak crash-free (2 KOs);
  battle probe: funnel at 20.2u over the mechs, roaming, patches trail;
  tsunami stills reviewed (bowed crest wall + flood swallowing rocks).

## Phase 14d — Ultimate tuning round 3 (user request, 2026-07-17)

- VULCAN Bullet Hurricane: orbit radius 2.5x (8-16.5u ring) with the strike
  trigger widened to match (17.5u) — the whirlwind owns the whole street.
- GLACIER Absolute Zero: the ice sheet is now PERMANENT — it stays down
  until the round ends (cleanup via the round sweep / finisher interrupt),
  even if Glacier falls. Anyone (non-ally) stepping onto it flash-FREEZES
  for ~0.65s while their body whites out, then thaws INTO the slide, still
  carrying the horizontal momentum they entered with (slip status = glass
  traction); stepping off grants a 2.2s grace before re-entry re-freezes.
  Cold damage ticks unchanged.
- FROGGER Sonic Croak: radius doubled (15 -> 30).
- Verified: build green; ace ult-spam soaks (vulcan/viper, glacier/rhino,
  frogger/jerry) crash-free incl. finisher interrupts of the permanent
  sheet; screenshots VIEWED (block-wide bullet ring, rhino frozen solid
  white on the sheet, double-size croak rings).

81. TSUNAMI ULT GETS THE WAVE SIM + SOAKED DEBUFF (user request) ✅
  · CRANKY's TSUNAMI ult (merged gameplay from the ults-refinement
    branch: one hard front hit + downrange carry, arena wreckage, foam
    collapse) now renders through TidalWaveFX tsunami mode — breaking
    profile wall, foam-by-steepness, crest spray, feathered flood sheet
    (new soft-edge alphaMap) dragged behind the front. world.waves owns
    the FX lifecycle; the gameplay updater integrates the same travel.
  · SOAKED debuff (fighter.applySoak): dripping-water status — beads
    sheet off the whole frame, puddles pool underfoot — and HALF SPEED
    (speedMult 0.5) while active. FROGGER / GLACIER / CRANKY are immune
    (water/ice frames). Applied by: the tsunami front hit (2.6s), wading
    in the trailing floodwater (refreshed 2.2s while in the lane behind
    the front), the geyser blowout hit (2.4s), and every geyser scald
    tick (2.4s).
  Verified: build green; cranky-vs-titanus and cranky-vs-frogger (immune
  path) ace soaks crash-free; battle probe: wave rolls, titanus soaked
  with speedMult 0.5; demo still reviewed (feathered flood edges).

## Phase 14e — Serpent Storm hunt fix + latch rework (user request, 2026-07-17)

- ROOT CAUSE of "snakes don't seek or damage": angleDiff(a, b) returns
  b - a (the turn FROM a TO b); the seek steer passed the args backwards
  (angleDiff(want, s.a) added to s.a), so every snake steered AWAY from its
  prey at max turn rate. Same latent inversion fixed in RHINO's bullRush
  AI steer. Plus the old strike needed a 1.2u contact with a 4 rad/s turn
  cap at 12 u/s (turning circle ~3u) — snakes ORBITED moving targets.
- Rework per spec: fly out -> WANDER/spread for the first 2s -> HUNT the
  nearest enemy (9 rad/s pursuit, speeds up to 15) -> within ~4u LEAP at
  the face/upper body (tracked airborne strike, nose-down) -> FANGS IN:
  bite dmg + venom on impact, then the snake STAYS LATCHED to that spot on
  the body (thrashing tail, head buried) for 2.4-3.8s before dissolving.
  Whiffed leaps drop back into the hunt. The brood no longer times out at
  7s — it prowls until every snake has bitten and expired, nobody is left
  to hunt, or the round sweeps it (60s failsafe); it also outlives Viper.
  Venom pin is now per-victim (u.paralyze window from their first latch).
- Verified: build green; scripted probe vs a STRAFING titanus — spread at
  2s, closed from 17.7u, 34-47 snakes latched to the upper body, hp
  1250 -> 963 with poison + pin, clean expiry and updater teardown at 12s;
  screenshots VIEWED (leap swarm mid-air, drained target); ace soaks
  (viper/titanus, viper/rhino) crash-free.

82. AEGIS THROW/BASH POLISH · SLOT SELECTOR (user feedback) ✅
  · Javelin throw rebuilt from real javelin form: the grip flips to the
    flat overhand carry (arm extended straight back at shoulder height,
    body coiled side-on, lance held LEVEL on the target line), then the
    elbow leads high and the arm whips over the top — release at the
    highest forward point. The bolt now spawns at the lance TIP on the
    throw line (it used to leave from over the wrong shoulder mid-lift).
  · Bulwark Bash: the shield itself now tips FLAT — decorated face to the
    sky — and spins about its own face normal like an umbrella/top over
    his raised fist (was a revolving-door face-changing spin), then the
    smash DRIVES: a 25 u/s shield-rush through the strike window plus a
    longer reach (6.4×scale), still growing to a bot-tall wall.
    (_spinFx gained an optional `set` base orientation that overrides the
    posed value with the spin layered on one axis.)
  · Mech select SLOT SELECTOR: LB/RB (Q/E · Numpad7/9) walk your focus
    onto any EMPTY or CPU slot — never another human's. ↑/↓ cycle what
    lives there (empty → CPU rookie/veteran/ace → free keyboard seat),
    B springs home. Cycling a slot into a keyboard seat hands it to that
    player and releases every selector on it; a slot that turns human
    under your focus (pad join) also springs you home. Focused cards get
    the visiting player's colored frame + "P<n> EDITING" tag. Replaces
    the locked-only DPad add/remove-CPU shortcut.
  Verified: build green; aegis-vs-viper ace soak crash-free; fx probes
  (flat spinning shield overhead, grown wall mid-rush hitting viper,
  javelin cock/whip/release with bolt on the throw line); keyboard E2E
  probe of the selector (focus → difficulty cycle → kb seat conversion
  with spring-home → B home → lock).
  · Follow-up (user feedback): selector stops now include KEYBOARD-seat
    slots (any non-controller slot except your own; pad/touch humans stay
    off-limits), and cycling a slot INTO kb1/kb2 no longer ejects the
    selector — it's just a stop on the wheel, so a controller can cycle
    straight past keyboard choices while setting up AIs. Only a slot that
    turns into a controller human under your focus springs you home.
    Verified: keyboard E2E probe (cycle ace → kb2 with selector held,
    wrap past to off, re-park as kb2, ring stop on the kb-human slot).

## Phase 14f — Snake bodies, invisible-wall fix, mobile Death Gaze (user request, 2026-07-17)

- SERPENT STORM visuals: each snake is now a chain of 7 tapered ball
  segments (dark head, alternating green banding, 420 instances in one
  InstancedMesh) laid out behind the head with a travelling sine wave down
  the spine — they SLITHER instead of sliding as rectangle planks. Latched
  snakes COIL around the victim's body, winding down from the bite point.
- INVISIBLE WALL bug: prop cylinder colliders were sized from the whole
  prop's bounding box — a billboard (thin pole, huge sign panel up top) got
  a street-level collider metres wider than its visible pole; same for
  holo-pillars etc. Colliders now measure only the GROUND BAND (sub-meshes
  reaching below chest height), so street-level footprints match what you
  can see. Neon radii dropped from ~4-6 to 1.2-2.5 on pole props.
  (Investigated via lane-sweep probes: pristine + post-destruction sweeps
  show no phantom blockers; every remaining grind maps to a visible wall.)
- DEATH GAZE mobility: only the 1.1s eye-charge roots Wraith — during the
  search he walks/repositions freely, steering the light with his facing
  (probe: 18u of movement mid-search, then caught the repositioned target
  for 349).
- Verified: build green; probes above; screenshots VIEWED (segmented
  S-curved brood mid-hunt, drained target); ace soaks (viper/wraith,
  titanus/jerry, wraith/glacier) crash-free.

## Phase 14g — Raptor Pack spawn hitch fix (user request, 2026-07-17)

- SAURION's ult froze the game on cast: each of the 3 clones ran a full
  synchronous buildMech (geometry sculpting + PBR texture synthesis,
  ~42ms each headless, worse on real machines) AND added a new PointLight
  — and mid-match light-count changes force a scene-wide shader recompile.
- New factory.cloneMech(src): combat-time mech copy that shares every
  geometry and texture with the source, clones only the material objects
  (so the runt tint stays local), re-resolves joints/anchors by name, and
  strips lights / charge shells / FX sprites. ~1.2ms per raptor, no
  recompile. raptorPack now clones Saurion's own mech.
- Verified: build green; in-page timing buildMech 41.8ms vs cloneMech
  1.2ms, worst world.update frame through the cast now 4.3ms; screenshots
  VIEWED (clones look right, pack-maul intact); saurion/cranky ace soak
  crash-free with full minion lifecycle (8 raptor KOs logged).

## Phase 14h — Colossal Form: giant ordnance + one-hand hurl (user request, 2026-07-18)

- Giant mortars: while in COLOSSAL FORM his twin-cannon shells scale with
  the giant factor — 2.65x mesh size, dmg 68 -> 181 (incl. form buff),
  splash 5.5 -> 13.8, knock/launch x2, default lob ranges out with him,
  deeper firing report.
- Giant grab-throw: at giant size the grab is ONE-handed — the victim rides
  the right palm alone (carryPoint uses handR; two-hand palm clamp skipped;
  post-pose override keeps the off arm down through liftHold) — and the
  hurl scales with the giant factor: throw speed x gf, arc x sqrt(gf),
  momentum hold x sqrt(gf). Measured 36u -> 158u.
- Verified: build green; probes (shell spy: size/dmg/splash scaling; throw
  distance normal vs giant; _oneArmLift active); screenshots VIEWED
  (one-arm hoist, post-hurl); colossus/viper ace soak crash-free.

## Phase 14i — Storm deck, spear throw, icicle barrage, Death Swarm (user request, 2026-07-18)

- TEMPEST Thunderfall rebuilt: radius 15 -> 26; the cloud is now a SOLID
  deck of 34 churning black mesh lumps (not particles) that rolls in over
  the whole zone; the scene genuinely DARKENS beneath it (sun/hemi/rim
  dimmed to ~34%, refcounted vs overlapping storms, restored exactly on
  end); bolts now visibly come FROM the deck — cloud-base flash first,
  then a thick jagged main bolt + halo from y=19 to the ground.
- AEGIS Dawn Javelin: the spear now launches from the throwing HAND
  (1.1u off the fingers). It used to spawn at the far lance-TIP anchor, a
  shaft-length away mid-whip — often across the body, reading as a shot
  from the wrong arm. The aegisThrow overhand clip was always correct.
- GLACIER ranged is now ICICLE BARRAGE: 6 scattered frozen spikes per
  volley (13 dmg each, 55ms apart) instead of one 34-dmg shard.
- WRAITH ult DEATH GAZE -> DEATH SWARM: the cloak erupts into 150
  instanced bats (flat winged silhouettes, wingspan-flap, per-bat scale)
  that wheel in a gyre around him, stoop into dive-bombs on anyone within
  46u (4 dmg per rake, swarm-wide 0.1s per-victim window), climb back and
  re-circle for 7s, then spiral up and thin out. Follows Wraith as he
  moves; screech barks; eye-flare cast intro.
- Verified: build green; probes (spear spawn 1.1u from handR, 6 icicles
  @13, sun 1.0 -> 0.34 -> 1.0 restore with updater teardown); screenshots
  VIEWED (block-wide black deck + darkened arena + bolts, readable bat
  flock mobbing viper); ace soaks (tempest/wraith, aegis/glacier,
  wraith/tempest) crash-free.

## Phase 14j — Aegis overhand throw, front shield + passive cover, unblockable ults (user request, 2026-07-18)

- AEGIS aegisThrow rebuilt as an unmistakable OVERHAND javelin: high
  overhead cock (elbow past the ear, hand above the helm, shaft level over
  the head) that HOLDS an aim beat, then the arm snaps over the top and
  releases forward-high; the recover keeps the hand at chest height — the
  old clip's low follow-through sweep is what read as an underhand sling.
  Fire event at the top of the stretch (t 0.45).
- AEGIS combat carriage (new combatPose): the shield arm swings ACROSS the
  body so the tower shield squares up ahead of the chest, face forward,
  slightly off-center toward its arm — instead of hanging at his flank.
  (First attempt crossed the forearm horizontally, which turned the plate
  edge-on; the adduction pose keeps the face forward.) Shield mount yaw
  +0.18 to square with the stance.
- PASSIVE SHIELD (def.passiveShield): any hit arriving within ~60° of the
  direction the shield is offset toward is taken ON the shield with block
  numbers (blockMult leak-through, spark at the shield, block sound) even
  without a guard input. Geometric vs the shield's LIVE anchor, so an
  overhead bulwark whirl stops covering the front, and flank/rear hits
  land clean. Probe: frontal 100-dmg hit -> 6 taken; flank/rear -> 84.
- UNBLOCKABLE ULTIMATES: takeHit gains an `unblockable` flag that skips
  both the active block and the passive shield; world.explode /
  groundShockwave pass it through; all 16 primary ult damage sites in
  ULTS marked (meteors, storm bullets, snakes, supernova, stampede, bolts,
  wolf bites, colossal crush, bat rakes, tornado, ice ticks, tsunami,
  croak, flea bumps, floor-fall). Raptor-clone minions fight with normal
  moves, so their attacks stay blockable — the intended carve-out.
- Verified: build green; showcase screenshots VIEWED across 3 tuning
  rounds (overhead cock, over-the-top release, front-center shield);
  probes above; aegis/vulcan + aegis/titanus ace ult soaks crash-free.

## Phase 14k — Nullbot trap-fall + front-blockable swarm ults (user request, 2026-07-18)

- NULLBOT floor de-rez reworked: the roll now ARMS a corrupted tile under
  the victim (glitch flecks flicker at their feet) that only TRIPS when
  they MOVE (>0.7u drift or real velocity, grounded) — standing still is
  safe; the trap expires after 5s or if they jump clear. Tripping starts a
  VISIBLE sink: the body descends through the floor plane over 0.55s
  (post-physics pos.y override, control seized via re-armed hitstun — no
  more instant vanish), a short fully-under beat, then the sky re-entry
  and landing damage as before. Probe: still for 3s = no fall; on walking,
  visible sink to y=-7.5, under-beat, sky, 50 dmg on landing.
- Swarm-attack ults are BLOCKABLE from the front again: snakes, wolves,
  bats and flea-clone bumps lost the unblockable flag, so a raised guard
  facing the attacker blocks each bite (each bite's own position is the
  block-direction source, so rear/flank strikes still go through). Probe:
  bat swarm 138 dmg unblocked -> 17 while blocking and facing. Big
  single-source ult damage (Vulcan storm, meteors, supernova, bolts,
  tsunami, croak, crush, tornado, ice, floor-fall landing) stays
  unblockable.
- Verified: build green; probes above; ace soaks (nullbot/viper,
  viper/wraith, fenrir/jerry) crash-free.

## Phase 14m — clone summons arrive from another dimension

- `summonFlash(w, group, color, dur)` in specials.js: every mesh of a
  freshly spawned clone gets an additive white-hot overlay copy that burns
  off over ~0.5s — the newcomer visibly "materializes".
- `summonPortal(w, x, z, {radius,color,life})`: glowing rift disc on the
  ground (additive disc + spinning broken rim arcs + rising motes) that
  packs leap out of.
- Rhino stampede: each herd shell flashes gold-white on bake-in + sparks.
- Saurion raptors: orange-hot materialization flash on each clone (on top
  of the existing converging ring).
- Fenrir Wild Hunt: big blue portal tears open under the alpha; wolves
  spawn hidden, then emerge staggered (~0.045s apart) — each pops visible
  with a flash + sparks and rises out of the rift over 0.24s before
  joining the hunt.
- Jerry flea circus: orange portal under the launch point; clones pop out
  one after another (~0.03s apart) with flash + sparks, springing straight
  up out of the disc.
- Verified: ultshot frames for all four (portal disc + motes, staggered
  wolf emergence, glowing herd, flea rift); ace soaks fenrir/jerry and
  saurion/rhino crash-free; build green.

## NULLBOT rigged-GLB model (route A goes live)

- `public/models/mech_nullbot.glb` (user-provided, rigged, animation-free)
  integrated via the manifest: custom bind pose (arms ~27° out, forearms
  vertical), `yawOffset: 180` (model authored facing −Z). Built-in rig is
  driven entirely by the game's animation set through RigAdapter.
- rigadapter: added `l_arm/r_arm`, `l_elbow/r_elbow`, `l_shin/r_shin/l_knee/
  r_knee` bone aliases (this model's convention; no boneOverrides needed).
- New GLB dress pass (`GLB_DRESS` registry in designs.js): nullbotGlbDress
  pins the glow2 corruption shards onto the virtual joints over the model
  and adds a glitch lamp that tracks the animator strobe — flicker + wrong-
  color glitches + fighter.updateNullbotAura all work on the GLB.
- Showcase now builds via `createMech`, so `?showcase` judges GLB overrides.
- Verified: idle/walk/heavy showcase shots (arms hang clean, feet planted,
  facing +Z, shards strobing), lineup, uptown battle; ace soak nullbot vs
  viper crash-free; probe confirms isGLB + 15/15-bone mapping (no console
  warnings); build green.

## NULLBOT GLB: facing/pose fixes + background model loading

- **Root-cause of "walks backwards / weird arms": RigAdapter double-yaw.**
  The topmost mapped bone's parent world quat was snapshotted at build time
  (root yaw 0); in battle the game yaws the root to face opponents, so bones
  got the yaw twice — model faced 2×yaw, i.e. away from its opponent.
  Fixed: sync() reads the live parent world quat each frame. `?rigtest`
  still 15/15.
- Bind pose re-measured from the file's bone vectors (`?glbview` is the new
  raw-model inspector dev page — neutral light, +Z marker, &yaw= spins):
  legs trailed 10° back, upper arms 14° back, forearms 17° forward vs the
  old assumed-vertical capture. Manifest now carries the measured pose;
  yawOffset 180 confirmed correct (authored facing −Z; eyes/sigil baked
  into the texture, no emissive channel).
- **Selection screen now shows the battle body**: MechSelect previews build
  procedurally for instant response, then the manifest GLB swaps in over
  the stand-in when loaded (guarded against stale picks).
- **Battle start no longer blocks on model downloads**: fighters whose
  models are ready within a 400 ms grace spawn instantly; the rest spawn as
  hidden procedural placeholders — their warm-up panel shows a LOADING
  MODEL spinner, and the fighter pops in (with intro clip) when the GLB
  lands (Fighter.swapMech swaps body/joints/animator in place; hp/state
  untouched). The warm-up gate also waits for pending models (createMech
  always settles — failed GLBs fall back — so no deadlock).
- Mid-match RANDOM re-deals get their GLB the same way: fight procedurally,
  swap in the background when it arrives.
- Verified: throttled-network run (30 s held GLB) shows spinner + all other
  warm-up UI immediately, correct swap-in facing camera, clean Round 1;
  unthrottled run shows GLB in the picker and warm-up with no pause; ace

## Phase 14n — servo-damped turning + B dash/sprint rework (user request, 2026-07-18)

- Two-tier turn damping: legs (the whole group) chase the stick at a rate
  that eases from 13 (standing) to 7 (full run) while the torso leads at
  18→12, twisting the waist (clamped ±0.6 rad, head follows at 35%) into
  the new heading a beat before the legs carry it — battle-robot mass
  without losing responsiveness. AI aim snaps sync both yaws.
- B button rework (pads, SHIFT on keyboards, on-screen dash on touch):
  standing hold winds the dash coil as before, but the coil now FIRES the
  instant a direction is pushed (no release needed) and the hold flows
  into a sprint; pressing B while already moving gives a small dash then
  a sprint (1.6× ground speed) that drains a 3.2s sprint tank (refills
  when not sprint-holding; empty tank = winded until re-press). Sparse
  dash trail marks a sprinting mech; thin yellow-green stamina bar under
  each human's ult meter (flashes while draining).
- Verified: scripted headless intent test (coil fires on stick push,
  sprint 25.9 vs walk 16.2, tank drain/winded/refill, re-press dash→
  sprint, torso measurably leads legs on a 180° flip); titanus/viper ace
  soak crash-free; build green.

## NULLBOT GLB: arm length fix (limb stretch)

- Investigated "arms feel too short": skinning is HEALTHY (hands influence
  ~7.4k verts each, weights symmetric, wrists articulate) — the asset is
  just short-armed for this character: shoulder→hand = 35% of body height
  vs the 42% the nullbot rig expects (armLen 1.14 design), shoulders a
  touch narrow.
- New manifest option `stretch: {joint: factor}` (gltf.js): multiplies the
  mapped bone's local offset from its parent before offset capture — the
  skin follows, lengthening that segment permanently; rotation retarget is
  untouched.
- nullbot: shoulders ×1.12 (width), elbows ×1.18 (upper arm), hands ×1.25
  (forearm) → arm chain now 3.30 game units vs the virtual rig's 3.23, so
  fists land where combat ranges/muzzle anchors expect.
- Verified: idle (hands at mid-thigh, no seam tearing), light1 full
  extension, walk, uptown battle; ace soak crash-free; build green.
## Phase 14o — COLOSSAL FORM camera lags the size change (user request, 2026-07-19)

- Colossus' ult camera now lets the SCALE read before the reframe: the
  zoom (camera distance only) eases at a slow rate (1.5) while a giant is
  in frame, so on GROW he becomes huge first and the camera pulls out a
  clear beat later, and on SHRINK he shrinks first and the camera follows
  in after. The look target still rides up with him instantly so he stays
  framed. Applied in both camera paths: combined (solo/spectator) via a
  giant-aware `distRate`, and split via a per-viewport smoothed `ch.dist`
  (near-instant at 12 when not a giant, so normal framing is unchanged).
- Verified: deterministic step test (grow — mech full ~1.4s vs camera 90%
  out ~later; shrink — mech back to normal ~0.9s before the camera zooms
  back in); live frames confirm the tight looming-giant read mid-grow and
  a clean practical wide shot once settled; colossus ace soak crash-free;
  build green.

## Phase 15 — LEVEL BUILDER (`?edit=level`) + authored levels (user request, 2026-07-21)

- New in-browser level editor behind `?edit=level`: pick a base theme, then
  place / move / rotate / scale / delete buildings, props, terrain (hills,
  platform decks, bridges, lanes) and spawn points on a real themed stage.
  Grid snap, undo/redo, duplicate, inspector, save/load slots (localStorage),
  Import/Export JSON, and a live **tiling view** — the 8 toroidal neighbour
  tiles render around your cell so the wrap reads exactly like the match.
  Files: `src/editor/leveleditor.js` (editor), `src/editor/catalog.js`
  (palette — every arena prop + the new obstacles + all lane kinds).
- Authored-level pipeline: the game had NO explicit per-object placement
  (everything was procedural from theme+seed). Added `theme.authored`
  (exact building/prop list), `theme.spawns`, and explicit terrain lists
  (`layout.hills.list` / `bridges.list` / lanes with `axis`+`at`) consumed
  by `Arena` + `Terrain`. `src/arena/level.js` converts an editor level →
  a theme the Arena builds verbatim. Prop registration extracted to
  `Arena._regProp` (shared by procedural + authored). `Terrain.addBridge`
  extracted; `buildHills`/`buildBridges`/`buildLanes` accept explicit lists;
  hills now resolve deck/colour/edge per-hill.
- Load & play authored levels: `?battle=<theme>&level=<name>` loads
  `public/levels/<name>.json`; the editor's **▶ Playtest** stashes the level
  in sessionStorage and opens `&level=__edit` for an instant live battle.
  Sample: `public/levels/sample-arena.json`.
- New OBSTACLES (`src/arena/props.js`, wired to existing gameplay hooks):
  `barricade` (destructible cover), `pillar`, `sentryTurret` (sweeping
  head), `forceWall` (energy barrier), `mine` (explosive), `spikeStrip`
  (cut+shove), `jumpPad`, `teleporter`, `beacon` (sweeping light), `crater`.
  Spinner update now honours `spinName`+`spinAxis` (JSON-safe for ghost
  clones). New TERRAIN lane kinds: `acid` (burns, green) + `mud` (heavy
  drag) in `terrain.js` (KINDS + paint + hazards).
- Verified: editor loads + renders the sample level with tiling ghosts
  (VIEW the shots); `sample-arena` ace soak crash-free; foundry + quarry
  procedural soaks crash-free (no regression); uptown procedural battle
  visually intact; `vite build` green.

## FENRIR custom rig + `?rigedit` bail-out message (user request, 2026-07-25)

- `?rigedit=fenrir` crashed with `Cannot read properties of null (reading
  'applyMatrix4')`: the editor loads a hand-authored rig from
  `src/mechs/rigs/<id>.rig.js`, fenrir had none, so `loadRig()` returned
  `{bones: []}`, `buildSkeletonBones` returned a null root, and
  `applyCustomRig` dereferenced it. Now a PREFLIGHT runs before the editor
  builds anything and, when it can't proceed, draws a loud card where the
  model would be — no rig authored (with the list of editable mechs and the
  three steps to start one), no manifest/GLB entry, GLB parse failure, no
  skinned mesh, or a rig with no root bone. `applyCustomRig` also throws a
  named error instead of null-dereferencing, so the same fault reported
  through `createMech` (which falls back to procedural) reads clearly.
- FENRIR re-rigged. His Tripo auto-rig had no leg chain at all below the
  hip — `kneeL` and `ankleR` both mapped to `bone_32`, and `bone_32/33/34`
  are zero-weight junk bones sticking out in FRONT of the model — so both
  legs were one rigid lump and 60 hand-written `skinOps` were patching the
  fallout. New `src/mechs/rigs/fenrir.rig.js`: 26 bones measured off the
  bind point cloud (spine, two 4-joint digitigrade legs with the hock as
  `ankle`, two arms + talons, a 6-bone chain down the sweeping blade-tail),
  and the manifest entry drops `boneOverrides` + all 60 `skinOps` for
  `"rig": "fenrir"`.
- `reskin.js` gained `rig.skinSpan`. The proximity re-skin gave each bone the
  span bone→PARENT, which is off by one link: three.js pivots a bone's
  vertices about that bone's OWN origin, so `elbow` owning the upper arm
  means a bent elbow swings the upper arm off the shoulder instead of
  swinging the forearm (measured: `kneeL` owned mesh y 0.37–0.51, the THIGH).
  `skinSpan: 'child'` gives each bone the spans bone→each child (leaves get
  a point), so `kneeL` owns y 0.20–0.38, the shin. Opt-in per rig — it moves
  every vertex to a different bone, so cranky/glacier/jerry keep the legacy
  spans their `bias` values are tuned against.
- Verified: `?rigedit=fenrir` loads and drags; colour view shows one clean
  limb per bone; bail-out card shot for a mech with no rig and for an unknown
  mech; fenrir showcase idle/walk/heavy (the quad lope now plants all four
  paws — before, the legs never articulated); uptown battle; ace soaks
  fenrir-vs-viper and cranky-vs-glacier crash-free; cranky/glacier/jerry
  showcase unchanged; `vite build` green.

## GLB models become the default + Fenrir skin pass (user request, 2026-07-25)

- MODEL SET FLIP: the GLBs in `public/models/manifest.json` are now the
  DEFAULT for every mech — title lineup, chooser, showcase and battle all
  build from the service models with no URL flag. `?debug=fallback` forces
  the procedural roster; the procedural bodies also stay the automatic
  fallback for any mech with no manifest entry or a GLB that fails to load.
  One switch: `gltf.js is3dMode()` (now `debug !== 'fallback'`), which
  `loadManifest` also reads instead of re-parsing the query itself. The old
  `?debug=3d` still resolves to GLBs, so every tool URL and doc keeps
  working. `?debug=fallback` is not a dev-router mode, so it falls through
  to the normal boot path.
- FENRIR SKIN PASS: 47 `skinOps` from the `?debug=skin` workbench merged
  into the manifest entry (38 explicit vertex-set rebinds + 9 component
  rebinds), authored against the new custom rig — targets are its own bone
  names (thighL/R, kneeL/R, footL/R, shoulderL/R, elbowL/R, hips, torso,
  head, snout). `applySkinOps` runs them over the custom rig's proximity
  skinning exactly as the workbench previewed, since both sides analyze the
  same rig. All 47 applied with no "unknown target bone" / "matched
  nothing" warnings.
- Still an accepted GLB-route contract loss for fenrir (unchanged, and
  logged by `warnContract` on every build): joints `tail0/1/2` and anchors
  `clawL/clawR`. The rig now HAS a real 6-bone tail chain, so wiring the
  animator's wag onto it through a glbanim `post` hook is possible — not
  done here.
- Verified: title lineup + CHOOSE YOUR FIGHTER + showcase + 4-player uptown
  battle all render GLBs with no flag and no console warnings;
  `?debug=fallback` renders the procedural roster on the same screens; ace
  soaks crash-free with GLBs default-on (fenrir-vs-viper, titanus-vs-nova,
  cranky-vs-saurion) and under `?debug=fallback`; `vite build` green.

## Fenrir rig tuning pass (user ?rigedit export, 2026-07-25)

- `src/mechs/rigs/fenrir.rig.js` updated to the positions exported from
  `?rigedit=fenrir`: torso lifted to the chest (y 0.665 → 0.79), crest
  dropped onto the skull (0.985 → 0.93), shoulders/arms nudged in and up,
  tail re-traced, and — the big one — the legs re-articulated so `ankle`
  now sits at the PAW (y 0.215 → 0.08) with the knee at y 0.31 instead of
  the hock-as-ankle placement. `skinSpan: 'child'` re-attached by hand: the
  editor's Export only emits name/parent/pos (+ bias/post), same caveat the
  other rig files carry.
- DROPPED the 9 `comp`-selector skinOps from the fenrir manifest entry,
  kept all 38 explicit vertex-set ops. Vertex indices are stable per GLB so
  those re-apply exactly as painted; `comp` ordinals come from
  `analyzeSkin` of the CURRENT skinning, so moving the rig repointed them.
  Measured after the move: 2 were out of range entirely (comps 55/57 — the
  mesh now has 50 components), 3 were no-ops, and 4 would have rebound
  1–10 stray verts each to a bone they no longer sit on (comp 29 wanted
  thighL but now names a tail2 island, comp 32 wanted torso but names a
  shoulderL island near the floor). Re-export them from `?debug=skin`
  against the new rig if those slivers still need fixing.
- Verified: weight report shows the chain still reads correctly per bone
  (thigh y 0.30–0.49, shin y 0.01–0.32, paw y 0–0.09, tail its own 5
  islands); showcase idle + quad lope clean with no tearing; no skinOps
  warnings on build; fenrir-vs-viper ace soak crash-free; `vite build`
  green.

## Fenrir: GLB tail wag, claws-forward Heavy, hand muzzles (user request, 2026-07-25)

- TAIL WAG ON THE GLB. `signatures.fenrir` wags `J.tail0..2`, which only
  exist when `designs/fenrir.js` ran — so the GLB body had a dead tail
  (contract §5 logged it as a known loss). `buildGlbMech` now hands every
  custom-rig bone to the mech as `mech.rigBones` (not just the 15 mapped
  game joints), and a new `glbanim` fenrir profile wags the rig's own
  6-bone `tail0..tail5` chain from its `post` hook. adapter.sync() only
  writes mapped joints, so those locals survive to the draw. Same wave as
  the procedural signature — faster and wider above walking speed — with
  per-bone amplitude and phase step halved so 6 bones trace the same total
  sweep 3 did. Measured: tail yaw sweeps ±0.10 idle / ±0.14 running with a
  travelling phase down the chain; tip moves ~0.8u side to side.
- `contract.js` gained `glbBones`: joints a custom rig reinstates as BONES
  of the same name, counted as present on GLB builds while they exist.
  Fenrir's tail0/1/2 are no longer reported as a GLB loss (clawL/clawR
  still are). Reverts to reporting if the bones leave the rig.
- HEAVY (`fenrirSpike`) now leads with the CLAWS. Shoulder pitch was +10 →
  +30 through the leap, which in this rig means both arms swept BEHIND him
  (negative = forward/up; cf. the jab's −98), so the pounce landed
  chest-first with the talons trailing. Now: chambered high and folded on
  the coil (−46, elbows −92), thrown out ahead of the body on the drive
  (−104, elbows −20, wrists cocked so the talons rake), still reaching at
  −84 through the t=0.55 hit window. Edited in `animations.js`, the SHARED
  clip, so procedural and GLB both get it (per the glbanim factoring
  contract).
- Fenrir muzzle anchors from `?debug=models` merged into the manifest:
  muzzleR/L now ride the `handR`/`handL` bones with the supplied offsets +
  90° barrel yaw, so ranged fire and specials spawn from the claws.
- Verified: tail probe above; heavy frozen at t=0.30 and t=0.50 on BOTH
  routes (claws lead in each); contract log now lists only the claw
  anchors; battle console clean of skinOps/manifest complaints; ace soaks
  crash-free with GLBs default-on and under `?debug=fallback`; `vite build`
  green.

## Fenrir heavy squares up + a real DASH move (user request, 2026-07-25)

- FENRIR'S HEAVY NO LONGER LUNGES SIDEWAYS. The slew was the strike servo:
  `aimStrikeAt` twists the torso up to ±0.7 rad to steer the palms onto the
  victim, and for a leap where the whole BODY is the weapon that reads as
  the shell slewing round and staying there. The roster already has the
  mechanism for this (`noTwistClips`, which cranky uses for `clawSnap`) —
  fenrir's `fenrirSpike` now joins it.
- ...but `twistLocked()` was a STEP: the frame the clip starts, whatever
  twist the servos had banked vanished in one frame. Added
  `fighter.updateTwistLock(dt)`, a ramped 0..1 version of it, and both twist
  sources (the strike servo AND the torso-leads-the-legs turn lag) now scale
  by `1 - lock`. Measured on fenrir with the prey parked off to one side:
  torso yaw eases −13° → 0 by clip t≈0.5, i.e. he ROTATES BACK to centre
  through the wind-up and lunges square, well before the t=0.55 hit. Cranky
  gets the same easing on `clawSnap`.
- DASH IS A MOVE NOW, not a slide. It was two lines of torso lean over a big
  velocity change. `animator.update` gained a three-beat dash layer, additive
  over the locomotion and placed AFTER the gait blocks (which assign rather
  than accumulate) so it survives them and mixes into a run instead of
  replacing it:
    1. COIL — standing on a held dash button: sink onto the back leg, weight
       back, arms cocked. Deepens as the charge winds (`ctx.dashCoil`).
    2. GATHER — the compression at the head of the burst, so an uncharged
       dash, and one thrown mid-run where there IS no coil, still crouches
       before it goes.
    3. DRIVE — hips low and pitched in, legs SPLIT (lead knee up and tucked,
       trailing leg extended off the toe), arms counter-swinging, easing out
       over the back half.
  Leg folds reuse the duck layer's derivation (thigh pitched A, shin
  countertilted B−A, hips dropped by the exact loss of vertical reach) so the
  feet stay planted instead of punching through the floor.
- `ctx` gained `dashCoil` (0..1 wind while the standing coil charges) and
  `dashP` (progress 0→1 through a burst). `dashT` alone couldn't shape a
  gather-then-extend pose — it only counts down, so the animator couldn't
  tell a launch from a recovery; `doDash` now records `_dashDur` for it.
  The existing charge/release/sprint MECHANIC was already there
  (CHARGE_DASH_MAX, `_dashCharging`, sprint-on-hold) — only the pose was
  missing.
- Verified: coil/gather/drive judged from the showcase camera on titanus
  (biped) and fenrir (quad gallop — the layer rides on top of the bound
  instead of fighting it); dash driven through a real fighter in-battle;
  twist probe above; ace soaks crash-free for fenrir/viper, cranky/titanus,
  saurion/nova and under `?debug=fallback`; `vite build` green.

## Fenrir heavy: arms open WIDE, then scythe to the middle (user request, 2026-07-25)

- `fenrirSpike` now opens and CLOSES across the leap, like a bear hug thrown
  at a sprint. Wind-up (t=0.28): both arms flung as wide and as far back as
  the joint allows — measured on the rig, the claws sit 6.8 units apart vs
  3.65 at rest, behind the chest line and raised. Lunge (t=0.42 → the t=0.55
  hit): they scythe to the MIDDLE and forward — 1.0 apart, 2.8 ahead of the
  body, converging in front of the chest.
- The roll sign is not guessable and the old comment would have had it
  backwards: measured by posing the rig and reading hand positions,
  NEGATIVE shoulder roll on the left with POSITIVE on the right is what
  opens the arms outward (a +60/−60 pair CROSSES them instead), and positive
  shoulder pitch is what carries them back. Noted in the clip comment so the
  next edit doesn't have to re-derive it.
- Still the SHARED clip in animations.js, so procedural and GLB both get it.
- Verified: wind-up and strike frozen at t=0.28 / 0.42 / 0.55 / 0.58 on both
  routes (VIEWed — arms spread-eagle at the wind-up, converged in front at
  the hit on each); ace soaks crash-free fenrir/viper and fenrir/titanus
  under `?debug=fallback`; `vite build` green.

## Rhino (GLB): ranged shot fires FORWARD, arms level (user request, 2026-07-25)

- New hand-cannon muzzle anchors for `rhino` in `public/models/manifest.json`
  (user-supplied): both sides now ride the real `handR`/`handL` BONES with an
  authored `rot`, so each barrel carries its own aim axis and the markers sit
  on the fists (verified in `?showcase=rhino&muzzle`).
- That aim axis exposed the bug: this GLB's bind hangs the arms straight down,
  so the barrels point ~70° at the FLOOR at rest, and the shared `shoot` clip
  swings the gun arm up past level — measured, the muzzle +Z overshot to
  **+26° at the fire frame** (peak +32°), which `world.js barrelDeflect`
  obeyed, lobbing every shell into the sky.
- Fix is a `GLB_ANIM.rhino` post hook (glbanim.js), the vulcan pattern: while
  `shoot`/`shootL` plays, hold shoulder+elbow pitch on the barrel-horizontal
  line (`RHINO_LEVEL = -82.7°`, measured on this rig) with a hard `max()`
  ceiling so the clip's overshoot can't climb above the horizon, ramp the off
  arm onto the same line, and unsplay the shoulder roll — he braces BOTH
  cannons straight ahead instead of firing one-handed from the hip.
- `RHINO_LEAD` (14°) cancels the animator's ~26/s pose-chase lag: the shell
  leaves at 20% into the clip, before a plain level target has settled, so the
  early frames aim a few degrees past level and the lead decays out by mid-clip.
- Measured: muzzle pitch at the fire frame **+26° → +1.1°**, and within ±3°
  across the whole hold. Live ace battle, 36 shells: launch pitch was +5.6°..
  +28° (mean +15, all skyward) before, now -21°..+6° (mean -6.5) — tracking
  the target. Procedural route untouched (profiles are GLB-only).
- Verified: fire pose + rest VIEWed in showcase (arms dead horizontal, fists
  forward, no geometry tearing); ace soaks rhino/titanus crash-free;
  `vite build` green.
## Tempest: updated anchors/skinning + a heavy that PUMPS the T (user request, 2026-07-25)

- Manifest: Tempest's `muzzles` re-authored from the anchor editor — both
  barrels now ride real GLB bones (`tripo0_Right_Limb_6` on the right,
  the mapped `elbowL` on the left) with authored offsets/rots, replacing the
  old generic in-hand `handR`/`handL` pair. `skinOps` refreshed to the new
  123-op set (one added vertex-list op onto `bone_24`).
- `tempestTornado` (the shared heavy clip, so BOTH routes get it) now pumps
  the arms across the spin instead of holding one shape: flat T at t=0.30 /
  0.46 / 0.68, arms dropped along the body at t=0.38 / 0.56, each launch an
  `outBack` snap back out. `heavySpin` runs 0.26–0.86 at 24 rad/s ≈ 2.3
  turns, so it's one drop-and-launch per revolution with a T carrying each
  hit beat (0.45, 0.68).
- The T pose was measured, not guessed: shoulder roll −92/+92 with ZERO
  pitch and a STRAIGHT elbow is flat on this rig on both routes (hands land
  at y 1.8–2.0 against shoulders at y 1.64–1.77, at full 3.6–3.9 horizontal
  reach). The old −24 shoulder pitch was what dragged the hands forward and
  below the shoulder line; roll past ~100 lifts them into a Y, not a T.
  Recorded in the clip comment.
- Verified: frames frozen at t=0.30 / 0.38 / 0.46 / 0.56 / 0.68 and VIEWed on
  the GLB route and t=0.30 / 0.38 / 0.68 under `?debug=fallback` — flat T
  with hands at shoulder height on both, arms hanging on the drops; ace
  soaks crash-free tempest/viper (GLB) and tempest/titanus (`?debug=fallback`),
  no contract violations; `vite build` green.
## Titanus re-rigged and re-skinned onto a custom skeleton (user request, 2026-07-25)

- Titanus rode a Tripo auto-rig that was scrambled beyond remapping: the 15
  `boneOverrides` had `hips` on `tripo0_Left_Limb_0`, `torso` on
  `tripo0_Right_Limb_0` and `shoulderL` on `tripoSpine_0` — the spine wired to
  limb chains — with 101 hand-written `skinOps` patching the fallout. It still
  measured badly: 33 stretch-flagged islands, seam elongation to 148x, and one
  "torso" bone owning 14.8k verts (18% of the mesh).
- He now uses a hand-authored 26-bone humanoid rig
  (`src/mechs/rigs/titanus.rig.js`, registered in `rigs/index.js`, selected by
  `"rig": "titanus"`), so `reskin.js` redraws every weight by proximity onto
  bones that ARE the game joints. Bone positions were measured off the GLB's
  bind-space vertex cloud (band/slice profiles + ortho scatter renders), not
  guessed: thigh y 0.29→0.47, shin 0.13→0.29, boot 0→0.13, fist 0.24→0.47
  projecting forward to x 0.19, pauldron 0.68→0.90 out to z 0.37.
- `skinSpan: 'child'` (the spans that deform correctly — see reskin.js). The
  non-obvious consequence, and the reason for the seven non-joint bones: under
  'child' a LEAF bone's span degenerates to a point that its parent's span
  already ends at, so a leaf can never win a vertex and renders zero-weight.
  Every driven chain therefore ends in a static tip — `fistL/R` (the huge
  fists), `toeL/R` + `heelL/R` (the long sole, two tips so the boot rides the
  ankle instead of the shin), `crown` (the skull).
- `stackL/R` (the twin back exhaust towers) are parented to TORSO on purpose:
  the nearest span otherwise is head→crown, which would swivel the whole back
  gear with every animator head turn-lead.
- `heightScale: 0.946` is load-bearing, not a fudge. gltf.js auto-sizes a GLB by
  matching its rendered HEAD-REGION top to the procedural canonical head top.
  Under the old rig the head bone's geometry included those towers, so the
  "head top" measured was really the tower tips — which happened to land on the
  canonical height. Titanus's real head is a low block sunk between the
  pauldrons, so once the towers correctly ride the torso the measured head top
  drops ~12%, the match clamps at its 1.12 ceiling and the mech renders 5.7%
  larger. The scale pins him to the exact silhouette he always had
  (bbox 9.04 x 7.36 x 3.67 vs 9.05 x 7.36 x 3.67 before).
- 6 `skinOps` refine the proximity result where the fist hangs alongside the
  thigh with a ~0.01 gap and no rigid split is clean. Two of them came from
  READING the geometry, not the tool: `stretchaudit` auto-suggested moving
  comps 37/94 (6 verts and 1 vert) onto the hands, but a boundary-edge
  histogram showed those islands have ZERO hand neighbours — all thigh/knee —
  so binding them to the hand made each a lone vert flying off with the punch.
  They are bound to `thighR`/`thighL`; the visible spikes in the heavy windup
  disappeared.
- The superseded Tripo rig is preserved verbatim as the manifest `alt` on the
  same GLB (`boneOverrides` + all 101 `skinOps`), so `?debug=models` compares
  old vs new. `?rigedit=titanus` now opens him for live tuning.
- Tooling fix: `tools/stretchaudit.mjs` picked the bones to sweep from
  `boneOverrides`, which a custom-rig entry has none of — so it swept nothing
  and reported a vacuous "0 flagged" for every re-rigged mech (cranky, fenrir,
  glacier, jerry too). It now falls back to `JOINT_ORDER` when the entry has a
  `rig`.
- Verified: stretch audit 33 flagged islands / 148x -> 2 / 12.3x (the residual
  is 4 edges on the thigh-fist tab, where any rigid split seams); far-blend
  audit 0 verts (the old rig needed `purgeFar`); skin audit 0 flagged;
  idle/walk/heavy/battle/lineup screenshots VIEWed (shells intact, arms clear
  overhead, boots planted, no spikes, coherent next to the other 15); world
  size unchanged; attackmatrix special+ult connect on both rigs and the
  `titanus ranged: 0` case reproduces identically on the OLD rig here (the
  known flake in this log, not a regression); ace soaks crash-free
  titanus/viper and titanus/colossus; `vite build` green.
## Wraith: custom rig + skinning, Tripo rig kept as `alt` (user request, 2026-07-25)

- `src/mechs/rigs/wraith.rig.js` (new, 39 bones, `skinSpan:'child'`) replaces
  the Tripo auto-rig: that rig mapped `hips`/`torso` onto two LIMB roots,
  pulled the two arms out of unrelated `bone_N` runs, and spread the cloak +
  rifle — two thirds of the silhouette — across a dozen junk bones. 44
  `skinOps` were patching the fallout and the cloak still tore every step.
  Manifest primary is now `"rig": "wraith"` with no boneOverrides/skinOps; the
  whole old entry is preserved verbatim as `alt` (+ `profileKey:"wraith_alt"`).
- The two parts proximity skinning can't get right on its own now have their
  own bones: the RIFLE (`rifle`/`rifleButt`/`rifleTip`/`scope`, a rigid body on
  the gun hand — its barrel reaches the floor, so nearest-bone was welding the
  lower half to the shin) and the CLOAK (`cape0` + four columns of three, hung
  off the torso — the drape wraps outside the legs). Also `hood`/`eye` so the
  head carries the hood, and `mantleL/R` on the torso so the shoulder capes
  don't swing with the arms.
- Handedness fixed at the source: the rifle is in the model's LEFT hand, so the
  bones are named anatomically and the glbanim profile sets `mirrorArms` —
  right-arm clip tracks play on the arm that holds the gun, properly mirrored.
  The old rig CROSSED the bones (handR on the gun arm), which reversed every
  lateral arm motion and needed a hand-written punch fixup (kept in the new
  `wraith_alt` profile, which still runs the crossed rig).
- The gun hangs muzzle-DOWN, and combat throws each shot along the muzzle
  anchor's +Z — so `levelBarrel` (rhino-style) puts the barrel on the horizon
  through `shoot`/`aim`. Measured with the new `tools/aimprobe.mjs`: the tip
  sits 99.5° below the shoulder+elbow pitch sum, and with a 26° lead the fire
  frame lands at ele +0.5° / azi -1.3° (was -11.9° into the floor).
- Cloak sway: `swayCloak` rotates the four cloak columns from speed (trail
  back), air time (drag lift) and a phase-offset flutter. The columns are
  static bones, so the retarget never fights them.
- Contract: `rifle` reinstated as a GLB rig bone (`glbBones`) and `eye`/`scope`
  as manifest muzzle extras — wraith is now the first GLB build with ZERO
  contract losses. DEATH SWARM flares from the hood instead of the mech centre.
- New tools: `rigscout.mjs` (mesh-local island contact sheets + `--skin` bone
  ownership view — how this rig was placed headlessly), `aimprobe.mjs` (muzzle
  world direction per clip frame), `variantcheck.mjs` (primary vs alt build
  report). `?showcase` gained `&cam=<zoom>[,<yaw>[,<targetY>]]` and
  `tools/pose.mjs` a `cam` argument, for close-up judging.
- Verified: skinaudit 0 flagged, weightaudit 0 far-blend verts, contract clean,
  ace soak wraith/viper crash-free, `vite build` green; idle/walk/shoot/light2/
  light3/knockdown/heavy frames VIEWed against the same frames rendered from
  the `alt` entry — the old rig collapses the cloak onto a leg and folds the
  rifle in half mid-stride, the new one holds both.

## GLB model scale is FROZEN, never derived from the rig (user request, 2026-07-25)

- Rule established: a GLB's rendered size must be a function of the FILE plus one
  manifest number, never of where its rig's bones sit or which bone owns which
  vertices. Re-rigging or re-skinning a mech must not resize it.
- The old behaviour: gltf.js auto-sized every GLB by matching its rendered
  HEAD-REGION top to the procedural canonical head top — twice, once on the head
  BONE and once on `measureHeadTop` (the verts the head bone owns). Both read the
  rig, so model size was a live function of it. That is what bit the Titanus
  re-rig: his old auto-rig's `head` owned the tall back exhaust towers, so the
  "head top" being matched was really the tower tips, which happened to land on
  the canonical height. A correct skeleton moved that region onto his actual head
  (a low block sunk between the pauldrons), the match clamped at its 1.12 ceiling
  and he rendered 5.7% larger — patched at the time with `heightScale: 0.946`.
- New manifest field `modelScale`: the absolute scale on the GLB's native units,
  and the model's size of record. When present, gltf.js SKIPS both head-match
  passes entirely. `heightScale` still multiplies on top as the artist knob
  (viper 1.1, jerry 0.59 etc. keep their meaning).
- `tools/pin-modelscale.mjs` pins it: builds each entry with the derivation
  forced, reads the scale, and text-edits the manifest (targeted, so the rest of
  the file keeps its formatting; refuses to write if anything but `modelScale`
  changed). Idempotent — an already-pinned entry is left alone, because the
  pinned number is the size of record and re-deriving it after a rig change IS
  the silent resize the mechanism prevents. `--check` for CI, `--repin` to
  deliberately re-baseline. All 20 slots (18 mechs + jerry/aegis/titanus alts)
  are pinned.
- Titanus's `heightScale: 0.946` band-aid is gone, folded into
  `modelScale: 9.04432` so his entry states his size honestly.
- Unpinned entries now log a one-time console warning with the exact number to
  paste, so a newly dropped GLB still bootstraps and then gets frozen.
- Verified: all 20 slots measured before and after — rendered bbox identical to
  within 0.002 on every one (h/w/d), so nothing on the roster changed size;
  lineup screenshot VIEWed and unchanged; rig-perturbation proof (move head +0.125,
  drop both shoulders, splay both thighs) → PINNED height change 0.0000 vs
  UNPINNED 1.3276 (9.56 -> 8.23, a 14% resize), which is the regression this
  closes; pin tool idempotent on re-run and `--check` exits 0; titanus stretch
  audit still 2 flagged / 12.3x; ace soaks crash-free titanus/viper and
  aegis/jerry; `vite build` green.
- Documented as a hard rule at the top of MECH_ART_GUIDE §0 (the file every
  agent reads first), in its pitfalls list, and in full in CHARACTER_PIPELINE.md
  ("Model scale is FROZEN, never derived from the rig") + the manifest field
  table.
- It caught a live one on the way in. Merging this onto main picked up another
  session's WRAITH custom rig, whose `modelScale` was already pinned from before
  that re-rig — measured, the re-rig would have grown him 5.3% (h 6.73 -> 7.09)
  under the old derived path, and the pin held him at his size of record with no
  intervention. wraith's new `alt` slot was pinned too (21 slots now).
## Glacier: new rig/anchors, child-span re-skin, and the lance shoots (user request, 2026-07-25)

- `rigs/glacier.rig.js` rebuilt on the user's new bone positions (the whole
  skeleton sits higher — hips 0.42→0.56, shoulders 0.62→0.78, knees 0.22→0.37),
  and the manifest `muzzles` replaced with the user's bone-mounted pair:
  `handR`/`handL` with authored offsets + rots (was the generic in-hand
  `joint` pair). muzzleL now rides the ICE LANCE, and its authored +Z is the
  lance axis — measured 6° off the geometric hand→blade-tip line, at rest and
  through the shot.
- **Skinning**: switched the rig to `skinSpan: 'child'` (the fenrir treatment).
  Under the old default 'parent' spans every bone owned the slice ABOVE it —
  the upper arm was on `elbow`, the thigh on `knee`, the shin on `ankle`, the
  forearm on `hand` — so every bend swung the segment on the wrong side of the
  joint. Added the tip bones that mode needs (`lanceL`, `clawR`, `footL/R`,
  `crest`, `backSpine`): static, non-joint bones that exist only to give the
  last driven joint of each chain a span to reach along. Re-tuned bias against
  the new spans — notably shoulders at 0.7, BELOW the torso's 0.8, because the
  spiked pauldrons sit above the shoulder joint (outside shoulder→elbow) and
  the torso→shoulder span ends at the same point, so without the tie-break the
  pauldrons weld to the chest and the arms raise out of them.
- Result A/B'd on an isolated raised-arm pose: 'parent' sheared the left
  pauldron into a wedge stretched across the chest; 'child' keeps it whole and
  carries it up with the arm. Vertex ownership now reads correctly per bone
  (shoulder = upper arm, elbow = forearm, hand = hand + lance, knee = shin,
  ankle = foot, head = skull at 3046 verts instead of 196).
- **Ranged attack moved to the armed hand.** `fireRanged` (world.js) took the
  primary barrel off a hard-coded `anchors.muzzleR`; a mech can now name it
  with roster `rangedMuzzle`, and the anchor is passed to the weapon handlers
  as ctx `muzzle` so `shard` re-reads the LIVE barrel each of its 6 ticks.
  Glacier gets `rangedMuzzle: 'muzzleL'` + `rangedClip: 'shootL'` (the existing
  mirror of `shoot`), so the Icicle Barrage leaves the lance instead of the
  empty claw. No-op for every other mech (default is still muzzleR).
- **And it points forward.** New `GLB_ANIM.glacier` post hook (the rhino
  pattern): while `shootL` plays, hold shoulderL+elbowL pitch on the
  lance-horizontal line — `GLACIER_LEVEL = -62.1°`, measured by sweeping the
  joint-pitch sum against the muzzle axis (muzzle pitch = −62.1° − sum, dead
  linear) — with a hard `max()` ceiling and a 12° lead for the animator's
  pose-chase lag. Also counter-steers shoulder yaw against the clip's recoil
  twist, which with a level lance was walking the fan sideways.
- Measured on the GLB: muzzle pitch at the fire frame **+44° → +1.3°**, and
  within +1.6..−4.9° across the whole 6-icicle burst; yaw drift 11° → 3°.
  Live ace battle: all 12 shards spawn AT muzzleL (distance 0.00), launch
  pitch −15.5..−19.5° tracking a shorter target, yaw −0.6..−8.4° off facing.
  Procedural route (`?debug=fallback`) also fires from muzzleL: pitch −1.8°
  mean, yaw +0.8° mean.
- Verified: idle/walk/block/heavy/punch frames VIEWed (no tearing, pauldrons
  and lance intact), lance confirmed straight and undeformed from a top-down
  view of the fire frame, lineup coherent; ace soaks crash-free
  glacier/viper (GLB), glacier/cranky (GLB), glacier/titanus
  (`?debug=fallback`); `?rigedit=glacier` and `?rigtest` clean; no new
  contract violations; `vite build` green.
## Glacier: skin + anchor update, specials off the lance, fused-head mechs (user request, 2026-07-25)

- Manifest: user-authored `skinOps` (33 ops from the `?debug=skin` workbench)
  applied on top of the child-span rig, plus re-authored `muzzles` — muzzleR
  moved onto the `elbowR` bone, muzzleL further back along the lance. Same
  `rot` on both, so the lance's aim axis (and `GLACIER_LEVEL`) is untouched;
  re-measured and the calibration is still exactly −62.1°.
- The ops mostly rebind the forearm/hand split (handL 4449 → 10077 verts,
  handR 1132 → 5758) and pull the skull onto the torso (head 3046 → 493) —
  which lines up with the fused-head change below. Lance blade still 97% on
  `handL`; verified no tearing on idle / walk / raised-arm / beam poses.
- **SPECIALS NOW FIRE FROM THE WEAPON HAND.** `rangedMuzzle` renamed
  `primaryMuzzle` (it is no longer ranged-only) and `specials.js muzzle()`
  defaults to it instead of a hard-coded muzzleR — so the Cryo Beam, and
  `aimDir`'s origin with it, come off the ice lance. Explicitly-named callers
  (the alternating-side volleys) are untouched, and no other mech sets the
  field, so nothing else changes.
- The raised arm had to follow: added `shootLoopL` (mirror of `shootLoop`),
  `freezeBeam` now casts `def.channelClip` instead of a literal, and Glacier
  gets `channelClip: 'shootLoopL'`. His FINISHER hoses the same cryo beam, so
  it takes the same two lookups. `GLB_ANIM.glacier`'s lance-level hook now
  covers both `shootL` and `shootLoopL` (loop clips ramp on once and hold
  instead of ramping out on clip phase).
- Measured: beam arm settles by t=0.10 and holds muzzle pitch −3.6..−5.3°,
  yaw +1.4..+2.1° for the whole 1.8 s channel; barrage unchanged (+1.4° at the
  fire frame). Live ace battle: all 15 special beams and all 38 finisher beams
  spawn AT muzzleL (0.00), 5.3 units off muzzleR. Shard accuracy also improved
  with the new anchors — angle between the shot and the line to the enemy went
  27.0° mean / 59.6° worst → 16.0° / 35.4° over 18 shards.
- **FUSED-HEAD MECHS.** `rigidShell` (already on cranky, but only implemented
  as cranky's own bespoke pin plus the fighter.js turn-lead) is now a real
  shared capability: the Animator pins `tgt.head` to its rest carriage at the
  very end of `signature()` — after clip tracks, additive impulses, the
  signature and the profile hook — so no layer can sneak head motion back in.
  The ragdoll's head aim drops out on the same flag. Glacier and Colossus now
  carry it, and cranky's duplicate inline pin is gone.
- Measured: head deviation from rest across heavy / walk / hitFlinch /
  castRaise / shoot / block is **0.00° on all three** GLB mechs, vs 26.2° on
  titanus (no flag). GLB-only — procedural Glacier still moves his head the
  full 26.9°.
- Verified: idle/walk/raised-arm/beam frames VIEWed for Glacier, walk frames
  for Colossus and Cranky; glacier finisher forced to completion (38 beams,
  shatter fires, 18 rubble chunks, no page errors); ace soaks crash-free
  glacier/viper, colossus/cranky, cranky/glacier and glacier/colossus
  (`?debug=fallback`); `vite build` green.

## Titanus rocket fist: punches FORWARD, and the real fist flies off (user request, 2026-07-25)

- User supplied new muzzle anchors and a `?debug=skin` pass painting his fist
  onto the rig's `fistL`/`fistR` tip bones. Both are in the manifest; the fist
  ops are 65 of the 71 (my 6 boundary ops kept).
- **The arm was punching at the sky.** `fistLaunch` carried the wind-up's twist
  (torso yaw -28, hips -16) straight through the release, so at the fire event
  the arm left 46° across his chest and 12° up — MEASURED, not eyeballed. Both
  routes had it, so it was the shared clip, not the retarget: the procedural
  body did the same thing. The release frame now squares up, and the arm angles
  come off a sweep — shoulderR pitch -90 with a level torso is dead level and
  dead forward (armDir [0,0,1]), and each +1° of torso lean costs 1° of arm
  pitch, so lean 6 pairs with -96. `fistCatch` squared up to match, so the
  wrist is presented down the line the fist is flying home along.
  · Watch out: clip poses are DEGREES but `Animator.applyPose` takes RADIANS —
    a probe that feeds it degrees produces chaos that looks like a rig bug.
- **The projectile was aiming 78° up.** `barrelDeflect` rotates the shot from
  the fighter's facing onto the muzzle anchor's world +Z, and a muzzle `rot`
  authored at REST is wrong for a rocket punch: the arm swings 90° between rest
  and firing and carries that +Z up with it. The offsets are kept (they place
  the muzzle on the fist) and the `rot` dropped, which is the fallback gltf.js
  already documents for exactly this case — "a muzzle on a hand bone is
  meaningless as an aim vector". Measured after: the fist leaves at yaw 0.0°
  with velDir [0,-0.11,0.99], pitching gently DOWN onto the target.
  · Side effect: `titanus ranged` in the attack matrix has been the roster's
    long-standing "known flake" (0 damage, repeatedly re-run and excused in
    this log). It was never variance — it was this. The full matrix went from
    8 failures to 5, and the remaining ones are mechs this work never touched.
- **The fist now actually leaves** (`src/mechs/fistsplit.js`). The procedural
  body gets this free — its fist is a real Object3D under handR, so launchFist
  scales that joint away. A GLB is one skinned mesh, so:
  · the painted `fistL/fistR` selection is only a SEED. Those tip bones are
    rigid, never-animated children of the wrists, so painting to them changes
    nothing about how he deforms — it just means "this is the fist". The cut
    itself is derived: wrist->fist axis from the two clouds' centroids, the
    1-D threshold along it that best separates them, a flood fill through the
    mesh from the seed that never crosses back over that plane, and WHOLE
    triangles claimed. Feathered edges become a flat cut, nothing is torn, and
    strays the artist left on a neighbouring bone travel with the fist instead
    of being left hanging in the open socket (visible as floating fragments
    until the flood fill went in). 9248 tris right, 9143 left, 92-93% of the
    painted selection agreeing with the plane.
  · the cut triangles move into their own geometry GROUP, so detaching is one
    material's `.visible = false` — no second copy of an 84k-vertex buffer per
    fighter, body still one draw call.
  · the break is filled by a dark BACKFACE layer on both halves (same vertex
    buffers, indexed to the shell around the cut, `side: BackSide`, gunmetal
    with polygonOffset). Tried capping the rim geometrically first: a mech fist
    is ~20 separate armour plates, so there is no single rim, and boundary-loop
    extraction went wrong at every non-manifold junction and threw a big flat
    sheet across the arm. The backface layer needs no rim geometry and cannot
    leave a gap however jagged the cut is.
  · the projectile wears a bake of the fist's CURRENT posed triangles with its
    original normals and UVs — without the UVs the PBR maps all sample one
    texel and it flies as a flat dark blob. Baked into a frame whose +Z is the
    punch axis because the carrier orients itself by faceVel.
  · `catchFist` restores it, and since `onReturn` fires on ANY death of the
    projectile (not just a clean catch) the fist can never be left missing;
    the round-reset path covers it too.
- Verified: fire frame VIEWed on BOTH routes (fist foreshortened straight at
  the camera, was up beside his head); flight vector measured at 3 ranges, all
  yaw 0.0°; full detach->fly->reattach cycle driven in a REAL battle (detach
  frame 15, socket shown, `[body,fistR,fistL]` visibility `[true,false,true]`,
  reattach frame 124, all restored); socket + flying fist + attached fist all
  VIEWed; two-titanus + viper ace soak crash-free (each fighter's split is
  independent — geometry and materials are cloned per build); titanus-only
  attackmatrix ALL CONNECT; `vite build` green.
## Tempest: alternating arc bolts, an outward-only T, faster/longer spin (user request, 2026-07-25)

- Manifest: Tempest's muzzle `rot`s re-authored again from the anchor editor
  (offsets/bones unchanged) — R `[-21.66, -53.52, -99.77]`, L
  `[-93.89, -22.56, -137.64]`.
- **Ranged trades hands.** `lightning` joins `mortar`/`slime` as a twin-side
  weapon in `doRanged`: each shot toggles `_altSide` and plays the mirrored
  `shootL` clip, and the `lightning` handler in world.js now spawns from
  `muzzleL` on those shots with its own `dirFrom` barrel deflection (the
  frogger/cranky pattern). Measured over 8 shots on BOTH routes: bolt origin
  is exactly on the firing hand's muzzle (distance 0.000 to it, ~5.0 to the
  other) and the clip alternates `shoot`/`shootL` every shot.
- **The heavy raises OUTWARD, not up, and does it on the first turn.** The T
  now lands at t=0.26 — the same frame `heavySpin` starts — instead of 0.30,
  and every launch eased `outCubic` instead of `outBack`: outBack overshoots
  ~10% past the key, which on a 16 -> 92 roll peaked near 100 and read as the
  arms swinging UP over the shoulders. The T itself is unchanged (roll
  −92/+92, zero pitch, straight elbow — measured flat on both routes).
- **Spin +20% faster, +35% longer.** `heavySpin` rate 24 -> 28.8 rad/s and
  the window 0.26–0.86 -> 0.26–1.07 (0.60s -> 0.81s). Clip `dur` 1.0 -> 1.22
  to carry the recovery, four pumps instead of three (T at 0.26 / 0.46 / 0.68
  / 0.90), an extra whoosh at 0.90, and hit beats re-seated on T frames
  (0.46, 0.68 — still two, damage untouched). `heavyDrive` stretched to match
  (t1 0.82 -> 1.03) so the tornado travels for as long as it turns, and the
  hardcoded tornado-aura window in fighter.js widened to 1.1.
- Measured in a live battle: 2.29 -> 4.0 total turns over the move; the
  attack-state lock (clip dur × 0.9 = 1.10s) still outlasts the drive window.
- Verified: T frames frozen and VIEWed at t=0.26 / 0.30 / 0.68 / 0.90 on GLB
  and 0.26 / 0.90 under `?debug=fallback` — dead flat, hands at shoulder
  height, no rise over the shoulders; `shoot` / `shootL` poses VIEWed as
  mirror images; ace soaks crash-free tempest/viper, tempest/titanus
  (fallback) and colossus/frogger (the other twin-side weapons touched);
  `vite build` green.

## Rhino: custom rig + re-skin, replacing the Tripo auto-rig (user request, 2026-07-25)

- `src/mechs/rigs/rhino.rig.js` (new, registered in `rigs/index.js`, manifest
  `"rig": "rhino"`): 29 hand-placed bones whose names ARE the game joints, so
  the retarget drives real limbs. Drops 15 `boneOverrides` and **67 skinOps**.
  The old Tripo config is preserved verbatim as the manifest `alt` entry, so
  `?debug=models` can still A/B it (and `tools/cliptear.mjs rhino alt` audits it).
- Shape, per the model and the owner's note: the HEAD is the horned structure
  on the FRONT of the chest (pivot at the neck, `horn`/`jaw`/`earL`/`earR` tips
  carry the skull), and the SHOULDERS sit at ear height (y≈0.78). `hump` holds
  the back spikes, `pauldronL/R` the shoulder caps, `belly`/`hipPadL/R` the
  waist armour that the arms would otherwise steal.
- The Tripo mesh is ONE closed shell with the inner arms welded to the hips
  through a membrane across the air gap. Rigidly split, that membrane fanned
  into a metre of shards on any raised arm (the uppercut dragged a visible
  sheet). Three opt-in additions to `reskin.js` handle it, all default-off so
  cranky/fenrir/glacier/jerry are untouched:
  - `cutWelds` — drop triangles whose ends sit on bones 3+ links apart (arm to
    hip, fist to knee): welds no joint can explain. 631 triangles of 250k.
  - `cutPairs` — the same for pairs the distance rule can't reach
    (hips↔shoulder is only 2 links, via the torso).
  - `softSkin: <rings>` — relax weights along mesh CONNECTIVITY (not distance,
    which blends across the air gap and drags the pauldron on a hip turn) so
    the REAL joints bend instead of shearing.
  Orphan scraps left by a cut are dropped too; the cut runs once per geometry
  so `?rigedit` can't erode the mesh with every gizmo nudge.
- `tools/cliptear.mjs` (new): tear audit that poses a mech through all 80 game
  clips and measures seam elongation, with `alt` to compare against the entry a
  rig replaced. Verdict — worst stretch across every cross-bone seam:
  **+0.15 mesh units / 76x (new) vs +0.28 / 731x (old Tripo rig)**, and
  `tools/weightaudit.mjs` reports 0 far-blend verts.
- `tools/stretchaudit.mjs` swept ZERO bones on every custom-rig mech (it read
  `boneOverrides`, which a rig entry doesn't have) — fixed to use the game
  joints for those, so cranky/fenrir/glacier/jerry/rhino are actually audited.
- Muzzle anchors: the hand-bone anchors were authored against the Tripo hand
  bones, so they were re-derived numerically for the new bones — same barrel
  origin and aim axis relative to the geometry (verified: markers still sit on
  the fists, and the ranged shot still leaves the barrel at +1° with the
  glbanim leveling hook untouched).
- Known limit, unchanged from the old rig: the two-handed overhead smash
  (`heavy` at its peak) still stretches the chin-to-chest surface — that weld
  is on the model's front centre line, where a cut would open a visible cavity.
- Verified: rest/back/walk/uppercut/heavy/shoot frames VIEWed; bone-ownership
  maps checked per limb; `?rigtest` and the 12-mech showcase clean; ace soaks
  crash-free (rhino/titanus 1v1 and a 4-way with cranky+glacier+viper);
  `vite build` green; cranky/fenrir spot-checked unchanged.
## Titanus throws ALTERNATE fists (user request, 2026-07-25)

- The rocket fist now swaps hands shot to shot, both the animation and the
  geometry. It rides the twin-cannon machinery that colossus/frogger/tempest
  already use: `'fist'` joins the `twin` list in `Fighter.doRanged`, so
  `_altSide` flips per shot, and the chosen side is stamped on `_fistSide` for
  the weapon handler.
- Mirrored clips are generated, not hand-authored: `fistLaunchL` /`fistCatchL`
  come from the existing `mirrorRaw` helper (swap L/R joint names, negate y/z),
  the same way `braceL`/`shootL` are made. Roster gains `rangedClipL`, and the
  clip picker prefers it when `_altSide` — previously `def.rangedClip` short-
  circuited the whole side-aware branch, so a mech with a named ranged clip
  could never mirror it.
  · Measured rather than eyeballed, because a front-on render of a punch aimed
    at the camera is genuinely ambiguous: at the fire frame `fistLaunch` puts
    the RIGHT arm at pitch -4.5°/yaw +6.3°/reach 3.28 with the left retracted,
    and `fistLaunchL` puts the LEFT arm at -4.5°/-6.3°/3.28 with the right
    retracted. An exact mirror.
- The GEOMETRY follows the side too — `fistsplit.js` already cut both hands, so
  this is just plumbing the side through: `launchFist(side)`, `catchFist(side)`,
  `reachForFist(pos, side)` (plays the matching catch), `snapshot(side)`, and
  `p.fistSide` so the projectile tells the owner which hand to re-dock.
- `_fistOut` became a Set of sides. A throw is refused only when BOTH fists are
  away, and if strict alternation lands on a hand that is still in flight he
  throws the other one instead of skipping the shot. The round-reset restores
  every side that is out.
- Fixed on the way: the aim was still ranged off `muzzleR` for a LEFT throw, and
  mid-clip the right arm is retracted behind him, so his left-hand shot left 7°
  flatter than his right (-0.8° vs -8°). `fireRanged` now resolves the
  alternating barrel BEFORE it ranges the shot, extending the existing
  `rangedMuzzle` primary-barrel lookup from per-mech to per-shot.
- Verified: four consecutive throws in a REAL battle alternate L,R,L,R with the
  matching clip each time (`fistLaunchL`/`fistLaunch`), the matching geometry
  group hidden each time (`[body,fistR,fistL]` = `[t,t,f]` then `[t,f,t]`), the
  muzzle on the matching side (x -2.7 vs +2.7), and every throw leaving at yaw
  0.0° with pitch -7.5°..-8° on BOTH hands after the fix; both fists restored
  and `_fistOut` empty at the end; left punch VIEWed from 3/4 (arm horizontal,
  knuckles leading); titanus attackmatrix ALL CONNECT; ace soaks crash-free
  (titanus/viper, and two titanus + glacier so both fighters' splits and both
  hands are exercised at once); `vite build` green.

## Rhino: back to the Tripo rig (user call, 2026-07-25)

- Owner judged the hand-authored rig worse in play, so `public/models/manifest.json`
  puts rhino back on his ORIGINAL config: 15 `boneOverrides` + 67 `skinOps`, no
  `rig` key, and the muzzle anchors exactly as the owner authored them against
  the Tripo hand bones (`R` offset [0.224,0.102,0.221] rot [-91.5,-27.15,-163.29],
  `L` offset [-0.349,0.087,0.042] rot [-104.21,15.35,167.89]).
- The custom rig is PARKED, not deleted: `src/mechs/rigs/rhino.rig.js` and its
  registry entry stay, and the whole custom-rig entry now sits in the manifest
  `alt` block — so `?debug=models` still A/Bs the two and swapping back is one
  key (`"rig": "rhino"` on the primary, drop boneOverrides/skinOps).
- `modelScale` is unaffected: the pin (8.12531) was derived from the TRIPO rig,
  and the pin wins over the head match either way, so rhino's rendered height is
  identical before and after this revert (the custom rig would have head-matched
  to 8.96 unpinned — the pin is exactly why a rig swap can't resize him).
- The ranged-shot arm leveling (glbanim `RHINO_LEVEL`/`RHINO_LEAD`) was measured
  on this rig originally and still holds: barrel elevation at the fire frame is
  +0.6°, unchanged from when it was tuned.
- reskin.js keeps `cutWelds`/`cutPairs`/`softSkin` (all opt-in, all default-off,
  now used by no shipped rig) and `tools/cliptear.mjs` stays — they cost nothing
  parked and are what any future re-rig of a welded service GLB will need.
- Verified: rest + uppercut frames VIEWed (Tripo skinning back), muzzle aim
  probe +0.6° at the fire frame, ace soak rhino/titanus crash-free,
  `vite build` green.

## Rhino: alternating hand cannons + a striding bull rush (user request, 2026-07-25)

- ALTERNATING RANGED. The twin-weapon machinery already existed (`_altSide`
  toggle, mirrored clip, `_shotSide` stamp read by the weapon handlers) — rhino's
  `shell` type simply wasn't in it. Three lines: `shell` joins the `twin` list
  (alternate side per shot) and the `mirrored` list (left shots play `shootL`),
  and world.fireRanged picks `muzzleL` on a left shot the way it already does
  for a thrown fist, so the aim ranges off the barrel that is actually firing.
  Measured in an ace battle: 33 shots, `LRLRLRLR…`, 17 left / 16 right, both
  clips playing. Barrel elevation at the fire frame is +0.6° on the right and
  −0.5° on the left, so the glbanim leveling hook covers both arms unchanged.
- BULL RUSH LEGS. `chargeLean` only keys the upper body, so the legs came from
  the locomotion layer — which was fed `speed: canMove ? spd : 0`, and `canMove`
  is false in a rooted state. He crossed the arena with dead legs. `canMove ||
  this._charging` fixes it: a charge IS travelling under its own power, so the
  locomotion layer runs its speed-matched stride while the clip keeps the horn
  down and the arms cocked (it keys torso/head/hips/shoulders/elbows). Measured
  mid-rush: thighs alternating −70°/+13°, knees pumping, torso held at +32°.
- FOOTFALLS. The stride is speed-matched, so the animator's gait phase says
  exactly when a foot plants — every half cycle. The rush tick watches it and
  drops a dust burst at the planting ankle plus a thud and a small shake, so
  the stomps land ON the steps at any charge speed instead of on a timer.
- STAMPEDE (his ult) drives the body forward in the same carriage with the same
  clip, so it sets `_charging` too — otherwise the ult would still skate while
  the special strode.
- Note for the owner: both hand cannons are authored splayed ~10° OUTWARD (the
  `rot` on each muzzle anchor), so alternating now scatters shots left/right by
  that much. Characterful, but say the word and I'll zero the yaw.
- Verified: both shot poses and two stride phases VIEWed; ace soaks crash-free
  (rhino/titanus, and a 4-way with nullbot/colossus/viper); `vite build` green.
## Titanus: punch aim, heavy double-motion, fist return hand, arm interior (user request, 2026-07-25)

Four reports off the ?debug=models workbench, all real, none of them a workbench
artifact — the workbench was showing shipping behaviour correctly.

- **Light punch went through his own body.** Not the clip and not a missing
  target: the no-target phantom was already correct (measured `preyAz` = 0,
  dead ahead, and the two preview mechs are already flagged allies so neither
  aims at the other). The culprit was `clampPalmsTo`, which SQUEEZES BOTH PALMS
  together onto the victim — right for a two-fisted pound or a body-slam carry,
  badly wrong for a one-armed haymaker, because rolling both shoulders inward
  (up to 1.3 rad) hauls the punching arm across his chest. Measured: the fist
  ended up at yaw 141° with the hand 2.2 units BEHIND the shoulder.
  · Clips now declare `strikeArm` ('L'/'R') when a blow is one-armed —
    light1/2/3, bigPunch1/2, punchHold1/2, punchRelease1/2, fistLaunch/L,
    fistCatch/L — carried through `compile()` and FLIPPED by `mirrorRaw`. For
    those, `aimStrikeAt` steers off the striking fist rather than the midpoint
    of both palms (with the idle arm at the hip that midpoint sits inside his
    own chest, and its azimuth said nothing about where the punch was going),
    and the two-fisted squeeze is skipped entirely. There was precedent for
    exactly this shape: `_oneArmLift` already skips the squeeze for the
    one-hand giant lift.
  · After: the fist peaks at yaw 40° with the hand 2.5 units in FRONT.
- **Heavy did a double motion.** Two causes, both fixed.
  · The strike-aim window ran for `dur * 0.95` — 0.665s of a 0.7s clip whose hit
    lands at 0.18s. So the twist servo (pinned at its -40° cap) and the palm
    clamp kept working through the whole follow-through, dragging the arms back
    around behind him after the slam: a second, unmotivated wind-up. It now ends
    a short tail past the clip's own `hit` event — there is nothing to steer once
    the blow has landed.
  · `_palmFix = 0` on window close SNAPPED the arms back onto the clip pose in a
    single frame. Both the clamp and the twist now unwind (x0.72/frame), with a
    new `applyPalmRoll()` that applies the banked roll WITHOUT servoing it —
    `clampPalmsTo` both applies and grows the fix, so it cannot let one go.
  · The hold clip is also played with a 0.02 fade instead of 0.07: a tap only
    holds for CHARGE_MIN_WINDUP (0.15s), and between the fade and the animator's
    own pose smoothing (26/s) the raise was still short when the release fired,
    so the release clip — whose t=0 IS the raised pose — finished lifting the
    arms before slamming.
- **The fist always came home to muzzleR.** `projectiles.js` boomerang homing
  hardcoded `joints.handR`; it now homes on `hand${p.fistSide}`. Verified by
  tracking the returning fist: thrown left it closes on the left wrist (0.92 vs
  7.68 units), thrown right on the right (0.84 vs 6.61), with the matching catch
  clip each time.
- **Interior showed through the elbow/shoulder** while the fist was away. The
  dark BackSide layer only covered the wrist region (2061 triangles), but with
  the fist gone you are looking down an open tube and the walls are the forearm
  and upper-arm shells. The pair spec gained an `interior` bone list, so the
  layer now covers the whole limb — hand + fist + elbow + shoulder, 16842
  triangles. (Preferred over the suggested fill-plane: the cut is jagged at
  triangle scale across ~20 separate armour plates, so a plane either gaps at
  the rim or pokes through it, while a backface layer cannot do either.)
- Verified: light and heavy contact sheets VIEWed frame by frame in the
  workbench (punch extends forward with the impact glow; heavy reads raise ->
  slam -> settle, no second wind-up); per-frame servo traces before/after;
  return-hand probe PASS on both sides; socket VIEWed from three angles, opaque;
  melee still lands (titanus/viper and colossus/aegis ace soaks both resolve to
  a KO, and hit resolution is range-based — `reach = atk.range` — so the palm
  clamp was always cosmetic); attackmatrix connects for every alternating-side
  and hold-charge mech (titanus/viper/glacier/colossus/frogger/tempest), the one
  `viper ranged: 0` being the full-suite flake (27/27/54 in isolation);
  `vite build` green.

## Light combos alternate arms, uppercut included (user request, 2026-07-25)

- The shared punch trio was authored jab-LEFT, cross-RIGHT, uppercut-RIGHT, so
  the right arm threw two blows back to back and the uppercut was always the
  same hand. Now the combo ALTERNATES arms and the uppercut is simply the step
  it lands on: `light1 → light2 → light3` becomes L,R,L — and the lead flips
  from combo to combo, so the next one runs R,L,R and the uppercut comes out of
  the other arm.
- Mechanism: `animations.js` mirrors the trio (`light1R`, `light2L`, `light3L`
  via the existing `mirrorRaw`) and exports `LIGHT_ARM`, which says which arm
  each clip throws with and what its twin is called. `Fighter.doLight` computes
  the arm it WANTS for this step (alternating from a persistent `_leadArm` that
  flips on each new combo) and swaps in the twin when the authored clip uses the
  other hand. Verified over four combos: `light1R light2L light3` then
  `light1 light2 light3L`, repeating.
- Applies to every mech on the shared trio (rhino, nova, tempest, fenrir,
  wraith, inferno, glacier, cranky, frogger, jerry, nullbot, vulcan…). A mech
  with a BESPOKE cycle is untouched, because its clips aren't in `LIGHT_ARM` and
  have no mirrored twin: viper's sword forms, aegis' spear stabs, saurion's
  kick/rake mix all play exactly as authored. Titanus/Colossus already
  alternated their haymakers through the charge-and-release path, which never
  reaches this code.
- Nothing about the hit changes: the strike is a sphere in front of the fighter,
  and mirrorRaw copies the clip's events, so damage, knock, launch and combo
  timing are identical — this is purely which arm you see throw it.
- Verified: left uppercut frames VIEWed on rhino and nullbot (clean mirror,
  full extension, correct chamber); ace soaks crash-free rhino/titanus,
  nullbot/viper, cranky/fenrir; `vite build` green.
## Titanus: alternating light arms, GLB charge tell, and the pound stutter (user request, 2026-07-25)

- **The hold-charge light attack always used the same arm.** `_punchIdx` was
  `comboIdx % 2`, but `updatePunchHold` bumps `comboIdx` on release WITHOUT ever
  opening a `comboWindow` — so the combo-expiry reset (`comboWindow <= 0 =>
  comboIdx = 0`) zeroed it on the very next frame and every punch came from the
  left. It now rides its own persistent flip. Verified: four punches go L,R,L,R
  with `punchHold1/2` + `punchRelease1/2` matching, and the arm that actually
  travels furthest matching too. (Affects COLOSSUS as well — same `punchHold`.)
- **The red charge tell never showed on GLB bodies.** `ensureChargeShells`
  traverses the virtual JOINTS for meshes and clones each part inflated 4.5% —
  but a GLB has no geometry on its joints at all, it is one skinned mesh riding
  bones, so the traverse found nothing and the tell silently did not exist.
  New `src/mechs/glbshell.js` builds the equivalent out of the skinned mesh: the
  triangles riding the charging limb's BONE SUBTREE (so shoulder also picks up
  elbow/hand/fist, matching what the procedural joint traverse covers), sharing
  the mesh's vertex buffers, skeleton and bind matrix. Coincident with the
  surface rather than inflated — inflating would need its own displaced vertex
  buffer — so it carries a negative `polygonOffset` and never z-fights.
  · Cached per key and HIDDEN rather than rebuilt per wind-up: its geometry
    shares the body's attributes, so it must never be disposed (that would free
    the real mesh's GPU buffers), and re-deriving a 17k-triangle index buffer
    every charge is pure garbage.
  · `fistsplit.js` now imports `subGeometry` from there instead of keeping its
    own copy.
  · Verified: sheath appears on the charging arm, follows the alternating side
    (`armL`/`armR`), ramps #ff2818 -> #ff8850 at the cap, peak opacity 0.66 —
    and screenshotted side by side against `?debug=fallback`, matching.
- **The pound "stutter" was two things, both now fixed.**
  · A hold->release handover CROSS-FADED. The animator keeps a single `action`,
    so `play()` REPLACES the hold and the new clip's weight ramps up from the
    BASE STANCE, not from the outgoing clip — at weight 0.24 the pose is
    three-quarters resting stance. Measured, the shoulder went -167 -> -116 ->
    -103 -> -145 before the slam: the arms dipped back toward his sides and
    climbed again. Release clips are authored so their t=0 IS the hold pose, so
    both the heavy and punch releases now take `fade: 0` and continue seamlessly
    (the animator's own pose smoothing still eases it).
  · The wind-up parked PAST the fist's apex. Swept the pound pose: the fist peaks
    at shoulder pitch **-124**, but the clip held -172/-176 — 0.95 units below
    the apex and 2.83 units behind him. So the slam had to lift the fists back
    over the top before descending. `poundHold`/`poundSlam` now wind up to
    -142/-146, which keeps the arched-back read (fist still 1.6 behind) while
    sitting essentially at the apex.
  · After: fist height rises once to the apex, trembles +-0.2 (the clip's
    deliberate "quaking"), then descends monotonically into the slam. The 1.44-
    unit dip is gone.
- Verified: heavy contact sheet VIEWed (single rise -> held arched wind-up with
  the tell -> single slam); per-frame fist-height and animator-target traces
  before/after; ranged alternation + detach + aim unchanged (L,R,L,R, yaw 0.0°);
  ace soaks crash-free and resolving to KOs for titanus/viper and
  colossus/aegis (both hold-charge mechs); attackmatrix connects for every
  alternating-side and hold-charge mech, `titanus ranged: 0` being the usual
  full-suite flake (92/92 in isolation); `vite build` green.
  · Probe note for the next session: the workbench's own render loop steps the
    world, so a probe that also calls `world.update` double-steps and
    manufactures jitter — set `engine.onUpdate = () => {}` first. `Input.readIntent`
    likewise overwrites `intent` every frame, so held-button probes must stub it.

## Titanus skin update #3 (user-supplied, 2026-07-25)

- 82 skinOps replacing the previous 71 — a clean SUPERSET: all 71 kept verbatim,
  plus 11 new ops refining the shoulders (5), head (2), torso (2) and the back
  exhaust stacks (2). The fist selection is untouched (65 fist ops, 30 R / 35 L),
  so the rocket-fist cut is unchanged by construction.
- Applied as a targeted text edit to the PRIMARY skinOps array only — the `alt`
  entry's 101 legacy Tripo ops (6-space indent) are deliberately left alone, and
  `rig`/`modelScale`/`muzzles`/`alt` are asserted intact before the write.
- Side benefit: because the new ops move more geometry onto the shoulder bones,
  the rocket fist's dark interior layer (which covers the whole arm chain) grew
  from 16842 to 19454 triangles on the right and 19070 on the left — slightly
  better coverage of the open socket, for free.
- Verified: stretch audit unchanged at 2 flagged / maxR 12.3 (still just the
  thigh-fist interleave tab), far-blend 0 verts, skin audit 0 flagged; fist split
  unchanged (9248 R / 9143 L tris, separation 0.923/0.931, detach->attach
  visibility correct); idle, the overhead pound wind-up and the punch release all
  VIEWED with the shoulders/pauldrons intact under extreme rotation (that being
  where the new bindings are); ranged alternation still L,R,L,R at yaw 0.0° with
  both fists restored; ace soak crash-free; `vite build` green.
  · Probe note: `battlefist.mjs` only watches the RIGHT fist, so now that he
    alternates it reports a false "never detached" on a left-hand throw — use
    `alt.mjs`, which follows the side.

## Uppercut lands in FRONT of the body, on the centreline (user request, 2026-07-25)

- `light3`'s strike swung the arm to −150° shoulder pitch — past vertical. Measured
  on the rig, the fist finished **0.16 units in front of the hips and 5.1 up**:
  directly over his own shoulder, which is why it read as raising an arm rather
  than punching. The torso also arched AWAY from the blow (−24° pitch).
- The strike frame now drives the fist through the same place the jab and cross
  land, only higher, with the twist unwinding the shoulder into it:
  `torso −14°`, `shoulderR [−80, 24, 0]`, `elbowR −25°`.
- Measured fist at the hit frame (body-local: fwd from hips, lat +/− off centre, up):

  | clip | before | after |
  |---|---|---|
  | light1 jab (L) | fwd 3.08 lat −0.98 up 2.01 | unchanged |
  | light2 cross (R) | fwd 2.94 lat +1.29 up 2.10 | unchanged |
  | light3 uppercut (R) | fwd **0.16** lat −0.89 up 5.12 | fwd **2.84** lat **0.04** up 2.87 |

  So it now reaches as far forward as the punches (2.84 vs ~3.0), sits dead
  centre instead of crossing to the far side, and still rises ~0.8 above the
  straight-punch line — a rising blow into the same target, not a shoulder press.
- Holds on every rig, since the clip is shared: nullbot GLB fwd 2.87 lat 0.39 up
  3.08, procedural rhino fwd 3.08 lat −0.34 up 2.97. `light3L` mirrors exactly.
- Solved by grid-searching the strike-frame shoulder/elbow/torso against the
  measured fist position rather than eyeballing degrees — the joint that reads as
  "up" also swings the arm behind the shoulder past vertical, so the numbers are
  not guessable.
- Gameplay untouched: damage/knock/launch and the strike volume are unchanged.
  The one-armed strike servo (`strikeArm: 'R'`, aimStrikeAt) now has a fist that
  actually travels down the target line, so its steering reads better too.
- Verified: strike frame VIEWed front + side on rhino and on nullbot; ace soaks
  crash-free rhino/titanus, nullbot/glacier, fenrir/viper; `vite build` green.
## Tempest heavy: the T was being flattened by the strike servo (user request, 2026-07-25)

- The T looked right in the showcase and WRONG in battle, and the clip wasn't
  the reason. Every heavy calls `trackStrikeVictim`, whose `clampPalmsTo`
  servo converges the palms onto the victim — up to 1.3 rad of shoulder roll,
  applied AFTER the animator's pose. Traced by instrumenting the shoulder
  Euler: the animator applied roll −83°, and `aimStrikeAt → clampPalmsTo`
  dragged it back to −24° in the same frame. That servo is built for a
  two-fisted pound; on a whirl whose whole shape is arms-out it eats the pose.
- New roster flag `heavyNoStrikeAim` (tempest only) skips the strike tracking
  in `doHeavy`. Measured in a live battle, same frames: peak shoulder roll
  −32° → −88°, hand spread 4.7 → 7.1 units.
- Each T is now keyed TWICE (0.26+0.30, 0.46+0.50, 0.68+0.72). Without the
  dwell the target starts falling the instant it arrives and the animator's
  26/s pose-chase only reaches ~−83 of the −92; with it the pose saturates —
  full extension at t≈0.30, well inside the first revolution (which ends at
  0.26 + 2π/28.8 ≈ 0.48). The drop between passes still swings the hands from
  y 1.7 down to y 0.3.
- Verified: in-battle frames frozen at t=0.30 / 0.42 / 0.50 with the hip whirl
  subtracted so the arm pose is judgeable, and VIEWed — dead-flat T at 0.30,
  arms lowered at 0.42; per-frame roll/spread trace above; ace soaks
  crash-free tempest/viper, tempest/titanus (`?debug=fallback`) and
  titanus/aegis (a heavy that still uses the strike servo); `vite build` green.
## Walk foot-plant: GLB feet stop pushing off air (2026-07-26)

Reported as "Titanus feels like he's floating when walking… as if he were
pushing off the air instead of the ground". Measured, and he was doing the
opposite AND the same thing: his sole spent most of the cycle **0.76 units
UNDER the floor** and then hung in the air on the other beat. Both symptoms are
one cause — the gait rotates joints and nothing ever checks where the sole
actually ended up.

- Root cause 1 — **ankle amplitude is authored for the procedural foot.** The
  engine assumes the sole sits `0.32 * scale` under the ankle (the same number
  `groundOffset` is derived against). Titanus' boots put it 1.221 there against
  an assumed 0.410 — 2.98x — so the walk's ~0.66 rad plantar-flex toe-off drove
  the sole three times as far as intended. Measured over the roster: viper
  2.89x, rhino 2.58x, colossus 2.13x, aegis 4.14x.
- Root cause 2 — **a long sole plate can't be pitched at all.** Titanus' foot is
  3.4 units long and 1.22 deep, pivoting at a joint above and behind it, so ANY
  pitch (from the ankle, the knee or the body's forward lean) buries a corner
  ~0.6-0.7 units regardless of direction.
- Root cause 3 — **no foot ever met the ground on purpose.** `mech.groundClamp`
  existed but was wired only to prone/dead; the comment claiming "upright
  stances keep the retarget's own per-foot grounding, which is already correct"
  was simply false — every GLB was off by 0.1-1.0 units at some point in its
  cycle.

Fix, all in `Animator` (+ two helpers), procedural bodies untouched by
construction:

1. `calibrateFeet()` (new, called once from `createMech` after the retarget
   adapter exists) measures the real ankle->sole depth off the skinned foot
   geometry — not the bone, which on some rigs sits inside or below the boot —
   and stores `ankleGain = clamp(0.32*s / depth, 0.25, 1)`, `footFlat`, and a
   couple of dozen **sole sample points in the ankle bone's own frame**.
2. The gait scales its ankle roll/toe-off by `ankleGain`, so every body rolls
   through the same amount of GROUND rather than the same radians.
3. `footFlat` levels the sole against the pitch the chain above it contributes
   (`hips + thigh + knee`, deltas over rest), run AFTER `hipsRot` is set so the
   body's forward lean is included. The authored roll then rides on a level
   plate. Fades in as the foot outgrows the convention, so a normal foot is
   unaffected.
4. **Pelvis follows the feet**: `soleClearance()` transforms the sole samples by
   the ankle bones' world matrices (~48 point transforms/frame, no skinned-mesh
   walk) and the walk takes last frame's clearance out of the hip height,
   damped at 20. 1:1 correction, so no gain to tune. Walk/run only — clips,
   ducks, dashes and jumps ease the bias back out.
5. Quadrupeds (`gait: 'quad'`) opt out entirely: a wolf's hock is not a boot.

Measured lower-foot dip / hover over a cycle at speed 4, before -> after:
titanus -0.779/0.111 -> -0.096/0.081 · rhino -0.444/0.226 -> -0.112/0.084 ·
colossus -0.326/0.417 -> -0.161/0.050 · aegis -0.323/0.487 -> -0.154/0.081 ·
jerry -0.978/1.294 -> -0.276/0.566 · nullbot -0.124/0.419 -> -0.148/0.113 ·
glacier -0.527 -> -0.293 · vulcan -0.608 -> -0.278 · fenrir unchanged (quad).
Every mech's dip improved; the two stragglers are pre-existing outliers whose
rigs mis-report a foot (nova's degenerate measurement, saurion's digitigrade
hock, whose toes are not in the ankle subtree). Verified with walk screenshots
VIEWED at four phases (sole flush, both feet flat), ace soak crash-free,
`vite build` green.
  · Probe notes: `footplant.mjs` (true skinned sole height per frame),
    `footdepth.mjs` (ankle->sole depth vs the assumed 0.32*s),
    `plantall.mjs [speed] [raw]` (roster sweep; `raw` resets the calibration
    in-page so before/after is one run apart), `bootbox.mjs` (the boot's box in
    its ankle bone's frame), `gaitmap.mjs` (phase -> joint -> sole trace).

## CRANKY rolls right over onto his back on a big hit (user request, 2026-07-26)

A launching blow used to do one thing to everybody: the shared `knockdown`
sits you DOWN — hips back, knees up, propped, ready to push straight off the
floor. On a wide top-heavy crab, a fully wound COLOSSUS haymaker landing like
that reads as far too polite. New opt-in roster flag `rollover` (CRANKY only
so far): a hard enough hit turns him CLEAN OVER instead — barrel-rolls him
about his own facing axis until the carapace is on the pavement, every limb at
the sky, stranded there until he rolls himself back upright.

**The threshold** (`ROLLOVER_*`, fighter.js) is read off the damage the blow
actually DEALT as a fraction of max HP — so armour, guard chip and any damage
buff are already in the number and the curve needs no per-attacker tuning.
Rolled once, at the LAUNCH, so the whole flight is committed to the landing
that follows. Calibrated against CRANKY (1300 hp, 0.26 armour) to the brief:

| blow | raw | dealt | frac | odds |
|---|---|---|---|---|
| VIPER light3 (even buffed) | 40 | 30 | 2.3% | **0%** |
| VIPER heavy | 70 | 52 | 4.0% | 0% |
| COLOSSUS light3, uncharged | 62 | 46 | 3.5% | 0% |
| COLOSSUS light3, FULL charge | 130 | 96 | 7.4% | **49%** |
| COLOSSUS heavy, FULL charge | 160 | 118 | 9.1% | **79%** |

Sticky while he's down (a light poke can bounce him around but never quietly
set him back on his feet), and capped at 0.9 — never a certainty.

**The clips** (animations.js): `flipOver` (one-shot hold — contact, past the
point of no return, carapace hits and rocks PAST level, settles), `proneBack`
(loop — the shell rocking on its curve, claws pawing at air), `rollUpR` +
its `mirrorRaw` twin `rollUpL`. The roll axis is `hipsRot.Z`, the mech's own
FACING axis, so he ends up inverted while still pointing where he pointed — a
pitch about X (what the shared knockdown does) lays a wide flat crab out on his
tail-end, not his back. Two rules the family lives by:
- **Winding.** ±180° is the same pose but not the same number, and the pose
  smoother lerps numbers. The prone loop sits at +180, the right-hand recovery
  unwinds 180 -> 0, the left-hand one runs -180 -> 0 after the fighter re-winds
  the smoother (new `Animator.rewrap`). Both END at 0 — a recovery finishing
  anywhere else stands the body up facing somewhere other than its own yaw.
- **`proneBack` keys no leg joint.** That is what leaves the legs to the
  locomotion layer, so a stranded mech's legs still answer the stick.

**Legs keep moving while he's stranded**: the fighter feeds the STICK itself in
as the animator's speed while `_onBack`, so the walk cycle (for the GLB, the
hexapod tripod gait) runs with the body going nowhere — probe-verified,
`_walkK` 0.00 on a neutral stick and 0.94 with a direction held.

**The player picks the recovery direction**: whatever they're holding when the
recovery comes up is the flank he goes over, and the roll DRIVES him that way
for the length of the clip (`ROLLOVER_ROLL_DRIVE`) so he travels out from under
whoever floored him. Only the lateral half of a press can be honoured — a body
rolling about its own facing axis travels sideways and nowhere else — so a
straight forward/back press takes him over his right. Mashing jump starts the
roll early; there is no escape-spring while upside down.

Rest of the plumbing: the CRANKY GLB profile stands its crab rules down while a
`PRONE_CLIPS` clip is playing (the walk carry would flatten the prone hips back
to level, the no-droop arm floor is meaningless on a body whose claws point at
the sky, and the one-shot flip/roll would otherwise be read as an ATTACK and
pick up a pincer wind-up); same gate on the signature's jaw snap.

Verified: showcase screenshots of all three clips VIEWED (flipped shell down,
legs up, claws splayed; mid-roll on the flank; standing square at the end), a
scripted battle capture through the whole launch -> flip -> prone -> roll ->
normal sequence with `groundClamp` seating him on the pavement, both roll
directions picked correctly from the stick, ace soak crash-free (cranky vs
colossus AND a non-rollover pair), `vite build` green.

## Workbench chrome: names, colours, one mech picker, alt everywhere (user request, 2026-07-26)

Five workbenches shared one dark panel in one corner and looked identical, the
pose workbench had no way to reach a mech's ALTERNATE build, and the rig editor
was the only tool you switched mechs in by hand-editing the URL. All three are
now shared code rather than per-tool code.

`src/dev/panelui.js` (already the owner of the resizable panel + its
scrollbars) gained the `WORKBENCHES` registry and draws the title bar: pose
green, skin orange, animation purple, rig blue, hurtbox cyan, with a live
monospace subtitle carrying `mech · ALT · GLB|procedural`. A tool opts in with
`setupDevPanel(panel, { key, workbench })` and updates the subtitle from its
own `load()`. The collider's hand-rolled `HURTBOX WORKBENCH` line was the only
title that existed before; it now comes from the same place as the rest.

`src/dev/mechpick.js` is new and owns "which mech is this workbench on":
`mechSelect()` builds the roster dropdown (full ROSTER — workbenches see hidden
mechs), `gotoMech()` switches a load-time-only tool by rewriting the URL. The
RIG EDITOR uses both: it builds its whole world (raw GLB, hand-authored
skeleton, re-skin, undo stack) around one id at start-up, so a switch is a
navigation, and `gotoMech` drops the old mech's `&alt` on the way out since alt
is per-mech staging. Its blocker card carries the same dropdown — a mech with
no rig file builds no panel, so without a picker there the only way out was the
URL bar. The dropdown labels rig-less mechs `— no custom rig`, so a pick that
will hit the blocker says so first.

EDIT ALTERNATE GLB now exists on `?debug=pose` and `?debug=collider` as well as
`?debug=skin` / `?rigedit` (`?debug=models` reaches the same build through its
LEFT SLOT dropdown, which is a comparison, and keeps it). Both new ones rebuild
in place instead of reloading — they already swap mechs live — and both fall
back silently when a mech has no alternate: the checkbox disappears and `alt=1`
leaves the URL. The pose tool's clip list now reads the built mech's own
`animProfile` before the mech's default, so an alternate with its own
`profileKey` lists the clips it actually plays.

Verified: all five workbenches screenshotted and VIEWED (each header in its own
colour, subtitle live), colossus's alt toggled on in pose and collider (URL
gains `alt=1`, subtitle shows ALT, model rebuilds) then switched to viper (no
alt → control gone, param dropped), rig editor switched colossus → cranky →
tempest (blocker) → fenrir entirely from the dropdowns, joint click-select +
gizmo drag re-checked on the alt build (`elbowR` 73°), no page errors anywhere,
`vite build` green.

## Animation workbench: LEFT SLOT → COMPARE TO (user request, 2026-07-26)

Naming only, no behaviour change. The control that picks what stands beside the
mech under study said "LEFT SLOT" — a statement about screen geography rather
than about what the thing does — and its empty option said "Solo (this robot
only)". Now: label **COMPARE TO**, option **None (view solo)**, URL param
`&compare=` (`&left=` is still READ so old links and TRIPO_STATUS's example
keep working, but it is never written back — picking a value rewrites the URL
with `compare=` and drops the stale `left=`). Internals renamed to match
(`compareTo` / `setCompareTo`), and the help line's "Left = procedural" became
"Left = what you compare to · Right = this mech's GLB", since with an alternate
in the slot the left model is not procedural at all.

Verified: `?debug=models&mech=colossus&left=alt` still opens with Alternate GLB
selected, switching to None rewrites the URL to `compare=solo`, screenshots
VIEWED, no page errors, `vite build` green.

## Colossus alt skin ops + SLICE brush in the skin workbench (user request, 2026-07-26)

Two things, both about the same model.

COLOSSUS ALT SKIN: the owner's authored pass landed as `colossus.alt.skinOps`
in `public/models/manifest.json` — 14 ops, 11 by island (elbows, ankles, hips,
four torso blocks, head) and 3 by explicit vertex list (59 / 1235 / 2444 verts
onto hips + torso). The alt had no skinOps at all before this. Written with
`tools/manifestfmt.mjs`'s surgical splice, so the diff is the 16 new lines and
nothing else. (`--check` round-trip still reports a pre-existing difference on
an unrelated hand-formatted muzzle block; it read the same before this change.)

SLICE, a third paint brush, sits after Loop. Both lassos share every line of
machinery — the same drag, overlay, polygon containment, region constraint and
undo — and differ by ONE test: Loop skips back-facing verts so a tight lasso
paints only the surface you are looking at, Slice keeps them so the outline
cuts clean through the model and takes the near shell, the far shell and
whatever is buried between. That is the only way to re-colour geometry you
cannot see without orbiting to it (inside a shoulder housing, the back of a hip
block). It is a separate button rather than a modifier because painting through
the model is destructive in a way you should have to ask for; the lasso draws
AMBER in slice mode against Loop's violet, and the panel hint reads "left-drag
= slice through", so mid-drag you always know which one you're holding.
Scripting hook: `__skinTool.paint.brush('slice')` + `paint.lasso(pts)`.

Verified: same full-model lasso on one 4592-vert region — Loop took 2475 verts,
0 of them facing away from the camera; Slice took all 4592, 2117 facing away.
Screenshots VIEWED mid-drag (amber outline, Slice outlined amber in the panel)
and after (the whole soloed thigh block recoloured, both sides). Colossus alt
opens clean with its new ops in the skin, pose and rig workbenches, no page
errors, `vite build` green.

## Colossus alt skin, second pass (user-supplied, 2026-07-26)

`colossus.alt.skinOps` replaced with the owner's next pass: 30 ops, up from 14.
The first 14 are unchanged; the new 16 are all vertex-list selections — the
shoulder pads split out to `shoulderL`/`shoulderR` (2447 / 2708 verts), a
20927-vert torso consolidation, eleven small torso patches (1–25 verts each,
the leftovers a big selection misses) and forearm cleanups onto `elbowL` (772)
and `elbowR` (296). 31001 verts named across the list. A skinOps export is a
full replacement, not an append, so the list was swapped whole —
`tools/manifestfmt.mjs` splice again, 16 lines changed and nothing else.

Verified: 30 ops load in `?debug=skin&mech=colossus&alt=1`, torso reads as one
green mass with the shoulders now their own colour; default wiggle run on
shoulderR, elbowL and torso with textures ON — arms swing with their bones,
shells stay coherent, nothing trails or tears; the alt also opens clean in the
pose and animation workbenches. No page errors, `vite build` green.

## Colossus: giant-mode footwork, and the custom rig promoted to primary (user request, 2026-07-26)

### The giant walks like a giant now

COLOSSAL FORM scales colossus' group to 4×, but nothing told the animation
layer. Everything in animator.js is authored in the model's own LOCAL units, so
a 4× body kept its small-body timing over four times the distance: four strides
per stride's worth of ground, feet skating and jump-cutting between plants.
`Animator.sizeMul` (set from the ult's own `apply()`, so it eases in with the
growth and clears on the way out) fixes three separate expressions of that, and
they deliberately use two different laws:

  · WALK CADENCE — full 1/sizeMul. This is a CONTACT constraint: the stance
    foot has to sweep backwards at exactly ground speed or it skates, and the
    cadence formula already derives that from leg reach. Leg reach is now the
    real (grown) one, and the 14 rad/s ceiling scales with it.
  · LEG SMOOTHING + a hard angular cap (LEG_W_REF 6 rad/s) — 1/√sizeMul.
    Dynamic similarity: a big limb swings slower (√L, the same reason a giant's
    stride reads heavy). Attack clips keep their own timing — slowing the clip
    would slow the attack — so only the LEG channels are held back, which is
    what stops a stomp from throwing a foot across half a block. The lag alone
    wasn't enough (a smooth fast sweep sails through a first-order filter), so
    the hard cap is what actually holds; 6 rad/s sits above the 95th percentile
    of a normal-size colossus' leg motion, so it only ever catches the snaps.
  · PELVIS FOOT-FOLLOW — an outright bug the giant exposed. `soleClearance()`
    measures in WORLD units, `_footBias` is spent in LOCAL ones, and the
    comment promises a 1:1 correction. At 4× that loop was correcting four
    times what it measured: gain 4 doesn't converge, it rings, and that was the
    vertical buzz in the giant's feet. Divided back into local units, damped at
    the same √ law.

Also: the ult's "thundering footfalls" were a fixed 0.38s metronome — roughly a
normal mech's cadence, so it drummed out steps he no longer takes. They ride
the actual gait phase now, one per half cycle.

Measured with the new `tools/footprobe.mjs` (colossus, walking, world units/s):

    scale 1              cadence 0.888  foot med 8.78   p95 13.67  slip med 3.52
    scale 4 (sizeMul on) cadence 0.222  foot med 9.67   p95 13.79  slip med 3.09
    scale 4 (sizeMul 1)  cadence 0.888  foot med 23.35  p95 31.88  slip med 12.97

Cadence falls exactly 4× while body speed is unchanged, the foot ends up at a
normal-size foot's speed over a 4× longer stride, and the STANCE foot — the
honest skating measure, min(|v| of the two ankles) — is planted as firmly as at
normal size (3.09 vs 3.52) where before it was dragging at 12.97. On attack
clips the leg cap pulls the worst foot frame from ~4× a normal mech's peak down
to ~1.5×, and typical fast frames to ~3×: still fast for a giant, no longer a
jump cut.

### Rig swap

`colossus.alt` (the hand-authored `src/mechs/rigs/colossus.rig.js` build, staged
since session 7) is now the PRIMARY the game loads; the retired Tripo auto-rig
entry — 15 boneOverrides, 64 tripo-named skinOps — moved into `alt`. Both are
complete standalone entries, so they were swapped whole and each keeps its own
url/modelScale/bindPose/yawOffset, muzzles and skinOps. No glbanim work: the
colossus profile is `{}` on both skeletons (unlike vulcan, whose auto-rig
corrections had to survive as `vulcan_tripo`). Promoted carrying the owner's
third skin pass, 39 ops (+9: ankleR 2619v, ankleL 2280v, kneeL 492v, kneeR 416v,
five small ankle patches).

Verified: `cliptear` 98/98 clips clean, 0 far-seam edges, worst stretch +0.00
(the Tripo primary's worst was +0.34) · `hurtboxfit` 15/15 parts, containment
74% → 80% (upperArmL had no capsule at all before) though bloat 1.12 → 1.26, so
he is a slightly bigger target than he was — flagged, not tuned · `anchorkeep
colossus` PASS, every muzzle identical at rest (Δpos 0, Δaim 0°) · showcase walk
screenshot VIEWED · crash-free ace soaks on neon (vs viper) and steel (vs
titanus) · `?rigedit=colossus` now opens the primary directly instead of being
forced onto the alt, the retired build still loads under `&alt=1` with its 64
ops · `vite build` green.

## Pose workbench: the timeline became editable (user request, 2026-07-27)

The scrubber could only visit keys; the key LIST was read-only. Under it now
sits a KEY TRACK — one diamond per key, amber for the selected one, green for
any that differs from the shipped clip — and it is direct manipulation:

- DRAG a diamond to move that key along the timeline. The drag is clamped
  between its neighbours (MIN_GAP 0.01s), which is what keeps the list sorted
  without ever re-sorting it — `curKeyIdx`, which the whole editing path hangs
  off, stays valid mid-drag. The viewport follows the key, so what you watch
  reshape is the interpolation on either side of it.
- RIGHT-CLICK bare track → "New keyframe at t=…". The new key is EMPTY
  (`pose: {}`) on purpose: compileLive drops empty keys, so adding one changes
  nothing about how the clip plays until you drag a joint on it, and then only
  that joint is written. A key that snapshotted the whole interpolated pose
  would silently freeze every limb passing through — the exact thing the
  sparse-key rule exists to prevent.
- RIGHT-CLICK a diamond → "Delete keyframe (t=…)", or press DEL/BACKSPACE with
  it selected. The last remaining key is refused (a clip needs one).

THE DIFF HAD TO CHANGE FIRST. `editedKeyIdx`/`keyDiff` compared
`editClip.keys[i]` with `origKeys[i]` BY INDEX, which is fine while the only
edit is "change a pose in place" and nonsense the moment a key can be inserted:
key 3 is no longer the shipped key 3, and every key after an insertion reads as
edited. Keys now carry a stable `id` (assigned in buildEditClip, minted from
`nextKeyId` for hand-added ones, cloned through undo snapshots), and the diff
matches on it — so a dragged key is still recognised as itself, a new one
reports `addedKey`, a moved one `movedFrom: <old t>`, and keys the clip had but
the edit doesn't come out as `deletedKeys` in the export.

One real bug found while wiring the context menu: dismiss-on-click-away as a
capture-phase window listener sees the pointerdown on a menu ITEM before the
item does, so the menu deleted itself out from under the click that chose it —
"New keyframe" appeared and did nothing. The dismissal now ignores pointerdowns
inside the menu.

Verified headlessly on colossus/heavy (5 keys): right-click gap → key inserted
at t=0.08 (6 keys, reported edited) · dragged it to 0.23, clamped short of the
0.34 neighbour · DEL removed it and the diff went back to clean · right-click
on the shipped t=0.52 key → deleted, `deletedKeys` 1 · undo restored it exactly,
redo removed it, undo again restored · a dragged shipped key exported as
`changed: {movedFrom: 0.52}` and an added one as `changed: {addedKey}` ·
screenshots VIEWED (diamonds, selection colour, menu) · `tools/wbconfig.mjs`
PASS · `vite build` green.

## Pose workbench: one timeline, and a Play button (user request, 2026-07-27)

Three small things about the same strip.

THE SCRUBBER AND THE KEY TRACK ARE NOW ONE TIMELINE. They were two different
widths, so a key's diamond and the scrubber head disagreed about where that time
was. A range input's thumb travels from half a thumb in to half a thumb from the
end, so the slider takes the panel's full width and the key track keeps its
KEY_PAD (= half a thumb) inset: same span, same mapping, head on the diamond.
Nothing may share the slider's row — the readout beside it was what shortened
the travel in the first place.

THE READOUT BESIDE THE SCRUBBER IS GONE, as asked; the key you're parked on is
already the bracketed one in the times line below. The one thing that line did
not carry is the head's time while it is BETWEEN keys (nothing is bracketed
then), so in that state it now reads `t 0.87 · 0.00 0.34 0.52 …`.

PLAY / PAUSE beside ◀ key / key ▶ (or Space). It runs the edited clip at 1×
through the real animator — one update per frame at the frame's own dt, so the
pose smoother and signature layer behave exactly as they do in a match — and
LOOPS, because judging a half-second strike means watching it more than once.
Playing is a look, never an edit: the gizmo is detached for the duration and
commitEdit is refused, so a stray drag can't be written into a key while the
pose underneath is moving. Pausing snaps to the nearest key — the editable
state — and hands the gizmo back. Anything that takes the pose over (clip swap,
undo, mech rebuild, scrubbing, key stepping) stops playback first.

Verified on colossus/heavy: the slider's box measures exactly the key track's
box ±8px on each side, and parked on key 3 the thumb sits on that key's diamond
(screenshot VIEWED) · Play advances clip time and wraps at dur, Pause lands on
key 4 (t=0.70, the nearest), Space toggles both ways · the times line shows
`t 0.87 · …` unbracketed while playing · no page errors, `vite build` green.

## MENU UI PASS — instructions modal, selection flourish, nine paint schemes

Eleven changes across the title and mech-select screens.

TITLE keeps no hint bar any more (the controls live behind the new ⓘ button;
`title.hint.html` stays in the catalogue for anyone who wants it back), and the
SELECT hint bar is controller vocabulary only — A / D-PAD / ◀ ▶ / B / LB / RB /
RIGHT STICK — no keyboard chords. "ALL LOCKED…" now reads GAME READY. PRESS A
TO PLAY. The roster grid is `align-content: safe center`, so it sits centred
between its heading and the players bar and still falls back to a top-anchored
scroll when the roster outgrows the strip.

HOW TO PLAY (`src/ui/instructions.js`, ⓘ left of the gear) draws an Xbox pad as
inline SVG with a leader line from every control to what it does, and a detail
sentence for whichever callout you're on — hover, or ↑↓ from a pad. One
coordinate space drives both the drawing and the absolutely-positioned labels,
so moving a control moves its line. Every string is a `controls.*` catalogue id.
All three corner buttons (ⓘ ⚙ 🔊) grew tooltip bubbles (`.hot-btn::after`),
and ⓘ joined `hotButtons`, so LB/RB reaches it from a player's seat.

LOCK-IN FLOURISH: pressing A whips the mech around twice (0.72s, eased out)
while a player-coloured bloom grows and fades behind it — `MenuStage.lockFx`.
Once locked, LEFT steps the paint scheme BACKWARD and RIGHT forward (both used
to go forward), the strip carries a ◀ change color ▶ hint, and the RIGHT STICK
turns your robot on the spot, overriding the idle turntable while held
(`Input.menuLookFor` → `MenuStage.setYaw`). A GLB that finishes loading
mid-flourish inherits the spin and the parked yaw rather than snapping back.

NINE PAINT SCHEMES, up from four: STOCK · EMBER · TIDE · MIDNIGHT · AMETHYST ·
VERDANT · SOLAR · BLOSSOM · UMBER. Brown and pink need more than a hue swap, so
`forceHue` gained `satMul`/`lumMul` (a brown is a desaturated, darkened orange)
and the same two multipliers ride the `recolor` spec into `recolorglb.js`, so
GLB mechs repaint to match instead of drifting bright orange. The RANDOM "?"
sprite carries one tint per scheme.

### Follow-up: the callouts are buttons, and the leaders keep out of each other's way

Three fixes to the HOW TO PLAY diagram.

LEADER LANES. Every leader used to turn its corner on the same x per side, so
five verticals sat on top of one another and LT's line ran down through LB's.
Each row now carries its own `lane`, stepping INWARD as the column goes down —
that ordering is what also keeps a lower row's horizontal run from crossing a
higher row's vertical, since the vertical always stops above it. Checked in the
browser off the rendered polylines: 0 overlapping verticals, 0 crossings.

LB / RB / LT / RT are printed on the pad art now. They're the controls a player
can't read off their own controller without turning it over.

THE CALLOUTS LOOK LIKE BUTTONS: each is a rounded, bordered box that brightens
on hover and lights cyan when selected, and selecting one rewrites the
description under the pad (already the behaviour — it just wasn't obvious the
boxes were pickable). Found while wiring it: the SVG is appended after the
labels, so it was swallowing every hover — it's `pointer-events: none` now.

### Follow-up: hint-bar wording, and a drawn START button

The mech-select hint bar says **select** where it said "lock in" and **cancel**
where it said "leave" — what the buttons do to your PICK, not to the menu. The
trailing item is now **use pointer** rather than "full controls", and its icon is
the Xbox MENU/START button drawn (`.xb-btn`: a pale round pill with three bars)
instead of spelled — naming it "SELECT" reads as a word rather than as the thing
you press.

### Follow-up: one callout per face button, and leaders that keep their distance

The diagram now carries 13 callouts, six left and seven right, in a taller
coordinate space (viewBox 620×500).

LT / RT ARE PLAIN Ls. Their lane IS the callout's edge, so each is one
horizontal run off the trigger and one vertical up to its box — nothing else
crosses that band because every other row's callout sits below y=112.

EVERYONE ELSE FANS. Each row owns a lane, rows are ordered by the height their
leader LEAVES the pad at, and lanes step inward as the column descends — so a
lower row's sideways run only ever passes lanes whose verticals have already
stopped above it. Verified in the page off the rendered polylines: 0 overlapping
segments, 0 crossings, 0 overlapping label boxes (and every segment is axis-
aligned — the check fails on a diagonal).

A · B · X · Y ARE FOUR CALLOUTS, not one line of shorthand — they're the buttons
a player reaches for most, so each says what it does on menus AND in battle. The
face cluster fans out at four different heights (Y rises, B leaves straight, A
and X drop) to make room. SELECT and START moved to the left column, their
leaders walking down the pad's waist and out below the grips, which is what
freed the right side.

Renamed VIEW → SELECT and MENU → START (the names people actually use), and
corrected the mapping while writing the per-button copy: LT blocks (not dash),
LB is target lock, RB is the ranged weapon, RT the special, Y the heavy, X the
light, B the dash/sprint coil, D-PAD ▲ the ultimate.

### Follow-up: up-and-over leaders, and lines that touch their boxes

`elbow: 'up'` opts a row out of the lane routing: the leader rises straight off
its button to the callout's row and runs over to it — one corner, no lane. LT
and RT use it so they sit above everything else, and Y uses it because its lane
route ran across the RB bumper. Everything else still fans through lanes.

Leaders also run to 118 (or its mirror) rather than 122, so they TOUCH the
callout box instead of stopping a few units short — checked in the page by
comparing each polyline's last point against its box's own rect: 0px short on
all thirteen, with 0 overlaps and 0 crossings still.

### Follow-up: cheapest-route leaders, and a diagram about the FIGHT

Leaders now pick the simplest route the pad allows, cheapest first:

  'flat'   one horizontal, button straight out to its callout, which sits at
           the button's own height — LB, LEFT STICK, D-PAD, B.
  'elbow'  one vertical off the button, then over — LT, RT, RB, Y, X, and the
           two centre buttons (SELECT / START drop down the waist and run out
           below the grips, because leaving sideways would cross a stick).
  'lane'   out, one jog, then in — only A and RIGHT STICK. The face cluster
           packs four buttons into 44 units of height while callouts need 45
           apart, so the last two can't leave at their own height.

Segment counts, left to right: 2·1·1·1·2·2 and 2·2·2·2·1·3·3 — it was 3s and
4s across the board. Leaders also START at each button's outward edge, so no
line begins inside the art it points at.

The viewBox is wider than the pad art (760 vs the 620 the pad is drawn in) so
the lanes have margin to turn in OUTSIDE the silhouette. And the stage's short
side is capped as a WIDTH, not a height: capping the height let the box go wider
than the viewBox's aspect, the SVG letterboxed inside it, and every leader
landed short of its callout — which is what the "lines don't reach the boxes"
report was.

X's callout sits above Y's (its leader climbs out over the top of the pad),
and the copy is now about the FIGHT only — no menu navigation anywhere on the
diagram. Corrected against input.js while rewriting: SELECT taunts, LEFT STICK
click ducks, D-PAD ▲ is the ultimate.

Verified at 985×649, 1280×1024, 1440×810 and 1920×1080: 0 leader overlaps,
0 crossings, 0 label-box overlaps, 0 leaders short of their box.

### Follow-up: X above Y, one-line callouts, and a ▲ on the d-pad

X'S CALLOUT SITS DIRECTLY ABOVE Y'S. That took making the callouts ONE line
(name then action) instead of two: two-line boxes needed 45 viewBox units of row
spacing and the face cluster only has 22 between buttons, which is what had been
pushing X to the top of the column. At one line, nearly every control's callout
sits at its own button's height. X's own run threads the 15-unit band between
the RB bumper (ends 155) and Y's button (starts 170) — which is also how it
clears RB's leader, since that one rises from 148 and never reaches 158.

Segments are now 2·1·1·1·2·2 left and 2·2·2·1·1·1·1 right: nine of the thirteen
are a single straight line, four are one turn, and NOTHING needs a jog any more
(the 'lane' route is still there, now unused). Actions were shortened to fit one
line — the detail sentence under the pad carries the rest.

THE D-PAD'S UP ARM wears a ▲, and its callout points at that arm rather than at
the pad generally — UP is the direction that does something (the ultimate), and
the old leader read as though it meant LEFT.

The viewBox was also trimmed to the content (760×400, was ×540), so the diagram
fills its stage instead of floating in a band of empty space.

Verified at 985×649, 1440×810 and 1920×1080: 0 leader overlaps, 0 crossings,
0 label overlaps, 0 leaders short of their box, 0 callouts wrapping to two lines.

### Follow-up: the detail box stops resizing

All thirteen detail sentences now live in the DOM at once, stacked in a single
CSS grid cell with only the selected one visible. The box is therefore always as
tall as the LONGEST sentence, so moving the cursor across the callouts can't
change its height and shove the diagram up and down underneath.

Measured by hovering all thirteen callouts and reading the stage's top edge and
the detail box's height each time: one value for each, at 1440×810 (top 156,
height 41) and 985×649 (98, 33) — it used to move by a line's worth.

### Follow-up: roomier callouts, and space for the buttons that matter

Callout padding roughly doubled (0.75cqw × 1.15cqw) — they're hover targets, so
they may as well be easy to hit.

That needs room, and the face cluster had none: four buttons inside 44 units of
height, callouts that now stand ~26 units tall. So Y, B, A and RIGHT STICK each
take one jog out in the right margin and step down to a row of their own —
X 158, Y 200, B 242, A 284, RIGHT STICK 340, which is 42+ units apart instead of
22. RIGHT STICK moving down is what freed the middle of that range for the four
face buttons. Their lanes DESCEND as the column goes down (500, 492, 484, 476),
which is what stops a lower row's run from ever reaching the lane above it.

RT reads "special attack" now, in the callout and in its detail sentence.

Verified at 985×649, 1440×810 and 1920×1080: 0 line overlaps, 0 crossings,
0 label overlaps, 0 leaders short of their box, no callout text overflowing.

## Battle soundtrack: the songs in src/music/ (user request, 2026-07-27)

The eight mp3s dropped in `src/music/` now play during fights, at a volume that
leaves the synthesized combat SFX on top.

`src/core/music.js` is the whole player, and it names NOTHING: the track list is
`import.meta.glob('../music/*.{mp3,ogg,m4a,wav,webm}')`, so dropping a file in
that folder adds it to the rotation with no code change, and the FILENAME minus
its extension is the title shown on screen. It's an `<audio>` element rather than
another voice inside `core/audio.js` — that file is a WebAudio note scheduler for
the procedural tracks, and these are streamed files. The menus keep the
sequencer; a battle stops it and starts a song.

A random song starts with the fight (never the one that just played), and when it
ends another random one follows. Volume is a flat 0.22 against the 0.8 SFX bus,
so a clang always cuts through the music.

Wired through `boot.js` so the soundtrack follows the fight exactly: the pause
menu pauses it and resuming resumes it, backgrounding the tab pauses it (and
coming back only resumes it if the match was left running — the fight itself
still doesn't auto-resume), and tearing the battle down stops it and hands the
menus back to the sequencer. SOUND: OFF silences it with everything else.

`src/ui/nowplaying.js` is the readout in the bottom-right corner: a small
`🔊 NOW PLAYING · <song>` chip, click it (or SETTINGS → MUSIC) to turn the music
off and on without touching the SFX. Persisted in `rw.musicOn`. It hides on the
menus and during the warm-up screen, whose hint bar owns that edge.

Verified by driving the real menu flow into a live fight in a headless browser:
all eight files found, a random one playing at 0.22, the element actually paused
by the pause menu and playing again on resume, and the chip's click toggling
volume 0.22 ↔ 0 and the label ↔ MUSIC OFF. `npx vite build` green, with all eight
mp3s emitted as build assets.

## Soundtrack streaming, a music volume slider, and menu branch prediction (user request, 2026-07-28)

### The songs left the bundle

`src/music/*` is no longer in the JS module graph. A vite plugin (`rw-music`)
reads the folder and hands the game a virtual module of plain urls, then COPIES
the files into `dist/music/` verbatim — no hashing, because a stable url is a
cacheable one. Dropping a song in and reloading still adds it to the rotation
(the plugin re-reads the folder on every load, and a watcher reloads the page).

Copied rather than `emitFile`d: routing ~40MB of audio through rollup's asset
pipeline cost **1m40s of build time** to produce files it must not rename anyway.
The copy build is 6.7s, the same as before the soundtrack existed.

Two off switches, per the request:
- `CONFIG.music` (`?music=0`) — the runtime flag. No song is ever fetched and
  battles fall back to the procedural themes in `core/audio.js`.
- `RW_NO_MUSIC=1 npm run build` — the build flag for a packaged/offline build:
  no files copied, an empty track list, 7.5s build.

### Prefetch, and predicting what to prefetch

A fight opens with a burst of loading while the player spends fifteen unhurried
seconds on the title screen doing nothing. `src/game/predict.js` spends that time
instead. The trick the owner pointed at: the "random" parts of the next fight are
only random until someone rolls them — so roll them EARLY, prefetch those exact
assets, and have the menus CONSUME the pre-rolled values:

- the RANDOM arena tile's roulette now lands on `predictor.takeArena()`, whose
  sky/horizon/ground/facade textures have been downloading since the title
  screen (`arenaTexEntries()` in arena.js names them, `prefetchTex()` in
  texload.js warms the http cache — deliberately not `loadMap`, whose texture
  cache key needs an arena size nobody knows yet);
- RANDOM robot slots deal `predictor.takeMech()`, whose GLBs are already in the
  loader cache — for the first deal AND for the fresh robot dealt each round;
- the fight's first song is downloaded to a blob, and the battle plays THAT
  blob. Not a warmed `<audio>` element: this way the handoff is guaranteed
  rather than dependent on what the browser chose to keep.

Work runs one job at a time on `requestIdleCallback`, only while a menu is up
(`stop()` at battle start — from there every spare cycle belongs to the fight),
and every single item is optional: a miss costs bytes, never correctness.
`?prefetch=0` disables the lot.

### Music volume slider

`MenuList` learned sliders: an item carrying `slide(dir)` takes ←→ instead of
ignoring them, and confirm nudges it up (touch has no arrow keys). SETTINGS →
MUSIC VOLUME is one, drawn as ten blocks between dim ◄► chevrons — dim so they
don't compete with the menu's own cyan selection arrows. 5% steps, persisted in
`rw.musicVol`, and nudging it up off zero turns MUSIC back on.

### Verified

Headless, driving the real menus: 8 tracks found; one song downloaded on the
title screen and the fight opening on that exact blob (`currentSrc` is
`blob:`); the roulette landing on the pre-rolled arena after 18 of its texture
files were prefetched; the slider moving 22%→35%→40%→15% with the bar, the
percentage and `rw.musicVol` all tracking; `?music=0` fetching nothing and
reporting no soundtrack; `?prefetch=0` fetching nothing during the menus.
`npx vite build` green both with and without `RW_NO_MUSIC=1`.

## Arena props: the draw-call diet, the model diet, and a workbench to judge both (user request, 2026-07-28)

"Can any of the arena props be simplified?" — measured first, then acted on.
Instrumented a live fight in a headless browser (wrap `renderer.render`, sample
`info.render`, then hide the props and sample again): on `neon` the props were
~720 of the frame's 1,590 draw calls and 18k of its 568k triangles; on
`scrapyard`, 455 of 550. Props were never a triangle problem. They are an
OBJECT-COUNT problem — 46 placed props are 2,400 meshes, because each prop is a
pile of little boxes and cylinders and the arena's toroidal wrap clones the
whole prop group into the 8 neighbour cells.

Three changes, each independently revertible:

1. **mergePropMeshes** (`src/arena/props.js`) — once a prop is built, placed and
   MEASURED, the meshes sharing a material are baked into one geometry. Runs
   after `_regProp` (every collider, hazard radius and steam anchor is measured
   off the individual meshes) and before the ghost clones (so all nine copies
   get the cheap version). A named moving part (`userData.spinName`) is kept as
   its own object and merged internally instead. Indices are preserved when
   every part has them, so a 24-vertex box does not become 36. Measured across
   the whole prop table: 961 objects → 404 (−58%), triangles and vertices
   identical. `?props=raw` turns it off (`CONFIG.mergeProps`).

2. **tools/propopt.mjs** — the 20 imported prop GLBs were image-to-3D output at
   a density nobody chose: ~16k triangles each and three 1024² maps, 12.7 MB of
   files and 320 MB of texture memory for the set. dedup + prune + weld +
   meshopt decimation + 512² JPEGs + quantize/meshopt: 12.7 → 6.9 MB, 335k →
   215k triangles, 320 → 80 MB of texture VRAM. The untouched originals MOVE to
   `public/models/props/source/` rather than being overwritten;
   `node tools/propopt.mjs --restore --apply` is the whole revert, and
   `tools/dist.mjs` drops the archive from a distribution.

3. **Per-theme prop preloading** (`src/arena/propglb.js`) — `preloadPropModels()`
   used to fetch all 20 models at boot for an arena that shows one to three.
   It now takes NAMES; `themePropNames(theme)` derives them from the theme's
   scatter list, its authored placements and the viaduct piers, and boot asks
   for those. Calling with no argument still means everything.

**`/workbench/?edit=props`** is where the trade is judged rather than asserted:
a dropdown over every prop, the original on the left and the optimized on the
right, same scale and same light, turntable + wireframe, and a readout of
objects / triangles / vertices / materials / texture resolution / texture VRAM /
file size with the delta. ROUTE picks which optimization: `glb` stands the
archived original beside the shipped model, `proc` stands the prop as authored
beside the merged one. SCAN ALL PROPS totals the whole table. The tool imports
no game code — it reads a new `props` section of the workbench contract that the
robotworld adapter derives from `PROPS`, the prop manifest and the themes.

Verified: `npx vite build` green, soaks on frozen / scrapyard / ruins crash-free,
in-arena screenshots of the optimized GLBs (frozen's icebreaker, quonset huts and
snowcat) and of merged-vs-raw props on neon, and the workbench's own side-by-side
on toriiGate, icebreakerShip, campfire and substation. Frame draw calls on neon:
1,529 → 1,231.

## CAMERA Y, AND THE DESERT'S "UPSIDE-DOWN BRIDGE"

CAMERA PITCH. The two view modes disagreed with each other: in the combined
(solo) view the right stick pitched one way, in a split viewport the other, and
touch-drag disagreed with the stick in both. Every pitch input now goes through
one helper in camera.js (`pitchY`), so there is a single answer, and the default
is the standard third-person one — push DOWN and the camera rises so you look
down on your mech. SETTINGS → **REVERSE CAMERA Y** flips it for anyone who wants
the inversion (persisted in `rw.reverseCamY`, off by default).

Verified by driving the real CameraSystem with the preference set before load,
once per setting: OFF → push down gives +0.0243 on the combined view and +0.0243
in a split viewport (camera rises, look down); ON → −0.0243 on both. Both paths
agree now, which they didn't before.

THE UPSIDE-DOWN BRIDGE was the Desert Ruins' `greatGate` — the pylon gate at the
head of the processional way. Not upside down: its lintel was slung across the
middle of two bare towers with open sky above it, so the silhouette read as an
H, or as a bridge deck with its piers pointing up. It's a gateway again — the
doorway lintel carries a filled span up to the tower tops, one cornice runs
across the whole crown instead of a cap per tower, and a winged sun disc sits
over the door. Collision bodies (the two towers) are unchanged.

## Props workbench v2: twin viewports, GLB-only, a size audit — and a workbench front page (user request, 2026-07-28)

Three corrections to the props work, from using it:

**The size audit found real drift.** `node tools/propopt.mjs --audit` compares
every optimized model's bounding box against its archived original, per axis,
plus the box centre, at 0.5% tolerance — and the first run FAILED on four
models (buriedMechHand, foodTruck, sphinxStatue, trawler — up to 1.3% on an
axis). Decimation spends its error budget wherever triangles are cheapest,
which is sometimes an extremity: shave a fingertip and the bounding box
shrinks, and since the loader scales every prop to a target HEIGHT
(`fit`), a shorter model gets scaled UP — moving the footprint the arena
measures its collider from. The optimizer now tries its error ladder
(0.02 → 0.004 → 0.001 → 0.0002 → 0) and keeps the first result whose box
matches the original; those four models keep a few thousand more triangles
(225k total vs 215k) and the audit now PASSes across all twenty. Size is not
negotiable; triangles are.

**The comparison became two viewports.** One scene with both models framed
together answers "do they look alike from here"; two scissored viewports, each
with its own scene and light rig but ONE SHARED CAMERA (the right camera copies
the left's pose every frame), answer the question the tool exists for — each
model alone, filling its viewport, at exactly the same angle and distance,
framed off the OPTIMIZED model so a size change cannot hide behind per-side
framing. The readout gained the measured size in metres and a per-prop size
verdict; SCAN ALL names any model that drifted. The catalogue now lists ONLY
the GLB-backed props — the procedural props' optimization (mergePropMeshes)
changes the object count and not one pixel, so there is nothing for a viewer
to compare; it is judged by flipping `?props=raw` on a battle URL. The
adapter's `props` contract section slimmed to match (list/load/url/entry).

**`/workbench/` got a front door.** A bare visit used to silently open the
animation workbench, and a typo'd `?edit=` got a terse error list. Both now
land on `workbench/landing.js`: a card per tool — real screenshot, colour-coded
title matching its panel, what it is for, click to open — with the unknown-tool
case adding a "no workbench called X" note above the cards. Static on purpose
(no adapter, no WebGL): a menu should not wait on a game config. The
screenshots live in `workbench/thumbs/` and are re-shot by
`node tools/wbthumbs.mjs`; the landing page bundles them, so a missing one
fails the build instead of 404ing.

Verified: audit PASS over all 20 models, wbconfig PASS (props catalogue + prop
models still derived), `npx vite build` green with the thumbs emitted, a
scrapyard soak crash-free on the re-optimized models, and screenshots of the
twin-viewport tool (toriiGate, gantryCrane), the landing page, and the
unknown-tool banner.

## THE CAMERA IS THE PLAYER'S

Four changes to how the battle camera answers to the right stick.

FREE ORBIT WHEN UNLOCKED. Nothing swings the view any more except the player
and a held target lock. The solo camera used to ease toward the mech's back
while running, and toward the nearest enemy when idle; each split viewport did
the same. Movement is CAMERA-RELATIVE, so an orbit that chases the facing
quietly steers the player — you push one way, the camera follows, "forward"
moves under you and the run curves. Both auto-swing branches are gone (with
`followAzimuth`, which nothing else used); the orbit is aimed once, behind the
mech as the round opens, and is the player's from then on. LB target lock still
takes the view for as long as it is held. Manual PITCH still eases home as
before — only yaw stays put.

CAMERA ADJUST ON LEFT-STICK CLICK. LS no longer crouches (crouching rides on
the B dash coil now); held, it turns the right stick's vertical axis into a
ZOOM — forward comes in, back goes out — on both the combined view and a split
viewport. The multiplier rides on top of the automatic framing (so the giant
zoom, the split's shorter viewports and the COLOSSAL-FORM envelope all still
work) and persists in `rw.camZoom`, because it is a preference, not a per-match
thing. Range 0.55×–1.9×, about 2.7 seconds end to end.

A MANUAL CAMERA CAN DROP TO HEAD HEIGHT. The pitch floor was 0.12 rad on the
combined view and 0.10 on a split one, which kept the camera up above the mech
no matter how hard you pushed. Both floors are 0 now — level with the look
target, which rides at the mech's head. The AUTOMATIC framing is unchanged
(0.34 solo / 0.38 split); only a player pushing the stick down gets there.

Verified by driving the real CameraSystem: aim the orbit, then sprint the mech
sideways for two seconds — drift 0.0000 rad, combined and split. Camera-adjust
forward → 0.55× (in) and back → 1.55× (out), stored in localStorage. Full
manual pitch-down puts the camera at y 5.62 against a head at y 5.62 — exactly
on it — and the split's `el` lands on 0.000. Release the stick and the pitch
offset eases back to −0.010 while the yaw offset stays at −1.260. `vite build`
green, neon soak `"crash": null`, screenshot VIEWED.

## Ball tuck, tuck-only heavies, LT air guard, landing animation

**The somersault got a real ball.** The air roll used to borrow the upper-body
`block` clip, so the "tumbling ball" was a standing guard cartwheeling. A new
full-body `ball` clip (animations.js) curls the whole silhouette in toward the
HIPS — the axis the post-pose spin turns about: knees hauled to the chest,
shins folded flat, spine curled, chin tucked, arms hugging the shins. One
shared clip fits most frames because the clip layer already adds each mech's
restPose bias back onto legs/spine/head; where that isn't enough, a roster def
may carry **`ballPose`** — a sparse per-joint override merged over the tuck key
and compiled per mech under the same 'ball' name (`defClipVariants`,
animations.js). SAURION is the worked example: his digitigrade bend + spine
hunch on top of the shared fold hyper-folded the knees to 206° and buried the
snout; his override lands the totals where a plain biped sits. Animator.play
resolves profile clipOverrides → defClipVariants → CLIPS, and the workbench
adapter derives from the same function, so the pose tool edits exactly what
the game plays.

**Large bots tuck, small bots spin.** Past `stats.weight > 0.8` (TUCK_ONLY_
WEIGHT — titanus, colossus, rhino, glacier, cranky; the same line that cracks
the ground on a heavy landing) the somersault keeps the ball, the bubble and
the every-angle guard but spins at rate 0: a braced cannonball drop instead of
a cartwheeling building. The release math already lands rate-0 at endAt 0, so
a heavy's tuck simply opens the moment the input drops.

**LT airborne = paid air guard.** Pressing block IN the air (a press, not a
guard carried up from the ground — no accidental tuck risk) curls into the
same ball behind the full-sphere bubble, funded by the standard BLOCK_DRAIN
on the stamina tank; the tank running dry opens the tuck like a release. The
A-press descent roll stays the free one, gated as before on an EMPTY hover
tank on the way down. Both flavours keep the old trade: still tucked at
touchdown = prone knockdown.

**Every fall lands like a landing.** Two clips split one touchdown: 
`landReach` (held) stretches the legs long under the body, toes pointed, arms
out — triggered when a real fall is under ~0.4s from the pavement and nothing
else claims the body; `land` (one-shot) starts from that exact pose and
compresses it into a deep foot-flat crouch (duck-layer geometry, so feet stay
planted) before standing back up. applyPhysics plays it at contact when the
mech is its own master (not plunging/blocking/tucked/staggered); steering or
leaving the ground fades the recovery early, so it never roots gameplay.

Workbenches: all three clips are in CLIPS (wbconfig PASS, 99 clips) and
tagged in the skin tool's picker ('Air tuck', 'Landing'); the pose tool
shows/edits the per-mech ball variant.

Verified: `npx vite build` green; neon soak crash-free; scripted-intent
battle probe confirms LT-in-air starts the roll with clip `ball` and drains
0.28 stamina in 0.5s (=BLOCK_DRAIN), titanus tucks at spin 0.00 and opens on
release, free descent roll costs 0.00, a plain jump shows `landReach → land`
at touchdown, and the tucked touchdown still goes prone. Screenshots judged
across body types (viper, titanus, saurion, cranky, fenrir, colossus,
frogger, jerry) on GLB + procedural routes.

## RENAME: MECH MAYHEM — ROBOT BATTLE ARENA

The game is called MECH MAYHEM now, subtitle ROBOT BATTLE ARENA. Four strings
carried the old name: `title.game` / `title.tagline` / `app.title` /
`app.rotate.sub` in the text catalogue, plus the static boot splash and <title>
in index.html (they show before text.js loads, so they carry the words
themselves). Everything else reads through the catalogue and follows. Logo
restyle pending — eight treatments mocked and sent for a pick (current chrome
blue · gritty stencil · mirror chrome · molten · neon · heavy slab · organic ·
military plate).

## THE SIGN: NEON TITLE, AND A STAGE TO STAND ON

THE LOGO IS A NEON SIGN (picked from eight mocked treatments — chrome, gritty
stencil, mirror, molten, neon, heavy slab, organic, stamped plate). Hollow
two-color tube, cyan word then magenta, and the fill is EMPTY on purpose: the
line-up mechs read straight through the letters instead of being blocked by
them. Each WORD is its own tube with its own flicker clock — `title.game` is
split on whitespace in TitleScreen, so any name in any language gets the
treatment rather than two hard-coded spans. `steps(1, end)` on the animation
makes every change a hard cut: a tube snaps, it does not fade. The two clocks
(7.3s and 9.1s, one offset −2.4s) are deliberately mismatched so the words never
fall into a rhythm together.

Measured by driving the animations through the Web Animations API and reading
computed opacity every 20ms across 9.2s: MECH dips at 0.60s (0.22) with a
stutter back at 0.72–0.78s (0.32), again at 3.80s (0.25), a shallow one at 5.34s
(0.45), cycling at 7.90s. MAYHEM dips at 0.88–0.96s (0.20) + 1.06–1.12s (0.35),
5.70s (0.30), 8.72s (0.28). They never coincide.

LAYOUT: brand pinned to the top, menu to the bottom, the whole middle band left
clear — the mechs are the thing you look at now, not something behind the words.

THE BATTLE CIRCLE WAS ALIASED, in two different places for two different
reasons. On the menu stage it was ring GEOMETRY: a 48-segment n-gon whose facets
showed and whose thin hard edges crawled with MSAA off. It is one quad now,
wearing a canvas ring that FADES at both edges, so the silhouette is resolved by
an alpha ramp instead of by polygon edges (`ringMesh`, also used for the
per-player preview rings). In the arena the circle is PAINTED into the ground
overlay, and the culprit was anisotropy 4 on a texture seen edge-on all the way
to the fog wall — it now takes what the GPU offers, up to 16 (measured: max 16,
overlay now 16).

MENU FLOOR: the stage borrows the Ironworks Foundry's iron plate instead of a
flat dark disc, pulled well down toward the stage blue so it stays a backdrop.
`CONFIG.menuFloorTextured` is the off switch (or `?menufloor=0`), and
`CONFIG.menuFloorTex` names which arena ground it borrows — trying another one
is a one-word edit.
## AUTO-AIMED BLOWS GO FOR THE CHEST AND HEAD (user request, 2026-07-28)

Melee auto-aim steered a swing LATERALLY only (`aimStrikeAt`: torso twist
until the fist sits on the target's line, plus the palm clamp). Nothing aimed
one in HEIGHT — the code said so in as many words — so a heavyweight's punch
finished over a lightweight's crown and a scout's finished at a giant's shins.
Both still *landed*: the vertical strike assist in `strikeVolume` quietly
slides a sweep that misses the body onto it. They just didn't read as landing.

`Fighter.elevateStrikeAt` is the height half of the same servo, riding the
same strike window, no-twist ramp and unwind as the twist. While the blow is
live it pulls the striking limb into MELEE.AIM_LO..AIM_HI — chest (0.58) to
crown (0.95) of the TARGET's height — and a blow already arriving in that band
is left exactly as authored, so head-hunting hooks and chest jabs keep their
shape and only the ones sailing over or sweeping the floor move.

- Which limb is throwing it: `strikeTipName()` — the clip's own
  `strikeLimb`/`strikeArm` marker first (the same markers combat resolves the
  hit on), else whichever extremity leads furthest along the facing. The HEAD
  is a candidate here though it is not in combat's strike-limb table, because
  a bite is thrown with the jaws; a hand or foot wins ties with it (on a
  long-snouted frame the jaws lead at all times), and nothing counts until it
  actually leads the body, so the wind-up banks no correction.
- Which joint lifts it: shoulder for a punch (no tipping the frame), thigh for
  a kick, torso for a bite — a joint can't move its own pivot.
- How much: PROBED, not assumed — nudge the driver, measure how far the tip
  really moved in Y, and that slope turns "1.2 units of lift" into an angle on
  any rig, procedural or retargeted GLB, whichever way its bone axes point
  (the trick `clampPalmsTo` already uses for its inward roll). Rate-limited,
  capped at MELEE.AIM_PITCH (0.5 rad), and re-zeroed if the throwing limb
  changes mid-clip.
- Opted out: the two-fist SMASH, which is body-aimed and commits (it already
  opts out of the lateral servo) — it unwinds instead.

Verified: `npx vite build` green; neon + canyon soaks crash-free.
New `tools/aimheight.mjs` plays a fight twice (servo off / on) and reports
each landed swing's height as a fraction of the victim's body: saurion vs
viper went from median 0.36 / 21% on the upper body to median 0.60 / 58%,
titanus vs viper from 47% to 64% with over-the-crown swings 18% → 7%.
New `tools/aimshot.mjs` freezes the impact frame side-on for a pair —
viper's punch on titanus rose from his hip (0.51) to his chest (0.69).

## THE SIGN BUZZES, AND THE MENUS ANSWER TO IT

NEON BUZZ. Every tube drop-out plays ONE flicker cut out of a real recording
(`public/sound/neon_buzz.mp3`, a 16.85s take with dozens of flickers in it).
`GameAudio.loadSliced()` decodes the file once and finds the events in it by
energy — a 5ms RMS envelope, a threshold set off the MEDIAN (the take has a
constant hum under it, so the floor is not zero), and a 60ms quiet run to end
an event — handing back 37 slices; `playSlice()` triggers a different one each
time with 12ms fades top and tail, since a slice cut out of a continuous take
starts mid-waveform and would otherwise click. Detection rather than a
hand-written table so replacing the mp3 moves the slices with it. The synthetic
`neonZap` stays as the fallback for a file that will not fetch or decode.

HOW LOUD: `CONFIG.neonBuzzVolume` (core/config.js), 0..1, default 0.6 — a
number to EDIT rather than a stored preference, with `?neonbuzz=<0..1>` for a
quick try without touching the file. Each flicker leans on it a little by how
deep that particular drop-out goes. Measured across a cycle: 0.629–0.696 at the
default (it was 0.98–1.03 before), and 0.157–0.174 under `?neonbuzz=0.15`. The CSS
keyframes stay the single source of truth: TitleScreen reads the tubes' live
opacity each frame and buzzes on the lit→dim edge, so editing the flicker in
style.css moves the sound with it rather than desyncing from a duplicated
table. The deeper the dip, the harder the tube complains.

Verified by stepping the real animations through a full cycle and watching what
the screen asked the audio engine for: 10 buzzes in 9.2s, at 0.59 / 0.72 / 0.88 /
1.06 / 3.81 / 5.34 / 5.71 / 7.89 / 8.02 / 8.70s — exactly the measured dip times,
including both stutter pairs. With the recording in place all ten came from it
(0 synth fallbacks), on slices 5,10,16,8,34,33,24,29,3,10 — never the same one
twice in a row.

FONT / COLOR PASS (kept). Two type
stacks now: `--font-display`, a condensed grotesque (Bahnschrift / DIN Alternate
/ Oswald / Arial Narrow, falling all the way back to the old stack) for headings,
menu items, card names and hint keys; `--font-ui` stays the system sans for
anything read in sentences. The sign's two tubes become the interface's two
colors: cyan is structure, MAGENTA is what is active — the selected menu item
and its ▶◀, the stat bars' hot end, the GAME READY chip (was a green pill), and
a magenta bounce under the screen headings.

Two layout bugs the wider tracking exposed, both fixed: the select heading
wrapped to two lines in the fallback face (it is nowrap and a size smaller now),
and the locked player card's colour strip ran off the end — at eleven schemes
the scheme NAME no longer fits after the swatches, so it moved onto the ◀ ▶ row,
which is where it belongs anyway.

## Heavy mechs stop bouncing; the pose workbench gets the walk (user request, 2026-07-25)

- **THE BOUNCE.** Measured, not guessed: hip travel over a walk cycle was
  **9.6-9.8% of body height on Glacier and 5.0-7.1% on Titanus**, once per step.
  Turning the pelvis-follows-feet loop off dropped it to 1.8-2.5% — so ~95% of
  the vertical body motion was that loop, not the authored gait bob (which the
  loop cancels anyway, since lowering the hips lowers the soles with them).
- The loop was chasing the wrong signal. What it exists to remove is a mech's
  STANDING sole offset (a rigged boot whose sole sits somewhere the gait never
  assumed parks the whole body too high — the old "floating walk"), and that
  error is a CONSTANT. The per-step ripple around it is not an error at all: a
  rotate-only leg is genuinely shorter when the thigh is swung out than when it
  is under the hip. At rate 20 (a 0.05 s time constant) the loop tracked that
  ripple and, lagging it a quarter cycle, DROVE the body instead of following
  it — a per-frame trace showed clearance and bias in exact quadrature.
- Fix is one measured constant: `SOLE_FOLLOW_RATE = 2.5` (animator.js). Glacier
  now walks on 3.1-3.5%, Titanus on 0.8-1.3%, and the whole roster sits in
  1-5%. The anti-float job is untouched — MEAN sole clearance stays dead on zero
  (Glacier -0.004 at rate 2.5 vs +0.010 at rate 20, against +0.109 with the loop
  off), and average per-frame sole error is no worse (0.235 vs 0.201 at speed 10:
  the fast loop bought 0.03 units of foot accuracy for 0.6 units of body bounce).
  Swept 20 / 8 / 4 / 2.5 / 1.5 / 0.8 — faster than ~4 puts the ripple back, below
  ~1.5 buys nothing.
- Verified the feet still land: parked both mechs on their WORST contact frame
  and looked from ground level — the planted boot is on the plane, the -0.34
  /-0.38 residual is a toe corner biting in.
- **WALK IN THE POSE WORKBENCH.** It was missing because the walk is not a
  clip: `clipsFor()` lists keyframe clips, and locomotion is generated every
  frame by `animator.update()` from a gait phase whose cadence is matched to
  actual ground speed. Nothing keyed, nothing to list. (The ANIMATION workbench
  already had a hold-to-walk button, but no way to freeze a frame of it.)
- Added it as what it is — a scrubbable CYCLE, not a fake clip. New optional
  `anim.locomotion` block in the workbench contract (list / ctx / period /
  phase / step / run); the robotworld adapter drives both gaits at the mech's
  REAL top speed via a newly exported `moveSpeedFor(def)` (fighter.js now calls
  it too, so there is one number, not a copy). In the pose tool they appear in
  their own `locomotion — generated, no keyframes` dropdown group: the scrubber
  spans phase 0..2π, every phase freezes to a settled real frame, PLAY runs the
  gait at 1× through the actual animator, "Copy pose" exports the frozen frame,
  and the key track / steppers / Revert stay hidden because there is nowhere in
  a generated walk to write an edit. `&clip=loco:walk|loco:run` + `&t=<phase>`
  deep-link one.
- Verified: 6 distinct posed frames across one cycle (thighL sweeps -29.9° to
  +29.9°), key track hidden for a gait and back for `shootL`, deep-links load,
  `node tools/wbconfig.mjs` PASS (no drift), ace soaks crash-free
  colossus/glacier and titanus/viper, `vite build` green.


## SKIN DEBUG: an AUDIT workbench for stretched, pinched and torn skin (user request, 2026-07-29)

`/workbench/?edit=skindebug&mech=<id>` — the seventh workbench, and the first
that writes nothing. It plays every clip a mech can play (its rest stance
included, as a clip of its own), CPU-skins the model at each sampled frame, and
ranks the places where the geometry is being pulled into a shape it cannot
survive:

  stretch  an edge dragged past its built length — the rubber forearm
  pinch    an edge collapsed to nothing — linear blend skinning's candy wrapper
  tear     a weld seam pulled APART, which opens a crack through the model

WHAT MAKES IT CHEAP. Two vertices joined by an edge keep their distance exactly
when they share skin weights, so only edges whose ends are weighted differently
can fail — on jerry that is 2196 candidate edges out of 34565 vertices, and a
21-clip scan takes 2.3 seconds in the browser. Weld pairs (duplicated vertices
at one position, a UV seam) are candidates too: nothing but matching weights
holds them together, and when they part the model splits open.

A FINDING IS A PLACE ON THE MODEL, NOT A PLACE IN A CLIP. The first pass
reported 4787 findings for jerry, which is the same handful of stray weights
written out once per clip — useless as a work list. Spots that TOUCH on the mesh
(shared vertices, or one mesh edge / weld mate apart, so a run split by a single
rigid vertex still counts as one place) are merged into one finding carrying
every clip it fails in, worst first. Jerry: 16. Cranky: 14. The clip dropdown
walks the occurrences; the arrows walk the findings.

The reference is the BIND pose rather than the rest stance, so skin that is
already broken standing still cannot hide — it is reported as its own finding
and every clip finding says `also broken at REST` when it overlaps one.

WALKING IT. ◀ ▶ (or the arrow keys) step the list; each stop loads that clip,
parks on the frame the deformation peaks and paints the failing edges and
vertices over the model — skinned live, so the highlight stays glued to the
geometry while the clip plays (SPACE, 0.1–1×). H toggles the highlight, F frames
the spot (with the mech kept in shot: the worst findings smear their geometry so
far that a naive centroid framing shows nothing recognisable). Findings can be
marked fixed/ignored, remembered per mech.

AND THEN FIXING IT, next door, in a new tab: **Edit skin** opens the skin
workbench with the failing island ALREADY SELECTED (`&vert=`, new) and the clip
in its wiggle picker (`&clip=`, new); **Edit rig** on the mech; **Edit pose** on
that clip at that frame. **Load from manifest** re-reads models/manifest.json AND
drops the parsed-GLB cache — skinOps are baked into the shared geometry exactly
once, so without that a rebuild would keep showing the skinning that was current
when the page loaded — then re-scans and keeps your place in the list.

Headless twin for diffing an audit across a fix: `node tools/skindebug.mjs
<mech> [--json out.json]`. The measurement is `workbench/tools/stretchscan.js`
(no game imports, no DOM); the narrower CLI probes that came before it
(skinstretch / cliptear / stretchaudit) are untouched.

FIRST RESULTS. Jerry's two worst are handfuls of vertices bound to `handL` /
`handR` that sit on the TORSO, so they stretch ~240× and ~180× in 19 and 20
clips respectively — the smeared spikes are visible in the thumbnail. Cranky's
worst is `legMLknee` geometry riding the `head` bone (217×, 21 clips).

---

## GAITS AS DATA — the gait table and the gait workbench

**The problem.** Locomotion was one hard-coded block of sines in `animator.js`.
Every mech in the game ran it: a 6.5-speed COLOSSUS and a 13.5-speed VIPER got
the same stride, differing only by `ratio = speed / maxSpeed`. So at full
throttle the fast mechs weren't running — they were walking quickly, legs
straddling a wide base, feet never reaching ahead of the body, arms barely
moving, torso upright.

**The table.** `src/mechs/gaits.js` holds the cycle as data:

```
GAITS.standard   the old block, number for number
GAITS.sprint     the fast tier — viper, tempest, wraith, nova
GAITS.quad       fenrir: the same biped layer plus a `quad` gallop block
```

A gait has four sections (`legs`, `ankle`, `arms`, `body`) plus the optional
`quad`, and every dial has a `*Run` twin: `base + run * ratio`, which is how one
gait can walk politely and sprint hard without a second table. `applyGait()` is
the whole cycle and it is a PURE function of (pose target, gait, environment) —
the animator calls it, and so does the workbench, which is what makes tuning
honest. `gaitPhaseRate()` keeps the foot-plant cadence (and the grown-body
`sizeMul` law) where it was.

Two dials are new, and they are the two the fast mechs needed most:
`legs.reach`/`legs.extend` (asymmetric swing — a run reaches ahead and finishes
behind, where a pendulum just swings), and `legs.adduct` (hip roll toward the
midline: a runner's feet fall nearly single-file, and a wide base is the loudest
"stiff" tell there is). Then `arms.elbowRun`/`arms.tuck`/`arms.cross` for a
driving arm instead of a hanging one.

**The proof it changed nothing else.** `standard` and `quad` were checked
against the previous animator code over a sweep of phases, speed ratios and
foot calibrations: bit-identical, so the other thirteen mechs move exactly as
they did. `node tools/footprobe.mjs colossus 4` still reports the same cadence
and stance-foot slip, so the giant-form contact law survived the move.

**The workbench** — `/workbench/?edit=gait&mech=<id>`:

- the mech dropdown names each mech's gait (`VIPER — sprint`), and the panel
  heads with the gait's name, note and every other mech that runs it, each a
  button that loads that body WITH YOUR EDITS INTACT — because the edits belong
  to the gait, not the mech, exactly as they do in the game;
- THREE different speed knobs, kept apart on purpose: THROTTLE (how fast the
  mech is moving, which is what `ratio` and the cadence read), GAME SPEED (the
  player-facing ROBOT SPEED setting, 50–200%), ANIMATION SPEED (slow-motion for
  reading a fast cycle — a debug dial that changes nothing about the gait);
- pause + a phase scrubber (`[` / `]` to step) freeze one moment of the stride;
- a phase-locked GHOST of the shipped gait beside the mech — or of any OTHER
  gait, which is how a mech gets moved between gaits with eyes open;
- click a limb and the panel lists the dials that drive it; DRAG the limb and
  the tool measures `d(joint)/d(dial)` at that phase, works out which way that
  pushes the limb on screen, and projects your drag onto it — you pull the leg
  where you want it and a number moves;
- edits persist (localStorage) until Revert, and **Output gait** downloads a
  paste-ready `GAITS` block with every changed dial listed `from → to`.

**One thing the move did change, on purpose.** The arms. The old line read
`shoulderL += armSwing * sinR` against a leg of `thighL += -swing * sinL`;
shoulder pitch and thigh pitch share a sense (negative is forward), so that put
each arm in phase with its own leg — every mech in the game swung its left arm
forward with its left leg. Arms now ride their own side's sine and counter the
legs, which is what cancels the leg's angular momentum about the spine.
`gaitprobe` reports the check as `armPhase r` (foot fore/aft against the same
side's hand, over a cycle): it must be NEGATIVE, and is -0.96.

**Judging it from the command line.** `node tools/gaitprobe.mjs <mech>
[throttle] [vsGait]` measures reach / trail / stride / lift / track / bob /
sole clearance / lean / arm swing / arm phase off the real posed model and
diffs two gaits;
`node tools/gaitsheet.mjs <mech> out.png [throttle] [frames] [vsGait]` renders
the cycle as a filmstrip with the comparison ghost in every frame.
## JERRY: new skinning, and CUTTING the hand off the torso (user request, 2026-07-29)

The owner sent a fresh `skinOps` list for jerry (67 ops) and the observation the
audit could not make itself: the top three findings are not weight mistakes at
all. *"There's some geometry that is connected but shouldn't be, so I can't use
reskinning to fix it."*

MEASURED FIRST. With the new skinning in, `?edit=skindebug&mech=jerry` still put
handR~torso (282x rest length, 20 clips), handL~torso (240x, 19) and a third
handL~torso spot (148x, 19) at the top of the list. Probing the geometry
directly: **37 triangles, 70 vertices** running between hand-dominated and
torso-dominated vertices, at both wrists (y≈0.61, z≈±0.30). Their median area is
half the mesh's own, so this is ORDINARY SHELL, not the thin hidden membrane
reskin.js' `cutWelds` was written for — delete those and you punch a window in
the robot.

SO A CUT THAT SPLITS RATHER THAN DELETES — `src/mechs/seamcut.js`, driven by a
new manifest key and applied right after skinOps (so it reads the final,
hand-authored weights):

    "seamCuts": [{"a":["handL","handR","clawL","clawR"],"b":["torso"],"cap":true}]

  1. SPLIT — each bridging triangle goes to the side carrying more of its skin
     weight; any corner belonging to the other side becomes a DUPLICATE vertex
     bound to the side that took it. The two surfaces now share nothing.
  2. UNBLEND — a torso vertex keeps no hand influence and a hand vertex no torso
     influence, renormalized (the owner's "remove the hand component of the
     torso geometry's skinning and vice versa"). Jerry needed none: his custom
     rig is already rigid, which is exactly why only a cut could fix this.
  3. CAP — splitting a closed shell opens it, so each rim is closed with a fan
     to its own centre: its own vertices, its own flat normal, its own side's
     bone, wound from the rim's own directed edges (an interior edge of a closed
     mesh is traversed once each way, so the lid for rim edge u->v is (v,u,C)).
     Adjacency is by WELDED POSITION, not vertex id — these meshes are split at
     every UV seam, and id-matching found a tenth of the real neighbours (4 lid
     triangles instead of 48).

RESULT: 37 bridge triangles, +105 vertices, 48 lid triangles, 0 remaining
hand~torso triangles, 0 vertices mixing hand and torso weights. Jerry's audit
goes 16 findings / worst 282 -> **13 findings / worst 75** (the new worst is
shoulderL~torso~elbowL, a different defect, untouched).

PROVED, NOT ASSUMED:
  · AT REST NOTHING MOVED. Four rest-pose renders are pixel-identical before and
    after — the duplicates sit exactly on the originals, so posters, the
    showcase and mech select are untouched. (postercheck: 4px, its pre-existing
    drift.)
  · NO NEW HOLES. Welded directed-edge audit of the whole shell: 81 unpaired and
    78 mismatched edges BEFORE, and exactly 81 / 78 after — the lids close what
    the cut opened, and none is wound backwards. A red-backface render agrees:
    inside-out pixels fall by up to 7,200 per view and a blue/magenta lid render
    shows no backfacing lid from any angle.
  · `npx vite build` green; soak (jerry vs cranky, ace, neon) crash-free.

THE AUDIT LEARNED ABOUT IT. A deliberate split is two coincident vertices that
part — which is precisely what the workbench calls a `tear`, so the cut promoted
itself to the top of its own list. seamcut now tags every vertex with which cut
and which SIDE of it (`seamId`/`seamSide`), and stretchscan skips a weld pair
only when both ends are on opposite sides of the SAME cut — an unrelated crack
at the same seam still reports, and the number skipped is printed in the status
line rather than silently swallowed. The hand-off to the skin workbench also
translates vertex ids back through `seamCut.source`, since the raw GLB that tool
edits has never heard of the vertices the cut added.

STILL WELDED, NOT ASKED FOR: the same probe found arm-to-leg welds
(elbowL~thighL 46 triangles, elbowR~thighR 27, shoulderR~thighR 26,
elbowL~kneeL 9). Same illness, same one-line fix if wanted.

---

## THE MANNEQUIN + THE FOOTPRINT TREADMILL (user request)

**The mannequin** — `src/mechs/mannequin.js`.

Every workbench keeps asking one question in a different accent: *where is this
part supposed to be?* On a real mech that is hard to answer, because the answer
is buried under a service model's own bind pose, its fused weapons, its
digitigrade crouch and whatever the skin weights are doing. So there is now a
body with nothing hidden — and, crucially, it is not a picture of a humanoid: it
is the SAME 15 joints in the SAME hierarchy at the SAME measurements
(`factory.buildRig` / `computeDims`), built as a genuine `SkinnedMesh` with real
weights.

  · blocky limbs with a joint ball at every joint;
  · a FOOT: heel block behind the ankle, ankle stub above the arch, sole plate,
    toe box in front — the sole exactly 0.32·scale under the ankle joint, which
    is the procedural convention the gait's toe-off is authored against;
  · a nose and two eyes, so no screenshot is ever read back-to-front;
  · a thumb on each hand, so a rolled wrist is visible;
  · one flat colour per bone — WARM = left, COOL = right, darker further out the
    limb, neutral grey down the centre line;
  · weights that are hard per segment with a NARROW BLEND BAND across each
    joint, which is exactly the layout a repaired mech should end up with.

Where it shows up:

  · **gait** and **pose**: a third BUILD button beside GLB / Procedural. It runs
    the mech's own gait and poses the mech's own clips (per-mech SIGNATURE motion
    is off — a reference body has no business owning a tail — so what you see is
    the shared engine plus that mech's rest and combat stance).
  · **skin**: a `Mannequin reference` box swaps the subject for it, read-only
    (there is no manifest entry to save to, and Save greys out). The tool
    colours it by bone exactly as it colours a mech, so its islands ARE the
    answer to "what should this look like".
  · **rig**: a `Mannequin reference` box ghosts it over the raw model at the
    model's own height, drawn with `depthTest: false` so it is an X-RAY rather
    than something hidden behind an opaque mech, with every joint NAMED by a
    sprite parented to its bone. Drag a bone to the labelled dot and the rig is
    anatomically right before a single pose is tested.

The contract gained a `reference` section (`mannequin(height)` / `labels(model)`
/ `tints()`) for the beside-it case, and `variant: 'mannequin'` in
`variants.build` / `variants.raw` for the instead-of-it case. A game with no
reference body leaves both out and the boxes simply aren't offered.

**And it is a SUBJECT.** MANNEQUIN is listed at the bottom of every workbench's
mech dropdown (`hidden`, so it sits under the rule with the work-in-progress
mechs) and opens on its own: the gait workbench runs the `standard` gait on it,
the pose workbench poses the shared clips, the skin workbench shows the reference
bind, the rig editor loads its canonical 15-bone skeleton as the rig, and the
hurtbox workbench measures its 15 capsules. Two heights are handed out, because
the tools take it two ways: ~7 units for the ones that stand a MODEL on a stage
(the roster clusters around 7), ~1 unit for the ones that take a RAW ASSET and
scale it themselves (an imported GLB arrives about that big; the rig editor
multiplies by its own VIEW, and a 7-unit body put the camera inside its shin).

It is declared, not smuggled: `catalogue.reference()` names the ids that are not
game content, `wbconfig` subtracts them before comparing the catalogue to ROSTER
and prints what it subtracted, the action workbench filters them out of its
picker, and `rig.save` / the skin tool's Save + Export ops refuse on them.

**The footprint treadmill** — the gait workbench.

Locomotion is judged ON THE SPOT, which is what makes two gaits comparable and
also what hides the one thing a stride is for. So the ground runs instead: each
plant stamps a foot-shaped print where the foot landed, and the prints, the grid
and everything else on the floor scroll backward at the mech's real ground speed
(and at the ANIMATION SPEED dial's rate, so slow-motion keeps them in sync).

Three things fall out of that trail for free:

  · **stride, measured.** The gap between two prints of the same foot is the
    distance actually covered. The readout shows it next to the number derived
    from the cadence; they agree to ~1% (viper 6.47 vs 6.4 u per step), which is
    the foot-plant contract holding.
  · **track width, measured.** The sideways offset between left and right
    prints — 0.35 u on tempest's sprint, nearly single-file.
  · **the skate test, visible.** A planted foot should sit still on top of its
    own print for the whole stance. If it slides off, the cadence doesn't match
    the speed.

Plant detection deliberately does NOT look for a local minimum of the foot's
height: that needs the frame rate to out-sample the stride and it doesn't (at 5
steps/s, whole steps fell between frames and went unstamped, and under
SwiftShader it was worse). A foot is planted when it is near the ground AND it is
the lower of the two, with one stamp per foot per cycle enforced by a gait-phase
guard rather than by the height signal.

## BAKING THE EDITS INTO THE ASSET, and previewing a cut before it is one (user request, 2026-07-29)

Two asks. First, a way to SEE the cut geometry in the skin workbench — see the
commit for "preview the seam-cut build"; the short version is that the workbench
edits the raw file, so it renders welds the game has already separated, and now
a read-only toggle swaps in what the game builds. The measurement that goes with
it, "What moves? (M)", reports two things on purpose: which bones' vertices
travel, AND which bone pairs have geometry stretched between them. They are not
the same question — a welded torso vertex does not move at all; it sits still
while the triangle joining it to the arm is dragged across the arena.

Second: fold the runtime edits into the GLBs. tools/bake-glb.mjs already did the
hard part (bake rig + skinOps + reparent + stretch + bonePos, strip the manifest
fields, delete the rig file, one revertible commit, joint-fidelity check). What
it needed:

  · seamCuts baked too, with the seam record kept as `rwSeam` mesh extras so the
    skin audit can still tell a deliberate split from a crack once the cut IS
    the asset.
  · THE SOURCE KEPT. --apply archives the untouched asset to
    public/models/source/ (once — a second bake cannot overwrite the original)
    and writes <id>.edits.json: every folded manifest field with its values, and
    the rig file's text.
  · Paths from the entry's `url`, not `mech_<id>.glb`. Jerry's primary model is
    mech_jerry_alt.glb; the tool baked over his ALTERNATE and the post-bake
    build fell back to procedural.
  · A dry run that restores the tree even when a step throws — it writes the
    GLB, the manifest AND deletes the rig file before the check can fail.

JERRY IS BAKED. 3.99 MB, 23 bones, 15/15 joints, joint fidelity 0.0001 world
units (tolerance 0.01). Manifest entry went from 6 fields of instructions to
url + modelScale + bindPose + yawOffset + heightScale + muzzles.

AND THE BAKE HAD A BUG THAT THE FIDELITY CHECK CANNOT SEE. Baked jerry's audit
came back 13 findings -> 9, which is not an improvement: the four that vanished
all involved strutMidL/R and tail — his CANNON PODS, which had stopped moving.
`mech.rigBones` was only ever populated on the custom-rig path, and his glbanim
profile aims the pods through it (`if (!bones) return`). Bake the rig in and the
hook silently no-ops, his Bilge Spit goes back to firing sideways, and 15 joint
positions are all still perfect. rigBones is now filled in from the model's own
bones for ANY skeleton, which is what it should always have been.

With that fixed, pre-bake and post-bake audits are the same list: 13 findings,
no additions, no removals, severities equal to 3 decimals on 9 of 11 and inside
0.15 on the other two (animator settling jitter). weldmap agrees pair for pair,
hand~torso still absent. Soak clean, build green, poster re-rendered (5px).

The joint-only fidelity check is now documented as insufficient, and --apply
prints the three checks that cover what it misses.

FENRIR'S GALLOP, AND THE DIALS THAT COULDN'T MOVE HIM
-----------------------------------------------------
`legs.extend` now goes NEGATIVE (slider -2 … 1.2). It was floored at 0 on the
assumption that "rear extension" can only add rearward swing, which is a biped's
assumption: fenrir carries his hips HORIZONTALLY, so the same thigh channel
reads the other way round and his rear extension is a negative number. Installed
at -1.5, as tuned.

THE BACK-EXTENSION FOOT ANGLE IS A DIAL, and now says so. `ankle.push` was
labelled "toe-off angle" and documented as an amount, which is why none of the
ankle dials seemed to answer "what angle does the paw finish at": it is an
ABSOLUTE target relative to the shin, and it plus its @run twin is the whole
answer. Relabelled "foot angle at full back extension" with the arithmetic in
the help (1.57 = 90°, 0.79 = 45°). Quad set to push 0.45 + pushRun 0.35 = 0.80
rad; measured on the model at full throttle, the paw now finishes at 42-44°
instead of ~86°.

ONLY THE DIALS THAT MOVE THIS BODY ARE SHOWN. A gait is one table shared by
every mech that names it — but it is not one PASS, and that is what made the
panel lie. Fenrir's gallop layer `lerp`s both shoulders and both elbows to its
own targets with a blend that reaches 1 at ~75% throttle, so above that every
`arms.*` row is a slider that cannot move him however far it is dragged.

Rather than hand-maintain a "which dials apply to whom" table (which would rot
the first time a layer changed), MEASURE it. `evaluate` is pure and cheap, so
scanEffects runs the whole pipeline at this mech's own numbers with each dial at
the bottom, middle and top of its range, over the cycle, and asks whether any
joint moved. Under ~0.25° it is inert HERE and hidden; untick "only dials that
move this mech" and they come back greyed, each carrying the throttle band it
DOES work in — "only works below 75%" is the useful half of "does nothing", and
it is what says a later layer took the joint over rather than that the dial is
broken. Clicking a limb whose dials are all inert now says so and points at the
joint-rotation mode instead of offering a dead slider to drag.

Measured on fenrir at full throttle: 38 dials live, 10 inert — seven of the
eight `arms.*` rows ("works below 75%"), plus `quad.hockSnap` (the foot rule
overwrites the hock once the paw is airborne or pushing). The arm dials that DO
reach him are `quad.frontReach/frontSwing/frontRake/frontFold` — which is the
answer to "most of the current controls seem to not be the right ones": they
were the right controls for the wrong layer, and the panel was showing both.

ONE CLASS OF DIAL IS NOT INERT, IT IS INVISIBLE: `legs.cadence`/`cadenceCap`
carry `joints: []` because they set how fast the phase ADVANCES, and a pose
sampled at a fixed phase cannot see a timing change. They are skipped by the
scan rather than measured, or the two dials that own the foot cadence would be
hidden as doing nothing.

Same measurement on the command line: `node tools/gaitdials.mjs <mech>
[throttle]`.

THE KEYFRAME MODE IS THE JOINT-ROTATION MODE, and is now named that. Every dial
is ultimately a formula for a joint angle — `tgt.thighL[0] += -swing * sinL -
reach * fwdL + extend * backL` is the whole of "rear extension" — and what a
dial buys over a raw rotation is that it is an angle as a FUNCTION of phase and
speed, shared by every mech on the gait. Three things in a gait are not that:
the cadence pair (timing), `quad.blend` (it gates a layer) and the foot rules
(they are statements about the FINISHED pose, applied last). The rest is joint
rotations, and the same rotations can be authored by hand at a phase.

THE QUADRUPED IS SOLE-SAMPLED AGAIN. calibrateFeet used to return before it
measured fenrir's paws at all, which meant he was the one mech in the game with
no ground contact measurement: no `soles`, so no pelvis follow, so nothing at
all holding his body at the height his paws were drawn at. He now gets the
sample points and returns before the DAMPING (ankleGain/footFlat), which is the
part derived from a boot's depth under an ankle and is meaningless on a hock —
levelling his paws had already been tried and produced 130-170° of dorsiflexion.

FENRIR'S PAWS DO GO THROUGH THE FLOOR, and it is not a workbench artefact. His
measured sole clearance over one cycle at full throttle runs from -14% to +49%
of body height (the gait workbench now prints exactly this, red when it dips
under). The pelvis follow cannot save him and is not meant to: it corrects the
AVERAGE clearance only — chasing the per-step ripple would lift the whole body
once a step — and his average is +4%, so it sits still while the paws swing 60
points of body height around it. The same code poses him in a match, so the same
legs reach through the pavement there.

MEASURED, so the fix is a choice and not a guess: `legs.extend` 0 -> -1.5 (the
tuning just installed) took the worst dip from -9% to -14%, and `quad.drop`
0.32 -> 0.10 would take it to -6.5% at the cost of the wolf riding low. Both
dials are the owner's to spend, so the gait is left as tuned and the readout is
there to spend them against.

FRAMING OFF THE JOINTS ALONE PUT THE CAMERA INSIDE THE WOLF. bodySize() walked
the 15 game joints, which are the animated skeleton and not the silhouette:
fenrir's tail is six bones the joint list has never heard of and most of his
length, so the fit distance was solved for a body that stopped at his hips and
the viewport showed tail. It now also takes the mesh's own bind-pose box (stable
— it does not breathe with the cycle) and keeps whichever is bigger.

FENRIR RESKINNED, and the paws moved from `footL/R` to `ankleL/R` — which is the
bone the gait's foot rule drives, so the geometry that has to obey "hang off the
shin in the air, drive to 45° on the push" is now bound to the bone doing it.
Skin audit: 36 findings before and after (same list), total severity 1342 -> 1182
(-12%), worst finding 203 -> 160 (-21%); the two leg findings that named `footL`
and `footR` now name `ankleL`/`ankleR`. Ops arrive PINNED (a vertex list per op,
no `{comp:N}` ordinals), so nothing here depends on the rig's island numbering.

FENRIR JOGS LIKE A SPRINTER AND GALLOPS LIKE A WOLF
----------------------------------------------------
The quad gait's biped half was its own private copy of standard-ish numbers, so
at anything below a gallop fenrir moved like a heavy — the wrong body for a
wolf. It is now `base: 'sprint'`: he IS the sprint gait until he opens up, and
the rotary gallop fades in over the top of it.

GAITS CAN INHERIT. `base: '<id>'` merges group by group, key by key, resolved
once at load, so the animator, the workbench and every probe still see one flat
table and know nothing about bases. It is not sugar — copying sprint's numbers
into quad would read the same on the day it was written and drift the first time
sprint was tuned, which is the exact bug a shared gait table exists to avoid.
`formatGait` emits `base:` plus ONLY the keys that differ, so the workbench's
"Output gait" → paste-into-gaits.js loop preserves the inheritance instead of
silently freezing a copy of it.

THE TRANSITION IS A DIAL. `quad.onset` (0.40) is where the gallop starts coming
in and `quad.blend` (0.35) is how long it takes, so "when does he drop to four
legs" is tunable and visible instead of a hard-coded 0.4 inside applyQuadGait.

AND THE STRIDE SHAPING MOVED TO WHERE IT BELONGS. `legs.reach 1.2` /
`legs.extend -1.5` were the wolf's gallop written into dials that apply at EVERY
speed and to EVERY mech on the base gait — they would have landed on his jog,
and on viper. They are now `quad.hindReach 0.92` / `quad.hindExtend -1.66`,
added by the gallop layer and faded in with it. Ported so full throttle is
unchanged: at ratio 1 the old pair contributed `-1.2*fwd - 1.5*back` and the new
base+layer contributes `-(0.28+0.92)*fwd + (0.16-1.66)*back` — the same numbers.

MEASURED (tools/gaitprobe.mjs fenrir <throttle> sprint):
  · JOG, throttle 0.3 — quad vs sprint is a null diff: stride 55.3% vs 55.0%,
    reach 25.3% vs 25.1%, lean 10.0° both, armSwing 65.7° both, armPhase -0.97
    both. He runs the sprint gait, because he IS the sprint gait there.
  · RUN, throttle 1 — the gallop survives the port: stride 69.4% (was 69.7%),
    reach 38.5% (38.8%), trail 30.9% (30.9%), toeFwd -0.79 (-0.76). Sprint's
    knees and carriage improve two things on the way through — knee lift 39.6% ->
    46.0% and the airborne paw 36.1° -> 22.5° off its resting line (sprint's
    `ankle.hang`) — and cost one: the deepest sole dip goes -15.8% -> -20.9% of
    body height, since a higher lift and more bob deepen the trough. `quad.drop`
    is the dial that buys it back and it is the owner's to spend; the readout
    shows it live.

FENRIR: SPRINTER'S JOG, THE OWNER'S GALLOP, NOTHING GIVEN UP
-------------------------------------------------------------
Two attempts, and the second is the one that works.

The FIRST tried to say it with inheritance alone: `base: 'sprint'` plus the
gallop's stride shaping moved into `quad.hindReach`/`hindExtend`. Stride
survived that port exactly; the CARRIAGE did not. Sprint's knees, bob and lean
rode along into the gallop and put fenrir five points of body height deeper
through the floor, and it was reverted (correctly) on main.

The lesson is that his run end is not a variation on a sprinter. It is a
different animal, and no amount of patching one table into the other says that.
So: A GAIT MAY BE TWO TABLES. `runLegs` / `runAnkle` / `runArms` / `runBody` are
a second copy of the four pose groups, and `effectiveGait(gait, ratio)`
crossfades the gait from the first into the second over exactly the band the
quadruped layer fades in on (`gallopBlend`, `quad.onset` … `+ quad.blend`) — so
the carriage and the gallop arrive together instead of fighting on the way.

  · at the bottom the gait IS its base. Fenrir is `base: 'sprint'`, so he jogs
    like a runner: measured against sprint at throttle 0.3, every metric is a
    null diff (stride 54.3% vs 54.3%, lean 10.0 both, armSwing 65.7 both,
    armPhase -0.97 both).
  · at the top it IS the run table. The owner's tuned gallop is copied in
    verbatim, so from ratio 0.75 up the pose is BIT-IDENTICAL to the gait as it
    stood before any of this — worst joint difference 0.00e+0 rad over 64 phases
    at ratios 0.75/0.9/1. Not "close enough": the same numbers reach applyGait,
    so the same pose comes out.

THE NEW LANGUAGE TRANSLATES ITSELF. The run tables are the four groups, so every
dial added while this was in flight — `legs.adductTrail`, and the gallop's
`hindCarry`/`hindKneeCarry`/`hockCarry`/`hindSwing 1.80` — carried across with
no special case: the `run*` schema groups are DERIVED from the four they mirror,
so a dial added above is a dial here, in the table and in the workbench panel.
`quad.hindReach`/`hindExtend` stay 0 and are now redundant with
`runLegs.reach`/`extend`; they are left in place because the stride is expressed
through the legs group again, as it was when the gallop was tuned.

Everything downstream resolves the gait first — the animator caches it per frame
in `_gait` (scratch object, no per-frame allocation), the workbench adapter
resolves it inside `evaluate` and `phaseRate`. Miss one and half the body gets
the jog's numbers and half the run's.

In the panel this shows up for free: at 30% throttle the `run*` rows measure as
inert and hide, at 100% the base rows do — each labelled with the throttle band
it works in, so which table you are editing is never a guess.

…EXCEPT THE FOOT. The ankle is the one part of the old gallop that was not worth
restoring, so `runAnkle` names only two keys — `push 0.45` / `pushRun 0.35`, the
BACK-EXTENSION ANGLE asked for explicitly (0.80 rad = 46 degrees, against the
~86 the old table drove it to) — and the rest of the group stays sprint's at
every speed: the roll, the toe-down bias, and `hang 0.26`, which lets an
airborne paw hang at its resting line off the hock instead of being held at an
angle to the world (36 degrees off it before, 22 after).

That a run table can name TWO keys and morph only those two is what makes the
exception expressible at all — no flag, no special case, just the same
group-by-group, key-by-key merge the base does. Measured at full gallop: every
joint except the ankles is 0.00e+0 rad from the old gallop, and the ankles are
up to 40 degrees away from it, which is the point.

JERRY MOVES LIKE WHAT HE IS
----------------------------
His "arms" are the two big claw-limbs in front, his legs the smaller pair at
the back — and everything animating him assumed the opposite kind of body.

THE ARTHROPOD GAIT (`gait: 'arthropod'`, new in the GAITS table). A humanoid
walk read wrong on every count: the long stride swung his stubby back legs like
a man's, the counter-swing pumped the pincers like handbags, the upright
carriage stood the shell up like a suit. The new gait inverts all three — a
short quick SKITTER (stride 46.5% of body height vs 80.4% under standard,
cadence reach down/cap up so the step rate climbs instead of the stride),
SPLAYED CROUCHED legs (negative adduct, track 29.1% vs 21.9%, deep stance
bend), the CLAWS CARRIED raised and out instead of swinging (arm travel 9.5°
vs 69.9°), and a low level shell with a side-to-side scuttle waggle. Bonus:
sole min improved -6.6% -> -1.0% of body height (the shorter stride stops the
back legs reaching through the pavement).

THE HEAVY IS A PINCER CLAP. The default two-hand overhead smash meant nothing
on claw-arms that hang low in front — the impact frame showed him buried
face-first in the target, claws idle, landing at 0.95 of the victim's height
(crown-clipping). `heavyClip: 'clawSnap'` (cranky's clap: arms stretch wide,
smash together at the centerline) + the same `noTwistClips` rule, and the blow
lands at 0.72 — mid-chest, both claws visibly the weapon. Lights checked and
LEFT ALONE: on claw-arms the shared jab chain already reads as claw jabs, and
the only claw-authored alternatives (saurion's rakes) are tuned to a different
body's proportions.

THE BILGE SPIT NO LONGER LIFTS A CLAW OR SHOOTS SIDEWAYS — one fix, not two.
The pods do the aiming (the glbanim hook swings the firing pod onto his
facing), so the CLIP must not: the shared `shoot` raises an arm (hoisting a
claw for a shot that comes from a hull mount) and yaws the torso -18°, and the
pods are bolted to the torso — measured at the pod's peak swing, the left
barrel was still 13° across his body and the right 14° wide. The pod-swing
constants themselves were solved statically and are CORRECT to 0.03°
(L 0.512 rad wanted vs 0.515 shipped, R -0.612 vs -0.620); the clip's twist was
the whole error. New `jerryShootGlb`/`jerryShootLGlb` variants (GLB route only):
pitch-only shell-nod recoil, hips dip, claws untouched, and deliberately NOT
mirrored for the L side — any yaw moves the pods, so both sides share one
symmetric body. Measured at the fire line after: right -0.3°, left +0.2°.
Procedural jerry keeps the shared arm-raise clip on purpose — his muzzles ARE
in-hand there.

JERRY ROUND TWO: THE LEFT CANNON, CLAWS ON THE GROUND, ARM-LED LIGHTS
----------------------------------------------------------------------
THE LEFT CANNON WAS NEVER THE POD'S FAULT. The pod-swing constants and the new
recoil clip left both barrels within 0.3° of the facing — and the left stream
still flew wide in game, because World.fireRanged CHOSE THE WRONG MUZZLE to aim
with: `goo` was missing from the `_shotSide -> muzzleL` list, so a left-pod
spit computed its base aim, its barrel deflection AND its no-target fallback
point off muzzleR — which is not firing and rests splayed 35° outboard (only
the FIRING pod is swung onto the facing). Every left burst converged on a point
built 35° off the fire line. One word in the muzzle pick fixes it; measured in
a live battle after, both pods' wads fly within a few degrees of facing (the
authored ±0.03 rad spatter jitter is the remainder).

THE CLAWS TOUCH THE GROUND NOW, AND THEY CARRY THE GAIT. Four new arms dials —
FORELEG dials, 0 on every humanoid gait so the block never runs there:
  · `carry` — constant shoulder pitch planting the claw tips on the ground, at
    every speed (lift rides the throttle; a limb that bears weight cannot).
  · `foldClear` — elbow fold through the recovery swing, extend to plant.
  · `handGround` — the wrist doing ankle work: cancels what hips + shoulder +
    elbow pitched into the PLANTED claw so it stays parallel to the ground
    (footFlat, one limb pair up), fading as the limb lifts.
  · `handClear` — tips the SWINGING claw up so it doesn't plough a furrow.
The planted half of each claw's cycle is its backward sweep (cos-phase window,
smoothed like footStates); the counter-swing already runs the claws on the
opposite back leg's beat, which IS the diagonal-couplet timing insects walk on,
so nothing rephases. On jerry: arms.swing up 0.12 -> 0.45 (the claws are the
biggest limbs — they carry the bulk of the visible motion), carry measured on
the GLB at -0.30 = planted tip at -0.5% of body height (touchdown) with +37%
clearance on the recovery swing.

LIGHTS ARE CLAW WORK. The shared jab chain sells its punches with torso twist —
right for a boxer, wrong for a shell: the carapace slewing around WAS the
visible motion and the claws read as passengers. The jerry glbanim hook now
keeps the shell nearly square through light1/2/3 (torso pitch delta x0.35, yaw
x0.25, hips yaw x0.3 — cranky's crab rule) and scales the arms' travel AROUND
the rest carriage x1.35. Impact frame: the claw arcs overhead as the visible
striker, shell square, still landing in the aim band.

## Phase 16 — THE ARENA EDITOR: `?edit=level` edits the SHIPPED arenas (user request, 2026-08-01)

The level builder was a blank canvas with a palette: you placed a city one prop
at a time and exported it. What it could not do was open one of the twelve
arenas people actually play and change it, which is the thing a level tool is
for. It now does, and the palette has moved out of the way to make room for the
editing.

**PICKING AN ARENA BAKES IT.** The top bar's dropdown lists the 12 shipped
arenas; choosing one BUILDS it, for real, through the same `Arena` a match uses,
and hands back every piece of it as an editable object — massed towers with
their setbacks and ziggurat tiers, every prop with its own yaw and seed, the
lanes, hills, bridges, pools and the elevated loop. `seed ⟳` rerolls that
arena's layout. `?edit=level&arena=<theme>&seed=<n>` opens one directly;
`&theme=<id>` still means a blank level on that theme and `&load=<name>` still
edits a level file, so nothing that pointed at the old tool has moved.

**THE BAKE READS A BUILT ARENA, IT DOES NOT RE-RUN THE GENERATOR.** `Arena` now
writes each building and prop into `arena.recipe` as it places it (the RAW tint —
the authored path re-applies `tintFor`), `Terrain` already kept its lanes /
hills / bridges / patches / viaduct as plain data, and `src/arena/bake.js`
assembles a level from the two. A second implementation of the scatter rules
would be wrong the first time someone tuned the real one. `node
tools/arenabake.mjs` bakes all twelve, rebuilds each through `themeFromLevel`
and diffs what combat can touch — chunks, buildings, props, explosives, spikes,
campfires, lanes, hills, bridges, patches, viaduct segments, piers, bounds. All
twelve are identical. It deliberately does NOT count `propBodies`: a prop's
solid collider is measured off its built bounding box and props swap in a
generated GLB the moment one finishes streaming, so the same theme at the same
seed already disagrees with itself by a body or two — counting it would report
the game's own async as bake drift (measured: uptown 52 / 49 / 50 on three
identical builds).

Three things the level format grew so an arena can survive the trip:
  · a building may carry `cells`, an explicit massing silhouette, instead of
    the palette's plain nx·ny·nz box (`Simplify to box` in the inspector turns
    one back into the editable kind);
  · a level may carry a resolved `viaduct` block — `themeFromLevel` no longer
    forces `L.viaduct` to null, and `r0` pins where the two ramps sit, which
    was the one seeded number the deck could not otherwise reproduce;
  · viaduct PIERS are placed for authored levels too. They are derived from the
    deck rather than scattered, so they are never written into the recipe — a
    bake that recorded them would leave a second set behind on reload.
Ground patches and spawn points became first-class palette entries at the same
time, since a baked arena arrives carrying them.

**THE EDITING IS ON SCREEN.** Click to select, shift-click to add, shift-drag
empty ground to marquee a whole block. DRAG a selected object to move it and the
entire selection travels; ALT-drag leaves a copy behind. A small toolbar rides
above the selection — turn, copy, delete, properties — and a bright ring on the
ground under each selected object says which ones they are (a one-pixel
wireframe box vanishes at arena zoom, and the ring draws through whatever is in
front of it, which is how you find a selected prop tucked behind a tower).
R turns the selection about its OWN CENTRE, via a pivot the gizmo hangs off, so
one object and twenty behave identically.

THE GIZMO IS ROTATE-ONLY NOW. A translate gizmo sits exactly on top of the thing
you want to grab: its centre plane-handle swallowed every drag aimed at the
object under it, and the drag silently did nothing. Moving is the drag; the
gizmo is for the one thing a drag can't express.

Everything that was a permanent panel is now conditional: the palette is a
drawer behind ＋ ADD (searchable, grouped, stays open while you place), the
properties panel exists only while something is selected, and arena/view/
playtest settings live behind the gear.

Two bugs fell out of the rewrite, one of them old: the properties panel was
revealed by a CSS transition on `right`, which never advances under a stalled
animation clock and left the panel parked off screen — both panels are now shown
outright. And the playtest mech pickers were built by a `ensurePtPickers()` call
sitting BELOW the editor's `return engine`, so they never existed and Playtest
threw on `ptP1.value`; the fighters are now plain ids chosen in the settings
modal.

Files: `src/editor/leveleditor.js` (rewritten), `src/arena/bake.js` (new),
`src/arena/arena.js` (recipe + authored cells + shared pier placement),
`src/arena/level.js` (viaduct passthrough + cells), `src/arena/terrain.js`
(`V.r0`), `src/editor/catalog.js` (patches, elevated loop),
`tools/arenabake.mjs` (new), `src/core/knobs.js` (`arena`, `seed`).

JERRY'S ATTACKS ARE HIS OWN NOW
--------------------------------
LIGHTS: OVERHAND CLAW RAKES (bespoke jerryRakeR / jerryRakeL / jerryRake2,
LIGHT_ARM-registered so the combo alternation machinery works unchanged). The
shared jab trio was a boxer's kit — punches sold with 22-30 degrees of torso
twist and an uppercut third — and on a shell none of it reads: the carapace
slewing around was the visible motion, and an uppercut swings a downward-
hanging claw the wrong way. Each rake chambers the claw UP AND OVER the shell
past vertical, then slams it down-and-forward through the target; torso yaw
stays under 5 degrees, the arm is the whole show. The third blow is the
two-claw version: both chamber together and come down as one, with a knee dip
under the impact. The glbanim light-shaping hook (torso damp + arm boost over
the shared clips) is gone — bespoke clips authored with a quiet shell replace
what it was patching.

HEAVY: THE BARRAGE (jerryBarrage). Rear back — shell tips back and low, both
claws cocked over the top — then EIGHT quick forward-and-downward strikes,
arms alternating at 0.09s a swing, and a leaned-in shell that holds still
while the claws work. Every `hit` event resolves a full strike, so the
roster's heavy numbers are now PER HIT: dmg 11 x 8 = 88 potential against the
old single 76, knock 3 so the victim is pummelled in place rather than
launched off the second hit, launch 0. clawSnap goes back to being cranky's
(with its noTwistClips rule, which the barrage does not want — tracking the
victim through eight strikes is the point).

## Phase 17 — the arena editor becomes a WORKBENCH (user request, 2026-08-01)

`?edit=level` was the one authoring tool still living on the game page, because
it needed a real arena and the workbenches are a separate tree that imports no
game code. It now lives at `/workbench/?edit=level` like the other eight, and
the reason it can is a new contract section rather than an exception.

**`config.arena` — a THIRD family after characters and props.** A mech is an
asset you load; an arena is a RECIPE — a theme plus a seed that generates one
particular city — so what an editor needs from a game is not "load this" but
"build one of these, and tell me what you built". The section answers exactly
that: `themes()`, `build(engine, id, seed)` (a real arena, the way a match
builds one), `bake(arena)`, `stage(engine, level)` (the same themed environment
with nothing placed in it), `blank(id)`, `palette()`, `prop(name, opts)`,
`sharedMaterials()`, `levels.list/load`, `fighters()` and
`playtest(level, {p1,p2})`. `workbench/tools/level.js` now names no theme, no
prop, no level field and no game module — it imports three.js and the shared
panel chrome, nothing else, which is the same deal every other tool honours.

WHAT PLACEABLE THINGS EXIST is adapter data, not tool data: `src/editor/catalog.js`
moved to `workbench/adapters/robotworld/arenapalette.js`, since every entry in
it names a robotworld prop or lane kind. `src/editor/` is gone.

**NOTHING AUTHORING-SHAPED IS LEFT ON THE GAME PAGE.** `?edit=level` joins the
`?debug=skin` / `?rigedit=` redirects — it lands next door carrying `arena`,
`seed`, `load` and `theme`, so every bookmark, doc link and tools/*.mjs script
still works. `src/dev/index.js` no longer imports an editor at all; ANY `?edit=`
on the game page is now a pure redirect. A `RW_DIST=1` build already dropped the
/workbench/ page from the build inputs, so the distribution now contains none of
the editor — verified by grepping the emitted JS for its strings.

The last thing the game was still carrying was `arena.recipe`, the placement
list the bake reads. It is now written ONLY when the theme says
`recordRecipe`, which the adapter's `arena.build()` sets and nothing else does:
a match has no use for the list and does not ship the tool that reads it, so it
should not be building it either.

Two checks grew to cover the new surface. `tools/wbconfig.mjs` now proves the
editor's arena list is the game's THEMES (add a 13th arena and it is in the
dropdown with no edit to the adapter) and that every prop the palette names
still exists — the palette is an authored list, so it cannot be compared to
anything, but a renamed prop leaving a button that silently places nothing is
exactly the rot the tool exists to catch. `tools/arenabake.mjs` opens the
workbench page and asks Arena for its recipe explicitly.

Also fixed here, from the merged mobile-workbench work rather than this change:
`?mobile=` and `?phone` were read by `workbench/ui/mobile.js` but missing from
`KNOWN_PARAMS`, so `node tools/params.mjs` was failing and the boot warning
called two real switches typos.

Files: `workbench/tools/level.js` (moved from `src/editor/leveleditor.js`),
`workbench/adapters/robotworld/arenapalette.js` (moved from
`src/editor/catalog.js`), `workbench/adapters/robotworld/index.js` (+`arena`),
`workbench/config/contract.js`, `workbench/main.js`, `workbench/landing.js`,
`workbench/ui/panel.js`, `workbench/README.md`, `src/dev/index.js`,
`src/arena/arena.js` (`recordRecipe`), `src/core/knobs.js`,
`tools/wbconfig.mjs`, `tools/wbthumbs.mjs`, `tools/arenabake.mjs`.

WHY JERRY'S BLOWS WERE MISSING — THE HIT FIRED BEFORE THE CLAW ARRIVED
-----------------------------------------------------------------------
Reported as "the light and heavy attacks don't seem to land". Measured, it was
three separate things, only one of which was a bug.

THE BUG: A CLIP'S `hit` EVENT IS USUALLY AUTHORED ON THE STRIKE KEYFRAME, which
quietly assumes the body arrives the instant the key does. It does not — the
animator SMOOTHS toward each target, so the rendered pose lags the clip by a
fixed wall-clock amount. A gentle swing hides that. Jerry's claw rake travels
114 degrees in 0.12s, and at the authored hit time (t=0.30) the claw was still
UP OVER HIS OWN BACK: measured 0.25 body heights forward and 1.0 up — at his
own crown — reaching down-and-forward (0.57 fwd, 0.73 up) only at t≈0.32. The
blow resolved at the top of the chamber and swung at the air behind him. The
hit test was perfectly correct about a claw that was not there yet.

Fixed by moving each hit one arrival-lag past its own strike key: rake
0.30 -> 0.35, two-claw finisher 0.34 -> 0.39, and all eight barrage strikes
+0.03. Measured after: the rake resolves with the claw at 0.26 fwd / 0.50 up
(chest height, out front) and every barrage strike with its own arm forward at
0.24-0.40 fwd. Against cranky it now lands at 4, 6 and 8 units.

NEW TOOL, because this class of bug is invisible by eye and silent in every
existing check: `node tools/striketime.mjs <mech> [clips]` plays each clip on
the real fighter and prints where the striking hand is AT EACH HIT EVENT, in
the mech's own frame, next to where that hand's forward peak actually falls. A
healthy strike has them together; a sick one has the peak later, and the gap
IS the correction.

NOT BUGS, but worth knowing, both pre-existing:

 · CRANKY IS THE HARDEST TARGET IN THE GAME. His GLB hurtbox contains 51% of
   his geometry — worst on the roster by 11 points (next is titanus 63%,
   wraith 62%; jerry is 82%). His carapace is weighted almost entirely to the
   hips, so `pelvis` fits a 2.46 capsule while `chest` gets 0.71 — the big
   shell is nearly unhittable and `shinL` has no capsule at all. Any attacker
   whiffs on cranky more than on anyone else. Fixing it is a skin repaint, not
   a tuning change, so it is left as found and recorded here.

 · JERRY'S AI BARELY MELEES, BY DESIGN. `preferredRange` maps his `goo` to 18
   units ("outranges a slime gun"), and `melee` is `rangedPref <= 6` — so the
   CPU plays him as a zoner. Measured over 5400 steps: titanus threw 97 swings
   at viper, jerry threw 3 at cranky and 1 at titanus. His melee connect rate
   is close to meaningless as an AI statistic; he wins those fights with the
   Bilge Spit. This only matters when a HUMAN drives him, which is the case
   the fix above addresses.

CRANKY REPAINTED, AND THE HITBOX LEARNED TO SEE A CRAB
--------------------------------------------------------
He was the hardest target in the game (51% of his rendered body inside any
capsule, worst on the roster by 11 points). Two independent causes, both fixed.

1. THE CARAPACE WAS BOUND TO `head`. 41% of his vertices — the entire shell —
   rode the head bone, and `head` is a TERMINAL BLOB in the part table: fitted
   along its own longest axis with outliers culled, which is right for a skull
   and hopeless for a metre-wide crab shell. 61% of it fell outside its own
   capsule. Repainted onto `torso` (with the mouth plate, and `belly` onto
   `hips`) so the shell is ONE RIGID PIECE on the body bone, which is also what
   it should be visually — nothing about a carapace deforms; his motion is legs,
   arms and whole-body. The `chest` capsule now fits the shell: 39% -> 81%
   contained, and a real 855-vertex head remains for the head capsule. Selectors
   are BY BONE (`{sel:{bone:'head'}}`), not island ordinals, so a rig edit cannot
   renumber them. His arms and claws were left exactly as they were, as asked.

2. THE PART TABLE CANNOT NAME A SIX-LEGGED BODY. It describes a humanoid, and
   bucketsFromSkin folds every non-game bone UP into its nearest named ancestor
   — so cranky's four extra crab legs all landed in the `hips` bucket, and the
   pelvis capsule was asked to contain six legs pointing four different ways. It
   could not, and was bloated for trying. Now any bone carrying >=1% of the mesh
   that the table cannot name gets its OWN capsule (`x:<bone>`), derived from the
   skin so a new rig is covered the day it lands.
   ADDITIVE, and that is the whole design. Taking the geometry away from the
   ancestor was tried first and MEASURED: the big body capsules shrink onto
   what's left and containment fell on nine mechs (wraith 62->47, frogger 81->63)
   to buy cranky ten points. Overlap is free; a hole is not.
   Extra capsules are capped at half the torso radius — they are appendages, and
   uncapped the ±r box around a capsule out at the end of aegis' spear or
   frogger's fourth arm pushed both further into the bloat the metric exists to
   catch (3.00x / 3.08x; at half they sit at 2.56x, where they started).

MEASURED ACROSS THE WHOLE ROSTER, contain / bloat, before -> after:
  cranky  51->73  0.79->1.22     wraith  62->82  0.71->0.79
  fenrir  67->80  0.46->1.05     saurion 70->78  0.96->1.16
  tempest 75->80  1.43->1.43     titanus 63->66  0.87->1.02
  viper   72->75  0.59->1.00     colossus 80->82 1.26->1.33
  frogger 81->84  2.51->2.56     aegis   88->90  2.21->2.56
  rhino   84->84  jerry 82->83   nullbot 76->77  nova 64->65
  vulcan / inferno / glacier unchanged (no unnamed bone carries 1%)
Containment rose on twelve and fell on none; bloat moved TOWARD 1.0 on the four
that were furthest under it (viper 0.59, fenrir 0.46 — capsules that were
smaller than the mech they belonged to). Only aegis moved meaningfully the wrong
way, and it was already the roster's worst.

NOT DONE, deliberately: cranky's `shinL` still has no capsule (no geometry on
that span) and his hand/claw regions sit at ~48% — the claws are the skinning
the owner asked to keep.

## Cranky walks on all six legs, on the gait's clock

The report: "his animation speed should match his translation motion, but
instead it looks like he's slightly wiggling them and then floating along… he
should be moving his legs more (all 6 of them)… a lot of parameters that don't
seem to do anything… I stopped playing the animation, but his legs continued
moving… `Uncaught ReferenceError: refreshGizmo is not defined`."

Four symptoms, three of them the same cause. Cranky's crab walk was never the
gait system: the glbanim profile UNWOUND the biped stride back to rest as soon
as he moved, assigned the claw carriage from a constant table, and drove four of
the six legs from `postDress` off a private wall clock
(`_gaitPhase += (2 + 6*ratio) * dt`). So —

  · the legs kept running when the workbench paused, because pausing freezes the
    GAIT PHASE and that clock had never heard of it;
  · the cadence had no relationship to ground speed, because nothing connected
    them. MEASURED: the floor moved 7.9 u under a foot that travelled 0.33 u —
    `keep` 0.04, where the roster's own baseline (titanus, standard gait, every
    speed) is 0.73;
  · most of the panel's dials could not move him, because the hook undid them a
    frame later — and the dial-relevance scan could not say so, since it measures
    the pure `evaluate` pipeline and a glbanim `post` hook is not in it;
  · only 4 of 6 legs moved at all, the front pair deliberately frozen, the mid
    pair at half amplitude, the whole sweep 0.28 rad about an axis that mostly
    waggled the shin.

`refreshGizmo()` was unrelated and one line: the gait workbench's gizmo mode was
removed by another change and the call left behind in the canvas `pointerup`
handler, where it threw and killed the rest of the click.

### `hex` — a gait group for the other four legs

Built exactly like `tail`, and for the same reason: these bones are not the 15
game joints, nothing retargets onto them, one body has them. So the rig is
measured once (`hexLegsOf`), a pure pass (`applyHexGait`) writes their angles
into the pose target, and `Animator.applyHexPose` puts them on the rig's own
bones after the retarget. Twelve dials, in the panel automatically because the
schema is what builds it.

TWO THINGS ARE DERIVED, not authored, because either one wrong is invisible in
the numbers and obvious on screen:

  WHICH AXIS IS FORWARD. A leg swings fore-aft about the body's LATERAL axis, not
  its up axis, however far out to the side the leg is carried — the lever arm is
  how far the foot hangs BELOW the hip. That is why a crab's stubby side legs
  still take a real step (2.4 u per radian) and why sweeping them about the
  vertical, which was the obvious first guess, could not have worked: their feet
  sit ~1 u out horizontally and ~2.4 u down. Both axes are read off the rig (up
  from hips->torso, lateral from the two back hips), so it holds on a body facing
  any way with its legs anywhere.

  WHICH TRIPOD EACH LEG IS IN. Rank front-to-back from where each hip actually
  sits, then alternate by rank and again by side — front-left, mid-right,
  back-left, then the other three. A rig edit that moves a leg re-derives its
  place instead of quietly walking the wrong triangle.

The BACK pair is measured and NOT driven here: it carries the game leg joints, so
the ordinary stride already owns it (with the foot rules), and all it contributes
is the tripod parity the other four alternate against.

### The no-skate solve

`GAITS.hexapod` (cranky's, `base: 'standard'`) is that arithmetic rather than
taste. Ground per step is `pi * legLen * cadence * swing`; the two stride
amplitudes are set so the feet actually cover it:

  back pair   thigh pitch swings the foot 3.55 u/rad on this body -> swing 0.55
              at full speed = 3.7 u
  other four  their feet hang ~2.4 u below their hips, so they need a WIDER arc
              for the same ground -> sweep 0.90 = 3.7-4.3 u
  cadence     0.92 -> 0.70, which asks for 4.0 u

All three agree, which is the whole point — neither half of `keep` is authored.
MEASURED (`node tools/hexprobe.mjs cranky`), every leg, throttle 1:

  legMLhip 0.88   legFLhip 0.97   legMRhip 0.92
  legFRhip 1.07   thighL   0.96   thighR   1.13     (was 0.04 for all of them)

and 0.74-1.07 at a walking 0.35 throttle, against titanus' 0.74. Shell heave
2.6% of body height while running. The claw carriage that was `CRANKY_CARRY` is
`arms.carry/tuck/swing` now, so the arm rows mean something on him too: the
workbench reports 52 of 53 dials live where the old hook left most of them dead.

`tools/hexprobe.mjs` is new and reports both halves of the claim, plus the two
properties any gait-driven leg must have — pause freezes it (0.00000 rad drift),
standing returns it to the rig's rest angles (0.0000 rad). It also prints heave
BOTH ways, running and stepped phase by phase, because the pelvis-follows-the-feet
loop is deliberately slow and a probe that parks the cycle at each phase and lets
it settle reports a heave nothing on screen ever does: cranky reads 18.5% stepped
and 2.6% running, and the second one is the true number.

`legs.cadence`'s slider now reaches down to 0.1 and `cadenceCap` up to 60. Both
ranges were the sane band for a biped; a body whose legs cannot swing far covers
the same ground with many more, much shorter steps, and there has to be a way to
say so.

## …and he rotates his legs instead of pushing off them

Two things from the owner. The claw tune came back as a paste from
`?edit=gait` — `arms.swing` and `swingRun` to 0 outright (a pincer that big
reads as flailing if it pendulums with the stride at all), `tuck` reversed to
-0.15 so they carry out to the sides, `carry` up to -0.57 — and it went in
verbatim.

The other: "relative to his facing can we have his outward legs yaw more and
pitch less… like an arthropod his legs should feel like they are lifting,
rotating, and then lowering more than 'pushing off' the way humanoids do."

A LEG HAS TWO LEVER ARMS, and until now the hexapod layer only used one of them.
Turn a leg about the body's LATERAL axis and it swings under the hip like a
pendulum: that is the humanoid push-off, and how far the foot travels per radian
is how far it hangs BELOW the hip. Turn it about the body's UP axis and the leg
swings ROUND the hip, flat, like a hand on a clock face: that is what an
arthropod does, and the lever is how far the foot sits OUT from the hip.
`hexLegsOf` now measures both (`drop` and `reach`), so `hex.yaw` can mix them
and the cost of the mix is arithmetic rather than a guess.

It applies to all six legs, or he reads as two animals from the waist: the four
extra ones directly, and the BACK pair — which carries the game leg joints and
rides the ordinary stride — by taking that share of its thigh PITCH back out and
putting the same swing in as thigh YAW. In joint space, and the whole hex pass
moved to BEFORE `applyToeHang`, so no foot rule ever levels an ankle against a
leg that has since moved.

TWO THINGS IT COSTS, both measured, both paid for:

  GROUND. On these legs the yaw lever is a third to a half of the pitch one, so
  60% yaw takes about a third off the step. `cadence` 0.70 -> 0.48 (2.75 u asked
  per step, against 4.01). `node tools/hexprobe.mjs cranky` — travel over ground
  asked, per leg: 1.11 / 1.12 / 1.11 / 1.26 / 0.97 / 0.95, tighter than the
  0.88-1.13 the pure-pitch version managed, against the roster's 0.73 baseline.
  `midAmp` 1.0 -> 1.25 and `frontAmp` 0.85 -> 0.80 trim the two pairs against
  each other, because this rig's legs are not equal — the mid pair's feet sit
  barely half a unit out from their hips, so a yaw-heavy stride shortchanges
  them most.

  LIFT. A pendulum raises its own foot at both ends of the arc for free; a leg
  swinging flat round the hip stays at exactly the height it started, so every
  bit of "lift, rotate, lower" has to come from `hex.lift`/`fold`. Straight after
  the yaw went in the front pair's foot clearance had fallen to 13/16% of body
  height. lift 0.22 -> 0.34, fold 0.45 -> 0.62 (and their @run twins) puts it at
  19/24%, and the mid pair at 31/33%.

Shell heave fell to 0.7% of body height running (from 2.6%) — a flat swing does
not heave the body the way a pendulum does. hexprobe prints both levers and the
mix per leg now, so the next person to move that dial can see what it will cost
before they move it.

NOT DONE: the mid pair's feet still dip ~2% of body height below the floor at
the bottom of the stance and the front pair's still float ~3% above it. That is
the rig placing the right-hand legs lower than the left, not the gait — one
`splay` cannot raise one pair and lower the other.

## KONGA + TRITONE JOIN THE ROSTER, a shorter SAURION, and the pointer in mech select (user request, 2026-08-02)

Both work-in-progress apes are ready enough to fight, so `hidden: true` came off
KONGA and TRITONE — that one flag is the whole gate, since every workbench
already saw the full ROSTER and only `playableRoster()`/`isPlayable()` filter it.
AEGIS and NOVA stay hidden.

What the flag does NOT bring with it is the POSTER. Neither had one, and a mech
with no entry in `posters.json` quietly falls back to building a real model on
every keypress in mech select — the exact cost the posters exist to avoid, and
invisible because it still looks right. `node tools/posters.mjs konga tritone`
merged them in (it MERGES on a named run; a bare run would have re-shot the lot).
Icons needed nothing: both already had hand-made badges on disk AND in `BADGES`,
so `tools/iconcheck.mjs` was green before and after.

SAURION IS 20% SHORTER (owner call), which is two numbers because he is two
bodies. The GLB's height is PINNED by `modelScale`, so the artist knob is
`heightScale: 0.8` in the manifest; `body.scale` 1.12 -> 0.896 shrinks the
procedural build and everything derived from the dims (anchors, muzzle units,
the canonical height). Measured with `tools/ankleprobe.mjs`: ankle 0.297 ->
0.237 and foot depth 0.305 -> 0.244, both exactly 0.800, with `depth%h`
unchanged at 4.3/3.2% — a uniform shrink, not a squash. Poster re-shot.

MECH SELECT LEARNS THE POINTER PROPERLY. Three things, all in the one screen:

- A CLICK ON A ROBOT IS A TOGGLE. Clicking the cell you are standing on locks
  it in as before; clicking that same cell again LETS IT GO. A locked mouse
  user previously had no click that undid the lock at all — B/Esc only. The
  unlock path is now one `unlock(pk)` shared with the pad's B.
- THE BOTTOM CARDS ARE THE LB/RB RING. A click no longer cycles a slot
  outright: the first click VISITS it (`pk.sel = i` — the same state the
  bumpers set, so the card frames in your colour and ↑↓ drive it), and a click
  on the card you are already visiting walks its options. Your own card is
  HOME: it brings you back while you are visiting, and only leaves the match
  on a click with nothing visited. With no mouse picker at all (everyone on
  pads) a click is still the plain step through the ring it always was.
- CLICKING NOTHING DESELECTS. A sticky focus that re-aims ↑↓ at somebody
  else's card needs somewhere to be put down, so a capture-phase window click
  outside `.roster-cell` / `.player-card` / `.hot-btn` / the touch bar clears
  it — the 3D stage, the heading, the bare backdrop all work.

And the SELECT-button glyph beside "use pointer" sat a whole radius below the
line of text. `.xb-btn` is an inline-FLEX box, so its baseline is its first flex
item's — the top bar of the three-line glyph, a third of the way down the circle
— and the `vertical-align: -4px` nudge was pushing an already-sunken box further
down. `vertical-align: middle` ignores the phantom baseline and centres it.

## KONGA'S SKIN, take two — and what the chest beat actually shows (user request, 2026-08-02)

An owner export from `/workbench/?edit=skin` landed konga's skinOps at 40 ops:
the 35 that shipped plus five new ones moving ~4.8k vertices of HEAD, JAW and
TORSO. Applied with `tools/manifestfmt.mjs`'s surgical splice, so the diff is
the five new lines and nothing else.

ONE THING THE EXPORT COULD NOT CARRY. The panel writes the feather block from
its own dials, and this one came back as a flat `radius: 0.04` — losing the
`pod*: 0.012` hairline band that keeps the bolted-on missile launchers crisp
against a soft ape. Swept against the NEW op set (skin-audit severity total,
`node tools/skindebug.mjs konga`): 0.035 → 349.4 · 0.04 → 290.3 · **0.045 →
281.8** · 0.05 → 313.7 · 0.055 → 418.3. The shipped 0.045 is still the optimum
on the new ops, and the pod band costs nothing measurable (0.04 flat and 0.04
+ pod both total 290.3 — the audit cannot see a seam that never exceeds a
limit, which is exactly why the band is authored rather than derived). So the
ops are the export's and the feather block is the one that shipped.

Where that leaves the audit: 22 findings / 270.7 before, 25 / 281.8 after. THE
TOTAL WENT UP AND THE PICTURE GOT BETTER, which is the thing to understand
about this number — the audit only samples edges whose ends carry DIFFERENT
weights, so geometry that was welded flat to one bone contributed nothing and
now that it articulates it can be measured. `featherprobe` reads 0.125 mean
dominant-weight jump across 5302 border edges, the same 0.12 the band was
tuned to.

THE CHEST BEAT (`chestBeat`, konga's finisher roar — `game/finisher/konga.js`,
and the clip `face.js` bares his teeth on). Frozen frame by frame with
`tools/pose.mjs`:

- THE SKINNING IS BETTER WHERE THE MOVE LIVES. At the first drum (t=0.42) the
  old bind smeared the orange chest harness up over the sternum in a long
  stretched wedge; it now stays a compact band with the abdomen reading
  underneath. The shout (t=0.92) is the same story, and from behind the pods
  and shoulders are unchanged — crisp, no spikes, no tears anywhere in the
  clip.
- WHAT IS NOT A SKINNING PROBLEM: HIS FACE IS GONE from the drum onward. The
  clip pitches `torso` back 26° and then `head` back another 30 (34/34 at the
  shout), so the skull folds ~60° onto the upper back — measured on the bones,
  the JAW ends up ABOVE the head joint (7.3 vs 6.5) and behind it, i.e. the
  mouth points at the sky. From the player's camera you see the top of the
  crest and a featureless black hump where the face should be; from BEHIND he
  reads perfectly. It is the same before and after the reskin, so it is
  authored pose, not bind — but it defeats the one clip that has a face
  expression attached. The fix is a couple of numbers in the clip's head keys
  (roughly halve the head-back on the 0.26/0.92 keys and let the torso carry
  the rear-up), NOT touched here: it is authored art and the ask was to verify.

## KONGA'S CHEST BEAT: the owner's clip pass, and a face that stops melting (user request, 2026-08-02)

THE CLIP. `KONGA_TAUNT` — his chest beat — came back from the pose workbench
with five keys reworked. What changed is the ELBOWS: the beat was authored as
elbow PITCH alone, which drives the fist up the centre line and lands the
knuckles edge-on, and the pass puts real yaw/roll into each one (0.42's left
elbow goes [-160,0,0] → [-17.1,-49.9,78.3]) so the fist turns over and arrives
FLAT on the pec, with the off arm holding its own cocked angle instead of the
mirrored pitch. Applied verbatim; the comments around the keys were kept and
one added to say why an elbow has three numbers in it now.

THE FACE. Reported as "that weird deform thing", and it is the FEATHER, not
the clip and not the bind: `radius 0.045` of the model's longest dimension is
wide enough to swell a shoulder into a chest, and on a head that size it also
reaches the MUZZLE — so the snout carried a minority torso weight and was
dragged into a smooth droop with no mouth line every time he leaned into a
beat. Proved by rendering the same frame with the feather op stripped (crisp
face, hard seam under the jaw) against the shipped one (melted muzzle).

Three answers, all rendered at the same frame and camera:
  · `rigid: [head crest jaw snout brow*]` — face solid, but it opens a visible
    GAP UNDER THE CHIN. Rejected.
  · face band 0.028 — muzzle still soft. 0.02 no better.
  · **face band 0.012** (`head`/`crest`/`jaw`/`snout`/`brow*` in the same
    per-bone table the pods already use) — brow, eye sockets, muzzle and mouth
    line all hold their shape, and the neck keeps a hairline blend rather than
    a seam. Shipped.

What it costs, stated plainly: the skin audit reads a narrow band as stretch,
so konga's severity total goes ~283 → ~340. ALL of that is the face seam —
non-face findings total 113.8 before and after, to the decimal, in every
configuration measured. The audit is a proxy for "does this look wrong", and
here it points the wrong way: a solid face is what the owner asked for and
what a gorilla should have. Same reasoning the pods have shipped on since they
were given 0.012.

(POSTSCRIPT, same day — see the next entry: the head band went back to 0.028
once the jaw stopped moving, which is where the ~340 goes back to ~285. And
the audit total is noisy run to run, so those two figures are the shape of the
answer, not the answer to a decimal.)

## …AND THE JAW WAS THE THING MOVING (user request, 2026-08-02)

The owner's read of the previous fix: "it looks like the jaw bone is moving
separately from the head — can you keep the jaw fixed to the head?" Correct,
and it is the cause rather than a symptom. `taunt` is in face.js's ROAR_CLIPS,
so through the chest beat the face performance opens konga's jaw to `jawRoar`
0.62 rad — 35° — on top of everything the clip does. His jaw ISLAND is the
auto-mesher's, not a mandible: ~4.2k vertices covering the throat and the whole
lower muzzle. Rotating that 35° swings the mass down his chest, and the face
tears into vertical streaks — visible in a head close-up at the roar peak
(t=0.9), and NOT fixable with any feather band, because no weighting saves
geometry from a bone that shouldn't be carrying it.

`jawFixed: true` on FACE_PRESETS.konga is the fix: `driveFace` skips the jaw
write and the mouth never opens. Brows, head gesture, roar shake and the torso
bellow all still run — the acting layer is untouched, it just performs with a
closed mouth. The jaw numbers stay in the preset (they are right for the face)
so the day the jaw is rebound to just the mandible, deleting one flag brings
the roar back. Tritone is unaffected: his beak is a real beak and still opens.

AND IT PAYS THE PREVIOUS ENTRY BACK. The 0.012 band on `head` was bought to
stop the muzzle melting; with the jaw frozen, the melt is gone at the source,
so `head` went back out to **0.028** — the neck is that border, and a hairline
there is a seam, while the four genuinely-face bones (`crest`/`jaw`/`snout`/
`brow*`) stay at 0.012. Rendered at the same frame, 0.028 reads no softer than
0.012 in the muzzle and better at the throat; 0.045 (no head band at all) is
visibly waxy. Severity ~285 against ~340 at 0.012.

CAVEAT LEARNED THE HARD WAY, now in CLAUDE.md: `tools/skindebug.mjs`'s total
is NOT deterministic. It samples clips as they play, so a slow SwiftShader run
catches fewer frames — three runs of the identical manifest gave 286.0 / 305.8
/ 313.2, with the top finding sampled over 25 frames one run and 11 the next.
±10% is noise. The stable part is the non-face 113.8, which held to the decimal
across every configuration in both entries, and that is what says these changes
touched the face and nothing else.

## ARENA DESIGN SYSTEMS: swappable procedural layout + three new designers (user request, 2026-08-05)

The arena generator's WHERE became pluggable. themes.js keeps saying what a
place is made of; a DESIGN SYSTEM (`src/arena/designs/`) now plans where it
all stands — an optional reworked `theme.layout` handed to the Terrain,
building sites, and a per-spec prop placement map — and arena.js executes the
plan through the exact code the old scatter ran (massing, tints, `_regProp`,
recipe recording), so designed arenas bake and play through every existing
path. The FALLBACK is the absence of a plan: `arenaDesignSystem()` returns
null and the original generator runs byte-identical.

Research first (docs/ARENA_DESIGN.md carries the brief + sources): Kevin
Lynch's five city elements (paths/edges/districts/nodes/landmarks) and
real-world block scale for the urban systems, and deathmatch-map grammar
(circulation loops, sightline control, rotational symmetry for fairness with
exactly one deliberate break, alternating cover and kill ground) for the
combat one. Plus the owner's authored Neon District, read as a design
language: buildings in street-wall blocks, props in FORMATIONS — pillar rows
spaced ~8, a substation farm grid, a kiosk quarter — and the centre kept open.

Three systems ship, all torus-continuous (placement spans the whole wrap cell,
distances measured wrapped, structures deliberately straddling the seam):

- CITY WARDS (default): a jittered periodic 3×3 ward grid with shuffled roles
  — dense block grids, a tower court, a market bazaar of the theme's mid
  props, yards nesting the clumped props, paved pocket plazas (one or two),
  scatter breathing room. The seam ring carries ordinary city.
- GRAND AXIS: the theme's road lanes reissued as straight boulevards through
  the spawn plaza AND along the cell border (the seam becomes a street,
  continuous by construction), street walls filled plaza-outward, gateway
  towers on the plaza diagonals, cell-corner towers that wrap-assemble over
  the border crossing, heroes terminating vistas.
- COLOSSEUM CIRCUIT: rotationally-symmetric bastion ring stamped from one
  template (spawn fairness) with open gates between, inner cover pods for the
  orbit, ONE extra-tall spire as the orientation break, corner clusters
  assembling across the seam.

Props are classified by SPEC SHAPE only (count 1 hero · 2 gateposts · 3-4
dressing · >=5 rows/rings with authored yaw via placeProp's `opts.ry` ·
`clump` stays a nest at the same budget), so every theme's palette — and any
future theme's — lands in formations with no per-theme table.

Grown for this: the `pave` ground patch (a designed square: crisp disc + rim
+ optional accent glow, no hazard, in the arena editor palette), and the
battle harness's `?overhead=1|2` layout-judging view (straight down, fog off,
whole cell / cell + wrap neighbours).

SETTINGS: "PROCEDURAL ARENAS: ON/OFF" is now "ARENA DESIGN:
AUTHORED / CITY WARDS / GRAND AXIS / COLOSSEUM / FALLBACK"
(`CONFIG.arenaDesign`, `?design=<mode>`; `?procedural=1` still = fallback;
the old pref migrates ON->fallback, OFF->authored). AUTHORED — the default —
plays the hand-built levels where they exist and hands every other arena to
CITY WARDS.

## PROPS THAT KNOW HOW TO STAND + the building-variety audit (user request, 2026-08-05)

Reported from Desert Ruins: sphinxes at odd angles. The design systems knew
how MANY of a prop to place and roughly where, but nothing knew what a prop
IS — so a count-2 sphinx spec got generic gatepost treatment and a random-ish
yaw. `src/arena/designs/proptraits.js` is that knowledge now: a per-prop-name
table of PLACEMENT TRAITS, refining (never replacing) the shape classes, so a
prop absent from it still lands sensibly and a new theme needs no entry.

The one fact that makes it cheap: EVERY PROP'S FRONT IS +Z, measured off the
builders (sphinx head, idol eyes, billboard face, bus-stop opening, bandshell
mouth all at +z; every gate passes through along z; pipes are the `long:'x'`
exception). So the whole vocabulary is a yaw rule plus a grouping rule:
- face:'center' — sacred/monumental props aim at their region's focal point
  (the battle circle, or the pocket plaza they stand in); sacred PAIRS flank
  a gated approach, symmetric about its axis, both facing in
- face:'gate' — gates sit ON a walkable lane where it crosses the plaza rim,
  passage along the path; a blocked gate slides ALONG its lane, never off it
- face:'road' — billboards, streetlights, bus stops turn square-on to the
  nearest street
- grid — industrial fixtures snap to the world grid; a grid clump is a YARD
  (one shared yaw per container/quonset nest)
- lane — pipelines, carts, parked vehicles lie along the nearest path
- solo / centerpiece / scatter — campfires isolate, fountains take a plaza's
  middle, ferns stay organic

The shared trait pass (designs/proparrange.js) handles gates/flanks/
centrepieces/solos identically in all three systems (they are focal-point
geometry, not system geometry); each system's own rows, dressing, nests and
heroes resolve yaw through traitYaw. Measured, not eyeballed:
tools/scratch/traitprobe.mjs builds a battle headless and reports facing
deviation (vs the centre OR the prop's own plaza), gates on-lane, grid-snap
share and solo spacing — ruins under all three systems: every face-centre
prop at 0.0°, the great gate ON the processional way, sphinx pair at
(-10,-55)/(10,-55) flanking it symmetrically.

AND THE BUILDINGS: THEME_MASSING audited so every theme draws >=4 silhouette
families, four new ones grown for the gaps — `court` (three wings round a
courtyard: neon/uptown/skyterrace/ruins), `ruin` (per-column ragged heights,
one surviving facade line: ruins/jungle/volcano/scrapyard), `dome` (stepped
circular shrink: frozen/quarry/orbital), `silo` (2×2 tank battery off a
shared base: foundry/harbor/scrapyard). Themes may now name their OWN facade
and roof (`buildings.facadeTex`/`roofTex`, hasTex-gated so inert until the
images land); docs/ASSET_REQUESTS_ARENA_DESIGN.md carries generation prompts
for ten facades/roofs (sandstone ruin, mossy temple, arctic panel, basalt
plate, rock-cut crystal, station hull, dock corrugated, rust patchwork +
two roofs) for the owner to generate — the eight themes still wearing the
four shared facades are the ones named.

Verified: bake round-trip all 12 themes × 3 designs, soaks clean (ruins
avenues + authored neon), traitprobe green on ruins/jungle/harbor/frozen/
neon across systems, build green.

### …and two things the sphinx fix uncovered

TRAIT YAW WAS RIGHT AND THE STATUE STILL SHOWED ITS BACK. Two separate bugs
sat under the reported one, and neither is visible in the placement numbers:

1. A PROP WAS ALLOWED TO STAND INSIDE A BUILDING. Prop clearance was a fixed
   radius from a building's SITE COORDINATE — but that coordinate is the
   MIDDLE of a massed silhouette up to 20 units across, so 10 units of
   clearance is inside the lobby. Measured on Desert Ruins: the sphinx pair
   at gap 0.0 from the nearest building (20x20, 22 tall). Buildings are built
   before props are planned, so arena.js now hands the planner their REAL
   boxes (`ctx.footprints` off `destructo.buildings[].aabb`) and the
   validators reject by box. Guardians additionally require a clear
   SIGHTLINE to the focal point (`sightlineClear`) — one standing behind a
   street wall has a perfect yaw nobody will ever see.
2. THE MODEL DISAGREED WITH THE YAW. A placed prop renders an imported GLB
   turned by the prop manifest's `ry`, and tools/propyaw.mjs only aligns the
   model's LONG AXIS (mod 180) — a sphinx's long axis is head-to-tail, so the
   model was axis-perfect and back to front. At 0.0 degrees of measured yaw
   error the statue faced the fight with its haunches.
   `tools/scratch/propfront.mjs` measures where a MODEL's mass sits high up
   in the prop's own frame and names the reversed ones: `sphinxStatue`
   (ry 90 -> 270) and `crystalMonolith` (+180, its tall spire now leans over
   the arena instead of away). Fixed in the manifest, so the fallback scatter
   and the authored levels get it too. It judges GLB-backed props ONLY — the
   procedural builders define the convention, and the heuristic is fooled by
   a flat-topped one (the jungle idol's face is at +Z; its moss cap is the
   top third).

Re-verified after both: traitprobe green on ruins/jungle/neon/harbor across
all three systems, bake round-trip 12 themes x 3 designs, propshell mean
phantom skin unchanged at 0.68, soaks clean (ruins/avenues, quarry/wards,
authored neon), build green.

## NOT EVERY LARGE STRUCTURE IS A BUILDING (user request, 2026-08-05)

Six arenas stopped being cities with a reskin. A STRUCTURE KIND
(src/arena/structures.js) keeps a big mass's gameplay identical — the same
destructible chunks, so it collapses, damages, gives cover, carries fountains
and is climbed exactly like a tower — and changes what it is made of: a
silhouette from a new LANDFORM family in massing.js (mound / columns /
spires / iceWall / berg), its own cell scale, its own palette, and its own
MATERIAL. A material means a second InstancedMesh, so the arena builds one
DestructibleSystem PER MATERIAL FAMILY the theme uses and `destructoAll` is
what every combat query walks (climb.js and fountains.js included, so a
crystal spire is climbable and can hold a fountain).

WHICH SITES CONVERT IS BY GROUP. A theme declares `structures:[{kind,share}]`
and whole clusters convert — volcano 62%, quarry 62%, frozen 60% — because a
crystal spire between two office blocks reads as a mistake while a field of
them reads as a place. Scattered sites are nested into spatial groups first.
It runs in arena.js after the sites are chosen, so all three design systems
AND the fallback scatter get it from one place, and the recipe records
`struct` so a baked arena comes back as crystal rather than as towers
(arenabake now fingerprints every system, and all 12 x 3 designs pass).

- VOLCANIC FORGE: basalt mounds and jointed column cliffs, ember-lit cracks;
  a third lava lane and four lava lakes at `organic: 1.0`.
- CRYSTAL QUARRY: jagged spire clusters in six hues, crystal massifs, rock.
- FROZEN OUTPOST: icebergs, SEMI-TRANSPARENT cut-ice walls with gateways and
  ice towers (destructible like everything else), twice the snow drifts.
- DESERT RUINS / JUNGLE TEMPLE / ORBITAL: no structures — instead their
  massing lists lost every rectangle. New monumental shapes: `pyramid`,
  `mastaba`, `desertTemple` (pylon-fronted hall), `jungleTemple` (stepped
  temple with a stair spine and a shrine crown), `habitat` (round tower with
  an observation crown), `ringHab` (drum base, octagonal block, mast).

ORGANIC PATCHES: `organic` (0..1) on a patch spec replaces the three-blob
circle with 6-9 lobes reaching 1.35r. THE PAINT AND THE HAZARD READ THE SAME
LOBES — paint one shape and burn another and you get fire you can stand in
and ground that burns from nowhere.

### The bug underneath: per-chunk colour was doing NOTHING

Chased from "why is my basalt mound white". `setColorAt` fills
`instanceColor`, and three folds it into vColor in the VERTEX stage — but the
FRAGMENT stage only declares vColor under USE_COLOR, i.e.
`material.vertexColors`. Turn that on and the vertex stage ALSO runs
`vColor *= color`, reading a per-vertex `color` attribute a BoxGeometry does
not have; WebGL supplies (0,0,0) and every chunk goes black. Both halves are
needed: the chunk geometry now carries a WHITE colour attribute and the
materials set `vertexColors: true`. Until this, every theme building tint and
every colour a voxelized GLB donor sampled from its own texture was computed
and thrown away. Buildings are tinted now too — with the texture pack on
`tintFor` already lerps 68% toward white, so neon and uptown are
pixel-identical and the tints finally mean something at `?textures=0` and on
donors.

AND THE GLOW IS DIFFUSE, NOT EMISSIVE. `emissive` is a uniform: one material
cannot glow in six crystal hues, and a uniform emissive over near-black
basalt washes the rock to white — exactly how the first build looked. A
saturated instance colour plus the bloom pass is what reads as lit from
within, per chunk, in its own hue. (A shader patch multiplying emissive by
vColor was tried and removed: it never applied, and the diffuse route is
simpler and needs no program-cache games.)

Verified: build green · bake round-trip 12 themes x 3 designs · soaks clean
(volcano/quarry/frozen/ruins + authored neon) · climbprobe worst up-turn 1.4
deg with no unexplained movement · propshell mean phantom skin unchanged at
0.69 · traitprobe green. New textures requested in
docs/ASSET_REQUESTS_STRUCTURES.md (struct_basalt_rock, struct_crystal_facet,
struct_ice_glacier, struct_ice_cut, struct_rock_grey) — all hasTex-gated and
already prefetched by arenaTexEntries, so they slot in on commit.

## ONE HOME FOR TEXTURES, and a check that says when art goes missing (user request, 2026-08-05)

The owner noticed generated textures being committed to `public/textures/`
and asked which location was right. The answer: `src/textures/` — and the
DOCS were the bug. `core/texload.js` globs `src/textures/**` at build time,
which is what makes `hasTex()` synchronous (arena.js picks a building's
material inline, pbrtex does the same per mech skin); `public/textures/` is
never read. `docs/TEXTURE_GEN_PROMPT.md` had said "commit them to
public/textures/" since the pack was written, and both of my asset-request
documents repeated it — so ten delivered facades landed where nothing would
ever look at them. All three documents now name `src/textures/`.

MOVED: the ten delivered building facades/roofs into `src/textures/building/`
(all 12 themes now resolve the facade they ask for — ruins in sandstone,
jungle in mossy temple stone, orbital in station hull, volcano in basalt
plate, frozen in arctic panel, quarry in rock-cut crystal, harbor in dock
corrugated, scrapyard in rust patchwork), and `public/sprites/` into
`src/textures/sprite/`. The sprites were the second texture area the owner
was right to find odd: they are material textures, so they now live with the
pack, their manifest is IMPORTED rather than fetched (the slot table needs no
round trip and a sprite cannot 404) and the files resolve through a glob.
All five slots verified loading.

THE RULE, written down in ASSETS.md: an asset lives in `src/` when the code
must ENUMERATE it at build time (textures, the soundtrack) and in `public/`
when the code FETCHES it by name at runtime (models, levels, badges, thumbs,
posters, sound — all addressed by identity, most with their own manifest).
Applied to the tree, exactly one thing was in the wrong place, which is a
good sign the rule fits.

AND ART THAT GOES MISSING NOW SAYS SO (`src/core/assetcheck.js`, at boot and
in the ?battle harness). The pack is deliberately optional — every lookup is
hasTex-gated and falls back to procedural — and that tolerance means a
texture that VANISHES looks exactly like one that was never made. So every
name the data declares (per-theme sky, horizon, ground, facade, roof; every
structure kind's material; every sprite slot) is checked once and missing
ones are a console.error naming the file and the path. Requested-but-not-yet
-delivered art is listed in PENDING_ASSETS, and a pending entry that TURNS UP
is reported too, so the list cannot rot into crying wolf (the same
both-directions rule tools/iconcheck.mjs uses for badges).
`node tools/assetcheck.mjs` runs the same check from the command line and
adds a stray scan of `public/textures` / `public/sprites`. Proven to fail in
both directions before being trusted: hiding a delivered facade reports
MISSING, and dropping a PNG back into public/textures reports STRAY.
