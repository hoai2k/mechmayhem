# `public/sound/` — the two streamed audio files

This folder is NOT the sound-effect bank. It holds the two named audio files
the game fetches by URL rather than through the `public/sfx/` manifest:

| file | what | played by |
|---|---|---|
| `Bohemian Cello Flame Hybrid Suite.mp3` | the menu theme, looped behind the title and select screens | `MENU_TRACKS` in `src/core/music.js`, via the `menuMusic` player in `boot.js` |
| `neon_buzz.mp3` | the neon-sign buzz on the menu backdrop | `audio.loadSliced('neonBuzz', …)` from `src/ui/menus.js` / `boot.js` (`CONFIG.neonBuzzVolume` is the dial, `?neonbuzz=0` off) |

They reach the ear by different routes, and that is deliberate. The menu theme
is a **media element**, like the soundtrack, so it sits off the bus the combat
compressor is pumping and does not duck on every punch; it plays at a SHARE of
the music volume (`CONFIG.menuMusicMix`) because a screen you read and talk
over wants less than a fight does, and if the file 404s or fails to decode the
procedural sequencer's `menu` pattern takes over. The buzz is an ordinary
**WebAudio** sound — one long take that `loadSliced` splits by RMS envelope and
plays a different slice of each trigger, so it never loops audibly.

## Where the other audio lives

- **Sound effects and arena ambience** — `public/sfx/` (generated from
  `docs/SOUND_PROMPTS.md` by `node tools/sfxgen.mjs`). A recording there
  shadows the synthesized sound of the same name.
- **The battle soundtrack** — `src/music/`, with `src/music/arenas/` holding
  songs that belong to one arena. Listed by the `rw-music` Vite plugin and
  copied to `dist/music/` — streamed, not bundled.

See [ASSETS.md](../../ASSETS.md) for the rule that decides which directory any
asset belongs in.
