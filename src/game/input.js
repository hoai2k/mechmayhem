// Input: keyboard (2 local layouts) + Xbox controllers via Gamepad API.
// Produces per-fighter intents and aggregated menu navigation events.

const KB1 = {
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', light: 'KeyF', heavy: 'KeyG', block: 'KeyH',
  ranged: 'KeyR', special: 'KeyT', ult: 'KeyY', taunt: 'KeyB',
  dash: 'ShiftLeft', strafe: 'KeyQ', duck: 'KeyC',
};
const KB2 = {
  up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
  jump: 'Numpad0', light: 'Numpad1', heavy: 'Numpad2', block: 'Numpad3',
  ranged: 'Numpad4', special: 'Numpad5', ult: 'Numpad6', taunt: 'NumpadDecimal',
  dash: 'NumpadEnter', strafe: 'Numpad7', duck: 'Numpad8',
  // right-cluster fallbacks for keyboards without a numpad
  alt: {
    jump: 'Enter', light: 'Comma', heavy: 'Period', block: 'Slash',
    ranged: 'KeyM', special: 'KeyN', ult: 'Quote', dash: 'ShiftRight', taunt: 'Semicolon',
    strafe: 'KeyJ', duck: 'KeyK',
  },
};

// Xbox standard mapping
const PAD = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7,
  BACK: 8, START: 9, LS: 10, RS: 11, DU: 12, DD: 13, DL: 14, DR: 15,
};

export class Input {
  constructor() {
    this.keys = new Set();
    this.keysPressed = new Set();   // edge (consumed per frame)
    this.padsPrev = [{}, {}, {}, {}];
    this.padsCur = [{}, {}, {}, {}];
    this._lockLatch = [false, false, false, false]; // LB target-lock toggles
    this.onPadConnect = null;
    this._navHold = new Map();      // "src:dir" -> {t0, last} for menu auto-repeat

    // pads whose virtual mouse pointer is up (managed by PadPointers in
    // boot.js): their menu events are muted so the sticks steer the pointer
    // and A clicks instead of confirming
    this.pointerPads = new Set();

    // ---- virtual touch device (on-screen controls write here) ----
    this.touchAvailable = false;             // set true when touch UI is mounted
    this.touch = {
      moveX: 0, moveZ: 0,                     // analog stick, same convention as keys
      held: new Set(),                        // buttons currently down
      pressed: new Set(),                     // buttons pressed this frame (edge)
    };
    // On-screen menu buttons inject edges here; consumed like keysPressed.
    this.touchMenu = { up: false, down: false, left: false, right: false, confirm: false, back: false, alt: false, pause: false };

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || (e.code === 'Space' && e.target === document.body)) e.preventDefault();
      if (!this.keys.has(e.code)) this.keysPressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('gamepadconnected', (e) => {
      this.onPadConnect?.(e.gamepad);
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      this.onPadDisconnect?.(e.gamepad);
    });
  }

  // call once per frame before reading
  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < 4; i++) {
      this.padsPrev[i] = this.padsCur[i];
      const gp = pads[i];
      const cur = {};
      if (gp && gp.connected) {
        cur.connected = true;
        cur.lx = Math.abs(gp.axes[0]) > 0.18 ? gp.axes[0] : 0;
        cur.ly = Math.abs(gp.axes[1]) > 0.18 ? gp.axes[1] : 0;
        // right stick: per-player camera orbit
        cur.rx = Math.abs(gp.axes[2]) > 0.18 ? gp.axes[2] : 0;
        cur.ry = Math.abs(gp.axes[3]) > 0.18 ? gp.axes[3] : 0;
        for (const [name, idx] of Object.entries(PAD)) {
          cur[name] = !!(gp.buttons[idx] && (gp.buttons[idx].pressed || gp.buttons[idx].value > 0.45));
        }
      }
      this.padsCur[i] = cur;
    }
  }

  endFrame() {
    this.keysPressed.clear();
    this.touch.pressed.clear();
    const m = this.touchMenu;
    m.up = m.down = m.left = m.right = m.confirm = m.back = m.alt = m.pause = false;
  }

  // Called by on-screen controls to register a virtual button press/release.
  touchButton(name, down) {
    if (down) { this.touch.held.add(name); this.touch.pressed.add(name); }
    else this.touch.held.delete(name);
  }
  // Called by on-screen menu buttons to inject a one-frame nav edge.
  touchMenuEvent(name) { if (name in this.touchMenu) this.touchMenu[name] = true; }

  key(code) { return this.keys.has(code); }
  keyPressed(code) { return this.keysPressed.has(code); }
  padHeld(i, btn) { return !!this.padsCur[i][btn]; }
  padPressed(i, btn) { return !!this.padsCur[i][btn] && !this.padsPrev[i][btn]; }
  padConnected(i) { return !!this.padsCur[i].connected; }

  connectedPadCount() {
    let n = 0;
    for (let i = 0; i < 4; i++) if (this.padConnected(i)) n++;
    return n;
  }

  // device: 'kb1' | 'kb2' | 'pad0'..'pad3'
  // camYaw rotates stick/key direction into world space
  readIntent(device, intent, camYaw = 0) {
    let mx = 0, mz = 0;
    const edge = (held, code) => held; // helper clarity

    if (device === 'kb1' || device === 'kb2') {
      const map = device === 'kb1' ? KB1 : KB2;
      const alt = map.alt || {};
      const k = (name) => this.keys.has(map[name]) || (alt[name] && this.keys.has(alt[name]));
      const kp = (name) => this.keysPressed.has(map[name]) || (alt[name] && this.keysPressed.has(alt[name]));
      mx = (k('right') ? 1 : 0) - (k('left') ? 1 : 0);
      mz = (k('up') ? 1 : 0) - (k('down') ? 1 : 0);
      intent.jump = kp('jump');
      intent.jumpHeld = k('jump');
      intent.light = kp('light');
      intent.lightHeld = k('light');
      intent.heavy = kp('heavy');
      intent.heavyHeld = k('heavy');
      intent.block = k('block');
      intent.ranged = k('ranged');
      intent.rangedHeld = k('ranged');
      intent.special = kp('special');
      intent.specialHeld = k('special');
      intent.ult = kp('ult');
      // dash key is HELD like pad B: standing hold winds the coil, moving
      // hold sprints (fighter.js owns the mechanics); tap = classic dash
      intent.dash = false;
      intent.chargeDash = k('dash');
      intent.taunt = kp('taunt');
      intent.strafe = k('strafe');
      intent.duck = k('duck');
      intent.lockOn = false;
    } else if (device.startsWith('pad')) {
      const i = +device[3];
      mx = this.padsCur[i].lx || 0;
      mz = -(this.padsCur[i].ly || 0);
      // dpad as movement fallback (UP is the ultimate now — see below)
      if (this.padHeld(i, 'DL')) mx -= 1;
      if (this.padHeld(i, 'DR')) mx += 1;
      if (this.padHeld(i, 'DD')) mz -= 1;
      intent.jump = this.padPressed(i, 'A');
      intent.jumpHeld = this.padHeld(i, 'A');
      intent.light = this.padPressed(i, 'X');
      intent.lightHeld = this.padHeld(i, 'X');
      intent.heavy = this.padPressed(i, 'Y');
      intent.heavyHeld = this.padHeld(i, 'Y');
      intent.block = this.padHeld(i, 'LT');
      // bumper shoots (hold RB = aim crosshair, release = fire), trigger specials
      intent.ranged = this.padHeld(i, 'RB');
      intent.rangedHeld = this.padHeld(i, 'RB');
      intent.special = this.padPressed(i, 'RT');
      intent.specialHeld = this.padHeld(i, 'RT');
      intent.ult = this.padPressed(i, 'DU');
      // B: standing hold CROUCHES and winds a dash coil (fires the moment a
      // direction is pushed); held on the move it's a dash-into-SPRINT
      // (fighter.js owns the mechanics)
      intent.chargeDash = this.padHeld(i, 'B');
      intent.dash = false;    // pads dash via the B coil/sprint
      // LB: TARGET LOCK, a TOGGLE — tap to lock on (face the locked enemy,
      // camera tracks them, sideways movement becomes a natural strafe),
      // tap again to release. Was hold-to-lock; a toggle frees the finger
      // for the bumper/trigger cluster during long lock fights.
      if (this.padPressed(i, 'LB')) this._lockLatch[i] = !this._lockLatch[i];
      intent.lockOn = this._lockLatch[i];
      intent.strafe = false;
      // BACK/View button — RS click would misfire while steering the camera
      intent.taunt = this.padPressed(i, 'BACK');
      // LEFT-STICK CLICK is CAMERA ADJUST, not crouch: hold it and the right
      // stick zooms the view instead of pitching it (boot.js feeds the camera).
      // Crouch lives on the B coil now — holding it crouches while it winds.
      intent.duck = false;
      intent.camAdjust = this.padHeld(i, 'LS');
    } else if (device === 'touch') {
      const t = this.touch;
      mx = t.moveX;
      mz = t.moveZ;
      intent.jump = t.pressed.has('jump');
      intent.jumpHeld = t.held.has('jump');
      intent.light = t.pressed.has('light');
      intent.lightHeld = t.held.has('light');
      intent.heavy = t.pressed.has('heavy');
      intent.heavyHeld = t.held.has('heavy');
      intent.block = t.held.has('block');
      intent.ranged = t.held.has('ranged');
      intent.rangedHeld = t.held.has('ranged');
      intent.special = t.pressed.has('special');
      intent.specialHeld = t.held.has('special');
      intent.ult = t.pressed.has('ult');
      // on-screen dash button behaves like pad B (hold = coil/sprint)
      intent.dash = false;
      intent.chargeDash = t.held.has('dash');
      intent.taunt = t.pressed.has('taunt');
      intent.strafe = t.held.has('strafe');
      intent.duck = t.held.has('duck');
      intent.lockOn = false;
    }

    // rotate into world space (camera-relative):
    // forward = (sin y, cos y), right = (-cos y, sin y)
    const cos = Math.cos(camYaw), sin = Math.sin(camYaw);
    intent.moveX = -mx * cos + mz * sin;
    intent.moveZ = mx * sin + mz * cos;
    intent.aimYaw = camYaw; // camera-based aim reference for firing/strafing
  }

  // menu direction auto-repeat: fires on the rising edge, then repeats
  // while held (delay 380ms, interval 150ms) — the console-native feel.
  // src namespaces keep aggregated & per-device consumers independent.
  _navRepeat(src, dir, held) {
    const key = src + ':' + dir;
    const now = performance.now();
    const st = this._navHold.get(key);
    if (!held) { if (st) this._navHold.delete(key); return false; }
    if (!st) { this._navHold.set(key, { t0: now, last: now }); return true; }
    if (now - st.t0 > 380 && now - st.last > 150) { st.last = now; return true; }
    return false;
  }

  // aggregated menu nav from every device (single-consumer screens)
  menuEvents() {
    const ev = { up: false, down: false, left: false, right: false, confirm: false, back: false, pause: false, lb: false, rb: false, any: false };
    const anyKey = this.keysPressed.size > 0;
    // include the per-frame edge set so a tap shorter than one frame
    // (slow machines) still registers as held for that frame
    const k = (c) => this.keys.has(c) || this.keysPressed.has(c);
    const kp = (c) => this.keysPressed.has(c);
    if (this._navRepeat('agg:kb', 'up', k('ArrowUp') || k('KeyW'))) ev.up = true;
    if (this._navRepeat('agg:kb', 'down', k('ArrowDown') || k('KeyS'))) ev.down = true;
    if (this._navRepeat('agg:kb', 'left', k('ArrowLeft') || k('KeyA'))) ev.left = true;
    if (this._navRepeat('agg:kb', 'right', k('ArrowRight') || k('KeyD'))) ev.right = true;
    if (kp('Enter') || kp('Space') || kp('KeyF') || kp('Numpad1')) ev.confirm = true;
    if (kp('Escape') || kp('Backspace') || kp('KeyG') || kp('Numpad2')) ev.back = true;
    if (kp('Escape') || kp('KeyP')) ev.pause = true;
    if (kp('KeyQ')) ev.lb = true;
    if (kp('KeyE')) ev.rb = true;
    let anyPad = false;
    for (let i = 0; i < 4; i++) {
      if (!this.padConnected(i) || this.pointerPads.has(i)) continue;
      const src = 'agg:pad' + i;
      if (this._navRepeat(src, 'up', this.padHeld(i, 'DU') || this.padsCur[i].ly < -0.6)) ev.up = true;
      if (this._navRepeat(src, 'down', this.padHeld(i, 'DD') || this.padsCur[i].ly > 0.6)) ev.down = true;
      if (this._navRepeat(src, 'left', this.padHeld(i, 'DL') || this.padsCur[i].lx < -0.6)) ev.left = true;
      if (this._navRepeat(src, 'right', this.padHeld(i, 'DR') || this.padsCur[i].lx > 0.6)) ev.right = true;
      if (this.padPressed(i, 'A')) ev.confirm = true;
      if (this.padPressed(i, 'B')) ev.back = true;
      if (this.padPressed(i, 'START')) ev.pause = true;
      if (this.padPressed(i, 'LB')) ev.lb = true;
      if (this.padPressed(i, 'RB')) ev.rb = true;
      for (const b of ['A', 'B', 'X', 'Y', 'START']) if (this.padPressed(i, b)) anyPad = true;
    }
    // on-screen menu buttons (touch)
    const tm = this.touchMenu;
    let anyTouch = false;
    for (const k of ['up', 'down', 'left', 'right', 'confirm', 'back', 'pause']) {
      if (tm[k]) { ev[k] = true; anyTouch = true; }
    }
    ev.any = anyKey || anyPad || anyTouch;
    return ev;
  }

  // per-player menu navigation (multi-cursor mech select), same repeat feel.
  // lb/rb drive the slot selector (editing empty/CPU slots from your seat).
  menuEventsFor(device) {
    const ev = { up: false, down: false, left: false, right: false, confirm: false, back: false, alt: false, lb: false, rb: false };
    const k = (c) => this.keys.has(c) || this.keysPressed.has(c);
    if (device === 'kb1') {
      ev.up = this._navRepeat(device, 'up', k('KeyW'));
      ev.down = this._navRepeat(device, 'down', k('KeyS'));
      ev.left = this._navRepeat(device, 'left', k('KeyA'));
      ev.right = this._navRepeat(device, 'right', k('KeyD'));
      ev.confirm = this.keysPressed.has('KeyF') || this.keysPressed.has('Space') || this.keysPressed.has('Enter');
      ev.back = this.keysPressed.has('KeyG') || this.keysPressed.has('Escape');
      ev.alt = this.keysPressed.has('KeyR'); // cycle color scheme
      ev.lb = this.keysPressed.has('KeyQ');
      ev.rb = this.keysPressed.has('KeyE');
    } else if (device === 'kb2') {
      ev.up = this._navRepeat(device, 'up', k('ArrowUp'));
      ev.down = this._navRepeat(device, 'down', k('ArrowDown'));
      ev.left = this._navRepeat(device, 'left', k('ArrowLeft'));
      ev.right = this._navRepeat(device, 'right', k('ArrowRight'));
      // no plain Enter here — kb1 owns it; kb2 confirms on its own cluster
      ev.confirm = this.keysPressed.has('Numpad1') || this.keysPressed.has('Comma') || this.keysPressed.has('NumpadEnter');
      ev.back = this.keysPressed.has('Numpad2') || this.keysPressed.has('Period');
      ev.alt = this.keysPressed.has('Numpad4') || this.keysPressed.has('KeyM'); // cycle color scheme
      ev.lb = this.keysPressed.has('Numpad7');
      ev.rb = this.keysPressed.has('Numpad9');
    } else if (device.startsWith('pad')) {
      const i = +device[3];
      if (this.pointerPads.has(i)) return ev; // sticks are steering the pointer
      ev.up = this._navRepeat(device, 'up', this.padHeld(i, 'DU') || this.padsCur[i].ly < -0.6);
      ev.down = this._navRepeat(device, 'down', this.padHeld(i, 'DD') || this.padsCur[i].ly > 0.6);
      ev.left = this._navRepeat(device, 'left', this.padHeld(i, 'DL') || this.padsCur[i].lx < -0.6);
      ev.right = this._navRepeat(device, 'right', this.padHeld(i, 'DR') || this.padsCur[i].lx > 0.6);
      ev.confirm = this.padPressed(i, 'A');
      ev.back = this.padPressed(i, 'B');
      ev.alt = this.padPressed(i, 'X'); // cycle color scheme
      ev.lb = this.padPressed(i, 'LB');
      ev.rb = this.padPressed(i, 'RB');
    } else if (device === 'touch') {
      const tm = this.touchMenu;
      ev.up = tm.up; ev.down = tm.down; ev.left = tm.left; ev.right = tm.right;
      ev.confirm = tm.confirm; ev.back = tm.back; ev.alt = tm.alt;
    }
    return ev;
  }

  // Right stick as a MENU look axis (mech select uses it to spin your locked
  // robot). Analog, not an edge — it reads as "how hard are you pushing",
  // which is what a hold-to-rotate needs. Pads only: a keyboard has no
  // spare analog axis, and the mech spins itself when nobody is driving.
  menuLookFor(device) {
    if (!device?.startsWith('pad')) return { x: 0, y: 0 };
    const i = +device[3];
    if (this.pointerPads.has(i)) return { x: 0, y: 0 }; // sticks are the pointer
    const c = this.padsCur[i];
    return { x: c.rx || 0, y: c.ry || 0 };
  }

  rumble(padIndex, strength = 0.5, ms = 150) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads[padIndex];
    if (gp?.vibrationActuator?.playEffect) {
      gp.vibrationActuator.playEffect('dual-rumble', {
        duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6,
      }).catch(() => {});
    }
  }
}
