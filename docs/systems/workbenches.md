# Workbenches

The /workbench/ tools: what each one is for, how its interaction works, and the rules that keep them honest (no tool writes the repo; every edit leaves as an export).

These notes were the body of CLAUDE.md, which is now an index into this
folder. Each entry names the mechanism, why it is built that way, what was
measured, and the tool that checks it — most of it was learned by breaking it.

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
  `node tools/wbthumbs.mjs`). The tools are listed ONCE, in
  `workbench/registry.js`. The OLD urls
  (`?debug=models|pose|skin|collider`, `?rigedit=<id>`) still work — they
  redirect, carrying their params, so every tools/*.mjs script and bookmark is
  unaffected.
- The workbench code is a separate tree (`workbench/`) that knows the game
  ONLY through a config object: `workbench/config/contract.js` documents the
  whole surface, `workbench/adapters/mechmayhem/` fills it in by DERIVING from
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
  `node tools/skindebug.mjs <mech> [--json out.json]`. ITS TOTAL IS NOT
  DETERMINISTIC: clips are sampled AS THEY PLAY, so a slow renderer catches
  fewer frames (measured on konga, three runs of the identical manifest: 286.0
  / 305.8 / 313.2, top finding sampled over 25 frames one run and 11 the next).
  Read a ±10% difference as noise, take the big moves as signal, and settle a
  close call with a picture (`tools/pose.mjs`) rather than another run. The maths lives in
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
- HOLD SHIFT AND THE TRANSFORM HANDLES GET OUT OF THE WAY (`workbench/ui/gizmo.js`,
  `addGizmo(scene, gizmo)` — the pose, rig and level editors). A gizmo sits
  exactly on top of the thing it transforms and its rings reach a good fraction
  of the viewport out from there, so the bone you want NEXT is often behind one:
  the handle eats the click and the only ways through are deselect, orbit, or
  give up. Shift makes it not there — and lets go of it, still attached to the
  same object in the same mode. THREE FLAGS, ALL OF THEM: `visible` (off
  screen), `enabled` (TransformControls' own pointerdown listener hit-tests
  PICKER meshes that are invisible by construction, so hiding alone leaves an
  invisible gizmo swallowing the drag) and `axis = null` (every tool guards its
  pick with `if (gizmo.axis) return` — that guard is what stops letting go of a
  rotate ring from re-picking, and a stale hover axis would block the pick with
  nothing on screen to explain why). `attach` is WRAPPED, because attach() sets
  `visible = true` itself and a shift-click pick IS an attach — otherwise the
  gizmo pops back up on the joint you just took. Restoring reads `!!gizmo.object`,
  which is exactly what attach/detach would have left. It never hides mid-drag,
  ignores Shift typed into a panel field, defers the restore while the pointer
  is down (the level editor's shift-drag marquee would otherwise flash it back
  halfway through) and drops the state on blur, because a keyup that arrives
  while the window is unfocused is a modifier stuck down forever. THE JOINT DOTS
  STAY — they are the pick targets, not the obstruction. The ANIMATION
  workbench's anchor gizmo opts out (`{shiftHide: false}`): nothing there is
  picked in the viewport, so there is nothing behind it to click through, and
  Shift already means "give me the rotate handle" on its anchor buttons. Six
  behaviours, five of them invisible: `node tools/gizmohide.mjs` asserts them.
- Every workbench side panel (skin/models/pose/collider/rigedit + the level
  editor's two) is RESIZABLE: drag its outer edge, double-click the handle to
  reset, width remembered per tool (`workbench/ui/panel.js`, which also styles
  their scrollbars). Widen it when a bone/op name ellipsizes.
- Workbenches: `?debug=models[&mech=<id>]` — procedural-vs-GLB ACTION
  comparison (trigger any move on both at once, slow-mo, live anchor editor).
  COMPARE TO defaults to **None (solo)** — a second body halves the room the one
  you came to look at gets, so the comparison is a thing you ask for
  (`&compare=proc|anime`; solo writes no param). The action grid triggers every
  intent the game has, TAUNT included — it is a one-shot like the ult, because
  fighter.js starts it from `normal` on the intent being SET rather than on its
  edge, so a held button relaunches it the instant the last one ends.
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
  …AND THE SKELETON OF DOTS WENT WITH IT. A dot on all fifteen joints, always,
  was the honest picture of a tool where a joint was a thing you EDITED; on this
  one a joint is a place to CLICK to ask which dial moves this limb, and a
  permanent handle on every bone advertises fifteen per-bone controls that do not
  exist — while scattering bright markers over the walk cycle you opened the tool
  to look at. At most TWO are drawn now: the joint under the cursor (the cursor
  already turns to a pointer there — the dot is which joint the click will take)
  and the one you picked, which you are about to drag. Picking is unchanged: the
  dots were never the only target, the body itself is pickable and the nearest
  joint wins.
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
  "THE WHOLE PIPELINE" MEANS THE SIGNATURE TOO, and for a while it did not. The
  scan ran `applyGait` and the layers around it, which is the shared table — but
  the LAST thing the animator touches a pose with is per-mech: `SIGNATURES[<id>]`
  and the GLB profile's `post` hook, and a signature is free to ASSIGN a joint
  rather than add to it. SAURION is the case that exposed it: his raptor carry
  lerps shoulder pitch/roll, elbow pitch and wrist pitch to fixed angles with the
  speed ratio as the weight, so at a run SEVEN of the nine `arms.*` dials cannot
  move him at all — and the panel offered all nine, which is a slider you can
  drag for an afternoon with nothing happening. `config.gait.evaluate` takes an
  `env.body` handle now (`config.gait.body(id, animator)`) and runs those passes,
  so what the tool measures is what the frame does; `arms.cross` (shoulder YAW,
  the one axis his carry leaves alone) stays live and correctly so. THE ANIMATOR
  IT HANDS THEM IS A DECOY with an EMPTY joint table and `dt: 0` — a signature's
  other half writes bones directly (tails, halos, gatlings), and a relevance scan
  that twitches the tail dozens of times a second has changed the thing it was
  measuring. Every one of those writes is already guarded, so an empty table
  makes them no-ops; a signature that throws under it is disabled for that body
  and the measurement falls back to the gait alone. `node
  tools/scratch/sigdecoy.mjs` runs the scan on all 20 and fails on either.
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
- Every mech dropdown goes through `subjectSelect` (`workbench/ui/subjectpick.js`),
  which orders them ALPHABETICALLY and puts the `hidden` work-in-progress mechs
  under a rule at the end — the catalogue's own order is the roster's design
  order, which is right for a line-up and useless for finding one mech in
  seventeen. Tools that want bare ids instead of display names pass
  `label: (id) => id`; the ordering rule stays in one place either way.
- THE WORKBENCHES ARE LISTED ONCE (`workbench/registry.js`: id, module, entry
  function, title, colour, card text, in switcher order). The router
  (`workbench/main.js`), the front door (`workbench/landing.js`) and every
  panel's coloured title bar and switcher (`workbench/ui/panel.js`) read it —
  add a tool there plus its module and pass `workbench:'<id>'` to
  `setupDevPanel`. `test/workbench.test.mjs` holds each module's export, each
  panel's self-name, each screenshot and the game page's legacy `?debug=`
  redirects (`src/dev/index.js`) to it. The chevron beside a tool's title
  SWITCHES WORKBENCH, carrying the current mech over. Mech pickers go through
  `workbench/ui/subjectpick.js` (`subjectSelect`, `gotoSubject` for the rig
  editor, which builds its world around one id and so switches by navigating).
  UNDO/REDO is `workbench/ui/history.js` for every tool (before-edit
  `record()` for rig/skin/level, after-edit `commit()` for pose; both dedupe).
- THE POSE WORKBENCH'S KEY CLIPBOARD: right-click a diamond for **Copy pose /
  Paste pose / Delete**, right-click bare track for **New keyframe / Paste as
  new key**, and Ctrl/⌘+C · Ctrl/⌘+V do the same to the SELECTED key. COPY takes
  the key's pose and its ease and deliberately NOT its time — pasting means
  "make this key look like that one", and a key's time is its place in the
  rhythm. PASTE REPLACES rather than merges, because a key is SPARSE: a merge
  would leave whatever the target already had for joints the copied key is
  silent about, and the paste would quietly not do what it says. One undo step
  either way. It is how a REPEATING motion is authored — pose one beat, paste it
  onto the beats that repeat it, instead of re-dragging the same limb to the
  same place (colossus' four-clap taunt is the worked example).
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
- THE JOINT YOU DRAG IS NOT ALWAYS THE TRACK YOU WRITE (`config.anim.trackFor`,
  the pose workbench). A clip channel need not map 1:1 onto a joint: a GLB
  profile may carry `mirrorArms` — WRAITH does, because the rifle is in the
  model's LEFT hand — and then the arm tracks are SWAPPED at playback with yaw
  and roll negated (animator.js). The pose on screen is therefore already
  mirrored, and a drag measured off the joints has to go back through the same
  mapping before it is stored. It did not: dragging wraith's left hand wrote the
  `handL` track, which plays on his RIGHT hand, so the other arm moved. Measured
  both ways — on wraith a clip track `handL` swings joint handR by -60 where the
  key said +60, on titanus it swings handL by +60 — and `trackFor` returns
  exactly that: `{name:'handR', sign:[1,-1,-1]}` for wraith, the identity for
  everyone else. `sign` is component-wise, so it applies to a DELTA as happily
  as to an absolute value, which is what commitEdit needs. Leave the hook out of
  an adapter and the mapping is the identity, which is what an ordinary rig
  wants.
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
  THE DROPS *ARE* APPLIED THERE, though, and that is the other half of the same
  rule: `dropGeo`/`dropBones` delete geometry the game does not build, so a raw
  view that skips them floats a stray lump beside the mech — konga's 121-triangle
  blob sat in front of his chest in this tool and nowhere else, which reads as
  something wrong with the model. The skin workbench applies them AFTER its ops
  and its island partition (`config.skin.applyDrops`), which is the game's own
  order and the only one that is safe: a dropped lump is its own island, so no
  `{comp:N}` moves — dropping FIRST would renumber tempest's 122 of them onto
  other geometry. The rig editor, which touches no ops at all, just asks for
  them up front (`config.variants.raw(id, {drops: true})`). Seam cuts stay out
  of both: they APPEND duplicate vertices, which a vertex list cannot name.
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
