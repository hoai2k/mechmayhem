# src/music/arenas — a song written for ONE arena

Drop an audio file here and NAME IT AFTER THE ARENA it belongs to, e.g.

    Jungle Temple 1.mp3
    Jungle Temple 2.mp3

and Jungle Temple plays those two — shuffled, every song once before any of
them repeats — instead of the general pool in `src/music/`. An arena with no
song in this folder is unaffected and keeps the general rotation, so this
folder can be filled in one arena at a time.

The match is on the NAME, not on a registry: punctuation, spacing and case are
ignored and a trailing track number is dropped, so `Jungle Temple 2`,
`jungle-temple`, `JungleTemple_03` and the theme's own id (`jungle`) all name
the same arena. An arena whose name ends in a number works too — SCRAPYARD 7
takes both `Scrapyard 7.mp3` and `Scrapyard 7 2.mp3`.

The arena names, as the game shows them (`src/arena/themes.js`):

    Neon District · Ironworks Foundry · Uptown Plaza · Harbor Docks
    Sky Terrace · Scrapyard 7 · Crystal Quarry · Volcanic Forge
    Frozen Outpost · Desert Ruins · Jungle Temple · Orbital Platform

Everything else works exactly as it does for `src/music/` — the filename minus
its extension is the title in the `NOW PLAYING` readout, files are streamed
rather than bundled (copied to `dist/music/arenas/`), and `?music=0` /
`RW_NO_MUSIC=1` leave them out. Supported: `.mp3 .ogg .m4a .wav .webm`.
