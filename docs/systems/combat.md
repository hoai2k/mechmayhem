# Combat

Aiming, hit detection, guns and barrels, flight, and the special cases of ults and summons.

These notes were the body of CLAUDE.md, which is now an index into this
folder. Each entry names the mechanism, why it is built that way, what was
measured, and the tool that checks it — most of it was learned by breaking it.

- A RETREAT IS NOT A RUN (`Fighter.backpedalT`, `TUNING.movement.backMult`).
  Full speed is only for legs that can push against the ground going forward, so
  as the intended direction swings behind the body the speed cap ramps down to
  `backMult` (0.7 x the WALK cap) and the sprint multiplier fades out with it —
  a dead-straight back-pedal is a fast walk at 0.44 of the run, whether or not B
  is held. The ramp starts at `LEG_BACK_OFF`, so everything the legs can still
  face costs nothing; measured on titanus (walk 20.7, run 33.2): 0-150° 33.2 ·
  160° 26.1 · 165° 22.9 · 170° 19.9 · 180° 14.5. Only target lock can produce it — free camera
  turns the body to face travel, so the offset is ~0 and it never engages.
- THE CROSSHAIR IS THE RANGED TARGET, AND THE CAMERA STICK IS WHAT MOVES IT
  (`src/combat/aim.js`, dials in `TUNING.aim`, measured by `node
  tools/crosshair.mjs [single|split|both]`). A shot fired under a target lock
  already flew at the crosshair's world point, height included (world.js
  `aimP`) — but that point was PINNED to the locked enemy's head, a servo you
  could watch and not touch, so against anything that strafes you were aiming
  at the one place he would not be when the shot arrived. The aim is now two
  angles the player owns, offset from a BASE direction: the locked enemy's
  head, or — with nothing locked — the CAMERA's own heading. Push the stick and
  the crosshair leads; the camera follows it, because the lock orbit aims at
  the aim POINT rather than at the body (`azimuthBehind`), so the two move
  together and what you are aiming at stays in frame. Let go and it eases back
  onto the target after `hold` seconds. WITH NO LEAD IT IS EXACTLY THE OLD
  POINT — same head, same range — so nothing about an unsteered lock changed
  (measured: 0.00 units off the head at rest).
  THE CROSSHAIR IS TIED TO THE TARGET AND YOU PULL AGAINST IT — the standard
  console soft-lock, two forces. FRICTION: the stick's authority falls off as
  the aim leaves the target (`1 - k²` over the leash), so the first degrees are
  free and the last are heavy. MAGNETISM (`magnet`): a restoring pull toward the
  target that never switches off, only weakens while the stick is live, firming
  to `settle` the moment it lets go. The lead you can hold is therefore an
  EQUILIBRIUM (~15° at full stick, measured) rather than a clamp, which is what
  makes it read as elastic — and it is small on purpose: a couple of body widths
  at fighting range, enough to lead a strafing target and not enough to lose
  one. `maxLead` (0.32 rad) is only the hard stop behind it, for a target that
  dashes or wraps. The first build gave 40° of free travel, which is not a
  targeting system — it is a crosshair that happens to start on the enemy.
  UP AND DOWN IS THE CAMERA'S IN EVERY MODE BUT THE SCOPE. Raising and lowering
  the view is how you see a fight at all, and taking that stick for a vertical
  lead nobody asked for left the camera parked behind your own robot with the
  enemy hidden behind it — the reported "stuck right behind your robot". So
  while TARGETING, X leads the crosshair (and the orbit follows it) while Y is
  the camera's, exactly as it is unlocked; the aim's pitch simply tracks the
  target. Only SNIPER MODE takes Y, and there because the view IS the aim. The
  routing lives in ONE place (boot.js) and aim.js applies the same rule, so the
  two cannot disagree about who has the stick.
  THE LEFT STICK MOVES THE ROBOT AND NOTHING ELSE — no target re-pick, no drift
  on the crosshair (asserted: run about under a lock and the aim stays on the
  same target, still on its head).
  A HELD LT IS SNIPER MODE, and that is why the lock became a TAP toggle to
  release on: the toggle now fires on RELEASE and only for a press that never
  became a hold, so raising the scope cannot flip the lock (`node
  tools/scratch/ltprobe.mjs` asserts all four transitions). It needs no lock and
  no target — unlocked, the stick swings camera and crosshair as one thing and
  the aim ray is TRACED into the world (enemy hurtboxes first, then the terrain
  under it), which is what lets a LOBBED shell land where the crosshair is drawn
  instead of at a fixed range.
  SNIPER IS ALMOST FIRST PERSON. At full scope the eye is not on an orbit at
  all: it sits BEHIND AND ABOVE HIS OWN HEAD (`headBack`/`headUp`/`headSide`, all
  in units of his own height, so a scout and a siege chassis frame the same) and
  looks straight down the aim, with the crown of his head just inside the bottom
  edge — measured, head at ndc y -0.75 with the crosshair within 0.1 of centre.
  You are sighting along the robot rather than watching him from across the
  street, which is the only framing where the crosshair means what it says, and
  the reticle GROWS with the zoom (it is the whole interface at that point)
  instead of shrinking into the discreet lock dot it is over the shoulder.
  AND THE SCOPE PICKS ITS TARGET. A hard shove on the stick is a different
  question from a nudge, so it is answered first: every shootable thing —
  enemy robots AND the arena's destructible props (`arena.propBodies`) — is
  measured as an ANGLE off the current aim, everything on the wrong side is
  dropped, and the nearest of what is left in the direction you pushed wins. A
  target further away the way you asked beats a closer one you did not, which is
  the whole point of being able to ask. Letting go of a PROP hands the aim back
  to the nearest robot (a prop is somewhere you chose to point for a moment) —
  but never while the trigger is down, or a prop would be impossible to actually
  hit. The scope's pick outranks a LOCK's target while it is up, or the lock
  would re-assert itself on the frame the switch happened.
  THE ZOOM IS ONE NUMBER (`Fighter.sniperK`, damped both ways at `zoomRate`),
  so raising and lowering the scope are the same move played in reverse and no
  part of it can arrive ahead of another: the FOV narrows (`zoomFov`, 46->24.8
  combined / 50->27 split), the eye comes in (`zoomDist`), the whole view slides
  OVER THE SHOULDER (`shoulder`/`shoulderUp` — a crosshair centred behind your
  own mech is a crosshair you cannot see) and the look target slides toward the
  crosshair (`leadPull`), which is what brings the aim to the middle of a
  now-narrow frame (measured: ndc y 0.36 -> 0.16). Stick sensitivity scales down
  with it (`zoomSens`) or a magnified view is twice as twitchy as it looks.
  Worst single-frame zoom step 0.052, i.e. ~0.3s in and out.
  FOUR THINGS THAT ARE NOT OBVIOUS. The framing math must read the BASE fov
  (`CameraSystem.baseFov` / `ch.baseFov`), or a distance derived from a zoomed
  fov zooms itself further every frame. The mech SQUARES UP ON THE CROSSHAIR
  rather than on the body (`targetYaw = aimYaw`), since shots leaving at an
  angle to the facing read as a bug — and that is also what gives an unlocked
  sniper the strafe stance for free. Stick RIGHT is MINUS aim yaw (a body facing
  +z has its right hand at -x), which is measured by the probe rather than
  reasoned about. And the aim is off entirely for the AI and for keyboard/touch
  (no LB), so `f.aiming` false is the old code path everywhere it matters.
- A FIRE BURNS ON A THING, NOT AT A COORDINATE (`flameLanding` in world.js).
  `Effects.jet` returns the end of RANGE, not a contact point, and the fire path
  passes a NEGATIVE gravity (the tube climbs), so the ground clamp inside `jet`
  never runs — inferno's impact bloom was planted a fixed distance in front of
  the muzzle whether or not anything was there, which is the reported "flames in
  mid-air", and when it did land on someone it stayed put while they walked out
  of it. The stream is CAST now, nearest hit first: a FIGHTER through the same
  hurtbox capsules melee and bullets use (which also NAMES the part), then the
  GROUND solved against the arc, then nothing — and nothing means no impact fire
  at all, because a flamethrower fired at the sky sets nothing alight. A hit
  fighter is remembered on the jet (`fj.on`), and the burning spot is re-read off
  that limb EVERY FRAME rather than per weapon tick, so it rides him through the
  fade-out. THE FIRE IS THE SIZE OF WHAT IT IS ON: pavement gets the wide fuel
  bed (`FLAME_GROUND_R`), a limb gets half the horizontal extent of its capsule
  plus its radius — so an arm held out sideways burns along its length and the
  same arm hanging straight down burns at the width of the arm. Measured on
  titanus at 8 units: it lands on `thighL`/`upperArmL` with radii 1.08-1.65
  swinging with the pose, and the spot tracks him ~1 unit a frame as he moves.
- FLIGHT: THE BOOSTER FLAME COMES OUT OF ANCHORS. Every build carries
  `boostL`/`boostR` under the soles (`factory.js` + `gltf.js`, beside
  muzzleR/muzzleL/core/overhead), and `Fighter.boosterJets` burns
  `effects.booster` — a white-hot heart, a short yellow flipbook tongue and a
  spit of sparks — out of EVERY anchor whose name starts with `boost` while the
  hover jets are lit. So moving a mech's thrusters is anchor work, not code:
  drag them in the ANIMATION workbench (`/workbench/?edit=animation`) and paste
  the exported `muzzles` entry, or add `boostBack`/`boostPodL`/… to that entry
  and the mech simply has more nozzles. WHICH WAY IT BURNS follows the muzzle
  rule: an anchor with an authored `rot` exhausts along its own +Z (aimable),
  and one WITHOUT thrusts straight down the BODY's own -Y. That default is
  deliberate — an ankle bone's local axes rotate with every step, so "+Z out of
  the sole" standing still points sideways two frames later, while a foot jet
  should always push under him. NO SHIPPED MECH AUTHORS A BOOST `rot`, so every
  nozzle on the roster burns body-down today. The ANIMATION workbench's
  direction arrow draws what the GAME will use rather than the raw +Z — amber
  down the body for an un-rotated booster, orange along +Z for an authored aim
  — because drawing +Z there said "forward" about jets that have always burned
  straight down.
  THE BALL TUCK IS BLOCK'S ALONE. A used to have a fourth meaning (press it
  falling with the tank spent and you curled into the descent ball), which meant
  the ball arrived by accident every time a flight ran dry. It is gone:
  `startAirRoll` takes no argument, the only way in is BLOCK pressed AIRBORNE,
  and it is held by BLOCK plus the stamina that funds it.
  `stats.noHover` (empty tank, no jets at all) survives as a lever but no mech
  sets it — JERRY carried it while the walls were meant to be his height, and
  now flies like everyone else.
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
- POINT THE GUN AT WHAT YOU ARE SHOOTING AT (`src/combat/gunaim.js`, measured by
  `node tools/scratch/barreltrace.mjs <mech>`). A hand-held muzzle inherits the
  arm's animation, and there are two honest answers to that: fire along the aim
  and ignore the barrel (correct, but the round leaves a gun visibly pointing
  somewhere else), or AIM THE ARM. This is the second. THE SOLVE IS ONE RIGID
  ROTATION: turning the SHOULDER carries the whole arm and the anchor hanging
  off it, so the quaternion mapping the barrel's world direction onto the wanted
  one, applied at the shoulder, lands the barrel exactly — measured, a 0.35 rad
  turn moves the barrel 0.35 rad on every rig. It aims at the crosshair while
  targeting and straight out along the facing otherwise.
  THREE THINGS IT TOOK TO WORK, all measured. (1) IT MUST RUN AFTER THE RETARGET
  AND SYNC AGAIN AFTER ITSELF: a muzzle rides a VIRTUAL joint on some mechs
  (nullbot) and a MODEL bone on others (viper's elbow, vulcan's hands), and a
  model bone only follows the virtual rig through `postAnimate` — running before
  it measures last frame's barrel while writing into a pose applyPose has since
  reset, which oscillates instead of converging (viper 55-79° off, nullbot 0).
  (2) BOTH ARMS, when both hold a gun: which muzzle fires is decided per SHOT
  and `_shotSide` flips between the servo running and the round leaving, so
  aiming "the firing arm" aimed the LAST shot's arm — half of vulcan's burst
  left an unpointed gatling, 63° off. (3) AN UNAIMED BARREL IS NEVER TRUSTED:
  every early-out leaves `_gunAimErr` at "no idea" rather than zero, because
  world.js reads it as permission for the barrel to steer the shot — with 0
  there, the first round of a cold burst followed a gun that had not been
  pointed at anything yet (31° off, against 2.7° on the second).
  HOLDING THE TRIGGER COUNTS AS AIMING (the bumper's own convention), and so
  does having the crosshair up: the arm is already on target when the round
  leaves, which is the difference between 45° and ~1° at the shot.
- A BARREL MAY ONLY STEER A SHOT IF IT IS A MOUNT, NOT A HAND
  (`barrelDeflect` in world.js). The deflection turns a finished aim onto the
  muzzle anchor's LIVE world +Z, which is right for something bolted to the hull
  and wrong for a gun held in a fist: a hand's orientation is whatever the
  animation is doing this frame, and the gait's arm swing is not an aiming
  system. Measured firing while STRAFING (`node tools/scratch/shotdiag.mjs
  <mech>`): NULLBOT's bolt left 75° off his own facing, VIPER's 86°, VULCAN's
  swung between -35° and +17° at a standstill — the reported "his ranged attack
  flies off to the side" — and under a target lock the same angle threw the shot
  off the CROSSHAIR. So the deflection is opt-in and both opts are explicit:
  `aimFlat` (the authored hull mounts — cranky's hose cannons, jerry's pods,
  frogger's gunk guns, whose splay IS the design) and a traversing-cannon mech
  (tritone, where the GUN does the aiming and its live direction is the firing
  solution). Every other muzzle fires along the aim: straight ahead unlocked, at
  the crosshair while targeting. After: 0.0° at a standstill for all of them.
  Nothing about a standing shot moved, because a straight-ahead muzzle's
  authored `rot` was already identity in the REST pose — that was always the
  intent, and the animated pose is what broke it.
  …AND WHAT THE WEAPON IS SHOOTING AT IS THE CROSSHAIR'S TARGET. `fireRanged`
  used `nearestEnemy()` for homing rounds, the bat swarm and every "is there a
  target down the barrel" test; while the player is TARGETING it is the mech
  under the crosshair (`f.aiming && f.lockTarget`). Aiming at one enemy and
  having your missiles turn toward another is the sharpest possible way to say
  the aim is not yours. The handlers that build a SHAPE rather than fire one
  round (wraith's fan of bats) spread around `ctx.aimYaw` — the aim's own
  heading — instead of `f.yaw`, the hips.
- RB AUTO-AIM: A PLAYER'S UNLOCKED SHOT FINDS AN ENEMY (`src/combat/autoaim.js`,
  probe `node tools/scratch/autoaim.mjs [mech …]`). Unlocked, every ranged
  weapon used to fly dead along the facing with only its PITCH assisted, so
  everything that does not home (fenrir's wave, viper's daggers, rhino's
  shells, frogger's slime, nullbot's bolts, the streams…) missed anything not
  already dead ahead. With no crosshair up, `pickAutoTarget` takes the enemy
  best lined up with the facing inside a 60° cone and the weapon's reach
  (its `range` where it has one, else 120), and `autoAimPoint` hands
  fireRanged that enemy's chest LED by the round's flight time (horizontal
  only; a mortar leads by `MORTAR_ARC_TIME`, the one number its arc also
  uses) as the SAME aim point a lock gives — so every handler that knows what
  "aimed" means reads it with no edit. PLAYERS ONLY: the CPU aims with a
  per-difficulty yaw error and a perfect assist would erase the difficulty
  levels. Never onto a cloaked enemy or a brawler lying gone. `doRanged`
  picks it too (`f._autoTgt`), so the arm servo trains the gun on that enemy
  through the wind-up. Measured on 13 weapons, enemy 35° off the facing at 22
  units: every one within 1.6° of it (the fans' own spread), against ~35°
  before; an enemy outside the cone and the same shot from a CPU still fly
  along the facing.
  TWO THINGS IT TOOK, both in `barrelDeflect`. (1) An AIMED gun's barrel is
  measured from the AIM, not the hips: it was always the same number while
  every shot left along the facing, and auto-aim is the first aim that does
  not — measured from the facing, the barrel's turn toward the target counted
  TWICE (rhino and vulcan 39.6° off). Hull mounts (`aimFlat`) still measure
  their splay from the body, since that is authored against the body. (2) An
  arm-held barrel is off the aim by no more than the servo's own residual
  (`_gunAimErr`): the barrel is read when the round leaves, which for a
  channel weapon is before this frame's servo correction, so the reading was
  partly the clip's gun — vulcan's stream sat a steady 5-7° off while the
  servo reported 0.2°. Moving fire only got better for it
  (`tools/scratch/shotdiag.mjs vulcan`: barrel-vs-shot walking 75° -> 43°,
  strafing unlocked 61° -> 15°).
- A HULL-MOUNTED BARREL AIMS IN YAW ONLY (`"aimFlat": true` on a manifest
  muzzle spec; `gltf.js applyRot` -> `world.js barrelDeflect`). The deflection
  exists so a barrel modelled splayed actually fires down its own line, and that
  is right in every axis for a gun the mech HOLDS — the hand aims it. It is
  wrong in the VERTICAL for one bolted to the chassis, because the body's own
  forward lean tips the barrel and the shot obeys, while `fireRanged`'s vertical
  assist has already put the aim on the target's height. Measured on FROGGER,
  whose gunk guns are hull mounts: a 20-degree run lean fired the glob 19.9
  degrees DOWN — into the pavement in front of him, which is what "he drops it
  on the ground" is as a number. With `aimFlat` the barrel vector is flattened
  before the rotation is built, so what is left is a pure yaw: the splay still
  steers the shot, the pitch is the aim's. Live-fight measured -14 to -20.8
  degrees of shot pitch before, -0.1 to -3.9 after (against a -0.8 to -7.4
  requirement). JERRY (pods on `strutMidR/L`) and CRANKY (hose cannons on
  `head`) carry it too — same geometry, same bug: a 20-degree lean tipped
  jerry's right pod to -16.4. After: jerry's goo leaves at -1.4 to -4.1 under
  leans of 10-16 degrees, cranky's hose tracks the height it needs to within
  a degree. The yaw each of them is authored with (54-74 degrees of deliberate
  splay) is untouched — flattening the barrel vector cannot change the yaw of
  the rotation it builds.
  …AND THE CLIP MUST NOT AIM EITHER, which is the same rule jerry's pods
  already documented: frogger's shoot clip yawed the torso -10 and the head +7
  (mirrored on the off side), which alternated the whole hull left-right-left as
  he fired and threw the globs 5-7 degrees either side of the target, shot about
  shot — barrels measured 0.0 degrees of yaw at rest and -4.4 to -7.0 through
  the clip. It is a PITCH-ONLY recoil now (0.0 all the way through), and the
  recoil comes AFTER the shot rather than under it: the rock-back used to peak
  exactly where the `fire` event sits, so the glob left a barrel already pitched
  6.5 degrees up.
- AN ULT IS A COMMITMENT, so `cancelOnMove` does not apply in the `ult` state
  (fighter.js). The flag exists so a held stick drops the intro or a taunt the
  instant control returns; WRAITH's DEATH SWARM plays his own TAUNT CLIP on
  purpose — the apparition, the ghosting and the bats are all driven off that
  clip's name (growTaunt) — and any held direction ended the loom on its first
  frame (measured: the clip gone after ONE update). The ult state already
  refuses movement, so no control was taken away.
- WRAITH'S ULT IS HIS TAUNT, CASHED IN (`deathSwarm`). Rather than a second
  copy of the loom, it plays the taunt clip, waits `loom` seconds and lets go —
  growTaunt does the growing, the ghosting, the trickle of bats and the
  handover to a frozen shell, exactly as the taunt does. THE DIFFERENCE IS
  WHAT THE BATS DO: the taunt's flock climbs away and thins, this one STAYS as
  a gyre that stoops on whoever is nearest (`deathFlock`). A pooled particle
  cannot hunt — it is ballistic once emitted — so the flock is instanced quads
  with ParticlePool's billboard + 2x2 atlas maths lifted into their own shader
  (BAT_VERT/BAT_FRAG), drawn off the taunt's own `batTexture` so the swarm that
  arrives is visibly the swarm he came apart into. `node
  tools/scratch/deathswarm.mjs` measures the whole sequence.
- A SUMMON MAY ARRIVE ANYWHERE, AND MAY OUTLIVE ITS TIMER. FENRIR's WILD HUNT
  tears twenty separate rifts scattered over the WHOLE CELL (the spread is the
  toroidal half-period, sqrt-distributed so the pack spreads by area rather
  than piling up in the middle) and every wolf runs down the enemy nearest to
  ITSELF. It carries TWO lifetimes, because a pack that spawns across the block
  is not a shockwave: `duration` is how long a wolf that has already bitten
  sticks around, `huntMax` (10s) how long one that has NOT keeps hunting — so
  landing a first bite past `duration` ends that wolf on the spot, which is
  exactly "it stays until it gets an attack in". `node tools/scratch/hunt.mjs`
  reports the spawn spread, the closing distance and both lifetimes.
- A DARK VORTEX IS NOT A PORTAL (`darkVortex`, beside `summonPortal`). A rift
  is a clean lit disc for something stepping through; JERRY's colony BOILS out
  of the floor, so it gets a lightless disc, dim rim arcs turning with it and a
  funnel of near-black smoke. TWO THINGS MAKE IT READ AS A VORTEX rather than
  a puff: the emission ANGLE rotates, so successive puffs lie along a spiral
  arm instead of a ring, and each puff leaves with a TANGENTIAL velocity plus a
  little inward pull — particles fly straight once emitted, so the curve has to
  be in where and how they start. It opens under the cast, before the first
  clone, and outlasts the spawn. NOTE the sprite sizes: a pool sprite covers
  roughly `size/2` WORLD units (the booster note in effects.js), so a funnel
  around a 6-unit mech wants 4-8, not the 2-3 that looks right read as units.
