// Game boot: owns the engine, audio, input and the screen state machine.
// Title → Setup → Mech Select → Arena Select → Battle → Results → loop.
import * as THREE from 'three';
import { Engine } from '../core/engine.js';
import { Input } from './input.js';
import { THEMES, THEMES_BY_ID, themePropNames } from '../arena/themes.js';
import { resolveArenaTheme } from '../arena/authored.js';
import { ROSTER_BY_ID, playableRoster } from '../mechs/roster.js';
import { applyColorScheme, SCHEME_COUNT } from '../mechs/colorscheme.js';
import { Fighter } from '../combat/fighter.js';
import { AIController } from './ai.js';
import { Match } from './match.js';
import { Hud, toast } from '../ui/hud.js';
import { TitleScreen, MechSelectScreen, ArenaSelectScreen, PauseScreen, ResultsScreen, SettingsScreen, playNeonBuzz } from '../ui/menus.js';
import { installKnobs, warnUnknownParams } from '../core/knobs.js';
import { checkDeclaredAssetsOnce } from '../core/assetcheck.js';
import { InstructionsScreen } from '../ui/instructions.js';
import {
  CONFIG, setShowAllRobots, setReverseCameraY, setSfxSamples, setSfxVolume, sfxVolume,
  setArenaDesign, ARENA_DESIGN_MODES,
  setRoundTime, ROUND_MIN, ROUND_MAX, ROUND_STEP,
  setSplitPostFx, SPLIT_POST_MODES,
  SOUND_MASTER, SYNTH_MUSIC_MIX,
} from '../core/config.js';
import { t } from '../core/text.js';
import { GameAudio } from '../core/audio.js';
import { MusicPlayer, MENU_TRACKS } from '../core/music.js';
import { Ambience } from '../core/ambience.js';
import { NowPlaying } from '../ui/nowplaying.js';
import { Predictor } from './predict.js';
import { createMech, preloadMechModels, loadManifest, is3dMode } from '../mechs/gltf.js';
import { preloadPropModels } from '../arena/propglb.js';
import { preloadBuildingModels } from '../arena/buildglb.js';
import { TouchControls, installTouchZoomGuards } from './touch.js';
import { isTouchDevice } from '../core/utils.js';
import { MenuStage } from './menustage.js';
import { PadPointers } from './padpointers.js';
import { Warmup } from './warmup.js';
import { createBattle, rebuildArena } from './battle.js';

export async function bootGame() {
  const engine = new Engine(document.getElementById('game-canvas'));
  const input = new Input();
  const uiRoot = document.getElementById('ui-root');

  // say so if a texture the data names has gone missing (a move, a rename,
  // a folder in the wrong place) — otherwise it just renders procedural
  checkDeclaredAssetsOnce();

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
  // Building donors (Tripo GLBs) warm in the background — any arena built
  // before they land keeps its procedural massing. The arena PROPS are not
  // warmed here: which of them are wanted depends on the theme, and that is
  // not known until a battle starts (see startBattle).
  preloadBuildingModels();

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
  // the menus open BEFORE any gesture, and autoplay policy rejects a media
  // element until there has been one — so the first click/keypress asks the
  // menu theme to play again (a no-op if it already is)
  const resumeAudio = () => { audio.resume(); if (S?.mode !== 'battle') menuMusic?.retry(); };
  window.addEventListener('pointerdown', resumeAudio);
  window.addEventListener('keydown', resumeAudio);

  // ---- battle soundtrack: the songs in src/music/ (see core/music.js). The
  // menus keep the procedural sequencer; a fight plays a random song, named in
  // the bottom-right readout, whose icon turns the music off without touching
  // the combat SFX. Falls back to the sequencer's theme track if src/music/ is
  // empty or <audio> is unavailable.
  const music = new MusicPlayer();
  const nowPlaying = new NowPlaying(uiRoot, music);

  // ---- menu theme: the recorded track in public/sound/, looped behind the
  // title and select screens. The procedural sequencer's `menu` pattern is
  // the FALLBACK — it plays whenever this file can't (no <audio>, missing
  // asset, or a RW_NO_MUSIC build, which empties the track list).
  const menuMusic = new MusicPlayer({ tracks: MENU_TRACKS, loop: true, menu: true });
  // a missing/undecodable file must not leave the menus silent: the sequencer
  // takes over the moment the element gives up on it
  menuMusic.el?.addEventListener('error', () => {
    menuMusic.stop();
    if (S.mode !== 'battle') audio.music('menu');
  });
  function startMenuMusic() {
    if (menuMusic.available) { audio.stopMusic(); menuMusic.resume(); }
    else audio.music('menu');
  }
  function stopMenuMusic() { menuMusic.stop(); }

  // ---- the arena bed (core/ambience.js): one looping recording per arena,
  // under the fight. The manifest for the recorded SFX set is pulled down
  // here too — nothing waits on either, and a sound with no file keeps its
  // synthesized version (see core/audio.js).
  const ambience = new Ambience(audio);
  audio.loadSfxBank?.();

  // ---- idle prefetch (game/predict.js): while the player reads the title
  // screen and picks a robot, pull down what the fight is about to need. The
  // RANDOM arena, the RANDOM robots and the first song are pre-ROLLED here and
  // CONSUMED by the menus, so what gets downloaded is what actually plays.
  const predictor = new Predictor({ music });
  // mouse / touch / wheel never reach menuEvents (the screens own their own
  // DOM handlers), so park the prefetcher straight off the raw events too
  for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown']) {
    window.addEventListener(ev, () => predictor.nudge(), { passive: true });
  }

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
    // ONE MASTER, three buses under it (config.js SOUND_MASTER). The <audio>
    // soundtrack is NOT one of them — it carries its own gain, which is why
    // moving the master means moving MUSIC_VOL_DEFAULT with it or the mix
    // shifts under the change.
    audio.setSfxVolume(muted ? 0 : SOUND_MASTER);
    audio.setMusicVolume(muted ? 0 : SOUND_MASTER * SYNTH_MUSIC_MIX);
    music.setMuted(muted);
    menuMusic.setMuted(muted);
    ambience.setMaster(muted ? 0 : SOUND_MASTER);
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
  // 0..1 as ten blocks between dim ←→ chevrons (which say "this one adjusts"
  // without competing with the menu's own cyan selection arrows) — the whole
  // slider readout, no extra DOM
  const volBar = (v) => {
    const n = Math.round(v * 10);
    const dim = (c) => `<span style="opacity:0.4;font-size:0.8em">${c}</span>`;
    return dim('\u25c4') + `<span style="letter-spacing:0.06em;margin:0 0.35em">`
      + `${'\u2588'.repeat(n)}${'\u2591'.repeat(10 - n)}</span>` + dim('\u25ba');
  };
  // SOUND: ON/OFF is not here — the speaker button beside the gear is the one
  // control for it, and MUSIC: ON/OFF was a second mute for the same bus that
  // the volume slider already reaches (drag it to zero). The volume slider
  // turns the players back on if they were off, so nothing is unreachable.
  const settingsItems = () => [
    ...(music.available || menuMusic.available
      ? [{
        // ←→ drags the music bus alone; SOUND: OFF still silences everything
        label: () => t('settings.musicVol', {
          bar: volBar(music.volume),
          pct: Math.round(music.volume * 100),
        }),
        slide: (d) => {
          const v = Math.min(1, Math.max(0, Math.round(music.volume * 20 + d) / 20));
          music.setVolume(v);           // CONFIG.musicVolume is the shared bus…
          menuMusic.setVolume(v);       // …but each element's gain is its own
          if (!music.enabled && v > 0) { music.setEnabled(true); menuMusic.setEnabled(true); }
        },
      }]
      : []),
    {
      // ←→ sets the round clock in seconds; takes effect from the next round
      label: () => t('settings.roundTime', {
        bar: volBar((CONFIG.roundTime - ROUND_MIN) / (ROUND_MAX - ROUND_MIN)),
        secs: CONFIG.roundTime,
      }),
      slide: (d) => setRoundTime(CONFIG.roundTime + d * ROUND_STEP),
    },
    {
      // ←→ the effects bed, under the 🔊 master. PER SOURCE: recordings and
      // the synth sit at wildly different levels, so this reads and writes
      // whichever one is playing — flip SOUND FX below and the slider jumps
      // to that source's own remembered level.
      label: () => t('settings.sfxVol', {
        bar: volBar(sfxVolume()),
        pct: Math.round(sfxVolume() * 100),
      }),
      slide: (d) => {
        setSfxVolume(Math.min(1, Math.max(0, Math.round(sfxVolume() * 20 + d) / 20)));
        ambience.refresh();
        audio.play('uiMove');       // hear the level you are setting
      },
    },
    {
      // RECORDED sound FX (public/sfx/) or the procedural synth in
      // core/audio.js. Anything the recorded set doesn't cover keeps its
      // synthesized version either way, so this is not an all-or-nothing swap.
      label: () => t(CONFIG.sfxSamples ? 'settings.sfx.on' : 'settings.sfx.off'),
      fn: () => { setSfxSamples(!CONFIG.sfxSamples); ambience.refresh(); },
    },
    {
      // which way the right stick pitches the battle camera (camera.js)
      label: () => t(CONFIG.reverseCameraY ? 'settings.reverseCamY.on' : 'settings.reverseCamY.off'),
      fn: () => setReverseCameraY(!CONFIG.reverseCameraY),
    },
    {
      // split-screen post FX (bloom / distance haze / FXAA). DEFAULT runs
      // them and drops them for the session if the frame rate actually
      // suffers — the line says so when that has happened.
      label: () => {
        const m = CONFIG.splitPostFx;
        if (m === 'auto') {
          return t(engine.splitPostAutoDropped()
            ? 'settings.splitFx.autoOff' : 'settings.splitFx.auto');
        }
        return t(m === 'on' ? 'settings.splitFx.on' : 'settings.splitFx.off');
      },
      fn: () => {
        const next = SPLIT_POST_MODES[
          (SPLIT_POST_MODES.indexOf(CONFIG.splitPostFx) + 1) % SPLIT_POST_MODES.length];
        setSplitPostFx(next);
        engine.resetSplitPostWatch();
      },
    },
    {
      // work-in-progress mechs (roster `hidden`) join the game roster; the
      // workbenches (?showcase, ?rigedit, ?battle=...) always show them
      label: () => t(CONFIG.showAllRobots ? 'settings.showAllRobots.on' : 'settings.showAllRobots.off'),
      fn: () => setShowAllRobots(!CONFIG.showAllRobots),
    },
    {
      // which design system lays out each match's arena (src/arena/designs/).
      // AUTHORED plays the hand-built levels where they exist and hands every
      // other arena to the default system; CITY WARDS / GRAND AXIS /
      // COLOSSEUM generate EVERY arena fresh with that system; FALLBACK is
      // the original scatter generator, kept reachable forever.
      label: () => t(`settings.arenaDesign.${CONFIG.arenaDesign}`),
      fn: () => setArenaDesign(ARENA_DESIGN_MODES[
        (ARENA_DESIGN_MODES.indexOf(CONFIG.arenaDesign) + 1) % ARENA_DESIGN_MODES.length]),
    },
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

  // A REFUSAL IS NOT AN ERROR. Both of these return a PROMISE, and the request
  // is rejected whenever the call has no TRANSIENT USER ACTIVATION behind it —
  // which is every request made from POLLED input, the gamepad included, since
  // the Gamepad API is state rather than events. The title screen asks on the
  // player's behalf (menus.js TitleScreen) and must not print a stack trace at
  // them when the browser says no, so the rejection is swallowed here rather
  // than at each call site.
  function toggleFullscreen() {
    const p = document.fullscreenElement
      ? document.exitFullscreen?.()
      : document.documentElement.requestFullscreen?.();
    p?.catch?.(() => {});
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
    // any menu input parks the background prefetcher for a beat (predict.js
    // nudge) — the player flipping through robots gets a quiet machine, and
    // the loading resumes once they settle
    if (ev && (ev.any || ev.up || ev.down || ev.left || ev.right ||
               ev.confirm || ev.back || ev.lb || ev.rb)) predictor.nudge();
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
    startMenuMusic();
    predictor.start();
    setScreen(new TitleScreen(uiRoot, {
      audio, hotButtons,
      onPlay: () => goMechSelect(),
      onFullscreen: toggleFullscreen,
    }));
    // The title screen's own content is up; the next thing anyone will look
    // at is the select screen, so pull its art down NOW — every poster and
    // every roster badge, ahead of anything the fight will need. They are
    // small, there are a lot of them, and they are all on screen the instant
    // that screen opens.
    predictor.warmMenuArt(playableRoster().map((m) => m.id));
  }

  // The mechs either side of each cursor, in roster order — what the next
  // press of LEFT or RIGHT will land on.
  function neighbourIds(entries) {
    const roster = playableRoster();
    const out = new Set();
    for (const e of entries || []) {
      const i = roster.findIndex((m) => m.id === e.id);
      if (i < 0) continue;
      for (const d of [-2, -1, 1, 2]) {
        const m = roster[(i + d + roster.length * 2) % roster.length];
        if (m) out.add(m.id);
      }
    }
    return [...out];
  }

  function goMechSelect() {
    ensureStage('lineup');
    S.mode = 'mechselect';
    predictor.start(S.picks || []);
    setScreen(new MechSelectScreen(uiRoot, {
      input, audio, hotButtons, prev: S.slots,
      onPreview: (entries) => {
        S.stage?.showPreviews(entries);
        // ...and warm what a cursor is most likely to land on next. Players
        // flip, so the neighbours either side of each cursor are the best
        // guess going, and they queue ahead of the fight's own assets.
        predictor.warmNeighbours(neighbourIds(entries));
      },
      onLockFx: (slotIdx) => S.stage?.lockFx(slotIdx),
      onYaw: (slotIdx, d) => S.stage?.setYaw(slotIdx, d),
      onDone: (picks, variants, slots) => { S.picks = picks; S.variants = variants; S.slots = slots; goArenaSelect(); },
      onBack: () => goTitle(),
    }));
  }

  function goArenaSelect() {
    S.mode = 'arenaselect';
    preloadMechModels(S.picks.filter((p) => p && p !== 'random')); // warm GLB cache while browsing arenas
    predictor.start(S.picks || []);
    setScreen(new ArenaSelectScreen(uiRoot, {
      audio,
      // the RANDOM tile lands on the arena the prefetcher has been loading
      pickRandom: () => predictor.takeArena(),
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
    // from here every spare cycle belongs to the fight, not to a guess
    predictor.stop();
    setScreen(null);
    S.stage?.destroy();
    S.stage = null;
    resetScene();
    S.mode = 'battle';

    // An arena with a hand-built level plays it; everything else is generated
    // from its recipe. Resolved BEFORE the prop warm-up below, since it is the
    // authored level that says which props this city actually places.
    const theme = await resolveArenaTheme(THEMES_BY_ID[S.themeId]);
    // Warm the prop GLBs THIS arena places — one to three models, not the
    // whole set, so the wait is short and nothing downloads for an arena the
    // player never picked. Never a hard gate: the procedural props always
    // work, and anything still in flight when the timeout fires simply stays
    // procedural for this match.
    await Promise.race([
      Promise.all([preloadPropModels(themePropNames(theme)), preloadBuildingModels()]),
      new Promise((r) => setTimeout(r, 8000)),
    ]);
    // shared world/arena/camera wiring (arenaObjs = everything the arena
    // adds, hidden behind the warm-up's neutral backdrop and revealed
    // fully-warmed later)
    let { world, arena, arenaObjs, cameraSys } = createBattle(engine, {
      theme, audio, input, seed: (Math.random() * 9999) | 0,
    });

    const active = [];
    S.slots.forEach((s, i) => { if (s.kind !== 'off') active.push({ slot: s, slotIdx: i }); });
    const spawns = arena.spawnPoints(active.length);
    const fighters = [], humans = [], ais = [];
    // build mechs up-front: GLB-backed where the model manifest has one.
    // Each fighter wears its chosen paint scheme; anyone sharing a mech id
    // with an identical scheme (e.g. random AI picks) gets auto-bumped.
    const taken = active.map((a) => S.picks[a.slotIdx]).filter((p) => p && p !== 'random');
    const defs = active.map((a) => {
      const roster = playableRoster();
      const base = ROSTER_BY_ID[S.picks[a.slotIdx]]
        // RANDOM slot: take the robot the prefetcher pre-rolled (and whose
        // model it has been downloading since the menus)
        || ROSTER_BY_ID[predictor.takeMech(new Set(taken))] || roster[(Math.random() * roster.length) | 0];
      taken.push(base.id);
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
      engine, world, fighters, hud, humans: humans.length,
      onEnd: (winner) => {
        S.mode = 'results';
        touchControls?.setVisible(false);
        // rematch/back-to-select is a menu again: get ahead of the NEXT fight
        predictor.start(S.picks || []);
        setScreen(new ResultsScreen(uiRoot, {
          winner, audio,
          onRematch: () => { predictor.stop(); setScreen(null); match.begin(); S.mode = 'battle'; },
          onChangeMechs: () => { teardownBattle(); ensureStage(); goMechSelect(); },
          onMenu: () => goTitle(),
        }));
      },
    });

    // ---- RANDOM roster picks: a fresh robot is dealt every round ----
    const randomIdx = active
      .map((a, i) => (S.picks[a.slotIdx] === 'random' ? i : -1))
      .filter((i) => i >= 0);
    // ---- A NEW ARENA EVERY ROUND ----------------------------------------
    // A best-of-three in one city is three fights on one stage; the arenas are
    // half the game's content and a round change is the one moment there is
    // room to swap one. The next arena is RESOLVED AND PRELOADED while the
    // current round is being fought (an authored level is a fetch, and so are
    // the prop models it places), so the swap itself is synchronous and lands
    // in the round-end pause — and if it is not ready in time, the round simply
    // opens in the arena it was already in.
    let nextTheme = null, prepping = false;
    function prepareNextArena() {
      if (prepping || !CONFIG.arenaPerRound) return;
      prepping = true;
      const here = S.battle?.arena?.theme?.id;
      const pool = THEMES.filter((t) => t.id !== here);
      const pick = pool[(Math.random() * pool.length) | 0] || THEMES[0];
      resolveArenaTheme(pick)
        .then(async (rt) => {
          await Promise.race([
            preloadPropModels(themePropNames(rt)),
            new Promise((r) => setTimeout(r, 6000)),
          ]);
          nextTheme = rt;
        })
        .catch(() => { /* keep the arena we have */ })
        .finally(() => { prepping = false; });
    }

    match.onRoundStart = (round) => {
      if (round >= 2 && CONFIG.arenaPerRound && nextTheme) {
        const t2 = nextTheme;
        nextTheme = null;
        const built = rebuildArena(engine, world, t2, (Math.random() * 9999) | 0);
        arena = built.arena;
        arenaObjs = built.arenaObjs;
        if (S.battle) { S.battle.arena = arena; S.battle.arenaObjs = arenaObjs; }
        cameraSys.init = false;          // reframe on the new stage
        for (const ch of cameraSys.chase) ch.init = false;
        music.setArena(t2);              // …and its own songs, if it has any
        hud.announce(t2.name, true);
      }
      prepareNextArena();                // …the one after this
      if (round < 2 || !randomIdx.length) return;
      for (const i of randomIdx) {
        const old = fighters[i];
        const exclude = new Set(fighters.filter((f) => f !== old).map((f) => f.def.id));
        const roster = playableRoster();
        const pool = roster.filter((m) => !exclude.has(m.id));
        const src = pool.length ? pool : roster;
        const base = ROSTER_BY_ID[predictor.takeMech(exclude)] || src[(Math.random() * src.length) | 0];
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
    stopMenuMusic();
    ambience.setArena(theme.id);   // this arena's own bed, under the fight
    // this arena's own songs (src/music/arenas/) if it has any, else the
    // general pool — set BEFORE start(), which plays whatever is pre-rolled
    music.setArena(theme);
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
    ambience.stop();
    audio.stopAllLoops?.();   // a loop whose owner is gone plays forever
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
    ambience.pause();
    setScreen(new PauseScreen(uiRoot, {
      audio, hotButtons,
      onResume: () => { S.battle.paused = false; setScreen(null); music.resume(); ambience.resume(); if (S.battle.usesTouch) touchControls?.setVisible(true); },
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
            // the warm-up screen has its own per-fighter camera, so it owns
            // the control frame while it is up (see Warmup.inputYawFor)
            const camYaw = (B.loading ? warmup.inputYawFor(B, h.fighter) : null)
              ?? B.cameraSys.inputYawFor(h.fighter, h.idx);
            input.readIntent(h.device, h.fighter.intent, camYaw);
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
          // left-stick CLICK = camera adjust: the vertical axis zooms the
          // view in/out (forward = in) instead of pitching it
          const adjust = input.padHeld(+h.device[3], 'LS');
          // ---- WHO GETS THE RIGHT STICK: the camera, or the crosshair ----
          // While the aim is up (target lock, or LB-held sniper mode) the stick
          // is an AIMING control — that is the whole point of it: you steer the
          // shot to where the target is GOING, and the camera follows the aim
          // (camera.js frames the aim point) instead of being framed by hand.
          //   · TARGETING (a lock, no scope) — X leads the crosshair and the
          //     orbit follows it; Y IS STILL THE CAMERA'S. Being able to raise
          //     and lower the view is how you see the fight past your own robot,
          //     and taking that stick for a vertical lead is what left the
          //     camera stuck behind his back with the enemy hidden.
          //   · SNIPER — the view IS the aim (almost first person, down the
          //     barrel), so BOTH axes are the aim's: X switches targets and
          //     leads, Y pitches the shot.
          // camera-ADJUST (LS click, the zoom) always outranks it: it is how a
          // player changes the framing, and it never aims.
          const f = h.fighter;
          const aiming = f.aiming && !adjust;
          const scoped = aiming && !!f.intent.sniper;
          if (aiming) {
            const inp = f.aimIn || (f.aimIn = { x: 0, y: 0 });
            inp.x = (f.aimTarget || f.lockTarget) ? rx : 0;
            inp.y = scoped ? ry : 0;
          }
          const camX = aiming && (f.aimTarget || f.lockTarget) ? 0 : rx;
          const camY = scoped ? 0 : ry;
          if (B.cameraSys.mode === 'split') {
            B.cameraSys.setLook(h.idx, camX, camY, adjust);
          } else if (camX || camY) {
            B.cameraSys.applyStick(camX, camY, dtReal, adjust);
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
      menuMusic.pause();
      ambience.pause();
    } else if (!muted) {
      audio.resume();
      if (S.mode !== 'battle') menuMusic.resume();
      // the fight itself does NOT auto-resume; the soundtrack only comes back
      // if the match was left running (results screen, mid-warm-up)
      if (S.battle && !S.battle.paused) { music.resume(); ambience.resume(); }
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

  window.__game = { S, engine, input, audio, music, menuMusic, ambience, predictor, tick: (dt) => engine.onUpdate(dt) }; // debug hook
  // A mistyped switch says so instead of looking like a dead knob, and every
  // tuning value is reachable live as `rw` (see core/knobs.js).
  warnUnknownParams();
  installKnobs({
    // fire the title sign's flicker on demand: judging a 66ms sound that comes
    // round every couple of seconds at a random depth is not judging at all
    buzz(n = 3) {
      audio.loadSliced?.('neonBuzz', new URL('sound/neon_buzz.mp3', document.baseURI).href);
      for (let i = 0; i < n; i++) setTimeout(() => playNeonBuzz(audio, 0.25), i * 420);
      return `neonBuzzVolume ${CONFIG.neonBuzzVolume} -> vol ${playNeonBuzz(audio, 0.25).toFixed(4)}`;
    },
  });
}
