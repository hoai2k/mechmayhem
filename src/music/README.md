# src/music — the battle soundtrack

Drop an audio file in this folder and it becomes a battle song. Nothing needs
editing: `src/core/music.js` globs `*.{mp3,ogg,m4a,wav,webm}` at build time, and
the FILENAME (minus its extension) is the title shown in the game's bottom-right
`NOW PLAYING` readout. Name files the way you want players to read them.

Songs play only during fights, at a low fixed volume so the synthesized combat
SFX stay on top; the menus keep the procedural sequencer in `src/core/audio.js`.
