# src/music — the battle soundtrack

Drop an audio file in this folder and it becomes a battle song. Nothing needs
editing: the `rw-music` vite plugin (vite.config.js) lists this folder and hands
`src/core/music.js` the urls, and the FILENAME (minus its extension) is the title
shown in the game's bottom-right `NOW PLAYING` readout. Name files the way you
want players to read them. Supported: `.mp3 .ogg .m4a .wav .webm`.

These files are NOT bundled. They're copied verbatim into `dist/music/` and
streamed at runtime — a song is only downloaded when the menus prefetch the one
the next fight will open on, or when it plays.

Songs play only during fights, at the volume set by SETTINGS → MUSIC VOLUME, so
the synthesized combat SFX stay on top; the menus keep the procedural sequencer
in `src/core/audio.js`.

Turning it off:
- `?music=0` — one session, no songs fetched, procedural battle themes instead.
- `RW_NO_MUSIC=1 npm run build` — a build that ships no songs at all (~40MB
  lighter). The game falls back to the procedural themes on its own.
