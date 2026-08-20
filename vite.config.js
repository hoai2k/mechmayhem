import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// (The workbenches used to SAVE through this server: POST /__rw/manifest and
// /__rw/rig wrote public/models/manifest.json and src/mechs/rigs/<id>.rig.js on
// the machine running `vite dev`, and /__rw/changes handed back the batch as a
// git patch. Removed on purpose — a write you cannot see is a write you cannot
// trust, and every tool exports its edit as readable text instead. The splicing
// formatters those endpoints used, tools/manifestfmt.mjs and tools/rigfmt.mjs,
// are still there: they are what an agent applies a pasted patch with.)

// THE BATTLE SOUNDTRACK — `src/music/*` stays OUT of the JS module graph.
//
// The songs are streamed at runtime, so nothing about them belongs in a
// bundler chunk: this plugin lists the folder and hands the game a virtual
// module of plain urls, then copies the files into `dist/music/` VERBATIM
// (no hashing — a stable url is a cacheable url). The list is read off disk
// every time the module is loaded, so dropping a song in and reloading the
// page is still all it takes to add it to the rotation.
//
// RW_NO_MUSIC=1 builds the game WITHOUT the soundtrack: no files copied, an
// empty track list, and the game falls back to its procedural battle themes.
// That's the switch for a packaged build that shouldn't carry ~40MB of audio.
//
// `src/music/arenas/` is the same thing PER ARENA: a song named for an arena
// ("Jungle Temple 1") plays on that arena instead of the general pool. It is
// listed and copied exactly like the pool — the MATCHING is core/music.js'
// business, this only says which files exist.
const MUSIC_DIR = path.resolve('src/music');
const ARENA_DIR = path.join(MUSIC_DIR, 'arenas');
const MUSIC_EXT = /\.(mp3|ogg|m4a|wav|webm)$/i;
const MUSIC_ID = 'virtual:rw-music';

function songsIn(dir) {
  if (process.env.RW_NO_MUSIC === '1') return [];
  try {
    return fs.readdirSync(dir).filter((f) => MUSIC_EXT.test(f)).sort();
  } catch (e) { return []; } // no folder — procedural themes only
}

function musicFiles() { return songsIn(MUSIC_DIR); }
function arenaFiles() { return songsIn(ARENA_DIR); }

function musicPlugin() {
  let isBuild = false;
  return {
    name: 'rw-music',
    configResolved(cfg) { isBuild = cfg.command === 'build'; },
    resolveId(id) { return id === MUSIC_ID ? '\0' + MUSIC_ID : null; },
    load(id) {
      if (id !== '\0' + MUSIC_ID) return null;
      // dev serves src/ off the project root already; a build gets its own
      // copy beside index.html (relative, so `base: './'` keeps working)
      const base = isBuild ? './music/' : '/src/music/';
      return `export const MUSIC_BASE = ${JSON.stringify(base)};\n`
        + `export const MUSIC_FILES = ${JSON.stringify(musicFiles())};\n`
        + `export const MUSIC_ARENA_BASE = ${JSON.stringify(base + 'arenas/')};\n`
        + `export const MUSIC_ARENA_FILES = ${JSON.stringify(arenaFiles())};\n`;
    },
    // Copied, not emitted: routing ~40MB of audio through rollup's asset
    // pipeline (buffer it, hash it, account it) costs a minute and a half of
    // build time to produce files it must not rename anyway.
    writeBundle(opts) {
      const copy = (src, files, dst) => {
        if (!files.length) return;
        fs.mkdirSync(dst, { recursive: true });
        for (const f of files) fs.copyFileSync(path.join(src, f), path.join(dst, f));
      };
      const dir = path.join(opts.dir || 'dist', 'music');
      copy(MUSIC_DIR, musicFiles(), dir);
      copy(ARENA_DIR, arenaFiles(), path.join(dir, 'arenas'));
    },
    // a song added/removed while the dev server runs: reload the page so the
    // virtual module is re-read
    configureServer(server) {
      const touch = (file) => {
        if (!file.startsWith(MUSIC_DIR) || !MUSIC_EXT.test(file)) return;
        const mod = server.moduleGraph.getModuleById('\0' + MUSIC_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', touch);
      server.watcher.on('unlink', touch);
    },
  };
}

// RW_DIST=1 marks a DISTRIBUTION build (tools/dist.mjs): the public artifact,
// with no authoring surface in it. Two effects — the /workbench/ page leaves
// the build inputs, and __RW_DIST__ compiles the dev routes out of the game
// entry so ?debug=..., ?showcase and the level editor are not merely unlisted
// but absent. A normal `npm run build` is unchanged and still ships both pages.
const IS_DIST = process.env.RW_DIST === '1';

export default defineConfig({
  base: './',
  plugins: [musicPlugin()],
  define: {
    __RW_DIST__: JSON.stringify(IS_DIST),
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    // three pages: the game, the visitor count at /stats/, and the workbenches
    // at /workbench/. The first two ship in every build — /stats is public,
    // it is what the game's own audience is offered — while the workbench is
    // the authoring surface a DIST build leaves out. They share the engine
    // chunks; the workbench is the same code with different UI on top.
    rollupOptions: {
      input: IS_DIST ? {
        main: path.resolve('index.html'),
        stats: path.resolve('stats/index.html'),
      } : {
        main: path.resolve('index.html'),
        stats: path.resolve('stats/index.html'),
        workbench: path.resolve('workbench/index.html'),
      },
    },
  },
  server: {
    host: true,
  },
});
