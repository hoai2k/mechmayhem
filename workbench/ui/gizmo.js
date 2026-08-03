// THE HANDLES GET OUT OF THE WAY WHILE SHIFT IS HELD.
//
// A transform gizmo sits exactly on top of the thing it transforms, and its
// rings and arrows reach a good fraction of the viewport out from there. That
// is fine until the bone you want NEXT is behind one of them: the handle eats
// the click, and the only way through is to deselect first, orbit around, or
// give up. So: HOLD SHIFT and the gizmo is not there — not just invisible, but
// deaf, so the pick lands on whatever is behind it. Let go and it is back,
// still attached to the same object, in the same mode.
//
//   const helper = addGizmo(scene, gizmo);      // + the shift behaviour
//   addGizmo(scene, gizmo, { shiftHide: false });   // opt out
//
// THREE THINGS HAVE TO BE TRUE AT ONCE or the click still does not land:
//
//   visible = false   the handles are off screen (the point of the exercise)
//   enabled = false   TransformControls' own pointerdown listener is on the
//                     canvas and hit-tests its PICKER meshes, which are
//                     invisible by construction — hiding alone would leave an
//                     invisible gizmo swallowing the drag
//   axis = null       every tool guards its pick with `if (gizmo.axis) return`
//                     (that guard is what stops letting go of a rotate ring
//                     from re-picking). A stale axis left over from the last
//                     hover would block the pick with nothing on screen to
//                     explain why
//
// AND IT MUST SURVIVE WHAT THE TOOL DOES UNDERNEATH IT. `attach()` sets
// `visible = true` itself, and shift-clicking a joint is precisely a
// selection, i.e. an attach — so the gizmo would pop straight back up on the
// new joint mid-Shift. `attach` is wrapped to re-assert the hide while the key
// is down; restoring reads `!!gizmo.object`, which is exactly what attach and
// detach would have left, so a tool that detached while Shift was held gets a
// hidden gizmo back rather than a stranded one.
//
// It never hides mid-drag (grabbing a ring and pressing Shift keeps the ring),
// it ignores Shift typed into a panel field, it defers the restore until the
// pointer is up so a shift-drag — the level editor's marquee — does not flash
// the gizmo back halfway through, and it re-reads `e.shiftKey` off every
// pointer event and drops the state on blur, because a keyup that arrives
// while the window is unfocused is a modifier stuck down forever.

const isTyping = (el) => !!el && /input|select|textarea/i.test(el.tagName);

export function addGizmo(scene, gizmo, opts = {}) {
  // three 0.166 has no getHelper(); TransformControls IS the Object3D. Newer
  // versions split the two, so ask before adding.
  const helper = gizmo.getHelper ? gizmo.getHelper() : gizmo;
  scene.add(helper);
  if (opts.shiftHide !== false) shiftHidesGizmo(gizmo, helper, opts);
  return helper;
}

export function shiftHidesGizmo(gizmo, helper = gizmo, opts = {}) {
  const target = opts.domElement || window;
  let held = false;      // Shift is down and we acted on it
  let pointerDown = false;

  const attach = gizmo.attach.bind(gizmo);
  gizmo.attach = (o) => { const r = attach(o); if (held) helper.visible = false; return r; };

  function hide() {
    if (held || gizmo.dragging) return;   // a drag in hand keeps its handle
    held = true;
    helper.visible = false;
    gizmo.enabled = false;
    gizmo.axis = null;
  }
  function show() {
    if (!held) return;
    held = false;
    gizmo.enabled = true;
    helper.visible = !!gizmo.object;      // what attach/detach would have left
  }
  // The one place the key state is read, so keydown, keyup and every pointer
  // event agree: whatever the last event said Shift was, that is what it is.
  const sync = (e) => {
    if (e.shiftKey && !isTyping(e.target)) hide();
    else if (!e.shiftKey && !pointerDown) show();
  };

  window.addEventListener('keydown', sync);
  window.addEventListener('keyup', sync);
  target.addEventListener('pointerdown', (e) => { pointerDown = true; sync(e); });
  target.addEventListener('pointermove', sync);
  window.addEventListener('pointerup', (e) => { pointerDown = false; sync(e); });
  const drop = () => { pointerDown = false; show(); };
  window.addEventListener('blur', drop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) drop(); });

  return { hidden: () => held, show, hide };
}
