import { rand } from '../../core/utils.js';
import { smooth } from './shared.js';

// SYSTEM FAILURE bluescreen markup (matches docs/canonical/
// null_bluescreen_of_death.png): terminal text, corruption bars, scanlines.
// `bars` is the freshly-randomized batch of strobing corruption-bar divs
// built per showing in showBluescreen().
const BSOD_HTML = (bars) => `
    <style>
      @keyframes nb-bar { 0%,45% { opacity: 0; } 50%,90% { opacity: 0.85; } 100% { opacity: 0; } }
      @keyframes nb-jit { 0%,92% { transform: translate(0,0); } 94% { transform: translate(-7px,2px); }
        96% { transform: translate(5px,-3px); } 98% { transform: translate(-3px,1px); } 100% { transform: translate(0,0); } }
      @keyframes nb-blink { 0%,55% { opacity: 1; } 60%,100% { opacity: 0.15; } }
    </style>
    ${bars}
    <div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,0.22) 0 2px,transparent 2px 4px);"></div>
    <div style="position:absolute;left:6%;top:5.5%;max-width:70%;animation:nb-jit 1.1s infinite;text-shadow:0 0 8px #4a7dff;">
      <div style="font-size:min(4.6vw,44px);font-weight:700;letter-spacing:0.14em;color:#eaf2ff;white-space:nowrap;">SYSTEM FAILURE</div>
      <div style="margin-top:1.6vh;font-size:min(1.8vw,16px);line-height:1.55;">
        A fatal exception 0x00<span style="color:#ff4d5e;">NULLBOT</span> has occurred in your system.<br>
        The system has been terminated.
      </div>
      <div style="margin-top:1.7vh;display:inline-block;border:2px solid #cfe0ff;padding:0.4vh 1.2vw;font-size:min(2.3vw,21px);letter-spacing:0.12em;">NULLBOT.EXE</div>
      <div style="margin-top:0.6vh;font-size:min(1.6vw,14px);color:#ff4d5e;letter-spacing:0.2em;">EXECUTION: TERMINATED</div>
      <div style="margin-top:1.5vh;font-size:min(1.7vw,15px);letter-spacing:0.08em;">STOP CODE: 0xNULL_00000000</div>
      <div style="margin-top:0.6vh;font-size:min(1.5vw,13px);line-height:1.6;color:#9fb6ff;">
        &gt; NULL_REFERENCE_DETECTED<br>
        &gt; CRITICAL_PROCESS_DIED<br>
        &gt; SYSTEM_DATA_CORRUPTED<br>
        &gt; REALITY_SYNC_LOST
      </div>
      <div style="margin-top:1.5vh;font-size:min(1.7vw,15px);">THIS WORLD WILL BE <span style="color:#ff4d5e;">NULLIFIED.</span></div>
      <div style="margin-top:1.4vh;font-size:min(1.6vw,14px);letter-spacing:0.12em;">NULLIFYING SYSTEM...</div>
      <div style="margin-top:0.6vh;width:30vw;height:1.8vh;border:2px solid #cfe0ff;position:relative;">
        <div style="position:absolute;inset:2px;background:repeating-linear-gradient(90deg,#8fb0ff 0 10px,#3556d0 10px 12px);"></div>
        <div style="position:absolute;right:-4.5vw;top:-0.3vh;color:#ff4d5e;font-size:min(1.7vw,15px);">100%</div>
      </div>
      <div style="margin-top:1.3vh;font-size:min(1.6vw,14px);text-decoration:underline;">DO NOT REBOOT. THERE IS NO RECOVERY.</div>
      <div style="margin-top:1.5vh;font-size:min(1.9vw,17px);color:#ff4d5e;letter-spacing:0.22em;animation:nb-blink 0.9s steps(1) infinite;">GOODBYE.</div>
    </div>`;

// NULLBOT: stalks in, seizes the mark one-handed and FLOODS them with
// corruption until they're more static than machine — drops the husk,
// notices YOU, squares up on the lens, and punches the camera: SYSTEM
// FAILURE. The bluescreen holds for a full three seconds, then the
// scene ends (skip and end() both tear the overlay down).
export function nullbot(F) {
  const { win, vic, w } = F;
  F.dur = 8.0;
  const GRAB_JOINTS = [
    ['torso', 0.2, 1.5], ['head', -0.1, 0.4],
    ['shoulderL', -1.0, 0.1], ['shoulderR', -1.0, 0.1],
    ['elbowL', -0.9, 0], ['elbowR', -0.9, 0],
    ['thighL', -1.2, 0], ['thighR', -1.2, 0],
    ['kneeL', -1.1, 0], ['kneeR', -1.1, 0],
  ];
  const vicPatch = (size, life) => {
    const [jn, y0, y1] = GRAB_JOINTS[(Math.random() * GRAB_JOINTS.length) | 0];
    w.effects.glitchOn(vic, {
      joint: jn,
      x: rand(-0.3, 0.3) * vic.scale,
      y: rand(y0, y1) * vic.scale,
      z: rand(-0.2, 0.4) * vic.scale,
      size, life,
    });
  };
  F.approach(0.2, 1.0, 2.6);
  F.camShot(0, 1.35, { dist: 12, h: 4.4, az0: 2.1, az1: 2.5 });
  F.at(1.1, () => { win.animator.play('grabReach'); w.audio?.play('servo'); });
  F.at(1.32, () => { F.ragdoll(vic, 'ragdollAir'); F.beat('zap', 0.35, 0.05); });
  // the mark is LEVITATED out at arm's length — well clear of NULLBOT —
  // and rises slowly into the air while the corruption pours in: patch
  // after patch of their body stops rendering, faster and faster, and
  // the patches STAY, until there is more static than machine
  F.hold(1.32, 4.2, (k, dt) => {
    win.yaw = win.targetYaw = F.axis;
    const hx = win.pos.x + Math.sin(F.axis) * 3.6 * win.scale;
    const hz = win.pos.z + Math.cos(F.axis) * 3.6 * win.scale;
    const grip = Math.min(1, dt * 9);
    vic.pos.x += (hx - vic.pos.x) * grip;
    vic.pos.z += (hz - vic.pos.z) * grip;
    vic.pos.y = smooth(Math.min(1, k * 1.4)) * 2.3 * win.scale + Math.sin(k * 21) * 0.1;
    vic.yaw = vic.targetYaw = F.axis + Math.PI;
    vic.group.rotation.y = vic.yaw;
    // loose flecks + occasional shard bursts, ramping with the corruption
    if (Math.random() < dt * (10 + 50 * k)) {
      w.effects.glitchFleck(
        vic.pos.x + rand(-0.8, 0.8) * vic.scale,
        vic.pos.y + rand(0.3, vic.height),
        vic.pos.z + rand(-0.8, 0.8) * vic.scale, 1.25 * vic.scale);
    }
    if (Math.random() < dt * (1.5 + 8 * k)) {
      w.effects.glitchBurst(vic.center(), 8, 5, 0.8 * vic.scale);
      if (Math.random() < 0.4) w.audio?.play('zap');
    }
    // accumulating patches: long-lived (they persist on the downed wreck
    // AFTER the bluescreen too), spawning ever faster
    F._pt = (F._pt ?? 0) - dt;
    if (F._pt <= 0) {
      F._pt = 0.5 - 0.44 * k * k;
      vicPatch(rand(1.3, 1.8), rand(14, 22));
    }
  });
  // side-front quarter, lens lifted to follow the rising body
  F.camShot(1.35, 4.25, { dist: 12, h: 4.9, az0: 1.35, az1: 1.8, lookH: 4.3 });
  // TOTAL COVERAGE: a final two-layer blanket over every body part —
  // whatever was still recognizable stops rendering entirely
  F.at(4.2, () => {
    for (let i = 0; i < GRAB_JOINTS.length; i++) {
      vicPatch(rand(1.8, 2.2), 25); // outlives the scene: the wreck stays corrupted
      vicPatch(rand(1.1, 1.5), 25);
    }
    w.effects.glitchBurst(vic.center(), 26, 10, vic.scale);
    F.beat('zap', 0.6, 0.06);
  });
  // ...and then it notices YOU. Locked-off lens shot at chest height;
  // NULLBOT turns square into it while the corrupted mass hangs behind.
  // The levitation ends WITH THE SCENE, not with its hold. Nothing else was
  // bringing the body down after 4.2, so the wreck was left hanging ~3 units
  // off the deck for the rest of the finisher and into the round-end beat —
  // the "victim floating above the ground" case. It keeps hanging through
  // the lens shot (the corrupted mass behind him is the point), then drops
  // under the bluescreen, which covers the whole screen from 4.97: by the
  // time the overlay lifts, the wreck is lying on the floor where it belongs.
  F.hold(4.2, 5.35, () => {
    vic.pos.y = 2.3 * win.scale;   // held: the mass hangs behind the lens shot
  });
  F.hold(5.35, F.dur, (k) => {
    vic.pos.y = Math.max(0, 2.3 * win.scale * (1 - smooth(Math.min(1, k * 2.6))));
    if (vic.pos.y <= 0) { vic.grounded = true; vic.vel.set(0, 0, 0); }
  });
  F.hold(4.25, 5.2, () => {
    const az = F.axis + 2.5;
    const d = 6.2 * F.stageScale;
    F.cam.pos.set(win.pos.x + Math.sin(az) * d, win.height * 0.6, win.pos.z + Math.cos(az) * d);
    F.cam.look.set(win.pos.x, win.height * 0.64, win.pos.z);
    win.yaw = win.targetYaw = Math.atan2(F.cam.pos.x - win.pos.x, F.cam.pos.z - win.pos.z);
  });
  F.at(4.45, () => { w.audio?.play('servo'); win.animator.addImpulse('head', [0, 0.5, 0], 22, 9); });
  F.at(4.72, () => win.animator.play('light2', { speed: 1.0 }));
  // the fist arrives AT the lens — and the feed dies
  F.at(4.97, () => {
    F.beat('hitHeavy', 1.6, 0.16);
    w.audio?.play('explosionBig');
    w.effects.glitchBurst(win.center(), 24, 12, win.scale);
    showBluescreen(F);
  });
  // NOTE: no clearGlitchOn cleanup here — the corruption deliberately
  // STAYS on the wreck after the bluescreen lifts (patch lifetimes cover
  // the round-end beat; the next round's resetForRound wipes them).
  // The SYSTEM FAILURE screen owns the last three seconds; end() (or a
  // skip) tears the overlay down via cleanups.
}

// full-screen SYSTEM FAILURE bluescreen (matches docs/canonical/
// null_bluescreen_of_death.png): terminal text, corruption bars, scanlines
function showBluescreen(F) {
  const root = document.getElementById('ui-root');
  if (!root) return;
  const el = document.createElement('div');
  el.style.cssText =
    'position:absolute;inset:0;z-index:9;overflow:hidden;pointer-events:none;' +
    'background:linear-gradient(135deg,#050b7a 0%,#0a1cb4 45%,#071060 100%);' +
    "font-family:'Courier New',monospace;color:#cfe0ff;";
  // corruption bars: hard random blocks strobing at the screen edges
  let bars = '';
  for (let i = 0; i < 26; i++) {
    const left = Math.random() * 100, top = Math.random() * 100;
    const wpc = 2 + Math.random() * 14, hpc = 0.4 + Math.random() * 2.6;
    const colors = ['#ff2038', '#27f6ff', '#ff2df2', '#3cff6e', '#ffe23c', '#ffffff', '#0a1cb4'];
    const c = colors[(Math.random() * colors.length) | 0];
    const dur = (0.12 + Math.random() * 0.5).toFixed(2);
    const delay = (Math.random() * 0.7).toFixed(2);
    bars += `<div style="position:absolute;left:${left}%;top:${top}%;width:${wpc}%;height:${hpc}%;` +
      `background:${c};opacity:0;animation:nb-bar ${dur}s steps(2) ${delay}s infinite;"></div>`;
  }
  el.innerHTML = BSOD_HTML(bars);
  root.appendChild(el);
  F.cleanups.push(() => el.remove());
}
