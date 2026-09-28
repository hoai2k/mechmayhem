# Sound

Recorded effects over the synth fallback, the mix chain and its measured headroom, loops, footsteps, the arena bed, and what happens when the tab or window goes away.

These notes were the body of CLAUDE.md, which is now an index into this
folder. Each entry names the mechanism, why it is built that way, what was
measured, and the tool that checks it — most of it was learned by breaking it.

- SOUND FX ARE RECORDED NOW, and the synth is the fallback. `public/sfx/` (125
  files, 8MB of mp3) is GENERATED from `docs/SOUND_PROMPTS.md` by `node
  tools/sfxgen.mjs` — the document is the input, so each entry's prompt, take
  count and duration are parsed out of its own prose and there is no second
  copy to drift (`--dry-run`/`--tier P0`/`--only hit`/`--force`; a run skips
  what is on disk, so it never pays for the same sound twice, and
  `--transcode` re-encodes without re-generating). A recording SHADOWS the
  synthesized sound of the same name, so `play('hit')` is the only call site
  either way; nothing waits (manifest in the background, decode on first use,
  synth until then) and a name with no file keeps its synth version forever,
  which is what lets the set grow one sound at a time. `SETTINGS → SOUND FX:
  RECORDED|SYNTH` (`CONFIG.sfxSamples`, `?sfx=0`) switches it back.
  REPEATED SOUNDS ARE ONE FILE OF MANY TAKES: the generator stitches the takes
  with exact silence and `GameAudio.loadSliced` splits them back apart by RMS
  envelope, playing a different one each trigger — which is why a footstep
  never machine-guns.
  LEVELS ARE A CHAIN: the 🔊 master x the SFX VOLUME x the sound's CATEGORY in
  `CONFIG.sfxMix` (impact/movement/weapon/destruction/ui/character/surface/
  loop/ambience). Tune the balance there, never per sound.
  THE GAME IS SHIPPED AS LOUD AS IT GOES, and the number that says so is
  MEASURED. `SOUND_MASTER` (config.js) is the 🔊 button's ON level and is
  FULL; `OUTPUT_TRIM` is the last of the headroom on top of it, applied at the
  three places sound actually leaves — the post-compressor master gain, the
  soundtrack element, the arena-bed element. POST-compressor ON PURPOSE: gain
  added ahead of the limiter comes straight back as compression, which would
  squash effects against a soundtrack that never passes through it, and the
  whole point of one trim in three places is that no source can move against
  another. `node tools/scratch/headroom.mjs` is where the number comes from —
  it decodes every shipped asset (`tools/scratch/audiopeaks.mjs`) and renders
  the loudest of them through a REPLICA of audio.js' own chain, then adds the
  two media elements the graph cannot reach, because the browser sums the lot
  into one device. The worst case it builds — loudest music peak + loudest bed
  + twelve of the loudest effects on the same sample — lands at exactly 1.000
  (0 dBFS) at the shipped numbers. Re-run it after touching the mixer, the
  compressor or the audio: it prints the trim the current numbers can afford.
  NOTE Chrome's DynamicsCompressorNode applies its OWN makeup gain (+5.5 dB
  here), so the chain is nothing like the arithmetic and has to be rendered.
  A SLIDER'S 100% IS THE BALANCED DEFAULT, NOT ITS TOP. Since the mix already
  sits at the ceiling, more of one source means unbalancing it — the player's
  call — so each slider runs PAST 100% to wherever that source's own gain
  reaches unity (`MUSIC_VOL_CEIL` = 1/OUTPUT_TRIM -> 319%, `SFX_VOL_CEIL` =
  1/the loudest category -> 500% of the recorded default, 111% of the synth's).
  Both are DERIVED, so moving a default, the trim or the category mix moves the
  range, the 100% mark on the bar and the readout with it, with no edit in
  boot.js; a level saved by an older build is clamped as it is read. One press
  is 5% OF THE DEFAULT (`VOL_STEP_FRAC`), never of the range, so 0 -> 100% is
  twenty presses however far the slider goes. `node
  tools/scratch/volsliders.mjs` drives the real settings screen and asserts all
  of it (and note the presses must WAIT for the value to move: the menu reads a
  key edge once per game frame, and SwiftShader runs the title at ~2fps). THE SFX VOLUME IS
  PER SOURCE (`CONFIG.sfxVolume.samples` 0.20 / `.synth` 0.9, each persisted):
  recordings are real audio normalized to -3 dBFS and the synth is a handful
  of oscillators at a fraction of full scale, so one number cannot serve both
  — set a comfortable level for the files, switch to SYNTH and it is
  inaudible. The SETTINGS → SFX VOLUME slider reads and writes whichever
  source is in use, so flipping SOUND FX jumps it to that source's own level.
  A SOUND MAY BE LEFT TO THE SYNTH ON PURPOSE: `**SYNTH**` on a prompt's
  heading in SOUND_PROMPTS.md and sfxgen neither generates it nor puts it in
  the manifest, so audio.js never sees a recording and the procedural version
  keeps it forever. The MENU BLIPS are the worked example — a sampled click is
  a real object hitting something, and at one per cursor press that reads as
  noise where the synth's short tone reads as an interface.
  A MECH MAY HAVE ITS OWN VOICE: `<mech>_<name>` (`fenrir_taunt`,
  `saurion_hitHeavy`) plays instead of the shared sound for that mech alone.
  A TAUNT'S SOUND IS AN EVENT IN ITS CLIP, AND NOBODY WAS LISTENING: every
  `*_TAUNT` raw carries its own `{type:'sfx'}` keys, but the call that starts
  one (`animator.play('taunt')`) passed no `onEvent`, so the animator had
  nowhere to dispatch them and EVERY taunt in the game was silent — which is
  what "I tried fenrir's taunt and heard no howling" was. It passes one now,
  honouring VOICE and SHAKE only (a taunt must never deal a hit). Two clips
  also named sounds nothing could play: fenrir's fired `howl`, which could
  only ever be the shared one, and tritone's fired `roar`, which exists in
  neither the synth bank nor the recorded set; both fire `taunt` now, so each
  resolves to its own voice.
  `Fighter.sfx()` tags every sound a fighter makes with which mech made it —
  no table anywhere, dropping the file in is the whole of adding one, and a
  mech without one is byte-identical to a plain `audio.play()`.
  FOOTSTEPS ARE MEASURED, NOT SCHEDULED (`Fighter.footstepSfx`): nothing in
  the game made one until now, and there is no foot-plant event, so a step is
  the frame a sole crosses DOWN through a threshold of the same per-side
  clearance the gait's own foot rules read (`Animator.soleClearanceBySide`).
  That lands with the foot on screen at any speed, on a slope and under
  sizeMul, where a phase window drifts out of step. The SURFACE under him is a
  second quieter layer (`step_water`/`step_lava`/… off `terrain.onPatch`, the
  same lobes the hazards read).
  A TAB COMING BACK RESTORES WHAT LEAVING PAUSED, MUTED OR NOT (the
  `visibilitychange` handler in boot.js). Losing visibility pauses every player
  — the fight, both music players, the arena bed — and coming back used to skip
  the restore while 🔊 was off, which is not a volume decision at all: it left
  `playing` false on a player nothing would ever start again, since setMuted
  and `retry()` both require it. Mute, switch tabs, come back, unmute and the
  music was gone for the rest of the session (until the next trip through the
  title, which calls `startMenuMusic`) — with the element's own volume reading
  perfectly normal, because the level was restored and only the playback state
  was not. A muted player resumed here is silent anyway, so what the restore
  puts back is the INTENT. The audio CONTEXT is the one thing still gated on
  mute — a silent context may as well stay suspended — so turning the sound
  back on resumes it (`setMuted`): a mouse or a keyboard would have done it on
  the way in through `resumeAudio`, but a PAD press is neither event, and the
  effects would come back silent too. `node tools/scratch/mutetab.mjs` drives
  the whole sequence (it sets `document.hidden` itself — a headless page is
  never really backgrounded) and `node tools/scratch/tabpause.mjs` holds the
  line the handler exists for: a hidden tab still stops the soundtrack and
  suspends the context, and a PAUSED fight still does not auto-resume.
  AN UNFOCUSED WINDOW IS SILENT TOO (`applyAway` in boot.js). A window over
  the game, alt-tab, a click on another monitor: the tab stays VISIBLE, so
  visibilitychange never fires and the fight kept playing. "Away" is hidden OR
  unfocused, and it is a GATE rather than a pause: `setAway` on both music
  players and the bed, plus `audio.away` (which makes `audio.resume()` a
  no-op), silences every source WITHOUT touching `playing` — so coming back
  restarts nothing and can start nothing that was not already meant to play,
  and a bed or song begun while away simply waits. The FIGHT PAUSES on blur
  exactly as on a hidden tab (the pause screen, no auto-resume on focus — the
  player unpauses when they are back at the controls), except under the
  loading card, which is not a pausable state. Focus is tracked from blur/focus EVENTS,
  never `document.hasFocus()`, so a headless harness that never blurs plays as
  before. Nothing queues while away: every WebAudio entry point already refuses
  a context that is not `running`, and the sustained loops are restated each
  frame by `Fighter.loopSfx`, so they come back by themselves. `node
  tools/scratch/focusmute.mjs` asserts all of it.
  MUSIC TURNED OFF MUST COME BACK ON, and `MusicPlayer._applyVolume` is the ONE
  place that decides whether the <audio> element runs — it pauses a player that
  has gone inaudible AND starts one that has become audible, so `setVolume`,
  `setMuted` and `setEnabled` cannot disagree about it. It only paused, once:
  the MUSIC VOLUME slider is the game's only music on/off control (drag it to
  zero), and zero paused the element with nothing anywhere to un-pause it. It
  came back by LUCK — every click and keypress runs boot's `resumeAudio` ->
  `retry()`, which starts the element on its own — so the failure is invisible
  on a mouse or a keyboard and permanent on a GAMEPAD, which produces neither
  event. A slider move still cannot override `pause()` or `stop()`, both of
  which clear `playing` first. `node tools/scratch/musicoff.mjs` drives the
  real menus with NO gesture between silencing the music and restoring it,
  which is the only way to see it.
  A SUSTAINED STATE IS A LOOP, NOT A ONE-SHOT ON A TIMER (`audio.loop(key,
  name)`/`stopLoop`, driven by `Fighter.loopSfx`): burning (`status.burn`),
  electrocuted (the `glitched` stun) and the hover jets. Loops are keyed by
  EMITTER — two mechs burning at once are two loops, each ending with its own
  fire — and asking for a running loop is a no-op, which is what lets the
  fighter simply restate "is this still true" every frame with no start/stop
  bookkeeping to fall out of step. It runs BEFORE the state machine: frozen,
  glitched and knocked-down all return out of `update` long before the
  animation section, which is exactly where the loops were first (and so the
  shock loop never played). A loop is cut on death, `resetForRound`, teardown
  and tab-hide, because a loop whose owner stopped updating plays forever.
  `node tools/sfxloops.mjs` drives all three through their real transitions.
  THE ARENA BED (`core/ambience.js`) is one looping recording per arena
  (`amb_<theme>`), a media element rather than a WebAudio buffer — like the
  soundtrack, and so it is off the bus the combat compressor is pumping (a bed
  that ducks on every punch is exactly what a bed must not be). Judge the lot
  with `node tools/sfxprobe.mjs` (decode + slice counts + per-mech resolution)
  and `node tools/sfxlive.mjs` (drive the real menus into a real match and
  tally what actually fires).
