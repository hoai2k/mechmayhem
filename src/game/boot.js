// Game boot: owns the engine, audio, input and the screen state machine.
// Title → Setup → Mech Select → Arena Select → Battle → Results → loop.
import * as THREE from 'three';
import { Engine } from '../core/engine.js';
import { Input } from './input.js';
import { THEMES_BY_ID } from '../arena/themes.js';
import { ROSTER_BY_ID, playableRoster } from '../mechs/roster.js';
import { applyColorScheme, SCHEME_COUNT } from '../mechs/colorscheme.js';
import { Fighter } from '../combat/fighter.js';
import { AIController } from './ai.js';
import { Match } from './match.js';
import { Hud, toast } from '../ui/hud.js';
import { TitleScreen, MechSelectScreen, ArenaSelectScreen, PauseScreen, ResultsScreen, SettingsScreen } from '../ui/menus.js';
import { InstructionsScreen } from '../ui/instructions.js';
import { CONFIG, setInfiniteUltimates, setShowAllRobots } from '../core/config.js';
import { t } from '../core/text.js';
import { GameAudio } from '../core/audio.js';
import { MusicPlayer } from '../core/music.js';
import { NowPlaying } from '../ui/nowplaying.js';
import { createMech, preloadMechModels, loadManifest, is3dMode } from '../mechs/gltf.js';
import { preloadPropModels } from '../arena/propglb.js';
import { TouchControls, installTouchZoomGuards } from './touch.js';
import { isTouchDevice } from '../core/utils.js';
import { MenuStage } from './menustage.js';
import { PadPointers } from './padpointers.js';
import { Warmup } from './warmup.js';
import { createBattle } from './battle.js';

export async function bootGame() {
  const engine = new Engine(document.getElementById('game-canvas'));
  const input = new Input();
  const uiRoot = document.getElementById('ui-root');

  // document chrome (tab title + the portrait "rotate" hint in index.html)
  // is text too — pull it from the catalogue so nothing lives outside it
  document.title = t('app.title');
  const rotT = document.querySelector('#rotate-hint .rot-title');
  const rotS = document.querySelector('#rotate-hint .rot-sub');
  if (rotT) rotT.textContent = t('app.rotate.title');
  if (rotS) rotS.textContent = t('app.rotate.sub');

  // Resolve the manifest before any screen builds so manifestHasGlb() can
  // decide spinner-vs-procedural synchronously. Skipped under ?debug=fallback,
  // where is3dMode() is false and the whole roster stays procedural.
  if (is3dMode()) { try { await loadManifest(); } catch (e) { /* falls back to procedural */ } }
  // arena prop models (Tripo GLBs) warm in the background — any arena built
  // before they land just keeps its procedural props
  preloadPropModels();

  let audio;
  try {
    audio = new GameAudio();
  } catch (e) {
    console.warn('audio unavailable', e);
    audio = {
      play() {}, music() {}, stopMusic() {}, resume() {}, suspend() {},
      setSfxVolume() {}, setMusicVolume() {},
    };
  }
  const resumeAudio = () => audio.resume();
  window.addEventListener('pointerdown', resumeAudio);
  window.addEventListener('keydown', resumeAudio);

  // ---- battle soundtrack: the songs in src/music/ (see core/music.js). The
  // menus keep the procedural sequencer; a fight plays a random song, named in
  // the bottom-right readout, whose icon turns the music off without touching
  // the combat SFX. Falls back to the sequencer's theme track if src/music/ is
  // empty or <audio> is unavailable.
  const music = new MusicPlayer();
  const nowPlaying = new NowPlaying(uiRoot, music);

  // ---- sound on/off: corner button on menus, mirrored in the pause menu ----
  let muted = false;
  try { muted = localStorage.getItem('rw.muted') === '1'; } catch (e) { /* ok */ }
  const muteBtn = document.createElement('div');
  muteBtn.id = 'mute-btn';
  muteBtn.title = t('settings.btn.sound');
  muteBtn.style.cssText =
    'position:absolute;right:16px;bottom:58px;z-index:40;cursor:pointer;font-size:26px;' +
    'opacity:0.8;user-select:none;text-shadow:0 2px 6px #000;pointer-events:auto;';
  uiRoot.appendChild(muteBtn);
  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('rw.muted', m ? '1' : '0'); } catch (e) { /* ok */ }
    audio.setSfxVolume(muted ? 0 : 0.8);
    audio.setMusicVolume(muted ? 0 : 0.35);
    music.setMuted(muted);
    muteBtn.textContent = muted ? '🔇' : '🔊';
  }
  muteBtn.addEventListener('click', () => setMuted(!muted));
  setMuted(muted);

  // ---- settings: gear button beside the sound button; opens a modal
  // panel that floats over whatever screen is up (incl. the pause menu) ----
  const gearBtn = document.createElement('div');
  gearBtn.id = 'settings-btn';
  gearBtn.title = t('settings.btn.settings');
  gearBtn.textContent = '⚙️';
  gearBtn.style.cssText =
    'position:absolute;right:56px;bottom:58px;z-index:40;cursor:pointer;font-size:26px;' +
    'opacity:0.8;user-select:none;text-shadow:0 2px 6px #000;pointer-events:auto;';
  uiRoot.appendChild(gearBtn);
  const settingsItems = () => [
    { label: () => t(muted ? 'settings.sound.off' : 'settings.sound.on'), fn: () => setMuted(!muted) },
    ...(music.available
      ? [{
        label: () => t(music.enabled ? 'settings.music.on' : 'settings.music.off'),
        fn: () => music.setEnabled(!music.enabled),
      }]
      : []),
    {
      label: () => t(CONFIG.debugUltimates ? 'settings.infiniteUlts.on' : 'settings.infiniteUlts.off'),
      fn: () => setInfiniteUltimates(!CONFIG.debugUltimates),
    },
    {
      // work-in-progress mechs (roster `hidden`) join the game roster; the
      // workbenches (?showcase, ?rigedit, ?battle=...) always show them
      label: () => t(CONFIG.showAllRobots ? 'settings.showAllRobots.on' : 'settings.showAllRobots.off'),
      fn: () => setShowAllRobots(!CONFIG.showAllRobots),
    },
    // controller-reachable page reload (via LB/RB → settings → this item)
    { label: () => t('settings.reload'), fn: () => window.location.reload() },
  ];
  function openSettings() {
    if (S.modal) return;
    audio.play('uiSelect');
    S.modal = new SettingsScreen(uiRoot, {
      audio,
      items: settingsItems(),
      onBack: () => closeModal(),
    });
  }
  function closeModal() {
    S.modal?.destroy();
    S.modal = null;
  }
  gearBtn.addEventListener('click', () => openSettings());

  // ---- how to play: ⓘ button left of the gear; opens the controller
  // diagram (src/ui/instructions.js) as another floating modal ----
  const infoBtn = document.createElement('div');
  infoBtn.id = 'instructions-btn';
  infoBtn.textContent = 'ⓘ';
  infoBtn.style.cssText =
    'position:absolute;right:96px;bottom:58px;z-index:40;cursor:pointer;font-size:26px;' +
    'opacity:0.8;user-select:none;text-shadow:0 2px 6px #000;pointer-events:auto;';
  uiRoot.appendChild(infoBtn);
  function openInstructions() {
    if (S.modal) return;
    audio.play('uiSelect');
    S.modal = new InstructionsScreen(uiRoot, { audio, onBack: () => closeModal() });
  }
  infoBtn.addEventListener('click', () => openInstructions());

  // hover tooltips on all three corner buttons (native `title` is the
  // fallback; .hot-btn styles the styled bubble)
  for (const [btn, id] of [[infoBtn, 'settings.btn.instructions'],
    [gearBtn, 'settings.btn.settings'], [muteBtn, 'settings.btn.sound']]) {
    btn.title = t(id);
    btn.dataset.tip = t(id);
    btn.classList.add('hot-btn');
  }

  // corner buttons as controller-selectable stops: the LB/RB slot selector
  // (mech select) and the title screen both walk this list, and pad pointers
  // can click the elements directly
  const hotButtons = [
    { id: 'instructions', el: infoBtn, activate: () => openInstructions() },
    { id: 'settings', el: gearBtn, activate: () => openSettings() },
    { id: 'mute', el: muteBtn, activate: () => setMuted(!muted) },
  ];

  // controller SELECT/VIEW button ↔ per-pad mouse pointer on menu screens
  const padPointers = new PadPointers(input, uiRoot, audio);

  let muteVisible = true;
  function updateMuteBtn() {
    // the readout belongs to the fight (and the results panel behind which it
    // keeps playing), not to the menus — and not to the warm-up screen, whose
    // own hint bar owns the bottom edge
    nowPlaying.setVisible((S.mode === 'battle' || S.mode === 'results')
      && !!S.battle && !S.battle.loading);
    const show = !(S.mode === 'battle' && S.battle && !S.battle.paused);
    if (show !== muteVisible) {
      muteVisible = show;
      muteBtn.style.display = show ? '' : 'none';
      gearBtn.style.display = show ? '' : 'none';
      infoBtn.style.display = show ? '' : 'none';
    }
  }

  // On-screen touch controls (phones/tablets). Mounting sets input.touchAvailable,
  // which unlocks the TOUCH device option on the setup screen.
  const touchControls = isTouchDevice()
    ? new TouchControls(input, {
        onPause: () => pauseBattle(),
        onLook: (dx, dy) => {
          if (S.mode !== 'battle' || !S.battle || S.battle.paused) return;
          const B = S.battle;
          if (B.cameraSys.mode === 'split') {
            // drag steers the touch player's own viewport
            const h = B.humans.find((x) => x.device === 'touch');
            if (h) B.cameraSys.applyLookFor(h.idx, dx, dy);
          } else {
            B.cameraSys.applyLook(dx, dy);
          }
        },
      })
    : null;
  if (isTouchDevice()) {
    document.body.classList.add('touch-mode');
    installTouchZoomGuards();
  }

  input.onPadConnect = (gp) => toast(t('toast.padConnected', { id: gp.id.slice(0, 34) }));
  input.onPadDisconnect = (gp) => {
    toast(t('toast.padDisconnected'));
    // pause if that pad was driving a fighter
    if (S.mode === 'battle' && S.battle && !S.battle.paused) {
      const inUse = S.battle.humans.some((h) => h.device === 'pad' + gp.index);
      if (inUse) pauseBattle();
    }
  };

  // lighting defaults captured for menu restoration
  const defaults = {
    sun: { color: engine.sun.color.clone(), intensity: engine.sun.intensity, pos: engine.sun.position.clone() },
    hemi: { color: engine.hemi.color.clone(), ground: engine.hemi.groundColor.clone(), intensity: engine.hemi.intensity },
    rim: { color: engine.rim.color.clone(), intensity: engine.rim.intensity, pos: engine.rim.position.clone() },
  };
  function resetScene() {
    const keep = new Set([engine.hemi, engine.sun, engine.sun.target, engine.rim]);
    for (const c of [...engine.scene.children]) if (!keep.has(c)) engine.scene.remove(c);
    engine.sun.color.copy(defaults.sun.color);
    engine.sun.intensity = defaults.sun.intensity;
    engine.sun.position.copy(defaults.sun.pos);
    engine.hemi.color.copy(defaults.hemi.color);
    engine.hemi.groundColor.copy(defaults.hemi.ground);
    engine.hemi.intensity = defaults.hemi.intensity;
    engine.rim.color.copy(defaults.rim.color);
    engine.rim.intensity = defaults.rim.intensity;
    engine.rim.position.copy(defaults.rim.pos);
    engine.renderer.toneMappingExposure = 1.05;
    engine.views = null;
    engine.backdrop = null;
    engine.onBeforeView = null;
    engine.onAfterView = null;
    engine.timeScale = 1;
    engine.scene.fog = null;
    engine.scene.background = new THREE.Color(0x0a0e18);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F10') { e.preventDefault(); toggleFullscreen(); }
    if (e.code === 'F9') { e.preventDefault(); toggleSplitLayout(); }
  });

  // flip the 2-player split between side-by-side and stacked
  function toggleSplitLayout() {
    const B = S.battle;
    if (!B || B.humans.length !== 2) return;
    B.cameraSys.toggleLayout2p();
    B.hud.positionPlates(
      B.cameraSys.layoutKind(B.humans.length),
      B.humans.map((h) => B.fighters.indexOf(h.fighter))
    );
  }

  // ---------------- state machine ----------------
  const S = {
    screen: null,        // active menu screen object (has update/destroy)
    stage: null,         // MenuStage
    battle: null,        // battle context
    slots: null,
    picks: null,
    variants: null,      // color scheme per slot
    themeId: null,
    mode: 'title',
  };

  function setScreen(screen) {
    closeModal(); // a floating settings panel never outlives a screen change
    S.screen?.destroy();
    S.screen = screen;
  }

  // menu input goes to the settings modal when one is open, else the screen
  function screenUpdate(ev) {
    if (S.modal) S.modal.update(ev);
    else S.screen?.update(ev);
  }

  function ensureStage(kind) {
    if (!S.stage) {
      resetScene();
      S.stage = new MenuStage(engine);
    }
    if (kind === 'lineup') S.stage.showLineup();
  }

  function goTitle() {
    teardownBattle();
    ensureStage('lineup');
    S.mode = 'title';
    audio.music('menu');
    setScreen(new TitleScreen(uiRoot, {
      audio, hotButtons,
      onPlay: () => goMechSelect(),
      onFullscreen: toggleFullscreen,
    }));
  }

  function goMechSelect() {
    ensureStage('lineup');
    S.mode = 'mechselect';
    setScreen(new MechSelectScreen(uiRoot, {
      input, audio, hotButtons, prev: S.slots,
      onPreview: (entries) => S.stage?.showPreviews(entries),
      onLockFx: (slotIdx) => S.stage?.lockFx(slotIdx),
      onYaw: (slotIdx, d) => S.stage?.setYaw(slotIdx, d),
      onDone: (picks, variants, slots) => { S.picks = picks; S.variants = variants; S.slots = slots; goArenaSelect(); },
      onBack: () => goTitle(),
    }));
  }

  function goArenaSelect() {
    S.mode = 'arenaselect';
    preloadMechModels(S.picks.filter((p) => p && p !== 'random')); // warm GLB cache while browsing arenas
    setScreen(new ArenaSelectScreen(uiRoot, {
      audio,
      onDone: (themeId) => { S.themeId = themeId; startBattle(); },
      onBack: () => goMechSelect(),
    }));
  }

  // pre-fight warm-up (asset loading) flow — see src/game/warmup.js.
  // Per-battle loading state lives on S.battle.loading (read by the main
  // loop and teardownBattle below).
  const warmup = new Warmup({ engine, uiRoot, touchControls });

  // ---------------- battle ----------------
  async function startBattle() {
    setScreen(null);
    S.stage?.destroy();
    S.stage = null;
    resetScene();
    S.mode = 'battle';

    const theme = THEMES_BY_ID[S.themeId];
    // give the arena-prop GLBs a short window to finish warming (direct
    // ?battle= URLs build the arena within seconds of boot) — never a hard
    // gate, the procedural props always work
    await Promise.race([preloadPropModels(), new Promise((r) => setTimeout(r, 1500))]);
    // shared world/arena/camera wiring (arenaObjs = everything the arena
    // adds, hidden behind the warm-up's neutral backdrop and revealed
    // fully-warmed later)
    const { world, arena, arenaObjs, cameraSys } = createBattle(engine, {
      theme, audio, input, seed: (Math.random() * 9999) | 0,
    });

    const active = [];
    S.slots.forEach((s, i) => { if (s.kind !== 'off') active.push({ slot: s, slotIdx: i }); });
    const spawns = arena.spawnPoints(active.length);
    const fighters = [], humans = [], ais = [];
    // build mechs up-front: GLB-backed where the model manifest has one.
    // Each fighter wears its chosen paint scheme; anyone sharing a mech id
    // with an identical scheme (e.g. random AI picks) gets auto-bumped.
    const defs = active.map((a) => {
      const roster = playableRoster();
      const base = ROSTER_BY_ID[S.picks[a.slotIdx]] || roster[(Math.random() * roster.length) | 0];
      return { base, variant: S.variants?.[a.slotIdx] || 0 };
    });
    defs.forEach((d, i) => {
      const clash = () => defs.some((o, j) =>
        j < i && o.base.id === d.base.id && o.variant === d.variant);
      for (let t = 0; clash() && t < SCHEME_COUNT; t++) d.variant = (d.variant + 1) % SCHEME_COUNT;
    });
    const finalDefs = defs.map((d) => applyColorScheme(d.base, d.variant));
    // never gate the warm-up screen on slow model downloads: whoever's
    // model is ready within the grace window (procedural, or a GLB already
    // cached by the arena-select preload) spawns now; the rest spawn as
    // hidden procedural placeholders that swap to the real model mid-warm-up
    // (a spinner marks their panel until then — see warmup.start)
    const mechPromises = finalDefs.map((d) => createMech(d));
    const grace = new Promise((res) => setTimeout(() => res(null), 400));
    const mechs = await Promise.all(mechPromises.map((p) => Promise.race([p, grace])));
    active.forEach((a, i) => {
      const def = finalDefs[i];
      const f = new Fighter(world, def, {
        pos: spawns[i].pos, yaw: spawns[i].yaw,
        playerIndex: a.slotIdx, isAI: a.slot.kind === 'ai',
        mech: mechs[i] || undefined,
      });
      if (!mechs[i]) {
        f._modelPending = true;
        f.group.visible = false;
        mechPromises[i].then((m) => {
          f._modelPending = false;
          f._wuSpin?.remove();
          f._wuSpin = null;
          if (!world.fighters.includes(f)) return; // battle torn down
          if (m.isGLB) f.swapMech(m);
          f.group.visible = true;
          if (S.battle?.loading) f.animator.play('intro');
        });
      }
      fighters.push(f);
      world.fighters.push(f);
      if (a.slot.kind === 'ai') {
        const ctrl = new AIController(f, a.slot.diff);
        ctrl.diffName = a.slot.diff;
        ais.push(ctrl);
      } else humans.push({ fighter: f, device: a.slot.device, idx: humans.length });
    });

    const hud = new Hud(uiRoot, world);
    hud.buildPlates(fighters);
    hud.positionPlates(cameraSys.layoutKind(humans.length), humans.map((h) => fighters.indexOf(h.fighter)));
    world.camera = engine.camera;

    const match = new Match({
      engine, world, fighters, hud,
      onEnd: (winner) => {
        S.mode = 'results';
        touchControls?.setVisible(false);
        setScreen(new ResultsScreen(uiRoot, {
          winner, audio,
          onRematch: () => { setScreen(null); match.begin(); S.mode = 'battle'; },
          onChangeMechs: () => { teardownBattle(); ensureStage(); goMechSelect(); },
          onMenu: () => goTitle(),
        }));
      },
    });

    // ---- RANDOM roster picks: a fresh robot is dealt every round ----
    const randomIdx = active
      .map((a, i) => (S.picks[a.slotIdx] === 'random' ? i : -1))
      .filter((i) => i >= 0);
    match.onRoundStart = (round) => {
      if (round < 2 || !randomIdx.length) return;
      for (const i of randomIdx) {
        const old = fighters[i];
        const exclude = new Set(fighters.filter((f) => f !== old).map((f) => f.def.id));
        const roster = playableRoster();
        const pool = roster.filter((m) => !exclude.has(m.id));
        const src = pool.length ? pool : roster;
        const base = src[(Math.random() * src.length) | 0];
        let variant = S.variants?.[old.playerIndex] || 0;
        for (let t = 0; fighters.some((o) => o !== old && o.def.id === base.id && (o.def.variant || 0) === variant) && t < SCHEME_COUNT; t++) {
          variant = (variant + 1) % SCHEME_COUNT;
        }
        const def = applyColorScheme(base, variant);
        // retire the old body cleanly (patches, quills, scene, geometry)
        world.effects.clearGlitchOn(old);
        world.scene.remove(old.group);
        old.group.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
        const nf = new Fighter(world, def, {
          pos: old.pos.clone(), yaw: old.yaw,
          playerIndex: old.playerIndex, isAI: old.isAI,
        });
        // freshly-dealt robots fight in their procedural body until their
        // manifest GLB (if any) arrives in the background, then swap in
        createMech(def).then((m) => {
          if (m.isGLB && world.fighters.includes(nf)) nf.swapMech(m);
        });
        nf.wins = old.wins;
        fighters[i] = nf;
        const wi = world.fighters.indexOf(old);
        if (wi >= 0) world.fighters[wi] = nf;
        const h = humans.find((x) => x.fighter === old);
        if (h) h.fighter = nf;
        const ci = ais.findIndex((x) => x.f === old);
        if (ci >= 0) {
          const ctrl = new AIController(nf, ais[ci].diffName);
          ctrl.diffName = ais[ci].diffName;
          ais[ci] = ctrl;
        }
      }
      hud.buildPlates(fighters);
      hud.positionPlates(cameraSys.layoutKind(humans.length), humans.map((h) => fighters.indexOf(h.fighter)));
    };

    const usesTouch = humans.some((h) => h.device === 'touch');
    S.battle = { world, arena, fighters, humans, ais, cameraSys, hud, match, paused: false, usesTouch, loading: null, arenaObjs };
    if (touchControls) touchControls.setVisible(false); // hidden until the bell
    if (music.available) { audio.stopMusic(); music.start(); }
    else audio.music(theme.music);
    // pre-fight warm-up screen: the match is gated behind it while the
    // texture pack streams in and the first frames compile every shader
    warmup.start(S.battle, theme);

    // pad rumble helper reaches humans by playerIndex
    world.input.rumble = ((orig) => (playerIndex, s, ms) => {
      const h = humans.find((h) => h.fighter.playerIndex === playerIndex);
      if (h && h.device.startsWith('pad')) orig.call(input, +h.device[3], s, ms);
    })(Input.prototype.rumble);
  }

  function teardownBattle() {
    if (!S.battle) return;
    music.stop();
    nowPlaying.setVisible(false);
    touchControls?.setVisible(false);
    if (S.battle.loading) { // quit mid-warm-up: drop the overlay + cameras
      S.battle.loading.ov.remove();
      S.battle.loading = null;
      engine.views = null;
    }
    S.battle.match.destroy();
    S.battle.hud.destroy();
    S.battle.cameraSys.dividerEl.remove();
    S.battle.arena.dispose();
    S.battle = null;
    resetScene();
    setScreen(null);
  }

  function pauseBattle() {
    if (!S.battle || S.battle.paused) return;
    S.battle.paused = true;
    touchControls?.setVisible(false);
    audio.play('pause');
    music.pause();
    setScreen(new PauseScreen(uiRoot, {
      audio, hotButtons,
      onResume: () => { S.battle.paused = false; setScreen(null); music.resume(); if (S.battle.usesTouch) touchControls?.setVisible(true); },
      onQuit: () => goTitle(),
      onFullscreen: toggleFullscreen,
      onSettings: () => openSettings(),
      splitToggle: S.battle.humans.length === 2 ? {
        label: () => t(S.battle.cameraSys.layout2p === 'lr' ? 'settings.split.side' : 'settings.split.stacked'),
        fn: () => toggleSplitLayout(),
      } : null,
    }));
  }

  // ---------------- main loop ----------------
  engine.onUpdate = (dt) => {
    input.poll();
    const B = S.battle;
    // pad pointers first: clicks land and pointer pads go quiet BEFORE the
    // screens read this frame's menu events
    padPointers.update(dt, !(S.mode === 'battle' && B && !B.paused));

    if (S.mode === 'battle' && B) {
      if (!B.paused) {
        for (const h of B.humans) {
          if (h.fighter.alive && !h.fighter.controlsLocked) {
            input.readIntent(h.device, h.fighter.intent, B.cameraSys.inputYawFor(h.fighter, h.idx));
            if (B.loading) {
              // warm-up playground: melee/movement only — no shots, no
              // specials, no ults before the bell
              const I = h.fighter.intent;
              I.ranged = I.rangedHeld = I.special = I.specialHeld = I.ult = false;
            }
          } else {
            h.fighter.intent.moveX = h.fighter.intent.moveZ = 0;
          }
        }
        for (const ai of B.ais) ai.update(dt);
        world_update(B, dt);
        if (B.loading) warmup.update(B, dt);
        B.match.update(dt);
        const ev = input.menuEvents();
        if (ev.pause) pauseBattle();
      } else {
        screenUpdate(input.menuEvents());
      }
    } else if (S.mode === 'results' && B) {
      // battle keeps simmering behind the results panel
      world_update(B, dt * 0.4);
      screenUpdate(input.menuEvents());
    } else {
      S.stage?.update(dt);
      screenUpdate(input.menuEvents());
    }
    updateMuteBtn();
    input.endFrame();
  };

  function world_update(B, dt) {
    B.world.update(dt);
    B.hud.update(dt, engine.camera, B.match.state === 'fight' ? B.match.timeLeft : undefined);
  }

  engine.onRender = (dtReal) => {
    const B = S.battle;
    if (B?.loading) return; // warm-up owns the fixed per-fighter cameras
    if ((S.mode === 'battle' || S.mode === 'results') && B) {
      // right stick = camera control, per player
      if (!B.paused) {
        for (const h of B.humans) {
          if (!h.device.startsWith('pad')) continue;
          const pad = input.padsCur[+h.device[3]];
          const rx = pad.rx || 0, ry = pad.ry || 0;
          if (B.cameraSys.mode === 'split') {
            B.cameraSys.setLook(h.idx, rx, ry);
          } else if (rx || ry) {
            // solo combined view: stick feeds the shared look offsets
            B.cameraSys.applyLook(rx * 420 * dtReal, ry * 380 * dtReal);
          }
        }
      }
      B.cameraSys.update(B.paused ? 0.0001 : dtReal, B.fighters, B.humans.map((h) => h.fighter));
      world_updateCameraRef(B);
    }
  };

  function world_updateCameraRef(B) {
    B.world.camera = B.cameraSys.mode === 'combined' ? engine.camera : null; // popups only in combined view
  }

  // ---- tab/embed visibility ----
  // Nothing used to react to this: a backgrounded tab kept stepping the match
  // and kept the music playing. In an itch-style embed the player scrolls away
  // mid-fight, so treat losing visibility exactly like walking away from the
  // machine — pause the fight, silence the audio.
  //
  // Coming back does NOT auto-resume the match. The pause screen stays up and
  // the player unpauses when they are actually looking, which is what every
  // other fighting game does and the only fair option in local multiplayer.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // mid-warm-up is not a pausable state (the loading flow owns the
      // cameras); it is time-gated and harmless to leave running.
      if (S.mode === 'battle' && S.battle && !S.battle.paused && !S.battle.loading) pauseBattle();
      audio.suspend();
      music.pause();
    } else if (!muted) {
      audio.resume();
      // the fight itself does NOT auto-resume; the soundtrack only comes back
      // if the match was left running (results screen, mid-warm-up)
      if (S.battle && !S.battle.paused) music.resume();
    }
  });

  goTitle();
  engine.start();

  // Hand off from the static boot splash in index.html once there is actually
  // something behind it — two frames, so the title screen has rendered rather
  // than merely been constructed. CSS fades it out; then it leaves the DOM.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const splash = document.getElementById('boot-splash');
    if (!splash) return;
    splash.classList.add('done');
    setTimeout(() => splash.remove(), 600);
  }));

  window.__game = { S, engine, audio, music, tick: (dt) => engine.onUpdate(dt) }; // debug hook
}
