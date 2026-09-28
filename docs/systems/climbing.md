# Surface walking

How a mech with a `climb` block walks on the world instead of the floor: the field model, the latch, the limb stepper, the camera.

These notes were the body of CLAUDE.md, which is now an index into this
folder. Each entry names the mechanism, why it is built that way, what was
measured, and the tool that checks it — most of it was learned by breaking it.

- SURFACE WALKING (`src/combat/climb.js`, dials in `TUNING.climb`) belongs to
  whichever roster def carries a `climb` block — today only JERRY, who also has
  the roster's biggest jump. (He PAID for the walls with his jets for a while —
  `stats.noHover: true` — on the theory that a flier would never bother
  climbing; he wouldn't have, but a jet gets you UP and the walls get you
  AROUND, so he flies now and the flag is gone.) fighter.js owns four call
  sites and no logic.
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
  A SMALL OBSTACLE IS NOT A WALL, and the body only reorients when it has to.
  Two questions are asked separately now. IS THERE A FLOOR — a GROUND-ORIENTED
  top within a step of his feet (`groundSupport`, and a top only counts if the
  space above it is clear, or every chunk of a facade reads as a storey he
  could stand on)? And IS STANDING ON IT GETTING HIM ANYWHERE — measured as
  how much of the movement he asked for he actually got (`climbState.blocked`).
  With a floor under him he stays UPRIGHT and simply rises and falls over the
  thing, which is the scramble; he commits to a new plane only when he has
  NOWHERE TO GO BUT UP. That commitment is a LATCH, not a comparison: reading
  the blockage fresh each frame makes a limit cycle (he adopts the wall, moves,
  is handed back to the floor, stops — measured parked at the foot of a tower
  with `blocked` sitting on the threshold), because moving freely is what
  climbing looks like. He commits when blocked and uncommits when there is
  somewhere to stand again.
  WHICH PLANE HE COMMITS TO is the thing that STOPPED him, not the field
  average. A body held out of geometry touches a wall at a full radius, where
  a distance-weighted average still favours the floor at his feet (measured:
  0.83 up while pressed against a facade — a 34° plane nobody can climb), so
  the normal comes off the shove that pushed him back (`climbState.blockN`).
  POSTURE AND DIRECTION ARE SEPARATE (roster `climb.upright`, 0..1). JERRY (0)
  becomes part of the wall — his up IS the face's normal, so he walks it like
  ground and points head-down coming back. KONGA (0.82) commits DIRECTIONALLY
  ONLY: "forward" means "up the face", but he stays vertical and hangs off his
  hands, hauling himself up and backing down with his head still up, because
  that is the only way a shoulder works. The stick is mapped through the
  SURFACE and the body's posture damped separately — one rotation for movement,
  another for the frame. Two consequences to remember: the field must be
  sampled along the SURFACE normal rather than the body's up (sampling above
  the feet of a vertical body keeps the floor dominant and the climb never
  starts), and its range must exceed the body's own radius (`f.radius * 1.85`
  floor) or a body that cannot penetrate can never feel what it is touching.
  THE BODY STAYS OUT OF GEOMETRY (`pushBodyOut`): a stack of spheres up his own
  axis, shoved out of anything they are inside, twice a frame. Everything else
  in the walker positions a POINT, which says nothing about his chest or his
  skull — so a mech hugging a facade used to put his torso through it. LIMBS
  ARE EXEMPT by construction (this only knows the body axis), so hands and feet
  stay free to grip whatever they like. Judge it with the `body=` column in
  `tools/climbprobe.mjs`, which reports the worst overlap per scenario: konga
  0.07 and jerry 0.06 typical, 0.38 worst on a fast sideways facade crossing.
  Note the wall STANDOFF for a committed body is its own RADIUS, not the
  hairline the sample uses — the two rules fought and left the body 0.6 units
  inside the building for a whole climb.
  NOTHING TO HOLD IS NOT A PLACE TO BE, and it is the rule the rest of the
  walker is servos around: a surfaced body is TOUCHING what it is on — its own
  shell against a surface, or a hand or foot planted on one — and a body clear
  of everything for `TUNING.climb.holdGrace` simply LETS GO, because falling is
  honest and hovering never is. Hanging off a single grip counts, which is the
  whole point of an ape. THE NUMBER IS MEASURED BOTH WAYS (`bodyClearance`,
  reported as `f.climbState.clear`): climbing a facade konga's shell sits 0.005 of
  body height off the face and the two moments that legitimately break contact
  — hauling over a roof lip, and the frame between letting go of one grip and
  taking the next — peak at 0.09 for at most 0.18s; the hover beside a GEAR sat
  at 0.17-0.23 for as long as it was allowed to. `holdClear` is 0.16, above
  anything a real climb does and below the float.
  …AND A FLOOR YOU ARE NOT OVER IS NOT A FLOOR. `groundSupport`'s search box is
  deliberately wider than the body, so a step counts before he is on it and he
  rises over a kerb instead of stopping at its face — but applied to a top he is
  already LEVEL with, that says "there is ground here" about something he is
  standing BESIDE, and the walker then holds him at its height with nothing
  underneath. A top at or below his feet now has to be under him, with a heel's
  worth of overhang allowed (`holdRadius`, 0.6 of his radius); a top ABOVE his
  feet keeps the generous rule, because that one is the step.
  Judge both with `node tools/propgap.mjs [--arena foundry] [--prop gear]
  [--isolate] [--trace] [--shot out.png]`, which walks a mech into a prop and
  measures the distance from his body and from each hand and foot to the prop's
  own MESHES — what the player sees him touching — beside the same distance to
  its collider. `--isolate` deletes every other prop and building nearby, so a
  hover cannot be explained by something else in reach.
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
  has a HOME — searched along a LADDER that starts OUT along the limb's own
  SPLAY (its outboard direction in the body frame, `step.spread` x reach) and
  walks inward only when the outer rungs have no reachable surface: a building
  face plants the limb EXTENDED (stability through spread, and the symmetric
  splay evens the extensions out around the body), a pole closes the grip in,
  which is the "inward is a last resort" order — led along the travel — and
  lives in one of three states: PLANTED (tip pinned to its
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
  FRONT LIMBS ANTICIPATE, BACK LIMBS FOLLOW, and which is which is MEASURED —
  is this limb's root ahead of the body along the travel? — so one rule covers
  forwards, up, sideways and backwards and the roles swap by themselves when he
  reverses. A front limb's home is led by `step.lead` seconds of velocity and
  splayed wider with speed (`step.stretch`), so it is already out at the new
  ground when the body arrives; a back limb takes almost none of that
  (`step.leadBack`) and simply plants where it has been carried — which is why
  it also gets a much longer leash before it must step (`step.lenBack` vs
  `step.len`): landing already behind, on the front limb's threshold it would
  re-step within two frames. The whole composed offset (splay + drop + lead) is
  CLAMPED into full extension before the surface probe, or the three add up on
  a fast body and every rung fails over perfectly good ground.
  TWO LIMBS STAY DOWN is the whole safety rule (`MIN_SUPPORT`): a limb may lift
  only if two others remain planted, and one with no plant to give up may
  always lift because it is holding nothing. A limb whose plant has gone past
  what it can physically reach may jump the pair queue but NOT that floor — it
  drags until there is support to spare.
  WHAT FLICKERING LEGS WERE: the first version re-stepped on noise. Three
  things fixed it and all three matter — the home is DAMPED (`homeRate`)
  instead of taken raw off a field that steps block to block, a fresh plant is
  HELD (`dwell`) before it may move again, and the stride is long enough
  (`len`) that a step covers ground. The fourth was a misdiagnosis worth
  remembering: "plant too far from home" counted as an EMERGENCY that bypassed
  the pair gate, and since that error grows at body speed it fired several
  times a second — an emergency that frequent is not an emergency, it is the
  cadence. The only emergency is a plant the limb can no longer reach.
  Measured on the wall: at most two limbs swinging, usually one, and `PPPP`
  rock steady at a standstill.
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
  no push, no arc, straight down like any other mech, with `climbState.release`
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
  the building. THE POLE IS CLAMPED (`polarMin`/`polarMax`): on a rooftop
  every goal term points straight up, and a spherical orbit AT the pole has no
  defined azimuth — yaw spins in place, pitch has nowhere to go — so the
  goal's polar angle stays off both poles, its azimuth falls back to wherever
  the camera already is when the goal is vertical, and the PLAYER's pitch
  stick slides a persistent polar offset (yaw turns the orbit about his up
  directly): the view can always be pulled down to near-horizontal, and stays
  where the player puts it. Engaged/released by an eased blend seeded from where the
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
