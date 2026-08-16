# ROBOTWORLD mechs — portable export

Self-contained rigged, skinned, animated mechs. Nothing here needs the game.
Copy this whole directory into another project and go.

```
<id>.glb          the mech: geometry, materials, skeleton, anchors, animation
<id>.json         what is in it — anchors, clips, and how it was folded
index.json        all mechs at a glance, for picking one at runtime
characters.json   who they are and what they do — stats, every attack with its
                  real numbers, personality, and the engine capabilities each
                  body needs
characters.md     the same as a readable dossier per character
GEOMETRY.md       what the ENGINE has to build per body (the rocket fist, the
                  seam cuts, the burners, surface walking) — the behaviour a
                  model cannot carry
mechkit.js        a small runtime for three.js (below)
lib/              the REAL animation system, source (below)
art/<id>/         badge, poster, thumbnail, a four-view turnaround and one
                  action pose, all rendered FROM THE EXPORT
```

## What an exported mech guarantees

- **World units are game units, `+z` is forward, the feet rest on `y = 0`.**
  Import it and it stands up the right way round at the right size. In the game
  the yaw and the two scale factors live in a manifest; here they ride an
  `Armature` NODE above the joints — the same layout Blender emits — so the
  mesh, the skeleton and the clips are all in the model's own frame and the
  transform applies rigidly on top. **The consequence to know: bone-local units
  are NOT world units.** See "Gotchas" below.
- **The skeleton carries the 15 game joints by name** — `hips`, `torso`,
  `head`, `shoulderL/R`, `elbowL/R`, `handL/R`, `thighL/R`, `kneeL/R`,
  `ankleL/R` — plus whatever else that body has: tails, claws, chimneys,
  cannon struts. Auto-rig names like `bone_28` have been renamed, so every mech
  answers to one convention.
- **Anchors are empty nodes named `anchor_<name>`.** `muzzleR` / `muzzleL` are
  where shots leave and which way they point; `boostL` / `boostR` are the foot
  jets; `core` is the chest and `overhead` the crown. Some mechs carry more
  (`bladeL/R`, `podL/R`, `stackL/R`, `scope`, `eye`). They are hand-placed, and
  they ride the bone they belong to, so they follow the animation.
- **Every animation is a real glTF clip.** `walk` and `run` are looping gait
  cycles; `battleIdle`, `jumpRise`, `jumpFall`, `hover` and `crouch` are held
  poses (in the game these are animator *layers*, not clips, so they are
  sampled and held); the rest are one-shot actions named for what they are —
  `light1`, `heavy`, `block`, `taunt`, `knockdown`, `getup`, `dead`, and each
  mech's own moves. 27–35 clips per mech.
- **Every clip states the WHOLE skeleton.** A clip is a complete pose, not a
  delta: play any one on a bare `AnimationMixer` from any previous state and
  you get the same result. That is deliberate and it is what makes a plain
  mixer enough — see "Gotchas".

## Gotchas

Three things that are true of this export and have bitten a real integration.

**Bone-local units are not world units.** The yaw and scale ride the `Armature`
node above the joints, so the skeleton is in the model's own (smaller) frame.
Reading is fine — `getWorldPosition()` on a bone or an anchor answers in world
units. *Writing* is where it bites: anything you measure in world units and
assign to a bone-local `position` must be divided by the armature scale first
(`mech.scale` in mechkit), **and by only that** — dividing by the camera's zoom
as well is the same mistake twice, and either one puts the mech through the
floor.

**You still have to ground the feet per state.** The bind pose rests on `y = 0`,
but a mech's carriage sits some way above its own floor line and each pose sits
differently — a crouch is lower than an idle, a jump leaves the ground
entirely. Nothing in a glTF can settle a body onto its ground line for you;
measure the lowest point of the posed skin (or of the ankle bones) and lift.

**`+z is forward` is a promise about the FILE, not about a clip.** It says which
way the model is built. Which way the body is *turned* partway through a given
clip is a separate question — a dodge rolls, a knockdown ends face-down — so if
your game needs a particular view of the mech, measure the facing rather than
assuming it holds frame by frame.

And one that is not a gotcha but is worth knowing: `<id>.json` carries a
`failed` list. It names the states that could not be sampled for that mech, and
it is the only way to learn that a mech has no clip for something.

## Route A — mechkit.js (start here)

`mechkit.js` imports nothing. You hand it the `THREE` namespace and a
`GLTFLoader` your project already resolves, so there is no second copy of
three, no version to match and no build step.

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MechKit } from './mechs/mechkit.js';

const kit  = new MechKit({ THREE, GLTFLoader, path: './mechs/' });
const mech = await kit.load('titanus');
scene.add(mech.object);

mech.loop('run');            // gait, looping
mech.play('taunt');          // one-shot, then back to the loop by itself
mech.anchor('muzzleR');      // Object3D riding the barrel — parent your VFX here
mech.bone('handR');

function frame(dt) { mech.update(dt); }
```

`mech.clipNames`, `mech.anchorNames` and `mech.boneNames` list what this body
actually has; `kit.index()` reads `index.json` if you want that before loading.

## Route B — lib/, the real animation system

The clips in the `.glb` are **samples** of something procedural. In the game
the motion is generated: a pose-blend animator over a 121-clip library, a gait
engine that is a function of ground speed rather than a cycle, per-mech
signature motion, foot planting measured against the actual geometry, and a
retarget from a canonical humanoid onto whatever the model's skeleton is. The
baked clips are that, sampled at 30fps at a couple of speeds — right for most
uses, and less than the real thing.

`lib/` is the real thing, copied whole and unmodified: the animator, the clip
library, the gait tables, the signatures, the retarget, and the bone-bound
hurtbox capsules that combat resolves against. Its **only** external dependency
is `three` — that is checked when the bundle is built, not assumed.

It is source, not a packaged API: it expects to build a mech through
`lib/src/mechs/gltf.js` from a manifest entry (`lib/manifest.json` is the
game's, for reference) and the **original** model, not the export — the export
has already had the rig folded into it, which is exactly what that pipeline
does at load. Take this route if you want the generated motion; take Route A if
you want the mech to move.

## Regenerating

From the game repo, with the dev server running:

```
node tools/export-mech.mjs --all     # the .glb + .json per mech
node tools/export-bundle.mjs         # lib/, mechkit.js, index.json, the docs
node tools/export-chars.mjs          # characters.json/.md + badge/poster/thumb
node tools/export-art.mjs            # turnarounds + an action pose per mech
node tools/exportcheck.mjs --all     # verify: loads each one with a bare
                                     # GLTFLoader and checks size, facing,
                                     # joints, anchors and that clips move bones
```
